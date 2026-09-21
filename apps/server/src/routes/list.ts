import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import {
  filterSpecSchema,
  groupingSchema,
  statesWithBacklog,
  type FilterSpec,
  type Grouping,
  type ListCard,
  type ListGroup,
  type ListResponse,
} from '@gisik-nokma/domain';
import type { Queryable } from '../db/queryable.js';
import type { EffectiveRole } from '../permissions/effective-role.js';
import { BLOCKED_STATES_CTE, compileFilterSpec } from '../read/compile-filter.js';
import { EPIC_RANK, MAX_ANCESTRY_DEPTH } from '../read/ancestry.js';
import { READ_NOT_FOUND_BODY, requireMember, workspaceOfProject } from '../read/membership.js';
import { assembleListCards } from '../read/list-cards.js';
import { SqlParams } from '../read/sql-params.js';
import { assembleTicketCards, PROJ_TICKET_COLUMNS, type ProjTicketRow } from '../read/ticket-cards.js';
import { LIVE_TICKET_WHERE, visibleTicketsWhere } from '../read/visible-where.js';
import { latestWorkflowDefs } from '../read/workflow-defs.js';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

/** The key a card with no epic-rank ancestor-or-self falls into. */
const NO_EPIC = 'no-epic';

/**
 * `EPIC_RANK` and `MAX_ANCESTRY_DEPTH` were declared here until 2026-09-20 and
 * now live at `read/ancestry.ts`; their own docblocks went with them.
 *
 * ⚠ **THEY WERE CITED IN PROSE BY NAME HERE FOR ONE ROUND AFTER THE MOVE, AND
 * THAT WAS WORSE THAN A STALE LINE NUMBER.** What stood in this spot was two
 * "MOVED to …" notes with no code beneath them — one of them naming
 * `read/epic-rank.ts`, **a module that has never existed** (the file is
 * `read/ancestry.ts`) — so a reader following the signpost reached nothing, and
 * a reader grepping for the old constant found an explanation instead of a
 * definition. A pointer is not a substitute for the thing it points at; the
 * imports below are what actually resolve.
 */

export type ListQuery = {
  spec: FilterSpec;
  groupBy: Grouping;
  parentId?: string;
  cursor?: string;
  limit: number;
};

/**
 * One project's tickets: the caller's visible slice, filtered, ordered by
 * `ticket_id`, cut into keyset pages, and arranged into groups.
 *
 * Exported beside the route for the reason `readBoard` is: the route is a shell
 * — URL in, gate, this function, JSON out — and the gate's output
 * (`EffectiveRole`) is the only thing that decides what this returns. A test can
 * hand it a role directly; nothing it does depends on Fastify.
 *
 * ## The scope clauses, and which of them is falsifiable
 *
 * Four conjuncts stand between a caller and the table, and they are not equally
 * checkable:
 *
 * - `t.project_id` — the caller's URL parameter, but only AFTER
 *   `workspaceOfProject` resolved it to a workspace and `requireMember`
 *   confirmed the caller belongs to that workspace. Falsifiable: deleting it
 *   makes a project list into a workspace list and the sibling-project case
 *   reddens.
 * - `t.workspace_id` — supplied because `visibleTicketsWhere`'s docblock asks
 *   every caller to: the predicate deliberately carries no tenancy clause, and
 *   for an owner it compiles to `TRUE`. Stated honestly and identically to
 *   `readBoard`: with `project_id` already present this clause is NOT
 *   falsifiable by any state the shipped door can produce, because no reachable
 *   ledger writes a `proj_tickets` row whose project and workspace disagree
 *   (`checkProjectExists` refuses a `ticket.created` naming a foreign project at
 *   ingest). It costs one bound parameter and it is the query that must not show
 *   such a row on the day a projection bug produces one.
 * - `visibleTicketsWhere` — Plan 4's decision table, CONSUMED and not
 *   re-expressed. A second SQL spelling of a security rule is the defect Task 5
 *   spent a review eliminating; there is none here, and the epic walk below
 *   consumes the same expression rather than growing one of its own.
 * - `compileFilterSpec`'s clauses — every one a narrowing conjunct over `t`,
 *   every actor byte bound. Nothing a caller sends reaches SQL as an identifier;
 *   Task 2's allowlist of varying identifiers is the empty set and this route
 *   does not widen it.
 *
 * ## `parentId` and `cursor` are values, not keys
 *
 * Both arrive from the caller and both are bound. `parentId=root` is the one
 * spelling that is not a value at all — it selects `parent_id IS NULL`, and
 * `'root'` is not a ULID so it cannot collide with a ticket id. Neither can
 * widen: they are conjuncts added beside the visibility predicate, never
 * instead of it, so a cursor naming another tenancy's ticket or a ticket the
 * caller may not see is just a text comparison that narrows. The tests hand back
 * all three (foreign, invisible, hostile) and pin that.
 *
 * ## `limit + 1`, and why `nextCursor` is the last row of the PAGE
 *
 * The query asks for one row more than the page so that "is there a next page"
 * is an observation rather than a guess — a `nextCursor` emitted whenever the
 * page came back full would send every caller on one extra empty round trip at
 * the end of every list. The cursor itself is the last id of the page after the
 * overflow row is dropped, which is exactly the value `t.ticket_id > $n` needs.
 */
