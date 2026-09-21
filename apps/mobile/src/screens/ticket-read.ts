import type { ReplicaDataSource } from '@gisik-nokma/app-core';

type TicketWithPending = Awaited<ReturnType<ReplicaDataSource['query']['getTicketWithPending']>>;

/**
 * E2-41(b): `ticket-screen.tsx`'s refresh used to call `getTicketWithPending`
 * with no rejection arm, so a replica failure left the screen on "Opening…"
 * forever — the same word it uses while genuinely still loading. Split out so
 * "no answer yet" (`ticket === null`, still `null`) and "the answer failed"
 * (a distinct error string) are two different states the screen can render.
 */
export type TicketReadResult = { ok: true; ticket: TicketWithPending } | { ok: false; error: string };

export async function loadTicket(ds: ReplicaDataSource, ticketId: string): Promise<TicketReadResult> {
  try {
    const ticket = await ds.query.getTicketWithPending(ticketId);
    return { ok: true, ticket };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'could not open this ticket' };
  }
}
