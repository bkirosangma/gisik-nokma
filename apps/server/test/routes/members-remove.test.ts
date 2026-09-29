import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid, type SubmittedEvent } from '@gisik-nokma/domain';
import type { FastifyInstance } from 'fastify';
import type { LogMagicLinkSender } from '../../src/auth/magic-link-sender.js';
import type { LogOtpSender } from '../../src/auth/otp-sender.js';
import { READ_NOT_FOUND_BODY } from '../../src/read/membership.js';
import { canSee } from '../../src/visibility/can-see.js';
import { visibleEventsFor, type SyncItem } from '../../src/visibility/visible-events-for.js';
import { buildTestApp, TEST_WEB_ORIGIN } from '../helpers/app.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { signInWithEmail, signInWithPhone } from '../helpers/session.js';

/**
 * Access follow-ups R5 — `POST /v1/workspaces/:workspaceId/members/:userId/remove`,
 * cases 6.280–6.286 (the Members page is 6.287–6.288, `apps/web/test/members-page.test.tsx`).
 *
 * Accounts are made the product's way (`signInWithEmail` through the real
 * magic-link door), so `"user"."email"` and `"emailVerified"` are what
 * better-auth writes. The route's events are read back from the ledger.
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

type Caller = { userId: string; headers: { authorization: string }; phone?: string; email?: string };
let n = 0;
async function byEmail(local: string): Promise<Caller> {
  const email = `${local}-${newUlid().toLowerCase()}@example.test`;
  const u = await signInWithEmail(app, magic, email);
  return { userId: u.userId, headers: { authorization: `Bearer ${u.token}` }, email };
}
async function byPhone(): Promise<Caller & { phone: string }> {
  n += 1;
  const phone = `+9190017${String(n).padStart(5, '0')}`;
  const u = await signInWithPhone(app, otp, phone);
  return { userId: u.userId, headers: { authorization: `Bearer ${u.token}` }, phone };
}

const post = (caller: Caller, url: string, payload: unknown) =>
  app.inject({ method: 'POST', url, headers: caller.headers, payload: payload as Record<string, unknown> });
const get = (caller: Caller, url: string) => app.inject({ method: 'GET', url, headers: caller.headers });

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
  return (res.json() as { results: Array<{ status: string; rule?: string; reason?: string }> }).results;
}

/** Joins `who` at `role` the way the product does: an admin's invitation, accepted. */
async function join(owner: Caller, ws: string, who: Caller, role: 'admin' | 'member' | 'guest'): Promise<void> {
  const addressed = who.phone !== undefined
    ? { channel: 'phone', address: who.phone }
    : { channel: 'email', address: who.email ?? '' };
  const minted = await post(owner, `/v1/workspaces/${ws}/invites`, { ...addressed, role });
  expect(minted.statusCode, minted.body).toBe(201);
  const token = (minted.json() as { url: string }).url.slice(`${TEST_WEB_ORIGIN}/invite/`.length);
  const accepted = await app.inject({ method: 'POST', url: `/v1/invites/${token}/accept`, headers: who.headers });
  expect(accepted.statusCode, accepted.body).toBe(200);
}

async function makeOwner(owner: Caller, ws: string, who: Caller): Promise<void> {
  const [r] = await submit(owner, [
    ev(ws, owner.userId, { kind: 'membership', id: `${ws}:${who.userId}` }, 'membership.granted', { userId: who.userId, role: 'owner' }),
  ]);
  expect(r?.status, JSON.stringify(r)).toBe('committed');
}

async function project(owner: Caller, ws: string): Promise<string> {
  const id = newUlid();
  const [r] = await submit(owner, [ev(ws, owner.userId, { kind: 'project', id }, 'project.created', { name: 'Stock' })]);
  expect(r?.status).toBe('committed');
  return id;
}

