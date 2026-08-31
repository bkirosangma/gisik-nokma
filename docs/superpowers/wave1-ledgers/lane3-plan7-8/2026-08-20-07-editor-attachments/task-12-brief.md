### Task 12: `TicketEditor` — the shared React component, paste/drop uploads (layer 2), chips, and the wrap menu

**Files:**
- Create: `packages/editor/src/upload.ts`
- Create: `packages/editor/src/extensions/attachment-paste.ts`
- Create: `packages/editor/src/components/UploadChips.tsx`
- Create: `packages/editor/src/components/ImageWrapMenu.tsx`
- Create: `packages/editor/src/components/TicketEditor.tsx`
- Modify: `packages/editor/src/styles/editor.css`
- Modify: `packages/editor/src/index.ts` (exports)
- Test: `packages/editor/test/attachment-paste.test.ts`
- Test: `packages/editor/test/ticket-editor.test.tsx`

**Interfaces:**
- Consumes: `buildEditorExtensions`, `emptyDoc`, `DocJson` (Task 1); `isEmbeddableImageMime` (Task 2); `insertTicketImage`, `IMAGE_WRAP_MODES` (Task 3); `MentionCandidate` (Task 4); the upload endpoint's response shape (Task 9).
- Produces (cross-plan API):
  - `type UploadResult = { attachmentId: string; url: string; mime: string; filename: string; size: number; sha256: string }` — exactly the upload endpoint's 201 body, `sha256` included (Task 9a, which executes before this task).
  - `uploadAttachmentHttp(file: File, ticketId: string, fetchImpl?: typeof fetch): Promise<UploadResult>`; `class UploadRefusedError extends Error { readonly status: number }`.
  - `createAttachmentPasteExtension(options: AttachmentPasteOptions): Extension` with `type AttachmentPasteOptions = { uploadAttachment(file: File): Promise<UploadResult>; onAttachmentAdded(result: UploadResult): Promise<void> | void; onFileAttached(result: UploadResult): void; onUploadError(err: unknown): void; onUploadStart(uploadId: string, filename: string): void; onUploadEnd(uploadId: string): void; captureFiles?: (files: File[]) => boolean }`.
  - `function TicketEditor(props: TicketEditorProps): React.JSX.Element` with `type TicketEditorProps = { initialDoc?: DocJson | null; editable?: boolean; placeholder?: string; queryUsers(query: string): Promise<MentionCandidate[]>; uploadAttachment(file: File): Promise<UploadResult>; onAttachmentAdded(result: UploadResult): Promise<void> | void; onFileAttached?(result: UploadResult): void; onUploadError?(err: unknown): void; onDocChange?(doc: DocJson): void; onSubmit?(doc: DocJson): void; onEditorReady?(): void; resolveAttachmentUrl?(attachmentId: string): string; captureFiles?: (files: File[]) => boolean; editorRef?: React.MutableRefObject<Editor | null> }`.
  - `function ImageWrapMenu(props: { editor: Editor | null }): React.JSX.Element | null` — wrap picker + alt input shown while an image node is selected.
  - Upload flow contract (spec §2 / scope item 6): **optimistic placeholder** = an uploading chip in the UI chrome — never a doc node, because a doc node could be submitted mid-flight as if the claim were settled (the board must not lie) → `POST /v1/attachments` → **`attachment.added` emitted via `onAttachmentAdded`** → only then the image node inserts (image case) with wrap `block` and the wrap menu available; non-image results go to `onFileAttached` (list only); failure = chip ends, `onUploadError`, document untouched.
  - BEM classes `ticket-editor`, `ticket-editor__content`, `upload-chips`, `upload-chips__chip`, `image-wrap-menu`, `image-wrap-menu__option`, `image-wrap-menu__option--active`, `image-wrap-menu__alt`.

- [ ] **Step 1: Write the failing paste/drop tests (plugin props invoked directly — synthetic `dispatchEvent` does not reach ProseMirror plugins in jsdom)**

`packages/editor/test/attachment-paste.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import type { Editor } from '@tiptap/core';
import { Editor as CoreEditor } from '@tiptap/core';
import { buildEditorExtensions } from '../src/schema/extensions.js';
import { createAttachmentPasteExtension, type AttachmentPasteOptions } from '../src/extensions/attachment-paste.js';
import type { UploadResult } from '../src/upload.js';

const PNG_RESULT: UploadResult = {
  attachmentId: '01J9GATA000000000000000000',
  url: '/v1/attachments/01J9GATA000000000000000000',
  mime: 'image/png',
  filename: 'shelf.png',
  size: 12,
  sha256: 'b'.repeat(64), // the server's hash, echoed by the client (Task 9a)
};
const PDF_RESULT: UploadResult = { ...PNG_RESULT, attachmentId: '01J9GATB000000000000000000', mime: 'application/pdf', filename: 'gst.pdf' };

function makeEditor(overrides: Partial<AttachmentPasteOptions> = {}): { editor: Editor; options: AttachmentPasteOptions; calls: string[] } {
  const calls: string[] = [];
  const options: AttachmentPasteOptions = {
    uploadAttachment: vi.fn(async () => {
      calls.push('upload');
      return PNG_RESULT;
    }),
    onAttachmentAdded: vi.fn(async () => {
      calls.push('event');
    }),
    onFileAttached: vi.fn(() => {
      calls.push('list');
    }),
    onUploadError: vi.fn(() => {
      calls.push('error');
    }),
    onUploadStart: vi.fn(() => {
      calls.push('start');
    }),
    onUploadEnd: vi.fn(() => {
      calls.push('end');
    }),
    ...overrides,
  };
  const editor = new CoreEditor({
    element: document.createElement('div'),
    extensions: [...buildEditorExtensions(), createAttachmentPasteExtension(options)],
  });
  return { editor, options, calls };
}

/** Invoke the plugin's handlePaste prop directly with a fake clipboard event. */
function paste(editor: Editor, files: File[]): boolean {
  const event = {
    clipboardData: {
      items: files.map((file) => ({ kind: 'file', type: file.type, getAsFile: () => file })),
    },
    preventDefault: vi.fn(),
  } as unknown as ClipboardEvent;
  return editor.view.someProp('handlePaste', (handler) => handler(editor.view, event, editor.state.doc.slice(0))) ?? false;
}

function hasImageNode(editor: Editor): boolean {
  let found = false;
  editor.state.doc.descendants((node) => {
    if (node.type.name === 'image') found = true;
    return !found;
  });
  return found;
}

describe('attachment paste/drop (layer 2)', () => {
  it('an image file uploads, emits attachment.added, THEN inserts the node with wrap block', async () => {
    const { editor, calls } = makeEditor();
    const file = new File([new Uint8Array(12)], 'shelf.png', { type: 'image/png' });
    expect(paste(editor, [file])).toBe(true);
    await vi.waitFor(() => {
      expect(hasImageNode(editor)).toBe(true);
    });
    // Order is the contract: chip → upload → attachment.added event → node.
    expect(calls).toEqual(['start', 'upload', 'event', 'end']);
    editor.destroy();
  });

  it('planted defect (layer 2): a non-image upload NEVER becomes a node — it goes to the list', async () => {
    const { editor, options, calls } = makeEditor({
      uploadAttachment: vi.fn(async () => {
        calls.push('upload');
        return PDF_RESULT;
      }),
    });
    const file = new File([new Uint8Array(12)], 'gst.pdf', { type: 'application/pdf' });
    expect(paste(editor, [file])).toBe(true);
    await vi.waitFor(() => {
      expect(options.onFileAttached).toHaveBeenCalledWith(PDF_RESULT);
    });
    expect(hasImageNode(editor)).toBe(false);
    expect(calls).toEqual(['start', 'upload', 'event', 'list', 'end']);
    editor.destroy();
  });

  it('failure cleanup: a refused upload reports, ends the chip, and the doc is untouched', async () => {
    const { editor, options } = makeEditor({
      uploadAttachment: vi.fn(async () => {
        throw new Error('415 from the server');
      }),
    });
    const before = editor.getJSON();
    const file = new File([new Uint8Array(4)], 'evil.exe', { type: 'application/octet-stream' });
    expect(paste(editor, [file])).toBe(true);
    await vi.waitFor(() => {
      expect(options.onUploadError).toHaveBeenCalled();
    });
    expect(options.onUploadEnd).toHaveBeenCalled();
    expect(options.onAttachmentAdded).not.toHaveBeenCalled();
    expect(editor.getJSON()).toEqual(before);
    editor.destroy();
  });

  it('captureFiles short-circuits: the host takes the files, nothing uploads here', () => {
    const captureFiles = vi.fn(() => true);
    const { editor, options } = makeEditor({ captureFiles });
    const file = new File([new Uint8Array(4)], 'a.png', { type: 'image/png' });
    expect(paste(editor, [file])).toBe(true);
    expect(captureFiles).toHaveBeenCalledWith([file]);
    expect(options.uploadAttachment).not.toHaveBeenCalled();
    editor.destroy();
  });

  it('a paste with no files is left to other handlers', () => {
    const { editor } = makeEditor();
    const event = { clipboardData: { items: [] }, preventDefault: vi.fn() } as unknown as ClipboardEvent;
    const handled = editor.view.someProp('handlePaste', (handler) => handler(editor.view, event, editor.state.doc.slice(0)));
    expect(handled ?? false).toBe(false);
    editor.destroy();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @gisik-nokma/editor exec vitest run test/attachment-paste.test.ts`
