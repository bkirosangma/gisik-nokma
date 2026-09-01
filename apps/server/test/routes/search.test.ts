import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { newUlid, type LedgerEvent, type SearchResponse } from '@gisik-nokma/domain';
import { UNAUTHENTICATED_BODY } from '../../src/auth/require-session.js';
import { applyCommitted, makeCommitted } from '../helpers/apply.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { buildReadTestApp, type ReadRole, type ReadWorld } from '../helpers/read-app.js';

/**
 * Plan 5 Task 10 — `GET /v1/search`, the workspace-wide full-text read.
 *
 * ## This is the first CROSS-PROJECT read, and that changes what has to be proved
 *
 * The board and the list were scoped to ONE project the caller had already been
 * authorised for, so `t.project_id` did most of the work and the tenancy clause
 * beside it was unfalsifiable — both routes say so in their own docblocks. This
 * route spans a WORKSPACE. There is no project clause to hide behind, so two
 * conjuncts are the whole boundary and both are falsifiable here for the first
 * time:
 *
 * - `t.workspace_id = $n` — and it is genuinely falsifiable now. For a plain
 *   member `visibleTicketsWhere` compiles to a disjunction whose first arm is
 *   `v.resolved_mode = 'workspace'`, and the NEIGHBOUR workspace's ticket is
 *   workspace-mode. So widening the tenancy clause hands one tenant's member a
 *   different tenant's ticket, and "7.93 the neighbour's ticket" is the case
 *   that dies. MEASURED, not argued: see the mutation notes on that case.
 * - `visibleTicketsWhere` — Plan 4's decision table, CONSUMED and not
 *   re-expressed, exactly as `readBoard` and `readList` consume it.
 *
 * ## The population, stated once
 *
 * Every row this route returns is (workspace ∩ visible ∩ text-match ∩ filter),
 * ranked, and only THEN cut to fifty. The route emits no count, no total and no
 * rank number, so there is no aggregate counting a different population from the
 * rows — but the CUT is an aggregate-shaped thing and it is pinned: the bulk
 * fixture below carries sixty matching tickets of which five are invisible to
 * the member, interleaved among the first fifty by id. A route that cut to fifty
 * BEFORE applying visibility answers forty-five rows; the shipped one answers
 * fifty. Two different non-empty sets, which is the only kind of fixture that
 * can tell those two implementations apart.
 *
 * ## Three ways a full-text test passes for the wrong reason, and what is done
 *
 * 1. **One-row fixtures.** A hit set of one is right under almost any predicate.
 *    So the discriminating cases assert exact multi-row sets: `q=marker` is two
 *    tickets in two DIFFERENT projects and must not be the neighbour's third.
 * 2. **The stemmer answering instead of the code.** The configuration is
 *    `simple` in the index and must be `simple` in the query. `licence` /
 *    `licences` is the pair that separates them, and the case carries both
 *    directions — under an `english` index-and-query pair the negative reddens,
 *    under a mixed pair the positive control reddens (case 7.95).
 * 3. **Ranking agreeing with id order by accident.** The seeded world's ids are
 *    minted in the order the fixture reads, so a route with no `ts_rank_cd` at
 *    all answers the same list. The quokka pair below is hand-built so that rank
 *    order and id order are EXACT OPPOSITES (case 7.94).
 *
 * ## The snippet is the leak surface, so it gets its own cases
 *
 * `ts_headline` renders a row's own title, description and comments. Two cases
 * ask whether text from a row the caller may not see can reach them: the planted
 * `zebra-confidential` comment (7.24) and the `aardvark` comments on the five
 * invisible bulk tickets (7.96), the latter matched by a query that ALSO matches
 * fifty rows the caller may see — so an answer of "no leak" is not just an empty
 * body.
 *
 * The assertions deliberately never look for the SEARCH TERM in the body:
 * `SearchResponse.query` echoes `q` verbatim, so `not.toContain(term)` would
 * fail on the echo and pass on nothing. They look for the hidden row's id, its
 * TITLE words, and words from its comment that are not in the query.
 *
 * ## One database, one seed, everything in `beforeAll`
 *
 * `seedReadScenario` refuses a second seed into one database, so this file takes
 * one `createTestDatabase` and seeds once, and its own fixtures live in projects
 * of their own so no case changes what another case measures. They are here
 * rather than in `read-app.ts` for the reason `list.test.ts` gives for its own:
 * that helper is the shared world for Tasks 8–15 and every fixture in it is
 * justified for all of them; sixty rows of limit bait are this task's problem.
 *
 * ## Nothing on this response moves with `TZ`
 *
 * Same statement `board.test.ts` and `list.test.ts` make. A hit is a card plus a
 * snippet; the only times a card carries are `stateProvenance`'s two
 * `timestamptz` columns rendered by `toISOString()`, and nothing in the ranking
 * or the text match reads a clock. A `TZ`-varying case here could not fail.
 */

