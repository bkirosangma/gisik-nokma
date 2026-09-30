import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Unit-level coverage for `createSessionsClient`, direct — no React render.
 * `apps/web/test/account-page.test.tsx`'s "AccountPage — Sessions" describe
 * block proves the wiring THROUGH the page; this file proves the adapter's
 * own jobs in isolation and with more UA variety than a page-level test
 * would be worth writing out. **Rewritten 2026-10-01 (devices plan Task 6):**
 * the list is `GET /v1/me/devices` (a stubbed `fetch`), the label is still
 * computed here from the server's `userAgent`, and the per-device sign-out is
 * a server route; `revokeOtherSessions` is the one better-auth call left.
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
const { revokeOtherSessions, fetchMock, listUserPasskeys, addPasskey, deletePasskey } = vi.hoisted(() => ({
  revokeOtherSessions: vi.fn(),
  fetchMock: vi.fn(),
  listUserPasskeys: vi.fn(),
  addPasskey: vi.fn(),
  deletePasskey: vi.fn(),
}));
vi.mock('../src/auth-client.js', () => ({
  // `listUserPasskeys` is present ONLY so a test can prove the list no longer goes through it (6.337).
  authClient: { revokeOtherSessions, passkey: { listUserPasskeys, addPasskey, deletePasskey } },
}));

import { createPasskeyClient, createSessionsClient } from '../src/account/account-clients.js';

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

const reply = (status: number, body: unknown = {}) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
function oneDevice(over: { userAgent?: string | null } = {}) {
  return {
    key: 'k1',
    tag: '7F3K',
    userAgent: over.userAgent ?? null,
    isCurrent: true,
    lastSeenAt: '2026-09-14T05:30:00.000Z',
    firstSignedInAt: '2026-09-01T00:00:00.000Z',
    sessionCount: 2,
    legacy: false,
  };
}
beforeEach(() => {
  fetchMock.mockReset();
  revokeOtherSessions.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

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
    [null, 'Unknown device'],
    ['SomeBot/1.0 (+https://example.com/bot)', 'Unknown device'],
  ])('labels a real %s UA as %s (never a partial guess)', async (userAgent, expectedLabel) => {
    fetchMock.mockResolvedValue(reply(200, { devices: [oneDevice({ userAgent })] }));
    const devices = await createSessionsClient().list();
    expect(devices[0]?.label).toBe(expectedLabel);
  });
});

describe('createSessionsClient — list', () => {
  it('6.334 reads GET /v1/me/devices with the cookie and never hands the raw userAgent on', async () => {
    fetchMock.mockResolvedValue(reply(200, { devices: [oneDevice({ userAgent: CHROME_MAC })] }));
    const devices = await createSessionsClient().list();
    expect(fetchMock).toHaveBeenCalledWith('/v1/me/devices', { credentials: 'include' });
    expect(devices).toEqual([
      {
        key: 'k1',
        tag: '7F3K',
        label: 'Chrome on Mac',
        isCurrent: true,
        lastSeenAt: '2026-09-14T05:30:00.000Z',
        firstSignedInAt: '2026-09-01T00:00:00.000Z',
        sessionCount: 2,
        legacy: false,
      },
    ]);
  });

  it('a refused read (non-2xx) answers an empty list, not a crash', async () => {
    fetchMock.mockResolvedValue(reply(401, { error: 'unauthorized' }));
    await expect(createSessionsClient().list()).resolves.toEqual([]);
  });
});

describe('createSessionsClient — sign-out', () => {
  it('6.334 signs a device out by its URL-encoded key with the cookie; a 204 is no error, a 409/404/500 is the named refusal', async () => {
    const client = createSessionsClient();
    fetchMock.mockResolvedValue(reply(204));
    await expect(client.signOutDevice('legacy:ab/cd')).resolves.toEqual({ error: null });
    expect(fetchMock).toHaveBeenCalledWith('/v1/me/devices/legacy%3Aab%2Fcd/sign-out', { method: 'POST', credentials: 'include' });
    for (const status of [404, 409, 500]) {
      fetchMock.mockResolvedValue(reply(status));
      await expect(client.signOutDevice('k')).resolves.toEqual({ error: 'That device could not be signed out. Try again.' });
    }
    expect(revokeOtherSessions).not.toHaveBeenCalled();
  });

  it('6.334 "sign out all other devices" is better-auth revokeOtherSessions and surfaces its message', async () => {
    const client = createSessionsClient();
    revokeOtherSessions.mockResolvedValue({ error: null });
    await expect(client.signOutOthers()).resolves.toEqual({ error: null });
    revokeOtherSessions.mockResolvedValue({ error: { message: 'Too many requests' } });
    await expect(client.signOutOthers()).resolves.toEqual({ error: 'Too many requests' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

const serverPasskey = (over: Record<string, unknown> = {}) => ({
  id: 'p1',
  name: 'MacBook',
  provider: 'iCloud Keychain',
  createdAt: '2026-09-18T10:00:00.000Z',
  lastUsedAt: '2026-09-30T10:00:00.000Z',
  notUsedRecently: false,
  ...over,
});

describe('createPasskeyClient (devices plan Task 7)', () => {
  it('6.337 list() reads GET /v1/me/passkeys with the cookie and hands the rows on unchanged, a null name included; control: the plugin\'s listUserPasskeys is never called', async () => {
    listUserPasskeys.mockReset();
    fetchMock.mockResolvedValue(reply(200, { passkeys: [serverPasskey(), serverPasskey({ id: 'p2', name: null, lastUsedAt: null, notUsedRecently: true })] }));
    const list = await createPasskeyClient().list();
    expect(fetchMock).toHaveBeenCalledWith('/v1/me/passkeys', { credentials: 'include' });
    expect(list.map((p) => [p.id, p.name, p.provider, p.lastUsedAt, p.notUsedRecently])).toEqual([
      ['p1', 'MacBook', 'iCloud Keychain', '2026-09-30T10:00:00.000Z', false],
      ['p2', null, 'iCloud Keychain', null, true],
    ]);
    expect(listUserPasskeys).not.toHaveBeenCalled();
  });

  it('6.337 a refused or failed list read REJECTS (the page then shows "could not be loaded", never "no passkeys yet"); control: a 200 with an empty list resolves []', async () => {
    const client = createPasskeyClient();
    fetchMock.mockResolvedValue(reply(200, { passkeys: [] }));
    await expect(client.list()).resolves.toEqual([]);
    fetchMock.mockResolvedValue(reply(500));
    await expect(client.list()).rejects.toThrow();
    fetchMock.mockRejectedValue(new Error('offline'));
    await expect(client.list()).rejects.toThrow();
  });

  it('6.337 add and remove still go through the passkey plugin; a refusal with no message still surfaces', async () => {
    const client = createPasskeyClient();
    addPasskey.mockResolvedValue({ data: {}, error: null });
    await expect(client.add('Work')).resolves.toEqual({ error: null });
    expect(addPasskey).toHaveBeenCalledWith({ name: 'Work' });
    deletePasskey.mockResolvedValue({ data: null, error: { status: 400 } });
    await expect(client.remove('p9')).resolves.toEqual({ error: 'That did not work. Try again.' });
    expect(deletePasskey).toHaveBeenCalledWith({ id: 'p9' });
  });
});
