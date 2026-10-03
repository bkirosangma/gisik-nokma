'use client';

import { createContext, useContext, useMemo, useRef, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import {
  createClientStateCache,
  withCacheFeed,
  withInflightDedupe,
  type ClientStateCache,
  type DataSource,
  type NotificationPreferencesGateway,
  type NotificationsGateway,
  type WorkflowAuthoringGateway,
} from '@gisik-nokma/app-core/data';
import {
  createHttpClient,
  createHttpFoundingGateway,
  createHttpInviteAdminGateway,
  createHttpMembersGateway,
  createHttpPeopleGateway,
  createHttpInviteGateway,
  createHttpMyInvitationsGateway,
  createHttpNotificationPreferencesGateway,
  createHttpNotificationsGateway,
  createOnlineDataSource,
  type FoundingGateway,
  type InviteAdminGateway,
  type MembersGateway,
  type PeopleGateway,
  type InviteGateway,
  type MyInvitationsGateway,
} from '@gisik-nokma/app-core/online';
import { authClient } from './auth-client.js';
import { rememberLastUserId } from './last-user-id.js';
import { createWebAuthoringGateway } from './authoring/data-source-gateway.js';
import { createHttpTicketLocator, type TicketLocator } from './ticket-location.js';
import { clearReadCaches } from './clear-read-caches.js';
import { useFreshness } from './freshness.js';
import { signInWithNext, withSignInOnExpiredWrite } from './expired-session.js';

/**
 * The shell's whole world, in one object.
 *
 * `dataSource` is amendment 10's seam and carries the thirteen read/write methods
 * a replica must also implement. The GATEWAYS beside it are deliberately not
 * part of it.
 *
 * For the onboarding ones — founding a workspace, minting an invitation,
 * accepting one, and (Task 17) reading the invitations addressed to the
 * signed-in person — these are one-shot actions no replica ever serves offline,
 * and putting them in `DataSource` would oblige Plan 10's replica to implement
 * something it can only refuse. `myInvitations` is the sharpest of the four on
 * that point: whether an invitation is still pending depends on a credential row
 * and a clock that exist only on the server, so a replica could not answer it
 * even in principle. Each gateway module carries the argument in full.
 *
 * `authoring` (Plan 8 Task 13) joins them on the SAME argument, and this
 * docblock was corrected rather than left saying "three": four of that
 * gateway's eight members — `listWorkflows`, `getStateOccupancy`,
 * `getTypeWorkflowPopulation` and the bulk `migrateTypeToWorkflow` — have no
 * `DataSourceQuery` member at all, and each has a shipped route. Widening
 * `DataSource` to hold them would oblige the offline replica to answer for a
 * whole-workspace occupancy count and an irreversible cross-workflow migration
 * it cannot serve. `src/authoring/data-source-gateway.ts` states the choice, its
 * reasoning, and the alternative that was not taken.
 *
 * They are named here, on the one injected seam, rather than constructed inside
 * the pages that use them — which is what lets `test/invite-page.test.tsx`,
 * `test/founding.test.tsx` and `test/members-page.test.tsx` drive the REAL
 * `Providers`/`useAppServices` pair with stub gateways instead of replacing this
 * module with a mock and leaving the seam untested.
 */
export type AppServices = {
  dataSource: DataSource;
  cache: ClientStateCache;
  invites: InviteGateway;
  invitesAdmin: InviteAdminGateway;
  /** Task 17. The invitations addressed to the signed-in person, and Accept/Decline for them. */
  myInvitations: MyInvitationsGateway;
  founding: FoundingGateway;
  authoring: WorkflowAuthoringGateway;
  notifications: NotificationsGateway;
  /** Task 6 (account/help-screens plan). The `/account` mute-list gateway — global, no `workspaceId`. */
  notificationPreferences: NotificationPreferencesGateway;
  ticketLocation: TicketLocator;
  /** Access plan: the exact-email lookup and the outsider door. */
  people: PeopleGateway;
  /** Access follow-ups R5. Remove a person from the workspace. */
  members: MembersGateway;
};

const AppServicesContext = createContext<AppServices | null>(null);

/**
 * The ONE seam between this shell and the world (coordination amendment 10).
 * Every page reads its facts through `dataSource`; no page knows a URL.
 *
 * `services` is injected rather than constructed unconditionally — the coding
 * standard's DI rule, and the reason `test/page-refusals.test.tsx` can put a
 * refusing `DataSource` behind the real `Providers`/`useAppServices` pair
 * instead of replacing this module with a mock. The default arm is the one the
 * app actually runs.
 */
export function Providers({
  children,
  services,
}: {
  children: ReactNode;
  services?: AppServices;
}) {
  // The router is read through a REF (E5-25): the write guard below needs a way
  // to reach `/sign-in`, and putting `router` in the memo's dependency list
  // would rebuild the whole service graph — cache, transport, gateways — on
  // every navigation. `next/navigation`'s `push` is stable in practice, and the
  // ref makes that not matter either way.
  const router = useRouter();
  const push = useRef(router.push);
  push.current = router.push;

  const constructed = useMemo<AppServices | null>(() => {
    // Nothing is built when services were injected: a second, unused online
    // source would hold a second cache, and the pages would feed one and read
    // the other the day someone reached for it.
    if (services !== undefined) return null;
    const cache = createClientStateCache();
    // ONE transport for the gateways below — the four onboarding ones and the
    // authoring adapter — same-origin, so they carry the same session cookie
    // through the same Next rewrites the DataSource uses. A second client here
    // would be a second idea of where the server is.
    const http = createHttpClient('', (input, init) => fetch(input, init));
    const online = createOnlineDataSource({
      // Same-origin: Next's rewrites forward /v1/* to the API server, so the
      // cookie the browser already holds is sent without a CORS pre-flight.
      baseUrl: '',
      // The socket is the exception. Next dev does not proxy protocol upgrades,
      // so the stream is dialled at the server's own origin. `streamUrl()`
      // appends `/v1/stream` itself and rewrites the scheme http→ws, so what
      // belongs here is an ORIGIN, not a socket URL.
      streamBaseUrl: process.env.NEXT_PUBLIC_SERVER_URL ?? 'http://localhost:3000',
    });
    // The ONE wrap that turns any write's expired session into the redirect
    // (E5-25) — see `withSignInOnExpiredWrite`'s own docblock for why this is
    // not repeated at each of the nine write sites.
    // Identical reads in flight share one request (smoothness T3, audit SM-05); the
    // dedupe sits INSIDE the guard so a write's 401 still reaches it, and outside the
    // cache feed so a shared `getTicket` feeds the cache once.
    const dataSource = withSignInOnExpiredWrite(withInflightDedupe(withCacheFeed(online, cache)), () =>
      // The destination is carried, as it is on the read path (E5-32) — read
      // off `window` at the moment of the redirect, which is the only moment the
      // answer is right. No `usePathname` here: `Providers` is mounted once
      // above every route and holds no pathname of its own; `window.location` is
      // the URL the person is actually on.
      push.current(signInWithNext(window.location.pathname + window.location.search)),
    );
    return {
      dataSource,
      cache,
      invites: createHttpInviteGateway(http),
      invitesAdmin: createHttpInviteAdminGateway(http),
      // The SAME `http` again: this one speaks to `/v1/me/invitations*` through
      // the same same-origin rewrites carrying the same session cookie, and the
      // session is the whole scope of what it can read.
      myInvitations: createHttpMyInvitationsGateway(http),
      founding: createHttpFoundingGateway(http),
      // The SAME `dataSource` the pages read through and the SAME `http` the
      // three gateways above use — the adapter serves THREE of its eight
      // members through the first and FIVE through the second, so handing it a
      // second of either would give the builder a different idea of the server
      // than the rest of this shell has.
      authoring: createWebAuthoringGateway({ dataSource, http }),
      // The SAME `http` again, and for the same reason: these two speak to
      // `/v1/me/notifications*` and `/v1/workspaces/:ws/tickets/:id` through the
      // same same-origin rewrites carrying the same session cookie.
      notifications: createHttpNotificationsGateway(http),
      // The SAME `http` again: `/v1/me/notification-preferences` is the same
      // same-origin, same-session-cookie transport every gateway here uses.
      notificationPreferences: createHttpNotificationPreferencesGateway(http),
      ticketLocation: createHttpTicketLocator(http),
      people: createHttpPeopleGateway(http),
      members: createHttpMembersGateway(http),
    };
  }, [services]);
  const value = services ?? constructed;
  useFreshness();
  return <AppServicesContext.Provider value={value}>{children}</AppServicesContext.Provider>;
}

export function useAppServices(): AppServices {
  const services = useContext(AppServicesContext);
  if (services === null) throw new Error('useAppServices requires <Providers> above it');
  return services;
}

/**
 * RULING E5-37. `name: user.name ?? user.id` never caught an EMPTY string —
 * `??` only catches `null`/`undefined` — and better-auth's magic-link
 * population creates a user with `name: name || ''`, so every email sign-up
 * carries `name === ''`, confirmed in the database (`members/page.tsx`'s own
 * `memberLabel` docblock records the same population fact). The result was
 * an empty accessible name and an empty monogram on every surface this
 * shell shows the signed-in person's name — "Workspaces — ", "Account menu
 * for ", a bare "?" avatar.
 *
 * Same `name → email → id` order `members/page.tsx`'s `memberLabel` already
 * uses for the SAME better-auth population, so the two surfaces cannot
 * describe one person differently. Fixed once, here, rather than at each of
 * `useCurrentUser`'s and `useSessionStatus`'s five consumer sites, so none
 * of them can drift back to a bare `??`.
 */
function userDisplayName(user: { name: string; id: string; email?: unknown }): string {
  const name = user.name.trim();
  if (name !== '') return name;
  const email = typeof user.email === 'string' ? user.email.trim() : '';
  if (email !== '') return email;
  return user.id;
}

/**
 * The signed-in user, or null while the session loads / when signed out.
 *
 * `email` joined in Round 24, for the account menu's header: the nav's control
 * became a monogram avatar, and a monogram does not say WHO is signed in the
 * way the old `Sign out {name}` button did. The menu says it instead, and needs
 * the email to distinguish two accounts whose names match.
 *
 * It is `string | null`, not `string`. `/account` reads `user.email` directly
 * off the session and can assume it, because that page renders only under a
 * resolved session; this hook answers on every page in the product including
 * ones where the session is still in flight, and a `??  ''` here would hand the
 * menu an empty string to render as though it were an address. `null` is the
 * absence, and the menu omits the line rather than drawing a blank one.
 */
export function useCurrentUser(): { id: string; name: string; email: string | null } | null {
  const resolved = resolveSession(authClient.useSession());
  if (resolved.kind !== 'signed-in') return null;
  const { user } = resolved;
  return {
    id: user.id,
    // The RAW name, deliberately: the shell's one reading of "what do we call
    // this person" is `display-label.ts` (E4-33, landed) — `displayLabelOf`
    // falls back to the email for the label and `avatarNameOf` to the email's
    // handle for the monogram. Rewriting `name` to the email HERE (E5-37's
    // first shape) reached the avatar as a name and made the monogram's title
    // the whole address, which B03's 13.1054 pins as the defect. E5-37's
    // `name → email → id` fallback lives on in `useSessionStatus` below, whose
    // consumers print a name and have no label helper.
    name: user.name,
    email: user.email,
  };
}

/**
 * Three states, because `useCurrentUser`'s two collapse one that matters.
 *
 * `useCurrentUser` answers `null` BOTH while the session request is in flight
 * and when there is genuinely nobody signed in — which is harmless on a page
 * that only greets the viewer by name, and a false statement on any page that
 * branches on it. The invite page is exactly such a page: the plan's
 * `user === null ? <Sign in to accept> : <Join>` shows "Sign in to accept" to a
 * person who IS signed in, for as long as the session request takes, and a
 * click on that link sends them through an authentication they had already
 * completed.
 *
 * `isPending` is better-auth 1.7.2's own flag on the `useSession` return
 * (`better-auth/dist/client/react/index.d.mts:28`), so this is reading the
 * library's answer rather than inferring one from the absence of data.
 */
export type SessionStatus =
  | { kind: 'loading' }
  | { kind: 'signed-out' }
  | { kind: 'signed-in'; user: { id: string; name: string } }
  /**
   * The session read FAILED (a 429, a 5xx, a dropped connection) and there is
   * no earlier answer to fall back on — first load. It is neither "nobody is
   * signed in" nor "still loading": a consumer must not print "Sign in to …"
   * over it (SYS-01). Once a user HAS been seen, a failed read keeps answering
   * `signed-in` with that last known user instead; `useSessionFailure` carries
   * the failure itself for the shell's notice.
   */
  | { kind: 'error' };

/**
 * The ONE reading of `authClient.useSession()` — `useCurrentUser`,
 * `useSessionStatus` and `useSessionFailure` all go through it, so the nav and
 * the pages' "Sign in to …" fallbacks cannot disagree again (SYS-01 had two
 * code paths, one blind to `error`).
 *
 * **The last known user is module state**, written here and read when a later
 * read fails: better-auth keeps `data` across a failed REFETCH but not across a
 * failed first read, and a person who was signed in a minute ago has not signed
 * out because the server said 429. It is cleared only by an answer that means
 * it — a read that resolved with nobody, or a 401 — never by a failure.
 */
type KnownUser = { id: string; name: string; email: string | null; displayName: string };
let lastKnownUser: KnownUser | null = null;

/** Tests only: the last known user outlives a render, so a case starts from none. */
export function resetLastKnownUser(): void {
  lastKnownUser = null;
}

type Resolved =
  | { kind: 'loading' | 'signed-out' | 'error' }
  | { kind: 'signed-in'; user: KnownUser };

function resolveSession(session: ReturnType<typeof authClient.useSession>): Resolved {
  const user = session.data?.user;
  if (user !== undefined && user !== null) {
    // A different person than the one this tab last knew: whatever it read as
    // them is not theirs to be served (smoothness T3, case 25.028 door 4). The
    // first resolve (`lastKnownUser === null`) and a re-render are not changes.
    if (lastKnownUser !== null && lastKnownUser.id !== user.id) clearReadCaches();
    // The id outlives the page so a screen can read ITS remembered tab in the first frame (spec D9).
    if (lastKnownUser?.id !== user.id && typeof window !== 'undefined') rememberLastUserId(user.id);
    lastKnownUser = {
      id: user.id,
      name: user.name,
      email: typeof user.email === 'string' && user.email !== '' ? user.email : null,
      displayName: userDisplayName(user),
    };
    return { kind: 'signed-in', user: lastKnownUser };
  }
  const error = session.error;
  if (error !== undefined && error !== null && (error as { status?: number }).status !== 401) {
    return lastKnownUser === null ? { kind: 'error' } : { kind: 'signed-in', user: lastKnownUser };
  }
  if (session.isPending) return { kind: 'loading' };
  // Signed out (another tab, an expired cookie): the person this tab knew is gone.
  if (lastKnownUser !== null) clearReadCaches();
  lastKnownUser = null;
  if (typeof window !== 'undefined') rememberLastUserId(null);
  return { kind: 'signed-out' };
}

export function useSessionStatus(): SessionStatus {
  const resolved = resolveSession(authClient.useSession());
  const kind = resolved.kind;
  const id = resolved.kind === 'signed-in' ? resolved.user.id : '';
  const name = resolved.kind === 'signed-in' ? resolved.user.displayName : '';
  // ONE object per (kind, id, name), not one per render (smoothness T12, audit SM-10): the answer is read by a
  // dozen consumers, and a session refetch that changes nothing a consumer can see must not hand each a new object.
  return useMemo<SessionStatus>(
    () => (kind === 'signed-in' ? { kind, user: { id, name } } : { kind }),
    [kind, id, name],
  );
}

/**
 * Whether the session read is failing right now, and how to ask again — the
 * shell notice's two inputs. `failed` stays true across the retry's own
 * in-flight window (better-auth clears `error` when a refetch starts), so the
 * notice does not blink off and on while it is still trying.
 */
export function useSessionFailure(): { failed: boolean; error: unknown; retry: () => void } {
  const session = authClient.useSession();
  const hasError =
    session.error !== undefined && session.error !== null && (session.error as { status?: number }).status !== 401;
  const wasFailed = useRef(false);
  const failed = hasError || (wasFailed.current && session.isRefetching === true);
  wasFailed.current = failed;
  const refetch = session.refetch;
  return {
    failed,
    error: hasError ? session.error : null,
    retry: () => {
      if (typeof refetch === 'function') void refetch();
    },
  };
}
