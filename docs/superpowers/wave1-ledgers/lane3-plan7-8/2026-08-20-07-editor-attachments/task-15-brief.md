### Task 15: RN webview bundle and the message bridge

**Files:**
- Create: `packages/editor/src/webview/bridge.ts`
- Create: `packages/editor/src/webview/create-editor-bridge.ts`
- Create: `packages/editor/src/webview/entry.tsx`
- Create: `packages/editor/src/webview/index.html`
- Create: `packages/editor/vite.webview.config.ts`
- Modify: `packages/editor/src/index.ts` (exports)
- Test: `packages/editor/test/webview-bridge.test.ts`

**Interfaces:**
- Consumes: `TicketEditor` (Task 12), `emptyDoc`, `isDocJson` (Task 1), `insertTicketImage` (Task 3), `MentionCandidate` (Task 4).
- Produces (cross-plan API — **Plan 10 wires the RN side against exactly this**; the contract's five verbs are `loadDoc`, `onChange`, `onSubmit`, `insertImage(attachmentId)`, `requestUpload`):

```ts
// Host (RN) → editor webview
type HostToEditorMessage =
  | { bridge: 1; kind: 'loadDoc'; doc: DocJson | null; editable: boolean }        // loadDoc
  | { bridge: 1; kind: 'insertImage'; attachmentId: string; mime: string; alt?: string } // insertImage(attachmentId)
  | { bridge: 1; kind: 'requestSubmit' }                                          // host asks for onSubmit
  | { bridge: 1; kind: 'mentionResults'; requestId: string; users: MentionCandidate[] }
  | { bridge: 1; kind: 'uploadFailed'; requestId: string; message: string };

// Editor webview → host (RN)
type EditorToHostMessage =
  | { bridge: 1; kind: 'ready' }
  | { bridge: 1; kind: 'change'; doc: DocJson }                                   // onChange
  | { bridge: 1; kind: 'submit'; doc: DocJson }                                   // onSubmit
  | { bridge: 1; kind: 'requestUpload'; requestId: string }                       // requestUpload
  | { bridge: 1; kind: 'mentionQuery'; requestId: string; query: string };
```

  - `parseHostMessage(raw: unknown): HostToEditorMessage | null` (null for anything malformed — the bridge never throws on hostile input); `serializeEditorMessage(message: EditorToHostMessage): string`.
  - `createEditorBridge(deps: { editor: Editor; post(message: EditorToHostMessage): void }): EditorBridge` where `type EditorBridge = { handleHostMessage(raw: unknown): void; resolveMentions(query: string): Promise<MentionCandidate[]>; requestUpload(): void; dispose(): void }`.
  - Upload semantics in the webview: files never cross the bridge. Paste/drop and the attach affordance post `requestUpload`; the RN host opens its native picker, uploads over its own authenticated HTTP, emits `attachment.added` itself, and answers `insertImage` (image case — layer 1's mime check still applies inside the webview) or nothing (list case: the native attachment list re-renders from the host's own state).
  - Build: `pnpm --filter @gisik-nokma/editor run build:webview` → `packages/editor/dist-webview/index.html`, a **single self-contained file** (all JS/CSS inlined) that Plan 10 ships as the RN webview source. Actual RN wiring (WebView component, native pickers, outbox) is Plan 10's; the bridge contract is this plan's.

- [ ] **Step 1: Write the failing bridge tests**

`packages/editor/test/webview-bridge.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { parseHostMessage, serializeEditorMessage, type EditorToHostMessage } from '../src/webview/bridge.js';
import { createEditorBridge } from '../src/webview/create-editor-bridge.js';
import { createTestEditor } from './helpers/create-editor.js';
import { typeText } from './helpers/type-text.js';

const IMG = '01J9GATA000000000000000000';

function harness() {
  const posted: EditorToHostMessage[] = [];
  const editor = createTestEditor();
  const bridge = createEditorBridge({ editor, post: (message) => posted.push(message) });
  return { posted, editor, bridge };
}

describe('parseHostMessage', () => {
  it('accepts each well-formed host message', () => {
    expect(parseHostMessage({ bridge: 1, kind: 'loadDoc', doc: { type: 'doc', content: [] }, editable: true })?.kind).toBe('loadDoc');
    expect(parseHostMessage({ bridge: 1, kind: 'insertImage', attachmentId: IMG, mime: 'image/png' })?.kind).toBe('insertImage');
    expect(parseHostMessage({ bridge: 1, kind: 'requestSubmit' })?.kind).toBe('requestSubmit');
    expect(parseHostMessage({ bridge: 1, kind: 'mentionResults', requestId: '1', users: [] })?.kind).toBe('mentionResults');
    expect(parseHostMessage({ bridge: 1, kind: 'uploadFailed', requestId: '1', message: 'x' })?.kind).toBe('uploadFailed');
  });

  it('planted defect: malformed, versionless, and alien messages become null, never throws', () => {
    for (const junk of [
      null, undefined, 42, 'loadDoc', [],
      { kind: 'loadDoc' },                                  // missing bridge version
      { bridge: 2, kind: 'loadDoc', doc: null, editable: true }, // wrong version
      { bridge: 1, kind: 'formatHardDrive' },               // alien kind
      { bridge: 1, kind: 'insertImage' },                   // missing fields
      { bridge: 1, kind: 'loadDoc', doc: { type: 'paragraph' }, editable: true }, // non-doc payload
    ]) {
      expect(parseHostMessage(junk), JSON.stringify(junk)).toBeNull();
    }
  });
});

describe('createEditorBridge', () => {
  it('announces ready on creation', () => {
    const { posted, editor } = harness();
    expect(posted[0]).toEqual({ bridge: 1, kind: 'ready' });
    editor.destroy();
  });

  it('loadDoc replaces the content without echoing a change', () => {
    const { posted, editor, bridge } = harness();
    const before = posted.length;
    bridge.handleHostMessage({
      bridge: 1,
      kind: 'loadDoc',
      doc: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'from the host' }] }] },
      editable: true,
    });
    expect(editor.getText()).toContain('from the host');
    expect(posted.slice(before).filter((m) => m.kind === 'change')).toHaveLength(0);
    editor.destroy();
  });

  it('typing posts change messages with the serialized doc (onChange)', () => {
    const { posted, editor } = harness();
    typeText(editor, 'typed in the webview');
    const changes = posted.filter((m) => m.kind === 'change');
    expect(changes.length).toBeGreaterThan(0);
    expect(JSON.stringify(changes.at(-1))).toContain('typed in the webview');
    editor.destroy();
  });

  it('requestSubmit answers submit with the current doc (onSubmit)', () => {
    const { posted, editor, bridge } = harness();
    typeText(editor, 'the comment');
    bridge.handleHostMessage({ bridge: 1, kind: 'requestSubmit' });
    const submit = posted.filter((m) => m.kind === 'submit').at(-1);
    expect(JSON.stringify(submit)).toContain('the comment');
    editor.destroy();
  });

  it('insertImage inserts an image node (insertImage(attachmentId))', () => {
    const { editor, bridge } = harness();
    bridge.handleHostMessage({ bridge: 1, kind: 'insertImage', attachmentId: IMG, mime: 'image/png', alt: 'shelf' });
    expect(JSON.stringify(editor.getJSON())).toContain(IMG);
    editor.destroy();
  });

  it('planted defect: insertImage with a non-image mime inserts nothing (layer 1 holds inside the webview)', () => {
    const { editor, bridge } = harness();
    const before = editor.getJSON();
    bridge.handleHostMessage({ bridge: 1, kind: 'insertImage', attachmentId: IMG, mime: 'application/pdf' });
    expect(editor.getJSON()).toEqual(before);
    editor.destroy();
  });

  it('requestUpload posts the verb; mention queries round-trip by requestId', async () => {
    const { posted, editor, bridge } = harness();
    bridge.requestUpload();
    expect(posted.some((m) => m.kind === 'requestUpload')).toBe(true);

    const pending = bridge.resolveMentions('an');
    const query = posted.filter((m) => m.kind === 'mentionQuery').at(-1) as { requestId: string; query: string };
    expect(query.query).toBe('an');
    bridge.handleHostMessage({
      bridge: 1,
      kind: 'mentionResults',
      requestId: query.requestId,
      users: [{ userId: '01J9GUSA000000000000000000', name: 'Anselma' }],
    });
    await expect(pending).resolves.toEqual([{ userId: '01J9GUSA000000000000000000', name: 'Anselma' }]);
    editor.destroy();
  });

  it('hostile input never throws and dispose stops the change stream', () => {
    const { posted, editor, bridge } = harness();
    expect(() => {
      bridge.handleHostMessage('�garbage�');
      bridge.handleHostMessage({ bridge: 1, kind: 'formatHardDrive' });
    }).not.toThrow();
    bridge.dispose();
    const before = posted.length;
    typeText(editor, 'after dispose');
    expect(posted.length).toBe(before);
    editor.destroy();
  });

  it('serializeEditorMessage is JSON.parse-stable', () => {
    const message: EditorToHostMessage = { bridge: 1, kind: 'mentionQuery', requestId: '7', query: 'an' };
    expect(JSON.parse(serializeEditorMessage(message))).toEqual(message);
  });
});
```

- [ ] **Step 2: Run it to verify it fails, then implement the protocol**

Run: `pnpm --filter @gisik-nokma/editor exec vitest run test/webview-bridge.test.ts`
Expected: FAIL — modules do not exist.

`packages/editor/src/webview/bridge.ts`:

```ts
import { isDocJson, type DocJson } from '../doc.js';
import type { MentionCandidate } from '../extensions/mention.js';

/** Protocol version — bump only with a coordinated Plan 10 change. */
export const EDITOR_BRIDGE_VERSION = 1 as const;

export type HostToEditorMessage =
  | { bridge: 1; kind: 'loadDoc'; doc: DocJson | null; editable: boolean }
  | { bridge: 1; kind: 'insertImage'; attachmentId: string; mime: string; alt?: string }
  | { bridge: 1; kind: 'requestSubmit' }
  | { bridge: 1; kind: 'mentionResults'; requestId: string; users: MentionCandidate[] }
  | { bridge: 1; kind: 'uploadFailed'; requestId: string; message: string };

export type EditorToHostMessage =
  | { bridge: 1; kind: 'ready' }
  | { bridge: 1; kind: 'change'; doc: DocJson }
  | { bridge: 1; kind: 'submit'; doc: DocJson }
  | { bridge: 1; kind: 'requestUpload'; requestId: string }
  | { bridge: 1; kind: 'mentionQuery'; requestId: string; query: string };

/**
 * Host messages arrive from outside this process: validate everything,
 * answer null for anything malformed, never throw. Unknown kinds are
 * ignored by design — an older bundle facing a newer host must degrade
 * quietly, not crash the composer.
 */
export function parseHostMessage(raw: unknown): HostToEditorMessage | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  if (record.bridge !== EDITOR_BRIDGE_VERSION) return null;
  switch (record.kind) {
    case 'loadDoc':
      if (record.doc !== null && !isDocJson(record.doc)) return null;
      if (typeof record.editable !== 'boolean') return null;
      return { bridge: 1, kind: 'loadDoc', doc: record.doc as DocJson | null, editable: record.editable };
    case 'insertImage':
      if (typeof record.attachmentId !== 'string' || typeof record.mime !== 'string') return null;
      return {
        bridge: 1,
        kind: 'insertImage',
        attachmentId: record.attachmentId,
        mime: record.mime,
        ...(typeof record.alt === 'string' ? { alt: record.alt } : {}),
      };
    case 'requestSubmit':
      return { bridge: 1, kind: 'requestSubmit' };
    case 'mentionResults': {
      if (typeof record.requestId !== 'string' || !Array.isArray(record.users)) return null;
      const users = record.users.filter(
        (user): user is MentionCandidate =>
          user !== null &&
          typeof user === 'object' &&
          typeof (user as { userId?: unknown }).userId === 'string' &&
          typeof (user as { name?: unknown }).name === 'string',
      );
      return { bridge: 1, kind: 'mentionResults', requestId: record.requestId, users };
    }
    case 'uploadFailed':
      if (typeof record.requestId !== 'string' || typeof record.message !== 'string') return null;
      return { bridge: 1, kind: 'uploadFailed', requestId: record.requestId, message: record.message };
    default:
      return null;
  }
}

export function serializeEditorMessage(message: EditorToHostMessage): string {
  return JSON.stringify(message);
}
```

`packages/editor/src/webview/create-editor-bridge.ts`:

```ts
import type { Editor } from '@tiptap/core';
import { emptyDoc, type DocJson } from '../doc.js';
import type { MentionCandidate } from '../extensions/mention.js';
import { parseHostMessage, type EditorToHostMessage } from './bridge.js';

export type EditorBridgeDeps = {
  editor: Editor;
  post(message: EditorToHostMessage): void;
};

export type EditorBridge = {
  handleHostMessage(raw: unknown): void;
  /** Mention data source for the webview editor: query rides the bridge. */
  resolveMentions(query: string): Promise<MentionCandidate[]>;
  /** The attach affordance / captured paste: ask the host to run its native upload. */
  requestUpload(): void;
  dispose(): void;
};

/**
 * Pure wiring between a live editor and a postMessage host — DOM-free so
 * the whole contract is provable in jsdom without a real WebView.
 */
export function createEditorBridge(deps: EditorBridgeDeps): EditorBridge {
  const { editor, post } = deps;
  let requestCounter = 0;
  let disposed = false;
  const pendingMentions = new Map<string, (users: MentionCandidate[]) => void>();

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
          editor.setEditable(message.editable);
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
    requestUpload() {
      post({ bridge: 1, kind: 'requestUpload', requestId: String(++requestCounter) });
    },
    dispose() {
      disposed = true;
      editor.off('update', onUpdate);
      pendingMentions.clear();
    },
  };
}
```

Run the bridge suite again — expected: PASS (11 tests).

- [ ] **Step 3: Write the webview entry and build config**

`packages/editor/src/webview/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
    <title>Gisik Nokma editor</title>
  </head>
  <body>
    <div id="editor-root"></div>
    <script type="module" src="./entry.tsx"></script>
  </body>
</html>
```

`packages/editor/src/webview/entry.tsx`:

```tsx
import { useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import type { Editor } from '@tiptap/core';
import { TicketEditor } from '../components/TicketEditor.js';
import { serializeEditorMessage, type EditorToHostMessage } from './bridge.js';
import { createEditorBridge, type EditorBridge } from './create-editor-bridge.js';
import '../styles/editor.css';

function post(message: EditorToHostMessage): void {
  const json = serializeEditorMessage(message);
  const rnWebView = (window as { ReactNativeWebView?: { postMessage(data: string): void } }).ReactNativeWebView;
  if (rnWebView) {
    rnWebView.postMessage(json);
  } else {
    // Browser dev harness: the parent frame plays host.
    window.parent.postMessage(json, '*');
  }
}

function WebviewEditorApp(): React.JSX.Element {
  const editorRef = useRef<Editor | null>(null);
  const bridgeRef = useRef<EditorBridge | null>(null);

  const handleReady = (): void => {
    const editor = editorRef.current;
    if (!editor || bridgeRef.current) return;
    const bridge = createEditorBridge({ editor, post });
    bridgeRef.current = bridge;

    const onMessage = (event: MessageEvent): void => {
      let data: unknown = event.data;
      if (typeof data === 'string') {
        try {
          data = JSON.parse(data);
        } catch {
          return; // hostile/foreign string — ignored
        }
      }
      bridge.handleHostMessage(data);
    };
    // iOS delivers on window, Android's RN WebView on document — listen on both.
    window.addEventListener('message', onMessage);
    document.addEventListener('message', onMessage as EventListener);
  };

  useEffect(
    () => () => {
      bridgeRef.current?.dispose();
    },
    [],
  );

  return (
    <TicketEditor
      queryUsers={(query) => bridgeRef.current?.resolveMentions(query) ?? Promise.resolve([])}
      // Files never cross the bridge: the host owns uploads end to end.
      uploadAttachment={() => Promise.reject(new Error('uploads are host-mediated in the webview'))}
      onAttachmentAdded={() => {}}
      captureFiles={() => {
        bridgeRef.current?.requestUpload();
        return true;
      }}
      onSubmit={(doc) => post({ bridge: 1, kind: 'submit', doc })}
      onEditorReady={handleReady}
      editorRef={editorRef}
    />
  );
}

const rootElement = document.getElementById('editor-root');
if (rootElement) {
  createRoot(rootElement).render(<WebviewEditorApp />);
}
```

`packages/editor/vite.webview.config.ts`:

```ts
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

/**
 * The RN webview bundle: ONE self-contained html file (scripts and styles
 * inlined) so Plan 10 can ship it as a static asset with no dev server
 * and no network fetches inside the WebView.
 */
export default defineConfig({
  root: 'src/webview',
  plugins: [react(), viteSingleFile()],
  build: {
    outDir: '../../dist-webview',
    emptyOutDir: true,
  },
});
```

- [ ] **Step 4: Build the bundle and verify it is self-contained**

Run: `pnpm --filter @gisik-nokma/editor run build:webview && node -e "const fs=require('fs');const html=fs.readFileSync('packages/editor/dist-webview/index.html','utf8');const inline=(html.match(/<script/g)||[]).length;const external=(html.match(/<script[^>]*src=/g)||[]).length;console.log({bytes:html.length,scripts:inline,externalScripts:external});if(external>0||inline===0)process.exit(1)"`
Expected: prints a byte count with `scripts ≥ 1` and `externalScripts: 0`; exit 0 — every byte the webview needs is in the one file.

- [ ] **Step 5: Export the bridge surface and run the full package suite**

Append to `packages/editor/src/index.ts`:

```ts
export {
  EDITOR_BRIDGE_VERSION,
  parseHostMessage,
  serializeEditorMessage,
  type EditorToHostMessage,
  type HostToEditorMessage,
} from './webview/bridge.js';
export { createEditorBridge, type EditorBridge, type EditorBridgeDeps } from './webview/create-editor-bridge.js';
```

Run: `pnpm --filter @gisik-nokma/editor test && pnpm --filter @gisik-nokma/editor build && pnpm --filter @gisik-nokma/editor typecheck`
Expected: all suites PASS; both builds clean. (`tsconfig.json` `include: ["src"]` already covers `src/webview`; the Vite build is separate output, `dist-webview/` — add `dist-webview/` to `.gitignore` if `dist/` is not already covering it.)

- [ ] **Step 6: Commit**

```bash
git add packages/editor .gitignore
git commit -m "Webview bridge: five verbs between RN host and editor bundle, hostile messages parsed to null not crashes, files never cross the bridge, and a single-file build Plan 10 can ship as-is"
```

---