export async function readList(
  db: Queryable,
  eff: EffectiveRole,
  viewerId: string,
  workspaceId: string,
  projectId: string,
  query: ListQuery,
): Promise<ListResponse> {
  const params = new SqlParams();
  const where = [
    `t.workspace_id = ${params.add(workspaceId)}`,
    `t.project_id = ${params.add(projectId)}`,
    visibleTicketsWhere(eff, viewerId, params),
    // A soft-deleted ticket is in no view, and a list is a view. Beside the
    // visibility predicate, never folded into it — see `LIVE_TICKET_WHERE`.
    LIVE_TICKET_WHERE,
  ];
  const compiled = compileFilterSpec(query.spec, params);
  where.push(...compiled.clauses);
  if (query.parentId === 'root') {
    where.push('t.parent_id IS NULL');
  } else if (query.parentId !== undefined) {
    where.push(`t.parent_id = ${params.add(query.parentId)}`);
  }
  if (query.cursor !== undefined) {
    where.push(`t.ticket_id > ${params.add(query.cursor)}`);
  }

  const cte = compiled.needsBlockedCte ? `WITH ${BLOCKED_STATES_CTE} ` : '';
  const { rows } = await db.query<ProjTicketRow>(
    `${cte}SELECT ${PROJ_TICKET_COLUMNS}
       FROM proj_tickets t
       JOIN proj_visibility v ON v.ticket_id = t.ticket_id
      WHERE ${where.join(' AND ')}
      ORDER BY t.ticket_id
      LIMIT ${params.add(query.limit + 1)}`,
    params.toArray(),
  );

  const overflowed = rows.length > query.limit;
  const pageRows = rows.slice(0, query.limit);
  const cards = await assembleTicketCards(db, viewerId, pageRows);
  // The epic walk runs for EVERY grouping now, not only `groupBy=epic`.
  // `ListCard.epicId` is a field on every row, so computing it inside the
  // `case 'epic'` branch would have shipped it absent under the four other
  // groupings — including `flat`, which is the default and the one the client
  // contract suite reads. Its result is used twice: the ids become the field,
  // and the titles stay where they were, labelling the epic buckets.
  const epics = await epicAncestors(
    db,
    eff,
    viewerId,
    workspaceId,
    cards.map((card) => card.ticketId),
  );
  const listCards = await assembleListCards(
    db,
    viewerId,
    workspaceId,
    pageRows,
    cards,
    new Map([...epics].map(([ticketId, found]) => [ticketId, found.epicId])),
  );
  const groups = await groupCards(db, workspaceId, listCards, pageRows, query.groupBy, epics);

  return {
    projectId,
    groupBy: query.groupBy,
    groups,
    nextCursor: overflowed ? (pageRows[pageRows.length - 1]?.ticket_id ?? null) : null,
  };
}

/**
 * The page's cards, arranged.
 *
 * ## Grouping is applied PER PAGE, and that is pinned rather than accidental
 *
 * Pagination walks the flat matched set in `ticket_id` order; each page's rows
 * are then grouped, so a group key may recur on a later page and clients merge
 * by `key`. The alternative — group first, then page within groups — would make
 * a page boundary depend on the grouping, so the same cursor would mean
 * different things under `groupBy=status` and `groupBy=flat`.
 *
 * Grouping ARRANGES truth and never changes which tickets match. A case asserts
 * exactly that: every grouping of one project holds the same card ids.
 *
 * ## An empty page has NO groups
 *
 * Not one empty `all` bucket. A group is a bucket of cards, so a bucket with no
 * cards asserts that something is there to be looked in. This is what an
 * off-project member gets — `groups: []`, the list's spelling of the board's
 * `columns: []` — and it is the visibility predicate answering, not the door.
 * The plan text's snippet returned a hard-coded `all` group for `flat` before it
 * looked at the cards; that shape reports an empty project and a forbidden one
 * with the same non-empty structure.
 */
