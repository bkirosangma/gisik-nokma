import type { ListRow } from '@gisik-nokma/app-core';
import type { TicketTypeDef, WorkflowDef } from '@gisik-nokma/domain';

/**
 * Ruling 42 (backlog-and-closed-core dispatch, Task 10, 2026-09-17) —
 * resolving a Backlog row's Start TARGET.
 *
 * `ListRow` carries no `workflowId` of its own (`view-types.ts:188-220`:
 * `typeId`/`stateId` only — no field names a workflow), because a ticket's
 * workflow is a fact about its TYPE, not about the ticket. So this joins
 * `row.typeId` through the workspace's own `TicketTypeDef[]` to find the
 * bound `workflowId`, then asks the resolved `WorkflowDef` for its
 * `initialStateId` — the universal Start edge's own target
 * (`packages/domain/src/workflow.ts`'s `universalTransitions`: `backlog →
 * def.initialStateId`, no rules, ever; a workflow cannot gate its own Start).
 *
 * `null` for EITHER gap — a type the caller's `types` array does not carry,
 * or a definition the caller's `defs` map does not (yet) hold — rather than
 * throwing: the page resolves `defs` asynchronously, one `getWorkflowDef` per
 * DISTINCT workflow among the rows currently on screen (never one per row),
 * so a row can legitimately render one tick before its own definition
 * arrives. `BacklogStartButton` reads a `null` target as "disable Start",
 * never as licence to submit an event with no `to`.
 *
 * The ruling's own one-line spelling — `defs.get(types.find(t => t.id ===
 * row.typeId)?.workflowId)?.initialStateId ?? null` — does not typecheck
 * under this repo's strict mode: `Map<string, WorkflowDef>.get` takes a
 * `string`, not `string | undefined`, and `Array.prototype.find` answers the
 * latter. Split into two steps below with an explicit `undefined` guard —
 * same three outcomes (known type+def → the initial state; unknown type →
 * null; known type, missing def → null), unit-tested in
 * `backlog-start.test.ts` as part of case 13.595.
 */
export function startTargetFor(
  row: ListRow,
  types: TicketTypeDef[],
  defs: Map<string, WorkflowDef>,
): string | null {
  const workflowId = types.find((type) => type.id === row.typeId)?.workflowId;
  if (workflowId === undefined) return null;
  return defs.get(workflowId)?.initialStateId ?? null;
}
