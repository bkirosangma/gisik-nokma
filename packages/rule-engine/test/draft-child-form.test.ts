import { describe, expect, it } from 'vitest';
import { makeEnvelope, type EventEnvelope } from '@gisik-nokma/domain';
import { evaluateEvent } from '../src/evaluate.js';
import { buildMemoryContext } from '../src/memory-context.js';
import { REFUSAL_RULES } from '../src/refusal-rules.js';
import { getTicketState } from '../src/checks/context-helpers.js';
import {
  AUTHOR, EPIC, OTHER, OTHER_WS, PROJECT, PROJECT_B, STORY, SUBTASK, TASK, WF, WS, created, createdIn, draftCreated, onTicket, typeDefined,
} from '../src/checks/test-support.js';

/**
 * 28.128, the engine half (drafts T6 Step 5a, owner ruling O1): a published ticket C is held as a DRAFT's pending
 * child by `ticket.reparented { newParentId: D, childId: C }` on D's stream. Literal sentences throughout.
 */
const D = '01J9GCDD000000000000000000'; // AUTHOR's draft story
const C = '01J9GCCC000000000000000000'; // published task
const C2 = '01J9GCC2000000000000000000'; // published task
const UP = '01J9GCAP000000000000000000'; // published epic, D's parent in the cycle world
const BIG = '01J9GCBG000000000000000000'; // published story: outranks nothing under a story draft
const FAR = '01J9GCFR000000000000000000'; // published task in another project
const PUB = '01J9GCPB000000000000000000'; // published story
const MINE = '01J9GCMN000000000000000000'; // AUTHOR's other draft, a task
const THEIRS = '01J9GCTH000000000000000000'; // OTHER's draft story
const GHOST = '01J9GCGH000000000000000000'; // no such ticket
const ABROAD = '01J9GCAB000000000000000000'; // published task in ANOTHER workspace

const world = (...after: EventEnvelope[]) =>
  buildMemoryContext(
    [WF],
    [
      typeDefined(EPIC), typeDefined(STORY), typeDefined(TASK), typeDefined(SUBTASK),
      created(UP, 'epic', null),
      draftCreated(D, 'story', null),
      created(C, 'task', null),
      created(C2, 'task', null),
      created(BIG, 'story', null),
      created(FAR, 'task', null, PROJECT_B),
      created(PUB, 'story', null),
      draftCreated(MINE, 'task', null),
      draftCreated(THEIRS, 'story', null, OTHER),
      createdIn(OTHER_WS, ABROAD, 'task', PROJECT_B),
      ...after,
    ],
  );

const hold = (draft: string, child: string, actorId: string = AUTHOR) =>
  onTicket(draft, 'ticket.reparented', { newParentId: draft, childId: child }, actorId);
const withdraw = (draft: string, child: string) => onTicket(draft, 'ticket.reparented', { newParentId: null, childId: child });
const publish = (id: string): EventEnvelope =>
  makeEnvelope({ type: 'ticket.published', entity: { kind: 'ticket', id }, workspaceId: WS, actorId: AUTHOR, payload: { projectId: PROJECT } });

const ACCEPT = { refused: false };
const UNKNOWN_PARENT = {
  refused: true, rule: 'hierarchy.unknown-parent', reason: 'The chosen parent ticket does not exist in this workspace.',
};
const malformed = (detail: string) => ({
  refused: true, rule: REFUSAL_RULES.malformedPayload, reason: `This ticket.reparented event's payload is malformed: ${detail}`,
});

