import type { FastifyInstance, FastifyReply, FastifyRequest, preHandlerHookHandler } from 'fastify';
import { z } from 'zod';
import { BACKLOG_STATE_ID, newUlid, type SubmittedEvent } from '@gisik-nokma/domain';
import type {
  ActorName,
  ActorNameListResponse,
  MemberListResponse,
  MigrationOutcome,
  PublishedWorkflowDef,
  StateOccupancyResponse,
  TicketCountsResponse,
  TicketTypeDef,
  TicketTypeListResponse,
  TypePopulationResponse,
  WorkflowListResponse,
  WorkflowResponse,
  WorkspaceMember,
} from '@gisik-nokma/domain';
import type { Queryable } from '../db/queryable.js';
import { isSyntheticPhoneEmail } from '../auth/synthetic-address.js';
import type { ClientIngest } from '../ingest/ingest-service.js';
import type { EffectiveRole } from '../permissions/effective-role.js';
import { getWorkflowDefFromProjection } from '../projections/workflows.js';
import { READ_NOT_FOUND_BODY, requireMember } from '../read/membership.js';
import { ROSTER_VISIBLE_CLAUSE, isWorkspaceAdmin } from '../read/membership-roster.js';
import { SqlParams } from '../read/sql-params.js';
import { LIVE_TICKET_WHERE, visibleTicketsWhere } from '../read/visible-where.js';
import { latestWorkflowDefs } from '../read/workflow-defs.js';
import { canSee } from '../visibility/can-see.js';

/**
 * The BUILDER read surface (Plan 5 Task 9b): what a workspace IS, as opposed to
 * what work is in it.
 *
 * Plan 8's workflow builder authors `workflow.defined` and `ticket-type.defined`
 * claims and cannot author against definitions it cannot read. It needs the
 * workflow roster to list, one definition to load onto the canvas, the ticket
 * types bound to a workflow, the people a `require-different-user` rule may
 * name, and — before a publish remaps states — how much live work is sitting in
 * each state today.
 *
 * ## Why the door is the whole subject here
 *
 * Tasks 8 and 9 serve tickets, so their answer narrows through
 * `visibleTicketsWhere` and an over-broad door still yields an empty board. NONE
 * of these six reads passes through that predicate: a definition has no
 * audience, a roster row is not a ticket, and an occupancy count is deliberately
 * the whole workspace's. So on this surface the door is not the first of two
 * defences, it is the only one, and every route below states which of the three
 * levels it sits at.
 *
 * ## The three access levels, and who decided each
 *
 * 1. **Any member, guests included** — `/workflows`, `/workflows/:id`,
 *    `/ticket-types`. The plan says so for the workflow reads and gives the
 *    reason: a guest already receives definition events on the stream, and a
 *    guest's shared ticket cannot render its status without one. The type list
 *    is the same argument one step along — the same shared ticket renders its
 *    type's name and icon. Being STRICTER than the plan here would break a
 *    guest's view of the one ticket they were invited to, so the plan's reading
 *    is followed rather than tightened.
 * 2. **Any NON-GUEST member, with guests WITHHELD from non-admin callers** —
 *    `/members`. A guest is a person invited to one shared ticket, not a member
 *    of the roster, and handing every member a directory of them leaks who else
 *    the workspace is talking to. Owners and admins — who manage people — see
 *    them. That a guest may not CALL the route either is an executor ruling
 *    taken where the plan was silent, argued at the route below.
 * 3. **Owner/admin only** — `/state-occupancy` and `/population`. The plan gates
 *    both, and its reason is worth keeping in view: the honest number is the
 *    WHOLE workspace's, including tickets the caller may not see, so there is no
 *    per-viewer variant that could be served to everyone instead.
 *
 * ## The admin refusal is 404, never 403
 *
 * `requireMember`'s 404 exists so that a 403 cannot confirm a workspace to
 * somebody with no business knowing it exists. An admin-only route that
 * answered 403 to a plain member would give that confirmation back one level
 * down — "there is a workflow here called wf-payroll" — so a member, a guest,
 * an off-project member and a total stranger all receive the same frozen
 * `READ_NOT_FOUND_BODY`, byte for byte.
 *
 * ## Tenancy: every lookup correlates on a workspace the CALLER holds
 *
 * `proj_workflows`' primary key is `(workflow_id, version)` GLOBALLY, with
 * `workspace_id` a plain column (controller ruling P14). Every id on this
 * surface — a workflow id, a type id — arrives from the URL, which is to say
 * from the actor. So the only workspace any query here is scoped by is the one
 * `requireMember` just approved for this session, and it reaches every reader as
 * an explicit parameter: `latestWorkflowDefs(db, workspaceId, ids)`,
 * `getWorkflowDefFromProjection(db, workspaceId, id)`, and a literal
 * `workspace_id = $1` in each SQL statement below. Nothing here resolves an
 * actor-supplied id without it.
 *
 * ## The registration shape is the branch's, not the plan's
 *
 * The plan's signature is `(app, { pool, auth })` with `makeRequireSession`
 * imported from `../auth/routes.js` — a module that exports no such thing. Every
 * route on this branch takes the preHandler AS AN ARGUMENT instead
 * (`registerBoardRoutes`, `registerListRoutes`, `registerEventRoutes`), so there
 * is no version of this registration that forgets the session check and still
 * compiles. That is the stronger guarantee and it is what is followed.
 */

/** A published version is a positive integer; anything else is a bad request. */
const versionSchema = z.coerce.number().int().positive();

/** The one body a malformed `?version=` draws. Built once, so route and test name one object. */
export const INVALID_VERSION_BODY = { error: 'invalid_version' } as const;

/**
 * The one body an absent or empty `?workflowId=` draws on the population route.
 *
 * A 400 rather than a fallback to the TYPE's own binding, and that is the whole
 * point of the parameter: a ticket pins its workflow at CREATION (owner decision
 * 2026-08-27), so the type's binding is what new tickets get and may already
 * differ from where the live ones sit. Answering with it would be a different
 * number wearing this one's name, at exactly the moment a publish is about to
 * move work on the strength of it.
 */
export const INVALID_WORKFLOW_ID_BODY = { error: 'invalid_workflow_id' } as const;

/**
 * The one body a malformed migration request draws.
 *
 * A FIXED sentence, echoing no zod issue: "a refusal quoting what it refused is
 * a mirror an attacker can aim" is the rule Task 9's list route states and
 * `INVALID_NAME_BODY` in `workspaces.ts` already follows. The 422 refusals below
 * are a different thing and do quote — they name a state the CALLER's own map
 * left uncovered, which is the dialog's contract and not a reflection of input.
 */
export const INVALID_MIGRATION_BODY = {
  error: 'invalid',
  message: 'A migration needs fromWorkflowId, toWorkflowId and a stateMap of state id to state id.',
} as const;

/**
 * Every workflow id defined in this workspace, in a stable order.
 *
 * `DISTINCT` because `proj_workflows` holds every published VERSION as its own
 * row, and the roster wants one entry per workflow. `ORDER BY workflow_id` so
 * the answer is a function of the workspace's contents rather than of whichever
 * row Postgres returned first — and `latestWorkflowDefs` sorts again anyway, so
 * the two agree instead of one silently depending on the other.
 *
 * ## MEASURED: this predicate alone is not falsifiable, because a second one
 * ## stands behind it
 *
 * Removing `workspace_id = $1` here reddens NOTHING in
 * `test/routes/builder-reads.test.ts` — the ids widen to every tenant's, and
 * then `latestWorkflowDefs` (workspace-scoped, ruling P14) drops every one it
 * cannot resolve in this workspace, so the answer is unchanged. Removing BOTH
 * scopes reddens three cases. So this is defence in depth with the load on the
 * SECOND layer, reported that way rather than left looking covered: a reviewer
 * who deletes this line will see a green suite and should, and a reviewer who
 * deletes the other one will not.
 */
