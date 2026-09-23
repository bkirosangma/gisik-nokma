import { useEffect, useId, useRef, useState } from 'react';
import type { Editor } from '@tiptap/core';
import { emptyDoc, isDocJson, type DocJson } from '../doc.js';
import type { MentionCandidate } from '../extensions/mention.js';
import type { UploadResult } from '../upload.js';
import { composeEditorSubmission, type EditorSubmission } from '../attachments/compose-editor-submission.js';
import { MARKDOWN_HINT } from './EditorToolbar.js';
import { TicketEditor } from './TicketEditor.js';

/**
 * `UploadResult` (Task 12) IS the slot's upload shape — the same six fields,
 * the same meaning (the SERVER-sniffed truth, `sha256` included). The alias
 * exists so a host can name the shape without importing this package.
 */
export type EditorSlotUpload = UploadResult;

/**
 * ## ONE CONTRACT WRITTEN TWICE — and this half is the one that had to move
 *
 * Plan 6 owns the declaration (`packages/app-core/src/views/editor-slot.tsx`).
 * `packages/editor` must never import `@gisik-nokma/app-core` — that inverts
 * the dependency and drags app-core's tree into the RN webview bundle — so the
 * shape is re-declared here and structural typing is what makes
 * `TicketEditorSlot` assignable to app-core's `EditorSlotComponent`.
 *
 * The two plan texts disagreed about ONE field, and the disagreement is not
 * cosmetic. Plan 6 spells `doc: unknown`; Plan 7 spells `doc: DocJson | null`.
 * Under `strictFunctionTypes` a component's props are its parameter, compared
 * CONTRAVARIANTLY, so `(p: {doc: DocJson | null}) => …` is NOT assignable to
 * `(p: {doc: unknown}) => …`: `unknown` is not assignable to `DocJson | null`.
 * The NARROWER declaration is the one that breaks.
 *
 * **Resolution: this half widened to `doc: unknown`, and the narrowing moved
 * from the type to `isDocJson` at the mount.** Plan 7's spelling is not merely
 * awkward here, it is IMPOSSIBLE: app-core's mount site passes
 * `doc={fieldClaim.value}` (`views/ticket-sheet.tsx:362`) — an `unknown` off a
 * domain field claim — and amendment 12 forbids app-core knowing what
 * ProseMirror JSON looks like, so app-core cannot produce a `DocJson`-typed
 * value to hand over. A contract cannot demand of its caller a thing the
 * caller is structurally barred from having.
 *
 * Widening does NOT cost the `null → empty composer` behaviour the plan asks
 * for — that survives verbatim, and `isDocJson` extends it: anything that is
 * not a document (null, `undefined`, a string, `{}`) opens an empty composer
 * instead of being cast into one and blowing up inside ProseMirror. What
 * widening costs is a compile-time guarantee that was never real, since the
 * value genuinely arrives as `unknown`. The two moves this deliberately did
 * NOT make are `as DocJson` (hides the divergence) and leaving the two halves
 * disagreeing (ships a seam that fails at the first mount).
 *
 * Every other field was checked and matches: `EditorSlotUpload` is identical
 * field for field, `queryUsers`' inline shape in app-core IS `MentionCandidate`
 * (`{ userId: string; name: string }`), and app-core's `EditorSlotSubmission`
 * spells the bodies `unknown` where `EditorSubmission` spells them `DocJson` —
 * which is the SAFE direction: a callback taking the wider payload is
 * assignable to one taking the narrower.
 *
 * **Edit both or neither.** A type-level transcription of app-core's half, and
 * a check that its `doc` field still reads `unknown`, live in
 * `test/ticket-editor-slot.test.tsx`.
 *
 * **THE END-TO-END PROOF LANDED 2026-09-19, and this paragraph used to say it
 * was owed.** *"An actual `<TicketSheet editorSlot={TicketEditorSlot} />`"* was
 * the test this note set, and `apps/web` now is that app: it takes the
 * dependency edge, imports this component, and passes it to the sheet's
 * `editorSlot` prop. **This package still cannot import app-core** — the edge
 * runs one way and that is the whole point of the arrangement — so the proof
 * necessarily lives in the app, not here.
 */
