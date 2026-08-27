import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import type { Pool } from 'pg';
import { runner } from 'node-pg-migrate';
import { IST_TIME_ZONE } from '@gisik-nokma/domain';
import { createPool } from '../../src/db.js';

const ADMIN_URL =
  process.env['TEST_DATABASE_ADMIN_URL'] ?? 'postgres://gisik:gisik@localhost:54329/postgres';

const MIGRATIONS_DIR = fileURLToPath(new URL('../../migrations', import.meta.url));

export type TestDatabase = {
  pool: Pool;
  url: string;
  drop(): Promise<void>;
};

/**
 * Creates a uniquely named database, pins its timezone to Asia/Kolkata, runs
 * every migration, and returns a pool built via createPool (so the int8 parser
 * is installed and sessions are Asia/Kolkata). Each test file gets its own
 * database — files can run in parallel without sharing state.
 *
 * The database-level ALTER covers connections that do NOT come through
 * createPool — the migration runner, and any psql a developer opens against a
 * surviving test database — so no session anywhere reads a different clock than
 * the product (owner decision: time is Asia/Kolkata).
 */
export async function createTestDatabase(): Promise<TestDatabase> {
  const name = `gisik_test_${randomUUID().replaceAll('-', '')}`;
  const admin = new pg.Client({ connectionString: ADMIN_URL });
  await admin.connect();
  await admin.query(`CREATE DATABASE ${name}`);
  await admin.query(`ALTER DATABASE ${name} SET timezone TO '${IST_TIME_ZONE}'`);
  await admin.end();

  const url = ADMIN_URL.replace(/\/[^/]*$/, `/${name}`);
  await runner({
    databaseUrl: url,
    dir: MIGRATIONS_DIR,
    direction: 'up',
    migrationsTable: 'pgmigrations',
    log: () => {},
  });

  const pool = createPool(url);
  return {
    pool,
    url,
    async drop() {
      await pool.end();
      const cleaner = new pg.Client({ connectionString: ADMIN_URL });
      await cleaner.connect();
      await cleaner.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
      await cleaner.end();
    },
  };
}
