import { describe, expect, it } from 'vitest';
import { adviseWorkflowDef, validateWorkflowDef, type WorkflowDef } from '@gisik-nokma/domain';
import {
  createDraftStore,
  draftFromPublished,
  newDraft,
  selectCanPublish,
  selectInboundTargetIds,
  selectIssues,
} from '../../src/workflow-builder/draft-store.js';

/** A small valid def used across tests — carries initialStateId, as every def must. */
function kanbanDef(): WorkflowDef {
  return {
    id: '01J9Z0000000000000000000WF',
    version: 1,
    name: 'Kanban',
    initialStateId: 'todo',
    states: [
      { id: 'todo', name: 'To do', category: 'open' },
      { id: 'doing', name: 'Doing', category: 'active' },
      { id: 'done', name: 'Done', category: 'terminal' },
    ],
    transitions: [
      { from: 'todo', to: 'doing', rules: [] },
      { from: 'doing', to: 'done', rules: [] },
    ],
  };
}

function storeWith(def: WorkflowDef) {
  const draft = draftFromPublished({ ...def });
  return createDraftStore(draft);
}

describe('newDraft', () => {
  it('seeds one open state, marked initial, and validates clean except for the missing terminal', () => {
    const draft = newDraft('My workflow');
    expect(draft.def.name).toBe('My workflow');
    expect(draft.def.version).toBe(1);
    expect(draft.def.states).toHaveLength(1);
    expect(draft.def.states[0]?.category).toBe('open');
    expect(draft.def.initialStateId).toBe(draft.def.states[0]?.id);
    expect(draft.base).toBeNull();
    expect(selectIssues(draft).map((issue) => issue.code)).toEqual(['no-terminal-state']);
  });
});

describe('draftFromPublished', () => {
  it('records the base version and states, and never carries stateMapping forward', () => {
    const draft = draftFromPublished({ ...kanbanDef(), version: 3, stateMapping: { old: 'todo' } });
    expect(draft.base).toEqual({
      version: 3,
      states: [
        { id: 'todo', name: 'To do' },
        { id: 'doing', name: 'Doing' },
        { id: 'done', name: 'Done' },
      ],
    });
    expect('stateMapping' in draft.def).toBe(false);
    expect(draft.positions['todo']).toBeDefined();
  });
});

