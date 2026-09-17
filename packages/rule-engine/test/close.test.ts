import { describe, expect, it } from 'vitest';
import { makeEnvelope, type EventEnvelope } from '@gisik-nokma/domain';
import { buildMemoryContext } from '../src/memory-context.js';
import { checkTicketClosed, checkTicketReopened } from '../src/checks/close.js';
import { evaluateEvent } from '../src/evaluate.js';
import { PROJECT, TASK, WF, WS, created, typeDefined } from '../src/checks/test-support.js';

const T = '01J9GTKT000000000000000000';
const move = (to: string): EventEnvelope =>
  makeEnvelope({ type: 'ticket.transitioned', entity: { kind: 'ticket', id: T }, workspaceId: WS, payload: { to } });
const close = (): EventEnvelope =>
  makeEnvelope({ type: 'ticket.closed', entity: { kind: 'ticket', id: T }, workspaceId: WS, payload: {} });
const reopen = (): EventEnvelope =>
  makeEnvelope({ type: 'ticket.reopened', entity: { kind: 'ticket', id: T }, workspaceId: WS, payload: {} });
const ctx = (...after: EventEnvelope[]) =>
  buildMemoryContext([WF], [typeDefined(TASK), created(T, 'task', null, PROJECT), ...after]);

/** 13.568 — closing (spec §2). */
describe('13.568 checkTicketClosed', () => {
  it('accepts a close from a terminal state', async () => {
    expect(await checkTicketClosed(close(), ctx(move('done')))).toEqual({ refused: false });
  });
  it('refuses from a non-terminal state, naming the state', async () => {
    expect(await checkTicketClosed(close(), ctx(move('doing')))).toEqual({
      refused: true, rule: 'close-requires-terminal',
      reason: 'A ticket can only be closed from a terminal state; "Doing" is not one.',
    });
  });
  it('refuses a second close', async () => {
    expect(await checkTicketClosed(close(), ctx(move('done'), close()))).toEqual({
      refused: true, rule: 'already-closed', reason: 'This ticket is already closed.',
    });
  });
  it('is reachable through evaluateEvent', async () => {
    expect(await evaluateEvent(close(), ctx(move('doing')))).toMatchObject({ rule: 'close-requires-terminal' });
  });
});

/** 13.569 — reopening (spec §2). */
describe('13.569 checkTicketReopened', () => {
  it('accepts a reopen of a closed ticket and refuses one that is not closed', async () => {
    expect(await checkTicketReopened(reopen(), ctx(move('done'), close()))).toEqual({ refused: false });
    expect(await checkTicketReopened(reopen(), ctx(move('done')))).toEqual({
      refused: true, rule: 'not-closed', reason: 'This ticket is not closed.',
    });
  });
});

/** 13.570 — a closed ticket cannot move (spec §2: explicit reopen). */
describe('13.570 transitions are refused while closed', () => {
  it('refuses before any edge is looked at', async () => {
    expect(await evaluateEvent(move('doing'), ctx(move('done'), close()))).toEqual({
      refused: true, rule: 'closed-ticket', reason: 'This ticket is closed — reopen it first.',
    });
  });
  it('after a reopen the same move is judged by the workflow again', async () => {
    expect(await evaluateEvent(move('doing'), ctx(move('done'), close(), reopen()))).toEqual({ refused: false });
  });
});
