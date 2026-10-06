import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import { isTicketLinkEvent, isWithheldLinkEvent, linkPayloadDirection } from '@gisik-nokma/domain';
import type { Queryable } from '../db/queryable.js';
import { keysForAncestors } from '../read/ancestry.js';
import { annotateFlowCauses } from '../read/history-causes.js';
import { canSee } from '../visibility/can-see.js';
import { targetSight, withholdEvent } from '../visibility/withhold-link-targets.js';
import { NOT_FOUND_BODY } from './tickets.js';

/**
 * One stored claim, as this route serves it (Plan 3 Task 13).
 *
 * Nine fields, camelCase, and every one of them is a fact somebody asserted:
 * the claim itself (`type`, `version`, `payload`), who made it (`actorId`),
 * where from (`origin`), when they say it happened and when we received it
 * (`clientTime`, `serverTime`), and where it sits in this entity's own history
 * (`seq`). Nothing is summarised, and nothing is derived but the two link
 * labels and the flow-cause key — spec §3's exception is that the history view
 * IS the ledger, filtered, and a field this route computed would make it
 * something else. The exceptions are two fields on link events only: the
 * tenth, `linkTarget` (typed-links T4, spec A §2.4), the other end's key, or
 * `null` when this viewer cannot see it; and the eleventh, `linkDirection`
 * (drafts T6 FIX 1), which way the link reads from this ticket; and one on
 * flow-caused events only: the twelfth, `causeTicket` (wtg2 T17), the key of
 * the ticket a flow cause names, or `null` when this viewer cannot see it.
 * Their own docblocks below say why they are derived here.
 *
 * ## What is deliberately NOT here, and why that is not a redaction
 *
 * `workspace_id`, `entity_kind`, `entity_id` and `workspace_seq` are absent.
 * They are not withheld: the first three are constants of the request (the
 * entity is the `:id` in the path, its kind is `ticket`, its workspace is the
 * one that ticket lives in and the caller was authorized against), and
 * `workspaceSeq` is the WORKSPACE stream cursor, which is a different question
 * from this ticket's own history and belongs to the sync surface that resumes
 * by it. Provenance is untouched — spec §6's rule is that a claim is never
 * redacted from someone entitled to the state, and every claim-bearing field
 * above goes out whole, with TWO exceptions. The first: a link event's other end
 * (`payload.targetId`, or a draft-side entry's `from` with its `targetId`) is
 * withheld (`null`) when this viewer cannot see it (spec A §2.4, see
 * `linkTarget`), and a contest of such a link claim goes out with that
 * payload withheld and the gate's cause in place of its own, because a
 * `link.reverse` reason names the hidden ticket's title (typed-links T4b). The
 * claim is not cut: only the other end's id and the contest's cause are
 * withheld, per viewer (`visibility/withhold-link-targets.ts`). The second
 * (wtg2 T17, AMEND 2): a flow cause naming a ticket this viewer cannot see goes
 * out with that ticket id and its person (`triggeredBy` / `decidedBy`) nulled,
 * their keys kept (`withholdEvent`'s `withholdFlowCause`, the one rule every
 * door serves, wtg-flow-cause-withhold; `read/history-causes.ts` then reads
 * such a cause as `causeTicket: null`); its kind, label or outcome, pass and
 * decision event id stay.
 */
