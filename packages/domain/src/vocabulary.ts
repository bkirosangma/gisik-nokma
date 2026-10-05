import {
  groupCreatedPayload,
  groupDeletedPayload,
  groupRenamedPayload,
  groupReorderedPayload,
} from './events/groups.js';
import { CONCEPT_EVENT_TYPES, CONCEPT_PAYLOADS } from './events/concept-events.js';
import {
  membershipGrantedPayload,
  membershipRevokedPayload,
  projectArchivedPayload,
  projectCreatedPayload,
  projectMemberAddedPayload,
  projectMemberRemovedPayload,
  projectRestoredPayload,
  projectUpdatedPayload,
  workspaceCreatedPayload,
  workspacePrefixChangedPayload,
  workspaceRenamedPayload,
} from './events/membership.js';
import {
  claimContestedPayloadSchema,
  claimContestedResolvedPayloadSchema,
} from './events/contest-events.js';
import {
  projectDeletedPayload,
  projectUndeletedPayload,
  purgeCompletedPayload,
  purgeMarkedPayload,
  purgeUnmarkedPayload,
  workspaceArchivedPayload,
  workspaceDeletedPayload,
  workspaceRestoredPayload,
  workspaceUndeletedPayload,
} from './events/lifecycle-events.js';
import {
  attachmentAddedPayload,
  commentAddedPayload,
  commentDeletedPayload,
  commentEditedPayload,
  ticketAssignedPayload,
  ticketClosedPayload,
  ticketCollaboratorPayload,
  ticketCreatedPayload,
  ticketDeletedPayload,
  ticketFieldSetPayload,
  ticketLinkAddedPayload,
  ticketLinkRemovedPayload,
  ticketRankedPayload,
  ticketReopenedPayload,
  ticketReparentedPayload,
  ticketRestoredPayload,
  ticketWorkflowReboundPayload,
} from './events/ticket-events.js';
import {
  noteAttachedPayload,
  noteBodySetPayload,
  noteCreatedPayload,
  noteDeletedPayload,
  noteDetachedPayload,
  noteMovedPayload,
  noteRenamedPayload,
  noteRestoredPayload,
  noteScopeSetPayload,
} from './events/note-events.js';
import { visibilitySetPayload } from './events/visibility.js';
import { workspaceSettingsSetPayloadSchema } from './events/workspace-settings.js';
import {
  inviteAcceptedPayload,
  inviteDeclinedPayload,
  inviteRevokedPayload,
  inviteSentPayload,
} from './events/invites.js';
import { createEventTypeRegistry } from './registry.js';
import { ticketTypeDefSchema } from './ticket-types.js';
import { ticketTransitionedPayloadSchema, workflowDefinedPayloadSchema } from './workflow.js';

/**
 * The shared event-type registry.
 *
 * The two workspace types below were PROVISIONAL under Plan 1 — they existed so
 * the ledger, projections and fixtures had something real to carry. Plan 4 has
 * now landed the workspace/membership vocabulary they were standing in for, so
 * they are provisional no longer: they are the contracted `workspace.created`
 * and `workspace.renamed`, and their shapes have moved to `events/membership.ts`
 * beside their siblings. Taking them over is a re-point, never a re-register —
 * `register` throws on a duplicate `type@version`, so a second registration
 * would crash at module load (coordination decision 6).
 *
 * Every registration names the entity kind its events are about, so the door
 * refuses a type filed against the wrong kind (coordination doc §11).
 */
export const domainRegistry = createEventTypeRegistry();

domainRegistry.register({
  type: 'workspace.created',
  version: 1,
  entityKind: 'workspace',
  payloadSchema: workspaceCreatedPayload,
});

domainRegistry.register({
  type: 'workspace.renamed',
  version: 1,
  entityKind: 'workspace',
  payloadSchema: workspaceRenamedPayload,
});

domainRegistry.register({
  type: 'workspace.prefix_changed',
  version: 1,
  entityKind: 'workspace',
  payloadSchema: workspacePrefixChangedPayload,
});

domainRegistry.register({
  type: 'workflow.defined',
  version: 1,
  entityKind: 'workflow',
  payloadSchema: workflowDefinedPayloadSchema,
});

