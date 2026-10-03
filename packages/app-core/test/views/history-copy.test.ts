import { describe, expect, it } from 'vitest';
import { CONTEST_EVENT_TYPES, TICKET_EVENT_TYPES } from '@gisik-nokma/domain';
import type { TicketHistoryEvent } from '../../src/view-types.js';
import { describeEvent } from '../../src/views/history-copy.js';

/**
 * 3.183 / E5-8 — THE CENSUS: every event type that reaches the History tab is
 * NARRATED, and the list is the DOMAIN's rather than one retyped here.
 *
 * E5-8's own words for the property are *"the export narrates every row"*. The
 * first pass at `describeEvent` was a hand-written `switch`, and a hand-written
 * `switch` looks complete from the inside — it was in fact missing TWO of the
 * eighteen types registered against entity kind `ticket` (`attachment.added` and
 * `claim.contested_resolved`), both of which fell through to the wire name, which
 * is the exact defect the ruling is about, surviving in two rows.
 *
 * So the universe is read off the domain's own lists and never typed out below:
 * a type ADDED to either list reddens this case the day it lands, and a type
 * REMOVED shrinks the union, which its own assertion catches. That is the
 * difference between a census and a restatement.
 *
 * ## What this case cannot see, named rather than implied
 *
 * The two exported lists do not cover the whole entity-kind-`ticket` set:
 * `vocabulary.ts` registers 24 non-purge types against a ticket (27 name
 * `ticket`; the three `purge.*` are the exemption). This census covers 22 of
 * them: `TICKET_EVENT_TYPES` (19) ∪ `CONTEST_EVENT_TYPES` (2) ∪ {`visibility.set`},
 * and `visibility.set`, in NEITHER list, is the one member spelled by hand here.
 * The other two, `comment.edited` and `comment.deleted`, are registered against
 * a ticket and sit in neither list either; they are outside this census and are
 * narrated and pinned by case 26.117 below. **A NEW event type registered against
 * entity kind `ticket` and added to neither exported list would not be seen by
 * this case, and the blind spot is live today with those two members.** It is
 * stated rather than papered over. The count assertion below does NOT catch it:
 * the pinned number is the size of the derived union, so a type added to neither
 * list leaves it unchanged. It catches only a change to the exported lists
 * themselves, which sends the reader back to `vocabulary.ts`.
 */
const ENTITY_KIND_TICKET_UNIVERSE = [
  ...TICKET_EVENT_TYPES,
  ...CONTEST_EVENT_TYPES,
  // The one member in neither exported list — see the docblock.
  'visibility.set',
] as const;

/**
 * The size of the union above on 2026-10-03 (18 on 2026-09-21; the typed-links pair made it 20; the drafts pair, T1, made it 22). Pinned as a NUMBER so a
 * change to the domain's lists fails loudly here rather than quietly shrinking
 * what this census covers: the failure message says to re-read the
 * registrations, which is the actual remedy. It is not a count of the
 * registrations (24), as the docblock above says.
 */
const REGISTRATIONS_ON_2026_10_03 = 22;

/**
 * ONE VALID PAYLOAD PER TYPE, and the table is what makes this a census of
 * SENTENCES rather than a census of empty payloads.
 *
 * ⚠ **The first version of this case passed `{}` for every type and was
 * therefore measuring the wrong thing.** Eleven of the eighteen "fell through",
 * because a `describeEvent` that reads its payload defensively returns the wire
 * name when the payload is empty — which is correct behaviour, and which the
 * empty-payload version could not tell apart from a type that has no sentence
 * at all. A control that cannot distinguish the two cases it is sitting between
 * is not a weaker control, it is a different measurement. So each type gets a
 * payload shaped as the domain declares it, and the fall-through then means
 * exactly one thing: **this type has no sentence.**
 *
 * A type ADDED to the domain's lists has no entry here, gets `{}`, falls
 * through, and reddens the case below — which is the intended behaviour and
 * the reason the two assertions are separate: the first says which types have
 * no fixture, the second which have no sentence, and the remedy differs.
 */
