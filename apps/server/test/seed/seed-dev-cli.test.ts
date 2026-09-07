import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid } from '@gisik-nokma/domain';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';

/**
 * `seed-dev.test.ts` covers `buildDevSeedEvents` and `seedDevWorkspace`. Nothing covered
 * the CLI that wires them together and reads the environment, which is the half an
 * operator actually types — the same gap 13.193 had for `verify:projections`, and the
 * same reason it matters: the entry point's contract is about argv and env, so importing
 * `main` under the suite's own environment would not test it.
 *
 * The plans directory is a TEMP fixture, which is also the point. `docs/` is in
 * `.dockerignore`, so the default `docs/superpowers/plans` is a repo-checkout path and
 * this seed cannot run inside the production image at all — the runbook now says so. A
 * test that leaned on the repo's own `docs/` would pass while proving nothing about
 * `--plans-dir`, which is the flag that makes the tool usable anywhere else.
 */
const SERVER_DIR = join(dirname(fileURLToPath(import.meta.url)), '../..');

const plansDirWithOnePlan = (): string => {
  const dir = mkdtempSync(join(tmpdir(), 'gn-plans-'));
  // Three things readPlanSeries requires, each of which this fixture got wrong first:
  // the `NNNN-NN-NN-NN-*.md` shape; a plan number that is NOT `00`, which is skipped on
  // purpose because 00 is the coordination document and not a plan; and inside the file
  // an H1, a `**Goal:**` line and at least one `### Task N:` heading (three hashes).
  writeFileSync(
    join(dir, '2026-08-20-01-a-plan.md'),
    [
      '# A plan document',
      '',
      '**Goal:** prove the CLI reads this directory.',
      '',
      '### Task 1: do the thing',
      '',
    ].join('\n'),
  );
  return dir;
};

const runCli = (args: string[], env: Record<string, string | undefined>) => {
  const merged: NodeJS.ProcessEnv = { ...process.env, ...env };
  for (const [k, v] of Object.entries(env)) if (v === undefined) delete merged[k];
  return spawnSync('pnpm', ['exec', 'tsx', 'src/seed/cli-seed-dev-workspace.ts', ...args], {
    cwd: SERVER_DIR,
    encoding: 'utf8',
    env: merged,
  });
};

describe('seed:dev CLI', () => {
  let db: TestDatabase;
  const OWNER_EMAIL = 'seed-owner@example.com';
  beforeAll(async () => {
    db = await createTestDatabase();
    // The seed attributes every event to a real signed-in person; better-auth's `user`
    // table is server-owned identity, so a row here is what "has signed in once" means.
    await db.pool.query(
      'INSERT INTO "user" ("id", "name", "email", "emailVerified") VALUES ($1, $2, $3, true)',
      [newUlid(), 'Seed Owner', OWNER_EMAIL],
    );
  }, 60_000);
  afterAll(async () => {
    await db.drop();
  });

  /**
   * 13.181 — the CLI refuses without `DATABASE_URL`, in the same vocabulary the other
   * entry points use, rather than handing an empty connection string to libpq and
   * silently seeding whatever local database `$USER` happens to reach.
   */
  it('exits 2 naming DATABASE_URL when it is unset', () => {
    const result = runCli(['--owner-email', 'nobody@example.com'], { DATABASE_URL: undefined });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('DATABASE_URL is required');
  });

  /**
   * 13.181 — and refuses without an owner, printing the usage that names `--plans-dir`.
   * The seed attributes every event to a real person; there is no default owner to fall
   * back on, which is the same refusal `seedDevWorkspace` makes for an unknown email.
   */
  it('exits 2 with usage when no owner email is given', () => {
    const result = runCli([], { DATABASE_URL: db.url, SEED_OWNER_EMAIL: undefined });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('--owner-email');
    expect(result.stderr).toContain('--plans-dir');
  });

  /**
   * 13.181 — the CLI honours `--plans-dir` and seeds through it end to end: pointed at a
   * temp directory holding one plan document, with an owner who exists, it commits and
   * reports what it did.
   *
   * The first draft of this case used an owner who had NEVER signed in and claimed the
   * resulting refusal proved the directory had been read. It did not: `seedDevWorkspace`
   * resolves the owner BEFORE `readPlanSeries`, so that refusal fires whatever
   * `--plans-dir` points at, and the case would have passed against a CLI that ignored
   * the flag entirely. The control below is what exposed that.
   */
  it('seeds from --plans-dir end to end, reporting what it committed', () => {
    const result = runCli(['--owner-email', OWNER_EMAIL, '--plans-dir', plansDirWithOnePlan()], {
      DATABASE_URL: db.url,
    });
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Gisik Nokma dev seed:');
    expect(result.stdout).toMatch(/[1-9]\d* task tickets/);
  });

  /**
   * 13.181 — the control that makes the case above mean something: the SAME owner and the
   * same command against a directory holding no plan documents fails, naming the
   * directory. A CLI that ignored `--plans-dir` and read the repo's own `docs/` would
   * seed happily here and this would go green.
   */
  it('names the directory when --plans-dir holds no plan documents', () => {
    const empty = mkdtempSync(join(tmpdir(), 'gn-plans-empty-'));
    const result = runCli(['--owner-email', OWNER_EMAIL, '--plans-dir', empty], {
      DATABASE_URL: db.url,
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('holds no plan documents');
  });

  /**
   * 13.181 — and the seed never invents people: an owner who has never signed in is
   * refused by email rather than created.
   */
  it('refuses an owner who has never signed in', () => {
    const result = runCli(
      ['--owner-email', 'never-signed-in@example.com', '--plans-dir', plansDirWithOnePlan()],
      { DATABASE_URL: db.url },
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/never-signed-in@example\.com/);
  });
});
