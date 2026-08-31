import type { DataSource } from './data-source.js';
import type { ClientStateCache } from './cache.js';

/**
 * Decorator: an ordinary DataSource whose getTicket / getWorkflowDef results
 * feed the pre-check cache, and whose stream frames invalidate it. Views stay
 * ignorant of caching; the shell composes this once.
 *
 * The direction is one-way on purpose. Reads FEED the cache; nothing is ever
 * SERVED from it. A cache hit that short-circuited a read would put a snapshot
 * on the screen as a fact, and the client would quietly disagree with the
 * server about what the viewer is looking at — the cache is pre-check fuel, and
 * the seam that keeps it fuel is right here.
 */
export function withCacheFeed(source: DataSource, cache: ClientStateCache): DataSource {
  return {
    ingest: (events) => source.ingest(events),
    query: {
      ...source.query,
      async getTicket(workspaceId, ticketId) {
        const read = await source.query.getTicket(workspaceId, ticketId);
        if (read !== null) cache.upsertTicket(read.ticket);
        return read;
      },
      async getWorkflowDef(workspaceId, workflowId, version) {
        const def = await source.query.getWorkflowDef(workspaceId, workflowId, version);
        if (def !== null) cache.upsertWorkflowDef(def);
        return def;
      },
    },
    subscribe(workspaceId, afterSeq, cb) {
      return source.subscribe(workspaceId, afterSeq, (item) => {
        if (item.type === 'event') cache.noteEvent(item.envelope);
        cb(item);
      });
    },
  };
}
