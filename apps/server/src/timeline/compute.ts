import { istDayOf } from '@gisik-nokma/domain';
import type { Queryable } from '../db/queryable.js';
import { cardKeysFor } from '../read/ticket-cards.js';
import { assembleScope, DEFAULT_LIMITS, mergeCores, type Limits, type ScopeCore } from './assemble.js';
import { loadPins, loadWorkspace } from './load.js';
import type { ReadableWorkspace, TimelineScope } from './scope.js';

/**
 * The ONE core the index, chunk, tray (and Part 5's `get_timeline`) slice. Planning runs per flow component inside `assembleScope`.
 * The reads reach it through `memo.ts` (the index computes and keeps it per viewer; a chunk or tray slices the kept one).
 */
export async function computeScope(
  db: Queryable,
  readable: readonly ReadableWorkspace[],
  viewerId: string,
  scope: TimelineScope,
  now: Date,
  limits: Limits = DEFAULT_LIMITS,
): Promise<ScopeCore> {
  const today = istDayOf(now.toISOString());
  const cores = await Promise.all(
    readable.map(async ({ workspaceId, eff }) => {
      const loaded = await loadWorkspace(db, eff, viewerId, workspaceId, scope);
      const keys = await cardKeysFor(db, loaded.rows);
      const pins = await loadPins(db, eff, viewerId, loaded.tickets.filter((t) => t.inScope).map((t) => t.id));
      return assembleScope({ tickets: loaded.tickets, edges: loaded.edges, keys, pins, today }, limits);
    }),
  );
  return mergeCores(today, cores, limits);
}
