import { gunzipSync } from 'node:zlib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { buildReadTestApp, type ReadWorld } from '../helpers/read-app.js';

/**
 * Smoothness T11 (spec D7; audit SM-06), case 25.199 — a REAL route, declared by `buildApp`, is compressed.
 *
 * `test/http/compression.test.ts` measures the plugin on routes the test declares. That is not enough, and
 * the first draft of the wiring proved it: `void app.register(compress, …)` compressed every route declared
 * inside a child `register` and none declared straight on `app`, which is where `buildApp` declares the board,
 * the list, My Work and the workspaces read. A test that only declares its own routes after `buildApp` returns
 * cannot tell "the plugin is applied before the first route" from "the plugin is applied at all". This one reads
 * the board through the assembled app, with a real session, and compares the two encodings of the same answer.
 */

let db: TestDatabase;
let read: ReadWorld;

beforeAll(async () => {
  db = await createTestDatabase();
  read = await buildReadTestApp(db);
}, 60_000);

afterAll(async () => {
  await read.app.close();
  await db.drop();
});

describe('a route buildApp declares answers compressed (spec D7; audit SM-06)', () => {
  it('25.199 the board read is gzip-encoded for a client that accepts it, decodes to the plain answer, and is plain for one that does not', async () => {
    const url = `/v1/projects/${read.world.projectId}/board`;
    const plain = await read.app.inject({ method: 'GET', url, headers: read.authOf('owner') });
    expect(plain.statusCode).toBe(200);
    expect(plain.headers['content-encoding']).toBeUndefined();
    // CONTROL (same it()): the answer is over the 1 KB threshold, so "not encoded" below would be a failure,
    // not the threshold doing its job.
    expect(plain.rawPayload.length).toBeGreaterThan(1024);

    const gz = await read.app.inject({
      method: 'GET',
      url,
      headers: { ...read.authOf('owner'), 'accept-encoding': 'gzip' },
    });
    expect(gz.statusCode).toBe(200);
    expect(gz.headers['content-encoding']).toBe('gzip');
    expect(gz.headers['vary']).toMatch(/accept-encoding/i);
    // Byte-identical once decoded: compression changes the wire, never the document.
    expect(gunzipSync(gz.rawPayload).toString()).toBe(plain.body);
    expect(gz.rawPayload.length).toBeLessThan(plain.rawPayload.length);
  });
});
