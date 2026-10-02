import { z } from 'zod';
import { MEMBERSHIP_ID_REGEX, ULID_REGEX } from './ids.js';

/**
 * The closed set of things an event can be about. `invite` joins the original
 * six for Plan 4's invitation vocabulary (`invite.sent` / `invite.accepted` /
 * `invite.revoked`, registered in a later task of that plan). Adding a member
 * is additive and INERT until an event type declares it: every registration
 * names its `entityKind`, and `parseEvent` refuses a type filed against a kind
 * it did not declare, so no event can carry `invite` before the types exist.
 * It lands here, early, because `envelope.ts` is the file every lane imports
 * and a second amendment to it late in the wave would make three sibling lanes
 * rebase onto the same schema twice.
 */
export const ENTITY_KINDS = [
  'workspace',
  'project',
  'ticket',
  'workflow',
  'ticket-type',
  'membership',
  'invite',
  // The notes series (Plan 1 of 6, spec §3.1). A note is a rich-text document
  // with its own stream: nine `note.*` types are registered against it in
  // `vocabulary.ts`, and `comment.added` — until now a ticket-only type — is
  // declared for BOTH kinds. It joins the list here rather than in Plan 2
  // because `envelope.ts` is the file every lane imports and a second amendment
  // late in the series would make three sibling lanes rebase onto the same
  // schema twice. `'notebook'` is deliberately NOT a member: the case that
  // proves the closed set is closed (18.001) asserts it is absent.
  'note',
  // Project groups (prefixes and groups plan Task 6): four `group.*` types are
  // registered against it in `vocabulary.ts`. A group is a workspace-level folder
  // projects are filed under, with its own stream like any other entity.
  'group',
] as const;
export type EntityKind = (typeof ENTITY_KINDS)[number];

/**
 * `'mcp'` is a member here, not a flavour of `'web'` (owner ruling 1, MCP plan
 * Task 0). An assistant's write must be distinguishable IN THE LEDGER from a
 * claim the person typed themselves: in a product whose stated purpose is a
 * board that cannot lie about its own history, a write claiming `'web'` when a
 * machine made it is the history lying about who acted.
 *
 * No migration. The column is `origin text NOT NULL` with no `CHECK` and no
 * Postgres enum (`migrations/1787841717635_events-and-snapshots.sql:12`),
 * verified across every migration — the plan's original estimate that this was
 * "more than this plan's scope" was measured and found wrong.
 *
 * `Origin` below and `z.enum(ORIGINS)` in `eventEnvelopeSchema` both derive
 * from this array, so adding a member here is the whole edit.
 */
export const ORIGINS = ['web', 'mobile', 'desktop', 'server', 'mcp'] as const;
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

/**
 * Date.parse alone accepts day-of-month overflow (e.g. 2026-02-30) and silently
 * rolls it into a different, later instant instead of rejecting it — violating
 * "an instant survives storage exactly." Month and hour overflow already come
 * back NaN from Date.parse, so only day-of-month needs an explicit check here.
 *
 * Exported: ist-day.ts reuses this same predicate so "is this instant real"
 * has one answer across the package, not a second, looser one at the day
 * boundary.
 */
export function isRealCalendarDatetime(value: string): boolean {
  if (Number.isNaN(Date.parse(value))) return false;
  const parts = value.slice(0, 10).split('-').map(Number);
  const year = parts[0];
  const month = parts[1];
  const day = parts[2];
  if (year === undefined || month === undefined || day === undefined) return false;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day >= 1 && day <= daysInMonth;
}

const isoDatetime = z
  .string()
  .regex(ISO_DATETIME_REGEX, 'must be ISO 8601 with at most millisecond precision')
  .refine(isRealCalendarDatetime, 'must be a real calendar datetime');

/**
 * The one ULID string schema. Exported rather than kept local because every
 * event payload carrying an id (`parentId`, `attachmentId`, …) needs exactly
 * this check: a second `z.string().regex(...)` spelled out beside a payload
 * schema is a second statement of what a ULID is, and the two are free to
 * drift. `ULID_REGEX` in ids.ts stays the single origin of the pattern.
 */
export const ulidString = z.string().regex(ULID_REGEX, 'must be a ULID');

/**
 * Entity ids are bare ULIDs for every kind but one. `membership` admits the
 * composite `${workspaceId}:${userId}` — coordination decision 5, ratified by
 * the owner 2026-08-28 — because the engine must address a membership from
 * `(workspaceId, actorId)` via `getEntityState('membership', id)`, and grant →
 * revoke → re-grant must land on one entity stream. `seq`, `lockEntity`,
 * snapshots and canonical replay all key on `(entity_kind, entity_id)`, so a
 * fresh ULID per grant would split one person's membership into several
 * histories. Four alternatives (composite as a lookup key only, filing under
 * `kind:'workspace'`, a hashed pseudo-ULID, relaxing `ulidString` generally)
 * were refuted on exactly that.
 *
 * The exception is kind-scoped on purpose: EVERY other kind keeps `ulidString`
 * byte-for-byte, message included, and the `EventEnvelope` TYPE is untouched
 * (`entity: { kind; id: string }`). Only the door's runtime shape check knows
 * the difference. This is the first time the door behaves differently per kind,
 * so the test beside it asserts all three directions — composite admitted for
 * `membership`, bare ULID refused for `membership`, composite still refused for
 * a non-membership kind — because the third is the only thing that keeps
 * "every other kind is unchanged" a proof rather than a claim.
 */
