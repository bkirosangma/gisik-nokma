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
 * ## ONE CONTRACT WRITTEN TWICE — and the twin now exists
 *
 * Plan 6 Open questions 13 and 15 say `packages/editor` re-declares this shape
 * locally (it must never depend on app-core) and that the two move together.
 * The earlier note here recorded that the twin was not yet written and that
 * there was nothing to reconcile. **Both statements expired on 2026-09-03**:
 * Plan 7 Task 14 shipped `EditorSlotProps` and `TicketEditorSlot` in
 * `packages/editor/src/components/TicketEditorSlot.tsx`, and this comment moved
 * in that same commit, because the halves are edited together or not at all.
 *
 * The divergence that note MEASURED was real, and it had to be resolved before
 * the twin could exist. Plan 6 declares `doc: unknown`; Plan 7's text declared
 * `doc: DocJson | null`. Under `strictFunctionTypes` a component is a function
 * of its props, so props are compared CONTRAVARIANTLY and the NARROWER
 * declaration is the one that breaks — `unknown` is not assignable to
 * `DocJson | null`, and `TicketEditorSlot` would not have been assignable to
 * `EditorSlotComponent` at any mount site:
 *
 *   error TS2322: Type '(props: TicketEditorSlotProps) => Element' is not
 *   assignable to type '(props: EditorSlotProps) => ReactElement | null'.
 *     Types of parameters 'props' and 'props' are incompatible.
 *       Types of property 'doc' are incompatible.
 *         Type 'unknown' is not assignable to type 'DocJson | null'.
 *
 * **Resolution: `packages/editor` widened its half to `doc: unknown` and moved
 * the narrowing to `isDocJson` at its own mount.** This half did not change
 * shape, and could not have: `TicketSheet` passes `doc={fieldClaim.value}` (see
 * `ticket-sheet.tsx`), an `unknown` off a domain field claim, and amendment 12
 * bars app-core from knowing what a document looks like — so app-core has no
 * way to produce a `DocJson`-typed value to satisfy the narrower contract. The
 * narrower spelling was not merely inconvenient; it was unsatisfiable from the
 * only side that calls it. The `null → empty composer` behaviour the narrower
 * spelling was meant to protect survives intact on the far side, and now covers
 * every non-document value rather than only `null`. Two alternatives were
 * rejected, recorded because both are tempting on first hitting TS2322: casting
 * inside the editor (hides the divergence) and leaving the halves disagreeing
 * (ships a seam that fails at the first real mount).
 *
 * The other two suspected divergences remain false positives, named here so
 * nobody re-finds them: `EditorSlotUpload` is identical field for field, and
 * `queryUsers` differs only in spelling — `packages/editor`'s
 * `MentionCandidate` IS `{ userId: string; name: string }`. A third pairing is
 * a divergence that is SAFE and deliberate: `EditorSlotSubmission` below spells
 * the bodies `unknown` where the editor's `EditorSubmission` spells them
 * `DocJson`. That direction assigns fine — a handler accepting the wider
 * payload satisfies a slot promising the narrower one — so the host stays free
 * of ProseMirror types.
 *
 * WHAT IS STILL OWED, and by whom: nothing yet mounts `TicketEditorSlot` here.
 * Today's compile-time proof lives on the editor side, as an assignment against
 * a TRANSCRIBED copy of the declaration below
 * (`packages/editor/test/ticket-editor-slot.test.tsx`), guarded by a test that
 * reads THIS file and fails if its `doc` stops saying `unknown`. A transcription
 * is not the real thing. The real proof is an actual
 * `<TicketSheet editorSlot={TicketEditorSlot} />` in an app that legitimately
 * depends on both packages — `apps/web` depends on app-core but NOT on
 * `@gisik-nokma/editor` as of 2026-09-03 — and it belongs to Plan 6 step 12,
 * whose boundary this is.
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