describe('state actions', () => {
  it('addState mints a unique id, positions the node, selects it, and returns the id', () => {
    const store = storeWith(kanbanDef());
    const id = store.actions.addState({ name: 'Review', category: 'active' });
    const draft = store.getState();
    expect(draft.def.states.map((state) => state.name)).toContain('Review');
    expect(draft.positions[id]).toBeDefined();
    expect(draft.selection).toEqual({ kind: 'state', stateId: id });
  });

  it('the first state added to an empty def becomes the initial state', () => {
    const store = createDraftStore(newDraft('Empty me'));
    const only = store.getState().def.states[0]?.id as string;
    store.actions.removeState(only);
    expect(store.getState().def.states).toHaveLength(0);
    const id = store.actions.addState();
    expect(store.getState().def.initialStateId).toBe(id);
  });

  it('rename, category, blocked, and initial-state edits land in the def', () => {
    const store = storeWith(kanbanDef());
    store.actions.renameState('doing', 'In progress');
    store.actions.setStateCategory('doing', 'open');
    store.actions.setStateBlocked('doing', true);
    store.actions.setInitialState('doing');
    const def = store.getState().def;
    const doing = def.states.find((state) => state.id === 'doing');
    expect(doing).toEqual({ id: 'doing', name: 'In progress', category: 'open', blocked: true });
    expect(def.initialStateId).toBe('doing');
  });

  it('unchecking blocked removes the flag rather than storing blocked: false', () => {
    const store = storeWith(kanbanDef());
    store.actions.setStateBlocked('doing', true);
    store.actions.setStateBlocked('doing', false);
    expect('blocked' in (store.getState().def.states.find((s) => s.id === 'doing') ?? {})).toBe(false);
  });

  it('unchecking "Tickets can start here" removes the creatable flag rather than storing creatable: true', () => {
    const store = storeWith(kanbanDef());
    store.actions.setStateCreatable('doing', false);
    store.actions.setStateCreatable('doing', true);
    expect('creatable' in (store.getState().def.states.find((s) => s.id === 'doing') ?? {})).toBe(false);
  });

  /**
   * 10.140 — starting-status design (2026-09-23): pointing the workflow's start
   * state at a state carrying creatable: false flips validateWorkflowDef red
   * (start-state-not-creatable, already shipped by the domain lane at
   * packages/domain/src/validate-workflow.ts) — exercised here through the
   * builder's own actions, not by hand-building a def.
   */
  it('setting the start state to a non-creatable state flips the validation red', () => {
    const store = storeWith(kanbanDef());
    store.actions.setStateCreatable('doing', false);
    // Still clean: 'doing' carries the flag but is not (yet) the start state.
    expect(selectIssues(store.getState()).map((issue) => issue.code)).not.toContain('start-state-not-creatable');
    expect(selectCanPublish(store.getState())).toBe(true);
    store.actions.setInitialState('doing');
    expect(selectIssues(store.getState()).map((issue) => issue.code)).toContain('start-state-not-creatable');
    expect(selectCanPublish(store.getState())).toBe(false);
  });

  /**
   * 10.7 — deleting a state cascades its edges but leaves the start marker and rdu references dangling for validation to name.
   */
  it('removeState cascades transitions touching the state but leaves the initial marker dangling', () => {
    const store = storeWith(kanbanDef());
    store.actions.removeState('todo');
    const def = store.getState().def;
    expect(def.states.map((state) => state.id)).toEqual(['doing', 'done']);
    expect(def.transitions).toEqual([{ from: 'doing', to: 'done', rules: [] }]);
    expect(def.initialStateId).toBe('todo'); // dangles deliberately — surfaced as unknown-initial-state
    expect(selectIssues(store.getState()).map((issue) => issue.code)).toContain('unknown-initial-state');
  });

  it('removeState leaves require-different-user references untouched', () => {
    // The watched state named in `thanActorOf.to` is independent of the
    // transition's own from/to, so put the rule on a transition that never
    // touches the state being deleted — the cascade (which only drops
    // transitions whose from/to IS the removed state) cannot reach it, and
    // the reference dangles exactly as design decision 1 requires.
    const store = storeWith(kanbanDef());
    const reviewId = store.actions.addState({ name: 'Review', category: 'active' });
    store.actions.addRule(0, { kind: 'require-different-user', thanActorOf: { to: reviewId } });
    store.actions.removeState(reviewId);
    // transition 0 ('todo' -> 'doing') never touched 'Review', so it survives the cascade
    expect(store.getState().def.transitions[0]?.rules).toEqual([
      { kind: 'require-different-user', thanActorOf: { to: reviewId } },
    ]);
    expect(selectIssues(store.getState()).map((issue) => issue.code)).toContain('rdu-unknown-state');
  });
});

