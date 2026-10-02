import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from './helpers/colour-scan.js';
import { contrastRatio } from './helpers/contrast.js';
import { parseRules, ruleExactly, rulesNaming, valueOf } from './helpers/css-rules.js';
import { cssOf } from './helpers/style-patterns.js';
import {
  CONTRAST_PAIRS,
  colorOf,
  cssVariableName,
  primitives,
  themeStylesheet,
  type StyleName,
  type ThemeName,
} from '../src/tokens.js';

/**
 * UX fixes T1 (audit 2026-10-01; spec U5-U9, owner 2026-10-02): the neo field ring, the selected-segment bar, flat
 * disabled fields, the dark raised step and the well step, and the focus offset. Cases 23.001-23.009.
 *
 * PLANNER RULING 03:15 (owner reviews in the morning report): the neo-dark `fieldRim` is `#6f7997`, NOT the plan's
 * `#6b7491`. U8 raises neo-dark `surfaceRaised` to `#232c50`, and `#6b7491` measures 2.93 on it, under the 3.0 floor
 * 23.001 declares; `#6f7997` is the smallest hue-preserving lift (3.14 on raised, 3.57 on surface).
 */
const COMBOS: ReadonlyArray<[StyleName, ThemeName]> = [
  ['hig', 'light'],
  ['hig', 'dark'],
  ['minimal', 'light'],
  ['minimal', 'dark'],
  ['neo', 'light'],
  ['neo', 'dark'],
];
const ui = cssOf('ui');
const rules = parseRules(ui);

/** The index (in source order) of the one rule whose selector list is exactly `selector`. */
function indexOfRule(selector: string): number {
  const hits = rules.map((rule, index) => (rule.selectors.length === 1 && rule.selectors[0] === selector ? index : -1)).filter((i) => i >= 0);
  if (hits.length !== 1) throw new Error(`expected one rule for ${selector}, found ${hits.length}`);
  return hits[0] as number;
}

// RETIRED 2026-10-02 (housekeeping HK-4, cases 24.120–24.123): the `fieldRim` role, `--gn-field-rim` and the four CONTRAST_PAIRS rows are
// gone; nothing read them after N10. What 23.001 guarded survives for hig and minimal, whose field edge is `border`: it still clears 3.0
// on the four grounds a field sits on, asserted below on `border` itself.
describe('23.001 the hig/minimal field edge (formerly the fieldRim role, retired by HK-4) clears 3.0 on every ground a field sits on (audit SYS-05, WS-04, NP-25, TT-14)', () => {
  it('23.001 hig and minimal: border is the field edge and measures >= 3.0 on surface, raised, sunken and well; the role is gone', () => {
    for (const style of ['hig', 'minimal'] as const) {
      for (const theme of ['light', 'dark'] as const) {
        for (const bg of ['surface', 'surfaceRaised', 'surfaceSunken', 'surfaceWell'] as const) {
          expect(contrastRatio(colorOf(theme, 'border', style), colorOf(theme, bg, style)), `${style}/${theme} border on ${bg}`).toBeGreaterThanOrEqual(3);
        }
      }
    }
    // CONTROL: the check can fail — a ring one step dimmer than the dark border does not clear the dark raised surface.
    expect(contrastRatio('#5f6987', colorOf('dark', 'surfaceRaised', 'neo'))).toBeLessThan(3);
    // The retired role is not resolvable and its variable is not emitted.
    expect(themeStylesheet()).not.toContain('--gn-field-rim');
  });
});

