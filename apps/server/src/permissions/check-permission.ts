import {
  groupCreatedPayload,
  groupRenamedPayload,
  inviteSentPayload,
  membershipGrantedPayload,
  membershipRevokedPayload,
  noteAttachedPayload,
  noteCreatedPayload,
  noteDetachedPayload,
  projectCreatedPayload,
  projectUpdatedPayload,
  ticketAssignedPayload,
  ticketCollaboratorPayload,
  ticketCreatedPayload,
  visibilitySetPayload,
  type EventEnvelope,
} from '@gisik-nokma/domain';
import { REFUSAL_RULES, type Refusal } from '@gisik-nokma/rule-engine';
import type { Queryable } from '../db/queryable.js';
import { projectExists } from '../projections/proj-projects.js';
import { getTicketStateFromDb } from '../projections/tickets.js';
import { projectPrefixesInWorkspace } from '../read/visible-projects.js';
import { canSee, getResolvedVisibility } from '../visibility/can-see.js';
import { canReadNote, loadNoteForVisibility, noteArmReach } from '../visibility/can-read-note.js';
import { checkLifecycle } from './check-lifecycle.js';
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
 * A project founded under a prefix another project in the same workspace
 * already answers to (owner ruling 2026-09-20). Its own id because it is not a
 * role question and not a visibility one: the caller is allowed to found a
 * project, and is being asked to choose a different half of its key.
 */
export const PROJECT_PREFIX_TAKEN_RULE = 'project.prefix-taken';

/**
 * The project-group door's rule ids (prefixes and groups plan Task 6). Their own
 * ids, none of them `permission.role`: the caller MAY file groups, and is being
 * told which tree rule the claim breaks.
 */
export const GROUP_UNKNOWN_RULE = 'group.unknown';
export const GROUP_LEVEL_MISMATCH_RULE = 'group.level-mismatch';
export const GROUP_NAME_TAKEN_RULE = 'group.name-taken';
export const GROUP_IN_USE_RULE = 'group.in-use';
export const GROUP_HAS_CHILDREN_RULE = 'group.has-children';
/** `project.updated {groupId}` naming a group that is not a live group of this workspace. */
export const PROJECT_GROUP_UNKNOWN_RULE = 'project.group-unknown';

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
/**
 * Plan 4 Task 13, case 6.52. The member half of the founding bound — the
 * non-member half is `NOT_A_MEMBER_REASON` above, and the two stay separate
 * sentences because they name different faults: one says you do not belong
 * here, the other says the thing you are claiming has already happened.
 */
export const WORKSPACE_ALREADY_FOUNDED_REASON =
  'This workspace has already been founded; it cannot be founded again.';
export const WORKSPACE_MEMBERSHIP_REASON =
  'Only a workspace owner or admin can manage workspace membership.';
/**
 * The rename ruling, 2026-09-19. Renaming is the container's identity rather
 * than its membership, so it is the same owner/admin question as the sentence
 * above — but it names the ACT, because a person who tried to rename a
 * workspace should be told that, not told about membership.
 *
 * Exported rather than inlined, unlike the `workspace.settings_set` sentence
 * beside its check: this one is the subject of a ruling that closed a measured
 * absence, and a test pins the sentence itself so the ruling cannot be re-opened
 * by an edit that quietly changes what the refusal says.
 */
export const WORKSPACE_RENAME_REASON = 'Only a workspace owner or admin can rename a workspace.';
/**
 * Trash series, Plan 1 Task 3 (spec §4 "Authority"). Archive, restore, delete,
 * undelete, mark and unmark are all the SAME question for a workspace —
 * "does this actor own the workspace" — unlike `workspace.renamed` and
 * `workspace.settings_set` above, which `isWorkspaceAdmin` (owner OR admin)
 * answers. Deliberately narrower: an admin who could delete or purge-mark a
 * workspace could take away every member's access to it, which is a step
 * beyond configuration or a name change.
 */
export const WORKSPACE_OWNER_ONLY_REASON =
  'Only the workspace owner can archive, delete or restore a workspace.';
/**
 * The narrower refusal that rides WITH the one above, never instead of it
 * (owner ruling 2026-09-18): the senders who may grant membership are an admin
 * question, and among them the senders who may grant the OWNER role are an
 * owner question.
 *
 * It exists because `isWorkspaceAdmin` is `role === 'owner' || role === 'admin'`
 * — deliberately wide, and right for roster management — while granting
 * ownership is a transfer of the workspace itself. An admin who could write
 * `membership.granted { role: 'owner' }` had an escalation that needed no
 * guard to defeat: they could demote the sole owner and promote themselves, in
 * two events, with the last-owner guard also in place, because at no point did
 * the workspace have zero owners — only zero of the ORIGINAL owner's role.
 */
export const WORKSPACE_OWNER_GRANT_REASON = 'Only a workspace owner can grant the owner role.';
/**
 * The MIRROR of the sentence above, ruled the same day (owner, 2026-09-18,
 * second sitting): *"may an admin demote a non-last owner: **no**."*
 *
 * It exists because the guard and this gate each closed half a door and the two
 * halves did not meet. `grant-owner-requires-owner` refuses a payload that
 * GRANTS `owner`; `last-owner` refuses a change that would leave the workspace
 * with ZERO owners. Neither has anything to say about an admin demoting an
 * owner **while another owner remains** — so an admin could do it, and the
 * projection's `ON CONFLICT … DO UPDATE SET role = excluded.role` would write
 * it. Ownership is a transfer of the workspace itself, which is the whole
 * reason the grant half is owner-only; the removal half is the same act read
 * backwards, and it was open.
 */
export const WORKSPACE_OWNER_REMOVE_REASON =
  'Only a workspace owner can remove the owner role from a member.';
export const PROJECT_ROSTER_REASON = 'Only a project admin can manage who is on this project.';
/**
 * Task 9 check 2, the guest half — answered in `checkRolePermission`, which owes
 * it.
 *
 * ⚠ **Renamed and re-worded by the notes series (Plan 1 of 6).** The rule now
 * covers `note.created` as well as `ticket.created` — one predicate, because it
 * is one rule: putting a note in a workspace is the same act of authorship. The
 * old name (`…TICKETS_REASON`) and the old sentence (*"Guests cannot create
 * tickets."*) would both have been false about the note case, so a guest trying
 * to write a note would have been told about a thing they did not attempt. The
 * one test that pinned the old sentence is updated in the same commit, and it
 * reddens on the REASON deliberately (`check-visibility-permission.test.ts`) —
 * which is what makes this rename a checked change rather than a silent one.
 */
export const GUESTS_CANNOT_CREATE_REASON = 'Guests cannot create tickets or notes.';
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
/**
 * E6-17 (2026-09-21). The person a `ticket.assigned` or
 * `ticket.collaborator_added` NAMES must hold a role in the ticket's workspace.
 * Reported as `permission.role` because it is a role question — the named
 * person's, resolved through the same `resolveEffectiveRole` the gate reads
 * the actor's through — and never as a visibility one: whether the actor may
 * act on the ticket was already settled a line above, and nothing about the
 * ticket is disclosed by a sentence about somebody's membership.
 */
export const NAMED_PERSON_NOT_IN_WORKSPACE_REASON = 'That person is not in this workspace.';
/** Task 9 check 5. Reported as `permission.role`: it is authority, not audience. */
export const VISIBILITY_AUTHORITY_REASON =
  "Only a project admin or the ticket's creator can change who sees this ticket.";
/**
 * Soft delete's authority refusal, and it is a FUNCTION rather than a constant
 * for the same reason `parentTerminalRefusal` is one in the rule engine: the
 * sentence is otherwise identical for the flag's two acts, and the one word
 * that differs — whether the actor was trying to delete or to restore — is the
 * word they need in order to understand what just happened. A single constant
 * saying "delete" would tell somebody whose UNDO was refused that they may not
 * delete, which is the opposite of what they asked for.
 *
 * It names a person who can act, which is what makes it remediable: the sheet's
 * `serverRefusal` surface renders `rule: reason` verbatim, and the UI does not
 * gate on role at all — this door is the only party that knows.
 */
export function ticketDeleteAuthorityReason(act: 'delete' | 'restore' | 'mark' | 'unmark'): string {
  return `Only a project admin can ${act} a ticket.`;
}
/**
 * `ticket.deleted` / `ticket.restored` on a ticket whose row `proj_tickets` does
 * not hold, while `proj_visibility` says the actor may see it.
 *
 * Unreachable through the shipped door (one ingest transaction writes both
 * projections or rolls back), so this is a projection/ledger disagreement
 * rather than a user error — the single-ticket route throws on the same pair
 * (`routes/tickets.ts`). It is refused rather than thrown here because this is
 * the ingest gate: a 500 on a corrupt row would be a worse answer than a
 * refusal, and refusing is the direction that cannot widen anyone's authority.
 */
export const TICKET_DELETE_UNRESOLVED_REASON =
  'This ticket could not be read, so it cannot be deleted or restored.';
