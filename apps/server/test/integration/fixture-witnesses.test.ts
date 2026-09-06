import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid, type Notification, type SubmittedEvent } from '@gisik-nokma/domain';
import type { FastifyInstance } from 'fastify';
import type { LogOtpSender } from '../../src/auth/otp-sender.js';
import { insertNotification } from '../../src/notifications/store.js';
import { INVALID_NAME_BODY } from '../../src/routes/workspaces.js';
// THE CLIENT HALF, EXECUTED. Not read as text, not restated as a literal.
// `client-contract.test.ts` measured why that distinction is the whole game:
// with its two client lists typed as literals, applying BOTH reconciliations to
// `app-core` at once left that file at 15 passed / 0 failed — the divergences it
// existed to pin were gone and the suite did not notice. So every case here runs
// the shipped client module. The `./online` SUBPATH is the door the package
// already provides (`no-http-in-views.test.ts` enforces the seam), and it
// resolves through `dist`, which is why any mutation run under this file must
// rebuild rather than use bare `vitest`.
import {
  createHttpClient,
  createHttpFoundingGateway,
  createOnlineDataSource,
  FoundingError,
  mapActors,
  mapAttention,
  mapBoardView,
  mapHistory,
  mapIngestResults,
  mapMyWork,
  mapPreferences,
  mapWorkflowDef,
  rosterByActorId,
  type FetchLike,
} from '@gisik-nokma/app-core/online';
import { buildTestApp } from '../helpers/app.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { signInWithPhone } from '../helpers/session.js';

/**
 * **Lane F — witnesses for fixtures whose protocol was authored alongside their
 * consumer.**
 *
 * ## Why this file exists, in one measurement
 *
 * `pagingFetch` (`packages/app-core/test/online/online-data-source.test.ts:52`)
 * implemented the list cursor as a PAGE INDEX. The shipped route is KEYSET. Four
 * cases, 30/30 tasks and 3,387 tests were green over a protocol their own author
 * had written, and nothing red could have pointed at it: the loop was correct and
 * protocol-agnostic, and only the EVIDENCE was wrong. Case 7.220 closed that one
 * by running the real mapper over the real route.
 *
 * The generalisation, and this file's subject: **a fixture that models a producer
 * is a MIRROR, not a witness, whenever the same sitting wrote its protocol and
 * its consumer.** An inventory of 157 fixtures across this repo found 80 of them.
 * This file carries the ones that are buildable without touching a file frozen by
 * an open PR.
 *
 * ## What makes a case here a witness rather than a second mirror
 *
 * Every case runs BOTH halves for real: the shipped client module (imported
 * above, executed) against the shipped route (`app.inject`, through the real
 * `buildApp`), with **the server's own values carried between calls**. Reading a
 * server constant into a client-side assertion is NOT enough and is deliberately
 * not done here — that agrees with source text, not with a running producer.
 *
 * Non-vacuity is asserted FIRST in each case, before the property, so an empty or
 * one-row fixture fails loudly instead of passing over nothing. That is 7.207's
 * shape and this repo has paid for it once already.
 */

let db: TestDatabase;
let app: FastifyInstance;
let otp: LogOtpSender;
let owner: { userId: string; headers: { authorization: string } };
let workspaceId: string;
let projectId: string;
const ticketIds: string[] = [];
let workflowId: string;

let phoneCounter = 0;
async function signedIn(): Promise<{ userId: string; headers: { authorization: string } }> {
  phoneCounter += 1;
  const user = await signInWithPhone(app, otp, `+9190009${String(phoneCounter).padStart(5, '0')}`);
  return { userId: user.userId, headers: { authorization: `Bearer ${user.token}` } };
}

