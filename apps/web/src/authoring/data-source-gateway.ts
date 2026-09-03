import type { DataSource } from '@gisik-nokma/app-core';
import type {
  MigrationOutcome,
  MigrationRequest,
  WorkflowAuthoringGateway,
  WorkspaceMember,
} from '@gisik-nokma/app-core';
import { HttpError, type HttpClient } from '@gisik-nokma/app-core/online';
import type { PublishedWorkflowDef } from '@gisik-nokma/domain';

/**
 * # The `WorkflowAuthoringGateway`, served half by Plan 6's `DataSource` and
 * half by the routes that shipped without a seam.
 *
 * ## The seam problem, measured rather than assumed
 *
 * Plan 8 amendment 10 says `apps/web` implements this gateway "over Plan 6's
 * `DataSource`". Measured against `packages/app-core/src/data-source.ts` at this
 * sha, that is true of exactly **four** of the gateway's **eight** members:
 *
 * | gateway member                | `DataSourceQuery` member                    |
 * |-------------------------------|---------------------------------------------|
 * | `getWorkflow`                 | `getWorkflowDef(workspaceId, workflowId, v?)` |
 * | `listTicketTypes`             | `getTicketTypes(workspaceId)`                |
 * | `submit`                      | `DataSource.ingest(events)`                  |
 * | `listMembers`                 | `getMembers(workspaceId)` — **and it cannot**, see below |
 *
 * The other four — `listWorkflows`, `getStateOccupancy`,
 * `getTypeWorkflowPopulation`, `migrateTypeToWorkflow` — have **no
 * `DataSourceQuery` member at all**, and every one of them has a live registered
 * server route (`apps/server/src/routes/builder-reads.ts`;
 * `registerBuilderReadRoutes` is called from `apps/server/src/app.ts`). This is
 * the inverse of this series' usual gap: the server is ahead, and the seam is
 * missing.
 *
 * ## What was chosen, and the alternative that was not
 *
 * **Chosen:** the four unserved members are implemented here, in this adapter,
 * over the existing `@gisik-nokma/app-core/online` HTTP client.
 * `packages/app-core/src/data-source.ts` is untouched. Amendment 10 forbids
 * *views* speaking HTTP; an adapter is not a view, and the screens still see
 * nothing but `WorkflowAuthoringGateway`. The reason to prefer this: `DataSource`
 * is the contract Plan 10's offline replica must ALSO satisfy, and widening it
 * would oblige that replica — and the fake, and every future implementor — to
 * answer for a bulk cross-workflow migration and a whole-workspace occupancy
 * count it has no offline answer for. That is the argument `src/providers.tsx`
 * already makes for keeping the three onboarding gateways out of `DataSource`,
 * and this is a fourth instance of it.
 *
 * **The alternative, stated so it is a choice and not a blind spot:** widen
 * `DataSourceQuery` with the four members and let the online implementation and
 * the replica each answer. It is defensible — it would put every server read
 * behind one seam instead of two — and it is what the plan's sentence most
 * literally asks for. It was not taken for the reason above, and because it
 * changes a contract two other plans have already built against. **If a later
 * ruling prefers it, the change is confined to this file plus
 * `online-data-source.ts`.**
 *
 * ## `getMembers` CANNOT serve `listMembers`, and no cast fixes it
 *
 * `DataSourceQuery.getMembers` returns `Actor[]` — `{ id, name }`
 * (`packages/app-core/src/view-types.ts:3`). `listMembers` must return
 * `WorkspaceMember[]` — `{ userId, displayName, role }`
 * (`packages/domain/src/read-models.ts:310`). The missing field is **`role`**,
 * and it is missing in the client, not on the wire: the route answers a full
 * `MemberListResponse` and `online-data-source.ts:130` maps it down through
 * `mapActors`, discarding the role. A cast would have compiled and produced a
 * roster of `undefined` roles.
 *
 * That role is not decoration. The builder's `require-different-user` editor and
 * every rule summary name people out of this roster, and `builder-wiring.tsx`
 * resolves **the signed-in user's own role** from it — the only readable source
 * of it on this branch, since `getMyWorkspaces` refuses whole. So the roster is
 * read here from the route that serves it in full. Do not "simplify" this back
 * to `dataSource.query.getMembers`: `test/data-source-gateway.test.ts` asserts
 * that member is never called, precisely so the simplification reddens.
 *
 * ## A 404 is a refusal to answer, never an empty answer
 *
 * `createHttpClient` answers **`null`** for a 404 on a GET, deliberately: every
 * `/v1` read route sends one frozen body for "no such thing" and for "not
 * yours", so a client that distinguished them would be inventing an existence
 * oracle the server refused to provide.
 *
 * For `getWorkflow` that `null` is the honest answer and it is passed through —
 * "no published workflow has this id" is what the edit page renders. For the
 * other four reads there is an empty value in reach (`[]`, `{}`, `0`) and every
 * one of them would be a lie: "this workspace has no workflows", "no ticket is
 * in any state", "nothing is pinned to this workflow". `gateway.ts` forbids it
 * by name for both counts — "it may reject, and the caller says 'unavailable'
 * rather than guessing a number" — so those four throw `AuthoringReadRefused`.
 *
 * The screens are already built for it: `WorkflowListScreen` renders a load
 * error, and `WorkflowBuilderScreen` catches a refused roster specifically
 * (a guest may not call the members route at all — executor ruling 2026-09-02).
 */

