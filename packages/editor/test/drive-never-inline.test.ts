import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
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

  /**
   * ADDED BEYOND THE PLAN TEXT. The case above never hands `event` to the
   * editor at all, so its `imageNodeCount === 0` assertion cannot fail for
   * ANY implementation — nothing in that test calls anything that could
   * insert a node. This case is what actually stands behind the plan's
   * "command layer" refusal claim: `insertTicketImage` requires `mime`
   * (the server's sniffed answer on an upload), and a `DriveReferenceAddedEvent`
   * payload carries `mimeType` (Drive's own claim) and no `mime` at all — so
   * TypeScript refuses the call at compile time (`@ts-expect-error`, enforced
   * by this package's `typecheck` gate: an unused directive is itself a type
   * error), and even forced through at runtime, `isEmbeddableImageMime(undefined)`
   * is false, so layer 1's own guard refuses it too.
   *
   * These are NOT two independent proofs of the rule. `line 82`'s
   * `expect(inserted).toBe(false)` is only the mime-check floor — it holds
   * because `attrs.mime` is `undefined`, the same outcome a plain mime check
   * (`isEmbeddableImageMime`, ticket-image.ts:184) would produce for ANY
   * payload lacking a `mime` field, Drive or not. It does not by itself
   * distinguish "refused because this is a Drive claim" from "refused
   * because this call forgot to set mime". Each floor does survive removal
   * of the OTHER (drop the runtime guard and TypeScript still errors on the
   * `@ts-expect-error` line above; loosen the command's param to `mime?:
   * string` and the runtime guard still returns false) — but both trace
   * back to one upstream fact, not two: `DriveReference` (domain
   * attachment-kinds.ts:43) spells its field `mimeType`, never `mime`. A
   * rename of that field to `mime` would collapse the type floor (the call
   * becomes assignable, no `@ts-expect-error` needed) and hand
   * `isEmbeddableImageMime` a real `image/png` string, collapsing the
   * runtime floor in the same edit. So this case is real evidence, but its
   * shared root should not be read as two floors that fail independently.
   */
  it('planted defect: a Drive claim is not assignable to insertTicketImage — refused by TYPE, and if forced, refused at RUNTIME too', () => {
    const { editor } = makeEditor();
    const event = composeDriveReferenceAdded(toDriveReference(DRIVE_PNG, new Date('2026-08-20T10:00:00.000Z')));
    // @ts-expect-error a DriveReferenceAddedEvent's payload has `mimeType`, not
    // the `mime` insertTicketImage requires, and TypeScript refuses this call
    // on that missing property — not on any runtime check.
    const inserted = editor.commands.insertTicketImage(event.payload);
    // This assertion alone is the mime-check floor, not a Drive-specific one:
    // it holds because attrs.mime is undefined here, which is exactly what
    // isEmbeddableImageMime(undefined) also rejects for a non-Drive payload
    // missing `mime`. See the docblock above for why that upstream sharing
    // means the two floors are not independent of each other.
    expect(inserted).toBe(false); // forced through anyway: layer 1's mime guard still refuses it
    expect(imageNodeCount(editor)).toBe(0);
    editor.destroy();
  });

  it('planted defect: pasting a Drive link (no file on the clipboard) uploads nothing and embeds nothing', () => {
    const { editor, calls } = makeEditor();
    // DEVIATION FROM THE PLAN TEXT: the plan's `getData: () => DRIVE_PNG.url`
    // answers every format identically, including 'vscode-editor-data'. That
    // is not what a real DataTransfer does — getData(format) answers only the
    // format that was actually populated, '' otherwise — and StarterKit's
    // CodeBlock extension registers its own handlePaste that unconditionally
    // reads 'vscode-editor-data' and JSON.parses it, which crashes on the
    // plan's mock (a real clipboard paste of a Drive link never sets that
    // format, so this crash cannot happen outside the test). Format-aware
    // getData matches a real browser's clipboard and lets CodeBlock's handler
    // fall through as it would in production, which is what actually
    // exercises attachmentPaste's handlePaste next in the plugin chain.
    const event = {
      clipboardData: {
        items: [{ kind: 'string', type: 'text/uri-list', getAsFile: () => null }],
        getData: (format: string) => (format === 'text/plain' || format === 'text/uri-list' ? DRIVE_PNG.url : ''),
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
    // DEVIATION FROM THE PLAN TEXT: `new URL('../src/drive/', import.meta.url)`
    // is the pattern this codebase already found broken under Vitest — Vite
    // statically rewrites it (see packages/ui/test/helpers/colour-scan.ts and
    // packages/editor/test/ticket-image.test.ts). `fileURLToPath` + `resolve`
    // is the established substitute elsewhere in this package.
    const driveDir = resolve(dirname(fileURLToPath(import.meta.url)), '../src/drive');
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
