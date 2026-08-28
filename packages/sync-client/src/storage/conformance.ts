import { describe, expect, it } from 'vitest';
import type { SyncStorage } from './storage.js';

/**
 * The behavioural contract every adapter must honour — run it against
 * better-sqlite3 here, op-sqlite and tauri-plugin-sql in their app packages.
 *
 * Imports vitest, so it ships through the `./testing` subpath only.
 *
 * ULID discipline, stated rather than left implicit: the row ids below
 * ('a', 'kept', 'lost') are NOT ULIDs and need not be. They are opaque bytes
 * written into a scratch table this suite creates and drops with the
 * connection; they never become an event id, never enter an envelope, and
 * never cross `parseEvent`. This is the same argument that lets the
 * rule-engine fixtures use `t1` / `ws_1`. Making them ULID-shaped here would
 * suggest the adapter knows what a ULID is — it does not, and must not: it
 * moves `SqlValue`s. The moment anything in this package MINTS an id that
 * rides an envelope, that id is checked against the domain's `ULID_REGEX`
 * where it is configured, never against a regex written here.
 */
export function storageConformanceTests(name: string, make: () => Promise<SyncStorage>): void {
  describe(`SyncStorage conformance: ${name}`, () => {
    it('runs DDL + DML and reads rows back with named columns', async () => {
      const s = await make();
      await s.run('CREATE TABLE t (id TEXT PRIMARY KEY, n INTEGER)');
      await s.run('INSERT INTO t (id, n) VALUES (?, ?)', ['a', 1]);
      expect(await s.all('SELECT id, n FROM t ORDER BY id')).toEqual([{ id: 'a', n: 1 }]);
      await s.close();
    });

    it('transaction commits atomically and rolls back on throw', async () => {
      const s = await make();
      await s.run('CREATE TABLE t (id TEXT PRIMARY KEY)');
      await s.transaction(async (tx) => {
        await tx.run('INSERT INTO t (id) VALUES (?)', ['kept']);
      });
      await expect(
        s.transaction(async (tx) => {
          await tx.run('INSERT INTO t (id) VALUES (?)', ['lost']);
          throw new Error('boom');
        }),
      ).rejects.toThrow('boom');
      expect(await s.all('SELECT id FROM t')).toEqual([{ id: 'kept' }]);
      await s.close();
    });

    it('serialises concurrent transactions instead of interleaving them', async () => {
      const s = await make();
      await s.run('CREATE TABLE t (id INTEGER PRIMARY KEY AUTOINCREMENT, tag TEXT)');
      await Promise.all([
        s.transaction(async (tx) => {
          await tx.run("INSERT INTO t (tag) VALUES ('a1')");
          await tx.run("INSERT INTO t (tag) VALUES ('a2')");
        }),
        s.transaction(async (tx) => {
          await tx.run("INSERT INTO t (tag) VALUES ('b1')");
          await tx.run("INSERT INTO t (tag) VALUES ('b2')");
        }),
      ]);
      const tags = (await s.all('SELECT tag FROM t ORDER BY id')).map((r) => r.tag);
      // The plan pinned `expect([tags.join(','), 'a1,a2,b1,b2', 'b1,b2,a1,a2'])
      //   .toContain(tags.join(','))` — a TAUTOLOGY: the array under test holds
      // the actual value as its own first element, so `toContain` is satisfied
      // by construction and an adapter that interleaved into 'a1,b1,a2,b2'
      // passed. This is the only assertion that proves the queue does anything,
      // so it is the only one that must not be vacuous. The actual value is
      // removed from the expected set; either whole-transaction order is
      // acceptable, no interleaving is.
      expect(['a1,a2,b1,b2', 'b1,b2,a1,a2']).toContain(tags.join(','));
      await s.close();
    });
  });
}
