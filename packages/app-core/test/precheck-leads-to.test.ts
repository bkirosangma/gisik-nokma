import { describe, expect, it } from 'vitest';
import type { SubmittedEvent, TicketLink, TicketState } from '@gisik-nokma/domain';
import { createClientStateCache, type ClientStateCache } from '../src/cache.js';
import { precheckEvent, type PrecheckResult } from '../src/precheck.js';
import { makeSubmittedFactory } from '../src/submit.js';
import { WS, ticketStateSeed } from './helpers/seed.js';

/**
 * 29.124 (precheck half): the client precheck runs the SHARED engine on the cache, so the Decision label rules
 * (LK-3.3) are predicted word for word with no app-core change (typed-links T3 routes link events to the engine).
 * The reasons are typed again here, never imported, so a wrong constant cannot certify itself. `B` and `C` are
 * cached Tasks: an uncached target answers `not-evaluated` before the engine runs, which would make the refusal
 * legs unreachable.
 */
const ACTOR = '01J9GKRA000000000000000000';
const D = '01J9GTKD100000000000000000';
const B = '01J9GTKB100000000000000000';
const C = '01J9GTKC100000000000000000';
const NOW = () => new Date('2026-10-04T09:00:00.000Z');

const make = makeSubmittedFactory({ actorId: ACTOR, origin: 'web', now: NOW });
const titled = (id: string, title: string, typeId: string, links?: TicketLink[]): TicketState =>
  ticketStateSeed({
    id,
    typeId,
    fields: { title: { value: title, actorId: ACTOR, clientTime: '2026-10-04T08:00:00.000Z', serverTime: '2026-10-04T08:00:01.000Z' } },
    ...(links === undefined ? {} : { links }),
  });
function cacheOf(...tickets: TicketState[]): ClientStateCache {
  const cache = createClientStateCache();
  for (const ticket of tickets) cache.upsertTicket(ticket);
  return cache;
}
const lead = (source: string, target: string, label?: string): SubmittedEvent =>
  make({ workspaceId: WS, entity: { kind: 'ticket', id: source }, type: 'ticket.link_added',
    payload: { kind: 'leads_to', targetId: target, ...(label === undefined ? {} : { label }) } });
const precheck = (submitted: SubmittedEvent, cache: ClientStateCache): Promise<PrecheckResult> =>
  precheckEvent(submitted, cache, { now: NOW });

describe('29.124 the client precheck predicts the Decision label rules from the cache', () => {
  it('29.124 an unlabelled branch and a duplicate label are refused word for word; control: a labelled, fresh branch passes', async () => {
    const cache = cacheOf(titled(D, 'Go ahead?', 'decision'), titled(B, 'Chiller', 'task'), titled(C, 'Freezer', 'task'));
    expect(await precheck(lead(D, B), cache)).toEqual({
      kind: 'refused', rule: 'link.label-required', reason: 'Name the branch: a link from a Decision needs a label, such as "Yes" or "No".' });
    expect(await precheck(lead(D, B, 'Yes'), cache)).toEqual({ kind: 'passed' });
    const held = cacheOf(titled(D, 'Go ahead?', 'decision', [{ kind: 'leads_to', targetId: B, label: 'Yes' }]), titled(B, 'Chiller', 'task'), titled(C, 'Freezer', 'task'));
    expect(await precheck(lead(D, C, ' yes '), held)).toEqual({
      kind: 'refused', rule: 'link.label-duplicate', reason: 'This Decision already has a branch labelled "yes".' });
    expect(await precheck(lead(D, C, 'No'), held)).toEqual({ kind: 'passed' }); // control: another label
    expect(await precheck(lead(B, C), cache)).toEqual({ kind: 'passed' }); // control: a Task needs no label
  });
});
