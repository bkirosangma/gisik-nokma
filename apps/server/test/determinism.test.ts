import { describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { ULID_REGEX } from '@gisik-nokma/domain';
import { insertEvent } from '../src/ledger/event-store.js';
import { buildProjectionRegistry } from '../src/projections/index.js';
import { rebuildProjection } from '../src/projections/rebuild.js';
import {
  FIXTURE_ACTOR,
  FIXTURE_EVENTS,
  FIXTURE_TICKET,
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
      FIXTURE_TICKET,
      ...FIXTURE_EVENTS.map((event) => event.id),
      ...FIXTURE_EVENTS.map((event) => event.workspaceId),
      ...FIXTURE_EVENTS.map((event) => event.entity.id),
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
      // Every column of every row, by toEqual: a partial pin left workspace_id
      // (the tenant boundary) and head_server_time (client clock vs server
      // clock) unwatched, and a later-added column unwatched with them.
      // head_server_time is a timestamptz rendered by row_to_json in the
      // session timezone — Asia/Kolkata, so 09:01:ssZ prints as 14:31:ss+05:30.
      // The +05:30 offsets are also what tells serverTime apart from the
      // fixture's clientTime, which is a minute earlier at 09:00:ss.
      const rows = first.split('\n').map((line) => JSON.parse(line) as Record<string, unknown>);
      expect(rows).toEqual([
        {
          entity_kind: 'ticket',
          entity_id: FIXTURE_TICKET,
          workspace_id: FIXTURE_WORKSPACE_A,
          head_seq: 1,
          head_event_id: '01J6000000000000000000EV11',
          head_event_type: 'ticket.created',
          head_server_time: '2026-08-20T14:31:11+05:30',
        },
        {
          entity_kind: 'workspace',
          entity_id: FIXTURE_WORKSPACE_A,
          workspace_id: FIXTURE_WORKSPACE_A,
          head_seq: 4,
          head_event_id: '01J6000000000000000000EV04',
          head_event_type: 'workspace.renamed',
          head_server_time: '2026-08-20T14:31:04+05:30',
        },
        {
          entity_kind: 'workspace',
          entity_id: FIXTURE_WORKSPACE_B,
          workspace_id: FIXTURE_WORKSPACE_B,
          head_seq: 3,
          head_event_id: '01J6000000000000000000EV07',
          head_event_type: 'workspace.renamed',
          head_server_time: '2026-08-20T14:31:07+05:30',
        },
        {
          entity_kind: 'workspace',
          entity_id: FIXTURE_WORKSPACE_C,
          workspace_id: FIXTURE_WORKSPACE_C,
          head_seq: 3,
          head_event_id: '01J6000000000000000000EV10',
          head_event_type: 'workspace.renamed',
          head_server_time: '2026-08-20T14:31:10+05:30',
        },
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
