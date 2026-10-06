import { TIMELINE_PAGE_SIZE, type TimelineTrayResponse } from '@gisik-nokma/domain';
import type { Queryable } from '../db/queryable.js';
import { readAsOf } from './as-of.js';
import { sharedCore } from './memo.js';
import type { ReadableWorkspace, TimelineScope } from './scope.js';

/** TG-6: the undated tray, a keyset page of `pageSize` after `cursor`, in `ticket_id` order (the core's), sliced from the core its index kept (`memo.ts`). */
export async function readTimelineTray(
  db: Queryable,
  readable: readonly ReadableWorkspace[],
  viewerId: string,
  scope: TimelineScope,
  now: Date,
  cursor?: string,
  pageSize: number = TIMELINE_PAGE_SIZE,
): Promise<TimelineTrayResponse> {
  const core = await sharedCore(db, readable, viewerId, scope, now, await readAsOf(db, readable));
  const rows = core.tray.filter((r) => cursor === undefined || r.id > cursor);
  const page = rows.slice(0, pageSize);
  return { items: page, nextCursor: rows.length > pageSize ? (page[page.length - 1]?.id ?? null) : null };
}
