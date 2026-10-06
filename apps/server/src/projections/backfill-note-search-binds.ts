import type { Pool, PoolClient } from 'pg';
import { lockEntity, lockWorkspace } from '../ledger/event-store.js';
import type { BackfillResult } from './backfill-references.js';
import { reindexNote, rederiveWorkspaceLexemes } from './note-search.js';

/**
 * The one-shot re-derive of the note search rows a cross-workspace link wrote (task/notes-cross-workspace-followup,
 * 18.522; planner ruling 2026-10-06, owner 2026-10-03: no manual prod step). Run by `index.ts` in the BACKGROUND after
 * `app.listen`, like `backfill-references.ts`, whose lock-and-marker skeleton this repeats.
 *
 * ## Why it exists
 * `ticketTextOf` now indexes only tickets of the note's OWN workspace, but that binds future writes only. A row written
 * before it still holds another workspace's ticket key and title in `ticket_text` (a search hit for a word found only
 * there), and `proj_note_lexemes`, which is never deleted, still holds those words in the note's workspace's spelling
 * vocabulary. So every note with a link to a ticket of another workspace is re-indexed, and then each such note's
 * workspace's vocabulary is re-derived from its rows. Nothing else is touched, and no link is deleted: it HIDES.
 *
 * ## Why no live write is lost
 * Each note is re-indexed under `lockEntity`, the lock ingest holds across every projection's `apply` for that note,
 * and each vocabulary under `lockWorkspace`, the one ingest takes first for any event of the workspace (as the purge's
 * re-derive does). Both are short transactions.
 *
 * ## Restart-safe and idempotent
 * The marker is written only after the last workspace; a crash or a shutdown leaves none, and the next boot re-runs it,
 * which re-derives the same rows. A session advisory lock lets one instance run it at a time.
 */
export const NOTE_SEARCH_BIND_BACKFILL = 'proj_note_search:workspace-bind';

/** Test seam: `locked` = the note's entity lock is held, its row not yet re-derived. */
export type NoteSearchBindProbe = (stage: 'locked', noteId: string) => Promise<void>;
export type NoteSearchBindDeps = { probe?: NoteSearchBindProbe; shouldStop?: () => boolean; log?: (message: string) => void };

async function inTransaction(pool: Pool, body: (client: PoolClient) => Promise<void>): Promise<number> {
  const client = await pool.connect();
  const started = performance.now();
  let failed: Error | undefined;
  try {
    await client.query('BEGIN');
    await body(client);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch((cause: unknown) => {
      failed = cause instanceof Error ? cause : new Error(String(cause));
    });
    throw error;
  } finally {
    client.release(failed);
  }
  return performance.now() - started;
}

export async function backfillNoteSearchBinds(pool: Pool, deps: NoteSearchBindDeps = {}): Promise<BackfillResult> {
  const skipped: BackfillResult = { ran: false, entities: 0, ms: 0, maxEntityMs: 0 };
  const guard = await pool.connect();
  const lockKey = `backfill:${NOTE_SEARCH_BIND_BACKFILL}`;
  let locked = false;
  try {
    locked = (await guard.query<{ ok: boolean }>('SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS ok', [lockKey])).rows[0]?.ok === true;
    if (!locked) return skipped;
    const done = await guard.query('SELECT 1 FROM projection_backfills WHERE name = $1', [NOTE_SEARCH_BIND_BACKFILL]);
    if (done.rowCount !== 0) return skipped;

    const started = performance.now();
    let maxEntityMs = 0;
    const { rows: notes } = await guard.query<{ note_id: string; workspace_id: string }>(
      `SELECT DISTINCT n.note_id, n.workspace_id
         FROM proj_note_attachments na
         JOIN proj_notes n ON n.note_id = na.note_id
         JOIN proj_tickets t ON t.ticket_id = na.ticket_id
        WHERE t.workspace_id <> n.workspace_id
        ORDER BY n.workspace_id, n.note_id`,
    );
    for (const [index, note] of notes.entries()) {
      if (deps.shouldStop?.() === true) return { ...skipped, entities: index }; // shutdown: no marker, next boot re-runs
      const ms = await inTransaction(pool, async (client) => {
        await lockEntity(client, 'note', note.note_id);
        await deps.probe?.('locked', note.note_id);
        await reindexNote(client, note.note_id);
      });
      maxEntityMs = Math.max(maxEntityMs, ms);
    }
    for (const workspaceId of new Set(notes.map((note) => note.workspace_id))) {
      if (deps.shouldStop?.() === true) return { ...skipped, entities: notes.length };
      await inTransaction(pool, async (client) => {
        await lockWorkspace(client, workspaceId);
        await rederiveWorkspaceLexemes(client, workspaceId);
      });
    }
    await guard.query(
      'INSERT INTO projection_backfills (name, completed_at, entities) VALUES ($1, now(), $2) ON CONFLICT (name) DO NOTHING',
      [NOTE_SEARCH_BIND_BACKFILL, notes.length],
    );
    const ms = performance.now() - started;
    deps.log?.(`backfill ${NOTE_SEARCH_BIND_BACKFILL}: ${notes.length} notes in ${ms.toFixed(0)} ms (longest note ${maxEntityMs.toFixed(0)} ms)`);
    return { ran: true, entities: notes.length, ms, maxEntityMs };
  } finally {
    if (locked) await guard.query('SELECT pg_advisory_unlock(hashtextextended($1, 0))', [lockKey]).catch(() => undefined);
    guard.release();
  }
}

/** The boot wiring, as `startReferencesBackfill`: `run()` after `listen` (never awaited), `stop()` from `onClose`. */
export function startNoteSearchBindBackfill(pool: Pool, deps: Omit<NoteSearchBindDeps, 'shouldStop'>): { run(): void; stop(): Promise<void> } {
  let stopping = false;
  let running: Promise<unknown> = Promise.resolve();
  return {
    run() {
      running = backfillNoteSearchBinds(pool, { ...deps, shouldStop: () => stopping }).catch((error: unknown) => {
        deps.log?.(`backfill ${NOTE_SEARCH_BIND_BACKFILL} failed; the next boot re-runs it: ${error instanceof Error ? error.message : String(error)}`);
      });
    },
    async stop() {
      stopping = true;
      await running;
    },
  };
}
