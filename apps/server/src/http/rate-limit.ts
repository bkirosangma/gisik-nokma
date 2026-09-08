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

/**
 * The mount the vendor auth handler answers on, and the prefix this matcher
 * strips before testing anything. One constant rather than a literal in two
 * places: `app.ts` routes on the Fastify PATTERN `/api/auth/*` and this
 * function works on the request PATH, and the day the mount moves both must
 * move together.
 */
const AUTH_MOUNT = '/api/auth';

/**
 * The paths better-auth gave a TIGHTER rule than its own global default, read
 * out of the installed `better-auth@1.7.2` rather than from its documentation:
 *
 * | path (after the mount is stripped)                    | window | max | source |
 * |-------------------------------------------------------|--------|-----|--------|
 * | `/sign-in/magic-link`, `/magic-link/verify`            | 60s    |  5  | `plugins/magic-link/index.mjs:197-203` |
 * | `/sign-in*`, `/sign-up*`, `/change-password*`, `/change-email*` | 10s | 3 | `api/rate-limiter/index.mjs:302-310` |
 * | `/request-password-reset`, `/send-verification-email`, `/forget-password*` | 60s | 3 | same, second rule |
 * | `/phone-number*`                                       | 60s    | 10 | `plugins/phone-number/index.mjs:45-50` |
 *
 * **`/phone-number*` is deliberately ABSENT from the list below.** better-auth
 * bounded it at 10 per 60s, which is exactly the shipped default of
 * `RATE_LIMIT_AUTH_MAX` over `RATE_LIMIT_WINDOW_SEC` — so disabling better-auth
 * cost that path nothing, and adding it here would be a tightening BEYOND
 * parity rather than a restoration of it. The named loss this bucket exists to
 * repay is the one the controller ruling names, and that is the sign-in family.
 *
 * `/sign-out`, `/get-session` and the session-management paths are absent for
 * the opposite reason: better-auth never tightened them, they are the
 * high-frequency ones a signed-in client actually uses, and charging them to a
 * half-size budget would be a self-inflicted outage wearing a security label.
 *
 * Prefix semantics are better-auth's own — a bare `startsWith`, so
 * `/sign-in-anything` matches. That over-matches, and over-matching is the safe
 * direction here; see `isSignInPath`.
 */
const SIGN_IN_PREFIXES = [
  '/sign-in',
  '/sign-up',
  '/magic-link',
  '/change-email',
  '/change-password',
  '/forget-password',
  '/request-password-reset',
  '/send-verification-email',
] as const;

/**
 * Collapse one candidate spelling of a path to the form the prefixes are
 * written in.
 *
 * Three normalisations, each closing a spelling that would otherwise reach the
 * vendor handler while missing the prefix test:
 *
 * * **repeated slashes** — `/api/auth//sign-in/magic-link`. `new URL()` keeps
 *   `//` verbatim in `pathname`, so without this the mount strip yields
 *   `//sign-in/magic-link` and no prefix matches.
 * * **trailing slashes** — `/api/auth/sign-in/magic-link/`. better-auth strips
 *   these itself (`normalizePathname` in `@better-auth/core/utils/url`), so the
 *   handler sees the same path either way and this matcher must too.
 * * **case** — better-auth's own matchers are case SENSITIVE. Lowercasing here
 *   is deliberately STRICTER than the vendor was: if its router ever dispatches
 *   a mixed-case spelling, that spelling reached a sign-in handler while
 *   better-auth's own rule did not fire on it. Matching it costs a request that
 *   404s one unit of the tighter budget; not matching it is a bypass.
 */
function normalizeAuthPath(pathname: string): string {
  const collapsed = pathname.replace(/\/{2,}/g, '/').replace(/\/+$/, '');
  const lowered = collapsed.toLowerCase();
  return lowered.startsWith(`${AUTH_MOUNT}/`) ? lowered.slice(AUTH_MOUNT.length) : lowered;
}

