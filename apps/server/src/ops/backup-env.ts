import { ConfigError } from '../config.js';

/**
 * The backup worker's read of `DATABASE_CA_CERT` — the one setting, beside
 * `DATABASE_URL`, that the worker takes from its environment and that
 * `loadConfig` would otherwise have supplied.
 *
 * WHY THIS EXISTS (2026-09-23). Production's `backup` worker logged
 * `backup job failed … self-signed certificate in certificate chain` for every
 * job that used the pool (`sweep-notifications`, `auto-close`, and the ledger
 * export, which shares it). The deploy spec binds `DATABASE_CA_CERT` to the
 * worker (`deploy/do/app.yaml`, the worker's env block) exactly as it does to
 * the server, and the server hands it to `createPool` (`src/index.ts`); the
 * worker never read it, so its pool spoke to the managed cluster with no CA and
 * Node refused the chain. `pg_dump` was unaffected: it goes through libpq under
 * `sslmode=require`, which does not verify the chain.
 *
 * The rules mirror `config.ts`'s `pemCertificate()` + `unsetWhenEmpty()` so an
 * operator meets ONE vocabulary across both entry points: unset or blank means
 * "no CA" (App Platform resolves an unbound variable to `''`); anything else
 * must contain a PEM certificate header or the worker refuses to boot, naming
 * the variable in `loadConfig`'s own message shape. The value is returned
 * verbatim — `createPool` gives it to Node TLS as `ssl.ca`, and a second PEM
 * parser here would be a second place to be wrong.
 */
export function optionalDatabaseCaCert(env: NodeJS.ProcessEnv): string | null {
  const raw = env.DATABASE_CA_CERT;
  if (raw === undefined || raw.trim() === '') {
    return null;
  }
  if (!raw.includes('-----BEGIN CERTIFICATE-----')) {
    throw new ConfigError('invalid backup worker configuration — check: DATABASE_CA_CERT');
  }
  return raw;
}
