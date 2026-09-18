import { render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { BulkCloseDialog } from '../../src/views/bulk-close-dialog.js';
import { createFakeDataSource, type FakeDataSource } from '../helpers/fake-data-source.js';
import { WS } from '../helpers/seed.js';

/**
 * `BulkCloseDialog` (backlog/closed spec §8.3, 2026-09-17 second wave, Task 9) —
 * ONE dialog, N `ticket.closed` in ONE ingest batch.
 *
 * ## The batch is the point, so it is asserted as a batch
 *
 * Spec §8.3's third bullet is a negative claim about the SHAPE of the write:
 * *"Auto-close and both bulk surfaces emit plain `ticket.closed` events, one per
 * ticket; there is no 'bulk' event type and no server-side bulk endpoint."* The
 * two halves of that pull in opposite directions and only the batch reconciles
 * them — one event PER TICKET (so the ledger reads as N ordinary closes, and the
 * auto-close sweep's own events are indistinguishable from these), delivered in
 * ONE `ingest` call (so the door sees them together and the caller pays one
 * round trip). A component that loops `ingest([one])` N times satisfies the
 * first half and violates the second while looking identical on screen, which is
 * why `13.640` asserts `source.ingested` has length **1** rather than asserting
 * three events exist somewhere.
 *
 * ## Results are read BY INDEX, and a short array is not a partial success
 *
 * The core's Ruling 37 shape (`flows/guarded-child-event.ts`): position i of the
 * answers belongs to position i of the batch, and the caller never matches an
 * answer back to a request by searching its contents. A SHORT array is the one
 * thing that shape cannot tolerate — index i would silently name a different
 * ticket than the one the caller thinks it is describing — so it is treated as
 * silence, not as "some committed": the caller reports nothing closed and shows
 * the transport notice. The same `undefined`-at-a-position case is folded in
 * with it, because Ruling 27/34's rule is about what the caller KNOWS, and a
 * missing answer is a missing answer whether the array is short or holed.
 *
 * ## The transport sentence is this component's own, never the server's
 *
 * `board.tsx`'s `closeCard` and `ticket-sheet.tsx`'s `closeOrReopen` both split
 * a real refusal (carried verbatim, `gn-refusal--server`) from a transport
 * failure (this client's own plain sentence, `gn-refusal--transport`). Both
 * sentences here are that same pair with "this close" substituted, matching the
 * word substitution `ticket-sheet.tsx` already made for "this change" — a person
 * reading "Refused by the server" must be reading the server's words, and
 * neither of these two strings is.
 *
 * ## 13.641's "the dialog stays open" is a real assertion, not a tautology
 *
 * The dialog never closes itself. `onClose` fires from Cancel, Escape and the
 * scrim — the three routes `Dialog` already owns — and from nowhere else; a
 * successful close reports through `onClosed` and leaves the mounting decision
 * to the parent, exactly as `NewTicketDialog` and `TransitionDialog` do for
 * their own successful submissions. So the partial case below can be asserted at
 * all: had confirming called `onClose`, the failure list this task exists to
 * render would be unmounted before anyone could read it.
 */

const SERVER_TIME = '2026-09-18T09:00:00.000Z';

const TICKETS = [
  { ticketId: 'a', title: 'File the GST return' },
  { ticketId: 'b', title: 'Renew the trade licence' },
  { ticketId: 'c', title: 'Pay advance tax' },
];

/** The confirm control, by its own label rule — and never the dialog's title. */
function confirm(): HTMLElement {
  return screen.getByRole('button', { name: /^Close \d+ tickets?$/ });
}

function renderDialog(
  source: FakeDataSource,
  overrides: {
    tickets?: Array<{ ticketId: string; title: string }>;
    onClosed?: (closedIds: string[]) => void;
    onClose?: () => void;
  } = {},
): { onClosed: ReturnType<typeof vi.fn>; onClose: ReturnType<typeof vi.fn> } {
  const onClosed = vi.fn(overrides.onClosed);
  const onClose = vi.fn(overrides.onClose);
  render(
    <BulkCloseDialog
      open
      tickets={overrides.tickets ?? TICKETS}
      dataSource={source}
      workspaceId={WS}
      currentUserId="user_kiro"
      onClose={onClose}
      onClosed={onClosed}
    />,
  );
  return { onClosed, onClose };
}

describe('BulkCloseDialog — one dialog, N ticket.closed in one batch (spec §8.3)', () => {
  /**
   * 13.640 — three tickets, ONE ingest call, three envelopes in the listed
   * order. The order assertion is not decoration: the results are read back by
   * index, so an implementation that built the batch from a different iteration
   * (a `Set`, a reversed list) would still submit three correct events and
   * misreport EVERY one of them the moment a single ticket is refused.
   */
  it('13.640 confirming ingests ONE batch of three ticket.closed in the listed order', async () => {
    const user = userEvent.setup();
    const source = createFakeDataSource();
    const { onClosed } = renderDialog(source);

    expect(screen.getByRole('dialog', { name: 'Close 3 tickets' })).toBeInTheDocument();
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'File the GST return',
      'Renew the trade licence',
      'Pay advance tax',
    ]);

    await user.click(confirm());
    await waitFor(() => expect(onClosed).toHaveBeenCalledWith(['a', 'b', 'c']));

    // ONE call. A per-ticket loop would satisfy every assertion below except
    // this one, and this one is the task.
    expect(source.ingested).toHaveLength(1);
    const batch = source.ingested[0]!;
    expect(batch).toHaveLength(3);
    expect(batch.map((event) => event.type)).toEqual([
      'ticket.closed',
      'ticket.closed',
      'ticket.closed',
    ]);
    expect(batch.map((event) => event.payload)).toEqual([{}, {}, {}]);
    expect(batch.map((event) => event.entity)).toEqual([
      { kind: 'ticket', id: 'a' },
      { kind: 'ticket', id: 'b' },
      { kind: 'ticket', id: 'c' },
    ]);
    expect(batch.every((event) => event.workspaceId === WS)).toBe(true);
    expect(batch.every((event) => event.actorId === 'user_kiro')).toBe(true);
    expect(batch.every((event) => event.origin === 'web')).toBe(true);
    expect(onClosed).toHaveBeenCalledTimes(1);
  });

  it('the singular rule: one ticket reads "Close 1 ticket" in both places', () => {
    renderDialog(createFakeDataSource(), { tickets: [{ ticketId: 'a', title: 'File the GST return' }] });
    expect(screen.getByRole('dialog', { name: 'Close 1 ticket' })).toBeInTheDocument();
    expect(confirm()).toHaveTextContent('Close 1 ticket');
  });

  /**
   * 13.641 — the second of three is refused. The verdict is per ticket, so the
   * committed two are reported closed and the refused one is NOT: a dialog that
   * reported all three because the call returned would be the "the call
   * succeeded, therefore the work happened" defect this series names.
   */
  it('13.641 a refused second ticket is listed under Could not close, the rest are reported closed', async () => {
    const user = userEvent.setup();
    const source = createFakeDataSource({}, (events) =>
      events.map((event, index) =>
        index === 1
          ? {
              status: 'refused' as const,
              eventId: event.id,
              rule: 'close-requires-terminal',
              reason: 'Only a terminal ticket can be closed.',
            }
          : {
              status: 'committed' as const,
              eventId: event.id,
              seq: index + 1,
              serverTime: SERVER_TIME,
            },
      ),
    );
    const { onClosed, onClose } = renderDialog(source);

    await user.click(confirm());
    await waitFor(() => expect(onClosed).toHaveBeenCalledWith(['a', 'c']));
    expect(onClosed).toHaveBeenCalledTimes(1);

    // The dialog is still here — it did not close itself on a partial outcome.
    expect(screen.getByRole('dialog', { name: 'Close 3 tickets' })).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'Could not close' })).toBeInTheDocument();
    expect(
      screen.getByText('Renew the trade licence — Only a terminal ticket can be closed.'),
    ).toBeInTheDocument();
    // Nothing left to try: the control is GONE, not disabled at zero. Both were
    // offered by the plan; this is the one the plan told us to pick.
    expect(screen.queryByRole('button', { name: /^Close \d+ tickets?$/ })).toBeNull();
    // A refusal is an answer, so no transport notice stands beside it.
    expect(screen.queryByRole('alert')).toBeNull();
  });

  /**
   * 13.642 — the ingest REJECTS. Nothing is reported closed, the amber notice
   * carries this client's own sentence and the cause's message, and the latch
   * resets so the person can try again.
   */
  it('13.642 a rejected ingest shows the transport notice, reports nothing closed and re-enables confirm', async () => {
    const user = userEvent.setup();
    const source = createFakeDataSource({}, () => {
      throw new Error('socket closed');
    });
    const { onClosed } = renderDialog(source);

    await user.click(confirm());
    const notice = await screen.findByRole('alert');
    expect(notice).toHaveClass('gn-refusal', 'gn-refusal--transport');
    expect(notice).toHaveTextContent('We could not reach the server for this close — socket closed');

    expect(onClosed).not.toHaveBeenCalled();
    await waitFor(() => expect(confirm()).toBeEnabled());
    // Nothing is lost: all three are still listed and still pending.
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
  });

  /**
   * The silence branch of the same sentence pair (Ruling 27/34, the core's
   * Ruling 37 shape): the server answered with FEWER results than it was sent.
   * Index alignment is the only thing that makes the answers meaningful, so a
   * short array cannot be read as "the first one committed" — it is read as
   * silence, and silence closes nothing.
   */
  it('a short results array is silence: the "did not answer" notice, nothing reported closed', async () => {
    const user = userEvent.setup();
    const source = createFakeDataSource({}, (events) =>
      events.slice(0, 2).map((event, index) => ({
        status: 'committed' as const,
        eventId: event.id,
        seq: index + 1,
        serverTime: SERVER_TIME,
      })),
    );
    const { onClosed } = renderDialog(source);

    await user.click(confirm());
    const notice = await screen.findByRole('alert');
    expect(notice).toHaveClass('gn-refusal', 'gn-refusal--transport');
    expect(notice).toHaveTextContent('The server did not answer this close.');

    expect(onClosed).not.toHaveBeenCalled();
    await waitFor(() => expect(confirm()).toBeEnabled());
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
  });

  it('lifts the refusal verbatim for an invalid envelope, and Cancel closes without submitting', async () => {
    const user = userEvent.setup();
    const source = createFakeDataSource({}, (events) =>
      events.map((event, index) =>
        index === 0
          ? {
              status: 'invalid' as const,
              eventId: event.id,
              code: 'invalid-payload' as const,
              message: 'payload must be an object',
            }
          : {
              status: 'committed' as const,
              eventId: event.id,
              seq: index + 1,
              serverTime: SERVER_TIME,
            },
      ),
    );
    const { onClosed, onClose } = renderDialog(source);

    await user.click(confirm());
    await waitFor(() => expect(onClosed).toHaveBeenCalledWith(['b', 'c']));
    expect(screen.getByText('File the GST return — payload must be an object')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(source.ingested).toHaveLength(1);
  });

  it('Escape closes the dialog through the same route Dialog already owns', async () => {
    const user = userEvent.setup();
    const { onClose } = renderDialog(createFakeDataSource());
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
