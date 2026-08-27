import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { istDayOf, newUlid, type SubmittedEvent } from '@gisik-nokma/domain';
import {
  insertEvent,
  isUniqueViolation,
  lockEntity,
  lockWorkspace,
  nextSeq,
  nextWorkspaceSeq,
  readEntityEvents,
  readLedger,
} from '../src/ledger/event-store.js';
import { createTestDatabase, type TestDatabase } from './helpers/db.js';
import { committed, submittedWorkspaceCreated } from './helpers/events.js';

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase();
});

afterAll(async () => {
  await db.drop();
});

describe('event store', () => {
  it('seq starts at 1 and increments per entity', async () => {
    const first = submittedWorkspaceCreated();
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      await lockEntity(client, 'workspace', first.entity.id);
      const seq1 = await nextSeq(client, 'workspace', first.entity.id);
      expect(seq1).toBe(1);
      await insertEvent(client, committed(first, seq1));
      await client.query('COMMIT');

      await client.query('BEGIN');
      await lockEntity(client, 'workspace', first.entity.id);
      const seq2 = await nextSeq(client, 'workspace', first.entity.id);
      expect(seq2).toBe(2);
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  });

  it('two concurrent appends to one entity serialise to consecutive seqs, no violation', async () => {
    const base = submittedWorkspaceCreated();
    const append = async (eventId: string): Promise<number> => {
      const client = await db.pool.connect();
      try {
        await client.query('BEGIN');
        await lockEntity(client, 'workspace', base.entity.id);
        const seq = await nextSeq(client, 'workspace', base.entity.id);
        await insertEvent(client, committed({ ...base, id: eventId }, seq));
        await client.query('COMMIT');
        return seq;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    };
    const seqs = await Promise.all([append(newUlid()), append(newUlid())]);
    expect([...seqs].sort()).toEqual([1, 2]);
  });

  /**
   * The race above cannot fail by construction here. With lockEntity replaced
   * by a no-op it still passed 5/5 runs as written, and 3/3 with the pool
   * pre-warmed to two connections; traced, the two transactions never overlap
   * at the read — the first commits before the second's max(seq) query runs,
   * so the seqs come out 1 and 2 with no lock at all. That test shows the happy
   * path; it does not show the lock doing anything.
   *
   * This one does, and deterministically: while A holds the entity lock, B's
   * acquisition cannot complete, and the moment A commits, B acquires it and
   * its read sees A's appended row. Read-after-lock-sees-the-prior-append is
   * exactly the property Task 10's ingest transaction rests on.
   */
  it('lockEntity holds off a second transaction until the first commits (falsifiable)', async () => {
    const base = submittedWorkspaceCreated();
    const a = await db.pool.connect();
    const b = await db.pool.connect();
    let bAcquired = false;
    let bWaiting: Promise<void> = Promise.resolve();
    try {
      await a.query('BEGIN');
      await lockEntity(a, 'workspace', base.entity.id);
      await insertEvent(a, committed(base, 1));

      await b.query('BEGIN');
      bWaiting = lockEntity(b, 'workspace', base.entity.id).then(() => {
        bAcquired = true;
      });
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 100);
      });
      expect(bAcquired).toBe(false);

      // ...and it is this lock B waits on, not a slow query: Postgres reports
      // exactly one ungranted advisory lock in this database. Parallel test
      // files own separate databases, so the filter keeps their locks out.
      const waiting = await db.pool.query<{ waiting: number }>(
        `SELECT count(*)::int AS waiting FROM pg_locks
          WHERE locktype = 'advisory' AND NOT granted
            AND database = (SELECT oid FROM pg_database WHERE datname = current_database())`,
      );
      expect(waiting.rows[0]?.waiting).toBe(1);

      await a.query('COMMIT');
      await bWaiting;
      expect(bAcquired).toBe(true);
      // B's transaction began before A committed, but READ COMMITTED takes a
      // fresh snapshot per statement: the read after the lock sees A's row.
      expect(await nextSeq(b, 'workspace', base.entity.id)).toBe(2);
    } finally {
      // Cleanup order matters. A's rollback — a no-op once it has committed —
      // releases the lock so B's queued acquisition can settle. Rolling B back
      // first would queue behind a query that never returns, and the file would
      // hang until the hook timeout.
      await a.query('ROLLBACK').catch(() => {});
      await bWaiting.catch(() => {});
      await b.query('ROLLBACK').catch(() => {});
      a.release();
      b.release();
    }
  });

  it('planted defect: bypassing the lock and reusing a seq hits events_entity_seq_unique', async () => {
    const base = submittedWorkspaceCreated();
    const client = await db.pool.connect();
    try {
      await insertEvent(client, committed(base, 1));
      let caught: unknown;
      try {
        // workspaceSeq 2 is free, so the per-entity constraint is the one that fires.
        await insertEvent(client, committed({ ...base, id: newUlid() }, 1, undefined, 2));
      } catch (error) {
        caught = error;
      }
      // Exact-rejection convention: pin the SQLSTATE, the constraint that fired,
      // and the full message — not just "something was refused".
      expect(caught).toMatchObject({
        code: '23505',
        constraint: 'events_entity_seq_unique',
        message: 'duplicate key value violates unique constraint "events_entity_seq_unique"',
      });
      expect(isUniqueViolation(caught, 'events_entity_seq_unique')).toBe(true);
      expect(isUniqueViolation(caught, 'events_pkey')).toBe(false);
    } finally {
      client.release();
    }
  });

  it('readEntityEvents returns per-entity seq order and honours afterSeq', async () => {
    const base = submittedWorkspaceCreated();
    const client = await db.pool.connect();
    try {
      await insertEvent(client, committed(base, 1));
      await insertEvent(
        client,
        committed({ ...base, id: newUlid(), type: 'workspace.renamed', payload: { name: 'CC HQ' } }, 2),
      );
    } finally {
      client.release();
    }
    const all = await readEntityEvents(db.pool, 'workspace', base.entity.id);
    expect(all.map((event) => event.seq)).toEqual([1, 2]);
    expect(all[1]?.payload).toEqual({ name: 'CC HQ' });
    expect(all[0]?.serverTime).toBe('2026-08-20T09:00:01.000Z');

    const tail = await readEntityEvents(db.pool, 'workspace', base.entity.id, 1);
    expect(tail.map((event) => event.seq)).toEqual([2]);
  });

  it('readLedger returns the canonical replay order regardless of arrival order', async () => {
    const ledger = await readLedger(db.pool);
    const keys = ledger.map((event) => `${event.entity.kind}|${event.entity.id}|${event.seq}`);
    expect(keys).toEqual([...keys].sort());
    expect(ledger.length).toBeGreaterThan(0);
  });

  it('an ISO clientTime round-trips as the same instant: +05:30 in, the equivalent Z out', async () => {
    const base = submittedWorkspaceCreated({ clientTime: '2026-08-20T14:30:00.000+05:30' });
    const client = await db.pool.connect();
    try {
      await insertEvent(client, committed(base, 1));
    } finally {
      client.release();
    }
    const [read] = await readEntityEvents(db.pool, 'workspace', base.entity.id);
    // The instant is exactly what was claimed...
    expect(Date.parse(read?.clientTime ?? '')).toBe(Date.parse('2026-08-20T14:30:00.000+05:30'));
    // ...re-emitted in the one normal form. The device's label is gone; the
    // moment it labelled is not (owner decision: time is Asia/Kolkata).
    expect(read?.clientTime).toBe('2026-08-20T09:00:00.000Z');
    // Claimed and received stay two separate facts — skew is still visible.
    expect(read?.serverTime).toBe('2026-08-20T09:00:01.000Z');
    expect(read?.clientTime).not.toBe(read?.serverTime);
  });

  it('planted defect: two clients claiming one instant with different offsets are equal after the round trip', async () => {
    const ist = submittedWorkspaceCreated({ clientTime: '2026-08-20T14:30:00.000+05:30' });
    const utc = submittedWorkspaceCreated({ clientTime: '2026-08-20T09:00:00.000Z' });
    const client = await db.pool.connect();
    try {
      await insertEvent(client, committed(ist, 1));
      await insertEvent(client, committed(utc, 1));
    } finally {
      client.release();
    }
    const [readIst] = await readEntityEvents(db.pool, 'workspace', ist.entity.id);
    const [readUtc] = await readEntityEvents(db.pool, 'workspace', utc.entity.id);
    // As text these two claims were unequal and sorted apart. As instants they
    // are one moment — the comparison the text column silently got wrong.
    expect(readIst?.clientTime).toBe('2026-08-20T09:00:00.000Z');
    expect(readUtc?.clientTime).toBe('2026-08-20T09:00:00.000Z');
    expect(readIst?.clientTime).toBe(readUtc?.clientTime);
    // ...and therefore on one IST day, whichever offset the device stated.
    expect(istDayOf(readIst?.clientTime ?? '')).toBe('2026-08-20');
    expect(istDayOf(readUtc?.clientTime ?? '')).toBe('2026-08-20');
  });
});

