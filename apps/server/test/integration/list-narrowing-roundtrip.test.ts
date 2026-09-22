import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createOnlineDataSource, type FetchLike } from '@gisik-nokma/app-core/online';
import { newUlid, type SubmittedEvent } from '@gisik-nokma/domain';
import type { LogOtpSender } from '../../src/auth/otp-sender.js';
import { buildTestApp } from '../helpers/app.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { signInWithPhone } from '../helpers/session.js';

/**
 * **`13.304` — the `Only tickets in progress` checkbox's LIST half, witnessed at
 * the REAL door.** This is the POSITIVE arm; `13.436`
 * (`apps/web/test/board-narrowing.test.tsx:214-246`) is the NEGATIVE one and the
 * two are meant to be read as a pair.
 *
 * ## The gap, in the case's own words
 *
 * `13.304` was minted ❌ as *"the plan's sentence is UNSATISFIABLE as written,
 * and the half that is true is unwitnessed"*. The unsatisfiable half is the
 * Board's: `getBoard(projectId: string)` takes no filter at all
 * (`packages/app-core/src/data-source.ts:142`), so the Board's `N of M` is the
 * complete total under EVERY value of `activeOnly`. The half that is true and was
 * witnessed NOWHERE is this one — the control narrows the **List's server read**,
 * and no test ticked the control and then asserted the List's row set shrank.
 *
 * **Two suites click the checkbox — three click sites across two files**
 * (`board-narrowing.test.tsx:232`, `page-refusals.test.tsx:528` and `:563`), and
 * neither can make this claim. They fail it in **opposite** ways, which is why the count
 * is stated per file and not as "three places". `board-narrowing.test.tsx:185` declares
 * `getTickets: async (): Promise<TicketListView> => ({ projectId: PROJECT_ID, rows })` —
 * **no parameters at all**, so a filter cannot reach it. `page-refusals.test.tsx:497-503`
 * DOES read `filter.stateCategories` and narrows — but it narrows **inside the stub**: the
 * fake re-implements the server's narrowing and then asserts its own copy of the rule.
 * **Neither is evidence about the server** — one cannot see the filter, the other answers
 * from a hand-written version of it, and a rule copied into a fake is exactly the thing
 * that stops the server from having to exist. (A third file, `new-ticket-dialog.test.tsx`,
 * mentions the control in a docblock and passes `parentCandidatesNarrowing` as a prop; it
 * never clicks it, so it is not a suite that clicks.) The owner's
 * ruling (2026-09-19, `controller-state.md` "📌 THE OWNER'S RULINGS", item 4) chose
 * option **"c"** — the real-door case — and rejected the alternative of restating
 * the case down to what a stub can express.
 *
 * ## THE DOOR WAS MEASURED BEFORE IT WAS USED, AND NO NEW DOOR WAS NEEDED
 *
 * The dispatch's first requirement was to measure the door and stop if it needed
 * a NEW route or a widened pinned signature. It does not. The filter the checkbox
 * needs is already carried end to end by shipped code:
 *
 * | step | where |
 * |---|---|
 * | the page builds the CLIENT filter | `apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx:321-324` — `activeOnly ? { stateCategories: ['active'] } : {}` |
 * | the List passes it to the read | `packages/app-core/src/views/ticket-list.tsx:1196` |
 * | the mapper translates plural → SINGULAR | `packages/app-core/src/online/mappers.ts:910` |
 * | `filterSpecSchema` already has the term | `packages/domain/src/filter-spec.ts:125` |
 * | the LIST route validates the query against that schema | `apps/server/src/routes/list.ts:536` |
 * | ...and compiles it | `apps/server/src/routes/list.ts:136` |
 * | the compiler already emits the clause | `apps/server/src/read/compile-filter.ts:104` |
 *
 * So this case adds no surface: it drives the read the product already ships. That
 * is also why the wire spelling is SINGULAR — `stateCategory`, from
 * `mappers.ts:910`'s `singular(...)` — and why asserting the client's plural
 * `stateCategories` against the route would 400 rather than narrow.
 *
 * ## What the narrowing IS, exactly — and why a `todo` ticket is in the fixture
 *
 * `SIMPLE_KANBAN_TEMPLATE` (`packages/domain/src/simple-kanban.ts:24-26`) gives the
 * three categories three DIFFERENT states: `todo` is `open`, `doing` is `active`,
 * `done` is `terminal`. The checkbox filters on the category `active`, which is
 * the `doing` state ALONE — not "everything that is not terminal". The fixture
 * therefore holds one ticket in each of the three states, and the narrowed read is
 * asserted to be EXACTLY the `doing` one. **A fixture with only `active` and
 * `terminal` tickets would be unable to tell "narrowed to the active category"
 * from "narrowed to non-terminal", and would pass for the wrong reason.**
 *
 * ## The mutation this case is built to die on
 *
 * Delete `apps/server/src/read/compile-filter.ts:104` — the `stateCategory` clause.
 * The filter is then silently IGNORED: the query does not fail, it answers with
 * every row, and the narrowed assertion below reddens for the property it names.
 * A mutation that instead left a parameter unbound would kill this case
 * by 500-ing the route, which proves the query broke rather than the narrowing
 * happened — *a mutation must change the PROPERTY, not just the source.*
 *
 * **"Alone" is scoped, and the scope is measured:** this deletion reddens THIS file
 * alone — the control above still passes — but it is NOT alone repo-wide.
 * `apps/server/test/read/compile-filter.test.ts` already pins the clause directly and
 * reddens with it, which is correct and is why this file does not also assert the
 * clause text. The claim here is only that this case dies for its own property rather
 * than as collateral of a broken query.
 *
 * ## The prohibition
 *
 * **No `applyCommitted`, no `insertEvent`, no INSERT into any `proj_*` table.**
 * Every fact asserted below arrived through `signInWithPhone`, `POST
 * /v1/workspaces` or `POST /v1/events`. A seeder would put the row into the
 * projection by hand and leave the route re-asserting arithmetic some other suite
 * already covers — the failure mode `real-door-round-trip.test.ts` names.
 *
 * ## Why `app.inject` and not a socket
 *
 * `injectFetch` is the same seam `notifications-consumer-roundtrip.test.ts` uses,
 * and for the same reason: the REAL client transport meets the REAL route, the
 * REAL filter compiler and REAL Postgres in one process. The socket is the one
 * thing not exercised, and no case here claims it is. This case is about the
 * CONTRACT between the checkbox's filter and the query the server runs.
 */

