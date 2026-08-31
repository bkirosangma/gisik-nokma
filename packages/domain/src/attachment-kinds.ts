/**
 * An attachment is one of exactly two kinds, and the kind is always
 * declared on the claim, never inferred from what is or is not in a
 * table (spec §2):
 *
 *  - 'upload'          — bytes this product holds: sniffed, hashed, stored.
 *  - 'drive-reference' — a pointer to a Google Drive file it does not hold.
 *
 * The distinction is load-bearing, not cosmetic: a file we do not hold can
 * be renamed, edited, moved, re-permissioned or deleted after it is
 * attached, so the product may not speak about its contents at all.
 */
export type AttachmentKind = 'upload' | 'drive-reference';

/**
 * The non-sensitive, per-file Google Drive scope. The picker grants this
 * product access to the individual files a user picks — nothing else in
 * their Drive — and it is the ONLY Drive scope this product ever asks for.
 */
export const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

/**
 * What is stored when a Drive file is attached. Every field is a
 * last-seen observation, not a standing fact: `name` and `mimeType` are
 * what Drive said at `capturedAt`, and may already be stale by the time
 * anyone reads them. That is why the renderer dates them.
 *
 * TWO STATEMENTS OF ONE CONCEPT, and which is which matters. This type and
 * `isDriveReference` are the STRUCTURAL half: dependency-free, so the ingest
 * gate and the editor bundle can ask "is this shaped like a reference?"
 * without taking zod. The WIRE half is `attachmentDriveReferencePayload` in
 * `events/ticket-events.ts`, and it is the only thing that validates a claim
 * at the door: it additionally requires `kind` and a ULID `attachmentId`,
 * real URLs for `webViewLink`/`iconLink`, a `mimeType` matching the shared
 * MIME regex, and an ISO-8601 `capturedAt` that is a real calendar datetime. Passing the guard here is therefore NOT
 * evidence a payload would be accepted. The two are pinned against each
 * other in `test/attachment-kinds.test.ts` so a rename on either side breaks
 * loudly instead of drifting.
 */
export type DriveReference = {
  driveFileId: string;
  name: string;
  mimeType: string;
  webViewLink: string;
  iconLink?: string;
  /** ISO-8601 instant at which these observations were captured. */
  capturedAt: string;
};

/** Rule id for spec §2's first Drive rule: evidence must be an upload. */
export const RULE_EVIDENCE_DRIVE_REFERENCE = 'attachment.evidence-drive-reference';

/**
 * The one place this sentence exists. The gate refuses with it, the
 * evidence picker shows it, the tests assert against the constant — so
 * every copy a user might see is the same words, and there is exactly one
 * file to edit if the wording ever improves.
 */
export const EVIDENCE_DRIVE_REFERENCE_REASON =
  'A Google Drive link cannot serve as evidence: the board holds a pointer, not the file, and a Drive file can be renamed, edited, moved or deleted after it is attached. Upload the file to this ticket and name the uploaded copy as the evidence instead.';

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

/**
 * A shape guard, not a wire validator — see the note on `DriveReference`.
 * `iconLink` is the only optional field: absent is fine, present-and-wrong
 * is not, because a caller that set it meant something by it.
 */
export function isDriveReference(value: unknown): value is DriveReference {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  if (candidate['iconLink'] !== undefined && !isNonEmptyString(candidate['iconLink'])) return false;
  return (
    isNonEmptyString(candidate['driveFileId']) &&
    isNonEmptyString(candidate['name']) &&
    isNonEmptyString(candidate['mimeType']) &&
    isNonEmptyString(candidate['webViewLink']) &&
    isNonEmptyString(candidate['capturedAt'])
  );
}
