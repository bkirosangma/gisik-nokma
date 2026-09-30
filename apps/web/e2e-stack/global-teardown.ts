import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { teardownArgv, teardownSql } from './helpers/teardown.js';

/**
 * Removes the sessions and passkeys THIS run created for the e2e accounts (devices plan Task 8, case 6.338). The SQL, the
 * `createdAt` bound and why it matters live in `helpers/teardown.ts`; `global-setup.ts` records the run's start.
 */
const COMPOSE_FILE = 'docker-compose.dev.yml';
const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

export default async function globalTeardown(): Promise<void> {
  const started = process.env['GISIK_E2E_RUN_STARTED_AT'];
  if (started === undefined) return; // setup did not run - nothing of ours to remove
  execFileSync('docker', teardownArgv(COMPOSE_FILE), {
    cwd: REPO_ROOT,
    input: teardownSql(started),
    stdio: ['pipe', 'inherit', 'inherit'],
  });
}
