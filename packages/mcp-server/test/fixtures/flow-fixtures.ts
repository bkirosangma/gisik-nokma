import { HttpError } from '../../src/http-client.js';
import type { Session } from '../../src/session.js';
import { NO_TRANSFER } from './fake-session.js';

export const ulid = (tag: string): string => `01J0${tag}`.padEnd(26, '0');
export const ME = ulid('ME');
export const WS = ulid('WS');
export const COMMITTED = { status: 'committed', eventId: 'e', seq: 1, serverTime: '2026-10-03T10:00:00.000Z' };

type Responder = unknown | ((path: string) => unknown);
type PostResponder = unknown | ((body: unknown) => unknown);

/**
 * A fake `Session` that records every request. `routes` answers GETs by exact path (or `path?query`; a function
 * answers with the full path, so it can read the query). `posts` answers JSON POSTs by path. `results` answers
 * `postEvents` per batch (index, events); the default is one COMMITTED result per event. An unknown GET is the
 * product's 404, so "not visible to you" is exercised for free.
 */
export function fakeFlow(
  routes: Record<string, Responder> = {},
  opts: { posts?: Record<string, PostResponder>; results?: (batchIndex: number, events: unknown[]) => unknown[] | undefined } = {},
) {
  const gets: string[] = [];
  const posts: Array<{ path: string; body: unknown }> = [];
  const batches: Array<Array<Record<string, unknown>>> = [];
  const session: Session = {
    userId: () => ME,
    get: async (path) => {
      gets.push(path);
      for (const [p, r] of Object.entries(routes)) {
        if (path === p || path.startsWith(`${p}?`)) return typeof r === 'function' ? (r as (x: string) => unknown)(path) : r;
      }
      throw new HttpError(404, { error: 'not_found' });
    },
    post: async (path, body) => {
      posts.push({ path, body });
      const r = opts.posts?.[path];
      if (r === undefined) throw new HttpError(404, { error: 'not_found' });
      return typeof r === 'function' ? (r as (x: unknown) => unknown)(body) : r;
    },
    postEvents: async (events) => {
      batches.push(events as Array<Record<string, unknown>>);
      return { results: opts.results?.(batches.length - 1, events) ?? events.map(() => COMMITTED) };
    },
    ...NO_TRANSFER,
  };
  return { session, gets, posts, batches };
}

/** The ticket-detail answer the tools read: draft flag, type, state. */
export const detail = (over: { key?: string | null; draft?: boolean; typeId?: string; stateId?: string; stateCategory?: string; links?: unknown[]; outcome?: string | null; rank?: string | null } = {}) => ({
  key: over.key === undefined ? 'GN-1' : over.key, title: 'A ticket',
  ticketState: {
    // Drafts T4 G7: a draft's detail carries `ticketState.draft` (no top-level flag on the server's read).
    ...(over.draft === true ? { draft: { authorId: 'u-author', at: '2026-10-03T00:00:00.000Z' } } : {}),
    fields: {}, rank: over.rank ?? null, workflowId: 'wf', workflowVersion: 1, typeId: over.typeId ?? 'task',
    stateId: over.stateId ?? 'todo', stateCategory: over.stateCategory ?? 'active', outcome: over.outcome ?? null, links: over.links ?? [],
  },
  rollup: null,
});
