import type {
  DataSource,
  DataSourceQuery,
  NotificationsGateway,
  UserPreferences,
  WorkflowAuthoringGateway,
} from '@gisik-nokma/app-core';
import {
  SERVING_GAPS,
  ServingGapError,
  type FoundingGateway,
  type InviteAdminGateway,
  type InviteGateway,
  type MyInvitationsGateway,
} from '@gisik-nokma/app-core/online';
import type { AppServices } from '../../src/providers.js';
import type { TicketLocator } from '../../src/ticket-location.js';

export const EMPTY_PREFERENCES: UserPreferences = {
  version: 1,
  projects: {},
  savedFilters: [],
};

/**
 * A refusal built from the REAL table `mappers.ts` throws from, so a test that
 * asserts on the words is asserting the server's own gap description and not a
 * fixture's paraphrase of it.
 */
export function refuse(method: keyof typeof SERVING_GAPS): () => Promise<never> {
  const absences = SERVING_GAPS[method];
  if (absences === undefined) throw new Error(`no serving gap recorded for ${method}`);
  return () => Promise.reject(new ServingGapError(method, absences));
}

/**
 * A `DataSource` in the state the SHIPPED server actually puts this shell in:
 * the FOUR refusing reads refuse, and everything a case has not deliberately
 * stubbed rejects by name. Deliberate: a stub that answered `[]` or `null` for
 * an un-stubbed read would let a page under test render an invented blank and
 * call it a pass.
 *
 * **It was six.** `getTickets` and `getTicket` refused here until ruling P25
 * clause 1's buildable subset landed and their absence lists were deleted from
 * `SERVING_GAPS`. They are `unstubbed` now rather than answering something: this
 * helper's whole rule is that a read a case did not stub must fail loudly, and a
 * served read is no more entitled to a default `[]` than a refusing one was —
 * the reason `getTicketTypes` is unstubbed too, which is stated below.
 */
/**
 * The four gateways beside `DataSource`, in the state a case has not stubbed
 * them: every method rejects BY NAME. Same rule as the un-stubbed reads above —
 * a gateway that answered `null` or `[]` by default would let a page under test
 * render an invented blank and call it a pass.
 *
 * `authoring` (Plan 8 Task 13) is the fourth. Its `listMembers` is the one a
 * case almost always has to stub even when it does not care about the roster:
 * `useBuilderWiring` reads the SIGNED-IN USER'S OWN ROLE out of it, because
 * `getMyWorkspaces` — the route that carries a role — refuses whole on this
 * branch. Left un-stubbed it rejects by name and the page under test renders
 * the refusal, which is the honest failure rather than a silent read-only
 * screen.
 */
export type GatewayStubs = {
  invites?: Partial<InviteGateway>;
  invitesAdmin?: Partial<InviteAdminGateway>;
  /**
   * Task 17's caller-scoped invitations. Same rule as every gateway here:
   * un-stubbed members reject BY NAME. A case that mounts `/workspaces` and
   * forgets this one sees the banner say so out loud rather than rendering the
   * empty list it would have invented — which matters more here than elsewhere,
   * because "no banner" is this component's CORRECT rendering for an empty
   * answer, and a default `[]` would make every banner case pass without the
   * banner ever being asked anything.
   */
  myInvitations?: Partial<MyInvitationsGateway>;
  founding?: Partial<FoundingGateway>;
  authoring?: Partial<WorkflowAuthoringGateway>;
  /**
   * Plan 9 Task 14's two. Same rule as every gateway above: un-stubbed members
   * reject BY NAME, so a case that forgot to stub `unreadCount` sees the nav
   * badge stay dark for a stated reason rather than reading 0 and passing.
   */
  notifications?: Partial<NotificationsGateway>;
  ticketLocation?: Partial<TicketLocator>;
};