const VALID_PAYLOAD: Record<string, unknown> = {
  'ticket.created': { typeId: 'task', projectId: 'prj', parentId: null, title: 'HSN codes' },
  'ticket.transitioned': { to: 'doing' },
  'ticket.assigned': { assigneeId: 'user_anselma' },
  'ticket.collaborator_added': { userId: 'user_anselma' },
  'ticket.collaborator_removed': { userId: 'user_anselma' },
  // ⚠ `P1`, not the `'high'` this fixture carried until 2026-09-22, and the
  // value is corrected rather than the field id because of what this fixture IS:
  // its own contract, one paragraph up, is "a payload shaped as the domain
  // declares it". `priority` is a BUILT-IN since spec 2026-09-22 and its value
  // set is closed, so `{ fieldId: 'priority', value: 'high' }` is a payload the
  // engine REFUSES (`field.type-mismatch` — "Priority needs one of P1, P2 or
  // P3"); a census whose sample of a type is an event that cannot be written is
  // measuring a world the product no longer has. The custom-field case this
  // value used to stand for is not lost — `fields`-axis coverage lives in
  // `test/filter/list-filter.test.ts`, which reads `severity` for exactly this
  // reason.
  'ticket.field_set': { fieldId: 'priority', value: 'P1' },
  'ticket.reparented': { newParentId: null },
  'ticket.workflow_rebound': { toWorkflowId: 'wf-1', toStateId: 'doing' },
  'ticket.closed': {},
  'ticket.reopened': {},
  'ticket.ranked': { rank: 'a1' },
  'ticket.deleted': {},
  'ticket.restored': {},
  'ticket.link_added': { kind: 'blocks', targetId: '01J9GTKB000000000000000000' },
  'ticket.link_removed': { kind: 'relates', targetId: '01J9GTKB000000000000000000' },
  'ticket.published': { projectId: '01J9GPRJ000000000000000000' },
  'ticket.discarded': {},
  'comment.added': { body: {} },
  'attachment.added': { kind: 'upload', attachmentId: 'a1', filename: 'gst-return.pdf' },
  'claim.contested': { originalEvent: {}, rule: 'r', reason: 'why' },
  'claim.contested_resolved': { resolution: 'redone' },
  'visibility.set': { ticketId: 't1', mode: 'project' },
};

/** One event of `type`, carrying the fixture payload above when there is one. */
function eventOf(type: string): TicketHistoryEvent {
  return {
    id: `e-${type}`,
    type,
    version: 1,
    payload: VALID_PAYLOAD[type] ?? {},
    actorId: 'user_anselma',
    origin: 'web',
    clientTime: '2026-08-19T09:59:00.000Z',
    serverTime: '2026-08-19T10:00:00.000Z',
    seq: 1,
  };
}

describe('3.183 history copy — the census', () => {
  /**
   * The count first, so the blind spot above is loud: if this reddens, the
   * domain's registrations have moved and BOTH lists need re-reading.
   */
  it('CONTROL — the universe is the size the registrations actually are', () => {
    expect(
      TICKET_EVENT_TYPES.length,
      'TICKET_EVENT_TYPES changed shape: re-read packages/domain/src/vocabulary.ts and re-derive the universe',
    ).toBe(19);
    expect(CONTEST_EVENT_TYPES.length).toBe(2);
    expect(new Set(ENTITY_KIND_TICKET_UNIVERSE).size).toBe(REGISTRATIONS_ON_2026_10_03);
  });

  /**
   * The fixtures themselves, asserted before they are relied on — a type with
   * no payload would fall through for a reason that has nothing to do with the
   * sentence, and reporting it as "no sentence" is the misdiagnosis this whole
   * file was rewritten to stop making.
   */
  it('CONTROL — every type in the universe has a payload fixture', () => {
    const missing = ENTITY_KIND_TICKET_UNIVERSE.filter((type) => VALID_PAYLOAD[type] === undefined);
    expect(missing, `no payload fixture for: ${missing.join(', ')}`).toEqual([]);
  });

  /**
   * THE PROPERTY. `describeEvent` returns `event.type` for a type it does not
   * narrate, so "is this type narrated?" is exactly
   * `describeEvent(...) !== type` — and asserting it over the domain's own list
   * is what turns a hand-written switch into something that cannot silently
   * fall behind.
   */
  it('every type registered against a ticket is narrated — not one falls through to the wire name', () => {
    const falling = ENTITY_KIND_TICKET_UNIVERSE.filter((type) => describeEvent(eventOf(type)) === type);
    expect(falling, `these reach the History tab as raw slugs: ${falling.join(', ')}`).toEqual([]);
  });

  /**
   * And the fall-through is still THERE, on purpose — the census above must not
   * be satisfiable by removing it. A future event type this file has not learned
   * renders as the wire name, which is honest; a guessed sentence about a claim
   * nobody described would not be.
   */
  it('CONTROL — an unregistered type still falls back to the wire name', () => {
    expect(describeEvent({ ...eventOf('ticket.closed'), type: 'ticket.something_this_build_has_never_seen' })).toBe(
      'ticket.something_this_build_has_never_seen',
    );
  });
});

