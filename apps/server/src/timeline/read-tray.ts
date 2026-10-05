import { TIMELINE_PAGE_SIZE, type TimelineTrayResponse } from '@gisik-nokma/domain';
import type { Queryable } from '../db/queryable.js';
import { computeScope } from './compute.js';
import type { ReadableWorkspace, TimelineScope } from './scope.js';

/** TG-6: the undated tray, a keyset page of `pageSize` after `cursor`, in `ticket_id` order (the core's order). */
export async function readTimelineTray(
  db: Queryable,
  readable: readonly ReadableWorkspace[],
  viewerId: string,
  scope: TimelineScope,
  now: Date,
  cursor?: string,
  pageSize: number = TIMELINE_PAGE_SIZE,
): Promise<TimelineTrayResponse> {
  const core = await computeScope(db, readable, viewerId, scope, now);
  const rows = core.tray.filter((r) => cursor === undefined || r.id > cursor);
  const page = rows.slice(0, pageSize);
  return { items: page, nextCursor: rows.length > pageSize ? (page[page.length - 1]?.id ?? null) : null };
}
