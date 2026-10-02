import { bumpReadEpoch } from '../read-epoch.js';

export const LIVE_QUERY_CACHE_TTL_MS = 10 * 60_000;
export const LIVE_QUERY_CACHE_MAX = 200;

type Entry = { data: unknown; at: number };
const entries = new Map<string, Entry>();

/**
 * The key `useLiveQuery` stores a `cacheKey` under: the workspace first, then
 * the caller's own namespaced key (`board:<project>`, `list:<project>:<filter>`).
 * The workspace is in the key so two workspaces that name a read the same way
 * never share an answer, and so a freshness sweep can read the workspace back
 * off a key (smoothness T4).
 */
export function liveQueryStoreKey(workspaceId: string, cacheKey: string): string {
  return `${workspaceId}\u0000${cacheKey}`;
}

/** The last answer for `key`, if younger than the TTL. Insertion order is recency: a hit is re-inserted. */
export function recallLiveQuery<T>(key: string, now: number = Date.now()): T | undefined {
  const entry = entries.get(key);
  if (entry === undefined) return undefined;
  if (now - entry.at > LIVE_QUERY_CACHE_TTL_MS) {
    entries.delete(key);
    return undefined;
  }
  entries.delete(key);
  entries.set(key, entry);
  return entry.data as T;
}

export function rememberLiveQuery<T>(key: string, data: T, now: number = Date.now()): void {
  entries.delete(key);
  entries.set(key, { data, at: now });
  while (entries.size > LIVE_QUERY_CACHE_MAX) {
    const oldest = entries.keys().next().value;
    if (oldest === undefined) break;
    entries.delete(oldest);
  }
}

/** A read the server refused is not an answer worth serving again: drop what the key held. */
export function forgetLiveQuery(key: string): void {
  entries.delete(key);
}

export function liveQueryAgeMs(key: string, now: number = Date.now()): number | null {
  const entry = entries.get(key);
  return entry === undefined ? null : now - entry.at;
}

/**
 * The workspaces with at least one entry older than `olderThanMs`, read back off the
 * `liveQueryStoreKey` prefix: what the freshness sweep reloads on focus (smoothness T4,
 * spec D13; audit SM-15). A key with no workspace prefix is not one this cache wrote
 * through `useLiveQuery`, and answers nothing here.
 */
export function staleWorkspaces(olderThanMs: number, now: number = Date.now()): string[] {
  const stale = new Set<string>();
  for (const [key, entry] of entries) {
    const cut = key.indexOf('\u0000');
    if (cut > 0 && now - entry.at > olderThanMs) stale.add(key.slice(0, cut));
  }
  return [...stale];
}

/**
 * Sign-out, the 401 redirects and a change of signed-in person call this: a
 * cache is per person, never per device. It also moves the read epoch, so a read
 * that was in flight for the previous person can neither write into the cache
 * nor be shared with the next person's identical read (`read-epoch.ts`).
 */
export function clearLiveQueryCache(): void {
  entries.clear();
  bumpReadEpoch();
}
