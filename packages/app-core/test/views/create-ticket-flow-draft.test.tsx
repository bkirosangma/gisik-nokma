import { act, cleanup, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SubmittedEvent } from '@gisik-nokma/domain';
import { OfflineAcceptError } from '../../src/replica/replica-data-source.js';
import { CreateTicketFlow } from '../../src/views/create-ticket-flow.js';
import { DraftSavedToast } from '../../src/views/draft-saved-toast.js';
import { addPendingDraft, mergeDrafts, pendingDraftsOf, removePendingDraft, resetPendingDrafts, useMyDrafts } from '../../src/views/draft-optimism.js';
import type { DraftRow } from '../../src/view-types.js';
import { createFakeDataSource, type FakeDataSource } from '../helpers/fake-data-source.js';
import { WS } from '../helpers/seed.js';

/** Cases 28.155-28.158 (drafts T8), through the REAL dialog. The forcing of a dialog-bypassing draft is the sibling file. */
const committed = { status: 'committed', eventId: 'e', seq: 1, serverTime: '2026-10-03T09:00:00.000Z' } as const;
const TYPES = [{ id: 'task', name: 'Task', rank: 3, workflowId: 'wf-errand' }];
afterEach(() => {
  cleanup();
  resetPendingDrafts();
  window.localStorage.clear();
});

function mount(source: FakeDataSource, extra: Partial<ComponentProps<typeof CreateTicketFlow>> = {}) {
  const calls = { saved: vi.fn(), created: vi.fn(), pending: vi.fn(), refused: vi.fn() };
  render(
    <CreateTicketFlow dataSource={source} workspaceId={WS} projectId="01J9GPRJ000000000000000000" currentUserId="user_kiro"
      typeOptions={TYPES} workflowStates={() => null} parentCandidates={[]} assigneeCandidates={[]}
      onCreated={calls.created} onDraftSaved={calls.saved} onPending={calls.pending} onRefused={calls.refused} {...extra} />,
  );
  return calls;
}
async function saveDraft(title = 'Pave the lane'): Promise<void> {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Create ticket' }));
  fireEvent.change(screen.getByLabelText('Title'), { target: { value: title } });
  await user.click(within(screen.getByRole('dialog', { name: 'Create ticket' })).getByRole('button', { name: 'Save as draft' }));
}
function ticketCreatedPayload(source: FakeDataSource, index = 0): Record<string, unknown> {
  const event = source.ingested[index]?.[0] as SubmittedEvent | undefined;
  if (event === undefined || event.type !== 'ticket.created') {
    throw new Error(`expected a ticket.created event at ${String(index)}, got ${JSON.stringify(source.ingested)}`);
  }
  return event.payload as Record<string, unknown>;
}

describe('28.155 the flow forces the draft shape', () => {
  it('28.155 draft: true, backlog, the typed fields unchanged', async () => {
    const source = createFakeDataSource({}, (events) => events.map(() => committed));
    mount(source);
    await saveDraft();
    expect(ticketCreatedPayload(source)).toMatchObject({ draft: true, start: 'backlog', title: 'Pave the lane', typeId: 'task', priority: 'P2' });
    // (No `stateId` leg here: `workflowStates` is `() => null`, so the dialog never sends one, draft or not. The
    // direct case, `create-ticket-flow-draft-direct.test.tsx`, owns the stateId forcing.)
  });
});

