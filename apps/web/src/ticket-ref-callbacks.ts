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
 *
 * **The empty query is answered LOCALLY, and does not reach `search` at all
 * (bug fix, case 9.313, 2026-09-24).** `:ticket` alone — nothing typed after
 * the trigger — is a legitimate open: `packages/editor/test/ticket-ref.test.ts`
 * case 9.302 calls `queryTickets('')` exactly this way, the same way `:note`'s
 * own empty query is legitimate. But `search`'s server route refuses an empty
 * term (`searchTermSchema.min(1)`, `packages/domain/src/filter-spec.ts:73` —
 * shared with note search and filter text, and not this route's schema to
 * relax), so every `:ticket ` with no query yet used to send a request that
 * ALWAYS 400s, which the picker's `items` wrapper turns into "Search needs a
 * connection" — read by the owner as "`:ticket` does not open" (2026-09-23
 * report), since `:note` shows every note for the same empty state and
 * `:ticket` showed nothing. The fix answers the empty query from
 * `getTickets(projectId, {}, 'flat')` instead — the current project's
 * tickets, the same route `ticket-sheet.tsx`'s subtasks read already uses for
 * "every ticket in this project," and the honest match for a query the caller
 * has not narrowed yet. A rejection from `getTickets` propagates exactly as a
 * `search` rejection does — this branch does not add a second catch.
 */
export type TicketRefCandidate = { ticketId: string; projectId: string; key: string; title: string };

/** The subset of `SearchHit` this file reads — kept structural so it never needs `@gisik-nokma/app-core`'s type exported. */
type TicketSearchHit = { ticketId: string; projectId: string; title: string; key: string | null };

/** The subset of `ListRow` the empty-query browse default reads — kept structural for the same reason `TicketSearchHit` is. */
type TicketListRow = { ticketId: string; title: string; key: string | null };

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
  dataSource: {
    query: {
      search: (workspaceId: string, text: string) => Promise<TicketSearchHit[]>;
      getTickets: (
        projectId: string,
        filter: Record<string, never>,
        grouping: 'flat',
      ) => Promise<{ rows: TicketListRow[] }>;
    };
  },
  workspaceId: string,
  projectId: string,
): (query: string) => Promise<TicketRefCandidate[]> {
  return async (query: string) => {
    if (query.trim() === '') {
      const page = await dataSource.query.getTickets(projectId, {}, 'flat');
      return ticketRefCandidatesOf(
        page.rows.map((row) => ({ ticketId: row.ticketId, projectId, title: row.title, key: row.key })),
      );
    }
    const hits = await dataSource.query.search(workspaceId, query);
    return prioritizeProject(ticketRefCandidatesOf(hits), projectId);
  };
}

/** The subset of `WorkspaceRef` the no-project browse default reads. */
type WorkspaceProjects = { id: string; projects: Array<{ id: string; archived: boolean }> };

/**
 * `queryTickets` for a context with NO project of its own — a note's editor
 * and a note's comment box (Unit 6e, owner ruling 2026-09-29; case 18.310).
 *
 * A typed query is `search` exactly as before. The EMPTY query is the bug
 * this exists for: those two mounts used to hand the raw query to `search`,
 * whose route refuses an empty term (`searchTermSchema.min(1)`, see the
 * docblock at the top of this file), so a bare `:ticket` drew "Search needs a
 * connection". It is answered locally instead, as the workspace's recent
 * tickets: `getTickets` for every live (non-archived) project the caller can
 * see — `getMyWorkspaces` lists only projects the caller may read, so the
 * server's own visibility decides what is offered — merged newest first.
 *
 * "Recent" is creation order: `ListRow` carries no updated-at, and a ticket
 * id is a ULID, so a descending id sort IS newest-created first. Unsliced —
 * the picker's own 8-row cap applies after this returns.
 *
 * One project failing does not blank the picker (a restricted or racing
 * project must not hide the rest); only when EVERY project read fails does the
 * first rejection propagate, which is the offline arm the picker's own catch
 * turns into "Search needs a connection".
 */
export function buildWorkspaceQueryTickets(
  dataSource: {
    query: {
      search: (workspaceId: string, text: string) => Promise<TicketSearchHit[]>;
      getMyWorkspaces: () => Promise<WorkspaceProjects[]>;
      getTickets: (
        projectId: string,
        filter: Record<string, never>,
        grouping: 'flat',
      ) => Promise<{ rows: TicketListRow[] }>;
    };
  },
  workspaceId: string,
): (query: string) => Promise<TicketRefCandidate[]> {
  return async (query: string) => {
    if (query.trim() !== '') {
      return ticketRefCandidatesOf(await dataSource.query.search(workspaceId, query));
    }
    const workspace = (await dataSource.query.getMyWorkspaces()).find((w) => w.id === workspaceId);
    const projectIds = (workspace?.projects ?? []).filter((p) => !p.archived).map((p) => p.id);
    const settled = await Promise.allSettled(
      projectIds.map((projectId) => dataSource.query.getTickets(projectId, {}, 'flat')),
    );
    const failed = settled.find((result): result is PromiseRejectedResult => result.status === 'rejected');
    if (failed !== undefined && failed.reason !== undefined && settled.every((r) => r.status === 'rejected')) {
      throw failed.reason;
    }
    const candidates: TicketRefCandidate[] = [];
    settled.forEach((result, index) => {
      if (result.status !== 'fulfilled') return;
      const projectId = projectIds[index] as string;
      for (const row of result.value.rows) {
        candidates.push({ ticketId: row.ticketId, projectId, key: row.key ?? row.ticketId.slice(-6), title: row.title });
      }
    });
    return candidates.sort((a, b) => (a.ticketId < b.ticketId ? 1 : a.ticketId > b.ticketId ? -1 : 0));
  };
}