describe('transition and rule actions', () => {
  it('addTransition appends with empty rules, including from "*"', () => {
    const store = storeWith(kanbanDef());
    store.actions.addTransition('done', 'todo');
    store.actions.addTransition('*', 'done');
    const transitions = store.getState().def.transitions;
    expect(transitions[2]).toEqual({ from: 'done', to: 'todo', rules: [] });
    expect(transitions[3]).toEqual({ from: '*', to: 'done', rules: [] });
  });

  it('addRule/updateRule/removeRule edit exactly the addressed rule', () => {
    const store = storeWith(kanbanDef());
    store.actions.addRule(0, { kind: 'require-comment' });
    store.actions.addRule(0, { kind: 'require-field', field: 'dueDate' });
    store.actions.updateRule(0, 1, { kind: 'require-field', field: 'title' });
    store.actions.removeRule(0, 0);
    expect(store.getState().def.transitions[0]?.rules).toEqual([{ kind: 'require-field', field: 'title' }]);
  });

  it('removeTransition drops the transition and clears a selection pointing at it', () => {
    const store = storeWith(kanbanDef());
    store.actions.select({ kind: 'transition', index: 1 });
    store.actions.removeTransition(1);
    expect(store.getState().def.transitions).toHaveLength(1);
    expect(store.getState().selection).toEqual({ kind: 'none' });
  });

  // Task 6 (owning the inspector) settles the case the removeTransition
  // comment used to leave open: a selection at a HIGHER index than the one
  // removed must decrement to keep naming the SAME transition, not silently
  // start naming its neighbour once the array shifts down under it.
  // Falsifiable: reverting the `> index` branch to "leave it alone" makes
  // this assert `{ kind: 'transition', index: 3 }` instead — the transition
  // that used to be at index 3 (done -> doing) is now at index 2, so an
  // un-decremented selection would point the inspector at whatever slid into
  // index 3, a transition the user never selected.
  it('removeTransition decrements a selection at a higher index so it keeps naming the same transition', () => {
    const store = storeWith(kanbanDef());
    const removedTarget = store.getState().def.transitions[3];
    store.actions.select({ kind: 'transition', index: 3 }); // done -> doing
    store.actions.removeTransition(1); // doing -> todo, ahead of the selection
    expect(store.getState().selection).toEqual({ kind: 'transition', index: 2 });
    expect(store.getState().def.transitions[2]).toEqual(removedTarget);
  });

  it('removeTransition leaves a selection at a lower index untouched', () => {
    const store = storeWith(kanbanDef());
    store.actions.select({ kind: 'transition', index: 0 }); // todo -> doing
    store.actions.removeTransition(2); // doing -> done, behind the selection
    expect(store.getState().selection).toEqual({ kind: 'transition', index: 0 });
  });
});

describe('subscribe and selectors', () => {
  it('notifies subscribers once per action and stops after unsubscribe', () => {
    const store = storeWith(kanbanDef());
    let calls = 0;
    const unsubscribe = store.subscribe(() => {
      calls += 1;
    });
    store.actions.renameState('todo', 'Backlog');
    unsubscribe();
    store.actions.renameState('todo', 'To do');
    expect(calls).toBe(1);
  });

  it('selectCanPublish is validateWorkflowDef emptiness', () => {
    const clean = storeWith(kanbanDef());
    expect(selectCanPublish(clean.getState())).toBe(true);
    clean.actions.setStateCategory('done', 'active');
    expect(selectCanPublish(clean.getState())).toBe(false);
  });

  it('an advisory does not gate publish — selectCanPublish ignores adviseWorkflowDef', () => {
    // a fast track into its own fresh terminal state (never shared with another
    // inbound edge, so `rule-bypassable` cannot also fire) carrying a four-eyes
    // rule that watches the move into Doing: legal, structurally clean, and
    // bypassable on this one path.
    const store = storeWith(kanbanDef());
    const shippedId = store.actions.addState({ name: 'Shipped', category: 'terminal' });
    store.actions.addTransition('todo', shippedId);
    store.actions.addRule(2, { kind: 'require-different-user', thanActorOf: { to: 'doing' } });
    const draft = store.getState();
    expect(validateWorkflowDef(draft.def)).toEqual([]);
    expect(adviseWorkflowDef(draft.def).map((advisory) => advisory.code)).toEqual(['rdu-bypassable']);
    expect(selectCanPublish(draft)).toBe(true);
  });

  it('selectInboundTargetIds lists distinct transition targets in definition order', () => {
    const store = storeWith(kanbanDef());
    store.actions.addTransition('done', 'doing');
    expect(selectInboundTargetIds(store.getState().def)).toEqual(['doing', 'done']);
  });
});