/**
 * Does this request-target belong to the sign-in family — i.e. must it be
 * charged to the tighter `signin:` bucket ON TOP OF the general `auth:` one?
 *
 * ## Why this cannot key off `request.routeOptions.url`
 *
 * Every path under the vendor mount arrives at the limiter hook with
 * `routeOptions.url === '/api/auth/*'` — the route PATTERN, not the path. The
 * three existing buckets all classify by exact pattern, which is why none of
 * them could ever tell a sign-in from a session read. A per-path bucket has no
 * choice but to read `request.url`, and `request.url` is written by the caller.
 * That is the whole hazard, and this repo has a recorded precedent for it: the
 * `X-Forwarded-For` measurement in `rateLimitKeyFor` above, where one header
 * the caller controlled switched the limiter off rather than weakening it.
 *
 * ## The rule that makes every judgement call here safe: OVER-MATCH
 *
 * A false POSITIVE charges the tighter bucket to a request that did not need
 * it — costing one unit of the caller's OWN budget, on a path that then very
 * likely 404s. A false NEGATIVE drops the request through to the general
 * budget, which is twice the size. **Only one of those is a bypass**, so every
 * ambiguous spelling below is resolved by matching rather than by skipping,
 * including a request-target this function cannot parse at all.
 *
 * ## What is normalised, and why each one is a real spelling
 *
 * `new URL(target, base).pathname` is the same construction the mount handler
 * itself performs (`auth/routes.ts`: `new URL(request.url, baseUrl)`), so it is
 * the vendor's own view of the path, not a second opinion invented here. It
 * strips the query and fragment, and it RESOLVES dot segments — which is the
 * load-bearing one: `/api/auth/x/../sign-in/magic-link` reaches the magic-link
 * handler, because better-auth builds its `Request` from exactly this
 * construction, and a literal `startsWith` on the raw target would not have
 * seen a sign-in at all.
 *
 * Percent-encoding is tried as a SECOND candidate rather than a replacement: a
 * target is a match if either its raw or its decoded spelling matches. Decoding
 * can throw on a malformed escape (`%zz`), and a throw here means "keep the raw
 * spelling", never "give up and return false".
 *
 * ## The `catch` around the URL parse is UNREACHABLE from the only call site
 *
 * Stated because the earlier comment sold it as live safety, and a comment
 * asserting a property no input can demonstrate is this repo's own
 * "check that cannot fail" in prose form. `new URL(t, base)` does throw for
 * some strings — `http://[`, `http://%%`, `////` and others, measured — but
 * none can arrive here: `app.ts` consults this function only when
 * `routeOptions.url === '/api/auth/*'`, which requires a target literally
 * beginning `/api/auth/`, and such a target is path-only and never throws.
 * Everything that does throw is either answered 400 by Fastify's URL sanitiser
 * before any `onRequest` hook runs, or reaches the hook with
 * `routeOptions.url === undefined` and never enters the auth branch.
 *
 * The branch stays, and returns the over-matching value, because it is the
 * correct answer IF the call site ever widens — but it is defence in depth, not
 * a path anything exercises today, and no test claims otherwise.
 */
export function isSignInPath(requestTarget: string): boolean {
  let pathname: string;
  try {
    // The base is a placeholder; only the path is ever read from the result.
    // `.invalid` is the reserved TLD, so this can never resolve to a real host
    // even if a future edit hands the URL to something that fetches.
    pathname = new URL(requestTarget, 'http://rate-limit.invalid').pathname;
  } catch {
    // Unreachable from the current call site — see the docblock. Kept because
    // the over-matching answer is the right one if it ever becomes reachable.
    /* c8 ignore next */
    return true;
  }
  const candidates = [pathname];
  try {
    const decoded = decodeURIComponent(pathname);
    if (decoded !== pathname) candidates.push(decoded);
  } catch {
    // Malformed escape. The raw candidate stands; no information is lost.
  }
  return candidates.some((candidate) => {
    const normalized = normalizeAuthPath(candidate);
    return SIGN_IN_PREFIXES.some((prefix) => normalized.startsWith(prefix));
  });
}