async function post(
  headers: { authorization: string },
  event: Omit<SubmittedEvent, 'id' | 'version' | 'origin' | 'clientTime'>,
): Promise<void> {
  const submitted: SubmittedEvent = {
    id: newUlid(),
    version: 1,
    origin: 'web',
    clientTime: new Date().toISOString(),
    ...event,
  };
  const res = await app.inject({ method: 'POST', url: '/v1/events', headers, payload: { events: [submitted] } });
  const body = res.json() as { results?: Array<{ status?: string; reason?: string }> };
  expect(body.results?.[0]?.status, JSON.stringify(body.results?.[0])).toBe('committed');
}

/**
 * A `FetchLike` backed by `app.inject` — the seam that lets the REAL client
 * transport talk to the REAL server inside one process.
 *
 * It supplies exactly the three members `http.ts`'s `send` reads (`status`,
 * `ok`, `json()`) and nothing else, so it cannot accidentally satisfy a client
 * that starts reaching for `headers` or `text()`: such a client would fail here
 * rather than silently pass. `ok` is DERIVED from the status the server actually
 * set rather than passed in, because `ok` is the one field a hand-built fake gets
 * to decide for itself, and deciding it is how a fake stops being evidence.
 */
function injectFetch(headers: { authorization: string }, calls: string[] = []): FetchLike {
  return (async (input: string, init?: RequestInit) => {
    calls.push(input);
    const method = (init?.method ?? 'GET') as 'GET' | 'POST' | 'PUT';
    const rawBody = init?.body;
    // The client's OWN serialised bytes are handed to the route verbatim, not
    // parsed here and re-serialised by the harness. A round trip that re-encodes
    // the payload in the middle is measuring the harness's encoder as much as the
    // client's, and `createHttpClient` does its own `JSON.stringify`.
    const res =
      typeof rawBody === 'string'
        ? await app.inject({
            method,
            url: input,
            headers: { ...headers, 'content-type': 'application/json' },
            payload: rawBody,
          })
        : await app.inject({ method, url: input, headers });
    return {
      ok: res.statusCode >= 200 && res.statusCode < 300,
      status: res.statusCode,
      json: async () => res.json() as unknown,
    } as Response;
  }) as FetchLike;
}

beforeAll(async () => {
  db = await createTestDatabase();
  const built = buildTestApp(db);
  app = built.app;
  otp = built.otp;
  await app.ready();

  owner = await signedIn();

  const founded = await app.inject({
    method: 'POST',
    url: '/v1/workspaces',
    headers: owner.headers,
    payload: { name: 'Witness Corner' },
  });
  expect(founded.statusCode).toBe(201);
  workspaceId = (founded.json() as { workspaceId: string }).workspaceId;

  projectId = newUlid();
  await post(owner.headers, {
    workspaceId,
    entity: { kind: 'project', id: projectId },
    type: 'project.created',
    payload: { name: 'The aisle' },
    actorId: owner.userId,
  });
  await post(owner.headers, {
    workspaceId,
    entity: { kind: 'project', id: projectId },
    type: 'project.member_added',
    payload: { userId: owner.userId, projectAdmin: true },
    actorId: owner.userId,
  });

  // THREE tickets, not two. The paging case below walks to exhaustion at
  // `limit=1`, so three rows means the loop runs three times and terminates on
  // the fourth — a two-row world would let a loop that stops after one page
  // still look complete.
  for (const title of ['Sweep the aisle', 'Wipe the shelf', 'Stack the crates']) {
    const id = newUlid();
    ticketIds.push(id);
    await post(owner.headers, {
      workspaceId,
      entity: { kind: 'ticket', id },
      type: 'ticket.created',
      payload: { typeId: 'task', projectId, parentId: null, title },
      actorId: owner.userId,
    });
  }
  ticketIds.sort();

  // ASSIGNED, so `/v1/me/work` has a card to serve and 7.228 is not asserting
  // over an empty world. Assigning the LOWEST id keeps 12.324's ordering
  // assertion (which compares against the sorted list) untouched.
  await post(owner.headers, {
    workspaceId,
    entity: { kind: 'ticket', id: ticketIds[0] as string },
    type: 'ticket.assigned',
    payload: { assigneeId: owner.userId },
    actorId: owner.userId,
  });

  // The workflow id is DISCOVERED through the real route, not typed in. Founding
  // appends a `workflow.defined` (`bootstrap-workspace.ts`'s founding sequence),
  // so exactly one exists — asserted below, because "the first of a list" is a
  // claim about the list's length as much as its contents.
  const wfList = await app.inject({
    method: 'GET',
    url: `/v1/workspaces/${workspaceId}/workflows`,
    headers: owner.headers,
  });
  expect(wfList.statusCode).toBe(200);
  const wfBody = wfList.json() as { workflows: { id: string }[] };
  expect(wfBody.workflows.length, 'founding must leave exactly one workflow').toBe(1);
  workflowId = wfBody.workflows[0]?.id as string;
  // The id is a real ULID, not `undefined` stringified into the URL — which is
  // how this first went wrong: a bad key made the path `/workflows/undefined`
  // and the route answered 404, a failure that looks like a missing workflow.
  expect(workflowId, 'the founding workflow must have an id').toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
});