export async function workflowIdsOf(db: Queryable, workspaceId: string): Promise<string[]> {
  const { rows } = await db.query<{ workflow_id: string }>(
    'SELECT DISTINCT workflow_id FROM proj_workflows WHERE workspace_id = $1 ORDER BY workflow_id',
    [workspaceId],
  );
  return rows.map((row) => row.workflow_id);
}

/**
 * Every ticket type defined in this workspace, newest definition per key.
 *
 * `proj_ticket_types` already holds only the winner — the table is keyed
 * `(workspace_id, type_id)` and resolves last-definition-wins on
 * `defined_workspace_seq` — so this reader does no folding of its own.
 *
 * `ORDER BY rank, type_id`: rank is the ladder the product is arranged by, and
 * `type_id` breaks the ties rank leaves (the seeded world has two types at rank
 * 3), so the order is total and reproducible rather than planner-dependent.
 */
export async function readTicketTypes(db: Queryable, workspaceId: string): Promise<TicketTypeDef[]> {
  const { rows } = await db.query<{
    type_id: string;
    name: string;
    icon: string;
    rank: number;
    workflow_id: string;
    fields: TicketTypeDef['fields'];
  }>(
    `SELECT type_id, name, icon, rank, workflow_id, fields
       FROM proj_ticket_types
      WHERE workspace_id = $1
      ORDER BY rank, type_id`,
    [workspaceId],
  );
  return rows.map((row) => ({
    id: row.type_id,
    name: row.name,
    icon: row.icon,
    rank: row.rank,
    workflowId: row.workflow_id,
    fields: row.fields,
  }));
}

/**
 * The workspace roster: one row per person who holds a WORKSPACE-SCOPE grant.
 *
 * ## `scope_kind = 'workspace'`, and this is not a filter of convenience
 *
 * `proj_memberships`' own table comment and `resolveEffectiveRole`'s docblock
 * both say it in as many words: **a project-scope row is not evidence that the
 * user still belongs to the workspace.** `membership.revoked` may only delete
 * what its own entity stream owns, so it removes the workspace-scope row and
 * leaves the project roster rows standing; `resolveEffectiveRole`'s early return
 * is what makes those inert everywhere else. A roster built by folding both
 * scopes together — the plan text's `DISTINCT ON (user_id) … ORDER BY
 * (scope_kind = 'workspace') DESC` — would hand a revoked person back as a
 * current `member`, which is the one answer this read must never give.
 *
 * Nothing is lost by ignoring the project rows. After the scope collapse (owner
 * decision 2026-08-27) `membership.granted` refuses a `scope` outright, so a
 * project-scope row is only ever written by `project.member_added`, which
 * hardcodes role `'member'` — it carries no role information at all. A guest is
 * a workspace-scope grant with role `'guest'`. And nobody reaches a project
 * without a workspace grant first. `GET /v1/me/workspaces` filters the same way,
 * for the same reason.
 *
 * ## Guests, and who may see them
 *
 * `includeGuests` is the caller's admin-ness, resolved at the door and passed in
 * rather than re-derived here. It is a bound PARAMETER inside the SQL rather
 * than a branch between two query strings, so there is exactly one statement to
 * read and no second copy to drift.
 *
 * A guest is not among the callers this reader ever runs for: the route's door
 * refuses them outright (executor ruling, 2026-09-02), so the two populations
 * this function serves are admin (guests included) and non-guest member (guests
 * withheld). Case 7.91 is the refusal; case 7.39 is the withholding.
 *
 * ## The join is INNER, and that is a decision
 *
 * A membership naming a user id with no `"user"` row is DROPPED rather than
 * listed with an invented name. The plan forbids the fallback ("this route
 * neither invents a fallback nor formats a phone number into a name"), and a
 * null `displayName` would push the same problem onto every renderer. The shape
 * is not reachable through the shipped doors — a membership names a user who
 * signed in, and better-auth owns that row's lifetime — so this is recorded as a
 * decision rather than defended by a test that cannot be written honestly. If a
 * user row ever is deleted underneath a live membership, this roster goes quiet
 * about that person, and `proj_memberships` is where the truth still is.
 */
export async function readMembers(
  db: Queryable,
  workspaceId: string,
  includeGuests: boolean,
): Promise<WorkspaceMember[]> {
  const { rows } = await db.query<{
    user_id: string;
    display_name: string;
    email: string;
    role: WorkspaceMember['role'];
  }>(
    `SELECT m.user_id, u."name" AS display_name, u."email", m.role
       FROM proj_memberships m
       JOIN "user" u ON u."id" = m.user_id
      WHERE m.workspace_id = $1
        AND m.scope_kind = 'workspace'
        AND ${ROSTER_VISIBLE_CLAUSE}
      ORDER BY m.user_id`,
    [workspaceId, includeGuests],
  );
  return rows.map((row) => ({
    userId: row.user_id,
    displayName: row.display_name,
    role: row.role,
    // THE SYNTHETIC ADDRESS IS WITHHELD, and withheld is ABSENT rather than `''`.
    //
    // The owner's instruction is *"if the name is absent, show the email
    // instead"*. Carrying every address verbatim would satisfy it and would also
    // put a phone number on the wire: a phone-only sign-up's address is
    // `<digits-phone.gisik-nokma.invalid>`, so its local part IS the phone. It
    // costs nothing to withhold, because a phone sign-up's `displayName` is the
    // phone itself (`auth.ts`'s `getTempName`) — so a row with a synthetic
    // address always has a name and never reaches the fallback this field exists
    // to serve. The predicate and the reasoning live in `auth/synthetic-address.ts`.
    ...(isSyntheticPhoneEmail(row.email) ? {} : { email: row.email }),
  }));
}

/**
 * Who acted here, by display name and nothing more — the read behind every
 * "who did this" label a member sees (owner ruling 2026-09-29: names are not
 * the sensitive part; emails, phones and roles stay exactly as gated).
 *
 * ## Why it is not `readMembers`
 *
 * The roster is a DIRECTORY: it feeds pickers, the members screen and the
 * member count, and it withholds guests from a non-admin (`ROSTER_VISIBLE_CLAUSE`).
 * A label join needs the guest too — a member reading a note a guest wrote
 * would otherwise see the author's raw id — but widening the roster would put
 * the guest in every picker and break the count/list agreement. So the join
 * reads this instead, and the directory is untouched.
 *
 * ## What is left out, and why
 *
 * - Nobody is left out for a BLANK name: it is labelled by the verified email
 *   (R3, owner ruling 2026-09-29: "show email"). A row with neither name nor
 *   address says nothing and is left out.
 * - A person whose address is synthetic: their name IS their phone number
 *   (`auth.ts`'s `getTempName`), and the roster withholds that address for
 *   exactly this reason. Their name travels only where the roster already
 *   carried it, which is where the client's roster join already finds it.
 * - Anyone this workspace never GRANTED (`membership.granted` in its own
 *   ledger): every other workspace's people, and accounts that were never here.
 *
 * ## A FORMER member is served, flagged (R5/FD6)
 *
 * A person whose workspace-scope row is gone but whom this workspace's ledger
 * did grant is served with `removed: true`, so the client can write
 * "Name (removed)" instead of an id. Granted, revoked and granted again is
 * CURRENT: the current row exists, so the second half of the union skips it.
 */
