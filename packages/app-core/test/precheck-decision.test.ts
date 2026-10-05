import { describe, expect, it, vi } from 'vitest';
import type { TicketState, WorkflowDef } from '@gisik-nokma/domain';
import { createClientStateCache, type ClientStateCache } from '../src/cache.js';
import { precheckEvent } from '../src/precheck.js';
import { makeSubmittedFactory } from '../src/submit.js';
import { TICKET, WF_ERRAND, WS, ticketStateSeed } from './helpers/seed.js';

// Built events include payloads the door would refuse (a malformed decision); the suite-wide payload guard is off here,
// as in `precheck.test.ts`.
vi.unmock('@gisik-nokma/domain');

/**
 * wtg2 T6 (spec DC-4, DC-5): the client mirror of the Decision rules. Header and `readyCache` as in `precheck.test.ts`;
 * `TICKET` is a Decision through `typeId: 'decision'` (DC-1: no type definition is read).
 */

const ACTOR = '01J9GKRA000000000000000000';
const make = makeSubmittedFactory({ actorId: ACTOR, origin: 'web' });

function transitionTo(to: string, extras: Record<string, unknown> = {}) {
  return make({ workspaceId: WS, entity: { kind: 'ticket', id: TICKET }, type: 'ticket.transitioned', payload: { to, ...extras } });
}
function closeTicket() {
  return make({ workspaceId: WS, entity: { kind: 'ticket', id: TICKET }, type: 'ticket.closed', payload: {} });
}
/** A cache holding the moving ticket, its workflow, and a vouched-empty child set. */
function readyCache(ticket: Partial<TicketState> = {}, def: WorkflowDef = WF_ERRAND): ClientStateCache {
  const cache = createClientStateCache();
  cache.upsertTicket(ticketStateSeed({ id: TICKET, stateId: 'doing', stateCategory: 'active', ...ticket }));
  cache.upsertWorkflowDef(def);
  cache.markChildrenComplete(TICKET, []);
  return cache;
}

describe('29.141 the client mirror of the Decision rules', () => {
  it('29.141 a visible branch and no outcome previews outcome-required for the move and the close; no visible branch defers; an outcome passes', async () => {
    const link = { kind: 'leads_to' as const, targetId: '01J9GNXT000000000000000001', label: 'Yes' };
    const done = (extras: Record<string, unknown> = {}) => transitionTo('done', { comment: { text: 'ok' }, ...extras });
    const atDone = { stateId: 'done', stateCategory: 'terminal' as const };
    expect(await precheckEvent(done(), readyCache({ typeId: 'decision', links: [link] }))).toEqual({ kind: 'refused', rule: 'decision.outcome-required', reason: 'Choose an outcome before finishing this decision.' });
    expect(await precheckEvent(closeTicket(), readyCache({ typeId: 'decision', ...atDone, links: [link] }))).toEqual({ kind: 'refused', rule: 'decision.outcome-required', reason: 'Choose an outcome before finishing this decision.' });
    expect(await precheckEvent(done(), readyCache({ typeId: 'decision' }))).toEqual({ kind: 'not-evaluated', why: 'missing-local-state' }); // no visible branch
    expect(await precheckEvent(closeTicket(), readyCache({ typeId: 'decision', ...atDone }))).toEqual({ kind: 'not-evaluated', why: 'missing-local-state' });
    expect(await precheckEvent(done(), readyCache({ typeId: 'decision', links: [link], outcome: 'Yes' }))).toEqual({ kind: 'passed' }); // control
    expect(await precheckEvent(closeTicket(), readyCache({ typeId: 'decision', ...atDone, links: [link], outcome: 'Yes' }))).toEqual({ kind: 'passed' }); // control
    expect(await precheckEvent(done(), readyCache({ typeId: 'decision', outcome: 'Yes' }))).toEqual({ kind: 'passed' }); // an outcome needs no branch list
    expect(await precheckEvent(closeTicket(), readyCache({ typeId: 'decision', ...atDone, outcome: 'Yes' }))).toEqual({ kind: 'passed' });
    expect(await precheckEvent(transitionTo('waiting'), readyCache({ typeId: 'decision' }))).toEqual({ kind: 'passed' }); // a non-terminal move does not defer
    expect(await precheckEvent(done(), readyCache({ typeId: 'task', links: [link] }))).toEqual({ kind: 'passed' }); // control: a Task
    expect(await precheckEvent(done(), readyCache({ typeId: 'task' }))).toEqual({ kind: 'passed' }); // control: a Task with no visible link is not deferred
    expect(await precheckEvent(closeTicket(), readyCache({ typeId: 'task', ...atDone }))).toEqual({ kind: 'passed' });
  });

  it('29.141 ticket.decided previews the engine: a visible label passes, an unseen one defers, the other refusals show', async () => {
    const link = { kind: 'leads_to' as const, targetId: '01J9GNXT000000000000000001', label: 'Yes' };
    const decide = (outcome: string | null, from?: string | null) => make({ workspaceId: WS, entity: { kind: 'ticket', id: TICKET }, type: 'ticket.decided', payload: { outcome, ...(from === undefined ? {} : { from }) } });
    expect(await precheckEvent(decide('Yes'), readyCache({ typeId: 'decision', links: [link] }))).toEqual({ kind: 'passed' });
    expect(await precheckEvent(decide('Maybe'), readyCache({ typeId: 'decision', links: [link] }))).toEqual({ kind: 'not-evaluated', why: 'missing-local-state' });
    expect(await precheckEvent(decide('No', 'Yes'), readyCache({ typeId: 'decision', links: [link] }))).toEqual({ kind: 'refused', rule: 'decision.stale-from', reason: 'The decision was cleared since you looked.' });
    expect(await precheckEvent(decide('Yes', 'Yes'), readyCache({ typeId: 'decision', links: [link], outcome: 'Yes' }))).toEqual({ kind: 'refused', rule: 'decision.same-outcome', reason: 'The decision is already Yes.' });
    expect(await precheckEvent(decide(null), readyCache({ typeId: 'decision', links: [link] }))).toEqual({ kind: 'refused', rule: 'decision.same-outcome', reason: 'There is no decision to clear.' });
    expect(await precheckEvent(decide('Yes'), readyCache({ typeId: 'task', links: [link] }))).toEqual({ kind: 'refused', rule: 'decision.not-a-decision', reason: 'This ticket is not a Decision, so it has no outcome to choose.' });
    // what the cache cannot answer defers: an uncached ticket (the engine would say unknown-ticket) and a malformed payload
    const elsewhere = make({ workspaceId: WS, entity: { kind: 'ticket', id: '01J9GNXT000000000000000009' }, type: 'ticket.decided', payload: { outcome: 'Yes' } });
    expect(await precheckEvent(elsewhere, readyCache({ typeId: 'decision', links: [link] }))).toEqual({ kind: 'not-evaluated', why: 'missing-local-state' });
    const malformed = make({ workspaceId: WS, entity: { kind: 'ticket', id: TICKET }, type: 'ticket.decided', payload: {} });
    expect(await precheckEvent(malformed, readyCache({ typeId: 'decision', links: [link] }))).toEqual({ kind: 'not-evaluated', why: 'missing-local-state' });
  });
});
