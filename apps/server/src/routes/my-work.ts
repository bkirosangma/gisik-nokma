import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import { visibleProjects } from '../read/visible-projects.js';
import type { MyWorkResponse, StateCategory, TicketCard } from '@gisik-nokma/domain';
import type { Queryable } from '../db/queryable.js';
import type { EffectiveRole } from '../permissions/effective-role.js';
import { READ_NOT_FOUND_BODY, requireMember } from '../read/membership.js';
import { SqlParams } from '../read/sql-params.js';
import { assembleTicketCards, PROJ_TICKET_COLUMNS, type ProjTicketRow } from '../read/ticket-cards.js';
import { visibleTicketsWhere } from '../read/visible-where.js';

/**
 * Assigned-to-me across every project in ONE workspace, grouped by state
 * category, cards in `ticket_id` order.
 *
 * ## This is the first read whose FILTER is also its security boundary
 *
 * The board, the list and the builder surface answered "what is in this
 * container", named in the URL; search answered "what in this workspace matches
 * these words". In all of them the caller's identity only NARROWED an answer
 * whose subject was something else. Here the subject IS the caller — "what is
 * mine" — and that puts the viewer id in two roles at once:
 *
 * - it is the **filter**: `t.assignee_id = $n`;
 * - it is the **security boundary**: it is what `visibleTicketsWhere` compiles
 *   its explicit-list arm around, and what `requireMember` resolved the role
 *   from.
 *
 * So it may have exactly one source, and that source is the SESSION. This
 * function takes `viewerId` as a parameter and the route below passes
 * `request.currentUserId` — never a query parameter, never a path segment,
 * never a header the caller controls. There is no version of this contract in
 * which a caller names whose work to read: a route that offered one would be a
 * read of another person's queue behind a 200, and the 404/401 door above it
 * would be answering about the wrong person entirely.
 *
 * That the shipped route DECLARES no such parameter is not the same as it not
 * reading one — Fastify hands the handler every query key that arrives,
 * declared or not. `test/routes/my-work.test.ts` case 7.105 is therefore an
 * executed proof rather than an appeal to the signature: it sends `userId`,
 * `user_id`, `assigneeId`, `viewerId` and `as`, all naming the owner, from the
 * member's session, and pins the response byte-for-byte (headers included)
 * against the request that sends none.
 *
 * ## Assignment is not visibility, and both conjuncts are here for that reason
 *
 * `t.assignee_id = $n` says a claim was made about this person. It says nothing
 * about whether they may READ the row, and the two come apart in four reachable
 * ways this route is measured against: a ticket explicitly shared with somebody
 * else, a project-mode ticket in a project the assignee is not on, an assignee
 * REMOVED from that project afterwards, and an audience narrowed by a later
 * `visibility.set`. Every one of them is a row that satisfies the assignee
 * clause and must not appear, so `visibleTicketsWhere` is not a second gate
 * behind the door — it is half of what makes the answer correct.
 *
 * It is CONSUMED, never re-expressed: Task 5 spent a review making that
 * predicate the single SQL statement of Plan 4's decision table, and a second
 * spelling here would undo it. The same goes for `PROJ_TICKET_COLUMNS` and
 * `assembleTicketCards` — a card assembled differently here would be a card the
 * board and the list do not agree with.
 *
 * ## The workspace clause is the only tenancy this query has
 *
 * `visibleTicketsWhere` carries none of its own and says so: for an owner it
 * compiles to `TRUE`. So for that caller `t.workspace_id = $n` is the whole
 * boundary between them and every ticket assigned to them ANYWHERE, in any
 * tenancy. Falsifiable and falsified: case 7.106 seeds a ticket in the
 * neighbour workspace assigned to this workspace's owner, reads it back from
 * `proj_tickets` to prove the row exists, and asserts it is not in the answer.
 *
 * The workspace id arrives in the query string, but the caller's word for it is
 * not what makes it usable — `requireMember` answering with a role IN that
 * workspace is. A caller naming a workspace they do not belong to gets the same
 * 404 as one naming a workspace that does not exist.
 *
 * ## SCOPE: one workspace, pinned
 *
 * Cross-workspace aggregation is a client concern — one call per workspace —
 * which is the plan's pin and is kept. It is a real decision rather than an
 * omission: an aggregate over "every workspace this session holds" would have
 * to resolve a role per workspace and then explain, in a single flat list, which
 * tenancy each card came from. The response names one `workspaceId` instead, so
 * every card in it is answerable to one membership fact.
 *
 * ## No clock is read
 *
 * The grouping key is `state_category`, a column. Cards carry a `dueDate` claim
 * and two provenance timestamps, both rendered by `toISOString()`, and nothing
 * here compares either to `now` — so no IST day arithmetic applies and no
 * `TZ`-varying test of this route could fail. Task 12's attention strip is where
 * that binds.
 *
 * ## EXTENSION POINT (Plan 10): what deliberately is NOT served here
 *
 * The spec's My Work also lists "my claims in transit" and "my contested
 * claims". Claims in transit are client-local — they live in the replica's
 * outbox and are merged into this view by Plan 6's `DataSource`, never served
 * from a server that by definition has not received them. Contested claims
 * become `claim.contested` ledger events (coordination amendment 16) and Plan 10
 * extends `MyWorkResponse` with an additive `contested` key read from those
 * events. The shape here nests the cards under `groups` precisely so that key
 * can arrive beside it without reshaping anything a client already parses.
 */
