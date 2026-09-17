import { render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { IngestResult, WorkflowDef } from '@gisik-nokma/domain';
import { createClientStateCache } from '../../src/cache.js';
import { ServingGapError, SERVING_GAPS } from '../../src/online/mappers.js';
import type { AttachmentListEntry } from '../../src/views/attachment-list.js';
import type { TicketHistoryEvent, TicketRead } from '../../src/view-types.js';
import { HISTORY_PAGE_LIMIT, TicketSheet } from '../../src/views/ticket-sheet.js';
import { createFakeDataSource } from '../helpers/fake-data-source.js';
import { PARENT, TICKET, WF_ERRAND, WS, claim, ticketStateSeed } from '../helpers/seed.js';

const PROVENANCE_LINE = 'marked Doing by Anselma Marak on 19 Aug 2026';

/** One real ledger line, for the tab tests that need the list to actually draw. */
const HISTORY_EVENT: TicketHistoryEvent = {
  id: '01J9GEVT000000000000000009',
  type: 'ticket.transitioned',
  version: 1,
  payload: { to: 'doing' },
  actorId: 'user_anselma',
  origin: 'web',
  clientTime: '2026-08-19T09:59:00.000Z',
  serverTime: '2026-08-19T10:00:00.000Z',
  seq: 2,
};

function ticketRead(overrides: Partial<TicketRead> = {}): TicketRead {
  return {
    ticket: ticketStateSeed({
      fields: {
        title: {
          value: 'File the GST return',
          actorId: 'user_kiro',
          clientTime: '2026-08-18T07:59:00.000Z',
          serverTime: '2026-08-18T08:00:00.000Z',
        },
        dueDate: {
          value: { date: '2026-08-30' },
          actorId: 'user_kiro',
          clientTime: '2026-08-18T08:04:00.000Z',
          serverTime: '2026-08-18T08:05:00.000Z',
        },
      },
    }),
    title: 'File the GST return',
    stateProvenance: claim(),
    parent: { kind: 'ticket', id: PARENT, title: 'Registrations' },
    rollup: null,
    ...overrides,
  };
}

function sheetSource(read: TicketRead, history: TicketHistoryEvent[] = []) {
  return createFakeDataSource({
    getTicket: async () => read,
    getWorkflowDef: async () => WF_ERRAND,
    getMembers: async () => [
      { id: 'user_kiro', name: 'Kiro' },
      { id: 'user_anselma', name: 'Anselma Marak' },
    ],
    getTicketHistory: async () => history,
  });
}

function renderSheet(
  read: TicketRead,
  source = sheetSource(read),
  extra: Partial<Parameters<typeof TicketSheet>[0]> = {},
) {
  render(
    <TicketSheet
      dataSource={source}
      workspaceId={WS}
      ticketId={TICKET}
      currentUserId="user_kiro"
      onClose={vi.fn()}
      {...extra}
    />,
  );
  return source;
}

/** The sheet is fully painted only once the workflow read has named the state. */
async function settled(): Promise<void> {
  await waitFor(() => expect(screen.getByText(PROVENANCE_LINE)).toBeInTheDocument());
}

/**
 * 3.73 — cited on the block: every field wears its CLAIM (a value is never a standing property, and a nameless actor is attributed by id rather than blank or "system"), and the three parent facts stay three — visible parent, restricted parent as existence-without-title, and root said distinctly.
 */
describe('TicketSheet — full state with per-field claim attribution', () => {
  it('renders the state with its provenance line and each field with its claim', async () => {
    renderSheet(ticketRead());
    await settled();
    // The title is the sheet's own label AND a field claim, so it is asserted
    // in both places rather than by a bare text match that finds two nodes.
    expect(screen.getByRole('dialog', { name: 'File the GST return' })).toBeInTheDocument();
    const titleRow = screen.getByTestId('field-title');
    expect(within(titleRow).getByText('File the GST return')).toBeInTheDocument();
    const dueDateRow = screen.getByTestId('field-dueDate');
    expect(within(dueDateRow).getByText('set by Kiro on 18 Aug 2026')).toBeInTheDocument();
    // The due DAY CLAIM renders as claimed, through the one renderer.
    expect(within(dueDateRow).getByText('30 Aug 2026')).toBeInTheDocument();
  });

  it('PLANTED DEFECT: a nameless actor is attributed by id — never blank, never "system"', async () => {
    // The roster join is the only place a name comes from, and it is total by
    // construction: a member the roster does not carry still names its actor.
    const source = createFakeDataSource({
      getTicket: async () => ticketRead(),
      getWorkflowDef: async () => WF_ERRAND,
      getMembers: async () => [],
      getTicketHistory: async () => [],
    });
    renderSheet(ticketRead(), source);
    await settled();
    const dueDateRow = screen.getByTestId('field-dueDate');
    expect(within(dueDateRow).getByText('set by user_kiro on 18 Aug 2026')).toBeInTheDocument();
    expect(screen.getByTestId('field-assignee').textContent).toContain('user_anselma');
    expect(document.body.textContent).not.toContain('system');
  });

  it('PLANTED DEFECT: every field carries a claim line — a value is never a standing property', async () => {
    renderSheet(ticketRead());
    await settled();
    for (const fieldId of ['title', 'dueDate']) {
      const row = screen.getByTestId(`field-${fieldId}`);
      expect(row.querySelector('.gn-ticket-sheet__claim')?.textContent, fieldId).toMatch(
        /^set by .+ on \d{1,2} \w{3} \d{4}$/,
      );
    }
  });

  it('renders the parent link when visible', async () => {
    renderSheet(ticketRead());
    await waitFor(() => expect(screen.getByText('Registrations')).toBeInTheDocument());
  });

  it('PLANTED DEFECT: a restricted parent renders as existence-without-title, never as parentless', async () => {
    renderSheet(ticketRead({ parent: { kind: 'restricted', id: 'secret' } }));
    await waitFor(() =>
      expect(screen.getByText("Restricted parent — exists, but you can't see it")).toBeInTheDocument(),
    );
    expect(screen.queryByText('At project root')).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain('secret');
  });

  it('a root ticket says so — distinct from restricted', async () => {
    renderSheet(ticketRead({ parent: null }));
    await waitFor(() => expect(screen.getByText('At project root')).toBeInTheDocument());
    expect(screen.queryByText(/Restricted parent/)).toBeNull();
  });

  it('shows the derived progress line when the ticket has children', async () => {
    renderSheet(ticketRead({ rollup: { totalChildren: 8, terminalChildren: 5, restrictedCount: 2 } }));
    await waitFor(() => expect(screen.getByText('5 of 8 done · 2 restricted')).toBeInTheDocument());
  });

  it('PLANTED DEFECT: a ticket with no rollup renders no progress line — no invented denominator', async () => {
    const { container } = render(<div />);
    container.remove();
    renderSheet(ticketRead());
    await settled();
    expect(document.querySelector('.gn-ticket-sheet__progress')).toBeNull();
  });

  it('history tab renders both clocks from the ledger', async () => {
    const user = userEvent.setup();
    const source = sheetSource(ticketRead(), [
      {
        id: '01J9GEVT00000000000000000A',
        type: 'ticket.created',
        version: 1,
        payload: {},
        actorId: 'user_kiro',
        origin: 'web',
        clientTime: '2026-08-16T18:30:00.000Z',
        serverTime: '2026-08-19T10:00:00.000Z',
        seq: 1,
      },
    ]);
    renderSheet(ticketRead(), source);
    await settled();
    await user.click(screen.getByRole('tab', { name: 'History' }));
    expect(await screen.findByText('claimed (device clock)')).toBeInTheDocument();
    expect(screen.getByText('17 Aug 2026, 00:00 IST')).toBeInTheDocument();
    expect(screen.getByText('19 Aug 2026, 15:30 IST')).toBeInTheDocument();
  });

  it('PLANTED DEFECT: four live reads means four stream subscriptions, all on this workspace', async () => {
    // Ruling P17: `useLiveQuery` keys the SUBSCRIPTION on the workspace and the
    // REFETCH on the query key. Four reads ride this sheet — ticket, workflow,
    // members, history — and each opens its own subscription.
    const source = sheetSource(ticketRead());
    renderSheet(ticketRead(), source);
    await settled();
    expect(source.subscriptions).toHaveLength(4);
    expect(source.subscriptions.every((s) => s.workspaceId === WS)).toBe(true);
  });

  it('PLANTED DEFECT: the workflow is read at the version the TICKET pins, not the latest', async () => {
    // A ticket pins the workflow version it was created under (owner decision
    // 2026-08-26). Asking for `latest` can hand back a definition that no
    // longer declares this ticket's own state, and `transitionOptions` would
    // then quietly offer only the wildcard edges.
    const asked: Array<[string, string, number | undefined]> = [];
    const read = ticketRead({
      ticket: ticketStateSeed({ workflowVersion: 4, fields: {} }),
    });
    const source = createFakeDataSource({
      getTicket: async () => read,
      getWorkflowDef: async (workspaceId, workflowId, version) => {
        asked.push([workspaceId, workflowId, version]);
        return { ...WF_ERRAND, version: 4 };
      },
      getMembers: async () => [],
      getTicketHistory: async () => [],
    });
    renderSheet(read, source);
    await waitFor(() => expect(asked.length).toBeGreaterThan(0));
    expect(asked).toContainEqual([WS, 'wf-errand', 4]);
    // And the ticket read is asked for exactly once per key — the plan's
    // snippet called `getTicket` a second time inside the workflow loader.
    expect(asked.filter(([, workflowId]) => workflowId === 'wf-errand')).toHaveLength(1);
  });
});

/**
 * `getTicket` USED TO REFUSE here, and does not any more — ruling P25 clause 1
 * closed `TicketRead.title`, `.stateProvenance` and `.ticket`, so the register
 * names none of this view's four reads (`getTicket`, `getWorkflowDef`,
 * `getMembers`, `getTicketHistory`).
 *
 * The refusal PATH in the view is still live and still worth pinning: nothing
 * stops a future gap opening on one of those reads, and the failure this guards
 * against — a refusal rendering as a wait that never ends — is a property of the
 * view, not of which methods happen to refuse this week.
 *
 * So the absences below are CONSTRUCTED rather than read off `SERVING_GAPS`.
 * The original case took them from the register on purpose, reasoning that "a
 * hand-written Error would keep passing on the day the gap closes, which is the
 * one day this case must change" — and that day arrived, which is what makes
 * this edit the case changing rather than the case being weakened. The control
 * below is INVERTED to carry the same duty: it asserts the register names none
 * of this view's reads, which is the fact that licenses hand-construction, and
 * it goes red the day a new gap opens on one of them.
 */
describe('TicketSheet — a refused read is a refusal, never a wait that never ends', () => {
  it('PLANTED DEFECT: the serving gap renders under its own class, and "Loading…" is nowhere', async () => {
    const source = createFakeDataSource({
      getTicket: async () => {
        throw new ServingGapError('getTicket', [
          {
            field: 'TicketRead.title',
            wireKey: 'title',
            wireRoute: `/v1/workspaces/${WS}/tickets/${TICKET}`,
            because: 'constructed: see this describe block on why it is not read off the register',
            owner: 'test fixture — the real entry was closed by P25 clause 1',
          },
          {
            field: 'TicketRead.stateProvenance',
            wireKey: 'stateProvenance',
            wireRoute: `/v1/workspaces/${WS}/tickets/${TICKET}`,
            because: 'constructed: see this describe block on why it is not read off the register',
            owner: 'test fixture — the real entry was closed by P25 clause 1',
          },
        ]);
      },
      getWorkflowDef: async () => WF_ERRAND,
      getMembers: async () => [],
      getTicketHistory: async () => [],
    });
    render(
      <TicketSheet
        dataSource={source}
        workspaceId={WS}
        ticketId={TICKET}
        currentUserId="user_kiro"
        onClose={vi.fn()}
      />,
    );
    const refusal = await screen.findByText(/facts the shipped route does not serve/);
    expect(refusal.className).toBe('gn-ticket-sheet__refusal');
    // The three absences are named, not summarised into "something went wrong".
    expect(refusal.textContent).toContain('TicketRead.title');
    expect(refusal.textContent).toContain('TicketRead.stateProvenance');
    expect(document.querySelector('.gn-ticket-sheet__loading')).toBeNull();
    expect(document.body.textContent).not.toContain('Loading…');
    // And no sheet body: no invented state chip, no empty field list.
    expect(document.querySelector('.gn-ticket-sheet__details')).toBeNull();
  });

  it('CONTROL (inverted) — the register names NONE of this view\'s reads, which is what licenses constructing the absences above', () => {
    for (const method of ['getTicket', 'getWorkflowDef', 'getMembers', 'getTicketHistory']) {
      expect(SERVING_GAPS[method], method).toBeUndefined();
    }
    // Non-vacuity: the register is not simply empty. Four methods still refuse,
    // so `toBeUndefined` above is a fact about THESE reads rather than about a
    // register nobody populates any more.
    expect(Object.keys(SERVING_GAPS).length).toBeGreaterThan(0);
  });
});

describe('TicketSheet — the transition round-trip', () => {
  /**
   * 3.74 — the ledger payload is the SHIPPED spelling, `{to, comment:{text}}` and not `{toStateId}`, and the proof runs the real engine rather than restating the schema.
   */
  it('PLANTED DEFECT: the ledger payload is the SHIPPED spelling — {to, comment:{text}}, not {toStateId}', async () => {
    // `ticketTransitionedPayloadSchema` (packages/domain/src/workflow.ts) names
    // the destination `to` and wraps the comment as `{text}`. The plan's snippet
    // emits `{toStateId, comment: 'string'}`, which the engine and the ingest
    // door both refuse as a malformed payload — the claim never lands.
    const user = userEvent.setup();
    const source = renderSheet(ticketRead());
    await settled();
    await user.click(screen.getByRole('button', { name: 'Move…' }));
    await user.click(screen.getByRole('button', { name: /Move to/ }));
    await user.click(within(await screen.findByRole('listbox')).getByRole('option', { name: 'Done' }));
    await user.type(
      screen.getByLabelText('Comment (required by this transition)'),
      'filed at the portal',
    );
    await user.click(screen.getByRole('button', { name: 'Move' }));
    await waitFor(() => expect(source.ingested).toHaveLength(1));
    const batch = source.ingested[0]!;
    expect(batch).toHaveLength(1);
    expect(batch[0]!.type).toBe('ticket.transitioned');
    expect(batch[0]!.payload).toEqual({ to: 'done', comment: { text: 'filed at the portal' } });
    expect(batch[0]!.actorId).toBe('user_kiro');
    expect(batch[0]!.origin).toBe('web');
    // Belt and braces: the plan's key must not be present under any value.
    expect(Object.keys(batch[0]!.payload as Record<string, unknown>)).not.toContain('toStateId');
  });

  it('PLANTED DEFECT: prompted field claims are emitted BEFORE the transition, in one ordered batch', async () => {
    const user = userEvent.setup();
    const gated: WorkflowDef = {
      ...WF_ERRAND,
      transitions: WF_ERRAND.transitions.map((transition) =>
        transition.from === 'doing' && transition.to === 'done'
          ? { ...transition, rules: [{ kind: 'require-field', field: 'invoiceNo' }] }
          : transition,
      ),
    };
    const read = ticketRead();
    const source = createFakeDataSource({
      getTicket: async () => read,
      getWorkflowDef: async () => gated,
      getMembers: async () => [],
      getTicketHistory: async () => [],
    });
    renderSheet(read, source);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Move…' })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Move…' }));
    await user.click(screen.getByRole('button', { name: /Move to/ }));
    await user.click(within(await screen.findByRole('listbox')).getByRole('option', { name: 'Done' }));
    await user.type(screen.getByLabelText('invoiceNo (required before this transition)'), 'INV-7');
    await user.click(screen.getByRole('button', { name: 'Move' }));
    await waitFor(() => expect(source.ingested).toHaveLength(1));
    const batch = source.ingested[0]!;
    // One batch, in order: the field claim the rule needs, then the move that
    // needs it. Reversed, the rule reads the field as still unset.
    expect(batch.map((event) => event.type)).toEqual(['ticket.field_set', 'ticket.transitioned']);
    expect(batch[0]!.payload).toEqual({ fieldId: 'invoiceNo', value: 'INV-7' });
    expect(batch[1]!.payload).toEqual({ to: 'done' });
  });

  it("PLANTED DEFECT: when the server refuses, its reason renders verbatim — not the local preview's", async () => {
    const user = userEvent.setup();
    const read = ticketRead();
    const source = createFakeDataSource(
      {
        getTicket: async () => read,
        getWorkflowDef: async () => WF_ERRAND,
        getMembers: async () => [],
        getTicketHistory: async () => [],
      },
      (events) =>
        events.map((event) => ({
          status: 'refused' as const,
          eventId: event.id,
          rule: 'restrict-to',
          reason: 'Only Anselma Marak may perform "Doing → Done" on this ticket. [server]',
        })),
    );
    renderSheet(read, source);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Move…' })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Move…' }));
    await user.click(screen.getByRole('button', { name: /Move to/ }));
    await user.click(within(await screen.findByRole('listbox')).getByRole('option', { name: 'Done' }));
    await user.type(screen.getByLabelText('Comment (required by this transition)'), 'trying anyway');
    await user.click(screen.getByRole('button', { name: 'Move' }));
    const serverBox = await screen.findByRole('alert');
    expect(serverBox).toHaveTextContent(
      'Refused by the server — restrict-to: Only Anselma Marak may perform "Doing → Done" on this ticket. [server]',
    );
  });

  it('PLANTED DEFECT: an INVALID answer is carried too — the door’s code and message, not silence', async () => {
    const user = userEvent.setup();
    const read = ticketRead();
    const source = createFakeDataSource(
      {
        getTicket: async () => read,
        getWorkflowDef: async () => WF_ERRAND,
        getMembers: async () => [],
        getTicketHistory: async () => [],
      },
      (events) =>
        events.map((event) => ({
          status: 'invalid' as const,
          eventId: event.id,
          code: 'unknown-event-type' as const,
          message: 'ticket.transitioned is not a registered event type.',
        })),
    );
    renderSheet(read, source);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Move…' })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Move…' }));
    await user.click(screen.getByRole('button', { name: /Move to/ }));
    await user.click(within(await screen.findByRole('listbox')).getByRole('option', { name: 'Done' }));
    await user.type(screen.getByLabelText('Comment (required by this transition)'), 'trying anyway');
    await user.click(screen.getByRole('button', { name: 'Move' }));
    const serverBox = await screen.findByRole('alert');
    expect(serverBox).toHaveTextContent('unknown-event-type');
    expect(serverBox).toHaveTextContent('ticket.transitioned is not a registered event type.');
  });

  it('a committed batch closes the dialog and clears any earlier refusal', async () => {
    const user = userEvent.setup();
    const source = renderSheet(ticketRead());
    await settled();
    await user.click(screen.getByRole('button', { name: 'Move…' }));
    await user.click(screen.getByRole('button', { name: /Move to/ }));
    await user.click(within(await screen.findByRole('listbox')).getByRole('option', { name: 'Done' }));
    await user.type(screen.getByLabelText('Comment (required by this transition)'), 'done and filed');
    await user.click(screen.getByRole('button', { name: 'Move' }));
    await waitFor(() => expect(screen.queryByLabelText('Move to')).toBeNull());
    expect(screen.queryByRole('alert')).toBeNull();
    expect(source.ingested).toHaveLength(1);
  });
});

