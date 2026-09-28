import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import { visibleProjects } from '../read/visible-projects.js';
import {
  statesWithBacklog,
  type ContestedClaimView,
  type FieldClaim,
  type MyWorkResponse,
  type StateCategory,
  type TicketCard,
} from '@gisik-nokma/domain';
import type { Queryable } from '../db/queryable.js';
import type { EffectiveRole } from '../permissions/effective-role.js';
import { READ_NOT_FOUND_BODY, requireMember } from '../read/membership.js';
import { SqlParams } from '../read/sql-params.js';
import { assembleTicketCards, PROJ_TICKET_COLUMNS, type ProjTicketRow } from '../read/ticket-cards.js';
import { foldedDefKey, foldedWorkflowDefs } from '../read/workflow-defs.js';
import { LIVE_TICKET_WHERE, explicitAudienceWhere, visibleTicketsWhere } from '../read/visible-where.js';
import { canSee } from '../visibility/can-see.js';

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
 * ## Closed tickets are gone from every group, and from `shared` (spec §3.2, 2026-09-17)
 *
 * `t.closed_at IS NULL` is bound beside the assignee clause in this query and
 * beside the audience clause in `sharedWithMeRows`'s — a plain conjunct over
 * `t`, not a category `bucketFor` learns to skip. A ticket somebody closed is
 * finished business, and "my work" answers what is still open on it, whatever
 * `state_category` it is folded to: `bucketFor`'s own "refuses a fourth value"
 * contract is unchanged by this — `backlog` still buckets to `open` exactly as
 * before, closed tickets simply never reach the bucketing at all.
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
    // backlog/closed spec §3.2, 2026-09-17: closed business is not "my work"
    // any more, whatever category it is folded to. A plain conjunct over `t`,
    // not a bucket this viewer's groups filter afterwards — a closed ticket
    // never reaches `rows` at all.
    't.closed_at IS NULL',
    // And neither is a deleted one: "my work" is a view, and the FAQ's "stops
    // appearing in views" covers it. A conjunct over `t` beside the closed
    // clause, never folded into the visibility predicate.
    LIVE_TICKET_WHERE,
  ];
  const { rows } = await db.query<ProjTicketRow>(
    `SELECT ${PROJ_TICKET_COLUMNS}
       FROM proj_tickets t
       JOIN proj_visibility v ON v.ticket_id = t.ticket_id
      WHERE ${where.join(' AND ')}
      ORDER BY t.ticket_id`,
    params.toArray(),
  );

  const sharedRows = await sharedWithMeRows(db, viewerId, workspaceId);

  const groups: MyWorkResponse['groups'] = { open: [], active: [], terminal: [] };
  for (const card of await assembleTicketCards(db, viewerId, rows)) {
    bucketFor(groups, card).push(card);
  }
  const shared = await assembleTicketCards(db, viewerId, sharedRows);

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
  // `shared` is in this walk, not beside it: a shared card carries a projectId
  // like any other and the withholding rule is the same one. The guest 13.176 is
  // about is precisely the caller for whom this map comes back EMPTY — they are
  // on no project, so `visibleProjects` returns none, so every shared card
  // renders id-only. That is rulings P32/P38 applying, not a missing lookup.
  for (const bucket of [groups.open, groups.active, groups.terminal, shared]) {
    for (const card of bucket) {
      const name = names.get(card.projectId);
      // Only the projects these cards are actually in. Emitting the viewer's
      // whole visible set here would disclose project names through a door
      // nobody asked that question of.
      if (name !== undefined) projectNames[card.projectId] = name;
    }
  }
  return {
    workspaceId,
    groups,
    projectNames,
    // TOTAL over every card this answer carries, `shared` included. The two
    // lists OVERLAP by design — a ticket both assigned to and shared with the
    // viewer is in both — so `stateNamesFor` may see one ticket twice and write
    // the same key twice with the same value. That is harmless and it is left
    // that way deliberately: a dedupe helper here changed no byte of the
    // response, which made it a code path no fixture in this suite could redden.
    // Untestable code that saves a Map lookup is a worse trade than the lookup.
    stateNames: await stateNamesFor(db, workspaceId, [...rows, ...sharedRows]),
    contested: await contestedFor(db, viewerId, workspaceId),
    shared,
  };
}

