import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TicketTypeDef, WorkflowDef } from '@gisik-nokma/domain';
import type { DataSourceQuery, ListRow, TicketListView } from '@gisik-nokma/app-core';
import { Providers } from '../src/providers.js';
import { stubServices } from './helpers/stub-services.js';

/**
 * Second wave Task 11 (backlog/closed spec §8.3, the List bullet) — the List
 * tab's row checkboxes and its `Close selected (N)` action.
 *
 * Modelled on `backlog-tab.test.tsx` (the `row()`/`typeDef()`/`servedWorld()`
 * shape and the call-count-driven `getTickets`), reading the components it
 * drives rather than assuming them: `TicketList`'s own `selection`/`controls`
 * docblocks, `BulkCloseDialog`'s reporting contract, and the project page's
 * List arm.
 */

const WORKSPACE = 'ws_1';
const PROJECT = 'p_1';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useParams: () => ({ workspaceId: WORKSPACE, projectId: PROJECT }),
  usePathname: () => `/w/${WORKSPACE}/p/${PROJECT}`,
  useSearchParams: () => new URLSearchParams(),
}));

/**
 * The session is a VARIABLE, not a constant, because 13.649 mounts the page
 * signed out — the same shape `project-create-gate.test.tsx` uses for its own
 * three no-user states.
 */
type SessionAnswer = {
  data: { user: { id: string; name: string } } | null;
  isPending: boolean;
};
let session: SessionAnswer = { data: { user: { id: 'user_kiro', name: 'Kiro' } }, isPending: false };
vi.mock('../src/auth-client.js', () => ({
  authClient: {
    useSession: () => session,
    signOut: async () => ({ data: {}, error: null }),
  },
}));

import ProjectPage from '../app/w/[workspaceId]/p/[projectId]/page.js';

afterEach(() => {
  push.mockClear();
  session = { data: { user: { id: 'user_kiro', name: 'Kiro' } }, isPending: false };
});

const PROVENANCE = {
  actorId: 'user_kiro',
  actorName: 'Kiro',
  clientTime: '2026-09-18T09:00:00.000Z',
  serverTime: '2026-09-18T09:00:01.000Z',
};

/** A `ListRow` exactly as `view-types.ts` declares it. `assignee: null` throughout — see `ticket-list.test.tsx`'s 13.597 docblock: an assigned row renders twice, in the pin and in its section. */
function row(overrides: Partial<ListRow> = {}): ListRow {
  const base: ListRow = {
    ticketId: 't_1',
    title: 'A ticket',
    typeId: 'task',
    typeRank: 3,
    parentId: null,
    epicId: null,
    stateId: 'doing',
    stateName: 'Doing',
    stateCategory: 'active',
    stateProvenance: PROVENANCE,
    assignee: null,
    assignedProvenance: null,
    dueDate: null,
    fields: {},
    rollup: null,
    hasRestrictedParent: false,
    pending: false,
    closed: null,
    rank: null,
  };
  return { ...base, ...overrides };
}

/** A terminal row that is NOT closed — the only shape §8.3's gate enables on. */
function doneOpen(ticketId: string, title: string): ListRow {
  return row({ ticketId, title, stateId: 'done', stateName: 'Done', stateCategory: 'terminal' });
}

/** A terminal row that IS closed — terminal, and still refused by the gate's second term. */
function doneClosed(ticketId: string, title: string): ListRow {
  return row({
    ticketId,
    title,
    stateId: 'done',
    stateName: 'Done',
    stateCategory: 'terminal',
    closed: { actorId: 'anselma', at: '2026-09-18T08:00:00.000Z' },
  });
}

function typeDef(overrides: Partial<TicketTypeDef> = {}): TicketTypeDef {
  return { id: 'task', name: 'Task', icon: 'check', rank: 3, workflowId: 'wf_basic', fields: [], ...overrides };
}

