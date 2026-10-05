import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SubmittedEvent } from '@gisik-nokma/domain';
import { CreateTicketFlow } from '../../src/views/create-ticket-flow.js';
import { resetPendingDrafts } from '../../src/views/draft-optimism.js';
import type { NewTicketDraft } from '../../src/views/new-ticket-dialog.js';
import { createFakeDataSource, type FakeDataSource } from '../helpers/fake-data-source.js';
import { WS } from '../helpers/seed.js';

/**
 * Case 28.155, the DIRECT half (drafts T8, decision 6): the dialog is bypassed by a stub, so the flow receives a
 * draft that says `focus` and carries a `stateId` (a future caller, an old restore), and the forcing is proved to be
 * the FLOW's. The stub renders one `drive` button that hands `onCreate` whatever the case put in `nextDraft`.
 */
let nextDraft: NewTicketDraft | null = null;
vi.mock('../../src/views/new-ticket-dialog.js', () => ({
  NewTicketDialog: (props: { onCreate: (draft: NewTicketDraft) => void }) => (
    <button type="button" onClick={() => { if (nextDraft !== null) props.onCreate(nextDraft); }}>drive</button>
  ),
}));

const committed = { status: 'committed', eventId: 'e', seq: 1, serverTime: '2026-10-03T09:00:00.000Z' } as const;
afterEach(() => {
  cleanup();
  resetPendingDrafts();
  nextDraft = null;
});

function mountDirect(source: FakeDataSource) {
  const calls = { saved: vi.fn(), created: vi.fn(), pending: vi.fn(), refused: vi.fn() };
  render(
    <CreateTicketFlow dataSource={source} workspaceId={WS} projectId="01J9GPRJ000000000000000000" currentUserId="user_kiro"
      typeOptions={[{ id: 'task', name: 'Task', rank: 3, workflowId: 'wf-errand' }]}
      // `wf-errand` resolves, so a `focus` create HAS a ghost state: the control below can draw a ghost.
      workflowStates={(id) => (id === 'wf-errand' ? { initialStateId: 'todo', states: [] } : null)}
      parentCandidates={[]} assigneeCandidates={[]}
      onCreated={calls.created} onDraftSaved={calls.saved} onPending={calls.pending} onRefused={calls.refused} />,
  );
  let n = 0;
  const createDraftDirect = async (overrides: Partial<NewTicketDraft>): Promise<void> => {
    n += 1;
    nextDraft = {
      ticketId: `01J9GTKA00000000000000000${String(n)}`, title: 'T', typeId: 'task', parentId: null, assigneeId: null,
      start: 'backlog', priority: 'P2', ...overrides,
    } as NewTicketDraft;
    await userEvent.setup().click(screen.getByRole('button', { name: 'drive' }));
  };
  return { createDraftDirect, calls };
}
function ticketCreatedPayload(source: FakeDataSource, index = 0): Record<string, unknown> {
  const event = source.ingested[index]?.[0] as SubmittedEvent | undefined;
  if (event === undefined || event.type !== 'ticket.created') throw new Error(`no ticket.created at ${String(index)}`);
  return event.payload as Record<string, unknown>;
}

describe('28.155 the flow forces the draft shape (direct)', () => {
  it('28.155 the forcing is the flow, whatever the dialog sent; control: the same draft without draft keeps focus, its stateId and a ghost', async () => {
    const source = createFakeDataSource({}, (events) => events.map(() => committed));
    const { createDraftDirect, calls } = mountDirect(source);
    await createDraftDirect({ draft: true, start: 'focus', stateId: 'doing' });
    await waitFor(() => expect(source.ingested).toHaveLength(1));
    expect(ticketCreatedPayload(source)).toMatchObject({ draft: true, start: 'backlog' });
    expect(ticketCreatedPayload(source)).not.toHaveProperty('stateId');
    // No board ghost for a draft. Only THIS draft can reach the ghost arm (a dialog-made draft is already
    // `start: 'backlog'`, which has no ghost state), so the `!isDraft` guard is pinned here and nowhere else.
    expect(calls.pending).not.toHaveBeenCalled();
    await createDraftDirect({ start: 'focus', stateId: 'doing' });
    await waitFor(() => expect(source.ingested).toHaveLength(2));
    expect(ticketCreatedPayload(source, 1)).toMatchObject({ start: 'focus', stateId: 'doing' });
    expect(ticketCreatedPayload(source, 1)).not.toHaveProperty('draft');
    expect(calls.pending).toHaveBeenCalledTimes(1); // CONTROL: the same draft without `draft` does put a ghost on the board
  });
  it('28.155 an outsider assignee on a draft sends nothing and says why; control: the same outsider on a ticket goes to the server', async () => {
    const source = createFakeDataSource({}, (events) => events.map(() => committed));
    const { createDraftDirect } = mountDirect(source);
    await createDraftDirect({ draft: true, assigneeId: 'u_out', assigneeIsOutsider: true });
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe('instant check: draft.no-outsiders: Publish the ticket before inviting someone from outside');
    expect(source.ingested).toHaveLength(0);
    await createDraftDirect({ assigneeId: 'u_out', assigneeIsOutsider: true });
    await waitFor(() => expect(source.ingested).toHaveLength(1));
  });
});
