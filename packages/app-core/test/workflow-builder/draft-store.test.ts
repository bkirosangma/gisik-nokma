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
