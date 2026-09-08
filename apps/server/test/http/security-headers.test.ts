import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SECURITY_HEADERS } from '../../src/http/security-headers.js';
import { buildTestApp } from '../helpers/app.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';

/**
 * The three unconditional security headers, closing the gap the executor
 * handoff had carried as open: before 2026-09-08 this server sent `hsts.ts`'s
 * `Strict-Transport-Security` and nothing else. Owner ruling 2026-09-08 —
 * close the unambiguous part, defer CSP.
 *
 * Cases 13.256–13.259.
 */
let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase();
});

afterAll(async () => {
  await db.drop();
});

/** Every header name the constant declares, read off a real response. */
function present(response: { headers: Record<string, unknown> }): Record<string, unknown> {
  return Object.fromEntries(Object.keys(SECURITY_HEADERS).map((k) => [k, response.headers[k]]));
}

describe('the three unconditional headers', () => {
  it('13.256 rides on an ordinary answered request', async () => {
    const { app } = buildTestApp(db);
    const res = await app.inject({ method: 'GET', url: '/healthz' });
    expect(res.statusCode).toBe(200);
    expect(present(res)).toEqual({ ...SECURITY_HEADERS });
  });

  /**
   * The reason the hook is a ROOT `onRequest` rather than an `onSend`, asserted
   * rather than described. A browser's first meeting with an unfamiliar host is
   * often an error or a 404, and a header that appeared only on 2xx would be
   * absent exactly then.
   */
  it('13.257 rides on a 404 and on an unauthenticated refusal too', async () => {
    const { app } = buildTestApp(db);
    const missing = await app.inject({ method: 'GET', url: '/no-such-route-anywhere' });
    expect(missing.statusCode).toBe(404);
    expect(present(missing)).toEqual({ ...SECURITY_HEADERS });

    const refused = await app.inject({ method: 'GET', url: '/v1/me/notifications' });
    expect(refused.statusCode).toBe(401);
    expect(present(refused)).toEqual({ ...SECURITY_HEADERS });
  });

  /**
   * `buildTestApp` passes no `security` options, and roughly sixty other call
   * sites do the same. That is the whole reason the hook sits OUTSIDE the
   * `options.security` block — a header registered inside it would be absent
   * from every test that could otherwise witness it, which is a control that
   * exists only in the configuration nobody exercises.
   */
  it('13.258 does not depend on the security options block being configured', async () => {
    const { app } = buildTestApp(db);
    const withOptions = buildTestApp(db, {
      security: { webOrigin: 'http://localhost:3001', rateLimit: null, trustProxy: false },
    }).app;
    const a = await app.inject({ method: 'GET', url: '/healthz' });
    const b = await withOptions.inject({ method: 'GET', url: '/healthz' });
    expect(present(a)).toEqual(present(b));
    expect(present(a)).toEqual({ ...SECURITY_HEADERS });
  });

  /**
   * The VALUES, pinned individually — not just "three headers are present".
   *
   * `nosniff` is the only value that header takes; `DENY` rather than
   * `SAMEORIGIN` because nothing this server returns is a document meant to be
   * framed by anything, including itself; `no-referrer` rather than
   * `strict-origin-when-cross-origin` because a browser never navigates FROM an
   * API response, so there is no origin any downstream needs. `apps/web` sets
   * the cross-origin variant instead, and that difference is deliberate.
   */
  it('13.259 pins each value, and states what is deliberately absent', () => {
    expect(SECURITY_HEADERS['x-content-type-options']).toBe('nosniff');
    expect(SECURITY_HEADERS['x-frame-options']).toBe('DENY');
    expect(SECURITY_HEADERS['referrer-policy']).toBe('no-referrer');

    // CSP and Permissions-Policy are DEFERRED, not forgotten (owner, 2026-09-08).
    // Both are statements about what a DOCUMENT may do, and this server serves
    // none; guessing at either here would put a control in the wrong app, where
    // its failure mode is silent. Asserting their absence is what makes adding
    // one later a deliberate act that reddens a test rather than a quiet drift.
    expect(Object.keys(SECURITY_HEADERS).sort()).toEqual([
      'referrer-policy',
      'x-content-type-options',
      'x-frame-options',
    ]);
  });
});
