import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { IngestResult, SubmittedEvent } from '@gisik-nokma/domain';
import { CreateTicketFlow } from '../../src/views/create-ticket-flow.js';
import type { PendingCreate } from '../../src/views/board-move-state.js';
import { createFakeDataSource } from '../helpers/fake-data-source.js';
import { WS } from '../helpers/seed.js';

/**
 * The create flow hands the dialog's draft back when the write is not accepted (smoothness T7, spec S5; audit
 * SM-03; owner D2) — case 25.100. The ghost card's own render is `board-ghost-create.test.tsx` (25.094).
 */

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

const STATES = { initialStateId: 'todo', states: [{ id: 'todo', name: 'To do', category: 'open', creatable: true }] };

function deferred() {
  let resolve!: (results: IngestResult[]) => void;
  const promise = new Promise<IngestResult[]>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function mount(options: { states?: typeof STATES | null } = {}) {
  const writes: Array<ReturnType<typeof deferred>> = [];
  const sent: SubmittedEvent[] = [];
  const source = createFakeDataSource({}, (events) => {
    sent.push(...events);
    const write = deferred();
    writes.push(write);
    return write.promise;
  });
  const onPending = vi.fn<(create: PendingCreate) => void>();
  const onRefused = vi.fn<(ticketId: string) => void>();
  const onCreated = vi.fn<(ticketId: string) => void>();
  render(
    <CreateTicketFlow
      dataSource={source}
      workspaceId={WS}
      projectId="01J9GPRJ000000000000000000"
      currentUserId="user_kiro"
      typeOptions={[{ id: 'task', name: 'Task', rank: 3, workflowId: 'wf-errand' }]}
      workflowStates={() => (options.states === undefined ? STATES : options.states)}
      parentCandidates={[]}
      assigneeCandidates={[]}
      onCreated={onCreated}
      onPending={onPending}
      onRefused={onRefused}
    />,
  );
  return { writes, sent, onPending, onRefused, onCreated };
}

const dialog = () => screen.queryByRole('dialog', { name: 'Create ticket' });

async function fillAndCreate(title: string, { inBacklog = false }: { inBacklog?: boolean } = {}) {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Create ticket' }));
  fireEvent.change(screen.getByLabelText('Title'), { target: { value: title } });
  // The dialog starts in the Backlog, which the board does not draw; a ghost is for a ticket that lands on the board.
  if (!inBacklog) await user.click(screen.getByLabelText('Starts in the backlog?'));
  fireEvent.click(within(screen.getByRole('dialog', { name: 'Create ticket' })).getByRole('button', { name: 'Create ticket' }));
}

const refusedAnswer: IngestResult[] = [{ status: 'refused', eventId: 'e', rule: 'title-taken', reason: 'A ticket with that title exists.' } as IngestResult];

describe('25.100 the create flow takes its draft back', () => {
  it('25.100 Create closes the dialog at once and puts a ghost on the board carrying the draft\'s own ticket id, workflow, state and title', async () => {
    const { writes, sent, onPending, onCreated } = mount();
    await fillAndCreate('Buy milk');
    await waitFor(() => expect(writes).toHaveLength(1));
    await waitFor(() => expect(dialog()).toBeNull());
    expect(onPending).toHaveBeenCalledTimes(1);
    const ghost = onPending.mock.calls[0]![0];
    expect(ghost).toMatchObject({ workflowId: 'wf-errand', stateId: 'todo', title: 'Buy milk', typeId: 'task' });
    // The ghost is the same ticket the wire carries — so the real card replaces it.
    expect(ghost.ticketId).toBe(sent[0]!.entity.id);
    expect(onCreated).not.toHaveBeenCalled();
  });

  it('25.100 a commit calls onCreated with the id and leaves the dialog closed; nothing is taken back', async () => {
    const { writes, sent, onRefused, onCreated } = mount();
    await fillAndCreate('Buy milk');
    await waitFor(() => expect(writes).toHaveLength(1));
    writes[0]!.resolve([{ status: 'committed', eventId: sent[0]!.id, seq: 4, serverTime: '2026-10-02T09:00:00.000Z' } as IngestResult]);
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(sent[0]!.entity.id));
    expect(onRefused).not.toHaveBeenCalled();
    await waitFor(() => expect(dialog()).toBeNull());
  });

  it('25.100 a refusal takes the ghost back and reopens the dialog with the same draft and the same ticket id', async () => {
    const { writes, sent, onRefused, onCreated } = mount();
    await fillAndCreate('Buy milk');
    await waitFor(() => expect(writes).toHaveLength(1));
    const firstId = sent[0]!.entity.id;
    writes[0]!.resolve(refusedAnswer);
    await waitFor(() => expect(onRefused).toHaveBeenCalledWith(firstId));
    // The dialog is back, with the person's words, and says why.
    await waitFor(() => expect(dialog()).not.toBeNull());
    expect(screen.getByLabelText('Title')).toHaveValue('Buy milk');
    expect(await screen.findByText(/A ticket with that title exists\./)).toBeInTheDocument();
    expect(onCreated).not.toHaveBeenCalled();
    // Sending it again is the SAME ticket (a retry must not mint a second one).
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Create ticket' })).getByRole('button', { name: 'Create ticket' }));
    await waitFor(() => expect(sent).toHaveLength(2));
    expect(sent[1]!.entity.id).toBe(firstId);
  });

  it('25.100 Cancel on the reopened dialog then a fresh Create starts EMPTY (the draft is handed back once, not kept)', async () => {
    const { writes, onRefused } = mount();
    await fillAndCreate('Buy milk');
    await waitFor(() => expect(writes).toHaveLength(1));
    writes[0]!.resolve(refusedAnswer);
    await waitFor(() => expect(onRefused).toHaveBeenCalled());
    await waitFor(() => expect(dialog()).not.toBeNull());
    await userEvent.setup().click(within(screen.getByRole('dialog', { name: 'Create ticket' })).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(dialog()).toBeNull());
    await userEvent.setup().click(screen.getByRole('button', { name: 'Create ticket' }));
    expect(screen.getByLabelText('Title')).toHaveValue('');
  });

  it('25.100 a throw from the door also takes the ghost back and reopens the dialog', async () => {
    const { writes, onRefused } = mount();
    await fillAndCreate('Buy milk');
    await waitFor(() => expect(writes).toHaveLength(1));
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    // The answer the flow cannot read at all.
    writes[0]!.resolve([]);
    await waitFor(() => expect(onRefused).toHaveBeenCalled());
    await waitFor(() => expect(dialog()).not.toBeNull());
    expect(screen.getByLabelText('Title')).toHaveValue('Buy milk');
    quiet.mockRestore();
  });

  it('25.100 control: a ticket born in the Backlog (the dialog\'s default) is not on the board, so it has no ghost and the dialog waits for the answer', async () => {
    const { writes, onPending } = mount();
    await fillAndCreate('Buy milk', { inBacklog: true });
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(onPending).not.toHaveBeenCalled();
    expect(dialog()).not.toBeNull();
  });

  it('25.100 control: with no resolvable state there is no ghost — the dialog stays and nothing is taken back', async () => {
    const { writes, onPending, onRefused } = mount({ states: null });
    await fillAndCreate('Buy milk');
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(onPending).not.toHaveBeenCalled();
    expect(dialog()).not.toBeNull();
    writes[0]!.resolve(refusedAnswer);
    expect(await screen.findByText(/A ticket with that title exists\./)).toBeInTheDocument();
    expect(onRefused).not.toHaveBeenCalled();
  });
});
