import { BUILTIN_TICKET_TYPE_SEEDS } from '@gisik-nokma/domain';
import type { Queryable } from '../db/queryable.js';
import type { EffectiveRole } from '../permissions/effective-role.js';
import { composeCardKey } from './ticket-cards.js';
import { ticketNumbers } from './ticket-numbers.js';
import { projectPrefixesInWorkspace } from './visible-projects.js';
import { LIVE_TICKET_WHERE, visibleTicketsWhere } from './visible-where.js';
import { workspaceIdentityFromLedger } from '../workspaces/workspace-name.js';
import { SqlParams } from './sql-params.js';

/** How far up a parent chain an ancestry walk will climb before giving up. */
export const MAX_ANCESTRY_DEPTH = 32;

/**
 * The epic rank, READ FROM THE BUILT-IN SEED and never written as a literal `1`.
 *
 * Grouping by epic resolves the nearest ancestor-or-self whose TYPE carries this
 * rank, so a workspace that renamed its top rung — "Initiative", "Campaign" —
 * gets its own headings without asking anybody's permission (owner sign-off
 * 2026-08-20). The rank is the concept; `'epic'` is one id of it, and the
 * planted-defect case in `test/routes/list.test.ts` fails on a route that
 * matched the id.
 *
 * Looked up rather than indexed, and it THROWS rather than falling back: a
 * missing epic seed means the built-in ladder changed shape underneath this
 * module, and silently grouping everything into `no-epic` would be that change
 * arriving as a UI that lost its headings instead of as an error.
 *
 * A rank no seed carries cannot mean "no epic here": the walk would then group
 * every card under one heading, silently, which is the change arriving as a UI
 * that lost its headings rather than as an error. So this THROWS.
 *
 * ## Why this is a MODULE and no longer a local in `routes/list.ts`
 *
 * Two readers need the same number and they must not each spell it. The list
 * route groups a PAGE by it (`epicAncestors`, one recursive CTE), and the ticket
 * detail route walks a SINGLE ticket's ancestry with `canSee` per hop — a
 * different shape for a different question, reading the same rung. A second
 * `epicRank()` beside the first is the drift this repo names everywhere: two
 * expressions of one rule, free to disagree about which rung is the top one.
 */
export const EPIC_RANK: number = epicRank();

function epicRank(): number {
  const seed = BUILTIN_TICKET_TYPE_SEEDS.find((candidate) => candidate.id === 'epic');
  if (seed === undefined) {
    throw new Error(
      "BUILTIN_TICKET_TYPE_SEEDS carries no 'epic' seed, so there is no epic rank to resolve an ancestry by",
    );
  }
  return seed.rank;
}

/**
 * The recursive ancestry walk, shared by `epicAncestors` and
 * `boardAncestryFor` below — SPLICED into a caller's own query text, never
 * run on its own. `params` accumulates the walk's own bound values, so the
 * caller's SELECT keeps adding to the SAME `SqlParams` instance.
 *
 * The visibility predicate is evaluated ONCE and spliced into both the seed
 * and the recursive term (the comment on `epicAncestors` below states why: an
 * invisible or soft-deleted link STOPS the walk rather than being climbed
 * over, so `no-epic`/`no-parent` is what a caller who cannot see the answer
 * gets, never a guess at what lies past it).
 */
function ancestryCte(
  params: SqlParams,
  eff: EffectiveRole,
  viewerId: string,
  workspaceId: string,
  ticketIds: string[],
): string {
  const workspaceParam = params.add(workspaceId);
  const idsParam = params.add(ticketIds);
  const visible = visibleTicketsWhere(eff, viewerId, params);
  const depthParam = params.add(MAX_ANCESTRY_DEPTH);
  return `WITH RECURSIVE ancestry AS (
       SELECT t.ticket_id AS start_id, t.ticket_id, t.parent_id, t.project_id, t.type_id, t.fields, 0 AS depth
         FROM proj_tickets t
         JOIN proj_visibility v ON v.ticket_id = t.ticket_id
        WHERE t.workspace_id = ${workspaceParam}
          AND t.ticket_id = ANY (${idsParam}::text[])
          AND ${visible}
       UNION ALL
       SELECT a.start_id, t.ticket_id, t.parent_id, t.project_id, t.type_id, t.fields, a.depth + 1
         FROM ancestry a
         JOIN proj_tickets t ON t.ticket_id = a.parent_id
         JOIN proj_visibility v ON v.ticket_id = t.ticket_id
        WHERE t.workspace_id = ${workspaceParam}
          AND a.depth < ${depthParam}
          AND ${visible}
          AND ${LIVE_TICKET_WHERE}
     )`;
}