describe('28.156 a saved draft', () => {
  it('28.156 calls onDraftSaved, not onCreated or onPending, closes the dialog, and the row is pending BEFORE the answer', async () => {
    let answer!: (r: unknown[]) => void;
    const source = createFakeDataSource({}, () => new Promise((resolve) => { answer = resolve as never; }));
    const calls = mount(source);
    await saveDraft();
    expect(pendingDraftsOf(WS).map((d) => d.title)).toEqual(['Pave the lane']);
    expect(pendingDraftsOf(WS)[0]).toMatchObject({ pending: true, attachmentCount: 0, parentId: null, projectId: '01J9GPRJ000000000000000000', typeId: 'task' });
    expect(calls.saved).not.toHaveBeenCalled();
    await act(async () => { answer([committed]); });
    expect(calls.saved).toHaveBeenCalledTimes(1);
    expect(calls.saved).toHaveBeenCalledWith(source.ingested[0]![0]!.entity.id);
    expect(calls.created).not.toHaveBeenCalled();
    expect(calls.pending).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog', { name: 'Create ticket' })).toBeNull();
    expect(pendingDraftsOf(WS)).toHaveLength(1); // a commit keeps the row: `useMyDrafts` prunes it once the list names it
  });
  it('28.156 DraftSavedToast says Draft saved and Open opens that ticket', async () => {
    const onOpen = vi.fn();
    const onDismiss = vi.fn();
    render(<DraftSavedToast ticketId="t1" onOpen={onOpen} onDismiss={onDismiss} />);
    expect(screen.getByText('Draft saved')).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Open' }));
    expect(onOpen).toHaveBeenCalledWith('t1');
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
  it('28.156 the pending row leads the list until the server lists it, then it is pruned (mergeDrafts, useMyDrafts)', async () => {
    // Decision 5's store: the plan's Step 9 mutations on `mergeDrafts`' `known` filter and on the prune effect have
    // their kill here (28.162 renders `DraftsList` from a prop and never reads this store).
    const mine: DraftRow = { ticketId: 'p1', projectId: 'prj', projectName: null, typeId: 'task', title: 'Saving', parentId: null,
      updatedAt: '2026-10-03T09:00:00.000Z', attachmentCount: 0, pending: true };
    const listed: DraftRow = { ...mine, ticketId: 's1', title: 'Listed', pending: false };
    const other: DraftRow = { ...mine, ticketId: 'p2', title: 'Also saving' };
    expect(mergeDrafts(null, [mine])).toBeNull();
    expect(mergeDrafts([listed], [mine, other])!.map((d) => d.ticketId)).toEqual(['p1', 'p2', 's1']);
    expect(mergeDrafts([{ ...mine, pending: false }], [mine])).toEqual([{ ...mine, pending: false }]); // the server's copy wins: no duplicate
    addPendingDraft(WS, other);
    addPendingDraft(WS, mine);
    expect(pendingDraftsOf(WS).map((d) => d.ticketId)).toEqual(['p1', 'p2']); // the newest first
    const source = createFakeDataSource({ getMyDrafts: async () => [{ ...mine, pending: false }] });
    const { result } = renderHook(() => useMyDrafts(source, WS));
    await waitFor(() => expect(result.current.data).toEqual([other, { ...mine, pending: false }]));
    await waitFor(() => expect(pendingDraftsOf(WS)).toEqual([other])); // pruned once the list named it; the other stays
    // The second-element leg of the remove: dropping the LAST row keeps the first (a remove that dropped the head
    // passed the prune above, where the pruned row was the head).
    addPendingDraft(WS, mine);
    removePendingDraft(WS, other.ticketId);
    expect(pendingDraftsOf(WS)).toEqual([mine]);
  });
});

describe('28.157 a refused draft', () => {
  it('28.157 removes the row, keeps the dialog with the same id and shows the refusal', async () => {
    const source = createFakeDataSource({}, (events) => events.map((e) => ({ status: 'refused' as const, eventId: e.id, rule: 'draft.parent-unpublished', reason: 'Publish the parent first' })));
    const calls = mount(source);
    await saveDraft();
    expect(await screen.findByText(/Publish the parent first/)).toBeInTheDocument();
    expect(pendingDraftsOf(WS)).toEqual([]);
    expect(calls.saved).not.toHaveBeenCalled();
    expect(calls.refused).toHaveBeenCalledWith(source.ingested[0]![0]!.entity.id);
    expect(screen.getByRole('dialog', { name: 'Create ticket' })).toBeInTheDocument();
    expect(screen.getByLabelText('Title')).toHaveValue('Pave the lane');
    // The control: a retry that commits keeps its row, under the SAME ticket id.
    const firstId = source.ingested[0]![0]!.entity.id;
    (source as { ingest: unknown }).ingest = async (events: SubmittedEvent[]) => { source.ingested.push(events); return events.map(() => committed); };
    await userEvent.setup().click(within(screen.getByRole('dialog', { name: 'Create ticket' })).getByRole('button', { name: 'Save as draft' }));
    await waitFor(() => expect(source.ingested).toHaveLength(2));
    expect(source.ingested[1]![0]!.entity.id).toBe(firstId);
    await waitFor(() => expect(calls.saved).toHaveBeenCalledTimes(1));
    expect(pendingDraftsOf(WS)).toHaveLength(1);
  });
  it('28.157 a thrown transport failure rolls the row back too', async () => {
    const source = createFakeDataSource({}, () => { throw new Error('socket'); });
    const calls = mount(source);
    await saveDraft();
    await waitFor(() => expect(calls.refused).toHaveBeenCalledTimes(1));
    expect(pendingDraftsOf(WS)).toEqual([]);
    expect(calls.saved).not.toHaveBeenCalled();
  });
});

describe('28.158 a draft saved offline', () => {
  it('28.158 an OfflineAcceptError is an accepted draft', async () => {
    const source = createFakeDataSource({}, () => { throw new OfflineAcceptError([{ status: 'pending', eventId: 'e1' }]); });
    const calls = mount(source);
    await saveDraft();
    await waitFor(() => expect(calls.saved).toHaveBeenCalledTimes(1));
    expect(calls.refused).not.toHaveBeenCalled();
    expect(pendingDraftsOf(WS)).toHaveLength(1);
    expect(screen.queryByRole('dialog', { name: 'Create ticket' })).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull(); // nothing is shown as a failure
  });
});
