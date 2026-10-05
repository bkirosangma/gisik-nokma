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

/**
 * Knowledge Graph spec D §2: tickets (title, then description) and ticket comments, into
 * `search_item_chunks`. The note pass's shape, kept deliberately the same:
 * - removals first, by their own statement;
 * - a staleness query;
 * - embed outside any transaction;
 * - a `FOR SHARE` recheck, then REPLACE.
 * The staleness key is a hash because `proj_tickets` has no per-entity seq.
 */
const TICKET_TEXT_HASH = `md5(coalesce(t.fields->'title'->>'value', '') || E'\\n' || coalesce((t.fields->'description'->'value')::text, ''))`;
const COMMENT_TEXT_HASH = `md5(coalesce(k.body::text, ''))`;
type StaleItemRow = {
  item_kind: 'ticket' | 'comment';
  item_id: string;
  ticket_id: string;
  workspace_id: string;
  title: string;
  body: unknown;
  source_hash: string;
};

async function itemsPass(pool: Pool, embedTexts: (texts: string[]) => Promise<Float32Array[]>, model: string): Promise<number> {
  let processed = 0;
  // Removals first, as the note pass does: the staleness query below reads live rows only, so a
  // deleted (or erased) ticket's rows and a deleted comment's rows are never reached by it.
  const cleaned = await pool.query(
    `DELETE FROM search_item_chunks c
      WHERE NOT EXISTS (SELECT 1 FROM proj_tickets t WHERE t.ticket_id = c.ticket_id AND t.deleted_at IS NULL)
         OR (c.item_kind = 'comment'
             AND NOT EXISTS (SELECT 1 FROM proj_ticket_comments k WHERE k.comment_id = c.item_id AND k.deleted_at IS NULL))`,
  );
  processed += cleaned.rowCount ?? 0;

  const { rows } = await pool.query<StaleItemRow>(
    `SELECT * FROM (
       SELECT 'ticket'::text AS item_kind, t.ticket_id AS item_id, t.ticket_id, t.workspace_id,
              coalesce(t.fields->'title'->>'value', '') AS title, t.fields->'description'->'value' AS body,
              ${TICKET_TEXT_HASH} AS source_hash
         FROM proj_tickets t
         LEFT JOIN (SELECT item_id, min(source_hash) AS h, min(model) AS model
                      FROM search_item_chunks WHERE item_kind = 'ticket' GROUP BY item_id) c ON c.item_id = t.ticket_id
        WHERE t.deleted_at IS NULL AND (c.item_id IS NULL OR c.h <> ${TICKET_TEXT_HASH} OR c.model <> $1)
       UNION ALL
       SELECT 'comment'::text, k.comment_id, k.ticket_id, k.workspace_id, '', k.body, ${COMMENT_TEXT_HASH}
         FROM proj_ticket_comments k
         JOIN proj_tickets t ON t.ticket_id = k.ticket_id
         LEFT JOIN (SELECT item_id, min(source_hash) AS h, min(model) AS model
                      FROM search_item_chunks WHERE item_kind = 'comment' GROUP BY item_id) c ON c.item_id = k.comment_id
        WHERE k.deleted_at IS NULL AND t.deleted_at IS NULL
          AND (c.item_id IS NULL OR c.h <> ${COMMENT_TEXT_HASH} OR c.model <> $1)
     ) s
     ORDER BY s.item_id DESC
     LIMIT $2`,
    [model, BATCH],
  );

  for (const item of rows) {
    const isPurged = await purgedResolverFor(pool, [item.body]);
    const bodyChunks = item.body === null || item.body === undefined ? [] : chunkDoc(item.body, { isPurged });
    const pieces =
      item.item_kind === 'ticket'
        ? [{ headingPath: '', text: item.title }, ...bodyChunks]
        : bodyChunks.length > 0
          ? bodyChunks
          : [{ headingPath: '', text: '' }]; // an empty comment: one blank chunk, so it is not re-picked forever; reads skip ''
    const vectors = await embedTexts(pieces.map((piece) => piece.text));

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // The note pass's recheck (above), for the same reason: the embedding call ran outside any
      // transaction, so the ticket (or the comment) may have been deleted or erased since it was picked.
      const still =
        item.item_kind === 'ticket'
          ? await client.query('SELECT 1 FROM proj_tickets WHERE ticket_id = $1 AND deleted_at IS NULL FOR SHARE', [item.item_id])
          : await client.query(
              `SELECT 1 FROM proj_ticket_comments k JOIN proj_tickets t ON t.ticket_id = k.ticket_id
                WHERE k.comment_id = $1 AND k.deleted_at IS NULL AND t.deleted_at IS NULL FOR SHARE OF k, t`,
              [item.item_id],
            );
      if (still.rowCount === 0) {
        await client.query('ROLLBACK');
        continue;
      }
      // REPLACE, not upsert: a new text can have fewer chunks than the old one.
      await client.query('DELETE FROM search_item_chunks WHERE item_kind = $1 AND item_id = $2', [item.item_kind, item.item_id]);
      for (let index = 0; index < pieces.length; index += 1) {
        const piece = pieces[index]!;
        const vector = vectors[index];
        if (vector === undefined) throw new Error(`no embedding for chunk ${String(index)} of ${item.item_kind} ${item.item_id}`);
        if (vector.length !== EMBEDDING_DIM) throw new Error(`embedding of ${String(vector.length)} dims, expected ${String(EMBEDDING_DIM)}`);
        await client.query(
          `INSERT INTO search_item_chunks
             (item_kind, item_id, chunk_index, workspace_id, ticket_id, heading_path, chunk_text, model, source_hash, embedding)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [item.item_kind, item.item_id, index, item.workspace_id, item.ticket_id, piece.headingPath, piece.text, model, item.source_hash, vectorLiteral(vector)],
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

export function startEmbedWorker(pool: Pool, options: EmbedWorkerOptions): EmbedWorker {
  const log = options.log ?? ((): undefined => undefined);
  const embedTexts = options.embedTexts ?? defaultEmbedTexts;
  const model = options.model ?? CURRENT_MODEL;

  /**
   * The pass. Returns how many items it processed — embedded notes plus notes
   * whose chunks were dropped because the note is deleted, then (KG-D T2,
   * `itemsPass`) embedded tickets and ticket comments plus the item chunk rows
   * removed for deleted or erased ones. Zero means the database is in step,
   * which is what makes it a usable control.
   */
  async function runOnce(): Promise<number> {
    let processed = 0;

    // Deleted notes first, and by their own statement rather than by the
    // staleness query below: that query filters `deleted = FALSE`, so a deleted
    // note's chunks would never be reached by it. The row count is the number
    // of chunk rows removed, which is what makes "nothing left to clean"
    // observable on the next pass. One statement, both kinds: chunks of a deleted note, and (trash Plan 2)
    // chunks whose note row no longer exists — an erased note's residue, which a
    // join against `proj_notes` cannot reach.
    const cleaned = await pool.query(
      `DELETE FROM search_note_chunks c
        WHERE NOT EXISTS (SELECT 1 FROM proj_notes n WHERE n.note_id = c.note_id AND n.deleted = FALSE)`,
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
        // Trash Plan 2 (whole-branch review): the embedding call above ran
        // outside any transaction, so a purge may have erased this note since
        // the staleness query picked it. Lock the note's row and look again:
        // FOR SHARE makes a purge that arrives next wait for this commit, and one
        // that already committed leaves no row — either way nothing is written
        // for an erased note.
        const still = await client.query(
          'SELECT 1 FROM proj_notes WHERE note_id = $1 AND deleted = FALSE FOR SHARE',
          [note.note_id],
        );
        if (still.rowCount === 0) {
          await client.query('ROLLBACK');
          continue;
        }
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

    processed += await itemsPass(pool, embedTexts, model);
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
