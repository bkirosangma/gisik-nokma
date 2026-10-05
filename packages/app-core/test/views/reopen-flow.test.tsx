import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
// Named import, not the default: `@testing-library/user-event` ships no default
// export that survives `verbatimModuleSyntax`, settled at
// packages/ui/test/components.test.tsx and repeated by board.test.tsx and
// ticket-list.test.tsx. The plan's Task 13 snippet carries the default spelling.
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IngestResult, SubmittedEvent, WorkflowDef } from '@gisik-nokma/domain';
import { createClientStateCache } from '../../src/cache.js';
import { SERVING_GAPS, ServingGapError } from '../../src/online/mappers.js';
import { CreateTicketFlow } from '../../src/views/create-ticket-flow.js';
import { ReopenDialog } from '../../src/views/reopen-dialog.js';
import type { TicketRead } from '../../src/view-types.js';
import { parentTerminalRefusal, rankRefusal } from '@gisik-nokma/rule-engine';
import { createFakeDataSource, type FakeDataSource } from '../helpers/fake-data-source.js';
import { PARENT, WF_ERRAND, WS, claim, ticketStateSeed } from '../helpers/seed.js';

/**
 * The engine's real CREATE-arm sentence, IMPORTED — and the two states this
 * constant has been through are both worth seeing.
 *
 * It was `'Parent "Registrations" is Done; it must reopen because it is acquiring
 * live work.'`, under a name asserting it is the SERVER's. The engine has never
 * emitted it. #219 corrected the value by reading the wire but had to leave it a
 * literal, because `checks/refusals.ts` was re-exported from nowhere — case
 * 7.245. That is now closed and the value is the producer's own function.
 *
 * **The import does not make this file a witness**: reword the builder and this
 * moves with it, silently. That reword is caught by 7.238/7.239, which hold a
 * literal over a real round trip. What it buys is that this constant can never
 * again say SERVER while being a fabrication.
 */
const SERVER_PARENT_TERMINAL_REASON =
  '"Registrations" is finished (Done). Adding live work reopens it — choose a state to reopen it to, then add this ticket.';

/**
 * The New-ticket dialog remembers the "Starts in the backlog?" answer in
 * `localStorage`, keyed by user, and `renderFlow` mounts it with a real
 * `currentUserId` — so 13.592b's flip writes a record that every later case in
 * this file would inherit. Cleared between cases rather than inside the one case
 * that writes it, for the reason `new-ticket-dialog.test.tsx` states at its own
 * guard: a leaked record turns a later case green — or, here, red — for a reason
 * that has nothing to do with what it asserts.
 */
beforeEach(() => {
  window.localStorage.clear();
});

/** `rankRefusal('Task', 'Sub-task')`'s real output, pinned below. */
const RANK_REASON =
  `"Task" cannot go under "Sub-task": a ticket's parent must be a bigger kind of work.`;

/**
 * What the LOCAL pre-check writes when it refuses off cached state — and this one
 * is ACCURATE, byte for byte against `app-core/src/precheck.ts:278`.
 *
 * It stays a literal, and the reason is a gap rather than a choice: `precheck.ts`
 * builds that sentence with an INLINE template inside the function that returns
 * it, so there is no symbol to import — the same shape as `rule-engine/src/rules/*.ts`
 * (case 7.252). Recorded, not fixed: minting a builder for it is a source change
 * to a shipped client path and therefore a ruling.
 *
 * **Keeping the two constants apart is the point of this file.** The engine and
 * the client pre-check refuse the same situation in DIFFERENT words, and the
 * neighbouring `SERVER_…` constant spent three files' worth of history being a
 * hybrid of the two — an invented head on this sentence's tail (case 7.250).
 */
const INSTANT_PARENT_TERMINAL_REASON =
  '"Registrations" is in a terminal state; it must reopen because it is acquiring live work.';

function parentState(overrides: {
  stateId: string;
  stateCategory: 'terminal' | 'active';
  /**
   * Absent or `undefined` means never closed — the same `?? null` idiom
   * `create-ticket-flow.tsx` reads `TicketState.closed` through, since the
   * domain field is optional (441 fixtures predate it). Written explicitly as
   * `null` below rather than left absent so every fixture built through this
   * helper states its closed-ness rather than relying on the field's own
   * default.
   */
  closed?: { actorId: string; at: string };
}) {
  return ticketStateSeed({
    id: PARENT,
    parentId: null,
    workflowId: 'wf-errand',
    workflowVersion: 1,
    stateId: overrides.stateId,
    stateCategory: overrides.stateCategory,
    closed: overrides.closed ?? null,
    fields: {
      title: {
        value: 'Registrations',
        actorId: 'user_kiro',
        clientTime: '2026-08-18T08:00:00.000Z',
        serverTime: '2026-08-18T08:00:01.000Z',
      },
    },
  });
}

const PARENT_READ: TicketRead = {
  ticket: parentState({ stateId: 'done', stateCategory: 'terminal' }),
  title: 'Registrations',
  stateProvenance: claim(),
  // This fixture's ticket has never been assigned, so there is no claim
  // behind an assignee: `null` is the whole truth (`read/assigned-provenance.ts`).
  assignedProvenance: null,
  // This fixture is about the close/reopen round-trip and no case here reads the
  // audience; `null` is the honest "this fake carried no visibility row" rather
  // than a mode invented for a ticket whose fixture says nothing about one.
  visibility: null,
  parent: null,
  rollup: null,
  // Neither crumb field is read by this file's cases — it is about the
  // close/reopen round-trip — so both take the honest default a fake standing
  // in for a read that composed no key would carry.
  key: null,
  epic: null,
};

/**
 * 13.593 · T13.5 (view half, Ruling 38b) — the same PARENT, but CLOSED. Used
 * only by the describe block below; every other case in this file reads
 * `PARENT_READ` and gets `parentClosed: false` (`flows/guarded-child-event
 * .test.ts`'s T13.3a-g pin the batch that produces for that shape).
 */
const CLOSED_PARENT_READ: TicketRead = {
  ticket: parentState({
    stateId: 'done',
    stateCategory: 'terminal',
    closed: { actorId: 'user_anselma', at: '2026-09-17T09:00:00.000Z' },
  }),
  title: 'Registrations',
  stateProvenance: claim(),
  // This fixture's ticket has never been assigned, so there is no claim
  // behind an assignee: `null` is the whole truth (`read/assigned-provenance.ts`).
  assignedProvenance: null,
  // As `PARENT_READ` above: no case in this file reads the audience.
  visibility: null,
  parent: null,
  rollup: null,
  // Neither crumb field is read by this file's cases — it is about the
  // close/reopen round-trip — so both take the honest default a fake standing
  // in for a read that composed no key would carry.
  key: null,
  epic: null,
};

