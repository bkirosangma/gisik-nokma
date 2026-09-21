import { describe, expect, it } from 'vitest';
import { makeEnvelope, type EventEnvelope, type PublishedWorkflowDef } from '@gisik-nokma/domain';
import { buildMemoryContext } from '../src/memory-context.js';
import { evaluateEvent } from '../src/evaluate.js';
import { REFUSAL_RULES } from '../src/refusal-rules.js';
import { EPIC, STORY, TASK, WF, WS, created, typeDefined } from '../src/checks/test-support.js';

/**
 * 4.55 — E6-8 (release 2026-09-22, B12). Case 4.23 — a parent cannot enter a
 * terminal state while any child is non-terminal — is held by the transition
 * door. Two republish doors walk around it without a transition: a kept
 * state promoted from `active` to `terminal`, and a dropped open state
 * mapped onto a terminal one. Both are ACCEPTED, and deliberately so — the
 * publish check never reads where tickets sit (owner, 2026-08-26: occupancy
 * is a builder courtesy, never an engine input). What must NOT follow is the
 * close: `ticket.closed` asked only `stateCategory === 'terminal'`, so a
 * parent promoted into terminal over open children could be CLOSED over them
 * — by a person, or unattended by the auto-close sweep. This file pins the
 * republish doors as accepted, and the close door as the line that holds
 * regardless of how the terminal state was reached.
 *
 * Relative imports; every definition travels as an event. Measured AFTER
 * E3-19 landed the child-side transition guard, because neither door here
 * is a transition — the probes were still `{ refused: false }`.
 */

const P = '01J9GTKP000000000000000000';
const C = '01J9GTKC000000000000000000';
const R = '01J9GTKR000000000000000000';

const move = (id: string, to: string): EventEnvelope =>
  makeEnvelope({ type: 'ticket.transitioned', entity: { kind: 'ticket', id }, workspaceId: WS, payload: { to } });
const close = (id: string): EventEnvelope =>
  makeEnvelope({ type: 'ticket.closed', entity: { kind: 'ticket', id }, workspaceId: WS, payload: {} });
const publish = (def: PublishedWorkflowDef): EventEnvelope =>
  makeEnvelope({ type: 'workflow.defined', entity: { kind: 'workflow', id: def.id }, workspaceId: WS, payload: def });

const TYPES = [typeDefined(EPIC), typeDefined(STORY), typeDefined(TASK)];
/** P (story) in Doing with C (task) open under it. */
const parentDoingChildOpen = [...TYPES, created(P, 'story', null), created(C, 'task', P), move(P, 'doing')];

/** v2a: `doing` KEPT and promoted active → terminal. */
const V2_PROMOTED: PublishedWorkflowDef = {
  ...WF,
  version: 2,
  states: WF.states.map((s) => (s.id === 'doing' ? { ...s, category: 'terminal' as const } : s)),
};
/** v2b: `doing` DROPPED and mapped onto terminal `done`. */
const V2_MAPPED: PublishedWorkflowDef = {
  ...WF,
  version: 2,
  states: WF.states.filter((s) => s.id !== 'doing'),
  transitions: WF.transitions.filter((t) => t.to !== 'doing'),
  stateMapping: { doing: 'done' },
};

describe('4.55 E6-8: a parent may not be CLOSED over open children, however its terminal state was reached', () => {
  it('CONTROL: the transition door still refuses the parent entering terminal over the open child (4.23)', async () => {
    expect(await evaluateEvent(move(P, 'done'), buildMemoryContext([WF], parentDoingChildOpen))).toMatchObject({
      refused: true,
      rule: REFUSAL_RULES.parentTerminal,
    });
  });

  it('door 1 — a kept state promoted to terminal is accepted (not gated on occupancy), and the close over the open child is then refused', async () => {
    expect(await evaluateEvent(publish(V2_PROMOTED), buildMemoryContext([WF], parentDoingChildOpen))).toEqual({ refused: false });

    const ctx = buildMemoryContext([WF], [...parentDoingChildOpen, publish(V2_PROMOTED)]);
    expect(await ctx.getEntityState('ticket', P)).toMatchObject({ stateId: 'doing', stateCategory: 'terminal' });
    expect((await ctx.getChildrenStates(P)).map((child) => child.stateCategory)).toEqual(['open']);

    expect(await evaluateEvent(close(P), ctx)).toEqual({
      refused: true,
      rule: REFUSAL_RULES.parentTerminal,
      reason: 'This ticket cannot be closed while 1 of its child tickets is still open.',
    });
  });

  it('door 2 — a dropped open state mapped onto a terminal one is accepted, and the close over the open child is then refused', async () => {
    expect(await evaluateEvent(publish(V2_MAPPED), buildMemoryContext([WF], parentDoingChildOpen))).toEqual({ refused: false });

    const ctx = buildMemoryContext([WF], [...parentDoingChildOpen, publish(V2_MAPPED)]);
    expect(await ctx.getEntityState('ticket', P)).toMatchObject({ stateId: 'done', stateCategory: 'terminal' });

    expect(await evaluateEvent(close(P), ctx)).toMatchObject({ refused: true, rule: REFUSAL_RULES.parentTerminal });
  });

  it('renders the plural once more than one child is open', async () => {
    const two = [...parentDoingChildOpen, created(R, 'task', P), publish(V2_PROMOTED)];
    expect(await evaluateEvent(close(P), buildMemoryContext([WF], two))).toEqual({
      refused: true,
      rule: REFUSAL_RULES.parentTerminal,
      reason: 'This ticket cannot be closed while 2 of its child tickets are still open.',
    });
  });

  it('CONTROL: the close is accepted once every child is terminal — the same parent, the same promotion', async () => {
    const ctx = buildMemoryContext([WF], [...parentDoingChildOpen, move(C, 'done'), publish(V2_PROMOTED)]);
    expect(await ctx.getEntityState('ticket', P)).toMatchObject({ stateCategory: 'terminal' });
    expect(await evaluateEvent(close(P), ctx)).toEqual({ refused: false });
  });

  it('CONTROL: a childless terminal ticket closes as before, and a non-terminal one is still refused close-requires-terminal first', async () => {
    const root = [...TYPES, created(R, 'story', null)];
    expect(await evaluateEvent(close(R), buildMemoryContext([WF], [...root, move(R, 'done')]))).toEqual({ refused: false });
    expect(await evaluateEvent(close(R), buildMemoryContext([WF], [...root, move(R, 'doing')]))).toMatchObject({
      rule: REFUSAL_RULES.closeRequiresTerminal,
    });
  });
});
