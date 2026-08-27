import { z } from 'zod';
import { createEventTypeRegistry } from './registry.js';

/**
 * The shared event-type registry. The two seed types below are PROVISIONAL:
 * they exist so the ledger, projections, and fixtures have something real to
 * carry in Plan 1. Later plans own the full closed vocabulary of spec §3
 * ('ticket.created', 'ticket.transitioned', 'workflow.defined', …) and may
 * revise these payloads before any production data exists.
 */
export const domainRegistry = createEventTypeRegistry();

domainRegistry.register({
  type: 'workspace.created',
  version: 1,
  payloadSchema: z.object({ name: z.string().min(1) }).strict(),
});

domainRegistry.register({
  type: 'workspace.renamed',
  version: 1,
  payloadSchema: z.object({ name: z.string().min(1) }).strict(),
});