describe('copy-on-write', () => {
  // The plan's Task 1 header sells this store as an immutable WorkflowDraft,
  // useSyncExternalStore-compatible. Nothing else pins that: WorkflowDef comes
  // from z.infer over z.array(...), so its arrays are mutable and tsc accepts
  // `found.name = name` in place of a map-and-spread, while every other test in
  // this file reads getState() only AFTER its action. These two tests are the pin.
  //
  // What they do NOT claim: that a returned draft is frozen. It is structurally
  // shared, so a caller who mutates what getState() handed back does reach the
  // store's own object. The guarantee is one-directional — the store's own
  // actions never write through a snapshot already handed out.
  it('no action writes through a snapshot taken before it', () => {
    const store = storeWith(kanbanDef());

    // All fifteen DraftActions, not a sample of the three internal write helpers.
    // Measured, not assumed: a first draft of this test drove renameState/addRule/
    // moveState/addTransition and a planted in-place `setStateCategory` — which
    // shares mapState with renameState — still shipped green, because nothing
    // called it. The property is claimed per action, so it is pinned per action.
    //
    // Each action also gets its OWN pre-snapshot. One snapshot taken at the top
    // does not work: a sub-object stops being shared the moment an earlier action
    // replaces it (addState builds a fresh `positions`), so a later in-place write
    // to `positions` lands where that snapshot no longer points and the assertion
    // passes on mutating code. That form was written first, and let a planted
    // `state.positions[nodeId] = position` through green too.
    const edits: [string, () => void][] = [
      ['setWorkflowName', () => store.actions.setWorkflowName('Renamed')],
      ['addState', () => store.actions.addState({ name: 'Review', category: 'active' })],
      ['renameState', () => store.actions.renameState('doing', 'In progress')],
      ['setStateCategory', () => store.actions.setStateCategory('doing', 'open')],
      ['setStateBlocked', () => store.actions.setStateBlocked('doing', true)],
      ['setInitialState', () => store.actions.setInitialState('doing')],
      ['moveState', () => store.actions.moveState('todo', { x: 999, y: 999 })],
      ['addTransition', () => store.actions.addTransition('done', 'todo')],
      ['addRule', () => store.actions.addRule(0, { kind: 'require-comment' })],
      ['updateRule', () => store.actions.updateRule(0, 0, { kind: 'require-field', field: 'title' })],
      ['removeRule', () => store.actions.removeRule(0, 0)],
      ['removeTransition', () => store.actions.removeTransition(2)],
      ['select', () => store.actions.select({ kind: 'state', stateId: 'todo' })],
      ['removeState', () => store.actions.removeState('done')],
      ['loadDraft', () => store.actions.loadDraft(newDraft('Fresh'))],
    ];

    for (const [label, edit] of edits) {
      const before = store.getState();
      const beforeJson = JSON.stringify(before);
      edit();
      expect(JSON.stringify(before), label).toBe(beforeJson);
      // ...and the edit changed something, so the assertion above can actually fail
      expect(JSON.stringify(store.getState()), label).not.toBe(beforeJson);
    }
  });

  it('untouched state objects keep reference identity, so memoized children can skip them', () => {
    const store = storeWith(kanbanDef());
    const before = store.getState();
    store.actions.renameState('doing', 'In progress');
    const after = store.getState();

    expect(after).not.toBe(before);
    expect(after.def).not.toBe(before.def);
    expect(after.def.states[1]).not.toBe(before.def.states[1]); // 'doing' — the edited one
    expect(after.def.states[0]).toBe(before.def.states[0]); // 'todo' — untouched, same object
    expect(after.def.states[2]).toBe(before.def.states[2]); // 'done' — untouched, same object
    expect(after.def.transitions).toBe(before.def.transitions); // no transition was addressed
    expect(after.positions).toBe(before.positions);
  });
});