const WORKFLOW: WorkflowDef = {
  id: 'wf_basic',
  version: 1,
  name: 'Basic',
  initialStateId: 'todo',
  states: [
    { id: 'todo', name: 'To do', category: 'open' },
    { id: 'doing', name: 'Doing', category: 'active' },
    { id: 'done', name: 'Done', category: 'terminal' },
  ],
  transitions: [],
};

/** The shipped-server shape, minus what a case overrides. */
function servedWorld(rows: ListRow[], overrides: Partial<DataSourceQuery> = {}) {
  return stubServices({
    getBoard: async () => ({ projectId: PROJECT, groups: [] }),
    getAttention: async () => [],
    getMembers: async () => [],
    getTicketTypes: async () => [typeDef()],
    getTickets: async (): Promise<TicketListView> => ({ projectId: PROJECT, rows }),
    getWorkflowDef: async (_workspaceId, workflowId) => (workflowId === WORKFLOW.id ? WORKFLOW : null),
    ...overrides,
  });
}

/** The rows' titles, in the order the dialog lists them. The dialog's own `<ul>` is the only list inside it. */
function dialogTitles(): string[] {
  const list = document.querySelector('[role="dialog"] ul');
  if (list === null) return [];
  return Array.from(list.querySelectorAll('li')).map((li) => li.textContent ?? '');
}

/** Click the List tab and wait for the rows to arrive. */
async function openList(): Promise<void> {
  await userEvent.click(await screen.findByRole('tab', { name: 'List' }));
}

/**
 * 13.648 — the List's `Close selected (N)`: the gate, the batch, and the
 * clear.
 *
 * THE GATE IS SPEC §8.3's OWN SENTENCE — *"enabled only when every selected
 * row is terminal and not closed — the cross-column case."* Both terms are
 * asserted against their own negative, because either alone passes on a
 * control that is enabled too often: a `Doing` row is terminal's negative and
 * a closed `Done` row is `closed === null`'s, and the plan's own mutation
 * (dropping the `closed === null` term) reddens the second one and nothing
 * else.
 *
 * The label keeps the FULL selection count while disabled — `Close selected
 * (3)`, greyed — rather than shrinking to the closeable subset. A control
 * whose number moved as rows were added would answer "how many will close"
 * with a count nobody can check against the boxes they ticked; the disabled
 * state is what says "not these", and the number stays the honest count of
 * what is selected.
 */
