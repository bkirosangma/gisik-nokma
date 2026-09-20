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