async function groupCards(
  db: Queryable,
  workspaceId: string,
  cards: ListCard[],
  rows: ProjTicketRow[],
  groupBy: Grouping,
  epics: Map<string, EpicOf>,
): Promise<ListGroup[]> {
  if (cards.length === 0) {
    return [];
  }

  switch (groupBy) {
    case 'flat':
      return [{ key: 'all', label: 'All tickets', cards }];

    case 'assignee':
      // The label is the id for a named assignee, deliberately: this route does
      // not read the user directory, and printing a display name it did not
      // fetch would be a label nobody claimed. `'unassigned'` is the one key
      // that is not an id, so it is the one that gets a word.
      return bucket(cards, (card) => card.assigneeId ?? 'unassigned', (key) =>
        key === 'unassigned' ? 'Unassigned' : key,
      );

    case 'type':
      // Same rule: the type's human name lives on `proj_ticket_types` and is a
      // read this route does not need, so the label is the id it grouped on
      // rather than a name invented here. Task 9b owns the type roster read.
      return bucket(cards, (card) => card.typeId, (key) => key);

    case 'status': {
      // Keyed on `${workflowId}:${stateId}` because a state id is only unique
      // WITHIN its workflow — two workflows may both carry `waiting`, and a bare
      // state id would merge them into one group. `latestWorkflowDefs` takes the
      // resolved workspace id (ruling P14) so a workflow id read off a ticket
      // row cannot resolve out of a neighbouring tenancy; an id it does not know
      // is ABSENT from the map, and the label then falls back to the state id
      // rather than inventing a name.
      const defs = await latestWorkflowDefs(
        db,
        workspaceId,
        rows.map((row) => row.workflow_id),
      );
      return bucket(
        cards,
        (card) => `${card.workflowId}:${card.stateId}`,
        (key) => {
          const separator = key.indexOf(':');
          const workflowId = key.slice(0, separator);
          const stateId = key.slice(separator + 1);
          // `statesWithBacklog(def)`, not `def.states` (backlog/closed spec
          // §1.4/§3.2, 2026-09-17; fix round 2): `backlog` is the universal
          // state every workflow carries WITHOUT declaring it, so a bare
          // `def.states.find` never finds it and this label fell back to the
          // bare id `'backlog'` instead of the name `'Backlog'` — the `??
          // stateId` fallback stays for a genuinely unknown id (an absent
          // `def`, or a state neither list carries).
          const def = defs.get(workflowId);
          const state = def === undefined ? undefined : statesWithBacklog(def).find((candidate) => candidate.id === stateId);
          return state?.name ?? stateId;
        },
      );
    }

    case 'priority':
      // The sixth grouping (priority built-in, spec 2026-09-22). Same shape as
      // `type` above: the key AND the label are both the level, because this
      // route reads no ladder vocabulary and printing a name it did not fetch
      // would be a label nobody claimed. `bucket` sorts its keys and P1/P2/P3
      // sort as strings exactly as the ladder orders them, so the buckets come
      // out P1, P2, P3 without this route importing `PRIORITIES` — the client
      // owns the ladder and this route owns only the partition.
      //
      // This arm is required for EXHAUSTIVENESS, not merely for the value: the
      // door validates `groupBy` with the shared `groupingSchema`, so 'priority'
      // became an accepted input the moment `GROUPINGS` grew it. A switch with
      // no arm for it fell through to `undefined` — a 200 whose body carried no
      // `groups` at all, which is worse than the compile error it also caused.
      return bucket(
        cards,
        (card) => card.priority.value,
        (key) => key,
      );

    case 'epic':
      // The walk moved to `readList` (it feeds `ListCard.epicId` under every
      // grouping); the key is now read off the card the walk already filled, so
      // the bucket and the field cannot disagree. Titles still come from the
      // walk's own rows, which is what keeps a label to a ticket this predicate
      // admitted.
      return bucket(
        cards,
        (card) => card.epicId ?? NO_EPIC,
        (key) => (key === NO_EPIC ? 'No epic' : (titleOfEpic(epics, key) ?? key)),
      );
  }
}

