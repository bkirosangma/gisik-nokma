/**
 * Typed links T2 (planner addendum, 2026-10-04): the graph's ring read runs on the MIGRATED link and reference tables.
 * Case 27.028 (`test-cases/27-knowledge-graph.md` §27.1).
 *
 * The deleted shim (`test/graph/shim.ts`) created `proj_ticket_links` and `proj_references` with `IF NOT EXISTS`. Against
 * a migrated database it is a no-op, so restoring it changes no runtime result, and it would MASK a missing or renamed
 * migration (the read would pass against the shim's copy of the DDL). No database assertion can see it; this scan can.
 * DB-free, so it cannot be skipped when Postgres is down.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const MIGRATIONS_DIR = fileURLToPath(new URL('../../migrations', import.meta.url));
const TEST_DIR = fileURLToPath(new URL('..', import.meta.url));
/** This file plants the shim's DDL as its control, so the scan skips it (and only it). */
const SELF = fileURLToPath(import.meta.url);

function filesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : filesUnder(path);
    return entry.name.endsWith('.ts') ? [path] : [];
  });
}

/** Every table a migration creates (unqualified names; `CREATE TABLE IF NOT EXISTS` included). */
function migrationTables(): Set<string> {
  const names = new Set<string>();
  for (const file of readdirSync(MIGRATIONS_DIR).filter((name) => name.endsWith('.sql'))) {
    for (const m of readFileSync(join(MIGRATIONS_DIR, file), 'utf8').matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?"?([a-z_][a-z0-9_]*)"?\s*\(/gi)) {
      names.add(m[1]!.toLowerCase());
    }
  }
  return names;
}

/** `file: table` for every unqualified CREATE TABLE of a migration-owned table in `sources`. */
function testCreations(sources: ReadonlyArray<{ file: string; text: string }>, owned: ReadonlySet<string>): string[] {
  const found: string[] = [];
  for (const { file, text } of sources) {
    for (const m of text.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?"?([a-z_][a-z0-9_]*)"?\s*\(/gi)) {
      const table = m[1]!.toLowerCase();
      if (owned.has(table)) found.push(`${file}: ${table}`);
    }
  }
  return found.sort();
}

describe('27.028 the graph read runs on the migrated link and reference tables', () => {
  it('27.028 no test file creates a table a migration owns (the shim stays gone); control: the old shim text is reported', () => {
    const owned = migrationTables();
    // The haystack holds its subjects: both tables the ring read selects from are migration-owned.
    expect(owned.has('proj_ticket_links')).toBe(true);
    expect(owned.has('proj_references')).toBe(true);
    const sources = filesUnder(TEST_DIR).filter((file) => file !== SELF).map((file) => ({ file: file.slice(TEST_DIR.length), text: readFileSync(file, 'utf8') }));
    expect(sources.length).toBeGreaterThan(100);
    expect(testCreations(sources, owned)).toEqual([]);
    // CONTROL: the deleted shim's DDL, planted as a test file, is named (both tables), and a non-migration table is not.
    const planted = [
      'CREATE TABLE IF NOT EXISTS proj_ticket_links (',
      '  workspace_id text NOT NULL',
      ');',
      'CREATE TABLE IF NOT EXISTS proj_references (workspace_id text NOT NULL);',
      'CREATE TABLE gate_marker (event_id text PRIMARY KEY)',
    ].join('\n');
    expect(testCreations([{ file: 'graph/shim.ts', text: planted }], owned)).toEqual(['graph/shim.ts: proj_references', 'graph/shim.ts: proj_ticket_links']);
  });
});