describe('13.648 the List tab\'s Close selected (N)', () => {
  it('is enabled only while every selected row is terminal and not closed', async () => {
    render(
      <Providers
        services={servedWorld([
          doneOpen('t_1', 'Done one'),
          doneOpen('t_2', 'Done two'),
          doneClosed('t_3', 'Done closed'),
          row({ ticketId: 't_4', title: 'Doing one' }),
        ])}
      >
        <ProjectPage />
      </Providers>,
    );
    await openList();

    // Before anything is ticked the control exists and is disabled — N = 0 is
    // not a closeable selection, and rendering nothing would leave the tab
    // with no sign that the capability exists at all.
    const control = await screen.findByRole('button', { name: 'Close selected (0)' });
    expect(control).toBeDisabled();

    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Done one' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Done two' }));
    const two = screen.getByRole('button', { name: 'Close selected (2)' });
    expect(two).toBeEnabled();

    // The `Doing` row: terminal's negative.
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Doing one' }));
    expect(screen.getByRole('button', { name: 'Close selected (3)' })).toBeDisabled();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Doing one' }));

    // The CLOSED terminal row: enablable by every term but `closed === null`.
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Done closed' }));
    expect(screen.getByRole('button', { name: 'Close selected (3)' })).toBeDisabled();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Done closed' }));

    // …and back to enabled, so the two negatives above are not passing because
    // the control latched off after the first ineligible selection.
    expect(screen.getByRole('button', { name: 'Close selected (2)' })).toBeEnabled();
  });

  it('confirming ingests ONE batch of two ticket.closed, reloads the list, and leaves the selection empty', async () => {
    let reads = 0;
    const getTickets = async (): Promise<TicketListView> => {
      reads += 1;
      return { projectId: PROJECT, rows: [doneOpen('t_1', 'Done one'), doneOpen('t_2', 'Done two')] };
    };
    const services = servedWorld([], { getTickets });
    const ingested: Array<{ entityId: string; type: string; actorId: string }> = [];
    services.dataSource.ingest = async (events) => {
      for (const event of events) {
        ingested.push({ entityId: event.entity.id, type: event.type, actorId: event.actorId });
      }
      return events.map((event) => ({
        status: 'committed' as const,
        eventId: event.id,
        seq: 1,
        serverTime: '2026-09-18T09:05:00.000Z',
      }));
    };

    render(
      <Providers services={services}>
        <ProjectPage />
      </Providers>,
    );
    await openList();
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Select Done one' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Done two' }));
    await userEvent.click(screen.getByRole('button', { name: 'Close selected (2)' }));

    // The dialog lists both titles, in the order they appear in the list.
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(dialogTitles()).toEqual(['Done one', 'Done two']);

    const readsBeforeConfirm = reads;
    await userEvent.click(screen.getByRole('button', { name: 'Close 2 tickets' }));

    // ONE ingest call carrying TWO envelopes — spec §8.3's "one event per
    // ticket" and one door, at once. A loop of two single-event calls would
    // satisfy the first half and turn one atomic door into two.
    await waitFor(() => expect(ingested).toHaveLength(2));
    expect(ingested).toEqual([
      { entityId: 't_1', type: 'ticket.closed', actorId: 'user_kiro' },
      { entityId: 't_2', type: 'ticket.closed', actorId: 'user_kiro' },
    ]);

    // `list.reload` follows, and the selection is empty afterwards: the list
    // now answers from a fresh read, and the boxes are unchecked because the
    // caller cleared the set — not because each box was individually toggled.
    await waitFor(() => expect(reads).toBeGreaterThan(readsBeforeConfirm));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Close selected (0)' })).toBeDisabled();
    });
    expect(screen.getByRole('checkbox', { name: 'Select Done one' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Select Done two' })).not.toBeChecked();

    // A COMPLETE close takes the dialog away — the half Task 10's conditional
    // clear exists for, and the half 13.794 shows the OTHER side of.
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});

/**
 * 13.649 — spec §8.3's List capability is a WRITE door, so it is gated on the
 * session exactly as the board's `moves` and the Backlog tab's `rowAction`
 * are: `currentUserId` is `''` before the session resolves and while signed
 * out, and a `ticket.closed` built from an empty actor would be refused by
 * `checkRolePermission` for a reason (`env.actorId !== ctx.sessionUserId`)
 * that names the person's permissions rather than the truth (case 3.144's
 * defect, one surface over).
 *
 * The rows ARE rendered in this case — the control is absent because it was
 * gated, not because the tab failed to draw. Without that half the negative
 * would pass on a blank page.
 */
describe('13.649 a signed-out viewer is offered neither the row checkboxes nor the control', () => {
  it('renders the rows, and neither the checkbox column nor Close selected', async () => {
    session = { data: null, isPending: false };
    render(
      <Providers services={servedWorld([doneOpen('t_1', 'Done one')])}>
        <ProjectPage />
      </Providers>,
    );
    await openList();

    // The positive control: the List really is on screen.
    expect(await screen.findByText('Done one')).toBeInTheDocument();
    expect(screen.queryAllByRole('checkbox', { name: /^Select / })).toHaveLength(0);
    expect(screen.queryByRole('button', { name: /^Close selected/ })).not.toBeInTheDocument();
  });
});

/**
 * 13.794 — a PARTIAL close reloads the list and KEEPS the dialog, with the
 * refusal still listed. **This is the case the plan's own text gets wrong.**
 *
 * §8.3's Board bullet is one sentence carrying both halves — *"Per-ticket
 * refusals … stay listed; the rest close and the board reloads."* — and the
 * List bullet says "same dialog, same batch". The plan wires the List's
 * `onClosed` to `list.reload()` with the selection cleared on reload, and names
 * **neither a snapshot nor an `open` expression**. So it does not produce the
 * unmount, it fails to forbid it: under the reading that makes `open` follow
 * the selection, the clear unmounts the dialog and the `Could not close` rows
 * the spec requires it to keep on screen are destroyed in the same tick they
 * were written. (Under the plan's other literal reading — live `tickets`, its
 * own open flag — the refusal list would still render, because `failures` is
 * the dialog's own state, but the report would describe a selection that has
 * since been emptied: `Close 0 tickets` over an opening that was two. Both
 * readings fall short; an earlier draft of this docblock claimed the plan
 * "produces" the unmount and an independent review corrected it.)
 *
 * The fix is the one Task 10's arm already carries, stated for this consumer:
 * **the dialog's tickets are SNAPSHOTTED at click time** (so the reload cannot
 * change what it is a report about — this is what keeps the report coherent)
 * and **the dialog keeps its own open flag** (so clearing the selection cannot
 * unmount it — this is what keeps it readable). `onClosed` reloads
 * UNCONDITIONALLY — "the rest close and the list reloads" holds on both
 * outcomes — and the snapshot is released only on a COMPLETE close.
 *
 * The case asserts all four: the refusal listed, the committed ticket no
 * longer pending, the dialog still up, and the list reloaded with the
 * selection cleared — the last one being what proves the mount is not keyed
 * on the selection.
 */
describe('13.794 a PARTIAL close reloads the list and keeps the dialog with its refusal listed', () => {
  it('keeps the dialog, lists `Could not close`, and reloads anyway', async () => {
    let reads = 0;
    const getTickets = async (): Promise<TicketListView> => {
      reads += 1;
      return { projectId: PROJECT, rows: [doneOpen('t_1', 'Done one'), doneOpen('t_2', 'Done two')] };
    };
    const services = servedWorld([], { getTickets });
    services.dataSource.ingest = async (events) =>
      events.map((event) =>
        event.entity.id === 't_2'
          ? {
              status: 'refused' as const,
              eventId: event.id,
              rule: 'close-requires-terminal',
              reason: 'Not in a terminal state.',
            }
          : {
              status: 'committed' as const,
              eventId: event.id,
              seq: 1,
              serverTime: '2026-09-18T09:05:00.000Z',
            },
      );

    render(
      <Providers services={services}>
        <ProjectPage />
      </Providers>,
    );
    await openList();
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Select Done one' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Done two' }));
    await userEvent.click(screen.getByRole('button', { name: 'Close selected (2)' }));

    const readsBeforeConfirm = reads;
    await userEvent.click(await screen.findByRole('button', { name: 'Close 2 tickets' }));

    // The committed half is reported and the other is named, verbatim.
    expect(await screen.findByText('Could not close')).toBeInTheDocument();
    expect(screen.getByText('Done two — Not in a terminal state.')).toBeInTheDocument();

    // "the rest close and the list reloads" — on THIS outcome too.
    await waitFor(() => expect(reads).toBeGreaterThan(readsBeforeConfirm));

    // The dialog survived the reload and the selection clear. If `open` were
    // derived from the selection, this is where it would vanish.
    // The dialog's own name carries the SNAPSHOT's size, not the number still
    // pending — `tickets` is the snapshot and `pending` is what is left, and on
    // this outcome they differ. That difference is the point: the report is
    // about the opening, and the opening was two.
    expect(screen.getByRole('dialog', { name: 'Close 2 tickets' })).toBeInTheDocument();
    // Only the committed ticket left `pending`, so the confirm control is gone
    // — nothing is left to try.
    expect(screen.queryByRole('button', { name: /^Close \d+ tickets?$/ })).not.toBeInTheDocument();

    // The list reloaded and the selection was cleared by that reload, which is
    // what makes the dialog's survival above a fact about its own flag rather
    // than about the selection never having moved.
    expect(screen.getByRole('button', { name: 'Close selected (0)' })).toBeDisabled();
  });
});