function titleOfEpic(epics: Map<string, EpicOf>, epicId: string): string | undefined {
  for (const found of epics.values()) {
    if (found.epicId === epicId) {
      return found.title;
    }
  }
  return undefined;
}

/**
 * Cards into buckets, buckets out in sorted key order.
 *
 * The ORDER is a function of the data and not of which row the database returned
 * first: keys sorted, and each bucket keeping the `ticket_id` order the page
 * arrived in.
 */
function bucket(
  cards: ListCard[],
  keyOf: (card: ListCard) => string,
  labelOf: (key: string) => string,
): ListGroup[] {
  const buckets = new Map<string, ListCard[]>();
  for (const card of cards) {
    const key = keyOf(card);
    const existing = buckets.get(key);
    if (existing === undefined) {
      buckets.set(key, [card]);
    } else {
      existing.push(card);
    }
  }
  return [...buckets.keys()]
    .sort()
    .map((key) => ({ key, label: labelOf(key), cards: buckets.get(key) ?? [] }));
}

type EpicOf = { epicId: string; title: string };

/**
 * The nearest ancestor-or-self, of each card, whose ticket TYPE carries the epic
 * rank — and which the CALLER may see.
 *
 * ## Why the walk carries the visibility predicate
 *
 * A group's `key` is a ticket id and its `label` is that ticket's title. Both go
 * over the wire. So a walk that climbed the parent chain without asking Plan 4's
 * question would take a caller who may see a child, and hand them the id and the
 * TITLE of an ancestor they may not — a disclosure through the arrangement of
 * data rather than through the data itself.
 *
 * That shape is reachable and it is seeded: `proj_visibility` resolves a ticket's
 * audience from its OWN claim when it has one, so a child that authors
 * `explicit: [owner, member]` under a parent that authored `explicit: [owner]` is
 * an ordinary ledger, not a corruption. The planted-defect case pins it in both
 * directions — the member gets `no-epic`, the owner gets the epic as a key with
 * its title as the label.
 *
 * The predicate is `visibleTicketsWhere` again, the SAME expression the page
 * query uses, evaluated once and spliced into both the seed and the recursive
 * term of the CTE. Consumed, not re-expressed: one SQL statement of the decision
 * table remains on this branch.
 *
 * An invisible link therefore STOPS the walk rather than being climbed over.
 * That is deliberate: skipping past it to a visible grandparent would report a
 * grouping whose reason the caller cannot see, and it would leak the fact that
 * the chain continues. `no-epic` is what a caller who cannot see the answer gets.
 *
 * Recorded rather than decided here: the house style elsewhere for "there is
 * something you may not see" is `rollupFor`'s `restrictedCount`, which counts
 * without naming. A distinct `restricted-epic` bucket would carry that
 * information here too, and it is a product decision about a response shape
 * Plan 5's contract already pins — filed against the plan's Open questions,
 * owner to rule.
 *
 * ## Tenancy, and which of these clauses can be falsified
 *
 * `t.workspace_id` is bound in all three places for the reason `readList` gives
 * for its own copy, and with the same honesty: ruling P12's parent guard refuses
 * a `ticket.created` whose parent sits in another workspace, so no reachable
 * ledger produces a cross-tenancy parent link and NO TEST HERE CAN REDDEN by
 * deleting the clause from the recursive term. It stays because it costs one
 * already-bound parameter and because this walk is the one query that must not
 * follow such a link on the day one exists.
 *
 * The depth cap is termination, not policy: `reResolveSubtree` documents that
 * nothing on this branch refuses a cycle-creating reparent (case 6.58), and a
 * `WITH RECURSIVE` over a cyclic parent graph does not stop on its own.
 *
 * ## The title comes out of this query, not a second one
 *
 * The plan's `epicTitles` was a separate `WHERE ticket_id = ANY(...)` read with
 * no workspace clause and no visibility clause — a second door into the same
 * table, reached with ids the first door produced. Folding the title into the
 * walk means the only rows whose titles this route can print are rows this
 * predicate already admitted.
 *
 * A NULL title THROWS, for the reason `assembleTicketCards` throws: every
 * `ticket.created` writes `fields.title`, so its absence means `proj_tickets` and
 * the ledger disagree, and `''` would sit exactly where a real title goes. No
 * test constrains that throw — the door cannot produce the row — and it is
 * reported as unconstrained rather than left looking covered.
 */
