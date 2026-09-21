import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GROSS_CLOCK_SKEW_MS, STREAM_ERROR_CODES } from '@gisik-nokma/domain';
import { ClockSkewBadge, formatClockSkew } from '../src/history/clock-skew-badge.js';
import { SyncStatusBar, syncErrorNotice, syncStatusLabel } from '../src/sync/sync-status-bar.js';

describe('clock skew in history', () => {
  /**
   * 12.28 — sub-threshold skew renders nothing (12.211), gross skew in both directions renders attributed to the device clock (12.212), and an unreadable client or server instant is flagged as unreadable rather than hidden (12.213/12.214).
   */
  it('12.211 — no badge under the gross threshold — both clocks are simply kept', () => {
    expect(
      formatClockSkew({ clientTime: '2026-08-20T12:00:30.000Z', serverTime: '2026-08-20T12:00:00.000Z' }),
    ).toBeNull();
  });

  it('12.212 — planted defect: an 11-minute skew renders the flag, attributed to the device clock', () => {
    const text = formatClockSkew({
      clientTime: '2026-08-20T12:11:00.000Z',
      serverTime: '2026-08-20T12:00:00.000Z',
    });
    expect(text).toBe('device clock ran 11 min ahead of the server');
    render(
      <ClockSkewBadge env={{ clientTime: '2026-08-20T11:49:00.000Z', serverTime: '2026-08-20T12:00:00.000Z' }} />,
    );
    expect(screen.getByText('device clock ran 11 min behind the server')).toBeTruthy();
  });

  it('12.213 — an unparseable client claim is flagged, not hidden', () => {
    expect(formatClockSkew({ clientTime: 'garbage', serverTime: '2026-08-20T12:00:00.000Z' })).toBe(
      'device clock claim unreadable',
    );
  });

  it('12.214 — an unparseable SERVER time is flagged the same way — the gate is symmetric', () => {
    expect(formatClockSkew({ clientTime: '2026-08-20T12:00:00.000Z', serverTime: 'garbage' })).toBe(
      'device clock claim unreadable',
    );
  });

  /**
   * 12.196 — THE THRESHOLD IS THE DOMAIN'S, AND IT IS INCLUSIVE.
   *
   * `hasGrossClockSkew` compares `>=` against `GROSS_CLOCK_SKEW_MS`. A test
   * that only checked 30 s and 11 min leaves the boundary itself unpinned, and
   * a gate closing one end of a range is a defect class this branch has
   * already paid for. Both sides are asserted, from the domain's own constant
   * rather than a `600000` restated here — if the threshold moves, this test
   * moves with it and keeps testing the boundary rather than a stale number.
   */
  it('12.196 — exactly at the threshold flags; one millisecond under does not', () => {
    const server = '2026-08-20T12:00:00.000Z';
    const at = new Date(Date.parse(server) + GROSS_CLOCK_SKEW_MS).toISOString();
    const under = new Date(Date.parse(server) + GROSS_CLOCK_SKEW_MS - 1).toISOString();
    expect(formatClockSkew({ clientTime: at, serverTime: server })).toBe('device clock ran 10 min ahead of the server');
    expect(formatClockSkew({ clientTime: under, serverTime: server })).toBeNull();
  });

  it('12.197 — no badge renders at all when the clocks agree', () => {
    const { container } = render(
      <ClockSkewBadge env={{ clientTime: '2026-08-20T12:00:00.000Z', serverTime: '2026-08-20T12:00:00.000Z' }} />,
    );
    expect(container.innerHTML).toBe('');
  });
});

