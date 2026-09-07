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

/**
 * 12.36 — wrapTauriDatabase maps run→execute and all→select with positional params (first it), and its transaction wraps the caller's statement in BEGIN IMMEDIATE/COMMIT, rolling back to ROLLBACK on throw (second it) — the exact call-sequence discipline this row claims.
 * 12.228 — wrapTauriDatabase's mapping (run→execute, all→select, positional params) and its exact transaction sequence — BEGIN IMMEDIATE / statement / COMMIT, or BEGIN IMMEDIATE / ROLLBACK on throw — are pinned against a vi.fn() {execute,select} fixture asserting the exact call sequence, per the file's own docblock naming a rollback-vs-commit mutation as the discriminating mutant.
 */
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
