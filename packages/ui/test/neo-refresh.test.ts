import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from './helpers/colour-scan.js';
import { contrastRatio, over } from './helpers/contrast.js';
import {
  CONTRAST_PAIRS,
  SHADOW_ROLES,
  colorOf,
  primitives,
  shadowValueOf,
  themeStylesheet,
  type ShadowRole,
} from '../src/tokens.js';

const before = JSON.parse(readFileSync(join(REPO_ROOT, 'packages/ui/test/fixtures/hig-minimal-shadows.before.json'), 'utf8'));

describe('24.001 the neo shadow primitives are derived from the surface, one lamp per theme (spec §3.1; N5, N8, N9)', () => {
  it('24.001 every neo layer colour is pinned, 8-digit, and composites to the recorded ratio', () => {
    expect(primitives.shadowNeoDarkLight).toBe('#a89c918c');
    expect(primitives.shadowNeoDarkDark).toBe('#0000008c');
    expect(primitives.shadowNeoBandLight).toBe('#a89c91cc');
    expect(primitives.shadowNeoBandDark).toBe('#000000bf');
    expect(primitives.shadowNeoHighlightLight).toBe('#fffaf4b3');
    expect(primitives.shadowNeoHighlightDark).toBe('#f2e9e129');
    expect(primitives.shadowNeoLipLight).toBe('#fffaf4cc');
    expect(primitives.shadowNeoLipDark).toBe('#f2e9e159');
    expect(primitives.shadowNeoLineLight).toBe('#897362ff');
    expect(primitives.shadowNeoLineDark).toBe('#7d88a8ff');
    // the fall composited on paper is the same darkness as the old brown, with less chroma
    expect(contrastRatio(over('#a89c918c', '#f1eae3'), '#f1eae3')).toBeCloseTo(1.52, 1);
    // CONTROL: the retired brown is no longer mapped by any neo role
    const sheet = themeStylesheet();
    expect(sheet).not.toContain('#b098848c');
    expect(sheet).not.toContain('#fffffff2');
    expect(sheet).not.toContain('#ffffff0d');
  });
});

describe('24.002 hig and minimal are byte-identical before and after (spec §6–7)', () => {
  it('24.002 every role string and surface in hig/minimal equals the pre-refresh snapshot', () => {
    for (const style of ['hig', 'minimal'] as const) {
      for (const theme of ['light', 'dark'] as const) {
        const snap = before[`${style}/${theme}`];
        for (const role of Object.keys(snap).filter((k) => k !== 'surfaces') as ShadowRole[]) {
          expect(shadowValueOf(style, theme, role), `${style}/${theme}/${role}`).toBe(snap[role]);
        }
        for (const [role, hex] of Object.entries(snap.surfaces)) {
          expect(colorOf(theme, role as never, style), `${style}/${theme}/${role}`).toBe(hex);
        }
      }
    }
    // CONTROL: neo did move — the same comparison fails for it on `raised`.
    expect(shadowValueOf('neo', 'light', 'raised')).not.toBe('7px 7px 16px #b098848c, -7px -7px 16px #fffffff2');
  });
});

describe('24.003 the sized pairs (spec §3.3; N7)', () => {
  it('24.003 raised-lg 7/16, raised 4/10, raised-compact 2/4, near 6/14, near-lg 10/24 in both neo themes', () => {
    const d = { light: '#a89c918c', dark: '#0000008c' };
    const h = { light: '#fffaf4b3', dark: '#f2e9e129' };
    const hc = { light: '#fffaf480', dark: '#f2e9e11f' };
    for (const theme of ['light', 'dark'] as const) {
      expect(shadowValueOf('neo', theme, 'raised-lg')).toBe(`7px 7px 16px ${d[theme]}, -7px -7px 16px ${h[theme]}`);
      expect(shadowValueOf('neo', theme, 'raised')).toBe(`4px 4px 10px ${d[theme]}, -4px -4px 10px ${h[theme]}`);
      expect(shadowValueOf('neo', theme, 'raised-compact')).toBe(`2px 2px 4px ${d[theme]}, -2px -2px 4px ${hc[theme]}`);
      expect(shadowValueOf('neo', theme, 'near')).toBe(`6px 6px 14px ${d[theme]}, -6px -6px 14px ${h[theme]}`);
      expect(shadowValueOf('neo', theme, 'near-lg')).toBe(`10px 10px 24px ${d[theme]}, -10px -10px 24px ${h[theme]}`);
      // aliases
      expect(shadowValueOf('neo', theme, 'lift')).toBe(shadowValueOf('neo', theme, 'raised'));
      expect(shadowValueOf('neo', theme, 'lift-near')).toBe(shadowValueOf('neo', theme, 'near'));
      expect(shadowValueOf('neo', theme, 'overlay')).toBe(shadowValueOf('neo', theme, 'raised-lg'));
      expect(shadowValueOf('neo', theme, 'sheet')).toBe(shadowValueOf('neo', theme, 'raised-lg'));
      expect(shadowValueOf('neo', theme, 'lift-drag')).toBe(`14px 14px 32px ${d[theme]}, -14px -14px 32px ${h[theme]}`);
    }
    // CONTROL: hig's raised-lg is its raised, minimal's is none.
    expect(shadowValueOf('hig', 'light', 'raised-lg')).toBe(shadowValueOf('hig', 'light', 'raised'));
    expect(shadowValueOf('minimal', 'dark', 'raised-lg')).toBe('none');
  });
});

