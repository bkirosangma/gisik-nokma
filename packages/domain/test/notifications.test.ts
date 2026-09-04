import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  NOTIFICATION_KINDS,
  assignmentNotificationPayloadSchema,
  contestedClaimNotificationPayloadSchema,
  dateApproachingNotificationPayloadSchema,
  dateClaimProvenanceSchema,
  mentionNotificationPayloadSchema,
  notificationPayloadSchemaByKind,
  parseNotification,
  staleTicketNotificationPayloadSchema,
} from '../src/notifications.js';
import type { NotificationPayload } from '../src/notifications.js';

const approachingPayload = {
  ticketId: 't1',
  ticketTitle: 'Renew the DLT registration',
  field: 'dueDate',
  claim: {
    date: '2026-08-30',
    note: 'GST filing',
    actorId: 'user_kiro',
    clientTime: '2026-08-19T10:00:00.000Z',
    serverTime: '2026-08-19T10:00:01.000Z',
  },
} as const;

describe('notification vocabulary', () => {
  it('has exactly the five kinds', () => {
    expect(NOTIFICATION_KINDS).toEqual(['assignment', 'mention', 'contested-claim', 'date-approaching', 'stale-ticket']);
  });

  it('every kind has a payload schema', () => {
    for (const kind of NOTIFICATION_KINDS) {
      expect(notificationPayloadSchemaByKind[kind]).toBeDefined();
    }
  });

  it('a date-approaching payload is the claim with its provenance, verbatim', () => {
    expect(dateApproachingNotificationPayloadSchema.parse(approachingPayload)).toEqual(approachingPayload);
  });

  it('cannot carry system-invented urgency — unknown keys refuse (planted defect)', () => {
    expect(dateApproachingNotificationPayloadSchema.safeParse({ ...approachingPayload, urgency: 'high' }).success).toBe(false);
    expect(dateApproachingNotificationPayloadSchema.safeParse({ ...approachingPayload, priority: 1 }).success).toBe(false);
    expect(
      assignmentNotificationPayloadSchema.safeParse({
        ticketId: 't1',
        ticketTitle: 'X',
        assignedBy: 'user_a',
        eventId: 'e1',
        clientTime: '2026-08-19T10:00:00.000Z',
        serverTime: '2026-08-19T10:00:01.000Z',
        severity: 'critical',
      }).success,
    ).toBe(false);
  });

  it('a claim without provenance refuses — attribution is not optional', () => {
    const { actorId: _dropped, ...claimWithoutActor } = approachingPayload.claim;
    expect(dateApproachingNotificationPayloadSchema.safeParse({ ...approachingPayload, claim: claimWithoutActor }).success).toBe(false);
  });

  it('parseNotification validates the payload against its kind', () => {
    const row = {
      id: '01J9GN0T000000000000000001',
      userId: 'user_kiro',
      workspaceId: 'ws_1',
      kind: 'date-approaching',
      dedupeKey: 'date-approaching:t1:2026-08-30',
      payload: approachingPayload,
      read: false,
      createdAt: '2026-08-23T05:00:00.000Z',
    };
    expect(parseNotification(row)).toEqual(row);
    expect(() => parseNotification({ ...row, kind: 'assignment' })).toThrow();
  });
});

/* ------------------------------------------------------------------------ *
 * The rest of this file exists because a review swept twelve mutations of
 * `src/notifications.ts` past the six tests above. The production code was
 * right in every case; the guarantees were simply unpinned. This vocabulary
 * is consumed by Plan 9 Tasks 4, 5, 7 and 12, so anything left unpinned here
 * gets re-argued four times downstream.
 * ------------------------------------------------------------------------ */

type AnySchema = z.ZodType<unknown, z.ZodTypeDef, unknown>;
type Row = Record<string, unknown>;

const claimProvenance: Row = { ...approachingPayload.claim };

const assignmentPayload: Row = {
  ticketId: 't1',
  ticketTitle: 'Renew the DLT registration',
  assignedBy: 'user_bina',
  eventId: 'e1',
  clientTime: '2026-08-19T10:00:00.000Z',
  serverTime: '2026-08-19T10:00:01.000Z',
};

const mentionPayload: Row = {
  ticketId: 't1',
  ticketTitle: 'Renew the DLT registration',
  mentionedBy: 'user_bina',
  eventId: 'e2',
  source: 'comment',
  excerpt: 'asked @kiro to check the filing',
  clientTime: '2026-08-19T10:00:00.000Z',
  serverTime: '2026-08-19T10:00:01.000Z',
};

const contestedClaim: Row = {
  eventId: 'e3',
  type: 'claim.field_set',
  actorId: 'user_kiro',
  clientTime: '2026-08-19T10:00:00.000Z',
};

