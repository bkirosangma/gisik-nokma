import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from './helpers/colour-scan.js';
import { contrastRatio, over } from './helpers/contrast.js';
import { readUiCss, ruleExactly, valueOf } from './helpers/css-rules.js';
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
    // CONTROL: hig's raised-lg is its LIFT (FIX 1 item 1b: `.gn-nav` read lift and must not change), minimal's is none.
    expect(shadowValueOf('hig', 'light', 'raised-lg')).toBe(shadowValueOf('hig', 'light', 'lift'));
    expect(shadowValueOf('hig', 'dark', 'raised-lg')).toBe(shadowValueOf('hig', 'dark', 'lift'));
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
    // the disabled roles: neo draws nothing on a dead button, hig keeps what it painted (FIX 1 item 1e)
    for (const theme of ['light', 'dark'] as const) {
      expect(shadowValueOf('neo', theme, 'action-filled-disabled')).toBe('none');
      expect(shadowValueOf('neo', theme, 'danger-disabled')).toBe('none');
      expect(shadowValueOf('hig', theme, 'action-filled-disabled')).toBe(before[`hig/${theme}`]['action']);
      expect(shadowValueOf('hig', theme, 'danger-disabled')).toBe(before[`hig/${theme}`]['lift']);
    }
    // the two generic drops: scrim in hig/minimal (today's literals), the sheet/near-lg pair in neo
    expect(shadowValueOf('hig', 'light', 'drop')).toBe('0px 8px 24px #1c1b1866');
    expect(shadowValueOf('hig', 'dark', 'drop')).toBe('0px 8px 24px #000000a6');
    expect(shadowValueOf('minimal', 'light', 'drop-side')).toBe('-12px 0px 40px #1c1b1866');
    expect(shadowValueOf('minimal', 'dark', 'drop-side')).toBe('-12px 0px 40px #000000a6');
    for (const theme of ['light', 'dark'] as const) {
      expect(shadowValueOf('neo', theme, 'drop')).toBe(shadowValueOf('neo', theme, 'near-lg'));
      expect(shadowValueOf('neo', theme, 'drop-side')).toBe(shadowValueOf('neo', theme, 'sheet'));
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
  it('24.008 the twenty new roles are in SHADOW_ROLES and emitted nine times each (three blocks per style x hig/minimal/neo)', () => {
    const NEW = [
      'raised-lg', 'near-lg', 'near', 'raised-compact', 'recess', 'field', 'quiet', 'quiet-near', 'quiet-press',
      'action-filled', 'action-filled-near', 'action-filled-press', 'danger', 'danger-near', 'danger-press', 'knob-on',
      'action-filled-disabled', 'danger-disabled', 'drop', 'drop-side',
    ] as const;
    const sheet = themeStylesheet();
    const count = (role: string) => sheet.split(`--gn-shadow-${role}:`).length - 1;
    for (const role of NEW) {
      expect(SHADOW_ROLES).toContain(role);
      expect(count(role), role).toBe(9);
    }
    // CONTROL: an existing role is emitted the same nine times, so the count is the emitter's, not the roles'.
    expect(count('raised')).toBe(9);
  });
});

