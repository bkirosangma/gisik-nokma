import { describe, expect, it } from 'vitest';
import { parseRules } from './helpers/css-rules.js';
import { cssOf, expectRow, flatBoundaryOffenders, type RosterRow } from './helpers/style-patterns.js';

/** Styling refresh Plan B, Task B20 — cases 20.391–20.392 (§20.40). */
const ROWS: RosterRow[] = [
  { sheet: 'ui', selectors: '.gn-help__results', declarations: { background: 'var(--gn-surface-track)', 'box-shadow': 'var(--gn-shadow-track)' } },
  { sheet: 'ui', selectors: '.gn-help__none', declarations: { background: 'var(--gn-surface-track)', 'box-shadow': 'var(--gn-shadow-track)' } },
  // Amended 2026-10-02 by 23.095 (UX fixes T6, NP-21): the quote and the legal draft are a tinted FLAT fill, no inset shadow.
  { sheet: 'ui', selectors: '.gn-help__quote', declarations: { background: 'var(--gn-fill-quaternary)' } },
  { sheet: 'ui', selectors: '.gn-help__code', declarations: { background: 'var(--gn-surface-well)' } },
  { sheet: 'ui', selectors: '.gn-help__table th', declarations: { background: 'var(--gn-surface-well)' } },
  { sheet: 'ui', selectors: '.gn-help__group-toggle:hover', pattern: 'P-HOVER' },
  { sheet: 'ui', selectors: '.gn-help__nav-link:hover', pattern: 'P-HOVER' },
  {
    sheet: 'globals',
    selectors: '.gn-legal__flag',
    declarations: { background: 'var(--gn-surface-well)', 'border-radius': 'var(--gn-radius-card)', 'border-left': '3px solid var(--gn-warning)' },
  },
  { sheet: 'globals', selectors: '.gn-legal__draft', declarations: { background: 'var(--gn-fill-quaternary)' } },
  { sheet: 'globals', selectors: '.gn-notfound__why', pattern: 'P-WELL' },
  { sheet: 'globals', selectors: '.gn-notfound__link', pattern: 'P-QUIET', hover: 'none: a link is never :disabled; its :hover rule is the next row (P-HOVER)' },
  { sheet: 'globals', selectors: '.gn-notfound__link:hover', pattern: 'P-HOVER' },
  { sheet: 'globals', selectors: '.gn-notfound__tile', declarations: { 'box-shadow': 'var(--gn-shadow-lift)' } },
];
const KEPT = ['[data-style="neo"] .gn-help__search-input'];

function stillDeclared(list: string): boolean {
  return parseRules(cssOf('ui')).some((rule) => rule.selectors.join(', ') === list);
}

describe('20.391 help, legal and not-found follow the rules', () => {
  it('20.391 every row; the search field keeps its edge', () => {
    // CONTROL — the search field keeps its edge and its neo override.
    expectRow({ sheet: 'ui', selectors: '.gn-help__search-input', declarations: { border: '1px solid var(--gn-border)' } });
    for (const kept of KEPT) expect(stillDeclared(kept), kept).toBe(true);
    for (const row of ROWS) expectRow(row);
  });
});

describe('20.392 no flat boundary on the reading screens', () => {
  it('20.392 none outside the kept list', () => {
    const ui = cssOf('ui');
    // CONTROL — the scan reads the help rules, not an empty set.
    expect(parseRules(ui).filter((rule) => rule.selectors.some((s) => s.includes('.gn-help'))).length).toBeGreaterThan(60);
    expect(flatBoundaryOffenders(ui, ['.gn-help'], KEPT)).toEqual([]);
    const globals = cssOf('globals');
    expect(parseRules(globals).filter((rule) => rule.selectors.some((s) => s.includes('.gn-legal') || s.includes('.gn-notfound'))).length).toBeGreaterThan(10);
    expect(flatBoundaryOffenders(globals, ['.gn-legal', '.gn-notfound'], [])).toEqual([]);
  });
});