const contestedPayload: Row = {
  ticketId: 't1',
  rule: 'wildcard-edge',
  reason: 'the transition has no edge in the workflow',
  claim: contestedClaim,
  contestEventId: 'e4',
  serverTime: '2026-08-19T10:00:02.000Z',
};

const approachingRow: Row = { ...approachingPayload, claim: { ...approachingPayload.claim } };

const stalePayload: Row = {
  ticketId: 't1',
  ticketTitle: 'Renew the DLT registration',
  stateId: 'st_in_progress',
  stateName: 'In progress',
  enteredAt: '2026-08-01T05:00:00.000Z',
  enteredBy: 'user_kiro',
};

const notificationRow: Row = {
  id: '01J9GN0T000000000000000001',
  userId: 'user_kiro',
  workspaceId: 'ws_1',
  kind: 'date-approaching',
  dedupeKey: 'date-approaching:t1:2026-08-30',
  payload: approachingRow,
  read: false,
  createdAt: '2026-08-23T05:00:00.000Z',
};

function omit(row: Row, key: string): Row {
  const copy = { ...row };
  delete copy[key];
  return copy;
}

/**
 * `required` is every key the schema will not accept as absent; `nonEmpty` is
 * every key declared through the shared `nonEmpty` helper, where `''` must be
 * refused. Keys governed by some OTHER rule are deliberately absent from
 * `nonEmpty` so that each test reddens for exactly one reason: `date` is a
 * regex (pinned separately), `source` an enum, `field` a literal, and
 * `ticketTitle` / `excerpt` / `stateName` are plain strings where `''` is legal.
 */
type RefusalTarget = {
  label: string;
  schema: AnySchema;
  valid: Row;
  required: readonly string[];
  nonEmpty: readonly string[];
  nested?: { key: string; required: readonly string[]; nonEmpty: readonly string[] };
};

const refusalTargets: readonly RefusalTarget[] = [
  {
    label: 'assignment',
    schema: assignmentNotificationPayloadSchema,
    valid: assignmentPayload,
    required: ['ticketId', 'ticketTitle', 'assignedBy', 'eventId', 'clientTime', 'serverTime'],
    nonEmpty: ['ticketId', 'assignedBy', 'eventId', 'clientTime', 'serverTime'],
  },
  {
    label: 'mention',
    schema: mentionNotificationPayloadSchema,
    valid: mentionPayload,
    required: ['ticketId', 'ticketTitle', 'mentionedBy', 'eventId', 'source', 'excerpt', 'clientTime', 'serverTime'],
    nonEmpty: ['ticketId', 'mentionedBy', 'eventId', 'clientTime', 'serverTime'],
  },
  {
    label: 'contested-claim',
    schema: contestedClaimNotificationPayloadSchema,
    valid: contestedPayload,
    required: ['ticketId', 'rule', 'reason', 'claim', 'contestEventId', 'serverTime'],
    nonEmpty: ['ticketId', 'rule', 'reason', 'contestEventId', 'serverTime'],
    nested: {
      key: 'claim',
      required: ['eventId', 'type', 'actorId', 'clientTime'],
      nonEmpty: ['eventId', 'type', 'actorId', 'clientTime'],
    },
  },
  {
    label: 'date-approaching',
    schema: dateApproachingNotificationPayloadSchema,
    valid: approachingRow,
    required: ['ticketId', 'ticketTitle', 'field', 'claim'],
    nonEmpty: ['ticketId'],
    nested: {
      key: 'claim',
      required: ['date', 'actorId', 'clientTime', 'serverTime'],
      nonEmpty: ['actorId', 'clientTime', 'serverTime'],
    },
  },
  {
    label: 'stale-ticket',
    schema: staleTicketNotificationPayloadSchema,
    valid: stalePayload,
    required: ['ticketId', 'ticketTitle', 'stateId', 'stateName', 'enteredAt', 'enteredBy'],
    nonEmpty: ['ticketId', 'stateId', 'enteredAt', 'enteredBy'],
  },
  {
    label: 'date-claim provenance',
    schema: dateClaimProvenanceSchema,
    valid: claimProvenance,
    required: ['date', 'actorId', 'clientTime', 'serverTime'],
    nonEmpty: ['actorId', 'clientTime', 'serverTime'],
  },
];

type RefusalCase = { name: string; schema: AnySchema; value: unknown };

