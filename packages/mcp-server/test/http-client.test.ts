import { describe, expect, it } from 'vitest';
import { createGisikClient, HttpError, TransportError } from '../src/http-client.js';

/**
 * Plan: MCP server, Task 6. Cases 14.44–14.47.
 */
describe('the HTTP client', () => {
  it('14.44 sends the token as a bearer credential and returns the parsed body', async () => {
    let seen: Request | undefined;
    const client = createGisikClient('http://server', async (input, init) => {
      seen = new Request(input as string, init);
      return new Response(JSON.stringify({ workspaces: [] }), {
        status: 200, headers: { 'content-type': 'application/json' },
      });
    });
    expect(await client.get('/v1/me/workspaces', 'tok')).toEqual({ workspaces: [] });
    expect(seen?.url).toBe('http://server/v1/me/workspaces');
    expect(seen?.headers.get('authorization')).toBe('Bearer tok');
    // No cookie, ever. A bearer-only caller is outside the HTTP-Origin check by
    // construction, and sending one would put this client inside a CSRF
    // control it has no business being inside.
    expect(seen?.headers.get('cookie')).toBeNull();
  });

  it('14.45 throws HttpError carrying the server body VERBATIM', async () => {
    const client = createGisikClient('http://server', async () =>
      new Response(JSON.stringify({ error: 'not_found' }), {
        status: 404, headers: { 'content-type': 'application/json' },
      }),
    );
    await expect(client.get('/v1/x', 'tok')).rejects.toMatchObject({
      status: 404,
      body: { error: 'not_found' },
    });
    await expect(client.get('/v1/x', 'tok')).rejects.toBeInstanceOf(HttpError);
  });

  it('14.46 turns an unreachable server into a TransportError, and does NOT retry', async () => {
    let calls = 0;
    const client = createGisikClient('http://server', async () => {
      calls += 1;
      throw new TypeError('fetch failed');
    });
    await expect(client.post('/v1/events', { events: [] }, 'tok')).rejects.toBeInstanceOf(TransportError);
    // The spec's reasoning, pinned: an assistant retrying a write against an
    // unreachable server risks a double-submit once connectivity returns
    // mid-retry, which is worse than surfacing the failure once.
    expect(calls).toBe(1);
  });

  it('14.47 posts with no token when there is none — the device flow needs that', async () => {
    let seen: Request | undefined;
    const client = createGisikClient('http://server', async (input, init) => {
      seen = new Request(input as string, init);
      return new Response(JSON.stringify({ status: 'pending' }), {
        status: 200, headers: { 'content-type': 'application/json' },
      });
    });
    await client.post('/v1/mcp/device/token', { deviceCode: 'd' }, null);
    expect(seen?.headers.get('authorization')).toBeNull();
  });
});
