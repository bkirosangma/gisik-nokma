import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid, type Notification, type SubmittedEvent } from '@gisik-nokma/domain';
import type { FastifyInstance } from 'fastify';
import type { LogOtpSender } from '../../src/auth/otp-sender.js';
import { insertNotification } from '../../src/notifications/store.js';
import { INVALID_NAME_BODY } from '../../src/routes/workspaces.js';
import { INVITE_ADMIN_ONLY_BODY, INVITE_NOT_OPENABLE_BODY } from '../../src/routes/invites.js';
import { PERMISSION_ROLE_RULE, adminOnlyReason } from '../../src/permissions/check-permission.js';
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
  createHttpInviteAdminGateway,
  createHttpInviteGateway,
  createOnlineDataSource,
  FoundingError,
  InviteAcceptanceError,
  InviteAdminError,
  mapActors,
  mapAttention,
  mapBoardView,
  mapHistory,
  mapIngestResults,
  mapMyWork,
  mapPreferences,
  mapWorkflowDef,
  mapWorkspaceRefs,
  refusalText,
  rosterByActorId,
  type FetchLike,
} from '@gisik-nokma/app-core/online';
// The client's OWN spelling of the reopenable refusal, from the package ROOT
// rather than `./online` — it is the constant `submitChildEvent` branches on,
// and 7.238 exists to compare it against what the engine really refuses under.
// Importing it is what makes that comparison a claim about two packages rather
// than about one string used twice.
import { PARENT_TERMINAL_RULE } from '@gisik-nokma/app-core';
// The engine's exported rule vocabulary, and the migrate route's own. Both are
// carried ALONGSIDE a literal at every case that uses them, never instead of
// one — see the refusal-vocabulary describe's header for why an assertion
// against a producer's own constant, on its own, cannot fail.
import { REFUSAL_RULES, parentTerminalRefusal, rankRefusal } from '@gisik-nokma/rule-engine';
import { MIGRATION_RULES } from '../../src/routes/builder-reads.js';
import { buildTestApp, TEST_WEB_ORIGIN } from '../helpers/app.js';
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

    // THE REACH OF THIS CASE, PINNED. One PAGE request, because 3 < 200 — and the
    // walk's one ROSTER request counted beside it rather than folded into the
    // total (the display-name join `getTickets` makes once per walk, case
    // 13.1290; it is a request this case is not about, and dividing the total by
    // two would stop the page count from being a reading).
    const pages = calls.filter((url) => url.includes('/tickets?'));
    const rosters = calls.filter((url) => url.includes('/members'));
    expect(pages).toHaveLength(1);
    expect(pages[0]).toContain('limit=200');
    expect(pages[0]).not.toContain('cursor=');
    // ONE roster request for the whole walk — the same property 13.1290 pins at
    // the unit level, here against the real route.
    expect(rosters).toHaveLength(1);
    // ...and ONE names-only read beside it (`/actor-names`, cases 7.290–7.297): the
    // roster join falls back to it for a person the member roster omits, so a walk
    // now makes it once, counted as its own bucket rather than folded into either.
    const actorNames = calls.filter((url) => url.includes('/actor-names'));
    expect(actorNames).toHaveLength(1);
    // THE PARTITION'S TOTAL, and it is asserted rather than left to the two
    // counts above: `pages = 1` and `rosters = 1` are both satisfied by a walk
    // that also made a THIRD request, so on their own they do not say the walk
    // made two. With this line the two buckets and the total are three views of
    // one list, and the walk can neither lose nor gain a request in silence.
    expect(calls).toHaveLength(3);
    expect(pages.length + rosters.length + actorNames.length).toBe(calls.length);
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
   * `NotificationsGateway` adapter lived, so the client CONSUMER could not be
   * executed from here the way `getTickets` and the founding gateway are above.
   * This case pins the PRODUCER's end of the contract; the fake's rule is
   * witnessed by copying a rule that is now pinned, not by a round trip. Naming
   * both ends is the point — **a witness that cannot reach its consumer says so
   * instead of implying it did.**
   *
   * **CLOSED 2026-09-07 — and the stated limit was true about the graph while
   * being wrong about the cause.** The adapter was not web-specific: it imports
   * `NotificationsGateway`, `HttpClient` and `parseNotification` and touches no
   * React, no Next, no DOM, and its own docblock named the three gateways in
   * `packages/app-core/src/online/` as the pattern it follows — while it alone
   * sat in `apps/web/src/`. `apps/server` already devDepends on
   * `@gisik-nokma/app-core`, so every sibling was reachable from here and this
   * one was not. Moving it (no new dependency edge, no interface change) made
   * the round trip possible, and
   * `apps/server/test/integration/notifications-consumer-roundtrip.test.ts` now
   * drives the real adapter over the real `createHttpClient` against this route,
   * the real store and real Postgres, and one of its cases asserts the cursor's
   * VALUE — the keyset claim this case could only pin producer-side. Four
   * mutations confirm it measures: `nextCursor` reporting the first row of the
   * page, the route discarding the caller's cursor, and the adapter failing to
   * send one all redden that case by name; `markRead` swallowing the 404 reddens
   * the mark-read case.
   *
   * *(Case ids deliberately not spelled out here. `check-case-citations.mjs`
   * matches an id against the WHOLE corpus, so an id named in this docblock would
   * keep its checkmark alive after the test that proves it was deleted — the very
   * hole that checker exists to close. The filename is the durable pointer.)* **The blocker was a misfiled file wearing an architectural
   * constraint's clothing** — worth remembering the next time a dependency graph
   * appears to forbid a witness.
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

/**
 * **THE ONBOARDING CLUSTER — three gateways and one refusal vocabulary, none of
 * which had ever met a running door.**
 *
 * `packages/app-core/test/online/invites.test.ts`, `invites-admin.test.ts` and
 * `founding.test.ts` measure `createHttpInviteGateway`,
 * `createHttpInviteAdminGateway` and `createHttpFoundingGateway` against a
 * `fakeHttp` whose bodies the same sitting wrote. `invites.test.ts` is the
 * sharpest instance in the repo: its dead-link case RETYPES
 * `INVITE_NOT_OPENABLE_BODY` as a literal — both the `error` discriminant and
 * the whole sentence — and then asserts the gateway carries `body.message`
 * back. It reads back its own transcription, which is 7.221's defect exactly,
 * one module over. Every case below imports the server's constants instead, so
 * a change to a door's wording moves both sides of the assertion at once.
 *
 * ## The member this cluster needs, and why it is granted HERE
 *
 * Three cases need somebody who is INSIDE the workspace and is not an admin —
 * that is the only role from which `permission.role` and
 * `INVITE_ADMIN_ONLY_BODY` are both reachable. The grant is in this describe's
 * OWN `beforeAll`, not the file's, so 7.222–7.229 run against the one-member
 * world their docblocks describe. **`vitest.config.ts` sets no
 * `sequence.shuffle`, so declaration order is what makes that true — the same
 * latent dependency 7.226 records, and the same owner: whoever introduces
 * shuffled ordering here.** Nothing above is live-broken by a second member
 * (7.222's `roster.size === actors.length` holds at 2 as it did at 1); what
 * would go stale is its PROSE, which says this workspace has exactly one
 * member. Recorded rather than left to be discovered.
 */
