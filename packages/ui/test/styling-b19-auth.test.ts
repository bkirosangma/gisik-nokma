import { describe, expect, it } from 'vitest';
import { parseRules } from './helpers/css-rules.js';
import { cssOf, expectRow, flatBoundaryOffenders, type RosterRow } from './helpers/style-patterns.js';

/** Styling refresh Plan B, Task B19 — cases 20.381–20.382 (§20.39). */
const ROWS: RosterRow[] = [
  {
    sheet: 'globals',
    selectors: '.gn-mcp-authorize__consent',
    declarations: { background: 'var(--gn-surface-well)', 'border-radius': 'var(--gn-radius-card)', 'border-left': '3px solid var(--gn-accent)' },
  },
  {
    sheet: 'globals',
    selectors: '.gn-mcp-authorize__refusal',
    declarations: { background: 'var(--gn-surface-well)', 'border-radius': 'var(--gn-radius-card)', 'border-left': '3px solid var(--gn-danger)' },
  },
  { sheet: 'globals', selectors: '.gn-mcp-tokens__row', pattern: 'P-ROW' },
  { sheet: 'globals', selectors: '.gn-mcp-tokens__refusal', pattern: 'P-WELL' },
];

const NEO_MARK = '[data-style="neo"] .gn-sign-in__mark';

describe('20.381 the auth surfaces follow the rules', () => {
  it('20.381 every row; the authorize input keeps its edge', () => {
    // CONTROL — the authorize code field keeps its accessible `border-strong` edge: only the notices and rows moved.
    expectRow({ sheet: 'globals', selectors: '.gn-mcp-authorize__input', declarations: { border: '1px solid var(--gn-border-strong)' } });
    for (const row of ROWS) expectRow(row);
  });
});

describe('20.382 no flat boundary on the auth surfaces', () => {
  it('20.382 none; the neo mark kept', () => {
    const css = cssOf('globals');
    const prefixes = ['.gn-sign-in', '.gn-invite', '.gn-mcp-authorize', '.gn-mcp-tokens'];
    // CONTROL — the scan reads the auth rules, not an empty set, and neo's brand tile is still declared (kept).
    const scanned = parseRules(css).filter((rule) => rule.selectors.some((s) => prefixes.some((p) => s.includes(p))));
    expect(scanned.length).toBeGreaterThan(30);
    expect(scanned.some((rule) => rule.selectors.join(', ') === NEO_MARK)).toBe(true);
    expect(flatBoundaryOffenders(css, prefixes, [NEO_MARK])).toEqual([]);
  });
});