function committed(eventId: string): IngestResult {
  return { status: 'committed', eventId, seq: 10, serverTime: '2026-08-20T09:20:00.000Z' };
}

function refused(eventId: string, rule: string, reason: string): IngestResult {
  return { status: 'refused', eventId, rule, reason };
}

function parentTerminal(eventId: string): IngestResult {
  return refused(eventId, 'hierarchy.parent-terminal', SERVER_PARENT_TERMINAL_REASON);
}

type WorkflowAsk = { workflowId: string; version: number | undefined };

function flowSource(
  script: (call: number, events: SubmittedEvent[]) => IngestResult[],
  overrides: {
    getTicket?: () => Promise<TicketRead | null>;
    workflowAsks?: WorkflowAsk[];
  } = {},
): FakeDataSource {
  let call = 0;
  return createFakeDataSource(
    {
      getTicket: overrides.getTicket ?? (async () => PARENT_READ),
      getWorkflowDef: async (_workspaceId, workflowId, version) => {
        overrides.workflowAsks?.push({ workflowId, version });
        return WF_ERRAND;
      },
    },
    (events) => {
      call += 1;
      return script(call, events);
    },
  );
}

async function createTicketUnderParent(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.click(screen.getByRole('button', { name: 'Create ticket' }));
  await user.type(screen.getByLabelText('Title'), 'Renew the trade licence');
  // The Parent picker is the shared searchable `Select` now, so it is opened and clicked rather
  // than `selectOptions`'d: its trigger is an `<input role="combobox">` with no `<option>`
  // children, and the options are portal-rendered into a `listbox` on `document.body` only while
  // the panel is open. Matched BY TITLE, not by `PARENT` (the id) — `selectOptions` matched on an
  // option's VALUE, a click matches on what the row actually reads. The title is the one
  // `renderFlow` below supplies for `PARENT` in this file's own `parentCandidates` fixture.
  await user.click(screen.getByLabelText('Parent'));
  await user.click(
    within(await screen.findByRole('listbox')).getByRole('option', { name: 'Registrations' }),
  );
  await user.click(within(screen.getByRole('dialog', { name: 'Create ticket' })).getByRole('button', { name: 'Create ticket' }));
}

function renderFlow(
  source: FakeDataSource,
  extra: {
    cache?: ReturnType<typeof createClientStateCache>;
    /**
     * Defaults to a plain "Registrations" candidate so every case in this file
     * (none of which is about the birth-state control) keeps seeing a plain
     * `start: 'backlog'` first attempt.
     *
     * ⚠ `inFocus` used to be on this shape and is gone (owner ruling
     * 2026-09-23, lifting spec §5.4's parent condition). The fixtures that
     * carried `inFocus: true` did so to make the dialog render its old "Start
     * in focus" checkbox; the control is now a `Switch` that is always present
     * and whose position the person owns, so no fixture can select it and the
     * field had no reader left.
     */
    parentCandidates?: Array<{ id: string; title: string }>;
  } = {},
): ReturnType<typeof vi.fn> {
  const onCreated = vi.fn();
  render(
    <CreateTicketFlow
      dataSource={source}
      cache={extra.cache}
      workspaceId={WS}
      projectId="01J9GPRJ000000000000000000"
      currentUserId="user_kiro"
      typeOptions={[{ id: 'task', name: 'Task', rank: 3, workflowId: 'wf-errand' }]}
      workflowStates={() => null}
      parentCandidates={extra.parentCandidates ?? [{ id: PARENT, title: 'Registrations' }]}
      // The roster the Assignee picker offers (owner request 2026-09-23). Empty
      // here: no case in this file is about the assignee, and `[]` leaves the
      // picker offering "Unassigned" alone, which is the draft's default — so
      // every `ticket.created` below carries `assigneeId: null`, exactly as it
      // did before the member existed.
      assigneeCandidates={[]}
      onCreated={onCreated}
    />,
  );
  return onCreated;
}

