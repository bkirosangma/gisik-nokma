import { z } from 'zod';
import { ISO_DATETIME_REGEX, isRealCalendarDatetime, ulidString } from '../envelope.js';
import { RANK_KEY_REGEX, isRankKey } from '../rank.js';
import { dueDateValueSchema, prioritySchema } from '../ticket-types.js';

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
export const ticketCreatedPayload = z
  .object({
    typeId: z.string().min(1),
    projectId: ulidString,
    parentId: ulidString.nullable(),
    title: z
      .string()
      .min(1)
      .refine((value) => value.trim() !== '', 'must not be blank: a title of only spaces names nothing'),
    /**
     * Where the ticket is born (spec §1.3): `'backlog'` — the universal state —
     * or `'focus'` — the workflow's initial state. OPTIONAL, and ABSENT MEANS
     * FOCUS: that is what every v1 event meant, and an additive field must not
     * change the meaning of events written before it existed. The product's own
     * client always sends it.
     */
    start: z.enum(['backlog', 'focus']).optional(),
    /**
     * The birth priority (spec 2026-09-22). OPTIONAL, and ABSENT MEANS `DEFAULT_PRIORITY`
     * (P2): every event written before this member existed meant P2, and an additive
     * field must not change the meaning of stored events — the same rule `start` above
     * follows. The default is applied by `applyTicketEvent`, NOT here: a parse-time
     * default would write `P2` into every stored payload as a claim its author never
     * made (see `ticket-types.ts`'s `required` docblock for the same argument). The
     * product's own client always sends it.
     */
    priority: prioritySchema.optional(),
    /**
     * The ticket's birth DESCRIPTION (owner request 2026-09-23) — the same
     * DOCUMENT `ticket.field_set` writes under `fieldId: 'description'`, which is
     * why the shape is `z.record` rather than a string: `checkTicketFieldSet`
     * holds that built-in to *"a document"*, and a birth value that reached head
     * state in a shape the edit door would refuse is the "two doors that disagree"
     * defect this repository keeps re-finding.
     *
     * OPTIONAL, AND ABSENT MEANS NO DESCRIPTION — the same additive-field rule
     * `start` and `priority` follow. No pre-existing `ticket.created` carried one,
     * and the reducer writes NO claim at all for an absent member rather than a
     * null one: a null claim is the explicit CLEARING claim `ticket.field_set`
     * sanctions, which at birth would record a clearing nobody made (invariant 4).
     *
     * `null` is deliberately NOT accepted. `ticket.field_set` admits it because a
     * field that has a value needs a way to lose it; at birth there is nothing to
     * clear, so "absent" is the one spelling of none and a second one would invite
     * a reader to think the two meant different things.
     *
     * Shape-only, like `ticketFieldSetPayload`'s `value`: whether this document is
     * well-formed for ProseMirror is `packages/editor`'s question, and the domain
     * has no vocabulary for it (amendment 12). What the door can honestly say is
     * that it is `{}`-like and not a string.
     */
    description: z.record(z.string(), z.unknown()).optional(),
    /**
     * The ticket's birth ASSIGNEE (owner request 2026-09-23) — the same member
     * `ticket.assigned` carries, with the same `nullable()` for "nobody".
     *
     * OPTIONAL, AND ABSENT MEANS NOBODY, which is what every pre-existing
     * `ticket.created` meant: the reducer hard-coded `assigneeId: null` here
     * before this member existed. The two spellings are equivalent on purpose —
     * the product's own client OMITS the member rather than sending `null`.
     *
     * ⚠ **A birth assignee must not become a way around the assign permission**,
     * and that is not a comment about this schema: `checkVisibilityPermission`
     * refuses a `ticket.assigned` naming a person with no role in the workspace
     * (E6-17), and the SAME lookup runs for this member in the `ticket.created`
     * branch — which is a different branch of that module, because
     * `ticket.created` returns before the `canSee` check (there is no ticket to
     * see yet). Adding this member here without that check would have made the
     * dialog's Assignee picker the one door in the product through which a typo
     * could name nobody.
     */
    assigneeId: z.string().min(1).nullable().optional(),
    /**
     * The ticket's STARTING STATUS (starting-status design, 2026-09-23) — a
     * state id in the workflow the ticket's TYPE is bound to, checked against
     * that workflow once it resolves (`ticket-state.ts`'s `bornIn`, the rule
     * engine's `ticket.created` check).
     *
     * OPTIONAL, AND ABSENT MEANS THE WORKFLOW'S INITIAL STATE — the same
     * additive-field rule `start`, `priority`, `description` and `assigneeId`
     * above all follow: no `ticket.created` written before this member existed
     * meant anything else, so its absence must keep meaning exactly that. The
     * product's own client omits it whenever the picked status IS the initial
     * one (keeps the payload minimal), and omits it always when `start` is
     * `'backlog'` — see the refusal below.
     *
     * Shape-only here: WHICH states this ticket's workflow allows a new ticket
     * to start in — not the universal Backlog, not `category: 'terminal'`, not
     * `creatable: false` — is `isCreatableState`'s question
     * (`workflow-helpers.ts`), asked once the workflow resolves, never at this
     * door.
     */
    stateId: z.string().min(1).optional(),
    /**
     * The ticket's birth START DATE and DUE DATE (starting-status design
     * addendum, 2026-09-23: "put due date as well on the ticket creation
     * form" … "both start and due date"). Both built-ins share ONE value
     * shape — `dueDateValueSchema` (`ticket-types.ts`), the same schema
     * `ticket.field_set` holds `startDate`/`dueDate` to — so this door and the
     * edit door agree on what a day claim looks like from one origin, never a
     * second copy that could drift.
     *
     * OPTIONAL, AND ABSENT MEANS NO CLAIM — following the birth-field
     * precedent `description` set above: no pre-existing `ticket.created`
     * carried either, and the reducer writes NO KEY for an absent member
     * rather than a null one, for the identical reason `description` gives
     * (a null claim would be a clearing nobody made, invariant 4).
     */
    startDate: dueDateValueSchema.optional(),
    dueDate: dueDateValueSchema.optional(),
  })
  .refine((p) => !(p.start === 'backlog' && p.stateId !== undefined), {
    // The owner's ruling (starting-status design): a backlog ticket has no
    // starting status. The client's own form disables the status picker
    // while "Starts in the backlog?" is on and never sends both; this refusal
    // is the domain's own door for a payload built some other way.
    message: 'a backlog ticket has no starting status, so a ticket.created cannot carry both start: "backlog" and stateId',
    path: ['stateId'],
  });

