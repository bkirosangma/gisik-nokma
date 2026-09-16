import { describe, expect, it } from 'vitest';
import type { WorkflowDef } from '@gisik-nokma/domain';
import { moveOutcome } from '../../src/views/board-moves.js';
import { WF_ERRAND } from '../helpers/seed.js';

const REQUIRE_COMMENT = [{ kind: 'require-comment' }] as WorkflowDef['transitions'][number]['rules'];

describe('13.478-13.485 moveOutcome — the transition gate, built over transitionOptions', () => {
  it('13.478 refuses an undeclared target, and names what is available', () => {
    expect(moveOutcome(WF_ERRAND, 'todo', 'done')).toEqual({ kind: 'refused', available: ['doing'] });
  });

  it('13.479 names EVERY available move when refusing from a state with several declared edges', () => {
    // From 'doing' three edges are declared (todo via the wildcard, waiting,
    // done). A refusal that named only one of them, or an empty list, would
    // still "refuse" — the person would still be stuck guessing.
    expect(moveOutcome(WF_ERRAND, 'doing', 'nowhere')).toEqual({
      kind: 'refused',
      available: ['todo', 'waiting', 'done'],
    });
  });

  it('13.480 submits directly when the declared edge carries no rules', () => {
    expect(moveOutcome(WF_ERRAND, 'todo', 'doing')).toEqual({ kind: 'direct', toStateId: 'doing' });
  });

  it('13.481 opens the dialog when the declared edge carries rules', () => {
    expect(moveOutcome(WF_ERRAND, 'doing', 'done')).toEqual({ kind: 'needs-dialog', toStateId: 'done' });
  });

  it('13.482 a target reachable ONLY through the wildcard edge still resolves as a declared move', () => {
    // 'waiting' has no exact edge to 'todo' — only `* -> todo` reaches it.
    expect(moveOutcome(WF_ERRAND, 'waiting', 'todo')).toEqual({ kind: 'direct', toStateId: 'todo' });
  });

  it('13.483 exact-vs-wildcard precedence follows the ENGINE, not declaration order (P27, one level up)', () => {
    // The wildcard edge is declared FIRST and carries rules; the exact edge
    // is declared SECOND and carries none. `find(exact) ?? find('*')`
    // (`rule-engine/src/transition.ts:91-93`) means the exact edge supplies
    // the rules regardless of which was written first. A re-derivation that
    // scanned `def.transitions` in array order and stopped at the first
    // match reaching `to` would see the wildcard's rules first and answer
    // 'needs-dialog' here instead — this case is what tells the two apart.
    const def: WorkflowDef = {
      ...WF_ERRAND,
      transitions: [
        { from: '*', to: 'done', rules: REQUIRE_COMMENT },
        { from: 'doing', to: 'done', rules: [] },
      ],
    };
    expect(moveOutcome(def, 'doing', 'done')).toEqual({ kind: 'direct', toStateId: 'done' });
  });

  it('13.484 a wildcard-only edge that DOES carry rules opens the dialog too', () => {
    const def: WorkflowDef = {
      ...WF_ERRAND,
      states: [...WF_ERRAND.states, { id: 'flagged', name: 'Flagged', category: 'active' }],
      transitions: [...WF_ERRAND.transitions, { from: '*', to: 'flagged', rules: REQUIRE_COMMENT }],
    };
    expect(moveOutcome(def, 'doing', 'flagged')).toEqual({ kind: 'needs-dialog', toStateId: 'flagged' });
  });

  it('13.485 a move back onto the current state refuses — there is no edge to itself', () => {
    // `transitionOptions` already excludes `to === fromStateId`, even for a
    // wildcard edge that would otherwise reach it, so a drop back onto the
    // origin column is an undeclared move like any other.
    expect(moveOutcome(WF_ERRAND, 'todo', 'todo')).toEqual({ kind: 'refused', available: ['doing'] });
  });
});
