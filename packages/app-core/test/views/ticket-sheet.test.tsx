import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { IngestResult, TicketTypeDef, WorkflowDef } from '@gisik-nokma/domain';
import { SYSTEM_ACTOR_AUTO_CLOSE } from '@gisik-nokma/domain';
import { createClientStateCache } from '../../src/cache.js';
import { formatDate } from '../../src/provenance.js';
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
    // The key and the grandparent — the two crumb fields the ticket read gained
    // on 2026-09-20. A SEEDED key is what makes the last crumb's own case
    // (`16.88`) mean anything: with `null` here every crumb assertion would be
    // an assertion about the FALLBACK, and the key path would go unwitnessed.
    key: 'CCSO-1183',
    // `null` — no grandparent — because the sheet's fixtures already carry a
    // parent, and a case that wants the whole three-layer chain must say so.
    epic: null,
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
    // Door G: the workspace TYPE LADDER, read to put a NAME on the `Type` row
    // and — since 2026-09-20 — to decide whether this ticket can take a child
    // at all (`16.91`–`16.95`). The `task` entry is the one
    // `ticketStateSeed`'s `typeId` names, so the default is a ticket whose type
    // the ladder KNOWS — a case that wants the fallback passes a ladder that
    // does not hold it.
    //
    // ⚠ `sub-task` is here because the DEFAULT world must be one in which the
    // Add-subtask form can legitimately draw, and that is not free: the rank
    // rule is `childRank > parentRank`, and the default ticket is a `task` at
    // rank 3 — so with this ladder as it stood before (`task` 3, `epic` 1)
    // NOTHING could sit under the default ticket and every case that presses
    // the button would have become a case about a form that is correctly
    // withheld. Adding it changes no existing case's behaviour: the ladder is
    // read for the `Type` row's NAME (which resolves off `task`, untouched) and
    // for this decision, which the cases below are the witness for.
    getTicketTypes: async () => [
      { id: 'task', name: 'Task', icon: 'check', rank: 3, workflowId: 'wf-errand', fields: [] },
      { id: 'epic', name: 'Epic', icon: 'flag', rank: 1, workflowId: 'wf-errand', fields: [] },
      { id: 'sub-task', name: 'Sub-task', icon: 'list', rank: 4, workflowId: 'wf-errand', fields: [] },
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
    // The title is the sheet's own label, so it is asserted where it is edited
    // rather than by a bare text match that finds two nodes.
    expect(screen.getByRole('dialog', { name: 'File the GST return' })).toBeInTheDocument();
    // ⚠ A `field-title` ROW WAS ASSERTED HERE UNTIL 2026-09-22 AND IT IS DELETED
    // (spec `2026-09-22-sheet-prototype-parity-design.md` decision 4). The generic
    // field loop below drew a SECOND, read-only title row beside the header
    // control, because its exclusion list named `description`, `dueDate` and
    // `priority` but not `title` — so the sheet printed the title twice, one copy
    // of it a control nobody could type into. **The title is still on the sheet**,
    // in the header, and this is the positive control for that: a bare
    // `queryByTestId('field-title')` alone would pass for a build that dropped the
    // title altogether.
    expect(screen.getByLabelText('Ticket title')).toHaveValue('File the GST return');
    const dueDateRow = screen.getByTestId('field-due');
    expect(within(dueDateRow).getByText('set by Kiro on 18 Aug 2026')).toBeInTheDocument();
    // The due DAY CLAIM renders as claimed — as the editor's own VALUE since
    // ruling E5-6, which is the ISO day a `type="date"` input holds. This
    // assertion used to read `getByText('30 Aug 2026')` over a read-only span
    // the ruling replaced; the claim line above is unchanged.
    expect(within(dueDateRow).getByLabelText('Due date')).toHaveValue('2026-08-30');
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
    // ⚠ `'title'` WAS IN THIS LIST UNTIL 2026-09-22 and its row is deleted (spec
    // decision 4) — the title is edited in the header, and the generic loop's
    // exclusion list now names it. On THIS fixture `due` is the only row left that
    // carries a `set by …` claim: the assignee is unassigned (its row says so in
    // its own words rather than with a claim line), the description has no claim,
    // and the custom-field loop draws nothing because this ticket has no custom
    // fields. A list that named a row the sheet no longer draws would be an
    // assertion about a string the case itself invented.
    for (const fieldId of ['due']) {
      const row = screen.getByTestId(`field-${fieldId}`);
      expect(row.querySelector('.gn-ticket-sheet__claim')?.textContent, fieldId).toMatch(
        /^set by .+ on \d{1,2} \w{3} \d{4}$/,
      );
    }
  });

  it('renders the parent link when visible', async () => {
    renderSheet(ticketRead());
    // UPDATED 2026-09-20, not deleted: the visible parent used to render as its
    // bare TITLE here, and the owner's ruling moved the `Subtask of {title}`
    // badge up into this position. The fact this case is about — the parent is
    // NAMED on the sheet when the viewer may see it — is the same; what changed
    // is the wording and the element. The title alone is no longer a text node,
    // which is exactly why `getByText('Registrations')` stopped matching.
    await waitFor(() =>
      expect(screen.getByTestId('sheet-parent-indicator')).toHaveTextContent('Registrations'),
    );
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

  it('PLANTED DEFECT: eight live reads means eight stream subscriptions, all on this workspace', async () => {
    // Ruling P17: `useLiveQuery` keys the SUBSCRIPTION on the workspace and the
    // REFETCH on the query key. EIGHT reads ride this sheet — ticket, workflow,
    // members, history, the project's rows from which the SUBTASKS are derived
    // (door F, 2026-09-19), the ticket's TYPE LADDER (door G), the comment
    // THREAD, and the ticket's NOTES section (notes series, Plan 6 of 7,
    // `18.241`) — and each opens its own subscription.
    //
    // **The count was four until door F, five until door G, six until the
    // comment thread, seven until the notes section, and each change is
    // deliberate.** This assertion is a planted defect: it exists so that
    // adding a read is a decision somebody makes rather than a side effect.
    // The eighth read is a real cost — a subscription per open sheet — and it
    // is paid because a note attached elsewhere must appear on this sheet
    // without a reload (spec §10.4).
    const source = sheetSource(ticketRead());
    renderSheet(ticketRead(), source);
    await settled();
    expect(source.subscriptions).toHaveLength(8);
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

  it('E2-36 — a PARTLY committed move batch reloads BOTH reads behind the refusal', async () => {
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
    let ticketReads = 0;
    const source = createFakeDataSource(
      {
        getTicket: async () => {
          ticketReads += 1;
          return read;
        },
        getWorkflowDef: async () => gated,
        getMembers: async () => [],
        getTicketHistory: async () => [],
      },
      // The shape the dialog's own ordering creates on a refusal: the field
      // claim the rule needs commits, and the move that needed it is turned away.
      //
      // ⚠ A committed `IngestResult` carries `seq` and `serverTime`, and this
      // fake omitted both until the batch gate caught it. The suite could never
      // have: vitest transpiles without typechecking, so the omission was
      // invisible here and red at `tsconfig.typecheck.json`, which INCLUDES
      // tests — the config `pnpm --filter @gisik-nokma/app-core typecheck` uses.
      // The values mirror `helpers/fake-data-source.ts`'s own default.
      (events) =>
        events.map((event, at) =>
          event.type === 'ticket.field_set'
            ? {
                status: 'committed' as const,
                eventId: event.id,
                seq: at + 1,
                serverTime: '2026-08-20T09:00:00.000Z',
              }
            : {
                status: 'refused' as const,
                eventId: event.id,
                rule: 'restrict-to',
                reason: 'Only Anselma Marak may perform "Doing → Done" on this ticket.',
              },
        ),
    );
    renderSheet(read, source);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Move…' })).toBeInTheDocument());
    const before = ticketReads;
    await user.click(screen.getByRole('button', { name: 'Move…' }));
    await user.click(screen.getByRole('button', { name: /Move to/ }));
    await user.click(within(await screen.findByRole('listbox')).getByRole('option', { name: 'Done' }));
    await user.type(screen.getByLabelText('invoiceNo (required before this transition)'), 'INV-7');
    await user.click(screen.getByRole('button', { name: 'Move' }));
    await screen.findByText(/restrict-to/);
    // The refusal is on screen AND the sheet re-asked its read. Without the
    // reload the sheet sits behind the refusal painted with the pre-move values
    // while the server already holds the committed field claim.
    expect(ticketReads).toBeGreaterThan(before);
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

  /**
   * 3.178 / E2-29 — a dropped connection during a Move used to produce nothing
   * at all.
   *
   * `submitTransition` awaited `dataSource.ingest([...])` with no `try`, and its
   * call site is `void submitTransition(submission)` — so a REJECTED ingest was
   * an unhandled promise rejection. The sheet does hold a transport sentence,
   * but it renders only when `!moveOpen`; the dialog that replaces it while a
   * Move is being made was handed the literal `transportError={null}`, so there
   * was no surface anywhere that could speak. The sibling writes on the same
   * sheet (`submitTicketEvent` for Close/Reopen/Delete) do catch and disclose,
   * which is what makes this an omission rather than a design.
   *
   * The assertion is deliberately about WHICH surface speaks and in WHICH
   * voice: the alert is read inside the Move dialog (the surface in view — the
   * sheet's own copy is gated out while it is open), and it must not wear the
   * refusal's sentence or its class. A dropped connection is not an
   * adjudication, and a person cannot act on it as one.
   */
  it('3.178 / E2-29: a rejected ingest during a Move is spoken by the dialog, never as the server’s own verdict', async () => {
    const user = userEvent.setup();
    const read = ticketRead();
    const source = createFakeDataSource(
      {
        getTicket: async () => read,
        getWorkflowDef: async () => WF_ERRAND,
        getMembers: async () => [],
        getTicketHistory: async () => [],
      },
      () => {
        throw new Error('network unreachable');
      },
    );
    renderSheet(read, source);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Move…' })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Move…' }));
    await user.click(screen.getByRole('button', { name: /Move to/ }));
    await user.click(within(await screen.findByRole('listbox')).getByRole('option', { name: 'Done' }));
    await user.type(screen.getByLabelText('Comment (required by this transition)'), 'filed at the portal');
    await user.click(screen.getByRole('button', { name: 'Move' }));

    const dialog = screen.getByRole('dialog', { name: 'Move ticket' });
    const alert = await within(dialog).findByRole('alert');
    expect(alert).toHaveTextContent('We could not reach the server for this move — network unreachable');
    expect(alert).not.toHaveTextContent('Refused by the server');
    expect(alert).toHaveClass('gn-refusal--transport');
    expect(alert).not.toHaveClass('gn-refusal--server');
    // The dialog stays: the retry lives here, and so does the sentence.
    expect(screen.getByRole('dialog', { name: 'Move ticket' })).toBeInTheDocument();
  });

  /**
   * 3.182 / E5-27 — THE MOVE CONTROL HAS AN IN-FLIGHT STATE.
   *
   * E2-29's transport arm (3.178) gave a dropped connection a sentence. This is
   * the other half of the same finding, and it is a different defect: with the
   * request merely SLOW the dialog said nothing because there was nothing to
   * say yet, and Move stayed enabled — so "still sending", "already failed" and
   * "already succeeded" were indistinguishable to the person deciding whether
   * to press again. `blocked` is the form's validity and only that; the dialog
   * had no way to express "a submission is already in flight".
   *
   * The ingest is held open behind a deferred promise rather than rejecting,
   * and that is the whole design of the case: a REJECTING ingest also reddens
   * under a fix that only resets the latch on the error path, so it cannot
   * distinguish a latch from a `finally`. Holding it open tests the window
   * itself — the state the person is actually in while the network is slow.
   *
   * THE SECOND PRESS IS ASSERTED, not assumed away. Disabling a button is a
   * DOM fact; whether a second submission can still be FILED is the property
   * that matters, and the two come apart whenever the guard is missing and
   * `userEvent` dispatches before React re-renders. `source.ingested` is the
   * ledger of what actually went out.
   */
  it('3.182 / E5-27: a Move in flight disables the control, and a second press files nothing', async () => {
    const user = userEvent.setup();
    const read = ticketRead();
    let release: (() => void) | null = null;
    const source = createFakeDataSource(
      {
        getTicket: async () => read,
        getWorkflowDef: async () => WF_ERRAND,
        getMembers: async () => [],
        getTicketHistory: async () => [],
      },
      async (events) => {
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        return events.map((event) => ({
          status: 'committed' as const,
          eventId: event.id,
          seq: 1,
          serverTime: '2026-08-20T09:00:00.000Z',
        }));
      },
    );
    renderSheet(read, source);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Move…' })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Move…' }));
    await user.click(screen.getByRole('button', { name: /Move to/ }));
    await user.click(within(await screen.findByRole('listbox')).getByRole('option', { name: 'Done' }));
    await user.type(screen.getByLabelText('Comment (required by this transition)'), 'filed at the portal');

    const dialog = screen.getByRole('dialog', { name: 'Move ticket' });
    const moveButton = within(dialog).getByRole('button', { name: 'Move' });
    // Before the press it is enabled — the field the case moves must be the
    // ONLY thing that turns it off, or "disabled" would prove nothing.
    expect(moveButton).toBeEnabled();

    await user.click(moveButton);
    await waitFor(() => expect(source.ingested).toHaveLength(1));
    // The request is out and unanswered: the control says so.
    await waitFor(() =>
      expect(within(dialog).getByRole('button', { name: 'Move' })).toBeDisabled(),
    );
    // And a second press — the person's natural response to a slow network —
    // files nothing at all. Measured against the LEDGER, not the attribute.
    await user.click(within(dialog).getByRole('button', { name: 'Move' }));
    expect(source.ingested).toHaveLength(1);

    // Release: the latch clears, the dialog closes, and the button is gone
    // with it — the happy path still works through the same flag.
    await act(async () => {
      release?.();
      await Promise.resolve();
    });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Move ticket' })).toBeNull());
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

  /**
   * 3.186 (E5-7). The candidate carries `{ to }` and nothing else, so the
   * preview is
   * asked a question the submission does not ask: the dialog shows
   * `Comment (required by this transition)`, its own `blocked` clears the
   * moment the person types, Move becomes ENABLED — and the refusal sentence
   * beside it stays. `evaluateRequireComment` reads `payload.comment?.text`, so
   * the comment is the one rule kind whose value the CANDIDATE can carry; the
   * evidence fix beside it did exactly this and was never extended to the
   * comment box.
   */
  it('PLANTED DEFECT: the require-comment preview stops refusing once the comment its own box asked for is typed', async () => {
    const user = userEvent.setup();
    const read = ticketRead();
    renderSheet(read, sheetSource(read), { cache: cacheForTicket() });
    await settled();
    await user.click(screen.getByRole('button', { name: 'Move…' }));
    await user.click(screen.getByRole('button', { name: /Move to/ }));
    // doing → done declares require-comment.
    await user.click(within(await screen.findByRole('listbox')).getByRole('option', { name: 'Done' }));

    // The CONTROL: nothing typed yet, so this refusal is CORRECT — the person
    // has not answered, and Move is disabled. The case below is about the
    // refusal CLEARING, not about it never having fired.
    expect(await screen.findByText(/instant check/)).toHaveTextContent('require-comment');

    const box = screen.getByLabelText('Comment (required by this transition)');
    await user.type(box, 'review note');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Move' })).toBeEnabled());
    expect(document.querySelector('.gn-refusal--preview')).toBeNull();

    // …and a comment that is only WHITESPACE is not a comment: the submission
    // sends `comment.trim()`, and `evaluateRequireComment` trims what it reads,
    // so the two agree on every value that can change the verdict.
    await user.clear(box);
    await user.type(box, '   ');
    expect(await screen.findByText(/instant check/)).toHaveTextContent('require-comment');
  });

  /**
   * 3.185 (E2-40). `require-field` reads the value out of the TICKET STATE
   * (`rule-engine/src/rules/require-field.ts:9`), not out of the candidate's
   * payload — which is why the real path sends the field claims FIRST, in one
   * ordered batch, before the transition. The preview evaluates ONE candidate
   * against cached state and has no such batch, so a field the ticket does not
   * already carry is invisible to it: the dialog's own input asks for the
   * value, its gate clears the moment it is typed, and the preview beside it
   * keeps saying the field is not set — for ever.
   */
  it('PLANTED DEFECT: the preview stops refusing once the field its own input asked for is filled', async () => {
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
    const cache = createClientStateCache();
    cache.upsertTicket(read.ticket);
    cache.upsertWorkflowDef(gated);
    const source = createFakeDataSource({
      getTicket: async () => read,
      getWorkflowDef: async () => gated,
      getMembers: async () => [],
      getTicketHistory: async () => [],
    });
    renderSheet(read, source, { cache });
    await settled();
    await user.click(screen.getByRole('button', { name: 'Move…' }));
    await user.click(screen.getByRole('button', { name: /Move to/ }));
    await user.click(within(await screen.findByRole('listbox')).getByRole('option', { name: 'Done' }));

    // Before anything is typed the refusal is CORRECT — the field has no value
    // on the ticket and nothing has been collected. This is the control: the
    // assertion below is about the refusal CLEARING, not about it being absent
    // for some unrelated reason.
    const preview = await screen.findByText(/instant check/);
    expect(preview).toHaveTextContent('require-field');

    await user.type(screen.getByLabelText('invoiceNo (required before this transition)'), 'INV-7');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Move' })).toBeEnabled());
    // The person answered the question the dialog asked, and the answer reached
    // the same evaluation the submission will cause — so the refusal goes.
    expect(document.querySelector('.gn-refusal--preview')).toBeNull();
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

  it('PLANTED DEFECT: supplied entries render under the Attachments tab, both kinds told apart', async () => {
    const read = ticketRead();
    renderSheet(read, sheetSource(read), { attachments: ENTRIES });
    await settled();
    // ⚠ THE TAB OPENED HERE CHANGED on 2026-09-22 (owner ruling, spec decision 5):
    // this section moved out of Details and behind its own third tab, so the
    // container the entries are read from is the Attachments panel rather than
    // `.gn-ticket-sheet__details`. The claim — both kinds drawn and told apart —
    // is unchanged.
    fireEvent.click(screen.getByRole('tab', { name: 'Attachments' }));
    const panel = document.querySelector('.gn-ticket-sheet__attachments')!;
    const kinds = [...panel.querySelectorAll('.gn-attachment')].map((node) =>
      node.getAttribute('data-attachment-kind'),
    );
    expect(kinds).toEqual(['upload', 'drive-reference']);
    expect(panel.textContent).toContain('captured 20 Aug 2026');
  });

  it('PLANTED DEFECT: the attachment list belongs to the Attachments tab, and to no other', async () => {
    const user = userEvent.setup();
    const read = ticketRead();
    renderSheet(read, sheetSource(read), { attachments: ENTRIES });
    await settled();
    // The tab it belongs to draws it...
    await user.click(screen.getByRole('tab', { name: 'Attachments' }));
    expect(document.querySelector('.gn-attachments')).not.toBeNull();
    // ...and the two tabs either side of it do not. ⚠ THIS CASE'S CLAIM MOVED
    // with the section it guards: it read *"belongs to the details tab, not to
    // history"*, and the owner's ruling moved the list behind a third tab. The
    // property is unchanged — the list is drawn under ONE tab and no other —
    // which is why the case gained arms rather than being retired. Its old form
    // passed over the move VACUOUSLY: with the list no longer in Details, a
    // single "not under History" assertion was true of a build that drew it
    // nowhere at all.
    await user.click(screen.getByRole('tab', { name: 'History' }));
    expect(document.querySelector('.gn-attachments')).toBeNull();
    await user.click(screen.getByRole('tab', { name: 'Details' }));
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

  it('E2-55: a FULL page puts the notice ABOVE the list it is about', async () => {
    const read = ticketRead();
    const user = userEvent.setup();
    renderSheet(read, sheetSource(read, page(HISTORY_PAGE_LIMIT)));
    await settled();
    await user.click(screen.getByRole('tab', { name: 'History' }));
    const partial = await screen.findByText(/may go on past them/);
    const list = document.querySelector('.gn-history');
    expect(list).not.toBeNull();
    // `DOCUMENT_POSITION_FOLLOWING` in this probe means the list comes AFTER the
    // notice in document order. The help tells the reader the cap "says so at the
    // top"; with the notice below 200 rendered rows, that sentence sends them
    // past the one thing it is telling them to look for.
    expect(
      partial.compareDocumentPosition(list as Node) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
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

  /**
   * RULING E4-18 — `...people.map((member) => ({ value: member.id, label:
   * member.name }))` rendered a BLANK 13px option for a member with no
   * display name (a real, seeded member: `accountant@e2e.gisik-nokma.local`,
   * `name: ''`). `provenance.ts`'s own honesty contract ("a missing display
   * name falls back to the raw actor id — attributed, never blank") already
   * governs the sibling `visibility-editor.tsx` picker via `actorLabel`; this
   * is the same contract applied here.
   *
   * **13.1294 EXTENDS IT to the second step of the same rule** (owner request,
   * 2026-09-22: *"Everywhere for id, show the Name; if name is empty/blank,
   * show the email"*). The ruling above closed the blank option by falling to
   * the ID; a member whose name is blank and whose address IS on the wire has a
   * better handle than a ULID, and the picker showed neither. The roster here
   * carries BOTH populations at once — `user_nameless` (no name, no address, so
   * the id is still the floor) and `user_accountant` (no name, a real address) —
   * because one member could not distinguish the two steps, and an
   * implementation that skipped straight to the id would pass an assertion
   * written against either alone.
   */
  it('13.1294 a member with no display name renders by email when there is one, and by id when there is not', async () => {
    const read = ticketRead();
    const source = createFakeDataSource({
      getTicket: async () => read,
      getWorkflowDef: async () => WF_ERRAND,
      getMembers: async () => [
        { id: 'user_kiro', name: 'Kiro', role: 'owner' },
        { id: 'user_anselma', name: 'Anselma Marak', role: 'member' },
        { id: 'user_nameless', name: '', role: 'guest' },
        { id: 'user_accountant', name: '', role: 'guest', email: 'accountant@example.test' },
      ],
      getTicketHistory: async () => [],
    });
    renderSheet(read, source);
    await settled();
    const listbox = await openAssigneeList();
    const options = within(listbox).getAllByRole('option');
    expect(options.map((option) => option.textContent)).toEqual([
      'Unassigned',
      'Kiro',
      'Anselma Marak',
      // No name and no address: the id is still the floor.
      'user_nameless',
      // No name, a real address: the ADDRESS, which is the step this case adds.
      'accountant@example.test',
    ]);
    // The blank-string failure mode this ruling closes: no option's visible
    // text is empty, which a `.toEqual` on the full array above could in
    // principle still satisfy by accident if the array itself were wrong —
    // this is the assertion that addresses the failure mode directly.
    for (const option of options) {
      expect(option.textContent).not.toBe('');
    }
  });

  /**
   * RULING E5-4 — the @mention list's own half of the same defect class
   * E4-18 closed on the Assignee picker: `queryUsers` filtered on
   * `member.name.toLowerCase().includes(needle)` and mapped `name:
   * member.name` verbatim, so a nameless member was both invisible (a
   * blank row, if listed at all) AND unreachable (typing anything could
   * never match an empty string). `queryUsers` is captured off a fake
   * `EditorSlotComponent`, the same dependency-injection seam 13.989's own
   * describe block uses, since it is a closure private to `TicketSheet`
   * and not otherwise reachable from a test.
   *
   * **13.1294 EXTENDS IT to the email step**, and the arm is the reason the two
   * people are both in the roster: `user_nameless` (no name, no address) is
   * found by its ID and `user_accountant` (no name, a real address) by its
   * ADDRESS. Typing `account` must not reach `user_nameless`, which is what
   * makes the second assertion about the address rather than about matching
   * anything loose.
   */
  it('13.1294 the @mention list resolves a nameless member by email when they have one, by id when they do not, and finds each by what it shows', async () => {
    const read = ticketRead();
    const source = createFakeDataSource({
      getTicket: async () => read,
      getWorkflowDef: async () => WF_ERRAND,
      getMembers: async () => [
        { id: 'user_kiro', name: 'Kiro', role: 'owner' },
        { id: 'user_nameless', name: '', role: 'guest' },
        { id: 'user_accountant', name: '', role: 'guest', email: 'accountant@example.test' },
      ],
      getTicketHistory: async () => [],
    });
    let captured: ((query: string) => Promise<Array<{ userId: string; name: string }>>) | undefined;
    const fakeSlot: EditorSlotComponent = (props) => {
      captured = props.queryUsers;
      return null;
    };
    renderSheet(read, source, { editorSlot: fakeSlot });
    await settled();
    expect(captured).toBeDefined();

    const all = await captured!('');
    expect(all).toContainEqual({ userId: 'user_nameless', name: 'user_nameless' });
    expect(all).toContainEqual({
      userId: 'user_accountant',
      name: 'accountant@example.test',
    });

    // Reachable by typing the id — the raw empty name could never have
    // matched anything, so this is the assertion that would fail if the
    // resolved label were used only for DISPLAY and the OLD raw name were
    // still what `.includes(needle)` matched against.
    const found = await captured!('user_nameless');
    expect(found.map((person) => person.userId)).toContain('user_nameless');

    // Reachable by typing the ADDRESS, for the same reason one step further
    // out — and the control is that the same query does NOT reach the member
    // whose label is an id: `account` appears in one label and not the other.
    const byEmail = await captured!('account');
    expect(byEmail.map((person) => person.userId)).toEqual(['user_accountant']);
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
    //
    // ⚠ **THIS ASSERTION WAS A WHOLE-ROW `textContent` AND THE ROW IS A CARD NOW
    // (sheet prototype parity, Task 6, 2026-09-22).** It read
    // `toBe('Order the brochures · To do')` — one exact string for the whole
    // `<li>`. A card is a title element with a meta row BENEATH it, so the whole
    // row now reads `Order the brochuresTo do · task` and the old string is not
    // reachable by any correct rendering. **The amendment KEEPS THE PROPERTY
    // rather than dropping it, and it is asserted in BOTH halves:**
    //
    //   1. the title and the meta row are separate ELEMENTS — a block boundary,
    //      not a run of glyphs — which is what makes the missing separator between
    //      them a layout fact rather than a text defect; and
    //   2. WITHIN the meta row, where the chip and the detail DO share one line,
    //      the separator is still real characters — `To do · task`, not
    //      `To dotask`. That is the 2026-09-20 defect's exact shape, one element
    //      to the right, and it is why the markup carries a ` · ` glyph inside the
    //      detail string rather than relying on the flex `gap`.
    const cardOne = within(section).getByTestId('subtask-tkt-s1');
    const cardTwo = within(section).getByTestId('subtask-tkt-s2');
    expect(cardOne.querySelector('.gn-ticket-sheet__subtask-title')?.textContent).toBe('Order the brochures');
    expect(cardTwo.querySelector('.gn-ticket-sheet__subtask-title')?.textContent).toBe('Book the venue');
    expect(cardOne.querySelector('.gn-ticket-sheet__subtask-meta')?.textContent).toBe('To do · task');
    expect(cardTwo.querySelector('.gn-ticket-sheet__subtask-meta')?.textContent).toBe('Done · task');
  });

  /**
   * 17.041 (V8) — THE FALSE ALERT EVERY PARENT TICKET RAISED ON ITS ORDINARY
   * LOAD.
   *
   * `subtaskRows` was `subtasks.data ?? []`, so the in-flight window read as an
   * EMPTY list — and `useLiveQuery` resets `data` to `null` on every KEY change,
   * which the subtasks key does the moment the ticket read lands
   * (`${ticketId}:subtasks:${projectId}`). So for the whole second round trip
   * `subtaskRows.length` was 0 while `subtaskExpected` was the server's real
   * child count, `subtasksIncomplete` was true, and the section rendered a
   * `role="alert"` telling the person the list was *"not shown rather than shown
   * short"* — about a list that was merely still being read.
   *
   * The child read is held open here rather than raced: a slow promise makes the
   * window deterministic and lets the case assert BOTH ends of it.
   */
  it('PLANTED DEFECT: no false "not shown rather than shown short" alert while the child read is in flight', async () => {
    const read = ticketRead({ rollup: { totalChildren: 1, terminalChildren: 0, restrictedCount: 0 } });
    let release: () => void = () => undefined;
    const source = createFakeDataSource({
      getTicket: async () => read,
      getWorkflowDef: async () => WF_ERRAND,
      getMembers: async () => [],
      getTicketHistory: async () => [],
      getTickets: () =>
        new Promise((resolve) => {
          release = () =>
            resolve({ projectId: 'prj_f', rows: [child({ ticketId: 'tkt-s1', title: 'Order the brochures' })] });
        }),
    });
    renderSheet(read, source);
    await settled();

    // The ticket read has landed (the sheet is painted) and the child read has
    // not. NEITHER arm may be drawn: the alert would be a lie about a list
    // nobody has read yet, and the empty arm would be the same lie quieter.
    expect(screen.queryByTestId('sheet-subtasks-incomplete')).toBeNull();
    expect(screen.queryByTestId('sheet-subtasks-empty')).toBeNull();

    await act(async () => {
      release();
    });
    expect(await screen.findByTestId('subtask-tkt-s1')).toBeInTheDocument();
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

  it('E5-22 the subtask form NAMES the type the child will take', async () => {
    // An EPIC parent, which is the case the finding is about: the ladder here is
    // epic(1), task(3), sub-task(4), so `legal` for an epic is `task` and
    // `sub-task` — rule 1 takes the built-in `task`, and the Story rank that
    // would sit between them is skipped. On the DEFAULT fixture (a `task`) the
    // legal set is `sub-task` alone, which proves nothing about the rule.
    const read = ticketRead({ ticket: ticketStateSeed({ typeId: 'epic' }), rollup: null });
    const source = sheetSource(read, [], []);
    renderSheet(read, source);
    await settled();
    // The type is `subtaskTypeFor`'s choice and the render used to say nothing
    // about it.
    const target = await screen.findByTestId('sheet-subtask-target');
    expect(target.textContent).toBe('Adds a Task.');
    // And the sentence names the SAME type the submission carries — asserted
    // against the event rather than against a retyped literal, so the two cannot
    // drift apart.
    await userEvent.type(screen.getByTestId('sheet-subtask-title'), 'Book the venue');
    await userEvent.click(screen.getByTestId('sheet-subtask-add'));
    await waitFor(() => expect(source.ingested).toHaveLength(1));
    expect(source.ingested[0]![0]!.payload).toMatchObject({ typeId: 'task' });
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
      // ⚠ WAS `expect.any(String)`, AND THAT IS THE CHECK THAT LET THIS SHIP.
      // It asserts that SOME string is there and cannot see WHICH — so when
      // `addSubtask` sent the PARENT'S own type, this case stayed green while
      // every real press was refused by `hierarchy.rank`. The field that was
      // wrong was the one field the case declined to name. It is a literal
      // now: `sub-task` (rank 4) is the shallowest type in the default ladder
      // strictly deeper than this ticket's `task` (rank 3), and 16.92 is the
      // same assertion on the owner's own ladder.
      typeId: 'sub-task',
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
    // ⚠ REPOINTED 2026-09-20, because the id it named had lost its LAST
    // producer and the assertion could no longer fail. The owner's merge ruling
    // moved the restricted arm out of a chip and into the parent indicator, so
    // `sheet-parent-chip-restricted` renders nowhere; asserting on a testid with no
    // producer is a check that cannot fail wearing the costume of one that can. The
    // property it was written for — a root ticket draws NO restricted sentence — is
    // carried by the id the merged element actually wears.
    expect(screen.queryByTestId('sheet-parent-restricted')).toBeNull();
  });
});

/**
 * THE ADD-SUBTASK AFFORDANCE — cases `16.91`–`16.95`, 2026-09-20.
 *
 * The sheet OFFERED "Add subtask" on every ticket and the submission could
 * never succeed. `addSubtask` sent `typeId: state.typeId` — the PARENT'S OWN
 * type — and the engine refuses `type.rank <= parentType.rank`
 * (`packages/rule-engine/src/checks/hierarchy.ts:133`). A same-type child has
 * `rank <= rank`, so EVERY press was refused; the owner met it as
 * `"Errand" cannot go under "Errand"`, and that message was the SERVER being
 * right about a payload this client built wrong.
 *
 * **The ladder below is the owner's own**, read from the dev database on
 * 2026-09-20 (`proj_ticket_types`, workspace `0TZSS5W6ATCTF2YBPMWGGP9JF5`):
 * `errand` and `task` BOTH sit at rank 3, and `sub-task` at 4. So `errand` is a
 * WORKSPACE-DEFINED type sharing a built-in's rank, and it is the case a fix
 * hard-coded to `BUILTIN_TICKET_TYPE_SEEDS` gets wrong — it would agree with a
 * default workspace and disagree with the one the owner is looking at.
 *
 * **`DEEPEST_RANK` does NOT bound a child's rank** and these cases say so by
 * construction: the rule is `childRank > parentRank`, unbounded above.
 * `DEEPEST_RANK` (= 4) governs the ROOT-creation rule alone — a type at that
 * rank or below may not sit at project root (`hierarchy.ts:108`) — and the
 * domain docblock contemplates "a type defined at rank 7, smaller work still"
 * (`packages/domain/src/ticket-types.ts:126`).
 */
describe('the Add-subtask affordance', () => {
  const typeDef = (id: string, name: string, icon: string, rank: number): TicketTypeDef => ({
    id,
    name,
    icon,
    rank,
    workflowId: 'wf-errand',
    fields: [],
  });

  /** The owner's ladder, verbatim from the dev database. */
  const OWNER_LADDER = [
    typeDef('epic', 'Epic', 'flag', 1),
    typeDef('story', 'Story', 'book', 2),
    typeDef('task', 'Task', 'check', 3),
    typeDef('errand', 'Errand', 'bolt', 3),
    typeDef('sub-task', 'Sub-task', 'list', 4),
  ];

  it('16.91 WITHHOLDS the form when nothing in the ladder is deeper, and names THIS ticket’s type', async () => {
    // `sub-task` is the deep end of the owner's ladder, so no type can sit
    // under it. The sentence must name THIS ticket's type — the dispatch's
    // draft named `Errand`, which is FALSE: rank 4 is strictly greater than
    // rank 3, so a sub-task legally sits under an errand (16.92 is that arm).
    const read = ticketRead({ ticket: ticketStateSeed({ typeId: 'sub-task' }) });
    const source = sheetSource(read);
    source.query.getTicketTypes = async () => OWNER_LADDER;
    renderSheet(read, source);
    await settled();

    // THE AFFORDANCE IS GONE, not disabled: a disabled control still asserts
    // the action exists (`Features.md:88`'s rule for the New-ticket control).
    expect(screen.queryByTestId('sheet-subtask-add')).toBeNull();
    expect(screen.queryByTestId('sheet-subtask-title')).toBeNull();
    const withheld = await screen.findByTestId('sheet-subtask-withheld');
    expect(withheld).toHaveTextContent('This is a Sub-task — nothing smaller can sit under it.');
    // `status`, not `alert`: nothing has gone wrong and nothing was attempted —
    // the same role the New-ticket dialog's unavailable-parent sentence wears.
    expect(withheld).toHaveAttribute('role', 'status');

    // THE CONTROL, in the same run: one rank deeper and the form is BACK. A
    // withheld arm alone cannot tell "correctly withheld" from "never draws".
    cleanup();
    const deeper = ticketRead({ ticket: ticketStateSeed({ typeId: 'task' }) });
    const deeperSource = sheetSource(deeper);
    deeperSource.query.getTicketTypes = async () => OWNER_LADDER;
    renderSheet(deeper, deeperSource);
    await settled();
    expect(await screen.findByTestId('sheet-subtask-add')).toBeInTheDocument();
    expect(screen.queryByTestId('sheet-subtask-withheld')).toBeNull();
  });

  it('16.92 THE OWNER’S CASE: an Errand takes a subtask, and the child’s type is LEGAL — never the parent’s', async () => {
    const read = ticketRead({ ticket: ticketStateSeed({ typeId: 'errand' }) });
    const source = sheetSource(read);
    source.query.getTicketTypes = async () => OWNER_LADDER;
    renderSheet(read, source);
    await settled();

    await userEvent.type(screen.getByTestId('sheet-subtask-title'), 'Book the venue');
    await userEvent.click(screen.getByTestId('sheet-subtask-add'));

    await waitFor(() => expect(source.ingested).toHaveLength(1));
    const payload = source.ingested[0]![0]!.payload as { typeId: string; parentId: string };

    // THE DEFECT, pinned. This was `errand` — the parent's own type — and the
    // engine refused it with `hierarchy.rank`. Asserted in BOTH directions so
    // a fix that sent some other ILLEGAL type cannot pass by differing.
    expect(payload.typeId).not.toBe('errand');
    expect(payload.parentId).toBe(TICKET);
    // The ladder's shallowest type strictly deeper than rank 3 — and the
    // assertion is a LITERAL, because `expect.any(String)` is what let this
    // ship: it cannot see the one field that was wrong.
    expect(payload.typeId).toBe('sub-task');
  });

  it('16.93 an UNREADABLE ladder withholds the form and SAYS why — never a silent absence', async () => {
    // `Features.md:88`: the New-ticket dialog "is TOLD the parent list is
    // unavailable rather than handed an empty one". An empty ladder and an
    // unread one are different facts and only one of them is about the
    // workspace, so this arm must not render the 16.91 sentence.
    const read = ticketRead();
    const source = sheetSource(read);
    source.query.getTicketTypes = async () => {
      throw new Error('the type ladder is unavailable');
    };
    renderSheet(read, source);
    await settled();

    expect(screen.queryByTestId('sheet-subtask-add')).toBeNull();
    const withheld = await screen.findByTestId('sheet-subtask-withheld');
    // The server's/read's own words, carried — not a paraphrase of them.
    expect(withheld).toHaveTextContent('the type ladder is unavailable');
    expect(withheld).not.toHaveTextContent('nothing smaller can sit under it');

    // ARM TWO — the same property one step over, and it is a DIFFERENT fact:
    // the ladder READ FINE and simply does not hold this ticket's type, so its
    // rank — the whole input to the question — cannot be obtained. A case that
    // only threw would be satisfied by a fix that treated "unread" and
    // "this type is unknown here" as one state, and 16.26 already records that
    // an empty ladder is a shape the product really serves.
    cleanup();
    const unknown = ticketRead({ ticket: ticketStateSeed({ typeId: 'ghost-type' }) });
    const unknownSource = sheetSource(unknown);
    unknownSource.query.getTicketTypes = async () => OWNER_LADDER;
    renderSheet(unknown, unknownSource);
    await settled();

    expect(screen.queryByTestId('sheet-subtask-add')).toBeNull();
    const other = await screen.findByTestId('sheet-subtask-withheld');
    expect(other).toHaveTextContent('not in the workspace');
    expect(other).not.toHaveTextContent('the type ladder is unavailable');
  });

  it('16.94 the built-in `Task` is preferred ONLY where it is legal — and its absence withholds nothing', async () => {
    // The trap the dispatch named, in BOTH directions, because either arm
    // alone is passed by a rule nobody wants. A fix that looked for the
    // built-in id `task` and DID NOT FALL BACK withholds arm one's ticket; a
    // rule that never preferred it passes arm one and fails arm two.
    //
    // ARM ONE — no `Task` in this workspace's ladder at all.
    const read = ticketRead({ ticket: ticketStateSeed({ typeId: 'story' }) });
    const source = sheetSource(read);
    source.query.getTicketTypes = async () => [
      typeDef('epic', 'Epic', 'flag', 1),
      typeDef('story', 'Story', 'book', 2),
      typeDef('chore', 'Chore', 'broom', 3),
    ];
    renderSheet(read, source);
    await settled();

    await userEvent.type(screen.getByTestId('sheet-subtask-title'), 'Sweep up');
    await userEvent.click(screen.getByTestId('sheet-subtask-add'));
    await waitFor(() => expect(source.ingested).toHaveLength(1));
    const payload = source.ingested[0]![0]!.payload as { typeId: string };
    expect(payload.typeId).toBe('chore');

    // ARM TWO — `Task` IS in the ladder and IS legal, and it WINS over the
    // shallowest legal type. Under an `epic` (rank 1) with the owner's ladder
    // the shallowest legal child is `story` (rank 2); the prototype births a
    // subtask as `Task` (`desktop.dc.html:3654`), so `task` is the answer.
    // Without this arm, dropping the preference entirely would go unnoticed.
    cleanup();
    const epic = ticketRead({ ticket: ticketStateSeed({ typeId: 'epic' }) });
    const epicSource = sheetSource(epic);
    epicSource.query.getTicketTypes = async () => OWNER_LADDER;
    renderSheet(epic, epicSource);
    await settled();

    await userEvent.type(screen.getByTestId('sheet-subtask-title'), 'Order the brochures');
    await userEvent.click(screen.getByTestId('sheet-subtask-add'));
    await waitFor(() => expect(epicSource.ingested).toHaveLength(1));
    const epicPayload = epicSource.ingested[0]![0]!.payload as { typeId: string };
    expect(epicPayload.typeId).toBe('task');
    expect(epicPayload.typeId).not.toBe('story');
  });

  it('16.95 while the ladder is still unread NOTHING is offered and NOTHING is claimed — and it arrives', async () => {
    // Two properties, and the second is what stops the first being a lie. An
    // absent control may mean "not yet" or "not ever"; only the arrival
    // distinguishes them, so both arms are in one case. Claiming the
    // NO-DEEPER-TYPE sentence here would assert an absence we have not read.
    let answer: ((rows: TicketTypeDef[]) => void) | undefined;
    const pending = new Promise<TicketTypeDef[]>((resolve) => {
      answer = resolve;
    });
    const read = ticketRead();
    const source = sheetSource(read);
    source.query.getTicketTypes = () => pending;
    renderSheet(read, source);
    await settled();

    expect(screen.queryByTestId('sheet-subtask-add')).toBeNull();
    expect(screen.queryByTestId('sheet-subtask-withheld')).toBeNull();

    await act(async () => {
      answer!(OWNER_LADDER);
    });
    expect(await screen.findByTestId('sheet-subtask-add')).toBeInTheDocument();
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

    // ⚠ UPDATED 2026-09-20 BY THE OWNER'S MERGE RULING, not deleted. The
    // restricted arm used to be a chip in the SUBTASKS header worded `Subtask of
    // a restricted parent`. The owner moved the badge up into the parent
    // indicator and ruled that arm keeps ITS sentence — so this arm is now
    // `Restricted parent — exists, but you can't see it`, the words the sheet
    // has used for this fact all along. **The properties this case exists for
    // are unchanged and every one is still asserted below.**
    const pill = await screen.findByTestId('sheet-parent-restricted');
    expect(pill.textContent).toBe("Restricted parent — exists, but you can't see it");
    // NOT a control: the restricted arm carries no project and no title, so
    // there is nothing to open and nothing to name — and case 6.14 asserts a
    // direct read of that parent 404s.
    expect(pill.tagName).toBe('SPAN');
    // The arm EXISTS rather than being omitted, and that is the ruling's second
    // half: an absent arm reads as "no parent", which is a different claim
    // from "a parent you may not see" — the same distinction `16.22`'s sibling
    // cases draw between a restricted parent and `At project root`.
    expect(screen.queryByText('At project root')).toBeNull();
    // The id the read DID send is not rendered here. 3.73 owns this property on
    // the sheet's own parent row; asserted again because this indicator is a
    // SECOND surface for the same fact, and a second surface is where a leak
    // recurs.
    expect(document.body.textContent).not.toContain('secret-parent');
    expect(onOpenTicket).not.toHaveBeenCalled();
    // AND the subtasks header no longer carries a second copy of this fact —
    // the duplication the owner ruled away. A chip there would be the bug this
    // merge fixed, so its absence is asserted rather than assumed.
    expect(screen.queryByTestId('sheet-parent-chip')).toBeNull();
  });
});

/**
 * Door G, 2026-09-19 — PRIORITY, DUE, START and TYPE as first-class rows.
 * Cases `16.23`–`16.30` and `16.100`–`16.105`.
 *
 * **They are NOT all the same kind of thing, and that is the point of the
 * task.** Type is a domain concept; Due and Start are domain concepts AND
 * built-in fields; Priority WAS a custom-field convention with no domain
 * concept at all, and is the **fifth built-in** since spec 2026-09-22. A
 * section that drew them as though they were alike would be the defect the
 * dispatch names — *"a difference in what the sheet CLAIMS TO BE, not just
 * layout"*.
 *
 * **And two of the prototype's three are EDITORS there, which was a separate
 * door.** `16.29` asserted the READ-ONLY half so that making them editable
 * later would be a decision rather than a drift — the same shape as F's
 * `16.22`.
 *
 * **THAT DECISION WAS TAKEN, TWICE, AND THIS DOCBLOCK IS THE RECORD OF IT.**
 * Due first (ruling E5-6, 2026-09-21): every surface in this product READS a
 * due date — My Work's overdue count, the List's due column, the Calendar, the
 * Timeline, the due-soon notification — and none could set one, while the
 * deferral lived in a catalogue record and the manual rather than in front of
 * the person. Then Priority and Start (spec 2026-09-22), which closed the door
 * outright. The editor's own write behaviour is `13.1178` for Due; `16.100`–
 * `16.103` cover Priority's control and Start's box.
 *
 * ⚠ **THIS PARAGRAPH ENDED *"Priority is STILL that unbuilt door and `16.29`
 * still asserts it as an absence"* UNTIL 2026-09-22, and that sentence was
 * FALSE FROM THE MOMENT TASK 7 OF THE PRIORITY PLAN LANDED.** It is corrected
 * here rather than deleted because it is the record of what made each half a
 * decision on the record — and because the source file's door G docblock was
 * rewritten in that same commit while this file's copy, one level up from the
 * cases it describes, was missed: prose is the one artifact no check reads,
 * and the spec that ordered the rewrite named the SOURCE file's line range.
 * **Type is the ONE row left read-only on both sides**, which is what the
 * prototype draws.
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
    // ⚠ THREE since 2026-09-22, and this line used to assert TWO. The absence
    // was pinned while the question of the authority's third tab was open; the
    // owner ruled it IN (spec 2026-09-22 decision 5 — "add the Attachments
    // tab"), so the case now asserts the ruled shape rather than the absence.
    expect(tabs.map((t) => t.textContent)).toEqual(['Details', 'History', 'Attachments']);
    expect(tabs).toHaveLength(3);

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

/**
 * TASK 3 of `docs/superpowers/plans/2026-09-22-sheet-prototype-parity.md` — the
 * header's chips line, the parent line under it, and the third tab.
 *
 * The prototype draws, under the title, a chips line carrying the state chip and
 * the `Restricted` chip, then the tabs — Details · History · **Attachments**
 * (`desktop.dc.html:1128-1140`). This build drew the state chip inside the
 * Details body, the parent line beneath it, and TWO tabs. The moves are asserted
 * pairwise by `compareDocumentPosition` rather than by index into markup, which
 * a whitespace or wrapper change would move.
 *
 * ⚠ The prototype's third element on that line — *Recorded in this browser ·
 * 12:04:18* — is **deliberately NOT drawn** and no case asks for it: nothing in
 * our data is that clock, and inventing one is forbidden (spec decision 2).
 */
describe('sheet prototype parity — the header, the parent line and the tabs', () => {
  /** The same shape `16.57` uses, local because that describe's fixture is its own. */
  const ENTRY: AttachmentListEntry = {
    kind: 'upload',
    attachmentId: '01J9GATA000000000000000000',
    filename: 'gst-receipt.pdf',
    mime: 'application/pdf',
    size: 48211,
    sha256: null,
  };

  it('16.110 the chips line sits under the title — the state chip, the Restricted chip when the audience is explicit, and the Closed chip when closed — and it precedes the tablist', async () => {
    // ARM ONE — the state chip and the Restricted chip. `explicit` is the one
    // resolved mode the second chip is drawn for, and this fixture names it on
    // BOTH halves of the pair the read carries.
    renderSheet(ticketRead({ visibility: { ownMode: 'explicit', resolvedMode: 'explicit' } }));
    await settled();
    const chips = screen.getByTestId('sheet-chips');
    expect(within(chips).getByText('Doing')).toBeInTheDocument();
    expect(within(chips).getByText('Restricted')).toBeInTheDocument();
    // It sits ABOVE the tablist — under the title, where the prototype draws it.
    const tablist = screen.getByRole('tablist', { name: 'Ticket sections' });
    expect(chips.compareDocumentPosition(tablist) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    cleanup();

    // ARM TWO — the Closed chip. It MOVED here from the state line in this same
    // change (the `gn-sheet__closed-badge` span was removed from the row), so
    // this arm also witnesses the sentence is drawn exactly ONCE: a change that
    // added the chip without removing the badge would leave a reader with two
    // identical sentences and no way to tell which was the record.
    const read = ticketRead({
      ticket: ticketStateSeed({
        stateId: 'done',
        stateCategory: 'terminal',
        closed: { actorId: 'user_anselma', at: '2026-08-20T19:00:00.000Z' },
      }),
    });
    renderSheet(read, sheetSource(read));
    await screen.findByText('Closed by Anselma Marak on 21 Aug 2026');
    expect(
      within(screen.getByTestId('sheet-chips')).getByText('Closed by Anselma Marak on 21 Aug 2026'),
    ).toBeInTheDocument();
    expect(screen.getAllByText('Closed by Anselma Marak on 21 Aug 2026')).toHaveLength(1);
  });

  it('16.110 CONTROL — a project-visible ticket draws NO Restricted chip', async () => {
    // The control 16.110's first arm needs: its assertion is that a chip IS
    // drawn, and `getByText('Restricted')` would pass just as happily on a build
    // that drew the chip for EVERY ticket. The default seed is the ordinary
    // `inherit`/`project` pair, so nothing here is a mode the product cannot
    // produce.
    renderSheet(ticketRead());
    await settled();
    expect(within(screen.getByTestId('sheet-chips')).queryByText('Restricted')).toBeNull();
  });

  it('16.111 the attachment list renders under the Attachments tab and NOT under Details', async () => {
    renderSheet(ticketRead(), sheetSource(ticketRead()), { attachments: [ENTRY] });
    await settled();
    // FIRST the absence, under the tab a reader lands on — this is the half the
    // move is: the list used to be drawn in Details, and a change that ADDED the
    // third tab without removing the old mount would pass a presence-only case.
    expect(screen.queryByText('gst-receipt.pdf')).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: 'Attachments' }));
    expect(screen.getByText('gst-receipt.pdf')).toBeInTheDocument();
    // And the tab is a SWAP, not an addition: Details' own content is gone while
    // it is open.
    expect(screen.queryByTestId('field-description')).toBeNull();
  });

  it('16.112 the parent indicator follows the chips line and precedes the tabs', async () => {
    renderSheet(ticketRead());
    await settled();
    const chips = screen.getByTestId('sheet-chips');
    const parent = screen.getByTestId('sheet-parent-indicator');
    const tablist = screen.getByRole('tablist', { name: 'Ticket sections' });
    expect(chips.compareDocumentPosition(parent) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(parent.compareDocumentPosition(tablist) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

/**
 * TASK 4 of `docs/superpowers/plans/2026-09-22-sheet-prototype-parity.md` — the
 * description above the grid, the State row, the deleted generic `title` row, the
 * alternating tinted rows, and the sheet-side mount of `VisibilityEditor` into the
 * `field-visibility` row (Task 5's leftover).
 *
 * ⚠ **THE PLAN'S OWN `ids` ARRAY WAS STALE AND IS CORRECTED HERE.** It read
 * `field-description · field-state · field-assignee · field-priority · field-due ·
 * field-type · field-visibility · sheet-subtasks · sheet-comments`. **`field-start`
 * is missing from it**, and the reason is a sequencing fact rather than an
 * oversight in the plan's own frame: the Start row was added by the PRIORITY
 * BUILT-IN lane (its Task 7), which landed on this branch after the plan text was
 * written, and it sits between Due and Type there. A case built from the plan's
 * array would have asserted an order that skips a row the sheet really draws.
 */
describe('sheet prototype parity — the details body order and chrome', () => {
  it('16.113 the Details sections stand in the prototype order', async () => {
    renderSheet(ticketRead());
    await settled();
    // `field-start` IS here, and the plan's array did not have it — see the
    // describe's own note. Read off the SHIPPED file rather than the plan text.
    const ids = [
      'field-description',
      'field-state',
      'field-assignee',
      'field-priority',
      'field-due',
      'field-start',
      'field-type',
      'field-visibility',
      'sheet-subtasks',
      'sheet-comments',
    ];
    const nodes = ids.map((id) => screen.getByTestId(id));
    for (let i = 1; i < nodes.length; i += 1) {
      expect(
        nodes[i - 1]!.compareDocumentPosition(nodes[i]!) & Node.DOCUMENT_POSITION_FOLLOWING,
        `${ids[i - 1]} before ${ids[i]}`,
      ).toBeTruthy();
    }
  });

  it('16.114 the State row holds the state chip, its provenance and the Move… button — no select', async () => {
    renderSheet(ticketRead());
    await settled();
    const row = screen.getByTestId('field-state');
    expect(within(row).getByText('Doing')).toBeInTheDocument();
    expect(within(row).getByText(PROVENANCE_LINE)).toBeInTheDocument();
    expect(within(row).getByRole('button', { name: 'Move…' })).toBeInTheDocument();
    // The prototype's State row is a `<select>` that sets a state directly, and
    // that is the half of it this build REFUSES: a transition is rule-driven
    // (`require-comment`, `require-evidence`, `require-field`), so a select would
    // bypass the rules. Both spellings of "a control that picks a state" are
    // asserted absent, because `combobox` and `select` are not the same query.
    expect(row.querySelector('select')).toBeNull();
    expect(within(row).queryByRole('combobox')).toBeNull();
  });

  it('16.115 the title is edited in the header and draws NO generic field row', async () => {
    renderSheet(ticketRead());
    await settled();
    // The generic loop drew a second, read-only `title` row because its exclusion
    // list named `description`, `dueDate` and `priority` but not `title`. The
    // title is edited in the header (`titleSlot`), so the row was a duplicate of
    // the header control — nothing is lost by deleting it.
    expect(screen.queryByTestId('field-title')).toBeNull();
    // The positive control: the title really is still on the sheet, in the header,
    // so "no field-title" cannot pass for a build that dropped the title.
    expect(screen.getByLabelText('Ticket title')).toHaveValue('File the GST return');
  });

  it('16.116 every second row of the grid is tinted, by class', async () => {
    renderSheet(ticketRead());
    await settled();
    const rows = [
      ...(screen.getByTestId('field-state').parentElement as HTMLElement).querySelectorAll(
        '.gn-ticket-sheet__field',
      ),
    ];
    // The count is asserted first: the loop below is a `forEach`, and a grid that
    // rendered NO rows would pass it by running zero times.
    expect(rows.length).toBeGreaterThanOrEqual(6);
    rows.forEach((row, index) => {
      expect(row.classList.contains('gn-ticket-sheet__field--tinted'), `row ${index}`).toBe(
        index % 2 === 1,
      );
    });
  });

  it('16.117 the description block precedes the grid and keeps its caption as the editor’s name', async () => {
    renderSheet(ticketRead());
    await settled();
    const block = screen.getByTestId('field-description');
    const grid = screen.getByTestId('field-state').closest('dl')!;
    expect(block.compareDocumentPosition(grid) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // The `id` is load-bearing rather than decorative: it is what the mounted
    // `EditorSlot`'s `labelledBy` points at, so the words a sighted reader sees and
    // the name a screen reader announces are the SAME NODE. It survives the move
    // out of the `<dl>` into its own section.
    expect(block.querySelector('#gn-ticket-sheet-description-label')).not.toBeNull();
  });

  it('16.117 CONTROL — the description block is NOT inside the grid', async () => {
    renderSheet(ticketRead());
    await settled();
    const grid = screen.getByTestId('field-state').closest('dl')!;
    // The direction 16.117's order assertion cannot see: a block moved to the top
    // of the `<dl>` would also precede `field-state`, and the prototype puts it
    // above the grid ENTIRELY. `closest('dl')` from the block is the measurement.
    expect(grid.contains(screen.getByTestId('field-description'))).toBe(false);
  });

  /**
   * `16.129` — THE TINT ALTERNATION CONTINUES ACROSS THE SEAM, and this case
   * exists because **every other case in the file is green over the defect it
   * catches.**
   *
   * ⚠ **THE HOLE, MEASURED.** The fixed rows take literal indices 0–6, and the
   * generic custom-field loop takes `FIXED_FIELD_ROWS + rowIndex` — a constant
   * whose whole purpose is to CONTINUE the alternation past the fixed rows
   * instead of restarting it at zero, which would put two tinted rows side by
   * side at the seam. `16.116` is the only case that reads the tint, and it
   * renders the DEFAULT fixture whose `state.fields` is `{title, dueDate}` —
   * **both excluded by the loop's own exclusion list** — so the loop renders
   * nothing, `FIXED_FIELD_ROWS + rowIndex` never evaluates, and the constant is
   * unconstrained. Verified by mutation before this case was written:
   * `FIXED_FIELD_ROWS = 6` (a stale value that ships the doubled band) left
   * **160 of 160 cases PASSING.** The suite was green over the defect.
   *
   * ⚠ **AND THE COMMENT THIS REPLACES CLAIMED OTHERWISE.** The catalogue and the
   * constant's own docblock both said a stale constant "reddens `16.116`". It
   * cannot: that case never renders a loop row. A witness is a fact about ONE
   * fixture, and the fixture was the wrong one — which is the same shape as the
   * `16.15` defect above (a property asserted through a fixture that cannot
   * exercise it) one task later.
   *
   * So the fixture here carries a CUSTOM field, the loop really runs, and both
   * directions are read: the grid alternates end to end, AND the specific seam —
   * the last fixed row untinted, the first loop row tinted.
   */
  it('16.129 the tint alternation continues across the seam into the custom-field loop', async () => {
    const read = ticketRead({
      ticket: ticketStateSeed({
        fields: {
          title: {
            value: 'File the GST return',
            actorId: 'user_kiro',
            clientTime: '2026-08-18T07:59:00.000Z',
            serverTime: '2026-08-18T08:00:00.000Z',
          },
          // A field the loop does NOT exclude, so `rowIndex` really runs. Its
          // name is arbitrary: what matters is that it is not one of the seven
          // fixed rows' ids nor one of the loop's four exclusions.
          counterparty: {
            value: 'Anselma Marak',
            actorId: 'user_kiro',
            clientTime: '2026-08-18T08:04:00.000Z',
            serverTime: '2026-08-18T08:05:00.000Z',
          },
        },
      }),
    });
    renderSheet(read);
    await settled();

    const grid = screen.getByTestId('field-state').closest('dl') as HTMLElement;
    const rows = [...grid.querySelectorAll('.gn-ticket-sheet__field')];
    // The CONTROL for the whole case: without a rendered loop row there is no
    // seam to read, and every assertion below would be about the fixed rows
    // only — which is exactly how the constant went unconstrained.
    expect(screen.getByTestId('field-counterparty')).toBeInTheDocument();
    expect(rows).toHaveLength(8);

    // (1) The grid alternates END TO END, loop rows included.
    rows.forEach((row, index) => {
      expect(row.classList.contains('gn-ticket-sheet__field--tinted'), `row ${index}`).toBe(
        index % 2 === 1,
      );
    });
    // (2) AND THE SEAM ITSELF, named rather than left to the loop above: the last
    // FIXED row (Visibility, index 6) is untinted and the first LOOP row is
    // tinted. This is the pair a stale `FIXED_FIELD_ROWS` collapses, and it is
    // asserted on the two elements by id so a mis-set constant reports the seam
    // rather than an opaque index.
    expect(
      screen.getByTestId('field-visibility').classList.contains('gn-ticket-sheet__field--tinted'),
    ).toBe(false);
    expect(
      screen.getByTestId('field-counterparty').classList.contains('gn-ticket-sheet__field--tinted'),
    ).toBe(true);
  });
});

/**
 * TASK 6 of `docs/superpowers/plans/2026-09-22-sheet-prototype-parity.md` — the
 * subtask rows become CARDS, the heading wears the sheet's caption, and the add
 * row goes inline.
 *
 * ⚠ **THE PLAN SAID THE EXISTING SUBTASK CASES WOULD PASS UNCHANGED, AND `16.15`
 * DOES NOT.** It asserts each row's `textContent` as one exact string
 * (`'Order the brochures · To do'`), which is precisely the assertion a card
 * changes — the row is now a title element and a chip row. That case is amended in
 * this change rather than the card being bent to fit it, and the amendment KEEPS
 * the property it was written for (see its own comment).
 */
describe('sheet prototype parity — the subtasks section', () => {
  const child = (over: Partial<ListRow> = {}): ListRow => listRowSeed({ parentId: TICKET, ...over });

  it('16.123 the Subtasks heading wears the caption class (uppercase by CSS, text unchanged)', async () => {
    renderSheet(ticketRead());
    await settled();
    const heading = within(screen.getByTestId('sheet-subtasks')).getByText(/^Subtasks/);
    expect(heading.className).toContain('gn-ticket-sheet__caption');
    // ⚠ AND THE WORDS ARE NOT RETYPED. The prototype draws `SUBTASKS`; this build
    // gets the caps from `text-transform`, which is PAINT and not content — so
    // every `getByText` on this heading in every other case keeps matching, and
    // this arm is what stops a later "just write it in caps" edit from looking
    // like the same thing.
    expect(heading.textContent).toMatch(/^Subtasks/);
    expect(heading.textContent).not.toContain('SUBTASKS');
  });

  it('16.124 each subtask is a card: the title, then a chip row carrying the state chip and `type · Due day`', async () => {
    const kid = child({
      ticketId: 'kid',
      title: 'Mint tokens',
      typeId: 'task',
      stateName: 'Blocked',
      stateCategory: 'open',
      dueDate: { date: '2026-09-10', claim: claim() },
    });
    const read = ticketRead({ rollup: { totalChildren: 1, terminalChildren: 0, restrictedCount: 0 } });
    renderSheet(read, sheetSource(read, [], [kid]));
    await settled();

    const card = screen.getByTestId('subtask-kid');
    expect(card.className).toContain('gn-ticket-sheet__subtask-card');
    expect(within(card).getByText('Mint tokens').className).toContain('gn-ticket-sheet__subtask-title');
    // The state is a CHIP now, not a bare span — asserted on the class rather
    // than on the words, because the chip is the change.
    expect(within(card).getByText('Blocked').className).toContain('gn-chip');
    // The detail line names the child's TYPE and, when it has one, its due day —
    // through the ONE date renderer, never a raw ISO slice.
    //
    // ⚠ READ AS THE ELEMENT'S `textContent`, NOT THROUGH `getByText`, and the
    // reason is the PROPERTY rather than a workaround: the leading ` · ` is the
    // separator that keeps this line from reading as `To dotask` in the same row,
    // so the assertion's subject is the exact string INCLUDING it. A text query
    // compares a normalized form, and a normalized comparison is the wrong
    // instrument for a claim about a character. (**`getByText` did not resolve
    // this string on the first run and I did NOT establish why** — the codepoints
    // on both sides are the same `U+00B7`, and the mechanism is not recorded here
    // because it was not measured. What is recorded is the probe that works.)
    expect(card.querySelector('.gn-ticket-sheet__subtask-detail')?.textContent).toBe(
      ` · task · Due ${formatDate('2026-09-10')}`,
    );
  });

  it('16.124 CONTROL — a child with NO due day draws the type alone, and no dangling separator', async () => {
    const kid = child({ ticketId: 'kid', title: 'Mint tokens', typeId: 'task', dueDate: null });
    const read = ticketRead({ rollup: { totalChildren: 1, terminalChildren: 0, restrictedCount: 0 } });
    renderSheet(read, sheetSource(read, [], [kid]));
    await settled();
    const card = screen.getByTestId('subtask-kid');
    // The direction 16.124 cannot see: its fixture HAS a due day, so a build that
    // rendered ` · task · Due ` unconditionally would print a separator with
    // nothing after it and pass. `No date claimed` is deliberately NOT drawn here
    // — the card is a summary, and the child's own sheet is where an absence is
    // stated.
    expect(card.querySelector('.gn-ticket-sheet__subtask-detail')?.textContent).toBe(' · task');
    expect(card.textContent).not.toContain('Due');
  });

  it('16.125 the add row is one line: the input carries its label as placeholder AND accessible name, and the button sits beside it', async () => {
    renderSheet(ticketRead());
    await settled();
    // ⚠ THE ACCESSIBLE NAME IS THE WHOLE PROPERTY. The visible `New subtask title`
    // label became the input's placeholder, so `getByLabelText` — which every
    // pre-existing add-subtask case uses — must keep resolving. It does, through
    // `aria-label`, and this asserts the two agree.
    const input = screen.getByLabelText('New subtask title');
    expect(input).toHaveAttribute('placeholder', 'New subtask title');
    expect(input.closest('.gn-ticket-sheet__subtask-add')).not.toBeNull();
    expect(
      screen.getByRole('button', { name: 'Add subtask' }).closest('.gn-ticket-sheet__subtask-add'),
    ).toBe(input.closest('.gn-ticket-sheet__subtask-add'));
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
    // ⚠ AMENDED 2026-09-22 (priority built-in, spec 2026-09-22). This read
    // `getByText('No priority claimed')`, which was the CUSTOM-FIELD-CONVENTION
    // absence: priority existed only when a type declared such a field. It is
    // the fifth built-in now and the row is the prototype's segmented EDITOR, so
    // what `bare()` produces is not "this ticket has no priority" — that state
    // no longer exists — but "this READ carries no claim", which is a stale
    // projection. Case `16.104` owns that sentence and the unselected control;
    // this case keeps only the claim it was written for, that the row is DRAWN.
    expect(
      within(screen.getByTestId('field-priority')).getByRole('tablist', { name: 'Priority' }),
    ).toBeInTheDocument();
    // The START row joins them (spec 2026-09-22) — a built-in since Plan 3 that
    // the sheet never drew, so this row is new rather than moved.
    expect(screen.getByTestId('field-start')).toBeInTheDocument();
    expect(
      within(screen.getByTestId('field-start')).getByText('No date claimed'),
    ).toBeInTheDocument();
    // And the same for Due's own absence, the prototype's sentence.
    expect(within(screen.getByTestId('field-due')).getByText('No date claimed')).toBeInTheDocument();
  });

  it('16.24 Due renders the claimed day AND its claim line — both halves', async () => {
    renderSheet(ticketRead());
    await settled();

    const row = screen.getByTestId('field-due');
    // BOTH, in one case: a row that drew the day without the claim would be a
    // standing property rather than a claim, which is the rule every other row
    // on this sheet keeps.
    //
    // ⚠ AMENDED BY RULING E5-6 (2026-09-21). The day half used to be
    // `getByText('30 Aug 2026')` over a read-only span. The export's row draws
    // an `<input type="date">` and no such span (`desktop.dc.html:1200-1203`),
    // so the day now renders as that control's value — the ISO day, which is
    // what a `type="date"` holds and what the event carries. The "both halves"
    // assertion is unchanged in substance: the day is still drawn, and the
    // attribution still travels with it.
    expect(within(row).getByLabelText('Due date')).toHaveValue('2026-08-30');
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

  it('16.27 Priority renders the claim as the SELECTED segment with its claim line — it is a BUILT-IN now', async () => {
    // ⚠ AMENDED 2026-09-22 (spec 2026-09-22), and the retitle is the amendment.
    // This read "it is a CONVENTION, not a built-in" and reached the claimed
    // case by the ticket carrying a field the type happened to declare. Priority
    // is the fifth built-in, so the claimed case is the ORDINARY one — every
    // ticket has a claim from birth — and the value now renders as the selected
    // segment of the prototype's control rather than as loose text.
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
    // THREE segments, and the claim's own level is the selected one. Asserting
    // all three states and not just `P1`'s: a control that marked every segment
    // selected, or none, would pass a one-sided assertion.
    expect(within(row).getByRole('tab', { name: 'P1' })).toHaveAttribute('aria-selected', 'true');
    expect(within(row).getByRole('tab', { name: 'P2' })).toHaveAttribute('aria-selected', 'false');
    expect(within(row).getByRole('tab', { name: 'P3' })).toHaveAttribute('aria-selected', 'false');
    expect(within(row).getByText('set by Anselma Marak on 18 Aug 2026')).toBeInTheDocument();
  });

  it('16.28 draws NO second row for a field that now has its own — the exclusion', async () => {
    // `ticketRead()` carries `dueDate` in `state.fields`, which the generic
    // field loop used to render as `field-dueDate`. It now has its own row, so
    // the loop must SKIP it — otherwise the sheet shows two rows for one claim.
    renderSheet(ticketRead());
    await settled();

    expect(screen.getByTestId('field-due')).toBeInTheDocument();
    expect(screen.queryByTestId('field-dueDate')).toBeNull();
    // `startDate` joins the exclusion for the same reason, one rung milder: the
    // Start row this change adds draws its own `field-start`, and the generic
    // loop would otherwise draw a SECOND row for the same claim.
    expect(screen.queryByTestId('field-startDate')).toBeNull();
    // And exactly ONE `field-priority`: the segmented editor is the only row for
    // that claim. `getAllByTestId` rather than `queryByTestId(...)` being null,
    // because the failure this guards against is a SECOND row — an absence
    // assertion would pass for a sheet that drew none at all.
    expect(screen.getAllByTestId('field-priority')).toHaveLength(1);
    // And one node, not two: the date appears exactly once on the sheet.
    //
    // ⚠ AMENDED BY RULING E5-6. This read `getAllByText('30 Aug 2026')` and
    // asserted a length of 1. The due day is no longer loose text on this sheet
    // at all — it is the editor's value (see 16.24) — so the same "one node,
    // not two" property is asserted on the nodes the row actually draws: ONE
    // date control, and NO second rendering of the day as text, which is the
    // second row's signature.
    expect(screen.getAllByLabelText('Due date')).toHaveLength(1);
    expect(screen.queryByText('30 Aug 2026')).toBeNull();
  });

  it('16.29 Priority, Due and Start are EDITORS; Type is read-only', async () => {
    // The prototype draws Priority as a segmented control with click handlers
    // and Due as an `<input type="date">` (`desktop.dc.html:1192-1205`); only
    // Type is read-only there.
    //
    // ⚠ AMENDED TWICE, and both amendments are the record of a decision taken
    // rather than a drift. RULING E5-6 (2026-09-21) made DUE an editor here —
    // `apps/web` could read a due date in four places and set it in none — so
    // this case stopped pinning the uniform read-only absence and started
    // pinning the split. SPEC 2026-09-22 (the priority built-in) took the other
    // half of the prototype's own shape: PRIORITY is now an editor too, and the
    // START row that change adds is Due's twin. **Type is the ONE row left
    // read-only**, which is exactly what the prototype draws there.
    //
    // Each editor is asserted POSITIVELY — its own control is present — so the
    // case cannot pass by a control silently disappearing, and the read-only
    // half is asserted as an absence the way `16.22` does for F's chip, so
    // "read-only" is a claim somebody checked.
    renderSheet(ticketRead());
    await settled();

    expect(screen.getByTestId('field-due').querySelector('input')).not.toBeNull();
    expect(screen.getByTestId('field-start').querySelector('input')).not.toBeNull();
    expect(within(screen.getByTestId('field-priority')).getAllByRole('tab')).toHaveLength(3);

    // TYPE — still read-only.
    const typeRow = screen.getByTestId('field-type');
    expect(typeRow.querySelector('input')).toBeNull();
    expect(typeRow.querySelector('select')).toBeNull();
    expect(typeRow.querySelector('button')).toBeNull();
  });

  /** A ticket whose birth claim is P2 — the ordinary shape, and the one this
   *  change makes EVERY ticket carry. */
  const withPriority = (value: 'P1' | 'P2' | 'P3'): TicketRead =>
    ticketRead({
      ticket: ticketStateSeed({
        fields: {
          ...ticketRead().ticket.fields,
          priority: {
            value,
            actorId: 'user_kiro',
            clientTime: '2026-08-18T08:06:00.000Z',
            serverTime: '2026-08-18T08:07:00.000Z',
          },
        },
      }),
    });

  it('16.100 clicking a different segment submits ONE ticket.field_set carrying that level', async () => {
    const source = renderSheet(withPriority('P2'));
    await settled();
    fireEvent.click(within(screen.getByTestId('field-priority')).getByRole('tab', { name: 'P1' }));
    await waitFor(() => expect(source.ingested).toHaveLength(1));
    expect(source.ingested[0]![0]!.type).toBe('ticket.field_set');
    // `toEqual`, never `toMatchObject`: the envelope must carry EXACTLY this
    // composition, so a row that re-spelled the fieldId or wrapped the level in
    // an object would be a different claim about the ledger.
    expect(source.ingested[0]![0]!.payload).toEqual({ fieldId: 'priority', value: 'P1' });
  });

  it('16.101 CONTROL — clicking the SELECTED segment submits nothing (there is nothing to clear to)', async () => {
    // The prototype's control has no clear affordance and neither does this one
    // (spec 2026-09-22: priority "is always there", with no clearing claim), so
    // a click on the segment already selected is a no-op. The other segment is
    // reached in the same run by `16.100`, which is what makes this zero mean
    // "the guard" rather than "the control does nothing".
    const source = renderSheet(withPriority('P2'));
    await settled();
    fireEvent.click(within(screen.getByTestId('field-priority')).getByRole('tab', { name: 'P2' }));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(source.ingested).toHaveLength(0);
  });

  it('16.102 a REFUSED priority keeps the previous segment selected and prints the refusal beside the row', async () => {
    const read = withPriority('P2');
    const source = sheetSource(read);
    source.ingest = async () => [
      { status: 'refused', rule: 'field.type-mismatch', reason: '"Priority" needs one of P1, P2 or P3.' } as IngestResult,
    ];
    renderSheet(read, source);
    await settled();
    fireEvent.click(within(screen.getByTestId('field-priority')).getByRole('tab', { name: 'P3' }));
    // A REGEX, not the sentence: the sheet renders one concatenated line —
    // `Refused by the server — <rule>: <reason>` — so an exact-string matcher
    // would be asking for an element whose whole text is the reason alone, and
    // there is none. Unanchored, so it matches the reason inside the sentence.
    expect(await screen.findByText(/needs one of P1, P2 or P3/)).toBeInTheDocument();
    // The SELECTION did not move: the claim on the ledger is still P2, and a
    // control that had adopted the refused level would be showing a value
    // nobody recorded — the same rule the Due row's refusal arm keeps.
    expect(
      within(screen.getByTestId('field-priority')).getByRole('tab', { name: 'P2' }),
    ).toHaveAttribute('aria-selected', 'true');
  });

  it('16.103 the Start row is a date editor like Due: a changed day submits field_set startDate', async () => {
    const source = renderSheet(ticketRead());
    await settled();
    const input = screen.getByLabelText('Start date');
    fireEvent.change(input, { target: { value: '2026-09-01' } });
    fireEvent.blur(input);
    await waitFor(() => expect(source.ingested).toHaveLength(1));
    expect(source.ingested[0]![0]!.payload).toEqual({
      fieldId: 'startDate',
      value: { date: '2026-09-01' },
    });
  });

  it('16.104 a ticket read with NO priority claim says the projection is stale — never "No priority claimed", never P2', async () => {
    renderSheet(bare());
    await settled();
    const row = screen.getByTestId('field-priority');
    // The sentence NAMES the cause, because the cause is actionable: every
    // `ticket.created` writes a claim since 2026-09-22, so a read without one is
    // a `proj_tickets` that was never rebuilt — not a ticket that "has no
    // priority", which is a state this product no longer has.
    expect(within(row).getByText(/carries no priority claim/)).toBeInTheDocument();
    expect(within(row).queryByText('No priority claimed')).toBeNull();
    // And NOTHING is selected. The alternative — preselecting P2, the birth
    // default — would print a level with no claim line beside it, which is the
    // reader-side default the spec rejected; this is the visible half of that
    // rejection.
    for (const tab of within(row).getAllByRole('tab')) {
      expect(tab, tab.textContent ?? '').toHaveAttribute('aria-selected', 'false');
    }
  });

  it('16.105 the Start row shows its claim line when claimed', async () => {
    renderSheet(
      ticketRead({
        ticket: ticketStateSeed({
          fields: {
            ...ticketRead().ticket.fields,
            startDate: {
              value: { date: '2026-08-20' },
              actorId: 'user_anselma',
              clientTime: '2026-08-18T08:04:00.000Z',
              serverTime: '2026-08-18T08:05:00.000Z',
            },
          },
        }),
      }),
    );
    await settled();
    const row = screen.getByTestId('field-start');
    expect(within(row).getByLabelText('Start date')).toHaveValue('2026-08-20');
    expect(within(row).getByText('set by Anselma Marak on 18 Aug 2026')).toBeInTheDocument();
  });

  /**
   * 13.1178 — ruling E5-6: the Due row's WRITE. The row this batch's sibling
   * case `13.1177` put a due date on the board's card; this one is the door
   * that lets a person put one there in the first place.
   *
   * The payload shape is asserted with `toEqual`, never `toMatchObject`, for
   * the reason the description door's own case gives: the envelope must carry
   * EXACTLY the composition, so a sheet that re-spelled the fieldId, dropped
   * `value`, or sent `{ date: '' }` where the export sends `null` would be a
   * different claim about the ledger.
   *
   * `fireEvent.change` rather than `userEvent.type`: a `type="date"` control's
   * value is set wholesale (a date is not typed glyph by glyph in jsdom), and
   * the commit path under test is the SAME one either way — the row commits on
   * `onBlur`/Enter, not on change.
   */
  describe('13.1178 the Due row accepts a date, and clears one', () => {
    const dueInput = (): HTMLElement => screen.getByLabelText('Due date');

    it('13.1178 committing a changed date submits one ticket.field_set carrying that day', async () => {
      const source = renderSheet(ticketRead());
      await settled();
      fireEvent.change(dueInput(), { target: { value: '2026-09-14' } });
      fireEvent.blur(dueInput());
      await waitFor(() => expect(source.ingested).toHaveLength(1));
      expect(source.ingested[0]![0]!.type).toBe('ticket.field_set');
      expect(source.ingested[0]![0]!.payload).toEqual({
        fieldId: 'dueDate',
        value: { date: '2026-09-14' },
      });
    });

    it('13.1178 CONTROL — the two-change dance below reaches the write, proved with a DIFFERENT final value', async () => {
      // ⚠ THIS CASE EXISTS BECAUSE THE ONE BELOW WAS VACUOUS, and the mutation
      // witness is what found it. The unchanged-value control first read a
      // single `change` to the value the input ALREADY held, then a blur. A
      // single change to an identical value fires no React `onChange` at all,
      // so the draft stayed `null`, `onBlur`'s own `dueDraft !== null` gate
      // short-circuited, and `submitDueDate` was never called — **the case
      // passed against a `submitDueDate` with its no-op guard deleted
      // (`Tests 114 passed`), so it was asserting nothing.**
      //
      // This is the precondition that makes the next case mean something: the
      // SAME two changes with a final value that DIFFERS must reach the write.
      // If this case fails, the next one's zero is silence rather than the
      // guard.
      const source = renderSheet(ticketRead());
      await settled();
      fireEvent.change(dueInput(), { target: { value: '2026-08-30' } });
      fireEvent.change(dueInput(), { target: { value: '2026-09-14' } });
      fireEvent.blur(dueInput());
      await waitFor(() => expect(source.ingested).toHaveLength(1));
      expect(source.ingested[0]![0]!.payload).toEqual({
        fieldId: 'dueDate',
        value: { date: '2026-09-14' },
      });
    });

    it('13.1178 CONTROL — an UNCHANGED date sends nothing at all', async () => {
      // The no-op guard `submitTitle` also carries, and the ledger reason it
      // carries it: this event is append-only, so a commit of the value the
      // ticket already has would put a history line in the ticket saying
      // somebody claimed the date they did not touch.
      //
      // The draft is made genuinely non-null in TWO REAL changes — out to a
      // different day, then back to the claimed one — for the measured reason
      // the case above records. That leaves `dueDraft` set to the claimed day
      // with the field otherwise untouched, so the guard is the ONLY thing that
      // can keep the ingest away, and deleting it reddens this case.
      const source = renderSheet(ticketRead());
      await settled();
      fireEvent.change(dueInput(), { target: { value: '2026-09-14' } });
      fireEvent.change(dueInput(), { target: { value: '2026-08-30' } });
      fireEvent.blur(dueInput());
      await settled();
      expect(source.ingested).toHaveLength(0);
    });

    it('13.1178 clearing the input submits value null — the clearing claim, not an empty date', async () => {
      // The export's own reading of an emptied control (`desktop.dc.html:3599`:
      // `{ due: v || null }`, noted "Due date cleared"), and the shape this
      // event's door docblock names for a cleared field.
      const source = renderSheet(ticketRead());
      await settled();
      fireEvent.change(dueInput(), { target: { value: '' } });
      fireEvent.blur(dueInput());
      await waitFor(() => expect(source.ingested).toHaveLength(1));
      expect(source.ingested[0]![0]!.payload).toEqual({ fieldId: 'dueDate', value: null });
    });

    it('13.1178 CONTROL — a ticket claiming NO date can still be given its first one', async () => {
      // The dateless arm is the one the defect is loudest in: before this
      // ruling a ticket born without a due date could never acquire one, so
      // this is the case that proves the editor is not merely an amend path.
      const source = renderSheet(
        ticketRead({
          ticket: ticketStateSeed({
            fields: {
              title: {
                value: 'File the GST return',
                actorId: 'user_kiro',
                clientTime: '2026-08-18T07:59:00.000Z',
                serverTime: '2026-08-18T08:00:00.000Z',
              },
            },
          }),
        }),
      );
      await settled();
      // The absence sentence is still drawn beside the empty control — the
      // prototype's own copy, and the whole point of the row before this case.
      expect(screen.getByTestId('field-due').textContent).toContain('No date claimed');
      expect(dueInput()).toHaveValue('');
      fireEvent.change(dueInput(), { target: { value: '2026-10-02' } });
      fireEvent.blur(dueInput());
      await waitFor(() => expect(source.ingested).toHaveLength(1));
      expect(source.ingested[0]![0]!.payload).toEqual({
        fieldId: 'dueDate',
        value: { date: '2026-10-02' },
      });
    });

    it('13.1178 Enter commits the draft, exactly as the title field’s own Enter does', async () => {
      const source = renderSheet(ticketRead());
      await settled();
      fireEvent.change(dueInput(), { target: { value: '2026-12-01' } });
      fireEvent.keyDown(dueInput(), { key: 'Enter' });
      await waitFor(() => expect(source.ingested).toHaveLength(1));
      expect(source.ingested[0]![0]!.payload).toEqual({
        fieldId: 'dueDate',
        value: { date: '2026-12-01' },
      });
    });
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

  /**
   * ⚠ AMENDED BY RULING E2-35 (2026-09-21) — the delete is now TWO presses.
   *
   * The footer's `Delete` used to perform the delete on one press. It opens a
   * confirmation now (`Dialog`, `BulkCloseDialog`'s shape), so every arm below
   * that was one click is two. The helper exists rather than four inlined pairs
   * so the change of shape is stated once, and so no arm can accidentally assert
   * against a dialog still standing open.
   *
   * The confirm is queried PAGE-WIDE, not `within(footer())`: the dialog renders
   * outside the footer, which is the whole point of it.
   */
  async function pressDelete(user: ReturnType<typeof userEvent.setup>): Promise<void> {
    await user.click(within(footer()).getByRole('button', { name: 'Delete' }));
    await user.click(screen.getByRole('button', { name: 'Delete ticket' }));
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

    await pressDelete(user);
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

    // BOTH halves. The name, not an id — and the name is `key ?? title`, the
    // same expression the crumb above already uses, so what arrives here is
    // THIS fixture's key. ⚠ The comment read "The title, not an id: this
    // product has no ticket KEY" while `ticketRead()`'s own fixture had carried
    // `CCSO-1183` all along; the fallback arm is the test below.
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(onDeleted).toHaveBeenCalledWith(TICKET, 'CCSO-1183');
  });

  it('16.84 the SAME handover carries the title when the read composed no key', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onDeleted = vi.fn();
    // `key: null` is what a workspace without a prefix produces, and the toast
    // must still name the ticket rather than print an id — the rule the crumb
    // already follows (`16.66`), asserted here for the second consumer of the
    // same expression so the two cannot drift apart.
    const read = ticketRead({ key: null, title: 'File the GST return' });
    renderSheet(read, undefined, { onClose, onDeleted });
    await settled();

    await user.click(within(footer()).getByRole('button', { name: 'Delete' }));
    // E2-35 (B13): Delete asks first — press through the confirm.
    await user.click(await screen.findByRole('button', { name: 'Delete ticket' }));
    await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1));

    expect(onDeleted).toHaveBeenCalledWith(TICKET, 'File the GST return');
  });

  it('16.84 closes even when the host passes NO onDeleted — the close is not the host\'s to forget', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const source = renderSheet(ticketRead(), undefined, { onClose });
    await settled();

    await pressDelete(user);
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

    await pressDelete(user);
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

    await pressDelete(user);
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
 * 16.87 — the BREADCRUMB, which is THE ANCESTOR CHAIN since 2026-09-20.
 *
 * `Workspace › Project › [epic] › [parent] › KEY`, which is the AUTHORITY's own
 * chain (`desktop.dc.html:3404-3425`). Until 2026-09-20 this was
 * `Workspace › Project › State` — **there is no state crumb in the authority at
 * all**, and the state was built instead because it was *"the one crumb whose
 * source is IN this component"* while the ancestor chain *"would need a third
 * host prop or a read"*. The cheap reading was built and the authority's actual
 * chain was not; the owner asked why the hierarchy was missing from the crumb
 * and this is the correction.
 *
 * ⚠ **The owner's *"should show the ticket key"* was NOT buildable from what
 * `#595` shipped.** That PR shipped the key's COMPOSITION and the two PREFIXES;
 * the NUMBER — the ticket's position among its project's creations — had no
 * route consuming it, which `Features.md:456` said in as many words — *"the key
 * is composed, served and is enforced, and NO SCREEN RENDERS IT YET"*, quoted in
 * the PAST TENSE because this change set is what replaced that sentence with
 * *"until 2026-09-20 NO SCREEN RENDERED IT"*. The detail route serves it now, and
 * `TicketRead.key` carries it. ⚠ The citation is to `:456` and not `:455`: `:455`
 * is the PREFIXES bullet above it, and two of this change set's own comments
 * cited the wrong one until an independent reviewer opened both lines.
 *
 * The arms worth having are the ones the old shape could not express: an
 * ANCESTOR crumb is a LINK that opens that ticket's sheet, the epic crumb is
 * CONDITIONAL, a restricted ancestor is NAMED rather than dropped, and the last
 * crumb is the KEY rather than the state's name.
 */
describe('TicketSheet — the location breadcrumb (16.87)', () => {
  /**
   * The grandparent these cases hang off. Defined HERE rather than added to
   * `helpers/seed.ts` beside `PARENT` and `TICKET`: `seed.ts` is shared by
   * every suite in this package and a constant nothing else reads would be one
   * more name every reader has to rule out. It is a plain id, distinct from
   * `PARENT` and `TICKET`, so a crumb bound to the wrong one fails rather than
   * passing by coincidence.
   */
  const EPIC = '01J9GEVT0000000000000000EP';

  function crumbTexts(): string[] {
    return Array.from(document.querySelectorAll('.gn-ticket-sheet__crumb')).map(
      (el) => el.textContent ?? '',
    );
  }

  it('16.87 draws workspace, project, parent and key, in that order', async () => {
    renderSheet(ticketRead(), sheetSource(ticketRead()), {
      workspaceName: 'Convenience Corner',
      projectName: 'Shop operations',
    });
    await settled();

    expect(screen.getByRole('navigation', { name: 'Ticket location' })).toBeInTheDocument();
    // The seeded read carries a parent (`Registrations`) and a key
    // (`CCSO-1183`) and NO grandparent, which is the ordinary shape: the epic
    // crumb is conditional and this fixture is what its absence looks like.
    expect(crumbTexts()).toEqual([
      'Convenience Corner',
      'Shop operations',
      'Registrations',
      'CCSO-1183',
    ]);
  });

  /**
   * E4-1 / E5-3 — THE SAME ANCESTOR IS NAMED ONCE WHEN IT IS BOTH THE EPIC AND
   * THE PARENT.
   *
   * The server's ancestry walk starts at `state.parentId` and returns the first
   * ancestor whose type is an epic, so when the ticket's DIRECT PARENT is an
   * epic, `epic.id === parent.id` (`apps/server/src/routes/tickets.ts`). The bar
   * rendered both under two independent null checks and nothing compared their
   * ids, so the painted crumbs read:
   *
   *     Convenience Corner › Shop operations › Open questions › Open questions › CCSO-6
   *
   * — one ancestor, named twice, a depth the hierarchy does not have. **The
   * blast radius is the ordinary case, not an edge: 23 of the 26 tickets in the
   * seeded project have an epic as their direct parent** (the reviewer's own
   * count, and they painted one and said so). The prototype never shows this
   * shape, so it gives no authority for it.
   *
   * ⚠ NO EXISTING FIXTURE COULD SEE THIS: `ticketRead()`'s default carries a
   * parent and no epic, and every case that sets an `epic` sets a DISTINCT id
   * (`EPIC`), so the equal-id shape was never rendered by any case in this file.
   * This fixture is the first, and it is the shape the seed produces 23 times.
   */
  /**
   * E5-3 — THE SAME SHAPE WITH BOTH REFS `restricted`.
   *
   * The case above covers the visible pair. This is the arm the id comparison
   * has to reach WITHOUT a title to compare: the server's walk answers
   * `{kind:'restricted', id}` both for the parent branch and for the epic hop
   * when the ticket is one the viewer may not see (or one the ledger records as
   * deleted), so a viewer can be sent two restricted refs to ONE ticket. **An
   * implementation that compared TITLES, or that special-cased `kind`, would
   * pass the visible case and draw `Restricted parent` twice here** — which is
   * the same defect, on the screen of the person least able to notice it is the
   * same ticket, because a restricted crumb carries no title to compare by eye.
   *
   * `16.65` owns the property that a restricted ancestor is NAMED rather than
   * dropped; this case is its one-hop companion, and it asserts BOTH halves:
   * named once, and the surviving crumb is the parent's.
   */
  /**
   * P3 — THE PARENT CRUMB READS THE PARENT'S KEY; THE EPIC CRUMB NEVER DOES.
   *
   * The prototype labels its parent crumb `p.id + " " + p.title`
   * (`Gisik Nokma - Desktop.dc.html:3417`) and its epic crumb `e.title` alone
   * (`:3410-3413`). The product matched the epic and not the parent, because the
   * wire carried no key for an ancestor. **The cost was not cosmetic: the key is
   * what disambiguates**, so a ticket whose epic and parent share a title drew
   * two identical crumbs.
   *
   * ⚠ THREE ARMS, because `ParentRef.key` has three states and the render treats
   * exactly one of them differently — see that type's docblock. A case that only
   * asserted the happy path would leave `null` and `undefined` indistinguishable
   * from a bug that drops the key.
   */
  it('17.027 / P3: a parent crumb shows the parent’s KEY, and the epic crumb stays title-only', async () => {
    const read = ticketRead({
      parent: { kind: 'ticket', id: PARENT, title: 'Registrations', key: 'CCSO-9' },
      epic: { kind: 'ticket', id: EPIC, title: 'Open Questions', key: 'CCSO-7' },
    });
    renderSheet(read, sheetSource(read), {
      workspaceName: 'Convenience Corner',
      projectName: 'Shop operations',
    });
    await settled();

    expect(crumbTexts()).toEqual([
      'Convenience Corner',
      'Shop operations',
      // The epic carries a key on this fixture and does NOT render it — the
      // prototype's `e.title`, and the reason a key on the epic ref is
      // meaningless rather than merely unused.
      'Open Questions',
      'CCSO-9 Registrations',
      'CCSO-1183',
    ]);
    expect(screen.getByTestId('sheet-crumb-parent').textContent).toBe('CCSO-9 Registrations');
    expect(screen.getByTestId('sheet-crumb-epic').textContent).toBe('Open Questions');
  });

  it('17.027 / P3: a parent key that could NOT be composed falls back to the title alone — never a half label', async () => {
    // `null` is the ticket-number ruling's own absence: the number is derived
    // from the ledger's order, so a snapshot-bounded read composes no key, and a
    // key is not worth refusing the read over.
    const read = ticketRead({ parent: { kind: 'ticket', id: PARENT, title: 'Registrations', key: null } });
    renderSheet(read, sheetSource(read), {
      workspaceName: 'Convenience Corner',
      projectName: 'Shop operations',
    });
    await settled();
    expect(screen.getByTestId('sheet-crumb-parent').textContent).toBe('Registrations');
    // And the separator-space trap: a naive `${key} ${title}` with a null key
    // prints " Registrations" — a leading space nobody sees in a browser and
    // every assertion above would still pass.
    expect(screen.getByTestId('sheet-crumb-parent').textContent).not.toMatch(/^\s/);
  });

  it('17.027 / P3: a parent ref that carries NO key field at all renders the title alone', async () => {
    // The third state: absent. A producer that does not carry a key for this ref
    // (the grandparent's ref is the one the product has) must read exactly like
    // `null` on screen, and neither may read as an empty crumb.
    const read = ticketRead({ parent: { kind: 'ticket', id: PARENT, title: 'Registrations' } });
    renderSheet(read, sheetSource(read), {
      workspaceName: 'Convenience Corner',
      projectName: 'Shop operations',
    });
    await settled();
    expect(screen.getByTestId('sheet-crumb-parent').textContent).toBe('Registrations');
  });

  it('17.026 / E5-3: two restricted refs to the SAME ticket draw one crumb, not two', async () => {
    const read = ticketRead({
      parent: { kind: 'restricted', id: PARENT },
      epic: { kind: 'restricted', id: PARENT },
    });
    renderSheet(read, sheetSource(read), {
      workspaceName: 'Convenience Corner',
      projectName: 'Shop operations',
    });
    await settled();

    // NAMED, not dropped — the vanish `invariant 5` forbids.
    expect(crumbTexts()).toContain('Restricted parent');
    // …and named ONCE. `filter` on the text rather than a set size, because the
    // crumb text is a constant here and a set would collapse the duplicate the
    // case exists to find.
    expect(crumbTexts().filter((text) => text === 'Restricted parent')).toHaveLength(1);
    expect(screen.queryByTestId('sheet-crumb-epic')).toBeNull();
    expect(screen.getByTestId('sheet-crumb-parent')).toBeInTheDocument();
  });

  it('17.024 / E4-1: when the direct parent IS the epic, the ancestor is named ONCE', async () => {
    // The one-hop shape: the epic IS the parent, same id, and the title the
    // server sends for both is the same row's title.
    const read = ticketRead({ epic: { kind: 'ticket', id: PARENT, title: 'Registrations' } });
    renderSheet(read, sheetSource(read), {
      workspaceName: 'Convenience Corner',
      projectName: 'Shop operations',
    });
    await settled();

    // THE PROPERTY, asserted apart from the list: the ancestor appears once.
    // Reverting the comparison makes this read `2` while the list assertion
    // above it still looks plausible on a casual read.
    expect(crumbTexts().filter((text) => text === 'Registrations')).toHaveLength(1);
    // The surviving crumb is the PARENT's — the nearer one, and the one a
    // reader of this sheet looks for — so the epic crumb is the one dropped.
    expect(screen.queryByTestId('sheet-crumb-epic')).toBeNull();
    expect(screen.getByTestId('sheet-crumb-parent')).toBeInTheDocument();
    // And the bar is then IDENTICAL to the no-epic bar, which is the point: a
    // one-hop ticket has one ancestor and the path states one.
    expect(crumbTexts()).toEqual([
      'Convenience Corner',
      'Shop operations',
      'Registrations',
      'CCSO-1183',
    ]);
  });

  /**
   * 16.63 — the GRANDPARENT crumb, which is the whole of what the owner's
   * *"grandparent"* asked for and which the old three-crumb bar had nowhere to
   * put.
   *
   * The epic crumb sits BETWEEN the project and the parent, which is the
   * authority's order (`ws.name › tpName › [epic] › [parent] › sheet.id`) and
   * not a choice made here.
   */
  it('16.63 draws the grandparent between the project and the parent', async () => {
    const read = ticketRead({ epic: { kind: 'ticket', id: EPIC, title: 'Open Questions' } });
    renderSheet(read, sheetSource(read), {
      workspaceName: 'Convenience Corner',
      projectName: 'Shop operations',
    });
    await settled();

    expect(crumbTexts()).toEqual([
      'Convenience Corner',
      'Shop operations',
      'Open Questions',
      'Registrations',
      'CCSO-1183',
    ]);
  });

  /**
   * 16.64 — AN ANCESTOR CRUMB OPENS THAT TICKET'S SHEET, and the id it opens is
   * the RIGHT one.
   *
   * The authority's ancestors are each a link (`go: () => setState({ sheetId })`)
   * and `onOpenTicket` is the prop that honours it. Asserted on the ARGUMENT
   * rather than on the call alone: a crumb that opened the wrong ticket, or the
   * ticket's own sheet, would satisfy "the handler ran" — which is the shape
   * this repo records as a check passing for a reason unrelated to the property
   * it names. Each ancestor is clicked separately, so a handler bound to one id
   * for both crumbs cannot pass.
   */
  it('16.64 an ancestor crumb opens THAT ancestor’s sheet, not the ticket’s own', async () => {
    const user = userEvent.setup();
    const onOpenTicket = vi.fn();
    const read = ticketRead({ epic: { kind: 'ticket', id: EPIC, title: 'Open Questions' } });
    renderSheet(read, sheetSource(read), {
      workspaceName: 'Convenience Corner',
      projectName: 'Shop operations',
      onOpenTicket,
    });
    await settled();

    await user.click(screen.getByTestId('sheet-crumb-epic'));
    expect(onOpenTicket).toHaveBeenCalledWith(EPIC);

    await user.click(screen.getByTestId('sheet-crumb-parent'));
    expect(onOpenTicket).toHaveBeenLastCalledWith(PARENT);

    // The last crumb is NOT a control — there is nowhere further to go from
    // here — so it carries no click for a traversal to loop on.
    expect(screen.getByTestId('sheet-crumb-ticket').tagName).toBe('SPAN');
    expect(onOpenTicket).toHaveBeenCalledTimes(2);
  });

  /**
   * 16.64 — WITH NO `onOpenTicket` AN ANCESTOR CRUMB IS NOT A CONTROL.
   *
   * `onOpenTicket` is optional and absent for a caller that cannot open
   * anything. The rule is that prop's own recorded one — *"a control that
   * cannot be honoured"* is not drawn — so the crumb degrades to the plain span
   * the restricted arm already uses, and the name is still shown rather than
   * the crumb vanishing.
   */
  it('16.64 an ancestor crumb is a plain span when the host cannot open tickets', async () => {
    const read = ticketRead({ epic: { kind: 'ticket', id: EPIC, title: 'Open Questions' } });
    renderSheet(read, sheetSource(read), {
      workspaceName: 'Convenience Corner',
      projectName: 'Shop operations',
    });
    await settled();

    const epic = screen.getByTestId('sheet-crumb-epic');
    expect(epic.tagName).toBe('SPAN');
    expect(epic.textContent).toBe('Open Questions');
    expect(screen.getByTestId('sheet-crumb-parent').tagName).toBe('SPAN');
  });

  /**
   * 16.65 — A RESTRICTED ANCESTOR IS NAMED, NEVER DROPPED, and is never a
   * control.
   *
   * Dropping it would make a restricted chain render as a SHORTER one — the
   * vanish `invariant 5` forbids, and the same reason the parent indicator has a
   * restricted arm at all. It cannot be a link for the reason that arm cannot:
   * the viewer cannot open what they cannot see, and the id the read DID send
   * is not rendered.
   */
  it('16.65 a restricted grandparent is named rather than dropped, and is not a control', async () => {
    const onOpenTicket = vi.fn();
    const read = ticketRead({ epic: { kind: 'restricted', id: 'secret-epic' } });
    renderSheet(read, sheetSource(read), {
      workspaceName: 'Convenience Corner',
      projectName: 'Shop operations',
      onOpenTicket,
    });
    await settled();

    const epic = screen.getByTestId('sheet-crumb-epic');
    expect(epic.tagName).toBe('SPAN');
    expect(epic.textContent).toBe('Restricted epic');
    // The chain is still FIVE long: the restricted arm occupies its own place
    // rather than collapsing the hierarchy by one level.
    expect(crumbTexts()).toHaveLength(5);
    expect(document.body.textContent).not.toContain('secret-epic');
    expect(onOpenTicket).not.toHaveBeenCalled();
  });

  /**
   * 16.66 — THE LAST CRUMB IS THE TICKET KEY, which is the owner's own words
   * (*"should show the ticket key"*) and the thing `TicketRead.key` was added
   * to carry.
   */
  it('16.66 the last crumb is the ticket key', async () => {
    const read = ticketRead({ key: 'CCSO-42' });
    renderSheet(read, sheetSource(read), {
      workspaceName: 'Convenience Corner',
      projectName: 'Shop operations',
    });
    await settled();

    expect(screen.getByTestId('sheet-crumb-ticket').textContent).toBe('CCSO-42');
  });

  /**
   * 16.66 — WHEN THIS READ COULD NOT COMPOSE A KEY, the last crumb falls back to
   * the ticket's TITLE — **and never to `state.id`**.
   *
   * The fallback is asserted in BOTH directions in one case, because the wrong
   * one is the plausible one: a ULID is not a key, and `my-work.tsx`'s
   * *"id-only rather than blank"* rule does not license printing one here — that
   * rule is for a SERVED withheld name, and a `null` key is a derivation this
   * read could not complete. `TICKET` is the fixture's id, so the negative arm
   * has something real to fail on.
   */
  it('16.66 a null key falls back to the title and never to the ticket id', async () => {
    const read = ticketRead({ key: null, title: 'File the GST return' });
    renderSheet(read, sheetSource(read), {
      workspaceName: 'Convenience Corner',
      projectName: 'Shop operations',
    });
    await settled();

    const last = screen.getByTestId('sheet-crumb-ticket');
    expect(last.textContent).toBe('File the GST return');
    // Scoped to the NAV rather than to `document.body`: the ticket's own id
    // legitimately appears elsewhere on this sheet, and a body-wide assertion
    // would be a check whose failure has nothing to do with what it names.
    const nav = screen.getByRole('navigation', { name: 'Ticket location' });
    expect(nav.textContent).not.toContain(TICKET);
    expect(crumbTexts()).not.toContain(TICKET);
  });

  /**
   * 16.63 — THE STATE IS NOT A CRUMB ANY MORE, and this is the case that makes
   * the removal deliberate rather than a silent loss.
   *
   * The old last crumb was the workflow's name for the state (`Doing`), and it
   * is gone from the breadcrumb because the authority has no such crumb. **The
   * state is still on the sheet** — it has its own chip — so nothing was lost;
   * what changed is which surface answers *"where am I"*. The positive control
   * is in the same case: the chip is asserted PRESENT, so a version that simply
   * dropped the state from the sheet cannot pass this by accident.
   */
  it('16.63 the state is not a crumb, and the state chip still names it', async () => {
    renderSheet(ticketRead(), sheetSource(ticketRead()), {
      workspaceName: 'Convenience Corner',
      projectName: 'Shop operations',
    });
    await settled();

    expect(crumbTexts()).not.toContain('Doing');
    // ⚠ THE CONTROL, and it carries a property this change would otherwise have
    // ORPHANED. The old state crumb asserted *"the workflow's NAME for the
    // state, not the raw id"* (`nav.textContent` must not contain `doing`), and
    // it was the ONLY case in this file owning that property. Removing the
    // crumb would have silently retired it, so it follows the element to the
    // state chip — which is the same `currentStateName` lookup and the surface
    // that still renders it. Both arms, in the same case, so neither can pass
    // for the other's reason.
    // ⚠ SCOPED TO THE STATE ROW since 2026-09-22, and the scoping is required
    // rather than tidy: the header's new chips line draws its OWN state chip, so
    // a page-wide `getByText('Doing')` now finds two nodes and THIS property —
    // the workflow's NAME for the state, never the raw id — belongs to the row.
    // A body-wide assertion would have failed here for a reason unrelated to
    // what the arm names, which is the shape this file's scoped comments refuse.
    const row = document.querySelector('.gn-ticket-sheet__state') as HTMLElement;
    expect(within(row).getByText('Doing')).toBeInTheDocument();
    expect(screen.getByRole('dialog').textContent ?? '').not.toContain('doing');
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
   * 13.1317 — THE WORKSPACE AND THE PROJECT ARE CLICKABLE FROM THE BREADCRUMB.
   *
   * The owner, one screenshot of this bar: *"the workspace and the project
   * should also be clickable from the breadcrumb."* Until this case the parent
   * crumb was a control and the two crumbs ABOVE it were plain text.
   *
   * **They are LINKS and not buttons, and that is the whole shape of the
   * change.** An ancestor crumb is a `<button>` because opening it needs a
   * server lookup first (`page.tsx`'s `openParentTicket` → `ticketLocation.locate`).
   * The workspace and the project are LOCATIONS the host already knows —
   * `/w/<workspaceId>` and `/w/<workspaceId>/p/<projectId>` — and a location is
   * an `<a>`: middle-click, open-in-new-tab and copy-link-address come for free,
   * which a button cannot give. The host supplies the href and how to route it
   * (`workspaceHref`/`projectHref`/`onNavigate`), because `packages/app-core` is
   * framework-neutral and cannot import Next's `Link` — it already renders bare
   * `<a href>` for attachments (`attachment-list.tsx:93`).
   *
   * **The arms are asserted as ONE case with a control, not two cases**, because
   * the property is a CONDITIONAL: a crumb is a link when the host can honour
   * one and plain text when it cannot — the same rule the ancestor crumbs
   * already follow (*"a control that cannot be honoured is the failure this repo
   * refuses by name"*). Two sibling `it`s would let a version that made every
   * crumb a link unconditionally report green on the positive arm while the
   * control, in its own test, explained nothing.
   */
  it('13.1317 the workspace and the project crumbs are LINKS when the host supplies hrefs', async () => {
    const WORKSPACE_HREF = `/w/${WS}`;
    const PROJECT_HREF = `/w/${WS}/p/proj_1`;

    // ARM ONE — the host can route, so both crumbs are links.
    renderSheet(ticketRead(), sheetSource(ticketRead()), {
      workspaceName: 'Convenience Corner',
      projectName: 'Shop operations',
      workspaceHref: WORKSPACE_HREF,
      projectHref: PROJECT_HREF,
    });
    await settled();

    const nav = screen.getByRole('navigation', { name: 'Ticket location' });
    // Queried by ROLE and NAME, which is what a reader meets: a link exists is
    // findable by its accessible name. The name a location's link carries is its
    // own text, so nothing here needs an `aria-label` — and adding one would
    // move the accessible-names ratchet (`Features.md`'s floor) for a control
    // that has a name already.
    const workspaceLink = within(nav).getByRole('link', { name: 'Convenience Corner' });
    expect(workspaceLink).toHaveAttribute('href', WORKSPACE_HREF);
    const projectLink = within(nav).getByRole('link', { name: 'Shop operations' });
    expect(projectLink).toHaveAttribute('href', PROJECT_HREF);
    // The modifier the ink rides on, asserted on the class rather than on
    // paint: jsdom loads no stylesheet, so the ink itself is `13.1319`'s
    // subject and it reads the CSS source.
    expect(workspaceLink).toHaveClass('gn-ticket-sheet__crumb--link');
    expect(projectLink).toHaveClass('gn-ticket-sheet__crumb--link');
    expect(screen.getByTestId('sheet-crumb-workspace')).toBe(workspaceLink);
    expect(screen.getByTestId('sheet-crumb-project')).toBe(projectLink);
    // AND THE TICKET'S OWN CRUMB IS STILL NOT ONE. There is nowhere further to
    // go from here, so turning it into a link as part of "make the crumbs
    // clickable" would invent a destination.
    expect(within(nav).queryByRole('link', { name: 'CCSO-1183' })).toBeNull();
    expect(screen.getByTestId('sheet-crumb-ticket').tagName).toBe('SPAN');

    cleanup();

    // ARM TWO — THE CONTROL. A host that cannot route passes no hrefs, and the
    // names must still arrive: the crumb degrades to today's plain span rather
    // than vanishing, exactly as the callback-less ancestor crumb does. Without
    // this arm a version that rendered `<a href={undefined}>` unconditionally
    // would pass everything above.
    renderSheet(ticketRead(), sheetSource(ticketRead()), {
      workspaceName: 'Convenience Corner',
      projectName: 'Shop operations',
    });
    await settled();

    const navAlone = screen.getByRole('navigation', { name: 'Ticket location' });
    expect(within(navAlone).queryByRole('link')).toBeNull();
    expect(screen.getByTestId('sheet-crumb-workspace').tagName).toBe('SPAN');
    expect(screen.getByTestId('sheet-crumb-project').tagName).toBe('SPAN');
    expect(crumbTexts()).toEqual([
      'Convenience Corner',
      'Shop operations',
      'Registrations',
      'CCSO-1183',
    ]);
  });

  /**
   * 13.1318 — A PLAIN LEFT CLICK ROUTES CLIENT-SIDE; A MODIFIED OR MIDDLE CLICK
   * IS LEFT TO THE BROWSER.
   *
   * This is the entire reason the two crumbs are `<a>` elements rather than
   * buttons, and it is the half a caller cannot get from `href` alone: the
   * component renders a bare anchor, and the HOST decides whether a click
   * becomes an in-app navigation (`onNavigate`) or the browser's own.
   *
   * ## How `defaultPrevented` is read, and why at `document`
   *
   * A real `MouseEvent` is dispatched at the anchor and the flag is read off the
   * event itself — this file's sibling case for `TicketList`'s dragover records
   * why (`fireEvent` cannot report a cancellation that never happened). The
   * listener that reads it sits on `document`, which is an ANCESTOR of the
   * container React delegates to, so it runs AFTER the component's handler and
   * reads the event itself, never a handler having run. The mechanism is the
   * one this file's sibling case for `TicketList`'s dragover records: that case
   * is green under `fireEvent` whether or not the component cancels, so the flag
   * off the dispatched event is the only instrument that can tell "consumed"
   * from "merely handled".
   *
   * ⚠ **`cancelable: true` IS LOAD-BEARING.** `preventDefault` is a no-op on a
   * non-cancelable event, so without it the positive arm below would read
   * `false` while the component was perfectly correct — a red for the fixture's
   * reason.
   *
   * ⚠ **`href` IS TAKEN OFF THE ELEMENT BEFORE THE CLICKS, AND THAT IS THE
   * FIXTURE, NOT A SUBTLETY.** An un-cancelled click on an `<a href>` sends
   * jsdom to a navigation it cannot perform, and this case dispatches such a
   * click on purpose three times — the modified and middle arms and the
   * no-callback arm are precisely the ones the component must leave alone — so
   * without this the run prints three `Not implemented: navigation` stack
   * traces that read like failures in a log. An anchor with no `href` has no
   * activation behaviour at all, so nothing is attempted. **What is measured is
   * untouched:** the attribute was real and was asserted while it was still
   * there (below, and again in `13.1317`), React's `onClick` comes off the prop
   * and not off the attribute, and `defaultPrevented` is a fact about the event
   * object.
   */
  it('13.1318 a plain left click routes client-side; a modified or middle click is left to the browser', async () => {
    const WORKSPACE_HREF = `/w/${WS}`;
    const PROJECT_HREF = `/w/${WS}/p/proj_1`;
    const onNavigate = vi.fn();

    renderSheet(ticketRead(), sheetSource(ticketRead()), {
      workspaceName: 'Convenience Corner',
      projectName: 'Shop operations',
      workspaceHref: WORKSPACE_HREF,
      projectHref: PROJECT_HREF,
      onNavigate,
    });
    await settled();

    const projectLink = screen.getByTestId('sheet-crumb-project');
    expect(projectLink).toHaveAttribute('href', PROJECT_HREF);
    projectLink.removeAttribute('href');
    const click = (init: MouseEventInit): MouseEvent => {
      const event = new MouseEvent('click', { bubbles: true, cancelable: true, ...init });
      projectLink.dispatchEvent(event);
      return event;
    };

    // ARM ONE — a plain left click. It DOES route, it routes to THIS crumb's
    // href (asserted on the argument, because a handler bound to the workspace
    // href for both crumbs would satisfy "the handler ran"), and the default is
    // consumed so the browser does not also navigate.
    expect(click({ button: 0 }).defaultPrevented).toBe(true);
    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(onNavigate).toHaveBeenCalledWith(PROJECT_HREF);

    // CONTROL — a modified left click is the reader asking for a new tab, a
    // window or a download. The component must NOT route it, and must leave the
    // default to the browser: either half alone is wrong (routing without
    // leaving the default alone navigates twice; consuming without routing does
    // nothing at all).
    onNavigate.mockClear();
    expect(click({ button: 0, metaKey: true }).defaultPrevented).toBe(false);
    expect(onNavigate).not.toHaveBeenCalled();

    // CONTROL — a non-primary button. Middle click is the other standard way to
    // open a background tab, and `event.button !== 0` is the guard that catches
    // it rather than the modifier list.
    expect(click({ button: 1 }).defaultPrevented).toBe(false);
    expect(onNavigate).not.toHaveBeenCalled();

    cleanup();

    // CONTROL — hrefs but NO `onNavigate`: the anchor navigates NATIVELY, so the
    // default must be left alone. This is the arm a component that
    // unconditionally called `preventDefault` would fail, and it is the reason
    // `preventDefault` sits INSIDE the callback test rather than before it.
    renderSheet(ticketRead(), sheetSource(ticketRead()), {
      workspaceName: 'Convenience Corner',
      projectName: 'Shop operations',
      workspaceHref: WORKSPACE_HREF,
      projectHref: PROJECT_HREF,
    });
    await settled();

    const nativeLink = screen.getByTestId('sheet-crumb-project');
    expect(nativeLink).toHaveAttribute('href', PROJECT_HREF);
    nativeLink.removeAttribute('href');
    const nativeEvent = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
    nativeLink.dispatchEvent(nativeEvent);
    expect(nativeEvent.defaultPrevented).toBe(false);
  });

  /**
   * 16.67 — THE PARENT INDICATOR RENDERS THE BADGE, IN THE UPPER POSITION, AND
   * THE SUBTASKS HEAD NO LONGER RENDERS A SECOND COPY.
   *
   * The owner's ruling, verbatim: *"you can keep the badge. but the placement is
   * confusing. there is already a `gn-ticket-sheet__parent` section above. put
   * the badge in that position instead. you can remove that
   * `gn-ticket-sheet__parent`."*
   *
   * ## What was measured before the merge
   *
   * The SAME three facts were rendered twice: the parent indicator drew the
   * parent's bare title (or `At project root`, or the restricted sentence), and
   * the subtasks head drew a `Subtask of {title}` chip for the same parent —
   * with the restricted case worded differently in each place and the root case
   * appearing in only one of them. **Case 16.39 asserted there was exactly ONE
   * chip; this case asserts there is exactly one SURFACE**, which is the
   * property the ruling is about and which a chip count alone cannot see.
   *
   * ⚠ The two assertions are separated on purpose. `queryByTestId` returning
   * null at the old site passes for the RIGHT reason only because the same case
   * first proves the badge IS rendered at the new one — an element that moved
   * and an element that was deleted are the same reading otherwise.
   */
  it('16.67 the parent badge sits in the parent indicator and nowhere else', async () => {
    const read = ticketRead({ parent: { kind: 'ticket', id: PARENT, title: 'Registrations' } });
    renderSheet(read, sheetSource(read), {
      workspaceName: 'Convenience Corner',
      projectName: 'Shop operations',
      onOpenTicket: vi.fn(),
    });
    await settled();

    const chips = screen.getAllByTestId('sheet-parent-chip');
    expect(chips).toHaveLength(1);
    expect(chips[0]?.textContent).toBe('Subtask of Registrations');
    // IN THE UPPER POSITION: the badge's own ancestor is the indicator block.
    expect(screen.getByTestId('sheet-parent-indicator')).toContainElement(chips[0]!);
    // AND NOT in the subtasks section, which is the duplication the ruling
    // removed. Asserted on the CONTAINER rather than on the document, so a chip
    // re-appearing inside the subtasks head fails here.
    expect(screen.getByTestId('sheet-subtasks')).not.toContainElement(
      screen.queryByTestId('sheet-parent-chip'),
    );
  });

  /**
   * 16.68 — AT PROJECT ROOT THE INDICATOR NAMES THE ROOT AND DRAWS NO BADGE.
   *
   * **A root is not a subtask**, so the `Subtask of …` badge would be a false
   * statement about it; the sentence is kept instead, because the fact is real
   * and a crumb chain ending at the project is a different silence. This is the
   * arm the owner's ruling left open (*"if the owner meant the chip's behaviour
   * — nothing at root — that is this one arm"*), asserted so that changing it
   * is a decision rather than a drift.
   */
  it('16.68 at project root the indicator says so and wears no badge', async () => {
    const read = ticketRead({ parent: null });
    renderSheet(read, sheetSource(read), {
      workspaceName: 'Convenience Corner',
      projectName: 'Shop operations',
      onOpenTicket: vi.fn(),
    });
    await settled();

    expect(screen.getByTestId('sheet-parent-indicator')).toHaveTextContent('At project root');
    expect(screen.queryByTestId('sheet-parent-chip')).toBeNull();
  });

  /**
   * 16.68 — A RESTRICTED PARENT IS NOT A ROOT, and the indicator keeps the two
   * apart in the merged element.
   *
   * Invariant 5's whole point, re-asserted at the site the merge created: the
   * restricted arm must not read as *"no parent"*. Both sentences are asserted
   * in ONE case so neither can pass by the other's absence.
   */
  it('16.68 a restricted parent never reads as a root, in the merged indicator', async () => {
    const read = ticketRead({ parent: { kind: 'restricted', id: 'secret-parent' } });
    renderSheet(read, sheetSource(read), {
      workspaceName: 'Convenience Corner',
      projectName: 'Shop operations',
    });
    await settled();

    const indicator = screen.getByTestId('sheet-parent-indicator');
    expect(indicator).toHaveTextContent("Restricted parent — exists, but you can't see it");
    expect(indicator).not.toHaveTextContent('At project root');
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
    // ⚠ ALL THREE ARMS NOW OPEN THE ATTACHMENTS TAB FIRST (spec 2026-09-22
    // decision 5, which moved this section out of Details and behind the third
    // tab). The permitted mechanical edit named in the plan: the cases' claims
    // are unchanged, only the tab they are read under is.
    // ARM ONE — the entries. This is also the control for everything below: the
    // section does render when it has something to render.
    renderSheet(ticketRead(), sheetSource(ticketRead()), { attachments: [ENTRY] });
    await settled();
    fireEvent.click(screen.getByRole('tab', { name: 'Attachments' }));
    expect(screen.getByText('gst-receipt.pdf')).toBeInTheDocument();
    expect(screen.queryByTestId('sheet-attachments-unavailable')).toBeNull();
    cleanup();

    // ARM TWO — a real empty list. Nothing at all, and crucially no sentence:
    // the component must not turn "there are none" into a warning.
    renderSheet(ticketRead(), sheetSource(ticketRead()), { attachments: [] });
    await settled();
    fireEvent.click(screen.getByRole('tab', { name: 'Attachments' }));
    expect(screen.queryByText('gst-receipt.pdf')).toBeNull();
    expect(screen.queryByTestId('sheet-attachments-unavailable')).toBeNull();
    cleanup();

    // ARM THREE — the read failed. A sentence, and it carries the REASON rather
    // than the sheet inventing one: the `error` string is the transport's own.
    const reason = 'HTTP 404 for /v1/workspaces/ws/tickets/tk/attachments';
    renderSheet(ticketRead(), sheetSource(ticketRead()), { attachmentsUnavailable: reason });
    await settled();
    fireEvent.click(screen.getByRole('tab', { name: 'Attachments' }));
    const notice = screen.getByTestId('sheet-attachments-unavailable');
    expect(notice).toHaveTextContent("This ticket's attachments could not be read");
    expect(notice).toHaveTextContent(reason);
    // And the reason is not dressed as a wait — the failure arm this sheet
    // already draws for the ticket read and the ledger tab is the model.
    expect(notice.textContent).not.toContain('Loading');
  });
});

/**
 * 3.190 (E5-9) — A REFUSAL ANSWERS WHERE THE CONTROL IS.
 *
 * `Delete` sits in the sheet's footer, at the very END of a body that scrolls:
 * the lane that filed this measured `.gn-ticket-sheet__body` at `clientHeight
 * 756` against `scrollHeight 4036`, with the footer's top **3,942.8 px** below
 * the tab bar — roughly five viewports. Delete's refusal rode the shared
 * `gn-refusal--server` slot at the HEAD of that body, so a person who scrolled
 * to the bottom, pressed Delete, and was refused got the answer where they
 * could not see it. The recorded ruling (`deleteTicket`'s own docblock) chose
 * "the engine's own refusal … rather than a button that silently is not there";
 * that ruling is about WHETHER Delete is offered, not about where its answer
 * lands, so this case does not disturb it.
 */
describe('E5-9 a refused Delete answers beside the button that was pressed', () => {
  it('PLANTED DEFECT: ONE sentence, inside the footer, not at the head of the body', async () => {
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
          rule: 'permission.role',
          reason: 'Only an admin may delete this ticket.',
        })),
    );
    renderSheet(read, source);
    await settled();
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    // E2-35 (B13) put a confirm in front of the delete; the refusal this case
    // is about is the SERVER's, so press through the confirm to reach it.
    await screen.findByRole('dialog', { name: 'Delete this ticket?' });
    await user.click(screen.getByRole('button', { name: 'Delete ticket' }));

    const refusal = await screen.findByText(/Refused by the server/);
    // One sentence, never two: the footer answer REPLACES the shared slot's,
    // rather than being a second copy of the same fact on one screen.
    expect(screen.getAllByText(/Refused by the server/)).toHaveLength(1);
    // …and it is in the surface the person is looking at. `.closest('footer')`
    // is the structural claim; the pixel claim is the lane's measurement above,
    // which a jsdom sheet cannot make (it lays nothing out).
    expect(refusal.closest('footer')).not.toBeNull();
  });
});

/**
 * 3.189 (E5-20) — ONE ESCAPE, TWO `role="dialog"` ELEMENTS, AND ONLY ONE OF
 * THEM SHOULD CLOSE.
 *
 * `Move…` mounts `TransitionDialog` → `Dialog` INSIDE the sheet's own subtree,
 * so the DOM holds two modal dialogs at once. `Dialog` installs a
 * document-level `keydown` that closes on Escape and (until this change) never
 * called `preventDefault()`; `Sheet` installs one that closes the sheet on
 * Escape unless `event.defaultPrevented` — and its own docblock states the
 * contract: *"A child that handles Escape must call `preventDefault()` for this
 * guard to see it."* The guard was added for the title field and never reached
 * the `Dialog` in the same package, which is the child every Move, Reopen and
 * Bulk-close goes through.
 *
 * ⚠ **The harness has a vacuity the sibling case's docblock already names, and
 * this one closes it by asserting the SPY.** `renderSheet`'s default `onClose`
 * is a fresh `vi.fn()` that never unmounts anything, so "the sheet is still on
 * screen" is true whatever happens — including on the defect. `open` is not a
 * prop of this sheet at all; the caller owns it. So the assertion is that the
 * sheet's `onClose` was NOT CALLED, and that is what a duplicate close would
 * have done to the real app.
 */
describe('E5-20 Escape in the Move dialog does not close the sheet under it', () => {
  it('PLANTED DEFECT: one Escape closes the Move dialog and leaves the sheet open', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const read = ticketRead();
    renderSheet(read, sheetSource(read), { onClose });
    await settled();
    await user.click(screen.getByRole('button', { name: 'Move…' }));
    await user.click(screen.getByRole('button', { name: /Move to/ }));
    await user.click(
      within(await screen.findByRole('listbox')).getByRole('option', { name: 'Waiting on counterparty' }),
    );

    // The stack the finding measured: two modal dialogs, the Move one on top.
    expect(screen.getAllByRole('dialog')).toHaveLength(2);
    expect(screen.getByRole('dialog', { name: 'Move ticket' })).toBeInTheDocument();

    await user.keyboard('{Escape}');

    // The Move dialog took the Escape — that is the gesture the person made…
    expect(screen.queryByRole('dialog', { name: 'Move ticket' })).toBeNull();
    // …and the sheet underneath did NOT also take it. `onClose`, not the
    // absence of the sheet, is the measurement: see this block's docblock.
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('13.1112 the ticket read ANSWERS null (E4-23)', () => {
  /**
   * 13.1112 — E4-23. `useLiveQuery` reported `data` and `error` and nothing else, so
   * "the read answered `null`" and "the read has not answered yet" were the SAME
   * render: `data === null`. The sheet gated its whole body on `read.data === null`
   * and drew `Loading…`.
   *
   * `null` is not a gap here — it is the transport's deliberate 404 affordance.
   * Every `/v1` read door answers ONE frozen 404 body for "no such thing" and for
   * "not yours" (`apps/server/src/routes/tickets.ts`, `READ_NOT_FOUND_BODY`), so a
   * mistyped id, a soft-deleted ticket and a ticket this viewer may not see all
   * arrive as `null`. The sheet therefore said "Loading…" for ever, on a screen the
   * server had already answered.
   *
   * Asserted on the pair, because the two live in one branch: the absent sentence
   * renders AND `Loading…` does not. A case asserting only the sentence passes on a
   * sheet that draws both.
   */
  it('13.1112 a ticket the server answers 404 for says it is not here, not “Loading…”', async () => {
    const source = createFakeDataSource({
      getTicket: async () => null,
      getWorkflowDef: async () => WF_ERRAND,
      getMembers: async () => [],
      getTicketHistory: async () => [],
      getTickets: async (projectId: string) => ({ projectId, rows: [] }),
      getTicketTypes: async () => [],
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

    const absent = await screen.findByTestId('sheet-ticket-absent');
    // The sentence names BOTH readings, because the one-body refusal is the whole
    // reason the server will not say which.
    expect(absent.textContent ?? '').toMatch(/deleted/i);
    expect(absent.textContent ?? '').toMatch(/may not be able to see it/i);
    expect(screen.queryByText('Loading…')).toBeNull();
  });

  /**
   * 13.1113 — the control for the case above, which must not be satisfiable by a
   * sheet that never draws `Loading…` at all. A read that has genuinely not answered
   * yet still says so; if this reddens, the "not here" arm has swallowed the wait.
   */
  it('13.1113 a read still in flight still says “Loading…”, and the absent sentence is not drawn', async () => {
    const source = createFakeDataSource({
      getTicket: () => new Promise(() => {}),
      getWorkflowDef: async () => WF_ERRAND,
      getMembers: async () => [],
      getTicketHistory: async () => [],
      getTickets: async (projectId: string) => ({ projectId, rows: [] }),
      getTicketTypes: async () => [],
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

    expect(await screen.findByText('Loading…')).toBeInTheDocument();
    expect(screen.queryByTestId('sheet-ticket-absent')).toBeNull();
  });
});

describe('17.072 a committed move does not carry its comment to the next one (E2-32)', () => {
  /**
   * 17.072 — E2-32. `comment` and `fieldValues` are cleared by neither reset
   * effect: the destination-change effect clears `evidenceAttachmentId`/
   * `uploadError`, and the `!open` effect does the same on close. The docblock
   * beside the latter defends keeping the comment — *"typing into a dialog and
   * losing it to a stray Cancel is a real cost"* — and that argument is about
   * CANCEL, while the effect serves Cancel and Commit alike. The dialog is mounted
   * for the sheet's whole life (`open={moveOpen}`), so after a committed move —
   * which only calls `setMoveOpen(false)` — the comment is still in state, and
   * `submit` puts it on the wire for the NEXT move: **a comment written about move
   * A is recorded as the comment for move B.**
   *
   * Asserted on the state the person can SEE: after one committed move, reopening
   * the dialog and choosing the same destination must find an EMPTY box. The
   * first move's arm is the control — its comment reaches the wire — without
   * which "empty on reopen" would be satisfiable by a box that never held
   * anything.
   */
  it('17.072 the comment box is empty on the next Move, and the first comment still reaches the wire', async () => {
    const user = userEvent.setup();
    const source = renderSheet(ticketRead());
    await settled();

    // ARM ONE — pick Done, write the comment, commit.
    await user.click(screen.getByRole('button', { name: 'Move…' }));
    await user.click(screen.getByRole('button', { name: /Move to/ }));
    await user.click(within(await screen.findByRole('listbox')).getByRole('option', { name: 'Done' }));
    await user.type(
      screen.getByLabelText('Comment (required by this transition)'),
      'shipped on the morning van',
    );
    await user.click(screen.getByRole('button', { name: 'Move' }));
    await waitFor(() => expect(source.ingested).toHaveLength(1));
    // THE CONTROL: the comment really reached the wire for the move it belonged to.
    expect(source.ingested[0]![0]!.payload).toEqual({
      to: 'done',
      comment: { text: 'shipped on the morning van' },
    });

    // ARM TWO — reopen and pick the SAME destination again.
    await user.click(screen.getByRole('button', { name: 'Move…' }));
    await user.click(screen.getByRole('button', { name: /Move to/ }));
    await user.click(within(await screen.findByRole('listbox')).getByRole('option', { name: 'Done' }));

    expect(screen.getByLabelText('Comment (required by this transition)')).toHaveValue('');
  });
});

/**
 * 13.1182 — ruling E2-31: THE GUARD THAT ACTUALLY HOLDS.
 *
 * `submitTicketEvent` carried `if (submitting) return;` at its top, with a
 * docblock claiming it guarded "a second click landing on the same render pass
 * as the first, before React has re-rendered the `disabled` attribute onto the
 * DOM". It could not: `submitting` is RENDER STATE, so two calls in one render
 * pass both close over the same pre-commit `false`. A guard whose stated purpose
 * is unreachable is indistinguishable from a working one to every reader, so the
 * line is removed and the docblock now says what holds instead — **the
 * `disabled` attribute**, on both buttons.
 *
 * This case pins that, and it is the reason removing the line is safe rather
 * than merely tidy: with the first Close held pending, a SECOND click posts
 * nothing. It is a real assertion about the surviving guard, not a restatement
 * of the deleted one — deleting `disabled={submitting}` reddens it.
 *
 * **It is deliberately NOT the composer's `submittingRef` fix.** That precedent
 * (`TicketEditorSlot.tsx`) reached its handler from TWO sources — a Save button
 * and a blur/Enter commit — and the `disabled` landing on the field is what
 * fired the second. Close/Reopen has one source and no blur-commit, so copying
 * that fix here would install a second guard that also cannot fire.
 */
describe('13.1182 one Close in flight, and a second click that is not a click', () => {
  function heldSource(read: TicketRead) {
    /** Called to let the held ingest answer. */
    let release: (() => void) | null = null;
    const source = createFakeDataSource(
      {
        getTicket: async () => read,
        getWorkflowDef: async () => WF_ERRAND,
        getMembers: async () => [],
        getTicketHistory: async () => [],
      },
      (events) =>
        new Promise((resolve) => {
          release = () =>
            resolve(
              events.map((event) => ({
                status: 'committed' as const,
                eventId: event.id,
                seq: 1,
                serverTime: '2026-08-20T09:00:00.000Z',
              })),
            );
        }),
    );
    return { source, release: () => release?.() };
  }

  it('13.1182 a second click while the first Close is in flight posts NOTHING', async () => {
    const user = userEvent.setup();
    const read = ticketRead({
      ticket: ticketStateSeed({ stateId: 'done', stateCategory: 'terminal', closed: null }),
    });
    const { source, release } = heldSource(read);
    renderSheet(read, source);
    // NOT `settled()`: that waits for the DEFAULT ticket's provenance line
    // ("marked Doing …"), and this fixture is terminal. The Close control is
    // the better signal anyway — it only draws once the workflow has named the
    // state's category, which is the read this case needs.
    const close = (): HTMLElement => screen.getByRole('button', { name: 'Close' });
    await waitFor(() => expect(close()).toBeInTheDocument());

    await user.click(close());
    // The first click's own `setSubmitting(true)` has re-rendered the control
    // DISABLED. That attribute is the guard the finding's paragraph now names.
    await waitFor(() => expect(close()).toBeDisabled());
    expect(source.ingested).toHaveLength(1);

    // A second click, dispatched while the first ingest is still unanswered.
    // `disabled` is what stops it: without that attribute this click reaches
    // the handler and posts a SECOND `ticket.closed`.
    await user.click(close());
    expect(source.ingested).toHaveLength(1);

    release();
    await waitFor(() => expect(close()).not.toBeDisabled());
    // And the single event is the one the first click made.
    expect(source.ingested[0]![0]!.type).toBe('ticket.closed');
  });
});

/**
 * 13.1183 — ruling E2-35: THE DELETE ASKS FIRST.
 *
 * The footer's `Delete` performed the delete on ONE press, while the product
 * reaches the SAME soft delete on many tickets through a whole confirmation
 * surface (`bulk-close-dialog.tsx`). So a multi-ticket close needed a decision
 * point and a single-ticket delete did not — although the single one is the
 * harder to notice and easier to trigger by accident, and it is gated on
 * project-admin rights. This case pins the ask.
 *
 * **It does NOT pin a local `precheck` gate, and that is a decision rather than
 * an omission**: the deletion door's own docblock
 * (`packages/rule-engine/src/checks/deletion.ts`) states that authority "is not
 * a pure function of the envelope — this engine's context carries no membership
 * at all", so a local gate would answer every question about this delete except
 * the one that makes it consequential. The server stays the authority.
 */
describe('13.1183 Delete asks first', () => {
  function footer(): HTMLElement {
    return document.querySelector('.gn-ticket-sheet__footer') as HTMLElement;
  }

  it('13.1183 pressing Delete ASKS, and asks nothing of the server', async () => {
    const user = userEvent.setup();
    const source = renderSheet(ticketRead());
    await settled();

    await user.click(within(footer()).getByRole('button', { name: 'Delete' }));

    const dialog = await screen.findByRole('dialog', { name: 'Delete this ticket?' });
    // It names the ticket and the consequence, INCLUDING the two ways back —
    // "its history is retained" alone would be the misleading half E2-30
    // corrected in the toast's own sentence.
    expect(within(dialog).getByText(new RegExp(ticketRead().title))).toBeInTheDocument();
    expect(dialog.textContent).toContain('the Board, the List, the Calendar and the Timeline');
    expect(dialog.textContent).toContain('15 seconds');
    // THE ASK IS NOT THE ACT.
    expect(source.ingested).toHaveLength(0);

    // And the confirm is NOT a second button called "Delete": the footer's is
    // called that, and two identically-named buttons on one screen are
    // ambiguous to a screen-reader user and unaddressable by role and name.
    expect(screen.getAllByRole('button', { name: 'Delete' })).toHaveLength(1);
  });

  it('13.1183 CONTROL — Cancel closes the ask and still posts nothing', async () => {
    // Without this arm, a Cancel wired to the delete would pass the case above.
    const user = userEvent.setup();
    const source = renderSheet(ticketRead());
    await settled();

    await user.click(within(footer()).getByRole('button', { name: 'Delete' }));
    await screen.findByRole('dialog', { name: 'Delete this ticket?' });
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Delete this ticket?' })).toBeNull());
    expect(source.ingested).toHaveLength(0);
    // The sheet is still here — a Cancel that closed it would be a delete by
    // another name.
    expect(within(footer()).getByRole('button', { name: 'Delete' })).toBeInTheDocument();
  });

  it('13.1183 the CONFIRM is what deletes — one ticket.deleted, this ticket, {}', async () => {
    const user = userEvent.setup();
    const source = renderSheet(ticketRead());
    await settled();

    await user.click(within(footer()).getByRole('button', { name: 'Delete' }));
    await screen.findByRole('dialog', { name: 'Delete this ticket?' });
    await user.click(screen.getByRole('button', { name: 'Delete ticket' }));

    await waitFor(() => expect(source.ingested).toHaveLength(1));
    const batch = source.ingested[0]!;
    expect(batch).toHaveLength(1);
    expect(batch[0]!.type).toBe('ticket.deleted');
    expect(batch[0]!.entity).toEqual({ kind: 'ticket', id: TICKET });
    expect(batch[0]!.payload).toEqual({});
  });
});
