import { ticketCreatedPayload, visibilitySetPayload, type EventEnvelope } from '@gisik-nokma/domain';
import type { Refusal } from '@gisik-nokma/rule-engine';
import type { Queryable } from '../db/queryable.js';
import { projectExists } from '../projections/proj-projects.js';
import { canSee, getResolvedVisibility } from '../visibility/can-see.js';
import { hasProjectAdminRights, resolveEffectiveRole, type EffectiveRole } from './effective-role.js';

/**
 * The one rule id every pre-engine permission refusal reports. Plan 4 Task 5's
 * plan text pins it, and Plan 6's UI maps rule names to what a person is shown,
 * so it gets one origin here rather than a literal at each call site that a
 * rename could half-land. Task 9 added `permission.visibility` and
 * `project.unknown` beside it.
 */
export const PERMISSION_ROLE_RULE = 'permission.role';

/**
 * The rule id for every refusal about WHO MAY SEE the thing an event touches,
 * plus the one coherence question that rides with it (a `visibility.set` whose
 * payload names a ticket other than the entity it is filed against).
 *
 * It is a SECOND id rather than a reuse of `permission.role` because the two
 * answer different questions and Plan 6's UI maps rule names to what a person
 * is shown: "you are not allowed to do this" and "this is not yours to see" are
 * different sentences, and the second must never imply the ticket exists to
 * someone told the first.
 *
 * Note what does NOT get this id: Task 9's checks 2 and 5 are write-AUTHORITY
 * questions that happen to be answered during the visibility pass, and they
 * report `permission.role`. See `checkVisibilityPermission`.
 */
export const PERMISSION_VISIBILITY_RULE = 'permission.visibility';

/**
 * The rule id for "the project this event names was never founded" (Task 9
 * Step 3b; owner decision 2026-08-26). Its own id, deliberately: reported as
 * `permission.role` it would be indistinguishable from the membership refusal
 * it exists to replace, and the whole point of the check is that the honest
 * reason wins where both would fire.
 */
export const PROJECT_UNKNOWN_RULE = 'project.unknown';

/**
 * The envelope-origin refusal's rule and reason, character for character.
 * `SERVER_ORIGIN_RULE` is kept as its own export — it was the contract the
 * origin micro-PR shipped and a rename here would be a silent API break — and
 * is defined as `PERMISSION_ROLE_RULE` so the two can never drift apart.
 */
export const SERVER_ORIGIN_RULE = PERMISSION_ROLE_RULE;
export const SERVER_ORIGIN_REASON = 'Only the server itself may record server-origin events.';

/** Refusal reasons, spelled once. Plan text pins every one of these sentences. */
export const IDENTITY_SPOOF_REASON = 'You cannot submit a claim as another person.';
export const NOT_A_MEMBER_REASON = 'You are not a member of this workspace.';
export const WORKSPACE_MEMBERSHIP_REASON =
  'Only a workspace owner or admin can manage workspace membership.';
export const PROJECT_ROSTER_REASON = 'Only a project admin can manage who is on this project.';
/** Task 9 check 2, the guest half — answered in `checkRolePermission`, which owes it. */
export const GUESTS_CANNOT_CREATE_TICKETS_REASON = 'Guests cannot create tickets.';
/** Task 9 check 2, the project half. No admin shortcut: an admin joins the project first, attributed. */
export const NOT_ON_PROJECT_REASON =
  'You are not a member of this project, so you cannot create tickets in it.';
/** Task 9 check 3. A claim must name the ticket it rides on. */
export const VISIBILITY_CLAIM_MISMATCH_REASON = 'This claim does not name the ticket it is attached to.';
/**
 * Task 9 check 4, and the ONE sentence answering both "you may not see it" and
 * "there is no such ticket" — `canSee` cannot tell them apart by design
 * (`../visibility/can-see.ts`), and giving them different sentences here would
 * rebuild the existence oracle Task 8's 404s removed one layer up.
 */
