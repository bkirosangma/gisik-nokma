export type SqlValue = string | number | null;
export type SqlRow = Record<string, SqlValue>;

/**
 * The ONE local-storage interface (amendment 17). SQLite everywhere:
 * op-sqlite on React Native, tauri-plugin-sql on desktop, better-sqlite3
 * in tests and the dual-client harness. JSON is stored as TEXT — the
 * replica owns (de)serialisation, adapters stay dumb.
 *
 * This module is types only, on purpose: it is the one thing every client
 * package may import from the root barrel, so it must never reach a native
 * module, a test framework, or a `node:` builtin. The engine that implements
 * it (`better-sqlite3.ts`) and the suite that checks it (`conformance.ts`)
 * both ship behind the `./testing` subpath instead.
 */
export interface SyncStorage {
  run(sql: string, params?: SqlValue[]): Promise<void>;
  all(sql: string, params?: SqlValue[]): Promise<SqlRow[]>;
  /** Serialised: one transaction at a time; rolls back when fn throws. */
  transaction<T>(fn: (tx: SyncStorage) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}
