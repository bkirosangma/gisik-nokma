import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { membershipId, newUlid } from '@gisik-nokma/domain';
import { buildTestApp } from '../helpers/app.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { signInWithPhone } from '../helpers/session.js';

/**
 * E6-2 — writes aimed at a ticket that is ALREADY soft-deleted, through the
 * product's own door (`POST /v1/events`, session-authenticated, owner actor).
 *
 * Round 2 measured the door COMMITTING `ticket.assigned`, `comment.added`,
 * `ticket.transitioned`, `ticket.field_set`, `ticket.collaborator_added` and
 * `visibility.set` against a ticket whose detail door already answered 404 —
 * byte-identical to the same battery against a live ticket — and the
 * `ticket.assigned` fanout then served the peer an inbox notification pointing
 * at that 404. The engine asked about `deleted` in exactly one check.
 *
 * Every arm here is asked about the DELETED ticket and about a LIVE twin that
 * differs from it in exactly one respect, in the same run, so a refusal is the
 * flag answering and never a door that refuses the type outright. The
 * notification arm is the same shape: the peer's inbox holds an assignment for
 * the live twin and none for the deleted one.
 *
 * `ticket.closed` and `ticket.ranked` are in the battery because the finding
 * ran them: on the live twin they meet their own workflow refusals
 * (`close-requires-terminal`, `rank-requires-backlog`) — state-of-workflow
 * answers that say nothing about deletion — and on the deleted twin the gate
 * answers FIRST, which is the ordering this file pins.
 */

let db: TestDatabase;
let app: FastifyInstance;
let ownerToken = '';
let ownerId = '';
let peerToken = '';
let peerId = '';
let WS = '';
let PRJ = '';
let LIVE = '';
let DELETED = '';

type Answer = { status: string; rule?: string; reason?: string };

function auth(token: string) {
  return { authorization: `Bearer ${token}` };
}

async function post(entity: { kind: string; id: string }, type: string, payload: unknown): Promise<Answer> {
  const res = await app.inject({
    method: 'POST',
    url: '/v1/events',
    headers: auth(ownerToken),
    payload: {
      events: [
        {
          id: newUlid(),
          workspaceId: WS,
          entity,
          type,
          version: 1,
          payload,
          actorId: ownerId,
          origin: 'web',
          clientTime: new Date().toISOString(),
        },
      ],
    },
  });
  expect(res.statusCode, res.body).toBe(200);
  return res.json<{ results: Answer[] }>().results[0]!;
}

function doc(text: string) {
  return { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] };
}

/** The six writes the finding measured COMMITTING on a deleted ticket, plus the two workflow-refused ones. */
const BATTERY: ReadonlyArray<[type: string, payloadFor: (id: string) => unknown]> = [
  ['ticket.assigned', () => ({ assigneeId: peerId })],
  ['comment.added', () => ({ body: doc('a comment') })],
  ['ticket.transitioned', () => ({ to: 'doing' })],
  ['ticket.field_set', () => ({ fieldId: 'title', value: 'renamed' })],
  ['ticket.collaborator_added', () => ({ userId: peerId })],
  ['visibility.set', (id) => ({ ticketId: id, mode: 'explicit', userIds: [peerId] })],
  ['ticket.closed', () => ({})],
  ['ticket.ranked', () => ({ rank: 'a1' })],
];

beforeAll(async () => {
  db = await createTestDatabase();
  const built = buildTestApp(db);
  app = built.app;
  await app.ready();
  const owner = await signInWithPhone(app, built.otp, '+919000000701');
  ownerToken = owner.token;
  ownerId = owner.userId;
  const peer = await signInWithPhone(app, built.otp, '+919000000702');
  peerToken = peer.token;
  peerId = peer.userId;

  const founded = await app.inject({ method: 'POST', url: '/v1/workspaces', headers: auth(ownerToken), payload: { name: 'E6-2' } });
  expect(founded.statusCode, founded.body).toBe(201);
  WS = founded.json<{ workspaceId: string }>().workspaceId;

  const grant = await post({ kind: 'membership', id: membershipId(WS, peerId) }, 'membership.granted', { userId: peerId, role: 'member' });
  expect(grant.status, JSON.stringify(grant)).toBe('committed');
  PRJ = newUlid();
  expect((await post({ kind: 'project', id: PRJ }, 'project.created', { name: 'P' })).status).toBe('committed');
  for (const uid of [ownerId, peerId]) {
    expect((await post({ kind: 'project', id: PRJ }, 'project.member_added', { userId: uid, projectAdmin: uid === ownerId })).status).toBe('committed');
  }
  LIVE = newUlid();
  DELETED = newUlid();
  for (const [id, title] of [[LIVE, 'live'], [DELETED, 'to be deleted']] as const) {
    expect((await post({ kind: 'ticket', id }, 'ticket.created', { typeId: 'task', projectId: PRJ, parentId: null, title })).status).toBe('committed');
  }
  expect((await post({ kind: 'ticket', id: DELETED }, 'ticket.deleted', {})).status).toBe('committed');
}, 60_000);

afterAll(async () => {
  await app.close();
  await db.drop();
});

