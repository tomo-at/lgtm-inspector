// Service worker — icon state management + programmatic content script injection
'use strict';

const BUILD_TARGET = '__BUILD_TARGET__';

function isLocalhost(url) {
  if (!url) return false;
  try {
    const { hostname } = new URL(url);
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
  } catch { return false; }
}

function updateAction(tabId, url) {
  if (BUILD_TARGET === 'lgtm' && !isLocalhost(url)) {
    chrome.action.disable(tabId);
  } else {
    chrome.action.enable(tabId);
  }
}

// Track tab URL changes
chrome.tabs.onActivated.addListener(({ tabId }) => {
  chrome.tabs.get(tabId, tab => {
    if (!chrome.runtime.lastError) updateAction(tabId, tab.url);
  });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url !== undefined || changeInfo.status === 'complete') {
    updateAction(tabId, tab.url);
  }
});

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
  if (BUILD_TARGET === 'lgtm' && !isLocalhost(tab.url)) return;
  toggleInTab(tab.id);
});

const LGTM_API = 'http://127.0.0.1:41234';

// Handle messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Proxy: GET /projects — avoids content script CORS / host_permission issues
  if (message.action === 'getProjects') {
    fetch(`${LGTM_API}/projects`)
      .then(r => r.json())
      .then(data => sendResponse({ projects: data.projects || [] }))
      .catch(e => sendResponse({ error: e.message }));
    return true;
  }

  // Proxy: POST /tasks
  if (message.action === 'submitTask') {
    fetch(`${LGTM_API}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message.payload)
    })
      .then(r => r.ok
        ? r.json().then(data => sendResponse({ data }))
        : r.json().then(e => sendResponse({ error: e.error || `HTTP ${r.status}` }))
      )
      .catch(e => sendResponse({ error: e.message }));
    return true;
  }

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