type InjectResponse = Awaited<ReturnType<FastifyInstance['inject']>>;

let db: TestDatabase;
let read: ReadWorld;
let fixtures: SearchFixtures;

beforeAll(async () => {
  db = await createTestDatabase();
  read = await buildReadTestApp(db);
  fixtures = await seedSearchFixtures(db.pool, read);
}, 120_000);

afterAll(async () => {
  await read.app.close();
  await db.drop();
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

type SearchFixtures = {
  projectId: string;
  /** Title carries `quokka` (weight A). The HIGHER of the two ids. */
  rankTitleId: string;
  /** Only its comment carries `quokka` (weight C). The LOWER of the two ids. */
  rankCommentId: string;
  /** All sixty `wombat` tickets, in `ticket_id` order. */
  bulkIds: string[];
  /** The five of them the member may not see, in `ticket_id` order. */
  bulkInvisibleIds: string[];
  /** The other fifty-five, in `ticket_id` order. */
  bulkVisibleIds: string[];
  /**
   * The LEAK PAIR: one `pangolin` ticket the member may see and one they may
   * not, the invisible one carrying `pangolin` in a COMMENT right beside a word
   * that appears nowhere else (`chinchilla`).
   *
   * The bulk fixture's `aardvark` comments cannot do this job, and it was
   * MEASURED that they cannot: a snippet source widened to reach other rows
   * still windows onto a MATCH, so text carrying no match is simply never shown
   * and the assertion passes on a route that is leaking. Here the secret sits
   * INSIDE a matching fragment, so a widened source has something the headline
   * will actually pick.
   */
  leakVisibleId: string;
  leakHiddenId: string;
};

const BULK_COUNT = 60;

/**
 * Where the five invisible bulk tickets sit in id order.
 *
 * ALL FIVE ARE BELOW FIFTY, and that is the whole point rather than an arbitrary
 * scatter: an implementation that applied `LIMIT 50` before the visibility join
 * would take ids 0–49, lose these five, and answer forty-five. Put them at 50+
 * and both implementations answer fifty and the fixture proves nothing.
 */
const BULK_INVISIBLE_OFFSETS = [3, 10, 21, 33, 44];

/**
 * Crockford base32 — the ULID alphabet, `I`, `L`, `O` and `U` absent — in
 * ascending byte order, so a suffix built from it sorts in Postgres exactly as
 * it sorts in JavaScript.
 */
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/**
 * A hand-built ticket id, valid against `ULID_REGEX` and ordered by `index`.
 *
 * `newUlid()` will not do, and this file needs the guarantee twice over.
 * A ULID's leading 48 bits are a millisecond clock, so ids minted in a loop come
 * out ROUGHLY in insertion order — which means an ordering assertion over them
 * agrees with a route that has no `ORDER BY` at all. And only roughly: within
 * one millisecond the remaining 80 bits are RANDOM rather than a counter, so two
 * ids minted in the same tick sort either way (`list.test.ts` records the case
 * that was a coin flip until it was measured). Hence `.sort()` wherever a seeded
 * id SET is asserted, and hence these hand-built ids wherever an ORDER is under
 * test.
 *
 * The prefix is `0SR` so these ids cannot be mistaken for the seeded world's.
 */
function searchTicketId(index: number): string {
  const suffix = `${CROCKFORD[Math.floor(index / CROCKFORD.length)]}${CROCKFORD[index % CROCKFORD.length]}`;
  return `0SR${'0'.repeat(21)}${suffix}`;
}

/** A minimal Tiptap-shaped document carrying one line of text. */
function doc(text: string): unknown {
  return { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] };
}

/**
 * The vocabulary this file plants, and why each word is unique to its fixture.
 *
 * `quokka`, `wombat` and `aardvark` appear in no seeded title, description or
 * comment, so a case that searches one of them measures exactly the rows below.
 * Conversely nothing here carries `the`, `marker`, `licence` or `OTP`, so the
 * cases that search THOSE measure exactly the shared world and are not quietly
 * widened by this seed.
 */
async function seedSearchFixtures(pool: Pool, world: ReadWorld): Promise<SearchFixtures> {
  const ws = { workspaceId: world.world.workspaceId, actorId: world.world.owner };
  const projectId = newUlid();

  const rankCommentId = searchTicketId(0);
  const rankTitleId = searchTicketId(1);
  const bulkIds = Array.from({ length: BULK_COUNT }, (_, offset) => searchTicketId(10 + offset));
  const invisibleOffsets = new Set(BULK_INVISIBLE_OFFSETS);
  const bulkInvisibleIds = bulkIds.filter((_id, offset) => invisibleOffsets.has(offset));
  const bulkVisibleIds = bulkIds.filter((_id, offset) => !invisibleOffsets.has(offset));
  const leakVisibleId = searchTicketId(2);
  const leakHiddenId = searchTicketId(3);

  const ticket = (id: string, title: string): LedgerEvent =>
    makeCommitted({
      ...ws,
      entity: { kind: 'ticket', id },
      type: 'ticket.created',
      payload: { typeId: 'task', projectId, parentId: null, title },
    });
  const comment = (id: string, text: string): LedgerEvent =>
    makeCommitted({ ...ws, entity: { kind: 'ticket', id }, type: 'comment.added', payload: { body: doc(text) } });
  const ownerOnly = (id: string): LedgerEvent =>
    makeCommitted({
      ...ws,
      entity: { kind: 'ticket', id },
      type: 'visibility.set',
      payload: { ticketId: id, mode: 'explicit', userIds: [world.world.owner] },
    });

  const events: LedgerEvent[] = [
    makeCommitted({ ...ws, entity: { kind: 'project', id: projectId }, type: 'project.created', payload: { name: 'Wildlife' } }),
    makeCommitted({ ...ws, entity: { kind: 'project', id: projectId }, type: 'project.member_added', payload: { userId: world.world.owner, projectAdmin: true } }),
    makeCommitted({ ...ws, entity: { kind: 'project', id: projectId }, type: 'project.member_added', payload: { userId: world.world.member, projectAdmin: false } }),

    // The rank pair, inserted with the TITLE hit second so that neither id order
    // nor insertion order agrees with the answer this route owes.
    ticket(rankCommentId, 'Nothing notable here'),
    comment(rankCommentId, 'a quokka was seen'),
    ticket(rankTitleId, 'Quokka census overdue'),

    // The leak pair. The hidden one's comment carries the search term AND the
    // secret in one fragment, which is the only shape that catches a snippet
    // whose source reached past its own row.
    ticket(leakVisibleId, 'Pangolin survey outstanding'),
    ticket(leakHiddenId, 'Pangolin ledger'),
    comment(leakHiddenId, 'pangolin counts beside chinchilla receipts'),
    ownerOnly(leakHiddenId),
  ];

  // Inserted BACKWARDS: id order and insertion order are exact opposites, so a
  // route returning rows in the order the ledger wrote them fails the cut case.
  for (let offset = BULK_COUNT - 1; offset >= 0; offset -= 1) {
    const id = bulkIds[offset] as string;
    events.push(ticket(id, `Bulk wombat ${String(offset).padStart(2, '0')}`));
    if (invisibleOffsets.has(offset)) {
      // A word in a COMMENT, which is where people put what they would not put
      // in a title — and the reason `proj_search` indexes comments at all. It is
      // the string case 7.96 looks for in a body full of visible neighbours.
      events.push(comment(id, 'aardvark ledger notes'));
      events.push(ownerOnly(id));
    }
  }

  await applyCommitted(pool, events);
  return {
    projectId,
    rankTitleId,
    rankCommentId,
    bulkIds,
    bulkInvisibleIds,
    bulkVisibleIds,
    leakVisibleId,
    leakHiddenId,
  };
}

// ---------------------------------------------------------------------------
// Request helpers
// ---------------------------------------------------------------------------

type SearchParams = { workspaceId?: string; q?: string; filter?: unknown };

/**
 * The URL, with every part OMITTED rather than blanked when it is `undefined`.
 *
 * The difference matters: `?q=` (present and empty) and no `q` at all are two
 * different requests, and both are refused, so the cases that assert the refusal
 * have to be able to send each of them.
 */
function searchUrl(params: SearchParams): string {
  const parts: string[] = [];
  if (params.workspaceId !== undefined) parts.push(`workspaceId=${encodeURIComponent(params.workspaceId)}`);
  if (params.q !== undefined) parts.push(`q=${encodeURIComponent(params.q)}`);
  if (params.filter !== undefined) {
    const raw = typeof params.filter === 'string' ? params.filter : JSON.stringify(params.filter);
    parts.push(`filter=${encodeURIComponent(raw)}`);
  }
  return `/v1/search${parts.length === 0 ? '' : `?${parts.join('&')}`}`;
}

async function search(role: ReadRole, params: SearchParams): Promise<InjectResponse> {
  return read.app.inject({ method: 'GET', url: searchUrl(params), headers: read.authOf(role) });
}

/** A search in the SEEDED workspace, which is what almost every case wants. */
async function seededSearch(role: ReadRole, q: string, filter?: unknown): Promise<InjectResponse> {
  return search(role, { workspaceId: read.world.workspaceId, ...(filter === undefined ? {} : { filter }), q });
}

/** The hit ids, in the order the route returned them. */
async function hitIds(role: ReadRole, q: string, filter?: unknown): Promise<string[]> {
  const response = await seededSearch(role, q, filter);
  expect(response.statusCode).toBe(200);
  return (response.json() as SearchResponse).hits.map((hit) => hit.card.ticketId);
}

/**
 * Every response header except `date`, which is a clock reading and differs
 * between two requests for reasons unrelated to what is being compared.
 * `content-length` above all must match: a length that differed would itself be
 * the oracle even if both bodies parsed to the same object.
 */
function comparableHeaders(response: InjectResponse): Record<string, unknown> {
  const { date: _date, ...rest } = response.headers;
  return rest;
}

// ---------------------------------------------------------------------------

describe('GET /v1/search — finding text across a workspace', () => {
  it('7.23 finds by title, by description and by comment — a mention indexes as the label that was shown', async () => {
    // Title (weight A). `licence` is one word of one seeded title and of nothing
    // else in this database.
    expect(await hitIds('member', 'licence')).toEqual([read.world.sharedTaskId]);

    // Description (weight B) — `timing` is in "portal keeps timing out" and in
    // no title anywhere, so this cell is the description column or nothing.
    expect(await hitIds('member', 'timing')).toEqual([read.world.taskInEpicId]);

    // Comment (weight C), through the MENTION: the comment reads "Called the
    // @Kiro about the OTP hold-up" and `Kiro` exists only as a mention label
    // rendered by docToPlainText. A projection that indexed the raw document
    // would carry `mention` and `userId`, not the name anybody read.
    expect(await hitIds('member', 'Kiro')).toEqual([read.world.taskInEpicId]);
    expect(await hitIds('member', 'OTP')).toEqual([read.world.taskInEpicId]);
  });

  it('7.23 marks the match in the snippet, and the snippet is that row’s own text', async () => {
    const response = await seededSearch('member', 'OTP');
    expect(response.statusCode).toBe(200);
    const body = response.json() as SearchResponse;

    // The positive control comes FIRST: `hits[0]` on an empty list is a
    // confusing throw rather than a failure that names the missing snippet.
    expect(body.hits.map((hit) => hit.card.ticketId)).toEqual([read.world.taskInEpicId]);
    const snippet = body.hits[0]?.snippet ?? '';
    expect(snippet).toContain('**OTP**');
    // …and the marks are around the match, not around the whole document: the
    // words either side of it come back unmarked.
    expect(snippet).toContain('hold-up');
    expect(snippet).not.toContain('**hold-up**');
  });

  it('7.23 composes q with a FilterSpec — the filter narrows the matched set to a different, smaller, non-empty one', async () => {
    // Two matches, and their ORDER is the ranking: taskInEpic carries `the`
    // twice (title and comment) and ranks 1.4 against sharedTask's 1.0.
    expect(await hitIds('member', 'the')).toEqual([read.world.taskInEpicId, read.world.sharedTaskId]);

    // Both are `active`; only sharedTask sits in the blocked-flagged `waiting`.
    expect(await hitIds('member', 'the', { stateCategory: 'active', blocked: true })).toEqual([
      read.world.sharedTaskId,
    ]);
    // The complementary half, so the filter is proved to SELECT rather than to
    // merely shrink: not-blocked keeps the other one.
    expect(await hitIds('member', 'the', { stateCategory: 'active', blocked: false })).toEqual([
      read.world.taskInEpicId,
    ]);
  });

  it('7.23 refuses a filter that smuggles its own text term, and every other malformed filter, as `invalid_filter`', async () => {
    const smuggled = await seededSearch('member', 'the', { text: 'licence' });
    expect(smuggled.statusCode).toBe(400);
    expect(smuggled.json()).toEqual({ error: 'invalid_filter' });

    // Not JSON at all, and JSON that is not a FilterSpec.
    expect((await seededSearch('member', 'the', '{not json')).statusCode).toBe(400);
    expect((await seededSearch('member', 'the', { asigneeId: 'typo' })).statusCode).toBe(400);
    expect((await seededSearch('member', 'the', ['an', 'array'])).statusCode).toBe(400);

    // Positive control: the same q with a WELL-FORMED filter is a 200 with rows,
    // so the four refusals above are about the filter and not about the route.
    expect(await hitIds('member', 'the', { stateCategory: 'active' })).toEqual([
      read.world.taskInEpicId,
      read.world.sharedTaskId,
    ]);
  });

  it('7.92 spans EVERY project in the workspace the caller can see into — one query, two projects, and the sibling’s own workflow', async () => {
    // `marker` is one word of two titles in the SIBLING project and of one in
    // the neighbouring TENANCY. A project-scoped route answers one of these;
    // this route answers both, and never the third (case 7.93).
    expect(await hitIds('member', 'marker')).toEqual(
      [read.sibling.ticketId, read.sibling.choreTicketId].sort(),
    );

    // The seeded project and the sibling project in ONE answer: `wombat` and
    // `licence` are in different projects, and an OR-ed query reaches both.
    const both = await hitIds('member', 'quokka OR licence');
    expect(both.sort()).toEqual([fixtures.rankTitleId, fixtures.rankCommentId, read.world.sharedTaskId].sort());
  });

  it('7.93 the neighbour tenancy’s ticket is not in the answer — and the neighbour, searching their OWN workspace, finds it', async () => {
    // The neighbour's ticket is `workspace`-mode, so `visibleTicketsWhere`'s
    // FIRST arm is TRUE for it for any plain member of ANY workspace. Nothing
    // but `t.workspace_id` keeps it out of this answer, which is why this is the
    // case that dies when that clause is widened.
    const memberIds = await hitIds('member', 'marker');
    expect(memberIds).not.toContain(read.neighbour.ticketId);
    const memberBody = (await seededSearch('member', 'marker')).body;
    expect(memberBody).not.toContain(read.neighbour.ticketId);
    expect(memberBody).not.toContain('Neighbour tenancy');

    // Positive control on the same word: the row EXISTS, it is indexed, and its
    // own owner finds it. Without this the case above would pass on a route that
    // never returns anything for `marker`.
    const next = await search('neighbour', { workspaceId: read.neighbour.workspaceId, q: 'marker' });
    expect(next.statusCode).toBe(200);
    expect((next.json() as SearchResponse).hits.map((hit) => hit.card.ticketId)).toEqual([
      read.neighbour.ticketId,
    ]);

    // …and the owner of the SEEDED workspace, asking for the same word, gets the
    // seeded workspace's two and not the neighbour's — an owner compiles the
    // visibility predicate to `TRUE`, so for an owner the tenancy clause is the
    // ONLY boundary there is.
    expect(await hitIds('owner', 'marker')).toEqual(
      [read.sibling.ticketId, read.sibling.choreTicketId].sort(),
    );
  });

  it('7.94 ranks a title hit above a comment hit, and breaks ties by ticket id — neither of which is the order the rows were written in', async () => {
    // `quokka` is in one TITLE (weight A, rank 1.0) and in one COMMENT (weight
    // C, rank 0.2). The comment-hit ticket has the LOWER id and was written
    // FIRST, so id order and insertion order both give the opposite answer to
    // the one this route owes.
    expect(fixtures.rankCommentId < fixtures.rankTitleId).toBe(true);
    expect(await hitIds('member', 'quokka')).toEqual([fixtures.rankTitleId, fixtures.rankCommentId]);

    // The tie-break, on a set where every rank is identical (one match, same
    // weight, same position in every title) and the rows were written in
    // DESCENDING id order: ascending ticket id is the only order that can come
    // out of this, and it is the one the contract names.
    const wombat = await hitIds('owner', 'wombat');
    expect(wombat).toEqual([...wombat].sort());
    expect(wombat[0]).toBe(fixtures.bulkIds[0]);
  });

  it('7.95 the configuration is `simple` on BOTH sides — nothing is stemmed, and the query says so in the same word the index does', async () => {
    // `licence` finds the seeded title; `licences` does not, because `simple`
    // does not stem. Both halves are needed and neither alone is evidence:
    // an `english` INDEX with an `english` QUERY would match both (the negative
    // reddens), and a `simple` index with an `english` query would match
    // neither (the positive control reddens). Only two `simple` sides pass.
    expect(await hitIds('member', 'licence')).toEqual([read.world.sharedTaskId]);
    expect(await hitIds('member', 'licences')).toEqual([]);
  });

  it('7.96 fifty is the top of the VISIBLE matches, not the top of the matches — and no invisible row’s text rides along', async () => {
    // Sixty `wombat` tickets; five are the owner's alone and all five sit inside
    // the first fifty by id. A route that cut to fifty and THEN filtered answers
    // forty-five.
    const memberIds = await hitIds('member', 'wombat');
    expect(memberIds).toEqual(fixtures.bulkVisibleIds.slice(0, 50));
    expect(memberIds).toHaveLength(50);

    // The five are absent by id AND by the word that exists only in their
    // comments — in a body carrying fifty of their visible neighbours, so this
    // is not an empty answer being read as safety.
    const response = await seededSearch('member', 'wombat');
    const body = response.body;
    for (const invisible of fixtures.bulkInvisibleIds) {
      expect(body).not.toContain(invisible);
    }
    expect(body).not.toContain('aardvark');

    // EVERY snippet is a window over ITS OWN row's text. MEASURED, and the
    // measurement is why these two lines exist: the `not.toContain('aardvark')`
    // above does NOT catch a snippet built from the whole workspace's text,
    // because a headline windows onto a MATCH and the leaked words had none.
    // Fifty snippets each carrying their own ticket's number, and fifty that are
    // all different, do catch it.
    const hits = (response.json() as SearchResponse).hits;
    for (const hit of hits) {
      const ownNumber = hit.card.title.split(' ')[2] as string;
      expect(hit.snippet).toContain('**wombat**');
      expect(hit.snippet).toContain(ownNumber);
    }
    expect(new Set(hits.map((hit) => hit.snippet)).size).toBe(50);

    // Positive controls, both directions: the owner searching the same word gets
    // the first fifty of all SIXTY (a different, overlapping, non-empty set), and
    // the owner searching `aardvark` gets exactly the five.
    expect(await hitIds('owner', 'wombat')).toEqual(fixtures.bulkIds.slice(0, 50));
    expect(await hitIds('owner', 'aardvark')).toEqual(fixtures.bulkInvisibleIds);
    // …and the member searching it gets nothing at all.
    expect(await hitIds('member', 'aardvark')).toEqual([]);
  });

  it('7.102 the snippet is a window over the row it is attached to — a term matching inside an INVISIBLE row’s comment brings none of that comment back', async () => {
    // `pangolin` matches two tickets: one the member may see (title only) and
    // one they may not (title AND a comment reading "pangolin counts filed
    // beside chinchilla receipts"). So the member's own hit HAS a snippet,
    // and the text a leak would show is a MATCHING fragment rather than an
    // off-match blob a headline would skip whether the route leaked or not.
    const response = await seededSearch('member', 'pangolin');
    expect(response.statusCode).toBe(200);
    const hits = (response.json() as SearchResponse).hits;
    expect(hits.map((hit) => hit.card.ticketId)).toEqual([fixtures.leakVisibleId]);
    expect(hits[0]?.snippet).toContain('**Pangolin**');
    expect(hits[0]?.snippet).not.toContain('chinchilla');
    expect(response.body).not.toContain('chinchilla');
    expect(response.body).not.toContain(fixtures.leakHiddenId);

    // Positive control: the owner sees both, and the hidden one's snippet DOES
    // carry the secret — so the member's snippet lacks it because of who is
    // asking, not because `ts_headline` never shows a comment.
    const owner = await seededSearch('owner', 'pangolin');
    const ownerHits = (owner.json() as SearchResponse).hits;
    expect(ownerHits.map((hit) => hit.card.ticketId).sort()).toEqual(
      [fixtures.leakVisibleId, fixtures.leakHiddenId].sort(),
    );
    expect(owner.body).toContain('chinchilla');
  });

  it('7.24 PLANTED DEFECT: the hidden ticket is unfindable by its confidential comment — no hit, no snippet, no id in the body', async () => {
    const member = await seededSearch('member', 'zebra-confidential');
    expect(member.statusCode).toBe(200);
    expect((member.json() as SearchResponse).hits).toEqual([]);
    // Never `not.toContain('zebra-confidential')`: the response echoes `query`
    // verbatim, so that assertion would fail on the echo and prove nothing about
    // the leak. These are the hidden row's id, a word of its TITLE, and a word
    // of its comment that is not in the query.
    expect(member.body).not.toContain(read.world.hiddenTaskId);
    expect(member.body).not.toContain('Salary review');
    expect(member.body).not.toContain('detail');

    // The owner finds it, snippet and all — so the member's empty answer is the
    // visibility predicate and not a term nothing matches.
    const owner = await seededSearch('owner', 'zebra-confidential');
    const hits = (owner.json() as SearchResponse).hits;
    expect(hits.map((hit) => hit.card.ticketId)).toEqual([read.world.hiddenTaskId]);
    expect(hits[0]?.snippet).toContain('detail');
  });

  it('7.25 a guest searches only their shared slice', async () => {
    // The guest is on no project and reaches work through explicit lists alone.
    // `the` matches four seeded titles; exactly one of them is theirs.
    expect(await hitIds('guest', 'the')).toEqual([read.world.guestTaskId]);
    // Positive control against the same word: the owner sees three of them, so
    // the guest's single hit is a narrowing rather than a route that answers one
    // row to everybody. taskInEpic ranks first (1.4); the other two tie at 1.0
    // and come back in id order, which is why only the head is named.
    const ownerIds = await hitIds('owner', 'the');
    expect(ownerIds[0]).toBe(read.world.taskInEpicId);
    expect(ownerIds.slice(1).sort()).toEqual([read.world.sharedTaskId, read.world.guestTaskId].sort());
  });

  it('7.97 an on-workspace member who is on no project gets 200 with `hits: []` — the emptiness is the predicate, not the door', async () => {
    const outsider = await seededSearch('outsider', 'the');
    expect(outsider.statusCode).toBe(200);
    const body = outsider.json() as SearchResponse;
    expect(body.hits).toEqual([]);
    // The envelope still names what was asked, so an empty answer is legible.
    expect(body.workspaceId).toBe(read.world.workspaceId);
    expect(body.query).toBe('the');
    expect(outsider.body).not.toContain(read.world.taskInEpicId);

    // Positive control in the same case: the same q, the same workspace, a
    // caller who may see rows.
    expect(await hitIds('owner', 'the')).toHaveLength(3);
  });
});

describe('GET /v1/search — the door', () => {
  it('7.25 no session is 401, and so is a forged bearer — the session is resolved, not merely present', async () => {
    const anonymous = await read.app.inject({
      method: 'GET',
      url: searchUrl({ workspaceId: read.world.workspaceId, q: 'the' }),
    });
    expect(anonymous.statusCode).toBe(401);
    expect(anonymous.json()).toEqual(UNAUTHENTICATED_BODY);
    expect(anonymous.body).not.toContain(read.world.taskInEpicId);

    const forged = await read.app.inject({
      method: 'GET',
      url: searchUrl({ workspaceId: read.world.workspaceId, q: 'the' }),
      headers: { authorization: 'Bearer not-a-real-session-token' },
    });
    expect(forged.statusCode).toBe(401);
    expect(forged.json()).toEqual(UNAUTHENTICATED_BODY);
    expect(forged.body).not.toContain(read.world.taskInEpicId);

    // Positive control: the same URL with a real session is a 200 with rows.
    expect(await hitIds('member', 'the')).toHaveLength(2);
  });

  it('7.25 a stranger, a neighbour and an unknown workspace id all get the SAME 404 — status, body and every header but date', async () => {
    const stranger = await seededSearch('stranger', 'the');
    const neighbour = await seededSearch('neighbour', 'the');
    const unknown = await search('owner', { workspaceId: newUlid(), q: 'the' });

    expect(stranger.statusCode).toBe(404);
    expect(stranger.json()).toEqual({ error: 'not_found' });
    expect(neighbour.statusCode).toBe(404);
    expect(unknown.statusCode).toBe(404);

    // Indistinguishable, or the route is an existence oracle: a 403 for the
    // neighbour would confirm the workspace exists to somebody with no business
    // knowing it does, and a different body for an unknown id would say which
    // workspace ids are real.
    expect(neighbour.json()).toEqual(stranger.json());
    expect(unknown.json()).toEqual(stranger.json());
    expect(comparableHeaders(neighbour)).toEqual(comparableHeaders(stranger));
    expect(comparableHeaders(unknown)).toEqual(comparableHeaders(stranger));

    // Positive control for all three: the neighbour is a real session that gets
    // 200 on their OWN workspace, so their 404 is about tenancy.
    const own = await search('neighbour', { workspaceId: read.neighbour.workspaceId, q: 'marker' });
    expect(own.statusCode).toBe(200);
    expect((own.json() as SearchResponse).hits).toHaveLength(1);
  });

  it('7.98 the door answers BEFORE the query string is parsed — a stranger sending nonsense gets the 404, where a member gets the 400', async () => {
    // Everything a member can be refused for, sent by somebody who is not in
    // this workspace at all. Each is a 404: the only answer this route gives an
    // outsider, so the query parser is not a surface they can reach.
    const nonsense: SearchParams[] = [
      { workspaceId: read.world.workspaceId, q: '' },
      { workspaceId: read.world.workspaceId, q: 'x'.repeat(501) },
      { workspaceId: read.world.workspaceId, q: 'the', filter: '{not json' },
      { workspaceId: read.world.workspaceId, q: 'the', filter: { text: 'licence' } },
    ];
    for (const params of nonsense) {
      const refused = await search('stranger', params);
      expect(refused.statusCode).toBe(404);
      expect(refused.json()).toEqual({ error: 'not_found' });
    }

    // The same four from a member are named 400s — which is what makes the four
    // 404s above the DOOR answering rather than the route refusing everything.
    for (const params of nonsense) {
      const refused = await search('member', params);
      expect(refused.statusCode).toBe(400);
    }
  });

  it('7.99 `q` is bounded at both ends and refuses the one byte the store cannot hold — each refusal named, none of them a 500', async () => {
    const empty = await seededSearch('member', '');
    expect(empty.statusCode).toBe(400);
    expect(empty.json()).toEqual({ error: 'invalid_query' });

    const absent = await search('member', { workspaceId: read.world.workspaceId });
    expect(absent.statusCode).toBe(400);
    expect(absent.json()).toEqual({ error: 'invalid_query' });

    const tooLong = await seededSearch('member', 'x'.repeat(501));
    expect(tooLong.statusCode).toBe(400);
    expect(tooLong.json()).toEqual({ error: 'invalid_query' });

    // U+0000. Postgres `text` cannot carry it, so a route that admitted it would
    // raise SQLSTATE 22021 inside the query and answer 500 — a failure reached
    // through a value that parsed, bound and compiled correctly the whole way.
    // The status being 400 rather than 500 IS the assertion here.
    const nul = await seededSearch('member', 'licence\u0000');
    expect(nul.statusCode).toBe(400);
    expect(nul.json()).toEqual({ error: 'invalid_query' });

    // Boundaries, both sides, so the bounds are pinned rather than merely
    // present: one character and five hundred are both accepted.
    const shortest = await seededSearch('member', 'e');
    expect(shortest.statusCode).toBe(200);
    const longest = await seededSearch('member', 'x'.repeat(500));
    expect(longest.statusCode).toBe(200);
    expect((longest.json() as SearchResponse).hits).toEqual([]);
  });

  it('7.100 a missing `workspaceId` is the same 400 for a member and for a stranger — it names no workspace, so it can disclose none', async () => {
    const member = await search('member', { q: 'the' });
    const stranger = await search('stranger', { q: 'the' });

    expect(member.statusCode).toBe(400);
    expect(member.json()).toEqual({ error: 'invalid_query' });
    expect(stranger.statusCode).toBe(400);
    expect(stranger.json()).toEqual(member.json());
    expect(comparableHeaders(stranger)).toEqual(comparableHeaders(member));

    // An empty one is the same refusal as an absent one.
    expect((await search('member', { workspaceId: '', q: 'the' })).statusCode).toBe(400);

    // …and with no session at all it is still the 401: the preHandler runs
    // before any of this, so a malformed query never tells an anonymous caller
    // that it was malformed.
    const anonymous = await read.app.inject({ method: 'GET', url: searchUrl({ q: 'the' }) });
    expect(anonymous.statusCode).toBe(401);
    expect(anonymous.json()).toEqual(UNAUTHENTICATED_BODY);
  });

  it('7.101 a REPEATED query parameter arrives as an array, and every one of the three is refused rather than bound', async () => {
    // `?q=a&q=b` is `['a','b']` by the time the handler reads it, not a string.
    // Each of these would otherwise be bound into a text comparison or fed to
    // `JSON.parse`, and the caller would get a 500 for a request the door owes a
    // 400 — a refusal reached through the type system's back.
    const workspaceId = read.world.workspaceId;
    const repeated: Array<{ url: string; error: string }> = [
      {
        url: `/v1/search?workspaceId=${workspaceId}&workspaceId=${read.neighbour.workspaceId}&q=the`,
        error: 'invalid_query',
      },
      { url: `/v1/search?workspaceId=${workspaceId}&q=the&q=licence`, error: 'invalid_query' },
      { url: `/v1/search?workspaceId=${workspaceId}&q=the&filter=%7B%7D&filter=%7B%7D`, error: 'invalid_filter' },
    ];
    for (const { url, error } of repeated) {
      const refused = await read.app.inject({ method: 'GET', url, headers: read.authOf('member') });
      expect(refused.statusCode).toBe(400);
      expect(refused.json()).toEqual({ error });
    }

    // Positive control: the single-valued spelling of all three is a 200, so the
    // three refusals are about the repetition and not about the URLs.
    const single = await read.app.inject({
      method: 'GET',
      url: `/v1/search?workspaceId=${workspaceId}&q=the&filter=%7B%7D`,
      headers: read.authOf('member'),
    });
    expect(single.statusCode).toBe(200);
    expect((single.json() as SearchResponse).hits).toHaveLength(2);
  });

  it('7.25 a hostile q is a plain phrase to websearch_to_tsquery, never SQL — the tables survive and the route keeps working', async () => {
    const hostile = [
      `'); DROP TABLE proj_search; --`,
      `' OR 1=1 --`,
      `"; DELETE FROM proj_tickets; --`,
      `\\'; TRUNCATE events; --`,
      `<>&|!():*`,
    ];
    for (const q of hostile) {
      const response = await seededSearch('member', q);
      // 200, not 400 and not 500: `websearch_to_tsquery` parses ANY string as a
      // phrase rather than raising, so a hostile term cannot even be turned into
      // an error the caller can read a stack trace out of.
      expect(response.statusCode).toBe(200);
      expect((response.json() as SearchResponse).hits).toEqual([]);
    }

    const intact = await db.pool.query<{ t: string | null }>(
      `SELECT to_regclass('proj_search') AS t`,
    );
    expect(intact.rows[0]?.t).toBe('proj_search');
    const tickets = await db.pool.query<{ n: string }>('SELECT count(*) AS n FROM proj_tickets');
    expect(Number(tickets.rows[0]?.n)).toBeGreaterThan(60);

    // The positive control that makes the five empty answers mean "no match"
    // rather than "this route stopped working": the same route, a real term,
    // after all five.
    expect(await hitIds('member', 'licence')).toEqual([read.world.sharedTaskId]);
  });
});
