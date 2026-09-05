#!/usr/bin/env node
// Assert the PROVISIONED database's own default timezone.
//
// This is not a duplicate of apps/server/test/migrations.test.ts's timezone
// tests. That file has two: one whose per-test database is ALTERed to
// Asia/Kolkata before createPool ever connects (unfalsifiable by construction
// -- it would pass even if createPool's own `options` startup parameter did
// nothing), and a second, already-falsifiable one that pins the database to
// UTC and proves createPool's `options` parameter alone can still produce an
// Asia/Kolkata session. Neither tests what THIS script tests: a client that
// connects with NO startup options and issues NO `SET TIME ZONE`, so the only
// thing that can produce a pass is the DATABASE's own configured default --
// what an operator's bare psql session gets, independent of any pool's
// ability to override it.
//
// Deliberately NOT imported from apps/server: apps/server/src/db.ts's
// createPool sets the zone via a startup option, which is exactly the
// mechanism this script exists to not rely on.
import pg from 'pg';

const EXPECTED = 'Asia/Kolkata';
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is required');
  process.exit(2);
}

// Managed Postgres requires TLS; the CA travels in DATABASE_CA_CERT, the
// same variable apps/server/src/config.ts feeds the app pool. TLS is
// orthogonal to startup options -- supplying the CA sets no session
// parameter.
const ca = process.env.DATABASE_CA_CERT;
const client = new pg.Client({
  connectionString: url,
  ...(ca ? { ssl: { ca, rejectUnauthorized: true } } : {}),
});

try {
  await client.connect();
  const { rows } = await client.query('SHOW TimeZone');
  const actual = rows[0].TimeZone;
  if (actual !== EXPECTED) {
    console.error(
      `database timezone is '${actual}', expected '${EXPECTED}'.\n` +
        `Run: ALTER DATABASE <db> SET timezone TO '${EXPECTED}'\n` +
        'The app pool asking for the zone is not enough -- operator psql ' +
        'sessions and any pooler that drops startup options bypass it.',
    );
    process.exit(1);
  }
  console.log(`database timezone: ${actual}`);
} finally {
  await client.end();
}
