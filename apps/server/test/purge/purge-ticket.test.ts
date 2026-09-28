import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid, purgeCompletedPayload, SYSTEM_ACTOR_PURGE } from '@gisik-nokma/domain';
import { buildProjectionRegistry } from '../../src/projections/index.js';
import { purgeItem, type PurgeDeps } from '../../src/purge/purge-item.js';
import { ticketNumbers } from '../../src/read/ticket-numbers.js';
import { verifyProjections } from '../../src/tools/verify-projections.js';
import { resetEntitySeqs } from '../helpers/apply.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { scan } from './scan.js';
import { buildTicketWorld, dueAt, recordingStore } from './world.js';

/**
 * Spec §5.2–§5.5, §8 "Purge" — erasing one ticket. Cases 19.110–19.117
 * (`test-cases/19-trash.md` §19.13). Each case builds its own world in one
 * shared database; 19.114 verifies the WHOLE database, so it runs last and
 * covers every purge above it.
 */

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase();
  resetEntitySeqs();
}, 60_000);

afterAll(async () => {
  await db.drop();
});

function deps(now: Date, store = recordingStore()): PurgeDeps {
  return { projections: buildProjectionRegistry(), store, now };
}

async function one<T>(sql: string, params: unknown[]): Promise<T> {
  const { rows } = await db.pool.query(sql, params);
  return rows[0] as T;
}

describe('19.110 nothing keyed by the purged ticket or its child survives', () => {
  it('leaves only the redacted creations, the tombstone, their heads and the registry; the sibling is whole', async () => {
    const w = await buildTicketWorld(db.pool);
    const outcome = await purgeItem(db.pool, { kind: 'ticket', id: w.T }, deps(await dueAt(db.pool, 'ticket', w.T)));
    expect(outcome.status).toBe('purged');
    expect(await scan(db.pool, [w.T, w.C])).toEqual({
      'events.entity_id': 3,
      'proj_entity_heads.entity_id': 2,
      'purged_entities.entity_id': 2,
    });
    // CONTROL — the sibling S1 keeps every row the world gave it.
    expect(await scan(db.pool, [w.S1])).toMatchObject({
      'proj_tickets.ticket_id': 1,
      'proj_search.ticket_id': 1,
      'attachments.ticket_id': 1,
      'proj_contested.ticket_id': 1,
      'snapshots.entity_id': 1,
    });
  });
});

describe('19.111 the purged content is nowhere', () => {
  it('finds the marker in eight columns before and in none after', async () => {
    const w = await buildTicketWorld(db.pool);
    const before = await scan(db.pool, [w.marker]);
    expect(Object.keys(before)).toEqual(
      expect.arrayContaining([
        'events.payload',
        'proj_tickets.fields',
        'proj_search.title',
        'proj_search.description',
        'proj_search.comments',
        'proj_ticket_comments.body',
        'attachments.filename',
        'notifications.payload',
        'snapshots.state',
      ]),
    ); // CONTROL
    await purgeItem(db.pool, { kind: 'ticket', id: w.T }, deps(await dueAt(db.pool, 'ticket', w.T)));
    expect(await scan(db.pool, [w.marker])).toEqual({});
  });
});

describe('19.112 a later ticket keeps its key', () => {
  it('numbers S2 4 before and after; the two redacted creations hold the slots', async () => {
    const w = await buildTicketWorld(db.pool);
    expect((await ticketNumbers(db.pool, w.WS, [w.S2])).get(w.S2)).toBe(4);
    await purgeItem(db.pool, { kind: 'ticket', id: w.T }, deps(await dueAt(db.pool, 'ticket', w.T)));
    expect((await ticketNumbers(db.pool, w.WS, [w.S2])).get(w.S2)).toBe(4);
    const redacted = await one<{ n: number }>(
      `SELECT count(*)::int AS n FROM events
        WHERE workspace_id = $1 AND type = 'ticket.created' AND payload = jsonb_build_object('projectId', $2::text, 'purged', true)`,
      [w.WS, w.P],
    );
    expect(redacted.n).toBe(2); // CONTROL
  });
});

describe('19.113 the tombstone is the only new event, at the captured positions', () => {
  it('files purge.completed on T by the system actor at old max + 1 on both sequences', async () => {
    const w = await buildTicketWorld(db.pool);
    const maxWs = (await one<{ n: number }>('SELECT max(workspace_seq)::int AS n FROM events WHERE workspace_id = $1', [w.WS])).n;
    const maxT = (
      await one<{ n: number }>(`SELECT max(seq)::int AS n FROM events WHERE entity_kind = 'ticket' AND entity_id = $1`, [w.T])
    ).n;
    const idsBefore = (await db.pool.query<{ id: string }>('SELECT id FROM events WHERE workspace_id = $1', [w.WS])).rows.map(
      (row) => row.id,
    );
    const markedAt = (
      await one<{ at: Date }>('SELECT purge_marked_at AS at FROM proj_tickets WHERE ticket_id = $1', [w.T])
    ).at.toISOString();

    const outcome = await purgeItem(db.pool, { kind: 'ticket', id: w.T }, deps(await dueAt(db.pool, 'ticket', w.T)));

    const fresh = await db.pool.query(
      `SELECT id, entity_kind, entity_id, type, actor_id, origin, seq::int AS seq, workspace_seq::int AS workspace_seq, payload
         FROM events WHERE workspace_id = $1 AND NOT (id = ANY($2::text[]))`,
      [w.WS, idsBefore],
    );
    expect(fresh.rows).toEqual([
      {
        id: outcome.status === 'purged' ? outcome.tombstoneId : 'unreachable',
        entity_kind: 'ticket',
        entity_id: w.T,
        type: 'purge.completed',
        actor_id: SYSTEM_ACTOR_PURGE,
        origin: 'server',
        seq: maxT + 1,
        workspace_seq: maxWs + 1,
        payload: { kind: 'ticket', markedBy: w.OWNER, markedAt },
      },
    ]);
    expect(purgeCompletedPayload.safeParse(fresh.rows[0]?.payload).success).toBe(true); // CONTROL
  });
});