export type EpicOf = {
  epicId: string;
  /**
   * The epic ticket's own project — ADDED for the board's key badge (owner
   * request, 2026-09-23). `epicId` alone was enough for the list, which never
   * composes a key for the epic bucket it groups by (only a title, read
   * alongside). `epicProjectId` is additive on this type, so `list.ts`'s own
   * use of `EpicOf` is unaffected — it simply never reads the new field.
   */
  epicProjectId: string;
  title: string;
};

/**
 * The nearest ancestor-or-self, of each card, whose ticket TYPE carries the epic
 * rank — and which the CALLER may see.
 *
 * ⚠ **MOVED HERE FROM `routes/list.ts` (owner request, 2026-09-23, board-card
 * badges) — this is the SAME function, not a rewrite.** The list route grouped
 * a page by exactly this walk; the board now needs the identical fact for its
 * epic chip (`boardAncestryFor` below shares this function's own CTE builder
 * rather than re-expressing the recursion a second time). Moving it beside
 * `EPIC_RANK`/`MAX_ANCESTRY_DEPTH` is the same move THEIR OWN docblocks already
 * argue for: "two readers need the same number and they must not each spell
 * it" applies just as much to the walk that reads the number as to the number
 * itself. `routes/list.ts` now imports this function rather than declaring
 * its own; nothing about what it computes changed.
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
 * term of the CTE (`ancestryCte`, above). Consumed, not re-expressed: one SQL
 * statement of the decision table remains on this branch.
 *
 * An invisible link therefore STOPS the walk rather than being climbed over.
 * That is deliberate: skipping past it to a visible grandparent would report a
 * grouping whose reason the caller cannot see, and it would leak the fact that
 * the chain continues. `no-epic` is what a caller who cannot see the answer gets.
 *
 * THE SOFT-DELETE PREDICATE IS ON THE RECURSIVE MEMBER, and a deleted ancestor
 * ends the walk exactly as an invisible one does.
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
export async function epicAncestors(
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
  const cte = ancestryCte(params, eff, viewerId, workspaceId, ticketIds);
  const workspaceParam = params.add(workspaceId);
  const rankParam = params.add(EPIC_RANK);

  const { rows } = await db.query<{
    start_id: string;
    epic_id: string;
    epic_project_id: string;
    title: string | null;
  }>(
    `${cte}
     SELECT DISTINCT ON (start_id)
            start_id, ticket_id AS epic_id, project_id AS epic_project_id, fields -> 'title' ->> 'value' AS title
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
        `epicAncestors: no title claim on epic ${row.epic_id} — every ticket.created writes one, so proj_tickets and the ledger disagree`,
      );
    }
    epics.set(row.start_id, { epicId: row.epic_id, epicProjectId: row.epic_project_id, title: row.title });
  }
  return epics;
}

/** Both hierarchy facts the board draws per card — see `BoardTicketCard` (`@gisik-nokma/domain`). */
export type BoardAncestry = {
  epic: EpicOf | null;
  /** The immediate parent, or `null` for a root OR an unreadable/deleted one — see `boardAncestryFor`'s own docblock. */
  parent: { ticketId: string; projectId: string } | null;
};

/**
 * Both hierarchy facts the board card needs (owner request, 2026-09-23:
 * parent-key badge, epic chip) — from ONE evaluation of `ancestryCte`, not
 * two. The epic arm is `epicAncestors`' own query, verbatim; the parent arm
 * reads `depth = 1` off the SAME materialised walk.
 *
 * ## Why the parent MUST come from this walk and not a fresh lookup
 *
 * `ancestryCte`'s recursive term only produces a depth-1 row when the
 * immediate parent clears BOTH `visibleTicketsWhere` and `LIVE_TICKET_WHERE`
 * — the identical two gates the epic arm already depends on to stop at an
 * ancestor this viewer may not see. A parent lookup written independently
 * (e.g. a plain join against `proj_tickets`/`proj_visibility`) would need to
 * re-derive that same pair of predicates, and a second expression of one rule
 * is exactly the drift this module exists to prevent (see `EPIC_RANK`'s own
 * docblock). Sharing the CTE makes "the parent badge is shown" and "the walk
 * passed through the parent" ONE fact, structurally: there is no code path on
 * which they could disagree.
 *
 * A soft-deleted parent therefore reads identically to an invisible one —
 * `null`, never named — which is the SAME choice `routes/tickets.ts` makes for
 * its own restricted-parent branch when the parent turns out to be deleted
 * ("a soft-deleted PARENT withholds its title too, and answers the
 * `restricted` shape rather than a fourth one"). The board makes no
 * existence-leak arm at all (`BoardTicketCard.parent`'s own docblock), so
 * both a deleted parent and an invisible one fold to the one absent answer.
 *
 * `parent_id === null` (a root) never produces a depth-1 row either: the
 * recursive term's `JOIN proj_tickets t ON t.ticket_id = a.parent_id` matches
 * nothing against a `NULL` parent, so a root and an unreadable/deleted parent
 * are indistinguishable from this function's own output — which is exactly
 * right, since neither one has a parent badge to draw.
 */
