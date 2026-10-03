import type { PoolClient } from 'pg';
import { lockEntity, readEntityEvents } from '../ledger/event-store.js';
import { reindexNote } from '../projections/note-search.js';
import type { Projection, ProjectionRegistry } from '../projections/registry.js';
import type { ErasureSet } from './erasure.js';

/**
 * Survivors (spec §5.6, owner ruling 2026-09-28 A): rows OUTSIDE the erasure set
 * that a purge touches. Each is re-derived by replaying its own surviving events
 * through the owning projection — the same computation a rebuild performs over
 * the post-purge ledger, so `verifyProjections` stays clean.
 */

export type Survivors = { ticketIds: string[]; noteIds: string[]; inviteIds: string[] };

/**
 * Called after `purge_ledger` (the set is known and its own events are gone)
 * and BEFORE `eraseRows` (the attachment rows that name erased tickets are still
 * there to find). Scoped to the workspace: chips are authored from a
 * workspace-scoped picker, and a workspace purge has no survivors at all.
 */
export async function collectSurvivors(db: PoolClient, set: ErasureSet): Promise<Survivors> {
  if (set.target.kind === 'workspace') return { ticketIds: [], noteIds: [], inviteIds: [] };
  const erased = new Set(set.entities.map((entity) => `${entity.kind}:${entity.id}`));
  const patterns = [...set.ticketIds, ...set.noteIds, ...set.projectIds].map((id) => `%${id}%`);
  const referencing = await db.query<{ entity_kind: string; entity_id: string }>(
    `SELECT DISTINCT entity_kind, entity_id FROM events
      WHERE workspace_id = $1 AND entity_kind IN ('ticket', 'note') AND payload::text LIKE ANY ($2::text[])`,
    [set.workspaceId, patterns],
  );
  const attached = await db.query<{ note_id: string }>(
    'SELECT DISTINCT note_id FROM proj_note_attachments WHERE ticket_id = ANY($1::text[])',
    [set.ticketIds],
  );
  const invites = await db.query<{ invite_id: string }>(
    `SELECT invite_id FROM proj_invites WHERE workspace_id = $1 AND project_ids && $2::text[] ORDER BY invite_id`,
    [set.workspaceId, set.projectIds],
  );
  const tickets = new Set<string>();
  const notes = new Set<string>();
  for (const row of referencing.rows) {
    if (erased.has(`${row.entity_kind}:${row.entity_id}`)) continue;
    (row.entity_kind === 'ticket' ? tickets : notes).add(row.entity_id);
  }
  for (const row of attached.rows) {
    if (!erased.has(`note:${row.note_id}`)) notes.add(row.note_id);
  }
  return {
    ticketIds: [...tickets].sort(),
    noteIds: [...notes].sort(),
    inviteIds: invites.rows.map((row) => row.invite_id),
  };
}

function projectionNamed(registry: ProjectionRegistry, name: string): Projection {
  const projection = registry.get(name);
  if (projection === undefined) throw new Error(`rederiveSurvivors: projection ${name} is not registered`);
  return projection;
}

/**
 * Called after `collectSurvivors` and BEFORE `eraseRows`: takes the entity lock of every
 * ticket and note survivor, which `rederiveSurvivors` later relies on.
 *
 * The boot backfill (`projections/backfill-references.ts`) replays an entity under this
 * same lock, and its first act there is to DELETE the entity's rows. Taking the lock only
 * after `eraseRows` has deleted the rows that point at the purged item makes a cycle:
 * the purge holds those row locks and waits for the survivor's entity lock, the backfill
 * holds that entity lock and waits for the rows. Postgres breaks it with 40P01 and aborts
 * one of the two, whichever began waiting first: the backfill (its first-boot run then
 * dies half way, with no marker) or the purge itself (a failed purge). Locking here, with
 * nothing yet deleted, leaves the backfill nothing to wait on while it holds a lock the
 * purge wants. A purge already holds the workspace lock and the target's
 * (purge-item.ts:106-107); ingest takes workspace → entity, the same direction, and the
 * backfill holds one entity lock at a time, so no other cycle exists (27.123).
 */
export async function lockSurvivors(db: PoolClient, survivors: Survivors): Promise<void> {
  for (const id of survivors.ticketIds) await lockEntity(db, 'ticket', id);
  for (const id of survivors.noteIds) await lockEntity(db, 'note', id);
}

/**
 * Called after `recordPurged` — every projection replayed here reads
 * `purged_entities` — and before `rederiveWorkspaceLexemes`, which reads the
 * note search rows this rewrites.
 */
export async function rederiveSurvivors(
  db: PoolClient,
  survivors: Survivors,
  set: ErasureSet,
  registry: ProjectionRegistry,
): Promise<void> {
  const search = projectionNamed(registry, 'proj_search');
  const notes = projectionNamed(registry, 'proj_notes');
  const lifecycle = projectionNamed(registry, 'proj_lifecycle');

  for (const ticketId of survivors.ticketIds) {
    await db.query('DELETE FROM proj_search WHERE ticket_id = $1', [ticketId]);
    for (const event of await readEntityEvents(db, 'ticket', ticketId)) {
      await search.apply(event, db);
    }
  }

  for (const noteId of survivors.noteIds) {
    await db.query('DELETE FROM proj_note_attachments WHERE note_id = $1', [noteId]);
    await db.query('DELETE FROM proj_notes WHERE note_id = $1', [noteId]);
    for (const event of await readEntityEvents(db, 'note', noteId)) {
      // `proj_lifecycle` writes the note's purge_marked_* columns, which
      // `proj_notes`' whole-row upsert preserves (`notes.ts`'s ON CONFLICT list
      // omits them), so the per-event interleaving matches a rebuild's order.
      await notes.apply(event, db);
      await lifecycle.apply(event, db);
    }
    await reindexNote(db, noteId);
    await db.query('DELETE FROM search_note_chunks WHERE note_id = $1', [noteId]);
  }

  for (const inviteId of survivors.inviteIds) {
    await db.query(
      `UPDATE proj_invites
          SET project_ids = ARRAY(
                SELECT p FROM unnest(project_ids) WITH ORDINALITY AS u(p, n)
                 WHERE p <> ALL($2::text[]) ORDER BY n)
        WHERE invite_id = $1`,
      [inviteId, set.projectIds],
    );
  }

  // Knowledge Graph spec B: a survivor's own rows and its comments' rows are
  // replayed AFTER recordPurged, so the projection skips the purged targets and
  // renders their chips as Deleted item, exactly as a rebuild over the
  // post-purge ledger does.
  const references = projectionNamed(registry, 'proj_references');
  for (const [kind, ids] of [['ticket', survivors.ticketIds], ['note', survivors.noteIds]] as const) {
    for (const id of ids) {
      // The entity's lock is already held: `lockSurvivors` took it before `eraseRows`.
      await db.query('DELETE FROM proj_references WHERE source_parent_kind = $1 AND source_parent_id = $2', [kind, id]);
      for (const event of await readEntityEvents(db, kind, id)) {
        await references.apply(event, db);
      }
    }
  }
}