describe('the onboarding gateways and the refusal vocabulary, against real routes', () => {
  let member: { userId: string; headers: { authorization: string } };
  let outsider: { userId: string; headers: { authorization: string } };

  beforeAll(async () => {
    member = await signedIn();
    await post(owner.headers, {
      workspaceId,
      entity: { kind: 'membership', id: `${workspaceId}:${member.userId}` },
      type: 'membership.granted',
      payload: { userId: member.userId, role: 'member' },
      actorId: owner.userId,
    });
    // Signed in and in NOTHING. 7.230 uses them to show the invite summary is
    // served on the strength of the TOKEN and not of a membership.
    outsider = await signedIn();
  });

  /**
   * Mint through the REAL admin door and hand back the one copy of the raw
   * token, which the response carries only inside `url`.
   *
   * The token is SLICED off the server's own `${webOrigin}/invite/` prefix
   * rather than reassembled from a token this test chose: the server builds
   * that URL (`registerInviteRoutes`' mint handler, from `deps.webOrigin`) and
   * a test that built its own would be a second opinion about where the link
   * points. The prefix is asserted before the slice, so a route that changed
   * the shape fails here — where it names the mint — instead of producing a
   * garbled token that fails later as "this link opens nothing".
   */
  async function mintRaw(body: {
    address: string;
    channel: string;
    role: string;
    projectIds?: string[];
  }): Promise<{ inviteId: string; url: string; expiresAt: string; token: string }> {
    const res = await app.inject({
      method: 'POST',
      url: `/v1/workspaces/${workspaceId}/invites`,
      headers: owner.headers,
      payload: body,
    });
    expect(res.statusCode, res.body).toBe(201);
    const json = res.json() as { inviteId: string; url: string; expiresAt: string };
    const prefix = `${TEST_WEB_ORIGIN}/invite/`;
    expect(json.url.startsWith(prefix), `mint url must start with ${prefix}, got ${json.url}`).toBe(
      true,
    );
    return { ...json, token: json.url.slice(prefix.length) };
  }

  it('7.230 the real invite gateway opens a REAL minted link and reports the door’s own summary', async () => {
    const minted = await mintRaw({
      address: 'accountant@example.com',
      channel: 'email',
      // GUEST, deliberately. `createHttpInviteGateway`'s own docblock indicts
      // the plan snippet's `(record.role ?? 'member')`, which would invent a
      // role for a response that named none — and against a `member` invitation
      // that default is INDISTINGUISHABLE from reading the wire. A guest
      // invitation is what makes a client that reintroduced it go red.
      role: 'guest',
    });

    // NON-VACUITY FIRST, and it is the precondition that makes the summary
    // mean what the title says: this viewer holds no membership anywhere, so
    // the answer below is served on the strength of the TOKEN alone. Without
    // it, a route that had quietly become membership-gated would still pass.
    const directory = await app.inject({
      method: 'GET',
      url: '/v1/me/workspaces',
      headers: outsider.headers,
    });
    expect(directory.statusCode).toBe(200);
    expect((directory.json() as { workspaces: unknown[] }).workspaces).toHaveLength(0);

    const gateway = createHttpInviteGateway(createHttpClient('', injectFetch(outsider.headers)));
    const summary = await gateway.getInvite(minted.token);

    // THE ROUND TRIP. Every field is the server's own: `workspaceId` is the id
    // `POST /v1/workspaces` minted in `beforeAll`, `workspaceName` is folded
    // out of the ledger by `workspaceNameFromLedger`, and `role` is the one the
    // mint request carried through `invite.sent` into `proj_invites`.
    expect(summary).not.toBeNull();
    expect(summary?.workspaceId).toBe(workspaceId);
    expect(summary?.workspaceName).toBe('Witness Corner');
    expect(summary?.role).toBe('guest');
  });

  /**
   * 7.231 — **THE DEAD-LINK SENTENCE, ON THE ARM THAT CAN CARRY IT.**
   *
   * **The `getInvite` arm CANNOT reach `INVITE_NOT_OPENABLE_BODY.message`, and
   * saying so is half this case.** `createHttpClient`'s `send` turns a 404 into
   * `null` on a GET — before the gateway sees a body — so the sentence is
   * structurally unreachable there, which the gateway's own docblock states and
   * this case does not paper over. The title says ACCEPT for that reason.
   *
   * The POST arm is where the body survives, and it survives because the
   * 404-as-null affordance is gated on the METHOD. So `acceptInvite` is the one
   * place a person is told why a link is dead, and it is measured here against
   * the server module's constant — imported, never retyped, which is precisely
   * what `packages/app-core/test/online/invites.test.ts`'s dead-link case does
   * not do.
   */
  it('7.231 an unknown token opens nothing, and ACCEPTING it carries the door’s own sentence', async () => {
    const dead = 'not-a-token-anyone-ever-minted';
    const gateway = createHttpInviteGateway(createHttpClient('', injectFetch(outsider.headers)));

    // NON-VACUITY FIRST, in two parts. (a) The constant is a real non-empty
    // sentence, or the comparison below is '' against ''. (b) THE POSITIVE
    // CONTROL: the same gateway, the same fetch, a LIVE token — non-null. A
    // gateway that answered `null` for everything would satisfy the dead-link
    // arm below while telling nobody anything, and nothing else here would
    // notice.
    expect(INVITE_NOT_OPENABLE_BODY.message.length).toBeGreaterThan(0);
    const live = await mintRaw({ address: 'cashier@example.com', channel: 'email', role: 'member' });
    expect(await gateway.getInvite(live.token)).not.toBeNull();

    // ARM ONE: the read affordance. `null` and NOT the sentence — the loss is
    // the transport's, by design.
    expect(await gateway.getInvite(dead)).toBeNull();

    // ARM TWO: the write. THE ROUND TRIP the fixture only mimed.
    const refused = await gateway.acceptInvite(dead).catch((error: unknown) => error);
    expect(refused).toBeInstanceOf(InviteAcceptanceError);
    const error = refused as InviteAcceptanceError;
    expect(error.status).toBe(404);
    expect(error.serverMessage).toBe(INVITE_NOT_OPENABLE_BODY.message);
  });

  it('7.232 the real invite-admin gateway lists a REAL pending invitation, with the door’s own expiry', async () => {
    const minted = await mintRaw({
      address: 'stockist@example.com',
      channel: 'email',
      role: 'member',
      // A NON-EMPTY array, so the gateway's `projectIds` pass-through is
      // measured rather than satisfied by the `[]` it substitutes for anything
      // that is not an array. `member` and not `guest` because
      // `inviteSentPayload` refuses the key on a guest invitation.
      projectIds: [projectId],
    });

    const gateway = createHttpInviteAdminGateway(createHttpClient('', injectFetch(owner.headers)));
    const rows = await gateway.listPending(workspaceId);

    // NON-VACUITY FIRST, and it is not `length > 0`: the row that must be here
    // is the one just minted, named by the id the SERVER put in the 201. An
    // empty list, or a list of somebody else's invitations, fails here.
    expect(rows.length).toBeGreaterThan(0);
    const row = rows.find((entry) => entry.inviteId === minted.inviteId);
    expect(
      row,
      `the invitation just minted must be listed; got ${rows.map((r) => r.inviteId).join(', ')}`,
    ).toBeDefined();

    // The fields the mint request carried, back out through a DIFFERENT route.
    expect(row?.address).toBe('stockist@example.com');
    expect(row?.channel).toBe('email');
    expect(row?.role).toBe('member');
    expect(row?.projectIds).toEqual([projectId]);
    // Attribution: the admin who sent it, by the id the SERVER resolved from
    // the session — not a name this case chose. Said precisely, because the
    // loose version is this file's own recurring defect: the gateway's
    // `(no inviter recorded)` substitute is NOT observable here and this case
    // does not make it so — the shipped route always serves the field, which is
    // exactly why that substitute has never been seen. What this line does is
    // make the substitute FALSIFIABLE: the day the route stops serving
    // `invitedBy`, the substitute appears and this assertion is what says so.
    expect(row?.invitedBy).toBe(owner.userId);
    expect(
      Number.isNaN(Date.parse(row?.invitedAt ?? '')),
      `invitedAt must be a real instant, got ${String(row?.invitedAt)}`,
    ).toBe(false);
    // THE SERVER'S OWN VALUE CARRIED BETWEEN TWO CALLS, which is this file's
    // whole discipline: the expiry the mint response announced is the expiry
    // the list reports. The two are read from one `invite_tokens` row by two
    // routes, so a drift between them is a real product defect — an admin told
    // one lapse date at issue time and another on the screen they manage from.
    expect(row?.expiresAt).toBe(minted.expiresAt);
  });

  /**
   * 7.233 — **THE 201's `workspaceId` IS THE WORKSPACE THE SERVER FOUNDED.**
   *
   * `createHttpFoundingGateway` reads `workspaceId` off the 201 body and
   * `POST /v1/workspaces` writes it there, and **no shared type ties those two
   * halves**: the route builds an ad-hoc `reply.send({ workspaceId })` and the
   * gateway does an ad-hoc `record['workspaceId']` lookup. A rename on either
   * side typechecks on both. The gateway would then throw `FoundingError(201,
   * null)` — "founded, and the founder cannot be sent anywhere" — which is a
   * failure only a round trip can produce.
   *
   * The id is checked against a SECOND route rather than against itself: the
   * founder's own directory must name it. An assertion that the returned id is
   * merely a string could not fail, because the gateway throws unless it is.
   */
  it('7.233 the real founding gateway’s workspaceId is the id the server minted', async () => {
    const founder = await signedIn();
    const gateway = createHttpFoundingGateway(createHttpClient('', injectFetch(founder.headers)));

    // NON-VACUITY FIRST: this person belongs to nothing, so the single row
    // below is a delta THIS case caused. Without it, a directory that listed
    // every workspace on the instance would satisfy the assertions that follow.
    const before = await app.inject({
      method: 'GET',
      url: '/v1/me/workspaces',
      headers: founder.headers,
    });
    expect(before.statusCode).toBe(200);
    expect((before.json() as { workspaces: unknown[] }).workspaces).toHaveLength(0);

    const founded = await gateway.foundWorkspace('The back room');

    const after = await app.inject({
      method: 'GET',
      url: '/v1/me/workspaces',
      headers: founder.headers,
    });
    expect(after.statusCode).toBe(200);
    const listed = (
      after.json() as { workspaces: { workspaceId: string; name: string; role: string }[] }
    ).workspaces;
    expect(listed).toHaveLength(1);
    // THE ROUND TRIP: the id the CLIENT reports is the id the SERVER founded.
    expect(listed[0]?.workspaceId).toBe(founded.workspaceId);
    // The name reaches the ledger untouched — the gateway sends what was typed
    // and `workspaceNameFromLedger` folds it back.
    expect(listed[0]?.name).toBe('The back room');
    // ALSO PINNED, and named rather than smuggled: founding grants the founder
    // `owner` (`bootstrapWorkspace`'s sequence). It is one assertion beyond
    // this case's title, kept because a founding that left no grant would show
    // up here as an empty directory and the length check above would already
    // have failed — so this line is what distinguishes "granted the wrong role"
    // from "granted nothing".
    expect(listed[0]?.role).toBe('owner');
  });

  /**
   * 7.234 — **`mapIngestResults` OVER A REAL RULE REFUSAL.**
   *
   * 7.226 ran the mapper over a real COMMITTED result. The refused arm had
   * never seen one: `mappers.test.ts` builds its refusals by hand, and the
   * three keys `INGEST_ARMS.refused` demands — `eventId`, `rule`, `reason` —
   * were a client-side list agreeing with a client-side fixture.
   *
   * **What this witnesses, stated narrowly because the mapper is a
   * pass-through:** `mapIngestResults` ends `return result as unknown as
   * IngestResult`, so `mapped.rule === raw.rule` is true by construction and
   * asserting the mapped value proves no transformation. The mapper's ONE
   * contribution on this arm is the ARM CHECK — it throws unless all three keys
   * are present — so what is measured is that **a real refusal satisfies the
   * client's arm requirement**. The day the ingest layer drops `eventId` from a
   * refusal, or renames `rule`, this case reddens and no fixture would have.
   *
   * The `reason` is compared to `adminOnlyReason('member')` — the server's own
   * function, imported — which is the half a fixture cannot fake, and which
   * also proves the refusal is the MEMBER's: a non-member would draw
   * `NOT_A_MEMBER_REASON` instead and this line would go red.
   */
  it('7.234 mapIngestResults over a REAL permission.role refusal from POST /v1/events', async () => {
    const submitted: SubmittedEvent = {
      id: newUlid(),
      version: 1,
      origin: 'web',
      clientTime: new Date().toISOString(),
      workspaceId,
      entity: { kind: 'project', id: newUlid() },
      // `project.created` is in `ADMIN_ONLY_TYPES`, so a member's claim is
      // refused by the role gate BEFORE the engine — a rule refusal and not a
      // schema `invalid`, which is the arm this case needs.
      type: 'project.created',
      payload: { name: 'The back office' },
      actorId: member.userId,
    };
    const res = await app.inject({
      method: 'POST',
      url: '/v1/events',
      headers: member.headers,
      payload: { events: [submitted] },
    });

    // NON-VACUITY FIRST: the door HEARD the batch (200 — a rule refusal is not
    // an HTTP error on this route) and REFUSED the claim. Without both, the
    // mapper below could be running over a committed result, or over a 400 that
    // never reached the gate, and every assertion after it would be about the
    // wrong thing.
    expect(res.statusCode).toBe(200);
    const raw = res.json() as { results: Array<Record<string, unknown>> };
    expect(raw.results).toHaveLength(1);
    expect(raw.results[0]?.status, JSON.stringify(raw.results[0])).toBe('refused');

    const [result] = mapIngestResults(res.json(), 1);
    // `expect(result?.status).toBe('refused')` used to sit here and is GONE, for
    // 7.227's reason: the mapper RETURNS THE SAME OBJECT (`result as unknown as
    // IngestResult`), so with the raw body's `status` already asserted above,
    // that line compared a value to itself and no server behaviour could move
    // it. What is left is a THROW, which is a narrowing guard and not an
    // assertion — TypeScript needs it to reach the refused arm's fields without
    // a cast, and `if (…) expect(…)` would be worse than either, because a
    // conditional assertion does nothing at all when its condition is false.
    if (result === undefined || result.status !== 'refused') {
      throw new Error(`expected a refused result, got ${JSON.stringify(result)}`);
    }
    expect(result.rule).toBe(PERMISSION_ROLE_RULE);
    expect(result.reason).toBe(adminOnlyReason('member'));
    // Index alignment is only useful if the result names the event it answers.
    expect(result.eventId).toBe(submitted.id);
  });

  /**
   * 7.235 — **`INVITE_ADMIN_ONLY_BODY` REACHES THE CALLER, THROUGH THE REAL
   * ADMIN GATEWAY.**
   *
   * **The vacuity hole this case would otherwise have, closed first.**
   * `INVITE_ADMIN_ONLY_BODY` is served for TWO different viewers — a `member`
   * and a NON-member — because the route's gate is
   * `workspaceRole !== 'owner' && !== 'admin'` and `null` fails it too. So a
   * `membership.granted` that silently never landed would leave this case green
   * with a title ("a plain member") it does not keep. The member's own
   * directory is therefore read FIRST and must name this workspace at
   * `member`.
   *
   * 7.234 and 7.236 need no such guard and it is worth saying why: their
   * refusal sentence is `adminOnlyReason(role)`, which EMBEDS the resolved role
   * — a non-member draws `NOT_A_MEMBER_REASON` and they redden by themselves.
   * This case's body is role-independent, and that is exactly what makes the
   * precondition load-bearing here and nowhere else in the cluster.
   */
  it('7.235 a plain member’s listPending is refused 403 and the real gateway carries the door’s sentence', async () => {
    // NON-VACUITY FIRST — see the docblock; this is the assertion that makes
    // the word "member" in the title true.
    const mine = await app.inject({
      method: 'GET',
      url: '/v1/me/workspaces',
      headers: member.headers,
    });
    expect(mine.statusCode).toBe(200);
    const rows = (mine.json() as { workspaces: { workspaceId: string; role: string }[] }).workspaces;
    expect(rows).toHaveLength(1);
    expect(rows[0]?.workspaceId).toBe(workspaceId);
    expect(rows[0]?.role).toBe('member');
    expect(INVITE_ADMIN_ONLY_BODY.message.length).toBeGreaterThan(0);

    const gateway = createHttpInviteAdminGateway(createHttpClient('', injectFetch(member.headers)));
    const refused = await gateway.listPending(workspaceId).catch((error: unknown) => error);

    // A THROW and not an empty list. The gateway's `listPending` has a branch
    // that would answer `[]` for a body it could not read, and an admin screen
    // drawing "no invitations outstanding" over a refusal is the failure that
    // branch exists to avoid — so the class matters as much as the sentence.
    expect(refused).toBeInstanceOf(InviteAdminError);
    const error = refused as InviteAdminError;
    expect(error.status).toBe(403);
    expect(error.serverMessage).toBe(INVITE_ADMIN_ONLY_BODY.message);
  });

  /**
   * 7.236 — **`refusalText`'s SECOND KEY, over a real refused result.**
   *
   * `refusalText` reads `message` first and falls back to `reason`, and the two
   * branches serve two different producers: the frozen refusal bodies
   * (`INVITE_ADMIN_ONLY_BODY`, `INVALID_NAME_BODY`) carry `message`, and an
   * `IngestResult` whose status is `refused` carries `reason` and no `message`
   * at all. 7.221 and 7.235 witness the first branch. **Nothing had ever run
   * the second over bytes a server sent** — `http.test.ts` feeds it literals.
   *
   * The mint door is where a real `IngestResult` becomes an HTTP body: it
   * answers `reply.code(422).send(result)` verbatim. So this is not a direct
   * call to `refusalText` but the shipped path — `mintInvite` → `HttpError` →
   * `refusalText` → `InviteAdminError.serverMessage` — over a refusal the role
   * gate really produced.
   */
  it('7.236 a member’s mint is refused as an IngestResult and the ROLE GATE’s `reason` reaches the caller', async () => {
    const request = { address: 'lender@example.com', channel: 'email', role: 'member' };

    // NON-VACUITY FIRST, and it is what pins WHICH branch of `refusalText`
    // fires. If the body carried a `message`, the sentence below would be
    // coming from the first branch and this case would be a second copy of
    // 7.235 wearing a different title. `message` must be ABSENT.
    const raw = await app.inject({
      method: 'POST',
      url: `/v1/workspaces/${workspaceId}/invites`,
      headers: member.headers,
      payload: request,
    });
    expect(raw.statusCode, raw.body).toBe(422);
    const body = raw.json() as Record<string, unknown>;
    expect(body['status']).toBe('refused');
    expect(body['rule']).toBe(PERMISSION_ROLE_RULE);
    expect(
      body['message'],
      'an IngestResult carries no `message`; if one appears, this case has silently moved to refusalText’s FIRST branch',
    ).toBeUndefined();
    expect(typeof body['reason']).toBe('string');

    const gateway = createHttpInviteAdminGateway(createHttpClient('', injectFetch(member.headers)));
    const refused = await gateway.mintInvite(workspaceId, request).catch((error: unknown) => error);

    expect(refused).toBeInstanceOf(InviteAdminError);
    const error = refused as InviteAdminError;
    expect(error.status).toBe(422);
    // THE SERVER'S OWN VALUE, carried between two calls to the same door.
    expect(error.serverMessage).toBe(body['reason']);
    // And it is the ROLE GATE's sentence rather than a paraphrase of it, compared
    // against the server module's own function.
    expect(error.serverMessage).toBe(adminOnlyReason('member'));
  });

  /**
   * 7.237 — **`mapWorkspaceRefs` OVER THE REAL DIRECTORY ROUTE.**
   *
   * The mapper RENAMES on two levels — wire `workspaceId` → client `id`, wire
   * `projects[].projectId` → client `id` — and `mappers.test.ts` feeds it a
   * body it wrote in the same file, so both renames agreed with themselves.
   * A route serving `id` instead of `workspaceId` would make `asString` throw
   * here; a route serving a project's key differently would throw at the nested
   * path.
   *
   * **WHAT THIS CASE CANNOT WITNESS, and it is a DECLARED non-gap rather than
   * the finding an earlier draft of this comment called it.**
   * `/v1/me/workspaces` serves a `role` per workspace and `WorkspaceRef` has no
   * key for it, so the value is dropped — but `mapWorkspaceRefs`'s own docblock
   * already says so in terms: *"`role` is a field the server discloses that the
   * client does not read; neither was ever a gap."* It is therefore not an
   * undeclared drop and this case must not report it as one; it is simply a
   * field no round trip through this mapper can reach. (7.233 and 7.235 read
   * the role off the RAW body for their own preconditions, which is the only
   * place in this file it is observable at all.)
   */
  it('7.237 mapWorkspaceRefs over the REAL /v1/me/workspaces route', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/me/workspaces',
      headers: owner.headers,
    });
    expect(res.statusCode).toBe(200);

    const refs = mapWorkspaceRefs(res.json());

    // NON-VACUITY FIRST, and exact rather than `> 0`: the founder of this file's
    // world belongs to exactly one workspace holding exactly one project, so
    // `[0]` below is a claim about the list's LENGTH as much as its contents.
    // 7.233 founds its workspace under a FRESH founder precisely so this count
    // stays 1.
    expect(refs).toHaveLength(1);
    const ref = refs[0];
    expect(ref?.id).toBe(workspaceId);
    expect(ref?.name).toBe('Witness Corner');
    // THE NESTED RENAME, which is the half no other case in this file reaches:
    // the wire says `projectId`, the client type says `id`, and the project is
    // the one `beforeAll` really created.
    expect(ref?.projects).toHaveLength(1);
    expect(ref?.projects[0]?.id).toBe(projectId);
    expect(ref?.projects[0]?.name).toBe('The aisle');
  });
});

