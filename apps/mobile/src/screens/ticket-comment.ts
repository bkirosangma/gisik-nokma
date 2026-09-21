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

/**
 * E5-44: `UNATTRIBUTED_ACTOR_ID` is never a valid ULID, so
 * `packages/domain`'s own `actorId: ulidString` check refuses EVERY comment
 * built with it — `malformed-envelope`, terminal, no retry
 * (`packages/sync-client/src/outbox/outbox.ts:406-412`), and the ticket
 * screen never re-reads the outbox to surface that failure. Before E2-42's
 * fix some comments (the ones on a ticket assigned to the device's bound
 * identity) could commit; after it, none can — there is no longer a
 * per-ticket condition to gate on, so the control is withheld outright
 * rather than accepting into a queue doomed to fail silently. Remove this
 * gate once Plan 6's session handling binds a real actorId.
 */
export const COMMENTING_AVAILABLE = false;

export const COMMENTING_WITHHELD_MESSAGE =
  "Commenting from the phone isn't available yet — sign-in for the phone is still interim. Comment from the website instead.";
