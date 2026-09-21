import { describe, expect, it } from 'vitest';
import { makeEnvelope, type EventEnvelope, type TicketTypeDef } from '@gisik-nokma/domain';
import { buildMemoryContext } from '../src/memory-context.js';
import { evaluateEvent } from '../src/evaluate.js';
import { EPIC, PROJECT, TASK, WF, WS, created, typeDefined } from '../src/checks/test-support.js';

/**
 * 5.80 — E6-3 (release 2026-09-22, B12): what a custom type's re-rank does to
 * the tickets already placed under the old rank, PINNED AS A DECISION.
 *
 * The rank invariants — a child's type outranks its parent's, a type at or
 * below `DEEPEST_RANK` always has a parent — are WRITE-TIME invariants: asked
 * of every `ticket.created` and `ticket.reparented` against the definitions
 * current at that moment (`checks/hierarchy.ts`, four sites), and NOT re-asked
 * of tickets already placed when a type's rank changes. `checks/ticket-type.ts`
 * accepts a custom re-rank whatever sits where, because occupancy is never an
 * engine input (owner, 2026-08-26, Plan 2 open question 6: a replica is
 * visibility-scoped, so an engine whose definition verdicts depended on where
 * tickets sit would answer differently on the client and the server by
 * construction). The consequence the review measured — after the re-rank the
 * ledger holds a placement the write doors now refuse to reproduce — is
 * therefore the product's position, said in the type editor at the moment the
 * rank is changed ("Tickets already placed keep their place"), not a gap.
 *
 * This file is the WITNESS of that position, not a defect reproduction: it
 * reddens the day someone makes the definition door read placements, which is
 * the change that needs an owner ruling first. Relative imports; every
 * definition travels as an event.
 */

const FEATURE2: TicketTypeDef = { id: 'feature', name: 'Feature', icon: 'flag', rank: 2, workflowId: 'wf-basic', fields: [] };
const FEATURE3: TicketTypeDef = { ...FEATURE2, rank: 3 };
const FEATURE4: TicketTypeDef = { ...FEATURE2, rank: 4 };
const F = '01J9GTKF000000000000000000';
const T = '01J9GTKT000000000000000000';
const NEW_TASK = '01J9GTKN000000000000000000';
const NEW_FEATURE = '01J9GTKM000000000000000000';

const reparent = (ticketId: string, newParentId: string | null): EventEnvelope =>
  makeEnvelope({ type: 'ticket.reparented', entity: { kind: 'ticket', id: ticketId }, workspaceId: WS, payload: { newParentId } });

/** A root feature F (rank 2) with a task T (rank 3) under it — legal under the ladder as defined. */
const placed = [typeDefined(EPIC), typeDefined(FEATURE2), typeDefined(TASK), created(F, 'feature', null), created(T, 'task', F)];

describe('5.80 a custom re-rank is accepted whatever sits where; the write doors judge new placements against the new ladder', () => {
  it('re-ranking Feature 2 → 3 is accepted with a task already under a feature (the placement the new rank forbids)', async () => {
    const ctx = buildMemoryContext([WF], placed);
    expect(await ctx.getEntityState('ticket', T)).toMatchObject({ parentId: F, typeId: 'task' });
    expect(await evaluateEvent(typeDefined(FEATURE3), ctx)).toEqual({ refused: false });
  });

  it('re-ranking Feature 2 → 4 (the deepest rank) is accepted with a root feature in place', async () => {
    expect(await evaluateEvent(typeDefined(FEATURE4), buildMemoryContext([WF], placed))).toEqual({ refused: false });
  });

  it('after 2 → 3 the write doors refuse the placement the ledger holds: T back under F, and a new task under F', async () => {
    const ctx = buildMemoryContext([WF], [...placed, typeDefined(FEATURE3)]);
    // The ledger still holds T under F — nothing moved it.
    expect(await ctx.getEntityState('ticket', T)).toMatchObject({ parentId: F });
    expect(await evaluateEvent(reparent(T, F), ctx)).toMatchObject({ refused: true, rule: 'hierarchy.rank' });
    expect(await evaluateEvent(created(NEW_TASK, 'task', F), ctx)).toMatchObject({ refused: true, rule: 'hierarchy.rank' });
  });

  it('after 2 → 4 the write doors refuse a root feature: F to the root (where it already is), and a new root feature', async () => {
    const ctx = buildMemoryContext([WF], [...placed, typeDefined(FEATURE4)]);
    expect(await ctx.getEntityState('ticket', F)).toMatchObject({ parentId: null });
    expect(await evaluateEvent(reparent(F, null), ctx)).toMatchObject({ refused: true, rule: 'hierarchy.deepest-rank-parent-required' });
    expect(await evaluateEvent(created(NEW_FEATURE, 'feature', null, PROJECT), ctx)).toMatchObject({
      refused: true,
      rule: 'hierarchy.deepest-rank-parent-required',
    });
  });

  it('CONTROL: the definition door is not blanket-accepting — a built-in re-rank is still refused with the same tickets placed', async () => {
    expect(await evaluateEvent(typeDefined({ ...TASK, rank: 2 }), buildMemoryContext([WF], placed))).toMatchObject({
      refused: true,
      rule: 'type.builtin-rank',
    });
  });
});
