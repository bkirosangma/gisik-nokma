import { z } from 'zod';
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
import { createEventTypeRegistry } from './registry.js';
import { ticketTypeDefSchema } from './ticket-types.js';
import { ticketTransitionedPayloadSchema, workflowDefinedPayloadSchema } from './workflow.js';

/**
 * The shared event-type registry. The two workspace types below are
 * PROVISIONAL: they exist so the ledger, projections, and fixtures have
 * something real to carry in Plan 1. They may still be revised before any
 * production data exists; the ticket vocabulary beneath them is the closed
 * vocabulary of spec §3 and is contracted.
 *
 * Every registration names the entity kind its events are about, so the door
 * refuses a type filed against the wrong kind (coordination doc §11).
 */
export const domainRegistry = createEventTypeRegistry();

domainRegistry.register({
  type: 'workspace.created',
  version: 1,
  entityKind: 'workspace',
  payloadSchema: z.object({ name: z.string().min(1) }).strict(),
});

domainRegistry.register({
  type: 'workspace.renamed',
  version: 1,
  entityKind: 'workspace',
  payloadSchema: z.object({ name: z.string().min(1) }).strict(),
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
