import {
  membershipGrantedPayload,
  membershipRevokedPayload,
  projectCreatedPayload,
  projectMemberAddedPayload,
  projectMemberRemovedPayload,
  workspaceCreatedPayload,
  workspaceRenamedPayload,
} from './events/membership.js';
import {
  claimContestedPayloadSchema,
  claimContestedResolvedPayloadSchema,
} from './events/contest-events.js';
import {
  attachmentAddedPayload,
  commentAddedPayload,
  ticketAssignedPayload,
  ticketCollaboratorPayload,
  ticketCreatedPayload,
  ticketFieldSetPayload,
  ticketReparentedPayload,
  ticketWorkflowReboundPayload,
} from './events/ticket-events.js';
import { visibilitySetPayload } from './events/visibility.js';
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

domainRegistry.register({
  type: 'comment.added',
  version: 1,
  entityKind: 'ticket',
  payloadSchema: commentAddedPayload,
});

domainRegistry.register({
  type: 'attachment.added',
  version: 1,
  entityKind: 'ticket',
  payloadSchema: attachmentAddedPayload,
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
