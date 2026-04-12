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

    // Capture screenshot (non-fatal)
    let screenshotBase64 = null;
    try {
      screenshotBase64 = await captureElement(element);
    } catch (e) {
      console.warn('[LGTM Inspector] Screenshot failed:', e.message);
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
        cropToElement(response.dataUrl, element).then(resolve).catch(reject);
      });
    });
  }

  function cropToElement(dataUrl, element) {
    return new Promise((resolve, reject) => {
      const rect = element.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) {
        return reject(new Error('zero-size element'));
      }

      const img = new Image();
      img.onload = () => {
        // Scale factor between screenshot pixels and CSS pixels
        const scaleX = img.width / window.innerWidth;
        const scaleY = img.height / window.innerHeight;

        const sx = Math.round(rect.left * scaleX);
        const sy = Math.round(rect.top * scaleY);
        const sw = Math.round(rect.width * scaleX);
        const sh = Math.round(rect.height * scaleY);

        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, sw);
        canvas.height = Math.max(1, sh);
        canvas.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
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