describe('3.79 · T13.4 the reopen option (owner decision) — the whole flow', () => {
  it('T13.4a offers the reopen at the moment of refusal, then emits parent-with-cause BEFORE the child, and both commit', async () => {
    const user = userEvent.setup();
    const source = flowSource((call, events) =>
      call === 1
        ? events.map((event) => parentTerminal(event.id))
        : events.map((event) => committed(event.id)),
    );
    const onCreated = renderFlow(source);
    await createTicketUnderParent(user);

    // The dialog names the parent, its terminal state, and the SERVER's reason verbatim.
    const dialog = await screen.findByRole('dialog', { name: 'Reopen parent?' });
    expect(dialog).toHaveTextContent('Registrations is Done.');
    expect(dialog).toHaveTextContent(`Refused by the server: hierarchy.parent-terminal: ${SERVER_PARENT_TERMINAL_REASON}`);

    // The picker offers only structurally reachable non-terminal states. Read from
    // the shared Select's HiddenSelect mirror rather than `getByLabelText('Reopen
    // to')`: post-migration that name resolves to BOTH the visible trigger button
    // and HiddenSelect's own hidden native <select> (they share the accessible
    // name), so an unscoped getByLabelText throws "Found multiple elements"
    // (confirmed empirically). HiddenSelect is fed from the same buildCollection
    // source as the visible panel (confirmed in select.tsx), so this stays a
    // genuine, non-vacuous check of the same options. Its blank placeholder
    // option (value="") is filtered out, matching the established pattern at
    // workflow-builder/publish.test.tsx:411-413.
    const picker = within(dialog).getByTestId('hidden-select-container');
    const optionValues = [...picker.querySelectorAll('option')]
      .map((option) => option.getAttribute('value'))
      .filter((value) => value !== '');
    expect(optionValues.sort()).toEqual(['doing', 'todo']);

    await user.click(screen.getByRole('button', { name: /Reopen to/ }));
    await user.click(within(await screen.findByRole('listbox')).getByRole('option', { name: 'Doing' }));
    await user.click(screen.getByRole('button', { name: 'Reopen and proceed' }));

    await waitFor(() => expect(source.ingested).toHaveLength(3));
    const [refusedCreate, parentBatch, childBatch] = source.ingested;
    const childTicketId = refusedCreate?.[0]?.entity.id;
    expect(refusedCreate?.[0]?.type).toBe('ticket.created');
    expect(parentBatch?.[0]?.type).toBe('ticket.transitioned');
    expect(parentBatch?.[0]?.entity).toEqual({ kind: 'ticket', id: PARENT });
    expect(parentBatch?.[0]?.payload).toEqual({
      to: 'doing',
      cause: { kind: 'reopened-for-child', childTicketId },
    });
    expect(childBatch?.[0]).toBe(refusedCreate?.[0]); // the same claim, retried after the remedy
    expect(onCreated).toHaveBeenCalledWith(childTicketId);
    expect(screen.queryByRole('dialog', { name: 'Reopen parent?' })).not.toBeInTheDocument();
  });

  it("T13.4b the parent's own rules are honoured, not bypassed — its refusal renders verbatim and the child is never sent", async () => {
    const user = userEvent.setup();
    const source = flowSource((call, events) =>
      call === 1
        ? events.map((event) => parentTerminal(event.id))
        : events.map((event) =>
            refused(event.id, 'restrict-to', 'Only Anselma Marak may move this out of Done.'),
          ),
    );
    const onCreated = renderFlow(source);
    await createTicketUnderParent(user);
    await screen.findByRole('dialog', { name: 'Reopen parent?' });
    await user.click(screen.getByRole('button', { name: /Reopen to/ }));
    await user.click(within(await screen.findByRole('listbox')).getByRole('option', { name: 'Doing' }));
    await user.click(screen.getByRole('button', { name: 'Reopen and proceed' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Refused by the server: restrict-to: Only Anselma Marak may move this out of Done.',
    );
    // create attempt + parent attempt; the child was NEVER resubmitted.
    expect(source.ingested).toHaveLength(2);
    expect(source.ingested[1]?.[0]?.type).toBe('ticket.transitioned');
    expect(onCreated).not.toHaveBeenCalled();
    // The offer stays on screen: another target on the same list may be allowed.
    expect(screen.getByRole('dialog', { name: 'Reopen parent?' })).toBeInTheDocument();
  });

  it('T13.4c a child refusal after a committed reopen reports both truths — the reopen is recorded history', async () => {
    const user = userEvent.setup();
    const source = flowSource((call, events) => {
      if (call === 1) return events.map((event) => parentTerminal(event.id));
      if (call === 2) return events.map((event) => committed(event.id));
      return events.map((event) =>
        refused(event.id, 'hierarchy.rank', RANK_REASON),
      );
    });
    const onCreated = renderFlow(source);
    await createTicketUnderParent(user);
    await screen.findByRole('dialog', { name: 'Reopen parent?' });
    await user.click(screen.getByRole('button', { name: /Reopen to/ }));
    await user.click(within(await screen.findByRole('listbox')).getByRole('option', { name: 'Doing' }));
    await user.click(screen.getByRole('button', { name: 'Reopen and proceed' }));

    const alertBox = await screen.findByRole('alert');
    expect(alertBox).toHaveTextContent('Registrations was reopened. That is now recorded history.');
    expect(alertBox).toHaveTextContent(
      `Refused by the server: hierarchy.rank: ${RANK_REASON}`,
    );
    expect(onCreated).not.toHaveBeenCalled();
    // Three claims and no fourth: nothing was sent to compensate the reopen away.
    expect(source.ingested).toHaveLength(3);
  });

  it('T13.4d an ordinary successful create never shows the dialog', async () => {
    const user = userEvent.setup();
    const source = flowSource((_call, events) => events.map((event) => committed(event.id)));
    const onCreated = renderFlow(source);
    await createTicketUnderParent(user);
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(screen.queryByRole('dialog', { name: 'Reopen parent?' })).not.toBeInTheDocument();
    expect(source.ingested).toHaveLength(1);
  });

  it("T13.4e the parent's workflow is read at the version the parent PINS, never latest", async () => {
    const user = userEvent.setup();
    const workflowAsks: WorkflowAsk[] = [];
    const source = flowSource(
      (call, events) =>
        call === 1
          ? events.map((event) => parentTerminal(event.id))
          : events.map((event) => committed(event.id)),
      { workflowAsks },
    );
    renderFlow(source);
    await createTicketUnderParent(user);
    await screen.findByRole('dialog', { name: 'Reopen parent?' });
    expect(workflowAsks).toEqual([{ workflowId: 'wf-errand', version: 1 }]);
  });

  it('T13.4f a local check that did not refuse settles nothing — the SERVER refuses and its reason is what shows', async () => {
    const user = userEvent.setup();
    const cache = createClientStateCache();
    // A non-terminal parent: the pre-check reads it and declines to refuse.
    cache.upsertTicket(parentState({ stateId: 'doing', stateCategory: 'active' }));
    const source = flowSource((_call, events) =>
      events.map((event) =>
        refused(event.id, 'restrict-to', 'Only Anselma Marak may put work in this project.'),
      ),
    );
    const onCreated = renderFlow(source, { cache });
    await createTicketUnderParent(user);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Refused by the server: restrict-to: Only Anselma Marak may put work in this project.',
    );
    expect(onCreated).not.toHaveBeenCalled();
    // The optimistic outcome was never shown, and the claim really did round-trip.
    expect(source.ingested).toHaveLength(1);
    expect(screen.queryByRole('dialog', { name: 'Reopen parent?' })).not.toBeInTheDocument();
  });

  it('T13.4g a local refusal is not presented as though the server had spoken — nothing is even submitted', async () => {
    const user = userEvent.setup();
    const cache = createClientStateCache();
    cache.upsertTicket(parentState({ stateId: 'done', stateCategory: 'terminal' }));
    const source = flowSource((_call, events) => events.map((event) => committed(event.id)));
    renderFlow(source, { cache });
    await createTicketUnderParent(user);

    const dialog = await screen.findByRole('dialog', { name: 'Reopen parent?' });
    expect(dialog).toHaveTextContent(
      `instant check: hierarchy.parent-terminal: ${INSTANT_PARENT_TERMINAL_REASON}`,
    );
    expect(dialog).not.toHaveTextContent('Refused by the server');
    // The whole point: the offer arrived with NO round trip behind it.
    expect(source.ingested).toEqual([]);

    // Accepting it submits the parent first and then the child, exactly as the
    // server-refused path does — the instant route is a shortcut to the offer,
    // never a shortcut past the two claims.
    await user.click(screen.getByRole('button', { name: /Reopen to/ }));
    await user.click(within(await screen.findByRole('listbox')).getByRole('option', { name: 'Doing' }));
    await user.click(screen.getByRole('button', { name: 'Reopen and proceed' }));
    await waitFor(() => expect(source.ingested).toHaveLength(2));
    expect(source.ingested[0]?.[0]?.type).toBe('ticket.transitioned');
    expect(source.ingested[1]?.[0]?.type).toBe('ticket.created');
  });

  it('3.80 · T13.4h when the parent read REFUSES, the offer is not built and the refusal still renders verbatim', async () => {
    const user = userEvent.setup();
    // THE DAY ARRIVED. 3.75's note said a hand-written Error "would keep passing
    // on the day the gap closes, which is the one day this case must change" —
    // ruling P25 clause 1 closed `getTicket`'s three absences, so the register
    // no longer carries it and `SERVING_GAPS['getTicket'] ?? []` would now throw
    // a refusal naming NOTHING. That fallback is the trap: it degrades silently
    // to an empty absence list, and only the assertion below being specific
    // caught it. The absences are constructed, and the inverted control beneath
    // this case is what keeps that honest.
    const source = flowSource((_call, events) => events.map((event) => parentTerminal(event.id)), {
      getTicket: async () => {
        throw new ServingGapError('getTicket', [
          {
            field: 'TicketRead.title',
            wireKey: 'title',
            wireRoute: '/v1/workspaces/:workspaceId/tickets/:ticketId',
            because: 'constructed — the real entry was closed by P25 clause 1',
            owner: 'test fixture; see the inverted control below',
          },
        ]);
      },
    });
    const onCreated = renderFlow(source);
    await createTicketUnderParent(user);

    const alertBox = await screen.findByRole('alert');
    expect(alertBox).toHaveTextContent(
      `Refused by the server: hierarchy.parent-terminal: ${SERVER_PARENT_TERMINAL_REASON}`,
    );
    // The gap names its own first absence, read off the register at run time.
    expect(alertBox).toHaveTextContent('response mapping failed at getTicket');
    expect(alertBox).toHaveTextContent('TicketRead.title');
    expect(screen.queryByRole('dialog', { name: 'Reopen parent?' })).not.toBeInTheDocument();
    // No invented offer, and no silent retry of the refused claim.
    expect(source.ingested).toHaveLength(1);
    expect(onCreated).not.toHaveBeenCalled();
  });

  it('3.80 · T13.4h-control (INVERTED) getTicket no longer refuses, which is why T13.4h constructs its own absence', () => {
    // The original control proved the register carried `getTicket`, so that
    // T13.4h was a measurement rather than a story. P25 clause 1 closed it, and
    // the control inverts rather than disappears: the same duty, pointed at the
    // fact that now licenses hand-construction.
    expect(SERVING_GAPS['getTicket']).toBeUndefined();
    // Non-vacuity, so this is a fact about `getTicket` and not about an empty
    // register: the methods that DO still refuse are named, and one of them
    // carries a real absence.
    // ZERO, and it has read six, then four, then three, then one. Each previous
    // spelling said in as many words that it was SCHEDULED TO EXPIRE and named
    // what would expire it — **and this one named the exact condition and it
    // ARRIVED**: *"It will expire once more only if `search` is ever served,
    // which needs `routes/search.ts` to stop destroying which column matched
    // inside the query."* The owner ruled that query must derive `matchedIn`
    // (2026-09-19) and it now does, so the last entry is gone — the check
    // working, not breaking, for the fourth time.
    expect(Object.keys(SERVING_GAPS)).toEqual([]);
    // The line that stood here was a NON-VACUITY CARRIER: *"without this, an
    // empty register would satisfy the line above and this control would pass by
    // measuring nothing."* **That is now the situation it was written to
    // catch**, and it failed loudly rather than letting the control pass by
    // measuring nothing — the carrier doing its job on its way out. There is no
    // honest replacement for it: with the register empty, `toEqual([])` above is
    // the whole of what this control can prove, and saying so is the point.
  });

  it('T13.4k a workflow with no non-terminal move out of its terminal state offers no reopen, and says so', async () => {
    const user = userEvent.setup();
    // 'done' is terminal and its only declared edge leaves to another terminal
    // state, so there is nothing to offer. A disabled button with no sentence
    // beside it would leave the actor guessing why.
    const deadEnd: WorkflowDef = {
      ...WF_ERRAND,
      states: [
        { id: 'todo', name: 'To do', category: 'open' },
        { id: 'done', name: 'Done', category: 'terminal' },
        { id: 'cancelled', name: 'Cancelled', category: 'terminal' },
      ],
      transitions: [{ from: 'done', to: 'cancelled', rules: [] }],
    };
    const source = createFakeDataSource(
      { getTicket: async () => PARENT_READ, getWorkflowDef: async () => deadEnd },
      (events) => events.map((event) => parentTerminal(event.id)),
    );
    renderFlow(source);
    await createTicketUnderParent(user);

    const dialog = await screen.findByRole('dialog', { name: 'Reopen parent?' });
    expect(dialog).toHaveTextContent(
      'Done has no declared move to a state that is not itself final, so this workflow offers no reopen.',
    );
    expect(within(dialog).queryByLabelText('Reopen to')).not.toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Reopen and proceed' })).toBeDisabled();
  });

  it('T13.4l a claim the server answers with NOTHING is reported as unknown, never as a quiet success', async () => {
    const user = userEvent.setup();
    const source = flowSource(() => []);
    const onCreated = renderFlow(source);
    await createTicketUnderParent(user);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This build could not carry the claim through: The server returned no result for ticket.created',
    );
    expect(onCreated).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog', { name: 'Reopen parent?' })).not.toBeInTheDocument();
  });

  it('T13.4i cancelling the offer submits nothing further', async () => {
    const user = userEvent.setup();
    const source = flowSource((_call, events) => events.map((event) => parentTerminal(event.id)));
    const onCreated = renderFlow(source);
    await createTicketUnderParent(user);
    const offer = await screen.findByRole('dialog', { name: 'Reopen parent?' });
    // Scoped: the New-ticket dialog is layered behind this one and has a Cancel
    // of its own, so an unscoped query would be ambiguous.
    await user.click(within(offer).getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('dialog', { name: 'Reopen parent?' })).not.toBeInTheDocument();
    expect(source.ingested).toHaveLength(1);
    expect(onCreated).not.toHaveBeenCalled();
  });

  it('T13.4j a claim the server calls INVALID reports the door’s own code and message, not a stand-in', async () => {
    const user = userEvent.setup();
    const source = flowSource((_call, events) =>
      events.map((event) => ({
        status: 'invalid' as const,
        eventId: event.id,
        code: 'invalid-payload' as const,
        message: 'title: must not be blank: a title of only spaces names nothing',
      })),
    );
    const onCreated = renderFlow(source);
    await createTicketUnderParent(user);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Refused by the server: invalid-payload: title: must not be blank: a title of only spaces names nothing',
    );
    expect(onCreated).not.toHaveBeenCalled();
  });
});

