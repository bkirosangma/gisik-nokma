import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import {
  filterSpecSchema,
  searchTermSchema,
  type FilterSpec,
  type SearchHit,
  type SearchResponse,
} from '@gisik-nokma/domain';
import type { Queryable } from '../db/queryable.js';
import type { EffectiveRole } from '../permissions/effective-role.js';
import { BLOCKED_STATES_CTE, compileFilterSpec } from '../read/compile-filter.js';
import { FTS_CONFIG } from '../read/fts.js';
import { READ_NOT_FOUND_BODY, requireMember } from '../read/membership.js';
import { SqlParams } from '../read/sql-params.js';
import { assembleTicketCards, PROJ_TICKET_COLUMNS, type ProjTicketRow } from '../read/ticket-cards.js';
import { visibleTicketsWhere } from '../read/visible-where.js';

/**
 * The size of the answer. Fifty, no pagination — pinned by the plan's Open
 * questions, and it is a CUT rather than a page: there is no cursor, so the
 * fifty-first match is not reachable by asking again. Narrow the query.
 */
const SEARCH_LIMIT = 50;

/** The snippet window `ts_headline` is asked for. */
const HEADLINE_OPTIONS = 'StartSel=**, StopSel=**, MaxWords=18, MinWords=6';

/**
 * A workspace's full text, filtered to what this caller may see, ranked, cut.
 *
 * Exported beside the route for the reason `readBoard` and `readList` are: the
 * route is a shell — URL in, gate, this function, JSON out — and the gate's
 * output (`EffectiveRole`) is the only thing that decides what this returns.
 *
 * ## This is the first CROSS-PROJECT read on the branch, and it changes the sums
 *
 * The board and the list were scoped to ONE project the caller had already been
 * authorised for, so `t.project_id` carried most of the boundary and each route
 * says, honestly, that its `t.workspace_id` clause could not be falsified by any
 * state the shipped door can produce. Neither is true here. This query spans a
 * workspace, so exactly two conjuncts stand between a caller and every ticket in
 * the tenancy — and, if the workspace scope slips, every ticket in every OTHER
 * tenancy too:
 *
 * - **`t.workspace_id = $n`** — and here it is FALSIFIABLE, for the first time.
 *   For a plain member `visibleTicketsWhere` compiles to a disjunction whose
 *   first arm is `v.resolved_mode = 'workspace'`, and a workspace-mode ticket in
 *   a NEIGHBOURING workspace satisfies it. So without this clause one tenant's
 *   member reads another tenant's ticket. `test/routes/search.test.ts` case 7.93
 *   is that row, with the neighbour's own 200 beside it as the positive control.
 *   MEASURED: widening this clause to `OR TRUE` reddens 7.93 naming the
 *   neighbour's ticket id.
 * - **`visibleTicketsWhere`** — Plan 4's decision table, CONSUMED and never
 *   re-expressed. Task 5 spent a review making that predicate the single SQL
 *   expression of the table; a second spelling here would undo it.
 *
 * The workspace id itself is NOT the actor's word for it. It arrives in the
 * query string, but the only thing that makes it usable is `requireMember`
 * answering with a role IN that workspace — a caller who names a workspace they
 * do not belong to gets the same 404 as one who names a workspace that does not
 * exist. The predicate below is therefore scoped by a membership fact, and the
 * string the caller sent is only how they pointed at it.
 *
 * ## What the fifty counts, and what nothing else does
 *
 * Every conjunct is applied in one WHERE — workspace, visibility, text match,
 * and the compiled filter — so the matched set IS (workspace ∩ visible ∩ match ∩
 * filter). The ranking and the LIMIT then apply to THAT set, which is the whole
 * difference between the fifty rows this route returns and the fifty rows a
 * route that cut first and filtered afterwards would return. Case 7.96 is that
 * distinction as a fixture: sixty matching tickets of which five are invisible
 * to the caller and all five inside the first fifty by id. Cut-then-filter
 * answers forty-five, this answers fifty.
 *
 * **No aggregate is emitted at all.** `SearchResponse` is `{workspaceId, query,
 * hits}` — no total, no "did you mean", no result count — so there is no derived
 * number that could be counting a different population from the rows beside it.
 * The rank is not emitted either, and that is deliberate rather than incidental:
 * `ts_rank_cd` is a lexical statistic, and printing it beside a card would put a
 * number on the page that looks like a measurement of relevance nobody claimed
 * (the series' "nothing invented" invariant). It orders the answer and stops
 * there.
 *
 * `ts_rank_cd` also reads nothing but the row's own vector and the query — no
 * corpus statistic, no document-frequency term — so the ORDER of the rows does
 * not change when the population does. That is why the "match before or after
 * the filter" question has no observable answer here beyond the cut: the planner
 * may evaluate the conjuncts in either order and every value this route emits is
 * a function of the row it is on.
 *
 * ## The snippet is per-row, which is what makes it safe
 *
 * `ts_headline` is given ONE row's own three text columns, on a row that has
 * already satisfied the visibility predicate — the invisible rows are not in the
 * result set, so their text is never a string this function holds. A query that
 * matches both a visible and an invisible row therefore marks only the visible
 * one's words. Case 7.96 sends exactly that query (`wombat`, matching fifty
 * visible rows, while `aardvark` sits in the invisible rows' comments) and case
 * 7.24 sends the planted `zebra-confidential` one.
 *
 * The three columns are joined with an em-dash separator, so a snippet can show
 * a title, a description and a comment of the SAME ticket in one window. That is
 * the point of indexing comments: a comment is where people put what they would
 * not put in a title.
 *
 * ## `s.workspace_id = t.workspace_id`, and what it is worth
 *
 * The join is on `ticket_id`, which is `proj_search`'s primary key and globally
 * unique, so a consistent pair of projections cannot produce a row this
 * correlation excludes and `t.workspace_id` has already scoped the caller.
 * It is here because `compile-filter.ts` states the invariant that every clause
 * reaching ANOTHER table carries its own correlation, and `proj_search` is
 * another table — a search row filed under the wrong workspace is projection
 * DRIFT, not a door-reachable state. Stated the way `readList` states its own:
 * NO TEST HERE CAN REDDEN by deleting it, it costs nothing, and it is the clause
 * that must be there on the day such a row exists. Do not let it read as covered.
 */
