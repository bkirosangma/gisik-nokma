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
  return findImageNode(editor) !== null;
}

/** The inserted image node itself, so a test can inspect its attrs — not just whether one exists. */
function findImageNode(editor: Editor): { attrs: Record<string, unknown> } | null {
  let found: { attrs: Record<string, unknown> } | null = null;
  editor.state.doc.descendants((node) => {
    if (node.type.name === 'image') found = node;
    return !found;
  });
  return found;
}

describe('attachment paste/drop (layer 2)', () => {
  it('an image file uploads, emits attachment.added, THEN inserts the node with wrap block', async () => {
    const { editor, calls } = makeEditor({
      onAttachmentAdded: vi.fn(async () => {
        // The ordering contract itself: at the moment attachment.added
        // fires, no node has landed yet — a submit racing this flow can
        // never observe a doc node for a claim that hasn't gone out.
        // `calls` alone can't catch a hoisted node insertion (it never
        // records one), so this is the assertion that actually pins order.
        expect(hasImageNode(editor)).toBe(false);
        calls.push('event');
      }),
    });
    const file = new File([new Uint8Array(12)], 'shelf.png', { type: 'image/png' });
    expect(paste(editor, [file])).toBe(true);
    await vi.waitFor(() => {
      expect(hasImageNode(editor)).toBe(true);
    });
    // Order is the contract: chip → upload → attachment.added event → node.
    expect(calls).toEqual(['start', 'upload', 'event', 'end']);
    // The node itself, not just its presence: wrap and alt come from the
    // upload result, and attachmentId is the load-bearing link the server's
    // ingest gate (layer 3) checks against real attachments.
    expect(findImageNode(editor)?.attrs).toEqual({
      attachmentId: PNG_RESULT.attachmentId,
      wrap: 'block',
      alt: PNG_RESULT.filename,
    });
    editor.destroy();
  });

  it('attachment.added handler throwing is a failure too: no node, chip ends, reported', async () => {
    const { editor, options } = makeEditor({
      onAttachmentAdded: vi.fn(async () => {
        throw new Error('host rejected the claim');
      }),
    });
    const before = editor.getJSON();
    const file = new File([new Uint8Array(12)], 'shelf.png', { type: 'image/png' });
    expect(paste(editor, [file])).toBe(true);
    await vi.waitFor(() => {
      expect(options.onUploadError).toHaveBeenCalled();
    });
    expect(options.onUploadEnd).toHaveBeenCalled();
    expect(hasImageNode(editor)).toBe(false);
    expect(editor.getJSON()).toEqual(before);
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
    // `someProp('handlePaste', ...)` probes every registered handlePaste in
    // turn, not just this extension's — StarterKit bundles OrderedList,
    // whose own handlePaste (@tiptap/extension-list@3.30.5) calls
    // `event.clipboardData?.getData(...)` unconditionally once our handler
    // declines. A real browser ClipboardEvent always has `getData`; this
    // fake one needs a stub for the same reason `items` needs one — the
    // test's own event object stands in for the browser's, and the browser
    // never omits either.
    const event = {
      clipboardData: { items: [], getData: () => '' },
      preventDefault: vi.fn(),
    } as unknown as ClipboardEvent;
    const handled = editor.view.someProp('handlePaste', (handler) => handler(editor.view, event, editor.state.doc.slice(0)));
    expect(handled ?? false).toBe(false);
    editor.destroy();
  });
});
