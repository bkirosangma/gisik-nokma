import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Queryable } from '../../src/db/queryable.js';
import type { InviteEmail, InviteMailer } from '../../src/invites/invite-mailer.js';
import { buildTestApp, TEST_WEB_ORIGIN } from '../helpers/app.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { signInWithPhone } from '../helpers/session.js';

/**
 * **6.234 — the update asks the gate whether the caller may REVOKE the old
 * invitation, dry, BEFORE the revoke commits** (invite update, owner ruling
 * 2026-09-30, pin 2).
 *
 * The real gate treats `invite.sent` and `invite.revoked` alike (both admin-only),
 * so no caller of the shipped app can be allowed to send and refused to revoke —
 * and without a seam the dry-run of the revoke could be deleted and nothing here
 * would notice: the ingest door would refuse the revoke itself. The seam is
 * `AppDeps.pool`, the handle the route's dry-runs read through and the ingest
 * does NOT: a wrapper that lets the FIRST membership read (the new `invite.sent`
 * dry-run) answer truthfully and shows the caller as no member for the NEXT one
 * (the revoke's dry-run) makes the route's own pre-flight the only thing that
 * can stop the revoke.
 */

let db: TestDatabase;
let app: FastifyInstance;
let signIn: (phone: string) => Promise<{ userId: string; headers: { authorization: string } }>;
const mailed: InviteEmail[] = [];
const mailer: InviteMailer = { send: async (mail) => void mailed.push(mail) };
let membershipReads = 0;
let blindFromRead = Number.POSITIVE_INFINITY;

beforeAll(async () => {
  db = await createTestDatabase();
  const seam = new Proxy(db.pool, {
    get(target, prop, receiver) {
      if (prop !== 'query') {
        const value = Reflect.get(target, prop, receiver);
        return typeof value === 'function' ? value.bind(target) : value;
      }
      return async (...args: unknown[]) => {
        const text = typeof args[0] === 'string' ? args[0] : '';
        if (text.includes('FROM proj_memberships')) {
          membershipReads += 1;
          if (membershipReads >= blindFromRead) return { rows: [], rowCount: 0 };
        }
        return (target.query as (...a: unknown[]) => unknown)(...args);
      };
    },
  }) as unknown as Queryable;
  const built = buildTestApp(db, { inviteMailer: mailer, pool: seam });
  app = built.app;
  await app.ready();
  signIn = async (phone) => {
    const user = await signInWithPhone(app, built.otp, phone);
    return { userId: user.userId, headers: { authorization: `Bearer ${user.token}` } };
  };
});

afterAll(async () => {
  await app.close();
  await db.drop();
});

describe('6.234 the revoke of the old invitation is dry-run against the gate first', () => {
  it('6.234 a refused revoke dry-run answers 422, and the pending invite, its token and the ledger are untouched; CONTROL: the same request with the seam off updates', async () => {
    const owner = await signIn('+919002499001');
    const founded = await app.inject({ method: 'POST', url: '/v1/workspaces', headers: owner.headers, payload: { name: 'Seam' } });
    const workspaceId = (founded.json() as { workspaceId: string }).workspaceId;
    const send = (role: string) =>
      app.inject({
        method: 'POST',
        url: `/v1/workspaces/${workspaceId}/invites`,
        headers: owner.headers,
        payload: { address: 'seam@example.com', channel: 'email', role },
      });
    const first = (await send('guest')).json() as { inviteId: string; url: string };
    const counts = async () =>
      (
        await db.pool.query<{ type: string; n: number }>(
          `SELECT type, count(*)::int AS n FROM events WHERE workspace_id = $1 AND type IN ('invite.sent','invite.revoked') GROUP BY type`,
          [workspaceId],
        )
      ).rows;
    const hashOf = async (id: string) =>
      (await db.pool.query<{ token_hash: string }>('SELECT token_hash FROM invite_tokens WHERE invite_id = $1', [id])).rows[0]?.token_hash;
    const hash = await hashOf(first.inviteId);
    const ledger = await counts();

    // Blind the gate's membership read from the SECOND one of the next request on.
    membershipReads = 0;
    blindFromRead = 2;
    const refused = await send('member');
    blindFromRead = Number.POSITIVE_INFINITY;

    expect(refused.statusCode).toBe(422);
    expect((refused.json() as { status: string }).status).toBe('refused');
    const { rows } = await db.pool.query<{ invite_id: string; role: string; status: string }>(
      `SELECT invite_id, role, status FROM proj_invites WHERE workspace_id = $1`,
      [workspaceId],
    );
    expect(rows).toEqual([{ invite_id: first.inviteId, role: 'guest', status: 'pending' }]);
    expect(await hashOf(first.inviteId)).toBe(hash);
    expect(await counts()).toEqual(ledger);
    expect(mailed.filter((m) => m.role === 'member')).toHaveLength(0);

    // CONTROL: seam off, the identical request is an update.
    const updated = await send('member');
    expect(updated.statusCode, updated.body).toBe(201);
    const pending = await db.pool.query<{ role: string }>(
      `SELECT role FROM proj_invites WHERE workspace_id = $1 AND status = 'pending'`,
      [workspaceId],
    );
    expect(pending.rows).toEqual([{ role: 'member' }]);
    expect((updated.json() as { url: string }).url.startsWith(`${TEST_WEB_ORIGIN}/invite/`)).toBe(true);
  });
});
