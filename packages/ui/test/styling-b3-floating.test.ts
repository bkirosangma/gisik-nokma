import { describe, expect, it } from 'vitest';
import { parseRules } from './helpers/css-rules.js';
import { cssOf, expectRow, type RosterRow } from './helpers/style-patterns.js';
import { colorOf } from '../src/tokens.js';

function stillDeclared(list: string): boolean {
  return (['ui', 'globals'] as const).some((sheet) =>
    parseRules(cssOf(sheet)).some((rule) => rule.selectors.join(', ') === list),
  );
}

/** Styling refresh Plan B, Task B3 — cases 20.221–20.222 (§20.23). */
const FLOAT = [
  ['ui', '.gn-select__panel'],
  ['ui', '.gn-popover'],
  ['ui', '.gn-infotip__panel'],
  ['globals', ['.mention-popup', '.wikilink-popup', '.ticketref-popup']],
  ['globals', '.gn-nav__menu'],
  ['globals', '.gn-card-menu__list'],
  ['globals', '.gn-toc-launcher__panel'],
  ['globals', '.wikilink-preview'],
  ['globals', '.table-toolbar'],
] as const;
const ROWS: RosterRow[] = [
  ...FLOAT.map(([sheet, selectors]) => ({ sheet, selectors, pattern: 'P-FLOAT' as const })),
  { sheet: 'ui', selectors: '.gn-infotip__panel', declarations: { border: '1px solid var(--gn-border)' } },
  { sheet: 'globals', selectors: '.gn-toc-launcher__button', declarations: { 'box-shadow': 'var(--gn-shadow-lift-near)' } },
];

describe('20.221 floating panels float near', () => {
  it('20.221 every row, no neo fork of the select panel, no size override on the delete dialog buttons', () => {
    for (const row of ROWS) expectRow(row);
    expect(stillDeclared('[data-style="neo"] .gn-select__panel')).toBe(false);
    expect(stillDeclared('.gn-delete-dialog__actions .gn-button')).toBe(false);
  });
});
describe('20.222 the floating ground differs from the page where no shadow carries it', () => {
  it('20.222 hig and minimal, both themes; neo equal by design', () => {
    for (const style of ['hig', 'minimal'] as const) {
      for (const theme of ['light', 'dark'] as const) {
        expect(colorOf(theme, 'surfaceRaised', style)).not.toBe(colorOf(theme, 'surface', style));
      }
    }
    // CONTROL — neo: same hex, the shadow is the boundary.
    expect(colorOf('light', 'surfaceRaised', 'neo')).toBe(colorOf('light', 'surface', 'neo'));
  });
});
