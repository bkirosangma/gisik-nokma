import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  EMPTY_PREFERENCES,
  membershipId,
  newUlid,
  type LedgerEvent,
  type PreferencesDoc,
} from '@gisik-nokma/domain';
import { INTERNAL_ERROR_BODY } from '../../src/app.js';
import { UNAUTHENTICATED_BODY } from '../../src/auth/require-session.js';
import { READ_NOT_FOUND_BODY } from '../../src/read/membership.js';
import { applyCommitted, makeCommitted } from '../helpers/apply.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { buildReadTestApp, type ReadRole, type ReadWorld } from '../helpers/read-app.js';

/**
 * Plan 5 Task 13 — `GET`/`PUT /v1/me/preferences`, the FIRST WRITE SURFACE in
 * this plan.
 *
 * ## What is different about this one, stated before anything is asserted
 *
 * Every route in Tasks 8–12 answered a question about stored claims. This one
 * lets a caller CHANGE server state, so the questions a read test never had to
 * ask are the ones this file is built around:
 *
 * 1. **Whose preferences may a caller write?** Only their own, and the identity
 *    comes from the SESSION. There is deliberately no parameter naming a user —
 *    but "the route does not declare one" is not "the route does not read one",
 *    and Fastify hands every unknown query parameter to the handler regardless.
 *    So 7.125 SENDS every spelling a broken implementation would reach for, on
 *    BOTH verbs, and pins the answer byte-for-byte against the request that
 *    names nobody, with the other user's stored document read back afterwards.
 * 2. **Is a preference an event or a row?** A row, and that is the project's one
 *    stated exception to everything-is-an-attributed-claim (amendment 14):
 *    preferences ARRANGE the record, they never say anything about it, so there
 *    is nothing to attribute and nothing to replay. 7.31 makes the exception
 *    falsifiable — a PUT appends ZERO ledger events — with two controls in the
 *    same case, because "no events were written" and "nothing happened at all"
 *    are the same bytes otherwise: the events count is non-zero before, an
 *    appended event moves it, and the preferences row IS there afterwards.
 * 3. **What does an unset preference read as?** `EMPTY_PREFERENCES`, and the
 *    collapse is deliberate: a caller cannot tell "never saved" from "saved an
 *    empty document" (7.124). That is the OPPOSITE of the decision one task
 *    earlier — `proj_workspace_settings` keeps never-claimed and claimed-7
 *    apart, because a threshold is somebody's claim and the product must be able
 *    to say whose. Here there is nobody to attribute and no screen that could
 *    show the difference. Stated in `preferences.ts`, asserted here.
 * 4. **The payload is actor-supplied and half of it is OBJECT KEYS.** 7.129 is
 *    the door half of the domain suite's key case: `__proto__` and friends are
 *    refused end-to-end with nothing stored, beside a real project id that
 *    round-trips.
 *
 * ## The door, in the branch's order
 *
 * - **401** `{error:'unauthenticated'}` — no session, and a FORGED bearer alike,
 *   on both verbs (7.127), with the same URL answering 200 once a session is
 *   attached.
 * - **400 `{error:'invalid_query'}`** — a missing, empty or REPEATED
 *   `workspaceId` (7.128). It is a QUERY parameter here, not a path segment, so
 *   unlike the attention strip this route has a 400 cell; the shape is inherited
 *   verbatim from `routes/my-work.ts`, the other `/v1/me` route.
 * - **404** — a caller outside the workspace, the owner of a NEIGHBOUR
 *   workspace and an unknown workspace id, byte-identical down to
 *   `content-length` (7.31).
 * - **200** — any MEMBER, whatever their role. There is no role gate above
 *   membership and a guest writes their own preferences like anyone else
 *   (7.131): a preference is per-user, so there is no such thing as one somebody
 *   else may not have.
 *
 * **`requireMember` runs BEFORE the body is parsed**, which is this file's one
 * deliberate deviation from the plan snippet's order. An unauthorised caller's
 * payload is never parsed at all, and the 404 is unconditional — 7.31 pins that
 * a stranger sending a MALFORMED body gets the same 404 bytes as a stranger
 * sending a good one, and that neither wrote a row.
 *
 * ## Nothing on this response reads a clock
 *
 * `user_preferences.updated_at` is written by Postgres `now()` and is on no
 * response: the document a caller gets back is the document they sent. So a
 * `TZ`-varying case here could not fail, and the honest thing is to say so
 * rather than write one — the same statement `my-work.test.ts`,
 * `search.test.ts`, `board.test.ts` and `list.test.ts` make. `attention.test.ts`
 * is where the IST rules bind.
 *
 * ## Two cases MUTATE state other cases read, and are declared last
 *
 * 7.126 seeds `member` into the NEIGHBOUR workspace so one person can hold two
 * documents, and 7.132 writes a corrupt row straight into `user_preferences` to
 * prove the read validates. Both are declared after every case that reads the
 * rows they touch, and 7.132 deletes what it wrote — vitest runs a file's cases
 * in declaration order.
 */

