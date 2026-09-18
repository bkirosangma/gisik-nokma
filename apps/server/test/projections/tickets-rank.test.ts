import { fileURLToPath } from 'node:url';
import { runner } from 'node-pg-migrate';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid } from '@gisik-nokma/domain';
import { rowToTicketState } from '../../src/projections/tickets.js';
import { applyCommitted, makeCommitted } from '../helpers/apply.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';

/**
 * Task 3 (backlog/closed second wave, spec §8.1, 2026-09-18) —
 * `proj_tickets.rank`, the column `ticket.ranked` now projects into and
 * `rowToTicketState` reads back out.
 *
 * This file is `tickets-closed.test.ts`'s sibling by construction: the same
 * projection, the same one-field fold, the same `applyCommitted` seeding
 * (which carries no rule engine — `./apply.js`'s own header — so the only
 * thing that needs to be true of these fixtures is that `applyTicketEvent`
 * accepts them, not that the real rank door would).
 *
 * **The decision this task inherited and settles is measured here too.**
 * Task 1 left `rank` UNWRITTEN by the creation branch, because
 * `rowToTicketState` builds a `TicketState` from COLUMNS and there was no
 * `rank` column yet. Task 3 creates the column, and the answer it lands on is
 * that creation now writes `rank: null` — so `rowToTicketState` reads the
 * column UNCONDITIONALLY (`rank: row.rank`), exactly as it reads `closed_at`
 * and `closed_by` unconditionally. The alternative — omitting the key when the
 * column is NULL — was not available: `apps/server/test/dual-client/
 * scenarios.test.ts:203` and `rig.test.ts:92`/`:315` compare a whole
 * `TicketState` with `toEqual`, so a reducer that omits while the server read
 * emits `null` is a red rig; and making the server read omit too would put an
 * ABSENT key on the ticket-detail wire for every unranked ticket, which is the
 * shape case 13.603's second `it` exists to forbid.
 */

const MIGRATIONS_DIR = fileURLToPath(new URL('../../migrations', import.meta.url));
/** The numeric prefix of this task's migration — the one whose Down is exercised below. */
const RANK_MIGRATION_PREFIX = '1789200000000';

let db: TestDatabase;

const WS = newUlid();
const PRJ = newUlid();
const WF = newUlid();
const TYPE_ID = 'rank-spec-task';

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
        name: 'Rank-spec flow',
        initialStateId: 'todo',
        states: [
          { id: 'todo', name: 'To do', category: 'open' },
          { id: 'doing', name: 'Doing', category: 'active' },
        ],
        transitions: [
          { from: '*', to: 'todo', rules: [] },
          { from: '*', to: 'doing', rules: [] },
        ],
      },
    }),
    makeCommitted({
      workspaceId: WS,
      actorId: newUlid(),
      entity: { kind: 'ticket-type', id: TYPE_ID },
      type: 'ticket-type.defined',
      payload: { id: TYPE_ID, name: 'Rank-spec task', icon: 'check', rank: 3, workflowId: WF, fields: [] },
    }),
  ]);
}, 60_000);

afterAll(async () => {
  await db.drop();
});

/** The full row, exactly as `rowToTicketState` needs it — see that function's own note on why `SELECT *` is the shape every reader of this table uses. */
async function rowFor(ticketId: string) {
  const { rows } = await db.pool.query('SELECT * FROM proj_tickets WHERE ticket_id = $1', [ticketId]);
  return rows[0];
}

