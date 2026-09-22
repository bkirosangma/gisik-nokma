import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(process.cwd(), '..', '..');
const DOCKERFILE = readFileSync(resolve(ROOT, 'apps/server/Dockerfile'), 'utf8');
const ENTRYPOINT = readFileSync(resolve(ROOT, 'apps/server/docker-entrypoint.sh'), 'utf8');

/**
 * 13.1283 — GO-LIVE DAY, 2026-09-22: the server's first production boot died in
 * the entrypoint's migration step with `SELF_SIGNED_CERT_IN_CHAIN`. The managed
 * database's `DATABASE_URL` carries `sslmode=require`, which `pg` 8 treats as
 * verify-full, and the managed CA is not in the image's trust store; the app's
 * own pool handles this through `DATABASE_CA_CERT` (`db.ts`), the migrator never
 * did. The entrypoint now writes the bound CA to a file and hands `node-pg-migrate`
 * a connection string that names it (`sslrootcert`, which `pg-connection-string`
 * reads from disk), through its own env var so the app's `DATABASE_URL` is
 * untouched. Without a CA (the dev stack) the migrator gets `DATABASE_URL` as is.
 */
describe('13.1283 the image entrypoint migrates over a verified TLS connection when a CA is bound', () => {
  it('the Dockerfile runs the script as its ENTRYPOINT and copies it into the image', () => {
    expect(DOCKERFILE).toMatch(/^COPY .*apps\/server\/docker-entrypoint\.sh .*docker-entrypoint\.sh/m);
    expect(DOCKERFILE).toMatch(/^ENTRYPOINT \["sh", "\/app\/docker-entrypoint\.sh"\]/m);
    expect(DOCKERFILE).toMatch(/^CMD \["node", "dist\/index\.js"\]/m);
  });
  it('with DATABASE_CA_CERT the script writes the PEM and migrates with sslmode=verify-full and sslrootcert; without it the URL passes through', () => {
    expect(ENTRYPOINT).toContain('set -e');
    expect(ENTRYPOINT).toMatch(/if \[ -n "\$\{DATABASE_CA_CERT:-\}" \]/);
    expect(ENTRYPOINT).toMatch(/printf '%s' "\$DATABASE_CA_CERT" > \/tmp\/db-ca\.pem/);
    expect(ENTRYPOINT).toContain('sslmode=verify-full&sslrootcert=/tmp/db-ca.pem');
    expect(ENTRYPOINT).toContain('MIGRATE_DATABASE_URL="$DATABASE_URL"');
    expect(ENTRYPOINT).toMatch(/node-pg-migrate\.js up --migrations-dir migrations -d MIGRATE_DATABASE_URL/);
    expect(ENTRYPOINT).toMatch(/exec "\$@"/);
  });
});
