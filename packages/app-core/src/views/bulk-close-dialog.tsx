import { useEffect, useState } from 'react';
import { Button, Dialog } from '@gisik-nokma/ui';
import type { DataSource } from '../data-source.js';
import { makeSubmittedFactory } from '../submit.js';

export type BulkCloseTicket = { ticketId: string; title: string };

export type BulkCloseDialogProps = {
  open: boolean;
  /** The tickets this opening is about — every title is listed, in this order. */
  tickets: BulkCloseTicket[];
  dataSource: DataSource;
  workspaceId: string;
  currentUserId: string;
  onClose: () => void;
  /**
   * The ids the server COMMITTED, in the batch's own order. Called once per
   * confirm that closed at least one ticket, and never with an empty array —
   * see this component's docblock, "the parent owns the reload".
   */
  onClosed: (closedIds: string[]) => void;
};

type Failure = { ticketId: string; title: string; reason: string };

/**
 * One dialog, N `ticket.closed` in ONE ingest batch (backlog/closed spec §8.3,
 * 2026-09-17 second wave, Task 9). The two bulk surfaces that consume it —
 * Task 10's `Close all (N)` on a terminal board column, Task 11's
 * `Close selected (N)` in the list — differ only in how they choose the
 * tickets; the write, the reporting and the refusal handling are here, once.
 *
 * ## Why one batch, when the spec also says "one event per ticket"
 *
 * Spec §8.3's third bullet is a negative claim about the SHAPE of the write:
 * *"Auto-close and both bulk surfaces emit plain `ticket.closed` events, one per
 * ticket; there is no 'bulk' event type and no server-side bulk endpoint."* Both
 * halves bind. One event PER TICKET keeps the ledger honest — an auto-closed
 * ticket and a bulk-closed one are the same row, attributable to the same event
 * type, and nothing downstream has to learn a second spelling. ONE `ingest`
 * call is the door's own shape: `DataSource.ingest` takes an array, commits it
 * in order, and answers per position. A loop of N single-element calls would
 * satisfy the first half while turning one atomic door into N independent ones,
 * which is exactly the difference a partial failure exposes.
 *
 * ## Results are read BY INDEX (the core's Ruling 37 shape)
 *
 * The answer at position i describes the envelope at position i, and it is
 * matched by position and never by searching the answer for something that
 * looks like the request. That is why the batch below is built from the SAME
 * `pending` array the results are zipped back against, and why the order is
 * load-bearing rather than cosmetic.
 *
 * A results array that is SHORT — or holed — cannot be read that way at all:
 * index i would silently name a different ticket than the caller thinks. So it
 * is silence, not partial success (Ruling 27/34's rule about what the caller
 * KNOWS, applied one level down): nothing is reported closed, and the caller's
 * own sentence says so. The same reasoning covers a rejected promise.
 *
 * ## The two sentences are the CLIENT's, and the refusal's is not
 *
 * `board.tsx`'s `closeCard` and `ticket-sheet.tsx`'s `closeOrReopen` both split
 * a real refusal (carried VERBATIM, `gn-refusal--server`) from a transport
 * failure (this client's own plain sentence, `gn-refusal--transport`). The
 * strings below are that same pair with "this close" substituted, the word
 * substitution `ticket-sheet.tsx` already made for "this change". A person
 * reading "Refused by the server" must be reading the server's words; neither
 * of these strings is one.
 *
 * ## The dialog never closes itself; the parent owns the reload
 *
 * `onClose` fires from Cancel, Escape and the scrim — the three routes `Dialog`
 * already owns — and from nowhere else, matching `NewTicketDialog` and
 * `TransitionDialog`, whose successful submissions also report upward and leave
 * the mounting decision to the caller. This is what makes a PARTIAL outcome
 * readable at all: a dialog that closed on confirmation would unmount the
 * `Could not close` list before anyone could read it, and spec §8.3 explicitly
 * keeps refused tickets listed.
 *
 * `onClosed` is called only when at least one ticket committed. The alternative
 * — calling it with `[]` so the parent learns "the attempt finished" — would
 * make every all-refused click fire the parent's reload for nothing, and the
 * parent has no other use for the empty case: the failure list is already on
 * screen. Stated as a reading rather than left implicit, because the plan names
 * the call and not its empty case.
 *
 * ## A reopened dialog does not remember its last attempt
 *
 * Ruling 13.532's own rule ("a closed-and-reopened dialog does not remember its
 * last pick"), applied to this one: opening the dialog clears the previous
 * attempt's outcome. A parent that swaps `tickets` while the dialog stays OPEN
 * is not covered by that reset and would show a stale outcome; the two
 * consumers this task names both close and reopen it (Task 10 keys it off
 * `bulkClose === null`, Task 11 off the selection), so the case is stated here
 * rather than guarded for.
 */
