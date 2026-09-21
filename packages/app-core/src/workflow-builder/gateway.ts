import type {
  IngestResult,
  PublishedWorkflowDef,
  SubmittedEvent,
  TicketTypeDef,
  WorkspaceMember,
} from '@gisik-nokma/domain';

/**
 * Client-side mirror of Plan 1's IngestResult, served through DataSource.ingest
 * (amendment 10).
 *
 * Plan 8's own text reads: "if Plan 6's data-source module already exports
 * IngestResult, import and re-export it here instead of declaring it". That
 * condition is FALSE as measured against this repo: data-source.ts imports
 * IngestResult (type-only) but does not re-export it, and app-core's index.ts
 * doesn't either. But the plan's own default branch — declare it locally — is
 * ALSO wrong: IngestResult is already declared at
 * packages/domain/src/ingest-result.ts:14, and data-source.ts already consumes
 * it from '@gisik-nokma/domain'. Declaring a second, structurally-identical
 * IngestResult here would build exactly the twin the plan's instruction exists
 * to prevent. So this re-exports the domain type rather than following either
 * of the plan's two literal branches.
 */
export type { IngestResult, WorkspaceMember } from '@gisik-nokma/domain';

/**
 * Everything the builder needs from the outside world. Views never speak HTTP
 * (amendment 10): apps/web adapts DataSource to this in one file (Task 13);
 * tests use the in-memory fake (fake-gateway.ts).
 *
 * All seven read/write operations named below are served today by
 * apps/server/src/routes/builder-reads.ts (registerBuilderReadRoutes — CALLED,
 * not merely defined, from apps/server/src/app.ts, verified by grep against
 * this repo rather than trusted from a line number) plus registerEventRoutes
 * for submit — this is not a mocked contract standing in for a missing
 * server. The one path this
 * plan's own text gets wrong: assumption 3 names
 * `.../ticket-types/:typeId/migrate-workflow` for the bulk migration; the
 * route that actually exists is `.../ticket-types/:typeId/migrate`. That only
 * matters to Task 13's real HTTP adapter — this interface names no path.
 */
export type MigrationRequest = {
  workspaceId: string;
  typeId: string;
  fromWorkflowId: string;
  toWorkflowId: string;
  /** Every state of the outgoing workflow → a state of the incoming one. */
  stateMap: Record<string, string>;
};

export type MigrationOutcome =
  | { status: 'migrated'; count: number }
  | { status: 'refused'; rule: string; reason: string };

/**
 * The server declined to answer a read — the `/v1` doors answer a bare 404 for
 * "no such thing OR not yours" and deliberately do not say which.
 *
 * **Declared HERE, in the contract, rather than in the web shell that first
 * needed it (E2-39, 2026-09-21).** It lived in
 * `apps/web/src/authoring/data-source-gateway.ts`, and the cost of that address
 * was recorded twice in that shell's own prose: `WorkflowBuilderScreen` — which
 * is in THIS package — could not narrow its roster catch on a type it could not
 * import, so its `listMembers(...).catch(() => [])` swallowed a 500, a dropped
 * connection and an unparseable body alike and handed `BuilderEnvironment.members`
 * the EMPTY roster. The adapter's own text calls that "the very lie" it declined
 * to invent; the caller told it instead, into rule summaries and
 * `require-different-user` editors. `app-core` depends on `domain`,
 * `rule-engine`, `sync-client`, `ui` and `@xyflow/react` — nothing under `apps/`
 * — so the narrowing was a CONTRACT move, which is what this is.
 *
 * The message is the adapter's own, unchanged, so nothing a reader sees on screen
 * moves with it; `apps/web`'s gateway re-exports this class, so `instanceof`
 * holds on both sides of the boundary and there is exactly ONE class, not a
 * subclass pair that could drift.
 */
export class AuthoringReadRefused extends Error {
  readonly route: string;
  constructor(route: string) {
    super(`The server did not answer ${route}. It exists and is not yours, or it does not exist.`);
    this.name = 'AuthoringReadRefused';
    this.route = route;
  }
}

