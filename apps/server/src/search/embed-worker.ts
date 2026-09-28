import type { Pool } from 'pg';
import { chunkDoc } from '@gisik-nokma/domain';
import { CURRENT_MODEL, EMBEDDING_DIM, embedTexts as defaultEmbedTexts } from './embedding.js';
import { purgedResolverFor } from '../purge/purged-lookup.js';
import { nudgesEmbedding } from './nudge.js';

/**
 * Re-exported so the predicate is reachable from the module that owns the loop.
 * It is DECLARED in `./nudge.ts`, which imports a type and nothing else, so
 * `app.ts` cannot drag this module's — or `embedding.ts`'s — cost into every
 * `buildApp` in the suite — see that file's docblock.
 */
export { nudgesEmbedding };

/**
 * The embedding worker (spec §7.6, Plan 3 of 6).
 *
 * ## What it is for, and why it is a loop rather than a write
 *
 * `search_note_chunks` is a cache, not a projection: its contents are the output
 * of a model binary, so no replay can reproduce them and no verifier can check
 * them (see the migration's docblock). Something has to keep it in step with the
 * ledger, and that something is this loop — which is also the BACKFILL (a
 * database that has never embedded anything gets everything embedded on its
 * first passes) and the RE-INDEX after a model change.
 *
 * ## The loop lives in `index.ts`; the NUDGE lives in `buildApp`
 *
 * The plan requires that split and the reason is worth restating: `buildApp` is
 * called by around sixty test files, so a timer started there would fire in
 * every one of them (the same argument the snapshot writer's registration
 * makes). But the commit feed is only reachable from `buildApp` — `index.ts`
 * builds the ingest service but hands it straight to `buildApp`, so a
 * subscription made there would be one the app could neither observe nor
 * unsubscribe. So `buildApp` registers a listener that calls ONE function the
 * caller supplied, and `index.ts` hands it `(noteId) => worker.nudge(noteId)`.
 * The listener is registered only when that callback is given, which is what
 * keeps the sixty test files from subscribing at all.
 *
 * ## A note with no chunks is indexed by its TITLE — a ruling against the spec
 *
 * Spec §7.6's staleness query is `c.note_id IS NULL OR c.src < n.seq OR c.model
 * <> $model`, and its chunking section says an empty document produces zero
 * chunks. Together those do not terminate. `EMPTY_NOTE_DOC` is what a note
 * created from a picker starts with, and such a note has NO ROW here — so
 * `c.note_id IS NULL` is true on every pass, forever, and with `LIMIT 20` a
 * workspace holding twenty of them would starve the queue and never embed a
 * real note.
 *
 * So a note whose document yields no chunks is embedded as ONE chunk built from
 * its title. `chunkDoc` is unchanged — `[]` for an empty document is 18.125's
 * pinned behaviour and the right answer for a pure function — and this is the
 * worker's policy instead. It is also the better product: a note's title is its
 * most meaningful text, and a title-only note should be findable by meaning
 * rather than invisible. `noteCreatedPayload` requires a non-empty title, so
 * the fallback always produces a non-empty chunk.
 *
 * ## Concurrency, stated rather than assumed
 *
 * One pass at a time. `nudge` while a pass is in flight does not queue a second
 * one: the pass that is running will already see whatever the nudge was about,
 * because staleness is decided by the TABLES rather than by a queue of ids. That
 * is what makes three nudges in a hundred milliseconds one pass rather than
 * three, and it is why `nudge`'s `noteId` is accepted and not used — the loop is
 * staleness-driven, and an id would only be a second, weaker source of truth.
 */

/** The batch size, from spec §7.6's `LIMIT 20`. */
const BATCH = 20;

/**
 * The debounce on `nudge`. Long enough to collapse the burst a single save
 * produces (a body set and the events around it), short enough that a person
 * who saves and searches sees the result.
 */
const NUDGE_DEBOUNCE_MS = 500;

export type EmbedWorkerOptions = {
  intervalMs: number;
  log?: (message: string) => void;
  /** Injected by tests so the suite never loads the model. Defaults to the real one. */
  embedTexts?: (texts: string[]) => Promise<Float32Array[]>;
  /** `CURRENT_MODEL` unless a test injects another to exercise a model change. */
  model?: string;
};

export type EmbedWorker = {
  nudge(noteId: string): void;
  stop(): void;
  runOnce(): Promise<number>;
};

type StaleNoteRow = { note_id: string; workspace_id: string; title: string; body: unknown; seq: string | number };

/**
 * The pgvector literal for one float vector: `[1,2,3]`. `pg` has no vector type
 * and pgvector accepts this text form for a `vector` column, which is why the
 * worker formats rather than the driver.
 */
