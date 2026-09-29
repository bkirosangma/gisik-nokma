import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid, type SubmittedEvent } from '@gisik-nokma/domain';
import type { FastifyInstance } from 'fastify';
import type { LogMagicLinkSender } from '../../src/auth/magic-link-sender.js';
import type { LogOtpSender } from '../../src/auth/otp-sender.js';
import { NAMED_PERSON_NOT_IN_WORKSPACE_REASON, TICKET_NOT_VISIBLE_REASON } from '../../src/permissions/check-permission.js';
import { READ_NOT_FOUND_BODY } from '../../src/read/membership.js';
import { NO_ACCOUNT_REASON } from '../../src/routes/people.js';
import { canSee } from '../../src/visibility/can-see.js';
import { buildTestApp, TEST_WEB_ORIGIN } from '../helpers/app.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { signInWithEmail, signInWithPhone } from '../helpers/session.js';

/**
 * Access plan Task 6 — the exact-email lookup (owner ruling 5) and the outsider
 * door (owner ruling 3, design (b)), cases 6.202–6.215.
 *
 * Accounts are made the product's way — `signInWithEmail` through the real
 * magic-link door — so `"user".email` and `"emailVerified"` are what better-auth
 * writes, not a fixture's guess.
 */

let db: TestDatabase;
let app: FastifyInstance;
let otp: LogOtpSender;
let magic: LogMagicLinkSender;

beforeAll(async () => {
  db = await createTestDatabase();
  const built = buildTestApp(db);
  app = built.app;
  otp = built.otp;
  magic = built.magic;
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await db.drop();
});

type Caller = { userId: string; headers: { authorization: string } };
let n = 0;
async function byEmail(email: string): Promise<Caller> {
  const u = await signInWithEmail(app, magic, email);
  return { userId: u.userId, headers: { authorization: `Bearer ${u.token}` } };
}
async function byPhone(): Promise<Caller & { phone: string }> {
  n += 1;
  const phone = `+9190016${String(n).padStart(5, '0')}`;
  const u = await signInWithPhone(app, otp, phone);
  return { userId: u.userId, headers: { authorization: `Bearer ${u.token}` }, phone };
}

async function post(caller: Caller, url: string, payload: unknown) {
  return app.inject({ method: 'POST', url, headers: caller.headers, payload: payload as Record<string, unknown> });
}

async function found(owner: Caller): Promise<string> {
  const res = await post(owner, '/v1/workspaces', { name: 'Convenience Corner' });
  expect(res.statusCode, res.body).toBe(201);
  return (res.json() as { workspaceId: string }).workspaceId;
}

function ev(ws: string, actorId: string, entity: SubmittedEvent['entity'], type: string, payload: unknown): SubmittedEvent {
  return { id: newUlid(), workspaceId: ws, entity, type, version: 1, payload, actorId, origin: 'web', clientTime: new Date().toISOString() };
}

async function submit(caller: Caller, events: SubmittedEvent[]) {
  const res = await post(caller, '/v1/events', { events });
  return (res.json() as { results: Array<{ status: string; reason?: string }> }).results;
}

/** Joins `who` at `role` the way the product does: an admin's invitation, accepted. */
async function join(owner: Caller, ws: string, who: Caller, role: 'admin' | 'member' | 'guest'): Promise<void> {
  const minted = await post(owner, `/v1/workspaces/${ws}/invites`, { address: `${who.userId}@join.test`, channel: 'phone', role });
  expect(minted.statusCode, minted.body).toBe(201);
  const token = (minted.json() as { url: string }).url.slice(`${TEST_WEB_ORIGIN}/invite/`.length);
  const accepted = await app.inject({ method: 'POST', url: `/v1/invites/${token}/accept`, headers: who.headers });
  expect(accepted.statusCode, accepted.body).toBe(200);
}

async function project(owner: Caller, ws: string): Promise<string> {
  const id = newUlid();
  const [r] = await submit(owner, [ev(ws, owner.userId, { kind: 'project', id }, 'project.created', { name: 'Stock' })]);
  expect(r?.status).toBe('committed');
  return id;
}

async function ticket(caller: Caller, ws: string, projectId: string, title: string): Promise<string> {
  const id = newUlid();
  const [r] = await submit(caller, [
    ev(ws, caller.userId, { kind: 'ticket', id }, 'ticket.created', { typeId: 'task', projectId, parentId: null, title }),
  ]);
  expect(r?.status, JSON.stringify(r)).toBe('committed');
  return id;
}

