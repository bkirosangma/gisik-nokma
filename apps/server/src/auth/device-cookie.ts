import { createHash, randomBytes } from 'node:crypto';

/** The browser's long-lived device cookie (devices plan, spec V1). */
export const DEVICE_COOKIE = 'gn_device';
const ONE_YEAR_S = 31_536_000;
const WELL_FORMED = /^[A-Za-z0-9_-]{43}$/;
const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function mintDeviceId(): string {
  return randomBytes(32).toString('base64url');
}

/** One-way; what a client may hold to name a device. */
export function deviceKey(id: string): string {
  return createHash('sha256').update(id).digest('hex');
}

/** 4 upper-case base32 characters of sha256(id) — distinguishes two same-browser machines on screen. */
export function deviceTag(id: string): string {
  const digest = createHash('sha256').update(id).digest();
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of digest) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5 && out.length < 4) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
    if (out.length === 4) break;
  }
  return out;
}

/** The two better-call context methods the hook uses; `path` is optional so a test can name the route. */
export type DeviceHookCtx = {
  path?: string;
  getCookie: (key: string) => string | null | undefined;
  setCookie: (key: string, value: string, options?: Record<string, unknown>) => unknown;
} | null;

/** `databaseHooks.session.create.before` — every sign-in method creates its session through this. */
export function deviceSessionHook(opts: { secure: boolean }) {
  return async (session: Record<string, unknown>, ctx: DeviceHookCtx): Promise<{ data: Record<string, unknown> }> => {
    // A session made with no endpoint context (an internal `createSession`) has no cookie jar: leave it ungrouped.
    if (ctx === null || ctx === undefined) return { data: { ...session, deviceId: null } };
    const presented = ctx.getCookie(DEVICE_COOKIE) ?? null;
    const deviceId = presented !== null && WELL_FORMED.test(presented) ? presented : mintDeviceId();
    if (deviceId !== presented) {
      ctx.setCookie(DEVICE_COOKIE, deviceId, {
        httpOnly: true,
        sameSite: 'lax',
        secure: opts.secure,
        path: '/',
        maxAge: ONE_YEAR_S,
      });
    }
    return { data: { ...session, deviceId } };
  };
}