describe('19.115 purgeItem skips what is not due, not marked, unknown or already erased', () => {
  it('answers each skip reason, and purges at exactly the due instant', async () => {
    const w = await buildTicketWorld(db.pool);
    const due = await dueAt(db.pool, 'ticket', w.T);
    expect(await purgeItem(db.pool, { kind: 'ticket', id: w.T }, deps(new Date(due.getTime() - 1)))).toMatchObject({
      status: 'skipped',
      reason: 'not-due',
    });
    expect(await purgeItem(db.pool, { kind: 'ticket', id: w.S1 }, deps(due))).toMatchObject({
      status: 'skipped',
      reason: 'not-marked',
    });
    expect(await purgeItem(db.pool, { kind: 'ticket', id: newUlid() }, deps(due))).toMatchObject({
      status: 'skipped',
      reason: 'not-found',
    });
    // CONTROL — at exactly the due instant, the same ticket is purged.
    expect((await purgeItem(db.pool, { kind: 'ticket', id: w.T }, deps(due))).status).toBe('purged');
    expect(await purgeItem(db.pool, { kind: 'ticket', id: w.T }, deps(due))).toMatchObject({
      status: 'skipped',
      reason: 'already-purged',
    });
  });
});

describe('19.116 the purged ticket’s object is deleted after commit', () => {
  it('deletes exactly T’s key, empties its queue row, and leaves S1’s attachment', async () => {
    const w = await buildTicketWorld(db.pool);
    const store = recordingStore();
    const outcome = await purgeItem(db.pool, { kind: 'ticket', id: w.T }, deps(await dueAt(db.pool, 'ticket', w.T), store));
    expect(store.deleted).toEqual([w.keyT]);
    expect(outcome).toMatchObject({ status: 'purged', objectsDeleted: 1, objectsPending: 0 });
    expect(
      (await one<{ n: number }>('SELECT count(*)::int AS n FROM purge_pending_objects WHERE object_key = $1', [w.keyT])).n,
    ).toBe(0);
    // CONTROL
    expect((await one<{ n: number }>('SELECT count(*)::int AS n FROM attachments WHERE ticket_id = $1', [w.S1])).n).toBe(1);
  });
});

describe('19.117 a failing object delete stays queued; the ledger half is committed', () => {
  it('keeps the key with attempts = 1 and the error, and has erased T', async () => {
    const w = await buildTicketWorld(db.pool);
    const store = recordingStore(new Set([w.keyT]));
    const outcome = await purgeItem(db.pool, { kind: 'ticket', id: w.T }, deps(await dueAt(db.pool, 'ticket', w.T), store));
    expect(outcome).toMatchObject({ status: 'purged', objectsDeleted: 0, objectsPending: 1 });
    const queued = await db.pool.query(
      'SELECT object_key, attempts, last_error FROM purge_pending_objects WHERE object_key = $1',
      [w.keyT],
    );
    expect(queued.rows).toEqual([{ object_key: w.keyT, attempts: 1, last_error: `boom: ${w.keyT}` }]);
    // CONTROL — the transaction committed before the object delete was tried.
    const left = await db.pool.query<{ type: string }>(
      `SELECT type FROM events WHERE entity_kind = 'ticket' AND entity_id = $1 ORDER BY seq`,
      [w.T],
    );
    expect(left.rows.map((row) => row.type)).toEqual(['ticket.created', 'purge.completed']);
  });
});

describe('19.114 the projections verify clean after every purge above', () => {
  it('reports no drift, over non-empty tables', async () => {
    const w = await buildTicketWorld(db.pool);
    await purgeItem(db.pool, { kind: 'ticket', id: w.T }, deps(await dueAt(db.pool, 'ticket', w.T)));
    for (const table of ['proj_tickets', 'proj_search', 'proj_visibility', 'proj_contested', 'proj_entity_heads']) {
      const { rows } = await db.pool.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${table}`);
      expect(rows[0]?.n, `${table} is empty — a clean verdict over it proves nothing`).toBeGreaterThan(0);
    } // CONTROL
    const report = await verifyProjections({ pool: db.pool, projections: buildProjectionRegistry() });
    expect(report).toEqual({ clean: true, diffs: [] });
  });
});