/**
 * 13.795 — an OPEN dialog's tickets cannot be swapped under it.
 *
 * `BulkCloseDialog` states its own precondition: a parent that swaps `tickets`
 * while the dialog stays OPEN (no `open` transition) is *not covered by its
 * reset*, because the reset is an effect keyed on `open`. `open` here is
 * `pendingClose !== null` and `tickets` is that same snapshot — so a second
 * opening written into a non-null `pendingClose` is a swap with no transition,
 * and the previous opening's `closedIds`/`failures` survive against a list they
 * do not describe. The concrete failure is a FULL success that does not clear:
 * the second set closes completely, but ids from the first are still subtracted
 * from its `pending`, so the dialog stays up with a `Could not close` row
 * naming a ticket from the other selection and no confirm left to press.
 *
 * This is Task 10's case 13.793 one surface over — the same guard, on the same
 * shared component, found there by an independent review and applied here
 * before it could be found twice. The reachability is a KEYBOARD path in a
 * browser, not a pointer one (`Dialog` renders a full-viewport scrim and ships
 * no focus trap or portal — a named follow-on on the shared component);
 * **jsdom does not hit-test the scrim**, so an ordinary click in this harness
 * exercises exactly the state transition an escaped focus would produce.
 *
 * THE CONTROL IS IN THIS CASE, and it is the second half: after dismissing the
 * dialog, the same click on the same control DOES open a fresh dialog with the
 * new selection — so the element is live, the selection really did change, and
 * the titles above are the SAME only because the guard refused.
 *
 * **What the control does NOT prove, stated because an independent review
 * measured the gap and an earlier draft of this docblock overshot it.** It is a
 * THIRD click, not the refused second one, so it cannot distinguish the shipped
 * guard from a handler that swallows a click only while `pendingClose !== null`
 * — the two are observationally identical, because a correctly refused click is
 * by definition a no-op. No assertion can separate them; the mutation that
 * removes the guard is what proves the guard is load-bearing (it reddens this
 * case and nothing else), and the control proves the CLICK is not dead.
 */
