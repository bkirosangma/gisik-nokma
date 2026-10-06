import type { TimelineIndexResponse } from '@gisik-nokma/domain';
import type { Queryable } from '../db/queryable.js';
import { readAsOf } from './as-of.js';
import { freshCore } from './memo.js';
import type { ReadableWorkspace, TimelineScope } from './scope.js';

/**
 * PR-0: the whole scope's drawable entries, the flows' plan inputs, the tray's size and the cut. `asOf` is read BEFORE the load (D-W4-23).
 * The core is always computed here, and kept for the chunk and tray reads that follow (`memo.ts`, the owner's (b) ruling).
 */
export async function readTimelineIndex(
  db: Queryable,
  readable: readonly ReadableWorkspace[],
  viewerId: string,
  scope: TimelineScope,
  now: Date,
): Promise<TimelineIndexResponse> {
  const asOf = await readAsOf(db, readable);
  const core = await freshCore(db, readable, viewerId, scope, now, asOf);
  return { today: core.today, asOf, items: core.entries, flows: core.flows, tray: { count: core.tray.length }, truncated: core.truncated };
}
