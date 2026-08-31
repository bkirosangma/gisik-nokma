import { workflowDefSchema, type WorkflowDef } from './workflow.js';

/**
 * The one simple-Kanban definition in the product. Every workspace is founded
 * on a clone of it (Plan 4 Task 5's bootstrap), and it is the first card in
 * Plan 8's template gallery — the SAME object, not a copy that looks like it.
 * Two copies of one workflow is the drift this series keeps finding, and a
 * bootstrap default that quietly diverged from the gallery card an admin later
 * picks would be invisible until someone compared them by hand.
 *
 * Carries no `id` and no `version`: an id is minted per workspace, and every
 * clone starts at version 1 (spec §4 — templates are cloned, never referenced).
 *
 * It lives at `src/simple-kanban.ts`, flat, and NOT at the plan text's
 * `src/workflows/simple-kanban.ts`: this package has no `workflows/`
 * directory, and `WorkflowDef` is exported from `./workflow.js`. The import
 * origin is taken from the shipped code, not from the plan text (coordination
 * doc §10).
 */
export const SIMPLE_KANBAN_TEMPLATE: Omit<WorkflowDef, 'id' | 'version'> = {
  name: 'Simple kanban',
  initialStateId: 'todo',
  states: [
    { id: 'todo', name: 'To do', category: 'open' },
    { id: 'doing', name: 'Doing', category: 'active' },
    { id: 'done', name: 'Done', category: 'terminal' },
  ],
  transitions: [
    { from: 'todo', to: 'doing', rules: [] },
    { from: 'doing', to: 'todo', rules: [] },
    { from: 'doing', to: 'done', rules: [] },
    { from: 'done', to: 'doing', rules: [] },
  ],
};

/**
 * A publishable clone at version 1.
 *
 * The clone is DEEP, and a spread alone is not. `{ ...SIMPLE_KANBAN_TEMPLATE }`
 * copies the two ARRAYS by reference, so an edited clone's `states[0].name`
 * would reach back into the template every other workspace is founded on — a
 * cross-workspace mutation with nothing at either call site suggesting it. The
 * deep-clone test is what keeps this line from being "simplified" back into a
 * spread.
 *
 * It goes through `workflowDefSchema.parse` rather than `structuredClone` for
 * two reasons, in this order:
 *
 * 1. **It also validates.** A template edited into a shape the door would
 *    refuse throws HERE, at the first workspace founded, rather than producing
 *    a `workflow.defined` that the engine refuses and a workspace that cannot
 *    accept a ticket. The bootstrap's whole point is that a founded workspace
 *    works.
 * 2. **`structuredClone` is not available.** This package compiles against
 *    `lib: ["ES2023"]` and depends on nothing but zod and ulidx —
 *    `structuredClone` is a host global, not an ES one, so reaching for it
 *    would mean widening the lib of the one package every lane imports.
 *
 * A zod object/array parse constructs new objects and arrays at every level, so
 * the result shares no reference with the template. That is a property of the
 * parse, not an assumption about the data: the def is stored as `jsonb` on the
 * event, so it is JSON by construction and the schema is total over it.
 */
export function simpleKanbanWorkflowDef(workflowId: string): WorkflowDef {
  return workflowDefSchema.parse({ ...SIMPLE_KANBAN_TEMPLATE, id: workflowId, version: 1 });
}
