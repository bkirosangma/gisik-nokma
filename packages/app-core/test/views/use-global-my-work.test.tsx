import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { AttentionShow } from '../../src/my-work-global-contract.js';
import type { AttentionItem, MyWorkView, WorkItem, WorkspaceRef } from '../../src/view-types.js';
import { useGlobalMyWork } from '../../src/views/use-global-my-work.js';
import { createFakeDataSource } from '../helpers/fake-data-source.js';

/**
 * The global My work hook (my-work-global T3, cases 30.030–30.033): one fan-out over the
 * viewer's NON-ARCHIVED workspaces, each asked only the part of `show` it allows, merged,
 * with a failing workspace kept out of the others' way.
 */

function workspace(id: string, overrides: Partial<WorkspaceRef> = {}): WorkspaceRef {
  return {
    id,
    name: id,
    prefix: 'W',
    role: 'member',
    archived: false,
    memberCount: null,
    nameRestrictedProjectCount: 0,
    projects: [],
    ...overrides,
  };
}

const attentionItem = (workspaceId: string, ticketId: string): AttentionItem => ({
  kind: 'blocked',
  ticketId,
  workspaceId,
  projectId: `${workspaceId}-p`,
  title: ticketId,
  reason: 'In the blocked state "Waiting".',
  claim: null,
});

const workItem = (workspaceId: string, ticketId: string): WorkItem => ({
  ticketId,
  workspaceId,
  projectId: `${workspaceId}-p`,
  projectName: 'Errands',
  title: ticketId,
  stateId: 'doing',
  stateName: 'Doing',
  stateCategory: 'active',
  stateProvenance: {
    actorId: 'u',
    actorName: null,
    clientTime: '2026-10-01T04:00:00.000Z',
    serverTime: '2026-10-01T04:00:01.000Z',
  },
  dueDate: null,
});

const myWorkOf = (workspaceId: string): MyWorkView => ({
  assigned: [workItem(workspaceId, `${workspaceId}-assigned`)],
  inTransit: [],
  contested: [
    {
      ticketId: `${workspaceId}-contested`,
      title: 'contested',
      rule: 'state-machine',
      reason: 'no transition',
      claim: { actorId: 'u', clientTime: '2026-10-01T04:00:00.000Z' },
    } as MyWorkView['contested'][number],
  ],
  shared: [workItem(workspaceId, `${workspaceId}-shared`)],
});

/** A source whose answers name the workspace AND the show they were asked with. */
function recordingSource(fail: { attention?: string[]; myWork?: string[] } = {}) {
  const attentionCalls: Array<[string, readonly AttentionShow[] | undefined]> = [];
  const myWorkCalls: string[] = [];
  const source = createFakeDataSource({
    getAttention: async (workspaceId, show) => {
      attentionCalls.push([workspaceId, show]);
      if (fail.attention?.includes(workspaceId)) throw new Error(`attention refused in ${workspaceId}`);
      return [attentionItem(workspaceId, `${workspaceId}:${(show ?? ['ALL']).join('+')}`)];
    },
    getMyWork: async (workspaceId) => {
      myWorkCalls.push(workspaceId);
      if (fail.myWork?.includes(workspaceId)) throw new Error(`my work refused in ${workspaceId}`);
      return myWorkOf(workspaceId);
    },
  });
  return { source, attentionCalls, myWorkCalls };
}

const ids = (items: readonly { ticketId: string }[] | null | undefined) => items?.map((item) => item.ticketId) ?? null;