describe('sync status bar', () => {
  /**
   * 12.29 — re-filed as 12.215: sync status labels for waiting-claim count, offline, catching-up, and a rendered 'needs attention' failed-count badge.
   */
  it('12.215 — says how many claims wait, and that offline search is the offline copy story', () => {
    expect(syncStatusLabel('live', 0)).toBe('Live');
    expect(syncStatusLabel('live', 3)).toBe('3 claims waiting to send');
    expect(syncStatusLabel('offline', 3)).toBe('Offline — 3 claims waiting to send');
    expect(syncStatusLabel('offline', 1)).toBe('Offline — 1 claim waiting to send');
    expect(syncStatusLabel('catching-up', 0)).toBe('Catching up…');
    render(<SyncStatusBar status="offline" queued={2} failed={1} />);
    expect(screen.getByRole('status').textContent).toContain('Offline — 2 claims waiting to send');
    expect(screen.getByRole('status').textContent).toContain('1 needs attention');
  });

  it('12.198 — the remaining two statuses, and a clean client shows no failure chrome', () => {
    expect(syncStatusLabel('connecting', 0)).toBe('Connecting…');
    expect(syncStatusLabel('offline', 0)).toBe('Offline');
    const { container } = render(<SyncStatusBar status="live" queued={0} failed={0} />);
    expect(screen.getByRole('status').textContent).toBe('Live');
    expect(container.querySelector('.gn-sync-status-bar__failed')).toBeNull();
    expect(container.querySelector('[data-status="live"]')).not.toBeNull();
  });

  it('E2-27 — an UNRECOGNISED status never claims liveness', () => {
    // `status` is a bare `string` on purpose: the mobile shell declares
    // `status: string;` (`board-screen.tsx:11`) and passes `query.syncStatus`
    // through verbatim, so a code this build does not know is a shape the shell
    // already admits. Every other arm refuses to invent a policy for it; this one
    // used to invent the most optimistic one. A person told they are live does
    // not go and check.
    expect(syncStatusLabel('suspended', 0)).not.toBe('Live');
    expect(syncStatusLabel('suspended', 0)).toBe('0 claims waiting to send');
    // The queue half IS still true whatever the connection word is, so the
    // unknown arm keeps it — including when the queue is not empty.
    expect(syncStatusLabel('suspended', 3)).toBe('3 claims waiting to send');
    // The known arms still say what they said.
    expect(syncStatusLabel('live', 0)).toBe('Live');
  });
});

describe('the stream error surface (Ruling P34)', () => {
  it('12.216 — no error, no notice, and no chrome for one', () => {
    expect(syncErrorNotice(null)).toBeNull();
    const { container } = render(<SyncStatusBar status="live" queued={0} failed={0} />);
    expect(container.querySelector('.gn-sync-status-bar__error')).toBeNull();
    // `error` absent and `error={null}` must mean the same thing — the prop is
    // optional precisely so a shell that holds no engine yet can mount the strip.
    const second = render(<SyncStatusBar status="live" queued={0} failed={0} error={null} />);
    expect(second.container.querySelector('.gn-sync-status-bar__error')).toBeNull();
  });

  /**
   * 12.217 — THE NOTICE MAY NOT CLAIM A POLICY THE ENGINE DOES NOT IMPLEMENT.
   *
   * `createSyncEngine` reconnects after an amendment-19 `error` frame on the
   * same delay as any other close, for EVERY code in `STREAM_ERROR_CODES` —
   * only `scope-revoked`, a different frame type, is terminal. So the tempting
   * sentence, "this device will not reconnect", would be the surface asserting
   * a decision on the engine's behalf. This asserts the opposite: whatever the
   * code, the notice ends "still retrying", and it says so for all three codes
   * read from the domain's own constant rather than a list restated here — a
   * fourth code added upstream lands in this loop automatically.
   */
  it('12.217 — every code says the server refused and that this client is still retrying', () => {
    expect(STREAM_ERROR_CODES.length).toBeGreaterThan(0); // control: the loop below is not empty
    for (const code of STREAM_ERROR_CODES) {
      const notice = syncErrorNotice({ code, message: 'planted reason' });
      expect(notice, code).toContain(code);          // the code verbatim, not translated away
      expect(notice, code).toContain('planted reason'); // the server's own words
      expect(notice, code).toContain('still retrying');
      expect(notice, code).not.toContain('will not reconnect');
    }
  });

  it('12.218 — an unrecognised code is printed raw rather than dropped for a friendlier sentence', () => {
    const notice = syncErrorNotice({ code: 'a-code-this-build-has-never-seen', message: 'x' });
    expect(notice).toContain('a-code-this-build-has-never-seen');
  });

  it('12.219 — the notice renders inside the strip, beside the label rather than replacing it', () => {
    render(<SyncStatusBar status="connecting" queued={2} failed={0} error={{ code: 'not-a-member', message: 'no' }} />);
    const strip = screen.getByRole('status');
    expect(strip.textContent).toContain('Connecting…');           // the label survives
    expect(strip.textContent).toContain('not-a-member');
    expect(strip.querySelector('.gn-sync-status-bar__error')).not.toBeNull();
  });
});
