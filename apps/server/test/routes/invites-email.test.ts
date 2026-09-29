import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { ErrorAlerter } from '../../src/alerts/error-alerter.js';
import type { LogOtpSender } from '../../src/auth/otp-sender.js';
import type { InviteEmail, InviteMailer } from '../../src/invites/invite-mailer.js';
import { buildTestApp, TEST_WEB_ORIGIN } from '../helpers/app.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { signInWithPhone } from '../helpers/session.js';

/**
 * Access plan Task 5, cases 6.198–6.201 (W5). The mailer and the alerter are
 * INJECTED through `buildTestApp`'s overrides; what is asserted is what the
 * route handed them and what it answered.
 */

let db: TestDatabase;
let app: FastifyInstance;
let otp: LogOtpSender;

type Behaviour = 'record' | 'throw' | 'count-tokens';
let behaviour: Behaviour = 'record';
const mailed: InviteEmail[] = [];
const tokenRowsAtSend: number[] = [];
const alerts: Array<{ context: string; error: unknown }> = [];

const mailer: InviteMailer = {
  async send(mail) {
    if (behaviour === 'throw') throw new Error('SMTP 421 service not available');
    if (behaviour === 'count-tokens') {
      const { rows } = await db.pool.query<{ n: number }>('SELECT count(*)::int AS n FROM invite_tokens');
      tokenRowsAtSend.push(rows[0]!.n);
    }
    mailed.push(mail);
  },
};
const alerter: ErrorAlerter = {
  async notify(context, error) {
    alerts.push({ context, error });
  },
};

beforeAll(async () => {
  db = await createTestDatabase();
  const built = buildTestApp(db, { inviteMailer: mailer, alerter });
  app = built.app;
  otp = built.otp;
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await db.drop();
});

let phone = 0;
async function signedIn() {
  phone += 1;
  const user = await signInWithPhone(app, otp, `+9190015${String(phone).padStart(5, '0')}`);
  return { userId: user.userId, headers: { authorization: `Bearer ${user.token}` } };
}

async function found(owner: { headers: { authorization: string } }) {
  const res = await app.inject({ method: 'POST', url: '/v1/workspaces', headers: owner.headers, payload: { name: 'Convenience Corner' } });
  expect(res.statusCode, res.body).toBe(201);
  return (res.json() as { workspaceId: string }).workspaceId;
}

function mint(caller: { headers: { authorization: string } }, workspaceId: string, channel: 'email' | 'phone', address: string) {
  return app.inject({
    method: 'POST',
    url: `/v1/workspaces/${workspaceId}/invites`,
    headers: caller.headers,
    payload: { address, channel, role: 'member' },
  });
}

describe('6.198–6.201 the mint route emails an email invitation', () => {
  it('6.198 mailed once with the url, emailSent true; CONTROL: inviterName is a label, not an id', async () => {
    behaviour = 'record';
    mailed.length = 0;
    const owner = await signedIn();
    const ws = await found(owner);
    const res = await mint(owner, ws, 'email', 'anselma@example.test');
    expect(res.statusCode, res.body).toBe(201);
    const body = res.json() as { url: string; emailSent: boolean };
    expect(body.emailSent).toBe(true);
    expect(mailed).toHaveLength(1);
    expect(mailed[0]).toMatchObject({ to: 'anselma@example.test', url: body.url, workspaceName: 'Convenience Corner', role: 'member' });
    expect(mailed[0]!.inviterName).not.toBe(owner.userId);
    expect(mailed[0]!.inviterName).not.toBe('');
  });

  it('6.199 a phone invitation is not mailed, emailSent false; CONTROL: an email one is', async () => {
    behaviour = 'record';
    mailed.length = 0;
    const owner = await signedIn();
    const ws = await found(owner);
    const phoneRes = await mint(owner, ws, 'phone', '+919001400001');
    expect(phoneRes.statusCode, phoneRes.body).toBe(201);
    expect((phoneRes.json() as { emailSent: boolean }).emailSent).toBe(false);
    expect(mailed).toHaveLength(0);
    await mint(owner, ws, 'email', 'balti@example.test');
    expect(mailed).toHaveLength(1);
  });

  it('6.200 a throwing mailer: 201, emailSent false, link openable, alerter told without the token', async () => {
    behaviour = 'throw';
    alerts.length = 0;
    const owner = await signedIn();
    const ws = await found(owner);
    const res = await mint(owner, ws, 'email', 'dipu@example.test');
    expect(res.statusCode, res.body).toBe(201);
    const body = res.json() as { url: string; emailSent: boolean };
    expect(body.emailSent).toBe(false);
    const token = body.url.slice(`${TEST_WEB_ORIGIN}/invite/`.length);
    // Fire-and-forget: give the alerter's microtask a turn.
    await new Promise((resolve) => setImmediate(resolve));
    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.context).not.toContain(token);
    expect((await app.inject({ method: 'GET', url: `/v1/invites/${token}` })).statusCode).toBe(200);
  });

  it('6.201 the credential exists before the mail goes; CONTROL: read inside the mailer', async () => {
    behaviour = 'count-tokens';
    tokenRowsAtSend.length = 0;
    await db.pool.query('TRUNCATE invite_tokens');
    const owner = await signedIn();
    const ws = await found(owner);
    await mint(owner, ws, 'email', 'era@example.test');
    expect(tokenRowsAtSend).toEqual([1]);
  });
});