/**
 * 13.592 (backlog/closed spec §1.3; §5.4's parent condition LIFTED 2026-09-23)
 * — `CreateTicketFlow.create` never leaves `start` off the `ticket.created`
 * payload it builds, whatever the draft's own value. The key assertion below is
 * `Object.keys(payload)`, not a value comparison: a mutated `create()` that
 * drops the `start:` line from its payload object literal produces a payload
 * with NO `start` key at all, and `toEqual`/`toBe` value checks treat a missing
 * key the same as one holding `undefined` — they would not catch that mutation.
 * Reading the key set is what does.
 *
 * Both cases used to reach `'focus'` through an in-focus PARENT. The parent no
 * longer has any bearing on the birth state, so the second case now turns the
 * dialog's own switch — which is the honest way to reach a value the draft is
 * supposed to be the source of.
 */
describe('13.592 CreateTicketFlow.create always sends `start` on ticket.created', () => {
  it('13.592a a create with no parent sends payload.start: "backlog", and the key is never omitted', async () => {
    const user = userEvent.setup();
    const source = createFakeDataSource({}, (events) => events.map((event) => committed(event.id)));
    const onCreated = renderFlow(source, { parentCandidates: [] });
    await user.click(screen.getByRole('button', { name: 'Create ticket' }));
    await user.type(screen.getByLabelText('Title'), 'Renew the trade licence');
    await user.click(within(screen.getByRole('dialog', { name: 'Create ticket' })).getByRole('button', { name: 'Create ticket' }));

    await waitFor(() => expect(source.ingested).toHaveLength(1));
    const payload = source.ingested[0]?.[0]?.payload as Record<string, unknown>;
    expect(payload.start).toBe('backlog');
    expect(Object.keys(payload)).toContain('start');
    // Spec 2026-09-22, and read the SAME way `start` is read one line up: the
    // key's PRESENCE is the assertion, because a `create()` that dropped the
    // `priority:` line from its payload literal would leave no key at all, and a
    // value comparison cannot tell that from one holding `undefined`. The wire's
    // absence-means-P2 rule exists for events written before the field; this
    // client was built after it, so leaving it out would be a choice.
    expect(payload.priority).toBe('P2');
    expect(Object.keys(payload)).toContain('priority');
    expect(onCreated).toHaveBeenCalled();
  });

  it('13.592b turning the birth-state switch OFF sends payload.start: "focus", through the flow', async () => {
    // ⚠ REWRITTEN 2026-09-23. This case read *"choosing an in-focus parent with
    // 'Start in focus' left checked sends payload.start: 'focus'"* — under spec
    // §5.4 the parent was what produced a focus birth, and the checkbox only
    // existed under an in-focus one. The owner lifted that condition, so the
    // PARENT no longer moves `start` at all and the control's ON position means
    // the opposite of what it did. What the case is for is unchanged and is why
    // it survives rather than being deleted: `CreateTicketFlow.create` must send
    // the DRAFT's value, never a constant, and the load-bearing assertion is
    // still the KEY SET — a `create()` that dropped the `start:` line produces a
    // payload with no such key, which a `toEqual`-style value check cannot tell
    // from one holding `undefined`.
    const user = userEvent.setup();
    const source = createFakeDataSource({}, (events) => events.map((event) => committed(event.id)));
    const onCreated = renderFlow(source, {
      parentCandidates: [{ id: PARENT, title: 'Registrations' }],
    });
    await user.click(screen.getByRole('button', { name: 'Create ticket' }));
    await user.type(screen.getByLabelText('Title'), 'Order the tent');
    // The picker must be OPENED first: it is the shared searchable `Select`, so
    // its options exist only while the panel is up and are portal-rendered into
    // a `listbox` on `document.body` — the idiom `createTicketUnderParent` above
    // records at length.
    await user.click(screen.getByLabelText('Parent'));
    await user.click(
      within(await screen.findByRole('listbox')).getByRole('option', { name: 'Registrations' }),
    );

    // The switch is ON by default (born in the backlog) — asserted before it is
    // flipped, so the case cannot pass against a control that was never ON and
    // therefore proves nothing about the direction of the value.
    const birthState = screen.getByRole('checkbox', { name: 'Starts in the backlog?' });
    expect(birthState).toBeChecked();
    await user.click(birthState);

    await user.click(within(screen.getByRole('dialog', { name: 'Create ticket' })).getByRole('button', { name: 'Create ticket' }));

    await waitFor(() => expect(source.ingested).toHaveLength(1));
    const payload = source.ingested[0]?.[0]?.payload as Record<string, unknown>;
    expect(payload.start).toBe('focus');
    expect(Object.keys(payload)).toContain('start');
    // The priority default is independent of the birth state: turning the switch
    // off moves `start`, and it must move nothing else.
    expect(payload.priority).toBe('P2');
    expect(onCreated).toHaveBeenCalled();
  });

  /**
   * 13.1236 — the flow sends the DRAFT's level, not a constant (spec 2026-09-22).
   *
   * The two cases above assert the DEFAULT, which a `create()` hard-coding
   * `priority: 'P2'` would satisfy perfectly. This one chooses a different level
   * through the dialog's own control and reads it back off the payload, so the
   * value is proved to travel from the draft rather than be minted at the door.
   */
  it('13.1236 choosing P1 in the dialog carries P1 all the way onto the payload — the value is the draft’s', async () => {
    const user = userEvent.setup();
    const source = createFakeDataSource({}, (events) => events.map((event) => committed(event.id)));
    const onCreated = renderFlow(source, { parentCandidates: [] });
    await user.click(screen.getByRole('button', { name: 'Create ticket' }));
    await user.type(screen.getByLabelText('Title'), 'Renew the trade licence');
    await user.click(
      within(screen.getByRole('tablist', { name: 'Priority' })).getByRole('tab', { name: 'P1' }),
    );
    await user.click(within(screen.getByRole('dialog', { name: 'Create ticket' })).getByRole('button', { name: 'Create ticket' }));

    await waitFor(() => expect(source.ingested).toHaveLength(1));
    const payload = source.ingested[0]?.[0]?.payload as Record<string, unknown>;
    expect(payload.priority).toBe('P1');
    expect(onCreated).toHaveBeenCalled();
  });
});

