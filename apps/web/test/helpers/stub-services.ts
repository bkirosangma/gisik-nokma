import type { DataSource, DataSourceQuery, UserPreferences } from '@gisik-nokma/app-core';
import {
  SERVING_GAPS,
  ServingGapError,
  type FoundingGateway,
  type InviteAdminGateway,
  type InviteGateway,
} from '@gisik-nokma/app-core/online';
import type { AppServices } from '../../src/providers.js';

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
 * the six refusing reads refuse, and everything a case has not deliberately
 * stubbed rejects by name. Deliberate: a stub that answered `[]` or `null` for
 * an un-stubbed read would let a page under test render an invented blank and
 * call it a pass.
 */
/**
 * The three onboarding gateways, in the state a case has not stubbed them:
 * every method rejects BY NAME. Same rule as the un-stubbed reads above — a
 * gateway that answered `null` or `[]` by default would let a page under test
 * render an invented blank and call it a pass.
 */
export type GatewayStubs = {
  invites?: Partial<InviteGateway>;
  invitesAdmin?: Partial<InviteAdminGateway>;
  founding?: Partial<FoundingGateway>;
};

export function stubServices(
  overrides: Partial<DataSourceQuery>,
  gateways: GatewayStubs = {},
): AppServices {
  const unstubbed = (name: string) => () =>
    Promise.reject(new Error(`this case did not stub ${name}`));
  const query: DataSourceQuery = {
    getMyWorkspaces: refuse('getMyWorkspaces'),
    getMembers: unstubbed('getMembers'),
    getBoard: unstubbed('getBoard'),
    getTickets: refuse('getTickets'),
    getTicket: refuse('getTicket'),
    getTicketHistory: unstubbed('getTicketHistory'),
    getWorkflowDef: unstubbed('getWorkflowDef'),
    // UNSTUBBED, not `[]`, even though the shipped server serves this one. The
    // rule above holds for a SERVED read exactly as for a refusing one: `[]`
    // here would be this helper asserting the workspace defines no ticket types
    // — a world Plan 4's bootstrap makes impossible — and a page under test
    // would render an invented blank picker and pass.
    getTicketTypes: unstubbed('getTicketTypes'),
    search: refuse('search'),
    getMyWork: refuse('getMyWork'),
    getAttention: refuse('getAttention'),
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
    founding: {
      foundWorkspace: unstubbedGateway('founding.foundWorkspace'),
      ...gateways.founding,
    },
  };
}
