import { describe, expect, it } from 'vitest';
import {
  BACKLOG_STATE,
  BACKLOG_STATE_ID,
  foldStateIdForward,
  statesWithBacklog,
  transitionsWithBacklog,
  universalTransitions,
  type WorkflowDef,
} from '../src/workflow.js';
import { stateCategoryOf } from '../src/workflow-helpers.js';

const WF: WorkflowDef = {
  id: 'wf', version: 1, name: 'Basic', initialStateId: 'todo',
  states: [
    { id: 'todo', name: 'To do', category: 'open' },
    { id: 'doing', name: 'Doing', category: 'active' },
    { id: 'done', name: 'Done', category: 'terminal' },
  ],
  transitions: [
    { from: 'todo', to: 'doing', rules: [] },
    { from: 'doing', to: 'done', rules: [{ kind: 'require-comment' }] },
  ],
};

/** 13.562 — the universal state (backlog/closed spec §1.1): every workflow has it without declaring it. */
describe('13.562 statesWithBacklog and the universal edges', () => {
  it('appends the one Backlog state, category open, after the declared states', () => {
    expect(BACKLOG_STATE).toEqual({ id: 'backlog', name: 'Backlog', category: 'open' });
    expect(statesWithBacklog(WF).map((s) => s.id)).toEqual(['todo', 'doing', 'done', 'backlog']);
    expect(stateCategoryOf(WF, BACKLOG_STATE_ID)).toBe('open');
  });

  it('declares Start (backlog → initial) and Send to backlog from every NON-terminal state, with no rules', () => {
    expect(universalTransitions(WF)).toEqual([
      { from: 'backlog', to: 'todo', rules: [] },
      { from: 'todo', to: 'backlog', rules: [] },
      { from: 'doing', to: 'backlog', rules: [] },
    ]);
    // `done` is terminal: finished, not parked — no edge to backlog.
    expect(universalTransitions(WF).some((t) => t.from === 'done')).toBe(false);
  });

  it('transitionsWithBacklog is the declared edges followed by the universal ones, declared rules intact', () => {
    const all = transitionsWithBacklog(WF);
    expect(all.slice(0, 2)).toEqual(WF.transitions);
    expect(all.slice(2)).toEqual(universalTransitions(WF));
    expect(all.find((t) => t.from === 'doing' && t.to === 'done')?.rules).toEqual([{ kind: 'require-comment' }]);
  });

  it('is pure: the def is not mutated', () => {
    const before = JSON.stringify(WF);
    statesWithBacklog(WF);
    transitionsWithBacklog(WF);
    expect(JSON.stringify(WF)).toBe(before);
  });
});

/** 13.563 — the fold on republish (spec §1.4): backlog is never a dropped state. */
describe('13.563 foldStateIdForward treats backlog as never dropped', () => {
  const V2: WorkflowDef = { ...WF, version: 2, states: WF.states.filter((s) => s.id !== 'doing') };
  it('folds a backlog ticket forward across a version that dropped a declared state, without a mapping', () => {
    expect(foldStateIdForward(BACKLOG_STATE_ID, 1, V2, () => null)).toEqual({ ok: true, stateId: 'backlog' });
  });
  it('still refuses a dropped DECLARED state with no mapping — the exemption is for backlog alone', () => {
    expect(foldStateIdForward('doing', 1, V2, () => null)).toEqual({ ok: false, unmappedStateId: 'doing' });
  });
});
