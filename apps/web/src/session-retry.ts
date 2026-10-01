/**
 * The session read's retry clock (SYS-01).
 *
 * better-fetch's `BetterFetchError` carries `status`, `statusText` and the body
 * and NOT the response headers, so a 429's `Retry-After` never reaches
 * `session.error`. `auth-client.ts` therefore reads it off the response in an
 * `onResponse` hook and leaves it here for the shell notice's backoff to take.
 * Kept in its own module because tests replace `auth-client.ts` wholesale with a
 * `vi.mock`, and a store living there would vanish with it.
 */
let retryAfterMs: number | null = null;

/** `Retry-After` is either delay-seconds or an HTTP date; anything else is no answer. */
export function parseRetryAfter(value: string | null | undefined, now: number = Date.now()): number | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  if (trimmed === '') return null;
  if (/^\d+(\.\d+)?$/.test(trimmed)) return Math.round(Number(trimmed) * 1000);
  const at = Date.parse(trimmed);
  return Number.isNaN(at) ? null : Math.max(0, at - now);
}

/** Remember the server's wait from a 429 response (either header spelling). */
export function noteRetryAfter(response: { status: number; headers: { get(name: string): string | null } }): void {
  if (response.status !== 429) return;
  retryAfterMs = parseRetryAfter(response.headers.get('retry-after') ?? response.headers.get('x-retry-after'));
}

/** The wait the server asked for, once — a later retry must not reuse a stale one. */
export function takeRetryAfterMs(): number | null {
  const value = retryAfterMs;
  retryAfterMs = null;
  return value;
}

/** Exponential backoff, 1 s doubling to a 30 s ceiling; the server's own wait wins when it gave one. */
export function retryDelayMs(attempt: number, serverWaitMs: number | null): number {
  if (serverWaitMs !== null) return Math.min(Math.max(serverWaitMs, 1000), 120_000);
  return Math.min(1000 * 2 ** attempt, 30_000);
}
