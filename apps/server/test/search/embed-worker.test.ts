import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import { newUlid, type LedgerEvent } from '@gisik-nokma/domain';
import { buildApp } from '../../src/app.js';
import { createAuth } from '../../src/auth/auth.js';
import { LogMagicLinkSender } from '../../src/auth/magic-link-sender.js';
import { LogOtpSender } from '../../src/auth/otp-sender.js';
import { createObjectStoreFromEnv } from '../../src/attachments/store-config.js';
import type { CommittedEventListener, IngestService } from '../../src/ingest/ingest-service.js';
import { startEmbedWorker, nudgesEmbedding } from '../../src/search/embed-worker.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { applyCommitted, makeCommitted } from '../helpers/apply.js';
import { seedNotesFixture, type NotesFixture } from '../helpers/notes-fixture.js';

/**
 * The embedding worker (spec §7.6, cases 18.136–18.140, Plan 3 of 6).
 *
 * ## The fake embedder, and what it does NOT prove
 *
 * Every case here injects `embedTexts`, so no test loads the 130 MB model — and
 * that means not one of them is evidence about what a vector MEANS. That is
 * 18.126–18.127's job, in `embedding.test.ts`. What these cases are about is the
 * loop: which notes it picks, what it writes for them, and when it is nudged.
 *
 * ## The title fallback, which is a RULING against the spec's literal query
 *
 * Spec §7.6's staleness query asks `c.note_id IS NULL OR c.src < n.seq OR
 * c.model <> $model`, and its chunking section says an empty document produces
 * zero chunks. Together those do not terminate. `EMPTY_NOTE_DOC` is what a note
 * created from a picker starts with, and a note with no chunks has NO ROW in
 * `search_note_chunks` — so `c.note_id IS NULL` is true on every pass, forever,
 * and with `LIMIT 20` a workspace holding twenty such notes would starve the
 * queue and never embed a real one.
 *
 * The worker therefore indexes a note whose document yields no chunks as ONE
 * chunk built from its title. `chunkDoc` still returns `[]` for an empty
 * document — 18.125 pins that, and it is the right answer for a pure function —
 * and the fallback is the worker's policy, stated here rather than left to be
 * discovered. A note's title is its most meaningful text, so a title-only note
 * is findable by meaning rather than invisible.
 */
let db: TestDatabase;
let fixture: NotesFixture;
beforeAll(async () => {
  db = await createTestDatabase();
  fixture = await seedNotesFixture(db.pool);
});
afterAll(async () => {
  await db.drop();
});

/** A deterministic unit-length vector of the right width, from the text. */
function fakeVector(text: string): Float32Array {
  const vector = new Float32Array(512);
  let seed = 7;
  for (const char of text) seed = (seed * 31 + char.codePointAt(0)!) % 100_003;
  for (let index = 0; index < vector.length; index += 1) {
    seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_647;
    vector[index] = (seed / 2_147_483_647) * 2 - 1;
  }
  let sum = 0;
  for (const value of vector) sum += value * value;
  const norm = Math.sqrt(sum);
  for (let index = 0; index < vector.length; index += 1) vector[index] = (vector[index] ?? 0) / norm;
  return vector;
}

type EmbedCall = string[];
let embedCalls: EmbedCall[] = [];

function fakeEmbedder(): (texts: string[]) => Promise<Float32Array[]> {
  return async (texts) => {
    embedCalls.push([...texts]);
    return texts.map(fakeVector);
  };
}

function workerWith(options: { model?: string; intervalMs?: number } = {}) {
  return startEmbedWorker(db.pool, {
    intervalMs: options.intervalMs ?? 60_000,
    embedTexts: fakeEmbedder(),
    model: options.model ?? 'test-model@1',
  });
}

function noteEv(noteId: string, type: string, payload: unknown): LedgerEvent {
  return makeCommitted({
    workspaceId: fixture.WS,
    actorId: fixture.ids.author,
    entity: { kind: 'note', id: noteId },
    type,
    payload,
  });
}