describe('workspace stream cursor (coordination §18)', () => {
  /** A second entity inside an existing workspace. The store stores rows; the
   *  vocabulary gate lives at the door (Task 3), so any kind is fine here. */
  function siblingEntity(workspaceId: string, kind: 'project' | 'ticket'): SubmittedEvent {
    return submittedWorkspaceCreated({ workspaceId, entity: { kind, id: newUlid() } });
  }

  async function appendUnderBothLocks(submitted: SubmittedEvent): Promise<number> {
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      // Lock order is always workspace first, then entity — one global order
      // across the whole server, so two ingests can never deadlock by taking
      // the pair in opposite orders.
      await lockWorkspace(client, submitted.workspaceId);
      await lockEntity(client, submitted.entity.kind, submitted.entity.id);
      const workspaceSeq = await nextWorkspaceSeq(client, submitted.workspaceId);
      const seq = await nextSeq(client, submitted.entity.kind, submitted.entity.id);
      await insertEvent(client, committed(submitted, seq, undefined, workspaceSeq));
      await client.query('COMMIT');
      return workspaceSeq;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  it('two events on different entities in one workspace get strictly increasing workspace_seq', async () => {
    const first = submittedWorkspaceCreated();
    const second = siblingEntity(first.workspaceId, 'project');
    expect(await appendUnderBothLocks(first)).toBe(1);
    expect(await appendUnderBothLocks(second)).toBe(2);

    const stream = await db.pool.query<{ id: string; seq: number; workspace_seq: number }>(
      'SELECT id, seq, workspace_seq FROM events WHERE workspace_id = $1 ORDER BY workspace_seq',
      [first.workspaceId],
    );
    expect(stream.rows.map((row) => [row.id, row.workspace_seq])).toEqual([
      [first.id, 1],
      [second.id, 2],
    ]);
    // The defect §18 names: per-entity seq says NOTHING about stream order —
    // both entities honestly start at 1, so resuming at seq 1 would skip the
    // second entity's first event forever.
    expect(stream.rows.map((row) => row.seq)).toEqual([1, 1]);
  });

  it('planted defect: concurrent appends to different entities never mint one workspace_seq twice', async () => {
    const first = submittedWorkspaceCreated();
    const cursors = await Promise.all([
      appendUnderBothLocks(first),
      appendUnderBothLocks(siblingEntity(first.workspaceId, 'project')),
      appendUnderBothLocks(siblingEntity(first.workspaceId, 'ticket')),
    ]);
    // Without the workspace lock these three transactions read the same
    // max(workspace_seq) and events_workspace_seq_unique rejects two of them.
    expect([...cursors].sort()).toEqual([1, 2, 3]);
  });

  it('replay is unaffected: the canonical order is still (entity_kind, entity_id, seq)', async () => {
    const ledger = await readLedger(db.pool);
    const keys = ledger.map((event) => `${event.entity.kind}|${event.entity.id}|${event.seq}`);
    expect(keys).toEqual([...keys].sort());

    const perWorkspace = new Map<string, number[]>();
    for (const event of ledger) {
      expect(typeof event.workspaceSeq).toBe('number');
      perWorkspace.set(event.workspaceId, [...(perWorkspace.get(event.workspaceId) ?? []), event.workspaceSeq]);
    }
    for (const cursors of perWorkspace.values()) {
      expect(new Set(cursors).size).toBe(cursors.length);
    }
  });
});