export function stubServices(
  overrides: Partial<DataSourceQuery>,
  gateways: GatewayStubs = {},
): AppServices {
  const unstubbed = (name: string) => () =>
    Promise.reject(new Error(`this case did not stub ${name}`));
  const query: DataSourceQuery = {
    // UNSTUBBED since rulings P32/P38 served it, and NOT `[]`. This read
    // refused for the whole of this helper's life, and `refuse()` throws when
    // the gap it names disappears — which is how a served method announced
    // itself here rather than degrading quietly. `[]` would be this helper
    // asserting the user belongs to no workspace, which is a claim about the
    // world; the same argument `getTicketTypes` below makes for itself.
    getMyWorkspaces: unstubbed('getMyWorkspaces'),
    getMembers: unstubbed('getMembers'),
    getBoard: unstubbed('getBoard'),
    getTickets: unstubbed('getTickets'),
    getTicket: unstubbed('getTicket'),
    getTicketHistory: unstubbed('getTicketHistory'),
    getWorkflowDef: unstubbed('getWorkflowDef'),
    // UNSTUBBED, not `[]`, even though the shipped server serves this one. The
    // rule above holds for a SERVED read exactly as for a refusing one: `[]`
    // here would be this helper asserting the workspace defines no ticket types
    // — a world Plan 4's bootstrap makes impossible — and a page under test
    // would render an invented blank picker and pass.
    getTicketTypes: unstubbed('getTicketTypes'),
    search: refuse('search'),
    // UNSTUBBED since rulings P39 and P40 served them, and NOT `[]` — the same
    // treatment `getMyWorkspaces` got above, for the same reason and by the
    // same mechanism. `refuse()` THROWS when the gap it names disappears from
    // the register, which is how a served method announces itself here instead
    // of degrading quietly: these two lines took eighty-six tests down in one
    // gate run, and that is the check working. `[]` or three empty groups would
    // be this helper asserting the viewer has no work and nothing needs
    // attention — claims about the world — and a page under test would render
    // an invented blank and pass.
    getMyWork: unstubbed('getMyWork'),
    getAttention: unstubbed('getAttention'),
    getPreferences: async () => EMPTY_PREFERENCES,
    putPreferences: async () => undefined,
    ...overrides,
  };
  const dataSource: DataSource = {
    ingest: async () => [],
    query,
    subscribe: () => () => undefined,
  };
  const unstubbedGateway = (name: string) => () =>
    Promise.reject(new Error(`this case did not stub ${name}`));
  // `cache` is read only by CreateTicketFlow's instant pre-check, which no case
  // opens; a null-object keeps these files from depending on the cache module.
  return {
    dataSource,
    cache: null as unknown as AppServices['cache'],
    invites: {
      getInvite: unstubbedGateway('invites.getInvite'),
      acceptInvite: unstubbedGateway('invites.acceptInvite'),
      ...gateways.invites,
    },
    invitesAdmin: {
      mintInvite: unstubbedGateway('invitesAdmin.mintInvite'),
      listPending: unstubbedGateway('invitesAdmin.listPending'),
      ...gateways.invitesAdmin,
    },
    myInvitations: {
      list: unstubbedGateway('myInvitations.list'),
      accept: unstubbedGateway('myInvitations.accept'),
      decline: unstubbedGateway('myInvitations.decline'),
      ...gateways.myInvitations,
    },
    founding: {
      foundWorkspace: unstubbedGateway('founding.foundWorkspace'),
      ...gateways.founding,
    },
    authoring: {
      listWorkflows: unstubbedGateway('authoring.listWorkflows'),
      getWorkflow: unstubbedGateway('authoring.getWorkflow'),
      listTicketTypes: unstubbedGateway('authoring.listTicketTypes'),
      listMembers: unstubbedGateway('authoring.listMembers'),
      getStateOccupancy: unstubbedGateway('authoring.getStateOccupancy'),
      getTypeWorkflowPopulation: unstubbedGateway('authoring.getTypeWorkflowPopulation'),
      migrateTypeToWorkflow: unstubbedGateway('authoring.migrateTypeToWorkflow'),
      submit: unstubbedGateway('authoring.submit'),
      ...gateways.authoring,
    },
    notifications: {
      list: unstubbedGateway('notifications.list'),
      unreadCount: unstubbedGateway('notifications.unreadCount'),
      markRead: unstubbedGateway('notifications.markRead'),
      ...gateways.notifications,
    },
    ticketLocation: {
      locate: unstubbedGateway('ticketLocation.locate'),
      ...gateways.ticketLocation,
    },
  };
}
