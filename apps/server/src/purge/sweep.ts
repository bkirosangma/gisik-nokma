import type { Pool } from 'pg';
import { purgeDueAt, type LifecycleKind } from '@gisik-nokma/domain';
import type { ErrorAlerter } from '../alerts/error-alerter.js';
import type { ObjectStore } from '../attachments/object-store.js';
import type { ProjectionRegistry } from '../projections/registry.js';
import { deletePendingObjects } from './pending-objects.js';
import { purgeItem, type PurgeOutcome, type PurgeTarget } from './purge-item.js';

/**
 * The permanent-delete sweep (trash series Plan 2; spec §5.1, §7), modelled on
 * `../auto-close/sweep.ts` and hosted on the backup worker's scheduler
 * (`../ops/backup-daemon-main.ts`, job `purge`).
 */

/** Parents first: a workspace purge takes its projects; a project its tickets and notes. */
export const PURGE_KIND_ORDER: readonly LifecycleKind[] = ['workspace', 'project', 'ticket', 'note'];

export type PurgeSweepDeps = {
  pool: Pool;
  projections: ProjectionRegistry;
  store: Pick<ObjectStore, 'delete'>;
  alerter: ErrorAlerter;
  now?: () => Date;
  log?: (message: string, error?: unknown) => void;
  /** Test seam: the per-item purge. Defaults to `purgeItem`. */
  purge?: typeof purgeItem;
};

export type PurgeSweepReport = {
  candidates: number;
  purged: number;
  skipped: number;
  failed: number;
  objectsDeleted: number;
  objectsPending: number;
};

type CandidateRow = { kind: LifecycleKind; id: string; purge_marked_at: Date };

/**
 * Plan 1's lifecycle columns, not a ledger scan (D13): `purge.unmarked` nulls
 * `purge_marked_at`, and an erased item has no row left. An id already in
 * `purged_entities` is never offered — the registry is the truth about what is
 * gone. The due instant is `purgeDueAt(mark)`, inclusive, computed here; the
 * delay is spelled only in `packages/domain/src/lifecycle.ts`.
 */
export async function dueCandidates(pool: Pool, now: Date): Promise<PurgeTarget[]> {
  const { rows } = await pool.query<CandidateRow>(
    `SELECT c.kind, c.id, c.purge_marked_at FROM (
       SELECT 'workspace' AS kind, workspace_id AS id, purge_marked_at FROM proj_workspaces WHERE purge_marked_at IS NOT NULL
       UNION ALL
       SELECT 'project', project_id, purge_marked_at FROM proj_projects WHERE purge_marked_at IS NOT NULL
       UNION ALL
       SELECT 'ticket', ticket_id, purge_marked_at FROM proj_tickets WHERE purge_marked_at IS NOT NULL
       UNION ALL
       SELECT 'note', note_id, purge_marked_at FROM proj_notes WHERE purge_marked_at IS NOT NULL
     ) c
     WHERE NOT EXISTS (SELECT 1 FROM purged_entities p WHERE p.entity_kind = c.kind AND p.entity_id = c.id)`,
  );
  return rows
    .filter((row) => Date.parse(purgeDueAt(row.purge_marked_at.toISOString())) <= now.getTime())
    .sort(
      (a, b) =>
        PURGE_KIND_ORDER.indexOf(a.kind) - PURGE_KIND_ORDER.indexOf(b.kind) ||
        a.purge_marked_at.getTime() - b.purge_marked_at.getTime() ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    )
    .map((row) => ({ kind: row.kind, id: row.id }));
}

export async function runPurgeSweep(deps: PurgeSweepDeps): Promise<PurgeSweepReport> {
  const log = deps.log ?? ((message: string, error?: unknown) => console.error(message, error));
  const now = deps.now === undefined ? new Date() : deps.now();
  const purge = deps.purge ?? purgeItem;
  const targets = await dueCandidates(deps.pool, now);
  const report: PurgeSweepReport = {
    candidates: targets.length,
    purged: 0,
    skipped: 0,
    failed: 0,
    objectsDeleted: 0,
    objectsPending: 0,
  };

  for (const target of targets) {
    let outcome: PurgeOutcome;
    try {
      outcome = await purge(deps.pool, target, { projections: deps.projections, store: deps.store, now });
    } catch (error) {
      // Spec §7: logged, alerted, retried next sweep. The item keeps its mark,
      // so it stays in Deleted items (overdue) until a sweep succeeds; one
      // failure never stops the others.
      report.failed += 1;
      log(`purge failed for ${target.kind} ${target.id}`, error);
      try {
        await deps.alerter.notify(`purge:${target.kind}:${target.id}`, error);
      } catch (notifyError) {
        log('purge alerter failed', notifyError);
      }
      continue;
    }
    if (outcome.status === 'purged') {
      report.purged += 1;
      report.objectsDeleted += outcome.objectsDeleted;
    } else {
      report.skipped += 1;
    }
  }

  // The drain (spec §5.2): the only path by which an object whose delete
  // failed — or whose process died between COMMIT and the delete — is removed.
  const drained = await deletePendingObjects(deps.pool, deps.store);
  report.objectsDeleted += drained.deleted;
  report.objectsPending = drained.pending;
  return report;
}
