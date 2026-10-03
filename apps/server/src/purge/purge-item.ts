import type { Pool, PoolClient } from 'pg';
import {
  newUlid,
  purgeCompletedPayload,
  purgeDueAt,
  SYSTEM_ACTOR_PURGE,
  type LedgerEvent,
  type LifecycleKind,
} from '@gisik-nokma/domain';
import type { ObjectStore } from '../attachments/object-store.js';
import { insertEvent, lockEntity, lockWorkspace, nextSeq, nextWorkspaceSeq } from '../ledger/event-store.js';
import type { ProjectionRegistry } from '../projections/registry.js';
import { rederiveWorkspaceLexemes } from '../projections/note-search.js';
import { eraseRows, objectKeysOf, recordPurged, replayRemaining, toErasureSet, type PurgeTarget } from './erasure.js';
import { collectSurvivors, lockSurvivors, rederiveSurvivors } from './survivors.js';
import { deletePendingObjects, queuePendingObjects } from './pending-objects.js';

export type { PurgeTarget } from './erasure.js';

export type PurgeDeps = {
  projections: ProjectionRegistry;
  store: Pick<ObjectStore, 'delete'>;
  now: Date;
};

export type PurgeSkipReason = 'already-purged' | 'not-found' | 'not-marked' | 'not-due';

export type PurgeOutcome =
  | {
      status: 'purged';
      target: PurgeTarget;
      workspaceId: string;
      erased: number;
      tombstoneId: string;
      objectsDeleted: number;
      objectsPending: number;
    }
  | { status: 'skipped'; target: PurgeTarget; reason: PurgeSkipReason };

const LOCATE: Record<LifecycleKind, string> = {
  workspace: 'SELECT workspace_id, purge_marked_at, purge_marked_by FROM proj_workspaces WHERE workspace_id = $1',
  project: 'SELECT workspace_id, purge_marked_at, purge_marked_by FROM proj_projects WHERE project_id = $1',
  ticket: 'SELECT workspace_id, purge_marked_at, purge_marked_by FROM proj_tickets WHERE ticket_id = $1',
  note: 'SELECT workspace_id, purge_marked_at, purge_marked_by FROM proj_notes WHERE note_id = $1',
};

type Located = { workspaceId: string; markedAt: string | null; markedBy: string | null };

async function locate(db: PoolClient, target: PurgeTarget): Promise<Located | null> {
  const { rows } = await db.query<{
    workspace_id: string;
    purge_marked_at: Date | null;
    purge_marked_by: string | null;
  }>(LOCATE[target.kind], [target.id]);
  const row = rows[0];
  if (row === undefined) return null;
  return {
    workspaceId: row.workspace_id,
    markedAt: row.purge_marked_at === null ? null : row.purge_marked_at.toISOString(),
    markedBy: row.purge_marked_by,
  };
}

async function isPurged(db: PoolClient, target: PurgeTarget): Promise<boolean> {
  const { rows } = await db.query('SELECT 1 FROM purged_entities WHERE entity_kind = $1 AND entity_id = $2', [
    target.kind,
    target.id,
  ]);
  return rows.length > 0;
}

async function inTransaction<T>(pool: Pool, work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  let rollbackFailure: Error | undefined;
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch((failure: unknown) => {
      rollbackFailure = failure instanceof Error ? failure : new Error(String(failure));
    });
    throw error;
  } finally {
    client.release(rollbackFailure);
  }
}

type Committed =
  | { status: 'skipped'; reason: PurgeSkipReason }
  | { status: 'erased'; workspaceId: string; erased: number; tombstoneId: string; keys: string[] };

/**
 * Permanently erases one item (trash series Plan 2; spec §5.2–§5.6). One
 * transaction for everything but the object store; see this plan's Task 5 for
 * why each step sits where it does. Skips — never erases — an item that is
 * already erased, gone, unmarked or not yet due, re-reading the mark UNDER the
 * workspace lock so an unmark that committed first is honoured.
 */
export async function purgeItem(pool: Pool, target: PurgeTarget, deps: PurgeDeps): Promise<PurgeOutcome> {
  const committed = await inTransaction<Committed>(pool, async (client) => {
    if (await isPurged(client, target)) return { status: 'skipped', reason: 'already-purged' };
    const first = await locate(client, target);
    if (first === null) return { status: 'skipped', reason: 'not-found' };
    await lockWorkspace(client, first.workspaceId);
    await lockEntity(client, target.kind, target.id);
    const item = await locate(client, target);
    if (item === null) return { status: 'skipped', reason: 'not-found' };
    if (item.markedAt === null || item.markedBy === null) return { status: 'skipped', reason: 'not-marked' };
    if (Date.parse(purgeDueAt(item.markedAt)) > deps.now.getTime()) return { status: 'skipped', reason: 'not-due' };

    // BEFORE anything is deleted: the deleted rows may hold the workspace's
    // highest workspace_seq, and MAX+1 afterwards would re-issue a stream
    // position clients have already seen; likewise the item's own seq.
    const workspaceSeq = await nextWorkspaceSeq(client, item.workspaceId);
    const seq = await nextSeq(client, target.kind, target.id);

    const { rows } = await client.query<{ erased_kind: string; erased_id: string }>(
      'SELECT erased_kind, erased_id FROM purge_ledger($1, $2)',
      [target.kind, target.id],
    );
    const set = toErasureSet(target, item.workspaceId, rows);
    const survivors = await collectSurvivors(client, set);
    const keys = await objectKeysOf(client, set);
    await lockSurvivors(client, survivors); // BEFORE eraseRows: see lockSurvivors (27.123)
    await eraseRows(client, set);
    await recordPurged(client, set, deps.now.toISOString());
    await replayRemaining(client, set, deps.projections);
    await rederiveSurvivors(client, survivors, set, deps.projections);
    // Last among the re-derivations (Task 7 inserts the survivors above it):
    // the vocabulary is read off the note search rows as they now stand (D3).
    if (target.kind !== 'workspace') {
      await rederiveWorkspaceLexemes(client, item.workspaceId);
    }

    const at = deps.now.toISOString();
    const tombstone: LedgerEvent = {
      id: newUlid(),
      workspaceId: item.workspaceId,
      entity: { kind: target.kind, id: target.id },
      type: 'purge.completed',
      version: 1,
      payload: purgeCompletedPayload.parse({ kind: target.kind, markedBy: item.markedBy, markedAt: item.markedAt }),
      actorId: SYSTEM_ACTOR_PURGE,
      origin: 'server',
      clientTime: at,
      serverTime: at,
      seq,
      workspaceSeq,
    };
    await insertEvent(client, tombstone);
    for (const projection of deps.projections.all()) {
      await projection.apply(tombstone, client);
    }
    await queuePendingObjects(client, keys, deps.now);
    return { status: 'erased', workspaceId: item.workspaceId, erased: set.entities.length, tombstoneId: tombstone.id, keys };
  });

  if (committed.status === 'skipped') return { status: 'skipped', target, reason: committed.reason };
  const drained = await deletePendingObjects(pool, deps.store, committed.keys);
  return {
    status: 'purged',
    target,
    workspaceId: committed.workspaceId,
    erased: committed.erased,
    tombstoneId: committed.tombstoneId,
    objectsDeleted: drained.deleted,
    objectsPending: drained.pending,
  };
}