const entitySchema = z.object({ kind: z.enum(ENTITY_KINDS), id: z.string() }).superRefine((entity, ctx) => {
  const ok = entity.kind === 'membership' ? MEMBERSHIP_ID_REGEX.test(entity.id) : ULID_REGEX.test(entity.id);
  if (ok) return;
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    path: ['id'],
    message:
      entity.kind === 'membership'
        ? 'must be a membership entity id — workspaceId:userId, two ULIDs joined by a colon'
        : 'must be a ULID',
  });
});

/**
 * `z.unknown()` alone does NOT require the key: probed against this repo's zod,
 * an object with no `payload` at all parses clean, and so does one with an
 * explicit `undefined`. `JSON.stringify` erases the two alike, so the wire form
 * cannot tell them apart either — an event could reach an append-only table
 * with its claim missing entirely and nothing would have objected.
 *
 * Only ABSENCE is the defect. `null` and `{}` stay accepted, deliberately and
 * with tests pinning them: an empty claim is still a claim, and a null payload
 * is still a claim. The check is `!== undefined` rather than `'payload' in v`
 * because both absent and present-but-undefined must be refused and
 * serialisation loses the distinction anyway — writing it the other way would
 * invite a reader to think the distinction meant something.
 */
const requiredPayload = z
  .unknown()
  .refine((value) => value !== undefined, 'is required — an event with no payload is not a claim');

/**
 * The regex above proves a membership entity id's SHAPE; it cannot see the
 * workspace the event is filed under. Without this, `entity.id = wsB:userC` on
 * an event whose `workspaceId` is `wsA` parses clean. The server's mismatch
 * guard only fires once a head row exists, so the first mis-filed event commits
 * and a later, correctly-addressed revoke starts a SECOND stream at seq 1 —
 * the split membership stream decision 5 exists to prevent, reintroduced by its
 * own fix. This is the workspace half of that coherence check; the user half
 * needs the parsed payload and lives in parse-event.ts.
 */
function refuseMisfiledMembership(
  value: { workspaceId: string; entity: { kind: EntityKind; id: string } },
  ctx: z.RefinementCtx,
): void {
  if (value.entity.kind !== 'membership') return;
  if (value.entity.id.startsWith(`${value.workspaceId}:`)) return;
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    path: ['entity', 'id'],
    message: "must name this event's own workspace: a membership entity id is workspaceId:userId",
  });
}

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

/**
 * The plain object both exported schemas are built from. It exists because a
 * cross-field check (`refuseMisfiledMembership`, which needs `workspaceId` and
 * `entity` together) makes the exported schema a ZodEffects, and ZodEffects has
 * no `.extend`. Extending the OBJECT and refining each result keeps
 * `eventEnvelopeSchema` derived from the same shape it always was, and keeps it
 * inheriting the entity and payload checks the way it used to inherit them.
 */
const submittedEventObject = z.object({
  id: ulidString,
  workspaceId: ulidString,
  entity: entitySchema,
  type: z.string().min(1),
  version: z.number().int().positive(),
  payload: requiredPayload,
  actorId: ulidString,
  origin: z.enum(ORIGINS),
  clientTime: isoDatetime,
});

/**
 * BOTH schemas below carry only HALF of the membership coherence check, and
 * this is the note for whoever reaches for one of them.
 *
 * What they enforce: a membership `entity.id` is `^<ULID>:<ULID>$` and its
 * left half is this event's own `workspaceId`.
 *
 * What they do NOT enforce: that its right half is the user the payload is
 * actually about. That comparison needs the payload PARSED — which needs the
 * event's type, its version and its registered schema — and none of that is
 * knowable here, where `payload` is `unknown` by design. So it lives in
 * `parseEvent`, which has all three.
 *
 * The gap is real and passes silently. An envelope in workspace A, filed at
 * `A:userC`, whose payload grants `userD`, is `success: true` here and
 * `malformed-envelope` through `parseEvent`. Nothing in production validates a
 * bare envelope today, so nothing is wrong now — but the first consumer that
 * does (a sync-down reader is the obvious shape) would inherit half a check and
 * have no way to tell. **If you are validating an event, call `parseEvent`.**
 * These schemas are the shape layer underneath it, not a substitute for it.
 */
export const submittedEventSchema = submittedEventObject.superRefine(refuseMisfiledMembership);

/**
 * HALF a check, exactly as `submittedEventSchema` above — and the note is
 * repeated rather than referenced because a doc comment binds to the ONE
 * declaration beneath it. In the emitted `.d.ts` the whole inlined shape of the
 * first export sits between them, so they are nowhere near each other, and
 * hover or jump-to-definition on this one would otherwise show nothing.
 *
 * Enforced here: a membership `entity.id` is `^<ULID>:<ULID>$` and its left half
 * is this event's own `workspaceId`. NOT enforced here: that it names the user
 * the payload is about — that needs the payload parsed, which needs the type,
 * the version and the registered schema, none of them knowable where `payload`
 * is `unknown` by design. An envelope in workspace A, filed at `A:userC`, whose
 * payload grants `userD`, is `success: true` here and `malformed-envelope`
 * through `parseEvent`.
 *
 * **If you are validating an event, call `parseEvent`.** This is the shape layer
 * underneath it, not a substitute for it — and this is the export a sync-down
 * reader reaches for first.
 */
export const eventEnvelopeSchema = submittedEventObject
  .extend({
    serverTime: isoDatetime,
    seq: z.number().int().positive(),
  })
  .superRefine(refuseMisfiledMembership);