export async function readSearch(
  db: Queryable,
  eff: EffectiveRole,
  viewerId: string,
  workspaceId: string,
  query: string,
  spec: FilterSpec,
): Promise<SearchResponse> {
  const params = new SqlParams();
  const where = [
    `t.workspace_id = ${params.add(workspaceId)}`,
    's.workspace_id = t.workspace_id',
    visibleTicketsWhere(eff, viewerId, params),
  ];
  // ONE evaluation, spliced three times — the match, the ranking and the
  // snippet all ask the same question, and asking `params.add` again would bind
  // the same string a second time for no reason. The `$n` it carries addresses
  // the same parameter wherever it appears.
  const tsquery = `websearch_to_tsquery('${FTS_CONFIG}', ${params.add(query)})`;
  where.push(`s.tsv @@ ${tsquery}`);

  const compiled = compileFilterSpec(spec, params);
  where.push(...compiled.clauses);

  const cte = compiled.needsBlockedCte ? `WITH ${BLOCKED_STATES_CTE} ` : '';
  // `matched_in` is typed as the UNION rather than `string`, and that is what
  // makes the wire contract checkable: the CASE below can only produce these
  // three literals, so the column's real type is the domain's `SearchHit
  // ['matchedIn']`. Typed loosely, this row type let the route return a field
  // the domain's own `SearchHit` did not declare — the compiler waved it through
  // because a `.map()` result is not a fresh object literal in that position.
  const { rows } = await db.query<
    ProjTicketRow & { snippet: string; matched_in: SearchHit['matchedIn'] }
  >(
    `${cte}SELECT ${PROJ_TICKET_COLUMNS},
            ts_headline('${FTS_CONFIG}',
                        s.title || ' — ' || s.description || ' — ' || s.comments,
                        ${tsquery}, '${HEADLINE_OPTIONS}') AS snippet,
            -- DOOR: WHICH COLUMN MATCHED, derived rather than guessed.
            --
            -- proj_search already stores the three columns separately and its
            -- generated tsv already weights them apart
            -- (setweight(… A) || setweight(… B) || setweight(… C)), so
            -- the distinction has always been IN THE DATA — the headline above
            -- is what threw it away, by concatenating the three into one string
            -- before ts_headline ever saw them.
            --
            -- ## Why per-column predicates and not three headlines
            --
            -- Three ts_headline calls would answer the same question, and
            -- would cost three passes over the row's text plus three ways for
            -- the snippet to disagree with the field. One @@ per column asks
            -- exactly "did THIS column match" and nothing else.
            --
            -- **setweight(…) @@ q is equivalent to to_tsvector(…) @@ q**: the
            -- weights affect RANKING, never MATCHING. So these three predicates
            -- partition the very vector the WHERE clause already tested, and at
            -- least one of them is therefore true for every row returned. The
            -- ELSE 'title' is unreachable and kept as a floor rather than as
            -- a case — see the test that asserts this partition.
            --
            -- ## The PRECEDENCE is the schema's own, and it is load-bearing
            --
            -- A query can match two columns and matchedIn is ONE value, so the
            -- order is a decision: **title → description → comment**, which is
            -- the order the weights already imply (A, B, C). Stating it in the
            -- CASE is what makes it a rule rather than an accident of how the
            -- expression happened to be written.
            CASE
              WHEN to_tsvector('${FTS_CONFIG}', s.title) @@ ${tsquery} THEN 'title'
              WHEN to_tsvector('${FTS_CONFIG}', s.description) @@ ${tsquery} THEN 'description'
              WHEN to_tsvector('${FTS_CONFIG}', s.comments) @@ ${tsquery} THEN 'comment'
              ELSE 'title'
            END AS matched_in
       FROM proj_search s
       JOIN proj_tickets t ON t.ticket_id = s.ticket_id
       JOIN proj_visibility v ON v.ticket_id = t.ticket_id
      WHERE ${where.join(' AND ')}
      ORDER BY ts_rank_cd(s.tsv, ${tsquery}) DESC, t.ticket_id
      LIMIT ${params.add(SEARCH_LIMIT)}`,
    params.toArray(),
  );

  const cards = await assembleTicketCards(db, viewerId, rows);
  // Keyed by a Map and not by an object literal: these ids come out of the
  // ledger, and an object indexed by data assigns `__proto__` through an
  // accessor that swallows it. A Map has no such key.
  const cardById = new Map(cards.map((card) => [card.ticketId, card]));

  return {
    workspaceId,
    query,
    hits: rows.map((row) => {
      const card = cardById.get(row.ticket_id);
      if (card === undefined) {
        // `assembleTicketCards` returns one card per row it was given and
        // throws rather than skipping, so this is unreachable — and it is a
        // throw rather than a filter for the same reason that function gives:
        // a card silently missing from an answer is the same lie with a longer
        // fuse. No test constrains it; reported as unconstrained.
        throw new Error(
          `readSearch: no card assembled for ticket ${row.ticket_id} — assembleTicketCards dropped a row it was handed`,
        );
      }
      // `matchedIn` joins the hit beside the snippet it explains. It is served
      // rather than left for the client to guess — a client that inferred
      // 'title' because that is the commonest case would be inventing the answer
      // to the one question the field asks, which is exactly why the client
      // REFUSED this route until the query could say.
      return { card, snippet: row.snippet, matchedIn: row.matched_in };
    }),
  };
}

