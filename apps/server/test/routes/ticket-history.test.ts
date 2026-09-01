import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid, type LedgerEvent } from '@gisik-nokma/domain';
import type { FastifyInstance, InjectOptions } from 'fastify';
import type { LogOtpSender } from '../../src/auth/otp-sender.js';
import {
  BAD_PAGING_BODY,
  DEFAULT_LIMIT,
  MAX_LIMIT,
  parsePaging,
} from '../../src/routes/ticket-history.js';
import { NOT_FOUND_BODY } from '../../src/routes/tickets.js';
import { buildTestApp } from '../helpers/app.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { testEnvelope } from '../helpers/envelope.js';
import { appendTestEvent } from '../helpers/ledger.js';
import { seedMember, seedTicket } from '../helpers/seed.js';
import { signInWithPhone } from '../helpers/session.js';

/**
 * Plan 3 Chain B Task 13 — `GET /v1/tickets/:id/history`.
 *
 * ## The two properties, and the instrument each one needs
 *
 * **Indistinguishability.** A 404 on an invisible ticket proves nothing on its
 * own: a route that 404'd everything would pass it. So the refusal cases are
 * compared against the NONEXISTENT answer — status, body and headers — and each
 * carries a positive control: the same viewer, the same route, an id they may
 * see. That is the shape `tickets-read.test.ts` established for the
 * workspace-scoped door, reused here rather than reinvented, because the
 * property is the same property.
 *
 * **The history IS the ledger, filtered.** Filtered to this ticket (proven with
 * a positive control on the ticket whose events were excluded — an exclusion
 * assertion with no control passes on an empty result), ordered by the
 * per-entity `seq`, and unsummarised.
 *
 * ## The ordering assertion here CANNOT falsify `ORDER BY seq ASC`, and its
 * ## proof lives next door
 *
 * The case below builds its claims 2, 3, 4 and stores them 4, 3, 2, so the heap
 * really is out of order — measured, `ctid` beside `seq`. It still survives
 * deleting the route's `ORDER BY`, because `EXPLAIN (ANALYZE)` on the route's
 * own query shows an `Index Scan using events_entity_seq_unique`, and that
 * index is `(entity_kind, entity_id, seq)`: it emits seq order whether or not
 * the query asks. The seq assertion is kept — it is the ordinary-conditions
 * statement of the contract — but it is NOT the evidence, and this note is here
 * so nobody later reads it as evidence.
 *
 * The evidence is `ticket-history-ordering.test.ts`, which takes the index
 * plans away at the database level, validates that it really did (its
 * unordered control asserts the exact heap order it gets back), and only then
 * asserts the route answers ascending. Deleting `ORDER BY seq ASC` reddens two
 * cases there and nothing here.
 *
 * ## Paging edges live in two instruments, deliberately
 *
 * `limit=999999` and `limit=1000` return the same rows from any ledger this
 * suite can afford to build, so the CLAMP is invisible over HTTP. It is
 * asserted on the value by the `parsePaging` unit cases at the bottom of this
 * file; the route cases assert only what HTTP can actually see — that a limit
 * shrinks the page, that an `afterSeq` moves it, that an enormous limit is
 * ANSWERED rather than refused, and that a malformed parameter is refused.
 *
 * ## A fresh workspace per test, and no sequence reset
 *
 * Each test file gets its own database, and `events` refuses TRUNCATE (it is
 * append-only), so tests SHARE state within this file. Every test mints its own
 * workspace and ticket ULIDs. `resetTestSequences()` is deliberately not
 * called: with rows that are never deleted, restarting the counter would
 * re-mint a `workspace_seq` and collide on `events_workspace_seq_unique`.
 *
 * ## `seedTicket` writes no `proj_tickets` row, and this route does not want one
 *
 * `applyAll` applies projects, memberships, invites and visibility only. The
 * plan text's `SELECT 1 FROM proj_tickets` existence check would therefore 404
 * every fixture in this file — and it is not written in the route for a better
 * reason than that (a second notion of existence, read from a different table
 * than the audience decision, is how an existence oracle gets reopened; see the
 * route's docblock). Recorded here so the absence is not later read as an
 * oversight, and so nobody "fixes" it by adding `proj_tickets` to `applyAll`,
 * which that helper's own docblock scopes out.
 */

