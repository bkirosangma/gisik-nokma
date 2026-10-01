import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid } from '@gisik-nokma/domain';
import type { FastifyInstance } from 'fastify';
import type { LogMagicLinkSender } from '../../src/auth/magic-link-sender.js';
import type { LogOtpSender } from '../../src/auth/otp-sender.js';
import type { InviteEmail, InviteMailer } from '../../src/invites/invite-mailer.js';
import { buildTestApp, TEST_WEB_ORIGIN } from '../helpers/app.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { signInWithEmail, signInWithPhone } from '../helpers/session.js';

/**
 * **A second invitation to an address that already has a pending one ROTATES
 * that invitation's token instead of minting another** (fix-now batch S4, owner
 * rulings 2026-09-29 evening; spec §7).
 *
 * Tokens are stored HASHED, so the original link cannot be re-emailed:
 * "re-send" means a fresh token on the existing invite, and the old link stops
 * opening anything. The dedupe runs only after the SAME gate `invite.sent`
 * meets in ingest (a dry `checkPermission`), and only one request at a time per
 * (workspace, channel, address) may be inside the check-and-mint.
 */

let db: TestDatabase;
let app: FastifyInstance;
let otp: LogOtpSender;
let magic: LogMagicLinkSender;
const mailed: InviteEmail[] = [];
const recordingMailer: InviteMailer = {
  send: async (mail) => {
    mailed.push(mail);
  },
};

beforeAll(async () => {
  db = await createTestDatabase();
  const built = buildTestApp(db, { inviteMailer: recordingMailer });
  app = built.app;
  otp = built.otp;
  magic = built.magic;
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await db.drop();
});

type Caller = { userId: string; headers: { authorization: string }; phone: string };
let phoneCounter = 0;

async function signedIn(): Promise<Caller> {
  phoneCounter += 1;
  const phone = `+9190024${String(phoneCounter).padStart(5, '0')}`;
  const user = await signInWithPhone(app, otp, phone);
  return { userId: user.userId, headers: { authorization: `Bearer ${user.token}` }, phone };
}

async function found(owner: Caller): Promise<string> {
  const res = await app.inject({ method: 'POST', url: '/v1/workspaces', headers: owner.headers, payload: { name: 'Dedupe' } });
  expect(res.statusCode, res.body).toBe(201);
  return (res.json() as { workspaceId: string }).workspaceId;
}

type MintBody = { address?: string; channel?: string; role?: string; projectIds?: string[] };
type Minted = { inviteId: string; url: string; expiresAt: string; emailSent: boolean };

function mint(caller: Caller, workspaceId: string, body: MintBody = {}) {
  return app.inject({
    method: 'POST',
    url: `/v1/workspaces/${workspaceId}/invites`,
    headers: caller.headers,
    payload: { address: 'accountant@example.com', channel: 'email', role: 'member', ...body },
  });
}

async function mintOk(caller: Caller, workspaceId: string, body: MintBody = {}): Promise<Minted & { token: string }> {
  const res = await mint(caller, workspaceId, body);
  expect(res.statusCode, res.body).toBe(201);
  const json = res.json() as Minted;
  return { ...json, token: json.url.slice(`${TEST_WEB_ORIGIN}/invite/`.length) };
}

async function joinAs(owner: Caller, workspaceId: string, role: string): Promise<Caller> {
  const joiner = await signedIn();
  // R4: the acceptor is the addressed account — invite the phone the joiner signed in with.
  const { token } = await mintOk(owner, workspaceId, { role, channel: 'phone', address: joiner.phone });
  const res = await app.inject({ method: 'POST', url: `/v1/invites/${token}/accept`, headers: joiner.headers });
  expect(res.statusCode, res.body).toBe(200);
  return joiner;
}

async function tokenHash(inviteId: string): Promise<string | null> {
  const { rows } = await db.pool.query<{ token_hash: string }>('SELECT token_hash FROM invite_tokens WHERE invite_id = $1', [inviteId]);
  return rows[0]?.token_hash ?? null;
}

async function pendingFor(workspaceId: string, address: string): Promise<string[]> {
  const { rows } = await db.pool.query<{ invite_id: string }>(
    `SELECT invite_id FROM proj_invites WHERE workspace_id = $1 AND lower(address) = lower($2) AND status = 'pending' ORDER BY invited_at`,
    [workspaceId, address],
  );
  return rows.map((row) => row.invite_id);
}

