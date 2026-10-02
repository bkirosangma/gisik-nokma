import { describe, expect, it } from 'vitest';
import { parseRules, readUiCss, ruleExactly, rulesNaming, valueOf } from '../../../packages/ui/test/helpers/css-rules.js';

/**
 * UX fixes Task 8 (audit PV-05, PV-06, PV-10, PV-11, PV-12): the project views. The stylesheet half —
 * 23.141 (the phone calendar chip is one line), 23.142 (the timeline bar's day margins and the today line) and
 * 23.145 (wrapped timeline titles keep their left edge). jsdom lays nothing out, so each case reads the
 * DECLARATIONS that give the box its shape, and the phone rule's source order against the base it overrides.
 */
const PHONE = '@media (max-width: 40rem)';
const ui = readUiCss();

function indexOf(selectors: string[], atRule: string | null): number {
  return parseRules(ui).findIndex(
    (r) => r.atRule === atRule && r.selectors.length === selectors.length && r.selectors.every((s, i) => s === selectors[i]),
  );
}
function lastBase(selector: string): number {
  let found = -1;
  parseRules(ui).forEach((r, i) => {
    if (r.atRule === null && r.selectors.includes(selector)) found = i;
  });
  return found;
}

describe('23.141 the phone calendar chip is one line (audit PV-06)', () => {
  it('23.141 at <=40rem a chip is nowrap + hidden + ellipsis, after its base rule', () => {
    const chip = ruleExactly(ui, '.gn-calendar__item', PHONE);
    expect(valueOf(chip, 'white-space')).toBe('nowrap');
    expect(valueOf(chip, 'overflow')).toBe('hidden');
    expect(valueOf(chip, 'text-overflow')).toBe('ellipsis');
    // A phone arm above its base paints nothing while passing every value check.
    expect(indexOf(['.gn-calendar__item'], PHONE)).toBeGreaterThan(lastBase('.gn-calendar__item'));

    // CONTROL — the desktop chip is unchanged (it may wrap there: a wide column has the room), and the
    // arm touches only the chip, not the grid's own tracks.
    const base = ruleExactly(ui, '.gn-calendar__item');
    expect(valueOf(base, 'white-space')).toBeNull();
    expect(valueOf(base, 'text-overflow')).toBeNull();
    for (const rule of rulesNaming(ui, '.gn-calendar__items').filter((r) => r.atRule === PHONE)) {
      expect(valueOf(rule.body, 'white-space'), 'the grid tracks are not the chip').toBeNull();
    }
  });
});

describe('23.266 the phone calendar day is a 44px button and the grid has no padding or gap to eat the width (F-4, audit PV-05)', () => {
  it('23.266 at <=40rem the day button is at least 2.75rem tall and full width, and the grid and its day tracks carry no padding or gap', () => {
    const button = ruleExactly(ui, '.gn-calendar__day-select', PHONE);
    expect(valueOf(button, 'min-height')).toBe('2.75rem');
    expect(valueOf(button, 'width')).toBe('100%');
    // 360px viewport: a 312px grid over seven tracks is 44.57px each with no gap or padding, and 43.4px with the
    // base rule's 1px of both. The cell IS the 44px target, so the arm zeroes them.
    const grid = ruleExactly(ui, '.gn-calendar__grid', PHONE);
    expect(valueOf(grid, 'padding')).toBe('0');
    expect(valueOf(grid, 'gap')).toBe('0');
    expect(valueOf(ruleExactly(ui, '.gn-calendar__days', PHONE), 'gap')).toBe('0');
    expect(valueOf(ruleExactly(ui, '.gn-calendar__day', PHONE), 'padding')).toBe('0');
    expect(indexOf(['.gn-calendar__day-select'], PHONE)).toBeGreaterThan(lastBase('.gn-calendar__day'));

    // CONTROL — the desktop grid keeps its 1px hairlines and padding, and no button rule exists outside the arm.
    const base = ruleExactly(ui, '.gn-calendar__grid');
    expect(valueOf(base, 'padding')).toBe('1px');
    expect(valueOf(base, 'gap')).toBe('1px');
    expect(rulesNaming(ui, '.gn-calendar__day-select').filter((r) => r.atRule !== PHONE)).toEqual([]);
  });
});

