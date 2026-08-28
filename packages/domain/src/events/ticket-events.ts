import { z } from 'zod';
import { ISO_DATETIME_REGEX, isRealCalendarDatetime, ulidString } from '../envelope.js';

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
export const ticketCreatedPayload = z.object({
  typeId: z.string().min(1),
  projectId: ulidString,
  parentId: ulidString.nullable(),
  title: z.string().min(1),
});

export const ticketAssignedPayload = z.object({ assigneeId: z.string().min(1).nullable() });

export const ticketCollaboratorPayload = z.object({ userId: z.string().min(1) });

/**
 * Shape-only at the door: {fieldId, value}. Semantics (does the field exist,
 * does the value fit its kind) are the engine's job — see checkTicketFieldSet.
 * value: null is the clearing claim; built-ins title/description/dueDate/startDate ride
 * this same event, and a due date value is always { date, note? } — a claim.
 */
export const ticketFieldSetPayload = z.object({ fieldId: z.string().min(1), value: z.unknown() });

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

