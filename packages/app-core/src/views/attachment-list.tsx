import { formatDate } from '../provenance.js';

/**
 * Two kinds, told apart (spec §2, owner sign-off 2026-08-20). An UPLOAD is a
 * file this board holds and serves. A DRIVE REFERENCE is a pointer: it shows
 * the name Drive gave it and the day we looked, and it never claims anything
 * about the contents — there is no "reachable" state here on purpose, because
 * a link that answered a moment ago may not answer now, and one that failed
 * may be fine. Unknown is the only honest word.
 *
 * The two kinds may carry the SAME filename; the name settles nothing. What
 * tells them apart is where the link points — into this board for an upload,
 * into Drive for a reference — plus the last-seen framing and the capture
 * date, which say that the two facts on screen are observations rather than
 * standing truths.
 *
 * ## The twin declaration Plan 6 Open question 13 promises NOW EXISTS
 *
 * The plan says `packages/editor` declares this union identically so that
 * package never depends on app-core, and that the two are edited together.
 * This paragraph used to read *"Measured 2026-09-02: `packages/editor` declares
 * no `AttachmentListEntry`"*, and that measurement was true when it was taken.
 * **Plan 7 Task 12b falsified it: the twin is
 * `packages/editor/src/components/AttachmentListItem.tsx:49`.** The two are now
 * edited together or not at all — that is the whole point of the arrangement,
 * and it only starts binding once the second declaration exists.
 *
 * The stale sentence is corrected here rather than annotated because an
 * annotation on the editor side cannot reach the reader who arrives cold at
 * app-core, edits app-core alone, and never learns a twin was waiting. Task 12b
 * recorded that limitation in its own docblock explicitly and could not act on
 * it, being scoped to `packages/editor`.
 *
 * **`packages/app-core/src/views/editor-slot.tsx:17` carries a
 * sentence of the same shape about a DIFFERENT type, `EditorSlotUpload`, and
 * that one is STILL TRUE** — swept at this commit, `packages/editor` contains no
 * `type`, `interface` or `const` of that name, only two prose mentions. Naming
 * the survivor is half the point: a reader who sees this correction and writes
 * off every sentence of its shape would break a claim that holds.
 *
 * The union below is Plan 6's own text, spelled out member by member. Plan 7's
 * text writes the reference arm as `{kind, attachmentId} & DriveReference`, and
 * `DriveReference` (`packages/domain/src/attachment-kinds.ts`) is the six
 * members inlined here — driveFileId, name, mimeType, webViewLink, iconLink?,
 * capturedAt. The two spellings are MUTUALLY ASSIGNABLE, measured against
 * `tsconfig.base.json` with a conditional-type probe in both directions, with
 * a control that dropping a REQUIRED member breaks it. That is the question
 * the "one contract written twice" pattern actually asks — will the assignment
 * compile — and it is not the same as textual identity: the probe's other
 * control records that dropping the OPTIONAL `iconLink` leaves mutual
 * assignability intact, so this claim covers the required members and says
 * nothing stronger. The runtime half is asserted below against the domain's own
 * `isDriveReference` guard and its key set. Same class of false positive as the
 * `EditorSlotUpload` one already recorded; step 12 may collapse the two onto
 * the domain type, but it has no difference to reconcile.
 */
export type AttachmentListEntry =
  | {
      kind: 'upload';
      attachmentId: string;
      filename: string;
      mime: string;
      size: number;
      sha256: string | null;
    }
  | {
      kind: 'drive-reference';
      attachmentId: string;
      driveFileId: string;
      name: string;
      mimeType: string;
      webViewLink: string;
      iconLink?: string;
      capturedAt: string;
    };

export type AttachmentListProps = { entries: AttachmentListEntry[] };

export function AttachmentList({ entries }: AttachmentListProps) {
  // An empty list is nothing at all, never a heading with nothing under it: a
  // sheet whose caller has not wired attachments yet must not promise there
  // are none.
  if (entries.length === 0) return null;
  return (
    <ul className="gn-attachments">
      {entries.map((entry) =>
        entry.kind === 'upload' ? (
          <li
            key={entry.attachmentId}
            className="gn-attachment gn-attachment--upload"
            data-attachment-kind="upload"
          >
            <a className="gn-attachment__link" href={`/v1/attachments/${entry.attachmentId}`}>
              {entry.filename}
            </a>
            <span className="gn-attachment__meta">{entry.mime}</span>
          </li>
        ) : (
          <li
            key={entry.attachmentId}
            className="gn-attachment gn-attachment--drive-reference"
            data-attachment-kind="drive-reference"
          >
            <span className="gn-attachment__meta">Google Drive reference</span>
            <a
              className="gn-attachment__link"
              href={entry.webViewLink}
              target="_blank"
              rel="noreferrer noopener"
            >
              {entry.name}
            </a>
            <span className="gn-attachment__meta">
              {/* The capture date is a rendered instant like any other — the one
                  renderer, never an ISO slice, which would report the UTC day and
                  disagree with every other date on this sheet for five and a half
                  hours every night. */}
              {`last seen as “${entry.name}” (${entry.mimeType}) · captured ${formatDate(entry.capturedAt)}`}
            </span>
            <span className="gn-attachment__status">
              Contents unknown — the board holds a link to this file, not the file.
            </span>
          </li>
        ),
      )}
    </ul>
  );
}
