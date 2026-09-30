import { describe, expect, it } from 'vitest';
import { parseRules } from './helpers/css-rules.js';
import { cssOf, expectRow, flatBoundaryOffenders, type RosterRow } from './helpers/style-patterns.js';

/** Styling refresh Plan B, Task B5 — cases 20.241–20.242 (§20.25). */
const ROWS: RosterRow[] = [
  { sheet: 'ui', selectors: '.gn-project__header', declarations: { gap: '1rem' } },
  { sheet: 'ui', selectors: '.gn-contest-banner', pattern: 'P-WELL', declarations: { border: '1px solid var(--gn-contested)' } },
  {
    sheet: 'ui',
    selectors: '.gn-saved-filters__name',
    declarations: { background: 'var(--gn-fill-quaternary)', 'box-shadow': 'var(--gn-shadow-track)', 'border-radius': 'var(--gn-radius-control)' },
  },
  { sheet: 'ui', selectors: '.gn-sync-notices__dismiss', pattern: 'P-QUIET' },
];
const PREFIXES = ['.gn-project', '.gn-filters', '.gn-saved-filters', '.gn-contest-banner', '.gn-sync-'];

describe('20.241 the project chrome follows the rules', () => {
  it('20.241 every row; the chip remove keeps its in-list floor', () => {
    for (const row of ROWS) expectRow(row);
    expectRow({ sheet: 'ui', selectors: '.gn-project__filter-chip-remove', declarations: { 'min-height': '1.5rem' } });
  });
});
describe('20.242 no flat boundary in the project chrome', () => {
  it('20.242 none', () => {
    const css = cssOf('ui');
    expect(parseRules(css).filter((rule) => rule.selectors.some((s) => PREFIXES.some((p) => s.includes(p)))).length).toBeGreaterThan(40);
    expect(flatBoundaryOffenders(css, PREFIXES, [])).toEqual([]);
  });
});