export const TICKET_NOT_VISIBLE_REASON = 'This ticket is not visible to you.';
/** Task 9 check 5. Reported as `permission.role`: it is authority, not audience. */
export const VISIBILITY_AUTHORITY_REASON =
  "Only a project admin or the ticket's creator can change who sees this ticket.";
/** Task 9 Step 3b. Names the project, because the id is the thing the sender got wrong. */
export function projectUnknownReason(projectId: string): string {
  return `There is no project ${projectId} in this workspace.`;
}
/** `role` is the actor's own workspace role — the refusal names what they are, not only what they are not. */
export function adminOnlyReason(role: string): string {
  return `Only a workspace owner or admin can do this. Your role is ${role}.`;
}

/** What one role check needs: who is really submitting, and what they are here. */
export interface PermissionContext {
  sessionUserId: string;
  eff: EffectiveRole;
  /**
   * Whether this workspace ALREADY HAS A LEDGER — any committed event at all,
   * not merely a `workspace.created` on some entity.
   *
   * REQUIRED, and required rather than optional-defaulting-to-`false` because
   * `false` is the permissive value: an optional field here would let every
   * call site that forgot it re-open the escalation below while typechecking
   * green.
   *
   * It exists because the founding bypass is otherwise unbounded. `workspace.created`
   * is the one type a non-member may submit — there is no membership to hold in
   * a workspace that does not exist yet — and NOTHING refuses a second
   * `workspace.created` naming a workspace that does. Without this flag a
   * stranger who knows a workspace's ULID submits one, the bypass admits it,
   * the entity↔workspace guard sees no mismatch, the engine has no case for the
   * type, it commits, and the founding sequence appends
   * `membership.granted {role: 'owner'}` for them. **Measured before the fix:
   * the attacker resolved as `owner` of a workspace they were never in, and the
   * workspace held 14 events instead of 7.** Direct `membership.granted` is
   * refused from below admin, so this was the only path in — which is what made
   * it load-bearing rather than incidental.
   *
   * Asked of the WORKSPACE and not of the event's entity, deliberately: a
   * variant of the same attack files the second `workspace.created` against a
   * FRESH entity id under the victim's `workspaceId`, which has no head row and
   * no per-entity seq to give it away. The only question that catches both is
   * whether this workspace has a history.
   */
  workspaceExists: boolean;
}

/**
 * What the ingest service hands the gate: the session the door authenticated,
 * and the handle to read membership through.
 *
 * `db` is the INGEST TRANSACTION's client, not the pool — see the note on
 * `SubmissionGate` below. Passing it in rather than closing over a pool is what
 * lets that be true.
 */
export interface SubmissionContext {
  db: Queryable;
  sessionUserId: string;
}

function refuse(reason: string): Refusal {
  return refuseWith(PERMISSION_ROLE_RULE, reason);
}

/**
 * A refusal under a rule id other than `permission.role`.
 *
 * `refuse` above is deliberately kept as the one-argument form: the role gate
 * has exactly one id and a two-argument call there would invite a caller to
 * pass the wrong one. Everything that needs a different id says so.
 */
function refuseWith(rule: string, reason: string): Refusal {
  return { refused: true, rule, reason };
}

/**
 * Event types only workspace owners/admins may ingest.
 *
 * `ticket.workflow_rebound` is here for a reason a reader would otherwise have
 * to reconstruct: migration re-homes work other people are doing. It moves a
 * ticket onto a different workflow, so the states it can reach, the rules
 * guarding them and the board column it appears in all change under whoever is
 * holding it. Ordinary ticket edits are a member's business; this is not
 * (coordination doc, "a ticket's workflow is pinned at creation, and moved only
 * deliberately"). Plan 3 owns the event and its structural refusals; the
 * question of WHO may emit it is this plan's.
 */
const ADMIN_ONLY_TYPES: ReadonlySet<string> = new Set([
  'workflow.defined',
  'ticket-type.defined',
  'project.created',
  'ticket.workflow_rebound',
]);

