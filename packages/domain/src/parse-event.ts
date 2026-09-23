import { membershipId } from './entity-state.js';
import { submittedEventSchema, type SubmittedEvent } from './envelope.js';
import type { EventTypeRegistry } from './registry.js';
import { domainRegistry } from './vocabulary.js';

export type EnvelopeErrorCode =
  | 'malformed-envelope'
  | 'unknown-event-type'
  | 'unknown-event-version'
  | 'entity-kind-mismatch'
  | 'invalid-payload';

export type ParsedEvent = { ok: true; event: SubmittedEvent };

export type EnvelopeError = {
  ok: false;
  code: EnvelopeErrorCode;
  message: string;          // plain language, safe to show the submitting user
  eventId: string | null;   // the claimed id, when one was readable
};

/**
 * Pure gatekeeper for the ledger: validates envelope shape, event-type
 * registration, version, the type↔kind binding, and payload. No I/O —
 * callable identically on client and server (spec §1 invariant 2). An
 * EnvelopeError is NOT a rule refusal: it means the submission is not a
 * well-formed claim at all.
 */
export function parseEvent(
  raw: unknown,
  registry: EventTypeRegistry = domainRegistry,
): ParsedEvent | EnvelopeError {
  const claimedId = extractClaimedId(raw);

  const envelope = submittedEventSchema.safeParse(raw);
  if (!envelope.success) {
    const issue = envelope.error.issues[0];
    const at = issue !== undefined && issue.path.length > 0 ? ` at ${issue.path.join('.')}` : '';
    return {
      ok: false,
      code: 'malformed-envelope',
      message: `event envelope is malformed${at}: ${issue?.message ?? 'invalid'}`,
      eventId: claimedId,
    };
  }

  const { type, version } = envelope.data;
  if (!registry.hasType(type)) {
    return {
      ok: false,
      code: 'unknown-event-type',
      message: `unknown event type '${type}' — the ledger accepts only what it can later replay`,
      eventId: envelope.data.id,
    };
  }

  const registration = registry.get(type, version);
  if (registration === undefined) {
    return {
      ok: false,
      code: 'unknown-event-version',
      message: `unknown version ${version} of event type '${type}'`,
      eventId: envelope.data.id,
    };
  }

  // The ledger is append-only by trigger, so an event filed against the wrong
  // kind can never be corrected, only superseded — and until then the entity's
  // head row and every kind-scoped read are wrong about what this event was.
  // A type that declares its kind is refused here rather than in each rule
  // module, so no later event type inherits the hole (coordination doc §11).
  //
  // Two layers, by design: on the server this door answers first, and the
  // engine's per-type kind checks stay because the fixture suite and the
  // offline replica enter at evaluateEvent and never pass through here. Same
  // condition, and deliberately the same sentence — a person who meets this
  // refusal twice should not have to work out whether it is the same refusal.
  const kind = envelope.data.entity.kind;
  // A registration may name ONE kind or a LIST of them (the notes series,
  // Plan 1 of 6). Normalising to an array first is what keeps the two spellings
  // one rule: `undefined` still admits anything, and a list of one still refuses
  // exactly what a bare string refused. `comment.added` is the list's first
  // user, admitted against both a ticket and a note.
  //
  // The refusal sentence reads the same in both directions — a single kind
  // joins into a one-element string with no separator, so the message every
  // existing test pins is unchanged to the byte.
  const allowedKinds =
    registration.entityKind === undefined
      ? undefined
      : Array.isArray(registration.entityKind)
        ? registration.entityKind
        : [registration.entityKind];
  if (allowedKinds !== undefined && !allowedKinds.includes(kind)) {
    return {
      ok: false,
      code: 'entity-kind-mismatch',
      message: `This ${type} event does not point at a ${allowedKinds.join(' or ')}; it points at a ${kind}.`,
      eventId: envelope.data.id,
    };
  }

  const payload = registration.payloadSchema.safeParse(envelope.data.payload);
  if (!payload.success) {
    const issue = payload.error.issues[0];
    const at = issue !== undefined && issue.path.length > 0 ? ` at ${issue.path.join('.')}` : '';
    return {
      ok: false,
      code: 'invalid-payload',
      message: `payload for '${type}' v${version} is invalid${at}: ${issue?.message ?? 'invalid'}`,
      eventId: envelope.data.id,
    };
  }

  // The USER half of the membership coherence check (coordination decision 5).
  // The envelope schema proves the id's shape and that it names this event's own
  // workspace; neither can see the payload, so neither can tell that
  // `wsA:userC` is filed on an event that grants userD. The regex alone would
  // admit exactly that, and it is not a harmless mis-address: the server's
  // entity↔workspace guard only fires once a head row exists, so the first
  // mis-filed event commits cleanly and a later, correctly-addressed revoke
  // opens a SECOND stream at seq 1 for the same person — the split membership
  // stream decision 5 exists to prevent, re-created by its own fix.
  //
  // It sits here, after payload validation, because it needs the PARSED
  // payload: reading `userId` off raw JSON would report an id mismatch when the
  // real complaint is that `userId` is not a ULID, and the honest refusal is
  // the one that names the actual fault. Two layers, deliberately — this door
  // answers for client and server alike, and Task 9's identical check on
  // `visibility.set` is a permission-layer answer the offline replica never
  // reaches.
  const { entity, workspaceId } = envelope.data;
  if (entity.kind === 'membership') {
    const userId = readUserId(payload.data);
    if (userId === null) {
      return {
        ok: false,
        code: 'malformed-envelope',
        message: `This membership event is filed at entity '${entity.id}' but its payload names no user — a membership's entity id is workspaceId:userId, so an event that does not say who it is about cannot be addressed at all.`,
        eventId: envelope.data.id,
      };
    }
    if (entity.id !== membershipId(workspaceId, userId)) {
      return {
        ok: false,
        code: 'malformed-envelope',
        message: `This membership event is filed at entity '${entity.id}', but it is about user '${userId}' in workspace '${workspaceId}' — a membership's entity id is workspaceId:userId. Filing it anywhere else starts a second stream for the same person.`,
        eventId: envelope.data.id,
      };
    }
  }

  // The same coherence question for INVITES (Plan 4 Task 14), and it is the
  // same defect with a different entity kind: all three invite types carry an
  // `inviteId` in the payload AND are filed against the invite entity, so an
  // event filed at invite A whose payload names invite B parses cleanly without
  // this. The server's entity↔workspace guard cannot catch it (both invites are
  // in the same workspace), and the head row only exists once something has
  // landed — so the first mis-filed `invite.revoked` commits against A while
  // meaning B, and the projection, which keys on `payload.inviteId`, revokes B
  // while A's stream carries the claim. Two answers to "was this invitation
  // revoked", in an append-only ledger where neither can be taken back.
  //
  // Here rather than in the permission layer, deliberately: an offline replica
  // enters at `evaluateEvent` and never reaches a permission check, and this is
  // a question about whether the claim is well-formed at all — the same
  // argument that put the membership half of decision 5 in this function.
  //
  // It reads the PARSED payload for the same reason the membership check does:
  // reading `inviteId` off raw JSON would report an id mismatch when the real
  // complaint is that `inviteId` is not a ULID.
  if (entity.kind === 'invite') {
    const inviteId = readInviteId(payload.data);
    if (inviteId === null) {
      return {
        ok: false,
        code: 'malformed-envelope',
        message: `This invite event is filed at entity '${entity.id}' but its payload names no invite — every invite event carries the inviteId it is about.`,
        eventId: envelope.data.id,
      };
    }
    if (entity.id !== inviteId) {
      return {
        ok: false,
        code: 'malformed-envelope',
        message: `This invite event is filed at entity '${entity.id}', but it is about invite '${inviteId}' — an invite's entity id IS its inviteId. Filing it anywhere else splits one invitation into two histories.`,
        eventId: envelope.data.id,
      };
    }
  }

  const event: SubmittedEvent = { ...envelope.data, payload: payload.data as unknown };
  return { ok: true, event };
}

/** The `inviteId` a validated payload claims, or null when it names none. */
function readInviteId(payload: unknown): string | null {
  if (typeof payload === 'object' && payload !== null && 'inviteId' in payload) {
    const inviteId = (payload as { inviteId: unknown }).inviteId;
    if (typeof inviteId === 'string') {
      return inviteId;
    }
  }
  return null;
}

/** The `userId` a validated payload claims, or null when it names none. */
function readUserId(payload: unknown): string | null {
  if (typeof payload === 'object' && payload !== null && 'userId' in payload) {
    const userId = (payload as { userId: unknown }).userId;
    if (typeof userId === 'string') {
      return userId;
    }
  }
  return null;
}

function extractClaimedId(raw: unknown): string | null {
  if (typeof raw === 'object' && raw !== null && 'id' in raw) {
    const id = (raw as { id: unknown }).id;
    if (typeof id === 'string') {
      return id;
    }
  }
  return null;
}
