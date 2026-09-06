import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { msUntilNextUtc, startBackupDaemon } from '../../src/ops/schedule.js';

describe('msUntilNextUtc', () => {
  it('later today when the time is still ahead', () => {
    const from = new Date('2026-08-20T20:00:00.000Z');
    expect(msUntilNextUtc('21:00', from)).toBe(60 * 60 * 1000);
  });

  it('tomorrow when the time has passed', () => {
    const from = new Date('2026-08-20T21:30:00.000Z');
    expect(msUntilNextUtc('21:00', from)).toBe(23.5 * 60 * 60 * 1000);
  });

  it('honours a day-of-week (0 = Sunday): from Thursday 2026-08-20, next Sunday 22:00 is the 23rd', () => {
    const from = new Date('2026-08-20T12:00:00.000Z'); // a Thursday
    const ms = msUntilNextUtc('22:00', from, 0);
    expect(new Date(from.getTime() + ms).toISOString()).toBe('2026-08-23T22:00:00.000Z');
  });

  it('planted defect: a malformed time is refused, named', () => {
    expect(() => msUntilNextUtc('9pm', new Date())).toThrowError(/9pm/);
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
