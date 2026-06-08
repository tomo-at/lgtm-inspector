// Curated CSS editor panel — live inline-style preview + diff extraction.
// Not a DevTools clone: shows a focused set of commonly-tweaked properties,
// applies edits as inline styles for instant preview, and reports only the
// changed properties as before→after intent for Claude Code to translate into
// the real source edit (Tailwind class, CSS rule, etc.).
//
// Prefers design tokens over hardcoded values: scans the page's CSS custom
// properties (--vars defined on :root/html) and lets the user pick one. Picking
// a token sets the value to `var(--token)`, so the diff carries token intent
// (e.g. `color: rgb(51,51,51) → var(--text-strong)`) — safer to apply in source.
const LGTMStyler = (() => {
  'use strict';

  // Curated set of commonly-tweaked properties.
  //   type  — 'color' shows a native color swatch.
  //   tok   — which token KINDS the picker offers (see classify()): 'color' | 'length' | 'number' | 'other'.
  //   hints — name substrings marking semantically-relevant tokens. Those rank first; the rest
  //           stay reachable under a collapsible "Other (N)". Empty hints → all kind-matches are
  //           primary (e.g. color rows). Hints never hide tokens, so unusual naming won't empty the list.
  const PROPS = [
    { key: 'color',            label: 'Text color',    labelJa: '文字色',   type: 'color', tok: ['color'],            hints: [] },
    { key: 'background-color', label: 'Background',     labelJa: '背景色',   type: 'color', tok: ['color'],            hints: [] },
    { key: 'font-size',        label: 'Font size',      labelJa: '文字サイズ', type: 'text',  tok: ['length'],           hints: ['font-size', 'fontsize', 'font', 'text'] },
    { key: 'font-weight',      label: 'Font weight',    labelJa: '太さ',     type: 'text',  tok: ['number'],           hints: ['weight'] },
    { key: 'line-height',      label: 'Line height',    labelJa: '行間',     type: 'text',  tok: ['length', 'number'], hints: ['line-height', 'lineheight', 'leading', 'line'] },
    { key: 'letter-spacing',   label: 'Letter spacing', labelJa: '字間',     type: 'text',  tok: ['length'],           hints: ['letter', 'tracking'] },
    { key: 'padding',          label: 'Padding',        labelJa: '内側余白', type: 'text',  tok: ['length'],           hints: ['space', 'spacing', 'pad', 'inset', 'gap'] },
    { key: 'margin',           label: 'Margin',         labelJa: '外側余白', type: 'text',  tok: ['length'],           hints: ['space', 'spacing', 'margin', 'gap', 'inset'] },
    { key: 'width',            label: 'Width',          labelJa: '幅',       type: 'text',  tok: ['length'],           hints: ['size', 'width', 'dimension'] },
    { key: 'height',           label: 'Height',         labelJa: '高さ',     type: 'text',  tok: ['length'],           hints: ['size', 'height', 'dimension'] },
    { key: 'border-radius',    label: 'Radius',         labelJa: '角丸',     type: 'text',  tok: ['length'],           hints: ['radius', 'radii', 'rounded', 'corner'] },
    { key: 'border',           label: 'Border',         labelJa: '枠線',     type: 'text',  tok: ['color', 'length'],  hints: ['border', 'stroke', 'outline'] },
    { key: 'box-shadow',       label: 'Shadow',         labelJa: '影',       type: 'text',  tok: ['other', 'color'],   hints: ['shadow', 'elevation', 'blur'] },
    { key: 'opacity',          label: 'Opacity',        labelJa: '不透明度', type: 'text',  tok: ['number'],           hints: ['opacity', 'alpha'] },
  ];

  let targetEl = null;
  let rows = [];   // { key, label, input, orig, origInline, row }
  let popEl = null; // shared token popover (appended to <html>, outside the card)

  function rgbToHex(v) {
    const m = (v || '').match(/^rgba?\(([^)]+)\)$/i);
    if (!m) return /^#[0-9a-f]{3,8}$/i.test((v || '').trim()) ? (v || '').trim() : null;
    const [r, g, b] = m[1].split(',').map(s => parseInt(s, 10));
    if ([r, g, b].some(n => Number.isNaN(n))) return null;
    const hex = n => Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0');
    return '#' + hex(r) + hex(g) + hex(b);
  }

  // ── Design tokens ───────────────────────────────────────────────────────────
  function classify(v) {
    v = (v || '').trim();
    if (/^#[0-9a-f]{3,8}$/i.test(v) || /^rgba?\(/i.test(v) || /^hsla?\(/i.test(v)) return 'color';
    if (/^-?\d*\.?\d+(px|rem|em|%|vh|vw|vmin|vmax|pt|ch)$/.test(v)) return 'length';
    if (/^-?\d*\.?\d+$/.test(v)) return 'number';   // unitless: font-weight, line-height, opacity
    return 'other';
  }

  function collectFromRules(rules, map) {
    for (const rule of Array.from(rules)) {
      // Custom properties defined on :root / html — the usual design-token home.
      if (rule.style && rule.selectorText && /(^|,|\s)(:root|html)(\s|,|:|$)/i.test(rule.selectorText)) {
        const st = rule.style;
        for (let i = 0; i < st.length; i++) {
          const p = st[i];
          if (p.startsWith('--') && !map.has(p)) map.set(p, st.getPropertyValue(p).trim());
        }
      }
      // Recurse into @media / @supports groups.
      if (rule.cssRules) { try { collectFromRules(rule.cssRules, map); } catch (e) { /* ignore */ } }
    }
  }

  function collectTokens() {
    const map = new Map();
    for (const sheet of Array.from(document.styleSheets || [])) {
      let rules;
      try { rules = sheet.cssRules; } catch (e) { continue; } // cross-origin sheet — skip
      if (rules) collectFromRules(rules, map);
    }
    const rootCS = getComputedStyle(document.documentElement);
    const out = [];
    for (const [name, raw] of map) {
      const resolved = (rootCS.getPropertyValue(name) || raw || '').trim();
      if (!resolved) continue;
      out.push({ name, value: resolved, kind: classify(resolved) });
    }
    out.sort((a, b) => a.name.localeCompare(b.name));
    return out;
  }

  function tokensFor(kinds, tokens) {
    return tokens.filter(t => kinds.includes(t.kind));
  }

  // Leading numeric value of a token (for size-ordered sorting). null for colors/complex values.
  function tokenNum(v) {
    const n = parseFloat(v);
    return Number.isNaN(n) ? null : n;
  }

  // Split a property's kind-matching tokens into semantically-relevant (primary) and the rest
  // (other), each sorted by numeric value when possible, else by name.
  function rankTokens(prop, tokens) {
    const kindMatch = tokensFor(prop.tok, tokens);
    const hints = prop.hints || [];
    let primary, other;
    if (hints.length === 0) {
      primary = kindMatch.slice();
      other = [];
    } else {
      primary = kindMatch.filter(t => { const n = t.name.toLowerCase(); return hints.some(h => n.includes(h)); });
      other = kindMatch.filter(t => !primary.includes(t));
    }
    const sorter = (a, b) => {
      const na = tokenNum(a.value), nb = tokenNum(b.value);
      if (na != null && nb != null && na !== nb) return na - nb;
      return a.name.localeCompare(b.name);
    };
    primary.sort(sorter);
    other.sort(sorter);
    return { primary, other };
  }

  function ensurePopover() {
    if (popEl) return popEl;
    popEl = document.createElement('div');
    popEl.id = '__lgtm_tokpop__';
    popEl.style.display = 'none';
    document.documentElement.appendChild(popEl);
    document.addEventListener('mousedown', onDocDownForPopover, true);
    return popEl;
  }

  function onDocDownForPopover(e) {
    if (popEl && popEl.style.display !== 'none' &&
        !popEl.contains(e.target) && !e.target.classList.contains('__lgtokbtn')) {
      hidePopover();
    }
  }

  function hidePopover() {
    if (popEl) { popEl.style.display = 'none'; popEl.innerHTML = ''; }
  }

  function makeItem(t, ctx) {
    const item = document.createElement('div');
    item.className = '__lgtokitem';
    if (t.kind === 'color') {
      const sw = document.createElement('span');
      sw.className = '__lgtoksw';
      sw.style.background = t.value;
      item.appendChild(sw);
    }
    const nm = document.createElement('span');
    nm.className = '__lgtokname';
    nm.textContent = t.name;
    const vl = document.createElement('span');
    vl.className = '__lgtokval';
    vl.textContent = t.value;
    item.appendChild(nm);
    item.appendChild(vl);
    item.addEventListener('click', e => {
      e.stopPropagation();
      const ref = `var(${t.name})`;
      ctx.input.value = ref;
      apply(ctx.key, ref);
      markChanged(ctx.row, true);
      if (ctx.swatch && t.kind === 'color') {
        const h = rgbToHex(t.value);
        if (h && h.length === 7) ctx.swatch.value = h;
      }
      hidePopover();
      ctx.input.focus();
    });
    return item;
  }

  function repositionPopover(btn) {
    const r = btn.getBoundingClientRect();
    const pw = popEl.offsetWidth || 220;
    const ph = popEl.offsetHeight || 200;
    let left = Math.min(r.left, window.innerWidth - pw - 6);
    let top = r.bottom + 4;
    if (top + ph > window.innerHeight - 6) top = Math.max(6, r.top - ph - 4);
    popEl.style.left = Math.max(6, left) + 'px';
    popEl.style.top = top + 'px';
  }

  // ranked = { primary, other }. Primary tokens render first; the rest live under a
  // collapsible "Other (N)" so unusual naming never hides them.
  function openPopover(btn, ctx, ranked) {
    ensurePopover();
    popEl.innerHTML = '';
    const lgtm = LGTM_CONFIG.BUILD_TARGET === 'lgtm';

    ranked.primary.forEach(t => popEl.appendChild(makeItem(t, ctx)));

    if (ranked.other.length) {
      if (ranked.primary.length) {
        const toggle = document.createElement('div');
        toggle.className = '__lgtoksec';
        const label = (open) => (lgtm ? 'その他 ' : 'Other ') + `(${ranked.other.length}) ` + (open ? '▴' : '▾');
        toggle.textContent = label(false);
        let shown = false;
        const appended = [];
        toggle.addEventListener('click', e => {
          e.stopPropagation();
          if (shown) {
            appended.forEach(el => el.remove());
            appended.length = 0;
          } else {
            ranked.other.forEach(t => { const it = makeItem(t, ctx); appended.push(it); popEl.appendChild(it); });
          }
          shown = !shown;
          toggle.textContent = label(shown);
          repositionPopover(btn);
        });
        popEl.appendChild(toggle);
      } else {
        // No semantic match — show everything as a flat list (no regression).
        ranked.other.forEach(t => popEl.appendChild(makeItem(t, ctx)));
      }
    }

    popEl.style.display = 'block';
    repositionPopover(btn);
  }

  // ── Panel ─────────────────────────────────────────────────────────────────
  // seed: optional array of prior edits [{prop, to}] to restore + re-preview (edit mode).
  function build(container, element, { isLGTM, seed = null }) {
    targetEl = element;
    rows = [];
    const cs = getComputedStyle(element);
    const tokens = collectTokens();

    const wrap = document.createElement('div');
    wrap.className = '__lgsty';

    PROPS.forEach(p => {
      const orig = (cs.getPropertyValue(p.key) || '').trim();
      const origInline = element.style.getPropertyValue(p.key); // restore exactly on revert

      const row = document.createElement('div');
      row.className = '__lgstyrow';

      const label = document.createElement('label');
      label.className = '__lgstylbl';
      label.textContent = isLGTM ? p.labelJa : p.label;
      label.title = p.key;

      const fields = document.createElement('div');
      fields.className = '__lgstyfields';

      const input = document.createElement('input');
      input.type = 'text';
      input.className = '__lgstyin';
      input.value = orig;
      input.spellcheck = false;

      let swatch = null;
      if (p.type === 'color') {
        swatch = document.createElement('input');
        swatch.type = 'color';
        swatch.className = '__lgstysw';
        const hex = rgbToHex(orig);
        if (hex && hex.length === 7) swatch.value = hex;
        swatch.addEventListener('input', () => {
          input.value = swatch.value;
          apply(p.key, swatch.value);
          markChanged(row, input.value.trim() !== orig);
        });
        fields.appendChild(swatch);
      }
      fields.appendChild(input);

      // Token picker — only when the page actually defines matching tokens.
      const ranked = rankTokens(p, tokens);
      const total = ranked.primary.length + ranked.other.length;
      if (total > 0) {
        const tokBtn = document.createElement('button');
        tokBtn.type = 'button';
        tokBtn.className = '__lgtokbtn';
        tokBtn.textContent = '{ }';
        tokBtn.title = isLGTM ? `トークンから選ぶ (${total})` : `Pick a token (${total})`;
        tokBtn.addEventListener('click', e => {
          e.stopPropagation();
          if (popEl && popEl.style.display !== 'none') { hidePopover(); return; }
          openPopover(tokBtn, { input, swatch, key: p.key, row }, ranked);
        });
        fields.appendChild(tokBtn);
      }

      input.addEventListener('input', () => {
        apply(p.key, input.value);
        if (swatch) {
          const h = rgbToHex(input.value);
          if (h && h.length === 7) swatch.value = h;
        }
        markChanged(row, input.value.trim() !== orig);
      });
      input.addEventListener('keydown', e => { if (e.key !== 'Escape') e.stopPropagation(); });
      input.addEventListener('keyup', e => e.stopPropagation());

      row.appendChild(label);
      row.appendChild(fields);
      wrap.appendChild(row);

      rows.push({ key: p.key, label: isLGTM ? p.labelJa : p.label, input, swatch, orig, origInline, row });
    });

    container.appendChild(wrap);

    // Edit mode — restore prior edits and re-apply the live preview.
    if (seed && seed.length) {
      seed.forEach(s => {
        const r = rows.find(x => x.key === s.prop);
        if (!r) return;
        r.input.value = s.to;
        apply(s.prop, s.to);
        markChanged(r.row, r.input.value.trim() !== (r.orig || '').trim());
        if (r.swatch) { const h = rgbToHex(s.to); if (h && h.length === 7) r.swatch.value = h; }
      });
    }
  }

  function apply(key, value) {
    if (!targetEl) return;
    // !important so the live preview reliably wins over author rules.
    targetEl.style.setProperty(key, value, 'important');
  }

  function markChanged(row, changed) {
    row.classList.toggle('__lgsty-dirty', changed);
  }

  // Returns [{ prop, label, from, to }] for fields the user changed.
  function getEdits() {
    return rows
      .filter(r => r.input.value.trim() !== (r.orig || '').trim())
      .map(r => ({
        prop: r.key,
        label: r.label,
        from: r.orig || '(none)',
        to: r.input.value.trim() || '(none)'
      }));
  }

  // Restore the element's original inline styles (undo live preview).
  function revert() {
    if (!targetEl) return;
    rows.forEach(r => {
      if (r.origInline) targetEl.style.setProperty(r.key, r.origInline);
      else targetEl.style.removeProperty(r.key);
    });
  }

  function reset() {
    targetEl = null;
    rows = [];
    hidePopover();
    if (popEl) {
      document.removeEventListener('mousedown', onDocDownForPopover, true);
      popEl.remove();
      popEl = null;
    }
  }

  // Shared formatter — serializes edits as before→after intent for Claude Code.
  function formatEdits(edits, { isLGTM } = {}) {
    if (!edits || !edits.length) return '';
    const header = isLGTM ? 'CSS変更（プレビュー反映済み）:' : 'CSS changes (previewed):';
    const lines = edits.map(e => `- ${e.prop}: ${e.from} → ${e.to}`);
    return header + '\n' + lines.join('\n');
  }

  return { build, getEdits, revert, reset, formatEdits };
})();