Expected: FAIL — modules do not exist.

- [ ] **Step 3: Implement upload.ts and the paste extension**

`packages/editor/src/upload.ts`:

```ts
/** Exactly the upload endpoint's 201 body — the server-sniffed truth. */
export type UploadResult = {
  attachmentId: string;
  url: string;
  mime: string;
  filename: string;
  size: number;
  /** The server's SHA-256 of the stored bytes (Task 9a) — echoed, never recomputed here. */
  sha256: string;
};

export class UploadRefusedError extends Error {
  constructor(
    public readonly status: number,
    reason: string,
  ) {
    super(reason);
    this.name = 'UploadRefusedError';
  }
}

/**
 * POST a file to /v1/attachments. Clients MUST build their subsequent
 * attachment.added event from this answer — the server's sniffed mime and
 * measured size — never from the local File object, whose claims are
 * exactly what the server refused to trust.
 */
export async function uploadAttachmentHttp(
  file: File,
  ticketId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<UploadResult> {
  const form = new FormData();
  form.append('ticketId', ticketId); // field parts must precede the file part
  form.append('file', file, file.name);
  const response = await fetchImpl('/v1/attachments', {
    method: 'POST',
    body: form,
    credentials: 'include',
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { reason?: string } | null;
    throw new UploadRefusedError(response.status, body?.reason ?? `upload refused (${response.status})`);
  }
  return (await response.json()) as UploadResult;
}
```

`packages/editor/src/extensions/attachment-paste.ts`:

```ts
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import { isEmbeddableImageMime } from '@gisik-nokma/domain';
import type { UploadResult } from '../upload.js';

export type AttachmentPasteOptions = {
  uploadAttachment(file: File): Promise<UploadResult>;
  /** Called after a successful upload, BEFORE any node insertion — the host emits attachment.added here (spec upload flow). */
  onAttachmentAdded(result: UploadResult): Promise<void> | void;
  /** Non-image uploads: list attachments only, never nodes (layer 2). */
  onFileAttached(result: UploadResult): void;
  onUploadError(err: unknown): void;
  onUploadStart(uploadId: string, filename: string): void;
  onUploadEnd(uploadId: string): void;
  /** When present and returning true, the host owns the files (RN webview posts requestUpload). */
  captureFiles?: (files: File[]) => boolean;
};

export const attachmentPasteKey = new PluginKey('attachmentPaste');

function extractFiles(dataTransfer: { items: ArrayLike<{ kind: string; getAsFile(): File | null }> }): File[] {
  const files: File[] = [];
  for (const item of Array.from(dataTransfer.items)) {
    if (item.kind !== 'file') continue;
    const file = item.getAsFile();
    if (file) files.push(file);
  }
  return files;
}

async function handleFile(file: File, view: EditorView, options: AttachmentPasteOptions): Promise<void> {
  // The optimistic placeholder is UI chrome (a chip), never a doc node: a
  // node could ride a submit mid-upload and land an unfinished claim.
  const uploadId = `${Date.now()}-${file.name}`;
  options.onUploadStart(uploadId, file.name);
  try {
    const result = await options.uploadAttachment(file);
    await options.onAttachmentAdded(result); // the claim precedes the picture
    if (isEmbeddableImageMime(result.mime)) {
      const imageType = view.state.schema.nodes.image;
      if (imageType) {
        const node = imageType.create({ attachmentId: result.attachmentId, wrap: 'block', alt: result.filename });
        view.dispatch(view.state.tr.replaceSelectionWith(node));
      }
    } else {
      options.onFileAttached(result);
    }
  } catch (err) {
    // Failure cleanup: nothing was inserted, so cleanup is ending the chip
    // and reporting — the document never contained the unfinished claim.
    options.onUploadError(err);
  } finally {
    options.onUploadEnd(uploadId);
  }
}

export function createAttachmentPasteExtension(options: AttachmentPasteOptions): Extension {
  return Extension.create({
    name: 'attachmentPaste',
    addProseMirrorPlugins() {
      return [
        new Plugin({
          key: attachmentPasteKey,
          props: {
            handlePaste(view, event) {
              const dt = event.clipboardData;
              if (!dt) return false;
              const files = extractFiles(dt);
              if (files.length === 0) return false;
              event.preventDefault();
              if (options.captureFiles?.(files)) return true;
              for (const file of files) void handleFile(file, view, options);
              return true;
            },
            handleDrop(view, event) {
              const dt = event.dataTransfer;
              if (!dt) return false;
              const files = extractFiles(dt);
              if (files.length === 0) return false;
              event.preventDefault();
              try {
                const pos = view.posAtCoords({ left: event.clientX, top: event.clientY });
                if (pos) {
                  const $pos = view.state.doc.resolve(pos.pos);
                  view.dispatch(view.state.tr.setSelection(TextSelection.near($pos)));
                }
              } catch {
                // Headless/jsdom: no layout — drop at the current selection.
              }
              if (options.captureFiles?.(files)) return true;
              for (const file of files) void handleFile(file, view, options);
              return true;
            },
          },
        }),
      ];
    },
  });
}
```

Run the paste suite again — expected: PASS (5 tests).

- [ ] **Step 4: Write the failing component test**

`packages/editor/test/ticket-editor.test.tsx`:

