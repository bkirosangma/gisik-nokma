import { describe, expect, it } from 'vitest';
import { parseRules, readUiCss, ruleExactly, valueOf } from './helpers/css-rules.js';

/**
 * Mobile plan Task 4 — the board's phone arm, cases 21.040 and 21.050 (§21.4). The arm is the SAME
 * `@media (max-width: 40rem)` the rest of the app's phone layer uses; the desktop lane is read at the top level.
 */
const PHONE = '@media (max-width: 40rem)';
const css = readUiCss();
const phone = (selector: string) => ruleExactly(css, selector, PHONE);

describe('21.040 at ≤40rem the rail snaps one full-width column at a time', () => {
  it('21.040 the rail is a mandatory x scroll-snap container; each column is 100% wide and a snap start', () => {
    const rail = phone('.gn-board__rail');
    expect(valueOf(rail, 'scroll-snap-type')).toBe('x mandatory');
    expect(valueOf(rail, 'overflow-x')).toBe('auto');

    const column = phone('.gn-board__column');
    expect(valueOf(column, 'flex')).toBe('0 0 100%');
    expect(valueOf(column, 'scroll-snap-align')).toBe('start');
  });

  it('21.040 the collapse toggle and the strip are not drawn on a phone', () => {
    expect(valueOf(phone('.gn-board__column-collapse'), 'display')).toBe('none');
    expect(valueOf(phone('.gn-board__column-strip'), 'display')).toBe('none');
  });

  it('21.040 CONTROL — above 40rem the 18rem lane is unchanged, and carries no snap', () => {
    const column = ruleExactly(css, '.gn-board__column');
    expect(valueOf(column, 'flex')).toBe('0 0 18rem');
    expect(valueOf(column, 'min-width')).toBe('18rem');
    expect(valueOf(column, 'scroll-snap-align')).toBeNull();
    expect(valueOf(ruleExactly(css, '.gn-board__rail'), 'scroll-snap-type')).toBeNull();
  });
});

describe('21.050 on a phone the arrows give way to a Move button', () => {
  const ARROWS = '.gn-board-card__move:not(.gn-board-card__move-to)';

  it('21.050 the ‹ › arrows are display: none; Move is shown and is at least 44px', () => {
    expect(valueOf(phone(ARROWS), 'display')).toBe('none');
    const move = phone('.gn-board-card__move-to');
    expect(valueOf(move, 'display')).toBe('inline-flex');
    expect(valueOf(move, 'min-height')).toBe('2.75rem');
    expect(valueOf(move, 'min-width')).toBe('2.75rem');
  });

  it('21.050 CONTROL — outside the phone arm nothing hides the arrows', () => {
    const topLevel = parseRules(css).filter((rule) => rule.atRule === null && rule.selectors.includes(ARROWS));
    expect(topLevel).toEqual([]);
    expect(valueOf(ruleExactly(css, '.gn-board-card__move'), 'display')).toBe('inline-flex');
  });
});

describe('21.060 above 40rem the Move button is a 44px ghost pill with a word', () => {
  it('21.060 the top-level rule restates the 44px floor and carries the label metrics', () => {
    const move = ruleExactly(css, '.gn-board-card__move-to');
    expect(valueOf(move, 'min-height')).toBe('2.75rem');
    expect(valueOf(move, 'min-width')).toBe('2.75rem');
    expect(valueOf(move, 'padding')).toBe('0 1rem');
  });

  it('21.060 CONTROL — it shares the arrows\' ghost class, so it wears their transparent ground', () => {
    expect(valueOf(ruleExactly(css, '.gn-board-card__move'), 'background')).toBe('transparent');
  });
});

describe('21.062 the visible word is swapped by the phone arm', () => {
  it('21.062 "Move" is hidden at the top level and shown at ≤40rem; "Move to…" is the reverse', () => {
    expect(valueOf(ruleExactly(css, '.gn-board-card__move-label--phone'), 'display')).toBe('none');
    expect(valueOf(phone('.gn-board-card__move-label--phone'), 'display')).toBe('inline');
    expect(valueOf(phone('.gn-board-card__move-label--wide'), 'display')).toBe('none');
    // CONTROL — nothing hides the wide word at the top level.
    const topLevel = parseRules(css).filter((rule) => rule.atRule === null && rule.selectors.includes('.gn-board-card__move-label--wide'));
    expect(topLevel).toEqual([]);
  });
});
