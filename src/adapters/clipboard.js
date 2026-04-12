// Standalone variant adapter — copies formatted text to clipboard
const LGTMAdapter = (() => {
  'use strict';

  // Projects not relevant for standalone
  async function getProjects() {
    return null;
  }

  async function submit({ text, componentPath, sourceURL, screenshotBase64 }) {
    const lines = [
      text,
      '',
      `Component: ${componentPath.path}`,
      `URL: ${sourceURL || window.location.href}`
    ];

    const plainText = lines.join('\n');

    // Attempt to write text + image together if screenshot is small enough
    if (screenshotBase64 && screenshotBase64.length < 800000) {
      try {
        const blob = await fetch(`data:image/png;base64,${screenshotBase64}`).then(r => r.blob());
        const textBlob = new Blob([plainText], { type: 'text/plain' });
        await navigator.clipboard.write([
          new ClipboardItem({ 'text/plain': textBlob, 'image/png': blob })
        ]);
        return { success: true };
      } catch (_) {
        // Fall through to text-only
      }
    }

    try {
      await navigator.clipboard.writeText(plainText);
      return { success: true };
    } catch (e) {
      return { success: false, error: 'クリップボードへのアクセスが拒否されました' };
    }
  }

  return { getProjects, submit };
})();
