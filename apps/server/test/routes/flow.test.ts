// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { membershipId, newUlid } from '@gisik-nokma/domain';
import { UNAUTHENTICATED_BODY } from '../../src/auth/require-session.js';
import { applyCommitted, makeCommitted } from '../helpers/apply.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { buildReadTestApp, type ReadRole, type ReadWorld } from '../helpers/read-app.js';

/** Part 3 T3, case 29.244: `GET /v1/workspaces/:ws/tickets/:id/flow` answers the rich `FlowRead`, and every refusal is ONE 404. */
let db: TestDatabase;
let read: ReadWorld;
beforeAll(async () => {
  db = await createTestDatabase();
  read = await buildReadTestApp(db);
}, 60_000);
afterAll(async () => {
  await read.app.close();
  await db.drop();
});

const get = (role: ReadRole | null, workspaceId: string, ticketId: string) =>
  read.app.inject({ method: 'GET', url: `/v1/workspaces/${workspaceId}/tickets/${ticketId}/flow`, headers: role === null ? {} : read.authOf(role) });

describe('29.244 GET /v1/workspaces/:ws/tickets/:id/flow', () => {
  it('29.244 401 with no session; 200 FlowRead for the owner and a member; control: the same URL answers both', async () => {
    const { workspaceId, taskInEpicId } = read.world;
    const none = await get(null, workspaceId, taskInEpicId);
    expect(none.statusCode).toBe(401);
    expect(none.json()).toEqual(UNAUTHENTICATED_BODY);
    for (const role of ['owner', 'member'] as const) {
      const ok = await get(role, workspaceId, taskInEpicId);
      expect(ok.statusCode, role).toBe(200);
      const body = ok.json();
      expect(body).toMatchObject({ flowId: taskInEpicId, rootId: taskInEpicId, truncated: false, reached: 1, draftCount: 0, start: [taskInEpicId], end: [taskInEpicId], order: [taskInEpicId], autoMoves: [] });
      expect(body.nodes).toHaveLength(1); // a ticket in no flow is a flow of one
      expect(body.nodes[0]).toMatchObject({ id: taskInEpicId, title: 'File the GST return', state: { id: 'doing', name: 'Doing' }, assigneeId: read.world.member });
      expect(body.edges).toEqual([]);
    }
  });

  it('29.244 a stranger, a neighbour, an unknown id and a ticket the viewer cannot see all answer the SAME 404', async () => {
    const { workspaceId, taskInEpicId, hiddenTaskId } = read.world;
    expect((await get('owner', workspaceId, hiddenTaskId)).statusCode).toBe(200); // control: it exists, and the owner may read it
    // a deleted ticket: 200 for the owner while live (control), then deleted (`ticket.deleted {}`, check-lifecycle.test.ts:228)
    const deletedId = newUlid();
    const ws = { workspaceId, actorId: read.world.owner };
    await applyCommitted(db.pool, [makeCommitted({ ...ws, entity: { kind: 'ticket', id: deletedId }, type: 'ticket.created', payload: { typeId: 'task', projectId: read.world.projectId, parentId: null, title: 'Return the deposit' } })]);
    expect((await get('owner', workspaceId, deletedId)).statusCode).toBe(200);
    await applyCommitted(db.pool, [makeCommitted({ ...ws, entity: { kind: 'ticket', id: deletedId }, type: 'ticket.deleted', payload: {} })]);
    // planner ruling 2026-10-04: T3-Q1 — the author's own draft seeds a read (spec FL-1 :363); for anyone else,
    // the owner included, it is the unknown-ticket 404. The author is the event's actor (`seed.ts` `draftBy`'s rule).
    const draftId = newUlid();
    await applyCommitted(db.pool, [makeCommitted({ workspaceId, actorId: read.world.member, entity: { kind: 'ticket', id: draftId }, type: 'ticket.created', payload: { typeId: 'task', projectId: read.world.projectId, parentId: null, title: 'Sketch the brochure', start: 'backlog', draft: true } })]);
    const own = await get('member', workspaceId, draftId);
    expect(own.statusCode).toBe(200);
    expect(own.json()).toMatchObject({ flowId: draftId, rootId: draftId, draftCount: 1 });
    expect(own.json().nodes).toEqual([expect.objectContaining({ id: draftId, key: null, draft: true, title: 'Sketch the brochure', state: { id: 'backlog', name: 'Backlog', category: 'open' } })]);
    const probes = [
      await get('stranger', workspaceId, taskInEpicId),
      await get('neighbour', workspaceId, taskInEpicId),
      await get('owner', workspaceId, newUlid()),
      await get('owner', workspaceId, deletedId),
      await get('outsider', workspaceId, hiddenTaskId),
      await get('guest', workspaceId, hiddenTaskId),
      await get('owner', workspaceId, draftId), // planner ruling 2026-10-04: T3-Q1 — not the author: the same 404
      await get('outsider', workspaceId, draftId),
    ];
    const first = probes[0]!;
    expect(first.statusCode).toBe(404);
    expect(first.json()).toEqual({ error: 'not_found' }); // the one shared body, not merely eight equal ones
    for (const probe of probes) {
      expect(probe.statusCode).toBe(404);
      expect(probe.body).toBe(first.body);
      const { date: _a, ...mine } = probe.headers;
      const { date: _b, ...theirs } = first.headers;
      expect(mine).toEqual(theirs);
    }
  });

  it('29.244 an own draft, or a ticket the viewer sees, of ANOTHER workspace seeds nothing through this workspace\'s path; control: its own workspace\'s path reads each', async () => {
    // The neighbour's owner joins this workspace as a member, and authors a draft at home. `ticketAccess` answers
    // `own-draft` for it (it reads the ticket's OWN workspace), so the path's workspace is the liveness check's to hold.
    const nb = read.neighbour;
    const neighbourId = read.userIds.neighbour;
    const { workspaceId } = read.world;
    await applyCommitted(db.pool, [
      makeCommitted({ workspaceId, actorId: read.world.owner, entity: { kind: 'membership', id: membershipId(workspaceId, neighbourId) }, type: 'membership.granted', payload: { userId: neighbourId, role: 'member' } }),
    ]);
    const draftId = newUlid();
    await applyCommitted(db.pool, [
      makeCommitted({ workspaceId: nb.workspaceId, actorId: neighbourId, entity: { kind: 'ticket', id: draftId }, type: 'ticket.created', payload: { typeId: 'nb-task', projectId: nb.projectId, parentId: null, title: 'Plan the move', start: 'backlog', draft: true } }),
    ]);
    const home = await get('neighbour', nb.workspaceId, draftId);
    expect(home.statusCode).toBe(200);
    expect(home.json().nodes).toEqual([expect.objectContaining({ id: draftId, draft: true, title: 'Plan the move' })]);
    // control: the neighbour IS a member here now: a ticket of this workspace shown to them reads through this path
    const shown = newUlid();
    const ws = { workspaceId, actorId: read.world.owner };
    await applyCommitted(db.pool, [
      makeCommitted({ ...ws, entity: { kind: 'ticket', id: shown }, type: 'ticket.created', payload: { typeId: 'task', projectId: read.world.projectId, parentId: null, title: 'Hand over the keys' } }),
      makeCommitted({ ...ws, entity: { kind: 'ticket', id: shown }, type: 'visibility.set', payload: { ticketId: shown, mode: 'explicit', userIds: [read.world.owner, neighbourId] } }),
    ]);
    expect((await get('neighbour', workspaceId, shown)).statusCode).toBe(200);
    const across = await get('neighbour', workspaceId, draftId);
    expect([across.statusCode, across.json()]).toEqual([404, { error: 'not_found' }]);
    // the VISIBLE arm too: a published ticket the neighbour sees at home (`ticketAccess` answers `visible`) seeds nothing
    // through this path; without the path's workspace clause the walk would answer 200 with no node, an oracle across
    // workspaces. Control: its own workspace's path reads it.
    expect((await get('neighbour', nb.workspaceId, nb.ticketId)).statusCode).toBe(200);
    const foreign = await get('neighbour', workspaceId, nb.ticketId);
    expect([foreign.statusCode, foreign.json()]).toEqual([404, { error: 'not_found' }]);
  });
});
