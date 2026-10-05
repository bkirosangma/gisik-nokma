import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import { newUlid, type LedgerEvent, type Ulid } from '@gisik-nokma/domain';
import { buildApp } from '../../src/app.js';
import { createObjectStoreFromEnv } from '../../src/attachments/store-config.js';
import { createAuth } from '../../src/auth/auth.js';
import { LogMagicLinkSender } from '../../src/auth/magic-link-sender.js';
import { LogOtpSender } from '../../src/auth/otp-sender.js';
import type { CommittedEventListener, IngestService } from '../../src/ingest/ingest-service.js';
import { istClock, startSuggestionScheduler } from '../../src/semantic/scheduler.js';
import type { runSuggestionJob } from '../../src/semantic/suggestion-job.js';
import { applyCommitted, makeCommitted } from '../helpers/apply.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';

/**
 * Knowledge Graph spec D §4.1 "When it runs" (KG-D Task 5), case 27.491 (`test-cases/27-knowledge-graph.md` §27.D):
 * the 200-change trigger and its debounce on fake timers, the nightly tick against a real database, the hourly
 * interval that fires that tick (only `setInterval` faked, the database real), and the app's commit-feed listener that
 * feeds `change`. The job itself is a spy here (`job.test.ts` owns what it writes).
 */
const MIN = 60 * 1000;
const NOON_IST = new Date('2026-10-06T06:30:00Z'); // 12:00 IST: the hourly tick, if reached, returns before any query
type RunJob = typeof runSuggestionJob;

function spyJob(runs: string[]): RunJob {
  return async (_pool, workspaceId) => {
    runs.push(workspaceId);
    return { suggestions: 0, items: 0, ms: 0 };
  };
}
const failingPool = { query: async () => Promise.reject(new Error('boom')) } as unknown as Pool;