/**
 * THE PRE-CHECK, REACHED FOR REAL.
 *
 * Every other test in this file leaves `cache` unset, and the sheet then
 * short-circuits to `not-evaluated` without ever calling `precheckEvent` — a
 * harness vacuity: the payload spelling could be anything at all and no
 * assertion above would notice, because the plan's dialog tests stub `precheck`
 * outright and the plan's sheet tests supply no cache.
 *
 * With a cache in hand the shared rule engine really runs, and it PARSES the
 * payload with `ticketTransitionedPayloadSchema` before it evaluates anything.
 * That is what makes these two cases the proof of adaptation 3 rather than a
 * restatement of it.
 */
describe('TicketSheet — the instant pre-check, with a cache to evaluate against', () => {
  function cacheForTicket() {
    const cache = createClientStateCache();
    cache.upsertTicket(ticketRead().ticket);
    cache.upsertWorkflowDef(WF_ERRAND);
    return cache;
  }

  it('PLANTED DEFECT: a legal move with nothing owing previews as PASSED — silently, with no box', async () => {
    const user = userEvent.setup();
    const read = ticketRead();
    renderSheet(read, sheetSource(read), { cache: cacheForTicket() });
    await settled();
    await user.click(screen.getByRole('button', { name: 'Move…' }));
    await user.click(screen.getByRole('button', { name: /Move to/ }));
    await user.click(
      within(await screen.findByRole('listbox')).getByRole('option', { name: 'Waiting on counterparty' }),
    );
    await waitFor(() => expect(screen.getByRole('button', { name: 'Move' })).toBeEnabled());
    // `passed` is not a promise of acceptance and says nothing on screen. What
    // it proves here is that the engine PARSED the payload: a `{toStateId}`
    // claim is refused as malformed before any rule is reached, and a refusal
    // box would be on screen instead.
    expect(document.querySelector('.gn-refusal--preview')).toBeNull();
  });

  it('PLANTED DEFECT: the refusal names the WORKFLOW rule, never the client’s own payload', async () => {
    const user = userEvent.setup();
    const read = ticketRead();
    renderSheet(read, sheetSource(read), { cache: cacheForTicket() });
    await settled();
    await user.click(screen.getByRole('button', { name: 'Move…' }));
    await user.click(screen.getByRole('button', { name: /Move to/ }));
    // doing → done declares require-comment, and the pre-check candidate carries
    // no comment, so the engine refuses by that rule.
    await user.click(within(await screen.findByRole('listbox')).getByRole('option', { name: 'Done' }));
    const preview = await screen.findByText(/instant check/);
    expect(preview).toHaveTextContent('require-comment');
    // THE KILL. With the plan's `{toStateId}` payload this same box reads
    // "malformed-payload: at to: …" — a refusal about this code, shown to a
    // user as though it were about their move.
    expect(preview.textContent).not.toContain('malformed');
    expect(preview.textContent).not.toContain('toStateId');
  });
});

