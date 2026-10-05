import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { foldSearchText, newUlid, type LedgerEvent } from '@gisik-nokma/domain';
import { startEmbedWorker } from '../../src/search/embed-worker.js';
import { CURRENT_MODEL, embedTexts } from '../../src/search/embedding.js';
import { applyCommitted, makeCommitted } from '../helpers/apply.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { buildReadTestApp, type ReadRole, type ReadWorld } from '../helpers/read-app.js';

/**
 * Knowledge Graph spec D §2 + §5.1 (plan 2026-10-03-mcp-graph-semantic-layer.md, Task 2): `mode=meaning`
 * answers TICKETS from `search_item_chunks`. Cases 27.427–27.429.
 *
 * ## The world: the read world, not `seedNotesFixture`
 *
 * The plan named `seedNotesFixture`, whose people are minted ids nobody can sign in as. The route needs
 * signed-in people, so this file uses the read world (`buildReadTestApp`, as `search-notes.test.ts`
 * does), mapped onto the plan's people: `memberIn` → `member` (on the project), `memberOut` →
 * `outsider` (a workspace member on no project, who READS a project-mode ticket under Rule A, so it is
 * the Rule A control), `guestListed` → `guest` (in TE's explicit audience, never in TP's). TP is the
 * world's project-mode `taskInEpicId`, TE its explicit-to-guest `guestTaskId`.
 *
 * ## The REAL model, through the REAL worker
 *
 * The route has no embedder seam, so the chunks are written by one real worker pass with the real model
 * and the query is embedded by the route itself. TP's description, its comment and its title share no
 * word, so the column meaning picks cannot be a lexical accident. The pass's log must stay empty and TP's
 * three rows must exist BEFORE any case: `runOnce` swallows a failing pass (`runGuarded`), and every
 * "absent" leg below would otherwise be green on a database the worker never filled.
 *
 * ## Enough tickets for the bounds to cut
 *
 * Twenty-two filler tickets, then NW (the NEWEST ticket id), are created before the pass, so the owner
 * has more than 20 embedded tickets: the 20-hit limit cuts, and a cut taken in ticket-id order (the
 * per-ticket `DISTINCT ON`'s order) rather than after the distance sort would drop NW, which only
 * distance puts first for its own title.
 */
let db: TestDatabase;
let world: ReadWorld;
let app: FastifyInstance;
let WS: string;
let TP: string;
let TE: string;
let commentId: string;
let NW: string;
const NW_TITLE = 'Narwhal tusk polishing schedule';
const TP_TITLE = 'File the GST return';
const TE_TITLE = 'Share the July invoices';
const DESCRIPTION = 'The municipal office wants the stamped renewal form before the end of March';
const COMMENT = 'Call the accountant about the late fee waiver';

function ticketEv(ticketId: string, type: string, payload: unknown): LedgerEvent {
  return makeCommitted({ workspaceId: WS, actorId: world.userIds.owner, entity: { kind: 'ticket', id: ticketId }, type, payload });
}
const docOf = (text: string) => ({ type: 'doc', attrs: { schemaVersion: 2 }, content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] });

