import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import type {
  AttentionItem,
  AttentionResponse,
  PublishedWorkflowDef,
  TicketCard,
} from '@gisik-nokma/domain';
import { istDayBounds, istDayOf } from '@gisik-nokma/domain';
import type { Queryable } from '../db/queryable.js';
import type { EffectiveRole } from '../permissions/effective-role.js';
import { getWorkspaceSettings } from '../projections/workspace-settings.js';
import { READ_NOT_FOUND_BODY, requireMember } from '../read/membership.js';
import { SqlParams } from '../read/sql-params.js';
import {
  assembleTicketCards,
  PROJ_TICKET_COLUMNS,
  type ProjTicketRow,
} from '../read/ticket-cards.js';
import { visibleTicketsWhere } from '../read/visible-where.js';
import { blockedStateKeys, latestWorkflowDefs } from '../read/workflow-defs.js';

/** One IST day, in milliseconds. India has no daylight saving — see `addIstDays`. */
const DAY_MS = 86_400_000;

/**
 * `delta` IST days after `day` (negative walks backwards).
 *
 * `istDayBounds(day).startUtc` IS IST midnight of `day`, and India has no
 * daylight saving: the offset is fixed by law, so every IST day is exactly 24h
 * with no exceptions (`ist-day.ts` states it, and `packages/domain/test`'s own
 * suite exercises the boundary). Stepping by whole `DAY_MS` from one IST
 * midnight therefore lands exactly on another IST midnight, and `istDayOf` names
 * it. This is calendar arithmetic over IST days, not elapsed time between two
 * arbitrary instants — and it is expressed through `ist-day.ts` in both
 * directions rather than by hand, so the day the offset rule ever changes there
 * is one place to change it.
 */
function addIstDays(day: string, delta: number): string {
  return istDayOf(new Date(Date.parse(istDayBounds(day).startUtc) + delta * DAY_MS).toISOString());
}

/**
 * How many IST days from `fromDay` to `toDay` — a day COUNT, not a duration.
 *
 * Both operands are snapped to IST midnight before subtracting, so the result is
 * an exact integer number of calendar days. That is what "subtract two
 * `istDayOf` results" means computationally, and it is emphatically NOT
 * `(b - a) / 86_400_000` over two raw instants: that quotient answers a
 * different question — how many 24-hour spans — and gets the answer wrong by a
 * whole day for every claim landing between 18:30Z and midnight UTC, which is
 * the entire Indian evening.
 */
function istDaysBetween(fromDay: string, toDay: string): number {
  return Math.round(
    (Date.parse(istDayBounds(toDay).startUtc) - Date.parse(istDayBounds(fromDay).startUtc)) / DAY_MS,
  );
}

