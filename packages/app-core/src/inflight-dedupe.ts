import type { DataSource, DataSourceQuery } from './data-source.js';
import { readEpoch } from './read-epoch.js';

/**
 * Identical reads in flight share one promise. Keyed by method + JSON args; writes
 * and the stream are untouched.
 *
 * The key carries the read epoch, so a read issued after a sign-out (a different
 * person, perhaps) never joins one still in flight from before it. A shared
 * promise settles for every caller with the same object: callers read it, they
 * do not mutate it (the views derive, they never write back into a read).
 */
export function withInflightDedupe(source: DataSource): DataSource {
  const inflight = new Map<string, Promise<unknown>>();
  const query = {} as Record<string, (...args: unknown[]) => Promise<unknown>>;
  for (const [name, fn] of Object.entries(source.query) as Array<[string, (...args: unknown[]) => Promise<unknown>]>) {
    query[name] = (...args: unknown[]) => {
      const key = `${readEpoch()}\u0000${name}\u0000${JSON.stringify(args)}`;
      const hit = inflight.get(key);
      if (hit !== undefined) return hit;
      const promise = fn.apply(source.query, args).finally(() => inflight.delete(key));
      inflight.set(key, promise);
      return promise;
    };
  }
  return {
    ingest: (events) => source.ingest(events),
    query: query as unknown as DataSourceQuery,
    subscribe: (workspaceId, afterSeq, cb) => source.subscribe(workspaceId, afterSeq, cb),
  };
}