/**
 * `app.inject`'s response type, derived from the instance rather than imported
 * from `light-my-request` — that package is a transitive dependency of fastify
 * and is not declared here, so naming it directly does not resolve.
 */
type InjectResponse = Awaited<ReturnType<FastifyInstance['inject']>>;

let db: TestDatabase;
let app: FastifyInstance;
let otp: LogOtpSender;

beforeAll(async () => {
  db = await createTestDatabase();
  const built = buildTestApp(db);
  app = built.app;
  otp = built.otp;
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await db.drop();
});

let phoneCounter = 0;

/** A signed-in caller, real sign-in over the wire. `userId` is what their membership is seeded under. */
async function signedIn(): Promise<{ userId: string; headers: { authorization: string } }> {
  phoneCounter += 1;
  return signInWithPhone(app, otp, `+9190000${String(phoneCounter).padStart(5, '0')}`).then(
    (user) => ({ userId: user.userId, headers: { authorization: `Bearer ${user.token}` } }),
  );
}

function get(url: string, headers?: Record<string, string>): Promise<InjectResponse> {
  const options: InjectOptions = { method: 'GET', url, ...(headers ? { headers } : {}) };
  return app.inject(options);
}

/**
 * Every response header except `date`, which is a clock reading and differs
 * between two requests for reasons that have nothing to do with what is being
 * compared. Everything else — `content-type` and `content-length` above all —
 * must match, because a length that differed would ITSELF be the oracle even if
 * both bodies parsed to the same object.
 */
function comparableHeaders(res: InjectResponse): Record<string, unknown> {
  const { date: _date, ...rest } = res.headers;
  return rest;
}

type HistoryBody = {
  ticketId: string;
  events: Array<{
    id: string;
    type: string;
    version: number;
    payload: unknown;
    actorId: string;
    origin: string;
    clientTime: string;
    serverTime: string;
    seq: number;
  }>;
};

function history(res: InjectResponse): HistoryBody {
  return res.json() as HistoryBody;
}

/** A claim on a ticket, built but not yet stored — so a caller may choose the order it lands in. */
function claim(
  workspaceId: string,
  ticketId: string,
  type: string,
  payload: Record<string, unknown>,
  extra: Partial<LedgerEvent> = {},
): LedgerEvent {
  return testEnvelope({
    workspaceId,
    entity: { kind: 'ticket', id: ticketId },
    type,
    payload,
    actorId: extra.actorId ?? '01J0SEEDADM1N0000000000000',
    ...extra,
  });
}

/** A member of `ws` on project `prj`, plus a ticket there they may see. */
async function memberWithTicket(): Promise<{
  ws: string;
  prj: string;
  userId: string;
  headers: { authorization: string };
  ticketId: string;
}> {
  const ws = newUlid();
  const prj = newUlid();
  const { userId, headers } = await signedIn();
  await seedMember(db.pool, ws, userId, 'member', [{ projectId: prj }]);
  const ticketId = newUlid();
  await seedTicket(db.pool, { workspaceId: ws, projectId: prj, ticketId });
  return { ws, prj, userId, headers, ticketId };
}

