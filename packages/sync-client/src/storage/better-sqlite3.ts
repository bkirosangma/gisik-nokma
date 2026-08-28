import Database from 'better-sqlite3';
import type { SqlRow, SqlValue, SyncStorage } from './storage.js';

/**
 * The test/harness engine. NATIVE module — reachable only through the
 * package's `./testing` subpath, never through the root barrel: Tauri
 * (Task 16) and Expo (Task 17) enter this package and must not drag a
 * node-gyp addon into their bundles. `packages/rule-engine` already paid
 * for this lesson once with its `./fixtures` harness.
 */
export function createBetterSqliteStorage(path = ':memory:'): SyncStorage {
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  let queue: Promise<unknown> = Promise.resolve();

  const base = {
    async run(sql: string, params: SqlValue[] = []): Promise<void> {
      db.prepare(sql).run(...params);
    },
    async all(sql: string, params: SqlValue[] = []): Promise<SqlRow[]> {
      return db.prepare(sql).all(...params) as SqlRow[];
    },
  };

  return {
    ...base,
    async transaction<T>(fn: (tx: SyncStorage) => Promise<T>): Promise<T> {
      // better-sqlite3 is synchronous underneath; the queue serialises callers
      // so interleaved async transactions cannot interleave their statements.
      const job = queue.then(async () => {
        db.prepare('BEGIN IMMEDIATE').run();
        try {
          const result = await fn({
            ...base,
            transaction: () => Promise.reject(new Error('no nested transactions')),
            close: async () => undefined,
          });
          db.prepare('COMMIT').run();
          return result;
        } catch (err) {
          db.prepare('ROLLBACK').run();
          throw err;
        }
      });
      queue = job.catch(() => undefined);
      return job;
    },
    async close(): Promise<void> {
      db.close();
    },
  };
}