/**
 * 3.184 / E5-8 — THE TWO THE FIRST PASS MISSED, read as sentences.
 *
 * The census above proves they are narrated; this proves they are narrated
 * CORRECTLY, because `!== type` would be satisfied by any sentence at all and
 * "Attached " with nothing after it would pass it.
 *
 * `attachment.added` is a discriminated union of exactly two kinds and the
 * sentence names the FILE — `filename` for an upload this product holds, `name`
 * for a Drive pointer it does not. Those are separate fields in the schema and
 * they stay separate here, including the case where the payload's `kind` is
 * right but the name field is absent (which the payload schema forbids, and
 * which the fallback covers anyway rather than printing an empty sentence).
 */
describe('3.184 history copy — the attachment and resolution sentences', () => {
  function withPayload(type: string, payload: unknown): TicketHistoryEvent {
    return { ...eventOf(type), payload };
  }

  it('names the file for an upload, and the file for a Drive reference — from their own fields', () => {
    expect(
      describeEvent(
        withPayload('attachment.added', { kind: 'upload', attachmentId: 'a1', filename: 'gst-return.pdf' }),
      ),
    ).toBe('Attached gst-return.pdf');
    expect(
      describeEvent(
        withPayload('attachment.added', { kind: 'drive-reference', attachmentId: 'a2', name: 'Q3 sheet' }),
      ),
    ).toBe('Linked Drive file Q3 sheet');
    // Neither field is a fallback for the other: an upload has no `name`, and
    // reading one would print the wrong thing rather than nothing.
    expect(
      describeEvent(withPayload('attachment.added', { kind: 'upload', name: 'wrong field' })),
    ).toBe('attachment.added');
  });

  it('reads the resolution through as the server wrote it, including a value this build does not enumerate', () => {
    expect(
      describeEvent(withPayload('claim.contested_resolved', { resolution: 'redone' })),
    ).toBe('Conflicting claim resolved: redone');
    expect(
      describeEvent(withPayload('claim.contested_resolved', { resolution: 'discarded' })),
    ).toBe('Conflicting claim resolved: discarded');
    // A FOURTH resolution — added to the domain later — reads as itself rather
    // than as a missing case. Same discipline the publish banner keeps for rule
    // names it has never heard of.
    expect(
      describeEvent(withPayload('claim.contested_resolved', { resolution: 'escalated-to-owner' })),
    ).toBe('Conflicting claim resolved: escalated-to-owner');
  });
});

/**
 * 3.973 — the `ticket.field_set` sentence, including the priority change that
 * the priority built-in (spec 2026-09-22) made an ordinary one.
 *
 * ⚠ **THIS BRANCH HAD NO TEXT ASSERTION UNTIL THIS CASE, and that is why it
 * exists.** `3.183`'s census asserts only `describeEvent(...) !== event.type`,
 * so it proves a sentence EXISTS for every registered type and says nothing
 * about what any of them SAY — and the plan that made priority a built-in
 * recorded, in its own self-review, that this line *"needs no task:
 * `describeEvent` already prints `Set priority to P1` for a string value
 * (`history-copy.ts:139`, verified)"*. Verified by READING, not by a test:
 * **nothing in this repo would have gone red had that sentence been wrong.**
 * A claim about the artifact that no instrument reads is the shape this file's
 * own case ids exist to replace with a measurement.
 */
