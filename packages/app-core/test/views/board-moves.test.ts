import { describe, expect, it } from 'vitest';
import type { FieldClaim, WorkflowDef } from '@gisik-nokma/domain';
import { moveOutcome } from '../../src/views/board-moves.js';
import { WF_ERRAND } from '../helpers/seed.js';

const REQUIRE_COMMENT = [{ kind: 'require-comment' }] as WorkflowDef['transitions'][number]['rules'];
const REQUIRE_DUE_DATE = [
  { kind: 'require-field', field: 'dueDate' },
] as WorkflowDef['transitions'][number]['rules'];

// None of the plain outcome/wildcard/precedence cases below turn on field
// claims at all — an empty ticketFields map is the honest fixture for them,
// not a stand-in for "the ticket has no fields."
const NO_FIELDS: Record<string, FieldClaim> = {};

describe('13.478-13.488 moveOutcome — the transition gate, built over transitionOptions', () => {
  it('13.478 refuses an undeclared target, and names what is available', () => {
    // `'backlog'` joined the available list since 2026-09-17 (backlog/closed
    // spec §4): `todo` is non-terminal, so it also carries the universal
    // Send-to-backlog edge alongside its one declared move.
    expect(moveOutcome(WF_ERRAND, 'todo', 'done', NO_FIELDS)).toEqual({
      kind: 'refused',
      available: ['doing', 'backlog'],
    });
  });

  it('13.479 names EVERY available move when refusing from a state with several declared edges', () => {
    // From 'doing' three edges are declared (todo via the wildcard, waiting,
    // done). A refusal that named only one of them, or an empty list, would
    // still "refuse" — the person would still be stuck guessing. `'doing'`
    // is non-terminal, so 'backlog' is now a fourth, universal alternative.
    expect(moveOutcome(WF_ERRAND, 'doing', 'nowhere', NO_FIELDS)).toEqual({
      kind: 'refused',
      available: ['todo', 'waiting', 'done', 'backlog'],
    });
  });

  it('13.480 submits directly when the declared edge carries no rules', () => {
    expect(moveOutcome(WF_ERRAND, 'todo', 'doing', NO_FIELDS)).toEqual({
      kind: 'direct',
      toStateId: 'doing',
    });
  });

  it('13.481 opens the dialog when the declared edge carries rules', () => {
    expect(moveOutcome(WF_ERRAND, 'doing', 'done', NO_FIELDS)).toEqual({
      kind: 'needs-dialog',
      toStateId: 'done',
    });
  });

  it('13.482 a target reachable ONLY through the wildcard edge still resolves as a declared move', () => {
    // 'waiting' has no exact edge to 'todo' — only `* -> todo` reaches it.
    expect(moveOutcome(WF_ERRAND, 'waiting', 'todo', NO_FIELDS)).toEqual({
      kind: 'direct',
      toStateId: 'todo',
    });
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
    expect(moveOutcome(def, 'doing', 'done', NO_FIELDS)).toEqual({ kind: 'direct', toStateId: 'done' });
  });

  it('13.484 a wildcard-only edge that DOES carry rules opens the dialog too', () => {
    const def: WorkflowDef = {
      ...WF_ERRAND,
      states: [...WF_ERRAND.states, { id: 'flagged', name: 'Flagged', category: 'active' }],
      transitions: [...WF_ERRAND.transitions, { from: '*', to: 'flagged', rules: REQUIRE_COMMENT }],
    };
    expect(moveOutcome(def, 'doing', 'flagged', NO_FIELDS)).toEqual({
      kind: 'needs-dialog',
      toStateId: 'flagged',
    });
  });

  it('13.485 a move back onto the current state refuses — there is no edge to itself', () => {
    // `transitionOptions` already excludes `to === fromStateId`, even for a
    // wildcard edge that would otherwise reach it, so a drop back onto the
    // origin column is an undeclared move like any other. Same 'backlog'
    // ripple as 13.478 (`todo` is non-terminal).
    expect(moveOutcome(WF_ERRAND, 'todo', 'todo', NO_FIELDS)).toEqual({
      kind: 'refused',
      available: ['doing', 'backlog'],
    });
  });

  // Ruling 25: a `require-field` edge is checked against `ticketFields`, the
  // SAME way `TransitionDialog` checks it (`fieldAlreadyClaimed`,
  // `field-claims.ts`) — mirrors 3.72's own "a required field the ticket
  // ALREADY carries is not re-asked" scenario in transition-dialog.test.tsx,
  // one layer down: there the dialog skips the input; here the gate must
  // never even open the dialog for it.
  const defWithFieldRule: WorkflowDef = {
    ...WF_ERRAND,
    transitions: WF_ERRAND.transitions.map((transition) =>
      transition.from === 'todo' && transition.to === 'doing'
        ? { ...transition, rules: REQUIRE_DUE_DATE }
        : transition,
    ),
  };
  const DUE_DATE_CLAIMED: Record<string, FieldClaim> = {
    dueDate: {
      value: { date: '2026-08-30' },
      actorId: 'user_kiro',
      clientTime: '2026-08-18T08:05:00.000Z',
      serverTime: '2026-08-18T08:05:01.000Z',
    },
  };

  it('13.486 a require-field edge whose field the ticket ALREADY carries answers direct, not needs-dialog', () => {
    expect(moveOutcome(defWithFieldRule, 'todo', 'doing', DUE_DATE_CLAIMED)).toEqual({
      kind: 'direct',
      toStateId: 'doing',
    });
  });

  it('13.487 the SAME require-field edge with the field unclaimed still answers needs-dialog', () => {
    // The control 13.486 needs: without it, an implementation that always
    // answered 'direct' for require-field (or that ignored ticketFields
    // entirely) would pass 13.486 for the wrong reason.
    expect(moveOutcome(defWithFieldRule, 'todo', 'doing', NO_FIELDS)).toEqual({
      kind: 'needs-dialog',
      toStateId: 'doing',
    });
  });

  it('13.488 the SAME require-field edge with the field set to WHITESPACE-ONLY still answers needs-dialog (Ruling 26)', () => {
    // `evaluateRequireField` (`packages/rule-engine/src/rules/require-field.ts`)
    // trims and treats a whitespace-only value as unset — deliberate, tested,
    // Task 9's own controller ruling
    // (`packages/rule-engine/test/engine.test.ts`, "require-field and
    // require-evidence refuse a blank value, not only an absent one").
    // `fieldAlreadyClaimed` mirrors that exactly (Ruling 26). Before the trim,
    // this ticket shape answered 'direct' here — the server would then refuse
    // the same move for real, with no refusal-display path on Tasks 13/14 to
    // show it. This is the case that motivated Ruling 26.
    const DUE_DATE_WHITESPACE: Record<string, FieldClaim> = {
      dueDate: {
        value: '   ',
        actorId: 'user_kiro',
        clientTime: '2026-08-18T08:05:00.000Z',
        serverTime: '2026-08-18T08:05:01.000Z',
      },
    };
    expect(moveOutcome(defWithFieldRule, 'todo', 'doing', DUE_DATE_WHITESPACE)).toEqual({
      kind: 'needs-dialog',
      toStateId: 'doing',
    });
  });
});
