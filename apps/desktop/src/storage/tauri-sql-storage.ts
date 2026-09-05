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
 * KNOWN LIMITATION, MEASURED rather than fixed here — it cannot be closed
 * from this file. tauri-plugin-sql 2.4.1's public `Builder` (its own
 * lib.rs) exposes only `add_migrations`, no pool-size or connection-pinning
 * option; `DbPool::connect` (wrapper.rs) opens the database with sqlx's
 * `Pool::connect` (default `max_connections: 10`, no `busy_timeout` set
 * anywhere in the plugin); and every `execute`/`select` Tauri command
 * (commands.rs) independently acquires and releases a pooled connection for
 * ONE `sqlx::query(sql)` call. So this queue serialises JS CALLERS but
 * cannot pin BEGIN IMMEDIATE, the transaction body and COMMIT/ROLLBACK to
 * the SAME connection.
 *
 * This is NOT merely a race that needs concurrency to trigger. A standalone
 * probe against sqlx 0.8.6 (the plugin's pinned version), replicating its
 * exact `Pool::connect` + `sqlx::query(sql)` + `pool.execute(query)` calls
 * with zero external concurrency — one BEGIN IMMEDIATE, then one INSERT, as
 * two sequential `pool.execute()` calls, exactly this file's own pattern —
 * reproducibly gets `error returned from database: (code: 5) database is
 * locked` on the INSERT, with the pool reporting a SECOND physical
 * connection opened (`pool.size()==2`) despite the first sitting idle: sqlx
 * does not guarantee it hands the just-released connection back to the next
 * caller, and with no `busy_timeout`, the loser fails immediately rather
 * than waiting. So a transaction of more than one statement is not merely
 * at risk under contention — it is a live, easily-reproduced failure mode
 * of the design as shipped.
 *
 * A single `execute()` call carrying the WHOLE transaction as one
 * multi-statement string (`"BEGIN IMMEDIATE; INSERT …; COMMIT;"`) WAS
 * measured and DOES work — sqlx's SQLite driver runs all three statements
 * against the one connection that single call acquires, commits, and
 * leaves the pool in a clean state (a fresh BEGIN afterwards succeeds).
 * That trick is NOT applicable here, though, and the reason is a fact about
 * the CALLERS, not about SQL: every real production caller of
 * `SyncStorage.transaction` — `packages/sync-client/src/storage/schema.ts`
 * and all four transaction sites in `packages/sync-client/src/replica/
 * replica.ts` — reads with `tx.all()` INSIDE the transaction and branches
 * on what it reads (a duplicate-event check, a per-row loop over
 * `SELECT … FROM tickets`, a workflow-definition fold that decides its next
 * write from the previous one's result). None of that is expressible as one
 * SQL string decided before the transaction opens.
 *
 * Closing this for real needs either a Rust-side fork of the plugin (to pin
 * the pool to one connection, or expose a held-connection handle to JS) or a
 * different plugin/architecture — both outside a Tauri-shell scaffold task.
 * Owner: whoever next hardens this adapter for real multi-device use, a
 * decision no task owns yet; tracked in Features.md and test-cases/12.
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
