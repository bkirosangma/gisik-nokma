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
  const kind = envelope.data.entity.kind;
  if (registration.entityKind !== undefined && registration.entityKind !== kind) {
    return {
      ok: false,
      code: 'entity-kind-mismatch',
      message: `event type '${type}' records what happens to a ${registration.entityKind}, but this envelope points at a ${kind}`,
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

  const event: SubmittedEvent = { ...envelope.data, payload: payload.data as unknown };
  return { ok: true, event };
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