describe('27.491 the 200-change trigger', () => {
  it('27.491 200 changes arm a 10-minute run, a later change re-arms it, the run resets the count; control: another workspace never runs W', async () => {
    vi.useFakeTimers();
    try {
      expect(istClock(NOON_IST)).toEqual({ date: '2026-10-06', hour: 12 });
      const runs: string[] = [];
      const scheduler = startSuggestionScheduler(failingPool, { runJob: spyJob(runs), now: () => NOON_IST });
      const changes = (workspaceId: string, n: number) => {
        for (let index = 0; index < n; index += 1) scheduler.change(workspaceId);
      };
      changes('W', 199);
      await vi.advanceTimersByTimeAsync(11 * MIN);
      expect(runs).toEqual([]);
      changes('W', 1); // the 200th
      await vi.advanceTimersByTimeAsync(9 * MIN);
      expect(runs).toEqual([]);
      await vi.advanceTimersByTimeAsync(1 * MIN);
      expect(runs).toEqual(['W']);

      // Re-arm: 200 more at T, one more at T+5 → nothing at T+10, one run at T+15.
      changes('W', 200);
      await vi.advanceTimersByTimeAsync(5 * MIN);
      changes('W', 1);
      await vi.advanceTimersByTimeAsync(5 * MIN);
      expect(runs).toEqual(['W']);
      await vi.advanceTimersByTimeAsync(5 * MIN);
      expect(runs).toEqual(['W', 'W']);

      // The run reset the count: 199 more are not enough.
      changes('W', 199);
      await vi.advanceTimersByTimeAsync(11 * MIN);
      expect(runs).toEqual(['W', 'W']);

      // Control: 200 changes to V run V, and only V.
      changes('V', 200);
      await vi.advanceTimersByTimeAsync(11 * MIN);
      expect(runs).toEqual(['W', 'W', 'V']);
      scheduler.stop();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('27.491 the nightly tick and the commit feed', () => {
  let db: TestDatabase;
  const [A, B, C, D, E, F] = [newUlid(), newUlid(), newUlid(), newUlid(), newUlid(), newUlid()].sort() as [Ulid, Ulid, Ulid, Ulid, Ulid, Ulid];
  const actorId = newUlid();
  const lifecycle = (workspaceId: string, type: string): LedgerEvent =>
    makeCommitted({ workspaceId, actorId, entity: { kind: 'workspace', id: workspaceId }, type, payload: {} });

  beforeAll(async () => {
    db = await createTestDatabase();
    // A–D hold ticket chunks, E only note chunks and F only a cached suggestion (each source of the due list once);
    // C is archived and D deleted, and none of A, B, E, F ever had a lifecycle event.
    const vector = `[${new Array(512).fill(0).map((_, i) => (i === 0 ? 1 : 0)).join(',')}]`;
    for (const workspaceId of [A, B, C, D]) {
      await db.pool.query(
        `INSERT INTO search_item_chunks (item_kind, item_id, chunk_index, workspace_id, ticket_id, heading_path, chunk_text, model, source_hash, embedding)
         VALUES ('ticket', $1, 0, $2, $1, '', 'text', 'test', 'h', $3::vector)`,
        [newUlid(), workspaceId, vector],
      );
    }
    await db.pool.query(
      `INSERT INTO search_note_chunks (note_id, chunk_index, workspace_id, heading_path, chunk_text, model, source_seq, embedding)
       VALUES ($1, 0, $2, '', 'text', 'test', 1, $3::vector)`,
      [newUlid(), E, vector],
    );
    await db.pool.query(
      `INSERT INTO sem_suggestions (id, workspace_id, signature, partition_key, item_kind, item_id, item_hashes, terms, label, score, computed_at)
       VALUES ($1, $2, $3, 'w', '{ticket,ticket,ticket}', $4, $5, '{a}', 'a', 0.5, now())`,
      [newUlid(), F, 'f'.repeat(64), [newUlid(), newUlid(), newUlid()], ['a'.repeat(32), 'b'.repeat(32), 'c'.repeat(32)]],
    );
    await applyCommitted(db.pool, [lifecycle(C, 'workspace.archived'), lifecycle(D, 'workspace.deleted')]);
  }, 60_000);

  afterAll(async () => {
    await db.drop();
  });

  it('27.491 tick: none at 01:59 IST, every live workspace (ticket chunks, note chunks or only a cached suggestion) once at 02:10, none again that date, none at 03:10, again the next date; never the archived or deleted', async () => {
    // The live four have NO proj_workspaces row: absence is live (`migrations/1790500000000_lifecycle.sql`).
    expect((await db.pool.query('SELECT 1 FROM proj_workspaces WHERE workspace_id = ANY ($1::text[])', [[A, B, E, F]])).rows).toHaveLength(0);
    expect((await db.pool.query('SELECT workspace_id FROM proj_workspaces WHERE workspace_id = ANY ($1::text[]) ORDER BY workspace_id', [[C, D]])).rows).toHaveLength(2);
    const runs: string[] = [];
    let now = new Date('2026-10-05T20:29:00Z'); // 01:59 IST on 2026-10-06
    const scheduler = startSuggestionScheduler(db.pool, { runJob: spyJob(runs), now: () => now });
    try {
      expect(istClock(now)).toEqual({ date: '2026-10-06', hour: 1 });
      await scheduler.tick();
      expect(runs).toEqual([]);

      now = new Date('2026-10-05T20:40:00Z'); // 02:10 IST, 2026-10-06
      await scheduler.tick();
      expect([...runs].sort()).toEqual([A, B, E, F]);
      const state = await db.pool.query<{ workspace_id: string; d: string }>(
        `SELECT workspace_id, to_char(last_nightly_ist_date, 'YYYY-MM-DD') AS d FROM sem_job_state ORDER BY workspace_id`,
      );
      expect(state.rows).toEqual([
        { workspace_id: A, d: '2026-10-06' },
        { workspace_id: B, d: '2026-10-06' },
        { workspace_id: E, d: '2026-10-06' },
        { workspace_id: F, d: '2026-10-06' },
      ]);

      now = new Date('2026-10-05T21:10:00Z'); // 02:40 IST, the same date
      await scheduler.tick();
      expect(runs).toHaveLength(4);

      now = new Date('2026-10-06T21:40:00Z'); // 03:10 IST, 2026-10-07: due, but not the nightly hour
      await scheduler.tick();
      expect(runs).toHaveLength(4);

      now = new Date('2026-10-06T20:40:00Z'); // 02:10 IST, 2026-10-07
      await scheduler.tick();
      expect(runs.slice(4).sort()).toEqual([A, B, E, F]);
      const advanced = await db.pool.query<{ d: string }>(`SELECT DISTINCT to_char(last_nightly_ist_date, 'YYYY-MM-DD') AS d FROM sem_job_state`);
      expect(advanced.rows).toEqual([{ d: '2026-10-07' }]); // the state moved on, so 02:40 that date runs none
      now = new Date('2026-10-06T21:10:00Z'); // 02:40 IST, 2026-10-07
      await scheduler.tick();
      expect(runs).toHaveLength(8);
      expect(runs).not.toContain(C);
      expect(runs).not.toContain(D);
    } finally {
      scheduler.stop();
    }
  });

  it('27.491 a failing job is logged and the next workspace still runs, each run on the scheduler clock; a tick whose query fails is logged and does not throw', async () => {
    const logs: string[] = [];
    const runs: string[] = [];
    await db.pool.query('DELETE FROM sem_job_state');
    const now = new Date('2026-10-05T20:40:00Z'); // 02:10 IST
    const clocks: Array<number | undefined> = [];
    const failingA: RunJob = async (pool, workspaceId, options) => {
      clocks.push(options?.now?.getTime());
      if (workspaceId === A) throw new Error('job boom');
      return spyJob(runs)(pool, workspaceId, options);
    };
    const scheduler = startSuggestionScheduler(db.pool, { runJob: failingA, now: () => now, log: (msg) => logs.push(msg) });
    await scheduler.tick();
    scheduler.stop();
    expect(runs).toEqual([B, E, F]);
    expect(clocks, 'each run is handed the scheduler clock').toEqual([now.getTime(), now.getTime(), now.getTime(), now.getTime()]);
    expect(logs).toEqual([`suggestion job failed for ${A}: Error: job boom`]);

    const broken = startSuggestionScheduler(failingPool, { runJob: spyJob(runs), now: () => now, log: (msg) => logs.push(msg) });
    await expect(broken.tick()).resolves.toBeUndefined();
    broken.stop();
    expect(logs.slice(1)).toEqual(['suggestion scheduler tick failed: Error: boom']);
  });

  it('27.491 the app calls onSemanticChange with the workspace for an embedding nudge, with no onNoteBodyCommitted; control: a transition does not', async () => {
    const listeners: CommittedEventListener[] = [];
    const changed: string[] = [];
    const recordingIngest: IngestService = {
      ingestBatch: async () => [],
      ingestClientBatch: async () => [],
      onEventCommitted: (listener) => {
        listeners.push(listener);
        return () => {
          const at = listeners.indexOf(listener);
          if (at >= 0) listeners.splice(at, 1);
        };
      },
    };
    const app = buildApp({
      db: { query: async () => [{ ok: 1 }] },
      pool: db.pool,
      ingest: recordingIngest,
      auth: createAuth({
        pool: db.pool,
        otpSender: new LogOtpSender(() => {}),
        magicLinkSender: new LogMagicLinkSender(() => {}),
        baseUrl: 'http://localhost:3000',
        secret: 'test-secret-not-used-anywhere-real',
        webOrigin: 'http://localhost:3001',
      }),
      serverAppend: async () => [],
      webOrigin: 'http://localhost:3001',
      store: createObjectStoreFromEnv({}),
      onSemanticChange: (workspaceId) => changed.push(workspaceId),
    });
    try {
      const event = (kind: 'ticket' | 'note', type: string): LedgerEvent =>
        makeCommitted({ workspaceId: A, actorId, entity: { kind, id: newUlid() }, type, payload: {} });
      expect(listeners.length).toBeGreaterThan(0);
      for (const listener of listeners) listener(event('ticket', 'ticket.field_set'));
      for (const listener of listeners) listener(event('note', 'note.body_set'));
      expect(changed).toEqual([A, A]);
      for (const listener of listeners) listener(event('ticket', 'ticket.transitioned'));
      expect(changed, 'control: a transition is no embedding change').toEqual([A, A]);
    } finally {
      await app.close();
    }
  });

  // LAST in this describe: no later `it` reads `sem_job_state`.
  it('27.491 the hourly interval itself fires the nightly run: at 02:10 IST on a date with no state row, nothing after 59 minutes (the clock unread), every live workspace once after 60', async () => {
    const NIGHT = new Date('2026-10-07T20:40:00Z'); // 02:10 IST on 2026-10-08, a date no earlier `it` reaches
    expect(istClock(NIGHT)).toEqual({ date: '2026-10-08', hour: 2 });
    const ahead = await db.pool.query('SELECT workspace_id FROM sem_job_state WHERE last_nightly_ist_date >= $1::date', ['2026-10-08']);
    expect(ahead.rows, 'control: no workspace has its state on or after this date').toEqual([]);
    const runs: string[] = [];
    const logs: string[] = [];
    let clockReads = 0;
    // Only the interval is faked: it is the code under test, and the pool's own timers and sockets stay real.
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    let scheduler: ReturnType<typeof startSuggestionScheduler> | undefined;
    try {
      scheduler = startSuggestionScheduler(db.pool, {
        runJob: spyJob(runs),
        now: () => {
          clockReads += 1;
          return NIGHT;
        },
        log: (msg) => logs.push(msg),
      });
      await vi.advanceTimersByTimeAsync(59 * MIN);
      expect(runs).toEqual([]);
      expect(clockReads, 'no tick has started (a tick reads the clock first)').toBe(0);
      await vi.advanceTimersByTimeAsync(1 * MIN);
      // The tick's LAST write is the due workspaces' state rows: once all four carry this date, it has settled.
      await vi.waitFor(
        async () => {
          const settled = await db.pool.query<{ n: number }>('SELECT count(*)::int AS n FROM sem_job_state WHERE last_nightly_ist_date = $1::date', ['2026-10-08']);
          expect(settled.rows[0]?.n, `the interval's tick ran every live workspace (logs: ${logs.join('; ')})`).toBe(4);
        },
        { timeout: 10_000, interval: 20 },
      );
      expect([...runs].sort()).toEqual([A, B, E, F]);
      expect(logs).toEqual([]);
    } finally {
      scheduler?.stop();
      vi.useRealTimers();
    }
  });
});
