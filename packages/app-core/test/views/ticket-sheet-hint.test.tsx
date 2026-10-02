import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TicketRead } from '../../src/view-types.js';
import { TicketSheet } from '../../src/views/ticket-sheet.js';
import { clearLiveQueryCache, liveQueryStoreKey, recallLiveQuery } from '../../src/views/live-query-cache.js';
import { createFakeDataSource } from '../helpers/fake-data-source.js';
import { TICKET, WF_ERRAND, WS, ticketStateSeed } from '../helpers/seed.js';

/**
 * The sheet's reads (smoothness T7 FIX 1, F3; plan Task 7 Step 3; case 25.104): the opener's workflow hint starts the
 * workflow read before the ticket read resolves, and the two reads are named in the session read cache.
 */

afterEach(cleanup);

const stamp = { actorId: 'user_kiro', clientTime: '2026-08-18T07:59:00.000Z', serverTime: '2026-08-18T08:00:00.000Z' };
const READ = {
  ticket: ticketStateSeed({ fields: { title: { value: 'A ticket', ...stamp }, priority: { value: 'P2', ...stamp } } }),
  title: 'A ticket',
  stateProvenance: { actorId: 'user_anselma', actorName: 'Anselma Marak', clientTime: stamp.clientTime, serverTime: stamp.serverTime },
  assignedProvenance: null,
  parent: null,
  rollup: null,
  key: 'CC-1',
  epic: null,
  visibility: { ownMode: 'inherit', resolvedMode: 'project' },
} as unknown as TicketRead;

/** A ticket read that answers only when told to, and a workflow read that records when it was asked. */
function world() {
  let answer!: (read: TicketRead) => void;
  const ticketRead = new Promise<TicketRead>((resolve) => {
    answer = resolve;
  });
  const getWorkflowDef = vi.fn(async () => WF_ERRAND);
  const source = createFakeDataSource({
    getTicket: () => ticketRead,
    getWorkflowDef,
    getMembers: async () => [{ id: 'user_kiro', name: 'Kiro', role: 'owner' }],
    getTicketHistory: async () => [],
    getTickets: async (projectId: string) => ({ projectId, rows: [] }),
  } as never);
  return { source, getWorkflowDef, answerTicket: () => answer(READ) };
}

const sheet = (source: ReturnType<typeof world>['source'], hint?: { workflowId: string; workflowVersion: number }) => (
  <TicketSheet dataSource={source} workspaceId={WS} ticketId={TICKET} currentUserId="user_kiro" onClose={vi.fn()} {...(hint === undefined ? {} : { hint })} />
);

describe('the sheet reads (T7 F3)', () => {
  it('25.104 with a hint the workflow read starts BEFORE the ticket read resolves; without one it waits for the ticket', async () => {
    // Control: no hint — the ticket read is open, and the workflow is not asked for.
    const plain = world();
    const first = render(sheet(plain.source));
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(plain.getWorkflowDef).not.toHaveBeenCalled();
    plain.answerTicket();
    await waitFor(() => expect(plain.getWorkflowDef).toHaveBeenCalledTimes(1));
    first.unmount();
    clearLiveQueryCache(); // the first half cached the ticket: the second must start with nothing to serve
    // With the hint: asked for while the ticket read is STILL open, for the workflow the opener named.
    const hinted = world();
    render(sheet(hinted.source, { workflowId: WF_ERRAND.id, workflowVersion: WF_ERRAND.version }));
    await waitFor(() => expect(hinted.getWorkflowDef).toHaveBeenCalledWith(WS, WF_ERRAND.id, WF_ERRAND.version));
    // The ticket's own answer then agrees with the hint: no second workflow read.
    hinted.answerTicket();
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(hinted.getWorkflowDef).toHaveBeenCalledTimes(1);
  });

  it('25.104 the reads are named in the session read cache: `ticket:<id>` and `wf:<id>@<version>`; the subtasks read is NOT cached (the page\'s own list read carries no key to share)', async () => {
    const { source, answerTicket } = world();
    // Control: nothing is cached before the reads land.
    expect(recallLiveQuery(liveQueryStoreKey(WS, `ticket:${TICKET}`))).toBeUndefined();
    render(sheet(source, { workflowId: WF_ERRAND.id, workflowVersion: WF_ERRAND.version }));
    answerTicket();
    await waitFor(() => expect(recallLiveQuery(liveQueryStoreKey(WS, `ticket:${TICKET}`))).toBe(READ));
    await waitFor(() => expect(recallLiveQuery(liveQueryStoreKey(WS, `wf:${WF_ERRAND.id}@${WF_ERRAND.version}`))).toBe(WF_ERRAND));
    expect(recallLiveQuery(liveQueryStoreKey(WS, `list:${READ.ticket.projectId}:{}`))).toBeUndefined();
  });
});
