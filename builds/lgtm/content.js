(function(){
if(window.__lgtmContentLoaded)return;
window.__lgtmContentLoaded=true;

// Build configuration — BUILD_TARGET is replaced by build.sh
// Values: 'lgtm' | 'standalone'
const LGTM_CONFIG = {
  BUILD_TARGET: 'lgtm',
  API_BASE: 'http://127.0.0.1:41234'
};
// Component path detection with priority hierarchy:
// 1. data-component attribute
// 2. React Fiber
// 3. Vue
// 4. Custom HTML element (web component — tag contains hyphen)
// 5. data-testid / data-cy / data-qa / data-test
// 6. CSS class hierarchy (kebab-case component-like names, walks up to 8 levels)
// 7. Nearest meaningful element ID
// 8. DOM hierarchy (last resort, accuracy: 'low')
const LGTMInspector = (() => {
  'use strict';

  // --- 1. data-component (primary) ---
  function getDataComponentPath(element) {
    const parts = [];
    let current = element;
    while (current && current !== document.documentElement) {
      if (current.dataset && current.dataset.component) {
        parts.unshift(current.dataset.component);
      }
      current = current.parentElement;
    }
    if (parts.length === 0) return null;

    const deepest = parts[parts.length - 1];
    if (deepest.includes('/')) {
      return { path: deepest.replace(/\//g, ' > '), accuracy: 'high' };
    }
    return { path: parts.join(' > '), accuracy: 'high' };
  }

  // --- 2. React Fiber ---
  function getReactComponentPath(element) {
    const fiberKey = Object.keys(element).find(
      k => k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance')
    );
    if (!fiberKey) return null;

    const names = [];
    let fiber = element[fiberKey];
    let depth = 0;
    while (fiber && depth < 30) {
      const type = fiber.type;
      if (type && typeof type === 'function') {
        const name = type.displayName || type.name;
        if (name && !/^[a-z]/.test(name) && name !== 'Component' && !name.startsWith('_')) {
          if (!names.includes(name)) names.unshift(name);
        }
      }
      fiber = fiber.return;
      depth++;
      if (names.length >= 5) break;
    }
    if (names.length === 0) return null;
    return { path: names.join(' > '), accuracy: 'medium' };
  }

  // --- 3. Vue ---
  function getVueComponentPath(element) {
    const vueKey = Object.keys(element).find(
      k => k === '__vue__' || k === '__vueParentComponent'
    );
    if (!vueKey) return null;

    const names = [];
    let vm = element[vueKey];
    let depth = 0;
    while (vm && depth < 10) {
      const name = vm.type?.name || vm.$options?.name || vm.$options?.__name;
      if (name && name !== 'App' && !name.startsWith('_')) {
        names.unshift(name);
      }
      vm = vm.parent || vm.$parent;
      depth++;
      if (names.length >= 5) break;
    }
    if (names.length === 0) return null;
    return { path: names.join(' > '), accuracy: 'medium' };
  }

  // --- 4. Custom element tag name (Web Components) ---
  // Custom elements must have a hyphen in the tag name (spec requirement).
  function getCustomElementPath(element) {
    let el = element;
    while (el && el !== document.documentElement) {
      if (el.tagName && el.tagName.includes('-')) {
        return { path: el.tagName.toLowerCase(), accuracy: 'medium' };
      }
      el = el.parentElement;
    }
    return null;
  }

  // --- 5. Test IDs ---
  // data-testid / data-cy / data-qa are commonly set to component names in design systems.
  function getTestIdPath(element) {
    const attrs = ['data-testid', 'data-cy', 'data-qa', 'data-test', 'data-e2e'];
    let el = element;
    while (el && el !== document.documentElement) {
      for (const attr of attrs) {
        const val = el.getAttribute(attr);
        if (val && val.trim().length > 0) {
          return { path: val.trim(), accuracy: 'medium' };
        }
      }
      el = el.parentElement;
    }
    return null;
  }

  // --- 6. CSS class hierarchy ---
  // Walks up to 8 ancestor levels looking for kebab-case class names that look like component
  // names (e.g. name-tag, color-chip, hero-headline). Excludes Tailwind/Bootstrap utility classes.
  function getCSSClassPath(element) {
    // Requires: 2+ segments separated by hyphens, each segment 2+ lowercase letters/digits.
    // e.g. name-tag ✓  color-chip ✓  flex-col ✗ (filtered below)  p-4 ✗
    const isComponentClass = c =>
      /^[a-z]{2,}(-[a-z][a-z0-9]+)+$/.test(c) &&
      !/^(is-|has-|js-|d-|p-|m-|px-|py-|pt-|pb-|pl-|pr-|mx-|my-|mt-|mb-|ml-|mr-|w-|h-|min-|max-|text-|bg-|border-|flex-|grid-|col-|row-|gap-|space-|rounded-|shadow-|font-|leading-|tracking-|overflow-|cursor-|ring-|sr-|z-)/.test(c);

    let el = element;
    let depth = 0;
    while (el && el !== document.documentElement && depth < 8) {
      const found = [...(el.classList || [])].find(isComponentClass);
      if (found) return { path: found, accuracy: 'medium' };
      el = el.parentElement;
      depth++;
    }
    return null;
  }

  // --- 7. Nearest meaningful element ID ---
  function getNearestIdPath(element) {
    let el = element;
    while (el && el !== document.documentElement) {
      const id = el.id;
      // Skip generated IDs: starts with __, starts with digit, looks like a UUID/hash
      if (id && !id.startsWith('__') && !/^\d/.test(id) && !/^[a-f0-9-]{8,}$/i.test(id)) {
        return { path: `#${id}`, accuracy: 'medium' };
      }
      el = el.parentElement;
    }
    return null;
  }

  // --- 8. DOM hierarchy (last resort) ---
  function getDOMPath(element) {
    const parts = [];
    let current = element;
    let depth = 0;
    while (current && current !== document.body && depth < 4) {
      const tag = current.tagName.toLowerCase();
      const id = current.id ? `#${current.id}` : '';
      parts.unshift(`${tag}${id}`);
      current = current.parentElement;
      depth++;
    }
    return { path: parts.join(' > ') || element.tagName.toLowerCase(), accuracy: 'low' };
  }

  function getComponentPath(element) {
    return (
      getDataComponentPath(element) ||
      getReactComponentPath(element) ||
      getVueComponentPath(element) ||
      getCustomElementPath(element) ||
      getTestIdPath(element) ||
      getCSSClassPath(element) ||
      getNearestIdPath(element) ||
      getDOMPath(element)
    );
  }

  return { getComponentPath };
})();
// Hover highlight overlay and tooltip
const LGTMOverlay = (() => {
  'use strict';

  let highlightEl = null;
  let tooltipEl = null;

  function ensureHighlight() {
    if (highlightEl) return;
    highlightEl = document.createElement('div');
    highlightEl.id = '__lgtm_highlight__';
    Object.assign(highlightEl.style, {
      position: 'fixed',
      pointerEvents: 'none',
      zIndex: '2147483645',
      border: '2px solid rgba(59,130,246,0.85)',
      background: 'rgba(59,130,246,0.07)',
      borderRadius: '2px',
      boxSizing: 'border-box',
      display: 'none',
      transition: 'all 0.06s ease'
    });
    document.documentElement.appendChild(highlightEl);
  }

  function ensureTooltip() {
    if (tooltipEl) return;
    tooltipEl = document.createElement('div');
    tooltipEl.id = '__lgtm_tooltip__';
    Object.assign(tooltipEl.style, {
      position: 'fixed',
      pointerEvents: 'none',
      zIndex: '2147483646',
      background: 'rgba(15,23,42,0.93)',
      color: '#fff',
      font: '12px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
      padding: '4px 9px',
      borderRadius: '5px',
      whiteSpace: 'nowrap',
      maxWidth: '340px',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      boxShadow: '0 2px 10px rgba(0,0,0,0.35)',
      display: 'none'
    });
    document.documentElement.appendChild(tooltipEl);
  }

  function show(element, componentPath, mouseX, mouseY) {
    ensureHighlight();
    ensureTooltip();

    const rect = element.getBoundingClientRect();
    Object.assign(highlightEl.style, {
      left: rect.left + 'px',
      top: rect.top + 'px',
      width: rect.width + 'px',
      height: rect.height + 'px',
      border: '2px solid rgba(59,130,246,0.85)',
      background: 'rgba(59,130,246,0.07)',
      display: 'block'
    });

    // Gray text for low-accuracy fallback paths
    tooltipEl.style.color = componentPath.accuracy === 'low' ? '#94a3b8' : '#fff';
    tooltipEl.textContent = '📍 ' + componentPath.path;
    tooltipEl.style.display = 'block';

    // Position tooltip near cursor, clamped to viewport
    requestAnimationFrame(() => {
      const tw = tooltipEl.offsetWidth || 200;
      const th = tooltipEl.offsetHeight || 28;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      let tx = mouseX + 14;
      let ty = mouseY + 18;
      if (tx + tw > vw - 8) tx = mouseX - tw - 6;
      if (ty + th > vh - 8) ty = mouseY - th - 6;
      tooltipEl.style.left = Math.max(4, tx) + 'px';
      tooltipEl.style.top = Math.max(4, ty) + 'px';
    });
  }

  function hide() {
    if (highlightEl) highlightEl.style.display = 'none';
    if (tooltipEl) tooltipEl.style.display = 'none';
  }

  function lock(element) {
    ensureHighlight();
    const rect = element.getBoundingClientRect();
    Object.assign(highlightEl.style, {
      left: rect.left + 'px',
      top: rect.top + 'px',
      width: rect.width + 'px',
      height: rect.height + 'px',
      border: '2px solid rgba(59,130,246,1)',
      background: 'rgba(59,130,246,0.12)',
      display: 'block'
    });
    if (tooltipEl) tooltipEl.style.display = 'none';
  }

  function unlock() {
    if (highlightEl) {
      highlightEl.style.border = '2px solid rgba(59,130,246,0.85)';
      highlightEl.style.background = 'rgba(59,130,246,0.07)';
    }
  }

  function destroy() {
    if (highlightEl) { highlightEl.remove(); highlightEl = null; }
    if (tooltipEl) { tooltipEl.remove(); tooltipEl = null; }
  }

  return { show, hide, lock, unlock, destroy };
})();
// Annotation card UI
const LGTMCard = (() => {
  'use strict';

  let cardEl = null;
  let onSubmitCb = null;
  let onCancelCb = null;

  const STYLES = `
#__lgtm_card__{position:fixed;z-index:2147483647;width:320px;background:#fff;border:1px solid rgba(0,0,0,.13);border-radius:10px;box-shadow:0 8px 32px rgba(0,0,0,.18),0 2px 8px rgba(0,0,0,.1);padding:14px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:13px;color:#1a1a1a;box-sizing:border-box}
#__lgtm_card__ .__lgp{font-size:11px;color:#64748b;background:#f8fafc;padding:5px 8px;border-radius:5px;margin-bottom:10px;word-break:break-all;line-height:1.4}
#__lgtm_card__ .__lgi{display:block;width:100%;box-sizing:border-box;border:1px solid #cbd5e1;border-radius:6px;padding:8px 10px;font-size:13px;font-family:inherit;resize:vertical;min-height:72px;outline:none;line-height:1.5;transition:border-color .15s,box-shadow .15s}
#__lgtm_card__ .__lgi:focus{border-color:#3b82f6;box-shadow:0 0 0 3px rgba(59,130,246,.12)}
#__lgtm_card__ .__lgdd{position:relative;margin-top:8px}
#__lgtm_card__ .__lgddbtn{display:block;width:100%;box-sizing:border-box;border:1px solid #cbd5e1;border-radius:6px;padding:6px 10px;font-size:13px;font-family:inherit;outline:none;cursor:pointer;background:#fff;color:#1a1a1a;text-align:left;line-height:1.5;transition:border-color .15s}
#__lgtm_card__ .__lgddbtn:focus{border-color:#3b82f6;box-shadow:0 0 0 3px rgba(59,130,246,.12)}
#__lgtm_card__ .__lgddlist{position:absolute;top:calc(100% + 3px);left:0;right:0;margin:0;padding:4px 0;background:#fff;border:1px solid #cbd5e1;border-radius:6px;box-shadow:0 4px 16px rgba(0,0,0,.12);list-style:none;z-index:2147483648;max-height:160px;overflow-y:auto}
#__lgtm_card__ .__lgdditem{padding:6px 10px;cursor:pointer;font-size:13px;color:#1a1a1a;user-select:none}
#__lgtm_card__ .__lgdditem:hover{background:#f1f5f9}
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
@media(prefers-color-scheme:dark){#__lgtm_card__{background:#1e293b;border-color:rgba(255,255,255,.12);color:#f1f5f9}#__lgtm_card__ .__lgp{background:rgba(255,255,255,.06);color:#94a3b8}#__lgtm_card__ .__lgi{background:#0f172a;border-color:rgba(255,255,255,.18);color:#f1f5f9}#__lgtm_card__ .__lgddbtn{background:#0f172a;border-color:rgba(255,255,255,.18);color:#f1f5f9}#__lgtm_card__ .__lgddlist{background:#1e293b;border-color:rgba(255,255,255,.18)}#__lgtm_card__ .__lgdditem{color:#f1f5f9}#__lgtm_card__ .__lgdditem:hover{background:#334155}}
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
      ${isLGTM ? `
        <div class="__lgdd" id="__lgtm_dd__">
          <input type="hidden" id="__lgtm_proj__" value="">
          <button type="button" class="__lgddbtn" id="__lgtm_proj_btn__">プロジェクトを選択...</button>
          <ul class="__lgddlist" id="__lgtm_proj_list__" style="display:none"></ul>
        </div>
      ` : ''}
      <div class="__lgh">⌘↵ で送信 / Esc でキャンセル</div>
      <div class="__lga">
        <button class="__lgb __lgbc" id="__lgtm_cancel__">キャンセル</button>
        <button class="__lgbs __lgb" id="__lgtm_submit__">${esc(submitLabel)}</button>
      </div>
      <div class="__lgst" id="__lgtm_status__"></div>
    `;

    positionCard(element);
    document.documentElement.appendChild(cardEl);

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
        // Escape: close dropdown if open, otherwise cancel card
        const list = document.getElementById('__lgtm_proj_list__');
        if (list && list.style.display !== 'none') {
          list.style.display = 'none';
        } else {
          _cancel();
        }
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
    const input = document.getElementById('__lgtm_proj__');
    const btn   = document.getElementById('__lgtm_proj_btn__');
    const list  = document.getElementById('__lgtm_proj_list__');
    if (!input || !btn || !list) return;

    projects.forEach(p => {
      const name = p.name || p;
      const li = document.createElement('li');
      li.className = '__lgdditem';
      li.textContent = name;
      li.addEventListener('click', e => {
        e.stopPropagation();
        input.value = name;
        btn.textContent = name;
        list.style.display = 'none';
        chrome.storage.local.set({ lastProject: name });
      });
      list.appendChild(li);
    });

    btn.addEventListener('click', e => {
      e.stopPropagation();
      list.style.display = list.style.display === 'none' ? 'block' : 'none';
    });

    // Close when clicking outside the dropdown
    document.addEventListener('click', _closeDropdown, true);

    // Restore last-used project
    chrome.storage.local.get('lastProject', data => {
      if (!data.lastProject) return;
      const match = [...list.querySelectorAll('.__lgdditem')]
        .find(li => li.textContent === data.lastProject);
      if (match) {
        input.value = data.lastProject;
        btn.textContent = data.lastProject;
      }
    });
  }

  function _closeDropdown(e) {
    const list = document.getElementById('__lgtm_proj_list__');
    const btn  = document.getElementById('__lgtm_proj_btn__');
    if (!list || !btn) return;
    if (!btn.contains(e.target) && !list.contains(e.target)) {
      list.style.display = 'none';
    }
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
    document.removeEventListener('click', _closeDropdown, true);
    if (cardEl) { cardEl.remove(); cardEl = null; }
    onSubmitCb = null;
    onCancelCb = null;
  }

  return { show, hide, showStatus, resetSubmit };
})();
// LGTM variant adapter — proxies API calls through background service worker
// to avoid content script CORS / host_permissions issues in Arc and other browsers.
const LGTMAdapter = (() => {
  'use strict';

  function sendToBackground(message) {
    return new Promise(resolve => {
      chrome.runtime.sendMessage(message, response => {
        if (chrome.runtime.lastError) {
          console.warn('[LGTM Inspector] Background message error:', chrome.runtime.lastError.message);
          resolve(null);
          return;
        }
        resolve(response ?? null);
      });
    });
  }

  async function getProjects() {
    const response = await sendToBackground({ action: 'getProjects' });
    if (!response || response.error) {
      console.warn('[LGTM Inspector] Could not reach LGTM app:', response?.error ?? 'no response');
      return null;
    }
    return response.projects;
  }

  async function submit({ text, componentPath, sourceURL, project, screenshotBase64 }) {
    if (!project) {
      return { success: false, error: 'プロジェクトを選択してください' };
    }

    const payload = {
      title: text,
      // Exclude DOM-hierarchy fallbacks (accuracy: 'low') — they're not useful for code navigation
      componentPath: componentPath.accuracy !== 'low' ? componentPath.path : '',
      projectName: project,
      sourceURL: sourceURL || '',
      screenshotBase64: screenshotBase64 || null
    };

    const response = await sendToBackground({ action: 'submitTask', payload });
    if (!response) {
      return { success: false, error: 'LGTM app is not running' };
    }
    if (response.error) {
      return { success: false, error: response.error };
    }
    return { success: true };
  }

  return { getProjects, submit };
})();
// Main content script entry point
// Runs after: config.js → inspector.js → overlay.js → card.js → adapter.js (via build concatenation)
(function () {
  'use strict';

  // Guard: run only once even if script is injected multiple times
  if (window.__lgtmInspectorLoaded) return;
  window.__lgtmInspectorLoaded = true;

  // ── State ──────────────────────────────────────────────────────────────────
  let active = false;
  let selectedEl = null;
  let selectedPath = null;
  let borderEl = null;
  let pendingScreenshot = null; // captured on click, before card UI appears

  // ── Activation border (thin colored frame on viewport edge) ────────────────
  function showBorder() {
    if (borderEl) return;
    borderEl = document.createElement('div');
    borderEl.id = '__lgtm_border__';
    Object.assign(borderEl.style, {
      position: 'fixed', inset: '0',
      border: '3px solid rgba(59,130,246,.6)',
      pointerEvents: 'none',
      zIndex: '2147483644',
      boxSizing: 'border-box'
    });
    document.documentElement.appendChild(borderEl);
  }

  function hideBorder() {
    if (borderEl) { borderEl.remove(); borderEl = null; }
  }

  // ── Activate / deactivate ──────────────────────────────────────────────────
  function activate() {
    if (active) return;
    active = true;
    document.documentElement.style.cursor = 'crosshair';
    showBorder();
    document.addEventListener('mousemove', onMouseMove, true);
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKeyDown, true);
  }

  function deactivate() {
    if (!active) return;
    active = false;
    document.documentElement.style.cursor = '';
    hideBorder();
    LGTMOverlay.destroy();
    LGTMCard.hide();
    selectedEl = null;
    selectedPath = null;
    document.removeEventListener('mousemove', onMouseMove, true);
    document.removeEventListener('click', onClick, true);
    document.removeEventListener('keydown', onKeyDown, true);
  }

  function toggle() { active ? deactivate() : activate(); }

  // ── Event handlers ──────────────────────────────────────────────────────────
  function isOwnElement(el) {
    return el && (
      el.id && el.id.startsWith('__lgtm_') ||
      (el.closest && el.closest('#__lgtm_card__'))
    );
  }

  function onMouseMove(e) {
    if (selectedEl) return; // locked after click
    if (isOwnElement(e.target)) return;
    const path = LGTMInspector.getComponentPath(e.target);
    LGTMOverlay.show(e.target, path, e.clientX, e.clientY);
  }

  function onClick(e) {
    if (isOwnElement(e.target)) return;

    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    selectedEl = e.target;
    selectedPath = LGTMInspector.getComponentPath(e.target);
    LGTMOverlay.lock(selectedEl);

    // Capture screenshot NOW — before the card UI appears in the viewport
    pendingScreenshot = null;
    captureElement(selectedEl)
      .then(b64 => { pendingScreenshot = b64; })
      .catch(() => { pendingScreenshot = null; });

    openCard(selectedEl, selectedPath);
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      if (selectedEl) {
        // Close card, go back to hover mode
        LGTMCard.hide();
        LGTMOverlay.unlock();
        selectedEl = null;
        selectedPath = null;
      } else {
        deactivate();
      }
    }
  }

  // ── Card ────────────────────────────────────────────────────────────────────
  async function openCard(element, componentPath) {
    let projects = null;
    const isLGTM = LGTM_CONFIG.BUILD_TARGET === 'lgtm';

    if (isLGTM) {
      // Fetch from API, fall back to cached list
      projects = await LGTMAdapter.getProjects();
      if (projects) {
        chrome.storage.local.set({ cachedProjects: projects });
      } else {
        await new Promise(resolve => {
          chrome.storage.local.get('cachedProjects', d => {
            projects = d.cachedProjects || [];
            resolve();
          });
        });
      }
    }

    LGTMCard.show(element, componentPath, {
      projects,
      onSubmit: data => handleSubmit({ ...data, element, componentPath }),
      onCancel: () => {
        selectedEl = null;
        selectedPath = null;
        LGTMOverlay.unlock();
      }
    });
  }

  async function handleSubmit({ text, project, element, componentPath }) {
    const isLGTM = LGTM_CONFIG.BUILD_TARGET === 'lgtm';
    const submitLabel = isLGTM ? 'Add to LGTM ▶' : 'Copy';

    // Use screenshot captured on click (before card appeared); fall back to live capture
    let screenshotBase64 = pendingScreenshot;
    pendingScreenshot = null;
    if (!screenshotBase64) {
      try {
        screenshotBase64 = await captureElement(element);
      } catch (e) {
        console.warn('[LGTM Inspector] Screenshot failed:', e.message);
      }
    }

    const result = await LGTMAdapter.submit({
      text,
      componentPath,
      sourceURL: window.location.href,
      project,
      screenshotBase64
    });

    if (result.success) {
      LGTMCard.showStatus(isLGTM ? '✓ Added to LGTM' : '✓ Copied to clipboard', 'success');
      setTimeout(() => { LGTMCard.hide(); deactivate(); }, 1400);
    } else {
      LGTMCard.showStatus('⚠ ' + (result.error || 'エラーが発生しました'), 'error');
      LGTMCard.resetSubmit(submitLabel);
    }
  }

  // ── Screenshot capture ──────────────────────────────────────────────────────
  function captureElement(element) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ action: 'captureScreenshot' }, response => {
        if (chrome.runtime.lastError) {
          return reject(new Error(chrome.runtime.lastError.message));
        }
        if (!response || response.error) {
          return reject(new Error(response?.error || 'capture failed'));
        }
        annotateScreenshot(response.dataUrl, element).then(resolve).catch(reject);
      });
    });
  }

  // Full-viewport screenshot with the selected element highlighted in red.
  // Gives Claude Code the full UI context to understand where the element is,
  // instead of a tiny cropped image that loses all surrounding context.
  function annotateScreenshot(dataUrl, element) {
    return new Promise((resolve, reject) => {
      const rect = element.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) {
        return reject(new Error('zero-size element'));
      }

      const img = new Image();
      img.onload = () => {
        // Scale between screenshot pixels and CSS pixels (handles HiDPI)
        const scaleX = img.width / window.innerWidth;
        const scaleY = img.height / window.innerHeight;

        // Use native screenshot resolution (HiDPI/Retina already captured at 2x)
        const outputScale = 1;
        const canvasW = img.width;
        const canvasH = img.height;

        const canvas = document.createElement('canvas');
        canvas.width = canvasW;
        canvas.height = canvasH;
        const ctx = canvas.getContext('2d');

        // Draw full viewport
        ctx.drawImage(img, 0, 0, canvasW, canvasH);

        // Element bounds in canvas coordinates
        const ex = Math.round(rect.left * scaleX * outputScale);
        const ey = Math.round(rect.top  * scaleY * outputScale);
        const ew = Math.max(1, Math.round(rect.width  * scaleX * outputScale));
        const eh = Math.max(1, Math.round(rect.height * scaleY * outputScale));

        // Semi-transparent red fill
        ctx.fillStyle = 'rgba(239,68,68,0.25)';
        ctx.fillRect(ex, ey, ew, eh);

        // Solid red border
        ctx.strokeStyle = 'rgb(239,68,68)';
        ctx.lineWidth = Math.max(2, Math.round(3 * outputScale));
        ctx.strokeRect(ex - 1, ey - 1, ew + 2, eh + 2);

        resolve(canvas.toDataURL('image/png').split(',')[1]);
      };
      img.onerror = () => reject(new Error('image load failed'));
      img.src = dataUrl;
    });
  }

  // ── Message listener (from background) ─────────────────────────────────────
  chrome.runtime.onMessage.addListener(msg => {
    if (msg.action === 'toggleInspector') toggle();
  });

})();

})();
