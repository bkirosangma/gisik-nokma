import { newUlid } from './ids.js';
import type { EventEnvelope, Origin, SubmittedEvent } from './envelope.js';

/**
 * The one client-side envelope builder. Everything a client claims is here;
 * serverTime and seq are the server's to assign at ingest — a client that
 * invented them would be lying about facts it does not own.
 */
export function newSubmittedEvent(input: {
  workspaceId: string;
  entity: EventEnvelope['entity'];
  type: string;
  payload: unknown;
  actorId: string;
  origin: Origin;
  version?: number;
  now?: () => Date;
}): SubmittedEvent {
  const now = input.now ?? (() => new Date());
  return {
    id: newUlid(),
    workspaceId: input.workspaceId,
    entity: input.entity,
    type: input.type,
    version: input.version ?? 1,
    payload: input.payload,
    actorId: input.actorId,
    origin: input.origin,
    clientTime: now().toISOString(),
  };
}