function vectorLiteral(vector: Float32Array): string {
  return `[${Array.from(vector).join(',')}]`;
}

export function startEmbedWorker(pool: Pool, options: EmbedWorkerOptions): EmbedWorker {
  const log = options.log ?? ((): undefined => undefined);
  const embedTexts = options.embedTexts ?? defaultEmbedTexts;
  const model = options.model ?? CURRENT_MODEL;

  /**
   * The pass. Returns how many notes it processed — embedded notes plus notes
   * whose chunks were dropped because the note is deleted. Zero means the
   * database is in step, which is what makes it a usable control.
   */
  async function runOnce(): Promise<number> {
    let processed = 0;

    // Deleted notes first, and by their own statement rather than by the
    // staleness query below: that query filters `deleted = FALSE`, so a deleted
    // note's chunks would never be reached by it. `USING` rather than a
    // subquery so the row count is the number of chunk rows removed, which is
    // what makes "nothing left to clean" observable on the next pass.
    const cleaned = await pool.query(
      `DELETE FROM search_note_chunks c
        USING proj_notes n
        WHERE c.note_id = n.note_id AND n.deleted = TRUE`,
    );
    processed += cleaned.rowCount ?? 0;

    const { rows } = await pool.query<StaleNoteRow>(
      `SELECT n.note_id, n.workspace_id, n.title, n.body, n.seq
         FROM proj_notes n
         LEFT JOIN (SELECT note_id, max(source_seq) AS src, min(model) AS model
                      FROM search_note_chunks GROUP BY note_id) c
                ON c.note_id = n.note_id
        WHERE n.deleted = FALSE
          AND (c.note_id IS NULL OR c.src < n.seq OR c.model <> $1)
        ORDER BY n.updated_at DESC
        LIMIT $2`,
      [model, BATCH],
    );

    for (const note of rows) {
      const chunks = chunkDoc(note.body, { isPurged: await purgedResolverFor(pool, [note.body]) });
      const pieces = chunks.length > 0 ? chunks : [{ headingPath: '', text: note.title }];
      const vectors = await embedTexts(pieces.map((piece) => piece.text));

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        // REPLACE, not append: `(note_id, chunk_index)` is the primary key and
        // a new body can have fewer chunks than the old one, so an upsert would
        // leave the tail of the previous body searchable forever.
        await client.query('DELETE FROM search_note_chunks WHERE note_id = $1', [note.note_id]);
        for (let index = 0; index < pieces.length; index += 1) {
          const piece = pieces[index]!;
          const vector = vectors[index];
          if (vector === undefined) throw new Error(`no embedding for chunk ${String(index)} of ${note.note_id}`);
          if (vector.length !== EMBEDDING_DIM) {
            throw new Error(`embedding of ${String(vector.length)} dims, expected ${String(EMBEDDING_DIM)}`);
          }
          await client.query(
            `INSERT INTO search_note_chunks
               (note_id, chunk_index, workspace_id, heading_path, chunk_text, model, source_seq, embedding)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
            [
              note.note_id,
              index,
              note.workspace_id,
              piece.headingPath,
              piece.text,
              model,
              note.seq,
              vectorLiteral(vector),
            ],
          );
        }
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
      } finally {
        client.release();
      }
      processed += 1;
    }

    return processed;
  }

  /** The pass in flight, so a nudge during one cannot start a second. */
  let inFlight: Promise<number> | null = null;
  function runGuarded(): Promise<number> {
    if (inFlight !== null) return inFlight;
    inFlight = runOnce()
      .catch((error: unknown) => {
        // A failing pass is logged and swallowed, exactly as the snapshot
        // writer's is: the ledger is untouched either way, and a background
        // maintenance task that can take the process down is a worse failure
        // than chunks that are one interval late.
        log(`embed pass failed: ${String(error)}`);
        return 0;
      })
      .finally(() => {
        inFlight = null;
      });
    return inFlight;
  }

  let debounce: NodeJS.Timeout | null = null;
  const timer = setInterval(() => {
    void runGuarded();
  }, options.intervalMs);
  timer.unref();

  return {
    nudge(): void {
      if (debounce !== null) clearTimeout(debounce);
      debounce = setTimeout(() => {
        debounce = null;
        void runGuarded();
      }, NUDGE_DEBOUNCE_MS);
      // The debounce must not hold the process open, for the interval's reason.
      debounce.unref();
    },
    stop(): void {
      clearInterval(timer);
      if (debounce !== null) clearTimeout(debounce);
      debounce = null;
    },
    runOnce: runGuarded,
  };
}
