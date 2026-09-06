import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  msUntilNextUtc,
  requirePositiveIntervalMs,
  startBackupDaemon,
  startScheduler,
  type ScheduledJob,
} from '../../src/ops/schedule.js';

describe('msUntilNextUtc', () => {
  /**
   * 13.9 — msUntilNextUtc returns the delay to a time still ahead today.
   * 20:00 → 21:00 is exactly one hour.
   */
  it('later today when the time is still ahead', () => {
    const from = new Date('2026-08-20T20:00:00.000Z');
    expect(msUntilNextUtc('21:00', from)).toBe(60 * 60 * 1000);
  });

  /**
   * 13.10 — a time already past rolls to tomorrow, not to a negative delay.
   * 21:30 → 21:00 is 23.5 hours.
   */
  it('tomorrow when the time has passed', () => {
    const from = new Date('2026-08-20T21:30:00.000Z');
    expect(msUntilNextUtc('21:00', from)).toBe(23.5 * 60 * 60 * 1000);
  });

  /**
   * 13.11 — a day-of-week constraint is honoured, asserted by the
   * resulting instant rather than by an arithmetic re-derivation. From
   * Thursday 2026-08-20, the next Sunday 22:00 UTC is
   * 2026-08-23T22:00:00.000Z.
   */
  it('honours a day-of-week (0 = Sunday): from Thursday 2026-08-20, next Sunday 22:00 is the 23rd', () => {
    const from = new Date('2026-08-20T12:00:00.000Z'); // a Thursday
    const ms = msUntilNextUtc('22:00', from, 0);
    expect(new Date(from.getTime() + ms).toISOString()).toBe('2026-08-23T22:00:00.000Z');
  });

  /**
   * 13.12 — planted defect: a malformed schedule time is refused and
   * NAMED. '9pm' throws an error containing '9pm', so an operator sees
   * which value they mistyped rather than a generic parse failure.
   */
  it('planted defect: a malformed time is refused, named', () => {
    expect(() => msUntilNextUtc('9pm', new Date())).toThrowError(/9pm/);
  });

  /**
   * The day-of-week half of the same refusal, and the reason it is not merely
   * symmetry: `getUTCDay()` returns 0-6 and nothing else, so a `dayOfWeek` the
   * clock can never equal makes the function's `while` condition permanently
   * true — an infinite loop with no exit, not a wrong answer. The daemon feeds
   * this straight from the environment
   * (`Number(process.env.LEDGER_EXPORT_DOW_UTC ?? '0')`), so a mistyped
   * deployment variable used to spin the backup worker at a full core forever:
   * no dump, no export, no alert, and a process App Platform still sees as
   * alive.
   *
   * `Number('sunday')` rather than a cast, because that IS what the call site
   * produces from a non-numeric value — the test mirrors production instead of
   * a shape production cannot reach. `7` and `-1` are the off-by-one ends a
   * clamp would have swallowed silently.
   *
   * ASSERTED AS SYNCHRONOUS THROWS, with a per-case timeout: the pre-fix
   * failure mode is not a wrong value but a call that never returns, and a
   * case that only asserted "throws" would hang rather than fail. `toThrowError`
   * on a spinning call never reaches its assertion at all, so the timeout is
   * the thing that turns a hang into a red test.
   */
  it.each([[7], [-1], [Number('sunday')]])(
    'a day-of-week outside 0-6 (%s) is refused, named — it does not spin the daemon forever',
    (dayOfWeek) => {
      expect(() => msUntilNextUtc('22:00', new Date('2026-08-20T12:00:00.000Z'), dayOfWeek)).toThrowError(
        /day-of-week/,
      );
      // The bad value itself is in the message, so an operator sees which
      // variable they mistyped rather than a generic range complaint.
      expect(() => msUntilNextUtc('22:00', new Date('2026-08-20T12:00:00.000Z'), dayOfWeek)).toThrowError(
        new RegExp(String(dayOfWeek).replace('-', '\\-')),
      );
    },
    5000,
  );

  it('a fractional day-of-week is refused too — 0-6 means the integers, not the range', () => {
    expect(() => msUntilNextUtc('22:00', new Date(), 3.5)).toThrowError(/day-of-week/);
  });

  it('the legitimate values still pass: every integer 0-6, and `undefined` for "any day"', () => {
    for (const dayOfWeek of [0, 1, 2, 3, 4, 5, 6]) {
      const from = new Date('2026-08-20T12:00:00.000Z');
      const ms = msUntilNextUtc('22:00', from, dayOfWeek);
      expect(new Date(from.getTime() + ms).getUTCDay()).toBe(dayOfWeek);
    }
    expect(msUntilNextUtc('21:00', new Date('2026-08-20T20:00:00.000Z'))).toBe(60 * 60 * 1000);
  });
});