beforeAll(async () => {
  db = await createTestDatabase();
  world = await buildReadTestApp(db);
  app = world.app;
  WS = world.world.workspaceId;
  TP = world.world.taskInEpicId;
  TE = world.world.guestTaskId;
  const comment = ticketEv(TP, 'comment.added', { body: docOf(COMMENT) });
  commentId = comment.id;
  await applyCommitted(db.pool, [ticketEv(TP, 'ticket.field_set', { fieldId: 'description', value: docOf(DESCRIPTION) }), comment]);
  const created = (id: string, title: string) =>
    ticketEv(id, 'ticket.created', { typeId: 'task', projectId: world.world.projectId, parentId: null, title });
  await applyCommitted(db.pool, Array.from({ length: 22 }, (_, index) => created(newUlid(), `Filler errand ${String(index + 1)}`)));
  NW = newUlid();
  await applyCommitted(db.pool, [created(NW, NW_TITLE)]);

  const logged: string[] = [];
  const worker = startEmbedWorker(db.pool, { intervalMs: 3_600_000, log: (msg) => logged.push(msg) });
  try {
    // Drained, not one pass: the read world holds more items than one batch.
    for (let round = 0; round < 10; round += 1) if ((await worker.runOnce()) === 0) break;
  } finally {
    worker.stop();
  }
  expect(logged).toEqual([]);
  const { rows } = await db.pool.query<{ item_kind: string; chunk_index: number; chunk_text: string }>(
    // TP's own rows and THIS file's comment (the read world gives TP a comment of its own, too).
    `SELECT item_kind, chunk_index, chunk_text FROM search_item_chunks
      WHERE ticket_id = $1 AND (item_kind = 'ticket' OR item_id = $2) ORDER BY item_kind DESC, chunk_index`,
    [TP, commentId],
  );
  expect(rows).toEqual([
    { item_kind: 'ticket', chunk_index: 0, chunk_text: TP_TITLE },
    { item_kind: 'ticket', chunk_index: 1, chunk_text: DESCRIPTION },
    { item_kind: 'comment', chunk_index: 0, chunk_text: COMMENT },
  ]);
}, 120_000);

afterAll(async () => {
  await db.drop();
});

type Hit = { card: { ticketId: string }; matchedIn: string; snippet: string };

async function search(role: ReadRole, q: string, mode: 'meaning' | 'lexical', filter?: unknown): Promise<Hit[]> {
  const filterQs = filter === undefined ? '' : `&filter=${encodeURIComponent(JSON.stringify(filter))}`;
  const res = await app.inject({
    method: 'GET',
    url: `/v1/search?workspaceId=${WS}&q=${encodeURIComponent(q)}&mode=${mode}${filterQs}`,
    headers: world.authOf(role),
  });
  expect(res.statusCode, res.body).toBe(200);
  return (res.json() as { hits: Hit[] }).hits;
}
const ids = (hits: Hit[]) => hits.map((hit) => hit.card.ticketId);
const hitFor = (hits: Hit[], ticketId: string) => hits.find((hit) => hit.card.ticketId === ticketId);

