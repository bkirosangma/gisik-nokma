import { HttpError } from '../../src/http-client.js';
import type { Session } from '../../src/session.js';
import { NO_TRANSFER } from './fake-session.js';

/** One request a tool made. `EVENTS` is `postEvents`; its `body` is the array of events. */
export type Recorded = { method: 'GET' | 'POST' | 'PUT' | 'EVENTS'; path: string; body?: unknown };
/** A canned answer, or a function of (body, path) that answers or throws (an `HttpError`, say). */
export type Route = unknown | ((body: unknown, path: string) => unknown | Promise<unknown>);

const COMMITTED = { status: 'committed', eventId: 'e', seq: 1, serverTime: '2026-10-03T00:00:00.000Z' };

/**
 * A `Session` that records every request and answers by route (MCP sweep 2). Keys are `"GET /path"`,
 * `"POST /path"`, `"PUT /path"`; a key matches the full path or the path before its `?`. A request with no
 * route is a 404 (`HttpError`), as the product answers a thing the caller may not see. `postEvents` answers
 * one committed result per event unless `opts.events` says otherwise.
 */
export function recordingSession(opts: {
  userId?: string;
  routes?: Record<string, Route>;
  events?: (events: Array<Record<string, unknown>>) => unknown;
} = {}): { session: Session; requests: Recorded[] } {
  const requests: Recorded[] = [];
  const answer = async (method: 'GET' | 'POST' | 'PUT', path: string, body?: unknown): Promise<unknown> => {
    requests.push(body === undefined ? { method, path } : { method, path, body });
    const hit = [`${method} ${path}`, `${method} ${path.split('?')[0]}`].find((key) => opts.routes !== undefined && Object.hasOwn(opts.routes, key));
    if (hit === undefined || opts.routes === undefined) throw new HttpError(404, { error: 'not_found' });
    const route = opts.routes[hit];
    return typeof route === 'function' ? await (route as (b: unknown, p: string) => unknown)(body, path) : route;
  };
  const session: Session = {
    ...NO_TRANSFER,
    userId: () => opts.userId ?? '01J0A5ER0000000000000000AA',
    get: (path) => answer('GET', path),
    post: (path, body) => answer('POST', path, body),
    put: (path, body) => answer('PUT', path, body),
    postEvents: async (events) => {
      requests.push({ method: 'EVENTS', path: '/v1/events', body: events });
      const list = events as Array<Record<string, unknown>>;
      return opts.events !== undefined ? opts.events(list) : { results: list.map(() => COMMITTED) };
    },
  };
  return { session, requests };
}

/** Every `postEvents` batch, in order. */
export function eventBatches(requests: Recorded[]): Array<Array<Record<string, unknown>>> {
  return requests.filter((r) => r.method === 'EVENTS').map((r) => r.body as Array<Record<string, unknown>>);
}