describe('GET /v1/tickets/:id/history — the ledger, filtered to one ticket', () => {
  it('serves this ticket claims and no others, in seq order', async () => {
    // The claims are BUILT 2, 3, 4 (testEnvelope mints seq in build order) and
    // STORED 4, 3, 2, so heap order is 1, 4, 3, 2. That is NOT enough to
    // falsify the route's `ORDER BY` — the planner picks the
    // (entity_kind, entity_id, seq) unique index and sorts it for free; see the
    // file docblock and `ticket-history-ordering.test.ts`, which is where the
    // ordering is actually proven. What this case does constrain is the FILTER:
    // one ticket's claims, all of them, none of anybody else's.
    const { ws, prj, headers, ticketId } = await memberWithTicket();
    const second = claim(ws, ticketId, 'ticket.field_set', { fieldId: 'dueDate', value: 'x' });
    const third = claim(ws, ticketId, 'ticket.transitioned', { to: 'doing' });
    const fourth = claim(ws, ticketId, 'ticket.transitioned', { to: 'done' });
    expect([second.seq, third.seq, fourth.seq]).toEqual([2, 3, 4]);
    for (const env of [fourth, third, second]) {
      await appendTestEvent(db.pool, env);
    }

    // A second ticket in the SAME project, visible to the same viewer, with its
    // own claims — so the filter below is proven by exclusion AND the excluded
    // ticket is proven to have had something to exclude.
    const otherTicket = newUlid();
    await seedTicket(db.pool, { workspaceId: ws, projectId: prj, ticketId: otherTicket });
    const otherClaim = claim(ws, otherTicket, 'ticket.transitioned', { to: 'done' });
    await appendTestEvent(db.pool, otherClaim);

    const res = await get(`/v1/tickets/${ticketId}/history`, headers);
    expect(res.statusCode).toBe(200);
    const body = history(res);
    expect(body.ticketId).toBe(ticketId);
    expect(body.events.map((e) => e.seq)).toEqual([1, 2, 3, 4]);
    // `seedTicket` does not hand back the `ticket.created` envelope, so seq 1
    // is pinned by its seq above and the three claims this test authored are
    // pinned by identity here. Comparing the first id to itself would be a
    // tautology, so it is not written.
    expect(body.events.slice(1).map((e) => e.id)).toEqual([second.id, third.id, fourth.id]);
    expect(body.events.map((e) => e.id)).not.toContain(otherClaim.id);

    // The positive control for the exclusion: the other ticket really did have
    // a claim, and its own history really does carry it. Without this, the
    // `not.toContain` above would pass against a ledger that never stored it.
    const otherRes = await get(`/v1/tickets/${otherTicket}/history`, headers);
    expect(otherRes.statusCode).toBe(200);
    const otherBody = history(otherRes);
    expect(otherBody.events).toHaveLength(2);
    expect(otherBody.events.slice(1).map((e) => e.id)).toEqual([otherClaim.id]);
  });

  it('excludes a claim filed against a different ENTITY KIND under the same id', async () => {
    // `entity_kind = 'ticket'` in the WHERE survived being deleted until this
    // case existed: entity ids are ULIDs, so no ordinary fixture makes a
    // non-ticket entity share a ticket id, and the predicate was an
    // unconstrained path rather than a tested one. The ledger itself imposes no
    // such uniqueness — `events_entity_seq_unique` is (kind, id, seq), so the
    // two rows below coexist happily and even share `seq`.
    //
    // The forgery is the point: this is what the predicate is FOR, and a claim
    // about a project is not part of a ticket history however the id was
    // chosen. Mutation: drop `entity_kind = 'ticket'` and the impostor arrives
    // in the page.
    const { ws, headers, ticketId } = await memberWithTicket();
    const impostor = testEnvelope({
      workspaceId: ws,
      entity: { kind: 'project', id: ticketId },
      type: 'project.created',
      payload: { name: 'not a ticket claim' },
      actorId: newUlid(),
    });
    await appendTestEvent(db.pool, impostor);

    // The control: the row really is in the ledger under that id, so the
    // exclusion below is an exclusion and not an absence.
    const stored = await db.pool.query<{ entity_kind: string }>(
      'SELECT entity_kind FROM events WHERE id = $1',
      [impostor.id],
    );
    expect(stored.rows.map((r) => r.entity_kind)).toEqual(['project']);

    const body = history(await get(`/v1/tickets/${ticketId}/history`, headers));
    expect(body.events.map((e) => e.id)).not.toContain(impostor.id);
    expect(body.events.map((e) => e.type)).toEqual(['ticket.created']);
  });

  it('serves every field of a claim unsummarised, with the actor and both clocks', async () => {
    // Mutation: drop any field from the mapper, or render either clock any way
    // but the ISO instant (`String(row.client_time)` yields the Asia/Kolkata
    // `+05:30` rendering, since every connection runs in that zone), and this
    // reddens naming the field.
    const { ws, headers, ticketId } = await memberWithTicket();
    const stranger = newUlid();
    const claimed = claim(
      ws,
      ticketId,
      'ticket.field_set',
      { fieldId: 'dueDate', value: { date: '2026-08-30' } },
      {
        actorId: stranger,
        clientTime: '2026-08-20T09:00:00.000Z',
        serverTime: '2026-08-20T09:00:01.000Z',
      },
    );
    await appendTestEvent(db.pool, claimed);

    const body = history(await get(`/v1/tickets/${ticketId}/history`, headers));
    const event = body.events.find((e) => e.id === claimed.id);
    expect(event).toEqual({
      id: claimed.id,
      type: 'ticket.field_set',
      version: 1,
      payload: { fieldId: 'dueDate', value: { date: '2026-08-30' } },
      // Provenance is never redacted from someone entitled to the state
      // (spec §6): the actor shares no project — indeed nothing — with the
      // viewer, and goes out whole.
      actorId: stranger,
      origin: 'web',
      clientTime: '2026-08-20T09:00:00.000Z',
      serverTime: '2026-08-20T09:00:01.000Z',
      seq: 2,
    });
    // The two clocks are separate facts and both survive: a serializer that
    // collapsed them onto each other would pass an assertion looking at one.
    expect(event?.clientTime).not.toBe(event?.serverTime);
  });

  it('a claim submitted at +05:30 reads back as the equivalent Z instant, the two clocks still one second apart', async () => {
    // 2026-08-20T14:30:00+05:30 IS 2026-08-20T09:00:00Z. Both clocks are
    // timestamptz (owner decision 2026-08-20), so the offset the device typed
    // is not retained; the moment it named is. Asserting the verbatim `+05:30`
    // string here would be asserting a storage format the product deliberately
    // gave up.
    const { ws, headers, ticketId } = await memberWithTicket();
    const claimed = claim(
      ws,
      ticketId,
      'ticket.field_set',
      { fieldId: 'startDate', value: { date: '2026-09-01' } },
      {
        clientTime: '2026-08-20T14:30:00.000+05:30',
        serverTime: '2026-08-20T14:30:01.000+05:30',
      },
    );
    await appendTestEvent(db.pool, claimed);

    const body = history(await get(`/v1/tickets/${ticketId}/history?afterSeq=1`, headers));
    expect(body.events).toHaveLength(1);
    expect(body.events[0]?.clientTime).toBe('2026-08-20T09:00:00.000Z');
    expect(body.events[0]?.serverTime).toBe('2026-08-20T09:00:01.000Z');
    expect(
      Date.parse(body.events[0]?.serverTime ?? '') - Date.parse(body.events[0]?.clientTime ?? ''),
    ).toBe(1000);
  });

  it('agrees event for event with the workspace-scoped /events door over the same ticket', async () => {
    // The two routes are different contracts over the same rows, and the SELECT
    // is deliberately NOT shared between them (see the route docblock: shared
    // code would make them agree by construction, which no test can falsify).
    // THIS is the drift instrument instead. The length assertion first, because
    // two empty lists compare equal and would prove nothing.
    const { ws, headers, ticketId } = await memberWithTicket();
    for (const type of ['ticket.transitioned', 'ticket.field_set']) {
      await appendTestEvent(db.pool, claim(ws, ticketId, type, { to: 'done' }));
    }

    const mine = history(await get(`/v1/tickets/${ticketId}/history`, headers));
    const neighbour = await get(`/v1/workspaces/${ws}/tickets/${ticketId}/events`, headers);
    expect(neighbour.statusCode).toBe(200);
    const theirs = neighbour.json() as { events: Array<{ id: string; seq: number }> };

    expect(mine.events).toHaveLength(3);
    expect(theirs.events).toHaveLength(3);
    expect(mine.events.map((e) => e.id)).toEqual(theirs.events.map((e) => e.id));
    expect(mine.events.map((e) => e.seq)).toEqual(theirs.events.map((e) => e.seq));
  });
});

