import type { Pool } from 'pg';
import { lockEntity, readEntityEvents } from '../ledger/event-store.js';
import type { ProjectionRegistry } from './registry.js';

/**
 * The one-shot backfill of `proj_references` (Knowledge Graph B; planner ruling
 * 2026-10-03: no manual prod step). Run by `index.ts` in the BACKGROUND after
 * `app.listen`; the Linked-from read answers from whatever is there meanwhile.
 *
 * ## Why not rebuildProjection
 * It truncates and replays the whole ledger in one transaction (rebuild.ts):
 * an ACCESS EXCLUSIVE lock on the table for the whole run, and the whole ledger
 * in memory (`readLedger`). This walks ENTITIES instead, one short transaction
 * each.
 *
 * ## Why no live event is lost
 * Each entity's transaction takes `lockEntity` — the lock ingest holds from
 * before `insertEvent` until after every projection's `apply` and `COMMIT`
 * (ingest-service.ts:175, :358, :375-378). A comment is filed on its parent,
 * so the entity's lock covers every source whose parent it is. Inside the lock
 * this DELETEs the entity's rows and replays its events: an ingest that
 * committed first is in the replay (READ COMMITTED, event-store.ts:15-19); one
 * that arrives during it waits, then applies live on the replayed rows. Every
 * write replaces one source's rows, so both orders give the rebuild's rows.
 *
 * ## Restart-safe and idempotent
 * The marker is written only after the last entity. A crash or a shutdown
 * mid-run leaves no marker; the next boot replays every entity again, which is
 * harmless (delete + replay). A session advisory lock lets one instance run it
 * at a time; another instance that finds it taken skips (the holder finishes,
 * or crashes and releases it, and the next boot runs it).
 */
export const REFERENCES_BACKFILL = 'proj_references';

/** Test seams: `locked` = the entity lock is held, nothing deleted yet; `replaying` = its old rows are deleted, its events not yet replayed; `committed` = after COMMIT. */
export type BackfillProbe = (stage: 'locked' | 'replaying' | 'committed', entity: { kind: 'ticket' | 'note'; id: string }, index: number) => Promise<void>;
export type BackfillDeps = { projections: ProjectionRegistry; probe?: BackfillProbe; shouldStop?: () => boolean; log?: (message: string) => void };
export type BackfillResult = { ran: boolean; entities: number; ms: number; maxEntityMs: number };

export async function backfillReferences(pool: Pool, deps: BackfillDeps): Promise<BackfillResult> {
  const skipped: BackfillResult = { ran: false, entities: 0, ms: 0, maxEntityMs: 0 };
  const projection = deps.projections.get(REFERENCES_BACKFILL);
  if (projection === undefined) throw new Error(`backfill: projection ${REFERENCES_BACKFILL} is not registered`);
  const guard = await pool.connect();
  const lockKey = `backfill:${REFERENCES_BACKFILL}`;
  let locked = false;
  try {
    locked = (await guard.query<{ ok: boolean }>('SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS ok', [lockKey])).rows[0]?.ok === true;
    if (!locked) return skipped;
    const done = await guard.query('SELECT 1 FROM projection_backfills WHERE name = $1', [REFERENCES_BACKFILL]);
    if (done.rowCount !== 0) return skipped;

    const started = performance.now();
    let maxEntityMs = 0;
    const { rows: entities } = await guard.query<{ entity_kind: 'ticket' | 'note'; entity_id: string }>(
      `SELECT DISTINCT entity_kind, entity_id FROM events WHERE entity_kind IN ('ticket', 'note') ORDER BY entity_kind, entity_id`,
    );
    for (const [index, row] of entities.entries()) {
      if (deps.shouldStop?.() === true) return { ...skipped, entities: index }; // shutdown: no marker, next boot re-runs
      const entity = { kind: row.entity_kind, id: row.entity_id };
      const client = await pool.connect();
      const entityStarted = performance.now();
      let failed: Error | undefined;
      try {
        await client.query('BEGIN');
        await lockEntity(client, entity.kind, entity.id);
        await deps.probe?.('locked', entity, index);
        await client.query('DELETE FROM proj_references WHERE source_parent_kind = $1 AND source_parent_id = $2', [entity.kind, entity.id]);
        await deps.probe?.('replaying', entity, index);
        for (const event of await readEntityEvents(client, entity.kind, entity.id)) {
          await projection.apply(event, client);
        }
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK').catch((cause: unknown) => {
          failed = cause instanceof Error ? cause : new Error(String(cause));
        });
        throw error;
      } finally {
        client.release(failed);
      }
      maxEntityMs = Math.max(maxEntityMs, performance.now() - entityStarted);
      await deps.probe?.('committed', entity, index);
    }
    await guard.query(
      'INSERT INTO projection_backfills (name, completed_at, entities) VALUES ($1, now(), $2) ON CONFLICT (name) DO NOTHING',
      [REFERENCES_BACKFILL, entities.length],
    );
    const ms = performance.now() - started;
    deps.log?.(`backfill ${REFERENCES_BACKFILL}: ${entities.length} entities in ${ms.toFixed(0)} ms (longest entity ${maxEntityMs.toFixed(0)} ms)`);
    return { ran: true, entities: entities.length, ms, maxEntityMs };
  } finally {
    if (locked) await guard.query('SELECT pg_advisory_unlock(hashtextextended($1, 0))', [lockKey]).catch(() => undefined);
    guard.release();
  }
}

/** The boot wiring: `run()` after `listen` (never awaited by boot), `stop()` from `onClose`. A failure is logged, never thrown into the process. */
export function startReferencesBackfill(pool: Pool, deps: Omit<BackfillDeps, 'shouldStop'>): { run(): void; stop(): Promise<void> } {
  let stopping = false;
  let running: Promise<unknown> = Promise.resolve();
  return {
    run() {
      running = backfillReferences(pool, { ...deps, shouldStop: () => stopping }).catch((error: unknown) => {
        deps.log?.(`backfill ${REFERENCES_BACKFILL} failed; the next boot re-runs it: ${error instanceof Error ? error.message : String(error)}`);
      });
    },
    async stop() {
      stopping = true;
      await running;
    },
  };
}