/**
 * 3.187 (V10) — THE LEDGER END OF THE SAME GUARD, which is the thing the
 * finding is actually about. The dialog's own case pins "onCreate is called once"; this
 * pins what that is FOR. `create-ticket-flow` mints
 * `entity: { kind: 'ticket', id: newUlid() }` PER CALL, so two presses are two
 * `ticket.created` events with two distinct ids — two tickets, in an append-only
 * ledger. Asserted on the source's own recorded ingest and on the envelope ID,
 * because "one call" and "one ticket" are different claims and only the second
 * one is the product's.
 */
describe('V10 two presses on Create file ONE ticket, not two', () => {
  it('PLANTED DEFECT: two clicks in one commit record ONE ticket.created', async () => {
    const user = userEvent.setup();
    const source = createFakeDataSource({}, (events) => events.map((event) => committed(event.id)));
    renderFlow(source, { parentCandidates: [] });
    await user.click(screen.getByRole('button', { name: 'Create ticket' }));
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Renew the trade licence' } });

    // Both clicks land in ONE React batch, which is the case a committed
    // `disabled` cannot guard — see the dialog's own case for the measurement
    // that pins the discrimination.
    const create = within(screen.getByRole('dialog', { name: 'Create ticket' })).getByRole('button', { name: 'Create ticket' });
    await act(async () => {
      create.click();
      create.click();
    });

    await waitFor(() => expect(source.ingested).toHaveLength(1));
    const created = source.ingested.flat().filter((event) => event.type === 'ticket.created');
    expect(created).toHaveLength(1);
    // One event, one entity id — the id is minted per call, so a duplicate would
    // be a second ULID and the ledger would hold two tickets nothing can merge.
    expect(created[0]!.entity.id).toEqual(expect.any(String));
    expect(source.ingested[0]).toHaveLength(1);
  });
});