describe('24.009 the consumer door: every selector the plan switches renders in hig and minimal exactly as today (spec §7, zero drift)', () => {
  /** (selector, the role it reads today, the role it reads after this plan). Switched in T2–T6; the table is the contract. */
  const SWITCHES: ReadonlyArray<[string, ShadowRole, ShadowRole]> = [
    ['.gn-nav', 'lift', 'raised-lg'],
    ['.gn-dialog', 'lift-near', 'near-lg'], ['.gn-select__panel', 'lift-near', 'near-lg'], ['.gn-popover', 'lift-near', 'near-lg'],
    ['.gn-infotip__panel', 'lift-near', 'near-lg'], ['.gn-nav__menu', 'lift-near', 'near-lg'], ['.gn-card-menu__list', 'lift-near', 'near-lg'],
    ['.mention-popup, .wikilink-popup, .ticketref-popup', 'lift-near', 'near-lg'], ['.gn-skip', 'lift-near', 'near-lg'],
    ['.gn-toc-launcher__panel', 'lift-near', 'near-lg'], ['.wikilink-preview', 'lift-near', 'near-lg'], ['.table-toolbar', 'lift-near', 'near-lg'],
    ['.gn-button--primary', 'action', 'action-filled'], ['.gn-button--primary:hover', 'action-near', 'action-filled-near'],
    ['.gn-button--primary:active', 'action-press', 'action-filled-press'], ['.gn-button--primary:disabled', 'action', 'action-filled-disabled'],
    ['.gn-button--danger', 'lift', 'danger'], ['.gn-button--danger:hover', 'lift-near', 'danger-near'],
    ['.gn-button--danger:active', 'lift-press', 'danger-press'], ['.gn-button--danger:disabled', 'lift', 'danger-disabled'],
    ['.gn-list__column-option', 'lift', 'raised-compact'],
  ];
  /** Selectors that gain a role where they read NONE today: the role must be none in hig and minimal. */
  const NEW_READERS: ReadonlyArray<[string, ShadowRole]> = [
    ['.gn-button--ghost', 'quiet'], ['.gn-button--ghost:hover', 'quiet-near'], ['.gn-button--ghost:active', 'quiet-press'],
    ['.gn-dialog__close, .gn-sheet__close', 'quiet'], ['.gn-row-action', 'quiet'],
    ['.gn-switch:checked::after', 'knob-on'],
  ];
  it('24.009 for every switched selector the new role equals the old role in hig and minimal, both themes; every new reader is none there; the two literal drops render today\'s value through their roles', () => {
    for (const style of ['hig', 'minimal'] as const) {
      for (const theme of ['light', 'dark'] as const) {
        for (const [selector, oldRole, newRole] of SWITCHES) {
          expect(shadowValueOf(style, theme, newRole), `${style}/${theme} ${selector}`).toBe(shadowValueOf(style, theme, oldRole));
        }
        for (const [selector, role] of NEW_READERS) {
          expect(shadowValueOf(style, theme, role), `${style}/${theme} ${selector}`).toBe('none');
        }
        // `.workflow-rebind-dialog` (`0 8px 24px var(--gn-shadow)`) and `.gn-filters__panel` (`-0.75rem 0 2.5rem var(--gn-shadow)`) today
        const scrim = colorOf(theme, 'shadow', style);
        expect(shadowValueOf(style, theme, 'drop'), `${style}/${theme} .workflow-rebind-dialog`).toBe(`0px 8px 24px ${scrim}`);
        expect(shadowValueOf(style, theme, 'drop-side'), `${style}/${theme} .gn-filters__panel`).toBe(`-12px 0px 40px ${scrim}`);
      }
    }
    // CONTROL: the same table does NOT hold for neo — that is the refresh.
    expect(shadowValueOf('neo', 'light', 'raised-lg')).not.toBe(shadowValueOf('neo', 'light', 'lift'));
    expect(shadowValueOf('neo', 'light', 'quiet')).not.toBe('none');
  });
});

describe('24.010 the tinted ticket-sheet label stays legible in neo (FIX 1 item 5, planner ruling 2026-10-02)', () => {
  it('24.010 textMuted clears 4.5 on the tinted label ground and the neo arm reads it; textSubtle does not (the control)', () => {
    const ground = over(colorOf('light', 'fillQuaternary', 'neo'), colorOf('light', 'surfaceWell', 'neo'));
    expect(contrastRatio(colorOf('light', 'textMuted', 'neo'), ground)).toBeGreaterThanOrEqual(4.5);
    // the dark row: the arm applies in both themes, so textMuted must clear on the dark well too
    expect(contrastRatio(colorOf('dark', 'textMuted', 'neo'), over(colorOf('dark', 'fillQuaternary', 'neo'), colorOf('dark', 'surfaceWell', 'neo')))).toBeGreaterThanOrEqual(4.5);
    expect(valueOf(ruleExactly(readUiCss(), '[data-style="neo"] .gn-ticket-sheet__field--tinted dt'), 'color')).toBe('var(--gn-text-muted)');
    // CONTROL: the base rule's `textSubtle` is 4.469 on that composite — the defect the arm fixes.
    expect(contrastRatio(colorOf('light', 'textSubtle', 'neo'), ground)).toBeLessThan(4.5);
  });
});

// ---- T3 — the sunken family and the rim-less neo field (N2, N9, N10; cases 24.040–24.044)
const t3Ui = readUiCss();
const t3Globals = readFileSync(join(REPO_ROOT, 'apps/web/app/globals.css'), 'utf8');

describe('24.040 a neo text field has no rim; its recess edge is the boundary (N10; hig/minimal keep the ring)', () => {
  const NEO_FIELDS = [
    '[data-style="neo"] .gn-field__input',
    '[data-style="neo"] .gn-help__search-input',
    '[data-style="neo"] .gn-project__search',
    '[data-style="neo"] .workflow-builder-screen__name',
  ];
  it('24.040 every neo field arm is border: 1px solid transparent, background surface-sunken, box-shadow field; the base rule keeps --gn-border', () => {
    for (const sel of NEO_FIELDS) {
      const body = ruleExactly(t3Ui, sel);
      expect(valueOf(body, 'border'), sel).toBe('1px solid transparent');
      expect(valueOf(body, 'box-shadow'), sel).toBe('var(--gn-shadow-field)');
      expect(valueOf(body, 'background'), sel).toBe('var(--gn-surface-sunken)');
    }
    // CONTROL (the style scoping): the unscoped field keeps its 1px ring; hig/minimal render the ring and no field shadow.
    expect(valueOf(ruleExactly(t3Ui, '.gn-field__input'), 'border')).toBe('1px solid var(--gn-border)');
    expect(shadowValueOf('hig', 'light', 'field')).toBe('none');
    expect(shadowValueOf('minimal', 'light', 'field')).toBe('none');
    // and the disabled neo field stays flat (U7): transparent border, no shadow, textSubtle
    const dis = ruleExactly(t3Ui, ['[data-style="neo"] .gn-field__input:disabled', '[data-style="neo"] .gn-select__trigger:disabled']);
    expect(valueOf(dis, 'box-shadow')).toBe('none');
    expect(valueOf(dis, 'color')).toBe('var(--gn-text-subtle)');
  });
});

