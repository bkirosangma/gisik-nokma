/**
 * The abstract half of `/account`'s "Sign-in and devices" section, Passkeys
 * half. Framework-free — no `authClient`, no `@better-auth/passkey`, no
 * WebAuthn — matching `SessionsClient` beside it: the concrete
 * `authClient`-backed adapter lives at
 * `apps/web/src/account/account-clients.ts`, verified against the installed
 * `@better-auth/passkey@1.7.2` client's generated types rather than assumed
 * (see that file's own docblock for what the verification found, and for the
 * one thing it could NOT establish).
 *
 * `PasskeySummary` carries `name` as a plain `string`, never `string |
 * undefined` — better-auth's own `Passkey` row types it optional
 * (`name?: string | undefined`), and resolving that absence to a displayable
 * label is the ADAPTER's job, not this view-model's, for the same reason
 * `SessionSummary.deviceLabel` is a resolved string here rather than a raw
 * `userAgent`. A component handed `undefined` would have to invent a label
 * mid-render, which is the fabrication `deviceLabelOf`'s "Unknown device"
 * fallback already refuses one seam earlier.
 */
export type PasskeySummary = { id: string; name: string };

export interface PasskeyClient {
  list(): Promise<PasskeySummary[]>;
  add(name: string): Promise<{ error: string | null }>;
  remove(id: string): Promise<{ error: string | null }>;
}