/**
 * The tickets in this workspace whose RESOLVED audience names this viewer —
 * "shared with me", the read case 13.176 says the product had no route to.
 *
 * ## Two conjuncts, and the missing third is deliberate
 *
 * `t.workspace_id` is the tenancy clause, supplied HERE because
 * `explicitAudienceWhere` has none — the same contract `visibleTicketsWhere`
 * states and for the same reason. Without it an actor-supplied workspace id
 * would reach every explicit share this user holds anywhere, which is the shape
 * this series has caught before.
 *
 * **`visibleTicketsWhere` is NOT the third conjunct, and leaving it out is the
 * honest choice rather than the lax one.** Past `requireMember` the viewer's
 * role is non-null, and for every non-null role the explicit clause is already
 * NARROWER than the decision table's answer: a guest's whole permitted set IS
 * the explicit column; member and admin reach explicit as one disjunct of three;
 * an owner reaches everything. So `visibleTicketsWhere AND explicitAudienceWhere`
 * is equal to `explicitAudienceWhere` for every caller who gets this far — a
 * conjunct no fixture could ever redden, which is a check that cannot fail
 * wearing the costume of defence in depth. The security argument is the table,
 * not a second copy of it, and it is stated here so the next reader can check it
 * against `can-see.ts` rather than trusting this sentence.
 *
 * The one role the clause would have excluded — `null`, a non-member — never
 * arrives: `requireMember` answers 404 at the door, and case 7.111 pins it.
 *
 * ## An owner is not exempt from being LISTED
 *
 * An owner sees every ticket in the workspace, but "shared with me" asks who was
 * NAMED, so an explicit ticket that does not name them is absent from their
 * `shared` even though they may read it. That is the question this key asks, and
 * it is the difference an owner fixture is written to catch.
 */
async function sharedWithMeRows(
  db: Queryable,
  viewerId: string,
  workspaceId: string,
): Promise<ProjTicketRow[]> {
  const params = new SqlParams();
  const where = [
    `t.workspace_id = ${params.add(workspaceId)}`,
    explicitAudienceWhere(viewerId, params),
    // Same rule as the assigned half (backlog/closed spec §3.2): a closed
    // ticket handed to this viewer is not "shared with me" any more either.
    't.closed_at IS NULL',
    // Same rule again for the soft delete — "shared with me" is a view.
    LIVE_TICKET_WHERE,
  ];
  const { rows } = await db.query<ProjTicketRow>(
    `SELECT ${PROJ_TICKET_COLUMNS}
       FROM proj_tickets t
       JOIN proj_visibility v ON v.ticket_id = t.ticket_id
      WHERE ${where.join(' AND ')}
      ORDER BY t.ticket_id`,
    params.toArray(),
  );
  return rows;
}


/**
 * This viewer's own OPEN contested claims, with the contested ticket's title
 * when they may still see that ticket (ruling P40).
 *
 * ## The claimant is the SESSION, and there is no version of this that takes one
 *
 * `viewerId` is `request.currentUserId`, threaded from the route exactly as the
 * assignee filter above is. It is never a query parameter, and the reason is the
 * one this file's own docblock gives about `t.assignee_id`: a route that let a
 * caller name whose contested claims to read would be a read of another person's
 * refusals behind a 200. `GET /v1/contests` DOES take a `claimantId`, which is
 * correct there — that route answers "contests on tickets I may see", gated per
 * row by `canSee`, and the filter only narrows an answer whose subject is
 * something else. Here the subject IS the caller, so the filter is also the
 * boundary and may have exactly one source.
 *
 * ## The workspace clause is the tenancy, and `claimant_id` is not a substitute
 *
 * Both clauses are present. `claimant_id` alone would return this person's
 * contested claims in EVERY workspace they have ever claimed in, flattened into
 * an answer that names one `workspaceId` — the same shape case 7.106 falsifies
 * for the assigned half.
 *
 * ## Why the title is joined here and gated again, rather than taken from the row
 *
 * A contest OUTLIVES the visibility of its ticket: the claim is the viewer's, so
 * the contest is theirs to see, but whether they may still read the ticket is a
 * separate question whose answer can have changed since the refusal. So the join
 * is LEFT (a contest whose ticket has no row is a contest, not an error, and the
 * title is simply unknown) and every title passes `canSee` for THIS viewer
 * before it is served. A viewer who may no longer see the ticket gets the row
 * with `title: null` — the existence-without-title register — rather than
 * losing the record of their own refused claim.
 *
 * `canSee` is called per row rather than compiled into the query for the reason
 * `sync/contests-route.ts` gives about its own loop: it is the product's ONE
 * visibility decision, and a second SQL spelling of it here would be the
 * two-sources-of-truth shape this series keeps catching. The row count is this
 * viewer's own open contests in one workspace.
 */
