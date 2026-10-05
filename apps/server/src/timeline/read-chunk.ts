import { TIMELINE_PAGE_SIZE, type TimelineChunkResponse } from '@gisik-nokma/domain';
import type { Queryable } from '../db/queryable.js';
import { computeScope } from './compute.js';
import type { ReadableWorkspace, TimelineScope } from './scope.js';

/**
 * PR-1: the DETAILS of the entries with a segment overlapping `window` (both ends inclusive), in `ticket_id` order, a keyset page of
 * `pageSize` after `cursor`. It recomputes the scope core (D-W4-16: no server-side plan memo).
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
  const core = await computeScope(db, readable, viewerId, scope, now);
  const hit = core.entries
    .filter((e) => e.segments.some((s) => s.start <= window.to && s.end >= window.from)) // inclusive both ends
    .filter((e) => cursor === undefined || e.id > cursor)
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  const page = hit.slice(0, pageSize);
  return {
    items: page.map((e) => core.details.get(e.id)).filter((d): d is NonNullable<typeof d> => d !== undefined),
    nextCursor: hit.length > pageSize ? (page[page.length - 1]?.id ?? null) : null,
  };
}
