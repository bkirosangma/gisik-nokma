import { z } from 'zod';
import { eventEnvelopeSchema, type EventEnvelope } from './envelope.js';

/**
 * What the ledger stores: the contract-frozen domain envelope plus the
 * server-assigned workspace stream cursor. `EventEnvelope` itself does not
 * gain the field — clients never author it and treat it as opaque.
 */
export type LedgerEvent = EventEnvelope & { workspaceSeq: number };

/**
 * The runtime shape of a `LedgerEvent`, for the one consumer that cannot trust
 * a compiler: a REPLICA reading frames off the wire (Plan 10), and the fakes
 * Plans 6, 9 and 10 stand in for this server while it is being written.
 *
 * It is `eventEnvelopeSchema` intersected with the cursor rather than a second
 * spelling of the envelope, so the thirteen fields have exactly one definition
 * and this schema inherits the membership coherence check with them. It
 * inherits their gap too: `eventEnvelopeSchema`'s own docblock says a bare
 * envelope is only half-validated and **`parseEvent` is what validates an
 * event**. This adds the cursor, nothing else.
 *
 * `workspaceSeq` is `.positive()`, not `.min(0)`: `readStreamSeq` returns 0 for
 * a workspace with no events, so 0 is a CURSOR value and never an event's
 * position. A frame carrying `workspaceSeq: 0` is a fake that filled the field
 * in from a default.
 */
export const ledgerEventSchema = eventEnvelopeSchema.and(
  z.object({ workspaceSeq: z.number().int().positive() }),
);
