'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  NotificationsSection,
  PasskeysSection,
  SessionsSection,
  type PasskeySummary,
  type SessionSummary,
  type WorkspaceRef,
} from '@gisik-nokma/app-core';
import type { NotificationKind, NotificationPreferences } from '@gisik-nokma/domain';
import { AppNav } from '../../src/app-nav.js';
import { AppearanceSection } from '../../src/account/appearance-section.js';
import { createPasskeyClient, createSessionsClient } from '../../src/account/account-clients.js';
import { McpTokensScreen } from '../../src/mcp-tokens-screen.js';
import { ProfileSection } from '../../src/account/profile-section.js';
import { WorkspacesSection } from '../../src/account/workspaces-section.js';
import { authClient } from '../../src/auth-client.js';
import { useAppServices } from '../../src/providers.js';
import { DocumentTitle } from '../../src/document-title.js';

/**
 * `/account` — the GLOBAL account screen: settings that follow a person
 * across every workspace, never a workspace's own settings
 * (`/w/[workspaceId]/settings/*` for those). Client component as of Task 2
 * (was a static server-component stub through Task 18) because every
 * section from here on needs live data: `authClient`, `dataSource`, or both.
 * Profile (this task) is the first section to actually read `authClient`.
 */
export default function AccountPage() {
  const session = authClient.useSession();
  const user = session.data?.user ?? null;
  const { dataSource, notificationPreferences } = useAppServices();
  const [workspaces, setWorkspaces] = useState<WorkspaceRef[] | null>(null);
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const [sessions, setSessions] = useState<SessionSummary[] | null>(null);
  const [passkeys, setPasskeys] = useState<PasskeySummary[] | null>(null);
  const [passkeyError, setPasskeyError] = useState<string | null>(null);
  const passkeyClient = useMemo(() => createPasskeyClient(), []);
  const sessionsClient = useMemo(
    // `?.session?.token`, not `?.session.token` — `session.data`'s own type
    // (`getSession`'s declared return, `{ session, user } | null`) always
    // carries `.session` when `.data` is non-null, but `app-nav.test.tsx`'s
    // OWN `auth-client.js` mock (a second, independent mock of this module,
    // separate from `account-page.test.tsx`'s) mounts this same page with
    // `data: { user }` and no `session` key at all — a shape only a test
    // double can produce, and one this page must not crash its ENTIRE render
    // over just to build the Sessions section's client. The extra `?.` costs
    // nothing against the real client and keeps a missing `session` on the
    // same silent-omission footing every other section's failed read gets.
    () => createSessionsClient(session.data?.session?.token ?? null),
    [session.data?.session?.token],
  );

  useEffect(() => {
    // A failed read collapses to the SAME `[]` an honestly-empty answer would
    // produce — `stub-services.ts`'s own rule ("`[]` ... is a claim about the
    // world") applies here too, and this is ONE of two places on the shell
    // that knowingly breaks it (the Notifications effect below is the other,
    // added Task 6). Deliberate, not an oversight: this section is a
    // convenience list, not `/account`'s primary content the way `getMyWorkspaces`
    // is `/workspaces`' own (case 13.298's 401→`/sign-in` redirect), and
    // `use-workspace-name.ts` already establishes the same silent-omission
    // treatment for a secondary consumer of this exact read on this exact page
    // (`AppNav`, mounted here too). If a reviewer wants the stronger
    // `ShellRefusal` treatment instead, that's an `error` state added here.
    dataSource.query.getMyWorkspaces().then(setWorkspaces, () => setWorkspaces([]));
  }, [dataSource]);

  useEffect(() => {
    // Same silent-omission treatment the Workspaces effect above gives a
    // failed read, and the SAME reason: this is a convenience control, not
    // `/account`'s primary content, so a refusal here should not block the
    // rest of the page. `{ mutedKinds: [] }` here is NOT
    // `EMPTY_NOTIFICATION_PREFERENCES` reused — that constant's own docblock
    // (`packages/domain/src/notification-preferences.ts`) defines it as what
    // a person who has NEVER SAVED a preference reads, which is a claim about
    // their history. A failed read has no idea whether they ever saved one;
    // the literal below merely renders every kind as on for this visit,
    // without asserting that fact about the account.
    notificationPreferences.load().then(setPrefs, () => setPrefs({ mutedKinds: [] }));
  }, [notificationPreferences]);

  useEffect(() => {
    // Same silent-omission treatment the two effects above give a failed
    // read, and the same reason: Sign-in and devices is a convenience
    // section, not `/account`'s primary content. `sessionsClient` is
    // recreated whenever the current session's own token changes (sign-in,
    // sign-out, a refreshed session), so this effect re-lists against the
    // right adapter rather than a stale one closing over an old token.
    sessionsClient.list().then(setSessions, () => setSessions([]));
  }, [sessionsClient]);

  const revokeSession = useCallback(
    async (token: string) => {
      // No optimistic removal: unlike `toggleKind`'s flip above, there is no
      // local edit to make that would be honest to show before the server
      // confirms it — re-listing is what proves a session is actually gone,
      // the same distrust `toggleKind`'s own `.catch()` has for a state this
      // component did not itself confirm.
      await sessionsClient.revoke(token);
      sessionsClient.list().then(setSessions);
    },
    [sessionsClient],
  );

  /**
   * THE PASSKEY LIST IS THE ONLY MOUNT-TIME READ ON THIS PAGE THAT IS GATED,
   * and the gate is a rate-limit decision, not a tidy-up.
   *
   * `GET /passkey/list-user-passkeys` lands under `/api/auth/*`, which
   * `apps/server/src/app.ts` charges against the shared `auth:` bucket —
   * `RATE_LIMIT_AUTH_MAX` is 10 per 60s in `deploy/do/app.yaml`, and
   * `http/rate-limit.ts` records as MEASURED that a web container proxies
   * every browser into ONE client key, so that budget is shared across
   * people. An `/account` load already spends two units of it (`/get-session`
   * behind `useSession`, and `/list-sessions` behind the effect above); this
   * task adds a third, which is named here and in the task report rather than
   * slipped in under a change whose whole headline is auth-bucket hygiene.
   *
   * ## AND THE CEREMONIES COST MORE THAN THE PAGE LOAD — the half of the
   * ## disclosure an owner actually has to act on
   *
   * A page load is the cheap part. Counted from `@better-auth/passkey`'s own
   * `dist/client.mjs` plus this component's re-reads, against the same budget
   * of 10 per 60s:
   *
   * | action | requests under `/api/auth/*` | units |
   * |---|---|---|
   * | `/account` load (signed in) | `get-session`, `list-sessions`, `list-user-passkeys` | **3** |
   * | Add a passkey, succeeding | `generate-register-options`, `verify-registration`, then the re-list | **3** |
   * | Add a passkey, ABORTED at the prompt | `generate-register-options` only — `startRegistration` throws before the verify | **1** |
   * | Delete a passkey | `delete-passkey`, then the re-list | **2** |
   * | Sign in with a passkey (`/sign-in`) | `generate-authenticate-options`, `verify-authentication` | **2** |
   *
   * So arriving on this page and registering once is **six units of ten**, and a
   * person who fumbles the prompt two or three times and retries can exhaust the
   * window — on a key shared with everyone behind the same web container, whose
   * sign-in is then refused. **That is a real operational cost and it is stated
   * here rather than discovered.**
   *
   * **It does NOT weaken the constraint this task exists to protect**, and the
   * two must not be run together: that constraint is specifically about an
   * ANONYMOUS `/sign-in` PAGE LOAD, which still charges the bucket ZERO times
   * (measured in a real browser: one `GET /v1/auth/methods`, a `/v1/*` route the
   * limiter never charges, and nothing under `/api/auth/*`). Every figure in the
   * table above is the cost of a DELIBERATE action by a signed-in person, which
   * is a budget being spent on work, not on a page merely being opened. The
   * remedy if it ever bites is an operator raising `RATE_LIMIT_AUTH_MAX`, not a
   * change here.
   *
   * Gating on `user !== null` is what keeps the third charge from being spent
   * on a request that CANNOT succeed: the endpoint sits behind better-auth's
   * `sessionMiddleware`, so an anonymous `/account` load would buy a 401 with
   * a unit of everyone's sign-in budget. That is the same "a control that can
   * never succeed" defect `app/sign-in/page.tsx`'s own docblock removes, one
   * layer down — and it is why this effect is gated while the three above,
   * which read product routes on their own budgets, are not.
   *
   * `signedIn` (a boolean) rather than `user` is the dependency on purpose:
   * `useSession()` hands back a fresh object every render, so depending on
   * `user` would re-fire this read on every re-render of the page.
   *
   * None of this weakens `/sign-in`'s own guarantee, which is the property
   * this task exists to protect: `/passkey/*` is absent from
   * `SIGN_IN_PREFIXES`, so nothing here touches the tighter `signin:` bucket,
   * and an ANONYMOUS visitor now reaches neither this effect nor any passkey
   * request at all.
   */
  const signedIn = user !== null;

  const reloadPasskeys = useCallback(() => {
    if (!signedIn) return;
    // Same silent-omission treatment the three effects above give a failed
    // read, and the same reason — except for one difference worth naming: a
    // refused ADD or REMOVE below is NOT silent, because the person just
    // performed a WebAuthn ceremony and a no-op after touching a fingerprint
    // sensor is indistinguishable from success. Only the passive LIST read
    // collapses to `[]`.
    passkeyClient.list().then(setPasskeys, () => setPasskeys([]));
  }, [passkeyClient, signedIn]);

  useEffect(() => {
    reloadPasskeys();
  }, [reloadPasskeys]);

  const addPasskey = useCallback(
    async (name: string) => {
      const result = await passkeyClient.add(name);
      setPasskeyError(result.error);
      // Re-list rather than push the new row locally: the credential's stored
      // label is the SERVER's answer (an empty name is resolved from the
      // authenticator's AAGUID), so a locally-invented row would show a name
      // the account does not actually carry. Same distrust `revokeSession`
      // above has for a state this component did not itself confirm.
      if (result.error === null) reloadPasskeys();
    },
    [passkeyClient, reloadPasskeys],
  );

  const removePasskey = useCallback(
    async (id: string) => {
      const result = await passkeyClient.remove(id);
      setPasskeyError(result.error);
      if (result.error === null) reloadPasskeys();
    },
    [passkeyClient, reloadPasskeys],
  );

  const saveName = useCallback(async (name: string) => {
    const result = await authClient.updateUser({ name });
    return { error: result.error?.message ?? null };
  }, []);

  const toggleKind = useCallback(
    (kind: NotificationKind) => {
      if (prefs === null) return;
      const muted = prefs.mutedKinds.includes(kind);
      const next: NotificationPreferences = {
        mutedKinds: muted ? prefs.mutedKinds.filter((k) => k !== kind) : [...prefs.mutedKinds, kind],
      };
      setPrefs(next); // optimistic
      void notificationPreferences.save(next).catch(() => {
        // Revert to the true stored state on a failed save, rather than
        // leaving the optimistic flip standing for a change the server never
        // recorded — the same distrust `apps/web/app/inbox/page.tsx`'s
        // `markRead` catch has for its own optimistic flip.
        notificationPreferences.load().then(setPrefs);
      });
    },
    [prefs, notificationPreferences],
  );

  return (
    <main id="gn-main" className="gn-shell gn-account">
      <DocumentTitle title="Account" />
      <AppNav />
      {/* `AppNav` stays OUTSIDE the column on purpose: the prototype centres a
          680px column of cards inside the content area, but the nav is a
          full-width bar with its own inner max-width (`.gn-nav__inner`), so
          narrowing it would be a second, unasked-for change to app chrome. */}
      <div className="gn-account__column">
        <div className="gn-account__intro">
          <h1 className="gn-page-title">Your account</h1>
          <p className="gn-account__lead">
            This is you, across every workspace. Roles, projects and invitations belong to each
            workspace separately.
          </p>
        </div>
        {/* CARD ORDER IS THE SPEC'S, WHICH IS THE PROTOTYPE'S. The desktop
            reference's `isAccount` screen runs Profile → Notifications → Your
            workspaces → Sign-in and devices, and the spec's own section
            numbering (§3 Profile, §4 Appearance, §5 Notifications, §6 Your
            workspaces, §7 Sign-in & devices) is that same order with
            Appearance inserted after Profile — so the two agree and this is
            what they agree on. It replaces the order the sections happened to
            land in as Tasks 2-8 each appended its own.

            Passkeys sits last because it is not a section of its own in the
            spec: §7 covers Sessions AND Passkeys as one "Sign-in & devices"
            concern, so the two stay adjacent. Rendering them as one card
            rather than two is a further change this reorder does not make. */}
        {user !== null ? (
          <ProfileSection name={user.name} email={user.email} onSave={saveName} />
        ) : null}
        <AppearanceSection />
        {prefs !== null ? (
          <NotificationsSection mutedKinds={prefs.mutedKinds} onToggle={toggleKind} />
        ) : null}
        {workspaces !== null ? <WorkspacesSection workspaces={workspaces} /> : null}
        {sessions !== null ? (
          <SessionsSection sessions={sessions} onRevoke={(token) => void revokeSession(token)} />
        ) : null}
        {passkeys !== null ? (
          <PasskeysSection
            passkeys={passkeys}
            onAdd={(name) => void addPasskey(name)}
            onRemove={(id) => void removePasskey(id)}
            error={passkeyError}
          />
        ) : null}
        {/* Connected assistants — MOVED HERE in Round 21 (owner: "lets move MCP
            tokens to the account page. as this should not be scoped to a
            workspace"), from the workspace home's section cards and from
            `/settings`' sidebar. An MCP token is minted for a PERSON and carries
            their permissions in every workspace they belong to — which
            `app/mcp/tokens/page.tsx` had argued from the beginning as the reason
            its URL holds no workspace — so listing it among a workspace's own
            sections said something false about what revoking does.

            LAST, and outside the spec's card order rather than inserted into it.
            That order is the prototype's `isAccount` screen (see the comment
            above) and the prototype has no MCP section at all, so there is no
            position in it to transcribe; appending is the honest placement. It
            also lands where it belongs by subject: Sign-in and devices and
            Passkeys are the other two cards about credentials that can act as
            you, and this is the third.

            NOT gated on `user !== null`, unlike Profile above. The screen reads
            `useSessionStatus()` itself and distinguishes 'loading' from
            'signed-out' — a distinction `user === null` collapses — so gating it
            here would replace a correct three-state answer with a two-state one
            and flash a sign-in prompt at somebody whose session is still
            resolving. It also costs no request while signed out: its own effect
            fires only on `kind === 'signed-in'`. */}
        <McpTokensScreen heading="h2" variant="account" />
      </div>
    </main>
  );
}
