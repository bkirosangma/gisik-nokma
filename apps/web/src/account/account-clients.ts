import type {
  PasskeyClient,
  PasskeySummary,
  DeviceSummary,
  SessionsClient,
} from '@gisik-nokma/app-core';
import { authClient } from '../auth-client.js';

/**
 * **Sign-in and devices (devices plan Task 6, 2026-10-01).** The list is read from the server's own
 * `GET /v1/me/devices` - one row per `gn_device`, with a one-way `key` and a four-character `tag` - and NOT from
 * `authClient.listSessions`: better-auth's list would carry the raw device id if it were a returned field (plan
 * FD4), and a session is not the unit a person thinks in. The server sends the user agent; the LABEL
 * ("Chrome on Mac") is computed here by `deviceLabelOf`, below. Signing ONE other device out is a server route
 * (`POST /v1/me/devices/:key/sign-out`, scoped to the caller); signing every other device out stays
 * better-auth's own `revokeOtherSessions`.
 *
 * Moving the list off `/api/auth/*` also spends one fewer unit of the shared `auth:` rate-limit bucket per
 * `/account` load (see the table in `apps/web/app/account/page.tsx`): `/v1/*` reads are not charged.
 */

/**
 * Device labels never fabricate specificity: two INDEPENDENT lookups (OS,
 * then browser), never one ordered regex per combination. **A real defect,
 * found and fixed after this file shipped:** the first version matched
 * `/Chrome.*Mac/i` — browser token BEFORE the OS token — which is backwards
 * from every real user-agent string, where the OS/device segment comes
 * first and the browser tokens come last (`Mozilla/5.0 (Macintosh; Intel
 * Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0
 * Safari/537.36`). The only reason any test passed was a hand-abbreviated
 * fixture (`'Mozilla/5.0 Chrome Mac'`) with the tokens in the wrong-but-
 * matching order; against 8 realistic real-world UA strings (real Chrome/
 * Safari/Firefox × Mac/Windows/Android/iPhone/iPad) the old code answered
 * "Unknown device" for all eight — the feature did not do the one thing it
 * exists to do. `apps/web/test/account-clients.test.ts` now drives this
 * function with full, realistic UA strings rather than abbreviated ones, so
 * a token-order regression like this one fails a test again.
 *
 * `browserOf` checks Edge and Safari-without-Chrome LAST-to-first in the
 * sense that both Edge and ordinary Chrome-on-desktop Safari UAs also carry
 * a `Safari/` token (inherited WebKit boilerplate), so a bare `Safari/` test
 * would misname a Chrome or Edge session; Edge is checked before Chrome for
 * the same reason (an Edge UA also carries `Chrome/`). Anything neither
 * lookup can name — including a missing `userAgent`, which better-auth's
 * own type allows (`ipAddress?`/`userAgent?: string | null | undefined`) —
 * falls back to "Unknown device" rather than inventing a browser or OS this
 * adapter cannot actually name.
 */
function osOf(userAgent: string): string | null {
  if (/iPhone/.test(userAgent)) return 'iPhone';
  if (/iPad/.test(userAgent)) return 'iPad';
  if (/Android/.test(userAgent)) return 'Android';
  if (/Mac OS X|Macintosh/.test(userAgent)) return 'Mac';
  if (/Windows/.test(userAgent)) return 'Windows';
  return null;
}