describe('E6-2 — the ingest door refuses every ordinary write against a soft-deleted ticket', () => {
  it('E6-2: control — the deleted twin is gone from the detail door and the live one is not', async () => {
    const gone = await app.inject({ method: 'GET', url: `/v1/workspaces/${WS}/tickets/${DELETED}`, headers: auth(ownerToken) });
    const here = await app.inject({ method: 'GET', url: `/v1/workspaces/${WS}/tickets/${LIVE}`, headers: auth(ownerToken) });
    expect(gone.statusCode).toBe(404);
    expect(here.statusCode).toBe(200);
  });

  it.each(BATTERY)('E6-2: %s on the deleted twin is refused deleted-ticket, and the same claim on the live twin is not', async (type, payloadFor) => {
    const onDeleted = await post({ kind: 'ticket', id: DELETED }, type, payloadFor(DELETED));
    expect(onDeleted).toEqual({
      status: 'refused',
      eventId: expect.any(String),
      rule: 'deleted-ticket',
      reason: 'This ticket is deleted; restore it first.',
    });
    // The live twin, same type, same payload: whatever it answers, it is not
    // this refusal. Six of the eight commit; `ticket.closed` and
    // `ticket.ranked` meet the workflow's own rules, which is the control that
    // the gate is ahead of them on the deleted twin rather than instead of them.
    const onLive = await post({ kind: 'ticket', id: LIVE }, type, payloadFor(LIVE));
    expect(onLive.rule).not.toBe('deleted-ticket');
    if (type === 'ticket.closed') expect(onLive).toMatchObject({ status: 'refused', rule: 'close-requires-terminal' });
    else if (type === 'ticket.ranked') expect(onLive).toMatchObject({ status: 'refused', rule: 'rank-requires-backlog' });
    else expect(onLive.status, JSON.stringify(onLive)).toBe('committed');
  });

  it('E6-2: the deleted ticket\'s head is untouched, while the live twin\'s writes all landed', async () => {
    const { rows } = await db.pool.query<{ ticket_id: string; state_id: string; assignee_id: string | null; deleted_at: string | null }>(
      'SELECT ticket_id, state_id, assignee_id, deleted_at FROM proj_tickets WHERE ticket_id = ANY($1::text[])',
      [[DELETED, LIVE]],
    );
    const byId = new Map(rows.map((row) => [row.ticket_id, row]));
    expect(byId.get(DELETED)).toMatchObject({ state_id: 'todo', assignee_id: null });
    expect(byId.get(DELETED)?.deleted_at).not.toBeNull();
    expect(byId.get(LIVE)).toMatchObject({ state_id: 'doing', assignee_id: peerId, deleted_at: null });
  });

  it('E6-2: no assignment notification is manufactured for the peer about the deleted ticket — the live twin\'s is the control', async () => {
    const inbox = await app.inject({ method: 'GET', url: `/v1/me/notifications?workspaceId=${WS}`, headers: auth(peerToken) });
    expect(inbox.statusCode).toBe(200);
    const assignments = inbox
      .json<{ notifications: Array<{ kind: string; payload: { ticketId?: string } }> }>()
      .notifications.filter((n) => n.kind === 'assignment')
      .map((n) => n.payload.ticketId);
    expect(assignments).toContain(LIVE);
    expect(assignments).not.toContain(DELETED);
    // And the store agrees with the door: no row at all, not merely a hidden one.
    const { rows } = await db.pool.query<{ ticket_id: string }>(
      "SELECT payload ->> 'ticketId' AS ticket_id FROM notifications WHERE workspace_id = $1 AND user_id = $2 AND kind = 'assignment'",
      [WS, peerId],
    );
    expect(rows.map((row) => row.ticket_id)).toEqual([LIVE]);
  });

  it('E6-2: a second ticket.deleted still answers already-deleted — the gate is not in front of the delete\'s own door', async () => {
    expect(await post({ kind: 'ticket', id: DELETED }, 'ticket.deleted', {})).toMatchObject({ status: 'refused', rule: 'already-deleted' });
  });

  it('E6-2: ticket.restored re-opens the door — the gate reads the flag, not the history', async () => {
    expect((await post({ kind: 'ticket', id: DELETED }, 'ticket.restored', {})).status).toBe('committed');
    expect((await post({ kind: 'ticket', id: DELETED }, 'ticket.assigned', { assigneeId: peerId })).status).toBe('committed');
    // The fanout runs AFTER the commit answers, off the request. Waiting for
    // its row does two things: it asserts the notification the previous case
    // proved absent is delivered once the ticket is live again, and it drains
    // the fanout before `afterAll` ends the pool under it.
    const deadline = Date.now() + 5_000;
    let delivered: string[] = [];
    while (Date.now() < deadline) {
      const { rows } = await db.pool.query<{ ticket_id: string }>(
        "SELECT payload ->> 'ticketId' AS ticket_id FROM notifications WHERE workspace_id = $1 AND user_id = $2 AND kind = 'assignment' ORDER BY created_at",
        [WS, peerId],
      );
      delivered = rows.map((row) => row.ticket_id);
      if (delivered.includes(DELETED)) break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    expect(delivered).toEqual([LIVE, DELETED]);
  });
});
