import { describe, expect, it } from 'vitest';
import { parseRules } from './helpers/css-rules.js';
import { cssOf, expectRow, flatBoundaryOffenders, type RosterRow } from './helpers/style-patterns.js';

/** Styling refresh Plan B, Task B6 — cases 20.251–20.253 (§20.26). */
const ROWS: RosterRow[] = [
  { sheet: 'ui', selectors: '.gn-table__row--clickable:hover', pattern: 'P-HOVER' },
  { sheet: 'ui', selectors: '.gn-row-action', pattern: 'P-GHOST', declarations: { padding: '0 0.75rem' } },
  { sheet: 'ui', selectors: '.gn-list__bulk-close', pattern: 'P-QUIET' },
  { sheet: 'ui', selectors: '.gn-list__columns-toggle', pattern: 'P-QUIET' },
  // Neo refresh N6 (24.071, 2026-10-02): the pill reads `raised-compact` (was `lift`); hig and minimal map `raised-compact` to `lift`, so they render the same.
  { sheet: 'ui', selectors: '.gn-list__column-option', declarations: { 'min-height': '2.75rem', 'box-shadow': 'var(--gn-shadow-raised-compact)' } },
  {
    sheet: 'ui',
    selectors: '.gn-list__section-title',
    // Amended 2026-10-02 by 23.095 (UX fixes T6, PV-17): a flat tint, not a recessed trough.
    declarations: { background: 'var(--gn-fill-quaternary)', 'border-radius': 'var(--gn-radius-card)' },
  },
  { sheet: 'ui', selectors: '.gn-list__table-wrap', pattern: 'P-RAISED' },
  { sheet: 'ui', selectors: '.gn-list__table-header', declarations: { background: 'var(--gn-surface-well)' } },
];
const PREFIXES = ['.gn-list', '.gn-table', '.gn-row-action'];
const NEO_COLUMN_BOX = '[data-style="neo"] .gn-list__column-box';

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
    // Neo refresh N6 (24.071, 2026-10-02): the neo column box is a chip-sized recess (`surface-sunken` + `sunken-compact`),
    // a control's recess and not a flat boundary; it carries its own `--gn-border` edge, asserted in 24.071. The control:
    // with no `kept` list the scan reports exactly this rule, so the entry is load-bearing and cannot go stale silently.
    expect(flatBoundaryOffenders(css, PREFIXES, [])).toEqual([NEO_COLUMN_BOX]);
    expect(flatBoundaryOffenders(css, PREFIXES, [NEO_COLUMN_BOX])).toEqual([]);
    expectRow({ sheet: 'ui', selectors: '.gn-list__tail-drop', declarations: { 'border-top': '2px solid var(--gn-border)' } });
  });
});
describe('20.253 quiet in the toolbar, ghost in the row', () => {
  it('20.253 the bulk close has the edge; the row action does not', () => {
    expectRow({ sheet: 'ui', selectors: '.gn-list__bulk-close', declarations: { border: '1px solid var(--gn-border)', 'min-height': '2.75rem' } });
    expectRow({ sheet: 'ui', selectors: '.gn-row-action', declarations: { border: 'none', 'min-height': '2.75rem' } });
  });
});
