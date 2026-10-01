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
 * `PasskeySummary` is one row of `GET /v1/me/passkeys` (devices plan Task 5): the list is read from that route and
 * not from the plugin's `listUserPasskeys`, because the plugin's schema does not know `lastUsedAt` (FD5). `provider`
 * is the authenticator's NAME, resolved on the server from the AAGUID ("iCloud Keychain", or "Security key or other"
 * - never a UUID). `name` is `null` when the person gave none and the plugin left it empty; the SECTION shows "Unnamed
 * passkey" then, because that is a wording of the view and not a fact about the credential. `notUsedRecently` (never
 * used, or 90 days or more ago) is computed server-side so the threshold has one home.
 */
export type PasskeySummary = {
  id: string;
  name: string | null;
  provider: string;
  createdAt: string;
  lastUsedAt: string | null;
  notUsedRecently: boolean;
};

export interface PasskeyClient {
  list(): Promise<PasskeySummary[]>;
  add(name: string): Promise<{ error: string | null }>;
  remove(id: string): Promise<{ error: string | null }>;
}
