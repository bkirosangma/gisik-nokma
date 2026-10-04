import { describe, expect, it } from 'vitest';
import { parseRules, ruleExactly, valueOf } from './helpers/css-rules.js';
import { cssOf, expectRow, flatBoundaryOffenders, type RosterRow } from './helpers/style-patterns.js';

/** Styling refresh Plan B, Task B8 — cases 20.271–20.272 (§20.28). The weeks-band and clipped-edge rows were retired by Workflow and Timeline graphs Part 1 T9 (29.106). */
const ROWS: RosterRow[] = [
  { sheet: 'ui', selectors: '.gn-timeline__nav', pattern: 'P-QUIET' },
  { sheet: 'ui', selectors: '.gn-timeline__side', declarations: { background: 'var(--gn-surface-track)', 'box-shadow': 'var(--gn-shadow-track)' } },
];
/** Every property the two views' navs must agree on (13.1147's pair, restated). */
const NAV_PAIR = ['min-height', 'padding', 'border', 'border-radius', 'background', 'color', 'font', 'cursor'];

describe('20.271 the Timeline follows the rules', () => {
  it('20.271 every row; the two navs agree; the state edges are kept', () => {
    const css = cssOf('ui');
    for (const row of ROWS) expectRow(row);
    // Both sides of the shared nav: the calendar's and the timeline's rule read the same values.
    const timeline = ruleExactly(css, '.gn-timeline__nav', null);
    const calendar = ruleExactly(css, '.gn-calendar__nav', null);
    for (const property of NAV_PAIR) {
      expect(valueOf(timeline, property), `nav pair: ${property}`).not.toBeNull();
      expect(valueOf(timeline, property), `nav pair: ${property}`).toBe(valueOf(calendar, property));
    }
    // Control: the states the surface still bears are declared. The clipped-edge rows are retired with the paging (29.106): a bar is
    // never cut at a window edge on a continuous axis, so the in-transit outline is the only bar state left.
    expectRow({ sheet: 'ui', selectors: '.gn-timeline__bar[data-pending]', declarations: { outline: '2px dashed var(--gn-pending)' } });
    expectRow({
      sheet: 'ui',
      selectors: ['.gn-timeline__side-entry--start-after-due', '.gn-timeline__side-entry--unplaceable-day'],
      declarations: { 'border-left': '1px dashed var(--gn-border-strong)' },
    });
  });
});
describe('20.272 no flat boundary on the Timeline', () => {
  it('20.272 none; the scan reads the timeline', () => {
    const css = cssOf('ui');
    expect(parseRules(css).filter((rule) => rule.selectors.some((s) => s.includes('.gn-timeline'))).length).toBeGreaterThan(25);
    expect(flatBoundaryOffenders(css, ['.gn-timeline'], [])).toEqual([]);
  });
});