describe('useGlobalMyWork', () => {
  it('30.030 asks every workspace with the INTERSECTED show — a member workspace never receives ws-admin — and merges both sections', async () => {
    const { source, attentionCalls, myWorkCalls } = recordingSource();
    const workspaces = [workspace('w-admin', { role: 'admin' }), workspace('w-member')];
    const { result, rerender } = renderHook(
      ({ list, show }: { list: WorkspaceRef[]; show: AttentionShow[] }) => useGlobalMyWork(source, list, show),
      { initialProps: { list: workspaces, show: ['created', 'assigned', 'ws-admin'] } },
    );
    await waitFor(() => expect(result.current.attention.data).not.toBeNull());
    expect(attentionCalls).toEqual([
      ['w-admin', ['created', 'assigned', 'ws-admin']],
      ['w-member', ['created', 'assigned']],
    ]);
    // `show` is never left off: an absent show is the route's ALL-VISIBLE default, the
    // widest answer there is, and the global page never asks for it.
    expect(attentionCalls.every(([, show]) => show !== undefined && show.length > 0)).toBe(true);
    expect(ids(result.current.attention.data)).toEqual([
      'w-admin:created+assigned+ws-admin',
      'w-member:created+assigned',
    ]);
    expect(myWorkCalls).toEqual(['w-admin', 'w-member']);
    expect(ids(result.current.myWork.data?.assigned)).toEqual(['w-admin-assigned', 'w-member-assigned']);
    expect(ids(result.current.myWork.data?.shared)).toEqual(['w-admin-shared', 'w-member-shared']);
    expect(ids(result.current.myWork.data?.contested)).toEqual(['w-admin-contested', 'w-member-contested']);
    // A merged contested claim carries no workspace of its own, and the ticket sheet needs
    // one: the hook keeps which workspace answered for every ticket it merged.
    expect(result.current.workspaceOf).toEqual({
      'w-admin:created+assigned+ws-admin': 'w-admin',
      'w-member:created+assigned': 'w-member',
      'w-admin-assigned': 'w-admin',
      'w-member-assigned': 'w-member',
      'w-admin-contested': 'w-admin',
      'w-member-contested': 'w-member',
      'w-admin-shared': 'w-admin',
      'w-member-shared': 'w-member',
    });

    // A fresh but EQUAL list (a parent re-rendering `data ?? []`) asks nothing again.
    rerender({ list: [workspace('w-admin', { role: 'admin' }), workspace('w-member')], show: ['created', 'assigned', 'ws-admin'] });
    await act(async () => {});
    expect(attentionCalls).toHaveLength(2);

    // Only ws-admin selected: the member workspace has nothing it may be asked, so it is
    // SKIPPED for attention — never sent an empty or an absent show.
    attentionCalls.length = 0;
    rerender({ list: workspaces, show: ['ws-admin'] });
    await waitFor(() => expect(ids(result.current.attention.data)).toEqual(['w-admin:ws-admin']));
    expect(attentionCalls).toEqual([['w-admin', ['ws-admin']]]);
  });

  it('30.031 an archived workspace is neither queried nor subscribed; a live workspace\'s stream frame re-queries it', async () => {
    const { source, attentionCalls, myWorkCalls } = recordingSource();
    const { result } = renderHook(() =>
      useGlobalMyWork(source, [workspace('w-live'), workspace('w-archived', { archived: true })], ['created', 'assigned']),
    );
    await waitFor(() => expect(result.current.attention.data).not.toBeNull());
    expect(attentionCalls.map(([workspaceId]) => workspaceId)).toEqual(['w-live']);
    expect(myWorkCalls).toEqual(['w-live']);
    expect(source.subscriptions.map((s) => s.workspaceId)).toEqual(['w-live']);

    // The "live" half of one live query per workspace: a frame on its stream asks again.
    act(() => source.pushStreamItem({ type: 'refresh', workspaceId: 'w-live' } as never));
    await waitFor(() => expect(attentionCalls).toHaveLength(2));
    expect(myWorkCalls).toEqual(['w-live', 'w-live']);
    expect(attentionCalls[1]).toEqual(['w-live', ['created', 'assigned']]);
  });

  it('30.032 one workspace failing does not blank the others: its error is in byWorkspace and the rest render', async () => {
    const { source } = recordingSource({ attention: ['w-bad'], myWork: ['w-bad'] });
    const { result } = renderHook(() =>
      useGlobalMyWork(source, [workspace('w-bad'), workspace('w-good')], ['created', 'assigned']),
    );
    await waitFor(() => expect(result.current.attention.data).not.toBeNull());
    expect(ids(result.current.attention.data)).toEqual(['w-good:created+assigned']);
    expect(result.current.attention.error).toBeNull();
    expect(result.current.attention.byWorkspace).toEqual({ 'w-bad': 'attention refused in w-bad' });
    expect(ids(result.current.myWork.data?.assigned)).toEqual(['w-good-assigned']);
    expect(result.current.myWork.byWorkspace).toEqual({ 'w-bad': 'my work refused in w-bad' });

    // EVERY workspace failing is an error, never an empty list: an empty strip reads as
    // an all-clear, and a session that ended must reach the page as a failure it can act on.
    const all = recordingSource({ attention: ['w-bad', 'w-worse'], myWork: ['w-bad', 'w-worse'] });
    const failed = renderHook(() =>
      useGlobalMyWork(all.source, [workspace('w-bad'), workspace('w-worse')], ['created', 'assigned']),
    );
    await waitFor(() => expect(failed.result.current.attention.error).not.toBeNull());
    expect(failed.result.current.attention.data).toBeNull();
    expect(failed.result.current.attention.error).toBe('attention refused in w-bad');
    expect(failed.result.current.myWork.data).toBeNull();
    expect(failed.result.current.myWork.error).toBe('my work refused in w-bad');

    // No workspaces at all is an ANSWER (nothing to show), not a load that never ends.
    const empty = recordingSource();
    const none = renderHook(() => useGlobalMyWork(empty.source, [], ['created', 'assigned']));
    await waitFor(() => expect(none.result.current.attention.data).toEqual([]));
    expect(none.result.current.myWork.data).toEqual({ assigned: [], inTransit: [], contested: [], shared: [] });
  });

  it('30.033 a show change re-queries with the new show, and no render after it shows the OLD answer', async () => {
    const { source, attentionCalls } = recordingSource();
    const seen: Array<string[] | null> = [];
    const { result, rerender } = renderHook(
      ({ show }: { show: AttentionShow[] }) => {
        const answer = useGlobalMyWork(source, [workspace('w1')], show);
        seen.push(ids(answer.attention.data));
        return answer;
      },
      { initialProps: { show: ['created', 'assigned'] } },
    );
    await waitFor(() => expect(ids(result.current.attention.data)).toEqual(['w1:created+assigned']));
    const before = seen.length;

    rerender({ show: ['created'] });
    await waitFor(() => expect(ids(result.current.attention.data)).toEqual(['w1:created']));
    expect(attentionCalls.at(-1)).toEqual(['w1', ['created']]);
    // Every render from the change on — the FIRST one included — is null or the new answer.
    const after = seen.slice(before);
    expect(after[0]).toBeNull();
    for (const answer of after) expect(answer === null || answer.join() === 'w1:created').toBe(true);
  });
});
