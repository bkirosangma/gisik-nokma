import type { SqlRow, SqlValue, SyncStorage } from '@gisik-nokma/sync-client';

type OpSqliteDb = { execute(sql: string, params?: unknown[]): Promise<{ rows: unknown[] }>; close(): void };

/** SyncStorage over op-sqlite — same explicit-transaction discipline as the other adapters. */
export function wrapOpSqliteDatabase(db: OpSqliteDb): SyncStorage {
  let queue: Promise<unknown> = Promise.resolve();
  const base = {
    async run(sql: string, params: SqlValue[] = []): Promise<void> {
      await db.execute(sql, params);
    },
    async all(sql: string, params: SqlValue[] = []): Promise<SqlRow[]> {
      return (await db.execute(sql, params)).rows as SqlRow[];
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
    async close(): Promise<void> {
      db.close();
    },
  };
}

export async function createOpSqliteStorage(name = 'gisik-nokma.db'): Promise<SyncStorage> {
  const { open } = await import('@op-engineering/op-sqlite');
  return wrapOpSqliteDatabase(open({ name }));
}