// AMENDED 2026-10-02 by N10 (owner, "go with B in neumorphic"; case 24.040): the 1px full ring is retired for neo. Every neo field arm is now
// `border: 1px solid transparent` with `box-shadow: var(--gn-shadow-field)` (the one-sided >= 3:1 line, asserted in 24.044); hig/minimal keep the ring.
describe('23.002 neo text fields: no rim, the field shadow carries the boundary (audit SYS-05, WS-04, NP-25, TT-14; amended by N10, 24.040)', () => {
  const NEO_FIELDS = [
    '[data-style="neo"] .gn-field__input',
    '[data-style="neo"] .gn-help__search-input',
    '[data-style="neo"] .workflow-builder-screen__name',
    '[data-style="neo"] .gn-project__search',
  ];
  it('23.002 every neo field arm has border: 1px solid transparent and box-shadow: var(--gn-shadow-field) (amended by N10, 24.040)', () => {
    for (const selector of NEO_FIELDS) {
      const body = ruleExactly(ui, selector);
      expect(valueOf(body, 'border'), selector).toBe('1px solid transparent');
      expect(valueOf(body, 'box-shadow'), selector).toBe('var(--gn-shadow-field)');
    }
    // CONTROL: the base (hig) field rule is unchanged, so the ring is neo's own.
    expect(valueOf(ruleExactly(ui, '.gn-field__input'), 'border')).toBe('1px solid var(--gn-border)');
  });
});

describe('23.003 the neo selected segment stays pressed and gains a 2px bar in the text colour (audit SYS-06, SET-08, NP-17)', () => {
  it('23.003 the inset shadow is kept, the label is 600 and an ::after bar is var(--gn-text), 2px by 1rem, centred', () => {
    const on = ruleExactly(ui, '[data-style="neo"] .gn-segmented__item--on');
    expect(valueOf(on, 'box-shadow')).toBe('var(--gn-shadow-selected)');
    expect(valueOf(on, 'font-weight')).toBe('600');
    expect(valueOf(on, 'position')).toBe('relative');
    const bar = ruleExactly(ui, '[data-style="neo"] .gn-segmented__item--on::after');
    expect(valueOf(bar, 'content')).toBe('""');
    expect(valueOf(bar, 'height')).toBe('2px');
    expect(valueOf(bar, 'width')).toBe('1rem');
    expect(valueOf(bar, 'background')).toBe('var(--gn-text)');
    expect(valueOf(bar, 'left')).toBe('50%');
    expect(valueOf(bar, 'transform')).toBe('translateX(-50%)');
    // The bar's 3:1 against the pressed ground, per theme.
    for (const theme of ['light', 'dark'] as const) {
      expect(contrastRatio(colorOf(theme, 'text', 'neo'), colorOf(theme, 'surfaceSunken', 'neo'))).toBeGreaterThanOrEqual(3);
    }
    // CONTROL: the unselected segment carries no bar, and no ::after rule names the bare item.
    const barRules = rules.filter((rule) => rule.selectors.some((selector) => selector.includes('.gn-segmented__item') && selector.includes('::after')));
    expect(barRules.map((rule) => rule.selectors.join(', '))).toEqual(['[data-style="neo"] .gn-segmented__item--on::after']);
  });
});

describe('23.004 a neo disabled field is flat: no ring, no inset, muted text, AFTER the neo field rule (audit SYS-09, SET-12)', () => {
  const PAIRS: ReadonlyArray<[disabled: string, neoBase: string]> = [
    ['[data-style="neo"] .gn-field__input:disabled', '[data-style="neo"] .gn-field__input'],
    ['[data-style="neo"] .gn-select__trigger:disabled', '[data-style="neo"] .gn-field__input'],
    ['[data-style="neo"] .workflow-builder-screen__name:disabled', '[data-style="neo"] .workflow-builder-screen__name'],
  ];
  it('23.004 the three disabled arms are flat and sit after the neo rule they would otherwise lose to', () => {
    for (const [disabled, neoBase] of PAIRS) {
      const hits = rulesNaming(ui, disabled);
      expect(hits, disabled).toHaveLength(1);
      const body = (hits[0] as { body: string }).body;
      expect(valueOf(body, 'box-shadow'), disabled).toBe('none');
      expect(valueOf(body, 'border-color'), disabled).toBe('transparent');
      expect(valueOf(body, 'color'), disabled).toBe('var(--gn-text-subtle)');
      // SOURCE ORDER, asserted: the neo field rule and the disabled arm are both written to win at equal footing,
      // so a disabled arm moved ABOVE its neo base would be repainted sunken with every other check green.
      const disabledAt = rules.findIndex((rule) => rule.selectors.includes(disabled));
      expect(disabledAt, `${disabled} after ${neoBase}`).toBeGreaterThan(indexOfRule(neoBase));
    }
    // CONTROL: an enabled neo field still has its recess edge (amended by N10, 24.040: a transparent border and the `field` shadow, no ring).
    const enabled = ruleExactly(ui, '[data-style="neo"] .gn-field__input');
    expect(valueOf(enabled, 'border')).toBe('1px solid transparent');
    expect(valueOf(enabled, 'box-shadow')).toBe('var(--gn-shadow-field)');
  });
});

