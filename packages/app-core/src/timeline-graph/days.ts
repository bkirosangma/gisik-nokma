/** IST day strings (`YYYY-MM-DD`) as whole day numbers. No clock is read here: every call passes its date in (the clock-free scan applies to this directory). */
const DAY_MS = 86_400_000;
/** 1970-01-05 was a Monday: chunks are 28-day blocks counted from it. */
const MONDAY_EPOCH = 4;

export function dayNumber(ymd: string): number {
  const [y, m, d] = ymd.split('-').map(Number) as [number, number, number];
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
}
export const dayString = (n: number): string => new Date(n * DAY_MS).toISOString().slice(0, 10);
export const addDays = (ymd: string, n: number): string => dayString(dayNumber(ymd) + n);
export function mondayOf(ymd: string): string {
  const n = dayNumber(ymd);
  return dayString(n - ((n + 3) % 7)); // 1970-01-01 was a Thursday: (n + 3) % 7 is 0 on Mondays
}
/** The first day of the 28-day chunk holding `ymd` (spec PR: chunks are 28 days aligned to a Monday). */
export function chunkStart(ymd: string): string {
  const n = dayNumber(ymd);
  return dayString(MONDAY_EPOCH + Math.floor((n - MONDAY_EPOCH) / 28) * 28);
}
