import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid, PURGED_ITEM_LABEL, type LedgerEvent } from '@gisik-nokma/domain';
import { buildApp } from '../../src/app.js';
import { createAuth } from '../../src/auth/auth.js';
import { LogMagicLinkSender } from '../../src/auth/magic-link-sender.js';
import { LogOtpSender } from '../../src/auth/otp-sender.js';
import { createObjectStoreFromEnv } from '../../src/attachments/store-config.js';
import type { CommittedEventListener, IngestService } from '../../src/ingest/ingest-service.js';
import { buildProjectionRegistry } from '../../src/projections/index.js';
import { purgeItem } from '../../src/purge/purge-item.js';
import { nudgesEmbedding, nudgesItemEmbedding } from '../../src/search/nudge.js';
import { startEmbedWorker } from '../../src/search/embed-worker.js';
import { applyCommitted, makeCommitted } from '../helpers/apply.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { seedNotesFixture, type NotesFixture } from '../helpers/notes-fixture.js';
import { dueAt, recordingStore } from '../purge/world.js';

/**
 * Knowledge Graph spec D §2 (plan 2026-10-03-mcp-graph-semantic-layer.md, Task 2): the embedding
 * worker's ITEMS pass — tickets (title, then description) and ticket comments into
 * `search_item_chunks`. Cases 27.420–27.426.
 *
 * ## The fake embedder, and the log
 *
 * Every worker here injects `embedTexts` (no model is loaded: what a vector MEANS is
 * `search-meaning-tickets.test.ts`'s job) and records each call's texts in `embedCalls`. Every
 * worker is also built with `log`, and every `it` ends with `expect(logged).toEqual([])`:
 * `runOnce` IS `runGuarded` (`embed-worker.ts`), which catches any throw, logs it and returns 0,
 * so without that line every "returns 0" leg below would also be green when the items pass throws.
 *
 * ## One world, in order
 *
 * The cases share the notes fixture and run in file order (27.420 seeds what 27.421 edits, and so
 * on), as `embed-worker.test.ts`'s 18.136–18.140 do. `MODEL` moves to `'other@x'` in 27.423 and
 * stays there, so later passes do not re-embed everything for a model change they are not about.
 */
let db: TestDatabase;
let fixture: NotesFixture;
const TITLE = 'Renew the trade licence';
const TE_TITLE = 'Share the July invoices';
const COMMENT_TEXT = 'Ask the accountant about the waiver';
let commentId = '';
let blankCommentId = '';

/** A deterministic unit-length vector of the right width, from the text (`embed-worker.test.ts`'s). */
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

let embedCalls: string[][] = [];
let logged: string[] = [];
let MODEL = 'test-model@1';

/** A worker over the test database; `before` runs inside the embedder, before it answers (the race seam). */
function worker(before?: (texts: string[]) => Promise<void>) {
  return startEmbedWorker(db.pool, {
    intervalMs: 3_600_000,
    model: MODEL,
    log: (msg) => logged.push(msg),
    embedTexts: async (texts) => {
      embedCalls.push([...texts]);
      if (before !== undefined) await before(texts);
      return texts.map(fakeVector);
    },
  });
}

async function pass(before?: (texts: string[]) => Promise<void>): Promise<number> {
  const w = worker(before);
  try {
    return await w.runOnce();
  } finally {
    w.stop();
  }
}

function ticketEv(ticketId: string, type: string, payload: unknown): LedgerEvent {
  return makeCommitted({ workspaceId: fixture.WS, actorId: fixture.ids.owner, entity: { kind: 'ticket', id: ticketId }, type, payload });
}

function created(ticketId: string, title: string): LedgerEvent {
  return ticketEv(ticketId, 'ticket.created', { typeId: 'task', projectId: fixture.P, parentId: null, title });
}

const textNode = (text: string) => ({ type: 'text', text });
const paragraph = (...inline: unknown[]) => ({ type: 'paragraph', content: inline });
const heading = (text: string) => ({ type: 'heading', attrs: { level: 1 }, content: [textNode(text)] });
const docOf = (...blocks: unknown[]) => ({ type: 'doc', attrs: { schemaVersion: 2 }, content: blocks });
const describe_ = (value: unknown) => ({ fieldId: 'description', value });

type ItemRow = {
  item_kind: string;
  item_id: string;
  chunk_index: number;
  ticket_id: string;
  heading_path: string;
  chunk_text: string;
  model: string;
  source_hash: string;
  embedding: string;
};

