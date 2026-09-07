import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createSession } from '../src/session.js';
import { HttpError, type GisikClient } from '../src/http-client.js';
import { writeCachedToken } from '../src/token-cache.js';
import { DEFAULT_POLL_INTERVAL_MS } from '../src/config.js';

/**
 * Plan: MCP server, Task 7. Cases 14.54–14.57.
 */
function scratchConfig() {
  return {
    serverUrl: 'http://server',
    tokenPath: join(mkdtempSync(join(tmpdir(), 'gisik-sess-')), 'mcp-token'),
    pollIntervalMs: DEFAULT_POLL_INTERVAL_MS,
  };
}

describe('the session', () => {
  it('14.54 uses a cached token without running the device flow', async () => {
    const config = scratchConfig();
    await writeCachedToken(config.tokenPath, { token: 'cached', userId: '01J0USER0000000000000000AA' });
    const post = vi.fn();
    const client: GisikClient = { get: async () => ({ ok: true }), post };

    const session = await createSession({
      config, client, prompt: () => {}, sleep: async () => {}, now: () => 0,
    });
    expect(session.userId()).toBe('01J0USER0000000000000000AA');
    expect(await session.get('/v1/me/workspaces')).toEqual({ ok: true });
    expect(post).not.toHaveBeenCalled();
  });

  it('14.55 a 401 re-runs the device flow and retries the call ONCE', async () => {
    const config = scratchConfig();
    await writeCachedToken(config.tokenPath, { token: 'stale', userId: 'old' });
    let gets = 0;
    const client: GisikClient = {
      get: async (_path, token) => {
        gets += 1;
        if (token === 'stale') throw new HttpError(401, { error: 'unauthenticated' });
        return { ok: true };
      },
      post: async (path) =>
        path === '/v1/mcp/device/code'
          ? { deviceCode: 'd', userCode: 'BCDF-GHJK', verificationUri: 'http://web/a', expiresInSec: 600, pollIntervalSec: 1 }
          : { status: 'issued', token: 'fresh', userId: '01J0USER0000000000000000BB' },
    };

    const session = await createSession({
      config, client, prompt: () => {}, sleep: async () => {}, now: () => 0,
    });
    expect(await session.get('/v1/me/workspaces')).toEqual({ ok: true });
    expect(gets).toBe(2);
    // The user id must move with the token. A stale id would make every write's
    // `actorId` disagree with the session and draw an identity-spoof refusal
    // from the permission gate — a confusing failure a long way from its cause.
    expect(session.userId()).toBe('01J0USER0000000000000000BB');
  });

  it('14.56 a second 401 is surfaced, not looped on', async () => {
    const config = scratchConfig();
    await writeCachedToken(config.tokenPath, { token: 'stale', userId: 'old' });
    let gets = 0;
    const client: GisikClient = {
      get: async () => { gets += 1; throw new HttpError(401, { error: 'unauthenticated' }); },
      post: async (path) =>
        path === '/v1/mcp/device/code'
          ? { deviceCode: 'd', userCode: 'BCDF-GHJK', verificationUri: 'http://web/a', expiresInSec: 600, pollIntervalSec: 1 }
          : { status: 'issued', token: 'fresh', userId: 'u' },
    };
    const session = await createSession({
      config, client, prompt: () => {}, sleep: async () => {}, now: () => 0,
    });
    await expect(session.get('/v1/x')).rejects.toBeInstanceOf(HttpError);
    // Exactly twice: the original and one retry. An unbounded re-auth loop
    // against a server that 401s everything would spin forever and spend the
    // device-flow rate-limit budget doing it.
    expect(gets).toBe(2);
  });

  it('14.57 a 404 is NOT a re-auth trigger — it is the answer', async () => {
    const config = scratchConfig();
    await writeCachedToken(config.tokenPath, { token: 'good', userId: 'u' });
    const post = vi.fn();
    const client: GisikClient = {
      get: async () => { throw new HttpError(404, { error: 'not_found' }); },
      post,
    };
    const session = await createSession({ config, client, prompt: () => {}, sleep: async () => {}, now: () => 0 });
    await expect(session.get('/v1/x')).rejects.toMatchObject({ status: 404, body: { error: 'not_found' } });
    expect(post).not.toHaveBeenCalled();
  });
});