async function roleOf(ws: string, userId: string): Promise<string | null> {
  const { rows } = await db.pool.query<{ role: string }>(
    `SELECT role FROM proj_memberships WHERE workspace_id = $1 AND user_id = $2 AND scope_kind = 'workspace'`,
    [ws, userId],
  );
  return rows[0]?.role ?? null;
}

async function membershipEvents(ws: string, userId: string): Promise<string[]> {
  const { rows } = await db.pool.query<{ type: string }>(
    `SELECT type FROM events WHERE workspace_id = $1 AND entity_kind = 'membership' AND payload->>'userId' = $2 ORDER BY workspace_seq`,
    [ws, userId],
  );
  return rows.map((r) => r.type);
}

const lookup = (caller: Caller, ws: string, email: string) => post(caller, `/v1/workspaces/${ws}/people-lookup`, { email });
const outsider = (caller: Caller, ws: string, userId: string, event: SubmittedEvent) =>
  post(caller, `/v1/workspaces/${ws}/assign-outsider`, { userId, event });

describe('6.202–6.207 POST …/people-lookup', () => {
  it('6.202 exact, case-insensitive, trimmed; CONTROL: names that account', async () => {
    const owner = await byPhone();
    const ws = await found(owner);
    const anselma = await byEmail('anselma@example.test');
    const res = await lookup(owner, ws, '  ANSELMA@Example.TEST ');
    expect(res.statusCode, res.body).toBe(200);
    expect((res.json() as { user: { userId: string } | null }).user?.userId).toBe(anselma.userId);
  });

  it('6.203 a partial email finds nothing; CONTROL: the full one does', async () => {
    const owner = await byPhone();
    const ws = await found(owner);
    await byEmail('balti@example.test');
    for (const partial of ['balti@example', 'balti', '@example.test']) {
      expect((await lookup(owner, ws, partial)).json()).toEqual({ user: null });
    }
    expect((await lookup(owner, ws, 'balti@example.test')).json()).not.toEqual({ user: null });
  });

  it('6.204 exactly four fields (no role, R2); CONTROL: a stranger is inWorkspace false', async () => {
    const owner = await byPhone();
    const ws = await found(owner);
    const dipu = await byEmail('dipu@example.test');
    const { user } = (await lookup(owner, ws, 'dipu@example.test')).json() as { user: Record<string, unknown> };
    expect(Object.keys(user).sort()).toEqual(['email', 'inWorkspace', 'name', 'userId']);
    expect(user).toMatchObject({ userId: dipu.userId, email: 'dipu@example.test', inWorkspace: false });
  });

  it('6.205 a non-member gets the shared 404; CONTROL: a member of the workspace may look up', async () => {
    const owner = await byPhone();
    const ws = await found(owner);
    const stranger = await byPhone();
    await byEmail('era@example.test');
    for (const email of ['era@example.test', 'nobody@example.test']) {
      const res = await lookup(stranger, ws, email);
      expect(res.statusCode).toBe(404);
      expect(res.json()).toEqual(READ_NOT_FOUND_BODY);
    }
    const member = await byPhone();
    await join(owner, ws, member, 'member');
    expect((await lookup(member, ws, 'era@example.test')).statusCode).toBe(200);
  });

  it('6.206 a member comes back inWorkspace true (no role, R2); CONTROL: a non-member false', async () => {
    const owner = await byPhone();
    const ws = await found(owner);
    const fern = await byEmail('fern@example.test');
    await join(owner, ws, fern, 'member');
    await byEmail('gita@example.test');
    expect((await lookup(owner, ws, 'fern@example.test')).json()).toMatchObject({ user: { inWorkspace: true } });
    expect((await lookup(owner, ws, 'gita@example.test')).json()).toMatchObject({ user: { inWorkspace: false } });
  });

  it('6.207 a synthetic phone address never matches; CONTROL: a real address does', async () => {
    const owner = await byPhone();
    const ws = await found(owner);
    const phoneUser = await byPhone();
    const { rows } = await db.pool.query<{ email: string }>('SELECT "email" FROM "user" WHERE "id" = $1', [phoneUser.userId]);
    // Verified on purpose: the `emailVerified` filter would otherwise answer
    // null by itself and leave the synthetic-address guard unproven (mutation
    // 6.207 survived until this line was added).
    await db.pool.query('UPDATE "user" SET "emailVerified" = true WHERE "id" = $1', [phoneUser.userId]);
    expect((await lookup(owner, ws, rows[0]!.email)).json()).toEqual({ user: null });
    await byEmail('hema@example.test');
    expect((await lookup(owner, ws, 'hema@example.test')).json()).not.toEqual({ user: null });
  });
});

