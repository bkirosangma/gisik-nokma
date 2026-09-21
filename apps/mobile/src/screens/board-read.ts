import type { ReplicaDataSource, TicketSummary } from '@gisik-nokma/app-core';

/**
 * E2-41: `board-screen.tsx`'s refresh used to call these reads with no
 * rejection arm (`void ds.query.listTicketSummaries(...).then(setTickets)`),
 * so a replica failure left the board silently empty. Split out so the
 * failure path is a plain return value a test can assert on, instead of an
 * unhandled rejection the screen never sees.
 */
export type BoardReadResult =
  | { ok: true; tickets: TicketSummary[]; offlineCopy: boolean }
  | { ok: false; error: string };

export async function loadBoard(
  ds: ReplicaDataSource,
  workspaceId: string,
  query: string,
): Promise<BoardReadResult> {
  try {
    if (query === '') {
      const tickets = await ds.query.listTicketSummaries(workspaceId);
      return { ok: true, tickets, offlineCopy: false };
    }
    const [result, all] = await Promise.all([
      ds.query.searchOfflineCopy(workspaceId, query),
      ds.query.listTicketSummaries(workspaceId),
    ]);
    const byId = new Map(all.map((t) => [t.ticketId, t]));
    const tickets = result.hits
      .map((hit) => byId.get(hit.ticketId))
      .filter((t): t is TicketSummary => t !== undefined);
    return { ok: true, tickets, offlineCopy: result.offlineCopy };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'could not load the board' };
  }
}