export async function readActorNames(db: Queryable, workspaceId: string): Promise<ActorName[]> {
  const { rows } = await db.query<NameRow>(
    `SELECT m.user_id, u."name" AS display_name, u."email", FALSE AS removed
       FROM proj_memberships m
       JOIN "user" u ON u."id" = m.user_id
      WHERE m.workspace_id = $1 AND m.scope_kind = 'workspace'
     UNION
     SELECT DISTINCT e.payload->>'userId', u."name", u."email", TRUE
       FROM events e
       JOIN "user" u ON u."id" = e.payload->>'userId'
      WHERE e.workspace_id = $1 AND e.type = 'membership.granted'
        AND NOT EXISTS (SELECT 1 FROM proj_memberships m2
                         WHERE m2.workspace_id = $1 AND m2.scope_kind = 'workspace'
                           AND m2.user_id = e.payload->>'userId')
     ORDER BY 1`,
    [workspaceId],
  );
  return rows.flatMap(labelled);
}

type NameRow = { user_id: string; display_name: string | null; email: string; removed: boolean };

/** One row → its label, or nothing (FD3: a phone user is never labelled here). */
function labelled(row: NameRow): ActorName[] {
  if (isSyntheticPhoneEmail(row.email)) return [];
  const name = (row.display_name ?? '').trim();
  const displayName = name !== '' ? name : row.email.trim();
  if (displayName === '') return [];
  return [row.removed ? { userId: row.user_id, displayName, removed: true } : { userId: row.user_id, displayName }];
}

/**
 * FD2 / spec N3 (owner ruling 2026-09-29, "go with the recommendation"): a guest
 * is named the people on the tickets they can see — each such ticket's current
 * assignee and every actor of an event filed against it — and nobody else.
 *
 * "The tickets they can see" is `visibleTicketsWhere` for the guest, the very
 * predicate every ticket read asks, never a second copy of the audience test:
 * taken off a ticket's list, the guest stops being named that ticket's people.
 */
export async function readActorNamesForGuest(
  db: Queryable,
  workspaceId: string,
  eff: EffectiveRole,
  guestId: string,
): Promise<ActorName[]> {
  const params = new SqlParams();
  const ws = params.add(workspaceId);
  const visible = `SELECT v.ticket_id FROM proj_visibility v JOIN proj_tickets t ON t.ticket_id = v.ticket_id
                    WHERE v.workspace_id = ${ws} AND ${LIVE_TICKET_WHERE} AND ${visibleTicketsWhere(eff, guestId, params)}`;
  const { rows } = await db.query<{ user_id: string }>(
    `SELECT t.assignee_id AS user_id FROM proj_tickets t WHERE t.ticket_id IN (${visible}) AND t.assignee_id IS NOT NULL
     UNION
     SELECT e.actor_id FROM events e WHERE e.workspace_id = ${ws} AND e.entity_kind = 'ticket' AND e.entity_id IN (${visible})`,
    params.toArray(),
  );
  const wanted = new Set(rows.map((r) => r.user_id));
  return (await readActorNames(db, workspaceId)).filter((n) => wanted.has(n.userId));
}

/**
 * Occupancy of one workflow's states, over the whole workspace.
 *
 * Seeded from the DEFINITION so an empty state reports 0 rather than vanishing —
 * a mapping dialog that omitted an empty state would invite an author to delete
 * a state that turns out to hold work tomorrow — then filled from
 * `proj_tickets`.
 *
 * The plan also asks that a `state_id` still occupied but no longer named by the
 * definition appear here, and the write below would put it there. **No test
 * constrains that branch, and none on this branch can**: `applyTicketEvent`
 * throws on a `ticket.transitioned` to a state its workflow does not carry and
 * throws again if the workflow itself is missing, so no hostile client, no
 * engine-bypassing `applyCommitted` seed and no internal append can produce such
 * a row — the same unreachability `board.ts`'s straggler pass records against
 * Open question 8, measured there. It is written this way anyway, and for the
 * same reason: a ticket silently absent from a mapping dialog is a lie with a
 * longer fuse than a state id nobody recognises.
 *
 * ## A `Map`, because one legal state id cannot be an object key
 *
 * The accumulator was a plain `{}` and it dropped a whole state. `toString` was
 * SAFE there — a plain assignment creates an own property that shadows the
 * prototype's method — which is exactly why case 7.88 stayed green over it. But
 * `__proto__` is not a method on `Object.prototype`, it is an ACCESSOR PAIR
 * whose setter ignores any value that is neither an object nor null. So
 * `counts['__proto__'] = 0` on a `{}` wrote nothing, created no own key, threw
 * nothing, and the state — with every live ticket in it — was simply absent
 * from the response. MEASURED end to end: with a ticket sitting in a
 * `__proto__` state and `proj_tickets.state_id` holding that string, this route
 * answered `{"counts":{"ok":1,"done":0}}`.
 *
 * `workflowStateSchema` is `id: z.string().min(1)` and every other state lookup
 * in the engine and the domain is a `.find`, a `.some` or a `Set`, so
 * `__proto__` is a legal state id everywhere except an indexed object — and
 * this was the last one on the surface. It is also a state a type cannot
 * migrate OFF: Fastify parses bodies with `secure-json-parse`, which refuses a
 * `__proto__` key before the handler runs, so the bulk rebind answers an opaque
 * 400 and never its own named refusal. A state that cannot be migrated away
 * from and cannot be seen is the pair that makes this a defect rather than an
 * oddity. Pinned by case 7.89.
 *
 * ## MEASURED: the `workspace_id` predicate here is NOT falsifiable, and why
 *
 * Removing it reddens nothing, and no fixture at any layer could change that.
 * A `workflow_id` cannot exist in two workspaces at once: the ledger's
 * `events_entity_seq_unique` is `(entity_kind, entity_id, seq)` GLOBALLY, so a
 * second workspace's `('workflow', 'wf-errands', 1)` is rejected by the ledger
 * before any projection sees it, and ingest's entity-to-workspace guard refuses
 * an entity that tries to move. `read-app.ts` records the consequence from the
 * other side — the neighbour workspace's ids are all prefixed `nb-` because a
 * collision would fail the SEED rather than the assertion. So `workflow_id` is
 * globally partitioned by workspace, and filtering on it already implies the
 * tenancy.
 *
 * The predicate stays for the reason `board.ts` keeps its unfalsifiable
 * `workspace_id` clause: it costs one bound parameter, and the day a projection
 * bug or a direct internal append produces a row whose `workspace_id` and
 * `workflow_id` disagree, this is the query that must not count it. Stated
 * plainly rather than defended by a case that cannot exist.
 */
export async function readStateOccupancy(
  db: Queryable,
  workspaceId: string,
  def: PublishedWorkflowDef,
): Promise<Record<string, number>> {
  const counts = new Map<string, number>();
  for (const state of def.states) {
    counts.set(state.id, 0);
  }
  // The occupant badge is a VIEW of the workflow, so a soft-deleted ticket is
  // not an occupant: leaving it in would make the builder demand a target state
  // for a ticket nobody can reach, and the admin would be mapping a state whose
  // only ticket is invisible to them. Aliased `t` so the one predicate constant
  // applies verbatim — see its docblock for why it is not folded into the
  // visibility predicate and why this grep is the coverage list.
  const { rows } = await db.query<{ state_id: string; occupants: number }>(
    `SELECT t.state_id, count(*)::int AS occupants
       FROM proj_tickets t
      WHERE t.workspace_id = $1 AND t.workflow_id = $2
        AND ${LIVE_TICKET_WHERE}
      GROUP BY t.state_id`,
    [workspaceId, def.id],
  );
  for (const row of rows) {
    counts.set(row.state_id, row.occupants);
  }
  // `Object.fromEntries`, not the Map, and not a `{}` accumulated into: it
  // creates every key as an OWN DATA PROPERTY (CreateDataPropertyOrThrow), so
  // the accessor case above survives the conversion, while what leaves this
  // function is an ordinary object that `JSON.stringify` serialises and
  // `JSON.parse` restores key for key. A `Map` returned directly would
  // serialise as `{}`.
  return Object.fromEntries(counts);
}

