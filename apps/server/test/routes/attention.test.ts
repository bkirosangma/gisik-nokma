import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import {
  istDayOf,
  newUlid,
  type AttentionItem,
  type AttentionResponse,
  type LedgerEvent,
} from '@gisik-nokma/domain';
import { UNAUTHENTICATED_BODY } from '../../src/auth/require-session.js';
import { READ_NOT_FOUND_BODY, requireMember } from '../../src/read/membership.js';
import { readAttention } from '../../src/routes/attention.js';
import { applyCommitted, makeCommitted } from '../helpers/apply.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { buildReadTestApp, type ReadRole, type ReadWorld } from '../helpers/read-app.js';
import { SCENARIO_NOW } from '../helpers/read-scenario.js';

/**
 * Plan 5 Task 12 — `GET /v1/workspaces/:workspaceId/attention`, the strip that
 * is COMPUTED and never stored.
 *
 * ## What is different about this one, stated before anything is asserted
 *
 * Every read before it answered a question about stored rows: which cards are in
 * this container, which match these words, which are assigned to me. This one
 * answers a question about stored rows AND THE CLOCK — "what needs attention
 * now" — and the answer changes while nothing in the database changes. Three
 * consequences shape this file:
 *
 * 1. **Nothing is materialised, so `generatedAt` is the only honest thing to
 *    return.** A stored strip would freeze a judgment that expires. The route
 *    takes its `now` from an injected clock (`read-app.ts` pins it to
 *    `SCENARIO_NOW`), so every case below reads one fixed instant — and 7.42
 *    calls `readAttention` DIRECTLY at two instants a millisecond apart to read
 *    the same world on two different Indian dates.
 * 2. **Every window and every day count is an INDIAN day** (owner decision
 *    2026-08-20, "time is Asia/Kolkata"). That is not a formatting preference:
 *    an event at 18:31Z is already TOMORROW in India while the UTC page still
 *    reads yesterday, so "stale for 7 days" and "due within 7 days" have
 *    different answers depending on which calendar the code asks. 7.42 plants a
 *    fixture on each side of 18:30Z, in both directions — the instant an event
 *    happened, and the instant the strip is READ.
 * 3. **The thresholds are CLAIMS, not constants.** `getWorkspaceSettings`
 *    answers `provenance: null` for a workspace nobody has configured and the
 *    defaults are in force; a `workspace.settings_set` claim replaces both the
 *    numbers and the null. 7.114 keeps those two facts apart — "the default is
 *    7" and "somebody chose 7" are different sentences and this response says
 *    which one it means, because `AttentionResponse.settings` is the whole
 *    `WorkspaceSettings` including its provenance.
 *
 * ## TZ, and why a zone test here is not decoration
 *
 * Both machines this repo is developed on are Asia/Kolkata, so a day-arithmetic
 * test that never varies the zone cannot tell "the code computes IST" from "the
 * machine was already in IST". 7.117 varies it across three zones and asserts
 * the answer does NOT move — preceded by a probe proving the harness can move
 * the ambient zone at all, without which the case could not fail. (vitest 3
 * defaults to the `forks` pool and `vitest.config.ts` sets none, so
 * `process.env.TZ` is live here; under `--pool=threads` it would be inert and
 * this case would be vacuous.) The Postgres session is pinned to Asia/Kolkata by
 * `createTestDatabase`, which is fine: every day computation in this route
 * happens in Node, over absolute instants, and no SQL here does date math.
 *
 * ## A count is a disclosure — what this response counts
 *
 * The strip emits no count FIELDS. What a client renders as "3 blocked" is the
 * length of a bucket, and every item in every bucket came through
 * `visibleTicketsWhere`, so a bucket length counts only tickets this viewer may
 * see. 7.30 is the executed proof: the planted hidden ticket has a due date
 * inside the window and does not appear in — or lengthen — the member's answer,
 * while the owner IS warned about it. (Each item's `card.rollup` does carry
 * `totalChildren`/`terminalChildren`, true counts over children the viewer may
 * not see. That over-disclosure is the spec's own decision, documented at
 * `TicketRollup`, and is inherited here rather than introduced.)
 *
 * ## The three door answers, and which case pins each
 *
 * - **401** `{error:'unauthenticated'}` — no session, and a FORGED bearer alike
 *   (7.118), with the same URL answering 200 once a real session is attached.
 * - **404** — a caller outside the workspace, the owner of a NEIGHBOUR
 *   workspace, and a nonexistent workspace id, byte-identical down to
 *   `content-length` against the frozen `READ_NOT_FOUND_BODY` (7.119).
 * - **200 with an empty result** — `outsider`, a workspace MEMBER who is on no
 *   project and named in no explicit list (7.120). The emptiness is the
 *   visibility predicate answering, not the door, which is why that case reads
 *   the blocked / stale / due rows back out of `proj_tickets` first and holds
 *   the member's non-empty answer beside it. The same case gives the `guest` a
 *   due date of their own, so the guest's answer is their slice rather than a
 *   blanket empty.
 *
 * ## Fixtures, and why the shared world is not enough
 *
 * `read-app.ts` is the world Tasks 8–15 share and it is EXTENDED here, never
 * re-seeded. What it does not contain is the shape of what this task cannot
 * otherwise catch, so this file adds, in `beforeAll`:
 *
 * - a TERMINAL ticket with a due date inside the window (7.115) — without it,
 *   deleting the terminal guard changes no answer;
 * - a ticket whose due date was CLEARED (7.116) — `never-claimed` and `cleared`
 *   are different facts and only one of them is somebody's act;
 * - an OVERDUE ticket (7.28) — a missed date is not less urgent, and it doubles
 *   as the positive control in every case whose other buckets go empty;
 * - the two IST-boundary tickets, one entered at 18:35Z and one at 18:31Z
 *   (7.42);
 * - a ticket due 2026-08-23, which is inside a 2-day window on 2026-08-21 IST
 *   and outside it on 2026-08-20 (7.42's second half);
 * - a ticket explicitly shared with the `guest` (7.120);
 * - and the sibling project's chore ticket moved into `wf-second`'s `waiting`
 *   state, which is `active` and NOT blocked while `wf-errands`'s `waiting` IS
 *   (7.121). Two tickets then sit in a state id spelled the same way, one
 *   flagged and one not, so `blocked.has(card.stateId)` — the composite key
 *   dropped to a bare one — has somewhere to be caught.
 *
 * ## Ordering, and what is deliberately NOT asserted
 *
 * `newUlid()` is not monotonic inside a millisecond, so the shared world's ids
 * do not sort in mint order. This file's own fixtures use hand-built ids that
 * sort in Postgres exactly as they sort here, but the two families interleave,
 * so every bucket is asserted as a SORTED array on both sides. That means this
 * file constrains bucket MEMBERSHIP and not `ORDER BY t.ticket_id`; the ordering
 * of a visible-ticket read is owned by `list.test.ts` and `my-work.test.ts`,
 * which seed for it. Recorded rather than left to look covered.
 *
 * ## Settings are a workspace-wide mutable, so every case claims its own
 *
 * `workspace.settings_set` is last-writer-wins per workspace and this file holds
 * one database with one seed — there is no per-test truncation to undo a claim.
 * So every threshold-sensitive case emits its OWN claim naming both knobs before
 * it reads. The single exception is 7.28, which must run before any claim exists
 * at all (that is the `provenance: null` cell), and it is therefore declared
 * FIRST and is the one order-coupled case in the file. vitest runs a file's
 * cases in declaration order.
 */