/**
 * The server declined to answer this read — a 404 from a `/v1` read door, which
 * means "no such thing OR not yours" and deliberately does not say which.
 *
 * A named class rather than a bare `Error` because one caller acts on the
 * distinction: `builder-wiring.tsx` reads a 404 on the roster as "the no-guests
 * door turned me away, so treat me as a guest", and must NOT read a 500 or a
 * dropped connection the same way — that would render a read-only builder to
 * someone whose authorization was never established.
 */
export class AuthoringReadRefused extends Error {
  readonly route: string;
  constructor(route: string) {
    super(`The server did not answer ${route}. It exists and is not yours, or it does not exist.`);
    this.name = 'AuthoringReadRefused';
    this.route = route;
  }
}

/** `null` is the 404 affordance; every read that has no honest empty rejects on it. */
function answered<T>(raw: T | null, route: string): T {
  if (raw === null) throw new AuthoringReadRefused(route);
  return raw;
}

export type WebAuthoringDeps = {
  /** Plan 6's seam, for the four members it already serves. */
  dataSource: DataSource;
  /**
   * The same-origin transport `src/providers.tsx` builds once for the three
   * onboarding gateways. Shared rather than constructed here: a second client
   * would be a second idea of where the server is.
   */
  http: HttpClient;
};