describe('23.005 the focus ring sits 3px outside fields (audit SYS-08)', () => {
  it('23.005 outline-offset is 3px on the field, the searchable trigger and the workflow name; the outline stays 2px', () => {
    for (const selector of [
      '.gn-field__input:focus-visible',
      '.gn-select__trigger--searchable:focus-within',
      '.workflow-builder-screen__name:focus-visible',
    ]) {
      const body = ruleExactly(ui, selector);
      expect(valueOf(body, 'outline-offset'), selector).toBe('3px');
      expect(valueOf(body, 'outline'), `${selector} keeps the 2px width`).toBe('2px solid var(--gn-focus-ring)');
    }
  });
});

describe('23.006 neo dark depth ships: a lighter raised surface and a 12% highlight (audit BRD-21, ENT-19, SYS-07)', () => {
  // AMENDED 2026-10-02 by the neo refresh (N4 = B, 24.007): dark raised is the page hex `#1b2340` again — extrusion, not elevation;
  // the 16% highlight (`shadowNeoHighlightDark` `#f2e9e129`) carries the lift. `neoNavyRaised` `#232c50` is retired, kept as a primitive.
  it('23.006 neo/dark surfaceRaised is #1b2340 (N4 = B), and the text roles still read on it', () => {
    expect(colorOf('dark', 'surfaceRaised', 'neo')).toBe('#1b2340');
    expect(primitives.neoNavyRaised).toBe('#232c50');
    // accent (a fill, so not a CONTRAST_PAIRS row: tokens.ts retired that pairing), textAccent and textSubtle (5.40).
    // `textSubtle` is `neoTextSubtleDark` `#a3a3a8` in neo dark, not `#a0a0a5`: a placeholder composited on this raised
    // surface read 4.46 with the old hex (18.306), under the neo floor of 4.5.
    expect(contrastRatio(colorOf('dark', 'accent', 'neo'), '#1b2340')).toBeGreaterThanOrEqual(4.5);
    for (const fg of ['textAccent', 'textSubtle'] as const) {
      expect(contrastRatio(colorOf('dark', fg, 'neo'), '#1b2340'), fg).toBeGreaterThanOrEqual(4.5);
      expect(
        CONTRAST_PAIRS.some((pair) => pair.fg === fg && pair.bg === 'surfaceRaised' && pair.minimum === 4.5),
        `CONTRAST_PAIRS holds ${fg} on surfaceRaised`,
      ).toBe(true);
    }
    expect(colorOf('dark', 'textSubtle', 'neo')).toBe('#a3a3a8');
    // CONTROL: hig and minimal dark raised did not move, nor did their textSubtle.
    expect(colorOf('dark', 'surfaceRaised', 'hig')).toBe(primitives.navyRaised);
    expect(colorOf('dark', 'surfaceRaised', 'minimal')).toBe(primitives.navyRaised);
    expect(colorOf('dark', 'textSubtle', 'hig')).toBe(primitives.textSubtleDark);
  });
});