/**
 * The attention strip: three buckets computed at READ TIME from claims plus the
 * clock, and NEVER stored.
 *
 * ## Why nothing here is materialised
 *
 * Every other read on this branch answers a question about stored rows. This one
 * answers a question about stored rows AND the clock — "what needs attention
 * now" — and its answer changes while nothing in the database changes. A
 * projected `proj_attention` table would freeze a judgment that expires: the
 * moment it was written it would begin disagreeing with the calendar, and every
 * consumer would then need to know how stale the staleness table was. So the
 * strip is computed per request and `generatedAt` names the moment it was
 * computed, which is the only honest thing a derived answer can return.
 *
 * The clock arrives as a parameter rather than being read here. That is what
 * makes the IST boundaries testable at all: `attention.test.ts` reads the same
 * world at two instants a millisecond apart and gets two different Indian dates
 * out of it.
 *
 * ## Three buckets, in response order
 *
 * 1. **blocked** — visible tickets sitting in a state its OWN workflow flagged
 *    `blocked` (amendment 9), whatever the category. No clock is involved. The
 *    flag is looked up by the composite `${workflowId}:${stateId}` key
 *    `blockedStateKeys` returns, because a state id is unique only within its
 *    workflow: the seeded world has two workflows that both spell a state
 *    `waiting` and only one of them flagged it.
 * 2. **stale** — visible tickets in an `active`-category state whose state-entry
 *    `serverTime` falls on or before the IST day `staleDays` back from today.
 *    `daysInFlight` is the IST day count, and the reason names the IST day.
 * 3. **due-soon** — visible NON-TERMINAL tickets whose due-date CLAIM falls on
 *    or before the IST day `dueSoonDays` from today. Overdue is included, since
 *    a missed date is not less urgent. Only `state: 'claimed'` qualifies: a
 *    `cleared` due date is an attributed removal and a `never-claimed` one is
 *    the absence of any statement, and neither is a deadline.
 *
 * ## Both windows are INDIAN days
 *
 * Owner decision 2026-08-20, "time is Asia/Kolkata". This is not a display
 * preference — it decides answers. An event at 18:31Z is already TOMORROW in
 * India while the UTC page still reads yesterday, so anything that slices ten
 * characters off an ISO string, or divides a millisecond difference by 86 400
 * 000, is answering the UTC question, which the product does not ask. Boundaries
 * come from `istDayBounds` and are compared half-open (`>= startUtc`,
 * `< endUtc`); counts subtract `istDayOf` results through `istDaysBetween`.
 *
 * ## The thresholds are CLAIMS
 *
 * `getWorkspaceSettings` is the source, never `DEFAULT_STALE_DAYS` inline: a
 * threshold is a claim about what deserves attention and it is attributed like
 * everything else. Its whole answer travels on the response, provenance
 * included, so "the defaults are in force" and "somebody chose 7" stay tellable
 * apart at the client.
 *
 * ## Every bucket length is a disclosure, and every row passed the predicate
 *
 * The strip emits no count fields, but a client renders bucket lengths as
 * counts, so those counts must be over what this viewer may see. The single
 * query below is scoped by `t.workspace_id` (the whole tenancy boundary — for an
 * owner `visibleTicketsWhere` compiles to `TRUE`) and by `visibleTicketsWhere`
 * itself, CONSUMED rather than re-expressed; every card in every bucket comes
 * from it, so no bucket can be lengthened by a ticket the viewer cannot see.
 *
 * ## Closed tickets need no attention (spec §3.2, 2026-09-17)
 *
 * `t.closed_at IS NULL` sits beside `visibleTicketsWhere` in the same query, so
 * a closed ticket is absent from `cards` before any of the three buckets below
 * run — not a fourth category the loops learn to skip. It is the one exclusion
 * this route needed to add on purpose: **stale** and **due-soon** already
 * exclude a closed ticket's usual resting state by CATEGORY (stale requires
 * `active`, due-soon excludes `terminal`), but **blocked** reads the flag
 * "whatever the category" — so a ticket closed while sitting in a
 * blocked-flagged TERMINAL state is the one shape that would otherwise still
 * warn about business that is finished.
 *
 * ## What this deliberately costs
 *
 * It assembles a full card for every visible ticket in the workspace — including
 * one `rollupFor` round trip each — in order to fill three buckets. That is the
 * plan's shape and `assembleTicketCards` already names the batching residue in
 * its own docblock ("if the board's card count makes it matter, the batch
 * belongs INSIDE `rollupFor`"). Recorded here rather than fixed, with the same
 * owner.
 *
 * ## RECORDED, NOT DECIDED: the blocked flag is read from the CURRENT definition
 *
 * `latestWorkflowDefs` resolves each workflow to its latest published version,
 * so a ticket's blocked-ness is judged against the definition in force NOW and
 * not against the one in force when it entered its state. Republishing a
 * workflow that newly flags a state therefore re-classifies every ticket already
 * sitting in it, with no event on any of their own streams — and un-flagging it
 * takes them off the strip the same way.
 *
 * That is defensible for a strip whose whole contract is "what needs attention
 * NOW", and it is the same reader every other read route on this branch uses. It
 * is nonetheless a SEMANTICS DECISION nobody has made: the plan text does not
 * address it, and the alternative — pinning each ticket to the version its state
 * entry was claimed under — is a different, also-defensible product. It is
 * recorded here rather than settled, and belongs to whoever rules on read-surface
 * semantics for this plan series (the coordination doc). `attention.test.ts`
 * 7.123 OBSERVES the current behaviour; it is not evidence anybody chose it.
 *
 * ## EXTENSION POINT (Plan 10)
 *
 * Contested claims join this strip as a FOURTH, additive item kind once
 * `claim.contested` events exist (coordination amendment 16). `AttentionItem` is
 * a discriminated union precisely so that arm can arrive without reshaping the
 * three here.
 */
