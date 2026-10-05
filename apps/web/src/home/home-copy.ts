import type { HomeNumberKey } from '@gisik-nokma/domain';

/** The Due tile's label for a window of `n` days (spec E §2.2): "Due today" when the window is today only. */
export function dueSoonLabel(n: number): string {
  return n === 0 ? 'Due today' : n === 1 ? 'Due in 1 day' : `Due in ${n} days`;
}
const plural = (n: number, one: string, many: string): string => (n === 1 ? one : many);

/** The six numbers, in the spec's order (E §2.2), with the noun the highlight note uses (T4). */
export const HOME_NUMBERS: ReadonlyArray<{
  key: HomeNumberKey;
  /** `undefined`: no `dueSoonDays` has ever arrived (a failed first load; planner ruling 2026-10-04 Q2). */
  label: (dueSoonDays: number | undefined) => string;
  noun: (n: number, dueSoonDays: number) => string;
}> = [
  { key: 'tickets', label: () => 'Tickets', noun: (n) => plural(n, 'ticket', 'tickets') },
  { key: 'open', label: () => 'Open', noun: (n) => plural(n, 'open ticket', 'open tickets') },
  { key: 'pastDue', label: () => 'Past due', noun: () => 'past due' },
  { key: 'dueSoon', label: (d) => (d === undefined ? 'Due soon' : dueSoonLabel(d)), noun: (_n, d) => dueSoonLabel(d).toLowerCase() },
  { key: 'members', label: () => 'Members', noun: (n) => plural(n, 'member', 'members') },
  { key: 'notes', label: () => 'Notes', noun: (n) => plural(n, 'note', 'notes') },
];
