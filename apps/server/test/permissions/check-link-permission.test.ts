import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeEnvelope, newUlid } from '@gisik-nokma/domain';
import { checkPermission } from '../../src/permissions/check-permission.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { buildReadTestApp, type ReadWorld } from '../helpers/read-app.js';

/**
 * Typed links, rules 6 and 7 (spec A §2.3), at the permission gate. The world
 * is the read scenario: the member sees `taskInEpic` and `shared` (explicit
 * `[owner, member]`) and not `hidden` (explicit `[owner]`); the owner sees all
 * three.
 *
 * Each envelope's actor IS the session user: `checkRolePermission` refuses any
 * other actor as a spoof before visibility is asked, so an owner session
 * carrying the member's actor would test that refusal, not this one.
 */
let db: TestDatabase;
let read: ReadWorld;
let WS: string;
let member: string;
let owner: string;
let inEpic: string;
let shared: string;
let hidden: string;

const env = (actor: string, source: string, payload: Record<string, unknown>, type = 'ticket.link_added') =>
  makeEnvelope({ type, workspaceId: WS, actorId: actor, origin: 'web', entity: { kind: 'ticket', id: source }, payload });
const gate = (actor: string, source: string, target: string, type = 'ticket.link_added') =>
  checkPermission(env(actor, source, { kind: 'blocks', targetId: target }, type), { db: db.pool, sessionUserId: actor });

beforeAll(async () => {
  db = await createTestDatabase();
  read = await buildReadTestApp(db);
  WS = read.world.workspaceId;
  member = read.userIds.member;
  owner = read.userIds.owner;
  inEpic = read.world.taskInEpicId;
  shared = read.world.sharedTaskId;
  hidden = read.world.hiddenTaskId;
});
afterAll(async () => {
  await read.app.close();
  await db.drop();
});

describe('27.043–27.044, 27.047 who may link two tickets', () => {
  it('27.043 hidden or unknown target refused with one sentence; control: two visible tickets pass', async () => {
    const refusal = { refused: true, rule: 'permission.visibility', reason: 'The other ticket does not exist in this workspace, or you cannot see it.' };
    expect(await gate(member, inEpic, hidden)).toEqual(refusal);
    expect(await gate(member, inEpic, hidden, 'ticket.link_removed')).toEqual(refusal);
    expect(await gate(member, inEpic, newUlid())).toEqual(refusal);
    expect(await gate(member, inEpic, shared)).toBeNull();
    expect(await gate(member, inEpic, shared, 'ticket.link_removed')).toBeNull(); // the removal's own control
  });

  it('27.044 a hidden SOURCE is refused by the existing canSee(source) line, before the target is asked; control: the owner passes', async () => {
    const sourceRefusal = { refused: true, rule: 'permission.visibility', reason: 'This ticket is not visible to you.' };
    expect(await gate(member, hidden, shared)).toEqual(sourceRefusal);
    // BOTH ends invisible to the member: the SOURCE's sentence wins, so the target was not asked first.
    expect(await gate(member, hidden, newUlid())).toEqual(sourceRefusal);
    expect(await gate(owner, hidden, shared)).toBeNull();
  });

  it('27.047 a malformed link payload passes the gate to the engine\'s malformed-payload; control: the same target, well formed, is refused', async () => {
    // The target is hidden from the member, so only the parse guard lets these through rather than refusing them.
    expect(await checkPermission(env(member, inEpic, { kind: 'blocks', targetId: hidden, note: 'x' }), { db: db.pool, sessionUserId: member })).toBeNull();
    expect(await checkPermission(env(member, inEpic, { kind: 'follows', targetId: hidden }, 'ticket.link_removed'), { db: db.pool, sessionUserId: member })).toBeNull();
    expect(await checkPermission(env(member, inEpic, { kind: 'blocks', targetId: hidden }), { db: db.pool, sessionUserId: member })).toMatchObject({
      refused: true, rule: 'permission.visibility' });
  });
});