describe('TicketSheet — the attachment list (Task 12a wiring)', () => {
  const ENTRIES: AttachmentListEntry[] = [
    {
      kind: 'upload',
      attachmentId: '01J9GATA000000000000000000',
      filename: 'receipt.pdf',
      mime: 'application/pdf',
      size: 1024,
      sha256: 'a'.repeat(64),
    },
    {
      kind: 'drive-reference',
      attachmentId: '01J9GATD000000000000000000',
      driveFileId: '1AbCdEfGhIjKlMnOpQrStUvWxYz0123456',
      name: 'receipt.pdf',
      mimeType: 'application/pdf',
      webViewLink: 'https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456/view',
      capturedAt: '2026-08-20T10:00:00.000Z',
    },
  ];

  it('PLANTED DEFECT: an absent prop renders NO section — never a promise that there are none', async () => {
    renderSheet(ticketRead());
    await settled();
    expect(document.querySelector('.gn-attachments')).toBeNull();
    expect(document.body.textContent).not.toContain('Google Drive');
  });

  it('PLANTED DEFECT: supplied entries render inside the details tab, both kinds told apart', async () => {
    const read = ticketRead();
    renderSheet(read, sheetSource(read), { attachments: ENTRIES });
    await settled();
    const details = document.querySelector('.gn-ticket-sheet__details')!;
    const kinds = [...details.querySelectorAll('.gn-attachment')].map((node) =>
      node.getAttribute('data-attachment-kind'),
    );
    expect(kinds).toEqual(['upload', 'drive-reference']);
    expect(details.textContent).toContain('captured 20 Aug 2026');
  });

  it('PLANTED DEFECT: the attachment list belongs to the details tab, not to history', async () => {
    const user = userEvent.setup();
    const read = ticketRead();
    renderSheet(read, sheetSource(read), { attachments: ENTRIES });
    await settled();
    await user.click(screen.getByRole('tab', { name: 'History' }));
    expect(document.querySelector('.gn-attachments')).toBeNull();
  });
});

