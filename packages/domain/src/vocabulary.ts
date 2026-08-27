import { z } from 'zod';
import { createEventTypeRegistry } from './registry.js';
import { workflowDefinedPayloadSchema } from './workflow.js';

/**
 * The shared event-type registry. The two workspace types below are
 * PROVISIONAL: they exist so the ledger, projections, and fixtures have
 * something real to carry in Plan 1. Later plans own the rest of the closed
 * vocabulary of spec §3 ('ticket.created', 'ticket.transitioned', …) and may
 * revise these payloads before any production data exists.
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
