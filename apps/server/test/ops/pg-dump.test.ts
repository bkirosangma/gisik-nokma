import { execSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Readable } from 'node:stream';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { evaluateEvent } from '@gisik-nokma/rule-engine';
import { createIngestService } from '../../src/ingest/ingest-service.js';
import { dumpDatabaseToSink, splitDatabaseUrl } from '../../src/ops/pg-dump.js';
import { buildProjectionRegistry } from '../../src/projections/index.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { submittedWorkspaceCreated } from '../helpers/events.js';

// Homebrew keeps libpq keg-only, so pg_dump/pg_restore are off PATH by default
// on a developer machine. Prepending it costs nothing where they are already
// on PATH (CI's postgresql-client-16 package) and saves a silent skip here.
//
// THE GUARD AND THE SUBJECT MUST PROBE THE SAME PATH. An earlier version
// prepended libpq only for the probe's own `execSync` and for `pgRestore`'s
// `spawnSync`, via a per-child `env:` override — but `dumpDatabaseToSink`
// spawns `pg_dump` with the INHERITED `process.env.PATH`. On the exact machine
// this comment names, the probe therefore said "available", the suite ran, and
// all four cases failed with `spawn pg_dump ENOENT`, the planted-defect one
// included ("expected to throw /pg_dump exited/ but got spawn pg_dump ENOENT").
// A guard that converts a clean skip into four red tests is a defect in the
// guard. So the process's OWN `PATH` is amended here, at module scope — before
// `describe.skipIf(...)` evaluates, which `beforeAll` would be too late for —
// and every resolution below, the implementation's included, is then identical.
const LIBPQ_BIN = '/opt/homebrew/opt/libpq/bin';
process.env.PATH = `${LIBPQ_BIN}:${process.env.PATH ?? ''}`;