/**
 * Task 14. `invite.accepted` is refused from EVERY client envelope-origin, at
 * every role including owner.
 *
 * Acceptance is the moment an address-shaped claim becomes a person, and the
 * thing entitled to make that binding is PROOF, of which the product now accepts
 * two: possession of the link's token, and (Task 17) a verified email equal to
 * the address the invitation names. Both are demonstrated to the SERVER, at a
 * route, and neither can be demonstrated by an event — which is what this
 * refusal is about and why it is unchanged by the second one arriving.
 *
 * A client-submitted `invite.accepted` names an `inviteId` and a `userId` and
 * carries no proof of either kind — so without this refusal an admin who reads
 * an inviteId out of the workspace's own history could bind any pending
 * invitation to any user, themselves included, having never seen the link and
 * holding no claim on the address. The event id and the inviteId are both in the
 * ledger by design; only the token is not.
 *
 * *This paragraph used to say the token was the ONLY entitlement, and the
 * SENTENCE below used to say acceptance happens "when the invited person opens
 * their link". Both were true when written and stopped being true at Task 17.
 * The docblock is what the next editor reasons from; the sentence is what a
 * PERSON reads, and a refusal that tells them to open a link they may not have
 * is worse than a stale comment. Both are corrected, and the sentence is now
 * proof-neutral in the way `INVITE_DECLINE_IS_THE_SERVERS_REASON` was written
 * from the start. Case 6.34 pins the new wording.*
 *
 * It is a `permission.role` refusal because it is about WHO may make this claim
 * (nobody, from a client), not about what may be seen.
 */
export const INVITE_ACCEPTANCE_IS_THE_SERVERS_REASON =
  'Acceptance is recorded by the server for the person the invitation names.';
/**
 * Task 17. `invite.declined` is refused from EVERY client envelope-origin, at
 * every role including owner — the same treatment `invite.accepted` gets, and
 * the reader who expects the opposite is the one this comment is for.
 *
 * "Declining is harmless, so let anyone submit one" is the wrong way round. An
 * `inviteId` is readable by every member of the workspace (it is in the ledger
 * by design; only the token is not), so a client-submitted decline would let
 * any member destroy any pending invitation **while attributing the refusal to
 * the invited person**. That is strictly worse than a revocation, which reaches
 * the same terminal state under the name of the admin who chose it and is
 * admin-only for that reason.
 *
 * The only thing entitled to say an address declined is proof of control over
 * that address, which no client-submitted event can demonstrate. The server
 * appends this at `/v1/me/invitations/:inviteId/decline`, having matched the
 * invitation to the caller's VERIFIED email.
 */
export const INVITE_DECLINE_IS_THE_SERVERS_REASON =
  'Declining is recorded by the server for the person the invitation names.';
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
  // Task 14. Inviting somebody into a workspace, and withdrawing that
  // invitation, are membership management — the same question
  // `membership.granted` answers, asked one step earlier about a person who has
  // no user id yet. They are here rather than in the `membership.granted` branch
  // below because that branch is keyed on the two membership TYPES, and an
  // invite is filed against the invite entity; the answer is the same either
  // way, and `ADMIN_ONLY_TYPES` is where a type-keyed answer belongs.
  //
  // `invite.accepted` is deliberately NOT here. It is not admin-only, it is
  // client-refused outright — see INVITE_ACCEPTANCE_IS_THE_SERVERS_REASON and
  // the check below. Adding it here would make an admin's forged acceptance
  // COMMIT, which is the exact escalation that check exists to stop.
  'invite.sent',
  'invite.revoked',
  // Task 16 (HIG per-screen plan, owner brief 2026-09-09). Archiving a project
  // takes it out of every list of live work for everyone in the workspace, which
  // is the same class of act as founding one — `project.created` is two lines
  // up for the same reason. It is NOT a roster question, so it does not go to
  // `hasProjectAdminRights` below: a project admin runs their project's people
  // and their tickets' visibility (`effective-role.ts` says so in words), and
  // retiring the project itself is the workspace's decision, not theirs.
  //
  // Conservative in the reversible direction: widening this later to include
  // project admins is one line and discloses nothing new, while an archive by
  // someone the workspace did not intend cannot be un-seen by the people whose
  // work vanished from their boards.
  'project.archived',
  'project.restored',
  // MCP CRUD plan Task 1 (M1): renaming a project is the same workspace act as archiving it.
  'project.updated',
  // Trash series, Plan 1 Task 3 (spec §4 "Authority"): soft delete/undelete is
  // the same class of act as archive/restore two lines up — it takes the
  // project out of (or back into) every list of live work for the whole
  // workspace — so the same workspace admin/owner question answers it.
  'project.deleted',
  'project.undeleted',
  // Prefixes and groups plan Task 6 (spec §5, FD4): the group tree is workspace
  // structure, the same class of act as founding a project, so owner/admin only.
  // A member never files, renames, reorders or deletes a group.
  'group.created',
  'group.renamed',
  'group.reordered',
  'group.deleted',
]);

/**
 * Trash series, Plan 1 Task 3 (spec §4 "Authority"). Workspace acts an
 * OWNER ONLY may submit — a narrower bar than `ADMIN_ONLY_TYPES`, checked
 * separately below rather than folded into that set, because the refusal
 * NAMES the act (`WORKSPACE_OWNER_ONLY_REASON`) the way `workspace.renamed`'s
 * own check does, and because the bar itself (`role === 'owner'`) is
 * different from `isWorkspaceAdmin`.
 */
const WORKSPACE_OWNER_TYPES: ReadonlySet<string> = new Set([
  'workspace.archived',
  'workspace.restored',
  'workspace.deleted',
  'workspace.undeleted',
]);
/**
 * `purge.marked`/`purge.unmarked` inherit the authority of the item's own
 * delete (spec §4) — filed against any of the four purgeable kinds, so this
 * set is checked beside each kind's own delete authority rather than folded
 * into `WORKSPACE_OWNER_TYPES` or `ADMIN_ONLY_TYPES`, neither of which is
 * kind-aware.
 */
const PURGE_TYPES: ReadonlySet<string> = new Set(['purge.marked', 'purge.unmarked']);

