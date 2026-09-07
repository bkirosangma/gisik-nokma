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
  /**
   * 12.45 — a contest whose embedded claim names the same workspace, entity kind and ticket as the outer envelope is accepted (checkContestCoherence returns null), the non-vacuity control the refusals below depend on.
   */
  it('accepts a contest whose embedded claim names the same workspace, kind and ticket', () => {
    // The non-vacuity control for every refusal below: if this went red, the
    // three cases that follow would be passing because everything is refused.
    expect(checkContestCoherence(contestOf(refusedClaim()))).toBeNull();
  });

  /**
   * 12.46 — a contest whose embedded claim names a different workspace than the outer envelope is refused with CONTEST_COHERENCE_RULE and CONTEST_WORKSPACE_MISMATCH_REASON, while the ticket id and everything else stays honest.
   */
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

  /**
   * 12.47 — a contest whose embedded claim names a different ticket in the same workspace is refused with the same rule id but a distinct CONTEST_TICKET_MISMATCH_REASON, so the reason (not the rule) is what discriminates the two forgeries.
   */
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

  /**
   * 12.48 — a contest whose embedded claim names a different entity kind at the SAME id (kind 'workflow' vs 'ticket', same TICKET id) is refused with CONTEST_ENTITY_KIND_MISMATCH_REASON, since the id comparison alone cannot catch a kind mismatch.
   */
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

  /**
   * 12.49 — a contest whose embedded claim is forged on both workspace AND ticket names the WORKSPACE mismatch reason, proving the workspace comparison is evaluated before the ticket comparison.
   */
  it('the workspace comparison fires FIRST, so a doubly-forged contest names the wider fault', () => {
    const forged = contestOf(
      refusedClaim({ workspaceId: newUlid(), entity: { kind: 'ticket', id: newUlid() } }),
    );
    expect(checkContestCoherence(forged)?.reason).toBe(CONTEST_WORKSPACE_MISMATCH_REASON);
  });
});

describe('checkContestCoherence — what it deliberately does NOT bind', () => {
  /**
   * 12.50 — checkContestCoherence does not require the embedded claim's actorId to equal the contest's own actorId; a contest whose claimant differs from the contest actor still passes, since proj_contested reads the claimant off the embedded claim.
   */
  it('does not require the claimant to be the contest actor — claimant_id depends on their differing', () => {
    // Mutation that would redden it: adding an `original.actorId !== env.actorId`
    // comparison. That mutation is the plausible one, which is why this case
    // exists: it would empty My Work for everyone, since proj_contested reads
    // the CLAIMANT off the embedded claim.
    expect(checkContestCoherence(contestOf(refusedClaim({ actorId: newUlid() })))).toBeNull();
  });

  /**
   * 12.51 — checkContestCoherence does not bind envelope-origin between the contest ('server') and its embedded claim (tested here with 'desktop' and 'web'), since binding the two would refuse every legitimate contest.
   */
  it('does not require the claim to share the contest envelope-origin — the claim is a client event', () => {
    // A contest is 'server' by contest.server-only; the claim it embeds is
    // 'web' | 'mobile' | 'desktop'. Binding the two would refuse every real
    // contest. (envelope-origin, the provenance enum — not the HTTP Origin
    // header.)
    expect(checkContestCoherence(contestOf(refusedClaim({ origin: 'desktop' })))).toBeNull();
    expect(checkContestCoherence(contestOf(refusedClaim({ origin: 'web' })))).toBeNull();
  });

  /**
   * 12.52 — checkContestCoherence does not bind clientTime between claim and contest (this test, mismatched clientTime still passes null); the row's second clause — it answers null for any event that is not a claim.contested — is proven by the adjacent test 'answers null for every event that is not a claim.contested' at line 130-132 of the same file, not this one.
   */
  it('does not require the claim clientTime to match the contest clientTime', () => {
    const original = refusedClaim({ clientTime: '2026-08-19T04:00:00.000Z' });
    expect(checkContestCoherence(contestOf(original))).toBeNull();
  });

  it('answers null for every event that is not a claim.contested', () => {
    expect(checkContestCoherence(refusedClaim())).toBeNull();
  });

  /**
   * 12.53 — a claim.contested event whose payload is not shaped like a contest at all (payload: { nothing: 'like a contest' }) answers null rather than throwing, since shape validation is the vocabulary door's job and a throw here would surface as an opaque 500.
   */
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

  /**
   * 12.59 — buildContestedClaim derives workspaceId and entity directly off the refused originalEvent (so they cannot disagree by construction), sets envelope-origin 'server', and stamps the calling actorId — coherence here is structural, not separately checked.
   */
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

  /**
   * 12.60 — for a loop of three refused claims spanning different workspace/ticket combinations, every contest built by buildContestedClaim passes checkContestCoherence — the property (any workspace or ticket), not a single example.
   */
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
