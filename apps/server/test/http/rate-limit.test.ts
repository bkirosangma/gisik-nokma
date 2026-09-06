import { describe, expect, it } from 'vitest';
import { makeFixedWindowLimiter } from '../../src/http/rate-limit.js';

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