let db: TestDatabase;
let app: FastifyInstance;
let otp: LogOtpSender;
let me: { userId: string; headers: { authorization: string } };

let workspaceId: string;
let projectId: string;

/** One ticket per state category, so the narrowing has something to remove. */
let openTicketId: string; // state `todo`  — category `open`
let activeTicketId: string; // state `doing` — category `active`
let terminalTicketId: string; // state `done`  — category `terminal`

let phoneCounter = 0;

async function signedIn(): Promise<{ userId: string; headers: { authorization: string } }> {
  phoneCounter += 1;
  const user = await signInWithPhone(app, otp, `+9190201${String(phoneCounter).padStart(5, '0')}`);
  return { userId: user.userId, headers: { authorization: `Bearer ${user.token}` } };
}

/**
 * A `FetchLike` over `app.inject`, supplying exactly the three members
 * `http.ts`'s `send` reads (`status`, `ok`, `json()`) and nothing else — so a
 * client that started reaching for `headers` or `text()` would FAIL here rather
 * than silently pass. `ok` is DERIVED from the status the server actually set,
 * never passed in: `ok` is the one field a hand-built fake gets to decide for
 * itself, and deciding it is how a fake stops being evidence.
 *
 * Copied in shape from `notifications-consumer-roundtrip.test.ts` deliberately
 * rather than shared: that file's copy is load-bearing for its own cases, and a
 * shared helper that one of them later needed to bend would bend for both.
 */
