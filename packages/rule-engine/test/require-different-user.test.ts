import { describe, expect, it, vi } from 'vitest';
import { makeEnvelope, type TicketState, type WorkflowDef } from '@gisik-nokma/domain';
import { evaluateRequireDifferentUser } from '../src/rules/require-different-user.js';
import { resolveCurrentStateId } from '../src/version-map.js';
import type { EngineContext } from '../src/engine.js';
import type { TransitionRuleInput } from '../src/rules/types.js';

/**
 * Four-eyes reads the transition log, and both of the properties it needs from
 * that log were, until Plan 3 Task 4b, assumed rather than established:
 *
 *  - an entry it cannot read was SKIPPED, which returns {refused:false} and
 *    silently disarms a security control (coordination doc, Plan 2 execution
 *    consequences §3); and
 *  - "the last person to make this move" was whoever appeared LAST IN THE
 *    ARRAY, not whoever carries the greatest `seq` (§4).
 *
 * Neither is reachable through the fixture suite's accepting-and-refusing pairs
 * as it stood: every fixture's log is built in order, and every fixture's ticket
 * shares its entries' workflow version, which is precisely the condition under
 * which the old fail-open reasoning held. These are the unit tests for the two
 * shapes the fixtures cannot stage.
 *
 * The chain and the ctx below are modelled on `version-map.test.ts` — same
 * three-version shape, same `getWorkflowDef`-by-number context — deliberately,
 * so the two files cannot drift about what a broken chain looks like.
 */

const WF = 'wf_review';

const v1: WorkflowDef = {
  id: WF,
  version: 1,
  name: 'Review',
  initialStateId: 'draft',
  states: [
    { id: 'draft', name: 'Draft', category: 'open' },
    { id: 'review', name: 'In review', category: 'active' },
    { id: 'done', name: 'Done', category: 'terminal' },
  ],
  transitions: [
    { from: 'draft', to: 'review', rules: [] },
    { from: 'review', to: 'done', rules: [] },
  ],
};

const v3: WorkflowDef = { ...v1, version: 3 };

/** Serves the versions it was given, and null for every other — the corrupted-store path. */
function contextServing(byVersion: Map<number, WorkflowDef>, latest: WorkflowDef): EngineContext {
  return {
    getEntityState: vi.fn(async () => null),
    getChildrenStates: vi.fn(async () => []),
    getTicketTypeDef: vi.fn(async () => null),
    getWorkflowDef: vi.fn(async (_workflowId: string, version?: number) =>
      version === undefined ? latest : (byVersion.get(version) ?? null),
    ),
  };
}

function ticketWith(
  workflowVersion: number,
  stateId: string,
  transitions: TicketState['transitions'],
): TicketState {
  return {
    kind: 'ticket',
    id: 't1',
    workspaceId: 'ws_1',
    projectId: 'prj_1',
    typeId: 'task',
    parentId: null,
    workflowId: WF,
    workflowVersion,
    stateId,
    stateCategory: 'active',
    assigneeId: null,
    collaboratorIds: [],
    fields: {},
    transitions,
  };
}

function inputFor(
  ticket: TicketState,
  ctx: EngineContext,
  def: WorkflowDef,
  actorId: string,
  to: string,
): TransitionRuleInput {
  const toState = def.states.find((state) => state.id === to);
  if (toState === undefined) throw new Error(`test setup: "${to}" is not a state of ${def.id}@${def.version}`);
  return {
    env: makeEnvelope({
      type: 'ticket.transitioned',
      entity: { kind: 'ticket', id: ticket.id },
      payload: { to },
      actorId,
    }),
    ctx,
    ticket,
    def,
    toState,
    fromStateId: ticket.stateId,
    payload: { to },
  };
}

const watchesDone = { kind: 'require-different-user', thanActorOf: { to: 'done' } } as const;
const watchesReview = { kind: 'require-different-user', thanActorOf: { to: 'review' } } as const;

/**
 * The pinned copy, character-for-character as a literal — never built from the
 * template in the source, so a typo in the source cannot certify itself.
 */
const UNREADABLE_HISTORY =
  'This step needs a second person, and this ticket\'s history cannot be read against its current workflow, so who last performed the move to "done" is unknown. Ask an admin to check this workflow\'s version history.';

