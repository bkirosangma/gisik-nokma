import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { newUlid } from '@gisik-nokma/domain';
import { HttpError, type LazySession } from '@gisik-nokma/mcp-server';
import type { SecurityOptions } from '../../src/app.js';
import { hostedSession } from '../../src/mcp/in-process-fetch.js';
import { buildOAuthApp, hostedToken } from '../helpers/oauth.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { signInWithPhone } from '../helpers/session.js';

/**
 * MCP sweep 2 T1, spec §13 O1. NOT a catalogue case (the 60 ids are allocated): a measurement of the
 * budget the by-email tools will spend, against the numbers the deployment ships. Run LOCALLY.
 */
let db: TestDatabase;
beforeAll(async () => {
  db = await createTestDatabase();
});
afterAll(async () => {
  await db.drop();
});

const yaml = readFileSync(new URL('../../../../deploy/do/app.yaml', import.meta.url), 'utf8');
function deployed(key: string): number {
  const hit = new RegExp(`- key: ${key}\\s+value: "(\\d+)"`).exec(yaml);
  if (hit === null) throw new Error(`deploy/do/app.yaml no longer sets ${key} as a quoted number; re-read it before trusting this measurement`);
  return Number(hit[1]);
}
const BUDGET = deployed('RATE_LIMIT_AUTH_MAX');
const WINDOW = deployed('RATE_LIMIT_WINDOW_SEC');
const EVENTS = deployed('RATE_LIMIT_EVENTS_MAX');

type Person = { userId: string; token: string; hosted: string };
type World = { app: FastifyInstance; clock: { t: number }; ws: string; a: Person; b: Person };

async function world(trustProxy: boolean, tail: string): Promise<World> {
  const clock = { t: 1_800_000_000_000 };
  const security: SecurityOptions = {
    webOrigin: null,
    trustProxy,
    now: () => clock.t,
    // authMax and signInMax are NOT under measurement: high, so sign-in cannot trip them.
    rateLimit: { authMax: 1000, eventsMax: EVENTS, inviteMax: BUDGET, mcpMax: BUDGET, signInMax: 1000, windowSec: WINDOW },
  };
  const { app, otp } = buildOAuthApp(db, { security });
  await app.ready();
  const owner = await signInWithPhone(app, otp, `+9111000${tail}1`);
  const other = await signInWithPhone(app, otp, `+9111000${tail}2`);
  const found = await app.inject({ method: 'POST', url: '/v1/workspaces', headers: { authorization: `Bearer ${owner.token}` }, payload: { name: 'Budget Co' } });
  const ws = (found.json() as { workspaceId: string }).workspaceId;
  // The second person is a real MEMBER (the lookup refuses a guest and a stranger with a 404 AFTER the limiter).
  const granted = await app.inject({
    method: 'POST', url: '/v1/events', headers: { authorization: `Bearer ${owner.token}` },
    payload: { events: [{ id: newUlid(), workspaceId: ws, entity: { kind: 'membership', id: `${ws}:${other.userId}` }, type: 'membership.granted', version: 1,
      payload: { userId: other.userId, role: 'member' }, actorId: owner.userId, origin: 'web', clientTime: new Date().toISOString() }] },
  });
  expect((granted.json() as { results: Array<{ status: string }> }).results[0]?.status).toBe('committed');
  const a = { userId: owner.userId, token: owner.token, hosted: await hostedToken(app, db.pool, owner.userId) };
  const b = { userId: other.userId, token: other.token, hosted: await hostedToken(app, db.pool, other.userId) };
  clock.t += WINDOW * 1000 + 1; // the setup spent the mcp bucket of the test's own address: reopen every window
  return { app, clock, ws, a, b };
}

const lookup = (s: LazySession, ws: string, i: number) =>
  s.post(`/v1/workspaces/${ws}/people-lookup`, { email: `nobody-${i}@example.test` });

/** Lookups until the first 429: how many were allowed, and the refusal. */
async function drain(s: LazySession, ws: string): Promise<{ allowed: number; refused: HttpError }> {
  await s.ready();
  for (let i = 0; i < BUDGET + 5; i++) {
    try {
      await lookup(s, ws, i);
    } catch (error) {
      if (error instanceof HttpError && error.status === 429) return { allowed: i, refused: error };
      throw error;
    }
  }
  throw new Error('the lookup was never limited');
}