/**
 * **`origin` in this module is the event envelope's provenance enum — `'web' |
 * 'mobile' | 'desktop' | 'server'` (`EventEnvelope.origin`). It is NOT the
 * browser `Origin` header.** Nothing here concerns CSRF, cross-site requests or
 * any HTTP header; a reader who conflates the two writes a header check and
 * believes the envelope-origin forgery window is closed. Every name, comment
 * and test in this area says "envelope-origin" for that reason. The product's
 * HTTP-Origin posture is recorded in `../routes/events.ts`, which is a
 * different question with a different answer.
 *
 * ## What this checks
 *
 * Pure pre-engine role checks, in the order a refusal should be met:
 *
 * 1. **Actor identity.** A claim's `actorId` must be the session that submitted
 *    it. This is FIRST because it is the fact every later check depends on:
 *    resolving a role for a person who is not the submitter would answer a
 *    question nobody asked.
 * 2. **Envelope-origin.** A client may not wear the server's provenance.
 *    `contest.server-only` (`packages/rule-engine/src/contests.ts`) refuses a
 *    `claim.contested` whose envelope-origin is not `'server'` — it is the rule
 *    stopping a client forging the system's own record of a refusal. Nothing
 *    validated envelope-origin, so setting it to `'server'` walked straight
 *    past that rule; and because nothing binds a contest's embedded original
 *    event to the outer envelope, the reachable defect was not "forge the
 *    record of a refusal" but **write a permanent, un-deletable ledger entry
 *    attributing a fabricated claim to any actor in any workspace** — the
 *    ledger is append-only by trigger, so such a row could only ever be
 *    superseded, never removed.
 * 3. **Workspace founding.** `workspace.created` is the one type a non-member
 *    may submit, and ONLY into a workspace that does not exist yet — see
 *    `PermissionContext.workspaceExists`, which is the whole difference between
 *    a founding and a privilege escalation. It returns before the membership
 *    check rather than being listed as an exception inside it, so the bypass is
 *    one line a reader can see, with its one condition beside it.
 * 4. **Membership.** Everything else needs a workspace-scope role. `null` means
 *    not a member at all, and `resolveEffectiveRole` guarantees that when it is
 *    null the project set is empty too — so no project-scope row left standing
 *    by a legitimate rebuild can confer anything here.
 * 5. **Role.** Admin-only types, workspace membership management, project
 *    roster management, and a guest's ticket-creation ceiling (Task 9 check 2,
 *    guest half), each with the sentence that names what was missing.
 *
 * ## What this does NOT check — named, not summarised
 *
 * The coordination doc's ruling asks this module to name the checks it does not
 * yet perform rather than to label itself partial, because "deliberately
 * partial" ages into background noise while a list of absences stays
 * actionable. What follows is that register, and it lists ABSENCES — questions
 * nothing here asks — not degrees of doneness.
 *
 * What Task 5 closed, precisely, is checks 1–5 above: actor identity (1),
 * envelope-origin (2), the founding bypass bounded by `workspaceExists` (3),
 * workspace membership (4), and inside the role check (5) three questions —
 * admin-only event TYPES, workspace-membership management, and project-roster
 * management. Task 9 added a fourth to check 5 (a guest may not create
 * tickets), and closed elsewhere in this module, under the ratified orderings
 * their own docblocks name, the three items this list carried as 5a–5c and the
 * whole of the visibility entry. "Role" as a whole is STILL NOT closed, and
 * saying it was is the trap this list previously set: role is several
 * questions, and an implementer who reads it as one goes looking for somewhere
 * other than `checkRolePermission` to put the ones still missing.
 *
 * ### Removed from this register by Task 9, and where each one went
 *
 * Recorded rather than deleted, because two of the three did NOT land where
 * this list said they would, and a reader who finds them missing from
 * `checkRolePermission` needs to be told why rather than left to conclude they
 * were dropped.
 *
 * - **5a — a guest creating a ticket.** Closed HERE, in `checkRolePermission`,
 *   exactly as this register asked. It needs no lookup.
 * - **5b — a non-guest on the target project.** Closed in
 *   `checkVisibilityPermission`, still reporting `permission.role`. It must be
 *   sequenced after `checkProjectExists` (owner decision 2026-08-26), and a
 *   pure function cannot run after a database read.
 * - **5c — project-admin rights or creatorship on `visibility.set`.** Closed in
 *   `checkVisibilityPermission`, still reporting `permission.role`. It must run
 *   after `canSee` or it is an existence oracle — see that function's docblock.
 * - **Visibility.** Closed: `checkVisibilityPermission` calls `canSee` for
 *   every ticket-entity event, and `permission.visibility` now exists.
 *
 * The register's underlying rule is intact and is worth restating in the form
 * that survived: a `permission.role` refusal must be made by code that OWNS
 * that rule id. Both gate halves and all three id constants live in this one
 * module, and every refusal is built from an exported constant, so no half can
 * invent its own string.
 *
 * ### Still absent — questions nothing in this module asks
 *
 * - **Every WORKSPACE-entity event but `workspace.created`.** MEASURED on main
 *   at Task 9: a workspace GUEST is ADMITTED for `workspace.renamed`. It is not
 *   in `ADMIN_ONLY_TYPES`, it is not membership or roster management, and
 *   Task 9's check 1 examines ticket entities only — so nothing anywhere asks
 *   who may rename a workspace. Renaming is not destructive and the ledger
 *   attributes it, which is why this is an absence and not an emergency; but a
 *   guest renaming the container they were invited into is nobody's intent.
 *   Deliberately NOT closed here: which roles may rename a workspace is a
 *   product decision no plan in this series has taken, and adding a type to
 *   `ADMIN_ONLY_TYPES` on this task's own authority would be taking it.
 * - **Every non-ticket, non-workspace entity's ordinary events.** Check 1 is an
 *   entity-kind filter, so `workflow`, `ticket-type`, `project` and `membership`
 *   events get the role gate and nothing more. That is right for the types the
 *   role gate already names and unexamined for any it does not.
 * - **The read paths and sync-down.** This module is the INGEST door. Task 8
 *   enforces `canSee` on the three ticket read routes; sync-down filtering is
 *   Task 11 and is not built. A door that does not exist cannot be closed, and
 *   `POST /v1/sync` (Plan 10) must call `ingestClientBatch` when it is built or
 *   offline-originated events bypass all of the above.
 * - **Project scope on membership grants, beyond existence.** Task 9 Step 3b
 *   validates that a project named by `project.member_added` /
 *   `project.member_removed` EXISTS. Nothing asks whether the user being added
 *   is a member of the workspace that owns it — a roster row for a stranger is
 *   inert today, because `resolveEffectiveRole` yields no projects without a
 *   workspace role, but it is inert by a guarantee elsewhere rather than by a
 *   refusal here.
 *
 * Each closed check is accounted for above rather than deleted silently, and
 * each open one is stated as a question nobody asks rather than as a degree of
 * doneness, so the diff between "absent" and "present" stays legible in both
 * directions.
 *
 * ## Which doors this closes
 *
 * Applied per call, by the ingest service's client entry point
 * (`ingestClientBatch`), NOT to every append. That distinction is the whole
 * design: the value of envelope-origin is not what makes an event a forgery —
 * the door it arrived through is. The server's own appends are legitimately
 * server-origin (Task 5's workspace bootstrap, Task 14's invite acceptance) and
 * reach the ledger through `ingestBatch` without knocking on this gate. Routing
 * the bootstrap through the client door instead would refuse the founding
 * sequence at step 2 above and leave every new workspace unusable.
 *
 * - **CLOSED:** `POST /v1/events`, which calls `ingestClientBatch` with the
 *   session `requireSession` resolved.
 * - **NOT CLOSED, by design:** direct `ingestBatch` — the internal append path.
 * - **NOT CLOSED, because it does not exist yet:** `POST /v1/sync` (Plan 10).
 *   **When it is built it must call `ingestClientBatch`**, or offline-originated
 *   events bypass this gate entirely.
 *
 * ## Do not fold this into `IngestDeps.gates`
 *
 * Decision 15's `gates` are construction-time and unconditional: they run for
 * every caller of the ingest service. A construction-time gate cannot tell one
 * door from another, which is exactly what this check needs to do, so tidying
 * it into `gates` would refuse the server's own bootstrap appends.
 */
