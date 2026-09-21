import { useEffect, useRef, useState } from 'react';
import type { Editor } from '@tiptap/core';
import { emptyDoc, isDocJson, type DocJson } from '../doc.js';
import type { MentionCandidate } from '../extensions/mention.js';
import type { UploadResult } from '../upload.js';
import { composeEditorSubmission, type EditorSubmission } from '../attachments/compose-editor-submission.js';
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
  mode: 'comment' | 'description';
  /** ProseMirror JSON, opaque to the caller; anything that is not a document → empty composer. */
  doc: unknown;
  readOnly: boolean;
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
  placeholder?: string;
  autoFocus?: boolean;
  // Editor capabilities. Optional in the shared declaration because Plan 6's
  // read-only PlainTextEditorSlot supplies none of them. This component STATES
  // the gap rather than pretending: without `submit` the submit button is
  // disabled and says why; without `uploadAttachment` a pasted file is refused
  // through onError instead of being silently swallowed.
  queryUsers?: (query: string) => Promise<MentionCandidate[]>;
  uploadAttachment?: (file: File) => Promise<EditorSlotUpload>;
  emitAttachmentAdded?: (uploaded: EditorSlotUpload) => Promise<void>;
  submit?: (submission: EditorSubmission) => Promise<void>;
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
    const currentDoc = doc ?? (editor.getJSON() as DocJson);
    submittingRef.current = true;
    setSubmitting(true);
    try {
      await submit(composeEditorSubmission(props.mode, currentDoc));
      if (props.mode === 'comment') {
        // The claim landed and the composer resets for the next one. Only
        // comment mode clears: a description is now the saved value, and
        // wiping it would show the user an empty field they did not empty.
        editor.commands.setContent(emptyDoc(), { emitUpdate: false });
      }
      props.onDone?.();
    } catch (err) {
      // A refused claim must never cost the user their words. The clear lives
      // INSIDE the try, after the await, so a rejection skips it — and onDone
      // does not fire, because nothing was done.
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

  return (
    <div className="editor-slot">
      <TicketEditor
        initialDoc={initialDoc}
        editable={!props.readOnly}
        // The accessible name, off the one prop that already knows which
        // writing surface this is. Deriving it here rather than taking it from
        // the contract is deliberate: `mode` is already the shared declaration's
        // discriminator, so a host cannot mount a description composer that
        // calls itself a comment, and no new field has to travel through
        // app-core to say what `mode` has said all along.
        label={props.mode === 'comment' ? 'Comment' : 'Description'}
        placeholder={props.placeholder ?? (props.mode === 'comment' ? 'Write a comment…' : 'Describe this ticket…')}
        queryUsers={props.queryUsers ?? NO_MENTIONS}
        uploadAttachment={uploadOrRefuse}
        // The host owns event emission. Non-image uploads reach the ticket's
        // attachment list the same way — through this event and the ledger —
        // which is why there is no onFileAttached here to hold list state the
        // sheet already rebuilds from its own projection.
        onAttachmentAdded={props.emitAttachmentAdded ?? NO_EMIT}
        onUploadError={(err) => props.onError?.(err)}
        onSubmit={(doc) => void handleSubmit(doc)}
        onEditorReady={() => setReady(true)}
        editorRef={editorRef}
      />
      <button
        type="button"
        className="editor-slot__submit"
        disabled={submitting || !canSubmit}
        title={disabledReason}
        onClick={() => void handleSubmit()}
      >
        {props.mode === 'comment' ? 'Comment' : 'Save description'}
      </button>
    </div>
  );
}
