import { describe, expect, it } from 'vitest';
import { seedUlid } from '../../src/seed/seed-ulid.js';
import { findUserIdByEmail } from '../../src/seed/users.js';

describe('findUserIdByEmail', () => {
  /**
   * 13.48 — findUserIdByEmail queries better-auth's "user" table
   * case-insensitively and returns the id.
   */
  it('queries the better-auth user table case-insensitively and returns the id', async () => {
    const fixtureId = seedUlid('user', 'test-fixture');
    const queries: Array<{ sql: string; params: unknown[] }> = [];
    const db = {
      query: async (sql: string, params: unknown[]) => {
        queries.push({ sql, params });
        return { rows: [{ id: fixtureId }] };
      },
    };
    const id = await findUserIdByEmail(db as never, 'Kiro@Example.com');
    expect(id).toBe(fixtureId);
    expect(queries[0]!.sql).toMatch(/from\s+"user"/i);
    expect(queries[0]!.sql).toMatch(/lower\(email\)/i);
    expect(queries[0]!.params).toEqual(['Kiro@Example.com']);
  });

  /**
   * 13.49 — findUserIdByEmail returns null when nobody has signed in with
   * that address — the seed never invents people.
   */
  it('null when nobody has signed in with that address — the seed never invents people', async () => {
    const db = { query: async () => ({ rows: [] }) };
    expect(await findUserIdByEmail(db as never, 'ghost@example.com')).toBeNull();
  });
});