async function contestedFor(
  db: Queryable,
  viewerId: string,
  workspaceId: string,
): Promise<ContestedClaimView[]> {
  const { rows } = await db.query<{
    ticket_id: string;
    rule: string;
    reason: string;
    original_event: unknown;
    contested_at: Date;
    ticket_fields: Record<string, FieldClaim> | null;
    deleted_at: Date | null;
    project_deleted_at: Date | null;
  }>(
    // `t.deleted_at` is selected and the LEFT JOIN is NOT filtered by it. The
    // ROW must survive — a contest is the VIEWER's own refused claim, and the
    // FAQ's reason for keeping history is *"other events cite it"*; dropping the
    // row because the ticket it cites was deleted would strand a claim the
    // person can never clear, from a route whose whole subject is their own
    // open refusals. What must NOT survive is the deleted ticket's TITLE, so the
    // flag is carried out and the title gate below consults it. `p.deleted_at`
    // (Task 6, T10) joins the same way, for the same reason: a project's
    // deletion must blank the title without dropping the row.
    //
    // Filtering the ON clause instead would be worse than wrong: `titleOf`
    // throws when `ticket_fields` is null ("visible to this viewer but has no
    // proj_tickets row"), and `canSee` knows nothing about deletion — so a
    // deleted ticket with an open contest would 500 the whole My Work route for
    // its claimant.
    `SELECT c.ticket_id, c.rule, c.reason, c.original_event, c.contested_at,
            t.fields AS ticket_fields, t.deleted_at, p.deleted_at AS project_deleted_at
       FROM proj_contested c
       LEFT JOIN proj_tickets t
         ON t.ticket_id = c.ticket_id AND t.workspace_id = c.workspace_id
       LEFT JOIN proj_projects p ON p.project_id = t.project_id
      WHERE c.workspace_id = $1 AND c.claimant_id = $2 AND NOT c.resolved
      ORDER BY c.contested_at, c.contested_event_id`,
    [workspaceId, viewerId],
  );

  const contested: ContestedClaimView[] = [];
  for (const row of rows) {
    // The refused envelope, verbatim. `original_event` is a `SubmittedEvent` —
    // `EventEnvelope` minus `serverTime` and `seq`, because the claim never
    // committed — so `clientTime` is the only instant it carries and there is
    // no server instant to look for. `contested_at` is the CONTEST event's own
    // stamp and is served under that name, never as the claim's (ruling P39).
    const envelope = row.original_event as { actorId?: unknown; clientTime?: unknown };
    if (typeof envelope.actorId !== 'string' || typeof envelope.clientTime !== 'string') {
      throw new Error(
        `readMyWork: the contested claim on ticket ${row.ticket_id} carries an original_event with no string actorId/clientTime — submittedEventSchema requires both at the door, so this row did not come through it`,
      );
    }
    contested.push({
      ticketId: row.ticket_id,
      // Two ways to earn `null`, and they are the same register — "the claim is
      // yours, the ticket's content is not": the viewer may no longer see the
      // ticket (`canSee`), or the ticket (or its project, Task 6) has been
      // soft-deleted. The second is `LIVE_TICKET_WHERE`'s rule reaching the one
      // surface that cannot filter its row, so it is applied to the TITLE alone.
      title:
        row.deleted_at === null &&
        row.project_deleted_at === null &&
        (await canSee(db, viewerId, row.ticket_id))
          ? titleOf(row.ticket_fields, row.ticket_id)
          : null,
      rule: row.rule,
      reason: row.reason,
      claim: {
        actorId: envelope.actorId,
        clientTime: envelope.clientTime,
        contestedAt: row.contested_at.toISOString(),
      },
    });
  }
  return contested;
}

/**
 * The contested ticket's current title out of the joined `proj_tickets.fields`.
 *
 * Reached only when `canSee` has said this viewer may read the ticket, so a
 * missing row or a missing claim here is a projection/ledger disagreement and
 * not the ordinary withheld case — which is why both are throws and neither is
 * a `null`. `null` is reserved for "you may not see this ticket", and a second
 * meaning on the same value would make the two indistinguishable to the client.
 */
function titleOf(fields: Record<string, FieldClaim> | null, ticketId: string): string {
  if (fields === null) {
    throw new Error(
      `readMyWork: contested ticket ${ticketId} is visible to this viewer but has no proj_tickets row — proj_contested and proj_tickets disagree`,
    );
  }
  const claim = fields['title'];
  if (claim === undefined) {
    throw new Error(
      `readMyWork: no title claim on ticket ${ticketId} — every ticket.created writes one, so proj_tickets and the ledger disagree`,
    );
  }
  if (typeof claim.value !== 'string') {
    throw new Error(
      `readMyWork: the title claim on ticket ${ticketId} is not a string — the door refuses that (checkTicketFieldSet), so this event did not come through it`,
    );
  }
  return claim.value;
}