```tsx
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useRef } from 'react';
import type { Editor } from '@tiptap/core';
import { TicketEditor, type TicketEditorProps } from '../src/components/TicketEditor.js';
import { emptyDoc, type DocJson } from '../src/doc.js';

const IMG = '01J9GATA000000000000000000';

function makeProps(overrides: Partial<TicketEditorProps> = {}): TicketEditorProps {
  return {
    queryUsers: async () => [],
    uploadAttachment: vi.fn(async () => ({ attachmentId: IMG, url: `/v1/attachments/${IMG}`, mime: 'image/png', filename: 'a.png', size: 1, sha256: 'd'.repeat(64) })),
    onAttachmentAdded: vi.fn(),
    ...overrides,
  };
}

function Harness({ props, editorRef }: { props: TicketEditorProps; editorRef: React.MutableRefObject<Editor | null> }) {
  const ref = useRef<Editor | null>(null);
  // Bridge the outer ref so tests can drive the editor imperatively.
  return (
    <TicketEditor
      {...props}
      editorRef={editorRef}
      onEditorReady={() => {
        ref.current = editorRef.current;
        props.onEditorReady?.();
      }}
    />
  );
}

async function mount(props: TicketEditorProps) {
  const editorRef: React.MutableRefObject<Editor | null> = { current: null };
  const ready = vi.fn();
  const view = render(<Harness props={{ ...props, onEditorReady: ready }} editorRef={editorRef} />);
  await vi.waitFor(() => {
    expect(ready).toHaveBeenCalled();
    expect(editorRef.current).not.toBeNull();
  });
  return { view, editor: editorRef.current as Editor };
}

describe('TicketEditor', () => {
  it('mounts (immediatelyRender: false ⇒ ready fires post-hydration) and renders initialDoc', async () => {
    const doc: DocJson = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'the description' }] }],
    };
    const { view, editor } = await mount(makeProps({ initialDoc: doc }));
    expect(view.container.querySelector('.ticket-editor')).not.toBeNull();
    expect(editor.getText()).toContain('the description');
    view.unmount();
  });

  it('onDocChange fires with the serialized doc on edits', async () => {
    const onDocChange = vi.fn();
    const { view, editor } = await mount(makeProps({ onDocChange }));
    editor.commands.insertContent('typed words');
    await vi.waitFor(() => {
      expect(onDocChange).toHaveBeenCalled();
    });
    const lastDoc = onDocChange.mock.lastCall?.[0] as DocJson;
    expect(JSON.stringify(lastDoc)).toContain('typed words');
    view.unmount();
  });

  it('Mod-Enter submits the current doc', async () => {
    const onSubmit = vi.fn();
    const { view, editor } = await mount(makeProps({ onSubmit }));
    editor.commands.insertContent('a comment');
    editor.commands.keyboardShortcut('Mod-Enter');
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(onSubmit.mock.lastCall?.[0])).toContain('a comment');
    view.unmount();
  });

  it('the wrap menu appears on image selection and rewrites the wrap attr', async () => {
    const { view, editor } = await mount(makeProps());
    editor.commands.insertTicketImage({ attachmentId: IMG, mime: 'image/png', alt: 'shelf' });
    let imagePos = -1;
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === 'image') imagePos = pos;
      return imagePos === -1;
    });
    editor.commands.setNodeSelection(imagePos);
    await vi.waitFor(() => {
      expect(view.container.querySelector('.image-wrap-menu')).not.toBeNull();
    });
    const wrapLeft = Array.from(view.container.querySelectorAll('.image-wrap-menu__option')).find(
      (el) => el.textContent === 'Wrap left',
    ) as HTMLButtonElement;
    wrapLeft.click();
    await vi.waitFor(() => {
      const json = JSON.stringify(editor.getJSON());
      expect(json).toContain('"wrap":"inline-left"');
    });
    view.unmount();
  });

  it('upload chips appear while an upload is in flight and clear after', async () => {
    let releaseUpload: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      releaseUpload = resolve;
    });
    const props = makeProps({
      uploadAttachment: vi.fn(async () => {
        await gate;
        return { attachmentId: IMG, url: `/v1/attachments/${IMG}`, mime: 'image/png', filename: 'slow.png', size: 1, sha256: 'd'.repeat(64) };
      }),
    });
    const { view, editor } = await mount(props);
    const file = new File([new Uint8Array(4)], 'slow.png', { type: 'image/png' });
    const event = {
      clipboardData: { items: [{ kind: 'file', type: 'image/png', getAsFile: () => file }] },
      preventDefault: vi.fn(),
    } as unknown as ClipboardEvent;
    editor.view.someProp('handlePaste', (handler) => handler(editor.view, event, editor.state.doc.slice(0)));
    await vi.waitFor(() => {
      expect(view.container.querySelector('.upload-chips__chip')?.textContent).toContain('slow.png');
    });
    releaseUpload();
    await vi.waitFor(() => {
      expect(view.container.querySelector('.upload-chips__chip')).toBeNull();
    });
    view.unmount();
  });
});
```

- [ ] **Step 5: Run it to verify it fails, then implement the components**

Run: `pnpm --filter @gisik-nokma/editor exec vitest run test/ticket-editor.test.tsx`
Expected: FAIL — components do not exist.

`packages/editor/src/components/UploadChips.tsx`:

```tsx
export function UploadChips({ chips }: { chips: ReadonlyMap<string, string> }): React.JSX.Element | null {
  if (chips.size === 0) return null;
  return (
    <div className="upload-chips" aria-live="polite">
      {Array.from(chips.entries()).map(([id, filename]) => (
        <div key={id} className="upload-chips__chip">
          Uploading {filename}…
        </div>
      ))}
    </div>
  );
}
```

`packages/editor/src/components/ImageWrapMenu.tsx`:

```tsx
import { useEffect, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { NodeSelection } from '@tiptap/pm/state';
import { IMAGE_WRAP_MODES, type ImageWrapMode } from '../extensions/ticket-image.js';

const WRAP_LABELS: Record<ImageWrapMode, string> = {
  'inline-left': 'Wrap left',
  'inline-right': 'Wrap right',
  block: 'Full width',
};

/** Wrap picker + alt input, shown while an image node is selected. */
export function ImageWrapMenu({ editor }: { editor: Editor | null }): React.JSX.Element | null {
  const [, force] = useState(0);
  useEffect(() => {
    if (!editor) return;
    const repaint = () => force((n) => n + 1);
    editor.on('transaction', repaint);
    return () => {
      editor.off('transaction', repaint);
    };
  }, [editor]);
  if (!editor || editor.isDestroyed) return null;
  const { selection } = editor.state;
  if (!(selection instanceof NodeSelection) || selection.node.type.name !== 'image') return null;
  const currentWrap = selection.node.attrs.wrap as ImageWrapMode;
  const alt = selection.node.attrs.alt as string;
  return (
    <div className="image-wrap-menu" role="toolbar" aria-label="Image layout">
      {IMAGE_WRAP_MODES.map((mode) => (
        <button
          key={mode}
          type="button"
          className={
            mode === currentWrap
              ? 'image-wrap-menu__option image-wrap-menu__option--active'
              : 'image-wrap-menu__option'
          }
          onClick={() => editor.chain().focus().setImageWrap(mode).run()}
        >
          {WRAP_LABELS[mode]}
        </button>
      ))}
      <input
        className="image-wrap-menu__alt"
        aria-label="Alt text"
        placeholder="Describe this image"
        value={alt}
        onChange={(event) => editor.chain().updateAttributes('image', { alt: event.target.value }).run()}
      />
    </div>
  );
}
```

`packages/editor/src/components/TicketEditor.tsx`:

```tsx
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

  const editor = useEditor({
    immediatelyRender: false, // SSR: render only after hydration (knowledge-base lesson)
    extensions,
    content: props.initialDoc ?? emptyDoc(),
    editable: props.editable ?? true,
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
      <EditorContent editor={editor} className="ticket-editor__content" />
      <UploadChips chips={chips} />
      <ImageWrapMenu editor={editor} />
    </div>
  );
}
```

