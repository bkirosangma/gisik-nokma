import { describe, expect, it } from 'vitest';
import { parseRules, ruleExactly, valueOf } from './helpers/css-rules.js';
import { cssOf, expectRow, flatBoundaryOffenders, type RosterRow } from './helpers/style-patterns.js';

/** Styling refresh Plan B, Task B4 — cases 20.231–20.232 (§20.24). */
function stillDeclared(list: string): boolean {
  return (['ui', 'globals'] as const).some((sheet) =>
    parseRules(cssOf(sheet)).some((rule) => rule.selectors.join(', ') === list),
  );
}

const CURRENT = [".gn-nav a[aria-current='page']", ".gn-nav button[aria-current='page']"];
const ROWS: RosterRow[] = [
  { sheet: 'globals', selectors: '.gn-nav', declarations: { 'box-shadow': 'var(--gn-shadow-lift)' } },
  {
    sheet: 'globals',
    selectors: ['.gn-nav a', '.gn-nav__more-toggle'],
    declarations: {
      'border-radius': '0.75rem',
      transition: 'background-color var(--gn-motion-feedback) ease-out, color var(--gn-motion-feedback) ease-out',
      color: 'var(--gn-text-muted)',
    },
  },
  {
    sheet: 'globals',
    selectors: CURRENT,
    declarations: {
      background: 'var(--gn-surface-raised)',
      'box-shadow': 'var(--gn-shadow-lift)',
      color: 'var(--gn-text)',
      'font-weight': '600',
      'border-radius': '0.75rem',
    },
  },
  { sheet: 'globals', selectors: '.gn-theme-toggle', declarations: { 'box-shadow': 'var(--gn-shadow-lift)' } },
  { sheet: 'globals', selectors: '.gn-skip', declarations: { 'box-shadow': 'var(--gn-shadow-lift-near)' } },
  {
    sheet: 'globals',
    selectors: '.gn-nav__menu .gn-nav__menu-item--signout',
    declarations: { 'border-top': '1px solid var(--gn-fill-secondary)' },
  },
];
const KEPT = ["[data-style=\"neo\"] .gn-nav a[aria-current='page']"];

describe('20.231 the shell follows the rules', () => {
  it('20.231 every row; the non-current links keep text-muted', () => {
    // CONTROL — the resting links stay `text-muted` (only the current item changes ink).
    const resting = ruleExactly(cssOf('globals'), ['.gn-nav a', '.gn-nav__more-toggle'], null);
    expect(valueOf(resting, 'color')).toBe('var(--gn-text-muted)');
    for (const row of ROWS) expectRow(row);
  });
});
describe('20.232 no flat boundary in the shell', () => {
  it('20.232 none; neo current kept', () => {
    // CONTROL — neo's pressed-in current item is still declared.
    for (const kept of KEPT) expect(stillDeclared(kept), kept).toBe(true);
    expect(flatBoundaryOffenders(cssOf('globals'), ['.gn-nav', '.gn-theme-toggle', '.gn-skip'], KEPT)).toEqual([]);
  });
});
