'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import {
  createClientStateCache,
  withCacheFeed,
  type ClientStateCache,
  type DataSource,
  type NotificationPreferencesGateway,
  type NotificationsGateway,
  type WorkflowAuthoringGateway,
} from '@gisik-nokma/app-core';
import {
  createHttpClient,
  createHttpFoundingGateway,
  createHttpInviteAdminGateway,
  createHttpInviteGateway,
  createHttpMyInvitationsGateway,
  createHttpNotificationPreferencesGateway,
  createHttpNotificationsGateway,
  createOnlineDataSource,
  type FoundingGateway,
  type InviteAdminGateway,
  type InviteGateway,
  type MyInvitationsGateway,
} from '@gisik-nokma/app-core/online';
import { authClient } from './auth-client.js';
import { createWebAuthoringGateway } from './authoring/data-source-gateway.js';
import { createHttpTicketLocator, type TicketLocator } from './ticket-location.js';

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
    const dataSource = withCacheFeed(online, cache);
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
    };
  }, [services]);
  const value = services ?? constructed;
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
  const session = authClient.useSession();
  const user = session.data?.user;
  if (user === undefined || user === null) return null;
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
    email: typeof user.email === 'string' && user.email !== '' ? user.email : null,
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
  | { kind: 'signed-in'; user: { id: string; name: string } };

export function useSessionStatus(): SessionStatus {
  const session = authClient.useSession();
  const user = session.data?.user;
  if (user !== undefined && user !== null) {
    return { kind: 'signed-in', user: { id: user.id, name: userDisplayName(user) } };
  }
  return session.isPending ? { kind: 'loading' } : { kind: 'signed-out' };
}
