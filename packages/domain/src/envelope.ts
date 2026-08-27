import { z } from 'zod';
import { ULID_REGEX } from './ids.js';

export const ENTITY_KINDS = ['workspace', 'project', 'ticket', 'workflow', 'ticket-type', 'membership'] as const;
export type EntityKind = (typeof ENTITY_KINDS)[number];

export const ORIGINS = ['web', 'mobile', 'desktop', 'server'] as const;
export type Origin = (typeof ORIGINS)[number];

/**
 * ISO 8601 with whole seconds and AT MOST 3 fractional digits, 'Z' or a numeric
 * offset. Bounding precision at milliseconds keeps every stored claim exact on
 * readback: a JS Date and a Postgres timestamptz both hold a millisecond
 * instant without loss. Any offset is admitted on the wire — storage keeps the
 * instant, not the label the device attached to it (owner decision: time is
 * Asia/Kolkata).
 */
export const ISO_DATETIME_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/;

const isoDatetime = z
  .string()
  .regex(ISO_DATETIME_REGEX, 'must be ISO 8601 with at most millisecond precision')
  .refine((value) => !Number.isNaN(Date.parse(value)), 'must be a real calendar datetime');

const ulidString = z.string().regex(ULID_REGEX, 'must be a ULID');

export type EventEnvelope = {
  id: string;              // ULID, client-generated
  workspaceId: string;
  entity: { kind: EntityKind; id: string };
  type: string;            // 'ticket.transitioned' etc.
  version: number;         // schema version of this event type
  payload: unknown;        // validated per-type by zod schema from packages/domain
  actorId: string;
  origin: Origin;
  clientTime: string;      // ISO 8601 — the actor's claim about when
  serverTime: string;      // ISO 8601 — assigned at ingest
  seq: number;             // per-entity sequence, assigned at ingest
};

/** What a client submits: the envelope minus the two fields the server assigns at ingest. */
export type SubmittedEvent = Omit<EventEnvelope, 'serverTime' | 'seq'>;

export const submittedEventSchema = z.object({
  id: ulidString,
  workspaceId: ulidString,
  entity: z.object({ kind: z.enum(ENTITY_KINDS), id: ulidString }),
  type: z.string().min(1),
  version: z.number().int().positive(),
  payload: z.unknown(),
  actorId: ulidString,
  origin: z.enum(ORIGINS),
  clientTime: isoDatetime,
});

export const eventEnvelopeSchema = submittedEventSchema.extend({
  serverTime: isoDatetime,
  seq: z.number().int().positive(),
});
