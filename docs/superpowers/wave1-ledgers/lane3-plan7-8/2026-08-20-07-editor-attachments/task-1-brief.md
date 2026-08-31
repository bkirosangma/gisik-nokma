### Task 1: `packages/editor` scaffold and document schema v1

**Files:**
- Create: `packages/editor/package.json`
- Create: `packages/editor/tsconfig.json`
- Create: `packages/editor/vitest.config.ts`
- Create: `packages/editor/src/doc.ts`
- Create: `packages/editor/src/schema/versioned-document.ts`
- Create: `packages/editor/src/schema/extensions.ts`
- Create: `packages/editor/src/index.ts`
- Create: `packages/editor/test/helpers/create-editor.ts`
- Create: `packages/editor/test/helpers/type-text.ts`
- Test: `packages/editor/test/schema.test.ts`

**Interfaces:**
- Consumes: Plan 1's workspace scaffold (`pnpm-workspace.yaml` globs `packages/*`, `tsconfig.base.json`).
- Produces (cross-plan API):
  - Package `@gisik-nokma/editor` (exports `.` and `./webview-bridge`).
  - `DOC_SCHEMA_VERSION = 1`; `type DocJson = { type: 'doc' } & Record<string, unknown>`; `emptyDoc(): DocJson`; `isDocJson(value: unknown): value is DocJson`.
  - `buildEditorExtensions(options?: EditorSchemaOptions): Extensions` where `type EditorSchemaOptions = { queryUsers?: (query: string) => Promise<MentionCandidate[]>; resolveAttachmentUrl?: (attachmentId: string) => string; placeholder?: string }` — the ONE place the document schema is defined. Tasks 3–5 extend it; every editor surface (web, desktop, webview) calls it.
  - **Document schema v1** (the closed node/mark vocabulary; the doc node carries `attrs.schemaVersion: 1`): nodes `doc`, `paragraph`, `text`, `heading` (levels 1–6), `bulletList`, `orderedList`, `listItem`, `blockquote`, `codeBlock`, `horizontalRule`, `hardBreak`, `table`, `tableRow`, `tableHeader`, `tableCell`, plus `image` (Task 3) and `mention` (Task 4); marks `bold`, `italic`, `strike`, `code`, `link`.
  - Test helpers `createTestEditor(options?, content?)` and `typeText(editor, text)` (used by every editor test in this plan).

- [ ] **Step 1: Write the package manifest and configs**

`packages/editor/package.json`:

```json
{
  "name": "@gisik-nokma/editor",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": "./dist/index.js",
    "./webview-bridge": "./dist/webview/bridge.js"
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "build:webview": "vite build --config vite.webview.config.ts",
    "test": "vitest run",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "@gisik-nokma/domain": "workspace:*",
    "@tiptap/core": "^3.22.3",
    "@tiptap/extension-document": "^3.22.3",
    "@tiptap/extension-link": "^3.22.3",
    "@tiptap/extension-placeholder": "^3.22.3",
    "@tiptap/extension-table": "^3.22.3",
    "@tiptap/extension-table-cell": "^3.22.3",
    "@tiptap/extension-table-header": "^3.22.3",
    "@tiptap/extension-table-row": "^3.22.3",
    "@tiptap/pm": "^3.22.3",
    "@tiptap/react": "^3.22.3",
    "@tiptap/starter-kit": "^3.22.3",
    "@tiptap/suggestion": "^3.22.3"
  },
  "peerDependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@testing-library/react": "^16.1.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.3.4",
    "jsdom": "^25.0.1",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "typescript": "^5.6.3",
    "vite": "^6.0.0",
    "vite-plugin-singlefile": "^2.0.3",
    "vitest": "^3.1.0"
  }
}
```

`packages/editor/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "jsx": "react-jsx",
    "lib": ["ES2023", "DOM", "DOM.Iterable"]
  },
  "include": ["src"]
}
```

`packages/editor/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['test/**/*.test.ts', 'test/**/*.test.tsx'],
  },
});
```

Run: `pnpm install`
Expected: lockfile updates; `@gisik-nokma/editor` appears in the workspace.

- [ ] **Step 2: Verify the named-export convention against the installed packages**

The whole plan leans on Tiptap v3's named exports (knowledge-base lesson). Prove it before writing imports:

