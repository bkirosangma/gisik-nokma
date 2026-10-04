// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { axisLevels, crossFade, isMonday, isWeekend, mondayOnOrBefore, mondaysIn, weekdayOf } from '../src/index.js';

describe('29.014 calendar days and the axis levels', () => {
  it('29.014 day 4 is a Monday, day 2 a Saturday, day 3 a Sunday; Mondays are 7 apart; control: day 0 (Thursday) is no Monday', () => {
    expect(weekdayOf(4)).toBe(0);
    expect(isMonday(4)).toBe(true);
    expect(isWeekend(2)).toBe(true);
    expect(isWeekend(3)).toBe(true);
    expect(isWeekend(4)).toBe(false);
    expect(isMonday(0)).toBe(false);
    expect(weekdayOf(-3)).toBe(0); // 1969-12-29, a Monday (-3 + 3 = 0: the negative-remainder normalisation is not reached)
    expect(weekdayOf(-4)).toBe(6); // 1969-12-28, a Sunday (-4 + 3 = -1: only the normalisation makes it 6)
    expect(isWeekend(-4)).toBe(true);
    expect(mondayOnOrBefore(-1)).toBe(-3); // 1969-12-31, a Wednesday -> 1969-12-29
    expect(mondayOnOrBefore(10)).toBe(4);
    expect(mondaysIn(5, 30)).toEqual([11, 18, 25]);
    expect(mondaysIn(4, 4)).toEqual([4]);
  });

  it('29.014 week labels from 16 px/day, day numbers cross-fade around 20 and are absent at Month zoom, the tint starts at 16; control: 8 px/day has none of them', () => {
    expect(axisLevels(8)).toEqual({ weekLabels: false, dayNumbers: 0, weekendTint: false });
    expect(axisLevels(16)).toMatchObject({ weekLabels: true, weekendTint: true, dayNumbers: 0 });
    expect(axisLevels(20).dayNumbers).toBe(0.5);
    expect(axisLevels(24).dayNumbers).toBe(1);
    expect(crossFade(18, 20)).toBe(0);
    expect(crossFade(22, 20)).toBe(1);
  });
});