describe('24.041 the control recesses read recess; wells keep sunken (N9)', () => {
  it('24.041 segmented track, current nav item and the pressed segment read recess on the track fill; board columns and trays read track/sunken', () => {
    expect(valueOf(ruleExactly(t3Ui, '[data-style="neo"] .gn-segmented'), 'box-shadow')).toBe('var(--gn-shadow-recess)');
    const on = ruleExactly(t3Ui, '[data-style="neo"] .gn-segmented__item--on');
    expect(valueOf(on, 'box-shadow')).toBe('var(--gn-shadow-selected)'); // selected = recess in neo (24.004)
    expect(valueOf(on, 'background')).toBe('var(--gn-surface-track)'); // N2: never lighter than its track
    const nav = ruleExactly(t3Globals, ['[data-style="neo"] .gn-nav a[aria-current=\'page\']', '[data-style="neo"] .gn-nav button[aria-current=\'page\']']);
    expect(valueOf(nav, 'box-shadow')).toBe('var(--gn-shadow-recess)');
    // CONTROL: wells did not move to the control inset.
    expect(valueOf(ruleExactly(t3Ui, '.gn-board__column'), 'box-shadow')).toBe('var(--gn-shadow-track)');
    expect(valueOf(ruleExactly(t3Ui, '.gn-ticket-sheet__fields'), 'box-shadow')).toBe('var(--gn-shadow-track)');
    expect(valueOf(ruleExactly(t3Ui, '.gn-segmented'), 'box-shadow')).toBe('var(--gn-shadow-track)'); // hig keeps its lit-from-above track
  });
});

describe('24.042 the task checkbox takes the chip-sized inset and keeps its strong border', () => {
  it('24.042 the neo unchecked task box reads sunken-compact on surface-sunken with border-strong', () => {
    const box = ruleExactly(t3Globals, [
      "[data-style='neo'] .ticket-editor__content ul[data-type='taskList'] input[type='checkbox']:not(:checked)",
      "[data-style='neo'] .gn-comment__task > input[type='checkbox']:not(:checked)",
    ]);
    expect(valueOf(box, 'box-shadow')).toBe('var(--gn-shadow-sunken-compact)');
    expect(valueOf(box, 'border-color')).toBe('var(--gn-border-strong)');
  });
});

describe('24.043 hover lifts, press recesses: the neo help toggle no longer presses on hover (hig/minimal untouched)', () => {
  it('24.043 a [data-style="neo"] .gn-help__toggle:hover arm reads raised-compact; the unscoped rule keeps sunken; the segmented item and nav links transition box-shadow', () => {
    expect(valueOf(ruleExactly(t3Ui, '[data-style="neo"] .gn-help__toggle:hover'), 'box-shadow')).toBe('var(--gn-shadow-raised-compact)');
    expect(valueOf(ruleExactly(t3Ui, '.gn-help__toggle:hover'), 'box-shadow')).toBe('var(--gn-shadow-sunken)'); // CONTROL: none in hig/minimal, as today
    expect(valueOf(ruleExactly(t3Ui, '.gn-segmented__item'), 'transition')).toContain('box-shadow');
    expect(valueOf(ruleExactly(t3Globals, '.gn-nav a'), 'transition')).toContain('box-shadow');
  });
});

describe('24.044 a neo field inside a dark well still has a visible edge (Review Focus 2)', () => {
  it('24.044 the dark line clears 3.0 against the well AND the fill; the light line clears 3.0 against the well, paper and the raised card', () => {
    expect(contrastRatio('#7d88a8', colorOf('dark', 'surfaceWell', 'neo'))).toBeGreaterThanOrEqual(3.0);
    expect(contrastRatio('#7d88a8', colorOf('dark', 'surfaceSunken', 'neo'))).toBeGreaterThanOrEqual(3.0);
    for (const bg of ['surfaceWell', 'surface', 'surfaceRaised'] as const) {
      expect(contrastRatio('#897362', colorOf('light', bg, 'neo')), bg).toBeGreaterThanOrEqual(3.0);
    }
    // CONTROL: the soft edge is NOT claimed — the light lip and the dark band are under 3:1 and the test says so.
    expect(contrastRatio(over('#fffaf4cc', '#e6dcd2'), '#e6dcd2')).toBeLessThan(3.0);
    expect(contrastRatio(over('#000000bf', '#141a33'), '#141a33')).toBeLessThan(3.0);
  });
});