export type EditorSlotProps = {
  /** Which ledger event a submit becomes. */
  mode: 'comment' | 'description' | 'note';
  /** ProseMirror JSON, opaque to the caller; anything that is not a document → empty composer. */
  doc: unknown;
  readOnly: boolean;
  // Wiki-link capabilities (Plan 4 Task 5). Optional like the block below, and
  // declared with app-core's twin BYTE-FOR-BYTE — the transcription case in
  // `test/ticket-editor-slot.test.tsx` reads both declarations and fails if
  // their field names diverge, so these four must be added in the same change
  // set as `packages/app-core/src/views/editor-slot.tsx`'s.
  // The AUTOSAVE hooks of `note` mode (Plan 4 Task 8). `onDraft` fires on
  // every document change, `onSave` on blur, and `saveState` is what the
  // footer reports — three separate things on purpose, because "the document
  // moved" and "the host accepted it" are different facts and a slot that
  // merged them would say "Saved" while a write was still in flight.
  onDraft?: (doc: unknown) => void;
  onSave?: (doc: unknown) => void;
  saveState?: 'saved' | 'saving' | 'unsaved';
  queryNotes?: (query: string) => Promise<Array<{ noteId: string; title: string }>>;
  resolveNoteTitle?: (noteId: string) => string | null;
  previewNote?: (noteId: string) => Promise<string | null>;
  onNavigateNote?: (noteId: string) => void;
  /**
   * Contract-required, and THIS IMPLEMENTATION READS NEITHER — said plainly
   * rather than dressed up as a guarantee. Both scopes arrive already baked
   * into the capability closures the host supplies: `queryUsers` is a
   * workspace-scoped query by the time it gets here, and `uploadAttachment`
   * carries the ticket it uploads to (`uploadAttachmentHttp(file, ticketId)`).
   * A component that re-read them could only disagree with the closures, never
   * correct them. `ticketId` earns its place in the contract anyway: the RN
   * webview bridge posts `requestUpload` to a host that has no closure to
   * carry it, and that is the reader this prop is waiting for.
   */
  workspaceId: string;
  ticketId: string;
  /**
   * The note an upload belongs to, in `note` mode — the twin of `ticketId`
   * (notes series Plan 5, spec §4.4). Declared with app-core's copy BYTE-FOR-
   * BYTE and asserted by `test/ticket-editor-slot.test.tsx`'s field-name set
   * comparison, so a one-sided addition fails a test rather than drifting.
   *
   * **THIS IMPLEMENTATION DOES NOT READ IT**, for exactly the reason `ticketId`
   * is not read either: uploads arrive here as an already-bound closure
   * (`uploadAttachment`), and a host that has the closure has no need to hand
   * its owner id over as well. It earns its place in the contract for the reader
   * the twin names — the RN webview bridge posts `requestUpload` to a host on
   * the far side of a message port, where there is no closure to carry the
   * owner and no way to ask for one after the fact.
   *
   * At most one of `ticketId` and `noteId` is meaningful, and the route refuses
   * both at once (`attachments.ts:375-388`); they are two optional-shaped fields
   * rather than a union because `ticketId` predates note mode and is required.
   */
  noteId?: string;
  placeholder?: string;
  autoFocus?: boolean;
  /**
   * The `id` of a visible element whose words name this composer. Transcribed
   * from app-core's half — see that declaration for the reasoning; the two move
   * together or neither does, and `test/ticket-editor-slot.test.tsx` compares
   * the three field-name sets for equality so a one-sided addition fails.
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
   * `app-core`'s half carries the same paragraph and the same reasoning — the
   * two are written twice and `test/ticket-editor-slot.test.tsx` compares their
   * field-name sets for equality, so this field exists here because it exists
   * there and not for any reason of this package's own.
   */
  footerNote?: string;
  // Editor capabilities. Optional in the shared declaration because Plan 6's
  // read-only PlainTextEditorSlot supplies none of them. This component STATES
  // the gap rather than pretending: without `submit` the submit button is
  // disabled and says why; without `uploadAttachment` a pasted file is refused
  // through onError instead of being silently swallowed.
  queryUsers?: (query: string) => Promise<MentionCandidate[]>;
  uploadAttachment?: (file: File) => Promise<EditorSlotUpload>;
  emitAttachmentAdded?: (uploaded: EditorSlotUpload) => Promise<void>;
  // V7 — `Promise<boolean>`, and it must stay in step with the OTHER half of
  // this contract (`packages/app-core/src/views/editor-slot.tsx`'s
  // `EditorSlotProps`): the two are written twice and a case asserts neither has
  // a field the other lacks, so this is a copy that is checked rather than a
  // copy that drifts. `true` means THE SERVER ACCEPTED THE CLAIM; a refusal, an
  // invalid answer, a silence or a rejection all mean the composer must keep the
  // person's words. It was `Promise<void>`, and `void` cannot say which
  // happened — so the clear ran on every one of those five outcomes.
  submit?: (submission: EditorSubmission) => Promise<boolean>;
  /**
   * The document as it stands, reported on every edit — transcribed from
   * app-core's half, which carries the full reasoning (the New ticket dialog
   * needs the document BEFORE any submit, because the ticket it describes does
   * not exist until `Create` is pressed). The two declarations move together:
   * `test/ticket-editor-slot.test.tsx` compares their field-name sets, so a
   * one-sided addition fails there rather than drifting silently.
   *
   * ⚠ "EVERY EDIT" IS QUALIFIED BY MODE: the slot routes `onDocChange` by
   * `mode` (`note` → `onDraft`, everything else → here), so this channel
   * carries the edits of `comment` and `description` mounts. See the note at
   * the mount for why the routing exists. It costs the only caller that
   * supplies this prop nothing: the create dialog mounts `description`
   * (13.1365).
   */
  onChange?: (doc: unknown) => void;
  onDone?: () => void;
  onError?: (err: unknown) => void;
};