/**
 * THE HISTORY TAB'S THREE STATES, AND WHY TWO OF THEM USED TO BE THE THIRD.
 *
 * `useLiveQuery` leaves `data` at `null` while a load is in flight AND after it
 * rejects (`src/views/use-live-query.ts:41`, `:66-69`, `:77`). The tab's
 * previous single line — `events={history.data ?? []}` — folded pending, failed
 * and empty into ONE rendering: an empty `<ol>`. On the surface that IS the
 * ledger (spec §3), that reads as "nothing was ever claimed about this ticket",
 * which is the strongest false statement this product can make about one.
 *
 * The three cases below are driven through the SAME mount and told apart by
 * CLASS as well as by text, because the sheet body's own kill (case 3.75) was a
 * class assertion and a defect that changed only the wording would slip a text
 * one. Each names what the other two must NOT be showing, so collapsing any
 * pair reddens here rather than passing quietly.
 */
/**
 * 3.81 — cited on the block: the history tab’s THREE states, where two of them used to be the third. `useLiveQuery` leaves `data` at `null` both while a load is in flight AND when it failed, so in-flight, rejected and empty are told apart here rather than collapsing into one notice.
 */
describe('TicketSheet — the History tab: loading, failed and empty are three different things', () => {
  /** A read that never settles. The tab must say it is waiting, not that there is nothing. */
  function pendingHistorySource() {
    const read = ticketRead();
    return createFakeDataSource({
      getTicket: async () => read,
      getWorkflowDef: async () => WF_ERRAND,
      getMembers: async () => [],
      getTicketHistory: () => new Promise<TicketHistoryEvent[]>(() => {}),
    });
  }

  async function openHistory(source: ReturnType<typeof createFakeDataSource>): Promise<void> {
    const user = userEvent.setup();
    renderSheet(ticketRead(), source);
    await settled();
    await user.click(screen.getByRole('tab', { name: 'History' }));
  }

  it('PLANTED DEFECT: a history read still IN FLIGHT says so — it does not draw an empty ledger', async () => {
    await openHistory(pendingHistorySource());
    const loading = await screen.findByText('Loading…');
    expect(loading.className).toBe('gn-ticket-sheet__history-loading');
    // The three renderings the pending state must not be wearing.
    expect(document.querySelector('.gn-history')).toBeNull();
    expect(document.querySelector('.gn-ticket-sheet__history-empty')).toBeNull();
    expect(document.querySelector('.gn-ticket-sheet__history-error')).toBeNull();
    // The empty <ol> was the defect: an empty ledger with no indicator at all.
    expect(document.body.textContent).not.toContain('No entries came back');
  });

  it('PLANTED DEFECT: a history read that REJECTS renders the failure, never "Loading…" and never an empty ledger', async () => {
    const read = ticketRead();
    const source = createFakeDataSource({
      getTicket: async () => read,
      getWorkflowDef: async () => WF_ERRAND,
      getMembers: async () => [],
      getTicketHistory: async () => {
        throw new Error('history route answered 502');
      },
    });
    await openHistory(source);
    const failure = await screen.findByText(/could not be read/);
    expect(failure.className).toBe('gn-ticket-sheet__history-error');
    // The transport's own words, carried rather than paraphrased.
    expect(failure.textContent).toContain('history route answered 502');
    // Branch ORDER is the fix: on a rejection `data` is null too, so a
    // `data === null` test placed first renders this as a wait that will end.
    expect(document.querySelector('.gn-ticket-sheet__history-loading')).toBeNull();
    expect(document.body.textContent).not.toContain('Loading…');
    expect(document.querySelector('.gn-history')).toBeNull();
    expect(document.body.textContent).not.toContain('No entries came back');
  });

  it('PLANTED DEFECT: the failure is an ERROR, not a serving gap — different words AND a different class', async () => {
    // `getTicketHistory` is one of the six methods the online source ANSWERS
    // (`src/online/online-data-source.ts:151`), so its rejection is a failure of
    // one read that may answer on a retry — not the permanent gap `getTicket`
    // refuses with. Wearing `gn-ticket-sheet__refusal` would put a false claim
    // in the CSS, and the sheet body's own refusal class must stay unused here.
    const read = ticketRead();
    const source = createFakeDataSource({
      getTicket: async () => read,
      getWorkflowDef: async () => WF_ERRAND,
      getMembers: async () => [],
      getTicketHistory: async () => {
        throw new Error('history route answered 502');
      },
    });
    await openHistory(source);
    const failure = await screen.findByText(/could not be read/);
    expect(failure.textContent).toContain('may answer on a retry');
    expect(failure.textContent).toContain('not a statement about the ticket');
    expect(document.querySelector('.gn-ticket-sheet__refusal')).toBeNull();
  });

  it('PLANTED DEFECT: an empty answer is described as an empty ANSWER, not as a ticket with no history', async () => {
    // `src/online/online-data-source.ts:151-158` answers `[]` on a 404, and a
    // 404 there means "no such ticket, or not yours". A live ticket always
    // carries at least its own `ticket.created`, so an empty page in production
    // is a 404 or a cursor past the end — never a ticket that nobody claimed
    // anything about. The sentence therefore describes the read.
    const read = ticketRead();
    await openHistory(sheetSource(read, []));
    const empty = await screen.findByText('No entries came back for this ticket.');
    expect(empty.className).toBe('gn-ticket-sheet__history-empty');
    expect(document.querySelector('.gn-history')).toBeNull();
    expect(document.querySelector('.gn-ticket-sheet__history-loading')).toBeNull();
    expect(document.querySelector('.gn-ticket-sheet__history-error')).toBeNull();
    // The claim the surface is not permitted to make.
    expect(document.body.textContent).not.toContain('no history');
  });

  it('PLANTED DEFECT: a non-empty answer renders the ledger and NONE of the three notices', async () => {
    const read = ticketRead();
    await openHistory(sheetSource(read, [HISTORY_EVENT]));
    await screen.findByText('ticket.transitioned');
    expect(document.querySelectorAll('.gn-history__event')).toHaveLength(1);
    expect(document.querySelector('.gn-ticket-sheet__history-loading')).toBeNull();
    expect(document.querySelector('.gn-ticket-sheet__history-error')).toBeNull();
    expect(document.querySelector('.gn-ticket-sheet__history-empty')).toBeNull();
  });
});

