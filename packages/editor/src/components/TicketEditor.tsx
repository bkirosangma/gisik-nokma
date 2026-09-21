import { useEffect, useMemo, useRef, useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import type { Editor } from '@tiptap/core';
import { Extension } from '@tiptap/core';
import { buildEditorExtensions } from '../schema/extensions.js';
import { createAttachmentPasteExtension } from '../extensions/attachment-paste.js';
import type { MentionCandidate } from '../extensions/mention.js';
import { emptyDoc, type DocJson } from '../doc.js';
import type { UploadResult } from '../upload.js';
import { ImageWrapMenu } from './ImageWrapMenu.js';
import { UploadChips } from './UploadChips.js';
import { EditorToolbar, MARKDOWN_HINT } from './EditorToolbar.js';

export type TicketEditorProps = {
  initialDoc?: DocJson | null;
  editable?: boolean;
  placeholder?: string;
  queryUsers(query: string): Promise<MentionCandidate[]>;
  uploadAttachment(file: File): Promise<UploadResult>;
  /** Emit attachment.added — runs after upload, before any node insertion. */
  onAttachmentAdded(result: UploadResult): Promise<void> | void;
  /** A non-image upload finished: show it in the ticket's attachment list. */
  onFileAttached?(result: UploadResult): void;
  onUploadError?(err: unknown): void;
  onDocChange?(doc: DocJson): void;
  /** Mod-Enter. */
  onSubmit?(doc: DocJson): void;
  onEditorReady?(): void;
  resolveAttachmentUrl?(attachmentId: string): string;
  /** RN webview: the host takes pasted/dropped files (posts requestUpload). */
  captureFiles?: (files: File[]) => boolean;
  /** Imperative access for tests and the webview bridge. */
  editorRef?: React.MutableRefObject<Editor | null>;
  /**
   * The composer's accessible name (WCAG 4.1.2). Tiptap's own `editorProps`
   * give the host `role="textbox"` and nothing else, so without this a screen
   * reader announces the sheet's description *and* its comment composer as bare
   * "edit text, multiline" with no way to tell which is which (exec4 E4-4 /
   * exec1 P21). The name is the caller's — only the caller knows whether this
   * mount is the description or the comment.
   */
  label?: string;
  /**
   * The `id` of a visible element whose words name this composer — exec1 P21.
   * Beats `label` when both are given, because it points at the words rather
   * than copying them; see the docblock at the host attribute below.
   */
  labelledBy?: string;
};

export function TicketEditor(props: TicketEditorProps): React.JSX.Element {
  const [chips, setChips] = useState<ReadonlyMap<string, string>>(new Map());

  // Stable refs for every callback so the editor never re-initialises when
  // a parent re-renders (knowledge-base lesson: Tiptap snapshots options).
  const propsRef = useRef(props);
  useEffect(() => {
    propsRef.current = props;
  });

  const extensions = useMemo(
    () => [
      ...buildEditorExtensions({
        queryUsers: (query) => propsRef.current.queryUsers(query),
        resolveAttachmentUrl:
          props.resolveAttachmentUrl ?? ((attachmentId) => `/v1/attachments/${attachmentId}`),
        ...(props.placeholder === undefined ? {} : { placeholder: props.placeholder }),
      }),
      createAttachmentPasteExtension({
        uploadAttachment: (file) => propsRef.current.uploadAttachment(file),
        onAttachmentAdded: (result) => propsRef.current.onAttachmentAdded(result),
        onFileAttached: (result) => propsRef.current.onFileAttached?.(result),
        onUploadError: (err) => propsRef.current.onUploadError?.(err),
        onUploadStart: (id, filename) => setChips((prev) => new Map(prev).set(id, filename)),
        onUploadEnd: (id) =>
          setChips((prev) => {
            const next = new Map(prev);
            next.delete(id);
            return next;
          }),
        captureFiles: (files) => propsRef.current.captureFiles?.(files) ?? false,
      }),
      Extension.create({
        name: 'submitShortcut',
        addKeyboardShortcuts() {
          return {
            'Mod-Enter': () => {
              propsRef.current.onSubmit?.(this.editor.getJSON() as DocJson);
              return true;
            },
          };
        },
      }),
    ],
    // Extensions are created exactly once; everything dynamic reads propsRef.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // Bound once so the editor's own `editable` and the chrome's cannot disagree
  // about whether this composer may be typed into.
  const editable = props.editable ?? true;

  const editor = useEditor({
    immediatelyRender: false, // SSR: render only after hydration (knowledge-base lesson)
    extensions,
    content: props.initialDoc ?? emptyDoc(),
    editable,
    // The host's own attributes.
    //
    // ## `role` is spelled here, and it is NOT redundant
    //
    // Tiptap merges its own default into these attributes — but in exactly ONE
    // place, `createView` (@tiptap/core dist/index.js): it builds the view with
    // `attributes: { role: 'textbox', ...editorProps.attributes }`. Every LATER
    // option change goes through `setOptions`, which calls
    // `this.view.setProps(this.options.editorProps)` with the attributes RAW —
    // no merge — and ProseMirror's `setProps` then REMOVES any attribute present
    // in the old set and absent from the new one. So the moment this object
    // exists at all, a re-render drops `role="textbox"` from the live host and
    // the composer stops being exposed as a textbox to assistive tech.
    //
    // MEASURED, not reasoned: the first cut of this change omitted the role and
    // `getAllByRole('textbox')` returned ZERO over two mounted composers, while
    // `.ProseMirror` still matched. A re-render is not hypothetical here — the
    // arrow functions above (`onCreate`, `onUpdate`) are new on every render, so
    // `useEditor`'s `compareOptions` finds a difference and calls `setOptions`
    // every time. That is also why the role cannot be left to the default.
    //
    // `aria-multiline` is unconditional — this is a multiline composer whether
    // or not it may currently be typed into, and a read-only one is still
    // announced as one. `aria-label` is omitted rather than set to the empty
    // string when the caller named nothing: an empty `aria-label` is a NAME of
    // zero characters, which is a labelled-but-silent field, not an unnamed one.
    editorProps: {
      attributes: {
        role: 'textbox',
        'aria-multiline': 'true',
        // TWO ways to be named, and they are MUTUALLY EXCLUSIVE on the host
        // rather than a fallback chain, because `aria-labelledby` wins the
        // accessible-name computation anyway: emitting both would put a second,
        // silently-ignored copy of the words in the DOM for the next reader to
        // find and trust.
        //
        // `labelledBy` points at the caption a sighted reader can see, so there
        // is ONE source for the words (exec1 P21 — the description row's `<dt>`).
        // `label` supplies words where no visible caption exists (the comment
        // composer). Neither given → the host stays honestly unnamed rather than
        // carrying an EMPTY `aria-label`, which is a name of zero characters: a
        // labelled-but-silent field, the opposite of the gap.
        ...(props.labelledBy === undefined
          ? props.label === undefined
            ? {}
            : { 'aria-label': props.label }
          : { 'aria-labelledby': props.labelledBy }),
      },
    },
    onCreate: () => {
      propsRef.current.onEditorReady?.();
    },
    onUpdate: ({ editor: ed }) => {
      propsRef.current.onDocChange?.(ed.getJSON() as DocJson);
    },
  });

  useEffect(() => {
    if (!props.editorRef) return;
    props.editorRef.current = editor;
    return () => {
      if (props.editorRef) props.editorRef.current = null;
    };
  }, [editor, props.editorRef]);

  return (
    <div className="ticket-editor">
      {/* The formatting strip, ABOVE the content and sharing its top corners —
          the prototype's own order (`desktop.dc.html:1166-1172`: the strip, then
          the textarea, then the hint). It renders nothing when the editor is
          read-only: `editable` is `false` for a viewer who may not write, and a
          toolbar of commands that would each be refused is chrome for a door
          that is shut. */}
      <EditorToolbar editor={editor} editable={editable} />
      <EditorContent editor={editor} className="ticket-editor__content" />
      {/* The prototype's hint line, BELOW the field (`:1173`) and outside the
          strip, so the two keep the prototype's geometry rather than being one
          block. Gated with the strip and for the same reason: it explains what
          typing `**bold**` does HERE, which is a sentence addressed to someone
          who can type, and a read-only composer has nobody to address. */}
      {editable ? <p className="ticket-editor__hint">{MARKDOWN_HINT}</p> : null}
      <UploadChips chips={chips} />
      <ImageWrapMenu editor={editor} />
    </div>
  );
}
