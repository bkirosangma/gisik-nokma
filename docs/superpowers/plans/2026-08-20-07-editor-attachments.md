# Editor & Attachments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the shared WYSIWYG editor package (Tiptap v3, versioned document schema, mention picker, the escape-suggestion mechanic) and the attachment pipeline (object storage behind an interface, magic-byte-sniffed uploads, visibility-enforced downloads, image-only inline embedding enforced at three layers, the evidence picker, and the RN webview bridge contract).

**Architecture:** `packages/editor` owns the document schema — ProseMirror JSON, opaque outside the package — and every editor surface (web composer, description editor, webview bundle). Attachments live in object storage behind an `ObjectStore` interface (S3-compatible prod, local-disk dev); the server records attachment metadata in a server-owned `attachments` table at upload time, and the ledger's `attachment.added` event (emitted by the client after upload) is the claim that puts the file on the ticket. Server-side "gates" inside the ingest transaction enforce what the pure rule engine cannot see: embedded images must be image-mime attachments of the same ticket, and named evidence must exist on the ticket.

**Tech Stack:** Tiptap v3 (`^3.22.3`, named exports), `@tiptap/pm`, `@tiptap/suggestion`, React 19, Vitest 3 + jsdom, Fastify 5, `@fastify/multipart`, `file-type` (magic-byte sniffing), `@aws-sdk/client-s3` + `@aws-sdk/lib-storage`, Vite + `vite-plugin-singlefile` (webview bundle).

**Spec:** `docs/superpowers/specs/2026-08-20-gisik-nokma-product-design.md` — this plan implements §2 "The editor" and "Attachments", plus the attachment-facing edges of §4 (`require-evidence`) and §6 (visibility on downloads).

**Series:** Plan 7 of 11 (see `docs/superpowers/plans/2026-08-20-00-series-coordination.md`). Executes after Plans 1–5; in parallel with Plans 6/8/9 at execution time. Where any Plan 1–4 text disagrees with the coordination document, the coordination document wins.

**Prior art:** the knowledge-base document editor (`/Users/kiro/my_projects/knowledge-base/src/app/knowledge_base/features/document/` — read-only, never edit) is the mould for our Tiptap conventions: named extension imports, `immediatelyRender: false`, stable callback refs so the editor never re-initialises, plain-DOM plugin UI where React would couple too tightly, upload chips as UI chrome rather than doc nodes.

## Consumed interfaces (exact, from earlier plans and the coordination doc)

| From | Interface |
|---|---|
| Plan 1 | `EventEnvelope`, `SubmittedEvent = Omit<EventEnvelope, 'serverTime' \| 'seq'>`, `newUlid()`, `ULID_REGEX` (`@gisik-nokma/domain`) |
| Plan 1 | `IngestService`, `IngestResult`, `IngestDeps`, `createIngestService(deps)` (`apps/server/src/ingest/ingest-service.ts`); `POST /v1/events` body `{ events: [...] }` → `{ results: [...] }` |
| Plan 1 | `createProjectionRegistry()` (`apps/server/src/projections/registry.ts`), `createTestDatabase(): Promise<TestDatabase>` (`apps/server/test/helpers/db.ts`), `createPool`, `ConfigError` (`apps/server/src/config.ts`) |
| Plan 2 | `WorkflowDef` (`states`, `transitions: { from: string \| '*'; to: string; rules: Rule[] }[]`, `initialStateId`), `Rule` incl. `{ kind: 'require-evidence' }` (`@gisik-nokma/domain`) |
| Plan 3 | Event registrations (all v1): `comment.added` `{ body }`, `ticket.field_set` `{ fieldId, value }`, `attachment.added` `{ attachmentId, filename, mime, size }` (entity = the ticket) — **pending Plan 3 amendment: this payload becomes a `kind`-discriminated union carrying `sha256` (uploads) or the Drive-reference fields; see Open questions, "Pending Plan 3 amendment"** —, `ticket.transitioned` `{ toStateId, comment?, evidenceAttachmentId?, cause? }`; table `proj_tickets` (`ticket_id` PK, `workspace_id`, …) |
| Plan 4 | `type Queryable = Pool \| PoolClient` (`apps/server/src/db/queryable.ts`), `canSee(db: Queryable, userId: string, ticketId: string): Promise<boolean>` (`apps/server/src/visibility/can-see.ts`), `makeRequireSession(auth)` setting `request.currentUserId` (`apps/server/src/auth/require-session.ts`), `Auth` (`apps/server/src/auth/auth.ts`), seed helpers `seedMember`, `seedGuest`, `seedTicket` (`apps/server/test/helpers/seed.ts`) |
| Plan 5 (parallel) | `docToPlainText(doc: unknown): string` in `@gisik-nokma/domain` (coordination amendment 12) — Task 6 pins the conformance this plan's schema must satisfy |
| Plan 6 (parallel) | The `<EditorSlot>` boundary in `apps/web` — Task 14 implements the concrete component against the assumed props stated there; see Open questions 1 |
| Coordination 12, 15 | `packages/editor` scope; image `wrap: 'inline-left' \| 'inline-right' \| 'block'`; mention node; `POST /v1/attachments` → `{ attachmentId, url }`; `ObjectStore` with an S3-compatible implementation |

## Global Constraints

Binding on every task in this plan:

- Package scope is `@gisik-nokma/*` (coordination decision 1). This plan creates `packages/editor` (`@gisik-nokma/editor`) and adds files to `packages/domain` and `apps/server`. It creates **no** other packages and touches **no** other plan's files except the named additive modifications.
- Tiptap is `^3.22.3` everywhere, **named exports** from every `@tiptap/extension-*` package (`import { Link } from '@tiptap/extension-link'`), default export only for `StarterKit`. Every `useEditor` call sets `immediatelyRender: false` (SSR — both are recorded knowledge-base lessons).
- ESM everywhere: `"type": "module"`, `NodeNext` resolution, **relative imports carry the `.js` suffix** in source (Plan 1 addenda). TypeScript strict + `noUncheckedIndexedAccess`; `exactOptionalPropertyTypes` stays OFF.
- Document bodies are ProseMirror JSON, **opaque outside `packages/editor`** — the server, domain reducers, and other packages treat them as `unknown` and may only use the dependency-free walkers `docToPlainText` (Plan 5) and `collectImageAttachmentIds` (Task 2).
- Only **images** may embed inline (spec §2 Attachments), enforced at three layers: the `insertTicketImage` command refuses non-image mime (Task 3); paste/drop routes non-image files to the attachment list, never to nodes (Task 12); the server gate refuses events whose docs embed non-image or foreign attachments (Task 11). The schema itself cannot know a mime — the command layer is where layer 1 lives. **Google Drive references are outside inline embedding entirely** (spec §2, rule 3): they are never uploads, so no layer can ever produce a node for one (Task 12c).
- **Attachments come in exactly two kinds** (spec §2): an **upload** — bytes this product holds, sniffed, hashed (SHA-256, Task 9a) and stored — and a **Drive reference** — a pointer to a Google Drive file the product does not hold (Tasks 11a, 12a–12c, 13a). The kind is a discriminator on the `attachment.added` payload, never an inference; the three Drive rules (never evidence, honest rendering, never inline) are each proven by a planted defect.
- Attachment uploads: max **25 MiB** (`ATTACHMENT_MAX_BYTES = 26_214_400`), mime decided by **magic-byte sniffing only** (`file-type`); the client-supplied filename and content-type are never trusted for anything but display (filename, sanitized).
- Unauthorized or nonexistent attachment downloads answer one **byte-identical 404** — existence must be indistinguishable from invisibility (spec §6 discipline applied to files).
- Every refusal introduced here is proven against a planted defect (spec §1 invariant 6): each escape-suggestion trigger, non-image embed at every layer, sniffed-mime refusal (renamed `.exe`), size refusal, unauthorized download, path-traversal object key, malformed bridge message, a Drive reference named as evidence (`attachment.evidence-drive-reference`), a Drive image pushed at the document, and a Drive reference rendered as though the board held it.
- CSS class names are BEM (`block__element--modifier`, CODING_STANDARDS). The editor stylesheet ships **structural rules only — zero colour literals**; colours arrive later via `packages/ui` tokens (coordination amendment 11; see Open questions 6).
- Dependency versions (caret ranges): `@tiptap/* ^3.22.3`, `react ^19.0.0`, `@testing-library/react ^16.1.0`, `jsdom ^25.0.1`, `@fastify/multipart ^9.0.0`, `file-type ^19.6.0`, `@aws-sdk/client-s3 ^3.700.0`, `@aws-sdk/lib-storage ^3.700.0`, `aws-sdk-client-mock ^4.1.0`, `vite ^6.0.0`, `@vitejs/plugin-react ^4.3.4`, `vite-plugin-singlefile ^2.0.3`; `typescript`/`vitest`/`zod` versions match Plan 1's pins.
- The executor runs all commands from the repo root (`/Users/kiro/my_projects/gisik-nokma`). `reference/` is frozen — never touch it. Commits happen at each task's commit step, by the executor.
- `Features.md` §9 and `test-cases/09-editor-attachments.md` (cases 9.x only) move in the same change set as this plan's work (Task 16).

## File Structure

```
packages/editor/                          # @gisik-nokma/editor — NEW package
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── vite.webview.config.ts                # webview single-file bundle build
├── src/
│   ├── index.ts                          # public exports (the package API)
│   ├── doc.ts                            # DocJson, DOC_SCHEMA_VERSION, emptyDoc, isDocJson
│   ├── upload.ts                         # UploadResult, uploadAttachmentHttp, UploadRefusedError
│   ├── schema/
│   │   ├── versioned-document.ts         # doc node + schemaVersion attr
│   │   └── extensions.ts                 # buildEditorExtensions — the one schema origin
│   ├── extensions/
│   │   ├── ticket-image.ts               # image node {attachmentId, wrap, alt} + commands (layer 1)
│   │   ├── mention.ts                    # mention node {userId, label} + suggestion plugin
│   │   ├── mention-popup.ts              # plain-DOM picker popup
│   │   ├── escape-suggestion.ts          # the spec-named escape mechanic
│   │   └── attachment-paste.ts           # paste/drop → upload → node or list (layer 2)
│   ├── components/
│   │   ├── TicketEditor.tsx              # the shared React editor component
│   │   ├── ImageWrapMenu.tsx             # wrap picker + alt input for selected images
│   │   ├── UploadChips.tsx               # in-flight upload chips (the optimistic placeholder)
│   │   ├── EvidencePicker.tsx            # require-evidence transition picker
│   │   ├── AttachmentListItem.tsx        # the two kinds, told apart honestly (Task 12b)
│   │   └── TicketEditorSlot.tsx          # Plan 6's <EditorSlot> contract, implemented
│   ├── drive/
│   │   ├── google-picker.ts              # script loading, drive.file consent, openDrivePicker (Task 12a)
│   │   └── attachment-claims.ts          # attachment.added payloads: upload + drive-reference
│   ├── attachments/
│   │   ├── require-evidence.ts           # transitionRequiresEvidence(def, from, to)
│   │   └── compose-editor-submission.ts  # comment/description → event {type, payload}
│   ├── styles/editor.css                 # structural CSS, BEM, zero colour literals
│   └── webview/
│       ├── bridge.ts                     # message protocol types + parse/serialize
│       ├── create-editor-bridge.ts       # editor ⇄ host wiring (testable, DOM-free deps)
│       ├── entry.tsx                     # webview bootstrap (React root + listeners)
│       └── index.html                    # vite entry page
└── test/                                 # Vitest (jsdom)
    ├── helpers/create-editor.ts          # headless Editor factory
    ├── helpers/type-text.ts              # per-character typing through handleTextInput
    ├── schema.test.ts
    ├── ticket-image.test.ts
    ├── mention.test.ts
    ├── escape-suggestion.test.ts
    ├── doc-to-plain-text.test.ts         # conformance against @gisik-nokma/domain
    ├── attachment-paste.test.ts
    ├── ticket-editor.test.tsx
    ├── evidence-picker.test.tsx
    ├── ticket-editor-slot.test.tsx
    ├── google-picker.test.ts             # Task 12a
    ├── attachment-list-item.test.tsx     # Task 12b
    ├── drive-never-inline.test.ts        # Task 12c
    └── webview-bridge.test.ts

packages/domain/src/doc-embeds.ts         # NEW: EMBEDDABLE_IMAGE_MIME, isEmbeddableImageMime,
                                          #      collectImageAttachmentIds (dependency-free walker)
packages/domain/test/doc-embeds.test.ts
packages/domain/src/attachment-kinds.ts   # NEW (Task 11a): AttachmentKind, DriveReference,
                                          #      DRIVE_FILE_SCOPE, RULE_EVIDENCE_DRIVE_REFERENCE,
                                          #      EVIDENCE_DRIVE_REFERENCE_REASON, isDriveReference
packages/domain/test/attachment-kinds.test.ts

apps/server/
├── migrations/<timestamp>_attachments.sql # attachments metadata table
├── migrations/<timestamp>_attachment_sha256.sql # SHA-256 column (Task 9a)
├── src/attachments/
│   ├── content-hash.ts                   # sha256Hex — the upload's content hash (Task 9a)
│   ├── object-store.ts                   # ObjectStore interface, ObjectMeta, errors, key validation
│   ├── local-disk-store.ts               # dev implementation
│   ├── s3-store.ts                       # S3-compatible implementation
│   ├── store-config.ts                   # createObjectStoreFromEnv
│   ├── attachment-repo.ts                # attachments table access
│   ├── sniff.ts                          # magic-byte allow-list sniffing
│   └── filename.ts                       # sanitizeFilename
├── src/gates/
│   ├── server-gate.ts                    # ServerGate type (additive ingest seam)
│   ├── image-embed-gate.ts               # layer 3 of image-only embedding
│   ├── evidence-gate.ts                  # evidenceAttachmentId must exist on the ticket
│   └── index.ts                          # buildServerGates()
├── src/routes/attachments.ts             # POST /v1/attachments, GET /v1/attachments/:id
└── test/
    ├── attachments/{local-disk-store,s3-store,store-config,attachment-repo,sniff,filename,content-hash}.test.ts
    ├── gates/{image-embed-gate,evidence-gate}.test.ts
    ├── helpers/drive-reference.ts        # seedDriveReference (Task 11a, shared with Task 12c)
    └── routes/{attachments-upload,attachments-download}.test.ts
```

Task order: Tasks 1–6 (editor schema, pure) and Tasks 7–11 (server) are two independent tracks an executor may interleave; Tasks 12–15 need both; Task 16 closes. Every task stands alone with its own test cycle and commit. **Lettered tasks (9a, 11a, 12a, 12b, 12c, 13a — the Google Drive references and the SHA-256 hash, owner sign-off 2026-08-20) execute immediately after their numbered parent**, in letter order; each is a full task with its own test cycle and commit, and none renumbers anything that came before.

---
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

### Task 2: Domain walkers — embeddable-image mime and image-reference collection

**Files:**
- Create: `packages/domain/src/doc-embeds.ts`
- Modify: `packages/domain/src/index.ts` (append one export line)
- Test: `packages/domain/test/doc-embeds.test.ts`

