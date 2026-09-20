import { z } from 'zod';
import { ISO_DATETIME_REGEX, isRealCalendarDatetime, ulidString } from '../envelope.js';
import { RANK_KEY_REGEX, isRankKey } from '../rank.js';

/**
 * The payload shapes of the ticket vocabulary (spec §3). Schemas only — the
 * `domainRegistry.register` calls that bind them to a type, a version and an
 * entity kind live in `../vocabulary.ts`, following the precedent
 * `workflow.defined` set: registration in the registry module, schema beside
 * the concept it describes. Keeping them there means the registry is complete
 * for every importer of `parseEvent`, not only for importers of the barrel.
 *
 * `ticket.transitioned` has no schema here. Plan 2 already shipped
 * `ticketTransitionedPayloadSchema` in `../workflow.ts` because the engine
 * parses it; this vocabulary registers THAT one.
 */
/**
 * Ruling P15. `.min(1)` alone admits `'   '`, and a title of only spaces titles
 * nothing while looking like a title everywhere it is displayed — a board, a
 * breadcrumb, a notification, the parent-terminal refusal that quotes it.
 *
 * The create door was admitting PRECISELY the state the edit door forbids:
 * `checkTicketFieldSet` refuses a whitespace-only `title` change with
 * `field.type-mismatch` ("Title" needs text., `checks/fields.ts`), so "the
 * title that cannot vanish" was an edit-time rule rather than an invariant, and
 * a blank one could only ever be created, never repaired into existence.
 *
 * It REFUSES rather than trims, matching the treatment `workspace.created`,
 * `workspace.renamed` and `project.created` already ship for their names
 * (`events/membership.ts`'s `displayName`): the ledger stores the claim as it
 * was made, so quietly rewriting `'  Reconcile the till  '` to
 * `'Reconcile the till'` would put words in the actor's mouth. Padding around a
 * real title stays legal and is stored verbatim; only an entirely-whitespace
 * title is refused. The message is the sibling's, with the noun it is actually
 * about — one answer across the series, not two.
 *
 * Not folded into the shared `displayName`: that schema says "name", which is
 * the wrong noun here, and it belongs to the workspace/membership vocabulary.
 * The construction is what is shared, deliberately, so the two doors read alike.
 */
export const ticketCreatedPayload = z.object({
  typeId: z.string().min(1),
  projectId: ulidString,
  parentId: ulidString.nullable(),
  title: z
    .string()
    .min(1)
    .refine((value) => value.trim() !== '', 'must not be blank — a title of only spaces names nothing'),
  /**
   * Where the ticket is born (spec §1.3): `'backlog'` — the universal state —
   * or `'focus'` — the workflow's initial state. OPTIONAL, and ABSENT MEANS
   * FOCUS: that is what every v1 event meant, and an additive field must not
   * change the meaning of events written before it existed. The product's own
   * client always sends it.
   */
  start: z.enum(['backlog', 'focus']).optional(),
});

export const ticketAssignedPayload = z.object({ assigneeId: z.string().min(1).nullable() });

export const ticketCollaboratorPayload = z.object({ userId: z.string().min(1) });

/**
 * Shape-only at the door: {fieldId, value}. Semantics (does the field exist,
 * does the value fit its kind) are the engine's job — see checkTicketFieldSet.
 * value: null is the clearing claim; built-ins title/description/dueDate/startDate ride
 * this same event, and a due date value is always { date, note? } — a claim.
 *
 * `value` is REQUIRED, and `z.unknown()` alone does not make it so: probed
 * against this repo's zod, `{ fieldId: 'title' }` with no `value` key at all
 * parses clean, and so does one carrying an explicit `undefined`. That is not
 * a harmless permissiveness here. The reducer USED TO read `p.value ?? null`
 * (`../ticket-state.ts`), so an omitted `value` WAS folded into a null CLEARING
 * CLAIM — a field wiped under the actor's name and both their clocks, into an
 * append-only table, on the strength of a claim nobody made. Invariant 4
 * ("nothing is invented"), violated by the door.
 *
 * The refine below closed the door, and the coalesce behind it has since been
 * dropped (`ticket-state.ts:211` is `claim(p.value, env)`): with the key
 * required, `parse` throws before that line on an absent value and
 * `null ?? null` is identity, so keeping it would have stated the defect as the
 * design.
 *
 * Only ABSENCE is the defect, and the two acceptances are pinned by their own
 * tests rather than left to fall out of the fix: `null` is the explicit
 * clearing claim design decision 3 sanctions, and any other value — `{}`
 * included — is a claim like any other. The check is `!== undefined` rather
 * than `'value' in payload` because absent and present-but-`undefined` must
 * both be refused and `JSON.stringify` erases the difference on the wire
 * anyway; writing it the other way would invite a reader to think the
 * distinction meant something.
 *
 * Same defect, same shape, same answer as `envelope.ts`'s `requiredPayload`
 * (an event with no payload at all). The two doors are deliberately proven
 * alike — four assertions each, and both mutated back to bare `z.unknown()` to
 * watch the ABSENT case fail specifically.
 */
export const ticketFieldSetPayload = z.object({
  fieldId: z.string().min(1),
  value: z
    .unknown()
    .refine((value) => value !== undefined, 'is required — a field claim with no value would record a clearing nobody made'),
});

export const ticketReparentedPayload = z.object({ newParentId: ulidString.nullable() });

/** Body is opaque structured-doc JSON — the editor plan owns its schema. */
export const commentAddedPayload = z.object({ body: z.record(z.string(), z.unknown()) });