/**
 * `startBackupDaemon` is the function that actually schedules production
 * backups, and its docblock makes two behavioural promises — "every failure is
 * written down AND handed to the alerter" and "the daemon re-arms rather than
 * dying". Both were previously asserted nowhere and existed only as a comment.
 * The re-arm case is the one that matters most: a scheduler that runs once and
 * stops looks identical to a working one for the first twenty-four hours.
 *
 * `advanceTimersByTimeAsync`, not the sync variant: the re-arm happens in a
 * `.finally()` after an async catch, so the microtasks between the two timers
 * have to be flushed or the second occurrence is asserted against a timer that
 * does not exist yet.
 */
const TIMES = { pgDumpTimeUtc: '21:00', ledgerExportTimeUtc: '22:00', ledgerExportDowUtc: 0 };
const HOUR = 60 * 60 * 1000;

describe('startBackupDaemon', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-20T20:00:00.000Z')); // a Thursday, an hour before the dump
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  /**
   * 13.25 — a failing backup job is written to stderr BY THE DAEMON, as
   * structured JSON, AND handed to the alerter.
   */
  /**
   * The alerter is deliberately NOT the only witness asserted here. Every real
   * `ErrorAlerter` this daemon can be handed may be silent — Task 3's
   * `NoopErrorAlerter.notify()` is an empty async function and `.env.example`
   * ships `ALERT_WEBHOOK_URL` empty, so the DEFAULT deployment gets it. If this
   * case only checked `notify`, moving the stderr line back into the alerter
   * (or deleting the shim, which is scheduled) would keep it green while every
   * backup failure went silent in production.
   */
  it('a failing job is written to stderr BY THE DAEMON and handed to the alerter', async () => {
    const stderr = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const notify = vi.fn();
    const runPgDump = vi.fn().mockRejectedValue(new Error('pg_dump exited 1'));
    const daemon = startBackupDaemon(
      { runPgDump, runLedgerExport: vi.fn().mockResolvedValue(undefined) },
      TIMES,
      { notify },
    );
    try {
      await vi.advanceTimersByTimeAsync(HOUR);
      expect(runPgDump).toHaveBeenCalledTimes(1);
      expect(notify).toHaveBeenCalledWith('backup:pg-dump', expect.any(Error));
      const logged = stderr.mock.calls.map((call) => String(call[0]));
      const line = logged.find((entry) => entry.includes('backup job failed'));
      expect(line, `no structured failure line in ${JSON.stringify(logged)}`).toBeDefined();
      expect(JSON.parse(line as string)).toMatchObject({
        level: 'error',
        job: 'pg-dump',
        error: 'pg_dump exited 1',
      });
    } finally {
      daemon.stop();
    }
  });

  /**
   * 13.27 — an alerter that THROWS is logged and swallowed; it does not
   * take the daemon down or skip the re-arm. Failing to report a failure
   * must not become a second failure.
   */
  it('an alerter that throws is logged and swallowed — it does not take the daemon down or skip the re-arm', async () => {
    const stderr = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const runPgDump = vi.fn().mockRejectedValue(new Error('pg_dump exited 1'));
    const daemon = startBackupDaemon(
      { runPgDump, runLedgerExport: vi.fn().mockResolvedValue(undefined) },
      TIMES,
      {
        notify: () => {
          throw new Error('webhook host is down');
        },
      },
    );
    try {
      await vi.advanceTimersByTimeAsync(HOUR);
      expect(runPgDump).toHaveBeenCalledTimes(1);
      const logged = stderr.mock.calls.map((call) => String(call[0]));
      expect(logged.some((entry) => entry.includes('backup alerter failed'))).toBe(true);
      await vi.advanceTimersByTimeAsync(24 * HOUR);
      expect(runPgDump).toHaveBeenCalledTimes(2);
    } finally {
      daemon.stop();
    }
  });

  /**
   * 13.26 — the daemon re-arms after a failure: the next night runs the
   * job again, and not one millisecond early.
   */
  it('re-arms after a failure: the next night runs the job again, on the same clock', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const runPgDump = vi.fn().mockRejectedValue(new Error('pg_dump exited 1'));
    const daemon = startBackupDaemon(
      { runPgDump, runLedgerExport: vi.fn().mockResolvedValue(undefined) },
      TIMES,
      { notify: vi.fn() },
    );
    try {
      await vi.advanceTimersByTimeAsync(HOUR); // 21:00 on the 20th
      expect(runPgDump).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(24 * HOUR - 1); // 20:59:59.999 on the 21st
      expect(runPgDump).toHaveBeenCalledTimes(1); // not early
      await vi.advanceTimersByTimeAsync(1); // 21:00 on the 21st
      expect(runPgDump).toHaveBeenCalledTimes(2);
    } finally {
      daemon.stop();
    }
  });

  /**
   * 13.28 — the weekly ledger export keeps its day-of-week across the
   * re-arm and does not degrade to nightly.
   */
  it('the weekly export keeps its day-of-week across the re-arm, and does not fire nightly', async () => {
    const runLedgerExport = vi.fn().mockResolvedValue(undefined);
    const daemon = startBackupDaemon(
      { runPgDump: vi.fn().mockResolvedValue(undefined), runLedgerExport },
      TIMES,
      { notify: vi.fn() },
    );
    try {
      await vi.advanceTimersByTimeAsync(2 * 24 * HOUR); // through Friday and Saturday
      expect(runLedgerExport).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(26 * HOUR); // Sunday the 23rd, 22:00 UTC
      expect(runLedgerExport).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(6 * 24 * HOUR); // six days on: still nothing
      expect(runLedgerExport).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(24 * HOUR); // the following Sunday
      expect(runLedgerExport).toHaveBeenCalledTimes(2);
    } finally {
      daemon.stop();
    }
  });

  /**
   * 13.29 — stop() clears the pending timers: the count goes 2 → 0, and a
   * fortnight of advanced time runs neither job.
   */
  it('stop() clears the pending timers — nothing runs after it, and nothing keeps the process alive', async () => {
    const runPgDump = vi.fn().mockResolvedValue(undefined);
    const runLedgerExport = vi.fn().mockResolvedValue(undefined);
    const daemon = startBackupDaemon({ runPgDump, runLedgerExport }, TIMES, { notify: vi.fn() });
    expect(vi.getTimerCount()).toBe(2);
    daemon.stop();
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(14 * 24 * HOUR);
    expect(runPgDump).not.toHaveBeenCalled();
    expect(runLedgerExport).not.toHaveBeenCalled();
  });
});

