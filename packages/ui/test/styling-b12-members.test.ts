import { describe, expect, it } from 'vitest';
import { parseRules } from './helpers/css-rules.js';
import { cssOf, expectRow, flatBoundaryOffenders, type RosterRow } from './helpers/style-patterns.js';

/** Styling refresh Plan B, Task B12 — cases 20.311–20.312 (§20.32). */
const ROWS: RosterRow[] = [
  { sheet: 'globals', selectors: '.gn-members', pattern: 'P-RAISED' },
  { sheet: 'globals', selectors: '.gn-members__th', declarations: { background: 'var(--gn-surface-well)' } },
];

describe('20.311 Members follow the rules', () => {
  it('20.311 every row; the zebra is kept', () => {
    // CONTROL — the zebra rows keep their `fill-quaternary` (a stripe, not a boundary).
    expectRow({
      sheet: 'globals',
      selectors: '.gn-members__row:nth-child(even)',
      declarations: { background: 'var(--gn-fill-quaternary)' },
    });
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
