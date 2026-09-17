import type { FilterSpec } from '@gisik-nokma/domain';
import { FTS_CONFIG } from './fts.js';
import type { SqlParams } from './sql-params.js';

/**
 * The latest version of each workflow, exploded to its blocked-flagged
 * states (coordination amendment 9). Prepend as `WITH ${BLOCKED_STATES_CTE}`
 * when a compiled filter reports needsBlockedCte.
 *
 * `DISTINCT ON (workspace_id, workflow_id)` and not `(workflow_id)` alone,
 * and the compiled predicate correlates on `workspace_id = t.workspace_id`:
 * `proj_workflows`' primary key is `(workflow_id, version)`, which does NOT
 * make a workflow id the property of one workspace. Two workspaces can hold
 * the same `workflow_id` at different versions — `('wf', 1)` in one and
 * `('wf', 2)` in the other satisfies that key — and a CTE that took the
 * globally-latest version per id would then answer one tenant's blocked
 * filter out of another tenant's definition. Nothing an actor sends chooses
 * the workspace here: it comes from the ticket row being filtered, so the
 * correlation cannot be aimed.
 */
export const BLOCKED_STATES_CTE = `blocked_states AS (
  SELECT latest.workspace_id, latest.workflow_id, s ->> 'id' AS state_id
  FROM (
    SELECT DISTINCT ON (workspace_id, workflow_id) workspace_id, workflow_id, definition
    FROM proj_workflows
    ORDER BY workspace_id, workflow_id, version DESC
  ) latest,
  jsonb_array_elements(latest.definition -> 'states') s
  WHERE (s ->> 'blocked')::boolean IS TRUE
)`;

export type CompiledFilter = { clauses: string[]; needsBlockedCte: boolean };

/**
 * "This ticket stands in a blocked-flagged state", over `proj_tickets` aliased
 * `t`, against the `blocked_states` CTE above.
 *
 * EXPORTED since Task 16, for the reason `read/visible-where.ts` was extracted:
 * `read/workspace-counts.ts` counts blocked tickets for the workspace card, and
 * a second copy of this expression would put the card and the attention strip it
 * links to on two definitions of one word. The CTE and the predicate that reads
 * it travel together or not at all — importing one and restating the other is
 * the half-measure that looks like sharing.
 *
 * The `workspace_id = t.workspace_id` correlation is load-bearing and belongs to
 * the expression, not to its callers: `proj_workflows` is keyed
 * `(workflow_id, version)` globally, so without it one tenant's blocked filter
 * would answer out of another tenant's definition.
 */
export const BLOCKED_MEMBERSHIP =
  '(t.workflow_id, t.state_id) IN (SELECT workflow_id, state_id FROM blocked_states WHERE workspace_id = t.workspace_id)';

/**
 * Escapes the LIKE metacharacters and wraps in `%…%`. Pair it with
 * `ESCAPE '\'` at the call site — the default escape character is already
 * a backslash, but naming it means a future `standard_conforming_strings`
 * or dialect surprise cannot quietly turn a user's `%` back into a wildcard.
 *
 * This escapes for the LIKE PATTERN language, which is a different language
 * from SQL: the result still travels as a bound parameter. Nothing here is
 * an SQL-quoting routine, and nothing in this file should ever become one.
 */
export function likePattern(value: string): string {
  return `%${value.replace(/([\\%_])/g, '\\$1')}%`;
}

