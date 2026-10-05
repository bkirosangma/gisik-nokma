import { describe, expect, it } from 'vitest';
import { makeEnvelope, SYSTEM_ACTOR_FLOW, type EventEnvelope, type PublishedWorkflowDef } from '@gisik-nokma/domain';
import { buildMemoryContext } from '../src/memory-context.js';
import { evaluateEvent } from '../src/evaluate.js';
import { PROJECT, TASK, WS, typeDefined } from '../src/checks/test-support.js';

/**
 * wtg2 T13 (spec AP-1): a promotion is the universal Start edge and nothing else. A late or duplicated `led-to` move,
 * filed after the target already left the Backlog, must not ride a DECLARED edge back (`doing -> todo` here), so the
 * engine refuses a `led-to` move out of any state but the Backlog. Keyed on the cause, so a person's own identical
 * move is untouched. `transition-backlog.test.ts` is the shape copied (13.571).
 */

const T = '01J9GTKT000000000000000000';
/** No wildcard edges, and `doing -> todo` DECLARED: the edge a stale promotion would otherwise ride. */
const WF_STRICT: PublishedWorkflowDef = {
  id: 'wf-basic', version: 1, name: 'Strict', initialStateId: 'todo',
  states: [
    { id: 'todo', name: 'To do', category: 'open' },
    { id: 'doing', name: 'Doing', category: 'active' },
    { id: 'done', name: 'Done', category: 'terminal' },
  ],
  transitions: [{ from: 'todo', to: 'doing', rules: [] }, { from: 'doing', to: 'done', rules: [] }, { from: 'doing', to: 'todo', rules: [] }],
};
const createdIn = (start: 'backlog' | 'focus'): EventEnvelope =>
  makeEnvelope({ type: 'ticket.created', entity: { kind: 'ticket', id: T }, workspaceId: WS,
    payload: { typeId: 'task', projectId: PROJECT, parentId: null, title: 't', start } });
const move = (to: string): EventEnvelope =>
  makeEnvelope({ type: 'ticket.transitioned', entity: { kind: 'ticket', id: T }, workspaceId: WS, payload: { to } });
const ctx = (start: 'backlog' | 'focus', ...after: EventEnvelope[]) =>
  buildMemoryContext([WF_STRICT], [typeDefined(TASK), createdIn(start), ...after]);
const led = (to: string): EventEnvelope => makeEnvelope({ type: 'ticket.transitioned', entity: { kind: 'ticket', id: T }, workspaceId: WS,
  actorId: SYSTEM_ACTOR_FLOW, origin: 'server',
  payload: { to, cause: { kind: 'led-to', sourceTicketId: '01J9GTKS000000000000000000', triggeredBy: '01J9GPRS000000000000000000' } } });

describe('29.219 the engine accepts a led-to move only out of the Backlog', () => {
  it('29.219 a led-to move is legal only out of Backlog', async () => {
    const notBacklog = {
      refused: true,
      rule: 'cause.led-to-not-backlog',
      reason: 'A flow promotes a ticket only out of the Backlog. This one has already moved on, so nothing was changed.',
    };
    expect(await evaluateEvent(led('todo'), ctx('backlog'))).toEqual({ refused: false }); // control
    expect(await evaluateEvent(led('todo'), ctx('focus', move('doing')))).toEqual(notBacklog); // doing -> todo is DECLARED
    expect(await evaluateEvent(led('todo'), ctx('focus'))).toEqual(notBacklog);
    expect(await evaluateEvent(move('todo'), ctx('focus', move('doing')))).toEqual({ refused: false }); // a person's move is untouched
  });
});
