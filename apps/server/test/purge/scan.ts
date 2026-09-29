import type { Pool } from 'pg';

/**
 * The erasure proof's instrument (spec §8: "no row in any table carries an id
 * from the erasure set"). Every text, varchar, jsonb, array and tsvector column
 * of every public base table is cast to text and searched, case-insensitively,
 * for any of `needles`. The column list is read from `information_schema` at
 * call time, so a table added later is scanned without an edit here.
 *
 * Returns `{ 'table.column': rowsMatching }` for every column with at least one
 * match — an exact map the proofs compare with `toEqual`, so an unexpected
 * survivor is a named key, not a count that happens to agree.
 */
const SCANNED_TYPES = new Set(['text', 'character varying', 'jsonb', 'ARRAY', 'tsvector']);

export async function scan(pool: Pool, needles: readonly string[]): Promise<Record<string, number>> {
  const { rows: columns } = await pool.query<{ table_name: string; column_name: string; data_type: string }>(
    `SELECT c.table_name, c.column_name, c.data_type
       FROM information_schema.columns c
       JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name
      WHERE c.table_schema = 'public' AND t.table_type = 'BASE TABLE' AND c.table_name <> 'pgmigrations'
      ORDER BY c.table_name, c.column_name`,
  );
  const patterns = needles.map((needle) => `%${needle}%`);
  const hits: Record<string, number> = {};
  for (const column of columns) {
    if (!SCANNED_TYPES.has(column.data_type)) continue;
    const { rows } = await pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM "${column.table_name}" WHERE "${column.column_name}"::text ILIKE ANY ($1::text[])`,
      [patterns],
    );
    const n = rows[0]?.n ?? 0;
    if (n > 0) hits[`${column.table_name}.${column.column_name}`] = n;
  }
  return hits;
}