/**
 * Whether this workspace defines this ticket type.
 *
 * `proj_ticket_types` is keyed `(workspace_id, type_id)`, so the scope is in the
 * key here — unlike `proj_workflows`. The predicate is written out anyway,
 * because a reader must not have to know which of two neighbouring tables
 * carries its tenancy in the key and which carries it in a plain column.
 */
export async function ticketTypeExists(db: Queryable, workspaceId: string, typeId: string): Promise<boolean> {
  const { rows } = await db.query(
    'SELECT 1 FROM proj_ticket_types WHERE workspace_id = $1 AND type_id = $2',
    [workspaceId, typeId],
  );
  return rows.length > 0;
}

/**
 * How many tickets of one type are pinned to one workflow.
 *
 * Both ids came from the URL and both have already been resolved against this
 * workspace by the caller; the `workspace_id` predicate is bound here regardless
 * because `proj_tickets`' primary key is `ticket_id` ALONE, so nothing about
 * this table's shape scopes a count on its own.
 *
 * `::int` on the count: `createPool` installs an int8 parser, but saying it in
 * the SQL means the JSON carries a number no matter which pool this runs on.
 *
 * ## MEASURED: and NO TEST CONSTRAINS IT — the third such predicate on this
 * ## surface, said plainly for the same reason as the other two
 *
 * The paragraph above explains why the predicate is PRESENT. It does not
 * explain — and a reader would otherwise assume — that something checks it.
 * Nothing does: removing `workspace_id = $1` here, with `$2`/`$3` renumbered
 * (`SqlParams` is POSITIONAL — leaving the parameter behind shifts every `$n`
 * and Postgres refuses the bind, which is a mutation that never ran), reddens
 * NOTHING in `test/routes/builder-reads.test.ts`. Structurally, for the same
 * reason `readStateOccupancy`'s does not: both actor-supplied ids are resolved
 * against the caller's workspace BEFORE this runs — `ticketTypeExists` and
 * `getWorkflowDefFromProjection`, each workspace-scoped — and a `workflow_id`
 * is globally partitioned by workspace anyway (the ledger's
 * `events_entity_seq_unique` is global, so a second tenant cannot publish the
 * same one). No fixture at any layer can produce a row this predicate would
 * exclude and the two resolutions would not.
 *
 * So a future refactorer who deletes this line and sees a green suite must read
 * that green as STRUCTURAL rather than as evidence. Keep it for what it costs
 * (one bound parameter) against what it catches on the day a projection bug or
 * a direct internal append writes a row whose `workspace_id` and `workflow_id`
 * disagree.
 */
export async function readTypePopulation(
  db: Queryable,
  workspaceId: string,
  typeId: string,
  workflowId: string,
): Promise<number> {
  const { rows } = await db.query<{ population: number }>(
    `SELECT count(*)::int AS population
       FROM proj_tickets t
      WHERE t.workspace_id = $1 AND t.type_id = $2 AND t.workflow_id = $3
        AND ${LIVE_TICKET_WHERE}`,
    [workspaceId, typeId, workflowId],
  );
  return rows[0]?.population ?? 0;
}

/**
 * How many tickets of EACH type this workspace holds — the type's own count,
 * with no workflow predicate. `readTypePopulation`'s sibling is the pinned read
 * above; `TicketCountsResponse`'s docblock is where the two questions are told
 * apart and why this one is a separate read rather than a widened route.
 *
 * ## Why the join, and why `count(k.ticket_id)` rather than `count(*)`
 *
 * The left side is `proj_ticket_types`, so a type the workspace DEFINES but has
 * never given a ticket still appears — with 0. That is the same contract
 * `readStateOccupancy` keeps for empty states, and for the same reason: a screen
 * that silently omitted an empty type would invite an author to delete one that
 * turns out to hold work tomorrow.
 *
 * **`count(*)` would be wrong here and wrong in the direction that hides
 * itself**: on a LEFT JOIN, a type with no tickets has one row — the left row —
 * so `count(*)` answers 1 for every empty type. Exactly one case in
 * `test/routes/builder-reads.test.ts` distinguishes the two, by seeding a type
 * with no tickets and asserting 0; without that fixture the two spellings are
 * indistinguishable, which is why the fixture exists rather than the assertion
 * being left to the reader.
 *
 * The `k.workspace_id = t.workspace_id` term repeats the predicate rather than
 * leaning on `t.workspace_id = $1`: `proj_tickets`' primary key is `ticket_id`
 * alone, so nothing about that table's shape scopes a count on its own, and a
 * join is where a missing correlation stops being obvious.
 *
 * `::int` on the count, as above: `createPool` installs an int8 parser, but
 * saying it in the SQL means the JSON carries a number no matter which pool
 * this runs on.
 *
 * ## Performance: UNMEASURED, and named here rather than left to be assumed
 *
 * **No index on `proj_tickets` leads with `(workspace_id, type_id)`** — the pair
 * this read filters on. The table's three indexes are `(workspace_id, parent_id)`
 * and `(workspace_id, project_id)` (`1787961800000_proj-tickets.sql:91-92`) and a
 * partial `(workspace_id, project_id) WHERE closed_at IS NULL`
 * (`1789100000000_proj-tickets-closed.sql:11`), and the absence of a third
 * leading on `workflow_id` is itself a **recorded decision** at `:66-71` of the
 * first migration. So this scans one workspace's ticket rows and joins.
 *
 * **No row count and no `EXPLAIN` was taken**, so "fast enough" is asserted
 * nowhere and nothing here depends on it being true. The shape is bounded by one
 * workspace and the screen that calls it is an admin settings page that renders
 * every type once; if a real workspace ever says otherwise, **the fix is an index
 * and not a new projection**, which is the same conclusion the query-vs-projection
 * question reached from the other direction.
 */
export async function readTicketCounts(db: Queryable, workspaceId: string): Promise<Record<string, number>> {
  const { rows } = await db.query<{ type_id: string; count: number }>(
    // The soft-delete predicate written LONGHAND on the `k` alias — this is the
    // one builder read whose `t` is already taken, by `proj_ticket_types`. It is
    // `LIVE_TICKET_WHERE`'s clause on a different alias (Task 6 added the
    // container half), and it is in the JOIN's ON clause rather than the
    // WHERE, deliberately: this is a LEFT JOIN whose whole job is to report a
    // count of ZERO for a type that has no tickets, and a WHERE on the
    // right-hand alias would turn a zero into an absent row.
    `SELECT t.type_id, count(k.ticket_id)::int AS count
       FROM proj_ticket_types t
       LEFT JOIN proj_tickets k
         ON k.workspace_id = t.workspace_id AND k.type_id = t.type_id
        AND k.deleted_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM proj_projects dp WHERE dp.project_id = k.project_id AND dp.deleted_at IS NOT NULL)
      WHERE t.workspace_id = $1
      GROUP BY t.type_id`,
    [workspaceId],
  );
  return Object.fromEntries(rows.map((row) => [row.type_id, row.count]));
}