/**
 * 13.593 · T13.5 (view half, Ruling 38b) — creating under a CLOSED terminal
 * parent. `flows/guarded-child-event.test.ts`'s 13.593a/b pin the unit-level
 * batching; this case is the same behaviour proven end to end through the
 * dialog, the offer, and the confirm click, over the fake `DataSource`'s own
 * recorded `ingested` calls — the same technique T13.4a already uses for the
 * merely-terminal (not closed) shape.
 */
describe('13.593 creating under a CLOSED terminal parent — the confirm submits reopened, then the transition, then the child', () => {
  it('13.593 confirming the offer submits ticket.reopened and the transition together, in ONE batch, ahead of the child — and all three commit', async () => {
    const user = userEvent.setup();
    const source = flowSource(
      (call, events) =>
        call === 1
          ? events.map((event) => parentTerminal(event.id))
          : events.map((event) => committed(event.id)),
      { getTicket: async () => CLOSED_PARENT_READ },
    );
    const onCreated = renderFlow(source, {
      parentCandidates: [{ id: PARENT, title: 'Registrations' }],
    });
    await createTicketUnderParent(user);

    const dialog = await screen.findByRole('dialog', { name: 'Reopen parent?' });
    expect(dialog).toHaveTextContent('Registrations is Done.');

    await user.click(screen.getByRole('button', { name: /Reopen to/ }));
    await user.click(within(await screen.findByRole('listbox')).getByRole('option', { name: 'Doing' }));
    await user.click(screen.getByRole('button', { name: 'Reopen and proceed' }));

    await waitFor(() => expect(source.ingested).toHaveLength(3));
    const [refusedCreate, parentBatch, childBatch] = source.ingested;
    const childTicketId = refusedCreate?.[0]?.entity.id;
    // ONE ingest call for the parent, carrying BOTH events, reopen first.
    expect(parentBatch).toHaveLength(2);
    expect(parentBatch?.[0]?.type).toBe('ticket.reopened');
    expect(parentBatch?.[0]?.entity).toEqual({ kind: 'ticket', id: PARENT });
    expect(parentBatch?.[0]?.payload).toEqual({});
    expect(parentBatch?.[1]?.type).toBe('ticket.transitioned');
    expect(parentBatch?.[1]?.entity).toEqual({ kind: 'ticket', id: PARENT });
    expect(parentBatch?.[1]?.payload).toEqual({
      to: 'doing',
      cause: { kind: 'reopened-for-child', childTicketId },
    });
    expect(childBatch?.[0]).toBe(refusedCreate?.[0]); // the same claim, retried after the remedy
    expect(onCreated).toHaveBeenCalledWith(childTicketId);
    expect(screen.queryByRole('dialog', { name: 'Reopen parent?' })).not.toBeInTheDocument();
  });
});

/**
 * 13.593e (Ruling 39, coordinator, fix round 1, 2026-09-17) — retrying with a
 * DIFFERENT target after a closed parent's reopen half already committed. The
 * server processes a batch per-event, never atomically
 * (`guarded-child-event.ts`'s docblock cites the real `IngestService`), so
 * `[reopened, transition→A]` can commit the reopen while refusing
 * transition→A — Finding 1's exact walk. Without Ruling 39, the retry to
 * target B would resend `ticket.reopened` against an already-open parent,
 * refused `not-closed`, masking whatever transition→B actually answers. This
 * proves the FIX end to end: the retry's own parent-batch `ingest` call
 * carries exactly ONE event, the transition — no `ticket.reopened` — because
 * `acceptReopen` flips `reopenPrompt.parentClosed` to `false` the moment it
 * learns the reopen half committed.
 *
 * Named `e` rather than reusing the coordinator's literal `13.593d`: that id
 * already covers this file's own advisor-follow-up case (the short-batch
 * `UnansweredClaimError` path in `guarded-child-event.test.ts`) — a different,
 * already-cited behaviour. Continuing the block's own lettering instead of
 * overwriting a live id, same reasoning as 13.591g below it.
 */
