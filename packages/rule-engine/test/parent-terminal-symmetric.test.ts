import { describe, expect, it } from 'vitest';
import { makeEnvelope, type EventEnvelope, type PublishedWorkflowDef } from '@gisik-nokma/domain';
import { buildMemoryContext } from '../src/memory-context.js';
import { evaluateEvent } from '../src/evaluate.js';
import type { EngineContext } from '../src/engine.js';
import { REFUSAL_RULES } from '../src/refusal-rules.js';
import { EPIC, STORY, TASK, WF, WS, created, typeDefined } from '../src/checks/test-support.js';

/**
 * E3-19 (release 2026-09-22, B12). The parent-terminal invariant — "parents
 * cannot outrun children" — was guarded in ONE direction: `transition.ts`
 * refused a parent ENTERING terminal over open children (case 4.23) and said
 * nothing when a child LEFT terminal under a parent already finished, which
 * produces the identical relation from the other side. `hierarchy.ts` refuses
 * live work arriving under a finished parent on create and on reparent; this
 * pins the third door, the transition, and the direction that was already
 * guarded beside it, so the pair reads as one invariant.
 *
 * Relative imports, so nothing here resolves through a stale `dist`. Every
 * definition travels as an event, so the context needs no seed.
 */

const P = '01J9GTKP000000000000000000';
const P2 = '01J9GTKQ000000000000000000';
const C = '01J9GTKC000000000000000000';
const R = '01J9GTKR000000000000000000';

const move = (id: string, to: string): EventEnvelope =>
  makeEnvelope({ type: 'ticket.transitioned', entity: { kind: 'ticket', id }, workspaceId: WS, payload: { to } });
const close = (id: string): EventEnvelope =>
  makeEnvelope({ type: 'ticket.closed', entity: { kind: 'ticket', id }, workspaceId: WS, payload: {} });
const publish = (def: PublishedWorkflowDef): EventEnvelope =>
  makeEnvelope({ type: 'workflow.defined', entity: { kind: 'workflow', id: def.id }, workspaceId: WS, payload: def });

const TYPES = [typeDefined(EPIC), typeDefined(STORY), typeDefined(TASK)];
/** `created()` titles a ticket `ticket <chars 4–8 of its id>`, so P reads as "ticket GTKP" in a refusal. */
const P_TITLE = 'ticket GTKP';
/** `WF` with a second terminal state, so a terminal → terminal move exists to probe. */
const TWO_TERMINAL: PublishedWorkflowDef = {
  ...WF,
  states: [...WF.states, { id: 'cancelled', name: 'Cancelled', category: 'terminal' }],
  transitions: [...WF.transitions, { from: '*', to: 'cancelled', rules: [] }],
};

/** P (story, root) with C (task) under it; C finished, then P finished — the only order 4.23 allows. */
const parentFinishedOverFinishedChild = [...TYPES, created(P, 'story', null), created(C, 'task', P), move(C, 'done'), move(P, 'done')];