export function checkRolePermission(env: EventEnvelope, ctx: PermissionContext): Refusal | null {
  if (env.actorId !== ctx.sessionUserId) {
    return refuse(IDENTITY_SPOOF_REASON);
  }
  if (env.origin === 'server') {
    return refuse(SERVER_ORIGIN_REASON);
  }
  if (env.type === 'workspace.created' && !ctx.workspaceExists) {
    return null; // founding a workspace needs a session, not a membership
  }

  const role = ctx.eff.workspaceRole;
  if (role === null) {
    return refuse(NOT_A_MEMBER_REASON);
  }
  const isWorkspaceAdmin = role === 'owner' || role === 'admin';

  if (ADMIN_ONLY_TYPES.has(env.type) && !isWorkspaceAdmin) {
    return refuse(adminOnlyReason(role));
  }
  // Membership is workspace-scoped only now (owner decision 2026-08-27), so
  // this is one question rather than a branch on scope: managing who is IN the
  // workspace is an owner/admin matter. Who is ON a project is the next check,
  // and it is a different question with a different answer — a project admin
  // runs their project's roster, not the workspace's door.
  if (env.type === 'membership.granted' || env.type === 'membership.revoked') {
    if (!isWorkspaceAdmin) {
      return refuse(WORKSPACE_MEMBERSHIP_REASON);
    }
  }
  if (env.type === 'project.member_added' || env.type === 'project.member_removed') {
    // `env.entity.id` is the PROJECT: both roster events are filed against the
    // project entity (vocabulary.ts), which is what makes this one lookup and
    // not a payload read.
    if (!hasProjectAdminRights(ctx.eff, env.entity.id)) {
      return refuse(PROJECT_ROSTER_REASON);
    }
  }
  // A guest's write ceiling on ticket creation (Task 9 check 2, guest half).
  // MEASURED before this line existed: a workspace guest was ADMITTED for
  // `ticket.created` here, and the visibility pass could not have covered it —
  // `ticket.created` names no existing ticket, so there is no audience to ask
  // about, and the refusal is owed by the role check.
  //
  // Only the guest half lives here. The other half of check 2 — is a non-guest
  // ON the target project — is NOT in this function, and that is forced rather
  // than chosen: the owner decision of 2026-08-26 requires the project
  // EXISTENCE check to run before the project MEMBERSHIP check so the honest
  // reason wins where both would fire, and existence is a database question
  // this pure function cannot ask. It runs in `checkVisibilityPermission`,
  // after `checkProjectExists`, and still reports `permission.role`.
  if (env.type === 'ticket.created' && role === 'guest') {
    return refuse(GUESTS_CANNOT_CREATE_TICKETS_REASON);
  }
  return null;
}

