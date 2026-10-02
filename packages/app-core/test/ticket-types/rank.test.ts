import { describe, expect, it } from 'vitest';
import type { TicketTypeDef } from '@gisik-nokma/domain';
import { rankImplications, rankImplicationsCopy } from '../../src/workflow-builder/ticket-types/rank.js';

function type(id: string, name: string, rank: number): TicketTypeDef {
  return { id, name, icon: 'flag', rank, workflowId: 'wf', fields: [] };
}

const BUILTINS = [type('epic', 'Epic', 1), type('story', 'Story', 2), type('task', 'Task', 3), type('sub-task', 'Sub-task', 4)];

describe('rankImplications', () => {
  it('parents are all types of strictly lower rank, ordered by rank, excluding itself', () => {
    const { parents } = rankImplications('invoice', 3, [...BUILTINS, type('invoice', 'Invoice', 3)]);
    expect(parents.map((parent) => parent.name)).toEqual(['Epic', 'Story']);
  });

  /**
   * 10.44 — rank implications derived live; a type at or below the deepest rank says plainly that its tickets will need a parent.
   */
  it('the deepest rank requires a parent — built-in or workspace-invented alike (owner decision 2026-08-20)', () => {
    expect(rankImplications('sub-task', 4, BUILTINS).mustHaveParent).toBe(true);
    expect(rankImplications('invoice', 4, BUILTINS).mustHaveParent).toBe(true);
    // …and nothing slips underneath the floor: rank 5 is smaller work than a
    // sub-task, so it needs a parent all the more. This is the standing guard
    // for `>=` over `===` (design decision 4).
    expect(rankImplications('micro-step', 5, BUILTINS).mustHaveParent).toBe(true);
    // …while shallower ranks sit at the project root freely — no over-applying.
    expect(rankImplications('invoice', 3, BUILTINS).mustHaveParent).toBe(false);
    expect(rankImplications('epic', 1, BUILTINS).mustHaveParent).toBe(false);
  });

  /**
   * The guard design decision 4 exists for, and the one a computed maximum
   * would fail: a workspace that has defined nothing below Task. `rank >=
   * DEEPEST_RANK` still says Task sits at project root, because DEEPEST_RANK
   * is the engine's constant and not a maximum over `allTypes`. A local max
   * would read 3 here and promise a rule the server does not enforce.
   */
  it('does not derive the floor from the loaded types — a shallow workspace does not move it', () => {
    const shallow = [type('epic', 'Epic', 1), type('story', 'Story', 2), type('task', 'Task', 3)];
    expect(rankImplications('task', 3, shallow).mustHaveParent).toBe(false);
    expect(rankImplications('checklist-item', 4, shallow).mustHaveParent).toBe(true);
  });
});

describe('rankImplicationsCopy', () => {
  it('names the possible parents and the root option', () => {
    expect(rankImplicationsCopy(rankImplications('invoice', 3, BUILTINS))).toBe(
      'Can sit under: Epic, Story, or at the project root.',
    );
  });

  it('a rank with no possible parents is the top of the hierarchy', () => {
    expect(rankImplicationsCopy(rankImplications('epic', 1, BUILTINS))).toBe(
      'Top of the hierarchy. It sits at the project root.',
    );
  });

  it('the deepest rank names its parent requirement, and says the same thing to a custom type there', () => {
    expect(rankImplicationsCopy(rankImplications('sub-task', 4, BUILTINS))).toBe(
      'Must sit under a parent. This is the smallest kind of work, so tickets of this type always belong to something bigger. Can sit under: Epic, Story, Task.',
    );
    expect(rankImplicationsCopy(rankImplications('invoice', 4, BUILTINS))).toBe(
      'Must sit under a parent. This is the smallest kind of work, so tickets of this type always belong to something bigger. Can sit under: Epic, Story, Task.',
    );
  });
});