/**
 * THE PAGE BOUNDARY, SAID OUT LOUD.
 *
 * The shipped route PAGES: `apps/server/src/routes/ticket-history.ts:78` sets
 * `DEFAULT_LIMIT = 200`, applied at `:155` and reaching the query as `LIMIT $3`
 * at `:305`. The sheet used to pass neither `afterSeq` nor `limit`, so a
 * long-lived ticket's ledger was cut at the server's default with nothing on
 * screen saying so — the oldest line shown would read as the ticket's beginning.
 *
 * There is no cursor and no `hasMore` on the wire, so a FULL PAGE is the only
 * signal a client can observe. That over-reports on a ticket with exactly
 * `HISTORY_PAGE_LIMIT` entries, and the boundary case is asserted below rather
 * than hidden: an occasional "there may be more" is a weaker claim than the
 * truth, where a silent truncation is a stronger one.
 */
/**
 * 3.82 — cited on the block: a truncated ledger SAYS it is truncated. The client asks for an explicit limit rather than taking the server default, a full page says the history may go on past it, and a short page invents no "more".
 */
describe('TicketSheet — a truncated ledger says it is truncated', () => {
  function page(count: number): TicketHistoryEvent[] {
    return Array.from({ length: count }, (_, index) => ({
      ...HISTORY_EVENT,
      id: `evt_${String(index).padStart(4, '0')}`,
      seq: index + 1,
    }));
  }

  it('CONTROL — the sheet asks for an explicit limit rather than taking the server default', async () => {
    const asked: Array<[string, number | undefined, number | undefined]> = [];
    const read = ticketRead();
    const source = createFakeDataSource({
      getTicket: async () => read,
      getWorkflowDef: async () => WF_ERRAND,
      getMembers: async () => [],
      getTicketHistory: async (ticketId, afterSeq, limit) => {
        asked.push([ticketId, afterSeq, limit]);
        return [];
      },
    });
    renderSheet(read, source);
    await waitFor(() => expect(asked.length).toBeGreaterThan(0));
    expect(asked[0]).toEqual([TICKET, undefined, HISTORY_PAGE_LIMIT]);
  });

  it('the client names 200, the number the citation claims the route defaults to — STATED here, not verified: app-core cannot read the route', () => {
    // This assertion compares the client constant to a LITERAL. It cannot see
    // `apps/server/src/routes/ticket-history.ts` at all — `app-core` may not
    // reach into the server (amendment 10) — so it establishes nothing about
    // what the route actually defaults to, and its name must not say otherwise.
    // What it buys: the number is written down in exactly one test, so a change
    // to `HISTORY_PAGE_LIMIT` made without revisiting the citation reddens here.
    // The two are kept in step by citation and by nothing stronger.
    expect(HISTORY_PAGE_LIMIT).toBe(200);
  });

  it('PLANTED DEFECT: a FULL page says the history may go on past it', async () => {
    const read = ticketRead();
    await (async () => {
      const user = userEvent.setup();
      renderSheet(read, sheetSource(read, page(HISTORY_PAGE_LIMIT)));
      await settled();
      await user.click(screen.getByRole('tab', { name: 'History' }));
    })();
    const partial = await screen.findByText(/may go on past them/);
    expect(partial.className).toBe('gn-ticket-sheet__history-partial');
    expect(partial.textContent).toContain(`Showing the first ${HISTORY_PAGE_LIMIT} entries`);
    // And the entries are still all there: the notice is added, never a swap.
    expect(document.querySelectorAll('.gn-history__event')).toHaveLength(HISTORY_PAGE_LIMIT);
  });

  it('PLANTED DEFECT: a SHORT page says nothing of the kind — no invented "more"', async () => {
    const read = ticketRead();
    const user = userEvent.setup();
    renderSheet(read, sheetSource(read, page(HISTORY_PAGE_LIMIT - 1)));
    await settled();
    await user.click(screen.getByRole('tab', { name: 'History' }));
    await waitFor(() =>
      expect(document.querySelectorAll('.gn-history__event')).toHaveLength(HISTORY_PAGE_LIMIT - 1),
    );
    expect(document.querySelector('.gn-ticket-sheet__history-partial')).toBeNull();
    expect(document.body.textContent).not.toContain('may go on past them');
  });
});

