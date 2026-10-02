import { useEffect, useState } from 'react';
import { scheduleReload, subscribeReloads, type ReplicaDataSource, type TicketSummary } from '@gisik-nokma/app-core';
import { Skeleton, SkeletonRegion } from '@gisik-nokma/ui';

/** How long engine events are coalesced before the list reads again (spec D11: the web's wave, `scheduleReload`). */
export const REFRESH_DEBOUNCE_MS = 200;

/** The opening arm's name, said once to assistive tech (spec §4.4, §5). */
export const OPENING_LABEL = 'Opening your local copy';

export type TicketListBody = 'loading' | 'error' | 'empty' | 'rows';

/**
 * What the list shows, as a plain decision. `null` is "no read has answered", which is NOT "empty": "No tickets yet" is only for a read
 * that answered `[]` (spec §3.3), and a read that failed (E2-41's shape) shows the failure rather than a skeleton forever.
 */
export function ticketListBody(tickets: readonly TicketSummary[] | null, readError: string | null): TicketListBody {
  if (tickets === null) return readError === null ? 'loading' : 'error';
  return tickets.length === 0 ? 'empty' : 'rows';
}

/**
 * Desktop's list rows carry no CSS of their own (the shell's `ticket-list` classes are bare), so a row's parts sit on one line the way the
 * real row's inline spans do: each part is an inline-block of a typical width holding one `Skeleton` — the width is the PART's, the
 * containers (`ul`, `li`) stay exactly the real element with the real class and no style.
 */
const TITLE_WIDTHS = ['14rem', '10rem', '12rem', '16rem', '9rem', '13rem'] as const;

function SkeletonRow({ index }: { index: number }) {
  return (
    <li className="ticket-list__row">
      <span className="ticket-list__title" style={{ display: 'inline-block', width: TITLE_WIDTHS[index % TITLE_WIDTHS.length] }}>
        <Skeleton shape="line" width="100%" />
      </span>{' '}
      <span className="ticket-list__state" style={{ display: 'inline-block', width: '4rem' }}>
        <Skeleton shape="line" width="100%" />
      </span>
    </li>
  );
}

/** The window while the replica opens: the real list and six real rows, their text replaced by `Skeleton` parts (S-R1). */
export function OpeningSkeleton() {
  return (
    <SkeletonRegion label={OPENING_LABEL}>
      <ul className="ticket-list">
        {Array.from({ length: 6 }, (_, index) => (
          <SkeletonRow key={index} index={index} />
        ))}
      </ul>
    </SkeletonRegion>
  );
}

/** The list for one state of the read: `tickets` is `null` until the first read answers. */
export function TicketListView({ tickets, readError }: { tickets: readonly TicketSummary[] | null; readError: string | null }) {
  const body = ticketListBody(tickets, readError);
  return (
    <>
      {readError !== null ? <p role="alert">Couldn&apos;t read your local copy: {readError}</p> : null}
      {body === 'loading' ? <OpeningSkeleton /> : null}
      {body === 'empty' ? <p>No tickets yet</p> : null}
      {body === 'rows' && tickets !== null ? (
        <ul className="ticket-list">
          {tickets.map((t) => (
            <li className="ticket-list__row" key={t.ticketId}>
              <span className="ticket-list__title">{t.title}</span>
              <span className="ticket-list__state">{t.stateId}</span>
              {t.pending ? <span className="ticket-list__badge ticket-list__badge--pending">claim in transit</span> : null}
              {t.openContests > 0 ? <span className="ticket-list__badge ticket-list__badge--contested">{t.openContests} contested</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );
}

/**
 * Reads now, then again once per burst of engine events: every event restarts ONE 200 ms timer (app-core's per-workspace wave, the web's
 * `scheduleReload`), so ten events inside the window cost one read. Returns the stop function (drops both subscriptions and the timer).
 */
export function watchTicketSummaries(
  ds: Pick<ReplicaDataSource, 'subscribe'>,
  workspaceId: string,
  read: () => void,
  debounceMs: number = REFRESH_DEBOUNCE_MS,
): () => void {
  read();
  const leaveWave = subscribeReloads(workspaceId, read);
  const offEngine = ds.subscribe(workspaceId, 0, () => scheduleReload(workspaceId, debounceMs));
  return () => {
    offEngine();
    leaveWave();
  };
}

export function TicketList(props: { ds: ReplicaDataSource; workspaceId: string }) {
  // `null` until the first read answers (spec §3.3): the view tells "not read yet" from "read, empty".
  const [tickets, setTickets] = useState<TicketSummary[] | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  useEffect(() => {
    // DEVIATION beyond the plan text: ds.query.listTickets does not exist on ReplicaDataSource's query surface — the real method is
    // listTicketSummaries(workspaceId), which already returns {ticketId, title, stateId, pending, openContests} among other fields.
    // A read that rejects is shown (E2-41's shape), not swallowed into an endless skeleton.
    const read = (): void => {
      props.ds.query.listTicketSummaries(props.workspaceId).then(
        (rows) => {
          setReadError(null);
          setTickets(rows);
        },
        (err: unknown) => setReadError(err instanceof Error ? err.message : 'the list could not be read'),
      );
    };
    return watchTicketSummaries(props.ds, props.workspaceId, read);
  }, [props.ds, props.workspaceId]);
  return <TicketListView tickets={tickets} readError={readError} />;
}
