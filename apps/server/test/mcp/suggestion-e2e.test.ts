import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { allTools } from '@gisik-nokma/mcp-server';
import { newUlid } from '@gisik-nokma/domain';
import { hostedSession } from '../../src/mcp/in-process-fetch.js';
import { runSuggestionJob } from '../../src/semantic/suggestion-job.js';
import { itemHash, itemKey, parseItemKey, signatureOf } from '../../src/semantic/signature.js';
import { buildTestApp } from '../helpers/app.js';
import { applyCommitted, makeCommitted } from '../helpers/apply.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { NOTES_USERS, seedNotesFixture, type NotesFixture, type NotesUser } from '../helpers/notes-fixture.js';
import { signInWithPhone } from '../helpers/session.js';

/**
 * Knowledge Graph spec D §4.3 through MCP, KG-D Task 5, case 27.499 (`test-cases/27-knowledge-graph.md` §27.D): a
 * suggestion the JOB wrote, accepted by `resolve_suggestion` through the real server (`hostedSession`, as 27.480's
 * `concept-tools-e2e.test.ts`), then the job re-run. A row inserted straight into `sem_suggestions` would have no
 * vectors behind it, so the re-run leg could not fail; here TP, a second project ticket TP2 and nProject carry
 * IDENTICAL vectors and share one partition (`p:<P>`), which `memberIn` reads in full.
 *
 * 27.550's MCP half (task kg-sl6-suggested-arm, planner 12:42): `review_suggestions` no longer offers a suggestion once it
 * is rejected or accepted, before any job re-run, and `resolve_suggestion` answers it as it answers a made-up id.
 */
let db: TestDatabase;
let app: FastifyInstance;
let world: NotesFixture;
const tokens = {} as Record<NotesUser, string>;
const TP2 = newUlid();
const OUTER = { ip: '127.0.0.1', xff: undefined };
const VECTOR = `[${new Array(512).fill(0).map((_, i) => (i === 0 ? 1 : 0)).join(',')}]`;

function toolsOf(who: NotesUser) {
  const session = hostedSession(app, OUTER, tokens[who], world.ids[who]);
  return async (name: string, args: Record<string, unknown>): Promise<unknown> => {
    await session.ready();
    const tool = allTools(session).find((t) => t.name === name);
    if (tool === undefined) throw new Error(`no tool ${name}`);
    return tool.handler(args);
  };
}
const suggestionRows = async () =>
  (await db.pool.query<{ id: string; signature: string }>('SELECT id, signature FROM sem_suggestions WHERE workspace_id = $1', [world.WS])).rows;

beforeAll(async () => {
  db = await createTestDatabase();
  const built = buildTestApp(db);
  app = built.app;
  await app.ready();
  const ids = {} as Record<NotesUser, string>;
  for (const [index, who] of NOTES_USERS.entries()) {
    const user = await signInWithPhone(app, built.otp, `+911100049${String(900 + index)}`);
    ids[who] = user.userId;
    tokens[who] = user.token;
  }
  world = await seedNotesFixture(db.pool, ids);
  await applyCommitted(db.pool, [
    makeCommitted({
      workspaceId: world.WS,
      actorId: world.ids.owner,
      entity: { kind: 'ticket', id: TP2 },
      type: 'ticket.created',
      payload: { typeId: 'task', projectId: world.P, parentId: null, title: 'File the licence renewal' },
    }),
  ]);
  for (const ticketId of [world.TP, TP2]) {
    await db.pool.query(
      `INSERT INTO search_item_chunks (item_kind, item_id, chunk_index, workspace_id, ticket_id, heading_path, chunk_text, model, source_hash, embedding)
       VALUES ('ticket', $1, 0, $2, $1, '', 'licence renewal fee', 'test', 'h', $3::vector)`,
      [ticketId, world.WS, VECTOR],
    );
  }
  await db.pool.query(
    `INSERT INTO search_note_chunks (note_id, chunk_index, workspace_id, heading_path, chunk_text, model, source_seq, embedding)
     VALUES ($1, 0, $2, '', 'licence renewal fee', 'test', 1, $3::vector)`,
    [world.NOTES.nProject, world.WS, VECTOR],
  );
}, 120_000);
afterAll(async () => {
  await app.close();
  await db.drop();
});