/**
 * What a check that reads projections needs on top of a role: the handle.
 *
 * Deliberately `PermissionContext` PLUS `db` rather than a separate shape, so
 * the two halves of one gate carry one context. `workspaceExists` rides along
 * unused by visibility — required, not optional, for the reason its own
 * docblock gives — because a second context type would be a second place to
 * forget it.
 */
export interface VisibilityContext extends PermissionContext {
  db: Queryable;
}

/**
 * The project this event NAMES, or null if it names none.
 *
 * `membership.granted` / `membership.revoked` name no project: membership is
 * workspace-scoped since the 2026-08-27 collapse, and their payload schema
 * refuses a scope outright. Project association is the two roster events below,
 * and they are filed AGAINST the project entity, so the id is `env.entity.id`
 * and not a payload read.
 *
 * `project.created` returns null on purpose — it is the event bringing the
 * project into existence, and asking whether it exists first would make
 * founding one impossible.
 */
function projectNamedBy(env: EventEnvelope): string | null {
  switch (env.type) {
    case 'ticket.created':
      return ticketCreatedPayload.parse(env.payload).projectId;
    case 'project.member_added':
    case 'project.member_removed':
      return env.entity.id;
    default:
      return null;
  }
}

/**
 * Does the project this event names exist in this workspace? (Task 9 Step 3b;
 * owner decision 2026-08-26.)
 *
 * ## What covered this by accident, and why that was not coverage
 *
 * `checkVisibilityPermission` refuses an actor who is not on the target
 * project, so a fabricated `projectId` was usually refused — nobody is a member
 * of a project that does not exist. But `ctx.eff.projects` is built from
 * `project.member_added`, which accepts any ULID as a project scope without
 * validating it either. Grant yourself membership on a project id nobody
 * founded and the ticket was ACCEPTED: it landed in `proj_visibility` with a
 * dangling `project_id`, on no board and in no project list, and nobody was
 * told. That is the path the hole was actually reachable through, which is why
 * this check covers the roster events too and not only ticket creation.
 *
 * ## The ordering is the point
 *
 * This runs BEFORE the project-membership check, so where both would fire the
 * honest reason wins: a person creating a ticket in a project that does not
 * exist is told the project does not exist, not that they are not a member of
 * it. A refusal that happens to fire for the wrong reason is not coverage — it
 * leaves the gap open on every path where the coincidence does not hold, and
 * tells the user something false on the paths where it does.
 *
 * It runs AFTER `checkRolePermission`, so a non-member of the WORKSPACE is
 * still told `NOT_A_MEMBER_REASON` first. That is deliberate and is the bound
 * on the ordering claim above: someone with no standing in the workspace may
 * not use this check to enumerate which project ids exist in it.
 */
