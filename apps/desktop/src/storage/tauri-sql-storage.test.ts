import { describe, expect, it, vi } from 'vitest';
import { wrapTauriDatabase } from './tauri-sql-storage.js';

type Call = { method: 'execute' | 'select'; sql: string; params: unknown[] };

function fakeDb() {
  const calls: Call[] = [];
  return {
    calls,
    execute: vi.fn(async (sql: string, params: unknown[] = []) => {
      calls.push({ method: 'execute', sql, params });
      return { rowsAffected: 1 };
    }),
    select: vi.fn(async (sql: string, params: unknown[] = []) => {
      calls.push({ method: 'select', sql, params });
      return [{ id: 'a', n: 1 }];
    }),
  };
}

describe('wrapTauriDatabase', () => {
  it('maps run→execute and all→select with positional params', async () => {
    const db = fakeDb();
    const storage = wrapTauriDatabase(db);
    await storage.run('INSERT INTO t (id) VALUES (?)', ['a']);
    expect(await storage.all('SELECT id, n FROM t WHERE id = ?', ['a'])).toEqual([{ id: 'a', n: 1 }]);
    expect(db.calls).toEqual([
      { method: 'execute', sql: 'INSERT INTO t (id) VALUES (?)', params: ['a'] },
      { method: 'select', sql: 'SELECT id, n FROM t WHERE id = ?', params: ['a'] },
    ]);
  });

  it('transaction wraps in BEGIN IMMEDIATE / COMMIT, rolls back on throw, serialises', async () => {
    const db = fakeDb();
    const storage = wrapTauriDatabase(db);
    await storage.transaction(async (tx) => tx.run('INSERT INTO t (id) VALUES (?)', ['x']));
    await expect(storage.transaction(async () => { throw new Error('boom'); })).rejects.toThrow('boom');
    const sqls = db.calls.map((c) => c.sql);
    expect(sqls).toEqual(['BEGIN IMMEDIATE', "INSERT INTO t (id) VALUES (?)", 'COMMIT', 'BEGIN IMMEDIATE', 'ROLLBACK']);
  });
});
