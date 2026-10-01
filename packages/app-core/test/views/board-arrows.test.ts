import { describe, expect, it } from 'vitest';
import type { WorkflowDef } from '@gisik-nokma/domain';
import { allBoardTargets, arrowTarget, arrowTargets } from '../../src/views/board-arrows.js';
import { transitionOptions } from '../../src/views/transition-dialog.js';
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

/**
 * The DIRECTIONAL LIST (owner request, 2026-09-17: "if multiple paths exist
 * for the column, on clicking next, it should open up a modal to select
 * which"). `arrowTargets` is the same scan `arrowTarget` always ran — the
 * singular is now defined as the plural's head — so there is still ONE
 * author of "what is declared that way", never a second walk that could
 * disagree with the first.
 */
describe('arrowTargets — every declared target in that direction, nearest first', () => {
  /**
   * 13.524 — from `doing`, BOTH forward declared targets, in column order:
   * `waiting` (nearer) then `done`. And the singular still answers the
   * nearest — `13.492`'s own assertion, restated as the plural's head so a
   * divergence between the two would fail here by name.
   */
  it('lists both forward targets from doing, nearest first, and the singular is the head', () => {
    expect(arrowTargets(WF_ERRAND, ERRAND_COLUMN_ORDER, 'doing', 'next')).toEqual(['waiting', 'done']);
    expect(arrowTarget(WF_ERRAND, ERRAND_COLUMN_ORDER, 'doing', 'next')).toBe(
      arrowTargets(WF_ERRAND, ERRAND_COLUMN_ORDER, 'doing', 'next')[0],
    );
  });

  /**
   * 13.525 — backward from `done`: `waiting` sits between but is NOT
   * declared from `done`, so it is skipped (`13.494`'s skip, in list form);
   * `doing` (exact edge) is nearer than `todo` (wildcard edge), so that is
   * the order.
   */
  it('lists backward targets from done, skipping the undeclared column and including the wildcard', () => {
    expect(arrowTargets(WF_ERRAND, ERRAND_COLUMN_ORDER, 'done', 'previous')).toEqual(['doing', 'todo']);
  });

  /** 13.526 — the two empty answers: nothing declared that way, and a column the def does not know. */
  it('answers an empty list where the singular answers null', () => {
    expect(arrowTargets(WF_ERRAND, ERRAND_COLUMN_ORDER, 'todo', 'previous')).toEqual([]);
    expect(arrowTargets(WF_ERRAND, ERRAND_COLUMN_ORDER, 'done', 'next')).toEqual([]);
    expect(arrowTargets(WF_ERRAND, ERRAND_COLUMN_ORDER, 'nowhere', 'next')).toEqual([]);
  });
});

/**
 * 21.044 — the Move button's list: every destination the BOARD offers from a
 * state, both directions in one list. The plan's own snippet expected
 * `['waiting', 'done']` from `doing`; `WF_ERRAND` also declares `* -> todo`,
 * so `todo` is a legal move from every state and comes first in declaration
 * order. The control's fixture likewise has to drop the wildcard, or `waiting`
 * still has a non-Backlog exit.
 */
describe('21.044 allBoardTargets — transitionOptions minus Backlog, declaration order', () => {
  it('21.044 doing offers todo, waiting and done in declaration order, never Backlog', () => {
    expect(allBoardTargets(WF_ERRAND, 'doing')).toEqual(['todo', 'waiting', 'done']);
    expect(allBoardTargets(WF_ERRAND, 'doing')).not.toContain('backlog');
    // CONTROL — Backlog IS a real transitionOptions target here, so the filter has something to remove …
    const options = transitionOptions(WF_ERRAND, 'doing').map((option) => option.toStateId);
    expect(options).toContain('backlog');
    // … and a state whose only exit is Send to Backlog offers nothing on the board.
    const onlyBacklog: WorkflowDef = {
      ...WF_ERRAND,
      transitions: WF_ERRAND.transitions.filter((t) => t.from !== 'waiting' && t.from !== '*'),
    };
    expect(transitionOptions(onlyBacklog, 'waiting').map((option) => option.toStateId)).toEqual(['backlog']);
    expect(allBoardTargets(onlyBacklog, 'waiting')).toEqual([]);
  });
});