export async function checkProjectExists(db: Queryable, env: EventEnvelope): Promise<Refusal | null> {
  const projectId = projectNamedBy(env);
  if (projectId === null) {
    return null;
  }
  if (await projectExists(db, env.workspaceId, projectId)) {
    return null;
  }
  return refuseWith(PROJECT_UNKNOWN_RULE, projectUnknownReason(projectId));
}

/**
 * Who created this ticket, read from the LEDGER rather than from a projection.
 *
 * There is no projection to read it from: `proj_tickets` does not exist on this
 * branch (Plan 3 Task 12 owns it) and `proj_visibility` has no creator column.
 * Inventing one here would be a second, competing definition of another plan's
 * head state — the same thing Task 8 refused to do for a ticket's title.
 *
 * The ledger is not a fallback, it is the primary source: `events.actor_id` on
 * the `ticket.created` row IS the creatorship claim, and every projection that
 * will ever carry `created_by` derives it from exactly this row. Reading
 * `events` from this module has precedent in `workspaceHasLedger` below, and
 * the access path is the `UNIQUE (entity_kind, entity_id, seq)` index.
 *
 * `ORDER BY seq LIMIT 1` rather than a bare read: a ticket has exactly one
 * `ticket.created` today, and taking the FIRST is the answer that stays correct
 * if a re-creation claim ever becomes expressible.
 *
 * Returns null for a ticket with no creating event, which is not the same as
 * "the caller is not the creator" only because `sessionUserId` is a non-empty
 * string and can never equal null.
 */
async function getTicketCreator(db: Queryable, ticketId: string): Promise<string | null> {
  const { rows } = await db.query<{ actor_id: string }>(
    `SELECT actor_id FROM events
     WHERE entity_kind = 'ticket' AND entity_id = $1 AND type = 'ticket.created'
     ORDER BY seq
     LIMIT 1`,
    [ticketId],
  );
  return rows[0]?.actor_id ?? null;
}

