import { describe, expect, it } from 'vitest';
import { isSignInPath, makeFixedWindowLimiter, signInMaxFor } from '../../src/http/rate-limit.js';

/**
 * Plan 11 Task 2 — the fixed-window limiter, unit level.
 *
 * **Nothing here sleeps, and that is the design rather than a convenience.**
 * `check(key, nowMs)` takes the clock as an argument, so "the window resets" is
 * an assertion about two numbers instead of a wait. A test that had to sleep
 * out a real window would either take a minute or shrink `windowSec` to a value
 * no deployment uses — and would then be asserting about a different limiter
 * than the one that ships.
 */
/**
 * 13.125 — cited on the block: `makeFixedWindowLimiter` unit coverage — max-then-refuse with bounded retry hints, key independence, and the window reset proven by a CLOCK ARGUMENT rather than by sleeping.
 */
describe('fixed-window rate limiter', () => {
  it('allows up to max within the window, then refuses with a retry hint', () => {
    const limiter = makeFixedWindowLimiter(3, 60);
    const t0 = 1_000_000;
    expect(limiter.check('ip:1', t0).allowed).toBe(true);
    expect(limiter.check('ip:1', t0 + 10).allowed).toBe(true);
    expect(limiter.check('ip:1', t0 + 20).allowed).toBe(true);
    const fourth = limiter.check('ip:1', t0 + 30);
    expect(fourth.allowed).toBe(false);
    expect(fourth.retryAfterSeconds).toBeGreaterThan(0);
    expect(fourth.retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  it('keys are independent', () => {
    const limiter = makeFixedWindowLimiter(1, 60);
    expect(limiter.check('ip:1', 0).allowed).toBe(true);
    expect(limiter.check('ip:2', 1).allowed).toBe(true);
    expect(limiter.check('ip:1', 2).allowed).toBe(false);
  });

  it('the window resets — proven by the clock argument, not by sleeping', () => {
    const limiter = makeFixedWindowLimiter(1, 60);
    expect(limiter.check('ip:1', 0).allowed).toBe(true);
    expect(limiter.check('ip:1', 59_999).allowed).toBe(false);
    expect(limiter.check('ip:1', 60_000).allowed).toBe(true);
  });

  /**
   * `retry-after: 0` reads as "try again immediately", which is the opposite of
   * what a refusal in the final millisecond of a window means. The floor of 1
   * is the only thing between a client's back-off loop and a hot spin.
   */
  it('never advises a retry-after of 0, even in the last millisecond of a window', () => {
    const limiter = makeFixedWindowLimiter(1, 60);
    limiter.check('ip:1', 0);
    const refused = limiter.check('ip:1', 59_999);
    expect(refused.allowed).toBe(false);
    expect(refused.retryAfterSeconds).toBe(1);
  });

  /**
   * The refusal must be REPEATED, not one-shot. A limiter that let the second
   * over-budget request through would be no limiter at all — and an
   * implementation that reset the counter when it refused would pass every
   * check above this one.
   */
  it('keeps refusing for the rest of the window', () => {
    const limiter = makeFixedWindowLimiter(2, 60);
    expect(limiter.check('ip:1', 0).allowed).toBe(true);
    expect(limiter.check('ip:1', 1).allowed).toBe(true);
    expect(limiter.check('ip:1', 2).allowed).toBe(false);
    expect(limiter.check('ip:1', 3).allowed).toBe(false);
    expect(limiter.check('ip:1', 59_000).allowed).toBe(false);
    expect(limiter.check('ip:1', 60_000).allowed).toBe(true);
  });
});

/**
 * The sign-in path matcher — the one place in the limiter where a decision is
 * made from a string the CALLER wrote.
 *
 * The three existing buckets classify by `request.routeOptions.url`, the
 * Fastify route PATTERN, which no caller can influence. A per-path bucket under
 * a wildcard mount has no such luxury: every auth path arrives as
 * `/api/auth/*`, so the only way to tell a sign-in from a session read is to
 * read the request-target. This repo has already measured what happens when a
 * limiter trusts caller-written input — six requests varying `X-Forwarded-For`
 * bought six buckets and switched the limiter off rather than weakening it
 * (`rateLimitKeyFor`'s docblock) — so the spellings below are the ones that
 * measurement says to go looking for.
 *
 * **Every ambiguous case resolves toward MATCHING.** A false positive costs the
 * caller one unit of its own budget on a path that then 404s; a false negative
 * hands the request the general budget, which is twice the size. Only the
 * second is a bypass, and that asymmetry is what makes the aggressive
 * normalisation safe rather than reckless.
 */
describe('isSignInPath', () => {
  /**
   * 13.277 — every alternative spelling of a sign-in path that still reaches the vendor handler is matched, and the paths better-auth never tightened are not.
   *
   * A table rather than one case per spelling, and the negative rows are half
   * the point: a matcher that returned `true` unconditionally would satisfy
   * every positive row here, and `/api/auth/get-session` is the row that
   * refuses it. That row is not decoration — `get-session` is the highest-
   * frequency path a signed-in client uses, so a matcher that swept it into a
   * half-size budget would be a self-inflicted outage, not a tightening.
   */
  it.each([
    // ── reaches a sign-in handler ⇒ must be charged the tighter bucket ──
    ['/api/auth/sign-in/magic-link', true, 'the plain spelling'],
    ['/api/auth/magic-link/verify?token=abc', true, 'query string — better-auth reads the pathname only, and so must this'],
    ['/api/auth/sign-in/magic-link/', true, 'trailing slash — `normalizePathname` strips it, so the handler sees the same path'],
    ['/api/auth/x/../sign-in/magic-link', true, 'dot segment — `new URL()` resolves it and the vendor mount builds its Request the same way'],
    ['/api/auth//sign-in/magic-link', true, 'doubled slash — `pathname` keeps `//` verbatim, so the mount strip would otherwise leave `//sign-in`'],
    ['/api/auth/SIGN-IN/magic-link', true, 'mixed case — STRICTER than better-auth, whose own matcher is case sensitive'],
    ['/api/auth/%73ign-in/magic-link', true, 'percent-encoded `s` — matched via the decoded candidate'],
    ['/api/auth/sign-in/magic-link#frag', true, 'fragment — never sent by a client, and free to handle'],
    ['/api/auth/sign-up/email', true, 'sign-up: better-auth gave it the same 3-per-10s rule as sign-in'],
    ['/api/auth/change-email', true, 'changing the address a magic link is sent TO is a sign-in-adjacent act, and better-auth tightened it'],
    ['/api/auth/sign-in/%zz', true, 'malformed escape INSIDE a sign-in path — decoding throws and the RAW candidate still matches, which is why the decode failure must not abandon the raw one'],

    // ── never tightened by better-auth ⇒ must fall through to the general bucket ──
    ['/api/auth/get-session', false, 'the highest-frequency signed-in path; sweeping it in would be an outage'],
    ['/api/auth/sign-out', false, 'ending a session is not issuing a credential'],
    ['/api/auth/anything', false, 'the general auth budget still covers everything else'],
    ['/api/auth/%zz', false, 'malformed escape and nothing else: this row asserted `true` when first written, on the theory that an unparseable target should get the tighter bucket — and it was the EXPECTATION that was wrong. `new URL()` does not throw on a bad escape, it hands back the target verbatim; only `decodeURIComponent` throws. So no router can decode it either, it reaches no sign-in handler, and there is nothing here to over-match toward'],
    ['/api/auth/phone-number/send-otp', false, 'better-auth bounded it at 10/60s — already the shipped RATE_LIMIT_AUTH_MAX default, so no loss to repay'],
    ['/api/auth', false, 'the mount root itself'],
    ['/v1/events', false, 'not under the mount at all'],
  ])('%s → %s (%s)', (target, expected) => {
    expect(isSignInPath(target)).toBe(expected);
  });
});

/**
 * The sign-in budget's derivation.
 */
describe('signInMaxFor', () => {
  /**
   * 13.279 — the sign-in budget is better-auth's own magic-link max at the shipped default, is never zero, and is never larger than the budget it tightens.
   *
   * The first row is the parity claim this whole change is justified by, pinned
   * as an assertion so it cannot drift into being merely asserted in prose. The
   * other two are the invariants that make the control real: a bucket of 0
   * refuses the FIRST request (a total sign-in outage, reachable at the legal
   * `RATE_LIMIT_AUTH_MAX=1`), and a bucket larger than `authMax` can never be
   * the binding constraint, which would make the whole bucket dead code.
   */
  it('returns better-auth’s magic-link max at the shipped default, and stays a real bound everywhere else', () => {
    // `RATE_LIMIT_AUTH_MAX` default is 10 (`config.ts`); better-auth's
    // magic-link plugin enforced `max: 5` (`plugins/magic-link/index.mjs:202`).
    expect(signInMaxFor(10)).toBe(5);
    // The dev stack's value, read from the running container, against which the
    // e2e suite spends 14 charges.
    expect(signInMaxFor(60)).toBe(30);
    for (const authMax of [1, 2, 3, 4, 5, 9, 10, 11, 60, 1000]) {
      expect(signInMaxFor(authMax)).toBeGreaterThanOrEqual(1);
      expect(signInMaxFor(authMax)).toBeLessThanOrEqual(authMax);
    }
  });
});
