import type { DataSource, DataSourceQuery } from './data-source.js';
import { readEpoch } from './read-epoch.js';

/** The `DataSourceQuery` members that are reads. Anything else under `query` (`putPreferences`) is a write: never shared, and it moves the generation. */
const isRead = (name: string): boolean => name.startsWith('get') || name.startsWith('search') || name === 'purgedAmong';

/**
 * Identical reads in flight share one promise. Keyed by method + JSON args.
 *
 * ## What a shared read may NOT be
 *
 * A read issued after something changed must not join one issued before it: the
 * joiner would be handed an answer describing a moment that had passed, and
 * nothing re-renders until the next frame (the failure `use-live-query.ts`'s
 * `issuedRef` was written against). So the key carries two counters:
 *
 * - **the read epoch** (`read-epoch.ts`): a sign-out moves it, so the next person
 *   never joins the previous person's read;
 * - **a generation**, local to this decorated source: it moves when a write is
 *   submitted AND when it settles (`ingest`, and `putPreferences`), and when a
 *   stream `event`, `purge` or `refresh` frame is delivered to any subscriber.
 *   A reload that follows a write, or a second reload wave that follows a second
 *   frame, therefore asks again instead of joining a read the change overtook.
 *
 * Writes and the stream are otherwise the source's own. A shared promise settles
 * for every caller with the same object, so a caller must not mutate what a read
 * returns.
 */
export function withInflightDedupe(source: DataSource): DataSource {
  const inflight = new Map<string, Promise<unknown>>();
  let generation = 0;
  const query = {} as Record<string, (...args: unknown[]) => Promise<unknown>>;
  for (const [name, fn] of Object.entries(source.query) as Array<[string, (...args: unknown[]) => Promise<unknown>]>) {
    if (!isRead(name)) {
      query[name] = async (...args: unknown[]) => {
        generation += 1;
        try {
          return await fn.apply(source.query, args);
        } finally {
          generation += 1;
        }
      };
      continue;
    }
    query[name] = (...args: unknown[]) => {
      const key = `${readEpoch()}\u0000${generation}\u0000${name}\u0000${JSON.stringify(args)}`;
      const hit = inflight.get(key);
      if (hit !== undefined) return hit;
      const promise = fn.apply(source.query, args).finally(() => inflight.delete(key));
      inflight.set(key, promise);
      return promise;
    };
  }
  return {
    async ingest(events) {
      generation += 1;
      try {
        return await source.ingest(events);
      } finally {
        generation += 1;
      }
    },
    query: query as unknown as DataSourceQuery,
    subscribe: (workspaceId, afterSeq, cb) =>
      source.subscribe(workspaceId, afterSeq, (item) => {
        if (item.type === 'event' || item.type === 'purge' || item.type === 'refresh') generation += 1;
        cb(item);
      }),
  };
}
