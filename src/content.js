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
  let pendingScreenshot = null; // captured on click/drag, before card UI appears

  // Drag selection state
  let dragStart = null;    // {x, y} recorded on mousedown
  let isDragging = false;  // true once drag threshold exceeded
  let dragHandled = false; // suppresses the click event that follows a completed drag
  let dragLocked = false;  // true while drag-region card is open (blocks hover highlight)

  // ── Activate / deactivate ──────────────────────────────────────────────────
  function activate() {
    if (active) return;
    active = true;
    document.documentElement.style.cursor = 'crosshair';
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
    LGTMOverlay.destroy();
    LGTMCard.hide();
    LGTMStyler.revert();   // undo any live CSS preview before tearing down
    LGTMStyler.reset();
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
    if (!el) return false;
    // Any element inside an LGTM-owned subtree (card, token popover, overlays).
    if (el.closest && el.closest('[id^="__lgtm_"]')) return true;
    return !!(el.id && el.id.startsWith('__lgtm_'));
  }

  function onMouseDown(e) {
    if (isOwnElement(e.target)) return;
    if (e.button !== 0) return;
    e.preventDefault();      // prevent text selection during drag
    e.stopPropagation();     // prevent page from seeing mousedown (closes menus/dropdowns)
    if (selectedEl || dragLocked) return; // card is open — ignore new selections
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

    if (selectedEl || dragLocked) return; // card is open — ignore new selections

    selectElement(e.target);
  }

  // Lock + screenshot + open card for a single element. Shared by click, DOM-tree
  // navigation, and edit-mode re-open (editCtx carries the entry being edited).
  function selectElement(element, editCtx) {
    selectedEl = element;
    selectedPath = LGTMInspector.getComponentPath(element);
    LGTMOverlay.lock(element);

    // Capture screenshot NOW — before the card UI appears in the viewport.
    // hideOwnUI keeps the lock highlight and the batch tray out of the shot.
    pendingScreenshot = null;
    captureElement(element, { hideOwnUI: true })
      .then(b64 => { pendingScreenshot = b64; })
      .catch(() => { pendingScreenshot = null; });

    openCard(element, selectedPath, editCtx);
  }

  // Re-select a related element (parent / first child / prev / next sibling).
  function navigateSelection(dir) {
    if (!selectedEl) return;
    const candidate = {
      parent: selectedEl.parentElement,
      child:  selectedEl.firstElementChild,
      prev:   selectedEl.previousElementSibling,
      next:   selectedEl.nextElementSibling
    }[dir];
    if (!isNavigable(candidate, dir)) return;

    // Drop any live preview on the current element before switching.
    LGTMStyler.revert();
    LGTMStyler.reset();
    LGTMCard.hide();
    LGTMOverlay.unlock();
    selectElement(candidate);
  }

  function isNavigable(el, dir) {
    if (!el || el.nodeType !== 1) return false;
    if (isOwnElement(el)) return false;
    if (dir === 'parent' && (el === document.body || el === document.documentElement)) return false;
    return true;
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      if (selectedEl) {
        // Close click-selection card, go back to hover mode
        LGTMCard.hide();
        LGTMStyler.revert();
        LGTMStyler.reset();
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
  // Fetch LGTM projects (live, falling back to the cached list). null for standalone.
  async function fetchProjects() {
    if (LGTM_CONFIG.BUILD_TARGET !== 'lgtm') return null;
    let projects = await LGTMAdapter.getProjects();
    if (projects) {
      chrome.storage.local.set({ cachedProjects: projects });
    } else {
      await new Promise(resolve => {
        chrome.storage.local.get('cachedProjects', d => { projects = d.cachedProjects || []; resolve(); });
      });
    }
    return projects;
  }

  async function openCard(element, componentPath, editCtx = {}) {
    const projects = await fetchProjects();

    const nav = {
      parent: isNavigable(element.parentElement, 'parent'),
      child:  isNavigable(element.firstElementChild, 'child'),
      prev:   isNavigable(element.previousElementSibling, 'prev'),
      next:   isNavigable(element.nextElementSibling, 'next')
    };

    const editId = editCtx.editId || null;

    LGTMCard.show(element, componentPath, {
      projects,
      nav,
      initialText: editCtx.initialText || '',
      seedEdits: editCtx.seedEdits || null,
      editId,
      onNavigate: navigateSelection,
      onSubmit: data => handleSubmit({ ...data, element, componentPath, editId }),
      onAdd: data => handleAdd({ ...data, element, componentPath, editId }),
      onCancel: () => {
        LGTMStyler.revert();
        LGTMStyler.reset();
        selectedEl = null;
        selectedPath = null;
        LGTMOverlay.unlock();
      }
    });
  }

  // Close the card and return to hover mode, dropping any live CSS preview.
  function dismissCard() {
    LGTMStyler.revert();
    LGTMStyler.reset();
    LGTMCard.hide();
    LGTMOverlay.unlock();
    selectedEl = null;
    selectedPath = null;
  }

  // Add the current element's edit to the batch tray (instead of sending now).
  // With editId, update the existing entry in place instead of adding a new one.
  async function handleAdd({ text, project, styleEdits, element, componentPath, editId }) {
    const edits = styleEdits || [];
    let screenshotBase64;
    if (edits.length) {
      try { screenshotBase64 = await captureElement(element, { hideOwnUI: true }); }
      catch (e) { screenshotBase64 = pendingScreenshot; }
    } else {
      screenshotBase64 = pendingScreenshot;
    }
    pendingScreenshot = null;

    const entry = {
      element, // kept for live re-editing later (may detach on SPA re-render)
      path: componentPath.path,
      accuracy: componentPath.accuracy,
      text,
      styleEdits: edits,
      screenshotBase64,
      project,
      sourceURL: window.location.href
    };
    if (editId) LGTMTray.replace(editId, entry);
    else LGTMTray.add(entry);
    dismissCard();
  }

  async function openDragCard(rect, componentPath) {
    const projects = await fetchProjects();

    LGTMCard.show(null, componentPath, {
      anchorRect: rect,
      projects,
      onSubmit: data => handleDragSubmit({ ...data, rect, componentPath }),
      onAdd: data => handleDragAdd({ ...data, rect, componentPath }),
      onCancel: () => { LGTMOverlay.hideDragRect(); dragLocked = false; }
    });
  }

  // Add a dragged-region annotation to the batch tray.
  async function handleDragAdd({ text, project, rect, componentPath }) {
    let screenshotBase64 = pendingScreenshot;
    pendingScreenshot = null;
    if (!screenshotBase64) {
      try { screenshotBase64 = await captureRegion(rect); } catch (e) { /* ignore */ }
    }
    LGTMTray.add({
      path: componentPath.path,
      accuracy: componentPath.accuracy,
      text,
      styleEdits: [],
      screenshotBase64,
      project,
      sourceURL: window.location.href
    });
    LGTMCard.hide();
    LGTMOverlay.hideDragRect();
    dragLocked = false;
  }

  // ── Edit a stacked entry ──────────────────────────────────────────────────────
  // Re-open the entry's element with its prior note + CSS edits restored and re-previewed.
  // If the element is gone (SPA re-render), fall back to a note-only editor.
  function handleEdit(entry) {
    if (selectedEl) dismissCard();
    if (dragLocked) { LGTMCard.hide(); LGTMOverlay.hideDragRect(); dragLocked = false; }
    activate(); // ensure Escape / selection guards are wired even if the inspector was off

    const el = entry.element;
    if (el && el.isConnected) {
      selectElement(el, {
        editId: entry.id,
        initialText: entry.text || '',
        seedEdits: entry.styleEdits || []
      });
    } else {
      openFallbackEdit(entry);
    }
  }

  // Fallback editor (element gone): note-only card with the CSS diff folded into editable text.
  async function openFallbackEdit(entry) {
    const isLGTM = LGTM_CONFIG.BUILD_TARGET === 'lgtm';
    const folded = [entry.text, LGTMStyler.formatEdits(entry.styleEdits, { isLGTM })].filter(Boolean).join('\n\n');
    const componentPath = { path: entry.path, accuracy: entry.accuracy };
    const projects = await fetchProjects();

    dragLocked = true; // reuse the "card open, ignore new selections" guard
    LGTMCard.show(null, componentPath, {
      projects,
      initialText: folded,
      editId: entry.id,
      onAdd: data => {
        LGTMTray.replace(entry.id, {
          element: null,
          path: entry.path,
          accuracy: entry.accuracy,
          text: data.text,
          styleEdits: [], // CSS was folded into the note text
          screenshotBase64: entry.screenshotBase64,
          project: data.project || entry.project,
          sourceURL: entry.sourceURL
        });
        LGTMCard.hide();
        dragLocked = false;
      },
      onSubmit: data => handleFallbackSubmit({ ...data, entry }),
      onCancel: () => { dragLocked = false; }
    });
  }

  async function handleFallbackSubmit({ text, project, entry }) {
    const isLGTM = LGTM_CONFIG.BUILD_TARGET === 'lgtm';
    const submitLabel = isLGTM ? 'Add to LGTM ▶' : 'Copy';
    const result = await LGTMAdapter.submit({
      text,
      componentPath: { path: entry.path, accuracy: entry.accuracy },
      sourceURL: entry.sourceURL || window.location.href,
      project: project || entry.project,
      screenshotBase64: entry.screenshotBase64
    });
    if (result.success) {
      LGTMTray.remove(entry.id);
      LGTMCard.showStatus(isLGTM ? '✓ Added to LGTM' : '✓ Copied to clipboard', 'success');
      setTimeout(() => { LGTMCard.hide(); dragLocked = false; }, 1400);
    } else {
      LGTMCard.showStatus('⚠ ' + (result.error || (isLGTM ? 'エラーが発生しました' : 'An error occurred')), 'error');
      LGTMCard.resetSubmit(submitLabel);
    }
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

  async function handleSubmit({ text, project, styleEdits, element, componentPath, editId }) {
    const isLGTM = LGTM_CONFIG.BUILD_TARGET === 'lgtm';
    const submitLabel = isLGTM ? 'Add to LGTM ▶' : 'Copy';

    const edits = styleEdits || [];
    const hasEdits = edits.length > 0;

    // Merge the CSS diff into the note text as before→after intent.
    const styleText = LGTMStyler.formatEdits(edits, { isLGTM });
    let finalText = [text, styleText].filter(Boolean).join('\n\n');
    if (!text && hasEdits) {
      const title = isLGTM ? `スタイル調整: ${componentPath.path}` : `Style tweak: ${componentPath.path}`;
      finalText = title + '\n\n' + styleText;
    }

    // With style edits, capture the *edited* (after) state — hide our own UI so the
    // card/overlay don't appear in the shot. Otherwise reuse the click-time (before) shot.
    let screenshotBase64;
    if (hasEdits) {
      try {
        screenshotBase64 = await captureElement(element, { hideOwnUI: true });
      } catch (e) {
        console.warn('[LGTM Inspector] Screenshot failed:', e.message);
        screenshotBase64 = pendingScreenshot;
      }
    } else {
      screenshotBase64 = pendingScreenshot;
      if (!screenshotBase64) {
        try {
          screenshotBase64 = await captureElement(element);
        } catch (e) {
          console.warn('[LGTM Inspector] Screenshot failed:', e.message);
        }
      }
    }
    pendingScreenshot = null;

    const result = await LGTMAdapter.submit({
      text: finalText,
      componentPath,
      sourceURL: window.location.href,
      project,
      screenshotBase64
    });

    if (result.success) {
      if (editId) LGTMTray.remove(editId); // this entry was just sent — drop it from the tray
      LGTMCard.showStatus(isLGTM ? '✓ Added to LGTM' : '✓ Copied to clipboard', 'success');
      setTimeout(() => { LGTMCard.hide(); deactivate(); }, 1400);
    } else {
      LGTMCard.showStatus('⚠ ' + (result.error || (isLGTM ? 'エラーが発生しました' : 'An error occurred')), 'error');
      LGTMCard.resetSubmit(submitLabel);
    }
  }

  // ── Screenshot capture ──────────────────────────────────────────────────────
  function captureElement(element, { hideOwnUI = false } = {}) {
    return new Promise((resolve, reject) => {
      // Hide LGTM overlays/card so they don't appear in the shot (used for the "after" capture).
      const lgtmEls = hideOwnUI ? [...document.querySelectorAll('[id^="__lgtm_"]')] : [];
      lgtmEls.forEach(el => { el.style.visibility = 'hidden'; });

      const run = () => chrome.runtime.sendMessage({ action: 'captureScreenshot' }, response => {
        lgtmEls.forEach(el => { el.style.visibility = ''; });
        if (chrome.runtime.lastError) {
          return reject(new Error(chrome.runtime.lastError.message));
        }
        if (!response || response.error) {
          return reject(new Error(response?.error || 'capture failed'));
        }
        annotateScreenshot(response.dataUrl, element).then(resolve).catch(reject);
      });

      // Double rAF ensures the visibility change is painted before capture fires.
      if (hideOwnUI) requestAnimationFrame(() => requestAnimationFrame(run));
      else run();
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

  // ── Batch send (from the tray) ───────────────────────────────────────────────
  async function handleBatchSend(entries) {
    if (!entries || entries.length === 0) return;
    const isLGTM = LGTM_CONFIG.BUILD_TARGET === 'lgtm';
    const result = await LGTMAdapter.submitBatch(entries);
    if (result.success) {
      LGTMTray.showStatus(isLGTM ? '✓ Added to LGTM' : '✓ Copied to clipboard', 'success');
      setTimeout(() => LGTMTray.clear(), 1200);
    } else {
      LGTMTray.resetSend();
      LGTMTray.showStatus('⚠ ' + (result.error || (isLGTM ? 'エラーが発生しました' : 'An error occurred')), 'error');
    }
  }

  LGTMTray.init({ onSend: handleBatchSend, onEdit: handleEdit });

  // ── Message listener (from background) ─────────────────────────────────────
  chrome.runtime.onMessage.addListener(msg => {
    if (msg.action === 'toggleInspector') toggle();
  });

})();