/**
 * `startScheduler` is the generalised primitive `startBackupDaemon` above now
 * wraps — it is proven, byte-for-byte, by every case in that `describe`
 * already, so this suite covers what a fixed two-job schedule cannot: an
 * arbitrary NUMBER of independent jobs, and `stop()` clearing every one of
 * their timers rather than just two.
 */
describe('startScheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('arms every job synchronously at construction — N jobs means N timers before any delay elapses', () => {
    const jobs: ScheduledJob[] = [
      { name: 'a', run: vi.fn().mockResolvedValue(undefined), delayMs: () => 1000 },
      { name: 'b', run: vi.fn().mockResolvedValue(undefined), delayMs: () => 2000 },
      { name: 'c', run: vi.fn().mockResolvedValue(undefined), delayMs: () => 3000 },
    ];
    const scheduler = startScheduler(jobs, { notify: vi.fn() });
    try {
      expect(vi.getTimerCount()).toBe(3);
    } finally {
      scheduler.stop();
    }
  });

  it("one job's failure and re-arm never affects another job's schedule", async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const failing = vi.fn().mockRejectedValue(new Error('job a exploded'));
    const steady = vi.fn().mockResolvedValue(undefined);
    const scheduler = startScheduler(
      [
        { name: 'a', run: failing, delayMs: () => 1000 },
        { name: 'b', run: steady, delayMs: () => 1000 },
      ],
      { notify: vi.fn() },
    );
    try {
      await vi.advanceTimersByTimeAsync(1000);
      expect(failing).toHaveBeenCalledTimes(1);
      expect(steady).toHaveBeenCalledTimes(1);
      // job 'a' re-arms despite failing, and job 'b' is unaffected by it.
      await vi.advanceTimersByTimeAsync(1000);
      expect(failing).toHaveBeenCalledTimes(2);
      expect(steady).toHaveBeenCalledTimes(2);
    } finally {
      scheduler.stop();
    }
  });

  it('each job re-arms on its OWN delayMs, independent of the others', async () => {
    const fast = vi.fn().mockResolvedValue(undefined);
    const slow = vi.fn().mockResolvedValue(undefined);
    const scheduler = startScheduler(
      [
        { name: 'fast', run: fast, delayMs: () => 100 },
        { name: 'slow', run: slow, delayMs: () => 10_000 },
      ],
      { notify: vi.fn() },
    );
    try {
      await vi.advanceTimersByTimeAsync(100);
      expect(fast).toHaveBeenCalledTimes(1);
      expect(slow).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(200); // two more 'fast' occurrences
      expect(fast).toHaveBeenCalledTimes(3);
      expect(slow).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(9700); // total 10,000ms elapsed
      expect(slow).toHaveBeenCalledTimes(1);
    } finally {
      scheduler.stop();
    }
  });

  /**
   * Regression flagged in review, not in the original plan (catalogued in the
   * `startScheduler` PENDING BLOCK in test-cases/13 — no id allocated yet):
   * if a LATER job's `delayMs()` throws, earlier jobs must not end up
   * with live, orphaned timers — `startScheduler` must arm all of them or
   * none of them. Before the fix, arming happened one job at a time in loop
   * order, so job 'a' (and 'b') got a real `setTimeout` before job 'c' ever
   * threw, and `startScheduler` propagated the exception with no `stop()` to
   * cancel what was already armed. `vi.getTimerCount()` after the throw is
   * the direct witness: 0 means "nothing was armed", matching this test;
   * before the fix it was 2 (the two jobs ahead of the throwing one) —
   * mutation-verified by reverting the fix's construction loop back to
   * `for (const job of jobs) loop(job);`, which reddens exactly this
   * assertion (at exactly 2, not some other count) with every sibling case
   * in this file, including the one directly below, still green.
   */
  it("a later job's throwing delayMs() leaves NO job armed — not even the earlier ones", () => {
    const a = { name: 'a', run: vi.fn().mockResolvedValue(undefined), delayMs: () => 1000 };
    const b = { name: 'b', run: vi.fn().mockResolvedValue(undefined), delayMs: () => 2000 };
    const c = {
      name: 'c',
      run: vi.fn().mockResolvedValue(undefined),
      delayMs: (): number => {
        throw new Error('NOTIFICATION_SWEEP_INTERVAL_MS must be a positive integer, got \'nope\'');
      },
    };
    expect(() => startScheduler([a, b, c], { notify: vi.fn() })).toThrowError(
      /NOTIFICATION_SWEEP_INTERVAL_MS/,
    );
    // The regression: this used to be 2 (job 'a' and 'b' already armed via
    // setTimeout before job 'c' threw), leaking timers `stop()` could never
    // reach because `startScheduler` never returned one.
    expect(vi.getTimerCount()).toBe(0);
  });

  it('a job earlier in the list throwing means nothing after it is even asked for a delay', () => {
    const bCalled = vi.fn(() => 1000);
    const a = {
      name: 'a',
      run: vi.fn().mockResolvedValue(undefined),
      delayMs: (): number => {
        throw new Error('a is misconfigured');
      },
    };
    const b = { name: 'b', run: vi.fn().mockResolvedValue(undefined), delayMs: bCalled };
    expect(() => startScheduler([a, b], { notify: vi.fn() })).toThrowError(/a is misconfigured/);
    expect(bCalled).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("stop() clears EVERY job's timer, not merely the first two", async () => {
    const jobs: ScheduledJob[] = Array.from({ length: 5 }, (_, i) => ({
      name: `job-${i}`,
      run: vi.fn().mockResolvedValue(undefined),
      delayMs: () => 1000,
    }));
    const scheduler = startScheduler(jobs, { notify: vi.fn() });
    expect(vi.getTimerCount()).toBe(5);
    scheduler.stop();
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(60_000);
    for (const job of jobs) {
      expect(job.run).not.toHaveBeenCalled();
    }
  });
});

