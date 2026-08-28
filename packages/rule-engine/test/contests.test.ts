import { describe, expect, it } from 'vitest';
import type { EventEnvelope } from '@gisik-nokma/domain';
import { CONTEST_RULES, evaluateClaimContested, evaluateClaimContestedResolved } from '../src/contests.js';
import type { ContestLookup, EngineContext } from '../src/engine.js';

const TICKET = '01J9GTKA000000000000000000';
const CONTEST_ID = '01J9GCON000000000000000000';

function env(partial: Partial<EventEnvelope>): EventEnvelope {
  return {
    id: '01J9GEVT000000000000000000',
    workspaceId: 'ws_1',
    entity: { kind: 'ticket', id: TICKET },
    type: 'claim.contested',
    version: 1,
    payload: {},
    actorId: 'user_b',
    origin: 'server',
    clientTime: '2026-08-20T00:00:00.000Z',
    serverTime: '2026-08-20T00:00:00.000Z',
    seq: 2,
    ...partial,
  };
}

function ctx(contests: Record<string, ContestLookup>): EngineContext {
  return {
    getEntityState: async () => null,
    getChildrenStates: async () => [],
    getWorkflowDef: async () => null,
    getContest: async (id) => contests[id] ?? null,
  };
}

const contestedPayload = {
  originalEvent: {
    id: '01J9GORG000000000000000000',
    workspaceId: 'ws_1',
    entity: { kind: 'ticket', id: TICKET },
    type: 'ticket.transitioned',
    version: 1,
    payload: { to: 'done' },
    actorId: 'user_b',
    origin: 'mobile',
    clientTime: '2026-08-20T00:00:00.000Z',
  },
  rule: 'restrict-to',
  reason: 'Only the assignee may do this.',
};

describe('evaluateClaimContested', () => {
  // One `expect` per block, and it compares the WHOLE verdict: a block that
  // stopped at the first of several assertions would prove only that one
  // assertion load-bearing under mutation, which is how a fixture ends up
  // pinning something other than what it names.
  it('planted defect: a client-forged contest is refused with contest.server-only', async () => {
    const verdict = await evaluateClaimContested(
      env({ origin: 'mobile', payload: contestedPayload }),
      ctx({}),
    );
    expect(verdict).toEqual({
      refused: true,
      rule: CONTEST_RULES.serverOnly,
      reason: 'A contested claim is the system’s record of a refusal; only the server may append one.',
    });
  });

  it('accepts the server-appended contest', async () => {
    const verdict = await evaluateClaimContested(env({ payload: contestedPayload }), ctx({}));
    expect(verdict).toEqual({ refused: false });
  });
});

describe('evaluateClaimContestedResolved', () => {
  const resolved = (payload: Record<string, unknown>) =>
    env({
      type: 'claim.contested_resolved',
      origin: 'desktop',
      payload: { contestedEventId: CONTEST_ID, resolution: 'discarded', ...payload },
    });

  it('planted defect: resolving a contest nobody recorded is refused with contest.unknown', async () => {
    const verdict = await evaluateClaimContestedResolved(resolved({}), ctx({}));
    expect(verdict).toEqual({
      refused: true,
      rule: CONTEST_RULES.unknown,
      reason: `No contested claim ${CONTEST_ID} is recorded.`,
    });
  });

  it('planted defect: a second resolution is refused with contest.already-resolved', async () => {
    const verdict = await evaluateClaimContestedResolved(
      resolved({}),
      ctx({ [CONTEST_ID]: { ticketId: TICKET, resolved: true } }),
    );
    expect(verdict).toEqual({
      refused: true,
      rule: CONTEST_RULES.alreadyResolved,
      reason: 'This contested claim is already resolved; a second resolution would rewrite history.',
    });
  });

  // One of TWO covers for contest.wrong-ticket. This comment used to say the
  // five fixtures held no misaimed resolution and that the check "must be
  // killed here or nowhere" — true when it was written, false since the sixth
  // fixture landed at review. Deleting the ticket check now fails twice: here,
  // and at contest-resolved-refuses-wrong-ticket.json. The two are not
  // redundant — this one pins the rule, the fixture pins that a wrongly
  // DERIVED ContestLookup.ticketId is caught, which this test cannot see.
  it('planted defect: resolving from another ticket is refused with contest.wrong-ticket', async () => {
    const verdict = await evaluateClaimContestedResolved(
      resolved({}),
      ctx({ [CONTEST_ID]: { ticketId: '01J9GOTH000000000000000000', resolved: false } }),
    );
    expect(verdict).toEqual({
      refused: true,
      rule: CONTEST_RULES.wrongTicket,
      reason: 'This contested claim belongs to a different ticket.',
    });
  });

  it('accepts a first, well-aimed resolution', async () => {
    const verdict = await evaluateClaimContestedResolved(
      resolved({}),
      ctx({ [CONTEST_ID]: { ticketId: TICKET, resolved: false } }),
    );
    expect(verdict).toEqual({ refused: false });
  });

  it('throws on a context without getContest — wiring bug, not a refusal', async () => {
    // No `as unknown as EngineContext` here, though the plan pins one: getContest
    // is OPTIONAL, so this three-method literal is directly assignable. A blanket
    // cast in a new test buys nothing and hides everything — see the comment at
    // apps/server/src/engine-context.ts:44-51, where exactly this cast concealed
    // a live defect until transitions started arriving.
    const bare: EngineContext = {
      getEntityState: async () => null,
      getChildrenStates: async () => [],
      getWorkflowDef: async () => null,
    };
    await expect(evaluateClaimContestedResolved(resolved({}), bare)).rejects.toThrow(/getContest/);
  });
});