const mimeType = z.string().regex(/^[\w.+-]+\/[\w.+-]+$/, 'must be a MIME type');

/**
 * An attachment is one of exactly two kinds, and the claim says which
 * (spec §2). An UPLOAD is bytes this product holds: the mime and size are
 * the server's sniffed truth and `sha256` is its hash of the stored bytes,
 * so evidence can be verified rather than merely present. A DRIVE
 * REFERENCE is a pointer to a Google Drive file this product does NOT
 * hold — name and mimeType are last-seen observations dated by
 * `capturedAt`, never standing facts. There is no legacy payload to
 * tolerate: nothing has shipped, so `kind` is required, not inferred.
 */
export const attachmentUploadedPayload = z.object({
  kind: z.literal('upload'),
  attachmentId: ulidString,
  filename: z.string().min(1),
  mime: mimeType,
  size: z.number().int().min(0),
  sha256: z.string().regex(/^[0-9a-f]{64}$/, 'must be a lowercase-hex SHA-256'),
});

export const attachmentDriveReferencePayload = z.object({
  kind: z.literal('drive-reference'),
  attachmentId: ulidString,
  driveFileId: z.string().min(1),
  name: z.string().min(1),
  mimeType,
  webViewLink: z.string().url(),
  iconLink: z.string().url().optional(),
  // The same instant shape the envelope's two clocks use, from the same two
  // exports — `capturedAt` dates an observation exactly as `clientTime` dates a
  // claim, and a product with two ideas of what an instant is has two ideas of
  // when anything happened.
  capturedAt: z
    .string()
    .regex(ISO_DATETIME_REGEX, 'must be ISO 8601 with at most millisecond precision')
    .refine(isRealCalendarDatetime, 'must be a real calendar datetime'),
});

export const attachmentAddedPayload = z.discriminatedUnion('kind', [
  attachmentUploadedPayload,
  attachmentDriveReferencePayload,
]);

/**
 * An admin moves one ticket onto a different workflow. A ticket pins the
 * workflow it was created under (owner decision 2026-08-26), so re-pointing a
 * TYPE's binding changes only what new tickets get; this event is the
 * deliberate, attributed act that moves an existing one.
 *
 * `toStateId` is named explicitly rather than inferred. The outgoing and
 * incoming workflows are unrelated graphs with unrelated state ids, and
 * `stateMapping` cannot help — it is keyed inside a single workflow's version
 * chain. Guessing where a ticket lands would be inventing its status, which
 * invariant 4 forbids; so the claim says where it goes, and the refusal (Plan 3
 * Task 8) checks that the destination exists.
 */
export const ticketWorkflowReboundPayload = z.object({
  toWorkflowId: z.string().min(1),
  toStateId: z.string().min(1),
});

/** `ticket.closed` (spec §1.2) — the envelope carries actor and time; the payload says nothing. */
export const ticketClosedPayload = z.object({}).strict();
/** `ticket.reopened` (spec §1.2) — the explicit reopen; same empty payload. */
export const ticketReopenedPayload = z.object({}).strict();

/**
 * `ticket.deleted` — the SOFT delete. The ticket stops appearing in views; its
 * ledger, and its row, stay. Producer of `TicketState.deleted`.
 *
 * The product's own FAQ already stated these semantics before this event
 * existed (`design-system/interactive/desktop.dc.html`, the `faq-delete` entry):
 *
 * > "The ticket stops appearing in views. Its history is retained, because other
 * > events cite it — a comment, a block, a workflow version."
 * > "This is why the product says \"deleted\" rather than \"erased\"."
 *
 * The envelope carries the actor and the instant — the payload says nothing,
 * exactly as `ticket.closed` does, and for the same reason: there is nothing
 * here for a client to assert. `restored` is the name of the undo because the
 * product already pairs `project.archived` with `project.restored`
 * (`events/membership.ts`); a second word for the same act would be a second
 * concept.
 *
 * Strict, and empty — the same construction as the closed pair, so a payload
 * carrying anything at all is refused at the door rather than silently ignored.
 */
export const ticketDeletedPayload = z.object({}).strict();
/** `ticket.restored` — the UNDO of `ticket.deleted`. Same empty, strict payload. */
export const ticketRestoredPayload = z.object({}).strict();

/**
 * `ticket.ranked` (spec §8.1) — one reorder is one event carrying the new key,
 * which is what makes a drag cost one claim instead of renumbering the column.
 * The key space is `isRankKey`'s, not `RANK_KEY_REGEX`'s, and the difference is
 * load-bearing: the regex admits `'a0'`, and a key ending in `0` has NO key
 * below it, so `rankBetween` can neither return nor refuse — it appends `'0'`
 * forever (measured: `NONTERMINATING at i=20001`). The regex stays as the first
 * check because its message names the alphabet, which is the more useful error
 * for the common mistake; the refine closes the unorderable tail.
 *
 * Backlog-only is the ENGINE's door, not this schema's — `checkTicketRanked`
 * (Task 2) refuses a rank on a ticket that is not in the backlog, the same
 * split `ticket.closed` has with `close-requires-terminal`.
 */
export const ticketRankedPayload = z
  .object({
    rank: z
      .string()
      .regex(RANK_KEY_REGEX, 'must be a rank key over 0-9a-z')
      .refine(isRankKey, "must not end in '0' — nothing sorts below it, so the key would be unorderable"),
  })
  .strict();

