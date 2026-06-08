// Batch tray — accumulates per-element edits as badges, then sends them together.
// Lives independently of the inspector's active/inactive state and the card, so you
// can collect tweaks across several elements (even toggling the inspector off) and
// send the whole page's change-set in one go. Each entry carries its component path,
// note, CSS/token diff, screenshot, and (lgtm) project.
const LGTMTray = (() => {
  'use strict';

  let entries = [];
  let seq = 0;
  let collapsed = true;
  let onSendCb = null;
  let onEditCb = null;
  let rootEl = null;

  const STYLES = `
#__lgtm_tray__{position:fixed;right:16px;bottom:16px;z-index:2147483646;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:13px;color:#1a1a1a;cursor:default;user-select:none}
#__lgtm_tray__ .__lgtrpill{display:inline-flex;align-items:center;gap:7px;background:#3b82f6;color:#fff;border-radius:999px;padding:8px 14px;box-shadow:0 4px 16px rgba(0,0,0,.22);cursor:pointer;font-weight:500}
#__lgtm_tray__ .__lgtrpill .__lgtrn{background:rgba(255,255,255,.25);border-radius:999px;padding:0 7px;font-size:12px;line-height:18px;min-width:18px;text-align:center}
#__lgtm_tray__ .__lgtrpanel{width:300px;background:#fff;border:1px solid rgba(0,0,0,.13);border-radius:10px;box-shadow:0 8px 32px rgba(0,0,0,.2);overflow:hidden}
#__lgtm_tray__ .__lgtrhd{display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border-bottom:1px solid #eef2f7;font-weight:600}
#__lgtm_tray__ .__lgtrhd button{border:none;background:transparent;color:#94a3b8;font-size:15px;cursor:pointer;line-height:1;padding:2px 4px}
#__lgtm_tray__ .__lgtrlist{max-height:230px;overflow-y:auto;padding:4px 0}
#__lgtm_tray__ .__lgtrit{display:flex;align-items:flex-start;gap:8px;padding:7px 12px}
#__lgtm_tray__ .__lgtrit:hover{background:#f8fafc}
#__lgtm_tray__ .__lgtridx{flex:0 0 auto;color:#94a3b8;font-variant-numeric:tabular-nums}
#__lgtm_tray__ .__lgtrbody{flex:1;min-width:0;cursor:pointer}
#__lgtm_tray__ .__lgtrit:hover .__lgtrpath{color:#3b82f6}
#__lgtm_tray__ .__lgtrpath{font-size:12px;color:#1a1a1a;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#__lgtm_tray__ .__lgtrsum{font-size:11px;color:#64748b;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#__lgtm_tray__ .__lgtrx{flex:0 0 auto;border:none;background:transparent;color:#cbd5e1;cursor:pointer;font-size:14px;line-height:1;padding:0 2px}
#__lgtm_tray__ .__lgtrx:hover{color:#ef4444}
#__lgtm_tray__ .__lgtrft{display:flex;gap:8px;padding:10px 12px;border-top:1px solid #eef2f7}
#__lgtm_tray__ .__lgtrb{border:none;border-radius:6px;padding:7px 12px;font-size:13px;font-family:inherit;cursor:pointer;font-weight:500}
#__lgtm_tray__ .__lgtrclear{background:transparent;color:#64748b;border:1px solid #e2e8f0}
#__lgtm_tray__ .__lgtrsend{flex:1;background:#3b82f6;color:#fff}
#__lgtm_tray__ .__lgtrb:hover{opacity:.85}
#__lgtm_tray__ .__lgtrst{font-size:12px;text-align:center;padding:6px 12px;display:none}
#__lgtm_tray__ .__lgtrst-ok{color:#16a34a;background:#dcfce7}
#__lgtm_tray__ .__lgtrst-err{color:#dc2626;background:#fee2e2}
@media(prefers-color-scheme:dark){#__lgtm_tray__{color:#f1f5f9}#__lgtm_tray__ .__lgtrpanel{background:#1e293b;border-color:rgba(255,255,255,.12)}#__lgtm_tray__ .__lgtrhd{border-color:rgba(255,255,255,.08)}#__lgtm_tray__ .__lgtrit:hover{background:rgba(255,255,255,.04)}#__lgtm_tray__ .__lgtrpath{color:#f1f5f9}#__lgtm_tray__ .__lgtrft{border-color:rgba(255,255,255,.08)}#__lgtm_tray__ .__lgtrclear{color:#94a3b8;border-color:rgba(255,255,255,.18)}}
  `;

  function injectStyles() {
    if (document.getElementById('__lgtm_tray_style__')) return;
    const s = document.createElement('style');
    s.id = '__lgtm_tray_style__';
    s.textContent = STYLES;
    document.documentElement.appendChild(s);
  }

  function esc(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function init({ onSend, onEdit }) {
    onSendCb = onSend;
    onEditCb = onEdit;
  }

  function isLGTM() { return LGTM_CONFIG.BUILD_TARGET === 'lgtm'; }

  function summary(entry) {
    const lgtm = isLGTM();
    if (entry.text) return entry.text;
    const n = (entry.styleEdits || []).length;
    if (n) return lgtm ? `${n}件のスタイル変更` : `${n} style change${n > 1 ? 's' : ''}`;
    return lgtm ? '（メモなし）' : '(no note)';
  }

  function add(entry) {
    entry.id = ++seq;
    entries.push(entry);
    collapsed = false; // pop open so the user sees it land
    render();
  }

  function remove(id) {
    entries = entries.filter(e => e.id !== id);
    render();
  }

  // Replace an entry in place (edit mode), keeping its id and list position.
  function replace(id, entry) {
    const idx = entries.findIndex(e => e.id === id);
    if (idx < 0) { add(entry); return; }
    entry.id = id;
    entries[idx] = entry;
    render();
  }

  function clear() {
    entries = [];
    render();
  }

  function getEntries() { return entries.slice(); }

  function showStatus(message, type) {
    if (!rootEl) return;
    const st = rootEl.querySelector('.__lgtrst');
    if (!st) return;
    st.textContent = message;
    st.className = '__lgtrst __lgtrst-' + (type === 'success' ? 'ok' : 'err');
    st.style.display = 'block';
  }

  // Re-enable the send button after a failed batch (without clearing the status line).
  function resetSend() {
    if (!rootEl) return;
    const b = rootEl.querySelector('.__lgtrsend');
    if (b) {
      b.disabled = false;
      b.textContent = isLGTM() ? `まとめて送信 (${entries.length})` : `Copy all (${entries.length})`;
    }
  }

  function ensureRoot() {
    if (rootEl) return;
    injectStyles();
    rootEl = document.createElement('div');
    rootEl.id = '__lgtm_tray__';
    document.documentElement.appendChild(rootEl);
  }

  function render() {
    if (entries.length === 0) {
      if (rootEl) { rootEl.remove(); rootEl = null; }
      return;
    }
    ensureRoot();
    const lgtm = isLGTM();
    const n = entries.length;

    if (collapsed) {
      rootEl.innerHTML = `<div class="__lgtrpill"><span>📋 ${lgtm ? '編集リスト' : 'Edits'}</span><span class="__lgtrn">${n}</span></div>`;
      rootEl.querySelector('.__lgtrpill').addEventListener('click', () => { collapsed = false; render(); });
      return;
    }

    const items = entries.map((e, i) => `
      <div class="__lgtrit" data-id="${e.id}">
        <span class="__lgtridx">${i + 1}</span>
        <div class="__lgtrbody" data-id="${e.id}" title="${lgtm ? 'クリックで編集' : 'Click to edit'}">
          <div class="__lgtrpath">📍 ${esc(e.path)}</div>
          <div class="__lgtrsum">${esc(summary(e))}</div>
        </div>
        <button class="__lgtrx" data-id="${e.id}" title="${lgtm ? '削除' : 'Remove'}">✕</button>
      </div>`).join('');

    rootEl.innerHTML = `
      <div class="__lgtrpanel">
        <div class="__lgtrhd">
          <span>${lgtm ? '編集リスト' : 'Edits'} (${n})</span>
          <button class="__lgtrcollapse" title="${lgtm ? '閉じる' : 'Collapse'}">—</button>
        </div>
        <div class="__lgtrlist">${items}</div>
        <div class="__lgtrst"></div>
        <div class="__lgtrft">
          <button class="__lgtrb __lgtrclear">${lgtm ? 'クリア' : 'Clear'}</button>
          <button class="__lgtrb __lgtrsend">${lgtm ? `まとめて送信 (${n})` : `Copy all (${n})`}</button>
        </div>
      </div>`;

    rootEl.querySelector('.__lgtrcollapse').addEventListener('click', () => { collapsed = true; render(); });
    rootEl.querySelector('.__lgtrclear').addEventListener('click', () => clear());
    rootEl.querySelectorAll('.__lgtrx').forEach(b =>
      b.addEventListener('click', () => remove(Number(b.getAttribute('data-id')))));
    rootEl.querySelectorAll('.__lgtrbody').forEach(b =>
      b.addEventListener('click', () => {
        const entry = entries.find(e => e.id === Number(b.getAttribute('data-id')));
        if (entry && onEditCb) onEditCb(entry);
      }));

    const sendBtn = rootEl.querySelector('.__lgtrsend');
    sendBtn.addEventListener('click', () => {
      if (!onSendCb || entries.length === 0) return;
      sendBtn.disabled = true;
      sendBtn.textContent = lgtm ? '送信中...' : 'Copying...';
      onSendCb(getEntries());
    });
  }

  // Serialize all entries into one combined instruction for Claude Code.
  // Screenshots are handled by the adapter (saved-to-disk paths for standalone,
  // attached image for lgtm), not inlined here.
  function formatBatch(entries, { isLGTM: lgtm } = {}) {
    const url = (entries[0] && entries[0].sourceURL) || window.location.href;
    const head = lgtm ? `ページの変更 ${entries.length}件` : `Page edits (${entries.length})`;
    const blocks = entries.map((e, i) => {
      const lines = [`[${i + 1}] ${e.path}`];
      if (e.text) lines.push(e.text);
      const diff = LGTMStyler.formatEdits(e.styleEdits, { isLGTM: lgtm });
      if (diff) lines.push(diff);
      return lines.join('\n');
    });
    return `${head} — ${url}\n\n` + blocks.join('\n\n');
  }

  return { init, add, remove, replace, clear, getEntries, showStatus, resetSend, formatBatch };
})();
