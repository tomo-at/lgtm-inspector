// Standalone variant adapter — saves screenshot to disk, copies text + path to clipboard
const LGTMAdapter = (() => {
  'use strict';

  // Projects not relevant for standalone
  async function getProjects() {
    return null;
  }

  async function submit({ text, componentPath, sourceURL, screenshotBase64 }) {
    const lines = [text, ''];
    // Exclude DOM-hierarchy fallbacks (accuracy: 'low')
    if (componentPath.accuracy !== 'low') {
      lines.push(`Component: ${componentPath.path}`);
    }
    lines.push(`URL: ${sourceURL || window.location.href}`);

    // Save screenshot to ~/Downloads/lgtm-inspector/ and append path to text
    if (screenshotBase64) {
      const saved = await new Promise(resolve => {
        chrome.runtime.sendMessage({ action: 'saveScreenshot', base64: screenshotBase64 }, response => {
          resolve(response || {});
        });
      });
      if (saved.path) {
        lines.push(`Screenshot: ${saved.path}`);
      }
    }

    const plainText = lines.join('\n');

    try {
      await navigator.clipboard.writeText(plainText);
      return { success: true };
    } catch (e) {
      return { success: false, error: 'Clipboard access denied' };
    }
  }

  return { getProjects, submit };
})();
