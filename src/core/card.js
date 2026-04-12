// Annotation card UI
const LGTMCard = (() => {
  'use strict';

  let cardEl = null;
  let onSubmitCb = null;
  let onCancelCb = null;

  const STYLES = `
#__lgtm_card__{position:fixed;z-index:2147483647;width:320px;background:#fff;border:1px solid rgba(0,0,0,.13);border-radius:10px;box-shadow:0 8px 32px rgba(0,0,0,.18),0 2px 8px rgba(0,0,0,.1);padding:14px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:13px;color:#1a1a1a;box-sizing:border-box}
@media(prefers-color-scheme:dark){#__lgtm_card__{background:#1e293b;border-color:rgba(255,255,255,.12);color:#f1f5f9}#__lgtm_card__ .__lgi{background:#0f172a;border-color:rgba(255,255,255,.18);color:#f1f5f9}#__lgtm_card__ .__lgp{background:rgba(255,255,255,.06);color:#94a3b8}#__lgtm_card__ .__lgs{background:#0f172a;border-color:rgba(255,255,255,.18);color:#f1f5f9}}
#__lgtm_card__ .__lgp{font-size:11px;color:#64748b;background:#f8fafc;padding:5px 8px;border-radius:5px;margin-bottom:10px;word-break:break-all;line-height:1.4}
#__lgtm_card__ .__lgi{display:block;width:100%;box-sizing:border-box;border:1px solid #cbd5e1;border-radius:6px;padding:8px 10px;font-size:13px;font-family:inherit;resize:vertical;min-height:72px;outline:none;line-height:1.5;transition:border-color .15s,box-shadow .15s}
#__lgtm_card__ .__lgi:focus{border-color:#3b82f6;box-shadow:0 0 0 3px rgba(59,130,246,.12)}
#__lgtm_card__ .__lgs{display:block;width:100%;box-sizing:border-box;border:1px solid #cbd5e1;border-radius:6px;padding:6px 10px;font-size:13px;font-family:inherit;outline:none;margin-top:8px;cursor:pointer;background:#fff}
#__lgtm_card__ .__lga{display:flex;justify-content:flex-end;gap:8px;margin-top:10px}
#__lgtm_card__ .__lgb{border:none;border-radius:6px;padding:6px 14px;font-size:13px;font-family:inherit;cursor:pointer;font-weight:500;transition:opacity .15s}
#__lgtm_card__ .__lgb:hover{opacity:.83}
#__lgtm_card__ .__lgbc{background:transparent;color:#64748b;border:1px solid #e2e8f0}
#__lgtm_card__ .__lgbs{background:#3b82f6;color:#fff}
#__lgtm_card__ .__lgbs:disabled{opacity:.5;cursor:not-allowed}
#__lgtm_card__ .__lgh{font-size:10px;color:#94a3b8;margin-top:4px;text-align:right}
#__lgtm_card__ .__lgst{font-size:12px;text-align:center;padding:5px 8px;border-radius:5px;margin-top:8px;display:none}
#__lgtm_card__ .__lgst-ok{color:#16a34a;background:#dcfce7}
#__lgtm_card__ .__lgst-err{color:#dc2626;background:#fee2e2}
  `;

  function injectStyles() {
    if (document.getElementById('__lgtm_style__')) return;
    const s = document.createElement('style');
    s.id = '__lgtm_style__';
    s.textContent = STYLES;
    document.documentElement.appendChild(s);
  }

  function esc(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function show(element, componentPath, { onSubmit, onCancel, projects }) {
    injectStyles();
    hide();

    onSubmitCb = onSubmit;
    onCancelCb = onCancel;

    const isLGTM = LGTM_CONFIG.BUILD_TARGET === 'lgtm';
    const submitLabel = isLGTM ? 'Add to LGTM ▶' : 'Copy';

    cardEl = document.createElement('div');
    cardEl.id = '__lgtm_card__';
    cardEl.innerHTML = `
      <div class="__lgp">📍 ${esc(componentPath.path)}</div>
      <textarea class="__lgi" placeholder="作業指示を入力..."></textarea>
      ${isLGTM ? `<select class="__lgs" id="__lgtm_proj__">
        <option value="">プロジェクトを選択...</option>
      </select>` : ''}
      <div class="__lgh">⌘↵ で送信 / Esc でキャンセル</div>
      <div class="__lga">
        <button class="__lgb __lgbc" id="__lgtm_cancel__">キャンセル</button>
        <button class="__lgbs __lgb" id="__lgtm_submit__">${esc(submitLabel)}</button>
      </div>
      <div class="__lgst" id="__lgtm_status__"></div>
    `;

    positionCard(element);
    document.documentElement.appendChild(cardEl);

    // Populate projects for LGTM variant
    if (isLGTM && projects && projects.length > 0) {
      _populateProjects(projects);
    }

    const textarea = cardEl.querySelector('textarea');
    const submitBtn = document.getElementById('__lgtm_submit__');
    const cancelBtn = document.getElementById('__lgtm_cancel__');

    requestAnimationFrame(() => textarea && textarea.focus());

    textarea.addEventListener('keydown', e => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        submitBtn.click();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        _cancel();
      } else {
        e.stopPropagation();
      }
    });
    textarea.addEventListener('keyup', e => e.stopPropagation());

    submitBtn.addEventListener('click', () => {
      const text = (textarea.value || '').trim();
      if (!text) { textarea.focus(); return; }

      const project = isLGTM
        ? (document.getElementById('__lgtm_proj__') || {}).value || null
        : null;

      submitBtn.disabled = true;
      submitBtn.textContent = '送信中...';
      onSubmitCb && onSubmitCb({ text, project });
    });

    cancelBtn.addEventListener('click', _cancel);
  }

  function _populateProjects(projects) {
    const sel = document.getElementById('__lgtm_proj__');
    if (!sel) return;
    projects.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.name || p;
      opt.textContent = p.name || p;
      sel.appendChild(opt);
    });
    // Restore last selection
    chrome.storage.local.get('lastProject', data => {
      if (data.lastProject) sel.value = data.lastProject;
    });
    sel.addEventListener('change', () => {
      chrome.storage.local.set({ lastProject: sel.value });
    });
  }

  function positionCard(element) {
    if (!cardEl) return;
    const rect = element.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const cardW = 332; // 320 + 12 margin
    const cardH = 240;

    let left = rect.right + 12;
    let top = rect.top;

    if (left + cardW > vw - 8) left = rect.left - cardW;
    if (top + cardH > vh - 8) top = vh - cardH - 8;
    left = Math.max(8, left);
    top = Math.max(8, top);

    cardEl.style.left = left + 'px';
    cardEl.style.top = top + 'px';
  }

  function showStatus(message, type) {
    const el = document.getElementById('__lgtm_status__');
    if (!el) return;
    el.textContent = message;
    el.className = '__lgst __lgst-' + (type === 'success' ? 'ok' : 'err');
    el.style.display = 'block';
  }

  function resetSubmit(label) {
    const btn = document.getElementById('__lgtm_submit__');
    if (!btn) return;
    btn.disabled = false;
    btn.textContent = label;
  }

  function _cancel() {
    hide();
    onCancelCb && onCancelCb();
  }

  function hide() {
    if (cardEl) { cardEl.remove(); cardEl = null; }
    onSubmitCb = null;
    onCancelCb = null;
  }

  return { show, hide, showStatus, resetSubmit };
})();
