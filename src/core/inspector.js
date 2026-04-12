// Component path detection with priority hierarchy:
// 1. data-component attribute  2. React Fiber  3. Vue  4. CSS classes  5. DOM
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

    // If the deepest part already contains slashes (full path), use it directly
    // Otherwise join ancestor parts with ' > '
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
    // Vue 3: __vueParentComponent on the element
    // Vue 2: __vue__ on the element
    const vueKey = Object.keys(element).find(
      k => k === '__vue__' || k === '__vueParentComponent'
    );
    if (!vueKey) return null;

    const names = [];
    let vm = element[vueKey];
    let depth = 0;
    while (vm && depth < 10) {
      // Vue 3 uses type.name, Vue 2 uses $options.name
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

  // --- 4. CSS classes ---
  function getCSSClassPath(element) {
    const ignore = /^(js-|is-|has-|active|disabled|hidden|show|fade|d-|text-|bg-|p-|m-|flex|grid|col-|row-)/i;
    const classes = [...(element.classList || [])]
      .filter(c => !ignore.test(c) && c.length > 1)
      .slice(0, 2);
    if (classes.length === 0) return null;
    return { path: classes.join('.'), accuracy: 'low' };
  }

  // --- 5. DOM hierarchy (last resort) ---
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
      getCSSClassPath(element) ||
      getDOMPath(element)
    );
  }

  return { getComponentPath };
})();
