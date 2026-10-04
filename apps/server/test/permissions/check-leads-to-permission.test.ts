import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeEnvelope } from '@gisik-nokma/domain';
import { checkPermission } from '../../src/permissions/check-permission.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { buildReadTestApp, type ReadWorld } from '../helpers/read-app.js';

/**
 * 29.124 (gate half): `leads_to` at the permission gate is any other kind. The world is typed-links 27.043's read
 * scenario: the member sees `taskInEpic` and `shared`, not `hidden`. No production change: the gate's link arm
 * keys on the event type and `targetId` (`check-permission.ts`), never on the kind, and this pins that it stays so.
 */
let db: TestDatabase;
let read: ReadWorld;
let WS: string;
let member: string;
let inEpic: string;
let shared: string;
let hidden: string;

const gate = (source: string, target: string, type = 'ticket.link_added', label: string | undefined = 'Yes') =>
  checkPermission(
    makeEnvelope({ type, workspaceId: WS, actorId: member, origin: 'web', entity: { kind: 'ticket', id: source },
      payload: { kind: 'leads_to', targetId: target, ...(label === undefined ? {} : { label }) } }),
    { db: db.pool, sessionUserId: member },
  );

beforeAll(async () => {
  db = await createTestDatabase();
  read = await buildReadTestApp(db);
  WS = read.world.workspaceId;
  member = read.userIds.member;
  inEpic = read.world.taskInEpicId;
  shared = read.world.sharedTaskId;
  hidden = read.world.hiddenTaskId;
});
afterAll(async () => {
  await read.app.close();
  await db.drop();
});

describe('29.124 the permission gate treats leads_to like the other kinds', () => {
  it('29.124 a hidden target is refused with the one sentence, labelled or not, added or removed; control: a visible target passes', async () => {
    const refusal = { refused: true, rule: 'permission.visibility', reason: 'The other ticket does not exist in this workspace, or you cannot see it.' };
    expect(await gate(inEpic, hidden)).toEqual(refusal);
    expect(await gate(inEpic, hidden, 'ticket.link_added', undefined)).toEqual(refusal);
    expect(await gate(inEpic, hidden, 'ticket.link_removed', undefined)).toEqual(refusal);
    expect(await gate(inEpic, shared)).toBeNull(); // control
    expect(await gate(inEpic, shared, 'ticket.link_removed', undefined)).toBeNull(); // the removal's own control
  });
});
