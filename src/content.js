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
  let pendingScreenshot = null; // captured on click/drag, before card UI appears

  // Drag selection state
  let dragStart = null;    // {x, y} recorded on mousedown
  let isDragging = false;  // true once drag threshold exceeded
  let dragHandled = false; // suppresses the click event that follows a completed drag
  let dragLocked = false;  // true while drag-region card is open (blocks hover highlight)

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
    document.addEventListener('mousedown', onMouseDown, true);
    document.addEventListener('mousemove', onMouseMove, true);
    document.addEventListener('mouseup', onMouseUp, true);
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
    dragStart = null;
    isDragging = false;
    dragHandled = false;
    dragLocked = false;
    document.removeEventListener('mousedown', onMouseDown, true);
    document.removeEventListener('mousemove', onMouseMove, true);
    document.removeEventListener('mouseup', onMouseUp, true);
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

  function onMouseDown(e) {
    if (isOwnElement(e.target)) return;
    if (e.button !== 0) return;
    e.preventDefault();      // prevent text selection during drag
    e.stopPropagation();     // prevent page from seeing mousedown (closes menus/dropdowns)
    dragStart = { x: e.clientX, y: e.clientY };
    isDragging = false;
  }

  function onMouseMove(e) {
    if (selectedEl || dragLocked) return; // locked after click or drag
    if (isOwnElement(e.target)) return;

    if (dragStart) {
      const dx = e.clientX - dragStart.x;
      const dy = e.clientY - dragStart.y;
      if (!isDragging && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) {
        isDragging = true;
        LGTMOverlay.hide(); // hide component highlight while drawing rect
      }
      if (isDragging) {
        e.stopPropagation(); // prevent page hover/drag handlers during screenshot selection
        LGTMOverlay.showDragRect(dragStart.x, dragStart.y, e.clientX, e.clientY);
        return;
      }
    }

    const path = LGTMInspector.getComponentPath(e.target);
    LGTMOverlay.show(e.target, path, e.clientX, e.clientY);
  }

  function onMouseUp(e) {
    if (!dragStart || isOwnElement(e.target)) return;

    const dx = e.clientX - dragStart.x;
    const dy = e.clientY - dragStart.y;
    const moved = Math.abs(dx) > 5 || Math.abs(dy) > 5;

    const start = dragStart;
    dragStart = null;
    isDragging = false;

    if (!moved) return; // let onClick handle it as a normal click

    // Drag completed — suppress the upcoming click event
    dragHandled = true;
    e.preventDefault();
    e.stopPropagation();

    const rect = {
      left:   Math.min(start.x, e.clientX),
      top:    Math.min(start.y, e.clientY),
      right:  Math.max(start.x, e.clientX),
      bottom: Math.max(start.y, e.clientY),
      width:  Math.abs(dx),
      height: Math.abs(dy)
    };

    LGTMOverlay.lockDragRect();
    LGTMOverlay.hide(); // hide component highlight so only drag rect remains
    dragLocked = true;

    const isLGTM = LGTM_CONFIG.BUILD_TARGET === 'lgtm';
    const regionPath = { path: isLGTM ? '選択範囲' : 'Selected area', accuracy: 'high' };

    pendingScreenshot = null;
    captureRegion(rect)
      .then(b64 => { pendingScreenshot = b64; })
      .catch(() => { pendingScreenshot = null; });

    openDragCard(rect, regionPath);
  }

  function onClick(e) {
    if (dragHandled) {
      dragHandled = false;
      e.preventDefault();
      e.stopPropagation();
      return;
    }
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
        // Close click-selection card, go back to hover mode
        LGTMCard.hide();
        LGTMOverlay.unlock();
        selectedEl = null;
        selectedPath = null;
      } else if (dragLocked) {
        // Close drag-selection card, go back to hover mode
        LGTMCard.hide();
        LGTMOverlay.hideDragRect();
        dragLocked = false;
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

  async function openDragCard(rect, componentPath) {
    let projects = null;
    const isLGTM = LGTM_CONFIG.BUILD_TARGET === 'lgtm';

    if (isLGTM) {
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

    LGTMCard.show(null, componentPath, {
      anchorRect: rect,
      projects,
      onSubmit: data => handleDragSubmit({ ...data, rect, componentPath }),
      onCancel: () => { LGTMOverlay.hideDragRect(); dragLocked = false; }
    });
  }

  async function handleDragSubmit({ text, project, rect, componentPath }) {
    const isLGTM = LGTM_CONFIG.BUILD_TARGET === 'lgtm';
    const submitLabel = isLGTM ? 'Add to LGTM ▶' : 'Copy';

    let screenshotBase64 = pendingScreenshot;
    pendingScreenshot = null;
    if (!screenshotBase64) {
      try {
        screenshotBase64 = await captureRegion(rect);
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
      setTimeout(() => { LGTMCard.hide(); LGTMOverlay.hideDragRect(); deactivate(); }, 1400);
    } else {
      LGTMCard.showStatus('⚠ ' + (result.error || (isLGTM ? 'エラーが発生しました' : 'An error occurred')), 'error');
      LGTMCard.resetSubmit(submitLabel);
    }
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
      LGTMCard.showStatus('⚠ ' + (result.error || (isLGTM ? 'エラーが発生しました' : 'An error occurred')), 'error');
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

  // Capture full viewport and crop to the dragged rect (2px inset to exclude the selection border).
  function captureRegion(rect) {
    return new Promise((resolve, reject) => {
      // Hide all LGTM overlays so the selection highlight doesn't tint the screenshot.
      // Double rAF ensures the visibility change is painted before captureVisibleTab fires.
      const lgtmEls = [...document.querySelectorAll('[id^="__lgtm_"]')];
      lgtmEls.forEach(el => { el.style.visibility = 'hidden'; });

      requestAnimationFrame(() => requestAnimationFrame(() => {
        chrome.runtime.sendMessage({ action: 'captureScreenshot' }, response => {
          lgtmEls.forEach(el => { el.style.visibility = ''; });
          if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
          if (!response || response.error) return reject(new Error(response?.error || 'capture failed'));
          cropScreenshot(response.dataUrl, rect).then(resolve).catch(reject);
        });
      }));
    });
  }

  function cropScreenshot(dataUrl, rect) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const scaleX = img.width / window.innerWidth;
        const scaleY = img.height / window.innerHeight;
        const pad = 2; // inset by selection border width to avoid blue frame in image
        const sx = Math.round((rect.left + pad) * scaleX);
        const sy = Math.round((rect.top  + pad) * scaleY);
        const sw = Math.max(1, Math.round((rect.width  - pad * 2) * scaleX));
        const sh = Math.max(1, Math.round((rect.height - pad * 2) * scaleY));
        const canvas = document.createElement('canvas');
        canvas.width = sw;
        canvas.height = sh;
        canvas.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
        resolve(canvas.toDataURL('image/png').split(',')[1]);
      };
      img.onerror = () => reject(new Error('image load failed'));
      img.src = dataUrl;
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
