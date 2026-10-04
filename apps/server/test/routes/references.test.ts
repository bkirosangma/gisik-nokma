import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid } from '@gisik-nokma/domain';
import { applyCommitted, makeCommitted } from '../helpers/apply.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { seedNotesIntoReadWorld, type ReadWorldNotes } from '../helpers/notes-fixture.js';
import { buildReadTestApp, type ReadWorld } from '../helpers/read-app.js';

/**
 * `GET /v1/workspaces/:workspaceId/references` (Knowledge Graph spec B §3.2),
 * through the REAL route. The sources' visibility is `listLinkedFrom`'s
 * (`test/read/linked-from.test.ts`); this file pins the route's own job: the
 * target check (visible, live, in THIS workspace — else the one 404) and the
 * input refusals.
 */

let db: TestDatabase;
let world: ReadWorld;
let notes: ReadWorldNotes;
beforeAll(async () => {
  db = await createTestDatabase();
  world = await buildReadTestApp(db);
  notes = await seedNotesIntoReadWorld(db.pool, {
    workspaceId: world.world.workspaceId, projectId: world.world.projectId, authorId: world.userIds.owner,
    guestUserId: world.userIds.guest, TP: world.world.taskInEpicId, TE: world.world.guestTaskId,
  });
  await applyCommitted(db.pool, [
    makeCommitted({
      workspaceId: world.world.workspaceId, actorId: world.userIds.owner, entity: { kind: 'note', id: notes.NOTES.nWorkspace }, type: 'note.body_set',
      payload: { body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'ticketRef', attrs: { ticketId: world.world.taskInEpicId, projectId: world.world.projectId, key: 'X-1', title: 'GST' } }] }] } },
    }),
    // A NOTE target with a source, so 27.132's note leg reads a row through the note path, not an empty page.
    makeCommitted({
      workspaceId: world.world.workspaceId, actorId: world.userIds.owner, entity: { kind: 'note', id: notes.NOTES.nProject }, type: 'note.body_set',
      payload: { body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'wikiLink', attrs: { noteId: notes.NOTES.nWorkspace, title: 'Workspace' } }] }] } },
    }),
  ]);
});
afterAll(async () => {
  await db.drop();
});

const get = (role: Parameters<ReadWorld['authOf']>[0], query: string, ws = world.world.workspaceId) =>
  world.app.inject({ method: 'GET', url: `/v1/workspaces/${ws}/references${query}`, headers: world.authOf(role) });

describe('27.132 the route answers a visible target with the page', () => {
  it('27.132 200 with { total, items, nextCursor } for a ticket and for a note target', async () => {
    const ticket = await get('member', `?target=ticket:${world.world.taskInEpicId}`);
    expect(ticket.statusCode).toBe(200);
    expect(ticket.json()).toMatchObject({ total: 1, nextCursor: null, items: [{ sourceKind: 'note', sourceId: notes.NOTES.nWorkspace }] });
    const note = await get('member', `?target=note:${notes.NOTES.nWorkspace}`);
    expect(note.statusCode).toBe(200);
    expect(note.json()).toMatchObject({ total: 1, nextCursor: null, items: [{ sourceKind: 'note', sourceId: notes.NOTES.nProject, snippet: '[[Workspace]]' }] });
  });
});