/**
 * `GET /v1/search?workspaceId=&q=&filter=`.
 *
 * ## The gate, in Task 8's order, with the one deviation this route forces
 *
 * 1. `requireSession` (the preHandler) — no session, and a forged bearer alike,
 *    are **401** and the handler never runs.
 * 2. `requireMember` — a caller who is not a member of the named workspace is
 *    **404**, and so is a caller naming a workspace that does not exist: same
 *    status, same frozen `READ_NOT_FOUND_BODY`, same headers. A 403 for the
 *    first would confirm the workspace exists to somebody with no business
 *    knowing it does.
 * 3. Only then are `q` and `filter` parsed, and a malformed one is a named
 *    **400**. Case 7.98 pins it: a stranger sending each of the four things a
 *    member gets a 400 for gets the 404 instead, so the query parser is not a
 *    surface an outsider can reach.
 *
 * A workspace member who may see nothing passes the gate and gets **200** with
 * `hits: []`. The gate asks about the WORKSPACE; what is inside it is the
 * visibility predicate's answer, not the door's (case 7.97).
 *
 * **The deviation: `workspaceId` is read before the door, because it IS the
 * door's question.** Every other route on this branch takes its scope from the
 * path; this one takes it from the query string, so "the door answers before the
 * query string is parsed" cannot be literally true here. What is true, and what
 * is measured, is narrower: the only query parameter read before the gate is the
 * one the gate consumes, and it is read as an existence-and-type check rather
 * than parsed for meaning. An ABSENT or empty `workspaceId` is a **400**, not a
 * 404 — it names no workspace, so there is no membership question to answer and
 * nothing it could disclose. Case 7.100 measures that rather than asserting it:
 * a member and a stranger get the identical 400, headers included, and an
 * anonymous caller still gets the 401.
 *
 * ## `q` is THE text term
 *
 * A `filter` carrying its own `text` key is refused `invalid_filter` rather than
 * merged or ignored. Two text terms would make a result set unexplainable — the
 * caller sees rows matching an intersection they can only half see — and
 * ignoring one silently would answer a question nobody asked. Both are validated
 * by `searchTermSchema`, the one statement of what a search term is, so the two
 * doors cannot drift on length or on the NUL byte.
 *
 * ## Every query value is checked for its TYPE, not just its presence
 *
 * `?q=a&q=b` arrives as an ARRAY, not a string. `searchTermSchema.safeParse`
 * refuses it outright; `workspaceId` and `filter` are typeof-checked for the
 * same reason. Without that, an array `workspaceId` would be bound into a text
 * comparison and answer 500 to a request the door should have refused (case
 * 7.101).
 *
 * ## `requireSession` by parameter, not `auth` by dependency
 *
 * The plan's signature is `(app, { pool, auth })` and its snippet imports
 * `makeRequireSession` from `../auth/routes.js`, which exports no such thing.
 * This follows the shape every route on this branch has instead: the preHandler
 * arrives as an argument, so there is no version of this registration that
 * forgets the session check and still compiles — a route reading
 * `request.currentUserId` cannot be assembled without the thing that sets it.
 */