export async function boardAncestryFor(
  db: Queryable,
  eff: EffectiveRole,
  viewerId: string,
  workspaceId: string,
  ticketIds: string[],
): Promise<Map<string, BoardAncestry>> {
  const out = new Map<string, BoardAncestry>();
  for (const id of ticketIds) {
    out.set(id, { epic: null, parent: null });
  }
  if (ticketIds.length === 0) {
    return out;
  }

  const params = new SqlParams();
  const cte = ancestryCte(params, eff, viewerId, workspaceId, ticketIds);
  const workspaceParam = params.add(workspaceId);
  const rankParam = params.add(EPIC_RANK);

  const { rows } = await db.query<{
    kind: 'epic' | 'parent';
    start_id: string;
    ref_id: string;
    ref_project_id: string;
    title: string | null;
  }>(
    `${cte}
     (SELECT DISTINCT ON (start_id)
             'epic' AS kind, start_id, ticket_id AS ref_id, project_id AS ref_project_id,
             fields -> 'title' ->> 'value' AS title
        FROM ancestry
       WHERE type_id IN (
             SELECT type_id FROM proj_ticket_types
              WHERE workspace_id = ${workspaceParam} AND rank = ${rankParam}
           )
       ORDER BY start_id, depth)
     UNION ALL
     (SELECT DISTINCT ON (start_id)
             'parent' AS kind, start_id, ticket_id AS ref_id, project_id AS ref_project_id,
             fields -> 'title' ->> 'value' AS title
        FROM ancestry
       WHERE depth = 1
       ORDER BY start_id, depth)`,
    params.toArray(),
  );

  for (const row of rows) {
    const entry = out.get(row.start_id);
    if (entry === undefined) continue;
    if (row.kind === 'epic') {
      if (row.title === null) {
        throw new Error(
          `boardAncestryFor: no title claim on epic ${row.ref_id} — every ticket.created writes one, so proj_tickets and the ledger disagree`,
        );
      }
      entry.epic = { epicId: row.ref_id, epicProjectId: row.ref_project_id, title: row.title };
    } else {
      // The parent's title is not read here — the board's parent badge shows
      // its KEY, composed by the caller from `ref_project_id`/`ref_id`
      // (`keysForAncestors` below), never a title.
      entry.parent = { ticketId: row.ref_id, projectId: row.ref_project_id };
    }
  }
  return out;
}

/**
 * `<workspace prefix><project prefix>-<number>` for a small set of ANCESTOR
 * tickets (parents, epics) — never a board or list page's own cards, which
 * `read/ticket-cards.ts`'s `cardKeysFor` already keys. Three callers key
 * tickets that are not ancestors, from the same bare rows: a link's other end
 * (`read/ticket-links.ts`, `routes/ticket-history.ts`) and a flow's own
 * tickets (`routes/flow.ts` `flowWire`, at most `FLOW_DEFAULT_CAP`). Both this function and
 * that one end at the same primitive, `composeCardKey`, so the composition
 * rule — three facts, one key, `null` when any is missing — is spelled once;
 * only the ROWS each starts from differ (a `ProjTicketRow` there, a bare
 * `{ticketId, projectId}` here, since an ancestor's full row was never read —
 * `ancestryCte` selects only what the walk itself needs).
 *
 * Scoped to ONE workspace, unlike `cardKeysFor`'s per-workspace batching: the
 * board already has a `boardAncestryFor` result, and that walk never crosses a
 * workspace boundary (`ancestryCte`'s `t.workspace_id = workspaceParam` clause
 * on both the seed and the recursive term); the links read and the flow walk
 * (`flow/read-flow.ts`) admit only rows of the workspace in their path (a
 * `t.workspace_id` clause in every statement), and the History route passes
 * each row's own `workspace_id` — so there is only ever one workspace's prefix
 * to read.
 */
export async function keysForAncestors(
  db: Queryable,
  workspaceId: string,
  ancestors: readonly { ticketId: string; projectId: string }[],
): Promise<Map<string, string | null>> {
  const keys = new Map<string, string | null>();
  if (ancestors.length === 0) {
    return keys;
  }
  const [identity, prefixes, numbers] = await Promise.all([
    workspaceIdentityFromLedger(db, workspaceId),
    projectPrefixesInWorkspace(db, workspaceId),
    ticketNumbers(
      db,
      workspaceId,
      ancestors.map((a) => a.ticketId),
    ),
  ]);
  for (const ancestor of ancestors) {
    keys.set(
      ancestor.ticketId,
      composeCardKey(identity.prefix, prefixes.get(ancestor.projectId), numbers.get(ancestor.ticketId)),
    );
  }
  return keys;
}