describe('23.267 the phone calendar draws a dot and a 3px line, and the agenda row is a full-width 44px button (F-4)', () => {
  it('23.267 the dot is 0.375rem round, the line is 0.1875rem tall, the agenda row is a block 2.75rem tall, all inside the phone arm', () => {
    const dot = ruleExactly(ui, '.gn-calendar__dot', PHONE);
    expect(valueOf(dot, 'width')).toBe('0.375rem');
    expect(valueOf(dot, 'height')).toBe('0.375rem');
    expect(valueOf(dot, 'border-radius')).toBe('50%');
    expect(valueOf(dot, 'background')).toBe('var(--gn-accent)');
    const line = ruleExactly(ui, '.gn-calendar__line', PHONE);
    expect(valueOf(line, 'height')).toBe('0.1875rem');
    expect(valueOf(line, 'background')).toBe('var(--gn-accent)');
    const row = ruleExactly(ui, '.gn-calendar__agenda-item', PHONE);
    expect(valueOf(row, 'display')).toBe('block');
    expect(valueOf(row, 'width')).toBe('100%');
    expect(valueOf(row, 'min-height')).toBe('2.75rem');

    // CONTROL — none of the phone-only parts has a rule outside the arm, so a desktop calendar is untouched.
    for (const selector of ['.gn-calendar__dot', '.gn-calendar__line', '.gn-calendar__agenda-item', '.gn-calendar__dots']) {
      expect(rulesNaming(ui, selector).filter((r) => r.atRule !== PHONE), selector).toEqual([]);
    }
  });
});

describe('23.142 timeline bars take their day margins from custom properties; the today line is a token-coloured rule', () => {
  it('23.142 the bar is on row 1 (so a today line over it cannot push it down) and its margins are a share of its own weeks', () => {
    const bar = ruleExactly(ui, '.gn-timeline__bar');
    expect(valueOf(bar, 'grid-row')).toBe('1');
    const left = valueOf(bar, 'margin-left') ?? '';
    const right = valueOf(bar, 'margin-right') ?? '';
    expect(left).toContain('var(--timeline-bar-lead');
    expect(left).toContain('var(--timeline-bar-weeks');
    expect(right).toContain('var(--timeline-bar-tail');
    expect(right).toContain('var(--timeline-bar-weeks');
    // The 0.1875rem breathing margin the bar always had survives next to the day share.
    expect(left).toContain('0.1875rem');

    const today = ruleExactly(ui, '.gn-timeline__today');
    expect(valueOf(today, 'grid-row')).toBe('1');
    expect(valueOf(today, 'pointer-events')).toBe('none');
    expect(valueOf(today, 'border-left')).toBe('2px solid var(--gn-accent)');
    expect(valueOf(today, 'margin-left') ?? '').toContain('var(--timeline-today-lead');
    // Tokens only: no hex or rgb in the line's rule.
    expect(today).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(/);

    // CONTROL — the week tracks themselves did not change: the bar still lands on whole-week grid columns.
    expect(valueOf(ruleExactly(ui, ['.gn-timeline__weeks', '.gn-timeline__row']), 'grid-template-columns')).toBe(
      '14.375rem var(--timeline-week-columns)',
    );
  });
});

describe('23.145 a wrapped timeline title keeps its left edge (audit PV-12)', () => {
  it('23.145 `.gn-timeline__open` is left-aligned; the other side-list rows are unchanged', () => {
    const open = ruleExactly(ui, '.gn-timeline__open');
    expect(valueOf(open, 'text-align')).toBe('left');
    // CONTROL — the reset it joins is still there (border/background/padding), so this is the missing half, not a rewrite.
    expect(valueOf(open, 'border')).toBe('none');
    expect(valueOf(open, 'background')).toBe('transparent');
    expect(valueOf(ruleExactly(ui, '.gn-timeline__side-entry'), 'text-align')).toBeNull();
  });
});