/**
 * **`origin` in this module is the event envelope's provenance enum — `'web' |
 * 'mobile' | 'desktop' | 'server' | 'mcp'` (`EventEnvelope.origin`). It is NOT the
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
 * - **~~Every WORKSPACE-entity event but `workspace.created`.~~ CLOSED 2026-09-19.**
 *   ~~MEASURED on main at Task 9: a workspace GUEST is ADMITTED for
 *   `workspace.renamed`. It is not in `ADMIN_ONLY_TYPES`, it is not membership
 *   or roster management, and Task 9's check 1 examines ticket entities only —
 *   so nothing anywhere asks who may rename a workspace.~~ **The owner ruled on
 *   2026-09-19 that a member's or a guest's rename must be refused**, and the
 *   gate now sits beside `workspace.settings_set` above. The struck text is KEPT
 *   rather than deleted, because it is the record of why this was an absence for
 *   ten days: not an oversight, but a product decision no plan in this series
 *   had taken, and Task 9 wrote down that it was declining to take one.
 *   **What the ruling changed, in its own terms: the refusal NAMES THE ACT** —
 *   `WORKSPACE_RENAME_REASON`, "Only a workspace owner or admin can rename a
 *   workspace" — rather than producing `adminOnlyReason`'s generic sentence,
 *   which is the same reason `workspace.settings_set` is its own case rather
 *   than a member of `ADMIN_ONLY_TYPES`. **A consequence worth stating because it
 *   was not obvious when the entry was written: with this closed, no non-ticket
 *   event type is ungated any more**, so the second bullet below is now the
 *   whole of what remains rather than a boundary with an exception beside it.
 * - **Every non-ticket, non-workspace entity's ordinary events.** Check 1 is an
 *   entity-kind filter, so `workflow`, `ticket-type`, `project`, `membership`
 *   and now `invite` events get the role gate and nothing more. That is right
 *   for the types the role gate already names and unexamined for any it does
 *   not. **Task 14 narrowed this entry rather than closing it**: all three
 *   invite types are now named by the role gate — `invite.sent` and
 *   `invite.revoked` in `ADMIN_ONLY_TYPES`, `invite.accepted` and (Task 17)
 *   `invite.declined` refused from every
 *   client door — so the sub-question "who may emit an invite event" is
 *   answered. The entry stays open for `workflow`, `ticket-type`, `project` and
 *   `membership`, whose ordinary events are still unexamined beyond the types
 *   `ADMIN_ONLY_TYPES` and the two membership branches happen to name.
 * - **An invitation's ADDRESS is unchecked. Issuance IS now rate-limited —
 *   Plan 11 Task 2 closed that half.** Task 14 refuses a blank address and
 *   refuses `owner`, and stops there. An admin may still invite an address that
 *   reaches nobody, and this gate has no opinion — that is an attributed claim
 *   by somebody who could already grant membership directly.
 *
 *   The rate-limiting half is no longer an absence. `POST
 *   /v1/workspaces/:workspaceId/invites` has its OWN fixed-window bucket in
 *   `app.ts` (`invite:${ip}`, budgeted from `RATE_LIMIT_AUTH_MAX` rather than
 *   the far larger events budget, because each issuance mints a credential),
 *   separate from the auth and events buckets so neither can spend the other's
 *   window. It is per SOURCE ADDRESS, not per issuer: the limiter is an
 *   `onRequest` hook and `request.currentUserId` is written by `requireSession`,
 *   a route-level `preHandler` that runs later. **A per-issuer budget remains
 *   open** and would be a different seam — a `preHandler` on that one route.
 *   *Owner: Plan 4 Task 14's successor.* The address check is likewise still
 *   open, with delivery. *Owner: Plan 11's delivery task.*
 * - **Nothing checks that an invitation's promised projects still exist, or
 *   that they belong to the inviting workspace.** `invite.sent.projectIds` is
 *   shape-checked (ULIDs) and never resolved. `checkProjectExists` runs on
 *   `project.member_added` — but acceptance appends those through the INTERNAL
 *   door, where no gate runs, so a project deleted or mistyped between
 *   invitation and acceptance lands a roster row for a project that is not
 *   there. It is inert today for the same reason a stranger's roster row is —
 *   `resolveEffectiveRole` yields it and `canSee` finds no tickets under it —
 *   but it is inert by a guarantee elsewhere rather than by a refusal here.
 *   *Owner: Plan 4 Task 14's successor, or Plan 6 at the invite-mint screen,
 *   which is where a bad project id would be caught before it was promised.*
 * - **The read paths and sync-down.** This module is the INGEST door. Task 8
 *   enforces `canSee` on the three ticket read routes; sync-down filtering IS
 *   built (`../visibility/visible-events-for.ts`, Task 11 — this entry said
 *   "is not built" until Task 14 corrected it, and a stale absence is worse
 *   than none because it sends the next reader to build a thing that exists).
 *   Task 14 adds the invite read routes to the list of doors this module does
 *   not guard: `GET /v1/workspaces/:workspaceId/invites` enforces owner/admin
 *   itself, and `GET /v1/invites/:token` is deliberately session-free, because
 *   the token IS the credential. A door that does not exist cannot be closed,
 *   and
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
 * - **CLOSED:** `POST /v1/sync` (Plan 10 Batch A, landed 2026-09-04) —
 *   `sync-service.ts` calls `ingestClientBatch` for the client's offline claim
 *   (its `claim.contested` append is the server-origin exception above, through
 *   `serverAppend`). Witnessed by `sync-route.test.ts`'s door test 12.102: an
 *   offline claim wearing envelope-origin `server` is contested by this gate,
 *   not committed. (E3-32 — this bullet previously read "does not exist yet"
 *   after the route had existed, called this gate and been tested for 16 days;
 *   `test/permissions/check-permission.test.ts` now asserts this text.)
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

  // A workspace is founded ONCE. Reached only when `workspaceExists` is true
  // AND the actor holds a role — the two cases the bypass above and the
  // membership check below have already let through — so this closes the last
  // client-door path on which a `workspace.created` naming an already-founded
  // workspace commits (case 6.52). A NON-member re-founding is still answered
  // `NOT_A_MEMBER_REASON` by the check above, unchanged and still pinned: the
  // two refusals name different faults and are deliberately not merged.
  //
  // ## Why refuse at all, when the escalation is already stopped
  //
  // The escalation (the `workspaceExists` bound above, and `workspaceSeq === 1`
  // in `ingestAll`) is about the GRANT — a second founding never re-fires the
  // bootstrap, so nobody becomes owner. What was still open was the EVENT: a
  // member, admin or guest of a founded workspace could append an unlimited
  // number of `workspace.created` claims to its ledger, each of them false on
  // its face — the workspace's history already proves it was founded, and
  // coordination §11 means a mis-filed claim can never be taken back, only
  // superseded. It is also read: `workspaces/workspace-name.ts` folds
  // `workspace.created`/`workspace.renamed` for the directory's name, so a
  // second founding is not inert noise, it changes an answer a person sees.
  // With this line, `workspaceSeq === 1` becomes the second line of that
  // defence rather than the only one.
  //
  // ## Two things this deliberately does NOT do
  //
  // - **It is not applied at the internal door.** `checkRolePermission` runs
  //   only from `ingestClientBatch`. The internal door's second
  //   `workspace.created` still commits and still founds nothing — measured by
  //   `check-role-permission.test.ts`'s "the INTERNAL door does not re-found an
  //   existing workspace either", which this must not redden. That door is the
  //   server's own, and Task 5's bootstrap and Plan 11's seeds use it.
  // - **It is not reachable from `POST /v1/workspaces`.** That route mints the
  //   workspace ULID server-side and refuses a body that names one, so a
  //   route-originated founding always has `workspaceExists === false`. The
  //   door this closes is `POST /v1/events` (and, when it is built, Plan 10's
  //   `POST /v1/sync`, which must call `ingestClientBatch`).
  //
  // ## The one behaviour change, stated rather than discovered
  //
  // A MEMBER re-delivering their OWN founding envelope — same event id, through
  // the client door — used to answer `duplicate-event-id` (an `invalid` result,
  // and a safe idempotent ack) and now answers this refusal, because the gate
  // runs before `insertEvent` and only the primary key knows a redelivery from
  // a fresh claim. No caller in the product does this today: `POST
  // /v1/workspaces` mints a fresh id per call and Plan 11's seeds re-submit
  // through the ungated internal door, where nothing here runs. **Plan 10's
  // sync path is the one that will care**, and it is flagged in case 6.105.
  if (env.type === 'workspace.created') {
    return refuse(WORKSPACE_ALREADY_FOUNDED_REASON);
  }

  if (ADMIN_ONLY_TYPES.has(env.type) && !isWorkspaceAdmin) {
    return refuse(adminOnlyReason(role));
  }
  // Task 14. Refused from every client door at every role, owner included.
  //
  // Position is load-bearing in one direction: it must sit AFTER the membership
  // check above, so an ADMIN reaches it. Put ahead of that check it would still
  // refuse everyone, but the test proving it would be indistinguishable from a
  // test proving `NOT_A_MEMBER_REASON`, and the escalation this closes is
  // specifically an admin's — somebody who can already read the workspace's
  // history, and therefore already knows every pending inviteId in it.
  //
  // There is no `isWorkspaceAdmin` here and there must not be. An owner is not
  // more entitled to bind an invitation to a user than a guest is: the
  // entitlement is possession of the link, which no client-submitted event can
  // demonstrate.
  if (env.type === 'invite.accepted') {
    return refuse(INVITE_ACCEPTANCE_IS_THE_SERVERS_REASON);
  }
  // Task 17, and it sits HERE for the reason above it rather than beside
  // `invite.revoked` in `ADMIN_ONLY_TYPES`: an admin is exactly the person this
  // refusal is about, so a rule that admitted admins would leave the escalation
  // open. See INVITE_DECLINE_IS_THE_SERVERS_REASON.
  if (env.type === 'invite.declined') {
    return refuse(INVITE_DECLINE_IS_THE_SERVERS_REASON);
  }
  // Membership is workspace-scoped only now (owner decision 2026-08-27), so
  // this is one question rather than a branch on scope: managing who is IN the
  // workspace is an owner/admin matter. Who is ON a project is the next check,
  // and it is a different question with a different answer — a project admin
  // runs their project's roster, not the workspace's door.
  if (env.type === 'membership.granted' || env.type === 'membership.revoked') {
    // E6-21 — leaving is not membership MANAGEMENT, so it is not gated by
    // isWorkspaceAdmin: any role may revoke their OWN membership. Two
    // documents already assumed this was possible — http-origin.ts's docblock
    // excludes the invite-accept door from the CSRF set because acceptance
    // lands "in a workspace they can leave", and the export's privacy copy
    // promises the same — while the gate below refused every self-revoke
    // with WORKSPACE_MEMBERSHIP_REASON, same as anyone managing someone else.
    // The sole-owner case is NOT re-guarded here: `rule-engine/checks/
    // membership.ts`'s last-owner guard runs in the engine for every door,
    // counts owners in the WORLD rather than trusting this gate's actor
    // check, and already refuses the one shape that would leave the
    // workspace ownerless — a self-revoke by role fails BOTH clauses of the
    // condition below, so `parsed.data.userId === ctx.sessionUserId` reads it
    // correctly regardless of the actor's role.
    if (env.type === 'membership.revoked') {
      const parsed = membershipRevokedPayload.safeParse(env.payload);
      if (parsed.success && parsed.data.userId === ctx.sessionUserId) {
        return null;
      }
    }
    if (!isWorkspaceAdmin) {
      return refuse(WORKSPACE_MEMBERSHIP_REASON);
    }
    // Ruling (owner, 2026-09-18): only an OWNER may grant the owner role.
    //
    // This is the ACTOR half of the last-owner guard; the WORLD half — "would
    // this change leave the workspace with no owner?" — is
    // `rule-engine/src/checks/membership.ts` and runs in the engine, after this
    // gate and for every door rather than only this one. The two are
    // complementary and NEITHER alone closes the escalation: the engine guard
    // alone still lets an admin demote the sole owner and then promote
    // themselves, because the workspace never has zero owners at any step —
    // only zero of the original owner's role.
    //
    // There is NO `isWorkspaceOwner` in this file to reuse, and none is added:
    // the body computes `isWorkspaceAdmin = role === 'owner' || role === 'admin'`
    // above and nothing narrower, so the comparison is written inline against
    // the `role` already in scope. A second read of the effective role would be
    // a second thing to keep in step.
    if (env.type === 'membership.granted') {
      const parsed = membershipGrantedPayload.safeParse(env.payload);
      // A payload that does not parse is NOT refused here: it is the engine's
      // `malformed-payload`, with the field path spelled out, and refusing it
      // here would report a shape problem as a role problem.
      if (parsed.success && parsed.data.role === 'owner' && role !== 'owner') {
        // `refuseWith`, not the one-argument `refuse` above, because this rule
        // is its own sentence rather than another way of saying "you are not an
        // admin" — the same argument that gave `PERMISSION_VISIBILITY_RULE` its
        // own id. The members page renders the rule string, so which id is
        // emitted is visible to a person, and "only an owner can hand over the
        // workspace" is not the same thing to be told as "only an admin can
        // manage membership". PLAN DEVIATION, recorded: the plan's Step 3
        // declares this id under "Produces", its Step 7 emits the generic
        // `permission.role` instead, and the two cannot both hold. The id wins
        // because a rule name nothing emits is a matching key that can never
        // match — and all twenty ids already in `REFUSAL_RULES` are emitted
        // somewhere (measured). Flagged to the controller in the PR body.
        return refuseWith(REFUSAL_RULES.grantOwnerRequiresOwner, WORKSPACE_OWNER_GRANT_REASON);
      }
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
  // The guest half, extended to NOTES by the notes series (Plan 1 of 6, spec
  // §4.2: putting a note in a workspace is the same act of authorship creating a
  // ticket is, and a guest reaches work through explicit lists rather than by
  // making new things). The condition is one predicate with two types because it
  // is one RULE; the sentence below names both, since a refusal that mentions
  // only tickets would tell a guest the wrong thing about what they just tried.
  if ((env.type === 'ticket.created' || env.type === 'note.created') && role === 'guest') {
    return refuse(GUESTS_CANNOT_CREATE_REASON);
  }
  // Plan 5 Task 3. The attention strip's thresholds are workspace-scoped
  // configuration, so the gate is the same owner/admin question `ADMIN_ONLY_TYPES`
  // answers — kept as its own case rather than folded into that set because the
  // refusal text names the setting rather than the generic admin-only reason
  // `adminOnlyReason` produces (the settings test pins this exact sentence).
  if (env.type === 'workspace.settings_set' && !isWorkspaceAdmin) {
    return refuse('Only a workspace owner or admin can change workspace settings.');
  }
  // The rename ruling, 2026-09-19, and it CLOSES an absence this module used to
  // record rather than answer (see the docblock above — the entry is discharged,
  // not deleted). Until this line **nothing anywhere asked who may rename a
  // workspace**: `workspace.renamed` was not in `ADMIN_ONLY_TYPES`, it is not
  // membership or roster management, and check 1 examines ticket entities only —
  // so a workspace GUEST was admitted, measured at Task 9 and pinned by
  // `check-visibility-permission.test.ts`. It is the same owner/admin question
  // the `settings_set` case above answers, kept as its own case for that case's
  // own reason: the refusal NAMES THE ACT rather than producing the generic
  // admin-only sentence, and the reason is an exported constant so a test can
  // pin the sentence rather than a paraphrase of it.
  //
  // The envelope-origin is what makes this attributable — the ledger records who
  // renamed — which is why the refusal can honestly say what it refuses rather
  // than only that something was not permitted.
  if (env.type === 'workspace.renamed' && !isWorkspaceAdmin) {
    return refuse(WORKSPACE_RENAME_REASON);
  }
  // Trash series, Plan 1 Task 3 (spec §4 "Authority"). Workspace archive,
  // restore, delete, undelete, mark and unmark are all an OWNER-only question —
  // compared `role === 'owner'` inline, as `WORKSPACE_OWNER_GRANT_REASON`'s
  // check above does, and deliberately without an `isWorkspaceOwner` helper
  // (see the docblock on `WORKSPACE_OWNER_GRANT_REASON` for why none exists).
  if (
    WORKSPACE_OWNER_TYPES.has(env.type) ||
    (env.entity.kind === 'workspace' && PURGE_TYPES.has(env.type))
  ) {
    if (role !== 'owner') {
      return refuse(WORKSPACE_OWNER_ONLY_REASON);
    }
  }
  // A project mark/unmark inherits the project's own delete authority — the
  // same workspace admin/owner question `ADMIN_ONLY_TYPES` answers for
  // `project.deleted`/`project.undeleted` two cases up, asked here instead of
  // folded into that set because `purge.marked`/`purge.unmarked` are filed
  // against every purgeable kind and this module's other kinds (ticket, note)
  // answer a DIFFERENT authority question, decided in `checkVisibilityPermission`
  // and `checkNotePermission` respectively.
  if (env.entity.kind === 'project' && PURGE_TYPES.has(env.type) && !isWorkspaceAdmin) {
    return refuse(adminOnlyReason(role));
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
/**
 * Every project this event names, in payload order.
 *
 * A LIST rather than the single id this returned until Plan 4 Task 14, because
 * `invite.sent` names as many as an admin typed. Returning the first one only
 * would make the check pass for an invitation whose second project was a typo,
 * which is the shape a "checks the first element" bug always takes.
 *
 * `invite.sent` is here rather than left to acceptance, and the difference is
 * MEASURED. Acceptance appends `project.member_added` through the INTERNAL
 * door, where no gate runs, so a promised project belonging to ANOTHER
 * workspace reached `readEntityHead`, tripped the entity↔workspace guard, threw
 * out of the acceptance sequence and answered the joining person **500 — after
 * `invite.accepted` and `membership.granted` had already committed**. They were
 * a member, the screen said it had failed, and a retry answered 404 because the
 * invitation's status was already `accepted`. Refusing at issuance is what
 * makes that unreachable: with no `project.deleted` event anywhere in the
 * product, a project that exists when the invitation is minted still exists
 * when it is accepted.
 *
 * Ordering is inherited rather than re-decided: `checkPermission` runs
 * `checkRolePermission` first, so a plain member issuing an invitation with a
 * bad project id is told they may not invite — the honest reason — and only an
 * admin ever reaches this refusal.
 */