async function columnsOf(pool: TestDatabase['pool']): Promise<string[]> {
  const { rows } = await pool.query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'proj_tickets'`,
  );
  return rows.map((row) => row.column_name);
}

describe('13.702 proj_tickets carries rank', () => {
  it('a backlog ticket starts rank NULL; a ticket.ranked lands its key; a later created row is NULL again', async () => {
    const ticketId = newUlid();
    const actorId = newUlid();

    await applyCommitted(db.pool, [
      makeCommitted({
        workspaceId: WS,
        actorId,
        entity: { kind: 'ticket', id: ticketId },
        type: 'ticket.created',
        payload: { typeId: TYPE_ID, projectId: PRJ, parentId: null, title: 'File the return', start: 'backlog' },
      }),
    ]);
    // The positive control for the ranking below, in the same test: the column
    // exists AND is NULL for a ticket nobody has ranked. Without it a migration
    // that never added the column at all would leave every assertion here
    // reading `undefined`, which is NOT the same claim as "the row says NULL".
    let row = await rowFor(ticketId);
    expect(row.rank).toBeNull();

    const rankEvent = makeCommitted({
      workspaceId: WS,
      actorId,
      entity: { kind: 'ticket', id: ticketId },
      type: 'ticket.ranked',
      payload: { rank: 'i' },
    });
    await applyCommitted(db.pool, [rankEvent]);

    row = await rowFor(ticketId);
    // Mutation target: drop `rank` from the INSERT's column list, or drop
    // `rank = EXCLUDED.rank` from the ON CONFLICT SET list, and BOTH redden
    // this very assertion. That is measured, not assumed — and the first
    // version of this comment claimed the two halves "redden separately", with
    // the second half reddening only on the RE-RANK below. **That was false**,
    // and an independent reviewer caught it: `ticket.created` already inserted
    // the row (`:101-114`), so even the FIRST `ticket.ranked` travels the
    // `ON CONFLICT … DO UPDATE` path, and the ON CONFLICT mutation reddens HERE
    // (`expected null to be 'i'` at this line, measured) rather than at `:145`,
    // which is never reached. The INSERT-half mutant reddens the identical pair
    // of assertions, so these two tests cannot tell the halves apart. The claim
    // that survives is the weaker one: both halves of the write are pinned.
    expect(row.rank).toBe('i');

    // A re-rank reaches an EXISTING row. Kept as a behavioural assertion, NOT
    // as coverage of the ON CONFLICT half — the paragraph above is the reason:
    // no mutation tried here distinguishes a second ranking from the first, so
    // this block's marginal coverage over the assertions above is undemonstrated
    // rather than established. It stays because "a second `ticket.ranked` on the
    // same ticket is not ignored" is a real property of the projection that a
    // future change could break on its own; it does not stay as a witness for
    // anything else.
    await applyCommitted(db.pool, [
      makeCommitted({
        workspaceId: WS,
        actorId,
        entity: { kind: 'ticket', id: ticketId },
        type: 'ticket.ranked',
        payload: { rank: 'n' },
      }),
    ]);
    expect((await rowFor(ticketId)).rank).toBe('n');

    // A ticket created AFTER the migration starts NULL, not 'n' and not
    // undefined — the column's own default, not a neighbour's value.
    const laterId = newUlid();
    await applyCommitted(db.pool, [
      makeCommitted({
        workspaceId: WS,
        actorId,
        entity: { kind: 'ticket', id: laterId },
        type: 'ticket.created',
        payload: { typeId: TYPE_ID, projectId: PRJ, parentId: null, title: 'File the other', start: 'backlog' },
      }),
    ]);
    expect((await rowFor(laterId)).rank).toBeNull();
  });

  it('rowToTicketState reads the column into TicketState.rank, and NULL into null', async () => {
    const ticketId = newUlid();
    const actorId = newUlid();

    await applyCommitted(db.pool, [
      makeCommitted({
        workspaceId: WS,
        actorId,
        entity: { kind: 'ticket', id: ticketId },
        type: 'ticket.created',
        payload: { typeId: TYPE_ID, projectId: PRJ, parentId: null, title: 'Rank me', start: 'backlog' },
      }),
    ]);
    // REQUIRED on the wire (spec §8.1/§1.2) and read UNCONDITIONALLY here, so
    // the assertion is `toBeNull` and not `?? null`: the key must be PRESENT
    // and null. `?? null` would pass on an omitted field, which is precisely
    // the reducer/read-model divergence the dual-client rig compares with
    // `toEqual` (scenarios.test.ts:203).
    expect(rowToTicketState(await rowFor(ticketId)).rank).toBeNull();

    await applyCommitted(db.pool, [
      makeCommitted({
        workspaceId: WS,
        actorId,
        entity: { kind: 'ticket', id: ticketId },
        type: 'ticket.ranked',
        payload: { rank: 'i' },
      }),
    ]);
    expect(rowToTicketState(await rowFor(ticketId)).rank).toBe('i');
  });

  it('the migration Down drops the column, and leaves its neighbours alone', async () => {
    // A `down` nothing exercises is where a rename in `up` hides: the Up runs
    // in every test on this machine, the Down runs nowhere. So this test takes
    // its OWN database (the shared `db` above is mid-suite and other cases
    // need the column), asks the runner for this task's migration BY THE NAME
    // THE RUNNER ITSELF RECORDED — never a guessed naming convention — and
    // asserts the column is gone while `closed_at`, added by the migration
    // immediately before this one, is still there.
    const down = await createTestDatabase();
    try {
      expect(await columnsOf(down.pool)).toContain('rank');

      const { rows } = await down.pool.query<{ name: string }>(
        'SELECT name FROM pgmigrations ORDER BY id',
      );
      const recorded = rows.find((row) => row.name.startsWith(RANK_MIGRATION_PREFIX));
      // The positive control for the whole test: if the migration never ran,
      // the "column is gone" assertion below would be vacuously true against a
      // table that never had it.
      expect(recorded).toBeDefined();

      await runner({
        databaseUrl: down.url,
        dir: MIGRATIONS_DIR,
        direction: 'down',
        file: recorded?.name,
        migrationsTable: 'pgmigrations',
        log: () => {},
      });

      const after = await columnsOf(down.pool);
      expect(after).not.toContain('rank');
      expect(after).toContain('closed_at');
    } finally {
      await down.drop();
    }
  }, 60_000);
});
