import { foldStateIdForward, type FoldedState, type TicketState, type WorkflowDef } from '@gisik-nokma/domain';
import type { EngineContext, TenantScope } from './engine.js';

/**
 * The engine's name for domain's FoldedState. It is an alias, not a copy:
 * every consumer (Task 11 here, Plan 3's projection, Plan 10's replica) reads
 * the same `ok` / `stateId` / `unmappedStateId` shape from one declaration.
 */
export type ResolvedState = FoldedState;

/**
 * Walk ONE state id forward from the version whose vocabulary it is written in
 * to the latest version, following each intermediate version's stateMapping.
 *
 * The WALK itself lives in `@gisik-nokma/domain` (`foldStateIdForward`) —
 * three consumers need it and domain is the only package all three depend on.
 * What lives here is the part that cannot: fetching the intermediate
 * definitions through the async, I/O-backed EngineContext. Everything past the
 * fetch is the shared pure function, so the engine cannot drift from the
 * server projection or the offline replica.
 *
 * Two callers in this package need it and they must not each grow their own:
 * resolveCurrentStateId below (a ticket's current state) and
 * require-different-user (each transition-log entry's recorded state, Task
 * 11). A second walk is a second set of rounding errors.
 *
 * Intermediates are fetched before the walk rather than lazily inside it. The
 * outcome is identical — the fold stops at the first version it cannot resolve,
 * with `current` computed from exactly the versions before it — and the only
 * difference is a few extra reads on a store where publishing's mandatory
 * stateMapping has already been violated. Correctness first, and that path is
 * a corrupted or planted store, not a live one.
 *
 * `scope` is the workspace of the EVENT under evaluation, threaded through
 * rather than taken off the ticket (controller ruling P14, Task 12). The two
 * agree on every live path — ingest's entity to workspace guard refuses an
 * event filed against a ticket in another workspace before the engine runs —
 * and reading it off the ticket instead would be the "true statement about a
 * neighbouring subject" this series keeps paying for: the ticket's tenancy is a
 * fact the checks VERIFY, never the fact that authorises a definition read.
 */
export async function resolveStateIdForward(
  scope: TenantScope,
  workflowId: string,
  stateId: string,
  fromVersion: number,
  latest: WorkflowDef,
  ctx: EngineContext,
): Promise<ResolvedState> {
  const intermediates = new Map<number, WorkflowDef>();
  for (let version = fromVersion + 1; version < latest.version; version += 1) {
    const def = await ctx.getWorkflowDef(scope, workflowId, version);
    if (def !== null) intermediates.set(version, def);
  }
  return foldStateIdForward(stateId, fromVersion, latest, (version) => intermediates.get(version) ?? null);
}

/**
 * Resolve a ticket's current state id against the latest workflow version,
 * walking each intermediate version's stateMapping forward. Exported because
 * the transition path and four-eyes both need it; Plan 3's ticket projection
 * and Plan 10's replica reach the same walk through domain's
 * foldStateIdForward directly, because they hold their definitions already and
 * have no EngineContext to fetch through. Publishing refuses unmapped drops,
 * so ok:false only occurs on planted or corrupted stores — and then the honest
 * answer is a refusal, not a guess.
 */
export async function resolveCurrentStateId(
  scope: TenantScope,
  ticket: TicketState,
  latest: WorkflowDef,
  ctx: EngineContext,
): Promise<ResolvedState> {
  return resolveStateIdForward(scope, ticket.workflowId, ticket.stateId, ticket.workflowVersion, latest, ctx);
}