Append to `packages/editor/src/styles/editor.css`:

```css
/* Editor shell + chrome. */
.ticket-editor {
  position: relative;
}
.upload-chips {
  position: absolute;
  right: 0.5rem;
  bottom: 0.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  pointer-events: none;
}
.upload-chips__chip {
  font-size: 0.6875rem;
  padding: 0.125rem 0.5rem;
}
.image-wrap-menu {
  display: flex;
  gap: 0.25rem;
  align-items: center;
}
.image-wrap-menu__alt {
  min-width: 10rem;
}
```

Append to `packages/editor/src/index.ts`:

```ts
export { UploadRefusedError, uploadAttachmentHttp, type UploadResult } from './upload.js';
export { attachmentPasteKey, createAttachmentPasteExtension, type AttachmentPasteOptions } from './extensions/attachment-paste.js';
export { TicketEditor, type TicketEditorProps } from './components/TicketEditor.js';
export { ImageWrapMenu } from './components/ImageWrapMenu.js';
```

- [ ] **Step 6: Run the component tests to verify they pass**

Run: `pnpm --filter @gisik-nokma/editor exec vitest run test/ticket-editor.test.tsx test/attachment-paste.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 7: Commit**

```bash
git add packages/editor
git commit -m "TicketEditor: chips as the only optimistic placeholder, attachment.added before any pixel lands, non-images kept out of the doc — layer 2 planted-defect proven, wrap menu on image selection"
```

---

### Task 12a: The Google Picker — attaching a Drive file as a reference

Owner sign-off 2026-08-20: Drive files may be attached **as references only**, through the Google Picker under the non-sensitive per-file `drive.file` scope, reusing the Google OAuth the workspace already signs in with. Nothing is copied; the `attachment.added` event *is* the whole record (a reference has no bytes, so it has no `attachments` row and no object key).

**Configuration.** `packages/editor` never reads `process.env` — it is one library behind three shells, and only a shell knows its own environment. The host passes a `DrivePickerConfig`; `apps/web` fills it from:

| Variable | What it is |
|---|---|
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | The **same** OAuth client id as Google sign-in (Plan 4's server-side `GOOGLE_CLIENT_ID`). `drive.file` is added by **incremental consent at the moment of picking** — it is never appended to the sign-in request, so signing in stays a sign-in. |
| `NEXT_PUBLIC_GOOGLE_PICKER_API_KEY` | The Picker developer key (a browser key, restricted by HTTP referrer). |
| `NEXT_PUBLIC_GOOGLE_APP_ID` | The Google Cloud project number. The Picker requires it to hand back per-file (`drive.file`) grants. |

Server-side `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` (Plan 4, better-auth's social provider) are untouched: this flow needs no server involvement at all.

**Files:**
- Create: `packages/editor/src/drive/google-picker.ts`
- Create: `packages/editor/src/drive/attachment-claims.ts`
- Modify: `packages/editor/src/index.ts` (exports)
- Test: `packages/editor/test/google-picker.test.ts`

**Interfaces:**
- Consumes: `DRIVE_FILE_SCOPE`, `DriveReference`, `isDriveReference`, `newUlid` (`@gisik-nokma/domain`, Task 11a and Plan 1).
- Produces (cross-plan API — Plan 6's ticket sheet and Plan 10's shells consume these):
  - `type DrivePickerConfig = { clientId: string; developerKey: string; appId: string }`
  - `type PickedDriveFile = { id: string; name: string; mimeType: string; url?: string; iconUrl?: string }`
  - `type DrivePickerDeps = { loadScript(src): Promise<void>; google(): GooglePickerGlobals; gapi(): GapiGlobals; now(): Date }`; `createBrowserPickerDeps(): DrivePickerDeps`
  - `GOOGLE_GSI_SRC`, `GOOGLE_API_SRC`
  - `requestDriveFileToken(config, deps): Promise<string>` — asks for `DRIVE_FILE_SCOPE` and nothing else
  - `openDrivePicker(config, deps): Promise<DriveReference[]>` — resolves `[]` when the user cancels
  - `toDriveReference(picked: PickedDriveFile, capturedAt: Date): DriveReference`
  - `composeDriveReferenceAdded(reference, mintId?): { type: 'attachment.added'; payload: { kind: 'drive-reference'; attachmentId: string } & DriveReference }` and `composeUploadAttachmentAdded(result: UploadResult): { type: 'attachment.added'; payload: { kind: 'upload'; attachmentId; filename; mime; size; sha256 } }` — the two claims a client submits through `POST /v1/events`, composed in one place so no shell hand-builds a payload (pending Plan 3 amendment; see Open questions)

- [ ] **Step 1: Write the failing picker test**

`packages/editor/test/google-picker.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { DRIVE_FILE_SCOPE, isDriveReference } from '@gisik-nokma/domain';
import { composeDriveReferenceAdded, composeUploadAttachmentAdded } from '../src/drive/attachment-claims.js';
import {
  GOOGLE_API_SRC,
  GOOGLE_GSI_SRC,
  openDrivePicker,
  requestDriveFileToken,
  toDriveReference,
  type DrivePickerConfig,
  type DrivePickerDeps,
} from '../src/drive/google-picker.js';

const CONFIG: DrivePickerConfig = { clientId: 'client-123.apps.googleusercontent.com', developerKey: 'dev-key', appId: '48291057' };

const DOC = {
  id: '1AbCdEfGhIjKlMnOpQrStUvWxYz0123456',
  name: 'GST filing Aug 2026.pdf',
  mimeType: 'application/pdf',
  url: 'https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456/view',
  iconUrl: 'https://drive-thirdparty.googleusercontent.com/16/type/application/pdf',
};

/** A fake Google, recording exactly what the picker was configured with. */
function fakeGoogle(action: 'picked' | 'cancel', docs = [DOC]) {
  const seen = { scopes: [] as string[], prompts: [] as string[], token: '', developerKey: '', appId: '', views: 0, visible: false };
  const google = {
    accounts: {
      oauth2: {
        initTokenClient(config: { client_id: string; scope: string; callback: (response: { access_token?: string; error?: string }) => void }) {
          seen.scopes.push(config.scope);
          return {
            requestAccessToken(overrides?: { prompt?: string }) {
              seen.prompts.push(overrides?.prompt ?? '(none)');
              config.callback({ access_token: 'ya29.fake-token' });
            },
          };
        },
      },
    },
    picker: {
      DocsView: class {},
      Action: { PICKED: 'picked', CANCEL: 'cancel' },
      PickerBuilder: class {
        addView() { seen.views += 1; return this; }
        setOAuthToken(token: string) { seen.token = token; return this; }
        setDeveloperKey(key: string) { seen.developerKey = key; return this; }
        setAppId(appId: string) { seen.appId = appId; return this; }
        setCallback(cb: (data: { action: string; docs?: typeof docs }) => void) { this.cb = cb; return this; }
        cb: ((data: { action: string; docs?: typeof docs }) => void) | null = null;
        build() {
          const cb = this.cb;
          return {
            setVisible: (visible: boolean) => {
              seen.visible = visible;
              cb?.(action === 'picked' ? { action: 'picked', docs } : { action: 'cancel' });
            },
          };
        }
      },
    },
  };
  return { google, seen };
}

function deps(google: unknown, loaded: string[] = []): DrivePickerDeps {
  return {
    loadScript: vi.fn(async (src: string) => {
      loaded.push(src);
    }),
    google: () => google as never,
    gapi: () => ({ load: (_name: string, cb: () => void) => cb() }),
    now: () => new Date('2026-08-20T10:00:00.000Z'),
  };
}