/**
 * The bulk rebind's body. Parsed HERE with zod rather than declared as a
 * Fastify body schema, and the difference is the door.
 *
 * Fastify runs schema validation BEFORE `preHandler`, so a declared body schema
 * would answer a malformed request with 400 before `requireSession` had asked
 * who was calling — an unauthenticated stranger would learn that this route
 * exists and what its body looks like. Every other refusal on this surface runs
 * the door first (Task 9's case 7.83), and a write route that re-homes other
 * people's work is the last place to make an exception. Parsing in the handler
 * puts the session check, then the admin check, then the parse, in that order.
 *
 * `.strict()`: an unknown key is refused rather than dropped, the same intent
 * `app.ts`'s `removeAdditional: false` declares for every schema-validated door.
 */
const migrateBodySchema = z
  .object({
    fromWorkflowId: z.string().min(1),
    toWorkflowId: z.string().min(1),
    stateMap: z.record(z.string().min(1), z.string().min(1)),
  })
  .strict();

/** The refusal rules this route can answer with, before any event exists. */
export const MIGRATION_RULES = {
  /** `fromWorkflowId === toWorkflowId`. */
  sameWorkflow: 'migration.same-workflow',
  /** A `stateMap` target the destination workflow does not define. */
  unknownTargetState: 'migration.unknown-target-state',
  /** An occupied state the `stateMap` does not cover — the dialog's contract. */
  unmappedState: 'migration.unmapped-state',
  /**
   * Backlog/closed spec §2.4 (Ruling 53(ii)): a closed row whose mapped
   * target (or, for a parked row, `BACKLOG_STATE_ID` itself) is not a
   * TERMINAL state. Answered up front, over the whole ticket set, for the
   * same reason `unmappedState` is — a closed ticket that lost its terminal
   * category through a migration is exactly the invariant
   * `checkTicketWorkflowRebound` (Ruling 53(i)) refuses per event; this is
   * the route's own pre-flight so a batch this door would let through does
   * not have to be built and refused one row at a time.
   */
  closedToNonTerminal: 'migration.closed-to-non-terminal',
  /**
   * N2 (opus re-review, final fix wave round 2, 2026-09-17): a `stateMap`
   * KEY of `backlog` — the mirror mistake of naming it as a VALUE, which
   * `unknownTargetState` already refuses. Backlog is never one of
   * `fromWorkflow.states`, so the dialog can never have built such a key;
   * a hand-built request that does is silently overridden without this
   * refusal (`toStateIdFor` always sends `BACKLOG_STATE_ID` for a parked
   * row, Ruling 52(a), regardless of what the map says for it).
   */
  backlogNotMappable: 'migration.backlog-not-mappable',
  /**
   * E6-10 (release 2026-09-22): a ticket of the type the CALLER cannot see.
   * The permission gate asks `canSee` per event (`check-permission.ts`), and
   * `canSeeResolved` answers false for an `admin` on a project-mode ticket
   * whose project they are not on — there is deliberately no admin read
   * bypass. Asked here, over the whole ticket set, before one envelope
   * exists, for the reason every other pre-flight question is: ingest
   * commits one transaction per event, so a refusal that arrives on the
   * second row leaves the first moved — a type split across two workflows
   * under a `refused`. The count is in the reason because the remedy is
   * the caller's (join those projects, or hand the migration to an owner),
   * and the number is what tells them how far that is.
   */
  notVisible: 'migration.not-visible',
} as const;

