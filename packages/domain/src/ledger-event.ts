import type { EventEnvelope } from './envelope.js';

/**
 * What the ledger stores: the contract-frozen domain envelope plus the
 * server-assigned workspace stream cursor. `EventEnvelope` itself does not
 * gain the field — clients never author it and treat it as opaque.
 */
export type LedgerEvent = EventEnvelope & { workspaceSeq: number };
