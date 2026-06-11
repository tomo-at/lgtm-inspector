// Component path detection with priority hierarchy:
// 1. data-component attribute
// 2. React Fiber
// 3. Vue
// 4. Custom HTML element (web component — tag contains hyphen)
// 5. data-testid / data-cy / data-qa / data-test
// 6. CSS class hierarchy (kebab-case component-like names, walks up to 8 levels)
// 7. Nearest meaningful element ID
// 8. DOM hierarchy (last resort, accuracy: 'low')
const LGTMInspector = (() => {
  'use strict';

  // --- 1. data-component (primary) ---
  function getDataComponentPath(element) {
    const parts = [];
    let current = element;
    while (current && current !== document.documentElement) {
      if (current.dataset && current.dataset.component) {
        parts.unshift(current.dataset.component);
      }
      current = current.parentElement;
    }
    if (parts.length === 0) return null;

    const deepest = parts[parts.length - 1];
    if (deepest.includes('/')) {
      return { path: deepest.replace(/\//g, ' > '), accuracy: 'high' };
    }
    return { path: parts.join(' > '), accuracy: 'high' };
  }

  // --- 2. React Fiber ---
  function getReactComponentPath(element) {
    const fiberKey = Object.keys(element).find(
      k => k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance')
    );
    if (!fiberKey) return null;

    const names = [];
    let fiber = element[fiberKey];
    let depth = 0;
    while (fiber && depth < 30) {
      const type = fiber.type;
      if (type && typeof type === 'function') {
        const name = type.displayName || type.name;
        if (name && !/^[a-z]/.test(name) && name !== 'Component' && !name.startsWith('_')) {
          if (!names.includes(name)) names.unshift(name);
        }
      }
      fiber = fiber.return;
      depth++;
      if (names.length >= 5) break;
    }
    if (names.length === 0) return null;
    return { path: names.join(' > '), accuracy: 'medium' };
  }

  // --- 3. Vue ---
  function getVueComponentPath(element) {
    const vueKey = Object.keys(element).find(
      k => k === '__vue__' || k === '__vueParentComponent'
    );
    if (!vueKey) return null;

    const names = [];
    let vm = element[vueKey];
    let depth = 0;
    while (vm && depth < 10) {
      const name = vm.type?.name || vm.$options?.name || vm.$options?.__name;
      if (name && name !== 'App' && !name.startsWith('_')) {
        names.unshift(name);
      }
      vm = vm.parent || vm.$parent;
      depth++;
      if (names.length >= 5) break;
    }
    if (names.length === 0) return null;
    return { path: names.join(' > '), accuracy: 'medium' };
  }

  // --- 4. Custom element tag name (Web Components) ---
  // Custom elements must have a hyphen in the tag name (spec requirement).
  function getCustomElementPath(element) {
    let el = element;
    while (el && el !== document.documentElement) {
      if (el.tagName && el.tagName.includes('-')) {
        return { path: el.tagName.toLowerCase(), accuracy: 'medium' };
      }
      el = el.parentElement;
    }
    return null;
  }

  // --- 5. Test IDs ---
  // data-testid / data-cy / data-qa are commonly set to component names in design systems.
  function getTestIdPath(element) {
    const attrs = ['data-testid', 'data-cy', 'data-qa', 'data-test', 'data-e2e'];
    let el = element;
    while (el && el !== document.documentElement) {
      for (const attr of attrs) {
        const val = el.getAttribute(attr);
        if (val && val.trim().length > 0) {
          return { path: val.trim(), accuracy: 'medium' };
        }
      }
      el = el.parentElement;
    }
    return null;
  }

  // --- 6. CSS class hierarchy ---
  // Walks up to 8 ancestor levels looking for kebab-case class names that look like component
  // names (e.g. name-tag, color-chip, hero-headline). Excludes Tailwind/Bootstrap utility classes.
  function getCSSClassPath(element) {
    // Requires: 2+ segments separated by hyphens, each segment 2+ lowercase letters/digits.
    // e.g. name-tag ✓  color-chip ✓  flex-col ✗ (filtered below)  p-4 ✗
    const isComponentClass = c =>
      /^[a-z]{2,}(-[a-z][a-z0-9]+)+$/.test(c) &&
      !/^(is-|has-|js-|d-|p-|m-|px-|py-|pt-|pb-|pl-|pr-|mx-|my-|mt-|mb-|ml-|mr-|w-|h-|min-|max-|text-|bg-|border-|flex-|grid-|col-|row-|gap-|space-|rounded-|shadow-|font-|leading-|tracking-|overflow-|cursor-|ring-|sr-|z-)/.test(c);

    let el = element;
    let depth = 0;
    while (el && el !== document.documentElement && depth < 8) {
      const found = [...(el.classList || [])].find(isComponentClass);
      if (found) return { path: found, accuracy: 'medium' };
      el = el.parentElement;
      depth++;
    }
    return null;
  }

  // --- 7. Nearest meaningful element ID ---
  function getNearestIdPath(element) {
    let el = element;
    while (el && el !== document.documentElement) {
      const id = el.id;
      // Skip generated IDs: starts with __, starts with digit, looks like a UUID/hash
      if (id && !id.startsWith('__') && !/^\d/.test(id) && !/^[a-f0-9-]{8,}$/i.test(id)) {
        return { path: `#${id}`, accuracy: 'medium' };
      }
      el = el.parentElement;
    }
    return null;
  }

  // --- 8. DOM hierarchy (last resort) ---
  function getDOMPath(element) {
    const parts = [];
    let current = element;
    let depth = 0;
    while (current && current !== document.body && depth < 4) {
      const tag = current.tagName.toLowerCase();
      const id = current.id ? `#${current.id}` : '';
      parts.unshift(`${tag}${id}`);
      current = current.parentElement;
      depth++;
    }
    return { path: parts.join(' > ') || element.tagName.toLowerCase(), accuracy: 'low' };
  }

  function getComponentPath(element) {
    return (
      getDataComponentPath(element) ||
      getReactComponentPath(element) ||
      getVueComponentPath(element) ||
      getCustomElementPath(element) ||
      getTestIdPath(element) ||
      getCSSClassPath(element) ||
      getNearestIdPath(element) ||
      getDOMPath(element)
    );
  }

  // --- Source location (dev builds only) ---
  // Maps an element back to where it's written in source — the one thing component
  // paths can't give. React dev builds (with @babel/plugin-transform-react-jsx-source,
  // default in CRA/Next/Vite dev) expose fiber._debugSource = { fileName, lineNumber }.
  // Vue dev SFCs expose component type.__file. Production builds strip both → null.
  function cleanFile(file) {
    let f = String(file)
      .replace(/^webpack-internal:\/\/\/(\.\/)?/, '')
      .replace(/^(?:file|webpack):\/\//, '')
      .replace(/\?.*$/, '');
    // Trim to a recognizable repo-relative tail when present, else keep as-is.
    const m = f.match(/(?:^|\/)((?:src|app|components|pages|lib|ui|packages)\/.+)$/);
    return m ? m[1] : f;
  }

  function getSourceLocation(element) {
    if (!element || typeof element !== 'object') return null;

    // 0. Dev-inspector data attributes (react-dev-inspector, locatorjs, custom babel plugins).
    //    Works on ANY framework/version when the team opts in — and is the only reliable path
    //    on React 19 / Next App Router, which no longer expose fiber._debugSource.
    if (typeof element.closest === 'function') {
      const tagged = element.closest(
        '[data-inspector-relative-path],[data-source-file],[data-sourcefile],[data-source]'
      );
      if (tagged) {
        const path = tagged.getAttribute('data-inspector-relative-path') ||
                     tagged.getAttribute('data-source-file') ||
                     tagged.getAttribute('data-sourcefile') ||
                     tagged.getAttribute('data-source');
        const line = tagged.getAttribute('data-inspector-line') ||
                     tagged.getAttribute('data-source-line');
        if (path) return cleanFile(path) + (line ? ':' + line : '');
      }
    }

    // 1. React ≤18 dev: walk the fiber tree for the nearest _debugSource.
    const fiberKey = Object.keys(element).find(
      k => k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance')
    );
    if (fiberKey) {
      let fiber = element[fiberKey];
      let depth = 0;
      while (fiber && depth < 30) {
        const src = fiber._debugSource;
        if (src && src.fileName) {
          return cleanFile(src.fileName) + (src.lineNumber ? ':' + src.lineNumber : '');
        }
        fiber = fiber.return;
        depth++;
      }
    }

    // Vue: walk component instances for type.__file.
    const vueKey = Object.keys(element).find(
      k => k === '__vueParentComponent' || k === '__vue__'
    );
    if (vueKey) {
      let vm = element[vueKey];
      let depth = 0;
      while (vm && depth < 10) {
        const file = (vm.type && vm.type.__file) ||
                     (vm.$options && (vm.$options.__file || vm.$options.__source));
        if (file) return cleanFile(file);
        vm = vm.parent || vm.$parent;
        depth++;
      }
    }

    return null;
  }

  return { getComponentPath, getSourceLocation };
})();