describe('the Google Picker path', () => {
  it('asks for the per-file scope and nothing else, with incremental consent', async () => {
    const { google, seen } = fakeGoogle('picked');
    const token = await requestDriveFileToken(CONFIG, deps(google));
    expect(token).toBe('ya29.fake-token');
    expect(seen.scopes).toEqual([DRIVE_FILE_SCOPE]);
    // Incremental: no forced consent screen when the grant already exists.
    expect(seen.prompts).toEqual(['']);
  });

  it('planted defect: the requested scope is exactly one non-sensitive scope', async () => {
    const { google, seen } = fakeGoogle('picked');
    await requestDriveFileToken(CONFIG, deps(google));
    const requested = seen.scopes[0]!;
    expect(requested.split(' ')).toHaveLength(1);
    expect(requested).toBe('https://www.googleapis.com/auth/drive.file');
    for (const broader of ['drive.readonly', 'auth/drive ', 'drive.metadata']) {
      expect(requested).not.toContain(broader);
    }
  });

  it('loads both Google scripts, configures the picker, and maps the picked file to a reference', async () => {
    const loaded: string[] = [];
    const { google, seen } = fakeGoogle('picked');
    const references = await openDrivePicker(CONFIG, deps(google, loaded));
    expect(loaded).toEqual([GOOGLE_GSI_SRC, GOOGLE_API_SRC]);
    expect(seen).toMatchObject({ token: 'ya29.fake-token', developerKey: 'dev-key', appId: '48291057', visible: true });
    expect(references).toHaveLength(1);
    expect(references[0]).toEqual({
      driveFileId: DOC.id,
      name: DOC.name,
      mimeType: DOC.mimeType,
      webViewLink: DOC.url,
      iconLink: DOC.iconUrl,
      capturedAt: '2026-08-20T10:00:00.000Z',
    });
    expect(isDriveReference(references[0])).toBe(true);
  });

  it('cancelling attaches nothing', async () => {
    const { google } = fakeGoogle('cancel');
    await expect(openDrivePicker(CONFIG, deps(google))).resolves.toEqual([]);
  });

  it('planted defect: a doc without a usable view link is dropped, never guessed at', async () => {
    const { google } = fakeGoogle('picked', [{ ...DOC, url: undefined } as typeof DOC]);
    await expect(openDrivePicker(CONFIG, deps(google))).resolves.toEqual([]);
  });

  it('composes an upload claim from the server answer, hash included', () => {
    const event = composeUploadAttachmentAdded({
      attachmentId: '01J9GATA000000000000000000',
      url: '/v1/attachments/01J9GATA000000000000000000',
      mime: 'image/png',
      filename: 'shelf.png',
      size: 12,
      sha256: 'b'.repeat(64),
    });
    expect(event.payload).toEqual({
      kind: 'upload',
      attachmentId: '01J9GATA000000000000000000',
      filename: 'shelf.png',
      mime: 'image/png',
      size: 12,
      sha256: 'b'.repeat(64),
    });
    // The URL is a transport detail, not part of the claim.
    expect(event.payload).not.toHaveProperty('url');
  });

  it('composes attachment.added as a drive-reference claim with a fresh ULID', () => {
    const reference = toDriveReference(DOC, new Date('2026-08-20T10:00:00.000Z'));
    const event = composeDriveReferenceAdded(reference, () => '01J9GATD000000000000000000');
    expect(event).toEqual({
      type: 'attachment.added',
      payload: {
        kind: 'drive-reference',
        attachmentId: '01J9GATD000000000000000000',
        driveFileId: DOC.id,
        name: DOC.name,
        mimeType: DOC.mimeType,
        webViewLink: DOC.url,
        iconLink: DOC.iconUrl,
        capturedAt: '2026-08-20T10:00:00.000Z',
      },
    });
  });
});
```

Run: `pnpm --filter @gisik-nokma/editor exec vitest run test/google-picker.test.ts`
Expected: FAIL — the modules do not exist.

- [ ] **Step 2: Implement the picker module**

`packages/editor/src/drive/google-picker.ts`:

```ts
import { DRIVE_FILE_SCOPE, type DriveReference } from '@gisik-nokma/domain';

export const GOOGLE_GSI_SRC = 'https://accounts.google.com/gsi/client';
export const GOOGLE_API_SRC = 'https://apis.google.com/js/api.js';

/**
 * Supplied by the host shell, never read from process.env in here (this
 * package is shared by Next.js, Tauri and an RN webview). `clientId` is
 * the same OAuth client as Google sign-in: drive.file is requested by
 * incremental consent at pick time, so signing in never asks for Drive.
 */
export type DrivePickerConfig = { clientId: string; developerKey: string; appId: string };

/** A row of Google's picker callback payload, in the fields we read. */
export type PickedDriveFile = { id: string; name: string; mimeType: string; url?: string; iconUrl?: string };

type TokenResponse = { access_token?: string; error?: string };
type TokenClient = { requestAccessToken(overrides?: { prompt?: string }): void };
type PickerCallbackData = { action: string; docs?: PickedDriveFile[] };

type PickerBuilder = {
  addView(view: unknown): PickerBuilder;
  setOAuthToken(token: string): PickerBuilder;
  setDeveloperKey(key: string): PickerBuilder;
  setAppId(appId: string): PickerBuilder;
  setCallback(callback: (data: PickerCallbackData) => void): PickerBuilder;
  build(): { setVisible(visible: boolean): void };
};

export type GooglePickerGlobals = {
  accounts: {
    oauth2: {
      initTokenClient(config: {
        client_id: string;
        scope: string;
        callback: (response: TokenResponse) => void;
      }): TokenClient;
    };
  };
  picker: {
    PickerBuilder: new () => PickerBuilder;
    DocsView: new () => unknown;
    Action: { PICKED: string; CANCEL: string };
  };
};

export type GapiGlobals = { load(name: string, callback: () => void): void };

export type DrivePickerDeps = {
  loadScript(src: string): Promise<void>;
  google(): GooglePickerGlobals;
  gapi(): GapiGlobals;
  /** Injected clock: capturedAt is a fact about when we looked. */
  now(): Date;
};

/** Real-browser deps. Tests inject fakes; nothing here touches the network in a test run. */
export function createBrowserPickerDeps(): DrivePickerDeps {
  const loaded = new Map<string, Promise<void>>();
  return {
    loadScript(src) {
      const existing = loaded.get(src);
      if (existing) return existing;
      const pending = new Promise<void>((resolve, reject) => {
        const tag = document.createElement('script');
        tag.src = src;
        tag.async = true;
        tag.onload = () => resolve();
        tag.onerror = () => reject(new Error(`could not load ${src}`));
        document.head.append(tag);
      });
      loaded.set(src, pending);
      return pending;
    },
    google: () => (globalThis as unknown as { google: GooglePickerGlobals }).google,
    gapi: () => (globalThis as unknown as { gapi: GapiGlobals }).gapi,
    now: () => new Date(),
  };
}

/**
 * One access token, one scope: DRIVE_FILE_SCOPE. `prompt: ''` is the
 * incremental-consent request — Google shows a consent screen only if this
 * user has not already granted it, and the sign-in session is reused.
 */
export async function requestDriveFileToken(config: DrivePickerConfig, deps: DrivePickerDeps): Promise<string> {
  await deps.loadScript(GOOGLE_GSI_SRC);
  return new Promise<string>((resolve, reject) => {
    const client = deps.google().accounts.oauth2.initTokenClient({
      client_id: config.clientId,
      scope: DRIVE_FILE_SCOPE,
      callback: (response) => {
        if (typeof response.access_token === 'string' && response.access_token.length > 0) resolve(response.access_token);
        else reject(new Error(response.error ?? 'Google did not grant access to the picked file.'));
      },
    });
    client.requestAccessToken({ prompt: '' });
  });
}

