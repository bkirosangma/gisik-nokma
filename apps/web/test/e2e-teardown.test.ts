import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { teardownArgv } from '../e2e-stack/helpers/teardown';

/**
 * Case 6.338, the wiring half. The SQL itself is executed against Postgres in `apps/server/test/ops/e2e-teardown.test.ts`;
 * these pin the three places a teardown can silently stop happening: the setup that records the run's start, the config that
 * registers the teardown, and the `docker compose exec` channel to the dev stack's `postgres` service.
 */
const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

describe('e2e-stack teardown wiring', () => {
  it('6.338 setup records the run start the teardown reads, and the config registers the teardown beside setup; control: setup is still registered', () => {
    expect(read('../playwright.stack.config.ts')).toContain("globalSetup: './e2e-stack/global-setup.ts'");
    expect(read('../playwright.stack.config.ts')).toContain("globalTeardown: './e2e-stack/global-teardown.ts'");
    expect(read('../e2e-stack/global-setup.ts')).toContain("process.env['GISIK_E2E_RUN_STARTED_AT'] = new Date().toISOString()");
    expect(read('../e2e-stack/global-teardown.ts')).toContain("process.env['GISIK_E2E_RUN_STARTED_AT']");
  });

  it('6.338 the teardown talks to the dev stack\'s postgres over `compose exec -T`, the channel setup seeds through; control: setup uses the same compose file and -T', () => {
    const argv = teardownArgv('docker-compose.dev.yml');
    expect(argv.slice(0, 6)).toEqual(['compose', '-f', 'docker-compose.dev.yml', 'exec', '-T', 'postgres']);
    expect(argv.join(' ')).toContain('-v ON_ERROR_STOP=1');
    const setup = read('../e2e-stack/global-setup.ts');
    expect(setup).toContain("'compose', '-f', COMPOSE_FILE, 'exec', '-T',");
    expect(read('../e2e-stack/global-teardown.ts')).toContain("const COMPOSE_FILE = 'docker-compose.dev.yml'");
  });
});
