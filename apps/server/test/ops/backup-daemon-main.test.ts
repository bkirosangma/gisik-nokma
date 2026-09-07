import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';

/**
 * Spawned rather than imported: this module calls `main()` at import time with no
 * `executedDirectly` guard, so importing it would start a live daemon inside the worker.
 *
 * The claim is that the two errand sweeps are registered on the SAME `startScheduler`
 * call as pg-dump and ledger-export. That is provable through `startScheduler`'s own
 * contract: it computes every job's `delayMs()` SYNCHRONOUSLY before arming any timer,
 * so one job's refusal prevents the whole scheduler — including the two correctly
 * configured backup jobs — from ever being armed or logged. If the sweeps were built on
 * a second scheduler, a bad sweep interval could not stop the first one from announcing
 * itself.
 */
const SERVER_DIR = join(dirname(fileURLToPath(import.meta.url)), '../..');
const SCHEDULED = 'backup daemon scheduled';

type Run = { stdout: string; stderr: string; code: number | null };

const runDaemon = (extra: Record<string, string>): Promise<Run> =>
  new Promise((resolve) => {
    const child = spawn('pnpm', ['exec', 'tsx', 'src/ops/backup-daemon-main.ts'], {
      cwd: SERVER_DIR,
      env: {
        ...process.env,
        OBJECT_STORE: 'local',
        OBJECT_STORE_DIR: mkdtempSync(join(tmpdir(), 'gn-daemon-')),
        BACKUP_S3_BUCKET: 'test-bucket',
        OBJECT_STORE_S3_REGION: 'us-east-1',
        OBJECT_STORE_S3_BUCKET: 'test-bucket',
        OBJECT_STORE_S3_ACCESS_KEY_ID: 'test-key',
        OBJECT_STORE_S3_SECRET_ACCESS_KEY: 'test-secret',
        OBJECT_STORE_S3_ENDPOINT: 'http://127.0.0.1:1',
        AWS_REGION: 'us-east-1',
        AWS_ACCESS_KEY_ID: 'test-key',
        AWS_SECRET_ACCESS_KEY: 'test-secret',
        ...extra,
      },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d: Buffer) => (stdout += d.toString()));
    child.stderr.on('data', (d: Buffer) => (stderr += d.toString()));
    // It is a daemon on the success path: once it has announced itself there is
    // nothing more to wait for, so stop it rather than sit out a timeout.
    const stopWhenScheduled = setInterval(() => {
      if (stdout.includes(SCHEDULED)) child.kill('SIGTERM');
    }, 100);
    const hardStop = setTimeout(() => child.kill('SIGKILL'), 30_000);
    child.on('close', (code) => {
      clearInterval(stopWhenScheduled);
      clearTimeout(hardStop);
      resolve({ stdout, stderr, code });
    });
  });

describe('backup-daemon-main — one scheduler for all four jobs', () => {
  let db: TestDatabase;
  beforeAll(async () => {
    db = await createTestDatabase();
  }, 60_000);
  afterAll(async () => {
    await db.drop();
  });

  /**
   * 13.203 — the positive control, and it is what makes the case below mean anything: with
   * a valid interval the daemon really does arm and announce itself in this environment.
   * Without it, a daemon that failed for an unrelated reason — a missing bucket variable,
   * an unreachable database — would satisfy the "never announced" assertion perfectly.
   */
  it('arms and announces itself when every job’s schedule is valid', async () => {
    const run = await runDaemon({
      DATABASE_URL: db.url,
      NOTIFICATION_SWEEP_INTERVAL_MS: '3600000',
    });
    expect(run.stdout).toContain(SCHEDULED);
  }, 60_000);

  /**
   * 13.203 — `sweep-notifications` and `sweep-orphans` are registered on the SAME
   * `startScheduler` call as pg-dump and ledger-export. A refused sweep interval takes the
   * WHOLE scheduler down — nothing is armed and the announcement never prints — which
   * could not happen if the errand sweeps sat on a scheduler of their own.
   */
  it('lets one job’s refused interval abort the whole scheduler, naming the variable', async () => {
    const run = await runDaemon({
      DATABASE_URL: db.url,
      NOTIFICATION_SWEEP_INTERVAL_MS: '0',
    });
    expect(run.stdout).not.toContain(SCHEDULED);
    expect(run.stderr).toContain('NOTIFICATION_SWEEP_INTERVAL_MS');
  }, 60_000);
});