describe('GET /v1/tickets/:id/history — invisible is nonexistent', () => {
  it('the history of a ticket a viewer may not see is byte-identical to the history of one that never existed', async () => {
    // The existence oracle Plan 4 Task 8 closed at the neighbouring route, held
    // shut at this one. Mutation: give the `canSee` refusal any answer of its
    // own — a 403, an empty 200, a body naming the ticket — and the two
    // responses stop matching. Deleting the guard outright reddens it the other
    // way, through the positive control.
    //
    // Paging is ABSENT on all three requests on purpose: paging is validated
    // before the audience is consulted, so a junk parameter here would refuse
    // above the guard this case is about.
    const ws = newUlid();
    const mine = newUlid();
    const theirs = newUlid();
    const { userId, headers } = await signedIn();
    await seedMember(db.pool, ws, userId, 'member', [{ projectId: mine }]);
    const visible = newUlid();
    const invisibleId = newUlid();
    await seedTicket(db.pool, { workspaceId: ws, projectId: mine, ticketId: visible });
    await seedTicket(db.pool, { workspaceId: ws, projectId: theirs, ticketId: invisibleId });

    // Positive control FIRST: this viewer, this route, an id they may see. It
    // is what stops "404s everything" from passing this test.
    const allowed = await get(`/v1/tickets/${visible}/history`, headers);
    expect(allowed.statusCode).toBe(200);
    expect(history(allowed).events).toHaveLength(1);

    const invisible = await get(`/v1/tickets/${invisibleId}/history`, headers);
    const ghost = await get(`/v1/tickets/${newUlid()}/history`, headers);
    expect(invisible.statusCode).toBe(404);
    expect(ghost.statusCode).toBe(404);
    // Against the constant the neighbouring route exports — the same object,
    // imported rather than restated, so the two surfaces cannot drift into
    // different 404s — and against the literal, so the wire contract is pinned
    // too.
    expect(invisible.json()).toEqual(NOT_FOUND_BODY);
    expect(invisible.json()).toEqual({ error: 'not_found' });
    expect(invisible.json()).toEqual(ghost.json());
    expect(comparableHeaders(invisible)).toEqual(comparableHeaders(ghost));
  });

  it('a ticket in a workspace the viewer does not belong to is the same 404, though a member of that workspace reads it', async () => {
    // This path names no workspace, so there is no `AND workspace_id = $2` to
    // walk: `canSee` resolves the role in the workspace the TICKET names. The
    // second viewer is the positive control that makes the refusal
    // attributable to the FIRST viewer not being in that workspace, rather than
    // to the ticket being unreadable by anyone.
    const wsA = newUlid();
    const wsB = newUlid();
    const prjA = newUlid();
    const prjB = newUlid();
    const outsider = await signedIn();
    const insider = await signedIn();
    await seedMember(db.pool, wsA, outsider.userId, 'member', [{ projectId: prjA }]);
    await seedMember(db.pool, wsB, insider.userId, 'member', [{ projectId: prjB }]);
    const ticketInB = newUlid();
    await seedTicket(db.pool, { workspaceId: wsB, projectId: prjB, ticketId: ticketInB });

    const byInsider = await get(`/v1/tickets/${ticketInB}/history`, insider.headers);
    expect(byInsider.statusCode).toBe(200);

    const byOutsider = await get(`/v1/tickets/${ticketInB}/history`, outsider.headers);
    expect(byOutsider.statusCode).toBe(404);
    expect(byOutsider.json()).toEqual(NOT_FOUND_BODY);
  });

  it('answers the generic 401 with no session', async () => {
    // Without this the file would prove only that a signed-in caller is
    // filtered: a route registered WITHOUT `requireSession` leaves
    // `request.currentUserId` undefined, which resolves to no role and 404s
    // anyway — so every refusal case above would still pass while the door
    // stood open. Mutation: drop `preHandler: requireSession` from the
    // registration and this answers 404 instead of 401.
    const res = await get(`/v1/tickets/${newUlid()}/history`);
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: 'unauthenticated' });
  });
});

