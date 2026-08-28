import type { EnvelopeErrorCode } from './parse-event.js';

export type IngestErrorCode = EnvelopeErrorCode | 'duplicate-event-id';

/**
 * The rule name the entity↔workspace refusal reports (coordination doc §11).
 * It is a server-side door with no entry in the engine's REFUSAL_RULES, and it
 * still has to be spelled identically by everyone who meets it — Plan 10's
 * offline replica mirroring the door, and Plan 6's UI mapping rule names to
 * what a person is shown. One origin, so a rename cannot half-land.
 */
export const ENTITY_WORKSPACE_MISMATCH_RULE = 'entity-workspace-mismatch';

export type IngestResult =
  | { status: 'committed'; eventId: string; seq: number; serverTime: string }
  | { status: 'invalid'; eventId: string | null; code: IngestErrorCode; message: string }
  | { status: 'refused'; eventId: string; rule: string; reason: string };
