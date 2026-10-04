import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  ENTITY_COLUMN_NAMES,
  PURGE_TABLE_RULES,
  workspaceScopedTables,
  type PurgeTableRule,
} from '../../src/purge/table-rules.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';

/**
 * Spec §5.5 — every table has a purge rule, and a guard that proves it.
 * Cases 19.081–19.083 (`test-cases/19-trash.md` §19.9).
 *
 * The schema is read from `information_schema` of a freshly MIGRATED database,
 * never from a list in this file: a table added next month must redden this
 * suite without anyone remembering to edit it. Each case carries its own
 * control — the same comparator run against a deliberately broken copy of the
 * rules — so a comparator that can never report anything cannot pass.
 */

type Rules = Readonly<Record<string, PurgeTableRule>>;

let db: TestDatabase;
let tables: string[];
let columns: Array<{ table: string; column: string }>;

beforeAll(async () => {
  db = await createTestDatabase();
  const t = await db.pool.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name <> 'pgmigrations'
      ORDER BY table_name`,
  );
  tables = t.rows.map((row) => row.table_name);
  const c = await db.pool.query<{ table_name: string; column_name: string }>(
    `SELECT table_name, column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = ANY($1::text[])
      ORDER BY table_name, column_name`,
    [tables],
  );
  columns = c.rows.map((row) => ({ table: row.table_name, column: row.column_name }));
}, 60_000);

afterAll(async () => {
  await db.drop();
});

function entityBearing(): string[] {
  const names = new Set<string>(ENTITY_COLUMN_NAMES);
  return [...new Set(columns.filter((c) => names.has(c.column)).map((c) => c.table))].sort();
}

function missing(required: readonly string[], rules: Rules): string[] {
  return required.filter((table) => !Object.hasOwn(rules, table));
}

function stale(rules: Rules): string[] {
  return Object.keys(rules).filter((table) => !tables.includes(table)).sort();
}

function unknownColumns(rules: Rules): string[] {
  const out: string[] = [];
  for (const [table, rule] of Object.entries(rules)) {
    for (const column of rule.by ?? []) {
      if (!columns.some((c) => c.table === table && c.column === column)) out.push(`${table}.${column}`);
    }
  }
  return out.sort();
}

function mislabelled(rules: Rules): string[] {
  return entityBearing().filter((table) => rules[table]?.rule === 'not-entity-bearing');
}

function without(table: string): Rules {
  return Object.fromEntries(Object.entries(PURGE_TABLE_RULES).filter(([name]) => name !== table));
}

describe('19.081 every entity-bearing table has a purge rule', () => {
  it('names no entity-bearing table without a rule, and names proj_search once its rule is removed', () => {
    // Non-emptiness first: a comparator over an empty list passes vacuously.
    expect(entityBearing().length).toBeGreaterThan(20);
    expect(missing(entityBearing(), PURGE_TABLE_RULES)).toEqual([]);
    // CONTROL — the same comparator, one rule removed.
    expect(missing(entityBearing(), without('proj_search'))).toEqual(['proj_search']);
  });
});

describe('19.082 every rule names a table and columns that exist', () => {
  it('reports no stale rule and no unknown by-column, and names a planted one of each', () => {
    expect(stale(PURGE_TABLE_RULES)).toEqual([]);
    expect(unknownColumns(PURGE_TABLE_RULES)).toEqual([]);
    // CONTROL
    expect(
      stale({ ...PURGE_TABLE_RULES, proj_gone: { rule: 'erase', by: ['workspace_id'], why: 'planted' } }),
    ).toEqual(['proj_gone']);
    expect(
      unknownColumns({
        ...PURGE_TABLE_RULES,
        proj_tickets: { rule: 'erase', by: ['ticket_idx'], why: 'planted' },
      }),
    ).toEqual(['proj_tickets.ticket_idx']);
  });
});

describe('19.083 every base table carries a deliberate rule', () => {
  it('has a rule for every base table, and never calls an entity-bearing table not-entity-bearing', () => {
    expect(tables.length).toBeGreaterThan(30);
    expect(missing(tables, PURGE_TABLE_RULES)).toEqual([]);
    expect(mislabelled(PURGE_TABLE_RULES)).toEqual([]);
    // CONTROL
    expect(
      mislabelled({ ...PURGE_TABLE_RULES, proj_tickets: { rule: 'not-entity-bearing', why: 'planted' } }),
    ).toEqual(['proj_tickets']);
  });
});

describe('27.026 typed links have an erase rule at both ends', () => {
  it('27.026 proj_ticket_links is erased by workspace_id, source_id and target_id, and a workspace purge takes it', () => {
    expect(PURGE_TABLE_RULES['proj_ticket_links']).toMatchObject({ rule: 'erase', by: ['workspace_id', 'source_id', 'target_id'] });
    expect(workspaceScopedTables()).toContain('proj_ticket_links');
    // The migrated table carries every column the rule names (19.082's comparator, on this one rule).
    expect(unknownColumns({ proj_ticket_links: PURGE_TABLE_RULES['proj_ticket_links']! })).toEqual([]);
    // CONTROL: the same comparator names a by-column the table does not have.
    expect(unknownColumns({ proj_ticket_links: { rule: 'erase', by: ['ticket_id'], why: 'planted' } })).toEqual(['proj_ticket_links.ticket_id']);
  });
});