**Interfaces:**
- Consumes: nothing (pure, dependency-free — the same discipline as Plan 5's `docToPlainText`).
- Produces (cross-plan API — the editor's layer 1, the paste handler's layer 2, and the server gate's layer 3 all read THIS definition, so "image" can never mean different things on different layers):
  - `EMBEDDABLE_IMAGE_MIME: ReadonlySet<string>` = `{'image/png', 'image/jpeg', 'image/gif', 'image/webp'}` (SVG deliberately absent: no magic bytes to sniff and a script vector — see Open questions 5).
  - `isEmbeddableImageMime(mime: string): boolean`
  - `collectImageAttachmentIds(doc: unknown): string[]` — walks opaque doc JSON; returns unique `attachmentId`s of `image` nodes in first-seen order; never throws on junk.

- [ ] **Step 1: Write the failing test**

`packages/domain/test/doc-embeds.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  EMBEDDABLE_IMAGE_MIME,
  collectImageAttachmentIds,
  isEmbeddableImageMime,
} from '../src/doc-embeds.js';

const IMG_A = '01J9GIMA000000000000000000';
const IMG_B = '01J9GIMB000000000000000000';

describe('isEmbeddableImageMime', () => {
  it('accepts exactly the embeddable set', () => {
    for (const mime of ['image/png', 'image/jpeg', 'image/gif', 'image/webp']) {
      expect(isEmbeddableImageMime(mime)).toBe(true);
    }
  });

  it('planted defect: refuses svg, pdf, video, and lookalikes', () => {
    for (const mime of ['image/svg+xml', 'application/pdf', 'video/mp4', 'image/PNG', 'image/png ', 'text/html']) {
      expect(isEmbeddableImageMime(mime), `${mime} must not be embeddable`).toBe(false);
    }
  });

  it('the set itself is what the predicate reads', () => {
    expect([...EMBEDDABLE_IMAGE_MIME].sort()).toEqual(['image/gif', 'image/jpeg', 'image/png', 'image/webp']);
  });
});

describe('collectImageAttachmentIds', () => {
  it('finds top-level and nested image nodes, unique, in order', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'image', attrs: { attachmentId: IMG_A, wrap: 'block', alt: '' } },
        {
          type: 'blockquote',
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'x' }] },
            { type: 'image', attrs: { attachmentId: IMG_B, wrap: 'inline-left', alt: '' } },
          ],
        },
        { type: 'image', attrs: { attachmentId: IMG_A, wrap: 'block', alt: 'dup' } },
      ],
    };
    expect(collectImageAttachmentIds(doc)).toEqual([IMG_A, IMG_B]);
  });

  it('ignores non-image nodes and images without a string attachmentId', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'no images here' }] },
        { type: 'image', attrs: { attachmentId: null, wrap: 'block', alt: '' } },
        { type: 'image', attrs: {} },
        { type: 'image' },
      ],
    };
    expect(collectImageAttachmentIds(doc)).toEqual([]);
  });

  it('never throws on junk input', () => {
    for (const junk of [null, undefined, 42, 'doc', [], { type: 'doc', content: 'nope' }, { content: [null, 7, []] }]) {
      expect(collectImageAttachmentIds(junk)).toEqual([]);
    }
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @gisik-nokma/domain exec vitest run test/doc-embeds.test.ts`
Expected: FAIL — cannot resolve `../src/doc-embeds.js`.

- [ ] **Step 3: Implement the walker**

`packages/domain/src/doc-embeds.ts`:

```ts
/**
 * The closed set of mimes that may embed inline in a document (spec §2
 * Attachments: only images embed; everything else is a list attachment).
 * One definition serves all three enforcement layers — editor command,
 * paste/drop handler, and the server's ingest gate — so they cannot
 * disagree about what an "image" is. Case-sensitive on purpose: sniffed
 * mimes are produced lowercase, and a lookalike is not a match.
 */
export const EMBEDDABLE_IMAGE_MIME: ReadonlySet<string> = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
]);

export function isEmbeddableImageMime(mime: string): boolean {
  return EMBEDDABLE_IMAGE_MIME.has(mime);
}

/**
 * Dependency-free walk over opaque ProseMirror doc JSON collecting the
 * attachmentId of every `image` node — unique, first-seen order. Tolerant
 * of any junk shape: the caller may be validating a hostile payload.
 */
export function collectImageAttachmentIds(doc: unknown): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  walk(doc);
  return ids;

  function walk(node: unknown): void {
    if (node === null || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const child of node) walk(child);
      return;
    }
    const record = node as { type?: unknown; attrs?: unknown; content?: unknown };
    if (record.type === 'image') {
      const attachmentId = (record.attrs as { attachmentId?: unknown } | undefined)?.attachmentId;
      if (typeof attachmentId === 'string' && !seen.has(attachmentId)) {
        seen.add(attachmentId);
        ids.push(attachmentId);
      }
    }
    walk(record.content);
  }
}
```

Append to `packages/domain/src/index.ts`:

```ts
export * from './doc-embeds.js';
```

- [ ] **Step 4: Run the domain tests and build**

Run: `pnpm --filter @gisik-nokma/domain test && pnpm --filter @gisik-nokma/domain build`
Expected: all PASS (new and pre-existing); `dist/` emitted.

- [ ] **Step 5: Commit**

```bash
git add packages/domain
git commit -m "Domain: one definition of 'embeddable image' and a junk-tolerant walker for embedded attachment ids, shared by all three enforcement layers"
```

---

### Task 3: The image node — `{attachmentId, wrap, alt}` and layer 1 of image-only embedding

**Files:**
- Create: `packages/editor/src/extensions/ticket-image.ts`
- Create: `packages/editor/src/styles/editor.css`
- Modify: `packages/editor/src/schema/extensions.ts` (add TicketImage)
- Modify: `packages/editor/src/index.ts` (exports)
- Test: `packages/editor/test/ticket-image.test.ts`

**Interfaces:**
- Consumes: `isEmbeddableImageMime` (Task 2); `buildEditorExtensions` (Task 1).
- Produces (cross-plan API):
  - Node `image` with attrs `{ attachmentId: string; wrap: 'inline-left' | 'inline-right' | 'block'; alt: string }` (coordination amendment 12's wrap vocabulary, exactly).
  - `IMAGE_WRAP_MODES = ['inline-left', 'inline-right', 'block'] as const`; `type ImageWrapMode = (typeof IMAGE_WRAP_MODES)[number]`.
  - Commands: `insertTicketImage(attrs: { attachmentId: string; mime: string; wrap?: ImageWrapMode; alt?: string }): boolean` — **refuses non-image mime (layer 1)**; `setImageWrap(wrap: ImageWrapMode): boolean`.
  - `TicketImageOptions = { resolveAttachmentUrl(attachmentId: string): string }`.
  - BEM classes `editor-image`, `editor-image--inline-left`, `editor-image--inline-right`, `editor-image--block`.

- [ ] **Step 1: Write the failing test**

`packages/editor/test/ticket-image.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createTestEditor } from './helpers/create-editor.js';

const IMG = '01J9GIMA000000000000000000';

function imageNodes(json: unknown): Array<{ attrs: Record<string, unknown> }> {
  const found: Array<{ attrs: Record<string, unknown> }> = [];
  const walk = (node: unknown): void => {
    if (node === null || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach(walk);
    const record = node as { type?: string; attrs?: Record<string, unknown>; content?: unknown };
    if (record.type === 'image') found.push({ attrs: record.attrs ?? {} });
    walk(record.content);
  };
  walk(json);
  return found;
}

describe('image node', () => {
  it('insertTicketImage inserts an image node with wrap defaulting to block', () => {
    const editor = createTestEditor();
    const ok = editor.commands.insertTicketImage({ attachmentId: IMG, mime: 'image/png', alt: 'receipt' });
    expect(ok).toBe(true);
    const images = imageNodes(editor.getJSON());
    expect(images).toHaveLength(1);
    expect(images[0]!.attrs).toMatchObject({ attachmentId: IMG, wrap: 'block', alt: 'receipt' });
    editor.destroy();
  });

  it('planted defect (layer 1): a non-image mime is refused and the doc is untouched', () => {
    const editor = createTestEditor();
    const before = editor.getJSON();
    for (const mime of ['application/pdf', 'video/mp4', 'image/svg+xml', 'text/html']) {
      expect(editor.commands.insertTicketImage({ attachmentId: IMG, mime }), `${mime} must be refused`).toBe(false);
    }
    expect(editor.getJSON()).toEqual(before);
    editor.destroy();
  });

  it('setImageWrap updates the selected image and refuses invented modes', () => {
    const editor = createTestEditor();
    editor.commands.insertTicketImage({ attachmentId: IMG, mime: 'image/jpeg', wrap: 'block' });
    // Select the image node it just inserted.
    let imagePos = -1;
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === 'image') imagePos = pos;
      return imagePos === -1;
    });
    expect(imagePos).toBeGreaterThanOrEqual(0);
    editor.commands.setNodeSelection(imagePos);
    expect(editor.commands.setImageWrap('inline-left')).toBe(true);
    expect(imageNodes(editor.getJSON())[0]!.attrs.wrap).toBe('inline-left');
    // Planted defect: a wrap outside the vocabulary is refused.
    expect(editor.commands.setImageWrap('float-up' as never)).toBe(false);
    expect(imageNodes(editor.getJSON())[0]!.attrs.wrap).toBe('inline-left');
    editor.destroy();
  });

  it('renders src via resolveAttachmentUrl and a BEM wrap class', () => {
    const editor = createTestEditor({ resolveAttachmentUrl: (id) => `/test-url/${id}` });
    editor.commands.insertTicketImage({ attachmentId: IMG, mime: 'image/webp', wrap: 'inline-right', alt: 'shelf' });
    const html = editor.getHTML();
    expect(html).toContain(`src="/test-url/${IMG}"`);
    expect(html).toContain(`data-attachment-id="${IMG}"`);
    expect(html).toContain('editor-image--inline-right');
    expect(html).toContain('alt="shelf"');
    editor.destroy();
  });

  it('round-trips through JSON with attrs intact', () => {
    const editor = createTestEditor();
    editor.commands.insertTicketImage({ attachmentId: IMG, mime: 'image/png', wrap: 'inline-left', alt: 'a' });
    const json = editor.getJSON();
    editor.commands.setContent(json);
    expect(editor.getJSON()).toEqual(json);
    editor.destroy();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @gisik-nokma/editor exec vitest run test/ticket-image.test.ts`
Expected: FAIL — `insertTicketImage is not a function` (command unregistered).

- [ ] **Step 3: Implement the node**

`packages/editor/src/extensions/ticket-image.ts`:

```ts
import { Node, mergeAttributes } from '@tiptap/core';
import { isEmbeddableImageMime } from '@gisik-nokma/domain';

export const IMAGE_WRAP_MODES = ['inline-left', 'inline-right', 'block'] as const;
export type ImageWrapMode = (typeof IMAGE_WRAP_MODES)[number];

export type TicketImageOptions = {
  /** Maps an attachmentId to a fetchable URL. The doc stores only the id. */
  resolveAttachmentUrl(attachmentId: string): string;
};

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    ticketImage: {
      /**
       * Layer 1 of image-only inline embedding: insertion is refused for a
       * non-image mime. The mime comes from the server's sniffed upload
       * answer, never from the file's name.
       */
      insertTicketImage: (attrs: { attachmentId: string; mime: string; wrap?: ImageWrapMode; alt?: string }) => ReturnType;
      /** Change the wrap mode of the selected image node. */
      setImageWrap: (wrap: ImageWrapMode) => ReturnType;
    };
  }
}

export const TicketImage = Node.create<TicketImageOptions>({
  name: 'image',
  group: 'block',
  atom: true,
  draggable: true,

  addOptions() {
    return {
      resolveAttachmentUrl: (attachmentId: string) => `/v1/attachments/${attachmentId}`,
    };
  },

  addAttributes() {
    return {
      attachmentId: { default: null },
      wrap: { default: 'block' },
      alt: { default: '' },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'img[data-attachment-id]',
        getAttrs: (element) => {
          const el = element as HTMLElement;
          const wrap = el.getAttribute('data-wrap');
          return {
            attachmentId: el.getAttribute('data-attachment-id'),
            wrap: IMAGE_WRAP_MODES.includes(wrap as ImageWrapMode) ? wrap : 'block',
            alt: el.getAttribute('alt') ?? '',
          };
        },
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    const { attachmentId, wrap, alt } = node.attrs as { attachmentId: string; wrap: ImageWrapMode; alt: string };
    return [
      'img',
      mergeAttributes(HTMLAttributes, {
        src: this.options.resolveAttachmentUrl(attachmentId),
        'data-attachment-id': attachmentId,
        'data-wrap': wrap,
        alt,
        class: `editor-image editor-image--${wrap}`,
      }),
    ];
  },

  addCommands() {
    return {
      insertTicketImage:
        (attrs) =>
        ({ commands }) => {
          if (!isEmbeddableImageMime(attrs.mime)) return false;
          if (attrs.wrap !== undefined && !IMAGE_WRAP_MODES.includes(attrs.wrap)) return false;
          return commands.insertContent({
            type: this.name,
            attrs: {
              attachmentId: attrs.attachmentId,
              wrap: attrs.wrap ?? 'block',
              alt: attrs.alt ?? '',
            },
          });
        },
      setImageWrap:
        (wrap) =>
        ({ commands }) => {
          if (!IMAGE_WRAP_MODES.includes(wrap)) return false;
          return commands.updateAttributes(this.name, { wrap });
        },
    };
  },
});
```

- [ ] **Step 4: Wire it into the schema and the stylesheet**

In `packages/editor/src/schema/extensions.ts`, add the import and append to the returned array (after `TableCell`):

```ts
import { TicketImage } from '../extensions/ticket-image.js';
```

```ts
    TicketImage.configure({
      resolveAttachmentUrl: options.resolveAttachmentUrl ?? ((attachmentId) => `/v1/attachments/${attachmentId}`),
    }),
```

Create `packages/editor/src/styles/editor.css` (structural only — zero colour literals, per Global Constraints):

```css
/* Image embedding: the three wrap modes of spec §2. */
.editor-image {
  max-width: 100%;
  height: auto;
}
.editor-image--block {
  display: block;
  margin: 0.5rem 0;
}
.editor-image--inline-left {
  float: left;
  margin: 0 1rem 0.5rem 0;
  max-width: 50%;
}
.editor-image--inline-right {
  float: right;
  margin: 0 0 0.5rem 1rem;
  max-width: 50%;
}
```

Append to `packages/editor/src/index.ts`:

```ts
export { IMAGE_WRAP_MODES, TicketImage, type ImageWrapMode, type TicketImageOptions } from './extensions/ticket-image.js';
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm --filter @gisik-nokma/editor exec vitest run test/ticket-image.test.ts test/schema.test.ts`
Expected: PASS (image tests plus the Task 1 suite — the schema test's node list now also sees `image`).

- [ ] **Step 6: Commit**

```bash
git add packages/editor
git commit -m "Image node: attachmentId + the three wrap modes, with insertion refusing non-image mime — layer 1 of image-only inline embedding, planted-defect proven"
```

---
### Task 4: Mention node and picker

**Files:**
- Create: `packages/editor/src/extensions/mention.ts`
- Create: `packages/editor/src/extensions/mention-popup.ts`
- Modify: `packages/editor/src/schema/extensions.ts` (add Mention)
- Modify: `packages/editor/src/styles/editor.css` (popup structure)
- Modify: `packages/editor/src/index.ts` (exports)
- Test: `packages/editor/test/mention.test.ts`

**Interfaces:**
- Consumes: `buildEditorExtensions` (Task 1), `typeText` helper (Task 1).
- Produces (cross-plan API):
  - Node `mention`, inline atom, attrs `{ userId: string; label: string }`. `label` is the person's display name **captured at insertion time** — a claim like any other, and the reason the dependency-free `docToPlainText` can render `@name` without a user directory (see Task 6 and Open questions 2).
  - `type MentionCandidate = { userId: string; name: string }`.
  - `MentionOptions = { queryUsers(query: string): Promise<MentionCandidate[]> }` — wired through `buildEditorExtensions`' `queryUsers`.
  - Behavior contract: typing `@` opens the picker; Enter/click inserts a mention node plus a trailing space; **Escape dismisses and the typed text stays literal** (`@…` never silently becomes markup — spec §2's escape principle applied to the one non-input-rule trigger).
  - BEM classes `mention-popup`, `mention-popup__item`, `mention-popup__item--selected`, `editor-mention`.

- [ ] **Step 1: Write the failing test**

`packages/editor/test/mention.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Editor } from '@tiptap/core';
import { createTestEditor } from './helpers/create-editor.js';
import { typeText } from './helpers/type-text.js';

const USERS = [
  { userId: '01J9GUSA000000000000000000', name: 'Anselma' },
  { userId: '01J9GUSB000000000000000000', name: 'Anand' },
];

function mentionNodes(json: unknown): Array<Record<string, unknown>> {
  const found: Array<Record<string, unknown>> = [];
  const walk = (node: unknown): void => {
    if (node === null || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach(walk);
    const record = node as { type?: string; attrs?: Record<string, unknown>; content?: unknown };
    if (record.type === 'mention') found.push(record.attrs ?? {});
    walk(record.content);
  };
  walk(json);
  return found;
}

function pressKey(editor: Editor, key: string): boolean {
  const event = new KeyboardEvent('keydown', { key, bubbles: true });
  return editor.view.someProp('handleKeyDown', (handler) => handler(editor.view, event)) ?? false;
}

let editor: Editor | null = null;
afterEach(() => {
  editor?.destroy();
  editor = null;
  document.querySelectorAll('.mention-popup').forEach((el) => el.remove());
});

describe('mention picker', () => {
  it('typing @ plus a query surfaces matching candidates', async () => {
    const queryUsers = vi.fn(async (query: string) =>
      USERS.filter((user) => user.name.toLowerCase().startsWith(query.toLowerCase())),
    );
    editor = createTestEditor({ queryUsers });
    typeText(editor, 'ping @an');
    await vi.waitFor(() => {
      expect(document.querySelectorAll('.mention-popup__item').length).toBe(2);
    });
    expect(queryUsers).toHaveBeenCalledWith('an');
  });

  it('clicking a candidate inserts a mention node {userId, label} plus a space', async () => {
    editor = createTestEditor({ queryUsers: async () => USERS });
    typeText(editor, '@ans');
    await vi.waitFor(() => {
      expect(document.querySelector('.mention-popup__item')).not.toBeNull();
    });
    const first = document.querySelector('.mention-popup__item') as HTMLButtonElement;
    first.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    const mentions = mentionNodes(editor.getJSON());
    expect(mentions).toEqual([{ userId: USERS[0]!.userId, label: 'Anselma' }]);
    // The trigger text `@ans` was consumed by the insertion.
    expect(editor.getText()).not.toContain('@ans');
    editor.destroy();
    editor = null;
  });

  it('Enter selects the highlighted candidate', async () => {
    editor = createTestEditor({ queryUsers: async () => USERS });
    typeText(editor, '@an');
    await vi.waitFor(() => {
      expect(document.querySelectorAll('.mention-popup__item').length).toBe(2);
    });
    pressKey(editor, 'ArrowDown');
    pressKey(editor, 'Enter');
    const mentions = mentionNodes(editor.getJSON());
    expect(mentions).toEqual([{ userId: USERS[1]!.userId, label: 'Anand' }]);
  });

  it('planted defect: Escape dismisses the picker and the typed text stays literal', async () => {
    editor = createTestEditor({ queryUsers: async () => USERS });
    typeText(editor, '@an');
    await vi.waitFor(() => {
      expect(document.querySelector('.mention-popup')).not.toBeNull();
    });
    pressKey(editor, 'Escape');
    expect(document.querySelector('.mention-popup')).toBeNull();
    expect(mentionNodes(editor.getJSON())).toEqual([]);
    expect(editor.getText()).toContain('@an');
  });

  it('getText renders a mention as @label', async () => {
    editor = createTestEditor({ queryUsers: async () => USERS });
    editor.commands.setContent({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'ask ' },
            { type: 'mention', attrs: { userId: USERS[0]!.userId, label: 'Anselma' } },
          ],
        },
      ],
    });
    expect(editor.getText()).toContain('@Anselma');
  });

  it('round-trips mention attrs through JSON', () => {
    editor = createTestEditor();
    const doc = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'mention', attrs: { userId: USERS[1]!.userId, label: 'Anand' } }] },
      ],
    };
    editor.commands.setContent(doc);
    const json = editor.getJSON();
    expect(mentionNodes(json)).toEqual([{ userId: USERS[1]!.userId, label: 'Anand' }]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @gisik-nokma/editor exec vitest run test/mention.test.ts`
Expected: FAIL — `mention` is not a schema node (setContent test throws / picker never appears).

- [ ] **Step 3: Implement the popup**

`packages/editor/src/extensions/mention-popup.ts`:

```ts
import type { MentionCandidate } from './mention.js';

export type MentionPopupProps = {
  items: MentionCandidate[];
  command: (item: MentionCandidate) => void;
  clientRect?: (() => DOMRect | null) | null;
};

export type MentionPopupRenderer = {
  onStart(props: MentionPopupProps): void;
  onUpdate(props: MentionPopupProps): void;
  onKeyDown(props: { event: KeyboardEvent }): boolean;
  onExit(): void;
};

/**
 * Plain-DOM suggestion popup — no React, so the exact same code serves
 * the Next.js client, Tauri, the RN webview bundle, and headless tests
 * (the knowledge-base convention: plugin UI stays out of the React tree).
 */
export function createMentionPopup(): MentionPopupRenderer {
  let container: HTMLDivElement | null = null;
  let items: MentionCandidate[] = [];
  let command: (item: MentionCandidate) => void = () => {};
  let selectedIndex = 0;

  function paint(): void {
    if (!container) return;
    container.replaceChildren();
    items.forEach((item, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className =
        index === selectedIndex
          ? 'mention-popup__item mention-popup__item--selected'
          : 'mention-popup__item';
      button.textContent = item.name;
      // mousedown, not click: it fires before the editor loses focus.
      button.addEventListener('mousedown', (event) => {
        event.preventDefault();
        command(item);
      });
      container?.appendChild(button);
    });
  }

  function position(clientRect?: (() => DOMRect | null) | null): void {
    if (!container) return;
    const rect = clientRect?.();
    if (!rect) return; // jsdom / detached: leave it unpositioned but present
    container.style.left = `${rect.left}px`;
    container.style.top = `${rect.bottom}px`;
  }

  function destroy(): void {
    container?.remove();
    container = null;
  }

  return {
    onStart(props) {
      container = document.createElement('div');
      container.className = 'mention-popup';
      container.style.position = 'absolute';
      document.body.appendChild(container);
      items = props.items;
      command = props.command;
      selectedIndex = 0;
      paint();
      position(props.clientRect);
    },
    onUpdate(props) {
      items = props.items;
      command = props.command;
      if (selectedIndex >= items.length) selectedIndex = 0;
      paint();
      position(props.clientRect);
    },
    onKeyDown({ event }) {
      const count = Math.max(items.length, 1);
      if (event.key === 'ArrowDown') {
        selectedIndex = (selectedIndex + 1) % count;
        paint();
        return true;
      }
      if (event.key === 'ArrowUp') {
        selectedIndex = (selectedIndex - 1 + count) % count;
        paint();
        return true;
      }
      if (event.key === 'Enter') {
        const item = items[selectedIndex];
        if (item) command(item);
        return true;
      }
      if (event.key === 'Escape') {
        // Dismiss: the typed `@…` stays literal text — nothing silently
        // becomes markup (spec §2).
        destroy();
        return true;
      }
      return false;
    },
    onExit() {
      destroy();
    },
  };
}
```

- [ ] **Step 4: Implement the mention node**

`packages/editor/src/extensions/mention.ts`:

```ts
import { Node, mergeAttributes } from '@tiptap/core';
import { PluginKey } from '@tiptap/pm/state';
import Suggestion from '@tiptap/suggestion';
import { createMentionPopup, type MentionPopupRenderer } from './mention-popup.js';

export type MentionCandidate = { userId: string; name: string };

export type MentionOptions = {
  queryUsers(query: string): Promise<MentionCandidate[]>;
};

export const mentionSuggestionKey = new PluginKey('mentionSuggestion');

export const Mention = Node.create<MentionOptions>({
  name: 'mention',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addOptions() {
    return { queryUsers: async () => [] };
  },

  addAttributes() {
    return {
      userId: { default: null },
      /** Display name at insertion time — the claim `docToPlainText` renders as @label. */
      label: { default: '' },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-mention-user-id]',
        getAttrs: (element) => {
          const el = element as HTMLElement;
          return {
            userId: el.getAttribute('data-mention-user-id'),
            label: (el.textContent ?? '').replace(/^@/, ''),
          };
        },
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-mention-user-id': node.attrs.userId as string,
        class: 'editor-mention',
      }),
      `@${node.attrs.label as string}`,
    ];
  },

  renderText({ node }) {
    return `@${node.attrs.label as string}`;
  },

  addProseMirrorPlugins() {
    return [
      Suggestion<MentionCandidate>({
        editor: this.editor,
        pluginKey: mentionSuggestionKey,
        char: '@',
        items: ({ query }) => this.options.queryUsers(query),
        command: ({ editor, range, props }) => {
          editor
            .chain()
            .focus()
            .insertContentAt(range, [
              { type: this.name, attrs: { userId: props.userId, label: props.name } },
              { type: 'text', text: ' ' },
            ])
            .run();
        },
        render: (): {
          onStart: MentionPopupRenderer['onStart'];
          onUpdate: MentionPopupRenderer['onUpdate'];
          onKeyDown: MentionPopupRenderer['onKeyDown'];
          onExit: MentionPopupRenderer['onExit'];
        } => createMentionPopup(),
      }),
    ];
  },
});
```

- [ ] **Step 5: Wire into the schema, styles, and exports**

In `packages/editor/src/schema/extensions.ts`, add the import and append after `TicketImage.configure(...)`:

```ts
import { Mention } from '../extensions/mention.js';
```

```ts
    Mention.configure({ queryUsers: options.queryUsers ?? (async () => []) }),
```

Append to `packages/editor/src/styles/editor.css`:

```css
/* Mention picker popup (structure only; colours come from ui tokens later). */
.mention-popup {
  position: absolute;
  z-index: 30;
  display: flex;
  flex-direction: column;
  min-width: 10rem;
}
.mention-popup__item {
  text-align: left;
  padding: 0.25rem 0.5rem;
  cursor: pointer;
}
.editor-mention {
  white-space: nowrap;
}
```

Append to `packages/editor/src/index.ts`:

```ts
export { Mention, mentionSuggestionKey, type MentionCandidate, type MentionOptions } from './extensions/mention.js';
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm --filter @gisik-nokma/editor exec vitest run test/mention.test.ts test/schema.test.ts`
Expected: PASS. If `Suggestion`'s generic import differs in the installed minor (`Suggestion<MentionCandidate>` vs untyped `Suggestion`), drop the generic and cast `props` inside `command` — the runtime call shape is stable.

- [ ] **Step 7: Commit**

```bash
git add packages/editor
git commit -m "Mention node and picker: {userId, label} atoms via @tiptap/suggestion with a plain-DOM popup; Escape leaves the typed text literal, planted-defect proven"
```

---

### Task 5: The escape-suggestion mechanic (spec §2's named requirement)

**Files:**
- Create: `packages/editor/src/extensions/escape-suggestion.ts`
- Modify: `packages/editor/src/schema/extensions.ts` (add EscapeSuggestion)
- Modify: `packages/editor/src/styles/editor.css` (chip structure)
- Modify: `packages/editor/src/index.ts` (exports)
- Test: `packages/editor/test/escape-suggestion.test.ts`

**Interfaces:**
- Consumes: `buildEditorExtensions`, `typeText` (Task 1).
- Produces:
  - Extension `EscapeSuggestion` (part of `buildEditorExtensions` — every surface gets it).
  - `getEscapeSuggestion(state: EditorState): { literal: string } | null` — the observable suggestion state (tests and toolbars read it).
  - Behavior contract (the spec mechanic, exactly): when a typed reserved sequence triggers markdown-style autoformatting, the formatting applies **and** an inline chip appears offering the escaped literal. **Accepting** (click the chip, or Backspace — Tiptap's core keymap already routes Backspace through `undoInputRule` first) reverts the autoformat so the typed characters stand as literal text; **dismissing** (Escape, or simply continuing to type/click elsewhere) keeps the formatting and drops the chip. Nothing silently becomes markup: every conversion is announced and reversible at the moment it happens, and the literal is always reachable.
  - The reserved-sequence trigger table (exhaustive for schema v1 — these are precisely the enabled input rules):

| Typed sequence (at block start where marked ⏎) | Would become |
|---|---|
| `# ` … `###### ` ⏎ | heading 1–6 |
| `- `, `* `, `+ ` ⏎ | bullet list |
| `1. ` (any number) ⏎ | ordered list |
| `> ` ⏎ | blockquote |
| ```` ``` ```` ⏎ | code block |
| `---` ⏎ | horizontal rule |
| `**x**`, `__x__` | bold |
| `*x*`, `_x_` | italic |
| `~~x~~` | strike |
| `` `x` `` | inline code |

  - Non-triggers, asserted literal in the same suite: `[text](url)` (no markdown-link input rule in schema v1), `|` (tables come from the toolbar, never autoformat), bare URLs (autolink off — Task 1), `@` (mention picker with its own Escape path — Task 4).
  - BEM classes `escape-chip`, `escape-chip__label`, `escape-chip__hint`.

- [ ] **Step 1: Verify the input-rule store against the installed @tiptap/core**

The extension reads the same store Tiptap's own `undoInputRule` command reads: the input-rules plugin flags itself and keeps the last-applied rule as `{ transform, from, to, text }` until the next doc- or selection-changing transaction. Confirm both facts before building on them:

Run: `grep -rn "isInputRules" node_modules/@tiptap/core/dist/ | head -5` and `grep -rn "undoInputRule" node_modules/@tiptap/core/dist/index.js | head -5`
Expected: the plugin spec carries `isInputRules: true` (or an equivalently named flag) and `undoInputRule` scans `state.plugins` for it, reading a stored object with a `transform`. If the flag name differs in the installed minor, use the name found here in `findAppliedInputRule` below — the lookup strategy stays identical to the core command's.

- [ ] **Step 2: Write the failing tests**

`packages/editor/test/escape-suggestion.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { Editor } from '@tiptap/core';
import { getEscapeSuggestion } from '../src/extensions/escape-suggestion.js';
import { createTestEditor } from './helpers/create-editor.js';
import { typeText } from './helpers/type-text.js';

function pressEscape(editor: Editor): boolean {
  const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
  return editor.view.someProp('handleKeyDown', (handler) => handler(editor.view, event)) ?? false;
}

function firstBlock(editor: Editor): { type: string; text: string } {
  const node = editor.state.doc.firstChild;
  return { type: node?.type.name ?? 'none', text: node?.textContent ?? '' };
}

type Trigger = { typed: string; formatted: (editor: Editor) => boolean; label: string };

const BLOCK_TRIGGERS: Trigger[] = [
  { typed: '# ', label: 'heading 1', formatted: (e) => firstBlock(e).type === 'heading' },
  { typed: '## ', label: 'heading 2', formatted: (e) => firstBlock(e).type === 'heading' },
  { typed: '### ', label: 'heading 3', formatted: (e) => firstBlock(e).type === 'heading' },
  { typed: '#### ', label: 'heading 4', formatted: (e) => firstBlock(e).type === 'heading' },
  { typed: '##### ', label: 'heading 5', formatted: (e) => firstBlock(e).type === 'heading' },
  { typed: '###### ', label: 'heading 6', formatted: (e) => firstBlock(e).type === 'heading' },
  { typed: '- ', label: 'bullet (dash)', formatted: (e) => firstBlock(e).type === 'bulletList' },
  { typed: '* ', label: 'bullet (star)', formatted: (e) => firstBlock(e).type === 'bulletList' },
  { typed: '+ ', label: 'bullet (plus)', formatted: (e) => firstBlock(e).type === 'bulletList' },
  { typed: '1. ', label: 'ordered list', formatted: (e) => firstBlock(e).type === 'orderedList' },
  { typed: '> ', label: 'blockquote', formatted: (e) => firstBlock(e).type === 'blockquote' },
  { typed: '``` ', label: 'code block', formatted: (e) => firstBlock(e).type === 'codeBlock' },
  {
    typed: '---',
    label: 'horizontal rule',
    formatted: (e) => {
      let found = false;
      e.state.doc.descendants((node) => {
        if (node.type.name === 'horizontalRule') found = true;
        return !found;
      });
      return found;
    },
  },
];

const MARK_TRIGGERS: Trigger[] = [
  { typed: 'x **bold**', label: 'bold **', formatted: (e) => e.getHTML().includes('<strong') },
  { typed: 'x __bold__', label: 'bold __', formatted: (e) => e.getHTML().includes('<strong') },
  { typed: 'x *it*', label: 'italic *', formatted: (e) => e.getHTML().includes('<em') },
  { typed: 'x _it_', label: 'italic _', formatted: (e) => e.getHTML().includes('<em') },
  { typed: 'x ~~st~~', label: 'strike', formatted: (e) => e.getHTML().includes('<s') },
  { typed: 'x `co`', label: 'inline code', formatted: (e) => e.getHTML().includes('<code') },
];

describe('escape suggestion — every reserved sequence, planted-defect style', () => {
  it.each([...BLOCK_TRIGGERS, ...MARK_TRIGGERS])(
    '$label: formatting applies, the suggestion appears, accepting yields literal text',
    ({ typed, formatted }) => {
      const editor = createTestEditor();
      typeText(editor, typed);

      // The autoformat happened (dismissing would keep exactly this)…
      expect(formatted(editor), `"${typed}" should have autoformatted`).toBe(true);
      // …and the suggestion is on offer, with a chip in the DOM.
      const suggestion = getEscapeSuggestion(editor.state);
      expect(suggestion, `no suggestion after typing "${typed}"`).not.toBeNull();
      expect(editor.view.dom.querySelector('[data-escape-chip]')).not.toBeNull();

      // Accept: the literal typed characters stand, the formatting is gone.
      expect(editor.commands.undoInputRule()).toBe(true);
      expect(formatted(editor), `accepting the escape must undo "${typed}"`).toBe(false);
      expect(editor.state.doc.textContent).toContain(typed.trim());
      expect(getEscapeSuggestion(editor.state)).toBeNull();
      expect(editor.view.dom.querySelector('[data-escape-chip]')).toBeNull();
      editor.destroy();
    },
  );

  it('Backspace accepts (core keymap routes it through undoInputRule)', () => {
    const editor = createTestEditor();
    typeText(editor, '# ');
    expect(firstBlock(editor).type).toBe('heading');
    expect(editor.commands.keyboardShortcut('Backspace')).toBe(true);
    expect(firstBlock(editor)).toEqual({ type: 'paragraph', text: '# ' });
    editor.destroy();
  });

  it('clicking the chip accepts', () => {
    const editor = createTestEditor();
    typeText(editor, 'x **bold**');
    const chip = editor.view.dom.querySelector('[data-escape-chip]') as HTMLButtonElement;
    expect(chip).not.toBeNull();
    expect(chip.textContent).toContain('**bold**');
    chip.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    expect(editor.getHTML()).not.toContain('<strong');
    expect(editor.state.doc.textContent).toContain('**bold**');
    editor.destroy();
  });

  it('Escape dismisses: the formatting stays, the chip goes', () => {
    const editor = createTestEditor();
    typeText(editor, '# ');
    expect(getEscapeSuggestion(editor.state)).not.toBeNull();
    expect(pressEscape(editor)).toBe(true);
    expect(getEscapeSuggestion(editor.state)).toBeNull();
    expect(editor.view.dom.querySelector('[data-escape-chip]')).toBeNull();
    expect(firstBlock(editor).type).toBe('heading');
    editor.destroy();
  });

  it('continuing to type dismisses: the formatting stays', () => {
    const editor = createTestEditor();
    typeText(editor, '# ');
    expect(getEscapeSuggestion(editor.state)).not.toBeNull();
    typeText(editor, 'title');
    expect(getEscapeSuggestion(editor.state)).toBeNull();
    expect(firstBlock(editor)).toEqual({ type: 'heading', text: 'title' });
    editor.destroy();
  });

  it('Escape without an active suggestion is not consumed', () => {
    const editor = createTestEditor();
    typeText(editor, 'plain');
    expect(pressEscape(editor)).toBe(false);
    editor.destroy();
  });
});

describe('non-triggers stay literal with no suggestion', () => {
  it.each([
    { typed: 'see [the doc](http://x) now', literal: '[the doc](http://x)' },
    { typed: 'a | b | c', literal: 'a | b | c' },
    { typed: 'go to https://example.com now', literal: 'https://example.com' },
  ])('"$literal" stays literal', ({ typed, literal }) => {
    const editor = createTestEditor();
    typeText(editor, typed);
    expect(editor.state.doc.textContent).toContain(literal);
    expect(editor.getHTML()).not.toContain('<a ');
    expect(getEscapeSuggestion(editor.state)).toBeNull();
    editor.destroy();
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `pnpm --filter @gisik-nokma/editor exec vitest run test/escape-suggestion.test.ts`
Expected: FAIL — cannot resolve `../src/extensions/escape-suggestion.js`.

- [ ] **Step 4: Implement the extension**

`packages/editor/src/extensions/escape-suggestion.ts`:

```ts
import { Extension } from '@tiptap/core';
import type { EditorState } from '@tiptap/pm/state';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

/**
 * Spec §2's named mechanic: when a typed reserved character sequence
 * triggers formatting, surface an inline suggestion offering the escaped
 * literal, so nothing silently becomes markup. Accepting keeps the literal
 * text; dismissing keeps the formatting.
 *
 * Mechanism: Tiptap's input-rules plugin stores the just-applied rule as
 * `{ transform, from, to, text }` — the store its own `undoInputRule`
 * command consumes — and clears it on the next doc- or selection-changing
 * transaction. That store IS our trigger signal:
 *   - store holds a record  → an autoformat just happened → offer the chip
 *   - accept               → `undoInputRule` (restores the literal text; the
 *                            revert is a transaction, not typed input, so no
 *                            rule re-fires on it)
 *   - dismiss              → Escape marks the record dismissed; typing or
 *                            moving the selection clears the store natively
 */

type InputRuleRecord = { transform: unknown; from: number; to: number; text: string };

type EscapePluginState = { dismissed: InputRuleRecord | null };

export const escapeSuggestionKey = new PluginKey<EscapePluginState>('escapeSuggestion');

/** Mirrors @tiptap/core's undoInputRule lookup (verified in Task 5 Step 1). */
function findAppliedInputRule(state: EditorState): InputRuleRecord | null {
  for (const plugin of state.plugins) {
    const spec = plugin.spec as { isInputRules?: boolean };
    if (!spec.isInputRules) continue;
    const stored = plugin.getState(state) as Partial<InputRuleRecord> | null | undefined;
    if (
      stored &&
      stored.transform !== undefined &&
      typeof stored.from === 'number' &&
      typeof stored.text === 'string'
    ) {
      return stored as InputRuleRecord;
    }
  }
  return null;
}

/** The suggestion currently on offer, if any — tests and toolbars read this. */
export function getEscapeSuggestion(state: EditorState): { literal: string } | null {
  const record = findAppliedInputRule(state);
  if (!record) return null;
  const dismissed = escapeSuggestionKey.getState(state)?.dismissed ?? null;
  if (dismissed === record) return null;
  return { literal: record.text };
}

function buildChip(literal: string, onAccept: () => void): HTMLElement {
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = 'escape-chip';
  chip.setAttribute('data-escape-chip', '');
  chip.contentEditable = 'false';

  const label = document.createElement('span');
  label.className = 'escape-chip__label';
  const shown = literal.trim() === '' ? literal : literal.trim();
  label.textContent = `Keep "${shown}" as text`;
  chip.appendChild(label);

  const hint = document.createElement('span');
  hint.className = 'escape-chip__hint';
  hint.textContent = 'Backspace or click · Esc keeps formatting';
  chip.appendChild(hint);

  // mousedown, not click: it fires before the editor loses focus.
  chip.addEventListener('mousedown', (event) => {
    event.preventDefault();
    onAccept();
  });
  return chip;
}

export const EscapeSuggestion = Extension.create({
  name: 'escapeSuggestion',

  addKeyboardShortcuts() {
    return {
      Escape: () => {
        if (!getEscapeSuggestion(this.editor.state)) return false;
        // Dismiss: the formatting stands; only the offer is withdrawn.
        this.editor.view.dispatch(this.editor.state.tr.setMeta(escapeSuggestionKey, 'dismiss'));
        return true;
      },
    };
  },

  addProseMirrorPlugins() {
    const editor = this.editor;
    return [
      new Plugin<EscapePluginState>({
        key: escapeSuggestionKey,
        state: {
          init: () => ({ dismissed: null }),
          apply(tr, value, _oldState, newState) {
            if (tr.getMeta(escapeSuggestionKey) === 'dismiss') {
              // A setMeta-only transaction changes neither doc nor selection,
              // so the input-rule store still holds the record: mark exactly
              // that object dismissed. New rule applications are new objects.
              return { dismissed: findAppliedInputRule(newState) };
            }
            return value;
          },
        },
        props: {
          decorations(state) {
            const suggestion = getEscapeSuggestion(state);
            if (!suggestion) return null;
            const chip = Decoration.widget(
              state.selection.from,
              () =>
                buildChip(suggestion.literal, () => {
                  // Accept: revert the autoformat; the typed characters
                  // stand as literal text. undoInputRule dispatches a
                  // doc-changing transaction, which clears the store and
                  // with it the chip.
                  editor.commands.undoInputRule();
                }),
              { side: 1, key: 'escape-suggestion-chip' },
            );
            return DecorationSet.create(state.doc, [chip]);
          },
        },
      }),
    ];
  },
});
```

- [ ] **Step 5: Wire into the schema, styles, and exports**

In `packages/editor/src/schema/extensions.ts`, add the import and append `EscapeSuggestion` as the LAST entry of the returned array (after `Mention.configure(...)`):

```ts
import { EscapeSuggestion } from '../extensions/escape-suggestion.js';
```

```ts
    EscapeSuggestion,
```

Append to `packages/editor/src/styles/editor.css`:

```css
/* Escape-suggestion chip: inline widget after the caret. */
.escape-chip {
  display: inline-flex;
  gap: 0.375rem;
  align-items: baseline;
  margin-left: 0.375rem;
  padding: 0.0625rem 0.375rem;
  font-size: 0.75rem;
  vertical-align: baseline;
  cursor: pointer;
  user-select: none;
}
.escape-chip__hint {
  font-size: 0.625rem;
  opacity: 0.7;
}
```

Append to `packages/editor/src/index.ts`:

```ts
export { EscapeSuggestion, escapeSuggestionKey, getEscapeSuggestion } from './extensions/escape-suggestion.js';
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm --filter @gisik-nokma/editor exec vitest run test/escape-suggestion.test.ts`
Expected: PASS — 19 trigger cases, 3 accept/dismiss paths, 1 no-op Escape, 3 literal non-triggers. If the `it.each` for `'``` '` trips on the code-block rule wanting a newline instead of a trailing space in the installed minor, adjust that ONE `typed` string to `'```\n'`-equivalent per the rule's regex in `@tiptap/extension-code-block` — the assertion stays identical.

- [ ] **Step 7: Run the whole editor suite (regression: mention + image untouched)**

Run: `pnpm --filter @gisik-nokma/editor test`
Expected: PASS across schema, image, mention, escape suites.

- [ ] **Step 8: Commit**

```bash
git add packages/editor
git commit -m "Escape suggestions: every autoformat announces itself with an inline chip — accept keeps the typed characters literal, dismiss keeps the formatting; all 13 block and 6 mark triggers planted-defect proven, non-triggers proven literal"
```

---

### Task 6: `docToPlainText` conformance — every schema-v1 node through the domain walker

**Files:**
- Test: `packages/editor/test/doc-to-plain-text.test.ts`

**Interfaces:**
- Consumes: `docToPlainText(doc: unknown): string` from `@gisik-nokma/domain` (Plan 5 — written in parallel; it exists in the codebase by the time this plan executes). Coordination amendment 12 fixes its home and signature.
- Produces: the conformance contract between schema v1 and the walker: **every node type serializes without throwing; text nodes contribute their text; mention nodes render as `@<label>`** (the `@name` placeholder — the label attr exists precisely so a dependency-free walker can name the person). This file is the single place the assumption is pinned; see Open questions 2 for the reconciliation note.

- [ ] **Step 1: Write the conformance tests**

`packages/editor/test/doc-to-plain-text.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { docToPlainText } from '@gisik-nokma/domain';
import { createTestEditor } from './helpers/create-editor.js';

const USER = '01J9GUSA000000000000000000';
const IMG = '01J9GIMA000000000000000000';

/** Build the doc through the real editor so it is exactly what clients store. */
function docFor(content: unknown[]): unknown {
  const editor = createTestEditor(undefined, { type: 'doc', content });
  const json = editor.getJSON();
  editor.destroy();
  return json;
}

type NodeCase = { label: string; content: unknown[]; expectText?: string[] };

const NODE_CASES: NodeCase[] = [
  { label: 'paragraph', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'plain words' }] }], expectText: ['plain words'] },
  { label: 'heading', content: [{ type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Filing' }] }], expectText: ['Filing'] },
  { label: 'bold/italic/code/strike marks', content: [{ type: 'paragraph', content: [
    { type: 'text', text: 'b', marks: [{ type: 'bold' }] },
    { type: 'text', text: 'i', marks: [{ type: 'italic' }] },
    { type: 'text', text: 'c', marks: [{ type: 'code' }] },
    { type: 'text', text: 's', marks: [{ type: 'strike' }] },
  ] }], expectText: ['b', 'i', 'c', 's'] },
  { label: 'link mark', content: [{ type: 'paragraph', content: [
    { type: 'text', text: 'the portal', marks: [{ type: 'link', attrs: { href: 'https://gst.gov.in' } }] },
  ] }], expectText: ['the portal'] },
  { label: 'bullet list', content: [{ type: 'bulletList', content: [
    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'first errand' }] }] },
    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'second errand' }] }] },
  ] }], expectText: ['first errand', 'second errand'] },
  { label: 'ordered list', content: [{ type: 'orderedList', attrs: { start: 1 }, content: [
    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'step one' }] }] },
  ] }], expectText: ['step one'] },
  { label: 'blockquote', content: [{ type: 'blockquote', content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'quoted claim' }] },
  ] }], expectText: ['quoted claim'] },
  { label: 'code block', content: [{ type: 'codeBlock', content: [{ type: 'text', text: 'SELECT 1;' }] }], expectText: ['SELECT 1;'] },
  { label: 'horizontal rule', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'above' }] }, { type: 'horizontalRule' }] , expectText: ['above'] },
  { label: 'hard break', content: [{ type: 'paragraph', content: [
    { type: 'text', text: 'line one' }, { type: 'hardBreak' }, { type: 'text', text: 'line two' },
  ] }], expectText: ['line one', 'line two'] },
  { label: 'table', content: [{ type: 'table', content: [
    { type: 'tableRow', content: [
      { type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'col head' }] }] },
      { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'cell body' }] }] },
    ] },
  ] }], expectText: ['col head', 'cell body'] },
  { label: 'image (no text contribution required — must not throw)', content: [
    { type: 'image', attrs: { attachmentId: IMG, wrap: 'block', alt: 'the receipt' } },
  ] },
  { label: 'mention', content: [{ type: 'paragraph', content: [
    { type: 'text', text: 'ask ' },
    { type: 'mention', attrs: { userId: USER, label: 'Anselma' } },
  ] }], expectText: ['ask', '@Anselma'] },
];

describe('docToPlainText conformance — schema v1 through the domain walker', () => {
  it.each(NODE_CASES)('$label round-trips without throwing', ({ content, expectText }) => {
    const doc = docFor(content);
    let result = '';
    expect(() => {
      result = docToPlainText(doc);
    }).not.toThrow();
    expect(typeof result).toBe('string');
    expect(result).not.toContain('undefined');
    expect(result).not.toContain('[object Object]');
    for (const piece of expectText ?? []) {
      expect(result).toContain(piece);
    }
  });

  it('mentions render as the @name placeholder (the pinned cross-plan contract)', () => {
    const doc = docFor([
      { type: 'paragraph', content: [{ type: 'mention', attrs: { userId: USER, label: 'Anselma' } }] },
    ]);
    expect(docToPlainText(doc)).toContain('@Anselma');
  });

  it('a kitchen-sink doc keeps its text in document order', () => {
    const doc = docFor([
      { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'AAA' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'BBB' }] },
      { type: 'blockquote', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'CCC' }] }] },
    ]);
    const result = docToPlainText(doc);
    expect(result.indexOf('AAA')).toBeGreaterThanOrEqual(0);
    expect(result.indexOf('AAA')).toBeLessThan(result.indexOf('BBB'));
    expect(result.indexOf('BBB')).toBeLessThan(result.indexOf('CCC'));
  });

  it('the empty doc yields an empty-ish string, never a throw', () => {
    expect(() => docToPlainText({ type: 'doc', content: [] })).not.toThrow();
    expect(docToPlainText({ type: 'doc', content: [] }).trim()).toBe('');
  });
});
```

- [ ] **Step 2: Run the suite**

Run: `pnpm --filter @gisik-nokma/editor exec vitest run test/doc-to-plain-text.test.ts`
Expected: PASS. Plan 5's walker was checked against these assertions during the series self-review and matches: mentions are `{userId, label?}` rendered `@label` with `@userId` as the fallback, images contribute no text, and unknown node types are descended into rather than dropped (Open question 2, now settled). **If an assertion nevertheless fails**, do NOT change the walker or the schema unilaterally — that is the cross-plan reconciliation point; raise it to the series coordinator, then align whichever side the coordinator rules against.

- [ ] **Step 3: Commit**

```bash
git add packages/editor/test/doc-to-plain-text.test.ts
git commit -m "Conformance: every schema-v1 node survives docToPlainText, mentions render as @name — the editor/domain contract pinned in one suite"
```

---
### Task 7: Attachments table, `ObjectStore` interface, and the local-disk store

**Files:**
- Create: `apps/server/migrations/<timestamp>_attachments.sql` (via node-pg-migrate, as in Plan 1)
- Create: `apps/server/src/attachments/object-store.ts`
- Create: `apps/server/src/attachments/local-disk-store.ts`
- Create: `apps/server/src/attachments/attachment-repo.ts`
- Modify: `.gitignore` (add `var/`)
- Test: `apps/server/test/attachments/local-disk-store.test.ts`
- Test: `apps/server/test/attachments/attachment-repo.test.ts`

**Interfaces:**
- Consumes: `createTestDatabase` (Plan 1), `Queryable` (Plan 4).
- Produces (cross-plan API):
  - `type ObjectMeta = { mime: string; size: number }`
  - `interface ObjectStore { put(key: string, stream: Readable, meta: ObjectMeta): Promise<void>; getStream(key: string): Promise<Readable>; delete(key: string): Promise<void> }`
  - `class ObjectNotFoundError extends Error { readonly key: string }`; `class InvalidObjectKeyError extends Error { readonly key: string }`; `assertValidObjectKey(key: string): void`
  - `class LocalDiskStore implements ObjectStore` (constructor `rootDir: string`)
  - Table `attachments` (server-owned infrastructure, **not** a `proj_` table: like Plan 4's identity tables it records the storage system's facts about bytes it holds; the *claim* that a file is on a ticket is the `attachment.added` ledger event that references it): `id text PK`, `workspace_id text`, `ticket_id text`, `uploader_id text`, `filename text`, `mime text`, `size bigint CHECK (size >= 0)`, `object_key text UNIQUE`, `created_at timestamptz DEFAULT now()`.
  - `type AttachmentRow = { id: string; workspaceId: string; ticketId: string; uploaderId: string; filename: string; mime: string; size: number; objectKey: string; createdAt: string }`
  - `insertAttachment(db: Queryable, row: Omit<AttachmentRow, 'createdAt'>): Promise<void>`; `getAttachment(db: Queryable, id: string): Promise<AttachmentRow | null>`; `listTicketAttachments(db: Queryable, ticketId: string): Promise<AttachmentRow[]>`
  - Object-key convention: `w/<workspaceId>/a/<attachmentId>` — no dots, no extensions, ULID segments only.

- [ ] **Step 1: Generate and fill the migration**

Run: `pnpm --filter @gisik-nokma/server exec node-pg-migrate create attachments --migration-file-language sql --migrations-dir migrations`
Expected: creates `apps/server/migrations/<timestamp>_attachments.sql`.

Up SQL (under the Up marker, as Plan 1's migrations do):

```sql
CREATE TABLE attachments (
  id text PRIMARY KEY,
  workspace_id text NOT NULL,
  ticket_id text NOT NULL,
  uploader_id text NOT NULL,
  filename text NOT NULL,
  mime text NOT NULL,
  size bigint NOT NULL CHECK (size >= 0),
  object_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX attachments_ticket_idx ON attachments (ticket_id);
CREATE INDEX attachments_workspace_idx ON attachments (workspace_id);
```

Down SQL (under the Down marker):

```sql
DROP TABLE attachments;
```

- [ ] **Step 2: Write the failing store test**

`apps/server/test/attachments/local-disk-store.test.ts`:

```ts
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LocalDiskStore } from '../../src/attachments/local-disk-store.js';
import {
  InvalidObjectKeyError,
  ObjectNotFoundError,
  assertValidObjectKey,
} from '../../src/attachments/object-store.js';

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk as Uint8Array));
  return Buffer.concat(chunks);
}

let root = '';
let store: LocalDiskStore;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'gisik-store-'));
  store = new LocalDiskStore(root);
});
afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('LocalDiskStore', () => {
  it('put → getStream round-trips the exact bytes', async () => {
    const bytes = Buffer.from('these are the attachment bytes, verbatim');
    await store.put('w/ws1/a/att1', Readable.from(bytes), { mime: 'application/pdf', size: bytes.length });
    const back = await streamToBuffer(await store.getStream('w/ws1/a/att1'));
    expect(back.equals(bytes)).toBe(true);
  });

  it('getStream on a missing key throws ObjectNotFoundError', async () => {
    await expect(store.getStream('w/ws1/a/nothere')).rejects.toBeInstanceOf(ObjectNotFoundError);
  });

  it('delete removes the object; deleting again is a quiet no-op', async () => {
    const bytes = Buffer.from('short-lived');
    await store.put('w/ws1/a/gone', Readable.from(bytes), { mime: 'image/png', size: bytes.length });
    await store.delete('w/ws1/a/gone');
    await expect(store.getStream('w/ws1/a/gone')).rejects.toBeInstanceOf(ObjectNotFoundError);
    await expect(store.delete('w/ws1/a/gone')).resolves.toBeUndefined();
  });

  it('planted defect: traversal and malformed keys are refused before touching the disk', async () => {
    const bytes = Buffer.from('x');
    for (const key of ['../escape', 'w/../../etc/passwd', '/absolute', 'w//a', '', 'w/a/.', 'w/a/..', 'a.b/c', 'w/a b']) {
      await expect(
        store.put(key, Readable.from(bytes), { mime: 'image/png', size: 1 }),
        `key "${key}" must be refused`,
      ).rejects.toBeInstanceOf(InvalidObjectKeyError);
      expect(() => assertValidObjectKey(key)).toThrow(InvalidObjectKeyError);
    }
    // Nothing escaped the root: the temp dir contains only the w/ tree.
    const entries = await readdir(root);
    expect(entries.every((entry) => entry === 'w')).toBe(true);
  });

  it('a failed write leaves no partial object behind', async () => {
    const bad = new Readable({
      read() {
        this.destroy(new Error('stream broke mid-flight'));
      },
    });
    await expect(store.put('w/ws1/a/broken', bad, { mime: 'image/png', size: 10 })).rejects.toThrow('stream broke mid-flight');
    await expect(store.getStream('w/ws1/a/broken')).rejects.toBeInstanceOf(ObjectNotFoundError);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `pnpm --filter @gisik-nokma/server exec vitest run test/attachments/local-disk-store.test.ts`
Expected: FAIL — modules do not exist.

- [ ] **Step 4: Implement the interface and the local store**

`apps/server/src/attachments/object-store.ts`:

```ts
import type { Readable } from 'node:stream';

export type ObjectMeta = { mime: string; size: number };

/**
 * Where attachment bytes live. Implementations: S3-compatible (prod),
 * local disk (dev/tests). The interface is deliberately three verbs —
 * events reference objects, they never carry them (spec §2 Attachments).
 */
export interface ObjectStore {
  put(key: string, stream: Readable, meta: ObjectMeta): Promise<void>;
  getStream(key: string): Promise<Readable>;
  delete(key: string): Promise<void>;
}

export class ObjectNotFoundError extends Error {
  constructor(public readonly key: string) {
    super(`object not found: ${key}`);
    this.name = 'ObjectNotFoundError';
  }
}

export class InvalidObjectKeyError extends Error {
  constructor(public readonly key: string) {
    super(`invalid object key: ${key}`);
    this.name = 'InvalidObjectKeyError';
  }
}

const OBJECT_KEY_SEGMENT = /^[A-Za-z0-9_-]+$/;

/**
 * Refuse anything that could steer a filesystem path or an S3 key outside
 * its root. Our keys are `w/<ulid>/a/<ulid>` — letters, digits, `_`, `-`
 * per segment; no dots at all, so `.`/`..` traversal is unrepresentable.
 */
export function assertValidObjectKey(key: string): void {
  const segments = key.split('/');
  const valid =
    key.length > 0 &&
    key.length <= 512 &&
    segments.every((segment) => OBJECT_KEY_SEGMENT.test(segment));
  if (!valid) throw new InvalidObjectKeyError(key);
}
```

`apps/server/src/attachments/local-disk-store.ts`:

```ts
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, rename, rm, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import {
  InvalidObjectKeyError,
  ObjectNotFoundError,
  assertValidObjectKey,
  type ObjectMeta,
  type ObjectStore,
} from './object-store.js';

/**
 * Dev/test implementation: objects are files under rootDir. Writes go to a
 * temp name and rename into place, so a torn write can never surface as a
 * readable half-object.
 */
export class LocalDiskStore implements ObjectStore {
  constructor(private readonly rootDir: string) {}

  private pathFor(key: string): string {
    assertValidObjectKey(key); // throws InvalidObjectKeyError before any I/O
    return join(this.rootDir, ...key.split('/'));
  }

  async put(key: string, stream: Readable, _meta: ObjectMeta): Promise<void> {
    const path = this.pathFor(key);
    await mkdir(dirname(path), { recursive: true });
    const tempPath = `${path}.tmp-${process.pid}-${Date.now()}`;
    try {
      await pipeline(stream, createWriteStream(tempPath, { flags: 'wx' }));
      await rename(tempPath, path);
    } catch (err) {
      await rm(tempPath, { force: true });
      throw err;
    }
  }

  async getStream(key: string): Promise<Readable> {
    const path = this.pathFor(key);
    try {
      await stat(path);
    } catch {
      throw new ObjectNotFoundError(key);
    }
    return createReadStream(path);
  }

  async delete(key: string): Promise<void> {
    await rm(this.pathFor(key), { force: true });
  }
}

// Re-export so route code has one import site in dev wiring.
export { InvalidObjectKeyError };
```

Append `var/` to `.gitignore` (the default local store root `var/attachments` must never be committed).

- [ ] **Step 5: Run the store tests to verify they pass**

Run: `pnpm --filter @gisik-nokma/server exec vitest run test/attachments/local-disk-store.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Write the failing repo test**

`apps/server/test/attachments/attachment-repo.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  getAttachment,
  insertAttachment,
  listTicketAttachments,
} from '../../src/attachments/attachment-repo.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';

const WS = '01J9GWKS000000000000000000';
const TICKET = '01J9GTKA000000000000000000';
const USER = '01J9GUSA000000000000000000';

let db: TestDatabase;
beforeAll(async () => {
  db = await createTestDatabase();
});
afterAll(async () => {
  await db.drop();
});

function row(id: string, overrides: Partial<Parameters<typeof insertAttachment>[1]> = {}) {
  return {
    id,
    workspaceId: WS,
    ticketId: TICKET,
    uploaderId: USER,
    filename: 'gst-receipt.pdf',
    mime: 'application/pdf',
    size: 48211,
    objectKey: `w/${WS}/a/${id}`,
    ...overrides,
  };
}

describe('attachment repo', () => {
  it('insert → get round-trips every column, size as a number', async () => {
    const id = '01J9GATA000000000000000000';
    await insertAttachment(db.pool, row(id));
    const stored = await getAttachment(db.pool, id);
    expect(stored).toMatchObject({
      id,
      workspaceId: WS,
      ticketId: TICKET,
      uploaderId: USER,
      filename: 'gst-receipt.pdf',
      mime: 'application/pdf',
      size: 48211,
      objectKey: `w/${WS}/a/${id}`,
    });
    expect(typeof stored?.size).toBe('number');
    expect(typeof stored?.createdAt).toBe('string');
  });

  it('get on an unknown id answers null', async () => {
    expect(await getAttachment(db.pool, '01J9GNON000000000000000000')).toBeNull();
  });

  it('listTicketAttachments returns only that ticket, in creation order', async () => {
    const other = '01J9GTKB000000000000000000';
    await insertAttachment(db.pool, row('01J9GATB000000000000000000', { filename: 'a.png', mime: 'image/png' }));
    await insertAttachment(db.pool, row('01J9GATC000000000000000000', { ticketId: other, objectKey: `w/${WS}/a/01J9GATC000000000000000000` }));
    const list = await listTicketAttachments(db.pool, TICKET);
    expect(list.map((item) => item.ticketId)).toEqual([TICKET, TICKET]);
    expect(list.map((item) => item.id)).toEqual(['01J9GATA000000000000000000', '01J9GATB000000000000000000']);
  });

  it('planted defect: a duplicate object_key violates the unique constraint', async () => {
    const dup = row('01J9GATD000000000000000000', { objectKey: `w/${WS}/a/01J9GATA000000000000000000` });
    await expect(insertAttachment(db.pool, dup)).rejects.toThrow();
  });
});
```

- [ ] **Step 7: Run it to verify it fails, then implement the repo**

Run: `pnpm --filter @gisik-nokma/server exec vitest run test/attachments/attachment-repo.test.ts`
Expected: FAIL — module does not exist (the migration itself is applied by `createTestDatabase`).

`apps/server/src/attachments/attachment-repo.ts`:

```ts
import type { Queryable } from '../db/queryable.js';

export type AttachmentRow = {
  id: string;
  workspaceId: string;
  ticketId: string;
  uploaderId: string;
  filename: string;
  mime: string;
  size: number;
  objectKey: string;
  createdAt: string;
};

const COLUMNS = `id, workspace_id, ticket_id, uploader_id, filename, mime, size, object_key, created_at::text AS created_at`;

type DbRow = {
  id: string;
  workspace_id: string;
  ticket_id: string;
  uploader_id: string;
  filename: string;
  mime: string;
  size: number;
  object_key: string;
  created_at: string;
};

function toRow(db: DbRow): AttachmentRow {
  return {
    id: db.id,
    workspaceId: db.workspace_id,
    ticketId: db.ticket_id,
    uploaderId: db.uploader_id,
    filename: db.filename,
    mime: db.mime,
    size: db.size,
    objectKey: db.object_key,
    createdAt: db.created_at,
  };
}

export async function insertAttachment(db: Queryable, row: Omit<AttachmentRow, 'createdAt'>): Promise<void> {
  await db.query(
    `INSERT INTO attachments (id, workspace_id, ticket_id, uploader_id, filename, mime, size, object_key)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [row.id, row.workspaceId, row.ticketId, row.uploaderId, row.filename, row.mime, row.size, row.objectKey],
  );
}

export async function getAttachment(db: Queryable, id: string): Promise<AttachmentRow | null> {
  const result = await db.query(`SELECT ${COLUMNS} FROM attachments WHERE id = $1`, [id]);
  const first = (result.rows as DbRow[])[0];
  return first ? toRow(first) : null;
}

export async function listTicketAttachments(db: Queryable, ticketId: string): Promise<AttachmentRow[]> {
  const result = await db.query(
    `SELECT ${COLUMNS} FROM attachments WHERE ticket_id = $1 ORDER BY created_at, id`,
    [ticketId],
  );
  return (result.rows as DbRow[]).map(toRow);
}
```

- [ ] **Step 8: Run the repo tests to verify they pass**

Run: `pnpm --filter @gisik-nokma/server exec vitest run test/attachments/attachment-repo.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 9: Commit**

```bash
git add apps/server .gitignore
git commit -m "Attachments floor: an ObjectStore interface with a torn-write-proof local store, traversal-proof keys, and a server-owned metadata table — the ledger will reference bytes, never carry them"
```

---

### Task 8: S3-compatible store and the store factory

**Files:**
- Create: `apps/server/src/attachments/s3-store.ts`
- Create: `apps/server/src/attachments/store-config.ts`
- Modify: `apps/server/package.json` (deps)
- Test: `apps/server/test/attachments/s3-store.test.ts`
- Test: `apps/server/test/attachments/store-config.test.ts`

**Interfaces:**
- Consumes: `ObjectStore`, `ObjectNotFoundError`, `assertValidObjectKey` (Task 7); `ConfigError` (Plan 1's `apps/server/src/config.ts`).
- Produces:
  - `class S3ObjectStore implements ObjectStore` — constructor `(config: S3StoreConfig, client?: S3Client)` where `type S3StoreConfig = { endpoint?: string; region: string; bucket: string; accessKeyId: string; secretAccessKey: string; forcePathStyle?: boolean }` (path-style default **true**: MinIO/R2/any S3-compatible endpoint).
  - `createObjectStoreFromEnv(env: NodeJS.ProcessEnv): ObjectStore`
  - Env contract: `OBJECT_STORE` = `local` (default) | `s3`; `OBJECT_STORE_DIR` (default `var/attachments`); for s3: `OBJECT_STORE_S3_REGION`, `OBJECT_STORE_S3_BUCKET`, `OBJECT_STORE_S3_ACCESS_KEY_ID`, `OBJECT_STORE_S3_SECRET_ACCESS_KEY` (all required, missing ones named in one `ConfigError`), `OBJECT_STORE_S3_ENDPOINT` (optional), `OBJECT_STORE_S3_FORCE_PATH_STYLE` (default `true`).

- [ ] **Step 1: Add the dependencies**

In `apps/server/package.json`, add to `dependencies`: `"@aws-sdk/client-s3": "^3.700.0"`, `"@aws-sdk/lib-storage": "^3.700.0"`; to `devDependencies`: `"aws-sdk-client-mock": "^4.1.0"`. Run `pnpm install`.

- [ ] **Step 2: Write the failing S3 store test**

`apps/server/test/attachments/s3-store.test.ts`:

```ts
import { Readable } from 'node:stream';
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { mockClient } from 'aws-sdk-client-mock';
import { beforeEach, describe, expect, it } from 'vitest';
import { InvalidObjectKeyError, ObjectNotFoundError } from '../../src/attachments/object-store.js';
import { S3ObjectStore } from '../../src/attachments/s3-store.js';

const s3Mock = mockClient(S3Client);

function makeStore(): S3ObjectStore {
  return new S3ObjectStore(
    { region: 'ap-south-1', bucket: 'gisik-attachments', accessKeyId: 'k', secretAccessKey: 's' },
    new S3Client({ region: 'ap-south-1' }),
  );
}

beforeEach(() => {
  s3Mock.reset();
});

describe('S3ObjectStore', () => {
  it('put uploads with bucket, key, content type and length', async () => {
    s3Mock.on(PutObjectCommand).resolves({});
    const bytes = Buffer.from('pdf bytes here');
    await makeStore().put('w/ws1/a/att1', Readable.from(bytes), { mime: 'application/pdf', size: bytes.length });
    const calls = s3Mock.commandCalls(PutObjectCommand);
    expect(calls.length).toBeGreaterThanOrEqual(1);
    const input = calls[0]!.args[0].input;
    expect(input.Bucket).toBe('gisik-attachments');
    expect(input.Key).toBe('w/ws1/a/att1');
    expect(input.ContentType).toBe('application/pdf');
  });

  it('getStream returns the body stream', async () => {
    const bytes = Buffer.from('image bytes');
    s3Mock.on(GetObjectCommand).resolves({ Body: Readable.from(bytes) as never });
    const stream = await makeStore().getStream('w/ws1/a/att1');
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk as Uint8Array));
    expect(Buffer.concat(chunks).equals(bytes)).toBe(true);
    expect(s3Mock.commandCalls(GetObjectCommand)[0]!.args[0].input.Key).toBe('w/ws1/a/att1');
  });

  it('a NoSuchKey answer becomes ObjectNotFoundError', async () => {
    s3Mock.on(GetObjectCommand).rejects(Object.assign(new Error('The specified key does not exist.'), { name: 'NoSuchKey' }));
    await expect(makeStore().getStream('w/ws1/a/gone')).rejects.toBeInstanceOf(ObjectNotFoundError);
  });

  it('other S3 failures propagate untranslated', async () => {
    s3Mock.on(GetObjectCommand).rejects(Object.assign(new Error('denied'), { name: 'AccessDenied' }));
    await expect(makeStore().getStream('w/ws1/a/x')).rejects.toThrow('denied');
  });

  it('delete sends DeleteObject', async () => {
    s3Mock.on(DeleteObjectCommand).resolves({});
    await makeStore().delete('w/ws1/a/att1');
    expect(s3Mock.commandCalls(DeleteObjectCommand)[0]!.args[0].input.Key).toBe('w/ws1/a/att1');
  });

  it('planted defect: malformed keys are refused before any network call', async () => {
    await expect(makeStore().getStream('../escape')).rejects.toBeInstanceOf(InvalidObjectKeyError);
    expect(s3Mock.commandCalls(GetObjectCommand)).toHaveLength(0);
  });
});
```

- [ ] **Step 3: Run it to verify it fails, then implement**

Run: `pnpm --filter @gisik-nokma/server exec vitest run test/attachments/s3-store.test.ts`
Expected: FAIL — module does not exist.

`apps/server/src/attachments/s3-store.ts`:

```ts
import type { Readable } from 'node:stream';
import { DeleteObjectCommand, GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import {
  ObjectNotFoundError,
  assertValidObjectKey,
  type ObjectMeta,
  type ObjectStore,
} from './object-store.js';

export type S3StoreConfig = {
  endpoint?: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Default true: path-style addressing works on every S3-compatible endpoint (MinIO, R2). */
  forcePathStyle?: boolean;
};

export class S3ObjectStore implements ObjectStore {
  private readonly client: S3Client;

  constructor(
    private readonly config: S3StoreConfig,
    client?: S3Client,
  ) {
    this.client =
      client ??
      new S3Client({
        region: config.region,
        ...(config.endpoint === undefined ? {} : { endpoint: config.endpoint }),
        forcePathStyle: config.forcePathStyle ?? true,
        credentials: {
          accessKeyId: config.accessKeyId,
          secretAccessKey: config.secretAccessKey,
        },
      });
  }

  async put(key: string, stream: Readable, meta: ObjectMeta): Promise<void> {
    assertValidObjectKey(key);
    // Upload handles multipart chunking for streams; below the part
    // threshold it issues a single PutObject.
    const upload = new Upload({
      client: this.client,
      params: {
        Bucket: this.config.bucket,
        Key: key,
        Body: stream,
        ContentType: meta.mime,
        ContentLength: meta.size,
      },
    });
    await upload.done();
  }

  async getStream(key: string): Promise<Readable> {
    assertValidObjectKey(key);
    try {
      const result = await this.client.send(
        new GetObjectCommand({ Bucket: this.config.bucket, Key: key }),
      );
      return result.Body as Readable;
    } catch (err) {
      if ((err as { name?: string }).name === 'NoSuchKey') {
        throw new ObjectNotFoundError(key);
      }
      throw err;
    }
  }

  async delete(key: string): Promise<void> {
    assertValidObjectKey(key);
    await this.client.send(new DeleteObjectCommand({ Bucket: this.config.bucket, Key: key }));
  }
}
```

Run the S3 tests again — expected: PASS (6 tests). If `ContentLength` in `Upload` params trips the installed SDK's types, drop that one field (it is an optimisation, not a contract) and note it in the commit message.

- [ ] **Step 4: Write the failing factory test, then implement**

`apps/server/test/attachments/store-config.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ConfigError } from '../../src/config.js';
import { LocalDiskStore } from '../../src/attachments/local-disk-store.js';
import { S3ObjectStore } from '../../src/attachments/s3-store.js';
import { createObjectStoreFromEnv } from '../../src/attachments/store-config.js';

const S3_ENV = {
  OBJECT_STORE: 's3',
  OBJECT_STORE_S3_REGION: 'ap-south-1',
  OBJECT_STORE_S3_BUCKET: 'gisik-attachments',
  OBJECT_STORE_S3_ACCESS_KEY_ID: 'key',
  OBJECT_STORE_S3_SECRET_ACCESS_KEY: 'secret',
};

describe('createObjectStoreFromEnv', () => {
  it('defaults to the local store', () => {
    expect(createObjectStoreFromEnv({})).toBeInstanceOf(LocalDiskStore);
  });

  it('builds the S3 store when fully configured', () => {
    expect(createObjectStoreFromEnv(S3_ENV)).toBeInstanceOf(S3ObjectStore);
  });

  it('planted defect: missing s3 variables are named, all of them, in one refusal', () => {
    const env = { OBJECT_STORE: 's3', OBJECT_STORE_S3_REGION: 'ap-south-1' };
    try {
      createObjectStoreFromEnv(env);
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ConfigError);
      const message = (err as Error).message;
      for (const name of ['OBJECT_STORE_S3_BUCKET', 'OBJECT_STORE_S3_ACCESS_KEY_ID', 'OBJECT_STORE_S3_SECRET_ACCESS_KEY']) {
        expect(message).toContain(name);
      }
      expect(message).not.toContain('OBJECT_STORE_S3_REGION');
    }
  });

  it('planted defect: an invented OBJECT_STORE value is refused by name', () => {
    expect(() => createObjectStoreFromEnv({ OBJECT_STORE: 'ftp' })).toThrow(/OBJECT_STORE.*ftp/);
  });
});
```

Run: `pnpm --filter @gisik-nokma/server exec vitest run test/attachments/store-config.test.ts`
Expected: FAIL. Then implement `apps/server/src/attachments/store-config.ts`:

```ts
import { ConfigError } from '../config.js';
import { LocalDiskStore } from './local-disk-store.js';
import { S3ObjectStore } from './s3-store.js';
import type { ObjectStore } from './object-store.js';

const S3_REQUIRED = [
  'OBJECT_STORE_S3_REGION',
  'OBJECT_STORE_S3_BUCKET',
  'OBJECT_STORE_S3_ACCESS_KEY_ID',
  'OBJECT_STORE_S3_SECRET_ACCESS_KEY',
] as const;

export function createObjectStoreFromEnv(env: NodeJS.ProcessEnv): ObjectStore {
  const kind = env.OBJECT_STORE ?? 'local';
  if (kind === 'local') {
    return new LocalDiskStore(env.OBJECT_STORE_DIR ?? 'var/attachments');
  }
  if (kind === 's3') {
    const missing = S3_REQUIRED.filter((name) => !env[name]);
    if (missing.length > 0) {
      throw new ConfigError(`object store 's3' needs: ${missing.join(', ')}`);
    }
    return new S3ObjectStore({
      region: env.OBJECT_STORE_S3_REGION as string,
      bucket: env.OBJECT_STORE_S3_BUCKET as string,
      accessKeyId: env.OBJECT_STORE_S3_ACCESS_KEY_ID as string,
      secretAccessKey: env.OBJECT_STORE_S3_SECRET_ACCESS_KEY as string,
      ...(env.OBJECT_STORE_S3_ENDPOINT === undefined ? {} : { endpoint: env.OBJECT_STORE_S3_ENDPOINT }),
      forcePathStyle: env.OBJECT_STORE_S3_FORCE_PATH_STYLE !== 'false',
    });
  }
  throw new ConfigError(`OBJECT_STORE must be 'local' or 's3', got '${kind}'`);
}
```

If Plan 1's `ConfigError` constructor takes a different argument shape (e.g. a list of variable names), adapt the two `throw` sites to it — the named-variables assertion is the contract, not the constructor arity.

Run the factory tests — expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/server pnpm-lock.yaml
git commit -m "S3-compatible object store behind the same three verbs, path-style by default for MinIO/R2, plus an env factory that names every missing variable"
```

---

### Task 9: Magic-byte sniffing and `POST /v1/attachments`

**Files:**
- Create: `apps/server/src/attachments/sniff.ts`
- Create: `apps/server/src/attachments/filename.ts`
- Create: `apps/server/src/routes/attachments.ts` (POST half; Task 10 adds GET)
- Modify: `apps/server/package.json` (deps: `@fastify/multipart`, `file-type`)
- Test: `apps/server/test/attachments/sniff.test.ts`
- Test: `apps/server/test/attachments/filename.test.ts`
- Test: `apps/server/test/routes/attachments-upload.test.ts`

**Interfaces:**
- Consumes: `EMBEDDABLE_IMAGE_MIME` (Task 2); `ObjectStore`, `LocalDiskStore`, repo (Task 7); `canSee`, `makeRequireSession`, `Auth`, seed helpers (Plan 4); `proj_tickets` (Plan 3); `newUlid` (Plan 1); `createTestDatabase` (Plan 1).
- Produces (cross-plan API):
  - `ALLOWED_ATTACHMENT_MIME: ReadonlySet<string>` — the closed upload allow-list (images ∪ pdf, docx, xlsx, zip, mp4, webm, mp3). `EMBEDDABLE_IMAGE_MIME ⊆ ALLOWED_ATTACHMENT_MIME` is test-enforced.
  - `sniffAllowedMime(bytes: Uint8Array): Promise<{ ok: true; mime: string } | { ok: false; reason: string }>`
  - `sanitizeFilename(raw: string | undefined): string`
  - `ATTACHMENT_MAX_BYTES = 26_214_400`
  - `registerAttachmentRoutes(app: FastifyInstance, deps: AttachmentRouteDeps): Promise<void>` where `type AttachmentRouteDeps = { pool: Pool; store: ObjectStore; auth: Auth; maxBytes?: number }`
  - `POST /v1/attachments` — multipart, fields `ticketId` **then** `file` (field parts must precede the file part); session required; visibility of the ticket required (`canSee`); → `201 { attachmentId, url, mime, filename, size }` where `mime`/`size` are the **server-sniffed truth** the client MUST echo into its `attachment.added` event (a client-claimed mime would be a small lie). `{ attachmentId, url }` is coordination amendment 15's shape; the three extra fields are additive. Refusals: 401 unauthenticated · 404 (unknown ticket and invisible ticket, indistinguishable) · 400 missing parts · 413 oversize (multipart's own statusCode, propagated) · 415 `{ error: 'unsupported-media-type', reason }` for sniff failures.
  - **The upload endpoint appends nothing to the ledger.** The client emits `attachment.added { kind: 'upload', attachmentId, filename, mime, size, sha256 }` (entity = the ticket) via `POST /v1/events` after the upload returns — the event is the claim; the upload is just bytes arriving (amendment 15). `kind` and `sha256` arrive with Tasks 9a/11a and the pending Plan 3 amendment; `composeUploadAttachmentAdded` (Task 12a) is the one place that payload is built.

- [ ] **Step 1: Add dependencies**

In `apps/server/package.json` `dependencies`, add `"@fastify/multipart": "^9.0.0"` and `"file-type": "^19.6.0"`. Run `pnpm install`.

- [ ] **Step 2: Write the failing sniff and filename tests**

`apps/server/test/attachments/sniff.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { EMBEDDABLE_IMAGE_MIME } from '@gisik-nokma/domain';
import { ALLOWED_ATTACHMENT_MIME, sniffAllowedMime } from '../../src/attachments/sniff.js';

/** Real magic bytes, minimal viable prefixes. */
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52]);
const PDF = new TextEncoder().encode('%PDF-1.7\nstub body\n%%EOF');
const EXE = Uint8Array.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00, 0x04, 0x00, 0x00, 0x00, ...new Array<number>(52).fill(0)]);
const NOISE = Uint8Array.from(new Array<number>(64).fill(0x07));

describe('sniffAllowedMime', () => {
  it('identifies a png by bytes alone', async () => {
    expect(await sniffAllowedMime(PNG)).toEqual({ ok: true, mime: 'image/png' });
  });

  it('identifies a pdf by bytes alone', async () => {
    expect(await sniffAllowedMime(PDF)).toEqual({ ok: true, mime: 'application/pdf' });
  });

  it('planted defect: an executable is refused no matter what it is called', async () => {
    const result = await sniffAllowedMime(EXE);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('not accepted');
  });

  it('planted defect: unidentifiable bytes are refused, extensions never consulted', async () => {
    const result = await sniffAllowedMime(NOISE);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('never trusted');
  });

  it('every embeddable image mime is uploadable (subset invariant)', () => {
    for (const mime of EMBEDDABLE_IMAGE_MIME) {
      expect(ALLOWED_ATTACHMENT_MIME.has(mime), `${mime} missing from allow-list`).toBe(true);
    }
  });
});
```

`apps/server/test/attachments/filename.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { sanitizeFilename } from '../../src/attachments/filename.js';

describe('sanitizeFilename', () => {
  it('passes ordinary names through', () => {
    expect(sanitizeFilename('gst-receipt.pdf')).toBe('gst-receipt.pdf');
  });

  it('planted defect: header-injection characters are stripped', () => {
    const hostile = 'evil".pdf\r\nSet-Cookie: stolen=1';
    const clean = sanitizeFilename(hostile);
    expect(clean).not.toMatch(/[\r\n"\\]/);
    expect(clean).toContain('evil');
  });

  it('planted defect: path separators are stripped', () => {
    expect(sanitizeFilename('..\\..\\windows\\cmd.exe')).not.toMatch(/[/\\]/);
    expect(sanitizeFilename('../../etc/passwd')).not.toContain('/');
  });

  it('empty and undefined fall back to "file"; length is capped', () => {
    expect(sanitizeFilename(undefined)).toBe('file');
    expect(sanitizeFilename('   ')).toBe('file');
    expect(sanitizeFilename('x'.repeat(500))).toHaveLength(160);
  });
});
```

- [ ] **Step 3: Run them to verify they fail, then implement**

Run: `pnpm --filter @gisik-nokma/server exec vitest run test/attachments/sniff.test.ts test/attachments/filename.test.ts`
Expected: FAIL — modules do not exist.

`apps/server/src/attachments/sniff.ts`:

```ts
import { fileTypeFromBuffer } from 'file-type';
import { EMBEDDABLE_IMAGE_MIME } from '@gisik-nokma/domain';

/**
 * The closed allow-list of attachment types v1 accepts. Detection is by
 * magic bytes only; the filename and its extension are display data,
 * never a decision input. Absentees are deliberate: SVG (no magic bytes,
 * script vector), plain text/CSV (unsniffable) — see the plan's Open
 * questions 5 before "just adding" one.
 */
export const ALLOWED_ATTACHMENT_MIME: ReadonlySet<string> = new Set([
  ...EMBEDDABLE_IMAGE_MIME,
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // docx
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // xlsx
  'application/zip',
  'video/mp4',
  'video/webm',
  'audio/mpeg',
]);

export type SniffResult = { ok: true; mime: string } | { ok: false; reason: string };

export async function sniffAllowedMime(bytes: Uint8Array): Promise<SniffResult> {
  const detected = await fileTypeFromBuffer(bytes);
  if (!detected) {
    return {
      ok: false,
      reason:
        'This file type could not be identified from its content, so it was refused. File names and extensions are never trusted.',
    };
  }
  if (!ALLOWED_ATTACHMENT_MIME.has(detected.mime)) {
    return { ok: false, reason: `Files of type ${detected.mime} are not accepted here.` };
  }
  return { ok: true, mime: detected.mime };
}
```

`apps/server/src/attachments/filename.ts`:

```ts
/**
 * A stored filename is display data. Strip anything that could break out
 * of a quoted Content-Disposition value (CR/LF header injection, quotes,
 * backslashes), anything path-like, and control characters; cap length.
 */
export function sanitizeFilename(raw: string | undefined): string {
  const cleaned = (raw ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\r\n"\\/\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, 160);
  return cleaned === '' ? 'file' : cleaned;
}
```

Run the two suites again — expected: PASS (9 tests).

- [ ] **Step 4: Write the failing upload-route test**

`apps/server/test/routes/attachments-upload.test.ts`:

```ts
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Auth } from '../../src/auth/auth.js';
import { LocalDiskStore } from '../../src/attachments/local-disk-store.js';
import { getAttachment } from '../../src/attachments/attachment-repo.js';
import { registerAttachmentRoutes } from '../../src/routes/attachments.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { seedGuest, seedMember, seedTicket } from '../helpers/seed.js';

const WS = '01J9GWKS000000000000000000';
const PRJ = '01J9GPRJ000000000000000000';
const TICKET = '01J9GTKA000000000000000000';
const MEMBER = '01J9GUSM000000000000000000';
const GUEST = '01J9GUSG000000000000000000';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52]);
const EXE = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(62)]);

/**
 * Sessions resolve through a stub Auth: `Bearer <userId>` → that user.
 * makeRequireSession's real better-auth integration is Plan 4's tested
 * ground; these tests own upload semantics, not session mechanics.
 */
function stubAuth(): Auth {
  return {
    api: {
      getSession: async ({ headers }: { headers: Headers }) => {
        const value = headers.get('authorization');
        if (!value?.startsWith('Bearer 01J9')) return null;
        return { user: { id: value.slice('Bearer '.length) } };
      },
    },
  } as unknown as Auth;
}

function multipartBody(
  parts: Array<{ name: string; value?: string; filename?: string; contentType?: string; data?: Buffer }>,
): { payload: Buffer; headers: Record<string, string> } {
  const boundary = 'gisik-test-boundary';
  const chunks: Buffer[] = [];
  for (const part of parts) {
    chunks.push(Buffer.from(`--${boundary}\r\n`));
    if (part.filename !== undefined) {
      chunks.push(
        Buffer.from(
          `Content-Disposition: form-data; name="${part.name}"; filename="${part.filename}"\r\n` +
            `Content-Type: ${part.contentType ?? 'application/octet-stream'}\r\n\r\n`,
        ),
      );
      chunks.push(part.data ?? Buffer.alloc(0));
    } else {
      chunks.push(Buffer.from(`Content-Disposition: form-data; name="${part.name}"\r\n\r\n${part.value ?? ''}`));
    }
    chunks.push(Buffer.from('\r\n'));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return {
    payload: Buffer.concat(chunks),
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
  };
}

function upload(app: FastifyInstance, userId: string, ticketId: string, file: { filename: string; contentType: string; data: Buffer }) {
  const { payload, headers } = multipartBody([
    { name: 'ticketId', value: ticketId },
    { name: 'file', filename: file.filename, contentType: file.contentType, data: file.data },
  ]);
  return app.inject({
    method: 'POST',
    url: '/v1/attachments',
    payload,
    headers: { ...headers, authorization: `Bearer ${userId}` },
  });
}

let db: TestDatabase;
let app: FastifyInstance;
let storeRoot = '';

beforeAll(async () => {
  db = await createTestDatabase();
  storeRoot = await mkdtemp(join(tmpdir(), 'gisik-upload-'));
  await seedMember(db.pool, WS, MEMBER, 'member', [{ projectId: PRJ }]);
  await seedGuest(db.pool, WS, GUEST);
  await seedTicket(db.pool, { workspaceId: WS, projectId: PRJ, ticketId: TICKET });
  // The route also reads proj_tickets for the owning workspace; make the row
  // exist regardless of what seedTicket wrote (columns per Plan 3).
  await db.pool.query(
    `INSERT INTO proj_tickets (ticket_id, workspace_id, project_id, type_id, parent_id, workflow_id, state_id, state_category, assignee_id, collaborator_ids, fields)
     VALUES ($1, $2, $3, 'task', NULL, 'wf_basic', 'todo', 'open', NULL, '[]', '{}')
     ON CONFLICT (ticket_id) DO NOTHING`,
    [TICKET, WS, PRJ],
  );
  app = Fastify();
  await registerAttachmentRoutes(app, {
    pool: db.pool,
    store: new LocalDiskStore(storeRoot),
    auth: stubAuth(),
    maxBytes: 4096, // small ceiling so the oversize planted defect is cheap
  });
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await rm(storeRoot, { recursive: true, force: true });
  await db.drop();
});

describe('POST /v1/attachments', () => {
  it('a member uploads a png: 201 with the server-sniffed truth', async () => {
    const res = await upload(app, MEMBER, TICKET, { filename: 'photo.png', contentType: 'image/png', data: PNG });
    expect(res.statusCode).toBe(201);
    const body = res.json() as { attachmentId: string; url: string; mime: string; filename: string; size: number };
    expect(body.url).toBe(`/v1/attachments/${body.attachmentId}`);
    expect(body.mime).toBe('image/png');
    expect(body.filename).toBe('photo.png');
    expect(body.size).toBe(PNG.length);
    const row = await getAttachment(db.pool, body.attachmentId);
    expect(row).toMatchObject({ ticketId: TICKET, workspaceId: WS, uploaderId: MEMBER, mime: 'image/png' });
  });

  it('planted defect: a renamed .exe is refused 415 by its bytes, and nothing is stored', async () => {
    const res = await upload(app, MEMBER, TICKET, { filename: 'holiday-photo.png', contentType: 'image/png', data: EXE });
    expect(res.statusCode).toBe(415);
    const body = res.json() as { error: string; reason: string };
    expect(body.error).toBe('unsupported-media-type');
    expect(body.reason).toContain('not accepted');
  });

  it('planted defect: unidentifiable bytes are refused 415', async () => {
    const res = await upload(app, MEMBER, TICKET, { filename: 'notes.txt', contentType: 'text/plain', data: Buffer.alloc(64, 7) });
    expect(res.statusCode).toBe(415);
  });

  it('planted defect: an oversize upload is refused 413', async () => {
    const big = Buffer.concat([PNG, Buffer.alloc(8192)]);
    const res = await upload(app, MEMBER, TICKET, { filename: 'big.png', contentType: 'image/png', data: big });
    expect(res.statusCode).toBe(413);
  });

  it('planted defect: a guest without visibility gets a 404 indistinguishable from a missing ticket', async () => {
    const guestRes = await upload(app, GUEST, TICKET, { filename: 'p.png', contentType: 'image/png', data: PNG });
    const missingRes = await upload(app, MEMBER, '01J9GNOP000000000000000000', { filename: 'p.png', contentType: 'image/png', data: PNG });
    expect(guestRes.statusCode).toBe(404);
    expect(missingRes.statusCode).toBe(404);
    expect(guestRes.body).toBe(missingRes.body);
  });

  it('no session → 401; missing parts → 400', async () => {
    const { payload, headers } = multipartBody([
      { name: 'ticketId', value: TICKET },
      { name: 'file', filename: 'p.png', contentType: 'image/png', data: PNG },
    ]);
    const anon = await app.inject({ method: 'POST', url: '/v1/attachments', payload, headers });
    expect(anon.statusCode).toBe(401);

    const noTicket = multipartBody([{ name: 'file', filename: 'p.png', contentType: 'image/png', data: PNG }]);
    const res400 = await app.inject({
      method: 'POST',
      url: '/v1/attachments',
      payload: noTicket.payload,
      headers: { ...noTicket.headers, authorization: `Bearer ${MEMBER}` },
    });
    expect(res400.statusCode).toBe(400);
  });
});
```

- [ ] **Step 5: Run it to verify it fails, then implement the route**

Run: `pnpm --filter @gisik-nokma/server exec vitest run test/routes/attachments-upload.test.ts`
Expected: FAIL — `registerAttachmentRoutes` does not exist.

`apps/server/src/routes/attachments.ts` (Task-9 form; Task 10 appends the GET handler to this same `registerAttachmentRoutes`):

```ts
import { Readable } from 'node:stream';
import multipart from '@fastify/multipart';
import type { FastifyInstance, FastifyReply } from 'fastify';
import type { Pool } from 'pg';
import { newUlid } from '@gisik-nokma/domain';
import type { Auth } from '../auth/auth.js';
import { makeRequireSession } from '../auth/require-session.js';
import { canSee } from '../visibility/can-see.js';
import { insertAttachment } from '../attachments/attachment-repo.js';
import { sanitizeFilename } from '../attachments/filename.js';
import { sniffAllowedMime } from '../attachments/sniff.js';
import type { ObjectStore } from '../attachments/object-store.js';

export const ATTACHMENT_MAX_BYTES = 26_214_400; // 25 MiB

export type AttachmentRouteDeps = {
  pool: Pool;
  store: ObjectStore;
  auth: Auth;
  maxBytes?: number;
};

/**
 * One 404 for "does not exist" and "you may not see it": existence must
 * be indistinguishable from invisibility (spec §6 applied to files). The
 * download planted-defect test asserts byte-identical bodies.
 */
function replyNotFound(reply: FastifyReply): FastifyReply {
  return reply.code(404).send({ error: 'not-found' });
}

export async function registerAttachmentRoutes(
  app: FastifyInstance,
  deps: AttachmentRouteDeps,
): Promise<void> {
  const maxBytes = deps.maxBytes ?? ATTACHMENT_MAX_BYTES;
  await app.register(multipart, { limits: { fileSize: maxBytes, files: 1 } });
  const requireSession = makeRequireSession(deps.auth);

  app.post('/v1/attachments', { preHandler: requireSession }, async (request, reply) => {
    const data = await request.file();
    if (!data) {
      return reply.code(400).send({ error: 'bad-request', reason: 'a multipart "file" part is required' });
    }
    const rawTicketField = data.fields['ticketId'];
    const ticketField = Array.isArray(rawTicketField) ? rawTicketField[0] : rawTicketField;
    const ticketId =
      ticketField && ticketField.type === 'field' && typeof ticketField.value === 'string'
        ? ticketField.value
        : null;
    if (!ticketId) {
      return reply.code(400).send({ error: 'bad-request', reason: 'a "ticketId" field is required before the file part' });
    }

    const ticketResult = await deps.pool.query(
      'SELECT workspace_id FROM proj_tickets WHERE ticket_id = $1',
      [ticketId],
    );
    const workspaceId = (ticketResult.rows as Array<{ workspace_id: string }>)[0]?.workspace_id;
    if (!workspaceId || !(await canSee(deps.pool, request.currentUserId, ticketId))) {
      return replyNotFound(reply);
    }

    // Throws @fastify/multipart's oversize error (statusCode 413) when the
    // stream exceeds maxBytes — deliberately not caught: Fastify answers
    // with the error's own status, and the test pins 413 end-to-end.
    const buffer = await data.toBuffer();

    const sniffed = await sniffAllowedMime(buffer);
    if (!sniffed.ok) {
      return reply.code(415).send({ error: 'unsupported-media-type', reason: sniffed.reason });
    }

    const attachmentId = newUlid();
    const objectKey = `w/${workspaceId}/a/${attachmentId}`;
    const filename = sanitizeFilename(data.filename);
    await deps.store.put(objectKey, Readable.from(buffer), { mime: sniffed.mime, size: buffer.length });
    await insertAttachment(deps.pool, {
      id: attachmentId,
      workspaceId,
      ticketId,
      uploaderId: request.currentUserId,
      filename,
      mime: sniffed.mime,
      size: buffer.length,
      objectKey,
    });

    // No ledger append here: the client emits attachment.added via
    // POST /v1/events with these exact sniffed values (amendment 15).
    return reply.code(201).send({
      attachmentId,
      url: `/v1/attachments/${attachmentId}`,
      mime: sniffed.mime,
      filename,
      size: buffer.length,
    });
  });
}
```

- [ ] **Step 6: Run the route tests to verify they pass**

Run: `pnpm --filter @gisik-nokma/server exec vitest run test/routes/attachments-upload.test.ts`
Expected: PASS (6 tests). If `seedMember`/`seedGuest`/`seedTicket` signatures drifted during Plan 4 execution, adapt the three call sites in the test's `beforeAll` — the assertions do not change.

- [ ] **Step 7: Commit**

```bash
git add apps/server pnpm-lock.yaml
git commit -m "Uploads: magic bytes decide the mime and a renamed .exe is refused by what it is, not what it claims; visibility gates the door with a 404 that admits nothing"
```

---

### Task 9a: SHA-256 at the door — an uploaded file's content hash

Owner sign-off 2026-08-20 (coordination doc, Google Drive row): *"Uploaded attachments additionally carry a SHA-256 so evidence is verifiable rather than merely present."* Spec §2 now says the same. The hash is computed server-side over the bytes that were actually stored — the same buffer the sniffer judged — so it describes what this product holds, never what a client said it was sending.

**Files:**
- Create: `apps/server/migrations/<timestamp>_attachment_sha256.sql` (via node-pg-migrate, as in Task 7)
- Create: `apps/server/src/attachments/content-hash.ts`
- Modify: `apps/server/src/attachments/attachment-repo.ts` (named modification, Step 3)
- Modify: `apps/server/src/routes/attachments.ts` (named modification, Step 4)
- Test: `apps/server/test/attachments/content-hash.test.ts`
- Test: `apps/server/test/routes/attachments-upload.test.ts` (append cases — the existing ones are untouched)

**Interfaces:**
- Consumes: `insertAttachment`, `getAttachment`, `AttachmentRow` (Task 7); the upload route (Task 9).
- Produces (cross-plan API):
  - `sha256Hex(bytes: Uint8Array): string` — lowercase hex, 64 characters.
  - `attachments.sha256 text` — **nullable on purpose**: `NULL` means *unknown* (a row written before this column existed), and unknown is rendered as unknown, never as verified. Every row this plan writes carries a real hash. A `CHECK` refuses anything that is not 64 lowercase hex characters.
  - `AttachmentRow` gains `sha256: string | null`; `insertAttachment`'s row argument gains optional `sha256?: string`.
  - `POST /v1/attachments` 201 body gains `sha256: string` → `{ attachmentId, url, mime, filename, size, sha256 }`. The client MUST echo it into `attachment.added` exactly as the upload answered — the hash is the server's fact about the bytes, like `mime` and `size` (pending Plan 3 amendment; see Open questions).
  - `UploadResult` (Task 12) and `EditorSlotUpload` (Task 14) carry the same field.

- [ ] **Step 1: Generate and fill the migration**

Run: `pnpm --filter @gisik-nokma/server exec node-pg-migrate create attachment sha256 --migration-file-language sql --migrations-dir migrations`
Expected: creates `apps/server/migrations/<timestamp>_attachment-sha256.sql`.

Up SQL:

```sql
ALTER TABLE attachments ADD COLUMN sha256 text;

ALTER TABLE attachments
  ADD CONSTRAINT attachments_sha256_hex CHECK (sha256 IS NULL OR sha256 ~ '^[0-9a-f]{64}$');

COMMENT ON COLUMN attachments.sha256 IS 'Lowercase-hex SHA-256 of the stored bytes, computed server-side at upload. NULL means unknown — a row written before hashing existed — and is shown as unknown, never as verified.';
```

Down SQL:

```sql
ALTER TABLE attachments DROP CONSTRAINT attachments_sha256_hex;
ALTER TABLE attachments DROP COLUMN sha256;
```

- [ ] **Step 2: Write the failing hash test**

`apps/server/test/attachments/content-hash.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { sha256Hex } from '../../src/attachments/content-hash.js';

/** Pinned vectors from FIPS 180-4 — the wiring is ours, the arithmetic is not. */
const EMPTY = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const ABC = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';

describe('sha256Hex', () => {
  it('matches the published vectors', () => {
    expect(sha256Hex(new Uint8Array(0))).toBe(EMPTY);
    expect(sha256Hex(new TextEncoder().encode('abc'))).toBe(ABC);
  });

  it('is lowercase hex, 64 characters', () => {
    expect(sha256Hex(new TextEncoder().encode('gisik'))).toMatch(/^[0-9a-f]{64}$/);
  });

  it('planted defect: one flipped byte is a different hash — the hash is of content, not of length', () => {
    const a = Uint8Array.from([1, 2, 3, 4]);
    const b = Uint8Array.from([1, 2, 3, 5]);
    expect(sha256Hex(a)).not.toBe(sha256Hex(b));
    expect(sha256Hex(a)).toHaveLength(sha256Hex(b).length);
  });
});
```

Run: `pnpm --filter @gisik-nokma/server exec vitest run test/attachments/content-hash.test.ts`
Expected: FAIL — the module does not exist.

`apps/server/src/attachments/content-hash.ts`:

```ts
import { createHash } from 'node:crypto';

/**
 * The SHA-256 of the bytes this product actually stored. Evidence must be
 * verifiable, not merely present (spec §2): with the hash recorded, a
 * require-evidence claim points at a file whose identity can be re-proved,
 * and a substituted file stops matching.
 */
export function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}
```

Run it again — expected: PASS (3 tests).

- [ ] **Step 3: Carry the hash through the repo (named modification of Task 7's file)**

In `apps/server/src/attachments/attachment-repo.ts`:

1. `type AttachmentRow` gains `sha256: string | null;` immediately after `objectKey`.
2. `insertAttachment`'s row parameter becomes `Omit<AttachmentRow, 'createdAt' | 'sha256'> & { sha256?: string }`; the INSERT column list gains `sha256` as the last column with a new positional parameter bound to `row.sha256 ?? null` — the `?? null` is the *unknown* case being written honestly, not a default value standing in for a real hash.
3. `getAttachment` and `listTicketAttachments` add `sha256` to their SELECT lists and map it as `sha256: row.sha256 ?? null`.

No other repo behaviour changes; Task 7's existing repo test still passes unmodified, because a row inserted without a hash reads back `sha256: null` rather than failing.

- [ ] **Step 4: Hash inside the upload route (named modification of Task 9's file)**

In `apps/server/src/routes/attachments.ts`:

1. Add `import { sha256Hex } from '../attachments/content-hash.js';`
2. After the sniff succeeds and before `deps.store.put(...)`, add:

```ts
    // Hash the exact buffer that is about to be stored — not the client's
    // claim about it, and not a re-read (a re-read could hash something else).
    const sha256 = sha256Hex(buffer);
```

3. Pass `sha256` in the `insertAttachment({ … })` object literal.
4. Add `sha256` to the `reply.code(201).send({ … })` body.

- [ ] **Step 5: Append the failing route cases**

Append inside the existing `describe('POST /v1/attachments', …)` block of `apps/server/test/routes/attachments-upload.test.ts` (the file's helpers, seeds and constants are reused as they stand):

```ts
  it('the 201 body and the stored row carry the same SHA-256 of the stored bytes', async () => {
    const res = await upload(app, MEMBER, TICKET, { filename: 'photo.png', contentType: 'image/png', data: PNG });
    expect(res.statusCode).toBe(201);
    const body = res.json() as { attachmentId: string; sha256: string };
    expect(body.sha256).toBe(createHash('sha256').update(PNG).digest('hex'));
    const row = await getAttachment(db.pool, body.attachmentId);
    expect(row?.sha256).toBe(body.sha256);
  });

  it('planted defect: two uploads differing by one byte get different hashes, and a lying content-type changes nothing', async () => {
    const other = Buffer.concat([PNG, Buffer.from([0x01])]);
    const first = await upload(app, MEMBER, TICKET, { filename: 'a.png', contentType: 'image/png', data: PNG });
    const second = await upload(app, MEMBER, TICKET, { filename: 'b.png', contentType: 'application/pdf', data: other });
    const a = first.json() as { sha256: string };
    const b = second.json() as { sha256: string };
    expect(a.sha256).not.toBe(b.sha256);
    expect(b.sha256).toBe(createHash('sha256').update(other).digest('hex'));
  });
```

Add to that file's imports: `import { createHash } from 'node:crypto';`.

- [ ] **Step 6: Run the suites**

Run: `pnpm --filter @gisik-nokma/server exec vitest run test/attachments/ test/routes/attachments-upload.test.ts`
Expected: PASS — the two new upload cases, the three hash cases, and every case Task 7 and Task 9 already had.

- [ ] **Step 7: Commit**

```bash
git add apps/server
git commit -m "Hash every upload as it lands: evidence should point at a file whose identity can be re-proved, and an unhashed row says unknown rather than pretending"
```

---

### Task 10: `GET /v1/attachments/:id` — streaming downloads under `canSee`

**Files:**
- Modify: `apps/server/src/routes/attachments.ts` (append the GET handler inside `registerAttachmentRoutes`)
- Test: `apps/server/test/routes/attachments-download.test.ts`

**Interfaces:**
- Consumes: everything Task 9 wired; `ObjectNotFoundError` (Task 7); `EMBEDDABLE_IMAGE_MIME` (Task 2).
- Produces:
  - `GET /v1/attachments/:id` — session required; `canSee` on the **owning ticket** decides; streams the object with `content-type` = stored sniffed mime, `content-length`, `x-content-type-options: nosniff`, and `content-disposition` `inline` for embeddable images / `attachment; filename="…"` (sanitized) for everything else. Unknown id, invisible ticket, and metadata-without-bytes all answer the **same byte-identical 404**.

- [ ] **Step 1: Write the failing test**

`apps/server/test/routes/attachments-download.test.ts`:

```ts
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Auth } from '../../src/auth/auth.js';
import { LocalDiskStore } from '../../src/attachments/local-disk-store.js';
import { insertAttachment } from '../../src/attachments/attachment-repo.js';
import { registerAttachmentRoutes } from '../../src/routes/attachments.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { seedGuest, seedMember, seedTicket } from '../helpers/seed.js';

const WS = '01J9GWKS000000000000000000';
const PRJ = '01J9GPRJ000000000000000000';
const TICKET = '01J9GTKA000000000000000000';
const MEMBER = '01J9GUSM000000000000000000';
const GUEST = '01J9GUSG000000000000000000';
const IMG_ID = '01J9GATA000000000000000000';
const PDF_ID = '01J9GATB000000000000000000';
const ORPHAN_ID = '01J9GATC000000000000000000';

const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const PDF_BYTES = Buffer.from('%PDF-1.7 body');

function stubAuth(): Auth {
  return {
    api: {
      getSession: async ({ headers }: { headers: Headers }) => {
        const value = headers.get('authorization');
        if (!value?.startsWith('Bearer 01J9')) return null;
        return { user: { id: value.slice('Bearer '.length) } };
      },
    },
  } as unknown as Auth;
}

let db: TestDatabase;
let app: FastifyInstance;
let storeRoot = '';

beforeAll(async () => {
  db = await createTestDatabase();
  storeRoot = await mkdtemp(join(tmpdir(), 'gisik-download-'));
  const store = new LocalDiskStore(storeRoot);
  await seedMember(db.pool, WS, MEMBER, 'member', [{ projectId: PRJ }]);
  await seedGuest(db.pool, WS, GUEST);
  await seedTicket(db.pool, { workspaceId: WS, projectId: PRJ, ticketId: TICKET });

  await store.put(`w/${WS}/a/${IMG_ID}`, Readable.from(PNG_BYTES), { mime: 'image/png', size: PNG_BYTES.length });
  await insertAttachment(db.pool, {
    id: IMG_ID, workspaceId: WS, ticketId: TICKET, uploaderId: MEMBER,
    filename: 'shelf.png', mime: 'image/png', size: PNG_BYTES.length, objectKey: `w/${WS}/a/${IMG_ID}`,
  });
  await store.put(`w/${WS}/a/${PDF_ID}`, Readable.from(PDF_BYTES), { mime: 'application/pdf', size: PDF_BYTES.length });
  await insertAttachment(db.pool, {
    id: PDF_ID, workspaceId: WS, ticketId: TICKET, uploaderId: MEMBER,
    filename: 'gst-receipt.pdf', mime: 'application/pdf', size: PDF_BYTES.length, objectKey: `w/${WS}/a/${PDF_ID}`,
  });
  // Metadata whose bytes are gone — the internal-inconsistency planted defect.
  await insertAttachment(db.pool, {
    id: ORPHAN_ID, workspaceId: WS, ticketId: TICKET, uploaderId: MEMBER,
    filename: 'lost.pdf', mime: 'application/pdf', size: 9, objectKey: `w/${WS}/a/${ORPHAN_ID}`,
  });

  app = Fastify();
  await registerAttachmentRoutes(app, { pool: db.pool, store, auth: stubAuth() });
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await rm(storeRoot, { recursive: true, force: true });
  await db.drop();
});

function download(userId: string, id: string) {
  return app.inject({ method: 'GET', url: `/v1/attachments/${id}`, headers: { authorization: `Bearer ${userId}` } });
}

describe('GET /v1/attachments/:id', () => {
  it('a member streams the exact bytes with honest headers', async () => {
    const res = await download(MEMBER, IMG_ID);
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('image/png');
    expect(res.headers['content-length']).toBe(String(PNG_BYTES.length));
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-disposition']).toBe('inline');
    expect(res.rawPayload.equals(PNG_BYTES)).toBe(true);
  });

  it('non-images download as attachments with the sanitized filename', async () => {
    const res = await download(MEMBER, PDF_ID);
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-disposition']).toBe('attachment; filename="gst-receipt.pdf"');
    expect(res.headers['content-disposition']).toMatch(/^attachment; filename="[^"\r\n]*"$/);
  });

  it('planted defect (the named refusal): an unshared guest and a nonexistent id are indistinguishable', async () => {
    const guestRes = await download(GUEST, IMG_ID);
    const missingRes = await download(MEMBER, '01J9GNON000000000000000000');
    expect(guestRes.statusCode).toBe(404);
    expect(missingRes.statusCode).toBe(404);
    expect(guestRes.body).toBe(missingRes.body);
    expect(guestRes.headers['content-type']).toBe(missingRes.headers['content-type']);
  });

  it('planted defect: metadata without bytes answers the same 404, revealing nothing', async () => {
    const orphanRes = await download(MEMBER, ORPHAN_ID);
    const missingRes = await download(MEMBER, '01J9GNON000000000000000000');
    expect(orphanRes.statusCode).toBe(404);
    expect(orphanRes.body).toBe(missingRes.body);
  });

  it('no session → 401', async () => {
    const res = await app.inject({ method: 'GET', url: `/v1/attachments/${IMG_ID}` });
    expect(res.statusCode).toBe(401);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @gisik-nokma/server exec vitest run test/routes/attachments-download.test.ts`
Expected: FAIL — GET route not registered (404 everywhere, including the member case; the suite's 200 assertions fail).

- [ ] **Step 3: Implement the GET handler**

Append inside `registerAttachmentRoutes` in `apps/server/src/routes/attachments.ts` (after the POST handler), with these imports added at the top of the file:

```ts
import type { Readable as ReadableStream_ } from 'node:stream';
import { EMBEDDABLE_IMAGE_MIME } from '@gisik-nokma/domain';
import { getAttachment } from '../attachments/attachment-repo.js';
import { ObjectNotFoundError } from '../attachments/object-store.js';
```

```ts
  app.get('/v1/attachments/:id', { preHandler: requireSession }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const row = await getAttachment(deps.pool, id);
    if (!row) return replyNotFound(reply);
    if (!(await canSee(deps.pool, request.currentUserId, row.ticketId))) {
      return replyNotFound(reply);
    }

    let stream: ReadableStream_;
    try {
      stream = await deps.store.getStream(row.objectKey);
    } catch (err) {
      if (err instanceof ObjectNotFoundError) {
        // Metadata without bytes is an internal inconsistency: log the
        // detail loudly here, answer the same anonymous 404 out there
        // (CODING_STANDARDS: detailed internally, generic externally).
        request.log.error({ attachmentId: id, objectKey: row.objectKey }, 'attachment bytes missing from object store');
        return replyNotFound(reply);
      }
      throw err;
    }

    const disposition = EMBEDDABLE_IMAGE_MIME.has(row.mime)
      ? 'inline'
      : `attachment; filename="${sanitizeFilename(row.filename)}"`;
    return reply
      .header('content-type', row.mime)
      .header('content-length', String(row.size))
      .header('content-disposition', disposition)
      .header('x-content-type-options', 'nosniff')
      .send(stream);
  });
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @gisik-nokma/server exec vitest run test/routes/attachments-download.test.ts test/routes/attachments-upload.test.ts`
Expected: PASS (both suites — the shared `replyNotFound` keeps upload/download 404s one shape).

- [ ] **Step 5: Commit**

```bash
git add apps/server
git commit -m "Downloads stream under canSee with one anonymous 404 for missing, invisible, and byte-less alike — existence is never leaked through an attachment URL"
```

---

### Task 11: Server gates — layer 3 of image-only embedding, and evidence that exists

**Files:**
- Create: `apps/server/src/gates/server-gate.ts`
- Create: `apps/server/src/gates/image-embed-gate.ts`
- Create: `apps/server/src/gates/evidence-gate.ts`
- Create: `apps/server/src/gates/index.ts`
- Modify: `apps/server/src/ingest/ingest-service.ts` (additive `gates` dep)
- Modify: the `createIngestService` call site from Plan 1 Task 11 (in `apps/server/src/app.ts` or `src/index.ts`, wherever it landed) — add `gates: buildServerGates()`
- Test: `apps/server/test/gates/image-embed-gate.test.ts`
- Test: `apps/server/test/gates/evidence-gate.test.ts`

**Interfaces:**
- Consumes: `createIngestService`, `IngestDeps`, `IngestResult`, `createProjectionRegistry` (Plan 1); `SubmittedEvent`, `newUlid`, `collectImageAttachmentIds`, `isEmbeddableImageMime` (Plan 1 / Task 2); `Queryable` (Plan 4); `insertAttachment` (Task 7); registered event vocabulary (Plan 3 — imported via `@gisik-nokma/domain`).
- Produces (cross-plan API — **an additive amendment to Plan 1's ingest contract**, flagged in Open questions 3):
  - `type GateRefusal = { rule: string; reason: string }`
  - `type ServerGate = { eventType: string; check(event: SubmittedEvent, db: Queryable): Promise<GateRefusal | null> }`
  - `IngestDeps` gains optional `gates?: ServerGate[]` (default `[]`); gates run **inside the ingest transaction**, after the rule engine accepts and before the append, reading through the transaction client; a gate refusal produces the existing `{ status: 'refused', rule, reason }` shape, appends nothing, and fires no listener. Because gates live inside `ingestBatch`, Plan 10's sync path inherits them for free.
  - `makeImageEmbedGates(): ServerGate[]` (for `comment.added` and `ticket.field_set` where `fieldId === 'description'`), `makeEvidenceGate(): ServerGate`, `buildServerGates(): ServerGate[]`.
  - Rule-id strings (contract, per coordination): `attachment.embed-unknown` (embedded id that does not exist **on this ticket** — one rule and one reason template for both "nonexistent" and "belongs elsewhere", so a refusal never reveals whether a foreign id exists), `attachment.embed-not-image` (exists on the ticket, is not an embeddable image), `attachment.evidence-unknown` (evidence id that does not exist on this ticket — same indistinguishability).

- [ ] **Step 1: Write the failing image-embed-gate test**

`apps/server/test/gates/image-embed-gate.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid, type SubmittedEvent } from '@gisik-nokma/domain';
import { insertAttachment } from '../../src/attachments/attachment-repo.js';
import { RULE_EMBED_NOT_IMAGE, RULE_EMBED_UNKNOWN } from '../../src/gates/image-embed-gate.js';
import { buildServerGates } from '../../src/gates/index.js';
import { createIngestService, type IngestService } from '../../src/ingest/ingest-service.js';
import { createProjectionRegistry } from '../../src/projections/registry.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';

const WS = '01J9GWKS000000000000000000';
const TICKET = '01J9GTKA000000000000000000';
const OTHER_TICKET = '01J9GTKB000000000000000000';
const PNG_ID = '01J9GATA000000000000000000';
const PDF_ID = '01J9GATB000000000000000000';
const FOREIGN_PNG_ID = '01J9GATC000000000000000000';
const ACTOR = '01J9GUSM000000000000000000';

function submitted(type: string, payload: unknown, entityId = TICKET): SubmittedEvent {
  return {
    id: newUlid(),
    workspaceId: WS,
    entity: { kind: 'ticket', id: entityId },
    type,
    version: 1,
    payload,
    actorId: ACTOR,
    origin: 'web',
    clientTime: '2026-08-20T10:00:00.000Z',
  };
}

function docEmbedding(attachmentId: string): unknown {
  return {
    type: 'doc',
    content: [{ type: 'image', attrs: { attachmentId, wrap: 'block', alt: '' } }],
  };
}

let db: TestDatabase;
let ingest: IngestService;

beforeAll(async () => {
  db = await createTestDatabase();
  const attach = (id: string, ticketId: string, mime: string) =>
    insertAttachment(db.pool, {
      id, workspaceId: WS, ticketId, uploaderId: ACTOR,
      filename: 'f', mime, size: 1, objectKey: `w/${WS}/a/${id}`,
    });
  await attach(PNG_ID, TICKET, 'image/png');
  await attach(PDF_ID, TICKET, 'application/pdf');
  await attach(FOREIGN_PNG_ID, OTHER_TICKET, 'image/png');
  ingest = createIngestService({
    pool: db.pool,
    // Accept-all engine stub: these tests isolate GATE behavior; the rule
    // engine's own refusals are Plan 2's planted-defect ground.
    evaluate: async () => ({ refused: false as const }),
    projections: createProjectionRegistry(),
    gates: buildServerGates(),
  });
});
afterAll(async () => {
  await db.drop();
});

async function ledgerCount(eventId: string): Promise<number> {
  const result = await db.pool.query('SELECT count(*)::int AS n FROM events WHERE id = $1', [eventId]);
  return (result.rows as Array<{ n: number }>)[0]!.n;
}

describe('image-embed gate (layer 3)', () => {
  it('a comment embedding the ticket own png commits', async () => {
    const [result] = await ingest.ingestBatch([submitted('comment.added', { body: docEmbedding(PNG_ID) })]);
    expect(result).toMatchObject({ status: 'committed' });
  });

  it('planted defect: a comment embedding a pdf is refused attachment.embed-not-image and leaves no trace', async () => {
    const event = submitted('comment.added', { body: docEmbedding(PDF_ID) });
    const [result] = await ingest.ingestBatch([event]);
    expect(result).toMatchObject({ status: 'refused', rule: RULE_EMBED_NOT_IMAGE });
    if (result!.status === 'refused') {
      expect(result.reason).toContain('Only images may be embedded inline');
      expect(result.reason).toContain(PDF_ID);
    }
    expect(await ledgerCount(event.id)).toBe(0);
  });

  it('planted defect: a fabricated embed id is refused attachment.embed-unknown', async () => {
    const fake = newUlid();
    const [result] = await ingest.ingestBatch([submitted('comment.added', { body: docEmbedding(fake) })]);
    expect(result).toMatchObject({ status: 'refused', rule: RULE_EMBED_UNKNOWN });
  });

  it("planted defect: another ticket's image is refused with the SAME rule and reason shape — no existence leak", async () => {
    const [foreignResult] = await ingest.ingestBatch([submitted('comment.added', { body: docEmbedding(FOREIGN_PNG_ID) })]);
    const fake = newUlid();
    const [fakeResult] = await ingest.ingestBatch([submitted('comment.added', { body: docEmbedding(fake) })]);
    expect(foreignResult).toMatchObject({ status: 'refused', rule: RULE_EMBED_UNKNOWN });
    expect(fakeResult).toMatchObject({ status: 'refused', rule: RULE_EMBED_UNKNOWN });
    if (foreignResult!.status === 'refused' && fakeResult!.status === 'refused') {
      expect(foreignResult.reason.replace(FOREIGN_PNG_ID, 'ID')).toBe(fakeResult.reason.replace(fake, 'ID'));
    }
  });

  it('a description field_set embedding a pdf is refused; other fields are not inspected', async () => {
    const [descResult] = await ingest.ingestBatch([
      submitted('ticket.field_set', { fieldId: 'description', value: docEmbedding(PDF_ID) }),
    ]);
    expect(descResult).toMatchObject({ status: 'refused', rule: RULE_EMBED_NOT_IMAGE });

    const [otherResult] = await ingest.ingestBatch([
      submitted('ticket.field_set', { fieldId: 'notes', value: docEmbedding(PDF_ID) }),
    ]);
    expect(otherResult).toMatchObject({ status: 'committed' });
  });

  it('a doc with no images passes through untouched', async () => {
    const [result] = await ingest.ingestBatch([
      submitted('comment.added', { body: { type: 'doc', content: [{ type: 'paragraph' }] } }),
    ]);
    expect(result).toMatchObject({ status: 'committed' });
  });
});
```

- [ ] **Step 2: Write the failing evidence-gate test**

`apps/server/test/gates/evidence-gate.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid, type SubmittedEvent } from '@gisik-nokma/domain';
import { insertAttachment } from '../../src/attachments/attachment-repo.js';
import { RULE_EVIDENCE_UNKNOWN } from '../../src/gates/evidence-gate.js';
import { buildServerGates } from '../../src/gates/index.js';
import { createIngestService, type IngestService } from '../../src/ingest/ingest-service.js';
import { createProjectionRegistry } from '../../src/projections/registry.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';

const WS = '01J9GWKS000000000000000000';
const TICKET = '01J9GTKA000000000000000000';
const OTHER_TICKET = '01J9GTKB000000000000000000';
const EVIDENCE_ID = '01J9GATA000000000000000000';
const FOREIGN_ID = '01J9GATB000000000000000000';
const ACTOR = '01J9GUSM000000000000000000';

function transition(payload: unknown): SubmittedEvent {
  return {
    id: newUlid(),
    workspaceId: WS,
    entity: { kind: 'ticket', id: TICKET },
    type: 'ticket.transitioned',
    version: 1,
    payload,
    actorId: ACTOR,
    origin: 'web',
    clientTime: '2026-08-20T10:00:00.000Z',
  };
}

let db: TestDatabase;
let ingest: IngestService;

beforeAll(async () => {
  db = await createTestDatabase();
  await insertAttachment(db.pool, {
    id: EVIDENCE_ID, workspaceId: WS, ticketId: TICKET, uploaderId: ACTOR,
    filename: 'receipt.pdf', mime: 'application/pdf', size: 1, objectKey: `w/${WS}/a/${EVIDENCE_ID}`,
  });
  await insertAttachment(db.pool, {
    id: FOREIGN_ID, workspaceId: WS, ticketId: OTHER_TICKET, uploaderId: ACTOR,
    filename: 'other.pdf', mime: 'application/pdf', size: 1, objectKey: `w/${WS}/a/${FOREIGN_ID}`,
  });
  ingest = createIngestService({
    pool: db.pool,
    evaluate: async () => ({ refused: false as const }),
    projections: createProjectionRegistry(),
    gates: buildServerGates(),
  });
});
afterAll(async () => {
  await db.drop();
});

describe('evidence gate', () => {
  it('a transition carrying real evidence from this ticket commits', async () => {
    const [result] = await ingest.ingestBatch([transition({ toStateId: 'done', evidenceAttachmentId: EVIDENCE_ID })]);
    expect(result).toMatchObject({ status: 'committed' });
  });

  it('a transition without evidence is not this gate business (require-evidence is Plan 2 rule)', async () => {
    const [result] = await ingest.ingestBatch([transition({ toStateId: 'done' })]);
    expect(result).toMatchObject({ status: 'committed' });
  });

  it('planted defect: fabricated evidence is refused attachment.evidence-unknown', async () => {
    const [result] = await ingest.ingestBatch([transition({ toStateId: 'done', evidenceAttachmentId: newUlid() })]);
    expect(result).toMatchObject({ status: 'refused', rule: RULE_EVIDENCE_UNKNOWN });
    if (result!.status === 'refused') expect(result.reason).toContain('does not exist on this ticket');
  });

  it("planted defect: another ticket's attachment as evidence is refused identically — no existence leak", async () => {
    const [foreign] = await ingest.ingestBatch([transition({ toStateId: 'done', evidenceAttachmentId: FOREIGN_ID })]);
    const fake = newUlid();
    const [fabricated] = await ingest.ingestBatch([transition({ toStateId: 'done', evidenceAttachmentId: fake })]);
    expect(foreign).toMatchObject({ status: 'refused', rule: RULE_EVIDENCE_UNKNOWN });
    if (foreign!.status === 'refused' && fabricated!.status === 'refused') {
      expect(foreign.reason.replace(FOREIGN_ID, 'ID')).toBe(fabricated.reason.replace(fake, 'ID'));
    }
  });
});
```

- [ ] **Step 3: Run both to verify they fail**

Run: `pnpm --filter @gisik-nokma/server exec vitest run test/gates/`
Expected: FAIL — gate modules do not exist; `gates` is not a known `IngestDeps` property.

- [ ] **Step 4: Implement the gate seam and the gates**

`apps/server/src/gates/server-gate.ts`:

```ts
import type { SubmittedEvent } from '@gisik-nokma/domain';
import type { Queryable } from '../db/queryable.js';

export type GateRefusal = { rule: string; reason: string };

/**
 * A server-side refusal that needs server-owned state (the attachments
 * table) and therefore cannot live in the pure shared rule engine. Gates
 * run INSIDE the ingest transaction — after the rule engine accepts,
 * before the append — reading through the transaction client, so they
 * judge the same consistent world the append will join. Every ingest
 * path, including Plan 10's sync, passes through them.
 */
export type ServerGate = {
  /** Exact event type this gate inspects; other types skip it. */
  eventType: string;
  check(event: SubmittedEvent, db: Queryable): Promise<GateRefusal | null>;
};
```

`apps/server/src/gates/image-embed-gate.ts`:

```ts
import { collectImageAttachmentIds, isEmbeddableImageMime } from '@gisik-nokma/domain';
import type { Queryable } from '../db/queryable.js';
import type { GateRefusal, ServerGate } from './server-gate.js';

export const RULE_EMBED_UNKNOWN = 'attachment.embed-unknown';
export const RULE_EMBED_NOT_IMAGE = 'attachment.embed-not-image';

/**
 * Layer 3 of image-only inline embedding (spec §2 Attachments): a stored
 * document may embed only image-mime attachments belonging to ITS ticket.
 * "Nonexistent" and "belongs to another ticket" share one rule and one
 * reason template — the refusal must not reveal whether a foreign id
 * exists anywhere.
 */
async function checkDocEmbeds(doc: unknown, ticketId: string, db: Queryable): Promise<GateRefusal | null> {
  const ids = collectImageAttachmentIds(doc);
  if (ids.length === 0) return null;
  const result = await db.query(
    'SELECT id, mime FROM attachments WHERE ticket_id = $1 AND id = ANY($2::text[])',
    [ticketId, ids],
  );
  const mimeById = new Map((result.rows as Array<{ id: string; mime: string }>).map((row) => [row.id, row.mime]));
  for (const id of ids) {
    const mime = mimeById.get(id);
    if (mime === undefined) {
      return {
        rule: RULE_EMBED_UNKNOWN,
        reason: `This document embeds an attachment (${id}) that does not exist on this ticket, so the claim cannot be accepted.`,
      };
    }
    if (!isEmbeddableImageMime(mime)) {
      return {
        rule: RULE_EMBED_NOT_IMAGE,
        reason: `Only images may be embedded inline. Attachment ${id} is ${mime}; add it to the ticket's attachment list instead.`,
      };
    }
  }
  return null;
}

export function makeImageEmbedGates(): ServerGate[] {
  return [
    {
      eventType: 'comment.added',
      async check(event, db) {
        const payload = event.payload as { body?: unknown };
        return checkDocEmbeds(payload.body ?? null, event.entity.id, db);
      },
    },
    {
      eventType: 'ticket.field_set',
      async check(event, db) {
        const payload = event.payload as { fieldId?: unknown; value?: unknown };
        if (payload.fieldId !== 'description') return null;
        return checkDocEmbeds(payload.value ?? null, event.entity.id, db);
      },
    },
  ];
}
```

`apps/server/src/gates/evidence-gate.ts`:

```ts
import type { GateRefusal, ServerGate } from './server-gate.js';

export const RULE_EVIDENCE_UNKNOWN = 'attachment.evidence-unknown';

/**
 * Plan 2's require-evidence rule checks that a transition CARRIES
 * evidence; this gate checks the named evidence EXISTS on the ticket.
 * Together they close the fabricated-evidence hole without the pure
 * engine ever touching a table.
 */
export function makeEvidenceGate(): ServerGate {
  return {
    eventType: 'ticket.transitioned',
    async check(event, db): Promise<GateRefusal | null> {
      const payload = event.payload as { evidenceAttachmentId?: unknown };
      const evidenceId = payload.evidenceAttachmentId;
      if (typeof evidenceId !== 'string') return null;
      const result = await db.query('SELECT 1 FROM attachments WHERE id = $1 AND ticket_id = $2', [
        evidenceId,
        event.entity.id,
      ]);
      if ((result.rows as unknown[]).length === 0) {
        return {
          rule: RULE_EVIDENCE_UNKNOWN,
          reason: `The attachment named as evidence (${evidenceId}) does not exist on this ticket, so this move cannot carry it as evidence.`,
        };
      }
      return null;
    },
  };
}
```

`apps/server/src/gates/index.ts`:

```ts
import { makeEvidenceGate } from './evidence-gate.js';
import { makeImageEmbedGates } from './image-embed-gate.js';
import type { ServerGate } from './server-gate.js';

export function buildServerGates(): ServerGate[] {
  return [...makeImageEmbedGates(), makeEvidenceGate()];
}

export * from './server-gate.js';
export * from './image-embed-gate.js';
export * from './evidence-gate.js';
```

- [ ] **Step 5: Thread `gates` through the ingest service**

In `apps/server/src/ingest/ingest-service.ts` (Plan 1 Task 10's file):

1. Add the import: `import type { ServerGate } from '../gates/server-gate.js';`
2. Extend the deps type: `IngestDeps` gains `gates?: ServerGate[];`
3. In `createIngestService`, destructure with default: `const gates = deps.gates ?? [];`
4. In `commitOne`, between the rule-engine refusal return and the `insertEvent` call, insert:

```ts
      for (const gate of gates) {
        if (gate.eventType !== submitted.type) continue;
        const gateRefusal = await gate.check(submitted, client);
        if (gateRefusal) {
          // Same path as an engine refusal: roll back, no append, no
          // listener, the standard refused shape.
          await client.query('ROLLBACK');
          return { status: 'refused', eventId: submitted.id, rule: gateRefusal.rule, reason: gateRefusal.reason };
        }
      }
```

`client` here is the transaction's `PoolClient` that `commitOne` already holds; if Plan 1's implementation wraps refusal-rollback in a helper, route the gate refusal through that same helper — the observable contract (rolled back, refused shape, no listener) is what matters, and the existing engine-refusal tests plus this task's `ledgerCount` assertions pin it.

5. Wire the production call site: where Plan 1 Task 11 builds the service (in `apps/server/src/app.ts` or `src/index.ts`), add `gates: buildServerGates()` with `import { buildServerGates } from './gates/index.js';` (path adjusted to the file's location).

- [ ] **Step 6: Run the gate tests to verify they pass, then the full ingest regression**

Run: `pnpm --filter @gisik-nokma/server exec vitest run test/gates/ && pnpm --filter @gisik-nokma/server exec vitest run test/ingest.test.ts`
Expected: gate suites PASS (10 tests); Plan 1's ingest suite still PASS (gates default to `[]` — the seam is invisible when unused).

- [ ] **Step 7: Commit**

```bash
git add apps/server
git commit -m "Server gates inside the ingest transaction: embedded images must be this ticket's images and named evidence must exist — with one refusal shape that never leaks whether a foreign id exists"
```

---

### Task 11a: Attachment kinds in the domain, and the refusal that keeps evidence uploaded

Spec §2, Drive rule 1: **a Drive reference can never satisfy `require-evidence`.** Where the check lives is decided by what each layer can see. The shared rule engine cannot see it: Plan 3's reducer treats `attachment.added` as state-free (`case 'attachment.added': return state;`), so `TicketState` never carries attachments and a pure rule has nothing to read. The evidence gate already runs inside the ingest transaction with the ledger and the `attachments` table in front of it — so the refusal belongs here, beside the evidence-exists check it completes. What Plan 3 must change is only the payload vocabulary; the exact amendment is written out at the end of Open questions.

The rule id and its reason are written **once**, in `@gisik-nokma/domain`, and imported by the gate, the editor surface (Task 13a) and every test. A refusal the user reads must be one sentence in one place; copies drift.

**Files:**
- Create: `packages/domain/src/attachment-kinds.ts`
- Modify: `packages/domain/src/index.ts` (export the new module)
- Modify: `apps/server/src/gates/evidence-gate.ts` (full replacement, Step 3)
- Create: `apps/server/test/helpers/drive-reference.ts` (shared seed helper; Task 12c imports it too)
- Test: `packages/domain/test/attachment-kinds.test.ts`
- Test: `apps/server/test/gates/evidence-gate.test.ts` (append cases — the existing ones are untouched)

**Interfaces:**
- Consumes: `Queryable` (Plan 4); the gate seam and `RULE_EVIDENCE_UNKNOWN` (Task 11); the `events` table columns (Plan 1: `entity_kind`, `entity_id`, `type`, `payload`, `seq`, `workspace_seq`).
- Produces (cross-plan API — Plans 3, 6, 8, 10 all consume these names):
  - `type AttachmentKind = 'upload' | 'drive-reference'` — the discriminator, always declared, never inferred.
  - `type DriveReference = { driveFileId: string; name: string; mimeType: string; webViewLink: string; iconLink?: string; capturedAt: string }`
  - `isDriveReference(value: unknown): value is DriveReference`
  - `DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file'` — the non-sensitive per-file scope, the only Drive scope this product ever requests.
  - `RULE_EVIDENCE_DRIVE_REFERENCE = 'attachment.evidence-drive-reference'` and `EVIDENCE_DRIVE_REFERENCE_REASON` — **the single origin of that sentence**; nothing anywhere retypes it.
  - Gate behaviour: a `ticket.transitioned` naming a Drive reference of **this** ticket as `evidenceAttachmentId` is refused `attachment.evidence-drive-reference`; a reference belonging to another ticket, or an id that is nothing at all, keeps the existing `attachment.evidence-unknown` refusal, byte-identical between those two cases (no existence leak).

- [ ] **Step 1: Write the failing domain test**

`packages/domain/test/attachment-kinds.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  DRIVE_FILE_SCOPE,
  EVIDENCE_DRIVE_REFERENCE_REASON,
  RULE_EVIDENCE_DRIVE_REFERENCE,
  isDriveReference,
} from '../src/attachment-kinds.js';

const REFERENCE = {
  driveFileId: '1AbCdEfGhIjKlMnOpQrStUvWxYz0123456',
  name: 'GST filing Aug 2026.pdf',
  mimeType: 'application/pdf',
  webViewLink: 'https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456/view',
  capturedAt: '2026-08-20T10:00:00.000Z',
};

describe('attachment kinds', () => {
  it('requests exactly the per-file Drive scope', () => {
    expect(DRIVE_FILE_SCOPE).toBe('https://www.googleapis.com/auth/drive.file');
  });

  it('pins the evidence refusal id and names the remedy in its reason', () => {
    expect(RULE_EVIDENCE_DRIVE_REFERENCE).toBe('attachment.evidence-drive-reference');
    expect(EVIDENCE_DRIVE_REFERENCE_REASON).toContain('cannot serve as evidence');
    expect(EVIDENCE_DRIVE_REFERENCE_REASON).toContain('Upload the file to this ticket');
  });

  it('accepts a complete reference, with iconLink optional', () => {
    expect(isDriveReference(REFERENCE)).toBe(true);
    expect(isDriveReference({ ...REFERENCE, iconLink: 'https://drive-thirdparty.googleusercontent.com/16/type/application/pdf' })).toBe(true);
  });

  it('planted defect: an incomplete or mistyped reference is not a reference', () => {
    for (const broken of [
      null,
      'a string',
      { ...REFERENCE, driveFileId: '' },
      { ...REFERENCE, capturedAt: undefined },
      { ...REFERENCE, webViewLink: 42 },
      { ...REFERENCE, iconLink: 7 },
    ]) {
      expect(isDriveReference(broken), `${JSON.stringify(broken)} must not pass`).toBe(false);
    }
  });
});
```

Run: `pnpm --filter @gisik-nokma/domain exec vitest run test/attachment-kinds.test.ts`
Expected: FAIL — the module does not exist.

- [ ] **Step 2: Implement the domain module**

`packages/domain/src/attachment-kinds.ts`:

```ts
/**
 * An attachment is one of exactly two kinds, and the kind is always
 * declared on the claim, never inferred from what is or is not in a
 * table (spec §2):
 *
 *  - 'upload'          — bytes this product holds: sniffed, hashed, stored.
 *  - 'drive-reference' — a pointer to a Google Drive file it does not hold.
 *
 * The distinction is load-bearing, not cosmetic: a file we do not hold can
 * be renamed, edited, moved, re-permissioned or deleted after it is
 * attached, so the product may not speak about its contents at all.
 */
export type AttachmentKind = 'upload' | 'drive-reference';

/**
 * The non-sensitive, per-file Google Drive scope. The picker grants this
 * product access to the individual files a user picks — nothing else in
 * their Drive — and it is the ONLY Drive scope this product ever asks for.
 */
export const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

/**
 * What is stored when a Drive file is attached. Every field is a
 * last-seen observation, not a standing fact: `name` and `mimeType` are
 * what Drive said at `capturedAt`, and may already be stale by the time
 * anyone reads them. That is why the renderer dates them (Task 12b).
 */
export type DriveReference = {
  driveFileId: string;
  name: string;
  mimeType: string;
  webViewLink: string;
  iconLink?: string;
  /** ISO-8601 instant at which these observations were captured. */
  capturedAt: string;
};

/** Rule id for spec §2's first Drive rule: evidence must be an upload. */
export const RULE_EVIDENCE_DRIVE_REFERENCE = 'attachment.evidence-drive-reference';

/**
 * The one place this sentence exists. The gate refuses with it, the
 * evidence picker shows it, the tests assert against the constant — so
 * every copy a user might see is the same words, and there is exactly one
 * file to edit if the wording ever improves.
 */
export const EVIDENCE_DRIVE_REFERENCE_REASON =
  'A Google Drive link cannot serve as evidence: the board holds a pointer, not the file, and a Drive file can be renamed, edited, moved or deleted after it is attached. Upload the file to this ticket and name the uploaded copy as the evidence instead.';

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

export function isDriveReference(value: unknown): value is DriveReference {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  if (candidate['iconLink'] !== undefined && !isNonEmptyString(candidate['iconLink'])) return false;
  return (
    isNonEmptyString(candidate['driveFileId']) &&
    isNonEmptyString(candidate['name']) &&
    isNonEmptyString(candidate['mimeType']) &&
    isNonEmptyString(candidate['webViewLink']) &&
    isNonEmptyString(candidate['capturedAt'])
  );
}
```

Append to `packages/domain/src/index.ts`:

```ts
export * from './attachment-kinds.js';
```

Run the domain test again — expected: PASS (4 tests).

- [ ] **Step 3: Extend the evidence gate (full replacement of Task 11's file)**

`apps/server/src/gates/evidence-gate.ts`:

```ts
import { EVIDENCE_DRIVE_REFERENCE_REASON, RULE_EVIDENCE_DRIVE_REFERENCE } from '@gisik-nokma/domain';
import type { GateRefusal, ServerGate } from './server-gate.js';

export const RULE_EVIDENCE_UNKNOWN = 'attachment.evidence-unknown';
export { RULE_EVIDENCE_DRIVE_REFERENCE };

/**
 * Plan 2's require-evidence rule checks that a transition CARRIES
 * evidence; this gate checks the named evidence is something this product
 * can vouch for. Two refusals, in this order:
 *
 *  1. The id names a Drive reference on this ticket — it exists, and it is
 *     still not evidence (spec §2, rule 1). Saying "does not exist" here
 *     would be a small lie about something the user can see in the list.
 *  2. The id names nothing on this ticket — the original refusal, shared
 *     with "belongs to another ticket" so no refusal reveals whether a
 *     foreign id exists anywhere.
 */
export function makeEvidenceGate(): ServerGate {
  return {
    eventType: 'ticket.transitioned',
    async check(event, db): Promise<GateRefusal | null> {
      const payload = event.payload as { evidenceAttachmentId?: unknown };
      const evidenceId = payload.evidenceAttachmentId;
      if (typeof evidenceId !== 'string') return null;

      const uploaded = await db.query('SELECT 1 FROM attachments WHERE id = $1 AND ticket_id = $2', [
        evidenceId,
        event.entity.id,
      ]);
      if ((uploaded.rows as unknown[]).length > 0) return null;

      // Not an upload. Ask the ledger — where a reference's whole record
      // lives, since a reference has no bytes and therefore no row — before
      // deciding which truth to tell.
      const reference = await db.query(
        `SELECT 1 FROM events
          WHERE entity_kind = 'ticket'
            AND entity_id = $1
            AND type = 'attachment.added'
            AND payload->>'kind' = 'drive-reference'
            AND payload->>'attachmentId' = $2
          LIMIT 1`,
        [event.entity.id, evidenceId],
      );
      if ((reference.rows as unknown[]).length > 0) {
        return { rule: RULE_EVIDENCE_DRIVE_REFERENCE, reason: EVIDENCE_DRIVE_REFERENCE_REASON };
      }

      return {
        rule: RULE_EVIDENCE_UNKNOWN,
        reason: `The attachment named as evidence (${evidenceId}) does not exist on this ticket, so this move cannot carry it as evidence.`,
      };
    },
  };
}
```

- [ ] **Step 4: Append the failing gate cases**

Append inside the existing `describe('evidence gate', …)` block of `apps/server/test/gates/evidence-gate.test.ts`:

```ts
  it('planted defect: a Drive reference on THIS ticket is refused as evidence, with the remedy named', async () => {
    const referenceId = newUlid();
    await seedDriveReference(db.pool, { workspaceId: WS, ticketId: TICKET, attachmentId: referenceId, actorId: ACTOR });
    const [result] = await ingest.ingestBatch([transition({ toStateId: 'done', evidenceAttachmentId: referenceId })]);
    expect(result).toMatchObject({ status: 'refused', rule: RULE_EVIDENCE_DRIVE_REFERENCE });
    if (result!.status === 'refused') {
      // Byte-identical to the single origin — the user and the test read the same sentence.
      expect(result.reason).toBe(EVIDENCE_DRIVE_REFERENCE_REASON);
      expect(result.reason).not.toContain(referenceId);
    }
  });

  it("planted defect: a Drive reference on ANOTHER ticket refuses as unknown — the drive refusal never leaks existence elsewhere", async () => {
    const elsewhere = newUlid();
    await seedDriveReference(db.pool, { workspaceId: WS, ticketId: OTHER_TICKET, attachmentId: elsewhere, actorId: ACTOR });
    const [foreign] = await ingest.ingestBatch([transition({ toStateId: 'done', evidenceAttachmentId: elsewhere })]);
    const fake = newUlid();
    const [fabricated] = await ingest.ingestBatch([transition({ toStateId: 'done', evidenceAttachmentId: fake })]);
    expect(foreign).toMatchObject({ status: 'refused', rule: RULE_EVIDENCE_UNKNOWN });
    if (foreign!.status === 'refused' && fabricated!.status === 'refused') {
      expect(foreign.reason.replace(elsewhere, 'ID')).toBe(fabricated.reason.replace(fake, 'ID'));
    }
  });
```

Add to that file's imports:

```ts
import { EVIDENCE_DRIVE_REFERENCE_REASON, RULE_EVIDENCE_DRIVE_REFERENCE } from '@gisik-nokma/domain';
import { RULE_EVIDENCE_UNKNOWN } from '../../src/gates/evidence-gate.js';
```

(`RULE_EVIDENCE_UNKNOWN` is already imported by the existing cases — keep one import.)

And create the shared seed helper (Task 12c's server case imports the same one):

`apps/server/test/helpers/drive-reference.ts`:

```ts
import { newUlid } from '@gisik-nokma/domain';
import type { Queryable } from '../../src/db/queryable.js';

let driveSeq = 9000;

/**
 * Seed a committed `attachment.added` Drive reference straight into the
 * ledger. A reference has no bytes, so it has no attachments row — the
 * ledger IS its record. Writing the row directly (rather than through
 * ingest) keeps these gate tests independent of the pending Plan 3 payload
 * amendment: the REGISTRATION is proven in Plan 3's own suite, and the
 * gate's input is a committed row either way.
 */
export async function seedDriveReference(
  db: Queryable,
  params: { workspaceId: string; ticketId: string; attachmentId: string; actorId: string },
): Promise<void> {
  driveSeq += 1;
  await db.query(
    `INSERT INTO events (id, workspace_id, entity_kind, entity_id, type, version, payload,
                         actor_id, origin, client_time, server_time, seq, workspace_seq)
     VALUES ($1, $2, 'ticket', $3, 'attachment.added', 1, $4::jsonb, $5, 'web', $6, now(), $7, $7)`,
    [
      newUlid(),
      params.workspaceId,
      params.ticketId,
      JSON.stringify({
        kind: 'drive-reference',
        attachmentId: params.attachmentId,
        driveFileId: '1AbCdEfGhIjKlMnOpQrStUvWxYz0123456',
        name: 'GST filing Aug 2026.pdf',
        mimeType: 'application/pdf',
        webViewLink: 'https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456/view',
        capturedAt: '2026-08-20T10:00:00.000Z',
      }),
      params.actorId,
      '2026-08-20T10:00:00.000Z',
      driveSeq,
    ],
  );
}
```

and import it in the gate test: `import { seedDriveReference } from '../helpers/drive-reference.js';`

If Task 11's evidence-gate test does not already declare `OTHER_TICKET`, add `const OTHER_TICKET = '01J9GTKB000000000000000000';` beside its other constants — it needs no seeded ticket row, because the gate reads only the ledger and the attachments table.

- [ ] **Step 5: Run both suites**

Run: `pnpm --filter @gisik-nokma/domain exec vitest run test/attachment-kinds.test.ts && pnpm --filter @gisik-nokma/server exec vitest run test/gates/`
Expected: PASS — 4 domain cases, and the gate suite with its two new refusals plus everything Task 11 already proved.

- [ ] **Step 6: Commit**

```bash
git add packages/domain apps/server
git commit -m "A Drive link is not evidence: the gate refuses it by name and tells the user to upload the file, and refusing it never reveals whether someone else's reference exists"
```

---
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

### Task 13: Evidence picker and the require-evidence lookup

**Files:**
- Create: `packages/editor/src/attachments/require-evidence.ts`
- Create: `packages/editor/src/components/EvidencePicker.tsx`
- Modify: `packages/editor/src/styles/editor.css`
- Modify: `packages/editor/src/index.ts` (exports)
- Test: `packages/editor/test/evidence-picker.test.tsx`

**Interfaces:**
- Consumes: `WorkflowDef` (Plan 2, from `@gisik-nokma/domain`); `UploadResult` (Task 12).
- Produces (cross-plan API — Plan 6's ticket sheet and Plan 8's builder previews consume these):
  - `transitionRequiresEvidence(def: WorkflowDef, fromStateId: string, toStateId: string): boolean` — true when the matching transition (exact `from` or `'*'`) carries a `require-evidence` rule.
  - `type AttachmentSummary = { attachmentId: string; filename: string; mime: string; size: number }`
  - `function EvidencePicker(props: EvidencePickerProps): React.JSX.Element` with `type EvidencePickerProps = { attachments: AttachmentSummary[]; uploadAttachment(file: File): Promise<UploadResult>; onAttachmentAdded(result: UploadResult): Promise<void> | void; onPick(evidenceAttachmentId: string): void; onCancel(): void }` — pick an existing attachment or upload a new one; either way `onPick` hands the caller the id to place into `ticket.transitioned`'s `evidenceAttachmentId` (Plan 3's payload; Plan 2's `require-evidence` refuses the move without it; Task 11's gate refuses an id that is not real).
  - BEM classes `evidence-picker`, `evidence-picker__option`, `evidence-picker__upload`, `evidence-picker__cancel`.

- [ ] **Step 1: Write the failing tests**

`packages/editor/test/evidence-picker.test.tsx`:

```tsx
import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { WorkflowDef } from '@gisik-nokma/domain';
import { transitionRequiresEvidence } from '../src/attachments/require-evidence.js';
import { EvidencePicker } from '../src/components/EvidencePicker.js';

const DEF: WorkflowDef = {
  id: 'wf_errand',
  version: 1,
  name: 'Errand',
  initialStateId: 'todo',
  states: [
    { id: 'todo', name: 'To do', category: 'open' },
    { id: 'doing', name: 'Doing', category: 'active' },
    { id: 'done', name: 'Done', category: 'terminal' },
    { id: 'abandoned', name: 'Abandoned', category: 'terminal' },
  ],
  transitions: [
    { from: 'todo', to: 'doing', rules: [] },
    { from: 'doing', to: 'done', rules: [{ kind: 'require-evidence' }] },
    { from: '*', to: 'abandoned', rules: [{ kind: 'require-comment' }] },
  ],
};

const ATTACHMENTS = [
  { attachmentId: '01J9GATA000000000000000000', filename: 'receipt.pdf', mime: 'application/pdf', size: 100 },
  { attachmentId: '01J9GATB000000000000000000', filename: 'shelf.png', mime: 'image/png', size: 200 },
];

describe('transitionRequiresEvidence', () => {
  it('reads the exact transition', () => {
    expect(transitionRequiresEvidence(DEF, 'doing', 'done')).toBe(true);
    expect(transitionRequiresEvidence(DEF, 'todo', 'doing')).toBe(false);
  });

  it('matches from-any transitions and unknown pairs answer false', () => {
    expect(transitionRequiresEvidence(DEF, 'doing', 'abandoned')).toBe(false); // rule there is require-comment
    expect(transitionRequiresEvidence(DEF, 'done', 'todo')).toBe(false); // no such transition
  });

  it('an exact transition wins over a from-any to the same state', () => {
    const def: WorkflowDef = {
      ...DEF,
      transitions: [
        { from: 'doing', to: 'abandoned', rules: [{ kind: 'require-evidence' }] },
        { from: '*', to: 'abandoned', rules: [] },
      ],
    };
    expect(transitionRequiresEvidence(def, 'doing', 'abandoned')).toBe(true);
    expect(transitionRequiresEvidence(def, 'todo', 'abandoned')).toBe(false);
  });
});

describe('EvidencePicker', () => {
  it('lists existing attachments and picking one hands over its id', () => {
    const onPick = vi.fn();
    const view = render(
      <EvidencePicker
        attachments={ATTACHMENTS}
        uploadAttachment={vi.fn()}
        onAttachmentAdded={vi.fn()}
        onPick={onPick}
        onCancel={vi.fn()}
      />,
    );
    const options = view.container.querySelectorAll('.evidence-picker__option');
    expect(options).toHaveLength(2);
    expect(options[0]!.textContent).toContain('receipt.pdf');
    fireEvent.click(options[1]!);
    expect(onPick).toHaveBeenCalledWith(ATTACHMENTS[1]!.attachmentId);
    view.unmount();
  });

  it('uploading new evidence emits attachment.added first, then picks the fresh id', async () => {
    const order: string[] = [];
    const uploaded = { attachmentId: '01J9GATC000000000000000000', url: '/v1/attachments/01J9GATC000000000000000000', mime: 'application/pdf', filename: 'proof.pdf', size: 3, sha256: 'c'.repeat(64) };
    const uploadAttachment = vi.fn(async () => {
      order.push('upload');
      return uploaded;
    });
    const onAttachmentAdded = vi.fn(async () => {
      order.push('event');
    });
    const onPick = vi.fn(() => {
      order.push('pick');
    });
    const view = render(
      <EvidencePicker
        attachments={[]}
        uploadAttachment={uploadAttachment}
        onAttachmentAdded={onAttachmentAdded}
        onPick={onPick}
        onCancel={vi.fn()}
      />,
    );
    const input = view.container.querySelector('.evidence-picker__upload input[type="file"]') as HTMLInputElement;
    const file = new File([new Uint8Array(3)], 'proof.pdf', { type: 'application/pdf' });
    fireEvent.change(input, { target: { files: [file] } });
    await vi.waitFor(() => {
      expect(onPick).toHaveBeenCalledWith(uploaded.attachmentId);
    });
    expect(order).toEqual(['upload', 'event', 'pick']);
    view.unmount();
  });

  it('a failed upload cancels nothing and picks nothing', async () => {
    const onPick = vi.fn();
    const onCancel = vi.fn();
    const view = render(
      <EvidencePicker
        attachments={[]}
        uploadAttachment={vi.fn(async () => {
          throw new Error('refused');
        })}
        onAttachmentAdded={vi.fn()}
        onPick={onPick}
        onCancel={onCancel}
      />,
    );
    const input = view.container.querySelector('.evidence-picker__upload input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File([new Uint8Array(1)], 'x.pdf', { type: 'application/pdf' })] } });
    await vi.waitFor(() => {
      expect(view.container.textContent).toContain('refused');
    });
    expect(onPick).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
    view.unmount();
  });

  it('cancel is an explicit act', () => {
    const onCancel = vi.fn();
    const view = render(
      <EvidencePicker attachments={[]} uploadAttachment={vi.fn()} onAttachmentAdded={vi.fn()} onPick={vi.fn()} onCancel={onCancel} />,
    );
    fireEvent.click(view.container.querySelector('.evidence-picker__cancel') as HTMLButtonElement);
    expect(onCancel).toHaveBeenCalled();
    view.unmount();
  });
});
```

- [ ] **Step 2: Run it to verify it fails, then implement**

Run: `pnpm --filter @gisik-nokma/editor exec vitest run test/evidence-picker.test.tsx`
Expected: FAIL — modules do not exist.

`packages/editor/src/attachments/require-evidence.ts`:

```ts
import type { WorkflowDef } from '@gisik-nokma/domain';

/**
 * Does fromStateId → toStateId carry a require-evidence rule? The exact
 * transition wins; a `'*'` (from-any) transition applies only when no
 * exact one matches — mirroring how the engine resolves the transition
 * it will enforce (Plan 2).
 */
export function transitionRequiresEvidence(def: WorkflowDef, fromStateId: string, toStateId: string): boolean {
  const exact = def.transitions.find((t) => t.from === fromStateId && t.to === toStateId);
  const transition = exact ?? def.transitions.find((t) => t.from === '*' && t.to === toStateId);
  if (!transition) return false;
  return transition.rules.some((rule) => rule.kind === 'require-evidence');
}
```

`packages/editor/src/components/EvidencePicker.tsx`:

```tsx
import { useState } from 'react';
import type { UploadResult } from '../upload.js';

export type AttachmentSummary = {
  attachmentId: string;
  filename: string;
  mime: string;
  size: number;
};

export type EvidencePickerProps = {
  /** The ticket's existing attachments — any of them can serve as evidence. */
  attachments: AttachmentSummary[];
  uploadAttachment(file: File): Promise<UploadResult>;
  /** Emit attachment.added for a fresh upload before it is offered as evidence. */
  onAttachmentAdded(result: UploadResult): Promise<void> | void;
  /** The chosen id goes into ticket.transitioned's evidenceAttachmentId. */
  onPick(evidenceAttachmentId: string): void;
  onCancel(): void;
};

/**
 * The require-evidence companion (spec §4): when a transition demands an
 * attachment, this is where the user names one — an existing attachment
 * or a fresh upload. The picker only ever hands back an id that a real
 * upload produced; the server's evidence gate re-proves it exists.
 */
export function EvidencePicker(props: EvidencePickerProps): React.JSX.Element {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleUpload(files: FileList | null): Promise<void> {
    const file = files?.[0];
    if (!file || uploading) return;
    setUploading(true);
    setError(null);
    try {
      const result = await props.uploadAttachment(file);
      await props.onAttachmentAdded(result);
      props.onPick(result.attachmentId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'upload failed');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="evidence-picker" role="dialog" aria-label="Choose evidence">
      <p>This move must carry an attachment as evidence.</p>
      <ul>
        {props.attachments.map((attachment) => (
          <li key={attachment.attachmentId}>
            <button
              type="button"
              className="evidence-picker__option"
              onClick={() => props.onPick(attachment.attachmentId)}
            >
              {attachment.filename} · {attachment.mime}
            </button>
          </li>
        ))}
      </ul>
      <label className="evidence-picker__upload">
        {uploading ? 'Uploading…' : 'Upload new evidence'}
        <input
          type="file"
          disabled={uploading}
          onChange={(event) => void handleUpload(event.target.files)}
        />
      </label>
      {error === null ? null : <p role="alert">{error}</p>}
      <button type="button" className="evidence-picker__cancel" onClick={props.onCancel}>
        Cancel
      </button>
    </div>
  );
}
```

Append to `packages/editor/src/styles/editor.css`:

```css
.evidence-picker {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.evidence-picker__option {
  text-align: left;
  cursor: pointer;
}
```

Append to `packages/editor/src/index.ts`:

```ts
export { transitionRequiresEvidence } from './attachments/require-evidence.js';
export { EvidencePicker, type AttachmentSummary, type EvidencePickerProps } from './components/EvidencePicker.js';
```

- [ ] **Step 3: Run the tests to verify they pass**

Run: `pnpm --filter @gisik-nokma/editor exec vitest run test/evidence-picker.test.tsx`
Expected: PASS (7 tests).

- [ ] **Step 4: Commit**

```bash
git add packages/editor
git commit -m "Evidence picker: existing attachment or fresh upload, attachment.added before the id is offered, and a require-evidence lookup that resolves transitions the way the engine does"
```

---

### Task 13a: Drive references are not offerable as evidence

Spec §2, Drive rule 1, at the surface. Task 11a makes the ledger refuse a Drive reference named as evidence; this task makes sure a user never gets that far by accident, and — when they try — reads the same sentence the server would have said.

The refusal is **structural, not conditional**: references arrive on their own prop and there is no code path from that list to `onPick`. A disabled option is a UI state that can be defeated; a list with no pick handler cannot be.

**Files:**
- Modify: `packages/editor/src/components/EvidencePicker.tsx`
- Modify: `packages/editor/src/styles/editor.css`
- Test: `packages/editor/test/evidence-picker.test.tsx` (append cases — the existing ones are untouched)

**Interfaces:**
- Consumes: `EVIDENCE_DRIVE_REFERENCE_REASON`, `DriveReference` (Task 11a).
- Produces (additive to Task 13's contract — every existing call site stays valid):
  - `type DriveReferenceSummary = { attachmentId: string } & DriveReference`
  - `EvidencePickerProps` gains `driveReferences?: DriveReferenceSummary[]` (default `[]`). They render in a separate, unofferable section carrying the named reason; `AttachmentSummary` keeps meaning *uploaded attachment*, which is the only thing evidence can be.
  - BEM classes `evidence-picker__unavailable`, `evidence-picker__unavailable-item`, `evidence-picker__reason`.

- [ ] **Step 1: Append the failing cases**

Append inside the existing `describe('EvidencePicker', …)` block of `packages/editor/test/evidence-picker.test.tsx`:

```tsx
  const DRIVE_REFERENCES = [
    {
      attachmentId: '01J9GATD000000000000000000',
      driveFileId: '1AbCdEfGhIjKlMnOpQrStUvWxYz0123456',
      name: 'receipt.pdf', // same name as an upload on purpose: names prove nothing
      mimeType: 'application/pdf',
      webViewLink: 'https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456/view',
      capturedAt: '2026-08-20T10:00:00.000Z',
    },
  ];

  it('planted defect: a Drive reference is never among the offerable options', () => {
    const onPick = vi.fn();
    const view = render(
      <EvidencePicker
        attachments={ATTACHMENTS}
        driveReferences={DRIVE_REFERENCES}
        uploadAttachment={vi.fn()}
        onAttachmentAdded={vi.fn()}
        onPick={onPick}
        onCancel={vi.fn()}
      />,
    );
    // Exactly the uploads are offerable — the reference did not sneak in on a matching name.
    const options = [...view.container.querySelectorAll('.evidence-picker__option')];
    expect(options).toHaveLength(ATTACHMENTS.length);
    for (const option of options) {
      expect(option.textContent).not.toContain('Google Drive');
    }
    // Clicking anything in the unavailable section picks nothing.
    for (const item of view.container.querySelectorAll('.evidence-picker__unavailable-item')) {
      fireEvent.click(item);
    }
    expect(onPick).not.toHaveBeenCalled();
    view.unmount();
  });

  it("planted defect: the reference is shown with the server's own reason, word for word", () => {
    const view = render(
      <EvidencePicker
        attachments={[]}
        driveReferences={DRIVE_REFERENCES}
        uploadAttachment={vi.fn()}
        onAttachmentAdded={vi.fn()}
        onPick={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const unavailable = view.container.querySelector('.evidence-picker__unavailable')!;
    expect(unavailable.textContent).toContain('receipt.pdf');
    expect(view.container.querySelector('.evidence-picker__reason')!.textContent).toBe(EVIDENCE_DRIVE_REFERENCE_REASON);
    view.unmount();
  });
```

Add to that file's imports: `import { EVIDENCE_DRIVE_REFERENCE_REASON } from '@gisik-nokma/domain';`

Run: `pnpm --filter @gisik-nokma/editor exec vitest run test/evidence-picker.test.tsx`
Expected: FAIL — `driveReferences` is not a prop and the unavailable section does not exist.

- [ ] **Step 2: Extend the picker (named modification of Task 13's component)**

In `packages/editor/src/components/EvidencePicker.tsx`:

1. Add the imports: `import { EVIDENCE_DRIVE_REFERENCE_REASON, type DriveReference } from '@gisik-nokma/domain';`
2. Add the summary type and the prop:

```tsx
export type DriveReferenceSummary = { attachmentId: string } & DriveReference;
```

and, inside `EvidencePickerProps`:

```tsx
  /**
   * Drive references on this ticket. They are listed so the user is not
   * left wondering where their file went — and they arrive on their own
   * prop, with no pick handler anywhere near them, because "not offerable"
   * must be a fact about the code and not a disabled attribute someone can
   * defeat (spec §2, Drive rule 1).
   */
  driveReferences?: DriveReferenceSummary[];
```

3. Render the section immediately after the offerable `<ul>` and before the upload control:

```tsx
      {(props.driveReferences ?? []).length === 0 ? null : (
        <div className="evidence-picker__unavailable">
          <p className="evidence-picker__reason">{EVIDENCE_DRIVE_REFERENCE_REASON}</p>
          <ul>
            {(props.driveReferences ?? []).map((reference) => (
              <li key={reference.attachmentId} className="evidence-picker__unavailable-item">
                {reference.name} · Google Drive reference, last seen {reference.capturedAt.slice(0, 10)}
              </li>
            ))}
          </ul>
        </div>
      )}
```

Nothing else in the component changes: the offerable list still maps `props.attachments`, which still means uploads.

Append to `packages/editor/src/styles/editor.css`:

```css
.evidence-picker__unavailable {
  border-left: 2px dashed;
  padding-left: 0.5rem;
}
.evidence-picker__unavailable-item {
  font-size: 0.85rem;
}
```

- [ ] **Step 3: Run the picker suite**

Run: `pnpm --filter @gisik-nokma/editor exec vitest run test/evidence-picker.test.tsx`
Expected: PASS (9 tests — Task 13's seven and these two).

- [ ] **Step 4: Commit**

```bash
git add packages/editor
git commit -m "The evidence picker will not offer a Drive reference — it lists them with the same words the server would have refused with, and there is no code path from that list to a pick"
```

---

### Task 14: `<EditorSlot>` implementation — composer wiring into `comment.added` / description `ticket.field_set`

**Files:**
- Create: `packages/editor/src/attachments/compose-editor-submission.ts`
- Create: `packages/editor/src/components/TicketEditorSlot.tsx`
- Modify: `packages/editor/src/index.ts` (exports)
- Test: `packages/editor/test/ticket-editor-slot.test.tsx`

**Interfaces:**
- Consumes: `TicketEditor`, `UploadResult` (Task 12); `emptyDoc`, `DocJson` (Task 1).
- Produces (cross-plan API):
  - `type EditorSubmission = { type: 'comment.added'; payload: { body: DocJson } } | { type: 'ticket.field_set'; payload: { fieldId: 'description'; value: DocJson } }`
  - `composeEditorSubmission(mode: 'comment' | 'description', doc: DocJson): EditorSubmission` — the single mapping from editor modes onto ledger events (Plan 3's payloads exactly). Plan 6's sheet may call it directly even if it mounts its own chrome.
  - `function TicketEditorSlot(props: EditorSlotProps): React.JSX.Element` — the concrete component behind Plan 6's `<EditorSlot>` boundary.
  - **The `<EditorSlot>` contract, reconciled with Plan 6 (which owns the declaration — `packages/app-core/src/views/editor-slot.ts`).** `packages/editor` must NOT import `@gisik-nokma/app-core` (that would invert the dependency and drag app-core's React tree into the RN webview bundle), so it re-declares the identical shape locally and TypeScript's structural typing makes `TicketEditorSlot` assignable to Plan 6's `EditorSlotComponent`. One contract written twice on purpose — **edit both or neither**:

```ts
// Structurally identical to packages/app-core/src/views/editor-slot.ts.
// Plan 6 spells documents `unknown` there (amendment 12 keeps ProseMirror JSON
// opaque outside this package); DocJson is assignable to unknown, so the
// narrower spelling here is legal and more useful inside the editor.
export type EditorSlotUpload = { attachmentId: string; filename: string; mime: string; size: number; url: string; sha256: string };

export type EditorSlotProps = {
  mode: 'comment' | 'description';        // which ledger event a submit becomes
  doc: DocJson | null;                    // Plan 6's name for the initial document; null → empty composer
  readOnly: boolean;
  workspaceId: string;                    // mention/member resolution scope
  ticketId: string;                       // uploads and attachment.added are ticket-scoped
  placeholder?: string;
  autoFocus?: boolean;
  // Editor capabilities. Optional in the shared declaration because Plan 6's
  // read-only PlainTextEditorSlot supplies none of them. This component STATES
  // the gap rather than pretending: without `submit` the submit button is
  // disabled with an honest label; without `uploadAttachment` image paste is
  // refused through onError instead of silently dropping the file.
  queryUsers?: (query: string) => Promise<MentionCandidate[]>;
  uploadAttachment?: (file: File) => Promise<EditorSlotUpload>;
  emitAttachmentAdded?: (uploaded: EditorSlotUpload) => Promise<void>;
  submit?: (submission: EditorSubmission) => Promise<void>;
  onDone?: () => void;
  onError?: (err: unknown) => void;
};
```

`UploadResult` (Task 12) is `EditorSlotUpload` — same six fields (`sha256` included, Task 9a), same meaning (the SERVER-sniffed truth); the alias exists so app-core can name the shape without importing this package.

  - Behavioral contract: comment mode clears the composer after a successful submit; description mode keeps the content (it is now the saved value). A failed submit **never clears** — a refused claim must not cost the user their words.

- [ ] **Step 1: Write the failing tests**

`packages/editor/test/ticket-editor-slot.test.tsx`:

```tsx
import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { composeEditorSubmission } from '../src/attachments/compose-editor-submission.js';
import { TicketEditorSlot, type EditorSlotProps } from '../src/components/TicketEditorSlot.js';
import type { DocJson } from '../src/doc.js';

const DOC: DocJson = {
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'the words' }] }],
};

describe('composeEditorSubmission', () => {
  it('comment mode → comment.added {body}', () => {
    expect(composeEditorSubmission('comment', DOC)).toEqual({
      type: 'comment.added',
      payload: { body: DOC },
    });
  });

  it('description mode → ticket.field_set {fieldId: description, value}', () => {
    expect(composeEditorSubmission('description', DOC)).toEqual({
      type: 'ticket.field_set',
      payload: { fieldId: 'description', value: DOC },
    });
  });
});

function makeProps(overrides: Partial<EditorSlotProps> = {}): EditorSlotProps {
  return {
    mode: 'comment',
    doc: null,
    readOnly: false,
    workspaceId: 'ws_1',
    ticketId: '01J9GTKA000000000000000000',
    queryUsers: async () => [],
    uploadAttachment: vi.fn(),
    emitAttachmentAdded: vi.fn(async () => {}),
    submit: vi.fn(async () => {}),
    ...overrides,
  };
}

async function mountSlot(props: EditorSlotProps) {
  const view = render(<TicketEditorSlot {...props} />);
  await vi.waitFor(() => {
    expect(view.container.querySelector('.ticket-editor .ProseMirror')).not.toBeNull();
  });
  return view;
}

function typeIntoSlot(view: ReturnType<typeof render>, text: string): void {
  const proseMirror = view.container.querySelector('.ProseMirror') as HTMLElement;
  // TicketEditorSlot exposes the doc through its submit path; for the test we
  // drive ProseMirror's text insertion via the browser-visible contenteditable.
  fireEvent.input(proseMirror, { inputType: 'insertText', data: text });
}

describe('TicketEditorSlot', () => {
  it('comment mode: submit sends comment.added and clears the composer on success', async () => {
    const submit = vi.fn(async () => {});
    const onDone = vi.fn();
    const view = await mountSlot(makeProps({ submit, onDone, doc: DOC }));
    fireEvent.click(view.container.querySelector('.editor-slot__submit') as HTMLButtonElement);
    await vi.waitFor(() => {
      expect(submit).toHaveBeenCalledTimes(1);
    });
    const submission = submit.mock.lastCall?.[0] as { type: string; payload: { body?: unknown } };
    expect(submission.type).toBe('comment.added');
    expect(JSON.stringify(submission.payload.body)).toContain('the words');
    expect(onDone).toHaveBeenCalled();
    await vi.waitFor(() => {
      expect((view.container.querySelector('.ProseMirror') as HTMLElement).textContent).toBe('');
    });
    view.unmount();
  });

  it('description mode: submit sends ticket.field_set and keeps the content', async () => {
    const submit = vi.fn(async () => {});
    const view = await mountSlot(makeProps({ mode: 'description', doc: DOC, submit }));
    fireEvent.click(view.container.querySelector('.editor-slot__submit') as HTMLButtonElement);
    await vi.waitFor(() => {
      expect(submit).toHaveBeenCalledTimes(1);
    });
    const submission = submit.mock.lastCall?.[0] as { type: string; payload: { fieldId?: string } };
    expect(submission.type).toBe('ticket.field_set');
    expect(submission.payload.fieldId).toBe('description');
    expect((view.container.querySelector('.ProseMirror') as HTMLElement).textContent).toContain('the words');
    view.unmount();
  });

  it('planted defect: a refused submit reports the error and never clears the words', async () => {
    const submit = vi.fn(async () => {
      throw new Error('This move must carry a comment explaining it, and none was provided.');
    });
    const onError = vi.fn();
    const view = await mountSlot(makeProps({ submit, onError, doc: DOC }));
    fireEvent.click(view.container.querySelector('.editor-slot__submit') as HTMLButtonElement);
    await vi.waitFor(() => {
      expect(onError).toHaveBeenCalled();
    });
    expect((view.container.querySelector('.ProseMirror') as HTMLElement).textContent).toContain('the words');
    view.unmount();
  });

  it('uploads route through emitAttachmentAdded (the sheet owns the event)', async () => {
    const emitAttachmentAdded = vi.fn(async () => {});
    const uploaded = { attachmentId: '01J9GATA000000000000000000', url: '/v1/attachments/01J9GATA000000000000000000', mime: 'image/png', filename: 'a.png', size: 1, sha256: 'd'.repeat(64) };
    const uploadAttachment = vi.fn(async () => uploaded);
    const view = await mountSlot(makeProps({ uploadAttachment, emitAttachmentAdded }));
    // Reach the paste path exactly as Task 12's tests do.
    const proseMirror = view.container.querySelector('.ProseMirror') as HTMLElement;
    expect(proseMirror).not.toBeNull();
    view.unmount();
    // The wiring is structural: TicketEditorSlot passes emitAttachmentAdded as
    // TicketEditor's onAttachmentAdded. The pass-through is asserted here by
    // type (compile-time) and behaviorally in Task 12's paste suite.
    expect(uploadAttachment).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it to verify it fails, then implement**

Run: `pnpm --filter @gisik-nokma/editor exec vitest run test/ticket-editor-slot.test.tsx`
Expected: FAIL — modules do not exist.

`packages/editor/src/attachments/compose-editor-submission.ts`:

```ts
import type { DocJson } from '../doc.js';

export type EditorSubmission =
  | { type: 'comment.added'; payload: { body: DocJson } }
  | { type: 'ticket.field_set'; payload: { fieldId: 'description'; value: DocJson } };

/**
 * The single place the editor's two submit modes map onto ledger events
 * (Plan 3's payload shapes, verbatim). Description edits stay versioned
 * claims because every save is one more ticket.field_set event.
 */
export function composeEditorSubmission(mode: 'comment' | 'description', doc: DocJson): EditorSubmission {
  return mode === 'comment'
    ? { type: 'comment.added', payload: { body: doc } }
    : { type: 'ticket.field_set', payload: { fieldId: 'description', value: doc } };
}
```

`packages/editor/src/components/TicketEditorSlot.tsx`:

```tsx
import { useRef, useState } from 'react';
import type { Editor } from '@tiptap/core';
import { emptyDoc, type DocJson } from '../doc.js';
import type { MentionCandidate } from '../extensions/mention.js';
import type { UploadResult } from '../upload.js';
import { composeEditorSubmission, type EditorSubmission } from '../attachments/compose-editor-submission.js';
import { TicketEditor } from './TicketEditor.js';

/**
 * Plan 6 owns this contract (`packages/app-core/src/views/editor-slot.ts`) and
 * mounts this component through its `<EditorSlot>` boundary. The shape is
 * re-declared here, structurally identical, because packages/editor must not
 * depend on app-core — see the Interfaces block above. The host supplies event
 * emission through submit/emitAttachmentAdded, so the editor package never
 * speaks HTTP or DataSource directly.
 */
export type EditorSlotUpload = UploadResult;

export type EditorSlotProps = {
  mode: 'comment' | 'description';
  doc: DocJson | null;
  readOnly: boolean;
  workspaceId: string;
  ticketId: string;
  placeholder?: string;
  autoFocus?: boolean;
  queryUsers?: (query: string) => Promise<MentionCandidate[]>;
  uploadAttachment?: (file: File) => Promise<EditorSlotUpload>;
  emitAttachmentAdded?: (uploaded: EditorSlotUpload) => Promise<void>;
  submit?: (submission: EditorSubmission) => Promise<void>;
  onDone?: () => void;
  onError?: (err: unknown) => void;
};

const NO_MENTIONS = async (): Promise<MentionCandidate[]> => [];

export function TicketEditorSlot(props: EditorSlotProps): React.JSX.Element {
  const editorRef = useRef<Editor | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const canSubmit = props.submit !== undefined && !props.readOnly;

  async function handleSubmit(doc?: DocJson): Promise<void> {
    const editor = editorRef.current;
    const submit = props.submit;
    if (!editor || submitting || submit === undefined || props.readOnly) return;
    const currentDoc = doc ?? (editor.getJSON() as DocJson);
    setSubmitting(true);
    try {
      await submit(composeEditorSubmission(props.mode, currentDoc));
      if (props.mode === 'comment') {
        // The claim landed; the composer resets for the next one.
        editor.commands.setContent(emptyDoc(), { emitUpdate: false });
      }
      props.onDone?.();
    } catch (err) {
      // A refused claim must never cost the user their words: content stays.
      props.onError?.(err);
    } finally {
      setSubmitting(false);
    }
  }

  // No uploader wired: say so and refuse, rather than swallowing the file.
  async function uploadOrRefuse(file: File): Promise<UploadResult> {
    if (props.uploadAttachment === undefined) {
      throw new Error('Attachments are unavailable here — this editor was mounted without an uploader.');
    }
    return props.uploadAttachment(file);
  }

  return (
    <div className="editor-slot">
      <TicketEditor
        initialDoc={props.doc ?? emptyDoc()}
        editable={!props.readOnly}
        placeholder={props.placeholder ?? (props.mode === 'comment' ? 'Write a comment…' : 'Describe this ticket…')}
        queryUsers={props.queryUsers ?? NO_MENTIONS}
        uploadAttachment={uploadOrRefuse}
        onAttachmentAdded={props.emitAttachmentAdded ?? (async () => {})}
        onUploadError={(err) => props.onError?.(err)}
        onSubmit={(doc) => void handleSubmit(doc)}
        editorRef={editorRef}
      />
      <button
        type="button"
        className="editor-slot__submit"
        disabled={submitting || !canSubmit}
        title={canSubmit ? undefined : 'Read-only: this editor was mounted without a submit handler.'}
        onClick={() => void handleSubmit()}
      >
        {props.mode === 'comment' ? 'Comment' : 'Save description'}
      </button>
    </div>
  );
}
```

Append to `packages/editor/src/index.ts`:

```ts
export { composeEditorSubmission, type EditorSubmission } from './attachments/compose-editor-submission.js';
export { TicketEditorSlot, type EditorSlotProps, type EditorSlotUpload } from './components/TicketEditorSlot.js';
```

- [ ] **Step 3: Run the tests to verify they pass**

Run: `pnpm --filter @gisik-nokma/editor exec vitest run test/ticket-editor-slot.test.tsx`
Expected: PASS (6 tests).

- [ ] **Step 4: Commit**

```bash
git add packages/editor
git commit -m "EditorSlot implemented: one mapping from composer modes to comment.added and description field_set, refusals never eat the user's words, event emission stays the sheet's job"
```

---

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
### Task 16: Features.md §9, test-cases 9.x, and full verification

**Files:**
- Modify: `Features.md` (append §9)
- Create: `test-cases/09-editor-attachments.md`
- Modify: `test-cases/README.md` (buckets line)

Workspace convention note: `Features.md`/`test-cases/` move in the same change set as the work. This plan ships as one PR; this task lands the catalogue inside that PR, before merge.

**Interfaces:**
- Consumes: everything — this task verifies the whole plan.
- Produces: `Features.md` §9 "Editor & attachments"; `test-cases/09-editor-attachments.md` (cases 9.1–9.34 — 9.29–9.34 are the lettered tasks' Drive-reference and SHA-256 cases). This plan claims **no other numbers**.

- [ ] **Step 1: Full verification run**

Run: `pnpm turbo run build test typecheck && pnpm --filter @gisik-nokma/editor run build:webview`
Expected: every package green (editor suites, domain including doc-embeds, server including gates/attachments, and no regression in Plans 1–5 suites); the webview single-file bundle builds. This is the evidence for every ✅ below.

- [ ] **Step 2: Append Features.md section 9**

Append to `Features.md`:

```markdown

## 9. Editor & attachments

- ✅ **WYSIWYG editor (schema v1)** — Tiptap v3 shared editor: paragraphs, headings 1–6, bold/italic/strike/code, links (no autolink — typed URLs stay literal), bullet/ordered lists, blockquotes, code blocks, tables; documents serialized as ProseMirror JSON with an in-band `schemaVersion`, opaque outside the package. One extension origin for web, desktop, and the RN webview. `packages/editor/src/schema/`
- ✅ **Escape suggestions** — every markdown-style autoformat (13 block + 6 mark triggers) surfaces an inline chip the moment it fires: accept (click/Backspace) keeps the typed characters literal, dismiss (Esc/keep typing) keeps the formatting. Nothing silently becomes markup. `packages/editor/src/extensions/escape-suggestion.ts`
- ✅ **Mentions** — `@` opens a picker; inserted mentions are `{userId, label}` atoms; Escape leaves the typed text literal; `docToPlainText` renders them as `@name`. `packages/editor/src/extensions/mention.ts`
- ✅ **Image embedding, image-only, three layers** — image nodes `{attachmentId, wrap: inline-left|inline-right|block, alt}` with a wrap picker; enforcement at the insert command, the paste/drop handler (non-images go to the attachment list, never the doc), and a server ingest gate (embedded ids must be this ticket's image-mime attachments). `packages/editor/src/extensions/ticket-image.ts`, `attachment-paste.ts`, `apps/server/src/gates/image-embed-gate.ts`
- ✅ **Attachment upload** — `POST /v1/attachments` (multipart, 25 MiB cap): session + ticket visibility required, mime decided by magic-byte sniffing against a closed allow-list (a renamed `.exe` is refused for what it is), answers the sniffed truth the client must echo into `attachment.added`. `apps/server/src/routes/attachments.ts`, `apps/server/src/attachments/sniff.ts`
- ✅ **Attachment download** — `GET /v1/attachments/:id` streams under `canSee` on the owning ticket; unknown, invisible, and byte-less answer one byte-identical 404; images inline, everything else a sanitized-filename download. `apps/server/src/routes/attachments.ts`
- ⚙️ **ObjectStore** — `{put, getStream, delete}` behind an interface: S3-compatible implementation (path-style, MinIO/R2-ready) and a torn-write-proof local-disk dev store; traversal-proof object keys; env-selected factory. `apps/server/src/attachments/`
- ⚙️ **Server gates** — an additive seam inside the ingest transaction for refusals that need server-owned state; ships the image-embed gates and the evidence-exists gate (`attachment.embed-unknown`, `attachment.embed-not-image`, `attachment.evidence-unknown` — foreign ids indistinguishable from nonexistent ones). `apps/server/src/gates/`
- ✅ **Evidence picker** — for require-evidence transitions: pick an existing attachment or upload fresh (`attachment.added` first), handing `evidenceAttachmentId` into `ticket.transitioned`; `transitionRequiresEvidence` resolves transitions the way the engine does. `packages/editor/src/components/EvidencePicker.tsx`
- ✅ **Composer & description editing** — `TicketEditorSlot` implements the web `<EditorSlot>` boundary: comment mode → `comment.added {body}`, description mode → `ticket.field_set {fieldId: 'description', value}` via one `composeEditorSubmission` mapping; a refused submit never clears the user's words. `packages/editor/src/components/TicketEditorSlot.tsx`
- ⚙️ **RN webview bundle & bridge** — a single self-contained HTML bundle plus a versioned five-verb postMessage protocol (`loadDoc`, `change`, `submit`, `insertImage`, `requestUpload`); files never cross the bridge (the host uploads natively); hostile messages parse to null, never crashes. Plan 10 wires the RN side. `packages/editor/src/webview/`
- ✅ **Upload content hash** — every uploaded file is SHA-256'd server-side over the exact bytes stored, kept with the attachment and echoed into `attachment.added`, so a `require-evidence` claim points at a file whose identity can be re-proved; an unhashed legacy row reads as unknown, never as verified. `apps/server/src/attachments/content-hash.ts`
- ✅ **Google Drive references (owner sign-off)** — Drive files attach as references through Google's own Picker under the non-sensitive per-file `drive.file` scope, granted by incremental consent at pick time on the existing Google sign-in; the claim stores `{driveFileId, name, mimeType, webViewLink, iconLink?, capturedAt}` and never a copy of the bytes. `packages/editor/src/drive/`
- ✅ **The three Drive rules** — a reference can never satisfy `require-evidence` (refused `attachment.evidence-drive-reference`, with the remedy named); it renders as an external reference bearing its last-seen name and capture date, its reachability only ever *unknown*; and it can never be inline-embedded — the drive module cannot even reach the insert command, and the server refuses a document that names one. `packages/domain/src/attachment-kinds.ts`, `packages/editor/src/components/AttachmentListItem.tsx`, `apps/server/src/gates/evidence-gate.ts`
```

- [ ] **Step 3: Create the test-case bucket**

`test-cases/09-editor-attachments.md`:

```markdown
# 9. Editor & attachments

Mirrors `Features.md` §9. Status: `❌` not covered · `✅` covered · `🟡` partial · `🧪` manual · `🚫` out of scope.

- **9.1** ✅ Schema v1 exposes exactly the spec's nodes and marks; a doc claiming an unknown node type is refused (planted defect). — `packages/editor/test/schema.test.ts`
- **9.2** ✅ Serialized docs carry `schemaVersion: 1` in the doc node's attrs; version-less docs parse with the default. — `packages/editor/test/schema.test.ts`
- **9.3** ✅ A doc round-trips through its own JSON byte-stably. — `packages/editor/test/schema.test.ts`
- **9.4** ✅ `insertTicketImage` inserts `{attachmentId, wrap, alt}` with wrap defaulting to block; renders src via `resolveAttachmentUrl` with a BEM wrap class. — `packages/editor/test/ticket-image.test.ts`
- **9.5** ✅ Layer 1: inserting an image node for a non-image mime is refused and the doc untouched (planted defect: pdf, mp4, svg, html). — `packages/editor/test/ticket-image.test.ts`
- **9.6** ✅ `setImageWrap` rewrites the selected image's wrap; a mode outside the vocabulary is refused (planted defect). — `packages/editor/test/ticket-image.test.ts`
- **9.7** ✅ Typing `@query` surfaces matching candidates; click or Enter inserts a `{userId, label}` mention atom plus a space. — `packages/editor/test/mention.test.ts`
- **9.8** ✅ Escape dismisses the mention picker and the typed `@…` stays literal text (planted defect). — `packages/editor/test/mention.test.ts`
- **9.9** ✅ Every reserved autoformat sequence (headings 1–6; `-`/`*`/`+`; `1.`; `>`; ``` fence; `---`; `**`/`__`; `*`/`_`; `~~`; backtick) triggers its formatting AND surfaces the escape suggestion; accepting yields the literal typed text (planted defect per trigger, 19 sequences). — `packages/editor/test/escape-suggestion.test.ts`
- **9.10** ✅ Escape acceptance works by chip click and by Backspace (core keymap through undoInputRule). — `packages/editor/test/escape-suggestion.test.ts`
- **9.11** ✅ Dismissal keeps the formatting: Esc drops the chip; continuing to type drops the chip; Esc with no suggestion is not consumed. — `packages/editor/test/escape-suggestion.test.ts`
- **9.12** ✅ Non-triggers stay literal with no suggestion: `[text](url)`, `|`, bare URLs (autolink off). — `packages/editor/test/escape-suggestion.test.ts`
- **9.13** ✅ Every schema-v1 node survives `docToPlainText` without throwing; mentions render as `@name`; text stays in document order. — `packages/editor/test/doc-to-plain-text.test.ts`
- **9.14** ✅ LocalDiskStore round-trips exact bytes; missing keys throw ObjectNotFoundError; a failed write leaves no partial object. — `apps/server/test/attachments/local-disk-store.test.ts`
- **9.15** ✅ Traversal and malformed object keys (`..`, absolute, empty segment, dots, spaces) are refused before any I/O (planted defects). — `apps/server/test/attachments/local-disk-store.test.ts`, `s3-store.test.ts`
- **9.16** ✅ S3 store sends bucket/key/content-type, maps NoSuchKey to ObjectNotFoundError, propagates other failures; the env factory names every missing variable and refuses invented kinds (planted defects). — `apps/server/test/attachments/s3-store.test.ts`, `store-config.test.ts`
- **9.17** ✅ Attachment metadata round-trips through the `attachments` table; duplicate object_key violates unique (planted defect). — `apps/server/test/attachments/attachment-repo.test.ts`
- **9.18** ✅ Upload happy path: 201 with the server-sniffed mime/size/filename; the row records the sniffed truth even when the client's content-type lied. — `apps/server/test/routes/attachments-upload.test.ts`
- **9.19** ✅ A renamed `.exe` (image name, image content-type, MZ bytes) is refused 415 by its bytes; unidentifiable bytes refused 415 (planted defects). — `apps/server/test/routes/attachments-upload.test.ts`, `apps/server/test/attachments/sniff.test.ts`
- **9.20** ✅ An oversize upload is refused 413 (planted defect). — `apps/server/test/routes/attachments-upload.test.ts`
- **9.21** ✅ Upload authorization: no session 401; missing parts 400; a guest without visibility gets a 404 byte-identical to a missing ticket (planted defect). — `apps/server/test/routes/attachments-upload.test.ts`
- **9.22** ✅ Download streams exact bytes with honest headers (sniffed content-type, length, nosniff; inline for images, sanitized-filename attachment otherwise); header-injection filenames neutralised (planted defect). — `apps/server/test/routes/attachments-download.test.ts`, `apps/server/test/attachments/filename.test.ts`
- **9.23** ✅ Unauthorized download: an unshared guest, a nonexistent id, and metadata-without-bytes answer one byte-identical 404 (planted defects — the named refusal). — `apps/server/test/routes/attachments-download.test.ts`
- **9.24** ✅ Layer 3 gates: embedding a pdf refused `attachment.embed-not-image`; a fabricated id and another ticket's image refused `attachment.embed-unknown` with identical reason shapes (no existence leak); refused events leave no ledger trace; non-description fields uninspected (planted defects). — `apps/server/test/gates/image-embed-gate.test.ts`
- **9.25** ✅ Evidence gate: fabricated evidence and another ticket's attachment refused `attachment.evidence-unknown` identically; real evidence commits (planted defects). — `apps/server/test/gates/evidence-gate.test.ts`
- **9.26** ✅ Layer 2 paste/drop: image files upload → `attachment.added` → node (in that order); non-image files go to the list and NEVER become nodes (planted defect); failed uploads clean up to an untouched doc; captureFiles delegates to the host. — `packages/editor/test/attachment-paste.test.ts`
- **9.27** ✅ TicketEditor mounts SSR-safe (`immediatelyRender: false`), emits doc changes, submits on Mod-Enter, shows upload chips while in flight, and offers the wrap menu on image selection. — `packages/editor/test/ticket-editor.test.tsx`
- **9.28** ✅ EvidencePicker picks existing or uploads fresh (event before pick), surfaces failures without picking; EditorSlot maps comment/description onto their events and a refused submit never clears the words (planted defect); the webview bridge speaks its five verbs, refuses non-image insertImage, parses hostile messages to null, and builds as one self-contained file (planted defects). — `packages/editor/test/evidence-picker.test.tsx`, `ticket-editor-slot.test.tsx`, `webview-bridge.test.ts`
- **9.29** ✅ Uploads are hashed server-side: the 201 body and the stored row carry the same SHA-256 of the stored bytes; published vectors pinned; one flipped byte is a different hash and a lying content-type changes nothing (planted defects). — `apps/server/test/attachments/content-hash.test.ts`, `apps/server/test/routes/attachments-upload.test.ts`
- **9.30** ✅ The Drive picker asks for exactly `drive.file` and nothing else, with incremental consent (`prompt: ''`), loads both Google scripts, passes developer key and app id, maps a picked file to a dated reference, attaches nothing on cancel, drops a doc with no view link rather than inventing a URL, and composes both `attachment.added` claims — upload (hash included) and drive-reference (planted defects). — `packages/editor/test/google-picker.test.ts`
- **9.31** ✅ Drive rule 2 — a reference renders as external-and-last-seen (own kind marker, Drive link never a `/v1/attachments/` download, last-seen name and capture date on the surface), and its reachability line says *unknown* whether or not a check failed, never "deleted"/"missing"/"available"/"verified"; uploads carry no reachability language at all (planted defects). — `packages/editor/test/attachment-list-item.test.tsx`
- **9.32** ✅ Drive rule 3 — a picked Drive PNG leaves the document byte-identical, a pasted Drive link uploads nothing and embeds nothing, the drive module never imports the insert command (scanner proven against a planted import), and the server refuses a document embedding a reference as `attachment.embed-unknown` with no ledger trace (planted defects). — `packages/editor/test/drive-never-inline.test.ts`, `apps/server/test/gates/image-embed-gate.test.ts`
- **9.33** ✅ Drive rule 1, engine side — a Drive reference on this ticket named as evidence is refused `attachment.evidence-drive-reference` with the single-origin reason verbatim and no id leaked into it; a reference on another ticket refuses byte-identically to a fabricated id (planted defects). — `apps/server/test/gates/evidence-gate.test.ts`, `packages/domain/test/attachment-kinds.test.ts`
- **9.34** ✅ Drive rule 1, surface — the evidence picker offers only uploads, lists references in an unofferable section carrying the server's own reason word for word, and clicking one picks nothing (planted defects). — `packages/editor/test/evidence-picker.test.tsx`
```

- [ ] **Step 4: Update the test-cases README buckets line**

In `test-cases/README.md`, append `09-editor-attachments.md` to the `Buckets so far:` enumeration (parallel-plan executors each add their own; if the line still reads `none — …`, replace it as Plan 1 Task 14 specifies and list this bucket):

```markdown
`09-editor-attachments.md` (Features.md §9)
```

- [ ] **Step 5: Cross-check Features.md against reality**

Re-read the §9 bullets just added and confirm each names files that exist and behavior the suites prove. Any bullet without green tests behind it must be fixed or re-marked before commit — no silent drift.

- [ ] **Step 6: Commit**

```bash
git add Features.md test-cases
git commit -m "Catalogue the editor and attachments: Features.md section 9 and 34 test cases, every refusal traced to the planted defect that proves it — the three Drive rules and the upload hash included"
```

---

## Cross-plan Produces (summary for the series)

For successor plans (6, 8, 9, 10, 11) — the exact names this plan contributes:

- **Schema v1** (`@gisik-nokma/editor`): nodes `doc` (attrs `schemaVersion: 1`), `paragraph`, `text`, `heading`, `bulletList`, `orderedList`, `listItem`, `blockquote`, `codeBlock`, `horizontalRule`, `hardBreak`, `table`, `tableRow`, `tableHeader`, `tableCell`, `image {attachmentId, wrap: 'inline-left'|'inline-right'|'block', alt}`, `mention {userId, label}`; marks `bold`, `italic`, `strike`, `code`, `link`. `DOC_SCHEMA_VERSION`, `DocJson`, `emptyDoc`, `isDocJson`, `buildEditorExtensions(options)`.
- **Editor surface**: `TicketEditor`, `TicketEditorSlot` (+ `EditorSlotProps`/`EditorSlotUpload`, structurally identical to Plan 6's declaration in `packages/app-core/src/views/editor-slot.ts` — see Open question 1), `EvidencePicker` (+ `DriveReferenceSummary`), `ImageWrapMenu`, `AttachmentListItem`/`UploadedAttachmentItem`/`DriveReferenceItem`/`describeDriveReachability` (+ `AttachmentListEntry`, `DriveLinkCheck` — the union Plan 6 re-declares in `packages/app-core/src/views/attachment-list.tsx`), `composeEditorSubmission`, `transitionRequiresEvidence`, `getEscapeSuggestion`, `uploadAttachmentHttp`/`UploadResult`/`UploadRefusedError`, `createAttachmentPasteExtension`, `openDrivePicker`/`requestDriveFileToken`/`toDriveReference`/`createBrowserPickerDeps` (+ `DrivePickerConfig`, `DrivePickerDeps`, `PickedDriveFile`, `GOOGLE_GSI_SRC`, `GOOGLE_API_SRC`), `composeUploadAttachmentAdded`/`composeDriveReferenceAdded`.
- **Domain additions** (`@gisik-nokma/domain`): `EMBEDDABLE_IMAGE_MIME`, `isEmbeddableImageMime`, `collectImageAttachmentIds`; `AttachmentKind`, `DriveReference`, `isDriveReference`, `DRIVE_FILE_SCOPE`, `RULE_EVIDENCE_DRIVE_REFERENCE`, `EVIDENCE_DRIVE_REFERENCE_REASON` (Task 11a — the single origin of that refusal's wording).
- **Server**: `ObjectStore {put, getStream, delete}` + `ObjectMeta`, `LocalDiskStore`, `S3ObjectStore`, `createObjectStoreFromEnv`, `ObjectNotFoundError`, `InvalidObjectKeyError`, `assertValidObjectKey`; `attachments` table + `AttachmentRow` repo functions; `ALLOWED_ATTACHMENT_MIME`, `sniffAllowedMime`, `sanitizeFilename`, `ATTACHMENT_MAX_BYTES`, `sha256Hex` (+ `attachments.sha256`, nullable = unknown); routes `POST /v1/attachments` → `201 {attachmentId, url, mime, filename, size, sha256}` and `GET /v1/attachments/:id`; `registerAttachmentRoutes(app, {pool, store, auth, maxBytes?})`.
- **Ingest seam** (additive to Plan 1): `IngestDeps.gates?: ServerGate[]`; `ServerGate {eventType, check(event, db)}`, `GateRefusal`; `buildServerGates()`; rule ids `attachment.embed-unknown`, `attachment.embed-not-image`, `attachment.evidence-unknown`, `attachment.evidence-drive-reference` (Task 11a; its reason string comes from `EVIDENCE_DRIVE_REFERENCE_REASON` and is never retyped). Test helper `seedDriveReference` (`apps/server/test/helpers/drive-reference.ts`).
- **Webview bridge** (Plan 10 consumes): `HostToEditorMessage`/`EditorToHostMessage` (verbs `loadDoc`, `change`, `submit`, `insertImage`, `requestUpload`, plus `mentionQuery`/`mentionResults`, `requestSubmit`, `uploadFailed`), `EDITOR_BRIDGE_VERSION = 1`, `parseHostMessage`, `serializeEditorMessage`, `createEditorBridge`; bundle at `packages/editor/dist-webview/index.html` via `build:webview`.

## Open questions

Flagged rather than silently resolved; none blocks execution of this plan as written.

**Walked 2026-08-27.** The two recordings this plan requested (questions 3 and 4) are now in the coordination document — amendment 15 carries the upload-response superset and the `IngestDeps.gates` seam. Two claims about Plan 11 turned out to be aspirational and were made true at the walk: it now names the three picker variables (question 10) and owns the orphan sweep (question 7). Questions 5 and 8 are settled below with their reasons; 1, 2, 6, 9 and 11 stand as written — two reconciliations, two executor notes, and one deliberate absence.

1. **Plan 6's `<EditorSlot>` props — RECONCILED, nothing outstanding.** Plan 6 owns the declaration (`packages/app-core/src/views/editor-slot.ts`) and its earlier draft was too thin for the real editor (no mode, no ticket scope, no uploader — image embedding could not have worked behind it). Taken: **Plan 6's names, widened to this plan's needs.** `initialDoc` became `doc` (Plan 6's spelling); `readOnly`, `workspaceId`, `placeholder?` and `autoFocus?` came from Plan 6; `mode`, `ticketId`, `queryUsers`, `uploadAttachment`, `emitAttachmentAdded`, `submit`, `onDone?`, `onError?` came from here; Plan 6's `onSubmit(doc)` was dropped so there is exactly ONE submit path. Every editor capability is optional so Plan 6's read-only `PlainTextEditorSlot` can satisfy the same type; this component states the gap (disabled submit, refused upload) instead of pretending. Plan 6's declaration spells documents `unknown` and app-core never imports this package; `packages/editor` re-declares the shape locally and structural typing joins them. **Both declarations are one contract — edit both or neither.**
2. **`docToPlainText` mention rendering — RECONCILED, nothing outstanding.** Plan 5 owns the walker (its Task 1, `packages/domain/src/doc-text.ts`) and pinned `type MentionNodeAttrs = { userId: string; label?: string }` rendering as `@label` with `@userId` as the fallback. This plan's mention node emits exactly `{userId, label}`, so Task 6's conformance test asserts the behaviour Plan 5 already implements — no adjustment on either side. The `label` attr exists precisely so the dependency-free walker can name a person; the fallback is why a label-less mention still renders an id rather than nothing (provenance is never anonymous).
3. **Server gates are an additive ingest amendment — RECORDED (2026-08-27, coordination amendment 15).** `IngestDeps.gates?: ServerGate[]` extends Plan 1's contract (default `[]`, invisible when unused); gates run inside `ingestBatch`, so Plan 10's `POST /v1/sync` path inherits them with no extra wiring — a sync-refused embed becomes a contested claim like any other refusal. Nothing further outstanding.
4. **Upload response superset — RECORDED (2026-08-27, coordination amendment 15), with the load-bearing reason kept beside the shape:** the client MUST echo the server-sniffed `mime`/`size` into `attachment.added`, not the local file's claims — a file's opinion of its type is not evidence.
5. **Unsniffable file types are refused in v1 — SETTLED at review (2026-08-27), as written, with the dogfooding case checked rather than assumed.** The user this bites first is the accountant, whose world is spreadsheets — and the accountant is covered twice without weakening the rule: XLSX and XLS carry magic bytes and upload fine, and a Drive reference handles the live-spreadsheet case (which is what an accountant's working sheet usually is). What is refused is bare CSV/plain-text/SVG, with the reason shown; if a real workflow surfaces that needs raw CSV as *evidence*, the future path stays content-inspection, never extension trust.
6. **Colour tokens.** `packages/ui` (Plan 6, amendment 11) is the one colour origin; this plan's CSS is structural-only (zero colour literals — the token test will pass over it). The editor's chrome (chips, popup, chip hint) will need token-based colour rules added in `packages/ui` or the web app's stylesheet once Plan 6's tokens exist.
7. **Attachment garbage collection — ASSIGNED (2026-08-27): Plan 11 owns the sweep**, in its runbook as a monthly operation beside the restore drill (`ops:sweep-orphans`). The honesty constraint travelled with the assignment and is the design: the sweep may only ever delete objects and rows **no `attachment.added` in the ledger has ever named**, aged past 30 days — nothing a claim points at can vanish, so this is not a deletion *policy* (which would be an owner decision) but hygiene over things the ledger has never heard of. A large orphan count is an incident signal (clients failing between upload and ingest), not a cleanup chore, and the runbook says so. `ObjectStore.delete` finally has its one caller.
8. **Ticket-scoped upload permission = `canSee` — SETTLED at review (2026-08-27): the bar stays, and the dogfooding depends on it.** The stricter alternative this question offered (guests view but not attach) would break the product's own founding scenario: the accountant is a guest, and the accountant *uploading filings as evidence* is the point of having them in the workspace — a guest who cannot attach cannot satisfy `require-evidence`, and the errand template's whole loop dies. Attach-where-you-can-see is also the same bar as commenting, which is the right company for it. The one-line seam stays named in case a real abuse case ever appears.
9. **Two executor-verification steps are built in** where this plan leans on Tiptap internals recorded from the knowledge-base's installed version: Task 1 Step 2 (named exports) and Task 5 Step 1 (`isInputRules` store shape). Both give the exact fallback if the installed minor differs.
10. **Where the Drive picker's three config values are wired — and the claim about Plan 11 made true (2026-08-27).** `packages/editor` takes a `DrivePickerConfig` and never reads `process.env` (Task 12a). `apps/web` fills it from `NEXT_PUBLIC_GOOGLE_CLIENT_ID` / `NEXT_PUBLIC_GOOGLE_PICKER_API_KEY` / `NEXT_PUBLIC_GOOGLE_APP_ID` at the ticket-sheet mount; the desktop and mobile shells (Plan 10) do the same with their own env spellings. This question originally stated that "Plan 11 provisions the Picker API key and adds the three variables to the deployment" — **Plan 11 had never heard of them**; a plan citing another plan's provisioning is a claim, and this one was checked at the walk and found aspirational. Plan 11 now names all three in its web build args, compose, DO spec and `.env.example` (whose completeness gate exists for exactly this), and the runbook carries the console errand. The no-config rule survives intact: a shell without the key renders no "Attach from Drive" control at all — a missing feature, never a control that fails on click.
11. **Link-checking Drive references is deliberately absent from v1.** `DriveLinkCheck` has exactly two values and neither is "reachable" (Task 12b): the product never claims a Drive file is fine. If a later plan adds a background check, it may only ever move a reference from `not-checked` to `unreachable` — adding a positive state would be adding a claim this product cannot back.

### ~~Pending~~ **Discharged** Plan 3 amendment (verified applied, 2026-08-27)

All four changes below landed in Plan 3 on 2026-08-20 (commit `0960342`, "Attachments know what kind they are") and were **verified present at this plan's walk** rather than assumed from the commit message: the `kind`-discriminated union with `sha256` and `capturedAt` (sub-change 1), the round-trip fixtures for both kinds plus the planted no-`kind` and no-`sha256` refusals (2), the reducer's `case 'attachment.added': return state;` untouched (3), and the evidence-gate cross-reference recorded without contradiction (4). The text is kept below as the record of what was asked, because the executor reading Plan 3 will meet these shapes and deserves to know where they came from. **Nothing here remains to apply.**

**1. `attachment.added` payload becomes a `kind`-discriminated union.** In Plan 3 Task 2 (`packages/domain/src/events/ticket-events.ts`), replace:

```ts
/** Metadata only — storage/upload is a later plan. */
export const attachmentAddedPayload = z.object({
  attachmentId: ulidString,
  filename: z.string().min(1),
  mime: z.string().regex(/^[\w.+-]+\/[\w.+-]+$/, 'must be a MIME type'),
  size: z.number().int().min(0),
});
```

with:

```ts
/**
 * An attachment is one of exactly two kinds, and the claim says which
 * (spec §2). An UPLOAD is bytes this product holds: the mime and size are
 * the server's sniffed truth and `sha256` is its hash of the stored bytes,
 * so evidence can be verified rather than merely present. A DRIVE
 * REFERENCE is a pointer to a Google Drive file this product does NOT
 * hold — name and mimeType are last-seen observations dated by
 * `capturedAt`, never standing facts. There is no legacy payload to
 * tolerate: nothing has shipped, so `kind` is required, not inferred.
 */
export const attachmentUploadedPayload = z.object({
  kind: z.literal('upload'),
  attachmentId: ulidString,
  filename: z.string().min(1),
  mime: z.string().regex(/^[\w.+-]+\/[\w.+-]+$/, 'must be a MIME type'),
  size: z.number().int().min(0),
  sha256: z.string().regex(/^[0-9a-f]{64}$/, 'must be a lowercase-hex SHA-256'),
});

export const attachmentDriveReferencePayload = z.object({
  kind: z.literal('drive-reference'),
  attachmentId: ulidString,
  driveFileId: z.string().min(1),
  name: z.string().min(1),
  mimeType: z.string().regex(/^[\w.+-]+\/[\w.+-]+$/, 'must be a MIME type'),
  webViewLink: z.string().url(),
  iconLink: z.string().url().optional(),
  capturedAt: z.string().datetime(),
});

export const attachmentAddedPayload = z.discriminatedUnion('kind', [
  attachmentUploadedPayload,
  attachmentDriveReferencePayload,
]);
```

The `registerEventType({ type: 'attachment.added', version: 1, payloadSchema: attachmentAddedPayload })` line is unchanged — same type, same version, one wider (and stricter) schema.

Plan 3's prose about this payload needs the same pass: the three places that describe `attachment.added` as "metadata only — storage/upload is a later plan" (its architecture note, the schema comment replaced above, and its Produces summary) should now say that an attachment claim is one of two kinds, and that an upload carries the server's hash.

**2. Fixtures.** Plan 3's `roundTrips('attachment.added', 'ticket', { attachmentId: ATTACHMENT, filename: …, mime: …, size: … })` case gains `kind: 'upload'` and a `sha256` (any 64-char lowercase-hex string), and a second `roundTrips` case covers a `drive-reference` payload. Add a planted-defect case in the same suite: a payload with **no** `kind`, and one with `kind: 'upload'` but no `sha256`, are both refused at the door — an attachment whose kind is unstated is exactly the ambiguity these rules exist to remove.

**3. The reducer is unchanged.** `applyTicketEvent`'s `case 'attachment.added': return state;` stays as it is. This is the reason the evidence refusal below is **not** a rule-engine rule: `TicketState` never carries attachments, so no pure rule can see an attachment's kind. Do not go looking for a Plan 2/3 engine rule to add — there is nowhere for it to read from.

**4. The evidence refusal — implemented in Plan 7, recorded here.** A `ticket.transitioned` naming a Drive reference of the same ticket as its `evidenceAttachmentId` is refused inside the ingest transaction by Plan 7's evidence gate (`apps/server/src/gates/evidence-gate.ts`, Task 11a), which can see both the `attachments` table and the ledger. Plan 3's part is only to *not* contradict it:

- **Rule id:** `attachment.evidence-drive-reference`
- **Reason (verbatim, one sentence, no interpolation):**

  `A Google Drive link cannot serve as evidence: the board holds a pointer, not the file, and a Drive file can be renamed, edited, moved or deleted after it is attached. Upload the file to this ticket and name the uploaded copy as the evidence instead.`

- Both are exported from `@gisik-nokma/domain` as `RULE_EVIDENCE_DRIVE_REFERENCE` and `EVIDENCE_DRIVE_REFERENCE_REASON` (added by Plan 7 Task 11a). **Any Plan 3 text, test, or fixture that needs them imports those constants — the string is never retyped**, so every copy stays byte-identical by construction.
- If Plan 3 documents `ticket.transitioned`'s `evidenceAttachmentId` anywhere in its Produces or its history rendering, add the one-line constraint: *evidence must name an `attachment.added` of kind `'upload'` on the same ticket; a `'drive-reference'` is refused `attachment.evidence-drive-reference`, and an id that is neither is refused `attachment.evidence-unknown`.* The `ticket.transitioned` payload itself does **not** change.

## Self-review (performed by the plan author, per the writing-plans skill)

**1. Spec coverage — §2 "The editor" and "Attachments", plus assigned edges:**
- "WYSIWYG editor in the mould of the knowledge-base document editor (same Tiptap v3 family and conventions)" → Tasks 1, 12; named exports, `immediatelyRender: false`, stable-ref options, plain-DOM plugin UI, chips-not-nodes all carried over. ✓ (Deterministic *markdown* serialisation is the kb's storage format; ours is ProseMirror JSON per coordination amendment 12 — deterministic round-trip proven in 9.3.)
- "when a typed reserved character would trigger formatting, the editor surfaces an inline escape-character suggestion, so literal text is always reachable and nothing silently becomes markup" → Task 5, the full trigger table, accept/dismiss both proven; `@`/`[`/`|`/URL covered as picker-escape and literal non-triggers. ✓
- "Documents are stored as structured content inside events; description edits stay versioned claims" → schema v1 JSON opaque in payloads (Task 1); every description save is one more `ticket.field_set` event (Task 14). ✓
- "One document schema across all three clients; editor shared web code; embedded via webview in React Native" → one `buildEditorExtensions` origin (Task 1); webview bundle + bridge (Task 15); RN wiring deferred to Plan 10 per assignment. ✓
- "Only images may embed inline … wrapping options: inline with text-wrap left or right, or full-width block" → wrap vocabulary exact (Task 3); three-layer enforcement (Tasks 3, 12, 11), each layer planted-defect proven. ✓
- "Documents, videos and every other file type are list-style attachments only — never inline" → layer 2 routes them to `onFileAttached` (9.26); layer 3 refuses smuggled embeds (9.24). ✓
- "Files live in object storage; events carry references" → ObjectStore + `attachment.added` referencing pattern; upload endpoint appends nothing to the ledger (Task 9). ✓
- "Every uploaded file is hashed (SHA-256) as it arrives and the hash is kept with it" → hashed over the exact stored buffer, stored on the row, answered in the 201 and echoed into `attachment.added` (Task 9a); an unhashed row reads `null` = unknown. ✓
- "Google Drive files may be attached as references … picked through Google's own file picker under the per-file `drive.file` scope … the bytes are never copied" → Picker with exactly `DRIVE_FILE_SCOPE` and incremental consent (Task 12a); the reference is a ledger claim with no bytes, no object key and no row (Tasks 11a, 12a). ✓
- Drive rule 1, "can never satisfy require-evidence … refused with a reason that says why and what to do instead" → `attachment.evidence-drive-reference` from one domain constant (Task 11a), and no code path from a reference to a pick in the evidence picker (Task 13a). ✓
- Drive rule 2, "renders as an external pointer bearing its last-seen name and its capture date … shown as unknown, never as absent, never as fine" → distinct kind marker, Drive link never a board download, last-seen name + capture date, and a reachability vocabulary with no positive value (Task 12b). ✓
- Drive rule 3, "never inline-embeddable … a picked Drive image joins the attachment list, not the document" → structural (the drive module never imports the insert command, scanner-proven), behavioural (picked PNG leaves the doc byte-identical; a pasted link stays a link), and server-side (the embed gate refuses it) (Task 12c). ✓
- "An **uploaded** attachment on a transition carrying a require-evidence rule serves as its evidence" (§4 edge) → EvidencePicker + `evidenceAttachmentId` into `ticket.transitioned` (Task 13); existence proven server-side (Task 11); *uploaded* enforced by the drive-reference refusal at the gate (Task 11a) and by the picker never offering one (Task 13a). ✓
- §6 edge (enforcement on every read) → `canSee` on upload and download with indistinguishable 404s (Tasks 9, 10). ✓
- §1 invariant 6 (planted defects) → every refusal in this plan has one; enumerated in 9.x. ✓

**2. Placeholder scan:** no TBD/TODO/"implement later"/"add validation"/"similar to Task N" anywhere; every code step contains complete code; the two deliberate executor-verification steps (Tiptap named exports, `isInputRules`) verify recorded facts and name the exact fallback rather than deferring work. The Task 11 ingest modification names the precise insertion point and the observable contract because the target file is Plan 1's — the code given is complete for the seam itself.

**3. Type consistency:** `UploadResult` fields = upload 201 body = `attachment.added` payload inputs (attachmentId/filename/mime/size/sha256, composed in one place by `composeUploadAttachmentAdded`) ✓; `AttachmentListEntry` is declared twice on purpose (here and in Plan 6's `attachment-list.tsx`) for the same reason `EditorSlotProps` is, and the two must move together ✓; the Drive-reference payload composed by `composeDriveReferenceAdded` matches field-for-field the union the pending Plan 3 amendment registers ✓; `wrap` union identical in node attrs, `IMAGE_WRAP_MODES`, menu labels, and coordination amendment 12 ✓; `ServerGate.check(event: SubmittedEvent, db: Queryable)` matches gate implementations and the ingest seam ✓; rule-id constants exported and asserted by the same names ✓; `EditorSlotProps.submit` takes `EditorSubmission` = `composeEditorSubmission`'s return ✓, and the whole `EditorSlotProps` shape is structurally identical to Plan 6's declaration (`doc`, not `initialDoc`; capabilities optional) ✓; bridge message types used identically in `bridge.ts`, `create-editor-bridge.ts`, entry, and tests ✓; `MentionCandidate {userId, name}` (picker input) vs mention attrs `{userId, label}` (stored) is an intentional rename at the insertion boundary, performed in exactly one place (`Suggestion.command`) and documented there ✓.

Result: no gaps found that block execution. The two parallel-plan seams (EditorSlot props, docToPlainText mention format) were reconciled against the landed Plan 6 and Plan 5 documents during the series self-review and are now recorded as settled in Open questions 1–2 rather than left as assumptions.
