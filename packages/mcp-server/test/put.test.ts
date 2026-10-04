import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_POLL_INTERVAL_MS } from '../src/config.js';
import { createGisikClient, HttpError, type GisikClient } from '../src/http-client.js';
import { lazySession } from '../src/lazy-session.js';
import { createSession } from '../src/session.js';
import { writeCachedToken } from '../src/token-cache.js';
import { NO_CLIENT_TRANSFER } from './fixtures/fake-session.js';

/** MCP sweep 2 T2, case 14.600 (package half; the hosted door is `apps/server/test/mcp/in-process-put.test.ts`). */
const config = () => ({ serverUrl: 'http://server', tokenPath: join(mkdtempSync(join(tmpdir(), 'gisik-put-')), 'mcp-token'), pollIntervalMs: DEFAULT_POLL_INTERVAL_MS });

describe('Session.put', () => {
  it('14.600 reaches the server as a PUT with the bearer token and a JSON body through the client, the session (one re-login on a 401) and the lazy wrapper; post is still a POST', async () => {
    const seen: Array<{ method: string; url: string; auth: string | null; type: string | null; body: string }> = [];
    const stub: typeof fetch = async (input, init) => {
      const req = new Request(input as string, init);
      seen.push({ method: req.method, url: req.url, auth: req.headers.get('authorization'), type: req.headers.get('content-type'), body: await req.text() });
      return new Response(JSON.stringify({ mutedKinds: ['mention'] }), { status: 200, headers: { 'content-type': 'application/json' } });
    };
    const client = createGisikClient('http://server', stub);
    expect(await client.put('/v1/me/notification-preferences', { mutedKinds: ['mention'] }, 'tok')).toEqual({ mutedKinds: ['mention'] });
    expect(seen[0]).toEqual({ method: 'PUT', url: 'http://server/v1/me/notification-preferences', auth: 'Bearer tok', type: 'application/json', body: '{"mutedKinds":["mention"]}' });
    // CONTROL, same `it`: post is untouched by the new verb.
    await client.post('/v1/x', { a: 1 }, 'tok');
    expect(seen[1]).toMatchObject({ method: 'POST', body: '{"a":1}' });

    // The stdio door: createSession re-authenticates ONCE on a 401 and repeats the PUT (the `get` rule, `session.ts:56-65`).
    const cfg = config();
    await writeCachedToken(cfg.tokenPath, { token: 'stale', userId: 'old' });
    const tokens: string[] = [];
    const fake: GisikClient = {
      ...NO_CLIENT_TRANSFER,
      get: async () => ({}),
      post: async (path) =>
        path === '/v1/mcp/device/code'
          ? { deviceCode: 'd', userCode: 'BCDF-GHJK', verificationUri: 'http://web/a', expiresInSec: 600, pollIntervalSec: 1 }
          : { status: 'issued', token: 'fresh', userId: '01J0USER0000000000000000BB' },
      put: async (_path, body, token) => {
        tokens.push(token);
        if (token === 'stale') throw new HttpError(401, { error: 'unauthenticated' });
        return { stored: body };
      },
    };
    const session = await createSession({ config: cfg, client: fake, prompt: () => {}, sleep: async () => {}, now: () => 0 });
    expect(await session.put('/v1/me/notification-preferences', { mutedKinds: [] })).toEqual({ stored: { mutedKinds: [] } });
    expect(tokens).toEqual(['stale', 'fresh']);

    // The deferred wrapper waits for the credential, then forwards.
    let opened = 0;
    const lazy = lazySession(async () => {
      opened += 1;
      return session;
    });
    expect(await lazy.put('/v1/x', { z: 1 })).toEqual({ stored: { z: 1 } });
    expect(opened).toBe(1);
  });
});