const refusalCases: RefusalCase[] = refusalTargets.flatMap((target) => {
  const cases: RefusalCase[] = [];
  for (const field of target.required) {
    cases.push({ name: `${target.label}: a missing ${field} refuses`, schema: target.schema, value: omit(target.valid, field) });
  }
  for (const field of target.nonEmpty) {
    cases.push({ name: `${target.label}: an empty-string ${field} refuses`, schema: target.schema, value: { ...target.valid, [field]: '' } });
  }
  const nested = target.nested;
  if (nested) {
    const inner = target.valid[nested.key] as Row;
    for (const field of nested.required) {
      cases.push({
        name: `${target.label}: a missing ${nested.key}.${field} refuses`,
        schema: target.schema,
        value: { ...target.valid, [nested.key]: omit(inner, field) },
      });
    }
    for (const field of nested.nonEmpty) {
      cases.push({
        name: `${target.label}: an empty-string ${nested.key}.${field} refuses`,
        schema: target.schema,
        value: { ...target.valid, [nested.key]: { ...inner, [field]: '' } },
      });
    }
  }
  return cases;
});

describe('what a notification payload refuses', () => {
  it('every fixture is itself valid — the refusal table cannot pass by refusing everything', () => {
    for (const target of refusalTargets) {
      expect([target.label, target.schema.safeParse(target.valid).success]).toEqual([target.label, true]);
    }
    expect(refusalTargets.map((t) => t.label)).toEqual([
      'assignment',
      'mention',
      'contested-claim',
      'date-approaching',
      'stale-ticket',
      'date-claim provenance',
    ]);
  });

  it('the refusal table is populated — an empty it.each registers nothing and passes silently', () => {
    expect(refusalCases).toHaveLength(72);
  });

  it.each(refusalCases)('$name', ({ schema, value }) => {
    expect(schema.safeParse(value).success).toBe(false);
  });
});

/**
 * `.strict()` is the whole "no field where invented urgency could live" claim.
 * Every object in this module carries it, INCLUDING the nested `claim` objects
 * the commit message calls "carried verbatim" — verbatim means the claim's own
 * fields and nothing a notifier thought to add. Note these must assert refusal,
 * never a round-trip: zod's default is to STRIP unknown keys, so a `.toEqual`
 * on the parse output passes happily with `.strict()` removed.
 */
const strictCases: RefusalCase[] = [
  { name: 'assignment payload', schema: assignmentNotificationPayloadSchema, value: { ...assignmentPayload, urgency: 'high' } },
  { name: 'mention payload', schema: mentionNotificationPayloadSchema, value: { ...mentionPayload, urgency: 'high' } },
  { name: 'contested-claim payload', schema: contestedClaimNotificationPayloadSchema, value: { ...contestedPayload, urgency: 'high' } },
  {
    name: "contested-claim payload's nested claim",
    schema: contestedClaimNotificationPayloadSchema,
    value: { ...contestedPayload, claim: { ...contestedClaim, urgency: 'high' } },
  },
  { name: 'date-approaching payload', schema: dateApproachingNotificationPayloadSchema, value: { ...approachingRow, urgency: 'high' } },
  {
    name: "date-approaching payload's nested claim",
    schema: dateApproachingNotificationPayloadSchema,
    value: { ...approachingRow, claim: { ...claimProvenance, urgency: 'high' } },
  },
  { name: 'stale-ticket payload', schema: staleTicketNotificationPayloadSchema, value: { ...stalePayload, urgency: 'high' } },
  { name: 'the date-claim provenance schema itself', schema: dateClaimProvenanceSchema, value: { ...claimProvenance, urgency: 'high' } },
];

describe('no payload has a field where invented urgency could live', () => {
  it('the strict table covers all five kinds plus both nested claim objects', () => {
    expect(strictCases.map((c) => c.name)).toEqual([
      'assignment payload',
      'mention payload',
      'contested-claim payload',
      "contested-claim payload's nested claim",
      'date-approaching payload',
      "date-approaching payload's nested claim",
      'stale-ticket payload',
      'the date-claim provenance schema itself',
    ]);
  });

  it.each(strictCases)('$name refuses an unknown key', ({ schema, value }) => {
    expect(schema.safeParse(value).success).toBe(false);
  });
});

/**
 * The day shape. `date` is the ONE field a notification and its calendar cell
 * and the claim's own validation must agree on character for character, and
 * every fixture above uses the single valid value '2026-08-30' — so without
 * these cases the regex could quietly degrade to a bare `z.string()`.
 */
describe('a claimed day is a day', () => {
  const notDays = ['not-a-day', '2026-8-3', '2026-08-30T00:00:00.000Z', '20260830', '2026-08-30 ', '2026-08'];

  it.each(notDays)('the provenance schema refuses %s as a claimed date', (bad) => {
    expect(dateClaimProvenanceSchema.safeParse({ ...claimProvenance, date: bad }).success).toBe(false);
  });

  it.each(notDays)('a date-approaching payload refuses %s inside its claim', (bad) => {
    expect(dateApproachingNotificationPayloadSchema.safeParse({ ...approachingRow, claim: { ...claimProvenance, date: bad } }).success).toBe(
      false,
    );
  });

  it('and accepts a real YYYY-MM-DD day — the day tests do not pass by refusing everything', () => {
    expect(dateClaimProvenanceSchema.safeParse({ ...claimProvenance, date: '2026-12-01' }).success).toBe(true);
  });
});

