import { describe, expect, it, vi } from 'vitest';

/**
 * Unit-level coverage for `createSessionsClient`, direct — no React render.
 * `apps/web/test/account-page.test.tsx`'s "AccountPage — Sessions" describe
 * block proves the wiring THROUGH the page; this file proves the adapter's
 * own two jobs in isolation and with more UA variety than a page-level test
 * would be worth writing out.
 *
 * ## Why this file exists at all — a real, shipped defect
 *
 * The first version of `deviceLabelOf` matched ordered regexes like
 * `/Chrome.*Mac/i` — the browser token BEFORE the OS token. Every real
 * user-agent string puts the OS/device segment FIRST and the browser tokens
 * LAST (`Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36
 * (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36`), so that regex never
 * matched a real session — only a hand-abbreviated test fixture
 * (`'Mozilla/5.0 Chrome Mac'`) with the tokens in the wrong-but-matching
 * order made the old code look correct. Against 8 realistic real UA strings
 * the old code answered "Unknown device" for all eight. Every UA literal
 * below is a full, real string (copied from real browsers/devices), never
 * an abbreviated one — an abbreviated fixture is exactly what let the
 * original bug ship undetected.
 */
const { listSessions, revokeSession } = vi.hoisted(() => ({
  listSessions: vi.fn(),
  revokeSession: vi.fn(),
}));
vi.mock('../src/auth-client.js', () => ({
  authClient: { listSessions, revokeSession },
}));

import { createSessionsClient } from '../src/account/account-clients.js';

const CHROME_MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const CHROME_WINDOWS =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const CHROME_ANDROID =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';
const SAFARI_MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15';
const SAFARI_IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1';
const SAFARI_IPAD =
  'Mozilla/5.0 (iPad; CPU OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1';
const FIREFOX_MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) Gecko/20100101 Firefox/121.0';
const FIREFOX_WINDOWS =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0';
const EDGE_WINDOWS =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0';

function oneSession(over: { token?: string; userAgent?: string | null } = {}) {
  return {
    token: over.token ?? 't1',
    createdAt: new Date('2026-09-01T00:00:00Z'),
    updatedAt: new Date('2026-09-14T05:30:00Z'),
    userAgent: over.userAgent ?? null,
  };
}

describe('createSessionsClient — device labels, real UA strings', () => {
  it.each([
    [CHROME_MAC, 'Chrome on Mac'],
    [CHROME_WINDOWS, 'Chrome on Windows'],
    [CHROME_ANDROID, 'Chrome on Android'],
    [SAFARI_MAC, 'Safari on Mac'],
    [SAFARI_IPHONE, 'Safari on iPhone'],
    [SAFARI_IPAD, 'Safari on iPad'],
    [FIREFOX_MAC, 'Firefox on Mac'],
    [FIREFOX_WINDOWS, 'Firefox on Windows'],
    [EDGE_WINDOWS, 'Edge on Windows'],
  ])('labels a real %s UA as %s', async (userAgent, expectedLabel) => {
    listSessions.mockResolvedValue({ data: [oneSession({ userAgent })], error: null });
    const sessions = await createSessionsClient(null).list();
    expect(sessions[0]?.deviceLabel).toBe(expectedLabel);
  });

  it('falls back to "Unknown device" for a missing userAgent, never a guess', async () => {
    listSessions.mockResolvedValue({ data: [oneSession({ userAgent: null })], error: null });
    const sessions = await createSessionsClient(null).list();
    expect(sessions[0]?.deviceLabel).toBe('Unknown device');
  });

  it('falls back to "Unknown device" for an unrecognised UA rather than a partial guess', async () => {
    listSessions.mockResolvedValue({
      data: [oneSession({ userAgent: 'SomeBot/1.0 (+https://example.com/bot)' })],
      error: null,
    });
    const sessions = await createSessionsClient(null).list();
    expect(sessions[0]?.deviceLabel).toBe('Unknown device');
  });
});

describe('createSessionsClient — Date conversion and identity', () => {
  it('converts real Date instances to ISO strings, not `String(date)` or `.toDateString()`', async () => {
    // A mutation swapping `.toISOString()` for `String(value)` or
    // `.toDateString()` still typechecks (both exist on `Date`) and would
    // pass a test that only checked device labels — this pins the actual
    // ISO shape `SessionSummary.createdAt`/`updatedAt` promise.
    listSessions.mockResolvedValue({
      data: [oneSession({ token: 't1', userAgent: CHROME_MAC })],
      error: null,
    });
    const sessions = await createSessionsClient(null).list();
    expect(sessions[0]?.createdAt).toBe('2026-09-01T00:00:00.000Z');
    expect(sessions[0]?.updatedAt).toBe('2026-09-14T05:30:00.000Z');
  });

  it('marks the session matching currentToken as current, and no other', async () => {
    listSessions.mockResolvedValue({
      data: [oneSession({ token: 'a' }), oneSession({ token: 'b' })],
      error: null,
    });
    const sessions = await createSessionsClient('b').list();
    expect(sessions.find((s) => s.token === 'a')?.isCurrent).toBe(false);
    expect(sessions.find((s) => s.token === 'b')?.isCurrent).toBe(true);
  });

  it('an absent `data` (a refused read) answers an empty list, not a crash', async () => {
    listSessions.mockResolvedValue({ data: null, error: { message: 'refused' } });
    const sessions = await createSessionsClient(null).list();
    expect(sessions).toEqual([]);
  });
});

describe('createSessionsClient — revoke', () => {
  it('revokes by token and surfaces the door refusal message', async () => {
    revokeSession.mockResolvedValue({ error: null });
    const client = createSessionsClient(null);
    await expect(client.revoke('t1')).resolves.toEqual({ error: null });
    expect(revokeSession).toHaveBeenCalledWith({ token: 't1' });

    revokeSession.mockResolvedValue({ error: { message: 'Session not found' } });
    await expect(client.revoke('t2')).resolves.toEqual({ error: 'Session not found' });
  });
});
