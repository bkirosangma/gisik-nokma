import { describe, expect, it } from 'vitest';
import { newUlid } from '@gisik-nokma/domain';
import type { ErrorAlerter } from '../../src/alerts/error-alerter.js';
import { buildProjectionRegistry } from '../../src/projections/index.js';
import { purgeItem } from '../../src/purge/purge-item.js';
import { runPurgeSweep, type PurgeSweepDeps } from '../../src/purge/sweep.js';
import { applyCommitted, resetEntitySeqs } from '../helpers/apply.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import {
  buildProjectWorld,
  buildTicketWorld,
  dueAt,
  ev,
  projectCreated,
  recordingStore,
  seedWorkspace,
  ticketCreated,
} from './world.js';

/**
 * Spec §5.1, §7 — the purge sweep. Cases 19.145–19.148, 19.151
 * (`test-cases/19-trash.md` §19.17). EVERY CASE BUILDS ITS OWN DATABASE, for
 * the reason `test/auto-close/sweep.test.ts` gives: the report's counters are
 * global, so a shared database would make each case's arithmetic depend on its
 * neighbours' residue.
 */

async function withDb(fn: (db: TestDatabase) => Promise<void>): Promise<void> {
  resetEntitySeqs();
  const db = await createTestDatabase();
  try {
    await fn(db);
  } finally {
    await db.drop();
  }
}

function recordingAlerter() {
  const calls: Array<{ context: string; message: string }> = [];
  const alerter: ErrorAlerter & { calls: typeof calls } = {
    calls,
    async notify(context: string, error: unknown): Promise<void> {
      calls.push({ context, message: error instanceof Error ? error.message : String(error) });
    },
  };
  return alerter;
}

function sweepDeps(db: TestDatabase, now: Date, overrides: Partial<PurgeSweepDeps> = {}): PurgeSweepDeps {
  return {
    pool: db.pool,
    projections: buildProjectionRegistry(),
    store: recordingStore(),
    alerter: recordingAlerter(),
    now: () => now,
    log: () => {},
    ...overrides,
  };
}

async function count(db: TestDatabase, sql: string, params: unknown[]): Promise<number> {
  const { rows } = await db.pool.query<{ n: number }>(sql, params);
  return rows[0]?.n ?? 0;
}

describe('19.145 parents first; what is not due is not touched', () => {
  it('purges P2, skips B2 as already erased, and leaves the later-marked note alone', async () => {
    await withDb(async (db) => {
      const w = await buildProjectWorld(db.pool);
      await applyCommitted(db.pool, [ev(w, 'note', w.NW, 'note.deleted', {}), ev(w, 'note', w.NW, 'purge.marked', {})]);
      const now = await dueAt(db.pool, 'project', w.P2);
      const report = await runPurgeSweep(sweepDeps(db, now));
      expect(report).toMatchObject({ candidates: 2, purged: 1, skipped: 1, failed: 0 });
      expect(await count(db, `SELECT count(*)::int AS n FROM events WHERE entity_id = $1`, [w.B2])).toBe(0);
      // CONTROL — the note marked after P2 is not yet due.
      expect(await count(db, 'SELECT count(*)::int AS n FROM proj_notes WHERE note_id = $1', [w.NW])).toBe(1);
    });
  }, 60_000);
});