afterAll(async () => {
  await app.close();
  await db.drop();
});

describe('the list cursor, against the real route', () => {
  /**
   * 12.323 — **AN UNRECOGNISED CURSOR NARROWS; IT DOES NOT 404.**
   *
   * `pagingFetch` answers `{ok:false, status:404}` for any cursor it does not
   * recognise (`online-data-source.test.ts:67`). **No server can do that.**
   * `routes/list.ts:143` binds the cursor as a VALUE — `t.ticket_id > $n` — so an
   * unknown cursor is a text comparison that NARROWS, and the route's own
   * docblock (`list.ts:103-112`) says the server tests "hand back all three
   * (foreign, invisible, hostile) and pin that".
   *
   * So both sides had tests, they contradicted each other, and neither could see
   * the other. That is this pass's thesis in one case, and it is about a fixture
   * whose cursor SEMANTICS had already been fixed once: **fixing one lie in a
   * fixture does not convert the fixture into a witness.**
   *
   * The cursor used here is the LARGEST ULID, so it sorts above every seeded
   * ticket and the narrowing is total — an empty page, not merely a shorter one.
   */
  it('12.323 a cursor no ticket matches yields 200 and an empty page, never a 404', async () => {
    const beyond = 'ZZZZZZZZZZZZZZZZZZZZZZZZZZ';

    // NON-VACUITY FIRST: the same route, same viewer, no cursor, must answer
    // rows. Without this the empty-page assertion below is satisfied by a broken
    // fixture, an empty project, or a 403 — the 7.207 shape.
    const populated = await app.inject({
      method: 'GET',
      url: `/v1/projects/${projectId}/tickets?groupBy=flat`,
      headers: owner.headers,
    });
    expect(populated.statusCode).toBe(200);
    expect((populated.json() as { groups: { cards: unknown[] }[] }).groups[0]?.cards).toHaveLength(3);

    const res = await app.inject({
      method: 'GET',
      url: `/v1/projects/${projectId}/tickets?groupBy=flat&cursor=${beyond}`,
      headers: owner.headers,
    });

    // THE PROPERTY. A 404 here would mean `pagingFetch` was right and this case
    // is what tells the two apart.
    expect(res.statusCode).toBe(200);
    const body = res.json() as { groups: { cards: unknown[] }[]; nextCursor: string | null };
    // `list.ts:205` — "An empty page has NO groups". Asserting on `groups` itself
    // rather than on `groups[0].cards` is the difference between measuring the
    // route's documented empty shape and reading a property off `undefined`.
    expect(body.groups).toHaveLength(0);
    expect(body.nextCursor).toBeNull();
  });

  /**
   * 12.324 — **THE SHIPPED LOOP, EXECUTED AGAINST THE SHIPPED ROUTE, RETURNS THE
   * COMPLETE ROW SET.**
   *
   * 7.220 proved the route accepts a cursor and that `mapListPage` carries the
   * value the route resolves — but the case drove the two requests itself. This
   * runs the client's OWN `getTickets`: the termination condition, the row
   * accumulation and the request shape are the shipped ones.
   *
   * ## What this case does NOT witness, asserted rather than left to be assumed
   *
   * `LIST_PAGE_SIZE` is 200 and the loop hard-codes `limit=200`
   * (`online-data-source.ts:223`), so against a three-ticket world the route
   * answers everything in ONE page with `nextCursor: null` and the loop returns
   * after a single request. **The multi-page cursor threading is therefore NOT
   * exercised here**, and calling this "walks to exhaustion" would be the same
   * defect this file catches at `founding.test.ts:64` — a title claiming more
   * than the body keeps.
   *
   * So the round-trip count is ASSERTED, not narrated: if anyone later seeds 201
   * tickets, or drops `LIST_PAGE_SIZE`, this line goes red and whoever is here
   * next is told the case's reach changed rather than left to assume it. The
   * multi-page half is covered at the route level by 7.220. *Owner for closing
   * the client-loop multi-page gap end to end: whoever can afford a 201-ticket
   * fixture, or a seam that lets the page size be injected.*
   */
  it('12.324 the real getTickets returns the complete row set from the real route, in one page', async () => {
    const calls: string[] = [];
    const source = createOnlineDataSource({ baseUrl: '', fetchImpl: injectFetch(owner.headers, calls) });

    const view = await source.query.getTickets(projectId, {}, 'flat');

    // NON-VACUITY FIRST, and it is not `length > 0`: the world holds exactly
    // three, so a loop returning one page of one row would pass a bare
    // non-empty check while dropping two thirds of the project.
    expect(view.rows).toHaveLength(3);
    expect(view.rows.map((row) => row.ticketId)).toEqual(ticketIds);
    // No duplicates — the failure a cursor-ignoring route produces once paging
    // is actually reached.
    expect(new Set(view.rows.map((row) => row.ticketId)).size).toBe(3);

    // THE REACH OF THIS CASE, PINNED. One request, because 3 < 200. This is the
    // assertion that stops the docblock above from rotting into a false claim.
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain('limit=200');
    expect(calls[0]).not.toContain('cursor=');
  });
});

