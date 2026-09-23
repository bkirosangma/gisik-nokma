import { ticketSheetPath } from './ticket-location.js';

/**
 * The project page's own half of the `:ticket` picker (Plan 7 Task 4, spec
 * §14, D26–D28) — split into small pure functions rather than built inline
 * inside `page.tsx`, which has no exported surface of its own and whose OWN
 * construction is proven by `pnpm typecheck`, not by a mounted test (see
 * `apps/web/test/description-editable.test.tsx`'s docblock). This is what
 * makes the construction itself testable.
 *
 * `queryTickets`'s offline arm — the replica's search gap — is deliberately
 * NOT handled here. `buildProjectPageQueryTickets` lets a rejection
 * propagate; the catch that turns it into the picker's "Search needs a
 * connection" status lives in `packages/editor/src/extensions/ticket-ref.ts`'s
 * `items` wrapper (Ruling 1, 2026-09-23 — no channel exists to carry that fact
 * through `TicketRefCandidate` itself).
 */
export type TicketRefCandidate = { ticketId: string; projectId: string; key: string; title: string };

/** The subset of `SearchHit` this file reads — kept structural so it never needs `@gisik-nokma/app-core`'s type exported. */
type TicketSearchHit = { ticketId: string; projectId: string; title: string; key: string | null };

/**
 * `SearchHit`s, as the `:ticket` picker's candidates. `key` falls back to the
 * ticket id's last six characters when the server carries none — spec §14.2
 * names the server route as already serving `key`, so this is a pre-migration
 * row's fallback, not the common case.
 */
export function ticketRefCandidatesOf(hits: TicketSearchHit[]): TicketRefCandidate[] {
  return hits.map((hit) => ({
    ticketId: hit.ticketId,
    projectId: hit.projectId,
    key: hit.key ?? hit.ticketId.slice(-6),
    title: hit.title,
  }));
}

/**
 * `resolveTicketHref` for a workspace the caller already knows — the same
 * canonical sheet path the board opens a ticket with (spec §14.2).
 */
export function ticketRefHrefIn(
  workspaceId: string,
): (ref: { ticketId: string; projectId: string }) => string {
  return (ref) => ticketSheetPath({ workspaceId, projectId: ref.projectId }, ref.ticketId);
}

/**
 * Ruling 2 (plan author, via the controller, 2026-09-23): spec §14.1's table
 * and D28 both put the current project's hits first, and the plan text
 * dropped it. A STABLE partition — two passes preserving each item's
 * original relative order, never a comparator-based sort, which risks
 * regrouping by a THIRD project id rather than a simple here/elsewhere split.
 */
export function prioritizeProject<T extends { projectId: string }>(items: T[], projectId: string): T[] {
  const here: T[] = [];
  const elsewhere: T[] = [];
  for (const item of items) {
    (item.projectId === projectId ? here : elsewhere).push(item);
  }
  return [...here, ...elsewhere];
}

/**
 * The project page's `queryTickets`, composed: search, map to candidates,
 * then Ruling 2's partition — UNSLICED. The 8-row limit is
 * `packages/editor/src/extensions/ticket-ref.ts`'s `items` wrapper's own,
 * applied AFTER this returns, which is what makes "slice before the
 * partition" a real mutation to guard against: truncating here first would
 * let a low-ranked "elsewhere" hit crowd out a current-project hit the
 * partition was meant to promote.
 */
export function buildProjectPageQueryTickets(
  dataSource: { query: { search: (workspaceId: string, text: string) => Promise<TicketSearchHit[]> } },
  workspaceId: string,
  projectId: string,
): (query: string) => Promise<TicketRefCandidate[]> {
  return async (query: string) => {
    const hits = await dataSource.query.search(workspaceId, query);
    return prioritizeProject(ticketRefCandidatesOf(hits), projectId);
  };
}