/**
 * What this component accepts: the shared contract, plus one seam that is NOT
 * part of it. `editorRef` is imperative access for tests and (later) the
 * webview bridge, exactly as `TicketEditorProps.editorRef` is. It lives here
 * rather than in `EditorSlotProps` on purpose — putting it in the shared shape
 * would force app-core to name `@tiptap/core`'s `Editor`, which is the leak
 * amendment 12 forbids. Being optional, its presence does not disturb the
 * assignability proof.
 */
export type TicketEditorSlotProps = EditorSlotProps & {
  editorRef?: React.MutableRefObject<Editor | null>;
  /**
   * Whether this mount draws the slot's OWN submit control (owner request
   * 2026-09-23). `'footer'` — the default — keeps every mount this component has
   * ever had exactly as it was; `'none'` omits the button and leaves the rest of
   * the footer, which also carries the hint sentence.
   *
   * **Seam-only, deliberately, and for `editorRef`'s own reason:** it lives here
   * rather than in the shared `EditorSlotProps` because it is a fact about
   * mounting THIS component, not about what an editor slot promises. The
   * contract's other mount — app-core's read-only `PlainTextEditorSlot` — has no
   * submit control to suppress, and a host that does not know which component it
   * is passed could not meaningfully ask for this. Being optional, its presence
   * does not disturb the assignability proof that the two halves still meet.
   *
   * ## Why a caller needs it at all
   *
   * The New ticket dialog's description. Its `Create` control is the one act
   * that files the ticket, and the composer's own "Submit" would sit inside the
   * same form offering a SECOND, differently-shaped act — one that sends a
   * `ticket.field_set` for a ticket that does not exist yet. Two submit controls
   * for one act is not a styling question: the inner one would be an attempt to
   * write to nothing.
   */
  submitSlot?: 'footer' | 'none';
};

/**
 * The three save states, in the reader's words (Plan 4 Task 8). A mapping
 * rather than three inline strings so the case can name each one, and so the
 * one that is EASY to get wrong — `unsaved` is not "Saving…" — has a single
 * place to be wrong in.
 */
const SAVE_STATE_TEXT: Record<'saved' | 'saving' | 'unsaved', string> = {
  saved: 'Saved',
  saving: 'Saving…',
  unsaved: 'Not saved (kept on this device)',
};

const NO_MENTIONS = async (): Promise<MentionCandidate[]> => [];
const NO_EMIT = async (): Promise<void> => {};

