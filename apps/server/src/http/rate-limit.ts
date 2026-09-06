export type RateLimitVerdict = { allowed: boolean; retryAfterSeconds: number };

export type RateLimiter = {
  check(key: string, nowMs: number): RateLimitVerdict;
};

/**
 * How many distinct keys may accumulate before an expired-window sweep runs.
 *
 * A sweep on every call would be O(keys) per request; never sweeping would let
 * one key per source address live for the life of the process. This is the
 * cheap middle: the map only grows past this size under a spread of sources
 * wide enough that the sweep is worth its cost, and every entry it removes is
 * already expired, so a sweep can never change a verdict.
 */
const SWEEP_THRESHOLD = 10_000;

/**
 * Fixed-window, in-memory, per-process.
 *
 * ## The clock is an ARGUMENT, and that is the whole testability seam
 *
 * `check(key, nowMs)` reads no clock of its own. That is what lets the window
 * RESET be proven — `check(k, 0)` then `check(k, 60_000)` — instead of slept
 * through: a test that had to wait out a real window would either take a real
 * minute or shrink the window to something no deployment uses. The app-level
 * wiring passes `Date.now` by default and takes an override for the same
 * reason (`security.now` in `app.ts`).
 *
 * ## Deliberately the FLOOR, not the ceiling
 *
 * One instance serves the dogfood, so one process-local map is the whole
 * limiter. The day a second instance exists this moves behind Redis and every
 * caller stays put: the call sites take a `RateLimiter`, and the config
 * contract (`RATE_LIMIT_*`) does not mention where the counters live.
 *
 * Fixed window rather than sliding: a caller can spend `max` at the end of one
 * window and `max` again at the start of the next, i.e. up to `2 × max` across
 * a window boundary. Named rather than hidden, because it is the known cost of
 * the cheapest correct implementation and it does not change what this control
 * is for — bounding sustained abuse, not smoothing bursts.
 */
export function makeFixedWindowLimiter(max: number, windowSec: number): RateLimiter {
  const windows = new Map<string, { count: number; resetAtMs: number }>();
  return {
    check(key, nowMs) {
      if (windows.size > SWEEP_THRESHOLD) {
        for (const [k, w] of windows) if (nowMs >= w.resetAtMs) windows.delete(k);
      }
      const current = windows.get(key);
      if (!current || nowMs >= current.resetAtMs) {
        windows.set(key, { count: 1, resetAtMs: nowMs + windowSec * 1000 });
        return { allowed: true, retryAfterSeconds: 0 };
      }
      current.count += 1;
      if (current.count > max) {
        // At least 1: `retry-after: 0` reads as "try again immediately", which
        // is the opposite of what a refusal in the last second of a window
        // means.
        return {
          allowed: false,
          retryAfterSeconds: Math.max(1, Math.ceil((current.resetAtMs - nowMs) / 1000)),
        };
      }
      return { allowed: true, retryAfterSeconds: 0 };
    },
  };
}

/**
 * The key a rate-limit bucket is counted under — and the one thing about this
 * limiter that an attacker must not be able to choose.
 *
 * ## Why this is not `request.ip`
 *
 * MEASURED against this repo's Fastify 5, not read: with `trustProxy: true`,
 * `request.ip` is the **LEFTMOST** `X-Forwarded-For` entry. That entry is
 * whatever the CALLER wrote. Six `POST /v1/events` from one caller, varying
 * only the first XFF entry, against a limiter set to `eventsMax: 1`:
 *
 *     varying the leftmost XFF   401,401,401,401,401,401   never limited
 *     unforged control           401,429,429,429,429,429   limited from the 2nd
 *
 * Every request minted a fresh bucket. The limiter was not weakened by that
 * configuration; it was switched off by it, using one header, and both of the
 * `trustProxy` tests that existed were blind to it because neither sent a chain
 * with more than one entry.
 *
 * ## Why the RIGHTMOST entry is the right answer
 *
 * A proxy APPENDS its observation of the peer to the right of whatever arrived.
 * So for a caller who sends `X-Forwarded-For: 1.1.1.1`, the header this server
 * sees is `1.1.1.1, <caller's real address>` — the caller controls every entry
 * EXCEPT the last, which the nearest trusted proxy wrote about the connection
 * it actually accepted. A proxy that REPLACES the header instead leaves exactly
 * one entry, which is that same observation. **Rightmost is correct under both
 * behaviours**, which matters because whether App Platform appends or replaces
 * is not established here and this must not depend on the answer.
 *
 * ## Why `request.ip` still exists and is still Fastify's
 *
 * `trustProxy` stays on the Fastify constructor and `request.ip` keeps meaning
 * what the deployment configured it to mean — it is what a log line should
 * carry. This function is deliberately a SECOND, narrower notion, because the
 * two have different requirements: a log wants the address the operator
 * configured Fastify to believe, and a limiter key must be unforgeable. The
 * earlier comment here argued that one derivation must serve both. That was
 * wrong, and the measurement above is why.
 *
 * With `trustProxy` off, there is no chain to read and the socket address is
 * both — so the two notions coincide, which is every test and every local run.
 */
export function rateLimitKeyFor(
  forwardedFor: string | string[] | undefined,
  socketIp: string,
  trustProxy: boolean,
): string {
  if (!trustProxy) return socketIp;
  // `string[]` when the header appeared more than once; the LAST occurrence is
  // the one the nearest proxy added, for the same reason the last entry is.
  const raw = Array.isArray(forwardedFor) ? forwardedFor[forwardedFor.length - 1] : forwardedFor;
  if (raw === undefined) return socketIp;
  const entries = raw.split(',').map((e) => e.trim()).filter((e) => e !== '');
  return entries.length === 0 ? socketIp : entries[entries.length - 1]!;
}
