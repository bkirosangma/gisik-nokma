import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { newUlid, type LedgerEvent } from '@gisik-nokma/domain';
import { similarItems } from '../../src/read/item-search.js';
import { READ_NOT_FOUND_BODY, requireMember } from '../../src/read/membership.js';
import { startEmbedWorker } from '../../src/search/embed-worker.js';
import { CURRENT_MODEL, embedTexts } from '../../src/search/embedding.js';
import { applyCommitted, makeCommitted } from '../helpers/apply.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { seedNotesIntoReadWorld, type ReadWorldNotes } from '../helpers/notes-fixture.js';
import { buildReadTestApp, type ReadRole, type ReadWorld } from '../helpers/read-app.js';

/**
 * Knowledge Graph spec D §5.1 `similar` (plan 2026-10-03-mcp-graph-semantic-layer.md, Task 2):
 * `GET /v1/workspaces/:workspaceId/similar`. Case 27.430.
 *
 * The world is the read world plus its notes (`seedNotesIntoReadWorld`), for the reason
 * `search-meaning-tickets.test.ts` gives: the route needs people who can sign in. The plan's people map
 * as there: `memberOut` → `outsider` (Rule A: reads TP), `guestListed` / `guestUnlisted` → `guest` (in TE's
 * explicit audience and `nExplicit`'s, never TP's). TP gets a description and a comment, and `nNear`, a
 * workspace note whose body paraphrases all three of TP's texts, is created LAST: every other note the
 * owner sees has an older id, so only a DISTANCE order can put `nNear` first. Twelve filler notes give the
 * owner more than 20 candidates, so `k`'s default (10) and its cap (20) both cut something.
 *
 * Another tenant: the neighbour's ticket takes TP's description and comment word for word, and the neighbour
 * gets `nbNote`, a note paraphrasing TP's three texts, both before `nNear`. An owner's visibility clause is
 * `TRUE`, so `c.workspace_id` is the only fence that keeps them out of the owner's answers here.
 *
 * One real worker pass with the real model fills the chunk caches (drained; its log must stay empty).
 */
let db: TestDatabase;
let world: ReadWorld;
let app: FastifyInstance;
let WS: string;
let TP: string;
let TE: string;
let N: ReadWorldNotes['NOTES'];
const nNear = { id: '' };
const nbNote = { id: '' };

function ticketEv(ticketId: string, type: string, payload: unknown): LedgerEvent {
  return makeCommitted({ workspaceId: WS, actorId: world.userIds.owner, entity: { kind: 'ticket', id: ticketId }, type, payload });
}
function noteCreated(noteId: string, title: string, body?: unknown): LedgerEvent {
  return makeCommitted({
    workspaceId: WS,
    actorId: world.userIds.owner,
    entity: { kind: 'note', id: noteId },
    type: 'note.created',
    payload: { title, homeProjectId: world.world.projectId, scope: { mode: 'workspace' }, ...(body === undefined ? {} : { body }) },
  });
}
const docOf = (...paragraphs: string[]) => ({
  type: 'doc',
  attrs: { schemaVersion: 2 },
  content: paragraphs.map((text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })),
});

beforeAll(async () => {
  db = await createTestDatabase();
  world = await buildReadTestApp(db);
  app = world.app;
  WS = world.world.workspaceId;
  TP = world.world.taskInEpicId;
  TE = world.world.guestTaskId;
  N = (
    await seedNotesIntoReadWorld(db.pool, {
      workspaceId: WS,
      projectId: world.world.projectId,
      authorId: world.userIds.owner,
      guestUserId: world.userIds.guest,
      TP,
      TE,
    })
  ).NOTES;
  await applyCommitted(db.pool, [
    ticketEv(TP, 'ticket.field_set', { fieldId: 'description', value: docOf('The municipal office wants the stamped renewal form before the end of March') }),
    ticketEv(TP, 'comment.added', { body: docOf('Call the accountant about the late fee waiver') }),
    ...Array.from({ length: 12 }, (_, index) => noteCreated(newUlid(), `Shelf label ${String(index + 1)}`)),
  ]);
  const nb = world.neighbour;
  nbNote.id = newUlid();
  const nbEv = (entity: { kind: 'ticket' | 'note'; id: string }, type: string, payload: unknown) =>
    makeCommitted({ workspaceId: nb.workspaceId, actorId: world.userIds.neighbour, entity, type, payload });
  await applyCommitted(db.pool, [
    nbEv({ kind: 'ticket', id: nb.ticketId }, 'ticket.field_set', { fieldId: 'description', value: docOf('The municipal office wants the stamped renewal form before the end of March') }),
    nbEv({ kind: 'ticket', id: nb.ticketId }, 'comment.added', { body: docOf('Call the accountant about the late fee waiver') }),
    nbEv({ kind: 'note', id: nbNote.id }, 'note.created', {
      title: 'GST and the renewal form',
      homeProjectId: nb.projectId,
      scope: { mode: 'workspace' },
      body: docOf('Submit the GST return.', 'The council office needs the stamped renewal form by the end of March.', 'Ring the accountant to waive the late fee.'),
    }),
  ]);
  nNear.id = newUlid();
  await applyCommitted(db.pool, [
    noteCreated(
      nNear.id,
      'Tax paperwork',
      docOf(
        'Filing the GST return.',
        'Before March is over the city office needs the renewal form with its stamp.',
        'Phone the accountant to get the late fee waived.',
      ),
    ),
  ]);

  await drain();
  const { rows } = await db.pool.query('SELECT 1 FROM search_note_chunks WHERE note_id = $1', [nNear.id]);
  expect(rows).toHaveLength(1);
}, 120_000);

