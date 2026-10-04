import { describe, expect, it } from 'vitest';
import type { SubmittedEvent, TicketLink, TicketState } from '@gisik-nokma/domain';
import { createClientStateCache, type ClientStateCache } from '../src/cache.js';
import { precheckEvent, type PrecheckResult } from '../src/precheck.js';
import { makeSubmittedFactory } from '../src/submit.js';
import { WS, ticketStateSeed } from './helpers/seed.js';

/**
 * 27.045: the client precheck runs the SHARED engine on the cache for both
 * link events. No `deps.evaluate` is injected anywhere in this file: an
 * injected evaluator would make every verdict the test's own value. The
 * reasons are the literals 27.035–27.042 assert, typed again here and never
 * imported, so a wrong constant cannot certify itself.
 */
const ACTOR = '01J9GKRA000000000000000000';
const A = '01J9GTKA100000000000000000';
const B = '01J9GTKB100000000000000000';
const C = '01J9GTKC100000000000000000';
/** Real-shaped, and held by no cache below. */
const UNCACHED = '01J9GTKZ000000000000000000';
const NOW = () => new Date('2026-10-04T09:00:00.000Z');

const make = makeSubmittedFactory({ actorId: ACTOR, origin: 'web', now: NOW });
const titled = (id: string, title: string, links?: TicketLink[]): TicketState =>
  ticketStateSeed({
    id,
    fields: { title: { value: title, actorId: ACTOR, clientTime: '2026-10-04T08:00:00.000Z', serverTime: '2026-10-04T08:00:01.000Z' } },
    ...(links === undefined ? {} : { links }),
  });
const iceMaker = (links?: TicketLink[]) => titled(A, 'Ice maker', links);
const chiller = (links?: TicketLink[]) => titled(B, 'Chiller', links);
function cacheOf(...tickets: TicketState[]): ClientStateCache {
  const cache = createClientStateCache();
  for (const ticket of tickets) cache.upsertTicket(ticket);
  return cache;
}
const plainLink = (source: string, target: string, kind = 'blocks', type = 'ticket.link_added'): SubmittedEvent =>
  make({ workspaceId: WS, entity: { kind: 'ticket', id: source }, type, payload: { kind, targetId: target } });
const precheck = (submitted: SubmittedEvent, cache: ClientStateCache): Promise<PrecheckResult> =>
  precheckEvent(submitted, cache, { now: NOW });

const passed = { kind: 'passed' };
const notEvaluated = { kind: 'not-evaluated', why: 'missing-local-state' };

describe('27.045 the client precheck predicts the link refusals from the cache', () => {
  it('27.045 self-link refused word for word; control: a fresh link between two cached tickets passes', async () => {
    const cache = cacheOf(iceMaker(), chiller());
    expect(await precheck(plainLink(A, A), cache)).toEqual({ kind: 'refused', rule: 'link.self', reason: 'A ticket cannot be linked to itself.' });
    expect(await precheck(plainLink(A, B), cache)).toEqual(passed);
  });

  it('27.045 ordered duplicate refused; control: the same call with no seeded link passes', async () => {
    expect(await precheck(plainLink(A, B), cacheOf(iceMaker([{ kind: 'blocks', targetId: B }]), chiller()))).toEqual({
      kind: 'refused', rule: 'link.duplicate', reason: '"Ice maker" already blocks "Chiller".' });
    expect(await precheck(plainLink(A, B), cacheOf(iceMaker(), chiller()))).toEqual(passed);
  });

  it('27.045 relates stored B→A refused from A; control: relates to a third cached ticket passes', async () => {
    const cache = cacheOf(iceMaker(), chiller([{ kind: 'relates', targetId: A }]), titled(C, 'Freezer'));
    expect(await precheck(plainLink(A, B, 'relates'), cache)).toEqual({
      kind: 'refused', rule: 'link.duplicate', reason: '"Chiller" already relates to "Ice maker".' });
    expect(await precheck(plainLink(A, C, 'relates'), cache)).toEqual(passed);
  });

  it('27.045 blocks reverse refused; control: a different kind on the pair passes', async () => {
    const cache = cacheOf(iceMaker(), chiller([{ kind: 'blocks', targetId: A }]));
    expect(await precheck(plainLink(A, B), cache)).toEqual({
      kind: 'refused', rule: 'link.reverse', reason: '"Chiller" already blocks "Ice maker".' });
    expect(await precheck(plainLink(A, B, 'duplicates'), cache)).toEqual(passed);
  });

  it('27.045 a removal from the non-storing end is absent; control: the storing end passes', async () => {
    const cache = cacheOf(iceMaker(), chiller([{ kind: 'relates', targetId: A }]));
    expect(await precheck(plainLink(A, B, 'relates', 'ticket.link_removed'), cache)).toEqual({
      kind: 'refused', rule: 'link.absent', reason: 'This ticket holds no such link, so there is nothing to remove.' });
    expect(await precheck(plainLink(B, A, 'relates', 'ticket.link_removed'), cache)).toEqual(passed);
  });

  it('27.045 not-evaluated when the source, or an added link\'s target, is not cached; control: both cached passes', async () => {
    expect(await precheck(plainLink(A, B), cacheOf(chiller()))).toEqual(notEvaluated);
    expect(await precheck(plainLink(A, UNCACHED), cacheOf(iceMaker(), chiller()))).toEqual(notEvaluated);
    expect(await precheck(plainLink(A, B), cacheOf(iceMaker(), chiller()))).toEqual(passed);
  });

  it('27.045 a removal needs only the source: its target uncached still passes; control: an unheld removal is absent', async () => {
    const cache = cacheOf(iceMaker([{ kind: 'blocks', targetId: UNCACHED }]));
    expect(await precheck(plainLink(A, UNCACHED, 'blocks', 'ticket.link_removed'), cache)).toEqual(passed);
    expect(await precheck(plainLink(A, UNCACHED, 'relates', 'ticket.link_removed'), cache)).toEqual({
      kind: 'refused', rule: 'link.absent', reason: 'This ticket holds no such link, so there is nothing to remove.' });
  });

  it('27.045 a payload that does not parse is not-evaluated, not a crash; control: the well-formed call passes', async () => {
    const cache = cacheOf(iceMaker(), chiller());
    // Spread rather than built: the suite's payload guard (`test/setup.ts`) refuses a malformed payload at the factory.
    expect(await precheck({ ...plainLink(A, B), payload: { kind: 'blocks', targetId: B, note: 'x' } }, cache)).toEqual(notEvaluated);
    expect(await precheck(plainLink(A, B), cache)).toEqual(passed);
  });
});
