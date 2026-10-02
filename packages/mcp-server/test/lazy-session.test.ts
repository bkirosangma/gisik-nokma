import { describe, expect, it } from 'vitest';
import { lazySession } from '../src/lazy-session.js';
import type { Session } from '../src/session.js';
import { NO_TRANSFER } from './fixtures/fake-session.js';

/**
 * MCP CRUD plan, lane-3 review fix (2026-10-01). Case 14.316.
 *
 * `lazySession.post` was covered only through 14.301's red run on the hosted door; this pins the forwarding
 * itself, against a resolved session that records what reaches it.
 */
describe('lazySession', () => {
  it('14.316 post waits for the credential and forwards path and body to the resolved session; get still does', async () => {
    const calls: Array<[string, string, unknown]> = [];
    let opened = 0;
    const lazy = lazySession(async () => {
      opened += 1;
      const resolved: Session = {
        userId: () => 'u1',
        get: async (path) => { calls.push(['get', path, undefined]); return { got: path }; },
        post: async (path, body) => { calls.push(['post', path, body]); return { posted: path }; },
        ...NO_TRANSFER,
        postEvents: async () => { throw new Error('not used'); },
      };
      return resolved;
    });

    // `post` is the FIRST call: it must open the session itself (no `ready()`), then forward.
    expect(await lazy.post('/v1/workspaces', { name: 'Shop' })).toEqual({ posted: '/v1/workspaces' });
    expect(calls).toEqual([['post', '/v1/workspaces', { name: 'Shop' }]]);
    expect(opened).toBe(1);

    // CONTROL, same `it`: `get` forwards through the same resolved session, which is opened once.
    expect(await lazy.get('/v1/me/workspaces')).toEqual({ got: '/v1/me/workspaces' });
    expect(calls[1]).toEqual(['get', '/v1/me/workspaces', undefined]);
    expect(opened).toBe(1);
  });
});
