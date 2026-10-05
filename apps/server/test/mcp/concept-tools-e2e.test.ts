import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { allTools } from '@gisik-nokma/mcp-server';
import { newUlid, type LedgerEvent, type Ulid } from '@gisik-nokma/domain';
import { hostedSession } from '../../src/mcp/in-process-fetch.js';
import { buildTestApp } from '../helpers/app.js';
import { applyCommitted, makeCommitted } from '../helpers/apply.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { NOTES_USERS, seedNotesFixture, type NotesFixture, type NotesUser } from '../helpers/notes-fixture.js';
import { signInWithPhone } from '../helpers/session.js';

/**
 * Knowledge Graph spec D §5.2, KG-D Task 4: the MCP concept tools against the REAL server, through an in-process
 * Session (`hostedSession`, the hosted door's transport, as `in-process-fetch.test.ts` 14.253 drives `create_ticket`):
 * the real routes, the real door, the real ledger. Cases 27.480 (Review Focus 5) and 27.481 (the planner's R1
 * ruling, 2026-10-05, through the door that enforces it).
 *
 * The world is `seedNotesFixture` around seven signed-in people (`test/concepts/reads.test.ts` says why). CW tags
 * nWorkspace, which the owner, admin, `memberIn`, `memberOut` and `author` read; CE tags TE (explicit
 * `[guestListed]`). TL is a test-local ticket explicit `[owner, memberIn]`, so adding it to CW narrows 5 → 2 (Rule A,
 * planner ruling 2026-10-04, report Q1: the plan's TP narrows nothing on the ref, since every member reads it).
 * Everything is seeded with `applyCommitted` BEFORE the first tool write: a door write takes the ledger's next seqs.
 */
let db: TestDatabase;
let app: FastifyInstance;
let world: NotesFixture;
const tokens = {} as Record<NotesUser, string>;
const CW = newUlid();
const CE = newUlid();
const TL = newUlid();
const C1 = newUlid();
const D1 = newUlid();
let LA: string;
let LB: string;
const OUTER = { ip: '127.0.0.1', xff: undefined };

function cev(conceptId: string, type: string, payload: Record<string, unknown>): LedgerEvent {
  return makeCommitted({ workspaceId: world.WS, actorId: world.ids.owner, entity: { kind: 'concept', id: conceptId }, type, payload });
}
function toolsOf(who: NotesUser) {
  const session = hostedSession(app, OUTER, tokens[who], world.ids[who]);
  return async (name: string, args: Record<string, unknown>): Promise<unknown> => {
    await session.ready();
    const tool = allTools(session).find((t) => t.name === name);
    if (tool === undefined) throw new Error(`no tool ${name}`);
    return tool.handler(args);
  };
}
const itemsOf = async (conceptId: string) =>
  (
    await db.pool.query<{ item_kind: string; item_id: string; tagged_by: string; origin: string }>(
      'SELECT item_kind, item_id, tagged_by, origin FROM proj_concept_items WHERE concept_id = $1 ORDER BY item_kind, item_id',
      [conceptId],
    )
  ).rows;

beforeAll(async () => {
  db = await createTestDatabase();
  const built = buildTestApp(db);
  app = built.app;
  await app.ready();
  const ids = {} as Record<NotesUser, string>;
  for (const [index, who] of NOTES_USERS.entries()) {
    const user = await signInWithPhone(app, built.otp, `+911100048${String(500 + index)}`);
    ids[who] = user.userId;
    tokens[who] = user.token;
  }
  world = await seedNotesFixture(db.pool, ids);
  [LA, LB] = [newUlid(), newUlid()].sort() as [Ulid, Ulid];
  const owner = { workspaceId: world.WS, actorId: world.ids.owner };
  await applyCommitted(db.pool, [
    cev(CW, 'concept.created', { name: 'Workspace notes' }),
    cev(CW, 'concept.item_tagged', { itemKind: 'note', itemId: world.NOTES.nWorkspace }),
    cev(CE, 'concept.created', { name: 'Invoices' }),
    cev(CE, 'concept.item_tagged', { itemKind: 'ticket', itemId: world.TE }),
    makeCommitted({ ...owner, entity: { kind: 'ticket', id: TL }, type: 'ticket.created', payload: { typeId: 'task', projectId: world.P, parentId: null, title: 'Count the float' } }),
    makeCommitted({ ...owner, entity: { kind: 'ticket', id: TL }, type: 'visibility.set', payload: { ticketId: TL, mode: 'explicit', userIds: [world.ids.owner, world.ids.memberIn] } }),
    // 27.481: C1 holds TP and nWorkspace, D1 holds TP; LA < LB, both empty (every member sees them).
    cev(C1, 'concept.created', { name: 'Licence papers' }),
    cev(C1, 'concept.item_tagged', { itemKind: 'ticket', itemId: world.TP }),
    cev(C1, 'concept.item_tagged', { itemKind: 'note', itemId: world.NOTES.nWorkspace }),
    cev(D1, 'concept.created', { name: 'Licences' }),
    cev(D1, 'concept.item_tagged', { itemKind: 'ticket', itemId: world.TP }),
    cev(LA, 'concept.created', { name: 'Shop' }),
    cev(LB, 'concept.created', { name: 'Shelves' }),
  ]);
}, 120_000);
afterAll(async () => {
  await app.close();
  await db.drop();
});

