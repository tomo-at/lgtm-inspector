// Curated CSS editor panel — live inline-style preview + diff extraction.
// Not a DevTools clone: shows a focused set of commonly-tweaked properties,
// applies edits as inline styles for instant preview, and reports only the
// changed properties as before→after intent for Claude Code to translate into
// the real source edit (Tailwind class, CSS rule, etc.).
//
// Design tokens (CSS custom properties) are first-class:
//   • Authoritative link detection — scans inline style + matched author rules
//     for an explicit `var(--token)` declaration. Those rows render as a token
//     CHIP (name · resolved value); the right button becomes a DETACH control
//     that unlinks the token and hardcodes the resolved value.
//   • Value-match hint — when a row is NOT explicitly linked but its computed
//     value equals a semantically-relevant token, the `{ }` button is tinted as
//     a suggestion ("= spacing-md"). The user can opt to link it.
// The diff carries token intent (e.g. `color: var(--text) → rgb(51,51,51)` on
// detach, or `12px → var(--spacing-md)` on link) — safer to apply in source.
const LGTMStyler = (() => {
  'use strict';

  // Curated set of commonly-tweaked properties.
  //   type  — 'color' shows a native color swatch.
  //   tok   — which token KINDS the picker offers (see classify()): 'color' | 'length' | 'number' | 'other'.
  //   hints — name substrings marking semantically-relevant tokens. Those rank first; the rest
  //           stay reachable under a collapsible "Other (N)". Empty hints → all kind-matches are
  //           primary (e.g. color rows). Hints never hide tokens, so unusual naming won't empty the list.
  const PROPS = [
    { key: 'color',            label: 'Text color',    type: 'color', tok: ['color'],            hints: [] },
    { key: 'background-color', label: 'Background',     type: 'color', tok: ['color'],            hints: [] },
    { key: 'font-size',        label: 'Font size',      type: 'text',  tok: ['length'],           hints: ['font-size', 'fontsize', 'font', 'text'] },
    { key: 'font-weight',      label: 'Font weight',    type: 'text',  tok: ['number'],           hints: ['weight'] },
    { key: 'line-height',      label: 'Line height',    type: 'text',  tok: ['length', 'number'], hints: ['line-height', 'lineheight', 'leading', 'line'] },
    { key: 'letter-spacing',   label: 'Letter spacing', type: 'text',  tok: ['length'],           hints: ['letter', 'tracking'] },
    { key: 'padding',          label: 'Padding',        type: 'text',  tok: ['length'],           hints: ['space', 'spacing', 'pad', 'inset', 'gap'] },
    { key: 'margin',           label: 'Margin',         type: 'text',  tok: ['length'],           hints: ['space', 'spacing', 'margin', 'gap', 'inset'] },
    { key: 'width',            label: 'Width',          type: 'text',  tok: ['length'],           hints: ['size', 'width', 'dimension'] },
    { key: 'height',           label: 'Height',         type: 'text',  tok: ['length'],           hints: ['size', 'height', 'dimension'] },
    { key: 'border-radius',    label: 'Radius',         type: 'text',  tok: ['length'],           hints: ['radius', 'radii', 'rounded', 'corner'] },
    { key: 'border',           label: 'Border',         type: 'text',  tok: ['color', 'length'],  hints: ['border', 'stroke', 'outline'] },
    { key: 'box-shadow',       label: 'Shadow',         type: 'text',  tok: ['other', 'color'],   hints: ['shadow', 'elevation', 'blur'] },
    { key: 'opacity',          label: 'Opacity',        type: 'text',  tok: ['number'],           hints: ['opacity', 'alpha'] },
  ];

  // A token chip shows a small link glyph; the detach button shows a broken-link glyph.
  const LINK_SVG = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 12h6"/><path d="M9 8H7a4 4 0 0 0 0 8h2"/><path d="M15 8h2a4 4 0 0 1 0 8h-2"/></svg>';
  const LINKOFF_SVG = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 8H7a4 4 0 0 0-.9 7.9"/><path d="M15 16h2a4 4 0 0 0 3-6.6"/><path d="M4 4l16 16"/></svg>';

  let targetEl = null;
  let rows = [];   // array of row APIs (see makeRow)
  let popEl = null; // shared token popover (appended to <html>, outside the card)

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // Token display name: strip the leading "--".
  function short(name) { return (name || '').replace(/^--/, ''); }

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

  // ── Authoritative link detection ────────────────────────────────────────────
  // Walk inline style + matched author rules once, recording the winning specified
  // (pre-resolution) value for each property we care about. The value may contain
  // `var(--token)`, which getComputedStyle would otherwise have resolved away.
  function collectSpecified(el, keys) {
    const cand = new Map(); // key -> { value, important, inline, order }
    let order = 0;

    const beats = (a, b) => {
      if (a.important !== b.important) return a.important; // !important wins
      if (a.inline !== b.inline) return a.inline;          // inline beats rules (same importance)
      return a.order >= b.order;                            // later in cascade wins (specificity ignored — heuristic)
    };
    const consider = (styleDecl, key, inline) => {
      const v = styleDecl.getPropertyValue(key);
      if (!v) return;
      const c = { value: v.trim(), important: styleDecl.getPropertyPriority(key) === 'important', inline, order: order++ };
      const prev = cand.get(key);
      if (!prev || beats(c, prev)) cand.set(key, c);
    };

    const walk = (rules) => {
      for (const rule of Array.from(rules)) {
        if (rule.type === 1 /* STYLE_RULE */ && rule.selectorText) {
          let m = false;
          try { m = el.matches(rule.selectorText); } catch (e) { m = false; } // unsupported selector (e.g. ::before) — skip
          if (m) keys.forEach(k => consider(rule.style, k, false));
        } else if (rule.type === 3 /* IMPORT_RULE */ && rule.styleSheet) {
          try { walk(rule.styleSheet.cssRules); } catch (e) { /* ignore */ }
        } else if (rule.cssRules) {
          if (rule.type === 4 /* MEDIA_RULE */) {
            try { if (!window.matchMedia(rule.media.mediaText).matches) continue; } catch (e) { /* include if unknown */ }
          } else if (rule.type === 12 /* SUPPORTS_RULE */) {
            try { if (!CSS.supports(rule.conditionText)) continue; } catch (e) { /* include if unknown */ }
          }
          try { walk(rule.cssRules); } catch (e) { /* ignore */ }
        }
      }
    };

    for (const sheet of Array.from(document.styleSheets || [])) {
      let rules;
      try { rules = sheet.cssRules; } catch (e) { continue; } // cross-origin — skip
      if (rules) walk(rules);
    }
    if (el.style) keys.forEach(k => consider(el.style, k, true)); // inline wins ties
    return cand;
  }

  // Extract the token name from a value that is exactly `var(--x)` or `var(--x, fallback)`.
  // Composite values (e.g. `1px solid var(--c)`) are intentionally NOT treated as linked —
  // detach/swap semantics only make sense for a value that is a single token reference.
  function matchVar(value) {
    const m = (value || '').match(/^var\(\s*(--[A-Za-z0-9_-]+)\s*(?:,[^()]*)?\)$/);
    return m ? m[1] : null;
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

  // Loose value equality for the value-match HINT (non-authoritative).
  function valuesEqual(a, b, isColor) {
    const na = (a || '').trim(), nb = (b || '').trim();
    if (!na || !nb) return false;
    if (isColor) {
      if (na.replace(/\s+/g, '').toLowerCase() === nb.replace(/\s+/g, '').toLowerCase()) return true;
      const ha = rgbToHex(na), hb = rgbToHex(nb);
      return !!ha && ha === hb;
    }
    return na === nb;
  }

  // Find a hint-relevant token whose resolved value equals the computed value. Used only as a
  // suggestion when the row is not explicitly linked. Skips multi-part values (e.g. "0px 8px",
  // "1px solid #000") for non-color props — those don't map to a single token.
  function findValueToken(prop, computedValue, ranked) {
    const cv = (computedValue || '').trim();
    if (!cv) return null;
    const isColor = prop.type === 'color';
    if (!isColor && /\s/.test(cv)) return null;
    return ranked.primary.find(t => valuesEqual(t.value, cv, isColor)) || null;
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
        !popEl.contains(e.target) &&
        !(e.target.closest && (e.target.closest('.__lgtokbtn') || e.target.closest('.__lgstychip')))) {
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
    nm.textContent = short(t.name);
    const vl = document.createElement('span');
    vl.className = '__lgtokval';
    vl.textContent = t.value;
    item.appendChild(nm);
    item.appendChild(vl);
    item.addEventListener('click', e => {
      e.stopPropagation();
      linkTo(ctx.R, t);
    });
    return item;
  }

  function repositionPopover(anchor) {
    const r = anchor.getBoundingClientRect();
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
  function openPopover(anchor, ctx, ranked) {
    ensurePopover();
    popEl.innerHTML = '';

    ranked.primary.forEach(t => popEl.appendChild(makeItem(t, ctx)));

    if (ranked.other.length) {
      if (ranked.primary.length) {
        const toggle = document.createElement('div');
        toggle.className = '__lgtoksec';
        const label = (open) => 'Other ' + `(${ranked.other.length}) ` + (open ? '▴' : '▾');
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
          repositionPopover(anchor);
        });
        popEl.appendChild(toggle);
      } else {
        // No semantic match — show everything as a flat list (no regression).
        ranked.other.forEach(t => popEl.appendChild(makeItem(t, ctx)));
      }
    }

    popEl.style.display = 'block';
    repositionPopover(anchor);
  }

  // ── Row link / detach behaviour ───────────────────────────────────────────────
  function renderChip(R, valueText) {
    // Color rows already show the resolved color in the swatch — keep the chip name unclipped.
    const showVal = R.prop.type !== 'color';
    R.chip.innerHTML = LINK_SVG +
      `<span class="__lgchipname">${esc(short(R.linkedToken.name))}</span>` +
      (showVal ? `<span class="__lgchipval">${esc(valueText || '')}</span>` : '');
    R.chip.title = `${R.linkedToken.name}: ${valueText || ''} — click to swap token`;
  }

  function showChip(R, linked) {
    R.chip.style.display = linked ? '' : 'none';
    R.input.style.display = linked ? 'none' : '';
  }

  // Configure the right-hand button: 'detach' (linked) or 'pick' (token picker, optionally tinted as a hint).
  function setBtnMode(R, mode) {
    const b = R.tokBtn;
    if (!b) return;
    b.classList.remove('__lgtoksuggest', '__lgtokdetach');
    if (mode === 'detach') {
      b.innerHTML = LINKOFF_SVG;
      b.classList.add('__lgtokdetach');
      b.title = 'Detach token — hardcode the resolved value';
      b.onclick = e => { e.stopPropagation(); hidePopover(); detachRow(R); };
    } else {
      b.textContent = '{ }';
      if (R.suggestToken) {
        b.classList.add('__lgtoksuggest');
        b.title = `Matches ${short(R.suggestToken.name)} (${R.suggestToken.value}) — click to link`;
      } else {
        b.title = `Pick a token (${R.tokCount})`;
      }
      b.onclick = e => {
        e.stopPropagation();
        if (popEl && popEl.style.display !== 'none') { hidePopover(); return; }
        openPopover(R.tokBtn, { R }, R.ranked);
      };
    }
  }

  // Link the row to a token: chip view + live preview as `var(--token)`.
  function linkTo(R, token) {
    R.linkedToken = token;
    R.suggestToken = null;
    renderChip(R, token.value || R.resolved);
    showChip(R, true);
    setBtnMode(R, 'detach');
    if (R.swatch && token.kind === 'color') {
      const h = rgbToHex(token.value);
      if (h && h.length === 7) R.swatch.value = h;
    }
    apply(R.key, `var(${token.name})`);
    markChanged(R.row, R.dirty());
    hidePopover();
  }

  // Detach the token: switch to an editable input holding the resolved (hardcoded) value.
  function detachRow(R) {
    const val = (R.linkedToken && R.linkedToken.value) || R.resolved || R.input.value || '';
    R.linkedToken = null;
    R.input.value = val;
    showChip(R, false);
    setBtnMode(R, 'pick');
    if (R.swatch) {
      const h = rgbToHex(val);
      if (h && h.length === 7) R.swatch.value = h;
    }
    apply(R.key, val);
    markChanged(R.row, R.dirty());
    R.input.focus();
  }

  // ── Panel ─────────────────────────────────────────────────────────────────
  // seed: optional array of prior edits [{prop, to}] to restore + re-preview (edit mode).
  function build(container, element, { seed = null } = {}) {
    targetEl = element;
    rows = [];
    const cs = getComputedStyle(element);
    const tokens = collectTokens();
    const tokensByName = new Map(tokens.map(t => [t.name, t]));
    const specified = collectSpecified(element, PROPS.map(p => p.key));

    const wrap = document.createElement('div');
    wrap.className = '__lgsty';

    PROPS.forEach(p => {
      const resolved = (cs.getPropertyValue(p.key) || '').trim();
      const origInline = element.style.getPropertyValue(p.key); // restore exactly on revert
      const spec = specified.get(p.key);
      const linkName = spec ? matchVar(spec.value) : null;
      const ranked = rankTokens(p, tokens);
      const tokCount = ranked.primary.length + ranked.other.length;
      const suggest = linkName ? null : findValueToken(p, resolved, ranked);

      const row = document.createElement('div');
      row.className = '__lgstyrow';

      const label = document.createElement('label');
      label.className = '__lgstylbl';
      label.textContent = p.label;
      label.title = p.key;

      const fields = document.createElement('div');
      fields.className = '__lgstyfields';

      let swatch = null;
      if (p.type === 'color') {
        swatch = document.createElement('input');
        swatch.type = 'color';
        swatch.className = '__lgstysw';
        const hex = rgbToHex(resolved);
        if (hex && hex.length === 7) swatch.value = hex;
        fields.appendChild(swatch);
      }

      const input = document.createElement('input');
      input.type = 'text';
      input.className = '__lgstyin';
      input.value = resolved;
      input.spellcheck = false;
      fields.appendChild(input);

      const chip = document.createElement('div');
      chip.className = '__lgstychip';
      chip.style.display = 'none';
      fields.appendChild(chip);

      // Right-hand button: present when the prop has tokens, or it's explicitly linked
      // (a linked token may be scoped and not in the :root-collected list).
      let tokBtn = null;
      if (tokCount > 0 || linkName) {
        tokBtn = document.createElement('button');
        tokBtn.type = 'button';
        tokBtn.className = '__lgtokbtn';
        fields.appendChild(tokBtn);
      }

      // Baseline for the diff: the explicit `var(--token)` for linked rows (so detach/swap
      // read naturally), else the computed value.
      const orig = linkName ? `var(${linkName})` : resolved;

      const R = {
        key: p.key, label: p.label, prop: p,
        row, fields, input, chip, swatch, tokBtn,
        ranked, tokCount, resolved, orig, origInline,
        linkedToken: null,
        suggestToken: suggest || null,
        cur() { return R.linkedToken ? `var(${R.linkedToken.name})` : R.input.value; },
        dirty() { return R.cur().trim() !== (R.orig || '').trim(); }
      };

      // Swatch edits (color rows) — only meaningful in input mode.
      if (swatch) {
        swatch.addEventListener('input', () => {
          input.value = swatch.value;
          apply(p.key, swatch.value);
          if (R.suggestToken) { R.suggestToken = null; setBtnMode(R, 'pick'); }
          markChanged(row, R.dirty());
        });
      }

      input.addEventListener('input', () => {
        apply(p.key, input.value);
        if (swatch) {
          const h = rgbToHex(input.value);
          if (h && h.length === 7) swatch.value = h;
        }
        if (R.suggestToken && input.value.trim() !== R.resolved) { R.suggestToken = null; setBtnMode(R, 'pick'); }
        markChanged(row, R.dirty());
      });
      input.addEventListener('keydown', e => { if (e.key !== 'Escape') e.stopPropagation(); });
      input.addEventListener('keyup', e => e.stopPropagation());

      // Chip click → open the picker to swap tokens.
      chip.addEventListener('click', e => {
        e.stopPropagation();
        if (popEl && popEl.style.display !== 'none') { hidePopover(); return; }
        openPopover(chip, { R }, R.ranked);
      });

      row.appendChild(label);
      row.appendChild(fields);
      wrap.appendChild(row);
      rows.push(R);

      // Initial state.
      if (linkName) {
        R.linkedToken = tokensByName.get(linkName) || { name: linkName, value: resolved, kind: classify(resolved) };
        renderChip(R, resolved);
        showChip(R, true);
        setBtnMode(R, 'detach');
      } else {
        setBtnMode(R, 'pick'); // no-op if tokBtn is null
      }
    });

    container.appendChild(wrap);

    // Edit mode — restore prior edits and re-apply the live preview.
    if (seed && seed.length) {
      seed.forEach(s => {
        const R = rows.find(x => x.key === s.prop);
        if (!R) return;
        const mv = matchVar(s.to);
        if (mv) {
          const tk = tokensByName.get(mv) || { name: mv, value: R.resolved, kind: classify(R.resolved) };
          linkTo(R, tk);
        } else {
          if (R.linkedToken) { R.linkedToken = null; showChip(R, false); setBtnMode(R, 'pick'); }
          R.input.value = s.to;
          apply(s.prop, s.to);
          if (R.swatch) { const h = rgbToHex(s.to); if (h && h.length === 7) R.swatch.value = h; }
          markChanged(R.row, R.dirty());
        }
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
      .filter(R => R.dirty())
      .map(R => ({
        prop: R.key,
        label: R.label,
        from: (R.orig || '').trim() || '(none)',
        to: R.cur().trim() || '(none)'
      }));
  }

  // Restore the element's original inline styles (undo live preview).
  function revert() {
    if (!targetEl) return;
    rows.forEach(R => {
      if (R.origInline) targetEl.style.setProperty(R.key, R.origInline);
      else targetEl.style.removeProperty(R.key);
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
  function formatEdits(edits) {
    if (!edits || !edits.length) return '';
    const header = 'CSS changes (previewed):';
    const lines = edits.map(e => `- ${e.prop}: ${e.from} → ${e.to}`);
    return header + '\n' + lines.join('\n');
  }

  return { build, getEdits, revert, reset, formatEdits };
})();