async function sentEvents(workspaceId: string): Promise<number> {
  const { rows } = await db.pool.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM events WHERE workspace_id = $1 AND type = 'invite.sent'`,
    [workspaceId],
  );
  return rows[0]?.n ?? 0;
}

const openable = async (token: string) => (await app.inject({ method: 'GET', url: `/v1/invites/${token}` })).statusCode === 200;

async function foundProject(owner: Caller, workspaceId: string, name: string): Promise<string> {
  const projectId = newUlid();
  const res = await app.inject({
    method: 'POST',
    url: '/v1/events',
    headers: owner.headers,
    payload: {
      events: [
        {
          id: newUlid(),
          workspaceId,
          entity: { kind: 'project', id: projectId },
          type: 'project.created',
          version: 1,
          payload: { name },
          actorId: owner.userId,
          origin: 'web',
          clientTime: new Date().toISOString(),
        },
      ],
    },
  });
  expect((res.json() as { results: Array<{ status: string }> }).results[0]?.status, res.body).toBe('committed');
  return projectId;
}

describe('6.222 a repeat invitation rotates the token on the existing invite', () => {
  it('6.222 same inviteId, no new invite.sent, a new working link, the old one opens nothing, the letter is sent again; CONTROL: the first mint created exactly one invite', async () => {
    const owner = await signedIn();
    const workspaceId = await found(owner);
    const first = await mintOk(owner, workspaceId, { address: 'Ana@Example.com' });
    expect(await pendingFor(workspaceId, 'ana@example.com')).toEqual([first.inviteId]);
    const sentBefore = await sentEvents(workspaceId);
    const hashBefore = await tokenHash(first.inviteId);
    mailed.length = 0;

    // Same address in a different case: still the same person.
    const second = await mintOk(owner, workspaceId, { address: 'ana@example.com' });

    expect(second.inviteId).toBe(first.inviteId);
    expect(Object.keys(second).sort()).toEqual(['emailSent', 'expiresAt', 'inviteId', 'token', 'url']);
    expect(second.emailSent).toBe(true);
    expect(second.token).not.toBe(first.token);
    expect(await sentEvents(workspaceId)).toBe(sentBefore);
    expect(await pendingFor(workspaceId, 'ana@example.com')).toEqual([first.inviteId]);
    expect(await tokenHash(first.inviteId)).not.toBe(hashBefore);
    // The old link is dead and the new one opens.
    expect(await openable(first.token)).toBe(false);
    expect(await openable(second.token)).toBe(true);
    // The email carried the NEW link.
    expect(mailed).toHaveLength(1);
    expect(mailed[0]?.url).toBe(second.url);
  });
});

describe('6.223 the dedupe answers to the same gate as a fresh mint', () => {
  it('6.223 a plain member, a guest and a non-member are refused with the ingest layer’s 422 and the stored hash is unchanged; CONTROL: an admin rotates it', async () => {
    const owner = await signedIn();
    const workspaceId = await found(owner);
    const member = await joinAs(owner, workspaceId, 'member');
    const guest = await joinAs(owner, workspaceId, 'guest');
    const outsider = await signedIn();
    const victim = await mintOk(owner, workspaceId, { address: 'victim@example.com' });
    const hash = await tokenHash(victim.inviteId);
    const sent = await sentEvents(workspaceId);

    for (const [label, caller] of [
      ['member', member],
      ['guest', guest],
      ['non-member', outsider],
    ] as const) {
      const res = await mint(caller, workspaceId, { address: 'victim@example.com' });
      expect(res.statusCode, label).toBe(422);
      const refusal = res.json() as { status: string; rule: string; reason: string };
      expect(refusal.status, label).toBe('refused');
      // The same body a fresh (non-matching) address gets from the same caller.
      const fresh = (await mint(caller, workspaceId, { address: `fresh-${label}@example.com` })).json() as typeof refusal;
      expect({ rule: refusal.rule, reason: refusal.reason }, label).toEqual({ rule: fresh.rule, reason: fresh.reason });
      expect(await tokenHash(victim.inviteId), label).toBe(hash);
    }
    expect(await sentEvents(workspaceId)).toBe(sent);
    expect(await openable(victim.token)).toBe(true);

    // CONTROL: an admin's identical request succeeds and the hash changes.
    const admin = await joinAs(owner, workspaceId, 'admin');
    const rotated = await mintOk(admin, workspaceId, { address: 'victim@example.com' });
    expect(rotated.inviteId).toBe(victim.inviteId);
    expect(await tokenHash(victim.inviteId)).not.toBe(hash);
  });
});

describe('6.224 two simultaneous identical requests make ONE invite', () => {
  it('6.224 20 trials, a fresh address each: two 201s, one pending row, one invite.sent; CONTROL: the two answers name the same invite', async () => {
    const owner = await signedIn();
    const workspaceId = await found(owner);
    for (let trial = 0; trial < 20; trial += 1) {
      const address = `race-${trial}@example.com`;
      const sentBefore = await sentEvents(workspaceId);
      const [a, b] = await Promise.all([mint(owner, workspaceId, { address }), mint(owner, workspaceId, { address })]);
      expect([a.statusCode, b.statusCode], `trial ${trial}`).toEqual([201, 201]);
      const rows = await pendingFor(workspaceId, address);
      expect(rows, `trial ${trial}`).toHaveLength(1);
      expect((a.json() as Minted).inviteId, `trial ${trial}`).toBe((b.json() as Minted).inviteId);
      expect(await sentEvents(workspaceId), `trial ${trial}`).toBe(sentBefore + 1);
    }
  });
});

describe('6.225 what is and is not a match', () => {
  it('6.225 an expired token is rotated (new expiry), not duplicated; CONTROL: the row count stays one', async () => {
    const owner = await signedIn();
    const workspaceId = await found(owner);
    const first = await mintOk(owner, workspaceId, { address: 'lapsed@example.com' });
    await db.pool.query(`UPDATE invite_tokens SET expires_at = now() - interval '1 day' WHERE invite_id = $1`, [first.inviteId]);
    expect(await openable(first.token)).toBe(false);

    const second = await mintOk(owner, workspaceId, { address: 'lapsed@example.com' });
    expect(second.inviteId).toBe(first.inviteId);
    expect(Date.parse(second.expiresAt)).toBeGreaterThan(Date.now());
    expect(await openable(second.token)).toBe(true);
    expect(await pendingFor(workspaceId, 'lapsed@example.com')).toHaveLength(1);
  });

  it('6.225 a swept token row (none at all) is recreated by the rotation', async () => {
    const owner = await signedIn();
    const workspaceId = await found(owner);
    const first = await mintOk(owner, workspaceId, { address: 'swept@example.com' });
    await db.pool.query('DELETE FROM invite_tokens WHERE invite_id = $1', [first.inviteId]);
    const second = await mintOk(owner, workspaceId, { address: 'swept@example.com' });
    expect(second.inviteId).toBe(first.inviteId);
    expect(await openable(second.token)).toBe(true);
  });

  it('6.225 an ACCEPTED or REVOKED invite for the address is not matched — a fresh invite is minted; CONTROL: the pending one still is', async () => {
    const owner = await signedIn();
    const workspaceId = await found(owner);
    const accepted = await mintOk(owner, workspaceId, { address: 'gone@example.com' });
    // R4: the acceptor is the addressed account.
    const joinerUser = await signInWithEmail(app, magic, 'gone@example.com');
    const joiner = { headers: { authorization: `Bearer ${joinerUser.token}` } };
    expect((await app.inject({ method: 'POST', url: `/v1/invites/${accepted.token}/accept`, headers: joiner.headers })).statusCode).toBe(200);
    const afterAccept = await mintOk(owner, workspaceId, { address: 'gone@example.com' });
    expect(afterAccept.inviteId).not.toBe(accepted.inviteId);

    const revokedInvite = await mintOk(owner, workspaceId, { address: 'withdrawn@example.com' });
    const revoke = await app.inject({
      method: 'POST',
      url: '/v1/events',
      headers: owner.headers,
      payload: {
        events: [
          {
            id: newUlid(),
            workspaceId,
            entity: { kind: 'invite', id: revokedInvite.inviteId },
            type: 'invite.revoked',
            version: 1,
            payload: { inviteId: revokedInvite.inviteId },
            actorId: owner.userId,
            origin: 'web',
            clientTime: new Date().toISOString(),
          },
        ],
      },
    });
    expect((revoke.json() as { results: Array<{ status: string }> }).results[0]?.status).toBe('committed');
    const afterRevoke = await mintOk(owner, workspaceId, { address: 'withdrawn@example.com' });
    expect(afterRevoke.inviteId).not.toBe(revokedInvite.inviteId);

    // Control: the fresh, pending one IS matched by the next request.
    expect((await mintOk(owner, workspaceId, { address: 'gone@example.com' })).inviteId).toBe(afterAccept.inviteId);
  });

  it('6.225 a different channel or workspace is not a match', async () => {
    const owner = await signedIn();
    const one = await found(owner);
    const two = await found(owner);
    const email = await mintOk(owner, one, { address: '+919812345678', channel: 'email' });
    const phone = await mintOk(owner, one, { address: '+919812345678', channel: 'phone' });
    const other = await mintOk(owner, two, { address: '+919812345678', channel: 'email' });
    expect(new Set([email.inviteId, phone.inviteId, other.inviteId]).size).toBe(3);
  });
});

async function pendingRows(workspaceId: string, address: string): Promise<Array<{ inviteId: string; role: string; projectIds: string[] }>> {
  const { rows } = await db.pool.query<{ invite_id: string; role: string; project_ids: string[] }>(
    `SELECT invite_id, role, project_ids FROM proj_invites
      WHERE workspace_id = $1 AND lower(address) = lower($2) AND status = 'pending' ORDER BY invited_at`,
    [workspaceId, address],
  );
  return rows.map((row) => ({ inviteId: row.invite_id, role: row.role, projectIds: [...row.project_ids].sort() }));
}

async function statusOf(inviteId: string): Promise<string | undefined> {
  const { rows } = await db.pool.query<{ status: string }>('SELECT status FROM proj_invites WHERE invite_id = $1', [inviteId]);
  return rows[0]?.status;
}

async function eventCount(workspaceId: string, type: string): Promise<number> {
  const { rows } = await db.pool.query<{ n: number }>(
    'SELECT count(*)::int AS n FROM events WHERE workspace_id = $1 AND type = $2',
    [workspaceId, type],
  );
  return rows[0]?.n ?? 0;
}

const accept = (caller: Caller, token: string) =>
  app.inject({ method: 'POST', url: `/v1/invites/${token}/accept`, headers: caller.headers });

describe('6.226 a different role or project set UPDATES the pending invite (amended 2026-09-30 by 6.230)', () => {
  it('6.226 role differs → updated; project set differs → updated; none → updated; the same set in another order → rotated; ONE pending invite throughout; CONTROL: each step starts with exactly one pending', async () => {
    const owner = await signedIn();
    const workspaceId = await found(owner);
    const p1 = await foundProject(owner, workspaceId, 'One');
    const p2 = await foundProject(owner, workspaceId, 'Two');
    const address = 'mixed@example.com';
    const base = await mintOk(owner, workspaceId, { address, role: 'admin', projectIds: [p1, p2] });
    expect(await pendingRows(workspaceId, address)).toEqual([{ inviteId: base.inviteId, role: 'admin', projectIds: [p1, p2].sort() }]);

    const otherRole = await mintOk(owner, workspaceId, { address, role: 'member', projectIds: [p1, p2] });
    expect(otherRole.inviteId).not.toBe(base.inviteId);
    expect(await pendingRows(workspaceId, address)).toEqual([{ inviteId: otherRole.inviteId, role: 'member', projectIds: [p1, p2].sort() }]);
    expect(await statusOf(base.inviteId)).toBe('revoked');

    const otherProjects = await mintOk(owner, workspaceId, { address, role: 'member', projectIds: [p1] });
    expect(otherProjects.inviteId).not.toBe(otherRole.inviteId);
    expect(await pendingRows(workspaceId, address)).toEqual([{ inviteId: otherProjects.inviteId, role: 'member', projectIds: [p1] }]);

    const noProjects = await mintOk(owner, workspaceId, { address, role: 'member' });
    expect(noProjects.inviteId).not.toBe(otherProjects.inviteId);
    expect(await pendingRows(workspaceId, address)).toEqual([{ inviteId: noProjects.inviteId, role: 'member', projectIds: [] }]);

    const back = await mintOk(owner, workspaceId, { address, role: 'admin', projectIds: [p1, p2] });
    // CONTROL: the identical set in a different order is the same invitation (a rotation).
    const reordered = await mintOk(owner, workspaceId, { address, role: 'admin', projectIds: [p2, p1] });
    expect(reordered.inviteId).toBe(back.inviteId);
    expect(await pendingRows(workspaceId, address)).toHaveLength(1);
  });
});

describe('6.230 a mint that differs in role or projects UPDATES the pending invite', () => {
  it('6.230 one pending invite with the new role and projects, a new id, the old one revoked and its link dead, the letter names the new role; CONTROL: the same request unchanged rotates', async () => {
    const owner = await signedIn();
    const workspaceId = await found(owner);
    const project = await foundProject(owner, workspaceId, 'Books');
    const address = 'update@example.com';
    const first = await mintOk(owner, workspaceId, { address, role: 'guest' });
    expect(await pendingRows(workspaceId, address)).toEqual([{ inviteId: first.inviteId, role: 'guest', projectIds: [] }]);
    const sentBefore = await eventCount(workspaceId, 'invite.sent');
    const revokedBefore = await eventCount(workspaceId, 'invite.revoked');
    mailed.length = 0;

    const second = await mintOk(owner, workspaceId, { address, role: 'member', projectIds: [project] });

    expect(Object.keys(second).sort()).toEqual(['emailSent', 'expiresAt', 'inviteId', 'token', 'url']);
    expect(second.inviteId).not.toBe(first.inviteId);
    expect(second.emailSent).toBe(true);
    expect(await pendingRows(workspaceId, address)).toEqual([{ inviteId: second.inviteId, role: 'member', projectIds: [project] }]);
    expect(await statusOf(first.inviteId)).toBe('revoked');
    // Revoke-then-send through the ledger: one of each, and no new event type.
    expect(await eventCount(workspaceId, 'invite.revoked')).toBe(revokedBefore + 1);
    expect(await eventCount(workspaceId, 'invite.sent')).toBe(sentBefore + 1);
    // The OLD link is dead — the read door and the accept door both refuse it — and the new one opens.
    expect(await openable(first.token)).toBe(false);
    // R4: only the addressed account may accept, so accept AS that account; a revoked link is then a plain 404.
    const addressed = await signInWithEmail(app, magic, address);
    const addressedCaller = { userId: addressed.userId, headers: { authorization: `Bearer ${addressed.token}` }, phone: '' };
    expect((await accept(addressedCaller, first.token)).statusCode).toBe(404);
    expect(await tokenHash(second.inviteId)).not.toBeNull();
    expect(await openable(second.token)).toBe(true);
    // The letter went out once, with the NEW link and the NEW role.
    expect(mailed).toHaveLength(1);
    expect(mailed[0]?.url).toBe(second.url);
    expect(mailed[0]?.role).toBe('member');

    // CONTROL: repeating the new shape is a rotation, not another update.
    const again = await mintOk(owner, workspaceId, { address, role: 'member', projectIds: [project] });
    expect(again.inviteId).toBe(second.inviteId);
    expect(await pendingRows(workspaceId, address)).toHaveLength(1);
    // CONTROL for the 404 above: the same account, the CURRENT link, is let in.
    expect((await accept(addressedCaller, again.token)).statusCode).toBe(200);
  });
});

describe('6.231 the update answers to the gate BEFORE anything changes', () => {
  it('6.231 a member, a guest, a non-member, an admin granting owner and an admin granting a foreign project get the fresh mint’s 422 and the pending invite is untouched; CONTROL: an admin’s update succeeds', async () => {
    const owner = await signedIn();
    const workspaceId = await found(owner);
    const otherWorkspace = await found(owner);
    const foreignProject = await foundProject(owner, otherWorkspace, 'Elsewhere');
    const member = await joinAs(owner, workspaceId, 'member');
    const guest = await joinAs(owner, workspaceId, 'guest');
    const outsider = await signedIn();
    const admin = await joinAs(owner, workspaceId, 'admin');
    const address = 'victim@example.com';
    const victim = await mintOk(owner, workspaceId, { address, role: 'member' });
    const hash = await tokenHash(victim.inviteId);
    const before = await pendingRows(workspaceId, address);
    const sent = await eventCount(workspaceId, 'invite.sent');
    const revoked = await eventCount(workspaceId, 'invite.revoked');

    for (const [label, caller, body] of [
      ['member', member, { role: 'guest' }],
      ['guest', guest, { role: 'guest' }],
      ['non-member', outsider, { role: 'guest' }],
      ['admin granting owner', admin, { role: 'owner' }],
      ['admin granting a foreign project', admin, { role: 'member', projectIds: [foreignProject] }],
    ] satisfies Array<[string, Caller, MintBody]>) {
      const res = await mint(caller, workspaceId, { address, ...body });
      expect(res.statusCode, label).toBe(422);
      const refusal = res.json() as Record<string, unknown>;
      // Byte for byte what a FRESH address gets from the same caller with the same claim.
      const fresh = (await mint(caller, workspaceId, { address: `fresh-${label.replace(/ /g, '-')}@example.com`, ...body })).json() as Record<string, unknown>;
      const { eventId: _a, ...refusalRest } = refusal;
      const { eventId: _b, ...freshRest } = fresh;
      expect(refusalRest, label).toEqual(freshRest);
      expect(await pendingRows(workspaceId, address), label).toEqual(before);
      expect(await statusOf(victim.inviteId), label).toBe('pending');
      expect(await tokenHash(victim.inviteId), label).toBe(hash);
      expect(await eventCount(workspaceId, 'invite.revoked'), label).toBe(revoked);
    }
    expect(await eventCount(workspaceId, 'invite.sent')).toBe(sent);
    expect(await openable(victim.token)).toBe(true);

    // CONTROL: the admin's own well-formed update goes through.
    const updated = await mintOk(admin, workspaceId, { address, role: 'guest' });
    expect(updated.inviteId).not.toBe(victim.inviteId);
    expect(await pendingRows(workspaceId, address)).toEqual([{ inviteId: updated.inviteId, role: 'guest', projectIds: [] }]);
  });
});

describe('6.232 rows minted before the dedupe may already be several: the update leaves one', () => {
  it('6.232 two older pending rows for the address are both revoked and one new pending invite remains; CONTROL: each older link opened before', async () => {
    const owner = await signedIn();
    const workspaceId = await found(owner);
    const address = 'legacy@example.com';
    const older = await mintOk(owner, workspaceId, { address: 'legacy-a@example.com', role: 'member' });
    const newer = await mintOk(owner, workspaceId, { address: 'legacy-b@example.com', role: 'guest' });
    // Rows minted before S4 — two pending invites for ONE address (and one in another case).
    await db.pool.query(`UPDATE proj_invites SET address = 'legacy@example.com' WHERE invite_id = $1`, [older.inviteId]);
    await db.pool.query(`UPDATE proj_invites SET address = 'LEGACY@example.com' WHERE invite_id = $1`, [newer.inviteId]);
    expect(await pendingRows(workspaceId, address)).toHaveLength(2);
    expect(await openable(older.token)).toBe(true);
    expect(await openable(newer.token)).toBe(true);

    const updated = await mintOk(owner, workspaceId, { address, role: 'admin' });

    expect(await pendingRows(workspaceId, address)).toEqual([{ inviteId: updated.inviteId, role: 'admin', projectIds: [] }]);
    expect(await statusOf(older.inviteId)).toBe('revoked');
    expect(await statusOf(newer.inviteId)).toBe('revoked');
    expect(await openable(older.token)).toBe(false);
    expect(await openable(newer.token)).toBe(false);
    expect(await openable(updated.token)).toBe(true);
  });
});

describe('6.233 two simultaneous updates with different roles end with ONE pending invite', () => {
  it('6.233 20 trials: two 201s, one pending row carrying the role of the LATER invite.sent; CONTROL: two revokes and two sends were recorded', async () => {
    const owner = await signedIn();
    const workspaceId = await found(owner);
    for (let trial = 0; trial < 20; trial += 1) {
      const address = `role-race-${trial}@example.com`;
      await mintOk(owner, workspaceId, { address, role: 'admin' });
      const sentBefore = await eventCount(workspaceId, 'invite.sent');
      const revokedBefore = await eventCount(workspaceId, 'invite.revoked');
      const [a, b] = await Promise.all([
        mint(owner, workspaceId, { address, role: 'member' }),
        mint(owner, workspaceId, { address, role: 'guest' }),
      ]);
      expect([a.statusCode, b.statusCode], `trial ${trial}`).toEqual([201, 201]);
      const rows = await pendingRows(workspaceId, address);
      expect(rows, `trial ${trial}`).toHaveLength(1);
      // The winner is the invite.sent that landed LAST in the ledger.
      const { rows: sends } = await db.pool.query<{ invite_id: string; role: string }>(
        `SELECT entity_id AS invite_id, payload->>'role' AS role FROM events
          WHERE workspace_id = $1 AND type = 'invite.sent' AND lower(payload->>'address') = $2 ORDER BY workspace_seq DESC LIMIT 1`,
        [workspaceId, address],
      );
      expect(rows[0], `trial ${trial}`).toEqual({ inviteId: sends[0]?.invite_id, role: sends[0]?.role, projectIds: [] });
      expect(await eventCount(workspaceId, 'invite.sent'), `trial ${trial}`).toBe(sentBefore + 2);
      expect(await eventCount(workspaceId, 'invite.revoked'), `trial ${trial}`).toBe(revokedBefore + 2);
    }
  });
});
