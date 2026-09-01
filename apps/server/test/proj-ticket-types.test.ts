import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PoolClient } from 'pg';
import { newUlid, type LedgerEvent, type TicketTypeDef } from '@gisik-nokma/domain';
import { insertEvent, readLedger } from '../src/ledger/event-store.js';
import { buildProjectionRegistry } from '../src/projections/index.js';
import { rebuildProjection } from '../src/projections/rebuild.js';
import { getTicketTypeFromDb, ticketTypesProjection } from '../src/projections/ticket-types.js';
import { createTestDatabase, type TestDatabase } from './helpers/db.js';

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase();
});

afterAll(async () => {
  await db.drop();
});

const HOME = newUlid();
const FOREIGN = newUlid();
/** The ordering case gets its own workspace: `events` is append-only, so the
 * rows it inserts outlive every later reset and must not reach another case. */
const ORDERING = newUlid();
const ACTOR = newUlid();

/**
 * `entity.id` is a fresh ULID and the payload's `id` is the type key — the shape
 * `foundingSequence` uses and the only one the envelope schema permits, since a
 * non-membership entity id must match `ULID_REGEX` and `invoice` never will.
 * Every caller here therefore writes the SAME projection key from a DIFFERENT
 * entity stream, which is the whole subject of the last case in this file.
 */
function typeDefined(
  workspaceId: string,
  def: TicketTypeDef,
  workspaceSeq: number,
  entityId: string = newUlid(),
): LedgerEvent {
  return {
    id: newUlid(),
    workspaceId,
    entity: { kind: 'ticket-type', id: entityId },
    type: 'ticket-type.defined',
    version: 1,
    payload: def,
    actorId: ACTOR,
    origin: 'web',
    clientTime: '2026-08-20T09:00:00.000Z',
    serverTime: '2026-08-20T09:00:01.000Z',
    // The per-entity counter is 1 for every one of these: each definition is the
    // first (and only) event of its own fresh entity. `workspaceSeq` is the only
    // counter that separates them, which is exactly why the projection resolves
    // last-definition-wins on it.
    seq: 1,
    workspaceSeq,
  };
}

const INVOICE: TicketTypeDef = {
  id: 'invoice',
  name: 'Invoice',
  icon: 'receipt',
  rank: 3,
  workflowId: 'wf-basic',
  fields: [
    { id: 'amount', name: 'Invoice amount', type: 'number' },
    { id: 'stage', name: 'Stage', type: 'select', options: ['Draft', 'Sent', 'Paid'] },
  ],
};

async function withClient<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await db.pool.connect();
  try {
    return await work(client);
  } finally {
    client.release();
  }
}

async function apply(...events: LedgerEvent[]): Promise<void> {
  await withClient(async (client) => {
    for (const event of events) {
      await ticketTypesProjection.apply(event, client);
    }
  });
}

async function rowsFor(workspaceId: string): Promise<unknown[]> {
  const { rows } = await db.pool.query(
    'SELECT * FROM proj_ticket_types WHERE workspace_id = $1 ORDER BY type_id',
    [workspaceId],
  );
  return rows;
}

