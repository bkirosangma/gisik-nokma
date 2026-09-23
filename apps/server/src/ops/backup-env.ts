import { ConfigError } from '../config.js';

/**
 * The read of `DATABASE_CA_CERT` for any process that builds a pool OUTSIDE
 * `loadConfig` — the one setting, beside `DATABASE_URL`, such a process takes
 * from its environment and that `loadConfig` would otherwise have supplied.
 *
 * TWO callers since 2026-09-23, and the second is why the sentence above no
 * longer says "the backup worker's": `ops/backup-daemon-main.ts` (#705) and
 * `tools/search-preflight.ts`, which is pointed at a TARGET database — often a
 * managed one — by an operator. Both build their own pool, and the pre-flight
 * shares this reader rather than re-implementing the PEM check, because a
 * second parser of the same variable is a second place to be wrong.
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
 * **The pre-flight had the same hole for the same reason**, and that is the
 * second caller: `tools/search-preflight.ts` builds its own pool against a
 * TARGET database — often the managed one — and it too read only the URL. A
 * managed URL carries `sslmode=require`, which pg takes as full verification,
 * and the chain is not in the system store, so the connection fails before any
 * extension is looked at.
 *
 * The rules mirror `config.ts`'s `pemCertificate()` + `unsetWhenEmpty()` so an
 * operator meets ONE vocabulary across both entry points: unset or blank means
 * "no CA" (App Platform resolves an unbound variable to `''`); anything else
 * must contain a PEM certificate header or the caller refuses to boot, naming
 * the variable in `loadConfig`'s own message shape. The value is returned
 * verbatim — `createPool` gives it to Node TLS as `ssl.ca`, and a second PEM
 * parser here would be a second place to be wrong.
 *
 * The refusal's MESSAGE still says "backup worker", because the backup worker
 * is the entry point that owns `ConfigError`'s vocabulary here and renaming it
 * would be a change to a message an operator has already seen in a log. The
 * pre-flight is a tool a person runs by hand with the variable in front of
 * them, so the same sentence names what they typed.
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