export type TicketHistoryEvent = {
  id: string;
  type: string;
  version: number;
  payload: unknown;
  actorId: string;
  origin: string;
  clientTime: string;
  serverTime: string;
  seq: number;
  /**
   * Link events only (spec A §2.4): one of the two derived fields this route
   * serves. `{ key }` names the other end, which this viewer can see: the
   * target, or a draft-side entry's `from` (drafts T6 FIX 1: `S blocks D` filed
   * from D's side names S on D's line, never D itself). `null` is an end they
   * cannot see, and then the payload's id is withheld too, which is the
   * spec's rule overriding "every claim-bearing field goes out whole" for one
   * id, the other end's. Absent on every other event type.
   */
  linkTarget?: { key: string | null } | null;
  /**
   * Link events only (drafts T6 FIX 1): which way the link reads from THIS
   * ticket, `linkPayloadDirection` of the payload as served. `'in'` is a
   * draft-side `from` entry kept on a published draft's stream (D's line for
   * `S blocks D` reads "is blocked by S"); served withheld it is
   * `{kind, targetId: null, from: null}`, so the direction survives the
   * withhold. `'out'` is every other link. Absent on every other event type.
   */
  linkDirection?: 'out' | 'in';
  /**
   * Flow-caused events only (wtg2 T17): the second derived field this route
   * serves, with `linkTarget`. `{ key }` names the ticket the cause names (a
   * promotion's finished source, or the Decision), which this viewer can see;
   * `null` is one they cannot see, and then the cause's ticket id and person
   * are nulled too (`annotateFlowCauses`). Absent on an event with no flow cause.
   */
  causeTicket?: { key: string | null } | null;
};

/**
 * A stored ledger row as pg hands it back.
 *
 * `seq` is `number`, not `string | number`: `bigint` (OID 20) arrives as a
 * string from the driver by default, and `src/db.ts` installs a global
 * `setTypeParser` that parses it once for every pool in the product. Coercing
 * again here would be a second, quieter copy of that decision — and a `Number()`
 * at this boundary is exactly the kind of defensive cast that keeps working
 * after the parser is removed, hiding the removal from every test. Same call
 * `routes/tickets.ts` makes at the same spot.
 *
 * Both clocks are `timestamptz`, so both arrive as `Date`.
 */
type HistoryRow = {
  id: string;
  type: string;
  version: number;
  payload: unknown;
  actor_id: string;
  origin: string;
  client_time: Date;
  server_time: Date;
  seq: number;
};

/**
 * The most rows one request may take away, however large a `limit` it names.
 *
 * A cap rather than a refusal: an actor asking for more than exists is not
 * making an error, so answering 400 would refuse a reasonable request. What the
 * cap protects is the server — `limit` is an actor-supplied number that goes
 * straight into a query plan, and an unbounded one is a way to ask this process
 * to materialise an entire ledger into one JSON body.
 */
export const MAX_LIMIT = 1000;

/** What a caller who names no `limit` gets. Well under `MAX_LIMIT`, so the default is never itself the clamp. */
export const DEFAULT_LIMIT = 200;

/**
 * The one body a malformed paging request carries.
 *
 * It states the two bounds SEPARATELY because they are different bounds, and
 * the plan text's single sentence — "afterSeq and limit must be non-negative
 * integers" — is false about `limit`: zero is non-negative and `limit=0` is
 * refused here. A refusal whose stated reason does not hold of the input is
 * worse than a generic one, because it sends the reader to check the thing that
 * was fine. One body for both parameters is kept (the workspace security
 * standard: errors stay generic, and naming WHICH parameter offended would say
 * something about a request this route has not yet authorized); the sentence is
 * corrected so that what it does say is true.
 */
export const BAD_PAGING_BODY = {
  error: 'afterSeq must be a whole number from 0, and limit a whole number from 1',
} as const;

export type Paging = { afterSeq: number; limit: number };

/**
 * `afterSeq` is a CURSOR, not a count, so it is bounded on both sides.
 *
 * The upper bound is not tidiness. `seq` is `bigint`, `^\d+$` happily accepts
 * `99999999999999999999`, and pg sends that to Postgres as a parameter against
 * a bigint column, which raises `value out of range for type bigint` — a
 * database error, inside a read route, from a query string. That is a 500 for
 * an input the route should have called malformed, and this is the line that
 * stops it. `Number.MAX_SAFE_INTEGER` is the ceiling because it is the largest
 * integer the parse above can even represent exactly; a cursor past it names a
 * position no ledger in this product can hold.
 */
const MAX_SEQ = Number.MAX_SAFE_INTEGER;

