import type { Editor } from '@tiptap/core';
import { emptyDoc, type DocJson } from '../doc.js';
import type { MentionCandidate } from '../extensions/mention.js';
import type { NoteLinkCandidate } from '../extensions/wiki-link.js';
import { parseHostMessage, type EditorToHostMessage } from './bridge.js';

export type EditorBridgeDeps = {
  editor: Editor;
  post(message: EditorToHostMessage): void;
};

export type EditorBridge = {
  handleHostMessage(raw: unknown): void;
  /** Mention data source for the webview editor: query rides the bridge. */
  resolveMentions(query: string): Promise<MentionCandidate[]>;
  /** Note data source for the webview editor's `[[` picker — the same round trip. */
  resolveNotes(query: string): Promise<NoteLinkCandidate[]>;
  /** The attach affordance / captured paste: ask the host to run its native upload. */
  requestUpload(): void;
  dispose(): void;
};

/**
 * Pure wiring between a live editor and a postMessage host — no `window` or
 * `document` reference anywhere in this file, so the whole contract is
 * provable in plain jsdom-under-vitest without a real WebView. `entry.tsx`
 * is where the DOM-facing half lives (the `message` event listeners, the
 * `ReactNativeWebView` / `window.parent` transport choice); this file only
 * ever calls the `post` function its caller hands it.
 */
export function createEditorBridge(deps: EditorBridgeDeps): EditorBridge {
  const { editor, post } = deps;
  let requestCounter = 0;
  let disposed = false;
  const pendingMentions = new Map<string, (users: MentionCandidate[]) => void>();
  const pendingNotes = new Map<string, (candidates: NoteLinkCandidate[]) => void>();

  const onUpdate = (): void => {
    if (disposed) return;
    post({ bridge: 1, kind: 'change', doc: editor.getJSON() as DocJson });
  };
  editor.on('update', onUpdate);
  post({ bridge: 1, kind: 'ready' });

  return {
    handleHostMessage(raw) {
      const message = parseHostMessage(raw);
      if (!message || disposed) return;
      switch (message.kind) {
        case 'loadDoc':
          editor.commands.setContent(message.doc ?? emptyDoc(), { emitUpdate: false });
          // `setEditable`'s second parameter defaults to `true` and, read in
          // @tiptap/core@3.30.5 (dist:6292-6297), emits an `update` event
          // UNCONDITIONALLY when it is — not only when the editable flag
          // actually changed. Passing `false` here is load-bearing: without
          // it, every `loadDoc` echoes a spurious `change` message back at
          // the host it just heard from, which is the "no echo" contract
          // this bridge exists to keep.
          editor.setEditable(message.editable, false);
          break;
        case 'insertImage':
          // Layer 1 applies here too: insertTicketImage refuses non-image mime.
          editor.commands.insertTicketImage({
            attachmentId: message.attachmentId,
            mime: message.mime,
            alt: message.alt ?? '',
          });
          break;
        case 'requestSubmit':
          post({ bridge: 1, kind: 'submit', doc: editor.getJSON() as DocJson });
          break;
        case 'mentionResults': {
          const resolve = pendingMentions.get(message.requestId);
          if (resolve) {
            pendingMentions.delete(message.requestId);
            resolve(message.users);
          }
          break;
        }
        case 'noteResults': {
          const resolve = pendingNotes.get(message.requestId);
          if (resolve) {
            pendingNotes.delete(message.requestId);
            resolve(message.candidates);
          }
          break;
        }
        case 'uploadFailed':
          // Nothing to roll back: the webview never inserted anything for
          // an in-flight host upload. The host surfaces its own error UI.
          break;
      }
    },
    resolveMentions(query) {
      const requestId = String(++requestCounter);
      return new Promise((resolve) => {
        pendingMentions.set(requestId, resolve);
        post({ bridge: 1, kind: 'mentionQuery', requestId, query });
      });
    },
    resolveNotes(query) {
      const requestId = String(++requestCounter);
      return new Promise((resolve) => {
        pendingNotes.set(requestId, resolve);
        post({ bridge: 1, kind: 'noteQuery', requestId, query });
      });
    },
    requestUpload() {
      post({ bridge: 1, kind: 'requestUpload', requestId: String(++requestCounter) });
    },
    dispose() {
      disposed = true;
      editor.off('update', onUpdate);
      pendingMentions.clear();
      pendingNotes.clear();
    },
  };
}