async function rowsWhere(where: string, params: unknown[]): Promise<ItemRow[]> {
  const { rows } = await db.pool.query<ItemRow>(
    `SELECT item_kind, item_id, chunk_index, ticket_id, heading_path, chunk_text, model, source_hash, embedding::text AS embedding
       FROM search_item_chunks WHERE ${where} ORDER BY item_kind, item_id, chunk_index`,
    params,
  );
  return rows;
}

const ticketRows = (ticketId: string) => rowsWhere(`item_kind = 'ticket' AND item_id = $1`, [ticketId]);
const commentRows = (id: string) => rowsWhere(`item_kind = 'comment' AND item_id = $1`, [id]);
const rowsOfTicket = (ticketId: string) => rowsWhere('ticket_id = $1', [ticketId]);
const shape = (rows: ItemRow[]) => rows.map((row) => [row.chunk_index, row.heading_path, row.chunk_text]);

/** The plan's hash expressions, re-stated HERE over the live projection rows (not imported from the worker). */
async function ticketHash(ticketId: string): Promise<string> {
  const { rows } = await db.pool.query<{ h: string }>(
    `SELECT md5(coalesce(fields->'title'->>'value', '') || E'\\n' || coalesce((fields->'description'->'value')::text, '')) AS h
       FROM proj_tickets WHERE ticket_id = $1`,
    [ticketId],
  );
  return rows[0]!.h;
}
async function commentHash(id: string): Promise<string> {
  const { rows } = await db.pool.query<{ h: string }>('SELECT md5(coalesce(body::text, \'\')) AS h FROM proj_ticket_comments WHERE comment_id = $1', [id]);
  return rows[0]!.h;
}

beforeAll(async () => {
  db = await createTestDatabase();
  fixture = await seedNotesFixture(db.pool);
  const comment = ticketEv(fixture.TP, 'comment.added', { body: docOf(paragraph(textNode(COMMENT_TEXT))) });
  const blank = ticketEv(fixture.TP, 'comment.added', { body: docOf({ type: 'paragraph' }) });
  commentId = comment.id;
  blankCommentId = blank.id;
  await applyCommitted(db.pool, [
    ticketEv(
      fixture.TP,
      'ticket.field_set',
      describe_(
        docOf(
          heading('Licence'),
          paragraph(textNode('Renewal needs the stamped form')),
          heading('Fees'),
          paragraph(textNode('Pay the fee at the counter')),
        ),
      ),
    ),
    comment,
    blank,
  ]);
}, 60_000);

afterAll(async () => {
  await db.drop();
});

