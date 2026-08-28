import { ulid } from 'ulidx';
import type { EventEnvelope } from './envelope.js';

/**
 * Test-only envelope builder: valid defaults, override what the test cares
 * about. Shipped from the package (not a test directory) because every later
 * plan's tests build envelopes, and one builder is one place for the defaults
 * to stay valid.
 *
 * It returns a full EventEnvelope, including the two fields ingest assigns.
 * `parseEvent` validates the SUBMITTED shape and strips them, so a test that
 * round-trips through the door compares payloads, not whole envelopes.
 *
 * The defaults are ULIDs because `submittedEventSchema` requires them of
 * `workspaceId` and `actorId`: a readable placeholder like 'user-kiro' is
 * refused as a malformed envelope before any payload schema is consulted.
 */
export function makeEnvelope(
  partial: Partial<EventEnvelope> & Pick<EventEnvelope, 'type' | 'entity' | 'payload'>,
): EventEnvelope {
  return {
    id: ulid(),
    workspaceId: '01J9GWS0000000000000000000',
    version: 1,
    actorId: '01J9GACT000000000000000000',
    origin: 'server',
    clientTime: '2026-08-20T09:00:00.000Z',
    serverTime: '2026-08-20T09:00:00.100Z',
    seq: 1,
    ...partial,
  };
}
