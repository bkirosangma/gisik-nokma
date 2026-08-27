import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from './helpers/db.js';
import { createPool } from '../src/db.js';

const ADMIN_URL =
  process.env['TEST_DATABASE_ADMIN_URL'] ?? 'postgres://gisik:gisik@localhost:54329/postgres';

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase();
});

afterAll(async () => {
  await db.drop();
});

function insertEventSql(id: string, seq: number, workspaceSeq = seq): { text: string; values: unknown[] } {
  return {
    text: `INSERT INTO events
             (id, workspace_id, entity_kind, entity_id, type, version, payload, actor_id, origin, client_time, server_time, seq, workspace_seq)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
    values: [
      id,
      '01J60000000000000000000WKA',
      'workspace',
      '01J60000000000000000000WKA',
      'workspace.created',
      1,
      JSON.stringify({ name: 'Convenience Corner' }),
      '01J6000000000000000000ACTR',
      'server',
      '2026-08-20T14:30:00.000+05:30',
      '2026-08-20T09:00:00.000Z',
      seq,
      workspaceSeq,
    ],
  };
}

describe('events and snapshots schema', () => {
  it('migrations create events, snapshots, and the pgmigrations bookkeeping table', async () => {
    const result = await db.pool.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' ORDER BY table_name`,
    );
    const names = result.rows.map((row: { table_name: string }) => row.table_name);
    expect(names).toContain('events');
    expect(names).toContain('snapshots');
    expect(names).toContain('pgmigrations');
  });

  it('every session runs in Asia/Kolkata, so an ad-hoc query reads the product clock', async () => {
    const read = await db.pool.query<{ zone: string }>(
      `SELECT current_setting('TimeZone') AS zone`,
    );
    expect(read.rows[0]?.zone).toBe('Asia/Kolkata');
  });

  it('a stored claim reads back as the same instant: jsonb payload intact, client_time absolute, both seqs as numbers', async () => {
    const query = insertEventSql('01J6000000000000000000TT01', 1);
    await db.pool.query(query.text, query.values);
    const read = await db.pool.query<{
      payload: unknown;
      client_time: Date;
      seq: number;
      workspace_seq: number;
    }>('SELECT payload, client_time, seq, workspace_seq FROM events WHERE id = $1', [
      '01J6000000000000000000TT01',
    ]);
    const row = read.rows[0];
    expect(row?.payload).toEqual({ name: 'Convenience Corner' });
    // Submitted as '2026-08-20T14:30:00.000+05:30'. timestamptz keeps the
    // instant, not the label — the same moment, stated in UTC.
    expect(row?.client_time.toISOString()).toBe('2026-08-20T09:00:00.000Z');
    expect(row?.seq).toBe(1);
    expect(row?.workspace_seq).toBe(1);
  });

  it('planted defect: two clients stating one instant with different offsets store ONE instant and compare equal', async () => {
    // This is exactly what a text column got silently wrong: as text these two
    // strings are unequal and sort apart, though they name the same moment.
    const ist = insertEventSql('01J6000000000000000000TT04', 1);
    ist.values[2] = 'project';
    ist.values[3] = '01J60000000000000000000PRB';
    ist.values[9] = '2026-08-20T14:30:00.000+05:30';
    ist.values[12] = 90;
    await db.pool.query(ist.text, ist.values);

    const utc = insertEventSql('01J6000000000000000000TT05', 1);
    utc.values[2] = 'project';
    utc.values[3] = '01J60000000000000000000PRC';
    utc.values[9] = '2026-08-20T09:00:00.000Z';
    utc.values[12] = 91;
    await db.pool.query(utc.text, utc.values);

    const compared = await db.pool.query<{ same: boolean; distinct_instants: number }>(
      `SELECT a.client_time = b.client_time AS same,
              (SELECT count(DISTINCT client_time)::int FROM events WHERE id IN ($1, $2)) AS distinct_instants
         FROM events a, events b
        WHERE a.id = $1 AND b.id = $2`,
      ['01J6000000000000000000TT04', '01J6000000000000000000TT05'],
    );
    expect(compared.rows[0]?.same).toBe(true);
    expect(compared.rows[0]?.distinct_instants).toBe(1);
  });

  it('planted defect: a duplicate (entity_kind, entity_id, seq) violates events_entity_seq_unique', async () => {
    // workspace_seq 99 is free, so the entity constraint is the one that fires.
    const query = insertEventSql('01J6000000000000000000TT02', 1, 99);
    await expect(db.pool.query(query.text, query.values)).rejects.toMatchObject({
      code: '23505',
      constraint: 'events_entity_seq_unique',
    });
  });

  it('planted defect: a duplicate (workspace_id, workspace_seq) violates events_workspace_seq_unique — the stream cursor cannot fork', async () => {
    // A different entity in the same workspace, reusing workspace_seq 1: the
    // per-entity constraint is satisfied, and the workspace constraint refuses.
    const query = insertEventSql('01J6000000000000000000TT03', 1, 1);
    query.values[2] = 'project';
    query.values[3] = '01J60000000000000000000PRA';
    await expect(db.pool.query(query.text, query.values)).rejects.toMatchObject({
      code: '23505',
      constraint: 'events_workspace_seq_unique',
    });
  });

  it('planted defect: UPDATE on events is refused — the ledger cannot be rewritten', async () => {
    // Exact-rejection convention: pin both the SQLSTATE (P0001, plpgsql's
    // default for an unqualified RAISE EXCEPTION) and the full message
    // events_append_only() raises for this TG_OP — not a fragment regex.
    await expect(
      db.pool.query(`UPDATE events SET payload = '{}' WHERE id = $1`, ['01J6000000000000000000TT01']),
    ).rejects.toMatchObject({
      code: 'P0001',
      message: 'events is append-only: UPDATE refused',
    });
  });

  it('planted defect: DELETE on events is refused', async () => {
    await expect(
      db.pool.query('DELETE FROM events WHERE id = $1', ['01J6000000000000000000TT01']),
    ).rejects.toMatchObject({
      code: 'P0001',
      message: 'events is append-only: DELETE refused',
    });
  });

  it('planted defect: TRUNCATE on events is refused', async () => {
    await expect(db.pool.query('TRUNCATE events')).rejects.toMatchObject({
      code: 'P0001',
      message: 'events is append-only: TRUNCATE refused',
    });
  });

  it('snapshots stores state keyed by (entity_kind, entity_id, seq)', async () => {
    await db.pool.query(
      'INSERT INTO snapshots (entity_kind, entity_id, seq, state) VALUES ($1, $2, $3, $4)',
      ['workspace', '01J60000000000000000000WKA', 1, JSON.stringify({ name: 'Convenience Corner' })],
    );
    const read = await db.pool.query(
      'SELECT seq, state FROM snapshots WHERE entity_kind = $1 AND entity_id = $2',
      ['workspace', '01J60000000000000000000WKA'],
    );
    expect(read.rows).toEqual([{ seq: 1, state: { name: 'Convenience Corner' } }]);
  });
});