export const ticketAssignedPayload = z.object({ assigneeId: z.string().min(1).nullable() });

export const ticketCollaboratorPayload = z.object({ userId: z.string().min(1) });

/**
 * Shape-only at the door: {fieldId, value}. Semantics (does the field exist,
 * does the value fit its kind) are the engine's job — see checkTicketFieldSet.
 * value: null is the clearing claim; built-ins title/description/dueDate/startDate/priority ride
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
 * dropped (`ticket-state.ts:343` is `claim(p.value, env)`): with the key
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
    .refine((value) => value !== undefined, 'is required: a field claim with no value would record a clearing nobody made'),
});

export const ticketReparentedPayload = z.object({ newParentId: ulidString.nullable() });

/** Body is opaque structured-doc JSON — the editor plan owns its schema. */
export const commentAddedPayload = z.object({ body: z.record(z.string(), z.unknown()) });

/**
 * `comment.edited` — the AUTHOR replaces a comment's body (MCP-everything spec §6, M-E9). Filed against
 * the comment's PARENT (ticket or note), never a comment entity: a comment is a claim on its parent's
 * history, as `comment.added` is. `commentId` is that `comment.added` event's id — a comment's only identity.
 */
export const commentEditedPayload = z.object({ commentId: ulidString, body: z.record(z.string(), z.unknown()) }).strict();
/** `comment.deleted` — author, or workspace owner/admin. The body leaves every view; the ledger keeps it (spec §6). */
export const commentDeletedPayload = z.object({ commentId: ulidString }).strict();
export const COMMENT_EVENT_TYPES = ['comment.added', 'comment.edited', 'comment.deleted'] as const;
export function isCommentEvent(type: string): boolean {
  return (COMMENT_EVENT_TYPES as readonly string[]).includes(type);
}

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
      .refine(isRankKey, "must not end in '0': nothing sorts below it, so the key would be unorderable"),
  })
  .strict();