describe('6.208–6.215 POST …/assign-outsider', () => {
  async function scene() {
    const owner = await byPhone();
    const ws = await found(owner);
    const member = await byPhone();
    await join(owner, ws, member, 'member');
    const prj = await project(owner, ws);
    const mine = await ticket(member, ws, prj, 'Count the float');
    const sibling = await ticket(member, ws, prj, 'Order the tent');
    const out = await byEmail(`out-${newUlid().toLowerCase()}@example.test`);
    return { owner, ws, member, prj, mine, sibling, out };
  }
  const assign = (ws: string, actor: Caller, ticketId: string, assigneeId: string) =>
    ev(ws, actor.userId, { kind: 'ticket', id: ticketId }, 'ticket.assigned', { assigneeId });

  it('6.208 a MEMBER pulls an outsider in: guest + assigned, sees that ticket only; CONTROL: 200 committed', async () => {
    const s = await scene();
    const res = await outsider(s.member, s.ws, s.out.userId, assign(s.ws, s.member, s.mine, s.out.userId));
    expect(res.statusCode, res.body).toBe(200);
    expect((res.json() as { result: { status: string } }).result.status).toBe('committed');
    expect(await roleOf(s.ws, s.out.userId)).toBe('guest');
    expect(await canSee(db.pool, s.out.userId, s.mine)).toBe(true);
    expect(await canSee(db.pool, s.out.userId, s.sibling)).toBe(false);
  });

  it('6.209 the same member’s stand-alone grant is still refused; CONTROL: the door granted one', async () => {
    const s = await scene();
    await outsider(s.member, s.ws, s.out.userId, assign(s.ws, s.member, s.mine, s.out.userId));
    const other = await byEmail(`other-${newUlid().toLowerCase()}@example.test`);
    const [r] = await submit(s.member, [
      ev(s.ws, s.member.userId, { kind: 'membership', id: `${s.ws}:${other.userId}` }, 'membership.granted', {
        userId: other.userId,
        role: 'guest',
      }),
    ]);
    expect(r?.status).toBe('refused');
    expect(await roleOf(s.ws, other.userId)).toBeNull();
    expect(await roleOf(s.ws, s.out.userId)).toBe('guest');
  });

  it('6.210 a ticket.created naming the outsider: guest granted, ticket born assigned', async () => {
    const s = await scene();
    const id = newUlid();
    const born = ev(s.ws, s.member.userId, { kind: 'ticket', id }, 'ticket.created', {
      typeId: 'task',
      projectId: s.prj,
      parentId: null,
      title: 'Collect the rent',
      assigneeId: s.out.userId,
    });
    const res = await outsider(s.member, s.ws, s.out.userId, born);
    expect(res.statusCode, res.body).toBe(200);
    expect(await roleOf(s.ws, s.out.userId)).toBe('guest');
    const { rows } = await db.pool.query<{ assignee_id: string }>('SELECT assignee_id FROM proj_tickets WHERE ticket_id = $1', [id]);
    expect(rows).toEqual([{ assignee_id: s.out.userId }]);
  });

  it('6.211 a caller the gate refuses gets its refusal and nothing is granted; CONTROL: the reason', async () => {
    const s = await scene();
    // Explicit to the owner alone: the member cannot see it.
    const hidden = await ticket(s.owner, s.ws, s.prj, 'Salary review');
    const [v] = await submit(s.owner, [
      ev(s.ws, s.owner.userId, { kind: 'ticket', id: hidden }, 'visibility.set', { ticketId: hidden, mode: 'explicit', userIds: [s.owner.userId] }),
    ]);
    expect(v?.status).toBe('committed');
    const res = await outsider(s.member, s.ws, s.out.userId, assign(s.ws, s.member, hidden, s.out.userId));
    expect(res.statusCode).toBe(422);
    expect((res.json() as { result: { reason: string } }).result.reason).toBe(TICKET_NOT_VISIBLE_REASON);
    expect(await roleOf(s.ws, s.out.userId)).toBeNull();
    expect(await membershipEvents(s.ws, s.out.userId)).toEqual([]);
  });

  it('6.212 a refusal after the grant is compensated; CONTROL: 422', async () => {
    const s = await scene();
    const [d] = await submit(s.owner, [ev(s.ws, s.owner.userId, { kind: 'ticket', id: s.mine }, 'ticket.deleted', {})]);
    expect(d?.status, JSON.stringify(d)).toBe('committed');
    const res = await outsider(s.member, s.ws, s.out.userId, assign(s.ws, s.member, s.mine, s.out.userId));
    expect(res.statusCode).toBe(422);
    expect(await roleOf(s.ws, s.out.userId)).toBeNull();
    expect(await membershipEvents(s.ws, s.out.userId)).toEqual(['membership.granted', 'membership.revoked']);
  });

  it('6.213 a mismatched event is 400 and appends nothing; CONTROL: the well-formed twin commits', async () => {
    const s = await scene();
    const good = assign(s.ws, s.member, s.mine, s.out.userId);
    const bad: SubmittedEvent[] = [
      { ...good, id: newUlid(), payload: { assigneeId: s.owner.userId } },
      { ...good, id: newUlid(), actorId: s.owner.userId },
      { ...good, id: newUlid(), workspaceId: newUlid() },
      { ...good, id: newUlid(), type: 'ticket.collaborator_added', payload: { userId: s.out.userId } },
    ];
    for (const event of bad) {
      expect((await outsider(s.member, s.ws, s.out.userId, event)).statusCode, JSON.stringify(event)).toBe(400);
    }
    expect(await membershipEvents(s.ws, s.out.userId)).toEqual([]);
    expect((await outsider(s.member, s.ws, s.out.userId, good)).statusCode).toBe(200);
  });

  it('6.214 an existing member is not re-granted — never demoted; CONTROL: no grant appended', async () => {
    const s = await scene();
    const before = await membershipEvents(s.ws, s.member.userId);
    const res = await outsider(s.owner, s.ws, s.member.userId, assign(s.ws, s.owner, s.sibling, s.member.userId));
    expect(res.statusCode, res.body).toBe(200);
    expect(await roleOf(s.ws, s.member.userId)).toBe('member');
    expect(await membershipEvents(s.ws, s.member.userId)).toEqual(before);
  });

  it('6.215 no such account: 422 and nothing appended; CONTROL: a real account proceeds', async () => {
    const s = await scene();
    const ghost = newUlid();
    const res = await outsider(s.member, s.ws, ghost, assign(s.ws, s.member, s.mine, ghost));
    expect(res.statusCode).toBe(422);
    expect((res.json() as { result: { reason: string } }).result.reason).toBe(NO_ACCOUNT_REASON);
    expect(await membershipEvents(s.ws, ghost)).toEqual([]);
    expect((await outsider(s.member, s.ws, s.out.userId, assign(s.ws, s.member, s.mine, s.out.userId))).statusCode).toBe(200);
  });
});