/**
 * The interval-validator half of the "refuse, don't clamp" rule
 * `msUntilNextUtc`'s HH:MM and day-of-week checks already make above — this
 * is the same discipline applied to a plain millisecond interval, for the
 * notification-sweep job `backup-daemon-main.ts` adds on top of the
 * scheduler. Every legitimate value passes; every illegitimate one throws
 * synchronously, naming the value, rather than producing a tight re-arm loop
 * (`0`/negative) or a call that never fires (`NaN`).
 */
describe('requirePositiveIntervalMs', () => {
  it('a positive integer millisecond value passes through unchanged', () => {
    expect(requirePositiveIntervalMs(3_600_000, 'NOTIFICATION_SWEEP_INTERVAL_MS')).toBe(3_600_000);
    expect(requirePositiveIntervalMs(1, 'NOTIFICATION_SWEEP_INTERVAL_MS')).toBe(1);
  });

  it('zero is refused, named', () => {
    expect(() => requirePositiveIntervalMs(0, 'NOTIFICATION_SWEEP_INTERVAL_MS')).toThrowError(
      /NOTIFICATION_SWEEP_INTERVAL_MS.*'0'/,
    );
  });

  it('a negative value is refused, named', () => {
    expect(() => requirePositiveIntervalMs(-500, 'NOTIFICATION_SWEEP_INTERVAL_MS')).toThrowError(
      /NOTIFICATION_SWEEP_INTERVAL_MS.*'-500'/,
    );
  });

  it('NaN is refused, named', () => {
    expect(() => requirePositiveIntervalMs(Number('not-a-number'), 'X')).toThrowError(/X.*'NaN'/);
  });

  it('a non-integer (fractional) value is refused', () => {
    expect(() => requirePositiveIntervalMs(1000.5, 'X')).toThrowError(/X/);
  });

  it('Infinity is refused — finite is part of "positive integer", not assumed', () => {
    expect(() => requirePositiveIntervalMs(Number.POSITIVE_INFINITY, 'X')).toThrowError(/X/);
  });
});