/**
 * The ticket vocabulary (Plan 3 Task 2). Eleven types, all version 1, each
 * bound to the entity kind its events are about.
 *
 * `ticket.transitioned` binds the schema Plan 2 already shipped in
 * `./workflow.ts` — `{ to, comment?: { text }, evidenceAttachmentId?, cause? }`
 * — and not the `toStateId` shape Plan 3's text pinned before Plan 2 landed.
 * That schema is what the rule engine parses and what all 61 planted-defect
 * fixtures speak; a second shape for one event type would let the door and the
 * engine disagree about what a transition claim even is. Nothing needed
 * deleting to get here: Plan 2 shipped the schema but never a registration
 * (coordination §6 — verified, this file held exactly three types).
 *
 * `comment.added` and `attachment.added` are about a TICKET: the comment and
 * the attachment are claims on the ticket's own history, not entities with
 * their own streams.
 *
 * ⚠ **That sentence covered two types and is now true of ONE.** The notes
 * series (Plan 1 of 6) widened `comment.added` to `['ticket', 'note']` — see
 * its registration below, which carries the reason. `attachment.added` is
 * unchanged and still ticket-only.
 */
domainRegistry.register({
  type: 'ticket-type.defined',
  version: 1,
  entityKind: 'ticket-type',
  payloadSchema: ticketTypeDefSchema,
});

domainRegistry.register({
  type: 'ticket.created',
  version: 1,
  entityKind: 'ticket',
  payloadSchema: ticketCreatedPayload,
});

domainRegistry.register({
  type: 'ticket.transitioned',
  version: 1,
  entityKind: 'ticket',
  payloadSchema: ticketTransitionedPayloadSchema,
});

domainRegistry.register({
  type: 'ticket.assigned',
  version: 1,
  entityKind: 'ticket',
  payloadSchema: ticketAssignedPayload,
});

domainRegistry.register({
  type: 'ticket.collaborator_added',
  version: 1,
  entityKind: 'ticket',
  payloadSchema: ticketCollaboratorPayload,
});

domainRegistry.register({
  type: 'ticket.collaborator_removed',
  version: 1,
  entityKind: 'ticket',
  payloadSchema: ticketCollaboratorPayload,
});

domainRegistry.register({
  type: 'ticket.field_set',
  version: 1,
  entityKind: 'ticket',
  payloadSchema: ticketFieldSetPayload,
});

domainRegistry.register({
  type: 'ticket.reparented',
  version: 1,
  entityKind: 'ticket',
  payloadSchema: ticketReparentedPayload,
});

domainRegistry.register({
  type: 'ticket.workflow_rebound',
  version: 1,
  entityKind: 'ticket',
  payloadSchema: ticketWorkflowReboundPayload,
});

/**
 * The closed flag's two events (backlog/closed spec §1.2, 2026-09-17). Neither
 * moves `stateId` — `ticket-state.ts` folds them into `TicketState.closed`
 * alone — but both are filed against the ticket whose flag they set, exactly
 * as every other ticket claim is.
 */
domainRegistry.register({
  type: 'ticket.closed',
  version: 1,
  entityKind: 'ticket',
  payloadSchema: ticketClosedPayload,
});

domainRegistry.register({
  type: 'ticket.reopened',
  version: 1,
  entityKind: 'ticket',
  payloadSchema: ticketReopenedPayload,
});

/**
 * `ticket.ranked` (backlog/closed spec §8.1, 2026-09-18). Filed against the
 * ticket whose key it sets, like every other ticket claim. It belongs in
 * `TICKET_EVENT_TYPES` beside the closed pair for the same reason they do:
 * it moves head state (`rank`) and leaves `stateId` alone, so any replay
 * reader that iterates that list must see it. Backlog-only is the engine's
 * door (`rank-requires-backlog`), not this registry's.
 */
domainRegistry.register({
  type: 'ticket.ranked',
  version: 1,
  entityKind: 'ticket',
  payloadSchema: ticketRankedPayload,
});

/**
 * The soft-delete pair, filed against the ticket whose flag it sets exactly as
 * the closed pair above is. Neither moves `stateId` — the flag and the state
 * are orthogonal, the same split `ticket.closed` records.
 *
 * `ticket.deleted` is the product's `Delete` — a history-retaining removal with
 * an undo, not an erasure (`design-system/interactive/desktop.dc.html`'s
 * `faq-delete` entry: *"The ticket stops appearing in views. Its history is
 * retained, because other events cite it"*). `ticket.restored` is that undo.
 * Both are in `TICKET_EVENT_TYPES` for the reason the closed pair and
 * `ticket.ranked` are: each moves head state (`deleted`) and leaves `stateId`
 * alone, so any replay reader iterating that list must see them.
 */
domainRegistry.register({
  type: 'ticket.deleted',
  version: 1,
  entityKind: 'ticket',
  payloadSchema: ticketDeletedPayload,
});