Run: `node -e "Promise.all([import('@tiptap/extension-document'),import('@tiptap/extension-link'),import('@tiptap/extension-table')]).then(ms => ms.forEach(m => console.log(Object.keys(m))))"`
Expected: each key list contains the capitalised named export (`Document`, `Link`, `Table`). If a named export is missing in the installed minor version, use the default export for that one package and note it in the task's commit message — do not silently change other imports.

- [ ] **Step 3: Write the failing schema test**

`packages/editor/test/schema.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { DOC_SCHEMA_VERSION, emptyDoc, isDocJson } from '../src/doc.js';
import { createTestEditor } from './helpers/create-editor.js';

describe('document schema v1', () => {
  it('exposes every node and mark the spec names', () => {
    const editor = createTestEditor();
    const nodes = Object.keys(editor.schema.nodes);
    const marks = Object.keys(editor.schema.marks);
    for (const node of [
      'doc', 'paragraph', 'text', 'heading', 'bulletList', 'orderedList', 'listItem',
      'blockquote', 'codeBlock', 'horizontalRule', 'hardBreak',
      'table', 'tableRow', 'tableHeader', 'tableCell',
    ]) {
      expect(nodes, `schema is missing node "${node}"`).toContain(node);
    }
    for (const mark of ['bold', 'italic', 'strike', 'code', 'link']) {
      expect(marks, `schema is missing mark "${mark}"`).toContain(mark);
    }
    editor.destroy();
  });

  it('stamps schemaVersion 1 into the serialized doc', () => {
    const editor = createTestEditor();
    const json = editor.getJSON() as { type: string; attrs?: { schemaVersion?: number } };
    expect(json.type).toBe('doc');
    expect(json.attrs?.schemaVersion).toBe(DOC_SCHEMA_VERSION);
    editor.destroy();
  });

  it('round-trips its own JSON byte-stably', () => {
    const editor = createTestEditor(undefined, {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'GST filing' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'due ', marks: [] }, { type: 'text', text: 'soon', marks: [{ type: 'bold' }] }] },
      ],
    });
    const first = editor.getJSON();
    editor.commands.setContent(first);
    expect(editor.getJSON()).toEqual(first);
    editor.destroy();
  });

  it('accepts a version-less doc (attrs default fills in)', () => {
    const editor = createTestEditor(undefined, { type: 'doc', content: [{ type: 'paragraph' }] });
    const json = editor.getJSON() as { attrs?: { schemaVersion?: number } };
    expect(json.attrs?.schemaVersion).toBe(1);
    editor.destroy();
  });

  it('planted defect: a doc claiming a node outside schema v1 is refused', () => {
    const editor = createTestEditor();
    expect(() =>
      editor.commands.setContent(
        { type: 'doc', content: [{ type: 'marquee', content: [] }] },
        { errorOnInvalidContent: true },
      ),
    ).toThrow();
    editor.destroy();
  });

  it('emptyDoc is a paragraph-bearing doc and isDocJson agrees', () => {
    const doc = emptyDoc();
    expect(isDocJson(doc)).toBe(true);
    expect(isDocJson({ type: 'paragraph' })).toBe(false);
    expect(isDocJson(null)).toBe(false);
    expect(isDocJson('doc')).toBe(false);
    const editor = createTestEditor(undefined, doc);
    expect(editor.getText()).toBe('');
    editor.destroy();
  });
});
```

- [ ] **Step 4: Run it to verify it fails**

Run: `pnpm --filter @gisik-nokma/editor exec vitest run test/schema.test.ts`
Expected: FAIL — cannot resolve `../src/doc.js` / `./helpers/create-editor.js`.

- [ ] **Step 5: Implement doc.ts, the versioned document, and the extension builder**

`packages/editor/src/doc.ts`:

```ts
export const DOC_SCHEMA_VERSION = 1;

/**
 * A ticket document as it travels inside event payloads (`comment.added`
 * body, description `ticket.field_set` value): ProseMirror JSON, opaque
 * outside this package. The doc node's attrs carry `schemaVersion`, so
 * every stored document names the schema that wrote it — versioning rides
 * inside the JSON, and older version-less docs parse with the default.
 */
export type DocJson = { type: 'doc' } & Record<string, unknown>;

export function emptyDoc(): DocJson {
  return {
    type: 'doc',
    attrs: { schemaVersion: DOC_SCHEMA_VERSION },
    content: [{ type: 'paragraph' }],
  };
}

export function isDocJson(value: unknown): value is DocJson {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    (value as { type?: unknown }).type === 'doc'
  );
}
```

