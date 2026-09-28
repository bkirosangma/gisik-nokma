import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildProjectionRegistry } from '../../src/projections/index.js';
import { purgeItem, type PurgeDeps } from '../../src/purge/purge-item.js';
import { ticketNumbers } from '../../src/read/ticket-numbers.js';
import { verifyProjections } from '../../src/tools/verify-projections.js';
import { resetEntitySeqs } from '../helpers/apply.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { scan } from './scan.js';
import { buildNoteWorld, buildProjectWorld, buildWorkspacePair, dueAt, recordingStore } from './world.js';

/**
 * Spec §5.2, §5.5 — the other three kinds. Cases 19.120–19.123
 * (`test-cases/19-trash.md` §19.14). 19.123 verifies the WHOLE database, so it
 * runs last and covers every purge above it.
 */

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase();
  resetEntitySeqs();
}, 60_000);

afterAll(async () => {
  await db.drop();
});

function deps(now: Date): PurgeDeps {
  return { projections: buildProjectionRegistry(), store: recordingStore(), now };
}

async function count(sql: string, params: unknown[]): Promise<number> {
  const { rows } = await db.pool.query<{ n: number }>(sql, params);
  return rows[0]?.n ?? 0;
}

describe('19.120 a note purge erases the note, its comments, attachments, search rows, chunks and lexemes', () => {
  it('leaves only the tombstone, head and registry row; X keeps its row', async () => {
    const w = await buildNoteWorld(db.pool);
    const outcome = await purgeItem(db.pool, { kind: 'note', id: w.N }, deps(await dueAt(db.pool, 'note', w.N)));
    expect(outcome.status).toBe('purged');
    expect(await scan(db.pool, [w.N])).toEqual({
      'events.entity_id': 1,
      'proj_entity_heads.entity_id': 1,
      'purged_entities.entity_id': 1,
    });
    expect(await scan(db.pool, [w.marker])).toEqual({});
    // CONTROL
    expect(await count('SELECT count(*)::int AS n FROM proj_tickets WHERE ticket_id = $1', [w.X])).toBe(1);
  });
});

describe('19.121 a project purge erases its tickets, notes, memberships, earlier redactions and preference keys', () => {
  it('leaves only P2’s tombstone, head and six registry rows; Q keeps its keys and numbers; NW survives', async () => {
    const w = await buildProjectWorld(db.pool);
    const q1Before = (await ticketNumbers(db.pool, w.WS, [w.Q1])).get(w.Q1);
    expect((await purgeItem(db.pool, { kind: 'ticket', id: w.B2 }, deps(await dueAt(db.pool, 'ticket', w.B2)))).status).toBe(
      'purged',
    );
    const outcome = await purgeItem(db.pool, { kind: 'project', id: w.P2 }, deps(await dueAt(db.pool, 'project', w.P2)));
    expect(outcome.status).toBe('purged');
    expect(await scan(db.pool, [w.P2, w.A, w.A1, w.B, w.B2, w.NP])).toEqual({
      'events.entity_id': 1,
      'proj_entity_heads.entity_id': 1,
      'purged_entities.entity_id': 6,
    });
    expect(await scan(db.pool, [w.marker])).toEqual({});
    const prefs = await db.pool.query<{ doc: unknown }>(
      'SELECT doc FROM user_preferences WHERE user_id = $1 AND workspace_id = $2',
      [w.OWNER, w.WS],
    );
    expect(prefs.rows[0]?.doc).toEqual({ savedFilters: [], listColumns: { [w.Q]: ['title'] }, grouping: { [w.Q]: 'epic' } });
    // CONTROL — the sibling project's key and the workspace note are untouched.
    expect((await ticketNumbers(db.pool, w.WS, [w.Q1])).get(w.Q1)).toBe(q1Before);
    expect(await count('SELECT count(*)::int AS n FROM proj_notes WHERE note_id = $1', [w.NW])).toBe(1);
  });
});

