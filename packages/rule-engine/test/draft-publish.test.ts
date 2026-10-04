import { describe, expect, it } from 'vitest';
import { type EventEnvelope } from '@gisik-nokma/domain';
import { evaluateEvent } from '../src/evaluate.js';
import { buildMemoryContext } from '../src/memory-context.js';
import {
  AUTHOR, OTHER, PROJECT, PROJECT_B, STORY, TASK, WF, created, draftCreated, onTicket, typeDefined,
} from '../src/checks/test-support.js';

/** 28.092 — publish and discard in the engine (drafts spec R10 to R12). Literal rule ids and sentences. */
const PUB = '01J9GPBT000000000000000000';
const PARENT = '01J9GPAR000000000000000000';
const D = '01J9GDRF000000000000000000';
const C = '01J9GCHD000000000000000000';
const GHOST = '01J9GGHT000000000000000000';

const publish = (id: string, projectId: string = PROJECT, actorId: string = AUTHOR): EventEnvelope =>
  onTicket(id, 'ticket.published', { projectId }, actorId);

const world = (...after: EventEnvelope[]) =>
  buildMemoryContext(
    [WF],
    [typeDefined(STORY), typeDefined(TASK), created(PUB, 'story', null), draftCreated(D, 'task', null), ...after],
  );

describe('28.092 ticket.published in the engine', () => {
  it('accepts a draft at the root and a draft under a published parent', async () => {
    expect(await evaluateEvent(publish(D), world())).toEqual({ refused: false });
    expect(await evaluateEvent(publish(C), world(draftCreated(C, 'task', PUB)))).toEqual({ refused: false });
  });

  it('refuses a ticket that is not a draft, an unknown one and a discarded one', async () => {
    expect(await evaluateEvent(publish(PUB), world())).toEqual({
      refused: true, rule: 'draft.not-a-draft', reason: 'This ticket is not a draft.',
    });
    const unknown = { refused: true, rule: 'ticket.unknown', reason: 'This ticket does not exist in this workspace.' };
    expect(await evaluateEvent(publish(GHOST), world())).toEqual(unknown);
    expect(await evaluateEvent(publish(D), world(onTicket(D, 'ticket.discarded', {})))).toEqual(unknown);
  });

  it('refuses another project, and a payload without one', async () => {
    expect(await evaluateEvent(publish(D, PROJECT_B), world())).toEqual({
      refused: true, rule: 'draft.project-mismatch', reason: "The project does not match this draft's project.",
    });
    expect(await evaluateEvent(onTicket(D, 'ticket.published', {}), world())).toMatchObject({
      refused: true, rule: 'malformed-payload',
    });
  });

  it('refuses a child whose parent is still a draft, and accepts it once the parent is published (the state the earlier event left)', async () => {
    const ctx = world(draftCreated(PARENT, 'story', null), draftCreated(C, 'task', PARENT));
    expect(await evaluateEvent(publish(C), ctx)).toEqual({
      refused: true, rule: 'draft.parent-unpublished', reason: 'The parent is still a draft. Publish the parent first.',
    });
    const after = world(draftCreated(PARENT, 'story', null), draftCreated(C, 'task', PARENT), publish(PARENT));
    expect(await evaluateEvent(publish(C), after)).toEqual({ refused: false });
  });

  it('re-runs the creation checks against the world as it is now: a deleted parent, a finished parent, a type re-ranked to the deepest rank', async () => {
    const under = [draftCreated(C, 'task', PUB)];
    expect(await evaluateEvent(publish(C), world(...under, onTicket(PUB, 'ticket.deleted', {})))).toEqual({
      refused: true, rule: 'hierarchy.parent-deleted', reason: 'The chosen parent ticket is deleted. Restore it, or pick another parent.',
    });
    const finished = await evaluateEvent(publish(C), world(...under, onTicket(PUB, 'ticket.transitioned', { to: 'done' })));
    expect(finished).toMatchObject({ refused: true, rule: 'hierarchy.parent-terminal' });
    expect(finished.refused && finished.reason).toContain('is finished (Done)');
    // CONTROL: the same draft, the parent untouched
    expect(await evaluateEvent(publish(C), world(...under))).toEqual({ refused: false });

    const reRanked = buildMemoryContext(
      [WF],
      [typeDefined(TASK), draftCreated(D, 'task', null), typeDefined({ ...TASK, rank: 4 })],
    );
    expect(await evaluateEvent(publish(D), reRanked)).toEqual({
      refused: true,
      rule: 'hierarchy.deepest-rank-parent-required',
      reason: '"Task" is the smallest kind of work, so it always belongs to a parent ticket. Pick the ticket this one is part of.',
    });
  });

  it('does not judge who sends it (the permission gate does), so another person\'s publish of a valid draft is the engine\'s accept', async () => {
    expect(await evaluateEvent(publish(D, PROJECT, OTHER), world())).toEqual({ refused: false });
  });
});

describe('28.092 ticket.discarded in the engine', () => {
  it('accepts a draft; refuses a published ticket (draft.not-a-draft) and an unknown one (ticket.unknown)', async () => {
    expect(await evaluateEvent(onTicket(D, 'ticket.discarded', {}), world())).toEqual({ refused: false });
    expect(await evaluateEvent(onTicket(PUB, 'ticket.discarded', {}), world())).toEqual({
      refused: true, rule: 'draft.not-a-draft', reason: 'This ticket is not a draft.',
    });
    expect(await evaluateEvent(onTicket(GHOST, 'ticket.discarded', {}), world())).toEqual({
      refused: true, rule: 'ticket.unknown', reason: 'This ticket does not exist in this workspace.',
    });
    expect(await evaluateEvent(onTicket(D, 'ticket.discarded', { extra: 1 }), world())).toMatchObject({
      refused: true, rule: 'malformed-payload',
    });
  });
});
