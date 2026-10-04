import { brotliDecompressSync, gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app.js';
import { createObjectStoreFromEnv } from '../../src/attachments/store-config.js';
import { createAuth } from '../../src/auth/auth.js';
import { LogMagicLinkSender } from '../../src/auth/magic-link-sender.js';
import { LogOtpSender } from '../../src/auth/otp-sender.js';
import { createPool } from '../../src/db.js';
import type { IngestService } from '../../src/ingest/ingest-service.js';

/**
 * Smoothness T11 (spec D7; audit SM-06) — compressed responses, measured on the assembled app.
 *
 * ## Why the server does it (and does not assume the edge does)
 *
 * Baseline item 7 saw only 401s with a 27-byte body from production, so it could not say
 * whether Cloudflare or the Fastify server compresses the real board JSON (~146 KB, 23 KB
 * encoded in dev only because Next's rewrite proxy did it). Decision D7 therefore puts
 * `@fastify/compress` on the server: gzip and brotli, nothing under 1 KB.
 *
 * ## Database-free, like `test/app.test.ts`
 *
 * The routes under test are declared here, on the assembled app, so no session and no
 * database is needed; an offline pool is enough because `createAuth` opens no connection.
 * (The plan put this case in `app.test.ts`, which has no `buildTestApp`; this file is the
 * same shape as `security-middleware.test.ts`.)
 */

const offlinePool = createPool('postgres://unused:unused@127.0.0.1:1/unused');

function fakeIngest(): IngestService {
  return {
    ingestBatch: async () => [],
    ingestClientBatch: async () => [],
    ingestAtomic: async () => ({ status: 'committed', results: [] }),
    ingestClientAtomic: async () => ({ status: 'committed', results: [] }),
    onEventCommitted: () => () => {},
  };
}

function build(): FastifyInstance {
  const app = buildApp({
    db: { query: async () => [{ ok: 1 }] },
    pool: offlinePool,
    ingest: fakeIngest(),
    auth: createAuth({
      pool: offlinePool,
      otpSender: new LogOtpSender(() => {}),
      magicLinkSender: new LogMagicLinkSender(() => {}),
      baseUrl: 'http://localhost:3000',
      secret: 'test-secret-not-used-anywhere-real',
      webOrigin: 'http://localhost:3001',
    }),
    serverAppend: async () => [],
    webOrigin: 'http://localhost:3001',
    store: createObjectStoreFromEnv({}),
  });
  const rows = (n: number) => ({ rows: Array.from({ length: n }, (_, i) => ({ i, text: 'x'.repeat(16) })) });
  app.get('/__big', async () => rows(200));
  app.get('/__small', async () => rows(2));
  // The shape `POST /v1/attachments` and `/mcp` have: declared inside a child scope, which
  // is where this codebase has been surprised by inheritance before.
  void app.register(async (child) => {
    child.get('/__big-in-child', async () => rows(200));
  });
  return app;
}

describe('responses are compressed on the server (spec D7; audit SM-06)', () => {
  it('25.193 a JSON answer over 1 KB is gzip-encoded when the client accepts it, and plain when it does not', async () => {
    const app = build();
    await app.ready();
    const gz = await app.inject({ url: '/__big', headers: { 'accept-encoding': 'gzip' } });
    expect(gz.headers['content-encoding']).toBe('gzip');
    expect(JSON.parse(gunzipSync(gz.rawPayload).toString()).rows).toHaveLength(200);
    // Control: the same route, a client that takes only identity.
    const plain = await app.inject({ url: '/__big', headers: { 'accept-encoding': 'identity' } });
    expect(plain.headers['content-encoding']).toBeUndefined();
    expect(JSON.parse(plain.body).rows).toHaveLength(200);
    // The wire is smaller, which is the point.
    expect(gz.rawPayload.length).toBeLessThan(plain.rawPayload.length / 2);
    await app.close();
  });

  it('25.196 a client that accepts brotli gets brotli, and the bytes decode to the same document', async () => {
    const app = build();
    await app.ready();
    const br = await app.inject({ url: '/__big', headers: { 'accept-encoding': 'br' } });
    expect(br.headers['content-encoding']).toBe('br');
    expect(JSON.parse(brotliDecompressSync(br.rawPayload).toString()).rows).toHaveLength(200);
    // Control: the same client list with gzip only does not get brotli.
    const gz = await app.inject({ url: '/__big', headers: { 'accept-encoding': 'gzip' } });
    expect(gz.headers['content-encoding']).toBe('gzip');
    await app.close();
  });

  it('25.197 nothing under the 1 KB threshold is encoded, and a request with no Accept-Encoding is never encoded (the in-process MCP door sends none)', async () => {
    const app = build();
    await app.ready();
    const small = await app.inject({ url: '/__small', headers: { 'accept-encoding': 'gzip, br' } });
    expect(small.headers['content-encoding']).toBeUndefined();
    expect(JSON.parse(small.body).rows).toHaveLength(2);
    // The in-process door (`mcp/in-process-fetch.ts`) injects with the package's own headers and parses
    // the body as text: with no Accept-Encoding the body must be the plain document, however big.
    const bare = await app.inject({ url: '/__big' });
    expect(bare.headers['content-encoding']).toBeUndefined();
    expect(JSON.parse(bare.body).rows).toHaveLength(200);
    // Control: the same big route IS encoded for a client that asks.
    const asked = await app.inject({ url: '/__big', headers: { 'accept-encoding': 'gzip' } });
    expect(asked.headers['content-encoding']).toBe('gzip');
    await app.close();
  });

  it('25.198 the encoding reaches a route declared inside a child scope', async () => {
    const app = build();
    await app.ready();
    const gz = await app.inject({ url: '/__big-in-child', headers: { 'accept-encoding': 'gzip' } });
    expect(gz.headers['content-encoding']).toBe('gzip');
    expect(JSON.parse(gunzipSync(gz.rawPayload).toString()).rows).toHaveLength(200);
    const plain = await app.inject({ url: '/__big-in-child' });
    expect(plain.headers['content-encoding']).toBeUndefined();
    await app.close();
  });
});