function browserOf(userAgent: string): string | null {
  if (/Edg\//.test(userAgent)) return 'Edge';
  if (/Chrome\//.test(userAgent)) return 'Chrome';
  if (/Firefox\//.test(userAgent)) return 'Firefox';
  if (/Safari\//.test(userAgent) && !/Chrome/.test(userAgent)) return 'Safari';
  return null;
}

function deviceLabelOf(userAgent: string | null | undefined): string {
  if (userAgent === null || userAgent === undefined) return 'Unknown device';
  const os = osOf(userAgent);
  const browser = browserOf(userAgent);
  if (os === null || browser === null) return 'Unknown device';
  return `${browser} on ${os}`;
}

const SIGN_OUT_REFUSED = 'That device could not be signed out. Try again.';

export function createSessionsClient(): SessionsClient {
  return {
    async list(): Promise<DeviceSummary[]> {
      const res = await fetch('/v1/me/devices', { credentials: 'include' });
      // A refused read is an empty list, the silent-omission footing every other `/account` read has.
      if (!res.ok) return [];
      const { devices } = (await res.json()) as {
        devices: Array<Omit<DeviceSummary, 'label'> & { userAgent: string | null }>;
      };
      return devices.map(({ userAgent, ...device }) => ({ ...device, label: deviceLabelOf(userAgent) }));
    },
    async signOutDevice(key: string) {
      // The refusal is surfaced (ruling E2-24(b)): a 404/409/500 must not leave the list merely failing to shrink.
      const res = await fetch(`/v1/me/devices/${encodeURIComponent(key)}/sign-out`, {
        method: 'POST',
        credentials: 'include',
      });
      return { error: res.ok ? null : SIGN_OUT_REFUSED };
    },
    async signOutOthers() {
      const result = await authClient.revokeOtherSessions();
      return { error: result.error?.message ?? null };
    },
  };
}

/**
 * Task 8 — the Passkeys half of the same section, and the THREE method names
 * below were established by running the compiler, not by reading a docs page.
 *
 * ## `listUserPasskeys` and `deletePasskey` are NOT in the plugin's own
 * ## `getActions`, and a grep for them in `client.d.mts` finds nothing
 *
 * `@better-auth/passkey@1.7.2`'s client plugin hand-declares exactly two
 * actions — `signIn.passkey` and `passkey.addPasskey` (`dist/client.mjs`,
 * `getPasskeyActions`) — plus a `listPasskeys` nanostores ATOM, which is a
 * subscription and not a `Promise`-returning call an adapter can await. The
 * other two arrive the same way `listSessions`/`revokeSession` do for the core
 * client, documented in the docblock above: `$InferServerPlugin` carries the
 * server plugin's endpoint map, and the `PathToObject`/`CamelCase` machinery
 * turns each endpoint PATH into a nested camelCase method. The three server
 * paths (`dist/index-B7Y0IgKK.d.mts`) are:
 *
 * | endpoint path                    | method | client member                    |
 * |----------------------------------|--------|----------------------------------|
 * | `/passkey/list-user-passkeys`    | GET    | `passkey.listUserPasskeys()`     |
 * | `/passkey/delete-passkey`        | POST   | `passkey.deletePasskey({ id })`  |
 * | `/passkey/update-passkey`        | POST   | `passkey.updatePasskey(...)`     |
 *
 * **Proven, with a negative control, rather than reasoned.** A probe module
 * calling all four members was typechecked against the real packages: green.
 * The same probe with one invented member (`passkey.thisMethodDoesNotExist`)
 * answered `TS2339: Property 'thisMethodDoesNotExist' does not exist on type
 * '{ generateRegisterOptions: …`, which is what rules out the vacuous reading
 * that `authClient.passkey` is simply `any` and would have accepted any name
 * at all. The resolved return types were read off the compiler the same way:
 * `listUserPasskeys()` is `Data<Passkey[]> | Error<{code?, message?}>` and
 * `deletePasskey()` is `Data<{status: boolean}> | Error<…>`.
 *
 * ## What is still NOT witnessed here, said plainly
 *
 * `typecheck` proves the member EXISTS and its shape. It cannot prove the
 * generated member issues the URL the table above claims, because the client
 * builds that URL at runtime from the same path map — and
 * `apps/web/test/account-page.test.tsx` replaces this whole module's
 * `auth-client.js` wholesale, so no unit test in this repo watches a real
 * request leave. The SERVER half of each path is witnessed independently in
 * `apps/server/test/auth/sign-in-flows.test.ts`'s `passkey endpoints` block
 * (a real `app.inject` against each mounted path), and the browser-level
 * witness that would join the two halves is
 * `apps/web/e2e-stack/passkey-registration.spec.ts`, which needs a real
 * compose stack and a virtual authenticator over CDP. Named as a residue
 * rather than left for a reader to discover.
 *
 * ## The refusal check is deliberately NOT `result.error?.message ?? null`
 *
 * That spelling — used by `revoke` above and by `page.tsx`'s `saveName`, both
 * left as they are, out of scope — collapses "refused, with no message" into
 * `null`, which every caller reads as SUCCESS. Registration is the one place
 * on this page where that matters: `addPasskey`'s error branch types `message`
 * as `string | undefined`, an aborted WebAuthn ceremony is a routine outcome,
 * and a silent no-op after the person just touched their fingerprint sensor is
 * indistinguishable from the passkey having been saved. So the presence of
 * `error` decides, and the message is only the text.
 */
function refusalOf(error: { message?: string | undefined } | null | undefined): string | null {
  if (error === null || error === undefined) return null;
  return error.message ?? 'That did not work. Try again.';
}

export function createPasskeyClient(): PasskeyClient {
  return {
    async list(): Promise<PasskeySummary[]> {
      const result = await authClient.passkey.listUserPasskeys();
      return (result.data ?? []).map((passkey) => ({
        id: passkey.id,
        // better-auth types the stored label `name?: string | undefined` — it
        // is absent when neither the client supplied one nor the AAGUID map
        // resolved a provider. Resolved HERE rather than in `PasskeysSection`
        // for the reason `PasskeySummary`'s own docblock gives: a component
        // inventing a label mid-render is the fabrication `deviceLabelOf`'s
        // "Unknown device" already refuses one seam earlier.
        name: passkey.name ?? 'Unnamed passkey',
      }));
    },
    async add(name: string) {
      // `addPasskey` runs the whole WebAuthn REGISTRATION ceremony:
      // `GET /passkey/generate-register-options`, then the browser's
      // `navigator.credentials.create()`, then
      // `POST /passkey/verify-registration`. It is reached only from a click
      // on `PasskeysSection`'s "Add a passkey" — never from an effect — which
      // is the same rule `app/sign-in/page.tsx`'s button docblock states for
      // the authentication side, and for the same rate-limit reason.
      const result = await authClient.passkey.addPasskey({ name });
      return { error: refusalOf(result.error) };
    },
    async remove(id: string) {
      const result = await authClient.passkey.deletePasskey({ id });
      return { error: refusalOf(result.error) };
    },
  };
}