describe('require-different-user fails CLOSED on a history it cannot read', () => {
  it('refuses when a log entry cannot be resolved forward, while the ticket itself resolves cleanly', async () => {
    // The shape Plan 3's refresh-on-publish makes routine: the ticket's row has
    // been folded to the latest version, so it folds v3→v3 as a no-op, while an
    // entry recorded under v1 still walks the whole chain — and v2 is missing
    // from the store, so that walk breaks. Before this change the entry was
    // skipped, `prior` stayed undefined, and four-eyes returned {refused:false}.
    const ctx = contextServing(
      new Map([
        [1, v1],
        [3, v3],
      ]),
      v3,
    );
    const ticket = ticketWith(3, 'review', [
      { toStateId: 'done', actorId: 'user_a', seq: 4, workflowId: WF, workflowVersion: 1 },
    ]);

    // The premise, asserted rather than assumed: the ticket does NOT strand, so
    // nothing upstream refuses first and this refusal is four-eyes' own.
    await expect(resolveCurrentStateId(ticket, v3, ctx)).resolves.toEqual({ ok: true, stateId: 'review' });

    // A different person from every actor in the log, so the pre-change code
    // accepts cleanly and the mutation proof fails at this assertion rather
    // than tripping some other refusal on the way.
    const verdict = await evaluateRequireDifferentUser(watchesDone, inputFor(ticket, ctx, v3, 'user_b', 'done'));

    expect(verdict).toEqual({
      refused: true,
      rule: 'require-different-user',
      reason: UNREADABLE_HISTORY,
    });
  });

  it('refuses on the FIRST unreadable entry, even when a later entry resolves and matches', async () => {
    // Finishing the loop and only refusing when nothing matched would let a
    // later entry paper over an unreadable earlier one — the same fail-open
    // wearing a longer loop. Here the resolvable entry names a third person, so
    // a loop that ran to the end would accept.
    const ctx = contextServing(
      new Map([
        [1, v1],
        [3, v3],
      ]),
      v3,
    );
    const ticket = ticketWith(3, 'review', [
      { toStateId: 'review', actorId: 'user_a', seq: 2, workflowId: WF, workflowVersion: 1 },
      { toStateId: 'done', actorId: 'user_c', seq: 5, workflowId: WF, workflowVersion: 3 },
    ]);

    const verdict = await evaluateRequireDifferentUser(watchesDone, inputFor(ticket, ctx, v3, 'user_b', 'done'));

    expect(verdict).toEqual({
      refused: true,
      rule: 'require-different-user',
      reason: UNREADABLE_HISTORY,
    });
  });

  it('still skips an entry from a workflow the ticket has left, without refusing on it', async () => {
    // Guard 1 comes first and stays first. This entry would be UNREADABLE if it
    // were walked — v2 is missing, so resolving it against the ticket's own
    // chain strands — which is what makes this a regression test for the ORDER
    // of the two guards rather than merely for the skip: delete guard 1 and the
    // foreign entry reaches the new refusal.
    const ctx = contextServing(
      new Map([
        [1, v1],
        [3, v3],
      ]),
      v3,
    );
    const ticket = ticketWith(3, 'review', [
      { toStateId: 'done', actorId: 'user_b', seq: 2, workflowId: 'wf_something_else', workflowVersion: 1 },
    ]);

    const verdict = await evaluateRequireDifferentUser(watchesDone, inputFor(ticket, ctx, v3, 'user_b', 'done'));

    expect(verdict).toEqual({ refused: false });
  });
});

describe('require-different-user orders the log by `seq`, not by array position', () => {
  // One version only: nothing here is about version walking. The two entries
  // both match the watched state and disagree about who moved last, and the
  // array says the opposite of what `seq` says.
  const single: WorkflowDef = { ...v1, version: 1 };
  const outOfOrder: TicketState['transitions'] = [
    { toStateId: 'review', actorId: 'user_late', seq: 9, workflowId: WF, workflowVersion: 1 },
    { toStateId: 'review', actorId: 'user_early', seq: 2, workflowId: WF, workflowVersion: 1 },
  ];

  it('compares the actor of the greatest-`seq` match, not of the last array element', async () => {
    const ctx = contextServing(new Map([[1, single]]), single);
    const ticket = ticketWith(1, 'review', [...outOfOrder]);

    const verdict = await evaluateRequireDifferentUser(
      watchesReview,
      inputFor(ticket, ctx, single, 'user_late', 'done'),
    );

    // Reading array order instead leaves `user_early` standing, who is not the
    // actor, and the move is accepted — a self-approval let through.
    expect(verdict).toEqual({
      refused: true,
      rule: 'require-different-user',
      reason: 'This step needs a second person: user_late already performed the move to "review" on this ticket.',
    });
  });

  it('sorts a COPY: the log it was handed comes back in the order it arrived', async () => {
    const ctx = contextServing(new Map([[1, single]]), single);
    const transitions = [...outOfOrder];
    const ticket = ticketWith(1, 'review', transitions);

    await evaluateRequireDifferentUser(watchesReview, inputFor(ticket, ctx, single, 'user_late', 'done'));

    // A rule that reorders the state it was handed is a defect of its own: the
    // engine input is shared with every later rule on the same transition.
    expect(transitions.map((entry) => entry.seq)).toEqual([9, 2]);
    expect(ticket.transitions).toBe(transitions);
  });
});
