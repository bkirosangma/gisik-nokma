import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { newUlid } from '@gisik-nokma/domain';
import { buildTestApp } from '../helpers/app.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { signInWithPhone } from '../helpers/session.js';

/**
 * E6-4 — deleted children and deleted parents, through `POST /v1/events`.
 *
 * The engine's context serves deleted rows by documented design
 * (`projections/tickets.ts`: the undo needs them; "if a caller needs live
 * tickets only, that is the caller's predicate to add"). Round 2 measured the
 * two callers that never added it: a soft-deleted open child blocked its
 * parent's close with a refusal about a child no view counts (`proj_tickets`
 * reported 0 live open children), and a live child could be created under, or
 * moved to, a soft-deleted parent.
 *
 * Both are measured here through the real door with the finding's own
 * controls: a LIVE open child still blocks (so the refusal sentence is the
 * ordinary one and the count is still taken), a parent whose child is DONE
 * closes (so the door can accept), and the live twin of the deleted parent
 * takes the same child the deleted one refuses.
 */

let db: TestDatabase;
let app: FastifyInstance;
let ownerToken = '';
let ownerId = '';
let WS = '';
let PRJ = '';

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

const create = (id: string, typeId: string, parentId: string | null, title: string) =>
  post({ kind: 'ticket', id }, 'ticket.created', { typeId, projectId: PRJ, parentId, title });
const move = (id: string, to: string) => post({ kind: 'ticket', id }, 'ticket.transitioned', { to });
const del = (id: string) => post({ kind: 'ticket', id }, 'ticket.deleted', {});

async function committed(answer: Promise<Answer>): Promise<void> {
  const a = await answer;
  expect(a.status, JSON.stringify(a)).toBe('committed');
}

beforeAll(async () => {
  db = await createTestDatabase();
  const built = buildTestApp(db);
  app = built.app;
  await app.ready();
  const owner = await signInWithPhone(app, built.otp, '+919000000711');
  ownerToken = owner.token;
  ownerId = owner.userId;
  const founded = await app.inject({ method: 'POST', url: '/v1/workspaces', headers: auth(ownerToken), payload: { name: 'E6-4' } });
  expect(founded.statusCode, founded.body).toBe(201);
  WS = founded.json<{ workspaceId: string }>().workspaceId;
  PRJ = newUlid();
  await committed(post({ kind: 'project', id: PRJ }, 'project.created', { name: 'P' }));
  await committed(post({ kind: 'project', id: PRJ }, 'project.member_added', { userId: ownerId, projectAdmin: true }));
}, 60_000);

afterAll(async () => {
  await app.close();
  await db.drop();
});

describe('17.122 E6-4 — a soft-deleted child is not open work', () => {
  it('E6-4: a parent closes over a deleted open child; a LIVE open child still blocks it; a DONE child lets it close', async () => {
    // P with one open child C. Delete C; P closes.
    const P = newUlid();
    const C = newUlid();
    await committed(create(P, 'story', null, 'P'));
    await committed(create(C, 'task', P, 'C'));
    await committed(move(P, 'doing'));
    await committed(del(C));
    // What a view counts — the finding's own reading — is zero live open children.
    const counted = await db.pool.query<{ open: string }>(
      "SELECT count(*)::text AS open FROM proj_tickets WHERE parent_id = $1 AND deleted_at IS NULL AND state_category <> 'terminal'",
      [P],
    );
    expect(counted.rows[0]?.open).toBe('0');
    await committed(move(P, 'done'));

    // Control 1: the same shape with the child LIVE is refused, with the
    // ordinary sentence and the count of ONE — the invariant is intact.
    const P2 = newUlid();
    const C2 = newUlid();
    await committed(create(P2, 'story', null, 'P2'));
    await committed(create(C2, 'task', P2, 'C2'));
    await committed(move(P2, 'doing'));
    expect(await move(P2, 'done')).toMatchObject({
      status: 'refused',
      rule: 'parent-terminal-with-open-children',
      reason: 'This ticket cannot enter "Done" while 1 of its child tickets is still open.',
    });
    // Control 2: once that child is DONE the parent closes — the door can accept.
    await committed(move(C2, 'doing'));
    await committed(move(C2, 'done'));
    await committed(move(P2, 'done'));
  });
});

describe('17.123 E6-4 — a soft-deleted ticket is not a parent', () => {
  const REFUSAL = {
    status: 'refused',
    rule: 'hierarchy.parent-deleted',
    reason: 'The chosen parent ticket is deleted. Restore it, or pick another parent.',
  };

  it('E6-4: ticket.created under a deleted parent is refused; under its live twin it is committed', async () => {
    const DP = newUlid();
    const LP = newUlid();
    await committed(create(DP, 'story', null, 'DP'));
    await committed(create(LP, 'story', null, 'LP'));
    await committed(del(DP));
    expect(await create(newUlid(), 'task', DP, 'under deleted')).toMatchObject(REFUSAL);
    await committed(create(newUlid(), 'task', LP, 'under live'));
  });

  it('E6-4: ticket.reparented onto a deleted parent is refused; onto its live twin it is committed', async () => {
    const DP = newUlid();
    const LP = newUlid();
    const MOVER = newUlid();
    await committed(create(DP, 'story', null, 'DP'));
    await committed(create(LP, 'story', null, 'LP'));
    await committed(create(MOVER, 'task', null, 'mover'));
    await committed(del(DP));
    expect(await post({ kind: 'ticket', id: MOVER }, 'ticket.reparented', { newParentId: DP })).toMatchObject(REFUSAL);
    await committed(post({ kind: 'ticket', id: MOVER }, 'ticket.reparented', { newParentId: LP }));
  });

  it('E6-4: a restored parent takes children again', async () => {
    const DP = newUlid();
    await committed(create(DP, 'story', null, 'DP'));
    await committed(del(DP));
    await committed(post({ kind: 'ticket', id: DP }, 'ticket.restored', {}));
    await committed(create(newUlid(), 'task', DP, 'after restore'));
  });
});