describe('GET /v1/tickets/:id/history — paging, and what happens at the edges', () => {
  /** A visible ticket with claims at seq 1..4. */
  async function pagedTicket(): Promise<{ headers: { authorization: string }; ticketId: string }> {
    const { ws, headers, ticketId } = await memberWithTicket();
    for (const to of ['doing', 'review', 'done']) {
      await appendTestEvent(db.pool, claim(ws, ticketId, 'ticket.transitioned', { to }));
    }
    return { headers, ticketId };
  }

  it('afterSeq moves the page and limit shrinks it', async () => {
    const { headers, ticketId } = await pagedTicket();
    // The unpaged control first: without it, "returns [2]" would pass against a
    // ledger that only ever held one event.
    const all = history(await get(`/v1/tickets/${ticketId}/history`, headers));
    expect(all.events.map((e) => e.seq)).toEqual([1, 2, 3, 4]);

    const page = history(await get(`/v1/tickets/${ticketId}/history?afterSeq=1&limit=1`, headers));
    expect(page.events.map((e) => e.seq)).toEqual([2]);

    const tail = history(await get(`/v1/tickets/${ticketId}/history?afterSeq=2`, headers));
    expect(tail.events.map((e) => e.seq)).toEqual([3, 4]);
  });

  it('an afterSeq past the end is an empty page, not a refusal and not a 404', async () => {
    const { headers, ticketId } = await pagedTicket();
    const res = await get(`/v1/tickets/${ticketId}/history?afterSeq=4`, headers);
    expect(res.statusCode).toBe(200);
    expect(history(res)).toEqual({ ticketId, events: [] });

    // The control: the same ticket, the same route, a cursor that is NOT past
    // the end. Without it the empty page above is what a route that returned
    // nothing at all would also produce.
    const before = await get(`/v1/tickets/${ticketId}/history?afterSeq=3`, headers);
    expect(history(before).events.map((e) => e.seq)).toEqual([4]);
  });

  it('an enormous limit is answered rather than refused', async () => {
    // What is observable here is that the clamp does not turn into a 400 and
    // does not truncate a short history. The clamped VALUE is unobservable over
    // HTTP at any ledger size this suite can build — it is asserted on
    // parsePaging below.
    const { headers, ticketId } = await pagedTicket();
    const res = await get(`/v1/tickets/${ticketId}/history?limit=999999`, headers);
    expect(res.statusCode).toBe(200);
    expect(history(res).events.map((e) => e.seq)).toEqual([1, 2, 3, 4]);
  });

  it('refuses junk, a negative, a zero limit, a repeated parameter and an afterSeq no bigint can hold', async () => {
    const { headers, ticketId } = await pagedTicket();
    // The control: the same viewer, the same ticket, valid paging. It is what
    // stops "400s everything" from passing this test.
    expect((await get(`/v1/tickets/${ticketId}/history?afterSeq=0`, headers)).statusCode).toBe(200);

    for (const query of [
      'afterSeq=banana',
      'afterSeq=-1',
      'afterSeq=1.5',
      // `^\d+$` accepts this; `seq` is bigint and Postgres raises `value out of
      // range for type bigint`, which is a 500 from a query string. The upper
      // bound in parsePaging is what makes it a 400. Mutation: delete that
      // bound and this line reports 500.
      'afterSeq=99999999999999999999',
      'limit=0',
      'limit=-1',
      'limit=two',
      // Fastify parses a repeated parameter into an ARRAY. `app.ts` records
      // that the events door earned a real defect on exactly this
      // scalar-versus-array shape.
      'limit=1&limit=2',
    ]) {
      const res = await get(`/v1/tickets/${ticketId}/history?${query}`, headers);
      expect([query, res.statusCode]).toEqual([query, 400]);
      expect([query, res.json()]).toEqual([query, BAD_PAGING_BODY]);
    }
  });

  it('refuses malformed paging identically for a ticket that does not exist, so the 400 is no oracle either', async () => {
    const { headers, ticketId } = await pagedTicket();
    const onMine = await get(`/v1/tickets/${ticketId}/history?limit=0`, headers);
    const onGhost = await get(`/v1/tickets/${newUlid()}/history?limit=0`, headers);
    expect(onMine.statusCode).toBe(400);
    expect(onGhost.statusCode).toBe(400);
    expect(onMine.json()).toEqual(onGhost.json());
    expect(comparableHeaders(onMine)).toEqual(comparableHeaders(onGhost));
  });
});