domainRegistry.register({
  type: 'ticket.restored',
  version: 1,
  entityKind: 'ticket',
  payloadSchema: ticketRestoredPayload,
});

/**
 * The typed-link pair (Knowledge Graph spec A §2.2): filed against the SOURCE ticket, whoever writes
 * them. Both FOLD into `TicketState.links` (so they are in `TICKET_EVENT_TYPES`) and carry nothing
 * beyond the fold, so they are deliberately not backfilled below a snapshot.
 */
domainRegistry.register({
  type: 'ticket.link_added',
  version: 1,
  entityKind: 'ticket',
  payloadSchema: ticketLinkAddedPayload,
});

domainRegistry.register({
  type: 'ticket.link_removed',
  version: 1,
  entityKind: 'ticket',
  payloadSchema: ticketLinkRemovedPayload,
});

/**
 * `comment.added` is the registry's FIRST two-kind type (notes series, Plan 1
 * of 6, spec §3.2). A comment on a ticket and a comment on a note are the same
 * claim — a body, filed against an entity the author can read — so the type is
 * declared for both rather than re-registered under a second name, which the
 * registry refuses anyway (`register` throws on a duplicate `type@version`).
 *
 * The LIST is the whole change and it does not widen the type: `parseEvent`
 * still refuses `comment.added` against any third kind, and every other ticket
 * type below stays bound to `'ticket'` alone. The prose above reads "are about
 * a TICKET" for `comment.added` and that sentence is now false for exactly one
 * of the two types it covered — `attachment.added` is untouched and still
 * ticket-only.
 */
domainRegistry.register({
  type: 'comment.added',
  version: 1,
  entityKind: ['ticket', 'note'],
  payloadSchema: commentAddedPayload,
});

// MCP-everything T2 (spec §6, M-E9): a comment's edit and deletion span the same two kinds as its add.
domainRegistry.register({ type: 'comment.edited', version: 1, entityKind: ['ticket', 'note'], payloadSchema: commentEditedPayload });
domainRegistry.register({ type: 'comment.deleted', version: 1, entityKind: ['ticket', 'note'], payloadSchema: commentDeletedPayload });

domainRegistry.register({
  type: 'attachment.added',
  version: 1,
  entityKind: 'ticket',
  payloadSchema: attachmentAddedPayload,
});

/**
 * The note vocabulary (notes series, Plan 1 of 6, spec §3.2). Nine types, all
 * version 1, all bound to entity kind `'note'`.
 *
 * Registered here rather than in a block of their own further down, because
 * `comment.added` above is the type that spans into this vocabulary and the two
 * are one reading: a reader who has just seen the note's own nine types meets
 * the tenth — the one it shares with tickets — in the same paragraph rather
 * than 200 lines away.
 *
 * `note.scope_set` reuses `note.created`'s `scope` schema under its own name
 * (`events/note-events.ts` explains why they are one definition). The three
 * types whose work is entirely in the reducer — `note.attached`,
 * `note.detached`, `note.restored` — carry a payload of one ticket id or of
 * nothing at all, and are refusals and state transitions in
 * `note-state.ts` rather than anything the door could decide.
 */
domainRegistry.register({
  type: 'note.created',
  version: 1,
  entityKind: 'note',
  payloadSchema: noteCreatedPayload,
});

domainRegistry.register({
  type: 'note.renamed',
  version: 1,
  entityKind: 'note',
  payloadSchema: noteRenamedPayload,
});

domainRegistry.register({
  type: 'note.body_set',
  version: 1,
  entityKind: 'note',
  payloadSchema: noteBodySetPayload,
});

domainRegistry.register({
  type: 'note.scope_set',
  version: 1,
  entityKind: 'note',
  payloadSchema: noteScopeSetPayload,
});

domainRegistry.register({
  type: 'note.moved',
  version: 1,
  entityKind: 'note',
  payloadSchema: noteMovedPayload,
});

domainRegistry.register({
  type: 'note.attached',
  version: 1,
  entityKind: 'note',
  payloadSchema: noteAttachedPayload,
});

domainRegistry.register({
  type: 'note.detached',
  version: 1,
  entityKind: 'note',
  payloadSchema: noteDetachedPayload,
});

domainRegistry.register({
  type: 'note.deleted',
  version: 1,
  entityKind: 'note',
  payloadSchema: noteDeletedPayload,
});

domainRegistry.register({
  type: 'note.restored',
  version: 1,
  entityKind: 'note',
  payloadSchema: noteRestoredPayload,
});

