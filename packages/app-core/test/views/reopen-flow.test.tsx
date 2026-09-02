import { render, screen, waitFor, within } from '@testing-library/react';
// Named import, not the default: `@testing-library/user-event` ships no default
// export that survives `verbatimModuleSyntax`, settled at
// packages/ui/test/components.test.tsx and repeated by board.test.tsx and
// ticket-list.test.tsx. The plan's Task 13 snippet carries the default spelling.
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { IngestResult, SubmittedEvent, WorkflowDef } from '@gisik-nokma/domain';
import { createClientStateCache } from '../../src/cache.js';
import { SERVING_GAPS, ServingGapError } from '../../src/online/mappers.js';
import { CreateTicketFlow } from '../../src/views/create-ticket-flow.js';
import type { TicketRead } from '../../src/view-types.js';
import { createFakeDataSource, type FakeDataSource } from '../helpers/fake-data-source.js';
import { PARENT, WF_ERRAND, WS, claim, ticketStateSeed } from '../helpers/seed.js';

const SERVER_PARENT_TERMINAL_REASON =
  'Parent "Registrations" is Done; it must reopen because it is acquiring live work.';

/** What the pre-check writes when it refuses off cached state (`precheck.ts`'s own words). */
const INSTANT_PARENT_TERMINAL_REASON =
  '"Registrations" is in a terminal state; it must reopen because it is acquiring live work.';

function parentState(overrides: { stateId: string; stateCategory: 'terminal' | 'active' }) {
  return ticketStateSeed({
    id: PARENT,
    parentId: null,
    workflowId: 'wf-errand',
    workflowVersion: 1,
    stateId: overrides.stateId,
    stateCategory: overrides.stateCategory,
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
  parent: null,
  rollup: null,
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
  await user.click(screen.getByRole('button', { name: 'New ticket' }));
  await user.type(screen.getByLabelText('Title'), 'Renew the trade licence');
  await user.selectOptions(screen.getByLabelText('Parent'), PARENT);
  await user.click(screen.getByRole('button', { name: 'Create' }));
}

function renderFlow(
  source: FakeDataSource,
  extra: { cache?: ReturnType<typeof createClientStateCache> } = {},
): ReturnType<typeof vi.fn> {
  const onCreated = vi.fn();
  render(
    <CreateTicketFlow
      dataSource={source}
      cache={extra.cache}
      workspaceId={WS}
      projectId="01J9GPRJ000000000000000000"
      currentUserId="user_kiro"
      typeOptions={[{ id: 'task', name: 'Task' }]}
      parentCandidates={[{ id: PARENT, title: 'Registrations' }]}
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
    expect(dialog).toHaveTextContent(`Refused by the server — hierarchy.parent-terminal: ${SERVER_PARENT_TERMINAL_REASON}`);

    // The picker offers only structurally reachable non-terminal states.
    const picker = screen.getByLabelText('Reopen to');
    const optionValues = [...picker.querySelectorAll('option')].map((option) =>
      option.getAttribute('value'),
    );
    expect(optionValues.sort()).toEqual(['doing', 'todo']);

    await user.selectOptions(picker, 'doing');
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
    await user.selectOptions(screen.getByLabelText('Reopen to'), 'doing');
    await user.click(screen.getByRole('button', { name: 'Reopen and proceed' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Refused by the server — restrict-to: Only Anselma Marak may move this out of Done.',
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
        refused(event.id, 'hierarchy.rank', 'A task cannot sit under a sub-task.'),
      );
    });
    const onCreated = renderFlow(source);
    await createTicketUnderParent(user);
    await screen.findByRole('dialog', { name: 'Reopen parent?' });
    await user.selectOptions(screen.getByLabelText('Reopen to'), 'doing');
    await user.click(screen.getByRole('button', { name: 'Reopen and proceed' }));

    const alertBox = await screen.findByRole('alert');
    expect(alertBox).toHaveTextContent('Registrations was reopened — that is now recorded history.');
    expect(alertBox).toHaveTextContent(
      'Refused by the server — hierarchy.rank: A task cannot sit under a sub-task.',
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
      'Refused by the server — restrict-to: Only Anselma Marak may put work in this project.',
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
      `instant check — hierarchy.parent-terminal: ${INSTANT_PARENT_TERMINAL_REASON}`,
    );
    expect(dialog).not.toHaveTextContent('Refused by the server');
    // The whole point: the offer arrived with NO round trip behind it.
    expect(source.ingested).toEqual([]);

    // Accepting it submits the parent first and then the child, exactly as the
    // server-refused path does — the instant route is a shortcut to the offer,
    // never a shortcut past the two claims.
    await user.selectOptions(screen.getByLabelText('Reopen to'), 'doing');
    await user.click(screen.getByRole('button', { name: 'Reopen and proceed' }));
    await waitFor(() => expect(source.ingested).toHaveLength(2));
    expect(source.ingested[0]?.[0]?.type).toBe('ticket.transitioned');
    expect(source.ingested[1]?.[0]?.type).toBe('ticket.created');
  });

  it('3.80 · T13.4h when the parent read REFUSES, the offer is not built and the refusal still renders verbatim', async () => {
    const user = userEvent.setup();
    // The REAL `ServingGapError` carrying the REAL register entries, the shape
    // 3.75 established: a hand-written Error would keep passing on the day the
    // gap closes, which is the one day this case must change.
    const source = flowSource((_call, events) => events.map((event) => parentTerminal(event.id)), {
      getTicket: async () => {
        throw new ServingGapError('getTicket', SERVING_GAPS['getTicket'] ?? []);
      },
    });
    const onCreated = renderFlow(source);
    await createTicketUnderParent(user);

    const alertBox = await screen.findByRole('alert');
    expect(alertBox).toHaveTextContent(
      `Refused by the server — hierarchy.parent-terminal: ${SERVER_PARENT_TERMINAL_REASON}`,
    );
    // The gap names its own first absence, read off the register at run time.
    expect(alertBox).toHaveTextContent('response mapping failed at getTicket');
    expect(alertBox).toHaveTextContent(SERVING_GAPS['getTicket']?.[0]?.field ?? '__unset__');
    expect(screen.queryByRole('dialog', { name: 'Reopen parent?' })).not.toBeInTheDocument();
    // No invented offer, and no silent retry of the refused claim.
    expect(source.ingested).toHaveLength(1);
    expect(onCreated).not.toHaveBeenCalled();
  });

  it('3.80 · T13.4h-control the register really does carry getTicket absences, so T13.4h is a measurement', () => {
    expect((SERVING_GAPS['getTicket'] ?? []).length).toBeGreaterThan(0);
    expect(SERVING_GAPS['getTicket']?.[0]?.field).toBeTruthy();
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
        message: 'title: must not be blank — a title of only spaces names nothing',
      })),
    );
    const onCreated = renderFlow(source);
    await createTicketUnderParent(user);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Refused by the server — invalid-payload: title: must not be blank — a title of only spaces names nothing',
    );
    expect(onCreated).not.toHaveBeenCalled();
  });
});