describe('19.122 a workspace purge erases W1 and leaves W2 alone, though one user belongs to both', () => {
  it('leaves only W1’s tombstone and head; W2’s memberships, preferences, notifications and events are unchanged', async () => {
    const pair = await buildWorkspacePair(db.pool);
    const w2 = async () => ({
      memberships: await count('SELECT count(*)::int AS n FROM proj_memberships WHERE workspace_id = $1', [pair.W2.WS]),
      preferences: await count('SELECT count(*)::int AS n FROM user_preferences WHERE workspace_id = $1', [pair.W2.WS]),
      notifications: await count('SELECT count(*)::int AS n FROM notifications WHERE workspace_id = $1', [pair.W2.WS]),
      events: await count('SELECT count(*)::int AS n FROM events WHERE workspace_id = $1', [pair.W2.WS]),
    });
    const before = await w2();
    expect(before.preferences).toBe(1);
    const outcome = await purgeItem(
      db.pool,
      { kind: 'workspace', id: pair.W1.WS },
      deps(await dueAt(db.pool, 'workspace', pair.W1.WS)),
    );
    expect(outcome.status).toBe('purged');
    const registry = await count('SELECT count(*)::int AS n FROM purged_entities WHERE workspace_id = $1', [pair.W1.WS]);
    expect(registry).toBe(outcome.status === 'purged' ? outcome.erased : -1);
    // The registry holds W1's id by design (its workspace_id, and membership
    // entity ids `<W1>:<user>`); asserted above, then set aside.
    const hits = await scan(db.pool, [pair.W1.WS]);
    delete hits['purged_entities.workspace_id'];
    delete hits['purged_entities.entity_id'];
    expect(hits).toEqual({
      'events.workspace_id': 1,
      'events.entity_id': 1,
      'proj_entity_heads.workspace_id': 1,
      'proj_entity_heads.entity_id': 1,
    });
    expect(await scan(db.pool, [pair.marker])).toEqual({});
    expect(await count('SELECT count(*)::int AS n FROM invite_tokens WHERE invite_id = $1', [pair.INV])).toBe(0);
    // CONTROL — W2, the shared user's other workspace, is exactly as it was.
    expect(await w2()).toEqual(before);
  });
});

describe('19.123 the workspace tombstone lands at the captured position; everything verifies clean', () => {
  it('leaves exactly one event in W1’s stream, at old max + 1, and verifyProjections is clean', async () => {
    const pair = await buildWorkspacePair(db.pool);
    const maxWs = await count('SELECT max(workspace_seq)::int AS n FROM events WHERE workspace_id = $1', [pair.W1.WS]);
    const markedAt = (
      await db.pool.query<{ at: Date }>('SELECT purge_marked_at AS at FROM proj_workspaces WHERE workspace_id = $1', [
        pair.W1.WS,
      ])
    ).rows[0]!.at.toISOString();
    await purgeItem(db.pool, { kind: 'workspace', id: pair.W1.WS }, deps(await dueAt(db.pool, 'workspace', pair.W1.WS)));
    const stream = await db.pool.query(
      `SELECT type, entity_kind, entity_id, workspace_seq::int AS workspace_seq, payload FROM events WHERE workspace_id = $1`,
      [pair.W1.WS],
    );
    expect(stream.rows).toEqual([
      {
        type: 'purge.completed',
        entity_kind: 'workspace',
        entity_id: pair.W1.WS,
        workspace_seq: maxWs + 1,
        payload: { kind: 'workspace', markedBy: pair.U, markedAt },
      },
    ]);
    for (const table of ['proj_notes', 'proj_projects']) {
      expect(await count(`SELECT count(*)::int AS n FROM ${table}`, []), `${table} is empty`).toBeGreaterThan(0);
    } // CONTROL
    expect(await verifyProjections({ pool: db.pool, projections: buildProjectionRegistry() })).toEqual({
      clean: true,
      diffs: [],
    });
  });
});