describe('E3-19: a child may not leave a terminal state under a terminal parent', () => {
  it('refuses the child reopening under a finished parent, naming the parent and its state', async () => {
    const ctx = buildMemoryContext([WF], parentFinishedOverFinishedChild);
    // Sanity of the fixture: both sit in Done before the probe.
    expect((await ctx.getEntityState('ticket', P))).toMatchObject({ stateId: 'done', stateCategory: 'terminal' });
    expect((await ctx.getEntityState('ticket', C))).toMatchObject({ stateId: 'done', stateCategory: 'terminal' });

    expect(await evaluateEvent(move(C, 'todo'), ctx)).toEqual({
      refused: true,
      rule: REFUSAL_RULES.childOpenUnderTerminalParent,
      reason: `"${P_TITLE}" is finished (Done); reopen it before moving this ticket back to "To do".`,
    });
  });

  it('CONTROL: the same move under a parent that is NOT finished is accepted', async () => {
    // Identical history except the parent never entered Done — the guard keys
    // off the parent's category and nothing else.
    const ctx = buildMemoryContext([WF], [...TYPES, created(P, 'story', null), created(C, 'task', P), move(C, 'done')]);
    expect(await evaluateEvent(move(C, 'todo'), ctx)).toEqual({ refused: false });
  });

  it('CONTROL: a root ticket leaving terminal has no parent to be finished, and is accepted', async () => {
    const ctx = buildMemoryContext([WF], [...TYPES, created(R, 'story', null), move(R, 'done')]);
    expect(await evaluateEvent(move(R, 'todo'), ctx)).toEqual({ refused: false });
  });

  it('refuses the second order too: the parent CLOSED, then the child reopened under it (exec3 §22)', async () => {
    const ctx = buildMemoryContext([WF], [...parentFinishedOverFinishedChild, close(P)]);
    expect((await ctx.getEntityState('ticket', P))).toMatchObject({ stateId: 'done', closed: expect.objectContaining({ actorId: expect.any(String) }) });
    expect(await evaluateEvent(move(C, 'todo'), ctx)).toMatchObject({
      refused: true,
      rule: REFUSAL_RULES.childOpenUnderTerminalParent,
    });
  });

  it('pins the direction that was always guarded beside the new one: the parent may not enter terminal over an open child', async () => {
    const ctx = buildMemoryContext([WF], [...TYPES, created(P2, 'story', null), created(C, 'task', P2)]);
    expect(await evaluateEvent(move(P2, 'done'), ctx)).toEqual({
      refused: true,
      rule: REFUSAL_RULES.parentTerminal,
      reason: 'This ticket cannot enter "Done" while 1 of its child tickets is still open.',
    });
  });

  it('a child moving terminal → terminal under a finished parent is not leaving terminal, and is accepted', async () => {
    const ctx = buildMemoryContext([TWO_TERMINAL], parentFinishedOverFinishedChild);
    expect(await evaluateEvent(move(C, 'cancelled'), ctx)).toEqual({ refused: false });
  });

  it('is scoped to the move that CREATES the relation: a child already open under a terminal parent keeps its ordinary moves', async () => {
    // The relation can pre-exist through a republish that promotes a kept
    // state to terminal (E6-8, workflow-defined.ts): P sits in `review` with C
    // open, and v2 declares `review` terminal. That door is deliberately not
    // gated on occupancy; the close door holds the last line (checks/close.ts).
    // This guard refuses only a child LEAVING terminal, so C's open → active
    // move is still its own to make.
    const v1: PublishedWorkflowDef = {
      ...WF,
      id: 'wf-four',
      states: [...WF.states.slice(0, 2), { id: 'review', name: 'Review', category: 'active' }, WF.states[2]!],
      transitions: [...WF.transitions, { from: '*', to: 'review', rules: [] }],
    };
    const v2: PublishedWorkflowDef = {
      ...v1,
      version: 2,
      states: v1.states.map((s) => (s.id === 'review' ? { ...s, category: 'terminal' as const } : s)),
    };
    const story = typeDefined({ ...STORY, workflowId: 'wf-four' });
    const task = typeDefined({ ...TASK, workflowId: 'wf-four' });
    const ctx = buildMemoryContext([v1], [story, task, created(P, 'story', null), created(C, 'task', P), move(P, 'review'), publish(v2)]);
    expect((await ctx.getEntityState('ticket', P))).toMatchObject({ stateId: 'review', stateCategory: 'terminal' });
    expect((await ctx.getEntityState('ticket', C))).toMatchObject({ stateId: 'todo', stateCategory: 'open' });

    expect(await evaluateEvent(move(C, 'doing'), ctx)).toEqual({ refused: false });
  });

  it('does not read the parent at all unless the move leaves terminal for non-terminal', async () => {
    const ctx = buildMemoryContext([TWO_TERMINAL], parentFinishedOverFinishedChild);
    const parentReads: string[] = [];
    const spying: EngineContext = {
      ...ctx,
      async getEntityState(kind, id) {
        if (kind === 'ticket' && id === P) parentReads.push(id);
        return ctx.getEntityState(kind, id);
      },
    };
    // The guarded move reads the parent exactly once; the same fixture's
    // terminal → terminal move — accepted above — reads it not at all.
    expect(await evaluateEvent(move(C, 'todo'), spying)).toMatchObject({ refused: true });
    expect(parentReads).toEqual([P]);
    parentReads.length = 0;
    expect(await evaluateEvent(move(C, 'cancelled'), spying)).toEqual({ refused: false });
    expect(parentReads).toEqual([]);
  });
});