describe('27.133 an invisible, foreign or unknown target is the same 404', () => {
  it('27.133 the guest on a project-mode ticket, another workspace’s id and a random id all 404; the member is 200 (control)', async () => {
    const bodies = await Promise.all([
      get('guest', `?target=ticket:${world.world.taskInEpicId}`),
      get('member', `?target=ticket:${newUlid()}`),
      get('neighbour', `?target=ticket:${world.world.taskInEpicId}`, world.neighbour.workspaceId),
      get('member', `?target=note:${notes.NOTES.nPrivate}`),
      // An unknown NOTE id: the only leg that reaches `getNoteStateFromDb`'s null.
      get('member', `?target=note:${newUlid()}`),
      // The OWNER can see both items, so only the workspace pin refuses these two: ticketIsLive's
      // `workspace_id = $1` and the note branch's `state.workspaceId !== workspaceId`.
      get('owner', `?target=ticket:${world.world.taskInEpicId}`, world.neighbour.workspaceId),
      get('owner', `?target=note:${notes.NOTES.nWorkspace}`, world.neighbour.workspaceId),
    ]);
    for (const res of bodies) expect(res.statusCode).toBe(404);
    expect(new Set(bodies.map((res) => res.body)).size).toBe(1);
    expect(bodies[0]!.json()).toEqual({ error: 'not_found' }); // the shared NOT_FOUND_BODY, exactly
    expect((await get('member', `?target=ticket:${world.world.taskInEpicId}`)).statusCode).toBe(200);
  });

  it('27.133 a trashed target ticket, and one whose project is deleted, are the same 404; restored and undeleted, 200 (control)', async () => {
    // sharedTaskId (explicit to [owner, member]): no other case here reads it. `canSee` reads only
    // `proj_visibility`, which neither a trash nor a project delete touches, so `ticketIsLive`
    // (`read/live-ticket.ts`) is the one refusal: its `deleted_at` clause, then its container clause.
    const T = world.world.sharedTaskId;
    const ev = (entity: { kind: 'ticket' | 'project'; id: string }, type: string) =>
      makeCommitted({ workspaceId: world.world.workspaceId, actorId: world.userIds.owner, entity, type, payload: {} });
    const read = () => get('member', `?target=ticket:${T}`);
    const unknown = await get('member', `?target=ticket:${newUlid()}`);
    const live = await read();
    await applyCommitted(db.pool, [ev({ kind: 'ticket', id: T }, 'ticket.deleted')]);
    const trashed = await read();
    await applyCommitted(db.pool, [ev({ kind: 'ticket', id: T }, 'ticket.restored')]);
    const restored = await read();
    await applyCommitted(db.pool, [ev({ kind: 'project', id: world.world.projectId }, 'project.deleted')]);
    const inDeletedProject = await read();
    await applyCommitted(db.pool, [ev({ kind: 'project', id: world.world.projectId }, 'project.undeleted')]);
    const undeleted = await read();
    // Asserted once the world is put back, so a red here never leaves 27.134 a deleted project.
    expect(live.statusCode).toBe(200); // control: the member sees the live ticket
    expect(unknown.statusCode).toBe(404);
    expect([trashed.statusCode, trashed.body]).toEqual([404, unknown.body]); // byte-identical to the unknown id's 404
    expect([inDeletedProject.statusCode, inDeletedProject.body]).toEqual([404, unknown.body]);
    expect([restored.statusCode, undeleted.statusCode]).toEqual([200, 200]); // control: the same read, back
  });
});

describe('27.134 malformed input is a 400 that names nothing back', () => {
  it('27.134 missing target, a person target, a bad cursor', async () => {
    const refused = async (query: string, error: string) => {
      const res = await get('owner', query);
      expect([res.statusCode, res.json()], query).toEqual([400, { error }]);
    };
    await refused('', 'invalid_target');
    // A ULID id, so the KIND is the only reason to refuse (a sign-in's user id need not be a ULID).
    await refused(`?target=person:${newUlid()}`, 'invalid_target');
    await refused(`?target=ticket:${world.world.taskInEpicId}&cursor=abc`, 'invalid_cursor');
    await refused(`?target=ticket:${world.world.taskInEpicId}&cursor=`, 'invalid_cursor'); // empty: at least one digit
    // The cursor bound: 18 digits fit a bigint and pass; 19 are refused before Postgres sees them.
    await refused(`?target=ticket:${world.world.taskInEpicId}&cursor=${'9'.repeat(19)}`, 'invalid_cursor');
    expect((await get('owner', `?target=ticket:${world.world.taskInEpicId}&cursor=${'9'.repeat(18)}`)).statusCode).toBe(200); // control, just inside
    expect((await get('owner', `?target=ticket:${world.world.taskInEpicId}&cursor=999999`)).statusCode).toBe(200); // control
  });
});
