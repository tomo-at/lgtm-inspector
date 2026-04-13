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