describe('parsePaging — the bounds HTTP cannot see', () => {
  it('defaults to the whole history from the start', () => {
    expect(parsePaging({})).toEqual({ afterSeq: 0, limit: DEFAULT_LIMIT });
  });

  it('clamps an over-large limit to MAX_LIMIT rather than passing it through', () => {
    // The VALUE, not merely the absence of a throw. Mutation: delete the
    // `Math.min` and this reports 999999.
    expect(parsePaging({ limit: '999999' })).toEqual({ afterSeq: 0, limit: MAX_LIMIT });
    // A digit string long enough to overflow to Infinity clamps too, so nothing
    // non-finite ever reaches the query as a parameter.
    expect(parsePaging({ limit: '9'.repeat(400) })).toEqual({ afterSeq: 0, limit: MAX_LIMIT });
    // The control: a limit UNDER the cap is passed through untouched, so the
    // assertion above cannot pass by the function returning MAX_LIMIT always.
    expect(parsePaging({ limit: '7' })).toEqual({ afterSeq: 0, limit: 7 });
  });

  it('accepts a cursor up to MAX_SAFE_INTEGER and refuses the next one', () => {
    expect(parsePaging({ afterSeq: String(Number.MAX_SAFE_INTEGER) })).toEqual({
      afterSeq: Number.MAX_SAFE_INTEGER,
      limit: DEFAULT_LIMIT,
    });
    expect(parsePaging({ afterSeq: String(Number.MAX_SAFE_INTEGER + 1) })).toBeNull();
  });

  it('refuses everything that is not a whole number, including the shapes a query string can produce', () => {
    expect(parsePaging({ afterSeq: 'banana' })).toBeNull();
    expect(parsePaging({ afterSeq: '-1' })).toBeNull();
    expect(parsePaging({ afterSeq: '1.5' })).toBeNull();
    expect(parsePaging({ afterSeq: '' })).toBeNull();
    expect(parsePaging({ afterSeq: ' 1' })).toBeNull();
    expect(parsePaging({ afterSeq: '0x10' })).toBeNull();
    expect(parsePaging({ afterSeq: '1e3' })).toBeNull();
    expect(parsePaging({ limit: '0' })).toBeNull();
    expect(parsePaging({ limit: '-5' })).toBeNull();
    // A repeated parameter, and a parameter with no value at all.
    expect(parsePaging({ limit: ['1', '2'] })).toBeNull();
    expect(parsePaging({ limit: true })).toBeNull();
  });
});
