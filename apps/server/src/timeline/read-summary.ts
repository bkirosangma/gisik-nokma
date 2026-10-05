import { HOME_ID_CAP, type HomeSummaryResponse } from '@gisik-nokma/domain';
import type { Queryable } from '../db/queryable.js';
import { collectHome, type Dated, type HomeCollected } from '../routes/home.js';
import { readAsOf } from './as-of.js';
import type { ReadableWorkspace, TimelineScope } from './scope.js';

const byDayThenId = (a: Dated, b: Dated): number => (a.day < b.day ? -1 : a.day > b.day ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
/** ULIDs sort by time, so this is newest first, as `readHome`'s `ORDER BY t.ticket_id DESC`. */
const newestFirst = (a: string, b: string): number => (a < b ? 1 : a > b ? -1 : 0);
const cap = (ids: readonly string[]): string[] => ids.slice(0, HOME_ID_CAP);

/**
 * HM-2 (D-W4-8): Home's six numbers over a scope. Each readable workspace is collected by `collectHome` (the one code path
 * `readHome` uses, so a one-workspace unnarrowed scope equals `/v1/workspaces/:id/home`) and classified by its OWN
 * `dueSoonDays`; the lists are merged, then counted BEFORE the id cap, so a count never depends on the cap. Members are the
 * distinct people across the readable workspaces (never narrowed by Me or projects); `null` only when every workspace
 * withholds its roster. `asOf` is read BEFORE the load (D-W4-23).
 */
export async function readHomeSummary(
  db: Queryable,
  readable: readonly ReadableWorkspace[],
  viewerId: string,
  scope: TimelineScope,
  now: Date,
): Promise<HomeSummaryResponse> {
  const asOf = await readAsOf(db, readable); // BEFORE the load: an event committed during the load is then newer than `asOf`, never silently inside it
  const parts: HomeCollected[] = await Promise.all(
    readable.map(({ workspaceId, eff }) => collectHome(db, eff, viewerId, workspaceId, now, { projectIds: scope.projectIds, mine: scope.mine })),
  );
  const tickets = parts.flatMap((p) => p.tickets).sort(newestFirst);
  const open = parts.flatMap((p) => p.open).sort(newestFirst);
  const pastDue = parts.flatMap((p) => p.pastDue).sort(byDayThenId);
  const dueSoon = parts.flatMap((p) => p.dueSoon).sort(byDayThenId);
  const notes = parts.flatMap((p) => p.notes);
  const rosters = parts.map((p) => p.members).filter((m): m is string[] => m !== null);
  const members = rosters.length === 0 ? null : [...new Set(rosters.flat())].sort(); // one person, once, across workspaces
  return {
    generatedAt: now.toISOString(),
    asOf,
    workspaceIds: parts.map((p) => p.workspaceId),
    dueSoonDays: Object.fromEntries(parts.map((p) => [p.workspaceId, p.dueSoonDays])),
    counts: {
      tickets: tickets.length,
      open: open.length,
      pastDue: pastDue.length,
      dueSoon: dueSoon.length,
      members: members === null ? null : members.length,
      notes: notes.length,
    },
    ids: {
      tickets: cap(tickets),
      open: cap(open),
      pastDue: cap(pastDue.map((d) => d.id)),
      dueSoon: cap(dueSoon.map((d) => d.id)),
      members: cap(members ?? []),
      notes: cap(notes),
    },
  };
}
