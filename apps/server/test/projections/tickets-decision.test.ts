import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid } from '@gisik-nokma/domain';
import { buildProjectionRegistry } from '../../src/projections/index.js';
import { rowToTicketState } from '../../src/projections/tickets.js';
import { verifyProjections } from '../../src/tools/verify-projections.js';
import { applyCommitted, makeCommitted } from '../helpers/apply.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';

/**
 * wtg2 T5 (DC-4, PS-2) — `proj_tickets.outcome` and `proj_tickets.passes`, the columns `ticket.decided` projects into and
 * `rowToTicketState` reads back out. `tickets-rank.test.ts`'s sibling: the same projection, the same `applyCommitted`
 * seeding (no rule engine, so the fixtures need only be events `applyTicketEvent` accepts; whether the ticket is a
 * Decision is T6's engine door). The rebuild leg runs `verifyProjections` over the whole test database, so a column
 * the live fold writes and a replay would not (or the reverse) shows as a diff.
 */

let db: TestDatabase;

const WS = newUlid();
const PRJ = newUlid();
const WF = newUlid();
const TYPE_ID = 'decision-spec-type';

beforeAll(async () => {
  db = await createTestDatabase();
  await applyCommitted(db.pool, [
    makeCommitted({
      workspaceId: WS,
      actorId: newUlid(),
      entity: { kind: 'workflow', id: WF },
      type: 'workflow.defined',
      payload: {
        id: WF,
        version: 1,
        name: 'Decision-spec flow',
        initialStateId: 'todo',
        states: [{ id: 'todo', name: 'To do', category: 'open' }],
        transitions: [{ from: '*', to: 'todo', rules: [] }],
      },
    }),
    makeCommitted({
      workspaceId: WS,
      actorId: newUlid(),
      entity: { kind: 'ticket-type', id: TYPE_ID },
      type: 'ticket-type.defined',
      payload: { id: TYPE_ID, name: 'Decision-spec type', icon: 'diamond', rank: 3, workflowId: WF, fields: [] },
    }),
  ]);
}, 60_000);

afterAll(async () => {
  await db.drop();
});

/** The full row, exactly as `rowToTicketState` needs it (`SELECT *`, the shape every reader of this table uses). */
async function rowFor(ticketId: string) {
  const { rows } = await db.pool.query('SELECT * FROM proj_tickets WHERE ticket_id = $1', [ticketId]);
  return rows[0];
}

describe('29.137 proj_tickets carries outcome and passes', () => {
  it('29.137 outcome and passes land, read back equal to the reducer, vanish on a clear and rebuild equal to live', async () => {
    const id = newUlid();
    const actor = newUlid();
    await applyCommitted(db.pool, [
      makeCommitted({
        workspaceId: WS,
        actorId: actor,
        entity: { kind: 'ticket', id },
        type: 'ticket.created',
        payload: { typeId: TYPE_ID, projectId: PRJ, parentId: null, title: 'Go ahead?' },
      }),
    ]);
    const row0 = await rowFor(id);
    expect(row0.outcome).toBeNull();
    expect(row0.passes).toEqual([]);
    expect(['outcome', 'passes'].filter((k) => k in rowToTicketState(row0))).toEqual([]); // control: the reducer's absent shape, BOTH keys
    const yes = makeCommitted({ workspaceId: WS, actorId: actor, entity: { kind: 'ticket', id }, type: 'ticket.decided', payload: { outcome: 'Yes' } });
    await applyCommitted(db.pool, [yes]);
    const state = rowToTicketState(await rowFor(id));
    expect(state.outcome).toBe('Yes');
    expect(state.passes).toEqual([{ pass: 1, outcome: 'Yes', by: actor, at: yes.serverTime, revisions: [] }]);
    await applyCommitted(db.pool, [
      makeCommitted({ workspaceId: WS, actorId: actor, entity: { kind: 'ticket', id }, type: 'ticket.decided', payload: { outcome: null, from: 'Yes' } }),
    ]);
    const cleared = rowToTicketState(await rowFor(id));
    expect('outcome' in cleared).toBe(false);
    expect(cleared.passes?.[0]?.revisions).toHaveLength(1);
    expect(await verifyProjections({ pool: db.pool, projections: buildProjectionRegistry() })).toEqual({ clean: true, diffs: [] });
  });
});
