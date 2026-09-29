import type {
  DataSource,
  DataSourceQuery,
  NotificationPreferencesGateway,
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
  type PeopleGateway,
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
 * **no read refuses for a serving reason any more**, and everything a case has
 * not deliberately stubbed rejects by name. Deliberate: a stub that answered `[]`
 * or `null` for an un-stubbed read would let a page under test render an invented
 * blank and call it a pass.
 *
 * **⚠ CORRECTED 2026-09-20.** This read *"the FOUR refusing reads refuse"*, and
 * *"**It was six.** `getTickets` and `getTicket` refused here until ruling P25
 * clause 1's buildable subset landed and their absence lists were deleted from
 * `SERVING_GAPS`."* The count kept falling after that — 4 at P25 clause 1
 * (`c86c4b5c`, 2026-09-06), 3 at P32/P38, 1 at P39/P40, and **0 on 2026-09-19**
 * when `search` was served — so every read below is `unstubbed` rather than
 * refusing. **`refuse()` above now has NO callers**, and cannot succeed if given
 * one: it throws whenever `SERVING_GAPS` carries no entry for the method, which is
 * every method, the register being empty. It is kept because it is the check that
 * ANNOUNCED each closing, one gate run at a time — a served read is no more
 * entitled to a default `[]` than a refusing one was, the reason `getTicketTypes`
 * is unstubbed too, stated below. *Owner for removing it: whoever next touches this
 * helper.*
 */
/**
 * The four gateways beside `DataSource`, in the state a case has not stubbed
 * them: every method rejects BY NAME. Same rule as the un-stubbed reads above —
 * a gateway that answered `null` or `[]` by default would let a page under test
 * render an invented blank and call it a pass.
 *
 * `authoring` (Plan 8 Task 13) is the fourth. Its `listMembers` is the one a
 * case almost always has to stub even when it does not care about the roster:
 * `useBuilderWiring` reads the SIGNED-IN USER'S OWN ROLE out of it. **⚠ CORRECTED
 * 2026-09-20:** this read *"because `getMyWorkspaces` — the route that carries a
 * role — refuses whole on this branch."* It does not — rulings P32/P38 served it and
 * the register has been empty since 2026-09-19. Left un-stubbed it rejects by name and the page under test renders
 * the refusal, which is the honest failure rather than a silent read-only
 * screen.
 */
export type GatewayStubs = {
  invites?: Partial<InviteGateway>;
  invitesAdmin?: Partial<InviteAdminGateway>;
  /** Access plan: the exact-email lookup and the outsider door. Same rule: un-stubbed members reject BY NAME. */
  people?: Partial<PeopleGateway>;
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
  /**
   * Task 6 (account/help-screens plan). Same rule as every gateway above: an
   * un-stubbed member rejects BY NAME rather than answering the all-on
   * default `{ mutedKinds: [] }` a real "nothing saved yet" read gives — that
   * default is a claim about the world (`EMPTY_NOTIFICATION_PREFERENCES`'s
   * own meaning in `packages/domain/src/notification-preferences.ts`), and
   * this helper's whole point is that no case gets it for free.
   */
  notificationPreferences?: Partial<NotificationPreferencesGateway>;
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
    // UNSTUBBED, the same rule as `getMyWorkspaces` above: `[]` would be this
    // helper asserting the caller has nothing deleted — a claim about the
    // world — and a page under test could pass against a read nobody stubbed.
    getDeletedItems: unstubbed('getDeletedItems'),
    // Every document render asks this in the background (trash Plan 3); "nothing
    // was purged" is exactly what every page saw before the read existed, so a
    // case that does not care is not made to stub it. A case that does, stubs it.
    purgedAmong: async () => [],
    getMembers: unstubbed('getMembers'),
    // A label join must not fail a read, so `[]` (no name known) rather than `unstubbed`.
    getActorNames: async () => [],
    getBoard: unstubbed('getBoard'),
    getTickets: unstubbed('getTickets'),
    getTicket: unstubbed('getTicket'),
    getTicketHistory: unstubbed('getTicketHistory'),
    // UNSTUBBED, same rule (2026-09-20), and this one has a second reason: the
    // sheet draws NOTHING for an empty list — `AttachmentList` returns `null`
    // so as not to promise there are none — so `[]` here would be this helper
    // asserting the ticket has no files, and a case that meant to prove "the
    // list is drawn" could pass against a read nobody stubbed.
    getTicketAttachments: unstubbed('getTicketAttachments'),
    // UNSTUBBED, the same rule and the same second reason: the thread draws an
    // ANSWERED empty list as *"No comments yet."* — a sentence about the ticket
    // — so `[]` here would be this helper asserting nobody has commented, and a
    // case meaning to prove the thread is drawn could pass against a read
    // nobody stubbed.
    getTicketComments: unstubbed('getTicketComments'),
    // UNSTUBBED, the same rule and the same second reason, for the notes series'
    // seven reads (Plan 1 of 6). The server DOES serve all seven, so the
    // "served read takes the same treatment" argument above applies verbatim:
    // `[]` from `getNotes` would be this helper asserting the workspace has no
    // notes — a claim about the world — and a notes page under test would render
    // an invented blank and pass. No screen calls these yet (Plan 5 builds the
    // page), so nothing is overridden today; they are here because
    // `DataSourceQuery` grew them and this helper is typed by it.
    getNotes: unstubbed('getNotes'),
    getDeletedNotes: unstubbed('getDeletedNotes'),
    getNote: unstubbed('getNote'),
    getNotesForTicket: unstubbed('getNotesForTicket'),
    getNoteComments: unstubbed('getNoteComments'),
    getNoteHistory: unstubbed('getNoteHistory'),
    getNoteVersion: unstubbed('getNoteVersion'),
    getWorkflowDef: unstubbed('getWorkflowDef'),
    // UNSTUBBED, not `[]`, even though the shipped server serves this one. The
    // rule above holds for a SERVED read exactly as for a refusing one: `[]`
    // here would be this helper asserting the workspace defines no ticket types
    // — a world Plan 4's bootstrap makes impossible — and a page under test
    // would render an invented blank picker and pass.
    getTicketTypes: unstubbed('getTicketTypes'),
    // UNSTUBBED since the owner ruled the search QUERY must derive `matchedIn`
    // (2026-09-19), and NOT `[]` — the same treatment `getMyWorkspaces` and the
    // pair below got, for the same reason and by the same mechanism. **This line
    // was `refuse('search')`, and `refuse()` THROWS when the gap it names
    // disappears from the register — which is how a served method announces
    // itself here instead of degrading quietly.** It announced itself by taking
    // 311 tests down in one gate run, and that is the check working, not a
    // regression: `search` was the LAST entry in `SERVING_GAPS`, so this was the
    // last time this line could fire. `[]` would be this helper asserting the
    // workspace has no matching text — a claim about the world — and a page
    // under test would render an invented blank result and pass.
    search: unstubbed('search'),
    // UNSTUBBED, and here the reason is not a serving gap at all: notes search
    // worked from the first commit of its plan. `[]` would be this helper
    // asserting the workspace contains no note matching the query — a claim
    // about the world — and a page under test would render an invented blank
    // result and pass, exactly as the `search` line above says.
    searchNotes: unstubbed('searchNotes'),
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
    // UNSTUBBED, same rule again (second wave Task 6). The settings screen's
    // whole job is to show what this workspace CHOSE, so a default here would
    // be this helper inventing a choice — `staleDays: 7` with
    // `provenance: null` reads exactly like a workspace that claimed 7 days,
    // and the case asserting "renders the current values" would pass without
    // the server being asked anything.
    getWorkspaceSettings: unstubbed('getWorkspaceSettings'),
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
    people: {
      lookup: unstubbedGateway('people.lookup'),
      assignOutsider: unstubbedGateway('people.assignOutsider'),
      ...gateways.people,
    } as PeopleGateway,
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
      getTicketCountsByType: unstubbedGateway('authoring.getTicketCountsByType'),
      migrateTypeToWorkflow: unstubbedGateway('authoring.migrateTypeToWorkflow'),
      submit: unstubbedGateway('authoring.submit'),
      ...gateways.authoring,
    },
    notifications: {
      list: unstubbedGateway('notifications.list'),
      unreadCount: unstubbedGateway('notifications.unreadCount'),
      markRead: unstubbedGateway('notifications.markRead'),
      // Same rule as every member beside it: a case that forgets this one sees
      // the bulk write REJECT BY NAME rather than resolving with a `changed`
      // nobody supplied. A default `[]` here would be this helper asserting
      // "the bulk call changed nothing" — a claim about the world — and a case
      // asserting the Undo would pass without the write ever being described.
      setRead: unstubbedGateway('notifications.setRead'),
      ...gateways.notifications,
    },
    notificationPreferences: {
      load: unstubbedGateway('notificationPreferences.load'),
      save: unstubbedGateway('notificationPreferences.save'),
      ...gateways.notificationPreferences,
    },
    ticketLocation: {
      locate: unstubbedGateway('ticketLocation.locate'),
      ...gateways.ticketLocation,
    },
  };
}