function pgDumpAvailable(): boolean {
  try {
    execSync('pg_dump --version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

class CaptureSink {
  bytes = Buffer.alloc(0);
  key = '';
  discarded: string[] = [];
  async put(key: string, body: Readable): Promise<void> {
    this.key = key;
    const chunks: Buffer[] = [];
    for await (const chunk of body) chunks.push(Buffer.from(chunk as Buffer));
    this.bytes = Buffer.concat(chunks);
  }
  async discard(key: string): Promise<void> {
    this.discarded.push(key);
  }
}

/** Writes the captured archive out and returns the path, plus its directory. */
function materialise(bytes: Buffer): { dir: string; file: string } {
  const dir = mkdtempSync(join(tmpdir(), 'gisik-pg-dump-'));
  const file = join(dir, 'capture.dump');
  writeFileSync(file, bytes);
  return { dir, file };
}

function pgRestore(args: string[]): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync('pg_restore', args, { encoding: 'utf8' });
  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

let db: TestDatabase;
let seededEventId = '';
beforeAll(async () => {
  db = await createTestDatabase();
  // A dump of an EMPTY database still starts with the PGDMP magic bytes and
  // still lists a `TABLE DATA public events` entry in its table of contents
  // (measured, 2026-09-06, against pg_dump 18.4 / server 16.15 — both an
  // empty and a one-row database produced byte-identical TOC lines for it).
  // So the suite seeds a real event and pins that event's own id inside the
  // archive: the only assertion here that an empty database would fail.
  const ingest = createIngestService({
    pool: db.pool,
    evaluate: evaluateEvent,
    projections: buildProjectionRegistry(),
  });
  const seeded = submittedWorkspaceCreated();
  seededEventId = seeded.id;
  await ingest.ingestBatch([seeded]);
});
afterAll(async () => {
  await db.drop();
});

describe.skipIf(!pgDumpAvailable())('dumpDatabaseToSink (needs pg_dump on PATH — CI installs it)', () => {
  it('streams a custom-format dump to a dated key', async () => {
    const sink = new CaptureSink();
    const key = await dumpDatabaseToSink(db.url, sink, () => new Date('2026-08-20T21:00:00.000Z'));
    expect(key).toBe('pg/2026-08-20T21-00.dump');
    expect(sink.bytes.subarray(0, 5).toString('latin1')).toBe('PGDMP');
  });

  it('the archive is a real one pg_restore can read, and its table of contents names the events table', async () => {
    const sink = new CaptureSink();
    await dumpDatabaseToSink(db.url, sink, () => new Date('2026-08-20T21:00:00.000Z'));
    const { dir, file } = materialise(sink.bytes);
    try {
      const listed = pgRestore(['--list', file]);
      expect(listed.stderr).toBe('');
      expect(listed.status).toBe(0);
      expect(listed.stdout).toContain('events');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('the seeded event is actually INSIDE the archive — the assertion an empty database fails', async () => {
    const sink = new CaptureSink();
    await dumpDatabaseToSink(db.url, sink, () => new Date('2026-08-20T21:00:00.000Z'));
    const { dir, file } = materialise(sink.bytes);
    try {
      // `--data-only --table=events --file=-` renders the archive's COPY block
      // to stdout. An empty events table renders `COPY ... FROM stdin;` with
      // no rows between it and the terminator, so a ULID appearing here is
      // evidence about the DATA, not merely about the schema or the header.
      const data = pgRestore(['--data-only', '--table=events', '--file=-', file]);
      expect(data.status).toBe(0);
      expect(seededEventId).not.toBe('');
      expect(data.stdout).toContain(seededEventId);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('planted defect: a bad database url fails loudly with pg_dump’s stderr', async () => {
    const sink = new CaptureSink();
    await expect(
      dumpDatabaseToSink('postgres://gisik:wrong@localhost:54329/no_such_db', sink, () => new Date()),
    ).rejects.toThrowError(/pg_dump exited/);
  });

  /**
   * Rejecting is not enough on its own. `sink.put` is handed `child.stdout`
   * before the exit code exists, so a dump that dies halfway has ALREADY
   * streamed a short archive to a normal-looking dated key — and a restore
   * drill that takes "the latest dump" cannot tell it from a good one. This
   * case asserts the key is discarded, by name, so the failure leaves nothing
   * behind. It fails against the previous implementation, which threw without
   * touching the upload at all.
   */
  it('a failed dump leaves NO object behind — the key it wrote to is discarded, named', async () => {
    const sink = new CaptureSink();
    const key = 'pg/2026-08-20T21-00.dump';
    await expect(
      dumpDatabaseToSink(
        'postgres://gisik:wrong@localhost:54329/no_such_db',
        sink,
        () => new Date('2026-08-20T21:00:00.000Z'),
      ),
    ).rejects.toThrowError(/pg_dump exited/);
    expect(sink.discarded).toEqual([key]);
    expect(sink.key).toBe(key); // the same key the put was aimed at, not a near-miss
  });

});

/**
 * OUTSIDE the `skipIf` block on purpose: `splitDatabaseUrl` is a pure function
 * and needs no `pg_dump`, so gating it on the binary would hide it on exactly
 * the machines that skip.
 *
 * The connection URL carries the production database password, and every
 * process on the host can read another's argv. The live cases above all run
 * against `db.url`, which HAS a password in it, so their passing is what shows
 * the `PGPASSWORD` channel actually carries it; this case is the other half —
 * that the argv no longer does.
 */
describe('splitDatabaseUrl', () => {
  it('the database password travels in PGPASSWORD, never in argv where `ps` can read it', () => {
    const split = splitDatabaseUrl('postgres://gisik:s3cr3t@localhost:54329/postgres?sslmode=require');
    expect(split.password).toBe('s3cr3t');
    expect(split.dsn).not.toContain('s3cr3t');
    expect(split.dsn).toContain('sslmode=require'); // query parameters survive
    expect(split.dsn).toContain('gisik'); // the user does not
    // A conninfo string that is not a URL at all is passed through untouched
    // rather than refused — libpq accepts that form and so must this.
    expect(splitDatabaseUrl('host=localhost dbname=postgres')).toEqual({
      dsn: 'host=localhost dbname=postgres',
    });
  });

  /**
   * The shapes that could have produced a malformed DSN, measured rather than
   * assumed. A password with no user is the interesting one: WHATWG `URL` drops
   * the whole userinfo section once both halves are empty, so it yields
   * `postgres://h/db` and not the `postgres://:@h/db` a naive strip would give.
   */
  it.each([
    ['postgres://:pw@h/db', 'postgres://h/db', 'pw'], // password, no user
    ['postgres://u:p%40w@h/db?sslmode=require', 'postgres://u@h/db?sslmode=require', 'p@w'], // percent-encoded
  ])('%s -> %s', (input, dsn, password) => {
    expect(splitDatabaseUrl(input)).toEqual({ dsn, password });
  });

  it.each([['postgres://u@h/db'], ['postgres://h/db']])(
    '%s has no password to move, and is returned verbatim',
    (input) => {
      expect(splitDatabaseUrl(input)).toEqual({ dsn: input });
    },
  );
});
