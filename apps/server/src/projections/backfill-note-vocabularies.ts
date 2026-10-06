import type { Pool } from 'pg';
import { lockWorkspace } from '../ledger/event-store.js';
import { inTransaction } from './backfill-note-search-binds.js';
import type { BackfillResult } from './backfill-references.js';
import { rederiveWorkspaceLexemes } from './note-search.js';

/**
 * The one-shot re-derive of EVERY workspace's spelling vocabulary (task/kg-vocab-rederive-all, 18.526–18.530;
 * planner 2026-10-06 15:04, a Knowledge Graph release blocker). Run by `index.ts` in the BACKGROUND, after the bind
 * re-derive (`backfill-note-search-binds.ts`) has ended.
 *
 * ## Why it exists
 * `proj_note_lexemes` has no note id and is only ever re-derived whole, so a word that another workspace's ticket put
 * there through a link written before 18.500 stays a spelling suggestion after the link is gone. The bind re-derive
 * reaches only the workspaces that still HAVE such a link. Two cases escape it: a link DETACHED before the deploy (no
 * attachment row is left to find, even if the note is deleted since), and a link whose ticket was PURGED (the purge
 * re-indexes the note but re-derives only the ticket's own workspace's vocabulary, `purge/purge-item.ts:133-135`, and
 * erases the link). What leaks is single words, never a title, key or link; no new such link can be made (18.500),
 * so this is residue only.
 *
 * ## Which workspaces
 * Every workspace that holds a vocabulary word or a note search row, read off those two tables: the residue is a
 * lexeme row, so a workspace with neither has nothing to clean, and a workspace whose only notes are deleted has words
 * and no rows. Not `proj_workspaces`, which holds a row only for a workspace a lifecycle event has named. Archived and
 * deleted (in the trash) workspaces are visited too: the words are data at rest, and an unarchive or a restore would
 * serve them again. A purged workspace has no rows left in either table.
 *
 * ## What it changes
 * Each vocabulary becomes the words of its notes' CURRENT search rows, which is what a rebuild yields
 * (`rederiveWorkspaceLexemes`). A word only an old title, body or ticket line held goes with the residue.
 *
 * ## Why no live write is lost, and why after the bind re-derive
 * Each workspace is re-derived in its own short transaction under `lockWorkspace`, the lock ingest takes first for any
 * event of the workspace and a purge holds throughout. The bind re-derive re-indexes notes under their entity lock
 * only, so run beside it, both would insert words of one workspace in no common order, and a deadlock would end one
 * run (no marker); after it, every row this reads is already re-indexed. One server instance runs
 * (`deploy/do/app.yaml`), so the in-process order is the order.
 *
 * ## Restart-safe and idempotent
 * The marker is written only after the last workspace. A crash or a shutdown leaves none, and the next boot runs it
 * whole, which re-derives the same words. A session advisory lock lets one instance run it at a time.
 */
export const NOTE_VOCABULARY_BACKFILL = 'proj_note_lexemes:rederive-all';

/** Test seam: the workspace's lock is held and its vocabulary not yet re-derived. */
export type NoteVocabularyProbe = (workspaceId: string) => Promise<void>;
export type NoteVocabularyDeps = { probe?: NoteVocabularyProbe; shouldStop?: () => boolean; log?: (message: string) => void };

export async function backfillNoteVocabularies(pool: Pool, deps: NoteVocabularyDeps = {}): Promise<BackfillResult> {
  const skipped: BackfillResult = { ran: false, entities: 0, ms: 0, maxEntityMs: 0 };
  const guard = await pool.connect();
  const lockKey = `backfill:${NOTE_VOCABULARY_BACKFILL}`;
  let locked = false;
  try {
    locked = (await guard.query<{ ok: boolean }>('SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS ok', [lockKey])).rows[0]?.ok === true;
    if (!locked) return skipped;
    const done = await guard.query('SELECT 1 FROM projection_backfills WHERE name = $1', [NOTE_VOCABULARY_BACKFILL]);
    if (done.rowCount !== 0) return skipped;

    const started = performance.now();
    let maxEntityMs = 0;
    const { rows: workspaces } = await guard.query<{ workspace_id: string }>(
      `SELECT workspace_id FROM proj_note_lexemes
        UNION
       SELECT workspace_id FROM proj_note_search
        ORDER BY workspace_id`,
    );
    for (const [index, { workspace_id: workspaceId }] of workspaces.entries()) {
      if (deps.shouldStop?.() === true) return { ...skipped, entities: index }; // shutdown: no marker, next boot re-runs
      const ms = await inTransaction(pool, async (client) => {
        await lockWorkspace(client, workspaceId);
        await deps.probe?.(workspaceId);
        await rederiveWorkspaceLexemes(client, workspaceId);
      });
      maxEntityMs = Math.max(maxEntityMs, ms);
    }
    await guard.query(
      'INSERT INTO projection_backfills (name, completed_at, entities) VALUES ($1, now(), $2) ON CONFLICT (name) DO NOTHING',
      [NOTE_VOCABULARY_BACKFILL, workspaces.length],
    );
    const ms = performance.now() - started;
    deps.log?.(`backfill ${NOTE_VOCABULARY_BACKFILL}: ${workspaces.length} workspaces in ${ms.toFixed(0)} ms (longest workspace ${maxEntityMs.toFixed(0)} ms)`);
    return { ran: true, entities: workspaces.length, ms, maxEntityMs };
  } finally {
    if (locked) await guard.query('SELECT pg_advisory_unlock(hashtextextended($1, 0))', [lockKey]).catch(() => undefined);
    guard.release();
  }
}

/**
 * The boot wiring, as `startNoteSearchBindBackfill`, except that `run()` first waits for `after` (the bind
 * re-derive's `settled()`, see "why after" above). A `stop()` during that wait ends the run before its first
 * workspace, with no marker. `settled()` resolves when the run has ended, however it ended.
 */
export function startNoteVocabularyBackfill(
  pool: Pool,
  deps: Omit<NoteVocabularyDeps, 'shouldStop'> & { after: () => Promise<unknown> },
): { run(): void; stop(): Promise<void>; settled(): Promise<void> } {
  const { after, ...rest } = deps;
  let stopping = false;
  let running: Promise<unknown> = Promise.resolve();
  return {
    run() {
      running = after()
        .then(() => backfillNoteVocabularies(pool, { ...rest, shouldStop: () => stopping }))
        .catch((error: unknown) => {
          rest.log?.(`backfill ${NOTE_VOCABULARY_BACKFILL} failed; the next boot re-runs it: ${error instanceof Error ? error.message : String(error)}`);
        });
    },
    async stop() {
      stopping = true;
      await running;
    },
    async settled() {
      await running;
    },
  };
}
