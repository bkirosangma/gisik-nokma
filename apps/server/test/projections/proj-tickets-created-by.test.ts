import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { membershipId, newUlid, type LedgerEvent } from '@gisik-nokma/domain';
import { buildProjectionRegistry } from '../../src/projections/index.js';
import { rebuildProjection } from '../../src/projections/rebuild.js';
import { verifyProjections } from '../../src/tools/verify-projections.js';
import { applyCommitted, makeCommitted } from '../helpers/apply.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';

/**
 * Cases 30.001–30.002 (my-work-global T1). `proj_tickets.created_by` — the actor
 * of the ticket's `ticket.created` event, which the attention route's `created`
 * arm filters on.
 *
 * The world is built through `applyCommitted` (the WHOLE projection registry,
 * the ingest path's own projections) rather than `seedTicket`, whose head row is
 * a hand-written INSERT: a column filled by that INSERT would test the fixture,
 * not the projection.
 */

const MIGRATION = new URL('../../migrations/1791400000000_proj-tickets-created-by.sql', import.meta.url);

/** The `-- Up Migration` and `-- Down Migration` halves, as node-pg-migrate splits them. */
function halves(): { up: string; down: string } {
  const text = readFileSync(fileURLToPath(MIGRATION), 'utf8');
  const [upPart, downPart] = text.split('-- Down Migration');
  return { up: upPart!.replace('-- Up Migration', ''), down: downPart! };
}

let db: TestDatabase;
const WS = newUlid();
const PROJECT = newUlid();
const WORKFLOW = 'wf-mwg-created-by';
const TYPE = 'mwg-created-by-task';
const U1 = newUlid();
const U2 = newUlid();

function ev(
  actorId: string,
  entity: LedgerEvent['entity'],
  type: string,
  payload: Record<string, unknown>,
): LedgerEvent {
  return makeCommitted({ workspaceId: WS, actorId, entity, type, payload });
}

function createTicket(ticketId: string, actorId: string): LedgerEvent {
  return ev(actorId, { kind: 'ticket', id: ticketId }, 'ticket.created', {
    typeId: TYPE,
    projectId: PROJECT,
    parentId: null,
    title: `Ticket ${ticketId}`,
  });
}

async function createdBy(ticketIds: readonly string[]): Promise<Array<{ ticket_id: string; created_by: string | null }>> {
  const { rows } = await db.pool.query<{ ticket_id: string; created_by: string | null }>(
    'SELECT ticket_id, created_by FROM proj_tickets WHERE ticket_id = ANY($1::text[]) ORDER BY ticket_id',
    [ticketIds],
  );
  return rows;
}

async function rebuildAll(): Promise<ReturnType<typeof buildProjectionRegistry>> {
  const projections = buildProjectionRegistry();
  for (const projection of projections.all()) {
    await rebuildProjection(projection.name, { pool: db.pool, projections });
  }
  return projections;
}

beforeAll(async () => {
  db = await createTestDatabase();
  // The founding sequence the ticket projection's `loadDeps` needs: a project,
  // two members, a workflow and a ticket type, all through real events.
  await applyCommitted(db.pool, [
    ev(U1, { kind: 'workspace', id: WS }, 'workspace.created', { name: 'Created-by world' }),
    ev(U1, { kind: 'project', id: PROJECT }, 'project.created', { name: 'Registrations' }),
    ev(U1, { kind: 'membership', id: membershipId(WS, U1) }, 'membership.granted', { userId: U1, role: 'owner' }),
    ev(U1, { kind: 'membership', id: membershipId(WS, U2) }, 'membership.granted', { userId: U2, role: 'member' }),
    ev(U1, { kind: 'workflow', id: WORKFLOW }, 'workflow.defined', {
      id: WORKFLOW,
      version: 1,
      name: 'Errands',
      initialStateId: 'todo',
      states: [
        { id: 'todo', name: 'To do', category: 'open' },
        { id: 'doing', name: 'Doing', category: 'active' },
        { id: 'done', name: 'Done', category: 'terminal' },
      ],
      transitions: [
        { from: '*', to: 'todo', rules: [] },
        { from: '*', to: 'doing', rules: [] },
        { from: '*', to: 'done', rules: [] },
      ],
    }),
    ev(U1, { kind: 'ticket-type', id: TYPE }, 'ticket-type.defined', {
      id: TYPE,
      name: 'Task',
      icon: 'check',
      rank: 1,
      workflowId: WORKFLOW,
      fields: [],
    }),
  ]);
}, 120_000);

afterAll(async () => {
  await db.drop();
});