describe('createPool session timezone (falsifiable)', () => {
  // The brief's "every session runs in Asia/Kolkata" test above cannot fail by
  // construction: createTestDatabase ALTERs the database default to
  // Asia/Kolkata before createPool ever connects, so that assertion would pass
  // even if createPool's own `options` startup parameter did nothing at all.
  // This test removes that confound: the database default is pinned to UTC —
  // the opposite of the product zone — with no ALTER to Asia/Kolkata anywhere.
  // A pass can only mean createPool's startup parameter set the session itself.
  it('createPool alone controls the session timezone, independent of the database default', async () => {
    const name = `gisik_test_${randomUUID().replaceAll('-', '')}`;
    const admin = new pg.Client({ connectionString: ADMIN_URL });
    await admin.connect();
    await admin.query(`CREATE DATABASE ${name}`);
    await admin.query(`ALTER DATABASE ${name} SET timezone TO 'UTC'`);
    await admin.end();

    const url = ADMIN_URL.replace(/\/[^/]*$/, `/${name}`);
    const pool = createPool(url);
    try {
      const read = await pool.query<{ zone: string }>(
        `SELECT current_setting('TimeZone') AS zone`,
      );
      expect(read.rows[0]?.zone).toBe('Asia/Kolkata');
    } finally {
      await pool.end();
      const cleaner = new pg.Client({ connectionString: ADMIN_URL });
      await cleaner.connect();
      await cleaner.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
      await cleaner.end();
    }
  });
});
