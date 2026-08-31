import { describe, expect, it } from 'vitest';
import { newUlid } from '../src/ids.js';
import { SIMPLE_KANBAN_TEMPLATE, simpleKanbanWorkflowDef } from '../src/simple-kanban.js';
import { validateWorkflowDef } from '../src/validate-workflow.js';

describe('the canonical simple-Kanban definition', () => {
  it('clones into a def that validates clean at version 1', () => {
    const id = newUlid();
    const def = simpleKanbanWorkflowDef(id);

    // Asserted through `validateWorkflowDef` — the authority the engine itself
    // runs on `workflow.defined` — rather than by re-listing the states here. A
    // second statement of what a valid workflow is could pass while the engine
    // refused the very definition every workspace is founded on, which is the
    // bootstrap failure this test exists to make impossible.
    // Mutation that reddens it: drop the `{from:'doing', to:'done'}` transition
    // and `terminal-no-inbound` fires.
    expect(validateWorkflowDef(def)).toEqual([]);
    expect(def.version).toBe(1);
    expect(def.id).toBe(id);
    expect(def.initialStateId).toBe('todo');
    expect(def.states.some((state) => state.category === 'terminal')).toBe(true);
  });

  it('is deep-cloned — editing a clone never reaches the template', () => {
    const first = simpleKanbanWorkflowDef(newUlid());
    first.states[0]!.name = 'Mutated';

    // Mutation that reddens it: replace `structuredClone(...)` with `{...SIMPLE_KANBAN_TEMPLATE}`.
    // The spread copies the arrays by reference, so the line above would edit
    // the template every OTHER workspace is founded on.
    expect(SIMPLE_KANBAN_TEMPLATE.states[0]!.name).toBe('To do');
    expect(simpleKanbanWorkflowDef(newUlid()).states[0]!.name).toBe('To do');
  });
});