describe('27.427–27.429 meaning search answers tickets (KG-D T2)', () => {
  it('27.427 — meaning finds a ticket by its description, visibility-checked at query time', async () => {
    // Control: the owner sees everything.
    expect(ids(await search('owner', DESCRIPTION, 'meaning'))).toContain(TP);

    const member = await search('member', DESCRIPTION, 'meaning');
    expect(hitFor(member, TP)?.matchedIn).toBe('description');
    expect(hitFor(member, TP)?.snippet, 'the snippet is the matching chunk').toBe(DESCRIPTION);
    // Rule A: a workspace member on no project still reads a project-mode ticket, so they get TP too.
    expect(ids(await search('outsider', DESCRIPTION, 'meaning'))).toContain(TP);

    // The guest is in TE's audience and not TP's: the list is NOT empty (TE is in it), and TP is not.
    const guest = await search('guest', DESCRIPTION, 'meaning');
    expect(ids(guest)).toContain(TE);
    expect(ids(guest)).not.toContain(TP);
    const guestTe = await search('guest', TE_TITLE, 'meaning');
    expect(ids(guestTe)).toContain(TE);
    expect(ids(guestTe)).not.toContain(TP);

    // The bounds: more than 20 embedded tickets are visible to the owner, and 20 come back; NW, the newest
    // id, is first for its own title (a cut in ticket-id order, before the distance sort, would lose it).
    const { rows } = await db.pool.query<{ n: number }>(
      `SELECT count(DISTINCT c.ticket_id)::int AS n FROM search_item_chunks c JOIN proj_tickets t ON t.ticket_id = c.ticket_id
        WHERE c.workspace_id = $1 AND t.deleted_at IS NULL`,
      [WS],
    );
    expect(rows[0]!.n).toBeGreaterThan(20);
    expect(await search('owner', DESCRIPTION, 'meaning')).toHaveLength(20);
    expect(ids(await search('owner', NW_TITLE, 'meaning'))[0]).toBe(NW);

    // The filter spec applies to the meaning half, blocked CTE included: the world's one blocked ticket
    // (sharedTask, in the blocked-flagged state) is the only answer to `blocked: true`.
    expect(ids(await search('owner', DESCRIPTION, 'meaning', { blocked: true }))).toEqual([world.world.sharedTaskId]);
  });

  it('27.428 — matchedIn for a meaning hit: chunk 0 is the title, a comment chunk is the comment', async () => {
    expect(hitFor(await search('owner', TP_TITLE, 'meaning'), TP)?.matchedIn).toBe('title');
    expect(hitFor(await search('owner', COMMENT, 'meaning'), TP)?.matchedIn).toBe('comment');
    // Control: the lexical route names the same column for the same text — one vocabulary, both modes.
    expect(hitFor(await search('owner', COMMENT, 'lexical'), TP)?.matchedIn).toBe('comment');

    // A blank chunk (an empty comment's) never answers: one planted on TP's live comment, carrying the very
    // vector of the query, would otherwise be TP's nearest chunk, with an empty snippet.
    const Q = 'Zebra crossing lollipop warden';
    const [vector] = await embedTexts([foldSearchText(Q)]);
    await db.pool.query(
      `INSERT INTO search_item_chunks (item_kind, item_id, chunk_index, workspace_id, ticket_id, heading_path, chunk_text, model, source_hash, embedding)
       VALUES ('comment', $1, 7, $2, $3, '', '', $4, 'planted', $5)`,
      [commentId, WS, TP, CURRENT_MODEL, `[${Array.from(vector!).join(',')}]`],
    );
    try {
      const planted = await search('owner', Q, 'meaning');
      expect(planted.length).toBeGreaterThan(0);
      for (const hit of planted) expect(hit.snippet, hit.card.ticketId).not.toBe('');
    } finally {
      await db.pool.query(`DELETE FROM search_item_chunks WHERE item_id = $1 AND chunk_index = 7`, [commentId]);
    }
  });

  it('27.429 — a ticket with no chunks is absent from meaning and present in lexical; a deleted comment stops answering', async () => {
    const TN = newUlid();
    const TN_TITLE = 'Quokka enclosure inspection';
    await applyCommitted(db.pool, [
      ticketEv(TN, 'ticket.created', { typeId: 'task', projectId: world.world.projectId, parentId: null, title: TN_TITLE }),
    ]);
    // Two paths, not one path twice: lexical finds it by its words, meaning has no chunk for it yet.
    expect(ids(await search('owner', TN_TITLE, 'lexical'))).toContain(TN);
    expect(ids(await search('owner', TN_TITLE, 'meaning'))).not.toContain(TN);

    // No pass after the delete: the comment's chunk row is still there, and the read must not trust it.
    await applyCommitted(db.pool, [ticketEv(TP, 'comment.deleted', { commentId })]);
    const { rows } = await db.pool.query('SELECT 1 FROM search_item_chunks WHERE item_id = $1', [commentId]);
    expect(rows).toHaveLength(1);
    const after = await search('owner', COMMENT, 'meaning');
    expect(ids(after), 'TP still answers, through its title or description').toContain(TP);
    expect(hitFor(after, TP)?.matchedIn).not.toBe('comment');

    // A deleted ticket stops answering at once, its chunks still cached (no pass): the read's own liveness.
    const shared = world.world.sharedTaskId;
    expect(ids(await search('owner', 'Renew the trade licence', 'meaning'))).toContain(shared);
    await applyCommitted(db.pool, [ticketEv(shared, 'ticket.deleted', {})]);
    expect((await db.pool.query('SELECT 1 FROM search_item_chunks WHERE ticket_id = $1', [shared])).rows.length).toBeGreaterThan(0);
    expect(ids(await search('owner', 'Renew the trade licence', 'meaning'))).not.toContain(shared);
  });
});