describe('the founding refusal, against the real route', () => {
  /**
   * 7.221 — **THE REFUSAL THE DOOR ACTUALLY SENDS, CARRIED BY THE REAL GATEWAY.**
   *
   * `packages/app-core/test/online/founding.test.ts:64` is titled *"carries the
   * 400 whitespace-name refusal out with the door's sentence"* and asserts
   * `serverMessage` against a literal the case itself wrote — a different
   * discriminant (`invalid_name` where the door sends `invalid`) and a different
   * sentence. It passes because it reads back its own fixture. **The title is the
   * claim the case does not keep.**
   *
   * Here the real `createHttpFoundingGateway` runs over the real
   * `createHttpClient` against the real route, and the expected sentence is
   * `INVALID_NAME_BODY.message` IMPORTED from the server module — so a change to
   * the door's wording moves both sides of this assertion at once and the case
   * cannot rot into a paraphrase.
   */
  it('7.221 the real founding gateway carries the door’s own sentence out of a real 400', async () => {
    const gateway = createHttpFoundingGateway(
      createHttpClient('', injectFetch(owner.headers)),
    );

    // NON-VACUITY FIRST: the constant this case measures against must be a real
    // non-empty sentence, or every assertion below is comparing '' to ''.
    expect(INVALID_NAME_BODY.message.length).toBeGreaterThan(0);

    const refused = await gateway.foundWorkspace('   ').catch((error: unknown) => error);

    expect(refused).toBeInstanceOf(FoundingError);
    const error = refused as FoundingError;
    expect(error.status).toBe(400);
    // THE ROUND TRIP: the sentence the client surfaces IS the sentence the door
    // sent, compared against the server module's own constant.
    expect(error.serverMessage).toBe(INVALID_NAME_BODY.message);
  });
});