/**
/**
 * The membership and visibility vocabulary (Plan 4 Task 3). Six types, all
 * version 1.
 *
 * The two membership types are the only ones in the whole registry whose entity
 * id is not a bare ULID: a membership is addressed as
 * `${workspaceId}:${userId}` so grant → revoke → re-grant share one stream
 * (coordination decision 5, owner-ratified 2026-08-28). `envelope.ts` admits
 * that shape for `kind: 'membership'` alone, and `parse-event.ts` refuses an id
 * that names a different workspace or a different user than the event itself
 * does.
 *
 * `project.member_added` / `project.member_removed` are filed against the
 * PROJECT, not against a membership: they are the project's roster history, and
 * since the 2026-08-27 collapse they are the only way anyone joins or leaves a
 * project.
 *
 * `visibility.set` is filed against the TICKET whose audience it changes — a
 * claim on that ticket's own history, exactly as `comment.added` is.
 */
domainRegistry.register({
  type: 'project.created',
  version: 1,
  entityKind: 'project',
  payloadSchema: projectCreatedPayload,
});

domainRegistry.register({
  type: 'membership.granted',
  version: 1,
  entityKind: 'membership',
  payloadSchema: membershipGrantedPayload,
});

domainRegistry.register({
  type: 'membership.revoked',
  version: 1,
  entityKind: 'membership',
  payloadSchema: membershipRevokedPayload,
});

domainRegistry.register({
  type: 'project.member_added',
  version: 1,
  entityKind: 'project',
  payloadSchema: projectMemberAddedPayload,
});

domainRegistry.register({
  type: 'project.member_removed',
  version: 1,
  entityKind: 'project',
  payloadSchema: projectMemberRemovedPayload,
});

/**
 * Archive and restore (Task 16, owner brief 2026-09-09). Filed against the
 * PROJECT, like the two roster events above and for the same reason: the
 * project is the thing the claim is about, so `entity.id` names it and the
 * payload is empty. See `events/membership.ts` for why this is a symmetric PAIR
 * rather than one event carrying a boolean.
 */
domainRegistry.register({
  type: 'project.archived',
  version: 1,
  entityKind: 'project',
  payloadSchema: projectArchivedPayload,
});

domainRegistry.register({
  type: 'project.restored',
  version: 1,
  entityKind: 'project',
  payloadSchema: projectRestoredPayload,
});

domainRegistry.register({
  type: 'project.updated',
  version: 1,
  entityKind: 'project',
  payloadSchema: projectUpdatedPayload,
});

/**
 * The project-group vocabulary (prefixes and groups plan Task 6). All four are
 * filed against a `group` entity and are workspace owner/admin acts (the door's
 * `ADMIN_ONLY_TYPES`). The tree rules live at the door; the shapes in `./events/groups.ts`.
 */
domainRegistry.register({
  type: 'group.created',
  version: 1,
  entityKind: 'group',
  payloadSchema: groupCreatedPayload,
});
domainRegistry.register({
  type: 'group.renamed',
  version: 1,
  entityKind: 'group',
  payloadSchema: groupRenamedPayload,
});
domainRegistry.register({
  type: 'group.reordered',
  version: 1,
  entityKind: 'group',
  payloadSchema: groupReorderedPayload,
});
domainRegistry.register({
  type: 'group.deleted',
  version: 1,
  entityKind: 'group',
  payloadSchema: groupDeletedPayload,
});

/**
 * The concept vocabulary (Knowledge Graph spec D §3.1). Nine types against a `concept` entity. Who may write is
 * the door's `checkConceptPermission` (D4: the actor must see the concept and everything the event adds).
 */
for (const type of CONCEPT_EVENT_TYPES) {
  domainRegistry.register({ type, version: 1, entityKind: 'concept', payloadSchema: CONCEPT_PAYLOADS[type] });
}

/**
 * The lifecycle vocabulary (trash series, Plan 1, spec
 * `docs/superpowers/specs/2026-09-23-trash-and-purge-design.md` §4).
 */
