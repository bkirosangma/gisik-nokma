import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { createAuth } from '../src/auth/auth.js';
import { LogMagicLinkSender } from '../src/auth/magic-link-sender.js';
import { LogOtpSender } from '../src/auth/otp-sender.js';
import { createPool } from '../src/db.js';
import type { IngestService } from '../src/ingest/ingest-service.js';

const healthyDb = { query: async () => [{ ok: 1 }] };
const brokenDb = {
  query: async () => {
    throw new Error('connection refused');
  },
};

function fakeIngest(): IngestService {
  return {
    ingestBatch: async () => [],
    ingestClientBatch: async () => [],
    onEventCommitted: () => () => {},
  };
}

/**
 * `buildApp` requires an auth instance, and this file must stay database-free —
 * its whole subject is /healthz answering correctly when the database is down.
 * Both hold at once because `createAuth` opens no connection: run against this
 * pool, whose port nothing listens on, it returns in ~2ms. Nothing here requests
 * an /api/auth/* path, so the pool is never asked for a client.
 */
const offlinePool = createPool('postgres://unused:unused@127.0.0.1:1/unused');

function offlineAuth(): ReturnType<typeof createAuth> {
  return createAuth({
    pool: offlinePool,
    otpSender: new LogOtpSender(() => {}),
    magicLinkSender: new LogMagicLinkSender(() => {}),
    baseUrl: 'http://localhost:3000',
    secret: 'test-secret-not-used-anywhere-real',
  });
}

describe('GET /healthz', () => {
  it('answers ok when the database responds', async () => {
    const app = buildApp({ db: healthyDb, pool: offlinePool, ingest: fakeIngest(), auth: offlineAuth() });
    const response = await app.inject({ method: 'GET', url: '/healthz' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
    await app.close();
  });

  it('planted defect: answers 503 unavailable when the database is down — never a fake ok', async () => {
    const app = buildApp({ db: brokenDb, pool: offlinePool, ingest: fakeIngest(), auth: offlineAuth() });
    const response = await app.inject({ method: 'GET', url: '/healthz' });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ status: 'unavailable' });
    await app.close();
  });
});