export function registerBuilderReadRoutes(
  app: FastifyInstance,
  deps: { pool: Queryable; ingest: ClientIngest },
  requireSession: preHandlerHookHandler,
): void {
  /**
   * The door, asked once per handler. Returns the caller's `EffectiveRole` in
   * the workspace named by the URL, or `null` meaning "answer 404".
   *
   * `access` is a REQUIRED argument rather than an optional flag: every route on
   * this surface has an answer to "who may call this", and a default would let a
   * new route inherit the permissive one by saying nothing. Three values, one
   * per access level named in this module's header, and the name is `access`
   * rather than `admin` because the middle level is about guests and not about
   * admin-ness.
   */
  async function door(
    request: FastifyRequest,
    workspaceId: string,
    access: 'members-only' | 'no-guests' | 'admins-only',
  ): Promise<EffectiveRole | null> {
    const eff = await requireMember(deps.pool, request.currentUserId, workspaceId);
    if (eff === null) return null;
    if (access === 'no-guests' && eff.workspaceRole === 'guest') return null;
    if (access === 'admins-only' && !isWorkspaceAdmin(eff)) return null;
    return eff;
  }

  app.get<{ Params: { workspaceId: string } }>(
    '/v1/workspaces/:workspaceId/workflows',
    { preHandler: requireSession },
    async (request, reply) => {
      const { workspaceId } = request.params;
      if ((await door(request, workspaceId, 'members-only')) === null) {
        return reply.code(404).send(READ_NOT_FOUND_BODY);
      }
      const defs = await latestWorkflowDefs(
        deps.pool,
        workspaceId,
        await workflowIdsOf(deps.pool, workspaceId),
      );
      const body: WorkflowListResponse = { workspaceId, workflows: [...defs.values()] };
      return body;
    },
  );

  app.get<{ Params: { workspaceId: string; workflowId: string }; Querystring: { version?: string } }>(
    '/v1/workspaces/:workspaceId/workflows/:workflowId',
    { preHandler: requireSession },
    async (request, reply) => {
      const { workspaceId, workflowId } = request.params;
      // THE DOOR ANSWERS BEFORE THE QUERY STRING IS PARSED. Task 9's deviation
      // (case 7.83) is the convention on this branch: the plan's snippet parses
      // `?version=` first, which hands a stranger a 400 — an oracle saying the
      // workspace and the route are real. An unauthorised caller never reaches
      // the parser at all.
      if ((await door(request, workspaceId, 'members-only')) === null) {
        return reply.code(404).send(READ_NOT_FOUND_BODY);
      }
      let select: number | undefined;
      if (request.query.version !== undefined) {
        const parsed = versionSchema.safeParse(request.query.version);
        if (!parsed.success) return reply.code(400).send(INVALID_VERSION_BODY);
        select = parsed.data;
      }
      // Workspace-scoped, ruling P14: `proj_workflows` is keyed
      // `(workflow_id, version)` globally, so an id from the URL would otherwise
      // resolve out of a neighbouring tenancy. A version that was never
      // published and a workflow that does not exist are the same null, and both
      // are the same 404 — the builder is told "not here", not "not yet".
      const workflow = await getWorkflowDefFromProjection(deps.pool, workspaceId, workflowId, select);
      if (workflow === null) return reply.code(404).send(READ_NOT_FOUND_BODY);
      const body: WorkflowResponse = { workspaceId, workflow };
      return body;
    },
  );

  app.get<{ Params: { workspaceId: string } }>(
    '/v1/workspaces/:workspaceId/ticket-types',
    { preHandler: requireSession },
    async (request, reply) => {
      const { workspaceId } = request.params;
      if ((await door(request, workspaceId, 'members-only')) === null) {
        return reply.code(404).send(READ_NOT_FOUND_BODY);
      }
      const body: TicketTypeListResponse = {
        workspaceId,
        ticketTypes: await readTicketTypes(deps.pool, workspaceId),
      };
      return body;
    },
  );

  app.get<{ Params: { workspaceId: string } }>(
    '/v1/workspaces/:workspaceId/members',
    { preHandler: requireSession },
    async (request, reply) => {
      const { workspaceId } = request.params;
      // EXECUTOR RULING (2026-09-02), and a CONSERVATIVE DEFAULT where the plan
      // was silent: a guest may not call this route at all.
      //
      // The plan settles who is HIDDEN from the listing and never says who may
      // CALL it, so this fell through to the blanket "not a member -> 404",
      // under which a guest passed `requireMember` and received the workspace's
      // entire non-guest staff directory — user ids and display names, none of
      // it about the one ticket they were invited to. The withholding rule's own
      // rationale decides it: a guest is "a person invited to one shared ticket,
      // not a member of the workspace's roster", and handing that person the
      // full directory is the mirror of the leak the rule exists to prevent. The
      // roster's stated purpose — the people a `require-different-user` rule may
      // name — is workflow-builder work, which is owner/admin work.
      //
      // Cheap to reverse: this argument and one enum value. Recorded in the
      // coordination doc's "Plan 5 execution consequences" section.
      const eff = await door(request, workspaceId, 'no-guests');
      if (eff === null) return reply.code(404).send(READ_NOT_FOUND_BODY);
      const body: MemberListResponse = {
        workspaceId,
        // The ONE place the caller's own role changes what comes back. It is
        // the door's answer threaded through, never a second resolution.
        members: await readMembers(deps.pool, workspaceId, isWorkspaceAdmin(eff)),
      };
      return body;
    },
  );

  app.get<{ Params: { workspaceId: string } }>(
    '/v1/workspaces/:workspaceId/actor-names',
    { preHandler: requireSession },
    async (request, reply) => {
      const { workspaceId } = request.params;
      // A guest is served the people on their own tickets only (FD2, owner
      // ruling 2026-09-29); the roster (`/members`) stays `no-guests`.
      const eff = await door(request, workspaceId, 'members-only');
      if (eff === null) return reply.code(404).send(READ_NOT_FOUND_BODY);
      const names =
        eff.workspaceRole === 'guest'
          ? await readActorNamesForGuest(deps.pool, workspaceId, eff, request.currentUserId)
          : await readActorNames(deps.pool, workspaceId);
      const body: ActorNameListResponse = { workspaceId, names };
      return body;
    },
  );

  app.get<{ Params: { workspaceId: string; workflowId: string } }>(
    '/v1/workspaces/:workspaceId/workflows/:workflowId/state-occupancy',
    { preHandler: requireSession },
    async (request, reply) => {
      const { workspaceId, workflowId } = request.params;
      // Not an admin reads exactly like not a member, which reads exactly like
      // no such workflow: this endpoint's number is the whole workspace's, so
      // nobody learns it exists by being refused.
      if ((await door(request, workspaceId, 'admins-only')) === null) {
        return reply.code(404).send(READ_NOT_FOUND_BODY);
      }
      const def = await getWorkflowDefFromProjection(deps.pool, workspaceId, workflowId);
      if (def === null) return reply.code(404).send(READ_NOT_FOUND_BODY);
      const body: StateOccupancyResponse = {
        workspaceId,
        workflowId,
        counts: await readStateOccupancy(deps.pool, workspaceId, def),
      };
      return body;
    },
  );

  app.get<{ Params: { workspaceId: string; typeId: string }; Querystring: { workflowId?: string } }>(
    '/v1/workspaces/:workspaceId/ticket-types/:typeId/population',
    { preHandler: requireSession },
    async (request, reply) => {
      const { workspaceId, typeId } = request.params;
      // Admin-only, on state-occupancy's exact terms and for its exact reason:
      // the honest number is the whole workspace's, counted over tickets the
      // caller may not see, so there is no per-viewer variant to serve instead.
      // The door precedes the query parse here too (case 7.83's order).
      if ((await door(request, workspaceId, 'admins-only')) === null) {
        return reply.code(404).send(READ_NOT_FOUND_BODY);
      }
      const workflowId = request.query.workflowId;
      if (typeof workflowId !== 'string' || workflowId === '') {
        return reply.code(400).send(INVALID_WORKFLOW_ID_BODY);
      }
      // BOTH actor-supplied ids are resolved against the caller's workspace
      // before anything is counted, and an unknown one is the same 404 as an
      // unauthorised caller. Counting first would answer 0 for a type this
      // workspace has never defined and for a workflow belonging to the tenant
      // next door — a zero that looks like an answer, at the moment a mapping
      // dialog is deciding there is nothing to move.
      if (!(await ticketTypeExists(deps.pool, workspaceId, typeId))) {
        return reply.code(404).send(READ_NOT_FOUND_BODY);
      }
      if ((await getWorkflowDefFromProjection(deps.pool, workspaceId, workflowId)) === null) {
        return reply.code(404).send(READ_NOT_FOUND_BODY);
      }
      const body: TypePopulationResponse = {
        workspaceId,
        typeId,
        workflowId,
        count: await readTypePopulation(deps.pool, workspaceId, typeId, workflowId),
      };
      return body;
    },
  );

  /**
   * How many tickets of each type the workspace holds — the read behind the
   * ticket-type list's `"N tickets"` meta segment.
   *
   * ## Why a route beside `population` rather than a widened one
   *
   * `population` above answers "how many of this type are pinned to one
   * workflow". Its `workflowId` is optional in the TYPE and required at runtime
   * — `:619`/`:631-633` before this change — and the tempting shortcut was to
   * let an absent one mean "the whole workspace". **That was refused
   * deliberately.** The two are genuinely different questions (a ticket pins
   * the workflow it was created under, so the pinned number stops being the
   * type's count the moment a rebind leaves tickets behind), and a route whose
   * meaning depends on whether an argument was passed is one door answering two
   * things — the defect this file refuses by name for the `Edit` button, read
   * backwards. Widening would also have changed a shipped contract, since
   * `TypePopulationResponse.workflowId` is required.
   *
   * ## No id to resolve, so no 404 to earn
   *
   * Unlike its sibling, nothing here comes from the caller except the workspace
   * — the type set is the workspace's own — so there is no actor-supplied id to
   * resolve against the tenancy and no "a zero that looks like an answer" to
   * collapse. A caller with no membership gets the same 404 as everywhere else
   * on this surface, from the door.
   */
  app.get<{ Params: { workspaceId: string } }>(
    '/v1/workspaces/:workspaceId/ticket-counts-by-type',
    { preHandler: requireSession },
    async (request, reply) => {
      const { workspaceId } = request.params;
      // Admin-only, on state-occupancy's and population's exact terms and for
      // their exact reason: the numbers are the whole workspace's, counted over
      // tickets the caller may not see, so there is no per-viewer variant to
      // serve instead. The door runs before anything is read.
      if ((await door(request, workspaceId, 'admins-only')) === null) {
        return reply.code(404).send(READ_NOT_FOUND_BODY);
      }
      const body: TicketCountsResponse = {
        workspaceId,
        counts: await readTicketCounts(deps.pool, workspaceId),
      };
      return body;
    },
  );

  /** A refusal decided before any event was built: 422, and nothing appended. */
  function refuse(reply: FastifyReply, rule: string, reason: string): FastifyReply {
    const body: MigrationOutcome = { status: 'refused', rule, reason };
    return reply.code(422).send(body);
  }

  /**
   * The bulk rebind — the migration half of this task, and the only route here
   * that writes.
   *
   * ## It orchestrates; it never bypasses
   *
   * Every ticket moves by one `ticket.workflow_rebound` submitted through the
   * ORDINARY client door, `ingestClientBatch`. That is where the honesty already
   * lives: the event is in Plan 4's `ADMIN_ONLY_TYPES`, and Plan 3's checks
   * refuse an unknown target workflow or an unknown target state per event. This
   * route adds no authority of its own — it decides WHICH events to submit, and
   * refuses the whole request before submitting any if the request could not
   * honestly produce them.
   *
   * ## Its own admin gate, ahead of building anything
   *
   * Deferring the role question to ingest would still refuse a member — but only
   * after five envelopes had been built and five refusals returned, and the
   * caller could not tell that from a route with a gate. Case 7.45 asks for the
   * refusal "before a single event is built", so the gate is here, it runs
   * first, and it answers 404 on the same terms as state-occupancy and
   * population: 404 is what the two sibling admin-only routes on this path
   * prefix answer, and it leaks strictly less than the 403 Plan 4's invite list
   * uses. Recorded as a decision because the plan text names no status for it.
   *
   * ## "All-or-nothing" — what actually ships, and what does not
   *
   * The plan says "All-or-nothing inside ONE TRANSACTION: the batch commits
   * together or refuses together." **That is not what this route does, and it
   * cannot be from here.** `ingestClientBatch` commits one transaction PER
   * EVENT — that is its published contract, the thing that lets one bad event in
   * a batch fail without rolling back its neighbours — and a route may not reach
   * the internal append path at all (`AppDeps.ingest` is narrowed to
   * `ClientIngest` precisely so it cannot).
   *
   * What ships instead is Task 16's case 7.45, which is the achievable half:
   * every question that could refuse this batch is asked UP FRONT, over the
   * whole ticket set, before one envelope exists — so a refusal appends nothing,
   * and the answered `count` equals the events appended. The remaining window is
   * stated rather than papered over: if ingest refuses or fails PART WAY through
   * a batch it accepted the pre-flight of, earlier tickets stay moved. The
   * pre-flight covers every refusal `checkTicketWorkflowRebound` can produce
   * AND, since E6-10 (2026-09-21, case 7.266), the one the permission gate
   * produces ahead of the engine — `canSee` per ticket, which an `admin` fails
   * on a project-mode ticket outside their projects. Before that question was
   * asked here, an admin's migration moved the tickets they could see and was
   * refused on the first they could not, splitting the type across two
   * workflows under a `refused` the docblock had called unreachable. What is
   * still not covered: an infrastructure failure mid-batch, which is not a
   * refusal; and any refusal a LATER door adds that this pre-flight does not
   * mirror (a soft-deleted ticket of the type, if the ingest door comes to
   * refuse writes against one, is the next candidate — the SELECT below does
   * not filter `deleted_at`). Recorded against the plan's Task 9b text:
   * closing the window for good needs a batch-scoped ingest transaction,
   * which is a change to the ingest service and not to this route.
   */
  app.post<{ Params: { workspaceId: string; typeId: string } }>(
    '/v1/workspaces/:workspaceId/ticket-types/:typeId/migrate',
    { preHandler: requireSession },
    async (request, reply) => {
      const { workspaceId, typeId } = request.params;
      if ((await door(request, workspaceId, 'admins-only')) === null) {
        return reply.code(404).send(READ_NOT_FOUND_BODY);
      }
      const parsed = migrateBodySchema.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send(INVALID_MIGRATION_BODY);
      const { fromWorkflowId, toWorkflowId } = parsed.data;
      // A MAP, built from the body's OWN entries, and this is not a style
      // preference. `stateMap` arrives as a plain object, so `stateMap[stateId]`
      // walks the prototype chain: a ticket parked in a state whose id is
      // `toString` — legal, since `workflowStateSchema` declares
      // `id: z.string().min(1)` and nothing more — reads back as
      // `Object.prototype.toString`, which is not `undefined`. A coverage check
      // written that way calls the state MAPPED, builds the batch, commits every
      // genuinely-mapped ticket, and has the odd one refused by zod at ingest
      // for carrying a function as its `toStateId`. That is the partial
      // migration this route exists to prevent, reached through the one check
      // that makes "a refusal appends nothing" true. MEASURED, and pinned by
      // case 7.88, which reddens on the indexed form.
      const stateMap = new Map(Object.entries(parsed.data.stateMap));

      // Ruling 56(b), N2 (opus re-review, final fix wave round 2,
      // 2026-09-17): a caller-supplied KEY of `backlog` — the mirror of
      // naming it as a target (`{ todo: 'backlog' }`, refused loudly below
      // by `unknownTargetState` since backlog is never in `target.states`).
      // The dialog can never send this key (`stateMap` is built from
      // `fromWorkflow.states` only, and backlog is never one of those —
      // spec §1.1), so a hand-built request naming it was previously read
      // and then silently ignored: `toStateIdFor` always answers
      // `BACKLOG_STATE_ID` for a parked row (Ruling 52(a)) regardless of
      // what the map says for it, so an admin who believed they were
      // choosing a destination for parked tickets had that belief acted on
      // by nobody. Answered here, before any workspace lookup, because it
      // needs nothing but the caller's own body to judge.
      if (stateMap.has(BACKLOG_STATE_ID)) {
        return refuse(
          reply,
          MIGRATION_RULES.backlogNotMappable,
          `"backlog" cannot be a key in the map: parked tickets carry across as parked automatically and need no entry.`,
        );
      }

      // Three actor-supplied ids, all three resolved against the workspace the
      // door just approved. `proj_workflows` is keyed `(workflow_id, version)`
      // GLOBALLY (ruling P14), so an unscoped destination lookup would let an
      // admin bind their own workspace's live tickets to a definition belonging
      // to the tenant next door — which their workspace then cannot read.
      if (!(await ticketTypeExists(deps.pool, workspaceId, typeId))) {
        return reply.code(404).send(READ_NOT_FOUND_BODY);
      }
      const source = await getWorkflowDefFromProjection(deps.pool, workspaceId, fromWorkflowId);
      const target = await getWorkflowDefFromProjection(deps.pool, workspaceId, toWorkflowId);
      if (source === null || target === null) {
        return reply.code(404).send(READ_NOT_FOUND_BODY);
      }

      // Refused here rather than per event: the engine refuses a rebind to the
      // workflow a ticket is already on, and permitting it within one workflow
      // would be a universal transition-rule bypass. Asking once means the batch
      // is never built.
      if (fromWorkflowId === toWorkflowId) {
        return refuse(
          reply,
          MIGRATION_RULES.sameWorkflow,
          `A migration moves a type's tickets between two workflows; this one names ${fromWorkflowId} as both source and destination.`,
        );
      }

      const targetStates = new Set(target.states.map((state) => state.id));
      const targetCategoryOf = new Map(target.states.map((state) => [state.id, state.category]));
      const unknownTargets = [...new Set(stateMap.values())].filter((id) => !targetStates.has(id)).sort();
      if (unknownTargets[0] !== undefined) {
        return refuse(
          reply,
          MIGRATION_RULES.unknownTargetState,
          `Workflow "${target.name}" has no state ${unknownTargets.map((id) => `"${id}"`).join(', ')}, so the map cannot send anything there.`,
        );
      }

      const { rows: tickets } = await deps.pool.query<{ ticket_id: string; state_id: string; closed_at: Date | null }>(
        `SELECT ticket_id, state_id, closed_at
           FROM proj_tickets
          WHERE workspace_id = $1 AND type_id = $2 AND workflow_id = $3
          ORDER BY ticket_id`,
        [workspaceId, typeId, fromWorkflowId],
      );

      // E6-10: the permission gate's question, asked FIRST among the
      // per-ticket questions and through the gate's own function, so the two
      // cannot drift. `canSee` is what `checkVisibilityPermission` runs per
      // event; an owner reads the whole workspace and still pays `canSee`'s
      // two reads per ticket for an answer that is always yes, which is the
      // price of one source of truth over a second SQL expression of the
      // visibility table (`visibleTicketsWhere` is that second expression,
      // and its docblock names the drift it costs). First,
      // because it is the most fundamental refusal here: a caller who cannot
      // see part of the set cannot run this migration AT ALL as they are, and
      // sending them to fix the map before saying so would send them to fix
      // the one thing that was never the problem (`checks/hierarchy.ts`'s
      // ordering doctrine). Counted rather than named — the tickets are ones
      // the caller may not see, so the reason carries how many, not which.
      let hidden = 0;
      for (const row of tickets) {
        if (!(await canSee(deps.pool, request.currentUserId, row.ticket_id))) hidden += 1;
      }
      if (hidden > 0) {
        return refuse(
          reply,
          MIGRATION_RULES.notVisible,
          `${hidden} of the ${tickets.length} ticket${tickets.length === 1 ? '' : 's'} of this type ${hidden === 1 ? 'is' : 'are'} not visible to you; a migration moves every ticket of the type, so ask an owner to run it, or join the projects those tickets are in.`,
        );
      }

      // Every OCCUPIED state needs a target — EXCEPT `backlog`, which the
      // dialog can never map: `stateMap` is built from `fromWorkflow.states`
      // only (spec §1.1, backlog is never one of those), so a type holding
      // even one parked ticket was an unconditional `unmappedState` before
      // this exception existed, and there was no map the caller could have
      // sent to answer it (Amendment 3 forbids mapping anything INTO backlog,
      // so it is not merely unshowable — it is unmappable). Ruling 52(a),
      // Finding 2 (final whole-branch review, 2026-09-17): parked means
      // parked, so a `backlog` row is implicitly mapped to `BACKLOG_STATE_ID`
      // on every migration, the dialog unchanged. Every OTHER occupied state
      // is read from the tickets actually being moved rather than from the
      // source definition, so a state the definition still carries but nobody
      // is in does not have to be mapped, and a state the definition no
      // longer carries but somebody IS in still does. The dialog's contract
      // is about work, not about shapes.
      const unmapped = [...new Set(tickets.map((row) => row.state_id))]
        .filter((stateId) => stateId !== BACKLOG_STATE_ID && !stateMap.has(stateId))
        .sort();
      if (unmapped[0] !== undefined) {
        return refuse(
          reply,
          MIGRATION_RULES.unmappedState,
          `Tickets are sitting in ${unmapped.map((id) => `"${id}"`).join(', ')} and the map gives ${unmapped.length === 1 ? 'it' : 'them'} no target. Every occupied state needs one.`,
        );
      }

      /**
       * `stateMap.get(row.state_id)` for every row EXCEPT a parked one, which
       * always lands on `BACKLOG_STATE_ID` regardless of what (if anything)
       * `stateMap` names for it — the caller's map cannot express a backlog
       * destination at all (it is built from declared states only), so
       * reading it here would be asking a question the map was never able to
       * answer.
       */
      function toStateIdFor(row: { state_id: string }): string {
        return row.state_id === BACKLOG_STATE_ID ? BACKLOG_STATE_ID : (stateMap.get(row.state_id) as string);
      }

      // Backlog/closed spec §2.4 (Ruling 53(ii), Finding 5): closed ⇒ terminal
      // must survive a migration exactly as it must survive a rebind
      // (`checkTicketWorkflowRebound`, Ruling 53(i)) — the two are the same
      // invariant reached through the two mechanisms that move a ticket
      // across workflow versions without an ordinary transition. Asked here,
      // before a single event is built, for the same reason `unmappedState`
      // is: a closed row whose destination is not terminal is a refusal
      // `checkTicketWorkflowRebound` would give one event at a time, and this
      // route's whole contract (case 7.45) is that a refusal appends nothing.
      // A parked row's destination (`BACKLOG_STATE_ID`) is category `open`,
      // never terminal — reachable in principle, only ever unreachable
      // because every path that could leave a CLOSED ticket sitting in
      // `backlog` is itself gated elsewhere, named here rather than
      // asserted flat (hedged 2026-09-17, re-review nit; the four gates
      // named again by Ruling 56(a)'s own §2.4 paragraph): closing FROM
      // backlog refuses `close-requires-terminal` (backlog is `open`, never
      // terminal); transitioning a closed ticket, Send-to-backlog included,
      // refuses `closed-ticket`; rebinding a closed ticket onto backlog
      // refuses under 53(i) above (`stateCategoryOf` reads backlog's
      // category as `open`, so `'open' !== 'terminal'`); and a republish
      // never drops or maps backlog at all (`foldStateIdForward` returns
      // early for it) while a category-flip republish (Ruling 56(a)) moves
      // a declared state's CATEGORY, never its `stateId` — it cannot turn a
      // declared state INTO backlog either. So this fires only on a
      // genuinely declared-state target today, by those four gates holding
      // rather than by anything this route itself enforces — the category
      // map covers both shapes uniformly rather than special-casing one.
      const closedToNonTerminal = tickets.filter((row) => {
        if (row.closed_at === null) return false;
        const toStateId = toStateIdFor(row);
        const category = toStateId === BACKLOG_STATE_ID ? 'open' : targetCategoryOf.get(toStateId);
        return category !== 'terminal';
      });
      if (closedToNonTerminal.length > 0) {
        const states = [...new Set(closedToNonTerminal.map((row) => toStateIdFor(row)))].sort();
        return refuse(
          reply,
          MIGRATION_RULES.closedToNonTerminal,
          `${closedToNonTerminal.length} closed ticket${closedToNonTerminal.length === 1 ? ' is' : 's are'} mapped to a non-terminal state (${states.map((id) => `"${id}"`).join(', ')}); a closed ticket may only migrate to a terminal state.`,
        );
      }

      const events: SubmittedEvent[] = tickets.map((row) => ({
        id: newUlid(),
        workspaceId,
        entity: { kind: 'ticket', id: row.ticket_id },
        type: 'ticket.workflow_rebound',
        version: 1,
        // `toStateIdFor(row)` is defined for every row — the unmapped check
        // above is what makes that true for a declared state, and the
        // backlog exception makes it true for a parked one.
        payload: { toWorkflowId, toStateId: toStateIdFor(row) },
        actorId: request.currentUserId,
        // envelope-origin `'web'`: a person's claim that they migrated this
        // type, not the server's own record. The gate refuses a client-submitted
        // event wearing the server's provenance.
        origin: 'web',
        clientTime: new Date().toISOString(),
      }));

      const results = await deps.ingest.ingestClientBatch(events, request.currentUserId);
      const failure = results.find((result) => result.status !== 'committed');
      if (failure !== undefined) {
        // Reachable only through the window the docblock names: every refusal
        // `checkTicketWorkflowRebound` can produce, and the gate's `canSee`,
        // were asked up front over this exact ticket set. It is answered
        // rather than swallowed because a partial migration the caller was
        // not told about is worse than either population.
        return refuse(
          reply,
          failure.status === 'refused' ? failure.rule : `ingest.${failure.code}`,
          failure.status === 'refused' ? failure.reason : failure.message,
        );
      }
      const outcome: MigrationOutcome = { status: 'migrated', count: results.length };
      return outcome;
    },
  );
}