describe('23.007 the neo well and track step in both themes; fields do not (audit BRD-21, ENT-19, SYS-07)', () => {
  it('23.007 surfaceTrack and surfaceWell are #e6dcd2 light and #141a33 dark; surfaceSunken now equals them (N2, 24.007)', () => {
    for (const role of ['surfaceTrack', 'surfaceWell'] as const) {
      expect(colorOf('light', role, 'neo'), `${role} light`).toBe('#e6dcd2');
      expect(colorOf('dark', role, 'neo'), `${role} dark`).toBe('#141a33');
      for (const fg of ['textAccent', 'text', 'textMuted', 'textSubtle'] as const) {
        for (const theme of ['light', 'dark'] as const) {
          expect(contrastRatio(colorOf(theme, fg, 'neo'), colorOf(theme, role, 'neo')), `${theme} ${fg} on ${role}`).toBeGreaterThanOrEqual(4.5);
        }
      }
      expect(CONTRAST_PAIRS.some((pair) => pair.fg === 'textAccent' && pair.bg === role && pair.minimum === 4.5), `textAccent on ${role}`).toBe(true);
      expect(CONTRAST_PAIRS.some((pair) => pair.fg === 'accent' && pair.bg === role && pair.minimum === 3), `accent fill on ${role}`).toBe(true);
    }
    // CONTROL: hig/minimal keep their own track/well. AMENDED 2026-10-02 by the neo refresh (N2, 24.007): the neo field ground now
    // IS the well — `surfaceSunken` was `#f1eae3` / `#1b2340` here, a pressed fill lighter than its ground.
    expect(colorOf('light', 'surfaceSunken', 'neo')).toBe('#e6dcd2');
    expect(colorOf('dark', 'surfaceSunken', 'neo')).toBe('#141a33');
    expect(colorOf('light', 'surfaceWell', 'hig')).toBe(primitives.wellWarm);
    expect(colorOf('dark', 'surfaceTrack', 'minimal')).toBe(primitives.trackNavy);
  });
});

describe('23.008 the neoNavyRaised docblock no longer claims the collision is mathematical (audit SYS-07)', () => {
  it('23.008 it names the retired #409cff as the reason it once was', () => {
    const src = readFileSync(join(REPO_ROOT, 'packages/ui/src/tokens.ts'), 'utf8');
    const at = src.indexOf("neoNavyRaised: '");
    expect(at).toBeGreaterThan(-1);
    const docblock = src.slice(src.lastIndexOf('/**', at), at);
    expect(docblock).not.toMatch(/mathematically incompatible/i);
    expect(docblock).toContain('#409cff');
    expect(docblock).toMatch(/retired/i);
    // CONTROL: the slice is the docblock of the right primitive, not a neighbour's.
    expect(docblock).toContain('232c50');
  });
});

describe('23.009 a disabled neo field in a sunken well stays readable (Review Focus 2)', () => {
  it('23.009 the disabled text is textSubtle and clears 4.5:1 on both wells, so it need not fall back to textMuted', () => {
    expect(primitives.neoWellLight).toBe('#e6dcd2');
    expect(primitives.neoWellDark).toBe('#141a33');
    expect(contrastRatio(colorOf('light', 'textSubtle', 'neo'), primitives.neoWellLight)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(colorOf('dark', 'textSubtle', 'neo'), primitives.neoWellDark)).toBeGreaterThanOrEqual(4.5);
    expect(CONTRAST_PAIRS.some((pair) => pair.fg === 'textSubtle' && pair.bg === 'surfaceWell' && pair.minimum === 4.5)).toBe(true);
    // The disabled arm paints its text in textSubtle (the value this case measures), over a transparent ground.
    const arm = rulesNaming(ui, '[data-style="neo"] .gn-field__input:disabled')[0] as { body: string };
    expect(valueOf(arm.body, 'color')).toBe('var(--gn-text-subtle)');
    expect(valueOf(arm.body, 'background')).toBe('transparent');
    // CONTROL: a pair that does fail 4.5 exists in the same table, so the threshold is not vacuous.
    expect(contrastRatio('#b09884', primitives.neoWellLight)).toBeLessThan(4.5);
  });
});
