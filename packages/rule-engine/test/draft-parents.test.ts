import { describe, expect, it } from 'vitest';
import { makeEnvelope, type EventEnvelope } from '@gisik-nokma/domain';
import { evaluateEvent } from '../src/evaluate.js';
import { buildMemoryContext } from '../src/memory-context.js';
import {
  AUTHOR, EPIC, OTHER, PROJECT, STORY, SUBTASK, TASK, WF, WS, created, draftCreated, onTicket, typeDefined,
} from '../src/checks/test-support.js';

/** 28.091 — a draft's parent (drafts spec R3 to R5, owner ruling O1). Literal sentences throughout. */
const PUB = '01J9GPBT000000000000000000';
const MINE = '01J9GMNE000000000000000000';
const THEIRS = '01J9GTHR000000000000000000';
const GHOST = '01J9GGHT000000000000000000';
const N = '01J9GNEW000000000000000000';
const T = '01J9GTKT000000000000000000';

/** A published story, the author's draft story and another person's draft story. */
const world = (...after: EventEnvelope[]) =>
  buildMemoryContext(
    [WF],
    [
      typeDefined(EPIC), typeDefined(STORY), typeDefined(TASK), typeDefined(SUBTASK),
      created(PUB, 'story', null),
      draftCreated(MINE, 'story', null),
      draftCreated(THEIRS, 'story', null, OTHER),
      ...after,
    ],
  );

/** A PUBLISHED ticket's `ticket.created`, filed by a named actor (`created()` files by the default one). */
const ticketBy = (actorId: string, id: string, typeId: string, parentId: string | null): EventEnvelope =>
  makeEnvelope({
    type: 'ticket.created', entity: { kind: 'ticket', id }, workspaceId: WS, actorId,
    payload: { typeId, projectId: PROJECT, parentId, title: 'a ticket' },
  });

const UNKNOWN_PARENT = {
  refused: true, rule: 'hierarchy.unknown-parent', reason: 'The chosen parent ticket does not exist in this workspace.',
};

describe('28.091 R3: a draft under a parent', () => {
  it('accepts a published parent and the author\'s own draft; another person\'s draft is refused in the words a missing parent gets', async () => {
    expect(await evaluateEvent(draftCreated(N, 'task', PUB), world())).toEqual({ refused: false });
    expect(await evaluateEvent(draftCreated(N, 'task', MINE), world())).toEqual({ refused: false });
    const underTheirs = await evaluateEvent(draftCreated(N, 'task', THEIRS), world());
    expect(underTheirs).toEqual(UNKNOWN_PARENT);
    // no oracle: the SAME answer as a parent that does not exist
    expect(await evaluateEvent(draftCreated(N, 'task', GHOST), world())).toEqual(underTheirs);
    // the identity compared is the actor's: THEIR draft is OTHER's own to build under
    expect(await evaluateEvent(draftCreated(N, 'task', THEIRS, OTHER), world())).toEqual({ refused: false });
  });

  it('treats a discarded draft as a parent that does not exist', async () => {
    const ctx = world(onTicket(MINE, 'ticket.discarded', {}));
    expect(await evaluateEvent(draftCreated(N, 'task', MINE), ctx)).toEqual(UNKNOWN_PARENT);
    expect(await evaluateEvent(draftCreated(N, 'task', PUB), ctx)).toEqual({ refused: false }); // CONTROL
  });
});

describe('28.091 R4 (owner ruling O1): a published ticket\'s own stream never names a draft parent', () => {
  it('answers a creation under ANY draft, the actor\'s own included, as an unknown parent', async () => {
    expect(await evaluateEvent(ticketBy(AUTHOR, N, 'task', MINE), world())).toEqual(UNKNOWN_PARENT);
    expect(await evaluateEvent(ticketBy(AUTHOR, N, 'task', THEIRS), world())).toEqual(UNKNOWN_PARENT);
    // whoever sends it: a draft id is not a ticket on a published stream
    expect(await evaluateEvent(ticketBy(OTHER, N, 'task', THEIRS), world())).toEqual(UNKNOWN_PARENT);
    expect(await evaluateEvent(ticketBy(OTHER, N, 'task', MINE), world())).toEqual(UNKNOWN_PARENT);
    // and the same words as an id that does not exist at all
    expect(await evaluateEvent(ticketBy(AUTHOR, N, 'task', GHOST), world())).toEqual(UNKNOWN_PARENT);
    // CONTROL: the same creation under a published parent
    expect(await evaluateEvent(ticketBy(AUTHOR, N, 'task', PUB), world())).toEqual({ refused: false });
  });

  it('answers a plain reparent of a published ticket under a draft as an unknown parent; a draft may be reparented under its own draft or a published ticket', async () => {
    const ctx = world(created(T, 'task', null), draftCreated(N, 'task', null));
    expect(await evaluateEvent(onTicket(T, 'ticket.reparented', { newParentId: MINE }), ctx)).toEqual(UNKNOWN_PARENT); // the draft-side `childId` form is T6's
    expect(await evaluateEvent(onTicket(T, 'ticket.reparented', { newParentId: THEIRS }), ctx)).toEqual(UNKNOWN_PARENT);
    expect(await evaluateEvent(onTicket(T, 'ticket.reparented', { newParentId: PUB }), ctx)).toEqual({ refused: false }); // CONTROL
    // the draft N (a task by AUTHOR)
    expect(await evaluateEvent(onTicket(N, 'ticket.reparented', { newParentId: MINE }), ctx)).toEqual({ refused: false });
    expect(await evaluateEvent(onTicket(N, 'ticket.reparented', { newParentId: PUB }), ctx)).toEqual({ refused: false });
    expect(await evaluateEvent(onTicket(N, 'ticket.reparented', { newParentId: THEIRS }), ctx)).toEqual(UNKNOWN_PARENT);
  });
});

describe('28.091 R5: the deepest rank still needs a parent, at creation and at reparent', () => {
  const NEEDS_PARENT = {
    refused: true,
    rule: 'hierarchy.deepest-rank-parent-required',
    reason: '"Sub-task" is the smallest kind of work, so it always belongs to a parent ticket. Pick the ticket this one is part of.',
  };
  it('refuses a parentless draft sub-task and a reparent of one to the root; accepts the same draft under a parent', async () => {
    expect(await evaluateEvent(draftCreated(N, 'sub-task', null), world())).toEqual(NEEDS_PARENT);
    expect(await evaluateEvent(draftCreated(N, 'sub-task', PUB), world())).toEqual({ refused: false });
    const ctx = world(draftCreated(N, 'sub-task', PUB));
    expect(await evaluateEvent(onTicket(N, 'ticket.reparented', { newParentId: null }), ctx)).toEqual(NEEDS_PARENT);
    expect(await evaluateEvent(onTicket(N, 'ticket.reparented', { newParentId: MINE }), ctx)).toEqual({ refused: false });
  });
});
