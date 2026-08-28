import { pathToFileURL } from 'node:url';
import { getMigrations } from 'better-auth/db/migration';
import { auth } from '../auth/auth-dev.js';

/**
 * Prints the vendor schema the INSTALLED better-auth requires, so
 * `migrations/1787927101493_auth-tables.sql` can be diffed against it after
 * every better-auth upgrade. A drifted vendor schema fails at runtime, not at
 * migrate time — this is the check that catches it at upgrade time instead.
 *
 * Why this exists rather than `@better-auth/cli`: that package pins its own
 * `better-auth` as a hard dependency, and at the time of writing its latest
 * release (1.4.21) trails the library (1.7.2). Run against this repo's config
 * it emitted a schema with no `account."issuer"` column and no
 * `account_issuer_accountId_uidx` index — both of which 1.7.2 writes on every
 * account link. A generator that reports the wrong version's schema is worse
 * than none, so the schema is taken from the library the server actually
 * imports. `auth.options` is that instance's own resolved configuration,
 * plugins included.
 *
 * Reads nothing from the database and writes nothing to it: `getMigrations`
 * only needs a dialect to compile against.
 */
export async function authSchemaSql(): Promise<string> {
  const { compileMigrations } = await getMigrations(auth.options, { throwOnUnsafe: false });
  return compileMigrations();
}

// `pathToFileURL`, not a `file://` template string, and for a reason this tool
// cannot afford: the two disagree the moment the checkout path holds a space,
// a `#`, or a non-ASCII character, because only `pathToFileURL` percent-encodes.
// The guard would then be false and `pnpm run auth:schema` would print nothing
// and exit 0 — a tool whose whole job is emitting text for a human to diff,
// succeeding silently while emitting none. Matches `verify-projections.ts`.
const executedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (executedDirectly) {
  authSchemaSql()
    .then((sql) => {
      process.stdout.write(sql);
      process.exit(0);
    })
    .catch((error: unknown) => {
      console.error(error);
      process.exit(1);
    });
}
