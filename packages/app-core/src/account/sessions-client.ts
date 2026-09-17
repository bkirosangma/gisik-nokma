/**
 * The abstract half of `/account`'s "Sign-in and devices" section (Sessions
 * half; Passkeys is a later task). Framework-free — no `authClient`, no
 * Next import — matching `NotificationPreferencesGateway` beside it: the
 * concrete `authClient`-backed adapter lives at `apps/web/src/account/
 * account-clients.ts`, verified against the installed `better-auth@1.7.2`
 * client's generated types rather than assumed (see that file's own
 * docblock for what the verification found).
 *
 * `createdAt`/`updatedAt` are `string` here, not `Date` — the ISO
 * conversion is the adapter's job, not this view-model's.
 */
export type SessionSummary = {
  token: string;
  createdAt: string;
  updatedAt: string;
  deviceLabel: string;
  isCurrent: boolean;
};

export interface SessionsClient {
  list(): Promise<SessionSummary[]>;
  revoke(token: string): Promise<{ error: string | null }>;
}