function injectFetch(headers: { authorization: string }, calls: string[] = []): FetchLike {
  return (async (input: string, init?: RequestInit) => {
    calls.push(input);
    const method = (init?.method ?? 'GET') as 'GET' | 'POST';
    const rawBody = init?.body;
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

/** The REAL client read path, over the real route. Zero `vi.mock` in this file. */
function sourceFor(headers: { authorization: string }, calls: string[] = []) {
  return createOnlineDataSource({ baseUrl: '', fetchImpl: injectFetch(headers, calls) });
}

/**
 * One event through the product's own door, asserting it COMMITTED.
 *
 * The assertion is the point rather than the plumbing: a refusal here would leave
 * the world half-built and every read below would assert an emptiness that looked
 * like a route bug. `results[0].status` is checked on every call so a failure
 * names the write that failed, not the read that noticed.
 */
async function post(
  headers: { authorization: string },
  event: Omit<SubmittedEvent, 'id' | 'version' | 'origin' | 'clientTime'>,
  expectedSeq: number,
): Promise<void> {
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
  const body = res.json() as { results?: Array<Record<string, unknown>> };
  expect(body.results?.[0]?.['status'], `POST /v1/events refused ${event.type}`).toBe('committed');
  expect(body.results?.[0]?.['seq']).toBe(expectedSeq);
}

/** The ids a read answered with, sorted so the assertion is about the SET. */
function ids(rows: Array<{ ticketId: string }>): string[] {
  return rows.map((row) => row.ticketId).sort();
}

beforeAll(async () => {
  db = await createTestDatabase();
  const built = buildTestApp(db);
  app = built.app;
  otp = built.otp;
  await app.ready();

  me = await signedIn();

  // ─── The world, through the doors and nothing else ────────────────────────
  const founded = await app.inject({
    method: 'POST',
    url: '/v1/workspaces',
    headers: me.headers,
    payload: { name: 'Narrowing Corner' },
  });
  expect(founded.statusCode).toBe(201);
  workspaceId = (founded.json() as { workspaceId: string }).workspaceId;

  projectId = newUlid();
  await post(
    me.headers,
    {
      workspaceId,
      entity: { kind: 'project', id: projectId },
      type: 'project.created',
      payload: { name: 'Shop floor' },
      actorId: me.userId,
    },
    1,
  );
  // The founder owns the workspace but is not on the project until this lands;
  // without it the visibility pass refuses every read below and the assertions
  // would fire on the wrong guard.
  await post(
    me.headers,
    {
      workspaceId,
      entity: { kind: 'project', id: projectId },
      type: 'project.member_added',
      payload: { userId: me.userId, projectAdmin: true },
      actorId: me.userId,
    },
    2,
  );

  openTicketId = newUlid();
  activeTicketId = newUlid();
  terminalTicketId = newUlid();

  for (const [id, title] of [
    [openTicketId, 'Stays in To do'],
    [activeTicketId, 'Moves to Doing'],
    [terminalTicketId, 'Runs through to Done'],
  ] as const) {
    await post(
      me.headers,
      {
        workspaceId,
        entity: { kind: 'ticket', id },
        type: 'ticket.created',
        payload: { typeId: 'task', projectId, parentId: null, title },
        actorId: me.userId,
      },
      1,
    );
  }

  // `doing` is the ONLY state in category `active` (simple-kanban.ts:25), which
  // is the category the checkbox filters on. Born in `todo` (category `open`) and
  // moved one step, so the row's final category is a fact the ENGINE resolved
  // rather than one this fixture asserted about itself.
  await post(
    me.headers,
    {
      workspaceId,
      entity: { kind: 'ticket', id: activeTicketId },
      type: 'ticket.transitioned',
      payload: { to: 'doing' },
      actorId: me.userId,
    },
    2,
  );
  // `done` is category `terminal` — the row the narrowing must REMOVE.
  await post(
    me.headers,
    {
      workspaceId,
      entity: { kind: 'ticket', id: terminalTicketId },
      type: 'ticket.transitioned',
      payload: { to: 'doing' },
      actorId: me.userId,
    },
    2,
  );
  await post(
    me.headers,
    {
      workspaceId,
      entity: { kind: 'ticket', id: terminalTicketId },
      type: 'ticket.transitioned',
      payload: { to: 'done' },
      actorId: me.userId,
    },
    3,
  );
});

afterAll(async () => {
  await app.close();
  await db.drop();
});

describe('13.304 — the List narrows at the real door when the checkbox is ticked', () => {
  it('13.304 the unfiltered List holds all three, and the narrowed List holds ONLY the active one', async () => {
    const calls: string[] = [];
    const source = sourceFor(me.headers, calls);

    // ─── THE CONTROL RUNS FIRST ──────────────────────────────────────────────
    // Not after the assertion it protects. The runner stops at the first
    // failure, so a narrowed assertion that ran first would, if it failed, hide
    // whether the CONTROL is even capable of observing the rows — and a control
    // that cannot fail is not a control. Running it first makes "the world
    // exists and the read can see all of it" a fact established BEFORE the
    // narrowing is asked about, so a red below is about the narrowing.
    const all = await source.query.getTickets(projectId, {}, 'flat');
    expect(ids(all.rows)).toEqual([activeTicketId, openTicketId, terminalTicketId].sort());
    // The three categories really are three, read off the wire rather than
    // assumed from the template: a fixture whose tickets all landed in one
    // category would make the narrowing assertion below vacuous.
    expect(
      all.rows.map((row) => [row.ticketId, row.stateCategory] as const).sort(),
    ).toEqual(
      [
        [activeTicketId, 'active'],
        [openTicketId, 'open'],
        [terminalTicketId, 'terminal'],
      ].sort(),
    );

    // ─── THE POSITIVE ARM: exactly what the checkbox sends ────────────────────
    // `page.tsx:321-324` builds `{ stateCategories: ['active'] }`, the client
    // mapper singularises it, and the route narrows server-side. This is the
    // read no stub in the repo can stand in for.
    const callsBefore = calls.length;
    const narrowed = await source.query.getTickets(
      projectId,
      { stateCategories: ['active'] },
      'flat',
    );

    expect(ids(narrowed.rows)).toEqual([activeTicketId]);
    // The narrowing is a SERVER narrowing, not a client-side filter over a full
    // page: the request went out carrying the filter, and the same read is what
    // answered. Asserted on the URL the client actually formed, so a client that
    // dropped the filter and filtered locally would fail here rather than pass
    // on a coincidentally-equal row set.
    // Filtered to the PAGE requests: the walk also makes ONE roster request for
    // display names (the `memberLabel` join, case 13.1290), which carries no
    // filter and is not what this arm is about. That request is asserted
    // present, so the exclusion is a partition rather than a narrowing of the
    // evidence — and the partition CARRIES its total below, because
    // `pages = 1` and `rosters = 1` are both satisfied by a walk that made a
    // third request too.
    const narrowedCalls = calls.slice(callsBefore);
    const narrowedPages = narrowedCalls.filter((url) => url.includes('/tickets?'));
    const narrowedRosters = narrowedCalls.filter((url) => url.includes('/members'));
    expect(narrowedPages).toHaveLength(1);
    expect(decodeURIComponent(narrowedPages[0] ?? '')).toContain('"stateCategory":"active"');
    expect(narrowedRosters).toHaveLength(1);
    expect(narrowedCalls).toHaveLength(2);
    expect(narrowedPages.length + narrowedRosters.length).toBe(narrowedCalls.length);

    // ─── THE BOARD READ IS UNNARROWED — a SUPPORTING fact, NOT the negative arm ─
    // `getBoard(projectId)` takes NO filter (`data-source.ts:142`), so the Board's
    // own count is the complete total under every value of `activeOnly`. Driving it
    // through the SAME client, in the same session as the narrowed read above, shows
    // the narrowing does not leak into the Board's read.
    //
    // WHAT THIS DOES **NOT** PROVE, said plainly because the case text over-credits
    // it: this read cannot fail for the hazard the docblock above names — a future
    // implementer sourcing the RENDERED `N of M` from the List's narrowed rows. That
    // hazard lives in the page, and this assertion never observes the page. **The real
    // negative arm is `13.436`** (`apps/web/test/board-narrowing.test.tsx:214-246`),
    // which renders and asserts the count reads the board's total rather than the
    // list-sourced one. What is pinned here is the wire-level half only: the read the
    // Board is built from takes no filter, so it cannot have narrowed.
    const board = await source.query.getBoard(projectId);
    const boardCards = board.groups.flatMap((group) =>
      group.columns.flatMap((column) => column.cards),
    );
    expect(boardCards).toHaveLength(3);
  });
});
