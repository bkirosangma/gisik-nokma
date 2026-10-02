import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Button } from '@gisik-nokma/ui';
import { REPO_ROOT } from '../../../packages/ui/test/helpers/colour-scan.js';
import { contrastRatio, over } from '../../../packages/ui/test/helpers/contrast.js';
import { parseRules, ruleExactly, rulesNaming, valueOf } from '../../../packages/ui/test/helpers/css-rules.js';
import { cssOf } from '../../../packages/ui/test/helpers/style-patterns.js';
import { colorOf, type StyleName, type ThemeName } from '../../../packages/ui/src/tokens.js';
import { TriStateChoice } from '../src/tri-state-choice.js';

/**
 * UX fixes T2 (audit 2026-10-01; spec U1 and "one destructive treatment", owner 2026-10-02): the accent is for the
 * action only, so a SELECTION moves to the quiet track + weight; and one destructive treatment, a quiet danger button
 * until the confirm dialog. Cases 23.020-23.022 (23.023, the Members row overflow, is in `members-page.test.tsx`).
 *
 * FD2 (plan): switches keep the accent for "on" (a value, not a navigation selection), so `.gn-switch:checked` and
 * `.gn-button--primary` are the controls in 23.020.
 */
const ui = cssOf('ui');
const globals = cssOf('globals');
const COMBOS: ReadonlyArray<[StyleName, ThemeName]> = [
  ['hig', 'light'],
  ['hig', 'dark'],
  ['minimal', 'light'],
  ['minimal', 'dark'],
  ['neo', 'light'],
  ['neo', 'dark'],
];

const ACCENT = 'var(--gn-accent)';
const TRACK = 'var(--gn-surface-track)';

/** Every declared value of `property` on a rule whose selector list names `selector` exactly, in either sheet. */
function selectionRule(sheet: string, selector: string) {
  return ruleExactly(sheet, selector, null);
}

describe('23.020 a selection is the quiet track with weight and the main text, never the accent fill (audit SYS-04, SET-16)', () => {
  const SELECTIONS: ReadonlyArray<{ name: string; sheet: string; selector: string; ownsText: boolean }> = [
    { name: 'the settings rail', sheet: globals, selector: ".gn-settings__sidebar a[aria-current='page']", ownsText: true },
    { name: 'the Help contents', sheet: ui, selector: ".gn-help__nav-link[aria-current='location']", ownsText: true },
    { name: 'a pressed filter chip', sheet: ui, selector: ".gn-filters__chip[aria-pressed='true']", ownsText: true },
    { name: 'an included choice', sheet: ui, selector: ".gn-filters__choice[data-mode='include']", ownsText: true },
    { name: 'an included choice row', sheet: ui, selector: ".gn-filters__choice--row[data-mode='include']", ownsText: false },
  ];

  it('23.020 each selection rule sits on the track, in the main text colour at weight 600, and none paints the accent; CONTROL: .gn-button--primary and .gn-switch:checked still do', () => {
    for (const { name, sheet, selector, ownsText } of SELECTIONS) {
      const body = selectionRule(sheet, selector);
      expect(valueOf(body, 'background'), `${name} background`).toBe(TRACK);
      expect(valueOf(body, 'background'), name).not.toBe(ACCENT);
      expect(valueOf(body, 'background-color'), name).not.toBe(ACCENT);
      if (ownsText) {
        expect(valueOf(body, 'color'), `${name} colour`).toBe('var(--gn-text)');
        expect(valueOf(body, 'font-weight'), `${name} weight`).toBe('600');
      }
    }
    // The Help row's hover must not flash the accent back in (its own docblock says why the rule exists).
    expect(valueOf(selectionRule(ui, ".gn-help__nav-link[aria-current='location']:hover"), 'background')).toBe(TRACK);
    // The row variant's weight: 600 on the shared choice rule, inherited by the row.
    expect(valueOf(selectionRule(ui, ".gn-filters__choice[data-mode='include']"), 'font-weight')).toBe('600');

    // CONTROL (same it): the accent fill is not banned, it is kept for the action and for a switch's value.
    expect(valueOf(selectionRule(ui, '.gn-button--primary'), 'background')).toBe(ACCENT);
    const switchChecked = rulesNaming(ui, '.gn-switch:checked').filter((r) => r.atRule === null);
    expect(switchChecked.length, '.gn-switch:checked rules').toBeGreaterThan(0);
    expect(switchChecked.map((r) => valueOf(r.body, 'background')).filter((v) => v !== null)).toContain(ACCENT);
  });

  it('23.020 a pressed chip carries a check icon, so the selection is never colour or fill alone; CONTROL: an unselected choice has the ring but no tick', () => {
    const on = renderToStaticMarkup(createElement(TriStateChoice, { mode: 'include', label: 'Bug', onCycle: () => undefined }));
    const off = renderToStaticMarkup(createElement(TriStateChoice, { mode: 'off', label: 'Bug', onCycle: () => undefined }));
    expect(on).toContain('M5 8.2 7.1 10.3 11.2 6'); // the tick path
    expect(off).not.toContain('M5 8.2 7.1 10.3 11.2 6');
    expect(off).toContain('<circle'); // control: the glyph itself renders in both
  });
});