describe('27.499 a job suggestion accepted through MCP', () => {
  it('27.499 the job writes the one suggestion, memberIn accepts it over mcp as one concept from it, and the re-run writes it no more', async () => {
    await runSuggestionJob(db.pool, world.WS);
    const signature = signatureOf([`note:${world.NOTES.nProject}`, `ticket:${world.TP}`, `ticket:${TP2}`]);
    const [row, ...extra] = await suggestionRows();
    expect(extra).toEqual([]);
    expect(row?.signature).toBe(signature);
    const suggestionId = (row as { id: string }).id;

    const call = toolsOf('memberIn');
    const listed = (await call('review_suggestions', { workspaceId: world.WS })) as { suggestions: Array<{ id: string }> };
    expect(listed.suggestions.map((s) => s.id)).toEqual([suggestionId]);
    await call('resolve_suggestion', { workspaceId: world.WS, suggestionId, action: 'accept', name: 'Licence renewal' });

    const concepts = await db.pool.query<{ concept_id: string; name: string; from_suggestion: string | null; created_by: string; origin: string }>(
      'SELECT concept_id, name, from_suggestion, created_by, origin FROM proj_concepts WHERE workspace_id = $1',
      [world.WS],
    );
    expect(concepts.rows.map(({ concept_id: _, ...rest }) => rest)).toEqual([
      { name: 'Licence renewal', from_suggestion: suggestionId, created_by: world.ids.memberIn, origin: 'mcp' },
    ]);
    const items = await db.pool.query<{ item_kind: string; item_id: string; tagged_by: string; origin: string }>(
      'SELECT item_kind, item_id, tagged_by, origin FROM proj_concept_items WHERE concept_id = $1 ORDER BY item_kind, item_id',
      [concepts.rows[0]?.concept_id],
    );
    expect(items.rows).toEqual([
      { item_kind: 'note', item_id: world.NOTES.nProject, tagged_by: world.ids.memberIn, origin: 'mcp' },
      ...[world.TP, TP2].sort().map((id) => ({ item_kind: 'ticket', item_id: id, tagged_by: world.ids.memberIn, origin: 'mcp' })),
    ]);

    // Every item is now tagged (≥ 50%), so the re-run writes no suggestion and drops the stale row.
    await runSuggestionJob(db.pool, world.WS);
    expect(await suggestionRows()).toEqual([]);
  });
});

describe('27.550 through MCP, a resolved suggestion is offered no more', () => {
  it('27.550 review_suggestions drops a rejected and an accepted suggestion before any re-run, and resolve_suggestion answers either as it answers a made-up id; control: both are offered first', async () => {
    const write = async (id: string, keys: string[], score: number) => {
      const sorted = [...keys].sort();
      const refs = sorted.map(parseItemKey);
      await db.pool.query(
        `INSERT INTO sem_suggestions (id, workspace_id, signature, partition_key, item_kind, item_id, item_hashes, terms, label, score, computed_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())`,
        [id, world.WS, signatureOf(sorted), `p:${world.P}`, refs.map((r) => r.kind), refs.map((r) => r.id), sorted.map(itemHash), ['licence'], 'licence', score],
      );
    };
    const [SJ, SK] = [newUlid(), newUlid()];
    await write(SJ, [itemKey('ticket', world.TP), itemKey('ticket', TP2), itemKey('note', world.NOTES.nWorkspace)], 0.9);
    await write(SK, [itemKey('ticket', TP2), itemKey('note', world.NOTES.nProject), itemKey('note', world.NOTES.nWorkspace)], 0.8);
    const call = toolsOf('memberIn');
    const offered = async () => ((await call('review_suggestions', { workspaceId: world.WS })) as { suggestions: Array<{ id: string }> }).suggestions.map((s) => s.id);
    const refusal = async (suggestionId: string, action: 'accept' | 'reject') =>
      call('resolve_suggestion', { workspaceId: world.WS, suggestionId, action, name: 'Again' }).then(() => 'resolved', (error: unknown) => String(error));
    const madeUp = await refusal(newUlid(), 'accept');
    expect(madeUp).toBe('Error: suggestion not found or not visible to you');

    expect(await offered(), 'control: both are offered').toEqual([SJ, SK]);
    await call('resolve_suggestion', { workspaceId: world.WS, suggestionId: SJ, action: 'reject' });
    expect(await offered()).toEqual([SK]);
    expect(await refusal(SJ, 'reject')).toBe(madeUp);
    expect(await refusal(SJ, 'accept')).toBe(madeUp);

    await call('resolve_suggestion', { workspaceId: world.WS, suggestionId: SK, action: 'accept', name: 'Licence frames' });
    expect(await offered()).toEqual([]);
    expect(await refusal(SK, 'accept')).toBe(madeUp);
    const fromSk = await db.pool.query('SELECT 1 FROM proj_concepts WHERE workspace_id = $1 AND from_suggestion = $2', [world.WS, SK]);
    expect(fromSk.rowCount, 'one suggestion, one concept').toBe(1);
    // Neither row has been dropped: only the read leaves them out.
    expect((await suggestionRows()).map((row) => row.id).sort()).toEqual([SJ, SK].sort());
  });
});
