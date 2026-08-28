import { describe, expect, it } from 'vitest';
import { isUlid, parseEvent } from '../src/index.js';
import {
  CONTEST_EVENT_TYPES,
  claimContestedPayloadSchema,
  claimContestedResolvedPayloadSchema,
  plainTextToDoc,
  renderContestedClaimText,
} from '../src/events/contest-events.js';
import { newSubmittedEvent } from '../src/submit.js';
import { formatIstInstant } from '../src/clock-skew.js';
import { makeEnvelope } from '../src/testing.js';

const TICKET = '01J9GTKA000000000000000000';
const WORKFLOW = '01J9GWKF000000000000000000';
// `submittedEventSchema` requires ULIDs of `workspaceId` and `actorId`, so the
// original claim a contest carries must use real ones — a readable placeholder
// like 'user_b' is refused as a malformed envelope before any payload schema is
// consulted, and the round-trip below would then pass or fail for a reason that
// has nothing to do with contests. These are `makeEnvelope`'s own defaults, so
// the contested claim and the envelope carrying it agree about who and where.
const WORKSPACE = '01J9GWS0000000000000000000';
const ACTOR = '01J9GACT000000000000000000';

function original() {
  return newSubmittedEvent({
    workspaceId: WORKSPACE,
    entity: { kind: 'ticket', id: TICKET },
    type: 'ticket.transitioned',
    payload: { to: 'done' },
    actorId: ACTOR,
    origin: 'mobile',
  });
}

describe('claim.contested', () => {
  it('round-trips through parseEvent with the registered schema', () => {
    const payload = { originalEvent: original(), rule: 'restrict-to', reason: 'Only the assignee may do this.' };
    const env = makeEnvelope({ type: 'claim.contested', entity: { kind: 'ticket', id: TICKET }, payload });
    const parsed = parseEvent(env);
    expect(parsed.ok).toBe(true);
  });

  it('refuses a payload without the original claim — a contest must carry what was claimed', () => {
    expect(() => claimContestedPayloadSchema.parse({ rule: 'restrict-to', reason: 'x' })).toThrow();
  });

  it('is refused against a non-ticket entity — the contest is history ON the ticket it touched', () => {
    // The registration declares entityKind: 'ticket'. Without it parseEvent
    // short-circuits its type-kind check and this envelope is ADMITTED — and
    // the ledger is append-only by trigger, so a contest filed against a
    // workflow could never be corrected. The payload here is valid, so the
    // refusal is attributable to the entity kind and to nothing else.
    const payload = { originalEvent: original(), rule: 'restrict-to', reason: 'Only the assignee may do this.' };
    const env = makeEnvelope({ type: 'claim.contested', entity: { kind: 'workflow', id: WORKFLOW }, payload });
    const parsed = parseEvent(env);
    if (parsed.ok) throw new Error('expected parseEvent to refuse a claim.contested filed against a workflow');
    expect(parsed.code).toBe('entity-kind-mismatch');
    expect(parsed.message).toContain('does not point at a ticket');
  });

  it('a contest without the refused claim\'s payload is refused at the door', () => {
    // `submittedEventSchema.payload` was `z.unknown()`, and zod makes an unknown
    // key OPTIONAL — so this envelope was ADMITTED, and
    // `renderContestedClaimText` wrote the literal string
    // 'ticket.transitioned undefined' into a comment body that an append-only
    // table then keeps forever. The contest would record that something was
    // claimed, not what.
    //
    // The door refuses it now (`requiredPayload`, Plan 4's envelope amendment),
    // so this test no longer pins a local guard — it pins the GUARANTEE, across
    // a package boundary. Verified by neutering the door's refine: this test is
    // what goes red. Keep it for that reason; a rule with one origin still
    // needs a witness at the level that depends on it.
    const { payload: _dropped, ...withoutPayload } = original();
    const contest = (originalEvent: unknown) =>
      claimContestedPayloadSchema.safeParse({ originalEvent, rule: 'restrict-to', reason: 'x' });

    expect(contest(withoutPayload).success).toBe(false);
    expect(contest({ ...original(), payload: undefined }).success).toBe(false);
    // An EMPTY claim is still a claim; an ABSENT one is not.
    expect(contest({ ...original(), payload: null }).success).toBe(true);
    expect(contest({ ...original(), payload: {} }).success).toBe(true);
  });

  it('is a registered, closed-vocabulary type', () => {
    expect(CONTEST_EVENT_TYPES).toEqual(['claim.contested', 'claim.contested_resolved']);
  });
});