/**
 * A picked file becomes a reference: the name and type Drive reported, the
 * link, and the instant we looked. Nothing is fetched, nothing is copied.
 */
export function toDriveReference(picked: PickedDriveFile, capturedAt: Date): DriveReference {
  const reference: DriveReference = {
    driveFileId: picked.id,
    name: picked.name,
    mimeType: picked.mimeType,
    webViewLink: picked.url ?? '',
    capturedAt: capturedAt.toISOString(),
  };
  if (picked.iconUrl !== undefined) reference.iconLink = picked.iconUrl;
  return reference;
}

/**
 * Open Google's own picker and resolve the references the user chose.
 * Cancelling resolves `[]` — an empty pick is not an error. A doc Google
 * hands back without a view link is dropped rather than have us invent a
 * URL for it: a link we constructed is not a link Drive gave us.
 */
export async function openDrivePicker(config: DrivePickerConfig, deps: DrivePickerDeps): Promise<DriveReference[]> {
  const token = await requestDriveFileToken(config, deps);
  await deps.loadScript(GOOGLE_API_SRC);
  await new Promise<void>((resolve) => {
    deps.gapi().load('picker', () => resolve());
  });
  const google = deps.google();
  return new Promise<DriveReference[]>((resolve) => {
    const picker = new google.picker.PickerBuilder()
      .addView(new google.picker.DocsView())
      .setOAuthToken(token)
      .setDeveloperKey(config.developerKey)
      .setAppId(config.appId)
      // google.picker.Response.ACTION and .DOCUMENTS are literally the
      // strings 'action' and 'docs'; reading the keys is the same data.
      .setCallback((data) => {
        if (data.action !== google.picker.Action.PICKED) {
          if (data.action === google.picker.Action.CANCEL) resolve([]);
          return;
        }
        const capturedAt = deps.now();
        resolve((data.docs ?? []).map((doc) => toDriveReference(doc, capturedAt)).filter((ref) => ref.webViewLink !== ''));
      })
      .build();
    picker.setVisible(true);
  });
}
```

`packages/editor/src/drive/attachment-claims.ts`:

```ts
import { type DriveReference, newUlid } from '@gisik-nokma/domain';
import type { UploadResult } from '../upload.js';

export type UploadAttachmentAddedEvent = {
  type: 'attachment.added';
  payload: { kind: 'upload'; attachmentId: string; filename: string; mime: string; size: number; sha256: string };
};

export type DriveReferenceAddedEvent = {
  type: 'attachment.added';
  payload: { kind: 'drive-reference'; attachmentId: string } & DriveReference;
};

/**
 * The claim that puts an uploaded file on a ticket. Every value comes from
 * the upload's 201 answer — the sniffed mime, the measured size, the
 * server's hash — because the local File's claims are exactly what the
 * server declined to trust. Composed here, in one place, so no shell
 * hand-builds this payload.
 */
export function composeUploadAttachmentAdded(result: UploadResult): UploadAttachmentAddedEvent {
  return {
    type: 'attachment.added',
    payload: {
      kind: 'upload',
      attachmentId: result.attachmentId,
      filename: result.filename,
      mime: result.mime,
      size: result.size,
      sha256: result.sha256,
    },
  };
}

/**
 * The claim that puts a Drive file on a ticket. There is no upload call and
 * no server row: a reference has no bytes, so the event IS the record
 * (spec §2 — "events carry references"). The client submits it through
 * POST /v1/events like any other claim.
 */
export function composeDriveReferenceAdded(
  reference: DriveReference,
  mintId: () => string = newUlid,
): DriveReferenceAddedEvent {
  return { type: 'attachment.added', payload: { kind: 'drive-reference', attachmentId: mintId(), ...reference } };
}
```

Append to `packages/editor/src/index.ts`:

```ts
export {
  createBrowserPickerDeps,
  openDrivePicker,
  requestDriveFileToken,
  toDriveReference,
  GOOGLE_API_SRC,
  GOOGLE_GSI_SRC,
  type DrivePickerConfig,
  type DrivePickerDeps,
  type PickedDriveFile,
} from './drive/google-picker.js';
export {
  composeDriveReferenceAdded,
  composeUploadAttachmentAdded,
  type DriveReferenceAddedEvent,
  type UploadAttachmentAddedEvent,
} from './drive/attachment-claims.js';
```

- [ ] **Step 3: Run the picker test to verify it passes**

Run: `pnpm --filter @gisik-nokma/editor exec vitest run test/google-picker.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 4: Commit**

```bash
git add packages/editor
git commit -m "Attach Drive files as references through Google's own picker: one non-sensitive per-file scope asked for at pick time, a pointer recorded as a claim, and a doc without a real link dropped rather than guessed at"
```

---

### Task 12b: Honest rendering — a reference is not a held file

Spec §2, Drive rule 2. Two kinds render as two kinds: an upload says what the board holds; a reference says what it last saw, when it saw it, and that it cannot vouch for the contents now. There is deliberately **no positive reachability claim** — this product never tells a user a Drive link is fine, because between the check and the click it may not be. `not-checked` and `unreachable` therefore both render as *unknown*, in different words but with the same honesty.

**Files:**
- Create: `packages/editor/src/components/AttachmentListItem.tsx`
- Modify: `packages/editor/src/styles/editor.css`
- Modify: `packages/editor/src/index.ts` (exports)
- Test: `packages/editor/test/attachment-list-item.test.tsx`

**Interfaces:**
- Consumes: `DriveReference` (Task 11a).
- Produces (cross-plan API — **the same union Plan 6 re-declares** in `packages/app-core/src/views/attachment-list.tsx`, the "one contract written twice" pattern of Open questions 1/13; edit both or neither):
  - ```ts
    export type AttachmentListEntry =
      | { kind: 'upload'; attachmentId: string; filename: string; mime: string; size: number; sha256: string | null }
      | ({ kind: 'drive-reference'; attachmentId: string } & DriveReference);
    ```
  - `type DriveLinkCheck = 'not-checked' | 'unreachable'`; `describeDriveReachability(check: DriveLinkCheck): string`
  - `AttachmentListItem(props: { entry: AttachmentListEntry; linkCheck?: DriveLinkCheck; resolveAttachmentUrl?(id: string): string })`, `UploadedAttachmentItem`, `DriveReferenceItem`
  - BEM classes `attachment-item`, `attachment-item--upload`, `attachment-item--drive-reference`, `attachment-item__kind`, `attachment-item__name`, `attachment-item__last-seen`, `attachment-item__reachability`; each item carries `data-attachment-kind`.

- [ ] **Step 1: Write the failing rendering test**

`packages/editor/test/attachment-list-item.test.tsx`:

```tsx
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AttachmentListItem, type AttachmentListEntry } from '../src/components/AttachmentListItem.js';

const UPLOAD: AttachmentListEntry = {
  kind: 'upload',
  attachmentId: '01J9GATA000000000000000000',
  filename: 'receipt.pdf',
  mime: 'application/pdf',
  size: 1024,
  sha256: 'a'.repeat(64),
};

const REFERENCE: AttachmentListEntry = {
  kind: 'drive-reference',
  attachmentId: '01J9GATD000000000000000000',
  driveFileId: '1AbCdEfGhIjKlMnOpQrStUvWxYz0123456',
  name: 'GST filing Aug 2026.pdf',
  mimeType: 'application/pdf',
  webViewLink: 'https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456/view',
  capturedAt: '2026-08-20T10:00:00.000Z',
};

/** Words that would claim knowledge this product does not have. */
const FORBIDDEN = ['deleted', 'missing', 'no longer', 'available', 'verified', 'up to date'];

describe('AttachmentListItem', () => {
  it('an upload renders as a file the board holds, downloadable from the board', () => {
    const view = render(<ul><AttachmentListItem entry={UPLOAD} /></ul>);
    const item = view.container.querySelector('.attachment-item')!;
    expect(item.getAttribute('data-attachment-kind')).toBe('upload');
    expect(item.className).toContain('attachment-item--upload');
    expect(item.querySelector('a')!.getAttribute('href')).toBe('/v1/attachments/01J9GATA000000000000000000');
    expect(item.textContent).toContain('receipt.pdf');
    view.unmount();
  });

  it('planted defect: a Drive reference renders as external and last-seen, never as a held file', () => {
    const view = render(<ul><AttachmentListItem entry={REFERENCE} /></ul>);
    const item = view.container.querySelector('.attachment-item')!;
    // Distinct kind, distinct class — a reader can tell them apart.
    expect(item.getAttribute('data-attachment-kind')).toBe('drive-reference');
    expect(item.className).toContain('attachment-item--drive-reference');
    expect(item.className).not.toContain('attachment-item--upload');
    // It is a link into Drive, never a download from this board.
    const href = item.querySelector('a')!.getAttribute('href')!;
    expect(href).toBe(REFERENCE.kind === 'drive-reference' ? REFERENCE.webViewLink : '');
    expect(href).not.toContain('/v1/attachments/');
    // Last-seen name AND capture date are both on the surface.
    expect(item.textContent).toContain('GST filing Aug 2026.pdf');
    expect(item.textContent).toContain('last seen');
    expect(item.textContent).toContain('2026-08-20');
    expect(item.textContent).toContain('Google Drive');
    view.unmount();
  });

  it('planted defect: an unreachable link is unknown — never absent, never fine', () => {
    const unchecked = render(<ul><AttachmentListItem entry={REFERENCE} /></ul>);
    const failed = render(<ul><AttachmentListItem entry={REFERENCE} linkCheck="unreachable" /></ul>);
    for (const view of [unchecked, failed]) {
      const text = view.container.querySelector('.attachment-item__reachability')!.textContent!;
      expect(text.toLowerCase()).toContain('unknown');
      for (const word of FORBIDDEN) expect(text.toLowerCase()).not.toContain(word);
    }
    // The two states say different things, and neither of them settles anything.
    expect(unchecked.container.textContent).not.toBe(failed.container.textContent);
    unchecked.unmount();
    failed.unmount();
  });

  it('an upload never carries reachability language at all — the board holds it', () => {
    const view = render(<ul><AttachmentListItem entry={UPLOAD} /></ul>);
    expect(view.container.querySelector('.attachment-item__reachability')).toBeNull();
    view.unmount();
  });
});
```

Run: `pnpm --filter @gisik-nokma/editor exec vitest run test/attachment-list-item.test.tsx`
Expected: FAIL — the module does not exist.

- [ ] **Step 2: Implement the item components**

`packages/editor/src/components/AttachmentListItem.tsx`:

```tsx
import type { DriveReference } from '@gisik-nokma/domain';

/**
 * The two kinds of attachment, as a list renders them. Plan 6 re-declares
 * this union verbatim in `packages/app-core/src/views/attachment-list.tsx`
 * so app-core never depends on this package; structural typing joins them,
 * and the two declarations are ONE contract — edit both or neither.
 */
export type AttachmentListEntry =
  | { kind: 'upload'; attachmentId: string; filename: string; mime: string; size: number; sha256: string | null }
  | ({ kind: 'drive-reference'; attachmentId: string } & DriveReference);

export type DriveLinkCheck = 'not-checked' | 'unreachable';

/**
 * There is no "reachable" answer here on purpose. The board does not hold
 * the file, so it cannot say the file is fine — and a link that failed a
 * moment ago may work now, so it cannot say the file is gone either.
 * Both states resolve to the only true word: unknown.
 */
export function describeDriveReachability(check: DriveLinkCheck): string {
  return check === 'unreachable'
    ? 'Contents unknown — the link did not answer when it was last opened from here.'
    : 'Contents unknown — the board holds a link to this file, not the file.';
}

function formatCapturedAt(capturedAt: string): string {
  const at = new Date(capturedAt);
  return Number.isNaN(at.getTime()) ? capturedAt : at.toISOString().slice(0, 10);
}

export function UploadedAttachmentItem(props: {
  entry: Extract<AttachmentListEntry, { kind: 'upload' }>;
  resolveAttachmentUrl?: (attachmentId: string) => string;
}): React.JSX.Element {
  const href = (props.resolveAttachmentUrl ?? ((id: string) => `/v1/attachments/${id}`))(props.entry.attachmentId);
  return (
    <li className="attachment-item attachment-item--upload" data-attachment-kind="upload">
      <a className="attachment-item__name" href={href}>
        {props.entry.filename}
      </a>
      <span className="attachment-item__kind">{props.entry.mime}</span>
    </li>
  );
}

export function DriveReferenceItem(props: {
  entry: Extract<AttachmentListEntry, { kind: 'drive-reference' }>;
  linkCheck?: DriveLinkCheck;
}): React.JSX.Element {
  const { entry } = props;
  return (
    <li className="attachment-item attachment-item--drive-reference" data-attachment-kind="drive-reference">
      <span className="attachment-item__kind">Google Drive reference</span>
      <a className="attachment-item__name" href={entry.webViewLink} target="_blank" rel="noreferrer noopener">
        {entry.name}
      </a>
      <span className="attachment-item__last-seen">
        last seen as “{entry.name}” ({entry.mimeType}) · captured {formatCapturedAt(entry.capturedAt)}
      </span>
      <span className="attachment-item__reachability">{describeDriveReachability(props.linkCheck ?? 'not-checked')}</span>
    </li>
  );
}

export function AttachmentListItem(props: {
  entry: AttachmentListEntry;
  linkCheck?: DriveLinkCheck;
  resolveAttachmentUrl?: (attachmentId: string) => string;
}): React.JSX.Element {
  if (props.entry.kind === 'drive-reference') {
    const forwarded = props.linkCheck === undefined ? {} : { linkCheck: props.linkCheck };
    return <DriveReferenceItem entry={props.entry} {...forwarded} />;
  }
  const forwarded = props.resolveAttachmentUrl === undefined ? {} : { resolveAttachmentUrl: props.resolveAttachmentUrl };
  return <UploadedAttachmentItem entry={props.entry} {...forwarded} />;
}
```

Append to `packages/editor/src/styles/editor.css`:

```css
.attachment-item {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  padding: 0.35rem 0;
}
.attachment-item__kind,
.attachment-item__last-seen,
.attachment-item__reachability {
  font-size: 0.85rem;
}
.attachment-item--drive-reference {
  border-left: 2px dashed;
  padding-left: 0.5rem;
}
```

(Structural only — the dashed rule inherits `currentColor`; colour arrives from `packages/ui` tokens, Open questions 6.)

Append to `packages/editor/src/index.ts`:

```ts
export {
  AttachmentListItem,
  DriveReferenceItem,
  UploadedAttachmentItem,
  describeDriveReachability,
  type AttachmentListEntry,
  type DriveLinkCheck,
} from './components/AttachmentListItem.js';
```

