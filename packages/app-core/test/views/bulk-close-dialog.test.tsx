import { act, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { IngestResult } from '@gisik-nokma/domain';
import { BulkCloseDialog } from '../../src/views/bulk-close-dialog.js';
import { createFakeDataSource, type FakeDataSource } from '../helpers/fake-data-source.js';
import { SESSION_EXPIRED_COPY, SessionExpiredError } from '../../src/session-expired.js';
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
   * E5-25 — the same rejection, one cause over: the session ENDED.
   *
   * `bulk-close-dialog.tsx:233` is one of the nine sites the ruling counts, and
   * it is the worst of them to get wrong: a batch of closes the person believes
   * landed, on a session that is gone.
   */
  it('13.1157 E5-25 a bulk close whose session ended says so, and reports nothing closed', async () => {
    const user = userEvent.setup();
    const source = createFakeDataSource({}, () => {
      throw new SessionExpiredError('/v1/events');
    });
    const { onClosed } = renderDialog(source);

    await user.click(confirm());
    const notice = await screen.findByRole('alert');
    expect(notice).toHaveTextContent(SESSION_EXPIRED_COPY);
    expect(notice).toHaveClass('gn-refusal', 'gn-refusal--session');
    expect(notice).not.toHaveClass('gn-refusal--transport');

    expect(onClosed).not.toHaveBeenCalled();
    await waitFor(() => expect(confirm()).toBeEnabled());
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

  /**
   * The same guard's other half, and it exists because a mutant SURVIVED here.
   * An independent review deleted the `undefined`-at-a-position clause and the
   * whole suite stayed green — an unwitnessed decision inside a sentence this
   * file already claimed to prove ("short — or holed"). Neither shipped
   * `DataSource` can produce this shape (`mapIngestResults` throws on a length
   * mismatch before returning, and the replica answers one result per event or
   * throws), so this arm is INTERFACE-defence rather than a live path — which
   * is exactly why it needs a witness: unreachable code with no test is a
   * clause nothing can falsify, and the next reader cannot tell it from dead
   * weight.
   */
  it('a holed results array of the RIGHT length is silence as well', async () => {
    const user = userEvent.setup();
    const source = createFakeDataSource({}, (events) =>
      events.map((event, index) =>
        index === 1
          ? undefined
          : {
              status: 'committed' as const,
              eventId: event.id,
              seq: index + 1,
              serverTime: SERVER_TIME,
            },
      ) as IngestResult[],
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

  /**
   * 13.787 — an answer that arrives after the dialog was dismissed must not
   * land on the NEXT opening. Found by an independent review, reproduced there
   * as a failing probe, and it is the one defect in this component that no
   * test could see: every existing case resolves its promise while the dialog
   * is still open.
   *
   * The window is the whole round trip, because Cancel, Escape, the scrim and
   * `×` all stay live while `submitting` is true — deliberately, since a
   * person must always be able to walk away from a slow call. The plan's own
   * consumer mounts the dialog once and toggles `open` (Task 10: "renders
   * `BulkCloseDialog` once"), so the instance survives the dismissal and the
   * in-flight closure writes into the next opening: a phantom
   * `Could not close` carrying the PREVIOUS batch's refusal, and an `onClosed`
   * for tickets nobody just asked to close (which, for a parent that dismisses
   * in `onClosed`, dismisses the new dialog before it is ever used).
   *
   * A fresh mount — the house mechanism `13.532` pins for a remembered pick —
   * does NOT cover this, and that is why the fix is a token rather than a
   * mount discipline: unmounting stops `setState` landing, but the stale
   * closure still holds the OLD `onClosed` prop and calls it.
   */
  it('13.787 an answer arriving after a dismissal never lands on the next opening', async () => {
    const user = userEvent.setup();
    let release: ((results: IngestResult[]) => void) | null = null;
    const source = createFakeDataSource({}, (events) => {
      void events;
      return new Promise<IngestResult[]>((resolve) => {
        release = resolve;
      });
    });
    const onClosed = vi.fn();
    const SECOND = [
      { ticketId: 'd', title: 'Book the venue' },
      { ticketId: 'e', title: 'Send the invitations' },
    ];
    const props = {
      dataSource: source,
      workspaceId: WS,
      currentUserId: 'user_kiro',
      onClose: vi.fn(),
      onClosed,
    };

    const view = render(<BulkCloseDialog open tickets={TICKETS} {...props} />);
    await user.click(confirm());
    await waitFor(() => expect(source.ingested).toHaveLength(1));

    // Dismissed, then opened again for a different pair — the first attempt
    // is still in flight throughout.
    view.rerender(<BulkCloseDialog open={false} tickets={TICKETS} {...props} />);
    view.rerender(<BulkCloseDialog open tickets={SECOND} {...props} />);
    expect(screen.getByRole('dialog', { name: 'Close 2 tickets' })).toBeInTheDocument();

    await act(async () => {
      release?.([
        { status: 'committed', eventId: 'e1', seq: 1, serverTime: SERVER_TIME },
        {
          status: 'refused',
          eventId: 'e2',
          rule: 'close-requires-terminal',
          reason: 'Only a terminal ticket can be closed.',
        },
        { status: 'committed', eventId: 'e3', seq: 2, serverTime: SERVER_TIME },
      ]);
    });

    // Nothing from the dismissed attempt is reported, and the new opening is
    // untouched: its own list, its own confirm, no phantom failure section.
    expect(onClosed).not.toHaveBeenCalled();
    expect(screen.queryByRole('heading', { name: 'Could not close' })).toBeNull();
    expect(screen.getByRole('dialog', { name: 'Close 2 tickets' })).toBeInTheDocument();
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'Book the venue',
      'Send the invitations',
    ]);
    expect(confirm()).toHaveTextContent('Close 2 tickets');
    expect(confirm()).toBeEnabled();
  });

  /**
   * 13.788 — every ticket refused: nothing is reported closed, and `onClosed`
   * is NOT called. This case exists because the opposite decision was
   * unwitnessed — an independent review made `onClosed` fire unconditionally
   * and all seven cases stayed green, since no case before this one reached an
   * all-refused outcome (13.641 always leaves something committed, and its
   * confirm is gone afterwards, so nothing could press it again). The
   * docblock states the empty case as a deliberate reading; a reading with no
   * witness is a claim, not a decision.
   */
  it('13.788 when every ticket is refused, nothing is reported closed and all are listed', async () => {
    const user = userEvent.setup();
    const source = createFakeDataSource({}, (events) =>
      events.map((event) => ({
        status: 'refused' as const,
        eventId: event.id,
        rule: 'close-requires-terminal',
        reason: 'Only a terminal ticket can be closed.',
      })),
    );
    const { onClosed } = renderDialog(source);

    await user.click(confirm());
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Could not close' })).toBeInTheDocument(),
    );

    expect(onClosed).not.toHaveBeenCalled();
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(
      screen.getByText('File the GST return — Only a terminal ticket can be closed.'),
    ).toBeInTheDocument();
    // Nothing left to try, the same rule 13.641 asserts for the partial case.
    expect(screen.queryByRole('button', { name: /^Close \d+ tickets?$/ })).toBeNull();
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