function projectsNamedBy(env: EventEnvelope): readonly string[] {
  switch (env.type) {
    case 'ticket.created':
      return [ticketCreatedPayload.parse(env.payload).projectId];
    case 'project.member_added':
    case 'project.member_removed':
    // Task 16. Both are filed against the project entity, so the id is
    // `env.entity.id` and never a payload read — their payloads are empty. They
    // are here so archive/restore inherit the existence precondition: an
    // `project.archived` naming a project nobody founded is told the project
    // does not exist, rather than silently writing nothing and answering 201.
    case 'project.archived':
    case 'project.restored':
    // MCP CRUD plan Task 1: filed against the project entity too (a name and/or
    // description payload, never a project id), so it inherits the same precondition.
    case 'project.updated':
    // Trash series, Plan 1 Task 3: same reasoning as the archive pair above —
    // both are filed against the project entity with an empty payload, so
    // `checkProjectExists` must be asked before `checkRolePermission`'s
    // `ADMIN_ONLY_TYPES` answer would otherwise be the only gate reached.
    case 'project.deleted':
    case 'project.undeleted':
      return [env.entity.id];
    // A project purge mark/unmark is filed against WHICHEVER kind spec §4
    // purges — workspace, project, ticket or note — so this arm is kind-aware
    // rather than a bare `[env.entity.id]`: naming a non-project entity id as
    // a "project" would make `checkProjectExists` refuse `project-unknown` for
    // a ticket or note id that was never a project id to begin with.
    case 'purge.marked':
    case 'purge.unmarked':
      return env.entity.kind === 'project' ? [env.entity.id] : [];
    case 'invite.sent':
      return inviteSentPayload.parse(env.payload).projectIds ?? [];
    // The note's HOME project (notes series, Plan 1 of 6, spec §3.3: "the
    // project in `homeProjectId` exists in `env.workspaceId`"). It belongs in
    // this function rather than in `checkNotePermission`'s membership arm for
    // the reason this function's own docblock gives: existence must be asked
    // BEFORE membership, so a person filing a note under a project nobody
    // founded is told the project does not exist rather than that they are not
    // a member of it — and the honest reason is the one that names the actual
    // fault.
    //
    // `''` is filtered out and is NOT a missing value to guard elsewhere:
    // `homeProjectId: ''` is the claim "this note lives at workspace level", a
    // real and common answer, and asking whether the empty string is a founded
    // project would refuse every workspace-level note.
    //
    // MEASURED before this line existed, by case 18.042: an OWNER could file a
    // note under any ULID at all, because the membership arm exempts owners; and
    // any member could, by first granting themselves `project.member_added` on a
    // project nobody founded — which accepts any ULID without validating it,
    // exactly as this docblock records one entity kind over.
    case 'note.created':
      return [noteCreatedPayload.parse(env.payload).homeProjectId].filter((id) => id !== '');
    default:
      return [];
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
  // Payload order, and the FIRST unknown one is reported: the sender fixes one
  // id at a time, and a refusal naming an arbitrary member of the set would be
  // a worse instruction than one naming the first thing wrong.
  for (const projectId of projectsNamedBy(env)) {
    if (!(await projectExists(db, env.workspaceId, projectId))) {
      return refuseWith(PROJECT_UNKNOWN_RULE, projectUnknownReason(projectId));
    }
  }
  return null;
}

/**
 * May this project be founded under the prefix it names?
 *
 * ## The owner's ruling, and why it is a door and not a display rule
 *
 * *"yes project prefixes are unique per workspace"* (2026-09-20). A key is
 * `CCSO-1183` — workspace prefix, project prefix, number — so a second project
 * answering to `SO` in one workspace makes that key name two tickets, and a
 * key's whole job is to name one thing durably. The rule is enforced HERE,
 * where the prefix is AUTHORED and where the author can be told to choose
 * again, rather than at render time where the only remedies are a suffix nobody
 * asked for or a duplicate nobody notices.
 *
 * ## It checks the DERIVED prefixes too, and that is the load-bearing half
 *
 * `projectPrefixesInWorkspace` resolves the workspace the way a reader does, so
 * a project that entered no prefix still occupies the one derived from its name.
 * A check against stored prefixes alone would accept this sequence: an existing
 * project named `Shop operations` answering to `SO`, then an admin founding a
 * second project and entering `SO`. `resolveProjectPrefixes` lets the ENTERED
 * value win, so the new project would quietly take `SO` and the OLD one would
 * move to `SO2` — every ticket key in it changing, after the fact, under readers
 * who had already quoted one. That is a worse outcome than a refusal, and it is
 * the reason this pass reads derived values rather than the column.
 *
 * ## A project that enters NOTHING is never refused
 *
 * The derived path already resolves collisions by moving, and it can move
 * precisely because nobody claimed the value. Refusing a caller who expressed no
 * preference would make the prefix mandatory in fact while the schema keeps it
 * optional in form.
 *
 * ## Ordering
 *
 * Fifth, after `checkProjectExists` and before `checkVisibilityPermission`. It
 * is placed with the other project-shaped questions and after the role gates, so
 * somebody with no standing to found a project here is told THAT rather than
 * being handed a sentence about a prefix — and, like `checkProjectExists`, it
 * runs strictly after `checkRolePermission` so a non-member cannot use it to
 * enumerate the workspace's prefixes.
 */
export async function checkProjectPrefixUnique(
  db: Queryable,
  env: EventEnvelope,
): Promise<Refusal | null> {
  if (env.type !== 'project.created') {
    return null;
  }
  const parsed = projectCreatedPayload.parse(env.payload);
  if (parsed.prefix === undefined) {
    return null;
  }
  const resolved = await projectPrefixesInWorkspace(db, env.workspaceId);
  // ⚠ "ANOTHER project", and the distinction is a defect fix rather than a
  // nicety. `projectPrefixesInWorkspace` resolves EVERY project in the
  // workspace, including the one this event names — whose `proj_projects` row
  // already exists, because the first delivery wrote it. So asking the set
  // whether it holds this prefix answered YES for the project's own
  // `project.created` re-delivered, and that retry was refused with
  // `project.prefix-taken` instead of the `duplicate-event-id` the ledger
  // answers. Reachable from `POST /v1/events` and `POST /v1/sync`, where a
  // retry is the ordinary way a client recovers from a lost response; no test
  // covered it, because every case in `project-prefix-unique.test.ts` uses a
  // FRESH project id.
  //
  // Filtered by project ID and not by value: the resolution guarantees one
  // project per prefix, so filtering by value would also be correct today — and
  // would stop being correct the moment that guarantee moved.
  const taken = new Set(
    [...resolved.entries()]
      .filter(([projectId]) => projectId !== env.entity.id)
      .map(([, prefix]) => prefix),
  );
  if (!taken.has(parsed.prefix)) {
    return null;
  }
  return refuseWith(
    PROJECT_PREFIX_TAKEN_RULE,
    `Another project in this workspace already uses the prefix ${parsed.prefix}. A prefix identifies a project's tickets — ${parsed.prefix}-1, ${parsed.prefix}-2 — so two projects cannot share one. Choose a different prefix.`,
  );
}

/**
 * The project-group tree's door (prefixes and groups plan Task 6, spec R3/R4,
 * review focus 3). `null` for every event that is not a group event or a
 * `project.updated` carrying a `groupId`.
 *
 * The payload SCHEMAS check shape (level 1–4, parent null exactly at L1); this
 * checks the claim against the TREE, which is other rows a schema cannot see:
 *
 * - `group.created`: the parent is a live group of THIS workspace
 *   (`group.unknown`, same sentence for a stranger's id as for a fabricated one),
 *   `level = parent.level + 1` (`group.level-mismatch`), and no sibling already
 *   has the name, ignoring case (`group.name-taken`). The same name under a
 *   DIFFERENT parent is a different group (R4), which the unique index
 *   `proj_groups_sibling_name` states the same way.
 * - `group.renamed`: the group exists; the new name is free among its siblings.
 * - `group.reordered`: the group exists (a rank has no tree rule of its own).
 * - `group.deleted`: no project points at it (`group.in-use`), and no group is
 *   under it (`group.has-children`). In-use is asked FIRST: it is the sentence a
 *   person can act on by moving a project, whereas an unknown group says nothing.
 * - `project.updated {groupId: <id>}`: the group is a live group of this workspace
 *   (`project.group-unknown`). `groupId: null` ungroups and needs no check.
 *
 * "In use" counts EVERY `proj_projects` row filed under the group, trashed ones
 * included: a trashed project still points at it and would dangle if the group
 * went (undelete would bring back a project filed under nothing).
 *
 * A re-delivered `group.created` (a sync retry of a committed one) must not be
 * refused as a taken name by its OWN row, so the sibling query excludes the
 * event's own entity id; a re-delivered `group.deleted` meets an absent group and
 * is told `group.unknown`, which a client treats as the end of that claim.
 *
 * Ordering: after `checkRolePermission`, so only an owner/admin ever reaches it
 * and nobody else can use these sentences to enumerate a workspace's groups.
 */
export async function checkGroupRules(db: Queryable, env: EventEnvelope): Promise<Refusal | null> {
  switch (env.type) {
    case 'group.created': {
      const payload = groupCreatedPayload.parse(env.payload);
      if (payload.parentId !== null) {
        const parent = await readGroup(db, env.workspaceId, payload.parentId);
        if (parent === null) {
          return refuseWith(GROUP_UNKNOWN_RULE, groupUnknownReason());
        }
        if (payload.level !== parent.level + 1) {
          return refuseWith(
            GROUP_LEVEL_MISMATCH_RULE,
            `A level ${payload.level} group goes under a level ${payload.level - 1} group.`,
          );
        }
      }
      return siblingNameRefusal(db, env, payload.parentId, payload.name);
    }
    case 'group.renamed': {
      const payload = groupRenamedPayload.parse(env.payload);
      const group = await readGroup(db, env.workspaceId, env.entity.id);
      if (group === null) {
        return refuseWith(GROUP_UNKNOWN_RULE, groupUnknownReason());
      }
      return siblingNameRefusal(db, env, group.parentId, payload.name);
    }
    case 'group.reordered': {
      const group = await readGroup(db, env.workspaceId, env.entity.id);
      return group === null ? refuseWith(GROUP_UNKNOWN_RULE, groupUnknownReason()) : null;
    }
    case 'group.deleted': {
      const group = await readGroup(db, env.workspaceId, env.entity.id);
      if (group === null) {
        return refuseWith(GROUP_UNKNOWN_RULE, groupUnknownReason());
      }
      const projects = await db.query<{ name: string }>(
        'SELECT name FROM proj_projects WHERE workspace_id = $1 AND group_id = $2 ORDER BY project_id',
        [env.workspaceId, env.entity.id],
      );
      if (projects.rows.length > 0) {
        const first = projects.rows[0]!.name;
        const others = projects.rows.length - 1;
        return refuseWith(
          GROUP_IN_USE_RULE,
          others === 0
            ? `${first} is in this group. Move it out first.`
            : `${first} and ${others} other ${others === 1 ? 'project' : 'projects'} are in this group. Move them out first.`,
        );
      }
      const children = await db.query(
        'SELECT 1 FROM proj_groups WHERE workspace_id = $1 AND parent_id = $2 LIMIT 1',
        [env.workspaceId, env.entity.id],
      );
      if (children.rows.length > 0) {
        return refuseWith(GROUP_HAS_CHILDREN_RULE, 'This group has groups under it. Delete those first.');
      }
      return null;
    }
    case 'project.updated': {
      const payload = projectUpdatedPayload.parse(env.payload);
      if (payload.groupId === undefined || payload.groupId === null) {
        return null;
      }
      const group = await readGroup(db, env.workspaceId, payload.groupId);
      return group === null
        ? refuseWith(PROJECT_GROUP_UNKNOWN_RULE, 'That group does not exist in this workspace.')
        : null;
    }
    default:
      return null;
  }
}

function groupUnknownReason(): string {
  return 'That group does not exist in this workspace.';
}

/** One live group of this workspace, or `null` — scoped, so another workspace's id is simply not found. */
async function readGroup(
  db: Queryable,
  workspaceId: string,
  groupId: string,
): Promise<{ level: number; parentId: string | null } | null> {
  const { rows } = await db.query<{ level: number; parent_id: string | null }>(
    'SELECT level, parent_id FROM proj_groups WHERE group_id = $1 AND workspace_id = $2',
    [groupId, workspaceId],
  );
  const row = rows[0];
  return row === undefined ? null : { level: row.level, parentId: row.parent_id };
}

/** A sibling (same workspace, same parent, name equal ignoring case) other than the event's own group. */
async function siblingNameRefusal(
  db: Queryable,
  env: EventEnvelope,
  parentId: string | null,
  name: string,
): Promise<Refusal | null> {
  const { rows } = await db.query<{ name: string }>(
    `SELECT name FROM proj_groups
      WHERE workspace_id = $1 AND COALESCE(parent_id, '') = COALESCE($2::text, '')
        AND lower(name) = lower($3) AND group_id <> $4
      LIMIT 1`,
    [env.workspaceId, parentId, name, env.entity.id],
  );
  const taken = rows[0];
  return taken === undefined
    ? null
    : refuseWith(GROUP_NAME_TAKEN_RULE, `There is already a group called ${taken.name} here.`);
}

/**
 * May this claim NAME this person? `null` when it may, a refusal when it may not.
 *
 * ## One lookup, two doors, and the second door is why this exists
 *
 * The invariant is E6-17: a claim may name only a person who holds a role in
 * this workspace — a non-member, a fresh ULID nobody owns and the string
 * `nobody-here` are all refused with the same sentence. It was enforced for
 * `ticket.assigned` and `ticket.collaborator_added` only, and the owner's
 * request of 2026-09-23 added a THIRD way to name a person: an optional
 * `assigneeId` on `ticket.created`, set by the New ticket dialog's Assignee
 * picker.
 *
 * **The two doors are in different branches of `checkVisibilityPermission`, and
 * they have to be.** The existing block runs after `canSee` — deliberately, so
 * an actor with no standing on the ticket is never told whether the person they
 * named is a member — and `ticket.created` RETURNS before reaching it, because
 * a ticket that does not exist yet cannot be seen. So a birth assignee would
 * have been admitted unchecked had this not been extracted and called from both
 * places: writing the lookup a second time inside the `ticket.created` branch
 * would have been two spellings of one rule, free to drift the moment either
 * moved.
 *
 * `null` names nobody and passes — `ticket.assigned`'s unassignment, and a birth
 * with no assignee at all. A guest IS a member of the workspace and passes here;
 * whether a guest can see what they are assigned is the read side's question
 * (case 7.27), not this door's.
 */
async function namedPersonRefusal(
  db: Queryable,
  workspaceId: string,
  named: string | null,
): Promise<Refusal | null> {
  if (named === null) return null;
  const namedRole = await resolveEffectiveRole(db, named, workspaceId);
  if (namedRole.workspaceRole !== null) return null;
  return refuse(NAMED_PERSON_NOT_IN_WORKSPACE_REASON);
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
 * ## The six checks, in the order a refusal should be met
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
 *    set, reparent, `ticket.deleted`/`ticket.restored`, and `visibility.set`
 *    itself — requires `canSee`. This is also exactly the guest constraint: a
 *    guest's `canSee` is true only for tickets an explicit list names them in,
 *    so "guests may only act on tickets explicitly visible to them" falls out of
 *    the same line rather than needing a guest branch of its own.
 * 5. **`visibility.set` authority.** Project-admin rights on the ticket's own
 *    project, or ticket creatorship. Reported as `permission.role`.
 * 6. **`ticket.deleted` / `ticket.restored` authority.** Project-admin rights on
 *    the ticket's own project, with no creator shortcut — the soft delete hides
 *    the ticket from everyone, which is a wider act than changing its audience
 *    and is not the creator's to make alone. Reported as `permission.role`.
 *    Measured before it existed: without it a GUEST named on one ticket could
 *    delete it. See the branch's own docblock for why this level and not
 *    `ADMIN_ONLY_TYPES`.
 *
 * ## Why checks 2, 5 and 6 report `permission.role` from HERE
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
/** The one rule id every note-write refusal reports (notes series, spec §4.2). */
export const NOTE_PERMISSION_RULE = 'permission.note';
const NOTE_NOT_READABLE_REASON = 'You cannot see this note.';
const NOTE_NOT_YOURS_REASON =
  'Only the note’s author, an admin who can read it, or the workspace owner can change it.';
const NOTE_HOME_REASON = 'You are not a member of the project this note is filed under.';
const NOTE_TICKET_REASON = 'You cannot see the ticket this note would be attached to.';

/**
 * The events only the author (or an admin who can read it, or the owner) may
 * send — spec §4.2's D6 row.
 *
 * They are the events that CHANGE THE NOTE, as distinct from the two that
 * change its audience on a ticket and the one that adds a comment. `note.moved`
 * is in the set although it only re-files the note: it moves the note under a
 * different project's visibility, which is a reader-visible change and not a
 * reader's act.
 */
const NOTE_AUTHOR_EVENTS = new Set([
  'note.renamed',
  'note.body_set',
  'note.scope_set',
  'note.moved',
  'note.deleted',
  'note.restored',
  // Trash series, Plan 1 Task 3 (spec §4 "Authority"): purge.marked/unmarked
  // inherit note.deleted's authority — the same author/admin-reader/owner
  // question, asked of the same note. `checkNotePermission` runs this set only
  // for `env.entity.kind === 'note'`, so a ticket or workspace purge mark never
  // reaches it.
  'purge.marked',
  'purge.unmarked',
]);

/**
 * Who may write which note event (notes series, Plan 1 of 6, spec §4.2).
 *
 * Runs only for `env.entity.kind === 'note'` and answers `null` for every other
 * kind, so it is safe to place unconditionally in the chain. It reports
 * `permission.note` and never `permission.visibility`: the two are different
 * questions and a reader refused here should not be told a rule about ticket
 * audiences.
 *
 * ## The admin cell, and the deviation it carries
 *
 * `isAdminReader` is `role === 'admin'` — but only AFTER `canReadNote` has
 * already said yes, which is what makes it narrower than the word "admin"
 * suggests. The brainstorm said admins may edit or delete any note; the ticket
 * code treats `admin` exactly like `member` for reads (`canSeeResolved`; since
 * rule A both are on every founded project), and this spec follows the CODE. So an admin edits a
 * note they can read and is refused one they cannot — spec §4.2 flags this for
 * the owner, and the PR body repeats it. If the owner wants the broader rule it
 * is one term: `isAdminReader` becomes `role === 'admin'` unconditionally.
 *
 * ## ORDER inside the function is the order of the questions a person asks
 *
 * "Can you see it" comes before "is it yours", because a note you cannot see
 * should be answered as unreadable rather than as not-yours — the second
 * sentence would confirm the note exists. And the `note.created` branch comes
 * first because it is the only event with no note to load.
 *
 * ## Where the two SERVER-ONLY preconditions are met, one of them elsewhere
 *
 * Spec §3.3's preconditions for a note's events are that the ticket named exists,
 * is in this workspace and is not deleted, and that the project in
 * `homeProjectId` exists and is not archived.
 *
 * - The TICKET half is discharged by `canSee`, which answers false for a ticket
 *   that does not exist or is not in the workspace, plus
 *   `loadNoteForVisibility`'s `ticketIsLive` filter — the `attachTicketId` arm
 *   below and the attach/detach arm.
 * - The PROJECT half is discharged in TWO places, and the split is the ordering
 *   rule `checkProjectExists`'s docblock states: EXISTENCE is asked there, which
 *   is why `projectsNamedBy` gained a `note.created` case, and MEMBERSHIP is
 *   asked here (`eff.projects.has`). Existence first is what makes the refusal
 *   honest — someone filing under a project nobody founded is told that, not
 *   that they are not a member of it.
 * - **The archived half is NOT implemented, for notes or for tickets.** Nothing
 *   in this chain refuses a write under an archived project — `projectExists`
 *   does not read the column and no call site does — so closing it for notes
 *   alone would make notes stricter than tickets on a rule the product does not
 *   enforce anywhere. Recorded rather than quietly half-done.
 */
export async function checkNotePermission(env: EventEnvelope, ctx: VisibilityContext): Promise<Refusal | null> {
  if (env.entity.kind !== 'note') return null;
  const role = ctx.eff.workspaceRole;
  if (env.type === 'note.created') {
    // PARSED, not cast: a refusal built from a malformed payload would report
    // the wrong fault. The door validates this shape before any check runs, so a
    // throw here is a sequencing break rather than a user error — the same
    // argument `projectsNamedBy` makes for parsing.
    const p = noteCreatedPayload.parse(env.payload);
    if (p.homeProjectId !== '' && role !== 'owner' && !ctx.eff.projects.has(p.homeProjectId)) {
      return refuseWith(NOTE_PERMISSION_RULE, NOTE_HOME_REASON);
    }
    if (p.attachTicketId !== undefined && !(await canSee(ctx.db, ctx.sessionUserId, p.attachTicketId))) {
      return refuseWith(NOTE_PERMISSION_RULE, NOTE_TICKET_REASON);
    }
    return null;
  }
  const loaded = await loadNoteForVisibility(ctx.db, env.entity.id);
  // A note that does not exist and a note this person cannot read are ONE
  // answer, deliberately, and it is the same rule the read routes apply: a
  // distinct refusal for "exists but hidden" is an existence oracle.
  if (loaded === null) return refuseWith(NOTE_PERMISSION_RULE, NOTE_NOT_READABLE_REASON);
  const armReach = await noteArmReach(ctx.db, ctx.sessionUserId, loaded.attachedVisibilities);
  const readable = canReadNote(ctx.eff, ctx.sessionUserId, loaded.note, loaded.attachedVisibilities, armReach);
  if (!readable) return refuseWith(NOTE_PERMISSION_RULE, NOTE_NOT_READABLE_REASON);
  if (NOTE_AUTHOR_EVENTS.has(env.type)) {
    const isAuthor = loaded.note.authorId === ctx.sessionUserId;
    const isOwner = role === 'owner';
    const isAdminReader = role === 'admin'; // readable is already established above
    return isAuthor || isOwner || isAdminReader
      ? null
      : refuseWith(NOTE_PERMISSION_RULE, NOTE_NOT_YOURS_REASON);
  }
  if (env.type === 'note.attached' || env.type === 'note.detached') {
    // BOTH halves, and the readability half is already spent above: a reader of
    // the note who cannot see the ticket is refused, and a person who can see
    // the ticket but not the note never reaches this line. Attaching is how a
    // note's audience is widened, so it is not a reader's act alone.
    const { ticketId } = (env.type === 'note.attached' ? noteAttachedPayload : noteDetachedPayload).parse(
      env.payload,
    );
    if (!(await canSee(ctx.db, ctx.sessionUserId, ticketId))) {
      return refuseWith(NOTE_PERMISSION_RULE, NOTE_TICKET_REASON);
    }
    return null;
  }
  // `comment.added`: readable is enough (spec §4.2 — any reader may comment, as
  // on a ticket). Nothing else reaches here: the kind guard above admits only
  // note events, and every note type is answered by one of the branches.
  return null;
}

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
    /**
     * …and the ticket's BIRTH ASSIGNEE, if it names one, is held to the same
     * named-person rule (`namedPersonRefusal` above) that `ticket.assigned`
     * is — checked HERE rather than in the block below because this branch
     * returns before that one is reachable.
     *
     * Ordering, and it is the same ordering argument the `canSee` block makes
     * from the other side: the project check runs FIRST, so an actor creating a
     * ticket in a project they are not on is told THAT, rather than being handed
     * a sentence about the person they named. A claim that fails for two reasons
     * must report the one the actor can act on first.
     */
    const assigneeRefusal = await namedPersonRefusal(
      ctx.db,
      env.workspaceId,
      payload.assigneeId ?? null,
    );
    if (assigneeRefusal !== null) return assigneeRefusal;
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

  /**
   * INVARIANT (E6-17): a `ticket.assigned` or `ticket.collaborator_added` may
   * name only a person who holds a role in this workspace — a non-member, a
   * fresh ULID nobody owns and the string `nobody-here` are all refused with
   * the same sentence.
   *
   * Before this, the payloads were `z.string().min(1)`, `evaluateEvent` has no
   * case for either type, and this gate asked only whether the ACTOR may act on
   * the ticket — so the door answered `committed` to a question it never asked,
   * and the read side served the string: `mappers.ts` renders
   * `roster.get(id) ?? id` as an assignee NAME, the list's `assigneeId` filter
   * matches it, and `groupBy=assignee` makes a column for it. Through the MCP
   * `assign_ticket` tool an agent's typo became a permanent, attributed claim
   * naming nobody. Measured 2026-09-21 through `POST /v1/events`.
   *
   * The lookup is the one `checkMembershipOwnerAuthority` already makes for
   * ITS target, and it refuses `null` only: a guest is a member of the
   * workspace, and whether a guest can SEE the ticket they are assigned is the
   * read side's question (case 7.27), not this door's. `collaborator_removed`
   * is deliberately not here — removing someone who has since left the
   * workspace is a cleanup this door must keep accepting. `assigneeId: null`
   * (unassign) names nobody and passes. A payload that does not parse is
   * passed through to the engine's `malformed-payload`, as the membership
   * pass does, so a shape problem is not reported as a role problem.
   *
   * AFTER the `canSee` check, on purpose: an actor who cannot see the ticket
   * gets that sentence and nothing else, so the named person's membership is
   * never disclosed to someone with no standing on the ticket.
   */
  if (env.type === 'ticket.assigned' || env.type === 'ticket.collaborator_added') {
    const named =
      env.type === 'ticket.assigned'
        ? ticketAssignedPayload.safeParse(env.payload).data?.assigneeId ?? null
        : ticketCollaboratorPayload.safeParse(env.payload).data?.userId ?? null;
    // The lookup itself lives in `namedPersonRefusal` above, and it moved there
    // when `ticket.created` gained a member that names a person: one rule, one
    // spelling, called from both branches — see that function's docblock for why
    // the second call had to be a second CALL SITE rather than a second check.
    const namedRefusal = await namedPersonRefusal(ctx.db, env.workspaceId, named);
    if (namedRefusal !== null) return namedRefusal;
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

  /**
   * Soft delete: a PROJECT-ADMIN act, on the same footing as `visibility.set`
   * directly above and for the reason `effective-role.ts` gives for
   * `hasProjectAdminRights` — *"a project admin runs their project's people and
   * their tickets' visibility."* Deleting a ticket is that same class of act on
   * that same object: it takes the ticket out of every board, list, search,
   * My Work and attention reading (the prototype's `faq-delete` entry, which is
   * the attribution `vocabulary.ts` records beside `ticket.deleted`:
   * *"The ticket stops appearing in views"*. The FAQ carried no such sentence.)
   *
   * ## Measured, not assumed: without this branch the event is ungated
   *
   * Check 4 above admits ANY actor who can see the ticket. A newly registered
   * ticket event appears in no other branch of this module, so before this code
   * existed a workspace GUEST, named on one ticket, could delete it. The
   * `ticket.created` guest guard (`checkRolePermission`) does not reach here,
   * and `ADMIN_ONLY_TYPES` is workspace-scoped.
   *
   * ## Why `hasProjectAdminRights` and not `ADMIN_ONLY_TYPES`
   *
   * That set is for acts on the WORKSPACE — `project.archived` sits in it with
   * the note that retiring the project "is the workspace's decision, not
   * [the project admin's]". One ticket is the project's business, which is the
   * line `visibility.set` already draws.
   *
   * The asymmetry `project.archived`'s note names applies here unchanged, and it
   * is why the level was chosen conservatively rather than generously: refusing
   * a project admin who should have been allowed is one line to widen and
   * discloses nothing new, while a delete by somebody the project did not
   * intend cannot be un-seen by the people whose work vanished from their
   * boards — every reading list, until the undo runs.
   *
   * ## Where the project id comes from, and why it is not the payload
   *
   * The payload is EMPTY, like `ticket.closed`'s: the envelope carries the actor
   * and the instant, and there is no project for a client to assert. So the
   * project is read from the ticket's own row through `getTicketStateFromDb` —
   * the reader that deliberately does NOT filter deleted rows, because
   * filtering it would refuse `ticket.restored` with "no such ticket" and the
   * undo could never run.
   *
   * It is `proj_tickets.project_id` and not `proj_visibility.project_id`, which
   * is the neighbouring `visibility.set` check's source. The two can disagree —
   * a stale `project_id` in `proj_visibility` is a recorded, unrefused
   * corruption class (case 6.57) — and the question here is "may this actor act
   * on the project this TICKET is in", so the ticket's own row is the subject.
   *
   * This sits AFTER check 4 for check 5's own reason: run first it would answer
   * differently for a ticket that does not exist and one that exists but is
   * invisible, rebuilding one layer down the existence oracle Task 8 removed.
   */
  if (
    env.type === 'ticket.deleted' ||
    env.type === 'ticket.restored' ||
    // Trash series, Plan 1 Task 3 (spec §4 "Authority"): a ticket mark/unmark
    // inherits the ticket.deleted rule — the same project-admin question,
    // asked of the same row.
    env.type === 'purge.marked' ||
    env.type === 'purge.unmarked'
  ) {
    const ticket = await getTicketStateFromDb(ctx.db, env.workspaceId, env.entity.id);
    if (ticket === null) {
      return refuse(TICKET_DELETE_UNRESOLVED_REASON);
    }
    if (!hasProjectAdminRights(ctx.eff, ticket.projectId)) {
      const act =
        env.type === 'ticket.deleted'
          ? 'delete'
          : env.type === 'ticket.restored'
            ? 'restore'
            : env.type === 'purge.marked'
              ? 'mark'
              : 'unmark';
      return refuse(ticketDeleteAuthorityReason(act));
    }
  }

  return null;
}

/**
 * "May this actor change who is an OWNER?" — the mirror of
 * `grant-owner-requires-owner`, and the actor half of the ruling that an admin
 * may not demote a non-last owner (owner, 2026-09-18: *"no"*).
 *
 * ## Why it is HERE and not in the rule engine beside `last-owner`
 *
 * The guard is split by the KIND of question, and this one is about the ACTOR,
 * which is what `check-permission.ts` answers — the plan's own split, and the
 * same one that put `grant-owner-requires-owner` in this module.
 *
 * The placement is not merely consistent, it is forced, and the reason is worth
 * stating because "put the world-state question in the engine" is the rule a
 * reader arrives with. This check needs TWO facts and only one of them is about
 * the world:
 *
 *  - **who the actor is** — already resolved, in `ctx.eff.workspaceRole`. No
 *    read, no query, and no second membership reader.
 *  - **who the TARGET currently is** — a `proj_memberships` read, because
 *    neither payload carries a previous role (`membership.granted` names only
 *    the NEW one, and `membership.revoked` names no role at all).
 *
 * An engine-side version would have to ask the first question — which the
 * engine must not, per that same split — and on the doors where it is asked
 * most it could not answer the second: `packages/rule-engine/src/checks/
 * membership.ts` records that the fixture context answers `null` for every
 * membership and the offline replica holds the ACTOR's row alone. So the actor
 * check would be unimplementable there and the target check impossible, which
 * is the reverse of the `last-owner` situation: `countWorkspaceOwners` is a
 * question about the WORLD that only the server can answer, and that is why it
 * lives in the engine. Here it is the actor that only this layer knows.
 *
 * ## What this does NOT do
 *
 * It does not replace `last-owner` and must not: an OWNER demoting themselves
 * out of the last ownership passes this check and is refused by the engine's
 * count. The two are complementary, and each is reachable — this one refuses
 * an admin acting on any owner, that one refuses an owner emptying the
 * workspace. A case in `check-role-permission.test.ts` pins each.
 *
 * ## The reads, and why they are these reads
 *
 * `ctx.db` is the ingest TRANSACTION's own client, which is load-bearing for
 * the same reason `SubmissionContext`'s docblock gives: the target's row must
 * be read from the world the workspace lock has already settled, or a
 * concurrently-committed grant is invisible to the gate about to judge its
 * revocation.
 *
 * The read is `resolveEffectiveRole`, NOT a bare `proj_memberships` SELECT —
 * that function is the module's one safe reader of the table (see
 * `./effective-role.ts`: a project-scope row can survive a workspace removal,
 * and only that function collapses such a row to "not a member"). It answers
 * `workspaceRole: null` for someone outside the workspace, which is the same
 * answer as "not an owner" on purpose: neither can be a move OUT of owner, so
 * neither is this rule's business.
 *
 * A payload that does not PARSE is passed through rather than refused: it is
 * the engine's `malformed-payload`, with the field path spelled out, and
 * refusing it here would report a shape problem as a role problem. That is the
 * same division `checkRolePermission`'s grant half makes, one function up.
 */
export async function checkMembershipOwnerAuthority(
  env: EventEnvelope,
  ctx: VisibilityContext,
): Promise<Refusal | null> {
  if (env.type !== 'membership.granted' && env.type !== 'membership.revoked') {
    return null;
  }
  // Only an admin or an owner reaches this line: `checkRolePermission` has
  // already refused everyone below admin with `WORKSPACE_MEMBERSHIP_REASON` and
  // runs first in `checkPermission`. So the only question left is owner vs
  // admin, and an owner is allowed through — an owner changing an owner's role
  // is exactly what the ruling permits, and is how ownership is transferred.
  if (ctx.eff.workspaceRole === 'owner') {
    return null;
  }

  /**
   * The target of the change, which is the only thing that differs between the
   * two events: both name `userId`, and only `granted` names a role.
   */
  let targetUserId: string;
  if (env.type === 'membership.granted') {
    const parsed = membershipGrantedPayload.safeParse(env.payload);
    if (!parsed.success) {
      return null;
    }
    // A grant TO owner is the OTHER direction and is already refused above by
    // `grant-owner-requires-owner`. Returning here rather than falling through
    // keeps one act to one rule id.
    if (parsed.data.role === 'owner') {
      return null;
    }
    targetUserId = parsed.data.userId;
  } else {
    const parsed = membershipRevokedPayload.safeParse(env.payload);
    if (!parsed.success) {
      return null;
    }
    // A revocation is a move out of owner by construction — it names no role,
    // and the projection deletes the row, so the target's owner status goes
    // with it whatever the payload says.
    targetUserId = parsed.data.userId;
  }

  const target = await resolveEffectiveRole(ctx.db, targetUserId, env.workspaceId);
  if (target.workspaceRole !== 'owner') {
    return null;
  }
  return refuseWith(REFUSAL_RULES.removeOwnerRequiresOwner, WORKSPACE_OWNER_REMOVE_REASON);
}

/**
 * The single permission gate the ingest service applies at the client door.
 *
 * Reads the role through `resolveEffectiveRole` and NEVER through a direct
 * `proj_memberships` SELECT: a bare project-scope read can return a row for
 * someone no longer in the workspace (see `./effective-role.ts`, and the table
 * comment on the migration). `resolveEffectiveRole` is the only safe reader.
 *
 * Four passes, one context, and the ORDER is load-bearing at every seam:
 *
 * 1. `checkRolePermission` — pure, and first because a claim from someone who
 *    is not here at all should not cause a single lookup.
 * 2. `checkMembershipOwnerAuthority` — the owner-only act the role gate cannot
 *    finish, because it needs the TARGET's current row. Second rather than
 *    third so that a claim from below admin is still answered by the pure pass
 *    above without a read, which is the property pass 1 exists to hold.
 * 3. `checkProjectExists` — before any membership question about a project, so
 *    a nonexistent project is reported as one (owner decision 2026-08-26).
 * 4. `checkVisibilityPermission` — the audience questions, plus the two write-
 *    authority questions that had to be sequenced after a database read.
 *
 * The call site is unchanged: this is still the one `SubmissionGate` the ingest
 * pipeline applies at the client door.
 */
export async function checkPermission(
  env: EventEnvelope,
  ctx: SubmissionContext,
): Promise<Refusal | null> {
  // Trash series, Plan 1 Task 5 (Review Focus 1): the write door must see
  // through a deleted workspace, or its owner could never submit the
  // `workspace.undeleted`/`purge.marked`/`purge.unmarked` that recover it —
  // `checkLifecycle` below is what actually confines which events pass.
  const eff = await resolveEffectiveRole(ctx.db, ctx.sessionUserId, env.workspaceId, {
    includeDeleted: true,
  });
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
  // The note vocabulary's own write-authority pass (notes series, Plan 1 of 6,
  // spec §4.2). Placed directly after the role gate and BEFORE the visibility
  // pass, for the reason `checkVisibilityPermission` returns early on a non-
  // ticket kind: a note event would otherwise be admitted here by falling
  // through a function that is about tickets, which is exactly the shape of
  // "nothing checks this" that reads as coverage.
  //
  // After the role gate on purpose: a guest creating a note is told
  // `permission.role` before any note is loaded, which is the owner's rule and
  // what case 18.027 pins.
  const noteRefusal = await checkNotePermission(env, permissionContext);
  if (noteRefusal !== null) {
    return noteRefusal;
  }
  // SECOND, and after the role gate on purpose: it is the question the role
  // gate cannot finish. `checkRolePermission` settles "are you at least an
  // admin"; this settles "and are you an owner, for the one act that is
  // owner-only" — which needs the TARGET's row, so it is the first pass that
  // reads. Ordering it after the pure gate means a non-admin's claim is still
  // answered without a lookup, exactly as before this pass existed.
  const ownerAuthorityRefusal = await checkMembershipOwnerAuthority(env, permissionContext);
  if (ownerAuthorityRefusal !== null) {
    return ownerAuthorityRefusal;
  }
  const projectRefusal = await checkProjectExists(ctx.db, env);
  if (projectRefusal !== null) {
    return projectRefusal;
  }
  // FIFTH — the prefix a project is founded under must be free in its
  // workspace (owner ruling 2026-09-20). Grouped with the project-shaped
  // questions above and, like them, strictly downstream of the role gates: a
  // caller with no standing to found a project is told that, and never gets a
  // sentence about which prefixes are in use.
  const prefixRefusal = await checkProjectPrefixUnique(ctx.db, env);
  if (prefixRefusal !== null) {
    return prefixRefusal;
  }
  // Prefixes and groups Task 6: the group tree's own questions (parent, level, sibling
  // names, in-use, a project filed under a real group). Downstream of the role gate for the
  // reason `checkGroupRules` states, and before the lifecycle pass: it reads only
  // `proj_groups` and `proj_projects`, which a lifecycle verdict cannot change.
  const groupRefusal = await checkGroupRules(ctx.db, env);
  if (groupRefusal !== null) {
    return groupRefusal;
  }
  // SIXTH — trash series, Plan 1 Task 4 (spec §4). State refusals ("already
  // deleted", "delete it first", "unmark it first") for the eight lifecycle
  // types, answered from the item's own row. `now` is the wall clock at the
  // door; `checkLifecycle` itself takes it as a parameter so a test can pin it.
  const lifecycleRefusal = await checkLifecycle(ctx.db, env, new Date());
  if (lifecycleRefusal !== null) {
    return lifecycleRefusal;
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
