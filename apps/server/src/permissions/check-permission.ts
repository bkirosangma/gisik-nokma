import type { EventEnvelope } from '@gisik-nokma/domain';
import type { Refusal } from '@gisik-nokma/rule-engine';
import type { Queryable } from '../db/queryable.js';
import { hasProjectAdminRights, resolveEffectiveRole, type EffectiveRole } from './effective-role.js';

/**
 * The one rule id every pre-engine permission refusal reports. Plan 4 Task 5's
 * plan text pins it, and Plan 6's UI maps rule names to what a person is shown,
 * so it gets one origin here rather than a literal at each call site that a
 * rename could half-land. Task 9 adds `permission.visibility` beside it.
 */
export const PERMISSION_ROLE_RULE = 'permission.role';

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
  return { refused: true, rule: PERMISSION_ROLE_RULE, reason };
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
 * 5. **Role.** Admin-only types, workspace membership management, and project
 *    roster management, each with the sentence that names what was missing.
 *
 * ## What this does NOT check — named, not summarised
 *
 * The coordination doc's ruling asks this module to name the checks it does not
 * yet perform rather than to label itself partial, because "deliberately
 * partial" ages into background noise while a list of absences stays
 * actionable. As of Task 5 exactly one absence remains:
 *
 * - **Visibility.** Nothing asks whether the actor may SEE the entity the event
 *   touches. A member of the workspace who is on no project, or who is a guest
 *   outside every explicit audience, is still admitted here for ordinary ticket
 *   work; `permission.visibility` does not exist yet (Task 9), and
 *   `checkVisibilityPermission` will run after `checkRolePermission` inside
 *   `checkPermission` when it does.
 *
 * Task 5 closed the other three that stood here — actor identity, role and
 * membership — and each is now numbered above rather than deleted silently, so
 * the diff between "absent" and "present" stays legible.
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
 * Task 9 extends this with the visibility-dependent checks, between the role
 * refusal and the `null` below.
 */
export async function checkPermission(
  env: EventEnvelope,
  ctx: SubmissionContext,
): Promise<Refusal | null> {
  const eff = await resolveEffectiveRole(ctx.db, ctx.sessionUserId, env.workspaceId);
  return checkRolePermission(env, {
    sessionUserId: ctx.sessionUserId,
    eff,
    workspaceExists: await workspaceHasLedger(ctx.db, env.workspaceId),
  });
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