export function createWebAuthoringGateway(deps: WebAuthoringDeps): WorkflowAuthoringGateway {
  const { dataSource, http } = deps;
  const ws = (workspaceId: string) => `/v1/workspaces/${encodeURIComponent(workspaceId)}`;

  return {
    /**
     * `GET /v1/workspaces/:workspaceId/workflows` — the latest version of each.
     * No `DataSourceQuery` member exists; `getWorkflowDef` answers ONE workflow
     * and cannot be looped over a list nobody has yet.
     */
    listWorkflows: async (workspaceId) => {
      const route = `${ws(workspaceId)}/workflows`;
      const body = answered(await http.get(route), route) as { workflows: PublishedWorkflowDef[] };
      return body.workflows;
    },

    /**
     * Through `DataSource`. `getWorkflowDef` returns `WorkflowDef | null`, and
     * `PublishedWorkflowDef` is `WorkflowDef` plus an OPTIONAL `stateMapping`,
     * so this is a widening the compiler accepts without a cast. Nothing is
     * dropped in transit either: `mapWorkflowDef` validates field by field and
     * then returns "the whole definition object as it arrived" — checked in
     * `online/mappers.ts:508` rather than trusted, because a field this seam
     * dropped would be a field the next publish silently deleted.
     */
    getWorkflow: (workspaceId, workflowId) => dataSource.query.getWorkflowDef(workspaceId, workflowId),

    /** Through `DataSource` — `getTicketTypes` returns the domain `TicketTypeDef[]` already. */
    listTicketTypes: (workspaceId) => dataSource.query.getTicketTypes(workspaceId),

    /** Over HTTP, and the docblock above says why `getMembers` cannot stand in. */
    listMembers: async (workspaceId) => {
      const route = `${ws(workspaceId)}/members`;
      const body = answered(await http.get(route), route) as { members: WorkspaceMember[] };
      return body.members;
    },

    /**
     * `GET .../workflows/:workflowId/state-occupancy` — admin-only at the door,
     * so a member's 404 here is ordinary and reaches the mapping dialog as
     * "unavailable", which is what `gateway.ts` asks for.
     */
    getStateOccupancy: async (workspaceId, workflowId) => {
      const route = `${ws(workspaceId)}/workflows/${encodeURIComponent(workflowId)}/state-occupancy`;
      const body = answered(await http.get(route), route) as { counts: Record<string, number> };
      return body.counts;
    },

    /**
     * `GET .../ticket-types/:typeId/population?workflowId=` — the workflow is a
     * QUERY parameter, not a path segment, and the door answers **400** without
     * one. Admin-only, same terms as occupancy.
     */
    getTypeWorkflowPopulation: async (workspaceId, typeId, workflowId) => {
      const route =
        `${ws(workspaceId)}/ticket-types/${encodeURIComponent(typeId)}/population` +
        `?workflowId=${encodeURIComponent(workflowId)}`;
      const body = answered(await http.get(route), route) as { count: number };
      return body.count;
    },

    /**
     * `POST .../ticket-types/:typeId/migrate` — the one write here that is not
     * an event submission, and the one place a REFUSAL is a value rather than an
     * exception.
     *
     * The route answers **422** carrying a `MigrationOutcome` whose `status` is
     * `'refused'` — the door's own rule id and its own sentence. `createHttpClient`
     * throws on every non-2xx POST (correctly: a 404 answered as `null` on a
     * write told a caller their save had landed when nothing was stored), so the
     * refusal arrives as an `HttpError` and is unwrapped back into the value the
     * gateway's type promises. `ticket-type-editor-screen.tsx` renders
     * `outcome.reason` verbatim.
     *
     * A failure whose body does NOT narrow to that shape — a 500, an HTML proxy
     * page, a truncated response — is re-thrown. Folding it into a `refused`
     * would put a rule id nobody wrote in front of an admin as though the server
     * had refused them, when in fact nothing is known about what happened.
     *
     * The body carries three keys and not five: `migrateBodySchema` is
     * `.strict()`, and `workspaceId`/`typeId` travel in the URL.
     */
    migrateTypeToWorkflow: async (input: MigrationRequest): Promise<MigrationOutcome> => {
      const route = `${ws(input.workspaceId)}/ticket-types/${encodeURIComponent(input.typeId)}/migrate`;
      try {
        return (await http.post(route, {
          fromWorkflowId: input.fromWorkflowId,
          toWorkflowId: input.toWorkflowId,
          stateMap: input.stateMap,
        })) as MigrationOutcome;
      } catch (cause) {
        if (cause instanceof HttpError && isRefusal(cause.body)) return cause.body;
        throw cause;
      }
    },

    /** Through `DataSource.ingest` — the ordinary client door, with the ordinary refusals. */
    submit: (events) => dataSource.ingest(events),
  };
}

/** The door's refusal shape, narrowed rather than asserted. */
function isRefusal(body: unknown): body is Extract<MigrationOutcome, { status: 'refused' }> {
  if (body === null || typeof body !== 'object') return false;
  const record = body as Record<string, unknown>;
  return (
    record['status'] === 'refused' &&
    typeof record['rule'] === 'string' &&
    typeof record['reason'] === 'string'
  );
}