/**
 * The sign-in bucket's budget, derived from the general auth budget rather than
 * configured beside it.
 *
 * ## THIS IS NOT PARITY. It is between 2.5x and 5x TIGHTER, and the number 5
 * ## matching is a coincidence of integers, not of budgets.
 *
 * An earlier version of this comment, and of three other places, called 5 "the
 * parity value" because better-auth's magic-link plugin enforced `max: 5`. That
 * claim was wrong, and review caught it. **better-auth keyed per (ip, PATH)** —
 * `createRateLimitKey(ip ?? NO_TRUSTED_IP_KEY, path)`,
 * `api/rate-limiter/index.mjs:245` — so `/sign-in/magic-link` and
 * `/magic-link/verify` each had their OWN 5-per-60s bucket, i.e. **five
 * complete sign-in cycles**, and `/sign-up*`, `/change-email*` and the rest
 * each had another. This bucket is keyed on the CLIENT alone and spans all
 * eight prefixes, so a cycle costs two charges of one shared budget:
 *
 *     better-auth, per client:   5 complete magic-link cycles per 60s
 *     this bucket, per client:   2 complete cycles per 60s  (measured)
 *
 * The change's own reasoning already contained the contradiction — the
 * dev-headroom argument below depends on a cycle costing two, and a cycle
 * costing two is exactly what makes 5 not parity. Both sentences cannot stand.
 *
 * It is kept at a half because the DIRECTION is the one the ruling wanted
 * (tighter per attacker) and because the alternative — restoring better-auth's
 * per-path keying — would mint eight buckets to repay a loss the ruling
 * described in one line. **But it is a tightening beyond what was authorised,
 * so it is named here rather than sold as parity, and the operational cost is
 * named with it: where one client key covers many humans — a NAT'd office
 * egress, or the single proxied key the dev stack itself has — the whole key
 * gets two sign-in cycles a minute.** Under `TRUST_PROXY` in production the key
 * is the real client address, so this is per-person there.
 *
 * ## Why a fraction and not a constant
 *
 * A hard-coded 5 stops being a tightening the moment an operator lowers the
 * auth budget beneath it (at `authMax: 4` a bucket of 5 can never bind and is
 * dead code), and stops being proportionate the moment they raise it.
 *
 * **It is also not a rate.** This function never sees `windowSec`, so "5" is 5
 * per `RATE_LIMIT_WINDOW_SEC`, not 5 per 60s: an operator setting the legal
 * `RATE_LIMIT_WINDOW_SEC=10` gets 5 per 10s and nothing here notices.
 *
 * The half also carries a MEASURED deployment fact. The dev stack sets
 * `RATE_LIMIT_AUTH_MAX=60` because its web container proxies every browser into
 * a single client key, and the e2e suite spends 14 charges on this bucket
 * (seven sign-in cycles, each costing two because better-auth's rule matched
 * `/magic-link/verify` as well as `/sign-in/magic-link`). Half of 60 is 30, so
 * one expression ships parity in production and leaves the suite its headroom,
 * without a second environment variable that would then need keeping in step.
 *
 * ## The two invariants, both load-bearing and both tested
 *
 * * **Never 0.** `authMax` is only constrained positive, so at `authMax: 1` the
 *   floor alone yields 0 — and a bucket of 0 refuses the FIRST request, turning
 *   a tightening into a total sign-in outage.
 * * **Never above `authMax`.** The sign-in bucket is charged in addition to the
 *   general one, so a budget larger than `authMax` could never be the binding
 *   constraint and this whole control would be inert.
 */
export function signInMaxFor(authMax: number): number {
  return Math.max(1, Math.floor(authMax / 2));
}