describe('3.973 history copy — the field_set sentence', () => {
  /**
   * Local rather than the `withPayload` one describe up: that helper is scoped
   * to `3.184`, and hoisting it would rearrange a landed block for this one's
   * convenience. `eventOf` is module-scoped, so the one-liner is all this needs.
   */
  const fieldSet = (payload: unknown): TicketHistoryEvent => ({
    ...eventOf('ticket.field_set'),
    payload,
  });

  it('3.973 names the field and the value it was set to — priority included, with no new copy', () => {
    expect(describeEvent(fieldSet({ fieldId: 'priority', value: 'P1' }))).toBe('Set priority to P1');
    // The sentence is GENERIC over the field id, which is exactly why the new
    // built-in needed no copy of its own: a custom field reads the same way.
    // Both halves are here so the case cannot pass on a branch hard-coded for
    // the field this task happened to care about.
    expect(describeEvent(fieldSet({ fieldId: 'severity', value: 'high' }))).toBe('Set severity to high');
    // The CLEARING claim is the other arm — the SAME event carrying `null`,
    // never a second type — asserted on a field that can actually be cleared.
    // `priority` cannot be (the engine refuses `field.priority-required`), so
    // a `Cleared priority` assertion would pin a state the product forbids.
    // The id is RAW here rather than resolved to "Due date": that is the
    // shipped sentence, recorded rather than endorsed.
    expect(describeEvent(fieldSet({ fieldId: 'dueDate', value: null }))).toBe('Cleared dueDate');
  });
});

describe('26.117 comment edits and deletions are narrated, never echoed', () => {
  const ev = (type: string, payload: unknown): TicketHistoryEvent => ({
    ...eventOf(type),
    payload,
  });
  it('26.117 says "Comment edited" / "Comment deleted", and leaves "Comment added" alone', () => {
    expect(describeEvent(ev('comment.edited', { commentId: '01C', body: { type: 'doc' } }))).toBe('Comment edited');
    expect(describeEvent(ev('comment.deleted', { commentId: '01C' }))).toBe('Comment deleted');
    expect(describeEvent(ev('comment.added', { body: { type: 'doc' } }))).toBe('Comment added'); // control
  });
});

/**
 * 27.005 (typed-links T1) — the link pair, read as sentences from the SOURCE's side. `linkTarget` is T4's
 * annotation: absent = unlabelled (an older server), `null` = the server withheld a target this viewer cannot see.
 * The payload's `targetId` is `null` in the withheld case, which the strict schema would refuse, so the sentence reads
 * only `kind` (a closed list) and never parses the payload whole.
 */
describe('27.005 history copy — link sentences', () => {
  const linkEvent = (type: string, kind: string, linkTarget?: { key: string | null } | null): TicketHistoryEvent => ({
    ...eventOf(type),
    payload: { kind, targetId: linkTarget === null ? null : '01J9GTKB000000000000000000' },
    ...(linkTarget === undefined ? {} : { linkTarget }),
  });

  it('27.005 link sentences, three kinds, both events, withheld and unlabelled targets', () => {
    expect(describeEvent(linkEvent('ticket.link_added', 'blocks', { key: 'GN-142' }))).toBe('Linked: blocks GN-142');
    expect(describeEvent(linkEvent('ticket.link_added', 'relates', { key: 'GN-120' }))).toBe('Linked: relates to GN-120');
    expect(describeEvent(linkEvent('ticket.link_added', 'duplicates', { key: 'GN-142' }))).toBe('Linked: duplicates GN-142');
    expect(describeEvent(linkEvent('ticket.link_removed', 'blocks', { key: 'GN-142' }))).toBe('Removed link: blocks GN-142');
    expect(describeEvent(linkEvent('ticket.link_added', 'blocks', null))).toBe("Linked: blocks a ticket you can't see");
    expect(describeEvent(linkEvent('ticket.link_added', 'blocks'))).toBe('Linked: blocks another ticket');
    // a payload this build cannot label (an unknown kind) falls back to the wire name
    expect(describeEvent(linkEvent('ticket.link_added', 'parent', { key: 'GN-1' }))).toBe('ticket.link_added');
    // control: an unknown type still falls back
    expect(describeEvent({ ...eventOf('ticket.closed'), type: 'ticket.never_seen' })).toBe('ticket.never_seen');
  });
});

describe('28.006 draft history sentences', () => {
  it('28.006 drafted, published, discarded; control: a creation without draft reads Created', () => {
    const typeName = (id: string): string => (id === 'task' ? 'Task' : id);
    const created = (payload: Record<string, unknown>): TicketHistoryEvent => ({ ...eventOf('ticket.created'), payload });
    expect(describeEvent(created({ typeId: 'task', draft: true }), { typeName })).toBe('Drafted as Task');
    expect(describeEvent(created({ typeId: 'task' }), { typeName })).toBe('Created as Task'); // control
    expect(describeEvent(eventOf('ticket.published'))).toBe('Published');
    expect(describeEvent(eventOf('ticket.discarded'))).toBe('Discarded');
  });
});