export async function readMyWork(
  db: Queryable,
  eff: EffectiveRole,
  viewerId: string,
  workspaceId: string,
): Promise<MyWorkResponse> {
  const params = new SqlParams();
  const where = [
    `t.workspace_id = ${params.add(workspaceId)}`,
    `t.assignee_id = ${params.add(viewerId)}`,
    visibleTicketsWhere(eff, viewerId, params),
  ];
  const { rows } = await db.query<ProjTicketRow>(
    `SELECT ${PROJ_TICKET_COLUMNS}
       FROM proj_tickets t
       JOIN proj_visibility v ON v.ticket_id = t.ticket_id
      WHERE ${where.join(' AND ')}
      ORDER BY t.ticket_id`,
    params.toArray(),
  );

  const groups: MyWorkResponse['groups'] = { open: [], active: [], terminal: [] };
  for (const card of await assembleTicketCards(db, viewerId, rows)) {
    bucketFor(groups, card).push(card);
  }

  // NAMES ONLY, and only for projects this viewer may be told the name of
  // (rulings P32/P38). A card the viewer can see always carries its
  // `projectId`; what is withheld is the NAME, so an item whose project is not
  // in this map renders as id-only — the existence-without-title register
  // `routes/tickets.ts` already uses for a restricted parent, one level up.
  //
  // A separate MAP rather than a `projectName` on the card, because
  // `TicketCard` is shared by the board, the list, search and attention: adding
  // a field there would put this decision on four other routes that never asked
  // the question. Additive here, so a client that ignores it is unaffected.
  const names = new Map(
    (await visibleProjects(db, eff, workspaceId)).map((project) => [project.projectId, project.name]),
  );
  const projectNames: Record<string, string> = {};
  for (const bucket of [groups.open, groups.active, groups.terminal]) {
    for (const card of bucket) {
      const name = names.get(card.projectId);
      // Only the projects these cards are actually in. Emitting the viewer's
      // whole visible set here would disclose project names through a door
      // nobody asked that question of.
      if (name !== undefined) projectNames[card.projectId] = name;
    }
  }
  return { workspaceId, groups, projectNames };
}

/**
 * The group a card belongs in, chosen by a bare `switch` rather than by
 * `groups[card.stateCategory]`.
 *
 * The difference is not style. `stateCategory` is read off a database column, so
 * indexing an object literal with it is an object indexed by DATA — the shape
 * that makes `__proto__` resolve through an accessor and hand back
 * `Object.prototype` (no own key created, and `.push` on it pollutes every
 * object in the process) and `toString` hand back a function. A `switch` names
 * the three keys it will use and cannot be steered into a fourth.
 *
 * Two things then have to be said honestly about how much that is worth here:
 *
 * - **The store already refuses a fourth value.** `proj_tickets.state_category`
 *   is `text NOT NULL` under `CHECK (state_category IN ('open','active',
 *   'terminal'))`, so there is no row this switch could be asked about. Case
 *   7.109 EXECUTES that rather than citing it: four rogue values, `__proto__`
 *   and `toString` among them, are refused by the constraint, with a legal
 *   update to the same row as the positive control that the statement itself
 *   reaches something. So this is defence in depth, and the CHECK is what is
 *   actually load-bearing.
 * - **The `throw` below is unconstrained by any test** and is reported as such.
 *   It is reachable only if that CHECK is dropped or the column type widens. It
 *   is a throw rather than a silent skip for the reason `assembleTicketCards`
 *   gives about its own: a card missing from an answer is the same lie with a
 *   longer fuse.
 *
 * The `switch` is bare — no `default` — so a fourth `StateCategory` added to the
 * domain union is a COMPILE error (TS2366: not all code paths return a value)
 * rather than a runtime guess, exactly as `visibleTicketsWhere` and
 * `canSeeResolved` walk `WorkspaceRole`. The `throw` sits after the switch and
 * does not quiet that: it is reached only when the runtime value is outside the
 * type altogether.
 */
