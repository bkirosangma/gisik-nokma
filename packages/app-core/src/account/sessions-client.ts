/**
 * The abstract half of `/account`'s "Sign-in and devices" section (Sessions
 * half; Passkeys is its own client). Framework-free - no `authClient`, no
 * Next import - matching `NotificationPreferencesGateway` beside it: the
 * concrete adapter lives at `apps/web/src/account/account-clients.ts`.
 *
 * **Amended 2026-09-30 by the devices plan (Task 6):** the unit is a DEVICE
 * (every unexpired session that shares one `gn_device` cookie), read from
 * `GET /v1/me/devices`, not a better-auth session. `key` is the server's
 * one-way device key and `tag` a four-character disambiguator (null for a
 * pre-cookie "legacy" group); the raw cookie value never reaches the client.
 * `label` ("Chrome on Mac") is computed by the adapter from the user agent.
 * Instants are ISO strings.
 */
export type DeviceSummary = {
  key: string;
  tag: string | null;
  label: string;
  isCurrent: boolean;
  lastSeenAt: string | null;
  firstSignedInAt: string;
  sessionCount: number;
  legacy: boolean;
};

export interface SessionsClient {
  list(): Promise<DeviceSummary[]>;
  /** Signs every session of one OTHER device out (the server refuses the caller's own with 409). */
  signOutDevice(key: string): Promise<{ error: string | null }>;
  /** Signs every session but this one out (better-auth's `revokeOtherSessions`). */
  signOutOthers(): Promise<{ error: string | null }>;
}
