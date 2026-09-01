import type { Pool, PoolClient } from 'pg';
import { workflowDefinedPayloadSchema, type PublishedWorkflowDef } from '@gisik-nokma/domain';
import type { Projection } from './registry.js';

/**
 * Projects workflow.defined events into proj_workflows — every published
 * version, queryable individually, because the engine's version walk needs the
 * intermediates and their stateMappings, not just the newest definition.
 * Idempotent on (workflow_id, version) so ledger replays and the
 * rebuild-and-diff verifier are deterministic.
 *
 * Each row records published_workspace_seq: the stream position of the event
 * that published it. It comes off the LedgerEvent apply receives, so it is the
 * stored position of that event and not a fact about when this projection ran
 * — replay reproduces it exactly, which is what keeps apply deterministic.
 */
export const workflowsProjection: Projection = {
  name: 'proj_workflows',
  tables: ['proj_workflows'],

  async apply(event, tx) {
    if (event.type !== 'workflow.defined') {
      return;
    }
    const payload = workflowDefinedPayloadSchema.parse(event.payload);
    await tx.query(
      `INSERT INTO proj_workflows
         (workspace_id, workflow_id, version, name, definition, defined_by, defined_at, published_workspace_seq)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (workflow_id, version) DO NOTHING`,
      [
        event.workspaceId,
        payload.id,
        payload.version,
        payload.name,
        JSON.stringify(payload),
        event.actorId,
        event.serverTime,
        event.workspaceSeq,
      ],
    );
  },

  async reset(tx) {
    await tx.query('TRUNCATE proj_workflows');
  },
};

/**
 * How to name the version you want.
 *
 *   omitted                  the newest published version
 *   3                        exactly version 3
 *   { asOfWorkspaceSeq: 3 }  whatever was in force at stream position 3
 *
 * The last is not a nicety. A projection replaying the ledger must resolve the
 * definition as of the event it is applying, never as of now: the verifier
 * rebuilds projection-outer, so proj_workflows is already at the newest
 * version before a ticket projection replays its first event. Asking "latest"
 * there gives a re-derivation that disagrees with the live row after any
 * republish, and throws outright once a version has dropped a state.
 *
 * A union rather than a fourth parameter, because "version 3" and "as of
 * position 3" are different questions and a call site must not be able to
 * blur them.
 *
 * PRECONDITION on asOfWorkspaceSeq: the position must come from the same
 * workspace stream as the workflow. Cursors restart at 1 per workspace, so
 * positions from different streams are not comparable, and passing one
 * silently returns a wrong version rather than nothing.
 */
export type WorkflowDefSelector = number | { asOfWorkspaceSeq: number };

/**
 * WORKSPACE-SCOPED, and the predicate is controller ruling P14's fix rather
 * than belt-and-braces (Plan 3 Chain B Task 12).
 *
 * `proj_workflows`' primary key is `(workflow_id, version)` — GLOBAL, with
 * `workspace_id` a plain column — and until this parameter existed all three
 * selector branches read `WHERE workflow_id = $1` and nothing more. The engine
 * context passed straight through, so `ctx.getWorkflowDef(p.toWorkflowId)` in
 * `packages/rule-engine/src/checks/workflow-rebind.ts` resolved an id the ACTOR
 * supplied against every tenant's workflows at once: the target-state check then
 * ran against another workspace's state graph and the rebind was ACCEPTED. The
 * predicate belongs here, on the reader, so that no caller can be the one that
 * forgets it.
 *
 * `workspaceId` is the SECOND parameter, ahead of `workflowId`, matching
 * `getTicketTypeFromDb`, `getTicketStateFromDb` and `getChildrenStatesFromDb` —
 * `(db, workspaceId, id)` is this package's reader convention, and a reader that
 * spelled its tenancy differently from its four neighbours would be the thing a
 * caller gets wrong. Both are ULID-shaped strings and a transposition compiles;
 * it is CAUGHT rather than prevented, by `test/proj-workflows.test.ts`, where a
 * swap answers null for a workflow the fixture just wrote, and by every ingest
 * path's own suite. The engine-facing signature has no such risk: `TenantScope`
 * is an object beside a string.
 *
 * It also makes `asOfWorkspaceSeq`'s stated precondition satisfiable by
 * construction: positions restart at 1 per workspace, so a query ranging over
 * every workspace's workflows could not honour it.
 */
