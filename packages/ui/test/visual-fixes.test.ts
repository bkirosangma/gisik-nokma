import { describe, expect, it } from 'vitest';
import { readUiCss, ruleExactly, valueOf } from './helpers/css-rules.js';

/**
 * Visual fixes V1 and V2 (2026-09-30), from browser check A — cases 20.601 and
 * 20.603 (§20.60). Both are layout rules the styling refresh introduced; the
 * markup and behaviour halves are 20.602 (`board.test.tsx`) and 20.604
 * (`ticket-sheet.test.tsx`). jsdom measures no layout, so these read the rules
 * and the browser acceptance is left to a manual case.
 */
const CSS = readUiCss();

describe('20.601 a separator never sits alone at a wrap', () => {
  it('20.601 the `·` and the due label are one nowrap unit spaced by the row gap', () => {
    const unit = ruleExactly(CSS, '.gn-board-card__due-unit');
    expect(valueOf(unit, 'white-space')).toBe('nowrap');
    expect(valueOf(unit, 'display')).toBe('inline-flex');
    expect(valueOf(unit, 'gap')).toBe('0.5rem');
    // CONTROL — the unit's gap is the keys row's own, so the unwrapped row is spaced as before, and the row still wraps.
    const line = ruleExactly(CSS, '.gn-board-card__meta-line');
    expect(valueOf(unit, 'gap')).toBe(valueOf(line, 'gap'));
    expect(valueOf(line, 'flex-wrap')).toBe('wrap');
  });
});

describe('20.603 the title gets the header’s free width; Full screen keeps its size', () => {
  it('20.603 the title wraps inside a growing column; the pill neither shrinks nor wraps', () => {
    const input = ruleExactly(CSS, '.gn-ticket-sheet__title-input');
    expect(valueOf(input, 'width')).toBe('100%');
    expect(valueOf(input, 'min-width')).toBe('0');
    expect(valueOf(input, 'overflow-wrap')).toBe('anywhere');
    expect(valueOf(input, 'resize')).toBe('none');
    expect(valueOf(input, 'overflow')).toBe('hidden');
    const heading = ruleExactly(CSS, '.gn-sheet__heading');
    expect(valueOf(heading, 'flex')).toBe('1');
    expect(valueOf(heading, 'min-width')).toBe('0');
    const full = ruleExactly(CSS, '.gn-sheet__full');
    expect(valueOf(full, 'flex')).toBe('0 0 auto');
    expect(valueOf(full, 'white-space')).toBe('nowrap');
    // CONTROL — still the 44px pill, and the header is still the shared flex row that spaces them.
    expect(valueOf(full, 'min-height')).toBe('2.75rem');
    const header = ruleExactly(CSS, ['.gn-dialog__header', '.gn-sheet__header']);
    expect(valueOf(header, 'display')).toBe('flex');
    expect(valueOf(header, 'justify-content')).toBe('space-between');
  });
});
