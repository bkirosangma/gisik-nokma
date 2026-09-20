import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { IngestResult, WorkflowDef } from '@gisik-nokma/domain';
import { SYSTEM_ACTOR_AUTO_CLOSE } from '@gisik-nokma/domain';
import { createClientStateCache } from '../../src/cache.js';
import { ServingGapError, SERVING_GAPS } from '../../src/online/mappers.js';
import type { AttachmentListEntry } from '../../src/views/attachment-list.js';
import type { EditorSlotComponent } from '../../src/views/editor-slot.js';
import type { ListRow, TicketHistoryEvent, TicketRead, TicketVisibility } from '../../src/view-types.js';
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

/**
 * What the ticket read serves for the audience by default.
 *
 * `ownMode: 'inherit'` with `resolvedMode: 'project'` is the ORDINARY production
 * pair, not a convenient one: a root ticket is born claiming `inherit` and
 * `proj_visibility` resolves it to `ROOT_DEFAULT_MODE` = `project`
 * (`proj-visibility.ts`). It is also the pair that makes the own/resolved
 * distinction TESTABLE — a case that wants "the ticket defers, and the parent
 * decided" has it without inventing a shape the projection cannot produce.
 */
const SEED_VISIBILITY: TicketVisibility = { ownMode: 'inherit', resolvedMode: 'project' };

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
    // `Partial<TicketRead>` admits `visibility: undefined`, which is NOT one of
    // the two answers the field has — it is a mode, or `null` for "this read
    // carried no row". Spread last so a case that passes `null` really gets
    // `null`; only a case that OMITS the key keeps the seed.
    visibility: 'visibility' in overrides ? (overrides.visibility ?? null) : SEED_VISIBILITY,
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

  it('PLANTED DEFECT: seven live reads means seven stream subscriptions, all on this workspace', async () => {
    // Ruling P17: `useLiveQuery` keys the SUBSCRIPTION on the workspace and the
    // REFETCH on the query key. SEVEN reads ride this sheet — ticket, workflow,
    // members, history, the project's rows from which the SUBTASKS are derived
    // (door F, 2026-09-19), the ticket's TYPE LADDER (door G), and the comment
    // THREAD — and each opens its own subscription.
    //
    // **The count was four until door F, five until door G, and six until the
    // comment thread, and each change is deliberate.** This assertion is a
    // planted defect: it exists so that adding a read is a decision somebody
    // makes rather than a side effect. The seventh read is a real cost — a
    // subscription per open sheet — and it is paid because the thread is what
    // the sheet's own composer writes to, so a sheet that did not read it could
    // not show the author their own comment.
    const source = sheetSource(ticketRead());
    renderSheet(ticketRead(), source);
    await settled();
    expect(source.subscriptions).toHaveLength(7);
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
    // ⚠ CORRECTED 2026-09-20. `getTicketHistory` ANSWERS — as, since 2026-09-19,
    // does every method (`SERVING_GAPS` is empty); this read "one of the six
    // methods the online source ANSWERS (`src/online/online-data-source.ts:151`)".
    // The distinction the case draws survives that correction, and is why it is
    // kept: its rejection is a failure of one read that MAY answer on a retry,
    // not a permanent gap. Wearing `gn-ticket-sheet__refusal` would put a false
    // claim in the CSS, and the sheet body's own refusal class must stay unused.
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
 * NOT proven here. **⚠ CORRECTED 2026-09-20 — the reason this paragraph gave read
 * *"every case in this file feeds a fabricated successful `getTicket`, and
 * `getTicket` refuses against the shipped server (`mapTicketRead`), so this whole
 * details body is DARK in production today. Asserting the editor's behaviour
 * through this harness would be reporting coverage of a line nobody can reach."*
 * Ruling P25 clause 1 (`c86c4b5c`, 2026-09-06) served that read and the register
 * has been empty since 2026-09-19, so the details body renders and the DARK
 * premise is gone; whether this harness should now assert more than the mount is
 * a test-design decision, not this correction's.**
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
   * 3.117 PLANTED DEFECT — a read that carried no audience, defaulted to a mode.
   *
   * **⚠ 2026-09-20 — the case's INPUT changed and its defect did not.** It read
   * *"`TicketRead` has five fields and none is visibility; the shipped ticket
   * route answers a `proj_visibility` row wrapped in `{ticket, parent, rollup}`
   * with no provenance block at all. So the sheet passes `undefined` ..."* — and
   * that was the framing this whole section was built on, which was wrong: the
   * row's MODE columns were on the wire the entire time and no client read them.
   * The sheet now reads them (3.174). What remains, and is the honest state this
   * case guards, is a read that carried **no row at all** — the offline replica,
   * whose reduced state has no visibility column. Passing `visibility: null` is
   * how that read is expressed here, and it is not a stand-in: it is exactly
   * what `replica-data-source.ts` returns.
   *
   * A default of "Whatever the parent decided" would be plausible — `inherit`
   * is what a ticket is born with — and that is exactly why it must not be
   * drawn.
   */
  it('3.117 shows the ABSENCE for a read that carried no audience, rather than defaulting to a mode', async () => {
    renderSheet(ticketRead({ visibility: null }));
    await settled();
    const section = screen.getByRole('region', { name: 'Who can see this' });
    expect(within(section).getByRole('status')).toHaveTextContent('not being served yet');
  });

  /**
   * 3.174 — the sheet draws the audience its OWN read served.
   *
   * **This is the production path**: `apps/web`'s mount passes no `visibility`
   * prop (`page.tsx:2496`), so what the section shows comes from the read the
   * sheet makes for itself. PLANTED DEFECT: falling back to the prop alone
   * (`current={visibility ?? null}`), which is what this sheet did before
   * `TicketRead.visibility` existed — the section then reports an absence for a
   * mode the server has always sent, on the one surface whose subject is who may
   * see what.
   *
   * ⚠ The read carries a pair the DEFAULT SEED DOES NOT: measured 2026-09-20,
   * this case passed against a mutant that replaced the read with a hardcoded
   * `{ownMode: 'inherit', resolvedMode: 'project'}` — the seed's own value, so
   * the mutation produced the string the assertion was looking for. A case whose
   * fixture equals the plausible hardcoding cannot tell "read it" from "guessed
   * it", which is the tidy-fixture escape. `workspace` is not the seed and not
   * any default, so only reading the wire produces it.
   */
  it('3.174 draws the audience the sheet’s own read served, with no prop passed', async () => {
    renderSheet(ticketRead({ visibility: { ownMode: 'workspace', resolvedMode: 'workspace' } }));
    await settled();
    const section = screen.getByRole('region', { name: 'Who can see this' });
    // Scoped to the STANDING line, not the section: the mode picker beside it
    // carries the same four labels, so a section-wide text query would match the
    // control and report the read as served on a build where it is not.
    const standing = section.querySelector('.gn-visibility__standing');
    expect(standing?.textContent).toContain('Everyone in the workspace');
    expect(standing?.textContent).not.toContain('Everyone on the project');
    expect(within(section).queryByText(/not being served yet/)).toBeNull();
  });

  /**
   * 3.175 — the caller's prop WINS over the read, and it is the only way to
   * reach the section with a roster or a provenance.
   *
   * Nothing on the wire carries either (the roster is cut, the provenance is on
   * the ledger), so a caller holding a fuller read — or a test — is a better
   * source than the sheet's own. PLANTED DEFECT: dropping the `visibility ??`
   * arm, which would make this prop a lie: a caller passing one would silently
   * get the wire's mode instead.
   */
  it('3.175 a caller’s `visibility` prop wins over what the read served', async () => {
    renderSheet(ticketRead(), undefined, {
      visibility: {
        ownMode: 'inherit',
        resolvedMode: 'explicit',
        userIds: ['user_anselma'],
        claim: null,
      },
    });
    await settled();
    const section = screen.getByRole('region', { name: 'Who can see this' });
    // Scoped for the reason 3.174 gives: `Everyone on the project` is ALSO a
    // label on the mode picker, so a section-wide query for it can never be
    // null and would assert nothing.
    const standing = section.querySelector('.gn-visibility__standing');
    expect(standing?.textContent).toContain('Only: Anselma Marak');
    expect(standing?.textContent).not.toContain('Everyone on the project');
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
 *   NOTHING else (`packages/domain/src/ticket-state.ts:160`), and nothing else
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
      /*
        ⚠ THIS STUB IS MODE-AWARE, AND IT HAS TO BE — it was not until
        2026-09-21, and the comment composer exposed it. `TicketSheet` now
        mounts a SECOND `EditorSlot` for the comment box, so a stub that drew
        its description controls whatever `mode` it was handed put two `Save
        description` buttons and two `Paste an image` buttons on the screen and
        made four cases ambiguous (`Found multiple elements with the role
        "button"`). The real `TicketEditorSlot` labels its control by mode —
        *"Comment"* versus *"Save description"* — so the stub was the thing
        disagreeing with the contract, not the sheet.

        The comment arm is deliberately INERT: it submits nothing and reports
        nothing, because every case in this file is about the DESCRIPTION row.
        The comment composer's own behaviour is proven in
        `test/views/ticket-sheet-comments.test.tsx`, against this same seam.
      */
      if (props.mode === 'comment') {
        return <div data-testid="fake-comment-editor" />;
      }
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
    const iconPath = (): string | null | undefined =>
      screen.getByTestId('sheet-scrim').querySelector('.gn-sheet__full path')?.getAttribute('d');
    const scrim = screen.getByTestId('sheet-scrim');
    const panel = scrim.querySelector('.gn-sheet');
    const body = scrim.querySelector('.gn-sheet__body');
    expect(scrim.className).not.toContain('--full');
    expect(panel?.className).not.toContain('--full');
    expect(body?.className).not.toContain('--full');

    const enterIcon = iconPath();
    expect(enterIcon).toBeTruthy();

    await userEvent.click(enter);

    // The label turns around...
    const exit = screen.getByRole('button', { name: 'Exit full screen' });
    expect(exit).toHaveTextContent('Exit full screen');
    // ...AND SO DOES THE ICON, which an independent reviewer found asserted
    // NOWHERE: the record claimed "an icon and a label that BOTH change", and
    // freezing the path left this case GREEN. The two paths are the prototype's
    // own (`:3402`), and the property is that the rendered `d` MOVES — "an icon
    // exists" would pass for a constant, which is the shape that was unwitnessed.
    expect(iconPath()).not.toBe(enterIcon);
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
 * 16.84 — the sheet footer's `Delete`: the SOFT delete, and the removal of the
 * `‹ Previous / Next ›` pair the owner ruled out.
 *
 * ## What 16.43 WAS, and why it is retired rather than left standing
 * `16.43` walked the visible list through `TicketSheetProps.navigation`. **The
 * owner ruled the pair out on 2026-09-20 — *"remove the navigation"* — and it had
 * never rendered anywhere anyway**: `navigation` had ZERO call sites repo-wide, so
 * that footer drew `null` on every mount in the product. Its five arms retire with
 * the control, and the case is marked 🚫 in `test-cases/16-remaining-doors.md`
 * carrying the ruling as its reason. **A green case over a deleted feature is the
 * failure this retirement exists to avoid.** The prop no longer exists, so no
 * caller can bring the pair back; what is left to assert about it is its ABSENCE.
 *
 * ## The property these arms are built around
 * **`Delete` is a history-retaining removal, not an erasure.** The sheet emits
 * `ticket.deleted` with an empty, strict payload and hands the committed fact to
 * its host, which owns the toast and the Undo (`ticket.restored`). **The CLOSE is
 * the sheet's own**, and that asymmetry is deliberate: a host that narrates
 * nothing must still not leave a reader on a sheet for a ticket that is now in no
 * view, while a host that narrates something it was never told is impossible.
 */
describe('16.84 — the sheet footer deletes the ticket, and the navigation is gone', () => {
  /** The footer's own strip, so `Delete` cannot be satisfied by the action row. */
  function footer(): HTMLElement {
    return document.querySelector('.gn-ticket-sheet__footer') as HTMLElement;
  }

  it('16.84 draws Delete, and the ruled-out navigation is ABSENT', async () => {
    renderSheet(ticketRead());
    await settled();

    expect(within(footer()).getByRole('button', { name: 'Delete' })).toBeInTheDocument();
    // The ABSENCE is the assertion rather than a formality: nothing computes a
    // queue position, so these could only ever be drawn disabled on every mount
    // — which is what they were, for the whole life of the prop.
    expect(screen.queryByRole('button', { name: '‹ Previous' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Next ›' })).toBeNull();
  });

  it('16.84 pressing Delete ingests ONE ticket.deleted for THIS ticket with {} — then closes and narrates', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onDeleted = vi.fn();
    const source = renderSheet(ticketRead(), undefined, { onClose, onDeleted });
    await settled();

    await user.click(within(footer()).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(source.ingested).toHaveLength(1));

    const batch = source.ingested[0]!;
    expect(batch).toHaveLength(1);
    expect(batch[0]!.type).toBe('ticket.deleted');
    // Empty AND strict, the same construction `ticket.closed` uses: the envelope
    // carries the actor and the instant, and the payload says nothing.
    expect(batch[0]!.payload).toEqual({});
    expect(batch[0]!.entity).toEqual({ kind: 'ticket', id: TICKET });
    expect(batch[0]!.actorId).toBe('user_kiro');
    expect(batch[0]!.origin).toBe('web');

    // BOTH halves. The title, not an id: this product has no ticket KEY, and a
    // ULID is not something a person reads back.
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(onDeleted).toHaveBeenCalledWith(TICKET, 'File the GST return');
  });

  it('16.84 closes even when the host passes NO onDeleted — the close is not the host\'s to forget', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const source = renderSheet(ticketRead(), undefined, { onClose });
    await settled();

    await user.click(within(footer()).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(source.ingested).toHaveLength(1));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it('16.84 a REFUSED delete keeps the sheet open and shows the server\'s OWN rule', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onDeleted = vi.fn();
    const read = ticketRead();
    const source = createFakeDataSource(
      {
        getTicket: async () => read,
        getWorkflowDef: async () => WF_ERRAND,
        getMembers: async () => [],
        getTicketHistory: async () => [],
      },
      // The real engine's refusal for a non-admin: check 6 in
      // `apps/server/src/permissions/check-permission.ts`, reported as
      // `permission.role` — the same id every neighbouring write refusal uses.
      (events) =>
        events.map((event) => ({
          status: 'refused' as const,
          eventId: event.id,
          rule: 'permission.role',
          reason: 'Only a project admin can delete a ticket in this project.',
        })),
    );
    renderSheet(read, source, { onClose, onDeleted });
    await settled();

    await user.click(within(footer()).getByRole('button', { name: 'Delete' }));
    await waitFor(() =>
      expect(
        screen.getByText(/Only a project admin can delete a ticket in this project\./),
      ).toBeInTheDocument(),
    );
    // Nothing was deleted, so there is nothing to narrate and nothing to close:
    // closing here would hide the refusal from the only person who can act on it.
    expect(onDeleted).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('16.84 a SILENT non-answer is a transport error, never a refusal', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onDeleted = vi.fn();
    const read = ticketRead();
    const source = createFakeDataSource(
      {
        getTicket: async () => read,
        getWorkflowDef: async () => WF_ERRAND,
        getMembers: async () => [],
        getTicketHistory: async () => [],
      },
      // One event submitted, zero results — Ruling 27/33's typed case. Dressing
      // this in "Refused by the server" would claim an adjudication that never
      // happened, which is exactly what the shared `submitTicketEvent` prevents.
      () => [],
    );
    renderSheet(read, source, { onClose, onDeleted });
    await settled();

    await user.click(within(footer()).getByRole('button', { name: 'Delete' }));
    await waitFor(() =>
      expect(screen.getByText(/The server did not answer this change\./)).toBeInTheDocument(),
    );
    expect(onDeleted).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});

/**
 * 16.86 — the INLINE TITLE EDITOR.
 *
 * The owner's ruling (*"all 3 yes"*) made the title editable, and the dispatch
 * measured the door: `ticket.field_set` already writes `fields[fieldId]`
 * (`ticket-state.ts:299`) and `ticket.created` already puts the title there
 * (`:150`). So nothing here asserts that an input EXISTS — every case drives a
 * value into it and then reads the LEDGER EVENT the sheet sent, because a field
 * that rendered and sent nothing is the shape this could fail in.
 *
 * `FakeDataSource.ingested` is the observation channel: it records each
 * `ingest()` call, so `source.ingested.length` is a count of claims made.
 */
describe('TicketSheet — the editable title (16.86)', () => {
  it('16.86 the title renders as a control carrying the ticket’s title', async () => {
    renderSheet(ticketRead());
    await settled();
    const field = screen.getByRole('textbox', { name: 'Ticket title' }) as HTMLInputElement;
    expect(field.value).toBe('File the GST return');
  });

  it('16.86 committing a changed title sends ticket.field_set for fieldId title', async () => {
    const user = userEvent.setup();
    const read = ticketRead();
    const source = renderSheet(read);
    await settled();

    const field = screen.getByRole('textbox', { name: 'Ticket title' });
    await user.clear(field);
    await user.type(field, 'File the GST return for August');
    await user.tab();

    await waitFor(() => expect(source.ingested).toHaveLength(1));
    const event = source.ingested[0]?.[0];
    expect(event?.type).toBe('ticket.field_set');
    expect(event?.payload).toEqual({ fieldId: 'title', value: 'File the GST return for August' });
  });

  /**
   * The complement, and the reason the previous case is a claim about a CHANGE
   * rather than about a field: the ledger is append-only, so a commit that
   * re-sends the title it already has would put a line in the ticket's history
   * saying somebody changed the title to what it already said.
   *
   * ## ⚠ THIS CASE USED TO PASS WITHOUT EVER REACHING THE GUARD IT NAMES
   *
   * Its first version was `click(field); tab()` — which leaves `titleDraft` at
   * `null`, so the blur handler's `titleDraft !== null` check short-circuits and
   * `submitTitle` is **never called at all**. An independent reviewer measured
   * the consequence: **deleting the `next === ticketRead.title` guard entirely
   * left this suite at PASS(90)/FAIL(0).** The case was green about an input
   * nobody had typed into, while its own name claimed a property of the commit
   * path.
   *
   * So it now TYPES THE SAME TITLE BACK, which is the only way to put a
   * non-null draft equal to the server's title in front of the guard. Under that
   * version the mutation above reddens it.
   */
  it('16.86 retyping the SAME title and committing sends nothing at all', async () => {
    const user = userEvent.setup();
    const source = renderSheet(ticketRead());
    await settled();

    const field = screen.getByRole('textbox', { name: 'Ticket title' }) as HTMLInputElement;
    await user.clear(field);
    await user.type(field, 'File the GST return');
    await user.tab();

    expect(source.ingested).toHaveLength(0);
    // The draft is abandoned anyway: a value identical to the server's is not a
    // claim, so there is nothing to keep on screen.
    expect(field.value).toBe('File the GST return');
  });

  /**
   * 16.86 — ENTER commits, and that path had no case at all.
   *
   * An independent reviewer measured it: deleting the `Enter` branch of the
   * field's `onKeyDown` left this suite at PASS(90)/FAIL(0), because every other
   * title case commits by blurring with `user.tab()`. Enter is the gesture the
   * field's own docblock names first, so it gets its own witness — and the
   * assertion is on the LEDGER, not on the key handler having run.
   */
  it('16.86 Enter commits the title as well as blur does', async () => {
    const user = userEvent.setup();
    const source = renderSheet(ticketRead());
    await settled();

    const field = screen.getByRole('textbox', { name: 'Ticket title' });
    await user.clear(field);
    await user.type(field, 'Filed for August{Enter}');

    await waitFor(() => expect(source.ingested).toHaveLength(1));
    expect(source.ingested[0]?.[0]?.payload).toEqual({
      fieldId: 'title',
      value: 'Filed for August',
    });
  });

  /**
   * 16.86 — THE IN-FLIGHT LATCH, and this case exists because the first cut had
   * no latch to test.
   *
   * A browser blurs the focused control when `disabled` lands on it, so **one
   * Enter can fire a second commit out of the first one's own `onBlur`** while
   * the first is still awaiting — and a second `ticket.field_set` carrying the
   * title the ledger already holds is exactly what the unchanged-value guard
   * exists to prevent. jsdom does not blur on disable, so the two gestures are
   * driven explicitly here: Enter, then a blur, inside one in-flight window.
   *
   * The gate is what makes the window real. `ingest` is held pending, so both
   * gestures land before either answer arrives; **without the latch this reads
   * two ingests, with it one.**
   */
  it('16.86 a blur during an in-flight Enter commit does not send a second time', async () => {
    const user = userEvent.setup();
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const read = ticketRead();
    const source = createFakeDataSource(
      {
        getTicket: async () => read,
        getWorkflowDef: async () => WF_ERRAND,
        getMembers: async () => [],
        getTicketHistory: async () => [],
      },
      async (events) => {
        await gate;
        return events.map((event) => ({
          status: 'committed' as const,
          eventId: event.id,
          seq: 1,
          serverTime: '2026-08-20T09:00:00.000Z',
        }));
      },
    );
    renderSheet(read, source);
    await settled();

    const field = screen.getByRole('textbox', { name: 'Ticket title' });
    await user.clear(field);
    await user.type(field, 'Filed for August');
    await user.keyboard('{Enter}');
    await user.tab();

    expect(source.ingested).toHaveLength(1);
    release();
  });

  /**
   * 16.86 — a REFUSED title keeps the reader's words and shows the server's own
   * sentence. The refusal is the engine's (`checks/fields.ts:118-123`), not a
   * second client-side rule, so this case passes a refusal through the fake and
   * asserts the sheet renders exactly what came back.
   */
  it('16.86 a refused title keeps the draft and renders the server’s sentence', async () => {
    const user = userEvent.setup();
    const read = ticketRead();
    const source = createFakeDataSource(
      {
        getTicket: async () => read,
        getWorkflowDef: async () => WF_ERRAND,
        getMembers: async () => [],
        getTicketHistory: async () => [],
      },
      // `eventId` is the SUBMITTED event's own id, not a literal: `IngestResult`'s
      // refused arm requires one, and a fixed string would be a result for an
      // event this call never sent.
      (events) => [
        {
          status: 'refused' as const,
          eventId: events[0]?.id ?? '',
          rule: 'field.type-mismatch',
          reason: 'Title expects a text value.',
        },
      ],
    );
    renderSheet(read, source);
    await settled();

    const field = screen.getByRole('textbox', { name: 'Ticket title' }) as HTMLInputElement;
    await user.clear(field);
    await user.type(field, '   ');
    await user.tab();

    await waitFor(() =>
      expect(
        screen.getByText(/Refused by the server — field\.type-mismatch: Title expects a text value\./),
      ).toBeInTheDocument(),
    );
    // The words stay: clearing the draft would hand the reader back the old
    // title beside a sentence refusing the new one.
    expect(field.value).toBe('   ');
  });

  /**
   * 16.86 — Escape abandons the draft, sends nothing, AND DOES NOT CLOSE THE
   * SHEET.
   *
   * ## ⚠ THE THIRD ASSERTION IS THE ONE THAT WAS MISSING, AND IT WAS A REAL DEFECT
   *
   * `Sheet` registers a DOCUMENT-level keydown that calls `onClose()` on any
   * Escape. Nothing in it checked `defaultPrevented`, so the field's own Escape
   * branch — which calls `preventDefault()` and resets the draft — did not stop
   * the sheet from closing: **the documented behaviour was true of an input that
   * was being unmounted.** An independent reviewer measured `onClose` called
   * once and reproduced it with a scratch case.
   *
   * The branch's own suite could not see it, and the reason is worth stating:
   * `renderSheet` passes `onClose: vi.fn()`, which never unmounts anything, so
   * the sheet stayed on screen for the two assertions above to hold against. The
   * fix is in `Sheet` (`if (event.defaultPrevented) return;`), and this
   * assertion is its witness — **revert that line and this case reddens while
   * the other two stay green.**
   */
  it('16.86 Escape abandons the draft, sends nothing, and does not close the sheet', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const source = renderSheet(ticketRead(), sheetSource(ticketRead()), { onClose });
    await settled();

    const field = screen.getByRole('textbox', { name: 'Ticket title' }) as HTMLInputElement;
    await user.clear(field);
    await user.type(field, 'Discard me');
    await user.keyboard('{Escape}');

    expect(field.value).toBe('File the GST return');
    expect(source.ingested).toHaveLength(0);
    expect(onClose).not.toHaveBeenCalled();
  });

  /**
   * 16.86 — the DIALOG'S NAME stays the server's title while a draft is on
   * screen, and this is the case that would catch the obvious simplification.
   *
   * `Sheet` is given the string for `aria-label` as well as the slot, and wiring
   * `aria-label` to the slot instead would name the sheet after a control's
   * uncommitted value — a name that changes as somebody types, and that reads as
   * empty the moment they clear the field.
   */
  it('16.86 the sheet’s accessible name stays the server’s title while editing', async () => {
    const user = userEvent.setup();
    renderSheet(ticketRead());
    await settled();

    const field = screen.getByRole('textbox', { name: 'Ticket title' });
    await user.clear(field);
    await user.type(field, 'Uncommitted');

    expect(screen.getByRole('dialog', { name: 'File the GST return' })).toBeInTheDocument();
  });
});

/**
 * 16.87 — the BREADCRUMB.
 *
 * `Workspace › Project › State`, drawn from the host-supplied names and the
 * state this sheet already derives. **The dispatch's measurement of the SOURCE
 * was wrong and that is recorded on the props**, so the interesting half of
 * these cases is the arm where no name arrives: the prototype's fourth crumb is
 * the ticket KEY and is deliberately not built.
 */
describe('TicketSheet — the location breadcrumb (16.87)', () => {
  function crumbTexts(): string[] {
    return Array.from(document.querySelectorAll('.gn-ticket-sheet__crumb')).map(
      (el) => el.textContent ?? '',
    );
  }

  it('16.87 draws workspace, project and state, in that order', async () => {
    renderSheet(ticketRead(), sheetSource(ticketRead()), {
      workspaceName: 'Convenience Corner',
      projectName: 'Shop operations',
    });
    await settled();

    expect(screen.getByRole('navigation', { name: 'Ticket location' })).toBeInTheDocument();
    expect(crumbTexts()).toEqual(['Convenience Corner', 'Shop operations', 'Doing']);
  });

  /**
   * With no names the crumb is OMITTED ENTIRELY — not drawn empty, and not
   * drawn short. A crumb list is a PATH or it is nothing.
   */
  it('16.87 draws no breadcrumb at all when the host supplies no names', async () => {
    renderSheet(ticketRead());
    await settled();

    expect(crumbTexts()).toEqual([]);
    expect(screen.queryByRole('navigation', { name: 'Ticket location' })).toBeNull();
  });

  /**
   * 16.87 — HALF a path is not a path, and this case exists because the first
   * cut of the derivation got it wrong.
   *
   * That version drew whichever crumbs it had, so a caller with a workspace name
   * and no project name rendered `Convenience Corner › Doing` — **the project
   * missing from the middle**, which states a hierarchy the product does not
   * have, and does it silently, because every crumb that IS drawn is correct.
   * Comparing `items` rather than the rendered text is what makes the difference
   * visible: an empty second crumb would satisfy a text check.
   */
  it('16.87 draws NO breadcrumb when only one of the two names arrives', async () => {
    renderSheet(ticketRead(), sheetSource(ticketRead()), {
      workspaceName: 'Convenience Corner',
    });
    await settled();

    expect(crumbTexts()).toEqual([]);
  });

  /**
   * 16.87 — the STATE crumb is the workflow's name for the state, not the raw
   * id, which is the same lookup the state chip above makes. A fixture whose
   * ticket sits in a state the definition does not hold is what the fallback is
   * for, and this case pins the positive half: a definition that DOES hold it
   * gets its name.
   */
  it('16.87 names the state rather than printing its id', async () => {
    renderSheet(ticketRead(), sheetSource(ticketRead()), {
      workspaceName: 'Convenience Corner',
      projectName: 'Shop operations',
    });
    await settled();

    const nav = screen.getByRole('navigation', { name: 'Ticket location' });
    expect(nav.textContent).not.toContain('doing');
    expect(crumbTexts().at(-1)).toBe('Doing');
  });
});

/**
 * The attachments section (2026-09-20) — the prop the product's mount never
 * passed, and the two states it has to keep apart.
 *
 * ## The property is a THREE-WAY, and the third arm is the one that was missing
 *
 * `AttachmentList` returns `null` for an empty list — *"must not promise there
 * are none"* — so a ticket with no files draws NOTHING, which is the component's
 * deliberate silence rather than a claim. A read that FAILED used to draw the
 * same nothing: `TicketSheetProps.attachments` had no way to carry a reason, so
 * "this ticket has no attachments" and "we could not read them" were one screen.
 * `attachmentsUnavailable` is that reason, and this case pins all three arms in
 * one run — entries, empty, failed — because any two of them alone would pass
 * against a component that drew a single thing for both.
 */
describe('16.57 the attachments section keeps an empty list and a failed read apart', () => {
  const ENTRY: AttachmentListEntry = {
    kind: 'upload',
    attachmentId: '01J9GATA000000000000000000',
    filename: 'gst-receipt.pdf',
    mime: 'application/pdf',
    size: 48211,
    sha256: null,
  };

  it('16.57 draws the entries, draws nothing for an empty list, and draws a sentence for a failure', async () => {
    // ARM ONE — the entries. This is also the control for everything below: the
    // section does render when it has something to render.
    renderSheet(ticketRead(), sheetSource(ticketRead()), { attachments: [ENTRY] });
    await settled();
    expect(screen.getByText('gst-receipt.pdf')).toBeInTheDocument();
    expect(screen.queryByTestId('sheet-attachments-unavailable')).toBeNull();
    cleanup();

    // ARM TWO — a real empty list. Nothing at all, and crucially no sentence:
    // the component must not turn "there are none" into a warning.
    renderSheet(ticketRead(), sheetSource(ticketRead()), { attachments: [] });
    await settled();
    expect(screen.queryByText('gst-receipt.pdf')).toBeNull();
    expect(screen.queryByTestId('sheet-attachments-unavailable')).toBeNull();
    cleanup();

    // ARM THREE — the read failed. A sentence, and it carries the REASON rather
    // than the sheet inventing one: the `error` string is the transport's own.
    const reason = 'HTTP 404 for /v1/workspaces/ws/tickets/tk/attachments';
    renderSheet(ticketRead(), sheetSource(ticketRead()), { attachmentsUnavailable: reason });
    await settled();
    const notice = screen.getByTestId('sheet-attachments-unavailable');
    expect(notice).toHaveTextContent("This ticket's attachments could not be read");
    expect(notice).toHaveTextContent(reason);
    // And the reason is not dressed as a wait — the failure arm this sheet
    // already draws for the ticket read and the ledger tab is the model.
    expect(notice.textContent).not.toContain('Loading');
  });
});