/**
 * **THE REFUSAL VOCABULARY — client fixtures that hard-code what the engine and
 * the server refuse under, measured against the running producers.**
 *
 * ## The rule this cluster had to work out first, because it decides every case
 *
 * **Where a producer BUILDS its refusal from an exported constant, asserting the
 * wire value against that same constant is a self-comparison through one module
 * and cannot fail.** `contests.ts` refuses with `CONTEST_RULES.alreadyResolved`;
 * a witness that then asserts `rule === CONTEST_RULES.alreadyResolved` compares
 * the constant to itself over a longer path. It reddens for a broken route and a
 * broken mapper — which is worth something — but it is blind to the rename it
 * looks like it is watching.
 *
 * Two assertions are not blind, and every case below says which one it is using:
 *
 * 1. **The wire value against a LITERAL.** The literal is not a transcription
 *    here, because the producer RAN: it is the observed byte sequence, and it
 *    reddens on any rename at the producer. This is the only form available for
 *    `hierarchy.parent-terminal` and `hierarchy.rank`, which are bare literals at
 *    their `refuse()` call sites (`checks/hierarchy.ts:150, 298, 134, 282`) and
 *    belong to no exported constant at all.
 * 2. **The wire value against a SECOND, INDEPENDENTLY-OWNED constant.** This is
 *    the strongest form in the file, and 7.238 is the one case that has it:
 *    `PARENT_TERMINAL_RULE` (`packages/app-core/src/precheck.ts:35`) is the
 *    client's own spelling, owned by a different package from the engine's
 *    literal, and the client BRANCHES on it. Nothing before this case compared
 *    the two.
 *
 * ## And the doctrine it has to be reconciled with, or a reviewer will read this
 * ## file as violating it
 *
 * `checks/refusals.ts`'s header says: *"Tests and fixtures assert the LITERAL
 * strings, never these constants, so a typo here cannot certify itself."* That is
 * right, and it is about the ENGINE'S OWN unit tests, whose job is to pin the
 * wording a human approved. A witness's job is different and complementary: it
 * asks whether the value the CONSUMER sees is still the value the PRODUCER
 * emitted, after a real round trip. Neither replaces the other, and this cluster
 * adds no literal to `packages/rule-engine/test`.
 *
 * ## What was found by running it
 *
 * `packages/app-core/test/flows/guarded-child-event.test.ts:15` declares its
 * `PARENT_TERMINAL_REASON` to be *"the engine's own words, copied from
 * `checks/hierarchy.ts`'s refusal shape"*, and
 * `packages/app-core/test/views/reopen-flow.test.tsx:16` carries the same string
 * under the name `SERVER_PARENT_TERMINAL_REASON`. **The engine has never said
 * it.** It says the sentence 7.239 reads off the wire, which shares with the
 * fixture only the parent's title and the word "Done". Two files, both naming
 * the producer in their own identifier or comment, both wrong, and neither
 * detectable from inside `app-core`: the fixture was compared only with itself.
 */