async function epicAncestors(
  db: Queryable,
  eff: EffectiveRole,
  viewerId: string,
  workspaceId: string,
  ticketIds: string[],
): Promise<Map<string, EpicOf>> {
  if (ticketIds.length === 0) {
    return new Map();
  }

  const params = new SqlParams();
  const workspaceParam = params.add(workspaceId);
  const idsParam = params.add(ticketIds);
  // ONE evaluation, spliced twice. Calling it twice would bind the same values a
  // second time for no reason; the `$n` placeholders it returns address the same
  // parameters wherever they appear.
  const visible = visibleTicketsWhere(eff, viewerId, params);
  // THE SOFT-DELETE PREDICATE IS ON THE RECURSIVE MEMBER, and a deleted
  // ancestor ends the walk exactly as an invisible one does: the children fall
  // to `no-epic`, and the title never leaves the query (round-2 E6-11). This
  // paragraph used to call that an open question — the cascade ruling, "named,
  // not decided" — and it was decided in the same commit at the neighbouring
  // door: `routes/tickets.ts` answers `restricted` for a deleted PARENT because
  // *"the parent's TITLE is the deleted ticket's content, and the FAQ's 'stops
  // appearing in views' is exactly a statement about content"*, and search
  // withholds it too. The list was the one door of four still serving it — and
  // in the group HEADER (`titleOfEpic`, the `case 'epic'` label), not on the
  // card, which carries only `epicId` (`read/list-cards.ts`). The seed term
  // needs no copy of it: its rows are the page's own cards, which `readList`
  // already ANDs `LIVE_TICKET_WHERE` into.
  //
  // WHAT REMAINS OPEN, and it is the same question the docblock above already
  // files: whether a deleted (or invisible) ancestor should be a DISTINCT
  // `restricted-epic` bucket rather than `no-epic` is a response-shape decision
  // Plan 5's contract pins — owner to rule. Nothing here pre-empts it.
  const depthParam = params.add(MAX_ANCESTRY_DEPTH);
  const rankParam = params.add(EPIC_RANK);

  const { rows } = await db.query<{ start_id: string; epic_id: string; title: string | null }>(
    `WITH RECURSIVE ancestry AS (
       SELECT t.ticket_id AS start_id, t.ticket_id, t.parent_id, t.type_id, t.fields, 0 AS depth
         FROM proj_tickets t
         JOIN proj_visibility v ON v.ticket_id = t.ticket_id
        WHERE t.workspace_id = ${workspaceParam}
          AND t.ticket_id = ANY (${idsParam}::text[])
          AND ${visible}
       UNION ALL
       SELECT a.start_id, t.ticket_id, t.parent_id, t.type_id, t.fields, a.depth + 1
         FROM ancestry a
         JOIN proj_tickets t ON t.ticket_id = a.parent_id
         JOIN proj_visibility v ON v.ticket_id = t.ticket_id
        WHERE t.workspace_id = ${workspaceParam}
          AND a.depth < ${depthParam}
          AND ${visible}
          AND ${LIVE_TICKET_WHERE}
     )
     SELECT DISTINCT ON (start_id)
            start_id, ticket_id AS epic_id, fields -> 'title' ->> 'value' AS title
       FROM ancestry
      WHERE type_id IN (
            SELECT type_id FROM proj_ticket_types
             WHERE workspace_id = ${workspaceParam} AND rank = ${rankParam}
          )
      ORDER BY start_id, depth`,
    params.toArray(),
  );

  const epics = new Map<string, EpicOf>();
  for (const row of rows) {
    if (row.title === null) {
      throw new Error(
        `readList: no title claim on epic ${row.epic_id} — every ticket.created writes one, so proj_tickets and the ledger disagree`,
      );
    }
    epics.set(row.start_id, { epicId: row.epic_id, title: row.title });
  }
  return epics;
}

