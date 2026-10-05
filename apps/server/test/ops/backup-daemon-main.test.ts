import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { builtinTicketTypeDefs, DECISION_TYPE_ID, newUlid } from '@gisik-nokma/domain';
import { applyCommitted, makeCommitted } from '../helpers/apply.js';
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

/**
 * `until` decides when the daemon has shown what the case needs and may be stopped. The default is the original "it has
 * announced itself" (which is why nothing below the scheduled line ever runs); a case that needs a JOB to fire passes its
 * own predicate and waits on the job's output - bounded by `hardStop`, never by a fixed sleep.
 */
const runDaemon = (
  extra: Record<string, string>,
  until: (stdout: string, stderr: string) => boolean = (out) => out.includes(SCHEDULED),
): Promise<Run> =>
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
      if (until(stdout, stderr)) child.kill('SIGTERM');
    }, 100);
    const hardStop = setTimeout(() => child.kill('SIGKILL'), 30_000);
    child.on('close', (code) => {
      clearInterval(stopWhenScheduled);
      clearTimeout(hardStop);
      resolve({ stdout, stderr, code });
    });
  });

describe('backup-daemon-main — one scheduler for all eight jobs', () => {
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

  it('19.149 refuses PURGE_SWEEP_INTERVAL_MS=0 before arming any job, naming the variable', async () => {
    const refused = await runDaemon({
      DATABASE_URL: db.url,
      NOTIFICATION_SWEEP_INTERVAL_MS: '3600000',
      PURGE_SWEEP_INTERVAL_MS: '0',
    });
    expect(refused.stdout).not.toContain(SCHEDULED);
    expect(refused.stderr).toContain('PURGE_SWEEP_INTERVAL_MS');
    // CONTROL — the same command with a valid interval arms and announces itself.
    const armed = await runDaemon({
      DATABASE_URL: db.url,
      NOTIFICATION_SWEEP_INTERVAL_MS: '3600000',
      PURGE_SWEEP_INTERVAL_MS: '3600000',
    });
    expect(armed.stdout).toContain(SCHEDULED);
  }, 90_000);

  it('6.322 refuses SESSION_SWEEP_INTERVAL_MS=0 before arming any job, naming the variable; control: the default (empty) and a valid value arm', async () => {
    const refused = await runDaemon({
      DATABASE_URL: db.url,
      NOTIFICATION_SWEEP_INTERVAL_MS: '3600000',
      SESSION_SWEEP_INTERVAL_MS: '0',
    });
    expect(refused.stdout).not.toContain(SCHEDULED);
    expect(refused.stderr).toContain('SESSION_SWEEP_INTERVAL_MS');
    // CONTROL — empty means the default, a valid value is accepted, and the purge job is still scheduled beside it.
    const armed = await runDaemon({
      DATABASE_URL: db.url,
      NOTIFICATION_SWEEP_INTERVAL_MS: '3600000',
      SESSION_SWEEP_INTERVAL_MS: '',
    });
    expect(armed.stdout).toContain(SCHEDULED);
    const purgeStillChecked = await runDaemon({
      DATABASE_URL: db.url,
      NOTIFICATION_SWEEP_INTERVAL_MS: '3600000',
      SESSION_SWEEP_INTERVAL_MS: '86400000',
      PURGE_SWEEP_INTERVAL_MS: '0',
    });
    expect(purgeStillChecked.stderr).toContain('PURGE_SWEEP_INTERVAL_MS');
  }, 120_000);

  it('19.159 refuses BACKUP_RETENTION_DAYS=abc before arming any job, naming the variable', async () => {
    const refused = await runDaemon({
      DATABASE_URL: db.url,
      NOTIFICATION_SWEEP_INTERVAL_MS: '3600000',
      BACKUP_RETENTION_DAYS: 'abc',
    });
    expect(refused.stdout).not.toContain(SCHEDULED);
    expect(refused.stderr).toContain('BACKUP_RETENTION_DAYS');
    // CONTROL
    const armed = await runDaemon({
      DATABASE_URL: db.url,
      NOTIFICATION_SWEEP_INTERVAL_MS: '3600000',
      BACKUP_RETENTION_DAYS: '30',
    });
    expect(armed.stdout).toContain(SCHEDULED);
  }, 90_000);

  /**
   * 13.203 — `sweep-notifications` and `sweep-orphans` are registered on the SAME
   * `startScheduler` call as pg-dump and ledger-export. A refused sweep interval takes the
   * WHOLE scheduler down — nothing is armed and the announcement never prints — which
   * could not happen if the errand sweeps sat on a scheduler of their own.
   */
  it('13.1422 announces the pool’s TLS mode: "ca" when DATABASE_CA_CERT is bound, "none" when it is not', async () => {
    // The production defect (2026-09-23): every job that used the pool failed
    // with "self-signed certificate in certificate chain" because the worker
    // built its pool without the CA the deploy spec binds to it. The announce
    // line is the observable: it is printed before the scheduler arms, from
    // the same value that reaches `createPool`.
    const withCa = await runDaemon({
      DATABASE_URL: db.url,
      NOTIFICATION_SWEEP_INTERVAL_MS: '3600000',
      DATABASE_CA_CERT: '-----BEGIN CERTIFICATE-----\nMIIBfake\n-----END CERTIFICATE-----\n',
    });
    expect(withCa.stdout).toContain('"msg":"database pool","tls":"ca"');
    expect(withCa.stdout).toContain(SCHEDULED);
    // CONTROL, same case: unbound → "none", and the scheduler still arms.
    const withoutCa = await runDaemon({
      DATABASE_URL: db.url,
      NOTIFICATION_SWEEP_INTERVAL_MS: '3600000',
      DATABASE_CA_CERT: '',
    });
    expect(withoutCa.stdout).toContain('"msg":"database pool","tls":"none"');
    expect(withoutCa.stdout).toContain(SCHEDULED);
  }, 90_000);

  it('13.1423 a DATABASE_CA_CERT that is not a PEM aborts the scheduler, naming the variable', async () => {
    const run = await runDaemon({
      DATABASE_URL: db.url,
      NOTIFICATION_SWEEP_INTERVAL_MS: '3600000',
      DATABASE_CA_CERT: 'not a certificate',
    });
    expect(run.stdout).not.toContain(SCHEDULED);
    expect(run.stderr).toContain('DATABASE_CA_CERT');
  }, 60_000);

  it('lets one job’s refused interval abort the whole scheduler, naming the variable', async () => {
    const run = await runDaemon({
      DATABASE_URL: db.url,
      NOTIFICATION_SWEEP_INTERVAL_MS: '0',
    });
    expect(run.stdout).not.toContain(SCHEDULED);
    expect(run.stderr).toContain('NOTIFICATION_SWEEP_INTERVAL_MS');
  }, 60_000);

  /**
   * 13.731 — the auto-close job's own interval is validated the same way, and it
   * is on the SAME scheduler as the others.
   *
   * The positive control is the case above (13.203): the same command with only
   * the notification variable set announces itself, and `AUTO_CLOSE_SWEEP_INTERVAL_MS`
   * is unset there — so it takes its `'3600000'` default and the daemon really
   * does arm every job in this environment. Without that control, this case
   * would pass against a daemon that died for an unrelated reason.
   *
   * **Where this case lives, and why it is not in `test/auto-close/sweep.test.ts`.**
   * The plan named that file as this task's test file, but the mechanism being
   * asserted is the DAEMON's env handling and the spawn harness that proves it
   * was built here by 13.203. Re-deriving a 40-line child-process harness in the
   * sweep file would be a second copy of a fixture with its own failure modes,
   * and the property is about the fifth job being wired on the one scheduler —
   * which is what this file's whole shape is about.
   */
  it('refuses a zero AUTO_CLOSE_SWEEP_INTERVAL_MS and names it, aborting the whole scheduler', async () => {
    const run = await runDaemon({
      DATABASE_URL: db.url,
      AUTO_CLOSE_SWEEP_INTERVAL_MS: '0',
    });
    expect(run.stdout).not.toContain(SCHEDULED);
    expect(run.stderr).toContain('AUTO_CLOSE_SWEEP_INTERVAL_MS');
  }, 60_000);
  /**
   * 6.349 / 6.350 - the `expired-sessions` job the daemon SCHEDULES, run for real. `expired-sessions.test.ts` pins the pieces
   * (`runExpiredSessionSweep`, `sessionSweepIntervalMs`); these pin that `main()` wires them: the job fires, deletes, logs the
   * line an operator greps for after a deploy, and is reported under its own name when it fails. The first timer is armed at
   * `delayMs()` from start, so `SESSION_SWEEP_INTERVAL_MS=300` makes the first sweep land ~300 ms in, with every other job
   * hours away; the wait is on the job's own output, bounded by the harness's 30 s hard stop.
   */
  const sweepLine = (stdout: string): { msg: string; deleted: number } | undefined =>
    stdout
      .split('\n')
      .flatMap((l) => {
        try {
          return [JSON.parse(l) as { msg?: string; deleted?: number }];
        } catch {
          return [];
        }
      })
      .find((e): e is { msg: string; deleted: number } => e.msg === 'expired-session sweep complete' && typeof e.deleted === 'number');

  it('6.349 the daemon runs the expired-sessions job on SESSION_SWEEP_INTERVAL_MS: it deletes an expired session, logs "expired-session sweep complete" with the count, and leaves a live session; control: the live row is still there', async () => {
    await db.pool.query(
      `INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt") VALUES ('sweep-u','U','sweep-u@x.test',true,now(),now())`,
    );
    const ins = (id: string, expires: string) =>
      db.pool.query(
        `INSERT INTO session (id, "expiresAt", token, "createdAt", "updatedAt", "userId") VALUES ($1, ${expires}, $1, now(), now(), 'sweep-u')`,
        [id],
      );
    await ins('sweep-expired', `now() - interval '1 day'`);
    await ins('sweep-live', `now() + interval '1 day'`);
    const run = await runDaemon(
      { DATABASE_URL: db.url, NOTIFICATION_SWEEP_INTERVAL_MS: '3600000', SESSION_SWEEP_INTERVAL_MS: '300' },
      (out) => sweepLine(out) !== undefined,
    );
    const line = sweepLine(run.stdout);
    expect(line, `no sweep line; stdout: ${run.stdout}\nstderr: ${run.stderr}`).toBeDefined();
    expect(line!.deleted).toBeGreaterThanOrEqual(1);
    const left = (await db.pool.query(`SELECT id FROM session WHERE "userId" = 'sweep-u' ORDER BY id`)).rows.map((r) => r.id);
    expect(left).toEqual(['sweep-live']);
  }, 60_000);

  it('6.350 a failing expired-session sweep is reported under its own job name "expired-sessions" and the daemon keeps running; control: the same daemon against an intact database reports no failure', async () => {
    const broken = await createTestDatabase();
    try {
      await broken.pool.query(`ALTER TABLE session RENAME TO session_renamed`);
      const failed = await runDaemon(
        { DATABASE_URL: broken.url, NOTIFICATION_SWEEP_INTERVAL_MS: '3600000', SESSION_SWEEP_INTERVAL_MS: '300' },
        (_out, err) => err.includes('"job":"expired-sessions"'),
      );
      expect(failed.stderr).toContain('"msg":"backup job failed","job":"expired-sessions"');
      expect(failed.stdout).toContain(SCHEDULED);
      expect(sweepLine(failed.stdout)).toBeUndefined();
    } finally {
      await broken.drop();
    }
    // CONTROL - the intact database sweeps cleanly and writes no failure line.
    const ok = await runDaemon(
      { DATABASE_URL: db.url, NOTIFICATION_SWEEP_INTERVAL_MS: '3600000', SESSION_SWEEP_INTERVAL_MS: '300' },
      (out) => sweepLine(out) !== undefined,
    );
    expect(sweepLine(ok.stdout)).toBeDefined();
    expect(ok.stderr).not.toContain('"job":"expired-sessions"');
  }, 90_000);

  it('29.143 the daemon runs the decision-backfill job at boot: a legacy workspace gains its Decision type, and the run is logged; control: the same workspace holds no decision type before', async () => {
    const ws = newUlid();
    const wf = `wf-legacy-${ws}`;
    const legacy = builtinTicketTypeDefs(wf).filter((d) => d.id !== DECISION_TYPE_ID);
    await applyCommitted(db.pool, legacy.map((def) => makeCommitted({ workspaceId: ws, actorId: '01J9GUKR000000000000000000', entity: { kind: 'ticket-type', id: newUlid() }, type: 'ticket-type.defined', payload: def })));
    const before = await db.pool.query(`SELECT 1 FROM proj_ticket_types WHERE workspace_id = $1 AND type_id = $2`, [ws, DECISION_TYPE_ID]);
    expect(before.rowCount).toBe(0);
    const run = await runDaemon(
      { DATABASE_URL: db.url, NOTIFICATION_SWEEP_INTERVAL_MS: '3600000', DECISION_BACKFILL_INTERVAL_MS: '300' },
      (out) => out.includes('"msg":"decision backfill complete"'),
    );
    expect(run.stdout, `stderr: ${run.stderr}`).toContain('"msg":"decision backfill complete"');
    const after = await db.pool.query<{ workflow_id: string }>(`SELECT workflow_id FROM proj_ticket_types WHERE workspace_id = $1 AND type_id = $2`, [ws, DECISION_TYPE_ID]);
    expect(after.rows).toEqual([{ workflow_id: wf }]);
  }, 60_000);

  /**
   * 29.143 - the job's delay is ONE `firstThenEvery` closure, built once in `main()`. The run above cannot tell: with an
   * interval of 300 ms, `min(30 s, 300)` equals the interval, so a `delayMs: () => firstThenEvery(...)()` that mints a fresh
   * `first` flag on every call (and so re-runs the job every 30 s forever in production, where the interval is a day)
   * reads the same, and a 30 s boot is beyond the harness's hard stop. The closure's own behaviour is pinned in
   * `test/flow/decision-backfill.test.ts`; this pins that `main()` hands the scheduler the closure itself.
   */
  it('29.143 the decision-backfill job is armed with one firstThenEvery closure, not a factory called per delay; control: the interval is read once from the env reader', () => {
    const source = readFileSync(join(SERVER_DIR, 'src/ops/backup-daemon-main.ts'), 'utf8');
    expect(source).toContain('const decisionBackfillEveryMs = decisionBackfillIntervalMs(process.env);');
    expect(source.match(/delayMs:\s*firstThenEvery\(\s*decisionBackfillEveryMs,\s*DECISION_BACKFILL_BOOT_DELAY_MS\s*\),/g)).toHaveLength(1);
    expect(source.match(/firstThenEvery\(/g)).toHaveLength(1);
  });
});