describe('the notifications cursor, against the real route', () => {
  /**
   * 12.325 — **`nextCursor` IS THE LAST ROW OF THE PAGE.**
   *
   * `packages/app-core/test/inbox/fake-gateway.ts:20` reimplements this route's
   * paging rule — order by id DESC, `id < $cursor`, fetch `limit + 1`, report the
   * last row of the page — and its own docblock admits it is *"MIRRORING the
   * server's paging semantics"* and that *"the interface has no consumer in this
   * package"*. Lines 37-44 record a drift it has ALREADY had, on the empty-string
   * cursor. It is the only measurement of `NotificationsGateway`.
   *
   * `notifications.test.ts:97-110` drives the real route but asserts only that
   * `nextCursor` is non-null, re-sends it, and gets a different row: it witnesses
   * ADVANCE and TERMINATION and **never the cursor's VALUE**, which is the keyset
   * claim the fake copies.
   *
   * **The honest limit of this case, stated rather than left to be discovered:**
   * `apps/server` has no dependency on `apps/web`, where the only real
   * `NotificationsGateway` adapter lives (`apps/web/src/notifications-gateway.ts`),
   * so the client CONSUMER cannot be executed from here the way `getTickets` and
   * the founding gateway are above. This case pins the PRODUCER's end of the
   * contract; the fake's rule is witnessed by copying a rule that is now pinned,
   * not by a round trip. Naming both ends is the point — **a witness that cannot
   * reach its consumer says so instead of implying it did.**
   *
   * The value is read as `.at(-1)`, not `[0]`. At `limit=1` the two are the same
   * row and an assertion on `[0]` would be accidentally correct; it would go
   * silently wrong the day anyone raised the limit.
   */
  it('12.325 the real route’s nextCursor is the LAST id of the page, not merely non-null', async () => {
    const reader = await signedIn();
    const ids = [newUlid(), newUlid(), newUlid()].sort();
    for (const id of ids) {
      await insertNotification(db.pool, {
        id,
        userId: reader.userId,
        workspaceId,
        kind: 'assignment',
        dedupeKey: `assignment:${id}`,
        payload: {
          ticketId: ticketIds[0] ?? newUlid(),
          ticketTitle: 'Renew the DLT registration',
          assignedBy: owner.userId,
          eventId: id,
          clientTime: '2026-08-19T10:00:00.000Z',
          serverTime: '2026-08-19T10:00:01.000Z',
        },
        read: false,
        createdAt: '2026-08-23T05:00:00.000Z',
      } satisfies Notification);
    }

    const page = await app.inject({
      method: 'GET',
      url: '/v1/me/notifications?limit=2',
      headers: reader.headers,
    });
    expect(page.statusCode).toBe(200);
    const body = page.json() as { notifications: Notification[]; nextCursor: string | null };

    // NON-VACUITY FIRST, and specifically that the page is FULL and a further
    // page exists — the two preconditions that make the value assertion mean
    // anything. A one-row page would make `.at(-1)` and `[0]` identical again.
    expect(body.notifications).toHaveLength(2);
    expect(body.nextCursor).not.toBeNull();

    // THE PROPERTY the fake copies and no case pinned: the LAST row of the page.
    expect(body.nextCursor).toBe(body.notifications.at(-1)?.id);

    // And it is the route's DESC ordering, so "last" is the smallest id here —
    // which is what makes `id < $cursor` the right next query rather than `>`.
    expect(body.notifications[0]?.id.localeCompare(body.notifications[1]?.id ?? '')).toBeGreaterThan(0);
  });
});

