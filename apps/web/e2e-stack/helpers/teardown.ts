/**
 * What the e2e-stack run leaves behind, and the SQL that removes exactly that (devices plan Task 8, case 6.338).
 *
 * Every sign-in the suite performs creates a `session` row (and `passkey-registration.spec.ts` a `passkey` row) for an
 * `@e2e.gisik-nokma.local` account on the DEV stack's database. With the devices list those rows are now visible, so a few
 * runs would leave the e2e owner with a page full of "Chrome on Mac" rows nobody made on purpose.
 *
 * THE BOUND IS THE POINT. The e2e accounts persist between runs (the seed reuses them), so "delete every session of an e2e
 * account" would also delete whatever a person signed in as that account by hand - the browser pass of the same plan signs
 * in as the e2e owner. Only rows created at or after this run's start are the run's own.
 *
 * Pure and dependency-free so `apps/server/test/ops/e2e-teardown.test.ts` can execute the very same string against a real
 * Postgres: a copy of the SQL in the test would prove the copy.
 */

/** The accounts the suite signs in as (`helpers/sign-in.ts`). A human's own account never matches. */
export const E2E_EMAIL_PATTERN = '%@e2e.gisik-nokma.local';

const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;

/**
 * `started` is interpolated into the statement text (psql reads stdin, there is no parameter channel), so it is held to the
 * one shape `new Date().toISOString()` produces rather than trusted.
 */
export function teardownSql(started: string): string {
  if (!ISO_INSTANT.test(started)) throw new Error(`teardown start time is not an ISO instant: ${started}`);
  return `
    DELETE FROM session s USING "user" u
     WHERE u.id = s."userId" AND u.email LIKE '${E2E_EMAIL_PATTERN}' AND s."createdAt" >= '${started}'::timestamptz;
    DELETE FROM passkey p USING "user" u
     WHERE u.id = p."userId" AND u.email LIKE '${E2E_EMAIL_PATTERN}' AND p."createdAt" >= '${started}'::timestamptz;`;
}

/** `docker` argv for the dev stack's Postgres, the same `compose -f docker-compose.dev.yml exec -T` channel setup seeds through. */
export function teardownArgv(composeFile: string): string[] {
  return [
    'compose', '-f', composeFile, 'exec', '-T', 'postgres',
    'sh', '-c', 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1',
  ];
}
