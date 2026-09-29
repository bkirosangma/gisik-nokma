import { Writable } from 'node:stream';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { LogOtpSender } from '../../src/auth/otp-sender.js';
import type { InviteMailer } from '../../src/invites/invite-mailer.js';
import { buildTestApp, TEST_WEB_ORIGIN } from '../helpers/app.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { signInWithPhone } from '../helpers/session.js';

/**
 * **Where an invitation's seconds go** (fix-now batch S1; the first send after a
 * restart measured 18 s in production with the per-phase split unknown). One
 * `info` line per mint carries the durations of each phase — and only durations
 * and ids: never the address, the link or the token.
 */
const ADDRESS = 'timing-recipient@example.test';

let db: TestDatabase;
let app: FastifyInstance;
let otp: LogOtpSender;
const lines: string[] = [];
const mailer: InviteMailer = { send: async () => undefined };

beforeAll(async () => {
  db = await createTestDatabase();
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      lines.push(String(chunk));
      callback();
    },
  });
  const built = buildTestApp(db, { inviteMailer: mailer, logStream: stream });
  app = built.app;
  otp = built.otp;
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await db.drop();
});

const timingLines = () =>
  lines
    .join('')
    .split('\n')
    .filter((line) => line.includes('invite mint timing'))
    .map((line) => JSON.parse(line) as { inviteId: string; deduped: boolean; emailSent: boolean; timingMs: Record<string, number> });

describe('6.229 one timing line per mint', () => {
  it('6.229 carries every phase as a non-negative whole number and names no address, link or token; CONTROL: the repeat is deduped and logs its own line', async () => {
    const user = await signInWithPhone(app, otp, '+919002499901');
    const headers = { authorization: `Bearer ${user.token}` };
    const founded = await app.inject({ method: 'POST', url: '/v1/workspaces', headers, payload: { name: 'Timing' } });
    const workspaceId = (founded.json() as { workspaceId: string }).workspaceId;
    const mint = () =>
      app.inject({
        method: 'POST',
        url: `/v1/workspaces/${workspaceId}/invites`,
        headers,
        payload: { address: ADDRESS, channel: 'email', role: 'member' },
      });

    const first = await mint();
    expect(first.statusCode, first.body).toBe(201);
    const token = (first.json() as { url: string }).url.slice(`${TEST_WEB_ORIGIN}/invite/`.length);

    const [line] = timingLines();
    expect(line?.deduped).toBe(false);
    expect(line?.emailSent).toBe(true);
    expect(Object.keys(line?.timingMs ?? {}).sort()).toEqual(
      ['commit', 'gate', 'ingest', 'lock', 'lookups', 'match', 'send', 'token'],
    );
    for (const ms of Object.values(line?.timingMs ?? {})) {
      expect(Number.isInteger(ms) && ms >= 0).toBe(true);
    }
    // Durations and ids only: the log carries neither the recipient nor the credential.
    const written = lines.join('');
    expect(written).not.toContain(ADDRESS);
    expect(written).not.toContain(token);

    const second = await mint();
    expect(second.statusCode, second.body).toBe(201);
    const all = timingLines();
    expect(all).toHaveLength(2);
    expect(all[1]?.deduped).toBe(true);
    expect(all[1]?.inviteId).toBe(line?.inviteId);
  });
});
