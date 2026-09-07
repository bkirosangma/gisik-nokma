import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';

/**
 * This spawns the tool as a PROCESS rather than importing `main`, because the property
 * is about what the CLI entry point reads from the environment. Importing it would run
 * under the suite's own env, where the auth variables are already present — the exact
 * condition that hid the original defect, since the tool worked everywhere except the
 * one place the runbook told an operator to use it.
 */
const SERVER_DIR = join(dirname(fileURLToPath(import.meta.url)), '../..');

/** The runbook's drill has DATABASE_URL and nothing else this tool might lean on. */
const withoutAuthVars = (extra: Record<string, string>): NodeJS.ProcessEnv => {
  const env: NodeJS.ProcessEnv = { ...process.env, ...extra };
  for (const key of Object.keys(env)) {
    if (key.startsWith('BETTER_AUTH') || key === 'WEB_ORIGIN') delete env[key];
  }
  return env;
};

const runTool = (env: NodeJS.ProcessEnv) =>
  spawnSync('pnpm', ['exec', 'tsx', 'src/tools/verify-projections.ts'], {
    cwd: SERVER_DIR,
    encoding: 'utf8',
    env,
  });

describe('verify:projections CLI — the environment it actually needs', () => {
  let db: TestDatabase;
  beforeAll(async () => {
    db = await createTestDatabase();
  }, 60_000);
  afterAll(async () => {
    await db.drop();
  });

  /**
   * 13.193 — the tool runs from `DATABASE_URL` alone, which is how the runbook's restore
   * drill invokes it. It used to open with `loadConfig(process.env)` and so demanded
   * `BETTER_AUTH_URL`, a 32-character `BETTER_AUTH_SECRET` and `WEB_ORIGIN`, none of which
   * it reads — so the drill's own step 4 answered `ConfigError` and could not be run. The
   * auth variables are stripped from the child's environment here, not merely left unset,
   * because the parent process has them.
   */
  it('reaches the database with DATABASE_URL alone, naming no auth variable', () => {
    const result = runTool(withoutAuthVars({ DATABASE_URL: db.url }));

    // 0 (clean) or 1 (drift) are both real verdicts; 2 is the config refusal.
    expect([0, 1]).toContain(result.status);
    expect(result.stdout).toContain('verify-projections:');
    expect(result.stderr).not.toContain('BETTER_AUTH');
    expect(result.stderr).not.toContain('ConfigError');
  });

  /**
   * 13.193 — the other half, measured the other way. Without it, a tool that ignored its
   * environment entirely would satisfy the case above, so this pins that the refusal is
   * about `DATABASE_URL` specifically and names it rather than three secrets it never reads.
   */
  it('exits 2 naming DATABASE_URL when it is unset, not the auth variables it never reads', () => {
    const env = withoutAuthVars({});
    delete env['DATABASE_URL'];
    const result = runTool(env);

    expect(result.status).toBe(2);
    expect(result.stderr).toContain('DATABASE_URL is required');
    expect(result.stderr).not.toContain('BETTER_AUTH');
  });
});
