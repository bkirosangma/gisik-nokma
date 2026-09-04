import type { PublishedWorkflowDef, TicketStateDeps, TicketTypeDef } from '@gisik-nokma/domain';
import type { SyncStorage } from '../storage/storage.js';

/**
 * TWO lookups over ONE table, and they must not be unified.
 *
 * `buildLocalDeps` answers the REDUCER's question — "what does workflow W mean
 * now" — so it takes the highest stored version and nothing else. That is the
 * local mirror of the server's `buildLedgerDeps`.
 *
 * `workflowVersionsOf` answers the FOLD's question — "what did workflow W mean
 * at version N" — for every version strictly between a ticket's version and the
 * one being published, because that is `foldStateIdForward`'s contract and
 * `foldTicketToWorkflowVersion` is built on it. A replica that kept only the
 * latest definition could not answer it at all, so **retaining every version is
 * a hard requirement of this package's schema**, not an optimisation: the
 * `workflows` table is keyed `(workflow_id, version)` for exactly this.
 *
 * Collapsing the two into one "get the workflow" helper is the quiet way to
 * lose the version chain, and losing it makes a two-hop fold silently pick the
 * wrong destination state on every client at once.
 *
 * ## THE `ticket_types` LOOKUP IS CONSTRAINED AFTER ALL — a recorded finding,
 * ## corrected by measurement rather than inherited
 *
 * Plan 10 Task 9's whole-branch review recorded this lookup as an unconstrained
 * path, with the evidence "rewriting it to replay the event log leaves the
 * whole suite green" and Plan 10 Task 11 named as owner. **Re-measured at Task
 * 11 on a green tree, that is FALSE.** Replacing the two lines below with a
 * replay —
 *
 *     SELECT payload FROM events
 *      WHERE entity_kind = 'ticket-type' AND type = 'ticket-type.defined'
 *      ORDER BY workspace_seq
 *
 * — is red on **12.155 alone**, `Tests 1 failed | 60 passed (61)` over
 * `packages/sync-client`. 12.155's workspace-wide half is what catches it:
 * `revokeScope` empties `ticket_types` BY DESIGN while the `ticket-type.defined`
 * event still stands in `events`, so a replay-sourced lookup answers for a type
 * this device is no longer entitled to and the arrival that should throw folds
 * cleanly instead.
 *
 * The finding was true when it was written and stopped being true in the same
 * batch that wrote it — 12.155 landed alongside it. Recorded here rather than
 * deleted, because the useful part is not "there is no gap": it is that the
 * TABLE is the entitlement boundary and the event log is not, which is exactly
 * why the two must not be swapped for each other.
 */
export async function buildLocalDeps(storage: SyncStorage): Promise<TicketStateDeps> {
  const wfRows = await storage.all(
    `SELECT workflow_id, def FROM workflows w
      WHERE version = (SELECT MAX(version) FROM workflows WHERE workflow_id = w.workflow_id)`,
  );
  const workflows = new Map<string, PublishedWorkflowDef>(
    wfRows.map((r) => [r.workflow_id as string, JSON.parse(r.def as string) as PublishedWorkflowDef]),
  );
  const ttRows = await storage.all('SELECT type_id, def FROM ticket_types');
  const ticketTypes = new Map<string, TicketTypeDef>(
    ttRows.map((r) => [r.type_id as string, JSON.parse(r.def as string) as TicketTypeDef]),
  );
  return {
    getTicketType: (id) => ticketTypes.get(id),
    getWorkflow: (id) => workflows.get(id),
  };
}

/**
 * Every locally-held version of ONE workflow, in the shape `foldStateIdForward`
 * wants.
 *
 * `null` — not `undefined` — for a version this store cannot supply. That is
 * the domain's stated contract and it is what lets a HOLE in the version chain
 * report as a hole (`foldTicketToWorkflowVersion` pre-checks with it) instead
 * of being flattened into "this state was dropped with no mapping". The two are
 * different faults with different owners: a hole is a gap in what this replica
 * was sent, an unmapped drop is a publish the server should have refused.
 *
 * Note the deliberate sentinel mismatch with `TicketStateDeps.getWorkflow`
 * above, which answers `undefined`. Both are the domain's own signatures; do
 * not "harmonise" them.
 */
export async function workflowVersionsOf(
  storage: SyncStorage,
  workflowId: string,
): Promise<(version: number) => PublishedWorkflowDef | null> {
  const rows = await storage.all('SELECT version, def FROM workflows WHERE workflow_id = ?', [workflowId]);
  const byVersion = new Map<number, PublishedWorkflowDef>(
    rows.map((r) => [Number(r.version), JSON.parse(r.def as string) as PublishedWorkflowDef]),
  );
  return (version) => byVersion.get(version) ?? null;
}
