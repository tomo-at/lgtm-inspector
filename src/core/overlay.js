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
