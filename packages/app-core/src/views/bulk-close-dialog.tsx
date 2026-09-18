import { useEffect, useRef, useState } from 'react';
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
 * ## A reopened dialog does not remember its last attempt — and a late answer
 * cannot reach the new one
 *
 * Opening the dialog clears the previous attempt's outcome AND its latch, and
 * bumps the token every write is gated on, so an answer that arrives after a
 * dismissal belongs to nobody (see `attemptRef`, case 13.787). The house
 * precedent for a reopened dialog starting clean is a fresh mount — case
 * `13.532`, where `board.tsx`'s `MoveArrows` renders `TransitionDialog` only
 * while its state is non-null — and this component does NOT rely on it: a
 * remount fixes stale STATE across opens and cannot fix a late prop callback
 * from the old closure.
 *
 * One case remains the consumer's, and it is stated rather than guarded:
 * a parent that swaps `tickets` while the dialog stays OPEN (no `open`
 * transition) is not covered by the reset, and would see the previous
 * attempt's outcome against the new list. Both consumers this task names open
 * and close it, so it cannot arise for them.
 *
 * ## What Tasks 10 and 11 must do — a requirement, not an inference
 *
 * This component never dismisses itself, so **the consumer owns the
 * dismissal**, and the partial outcome is the thing that makes it delicate:
 *
 * - **Task 10** must clear its own `bulkClose` state inside `onClosed` (or
 *   after it) to make the dialog leave on a full success. `moves.onMoved()`
 *   alone reloads the board and leaves the dialog mounted and empty.
 * - **Task 11** must SNAPSHOT the tickets at click time and keep its own open
 *   flag. Its plan text wires `onClosed` → `list.reload()` with the selection
 *   cleared on reload, which would set `open` false and unmount the dialog the
 *   moment a PARTIAL close reports — destroying the `Could not close` rows
 *   spec §8.3 requires it to keep on screen.
 *
 * Both are one-line consequences of the interface rather than surprises, which
 * is why they are written here: the plan words `onClosed` as a reload and does
 * not mention the dismissal, and a reader who takes that literally gets a
 * dialog that never leaves on success and never stays on a partial.
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

  /**
   * WHICH OPENING AN ANSWER BELONGS TO. Every write `confirm` makes after an
   * `await` is gated on this being unchanged, and the opening bumps it.
   *
   * Without it, an answer that arrives after the dialog was dismissed lands on
   * the NEXT opening — the plan's own consumer mounts the dialog once and
   * toggles `open` (Task 10: "renders `BulkCloseDialog` once"), so the instance
   * survives the dismissal and the in-flight closure writes into an opening it
   * knows nothing about: a phantom `Could not close` carrying the previous
   * batch's refusal, and an `onClosed` for tickets nobody just asked to close —
   * which, for a parent that dismisses in `onClosed`, dismisses the new dialog
   * before it is ever used. Case 13.787.
   *
   * **A fresh mount does not cover this**, which is why the fix is a token and
   * not a mount discipline. Unmounting stops `setState` landing on the dead
   * instance, but the stale closure still holds the OLD `onClosed` prop and
   * calls it — and `setSubmitting(false)` from a dead attempt would release a
   * LIVE attempt's latch. The house precedent for a reopened dialog starting
   * clean is a fresh mount (case `13.532`, `board.tsx`'s `MoveArrows` renders
   * the dialog only while its state is non-null); that mechanism fixes STATE
   * across opens and cannot fix a late PROP CALLBACK, so this component carries
   * its own guard rather than depending on how a consumer mounts it.
   */
  const attemptRef = useRef(0);

  // An opening starts from nothing — including a previous attempt's latch, so a
  // reopened dialog is never stuck behind a call that no longer concerns it.
  useEffect(() => {
    if (!open) return;
    attemptRef.current += 1;
    setClosedIds(new Set());
    setFailures([]);
    setTransportError(null);
    setSubmitting(false);
  }, [open]);

  const make = makeSubmittedFactory({ actorId: currentUserId, origin: 'web' });

  const failedIds = new Set(failures.map((failure) => failure.ticketId));
  const pending = tickets.filter(
    (ticket) => !closedIds.has(ticket.ticketId) && !failedIds.has(ticket.ticketId),
  );
  const plural = (n: number): string => (n === 1 ? 'ticket' : 'tickets');

  const confirm = async (): Promise<void> => {
    if (submitting || pending.length === 0) return;
    const attempt = attemptRef.current;
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
      // The opening this call belonged to is over — dismissed, or dismissed and
      // reopened since. Its outcome is nobody's answer now, and every write
      // below (including the `finally`) would land on a dialog that did not
      // make this call. See `attemptRef`, and case 13.787.
      if (attemptRef.current !== attempt) return;
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
      if (attemptRef.current !== attempt) return;
      const message = cause instanceof Error ? cause.message : String(cause);
      setTransportError(`We could not reach the server for this close — ${message}`);
    } finally {
      // Gated, not merely tidy: an ungated reset would release the latch of a
      // LIVE attempt in the next opening.
      if (attemptRef.current === attempt) setSubmitting(false);
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
