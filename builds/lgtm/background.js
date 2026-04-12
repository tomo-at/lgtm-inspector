// Service worker — icon state management + screenshot capture relay
'use strict';

function isLocalhost(url) {
  if (!url) return false;
  try {
    const { hostname } = new URL(url);
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
  } catch { return false; }
}

function updateAction(tabId, url) {
  if (isLocalhost(url)) {
    chrome.action.enable(tabId);
  } else {
    chrome.action.disable(tabId);
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

// Action icon click → toggle inspector in active tab
chrome.action.onClicked.addListener(tab => {
  if (isLocalhost(tab.url)) {
    chrome.tabs.sendMessage(tab.id, { action: 'toggleInspector' });
  }
});

// Keyboard shortcut
chrome.commands.onCommand.addListener((command, tab) => {
  if (command === 'toggle-inspector' && tab && isLocalhost(tab.url)) {
    chrome.tabs.sendMessage(tab.id, { action: 'toggleInspector' }, () => {
      // Ignore "no receiver" errors (page may not have loaded content script yet)
      void chrome.runtime.lastError;
    });
  }
});

// Handle messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'captureScreenshot') {
    const windowId = sender.tab ? sender.tab.windowId : chrome.windows.WINDOW_ID_CURRENT;
    chrome.tabs.captureVisibleTab(windowId, { format: 'png' }, dataUrl => {
      if (chrome.runtime.lastError) {
        sendResponse({ error: chrome.runtime.lastError.message });
      } else {
        sendResponse({ dataUrl });
      }
    });
    return true; // Keep channel open for async response
  }
});
