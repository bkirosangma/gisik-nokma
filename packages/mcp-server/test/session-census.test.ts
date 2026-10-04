import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_POLL_INTERVAL_MS } from '../src/config.js';
import type { GisikClient } from '../src/http-client.js';
import { lazySession } from '../src/lazy-session.js';
import { createSession, type Session } from '../src/session.js';
import { writeCachedToken } from '../src/token-cache.js';
import { NO_CLIENT_TRANSFER, NO_TRANSFER } from './fixtures/fake-session.js';

const VERBS = ['userId', 'get', 'post', 'put', 'postEvents', 'getBytes', 'postMultipart'] as const satisfies readonly (keyof Session)[];
/** Red at TYPECHECK when `Session` gains a verb this list does not name: add it here, then to every builder. */
type Unlisted = Exclude<keyof Session, (typeof VERBS)[number]>;
const everyVerbListed: [Unlisted] extends [never] ? true : never = true;

function missingVerbs(session: object): string[] {
  return VERBS.filter((verb) => typeof (session as Record<string, unknown>)[verb] !== 'function');
}

describe('every Session builder carries every verb', () => {
  it('14.601 createSession, lazySession and the NO_* fixtures have all of them, and the census names a builder that lacks one', async () => {
    expect(everyVerbListed).toBe(true);
    const dir = mkdtempSync(join(tmpdir(), 'gisik-census-'));
    const tokenPath = join(dir, 'mcp-token');
    await writeCachedToken(tokenPath, { token: 't', userId: 'U' });
    const client: GisikClient = { ...NO_CLIENT_TRANSFER, get: async () => ({}), post: async () => ({}), put: async () => ({}) };
    const real = await createSession({ config: { serverUrl: 'http://server', tokenPath, pollIntervalMs: DEFAULT_POLL_INTERVAL_MS }, client, prompt: () => {}, sleep: async () => {}, now: () => 0 });
    expect(missingVerbs(real)).toEqual([]);
    expect(missingVerbs(lazySession(async () => real))).toEqual([]);
    expect(missingVerbs({ userId: () => 'U', get: async () => ({}), post: async () => ({}), postEvents: async () => ({}), ...NO_TRANSFER })).toEqual([]);
    expect(Object.keys(NO_CLIENT_TRANSFER).sort()).toEqual(['getBytes', 'postMultipart', 'put']);
    // CONTROL, same `it`: the census is not vacuous.
    const { put: _dropped, ...short } = real;
    expect(missingVerbs(short)).toEqual(['put']);
  });
});