- [ ] **Step 3: Run the test to verify it passes**

Run: `pnpm --filter @gisik-nokma/editor exec vitest run test/attachment-list-item.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 4: Commit**

```bash
git add packages/editor
git commit -m "Render a Drive reference for what it is: an external link with the name it last had and the day we looked, and a reachability line that only ever says unknown — because the board cannot vouch for a file it does not hold"
```

---

### Task 12c: A Drive image is never an inline image

Spec §2, Drive rule 3. Inline embedding stays uploads-only and images-only, and a Drive image is not an exception — its mime says `image/png` while its bytes live somewhere this product cannot read, so a node pointing at it would render as a hole or, worse, as content the board is showing on its own authority.

Enforcement is structural rather than conditional: the drive module **cannot** insert a node, because it does not import the command that inserts nodes — and a scanner test keeps it that way, in the spirit of Plan 6's views-never-import-HTTP scan. Layer 3 needs nothing new: a reference has no `attachments` row, so the existing image-embed gate already refuses it — this task proves that rather than assuming it.

**Files:**
- Test: `packages/editor/test/drive-never-inline.test.ts`
- Test: `apps/server/test/gates/image-embed-gate.test.ts` (append one case)

**Interfaces:**
- Consumes: `createAttachmentPasteExtension`, `buildEditorExtensions` (Task 12); `composeDriveReferenceAdded`, `toDriveReference` (Task 12a); `seedDriveReference` (Task 11a's helper); `RULE_EMBED_UNKNOWN` (Task 11).
- Produces: no new API. The guarantee: **no code path anywhere turns a Drive reference into a document node**, proven at the client (structural + behavioural) and at the server (gate).

- [ ] **Step 1: Write the failing client test**

`packages/editor/test/drive-never-inline.test.ts`:

```ts
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Editor as CoreEditor } from '@tiptap/core';
import { describe, expect, it, vi } from 'vitest';
import { composeDriveReferenceAdded } from '../src/drive/attachment-claims.js';
import { toDriveReference } from '../src/drive/google-picker.js';
import { createAttachmentPasteExtension } from '../src/extensions/attachment-paste.js';
import { buildEditorExtensions } from '../src/schema/extensions.js';

const DRIVE_PNG = {
  id: '1PnGdEfGhIjKlMnOpQrStUvWxYz0123456',
  name: 'shelf.png',
  mimeType: 'image/png', // an image by type, and still not ours to show
  url: 'https://drive.google.com/file/d/1PnGdEfGhIjKlMnOpQrStUvWxYz0123456/view',
};

function makeEditor() {
  const calls: string[] = [];
  const editor = new CoreEditor({
    element: document.createElement('div'),
    extensions: [
      ...buildEditorExtensions(),
      createAttachmentPasteExtension({
        uploadAttachment: vi.fn(async () => {
          calls.push('upload');
          throw new Error('no upload should happen for a Drive paste');
        }),
        onAttachmentAdded: vi.fn(),
        onFileAttached: vi.fn(),
        onUploadError: vi.fn(),
        onUploadStart: vi.fn(),
        onUploadEnd: vi.fn(),
      }),
    ],
  });
  return { editor, calls };
}

function imageNodeCount(editor: CoreEditor): number {
  let count = 0;
  editor.state.doc.descendants((node) => {
    if (node.type.name === 'image') count += 1;
    return true;
  });
  return count;
}

describe('a Drive reference never becomes an inline image (rule 3)', () => {
  it('planted defect: picking a Drive PNG produces an attachment claim and NO image node', () => {
    const { editor } = makeEditor();
    const before = JSON.stringify(editor.getJSON());
    const event = composeDriveReferenceAdded(toDriveReference(DRIVE_PNG, new Date('2026-08-20T10:00:00.000Z')));
    expect(event.payload.kind).toBe('drive-reference');
    expect(event.payload.mimeType).toBe('image/png');
    expect(imageNodeCount(editor)).toBe(0);
    expect(JSON.stringify(editor.getJSON())).toBe(before);
    editor.destroy();
  });

  it('planted defect: pasting a Drive link (no file on the clipboard) uploads nothing and embeds nothing', () => {
    const { editor, calls } = makeEditor();
    const event = {
      clipboardData: {
        items: [{ kind: 'string', type: 'text/uri-list', getAsFile: () => null }],
        getData: () => DRIVE_PNG.url,
      },
      preventDefault: vi.fn(),
    } as unknown as ClipboardEvent;
    const handled = editor.view.someProp('handlePaste', (handler) => handler(editor.view, event, editor.state.doc.slice(0))) ?? false;
    // Not handled by us: ProseMirror's own text handling pastes the link,
    // which is exactly right — a link is a link.
    expect(handled).toBe(false);
    expect(calls).toEqual([]);
    expect(imageNodeCount(editor)).toBe(0);
    editor.destroy();
  });

  it('planted defect: the drive module cannot embed, because it never imports the command that embeds', () => {
    const driveDir = new URL('../src/drive/', import.meta.url).pathname;
    const sources = readdirSync(driveDir).filter((name) => name.endsWith('.ts'));
    expect(sources.length).toBeGreaterThan(0);
    for (const name of sources) {
      const source = readFileSync(join(driveDir, name), 'utf8');
      for (const forbidden of ['ticket-image', 'insertTicketImage', 'setImageWrap']) {
        expect(source, `${name} must not reach for ${forbidden}`).not.toContain(forbidden);
      }
    }
  });
});
```

Run: `pnpm --filter @gisik-nokma/editor exec vitest run test/drive-never-inline.test.ts`
Expected: PASS immediately **only if** Task 12a's modules are clean — this suite asserts an existing guarantee rather than driving new code. Run it before believing it: if the scanner case passes with an obviously broken input, the scan is not scanning. Verify by temporarily adding `// insertTicketImage` to `packages/editor/src/drive/attachment-claims.ts`, re-running (expect FAIL), and removing it again.

- [ ] **Step 2: Append the server-side case (layer 3)**

Append inside the existing `describe('image-embed gate (layer 3)', …)` block of `apps/server/test/gates/image-embed-gate.test.ts`:

```ts
  it('planted defect: a document embedding a Drive reference is refused — a reference has no bytes to show', async () => {
    const referenceId = newUlid();
    await seedDriveReference(db.pool, { workspaceId: WS, ticketId: TICKET, attachmentId: referenceId, actorId: ACTOR });
    const event = submitted('comment.added', { body: docEmbedding(referenceId) });
    const [result] = await ingest.ingestBatch([event]);
    expect(result).toMatchObject({ status: 'refused', rule: RULE_EMBED_UNKNOWN });
    expect(await ledgerCount(event.id)).toBe(0);
  });
```

Add to that file's imports: `import { seedDriveReference } from '../helpers/drive-reference.js';`

The rule id is deliberately the *existing* `attachment.embed-unknown`: from the embedder's point of view there is no image attachment by that id on this ticket, and inventing a third id here would tell an embedder which ids are references — the same existence-leak the gate already refuses to perform.

- [ ] **Step 3: Run both suites**

Run: `pnpm --filter @gisik-nokma/editor exec vitest run test/drive-never-inline.test.ts && pnpm --filter @gisik-nokma/server exec vitest run test/gates/image-embed-gate.test.ts`
Expected: PASS — 3 client cases, and the gate suite with its new refusal.

- [ ] **Step 4: Commit**

```bash
git add packages/editor apps/server
git commit -m "Inline embedding stays uploads-only: a picked Drive image joins the list, a pasted Drive link stays a link, the drive module cannot even reach the insert command, and the server refuses a document that tries anyway"
```

---