export async function readAttention(
  db: Queryable,
  eff: EffectiveRole,
  viewerId: string,
  workspaceId: string,
  now: Date,
): Promise<AttentionResponse> {
  const settings = await getWorkspaceSettings(db, workspaceId);

  const params = new SqlParams();
  const where = [
    `t.workspace_id = ${params.add(workspaceId)}`,
    visibleTicketsWhere(eff, viewerId, params),
    // backlog/closed spec §3.2, 2026-09-17: a closed ticket needs no attention,
    // whatever state it is closed in — including a BLOCKED-flagged one, which
    // is the one bucket here that is not already excluded by category (stale
    // and due-soon already skip non-active / terminal tickets below; blocked
    // does not, "whatever the category", per this function's own docblock).
    't.closed_at IS NULL',
  ];
  const { rows } = await db.query<ProjTicketRow>(
    `SELECT ${PROJ_TICKET_COLUMNS}
       FROM proj_tickets t
       JOIN proj_visibility v ON v.ticket_id = t.ticket_id
      WHERE ${where.join(' AND ')}
      ORDER BY t.ticket_id`,
    params.toArray(),
  );

  const cards = await assembleTicketCards(db, viewerId, rows);
  const defs = await latestWorkflowDefs(
    db,
    workspaceId,
    rows.map((row) => row.workflow_id),
  );
  const blockedKeys = blockedStateKeys(defs);

  const items: AttentionItem[] = [];

  for (const card of cards) {
    if (!blockedKeys.has(`${card.workflowId}:${card.stateId}`)) continue;
    const stateName = stateNameOf(defs, card);
    items.push({
      kind: 'blocked',
      card,
      stateName,
      reason: `In "${stateName}" — a blocked state.`,
    });
  }

  // Today, in India. Everything below is measured from this day, and not from a
  // UTC calendar page that turns over five and a half hours late.
  const today = istDayOf(now.toISOString());

  // The staleness window is the last `staleDays` IST days. A ticket is stale
  // when it entered its state on or before the cutoff DAY — that is, strictly
  // before that day's END, which is the half-open upper bound `istDayBounds`
  // hands back. Stated as an instant comparison so no per-card day string has to
  // be parsed; equivalent to `istDaysBetween(entryDay, today) >= staleDays`.
  const staleCutoffUtc = Date.parse(istDayBounds(addIstDays(today, -settings.staleDays)).endUtc);
  for (const card of cards) {
    if (card.stateCategory !== 'active') continue;
    const enteredStateAt = card.stateProvenance.serverTime;
    if (Date.parse(enteredStateAt) >= staleCutoffUtc) continue;
    const enteredOnIstDay = istDayOf(enteredStateAt);
    items.push({
      kind: 'stale',
      card,
      enteredStateAt,
      // A count of Indian days, subtracted — never a millisecond quotient.
      daysInFlight: istDaysBetween(enteredOnIstDay, today),
      thresholdDays: settings.staleDays,
      reason: `In an active state since ${enteredOnIstDay} — past the ${settings.staleDays}-day staleness threshold.`,
    });
  }

  // The due window runs to the end of the IST day `dueSoonDays` from today.
  // `dueDate.claim.date` is already a day claim in the same calendar, so the
  // comparison is day-string to day-string — fixed-width `YYYY-MM-DD` sorts
  // chronologically — and needs no second clock reading.
  const horizon = addIstDays(today, settings.dueSoonDays);
  for (const card of cards) {
    if (card.stateCategory === 'terminal') continue;
    // Only a live claim is a deadline: `cleared` is somebody's removal and
    // `never-claimed` is nobody having said anything. The union has no null arm
    // so neither can be mistaken for the other here.
    if (card.dueDate.state !== 'claimed') continue;
    const due = card.dueDate.claim;
    if (due.date > horizon) continue;
    items.push({
      kind: 'due-soon',
      card,
      due,
      windowDays: settings.dueSoonDays,
      reason: `Needed by ${due.date} — due within ${settings.dueSoonDays} days.`,
    });
  }

  return {
    workspaceId,
    generatedAt: now.toISOString(),
    settings,
    items,
  };
}