function docOf(...paragraphs: string[]): unknown {
  return {
    type: 'doc',
    attrs: { schemaVersion: 2 },
    content: paragraphs.map((text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })),
  };
}

type ChunkRow = { chunk_index: number; model: string; source_seq: string; chunk_text: string; vector_width: number };

async function chunksOf(noteId: string): Promise<ChunkRow[]> {
  const { rows } = await db.pool.query<ChunkRow>(
    `SELECT chunk_index, model, source_seq::text AS source_seq, chunk_text, vector_dims(embedding) AS vector_width
       FROM search_note_chunks WHERE note_id = $1 ORDER BY chunk_index`,
    [noteId],
  );
  return rows;
}

async function seqOf(noteId: string): Promise<string> {
  const { rows } = await db.pool.query<{ seq: string }>(
    'SELECT seq::text AS seq FROM proj_notes WHERE note_id = $1',
    [noteId],
  );
  return rows[0]?.seq ?? '';
}

describe('18.136–18.140 the embedding worker', () => {
  /**
   * 18.136 — the first run embeds every note, with the note's own seq and the
   * worker's model; a second run finds nothing to do.
   *
   * Mutation: ignore `source_seq`.
   */
  it('18.136 — embeds a stale note with its seq and model, and does not re-embed it', async () => {
    await applyCommitted(db.pool, [
      noteEv(fixture.NOTES.nWorkspace, 'note.body_set', { body: docOf('The compressor stopped in the cold room.') }),
    ]);

    const worker = workerWith();
    const first = await worker.runOnce();
    // All five fixture notes: four have empty documents (so they take the title
    // fallback) and this one has a body. None has any chunk row yet.
    expect(first, 'every unembedded note is picked up').toBe(5);

    const rows = await chunksOf(fixture.NOTES.nWorkspace);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.model).toBe('test-model@1');
    expect(rows[0]?.source_seq, "the note's own seq, so staleness is decidable").toBe(await seqOf(fixture.NOTES.nWorkspace));
    expect(rows[0]?.vector_width, 'the embedding fits the column').toBe(512);
    expect(rows[0]?.chunk_text).toContain('compressor stopped');

    // The TITLE FALLBACK, which the ruling above explains — and 'Private' with
    // its capital, because a chunk's text is PLAIN and not folded: folding is
    // `proj_note_search`'s job (18.131 pins it there), and a chunk is what the
    // snippet is cut from. A folded chunk would show a reader a lowercased
    // sentence as the reason a note matched.
    const empty = await chunksOf(fixture.NOTES.nPrivate);
    expect(empty, 'a note whose document yields no chunks is still recorded').toHaveLength(1);
    expect(empty[0]?.chunk_text).toBe('Private');

    const second = await worker.runOnce();
    expect(second, 'control: nothing is stale now, so a second pass does nothing').toBe(0);
    worker.stop();
  });

  /**
   * 18.137 — a new body replaces the chunks rather than adding to them.
   *
   * Mutation: append instead of replace.
   */
  it('18.137 — after note.body_set the next run REPLACES the chunks', async () => {
    const NOTE = newUlid();
    await applyCommitted(db.pool, [
      noteEv(NOTE, 'note.created', { title: 'Compressor log', homeProjectId: fixture.P, scope: { mode: 'workspace' } }),
      noteEv(NOTE, 'note.body_set', { body: docOf('one paragraph only') }),
    ]);

    const worker = workerWith({ model: 'replace-model@1' });
    await worker.runOnce();
    expect(await chunksOf(NOTE), 'one paragraph, one chunk').toHaveLength(1);

    await applyCommitted(db.pool, [
      noteEv(NOTE, 'note.body_set', {
        body: {
          type: 'doc',
          attrs: { schemaVersion: 2 },
          content: [
            { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Cold room' }] },
            { type: 'paragraph', content: [{ type: 'text', text: 'the belt is loose' }] },
            { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Roof' }] },
            { type: 'paragraph', content: [{ type: 'text', text: 'the felt is peeling' }] },
          ],
        },
      }),
    ]);

    const processed = await worker.runOnce();
    expect(processed, 'the note is stale because its seq moved').toBeGreaterThanOrEqual(1);

    const after = await chunksOf(NOTE);
    expect(after, 'TWO chunks, not three: the first body\'s chunk is gone').toHaveLength(2);
    expect(after.every((row) => row.source_seq === (after[0]?.source_seq ?? '')), 'all rows share the new seq').toBe(true);
    expect(after.flatMap((row) => row.chunk_text).join(' '), "the first body's text is no longer indexed").not.toContain(
      'one paragraph only',
    );
    worker.stop();
  });

  /**
   * 18.138 — a model change re-embeds everything.
   *
   * Mutation: ignore the model column.
   */
  it('18.138 — changing the model re-embeds every note', async () => {
    const worker = workerWith({ model: 'second-model@2' });
    const processed = await worker.runOnce();
    expect(processed, 'every note carries the old model, so every note is stale').toBeGreaterThanOrEqual(5);

    const rows = await chunksOf(fixture.NOTES.nWorkspace);
    expect(rows[0]?.model).toBe('second-model@2');

    // Control: a third run with the SAME model finds nothing — so the count
    // above is about the model column and not about the notes being endlessly
    // stale.
    expect(await worker.runOnce()).toBe(0);
    worker.stop();
  });

  /**
   * 18.139 — a deleted note loses its chunks; a restored note gets them back.
   *
   * Mutation: skip deleted notes.
   */
  it('18.139 — a deleted note\'s chunks are removed and a restored note\'s are rebuilt', async () => {
    const NOTE = newUlid();
    await applyCommitted(db.pool, [
      noteEv(NOTE, 'note.created', { title: 'Temporary', homeProjectId: fixture.P, scope: { mode: 'workspace' } }),
      noteEv(NOTE, 'note.body_set', { body: docOf('this note will be deleted') }),
    ]);
    const worker = workerWith({ model: 'delete-model@1' });
    await worker.runOnce();
    expect(await chunksOf(NOTE)).toHaveLength(1);

    await applyCommitted(db.pool, [noteEv(NOTE, 'note.deleted', {})]);
    await worker.runOnce();
    expect(await chunksOf(NOTE), 'a deleted note is not searchable by meaning either').toEqual([]);

    await applyCommitted(db.pool, [noteEv(NOTE, 'note.restored', {})]);
    await worker.runOnce();
    const restored = await chunksOf(NOTE);
    expect(restored, 'and the undo brings it back').toHaveLength(1);
    expect(restored[0]?.model).toBe('delete-model@1');
    worker.stop();
  });

  /**
   * 18.140 — the nudge: WHICH events cause it, and that several collapse into
   * one pass.
   *
   * Two halves, and both are needed. The first is the predicate the commit
   * listener uses, and it is asserted on the real `buildApp` wiring below rather
   * than on the function alone: a predicate that nothing calls is not a
   * listener. The second is the debounce, asserted against a FAKE pool and fake
   * timers — the shape of the count, not the SQL, is what is being pinned there.
   *
   * Mutation: nudge on every note event.
   */
  it('18.140 — only note.created and note.body_set nudge, and three nudges collapse into one run', async () => {
    // (a) the predicate, over every note type and a non-note one.
    const noteEvent = (type: string): LedgerEvent =>
      makeCommitted({
        workspaceId: fixture.WS,
        actorId: fixture.ids.author,
        entity: { kind: 'note', id: newUlid() },
        type,
        payload: {},
      });
    expect(nudgesEmbedding(noteEvent('note.created'))).toBe(true);
    expect(nudgesEmbedding(noteEvent('note.body_set'))).toBe(true);
    expect(nudgesEmbedding(noteEvent('note.renamed')), 'control: a rename does not change the text indexed').toBe(false);
    expect(nudgesEmbedding(noteEvent('note.scope_set'))).toBe(false);
    expect(nudgesEmbedding(noteEvent('comment.added'))).toBe(false);
    expect(
      nudgesEmbedding(
        makeCommitted({
          workspaceId: fixture.WS,
          actorId: fixture.ids.author,
          entity: { kind: 'ticket', id: newUlid() },
          type: 'ticket.created',
          payload: {},
        }),
      ),
      'control: another entity kind',
    ).toBe(false);

    // (b) the debounce. A fake pool, so the count is about the SCHEDULER: a
    // SELECT per pass is the observable, and a second pass would be a second
    // one.
    vi.useFakeTimers();
    try {
      const statements: string[] = [];
      const fakePool = {
        query: async (sql: string) => {
          statements.push(sql);
          return { rows: [], rowCount: 0 };
        },
        connect: async () => ({ query: async () => ({ rows: [], rowCount: 0 }), release: () => {} }),
      } as unknown as Pool;

      const worker = startEmbedWorker(fakePool, {
        intervalMs: 60_000,
        embedTexts: fakeEmbedder(),
        model: 'nudge-model@1',
      });
      const noteId = newUlid();
      worker.nudge(noteId);
      vi.advanceTimersByTime(40);
      worker.nudge(noteId);
      vi.advanceTimersByTime(40);
      worker.nudge(noteId);
      expect(statements, 'nothing has run yet — the debounce is pending').toEqual([]);

      await vi.advanceTimersByTimeAsync(600);
      const cleanupPasses = statements.filter((sql) => sql.includes('DELETE FROM search_note_chunks')).length;
      expect(cleanupPasses, 'three nudges inside 100 ms are ONE pass').toBe(1);
      worker.stop();
    } finally {
      vi.useRealTimers();
    }
  });
});

/**
 * The other half of 18.140, and the half a predicate test cannot reach: the
 * listener `buildApp` actually registers. A predicate nothing calls is not a
 * listener, and the negative here is not a control in the fixture's sense — it
 * is the same listener being handed an event it must ignore.
 */
describe('18.140 — buildApp registers the note-body commit listener', () => {
  it('nudges on note.created and note.body_set, and stays silent for note.renamed', async () => {
    const listeners: CommittedEventListener[] = [];
    const nudged: string[] = [];
    let unsubscribed = 0;
    const recordingIngest: IngestService = {
      ingestBatch: async () => [],
      ingestClientBatch: async () => [],
      ingestAtomic: async () => ({ status: 'committed', results: [] }),
      ingestClientAtomic: async () => ({ status: 'committed', results: [] }),
      onEventCommitted: (listener) => {
        listeners.push(listener);
        return () => {
          unsubscribed += 1;
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
      onNoteBodyCommitted: (noteId) => nudged.push(noteId),
    });

    // The stream hub and the notification fan-out are the other two; this one
    // is identified by what it DOES below, not by the count.
    expect(listeners.length).toBeGreaterThanOrEqual(3);

    const noteId = newUlid();
    const ticketId = newUlid();
    const eventOf = (kind: 'note' | 'ticket', id: string, type: string): LedgerEvent => ({
      ...makeCommitted({
        workspaceId: fixture.WS,
        actorId: fixture.ids.author,
        entity: { kind, id },
        type,
        payload: {},
      }),
    });

    for (const listener of listeners) listener(eventOf('note', noteId, 'note.created'));
    expect(nudged).toEqual([noteId]);

    for (const listener of listeners) listener(eventOf('note', noteId, 'note.renamed'));
    expect(nudged, 'control: a rename does not change what is embedded').toEqual([noteId]);

    for (const listener of listeners) listener(eventOf('note', noteId, 'note.body_set'));
    expect(nudged).toEqual([noteId, noteId]);

    for (const listener of listeners) listener(eventOf('ticket', ticketId, 'ticket.created'));
    expect(nudged, 'control: a ticket is not a note').toEqual([noteId, noteId]);

    // The subscription is dropped on close, like the hub's and the fan-out's:
    // a test file that builds several apps over one ingest service would
    // otherwise leave a live listener on each.
    await app.close();
    expect(unsubscribed).toBeGreaterThanOrEqual(1);
  });
});
