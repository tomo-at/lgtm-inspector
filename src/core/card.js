// Annotation card UI
const LGTMCard = (() => {
  'use strict';

  let cardEl = null;
  let onSubmitCb = null;
  let onCancelCb = null;
  let onNavigateCb = null;
  let onAddCb = null;

  const STYLES = `
#__lgtm_card__{position:fixed;z-index:2147483647;width:320px;background:#fff;border:1px solid rgba(0,0,0,.13);border-radius:10px;box-shadow:0 8px 32px rgba(0,0,0,.18),0 2px 8px rgba(0,0,0,.1);padding:14px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:13px;color:#1a1a1a;box-sizing:border-box}
#__lgtm_card__ .__lgp{font-size:11px;color:#64748b;background:#f8fafc;padding:5px 8px;border-radius:5px;margin-bottom:10px;word-break:break-all;line-height:1.4;cursor:move;user-select:none}
#__lgtm_card__ .__lgp::before{content:'⠿ ';color:#cbd5e1;letter-spacing:-1px}
#__lgtm_card__ .__lgsrc{display:block;margin-top:3px;color:#3b82f6;font-size:10px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;word-break:break-all}
#__lgtm_card__ .__lgi{display:block;width:100%;box-sizing:border-box;border:1px solid #cbd5e1;border-radius:6px;padding:8px 10px;font-size:13px;font-family:inherit;resize:vertical;min-height:72px;outline:none;line-height:1.5;transition:border-color .15s,box-shadow .15s}
#__lgtm_card__ .__lgi:focus{border-color:#3b82f6;box-shadow:0 0 0 3px rgba(59,130,246,.12)}
#__lgtm_card__ .__lgdd{position:relative;margin-top:8px}
#__lgtm_card__ .__lgddbtn{display:block;width:100%;box-sizing:border-box;border:1px solid #cbd5e1;border-radius:6px;padding:6px 28px 6px 10px;font-size:13px;font-family:inherit;outline:none;cursor:pointer;background:#fff;color:#1a1a1a;text-align:left;line-height:1.5;transition:border-color .15s;position:relative}
#__lgtm_card__ .__lgddbtn::after{content:'';position:absolute;right:10px;top:50%;transform:translateY(-50%);border-left:4px solid transparent;border-right:4px solid transparent;border-top:5px solid #94a3b8;pointer-events:none}
#__lgtm_card__ .__lgddbtn:focus{border-color:#3b82f6;box-shadow:0 0 0 3px rgba(59,130,246,.12)}
#__lgtm_card__ .__lgddlist{position:absolute;top:calc(100% + 3px);left:0;right:0;margin:0;padding:4px 0;background:#fff;border:1px solid #cbd5e1;border-radius:6px;box-shadow:0 4px 16px rgba(0,0,0,.12);list-style:none;z-index:2147483648;max-height:160px;overflow-y:auto}
#__lgtm_card__ .__lgdditem{padding:6px 10px;cursor:pointer;font-size:13px;color:#1a1a1a;user-select:none}
#__lgtm_card__ .__lgdditem:hover{background:#f1f5f9}
#__lgtm_card__ .__lga{display:flex;justify-content:flex-end;gap:8px;margin-top:10px}
#__lgtm_card__ .__lgb{border:none;border-radius:6px;padding:6px 14px;font-size:13px;font-family:inherit;cursor:pointer;font-weight:500;transition:opacity .15s}
#__lgtm_card__ .__lgb:hover{opacity:.83}
#__lgtm_card__ .__lgba{display:block;width:100%;box-sizing:border-box;margin-top:8px;background:#f1f5f9;color:#475569;border:1px solid #e2e8f0;text-align:center}
#__lgtm_card__ .__lgbc{background:transparent;color:#e2e8f0;border:1px solid #e2e8f0}
#__lgtm_card__ .__lgbs{background:#3b82f6;color:#fff}
#__lgtm_card__ .__lgbs:disabled{opacity:.5;cursor:not-allowed}
#__lgtm_card__ .__lgh{font-size:10px;color:#94a3b8;margin-top:4px;text-align:right}
#__lgtm_card__ .__lgst{font-size:12px;text-align:center;padding:5px 8px;border-radius:5px;margin-top:8px;display:none}
#__lgtm_card__ .__lgst-ok{color:#16a34a;background:#dcfce7}
#__lgtm_card__ .__lgst-err{color:#dc2626;background:#fee2e2}
#__lgtm_card__ .__lgnav{display:flex;gap:4px;margin-bottom:8px}
#__lgtm_card__ .__lgnavb{flex:1;border:1px solid #cbd5e1;background:#f8fafc;border-radius:6px;padding:3px 0;font-size:13px;line-height:1.2;cursor:pointer;color:#64748b;font-family:inherit}
#__lgtm_card__ .__lgnavb:hover:not(:disabled){border-color:#3b82f6;color:#3b82f6}
#__lgtm_card__ .__lgnavb:disabled{opacity:.4;cursor:default}
#__lgtm_card__ .__lgtabs{display:flex;gap:4px;margin-bottom:10px}
#__lgtm_card__ .__lgtab{flex:1;border:1px solid #cbd5e1;background:#f8fafc;border-radius:6px;padding:5px 0;font-size:12px;font-family:inherit;cursor:pointer;color:#64748b;transition:background .12s,color .12s}
#__lgtm_card__ .__lgtab-on{background:#3b82f6;border-color:#3b82f6;color:#fff;font-weight:500}
#__lgtm_card__ .__lgsty{max-height:236px;overflow-y:auto;margin:-2px -2px 2px;padding:2px}
#__lgtm_card__ .__lgstyrow{display:flex;align-items:center;gap:6px;margin-bottom:5px}
#__lgtm_card__ .__lgstylbl{flex:0 0 72px;font-size:11px;color:#64748b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:default}
#__lgtm_card__ .__lgstyfields{flex:1;display:flex;align-items:center;gap:5px;min-width:0}
#__lgtm_card__ .__lgstyin{flex:1;min-width:0;box-sizing:border-box;border:1px solid #cbd5e1;border-radius:5px;padding:4px 7px;font-size:12px;line-height:1.4;height:auto;min-height:0;font-family:inherit;outline:none;color:#1a1a1a;background:#fff}
#__lgtm_card__ .__lgstyin:focus{border-color:#3b82f6;box-shadow:0 0 0 2px rgba(59,130,246,.12)}
#__lgtm_card__ .__lgstysw{flex:0 0 24px;width:24px;height:24px;padding:0;border:1px solid #cbd5e1;border-radius:5px;background:none;cursor:pointer}
#__lgtm_card__ .__lgsty-dirty .__lgstyin{border-color:#3b82f6;background:#eff6ff}
#__lgtm_card__ .__lgsty-dirty .__lgstylbl{color:#3b82f6;font-weight:600}
#__lgtm_card__ .__lgtokbtn{flex:0 0 26px;width:26px;height:26px;padding:0;border:1px solid #cbd5e1;border-radius:5px;background:#f8fafc;color:#64748b;font-size:11px;font-family:inherit;cursor:pointer;line-height:1;display:inline-flex;align-items:center;justify-content:center}
#__lgtm_card__ .__lgtokbtn:hover{border-color:#3b82f6;color:#3b82f6}
#__lgtm_card__ .__lgtokbtn.__lgtoksuggest{border-color:#3b82f6;color:#3b82f6;background:#eff6ff}
#__lgtm_card__ .__lgtokbtn.__lgtokdetach{color:#64748b}
#__lgtm_card__ .__lgtokbtn.__lgtokdetach:hover{border-color:#ef4444;color:#ef4444;background:#fef2f2}
#__lgtm_card__ .__lgstychip{flex:1;min-width:0;box-sizing:border-box;display:flex;align-items:center;gap:6px;border:1px solid #bfdbfe;background:#eff6ff;border-radius:5px;padding:3px 7px;cursor:pointer;overflow:hidden}
#__lgtm_card__ .__lgstychip:hover{border-color:#3b82f6}
#__lgtm_card__ .__lgstychip svg{flex:0 0 auto;color:#3b82f6}
#__lgtm_card__ .__lgchipname{flex:1 1 auto;min-width:0;color:#2563eb;font-weight:600;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#__lgtm_card__ .__lgchipval{flex:0 1 auto;min-width:0;max-width:55%;margin-left:auto;padding-left:6px;color:#94a3b8;font-size:11px;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#__lgtm_card__ .__lgsty-dirty .__lgstychip{border-color:#3b82f6;background:#dbeafe}
#__lgtm_tokpop__{position:fixed;z-index:2147483647;min-width:200px;max-width:280px;max-height:240px;overflow-y:auto;background:#fff;border:1px solid #cbd5e1;border-radius:8px;box-shadow:0 8px 28px rgba(0,0,0,.18);padding:4px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:12px;box-sizing:border-box}
#__lgtm_tokpop__ .__lgtokitem{display:flex;align-items:center;gap:7px;padding:5px 7px;border-radius:5px;cursor:pointer}
#__lgtm_tokpop__ .__lgtokitem:hover{background:#f1f5f9}
#__lgtm_tokpop__ .__lgtoksw{flex:0 0 14px;width:14px;height:14px;border-radius:3px;border:1px solid rgba(0,0,0,.15)}
#__lgtm_tokpop__ .__lgtokname{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#1a1a1a}
#__lgtm_tokpop__ .__lgtokval{flex:0 0 auto;color:#94a3b8;font-size:11px;max-width:96px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#__lgtm_tokpop__ .__lgtoksec{padding:6px 8px;margin-top:2px;border-top:1px solid #eef2f7;color:#94a3b8;font-size:11px;cursor:pointer;user-select:none}
#__lgtm_tokpop__ .__lgtoksec:hover{color:#3b82f6}
@media(prefers-color-scheme:dark){#__lgtm_card__{background:#1e293b;border-color:rgba(255,255,255,.12);color:#f1f5f9}#__lgtm_card__ .__lgp{background:rgba(255,255,255,.06);color:#94a3b8}#__lgtm_card__ .__lgi{background:#0f172a;border-color:rgba(255,255,255,.18);color:#f1f5f9}#__lgtm_card__ .__lgddbtn{background:#0f172a;border-color:rgba(255,255,255,.18);color:#f1f5f9}#__lgtm_card__ .__lgddlist{background:#1e293b;border-color:rgba(255,255,255,.18)}#__lgtm_card__ .__lgdditem{color:#f1f5f9}#__lgtm_card__ .__lgdditem:hover{background:#334155}#__lgtm_card__ .__lgba{background:#0f172a;border-color:rgba(255,255,255,.18);color:#cbd5e1}#__lgtm_card__ .__lgnavb{background:#0f172a;border-color:rgba(255,255,255,.18);color:#94a3b8}#__lgtm_card__ .__lgtab{background:#0f172a;border-color:rgba(255,255,255,.18);color:#94a3b8}#__lgtm_card__ .__lgtab-on{background:#3b82f6;border-color:#3b82f6;color:#fff}#__lgtm_card__ .__lgstyin{background:#0f172a;border-color:rgba(255,255,255,.18);color:#f1f5f9}#__lgtm_card__ .__lgsty-dirty .__lgstyin{background:#1e3a5f;border-color:#3b82f6}#__lgtm_card__ .__lgtokbtn{background:#0f172a;border-color:rgba(255,255,255,.18);color:#94a3b8}#__lgtm_card__ .__lgtokbtn:hover{border-color:#3b82f6;color:#3b82f6}#__lgtm_card__ .__lgtokbtn.__lgtoksuggest{background:rgba(59,130,246,.15);border-color:#3b82f6;color:#93c5fd}#__lgtm_card__ .__lgtokbtn.__lgtokdetach{color:#94a3b8}#__lgtm_card__ .__lgtokbtn.__lgtokdetach:hover{background:rgba(239,68,68,.15);border-color:#ef4444;color:#f87171}#__lgtm_card__ .__lgstychip{background:rgba(59,130,246,.12);border-color:rgba(59,130,246,.4)}#__lgtm_card__ .__lgstychip svg{color:#93c5fd}#__lgtm_card__ .__lgchipname{color:#93c5fd}#__lgtm_card__ .__lgsty-dirty .__lgstychip{background:rgba(59,130,246,.22);border-color:#3b82f6}#__lgtm_tokpop__{background:#1e293b;border-color:rgba(255,255,255,.18)}#__lgtm_tokpop__ .__lgtokitem:hover{background:#334155}#__lgtm_tokpop__ .__lgtokname{color:#f1f5f9}#__lgtm_tokpop__ .__lgtoksec{border-color:rgba(255,255,255,.08)}}
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

  function show(element, componentPath, { onSubmit, onCancel, onNavigate, onAdd, nav = null, anchorRect = null, initialText = '', seedEdits = null, editId = null }) {
    injectStyles();
    hide();

    onSubmitCb = onSubmit;
    onCancelCb = onCancel;
    onNavigateCb = onNavigate;
    onAddCb = onAdd;

    const submitLabel = 'Copy';
    // Style editing only applies to a single clicked element (not a dragged region).
    const hasStyleTab = !!element;

    cardEl = document.createElement('div');
    cardEl.id = '__lgtm_card__';
    cardEl.innerHTML = `
      <div class="__lgp">📍 ${esc(componentPath.path)}${componentPath.source ? `<span class="__lgsrc">↳ ${esc(componentPath.source)}</span>` : ''}</div>
      ${hasStyleTab ? `
        <div class="__lgnav">
          <button type="button" class="__lgnavb" data-nav="parent" ${nav && !nav.parent ? 'disabled' : ''} title="Parent">↑</button>
          <button type="button" class="__lgnavb" data-nav="child"  ${nav && !nav.child  ? 'disabled' : ''} title="First child">↓</button>
          <button type="button" class="__lgnavb" data-nav="prev"   ${nav && !nav.prev   ? 'disabled' : ''} title="Previous sibling">←</button>
          <button type="button" class="__lgnavb" data-nav="next"   ${nav && !nav.next   ? 'disabled' : ''} title="Next sibling">→</button>
        </div>
        <div class="__lgtabs">
          <button type="button" class="__lgtab __lgtab-on" data-tab="notes">Notes</button>
          <button type="button" class="__lgtab" data-tab="style">Style</button>
        </div>
      ` : ''}
      <div class="__lgpanel" data-panel="notes">
        <textarea class="__lgi" placeholder="Enter notes..."></textarea>
      </div>
      ${hasStyleTab ? `<div class="__lgpanel" data-panel="style" style="display:none"></div>` : ''}
      <div class="__lgh">⌘↵ to Copy / Esc to Cancel</div>
      <button type="button" class="__lgb __lgba" id="__lgtm_add__" title="Stack this and send all together later">${editId ? '✓ Update' : '＋ Stack for later'}</button>
      <div class="__lga">
        <button class="__lgb __lgbc" id="__lgtm_cancel__">Cancel</button>
        <button class="__lgbs __lgb" id="__lgtm_submit__">${esc(submitLabel)}</button>
      </div>
      <div class="__lgst" id="__lgtm_status__"></div>
    `;

    positionCard(element, anchorRect);
    document.documentElement.appendChild(cardEl);

    const textarea = cardEl.querySelector('textarea');
    const submitBtn = document.getElementById('__lgtm_submit__');
    const cancelBtn = document.getElementById('__lgtm_cancel__');

    // Drag the card around by its component-path bar.
    makeDraggable(cardEl.querySelector('.__lgp'));

    // DOM-tree navigation — re-selects parent/child/sibling via the host callback.
    if (hasStyleTab) {
      cardEl.querySelectorAll('.__lgnavb').forEach(btn => btn.addEventListener('click', e => {
        e.stopPropagation();
        if (btn.disabled) return;
        onNavigateCb && onNavigateCb(btn.getAttribute('data-nav'));
      }));
    }

    // Seed the note when editing an existing entry.
    if (initialText) textarea.value = initialText;

    // Build the live CSS editor and wire tab switching.
    if (hasStyleTab) {
      const stylePanel = cardEl.querySelector('[data-panel="style"]');
      LGTMStyler.build(stylePanel, element, { seed: seedEdits });

      const tabs = [...cardEl.querySelectorAll('.__lgtab')];
      tabs.forEach(tab => tab.addEventListener('click', () => {
        const name = tab.getAttribute('data-tab');
        tabs.forEach(t => t.classList.toggle('__lgtab-on', t === tab));
        cardEl.querySelectorAll('.__lgpanel').forEach(panel => {
          panel.style.display = panel.getAttribute('data-panel') === name ? '' : 'none';
        });
        if (name === 'notes') textarea.focus();
      }));

      // When editing an entry that had style changes, open straight to the Style tab.
      if (seedEdits && seedEdits.length) {
        const st = tabs.find(t => t.getAttribute('data-tab') === 'style');
        if (st) st.click();
      }
    }

    // ⌘↵ / Ctrl↵ submits from anywhere in the card (including style fields).
    cardEl.addEventListener('keydown', e => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        submitBtn.click();
      }
    }, true);

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

    // Collect the card's current payload (note + style diff + project).
    function gather() {
      const text = (textarea.value || '').trim();
      const styleEdits = hasStyleTab ? LGTMStyler.getEdits() : [];
      return { text, styleEdits };
    }

    submitBtn.addEventListener('click', () => {
      const d = gather();
      // Allow submitting style-only changes (no note typed).
      if (!d.text && d.styleEdits.length === 0) { textarea.focus(); return; }

      submitBtn.disabled = true;
      submitBtn.textContent = 'Copying...';
      onSubmitCb && onSubmitCb(d);
    });

    const addBtn = document.getElementById('__lgtm_add__');
    if (addBtn) addBtn.addEventListener('click', () => {
      const d = gather();
      if (!d.text && d.styleEdits.length === 0) { textarea.focus(); return; }
      onAddCb && onAddCb(d);
    });

    cancelBtn.addEventListener('click', _cancel);
  }

  // Make the card draggable by `handle`. Keeps the card within the viewport.
  function makeDraggable(handle) {
    if (!handle || !cardEl) return;
    let sx = 0, sy = 0, startLeft = 0, startTop = 0, dragging = false;

    function onMove(e) {
      if (!dragging) return;
      e.preventDefault();
      e.stopPropagation();
      const w = cardEl.offsetWidth;
      const h = cardEl.offsetHeight;
      let nl = startLeft + (e.clientX - sx);
      let nt = startTop + (e.clientY - sy);
      nl = Math.max(4, Math.min(nl, window.innerWidth - w - 4));
      nt = Math.max(4, Math.min(nt, window.innerHeight - h - 4));
      cardEl.style.left = nl + 'px';
      cardEl.style.top = nt + 'px';
    }
    function onUp() {
      dragging = false;
      document.removeEventListener('mousemove', onMove, true);
      document.removeEventListener('mouseup', onUp, true);
    }
    handle.addEventListener('mousedown', e => {
      if (e.button !== 0 || !cardEl) return;
      e.preventDefault();
      e.stopPropagation();
      const r = cardEl.getBoundingClientRect();
      sx = e.clientX; sy = e.clientY;
      startLeft = r.left; startTop = r.top;
      dragging = true;
      document.addEventListener('mousemove', onMove, true);
      document.addEventListener('mouseup', onUp, true);
    });
  }

  function positionCard(element, anchorRect) {
    if (!cardEl) return;
    const rect = anchorRect || (element && element.getBoundingClientRect()) || { left: 20, top: 20, right: 20, bottom: 20, width: 0, height: 0 };
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
    const cb = onCancelCb;
    hide();
    cb && cb();
  }

  function hide() {
    if (cardEl) { cardEl.remove(); cardEl = null; }
    onSubmitCb = null;
    onCancelCb = null;
    onNavigateCb = null;
    onAddCb = null;
  }

  return { show, hide, showStatus, resetSubmit };
})();
