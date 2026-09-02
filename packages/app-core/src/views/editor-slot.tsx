import type { ReactElement } from 'react';
import { docToPlainText } from '@gisik-nokma/domain';

/**
 * The seam Plan 7 fills with the real Tiptap editor (coordination amendment
 * 12). This plan ships the read-only default; the props contract is pinned
 * here so no mount point moves when the editor lands.
 *
 * Documents are `unknown` here deliberately — amendment 12 keeps ProseMirror
 * JSON opaque outside `packages/editor`, and app-core only ever passes it
 * through or renders it via `docToPlainText`.
 *
 * ## ONE CONTRACT WRITTEN TWICE — and today only one half is written
 *
 * Plan 6 Open questions 13 and 15 say `packages/editor` re-declares this
 * shape locally (it must never depend on app-core) and that the two move
 * together. **Measured 2026-09-02: `packages/editor` declares no such type.**
 * Its whole published surface is `DOC_SCHEMA_VERSION`/`emptyDoc`/`isDocJson`/
 * `DocJson`, `buildEditorExtensions`, `TicketImage`, `Mention` and the mention
 * popup — no `EditorSlotProps`, no `TicketEditorSlot`, no
 * `composeEditorSubmission`. So this declaration has no twin to be edited
 * beside yet, and there is nothing here to reconcile.
 *
 * What DOES exist is a divergence between the two PLAN TEXTS, and it is not
 * cosmetic: Plan 6 declares `doc: unknown`, Plan 7 declares `doc: DocJson |
 * null`. Under this repo's `strict` tsconfig, `strictFunctionTypes` compares
 * function parameters contravariantly, so Plan 7's `TicketEditorSlot` is NOT
 * assignable to `EditorSlotComponent`. MEASURED against `tsconfig.base.json`
 * rather than argued — one error, and both controls in the same run compile:
 *
 *   error TS2322: Type '(props: P7) => null' is not assignable to type
 *   'EditorSlotComponent'. … Type 'unknown' is not assignable to type
 *   'DocJson | null'.
 *
 * Plan 7's own consistency check calls the two "structurally identical ✓";
 * they are not, and the arrow points the wrong way for the assignment both
 * plans rest on. The OTHER two suspected divergences are false positives,
 * named here so nobody re-finds them: `EditorSlotUpload` is identical field
 * for field (already recorded), and `queryUsers` differs only in spelling —
 * `packages/editor`'s `MentionCandidate` IS `{ userId: string; name: string }`,
 * so Plan 7's `Promise<MentionCandidate[]>` and the inline shape below are the
 * same type and the assignment compiles. Recorded for step 12, whose boundary
 * this is; nothing under `packages/editor` is touched from here.
 */
export type EditorSlotSubmission =
  | { type: 'comment.added'; payload: { body: unknown } }
  | { type: 'ticket.field_set'; payload: { fieldId: 'description'; value: unknown } };

/** What an upload answers with — the SERVER-sniffed truth, echoed into `attachment.added`. */
export type EditorSlotUpload = {
  attachmentId: string;
  filename: string;
  mime: string;
  size: number;
  url: string;
  sha256: string;
};

export type EditorSlotProps = {
  /** Which ledger event a submit becomes. */
  mode: 'comment' | 'description';
  /** ProseMirror JSON — opaque outside `packages/editor`; null → empty. */
  doc: unknown;
  readOnly: boolean;
  /** Mention/member resolution scope for the real editor. */
  workspaceId: string;
  /** Uploads and `attachment.added` are ticket-scoped. */
  ticketId: string;
  placeholder?: string;
  autoFocus?: boolean;
  // Editor capabilities. All optional: the read-only default ignores every one
  // of them, and a read-only mount supplies none. The real editor requires them
  // for composing, and states the gap honestly when one is missing rather than
  // pretending (e.g. no uploadAttachment → image paste is refused, not dropped).
  queryUsers?: (query: string) => Promise<Array<{ userId: string; name: string }>>;
  uploadAttachment?: (file: File) => Promise<EditorSlotUpload>;
  emitAttachmentAdded?: (uploaded: EditorSlotUpload) => Promise<void>;
  submit?: (submission: EditorSlotSubmission) => Promise<void>;
  onDone?: () => void;
  onError?: (err: unknown) => void;
};

export type EditorSlotComponent = (props: EditorSlotProps) => ReactElement | null;

/**
 * The honest read-only default: a plain-text projection of the document,
 * through the domain's one `docToPlainText` (amendment 12's renderer, shared
 * with the search projection and notifications).
 *
 * It renders and it does not compose. A build without Plan 7's editor cannot
 * write a comment or a description here, and this component says so by having
 * no control to type into rather than by offering one that silently discards
 * what is typed. Every capability prop above is ignored on purpose; a
 * read-only mount supplies none of them.
 */
export function PlainTextEditorSlot({ doc, placeholder }: EditorSlotProps): ReactElement {
  const text = docToPlainText(doc);
  return (
    <div className="gn-editor-slot gn-editor-slot--plain">
      {text.length > 0 ? (
        text
      ) : (
        <span className="gn-editor-slot__placeholder">{placeholder ?? ''}</span>
      )}
    </div>
  );
}