/**
 * The MOUNT, and only the mount (Plan 6 Task 15b, item 3). Cases 3.116–3.117.
 *
 * The editor's own behaviour — the two pinned sentences, the lockout warning
 * that changes nothing, the payload spellings, the refusal rendering — is
 * proven in `visibility-editor.test.tsx`, driving the component directly. It is
 * NOT proven here, and the reason is worth stating rather than assumed: every
 * case in this file feeds a fabricated successful `getTicket`, and `getTicket`
 * refuses against the shipped server (`mapTicketRead`), so this whole details
 * body is DARK in production today. Asserting the editor's behaviour through
 * this harness would be reporting coverage of a line nobody can reach.
 */
describe('3.116 TicketSheet — the "Who can see this" section is mounted', () => {
  it('renders the section, and the owner-disclosure sentence inside it', async () => {
    renderSheet(ticketRead());
    await settled();
    const section = screen.getByRole('region', { name: 'Who can see this' });
    expect(
      within(section).getByText('Visible to: these people — and the workspace owner, always.'),
    ).toBeInTheDocument();
  });

  /**
   * 3.117 PLANTED DEFECT — nothing serves the standing audience.
   *
   * `TicketRead` has five fields and none is visibility; the shipped ticket
   * route answers a `proj_visibility` row wrapped in `{ticket, parent, rollup}`
   * with no provenance block at all. So the sheet passes `undefined` and the
   * section must render the ABSENCE. A default of "Whatever the parent decided"
   * would be plausible — `inherit` is what a ticket is born with — and that is
   * exactly why it must not be drawn.
   */
  it('3.117 shows the audience as UNSERVED rather than defaulting to a mode', async () => {
    renderSheet(ticketRead());
    await settled();
    const section = screen.getByRole('region', { name: 'Who can see this' });
    expect(within(section).getByRole('status')).toHaveTextContent('not being served yet');
  });
});