async function ticket(caller: Caller, ws: string, projectId: string, title: string, parentId: string | null = null, typeId = 'task'): Promise<string> {
  const id = newUlid();
  const [r] = await submit(caller, [
    ev(ws, caller.userId, { kind: 'ticket', id }, 'ticket.created', { typeId, projectId, parentId, title }),
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

async function eventCount(ws: string): Promise<number> {
  const { rows } = await db.pool.query<{ n: string }>('SELECT count(*)::text AS n FROM events WHERE workspace_id = $1', [ws]);
  return Number(rows[0]!.n);
}

async function eventsOfType(ws: string, type: string): Promise<Array<{ actor_id: string; payload: Record<string, unknown> }>> {
  const { rows } = await db.pool.query<{ actor_id: string; payload: Record<string, unknown> }>(
    'SELECT actor_id, payload FROM events WHERE workspace_id = $1 AND type = $2 ORDER BY workspace_seq',
    [ws, type],
  );
  return rows;
}

const remove = (caller: Caller, ws: string, userId: string) => post(caller, `/v1/workspaces/${ws}/members/${userId}/remove`, {});

async function collect(userId: string, ws: string, afterSeq: number): Promise<SyncItem[]> {
  const items: SyncItem[] = [];
  for await (const item of visibleEventsFor(db.pool, userId, ws, afterSeq)) items.push(item);
  return items;
}
async function headSeq(ws: string): Promise<number> {
  const { rows } = await db.pool.query<{ m: string | null }>('SELECT max(workspace_seq)::text AS m FROM events WHERE workspace_id = $1', [ws]);
  return Number(rows[0]?.m ?? 0);
}

describe('6.280 an admin removes a member', () => {
  it('6.280 attributed to the ADMIN, role null, and the next read answers what a non-member gets; CONTROL: another member untouched', async () => {
    const owner = await byEmail('o');
    const ws = await found(owner);
    const admin = await byEmail('a');
    const gone = await byEmail('g');
    const stays = await byEmail('s');
    await join(owner, ws, admin, 'admin');
    await join(owner, ws, gone, 'member');
    await join(owner, ws, stays, 'member');
    const prj = await project(owner, ws);
    const t = await ticket(owner, ws, prj, 'Count the float');
    const stranger = await byPhone();

    // Before: the same reads succeed for them.
    const before = await get(gone, `/v1/workspaces/${ws}/tickets`);
    expect(before.statusCode).toBe(200);
    expect(before.body).toContain(t);
    expect((await get(gone, '/v1/me/workspaces')).body).toContain(ws);
    const cursor = await headSeq(ws);

    const res = await remove(admin, ws, gone.userId);
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json()).toEqual({ revoked: true, invitesWithdrawn: 0 });
    expect(await roleOf(ws, gone.userId)).toBeNull();
    expect(await eventsOfType(ws, 'membership.revoked')).toEqual([{ actor_id: admin.userId, payload: { userId: gone.userId } }]);
    expect(await roleOf(ws, stays.userId)).toBe('member'); // control

    // The account survives and may still hold cookies: their reads are a stranger's reads.
    for (const path of [`/v1/workspaces/${ws}/tickets`, `/v1/workspaces/${ws}/members`, `/v1/workspaces/${ws}/actor-names`]) {
      const asGone = await get(gone, path);
      const asStranger = await get(stranger, path);
      expect([path, asGone.statusCode, asGone.body]).toEqual([path, asStranger.statusCode, asStranger.body]);
    }
    expect((await get(gone, `/v1/workspaces/${ws}/members`)).json()).toEqual(READ_NOT_FOUND_BODY);
    expect((await get(gone, '/v1/me/workspaces')).body).not.toContain(ws);
    expect(await canSee(db.pool, gone.userId, t)).toBe(false);
    // Sync-down: one `scope-revoked` for the device they leave behind, then nothing.
    expect(await collect(gone.userId, ws, cursor)).toEqual([{ kind: 'scope-revoked', workspaceId: ws }]);
    expect(await collect(gone.userId, ws, await headSeq(ws))).toEqual([]);
  });
});

describe('6.281 who may remove', () => {
  it('6.281 a member, a guest, a non-member and no session all get the shared refusal and nothing is appended; CONTROL: the owner’s identical call succeeds', async () => {
    const owner = await byEmail('o');
    const ws = await found(owner);
    const member = await byEmail('m');
    const guest = await byEmail('gu');
    const target = await byEmail('t');
    const stranger = await byPhone();
    await join(owner, ws, member, 'member');
    await join(owner, ws, guest, 'guest');
    await join(owner, ws, target, 'member');
    const before = await eventCount(ws);

    for (const who of [member, guest, stranger]) {
      const res = await remove(who, ws, target.userId);
      expect([who.userId, res.statusCode, res.json()]).toEqual([who.userId, 404, READ_NOT_FOUND_BODY]);
    }
    const anon = await app.inject({ method: 'POST', url: `/v1/workspaces/${ws}/members/${target.userId}/remove`, payload: {} });
    expect(anon.statusCode).toBe(401); // requireSession answers first, as at every other route
    expect(await eventCount(ws)).toBe(before);
    expect(await roleOf(ws, target.userId)).toBe('member');

    const res = await remove(owner, ws, target.userId); // control
    expect(res.statusCode, res.body).toBe(200);
    expect(await roleOf(ws, target.userId)).toBeNull();
  });

  it('6.281 removing someone who is not a member here is the shared 404 and appends nothing; CONTROL: a real member is removed', async () => {
    const owner = await byEmail('o');
    const ws = await found(owner);
    const outsider = await byEmail('x');
    const real = await byEmail('r');
    await join(owner, ws, real, 'member');
    const before = await eventCount(ws);
    const res = await remove(owner, ws, outsider.userId);
    expect([res.statusCode, res.json()]).toEqual([404, READ_NOT_FOUND_BODY]);
    expect(res.json()).not.toHaveProperty('message'); // the route's own 404, not fastify's no-such-route
    expect(await eventCount(ws)).toBe(before);
    expect((await remove(owner, ws, real.userId)).statusCode).toBe(200);
  });

  it('6.282 an admin removing an OWNER is refused 409 in the gate’s own words and nothing is appended; CONTROL: the owner’s identical call removes that owner', async () => {
    const owner = await byEmail('o');
    const ws = await found(owner);
    const admin = await byEmail('a');
    const second = await byEmail('s');
    await join(owner, ws, admin, 'admin');
    await join(owner, ws, second, 'member');
    await makeOwner(owner, ws, second);
    const before = await eventCount(ws);

    const res = await remove(admin, ws, second.userId);
    expect(res.statusCode, res.body).toBe(409);
    expect(res.json()).toEqual({ rule: 'remove-owner-requires-owner', reason: 'Only a workspace owner can remove the owner role from a member.' });
    expect(await eventCount(ws)).toBe(before);
    expect(await roleOf(ws, second.userId)).toBe('owner');

    const control = await remove(owner, ws, second.userId);
    expect(control.statusCode, control.body).toBe(200);
    expect(await roleOf(ws, second.userId)).toBeNull();
  });

  it('6.281 an admin removing THEMSELVES: the gate lets anyone leave, the membership goes, and an invitation the admin can no longer revoke is REPORTED, not a 500; CONTROL: it stays pending', async () => {
    const owner = await byEmail('o');
    const ws = await found(owner);
    const admin = await byEmail('a');
    await join(owner, ws, admin, 'admin');
    const minted = await post(owner, `/v1/workspaces/${ws}/invites`, { channel: 'email', address: admin.email, role: 'member' });
    expect(minted.statusCode, minted.body).toBe(201);

    const res = await remove(admin, ws, admin.userId);
    expect(res.statusCode, res.body).toBe(200);
    const body = res.json() as { revoked: boolean; invitesWithdrawn: number; invitesNotWithdrawn?: Array<{ inviteId: string; reason: string }> };
    expect(body.revoked).toBe(true);
    expect(body.invitesWithdrawn).toBe(0);
    expect(body.invitesNotWithdrawn).toHaveLength(1);
    expect(body.invitesNotWithdrawn![0]!.reason).not.toBe('');
    expect(await roleOf(ws, admin.userId)).toBeNull();
    const { rows } = await db.pool.query<{ status: string }>('SELECT status FROM proj_invites WHERE invite_id = $1', [body.invitesNotWithdrawn![0]!.inviteId]);
    expect(rows).toEqual([{ status: 'pending' }]);
  });
});

describe('6.282 the gate decides the last owner', () => {
  it('6.282 removing the LAST owner is 409 with the guard’s own rule and reason (the events door’s words), and nothing is appended; CONTROL: with a second owner the same call succeeds', async () => {
    const owner = await byEmail('o');
    const ws = await found(owner);
    const second = await byEmail('s');
    await join(owner, ws, second, 'member');
    await makeOwner(owner, ws, second);

    // CONTROL: two owners, one may go.
    const ok = await remove(owner, ws, second.userId);
    expect(ok.statusCode, ok.body).toBe(200);
    expect(await roleOf(ws, second.userId)).toBeNull();

    // Now `owner` is the sole owner, with an invitation pending to their own address:
    // a refusal must touch NOTHING, the invitation included (the membership goes first).
    const pendingToOwner = await post(owner, `/v1/workspaces/${ws}/invites`, { channel: 'email', address: owner.email, role: 'member' });
    expect(pendingToOwner.statusCode, pendingToOwner.body).toBe(201);
    const before = await eventCount(ws);
    const res = await remove(owner, ws, owner.userId);
    expect(res.statusCode, res.body).toBe(409);
    const body = res.json() as { rule: string; reason: string };
    const [direct] = await submit(owner, [
      ev(ws, owner.userId, { kind: 'membership', id: `${ws}:${owner.userId}` }, 'membership.revoked', { userId: owner.userId }),
    ]);
    expect(direct).toMatchObject({ status: 'refused', rule: 'last-owner' });
    expect(body).toEqual({ rule: direct?.rule, reason: direct?.reason });
    expect(body.reason.length).toBeGreaterThan(10);
    expect(await eventCount(ws)).toBe(before);
    expect(await roleOf(ws, owner.userId)).toBe('owner');
    const { rows: still } = await db.pool.query<{ status: string }>(
      `SELECT status FROM proj_invites WHERE workspace_id = $1 AND address = $2 ORDER BY invited_at DESC LIMIT 1`, [ws, owner.email]);
    expect(still).toEqual([{ status: 'pending' }]);
  });
});

describe('6.283 the removed person’s pending invitations are withdrawn', () => {
  async function mint(caller: Caller, ws: string, channel: 'email' | 'phone', address: string): Promise<string> {
    const res = await post(caller, `/v1/workspaces/${ws}/invites`, { channel, address, role: 'member' });
    expect(res.statusCode, res.body).toBe(201);
    const { rows } = await db.pool.query<{ invite_id: string }>(
      `SELECT invite_id FROM proj_invites WHERE workspace_id = $1 AND address = $2 AND status = 'pending'`,
      [ws, address],
    );
    return rows[0]!.invite_id;
  }
  async function statusOf(inviteId: string): Promise<string> {
    const { rows } = await db.pool.query<{ status: string }>('SELECT status FROM proj_invites WHERE invite_id = $1', [inviteId]);
    return rows[0]!.status;
  }

  it('6.283 email (case-insensitive) and phone (digits) match, by the caller; CONTROL: another address, another workspace, an accepted, a revoked and an UNVERIFIED-address invitation are untouched', async () => {
    const owner = await byEmail('o');
    const ws = await found(owner);
    const ws2 = await found(owner);
    const admin = await byEmail('a');
    const gone = await byEmail('g');
    const unv = await byEmail('u');
    await join(owner, ws, admin, 'admin');
    await join(owner, ws, gone, 'member'); // leaves one ACCEPTED invitation to their email
    await join(owner, ws, unv, 'member');
    const phone = `+9190018${String(Date.now()).slice(-5)}`;
    await db.pool.query(`UPDATE "user" SET "phoneNumber" = $2, "phoneNumberVerified" = true WHERE "id" = $1`, [gone.userId, phone]);
    await db.pool.query(`UPDATE "user" SET "emailVerified" = false WHERE "id" = $1`, [unv.userId]);

    const accepted = (await db.pool.query<{ invite_id: string }>(
      `SELECT invite_id FROM proj_invites WHERE workspace_id = $1 AND address = $2 AND status = 'accepted'`, [ws, gone.email])).rows[0]!.invite_id;
    const revoked = await mint(owner, ws, 'email', gone.email!);
    const [rv] = await submit(owner, [ev(ws, owner.userId, { kind: 'invite', id: revoked }, 'invite.revoked', { inviteId: revoked })]);
    expect(rv?.status).toBe('committed');

    const byEmailUpper = await mint(owner, ws, 'email', gone.email!.toUpperCase());
    const byPhone = await mint(owner, ws, 'phone', phone.replace('+91', '+91 ').replace(/(\d{3})(\d{4})$/, '$1-$2'));
    const other = await mint(owner, ws, 'email', `someone-else-${newUlid().toLowerCase()}@example.test`);
    const elsewhere = await mint(owner, ws2, 'email', gone.email!);
    const unverified = await mint(owner, ws, 'email', unv.email!);

    const res = await remove(admin, ws, gone.userId);
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json()).toEqual({ revoked: true, invitesWithdrawn: 2 });

    expect(await statusOf(byEmailUpper)).toBe('revoked');
    expect(await statusOf(byPhone)).toBe('revoked');
    const revokes = await eventsOfType(ws, 'invite.revoked');
    expect(revokes.filter((r) => r.actor_id === admin.userId).map((r) => r.payload['inviteId']).sort()).toEqual([byEmailUpper, byPhone].sort());

    expect(await statusOf(other)).toBe('pending');
    expect(await statusOf(elsewhere)).toBe('pending');
    expect(await statusOf(accepted)).toBe('accepted');
    expect(await statusOf(revoked)).toBe('revoked'); // was already, and no second event
    expect(revokes.filter((r) => r.payload['inviteId'] === revoked)).toHaveLength(1);

    // An unverified address is not the person's: removing them leaves it pending.
    expect((await remove(owner, ws, unv.userId)).json()).toEqual({ revoked: true, invitesWithdrawn: 0 });
    expect(await statusOf(unverified)).toBe('pending');
  });
});

describe('6.284 history stays', () => {
  it('6.284 every event the person authored is still in the ledger and their ticket still exists; CONTROL: the count of their events is unchanged by the removal', async () => {
    const owner = await byEmail('o');
    const ws = await found(owner);
    const gone = await byEmail('g');
    await join(owner, ws, gone, 'member');
    const prj = await project(owner, ws);
    const t = await ticket(gone, ws, prj, 'Their ticket');
    const authored = async () =>
      Number((await db.pool.query<{ n: string }>('SELECT count(*)::text AS n FROM events WHERE workspace_id = $1 AND actor_id = $2', [ws, gone.userId])).rows[0]!.n);
    const before = await authored();
    expect(before).toBeGreaterThan(0);

    expect((await remove(owner, ws, gone.userId)).statusCode).toBe(200);
    expect(await authored()).toBe(before);
    const { rows } = await db.pool.query('SELECT 1 FROM proj_tickets WHERE ticket_id = $1', [t]);
    expect(rows).toHaveLength(1);
  });
});

describe('6.285 the removed person is still named', () => {
  it('6.285 /actor-names serves them with removed: true and their name; CONTROL: before removal the same read has no removed', async () => {
    const owner = await byEmail('o');
    const ws = await found(owner);
    const gone = await byEmail('g');
    await join(owner, ws, gone, 'member');
    await db.pool.query(`UPDATE "user" SET "name" = 'Gone Person' WHERE "id" = $1`, [gone.userId]);
    const names = async () => ((await get(owner, `/v1/workspaces/${ws}/actor-names`)).json() as { names: Array<{ userId: string; name: string; removed?: boolean }> }).names;
    const before = (await names()).find((x) => x.userId === gone.userId);
    expect(before).toBeDefined();
    expect(before?.removed).toBeUndefined();

    expect((await remove(owner, ws, gone.userId)).statusCode).toBe(200);
    const after = (await names()).find((x) => x.userId === gone.userId);
    expect(after).toMatchObject({ userId: gone.userId, removed: true });
    expect(after?.name).toBe(before?.name);
  });
});

describe('6.286 the removed person reaches nothing through the assignee arm', () => {
  it('6.286 not their assigned ticket, not its inheriting child; CONTROL: proj_tickets still names them and they saw both before', async () => {
    const owner = await byEmail('o');
    const ws = await found(owner);
    const gone = await byEmail('g');
    await join(owner, ws, gone, 'guest');
    const prj = await project(owner, ws);
    const assigned = await ticket(owner, ws, prj, 'Assigned', null, 'epic');
    const child = await ticket(owner, ws, prj, 'Child', assigned);
    const sibling = await ticket(owner, ws, prj, 'Sibling');
    const [a] = await submit(owner, [ev(ws, owner.userId, { kind: 'ticket', id: assigned }, 'ticket.assigned', { assigneeId: gone.userId })]);
    expect(a?.status, JSON.stringify(a)).toBe('committed');
    expect(await canSee(db.pool, gone.userId, assigned)).toBe(true);
    expect(await canSee(db.pool, gone.userId, child)).toBe(true);
    expect(await canSee(db.pool, gone.userId, sibling)).toBe(false);

    expect((await remove(owner, ws, gone.userId)).statusCode).toBe(200);
    const { rows } = await db.pool.query<{ assignee_id: string }>('SELECT assignee_id FROM proj_tickets WHERE ticket_id = $1', [assigned]);
    expect(rows).toEqual([{ assignee_id: gone.userId }]); // control: still assigned, and marked removed by the names read
    expect(await canSee(db.pool, gone.userId, assigned)).toBe(false);
    expect(await canSee(db.pool, gone.userId, child)).toBe(false);
  });
});
