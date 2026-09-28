import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid } from '@gisik-nokma/domain';
import { buildProjectionRegistry } from '../../src/projections/index.js';
import { purgeItem, type PurgeDeps } from '../../src/purge/purge-item.js';
import { startEmbedWorker } from '../../src/search/embed-worker.js';
import { verifyProjections } from '../../src/tools/verify-projections.js';
import { applyCommitted, resetEntitySeqs } from '../helpers/apply.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { scan } from './scan.js';
import {
  buildProjectWorld,
  buildReferenceWorld,
  dueAt,
  ev,
  projectCreated,
  recordingStore,
  seedWorkspace,
  ticketCreated,
} from './world.js';

/**
 * Spec §5.6 (T5) and owner ruling 2026-09-28 (A) — survivors. Cases
 * 19.130–19.136 (`test-cases/19-trash.md` §19.15). Every world is its own
 * workspace in one shared database; each `verifyProjections` covers all.
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

async function clean(): Promise<void> {
  expect(await verifyProjections({ pool: db.pool, projections: buildProjectionRegistry() })).toEqual({
    clean: true,
    diffs: [],
  });
}

describe('19.130 a surviving ticket that chips the purged one stops matching its title', () => {
  it('matches T’s title before, not after; matches "deleted item"; verifies clean', async () => {
    const w = await buildReferenceWorld(db.pool);
    const matches = (query: string) =>
      count(
        `SELECT count(*)::int AS n FROM proj_search WHERE ticket_id = $1 AND tsv @@ plainto_tsquery('simple', $2)`,
        [w.S1, query],
      );
    expect(await matches(w.marker)).toBe(1); // CONTROL
    await purgeItem(db.pool, { kind: 'ticket', id: w.T }, deps(await dueAt(db.pool, 'ticket', w.T)));
    expect(await matches(w.marker)).toBe(0);
    expect(await matches('deleted item')).toBe(1);
    const { rows } = await db.pool.query<{ comments: string }>('SELECT comments FROM proj_search WHERE ticket_id = $1', [
      w.S1,
    ]);
    expect(rows[0]?.comments).toBe('see Deleted item');
    await clean();
  });
});

describe('19.131 surviving notes are detached; an inherit note stays inherit; the replay does not throw', () => {
  it('removes both attachment rows, keeps N2 inherit, and verifies clean', async () => {
    const w = await buildReferenceWorld(db.pool);
    const attached = () =>
      count('SELECT count(*)::int AS n FROM proj_note_attachments WHERE note_id = ANY($1::text[])', [[w.N1, w.N2]]);
    expect(await attached()).toBe(2); // CONTROL
    const outcome = await purgeItem(db.pool, { kind: 'ticket', id: w.T }, deps(await dueAt(db.pool, 'ticket', w.T)));
    expect(outcome.status).toBe('purged');
    expect(await attached()).toBe(0);
    const scopes = await db.pool.query<{ note_id: string; scope_mode: string }>(
      'SELECT note_id, scope_mode FROM proj_notes WHERE note_id = ANY($1::text[]) ORDER BY note_id',
      [[w.N1, w.N2]],
    );
    expect(Object.fromEntries(scopes.rows.map((row) => [row.note_id, row.scope_mode]))).toEqual({
      [w.N1]: 'workspace',
      [w.N2]: 'inherit',
    });
    await clean();
  });
});

describe('19.132 a surviving note that chips T is re-indexed, its lexemes and chunks follow', () => {
  it('renders deleted item, drops T’s words from the vocabulary, deletes its chunks, keeps NU’s', async () => {
    const w = await buildReferenceWorld(db.pool);
    await purgeItem(db.pool, { kind: 'ticket', id: w.T }, deps(await dueAt(db.pool, 'ticket', w.T)));
    const { rows } = await db.pool.query<{ body_text: string }>(
      'SELECT body_text FROM proj_note_search WHERE note_id = $1',
      [w.N1],
    );
    expect(rows[0]?.body_text).toBe('about deleted item');
    const lexemes = await db.pool.query<{ lexeme: string }>(
      'SELECT lexeme FROM proj_note_lexemes WHERE workspace_id = $1',
      [w.WS],
    );
    const words = lexemes.rows.map((row) => row.lexeme);
    expect(words).toContain('deleted');
    expect(words).not.toContain(w.marker);
    expect(await count('SELECT count(*)::int AS n FROM search_note_chunks WHERE note_id = $1', [w.N1])).toBe(0);
    // CONTROL
    expect(await count('SELECT count(*)::int AS n FROM search_note_chunks WHERE note_id = $1', [w.NU])).toBe(1);
  });
});

describe('19.133 the embed worker re-chunks the survivor with Deleted item', () => {
  it('writes N1’s chunk without T’s title, and leaves NU’s current chunk alone', async () => {
    const w = await buildReferenceWorld(db.pool);
    await purgeItem(db.pool, { kind: 'ticket', id: w.T }, deps(await dueAt(db.pool, 'ticket', w.T)));
    const worker = startEmbedWorker(db.pool, {
      intervalMs: 3_600_000,
      embedTexts: async (texts) => texts.map(() => new Float32Array(512).fill(0.5)),
      model: 'test-model@1',
    });
    try {
      for (let pass = 0; pass < 50 && (await worker.runOnce()) > 0; pass += 1) {
        // drain: every note in the database lacking a current chunk is embedded
      }
    } finally {
      worker.stop();
    }
    const n1 = await db.pool.query<{ chunk_text: string }>('SELECT chunk_text FROM search_note_chunks WHERE note_id = $1', [
      w.N1,
    ]);
    expect(n1.rows.map((row) => row.chunk_text)).toEqual(['about Deleted item']);
    // CONTROL
    const nu = await db.pool.query<{ chunk_text: string }>('SELECT chunk_text FROM search_note_chunks WHERE note_id = $1', [
      w.NU,
    ]);
    expect(nu.rows.map((row) => row.chunk_text)).toEqual(['nothing to see']);
  });
});

describe('19.134 the erasure proof, with ruling A’s allowlist', () => {
  it('finds the erased ids and content only where a surviving document quotes them', async () => {
    const w = await buildReferenceWorld(db.pool);
    const before = await scan(db.pool, [w.marker]);
    expect(Object.keys(before)).toEqual(
      expect.arrayContaining([
        'proj_search.comments',
        'proj_note_search.body_text',
        'proj_note_lexemes.lexeme',
        'search_note_chunks.chunk_text',
      ]),
    ); // CONTROL
    await purgeItem(db.pool, { kind: 'ticket', id: w.T }, deps(await dueAt(db.pool, 'ticket', w.T)));
    expect(await scan(db.pool, [w.T, w.C])).toEqual({
      'events.entity_id': 3,
      'events.payload': 4,
      'proj_entity_heads.entity_id': 2,
      'purged_entities.entity_id': 2,
      'proj_ticket_comments.body': 1,
      'proj_notes.body': 1,
    });
    expect(await scan(db.pool, [w.marker])).toEqual({
      'events.payload': 2,
      'proj_ticket_comments.body': 1,
      'proj_notes.body': 1,
    });
    await clean();
  });
});

describe('19.135 a project purge drops the project from a pending invite', () => {
  it('keeps [Q] of [Q, P2], keeps the invite pending, and verifies clean', async () => {
    const w = await buildProjectWorld(db.pool);
    const INV = newUlid();
    await applyCommitted(db.pool, [
      ev(w, 'invite', INV, 'invite.sent', {
        inviteId: INV,
        address: 'guest@example.com',
        channel: 'email',
        role: 'member',
        projectIds: [w.Q, w.P2],
      }),
    ]);
    await purgeItem(db.pool, { kind: 'project', id: w.P2 }, deps(await dueAt(db.pool, 'project', w.P2)));
    const { rows } = await db.pool.query<{ project_ids: string[]; status: string }>(
      'SELECT project_ids, status FROM proj_invites WHERE invite_id = $1',
      [INV],
    );
    expect(rows[0]?.project_ids).toEqual([w.Q]);
    expect(rows[0]?.status).toBe('pending'); // CONTROL
    await clean();
  });
});

describe('19.136 a surviving parent keeps its rollup', () => {
  it('counts one live child before and after purging the deleted one; verifies clean', async () => {
    const base = await seedWorkspace(db.pool);
    const [P, Q0, K1, K2] = [newUlid(), newUlid(), newUlid(), newUlid()];
    await applyCommitted(db.pool, [
      projectCreated(base, P, 'Rollups', 'RL'),
      ticketCreated(base, Q0, P, 'Parent'),
      ticketCreated(base, K1, P, 'Doomed child', Q0),
      ticketCreated(base, K2, P, 'Kept child', Q0),
      ev(base, 'ticket', K1, 'ticket.deleted', {}),
      ev(base, 'ticket', K1, 'purge.marked', {}),
    ]);
    const total = () => count('SELECT total_children AS n FROM proj_rollups WHERE parent_ticket_id = $1', [Q0]);
    expect(await total()).toBe(1); // CONTROL
    await purgeItem(db.pool, { kind: 'ticket', id: K1 }, deps(await dueAt(db.pool, 'ticket', K1)));
    expect(await total()).toBe(1);
    await clean();
  });
});