/**
 * THE CLOSE/REOPEN ROUND-TRIP (backlog/closed spec §5.3, 2026-09-17).
 *
 * `TicketSheet` reads `TicketState.closed` (`{actorId, at} | null | undefined`,
 * spec §1.2) straight off `read.data.ticket` — `state.closed ?? null`, the
 * same optional chain every other reader in this plan spells — never a
 * separate flag this view invents. Close and Reopen are each other's
 * complement over that value, gated by `stateCategory`, so this block proves
 * both the gating and the one wire fact that matters: the SHIPPED payload for
 * both events is `{}` (the envelope alone carries actor and time, spec §1.2),
 * never a client-invented shape.
 */
describe('TicketSheet — Close, Reopen and the badge (backlog/closed spec §5.3, 2026-09-17)', () => {
  /**
   * `Sheet`'s own dismiss button (`packages/ui/src/components/sheet.tsx`)
   * carries `aria-label="Close"`, so its ACCESSIBLE NAME is "Close" too —
   * identical to this feature's button text. `within` the state row keeps
   * `getByRole('button', { name: 'Close' })` pointed at this sheet's own
   * button rather than colliding with the header's dismiss control.
   */
  function stateRow(): HTMLElement {
    return document.querySelector('.gn-ticket-sheet__state') as HTMLElement;
  }

  /**
   * 13.585 — a terminal, not-closed ticket shows Close and not Reopen;
   * clicking it ingests exactly one `ticket.closed` with `payload {}`, and the
   * sheet reloads — `getTicket` asked again, off the SAME `read.reload()`
   * `submitTransition`'s own committed branch calls for a move.
   */
  it('13.585 shows Close (not Reopen) on a terminal, not-closed ticket, and closing it ingests {} and reloads', async () => {
    const user = userEvent.setup();
    const read = ticketRead({
      ticket: ticketStateSeed({ stateId: 'done', stateCategory: 'terminal', closed: null }),
    });
    let getTicketCalls = 0;
    const source = createFakeDataSource({
      getTicket: async () => {
        getTicketCalls += 1;
        return read;
      },
      getWorkflowDef: async () => WF_ERRAND,
      getMembers: async () => [],
      getTicketHistory: async () => [],
    });
    renderSheet(read, source);
    await waitFor(() => expect(within(stateRow()).getByRole('button', { name: 'Close' })).toBeInTheDocument());
    expect(within(stateRow()).queryByRole('button', { name: 'Reopen' })).toBeNull();
    await waitFor(() => expect(getTicketCalls).toBe(1));

    await user.click(within(stateRow()).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(source.ingested).toHaveLength(1));
    const batch = source.ingested[0]!;
    expect(batch).toHaveLength(1);
    expect(batch[0]!.type).toBe('ticket.closed');
    expect(batch[0]!.payload).toEqual({});
    expect(batch[0]!.actorId).toBe('user_kiro');
    expect(batch[0]!.origin).toBe('web');
    // The sheet reloads: `read.reload()` re-asks `getTicket`.
    await waitFor(() => expect(getTicketCalls).toBe(2));
  });

  /**
   * 13.586 — a closed ticket shows the badge with the roster-resolved name
   * and the IST-formatted date, shows Reopen (not Close), disables Move… with
   * the sentence beside it as TEXT (never a tooltip), and clicking Reopen
   * ingests one `ticket.reopened` with `payload {}`.
   */
  it('13.586 shows the closed badge, Reopen, a disabled Move… with its note, and reopening ingests {}', async () => {
    const user = userEvent.setup();
    const read = ticketRead({
      ticket: ticketStateSeed({
        stateId: 'done',
        stateCategory: 'terminal',
        // 19:00 UTC crosses midnight under +05:30 (00:30 IST, 21 Aug) — a
        // DISCRIMINATING instant, the same technique the history-tab battery
        // above uses (`clientTime: '2026-08-16T18:30:00.000Z'` → '17 Aug
        // 2026'). A same-day UTC instant would print the same date through a
        // naive UTC slice as through the real `formatDate`/`formatIstInstant`
        // path, so it would prove nothing about WHICH renderer ran.
        closed: { actorId: 'user_anselma', at: '2026-08-20T19:00:00.000Z' },
      }),
    });
    const source = sheetSource(read);
    renderSheet(read, source);
    await waitFor(() =>
      expect(within(stateRow()).getByRole('button', { name: 'Reopen' })).toBeInTheDocument(),
    );
    expect(within(stateRow()).queryByRole('button', { name: 'Close' })).toBeNull();
    // The roster resolves the name through the SAME `actorLabel` join every
    // other claim in this sheet goes through; the date is the one IST
    // formatter (`formatDate`), never a raw ISO slice — the 21 Aug date below
    // is one calendar day past the event's own UTC date for exactly that
    // reason.
    expect(screen.getByText('Closed by Anselma Marak on 21 Aug 2026')).toBeInTheDocument();
    expect(within(stateRow()).getByRole('button', { name: 'Move…' })).toBeDisabled();
    const note = screen.getByText('Closed — reopen it first');
    expect(note.className).toBe('gn-sheet__closed-note');
    expect(note.getAttribute('title')).toBeNull();

    await user.click(within(stateRow()).getByRole('button', { name: 'Reopen' }));
    await waitFor(() => expect(source.ingested).toHaveLength(1));
    const batch = source.ingested[0]!;
    expect(batch).toHaveLength(1);
    expect(batch[0]!.type).toBe('ticket.reopened');
    expect(batch[0]!.payload).toEqual({});
  });

  /** 13.587 — a non-terminal ticket shows neither button. */
  it('13.587 shows neither Close nor Reopen on a non-terminal ticket', async () => {
    renderSheet(ticketRead()); // default fixture: stateId 'doing', category 'active'
    await settled();
    expect(within(stateRow()).queryByRole('button', { name: 'Close' })).toBeNull();
    expect(within(stateRow()).queryByRole('button', { name: 'Reopen' })).toBeNull();
  });

  /**
   * 13.588 — a refused close renders the rule and reason verbatim in the
   * sheet's refusal slot. `TransitionDialog`'s own `serverRefusal` copy is
   * invisible while `moveOpen` is false (`Dialog` returns `null` whenever
   * `open` is false), so this proves the slot Close/Reopen actually render
   * through, not the dialog's unreachable one.
   */
  it('13.588 a refused close renders the rule and reason verbatim', async () => {
    const user = userEvent.setup();
    const read = ticketRead({
      ticket: ticketStateSeed({ stateId: 'done', stateCategory: 'terminal', closed: null }),
    });
    const source = createFakeDataSource(
      {
        getTicket: async () => read,
        getWorkflowDef: async () => WF_ERRAND,
        getMembers: async () => [],
        getTicketHistory: async () => [],
      },
      (events) =>
        events.map((event) => ({
          status: 'refused' as const,
          eventId: event.id,
          rule: 'close-requires-terminal',
          reason: 'A ticket can only be closed from a terminal state; "Done" is not one.',
        })),
    );
    renderSheet(read, source);
    await waitFor(() => expect(within(stateRow()).getByRole('button', { name: 'Close' })).toBeInTheDocument());
    await user.click(within(stateRow()).getByRole('button', { name: 'Close' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(
      'Refused by the server — close-requires-terminal: A ticket can only be closed from a terminal state; "Done" is not one.',
    );
  });

  /**
   * 13.588a — Ruling 32 (fix round 1): the double-submit latch.
   * `closeOrReopen` mirrors `board.tsx`'s `submitDirect` (`:1029-1035`'s own
   * docblock explains why `finally`, not after the `await`): a rapid
   * double-click on Close would otherwise fire two overlapping `ticket.closed`
   * ingests before the first one's `committed`/`refused` answer ever comes
   * back. `Close` (and, symmetrically, `Reopen`) is `disabled={submitting}`
   * for the lifetime of its own ingest and re-enabled once it settles,
   * regardless of outcome — a REJECTED ingest must not leave the button
   * bricked forever, which is exactly what `finally` (vs. resetting only on
   * the happy path) buys.
   */
  it('13.588a Close is disabled while its ingest is in flight, and enabled again once it settles', async () => {
    const user = userEvent.setup();
    const read = ticketRead({
      ticket: ticketStateSeed({ stateId: 'done', stateCategory: 'terminal', closed: null }),
    });
    // A DEFERRED ingest: resolved by hand, below, so the test controls
    // exactly how long "in flight" lasts rather than racing a microtask.
    let resolveIngest!: (results: IngestResult[]) => void;
    const pendingIngest = new Promise<IngestResult[]>((resolve) => {
      resolveIngest = resolve;
    });
    const source = createFakeDataSource(
      {
        getTicket: async () => read,
        getWorkflowDef: async () => WF_ERRAND,
        getMembers: async () => [],
        getTicketHistory: async () => [],
      },
      () => pendingIngest,
    );
    renderSheet(read, source);
    await waitFor(() => expect(within(stateRow()).getByRole('button', { name: 'Close' })).toBeInTheDocument());
    const closeButton = within(stateRow()).getByRole('button', { name: 'Close' });
    expect(closeButton).toBeEnabled();

    await user.click(closeButton);
    await waitFor(() => expect(closeButton).toBeDisabled());
    // Still in flight: a second click must not queue a second ingest.
    await user.click(closeButton);
    expect(source.ingested).toHaveLength(1);

    resolveIngest([
      { status: 'committed', eventId: 'evt_close_1', seq: 99, serverTime: '2026-08-20T09:00:00.000Z' },
    ]);
    await waitFor(() => expect(closeButton).toBeEnabled());
  });

  /**
   * 13.588b — Ruling 33 (fix round 2, 2026-09-17): a REJECTED `ingest` is a
   * transport failure, not a refusal, and gets its OWN slot and sentence —
   * never `serverRefusal`'s "Refused by the server — …", which would claim
   * an adjudication the door/engine never made (Ruling 27, case 13.504,
   * `board.tsx`'s identical distinction). Close re-enables once the rejection
   * settles, same as any other outcome (the `finally` reset doesn't care
   * which branch ran).
   */
  it('13.588b a rejected ingest renders the transport notice, never "Refused by the server", and Close re-enables', async () => {
    const user = userEvent.setup();
    const read = ticketRead({
      ticket: ticketStateSeed({ stateId: 'done', stateCategory: 'terminal', closed: null }),
    });
    const source = createFakeDataSource(
      {
        getTicket: async () => read,
        getWorkflowDef: async () => WF_ERRAND,
        getMembers: async () => [],
        getTicketHistory: async () => [],
      },
      () => {
        throw new Error('socket hung up');
      },
    );
    renderSheet(read, source);
    await waitFor(() => expect(within(stateRow()).getByRole('button', { name: 'Close' })).toBeInTheDocument());
    const closeButton = within(stateRow()).getByRole('button', { name: 'Close' });

    await user.click(closeButton);
    const notice = await screen.findByRole('alert');
    expect(notice.className).toBe('gn-refusal gn-refusal--transport');
    expect(notice).toHaveTextContent('We could not reach the server for this change — socket hung up');
    expect(document.body.textContent).not.toContain('Refused by the server');
    await waitFor(() => expect(closeButton).toBeEnabled());
  });
});