const OUTER = (ip: string, xff?: string) => ({ ip, xff });

describe('O1 the lookup budget a by-email assignment spends', () => {
  it('O1.1 one network key gets exactly the deployed budget of lookups per window, then 429 with a wait; the window reopens', async () => {
    const w = await world(false, '3011');
    const s = hostedSession(w.app, OUTER('198.51.100.10'), w.a.token, w.a.userId);
    const first = await drain(s, w.ws);
    expect(first.allowed).toBe(BUDGET);
    expect(first.refused.body).toMatchObject({ error: 'rate_limited' });
    const wait = (first.refused.body as { retryAfterSeconds: number }).retryAfterSeconds;
    expect(wait).toBeGreaterThanOrEqual(1);
    expect(wait).toBeLessThanOrEqual(WINDOW);
    // CONTROL, same `it`: the window reopens, and the lookup is allowed again.
    w.clock.t += WINDOW * 1000 + 1;
    await expect(lookup(s, w.ws, 99)).resolves.toBeDefined();
    await w.app.close();
  });

  it('O1.2 the lookup spends the SAME bucket as minting an invitation: a spent key cannot invite; another key can', async () => {
    const w = await world(false, '3012');
    const invite = (s: LazySession) => s.post(`/v1/workspaces/${w.ws}/invites`, { channel: 'email', address: 'someone@example.test', role: 'member' });
    const spent = hostedSession(w.app, OUTER('198.51.100.20'), w.a.token, w.a.userId);
    const fresh = hostedSession(w.app, OUTER('198.51.100.21'), w.a.token, w.a.userId);
    await drain(spent, w.ws);
    await expect(invite(spent)).rejects.toMatchObject({ status: 429 });
    await fresh.ready();
    await expect(invite(fresh)).resolves.toBeDefined(); // CONTROL: the route works when its bucket is not spent
    await w.app.close();
  });

  it('O1.3 two different people behind one forwarded address share ONE bucket (the key is the address, never the person); another address does not', async () => {
    const w = await world(true, '3013');
    const sameEgress = OUTER('10.0.0.1', '203.0.113.9'); // the proxy hop, then the address it saw
    const sa = hostedSession(w.app, sameEgress, w.a.token, w.a.userId);
    const sb = hostedSession(w.app, sameEgress, w.b.token, w.b.userId);
    await drain(sa, w.ws);
    await sb.ready();
    await expect(lookup(sb, w.ws, 1)).rejects.toMatchObject({ status: 429 }); // person B starved by person A
    const elsewhere = hostedSession(w.app, OUTER('10.0.0.1', '203.0.113.10'), w.b.token, w.b.userId);
    await elsewhere.ready();
    await expect(lookup(elsewhere, w.ws, 2)).resolves.toBeDefined(); // CONTROL: same hop, another forwarded address
    await w.app.close();
  });

  it('O1.4 /mcp itself is charged to its own bucket at the same budget, per forwarded address, whatever the tool or the person', async () => {
    const w = await world(true, '3014');
    const call = (token: string, xff: string) =>
      w.app.inject({
        method: 'POST', url: '/mcp', remoteAddress: '10.0.0.1',
        headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'mcp-protocol-version': '2025-06-18', authorization: `Bearer ${token}`, 'x-forwarded-for': xff },
        payload: { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_workspaces', arguments: {} } },
      });
    let allowed = 0;
    for (let i = 0; i < BUDGET + 5; i++) {
      const res = await call(i % 2 === 0 ? w.a.hosted : w.b.hosted, '203.0.113.30'); // two people alternate on one address
      if (res.statusCode === 429) break;
      expect(res.statusCode).toBe(200);
      allowed += 1;
    }
    expect(allowed).toBe(BUDGET);
    expect((await call(w.a.hosted, '203.0.113.31')).statusCode).toBe(200); // CONTROL: another address
    await w.app.close();
  });
});
