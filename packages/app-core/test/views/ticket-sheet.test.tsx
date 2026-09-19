import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { IngestResult, WorkflowDef } from '@gisik-nokma/domain';
import { SYSTEM_ACTOR_AUTO_CLOSE } from '@gisik-nokma/domain';
import { createClientStateCache } from '../../src/cache.js';
import { ServingGapError, SERVING_GAPS } from '../../src/online/mappers.js';
import type { AttachmentListEntry } from '../../src/views/attachment-list.js';
import type { EditorSlotComponent } from '../../src/views/editor-slot.js';
import type { ListRow, TicketHistoryEvent, TicketRead } from '../../src/view-types.js';
import { HISTORY_PAGE_LIMIT, TicketSheet } from '../../src/views/ticket-sheet.js';
import { createFakeDataSource } from '../helpers/fake-data-source.js';
import {
  PARENT,
  TICKET,
  WF_ERRAND,
  WS,
  claim,
  listRowSeed,
  ticketStateSeed,
} from '../helpers/seed.js';

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
    // Never assigned unless a case overrides it — `null` is the whole truth for
    // "nobody is assigned" (`read/assigned-provenance.ts`), and a case that wants
    // an assignment claim passes one through `overrides`.
    assignedProvenance: null,
    parent: { kind: 'ticket', id: PARENT, title: 'Registrations' },
    rollup: null,
    ...overrides,
  };
}