/**
 * Derived from `inject` rather than imported from `light-my-request`, which is
 * Fastify's own transitive dependency and not this package's: the same shape
 * `my-work.test.ts` and `attention.test.ts` use.
 */
type InjectResponse = Awaited<ReturnType<FastifyInstance['inject']>>;

let db: TestDatabase;
let read: ReadWorld;

beforeAll(async () => {
  db = await createTestDatabase();
  read = await buildReadTestApp(db);
}, 120_000);

afterAll(async () => {
  await read.app.close();
  await db.drop();
});

/** A real project id shape — the records are keyed by project id, so ULIDs. */
const OTHER_PROJECT = '01J60000000000000000000PRJ';

function url(params: Record<string, string | string[] | undefined>): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    for (const one of Array.isArray(value) ? value : [value]) {
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(one)}`);
    }
  }
  return `/v1/me/preferences${parts.length === 0 ? '' : `?${parts.join('&')}`}`;
}

/** The seeded workspace, which is what almost every case wants. */
function here(extra: Record<string, string | string[] | undefined> = {}): string {
  return url({ workspaceId: read.world.workspaceId, ...extra });
}

async function get(
  role: ReadRole,
  target: string = here(),
): Promise<InjectResponse> {
  return read.app.inject({ method: 'GET', url: target, headers: read.authOf(role) });
}

async function put(
  role: ReadRole,
  body: unknown,
  target: string = here(),
): Promise<InjectResponse> {
  return read.app.inject({
    method: 'PUT',
    url: target,
    headers: { ...read.authOf(role), 'content-type': 'application/json' },
    payload: JSON.stringify(body),
  });
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

async function storedRowCount(): Promise<number> {
  const { rows } = await db.pool.query<{ n: number }>(
    'SELECT count(*)::int AS n FROM user_preferences',
  );
  return rows[0]?.n ?? -1;
}

/** The stored document for one user, read from the table rather than the route. */
async function storedDoc(userId: string, workspaceId: string): Promise<unknown> {
  const { rows } = await db.pool.query<{ doc: unknown }>(
    'SELECT doc FROM user_preferences WHERE user_id = $1 AND workspace_id = $2',
    [userId, workspaceId],
  );
  return rows.length === 0 ? null : rows[0]?.doc;
}

async function eventCount(): Promise<number> {
  const { rows } = await db.pool.query<{ n: number }>('SELECT count(*)::int AS n FROM events');
  return rows[0]?.n ?? -1;
}

const A_DOC: PreferencesDoc = {
  savedFilters: [{ id: 'sf1', name: 'My blocked', filterSpec: { blocked: true } }],
  listColumns: { [OTHER_PROJECT]: ['status', 'assignee', 'dueDate'] },
  grouping: { [OTHER_PROJECT]: 'epic' },
};

// ---------------------------------------------------------------------------

describe('/v1/me/preferences — server-owned view preferences', () => {
  it('7.124 answers the empty document before anything is saved — "never set" and "set to empty" are ONE answer', async () => {
    const response = await get('member');
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(EMPTY_PREFERENCES);

    // The collapse, executed rather than asserted about the type: there is NO
    // row for this user, and after saving the empty document there IS one — and
    // the two reads are byte-identical, headers included. A client cannot tell
    // them apart, which is the decision `preferences.ts` states.
    expect(await storedDoc(read.userIds.member, read.world.workspaceId)).toBeNull();
    const saved = await put('member', EMPTY_PREFERENCES);
    expect(saved.statusCode).toBe(200);
    expect(await storedDoc(read.userIds.member, read.world.workspaceId)).toEqual(EMPTY_PREFERENCES);

    const afterSaving = await get('member');
    expect(afterSaving.body).toBe(response.body);
    expect(comparableHeaders(afterSaving)).toEqual(comparableHeaders(response));

    // Positive control for the two identical bodies: a DIFFERENT document
    // answers different bytes through the same reader, so "identical" above is
    // a fact about these two states and not about a route that always answers
    // the same thing.
    expect((await put('member', A_DOC)).statusCode).toBe(200);
    expect((await get('member')).body).not.toBe(response.body);

    // Left as it was found, so the cases after this one start from empty.
    await db.pool.query('DELETE FROM user_preferences WHERE user_id = $1', [read.userIds.member]);
  });

  it('7.31 round-trips a full document and REPLACES it wholesale on the next PUT', async () => {
    const stored = await put('member', A_DOC);
    expect(stored.statusCode).toBe(200);
    // The PUT answers what it stored, so a client needs no second call to know.
    expect(stored.json()).toEqual(A_DOC);
    expect(await get('member').then((r) => r.json())).toEqual(A_DOC);

    // A saved filter's whole FilterSpec survives the trip through jsonb — the
    // nested shape is the part a naive column-per-preference table would lose.
    const replacement: PreferencesDoc = {
      savedFilters: [],
      listColumns: {},
      grouping: { [read.world.projectId]: 'flat' },
    };
    expect((await put('member', replacement)).statusCode).toBe(200);
    const after = await get('member');
    expect(after.json()).toEqual(replacement);

    // FULL REPLACE, said as an absence with its positive control beside it: the
    // saved filter is gone, the new grouping is there, and the OLD project key
    // is gone from `grouping` while the new one is present — a merge would have
    // kept all three.
    expect(after.body).not.toContain('My blocked');
    expect(after.body).not.toContain(OTHER_PROJECT);
    expect(after.body).toContain(read.world.projectId);

    // One row, not two: the upsert replaced rather than accumulated.
    expect(await storedRowCount()).toBe(1);
    const { rows } = await db.pool.query<{ updated_at: Date }>(
      'SELECT updated_at FROM user_preferences WHERE user_id = $1',
      [read.userIds.member],
    );
    expect(rows[0]?.updated_at).toBeInstanceOf(Date);

    await db.pool.query('DELETE FROM user_preferences WHERE user_id = $1', [read.userIds.member]);
  });

  it('7.31 a malformed document is refused WHOLE — nothing partial, nothing stored', async () => {
    const good: PreferencesDoc = {
      savedFilters: [{ id: 'keep', name: 'Keep me', filterSpec: { stateCategory: 'active' } }],
      listColumns: {},
      grouping: {},
    };
    expect((await put('member', good)).statusCode).toBe(200);

    // One legal saved filter beside one illegal one: a route that stored what it
    // could parse would keep the first and drop the second.
    const half = {
      savedFilters: [
        { id: 'keep2', name: 'Legal', filterSpec: { blocked: true } },
        { id: 'bad', name: 'Bad', filterSpec: { velocity: 9 } },
      ],
      listColumns: { [read.world.projectId]: ['status'] },
      grouping: {},
    };
    const refused = await put('member', half);
    expect(refused.statusCode).toBe(400);
    expect(refused.json()).toEqual({ error: 'invalid_preferences' });

    // The PRIOR document is intact — not replaced, not emptied, not merged.
    expect(await get('member').then((r) => r.json())).toEqual(good);
    expect(await storedDoc(read.userIds.member, read.world.workspaceId)).toEqual(good);
    expect(refused.body).not.toContain('keep2');

    // Every other way of being malformed answers the SAME named refusal, so a
    // client parses one shape: an unknown top-level key, a bad grouping, a
    // non-object, an array, and a document missing a required slot.
    const malformed: unknown[] = [
      { ...EMPTY_PREFERENCES, theme: 'dark' },
      { ...EMPTY_PREFERENCES, grouping: { [read.world.projectId]: 'priority' } },
      { savedFilters: [] },
      [],
      'preferences',
      null,
      42,
    ];
    for (const body of malformed) {
      const response = await put('member', body);
      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ error: 'invalid_preferences' });
      // And it echoes no internals: no table name, no column name, no zod path.
      expect(response.body).not.toContain('user_preferences');
      expect(response.body).not.toContain('savedFilters');
    }

    // Positive control for all eight refusals: the same route with a legal
    // document is a 200, and the stored document is still the one from the top.
    expect((await put('member', good)).statusCode).toBe(200);
    expect(await get('member').then((r) => r.json())).toEqual(good);

    await db.pool.query('DELETE FROM user_preferences WHERE user_id = $1', [read.userIds.member]);
  });

  it('7.31 a PUT appends NO ledger events — preferences arrange truth, they are not history', async () => {
    const eventsBefore = await eventCount();
    // The counter is over a NON-EMPTY ledger, so "unchanged" is a fact about a
    // table that has rows in it rather than about one nothing ever writes to.
    expect(eventsBefore).toBeGreaterThan(0);
    const rowsBefore = await storedRowCount();

    expect((await put('member', A_DOC)).statusCode).toBe(200);

    expect(await eventCount()).toBe(eventsBefore);
    // FIRST control: the PUT did something. "No events" and "the request did
    // nothing at all" are otherwise the same two numbers.
    expect(await storedRowCount()).toBe(rowsBefore + 1);
    expect(await storedDoc(read.userIds.member, read.world.workspaceId)).toEqual(A_DOC);

    // SECOND control: the counter can move. An event appended through the
    // ordinary seeding path raises it by exactly one, so the unchanged count
    // above is the preferences write and not a query that always answers the
    // same number.
    const marker: LedgerEvent[] = [
      makeCommitted({
        workspaceId: read.world.workspaceId,
        actorId: read.world.owner,
        entity: { kind: 'project', id: read.world.projectId },
        type: 'project.member_added',
        payload: { userId: read.userIds.admin, projectAdmin: false },
      }),
    ];
    await applyCommitted(db.pool, marker);
    expect(await eventCount()).toBe(eventsBefore + 1);

    // A second PUT still writes nothing to the ledger, now measured from the
    // moved baseline.
    const moved = await eventCount();
    expect((await put('member', EMPTY_PREFERENCES)).statusCode).toBe(200);
    expect(await eventCount()).toBe(moved);

    await db.pool.query('DELETE FROM user_preferences WHERE user_id = $1', [read.userIds.member]);
  });

  it('7.31 a stranger, a neighbour and an unknown workspace get the SAME 404 on both verbs — and write nothing', async () => {
    const rowsBefore = await storedRowCount();

    const strangerGet = await get('stranger');
    const neighbourGet = await get('neighbour');
    const unknownGet = await get('owner', url({ workspaceId: newUlid() }));
    const strangerPut = await put('stranger', A_DOC);
    const neighbourPut = await put('neighbour', A_DOC);

    for (const response of [strangerGet, neighbourGet, unknownGet, strangerPut, neighbourPut]) {
      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual(READ_NOT_FOUND_BODY);
    }

    // Indistinguishable, or the route is an existence oracle: a 403 for the
    // neighbour would confirm the workspace exists to somebody with no business
    // knowing it does, and a different body for an unknown id would say which
    // workspace ids are real.
    expect(comparableHeaders(neighbourGet)).toEqual(comparableHeaders(strangerGet));
    expect(comparableHeaders(unknownGet)).toEqual(comparableHeaders(strangerGet));

    // The membership gate runs BEFORE the body is parsed, so an unauthorised
    // caller's payload is never even read: a MALFORMED body from a stranger is
    // the same 404, byte for byte, as a well-formed one. A route that validated
    // first would answer 400 here and tell a stranger their document was the
    // problem rather than their standing.
    const strangerGarbage = await put('stranger', { savedFilters: [{ velocity: 9 }] });
    expect(strangerGarbage.statusCode).toBe(404);
    expect(strangerGarbage.body).toBe(strangerPut.body);
    expect(comparableHeaders(strangerGarbage)).toEqual(comparableHeaders(strangerPut));

    // Nothing was written by any of the five refused writes.
    expect(await storedRowCount()).toBe(rowsBefore);
    expect(await storedDoc(read.userIds.stranger, read.world.workspaceId)).toBeNull();
    expect(await storedDoc(read.userIds.neighbour, read.world.workspaceId)).toBeNull();

    // Positive control for all of it: the neighbour is a real session that gets
    // 200 on their OWN workspace and can write there, so their 404 is about
    // tenancy and not about them.
    const own = url({ workspaceId: read.neighbour.workspaceId });
    expect((await get('neighbour', own)).statusCode).toBe(200);
    expect((await put('neighbour', A_DOC, own)).statusCode).toBe(200);
    expect(await storedDoc(read.userIds.neighbour, read.neighbour.workspaceId)).toEqual(A_DOC);
    await db.pool.query('DELETE FROM user_preferences WHERE user_id = $1', [read.userIds.neighbour]);
  });

  it('7.125 the subject is the SESSION — no parameter can read or write somebody else’s preferences', async () => {
    // The owner has a document of their own, which is what an impersonating
    // read would answer and an impersonating write would destroy.
    const ownersOwn: PreferencesDoc = {
      savedFilters: [{ id: 'owner-sf', name: 'Owner only', filterSpec: { stateCategory: 'open' } }],
      listColumns: { [read.world.projectId]: ['status'] },
      grouping: {},
    };
    expect((await put('owner', ownersOwn)).statusCode).toBe(200);
    const membersOwn: PreferencesDoc = {
      savedFilters: [{ id: 'member-sf', name: 'Member only', filterSpec: { blocked: true } }],
      listColumns: {},
      grouping: { [read.world.projectId]: 'type' },
    };
    expect((await put('member', membersOwn)).statusCode).toBe(200);

    // Every spelling a route reading an actor-supplied identity would reach for,
    // all naming the OWNER, sent by the member.
    const impersonating = here({
      userId: read.userIds.owner,
      user_id: read.userIds.owner,
      viewerId: read.userIds.owner,
      as: read.userIds.owner,
      subject: read.userIds.owner,
    });

    const plainRead = await get('member');
    const impersonatingRead = await get('member', impersonating);
    expect(impersonatingRead.statusCode).toBe(200);
    // BYTE-IDENTICAL to the request that named nobody: same body, same headers,
    // content-length included.
    expect(impersonatingRead.body).toBe(plainRead.body);
    expect(comparableHeaders(impersonatingRead)).toEqual(comparableHeaders(plainRead));
    // Said the other way round, so a route that DID read the parameter cannot
    // pass by coincidentally answering the same rows.
    expect(impersonatingRead.body).not.toContain('Owner only');
    expect(impersonatingRead.body).toContain('Member only');

    // The WRITE is the whole risk: the member PUTs their own document at a URL
    // naming the owner five ways.
    const overwrite: PreferencesDoc = {
      savedFilters: [{ id: 'sneak', name: 'Written by the member', filterSpec: {} }],
      listColumns: {},
      grouping: {},
    };
    const impersonatingWrite = await put('member', overwrite, impersonating);
    expect(impersonatingWrite.statusCode).toBe(200);

    // The owner's stored document is untouched — read from the TABLE, so this
    // is about what was stored and not about what a reader chose to show.
    expect(await storedDoc(read.userIds.owner, read.world.workspaceId)).toEqual(ownersOwn);
    // And the member's own document IS the one that moved: the positive control
    // that makes the untouched row above a filter rather than a write that
    // failed altogether.
    expect(await storedDoc(read.userIds.member, read.world.workspaceId)).toEqual(overwrite);
    expect(await get('owner').then((r) => r.json())).toEqual(ownersOwn);

    // And a body that names a user is refused outright rather than obeyed: the
    // document is `.strict()`, so `userId` is an unknown key.
    const bodyNamingSomebody = await put('member', { ...EMPTY_PREFERENCES, userId: read.userIds.owner });
    expect(bodyNamingSomebody.statusCode).toBe(400);
    expect(bodyNamingSomebody.json()).toEqual({ error: 'invalid_preferences' });
    expect(await storedDoc(read.userIds.owner, read.world.workspaceId)).toEqual(ownersOwn);
  });

  it('7.126 the document is keyed by (user, workspace) — four people-in-places, four documents', async () => {
    // `member` is granted a membership NEXT DOOR, which is the only way one
    // person can hold two documents. Seeded here rather than in `read-app.ts`:
    // this is Task 13's fixture, and every other file's world stays as it was.
    await applyCommitted(db.pool, [
      makeCommitted({
        workspaceId: read.neighbour.workspaceId,
        actorId: read.userIds.neighbour,
        entity: {
          kind: 'membership',
          id: membershipId(read.neighbour.workspaceId, read.userIds.member),
        },
        type: 'membership.granted',
        payload: { userId: read.userIds.member, role: 'member' },
      }),
    ]);

    const nextDoor = url({ workspaceId: read.neighbour.workspaceId });
    const hereDoc: PreferencesDoc = {
      savedFilters: [{ id: 'here', name: 'This workspace', filterSpec: {} }],
      listColumns: {},
      grouping: {},
    };
    const thereDoc: PreferencesDoc = {
      savedFilters: [{ id: 'there', name: 'Next door', filterSpec: {} }],
      listColumns: {},
      grouping: {},
    };
    expect((await put('member', hereDoc)).statusCode).toBe(200);
    expect((await put('member', thereDoc, nextDoor)).statusCode).toBe(200);

    // The same session, two workspaces, two documents — neither leaking into the
    // other's answer.
    expect(await get('member').then((r) => r.json())).toEqual(hereDoc);
    expect(await get('member', nextDoor).then((r) => r.json())).toEqual(thereDoc);

    // And two people in ONE workspace keep their own: the owner's document from
    // the case above is still theirs.
    const ownerHere = await get('owner');
    expect(ownerHere.statusCode).toBe(200);
    expect((ownerHere.json() as PreferencesDoc).savedFilters[0]?.name).toBe('Owner only');
    expect(ownerHere.body).not.toContain('This workspace');

    // Three rows, three distinct (user, workspace) pairs — asserted as the rows
    // themselves, so a reader that filtered correctly over a table holding one
    // row could not pass this.
    const { rows } = await db.pool.query<{ user_id: string; workspace_id: string }>(
      'SELECT user_id, workspace_id FROM user_preferences ORDER BY user_id, workspace_id',
    );
    const expected = [
      { user_id: read.userIds.member, workspace_id: read.world.workspaceId },
      { user_id: read.userIds.member, workspace_id: read.neighbour.workspaceId },
      { user_id: read.userIds.owner, workspace_id: read.world.workspaceId },
    ].sort((a, b) =>
      a.user_id === b.user_id
        ? a.workspace_id.localeCompare(b.workspace_id)
        : a.user_id.localeCompare(b.user_id),
    );
    expect(rows).toEqual(expected);
  });

  it('7.127 no session is 401 on both verbs, and so is a forged bearer', async () => {
    for (const method of ['GET', 'PUT'] as const) {
      const payload = method === 'PUT' ? JSON.stringify(A_DOC) : undefined;
      const headers = method === 'PUT' ? { 'content-type': 'application/json' } : {};

      const anonymous = await read.app.inject({ method, url: here(), headers, payload });
      expect(anonymous.statusCode).toBe(401);
      expect(anonymous.json()).toEqual(UNAUTHENTICATED_BODY);

      const forged = await read.app.inject({
        method,
        url: here(),
        headers: { ...headers, authorization: 'Bearer not-a-real-session-token' },
        payload,
      });
      expect(forged.statusCode).toBe(401);
      expect(forged.json()).toEqual(UNAUTHENTICATED_BODY);
    }

    // Nothing an unauthenticated caller sent was stored: the member's document
    // is the one THEY last wrote, not `A_DOC`.
    expect((await storedDoc(read.userIds.member, read.world.workspaceId) as PreferencesDoc)
      .savedFilters[0]?.id).toBe('here');

    // Positive control: the SAME url with a real session answers 200 on both
    // verbs, so the 401s are the session check and not the route being closed.
    expect((await get('member')).statusCode).toBe(200);
    expect((await put('member', EMPTY_PREFERENCES)).statusCode).toBe(200);
  });

  it('7.128 a missing, empty or REPEATED workspaceId is 400 invalid_query on both verbs — and the session check still runs first', async () => {
    const malformed: Record<string, string | string[] | undefined>[] = [
      {},
      { workspaceId: '' },
      { workspaceId: [read.world.workspaceId, read.neighbour.workspaceId] },
    ];

    for (const params of malformed) {
      const target = url(params);
      for (const response of [await get('member', target), await put('member', A_DOC, target)]) {
        expect(response.statusCode).toBe(400);
        expect(response.json()).toEqual({ error: 'invalid_query' });
      }

      // A request that names no workspace has no membership question to answer
      // and nothing it could disclose, so a stranger is told the same thing —
      // headers included.
      const memberSays = await get('member', target);
      const strangerSays = await get('stranger', target);
      expect(strangerSays.body).toBe(memberSays.body);
      expect(comparableHeaders(strangerSays)).toEqual(comparableHeaders(memberSays));

      // The session check runs FIRST: a malformed query from nobody is 401.
      const anonymous = await read.app.inject({ method: 'GET', url: target });
      expect(anonymous.statusCode).toBe(401);
      expect(anonymous.json()).toEqual(UNAUTHENTICATED_BODY);
    }

    // A repeated `workspaceId` refuses rather than picking one — asserted by
    // what did NOT happen: neither workspace's document moved.
    const repeated = url({ workspaceId: [read.world.workspaceId, read.neighbour.workspaceId] });
    const before = [
      await storedDoc(read.userIds.member, read.world.workspaceId),
      await storedDoc(read.userIds.member, read.neighbour.workspaceId),
    ];
    expect((await put('member', A_DOC, repeated)).statusCode).toBe(400);
    expect(await storedDoc(read.userIds.member, read.world.workspaceId)).toEqual(before[0]);
    expect(await storedDoc(read.userIds.member, read.neighbour.workspaceId)).toEqual(before[1]);

    // Positive control: the same route with a well-formed workspaceId is 200.
    expect((await get('member')).statusCode).toBe(200);
  });

  it('7.129 a dangerous object key is refused twice over — once by the parser, once by the schema on a path the parser does not guard', async () => {
    const priorRows = await storedRowCount();
    const prior = await storedDoc(read.userIds.member, read.world.workspaceId);

    const rawPut = async (payload: string): Promise<InjectResponse> =>
      read.app.inject({
        method: 'PUT',
        url: here(),
        headers: { ...read.authOf('member'), 'content-type': 'application/json' },
        // Raw BYTES, so `__proto__` arrives the way a real client sends it
        // rather than the way a JS object literal would silently rewrite it into
        // a prototype assignment that creates no key at all.
        payload,
      });

    // MEASURED, and worth stating because it is not what the schema does:
    // Fastify parses bodies with secure-json-parse, which REFUSES a `__proto__`
    // key outright. So that one key never reaches the handler at all, and its
    // answer is Fastify's own parse refusal rather than this route's named 400.
    // Recorded as the layering it is, not papered over — a client sees a
    // different body for that key than for its neighbours.
    for (const body of [
      '{"savedFilters": [], "listColumns": {"__proto__": ["status"]}, "grouping": {}}',
      '{"savedFilters": [], "listColumns": {}, "grouping": {"__proto__": "flat"}}',
    ]) {
      const response = await rawPut(body);
      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual(
        expect.objectContaining({ code: 'FST_ERR_CTP_INVALID_JSON_BODY' }),
      );
    }

    // The keys the parser does NOT object to are refused by the key schema, with
    // this route's named 400. `toString` and `constructor` are the dangerous
    // ones: both survive `JSON.parse` as ordinary own properties, and both are
    // names an indexer would otherwise resolve to a function on the prototype.
    for (const rogue of ['toString', 'constructor', 'prototype', 'prj_01', '']) {
      for (const body of [
        `{"savedFilters": [], "listColumns": {${JSON.stringify(rogue)}: ["status"]}, "grouping": {}}`,
        `{"savedFilters": [], "listColumns": {}, "grouping": {${JSON.stringify(rogue)}: "flat"}}`,
      ]) {
        const response = await rawPut(body);
        expect(response.statusCode).toBe(400);
        expect(response.json()).toEqual({ error: 'invalid_preferences' });
      }
    }

    // Nothing landed, and no row was created for a caller who had none.
    expect(await storedRowCount()).toBe(priorRows);
    expect(await storedDoc(read.userIds.member, read.world.workspaceId)).toEqual(prior);
    // Nothing was polluted on the way through either.
    expect(({} as Record<string, unknown>)['status']).toBeUndefined();

    // THE PATH THE PARSER DOES NOT GUARD, and the reason the key schema is not
    // redundant with Fastify: a row already IN the table is read back through
    // `preferencesDocSchema` with no HTTP parser anywhere near it. Written here
    // as raw jsonb — which stores `__proto__` as an ordinary key, and which
    // node-postgres hands back through `JSON.parse` as an own property — the
    // read REFUSES rather than answering a document with a key the type says
    // cannot be there.
    await db.pool.query(
      `INSERT INTO user_preferences (user_id, workspace_id, doc, updated_at)
       VALUES ($1, $2, $3::jsonb, now())
       ON CONFLICT (user_id, workspace_id) DO UPDATE SET doc = EXCLUDED.doc`,
      [
        read.userIds.member,
        read.world.workspaceId,
        '{"savedFilters": [], "listColumns": {"__proto__": ["status"]}, "grouping": {}}',
      ],
    );
    // The row really does carry the key — otherwise the refusal below would be
    // about a document Postgres had quietly dropped rather than about the guard.
    const { rows } = await db.pool.query<{ keys: string[] }>(
      `SELECT ARRAY(SELECT jsonb_object_keys(doc -> 'listColumns')) AS keys
         FROM user_preferences WHERE user_id = $1 AND workspace_id = $2`,
      [read.userIds.member, read.world.workspaceId],
    );
    expect(rows[0]?.keys).toEqual(['__proto__']);

    const poisoned = await get('member');
    expect(poisoned.statusCode).toBe(500);
    expect(poisoned.json()).toEqual(INTERNAL_ERROR_BODY);

    // Positive control: a REAL project id in exactly the same position is a 200
    // that round-trips with the key intact — so the twelve refusals are a bound
    // on the key space and not a route that refuses every record.
    const legal = `{"savedFilters": [], "listColumns": {"${read.world.projectId}": ["status"]}, "grouping": {"${read.world.projectId}": "flat"}}`;
    const accepted = await rawPut(legal);
    expect(accepted.statusCode).toBe(200);
    const readBack = await get('member');
    expect(readBack.statusCode).toBe(200);
    expect(Object.getOwnPropertyNames((readBack.json() as PreferencesDoc).listColumns)).toEqual([
      read.world.projectId,
    ]);
  });

  it('7.130 four different malformed requests answer four DISTINGUISHABLE refusals, and none of them stores anything', async () => {
    const prior = await storedDoc(read.userIds.member, read.world.workspaceId);
    const send = async (payload: string, contentType?: string): Promise<InjectResponse> =>
      read.app.inject({
        method: 'PUT',
        url: here(),
        headers: {
          ...read.authOf('member'),
          ...(contentType === undefined ? {} : { 'content-type': contentType }),
        },
        payload,
      });

    // 1. Bytes that are not JSON: Fastify's parse refusal, re-sent verbatim by
    //    the app's error handler. A client must be able to tell "your bytes are
    //    not JSON" from "your document is not a preferences document", so this
    //    is asserted NOT to be this route's named 400.
    const garbage = await send('{"savedFilters": [', 'application/json');
    expect(garbage.statusCode).toBe(400);
    expect(garbage.json()).toEqual(
      expect.objectContaining({ code: 'FST_ERR_CTP_INVALID_JSON_BODY' }),
    );
    expect(garbage.json()).not.toEqual({ error: 'invalid_preferences' });

    // 2. No content type at all: 415, and the handler never runs.
    const noType = await send('{"savedFilters": [], "listColumns": {}, "grouping": {}}');
    expect(noType.statusCode).toBe(415);
    expect(noType.json()).toEqual(
      expect.objectContaining({ code: 'FST_ERR_CTP_INVALID_MEDIA_TYPE' }),
    );

    // 3. A body past Fastify's 1 MiB limit: 413, and the handler never runs.
    //    MEASURED rather than assumed, and it is the ONLY bound on how much a
    //    caller may store — `preferences.ts` declines to invent a second one and
    //    says so. 1.1 MiB of padding inside an otherwise legal document.
    const huge = JSON.stringify({
      savedFilters: [{ id: 'big', name: 'x'.repeat(100), filterSpec: { text: 'y' } }],
      listColumns: {},
      grouping: {},
      padding: 'z'.repeat(1_150_000),
    });
    const oversized = await send(huge, 'application/json');
    expect(oversized.statusCode).toBe(413);
    expect(oversized.json()).toEqual(
      expect.objectContaining({ code: 'FST_ERR_CTP_BODY_TOO_LARGE' }),
    );

    // 4. A content type Fastify DOES parse, into something that is not a
    //    document: `text/plain` hands the handler a string, and a string fails
    //    the schema like any other non-document. That one IS
    //    `invalid_preferences`, and it is the right answer — the bytes arrived
    //    intact and were understood; what they said was not a preferences
    //    document. Stated rather than smoothed over, because it means the two
    //    families of refusal are separated by whether the body PARSED, not by
    //    whether it was JSON.
    const plain = await send('savedFilters', 'text/plain');
    expect(plain.statusCode).toBe(400);
    expect(plain.json()).toEqual({ error: 'invalid_preferences' });

    // None of the four stored anything, and none leaked internals.
    expect(await storedDoc(read.userIds.member, read.world.workspaceId)).toEqual(prior);
    for (const response of [garbage, noType, oversized, plain]) {
      expect(response.body).not.toContain('user_preferences');
      expect(response.body).not.toContain('INSERT');
    }

    // Positive control for all four: a well-formed document on the same verb,
    // just under the limit, is a 200 — so the refusals are bounds and not the
    // route's only answer.
    expect((await put('member', EMPTY_PREFERENCES)).statusCode).toBe(200);
  });

  it('7.131 membership is the WHOLE gate — a guest writes their own preferences like anyone else', async () => {
    // A guest reaches work only through explicit lists and an outsider is on no
    // project at all; neither fact touches preferences, because a preference is
    // per-user and there is no such thing as one somebody else may not have.
    for (const role of ['guest', 'outsider', 'admin', 'projectLead'] as const) {
      const doc: PreferencesDoc = {
        savedFilters: [{ id: role, name: `Saved by ${role}`, filterSpec: { blocked: true } }],
        listColumns: {},
        grouping: {},
      };
      expect((await put(role, doc)).statusCode).toBe(200);
      expect(await get(role).then((r) => r.json())).toEqual(doc);
      expect(await storedDoc(read.userIds[role], read.world.workspaceId)).toEqual(doc);
    }

    // Each got their OWN, which is what stops the four 200s above being one
    // shared row four callers can see.
    const bodies = await Promise.all(
      (['guest', 'outsider', 'admin', 'projectLead'] as const).map(async (role) =>
        (await get(role)).body,
      ),
    );
    expect(new Set(bodies).size).toBe(4);
    expect((await get('guest')).body).not.toContain('Saved by admin');
  });

  it('7.132 a stored document that no longer parses is a 500 with the FIXED body — no zod path, no SQL, no leak', async () => {
    // Only this route writes this table, and it validates on the way in — so
    // this state is reachable only by a future schema tightening. It is written
    // here directly to prove what happens then: the read REFUSES rather than
    // quietly answering a document nobody wrote.
    await db.pool.query(
      `INSERT INTO user_preferences (user_id, workspace_id, doc, updated_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (user_id, workspace_id) DO UPDATE SET doc = EXCLUDED.doc`,
      [
        read.userIds.member,
        read.world.workspaceId,
        // TWO ways of being unreadable, and the second is load-bearing: a
        // top-level key `preferencesDocSchema` does not admit. The recovery
        // below then proves the upsert REPLACES rather than merges — a shallow
        // `jsonb ||` would keep `theme`, and the next GET would 500 again.
        // MEASURED: with the merge in place this case is the one that reddens,
        // and it is the only one that does, because every document the door
        // accepts carries all three top-level keys and a shallow merge of those
        // three IS a replace.
        JSON.stringify({ savedFilters: 'not-an-array', theme: 'dark' }),
      ],
    );

    const response = await get('member');
    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual(INTERNAL_ERROR_BODY);
    expect(response.body).not.toContain('savedFilters');
    expect(response.body).not.toContain('user_preferences');
    expect(response.body).not.toContain('not-an-array');

    // A PUT still works — it REPLACES the unreadable document rather than being
    // blocked by it or merged into it, which is the only recovery a client has.
    // The stored row is read back from the table too, so "replaced" is a fact
    // about the row and not about what the reader chose to show.
    expect((await put('member', EMPTY_PREFERENCES)).statusCode).toBe(200);
    const recovered = await get('member');
    expect(recovered.statusCode).toBe(200);
    expect(recovered.json()).toEqual(EMPTY_PREFERENCES);
    expect(await storedDoc(read.userIds.member, read.world.workspaceId)).toEqual(EMPTY_PREFERENCES);
    const { rows: afterKeys } = await db.pool.query<{ keys: string[] }>(
      `SELECT ARRAY(SELECT jsonb_object_keys(doc)) AS keys
         FROM user_preferences WHERE user_id = $1 AND workspace_id = $2`,
      [read.userIds.member, read.world.workspaceId],
    );
    expect(afterKeys[0]?.keys.sort()).toEqual(['grouping', 'listColumns', 'savedFilters']);

    // Positive control for the 500: another member's row, written the same way
    // with a VALID document, reads 200 — so the failure is the document and not
    // the table or the reader.
    expect((await get('owner')).statusCode).toBe(200);
  });
});