/**
 * Compiles a FilterSpec into WHERE clauses over `proj_tickets` aliased `t`.
 *
 * Every actor-supplied value is bound with `params.add()`; no branch of this
 * function concatenates one into SQL text, and the tests execute hostile
 * inputs against a live database to prove it rather than reading the source.
 *
 * IDENTIFIERS: no column name, table name, or operator here varies with
 * actor input. `fieldId` is the one thing an actor names that addresses
 * something by name, and it is NOT an identifier — it is a jsonb object key,
 * bound as a text VALUE (`t.fields -> $n::text`). The `::text` cast is
 * deliberate: `->` is overloaded (jsonb->text, jsonb->integer), and leaving
 * the overload to be resolved from an untyped parameter makes the query's
 * meaning depend on the client driver rather than on this file.
 *
 * TENANCY: every clause here is a narrowing conjunct over `t`; none of them
 * can widen a result set, so none of them can BE the tenancy predicate. The
 * base scope (`t.workspace_id = $n`, or a project scope plus Task 5's
 * `visibleTicketsWhere`) is the caller's, added beside these clauses in
 * Tasks 8–12 — and yes, a caller can forget it, exactly as a caller can
 * forget the visibility predicate. What this file guarantees is narrower and
 * checkable: the two clauses that reach OTHER tables (`proj_search`,
 * `blocked_states`) carry their own `workspace_id = t.workspace_id`
 * correlation, so a filter term never answers out of a tenant the caller's
 * scope had already excluded. `compile-filter.test.ts` enumerates every term
 * and fails if a new one reaches another table without that correlation.
 */
export function compileFilterSpec(spec: FilterSpec, params: SqlParams): CompiledFilter {
  const clauses: string[] = [];
  let needsBlockedCte = false;

  if (spec.assigneeId !== undefined) clauses.push(`t.assignee_id = ${params.add(spec.assigneeId)}`);
  if (spec.collaboratorId !== undefined) {
    clauses.push(`t.collaborator_ids @> to_jsonb(${params.add(spec.collaboratorId)}::text)`);
  }
  if (spec.typeId !== undefined) clauses.push(`t.type_id = ${params.add(spec.typeId)}`);
  if (spec.stateId !== undefined) clauses.push(`t.state_id = ${params.add(spec.stateId)}`);
  if (spec.stateCategory !== undefined) clauses.push(`t.state_category = ${params.add(spec.stateCategory)}`);
  if (spec.blocked !== undefined) {
    needsBlockedCte = true;
    clauses.push(spec.blocked ? BLOCKED_MEMBERSHIP : `NOT (${BLOCKED_MEMBERSHIP})`);
  }
  // `closed` (backlog/closed spec §3.2, 2026-09-17): a plain column comparison
  // over `t` itself, so unlike `blocked`/`text` it reaches no other table and
  // needs no correlation — `compileFilterSpec`'s own docblock's "every clause
  // that reaches another table" claim is about THOSE two, not this one.
  if (spec.closed !== undefined) clauses.push(spec.closed ? 't.closed_at IS NOT NULL' : 't.closed_at IS NULL');
  if (spec.text !== undefined) {
    // websearch_to_tsquery, never to_tsquery: it parses ANY string as a
    // phrase instead of raising a syntax error, so a hostile query term
    // cannot even be turned into a 500.
    //
    // The configuration comes from `FTS_CONFIG` rather than a literal, so this
    // clause and the search route (Task 10) cannot drift apart from each other:
    // a matching rule that differs between two query sites is a search that
    // quietly finds nothing. The migration's GENERATED column still spells its
    // own copy — it is SQL that runs before any TypeScript exists — and is
    // linked to this one by an executed test rather than by the compiler
    // (`read/fts.ts` names both).
    clauses.push(
      `t.ticket_id IN (SELECT ticket_id FROM proj_search WHERE workspace_id = t.workspace_id AND tsv @@ websearch_to_tsquery('${FTS_CONFIG}', ${params.add(spec.text)}))`,
    );
  }
  if (spec.due?.before !== undefined) {
    clauses.push(`(t.fields -> 'dueDate' -> 'value' ->> 'date') <= ${params.add(spec.due.before)}`);
  }
  if (spec.due?.after !== undefined) {
    clauses.push(`(t.fields -> 'dueDate' -> 'value' ->> 'date') >= ${params.add(spec.due.after)}`);
  }
  for (const field of spec.fields ?? []) {
    if (field.op === 'eq') {
      clauses.push(`t.fields -> ${params.add(field.fieldId)}::text ->> 'value' = ${params.add(field.value)}`);
    } else {
      clauses.push(
        `t.fields -> ${params.add(field.fieldId)}::text ->> 'value' ILIKE ${params.add(likePattern(field.value))} ESCAPE '\\'`,
      );
    }
  }
  return { clauses, needsBlockedCte };
}
