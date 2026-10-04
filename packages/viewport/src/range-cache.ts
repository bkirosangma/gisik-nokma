/**
 * The per-scope cache of loaded chunks and the whole-scope interval index (spec PR-6). PURE: plain maps, no clock,
 * no fetch. The same idea as the list's session cache (`cacheKey`, `ticket-list.tsx`): a return to the same scope reuses
 * what was loaded.
 *
 * A live event patches the cache two ways:
 * - an event that changes ONE entry (title, assignee, state, dates, ...) patches that entry wherever it is held
 *   (`patchEntry`), with no refetch;
 * - an event that could ADD an entry the cache cannot know about marks the chunk STALE (`markStale`). A stale chunk is
 *   still returned by `getChunk` (stale-while-revalidate), so a refetch never blanks the screen; `putChunk` replaces
 *   it and clears the mark.
 */
export type Identified = { id: string };

export type CachedChunk<D extends Identified> = { items: readonly D[]; stale: boolean };

export class RangeCache<I extends Identified, D extends Identified> {
  private index: I[] | null = null;
  private readonly chunks = new Map<number, { items: D[]; stale: boolean }>();

  constructor(readonly scopeKey: string) {}

  setIndex(entries: readonly I[]): void {
    this.index = [...entries];
  }

  getIndex(): readonly I[] | null {
    return this.index;
  }

  /** Replaces the chunk's items and clears its stale mark. */
  putChunk(chunk: number, items: readonly D[]): void {
    this.chunks.set(chunk, { items: [...items], stale: false });
  }

  /** The chunk as drawn, stale or not; undefined when never loaded. */
  getChunk(chunk: number): CachedChunk<D> | undefined {
    return this.chunks.get(chunk);
  }

  has(chunk: number): boolean {
    return this.chunks.has(chunk);
  }

  loadedChunks(): Set<number> {
    return new Set(this.chunks.keys());
  }

  entriesIn(chunk: number): number {
    return this.chunks.get(chunk)?.items.length ?? 0;
  }

  entryCount(): number {
    let n = 0;
    for (const c of this.chunks.values()) n += c.items.length;
    return n;
  }

  /** Marks a loaded chunk stale. Returns false when the chunk is not loaded (nothing to refetch yet). */
  markStale(chunk: number): boolean {
    const held = this.chunks.get(chunk);
    if (held === undefined) return false;
    held.stale = true;
    return true;
  }

  staleChunks(): number[] {
    return [...this.chunks].filter(([, c]) => c.stale).map(([k]) => k).sort((a, b) => a - b);
  }

  evict(chunk: number): void {
    this.chunks.delete(chunk);
  }

  /** Patches one entry of the index and every chunk copy of it. Returns how many places changed; 0 means the id is unknown here. */
  patchEntry(id: string, patchIndex: (entry: I) => I, patchDetail: (detail: D) => D): number {
    let n = 0;
    if (this.index !== null) {
      const i = this.index.findIndex((e) => e.id === id);
      if (i >= 0) {
        this.index[i] = patchIndex(this.index[i] as I);
        n += 1;
      }
    }
    for (const held of this.chunks.values()) {
      const j = held.items.findIndex((d) => d.id === id);
      if (j >= 0) {
        held.items[j] = patchDetail(held.items[j] as D);
        n += 1;
      }
    }
    return n;
  }
}

/** Several scopes at once, least recently used dropped past `max`. */
export class ScopeCaches<I extends Identified, D extends Identified> {
  private readonly scopes = new Map<string, RangeCache<I, D>>();

  constructor(private readonly max = 4) {}

  /** The cache for `scopeKey` (sorted workspace ids, sorted project ids, the Me / Everyone flag), created on first use. */
  get(scopeKey: string): RangeCache<I, D> {
    const held = this.scopes.get(scopeKey);
    if (held !== undefined) {
      this.scopes.delete(scopeKey);
      this.scopes.set(scopeKey, held);
      return held;
    }
    const fresh = new RangeCache<I, D>(scopeKey);
    this.scopes.set(scopeKey, fresh);
    while (this.scopes.size > this.max) {
      const oldest = this.scopes.keys().next().value as string;
      this.scopes.delete(oldest);
    }
    return fresh;
  }

  keys(): string[] {
    return [...this.scopes.keys()];
  }
}

/** The scope key: sorted ids, so the same scope picked in another order is the same cache. */
export function scopeKey(workspaceIds: readonly string[], projectIds: readonly string[], mine: boolean): string {
  return `${[...workspaceIds].sort().join(',')}|${[...projectIds].sort().join(',')}|${mine ? 'me' : 'all'}`;
}
