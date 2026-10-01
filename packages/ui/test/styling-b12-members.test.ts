import { describe, expect, it } from 'vitest';
import { parseRules } from './helpers/css-rules.js';
import { cssOf, expectRow, flatBoundaryOffenders, type RosterRow } from './helpers/style-patterns.js';

/** Styling refresh Plan B, Task B12 — cases 20.311–20.312 (§20.32). */
const ROWS: RosterRow[] = [
  { sheet: 'globals', selectors: '.gn-members', pattern: 'P-RAISED' },
  { sheet: 'globals', selectors: '.gn-members__th', declarations: { background: 'var(--gn-surface-well)' } },
];

describe('20.311 Members follow the rules', () => {
  it('20.311 every row; the zebra became a hairline (amended by 23.095)', () => {
    // AMENDED by 23.095 (UX fixes T6, audit SET-13): the every-second-row `fill-quaternary` tint read as a selected row, so each
    // row carries a `--gn-border` hairline instead.
    expectRow({
      sheet: 'globals',
      selectors: '.gn-members__row',
      declarations: { 'border-bottom': '1px solid var(--gn-border)' },
    });
    // CONTROL — the zebra is really gone, and the scan reads a sheet that still has the row family.
    expect(parseRules(cssOf('globals')).filter((rule) => rule.selectors.some((s) => s.startsWith('.gn-members__row:nth-child')))).toEqual([]);
    for (const row of ROWS) expectRow(row);
  });
});
describe('20.312 no flat boundary on Members', () => {
  it('20.312 none', () => {
    const css = cssOf('globals');
    // CONTROL — the scan reads a real family, not an empty set.
    expect(parseRules(css).filter((rule) => rule.selectors.some((s) => s.includes('.gn-members'))).length).toBeGreaterThan(15);
    expect(flatBoundaryOffenders(css, ['.gn-members', '.gn-invite-mint', '.gn-invite-pending'], [])).toEqual([]);
  });
});