`packages/editor/src/schema/versioned-document.ts`:

```ts
import { Document } from '@tiptap/extension-document';
import { DOC_SCHEMA_VERSION } from '../doc.js';

/**
 * The stock document node plus a `schemaVersion` attribute. `rendered:
 * false` keeps it out of the DOM — it exists purely in the serialized
 * JSON, where projections and future migrations can read it.
 */
export const VersionedDocument = Document.extend({
  addAttributes() {
    return {
      schemaVersion: { default: DOC_SCHEMA_VERSION, rendered: false },
    };
  },
});
```

`packages/editor/src/schema/extensions.ts` (Tasks 3–5 extend this file; this is its Task-1 form):

```ts
import type { Extensions } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Link } from '@tiptap/extension-link';
import { Placeholder } from '@tiptap/extension-placeholder';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableHeader } from '@tiptap/extension-table-header';
import { TableCell } from '@tiptap/extension-table-cell';
import { VersionedDocument } from './versioned-document.js';

export type EditorSchemaOptions = {
  /** Mention picker data source (Task 4). Absent → mentions render but the picker offers nobody. */
  queryUsers?: (query: string) => Promise<Array<{ userId: string; name: string }>>;
  /** Maps an image node's attachmentId to a URL (Task 3). Defaults to the server route. */
  resolveAttachmentUrl?: (attachmentId: string) => string;
  placeholder?: string;
};

/**
 * The ONE origin of document schema v1. Every editor surface — web,
 * desktop, the RN webview bundle, and every test — builds its extension
 * list here, so there is exactly one schema and it cannot drift between
 * clients (spec §2: one document schema across all three clients).
 */
export function buildEditorExtensions(options: EditorSchemaOptions = {}): Extensions {
  return [
    StarterKit.configure({
      // Replaced by VersionedDocument so the doc node carries schemaVersion.
      document: false,
      // Configured separately below: no autolink (typed URLs stay literal
      // text — nothing silently becomes markup), no open-on-click while editing.
      link: false,
    }),
    VersionedDocument,
    Link.configure({ openOnClick: false, autolink: false }),
    Placeholder.configure({ placeholder: options.placeholder ?? 'Write…' }),
    Table.configure({ resizable: false }),
    TableRow,
    TableHeader,
    TableCell,
  ];
}
```

`packages/editor/src/index.ts` (Task-1 form; later tasks append exports):

```ts
export { DOC_SCHEMA_VERSION, emptyDoc, isDocJson, type DocJson } from './doc.js';
export { buildEditorExtensions, type EditorSchemaOptions } from './schema/extensions.js';
```

- [ ] **Step 6: Implement the test helpers**

`packages/editor/test/helpers/create-editor.ts`:

```ts
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
```

`packages/editor/test/helpers/type-text.ts`:

```ts
import type { Editor } from '@tiptap/core';

/**
 * Simulate real per-character typing. `insertContent`/`insertText` bypass
 * ProseMirror's `handleTextInput`, so input rules never fire under them;
 * routing each character through `someProp('handleTextInput')` follows the
 * same path the browser's beforeinput handling does. When no plugin
 * consumes the character, fall back to a plain insertText transaction —
 * exactly what the real editor does.
 */
export function typeText(editor: Editor, text: string): void {
  for (const char of text) {
    const { view } = editor;
    const { from, to } = view.state.selection;
    const handled = view.someProp('handleTextInput', (handler) => handler(view, from, to, char));
    if (!handled) {
      view.dispatch(view.state.tr.insertText(char, from, to));
    }
  }
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `pnpm --filter @gisik-nokma/editor exec vitest run test/schema.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 8: Build and typecheck**

Run: `pnpm --filter @gisik-nokma/editor build && pnpm --filter @gisik-nokma/editor typecheck`
Expected: `dist/` emitted; clean.

- [ ] **Step 9: Commit**

```bash
git add packages/editor pnpm-lock.yaml
git commit -m "Editor package: document schema v1 with an in-band schemaVersion, one extension origin for every client, and a typing simulator that drives real input rules"
```

---