describe('13.795 an open dialog’s tickets cannot be swapped under it', () => {
  it('refuses the swap, and a fresh open after dismissal carries the new selection', async () => {
    render(
      <Providers
        services={servedWorld([
          doneOpen('t_1', 'Done one'),
          doneOpen('t_2', 'Done two'),
          doneOpen('t_3', 'Done three'),
        ])}
      >
        <ProjectPage />
      </Providers>,
    );
    await openList();
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Select Done one' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Done two' }));
    await userEvent.click(screen.getByRole('button', { name: 'Close selected (2)' }));
    expect(dialogTitles()).toEqual(['Done one', 'Done two']);

    // Swap the SELECTION while the dialog is open — untick `t_2`, tick `t_3` —
    // and press the control again.
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Done two' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Done three' }));
    await userEvent.click(screen.getByRole('button', { name: 'Close selected (2)' }));

    // The dialog still describes the opening it made. `Done three` is nowhere
    // in it — `dialogTitles()` reads the dialog's own list, so this is a claim
    // about the DIALOG and not about the page (the row itself is still on
    // screen behind it, where it belongs) — and both the name and the confirm
    // control still say two.
    expect(dialogTitles()).toEqual(['Done one', 'Done two']);
    expect(screen.getByRole('dialog', { name: 'Close 2 tickets' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close 2 tickets' })).toBeInTheDocument();

    // CONTROL, same case: dismissing and pressing again is an ordinary first
    // opening, and it carries the CURRENT selection — so the refusal above was
    // the guard, not a dead control.
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: 'Close selected (2)' }));
    expect(dialogTitles()).toEqual(['Done one', 'Done three']);
    expect(screen.getByRole('dialog', { name: 'Close 2 tickets' })).toBeInTheDocument();
  });
});
