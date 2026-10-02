import { describe, expect, it } from 'vitest';
import { parseRules, readUiCss, ruleExactly, valueOf } from './helpers/css-rules.js';

/**
 * Neo follow-up F-1 (2026-10-02), cases 23.320–23.323 — the board card's footer above 1024px (audit BRD-02, BRD-03,
 * reopened by U-T12). The DOM half (the controls group, the notice outside it) is
 * `packages/app-core/test/views/board-card-controls-group.test.tsx`; the painted half is 23.322's frame.
 */
const css = readUiCss();
const DESKTOP = '@media (min-width: 64.0625rem)';
const desktop = (selector: string) => ruleExactly(css, selector, DESKTOP);

describe('23.320 (BRD-02) above 1024px the footer is two rows: the line, then the controls', () => {
  it('23.320 the footer wraps and the line takes the full row', () => {
    expect(valueOf(desktop('.gn-board-card__footer'), 'flex-wrap')).toBe('wrap');
    expect(valueOf(desktop('.gn-board-card__provenance'), 'flex')).toBe('1 1 100%');
    // CONTROL — up to 1024px (the base rules) the footer is still one row and the line still shares it.
    expect(valueOf(ruleExactly(css, '.gn-board-card__footer'), 'flex-wrap')).toBe('nowrap');
    expect(valueOf(ruleExactly(css, '.gn-board-card__provenance'), 'flex')).toBe('1 1 auto');
  });

  it('23.320 the controls are ONE right-aligned row that never wraps and never shrinks', () => {
    const controls = desktop('.gn-board-card__controls');
    expect(valueOf(controls, 'display')).toBe('flex');
    expect(valueOf(controls, 'flex-wrap')).toBe('nowrap');
    expect(valueOf(controls, 'flex')).toBe('none');
    expect(valueOf(controls, 'margin-left')).toBe('auto');
    // CONTROL — below the arm the group is `display: contents`: the controls are the moves row's own items, as before.
    expect(valueOf(ruleExactly(css, '.gn-board-card__controls'), 'display')).toBe('contents');
    // CONTROL — the moves row keeps its wrap, so a refusal (`flex-basis: 100%`) still takes a line of its own.
    expect(valueOf(ruleExactly(css, '.gn-board-card__moves'), 'flex-wrap')).toBe('wrap');
    expect(valueOf(ruleExactly(css, '.gn-board-card__notice > .gn-refusal'), 'flex-basis')).toBe('100%');
    expect(valueOf(desktop('.gn-board-card__moves'), 'flex')).toBe('1 1 100%');
  });
});

describe('23.321 (BRD-03) above 1024px the provenance line is readable, not truncated', () => {
  it('23.321 no ellipsis, no nowrap, no clipping: the line wraps to a second line instead', () => {
    const line = desktop('.gn-board-card__provenance');
    expect(valueOf(line, 'white-space')).toBe('normal');
    expect(valueOf(line, 'text-overflow')).toBe('clip');
    expect(valueOf(line, 'overflow')).toBe('visible');
    expect(valueOf(line, 'line-height')).toBe('1.25rem');
    // The 44px floor holds: a 20px line with 12px above and below.
    expect(valueOf(line, 'padding-block')).toBe('0.75rem');
    expect(valueOf(ruleExactly(css, '.gn-board-card__provenance'), 'min-height')).toBe('2.75rem');
    // CONTROL — below the arm the line still truncates (23.122), so it is the arm that changed it.
    const base = ruleExactly(css, '.gn-board-card__provenance');
    expect(valueOf(base, 'text-overflow')).toBe('ellipsis');
    expect(valueOf(base, 'white-space')).toBe('nowrap');
  });

  it('23.321 the disabled arrows stay rendered at the one disabled token', () => {
    expect(valueOf(ruleExactly(css, '.gn-board-card__move:disabled'), 'opacity')).toBe('var(--gn-disabled-opacity)');
    // CONTROL — the controls group never hides a control: no `display: none` on a move arm outside the phone's one rule.
    expect(valueOf(desktop('.gn-board-card__controls'), 'display')).not.toBe('none');
  });
});

describe('23.323 phone and tablet are unchanged', () => {
  it('23.323 no arm below 1025px touches the footer, the line or the controls group except the phone Move swap', () => {
    // The desktop arm is the ONLY at-rule that declares the group's flex; the phone arm only swaps the arrows for Move.
    expect(valueOf(ruleExactly(css, '.gn-board-card__move:not(.gn-board-card__move-to)', '@media (max-width: 40rem)'), 'display')).toBe('none');
    for (const selector of ['.gn-board-card__footer', '.gn-board-card__provenance', '.gn-board-card__controls', '.gn-board-card__moves']) {
      const arms = parseRules(css).filter((rule) => rule.selectors.includes(selector) && rule.atRule !== null);
      expect(arms.map((rule) => rule.atRule), selector).toEqual([DESKTOP]);
    }
    // CONTROL — the same scan finds the desktop arm when it is looked for, so the scan can see at-rules.
    expect(parseRules(css).filter((rule) => rule.selectors.includes('.gn-board-card__controls') && rule.atRule === DESKTOP)).toHaveLength(1);
  });
});
