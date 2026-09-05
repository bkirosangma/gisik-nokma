import Database from 'better-sqlite3';
import { storageConformanceTests } from '@gisik-nokma/sync-client/testing';
import { wrapTauriDatabase } from './tauri-sql-storage.js';

/**
 * The real tauri-plugin-sql `Database` exposes `execute(sql, params)` and
 * `select(sql, params)` over its own native sqlite connection. A fake shaped
 * exactly like that surface, backed by a REAL in-memory better-sqlite3
 * database, lets `storageConformanceTests` exercise the adapter's actual
 * BEGIN IMMEDIATE/COMMIT/ROLLBACK statement sequence against real DDL/DML and
 * real concurrent-transaction serialisation — not just an exact fixture
 * string sequence, which is all `tauri-sql-storage.test.ts` can check.
 *
 * better-sqlite3 is a devDependency of THIS test only (see
 * packages/sync-client/src/testing.ts's own docblock for the same reasoning):
 * it never reaches the Tauri app bundle.
 */
function fakePluginSqlDatabase() {
  const db = new Database(':memory:');
  return {
    async execute(sql: string, params: unknown[] = []): Promise<unknown> {
      const info = db.prepare(sql).run(...(params as never[]));
      return { rowsAffected: info.changes };
    },
    async select(sql: string, params: unknown[] = []): Promise<unknown> {
      return db.prepare(sql).all(...(params as never[]));
    },
  };
}

storageConformanceTests('tauri (fake plugin-sql over better-sqlite3)', async () =>
  wrapTauriDatabase(fakePluginSqlDatabase()),
);
