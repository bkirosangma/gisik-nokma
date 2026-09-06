import { Readable } from 'node:stream';
import { createGzip } from 'node:zlib';
import type { Pool } from 'pg';
import { readLedger } from '../ledger/event-store.js';
import type { ObjectSink } from './object-sink.js';

/**
 * One gzipped ndjson line per row, as a stream the sink can consume.
 *
 * `source.pipe(gzip)` alone does NOT forward errors, which is the bug this
 * function exists to make impossible: if the generator throws (a
 * `JSON.stringify` failure on an unexpected row shape), `source` emits
 * `'error'` with NO listener — an uncaught exception that takes the worker
 * down — while `gzip` never ends, so whoever is reading it hangs instead of
 * failing. Destroying `gzip` with the same error turns both halves into one
 * rejected read for the consumer, which is what `sink.put` reports. Covered by
 * cases 13.32–13.33.
 */
export function gzippedNdjson(rows: Iterable<unknown>): Readable {
  const gzip = createGzip();
  const source = Readable.from(
    (function* () {
      for (const row of rows) yield `${JSON.stringify(row)}\n`;
    })(),
  );
  source.on('error', (error: Error) => gzip.destroy(error));
  return source.pipe(gzip);
}

/**
 * THE LEDGER IS THE SOURCE OF TRUTH. Every projection is derived from it
 * and rebuildable from it — Plan 1's rebuild path and the verify-projections
 * gate prove that continuously. This weekly export is therefore the minimal
 * sufficient recovery artifact: gzipped ndjson, one envelope per line, in
 * the canonical replay order `readLedger` defines (`entity_kind, entity_id,
 * seq` — per-entity history, contiguous, which is the order a replay reads).
 * The nightly pg_dump is the *convenient* restore; this file is the
 * *fundamental* one.
 *
 * KNOWN CEILING, recorded as case 13.34 rather than left to be discovered:
 * `readLedger` runs one `SELECT * FROM events` and materialises the WHOLE
 * table as JS objects before a single byte is written, so peak memory scales
 * with the ledger, not with a constant. The gzip/upload half downstream IS
 * streamed and multipart, so the neighbouring `pg_dump` claim ("a
 * multi-gigabyte dump never lands in the worker's memory") is true of that job
 * and NOT of this one. On the `basic-xxs` (512 MB) worker `deploy/do/app.yaml`
 * provisions, this is the one job whose OOM means no recovery artifact at all.
 * Fixing it means a cursor- or LIMIT/OFFSET-paged read feeding the same
 * generator — a change to `readLedger`'s contract, which is why it is bounded
 * and recorded here rather than done inside a backup task.
 */
export async function exportLedger(pool: Pool, sink: ObjectSink, now: () => Date): Promise<string> {
  const envelopes = await readLedger(pool);
  const key = `ledger/${now().toISOString().slice(0, 10)}.ndjson.gz`;
  await sink.put(key, gzippedNdjson(envelopes), 'application/gzip');
  return key;
}