describe('13.593e retrying a different target after a closed parent\'s reopen half already committed', () => {
  it('13.593e the retry sends [transition] ALONE — the already-committed ticket.reopened is never resent', async () => {
    const user = userEvent.setup();
    const source = flowSource(
      (call, events) => {
        if (call === 1) return events.map((event) => parentTerminal(event.id));
        if (call === 2) {
          // First "Reopen and proceed": batch [reopened, transition→Doing].
          // The reopen COMMITS; the transition is refused by a rule on that
          // specific edge — reachable structurally (13.1f's own point) and
          // exactly Finding 1's walk.
          return events.map((event, index) =>
            index === 0
              ? committed(event.id)
              : refused(event.id, 'restrict-to', 'Only Anselma Marak may move this out of Done.'),
          );
        }
        // call 3 (the retry's parent batch) and call 4 (the child): commit.
        return events.map((event) => committed(event.id));
      },
      { getTicket: async () => CLOSED_PARENT_READ },
    );
    const onCreated = renderFlow(source, {
      parentCandidates: [{ id: PARENT, title: 'Registrations' }],
    });
    await createTicketUnderParent(user);

    await screen.findByRole('dialog', { name: 'Reopen parent?' });
    await user.click(screen.getByRole('button', { name: /Reopen to/ }));
    await user.click(within(await screen.findByRole('listbox')).getByRole('option', { name: 'Doing' }));
    await user.click(screen.getByRole('button', { name: 'Reopen and proceed' }));

    // First attempt refused (the transition, after the reopen committed) —
    // the offer stays on screen, exactly as T13.4b already proves for the
    // ordinary (not-closed-parent) shape.
    await waitFor(() => expect(source.ingested).toHaveLength(2));
    expect(screen.getByRole('dialog', { name: 'Reopen parent?' })).toBeInTheDocument();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Refused by the server: restrict-to: Only Anselma Marak may move this out of Done.',
    );

    // Pick a DIFFERENT target and retry, in the SAME dialog session.
    await user.click(screen.getByRole('button', { name: /Reopen to/ }));
    await user.click(within(await screen.findByRole('listbox')).getByRole('option', { name: 'To do' }));
    await user.click(screen.getByRole('button', { name: 'Reopen and proceed' }));

    await waitFor(() => expect(source.ingested).toHaveLength(4));
    const [refusedCreate, firstParentBatch, retryParentBatch, childBatch] = source.ingested;
    const childTicketId = refusedCreate?.[0]?.entity.id;
    // The FIRST attempt really did carry both events (the positive control
    // proving the second attempt's shape is a CHANGE, not what every attempt
    // always sends).
    expect(firstParentBatch).toHaveLength(2);
    expect(firstParentBatch?.[0]?.type).toBe('ticket.reopened');
    // The RETRY: exactly one event, and it is the transition, not the reopen.
    expect(retryParentBatch).toHaveLength(1);
    expect(retryParentBatch?.[0]?.type).toBe('ticket.transitioned');
    expect(retryParentBatch?.[0]?.entity).toEqual({ kind: 'ticket', id: PARENT });
    expect(retryParentBatch?.[0]?.payload).toEqual({
      to: 'todo',
      cause: { kind: 'reopened-for-child', childTicketId },
    });
    expect(childBatch?.[0]).toBe(refusedCreate?.[0]);
    expect(onCreated).toHaveBeenCalledWith(childTicketId);
    expect(screen.queryByRole('dialog', { name: 'Reopen parent?' })).not.toBeInTheDocument();
  });
});

/**
 * 13.593f (Ruling 50, final whole-branch review fix wave A, 2026-09-17,
 * Finding 3) — the OTHER order of failure from 13.593e's, reached the moment
 * Finding 1 lands: this time the batch's `ticket.reopened` HALF is the one
 * refused, at index 0, with `not-closed` — someone else reopened the parent a
 * second before the person confirmed. `reopenAndProceed` reports
 * `parentReopened: false` for an index-0 refusal (13.593b already pins that;
 * the reopen never committed, so there is nothing to report as reopened), so
 * the fix for 13.593e's own case does not fire here on its own condition.
 * Without Ruling 50, `acceptReopen` would leave `reopenPrompt.parentClosed`
 * at `true`, and picking a different target would rebuild
 * `[ticket.reopened, transition]` again — resending a reopen against a parent
 * the server just said is NOT closed, refused `not-closed` a second time, and
 * masking whatever the new transition would have answered: Ruling 39's exact
 * masking, reached from the other side. The fix reads the SAME fact off a
 * different sentence: `outcome.refusal.rule === REFUSAL_RULES.notClosed` is
 * the server saying "this parent is already open" exactly as `parentReopened`
 * does, so `acceptReopen` flips `parentClosed` to `false` on that condition
 * too, and the retry's batch is `[transition]` alone — proven below.
 */
describe('13.593f a not-closed refusal of the reopen itself also unsticks the retry', () => {
  it('13.593f the retry sends [transition] ALONE after the reopen itself was refused not-closed', async () => {
    const user = userEvent.setup();
    const source = flowSource(
      (call, events) => {
        if (call === 1) return events.map((event) => parentTerminal(event.id));
        if (call === 2) {
          // First "Reopen and proceed": batch [reopened, transition→Doing].
          // The REOPEN ITSELF is refused `not-closed` — the mirror of
          // 13.593e, which refused the transition half instead.
          return events.map((event, index) =>
            index === 0
              ? refused(event.id, 'not-closed', 'This ticket is not closed.')
              : committed(event.id),
          );
        }
        // call 3 (the retry's parent batch) and call 4 (the child): commit.
        return events.map((event) => committed(event.id));
      },
      { getTicket: async () => CLOSED_PARENT_READ },
    );
    const onCreated = renderFlow(source, {
      parentCandidates: [{ id: PARENT, title: 'Registrations' }],
    });
    await createTicketUnderParent(user);

    await screen.findByRole('dialog', { name: 'Reopen parent?' });
    await user.click(screen.getByRole('button', { name: /Reopen to/ }));
    await user.click(within(await screen.findByRole('listbox')).getByRole('option', { name: 'Doing' }));
    await user.click(screen.getByRole('button', { name: 'Reopen and proceed' }));

    // Refused at index 0 (the reopen) — the offer stays on screen, same as
    // 13.593e's index-1 refusal.
    await waitFor(() => expect(source.ingested).toHaveLength(2));
    expect(screen.getByRole('dialog', { name: 'Reopen parent?' })).toBeInTheDocument();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Refused by the server: not-closed: This ticket is not closed.',
    );

    // Pick a DIFFERENT target and retry, in the SAME dialog session.
    await user.click(screen.getByRole('button', { name: /Reopen to/ }));
    await user.click(within(await screen.findByRole('listbox')).getByRole('option', { name: 'To do' }));
    await user.click(screen.getByRole('button', { name: 'Reopen and proceed' }));

    await waitFor(() => expect(source.ingested).toHaveLength(4));
    const [refusedCreate, firstParentBatch, retryParentBatch, childBatch] = source.ingested;
    const childTicketId = refusedCreate?.[0]?.entity.id;
    // The FIRST attempt really did carry both events (the positive control).
    expect(firstParentBatch).toHaveLength(2);
    expect(firstParentBatch?.[0]?.type).toBe('ticket.reopened');
    // The RETRY: exactly one event, the transition — no `ticket.reopened`.
    expect(retryParentBatch).toHaveLength(1);
    expect(retryParentBatch?.[0]?.type).toBe('ticket.transitioned');
    expect(retryParentBatch?.[0]?.entity).toEqual({ kind: 'ticket', id: PARENT });
    expect(retryParentBatch?.[0]?.payload).toEqual({
      to: 'todo',
      cause: { kind: 'reopened-for-child', childTicketId },
    });
    expect(childBatch?.[0]).toBe(refusedCreate?.[0]);
    expect(onCreated).toHaveBeenCalledWith(childTicketId);
    expect(screen.queryByRole('dialog', { name: 'Reopen parent?' })).not.toBeInTheDocument();
  });
});

