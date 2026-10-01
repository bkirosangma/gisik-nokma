import type { FastifyInstance, FastifyReply, preHandlerHookHandler } from 'fastify';
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
import { BLOCKED_STATES_CTE, compileFilterSpec, resolveMeInSpec } from '../read/compile-filter.js';
import { epicAncestors, type EpicOf } from '../read/ancestry.js';
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
 * `EPIC_RANK` and `MAX_ANCESTRY_DEPTH` were declared here until 2026-09-20, and
 * `epicAncestors`/`EpicOf` joined them at `read/ancestry.ts` on 2026-09-23
 * (owner request, board-card badges) — the board needed the SAME walk for its
 * epic chip, and `EPIC_RANK`'s own docblock already argued the reason a level
 * up: "two readers need the same number and they must not each spell it"
 * applies just as much to the function that reads the number as to the
 * number itself. Their own docblocks went with them; nothing this route
 * computes changed, only where the code that computes it lives.
 *
 * ⚠ A stale "MOVED to …" note with no code beneath it stood in this spot once
 * before and named a module that never existed — a pointer is not a
 * substitute for the thing it points at. The import below is what actually
 * resolves.
 */

export type ListQuery = {
  spec: FilterSpec;
  groupBy: Grouping;
  parentId?: string;
  cursor?: string;
  limit: number;
};

/**
 * One project's tickets — or, with `projectId === null`, the whole workspace's —
 * the caller's visible slice, filtered, ordered by
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
 * checkable. (With `projectId === null` — the workspace scope of
 * `GET /v1/workspaces/:workspaceId/ticket-list`, MCP CRUD plan Task 4 — the
 * first one is not a project clause but the exclusion of ARCHIVED projects'
 * tickets; the other three are unchanged and the caller is gated by
 * `requireMember` alone, there being no project to resolve.)
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
  projectId: string | null,
  query: ListQuery,
): Promise<ListResponse> {
  const params = new SqlParams();
  const where = [
    `t.workspace_id = ${params.add(workspaceId)}`,
    // The project scope names its project; the workspace scope (`projectId ===
    // null`, MCP CRUD plan Task 4) names none and instead leaves out the tickets
    // of ARCHIVED projects — an archived project is out of every list of live
    // work (`check-permission.ts:370-380`). Workspace scope ONLY: a project's own
    // list still shows its own tickets when it is archived (13.1164), and a
    // DELETED project's tickets are already gone via `LIVE_TICKET_WHERE` below.
    projectId !== null
      ? `t.project_id = ${params.add(projectId)}`
      : 'NOT EXISTS (SELECT 1 FROM proj_projects ap WHERE ap.project_id = t.project_id AND ap.archived)',
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
    // The workspace the request was authorised against, already a parameter of
    // this function. It is on the body because the client renders actor IDS as
    // names, and the roster it joins for that is keyed by workspace — see
    // `ListResponse.workspaceId`.
    workspaceId,
    // `null` for the workspace scope: no one project was read.
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

type ListQuerystring = { groupBy?: string; filter?: string; parentId?: string; cursor?: string; limit?: string };

/**
 * Everything AFTER the door, shared by the project route and the workspace
 * route: parse the query (a named 400 on a bad `groupBy`, `filter` or `limit`),
 * resolve `"me"`, read. The doors differ — a project route resolves the project's
 * workspace first, the workspace route has none to resolve — and nothing else
 * does, so a filter, a grouping or a page size cannot mean one thing on one route
 * and its sibling another.
 */
async function answerList(
  deps: { pool: Queryable },
  raw: ListQuerystring,
  reply: FastifyReply,
  eff: EffectiveRole,
  viewerId: string,
  workspaceId: string,
  projectId: string | null,
): Promise<ListResponse | FastifyReply> {
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
    // `"me"` → the caller, once, before the compiler (MCP CRUD plan FD12).
    spec = resolveMeInSpec(validated.data, viewerId);
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

    return answerList(deps, request.query, reply, eff, viewerId, workspaceId, projectId);
  });

  /**
   * `GET /v1/workspaces/:workspaceId/ticket-list` (MCP CRUD plan Task 4, owner
   * ruling M7, 2026-10-01): every project's visible tickets in one workspace,
   * with the project route's query parameters and `ListResponse` shape
   * (`projectId` is `null`).
   *
   * **Why not `/tickets`.** The plan named `GET /v1/workspaces/:workspaceId/tickets`,
   * but that path is Plan 4's visibility list — `{ tickets }`, `200 []` for an
   * outsider, a recorded ruling (`test-cases/16-remaining-doors.md`) with its own
   * suites — and a second handler on it would be a duplicate-route boot failure.
   * This is its sibling, and the old route is untouched.
   *
   * The gate is `requireSession` then `requireMember` alone: there is no
   * `workspaceOfProject` step (no project in the URL), and a non-member is the
   * same 404 body the project route answers, never an empty list. Visibility is
   * `readList`'s, exactly as on the project route.
   */
  app.get<{ Params: { workspaceId: string }; Querystring: ListQuerystring }>(
    '/v1/workspaces/:workspaceId/ticket-list',
    { preHandler: requireSession },
    async (request, reply) => {
      const { workspaceId } = request.params;
      const viewerId = request.currentUserId;
      const eff = await requireMember(deps.pool, viewerId, workspaceId);
      if (eff === null) {
        return reply.status(404).send(READ_NOT_FOUND_BODY);
      }
      return answerList(deps, request.query, reply, eff, viewerId, workspaceId, null);
    },
  );
}
