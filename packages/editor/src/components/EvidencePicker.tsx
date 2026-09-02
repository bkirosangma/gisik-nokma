import { useState } from 'react';
import type { UploadResult } from '../upload.js';

/**
 * An existing UPLOAD, as the evidence picker offers it. `AttachmentSummary`
 * means *uploaded attachment* and nothing else — it carries no `kind`
 * discriminator because it does not need one: the type is structurally
 * incapable of describing a Drive reference (no `driveFileId`, no
 * `webViewLink`), so nothing this component can iterate here is ever one.
 * Plan 7's own text names Task 13a as the task that extends this component
 * with a *separate* prop (`driveReferences?: DriveReferenceSummary[]`) so a
 * Drive reference can be shown — unofferable, carrying the server's own
 * reason sentence — without ever touching this array or `onPick`. That
 * extension is Task 13a's scope, not this task's; see the predicate note on
 * `EvidencePicker` below for what that leaves this component responsible
 * for today.
 */
export type AttachmentSummary = {
  attachmentId: string;
  filename: string;
  mime: string;
  size: number;
};

export type EvidencePickerProps = {
  /** The ticket's existing UPLOADS — any of them can serve as evidence. Never pass a Drive reference here: see `AttachmentSummary`'s docblock. */
  attachments: AttachmentSummary[];
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
 * `attachments: AttachmentSummary[]` prop, and `AttachmentSummary` cannot
 * express a Drive reference (see its own docblock) — so "never offer what
 * the gate's second branch refuses" holds here BY CONSTRUCTION OF THE TYPE,
 * not by a runtime filter, so long as callers uphold the prop's contract
 * (pass uploads only). It does NOT mirror "must exist on THIS ticket" —
 * that scope is true only of whatever array the caller passes (this
 * component holds no ticket id and makes no request of its own), so a
 * caller that hands it another ticket's attachments is outside what a
 * client-side mirror can catch; the gate's per-ticket `WHERE ... AND
 * ticket_id = $2` clause is the backstop for that case, not this one.
 * SHOWING a Drive reference to the user (with the named reason, rather than
 * silently discarding it) is Task 13a's scope, layered on top of this file
 * through its own `driveReferences` prop — deliberately not built here, so
 * as not to reach into a task this one was not asked to do.
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
