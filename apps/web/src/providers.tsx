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

/** The signed-in user, or null while the session loads / when signed out. */
export function useCurrentUser(): { id: string; name: string } | null {
  const session = authClient.useSession();
  const user = session.data?.user;
  return user === undefined || user === null ? null : { id: user.id, name: user.name ?? user.id };
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
    return { kind: 'signed-in', user: { id: user.id, name: user.name ?? user.id } };
  }
  return session.isPending ? { kind: 'loading' } : { kind: 'signed-out' };
}