export async function getWorkflowDefFromProjection(
  db: PoolClient | Pool,
  workspaceId: string,
  workflowId: string,
  select?: WorkflowDefSelector,
): Promise<PublishedWorkflowDef | null> {
  const result =
    select === undefined
      ? await db.query<{ definition: unknown }>(
          `SELECT definition FROM proj_workflows
            WHERE workspace_id = $1 AND workflow_id = $2
            ORDER BY version DESC LIMIT 1`,
          [workspaceId, workflowId],
        )
      : typeof select === 'number'
        ? await db.query<{ definition: unknown }>(
            'SELECT definition FROM proj_workflows WHERE workspace_id = $1 AND workflow_id = $2 AND version = $3',
            [workspaceId, workflowId, select],
          )
        : // Ordered by version, not by published_workspace_seq. The two agree —
          // publishing refuses a version that is not exactly one past the
          // latest, so one workflow's versions are appended in ascending order
          // and their publish positions ascend with them — and ordering by the
          // version stays correct if that ever stops being true, because "the
          // greatest version at or before this point" is the question actually
          // being asked.
          await db.query<{ definition: unknown }>(
            `SELECT definition FROM proj_workflows
             WHERE workspace_id = $1 AND workflow_id = $2 AND published_workspace_seq <= $3
             ORDER BY version DESC LIMIT 1`,
            [workspaceId, workflowId, select.asOfWorkspaceSeq],
          );
  const row = result.rows[0];
  if (row === undefined) {
    return null;
  }
  return workflowDefinedPayloadSchema.parse(row.definition);
}

/**
 * A BY-ID lookup over every workflow this workspace had in force at a stream
 * position — the plural of `getWorkflowDefFromProjection(…, { asOfWorkspaceSeq })`,
 * asked once instead of once per id.
 *
 * It exists because `TicketStateDeps.getWorkflow(workflowId)` is a PURE BY-ID
 * LOOKUP and the reducer is the only thing that knows which id an event needs
 * (`packages/domain/src/ticket-state.ts`, controller ruling P1). A loader that
 * pre-selects "the ticket's workflow" resolves null on the one event the
 * migration exists for — `ticket.workflow_rebound` asks for the PAYLOAD's
 * `toWorkflowId`, a workflow the ticket is not on yet — and the reducer then
 * throws a sentence blaming the ledger for a loader's omission. Handing the
 * reducer everything in force removes the question rather than answering it.
 *
 * Parsing is LAZY and memoized: a workspace's whole definition set is fetched,
 * but only the definitions actually asked for pay `workflowDefinedPayloadSchema`.
 * A ticket event asks for at most one.
 *
 * WORKSPACE-SCOPED, and that is not belt-and-braces. `getWorkflowDefFromProjection`
 * states a PRECONDITION on `asOfWorkspaceSeq` — the position must come from the
 * same workspace stream as the workflow, because cursors restart at 1 per
 * workspace and positions from different streams are not comparable. A query
 * that ranges over every workspace's workflows cannot satisfy that precondition
 * by construction, so the predicate is what makes the as-of question well
 * posed here.
 *
 * It was NOT the fix for controller ruling P14 and was never claimed to be: P14
 * is about an actor-supplied workflow id resolving through an UNSCOPED reader on
 * the ENGINE path. Task 12 has now scoped that reader —
 * `getWorkflowDefFromProjection` above takes a `workspaceId` — so the sentence
 * this replaces, which pointed at a pending task, is retired rather than left to
 * read as evidence the hole is still open.
 */
export type WorkflowDefLookup = {
  get(workflowId: string): PublishedWorkflowDef | undefined;
};

export async function getWorkflowDefsInForce(
  db: PoolClient | Pool,
  workspaceId: string,
  asOfWorkspaceSeq: number,
): Promise<WorkflowDefLookup> {
  const { rows } = await db.query<{ workflow_id: string; definition: unknown }>(
    // DISTINCT ON takes the first row of each workflow_id group under the
    // ORDER BY, so `version DESC` makes that "the greatest version published at
    // or before this position" — the same question, and the same answer, as the
    // singular reader's as-of branch.
    `SELECT DISTINCT ON (workflow_id) workflow_id, definition
       FROM proj_workflows
      WHERE workspace_id = $1 AND published_workspace_seq <= $2
      ORDER BY workflow_id, version DESC`,
    [workspaceId, asOfWorkspaceSeq],
  );
  const raw = new Map<string, unknown>(rows.map((row) => [row.workflow_id, row.definition]));
  const parsed = new Map<string, PublishedWorkflowDef>();
  return {
    get(workflowId) {
      const already = parsed.get(workflowId);
      if (already !== undefined) {
        return already;
      }
      if (!raw.has(workflowId)) {
        return undefined;
      }
      // Parsed rather than cast, exactly as the singular reader does: a row
      // written before a schema change should fail loudly here rather than
      // reach the reducer shaped like a WorkflowDef and not being one.
      const def = workflowDefinedPayloadSchema.parse(raw.get(workflowId));
      parsed.set(workflowId, def);
      return def;
    },
  };
}
