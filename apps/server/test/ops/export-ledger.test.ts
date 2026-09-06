import type { Readable } from 'node:stream';
import { gunzipSync } from 'node:zlib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { evaluateEvent } from '@gisik-nokma/rule-engine';
import { createIngestService } from '../../src/ingest/ingest-service.js';
import { exportLedger, gzippedNdjson } from '../../src/ops/export-ledger.js';
import { buildProjectionRegistry } from '../../src/projections/index.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { submittedWorkspaceCreated } from '../helpers/events.js';

class CaptureSink {
  puts: Array<{ key: string; bytes: Buffer; contentType: string }> = [];
  discarded: string[] = [];
  async put(key: string, body: Readable, contentType: string): Promise<void> {
    const chunks: Buffer[] = [];
    for await (const chunk of body) chunks.push(Buffer.from(chunk as Buffer));
    this.puts.push({ key, bytes: Buffer.concat(chunks), contentType });
  }
  async discard(key: string): Promise<void> {
    this.discarded.push(key);
  }
}

/** The one put an export makes, or a loud failure — never `undefined`. */
function onlyPut(sink: CaptureSink): { key: string; bytes: Buffer; contentType: string } {
  expect(sink.puts).toHaveLength(1);
  const put = sink.puts[0];
  if (!put) throw new Error('exportLedger wrote nothing to the sink');
  return put;
}

function decodedLines(bytes: Buffer): string[] {
  return gunzipSync(bytes).toString('utf8').trimEnd().split('\n');
}

let db: TestDatabase;
beforeAll(async () => {
  db = await createTestDatabase();
  const ingest = createIngestService({
    pool: db.pool,
    evaluate: evaluateEvent,
    projections: buildProjectionRegistry(),
  });
  await ingest.ingestBatch([
    submittedWorkspaceCreated(),
    submittedWorkspaceCreated(),
    submittedWorkspaceCreated(),
  ]);
});
afterAll(async () => {
  await db.drop();
});

describe('exportLedger — the source of truth, exported', () => {
  /**
   * The plan's draft of this test asserted three lines and that EVERY envelope
   * was a `workspace.created`. Measured: three `workspace.created`
   * submissions commit twenty-one events, because ingest derives a companion
   * set per workspace — a default workflow, four ticket types and the owner's
   * membership. So the count is asserted against the database (below and in
   * the third test), and the three submissions are asserted by counting their
   * own type rather than by claiming nothing else exists.
   */
  it('writes dated ndjson.gz holding every envelope in canonical order', async () => {
    const sink = new CaptureSink();
    const key = await exportLedger(db.pool, sink, () => new Date('2026-08-23T22:00:00.000Z'));
    expect(key).toBe('ledger/2026-08-23.ndjson.gz');
    const put = onlyPut(sink);
    expect(put.contentType).toBe('application/gzip');
    const lines = decodedLines(put.bytes);
    const envelopes = lines.map((line) => JSON.parse(line) as { seq: number; type: string });
    expect(envelopes.filter((envelope) => envelope.type === 'workspace.created')).toHaveLength(3);
    expect(envelopes.every((envelope) => Number.isInteger(envelope.seq))).toBe(true);
  });

  it('is byte-deterministic — two exports of the same ledger are identical', async () => {
    const first = new CaptureSink();
    const second = new CaptureSink();
    await exportLedger(db.pool, first, () => new Date('2026-08-23T22:00:00.000Z'));
    await exportLedger(db.pool, second, () => new Date('2026-08-23T22:00:00.000Z'));
    expect(onlyPut(first).bytes.equals(onlyPut(second).bytes)).toBe(true);
  });

  /**
   * The byte-equality check above compares an export to ANOTHER EXPORT, so two
   * exports that both silently dropped the same rows would agree with each
   * other and still pass. These assertions compare the export to the DATABASE
   * instead, through queries issued independently of `readLedger` — a dropped
   * row changes the count and the seq list, and nothing about the export can
   * make those queries agree with it.
   *
   * The in-order comparison uses `ORDER BY entity_kind, entity_id, seq`
   * because that, not `ORDER BY seq`, is the canonical replay order
   * `readLedger` (`src/ledger/event-store.ts`) actually returns: three
   * separate workspace entities carry three independent ULID entity ids, so
   * insertion order and canonical order genuinely differ. `ORDER BY seq` is
   * still used, as a sorted-multiset comparison, so the check does not rest
   * on one ordering clause being copied correctly from the implementation.
   */
  it('holds exactly the rows the events table holds — counted and identified by independent queries', async () => {
    const sink = new CaptureSink();
    await exportLedger(db.pool, sink, () => new Date('2026-08-23T22:00:00.000Z'));
    const lines = decodedLines(onlyPut(sink).bytes);

    const counted = await db.pool.query<{ count: number }>(
      'SELECT count(*)::int AS count FROM events',
    );
    expect(lines).toHaveLength(counted.rows[0]?.count ?? -1);

    const exportedSeqs = lines.map((line) => (JSON.parse(line) as { seq: number }).seq);

    const canonical = await db.pool.query<{ seq: number }>(
      'SELECT seq FROM events ORDER BY entity_kind, entity_id, seq',
    );
    expect(exportedSeqs).toEqual(canonical.rows.map((row) => row.seq));

    const bySeq = await db.pool.query<{ seq: number }>('SELECT seq FROM events ORDER BY seq');
    expect([...exportedSeqs].sort((a, b) => a - b)).toEqual(bySeq.rows.map((row) => row.seq));
  });
});

describe('gzippedNdjson — a generator failure is a rejected read, not a hang', () => {
  /**
   * `source.pipe(gzip)` does not forward errors. Before the fix, a throwing row
   * source emitted `'error'` on a stream with no listener — an uncaught
   * exception — while `gzip` never ended, so the consumer (`sink.put`, and here
   * the `for await`) waited forever. The distinction this case pins is between
   * REJECTING and HANGING, so it carries its own timeout: the pre-fix code
   * would not fail this assertion, it would never reach it.
   */
  it('destroys the gzip half with the same error, so the consumer rejects rather than waiting', async () => {
    const exploding: Iterable<unknown> = {
      *[Symbol.iterator]() {
        yield { ok: 1 };
        throw new Error('row 2 is not serialisable');
      },
    };
    const stream = gzippedNdjson(exploding);
    await expect(
      (async () => {
        for await (const _chunk of stream) void _chunk;
      })(),
    ).rejects.toThrowError(/row 2 is not serialisable/);
  }, 5000);

  it('is the same stream the happy path uses — one gzipped line per row', async () => {
    const chunks: Buffer[] = [];
    for await (const chunk of gzippedNdjson([{ a: 1 }, { b: 2 }])) {
      chunks.push(Buffer.from(chunk as Buffer));
    }
    expect(gunzipSync(Buffer.concat(chunks)).toString('utf8')).toBe('{"a":1}\n{"b":2}\n');
  });
});
