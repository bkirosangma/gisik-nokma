import { describe, expect, it } from 'vitest';
import type { WorkflowDef } from '@gisik-nokma/domain';
import {
  ANY_STATE_NODE_ID,
  COLUMN_WIDTH,
  ROW_HEIGHT,
  layoutDraft,
  nextFreePosition,
} from '../../src/workflow-builder/layout.js';

const def: WorkflowDef = {
  id: '01J9Z0000000000000000000WF',
  version: 1,
  name: 'Layout fixture',
  initialStateId: 'todo',
  states: [
    { id: 'todo', name: 'To do', category: 'open' },
    { id: 'doing', name: 'Doing', category: 'active' },
    { id: 'done', name: 'Done', category: 'terminal' },
    { id: 'orphan', name: 'Orphan', category: 'open' },
  ],
  transitions: [
    { from: 'todo', to: 'doing', rules: [] },
    { from: 'doing', to: 'done', rules: [] },
  ],
};

describe('layoutDraft', () => {
  it('layers states by distance from the initial state', () => {
    const positions = layoutDraft(def);
    expect(positions['todo']).toEqual({ x: COLUMN_WIDTH, y: 80 });
    expect(positions['doing']).toEqual({ x: COLUMN_WIDTH * 2, y: 80 });
    expect(positions['done']).toEqual({ x: COLUMN_WIDTH * 3, y: 80 });
  });

  it('parks states unreachable from the initial state in a final column', () => {
    const positions = layoutDraft(def);
    expect(positions['orphan']).toEqual({ x: COLUMN_WIDTH * 4, y: 80 });
  });

  it('stacks states sharing a layer vertically', () => {
    const branching: WorkflowDef = {
      ...def,
      states: [
        { id: 'todo', name: 'To do', category: 'open' },
        { id: 'a', name: 'A', category: 'active' },
        { id: 'b', name: 'B', category: 'terminal' },
      ],
      transitions: [
        { from: 'todo', to: 'a', rules: [] },
        { from: 'todo', to: 'b', rules: [] },
      ],
    };
    const positions = layoutDraft(branching);
    expect(positions['a']).toEqual({ x: COLUMN_WIDTH * 2, y: 80 });
    expect(positions['b']).toEqual({ x: COLUMN_WIDTH * 2, y: 80 + ROW_HEIGHT });
  });

  it('places the any-state node to the left of everything', () => {
    expect(layoutDraft(def)[ANY_STATE_NODE_ID]).toEqual({ x: 0, y: 80 });
  });

  it('survives a def whose initialStateId names no state (dangling marker)', () => {
    const dangling = { ...def, initialStateId: 'gone' };
    const positions = layoutDraft(dangling);
    // every state still gets a position — the issues panel reports the dangling marker, layout must not crash
    for (const state of dangling.states) {
      expect(positions[state.id]).toBeDefined();
    }
  });

  it('a "*" transition does not flatten the layering', () => {
    const withStar: WorkflowDef = {
      ...def,
      transitions: [...def.transitions, { from: '*', to: 'done', rules: [] }],
    };
    expect(layoutDraft(withStar)['done']).toEqual({ x: COLUMN_WIDTH * 3, y: 80 });
  });
});

describe('nextFreePosition', () => {
  it('starts at the first column when the canvas is empty', () => {
    expect(nextFreePosition({})).toEqual({ x: COLUMN_WIDTH, y: 80 });
  });

  it('drops below the lowest existing node', () => {
    expect(nextFreePosition({ a: { x: 260, y: 80 }, b: { x: 520, y: 220 } })).toEqual({
      x: COLUMN_WIDTH,
      y: 220 + ROW_HEIGHT,
    });
  });
});