/** A digit string and nothing else: no sign, no decimal point, no exponent, no whitespace. */
function digitsOnly(raw: unknown): number | null {
  if (typeof raw !== 'string' || !/^\d+$/.test(raw)) {
    return null;
  }
  return Number(raw);
}

/**
 * The paging an actor asked for, resolved and bounded — or `null`, meaning
 * "this request is malformed" and nothing else.
 *
 * ## It is exported and pure because the clamp cannot be seen from outside
 *
 * `limit=999999` and `limit=1000` return the same rows from any ledger this
 * suite can afford to build, so an HTTP test cannot tell a working clamp from a
 * missing one — it would be a check that passes for a reason unrelated to the
 * property it names. So the clamp is asserted here, on the value, by a unit
 * test, and the ROUTE tests assert only what is observable over HTTP: that a
 * limit shrinks the page, that an `afterSeq` moves it, and that a malformed
 * parameter is refused. Two instruments, each measuring what it can actually
 * see.
 *
 * ## `unknown`, not `string | undefined`, and that is load-bearing
 *
 * Fastify parses `?limit=1&limit=2` into an ARRAY. Typing the input as a string
 * would make the compiler agree with a claim the runtime does not honour, and
 * the array would flow into `Number()` — `Number(['2'])` is 2, so a repeated
 * parameter would silently take its last value. `app.ts` records that the
 * events door earned a real defect on exactly this scalar-versus-array shape.
 * Here a non-string is malformed, full stop.
 */
export function parsePaging(query: { afterSeq?: unknown; limit?: unknown }): Paging | null {
  let afterSeq = 0;
  if (query.afterSeq !== undefined) {
    const parsed = digitsOnly(query.afterSeq);
    if (parsed === null || parsed > MAX_SEQ) {
      return null;
    }
    afterSeq = parsed;
  }

  let limit = DEFAULT_LIMIT;
  if (query.limit !== undefined) {
    const parsed = digitsOnly(query.limit);
    // Zero is refused rather than clamped up to one: a caller asking for no
    // rows has asked for nothing, and answering with a page would be answering
    // a question they did not ask. It is refused rather than answered with an
    // empty page for the same reason — an empty page is indistinguishable from
    // "you have reached the end", which is a fact about the ledger, and this
    // request never looked at one.
    if (parsed === null || parsed < 1) {
      return null;
    }
    // No upper REFUSAL to match `afterSeq`'s: an over-large limit is clamped, so
    // `Number('9'.repeat(400))` being `Infinity` is harmless — `Math.min` picks
    // `MAX_LIMIT` — and it never reaches the query as a parameter.
    limit = Math.min(parsed, MAX_LIMIT);
  }

  return { afterSeq, limit };
}

function toHistoryEvent(row: HistoryRow): TicketHistoryEvent {
  return {
    id: row.id,
    type: row.type,
    version: row.version,
    payload: row.payload,
    actorId: row.actor_id,
    origin: row.origin,
    // `.toISOString()`, never a cast and never a stringify. Every connection in
    // this product runs with session timezone Asia/Kolkata (`src/db.ts`), so
    // `String(row.client_time)` would put a `+05:30` LABEL into a field every
    // client parses as an absolute moment. The instant is identical either way;
    // the label was never a fact. Same rule, same reason, as
    // `routes/tickets.ts` and `sync/contests-route.ts`.
    clientTime: row.client_time.toISOString(),
    serverTime: row.server_time.toISOString(),
    seq: row.seq,
  };
}

