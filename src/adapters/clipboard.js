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
    if (componentPath.source) {
      lines.push(`Source: ${componentPath.source}`);
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

  // Batch — combine all entries into one clipboard blob. Each entry's screenshot is
  // saved to disk and its path appended in a trailing list.
  async function submitBatch(entries) {
    const saved = [];
    for (let i = 0; i < entries.length; i++) {
      const b64 = entries[i].screenshotBase64;
      if (!b64) continue;
      const res = await new Promise(resolve => {
        chrome.runtime.sendMessage({ action: 'saveScreenshot', base64: b64 }, r => resolve(r || {}));
      });
      if (res.path) saved.push(`- [${i + 1}] ${res.path}`);
    }

    let text = LGTMTray.formatBatch(entries, { isLGTM: false });
    if (saved.length) text += '\n\nScreenshots:\n' + saved.join('\n');

    try {
      await navigator.clipboard.writeText(text);
      return { success: true };
    } catch (e) {
      return { success: false, error: 'Clipboard access denied' };
    }
  }

  return { getProjects, submit, submitBatch };
})();
