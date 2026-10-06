import { TIMELINE_PAGE_SIZE, type TimelineChunkResponse, type TimelineEntry } from '@gisik-nokma/domain';
import type { Queryable } from '../db/queryable.js';
import { readAsOf } from './as-of.js';
import { sharedCore } from './memo.js';
import type { ReadableWorkspace, TimelineScope } from './scope.js';

/**
 * PR-1: the DETAILS of the entries with a segment overlapping `window` (both ends inclusive), in `ticket_id` order (the core's:
 * `mergeCores` sorts the entries across workspaces), a keyset page of `pageSize` after `cursor`. It slices the core its index
 * kept when that is younger than the TTL, and computes it otherwise (`memo.ts`: the owner's (b) ruling reverses D-W4-16 here).
 */
export async function readTimelineChunk(
  db: Queryable,
  readable: readonly ReadableWorkspace[],
  viewerId: string,
  scope: TimelineScope,
  now: Date,
  window: { from: string; to: string },
  cursor?: string,
  pageSize: number = TIMELINE_PAGE_SIZE,
): Promise<TimelineChunkResponse> {
  const core = await sharedCore(db, readable, viewerId, scope, now, await readAsOf(db, readable));
  const hit = core.entries
    .filter((e) => e.segments.some((s) => s.start <= window.to && s.end >= window.from)) // inclusive both ends
    .filter((e) => cursor === undefined || e.id > cursor);
  const page = hit.slice(0, pageSize);
  return {
    items: page.map((e) => core.details.get(e.id)).filter((d): d is NonNullable<typeof d> => d !== undefined),
    nextCursor: hit.length > pageSize ? (page[page.length - 1] as TimelineEntry).id : null,
  };
}