export function BulkCloseDialog({
  open,
  tickets,
  dataSource,
  workspaceId,
  currentUserId,
  onClose,
  onClosed,
}: BulkCloseDialogProps) {
  const [closedIds, setClosedIds] = useState<ReadonlySet<string>>(() => new Set());
  const [failures, setFailures] = useState<Failure[]>([]);
  const [transportError, setTransportError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // 13.532, one dialog over: an opening starts from nothing.
  useEffect(() => {
    if (!open) return;
    setClosedIds(new Set());
    setFailures([]);
    setTransportError(null);
  }, [open]);

  const make = makeSubmittedFactory({ actorId: currentUserId, origin: 'web' });

  const failedIds = new Set(failures.map((failure) => failure.ticketId));
  const pending = tickets.filter(
    (ticket) => !closedIds.has(ticket.ticketId) && !failedIds.has(ticket.ticketId),
  );
  const plural = (n: number): string => (n === 1 ? 'ticket' : 'tickets');

  const confirm = async (): Promise<void> => {
    if (submitting || pending.length === 0) return;
    setSubmitting(true);
    try {
      const batch = pending.map((ticket) =>
        make({
          workspaceId,
          entity: { kind: 'ticket', id: ticket.ticketId },
          type: 'ticket.closed',
          payload: {},
        }),
      );
      const results = await dataSource.ingest(batch);
      if (results.length !== batch.length || results.some((result) => result === undefined)) {
        // Silence, not a partial success — see the docblock.
        setTransportError('The server did not answer this close.');
        return;
      }

      const committed: string[] = [];
      const refused: Failure[] = [];
      results.forEach((result, index) => {
        const ticket = pending[index]!;
        if (result.status === 'committed') {
          committed.push(ticket.ticketId);
          return;
        }
        refused.push({
          ticketId: ticket.ticketId,
          title: ticket.title,
          reason: result.status === 'refused' ? result.reason : result.message,
        });
      });

      setTransportError(null);
      if (committed.length > 0) {
        setClosedIds((previous) => new Set([...previous, ...committed]));
      }
      if (refused.length > 0) {
        setFailures((previous) => [...previous, ...refused]);
      }
      if (committed.length > 0) onClosed(committed);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      setTransportError(`We could not reach the server for this close — ${message}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} title={`Close ${tickets.length} ${plural(tickets.length)}`} onClose={onClose}>
      {pending.length > 0 ? (
        <ul>
          {pending.map((ticket) => (
            <li key={ticket.ticketId}>{ticket.title}</li>
          ))}
        </ul>
      ) : null}
      {failures.length > 0 ? (
        <>
          <h3>Could not close</h3>
          <ul>
            {failures.map((failure) => (
              <li key={failure.ticketId}>
                {failure.title} — {failure.reason}
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {transportError !== null ? (
        <p role="alert" className="gn-refusal gn-refusal--transport">
          {transportError}
        </p>
      ) : null}
      <div>
        <Button onClick={onClose}>Cancel</Button>
        {pending.length > 0 ? (
          <Button
            variant="primary"
            disabled={submitting}
            onClick={() => {
              void confirm();
            }}
          >
            Close {pending.length} {plural(pending.length)}
          </Button>
        ) : null}
      </div>
    </Dialog>
  );
}