describe('28.128 the childId form, engine half', () => {
  it('holds a published child on the author\'s own live draft and lets it be withdrawn; refuses every other shape in the words a plain reparent gets', async () => {
    expect(await evaluateEvent(hold(D, C), world())).toEqual(ACCEPT);
    // p11 N12: D cannot hold itself as a pending child (the refine `childId !== newParentId`); CONTROL: the line above
    expect(await evaluateEvent(hold(D, D), world())).toEqual(malformed('a ticket cannot be its own pending child'));
    // p11 N14: the withdrawal after an add is accepted; a third ticket as `newParentId` is malformed (Q5)
    expect(await evaluateEvent(withdraw(D, C), world(hold(D, C)))).toEqual(ACCEPT);
    expect(await evaluateEvent(onTicket(D, 'ticket.reparented', { newParentId: PUB, childId: C }), world())).toEqual(
      malformed('a pending child is held by its draft: "newParentId" must be the draft itself, or null to withdraw it.'),
    );

    // the entity: a published ticket never holds a pending child; nor does another person's or a discarded draft
    expect(await evaluateEvent(hold(PUB, C), world())).toEqual(UNKNOWN_PARENT);
    expect(await evaluateEvent(hold(D, C), world(onTicket(D, 'ticket.discarded', {})))).toMatchObject({ refused: true });

    // the child: only a published one of this workspace; an unknown id, another workspace's ticket, another person's
    // draft and the author's own draft read alike
    expect(await evaluateEvent(hold(D, GHOST), world())).toEqual(UNKNOWN_PARENT);
    expect(await evaluateEvent(hold(D, ABROAD), world())).toEqual(UNKNOWN_PARENT); // another workspace's ticket, not its project clash
    expect(await evaluateEvent(hold(D, THEIRS), world())).toEqual(UNKNOWN_PARENT);
    expect(await evaluateEvent(hold(D, MINE), world())).toEqual(UNKNOWN_PARENT);
  });

  it('judges the placement on (D, C): deleted child, cycle, project and rank, in a plain reparent\'s words', async () => {
    expect(await evaluateEvent(hold(D, C), world(onTicket(C, 'ticket.deleted', {})))).toEqual({
      refused: true, rule: REFUSAL_RULES.deletedTicket, reason: 'This ticket is deleted; restore it first.',
    });
    // D sits under UP, so holding UP as D's child closes a loop (named before the rank clash it also has)
    const cycleWorld = world(onTicket(D, 'ticket.reparented', { newParentId: UP }));
    expect(await evaluateEvent(hold(D, UP), cycleWorld)).toEqual({
      refused: true,
      rule: 'hierarchy.cycle',
      reason: 'This move would put the ticket inside one of its own sub-items, making a loop. A ticket cannot contain itself.',
    });
    expect(await evaluateEvent(hold(D, FAR), world())).toEqual({
      refused: true, rule: 'hierarchy.cross-project', reason: 'The parent is in a different project. Pick a parent from the same project.',
    });
    expect(await evaluateEvent(hold(D, BIG), world())).toMatchObject({ refused: true, rule: 'hierarchy.rank' });
    // CONTROL: once D is published the same relation is a plain reparent on C's own stream, real at once
    expect(await evaluateEvent(onTicket(C, 'ticket.reparented', { newParentId: D }), world(publish(D)))).toEqual(ACCEPT);
  });

  it('folds into the draft\'s pendingChildren, absent when empty, never moving either ticket; the publish drops them', async () => {
    const two = world(hold(D, C), hold(D, C2));
    expect((await getTicketState(two, D))?.pendingChildren).toEqual([C, C2]);
    // p11 N13: withdraw one → exactly the other (just inside); withdraw the last → no key at all (just outside)
    const one = world(hold(D, C), hold(D, C2), withdraw(D, C));
    expect((await getTicketState(one, D))?.pendingChildren).toEqual([C2]);
    const none = await getTicketState(world(hold(D, C), withdraw(D, C)), D);
    expect(none !== null && 'pendingChildren' in none).toBe(false);
    // neither parent moves: D keeps its own (null), C keeps its own (null)
    expect((await getTicketState(two, D))?.parentId).toBeNull();
    expect((await getTicketState(two, C))?.parentId).toBeNull();
    const published = await getTicketState(world(hold(D, C), publish(D)), D);
    expect(published !== null && 'pendingChildren' in published).toBe(false);
  });
});