/**
 * The blocked state's human name, from the definition that flagged it.
 *
 * Falls back to the state ID rather than to a blank or a throw: reaching here
 * means the state is in `blockedStateKeys`, which was built from these same
 * definitions, so the lookup cannot miss — but if it ever did, the id is a true
 * statement about the ticket while `''` would be a name nobody gave sitting
 * where a real one goes.
 *
 * **That fallback is UNCONSTRAINED by any test and is reported as such**, the
 * way `readMyWork`'s own unreachable `throw` is: no fixture can reach it while
 * the two lookups agree by construction, so nothing in the suite would notice if
 * it silently started firing. It is reachable only if `blockedStateKeys` and
 * this walk are ever fed different definition maps.
 *
 * `defs` is typed `Map<string, PublishedWorkflowDef>` and NOT the structural
 * shape this function happens to read. A narrower structural parameter compiles
 * today and keeps compiling against a shape nothing produces — the day `states`
 * grows a field this should consult, or `name` is spelled differently, the
 * mismatch would be silent. It is a `Map` and the state list is walked rather
 * than indexed, so nothing here is an object keyed by stored data.
 */
function stateNameOf(defs: Map<string, PublishedWorkflowDef>, card: TicketCard): string {
  return defs.get(card.workflowId)?.states.find((state) => state.id === card.stateId)?.name ??
    card.stateId;
}

/**
 * `GET /v1/workspaces/:workspaceId/attention`.
 *
 * ## The gate, in Task 8's order
 *
 * 1. `requireSession` (the preHandler) — no session, and a FORGED bearer alike,
 *    are **401 `{error:'unauthenticated'}`** and the handler never runs (case
 *    7.118, with the same URL answering 200 once a real session is attached).
 * 2. `requireMember` — a caller outside the workspace is **404**, and so is a
 *    caller naming a workspace that does not exist: same status, same frozen
 *    `READ_NOT_FOUND_BODY`, same headers down to `content-length` (7.119). A 403
 *    for the first would confirm the workspace exists to somebody with no
 *    business knowing it does.
 * 3. A member who may see nothing gets **200 with an empty `items`** (7.120).
 *    The emptiness is the visibility predicate answering, not the door.
 *
 * There is no 400 cell: `workspaceId` is a PATH segment, so a request that omits
 * it does not match this route at all.
 *
 * ## `requireSession` by parameter, and `now` by dependency
 *
 * The plan's signature is `(app, { pool, auth })` and its snippet imports
 * `makeRequireSession` from `../auth/routes.js`, which exports no such thing.
 * This follows the shape every route on this branch has instead: the preHandler
 * arrives as an argument, so there is no version of this registration that
 * forgets the session check and still compiles.
 *
 * `now` is the one dependency this route has that its neighbours do not, and it
 * defaults here, and **this is no longer the only place it defaults.** Task 15's
 * `registerStreamRoute` has its own `deps.now ?? (() => new Date())` for the
 * heartbeat deadline, and `ingest-service.ts` has had one since before this
 * branch. `buildApp` threads the SAME optional `deps.now` to both routes, so
 * pinning it pins both and leaving it unset gives both the wall clock — there is
 * no drift today. **But there is no single definition to change**, so anyone
 * replacing "the real clock" here must change the stream route in the same
 * breath or the server keeps two of them.
 */
export function registerAttentionRoutes(
  app: FastifyInstance,
  deps: { pool: Queryable; now?: () => Date },
  requireSession: preHandlerHookHandler,
): void {
  const now = deps.now ?? ((): Date => new Date());
  app.get<{ Params: { workspaceId: string } }>(
    '/v1/workspaces/:workspaceId/attention',
    { preHandler: requireSession },
    async (request, reply) => {
      const { workspaceId } = request.params;
      const viewerId = request.currentUserId;

      const eff = await requireMember(deps.pool, viewerId, workspaceId);
      if (eff === null) {
        return reply.status(404).send(READ_NOT_FOUND_BODY);
      }

      return readAttention(deps.pool, eff, viewerId, workspaceId, now());
    },
  );
}