describe('claim.contested_resolved', () => {
  const base = { contestedEventId: '01J9GCON000000000000000000' };

  it('redone requires the replacement event id — the redo is linked, never implied', () => {
    expect(() => claimContestedResolvedPayloadSchema.parse({ ...base, resolution: 'redone' })).toThrow();
    expect(
      claimContestedResolvedPayloadSchema.parse({
        ...base,
        resolution: 'redone',
        replacementEventId: '01J9GRPL000000000000000000',
      }).replacementEventId,
    ).toBe('01J9GRPL000000000000000000');
  });

  it('converted-to-comment requires the comment event id', () => {
    expect(() => claimContestedResolvedPayloadSchema.parse({ ...base, resolution: 'converted-to-comment' })).toThrow();
    expect(
      claimContestedResolvedPayloadSchema.parse({
        ...base,
        resolution: 'converted-to-comment',
        commentEventId: '01J9GCMT000000000000000000',
      }).commentEventId,
    ).toBe('01J9GCMT000000000000000000');
  });

  it('discarded needs nothing extra — but records who discarded via the envelope actor', () => {
    expect(claimContestedResolvedPayloadSchema.parse({ ...base, resolution: 'discarded', note: 'stale' }).note).toBe('stale');
  });
});

describe('renderContestedClaimText', () => {
  it('names actor, claim, time, and the refusing rule — the text a comment conversion carries', () => {
    const o = original();
    const text = renderContestedClaimText({ originalEvent: o, rule: 'restrict-to', reason: 'Only the assignee may do this.' });
    expect(text).toContain(ACTOR);
    expect(text).toContain('ticket.transitioned');
    expect(text).toContain(formatIstInstant(o.clientTime));
    expect(text).toContain('restrict-to');
    expect(text).toContain('Only the assignee may do this.');
    // The WHAT, and the reason this assertion exists: the banner pinned five of
    // its six clauses and skipped exactly the one the payload-required rule is
    // for. Deleting the payload interpolation from the template left the whole
    // suite green, so the clause the ledger keeps forever was the only
    // unwitnessed one. A contest that records THAT something was claimed
    // without WHAT is the defect three separate comments name as the point.
    expect(text).toContain(JSON.stringify(o.payload));
  });

  it('planted defect: the time is India time, not the raw instant — and it rolls at IST midnight', () => {
    // The claim was made at 00:00 IST on 21 Aug, which is 18:30Z on the 20th.
    // A banner printing the ISO string would tell the claimant their claim was
    // made on the 20th, one IST day off from the date the same claim wears on
    // the calendar, in its ticket history, and in the inbox.
    const o = newSubmittedEvent({
      workspaceId: WORKSPACE,
      entity: { kind: 'ticket', id: TICKET },
      type: 'ticket.transitioned',
      payload: { to: 'done' },
      actorId: ACTOR,
      origin: 'mobile',
      now: () => new Date('2026-08-20T18:30:00.000Z'),
    });
    const text = renderContestedClaimText({ originalEvent: o, rule: 'restrict-to', reason: 'Only the assignee may do this.' });
    expect(text).toContain('21 Aug 2026, 00:00 IST');
    expect(text).not.toContain('2026-08-20T18:30:00.000Z');
  });
});

describe('plainTextToDoc', () => {
  it('produces a minimal ProseMirror doc', () => {
    expect(plainTextToDoc('hello')).toEqual({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hello' }] }],
    });
  });

  it('empty text yields an empty paragraph (a text node may not be empty)', () => {
    expect(plainTextToDoc('')).toEqual({ type: 'doc', content: [{ type: 'paragraph' }] });
  });
});

describe('newSubmittedEvent', () => {
  it('fills id, version and clientTime; everything else is the caller claim', () => {
    const e = original();
    // `isUlid`, not a hand-written 26-char class: the approximation this line
    // used to carry omitted the leading [0-7] that `ids.ts:9`'s ULID_REGEX
    // requires, so it pinned "looks ULID-ish" rather than "passes the envelope
    // door" — and an id the test accepts while the door refuses it was
    // expressible. A second definition of a format drifts from the first in
    // silence; the same disease as two copies of one formatter.
    expect(isUlid(e.id)).toBe(true);
    expect(e.version).toBe(1);
    expect(e.origin).toBe('mobile');
    expect(new Date(e.clientTime).toString()).not.toBe('Invalid Date');
  });
});
