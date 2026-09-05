import type { SqlRow, SqlValue, SyncStorage } from '@gisik-nokma/sync-client';

type TauriDatabase = {
  execute(sql: string, params?: unknown[]): Promise<unknown>;
  select(sql: string, params?: unknown[]): Promise<unknown>;
};

/**
 * SyncStorage over tauri-plugin-sql. The plugin has no transaction API, so
 * BEGIN IMMEDIATE/COMMIT/ROLLBACK run as statements behind a promise queue —
 * one writer at a time among this module's own JS callers.
 *
 * KNOWN LIMITATION, recorded rather than fixed here — it cannot be closed
 * from this file. tauri-plugin-sql 2.4.1's public `Builder` (its own
 * lib.rs) exposes only `add_migrations`, no pool-size or connection-pinning
 * option, and `DbPool::connect` (its own wrapper.rs) opens the database with
 * sqlx's `Pool::connect`, which defaults to `max_connections: 10`. Every
 * execute()/select() call — including the unqueued run()/all() below —
 * acquires and releases a connection from that pool independently, so this
 * queue serialises JS callers but cannot guarantee that BEGIN IMMEDIATE, the
 * transaction body's statements and COMMIT/ROLLBACK land on the SAME
 * underlying SQLite connection: a concurrent unqueued read can be routed to
 * a second pooled connection mid-transaction. Closing this needs a Rust-side
 * fork of the plugin (to pin the pool to one connection) or a different
 * plugin/architecture — both outside a Tauri-shell scaffold task. Owner:
 * whoever next hardens this adapter for real multi-device use, a decision no
 * task owns yet; tracked in Features.md and test-cases/12.
 */
export function wrapTauriDatabase(db: TauriDatabase): SyncStorage {
  let queue: Promise<unknown> = Promise.resolve();

  const base = {
    async run(sql: string, params: SqlValue[] = []): Promise<void> {
      await db.execute(sql, params);
    },
    async all(sql: string, params: SqlValue[] = []): Promise<SqlRow[]> {
      return (await db.select(sql, params)) as SqlRow[];
    },
  };

  return {
    ...base,
    async transaction<T>(fn: (tx: SyncStorage) => Promise<T>): Promise<T> {
      const job = queue.then(async () => {
        await db.execute('BEGIN IMMEDIATE');
        try {
          const result = await fn({
            ...base,
            transaction: () => Promise.reject(new Error('no nested transactions')),
            close: async () => undefined,
          });
          await db.execute('COMMIT');
          return result;
        } catch (err) {
          await db.execute('ROLLBACK');
          throw err;
        }
      });
      queue = job.catch(() => undefined);
      return job;
    },
    close: async () => undefined, // plugin owns the connection lifecycle
  };
}

/**
 * One wrapper — and therefore one serialising queue — per database name,
 * even across repeated calls. React.StrictMode double-invokes effects in
 * dev, and app.tsx calls this inside a useEffect; two independent wrappers
 * over the same underlying database would mean two queues neither knows
 * about the other, defeating the one serialisation guarantee this module
 * does make.
 */
const openStorages = new Map<string, Promise<SyncStorage>>();

export async function createTauriSqlStorage(dbName = 'gisik-nokma.db'): Promise<SyncStorage> {
  const existing = openStorages.get(dbName);
  if (existing !== undefined) return existing;
  const opening = (async () => {
    const { default: Database } = await import('@tauri-apps/plugin-sql');
    return wrapTauriDatabase(await Database.load(`sqlite:${dbName}`));
  })();
  // A failed open must not permanently poison this name — let a later call retry.
  opening.catch(() => openStorages.delete(dbName));
  openStorages.set(dbName, opening);
  return opening;
}