/**
 * **THE MAPPER CLUSTER — eight entry points that had never seen a real body.**
 *
 * `packages/app-core/test/online/mappers.test.ts` is ~1,400 lines and exercises
 * twenty mapper entry points **entirely against hand-authored literals**: it
 * injects no route and builds no app. Before this file, exactly two of the
 * twenty had ever been run over bytes a real `/v1` route emitted — `mapListPage`
 * (7.220) and `mapTicketRead` (7.213). The other eighteen agreed with fixtures
 * their own author wrote, which is the `pagingFetch` shape at eighteen-fold
 * scale rather than a new problem.
 *
 * Each case below fetches a REAL route over the REAL database and hands the
 * bytes to the REAL mapper. Non-vacuity is asserted first, so an empty world
 * fails loudly instead of passing over nothing.
 *
 * **Citations here name SYMBOLS, not line numbers.** Lane B re-measured a
 * catalogue citation of mine one day after it merged and found the line had
 * already moved. A stale line number sends a reader to the wrong place and looks
 * authoritative doing it; a symbol survives every edit above it.
 */
describe('the mapper cluster, against real routes', () => {
  it('7.222 mapActors + rosterByActorId over the REAL members route', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/v1/workspaces/${workspaceId}/members`,
      headers: owner.headers,
    });
    expect(res.statusCode).toBe(200);

    const actors = mapActors(res.json());

    // NON-VACUITY FIRST: an empty roster would satisfy every `toContain` below.
    expect(actors.length).toBeGreaterThan(0);
    const roster = rosterByActorId(actors);
    // RECORDED: this workspace has exactly ONE member, so `roster.size ===
    // actors.length` is 1 === 1 and the only property `rosterByActorId` has —
    // collapsing duplicate ids to one entry — is satisfied trivially. Kept as a
    // shape check, not claimed as a witness for the collapse.
    expect(roster.size).toBe(actors.length);
    // The founder is IN it, by the id the server minted — not by a name this
    // case invented.
    expect(roster.has(owner.userId)).toBe(true);
    expect(actors.map((a) => a.id)).toContain(owner.userId);
  });

  it('7.223 mapBoardView over the REAL board route — every card once, no group claim', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/v1/projects/${projectId}/board`,
      headers: owner.headers,
    });
    expect(res.statusCode).toBe(200);

    const board = mapBoardView(res.json());

    // NON-VACUITY: a board with no groups, or groups with no columns, would let
    // the identity assertions below pass over nothing.
    expect(board.groups.length).toBeGreaterThan(0);
    const columns = board.groups.flatMap((g) => g.columns);
    expect(columns.length).toBeGreaterThan(0);

    // **WHAT THIS CASE DOES NOT WITNESS, corrected after review.** The route
    // sends `columns` FLAT and the mapper regroups them under a
    // `workflowId@workflowVersion` key — but this fixture CANNOT constrain that
    // grouping. `beforeAll` asserts exactly one founding workflow, and
    // `appendStragglerColumns` documents itself as unreachable, so exactly one
    // group is possible: a mapper that keyed by `workflowId` alone, or put every
    // column in one group, passes identically. **The regrouping is unmeasured
    // here and calling it witnessed would be this file's own overclaim.**
    // *Owner: a fixture with a second published workflow version.*
    // THE ROUND TRIP: the project the mapper reports is the project asked for.
    expect(board.projectId).toBe(projectId);
    // Every seeded ticket is on the board exactly once — the mapper's own
    // regrouping of the route's flat `columns` must not drop or duplicate.
    const carded = columns.flatMap((c) => c.cards.map((card) => card.ticketId)).sort();
    expect(carded).toEqual(ticketIds);
  });

  it('7.224 mapHistory over the REAL ticket-history route', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/v1/tickets/${ticketIds[0]}/history`,
      headers: owner.headers,
    });
    expect(res.statusCode).toBe(200);

    const history = mapHistory(res.json());

    // NON-VACUITY: this ticket was created AND assigned in `beforeAll`, so a
    // real ledger must answer at least two events. `> 0` would be satisfied by
    // a route that served only the creation.
    expect(history.length).toBeGreaterThanOrEqual(2);
    // The types are the ones the product appended, spelled as the server spells
    // them — not a vocabulary this case chose.
    expect(history.map((e) => e.type)).toContain('ticket.created');
  });

  it('7.225 mapWorkflowDef over the REAL workflow route', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/v1/workspaces/${workspaceId}/workflows/${workflowId}`,
      headers: owner.headers,
    });
    expect(res.statusCode).toBe(200);

    const def = mapWorkflowDef(res.json());

    // NON-VACUITY: a definition with no states is not a workflow, and every
    // assertion about states below would pass over an empty list.
    expect(def.states.length).toBeGreaterThan(0);
    // The id round-trips: the definition the mapper reports is the one asked
    // for, by the id the SERVER minted during founding. The field is `id` — the
    // DOMAIN's spelling, since `mapWorkflowDef` validates the body and returns
    // it unreshaped rather than renaming anything.
    expect(def.id).toBe(workflowId);
    // A published definition carries a version the client can compare.
    expect(def.version).toBeGreaterThanOrEqual(1);
  });

  /**
   * **THIS CASE WRITES, and it is the only one in the cluster that does.** It
   * commits a fourth ticket into the shared `projectId`. `vitest.config.ts` sets
   * no `sequence.shuffle`, so declaration order holds and 7.223's
   * `toEqual(ticketIds)` and 12.324's `toHaveLength(3)` both run before it.
   * **Latent, not live — recorded because a reorder or `--sequence.shuffle`
   * would break two cases for a reason nothing else in this file names.**
   * *Owner: whoever introduces shuffled ordering here.*
   */
  it('7.226 mapIngestResults over the REAL /v1/events response', async () => {
    const id = newUlid();
    const submitted: SubmittedEvent = {
      id: newUlid(),
      version: 1,
      origin: 'web',
      clientTime: new Date().toISOString(),
      workspaceId,
      entity: { kind: 'ticket', id },
      type: 'ticket.created',
      payload: { typeId: 'task', projectId, parentId: null, title: 'Count the till' },
      actorId: owner.userId,
    };
    const res = await app.inject({
      method: 'POST',
      url: '/v1/events',
      headers: owner.headers,
      payload: { events: [submitted] },
    });
    expect(res.statusCode).toBe(200);

    // The SECOND argument is the count the client submitted. `mapIngestResults`
    // uses it to refuse a response that answers a different number of events
    // than were sent, so passing the real 1 here is what makes that check live.
    const results = mapIngestResults(res.json(), 1);

    // `expect(results).toHaveLength(1)` used to sit here and is GONE: the mapper
    // throws unless `results.length === submittedCount` and `.map()` preserves
    // length, so if the call returned at all the length was 1 by construction.
    // It could not fail. The count property it looked like it was testing is
    // real, but it is the MUTATION below that measures it, not this line.
    expect(results[0]?.status).toBe('committed');
    // The result names the event the client sent, by the client's own id.
    expect(results[0]?.eventId).toBe(submitted.id);
  });

  it('7.227 mapPreferences over the REAL preferences route', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/v1/me/preferences?workspaceId=${workspaceId}`,
      headers: owner.headers,
    });
    expect(res.statusCode).toBe(200);

    const prefs = mapPreferences(res.json());

    // WHAT THIS CASE CAN AND CANNOT ASSERT, corrected after review.
    //
    // An earlier draft asserted `prefs.version >= 1` and called it "the
    // document's own". **That was a check that could not fail.** `mapPreferences`
    // ends `return { version: 1, projects, savedFilters }` — the version is a
    // CLIENT-SIDE LITERAL. There is nothing on the wire to read: the server's
    // `preferencesDocSchema` is `.strict()` over exactly `savedFilters`,
    // `listColumns` and `grouping`, and the GET handler returns that document
    // unwrapped. So the assertion compared a constant to itself and no server
    // behaviour whatsoever could have moved it.
    //
    // `Array.isArray(prefs.savedFilters)` is unfailable for the same structural
    // reason — the mapper builds it with `.map()`, so if the call returned at all
    // it is an array. Both are gone.
    //
    // What is left is the honest claim, and it is narrow: the REAL mapper
    // accepted the REAL document without throwing, and the saved-filter list it
    // built is the one the wire carried (empty here, and empty is correct for a
    // user who has never saved). The mutation below is what gives even that
    // teeth.
    expect(prefs.savedFilters).toEqual([]);
    // RECORDED, not asserted, and it is a finding rather than a limitation:
    // **`UserPreferences.version` is fabricated by the client and no producer
    // emits it.** Whether the type should carry it at all is a product question.
    // *Owner: whoever owns preferences.* Separately, this world never writes a
    // document, so this case witnesses the EMPTY-document path only; a populated
    // one needs a PUT first.
  });

  it('7.228 mapMyWork over the REAL /v1/me/work route', async () => {
    const members = await app.inject({
      method: 'GET',
      url: `/v1/workspaces/${workspaceId}/members`,
      headers: owner.headers,
    });
    const roster = rosterByActorId(mapActors(members.json()));

    const res = await app.inject({
      method: 'GET',
      url: `/v1/me/work?workspaceId=${workspaceId}`,
      headers: owner.headers,
    });
    expect(res.statusCode).toBe(200);

    const view = mapMyWork(res.json(), roster);

    // NON-VACUITY: `beforeAll` assigned exactly one ticket to this viewer, so an
    // empty `assigned` means the route or the mapper dropped it — and a bare
    // "is an array" check would not notice.
    expect(view.assigned.length).toBeGreaterThan(0);
    expect(view.assigned.map((w) => w.ticketId)).toContain(ticketIds[0]);
    // The project NAME came through the route's `projectNames` side table, which
    // is the part a fixture most easily gets wrong: the mapper joins two halves
    // of the body and this proves the real route sends both.
    const card = view.assigned.find((w) => w.ticketId === ticketIds[0]);
    expect(card?.projectName).toBe('The aisle');
  });

  it('7.229 mapAttention accepts BOTH real bodies — the fold is not reached here', async () => {
    const members = await app.inject({
      method: 'GET',
      url: `/v1/workspaces/${workspaceId}/members`,
      headers: owner.headers,
    });
    const roster = rosterByActorId(mapActors(members.json()));

    const attention = await app.inject({
      method: 'GET',
      url: `/v1/workspaces/${workspaceId}/attention`,
      headers: owner.headers,
    });
    expect(attention.statusCode).toBe(200);
    const contests = await app.inject({
      method: 'GET',
      url: `/v1/contests?workspaceId=${workspaceId}&open=true`,
      headers: owner.headers,
    });
    expect(contests.statusCode).toBe(200);

    // BOTH arguments are real bodies from real routes. `mapAttention` folds the
    // contests list into the attention items, and a fixture supplying either
    // half by hand is agreeing with itself about how the two join.
    const items = mapAttention(attention.json(), contests.json(), roster);

    // THE HONEST NON-VACUITY, and it is not `length > 0`: this world has no
    // stale ticket, no approaching date and no contested claim, so the correct
    // answer IS an empty list. What is asserted is that the mapper accepted the
    // real bodies and produced a list — the shape agreement neither fixture
    // could prove alone. **A populated attention sweep needs a world with a
    // stale ticket or an open contest; that is a separate fixture and it is NOT
    // built here.** Recorded rather than faked, because seeding a contest to
    // make a number non-zero would be this case asserting its own setup.
    expect(Array.isArray(items)).toBe(true);
    expect(items).toHaveLength(0);
    // **AND THE HARDER TRUTH, added after review: THE FOLD IS NOT WITNESSED.**
    // With `items` empty and no open contest, `mapAttentionItem` and the whole
    // contested-item push never execute — replace `mapAttention` with `() => []`
    // and every assertion above still passes. What IS witnessed is narrower and
    // real: the two TOP-LEVEL key names, `attention.items` and
    // `contests.contests`, both fire against real bodies from two real routes,
    // which is what the mutation below kills. The fold itself needs a world with
    // a stale ticket or an open contest. *Owner: whoever builds that world.*
  });
});