function sheetSource(read: TicketRead, history: TicketHistoryEvent[] = [], rows: ListRow[] = []) {
  return createFakeDataSource({
    getTicket: async () => read,
    getWorkflowDef: async () => WF_ERRAND,
    // `role` is present because the shaped read (`RosterMember`, case 13.760)
    // requires one — a roster fixture without it would be a body the server
    // cannot send. The sheet itself reads only the NAME out of this roster.
    getMembers: async () => [
      { id: 'user_kiro', name: 'Kiro', role: 'owner' },
      { id: 'user_anselma', name: 'Anselma Marak', role: 'member' },
    ],
    getTicketHistory: async () => history,
    // Door F: the project's rows, from which the SUBTASKS section derives this
    // ticket's children by `parentId`. Empty by default so every case written
    // before this one keeps the shape it had; a case that wants children passes
    // them, and the sheet's RECONCILIATION is what makes an empty list here a
    // visible disagreement rather than a silent one.
    getTickets: async (projectId) => ({ projectId, rows }),
    // Door G: the workspace TYPE LADDER, read only to put a NAME on the `Type`
    // row. The `task` entry is the one `ticketStateSeed`'s `typeId` names, so
    // the default is a ticket whose type the ladder KNOWS — a case that wants
    // the fallback passes a ladder that does not hold it.
    getTicketTypes: async () => [
      { id: 'task', name: 'Task', icon: 'check', rank: 3, workflowId: 'wf-errand', fields: [] },
      { id: 'epic', name: 'Epic', icon: 'flag', rank: 1, workflowId: 'wf-errand', fields: [] },
    ],
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
    const dueDateRow = screen.getByTestId('field-due');
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
    const dueDateRow = screen.getByTestId('field-due');
    expect(within(dueDateRow).getByText('set by user_kiro on 18 Aug 2026')).toBeInTheDocument();
    expect(screen.getByTestId('field-assignee').textContent).toContain('user_anselma');
    expect(document.body.textContent).not.toContain('system');
  });

  it('PLANTED DEFECT: every field carries a claim line — a value is never a standing property', async () => {
    renderSheet(ticketRead());
    await settled();
    // `dueDate` became `due` in door G: the built-in date now has its own
    // first-class row (`field-due`) instead of riding the generic field loop,
    // which is where `field-dueDate` used to come from. The row is still
    // asserted, through the same claim-line shape.
    //
    // `type` is deliberately NOT in this list and is not an omission: a ticket's
    // type is fixed at creation and is not a CLAIM, so its row carries no claim
    // line. Adding it here would assert the opposite of what the sheet means.
    for (const fieldId of ['title', 'due']) {
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

  it('PLANTED DEFECT: six live reads means six stream subscriptions, all on this workspace', async () => {
    // Ruling P17: `useLiveQuery` keys the SUBSCRIPTION on the workspace and the
    // REFETCH on the query key. SIX reads ride this sheet — ticket, workflow,
    // members, history, and the project's rows from which the SUBTASKS are
    // derived (door F, 2026-09-19) — and each opens its own subscription.
    //
    // **The count was four until door F and the change is deliberate.** This
    // assertion is a planted defect: it exists so that adding a read is a
    // decision somebody makes rather than a side effect. The fifth read is a
    // real cost — a subscription per open sheet — and it is paid because the
    // list read is what makes the subtasks section possible without a route.
    const source = sheetSource(ticketRead());
    renderSheet(ticketRead(), source);
    await settled();
    expect(source.subscriptions).toHaveLength(6);
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

  it('CONTROL (inverted) — the register is EMPTY, so the absences above are CONSTRUCTED rather than read off it', () => {
    for (const method of ['getTicket', 'getWorkflowDef', 'getMembers', 'getTicketHistory']) {
      expect(SERVING_GAPS[method], method).toBeUndefined();
    }
    // **THIS CONTROL'S PRECONDITION IS GONE, and it failed loudly rather than
    // passing vacuously — which is the check working.** It read: *"Non-vacuity:
    // the register is not simply empty. Four methods still refuse, so
    // `toBeUndefined` above is a fact about THESE reads rather than about a
    // register nobody populates any more."* **Four was one, and one is now
    // zero**: `search` was the last entry and the owner ruled its query must
    // derive `matchedIn` (2026-09-19).
    //
    // So `toBeUndefined` is true of EVERY method now, and the assertion above it
    // cannot be rescued by counting. What the case actually rests on is stated
    // instead: **the register is empty, so nothing here could be read off it** —
    // which is exactly why the absences in the case above are CONSTRUCTED, and
    // why a future entry appearing has to be a deliberate act rather than a
    // silent narrowing of what that case proves.
    expect(Object.keys(SERVING_GAPS)).toEqual([]);
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

  /**
   * **13.726 — a ticket the auto-close sweep closed reads "Closed by Auto-close
   * on <date>", and not the raw 26-character actor id.**
   *
   * Spec §8.2 fixes the sentence; this is the surface that renders it. The
   * fixture is 13.586's with the actor swapped and nothing else changed, which
   * is the point: the badge, the Reopen button and the disabled Move… all go
   * through the same `nameOf` → `actorLabel` join, so the system actor needs no
   * special case here and must not acquire one. If the sheet grew its own
   * "if system actor" branch, 13.586 and this case would stop proving that the
   * ONE join handles both.
   *
   * The date is the discriminating 19:00 UTC instant 13.586 chose, so this case
   * would also catch a system-actor branch that formatted its own date.
   */
  it('13.726 a sweep-closed ticket reads "Closed by Auto-close on <date>"', async () => {
    const read = ticketRead({
      ticket: ticketStateSeed({
        stateId: 'done',
        stateCategory: 'terminal',
        // The auto-close sweep's actor, with `actorName: null` exactly as the
        // roster answers for it — nothing in any workspace resolves this id to
        // a person, which is what makes the name come from `actorLabel`'s
        // system lookup rather than from a roster row.
        closed: { actorId: SYSTEM_ACTOR_AUTO_CLOSE, at: '2026-08-20T19:00:00.000Z' },
      }),
    });
    const source = sheetSource(read);
    renderSheet(read, source);
    await waitFor(() =>
      expect(within(stateRow()).getByRole('button', { name: 'Reopen' })).toBeInTheDocument(),
    );
    expect(screen.getByText('Closed by Auto-close on 21 Aug 2026')).toBeInTheDocument();
    // The negative control, in the same render: the id itself is NOT on screen.
    // A badge that fell through to the honesty-contract-1 fallback would print
    // the 26-character id and satisfy a `toContain('Auto-close')`-shaped check
    // only by accident of the constant's own tail.
    expect(screen.queryByText(new RegExp(SYSTEM_ACTOR_AUTO_CLOSE))).toBeNull();
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

  /**
   * 13.588c — Ruling 34 (fix round 3, 2026-09-17): the `result === undefined`
   * branch clears `serverRefusal` too, the same pairing the `catch` branch
   * already carries (case 13.588b). Without it, a REFUSED click followed by a
   * SILENT one leaves the earlier "Refused by the server — …" notice on
   * screen ALONGSIDE the new transport one — two notices for one click's
   * outcome, the older one describing an answer that no longer holds.
   *
   * The fake data source's `ingestScript` is an ordinary closure per call,
   * not a fixed, one-shot script — `createFakeDataSource`'s `ingest` invokes
   * it fresh on every call — so it sequences two different answers across two
   * clicks (`refused`, then an empty `[]` — `results[0]` undefined) with NO
   * change to the test helper.
   */
  it('13.588c a refused click followed by a silent one shows only the transport notice, never both', async () => {
    const user = userEvent.setup();
    const read = ticketRead({
      ticket: ticketStateSeed({ stateId: 'done', stateCategory: 'terminal', closed: null }),
    });
    let calls = 0;
    const source = createFakeDataSource(
      {
        getTicket: async () => read,
        getWorkflowDef: async () => WF_ERRAND,
        getMembers: async () => [],
        getTicketHistory: async () => [],
      },
      (events) => {
        calls += 1;
        if (calls === 1) {
          return events.map((event) => ({
            status: 'refused' as const,
            eventId: event.id,
            rule: 'close-requires-terminal',
            reason: 'A ticket can only be closed from a terminal state; "Done" is not one.',
          }));
        }
        // The second click's answer: silence — no result for the one event
        // submitted, `results[0] === undefined`.
        return [];
      },
    );
    renderSheet(read, source);
    await waitFor(() => expect(within(stateRow()).getByRole('button', { name: 'Close' })).toBeInTheDocument());
    const closeButton = within(stateRow()).getByRole('button', { name: 'Close' });

    await user.click(closeButton);
    const serverNotice = await screen.findByText(/close-requires-terminal/);
    expect(serverNotice.className).toBe('gn-refusal gn-refusal--server');
    await waitFor(() => expect(closeButton).toBeEnabled());

    await user.click(closeButton);
    const transportNotice = await screen.findByText('The server did not answer this change.');
    expect(transportNotice.className).toBe('gn-refusal gn-refusal--transport');
    // The earlier server notice must be GONE, not merely joined by the new one.
    expect(screen.queryByText(/close-requires-terminal/)).toBeNull();
    expect(document.querySelector('.gn-refusal--server')).toBeNull();
    await waitFor(() => expect(closeButton).toBeEnabled());
  });
});

/**
 * **13.968 — the Assignee row is EDITABLE, on the door that already exists.**
 *
 * The owner's ruling: *"assignee should not be read only."* It is a surface on a
 * plane already wired end to end — `ticket.assigned` is projected, read, fanned
 * out, synced and already written by the MCP `assign_ticket` tool — so this case
 * asserts the SHEET's half and nothing about a route: **no new door is added and
 * the submission goes through the ordinary `dataSource.ingest`.**
 *
 * ## Three arms, and each is the one that would otherwise pass for the others
 *
 * 1. **The candidate list already existed.** The dispatch priced this as *"a
 *    picker needs a roster, which is a SEVENTH thing to pass"*; the sheet has
 *    read the roster itself all along, for `nameOf` and for `VisibilityEditor`.
 *    The listbox assertion is what says so.
 * 2. **Unassigning is the SAME event carrying `null`** — there is no
 *    `ticket.unassigned` type (`read/assigned-provenance.ts` enumerates the event
 *    set from the reducer rather than guessing a second one). A picker with no
 *    way back to unassigned cannot express a state the ledger allows, so the
 *    Unassigned option is asserted by the payload it produces.
 * 3. **A REFUSED roster is not an empty one.** This sheet was collapsing both
 *    into `[]` (`members={members.data ?? []}`, with `members.error` read
 *    nowhere), which is the value `page.tsx`'s own docblock names as the defect:
 *    *"never `[]`, which would claim this workspace has no members."* Over a
 *    refused roster an empty picker asserts that nobody can be assigned.
 */
describe('13.968 the Assignee row is editable, and a refused roster is not an empty one', () => {
  async function openAssigneeList(): Promise<HTMLElement> {
    const row = screen.getByTestId('field-assignee');
    await userEvent.click(within(row).getByRole('button'));
    return screen.findByRole('listbox');
  }

  it('offers the roster the sheet ALREADY reads, plus an explicit Unassigned', async () => {
    renderSheet(ticketRead());
    await settled();
    const row = screen.getByTestId('field-assignee');
    // The control STATES the current value rather than showing a placeholder —
    // the same rule the members page's role control settled (`select.tsx:255`
    // renders the placeholder when the value matches no option).
    expect(within(row).getByRole('button')).toHaveTextContent('Anselma Marak');
    const listbox = await openAssigneeList();
    expect(within(listbox).getAllByRole('option').map((option) => option.textContent)).toEqual([
      'Unassigned',
      'Kiro',
      'Anselma Marak',
    ]);
  });

  it('submits `ticket.assigned` with the chosen id, through the ordinary ingest door', async () => {
    const source = renderSheet(ticketRead());
    await settled();
    await userEvent.click(
      within(await openAssigneeList()).getByRole('option', { name: 'Kiro' }),
    );
    await waitFor(() => expect(source.ingested).toHaveLength(1));
    expect(source.ingested[0]![0]).toMatchObject({
      type: 'ticket.assigned',
      payload: { assigneeId: 'user_kiro' },
    });
  });

  it('UNASSIGNING is the same event carrying `null`, not a second path', async () => {
    const source = renderSheet(ticketRead());
    await settled();
    await userEvent.click(
      within(await openAssigneeList()).getByRole('option', { name: 'Unassigned' }),
    );
    await waitFor(() => expect(source.ingested).toHaveLength(1));
    // `toEqual` and not `toMatchObject`: the payload must be EXACTLY this, so a
    // control that sent `{assigneeId: ''}` or dropped the key would be a
    // different event and would fail here.
    expect(source.ingested[0]![0]!.payload).toEqual({ assigneeId: null });
  });

  it('a REFUSED roster renders a refusal, never an empty list that claims nobody can be assigned', async () => {
    const read = ticketRead();
    const refused = createFakeDataSource({
      getTicket: async () => read,
      getWorkflowDef: async () => WF_ERRAND,
      getMembers: async () => {
        throw new Error('the roster door refused this caller');
      },
      getTicketHistory: async () => [],
    });
    renderSheet(read, refused);
    await settled();
    const row = screen.getByTestId('field-assignee');
    // NO control at all — and the absence is the assertion, because a picker
    // holding only "Unassigned" would be a control that lies about the world.
    expect(within(row).queryByRole('button')).toBeNull();
    expect(within(row).getByText(/roster could not be loaded/i)).toBeInTheDocument();
  });

  it('names who assigned the ticket, in the sibling rows’ own shape', async () => {
    renderSheet(
      ticketRead({
        assignedProvenance: {
          actorId: 'user_kiro',
          actorName: 'Kiro',
          clientTime: '2026-08-19T09:58:12.000Z',
          serverTime: '2026-08-19T10:00:00.000Z',
        },
      }),
    );
    await settled();
    expect(
      within(screen.getByTestId('field-assignee')).getByText('set by Kiro on 19 Aug 2026'),
    ).toBeInTheDocument();
  });
});

/**
 * **13.989 — the description is EDITABLE, on the door that already exists.**
 *
 * The owner's ruling: *"description should be editable."* The dispatch named
 * the cause as a missing prop — *"the editor never mounts at all … the answer
 * is a missing prop at the call site"* — and that is HALF of it. Measuring the
 * reducer rather than the sheet found the other half, and it is the half that
 * would have made the fix look done while changing almost nothing:
 *
 *   `ticket.created` writes `fields: { title: claim(p.title, env) }` and
 *   NOTHING else (`packages/domain/src/ticket-state.ts:150`), and nothing else
 *   writes a description except an explicit `ticket.field_set`. The row lived
 *   INSIDE the `Object.entries(state.fields)` loop, so on every ticket nobody
 *   had described there was no row for an editor to mount into.
 *
 * So these arms pin the row's EXISTENCE, not just its editability. `ticketRead()`
 * carries title and dueDate and no description — a fresh ticket's exact shape —
 * and the first arm asserts that shape before asserting anything about it.
 *
 * ## Why the slot here is a FAKE, and where the real one is proven
 *
 * `packages/editor` is not a dependency of `packages/app-core` and must not
 * become one (amendment 12 keeps ProseMirror JSON opaque outside it), so the
 * real `TicketEditorSlot` is unreachable from this file by design. The seam is
 * `EditorSlotComponent`, and what is under test is the SHEET's half of it. The
 * real component's the other half — its assignability to that contract, and the
 * end-to-end mount the editor package recorded as OWED — is proven in
 * `apps/web`, the one app that depends on both.
 */
describe('13.989 the description is editable, on the door that already exists', () => {
  /**
   * A stand-in composer. It reports the `readOnly` it was handed — the sheet's
   * only observable claim about editability — and can either submit a real
   * description claim or surface an editor-side failure.
   */
  /**
   * A ticket SOMEBODY HAS ALREADY DESCRIBED — the other side of the row's two
   * arms. Shared by the two cases that need the claim present, so neither can
   * drift into asserting against a fixture the other does not have.
   */
  function withDescription(): TicketRead {
    return ticketRead({
      ticket: ticketStateSeed({
        fields: {
          title: {
            value: 'File the GST return',
            actorId: 'user_kiro',
            clientTime: '2026-08-18T07:59:00.000Z',
            serverTime: '2026-08-18T08:00:00.000Z',
          },
          description: {
            value: { type: 'doc', content: [] },
            actorId: 'user_anselma',
            clientTime: '2026-08-18T08:04:00.000Z',
            serverTime: '2026-08-18T08:05:00.000Z',
          },
        },
      }),
    });
  }

  function fakeEditorSlot(seen: { readOnly: boolean[] }): EditorSlotComponent {
    return function FakeEditorSlot(props) {
      seen.readOnly.push(props.readOnly);
      return (
        <div data-testid="fake-editor">
          <button
            type="button"
            onClick={() =>
              void props.submit?.({
                type: 'ticket.field_set',
                payload: { fieldId: 'description', value: { type: 'doc', content: [] } },
              })
            }
          >
            Save description
          </button>
          <button
            type="button"
            onClick={() => props.onError?.(new Error('Attachments are unavailable here.'))}
          >
            Paste an image
          </button>
        </div>
      );
    };
  }

  it('draws the row, and mounts the editor, on a ticket that has NEVER carried a claim', async () => {
    // The control for the whole case: the fixture really is a fresh ticket, so
    // the arm below is not passing because a description claim happened to be
    // lying around.
    expect(ticketRead().ticket.fields['description']).toBeUndefined();

    const seen = { readOnly: [] as boolean[] };
    renderSheet(ticketRead(), undefined, { editorSlot: fakeEditorSlot(seen) });
    await settled();

    const row = screen.getByTestId('field-description');
    expect(within(row).getByTestId('fake-editor')).toBeInTheDocument();
    // Handed an EDITABLE flag — the row is not read-only-by-default any more.
    //
    // Asserted as a PROPERTY and not as a render count, which is the first
    // thing this arm got wrong: a function component re-runs on every pass, so
    // the observer sees one entry per render and `toEqual([false])` failed with
    // `[false, false]` while the code was right. A count here would also have
    // been keyed to how many times React happened to re-render — the number
    // moves for reasons that have nothing to do with editability.
    expect(seen.readOnly.length).toBeGreaterThan(0);
    expect(seen.readOnly).not.toContain(true);
    // And the claim line states the truth about a field nobody has claimed,
    // rather than inventing an actor for it.
    expect(within(row).getByText('no description yet')).toBeInTheDocument();
  });

  it('draws the row ONCE — the field loop does not render a second one', async () => {
    // ⚠ THIS FIXTURE MUST CARRY A DESCRIPTION CLAIM, and the first draft of this
    // arm did not. With only `title`/`dueDate` in `fields`, the loop below never
    // sees a `description` key, the dedup guard is never reached, and
    // `toHaveLength(1)` passes whether the guard is there or not — a check that
    // cannot fail, on the one property it was written to name. Measured by
    // deleting the guard from the component: this arm stayed GREEN and a
    // different arm caught it, incidentally, on a duplicate-testid error.
    renderSheet(withDescription(), undefined, { editorSlot: fakeEditorSlot({ readOnly: [] }) });
    await settled();
    expect(screen.getAllByTestId('field-description')).toHaveLength(1);
    expect(screen.getAllByTestId('fake-editor')).toHaveLength(1);
  });

  it('submits `ticket.field_set` for the description, through the ordinary ingest door', async () => {
    const source = renderSheet(ticketRead(), undefined, {
      editorSlot: fakeEditorSlot({ readOnly: [] }),
    });
    await settled();
    await userEvent.click(screen.getByRole('button', { name: 'Save description' }));
    await waitFor(() => expect(source.ingested).toHaveLength(1));
    // `toEqual` on the payload, not `toMatchObject`: the envelope must carry
    // EXACTLY the editor's composition, so a sheet that re-spelled the fieldId
    // or dropped `value` would be a different claim and would fail here.
    expect(source.ingested[0]![0]!.type).toBe('ticket.field_set');
    expect(source.ingested[0]![0]!.payload).toEqual({
      fieldId: 'description',
      value: { type: 'doc', content: [] },
    });
  });

  it('moves the claim line onto the actor who wrote it', async () => {
    renderSheet(withDescription(), undefined, { editorSlot: fakeEditorSlot({ readOnly: [] }) });
    await settled();
    expect(
      within(screen.getByTestId('field-description')).getByText(
        'set by Anselma Marak on 18 Aug 2026',
      ),
    ).toBeInTheDocument();
  });

  it('with NO editorSlot the fallback renders — and offers nothing to type into', async () => {
    renderSheet(ticketRead());
    await settled();
    const row = screen.getByTestId('field-description');
    // The fallback is CORRECT BEHAVIOUR for a build that wired no editor; it is
    // not the defect. The defect was that the real one was never available. The
    // absence of a control is the assertion — a build with no composer must not
    // offer one that silently discards what is typed.
    expect(within(row).queryByTestId('fake-editor')).toBeNull();
    expect(within(row).queryByRole('button')).toBeNull();
    // It still states the absence, and still tells the truth about the claim.
    expect(within(row).getByText('No description yet')).toBeInTheDocument();
    expect(within(row).getByText('no description yet')).toBeInTheDocument();
  });

  it('a SUCCESSFUL save clears the editor-error slot, so the sheet never asserts a failure that is over', async () => {
    const source = renderSheet(ticketRead(), undefined, {
      editorSlot: fakeEditorSlot({ readOnly: [] }),
    });
    await settled();
    await userEvent.click(screen.getByRole('button', { name: 'Paste an image' }));
    expect(await screen.findByText('Attachments are unavailable here.')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Save description' }));
    await waitFor(() => expect(source.ingested).toHaveLength(1));
    // The other two slots clear on `committed`; the third must too, or a save
    // that just succeeded leaves the sheet asserting a current failure. Caught
    // by independent review: this slot was set and rendered but never cleared.
    await waitFor(() =>
      expect(screen.queryByText('Attachments are unavailable here.')).toBeNull(),
    );
  });

  it("the editor's own failure reaches an alert, and is never swallowed", async () => {
    renderSheet(ticketRead(), undefined, { editorSlot: fakeEditorSlot({ readOnly: [] }) });
    await settled();
    expect(screen.queryByText('Attachments are unavailable here.')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Paste an image' }));
    // Nothing was sent to the server, so neither the server-refusal sentence nor
    // the transport one is true of it — it gets its own slot and its own tone.
    expect(await screen.findByText('Attachments are unavailable here.')).toBeInTheDocument();
    expect(screen.queryByText(/Refused by the server/)).toBeNull();
  });
});

/**
 * Door F, 2026-09-19 — THE SUBTASKS SECTION. Cases `16.15`–`16.22`.
 *
 * **The section's whole claim is that a subtask is a ticket of its own**, which
 * the empty state says in words and the list has to say in structure: each child
 * carries its OWN state. That is why the fixture's children are given DIFFERENT
 * states — a section that printed the parent's state on every row would pass a
 * one-child fixture completely.
 *
 * **And the case that matters most is `16.17`.** The children are DERIVED from
 * the list read rather than served by a route, so the failure this section could
 * hide is a silently short list. The server already sends the count, so the
 * derivation is reconciled against it every render — and `16.17` is the case
 * that makes the reconciliation falsifiable rather than decorative.
 */
describe('F — the subtasks section', () => {
  const child = (over: Partial<ListRow> = {}): ListRow =>
    listRowSeed({ parentId: TICKET, ...over });

  it('16.15 lists this ticket’s children, each with its OWN state', async () => {
    const read = ticketRead({ rollup: { totalChildren: 2, terminalChildren: 1, restrictedCount: 0 } });
    const source = sheetSource(read, [], [
      child({ ticketId: 'tkt-s1', title: 'Order the brochures', stateName: 'To do' }),
      child({ ticketId: 'tkt-s2', title: 'Book the venue', stateName: 'Done' }),
    ]);
    renderSheet(read, source);
    await settled();

    const section = await screen.findByTestId('sheet-subtasks');
    expect(within(section).getByText('Order the brochures')).toBeInTheDocument();
    // The SECOND child's OWN state, not a repeat of the first's — the property
    // "a subtask is a ticket of its own", asserted rather than described.
    expect(within(section).getByText('Done')).toBeInTheDocument();
    expect(within(section).getByText('To do')).toBeInTheDocument();

    // AND THE ROW READ AS A ROW — the half this case was missing, which is why
    // the defect below reached a browser instead of stopping here.
    //
    // The two assertions above query each SPAN's own text, so both pass while
    // the row renders `Order the brochuresTo do`: adjacent inline spans with no
    // text between them are one run of glyphs on screen and in the accessible
    // name, and NOTHING above this line reads the row as anything but two
    // independent strings. The controller's browser pass found it on 2026-09-20
    // ("HSN codes for the real catalogueWaiting"). Found by a person looking at
    // a rendered page because a jsdom case cannot look at one: no stylesheet and
    // no layout engine, so `textContent` is the strongest claim a unit case can
    // make about what a reader sees — and it is strong enough for THIS defect,
    // where the missing thing is a character rather than a pixel.
    expect(within(section).getByTestId('subtask-tkt-s1').textContent).toBe('Order the brochures · To do');
    expect(within(section).getByTestId('subtask-tkt-s2').textContent).toBe('Book the venue · Done');
  });

  it('16.16 says what a subtask IS when there are none', async () => {
    // `rollup: null` is the server's own spelling for "no children at all"
    // (`ticket-cards.ts`), so this is the genuine empty case and not a read that
    // failed to answer.
    const read = ticketRead({ rollup: null });
    renderSheet(read, sheetSource(read, [], []));
    await settled();

    // The prototype's sentence, verbatim — and it is a claim about the MODEL,
    // which `16.15` above is what makes true.
    expect(await screen.findByTestId('sheet-subtasks-empty')).toHaveTextContent(
      'No subtasks. A subtask is a ticket of its own — it gets a state, an assignee, a date and a history.',
    );
  });

  it('16.17 REFUSES TO RENDER A SHORT LIST — the rollup counts more than could be read', async () => {
    // THE RECONCILIATION. The server says two children are visible; the derived
    // read produced one. That is the silently-short-list failure, and the
    // section must SAY so rather than draw the one row it has.
    const read = ticketRead({ rollup: { totalChildren: 2, terminalChildren: 0, restrictedCount: 0 } });
    const source = sheetSource(read, [], [child({ ticketId: 'tkt-only', title: 'The only one read' })]);
    renderSheet(read, source);
    await settled();

    const refusal = await screen.findByTestId('sheet-subtasks-incomplete');
    expect(refusal).toHaveTextContent('The server counts 2 subtasks you can see, and 1 could be read');
    // AND THE SHORT LIST IS NOT DRAWN. Asserting only the refusal would pass
    // against a section that showed both — the failure mode is a row nobody
    // should be able to read while the count says otherwise.
    expect(screen.queryByText('The only one read')).toBeNull();
    expect(screen.queryByTestId('sheet-subtasks-empty')).toBeNull();
  });

  it('16.18 does NOT draw the list when the read is complete — the control for 16.17', async () => {
    // The same fixture with the count AGREEING. Without this, `16.17` would pass
    // against a section that refused everything, and the reconciliation would
    // look correct while making the section useless.
    const read = ticketRead({ rollup: { totalChildren: 1, terminalChildren: 0, restrictedCount: 0 } });
    const source = sheetSource(read, [], [child({ ticketId: 'tkt-ok', title: 'The only one' })]);
    renderSheet(read, source);
    await settled();

    expect(screen.queryByTestId('sheet-subtasks-incomplete')).toBeNull();
    expect(await screen.findByText('The only one')).toBeInTheDocument();
  });

  it('16.19 lists ONLY this ticket’s children — a sibling’s child is not one of them', async () => {
    const read = ticketRead({ rollup: { totalChildren: 1, terminalChildren: 0, restrictedCount: 0 } });
    const source = sheetSource(read, [], [
      child({ ticketId: 'tkt-mine', title: 'Mine' }),
      // Same project, a DIFFERENT parent. The filter is `parentId === ticketId`,
      // so this must not appear — a section that listed the project's rows would
      // look identical on a one-child fixture.
      child({ ticketId: 'tkt-theirs', parentId: PARENT, title: 'Somebody else’s' }),
    ]);
    renderSheet(read, source);
    await settled();

    expect(await screen.findByText('Mine')).toBeInTheDocument();
    expect(screen.queryByText('Somebody else’s')).toBeNull();
  });

  it('16.20 Add subtask sends ticket.created with THIS ticket as parent, the title AS TYPED, and start focus', async () => {
    const read = ticketRead({ rollup: null });
    const source = sheetSource(read, [], []);
    renderSheet(read, source);
    await settled();

    await userEvent.type(screen.getByTestId('sheet-subtask-title'), '  Book the venue  ');
    await userEvent.click(screen.getByTestId('sheet-subtask-add'));

    await waitFor(() => expect(source.ingested).toHaveLength(1));
    const event = source.ingested[0]![0]!;
    expect(event.type).toBe('ticket.created');
    expect(event.payload).toEqual({
      typeId: expect.any(String) as unknown as string,
      projectId: expect.any(String) as unknown as string,
      // THE PARENT, which is the whole of "a subtask".
      parentId: TICKET,
      // AS TYPED, spaces and all: the schema refuses a blank, and a client that
      // trimmed would make that refusal unreachable while rewriting the words.
      title: '  Book the venue  ',
      // The prototype births a subtask in the workflow's FIRST state
      // (`col: states[0].key`), which is this model's `'focus'` — sent ALWAYS,
      // never left to the wire's absence-means-focus fallback.
      start: 'focus',
    });
  });

  it('16.21 a refused title shows the SERVER’s sentence and KEEPS what was typed', async () => {
    const read = ticketRead({ rollup: null });
    const source = sheetSource(read, [], []);
    source.ingest = async (events) => {
      source.ingested.push(events);
      return events.map((event) => ({
        status: 'invalid' as const,
        eventId: event.id,
        // `invalid-payload` — HYPHEN, matching `EnvelopeErrorCode`
        // (`parse-event.ts:11`). The first draft wrote `invalid_payload` and
        // typecheck refused it: an `as const` on a member that does not exist
        // asserts the shape rather than checking it.
        code: 'invalid-payload' as const,
        message: 'must not be blank — a title of only spaces names nothing',
      }));
    };
    renderSheet(read, source);
    await settled();

    await userEvent.type(screen.getByTestId('sheet-subtask-title'), '   ');
    await userEvent.click(screen.getByTestId('sheet-subtask-add'));

    const refusal = await screen.findByTestId('sheet-subtask-refusal');
    // The server's own words, presented — not a paraphrase of a refusal it did
    // not send. An `invalid` answer carries `message`, NOT `reason`, and reading
    // the wrong arm would render `undefined` here.
    expect(refusal).toHaveTextContent('must not be blank');
    expect(refusal).not.toHaveTextContent('undefined');
    // KEPT, so a fixable refusal does not make the person retype it.
    expect(screen.getByTestId('sheet-subtask-title')).toHaveValue('   ');
  });

  it('16.22 DRAWS the prototype’s `Subtask of {parent}` chip — the absence it asserted is now a decision', async () => {
    // FLIPPED 2026-09-20, NOT deleted. Until then this case asserted the chip's
    // ABSENCE (`desktop.dc.html:1240`) so that adding it later would be a
    // decision rather than a drift; the owner ruled it IN and the same id now
    // records the decision, which is the whole reason it existed in that form.
    // The fixture is unchanged — still a child (its parent is set), which is the
    // input the chip exists for.
    const read = ticketRead({
      parent: { kind: 'ticket', id: PARENT, title: 'Registrations' },
      rollup: null,
    });
    renderSheet(read, sheetSource(read, [], []));
    await settled();

    await screen.findByTestId('sheet-subtasks');
    expect(screen.getByTestId('sheet-parent-chip')).toHaveTextContent('Subtask of Registrations');

    // AND THE OTHER ARM, which is the same property rather than a second one:
    // the chip is drawn EXACTLY when there is a parent to name. The prototype's
    // own test does this in one expression (`sheetIsSub: !!(sheet &&
    // sheet.parentId)`, `:3605`), and asserting only the child arm would leave a
    // chip drawn for a ROOT ticket unconstrained — it would name nobody while
    // the sheet's own parent row, eight lines above, says `At project root`.
    const root = ticketRead({ parent: null });
    cleanup();
    renderSheet(root, sheetSource(root, [], []));
    await settled();
    await screen.findByTestId('sheet-subtasks');
    expect(screen.queryByTestId('sheet-parent-chip')).toBeNull();
    expect(screen.queryByTestId('sheet-parent-chip-restricted')).toBeNull();
  });
});

/**
 * THE `Subtask of {parent}` CHIP, 2026-09-20 — cases `16.38`–`16.40`.
 *
 * Door F's inverse: F lists a ticket's CHILDREN, and this names a ticket's
 * PARENT and offers the way to it (`desktop.dc.html@6d7b67c0a52c:1237-1241`).
 * The prototype draws it beside the section heading and only for a ticket that
 * is itself a subtask (`sheetIsSub`, `:3605`).
 *
 * **The restricted arm is the one that took a ruling**, and the ruling is what
 * `16.40` measures. `ParentRef` is a discriminated union whose restricted arm
 * structurally cannot carry a title (`apps/server/src/routes/tickets.ts:144-168`),
 * and the parent's title is read INSIDE the `canSee` branch that arm never
 * reaches (`:353-372`) — the authorities are `7.212` and `6.14`, which pin the
 * existence-versus-title contrast in both directions. **This paragraph cited
 * 6.66's "no table stores a ticket title", true when 6.66 was written and stale
 * now that `proj_tickets` exists; the conclusion never rested on it.** The
 * prototype's own label fallback — `p ? p.title : sheet.parentId` (`:3609`) —
 * would print an ID where a name belongs. So the arm names the RESTRICTION
 * instead of the ticket, as a pill and never a control.
 */
describe('the `Subtask of {parent}` chip', () => {
  it('16.38 names the parent and opens it — and is a control ONLY when it can be honoured', async () => {
    const onOpenTicket = vi.fn();
    const read = ticketRead();
    renderSheet(read, sheetSource(read, [], []), { onOpenTicket });
    await settled();

    const chip = await screen.findByTestId('sheet-parent-chip');
    // The prototype's own label with its own operand (`:1240` literal,
    // `sheetParentTitle` at `:3606` — the parent's TITLE, not its id).
    expect(chip.textContent).toBe('Subtask of Registrations');
    expect(chip.tagName).toBe('BUTTON');

    await userEvent.click(chip);
    // The IMMEDIATE parent's id: not this ticket's own, which is the mistake a
    // chip that remembered where it stood instead of what it names would make.
    expect(onOpenTicket).toHaveBeenCalledTimes(1);
    expect(onOpenTicket).toHaveBeenCalledWith(PARENT);

    // THE SECOND ARM IS INSIDE THIS CASE, not beside it under the same id.
    // Two `it`s sharing one id is invisible to `check-case-ids` — it counts id
    // LINES in the catalogue, and the catalogue lists `16.38` once — so that
    // collision would have been found by a reader, never by a guard. One case,
    // one id, one `it`: the SAME read and the SAME label with one prop absent,
    // which is the arm a caller that cannot navigate gets. It is deliberately
    // still the name, and not a button that would do nothing when pressed.
    cleanup();
    renderSheet(read, sheetSource(read, [], []));
    await settled();
    const pill = await screen.findByTestId('sheet-parent-chip');
    expect(pill.textContent).toBe('Subtask of Registrations');
    expect(pill.tagName).toBe('SPAN');
  });

  it('16.39 is ONE HOP — it names the immediate parent and never a chain', async () => {
    // The prototype draws the chip on ANY subtask and its `openParent` swaps
    // the OPEN SHEET in place (`:3611`), so a chain is walked one sheet per
    // click and no traversal lives in the chip to loop. Asserted as an EXACT
    // label rather than a substring: a chain would have to append a second
    // name to it, and there is exactly one chip on the page to do it with.
    const read = ticketRead({ parent: { kind: 'ticket', id: PARENT, title: 'Registrations' } });
    renderSheet(read, sheetSource(read, [], []), { onOpenTicket: vi.fn() });
    await settled();

    const chips = await screen.findAllByTestId('sheet-parent-chip');
    expect(chips).toHaveLength(1);
    expect(chips[0]?.textContent).toBe('Subtask of Registrations');
  });

  it('16.40 a restricted parent wears a NON-CONTROL pill — the restriction named, the ticket not', async () => {
    const onOpenTicket = vi.fn();
    const read = ticketRead({ parent: { kind: 'restricted', id: 'secret-parent' } });
    renderSheet(read, sheetSource(read, [], []), { onOpenTicket });
    await settled();

    const pill = await screen.findByTestId('sheet-parent-chip-restricted');
    expect(pill.textContent).toBe('Subtask of a restricted parent');
    // NOT a control: the restricted arm carries no project and no title, so
    // there is nothing to open and nothing to name — and case 6.14 asserts a
    // direct read of that parent 404s.
    expect(pill.tagName).toBe('SPAN');
    // The arm EXISTS rather than being omitted, and that is the ruling's second
    // half: an absent chip reads as "no parent", which is a different claim
    // from "a parent you may not see" — the same distinction `16.22`'s sibling
    // cases draw between a restricted parent and `At project root`.
    expect(screen.queryByText('At project root')).toBeNull();
    // The id the read DID send is not rendered here. 3.73 owns this property on
    // the sheet's own parent row; asserted again because this chip is a SECOND
    // surface for the same fact, and a second surface is where a leak recurs.
    expect(document.body.textContent).not.toContain('secret-parent');
    expect(onOpenTicket).not.toHaveBeenCalled();
  });
});

/**
 * Door G, 2026-09-19 — PRIORITY, DUE and TYPE as first-class rows. Cases
 * `16.23`–`16.30`.
 *
 * **The three are NOT the same kind of thing, and that is the point of the
 * task.** Type is a domain concept; Due is a domain concept AND a built-in
 * field; Priority has **no domain concept at all** and is a custom-field
 * convention. A section that drew all three as though they were alike would be
 * the defect the dispatch names — *"a difference in what the sheet CLAIMS TO
 * BE, not just layout"*.
 *
 * **And two of the prototype's three are EDITORS there, which is a separate
 * door.** `16.29` asserts the READ-ONLY half so that making them editable later
 * is a decision rather than a drift — the same shape as F's `16.22`.
 */
/**
 * SHEET PROTOTYPE PARITY, 2026-09-20 — cases `16.81`–`16.99`.
 *
 * Owner: *"make our build like the prototype."* **The authority is
 * `design-system/interactive/desktop.dc.html`** — NOT
 * `design-system/prototypes/TicketSheet.dc.html`, which nothing in the repo cites
 * and which matches our build much more closely, so comparing against it
 * concludes "we are nearly there".
 *
 * **Every comparison is style-matched.** The prototype is drawn in the flat
 * language, so `data-style="hig"` comes first; at the app's default (`neo`) our
 * screens are neumorphic and appear to be a different design entirely. This suite
 * cannot see styles at all — jsdom loads no stylesheet and has no layout engine —
 * so what it asserts is STRUCTURE and ROLES. The visual half is the viewport
 * run's, which is part of this task rather than an extra.
 */
describe('sheet prototype parity', () => {
  it('16.81 the sections are ONE segmented control — the tablist roles kept, and a NAME it never had', async () => {
    const read = ticketRead();
    renderSheet(read, sheetSource(read, [], []));
    await settled();

    // The authority draws the three tabs as one segmented control
    // (`desktop.dc.html@6d7b67c0a52c:1134-1140`); this build drew two bordered
    // buttons. The swap is onto the SHARED `SegmentedControl`, whose docblock
    // says it exists to replace exactly those bordered buttons.
    const tablist = screen.getByRole('tablist', { name: 'Ticket sections' });
    const tabs = within(tablist).getAllByRole('tab');
    expect(tabs.map((t) => t.textContent)).toEqual(['Details', 'History']);

    // TWO, and the count is an assertion rather than a description: the
    // authority's third tab is `Attachments` (`:3589`), which is a READ behind a
    // surface. Drawing it here would be inventing a tab the dispatch says to ask
    // about, so its ABSENCE is pinned until that question is answered.
    expect(tabs).toHaveLength(2);

    // ⚠ The name is NEW. `role="tablist"` on this sheet carried no accessible
    // name at all before this change, and the shared component REQUIRES one — so
    // this is a ratchet RISE (13.285/13.287), which is the allowed direction, and
    // it is asserted so a future rename cannot pass as the same thing.
    expect(tablist).toHaveAccessibleName('Ticket sections');

    // And the control still WORKS: `aria-selected` moves with the click, which
    // is the property the two buttons carried and the component has to keep.
    expect(within(tablist).getByRole('tab', { selected: true })).toHaveTextContent('Details');
    await userEvent.click(within(tablist).getByRole('tab', { name: 'History' }));
    expect(within(tablist).getByRole('tab', { selected: true })).toHaveTextContent('History');
  });

  it('16.82 Full screen moves the SCRIM, the PANEL and the BODY together — and says which way it goes', async () => {
    const read = ticketRead();
    renderSheet(read, sheetSource(read, [], []));
    await settled();

    // The authority's control (`desktop.dc.html@6d7b67c0a52c:1119-1120`) is a
    // pill carrying a LABEL as well as an icon, and the label is the whole point:
    // a control that only says "Full screen" while it is already full screen is
    // one a person cannot tell the way out of.
    const enter = screen.getByRole('button', { name: 'Full screen' });
    expect(enter).toHaveTextContent('Full screen');

    // THE THREE PARTS MOVE TOGETHER, and that is the property this case exists
    // for rather than three separate assertions: the prototype's own treatment
    // (`:3396-3400`) changes the scrim's fill, the panel's geometry AND the
    // body's cap. A "full screen" that did one or two of them is a panel that
    // grew while the page behind it stayed visible — the half-done version this
    // repo would otherwise ship, because each part alone looks plausible.
    const scrim = screen.getByTestId('sheet-scrim');
    const panel = scrim.querySelector('.gn-sheet');
    const body = scrim.querySelector('.gn-sheet__body');
    expect(scrim.className).not.toContain('--full');
    expect(panel?.className).not.toContain('--full');
    expect(body?.className).not.toContain('--full');

    await userEvent.click(enter);

    // The label turns around...
    const exit = screen.getByRole('button', { name: 'Exit full screen' });
    expect(exit).toHaveTextContent('Exit full screen');
    // ...and so does every part of the sheet.
    expect(screen.getByTestId('sheet-scrim').className).toContain('gn-sheet__scrim--full');
    expect(screen.getByTestId('sheet-scrim').querySelector('.gn-sheet')?.className).toContain(
      'gn-sheet--full',
    );
    expect(
      screen.getByTestId('sheet-scrim').querySelector('.gn-sheet__body')?.className,
    ).toContain('gn-sheet__body--full');

    // And it goes BACK: a one-way control would strand the reader in a mode the
    // prototype explicitly offers a way out of.
    await userEvent.click(screen.getByRole('button', { name: 'Exit full screen' }));
    expect(screen.getByRole('button', { name: 'Full screen' })).toBeInTheDocument();
    expect(screen.getByTestId('sheet-scrim').className).not.toContain('--full');
  });
});

describe('G — Priority, Due and Type as rows', () => {
  /** A ticket claiming NOTHING, so every absence copy is exercised. */
  const bare = (): TicketRead => ticketRead({ ticket: ticketStateSeed({ fields: {} }) });

  it('16.23 draws all three ALWAYS, even on a ticket that claims none of them', async () => {
    renderSheet(bare());
    await settled();

    // The claim is the ALWAYS: `title` is absent from this fixture too, and a
    // section that only drew fields the ticket happens to carry would show no
    // Priority and no Due at all — which is the state this task exists to end.
    expect(screen.getByTestId('field-priority')).toBeInTheDocument();
    expect(screen.getByTestId('field-due')).toBeInTheDocument();
    expect(screen.getByTestId('field-type')).toBeInTheDocument();
    // Each says what is TRUE of the absence, in its own words: the date
    // sentence is the prototype's own, transcribed.
    expect(within(screen.getByTestId('field-due')).getByText('No date claimed')).toBeInTheDocument();
    expect(
      within(screen.getByTestId('field-priority')).getByText('No priority claimed'),
    ).toBeInTheDocument();
  });

  it('16.24 Due renders the claimed day AND its claim line — both halves', async () => {
    renderSheet(ticketRead());
    await settled();

    const row = screen.getByTestId('field-due');
    // BOTH, in one case: a row that drew the day without the claim would be a
    // standing property rather than a claim, which is the rule every other row
    // on this sheet keeps.
    expect(within(row).getByText('30 Aug 2026')).toBeInTheDocument();
    expect(within(row).getByText('set by Kiro on 18 Aug 2026')).toBeInTheDocument();
    // And the absence copy is NOT present, so the two arms are distinguished.
    expect(within(row).queryByText('No date claimed')).toBeNull();
  });

  it('16.25 Type renders the NAME from the workspace ladder', async () => {
    renderSheet(ticketRead());
    await settled();

    // The ticket carries `typeId: 'task'`; the ladder carries `task -> Task`.
    // A row that printed the ID would be technically true and useless.
    expect(within(screen.getByTestId('field-type')).getByText('Task')).toBeInTheDocument();
  });

  it('16.26 Type falls back to the ID when the ladder does not hold it — the control for 16.25', async () => {
    // Without this, `16.25` would pass against a row that hard-coded 'Task',
    // and the fallback — which is what a stale or partial ladder actually
    // produces — would never be exercised.
    const read = ticketRead();
    const source = sheetSource(read);
    source.query.getTicketTypes = async () => [];
    renderSheet(read, source);
    await settled();

    expect(within(screen.getByTestId('field-type')).getByText('task')).toBeInTheDocument();
  });

  it('16.27 Priority renders the claim when the ticket carries one — it is a CONVENTION, not a built-in', async () => {
    // Priority has no domain concept: it exists only because a type declared
    // such a field. So the claimed case is reached by the ticket carrying the
    // field, exactly as a custom field would.
    const read = ticketRead({
      ticket: ticketStateSeed({
        fields: {
          ...ticketRead().ticket.fields,
          priority: {
            value: 'P1',
            actorId: 'user_anselma',
            clientTime: '2026-08-18T08:06:00.000Z',
            serverTime: '2026-08-18T08:07:00.000Z',
          },
        },
      }),
    });
    renderSheet(read);
    await settled();

    const row = screen.getByTestId('field-priority');
    expect(within(row).getByText('P1')).toBeInTheDocument();
    expect(within(row).getByText('set by Anselma Marak on 18 Aug 2026')).toBeInTheDocument();
    expect(within(row).queryByText('No priority claimed')).toBeNull();
  });

  it('16.28 draws NO second row for a field that now has its own — the exclusion', async () => {
    // `ticketRead()` carries `dueDate` in `state.fields`, which the generic
    // field loop used to render as `field-dueDate`. It now has its own row, so
    // the loop must SKIP it — otherwise the sheet shows two rows for one claim.
    renderSheet(ticketRead());
    await settled();

    expect(screen.getByTestId('field-due')).toBeInTheDocument();
    expect(screen.queryByTestId('field-dueDate')).toBeNull();
    // And one node, not two: the date appears exactly once on the sheet.
    expect(screen.getAllByText('30 Aug 2026')).toHaveLength(1);
  });

  it('16.29 the three rows are READ-ONLY — the prototype’s editors are a separate door', async () => {
    // The prototype draws Priority as a segmented control with click handlers
    // and Due as an `<input type="date">` (`desktop.dc.html:1192-1205`); only
    // Type is read-only there. The dispatch's scope is the ROWS, not editing
    // them — so this asserts the absence, the same way `16.22` does for F's
    // chip. Without it, "read-only" is a claim nobody checked.
    renderSheet(ticketRead());
    await settled();

    for (const id of ['field-priority', 'field-due', 'field-type']) {
      const row = screen.getByTestId(id);
      expect(row.querySelector('input'), id).toBeNull();
      expect(row.querySelector('select'), id).toBeNull();
      expect(row.querySelector('button'), id).toBeNull();
    }
  });

  it('16.30 draws them in the prototype’s order: Assignee, Priority, Due, Type', async () => {
    // Order is transcribed, not chosen: the prototype draws these five in this
    // sequence (`desktop.dc.html:1183-1205`), and a sheet that reordered them
    // would be a different claim about which facts matter most.
    renderSheet(ticketRead());
    await settled();

    const rows = ['field-assignee', 'field-priority', 'field-due', 'field-type'];
    const drawn = rows.map((id) => screen.getByTestId(id));
    for (let i = 1; i < drawn.length; i += 1) {
      const before = drawn[i - 1]!;
      const after = drawn[i]!;
      // DOCUMENT_POSITION_FOLLOWING: `after` comes later in the document than
      // `before`. Comparing node positions rather than indexOf on markup,
      // which a whitespace change would move.
      expect(before.compareDocumentPosition(after) & Node.DOCUMENT_POSITION_FOLLOWING, rows[i]).toBe(
        Node.DOCUMENT_POSITION_FOLLOWING,
      );
    }
  });
});

/**
 * 16.43 — the sheet footer's `‹ Previous / Next ›` (the prototype's footer row,
 * `desktop.dc.html:1370-1373`, handlers `:3809-3810`).
 *
 * **`Delete` is NOT built** — measured, a history-retaining removal has no door
 * in this product (no `ticket.deleted` in the eleven-event vocabulary, no
 * removal column on `proj_tickets`) and is held for a ruling rather than guessed
 * at. Nothing below asserts anything about it.
 *
 * The property these arms are built around: **the list these buttons walk is the
 * CALLER's**, so the sheet never invents a neighbour — and **an end is a
 * DISABLED button, not an absent one**, because the prototype greys the control
 * it cannot move past (`sheetAtStart: sheetIdx <= 0`) and a button that vanished
 * would jump the row's layout at exactly the moment a reader reaches the end.
 */
describe('16.43 — the sheet footer walks the visible list', () => {
  it('16.43 sends the caller the neighbour IT was given, and never invents one', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    renderSheet(ticketRead(), undefined, {
      navigation: { previousTicketId: 'TICKET_PREV', nextTicketId: 'TICKET_NEXT', onNavigate },
    });
    await settled();

    await user.click(screen.getByRole('button', { name: 'Next ›' }));
    expect(onNavigate).toHaveBeenCalledWith('TICKET_NEXT');

    await user.click(screen.getByRole('button', { name: '‹ Previous' }));
    expect(onNavigate).toHaveBeenCalledWith('TICKET_PREV');
    // Two calls, two DIFFERENT ids: a sheet that resolved its own neighbours
    // would have to invent them, and both of these come from the caller.
    expect(onNavigate).toHaveBeenCalledTimes(2);
  });

  it('16.43 GREYS the end it cannot move past rather than removing it', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    renderSheet(ticketRead(), undefined, {
      navigation: { previousTicketId: null, nextTicketId: 'TICKET_NEXT', onNavigate },
    });
    await settled();

    // PRESENT is the assertion that matters — a `toBeDisabled()` on its own
    // would also pass for a control that had been dropped from the tree and
    // re-found somewhere else.
    const previous = screen.getByRole('button', { name: '‹ Previous' });
    expect(previous).toBeInTheDocument();
    expect(previous).toBeDisabled();
    // The other end is untouched by its neighbour's state.
    expect(screen.getByRole('button', { name: 'Next ›' })).toBeEnabled();

    await user.click(previous);
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('16.43 with no neighbour at the far end, NEXT is the greyed one', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    renderSheet(ticketRead(), undefined, {
      navigation: { previousTicketId: 'TICKET_PREV', nextTicketId: null, onNavigate },
    });
    await settled();

    const next = screen.getByRole('button', { name: 'Next ›' });
    expect(next).toBeInTheDocument();
    expect(next).toBeDisabled();
    await user.click(next);
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('16.43 walking the list resets the open tab to Details', async () => {
    const user = userEvent.setup();
    renderSheet(ticketRead(), undefined, {
      navigation: { previousTicketId: 'TICKET_PREV', nextTicketId: 'TICKET_NEXT', onNavigate: vi.fn() },
    });
    await settled();

    await user.click(screen.getByRole('tab', { name: 'History' }));
    expect(screen.getByRole('tab', { name: 'History' })).toHaveAttribute('aria-selected', 'true');

    await user.click(screen.getByRole('button', { name: 'Next ›' }));
    // The prototype sets `sheetTab: "details"` alongside the new `sheetId`
    // (`:3809-3810`), so a step can never leave one ticket's History standing
    // under another ticket's sheet.
    expect(screen.getByRole('tab', { name: 'Details' })).toHaveAttribute('aria-selected', 'true');
  });

  it('16.43 with NO `navigation` there is no footer at all', async () => {
    // The `onOpenTicket` precedent: a caller that cannot say what its list is
    // gets no control, rather than two buttons that guess at one.
    renderSheet(ticketRead());
    await settled();
    expect(screen.queryByRole('button', { name: 'Next ›' })).toBeNull();
    expect(screen.queryByRole('button', { name: '‹ Previous' })).toBeNull();
  });
});
