import { describe, expect, it } from 'vitest';
import { makeEnvelope, type EventEnvelope } from '@gisik-nokma/domain';
import { evaluateEvent } from '../src/evaluate.js';
import { buildMemoryContext } from '../src/memory-context.js';
import { REFUSAL_RULES } from '../src/refusal-rules.js';
import {
  AUTHOR,
  OTHER,
  OTHER_WS,
  PROJECT_B,
  STORY,
  TASK,
  WF,
  WS,
  created,
  createdIn,
  draftCreated,
  onTicket,
  typeDefined,
} from '../src/checks/test-support.js';

// Real ULIDs (Crockford base32 has no I, L, O or U): `targetId` and `from` are `ulidString`, so an id outside
// `ULID_REGEX` makes every verdict below `malformed-payload` whatever the code does.
const S = '01J9GMKS000000000000000000'; // published, "Ice maker"
const S2 = '01J9GMKT000000000000000000'; // published
const D = '01J9GMKD000000000000000000'; // AUTHOR's draft, "Chiller"
const D2 = '01J9GMKE000000000000000000'; // AUTHOR's second draft
const E = '01J9GMKF000000000000000000'; // OTHER's draft
const NEVER = '01J9GMKZ000000000000000000'; // no such ticket

const titled = (id: string, title: string) => onTicket(id, 'ticket.field_set', { fieldId: 'title', value: title });
const world = (...after: EventEnvelope[]) =>
  buildMemoryContext(
    [WF],
    [
      typeDefined(STORY),
      typeDefined(TASK),
      created(S, 'task', null),
      created(S2, 'task', null),
      draftCreated(D, 'task', null),
      draftCreated(D2, 'task', null),
      draftCreated(E, 'task', null, OTHER),
      titled(S, 'Ice maker'),
      titled(D, 'Chiller'),
      ...after,
    ],
  );
const verdict = (env: EventEnvelope, ...after: EventEnvelope[]) => evaluateEvent(env, world(...after));
const plain = (id: string, targetId: string, kind = 'blocks', type = 'ticket.link_added') =>
  onTicket(id, type, { kind, targetId });
const fromForm = (source: string, kind = 'blocks', type = 'ticket.link_added') =>
  onTicket(D, type, { kind, targetId: D, from: source });

const OK = { refused: false };
const FORM = { refused: true, rule: 'draft.link-form', reason: "Link to a draft from the draft's side" };
const BETWEEN = { refused: true, rule: 'draft.link-form', reason: "File a link between two drafts from the source draft's side" };
const UNKNOWN = { refused: true, rule: 'link.unknown-target', reason: 'The other ticket does not exist in this workspace.' };
const DELETED = { refused: true, rule: 'link.target-deleted', reason: 'The other ticket is deleted. Restore it, or pick another ticket.' };
const ABSENT = { refused: true, rule: 'link.absent', reason: 'This ticket holds no such link, so there is nothing to remove.' };
const MALFORMED = {
  refused: true,
  rule: REFUSAL_RULES.malformedPayload,
  reason: 'This ticket.link_added event\'s payload is malformed: a link with "from" is filed on the draft it points at, so targetId must be that draft.',
};

describe('28.111 a plain link naming a draft', () => {
  it('is draft.link-form on a published ticket; the no-oracle answers are one sentence; CONTROL: a published target is accepted', async () => {
    expect(await verdict(plain(S, D))).toEqual(FORM);
    expect(await verdict(plain(S, S2))).toEqual(OK); // CONTROL
    expect(await verdict(plain(D, S2))).toEqual(OK); // a draft linking out
    expect(await verdict(plain(D, D2))).toEqual(OK); // two drafts: filed on the source's stream, plain
    expect(await verdict(plain(S, E))).toEqual(UNKNOWN); // another person's draft
    expect(await verdict(plain(S, NEVER))).toEqual(UNKNOWN); // an id that is nothing: identical
    expect(await verdict(plain(S, D), onTicket(D, 'ticket.discarded', {}))).toEqual(UNKNOWN); // discarded
    expect(await verdict(plain(D, E))).toEqual(UNKNOWN);
    expect(await verdict(plain(S, D, 'blocks', 'ticket.link_removed'))).toEqual(ABSENT); // a removal never says "draft"
    // p11 N6 (28.111): the stream's own ticket is unknown (the live and draft gates both ACCEPT a null ticket)
    expect(await verdict(plain(NEVER, S))).toEqual({
      refused: true,
      rule: REFUSAL_RULES.unknownTicket,
      reason: `This event links ticket ${NEVER}, but no such ticket is known.`,
    });
  });
});

