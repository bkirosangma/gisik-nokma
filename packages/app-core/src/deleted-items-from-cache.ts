import type { DeletedItem } from '@gisik-nokma/domain';

/**
 * The Deleted items list as last read ONLINE on this device, served while the
 * device cannot reach the server (trash series Plan 3, D9; spec §6.3: "the
 * replica serves it offline").
 *
 * A REJECTION, not a resolve: `getDeletedItems()` promises the current list,
 * and a saved copy is not that. A view that knows the difference draws the
 * copy with its instant and without its buttons; a caller that does not is
 * told something went wrong rather than shown an old list as a fresh one. It
 * lives in its own module so a view can read it — by NAME, like
 * `ReplicaGapError` — without importing the replica.
 */
export class DeletedItemsFromCache extends Error {
  readonly items: DeletedItem[];
  readonly fetchedAt: string;
  constructor(items: DeletedItem[], fetchedAt: string) {
    super(`Deleted items as read online at ${fetchedAt}; the device cannot reach the server now`);
    this.name = 'DeletedItemsFromCache';
    this.items = items;
    this.fetchedAt = fetchedAt;
  }
}

export function cachedDeletedItemsOf(cause: unknown): { items: DeletedItem[]; fetchedAt: string } | null {
  if (!(cause instanceof Error) || cause.name !== 'DeletedItemsFromCache') return null;
  const candidate = cause as Partial<DeletedItemsFromCache>;
  return Array.isArray(candidate.items) && typeof candidate.fetchedAt === 'string'
    ? { items: candidate.items, fetchedAt: candidate.fetchedAt }
    : null;
}