describe('24.004 the inset family sized to the box (spec §3.3; N9, N1)', () => {
  it('24.004 sunken 3/6 with a half-strength highlight; recess 3/5 band + 1px lip; sunken-compact 1/3; press/selected = recess', () => {
    expect(shadowValueOf('neo', 'light', 'sunken')).toBe('inset 3px 3px 6px #a89c9199, inset -3px -3px 5px #fffaf480');
    expect(shadowValueOf('neo', 'dark', 'sunken')).toBe('inset 3px 3px 6px #0000008c, inset -3px -3px 5px #f2e9e114');
    expect(shadowValueOf('neo', 'light', 'recess')).toBe('inset 3px 3px 5px #a89c91cc, inset -1px -1px 1px #fffaf4cc');
    expect(shadowValueOf('neo', 'dark', 'recess')).toBe('inset 3px 3px 5px #000000bf, inset -1px -1px 1px #f2e9e159');
    expect(shadowValueOf('neo', 'light', 'sunken-compact')).toBe('inset 1px 1px 3px #a89c9199, inset -1px -1px 2px #fffaf480');
    expect(shadowValueOf('neo', 'dark', 'sunken-compact')).toBe('inset 1px 1px 3px #0000008c, inset -1px -1px 2px #f2e9e114');
    for (const theme of ['light', 'dark'] as const) {
      expect(shadowValueOf('neo', theme, 'track')).toBe(shadowValueOf('neo', theme, 'sunken'));
      expect(shadowValueOf('neo', theme, 'selected')).toBe(shadowValueOf('neo', theme, 'recess'));
      expect(shadowValueOf('neo', theme, 'lift-press')).toBe(shadowValueOf('neo', theme, 'recess'));
      expect(shadowValueOf('neo', theme, 'action-press')).toBe(shadowValueOf('neo', theme, 'recess'));
      expect(shadowValueOf('neo', theme, 'lift-press').startsWith('inset'), `${theme} press inverts (N1)`).toBe(true);
    }
    // CONTROL: hig's recess is its sunken (none), so a hig card still presses on its own lift-press.
    expect(shadowValueOf('hig', 'light', 'recess')).toBe('none');
    expect(shadowValueOf('hig', 'light', 'lift-press')).toBe(before['hig/light']['lift-press']);
  });
});

describe('24.005 the neo field role: one crisp line per theme at >= 3:1 (spec §3.3, §5; N10)', () => {
  it('24.005 light = line top-left + band + lip; dark = band + line bottom-right; the line clears 3.0 on the field fill', () => {
    expect(shadowValueOf('neo', 'light', 'field')).toBe('inset 1px 1px 0px #897362ff, inset 3px 3px 5px #a89c91cc, inset -1px -1px 1px #fffaf4cc');
    expect(shadowValueOf('neo', 'dark', 'field')).toBe('inset 3px 3px 5px #000000bf, inset -1px -1px 0px #7d88a8ff');
    expect(contrastRatio('#897362', colorOf('light', 'surfaceSunken', 'neo'))).toBeGreaterThanOrEqual(3.0); // 3.31
    expect(contrastRatio('#7d88a8', colorOf('dark', 'surfaceSunken', 'neo'))).toBeGreaterThanOrEqual(3.0); // 4.86
    expect(contrastRatio('#7d88a8', colorOf('dark', 'surfaceRaised', 'neo'))).toBeGreaterThanOrEqual(3.0); // vs the card
    // CONTROL: hig and minimal have no field role (they keep the rim).
    expect(shadowValueOf('hig', 'light', 'field')).toBe('none');
    expect(shadowValueOf('minimal', 'dark', 'field')).toBe('none');
  });
});

