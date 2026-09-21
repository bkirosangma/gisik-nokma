import { newSubmittedEvent, type SubmittedEvent } from '@gisik-nokma/domain';

/**
 * E2-42: `onComment` used to claim `actorId: state.assigneeId ?? 'me'` — a
 * real member's id when the ticket happened to have one. `actorId` is the
 * envelope's claim of authorship (`packages/domain/src/submit.ts:4-7`), so a
 * comment posted by anyone but the assignee claimed to be words the assignee
 * never wrote. The sync door's actor-mismatch check (`sync-service.ts:321`)
 * refuses the claim whenever the device's bound identity is not that
 * assignee, so the spoof never lands — but the shape is still wrong to ship.
 *
 * `UNATTRIBUTED_ACTOR_ID` cannot resolve to any workspace member — it is not
 * a ULID, so the domain layer's own `actorId: ulidString` check refuses it
 * (`envelope.ts:196`) rather than silently crediting someone. This function
 * takes no assignee-shaped input at all, so there is nothing left to guess
 * from.
 */
export const UNATTRIBUTED_ACTOR_ID = 'me';

export function buildCommentEvent(input: {
  workspaceId: string;
  ticketId: string;
  body: unknown;
}): SubmittedEvent {
  return newSubmittedEvent({
    workspaceId: input.workspaceId,
    entity: { kind: 'ticket', id: input.ticketId },
    type: 'comment.added',
    payload: { body: input.body },
    actorId: UNATTRIBUTED_ACTOR_ID,
    origin: 'mobile',
  });
}