describe('proj_ticket_types', () => {
  beforeEach(async () => {
    await withClient((client) => ticketTypesProjection.reset(client));
  });

  it('a defined type reads back whole, and the same key in another workspace is not found', async () => {
    await apply(typeDefined(HOME, INVOICE, 10));

    // The full definition, fields included: `fields` is jsonb, so this is also
    // what says the select field's options survived the round trip rather than
    // arriving as a string.
    expect(await getTicketTypeFromDb(db.pool, HOME, 'invoice')).toEqual(INVOICE);

    // A type key is an actor-chosen slug, so `invoice` is a name many workspaces
    // will use at once. Unscoped, this lookup would hand one tenancy another's
    // rank, workflow binding and field list (controller ruling P14's shape). The
    // assertion above is this one's positive control — the reader demonstrably
    // CAN find this row, so "not found" here is the workspace clause and not an
    // empty table.
    expect(await getTicketTypeFromDb(db.pool, FOREIGN, 'invoice')).toBeNull();

    // And a key nothing defined is null in the workspace that DOES hold a type,
    // so the null above is not simply what this reader always says.
    expect(await getTicketTypeFromDb(db.pool, HOME, 'expense')).toBeNull();
  });

  it('last definition wins — a type is its newest definition, not its first', async () => {
    await apply(
      typeDefined(HOME, INVOICE, 10),
      typeDefined(HOME, { ...INVOICE, name: 'Bill', rank: 6, workflowId: 'wf-billing', fields: [] }, 20),
    );

    const current = await getTicketTypeFromDb(db.pool, HOME, 'invoice');
    expect(current).toEqual({
      id: 'invoice',
      name: 'Bill',
      icon: 'receipt',
      rank: 6,
      workflowId: 'wf-billing',
      fields: [],
    });

    // One row, not two: a re-definition supersedes, it does not accumulate.
    expect(await rowsFor(HOME)).toHaveLength(1);
  });

  it('a re-delivered definition is inert — the row keeps the provenance it had', async () => {
    const first = typeDefined(HOME, INVOICE, 10);
    await apply(first, first);
    expect(await rowsFor(HOME)).toHaveLength(1);

    // Idempotence is what makes a rebuild safe to run twice, and the `>` in the
    // upsert's WHERE is what provides it: at equal stream positions the incoming
    // row is the row already there.
    await apply(first);
    expect(await getTicketTypeFromDb(db.pool, HOME, 'invoice')).toEqual(INVOICE);
  });

  /**
   * THE case this table's extra column exists for.
   *
   * One type key is written by MANY entity streams — `foundingSequence` files
   * each `ticket-type.defined` at a fresh entity ULID and the envelope schema
   * forbids the type key from being one. Live application sees events in arrival
   * order; `readLedger` replays them `ORDER BY entity_kind, entity_id, seq`. For
   * a key one stream owns those agree. Here they need not, and this case makes
   * them disagree on purpose: the LATER definition is filed at the SMALLER
   * entity ULID, so canonical replay hands it over first.
   *
   * The replay order is OBSERVED from `readLedger`, not asserted from what this
   * test believes canonical order to be — and the two orders are asserted to
   * DIFFER before anything is compared, because a determinism check that replays
   * the order it applied proves nothing.
   *
   * Delete the `WHERE EXCLUDED.defined_workspace_seq > …` clause and this goes
   * red: live keeps the rank-6 definition, the rebuild keeps the rank-2 one, and
   * `tools/verify-projections.ts` would report the pair as drift in production.
   */
  it('a rebuild in canonical replay order reproduces what live holds, though the two orders differ', async () => {
    // Valid ULIDs by ULID_REGEX (`^[0-7][0-9A-HJKMNP-TV-Z]{25}$`), chosen so
    // that entity-id order is the REVERSE of arrival order.
    const LATE_BUT_SMALLEST = '00000000000000000000000000';
    const EARLY_BUT_LARGEST = '7ZZZZZZZZZZZZZZZZZZZZZZZZZ';

    const arrival = [
      typeDefined(ORDERING, { ...INVOICE, name: 'Invoice v1', rank: 2 }, 10, EARLY_BUT_LARGEST),
      typeDefined(ORDERING, { ...INVOICE, name: 'Invoice v2', rank: 6 }, 20, LATE_BUT_SMALLEST),
    ];

    await withClient(async (client) => {
      for (const event of arrival) {
        await insertEvent(client, event);
        await ticketTypesProjection.apply(event, client);
      }
    });

    // Live holds the definition at the greater workspace stream position.
    expect((await getTicketTypeFromDb(db.pool, ORDERING, 'invoice'))?.name).toBe('Invoice v2');
    const live = await rowsFor(ORDERING);
    expect(live).toHaveLength(1);

    // The orders differ — observed, not assumed.
    const replayed = (await readLedger(db.pool))
      .filter((event) => event.workspaceId === ORDERING)
      .map((event) => event.entity.id);
    const arrived = arrival.map((event) => event.entity.id);
    expect(replayed).not.toEqual(arrived);
    // ...and they are the same two events in a different order, not a filter
    // that dropped one — which would make the inequality above true for the
    // wrong reason.
    expect([...replayed].sort()).toEqual([...arrived].sort());

    await rebuildProjection('proj_ticket_types', {
      pool: db.pool,
      projections: buildProjectionRegistry(),
    });

    // Every column, not just the rank: `defined_by`, `defined_at` and
    // `defined_workspace_seq` all move together when the wrong definition wins.
    expect(await rowsFor(ORDERING)).toEqual(live);
    // Named separately, because two tables that agree on the WRONG definition
    // would satisfy the comparison above.
    expect((await getTicketTypeFromDb(db.pool, ORDERING, 'invoice'))?.name).toBe('Invoice v2');
  });
});