describe('27.420–27.426 the embedding worker’s items pass (KG-D T2)', () => {
  it('27.420 — runOnce writes the ticket’s title + description chunks and one chunk per comment, with the text hash', async () => {
    logged = [];
    embedCalls = [];
    expect(await pass()).toBeGreaterThan(0);

    expect(shape(await ticketRows(fixture.TP))).toEqual([
      [0, '', TITLE],
      [1, 'Licence', 'Licence\nRenewal needs the stamped form'],
      [2, 'Fees', 'Fees\nPay the fee at the counter'],
    ]);
    const comment = await commentRows(commentId);
    expect(comment.map((row) => [row.chunk_index, row.ticket_id, row.chunk_text])).toEqual([[0, fixture.TP, COMMENT_TEXT]]);
    // A comment with no text: ONE blank chunk, so the staleness query does not re-pick it forever.
    expect((await commentRows(blankCommentId)).map((row) => [row.chunk_index, row.ticket_id, row.chunk_text])).toEqual([[0, fixture.TP, '']]);

    const tpHash = await ticketHash(fixture.TP);
    for (const row of await ticketRows(fixture.TP)) expect(row.source_hash, `TP chunk ${String(row.chunk_index)}`).toBe(tpHash);
    expect(comment[0]!.source_hash).toBe(await commentHash(commentId));
    expect((await commentRows(blankCommentId))[0]!.source_hash).toBe(await commentHash(blankCommentId));
    expect((await ticketRows(fixture.TE)).map((row) => row.chunk_text)).toEqual([TE_TITLE]);

    // Control: in step — nothing stale, nothing re-embedded, nothing rewritten.
    const before = await rowsWhere('TRUE', []);
    const calls = embedCalls.length;
    expect(await pass()).toBe(0);
    expect(await rowsWhere('TRUE', [])).toEqual(before);
    expect(embedCalls.length).toBe(calls);
    expect(logged).toEqual([]);
  });

  it('27.421 — a description edit moves the hash and REPLACES the chunk set whole; a priority edit re-embeds nothing', async () => {
    logged = [];
    await applyCommitted(db.pool, [ticketEv(fixture.TP, 'ticket.field_set', describe_(docOf(paragraph(textNode('Renewal is due')))))]);
    expect(await pass()).toBeGreaterThanOrEqual(1);
    expect(shape(await ticketRows(fixture.TP))).toEqual([
      [0, '', TITLE],
      [1, '', 'Renewal is due'],
    ]);
    const { rows } = await db.pool.query<{ max: number }>(
      `SELECT max(chunk_index)::int AS max FROM search_item_chunks WHERE item_kind = 'ticket' AND item_id = $1`,
      [fixture.TP],
    );
    expect(rows[0]!.max).toBe(1);

    // Control: a field that is not embedded text.
    const before = await ticketRows(fixture.TP);
    await applyCommitted(db.pool, [ticketEv(fixture.TP, 'ticket.field_set', { fieldId: 'priority', value: 'P1' })]);
    expect(await pass()).toBe(0);
    expect(await ticketRows(fixture.TP)).toEqual(before);
    expect(logged).toEqual([]);
  });

  it('27.422 — an edited comment is re-embedded; deleted comments and tickets lose their rows; a restore rebuilds them', async () => {
    logged = [];
    const mark = embedCalls.length;
    const teBefore = await rowsOfTicket(fixture.TE);
    expect(teBefore.length).toBeGreaterThan(0);

    const oldHash = (await commentRows(commentId))[0]!.source_hash;
    await applyCommitted(db.pool, [ticketEv(fixture.TP, 'comment.edited', { commentId, body: docOf(paragraph(textNode('Bring the April receipt'))) })]);
    expect(await pass()).toBeGreaterThanOrEqual(1);
    const edited = await commentRows(commentId);
    expect(edited.map((row) => row.chunk_text)).toEqual(['Bring the April receipt']);
    expect(edited[0]!.source_hash).not.toBe(oldHash);
    expect(edited[0]!.source_hash).toBe(await commentHash(commentId));

    const ticketCount = (await ticketRows(fixture.TP)).length;
    expect(ticketCount).toBeGreaterThan(0);
    await applyCommitted(db.pool, [ticketEv(fixture.TP, 'comment.deleted', { commentId })]);
    expect(await pass()).toBeGreaterThanOrEqual(1);
    expect(await commentRows(commentId)).toEqual([]);
    expect((await ticketRows(fixture.TP)).length).toBe(ticketCount);

    await applyCommitted(db.pool, [ticketEv(fixture.TP, 'ticket.deleted', {})]);
    expect(await pass()).toBeGreaterThanOrEqual(1);
    expect(await rowsOfTicket(fixture.TP)).toEqual([]);

    await applyCommitted(db.pool, [ticketEv(fixture.TP, 'ticket.restored', {})]);
    expect(await pass()).toBeGreaterThanOrEqual(1);
    const restored = await ticketRows(fixture.TP);
    expect(restored.length).toBeGreaterThanOrEqual(1);
    expect(shape(restored)[0]).toEqual([0, '', TITLE]);

    // Control: TE was never touched — its rows are byte-equal AND it was never re-embedded (a delete and
    // re-write would leave equal rows, so the equality alone cannot see it).
    expect(await rowsOfTicket(fixture.TE)).toEqual(teBefore);
    expect(embedCalls.slice(mark).flat()).not.toContain(TE_TITLE);
    expect(logged).toEqual([]);
  });

  it('27.423 — a model change re-embeds every ticket and comment row', async () => {
    logged = [];
    await applyCommitted(db.pool, [ticketEv(fixture.TP, 'comment.added', { body: docOf(paragraph(textNode('Phone the registrar'))) })]);
    await pass();
    const kinds = await db.pool.query<{ item_kind: string; n: number }>(
      'SELECT item_kind, count(DISTINCT item_id)::int AS n FROM search_item_chunks GROUP BY item_kind ORDER BY item_kind',
    );
    const counts = Object.fromEntries(kinds.rows.map((row) => [row.item_kind, row.n]));
    expect(counts['ticket']).toBeGreaterThanOrEqual(1);
    expect(counts['comment']).toBeGreaterThanOrEqual(1);
    const items = (counts['ticket'] ?? 0) + (counts['comment'] ?? 0);

    MODEL = 'other@x';
    expect(await pass()).toBeGreaterThanOrEqual(items);
    const models = await db.pool.query<{ item_kind: string; model: string }>(
      'SELECT DISTINCT item_kind, model FROM search_item_chunks ORDER BY item_kind, model',
    );
    expect(models.rows).toEqual([
      { item_kind: 'comment', model: 'other@x' },
      { item_kind: 'ticket', model: 'other@x' },
    ]);

    // Control: the same model again finds nothing stale.
    expect(await pass()).toBe(0);
    expect(logged).toEqual([]);
  });

  it('27.424 — a ticket deleted mid-embed gets no rows; an edit made mid-embed is re-embedded on the next pass', async () => {
    logged = [];
    // (1) The FOR SHARE recheck: TR is deleted while its text is being embedded; its twin TR2 is not.
    const [TR, TR2] = [newUlid(), newUlid()];
    await applyCommitted(db.pool, [created(TR, 'Doomed race ticket'), created(TR2, 'Surviving race twin')]);
    expect(await rowsOfTicket(TR)).toEqual([]);
    let fired = false;
    await pass(async (texts) => {
      if (!fired && texts.includes('Doomed race ticket')) {
        fired = true;
        await applyCommitted(db.pool, [ticketEv(TR, 'ticket.deleted', {})]);
      }
    });
    expect(fired).toBe(true);
    const { rows } = await db.pool.query<{ deleted: boolean }>('SELECT deleted_at IS NOT NULL AS deleted FROM proj_tickets WHERE ticket_id = $1', [TR]);
    expect(rows[0]!.deleted).toBe(true);
    expect(await rowsOfTicket(TR)).toEqual([]);
    expect(shape(await ticketRows(TR2))[0]).toEqual([0, '', 'Surviving race twin']); // control: the same pass writes the twin

    // (2) The hash written is the one the TEXT was read with, not the one current at commit.
    const TQ = newUlid();
    const TQ_TITLE = 'Quarterly race ticket';
    await applyCommitted(db.pool, [created(TQ, TQ_TITLE), ticketEv(TQ, 'ticket.field_set', describe_(docOf(paragraph(textNode('Version zero')))))]);
    await pass();
    const h0 = (await ticketRows(TQ))[0]!.source_hash;
    const first = docOf(paragraph(textNode('Version one text')));
    const second = docOf(paragraph(textNode('Version two text')));
    await applyCommitted(db.pool, [ticketEv(TQ, 'ticket.field_set', describe_(first))]);
    let edited = false;
    await pass(async (texts) => {
      if (!edited && texts.includes(TQ_TITLE)) {
        edited = true;
        await applyCommitted(db.pool, [ticketEv(TQ, 'ticket.field_set', describe_(second))]);
      }
    });
    expect(edited).toBe(true);
    const firstHash = await db.pool.query<{ h: string }>(`SELECT md5($1::text || E'\\n' || $2::jsonb::text) AS h`, [TQ_TITLE, JSON.stringify(first)]);
    const afterRace = await ticketRows(TQ);
    expect(shape(afterRace)).toEqual([
      [0, '', TQ_TITLE],
      [1, '', 'Version one text'],
    ]);
    for (const row of afterRace) expect(row.source_hash).toBe(firstHash.rows[0]!.h);
    expect(firstHash.rows[0]!.h).not.toBe(h0);

    expect(await pass()).toBeGreaterThanOrEqual(1);
    expect(shape(await ticketRows(TQ))).toEqual([
      [0, '', TQ_TITLE],
      [1, '', 'Version two text'],
    ]);
    expect(logged).toEqual([]);
  });

  it('27.425 — nudgesItemEmbedding: ticket and ticket-comment text events only; buildApp ORs it into the nudge', async () => {
    const event = (kind: 'ticket' | 'note', type: string): LedgerEvent =>
      makeCommitted({ workspaceId: fixture.WS, actorId: fixture.ids.owner, entity: { kind, id: newUlid() }, type, payload: {} });
    for (const type of ['ticket.created', 'ticket.field_set', 'ticket.deleted', 'ticket.restored', 'comment.added', 'comment.edited', 'comment.deleted']) {
      expect(nudgesItemEmbedding(event('ticket', type)), type).toBe(true);
    }
    expect(nudgesItemEmbedding(event('note', 'comment.added')), 'a note’s comment is not embedded').toBe(false);
    expect(nudgesItemEmbedding(event('note', 'note.created'))).toBe(false);
    expect(nudgesItemEmbedding(event('ticket', 'ticket.transitioned')), 'a transition changes no embedded text').toBe(false);

    // Control: 18.140's predicate is unchanged.
    expect(nudgesEmbedding(event('note', 'note.created'))).toBe(true);
    expect(nudgesEmbedding(event('note', 'note.body_set'))).toBe(true);
    expect(nudgesEmbedding(event('note', 'note.renamed'))).toBe(false);
    expect(nudgesEmbedding(event('note', 'comment.added'))).toBe(false);
    expect(nudgesEmbedding(event('ticket', 'ticket.created'))).toBe(false);

    // The wiring: the listener buildApp registers (18.140's recording ingest service).
    const listeners: CommittedEventListener[] = [];
    const nudged: string[] = [];
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
      onNoteBodyCommitted: (id) => nudged.push(id),
    });
    try {
      for (const listener of listeners) listener(ticketEv(fixture.TP, 'ticket.field_set', { fieldId: 'priority', value: 'P2' }));
      expect(nudged).toEqual([fixture.TP]);
      for (const listener of listeners) listener(ticketEv(fixture.TP, 'ticket.transitioned', { toStateId: 'doing' }));
      expect(nudged, 'control: a transition does not nudge').toEqual([fixture.TP]);
    } finally {
      await app.close();
    }
  });

  it('27.426 — a ticket purge erases its rows; a survivor that chips it is re-chunked with the purged label', async () => {
    logged = [];
    // The survivor: TS2's description holds a ticketRef chip to TP (`collectSurvivors` finds it by the
    // payload text; `docToPlainText` renders the chip as `KEY title`).
    const TS2 = newUlid();
    await applyCommitted(db.pool, [
      created(TS2, 'Licence follow-up'),
      ticketEv(
        TS2,
        'ticket.field_set',
        describe_(docOf(paragraph(textNode('see '), { type: 'ticketRef', attrs: { ticketId: fixture.TP, projectId: fixture.P, key: 'CC-1', title: TITLE } }))),
      ),
    ]);
    await pass();
    const survivorBefore = await ticketRows(TS2);
    expect(survivorBefore.length).toBeGreaterThanOrEqual(1);
    expect(survivorBefore.map((row) => row.chunk_text)).toContain(`see CC-1 ${TITLE}`);
    expect((await rowsOfTicket(fixture.TP)).length).toBeGreaterThan(0);
    const teBefore = await rowsOfTicket(fixture.TE);
    expect(teBefore.length).toBeGreaterThan(0);

    // Drive the purge the way test/purge/ drives one (world.ts `buildTicketWorld`: ticket.deleted, then
    // purge.marked; purge-ticket.test.ts 19.110: `purgeItem` at `dueAt`). NO pass in between: the next
    // pass's cleanup DELETE would remove TP's rows anyway, so this is about erasure.ts alone.
    await applyCommitted(db.pool, [ticketEv(fixture.TP, 'ticket.deleted', {}), ticketEv(fixture.TP, 'purge.marked', {})]);
    const outcome = await purgeItem(db.pool, { kind: 'ticket', id: fixture.TP }, {
      projections: buildProjectionRegistry(),
      store: recordingStore(),
      now: await dueAt(db.pool, 'ticket', fixture.TP),
    });
    expect(outcome.status).toBe('purged');
    expect(await rowsOfTicket(fixture.TP)).toEqual([]);
    expect(await rowsOfTicket(TS2), 'the survivor is re-derived: its rows go, before any pass').toEqual([]);

    expect(await pass()).toBeGreaterThanOrEqual(1);
    const survivorAfter = (await ticketRows(TS2)).map((row) => row.chunk_text);
    expect(survivorAfter).toContain(`see ${PURGED_ITEM_LABEL}`);
    expect(survivorAfter.join('\n')).not.toContain(TITLE);

    // Control: TE was not in the purge set.
    expect(await rowsOfTicket(fixture.TE)).toEqual(teBefore);
    expect(logged).toEqual([]);
  });
});