domainRegistry.register({
  type: 'workspace.archived',
  version: 1,
  entityKind: 'workspace',
  payloadSchema: workspaceArchivedPayload,
});
domainRegistry.register({
  type: 'workspace.restored',
  version: 1,
  entityKind: 'workspace',
  payloadSchema: workspaceRestoredPayload,
});
domainRegistry.register({
  type: 'workspace.deleted',
  version: 1,
  entityKind: 'workspace',
  payloadSchema: workspaceDeletedPayload,
});
domainRegistry.register({
  type: 'workspace.undeleted',
  version: 1,
  entityKind: 'workspace',
  payloadSchema: workspaceUndeletedPayload,
});
domainRegistry.register({
  type: 'project.deleted',
  version: 1,
  entityKind: 'project',
  payloadSchema: projectDeletedPayload,
});
domainRegistry.register({
  type: 'project.undeleted',
  version: 1,
  entityKind: 'project',
  payloadSchema: projectUndeletedPayload,
});
domainRegistry.register({
  type: 'purge.marked',
  version: 1,
  entityKind: ['workspace', 'project', 'ticket', 'note'],
  payloadSchema: purgeMarkedPayload,
});
domainRegistry.register({
  type: 'purge.unmarked',
  version: 1,
  entityKind: ['workspace', 'project', 'ticket', 'note'],
  payloadSchema: purgeUnmarkedPayload,
});
domainRegistry.register({
  type: 'purge.completed',
  version: 1,
  entityKind: ['workspace', 'project', 'ticket', 'note'],
  payloadSchema: purgeCompletedPayload,
});

domainRegistry.register({
  type: 'visibility.set',
  version: 1,
  entityKind: 'ticket',
  payloadSchema: visibilitySetPayload,
});

/**
 * The contest vocabulary (Plan 10 Task 1). A sync-time refusal is appended to
 * the ledger as a contested claim on the TICKET the refused claim touched, and
 * its resolution is another event on the same ticket — so both bind
 * `entityKind: 'ticket'`.
 *
 * The binding is not decorative. `parseEvent` short-circuits its type-kind
 * check when a registration omits `entityKind`, so leaving it off here would
 * silently admit a `claim.contested` filed against a workflow or a workspace,
 * and the ledger is append-only by trigger — that event could never be
 * corrected, only superseded.
 *
 * Registered here rather than as an import side-effect in
 * `events/contest-events.ts`: `register` throws on a duplicate key, so exactly
 * one file may own the call, and in this package that file is this one.
 */
domainRegistry.register({
  type: 'claim.contested',
  version: 1,
  entityKind: 'ticket',
  payloadSchema: claimContestedPayloadSchema,
});

domainRegistry.register({
  type: 'claim.contested_resolved',
  version: 1,
  entityKind: 'ticket',
  payloadSchema: claimContestedResolvedPayloadSchema,
});

/**
 * The invitation vocabulary (Plan 4 Task 14; a FOURTH type added by Task 17).
 * All version 1, all filed against `entityKind: 'invite'` — the member
 * `envelope.ts` reserved for exactly this and left INERT until Task 14, because
 * no registration declared it. This is the declaration that wakes it.
 *
 * The entity id is the `inviteId`, and `parse-event.ts` refuses any of the
 * four whose `entity.id` and `payload.inviteId` disagree — the same coherence
 * rule the membership types get, for the same reason: every event about one
 * invitation must land on one stream, or a revoke and an accept can each start
 * their own history of the same invitation and neither knows about the other.
 * That guard keys on `entity.kind === 'invite'` and not on a list of types, so
 * `invite.declined` inherits it by being filed at the invite entity rather than
 * by being added anywhere — which is why nothing in `parse-event.ts` changed
 * when it was registered. The same is true of `visible-events-for.ts`, which
 * withholds an invitation's address from non-admins on sync-down by entity
 * KIND: a new invite type is withheld the day it exists.
 *
 * `invite.accepted` and `invite.declined` are registered like any other type,
 * and being registered is NOT the same as being submittable:
 * `checkRolePermission` refuses BOTH from every client envelope-origin.
 * Registration is what lets the SERVER append them, and what lets every replica
 * parse one when it arrives.
 */
domainRegistry.register({
  type: 'invite.sent',
  version: 1,
  entityKind: 'invite',
  payloadSchema: inviteSentPayload,
});

domainRegistry.register({
  type: 'invite.accepted',
  version: 1,
  entityKind: 'invite',
  payloadSchema: inviteAcceptedPayload,
});

domainRegistry.register({
  type: 'invite.revoked',
  version: 1,
  entityKind: 'invite',
  payloadSchema: inviteRevokedPayload,
});

domainRegistry.register({
  type: 'invite.declined',
  version: 1,
  entityKind: 'invite',
  payloadSchema: inviteDeclinedPayload,
});

/**
 * The workspace settings vocabulary (Plan 5 Task 3). The attention strip's
 * two thresholds, claimed against the workspace itself — `entityKind:
 * 'workspace'` so `parseEvent`'s kind guard refuses a settings claim filed
 * against anything else (coordination doc §11).
 */
domainRegistry.register({
  type: 'workspace.settings_set',
  version: 1,
  entityKind: 'workspace',
  payloadSchema: workspaceSettingsSetPayloadSchema,
});