describe('28.112 the from form', () => {
  it('is filed on the draft the link points at; every other shape is refused in its own words', async () => {
    expect(await verdict(fromForm(S))).toEqual(OK);
    expect(await verdict(fromForm(NEVER))).toEqual(UNKNOWN);
    expect(await verdict(fromForm(E))).toEqual(UNKNOWN);
    expect(await verdict(fromForm(D2))).toEqual(BETWEEN);
    expect(await verdict(fromForm(S2), onTicket(S2, 'ticket.deleted', {}))).toEqual(DELETED);
    // structure: `from` on a published stream, and a target that is not the stream's own draft
    expect(await verdict(onTicket(S, 'ticket.link_added', { kind: 'blocks', targetId: S, from: S2 }))).toEqual(MALFORMED);
    expect(await verdict(onTicket(D, 'ticket.link_added', { kind: 'blocks', targetId: S2, from: S }))).toEqual(MALFORMED);

    // p11 N4 (28.112): a link event that does not point at a ticket
    expect(
      await verdict(
        makeEnvelope({
          type: 'ticket.link_added',
          entity: { kind: 'project', id: D },
          workspaceId: WS,
          actorId: AUTHOR,
          payload: { kind: 'blocks', targetId: D, from: S },
        }),
      ),
    ).toEqual({ refused: true, rule: REFUSAL_RULES.malformedPayload, reason: 'This ticket.link_added event does not point at a ticket; it points at a project.' });
    // p11 N5 (28.112): a payload the schema refuses (`from` equal to `targetId`) is malformed, through the engine
    const same = await verdict(onTicket(D, 'ticket.link_added', { kind: 'blocks', targetId: D, from: D }));
    expect(same).toEqual({
      refused: true,
      rule: REFUSAL_RULES.malformedPayload,
      reason: 'This ticket.link_added event\'s payload is malformed: a link\'s "from" must be a different ticket from its target',
    });
    // p11 N8 (28.112): a real ticket in ANOTHER workspace as `from` reads as unknown (rule 2's one sentence)
    const FOREIGN = '01J9GMKG000000000000000000';
    expect(await verdict(fromForm(FOREIGN), createdIn(OTHER_WS, FOREIGN, 'task', PROJECT_B))).toEqual(UNKNOWN);
  });
});

describe('28.113 the pair rules over both streams', () => {
  it('judge (source, target) whichever stream holds the entry', async () => {
    const storedFromS = fromForm(S); // S blocks D, stored on D
    expect(await verdict(fromForm(S), storedFromS)).toEqual({
      refused: true, rule: 'link.duplicate', reason: '"Ice maker" already blocks "Chiller".',
    });
    expect(await verdict(plain(D, S), storedFromS)).toEqual({
      refused: true, rule: 'link.reverse', reason: '"Ice maker" already blocks "Chiller".',
    });
    expect(await verdict(plain(D, S, 'relates'), storedFromS)).toEqual(OK); // another kind on the pair

    const storedPlain = plain(D, S); // D blocks S, stored on D
    expect(await verdict(fromForm(S), storedPlain)).toEqual({
      refused: true, rule: 'link.reverse', reason: '"Chiller" already blocks "Ice maker".',
    });
    expect(await verdict(fromForm(S, 'relates'), plain(D, S, 'relates'))).toEqual({
      refused: true, rule: 'link.duplicate', reason: '"Chiller" already relates to "Ice maker".',
    });

    // removals: from removal needs a from entry; a plain removal naming the draft itself does not match one
    expect(await verdict(fromForm(S, 'blocks', 'ticket.link_removed'), storedFromS)).toEqual(OK);
    expect(await verdict(fromForm(S, 'blocks', 'ticket.link_removed'))).toEqual(ABSENT);
    expect(await verdict(plain(D, D, 'blocks', 'ticket.link_removed'), storedFromS)).toEqual(ABSENT);
    // p11 N7 (28.113): only S's blocks entry is stored on D (storedFromS); the CONTROL is the accepted removal above.
    expect(await verdict(fromForm(S2, 'blocks', 'ticket.link_removed'), storedFromS)).toEqual(ABSENT); // another source
    expect(await verdict(fromForm(S, 'relates', 'ticket.link_removed'), storedFromS)).toEqual(ABSENT); // another kind

    // p11 N2 (28.113): D holds S2's from entry (S2 blocks D). S blocking D is a different pair.
    const storedFromS2 = fromForm(S2);
    expect(await verdict(fromForm(S), storedFromS2)).toEqual(OK);
    // CONTROL: the same source again is the duplicate, so only `from` differs between the two legs
    expect(await verdict(fromForm(S2), storedFromS2)).toMatchObject({ refused: true, rule: 'link.duplicate' });

    // p11 N3 (28.113): D blocks S2 (plain, on D). Removing "D blocks S" is absent.
    const storedDS2 = plain(D, S2);
    expect(await verdict(plain(D, S, 'blocks', 'ticket.link_removed'), storedDS2)).toEqual(ABSENT);
    expect(await verdict(plain(D, S2, 'blocks', 'ticket.link_removed'), storedDS2)).toEqual(OK); // CONTROL: only targetId differs
  });
});
