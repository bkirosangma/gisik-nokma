import { useState } from 'react';
import { EVIDENCE_DRIVE_REFERENCE_REASON, type DriveReference } from '@gisik-nokma/domain';
import type { UploadResult } from '../upload.js';

/**
 * An existing UPLOAD, as the evidence picker offers it. `AttachmentSummary`
 * means *uploaded attachment* and carries no `kind` discriminator — but that
 * is a contract this type STATES, not one its shape ENFORCES. Its four
 * fields (no `driveFileId`, no `webViewLink`) block a direct assignment FROM
 * a `DriveReferenceSummary`, so the compiler catches the accident of handing
 * one straight through; they do not block a caller from mapping a Drive
 * reference's own fields onto this shape by hand (`{ attachmentId:
 * ref.attachmentId, filename: ref.name, mime: ref.mimeType, size: 0 }` is a
 * perfectly well-formed `AttachmentSummary`, and `ref.attachmentId` is all
 * `onPick` ever needs to name it as evidence). Nothing in `packages/editor`
 * builds such a summary today — Plan 6/6a's `AttachmentListEntry`
 * (`AttachmentListItem.tsx:50-52`) already discriminates uploads from Drive
 * references by `kind`, and this task's callers pass uploads only — but the
 * type itself does not prevent it; only every caller upholding the prop's
 * contract does. Task 13a extends this component with a *separate* prop
 * (`driveReferences?: DriveReferenceSummary[]`, below) so a Drive reference
 * is shown — unofferable, carrying the server's own reason sentence —
 * without ever touching this array or `onPick`. See the predicate note on
 * `EvidencePicker` below for what that does and does not change about this
 * type's own guarantees.
 */
export type AttachmentSummary = {
  attachmentId: string;
  filename: string;
  mime: string;
  size: number;
};

/** A Drive reference on this ticket, as the evidence picker lists it — never as something offerable. */
export type DriveReferenceSummary = { attachmentId: string } & DriveReference;

export type EvidencePickerProps = {
  /** The ticket's existing UPLOADS — any of them can serve as evidence. Never pass a Drive reference here: see `AttachmentSummary`'s docblock. */
  attachments: AttachmentSummary[];
  /**
   * Drive references on this ticket. They are listed so the user is not
   * left wondering where their file went — and they arrive on their own
   * prop, with no pick handler anywhere near them, because "not offerable"
   * must be a fact about the code and not a disabled attribute someone can
   * defeat (spec §2, Drive rule 1).
   */
  driveReferences?: DriveReferenceSummary[];
  uploadAttachment(file: File): Promise<UploadResult>;
  /** Emit attachment.added for a fresh upload before it is offered as evidence. */
  onAttachmentAdded(result: UploadResult): Promise<void> | void;
  /** The chosen id goes into ticket.transitioned's evidenceAttachmentId. */
  onPick(evidenceAttachmentId: string): void;
  onCancel(): void;
};

/**
 * The require-evidence companion (spec §4): when a transition demands an
 * attachment, this is where the user names one — an existing attachment or a
 * fresh upload. The picker only ever hands back an id that a real upload
 * produced; the server's evidence gate re-proves it exists.
 *
 * THE PREDICATE THIS MIRRORS, AND WHERE THE AUTHORITATIVE COPY LIVES.
 * `apps/server/src/gates/evidence-gate.ts` (`makeEvidenceGate`) accepts an
 * `evidenceAttachmentId` in exactly one case: it names a real UPLOAD row on
 * THIS ticket (`SELECT 1 FROM attachments WHERE id = $1 AND ticket_id =
 * $2`). Everything else it refuses — a Drive reference is refused with
 * `RULE_EVIDENCE_DRIVE_REFERENCE` / `EVIDENCE_DRIVE_REFERENCE_REASON` even
 * though it genuinely exists on the ticket (spec §2, Drive rule 1: a file
 * this product does not hold can be renamed, edited, moved or deleted after
 * it is attached, so it may never stand as evidence), and anything unknown
 * to this ticket is refused `attachment.evidence-unknown`. That gate is the
 * AUTHORITATIVE copy of this predicate; nothing here re-implements it.
 *
 * WHAT THIS COMPONENT MIRRORS TODAY, AND WHAT IT DOES NOT. Every entry this
 * component can render an `.evidence-picker__option` for comes off the
 * `attachments: AttachmentSummary[]` prop, and this component runs no
 * `kind === 'upload'` filter of its own over that array (see
 * `AttachmentSummary`'s own docblock: the type does not rule out a mapped-in
 * Drive reference, it only rules out a direct one). So "never offer what the
 * gate's second branch refuses" holds ONLY so long as every caller upholds
 * the prop's contract and passes uploads only — a caller-side guarantee this
 * component has no way to check, not a structural one. It does NOT mirror
 * "must exist on THIS ticket" — that scope is true only of whatever array the caller passes (this
 * component holds no ticket id and makes no request of its own), so a
 * caller that hands it another ticket's attachments is outside what a
 * client-side mirror can catch; the gate's per-ticket `WHERE ... AND
 * ticket_id = $2` clause is the backstop for that case, not this one.
 * SHOWING a Drive reference to the user (with the named reason, rather than
 * silently discarding it) is Task 13a's addition, layered on top of this
 * file through the `driveReferences` prop below: it renders in its own
 * `.evidence-picker__unavailable` section, mapped from its own array, with
 * no `onClick` anywhere in that markup — there is no code path from a
 * `DriveReferenceSummary` to `onPick`, structurally, not merely by omitting
 * a disabled attribute someone could defeat.
 */
export function EvidencePicker(props: EvidencePickerProps): React.JSX.Element {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleUpload(files: FileList | null): Promise<void> {
    const file = files?.[0];
    if (!file || uploading) return;
    setUploading(true);
    setError(null);
    try {
      const result = await props.uploadAttachment(file);
      await props.onAttachmentAdded(result);
      props.onPick(result.attachmentId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'upload failed');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="evidence-picker" role="dialog" aria-label="Choose evidence">
      <p>This move must carry an attachment as evidence.</p>
      <ul>
        {props.attachments.map((attachment) => (
          <li key={attachment.attachmentId}>
            <button
              type="button"
              className="evidence-picker__option"
              onClick={() => props.onPick(attachment.attachmentId)}
            >
              {attachment.filename} · {attachment.mime}
            </button>
          </li>
        ))}
      </ul>
      {(props.driveReferences ?? []).length === 0 ? null : (
        <div className="evidence-picker__unavailable">
          <p className="evidence-picker__reason">{EVIDENCE_DRIVE_REFERENCE_REASON}</p>
          <ul>
            {(props.driveReferences ?? []).map((reference) => (
              <li key={reference.attachmentId} className="evidence-picker__unavailable-item">
                {reference.name} · Google Drive reference, last seen {reference.capturedAt.slice(0, 10)}
              </li>
            ))}
          </ul>
        </div>
      )}
      <label className="evidence-picker__upload">
        {uploading ? 'Uploading…' : 'Upload new evidence'}
        <input type="file" disabled={uploading} onChange={(event) => void handleUpload(event.target.files)} />
      </label>
      {error === null ? null : <p role="alert">{error}</p>}
      <button type="button" className="evidence-picker__cancel" onClick={props.onCancel}>
        Cancel
      </button>
    </div>
  );
}
