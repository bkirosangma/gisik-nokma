import { describe, expect, it } from 'vitest';
import { parseRules } from './helpers/css-rules.js';
import { cssOf, expectRow, flatBoundaryOffenders, type RosterRow } from './helpers/style-patterns.js';

/** Styling refresh Plan B, Task B6 — cases 20.251–20.253 (§20.26). */
const ROWS: RosterRow[] = [
  { sheet: 'ui', selectors: '.gn-table__row--clickable:hover', pattern: 'P-HOVER' },
  { sheet: 'ui', selectors: '.gn-row-action', pattern: 'P-GHOST', declarations: { padding: '0 0.75rem' } },
  { sheet: 'ui', selectors: '.gn-list__bulk-close', pattern: 'P-QUIET' },
  { sheet: 'ui', selectors: '.gn-list__columns-toggle', pattern: 'P-QUIET' },
  { sheet: 'ui', selectors: '.gn-list__column-option', declarations: { 'min-height': '2.75rem', 'box-shadow': 'var(--gn-shadow-lift)' } },
  {
    sheet: 'ui',
    selectors: '.gn-list__section-title',
    declarations: { background: 'var(--gn-surface-track)', 'box-shadow': 'var(--gn-shadow-track)', 'border-radius': 'var(--gn-radius-card)' },
  },
  { sheet: 'ui', selectors: '.gn-list__table-wrap', pattern: 'P-RAISED' },
  { sheet: 'ui', selectors: '.gn-list__table-header', declarations: { background: 'var(--gn-surface-well)' } },
];
const PREFIXES = ['.gn-list', '.gn-table', '.gn-row-action'];

describe('20.251 the List follows the rules', () => {
  it('20.251 every row; the collapse caret keeps its in-list floor', () => {
    for (const row of ROWS) expectRow(row);
    expectRow({ sheet: 'ui', selectors: '.gn-list__collapse', declarations: { 'min-height': '1.5rem' } });
  });
});
describe('20.252 no flat boundary on the List', () => {
  it('20.252 none; the tail-drop state edge kept', () => {
    const css = cssOf('ui');
    expect(parseRules(css).filter((rule) => rule.selectors.some((s) => PREFIXES.some((p) => s.includes(p)))).length).toBeGreaterThan(50);
    expect(flatBoundaryOffenders(css, PREFIXES, [])).toEqual([]);
    expectRow({ sheet: 'ui', selectors: '.gn-list__tail-drop', declarations: { 'border-top': '2px solid var(--gn-border)' } });
  });
});
describe('20.253 quiet in the toolbar, ghost in the row', () => {
  it('20.253 the bulk close has the edge; the row action does not', () => {
    expectRow({ sheet: 'ui', selectors: '.gn-list__bulk-close', declarations: { border: '1px solid var(--gn-border)', 'min-height': '2.75rem' } });
    expectRow({ sheet: 'ui', selectors: '.gn-row-action', declarations: { border: 'none', 'min-height': '2.75rem' } });
  });
});
