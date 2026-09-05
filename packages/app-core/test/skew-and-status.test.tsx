import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GROSS_CLOCK_SKEW_MS } from '@gisik-nokma/domain';
import { ClockSkewBadge, formatClockSkew } from '../src/history/clock-skew-badge.js';
import { SyncStatusBar, syncStatusLabel } from '../src/sync/sync-status-bar.js';

describe('clock skew in history', () => {
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
});
