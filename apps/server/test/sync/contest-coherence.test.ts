import { describe, expect, it } from 'vitest';
import { newUlid, type SubmittedEvent } from '@gisik-nokma/domain';
import {
  buildContestedClaim,
  checkContestCoherence,
  CONTEST_COHERENCE_RULE,
  CONTEST_ENTITY_KIND_MISMATCH_REASON,
  CONTEST_TICKET_MISMATCH_REASON,
  CONTEST_WORKSPACE_MISMATCH_REASON,
} from '../../src/sync/contest-coherence.js';

/**
 * The §11 closer, at the level it is decided: a pure function of one event.
 * `contest-coherence-door.test.ts` proves the same property at the LEDGER — the
 * path the compound forgery actually ran through — because a check that is only
 * proven where it is defined is a check nothing proves is wired.
 */

const WS = newUlid();
const TICKET = newUlid();
const CLAIMANT = newUlid();
const SERVER_ACTOR = newUlid();

function refusedClaim(overrides: Partial<SubmittedEvent> = {}): SubmittedEvent {
  return {
    id: newUlid(),
    workspaceId: WS,
    entity: { kind: 'ticket', id: TICKET },
    type: 'ticket.transitioned',
    version: 1,
    payload: { toStateId: 'done' },
    actorId: CLAIMANT,
    origin: 'mobile',
    clientTime: '2026-08-20T09:00:00.000Z',
    ...overrides,
  };
}

/** A contest built by hand, so a test can make the embedded claim disagree. */
function contestOf(original: SubmittedEvent, outer: Partial<SubmittedEvent> = {}): SubmittedEvent {
  return {
    id: newUlid(),
    workspaceId: WS,
    entity: { kind: 'ticket', id: TICKET },
    type: 'claim.contested',
    version: 1,
    payload: { originalEvent: original, rule: 'workflow.transition-not-allowed', reason: 'refused' },
    actorId: SERVER_ACTOR,
    origin: 'server',
    clientTime: '2026-08-20T09:00:01.000Z',
    ...outer,
  };
}

describe('checkContestCoherence — what it binds', () => {
  it('accepts a contest whose embedded claim names the same workspace, kind and ticket', () => {
    // The non-vacuity control for every refusal below: if this went red, the
    // three cases that follow would be passing because everything is refused.
    expect(checkContestCoherence(contestOf(refusedClaim()))).toBeNull();
  });

  it('refuses an embedded claim naming a DIFFERENT WORKSPACE — the cross-workspace forgery', () => {
    // Mutation that reddens it: delete the `original.workspaceId !==
    // env.workspaceId` comparison in checkContestCoherence. Nothing else does:
    // the outer envelope here is entirely honest, and the ticket ids agree.
    const forged = contestOf(refusedClaim({ workspaceId: newUlid() }));
    expect(checkContestCoherence(forged)).toEqual({
      refused: true,
      rule: CONTEST_COHERENCE_RULE,
      reason: CONTEST_WORKSPACE_MISMATCH_REASON,
    });
  });

  it('refuses an embedded claim naming a DIFFERENT TICKET in the same workspace', () => {
    // Mutation that reddens it: delete the `original.entity.id !==
    // env.entity.id` comparison. Asserting the RULE alone would not discriminate
    // this from the workspace case — one id covers the family (ruling P20) — so
    // the reason is asserted too, and it is a different sentence.
    const forged = contestOf(refusedClaim({ entity: { kind: 'ticket', id: newUlid() } }));
    expect(checkContestCoherence(forged)).toEqual({
      refused: true,
      rule: CONTEST_COHERENCE_RULE,
      reason: CONTEST_TICKET_MISMATCH_REASON,
    });
  });

  it('refuses an embedded claim about a different ENTITY KIND, even at the same id', () => {
    // Mutation that reddens it: delete the `original.entity.kind !==
    // env.entity.kind` comparison. The id comparison cannot catch this — the ids
    // are equal — which is why kind is a separate binding rather than folded in.
    const forged = contestOf(refusedClaim({ entity: { kind: 'workflow', id: TICKET } }));
    expect(checkContestCoherence(forged)).toEqual({
      refused: true,
      rule: CONTEST_COHERENCE_RULE,
      reason: CONTEST_ENTITY_KIND_MISMATCH_REASON,
    });
  });

  it('the workspace comparison fires FIRST, so a doubly-forged contest names the wider fault', () => {
    const forged = contestOf(
      refusedClaim({ workspaceId: newUlid(), entity: { kind: 'ticket', id: newUlid() } }),
    );
    expect(checkContestCoherence(forged)?.reason).toBe(CONTEST_WORKSPACE_MISMATCH_REASON);
  });
});