/**
 * The concrete component behind Plan 6's `<EditorSlot>` boundary: a Tiptap
 * composer plus one submit control, and nothing else. It never speaks HTTP and
 * never touches a DataSource — `submit` and `emitAttachmentAdded` are the
 * host's, so the sheet stays the one place that appends to the ledger.
 */
export function TicketEditorSlot(props: TicketEditorSlotProps): React.JSX.Element {
  const ownRef = useRef<Editor | null>(null);
  const editorRef: React.MutableRefObject<Editor | null> = props.editorRef ?? ownRef;
  // TWO flags, on purpose, because they answer different questions at different
  // instants. `submitting` is render state and drives `disabled`; it is useless
  // as a re-entrancy guard, because two clicks in one React batch both read the
  // same pre-commit `false` and both get through — MEASURED, two
  // `comment.added` events for one comment, in an append-only ledger that
  // cannot take either back. `submittingRef` is set SYNCHRONOUSLY inside the
  // handler, before the first await, which is the only place a second click in
  // the same tick can be seen.
  const submittingRef = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  const [ready, setReady] = useState(false);

  // The narrowing the widened `doc` moved here. `null` is the empty composer
  // the contract names; so is anything else that is not a document, because
  // the caller hands this over as `unknown` and a cast would only postpone the
  // failure to somewhere it reads as a ProseMirror bug.
  const initialDoc: DocJson | null = isDocJson(props.doc) ? props.doc : null;

  const disabledReason: string | undefined = props.readOnly
    ? 'Read-only: this document cannot be edited here.'
    : props.submit === undefined
      ? 'This editor was mounted without a submit handler, so there is nowhere to send the words.'
      : undefined;
  const canSubmit = disabledReason === undefined;
  /**
   * The id the disabled control is DESCRIBED BY. `useId` rather than a literal
   * because this component can be mounted more than once on a page (the
   * composer appears in the sheet and in the comment thread) and a shared id
   * would point every instance at the first one's sentence.
   */
  const disabledReasonId = useId();

  const autoFocus = props.autoFocus ?? false;
  useEffect(() => {
    if (!ready || !autoFocus) return;
    editorRef.current?.commands.focus('end');
    // `ready` flips in a later commit than the child's editorRef effect, so the
    // ref is populated by the time this runs.
  }, [ready, autoFocus, editorRef]);

  async function handleSubmit(doc?: DocJson): Promise<void> {
    const editor = editorRef.current;
    const submit = props.submit;
    if (!editor || submittingRef.current || submit === undefined || props.readOnly) return;
    // NOTE MODE SUBMITS NOTHING. The narrowing is the point of reading `mode`
    // here rather than casting at the call below: `composeEditorSubmission`
    // maps a mode to a ledger EVENT, and note mode has no such event — its
    // writes are the host's autosave, not this slot's submission. A cast would
    // let a future caller produce `note.body_set` through a function that
    // never meant to write one.
    if (props.mode === 'note') return;
    const currentDoc = doc ?? (editor.getJSON() as DocJson);
    submittingRef.current = true;
    setSubmitting(true);
    try {
      // V7 — THE SIGNAL, NOT THE ABSENCE OF AN EXCEPTION. `await submit(...)`
      // resolving used to be read as "the claim landed", and a REFUSAL resolves:
      // `TicketSheet.submitComment` records the server's answer in
      // `serverRefusal` and returns normally. So a refused comment cleared the
      // composer and the author lost what they had written — the exact outcome
      // the paragraph below promises cannot happen. "No exception" is not "the
      // server accepted it" anywhere else in this codebase, and it is not here.
      const accepted = await submit(composeEditorSubmission(props.mode, currentDoc));
      if (!accepted) {
        // The server answered and did not accept, or never answered at all. Both
        // keep the words; neither is a reason to fire `onDone`, because nothing
        // was done.
        return;
      }
      if (props.mode === 'comment') {
        // The claim landed and the composer resets for the next one. Only
        // comment mode clears: a description is now the saved value, and
        // wiping it would show the user an empty field they did not empty.
        editor.commands.setContent(emptyDoc(), { emitUpdate: false });
      }
      props.onDone?.();
    } catch (err) {
      // A rejected claim must never cost the user their words either. The clear
      // lives INSIDE the try, after the await, so a rejection skips it — and
      // onDone does not fire, because nothing was done. (This paragraph used to
      // say "a REFUSED claim", which was wrong in the direction the whole fix is
      // about: a refusal RESOLVED, so it never reached here at all.)
      props.onError?.(err);
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  // No uploader wired: say so and refuse. Returning a fabricated result would
  // put an attachmentId in the document for bytes nobody holds.
  async function uploadOrRefuse(file: File): Promise<UploadResult> {
    const upload = props.uploadAttachment;
    if (upload === undefined) {
      throw new Error('Attachments are unavailable here — this editor was mounted without an uploader.');
    }
    return upload(file);
  }

  // One reading of `mode`, taken once and used by every place below that has to
  // know which writing surface this is. `mode` is the shared declaration's
  // discriminator, so a host cannot mount a description composer that calls
  // itself a comment.
  const isComment = props.mode === 'comment';
  // NOTE MODE (Plan 4 Task 8): a document that saves itself. It has no submit
  // control because there is no event to submit, and it draws no Markdown hint
  // because the hint describes syntax for a composer whose submission the
  // reader is choosing to make.
  //
  // ⚠ `onDraft` IS THE DURABLE PATH, NOT `onSave`, and an earlier version of
  // this comment said the opposite ("a debounced write through `onSave`").
  // `onSave` fires on BLUR and the toolbar makes the difference concrete:
  // mousedown on a control moves focus out — so `onSave` fires carrying the
  // document as it was BEFORE the click — and the command then mutates the
  // document, which reaches the host as `onDraft` and never as a second
  // `onSave`. A host that wrote ONLY on `onSave` would lose the last change
  // made with a toolbar button, and would lose it silently: no blur follows a
  // tab close. Raised for Plan 5, which owns the debounce.
  const isNote = props.mode === 'note';

  return (
    // The mode modifier is for the stylesheet, not for the reader: the comment
    // composer's field is three rows where the description's is five, and only
    // the shell that already knows `mode` can say which is being mounted
    // (`editor.css`, `.editor-slot--comment .ticket-editor__content`).
    <div
      className={
        isNote
          ? 'editor-slot editor-slot--note'
          : isComment
            ? 'editor-slot editor-slot--comment'
            : 'editor-slot editor-slot--description'
      }
      // `onSave` ON BLUR, and React's `onBlur` is `focusout` — it bubbles, so
      // clicking the toolbar counts as leaving the field. That is the right
      // reading of "on blur" for a composer whose chrome is part of itself:
      // the reader has stopped typing either way.
      {...(isNote
        ? { onBlur: (): void => props.onSave?.(editorRef.current?.getJSON() ?? null) }
        : {})}
    >
      <TicketEditor
        initialDoc={initialDoc}
        editable={!props.readOnly}
        // The accessible name, off the one prop that already knows which
        // writing surface this is. Deriving it here rather than taking it from
        // the contract is deliberate: `mode` is already the shared declaration's
        // discriminator, so a host cannot mount a description composer that
        // calls itself a comment, and no new field has to travel through
        // app-core to say what `mode` has said all along.
        label={isComment ? 'Comment' : 'Description'}
        // Passed straight through. When the host points at a visible caption,
        // that wins in `TicketEditor` and the `label` above is not rendered at
        // all — so a mount that supplies both gets one name, from the caption.
        {...(props.labelledBy === undefined ? {} : { labelledBy: props.labelledBy })}
        placeholder={props.placeholder ?? (isComment ? 'Write a comment…' : 'Describe this ticket…')}
        queryUsers={props.queryUsers ?? NO_MENTIONS}
        // The wiki-link four, passed through CONDITIONALLY. Unlike `queryUsers`
        // there is no `NO_NOTES` fallback worth naming: the editor's own
        // `addOptions` already answers `[]`, and an explicit `undefined` here
        // would read as "the host supplied no resolver" for the other three —
        // which is why absence, not a stand-in, is what travels.
        {...(props.queryNotes === undefined ? {} : { queryNotes: props.queryNotes })}
        {...(props.resolveNoteTitle === undefined
          ? {}
          : { resolveNoteTitle: props.resolveNoteTitle })}
        {...(props.previewNote === undefined ? {} : { previewNote: props.previewNote })}
        {...(props.onNavigateNote === undefined
          ? {}
          : { onNavigateNote: props.onNavigateNote })}
        uploadAttachment={uploadOrRefuse}
        // The host owns event emission. Non-image uploads reach the ticket's
        // attachment list the same way — through this event and the ledger —
        // which is why there is no onFileAttached here to hold list state the
        // sheet already rebuilds from its own projection.
        onAttachmentAdded={props.emitAttachmentAdded ?? NO_EMIT}
        onUploadError={(err) => props.onError?.(err)}
        // `onSubmit` IS NOT WIRED IN NOTE MODE — there is no submit — and
        // `onDocChange` is wired to `onDraft` instead, which is the same
        // editor event read for a different purpose.
        onSubmit={(doc) => void handleSubmit(doc)}
        /*
          13.1365 — the document as it stands, for a host that will submit it
          LATER. `TicketEditor` wires this to ProseMirror's `onUpdate` and to
          nothing else, so an untouched composer reports nothing at all — which
          is what lets the create dialog read "never reported" as "no
          description" rather than having to tell an empty document from an
          untyped one.

          ⚠ THIS IS NOT A STRAIGHT PASS-THROUGH: IT ROUTES BY MODE, and the
          sentence that used to stand here ("the slot adds no policy of its
          own") was true only until note mode reached this same prop.
          `TicketEditor` has ONE `onDocChange` and two features now read it:
          the create dialog composes a description for a ticket that does not
          exist yet (13.1365), and note mode autosaves through `onDraft`
          (9.291) — its ONLY durable path, because a note has no submit control
          to carry a change out. Wiring either one alone breaks the other
          feature SILENTLY: a note loses its last edit, or a description never
          leaves the composer.

          So `mode` — already this contract's discriminator, and already what
          picks the label, the placeholder and the footer's sentence — picks
          the channel. The policy is one decision wide: note → `onDraft`,
          everything else → `onChange`. Both channels stay optional and neither
          is defaulted, so a mount that supplies only one is unaffected by the
          other's existence.
        */
        {...(isNote
          ? { onDocChange: (doc: DocJson): void => props.onDraft?.(doc) }
          : { onDocChange: (doc: DocJson): void => props.onChange?.(doc) })}
        onEditorReady={() => setReady(true)}
        editorRef={editorRef}
        /*
          ⚠ THE PROMPT'S OWN HINT LINE IS SUPPRESSED HERE, and the footer below
          is what draws it instead.

          `TicketEditor` renders toolbar → content → hint, so a slot that drew
          the hint in a footer of its own WITHOUT this prop would print the
          sentence twice: once under the field and once in the footer. The slot
          is the one place that knows the chrome has moved, so it is the one
          place that can say so — hence a prop rather than an inference. Its
          default is `'below'`, which keeps every other mount of `TicketEditor`
          (the desktop app's, and `ticket-editor.test.tsx`'s) identical to what
          it was.
        */
        hintSlot="none"
      />
      <div className="editor-slot__footer">
        {/*
          THE LEFT OF THE FOOTER IS A SLOT, and WHICH SENTENCE FILLS IT IS THE
          WHOLE OF THE `footerNote` CONTRACT. The prototype draws a hint in both
          composers (`desktop.dc.html:1173`, `:1329`) and they are DIFFERENT
          sentences: the description box explains Markdown, the comment box
          promises what posting does. So the two modes do not share one hint —
          comment mode takes the host's sentence, description mode keeps the
          Markdown hint, and neither mode draws both.

          A comment composer with no `footerNote` gets an EMPTY paragraph rather
          than the Markdown hint: silently substituting the other composer's
          sentence would tell a commenter that `**bold**` works when the product
          has not said so for that surface, and the empty slot is the honest
          reading of "the host supplied nothing".
        */}
        <p className="editor-slot__hint">
          {/* Note mode draws NO hint, and like the comment composer's empty
              paragraph that is the honest reading rather than a saving: the
              Markdown hint explains a syntax, and a note saves itself. */}
          {isNote ? '' : isComment ? (props.footerNote ?? '') : props.readOnly ? '' : MARKDOWN_HINT}
        </p>
        {/* NOTE MODE HAS NO SUBMIT CONTROL. There is no event for it to write:
            `onDraft` already carries every change and `onSave` the blur, so a
            button would promise a commit the host has not asked for and cannot
            name. The save state takes its place in the same row. */}
        {/* ⚠ THE OUTER TEST IS `isNote` ALONE, and the first cut had it as
            `isNote && props.saveState !== undefined`. That put the submit
            BUTTON in note mode's else arm, so a note mount that supplied no
            saveState — the very case the inner test exists for — got the
            control note mode is defined by NOT having. 9.291 passes
            `saveState: 'saved'` and could not see it; 9.299 now asserts the
            button's absence. NESTED, not conjoined.

            ⚠ THIS TERNARY NOW CARRIES A THIRD GATE — `submitSlot`, 13.1365b —
            so read the whole chain as: note mode answers with its save state
            and NEVER a button; every other mode answers with a button unless
            the mount asked for none. The nesting is what keeps both true at
            once, and `isNote` must stay OUTERMOST: conjoining any later gate
            into it would hand the button back to the note mount that gate
            excludes, which is exactly the defect this note records. */}
        {/*
          ⚠ `submitSlot: 'none'` OMITS THE BUTTON AND NOT THE FOOTER, and the
          split is the point rather than a leftover: the footer's LEFT half is
          the hint sentence, which the caller above still wants (13.1365b
          asserts the footer survives). Removing the whole row would have been
          the shorter edit and would have taken a sentence with it that has
          nothing to do with who publishes the claim.

          The `disabledReason` machinery below is deliberately NOT gated on this
          prop. It is computed from `readOnly`/`submit`, and the span that
          carries it is rendered only when there is a control to be described —
          so with no button the span would be an orphan, and it is left to the
          `disabledReason !== undefined &&` condition it already has: a
          `submitSlot: 'none'` mount that also supplies no `submit` renders the
          hidden span for a control that is not there. Harmless (a hidden,
          unreferenced sentence) and NOT worth a third condition, but stated
          here so the next reader does not read the span as evidence the button
          exists somewhere they cannot see.
        */}
        {isNote ? (
          // NO DEFAULT ARM. `saved` was the first cut's fallback and it is the
          // one value that makes a CLAIM — the host has said nothing, and a
          // footer reading "Saved" asserts a write that may not exist. Silence
          // is the honest report of silence.
          props.saveState === undefined ? null : (
            <span className="editor-slot__save-state" data-testid="editor-save-state">
              {SAVE_STATE_TEXT[props.saveState]}
            </span>
          )
        ) : props.submitSlot === 'none' ? null : (
        <button
          type="button"
          className="editor-slot__submit"
          disabled={submitting || !canSubmit}
          title={disabledReason}
          /*
            THE REASON, REACHABLE. A `disabled` button is removed from the focus
            order, so a `title` on it is spoken to nobody: the explanation reached
            a mouse user who happened to hover, and stopped there. The `title`
            stays for that reader, and `aria-describedby` points at the hidden
            span below so the same sentence is attached to the control wherever
            the control is reached — a screen reader's element list, a form
            summary — rather than only on hover.
          */
          aria-describedby={disabledReason === undefined ? undefined : disabledReasonId}
          onClick={() => void handleSubmit()}
        >
          {/* The prototype's word for this control (`:1330`). A LABEL change
              only: `handleSubmit` and the event it composes are untouched. */}
          {isComment ? 'Post' : 'Save description'}
        </button>
        )}
      </div>
      {disabledReason !== undefined && (
        <span
          id={disabledReasonId}
          /*
            Visually hidden, inline — the recipe `apps/web/src/route-announcer.tsx`
            carries, reused rather than re-invented, because this product has no
            `sr-only`-style utility to hand: the one it had was cut as YAGNI when
            `aria-label` replaced the mechanism it was written for.
          */
          style={{
            position: 'absolute',
            width: 1,
            height: 1,
            margin: -1,
            padding: 0,
            border: 0,
            overflow: 'hidden',
            clipPath: 'inset(50%)',
            whiteSpace: 'nowrap',
          }}
        >
          {disabledReason}
        </span>
      )}
    </div>
  );
}