/**
 * One ticket's history: the ledger, filtered (Plan 3 Task 13).
 *
 * ## Its relationship to `GET /v1/workspaces/:workspaceId/tickets/:ticketId/events`
 *
 * `routes/tickets.ts` (Plan 4 Task 8) serves the same ticket's ledger under a
 * workspace-scoped path, as FULL envelopes in the stored snake_case, unpaged.
 * This route is not a duplicate of it and not a trimmed version of it: it is
 * the contract Plan 3 owes — `TicketHistoryEvent[]` under `{ ticketId, events }`
 * at a workspace-free path, with `afterSeq` and `limit`. The two are different
 * contracts over the same rows and both are meant to exist.
 *
 * **What is reused, deliberately:** `NOT_FOUND_BODY` is IMPORTED from that file
 * rather than restated, so the two surfaces cannot drift into different 404s;
 * `canSee` is the same single visibility decision; the ordering (`seq`
 * ascending) and the `.toISOString()` rule are that route's, unchanged.
 *
 * **What is NOT shared, and the reason:** the SELECT is written here rather
 * than extracted into a function both routes call. Two reasons, and the second
 * is the one that decided it. (1) Reaching into another plan's shipped file is
 * the thing this series has three recorded precedents for NOT doing (Plan 3
 * Tasks 10, 11 and 12 each recorded a false sentence in Plan 4's files rather
 * than editing them), and a refactor of `routes/tickets.ts` would collide with
 * Plan 4's own lane. (2) A shared query would make the two routes agree BY
 * CONSTRUCTION, which is agreement no test can falsify. What guards the drift
 * instead is observable: `ticket-history.test.ts` asks BOTH routes for the same
 * ticket and asserts the same ordered event ids come back, non-empty. If either
 * route's filter, ordering or scope moves, that test reddens, and it reddens
 * naming the disagreement rather than hiding it inside a helper.
 *
 * ## The whole visibility decision is `canSee`, and it is the ONLY guard
 *
 * There is deliberately no separate existence check. `canSee` answers `false`
 * both for a ticket the viewer may not see and for a ticket with no
 * `proj_visibility` row at all (its own docblock: "Unknown and invisible are
 * the same answer"), so ONE branch produces ONE 404 body and the
 * indistinguishability the neighbouring route spent a task closing is
 * STRUCTURAL here — there is no second refusal that could grow a different
 * status, a different body or a different header. The history of a ticket you
 * may not see is byte-identical to the history of a ticket that does not exist,
 * and `ticket-history.test.ts` compares the two responses field by field rather
 * than checking a status code twice.
 *
 * The plan text's `SELECT 1 FROM proj_tickets WHERE ticket_id = $1` is
 * therefore not written. It would be a SECOND notion of existence, answering
 * from a different table than the one the audience decision reads, and the two
 * can disagree — which is precisely how an existence oracle gets reopened.
 *
 * ## There is no `:workspaceId`, so there is no workspace question to ask
 *
 * The neighbouring route carries `AND workspace_id = $2` because its path names
 * a workspace and a path that names one may lie. This path names none, so there
 * is nothing to reconcile: `canSee` resolves the viewer's role in the workspace
 * the TICKET's own row names, which is the only workspace this request has.
 *
 * ## Paging is validated before the audience is consulted
 *
 * A malformed `afterSeq` is malformed for every caller and every id — the
 * refusal is a fact about the query string alone — so it cannot become an
 * oracle: a junk cursor answers the same 400 for a ticket you may see, one you
 * may not, and one that never existed. The consequence for tests is stated
 * where it bites: every case that means to exercise `canSee` sends valid paging
 * (or none), or it would be measuring the guard above it.
 *
 * ## The query walks an index that already exists
 *
 * `events_entity_seq_unique UNIQUE (entity_kind, entity_id, seq)` is a prefix
 * match on the first two columns and a range scan on the third, which is
 * exactly this WHERE and this ORDER BY. No index is added for this route.
 */