type InjectResponse = Awaited<ReturnType<FastifyInstance['inject']>>;

let db: TestDatabase;
let read: ReadWorld;
let fx: AttentionFixtures;

beforeAll(async () => {
  db = await createTestDatabase();
  read = await buildReadTestApp(db);
  fx = await seedAttentionFixtures(db.pool, read);
}, 120_000);

afterAll(async () => {
  await read.app.close();
  await db.drop();
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/**
 * Crockford base32 — the ULID alphabet, `I`, `L`, `O` and `U` absent — in
 * ascending byte order, so a suffix built from it sorts in Postgres exactly as
 * it sorts in JavaScript.
 */
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/**
 * A hand-built ticket id ordered by `index`, valid against `ULID_REGEX`
 * (`^[0-7][0-9A-HJKMNP-TV-Z]{25}$`). The prefix is `0AT` so these cannot be
 * mistaken for the seeded world's minted ids, `my-work.test.ts`'s `0MW` ones or
 * `search.test.ts`'s `0SR` ones.
 */
function attentionTicketId(index: number): string {
  const suffix = `${CROCKFORD[Math.floor(index / CROCKFORD.length)]}${CROCKFORD[index % CROCKFORD.length]}`;
  return `0AT${'0'.repeat(21)}${suffix}`;
}

type AttentionFixtures = {
  /** Due 2026-08-21 — inside every window used here — and then moved to `done`. */
  terminalDueId: string;
  /** Due 2026-08-10, ten days PAST. Open. The overdue cell, and the control everywhere. */
  overdueId: string;
  /** Due 2026-08-21, then CLEARED by an attributed `ticket.field_set` with `value: null`. */
  clearedDueId: string;
  /** Entered `doing` at 2026-08-12T18:35:00Z — 00:05 IST on the 13th, SEVEN Indian days back. */
  istStale7Id: string;
  /** Entered `doing` at 2026-08-13T18:31:00Z — 00:01 IST on the 14th, SIX Indian days back. */
  istFresh6Id: string;
  /** Due 2026-08-23: outside a 2-day window on IST 2026-08-20, inside it on the 21st. */
  dueOn23Id: string;
  /** Explicit `[owner, guest]`, due 2026-08-21 — the guest's own slice of the strip. */
  guestDueId: string;
  /**
   * Entered `doing` at 2026-08-13T18:30:00.000Z — IST midnight EXACTLY, the
   * instant the half-open window's upper bound is. Six Indian days back.
   *
   * It exists because the boundary is half-open and nothing else in this file
   * sits ON it: MEASURED, relaxing `>= staleCutoffUtc` to `> staleCutoffUtc`
   * passed all twelve cases before this fixture, because an exact-midnight entry
   * is the only input the two comparisons disagree about. The endpoint belongs
   * to the NEXT day (`istDayBounds`: `endUtc` is not part of the day), so this
   * ticket is six days old and not stale at seven.
   */
  istMidnightId: string;
  /**
   * Entered `doing` at 2026-08-13T14:00:00.000Z — 19:30 IST on the 13th, SEVEN
   * Indian days before 2026-08-20.
   *
   * It exists to separate a COUNT OF DAYS from a count of 24-hour spans. Only
   * 6 days and 22 hours of elapsed time separate that instant from
   * `SCENARIO_NOW`, so `(now - entered) / 86_400_000` floors to SIX while the
   * calendar says seven — and it is seven that "in flight for a week" means to
   * the person reading the strip. MEASURED: with `daysInFlight` computed as that
   * quotient, all twelve cases passed before this fixture existed, because every
   * other entry here happens EARLIER in the Indian day than the reading instant,
   * where the two agree. The same instant also decides MEMBERSHIP: the quotient
   * calls it 6.92 days and leaves it out of a 7-day window the IST comparison
   * puts it in.
   */
  istEveningId: string;
  /**
   * A ticket in the NEIGHBOUR workspace, due 2026-08-21 — inside every window
   * this file uses.
   *
   * `visibleTicketsWhere` compiles to `TRUE` for an owner and carries no tenancy
   * clause of its own (it says so), so `t.workspace_id = $n` is the ENTIRE
   * boundary between this workspace's owner and every qualifying ticket
   * anywhere. MEASURED: deleting that clause passed all twelve cases before this
   * fixture existed, because the neighbour's only ticket was open, undated and
   * freshly created — it qualified for no bucket, so there was nothing for the
   * missing clause to leak.
   */
  neighbourDueId: string;
  /**
   * A ticket in the sibling project's second workflow, in a state that is
   * `open` AND flagged blocked (`wf-second` v2 flags `todo`).
   *
   * The blocked bucket is about the FLAG and not about the category — a state
   * somebody marked "waiting on somebody else" deserves the strip whether or not
   * work is nominally under way in it. Every other blocked fixture in the suite
   * is `active`, so narrowing the bucket to `stateCategory === 'active'` changed
   * no answer before this existed.
   */
  openBlockedId: string;
};

async function seedAttentionFixtures(pool: Pool, world: ReadWorld): Promise<AttentionFixtures> {
  const { workspaceId, projectId, owner, member, guest } = world.world;
  const ws = { workspaceId, actorId: owner };

  const terminalDueId = attentionTicketId(0);
  const overdueId = attentionTicketId(1);
  const clearedDueId = attentionTicketId(2);
  const istStale7Id = attentionTicketId(3);
  const istFresh6Id = attentionTicketId(4);
  const dueOn23Id = attentionTicketId(5);
  const guestDueId = attentionTicketId(6);
  const istMidnightId = attentionTicketId(7);
  const istEveningId = attentionTicketId(8);
  const neighbourDueId = attentionTicketId(9);
  const openBlockedId = attentionTicketId(10);

  const created = (id: string, title: string): LedgerEvent =>
    makeCommitted({
      ...ws,
      entity: { kind: 'ticket', id },
      type: 'ticket.created',
      payload: { typeId: 'task', projectId, parentId: null, title },
    });

  const due = (id: string, date: string): LedgerEvent =>
    makeCommitted({
      ...ws,
      actorId: member,
      entity: { kind: 'ticket', id },
      type: 'ticket.field_set',
      payload: { fieldId: 'dueDate', value: { date } },
    });

  const events: LedgerEvent[] = [
    created(terminalDueId, 'Deposit the cheque'),
    due(terminalDueId, '2026-08-21'),
    makeCommitted({
      ...ws,
      entity: { kind: 'ticket', id: terminalDueId },
      type: 'ticket.transitioned',
      payload: { to: 'done' },
    }),

    created(overdueId, 'Renew the fire certificate'),
    due(overdueId, '2026-08-10'),

    created(clearedDueId, 'Re-paint the shutter'),
    due(clearedDueId, '2026-08-21'),
    // The CLEARING: an attributed act, not an absence. `value: null` is what
    // `ticket.field_set` carries when somebody removes a date, and
    // `dueDateOf` turns it into `{ state: 'cleared' }` rather than into the
    // same value a ticket nobody ever dated gets.
    makeCommitted({
      ...ws,
      actorId: member,
      entity: { kind: 'ticket', id: clearedDueId },
      type: 'ticket.field_set',
      payload: { fieldId: 'dueDate', value: null },
    }),

    created(istStale7Id, 'Chase the water board'),
    // 18:35Z on the 12th is 00:05 IST on the 13th. Seven Indian days before
    // 2026-08-20, so STALE at a 7-day threshold. Naive UTC math reads the day
    // as 2026-08-12 and calls it eight.
    makeCommitted({
      ...ws,
      actorId: member,
      clientTime: '2026-08-12T18:35:00.000Z',
      serverTime: '2026-08-12T18:35:00.000Z',
      entity: { kind: 'ticket', id: istStale7Id },
      type: 'ticket.transitioned',
      payload: { to: 'doing' },
    }),

    created(istFresh6Id, 'Order the till rolls'),
    // 18:31Z on the 13th is 00:01 IST on the 14th. SIX Indian days back, inside
    // the window, so NOT stale. Naive UTC math reads 2026-08-13, counts seven,
    // and wrongly alarms.
    makeCommitted({
      ...ws,
      actorId: member,
      clientTime: '2026-08-13T18:31:00.000Z',
      serverTime: '2026-08-13T18:31:00.000Z',
      entity: { kind: 'ticket', id: istFresh6Id },
      type: 'ticket.transitioned',
      payload: { to: 'doing' },
    }),

    created(dueOn23Id, 'Book the accountant'),
    due(dueOn23Id, '2026-08-23'),

    created(guestDueId, 'Return the crate deposit'),
    due(guestDueId, '2026-08-21'),
    makeCommitted({
      ...ws,
      entity: { kind: 'ticket', id: guestDueId },
      type: 'visibility.set',
      payload: { ticketId: guestDueId, mode: 'explicit', userIds: [owner, guest] },
    }),

    created(istMidnightId, 'Collect the weighing scale'),
    // EXACTLY IST midnight. `istDayBounds('2026-08-13').endUtc` is this instant
    // and the day does NOT contain it, so this entry belongs to 2026-08-14 —
    // six Indian days back, inside a 7-day window. The half-open comparison is
    // the only thing that says so.
    makeCommitted({
      ...ws,
      actorId: member,
      clientTime: '2026-08-13T18:30:00.000Z',
      serverTime: '2026-08-13T18:30:00.000Z',
      entity: { kind: 'ticket', id: istMidnightId },
      type: 'ticket.transitioned',
      payload: { to: 'doing' },
    }),

    created(istEveningId, 'Balance the evening float'),
    // 19:30 IST on the 13th: seven Indian days back, but only 6 days 22 hours of
    // elapsed time. A millisecond quotient floors that to six.
    makeCommitted({
      ...ws,
      actorId: member,
      clientTime: '2026-08-13T14:00:00.000Z',
      serverTime: '2026-08-13T14:00:00.000Z',
      entity: { kind: 'ticket', id: istEveningId },
      type: 'ticket.transitioned',
      payload: { to: 'doing' },
    }),

    // `wf-second` v2: the SAME three states, with `todo` — an OPEN state — now
    // carrying amendment 9's blocked flag. `waiting` stays unflagged here, so
    // 7.121's composite-key fixture is untouched.
    makeCommitted({
      ...ws,
      entity: { kind: 'workflow', id: world.sibling.secondWorkflowId },
      type: 'workflow.defined',
      payload: {
        id: world.sibling.secondWorkflowId,
        version: 2,
        name: 'Second flow',
        initialStateId: 'todo',
        states: [
          { id: 'todo', name: 'Queued', category: 'open', blocked: true },
          { id: 'waiting', name: 'Parked', category: 'active' },
          { id: 'done', name: 'Filed', category: 'terminal' },
        ],
        transitions: [
          { from: '*', to: 'todo', rules: [] },
          { from: '*', to: 'waiting', rules: [] },
          { from: '*', to: 'done', rules: [] },
        ],
      },
    }),
    makeCommitted({
      ...ws,
      entity: { kind: 'ticket', id: openBlockedId },
      type: 'ticket.created',
      payload: {
        typeId: 'chore',
        projectId: world.sibling.projectId,
        parentId: null,
        title: 'Waiting on the landlord',
      },
    }),

    // The sibling project's chore ticket, into `wf-second`'s `waiting` — an
    // `active` state that is NOT flagged blocked, spelled with the same state id
    // as `wf-errands`'s `waiting`, which IS. See 7.121.
    makeCommitted({
      ...ws,
      entity: { kind: 'ticket', id: world.sibling.choreTicketId },
      type: 'ticket.transitioned',
      payload: { to: 'waiting' },
    }),
  ];
  await applyCommitted(pool, events);

  // NEXT DOOR: a ticket that would qualify for due-soon, in a workspace this
  // workspace's owner is no member of. Seeded through the neighbour's own owner
  // so the ledger is one a real tenancy could have produced.
  await applyCommitted(pool, [
    makeCommitted({
      workspaceId: world.neighbour.workspaceId,
      actorId: world.userIds.neighbour,
      entity: { kind: 'ticket', id: neighbourDueId },
      type: 'ticket.created',
      payload: {
        typeId: 'nb-task',
        projectId: world.neighbour.projectId,
        parentId: null,
        title: 'Next Door: pay the electricity bill',
      },
    }),
    makeCommitted({
      workspaceId: world.neighbour.workspaceId,
      actorId: world.userIds.neighbour,
      entity: { kind: 'ticket', id: neighbourDueId },
      type: 'ticket.field_set',
      payload: { fieldId: 'dueDate', value: { date: '2026-08-21' } },
    }),
  ]);

  return {
    terminalDueId,
    overdueId,
    clearedDueId,
    istStale7Id,
    istFresh6Id,
    dueOn23Id,
    guestDueId,
    istMidnightId,
    istEveningId,
    neighbourDueId,
    openBlockedId,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function attentionUrl(workspaceId: string): string {
  return `/v1/workspaces/${workspaceId}/attention`;
}

async function attention(role: ReadRole, workspaceId?: string): Promise<InjectResponse> {
  return read.app.inject({
    method: 'GET',
    url: attentionUrl(workspaceId ?? read.world.workspaceId),
    headers: read.authOf(role),
  });
}

async function strip(role: ReadRole): Promise<AttentionResponse> {
  const response = await attention(role);
  expect(response.statusCode).toBe(200);
  return response.json() as AttentionResponse;
}

/** The ticket ids in one bucket, SORTED — see the ordering note in the header. */
function idsOf(response: AttentionResponse, kind: AttentionItem['kind']): string[] {
  return response.items
    .filter((item) => item.kind === kind)
    .map((item) => item.card.ticketId)
    .sort();
}

/**
 * The one item of a kind, narrowed. It THROWS when the bucket is empty rather
 * than handing back `undefined` for a later `?.` to swallow: a `toMatchObject`
 * against `undefined` is an assertion that cannot fail the way it reads.
 */
function onlyOfKind<K extends AttentionItem['kind']>(
  response: AttentionResponse,
  kind: K,
  ticketId: string,
): Extract<AttentionItem, { kind: K }> {
  const found = response.items.filter(
    (item) => item.kind === kind && item.card.ticketId === ticketId,
  );
  if (found.length !== 1) {
    throw new Error(
      `expected exactly one '${kind}' item for ${ticketId}, found ${found.length} in [${idsOf(response, kind).join(', ')}]`,
    );
  }
  return found[0] as Extract<AttentionItem, { kind: K }>;
}

/**
 * Claims both thresholds, as the owner. Every case after 7.28 calls this, because
 * a settings claim persists for the rest of the file — see the header.
 */
async function claimSettings(staleDays: number, dueSoonDays: number): Promise<LedgerEvent> {
  const event = makeCommitted({
    workspaceId: read.world.workspaceId,
    actorId: read.world.owner,
    entity: { kind: 'workspace', id: read.world.workspaceId },
    type: 'workspace.settings_set',
    payload: { staleDays, dueSoonDays },
  });
  await applyCommitted(db.pool, [event]);
  return event;
}

/** Reads the strip straight from the computation, at an instant of our choosing. */
async function readAt(role: ReadRole, at: string): Promise<AttentionResponse> {
  const viewerId = read.userIds[role];
  const eff = await requireMember(db.pool, viewerId, read.world.workspaceId);
  expect(eff).not.toBeNull();
  return readAttention(db.pool, eff!, viewerId, read.world.workspaceId, new Date(at));
}

/**
 * Everything a zone could plausibly move, in one comparable value: bucket
 * membership, the day counts, and the prose that names days out loud.
 */
function zoneSensitiveShape(response: AttentionResponse): unknown {
  return {
    generatedAt: response.generatedAt,
    settings: response.settings,
    items: response.items.map((item) => ({
      kind: item.kind,
      ticketId: item.card.ticketId,
      reason: item.reason,
      ...(item.kind === 'stale'
        ? { enteredStateAt: item.enteredStateAt, daysInFlight: item.daysInFlight }
        : {}),
      ...(item.kind === 'due-soon' ? { date: item.due.date } : {}),
    })),
  };
}

/** Runs `body` with the ambient zone set to `zone`, restoring it afterwards. */
async function underZone<T>(zone: string, body: () => Promise<T>): Promise<T> {
  const original = process.env['TZ'];
  try {
    process.env['TZ'] = zone;
    return await body();
  } finally {
    if (original === undefined) delete process.env['TZ'];
    else process.env['TZ'] = original;
  }
}

/**
 * `content-length` above all must match: a length that differed would itself be
 * the oracle even if both bodies parsed to the same object.
 */
function comparableHeaders(response: InjectResponse): Record<string, unknown> {
  const { date: _date, ...rest } = response.headers;
  return rest;
}

// ---------------------------------------------------------------------------

describe('GET /v1/workspaces/:workspaceId/attention — computed, never stored', () => {
  it('7.28 computes blocked, stale and due-soon at the injected clock, under the DEFAULTS nobody claimed', async () => {
    // DECLARED FIRST ON PURPOSE: no `workspace.settings_set` exists yet, so this
    // is the only place `provenance: null` — "the defaults are in force because
    // nobody has chosen" — can be observed. Every later case makes a claim.
    const response = await strip('member');

    expect(response.workspaceId).toBe(read.world.workspaceId);
    expect(response.generatedAt).toBe(SCENARIO_NOW.toISOString());
    expect(response.settings).toEqual({ staleDays: 7, dueSoonDays: 7, provenance: null });

    // blocked — `sharedTask` sits in `wf-errands`'s blocked-flagged `waiting`.
    // No clock is involved in this bucket at all.
    expect(idsOf(response, 'blocked')).toEqual([read.world.sharedTaskId, fx.openBlockedId].sort());
    const blocked = onlyOfKind(response, 'blocked', read.world.sharedTaskId);
    expect(blocked.stateName).toBe('Waiting on counterparty');
    expect(blocked.reason).toBe('In "Waiting on counterparty" — a blocked state.');

    // stale — 19 Indian days for the seeded child, 7 for the IST fixture. The
    // 6-day one is inside the window and is NOT here; 7.42 is where that pair
    // is the point rather than a by-product.
    expect(idsOf(response, 'stale')).toEqual(
      [read.world.taskInEpicId, fx.istStale7Id, fx.istEveningId].sort(),
    );
    const stale = onlyOfKind(response, 'stale', read.world.taskInEpicId);
    expect(stale.enteredStateAt).toBe('2026-08-01T09:00:05.000Z');
    expect(stale.daysInFlight).toBe(19);
    expect(stale.thresholdDays).toBe(7);
    expect(stale.reason).toBe(
      'In an active state since 2026-08-01 — past the 7-day staleness threshold.',
    );

    // due-soon — the claim due 2026-08-25 (inside 7 days of 2026-08-20), the
    // OVERDUE one from the 10th, and the one due on the 23rd. The terminal
    // ticket's date and the cleared one are both inside the window too and
    // neither is here (7.115, 7.116).
    expect(idsOf(response, 'due-soon')).toEqual(
      [read.world.taskInEpicId, fx.overdueId, fx.dueOn23Id].sort(),
    );
    const soon = onlyOfKind(response, 'due-soon', read.world.taskInEpicId);
    expect(soon.windowDays).toBe(7);
    expect(soon.reason).toBe('Needed by 2026-08-25 — due within 7 days.');
    // The item carries the CLAIM — the date, who claimed it, and both clocks —
    // rather than a bare date. The server clock is asserted against what the
    // projection actually stored, so a route that invented one would be caught
    // rather than agreed with.
    const { rows } = await db.pool.query<{ claim: { serverTime: string } }>(
      `SELECT fields -> 'dueDate' AS claim FROM proj_tickets WHERE ticket_id = $1`,
      [read.world.taskInEpicId],
    );
    expect(soon.due).toEqual({
      date: '2026-08-25',
      actorId: read.world.member,
      clientTime: '2026-08-19T18:30:00.000Z',
      serverTime: rows[0]!.claim.serverTime,
    });

    // The buckets arrive in the documented order: every blocked item, then every
    // stale one, then every due-soon one.
    expect(response.items.map((item) => item.kind)).toEqual([
      'blocked',
      'blocked',
      'stale',
      'stale',
      'stale',
      'due-soon',
      'due-soon',
      'due-soon',
    ]);
  });

  it('7.114 a never-claimed threshold is not a claimed default — the response says which it is', async () => {
    // Before: no claim exists, so the numbers are defaults and there is nobody
    // to attribute them to.
    const before = await strip('member');
    expect(before.settings).toEqual({ staleDays: 7, dueSoonDays: 7, provenance: null });

    const claim = await claimSettings(30, 2);

    // After: the SAME two numbers would be indistinguishable from the defaults
    // if provenance were dropped, which is why they are deliberately different
    // here AND why the actor and both clocks are asserted. A route that
    // hardcoded `provenance: null` passes the assertion above and dies here.
    const after = await strip('member');
    expect(after.settings).toEqual({
      staleDays: 30,
      dueSoonDays: 2,
      provenance: {
        actorId: read.world.owner,
        clientTime: claim.clientTime,
        serverTime: claim.serverTime,
      },
    });
  });

  it('7.29 PLANTED DEFECT: a settings claim flips staleness and due-window membership — the thresholds are read from the ledger, not from constants', async () => {
    await claimSettings(30, 2);
    const response = await strip('member');
    expect(response.settings).toMatchObject({ staleDays: 30, dueSoonDays: 2 });

    // Nothing is 30 Indian days old: 19 and 7 both fall inside the window now.
    expect(idsOf(response, 'stale')).toEqual([]);
    // The 2-day horizon is 2026-08-22, so the 25th and the 23rd drop out and the
    // OVERDUE one stays — the positive control that keeps the empty stale bucket
    // above from passing on a route that simply answered nothing.
    expect(idsOf(response, 'due-soon')).toEqual([fx.overdueId]);
    // And blocked ignores both knobs: it is a flag on a state, not a window.
    expect(idsOf(response, 'blocked')).toEqual([read.world.sharedTaskId, fx.openBlockedId].sort());
  });

  it('7.30 PLANTED DEFECT: the hidden ticket is due tomorrow and never surfaces for the member, while the owner is warned', async () => {
    await claimSettings(7, 7);

    const member = await attention('member');
    expect(member.statusCode).toBe(200);
    // Not the id, not a snippet of it, nowhere in the bytes.
    expect(member.body).not.toContain(read.world.hiddenTaskId);
    // The positive controls, in the same body: the tickets the member IS warned
    // about. Without these, a route answering `{items: []}` would pass the line
    // above and prove nothing.
    expect(member.body).toContain(read.world.taskInEpicId);
    expect(member.body).toContain(fx.overdueId);

    const memberStrip = member.json() as AttentionResponse;
    expect(idsOf(memberStrip, 'due-soon')).toEqual(
      [read.world.taskInEpicId, fx.overdueId, fx.dueOn23Id].sort(),
    );

    // The same instant, the same window, the owner: the hidden ticket's date is
    // real and inside it. So the member's answer is the visibility predicate
    // filtering, not the date failing to qualify — and the member's bucket
    // LENGTH does not count a ticket they cannot see.
    const owner = await strip('owner');
    expect(idsOf(owner, 'due-soon')).toEqual(
      [
        read.world.taskInEpicId,
        read.world.hiddenTaskId,
        fx.overdueId,
        fx.dueOn23Id,
        fx.guestDueId,
      ].sort(),
    );
    const hidden = onlyOfKind(owner, 'due-soon', read.world.hiddenTaskId);
    expect(hidden.due.date).toBe('2026-08-21');
  });

  it('7.115 a terminal ticket is in neither window — done work needs no urgency', async () => {
    await claimSettings(7, 7);
    const response = await strip('member');

    expect(idsOf(response, 'due-soon')).not.toContain(fx.terminalDueId);
    expect(idsOf(response, 'stale')).not.toContain(fx.terminalDueId);
    // The positive control that the absence means "terminal", not "no date":
    // the row IS terminal and it DOES carry a due-date claim inside the window,
    // read straight back out of the projection.
    const { rows } = await db.pool.query<{
      state_category: string;
      claim: { value: { date: string } | null } | null;
    }>(
      `SELECT state_category, fields -> 'dueDate' AS claim FROM proj_tickets WHERE ticket_id = $1`,
      [fx.terminalDueId],
    );
    expect(rows[0]!.state_category).toBe('terminal');
    expect(rows[0]!.claim?.value?.date).toBe('2026-08-21');
    // …and a ticket whose date is FURTHER away is in the answer, so the window
    // itself is open for business.
    expect(idsOf(response, 'due-soon')).toContain(fx.dueOn23Id);
  });

  it('7.116 a CLEARED due date is not a due date — the clearing is an act, and it is not the same as never having one', async () => {
    await claimSettings(7, 7);
    const response = await strip('member');

    expect(idsOf(response, 'due-soon')).not.toContain(fx.clearedDueId);
    // The positive control: the claim EXISTS and its value is a null somebody
    // wrote. A ticket that never had a date would have no key at all, and the
    // route would be excluding it for a completely different reason.
    const { rows } = await db.pool.query<{ claim: { value: unknown; actorId: string } | null }>(
      `SELECT fields -> 'dueDate' AS claim FROM proj_tickets WHERE ticket_id = $1`,
      [fx.clearedDueId],
    );
    expect(rows[0]!.claim).not.toBeNull();
    expect(rows[0]!.claim!.value).toBeNull();
    expect(rows[0]!.claim!.actorId).toBe(read.world.member);
    // And the twin that kept its date, seeded the same way, IS in the bucket.
    expect(idsOf(response, 'due-soon')).toContain(fx.overdueId);
  });

  it('7.121 the blocked flag is keyed by WORKFLOW and state — two tickets in a state id spelled the same way, one flagged and one not', async () => {
    await claimSettings(7, 7);
    const response = await strip('member');

    const { rows } = await db.pool.query<{
      ticket_id: string;
      workflow_id: string;
      state_id: string;
      state_category: string;
    }>(
      `SELECT ticket_id, workflow_id, state_id, state_category FROM proj_tickets
        WHERE ticket_id = ANY ($1::text[]) ORDER BY ticket_id`,
      [[read.world.sharedTaskId, read.sibling.choreTicketId].sort()],
    );
    // Same state id, different workflows — that is the whole fixture.
    expect(rows.map((r) => r.state_id)).toEqual(['waiting', 'waiting']);
    expect(new Set(rows.map((r) => r.workflow_id))).toEqual(
      new Set([read.world.workflowId, read.sibling.secondWorkflowId]),
    );
    // Both are `active`, so the difference cannot be the category either.
    expect(rows.map((r) => r.state_category)).toEqual(['active', 'active']);

    // Only the one whose OWN workflow flagged the state is blocked. The other
    // blocked item is `openBlockedId`, which sits in `wf-second`'s `todo` — a
    // different state id entirely, and there on its own workflow's say-so.
    expect(idsOf(response, 'blocked')).toEqual([read.world.sharedTaskId, fx.openBlockedId].sort());
    expect(idsOf(response, 'blocked')).not.toContain(read.sibling.choreTicketId);
    // The chore ticket is visible to this member and IS in the read set — it is
    // simply not blocked. Without this the absence could be a missing row.
    expect(read.sibling.choreTicketId).not.toBe(read.world.sharedTaskId);
    const visible = await db.pool.query<{ ticket_id: string }>(
      `SELECT t.ticket_id FROM proj_tickets t
        JOIN proj_visibility v ON v.ticket_id = t.ticket_id
       WHERE t.ticket_id = $1 AND v.resolved_mode = 'project' AND v.project_id = $2`,
      [read.sibling.choreTicketId, read.sibling.projectId],
    );
    expect(visible.rows).toHaveLength(1);
  });

  it('7.42 PLANTED DEFECT: both windows are INDIAN days — an event at 18:31Z belongs to the next Indian day, and a READ at 18:30Z happens on it', async () => {
    // The arithmetic, pinned first, so the fixtures below are not being read
    // against an assumption about where a day starts.
    expect(istDayOf('2026-08-12T18:35:00.000Z')).toBe('2026-08-13'); // 7 IST days back
    expect(istDayOf('2026-08-13T18:31:00.000Z')).toBe('2026-08-14'); // 6 IST days back
    expect(istDayOf(SCENARIO_NOW.toISOString())).toBe('2026-08-20');

    // --- Half one: the instant an event HAPPENED ---
    await claimSettings(7, 7);
    const atSeven = await strip('member');

    // 18:35Z on the 12th is seven Indian days back: stale. Naive UTC math labels
    // it 2026-08-12, counts eight, and would also alarm — so the kill is the
    // 18:31Z twin, which UTC math counts as seven and wrongly alarms about.
    expect(idsOf(atSeven, 'stale')).toEqual(
      [read.world.taskInEpicId, fx.istStale7Id, fx.istEveningId].sort(),
    );

    // A COUNT OF DAYS, not of 24-hour spans. 19:30 IST on the 13th is seven
    // Indian days before the 20th, and only 6 days 22 hours of elapsed time, so
    // `(now - entered) / 86_400_000` floors to six and would both mislabel this
    // ticket and leave it out of the window altogether.
    const evening = onlyOfKind(atSeven, 'stale', fx.istEveningId);
    expect(evening.enteredStateAt).toBe('2026-08-13T14:00:00.000Z');
    expect(evening.daysInFlight).toBe(7);
    expect(evening.reason).toBe(
      'In an active state since 2026-08-13 — past the 7-day staleness threshold.',
    );
    expect(idsOf(atSeven, 'stale')).not.toContain(fx.istFresh6Id);
    // …and neither is the one that entered at EXACTLY IST midnight. The window
    // is half-open — `istDayBounds(day).endUtc` is the next day's first instant
    // and not part of `day` — so an entry landing on the bound is six days old,
    // not seven. MEASURED: relaxing the comparison to `>` admits it and nothing
    // else in this file notices.
    expect(idsOf(atSeven, 'stale')).not.toContain(fx.istMidnightId);
    const staleItem = onlyOfKind(atSeven, 'stale', fx.istStale7Id);
    expect(staleItem.enteredStateAt).toBe('2026-08-12T18:35:00.000Z');
    expect(staleItem.daysInFlight).toBe(7);
    // The label is the IST day, not the UTC slice of the same instant.
    expect(staleItem.reason).toBe(
      'In an active state since 2026-08-13 — past the 7-day staleness threshold.',
    );

    // The positive control for that absence: move the threshold by ONE day and
    // the same ticket appears, counted as six. It was always in the read set;
    // the window is what excluded it.
    await claimSettings(6, 7);
    const atSix = await strip('member');
    expect(idsOf(atSix, 'stale')).toContain(fx.istFresh6Id);
    expect(idsOf(atSix, 'stale')).toContain(fx.istMidnightId);
    expect(onlyOfKind(atSix, 'stale', fx.istMidnightId).daysInFlight).toBe(6);
    const freshItem = onlyOfKind(atSix, 'stale', fx.istFresh6Id);
    expect(freshItem.daysInFlight).toBe(6);
    expect(freshItem.enteredStateAt).toBe('2026-08-13T18:31:00.000Z');
    expect(freshItem.reason).toBe(
      'In an active state since 2026-08-14 — past the 6-day staleness threshold.',
    );

    // --- Half two: the instant the strip is READ ---
    await claimSettings(7, 2);

    // 18:29:59.999Z is still 2026-08-20 in India, horizon 2026-08-22, so a claim
    // due on the 23rd is outside the window.
    const justBefore = await readAt('member', '2026-08-20T18:29:59.999Z');
    expect(idsOf(justBefore, 'due-soon')).toEqual([fx.overdueId]);

    // One millisecond later it is 2026-08-21 in India, horizon 2026-08-23, and
    // the same claim is inside. Both instants sit on the SAME UTC day, so
    // UTC-based math cannot tell these two reads apart at all.
    const justAfter = await readAt('member', '2026-08-20T18:30:00.000Z');
    expect(idsOf(justAfter, 'due-soon')).toEqual([fx.overdueId, fx.dueOn23Id].sort());
    const later = await readAt('member', '2026-08-20T18:31:00.000Z');
    expect(idsOf(later, 'due-soon')).toEqual([fx.overdueId, fx.dueOn23Id].sort());

    expect(justBefore.generatedAt.slice(0, 10)).toBe(justAfter.generatedAt.slice(0, 10));
    expect(justBefore.generatedAt.slice(0, 10)).toBe('2026-08-20');
  });

  it('7.117 the answer does not move with the machine’s time zone — probe first, or this case could not fail', async () => {
    // THE PROBE. `process.env.TZ` is inert inside a vitest worker THREAD; under
    // the `forks` pool (vitest 3's default, and this package sets no pool) it is
    // live. Both machines this repo runs on are Asia/Kolkata, so without this
    // line the three reads below could agree because the zone never moved, and
    // the case would pass on a route that used local-clock getters throughout.
    const kiritimati = await underZone('Pacific/Kiritimati', async () =>
      new Date('2026-08-20T12:00:00').getTime(),
    );
    const niue = await underZone('Pacific/Niue', async () =>
      new Date('2026-08-20T12:00:00').getTime(),
    );
    expect(kiritimati).not.toBe(niue);

    await claimSettings(7, 7);
    const at = SCENARIO_NOW.toISOString();
    const india = await underZone('Asia/Kolkata', () => readAt('member', at));
    const east = await underZone('Pacific/Kiritimati', () => readAt('member', at));
    const west = await underZone('Pacific/Niue', () => readAt('member', at));

    // Non-vacuity on the OTHER side: the thing being compared is not empty.
    expect(idsOf(india, 'stale').length).toBeGreaterThan(0);
    expect(idsOf(india, 'due-soon').length).toBeGreaterThan(0);
    expect(idsOf(india, 'blocked').length).toBeGreaterThan(0);

    // Same buckets, same day counts, same prose. A route that asked the ambient
    // calendar — `getFullYear()`/`toLocaleDateString()` instead of `istDayOf` —
    // moves `daysInFlight` and the reason strings under Kiritimati (UTC+14) and
    // Niue (UTC-11), which straddle the Indian date in both directions.
    expect(zoneSensitiveShape(east)).toEqual(zoneSensitiveShape(india));
    expect(zoneSensitiveShape(west)).toEqual(zoneSensitiveShape(india));
  });

  it('7.118 no session is 401, and so is a forged bearer — the session is resolved, not merely present', async () => {
    const url = attentionUrl(read.world.workspaceId);

    const anonymous = await read.app.inject({ method: 'GET', url });
    expect(anonymous.statusCode).toBe(401);
    expect(anonymous.json()).toEqual(UNAUTHENTICATED_BODY);
    expect(anonymous.body).not.toContain(read.world.taskInEpicId);

    const forged = await read.app.inject({
      method: 'GET',
      url,
      headers: { authorization: 'Bearer not-a-real-session-token' },
    });
    expect(forged.statusCode).toBe(401);
    expect(forged.json()).toEqual(UNAUTHENTICATED_BODY);
    expect(forged.body).not.toContain(read.world.taskInEpicId);

    // The positive control: the SAME url, with a real session, answers 200 and
    // does contain it. So the 401s are the door and not a broken route.
    const real = await attention('member');
    expect(real.statusCode).toBe(200);
    expect(real.body).toContain(read.world.taskInEpicId);
  });

  it('7.119 a stranger, a neighbour and an unknown workspace id get the SAME 404 — status, body and every header but date', async () => {
    const stranger = await attention('stranger');
    const neighbour = await attention('neighbour');
    const unknown = await attention('owner', newUlid());

    expect(stranger.statusCode).toBe(404);
    expect(stranger.json()).toEqual(READ_NOT_FOUND_BODY);
    expect(neighbour.statusCode).toBe(404);
    expect(unknown.statusCode).toBe(404);

    // Indistinguishable, or the route is an existence oracle: a 403 for the
    // neighbour would confirm the workspace exists to somebody with no business
    // knowing it does, and a different body for an unknown id would say which
    // ids are real.
    expect(neighbour.body).toBe(stranger.body);
    expect(unknown.body).toBe(stranger.body);
    expect(comparableHeaders(neighbour)).toEqual(comparableHeaders(stranger));
    expect(comparableHeaders(unknown)).toEqual(comparableHeaders(stranger));

    // The neighbour is a real workspace owner elsewhere, so their 404 here is
    // about TENANCY and not about having no membership anywhere.
    const own = await attention('neighbour', read.neighbour.workspaceId);
    expect(own.statusCode).toBe(200);
  });

  it('7.122 the workspace clause is the only tenancy this query has — a qualifying ticket next door never reaches the owner', async () => {
    await claimSettings(7, 7);

    // The row exists, in the OTHER workspace, with a date inside the window.
    const { rows } = await db.pool.query<{ workspace_id: string; claim: { value: { date: string } } }>(
      `SELECT workspace_id, fields -> 'dueDate' AS claim FROM proj_tickets WHERE ticket_id = $1`,
      [fx.neighbourDueId],
    );
    expect(rows[0]!.workspace_id).toBe(read.neighbour.workspaceId);
    expect(rows[0]!.claim.value.date).toBe('2026-08-21');

    // `visibleTicketsWhere` compiles to `TRUE` for an owner and carries no
    // tenancy clause, so for this caller the workspace predicate is the whole
    // boundary. The owner's own qualifying tickets are the positive control that
    // the bucket is not simply empty.
    const owner = await strip('owner');
    expect(idsOf(owner, 'due-soon')).not.toContain(fx.neighbourDueId);
    expect(idsOf(owner, 'due-soon')).toContain(read.world.hiddenTaskId);
    expect(owner.items.map((item) => item.card.workspaceId)).toEqual(
      owner.items.map(() => read.world.workspaceId),
    );

    // And the neighbour, reading their OWN workspace, does get it — so it is
    // reachable, just not from here.
    const next = await attention('neighbour', read.neighbour.workspaceId);
    expect(next.statusCode).toBe(200);
    expect(idsOf(next.json() as AttentionResponse, 'due-soon')).toEqual([fx.neighbourDueId]);
  });

  it('7.123 blocked is a FLAG, not a category — an `open` state somebody marked blocked is on the strip', async () => {
    await claimSettings(7, 7);
    const response = await strip('member');

    const { rows } = await db.pool.query<{ state_category: string; state_id: string }>(
      `SELECT state_category, state_id FROM proj_tickets WHERE ticket_id = $1`,
      [fx.openBlockedId],
    );
    // `open`, not `active` — every other blocked fixture in the suite is active,
    // so without this row a bucket narrowed to `active` answers identically.
    expect(rows[0]!.state_category).toBe('open');
    expect(rows[0]!.state_id).toBe('todo');

    const item = onlyOfKind(response, 'blocked', fx.openBlockedId);
    expect(item.card.stateCategory).toBe('open');
    expect(item.stateName).toBe('Queued');
    expect(item.reason).toBe('In "Queued" — a blocked state.');
    // The flag came from `wf-second` v2, so the LATEST definition is what was
    // read: v1 flagged nothing at all.
    expect(item.card.workflowId).toBe(read.sibling.secondWorkflowId);
    // The active blocked one is still here beside it.
    expect(idsOf(response, 'blocked')).toContain(read.world.sharedTaskId);
    // …and it is not in either window: an open ticket with no due date and no
    // active state entry qualifies for nothing else.
    expect(idsOf(response, 'stale')).not.toContain(fx.openBlockedId);
    expect(idsOf(response, 'due-soon')).not.toContain(fx.openBlockedId);
  });

  it('7.120 a member who may see nothing gets 200 and an empty strip; a guest gets their own slice', async () => {
    await claimSettings(7, 7);

    // `outsider` is a workspace MEMBER on no project and named in no explicit
    // list. The door lets them in; the visibility predicate leaves them with
    // nothing.
    const outsider = await attention('outsider');
    expect(outsider.statusCode).toBe(200);
    const outsiderStrip = outsider.json() as AttentionResponse;
    expect(outsiderStrip.items).toEqual([]);
    // …and the settings still answer, so this is a computed empty rather than a
    // route that fell over.
    expect(outsiderStrip.settings).toMatchObject({ staleDays: 7, dueSoonDays: 7 });
    expect(outsiderStrip.generatedAt).toBe(SCENARIO_NOW.toISOString());

    // The positive control that the workspace is NOT quiet: the blocked, stale
    // and due rows all exist, read straight out of the projection, and the
    // member's answer at the same instant holds all three buckets.
    const { rows } = await db.pool.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM proj_tickets
        WHERE workspace_id = $1 AND (state_id = 'waiting' OR fields ? 'dueDate')`,
      [read.world.workspaceId],
    );
    expect(Number(rows[0]!.n)).toBeGreaterThan(0);
    const memberStrip = await strip('member');
    expect(memberStrip.items.length).toBeGreaterThan(0);

    // The guest reaches explicit lists and nothing else, so their strip is the
    // one ticket shared with them — not everything, and not nothing.
    const guest = await strip('guest');
    expect(idsOf(guest, 'due-soon')).toEqual([fx.guestDueId]);
    expect(idsOf(guest, 'blocked')).toEqual([]);
    expect(idsOf(guest, 'stale')).toEqual([]);
    expect(guest.items.map((item) => item.card.ticketId)).toEqual([fx.guestDueId]);
  });
});