/**
 * The visibility-dependent half of the gate (Plan 4 Task 9). Async because it
 * reads projections and the ledger; runs after `checkRolePermission` and after
 * `checkProjectExists`, still before the rule engine.
 *
 * ## The five checks, in the order a refusal should be met
 *
 * 1. **Ticket-entity events only.** Everything else passed the role gate
 *    already and has no audience to ask about.
 * 2. **`ticket.created`.** The actor must be ON the target project. There is
 *    deliberately NO admin shortcut: an admin who wants to create work in a
 *    project joins it first, which is an attributed event, rather than reaching
 *    in unrecorded. The guest half of this check is not here — it is in
 *    `checkRolePermission`, which owes it and can answer it purely.
 * 3. **`visibility.set` coherence.** A claim whose `payload.ticketId` disagrees
 *    with the entity it is filed against is refused BEFORE anything is looked
 *    up: it does not name the ticket it rides on, so there is no question to
 *    ask yet. `proj_visibility` keys on the entity regardless (case 6.55), so
 *    without this refusal one ticket's stream authors another ticket's audience.
 * 4. **Everything else about a ticket** — transition, assign, comment, field
 *    set, reparent, and `visibility.set` itself — requires `canSee`. This is
 *    also exactly the guest constraint: a guest's `canSee` is true only for
 *    tickets an explicit list names them in, so "guests may only act on tickets
 *    explicitly visible to them" falls out of the same line rather than needing
 *    a guest branch of its own.
 * 5. **`visibility.set` authority.** Project-admin rights on the ticket's own
 *    project, or ticket creatorship. Reported as `permission.role`.
 *
 * ## Why checks 2 and 5 report `permission.role` from HERE
 *
 * They are write-AUTHORITY questions, not audience questions, and the register
 * in `checkRolePermission` above says such refusals are owed by the role check.
 * Two ratified decisions move them anyway, and neither is a preference:
 *
 * - **Check 2's project half** must run after `checkProjectExists` (owner
 *   decision 2026-08-26), and that check reads a table. A pure function cannot
 *   be sequenced after a database read.
 * - **Check 5 must run after check 4**, or it becomes an EXISTENCE ORACLE. Run
 *   first, it answers a workspace admin differently for a ticket that does not
 *   exist (no resolved visibility, no creator → the authority refusal) than for
 *   one that exists and is invisible to them (they hold admin rights → the
 *   audience refusal). Task 8 spent a whole commit making those two cases
 *   indistinguishable on the read path; rebuilding the distinction at the
 *   ingest door would put the oracle back one layer down.
 *
 * What the register's rule was really protecting is that a `permission.role`
 * refusal must come from the code that owns that id — and it does: both
 * functions and both id constants live in this one module. The rule ids are
 * exported constants with one origin, so neither half can drift into inventing
 * its own string.
 */
export async function checkVisibilityPermission(
  env: EventEnvelope,
  ctx: VisibilityContext,
): Promise<Refusal | null> {
  if (env.entity.kind !== 'ticket') {
    return null;
  }

  if (env.type === 'ticket.created') {
    // The project exists — checkProjectExists ran first — so this refusal now
    // means what it says rather than standing in for a nonexistent project.
    const payload = ticketCreatedPayload.parse(env.payload);
    if (!ctx.eff.projects.has(payload.projectId)) {
      return refuse(NOT_ON_PROJECT_REASON);
    }
    return null;
  }

  if (env.type === 'visibility.set') {
    const payload = visibilitySetPayload.parse(env.payload);
    if (payload.ticketId !== env.entity.id) {
      return refuseWith(PERMISSION_VISIBILITY_RULE, VISIBILITY_CLAIM_MISMATCH_REASON);
    }
  }

  if (!(await canSee(ctx.db, ctx.sessionUserId, env.entity.id))) {
    return refuseWith(PERMISSION_VISIBILITY_RULE, TICKET_NOT_VISIBLE_REASON);
  }

  if (env.type === 'visibility.set') {
    // The project is the TICKET's, read from its own resolved row — never the
    // actor's, and never a project id from the payload, which this event does
    // not carry and could not be trusted with if it did.
    const visibility = await getResolvedVisibility(ctx.db, env.entity.id);
    const creatorId = await getTicketCreator(ctx.db, env.entity.id);
    const allowed =
      (visibility !== null && hasProjectAdminRights(ctx.eff, visibility.projectId)) ||
      ctx.sessionUserId === creatorId;
    if (!allowed) {
      return refuse(VISIBILITY_AUTHORITY_REASON);
    }
  }

  return null;
}