export function registerTicketHistoryRoute(
  app: FastifyInstance,
  deps: { pool: Queryable },
  requireSession: preHandlerHookHandler,
): void {
  app.get<{ Params: { id: string }; Querystring: { afterSeq?: unknown; limit?: unknown } }>(
    '/v1/tickets/:id/history',
    { preHandler: requireSession },
    async (request, reply) => {
      const paging = parsePaging(request.query);
      if (paging === null) {
        return reply.code(400).send(BAD_PAGING_BODY);
      }

      const { id } = request.params;
      if (!(await canSee(deps.pool, request.currentUserId, id))) {
        return reply.code(404).send(NOT_FOUND_BODY);
      }

      // The history view IS the ledger, filtered (spec §3) — ordered by the
      // PER-ENTITY sequence, which is this entity's own history in the order it
      // was made. Not `workspace_seq`: that orders the workspace's whole
      // stream, and interleaves other entities' claims into the gaps.
      //
      // `ORDER BY seq ASC` is NOT redundant with the index, and the difference
      // is only observable if you take the index away. Measured: the planner
      // chooses `Index Scan using events_entity_seq_unique`
      // (entity_kind, entity_id, seq), which emits seq order for free, so
      // deleting this clause changes no result at any table size an ordinary
      // test can build. `test/routes/ticket-history-ordering.test.ts` disables
      // index, index-only and bitmap plans on its database — proving it did, by
      // asserting the exact heap order an unordered copy of this query returns
      // — and then holds the route to ascending. That is where deleting this
      // clause reddens.
      const { rows } = await deps.pool.query<HistoryRow>(
        `SELECT id, type, version, payload, actor_id, origin, client_time, server_time, seq
         FROM events
         WHERE entity_kind = 'ticket' AND entity_id = $1 AND seq > $2
         ORDER BY seq ASC
         LIMIT $3`,
        [id, paging.afterSeq, paging.limit],
      );

      // Typed-links T4b: every row as this viewer may be served it FIRST, with
      // ONE sight for the page (`withhold-link-targets.ts`): a link whose target
      // they cannot see goes out with `targetId: null`, and a contest of such a
      // claim with the gate's cause. Then the link events are labelled from that
      // output (spec A §2.4): a withheld one reads `linkTarget: null`, a visible
      // other end its key, and every one its `linkDirection` (drafts T6 FIX 1),
      // read from the payload as served: a withheld draft-side entry keeps its
      // `from` key, so it still reads in. A page is at most `MAX_LIMIT` events,
      // so the per-target loop is bounded.
      const sees = targetSight(deps.pool, request.currentUserId);
      const events: TicketHistoryEvent[] = [];
      for (const row of rows) events.push(await withholdEvent(toHistoryEvent(row), sees));
      // The other end: a draft-side entry's `from` (it points INTO this ticket), else the target.
      const otherEnd = (e: TicketHistoryEvent): unknown => {
        const p = e.payload as { targetId?: unknown; from?: unknown };
        return p.from ?? p.targetId;
      };
      const linkTargets = [
        ...new Set(
          events
            .filter((e) => isTicketLinkEvent(e.type))
            .map(otherEnd)
            .filter((t): t is string => typeof t === 'string'),
        ),
      ];
      const keyOf = new Map<string, string | null>();
      if (linkTargets.length > 0) {
        const { rows: owners } = await deps.pool.query<{ ticket_id: string; workspace_id: string; project_id: string }>(
          'SELECT ticket_id, workspace_id, project_id FROM proj_tickets WHERE ticket_id = ANY($1::text[])',
          [linkTargets],
        );
        for (const o of owners) {
          const keys = await keysForAncestors(deps.pool, o.workspace_id, [{ ticketId: o.ticket_id, projectId: o.project_id }]);
          keyOf.set(o.ticket_id, keys.get(o.ticket_id) ?? null);
        }
      }
      for (const e of events) {
        if (!isTicketLinkEvent(e.type)) continue;
        if (isWithheldLinkEvent(e)) e.linkTarget = null;
        else {
          const other = otherEnd(e);
          if (typeof other === 'string') e.linkTarget = { key: keyOf.get(other) ?? null };
        }
        e.linkDirection = linkPayloadDirection(e.payload);
      }
      await annotateFlowCauses(deps.pool, sees, events);
      return { ticketId: id, events };
    },
  );
}
