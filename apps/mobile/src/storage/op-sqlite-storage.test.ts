import Database from 'better-sqlite3';
import { describe, expect, it, vi } from 'vitest';
import { storageConformanceTests } from '@gisik-nokma/sync-client/testing';
import { wrapOpSqliteDatabase } from './op-sqlite-storage.js';

type OpSqliteDb = { execute(sql: string, params?: unknown[]): Promise<{ rows: unknown[] }>; close(): void };

/**
 * op-sqlite is a native module and cannot run under vitest. This fake speaks
 * its `execute(sql, params) -> {rows}` shape but is backed by a REAL SQLite
 * engine (better-sqlite3, already the package's own conformance-harness
 * engine), so `storageConformanceTests` below exercises real DDL/DML and
 * transaction behaviour through `wrapOpSqliteDatabase`'s translation layer.
 * A canned responder (`rows: sql.startsWith('SELECT') ? [{...}] : []`)
 * measurably passes only 1 of the 3 conformance tests (the round-trip whose
 * fixture happens to coincide with what it returns) — an opus review ran it
 * and corrected an earlier draft of this comment that overclaimed "every
 * assertion". It fails test 2 (`all()` after a real INSERT doesn't see one)
 * and test 3 (rollback leaves no trace) outright. The real-engine fake below
 * is still the right choice: it is the one that proves params are actually
 * bound (a mutant dropping them dies here, not on the recording fake).
 */
function realBackedFakeDb(): OpSqliteDb {
  const db = new Database(':memory:');
  return {
    async execute(sql, params = []) {
      const stmt = db.prepare(sql);
      const bound = params as Array<string | number | null>;
      if (stmt.reader) return { rows: stmt.all(...bound) };
      stmt.run(...bound);
      return { rows: [] };
    },
    close() {
      db.close();
    },
  };
}

storageConformanceTests('op-sqlite (real-engine fake)', async () => wrapOpSqliteDatabase(realBackedFakeDb()));

describe('wrapOpSqliteDatabase — properties the conformance suite does not reach', () => {
  it('rejects a nested transaction rather than silently forwarding it', async () => {
    const storage = wrapOpSqliteDatabase(realBackedFakeDb());
    await expect(storage.transaction((tx) => tx.transaction(async () => undefined))).rejects.toThrow(
      'no nested transactions',
    );
  });

  it('close() closes the underlying database, not just the wrapper', async () => {
    const db = realBackedFakeDb();
    const closeSpy = vi.spyOn(db, 'close');
    const storage = wrapOpSqliteDatabase(db);
    await storage.close();
    expect(closeSpy).toHaveBeenCalledOnce();
  });
});

describe('wrapOpSqliteDatabase — SQL shape pinned against a recording fake', () => {
  function recordingFakeDb() {
    const calls: Array<{ sql: string; params: unknown[] }> = [];
    return {
      calls,
      execute: vi.fn(async (sql: string, params: unknown[] = []) => {
        calls.push({ sql, params });
        return { rows: sql.startsWith('SELECT') ? [{ id: 'a', n: 1 }] : [] };
      }),
      close: vi.fn(),
    };
  }

  it('maps run/all onto execute and returns plain row objects', async () => {
    const db = recordingFakeDb();
    const storage = wrapOpSqliteDatabase(db);
    await storage.run('INSERT INTO t (id) VALUES (?)', ['a']);
    expect(await storage.all('SELECT id, n FROM t WHERE id = ?', ['a'])).toEqual([{ id: 'a', n: 1 }]);
  });

  it('transaction emits BEGIN IMMEDIATE/COMMIT and ROLLBACK on throw, serialised', async () => {
    const db = recordingFakeDb();
    const storage = wrapOpSqliteDatabase(db);
    await storage.transaction(async (tx) => tx.run('INSERT INTO t (id) VALUES (?)', ['x']));
    await expect(
      storage.transaction(async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(db.calls.map((c) => c.sql)).toEqual([
      'BEGIN IMMEDIATE',
      'INSERT INTO t (id) VALUES (?)',
      'COMMIT',
      'BEGIN IMMEDIATE',
      'ROLLBACK',
    ]);
  });
});
