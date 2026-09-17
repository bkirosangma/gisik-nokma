import { describe, expect, it } from 'vitest';
import { makeEnvelope, type EventEnvelope, type PublishedWorkflowDef } from '@gisik-nokma/domain';
import { buildMemoryContext } from '../src/memory-context.js';
import { evaluateEvent } from '../src/evaluate.js';
import { PROJECT, TASK, WF, WS, typeDefined } from '../src/checks/test-support.js';

const T = '01J9GTKT000000000000000000';
/** A workflow with NO wildcard edges, so only declared and universal edges exist. */
const WF_STRICT: PublishedWorkflowDef = {
  id: 'wf-basic', version: 1, name: 'Strict', initialStateId: 'todo',
  states: [
    { id: 'todo', name: 'To do', category: 'open' },
    { id: 'doing', name: 'Doing', category: 'active' },
    { id: 'done', name: 'Done', category: 'terminal' },
  ],
  transitions: [{ from: 'todo', to: 'doing', rules: [] }, { from: 'doing', to: 'done', rules: [] }],
};
const createdIn = (start: 'backlog' | 'focus'): EventEnvelope =>
  makeEnvelope({ type: 'ticket.created', entity: { kind: 'ticket', id: T }, workspaceId: WS,
    payload: { typeId: 'task', projectId: PROJECT, parentId: null, title: 't', start } });
const move = (to: string): EventEnvelope =>
  makeEnvelope({ type: 'ticket.transitioned', entity: { kind: 'ticket', id: T }, workspaceId: WS, payload: { to } });
const ctx = (start: 'backlog' | 'focus', ...after: EventEnvelope[]) =>
  buildMemoryContext([WF_STRICT], [typeDefined(TASK), createdIn(start), ...after]);

/** 13.571 — the universal edges are legal without being declared (spec §1.1/§2). */
describe('13.571 Start and Send to backlog pass the engine', () => {
  it('backlog → initial (Start) is accepted', async () => {
    expect(await evaluateEvent(move('todo'), ctx('backlog'))).toEqual({ refused: false });
  });
  it('backlog → a non-initial state is still illegal', async () => {
    expect(await evaluateEvent(move('doing'), ctx('backlog'))).toMatchObject({ rule: 'illegal-transition' });
  });
  it('a non-terminal state → backlog (Send to backlog) is accepted', async () => {
    expect(await evaluateEvent(move('backlog'), ctx('focus', move('doing')))).toEqual({ refused: false });
  });
  it('a terminal state → backlog is illegal: finished, not parked', async () => {
    expect(await evaluateEvent(move('backlog'), ctx('focus', move('doing'), move('done')))).toMatchObject({
      rule: 'illegal-transition',
    });
  });
  it('the parent-terminal invariant counts a backlog child as open', async () => {
    const C = '01J9GTKC000000000000000000';
    const childInBacklog = makeEnvelope({ type: 'ticket.created', entity: { kind: 'ticket', id: C }, workspaceId: WS,
      payload: { typeId: 'task', projectId: PROJECT, parentId: T, title: 'c', start: 'backlog' } });
    const world = buildMemoryContext([WF_STRICT], [typeDefined(TASK), createdIn('focus'), move('doing'), childInBacklog]);
    expect(await evaluateEvent(move('done'), world)).toMatchObject({ rule: 'parent-terminal-with-open-children' });
  });
  /**
   * Controller ruling (backlog/closed core plan, Task 3, 2026-09-17): a
   * declared wildcard edge means "from any AUTHORED state" — its author never
   * knew about the universal Backlog — so `WF`'s `* → done` must not let a
   * backlog ticket skip straight to Done. `WF` (`checks/test-support.ts`) is
   * every state reachable via `* →` edges, so it is exactly the workflow that
   * would expose a wildcard-from-backlog bug if `transition.ts` resolved one.
   */
  it('a wildcard edge does not apply from backlog — only Start does', async () => {
    const wildcardCtx = buildMemoryContext([WF], [typeDefined(TASK), createdIn('backlog')]);
    expect(await evaluateEvent(move('done'), wildcardCtx)).toMatchObject({ rule: 'illegal-transition' });
    expect(await evaluateEvent(move('todo'), wildcardCtx)).toEqual({ refused: false });
  });
});
