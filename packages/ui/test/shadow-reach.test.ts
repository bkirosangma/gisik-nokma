import { describe, expect, it } from 'vitest';
import { parseRules, readUiCss, ruleExactly, rulesNaming, valueOf } from './helpers/css-rules.js';
import { readGlobalsCss } from './helpers/style-patterns.js';
import {
  SHADOW_REACH_EXCLUDED_ROLES,
  SHADOW_REACH_VARIABLE,
  SHADOW_ROLES,
  reachOfLayers,
  shadowReachOf,
  shadowValueOf,
  themeStylesheet,
  type StyleName,
  type ThemeName,
} from '../src/tokens.js';

/**
 * Smoothness G-2 (cases 25.321–25.325): `--gn-shadow-reach`, the room a raised neo shadow needs inside the container that holds it.
 * The detector that proves the rendered result is `apps/web/e2e-stack/neo-shadow-clip.spec.ts` (25.320); these cases pin the token and
 * the rules that read it.
 */

/** An INDEPENDENT reading of a role's reach: parse the emitted CSS value, never the table the token is derived from. */
function reachOfCss(value: string): number {
  if (value === 'none') return 0;
  let reach = 0;
  let depth = 0;
  let start = 0;
  const layers: string[] = [];
  for (let i = 0; i <= value.length; i += 1) {
    const ch = value[i];
    if (ch === '(') depth += 1;
    else if (ch === ')') depth -= 1;
    else if ((ch === ',' && depth === 0) || i === value.length) {
      layers.push(value.slice(start, i).trim());
      start = i + 1;
    }
  }
  for (const layer of layers) {
    if (/\binset\b/.test(layer)) continue;
    const nums = [...layer.replace(/rgba?\([^)]*\)|#[0-9a-f]+/gi, '').matchAll(/-?\d+(?:\.\d+)?(?=px)/g)].map((m) => Number(m[0]));
    const [x = 0, y = 0, blur = 0, spread = 0] = nums;
    reach = Math.max(reach, Math.max(Math.abs(x), Math.abs(y)) + blur + spread);
  }
  return reach;
}

const THEME_LIST: readonly ThemeName[] = ['light', 'dark'];

describe('25.321 --gn-shadow-reach is derived from the shadow table, not typed in', () => {
  it('25.321 neo reach equals the largest outer layer of every in-container role, read back from the emitted CSS; excluded roles and inset layers do not count', () => {
    const excluded = new Set<string>(SHADOW_REACH_EXCLUDED_ROLES);
    let expected = 0;
    for (const theme of THEME_LIST) {
      for (const role of SHADOW_ROLES) {
        if (excluded.has(role)) continue;
        expected = Math.max(expected, reachOfCss(shadowValueOf('neo', theme, role)));
      }
    }
    expect(shadowReachOf('neo')).toBe(expected);
    // The recorded number: the hover lift `near` (6 + 14), larger than the 14 px a card rests in.
    expect(expected).toBe(20);

    // CONTROL 1: the exclusion does work — the floating roles reach further than the token, so a reading over every role would differ.
    const everyRole = Math.max(...SHADOW_ROLES.map((role) => reachOfCss(shadowValueOf('neo', 'light', role))));
    expect(everyRole).toBeGreaterThan(expected);
    expect(reachOfCss(shadowValueOf('neo', 'light', 'lift-drag'))).toBe(46);
    // CONTROL 2: changing a shadow changes the reach (the property the token exists for), and an inset layer adds nothing.
    const base = [{ x: 4, y: 4, blur: 10 }];
    expect(reachOfLayers(base)).toBe(14);
    expect(reachOfLayers([{ x: 4, y: 4, blur: 11 }])).toBe(15);
    expect(reachOfLayers([{ x: 5, y: 4, blur: 10 }])).toBe(15);
    expect(reachOfLayers([{ x: 4, y: 4, blur: 10, spread: 2 }])).toBe(16);
    expect(reachOfLayers([...base, { x: 9, y: 9, blur: 30, inset: true }])).toBe(14);
    expect(reachOfLayers([])).toBe(0);
  });
});

/** The declaration body of every block of the stylesheet whose selector starts with `selector`. */
function blocksOf(sheet: string, selector: string): string[] {
  return sheet.split('\n').filter((line) => line.includes(selector));
}

describe('25.322 the reach is emitted for neo only; hig and minimal carry nothing new', () => {
  it('25.322 every neo block declares --gn-shadow-reach with the derived px, no hig or minimal block mentions it', () => {
    const sheet = themeStylesheet();
    const neo = blocksOf(sheet, '[data-style="neo"]');
    expect(neo.length).toBe(3);
    for (const block of neo) expect(block).toContain(`${SHADOW_REACH_VARIABLE}: ${shadowReachOf('neo')}px;`);
    // CONTROL: the blocks of the other two styles exist (and are found), and none carries the property.
    for (const style of ['minimal'] as const satisfies readonly StyleName[]) {
      const own = blocksOf(sheet, `[data-style="${style}"]`);
      expect(own.length).toBe(3);
      for (const block of own) expect(block).not.toContain(SHADOW_REACH_VARIABLE);
    }
    const hig = sheet.split('\n').filter((line) => !line.includes('[data-style='));
    expect(hig.length).toBeGreaterThan(0);
    for (const line of hig) expect(line).not.toContain(SHADOW_REACH_VARIABLE);
    expect(sheet.split(SHADOW_REACH_VARIABLE).length - 1).toBe(3);
  });
});

const ui = readUiCss();
const globals = readGlobalsCss();
const REACH = 'var(--gn-shadow-reach)';
const NEG_REACH = 'calc(-1 * var(--gn-shadow-reach))';

/** The body of the one top-level rule whose selector list is exactly `selector`; throws on none or several. */
const only = (css: string, selector: string): string => ruleExactly(css, selector);

describe('25.323 the scrollers hold their raised children with room, and hand the box back', () => {
  it('25.323 the board rail pads top and sides by the reach, cancels with the equal negative margin, and snaps on the padded edge', () => {
    const rail = only(ui, '[data-style="neo"] .gn-board__rail');
    expect(valueOf(rail, 'padding-top')).toBe(REACH);
    expect(valueOf(rail, 'padding-inline')).toBe(REACH);
    expect(valueOf(rail, 'margin-top')).toBe(NEG_REACH);
    expect(valueOf(rail, 'margin-inline')).toBe(NEG_REACH);
    expect(valueOf(rail, 'scroll-padding-inline')).toBe(REACH);
    // CONTROL: the unscoped rail keeps its own scroll and its 1.5rem foot (the bottom is already deeper than the reach).
    const base = only(ui, '.gn-board__rail');
    expect(valueOf(base, 'overflow-x')).toBe('auto');
    expect(valueOf(base, 'padding-bottom')).toBe('1.5rem');
    expect(valueOf(rail, 'overflow-x')).toBeNull();
  });

  it('25.323 the Groups tree, the notes tree and the phone chip row pad by the reach and cancel it', () => {
    for (const selector of ['[data-style="neo"] .gn-groups__tree', '[data-style="neo"] .gn-notes__tree']) {
      const body = only(globals, selector);
      expect(valueOf(body, 'padding'), selector).toBe(REACH);
      expect(valueOf(body, 'margin'), selector).toBe(NEG_REACH);
    }
    const chips = rulesNaming(globals, '[data-style="neo"] .gn-workspace-home__links');
    expect(chips.length).toBe(1);
    expect(valueOf(chips[0]!.body, 'padding')).toBe(REACH);
    expect(valueOf(chips[0]!.body, 'margin')).toBe(`calc(1.4rem - var(--gn-shadow-reach)) ${NEG_REACH} ${NEG_REACH}`);
    // CONTROL: the unscoped rules they extend still scroll, so the padding has a scroller to make room in.
    expect(valueOf(only(globals, '.gn-groups__tree'), 'overflow-x')).toBe('auto');
  });
});

describe('25.324 the reach strip takes no neighbour\'s click', () => {
  it('25.324 the toolbar, the notes bar and the phone picker above a padded scroller are positioned, so they paint and take the pointer above its strip', () => {
    expect(valueOf(only(globals, '[data-style="neo"] .gn-groups__toolbar'), 'position')).toBe('relative');
    const bar = only(globals, '[data-style="neo"] .gn-notes__bar');
    expect(valueOf(bar, 'position')).toBe('relative');
    // Above 60rem the tree is positioned and later in the DOM: a tie loses, so the bar needs a stacking level.
    expect(valueOf(bar, 'z-index')).toBe('1');
    const picker = only(ui, '[data-style="neo"] .gn-board-phone-picker');
    expect(valueOf(picker, 'position')).toBe('relative');
    // The rail's scroll-fade mask is a stacking context after the picker in the DOM, so the picker needs a level too.
    expect(valueOf(picker, 'z-index')).toBe('1');
    // CONTROL: the tree really is positioned above 60rem, which is why the bar's bare position would tie.
    expect(rulesNaming(globals, '.gn-notes__tree').some((r) => valueOf(r.body, 'position') === 'relative')).toBe(true);
  });
});

describe('25.325 the composer slot keeps its corner clip and makes the room inside it', () => {
  it('25.325 the strip and the footer hold their raised buttons one card halo from the slot edge', () => {
    const bar = only(ui, '[data-style="neo"] .editor-slot .ticket-editor__toolbar');
    expect(valueOf(bar, 'padding')).toBe('max(0.375rem, var(--gn-halo)) max(0.5rem, var(--gn-halo))');
    const foot = only(ui, '[data-style="neo"] .editor-slot__footer');
    expect(valueOf(foot, 'padding')).toBe('max(0.5rem, var(--gn-halo)) max(0.625rem, var(--gn-halo))');
    // CONTROL: the slot itself is untouched (still the clip that owns the corners, in editor.css) — this task adds no rule for it.
    expect(rulesNaming(ui, '[data-style="neo"] .editor-slot').length).toBe(0);
  });
});

describe('25.326 every reader of --gn-shadow-reach is scoped to neo', () => {
  it('25.326 no rule outside [data-style="neo"] reads the property, so hig and minimal resolve nothing', () => {
    const readers = [...parseRules(ui), ...parseRules(globals)].filter((r) => r.body.includes('--gn-shadow-reach'));
    expect(readers.length).toBeGreaterThanOrEqual(4);
    const unscoped = readers.filter((r) => !r.selectors.every((s) => s.startsWith('[data-style="neo"]')));
    expect(unscoped.map((r) => r.selectors.join(', '))).toEqual([]);
    // CONTROL: the predicate flags an unscoped reader.
    const planted = parseRules('.gn-x { padding: var(--gn-shadow-reach); }').filter((r) => r.body.includes('--gn-shadow-reach'));
    expect(planted.filter((r) => !r.selectors.every((s) => s.startsWith('[data-style="neo"]'))).length).toBe(1);
  });
});
