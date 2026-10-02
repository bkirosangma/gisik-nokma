import { describe, expect, it } from 'vitest';
import { readUiCss, ruleExactly, valueOf } from './helpers/css-rules.js';

/**
 * UX fixes Task 7 — the stylesheet halves of cases 23.120 (BRD-01), 23.122 (BRD-02) and 23.124 (BRD-09). The
 * behaviour halves are in `packages/app-core/test/views/board-ux-t7.test.tsx`, `dialog-footer.test.tsx` and
 * `new-ticket-dialog-footer.test.tsx`.
 */
const css = readUiCss();

describe('23.120 a hidden column takes no room, so the phone rail is as tall as the shown one', () => {
  it('23.120 `.gn-board__column[hidden]` is display: none — the column\'s own `display: flex` would otherwise outrank the UA `hidden`', () => {
    expect(valueOf(ruleExactly(css, '.gn-board__column[hidden]'), 'display')).toBe('none');
    // The column IS display: flex, which is the reason the rule above has to exist.
    expect(valueOf(ruleExactly(css, '.gn-board__column'), 'display')).toBe('flex');
  });

  it('23.120 CONTROL — the rail keeps top alignment, so a shown column is never stretched to a hidden one\'s height', () => {
    expect(valueOf(ruleExactly(css, '.gn-board__rail'), 'align-items')).toBe('flex-start');
    expect(valueOf(ruleExactly(css, '.gn-board__rail[hidden]'), 'display')).toBe('none');
  });
});

describe('23.122 (BRD-02) the card footer is one row at every width', () => {
  it('23.122 the footer never wraps; the provenance line truncates with an ellipsis and may shrink below its text', () => {
    const footer = ruleExactly(css, '.gn-board-card__footer');
    expect(valueOf(footer, 'flex-wrap')).toBe('nowrap');
    const line = ruleExactly(css, '.gn-board-card__provenance');
    expect(valueOf(line, 'white-space')).toBe('nowrap');
    expect(valueOf(line, 'overflow')).toBe('hidden');
    expect(valueOf(line, 'text-overflow')).toBe('ellipsis');
    expect(valueOf(line, 'min-width')).toBe('0');
  });

  it('23.122 an expanded line wraps in place (the footer stays a row)', () => {
    const open = ruleExactly(css, '.gn-board-card__provenance[aria-expanded="true"]');
    expect(valueOf(open, 'white-space')).toBe('normal');
    expect(valueOf(open, 'text-overflow')).toBe('clip');
  });

  it('23.122 CONTROL — the controls keep their 44px floor', () => {
    expect(valueOf(ruleExactly(css, '.gn-board-card__provenance'), 'min-height')).toBe('2.75rem');
    const move = ruleExactly(css, '.gn-board-card__move');
    expect(valueOf(move, 'min-height')).toBe('2.75rem');
    expect(valueOf(move, 'min-width')).toBe('2.75rem');
  });
});

describe('23.124 (BRD-09) the dialog footer is a row that never scrolls away', () => {
  it('23.124 `.gn-dialog__footer` does not shrink, sits at the bottom of the panel, and right-aligns its actions', () => {
    const footer = ruleExactly(css, '.gn-dialog__footer');
    expect(valueOf(footer, 'flex')).toBe('0 0 auto');
    expect(valueOf(footer, 'position')).toBe('sticky');
    expect(valueOf(footer, 'bottom')).toBe('0');
    expect(valueOf(footer, 'justify-content')).toBe('flex-end');
  });

  it('23.124 CONTROL — the panel is a column capped at the viewport and the BODY alone scrolls', () => {
    const panel = ruleExactly(css, ['.gn-dialog', '.gn-sheet']);
    expect(valueOf(panel, 'flex-direction')).toBe('column');
    expect(valueOf(panel, 'max-height')).toBe('90vh');
    expect(valueOf(ruleExactly(css, ['.gn-dialog__body', '.gn-sheet__body']), 'overflow-y')).toBe('auto');
  });
});