/**
 * **RULING P43: a literal ALONGSIDE the import, never instead.** The literals above
 * are the pins; the case below is what makes them pins rather than decoration.
 *
 * The shape matters and this branch got it wrong once. Replacing a literal WITH the
 * builder call reads as an improvement and is not: the fixture then feeds the
 * builder's output to a fake and reads it back, so a reword moves both sides
 * together and every test here stays green. Measured, not argued — the first draft
 * of this change did exactly that and its excluding mutation came back SERVER RED /
 * CLIENT GREEN, which is the condition P43 named as the failure.
 *
 * With the literal kept and pinned, the same mutation reddens BOTH halves, each at
 * its own sentence: the witness (7.238/7.240, over a real round trip) and this case.
 * That is the acceptance test the ruling wrote, and it is the only reason the
 * import is worth having here at all.
 */
describe('7.249 the fixture sentences are pinned to the producer they claim', () => {
  it('7.249d SERVER_PARENT_TERMINAL_REASON is byte-identical to the engine\'s ADD arm', () => {
    expect(SERVER_PARENT_TERMINAL_REASON).toBe(parentTerminalRefusal('Registrations', 'Done', 'add'));
  });

  // 7.251 — the rank reason in this file was a fabrication (test-cases/07); the pin below is that case's citation.
  it('7.249e the rank reason is byte-identical to rankRefusal("Task", "Sub-task")', () => {
    expect(RANK_REASON).toBe(rankRefusal('Task', 'Sub-task'));
  });
});

/**
 * 3.192 (E2-34) — TWO `aria-modal="true"` DIALOGS WERE OPEN AT ONCE.
 *
 * The `needs-reopen` arm opened the reopen offer WITHOUT closing the New-ticket
 * dialog (`create-ticket-flow.tsx` returned early with `dialogOpen` untouched),
 * and both surfaces render from the same fragment — so the DOM held two modal
 * dialogs, and a screen reader told the person the top one was the only modal on
 * the page. ONE MODAL AT A TIME is the invariant the primitive assumes.
 *
 * E5-20 (case 3.189) closed the other half of the same stack — one Escape no
 * longer closes both — but it does not make a second `aria-modal` element
 * honest.
 */
describe('E2-34 the reopen offer is the ONLY modal on screen', () => {
  it('PLANTED DEFECT: the offer replaces the New-ticket dialog rather than stacking on it', async () => {
    const user = userEvent.setup();
    const source = flowSource((call, events) =>
      call === 1
        ? events.map((event) => parentTerminal(event.id))
        : events.map((event) => committed(event.id)),
    );
    renderFlow(source);
    // The parent must be CHOSEN: the offer is opened for a draft whose
    // `parentId` is a real ticket (the arm checks `draft.parentId !== null`).
    await createTicketUnderParent(user);

    // The offer is up — and it is the only modal.
    expect(await screen.findByRole('dialog', { name: 'Reopen parent?' })).toBeInTheDocument();
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(screen.queryByRole('dialog', { name: 'Create ticket' })).toBeNull();
  });
});

/**
 * 3.191 (E2-33b) — THE SAME ONCE-SEEDED CHOICE, AND HERE THE SCREEN LIES ABOUT IT.
 *
 * `ReopenDialog` seeds `toStateId` from `reopenStates[0]` once (`useState`) and
 * guards its confirm on `toStateId === ''` — an emptiness test, not membership in
 * the list being offered. `reopenStates` is set per ATTEMPT
 * (`create-ticket-flow.tsx`), so a rerender can hand the mounted dialog a list
 * that no longer holds the standing id. This `Select` is the NON-searchable
 * variant, whose trigger renders `selected ? selected.label : placeholder` — so
 * the button then reads `Select…` ("nothing chosen") while `toStateId` is
 * non-empty and the confirm is ENABLED: the screen and the payload disagree in
 * the one direction this product refuses by name.
 *
 * (The searchable variant does not show the placeholder — react-aria's combo
 * keeps its input text — which is why (a)'s person-visible arm was withdrawn by
 * its own author and this one was not.)
 */
describe('E2-33b the offer re-seeds when the states it offers change under it', () => {
  const base = {
    open: true,
    parentTitle: 'Registrations',
    parentStateName: 'Done',
    refusal: { rule: 'hierarchy.parent-terminal', reason: 'Registrations is Done.' },
    refusalOrigin: 'server' as const,
    parentRefusal: null,
    onCancel: vi.fn(),
  };
  const trigger = (): HTMLElement => screen.getByRole('button', { name: /Reopen to/ });

  it('PLANTED DEFECT: a swap cannot leave the payload carrying a state the picker no longer offers', () => {
    const onAccept = vi.fn();
    const { rerender } = render(
      <ReopenDialog {...base} reopenStates={[{ id: 'todo', name: 'To do' }]} onAccept={onAccept} />,
    );
    expect(trigger().textContent).toContain('To do');

    // The attempt is replaced: the standing id is not in the new list.
    rerender(
      <ReopenDialog
        {...base}
        reopenStates={[
          { id: 'doing', name: 'In progress' },
          { id: 'waiting', name: 'Waiting on counterparty' },
        ]}
        onAccept={onAccept}
      />,
    );

    // The control OFFERS `In progress` and paints it — it no longer says
    // "nothing chosen" while carrying `todo`.
    expect(trigger().textContent).toContain('In progress');
    expect(trigger().textContent).not.toContain('Select…');

    // …and what travels is what is shown.
    fireEvent.click(screen.getByRole('button', { name: 'Reopen and proceed' }));
    expect(onAccept).toHaveBeenCalledWith('doing');
  });

  it('a re-seed never overwrites a destination the picker still offers', () => {
    const onAccept = vi.fn();
    const { rerender } = render(
      <ReopenDialog {...base} reopenStates={[{ id: 'todo', name: 'To do' }]} onAccept={onAccept} />,
    );
    expect(trigger().textContent).toContain('To do');
    rerender(
      <ReopenDialog
        {...base}
        reopenStates={[
          { id: 'todo', name: 'To do' },
          { id: 'doing', name: 'In progress' },
        ]}
        onAccept={onAccept}
      />,
    );
    expect(trigger().textContent).toContain('To do');
    fireEvent.click(screen.getByRole('button', { name: 'Reopen and proceed' }));
    expect(onAccept).toHaveBeenCalledWith('todo');
  });
});
