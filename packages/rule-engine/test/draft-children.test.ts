import { describe, expect, it } from 'vitest';
import { makeEnvelope, type EventEnvelope, type PublishedWorkflowDef } from '@gisik-nokma/domain';
import { evaluateEvent } from '../src/evaluate.js';
import { buildMemoryContext } from '../src/memory-context.js';
import { EPIC, STORY, TASK, WF, WS, created, draftCreated, typeDefined } from '../src/checks/test-support.js';

/**
 * 28.096 — a DRAFT child is not open work (drafts spec; the engine half of the auto-close sweep's `NOT EXISTS`).
 * The reasons are the E6-8 sentences, which are existing copy: the only new fact is the number in them.
 */
const P = '01J9GTKP000000000000000000';
const C = '01J9GTKC000000000000000000';
const DR = '01J9GTKD000000000000000000';

const move = (id: string, to: string): EventEnvelope =>
  makeEnvelope({ type: 'ticket.transitioned', entity: { kind: 'ticket', id }, workspaceId: WS, payload: { to } });
const close = (id: string): EventEnvelope =>
  makeEnvelope({ type: 'ticket.closed', entity: { kind: 'ticket', id }, workspaceId: WS, payload: {} });
const publish = (def: PublishedWorkflowDef): EventEnvelope =>
  makeEnvelope({ type: 'workflow.defined', entity: { kind: 'workflow', id: def.id }, workspaceId: WS, payload: def });

const TYPES = [typeDefined(EPIC), typeDefined(STORY), typeDefined(TASK)];
/** v2: `doing` KEPT and promoted active to terminal, which puts P in a terminal state with no transition. */
const V2_PROMOTED: PublishedWorkflowDef = {
  ...WF,
  version: 2,
  states: WF.states.map((s) => (s.id === 'doing' ? { ...s, category: 'terminal' as const } : s)),
};
const world = (...after: EventEnvelope[]) => buildMemoryContext([WF], [...TYPES, created(P, 'story', null), ...after]);

describe('28.096 a draft child is not open work', () => {
  it('lets the parent ENTER a terminal state over a draft child, and counts only the published open child', async () => {
    // the draft alone
    expect(await evaluateEvent(move(P, 'done'), world(draftCreated(DR, 'task', P)))).toEqual({ refused: false });
    // CONTROL: a published open child holds it, and the draft beside it is not in the number
    expect(await evaluateEvent(move(P, 'done'), world(created(C, 'task', P)))).toEqual({
      refused: true,
      rule: 'parent-terminal-with-open-children',
      reason: 'This ticket cannot enter "Done" while 1 of its child tickets is still open.',
    });
    expect(await evaluateEvent(move(P, 'done'), world(created(C, 'task', P), draftCreated(DR, 'task', P)))).toEqual({
      refused: true,
      rule: 'parent-terminal-with-open-children',
      reason: 'This ticket cannot enter "Done" while 1 of its child tickets is still open.',
    });
  });

  it('lets a parent promoted into terminal by a republish be CLOSED over a draft child, and counts only the published open child', async () => {
    const promoted = (...children: EventEnvelope[]) => world(move(P, 'doing'), ...children, publish(V2_PROMOTED));
    expect(await evaluateEvent(close(P), promoted(draftCreated(DR, 'task', P)))).toEqual({ refused: false });
    expect(await evaluateEvent(close(P), promoted(created(C, 'task', P), draftCreated(DR, 'task', P)))).toEqual({
      refused: true,
      rule: 'parent-terminal-with-open-children',
      reason: 'This ticket cannot be closed while 1 of its child tickets is still open.',
    });
  });
});
