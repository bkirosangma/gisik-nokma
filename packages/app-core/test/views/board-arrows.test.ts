import { describe, expect, it } from 'vitest';
import type { WorkflowDef } from '@gisik-nokma/domain';
import { arrowTarget } from '../../src/views/board-arrows.js';
import { WF_ERRAND } from '../helpers/seed.js';

/**
 * `WF_ERRAND`'s own column order (`board.test.tsx`'s `errandGroup` builds its
 * columns in this exact sequence, matching `WF_ERRAND.states`): todo, doing,
 * waiting, done. `WF_ERRAND`'s transitions: `* -> todo`, `todo -> doing`,
 * `doing -> waiting`, `waiting -> doing`, `doing -> done` (require-comment),
 * `done -> doing`.
 */
const ERRAND_COLUMN_ORDER = ['todo', 'doing', 'waiting', 'done'];

/**
 * 13.490 — the adjacent column IS the declared target, the ordinary case.
 */
describe('arrowTarget — declared edges, not column order', () => {
  it('resolves next to the adjacent column when that edge is declared', () => {
    expect(arrowTarget(WF_ERRAND, ERRAND_COLUMN_ORDER, 'todo', 'next')).toBe('doing');
  });

  /** 13.491 — nothing declares an edge back onto `todo`, so previous is absent. */
  it('has no previous move from todo — nothing declares an edge back to it', () => {
    expect(arrowTarget(WF_ERRAND, ERRAND_COLUMN_ORDER, 'todo', 'previous')).toBeNull();
  });

  /**
   * 13.492 — from `doing`, `transitionOptions` declares THREE targets: `todo`
   * (via the wildcard `* -> todo`), `waiting`, and `done`. `waiting` is
   * nearer than `done` in column order, so `next` resolves to `waiting` even
   * though `done` is also a real, declared target — "nearest declared", not
   * "any declared".
   */
  it('picks the NEARER of two declared forward targets, not merely a declared one', () => {
    expect(arrowTarget(WF_ERRAND, ERRAND_COLUMN_ORDER, 'doing', 'next')).toBe('waiting');
  });

  /** 13.493 — previous resolves through the WILDCARD edge, not only an exact one. */
  it('resolves previous via the wildcard edge, not only an exact one', () => {
    expect(arrowTarget(WF_ERRAND, ERRAND_COLUMN_ORDER, 'doing', 'previous')).toBe('todo');
  });

  /**
   * 13.494 — THE SKIP CASE, inside the shared fixture. From `done`,
   * `transitionOptions` declares `todo` (wildcard) and `doing` (exact); it
   * does NOT declare `waiting`, even though `waiting` sits between `doing`
   * and `done` in column order. `previous` must skip over `waiting` and land
   * on the further, genuinely declared `doing`.
   */
  it('SKIPS a non-declared column to reach a further, declared one', () => {
    expect(arrowTarget(WF_ERRAND, ERRAND_COLUMN_ORDER, 'done', 'previous')).toBe('doing');
  });

  /** 13.495 — `done` is the last column; there is nothing to scan forward into. */
  it('has no next move from done — the last column, nothing to scan forward into', () => {
    expect(arrowTarget(WF_ERRAND, ERRAND_COLUMN_ORDER, 'done', 'next')).toBeNull();
  });

  /**
   * 13.496 — THE BRIEF'S OWN CANONICAL EXAMPLE, built as its own fixture so
   * the test reads exactly like the docblock's illustration: a workflow
   * declares `todo -> done` only, with `doing` sitting between them purely
   * visually (no edge touches it at all). `next` from `todo` must resolve
   * straight to `done`, not to the physically adjacent `doing`.
   */
  it('THE CANONICAL EXAMPLE: todo -> done declared, doing sits between them visually, next SKIPS to done', () => {
    const def: WorkflowDef = {
      id: 'wf-skip',
      version: 1,
      name: 'Skip',
      initialStateId: 'todo',
      states: [
        { id: 'todo', name: 'To do', category: 'open' },
        { id: 'doing', name: 'Doing', category: 'active' },
        { id: 'done', name: 'Done', category: 'terminal' },
      ],
      transitions: [{ from: 'todo', to: 'done', rules: [] }],
    };
    expect(arrowTarget(def, ['todo', 'doing', 'done'], 'todo', 'next')).toBe('done');
    // And the control: `doing` truly has no move at all, in either direction
    // — the skip did not merely relabel which arrow "doing" answers to.
    expect(arrowTarget(def, ['todo', 'doing', 'done'], 'doing', 'next')).toBeNull();
    expect(arrowTarget(def, ['todo', 'doing', 'done'], 'doing', 'previous')).toBeNull();
  });

  /** 13.497 — a column this def does not recognise has nothing to scan from. */
  it('returns null when fromStateId is not in columnOrder at all', () => {
    expect(arrowTarget(WF_ERRAND, ERRAND_COLUMN_ORDER, 'nowhere', 'next')).toBeNull();
  });
});
