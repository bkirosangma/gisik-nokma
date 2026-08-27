import { describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { ULID_REGEX } from '@gisik-nokma/domain';
import { insertEvent } from '../src/ledger/event-store.js';
import { buildProjectionRegistry } from '../src/projections/index.js';
import { rebuildProjection } from '../src/projections/rebuild.js';
import {
  FIXTURE_ACTOR,
  FIXTURE_EVENTS,
  FIXTURE_WORKSPACE_A,
  FIXTURE_WORKSPACE_B,
  FIXTURE_WORKSPACE_C,
} from './fixtures/ledger-fixture.js';
import { createTestDatabase } from './helpers/db.js';

async function insertFixture(pool: Pool, events: typeof FIXTURE_EVENTS): Promise<void> {
  const client = await pool.connect();
  try {
    for (const event of events) {
      await insertEvent(client, event);
    }
  } finally {
    client.release();
  }
}

async function rebuildAndDump(pool: Pool): Promise<string> {
  await rebuildProjection('proj_entity_heads', { pool, projections: buildProjectionRegistry() });
  const result = await pool.query<{ row: string }>(
    `SELECT row_to_json(h)::text AS row FROM proj_entity_heads h ORDER BY h.entity_kind, h.entity_id`,
  );
  return result.rows.map((entry) => entry.row).join('\n');
}

describe('determinism (the rebuild-and-diff discipline, spec §3)', () => {
  it('every hand-built fixture id is a real ULID — a bad literal fails here, not in a mystery downstream', () => {
    const ids = [
      FIXTURE_WORKSPACE_A,
      FIXTURE_WORKSPACE_B,
      FIXTURE_WORKSPACE_C,
      FIXTURE_ACTOR,
      ...FIXTURE_EVENTS.map((event) => event.id),
      ...FIXTURE_EVENTS.map((event) => event.workspaceId),
    ];
    for (const id of ids) {
      expect(id, `not a valid ULID literal: ${id}`).toMatch(ULID_REGEX);
    }
  });

  it('replaying the fixture ledger twice yields byte-identical projection rows, with the expected heads', async () => {
    const db = await createTestDatabase();
    try {
      await insertFixture(db.pool, FIXTURE_EVENTS);
      const first = await rebuildAndDump(db.pool);
      const second = await rebuildAndDump(db.pool);
      expect(second).toBe(first);

      // Golden check: identical twice is not enough — it must also be RIGHT.
      const rows = first.split('\n').map((line) => JSON.parse(line) as { entity_id: string; head_seq: number; head_event_type: string });
      expect(rows.map((row) => [row.entity_id, row.head_seq, row.head_event_type])).toEqual([
        [FIXTURE_WORKSPACE_A, 4, 'workspace.renamed'],
        [FIXTURE_WORKSPACE_B, 3, 'workspace.renamed'],
        [FIXTURE_WORKSPACE_C, 3, 'workspace.renamed'],
      ]);
    } finally {
      await db.drop();
    }
  });

  it('arrival order changes nothing: a reversed-arrival ledger derives the same bytes', async () => {
    const inOrder = await createTestDatabase();
    const reversed = await createTestDatabase();
    try {
      await insertFixture(inOrder.pool, FIXTURE_EVENTS);
      await insertFixture(reversed.pool, [...FIXTURE_EVENTS].reverse());
      const dumpInOrder = await rebuildAndDump(inOrder.pool);
      const dumpReversed = await rebuildAndDump(reversed.pool);
      expect(dumpReversed).toBe(dumpInOrder);
    } finally {
      await inOrder.drop();
      await reversed.drop();
    }
  });
});
