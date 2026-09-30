import { describe, expect, it } from 'vitest';
import { parseRules } from './helpers/css-rules.js';
import { cssOf, expectRow, flatBoundaryOffenders, type RosterRow } from './helpers/style-patterns.js';

/** Styling refresh Plan B, Task B7 — cases 20.261–20.262 (§20.27). */
const ROWS: RosterRow[] = [
  { sheet: 'ui', selectors: '.gn-calendar__nav', pattern: 'P-QUIET' },
  { sheet: 'ui', selectors: '.gn-calendar__today', pattern: 'P-QUIET' },
  { sheet: 'ui', selectors: '.gn-calendar__legend', pattern: 'P-RAISED' },
  {
    sheet: 'ui',
    selectors: '.gn-calendar__grid',
    declarations: {
      background: 'var(--gn-surface-track)',
      'box-shadow': 'var(--gn-shadow-track)',
      'border-radius': 'var(--gn-radius-track)',
    },
  },
  { sheet: 'ui', selectors: '.gn-calendar__weekday-head', declarations: { background: 'transparent' } },
];

function stillDeclared(list: string): boolean {
  return parseRules(cssOf('ui')).some((rule) => rule.selectors.join(', ') === list);
}

describe('20.261 the Calendar follows the rules', () => {
  it('20.261 every row; the track still shows through as the day lines', () => {
    for (const row of ROWS) expectRow(row);
    // Control: the 1px gaps are what draw the lines, over raised day cells.
    expectRow({ sheet: 'ui', selectors: '.gn-calendar__grid', declarations: { gap: '1px', padding: '1px' } });
    expectRow({ sheet: 'ui', selectors: '.gn-calendar__days', declarations: { gap: '1px' } });
    expectRow({ sheet: 'ui', selectors: '.gn-calendar__day', declarations: { background: 'var(--gn-surface-raised)' } });
  });
});
describe('20.262 no flat boundary on the Calendar', () => {
  it('20.262 none; the scan reads the calendar; the unplaceable state edge kept', () => {
    const css = cssOf('ui');
    expect(parseRules(css).filter((rule) => rule.selectors.some((s) => s.includes('.gn-calendar'))).length).toBeGreaterThan(25);
    expect(flatBoundaryOffenders(css, ['.gn-calendar'], [])).toEqual([]);
    expect(stillDeclared('.gn-calendar__item--unplaceable')).toBe(true);
    expectRow({ sheet: 'ui', selectors: '.gn-calendar__item--unplaceable', declarations: { border: '1px dashed var(--gn-border-strong)' } });
  });
});
