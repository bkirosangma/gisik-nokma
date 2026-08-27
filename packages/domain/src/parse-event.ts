import { submittedEventSchema, type SubmittedEvent } from './envelope.js';
import type { EventTypeRegistry } from './registry.js';
import { domainRegistry } from './vocabulary.js';

export type EnvelopeErrorCode =
  | 'malformed-envelope'
  | 'unknown-event-type'
  | 'unknown-event-version'
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
 * registration, version, and payload. No I/O — callable identically on
 * client and server (spec §1 invariant 2). An EnvelopeError is NOT a rule
 * refusal: it means the submission is not a well-formed claim at all.
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
