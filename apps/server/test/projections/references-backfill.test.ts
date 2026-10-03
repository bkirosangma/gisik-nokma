import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { newUlid, type LedgerEvent } from '@gisik-nokma/domain';
import { insertEvent, lockEntity, lockWorkspace } from '../../src/ledger/event-store.js';
import { backfillReferences } from '../../src/projections/backfill-references.js';
import { buildProjectionRegistry } from '../../src/projections/index.js';
import { verifyProjections } from '../../src/tools/verify-projections.js';
import { applyCommitted, makeCommitted, resetEntitySeqs } from '../helpers/apply.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';

let db: TestDatabase;
const WS = newUlid();
const ACTOR = newUlid();
const T1 = newUlid(), T2 = newUlid(), N1 = newUlid(), X = newUlid();
const chip = (ticketId: string) => ({ type: 'ticketRef', attrs: { ticketId, projectId: 'P1', key: 'GN-1', title: 'Chiller' } });
const body = (...inline: unknown[]) => ({ type: 'doc', content: [{ type: 'paragraph', content: inline }] });
const ev = (kind: 'ticket' | 'note', id: string, type: string, payload: unknown): LedgerEvent =>
  makeCommitted({ workspaceId: WS, actorId: ACTOR, entity: { kind, id }, type, payload });
const deps = (probe?: Parameters<typeof backfillReferences>[1]['probe']) => ({ projections: buildProjectionRegistry(), ...(probe === undefined ? {} : { probe }) });
const snapshot = async () => (await db.pool.query('SELECT * FROM proj_references ORDER BY source_kind, source_id, ordinal')).rows;
/** The state the migration leaves on a ledger that predates it: an empty table, no marker. */
const asIfJustMigrated = async () => {
  await db.pool.query('TRUNCATE proj_references');
  await db.pool.query('DELETE FROM projection_backfills');
};

/**
 * Ingest's own locking skeleton (ingest-service.ts:170-378: BEGIN, lockWorkspace, lockEntity,
 * insertEvent, every projection's apply, COMMIT). `applyCommitted` takes NO locks
 * (helpers/apply.ts:123-125), so a race test built on it would observe nothing.
 */
async function ingestLike(envelope: LedgerEvent): Promise<void> {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    await lockWorkspace(client, envelope.workspaceId);
    await lockEntity(client, envelope.entity.kind, envelope.entity.id);
    await insertEvent(client, envelope);
    for (const projection of buildProjectionRegistry().all()) await projection.apply(envelope, client);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

beforeAll(async () => {
  db = await createTestDatabase();
  resetEntitySeqs();
  await applyCommitted(db.pool, [
    ev('ticket', T1, 'ticket.field_set', { fieldId: 'description', value: body(chip(X)) }),
    ev('ticket', T1, 'comment.added', { body: body(chip(T2)) }),
    ev('ticket', T2, 'ticket.field_set', { fieldId: 'description', value: body(chip(T1)) }),
    ev('note', N1, 'note.body_set', { body: body(chip(T1)) }),
  ]);
});
afterAll(async () => {
  await db.drop();
});

describe('27.119 first boot: the backfill fills the table from the ledger and records the marker', () => {
  it('27.119 rows equal the live-applied rows, verifyProjections is clean, the marker names the entity count', async () => {
    const live = await snapshot();
    expect(live.length).toBe(4); // CONTROL: the live path wrote four rows
    await asIfJustMigrated();
    expect(await snapshot()).toEqual([]);
    const result = await backfillReferences(db.pool, deps());
    expect(result).toMatchObject({ ran: true, entities: 3 });
    expect(await snapshot()).toEqual(live);
    expect((await db.pool.query('SELECT name, entities FROM projection_backfills')).rows).toEqual([{ name: 'proj_references', entities: '3' }]);
    expect(await verifyProjections({ pool: db.pool, projections: buildProjectionRegistry() })).toEqual({ clean: true, diffs: [] });
  });
});

describe('27.120 second boot: the marker is there, so the backfill does nothing', () => {
  it('27.120 with the marker an emptied table stays empty; without it the same call fills it (control)', async () => {
    await db.pool.query('TRUNCATE proj_references'); // marker kept
    expect(await backfillReferences(db.pool, deps())).toMatchObject({ ran: false });
    expect(await snapshot()).toEqual([]);
    await db.pool.query('DELETE FROM projection_backfills');
    expect(await backfillReferences(db.pool, deps())).toMatchObject({ ran: true });
    expect((await snapshot()).length).toBe(4);
  });
});

describe('27.121 a crash mid-run leaves no marker, and the next boot re-runs to completion', () => {
  it('27.121 a throw after the first entity: the run rejects, no marker, partial rows; the next run completes', async () => {
    const live = await snapshot();
    await asIfJustMigrated();
    const crash = deps(async (stage, _entity, index) => {
      if (stage === 'committed' && index === 0) throw new Error('simulated crash');
    });
    await expect(backfillReferences(db.pool, crash)).rejects.toThrow('simulated crash');
    expect((await db.pool.query('SELECT 1 FROM projection_backfills')).rowCount).toBe(0);
    expect((await snapshot()).length).toBeLessThan(4);
    // The session lock was released with the crashed run, or this second run would report ran: false.
    expect(await backfillReferences(db.pool, deps())).toMatchObject({ ran: true });
    expect(await snapshot()).toEqual(live);
  });
});

describe('27.122 an event committed DURING the backfill is in the table afterwards', () => {
  // One envelope for both its: the control runs FIRST, before the event exists in the ledger.
  const late = ev('ticket', T1, 'comment.added', { body: body(chip(N1)) });
  const lateRow = async () => (await db.pool.query('SELECT 1 FROM proj_references WHERE source_kind = $1 AND source_id = $2', ['comment', late.id])).rowCount;

  it('27.122 control: the same run, the same probe point, no concurrent event: no such row, four rows', async () => {
    await asIfJustMigrated();
    let reached = false;
    await backfillReferences(db.pool, deps(async (stage, entity) => {
      if (stage === 'replaying' && entity.id === T1) reached = true;
    }));
    expect(reached).toBe(true);
    expect(await lateRow()).toBe(0);
    expect((await snapshot()).length).toBe(4);
  });

  it('27.122 an ingest on the entity being replayed waits for its lock, then lands; the backfill completes', async () => {
    await asIfJustMigrated();
    let pending: Promise<void> | null = null;
    const result = await backfillReferences(
      db.pool,
      deps(async (stage, entity) => {
        if (stage !== 'replaying' || entity.id !== T1 || pending !== null) return;
        pending = ingestLike(late);
        // Wait until the ingest is BLOCKED on T1's entity lock, which this transaction holds.
        for (let i = 0; i < 200; i += 1) {
          const { rows } = await db.pool.query<{ n: number }>("SELECT count(*)::int AS n FROM pg_locks WHERE locktype = 'advisory' AND NOT granted");
          if ((rows[0]?.n ?? 0) > 0) return;
          await new Promise((r) => setTimeout(r, 10));
        }
        throw new Error('the concurrent ingest never waited on the entity lock');
      }),
    );
    await pending;
    expect(result).toMatchObject({ ran: true });
    expect(await lateRow()).toBe(1);
    expect((await snapshot()).length).toBe(5);
    expect(await verifyProjections({ pool: db.pool, projections: buildProjectionRegistry() })).toEqual({ clean: true, diffs: [] });
  });
});
