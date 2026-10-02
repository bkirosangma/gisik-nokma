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
 * **THE OWED PROOF IS NO LONGER OWED, and this note is what said so.** Until
 * 2026-09-19 this paragraph read *"WHAT IS STILL OWED … nothing yet mounts
 * `TicketEditorSlot` here"* and named the real proof as *"an actual `<TicketSheet
 * editorSlot={TicketEditorSlot} />` in an app that legitimately depends on both
 * packages — `apps/web` depends on app-core but NOT on `@gisik-nokma/editor` as
 * of 2026-09-03"*. **`apps/web` is now that app**: it takes the dependency edge,
 * imports `TicketEditorSlot`, and passes it to `TicketSheet`'s `editorSlot` prop
 * (`apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx`), which Plan 6 declared
 * as the arrangement all along (`docs/superpowers/plans/2026-08-20-06-web-client.md:5667`:
 * *"`apps/web` passes it into `TicketSheet` — no mount point changes"*).
 *
 * The transcription on the editor side still stands and is still worth having —
 * it is what fails loudly under `strictFunctionTypes` if these two declarations
 * drift apart, and it is faster than a build. It is no longer the ONLY proof.
 *
 * The reverse direction is still barred, unchanged: `packages/editor` must never
 * import this file.
 */
export type EditorSlotSubmission =
  | { type: 'comment.added'; payload: { body: unknown } }
  | { type: 'note.body_set'; payload: { body: unknown } }
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
  mode: 'comment' | 'description' | 'note';
  /** ProseMirror JSON — opaque outside `packages/editor`; null → empty. */
  doc: unknown;
  readOnly: boolean;
  /** Mention/member resolution scope for the real editor. */
  workspaceId: string;
  /** Uploads and `attachment.added` are ticket-scoped. */
  ticketId: string;
  /**
   * The note an upload belongs to, in `note` mode (notes series Plan 5, spec
   * §4.4). The twin of the block in
   * `packages/editor/src/components/TicketEditorSlot.tsx`, declared with the
   * same name and the same optionality ON PURPOSE: the transcription case in
   * `packages/editor/test/ticket-editor-slot.test.tsx` compares this
   * declaration's field names against its own copy, so adding the field on one
   * side alone fails a test before it fails a build.
   *
   * `ticketId` stays REQUIRED and this one is optional, which is a statement
   * about the two modes rather than an oversight: every ticket-shaped mount has
   * a ticket, and a note mount has no ticket at all. It is also the shape that
   * costs the existing `ticketId` call sites nothing.
   */
  noteId?: string;
  placeholder?: string;
  autoFocus?: boolean;
  /**
   * The `id` of a VISIBLE element whose words name this composer — exec1 P21.
   *
   * A host that renders a caption beside the field already HAS the words on
   * screen, and pointing the control at them keeps ONE source: the caption a
   * sighted reader sees and the name a screen reader announces cannot drift,
   * because they are the same node. That is the mechanism the product reaches
   * for where it has a caption to borrow, and `ticket-sheet.tsx`'s description
   * row is the mount that does.
   *
   * **Optional, and the split with `mode`'s own label is deliberate rather than
   * a fallback chain.** The COMMENT composer has no visible caption — it sits
   * under a `Comments · N` heading that names the thread rather than the field —
   * so nothing exists to point at and the words have to be supplied. Where
   * BOTH are present on one host, `aria-labelledby` wins in the accessible-name
   * computation, which is why the mount that passes this one does not also get
   * a contrary label to disagree with.
   */
  labelledBy?: string;
  /**
   * One sentence for the composer's footer, left of the submit control — the
   * prototype's `cmtHint` slot (`desktop.dc.html:1329`). Optional and additive
   * (spec 2026-09-22); the read-only `PlainTextEditorSlot` ignores it, as it
   * ignores every capability field. In comment mode it REPLACES the Markdown
   * hint (the prototype's comment composer has none); in description mode the
   * Markdown hint keeps the slot and this field is not read.
   *
   * A SENTENCE, not a node: the field is a `string` on purpose. Handing a slot
   * a `ReactNode` would make app-core's half of this twice-written contract
   * depend on React's element type in a package whose contract is otherwise
   * plain data, and the only thing any caller has ever wanted to put here is the
   * prototype's own line of prose.
   */
  footerNote?: string;
  // Editor capabilities. All optional: the read-only default ignores every one
  // of them, and a read-only mount supplies none. The real editor requires them
  // for composing, and states the gap honestly when one is missing rather than
  // pretending (e.g. no uploadAttachment → image paste is refused, not dropped).
  queryUsers?: (query: string) => Promise<Array<{ userId: string; name: string }>>;
  // Wiki-link capabilities (Plan 4 Task 5), the twin of the block in
  // `packages/editor/src/components/TicketEditorSlot.tsx`. Declared with the
  // same four names and the same inline shapes ON PURPOSE: the transcription
  // case in `packages/editor/test/ticket-editor-slot.test.tsx` compares this
  // declaration's field names against its own copy, so adding a prop here
  // without adding it there fails a test before it fails a build.
  // The AUTOSAVE hooks of `note` mode (Plan 4 Task 8), the twin of the block
  // in `packages/editor/src/components/TicketEditorSlot.tsx`.
  onDraft?: (doc: unknown) => void;
  onSave?: (doc: unknown) => void;
  saveState?: 'saved' | 'saving' | 'unsaved';
  queryNotes?: (query: string) => Promise<Array<{ noteId: string; title: string }>>;
  resolveNoteTitle?: (noteId: string) => string | null;
  previewNote?: (noteId: string) => Promise<string | null>;
  onNavigateNote?: (noteId: string) => void;
  headingLink?: (id: string) => string | null;
  // Ticket-reference capabilities (Plan 7 Task 1), the twin of the block in
  // `packages/editor/src/components/TicketEditorSlot.tsx`. Same reasoning as
  // the wiki-link four above: field names, not deep types, are what the
  // transcription case compares.
  queryTickets?: (query: string) => Promise<Array<{ ticketId: string; projectId: string; key: string; title: string }>>;
  resolveTicketHref?: (ref: { ticketId: string; projectId: string }) => string | null;
  // Trash series Plan 3 — which chips point at permanently erased items; the twin
  // of `packages/editor/src/components/TicketEditorSlot.tsx`'s field.
  isPurged?: (kind: 'ticket' | 'note', id: string) => boolean;
  uploadAttachment?: (file: File) => Promise<EditorSlotUpload>;
  emitAttachmentAdded?: (uploaded: EditorSlotUpload) => Promise<void>;
  /**
   * V7 — THE SUBMISSION'S OUTCOME, and it is NOT `void`.
   *
   * A composer that clears itself on "the promise resolved" is clearing on
   * *no exception*, and **no exception is not acceptance**. The server has
   * three answers to a claim — committed, refused, invalid — plus the two ways
   * it can fail to answer (a silence, and a dropped connection), and four of
   * those five must leave the person's words on screen. `Promise<void>` could
   * not say which had happened, so `TicketEditorSlot` cleared on all five and a
   * refused comment cost the author what they had written.
   *
   * `true` means THE SERVER ACCEPTED THE CLAIM. Anything else — a refusal, an
   * invalid answer, a silence, a rejection — means the caller must not treat
   * the words as sent.
   *
   * **Deliberately not `Promise<void>` with an optional `false` read as "not
   * accepted":** a fail-open default would restore exactly this defect for any
   * caller that did not opt in, which is the half-witnessed contract this
   * repository keeps re-finding. The cost is that every producer must say which
   * happened, and that is the point.
   */
  submit?: (submission: EditorSlotSubmission) => Promise<boolean>;
  /**
   * The document as it stands, reported on every EDIT (owner request
   * 2026-09-23).
   *
   * ## Why the seam needed a second way out for the document
   *
   * Until this existed, `submit` was the only channel a document ever left an
   * editor through — and it fires on the press of the COMPOSER'S OWN control.
   * That is right for both surfaces this contract has had: the sheet's
   * description and its comment thread both write to a ticket that already
   * exists, so a `ticket.field_set`/`comment.added` is exactly the act.
   *
   * The Create ticket dialog is the mount where neither holds. Its description
   * belongs to a ticket that **does not exist yet** — `Create` mints the id and
   * writes `ticket.created` — so there is nothing to submit to at the moment the
   * words are typed, and a `ticket.field_set` sent early would name a ticket
   * nobody has created. The host therefore needs the document itself, held in
   * the draft until the create lands.
   *
   * **On the SHARED contract rather than on `packages/editor`'s seam-only
   * extras**, unlike `editorRef`: the caller is app-core, which may not name the
   * editor package at all (amendment 12), so a channel only that package's own
   * props carry is a channel app-core structurally cannot reach. That is the
   * same constraint that widened `doc` to `unknown` and moved the narrowing to
   * `isDocJson` at the editor's mount.
   *
   * Semantics: fired on every change, with the current document; NOT fired for a
   * mount that is never typed into. A host that treats "never reported" as "no
   * description" and an empty document as the same thing would then be wrong
   * only in the direction of writing an empty one, which
   * `create-ticket-flow.tsx` refuses on its own (`docToPlainText` + a length
   * test) rather than relying on this description of it.
   */
  onChange?: (doc: unknown) => void;
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