// The gate's sentence, imported so 6.208's mutation RED names it verbatim.
void NAMED_PERSON_NOT_IN_WORKSPACE_REASON;

describe('6.240–6.241 R2 — no role, no guests', () => {
  const emailOf = async (who: Caller) =>
    (await db.pool.query<{ email: string }>('SELECT "email" FROM "user" WHERE "id" = $1', [who.userId])).rows[0]!.email;

  it('6.240 a guest caller gets the shared 404; CONTROL: a member gets the account', async () => {
    const owner = await byEmail(`owner-${newUlid()}@example.test`);
    const ws = await found(owner);
    const guest = await byEmail(`guest-${newUlid()}@example.test`);
    const member = await byEmail(`member-${newUlid()}@example.test`);
    const target = await byEmail(`target-${newUlid()}@example.test`);
    await join(owner, ws, guest, 'guest');
    await join(owner, ws, member, 'member');
    const targetEmail = await emailOf(target);

    const refused = await lookup(guest, ws, targetEmail);
    expect(refused.statusCode).toBe(404);
    expect(refused.json()).toEqual(READ_NOT_FOUND_BODY);
    // CONTROL — same address, a member caller.
    const ok = await lookup(member, ws, targetEmail);
    expect(ok.statusCode).toBe(200);
    expect((ok.json() as { user: { userId: string } }).user.userId).toBe(target.userId);
  });

  it('6.241 exactly four keys, no role; CONTROL: inWorkspace tells member from stranger', async () => {
    const owner = await byEmail(`owner-${newUlid()}@example.test`);
    const ws = await found(owner);
    const member = await byEmail(`m-${newUlid()}@example.test`);
    const stranger = await byEmail(`s-${newUlid()}@example.test`);
    await join(owner, ws, member, 'member');
    for (const [who, inWorkspace] of [[member, true], [stranger, false]] as const) {
      const { user } = (await lookup(owner, ws, await emailOf(who))).json() as { user: Record<string, unknown> };
      expect(Object.keys(user).sort()).toEqual(['email', 'inWorkspace', 'name', 'userId']);
      expect(user['inWorkspace']).toBe(inWorkspace);
    }
  });
});