describe('24.006 filled surfaces carry no highlight (spec §4; N8)', () => {
  it('24.006 action-filled is one dark layer; its press is an inset in the fill darkened by a quarter; hig keeps its action/lift values', () => {
    expect(shadowValueOf('neo', 'light', 'action-filled')).toBe('3px 4px 10px #a89c918c');
    expect(shadowValueOf('neo', 'dark', 'action-filled')).toBe('3px 4px 10px #0000008c');
    expect(shadowValueOf('neo', 'light', 'action-filled-near')).toBe('5px 6px 14px #a89c918c');
    expect(shadowValueOf('neo', 'light', 'action-filled-press')).toBe('inset 2px 2px 5px #264a77ff');
    expect(shadowValueOf('neo', 'dark', 'action-filled-press')).toBe('inset 2px 2px 5px #5f7fabff');
    expect(shadowValueOf('neo', 'light', 'danger-press')).toBe('inset 2px 2px 5px #772018ff');
    expect(shadowValueOf('neo', 'dark', 'danger-press')).toBe('inset 2px 2px 5px #bf4f49ff');
    expect(shadowValueOf('neo', 'light', 'knob-on')).toBe('1px 2px 4px #a89c918c');
    for (const theme of ['light', 'dark'] as const) {
      for (const role of ['action-filled', 'action-filled-near', 'danger', 'danger-near'] as const) {
        expect(shadowValueOf('neo', theme, role).split(',').length, `${theme}/${role} has one layer`).toBe(1);
      }
      expect(shadowValueOf('hig', theme, 'action-filled')).toBe(before[`hig/${theme}`]['action']);
      expect(shadowValueOf('hig', theme, 'danger')).toBe(before[`hig/${theme}`]['lift']);
      expect(shadowValueOf('hig', theme, 'danger-press')).toBe(before[`hig/${theme}`]['lift-press']);
    }
    // the press shades are the fill x 0.75, stated so a palette edit recomputes them
    expect(primitives.shadowNeoAccentPressLight).toBe('#264a77ff'); // blue600 #33629f x 0.75
    expect(primitives.shadowNeoDangerPressLight).toBe('#772018ff'); // neoLightDanger #9e2a20 x 0.75
  });
});

describe('24.007 surfaces: sunken = the well, dark raised = the page hex (N2, N4 = B)', () => {
  it('24.007 neo surfaceSunken is #e6dcd2 / #141a33, neo-dark surfaceRaised is #1b2340, and the text tiers clear 4.5 on the new field ground', () => {
    expect(colorOf('light', 'surfaceSunken', 'neo')).toBe('#e6dcd2');
    expect(colorOf('dark', 'surfaceSunken', 'neo')).toBe('#141a33');
    expect(colorOf('dark', 'surfaceRaised', 'neo')).toBe('#1b2340');
    expect(colorOf('dark', 'surfaceRaised', 'neo')).toBe(colorOf('dark', 'surface', 'neo'));
    for (const theme of ['light', 'dark'] as const) {
      for (const fg of ['text', 'textMuted', 'textSubtle', 'textAccent'] as const) {
        expect(contrastRatio(colorOf(theme, fg, 'neo'), colorOf(theme, 'surfaceSunken', 'neo')), `${theme} ${fg}`).toBeGreaterThanOrEqual(4.5);
      }
    }
    // the declared pairs that already guard these grounds still exist (23.007 added them for track/well)
    expect(CONTRAST_PAIRS.some((p) => p.fg === 'textAccent' && p.bg === 'surfaceWell' && p.minimum === 4.5)).toBe(true);
    // CONTROL: hig's sunken and dark raised did not move.
    expect(colorOf('light', 'surfaceSunken', 'hig')).toBe(before['hig/light'].surfaces.surfaceSunken);
    expect(colorOf('dark', 'surfaceRaised', 'hig')).toBe(before['hig/dark'].surfaces.surfaceRaised);
  });
});

describe('24.008 every new role reaches the stylesheet under every style x theme (13.411 extended)', () => {
  it('24.008 the sixteen new roles are in SHADOW_ROLES and emitted as often as an existing role (every style x theme block)', () => {
    const NEW = ['raised-lg', 'near-lg', 'near', 'raised-compact', 'recess', 'field', 'quiet', 'quiet-near', 'quiet-press', 'action-filled', 'action-filled-near', 'action-filled-press', 'danger', 'danger-near', 'danger-press', 'knob-on'] as const;
    const sheet = themeStylesheet();
    const count = (role: string) => sheet.split(`--gn-shadow-${role}:`).length - 1;
    // CONTROL: an existing role is declared once per block of `themeStylesheet()`: three per style (light, explicit dark,
    // prefers-color-scheme dark) x hig/minimal/neo = 9. The plan said "six"; the new roles are held to the existing role's count.
    const expected = count('raised');
    expect(expected).toBeGreaterThanOrEqual(6);
    for (const role of NEW) {
      expect(SHADOW_ROLES).toContain(role);
      expect(count(role), role).toBe(expected);
    }
  });
});