describe('30.001 the migration backfills created_by from each ticket.created actor', () => {
  it('30.001 two tickets created by U1 and U2 backfill to their creators (not to a later actor), a rebuild agrees, and the verifier compares the column', async () => {
    const { up, down } = halves();
    const t1 = `0MWGCB${'0'.repeat(19)}1`;
    const t2 = `0MWGCB${'0'.repeat(19)}2`;
    // t1 is created by U1 and then TOUCHED by U2 (an assignment and a
    // transition): a backfill that read the LATEST actor on the ticket's stream
    // would answer U2 for it. t2 is created by U2 and never touched again.
    await applyCommitted(db.pool, [
      createTicket(t1, U1),
      createTicket(t2, U2),
      ev(U2, { kind: 'ticket', id: t1 }, 'ticket.assigned', { assigneeId: U2 }),
      ev(U2, { kind: 'ticket', id: t1 }, 'ticket.transitioned', { to: 'doing' }),
    ]);

    // Put the table back where production stands BEFORE the migration (the
    // Down half is under test too: it must drop the column and its index
    // cleanly), then run the Up half over the rows the old projection wrote.
    await db.pool.query(down);
    const { rows: gone } = await db.pool.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_name = 'proj_tickets' AND column_name = 'created_by'`,
    );
    expect(gone).toEqual([]);
    await db.pool.query(up);

    const backfilled = await createdBy([t1, t2]);
    // CONTROL, same `it`: t2 (one event, by its creator) backfills to U2, so
    // the U1 answer for t1 is the backfill reading the CREATION event rather
    // than whichever event came last.
    expect(backfilled).toEqual([
      { ticket_id: t1, created_by: U1 },
      { ticket_id: t2, created_by: U2 },
    ]);

    // The rebuild path writes the same column from the same ledger, and the
    // verifier finds the backfilled live table equal to a fresh replay.
    const projections = await rebuildAll();
    expect(await createdBy([t1, t2])).toEqual(backfilled);
    expect(await verifyProjections({ pool: db.pool, projections })).toEqual({ clean: true, diffs: [] });

    // And the verifier can SEE the column: a created_by rewritten behind the
    // ledger is reported, so "clean" above means the column was compared.
    await db.pool.query('UPDATE proj_tickets SET created_by = $2 WHERE ticket_id = $1', [t1, U2]);
    const report = await verifyProjections({ pool: db.pool, projections });
    expect(report.clean).toBe(false);
    expect(report.diffs.map((diff) => diff.table)).toEqual(['proj_tickets']);
    await db.pool.query('UPDATE proj_tickets SET created_by = $2 WHERE ticket_id = $1', [t1, U1]);
    expect(await verifyProjections({ pool: db.pool, projections })).toEqual({ clean: true, diffs: [] });
  });
});

describe('30.002 the projection writes created_by once, on ticket.created', () => {
  it('30.002 a ticket created by U2 after the migration carries U2; later events by U1 reach the row but leave created_by alone', async () => {
    const t3 = `0MWGCB${'0'.repeat(19)}3`;
    await applyCommitted(db.pool, [createTicket(t3, U2)]);
    expect(await createdBy([t3])).toEqual([{ ticket_id: t3, created_by: U2 }]);

    // Three later events, every one by U1, each of which re-runs the upsert.
    await applyCommitted(db.pool, [
      ev(U1, { kind: 'ticket', id: t3 }, 'ticket.assigned', { assigneeId: U1 }),
      ev(U1, { kind: 'ticket', id: t3 }, 'ticket.transitioned', { to: 'doing' }),
      ev(U1, { kind: 'ticket', id: t3 }, 'ticket.field_set', { fieldId: 'title', value: 'Renamed by U1' }),
    ]);
    const { rows } = await db.pool.query<{ created_by: string | null; assignee_id: string | null; state_id: string }>(
      'SELECT created_by, assignee_id, state_id FROM proj_tickets WHERE ticket_id = $1',
      [t3],
    );
    // CONTROL, same row: U1's events DID reach it (assignee and state moved),
    // so the unchanged created_by is the write-once rule, not an upsert that
    // never ran.
    expect(rows).toEqual([{ created_by: U2, assignee_id: U1, state_id: 'doing' }]);

    // A replay of the same ledger lands on the same value.
    const projections = await rebuildAll();
    expect(await createdBy([t3])).toEqual([{ ticket_id: t3, created_by: U2 }]);
    expect(await verifyProjections({ pool: db.pool, projections })).toEqual({ clean: true, diffs: [] });
  });
});