describe('27.480 tag_items through the real server (Review Focus 5)', () => {
  it('27.480 the first call previews with the route\'s numbers and writes nothing; the confirmed one writes as memberIn over mcp; control: a hidden concept is the one sentence', async () => {
    const call = toolsOf('memberIn');
    const route = await app.inject({
      method: 'GET',
      url: `/v1/workspaces/${world.WS}/concepts/audience?conceptId=${CW}&add=ticket:${TL}`,
      headers: { authorization: `Bearer ${tokens.memberIn}` },
    });
    expect(route.json()).toEqual({ conceptId: CW, members: 7, before: 5, after: 2 });
    const rowsBefore = await itemsOf(CW);
    const preview = await call('tag_items', { conceptId: CW, action: 'add', items: [{ kind: 'ticket', id: TL }] });
    const { members, before, after } = route.json() as { members: number; before: number; after: number };
    expect(preview).toEqual({
      preview: true,
      wouldChange: 'Fewer people will see this concept: 2 of 7 members',
      counts: { members, before, after },
      nothingChanged: true,
      confirm: 'confirm_name must be "Workspace notes"',
    });
    expect(await itemsOf(CW)).toEqual(rowsBefore);

    await call('tag_items', { conceptId: CW, action: 'add', items: [{ kind: 'ticket', id: TL }], confirm_name: 'Workspace notes' });
    expect(await itemsOf(CW)).toEqual([
      ...rowsBefore,
      { item_kind: 'ticket', item_id: TL, tagged_by: world.ids.memberIn, origin: 'mcp' },
    ]);
    // Control: memberOut cannot see TE, so CE is the one sentence, not a body.
    await expect(toolsOf('memberOut')('get_concept', { conceptId: CE })).rejects.toThrowError(/^concept not found or not visible to you$/);
  });
});

describe('27.481 R1 through the real door', () => {
  it('27.481 a merge posts the target\'s missing tag then the merge, and commits both; a related link asked from the higher id lands on the lower id\'s stream', async () => {
    const call = toolsOf('memberIn');
    await call('manage_concept', { action: 'merge', conceptId: C1, intoId: D1, confirm_name: 'Licence papers' });
    expect(await itemsOf(D1)).toEqual([
      { item_kind: 'note', item_id: world.NOTES.nWorkspace, tagged_by: world.ids.memberIn, origin: 'mcp' },
      { item_kind: 'ticket', item_id: world.TP, tagged_by: world.ids.owner, origin: 'web' },
    ]);
    expect(await itemsOf(C1)).toEqual([]);
    const merged = await db.pool.query('SELECT deleted, merged_into FROM proj_concepts WHERE concept_id = $1', [C1]);
    expect(merged.rows).toEqual([{ deleted: true, merged_into: D1 }]);

    await call('link_concepts', { conceptId: LB, otherId: LA, relation: 'related', action: 'add' });
    const links = await db.pool.query('SELECT a, b, relation, linked_by, origin FROM proj_concept_links WHERE a = ANY ($1::text[]) OR b = ANY ($1::text[])', [[LA, LB]]);
    expect(links.rows).toEqual([{ a: LA, b: LB, relation: 'related', linked_by: world.ids.memberIn, origin: 'mcp' }]);
    const written = await db.pool.query<{ entity_id: string; type: string }>(
      `SELECT entity_id, type FROM events WHERE entity_kind = 'concept' AND origin = 'mcp' AND entity_id = ANY ($1::text[]) ORDER BY workspace_seq`,
      [[C1, D1, LA, LB]],
    );
    expect(written.rows).toEqual([
      { entity_id: D1, type: 'concept.item_tagged' },
      { entity_id: C1, type: 'concept.merged' },
      { entity_id: LA, type: 'concept.linked' },
    ]);
  });
});