describe('the refusal vocabulary, against the real engine over the real door', () => {
  let vocOwner: { userId: string; headers: { authorization: string } };
  let vocWorkspace: string;
  let vocProject: string;
  /** A `story` (rank 2) driven all the way to `done` — `stateCategory: 'terminal'`. */
  let terminalParent: string;
  /** The same type, same project, left in `todo`. The control for 7.238 and 7.239. */
  let openParent: string;
  /** A `task` (rank 3), so a second `task` under it is a rank violation and nothing else. */
  let taskParent: string;
  /** An `epic` (rank 1) — the only parent a `story` may legally sit under. */
  let epicParent: string;
  /** Created under `openParent` in 7.238's control, then reparented by 7.239. */
  let liveChild: string;
  let vocWorkflowId: string;

  const TERMINAL_PARENT_TITLE = 'Quarterly filings';

  /**
   * A FRESH FOUNDER and a FRESH WORKSPACE, not the file's.
   *
   * This is not tidiness. `7.237` asserts the file's founder belongs to exactly
   * one workspace holding exactly one project; `7.223` asserts `toEqual(ticketIds)`
   * over the shared project and `12.324` asserts `toHaveLength(3)`. A second
   * project, a second workspace on the same founder, or three more tickets in the
   * shared project each breaks one of those three by arithmetic. 7.233 founds under
   * a fresh founder for the same reason and says so; this follows it.
   */
  beforeAll(async () => {
    vocOwner = await signedIn();
    const founded = await app.inject({
      method: 'POST',
      url: '/v1/workspaces',
      headers: vocOwner.headers,
      payload: { name: 'Refusal Corner' },
    });
    expect(founded.statusCode).toBe(201);
    vocWorkspace = (founded.json() as { workspaceId: string }).workspaceId;

    vocProject = newUlid();
    await post(vocOwner.headers, {
      workspaceId: vocWorkspace,
      entity: { kind: 'project', id: vocProject },
      type: 'project.created',
      payload: { name: 'The back office' },
      actorId: vocOwner.userId,
    });
    await post(vocOwner.headers, {
      workspaceId: vocWorkspace,
      entity: { kind: 'project', id: vocProject },
      type: 'project.member_added',
      payload: { userId: vocOwner.userId, projectAdmin: true },
      actorId: vocOwner.userId,
    });

    const wfList = await app.inject({
      method: 'GET',
      url: `/v1/workspaces/${vocWorkspace}/workflows`,
      headers: vocOwner.headers,
    });
    expect(wfList.statusCode).toBe(200);
    const wfBody = wfList.json() as { workflows: { id: string }[] };
    expect(wfBody.workflows.length, 'founding must leave exactly one workflow').toBe(1);
    vocWorkflowId = wfBody.workflows[0]?.id as string;

    async function story(title: string): Promise<string> {
      const id = newUlid();
      await post(vocOwner.headers, {
        workspaceId: vocWorkspace,
        entity: { kind: 'ticket', id },
        type: 'ticket.created',
        // `story` is rank 2 and `task` is rank 3 (`domain/src/ticket-types.ts:73-76`).
        // A parent of a HIGHER rank number would trip `hierarchy.rank`, which is
        // checked BEFORE `hierarchy.parent-terminal` — 7.238 would then be green on
        // the wrong refusal. The ranks are what keep these two cases apart.
        payload: { typeId: 'story', projectId: vocProject, parentId: null, title },
        actorId: vocOwner.userId,
      });
      return id;
    }

    terminalParent = await story(TERMINAL_PARENT_TITLE);
    openParent = await story('Open ledger');

    // The simple-kanban clone every workspace is founded on has no edge
    // `todo -> done` (`domain/src/simple-kanban.ts`), so terminality is reached in
    // TWO moves. Both go through `post`, which asserts `committed`, so a workflow
    // that stopped offering either edge fails here rather than leaving 7.238
    // asserting over a parent that is still open.
    for (const to of ['doing', 'done']) {
      await post(vocOwner.headers, {
        workspaceId: vocWorkspace,
        entity: { kind: 'ticket', id: terminalParent },
        type: 'ticket.transitioned',
        payload: { to },
        actorId: vocOwner.userId,
      });
    }

    taskParent = newUlid();
    await post(vocOwner.headers, {
      workspaceId: vocWorkspace,
      entity: { kind: 'ticket', id: taskParent },
      type: 'ticket.created',
      payload: { typeId: 'task', projectId: vocProject, parentId: null, title: 'Reconcile the till' },
      actorId: vocOwner.userId,
    });

    // An `epic` (rank 1), so a `story` (rank 2) under it is legal and 7.240's
    // control commits. The rank case uses a story-under-task rather than the
    // obvious task-under-task precisely so the two TYPE NAMES in the refusal
    // differ: with both sides named "Task", a mutation that swapped
    // `rankRefusal`'s two arguments would produce a byte-identical sentence and
    // the case would measure nothing about which type is which.
    epicParent = newUlid();
    await post(vocOwner.headers, {
      workspaceId: vocWorkspace,
      entity: { kind: 'ticket', id: epicParent },
      type: 'ticket.created',
      payload: { typeId: 'epic', projectId: vocProject, parentId: null, title: 'Close the quarter' },
      actorId: vocOwner.userId,
    });
  });

  /**
   * Submit ONE event through the real door and hand back the raw `/v1/events`
   * body, unasserted. The caller decides what the answer should be — a helper
   * that asserted `refused` here would make every non-vacuity control below
   * impossible to write in the same shape as the case it controls.
   */
  async function submitOne(
    headers: { authorization: string },
    event: Omit<SubmittedEvent, 'id' | 'version' | 'origin' | 'clientTime'>,
  ): Promise<unknown> {
    const submitted: SubmittedEvent = {
      id: newUlid(),
      version: 1,
      origin: 'web',
      clientTime: new Date().toISOString(),
      ...event,
    };
    const res = await app.inject({
      method: 'POST',
      url: '/v1/events',
      headers,
      payload: { events: [submitted] },
    });
    expect(res.statusCode, res.body).toBe(200);
    return res.json();
  }

  function createChildUnder(parentId: string, title: string, typeId = 'task') {
    return {
      workspaceId: vocWorkspace,
      entity: { kind: 'ticket' as const, id: newUlid() },
      type: 'ticket.created',
      payload: { typeId, projectId: vocProject, parentId, title },
      actorId: vocOwner.userId,
    };
  }

  /**
   * 7.238 — **THE CLIENT'S REOPEN BRANCH CONSTANT, MEASURED AGAINST WHAT THE
   * ENGINE ACTUALLY REFUSES UNDER.**
   *
   * `packages/app-core/src/flows/guarded-child-event.ts`'s docblock claims, in
   * prose: *"`PARENT_TERMINAL_RULE` … is the same string
   * `packages/rule-engine/src/checks/hierarchy.ts` refuses under at both its call
   * sites, so the client's branch and the server's verdict cannot drift into
   * disagreeing about which refusal is the reopenable one."* **Nothing checked
   * it.** The two spellings live in different packages — an exported constant in
   * `app-core`, a bare literal in `rule-engine` — and the entire reopen affordance
   * hangs on their being equal: if the engine's literal were renamed, every
   * parent-terminal refusal would fall through to `submitChildEvent`'s ordinary
   * `refused` arm, no reopen would ever be offered, and every test in `app-core`
   * would stay green because they all feed the client its own constant back.
   *
   * This is the file's ONE case of comparison form (2) — a second,
   * independently-owned constant — and it is the reason this cluster exists.
   *
   * **A NARROWER CLAIM THAN AN EARLIER DRAFT MADE, corrected by review.** That draft
   * said "a rename on either side reddens here and nowhere else in the repo",
   * which is false: an engine-side rename also reddens
   * `rule-engine/test/hierarchy.test.ts:138`, `reparent.test.ts:371`,
   * `sync-client/test/precheck.test.ts:169` and three sites in
   * `dual-client/scenarios.test.ts`; a client-side rename reddens
   * `app-core/test/views/reopen-flow.test.tsx:85`. What is unique to this case is
   * that it is **the only place the two spellings are compared with each other** —
   * every one of those sites pins one side against a literal of its own, so they
   * all stay green while the two packages disagree.
   */
  it('7.238 a live child under a FINISHED parent is refused under the client’s own PARENT_TERMINAL_RULE', async () => {
    // NON-VACUITY FIRST, and it is the tightest control available: the same
    // create, the same type, the same project, the same actor, under a parent of
    // the SAME TYPE that differs only in `stateCategory`. Without it, a refusal
    // below is satisfied by a broken project, a bad type id or a door that
    // refuses everything.
    const control = createChildUnder(openParent, 'Chase the licence renewal');
    const controlBody = (await submitOne(vocOwner.headers, control)) as {
      results: { status: string; reason?: string }[];
    };
    expect(controlBody.results[0]?.status, JSON.stringify(controlBody.results[0])).toBe('committed');
    liveChild = control.entity.id;

    const body = await submitOne(
      vocOwner.headers,
      createChildUnder(terminalParent, 'File the GST return'),
    );

    // THE CLIENT HALF, EXECUTED — the shipped mapper, over the real response.
    const [result] = mapIngestResults(body, 1);
    expect(result?.status, JSON.stringify(result)).toBe('refused');
    if (result?.status !== 'refused') throw new Error('unreachable — narrowed by the assertion above');

    // THE PROPERTY. Left side: the engine's bare literal, carried over HTTP and
    // through the shipped mapper. Right side: the client's exported constant,
    // owned by another package, and the one `submitChildEvent` branches on. This
    // is the only place in the repo the two spellings meet.
    expect(result.rule).toBe(PARENT_TERMINAL_RULE);

    // THE ADD-ARM SENTENCE, READ OFF THE WIRE — and this assertion is here
    // because review caught its absence. Without it the corrected constant in
    // `app-core/test/flows/guarded-child-event.test.ts` and
    // `views/reopen-flow.test.tsx` would still be a transcription verified only by
    // a human reading `refusals.ts`, which is the failure this cluster exists to
    // close, at one remove. The battery said so before the reviewer did: M4 mutates
    // the SHARED return template both arms build from, and it killed 7.239 alone —
    // there was nothing here for it to redden.
    //
    // Comparison form (1): the observed bytes. The title is the one `beforeAll`
    // gave the parent and `Done` is the workflow definition's NAME for the state
    // id `done`, resolved by the server through `ctx.getWorkflowDef`; a reason
    // reading `(done)` would mean that lookup failed and the refusal degraded.
    // The same bytes are carried by the producer package's own fixture
    // `packages/rule-engine/fixtures/created-under-terminal-parent.json`, whose
    // `expected.reason` the engine's suite asserts against `evaluateEvent` — so
    // this literal and that fixture redden together and neither certifies itself.
    expect(result.reason).toBe(
      `"${TERMINAL_PARENT_TITLE}" is finished (Done). Adding live work reopens it — choose a state to reopen it to, then add this ticket.`,
    );
    // AND THE NEWLY EXPORTED BUILDER, over the same bytes. **This line cannot catch
    // a reword** — `parentTerminalRefusal` is the function the route just ran, so a
    // change to its body moves this side too; the LITERAL above is what catches a
    // reword and it stays for that reason alone. What this line CAN catch is the
    // export being wired to the wrong thing: `packages/rule-engine/src/index.ts`
    // now re-exports `checks/refusals.js` (case 7.249, closing 7.245), and a
    // same-named symbol re-exported from a forked or stale module would disagree
    // with the wire here and nowhere else. Narrow, real, and stated rather than
    // dressed up as the stronger check next to it.
    expect(result.reason).toBe(parentTerminalRefusal(TERMINAL_PARENT_TITLE, 'Done', 'add'));
    // THE VERB PAIR from this side, so a producer that collapsed the two arms into
    // one sentence reddens at BOTH 7.238 and 7.239 rather than at neither.
    expect(result.reason).not.toContain('Moving live work');
  });

  /**
   * 7.239 — **THE SECOND CALL SITE, AND THE SENTENCE THE CLIENT FIXTURES CLAIM TO
   * HAVE COPIED.**
   *
   * `guarded-child-event.ts` says the rule holds "at both its call sites"; the
   * create arm is 7.238 and this is `checkTicketReparented`
   * (`checks/hierarchy.ts:298`). A mutation at one site only reddens one of these
   * two cases, which is the point of having both.
   *
   * **The reason is asserted STRUCTURALLY, and this paragraph was a present-tense
   * falsehood for one commit.** It read: *"`parentTerminalRefusal` lives in
   * `checks/refusals.ts`, which `packages/rule-engine/src/index.ts` does not
   * re-export … so no consumer of the package can compare against the producer's
   * own words."* **That was case 7.245 and ruling P43 closed it** — this file's own
   * import list now names `parentTerminalRefusal`, and 7.238 compares against it.
   * The stale sentence survived the commit that falsified it, in the file that
   * commit edited, which is the defect class 7.245 exists to record showing up
   * inside its own fix. Caught by review, not by a test; nothing can test it.
   *
   * The structural assertions below stay anyway, and not from inertia: they pin
   * values the SERVER resolved (the parent's real title, the state's real NAME)
   * against a sentence built from a real round trip, which an equality against the
   * builder cannot do — see 7.238 for why the builder comparison catches only a
   * mis-wired export.
   *
   * What CAN be asserted without that export is worth more than a transcription
   * anyway: the sentence carries the parent's real title and the state's real
   * NAME — both values this test never typed, resolved by the server out of the
   * ticket's fields and the workflow definition — and the two call sites say
   * DIFFERENT things ('add' vs 'move'). A single transcribed constant in
   * `app-core` cannot see that difference at all; it is one string standing in
   * for two sentences.
   */
  it('7.239 reparenting under the same finished parent refuses under the same rule with the MOVE sentence', async () => {
    expect(liveChild, '7.238 must have committed its control child first').toBeDefined();

    const body = await submitOne(vocOwner.headers, {
      workspaceId: vocWorkspace,
      entity: { kind: 'ticket', id: liveChild },
      type: 'ticket.reparented',
      payload: { newParentId: terminalParent },
      actorId: vocOwner.userId,
    });
    const [result] = mapIngestResults(body, 1);
    expect(result?.status, JSON.stringify(result)).toBe('refused');
    if (result?.status !== 'refused') throw new Error('unreachable — narrowed by the assertion above');

    expect(result.rule).toBe(PARENT_TERMINAL_RULE);

    // The title is the one `beforeAll` gave the parent, and the state name is
    // `Done` — the workflow definition's `name` for the id `done`, which the check
    // resolves through `ctx.getWorkflowDef` and falls back to the raw id for. A
    // reason reading "(done)" would mean that lookup failed and the refusal
    // degraded, which is a real regression this asserts against.
    expect(result.reason).toContain(`"${TERMINAL_PARENT_TITLE}"`);
    expect(result.reason).toContain('(Done)');

    // THE VERB PAIR — the half no fixture in `app-core` can express, because both
    // client files hold ONE constant for both call sites.
    expect(result.reason).toContain('Moving live work under it reopens it');
    expect(result.reason).not.toContain('Adding live work');

    // AND THE FABRICATION, MADE FALSIFIABLE. Both `app-core` fixtures declare this
    // string to be the engine's own words. It is not a sentence the engine can
    // produce: `parentTerminalRefusal` builds `"<title>" is finished (<state>). …`
    // and nothing anywhere emits the clause below.
    expect(result.reason).not.toContain('it must reopen because it is acquiring live work');
  });

  /**
   * 7.240 — **`hierarchy.rank`, THE MOST-ASSERTED ENGINE REFUSAL IN THE CLIENT
   * SUITE, DRIVEN FOR REAL.**
   *
   * `guarded-child-event.test.ts` asserts it three times through `refusedWith`,
   * and `reopen-flow.test.tsx` once, all against fixtures those files wrote.
   * Comparison form (1): the wire value against a literal, because
   * `'hierarchy.rank'` belongs to no exported constant — it is written out at
   * `checks/hierarchy.ts:134` and `:282` and nowhere else. A reviewer should read
   * that literal as the observed bytes of a running producer, not as a
   * transcription: the producer ran, and a rename at either call site reddens it.
   */
  it('7.240 a story under a task is refused hierarchy.rank, naming both types the right way round', async () => {
    // NON-VACUITY: the identical `story` create under an `epic` commits. The two
    // requests differ in the PARENT'S TYPE and in nothing else — same child type,
    // same project, same actor, same door — so the refusal below is the rank
    // comparison and cannot be a project, permission or type-resolution failure.
    const control = createChildUnder(epicParent, 'Post the day book', 'story');
    const controlBody = (await submitOne(vocOwner.headers, control)) as {
      results: { status: string; reason?: string }[];
    };
    expect(controlBody.results[0]?.status, JSON.stringify(controlBody.results[0])).toBe('committed');

    const body = await submitOne(
      vocOwner.headers,
      createChildUnder(taskParent, 'Count the float', 'story'),
    );
    const [result] = mapIngestResults(body, 1);
    expect(result?.status, JSON.stringify(result)).toBe('refused');
    if (result?.status !== 'refused') throw new Error('unreachable — narrowed by the assertion above');

    expect(result.rule).toBe('hierarchy.rank');
    // `rankRefusal(childTypeName, parentTypeName)` names both TYPE names, resolved
    // by the server out of `proj_ticket_types` — neither is a string this test
    // typed. The two names DIFFER here, which is what makes the sentence able to
    // fail on an argument swap: with "Task" on both sides it could not.
    expect(result.reason).toBe(
      '"Story" cannot go under "Task": a ticket\'s parent must be a bigger kind of work.',
    );
    // AND THE EXPORTED BUILDER, for the reason 7.238 states — with one addition
    // review found and this case is the answer to. `rankRefusal` and
    // `fieldKindRefusal` share the signature `(string, string) => string`, so
    // re-exporting one under the other's name PASSES THE TYPECHECK: the arity
    // mismatch that makes a mis-wired `parentTerminalRefusal` a TS2554 does not
    // exist here. Without this line that swap is green at typecheck, green in
    // app-core and green on the server — the only mis-wire in the export list
    // that nothing at all would notice.
    expect(result.reason).toBe(rankRefusal('Story', 'Task'));
  });

  /**
   * 7.241 — **THE MIGRATION REFUSAL VOCABULARY, AND THE FINDING THAT WAS HANDED
   * TO THIS LANE AS "NO PRODUCER EXISTS".**
   *
   * `packages/app-core/test/workflow-builder/events.test.ts:160,172` configures a
   * fake gateway to refuse a migration under the rule `'ticket.unknown-state'`
   * and then asserts the client returns it. A sweep for that string across
   * `packages/rule-engine/src`, `apps/server/src`, `packages/domain/src` and
   * `packages/app-core/src` finds it in NO producer, and a fabricated control in
   * the same run finds nothing either — so the scoping concluded it was a dead
   * sentence of the `'bad-envelope'` class.
   *
   * **That conclusion is wrong, and the way it was wrong is the finding.** The
   * slot has a real vocabulary: `MIGRATION_RULES`
   * (`apps/server/src/routes/builder-reads.ts:444`) served by a real route,
   * `POST /v1/workspaces/:workspaceId/ticket-types/:typeId/migrate` (`:693`), and
   * it spells its three refusals `migration.same-workflow`,
   * `migration.unknown-target-state` and `migration.unmapped-state`. The fixture
   * is not pinning a discriminant nobody emits; it is pinning **the wrong
   * family's name in a slot that has a real one**, and a sweep for the fixture's
   * OWN string can never find that — a well-formed search, a valid control, and a
   * conclusion undetectable from inside its own run.
   *
   * The fixture site is NOT corrected here: `MIGRATION_RULES` lives in
   * `apps/server`, `app-core` does not and must not depend on it, so there is no
   * import that would fix it and the right answer is a product decision about
   * where that vocabulary belongs. *Recorded with an owner; see the catalogue.*
   *
   * The assertion below is comparison form (1) — the wire value against a
   * literal — with the imported constant carried alongside so the two cannot
   * drift apart silently. The `not.toBe` line is the finding itself, made
   * falsifiable: it goes red the day someone makes the fixture's string real.
   */
  it('7.241 the real migrate route refuses an unknown target state under migration.unknown-target-state', async () => {
    const otherWorkflow = newUlid();
    await post(vocOwner.headers, {
      workspaceId: vocWorkspace,
      entity: { kind: 'workflow', id: otherWorkflow },
      type: 'workflow.defined',
      payload: {
        id: otherWorkflow,
        version: 1,
        name: 'Back-office flow',
        initialStateId: 'todo',
        states: [
          { id: 'todo', name: 'To do', category: 'open' },
          { id: 'shipped', name: 'Shipped', category: 'terminal' },
        ],
        transitions: [{ from: '*', to: 'shipped', rules: [] }],
      },
      actorId: vocOwner.userId,
    });

    // NON-VACUITY, and it is a control over the ROUTE rather than over the world:
    // the same request with a target the destination DOES define gets past this
    // refusal. Without it, a 422 below is satisfied by a route that refuses every
    // migration — including one that never resolved either workflow.
    const reachable = await app.inject({
      method: 'POST',
      url: `/v1/workspaces/${vocWorkspace}/ticket-types/task/migrate`,
      headers: vocOwner.headers,
      payload: { fromWorkflowId: vocWorkflowId, toWorkflowId: otherWorkflow, stateMap: { todo: 'shipped' } },
    });
    expect(reachable.statusCode, reachable.body).toBe(200);

    const res = await app.inject({
      method: 'POST',
      url: `/v1/workspaces/${vocWorkspace}/ticket-types/task/migrate`,
      headers: vocOwner.headers,
      // `never-a-state` is not among the destination's two state ids.
      payload: {
        fromWorkflowId: vocWorkflowId,
        toWorkflowId: otherWorkflow,
        stateMap: { todo: 'never-a-state' },
      },
    });
    expect(res.statusCode, res.body).toBe(422);
    const body = res.json() as { status: string; rule: string; reason: string };

    expect(body.status).toBe('refused');
    // Form (1): the observed bytes. A rename at `builder-reads.ts:448` reddens here.
    expect(body.rule).toBe('migration.unknown-target-state');
    // And the producer's own constant, so the literal above cannot drift from it
    // unnoticed. This pair is weaker than it looks on its own — see the header —
    // and is why the literal is written out rather than replaced by the import.
    expect(body.rule).toBe(MIGRATION_RULES.unknownTargetState);
    // The reason names the DESTINATION workflow and the offending state, both
    // resolved by the server; a client reading it learns which map entry to fix.
    expect(body.reason).toContain('"Back-office flow"');
    expect(body.reason).toContain('"never-a-state"');

    // A SHIPPED CLIENT MODULE OVER THESE REAL BYTES, and it is what keeps this
    // case a witness rather than a route test. `refusalText`
    // (`app-core/src/online/http.ts:69`) is the one narrowing this package ships
    // for a refusal body: it reads `message` first and falls back to `reason`.
    // The migrate route's 422 carries `reason` and no `message`, so this exercises
    // the SECOND branch over bytes a server really sent — asserted below rather
    // than assumed, because if a `message` ever appears this case has silently
    // moved to the first branch and stopped measuring what its title says.
    expect(body).not.toHaveProperty('message');
    expect(refusalText(body)).toBe(body.reason);
  });

  /**
   * 7.242 — **`restrict-to`, THE ENGINE RULE THE CLIENT SUITE ASSERTS MOST, OVER
   * A REAL ROLE-GATED TRANSITION.**
   *
   * `'restrict-to'` appears at many sites across the client packages, but the
   * count is a grep count and not an addressable one: most of them are
   * `{ kind: 'restrict-to' }` — a member of the domain's `Rule` discriminated
   * union, already pinned by the type system and never a mirror. The sites that
   * ARE mirrors are the ones asserting it as a REFUSAL rule, and this case is the
   * running producer behind them.
   *
   * Comparison form (1) plus the producer's own constant, exactly as 7.241, and
   * for the same reason: `rules/restrict-to.ts` builds its refusal FROM
   * `REFUSAL_RULES.restrictTo`, so an assertion against that constant alone would
   * be a self-comparison through one module.
   *
   * **What makes this a role measurement rather than a permission one:** the
   * member is granted workspace membership AND project membership first (the
   * project row is redundant since rule A, 2026-09-29 — a member is on every
   * founded project — and is kept as the fixture the case was measured on), and the
   * control is the SAME actor moving a ticket of the SAME TYPE out of the SAME
   * state along the UNGATED edge. *A different ticket instance* — `approvalTicket()`
   * mints a fresh ULID per call, and an earlier version of this sentence said "the
   * same ticket", which was wrong. The instance difference is inert (both created
   * identically by the owner, both sitting in `todo`); what the control excludes is
   * everything the committed move had to satisfy — session, workspace membership,
   * project membership, submit permission, and type/workflow resolution.
   */
  it('7.242 a non-admin on a role-gated edge is refused restrict-to, not by permission', async () => {
    const vocMember = await signedIn();
    await post(vocOwner.headers, {
      workspaceId: vocWorkspace,
      entity: { kind: 'membership', id: `${vocWorkspace}:${vocMember.userId}` },
      type: 'membership.granted',
      payload: { userId: vocMember.userId, role: 'member' },
      actorId: vocOwner.userId,
    });
    await post(vocOwner.headers, {
      workspaceId: vocWorkspace,
      entity: { kind: 'project', id: vocProject },
      type: 'project.member_added',
      payload: { userId: vocMember.userId, projectAdmin: false },
      actorId: vocOwner.userId,
    });

    // A workflow whose `todo -> approved` edge is admin-only and whose
    // `todo -> noted` edge is open to anyone. Two edges out of one state is what
    // lets the control differ from the case in the RULE and in nothing else.
    const guardedWorkflow = newUlid();
    await post(vocOwner.headers, {
      workspaceId: vocWorkspace,
      entity: { kind: 'workflow', id: guardedWorkflow },
      type: 'workflow.defined',
      payload: {
        id: guardedWorkflow,
        version: 1,
        name: 'Approvals',
        initialStateId: 'todo',
        states: [
          { id: 'todo', name: 'To do', category: 'open' },
          { id: 'noted', name: 'Noted', category: 'active' },
          { id: 'approved', name: 'Approved', category: 'terminal' },
        ],
        transitions: [
          { from: 'todo', to: 'noted', rules: [] },
          { from: 'todo', to: 'approved', rules: [{ kind: 'restrict-to', roles: ['admin'] }] },
        ],
      },
      actorId: vocOwner.userId,
    });
    // A ULID, not the readable `'approval'` a projection-level fixture would use.
    // `eventEnvelopeSchema` requires `entity.id` to be a ULID and the real door
    // enforces it — the first draft here used the readable id and was answered
    // `invalid / malformed-envelope`, which is the door refusing a shape several
    // projection-level fixtures in this repo write directly. Recorded because it
    // is the same class this file exists for: a fixture that never met the door.
    const approvalTypeId = newUlid();
    await post(vocOwner.headers, {
      workspaceId: vocWorkspace,
      entity: { kind: 'ticket-type', id: approvalTypeId },
      type: 'ticket-type.defined',
      payload: {
        id: approvalTypeId,
        name: 'Approval',
        icon: 'check',
        rank: 3,
        workflowId: guardedWorkflow,
        fields: [],
      },
      actorId: vocOwner.userId,
    });

    async function approvalTicket(title: string): Promise<string> {
      const id = newUlid();
      await post(vocOwner.headers, {
        workspaceId: vocWorkspace,
        entity: { kind: 'ticket', id },
        type: 'ticket.created',
        payload: { typeId: approvalTypeId, projectId: vocProject, parentId: null, title },
        actorId: vocOwner.userId,
      });
      return id;
    }

    // NON-VACUITY: the same member, the same ticket type, the same source state,
    // moving along the UNGATED edge. This is what separates "the rule refused
    // them" from "they could never submit here at all".
    const openMove = await submitOne(vocMember.headers, {
      workspaceId: vocWorkspace,
      entity: { kind: 'ticket', id: await approvalTicket('Note the delivery') },
      type: 'ticket.transitioned',
      payload: { to: 'noted' },
      actorId: vocMember.userId,
    });
    const [allowed] = mapIngestResults(openMove, 1);
    expect(allowed?.status, JSON.stringify(allowed)).toBe('committed');

    const body = await submitOne(vocMember.headers, {
      workspaceId: vocWorkspace,
      entity: { kind: 'ticket', id: await approvalTicket('Approve the delivery') },
      type: 'ticket.transitioned',
      payload: { to: 'approved' },
      actorId: vocMember.userId,
    });
    const [result] = mapIngestResults(body, 1);
    expect(result?.status, JSON.stringify(result)).toBe('refused');
    if (result?.status !== 'refused') throw new Error('unreachable — narrowed by the assertion above');

    expect(result.rule).toBe('restrict-to');
    expect(result.rule).toBe(REFUSAL_RULES.restrictTo);
    // THE WHOLE SENTENCE, and it replaces a `toContain('admin')` that review
    // correctly called dressed-up non-vacuity: `'admin'` is a value THIS TEST typed
    // into the workflow definition above, so a producer that hard-coded it would
    // have satisfied that line. The equality below pins the frame, the `', or '`
    // join implied by the single-criterion phrasing, and — the half no fixture can
    // fake — that the refusal names the ACTOR, whose id the server resolved from
    // the session and which nothing in the workflow definition carries.
    expect(result.reason).toBe(
      `Only anyone with the role admin may make this move, and ${vocMember.userId} is not among them.`,
    );
  });
});