/**
 * `ticketId` → the name of the state that ticket is in, read from the
 * definition the ticket is FOLDED TO.
 *
 * ## The version is the whole point, and it was here all along
 *
 * `PROJ_TICKET_COLUMNS` has always selected `t.workflow_id, t.workflow_version`,
 * so this route has held the folded pair since it was written; what was missing
 * was the by-version definition read. `read-models.ts` carried the opposite
 * claim in the `ListCard` docblock — that a My Work card "names no workflow
 * version to read a name from" — which is true of the CARD and false of the
 * ROW, and that sentence is corrected there in this change set rather than left
 * to be re-derived.
 *
 * `foldedWorkflowDefs`, never `latestWorkflowDefs`. A card's state name is a
 * name for the state that card is IN, and the card is in a state of the
 * definition its own row names. `routes/attention.ts` has a `stateNameOf` that
 * reads the LATEST definition and falls back to the state id, and it is
 * deliberately NOT reused here: that helper feeds a `reason` SENTENCE, where a
 * heading a reader can see is a slug is acceptable, and this feeds a field
 * called `stateName` that a client renders as a name. Reusing it would be the
 * `workflowVersion` lie in miniature — a name from a vocabulary this ticket was
 * never folded into — which is the same reason `ListRow.stateName` was recorded
 * as a gap rather than closed with a one-line lookup.
 *
 * ## Both absences throw, and neither falls back
 *
 * The discipline is `assembleListCards`', restated for the same fields rather
 * than softened:
 *
 * - **No published definition at the ticket's own `(workflow_id,
 *   workflow_version)`** → throw. The ticket names a definition
 *   `proj_workflows` does not hold, so the projection and the ledger disagree.
 * - **A definition with no such state** → throw. `applyTicketEvent` refuses a
 *   transition to a state its workflow does not carry, so a row in one did not
 *   come through the door.
 *
 * The lookup is `statesWithBacklog(def).find(...)`, not `def.states.find(...)`
 * (backlog/closed spec §1.4, 2026-09-17; DISCOVERED beyond this task's brief,
 * not one of its named edits): `backlog` is the universal state every workflow
 * carries WITHOUT declaring it, so a ticket born `start: 'backlog'` and never
 * moved has `row.state_id === 'backlog'` while `def.states` — the workflow's
 * OWN authored list — never contains it (`validate-workflow.ts` refuses a
 * definition that tries to declare it). Left as `def.states.find`, this throws
 * "has no state 'backlog'" for a ticket that is not malformed at all; the
 * throw above is for a REAL ledger disagreement and must not fire on an
 * ordinary backlog ticket assigned to the caller.
 *
 * Falling back to the state id would put a slug where a name goes, and omitting
 * the entry would be worse still: `WorkItem.stateName` is REQUIRED on the
 * client, so an absent key becomes a mapping failure one layer away from the
 * two facts that would name what is actually wrong.
 */
async function stateNamesFor(
  db: Queryable,
  workspaceId: string,
  rows: readonly ProjTicketRow[],
): Promise<Record<string, string>> {
  if (rows.length === 0) {
    return {};
  }
  const defs = await foldedWorkflowDefs(
    db,
    workspaceId,
    rows.map((row) => ({ workflowId: row.workflow_id, version: row.workflow_version })),
  );
  const stateNames: Record<string, string> = {};
  for (const row of rows) {
    const def = defs.get(foldedDefKey(row.workflow_id, row.workflow_version));
    if (def === undefined) {
      throw new Error(
        `readMyWork: no published definition of workflow ${row.workflow_id} at version ${row.workflow_version}, which ticket ${row.ticket_id} is folded to — the ticket names a definition proj_workflows does not hold`,
      );
    }
    const state = statesWithBacklog(def).find((candidate) => candidate.id === row.state_id);
    if (state === undefined) {
      throw new Error(
        `readMyWork: workflow ${row.workflow_id}@${row.workflow_version} has no state ${row.state_id}, which ticket ${row.ticket_id} is in — applyTicketEvent refuses a transition to a state its workflow does not carry, so this row did not come through it`,
      );
    }
    stateNames[row.ticket_id] = state.name;
  }
  return stateNames;
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
