import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { createObjectStoreFromEnv } from '../src/attachments/store-config.js';
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
    const app = buildApp({
      db: healthyDb,
      pool: offlinePool,
      ingest: fakeIngest(),
      auth: offlineAuth(),
      // Plan 4 Task 14. Both fields are REQUIRED on `AppDeps`, so every
      // hand-assembled app in the suite had to name them — which is the
      // narrowing working: a route that needs the internal append door gets it
      // by being handed one, never by reaching for it.
      serverAppend: async () => [],
      webOrigin: 'http://localhost:3001',
      // `AppDeps.store` is required too, and naming it here costs this file
      // nothing it was built to avoid: `createObjectStoreFromEnv({})` defaults
      // to `'local'` and returns a `LocalDiskStore` whose constructor stores a
      // string and touches no filesystem — every `fs` call is inside
      // `put`/`getStream`/`delete`, which `/healthz` never reaches. This file
      // stays database-free AND filesystem-free.
      store: createObjectStoreFromEnv({}),
    });
    const response = await app.inject({ method: 'GET', url: '/healthz' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
    await app.close();
  });

  it('planted defect: answers 503 unavailable when the database is down — never a fake ok', async () => {
    const app = buildApp({
      db: brokenDb,
      pool: offlinePool,
      ingest: fakeIngest(),
      auth: offlineAuth(),
      serverAppend: async () => [],
      webOrigin: 'http://localhost:3001',
      store: createObjectStoreFromEnv({}),
    });
    const response = await app.inject({ method: 'GET', url: '/healthz' });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ status: 'unavailable' });
    await app.close();
  });
});