describe('19.146 one failure neither stops the sweep nor is forgotten', () => {
  it('purges T2 past T1’s failure, alerts once, and purges T1 on the next sweep', async () => {
    await withDb(async (db) => {
      const base = await seedWorkspace(db.pool);
      const [P, T1, T2] = [newUlid(), newUlid(), newUlid()];
      await applyCommitted(db.pool, [
        projectCreated(base, P, 'Sweep', 'SW'),
        ticketCreated(base, T1, P, 'First'),
        ticketCreated(base, T2, P, 'Second'),
        ev(base, 'ticket', T1, 'ticket.deleted', {}),
        ev(base, 'ticket', T1, 'purge.marked', {}),
        ev(base, 'ticket', T2, 'ticket.deleted', {}),
        ev(base, 'ticket', T2, 'purge.marked', {}),
      ]);
      const now = await dueAt(db.pool, 'ticket', T2);
      const failing = new Set([T1]);
      const purge: typeof purgeItem = async (pool, target, deps) => {
        if (failing.has(target.id)) throw new Error(`injected failure for ${target.id}`);
        return purgeItem(pool, target, deps);
      };
      const alerter = recordingAlerter();
      const logged: string[] = [];
      const deps = sweepDeps(db, now, { purge, alerter, log: (message) => logged.push(message) });

      const first = await runPurgeSweep(deps);
      expect(first).toMatchObject({ candidates: 2, purged: 1, failed: 1 });
      expect(alerter.calls).toEqual([{ context: `purge:ticket:${T1}`, message: `injected failure for ${T1}` }]);
      expect(logged.some((line) => line.includes(T1))).toBe(true);
      expect(await count(db, 'SELECT count(*)::int AS n FROM proj_tickets WHERE ticket_id = $1', [T1])).toBe(1);
      expect(await count(db, 'SELECT count(*)::int AS n FROM proj_tickets WHERE ticket_id = $1', [T2])).toBe(0);

      failing.delete(T1);
      const second = await runPurgeSweep(deps);
      expect(second).toMatchObject({ candidates: 1, purged: 1, failed: 0 }); // CONTROL
      expect(alerter.calls).toHaveLength(1);
    });
  }, 60_000);
});

describe('19.147 a queued object is retried by every sweep until its delete succeeds', () => {
  it('keeps it queued through a failing sweep and empties the queue through a working one', async () => {
    await withDb(async (db) => {
      const w = await buildTicketWorld(db.pool);
      const due = await dueAt(db.pool, 'ticket', w.T);
      await purgeItem(db.pool, { kind: 'ticket', id: w.T }, {
        projections: buildProjectionRegistry(),
        store: recordingStore(new Set([w.keyT])),
        now: due,
      });
      const attempts = () => count(db, 'SELECT attempts AS n FROM purge_pending_objects WHERE object_key = $1', [w.keyT]);
      expect(await attempts()).toBe(1); // CONTROL — the crash window: committed, object still there

      const stillFailing = await runPurgeSweep(sweepDeps(db, due, { store: recordingStore(new Set([w.keyT])) }));
      expect(stillFailing).toMatchObject({ candidates: 0, objectsDeleted: 0, objectsPending: 1 });
      expect(await attempts()).toBe(2);

      const store = recordingStore();
      const working = await runPurgeSweep(sweepDeps(db, due, { store }));
      expect(working).toMatchObject({ candidates: 0, objectsDeleted: 1, objectsPending: 0 });
      expect(store.deleted).toEqual([w.keyT]);
      expect(await count(db, 'SELECT count(*)::int AS n FROM purge_pending_objects', [])).toBe(0);
    });
  }, 60_000);
});

describe('19.148 the due instant is purgeDueAt(mark), inclusive', () => {
  it('is not a candidate 1 ms before, and is purged at exactly the instant', async () => {
    await withDb(async (db) => {
      const w = await buildTicketWorld(db.pool);
      const due = await dueAt(db.pool, 'ticket', w.T);
      expect(await runPurgeSweep(sweepDeps(db, new Date(due.getTime() - 1)))).toMatchObject({ candidates: 0, purged: 0 });
      expect(await runPurgeSweep(sweepDeps(db, due))).toMatchObject({ candidates: 1, purged: 1 }); // CONTROL
    });
  }, 60_000);
});

describe('19.151 the registry wins over a stale lifecycle row', () => {
  it('never offers an id already in purged_entities; purges the other due item', async () => {
    await withDb(async (db) => {
      const stale = await buildTicketWorld(db.pool);
      const live = await buildTicketWorld(db.pool);
      await db.pool.query(
        `INSERT INTO purged_entities (entity_kind, entity_id, workspace_id, purged_at) VALUES ('ticket', $1, $2, now())`,
        [stale.T, stale.WS],
      );
      const now = new Date(
        Math.max((await dueAt(db.pool, 'ticket', stale.T)).getTime(), (await dueAt(db.pool, 'ticket', live.T)).getTime()),
      );
      const report = await runPurgeSweep(sweepDeps(db, now));
      expect(report).toMatchObject({ candidates: 1, purged: 1, skipped: 0 });
      expect(await count(db, 'SELECT count(*)::int AS n FROM proj_tickets WHERE ticket_id = $1', [live.T])).toBe(0); // CONTROL
      expect(await count(db, 'SELECT count(*)::int AS n FROM proj_tickets WHERE ticket_id = $1', [stale.T])).toBe(1);
    });
  }, 60_000);
});