export function registerSearchRoutes(
  app: FastifyInstance,
  deps: { pool: Queryable },
  requireSession: preHandlerHookHandler,
): void {
  app.get<{ Querystring: { workspaceId?: string; q?: string; filter?: string } }>(
    '/v1/search',
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

      const q = searchTermSchema.safeParse(raw.q);
      if (!q.success) {
        // The zod issue list is deliberately NOT echoed, exactly as the list
        // route does not echo it: it names the schema's own field paths and,
        // for a refused value, the value itself — a refusal that quotes what it
        // refused is a mirror an attacker can aim.
        return reply.status(400).send({ error: 'invalid_query' });
      }

      let spec: FilterSpec = {};
      if (raw.filter !== undefined) {
        if (typeof raw.filter !== 'string') {
          return reply.status(400).send({ error: 'invalid_filter' });
        }
        let parsed: unknown;
        try {
          parsed = JSON.parse(raw.filter);
        } catch {
          return reply.status(400).send({ error: 'invalid_filter' });
        }
        const validated = filterSpecSchema.safeParse(parsed);
        if (!validated.success) {
          return reply.status(400).send({ error: 'invalid_filter' });
        }
        if (validated.data.text !== undefined) {
          return reply.status(400).send({ error: 'invalid_filter' });
        }
        spec = validated.data;
      }

      return readSearch(deps.pool, eff, viewerId, raw.workspaceId, q.data, spec);
    },
  );
}
