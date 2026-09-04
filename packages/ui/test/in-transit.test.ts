import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from './helpers/colour-scan.js';

/**
 * A claim on its way to the server is the SAME claim, drawn so the viewer can
 * see it has not landed. Every surface that draws claims owes that mark, and
 * nothing was watching whether the surfaces agreed.
 *
 * Measured before this file existed: deleting `.gn-timeline__bar[data-pending]`
 * outright left ui 34/34 and app-core 26/26 green, and
 * `.gn-timeline__claim[data-pending]` did not exist AT ALL — so a custom date
 * claim still in flight looked exactly like a settled one in the timeline
 * while `CalendarView` drew it as pending. One product, two answers about
 * whether a claim is in transit.
 *
 * The components' own suites assert the ATTRIBUTE (`data-pending` present when
 * in transit, absent when not, in both views). What no component suite can
 * assert is that the attribute reaches a rule: jsdom loads no stylesheet and
 * computes no layout, so an attribute with nothing behind it renders exactly
 * like one that is styled. That gap is this file's whole subject.
 *
 * ENUMERATED BY HAND, which bounds what this can claim: it speaks for the
 * three selectors it names and cannot see a fourth surface added later. What
 * it does is stop any one of these three from losing the treatment alone.
 */
const IN_TRANSIT_SELECTORS = [
  '.gn-calendar__item--pending',
  '.gn-timeline__bar[data-pending]',
  '.gn-timeline__claim[data-pending]',
];

/**
 * The declarations of the rule whose selector list is exactly `selector`.
 * Anchored at a line start and requiring the selector to be followed only by
 * whitespace and `{`, so `.gn-timeline__bar[data-pending]` never matches
 * inside `.gn-timeline__bar[data-clipped-start][data-clipped-end]`.
 */
function declarationsFor(css: string, selector: string): string | null {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rule = new RegExp(`^${escaped}\\s*\\{([^}]*)\\}`, 'm').exec(css);
  return rule?.[1] ?? null;
}

describe('the scanner is proven against planted rules before it is trusted', () => {
  it('finds a rule, ignores a selector that merely starts the same, and reports a missing one', () => {
    const css = [
      '.a[data-x] { outline: 2px dashed var(--gn-pending); }',
      '.a[data-x][data-y] { outline: none; }',
    ].join('\n');
    expect(declarationsFor(css, '.a[data-x]')).toBe(' outline: 2px dashed var(--gn-pending); ');
    expect(declarationsFor(css, '.a[data-x][data-y]')).toBe(' outline: none; ');
    expect(declarationsFor(css, '.a[data-missing]')).toBeNull();
  });
});

describe('in-transit is drawn the same way wherever a claim is drawn', () => {
  const css = readFileSync(join(REPO_ROOT, 'packages/ui/src/ui.css'), 'utf8');

  it('every named surface carries a dashed outline in the pending role', () => {
    // The whole shape at once, so a missing rule reads as `null` beside the
    // two that are present rather than as an absent test.
    const treatments = IN_TRANSIT_SELECTORS.map((selector) => {
      const declarations = declarationsFor(css, selector);
      return {
        selector,
        dashedOutline:
          declarations === null
            ? null
            : /outline:[^;]*\bdashed\b[^;]*var\(--gn-pending\)/.test(declarations),
      };
    });
    expect(treatments).toEqual([
      { selector: '.gn-calendar__item--pending', dashedOutline: true },
      { selector: '.gn-timeline__bar[data-pending]', dashedOutline: true },
      { selector: '.gn-timeline__claim[data-pending]', dashedOutline: true },
    ]);
  });

  it('and never a recolouring — the mark says "not landed", not "means something else"', () => {
    // `background` or `color` inside these rules would say the claim is a
    // different KIND of claim rather than the same one in flight. This is the
    // rule each of the three files' comments states in prose.
    for (const selector of IN_TRANSIT_SELECTORS) {
      const declarations = declarationsFor(css, selector);
      expect(declarations, selector).not.toBeNull();
      expect(declarations ?? '', selector).not.toMatch(/(^|[\s;])(background|color)\s*:/);
    }
  });
});
