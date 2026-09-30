import { describe, expect, it } from 'vitest';
import { relativeTime } from '../../src/account/relative-time.js';

/** Case 6.330 - `relativeTime`, the "last active" wording of the devices list (devices plan Task 6). */
const now = new Date('2026-10-01T12:00:00Z');
const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();
const MIN = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

describe('6.330 relativeTime', () => {
  it('6.330 thresholds: under 5 minutes is "Active now", then minutes, hours, days, and from 7 days the date', () => {
    expect(relativeTime(ago(5 * MIN - 1000), now)).toBe('Active now');
    expect(relativeTime(ago(5 * MIN), now)).toBe('5 minutes ago');
    expect(relativeTime(ago(59 * MIN), now)).toBe('59 minutes ago');
    expect(relativeTime(ago(60 * MIN), now)).toBe('1 hour ago');
    expect(relativeTime(ago(3 * HOUR), now)).toBe('3 hours ago');
    expect(relativeTime(ago(23 * HOUR), now)).toBe('23 hours ago');
    expect(relativeTime(ago(24 * HOUR), now)).toBe('1 day ago');
    expect(relativeTime(ago(2 * DAY), now)).toBe('2 days ago');
    expect(relativeTime(ago(6 * DAY), now)).toBe('6 days ago');
    // From 7 days it is the date, in the product's one IST clock (`formatDate`), never an ISO slice.
    expect(relativeTime(ago(7 * DAY), now)).toBe('24 Sep 2026');
    expect(relativeTime(ago(8 * DAY), now)).toBe('23 Sep 2026');
  });

  it('6.330 control: a timestamp in the future (clock skew) reads "Active now", and junk is returned verbatim', () => {
    expect(relativeTime(new Date(now.getTime() + 60_000).toISOString(), now)).toBe('Active now');
    expect(relativeTime('not-a-date', now)).toBe('not-a-date');
  });
});
