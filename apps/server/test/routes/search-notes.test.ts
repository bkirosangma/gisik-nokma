import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { foldSearchText } from '@gisik-nokma/domain';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { seedNotesIntoReadWorld, type ReadWorldNotes } from '../helpers/notes-fixture.js';
import { buildReadTestApp, type ReadWorld, type ReadRole } from '../helpers/read-app.js';
import { embedTexts } from '../../src/search/embedding.js';

/**
 * The search route's note half (spec §7.7, cases 18.149–18.154, Plan 3 of 6).
 *
 * ## The ticket half is the CONTROL here, and it is the existing file's job
 *
 * 18.149's "the existing ticket cases still pass unchanged" control is
 * `test/routes/search.test.ts`, which runs in the same suite and is untouched by
 * this plan. What this file asserts is that the two halves can be told apart —
 * and it does that with queries that can only match ONE of them:
 * `licence` is in a ticket title and in no note, `workspace` is in a note title
 * and in no ticket title. A route that ignored `kinds` would take both.
 *
 * ## The meaning half seeds its own chunk with the REAL embedder
 *
 * `mode=meaning` embeds the query with the real model (there is no seam on the
 * route, deliberately — a test-only parameter on a shipped route is a door), so
 * the chunk row this file inserts must carry the real embedding of the text the
 * query will be folded to. That is what `seedChunk` does, and it is why the
 * distance is not a coincidence: the chunk text IS the query.
 */
let db: TestDatabase;
let world: ReadWorld;
let app: FastifyInstance;
let WS: string;
let N: ReadWorldNotes['NOTES'];

beforeAll(async () => {
  db = await createTestDatabase();
  world = await buildReadTestApp(db);
  app = world.app;
  WS = world.world.workspaceId;
  const notes = await seedNotesIntoReadWorld(db.pool, {
    workspaceId: WS,
    projectId: world.world.projectId,
    authorId: world.userIds.owner,
    guestUserId: world.userIds.guest,
    TP: world.world.taskInEpicId,
    TE: world.world.guestTaskId,
  });
  N = notes.NOTES;
});
afterAll(async () => {
  await db.drop();
});

type SearchBody = { hits: unknown[]; notes: { noteId: string; snippet: string; source?: string }[]; corrected?: string[] };

async function search(role: ReadRole, query: string): Promise<{ status: number; body: SearchBody }> {
  const res = await app.inject({
    method: 'GET',
    url: `/v1/search?workspaceId=${WS}&${query}`,
    headers: world.authOf(role),
  });
  return { status: res.statusCode, body: res.statusCode === 200 ? (res.json() as SearchBody) : ({ hits: [], notes: [] } as SearchBody) };
}

function noteIds(body: SearchBody): string[] {
  return body.notes.map((note) => note.noteId).sort();
}

/** A chunk whose text IS the query, so the route's own embedding lands on it. */
async function seedChunk(noteId: string, text: string): Promise<void> {
  const [vector] = await embedTexts([foldSearchText(text)]);
  const literal = `[${Array.from(vector as Float32Array).join(',')}]`;
  await db.pool.query(
    `INSERT INTO search_note_chunks
       (note_id, chunk_index, workspace_id, heading_path, chunk_text, model, source_seq, embedding)
     VALUES ($1, 0, $2, '', $3, 'route-test@1', 0, $4)`,
    [noteId, WS, text, literal],
  );
}

