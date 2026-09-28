import type { Editor } from '@tiptap/core';
import { emptyDoc, type DocJson } from '../doc.js';
import type { MentionCandidate } from '../extensions/mention.js';
import type { NoteLinkCandidate } from '../extensions/wiki-link.js';
import type { TicketRefCandidate } from '../extensions/ticket-ref.js';
import { parseHostMessage, type EditorToHostMessage } from './bridge.js';

export type EditorBridgeDeps = {
  editor: Editor;
  post(message: EditorToHostMessage): void;
  /** Trash Plan 3: the ids a loaded document's erased chips point at, handed over BEFORE its content is set. */
  onPurgedIds?(ids: readonly string[]): void;
};

export type EditorBridge = {
  handleHostMessage(raw: unknown): void;
  /** Mention data source for the webview editor: query rides the bridge. */
  resolveMentions(query: string): Promise<MentionCandidate[]>;
  /** Note data source for the webview editor's `[[` picker — the same round trip. */
  resolveNotes(query: string): Promise<NoteLinkCandidate[]>;
  /** Ticket data source for the webview editor's `:ticket` picker — the same round trip. */
  resolveTickets(query: string): Promise<TicketRefCandidate[]>;
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
  const pendingTickets = new Map<string, (candidates: TicketRefCandidate[]) => void>();

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
          deps.onPurgedIds?.(message.purgedIds ?? []);
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
        case 'ticketResults': {
          const resolve = pendingTickets.get(message.requestId);
          if (resolve) {
            pendingTickets.delete(message.requestId);
            resolve(message.candidates);
          }
          break;
        }
        case 'uploadFailed':
          // Nothing to roll back: the webview never inserted anything for
          // an in-flight host upload. The host surfaces its own error UI.
          break;
        default:
          // ⚠ EXHAUSTIVENESS MADE A COMPILE ERROR, and this is not decoration.
          // The switch had NO default, so a kind added to
          // `HostToEditorMessage` without a branch here was parsed, matched
          // nothing, and was DROPPED IN SILENCE — no error, no log, nothing to
          // notice. That is exactly the defect this branch found on the other
          // side of the bridge, where the RN host ignored `noteQuery` and left
          // the editor's picker pending forever.
          //
          // `satisfies never` type-checks against the union: while every kind
          // is handled, `message` is `never` and this compiles; add a kind and
          // it is a non-never, so the build fails at the line that must decide
          // what the new kind does. MEASURED by adding a seventh kind to the
          // union: `pnpm typecheck` reddens, naming this file.
          message satisfies never;
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
    resolveTickets(query) {
      const requestId = String(++requestCounter);
      return new Promise((resolve) => {
        pendingTickets.set(requestId, resolve);
        post({ bridge: 1, kind: 'ticketQuery', requestId, query });
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
      pendingTickets.clear();
    },
  };
}