describe('23.021 the calendar item is a quiet primary fill with a 3px accent edge, not an accent block (audit SYS-04)', () => {
  it('23.021 .gn-calendar__item uses fill-primary, the main text and a 3px accent edge; CONTROL: its text clears 4.5:1 on the composited fill in all six style x theme combinations', () => {
    const body = selectionRule(ui, '.gn-calendar__item');
    expect(valueOf(body, 'background')).toBe('var(--gn-fill-primary)');
    expect(valueOf(body, 'color')).toBe('var(--gn-text)');
    expect(valueOf(body, 'border-left')).toBe('3px solid var(--gn-accent)');
    expect(valueOf(selectionRule(ui, '.gn-calendar__glyph'), 'color')).toBe('var(--gn-text)');
    // The items sit on `--gn-surface` (`.gn-calendar__items`), so that is the ground the translucent fill composites on.
    for (const [style, theme] of COMBOS) {
      const ground = colorOf(theme, 'surface', style);
      const fill = over(colorOf(theme, 'fillPrimary', style), ground);
      expect(contrastRatio(colorOf(theme, 'text', style), fill), `${style}/${theme} text on the fill`).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe('23.022 one destructive treatment: a quiet danger button in a list, the filled danger only in the confirm dialog (audit SYS-12, SET-04, SET-05, WS-11)', () => {
  const read = (path: string): string => readFileSync(join(REPO_ROOT, path), 'utf8');
  const IN_LIST = [
    'packages/app-core/src/account/deleted-items-section.tsx',
    'packages/app-core/src/account/passkeys-section.tsx',
    'packages/app-core/src/workflow-builder/ticket-types/fields-editor.tsx',
    // The builder's three destructive buttons ("Remove rule", "Delete transition", "Delete state") wear the same variant.
    'packages/app-core/src/workflow-builder/ui/transition-inspector.tsx',
    'packages/app-core/src/workflow-builder/ui/state-inspector.tsx',
  ];
  const CONFIRM = ['packages/app-core/src/views/delete-dialog.tsx', 'apps/web/app/w/[workspaceId]/members/page.tsx'];

  it('23.022 .gn-button--danger-quiet is an outlined button with a danger label and edge, no fill and no lift; CONTROL: .gn-button--danger is still the filled one', () => {
    const quiet = selectionRule(ui, '.gn-button--danger-quiet');
    expect(valueOf(quiet, 'background')).toBe('transparent');
    expect(valueOf(quiet, 'color')).toBe('var(--gn-danger)');
    expect(valueOf(quiet, 'border')).toBe('1px solid var(--gn-danger)');
    expect(valueOf(quiet, 'box-shadow')).toBe('none');
    // The hover THICKENS the edge with an inset ring on the same ground, and never lifts; the press drops the ring.
    const hover = selectionRule(ui, '.gn-button--danger-quiet:hover:not(:disabled)');
    expect(valueOf(hover, 'box-shadow')).toBe('inset 0 0 0 1px var(--gn-danger)');
    expect(valueOf(hover, 'background')).toBe('transparent');
    expect(valueOf(hover, 'transform')).toBe('none');
    const press = selectionRule(ui, '.gn-button--danger-quiet:active:not(:disabled)');
    expect(valueOf(press, 'box-shadow')).toBe('none');
    expect(valueOf(press, 'transform')).toBe('none');
    // Danger as ink on the grounds these buttons sit on (a raised card, a well) clears 4.5, the edge therefore 3.
    for (const [style, theme] of COMBOS) {
      for (const ground of ['surfaceRaised', 'surfaceWell'] as const) {
        expect(
          contrastRatio(colorOf(theme, 'danger', style), colorOf(theme, ground, style)),
          `${style}/${theme} danger on ${ground}`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
    // CONTROL (same it): the confirm's variant keeps its fill.
    expect(valueOf(selectionRule(ui, '.gn-button--danger'), 'background')).toBe('var(--gn-danger)');
  });

  it('23.022 Button accepts variant="danger-quiet" and puts the class on the element; CONTROL: variant="danger" still renders its own class', () => {
    expect(renderToStaticMarkup(createElement(Button, { variant: 'danger-quiet' }, 'Delete'))).toContain('gn-button--danger-quiet');
    const filled = renderToStaticMarkup(createElement(Button, { variant: 'danger' }, 'Delete'));
    expect(filled).toContain('gn-button--danger');
    expect(filled).not.toContain('danger-quiet');
  });

  it('23.022 the five in-list sites (both builder inspectors included) use danger-quiet and the two confirm sites stay danger; CONTROL: the confirm sites really carry variant="danger"', () => {
    for (const path of IN_LIST) {
      const source = read(path);
      expect(source, path).toContain('variant="danger-quiet"');
      expect(source, path).not.toMatch(/variant="danger"/);
    }
    for (const path of CONFIRM) {
      const source = read(path);
      expect(source, path).toMatch(/variant="danger"/);
      expect(source, path).not.toContain('danger-quiet');
    }
  });
});