export interface WorkflowAuthoringGateway {
  listWorkflows(workspaceId: string): Promise<PublishedWorkflowDef[]>;
  /**
   * One published definition — **optionally a specific version of it** (Task 3,
   * lifted 2026-09-19).
   *
   * The `version` parameter is not new to the product; it is new to THIS
   * interface, and its absence was the whole of the gap. `DataSourceQuery`
   * has declared `getWorkflowDef(workspaceId, workflowId, version?)` since Plan
   * 6 (`packages/app-core/src/data-source.ts:146`), the online adapter already
   * sends `?version=` (`online-data-source.ts`), and the server route serves
   * any single version (`builder-reads.ts`, numeric branch). **The web adapter
   * was the one seam that dropped it**
   * (`apps/web/src/authoring/data-source-gateway.ts` called the query with two
   * arguments — `:224` before this change, `:233` after it, because the
   * docblock explaining the fix is what moved the line). Exposing it is what
   * makes the version chain readable from a
   * screen, which is what Task 3's conditional ruling turned on.
   *
   * Omitted = the latest published version, which is what every pre-existing
   * caller wants and still gets — so this is an addition, not a change.
   */
  getWorkflow(
    workspaceId: string,
    workflowId: string,
    version?: number,
  ): Promise<PublishedWorkflowDef | null>;
  listTicketTypes(workspaceId: string): Promise<TicketTypeDef[]>;
  /**
   * The workspace roster. An executor ruling (2026-09-02, coordination doc
   * ~5442-5465) holds that a guest may NOT call
   * GET /v1/workspaces/:id/members, and the shipped default is no-guests.
   * Consumers of this method must be built against a roster that may come
   * back refused or empty for the current session — never assumed available
   * to every caller.
   */
  listMembers(workspaceId: string): Promise<WorkspaceMember[]>;
  /**
   * Tickets currently sitting in each state of the workflow — the mapping
   * dialog's in-flight counts. A courtesy prefill only: no publish refusal
   * anywhere depends on this number (coordination doc, the stranding-rule
   * reasoning). May reject; the caller says "unavailable" rather than
   * substituting a zero.
   */
  getStateOccupancy(workspaceId: string, workflowId: string): Promise<Record<string, number>>;
  /**
   * Tickets of this type PINNED to this workflow. A ticket pins the workflow it
   * was created under (owner decision 2026-08-26), so re-pointing a type leaves
   * a population behind — this is the count the editor names rather than
   * letting the admin discover it on the board. Same shape and same honest
   * degradation as getStateOccupancy: it may reject, and the caller says
   * "unavailable" rather than guessing a number.
   */
  getTypeWorkflowPopulation(workspaceId: string, typeId: string, workflowId: string): Promise<number>;
  /**
   * How many tickets of EACH type this workspace holds — every type it DEFINES,
   * zeroes included.
   *
   * **Not `getTypeWorkflowPopulation` with a wider label**, and that is the
   * whole reason it is a second method rather than an optional argument on the
   * first. That one answers *"pinned to one workflow"*, and a ticket pins the
   * workflow it was created under, so its number stops being the type's count
   * the moment a re-point leaves tickets behind — the divergence
   * `ticket-type-list-screen.tsx`'s own docblock describes. This is the type's
   * own count; the list's `"N tickets"` segment asks exactly this question.
   *
   * One call for every type rather than one per row: the list renders them all
   * at once.
   *
   * Same honest degradation as `getStateOccupancy` and the pinned read above:
   * it may reject, and the caller says "unavailable" rather than substituting a
   * zero.
   */
  getTicketCountsByType(workspaceId: string): Promise<Record<string, number>>;
  /**
   * The bulk affordance: one cross-workflow state map in, one
   * ticket.workflow_rebound per ticket out (emitted server-side — Plan 3 owns
   * the event and its refusals). Never a stateMapping: that is keyed inside
   * one workflow's version chain, and across workflows there is no chain.
   */
  migrateTypeToWorkflow(input: MigrationRequest): Promise<MigrationOutcome>;
  submit(events: SubmittedEvent[]): Promise<IngestResult[]>;
}