/**
 * The single permission gate the ingest service applies at the client door.
 *
 * Reads the role through `resolveEffectiveRole` and NEVER through a direct
 * `proj_memberships` SELECT: a bare project-scope read can return a row for
 * someone no longer in the workspace (see `./effective-role.ts`, and the table
 * comment on the migration). `resolveEffectiveRole` is the only safe reader.
 *
 * Three passes, one context, and the ORDER is load-bearing at both seams:
 *
 * 1. `checkRolePermission` — pure, and first because a claim from someone who
 *    is not here at all should not cause a single lookup.
 * 2. `checkProjectExists` — before any membership question about a project, so
 *    a nonexistent project is reported as one (owner decision 2026-08-26).
 * 3. `checkVisibilityPermission` — the audience questions, plus the two write-
 *    authority questions that had to be sequenced after a database read.
 *
 * The call site is unchanged: this is still the one `SubmissionGate` the ingest
 * pipeline applies at the client door.
 */
export async function checkPermission(
  env: EventEnvelope,
  ctx: SubmissionContext,
): Promise<Refusal | null> {
  const eff = await resolveEffectiveRole(ctx.db, ctx.sessionUserId, env.workspaceId);
  const permissionContext: VisibilityContext = {
    db: ctx.db,
    sessionUserId: ctx.sessionUserId,
    eff,
    workspaceExists: await workspaceHasLedger(ctx.db, env.workspaceId),
  };

  const roleRefusal = checkRolePermission(env, permissionContext);
  if (roleRefusal !== null) {
    return roleRefusal;
  }
  const projectRefusal = await checkProjectExists(ctx.db, env);
  if (projectRefusal !== null) {
    return projectRefusal;
  }
  return checkVisibilityPermission(env, permissionContext);
}

/**
 * Has this workspace any committed history at all?
 *
 * `EXISTS` over `events`, not a head-row lookup on the event's own entity: the
 * escalation this answers has a variant that files its second
 * `workspace.created` against a fresh entity id, which has no head row. The
 * ledger's `(workspace_id, workspace_seq)` unique index is the access path.
 *
 * Called inside the ingest transaction, which already holds this workspace's
 * lock, so no concurrent founding can slip between this read and the insert.
 */
async function workspaceHasLedger(db: Queryable, workspaceId: string): Promise<boolean> {
  const { rows } = await db.query<{ present: boolean }>(
    'SELECT EXISTS (SELECT 1 FROM events WHERE workspace_id = $1) AS present',
    [workspaceId],
  );
  return rows[0]?.present === true;
}

/**
 * The per-call gate the ingest service applies to client-submitted batches.
 *
 * ASYNC and context-carrying since Task 5. The predecessor was
 * `(env) => Refusal | null`; widening it is a breaking signature change, swept
 * per Ruling P17 across code AND plan text (Plan 4 Task 9's samples, and this
 * plan's own Task 5 samples, are annotated where a future implementer would
 * copy them).
 *
 * `SubmissionContext.db` is the ingest transaction's own client, passed down
 * from `commitOne`, and that is load-bearing rather than tidy: the membership
 * read must see the world the workspace lock has already settled. Rewriting the
 * call site to hand it `deps.pool` would compile, pass every test, and open a
 * window in which a concurrently-committed `membership.revoked` is invisible to
 * the gate that is about to judge the revoked person's next claim.
 */
export type SubmissionGate = (env: EventEnvelope, ctx: SubmissionContext) => Promise<Refusal | null>;
