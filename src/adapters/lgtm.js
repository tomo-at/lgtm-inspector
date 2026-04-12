// LGTM variant adapter — POSTs to local LGTM macOS app API
const LGTMAdapter = (() => {
  'use strict';

  const BASE = LGTM_CONFIG.API_BASE;
  const TIMEOUT_MS = 4000;

  function timeout(ms) {
    return new Promise((_, reject) =>
      setTimeout(() => reject(new Error('timeout')), ms)
    );
  }

  async function fetchWithTimeout(url, options) {
    return Promise.race([fetch(url, options), timeout(TIMEOUT_MS)]);
  }

  async function getProjects() {
    try {
      const resp = await fetchWithTimeout(`${BASE}/projects`, { method: 'GET' });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      return data.projects || [];
    } catch (e) {
      console.warn('[LGTM Inspector] Could not reach LGTM app:', e.message);
      return null; // null = app not running
    }
  }

  async function submit({ text, componentPath, sourceURL, project, screenshotBase64 }) {
    if (!project) {
      return { success: false, error: 'プロジェクトを選択してください' };
    }

    const payload = {
      title: text,
      componentPath: componentPath.path,
      projectName: project,
      sourceURL: sourceURL || '',
      screenshotBase64: screenshotBase64 || null
    };

    try {
      const resp = await fetchWithTimeout(`${BASE}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${resp.status}`);
      }
      return { success: true };
    } catch (e) {
      const msg = e.message === 'timeout' || e.message.includes('fetch') || e.message.includes('Failed to fetch')
        ? 'LGTM app is not running'
        : e.message;
      return { success: false, error: msg };
    }
  }

  return { getProjects, submit };
})();