function bucketFor(groups: MyWorkResponse['groups'], card: TicketCard): TicketCard[] {
  const category: StateCategory = card.stateCategory;
  switch (category) {
    case 'open':
      return groups.open;
    case 'active':
      return groups.active;
    case 'terminal':
      return groups.terminal;
  }
  throw new Error(
    `readMyWork: ticket ${card.ticketId} carries state category ${JSON.stringify(category)}, which proj_tickets_state_category_check should have made impossible`,
  );
}

/**
 * `GET /v1/me/work?workspaceId=`.
 *
 * ## The gate, in Task 8's order, with search's one deviation
 *
 * 1. `requireSession` (the preHandler) — no session, and a forged bearer alike,
 *    are **401 `{error:'unauthenticated'}`** and the handler never runs. Case
 *    7.110, with the same URL answering 200 once a real session is attached.
 * 2. `requireMember` — a caller who is not a member of the named workspace is
 *    **404**, and so is a caller naming a workspace that does not exist: same
 *    status, same frozen `READ_NOT_FOUND_BODY`, same headers down to
 *    `content-length` (case 7.111). A 403 for the first would confirm the
 *    workspace exists to somebody with no business knowing it does.
 * 3. A workspace member with nothing assigned, or nothing VISIBLE assigned, gets
 *    **200** with three empty groups. The gate asks about the workspace; what is
 *    inside it is the visibility predicate's answer, not the door's.
 *
 * **The deviation, inherited from `routes/search.ts`: `workspaceId` is read
 * before the door, because it IS the door's question.** It is read as an
 * existence-and-type check, never parsed for meaning. An ABSENT, empty or
 * REPEATED `workspaceId` is a **400 `{error:'invalid_query'}`**, not a 404: it
 * names no workspace, so there is no membership question to answer and nothing
 * the refusal could disclose — which is why a member and a stranger get the
 * byte-identical 400 (case 7.112), while an anonymous caller sending the same
 * malformed request still gets the 401 from the preHandler above it.
 *
 * The `typeof` check is not decoration. `?workspaceId=a&workspaceId=b` arrives
 * as an ARRAY; without it, an array would be bound into a text comparison and
 * answer 500 to a request the door should have refused.
 *
 * ## `requireSession` by parameter, not `auth` by dependency
 *
 * The plan's signature is `(app, { pool, auth })` and its snippet imports
 * `makeRequireSession` from `../auth/routes.js`, which exports no such thing (it
 * lives in `../auth/require-session.ts`). This follows the shape every route on
 * this branch has instead: the preHandler arrives as an argument, so there is no
 * version of this registration that forgets the session check and still
 * compiles. On this route that is worth more than on any of its neighbours —
 * `request.currentUserId` is not merely read here, it is the entire subject of
 * the answer.
 */
export function registerMyWorkRoutes(
  app: FastifyInstance,
  deps: { pool: Queryable },
  requireSession: preHandlerHookHandler,
): void {
  app.get<{ Querystring: { workspaceId?: string } }>(
    '/v1/me/work',
    { preHandler: requireSession },
    async (request, reply) => {
      const raw = request.query;
      const viewerId = request.currentUserId;

      if (typeof raw.workspaceId !== 'string' || raw.workspaceId.length === 0) {
        return reply.status(400).send({ error: 'invalid_query' });
      }
      const eff = await requireMember(deps.pool, viewerId, raw.workspaceId);
      if (eff === null) {
        return reply.status(404).send(READ_NOT_FOUND_BODY);
      }

      return readMyWork(deps.pool, eff, viewerId, raw.workspaceId);
    },
  );
}