describe('18.149–18.153 the search route, notes side', () => {
  /**
   * 18.149 — `kinds`.
   *
   * Mutation: ignore `kinds`.
   */
  it('18.149 — kinds=note returns only notes, kinds=ticket returns only hits, and the default is both', async () => {
    const both = await search('owner', 'q=workspace');
    expect(both.status).toBe(200);
    expect(noteIds(both.body), 'a note title matched').toContain(N.nWorkspace);
    expect(both.body.hits, 'no ticket title contains "workspace"').toEqual([]);

    const notesOnly = await search('owner', 'q=workspace&kinds=note');
    expect(noteIds(notesOnly.body)).toEqual(noteIds(both.body));

    const ticketsOnly = await search('owner', 'q=workspace&kinds=ticket');
    expect(ticketsOnly.body.notes, 'kinds=ticket means no notes at all').toEqual([]);

    // The other direction, on a query only a TICKET matches.
    const ticketBoth = await search('owner', 'q=licence');
    expect(ticketBoth.body.hits.length, 'a ticket title matched').toBeGreaterThan(0);
    expect(ticketBoth.body.notes, 'no note title contains "licence"').toEqual([]);

    const ticketOnly = await search('owner', 'q=licence&kinds=note');
    expect(ticketOnly.body.hits, 'kinds=note means no ticket hits').toEqual([]);
    expect(ticketOnly.body.notes).toEqual([]);

    // The default is the union of the two, asserted rather than assumed.
    const licenceDefault = await search('owner', 'q=licence');
    const licenceTickets = await search('owner', 'q=licence&kinds=ticket');
    expect(licenceDefault.body.hits).toEqual(licenceTickets.body.hits);
  });

  /**
   * 18.150 — `mode=meaning` answers from the chunks and returns no ticket hits.
   *
   * Mutation: run lexical in meaning mode.
   */
  it('18.150 — mode=meaning returns notes from the chunks and an empty hits', async () => {
    const QUERY = 'a sentence that appears in no title and in no ticket';
    await seedChunk(N.nWorkspace, QUERY);

    const lexical = await search('owner', `q=${encodeURIComponent(QUERY)}`);
    expect(lexical.body.notes, 'control: the lexical index has nothing for a sentence').toEqual([]);

    const meaning = await search('owner', `q=${encodeURIComponent(QUERY)}&kinds=note&mode=meaning`);
    expect(meaning.status).toBe(200);
    expect(noteIds(meaning.body), 'the meaning index has the seeded chunk').toEqual([N.nWorkspace]);
    expect(meaning.body.notes[0]?.snippet, 'the snippet is the chunk text').toBe(QUERY);

    const meaningWithTickets = await search('owner', `q=${encodeURIComponent(QUERY)}&mode=meaning`);
    expect(meaningWithTickets.body.hits, 'no item chunks are seeded in this file (KG-D 27.429)').toEqual([]);
  });

  /**
   * 18.151 — `author` and `scope`, and an invalid `scope` is refused.
   *
   * Mutation: accept any scope string.
   */
  it('18.151 — author and scope filter notes, and an unknown scope is invalid_query', async () => {
    const byScope = await search('owner', 'q=workspace&kinds=note&scope=workspace');
    expect(noteIds(byScope.body)).toEqual([N.nWorkspace]);

    const privateScope = await search('owner', 'q=private&kinds=note&scope=private');
    expect(noteIds(privateScope.body), 'the owner authored it, so the scope is the only filter').toEqual([N.nPrivate]);

    const otherAuthor = await search('owner', `q=workspace&kinds=note&author=${world.userIds.member}`);
    expect(otherAuthor.body.notes, 'control: no note in this world is authored by `member`').toEqual([]);

    const ownerAuthor = await search('owner', `q=workspace&kinds=note&author=${world.userIds.owner}`);
    expect(noteIds(ownerAuthor.body)).toEqual([N.nWorkspace]);

    // The refusals, each with the accepted value beside it so a route that
    // refused EVERY scope would not pass.
    expect((await search('owner', 'q=workspace&scope=everyone')).status).toBe(400);
    expect((await search('owner', 'q=workspace&scope=')).status, 'present and empty is not "absent"').toBe(400);
    expect((await search('owner', 'q=workspace&mode=meanig')).status).toBe(400);
    expect((await search('owner', 'q=workspace&kinds=ticket,notebook')).status).toBe(400);
    expect((await search('owner', 'q=workspace&kinds=note')).status).toBe(200);
  });

  /**
   * 18.152 — `corrected` exactly when a correction happened.
   *
   * Mutation: always set it.
   */
  it('18.152 — corrected is present only when the query was corrected', async () => {
    const misspelt = await search('owner', 'q=workspase&kinds=note');
    expect(misspelt.body.corrected, 'the vocabulary supplied "workspace"').toEqual(['workspace']);
    expect(noteIds(misspelt.body), 'and the corrected query found the note').toEqual([N.nWorkspace]);

    const correct = await search('owner', 'q=workspace&kinds=note');
    expect(correct.body.corrected, 'control: a query that matched is never corrected').toBeUndefined();

    const nothing = await search('owner', 'q=zzzqqq&kinds=note');
    expect(nothing.body.notes).toEqual([]);
    expect(nothing.body.corrected, 'control: nothing to correct means no field at all').toBeUndefined();
  });

  /**
   * 18.153 — the no-leak rule AT THE ROUTE, in both modes, plus the 404.
   *
   * Mutation: — (the predicate is 18.144/18.145's mutation; this case proves the
   * route cannot be reached around it).
   */
  it('18.153 — a non-member is 404 and no unreadable note appears in either mode', async () => {
    const QUERY = 'a sentence that lives in the private note';
    await seedChunk(N.nPrivate, QUERY);

    // Lexical.
    expect(noteIds((await search('owner', 'q=private&kinds=note')).body)).toEqual([N.nPrivate]);
    expect(
      noteIds((await search('member', 'q=private&kinds=note')).body),
      'member is not the author of a private note',
    ).toEqual([]);

    // Meaning. The owner's list also holds the chunk 18.150 seeded for
    // nWorkspace — that chunk is still in the table and the owner may read its
    // note — so the assertion is about WHICH notes are in it, not how many.
    const ownerMeaning = noteIds((await search('owner', `q=${encodeURIComponent(QUERY)}&kinds=note&mode=meaning`)).body);
    expect(ownerMeaning, 'the private note’s own author gets it').toContain(N.nPrivate);

    const memberMeaning = noteIds(
      (await search('member', `q=${encodeURIComponent(QUERY)}&kinds=note&mode=meaning`)).body,
    );
    expect(memberMeaning, 'the chunk exists and the predicate is the only thing excluding it').not.toContain(N.nPrivate);
    // The sharper half: the SAME response carries a note the member may read,
    // so this is a filter and not an empty answer.
    expect(memberMeaning, 'the readable note is still served beside it').toEqual([N.nWorkspace]);

    // A caller who is not a member of this workspace at all gets the SAME 404 an
    // unknown workspace gets — for the neighbour, who is a member of ANOTHER
    // workspace (the sharper case: they have a valid session and a real
    // membership, just not here), and for the stranger, who is in none.
    for (const role of ['neighbour', 'stranger'] as ReadRole[]) {
      const refused = await app.inject({
        method: 'GET',
        url: `/v1/search?workspaceId=${WS}&q=private&kinds=note`,
        headers: world.authOf(role),
      });
      expect(refused.statusCode, role).toBe(404);
      // Control: the same person CAN read their own workspace's search, so the
      // 404 is about membership and not about the route being broken for them.
      const own = await app.inject({
        method: 'GET',
        url: `/v1/search?workspaceId=${role === 'neighbour' ? world.neighbour.workspaceId : WS}&q=x&kinds=note`,
        headers: world.authOf(role),
      });
      expect(own.statusCode, `${role} control`).toBe(role === 'neighbour' ? 200 : 404);
    }

    // And the workspace the caller does not belong to is refused in BOTH modes,
    // so `mode=meaning` is not a way around the gate.
    const meaningNeighbour = await app.inject({
      method: 'GET',
      url: `/v1/search?workspaceId=${WS}&q=private&kinds=note&mode=meaning`,
      headers: world.authOf('neighbour'),
    });
    expect(meaningNeighbour.statusCode).toBe(404);
  });
});
