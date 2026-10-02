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

describe('23.001 the field rim is a role, defined in every style and theme (audit SYS-05, WS-04, NP-25, TT-14)', () => {
  it('23.001 fieldRim resolves everywhere, neo is #897362 / #6f7997 and clears 3.0 on all four surfaces', () => {
    for (const [style, theme] of COMBOS) {
      expect(colorOf(theme, 'fieldRim', style), `${style}/${theme} fieldRim`).toMatch(/^#[0-9a-f]{6}$/);
    }
    expect(colorOf('light', 'fieldRim', 'neo')).toBe('#897362');
    // Planner ruling 03:15: the plan said #6b7491 (2.93 on the new raised, 3.14 for #6f7997, 3.57 on surface).
    expect(colorOf('dark', 'fieldRim', 'neo')).toBe('#6f7997');
    // hig and minimal map it to their existing field edge, so the role is defined without moving their fields.
    for (const style of ['hig', 'minimal'] as const) {
      for (const theme of ['light', 'dark'] as const) {
        expect(colorOf(theme, 'fieldRim', style), `${style}/${theme}`).toBe(colorOf(theme, 'border', style));
      }
    }
    expect(themeStylesheet()).toContain(`${cssVariableName('fieldRim')}: #897362;`);
    for (const bg of ['surface', 'surfaceRaised', 'surfaceSunken', 'surfaceWell'] as const) {
      expect(
        CONTRAST_PAIRS.some((pair) => pair.fg === 'fieldRim' && pair.bg === bg && pair.minimum === 3),
        `CONTRAST_PAIRS holds fieldRim on ${bg}`,
      ).toBe(true);
      for (const [style, theme] of COMBOS) {
        expect(
          contrastRatio(colorOf(theme, 'fieldRim', style), colorOf(theme, bg, style)),
          `${style}/${theme} fieldRim on ${bg}`,
        ).toBeGreaterThanOrEqual(3);
      }
    }
    // Neo measurements recorded in the case: light 3.31 on the well, 3.75 on paper; dark 3.14 on raised, 3.57 on surface.
    expect(contrastRatio('#897362', colorOf('light', 'surfaceWell', 'neo'))).toBeGreaterThan(3.3);
    expect(contrastRatio('#6f7997', colorOf('dark', 'surfaceRaised', 'neo'))).toBeGreaterThan(3.1);
    // CONTROL: the old shadow hue is not a ring (fails on paper), and the plan's #6b7491 fails on the new dark raised.
    expect(contrastRatio('#b09884', colorOf('light', 'surface', 'neo'))).toBeLessThan(3);
    expect(contrastRatio('#6b7491', colorOf('dark', 'surfaceRaised', 'neo'))).toBeLessThan(3);
  });
});

describe('23.002 neo text fields wear a 1px full ring and keep the sunken shadow (audit SYS-05, WS-04, NP-25, TT-14)', () => {
  const NEO_FIELDS = [
    '[data-style="neo"] .gn-field__input',
    '[data-style="neo"] .gn-help__search-input',
    '[data-style="neo"] .workflow-builder-screen__name',
    '[data-style="neo"] .gn-project__search',
  ];
  it('23.002 every neo field arm has border: 1px solid var(--gn-field-rim) and box-shadow: var(--gn-shadow-sunken)', () => {
    for (const selector of NEO_FIELDS) {
      const body = ruleExactly(ui, selector);
      expect(valueOf(body, 'border'), selector).toBe('1px solid var(--gn-field-rim)');
      // The project search keeps its sunken shadow in its BASE rule; the neo arm only adds the ring.
      const base = selector.replace('[data-style="neo"] ', '');
      const shadow = valueOf(body, 'box-shadow') ?? valueOf(ruleExactly(ui, base), 'box-shadow');
      expect(shadow, selector).toBe('var(--gn-shadow-sunken)');
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
    // CONTROL: an enabled neo field still has its ring and its inset.
    const enabled = ruleExactly(ui, '[data-style="neo"] .gn-field__input');
    expect(valueOf(enabled, 'border')).toBe('1px solid var(--gn-field-rim)');
    expect(valueOf(enabled, 'box-shadow')).toBe('var(--gn-shadow-sunken)');
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
  it('23.006 neo/dark surfaceRaised is #232c50, the highlight is #f2e9e11f and the text roles still read on it', () => {
    expect(colorOf('dark', 'surfaceRaised', 'neo')).toBe('#232c50');
    expect(primitives.neoNavyRaised).toBe('#232c50');
    expect(primitives.shadowNeoRaisedHighlightDark).toBe('#f2e9e11f');
    // accent (a fill, so not a CONTRAST_PAIRS row: tokens.ts retired that pairing), textAccent and textSubtle (5.40).
    // `textSubtle` is `neoTextSubtleDark` `#a3a3a8` in neo dark, not `#a0a0a5`: a placeholder composited on this raised
    // surface read 4.46 with the old hex (18.306), under the neo floor of 4.5.
    expect(contrastRatio(colorOf('dark', 'accent', 'neo'), '#232c50')).toBeGreaterThanOrEqual(4.5);
    for (const fg of ['textAccent', 'textSubtle'] as const) {
      expect(contrastRatio(colorOf('dark', fg, 'neo'), '#232c50'), fg).toBeGreaterThanOrEqual(4.5);
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
  it('23.007 surfaceTrack and surfaceWell are #e6dcd2 light and #141a33 dark; surfaceSunken is unchanged', () => {
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
    // CONTROL: the field ground did not step, and hig/minimal keep their own track/well.
    expect(colorOf('light', 'surfaceSunken', 'neo')).toBe('#f1eae3');
    expect(colorOf('dark', 'surfaceSunken', 'neo')).toBe('#1b2340');
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