afterAll(async () => {
  await db.drop();
});

/** Real worker passes until nothing is stale; the log must stay empty (`runOnce` swallows a failed pass). */
async function drain(): Promise<void> {
  const logged: string[] = [];
  const worker = startEmbedWorker(db.pool, { intervalMs: 3_600_000, log: (msg) => logged.push(msg) });
  try {
    for (let round = 0; round < 10; round += 1) if ((await worker.runOnce()) === 0) break;
  } finally {
    worker.stop();
  }
  expect(logged).toEqual([]);
}

type Hit = { kind: 'ticket' | 'note'; id: string; title: string; score: number };

async function similar(role: ReadRole, qs: string, workspaceId = WS): Promise<{ status: number; body: unknown }> {
  const res = await app.inject({ method: 'GET', url: `/v1/workspaces/${workspaceId}/similar?${qs}`, headers: world.authOf(role) });
  return { status: res.statusCode, body: res.json() as unknown };
}
async function hitsOf(role: ReadRole, qs: string, workspaceId = WS): Promise<Hit[]> {
  const res = await similar(role, qs, workspaceId);
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return (res.body as { hits: Hit[] }).hits;
}

describe('27.430 similar (KG-D T2)', () => {
  it('27.430 — nearest visible items by meaning, never the item itself, scores descending; 404 and 400 exactly', async () => {
    // The answer's shape, and the item it names.
    const answer = await similar('member', `item=ticket:${TP}&k=5`);
    expect(answer.status).toBe(200);
    expect(answer.body).toMatchObject({ workspaceId: WS, item: { kind: 'ticket', id: TP } });
    const member = (answer.body as { hits: Hit[] }).hits;
    expect(member.length).toBeGreaterThanOrEqual(2); // first: "descending" over 0 or 1 hit cannot fail
    expect(member.length).toBeLessThanOrEqual(5);
    expect(member.map((hit) => hit.id)).not.toContain(TP);
    const scores = member.map((hit) => hit.score);
    for (const score of scores) expect(score >= -1 && score <= 1, String(score)).toBe(true);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
    expect(scores[0]!).toBeGreaterThan(scores.at(-1)!);

    // Control: the paraphrase is first for the owner, though it is the NEWEST note.
    const owner = await hitsOf('owner', `item=ticket:${TP}`);
    expect(owner[0]).toMatchObject({ kind: 'note', id: nNear.id });
    expect(owner).toHaveLength(10); // k defaults to 10 …
    expect(await hitsOf('owner', `item=ticket:${TP}&k=20`)).toHaveLength(20); // … and 20, the cap, is accepted
    expect(await hitsOf('owner', `item=ticket:${TP}&k=1`)).toHaveLength(1);

    // Not yours: the guest is not in TP's audience; a stranger is in no workspace. Rule A control: outsider reads it.
    expect(await similar('guest', `item=ticket:${TP}`)).toEqual({ status: 404, body: READ_NOT_FOUND_BODY });
    expect(await similar('stranger', `item=ticket:${TP}`)).toEqual({ status: 404, body: READ_NOT_FOUND_BODY });
    expect((await similar('outsider', `item=ticket:${TP}`)).status).toBe(200);
    // Not a member HERE: the neighbour owns a second workspace and sees its own ticket there, so only the
    // membership check stands between them and this workspace's items. Same 404, same body.
    expect(await similar('neighbour', `item=ticket:${world.neighbour.ticketId}`)).toEqual({ status: 404, body: READ_NOT_FOUND_BODY });

    // The guest's own: TE's neighbours include the explicit note, never TP or the project note.
    const guest = (await hitsOf('guest', `item=ticket:${TE}`)).map((hit) => hit.id);
    expect(guest.length).toBeGreaterThan(0);
    expect(guest).toContain(N.nExplicit);
    expect(guest).not.toContain(TP);
    expect(guest).not.toContain(N.nProject);

    // A NOTE as the source: nNear paraphrases TP's three texts, so TP is its nearest item. The self-exclusion
    // matches kind AND id, so nNear is never its own neighbour, and the other notes still answer.
    const fromNote = await hitsOf('owner', `item=note:${nNear.id}`);
    expect(fromNote.length, 'a note source answers').toBeGreaterThanOrEqual(1);
    expect(fromNote[0], 'TP is nearest to its paraphrase').toMatchObject({ kind: 'ticket', id: TP });
    expect(fromNote.map((hit) => hit.id), 'never the note itself').not.toContain(nNear.id);
    expect(fromNote.some((hit) => hit.kind === 'note'), 'other notes still answer a note source').toBe(true);
    // A note the guest cannot read is the same 404 as a ticket; control: their explicit note answers.
    expect(await similar('guest', `item=note:${N.nProject}`), 'a note the guest cannot read').toEqual({ status: 404, body: READ_NOT_FOUND_BODY });
    expect((await similar('guest', `item=note:${N.nExplicit}`)).status).toBe(200);

    // 400: `invalid_query`, the search route's body.
    for (const qs of [`item=ticket:${TP}&k=21`, `item=ticket:${TP}&k=0`, `item=ticket:${TP}&k=1.5`, 'item=widget:x', 'k=3']) {
      expect(await similar('owner', qs), qs).toEqual({ status: 400, body: { error: 'invalid_query' } });
    }

    // `similarItems` clamps k itself, for a caller that is not the route.
    const eff = await requireMember(db.pool, world.userIds.owner, WS);
    expect(await similarItems(db.pool, eff!, world.userIds.owner, WS, { kind: 'ticket', id: TP }, 0)).toHaveLength(1);
    expect(await similarItems(db.pool, eff!, world.userIds.owner, WS, { kind: 'ticket', id: TP }, 50)).toHaveLength(20);
    // An item with no chunks yet is not a refusal: `[]`.
    expect(await similarItems(db.pool, eff!, world.userIds.owner, WS, { kind: 'ticket', id: newUlid() }, 5)).toEqual([]);
  });

  it('27.430 — another workspace’s ticket and note never answer, though an owner’s visibility clause is TRUE', async () => {
    const nb = world.neighbour;
    // The haystack holds the subject: the neighbour's ticket (its title, TP's description, TP's comment) and note
    // are embedded …
    const { rows: nbRows } = await db.pool.query<{ item_kind: string; chunk_index: number; chunk_text: string }>(
      'SELECT item_kind, chunk_index, chunk_text FROM search_item_chunks WHERE ticket_id = $1 ORDER BY item_kind DESC, chunk_index',
      [nb.ticketId],
    );
    expect(nbRows).toEqual([
      { item_kind: 'ticket', chunk_index: 0, chunk_text: nb.ticketTitle },
      { item_kind: 'ticket', chunk_index: 1, chunk_text: 'The municipal office wants the stamped renewal form before the end of March' },
      { item_kind: 'comment', chunk_index: 0, chunk_text: 'Call the accountant about the late fee waiver' },
    ]);
    expect((await db.pool.query('SELECT 1 FROM search_note_chunks WHERE note_id = $1', [nbNote.id])).rows.length).toBeGreaterThan(0);
    // … and each is nearer to TP than the owner's 20th hit, so without the fence it would be inside k = 20: the
    // absence below can fail. The score is computed here, apart from `similarItems`, as the route's source mean does.
    const owner = await hitsOf('owner', `item=ticket:${TP}&k=20`);
    expect(owner).toHaveLength(20);
    const { rows: near } = await db.pool.query<{ ticket: number | null; note: number | null }>(
      `WITH src AS (SELECT avg(embedding) AS v FROM search_item_chunks WHERE ticket_id = $1 AND chunk_text <> '')
       SELECT (SELECT 1 - (avg(c.embedding) <=> src.v) FROM search_item_chunks c WHERE c.ticket_id = $2 AND c.chunk_text <> '') AS ticket,
              (SELECT 1 - (avg(c.embedding) <=> src.v) FROM search_note_chunks c WHERE c.note_id = $3) AS note
         FROM src`,
      [TP, nb.ticketId, nbNote.id],
    );
    expect(near[0]!.ticket, 'the neighbour ticket would be inside k').toBeGreaterThan(owner.at(-1)!.score);
    expect(near[0]!.note, 'the neighbour note would be inside k').toBeGreaterThan(owner.at(-1)!.score);

    const ownerIds = owner.map((hit) => hit.id);
    expect(ownerIds, 'tenancy: the owner never gets the neighbour ticket').not.toContain(nb.ticketId);
    expect(ownerIds, 'tenancy: the owner never gets the neighbour note').not.toContain(nbNote.id);
    // Control: in its own workspace the neighbour gets each from the other, the only two items there.
    expect((await hitsOf('neighbour', `item=ticket:${nb.ticketId}`, nb.workspaceId)).map((hit) => hit.id)).toEqual([nbNote.id]);
    expect((await hitsOf('neighbour', `item=note:${nbNote.id}`, nb.workspaceId)).map((hit) => hit.id)).toEqual([nb.ticketId]);
  });

  it('27.430 — a deleted ticket, note or comment, and a blank chunk, never count as neighbours', async () => {
    // Two new items near TP, embedded by a second pass: TD paraphrases TP's description, and TX is unrelated
    // except for a comment that repeats TP's description word for word.
    const [TD, TX] = [newUlid(), newUlid()];
    const created = (id: string, title: string) =>
      ticketEv(id, 'ticket.created', { typeId: 'task', projectId: world.world.projectId, parentId: null, title });
    const txComment = ticketEv(TX, 'comment.added', { body: docOf('The municipal office wants the stamped renewal form before the end of March') });
    await applyCommitted(db.pool, [created(TD, 'Stamped renewal form for the municipal office before March'), created(TX, 'Pottery wheel maintenance'), txComment]);
    await drain();
    const before = await hitsOf('owner', `item=ticket:${TP}&k=20`);
    const scoreOf = (hits: Hit[], id: string) => hits.find((hit) => hit.id === id)?.score;
    expect(scoreOf(before, TD)).toBeDefined();
    expect(scoreOf(before, TX)).toBeDefined();
    expect(scoreOf(before, nNear.id)).toBeDefined();

    // A blank chunk (an empty comment's) is in no mean, the source's or a neighbour's: one planted on each in
    // turn, with a far-off vector, changes nothing.
    const [far] = await embedTexts(['volcano eruption lava flow']);
    const plant = (ticketId: string) =>
      db.pool.query(
        `INSERT INTO search_item_chunks (item_kind, item_id, chunk_index, workspace_id, ticket_id, heading_path, chunk_text, model, source_hash, embedding)
         VALUES ('ticket', $1, 9, $2, $1, '', '', $3, 'planted', $4)`,
        [ticketId, WS, CURRENT_MODEL, `[${Array.from(far!).join(',')}]`],
      );
    const unplant = () => db.pool.query(`DELETE FROM search_item_chunks WHERE source_hash = 'planted'`);
    for (const ticketId of [TD, TP]) {
      await plant(ticketId);
      try {
        expect(await hitsOf('owner', `item=ticket:${TP}&k=20`), `blank chunk on ${ticketId === TP ? 'the source' : 'TD'}`).toEqual(before);
      } finally {
        await unplant();
      }
    }

    // A deleted comment stops counting toward its ticket at once (no pass: its chunk is still cached).
    await applyCommitted(db.pool, [ticketEv(TX, 'comment.deleted', { commentId: txComment.id })]);
    expect((await db.pool.query('SELECT 1 FROM search_item_chunks WHERE item_id = $1', [txComment.id])).rows).toHaveLength(1);
    expect(scoreOf(await hitsOf('owner', `item=ticket:${TP}&k=20`), TX) ?? -2).toBeLessThan(scoreOf(before, TX)!);

    // A deleted ticket and a deleted note are gone at once, their chunks still cached.
    await applyCommitted(db.pool, [
      ticketEv(TD, 'ticket.deleted', {}),
      makeCommitted({ workspaceId: WS, actorId: world.userIds.owner, entity: { kind: 'note', id: nNear.id }, type: 'note.deleted', payload: {} }),
    ]);
    expect((await db.pool.query('SELECT 1 FROM search_item_chunks WHERE ticket_id = $1', [TD])).rows.length).toBeGreaterThan(0);
    expect((await db.pool.query('SELECT 1 FROM search_note_chunks WHERE note_id = $1', [nNear.id])).rows.length).toBeGreaterThan(0);
    const after = (await hitsOf('owner', `item=ticket:${TP}&k=20`)).map((hit) => hit.id);
    expect(after).not.toContain(TD);
    expect(after).not.toContain(nNear.id);
  });
});
