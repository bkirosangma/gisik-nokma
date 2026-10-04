/**
 * Calendar arithmetic on integer DAY NUMBERS (days since 1970-01-01, the IST calendar's date read as a plain date).
 * No `Date`, no clock, no locale: 1970-01-01 was a Thursday, so day 4 (1970-01-05) is a Monday.
 */
export const DAYS_PER_WEEK = 7;

/** 0 = Monday ... 6 = Sunday. */
export function weekdayOf(day: number): number {
  return (((day + 3) % 7) + 7) % 7;
}
export const isMonday = (day: number): boolean => weekdayOf(day) === 0;
export const isWeekend = (day: number): boolean => weekdayOf(day) >= 5;
export const mondayOnOrBefore = (day: number): number => day - weekdayOf(day);

/** Every Monday in [first, last], ascending. */
export function mondaysIn(first: number, last: number): number[] {
  const out: number[] = [];
  for (let d = first + ((7 - weekdayOf(first)) % 7); d <= last; d += 7) out.push(d);
  return out;
}

/** The header levels at a scale (VP-11). `weekLabels`: "W 28 Sep" at 16 px/day and up, month labels below. */
export function axisLevels(ppd: number): { weekLabels: boolean; dayNumbers: number; weekendTint: boolean } {
  return { weekLabels: ppd >= 16, dayNumbers: crossFade(ppd, 20), weekendTint: ppd >= 16 };
}

/** 0 below `threshold - 2`, 1 from `threshold + 2`, linear between: a cross-fade, never a pop. */
export function crossFade(ppd: number, threshold: number, half = 2): number {
  return Math.min(1, Math.max(0, (ppd - (threshold - half)) / (2 * half)));
}