describe('the approaching field is a literal, not a field name', () => {
  it('refuses any field other than dueDate', () => {
    expect(dateApproachingNotificationPayloadSchema.safeParse({ ...approachingRow, field: 'startDate' }).success).toBe(false);
    expect(dateApproachingNotificationPayloadSchema.safeParse({ ...approachingRow, field: 'dueDate' }).success).toBe(true);
  });
});

/** Every refusal from the boundary parser must be a ZodError — see the kind test. */
function refusalFrom(value: unknown): unknown {
  try {
    parseNotification(value);
  } catch (error) {
    return error;
  }
  return undefined;
}

describe('the notification row itself', () => {
  const baseRequired = ['id', 'userId', 'workspaceId', 'kind', 'dedupeKey', 'read', 'createdAt'];
  const baseNonEmpty = ['id', 'userId', 'workspaceId', 'dedupeKey', 'createdAt'];

  it.each(baseRequired)('refuses a row with no %s', (field) => {
    expect(refusalFrom(omit(notificationRow, field))).toBeInstanceOf(z.ZodError);
  });

  it.each(baseNonEmpty)('refuses an empty-string %s', (field) => {
    expect(refusalFrom({ ...notificationRow, [field]: '' })).toBeInstanceOf(z.ZodError);
  });

  it('refuses an invented top-level field — the row is strict too', () => {
    expect(refusalFrom({ ...notificationRow, urgency: 'high' })).toBeInstanceOf(z.ZodError);
  });

  it('refuses a non-boolean `read` — readness is a fact, not a label', () => {
    expect(refusalFrom({ ...notificationRow, read: 'false' })).toBeInstanceOf(z.ZodError);
    expect(refusalFrom({ ...notificationRow, read: 1 })).toBeInstanceOf(z.ZodError);
  });

  /**
   * Pins the KIND of refusal, not merely that something threw. With `kind`
   * widened past the enum, an invented kind still "refuses" — but as a
   * TypeError ("Cannot read properties of undefined (reading 'parse')") from
   * indexing the schema map with a kind that has no schema. That is a crash,
   * not a validation, and a boundary parser that crashes on bad input is a
   * different contract from one that rejects it.
   */
  it('refuses an invented kind as a ZodError naming `kind`, never a TypeError from a missing schema', () => {
    const error = refusalFrom({ ...notificationRow, kind: 'digest' });
    expect(error).toBeInstanceOf(z.ZodError);
    expect((error as z.ZodError).issues.map((issue) => issue.path.join('.'))).toContain('kind');
  });
});

/**
 * Exhaustiveness. `parseNotification`'s `as NotificationPayload` cast silences
 * the one place TypeScript would otherwise notice that a sixth kind had been
 * given a schema and a map entry while `NotificationPayload` stayed stale —
 * measured: with the cast, that state typechecks clean; without it, TS2322.
 * The cast cannot be removed from inside a test file (and the plan's Interfaces
 * block fixes the non-discriminated `{ kind, payload }` shape, so it must not be
 * redesigned here), but the drift it hides is pinnable: the two type aliases
 * below fail `pnpm --filter @gisik-nokma/domain typecheck` the moment the map
 * and the union disagree in either direction. This pin lives in `typecheck`,
 * not in `vitest run` — a green test suite is not evidence about it.
 */
type PayloadSchemaMap = typeof notificationPayloadSchemaByKind;
type PayloadFromSchemaMap = z.infer<PayloadSchemaMap[keyof PayloadSchemaMap]>;
type IsExactly<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Assert<T extends true> = T;
type NotificationPayloadUnionIsExhaustive = Assert<IsExactly<PayloadFromSchemaMap, NotificationPayload>>;

describe('the payload union and the schema map are one vocabulary', () => {
  it('the map has an entry for every kind and no entry for anything else', () => {
    expect(Object.keys(notificationPayloadSchemaByKind).sort()).toEqual([...NOTIFICATION_KINDS].sort());
  });

  it("every kind parses its own payload and refuses another kind's", () => {
    expect(notificationPayloadSchemaByKind.assignment.safeParse(assignmentPayload).success).toBe(true);
    expect(notificationPayloadSchemaByKind.mention.safeParse(assignmentPayload).success).toBe(false);
    expect(notificationPayloadSchemaByKind['contested-claim'].safeParse(contestedPayload).success).toBe(true);
    expect(notificationPayloadSchemaByKind['stale-ticket'].safeParse(stalePayload).success).toBe(true);
    expect(notificationPayloadSchemaByKind['stale-ticket'].safeParse(mentionPayload).success).toBe(false);
  });
});
