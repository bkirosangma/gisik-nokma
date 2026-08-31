import { Editor } from '@tiptap/core';
import { buildEditorExtensions, type EditorSchemaOptions } from '../../src/schema/extensions.js';

/**
 * A headless Tiptap editor mounted on a detached element — the jsdom
 * equivalent of every real surface, sharing the exact same extension list.
 */
export function createTestEditor(options: EditorSchemaOptions = {}, content?: unknown): Editor {
  return new Editor({
    element: document.createElement('div'),
    extensions: buildEditorExtensions(options),
    content: content ?? undefined,
  });
}
