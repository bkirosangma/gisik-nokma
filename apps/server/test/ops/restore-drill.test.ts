import { execSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { evaluateEvent } from '@gisik-nokma/rule-engine';
import { createPool } from '../../src/db.js';
import { createIngestService } from '../../src/ingest/ingest-service.js';
import { splitDatabaseUrl } from '../../src/ops/pg-dump.js';
import { buildProjectionRegistry } from '../../src/projections/index.js';
import { verifyProjections } from '../../src/tools/verify-projections.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { submittedWorkspaceCreated } from '../helpers/events.js';

// THE GUARD, THE IMPLEMENTATION AND THE SPAWNED SCRIPT MUST ALL PROBE THE SAME
// PATH — the lesson `pg-dump.test.ts` records at length (case 13.36), which
// this file inherits with one extra party. Homebrew keeps libpq keg-only, so
// `pg_dump`/`pg_restore`/`psql` are off PATH by default on a developer machine.
// A per-child `env:` override on the probe alone would let the suite run and
// then fail inside `bash scripts/restore.sh` with `pg_restore: command not
// found`, because the script resolves its binary from the PATH bash inherits
// from `process.env`. So the PROCESS's own PATH is amended once, here at module
// scope — before `describe.skipIf(...)` evaluates, which `beforeAll` would be
// too late for — and the probe, the direct spawns and the spawned script all
// resolve identically.
const LIBPQ_BIN = '/opt/homebrew/opt/libpq/bin';
process.env.PATH = `${LIBPQ_BIN}:${process.env.PATH ?? ''}`;

const ADMIN_URL =
  process.env['TEST_DATABASE_ADMIN_URL'] ?? 'postgres://gisik:gisik@localhost:54329/postgres';

const RESTORE_SH = fileURLToPath(new URL('../../../../scripts/restore.sh', import.meta.url));

/**
 * `pg_restore (PostgreSQL) 18.4` -> 18. Null when either binary is absent, so
 * this doubles as the both-binaries-present probe.
 *
 * The regex is ANCHORED to pg_restore's own line on purpose. A bare
 * `/(\d+)\.\d+/` against the combined output returns the FIRST match — pg_dump's
 * version — which is indistinguishable from correct on a machine where both
 * come from one install, and silently wrong on exactly the machine this gate
 * exists for: one with a pg_dump and a pg_restore from different installs.
 * pg_restore is the binary whose major must not exceed the server's.
 */
function clientMajor(): number | null {
  try {
    const version = execSync('pg_dump --version && pg_restore --version', { encoding: 'utf8' });
    const match = /pg_restore \(PostgreSQL\) (\d+)/.exec(version);
    return match?.[1] === undefined ? null : Number.parseInt(match[1], 10);
  } catch {
    return null;
  }
}

/**
 * The TARGET server's major version, read with a bare `psql`. The password goes
 * through `PGPASSWORD` and never into argv — `splitDatabaseUrl`'s whole reason
 * for existing (case 13.31), and every process on this host can read another's
 * argv. Synchronous on purpose: `describe.skipIf` cannot await a pool query.
 */
function serverMajor(): number | null {
  const { dsn, password } = splitDatabaseUrl(ADMIN_URL);
  const probe = spawnSync('psql', ['--no-psqlrc', '--tuples-only', '--no-align', '--command', 'show server_version_num', dsn], {
    encoding: 'utf8',
    env: { ...process.env, ...(password === undefined ? {} : { PGPASSWORD: password }) },
  });
  if (probe.status !== 0) return null;
  const num = Number.parseInt((probe.stdout ?? '').trim(), 10);
  return Number.isFinite(num) ? Math.floor(num / 10_000) : null;
}

const CLIENT_MAJOR = clientMajor();
const SERVER_MAJOR = serverMajor();

/**
 * The gate is NOT merely "are the binaries installed" — that gate passes on a
 * machine where the drill cannot succeed, and turns a clean skip into a red
 * suite (the 13.36 failure shape, one cause over).
 *
 * MEASURED 2026-09-06 on this workstation: libpq 18.4 is the only client
 * Homebrew carries, and the compose Postgres is `postgres:16-alpine` (server
 * 16.15). `pg_restore` 18 opens every restore with `SET transaction_timeout =
 * 0` — a parameter that did not exist before PG 17 — so a 16 server answers
 * `unrecognized configuration parameter "transaction_timeout"`, pg_restore
 * prints `errors ignored on restore: 1` and exits NON-ZERO even though every
 * table and row landed. That is a real property of the pair, not a flaw in this
 * suite, and `restore.sh` propagating that non-zero exit is correct behaviour.
 *
 * CI runs a MATCHED pair — `.github/workflows/ci.yml` pins `postgres:16-alpine`
 * beside `postgresql-client-16` ("pinned to the server's major version") — so
 * this block executes there. It skips on a skewed workstation, loudly.
 */
const DRILL_RUNNABLE =
  CLIENT_MAJOR !== null && SERVER_MAJOR !== null && CLIENT_MAJOR <= SERVER_MAJOR;

if (!DRILL_RUNNABLE) {
  console.warn(
    `restore-drill: the round-trip block is SKIPPED — pg client major ${CLIENT_MAJOR ?? 'absent'} vs server major ${SERVER_MAJOR ?? 'unreachable'}. ` +
      'A pg_restore newer than the server emits settings the server rejects; install a client matching the server major to run it.',
  );
}

/** Runs `scripts/restore.sh` the way an operator would: through bash, on the same PATH. */
function runRestoreScript(args: string[]): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync('bash', [RESTORE_SH, ...args], { encoding: 'utf8' });
  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

async function withAdmin(sql: string): Promise<void> {
  const admin = new pg.Client({ connectionString: ADMIN_URL });
  await admin.connect();
  try {
    await admin.query(sql);
  } finally {
    await admin.end();
  }
}

function urlForDatabase(name: string): string {
  return ADMIN_URL.replace(/\/[^/]*$/, `/${name}`);
}

async function eventCount(pool: Pool): Promise<number> {
  const result = await pool.query<{ count: string }>('SELECT count(*)::text AS count FROM events');
  const row = result.rows[0];
  if (!row) throw new Error('count(*) returned no row');
  return Number.parseInt(row.count, 10);
}

/**
 * UNGATED, deliberately. `restore.sh`'s guard is the entire point of the script
 * and it needs no database, no dump and no libpq — only bash. Behind the
 * round-trip gate it would go dark on exactly the machines where a mistyped
 * restore target is most likely to be typed by hand. The drill below is the
 * part that needs a matched server.
 */
describe('restore.sh’s guard — the refusal, and the rule the usage text carries', () => {
  let guardDir: string;
  let decoyDump: string;

  beforeAll(() => {
    guardDir = mkdtempSync(join(tmpdir(), 'gisik-restore-guard-'));
    decoyDump = join(guardDir, 'decoy.dump');
    // A file that EXISTS but is not an archive. Its existence is the load-
    // bearing part: the guard runs before the `-f` check, so a refusal here
    // cannot be the missing-file branch wearing the guard's clothes — and its
    // contents never matter, because a refused invocation never reaches
    // pg_restore.
    writeFileSync(decoyDump, 'not-an-archive');
  });

  afterAll(() => {
    rmSync(guardDir, { recursive: true, force: true });
  });

  it('REFUSES a target whose database name is not a scratch database — with a real file in hand', () => {
    const refused = runRestoreScript([decoyDump, urlForDatabase('gisik_nokma_live_no_such_db')]);
    expect(refused.status).toBe(1);
    expect(refused.stderr).toContain('refusing');
    expect(refused.stderr).toContain('gisik_nokma_live_no_such_db');
    expect(refused.stderr).not.toContain('no such dump file'); // the guard, not the file check
    expect(refused.stdout).not.toContain('restored');
  });

  it('a scratch-looking name gets PAST the guard — so the refusal above is about the name and nothing else', () => {
    // Same invocation, same nonexistent database, one word different in the
    // name. It must fail at the NEXT check instead, which is what shows the
    // guard is a name test rather than a blanket refusal that would "pass"
    // this suite while rejecting every restore an operator ever attempts.
    const past = runRestoreScript(['/nonexistent-drill.dump', urlForDatabase('gisik_scratch_no_such_db')]);
    expect(past.stderr).not.toContain('refusing');
    expect(past.stderr).toContain('no such dump file: /nonexistent-drill.dump');
    expect(past.status).toBe(1);
  });

  it('--force-live is the deliberate act that overrides the guard', () => {
    const forced = runRestoreScript(['/nonexistent-drill.dump', urlForDatabase('gisik_nokma_live_no_such_db'), '--force-live']);
    expect(forced.stderr).not.toContain('refusing');
    expect(forced.stderr).toContain('no such dump file');
  });

  /**
   * The version rule (both directions) is printed by `usage`, which only fires
   * on a bad invocation (`$# -lt 2`, exit 2) — NOT on the guard's refusal path,
   * which exits 1 without printing usage. Witnessed here so the sentence is a
   * tested string rather than a comment nobody renders.
   */
  it('usage carries the version rule in BOTH directions', () => {
    const bare = runRestoreScript([]);
    expect(bare.status).toBe(2);
    expect(bare.stderr).toContain('at least as new as the pg_dump');
    expect(bare.stderr).toContain('NO NEWER than the target server');
  });
});

describe.skipIf(!DRILL_RUNNABLE)('the restore drill — disaster recovery through the freshness gate', () => {
  let source: TestDatabase;
  let scratchUrl: string;
  let scratchPool: Pool;
  let workDir: string;
  let dumpFile: string;
  /**
   * How many rows the seed ACTUALLY committed, measured against the source
   * database rather than assumed from the three submissions: ingest derives a
   * companion set per workspace (a workflow, four ticket types, an owner
   * membership), so three `workspace.created` submissions are not three events
   * — case 13.13 measured the same surprise for the ledger export. Captured
   * here so the restored count is compared against a real number, and asserted
   * `> 0` so an empty source restored into an empty target cannot satisfy the
   * equality.
   */
  let sourceEvents = 0;
  const scratchName = `gisik_drill_${Date.now()}`;
  // A SECOND scratch database, for the one test that runs `restore.sh` itself.
  // Separate on purpose: the planted-drift case below corrupts `scratchName`
  // permanently, and two tests fighting over one database is a false failure
  // waiting for a reordering.
  const scriptScratchName = `gisik_drill_script_${Date.now()}`;

  beforeAll(async () => {
    source = await createTestDatabase();
    const ingest = createIngestService({
      pool: source.pool,
      evaluate: evaluateEvent,
      projections: buildProjectionRegistry(),
    });
    const results = await ingest.ingestBatch([
      submittedWorkspaceCreated(),
      submittedWorkspaceCreated(),
      submittedWorkspaceCreated(),
    ]);
    if (results.some((result) => result.status !== 'committed')) throw new Error('drill setup failed to seed');
    sourceEvents = await eventCount(source.pool);

    workDir = mkdtempSync(join(tmpdir(), 'gisik-drill-'));
    dumpFile = join(workDir, 'drill.dump');
    const dump = spawnSync('pg_dump', ['--format=custom', '--no-owner', '--file', dumpFile, source.url]);
    if (dump.status !== 0) throw new Error(`pg_dump failed: ${dump.stderr.toString()}`);

    await withAdmin(`CREATE DATABASE ${scratchName}`); // bare — the dump carries the schema
    scratchUrl = urlForDatabase(scratchName);

    const restore = spawnSync('pg_restore', ['--no-owner', '--no-privileges', '--dbname', scratchUrl, dumpFile]);
    if (restore.status !== 0) throw new Error(`pg_restore failed: ${restore.stderr.toString()}`);
    // `createPool`, not a bare `new Pool`: db.ts installs the int8 parser
    // globally and states that every pool in app and tests must come through it.
    scratchPool = createPool(scratchUrl);
  }, 60_000);

  afterAll(async () => {
    await scratchPool?.end();
    await withAdmin(`DROP DATABASE IF EXISTS ${scratchName} WITH (FORCE)`);
    await withAdmin(`DROP DATABASE IF EXISTS ${scriptScratchName} WITH (FORCE)`);
    await source?.drop();
    rmSync(workDir, { recursive: true, force: true });
  }, 60_000);

  /**
   * FIRST, and not decoration. `verifyProjections` on an EMPTY database is
   * clean — the ledger derives nothing and live holds nothing, so every EXCEPT
   * diff is empty in both directions. A restore that silently produced an empty
   * database would therefore pass the case below it while proving nothing about
   * the round trip. This is the case that fails in that world: it counts real
   * rows in the RESTORED database and matches them against the count measured
   * in the source, with a `> 0` floor so empty-equals-empty cannot pass either.
   */
  it('the restored database holds the rows the source held — the assertion an empty restore fails', async () => {
    expect(sourceEvents).toBeGreaterThan(0);
    await expect(eventCount(scratchPool)).resolves.toBe(sourceEvents);
  });

  it('the restored database passes verify-projections clean — the gate applied to disaster recovery', async () => {
    const report = await verifyProjections({ pool: scratchPool, projections: buildProjectionRegistry() });
    expect(report.diffs).toEqual([]);
    expect(report.clean).toBe(true);
  });

  /**
   * This one is data-dependent too, which is not obvious and was measured:
   * `events_no_update_no_delete` is `FOR EACH ROW`, so an UPDATE over an EMPTY
   * events table never fires it and resolves happily. In the schema-only probe
   * that produced the case above, this case failed as well — "promise resolved
   * Result{ command: 'UPDATE' } instead of rejecting". So it is a second,
   * independent witness that rows crossed the round trip, not only that the
   * trigger definition did.
   */
  it('the restored ledger kept its append-only teeth', async () => {
    await expect(scratchPool.query("UPDATE events SET type = 'tampered'")).rejects.toThrowError(/append-only/);
  });

  /**
   * The drill above never runs the script — it calls `pg_restore` directly, the
   * way the plan text wrote it. So this is the case that runs `restore.sh` on
   * its happy path against a real archive and a real scratch database, and then
   * asks the database itself what arrived. A runbook script whose success path
   * nothing executes is a script nobody has run until an incident.
   */
  it('restore.sh RESTORES into a scratch-named target, and the data is really there afterwards', async () => {
    await withAdmin(`CREATE DATABASE ${scriptScratchName}`);
    const scriptScratchUrl = urlForDatabase(scriptScratchName);
    const restored = runRestoreScript([dumpFile, scriptScratchUrl]);
    expect(restored.stderr).not.toContain('refusing');
    expect(restored.status).toBe(0);
    expect(restored.stdout).toContain(`restored '${dumpFile}' into '${scriptScratchName}'`);
    expect(restored.stdout).toContain('verify:projections'); // it points at the gate, not at itself

    const pool = createPool(scriptScratchUrl);
    try {
      expect(sourceEvents).toBeGreaterThan(0);
      await expect(eventCount(pool)).resolves.toBe(sourceEvents);
    } finally {
      await pool.end();
    }
  }, 60_000);

  /**
   * LAST, because it corrupts `scratchName` irreversibly: an unbounded UPDATE
   * on `proj_entity_heads`. Anything asserting clean after this would fail.
   */
  it('planted defect: drift in a restored projection is caught, table named', async () => {
    await scratchPool.query("UPDATE proj_entity_heads SET head_event_type = 'tampered'");
    const report = await verifyProjections({ pool: scratchPool, projections: buildProjectionRegistry() });
    expect(report.clean).toBe(false);
    expect(report.diffs.map((diff) => diff.table)).toContain('proj_entity_heads');
  });
});
