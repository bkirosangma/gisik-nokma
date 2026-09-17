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
/** A misfiled entity kind for each event type — a legitimate `EntityKind` other than 'ticket'. */
const closeWrongKind = (): EventEnvelope =>
  makeEnvelope({ type: 'ticket.closed', entity: { kind: 'ticket-type', id: T }, workspaceId: WS, payload: {} });
const reopenWrongKind = (): EventEnvelope =>
  makeEnvelope({ type: 'ticket.reopened', entity: { kind: 'ticket-type', id: T }, workspaceId: WS, payload: {} });

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
  /** Fix round 1 (review, Important 1): a misfiled kind is refused, not accepted. */
  it('refuses a misfiled kind, naming it, rather than accepting it', async () => {
    expect(await checkTicketClosed(closeWrongKind(), ctx())).toEqual({
      refused: true, rule: 'malformed-payload',
      reason: 'This ticket.closed event does not point at a ticket; it points at a ticket-type.',
    });
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
  /** Fix round 1 (review, Minor 4): reopen's own dispatch was untested. */
  it('is reachable through evaluateEvent', async () => {
    expect(await evaluateEvent(reopen(), ctx(move('done'), close()))).toEqual({ refused: false });
  });
  /** Fix round 1 (review, Important 1): a misfiled kind is refused, not accepted. */
  it('refuses a misfiled kind, naming it, rather than accepting it', async () => {
    expect(await checkTicketReopened(reopenWrongKind(), ctx())).toEqual({
      refused: true, rule: 'malformed-payload',
      reason: 'This ticket.reopened event does not point at a ticket; it points at a ticket-type.',
    });
  });
});

/** 13.570 — a closed ticket cannot move (spec §2: explicit reopen). */
describe('13.570 transitions are refused while closed', () => {
  it('refuses before any edge is looked at', async () => {
    expect(await evaluateEvent(move('doing'), ctx(move('done'), close()))).toEqual({
      refused: true, rule: 'closed-ticket', reason: 'This ticket is closed — reopen it first.',
    });
    // Fix round 1 (review, Minor 3): a destination that is not even a real
    // state still answers closed-ticket, not unknown-state — proof the closed
    // check runs before the workflow is even consulted, not merely before one
    // particular legal move.
    expect(await evaluateEvent(move('nowhere'), ctx(move('done'), close()))).toEqual({
      refused: true, rule: 'closed-ticket', reason: 'This ticket is closed — reopen it first.',
    });
  });
  it('after a reopen the same move is judged by the workflow again', async () => {
    expect(await evaluateEvent(move('doing'), ctx(move('done'), close(), reopen()))).toEqual({ refused: false });
  });
});