/**
 * `GET /v1/projects/:projectId/tickets`.
 *
 * ## The gate is Task 8's, in Task 8's order, and one step further
 *
 * 1. `requireSession` (the preHandler) — no session, and a forged bearer alike,
 *    are **401** and the handler never runs.
 * 2. `workspaceOfProject` — an unknown project id is **404**.
 * 3. `requireMember` — a caller who is not a member of THAT workspace is
 *    **404**, never 403, and byte-identical to the answer above: same status,
 *    same body object, same headers. A 403 would confirm the project exists to
 *    somebody with no business knowing it does. `test/routes/list.test.ts`
 *    compares bodies AND headers rather than checking one status twice.
 * 4. Only then is the QUERY parsed, and a malformed one is a named **400**.
 *
 * A workspace member who is NOT on the project passes the gate and gets **200**
 * with `groups: []`. The gate asks about the WORKSPACE, so a project's existence
 * is not a secret from somebody already inside the tenancy — its contents are,
 * and the emptiness is `visibleTicketsWhere` answering rather than the door.
 *
 * ## Step 4 comes AFTER the door, and that is a deviation from the plan text
 *
 * The plan's snippet validates `groupBy`, `filter` and `limit` first and resolves
 * the workspace afterwards. Both orders keep the 404 indistinguishable — a 400
 * is about the caller's own query string and is the same for every project id,
 * existing or not, so it discloses nothing either way. The order is reversed
 * anyway because it costs nothing and it means an unauthorised caller cannot
 * exercise the parser at all: the only answer they can obtain from this route is
 * the 404. Pinned by a case of its own (a stranger sending nonsense gets 404
 * where a member gets 400), which is this execution's own contract and not one
 * Task 8 established.
 *
 * ## `requireSession` by parameter, not `auth` by dependency
 *
 * The plan's signature is `(app, { pool, auth })` and its snippet imports
 * `makeRequireSession` from `../auth/routes.js`, which exports no such thing (it
 * is `../auth/require-session.js`). Rather than fix the import and keep the
 * shape, this follows the shape every route on this branch has: the preHandler
 * arrives as an argument, so there is no version of this registration that
 * forgets the session check and still compiles — a route reading
 * `request.currentUserId` cannot be assembled without the thing that sets it.
 */
export function registerListRoutes(
  app: FastifyInstance,
  deps: { pool: Queryable },
  requireSession: preHandlerHookHandler,
): void {
  app.get<{
    Params: { projectId: string };
    Querystring: { groupBy?: string; filter?: string; parentId?: string; cursor?: string; limit?: string };
  }>('/v1/projects/:projectId/tickets', { preHandler: requireSession }, async (request, reply) => {
    const { projectId } = request.params;
    const viewerId = request.currentUserId;

    const workspaceId = await workspaceOfProject(deps.pool, projectId);
    if (workspaceId === null) {
      return reply.status(404).send(READ_NOT_FOUND_BODY);
    }
    const eff = await requireMember(deps.pool, viewerId, workspaceId);
    if (eff === null) {
      return reply.status(404).send(READ_NOT_FOUND_BODY);
    }

    const raw = request.query;

    const groupBy = groupingSchema.safeParse(raw.groupBy ?? 'flat');
    if (!groupBy.success) {
      return reply.status(400).send({ error: 'invalid_grouping' });
    }

    let spec: FilterSpec = {};
    if (raw.filter !== undefined) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw.filter);
      } catch {
        return reply.status(400).send({ error: 'invalid_filter' });
      }
      const validated = filterSpecSchema.safeParse(parsed);
      if (!validated.success) {
        // The zod issue list is deliberately NOT echoed. It names the schema's
        // own field paths and, for a refused value, the value itself — a
        // refusal that quotes what it refused is a mirror an attacker can aim.
        return reply.status(400).send({ error: 'invalid_filter' });
      }
      spec = validated.data;
    }

    let limit = DEFAULT_LIMIT;
    if (raw.limit !== undefined) {
      // `Number` and not `parseInt`: `parseInt('2.5')` is 2 and `parseInt('9z')`
      // is 9, so a bound checked after parseInt would silently accept a limit
      // the caller did not write. `Number('2.5')` is 2.5 and fails the integer
      // test; `Number('9z')` is NaN and fails it too.
      limit = Number(raw.limit);
      if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
        return reply.status(400).send({ error: 'invalid_limit' });
      }
    }

    return readList(deps.pool, eff, viewerId, workspaceId, projectId, {
      spec,
      groupBy: groupBy.data,
      ...(raw.parentId === undefined ? {} : { parentId: raw.parentId }),
      ...(raw.cursor === undefined ? {} : { cursor: raw.cursor }),
      limit,
    });
  });
}
