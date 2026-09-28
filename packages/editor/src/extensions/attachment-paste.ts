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

/**
 * Layer 2 of image-only inline embedding (spec §2; layer 1 is
 * `insertTicketImage`'s mime refusal, layer 3 is the server's ingest gate).
 * `isEmbeddableImageMime(result.mime)` is the ROUTE DECISION this file owns:
 * an image result inserts a node, everything else goes to
 * `onFileAttached` — the attachment list — and NEVER reaches a node. The
 * mime tested is the server's sniffed answer on `result`, never the file's
 * declared type, so a renamed `.exe` cannot talk its way past this branch
 * any more than it can past layer 1 or layer 3.
 */
/**
 * Exported (Unit 5, owner: "I thought we already made the attachment
 * feature but i dont see where we can attach files in our build") so the
 * composer's Attach button — a click, not a paste/drop — can run the exact
 * same upload-then-route decision paste already does, through `TicketEditor`'s
 * `attachFileRef` escape hatch. "No second upload path" means this function,
 * not a parallel one that happens to call the same `uploadAttachment`.
 */
export async function handleFile(file: File, view: EditorView, options: AttachmentPasteOptions): Promise<void> {
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
