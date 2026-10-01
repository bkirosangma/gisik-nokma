import type { FastifyInstance } from 'fastify';
import { createGisikClient, lazySession, type LazySession } from '@gisik-nokma/mcp-server';

/** The outer (real) caller of `/mcp`: the network identity the API's rate limiter keys on. */
export type OuterCaller = { ip: string; xff: string | undefined };

/**
 * A `typeof fetch` over `app.inject`, so the hosted MCP route runs the package's
 * tools against the API's OWN routes without a socket. The rate-limit hook runs
 * on every injected request, keyed by `remoteAddress` / `x-forwarded-for`, so the
 * OUTER caller's identity is passed through — otherwise every hosted user would
 * share `127.0.0.1`'s bucket (plan FD7).
 */
export function inProcessFetch(app: FastifyInstance, outer: OuterCaller): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const headers: Record<string, string> = {};
    new Headers(init?.headers).forEach((v, k) => {
      headers[k] = v;
    });
    if (outer.xff !== undefined) headers['x-forwarded-for'] = outer.xff;
    const res = await app.inject({
      method: (init?.method ?? 'GET') as 'GET' | 'POST',
      url: `${url.pathname}${url.search}`,
      headers,
      payload: typeof init?.body === 'string' ? init.body : undefined,
      remoteAddress: outer.ip,
    });
    const out = new Headers();
    for (const [k, v] of Object.entries(res.headers)) {
      if (v !== undefined) out.set(k, Array.isArray(v) ? v.join(', ') : String(v));
    }
    return new Response(res.body === '' ? null : res.body, { status: res.statusCode, headers: out });
  }) as typeof fetch;
}

/**
 * The package's `Session` for one hosted call: the caller's own access token,
 * over the in-process fetch. Same nine tools, same code as the stdio server.
 */
export function hostedSession(
  app: FastifyInstance,
  outer: OuterCaller,
  accessToken: string,
  userId: string,
): LazySession {
  const client = createGisikClient('http://in-process', inProcessFetch(app, outer));
  return lazySession(async () => ({
    userId: () => userId,
    get: (path) => client.get(path, accessToken),
    post: (path, body) => client.post(path, body, accessToken),
    postEvents: (events) => client.post('/v1/events', { events }, accessToken),
  }));
}
