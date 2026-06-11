// Service worker — programmatic content script injection + screenshot relay
'use strict';

// Inject content script programmatically (if not already present), then toggle.
// Uses the activeTab grant from action click / _execute_action shortcut.
async function toggleInTab(tabId) {
  try {
    // Inject content.js; the guard inside (window.__lgtmInspectorLoaded) makes re-injection a no-op
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content.js']
    });
  } catch (e) {
    console.warn('[LGTM] Failed to inject content script:', e.message);
    return;
  }
  chrome.tabs.sendMessage(tabId, { action: 'toggleInspector' }, () => void chrome.runtime.lastError);
}

// Action icon click (or _execute_action shortcut) → toggle inspector in active tab
chrome.action.onClicked.addListener(tab => {
  toggleInTab(tab.id);
});

// Handle messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Screenshot capture relay
  if (message.action === 'captureScreenshot') {
    const windowId = sender.tab ? sender.tab.windowId : chrome.windows.WINDOW_ID_CURRENT;
    chrome.tabs.captureVisibleTab(windowId, { format: 'png' }, dataUrl => {
      if (chrome.runtime.lastError) {
        sendResponse({ error: chrome.runtime.lastError.message });
      } else {
        sendResponse({ dataUrl });
      }
    });
    return true;
  }

  // Save screenshot to disk (standalone only — requires "downloads" permission)
  if (message.action === 'saveScreenshot') {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `lgtm-inspector/screenshot-${timestamp}.png`;
    chrome.downloads.download({
      url: `data:image/png;base64,${message.base64}`,
      filename,
      saveAs: false,
      conflictAction: 'uniquify'
    }, id => {
      if (chrome.runtime.lastError) {
        sendResponse({ error: chrome.runtime.lastError.message });
        return;
      }

      let responded = false;
      function respond(path) {
        if (responded) return;
        responded = true;
        chrome.downloads.onChanged.removeListener(onChange);
        sendResponse({ path });
      }

      // onChanged fires with delta.filename.current once Chrome resolves the absolute path
      function onChange(delta) {
        if (delta.id !== id) return;
        if (delta.filename && delta.filename.current) respond(delta.filename.current);
      }
      chrome.downloads.onChanged.addListener(onChange);

      // Also check immediately — filename may already be resolved on fast machines
      chrome.downloads.search({ id }, items => {
        const path = items && items[0] && items[0].filename;
        if (path && path.startsWith('/')) respond(path);
      });
    });
    return true;
  }
});
