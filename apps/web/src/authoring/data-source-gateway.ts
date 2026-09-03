import type { DataSource } from '@gisik-nokma/app-core';
import type { MigrationOutcome, MigrationRequest, WorkflowAuthoringGateway } from '@gisik-nokma/app-core';
import { HttpError, type HttpClient } from '@gisik-nokma/app-core/online';
import type {
  MemberListResponse,
  StateOccupancyResponse,
  TypePopulationResponse,
  WorkflowListResponse,
} from '@gisik-nokma/domain';

/**
 * # The `WorkflowAuthoringGateway`: three members through Plan 6's `DataSource`,
 * five over the routes that shipped without a seam.
 *
 * ## The seam problem, measured rather than assumed
 *
 * Plan 8 amendment 10 says `apps/web` implements this gateway "over Plan 6's
 * `DataSource`". Measured against `packages/app-core/src/data-source.ts` at this
 * sha, the gateway's **eight** members fall into **three** groups, and the
 * counts below are the enumeration beside them rather than a claim about it.
 *
 * **Three ARE served, and go through `DataSource` here:**
 *
 * | gateway member    | `DataSourceQuery` member                      |
 * |-------------------|-----------------------------------------------|
 * | `getWorkflow`     | `getWorkflowDef(workspaceId, workflowId, v?)` |
 * | `listTicketTypes` | `getTicketTypes(workspaceId)`                 |
 * | `submit`          | `DataSource.ingest(events)`                   |
 *
 * **One LOOKS served and is not:** `listMembers` against
 * `getMembers(workspaceId)`. The names line up and the types do not — the whole
 * argument is under "`getMembers` CANNOT serve `listMembers`" below. It is
 * counted here as its own case precisely because folding it in with the three
 * above is the mistake this file exists to have already made once.
 *
 * **Four have NO `DataSourceQuery` member at all:** `listWorkflows`,
 * `getStateOccupancy`, `getTypeWorkflowPopulation`, `migrateTypeToWorkflow` —
 * and every one of them has a live registered server route
 * (`apps/server/src/routes/builder-reads.ts`; `registerBuilderReadRoutes` is
 * called from `apps/server/src/app.ts`). This is the inverse of this series'
 * usual gap: the server is ahead, and the seam is missing.
 *
 * Three plus one plus four is eight, which is `WorkflowAuthoringGateway`'s
 * whole surface.
 *
 * ## What was chosen, and the alternative that was not
 *
 * **Chosen:** the four unserved members — and `listMembers`, five in all — are
 * implemented here, in this adapter, over the existing
 * `@gisik-nokma/app-core/online` HTTP client.
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
 * "no published workflow has this id" is what the edit page renders. The four
 * reads that go over HTTP each have an empty value in reach, and every one of
 * them would be a lie: `listWorkflows` -> `[]`, "this workspace has no
 * workflows"; `listMembers` -> `[]`, "nobody is in this workspace";
 * `getStateOccupancy` -> `{}`, "no ticket is in any state";
 * `getTypeWorkflowPopulation` -> `0`, "nothing is pinned to this workflow".
 * `gateway.ts` forbids it by name for both counts — "it may reject, and the
 * caller says 'unavailable' rather than guessing a number" — so all four throw
 * `AuthoringReadRefused` instead.
 *
 * TWO consumers are built for it and one is NOT, and the difference matters
 * enough to say here rather than in a commit message. `WorkflowListScreen`
 * renders a load error on any rejection (`workflow-list-screen.tsx`, the
 * `.catch` that sets `loadFailed`), and `builder-wiring.tsx` narrows on
 * `AuthoringReadRefused` specifically — a 404 is "the no-guests door turned me
 * away", anything else is `refused` and rendered as such (a guest may not call
 * the members route at all — executor ruling 2026-09-02).
 * `WorkflowBuilderScreen` does NOT: `listMembers(...).catch(() => [])` is
 * blanket, so a 500, a dropped connection or an unparseable roster body becomes
 * the empty roster — the very lie the paragraph directly above says this
 * adapter declined to invent, told by the caller instead, into rule summaries
 * and `require-different-user` editors. That screen is `packages/app-core`, and
 * the narrowing that would fix it is not available to it: `AuthoringReadRefused`
 * is declared in THIS file, and `app-core` depends on `domain`, `rule-engine`
 * and `ui` alone. So the fix is a contract move, not a one-line catch, and it is
 * RECORDED in the coordination doc (Plan 8 Task 13 fix round, 2026-09-03) rather
 * than annexed here. The reason the adapter still rejects is unchanged: an
 * adapter that guessed `[]` would take the choice away from every consumer,
 * including the two that handle it correctly.
 *
 * ## What the response types buy, and what they do not
 *
 * Each HTTP read asserts the body to the SAME exported type the route annotates
 * its answer with — `WorkflowListResponse`, `MemberListResponse`,
 * `StateOccupancyResponse`, `TypePopulationResponse`, all from
 * `@gisik-nokma/domain`, all spelled `const body: X = {...}` in
 * `apps/server/src/routes/builder-reads.ts`. That is deliberate and it is the
 * whole of the type safety here, because `HttpClient.get` answers `unknown`:
 * with the shapes hand-spelled inline, as they were first written, renaming a
 * field on the shared type reddened the server and left this file GREEN reading
 * a key that no longer exists. Measured as a PAIR rather than reasoned: with the
 * inline shapes, `workflows` -> `defs` on `WorkflowListResponse` reddened
 * `@gisik-nokma/server:typecheck` (TS2339 on the renamed key) and left
 * `@gisik-nokma/web:typecheck` GREEN — the mutation that killed nothing here.
 * With the assertions below, the same rename reddens web at the read itself, and
 * so does `members` -> `roster` on `MemberListResponse`.
 *
 * The fifth body — `migrateTypeToWorkflow`'s POST answer — was never inline: it
 * asserts to the shared `MigrationOutcome` the gateway's own type promises, and
 * its refusal arm is `isRefusal`, a real narrowing rather than an assertion.
 * Its `migrated` arm gets the same nominal-only treatment as the four reads.
 *
 * What it does NOT buy is any check of what actually arrives. Unlike
 * `mapWorkflowDef`, which validates field by field (`online/mappers.ts:508`),
 * nothing here inspects the body at runtime: a deployed server that stopped
 * sending `role` would hand `builder-wiring.tsx` an `undefined` typed as
 * `WorkspaceRole`, and its `own?.role ?? LEAST_PRIVILEGE` would read an owner as
 * a guest. The mapper primitives that would catch it — `asRecord`, `asArray`,
 * `asString` — are private to `mappers.ts` and are not on the
 * `@gisik-nokma/app-core/online` export list, so validating here means a second
 * copy of that convention across a package boundary. That is a real gap, stated
 * at the site rather than described as safety.
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
  /** Plan 6's seam, for the three members it already serves. */
  dataSource: DataSource;
  /**
   * The same-origin transport `src/providers.tsx` builds once for the three
   * onboarding gateways and now hands to this one as well. Shared rather than
   * constructed here: a second client would be a second idea of where the
   * server is.
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
      const body = answered(await http.get(route), route) as WorkflowListResponse;
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
      const body = answered(await http.get(route), route) as MemberListResponse;
      return body.members;
    },

    /**
     * `GET .../workflows/:workflowId/state-occupancy` — admin-only at the door,
     * so a member's 404 here is ordinary and reaches the mapping dialog as
     * "unavailable", which is what `gateway.ts` asks for.
     */
    getStateOccupancy: async (workspaceId, workflowId) => {
      const route = `${ws(workspaceId)}/workflows/${encodeURIComponent(workflowId)}/state-occupancy`;
      const body = answered(await http.get(route), route) as StateOccupancyResponse;
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
      const body = answered(await http.get(route), route) as TypePopulationResponse;
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