describe('checkContestCoherence — what it deliberately does NOT bind', () => {
  it('does not require the claimant to be the contest actor — claimant_id depends on their differing', () => {
    // Mutation that would redden it: adding an `original.actorId !== env.actorId`
    // comparison. That mutation is the plausible one, which is why this case
    // exists: it would empty My Work for everyone, since proj_contested reads
    // the CLAIMANT off the embedded claim.
    expect(checkContestCoherence(contestOf(refusedClaim({ actorId: newUlid() })))).toBeNull();
  });

  it('does not require the claim to share the contest envelope-origin — the claim is a client event', () => {
    // A contest is 'server' by contest.server-only; the claim it embeds is
    // 'web' | 'mobile' | 'desktop'. Binding the two would refuse every real
    // contest. (envelope-origin, the provenance enum — not the HTTP Origin
    // header.)
    expect(checkContestCoherence(contestOf(refusedClaim({ origin: 'desktop' })))).toBeNull();
    expect(checkContestCoherence(contestOf(refusedClaim({ origin: 'web' })))).toBeNull();
  });

  it('does not require the claim clientTime to match the contest clientTime', () => {
    const original = refusedClaim({ clientTime: '2026-08-19T04:00:00.000Z' });
    expect(checkContestCoherence(contestOf(original))).toBeNull();
  });

  it('answers null for every event that is not a claim.contested', () => {
    expect(checkContestCoherence(refusedClaim())).toBeNull();
  });

  it('answers null rather than throwing on a payload that is not a contest payload at all', () => {
    // Shape is the vocabulary door's refusal, not this one's — parseEvent has
    // already rejected this before ingest calls the check. A throw here would
    // become an opaque 500 in place of a truthful malformed-payload answer.
    const notAContest = contestOf(refusedClaim(), { payload: { nothing: 'like a contest' } });
    expect(checkContestCoherence(notAContest)).toBeNull();
  });
});

describe('buildContestedClaim — coherence by construction', () => {
  const at = () => new Date('2026-08-20T10:00:00.000Z');

  it('derives the workspace and entity from the refused claim, so they cannot disagree', () => {
    const original = refusedClaim();
    const contest = buildContestedClaim({
      originalEvent: original,
      rule: 'workflow.transition-not-allowed',
      reason: 'That move is not allowed from here.',
      actorId: SERVER_ACTOR,
      now: at,
    });
    expect(contest.workspaceId).toBe(original.workspaceId);
    expect(contest.entity).toEqual(original.entity);
    expect(contest.type).toBe('claim.contested');
    // envelope-origin 'server': contest.server-only requires it, and this is the
    // path entitled to it. Mutation that reddens it: change the literal to 'web'
    // — the contest would then be refused by the engine it is built for.
    expect(contest.origin).toBe('server');
    expect(contest.actorId).toBe(SERVER_ACTOR);
    expect(contest.clientTime).toBe('2026-08-20T10:00:00.000Z');
  });

  it('what it builds passes the check it exists to make unnecessary — for an original in ANY workspace', () => {
    // The property, not one example: whatever workspace and ticket the refused
    // claim names, the contest built from it is coherent. Mutation that reddens
    // it: hard-code either field in buildContestedClaim instead of reading it
    // off originalEvent.
    for (const original of [
      refusedClaim(),
      refusedClaim({ workspaceId: newUlid(), entity: { kind: 'ticket', id: newUlid() } }),
      refusedClaim({ entity: { kind: 'ticket', id: newUlid() } }),
    ]) {
      const contest = buildContestedClaim({
        originalEvent: original,
        rule: 'r',
        reason: 'why',
        actorId: SERVER_ACTOR,
        now: at,
      });
      expect(checkContestCoherence(contest)).toBeNull();
    }
  });

  it('carries the refused claim WHOLE — the provenance floor the banner reads', () => {
    const original = refusedClaim();
    const contest = buildContestedClaim({
      originalEvent: original,
      rule: 'restrict-to',
      reason: 'Only the assignee may do this.',
      actorId: SERVER_ACTOR,
      now: at,
    });
    expect(contest.payload).toEqual({
      originalEvent: original,
      rule: 'restrict-to',
      reason: 'Only the assignee may do this.',
    });
  });
});
