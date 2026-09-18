import { describe, expect, it } from 'vitest';
import { makeEnvelope, type EventEnvelope } from '@gisik-nokma/domain';
import { buildMemoryContext, type MemoryContext } from '../src/memory-context.js';
import { checkTicketRanked } from '../src/checks/rank.js';
import { evaluateEvent } from '../src/evaluate.js';
import { PROJECT, TASK, WF, WS, created, typeDefined } from '../src/checks/test-support.js';

const T = '01J9GTKT000000000000000000';

const move = (to: string): EventEnvelope =>
  makeEnvelope({ type: 'ticket.transitioned', entity: { kind: 'ticket', id: T }, workspaceId: WS, payload: { to } });
const close = (): EventEnvelope =>
  makeEnvelope({ type: 'ticket.closed', entity: { kind: 'ticket', id: T }, workspaceId: WS, payload: {} });
const rank = (payload: Record<string, unknown> = { rank: 'i' }): EventEnvelope =>
  makeEnvelope({ type: 'ticket.ranked', entity: { kind: 'ticket', id: T }, workspaceId: WS, payload });
/** A misfiled entity kind — a legitimate `EntityKind` other than 'ticket'. */
const rankWrongKind = (): EventEnvelope =>
  makeEnvelope({
    type: 'ticket.ranked',
    entity: { kind: 'ticket-type', id: T },
    workspaceId: WS,
    payload: { rank: 'i' },
  });

/**
 * A `ticket.created` born IN the universal Backlog (`start: 'backlog'`, spec
 * §1.3) — the one state a rank is legal from. The shared `created()` builder
 * takes no `start`, because every other suite wants the workflow's initial
 * state; this file is the one that needs the other door, and it declares the
 * builder locally rather than widening a shared one for a single caller.
 */
const bornInBacklog = (id: string): EventEnvelope =>
  makeEnvelope({
    type: 'ticket.created',
    entity: { kind: 'ticket', id },
    workspaceId: WS,
    payload: { typeId: 'task', projectId: PROJECT, parentId: null, title: `ticket ${id.slice(4, 8)}`, start: 'backlog' },
  });

const ctxFrom = (birth: EventEnvelope, ...after: EventEnvelope[]): MemoryContext =>
  buildMemoryContext([WF], [typeDefined(TASK), birth, ...after]);
/** The ticket sits in `backlog` — rankable. */
const inBacklog = (...after: EventEnvelope[]) => ctxFrom(bornInBacklog(T), ...after);
/** The ticket sits in `todo` — the workflow's initial state, NOT the backlog. */
const inTodo = (...after: EventEnvelope[]) => ctxFrom(created(T, 'task', null, PROJECT), ...after);

/** 13.700 — a rank is legal only from the universal Backlog (spec §8.1). */
describe('13.700 ticket.ranked is accepted only for a backlog ticket', () => {
  it('a backlog ticket with a valid key: accept', async () => {
    expect(await checkTicketRanked(rank(), inBacklog())).toEqual({ refused: false });
  });

  it('a ticket in "To do": refused rank-requires-backlog with the state NAME', async () => {
    expect(await checkTicketRanked(rank(), inTodo())).toEqual({
      refused: true,
      rule: 'rank-requires-backlog',
      reason: 'Only a backlog ticket can be ranked; this one is in "To do".',
    });
  });

  /**
   * The fallback branch. `getWorkflowDef` answers null when the reader cannot
   * see the definition — reachable in production through the scope predicate
   * the server's reader carries (ruling P14), and simurable here only by
   * removing the seed, because the reducer REFUSES to produce a ticket whose
   * workflow was never defined (`ticket-state.ts:120-124` throws). So this
   * case deletes the definition from the built context rather than pretending
   * a ticket can exist without one.
   */
  it('unknown def: the reason falls back to the state id', async () => {
    const ctx = inTodo();
    ctx.workflows.delete(WF.id);
    expect(await checkTicketRanked(rank(), ctx)).toEqual({
      refused: true,
      rule: 'rank-requires-backlog',
      reason: 'Only a backlog ticket can be ranked; this one is in "todo".',
    });
  });

  it('malformed key (space): malformed-payload, prefixed "This ticket.ranked event\'s payload is malformed:"', async () => {
    const r = await checkTicketRanked(rank({ rank: 'a b' }), inBacklog());
    expect(r).toMatchObject({ refused: true, rule: 'malformed-payload' });
    expect(r.refused && r.reason).toMatch(/^This ticket\.ranked event's payload is malformed:/);
  });

  /**
   * The second half of the payload door, and the one the domain's schema was
   * widened for: the regex admits `'a0'`, `isRankKey` refuses it, and nothing
   * sorts below `'0'`. Pinned here because the ENGINE is where a hand-written
   * key would meet the ledger — the schema alone is only reachable if some
   * producer lets one through.
   */
  it('a key ending in 0 is malformed-payload: nothing sorts below it', async () => {
    expect(await checkTicketRanked(rank({ rank: 'a0' }), inBacklog())).toMatchObject({
      refused: true,
      rule: 'malformed-payload',
    });
  });

  it('unknown ticket: unknown-ticket', async () => {
    const ctx = buildMemoryContext([WF], [typeDefined(TASK)]);
    expect(await checkTicketRanked(rank(), ctx)).toEqual({
      refused: true,
      rule: 'unknown-ticket',
      reason: `This event ranks ticket ${T}, but no such ticket is known.`,
    });
  });

  /**
   * A closed ticket is terminal, so it is not in the backlog — and the refusal
   * that fires is the BACKLOG one, not a silent accept. Closing does not clear
   * `stateId` (spec §2: the final state stays visible), which is exactly why
   * the backlog check is the door that catches this rather than a flag test.
   */
  it('a closed ticket cannot be in backlog, but a rank on a closed ticket is refused by the backlog check, not silently accepted', async () => {
    expect(await checkTicketRanked(rank(), inBacklog(move('done'), close()))).toEqual({
      refused: true,
      rule: 'rank-requires-backlog',
      reason: 'Only a backlog ticket can be ranked; this one is in "Done".',
    });
  });

  /** The dispatch arm in `evaluate.ts` — an unreachable case is an unshipped one. */
  it('is reachable through evaluateEvent', async () => {
    expect(await evaluateEvent(rank(), inTodo())).toMatchObject({ rule: 'rank-requires-backlog' });
    expect(await evaluateEvent(rank(), inBacklog())).toEqual({ refused: false });
  });

  it('refuses a misfiled kind, naming it, rather than accepting it', async () => {
    expect(await checkTicketRanked(rankWrongKind(), inBacklog())).toEqual({
      refused: true,
      rule: 'malformed-payload',
      reason: 'This ticket.ranked event does not point at a ticket; it points at a ticket-type.',
    });
  });
});
