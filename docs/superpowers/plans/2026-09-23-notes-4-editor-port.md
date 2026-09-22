# Notes — Plan 4 of 6: Editor Port Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the one shared editor in `packages/editor` with everything the Notes page needs — task lists, a code block with a copy button, the `< ` collapsible block, wiki-links to notes, Markdown paste and copy, reading extras, and a `note` mode for the editor slot — while keeping every ticket-side surface (comment renderer, plain-text extractor, mobile WebView bundle) in step with the widened document schema.

**Architecture:** New Tiptap extensions land in `packages/editor/src/extensions/`, styled in the package's own `src/styles/editor.css` and pinned by `test/editor-css-binding.test.ts`. The document schema goes to version 2; the three tests that enumerate the schema (`schema.test.ts`, `rule-census.test.ts`, `doc-text-conformance.test.ts`) are updated in the same commits as the nodes they pin. Wiki-link data reaches the extension through the same four-link option chain mentions use (`EditorSchemaOptions` → `TicketEditorProps` → `EditorSlotProps` → app-core's twin) plus a new WebView bridge message pair. Markdown support is two pure functions ported from the knowledge-base app (`markdown-it` for parsing) wrapped in new clipboard wiring, since the source app never had clipboard wiring.

**Tech Stack:** Tiptap v3 (`^3.22.3` existing; new extensions at `^3.31.3`), ProseMirror, `markdown-it`, vitest + jsdom with a bare `Editor` test helper, vite single-file build for the mobile WebView.

**Spec:** `docs/superpowers/specs/2026-09-23-notes-design.md` §8 (and §3.5 for plain text). This plan depends on nothing else in the series and runs in parallel with Plan 1. One coordination point with Plan 1 is stated in Task 1 Step 4.

## Global Constraints

- **Branch shape.** Cut `task/notes-4-editor-port` from `origin/release/notes`. One commit per task. PR `--base release/notes` through `bash scripts/ctl/ctl pr open …`. Never push to `main` or `release/notes`.
- **Node 22; build before suites; log files, never `| head`; read the summary line** — exactly as Plan 1's Global Constraints state. `packages/editor` suites: `cd packages/editor && pnpm exec vitest run --no-file-parallelism > /tmp/notes4-editor.log 2>&1; tail -20 /tmp/notes4-editor.log`.
- **Every case: RED first, a control in the same `it`, the named mutation shown red after the commit, then restored.**
- **Case ids.** This plan owns §9 block **`9.261`–`9.300`** in `test-cases/09-editor-attachments.md` (tip measured 2026-09-23 at `9.260`; re-measure with `grep -rhoE '\b9\.[0-9]+\b' test-cases apps packages | sort -t. -k2 -n | tail -1` before minting, and record the block at the top of that file in Task 1). Notes-specific cases (wiki-link to notes, note mode) also live here; Plan 5 cites them.
- **`Features.md` §9 (Editor, documents & attachments)** gets one bullet per task in the same commit.
- **CSS goes in `packages/editor/src/styles/editor.css`, never in `packages/ui/src/ui.css`** (`ui.css:6894-6928` refuses editor rules). Class names follow the file's flat style (`.editor-…`, `.ticket-editor__…`). Every new rule gets an assertion in `packages/editor/test/editor-css-binding.test.ts` using its `ruleBody`/`declared` helpers.
- **Node views are vanilla DOM**, as `mention-popup.ts` and the source's own wiki-link are. `ReactNodeViewRenderer` does not work under `createTestEditor` (`test/helpers/create-editor.ts:8-13`, a bare `new Editor(...)`).
- **The editor-slot contract is written twice — edit both or neither:** `packages/editor/src/components/TicketEditorSlot.tsx:70-131` and `packages/app-core/src/views/editor-slot.tsx`, pinned by `packages/editor/test/ticket-editor-slot.test.tsx`.
- **`apps/mobile`'s `test` script runs `generate-editor-html.mjs --check` first**, so the WebView bundle must be regenerated (Task 8) or mobile tests fail.
- **No new dependencies beyond:** `@tiptap/extension-task-list`, `@tiptap/extension-task-item`, `@tiptap/extension-details`, `@tiptap/extension-code-block` (all `^3.31.3`, MIT), `markdown-it` (`^15`) + `@types/markdown-it`. **Not** `lucide-react`, **not** Tailwind.
- **Never `AskUserQuestion`.** Line numbers were read at `release/notes` `59029e1c` + the merged docs; trust symbols.

---

## File map

| File | Responsibility |
|---|---|
| `packages/editor/package.json` | six new deps |
| `packages/editor/src/doc.ts:1`, `src/schema/versioned-document.ts:12` | `DOC_SCHEMA_VERSION = 2` |
| `packages/editor/src/schema/extensions.ts:14-26`, `:52-210` | `EditorSchemaOptions` gains `queryNotes`, `resolveNoteTitle`, `previewNote`, `onNavigateNote`, `readOnly`; extension list gains TaskList, TaskItem, CodeBlockWithCopy, Details trio, Collapsible, WikiLink, MarkdownClipboard |
| `packages/editor/src/extensions/collapsible.ts` (new) | `< ` input rule + keymap |
| `packages/editor/src/extensions/code-block-copy.ts` (new) | code block node view with a copy button |
| `packages/editor/src/extensions/wiki-link.ts` (new), `wiki-link-popup.ts` (new) | node, `[[` suggestion, popup, hover preview |
| `packages/editor/src/markdown/serializer.ts` (new), `src/extensions/markdown-clipboard.ts` (new) | `htmlToMarkdown`, `markdownToHtml`, `exportMarkdown`; paste + copy plugin |
| `packages/editor/src/reading/reading-meta.ts` (new), `src/reading/ReadingTOC.tsx` (new) | `extractReadingMeta`, `readingTimeMinutes`, TOC component |
| `packages/editor/src/components/EditorToolbar.tsx:123-176` | buttons: task item, code block, collapsible, wiki-link |
| `packages/editor/src/components/TicketEditor.tsx:14-65`, `:77-114`; `TicketEditorSlot.tsx:70-144`; `packages/app-core/src/views/editor-slot.tsx:79-140` | prop threading; `mode: 'note'`; `onDraft`/`onSave`/`saveState` |
| `packages/editor/src/webview/bridge.ts:7-19`, `src/webview/entry.tsx:54-66` | `noteQuery` / `noteResults` message pair |
| `packages/editor/src/styles/editor.css` | new rules |
| `packages/domain/src/doc-text.ts:32-45`, `:51-76` | new block types; wiki-link text |
| `packages/app-core/src/views/comment-body.tsx:168-224` | branches for the new nodes |
| `packages/editor/test/schema.test.ts:20-40`, `rule-census.test.ts:38-63`, `doc-text-conformance.test.ts:51` | pins updated |
| `apps/mobile/src/editor/editor-html.generated.ts` | regenerated bundle |
| `test-cases/09-editor-attachments.md`, `Features.md` §9 | cases and catalogue |

---

### Task 1: Dependencies, schema version 2, task lists, and the schema pins

**Files:**
- Modify: `packages/editor/package.json`; `src/doc.ts:1`; `src/schema/versioned-document.ts`; `src/schema/extensions.ts:52-210`
- Modify: `packages/editor/test/schema.test.ts:20-40`, `test/rule-census.test.ts:38-63`
- Modify (if present): `packages/domain/src/note-state.ts` (`EMPTY_NOTE_DOC.attrs.schemaVersion` → 2)
- Test: `packages/editor/test/schema-v2.test.ts` (new), `test/task-list.test.ts` (new)
- Docs: `test-cases/09-editor-attachments.md` (block header + `9.261`–`9.264`), `Features.md` §9

**Interfaces:**
- Produces: schema v2 with nodes `taskList`, `taskItem`, `details`, `detailsSummary`, `detailsContent` (wiki-link arrives in Task 5); `DOC_SCHEMA_VERSION === 2`; `emptyDoc()` returns `attrs: { schemaVersion: 2 }`; `SCHEMA_V2_NODES` exported from `test/schema.test.ts` for later tasks to extend.

- [ ] **Step 1: Record the block and the cases**

At the top of `test-cases/09-editor-attachments.md`, under its title, add:

```markdown
> **Block `9.261`–`9.300` is the notes editor port** (Plan 4, `docs/superpowers/plans/2026-09-23-notes-4-editor-port.md`), minted 2026-09-23 from the tip `9.260`.
```

Then append a section `## 9.x Notes editor port (Plan 4)` with:

```markdown
- ❌ **9.261 — schema v2 is closed and complete:** `Object.keys(editor.schema.nodes)` equals exactly the v1 list plus `taskList`, `taskItem`, `details`, `detailsSummary`, `detailsContent` (Task 5 adds `wikiLink`); marks unchanged. Mutation: drop `TaskList` from the extension list.
- ❌ **9.262 — `DOC_SCHEMA_VERSION` is 2 and `emptyDoc()` says so; a version-1 document loads and re-serialises with its own content unchanged.** Mutation: make `emptyDoc` say 1.
- ❌ **9.263 — the rule census names every new input rule per extension** (`taskItem: 1`); paste rules unchanged. Mutation: add an unregistered paste rule.
- ❌ **9.264 — typing `[ ] ` at a line start makes an unchecked task item; `[x] ` a checked one; control: `[ ]` mid-line stays text.** Mutation: disable TaskItem's input rule.
```

- [ ] **Step 2: Failing tests**

Update `test/schema.test.ts`: rename the constants to `SCHEMA_V2_NODES` / `SCHEMA_V2_MARKS`, export them, append `'taskList', 'taskItem', 'details', 'detailsSummary', 'detailsContent'` to the nodes; rename the describe to `document schema v2`; add `9.261` to the closed-vocabulary `it` name.

Update `test/rule-census.test.ts`: add `taskItem: 1` to `EXPECTED_INPUT_RULES`; prefix the `it` names with `9.263`.

`test/schema-v2.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { DOC_SCHEMA_VERSION, emptyDoc } from '../src/doc.js';
import { createTestEditor } from './helpers/create-editor.js';

describe('9.262 schema version 2', () => {
  it('9.262 emptyDoc carries version 2; a v1 document round-trips unchanged', () => {
    expect(DOC_SCHEMA_VERSION).toBe(2);
    expect(emptyDoc().attrs).toEqual({ schemaVersion: 2 });
    const v1 = { type: 'doc', attrs: { schemaVersion: 1 }, content: [
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Old' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'body', marks: [{ type: 'bold' }] }] },
    ] };
    const editor = createTestEditor(undefined, v1);
    expect(editor.getJSON().content).toEqual(v1.content); // content untouched
    editor.destroy();
  });
});
```

`test/task-list.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createTestEditor } from './helpers/create-editor.js';
import { typeText } from './helpers/type-text.js';

describe('9.264 task items by input rule', () => {
  it('9.264 [ ] and [x] at line start become task items; mid-line stays text', () => {
    const editor = createTestEditor();
    typeText(editor, '[ ] buy milk');
    let json = editor.getJSON();
    expect(json.content?.[0]?.type).toBe('taskList');
    expect(json.content?.[0]?.content?.[0]?.attrs?.checked).toBe(false);
    editor.commands.clearContent();
    typeText(editor, '[x] done');
    json = editor.getJSON();
    expect(json.content?.[0]?.content?.[0]?.attrs?.checked).toBe(true);
    editor.commands.clearContent();
    typeText(editor, 'note [ ] later'); // control
    expect(editor.getJSON().content?.[0]?.type).toBe('paragraph');
    editor.destroy();
  });
});
```

- [ ] **Step 3: Run to verify failure** — schema mismatch, `DOC_SCHEMA_VERSION` 1, `taskList` absent.

- [ ] **Step 4: Implement**

`pnpm --filter @gisik-nokma/editor add @tiptap/extension-task-list@^3.31.3 @tiptap/extension-task-item@^3.31.3 @tiptap/extension-details@^3.31.3 @tiptap/extension-code-block@^3.31.3 markdown-it@^15 && pnpm --filter @gisik-nokma/editor add -D @types/markdown-it`. `@tiptap/extension-details@3.31.3` declares no dependencies and its docs say the node "requires the DetailsSummary and DetailsContent node"; in v3 those are named exports of the same package — import `{ Details, DetailsSummary, DetailsContent }` from it. If the import fails, add `@tiptap/extension-details-summary` and `-content` at the SAME 3.x version (the 2.26 releases on npm are v2 and must not be mixed in). The extension's documented options are `persist` (default `false`), `openClassName` (default `is-open`), `renderToggleButton`, `HTMLAttributes`; its commands are `setDetails()` / `unsetDetails()`; it defines NO keyboard shortcuts, which is why Task 3 adds Enter and Backspace.

`src/doc.ts:1`: `export const DOC_SCHEMA_VERSION = 2;` (the versioned-document extension reads the constant; no change there).

`src/schema/extensions.ts`, inside the returned array after the Table family:

```ts
    TaskList,
    TaskItem.configure({ nested: true }),
    Details.configure({ persist: !options.readOnly, HTMLAttributes: { class: 'editor-details' } }),
    DetailsSummary,
    DetailsContent,
```

with `readOnly?: boolean` added to `EditorSchemaOptions` (`:14-26`), documented: "when true, toggling a collapsible changes the view only — a reader must not write the document (spec §8.4)". `TicketEditor.tsx:77-114` passes `readOnly: !props.editable`.

**Coordination with Plan 1:** if `packages/domain/src/note-state.ts` exists in your tree (Plan 1 landed), change `EMPTY_NOTE_DOC.attrs.schemaVersion` to `2` in the same commit, so `packages/editor/test/empty-doc-parity.test.ts` stays green. If it does not exist, note in the commit body that Plan 1 must set 2 when it lands (Plan 1 Task 2 already says "keep them equal").

- [ ] **Step 5: Run to verify pass** — `pnpm turbo run build --filter=@gisik-nokma/editor... && cd packages/editor && pnpm exec vitest run --no-file-parallelism > /tmp/notes4-editor.log 2>&1; tail -20 /tmp/notes4-editor.log`. Expected: schema, rule-census, schema-v2 and task-list green. `doc-text-conformance` may go red on the new blocks — that is Task 2's; if it does, note it in the commit body and fix it in Task 2 (do not skip the test).

- [ ] **Step 6: Mutations, flip, commit** — (9.261) remove `TaskList` → red; (9.262) `emptyDoc` returns 1 → red; (9.263) add `addPasteRules() { return [new PasteRule({ find: /zzz/g, handler() {} })] }` to any extension → red; (9.264) `TaskItem.extend({ addInputRules: () => [] })` → red. Flip `9.261`–`9.264`. Features §9: `- ✅ **Task lists in every document** — \`[ ] \` / \`[x] \` at a line start; schema is version 2 (\`DOC_SCHEMA_VERSION\`), version-1 documents render unchanged.`

```bash
git add packages/editor packages/domain test-cases Features.md pnpm-lock.yaml
git commit -m "Notes 4/Task 1: schema v2 with task lists and details nodes; pins updated (9.261-9.264)"
```

---

### Task 2: Plain text and the comment renderer learn the new nodes

**Files:**
- Modify: `packages/domain/src/doc-text.ts:32-45` (`BLOCK_NODE_TYPES`), `:51-76` (`render`)
- Modify: `packages/app-core/src/views/comment-body.tsx:168-224` (`renderNode`)
- Test: `packages/domain/test/doc-text.test.ts` (extend), `packages/editor/test/doc-text-conformance.test.ts:51` (extend the fixture), `packages/app-core/test/comment-body.test.tsx` (extend or create beside the existing comment tests)
- Docs: `9.265`–`9.267`

**Interfaces:**
- Consumes: schema v2 nodes (Task 1). `wikiLink` (Task 5) is handled here already so Task 5 needs no change in these two files: text = the `title` attr.
- Produces: `docToPlainText` emits one line per `taskItem`, `detailsSummary`, `detailsContent`'s children, `codeBlock`; `renderCommentBody` renders `taskList`/`taskItem` (disabled checkbox + text), `details` (`<details open?>` + `<summary>`), `wikiLink` (`<a href="/notes/<id>">title</a>`).

- [ ] **Step 1: Cases**

```markdown
- ❌ **9.265 — `docToPlainText` gives task items, details summary/content and code blocks their own lines; a wiki-link contributes its title.** Control: a paragraph unchanged. Mutation: drop `taskItem` from `BLOCK_NODE_TYPES`.
- ❌ **9.266 — the conformance suite's "every block node the schema names" case covers the v2 blocks.** Mutation: remove `details` from the fixture.
- ❌ **9.267 — `renderCommentBody` renders each new node with its chrome:** `input[type=checkbox][disabled]` for a task item (checked mirrors `attrs.checked`), `<details open>` + `<summary>` for a collapsible, `a[href="/notes/<id>"]` for a wiki-link; control: the default branch still renders an unknown node's children. Mutation: delete the `details` branch.
```

- [ ] **Step 2: Failing tests** — in `packages/domain/test/doc-text.test.ts`:

```ts
it('9.265 v2 blocks get their own lines; wiki-link contributes its title', () => {
  const doc = { type: 'doc', content: [
    { type: 'taskList', content: [
      { type: 'taskItem', attrs: { checked: false }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'buy milk' }] }] },
      { type: 'taskItem', attrs: { checked: true }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'call CA' }] }] },
    ] },
    { type: 'details', attrs: { open: false }, content: [
      { type: 'detailsSummary', content: [{ type: 'text', text: 'Why' }] },
      { type: 'detailsContent', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'because' }] }] },
    ] },
    { type: 'paragraph', content: [{ type: 'text', text: 'see ' }, { type: 'wikiLink', attrs: { noteId: 'n1', title: 'Cold room' } }] },
  ] };
  expect(docToPlainText(doc)).toBe('buy milk\ncall CA\nWhy\nbecause\nsee Cold room');
});
```

Extend the conformance fixture (`doc-text-conformance.test.ts:51`) with a `taskList` of one item and a `details` block, and the expected string accordingly. In `packages/app-core/test/comment-body.test.tsx` render `renderCommentBody(doc)` for the same doc and assert with `@testing-library/react` queries: `getAllByRole('checkbox')` length 2, second `.checked === true`, all disabled; `container.querySelector('details')?.hasAttribute('open')` false and `summary` text `Why`; `getByRole('link', { name: 'Cold room' })` has `href` `/notes/n1`; control: `{ type: 'weirdNode', content: [paragraph 'x'] }` still renders `x`.

- [ ] **Step 3: Run to verify failure.**

- [ ] **Step 4: Implement** — `doc-text.ts`: add `'taskList', 'taskItem', 'details', 'detailsSummary', 'detailsContent'` to `BLOCK_NODE_TYPES`; in `render`, before the children join, add `if (node.type === 'wikiLink') return typeof node.attrs?.title === 'string' ? node.attrs.title : '';`. `comment-body.tsx` `renderNode`: add branches, in the style of the `bulletList` branch (`:200`):

```tsx
case 'taskList':
  return <ul className="gn-comment__list gn-comment__list--tasks">{children}</ul>;
case 'taskItem':
  return (
    <li className="gn-comment__task">
      <input type="checkbox" disabled checked={node.attrs?.checked === true} readOnly />
      <span>{children}</span>
    </li>
  );
case 'details':
  return <details className="gn-comment__details" open={node.attrs?.open === true}>{children}</details>;
case 'detailsSummary':
  return <summary>{children}</summary>;
case 'detailsContent':
  return <div>{children}</div>;
case 'wikiLink': {
  const noteId = typeof node.attrs?.noteId === 'string' ? node.attrs.noteId : '';
  const title = typeof node.attrs?.title === 'string' ? node.attrs.title : noteId;
  return noteId === '' ? <span>{title}</span> : <a className="gn-comment__wikilink" href={`/notes/${noteId}`}>{title}</a>;
}
```

Add `.gn-comment__task`, `.gn-comment__details`, `.gn-comment__wikilink` rules to `packages/ui/src/ui.css` beside the existing `.gn-comment__*` rules (this is app-core's renderer, styled by ui.css — the editor-css rule does not apply here).

- [ ] **Step 5: Run to verify pass** in `packages/domain`, `packages/editor`, `packages/app-core`.

- [ ] **Step 6: Mutations, flip, commit.** Features §9: `- ⚙️ **Plain text and the read-only comment renderer understand every v2 node** (task items, collapsibles, wiki-links) — search indexing and comment display never drop content silently.`

```bash
git add packages/domain packages/editor packages/app-core packages/ui test-cases Features.md
git commit -m "Notes 4/Task 2: docToPlainText and renderCommentBody cover schema v2 (9.265-9.267)"
```

---

### Task 3: The collapsible block — `< ` input rule and keymap

**Files:**
- Create: `packages/editor/src/extensions/collapsible.ts`
- Modify: `src/schema/extensions.ts` (add `Collapsible` after `DetailsContent`), `src/styles/editor.css`, `test/rule-census.test.ts` (`collapsible: 1`)
- Test: `packages/editor/test/collapsible.test.ts`, `test/editor-css-binding.test.ts` (new assertions)
- Docs: `9.268`–`9.272`

**Interfaces:**
- Consumes: `Details`, `DetailsSummary`, `DetailsContent` (Task 1); `InputRule` from `@tiptap/core`; `typeText` helper.
- Produces: extension `Collapsible` (name `collapsible`) with one input rule and two keyboard shortcuts; document shape `details(open) > detailsSummary + detailsContent > paragraph+`.

- [ ] **Step 1: Cases**

```markdown
- ❌ **9.268 — `< ` at the start of an empty line becomes a collapsible: `details(open=true) > detailsSummary(empty) + detailsContent > paragraph`, cursor in the summary; the rest of the typed line lands in the summary.** Control: `<div>` stays a paragraph; `abc< ` stays a paragraph. Mutation: change the regex to `/^<$/`.
- ❌ **9.269 — Enter in the summary moves the cursor into the content's first paragraph.** Mutation: remove the Enter shortcut.
- ❌ **9.270 — Enter on an empty paragraph that is the last child of the content exits the block: the empty paragraph is removed and a paragraph follows the `details` node.** Mutation: remove the exit branch.
- ❌ **9.271 — the `open` attribute is part of the document: `editor.commands.updateAttributes('details', { open: false })` changes `getJSON()`; and with `readOnly: true` the Details extension is configured `persist: false`.** Mutation: configure `persist: false` for editors.
- ❌ **9.272 — `editor.css` has `.editor-details` (border, radius, padding) and `.editor-details > summary` (cursor: pointer).** Mutation: delete the summary rule.
```

- [ ] **Step 2: Failing tests** — `test/collapsible.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createTestEditor } from './helpers/create-editor.js';
import { typeText } from './helpers/type-text.js';

describe('9.268-9.271 collapsible block', () => {
  it('9.268 "< " opens a details block; "<div>" and "abc< " do not', () => {
    const editor = createTestEditor();
    typeText(editor, '< Why it broke');
    const first = editor.getJSON().content?.[0];
    expect(first?.type).toBe('details');
    expect(first?.attrs?.open).toBe(true);
    expect(first?.content?.[0]?.type).toBe('detailsSummary');
    expect(first?.content?.[0]?.content?.[0]?.text).toBe('Why it broke');
    expect(first?.content?.[1]?.type).toBe('detailsContent');
    editor.commands.clearContent();
    typeText(editor, '<div>');
    expect(editor.getJSON().content?.[0]?.type).toBe('paragraph');
    editor.commands.clearContent();
    typeText(editor, 'abc< ');
    expect(editor.getJSON().content?.[0]?.type).toBe('paragraph');
    editor.destroy();
  });
  it('9.269 Enter in the summary moves into the content', () => {
    const editor = createTestEditor();
    typeText(editor, '< Title');
    editor.commands.keyboardShortcut('Enter');
    const { $from } = editor.state.selection;
    expect($from.parent.type.name).toBe('paragraph');
    expect($from.node(-1).type.name).toBe('detailsContent');
    editor.destroy();
  });
  it('9.270 Enter on the empty last paragraph exits the block', () => {
    const editor = createTestEditor();
    typeText(editor, '< Title');
    editor.commands.keyboardShortcut('Enter');
    typeText(editor, 'body');
    editor.commands.keyboardShortcut('Enter'); // new empty paragraph inside content
    editor.commands.keyboardShortcut('Enter'); // exit
    const doc = editor.getJSON();
    expect(doc.content?.[0]?.type).toBe('details');
    expect(doc.content?.[0]?.content?.[1]?.content).toHaveLength(1); // the empty paragraph was removed
    expect(doc.content?.[1]?.type).toBe('paragraph');
    expect(editor.state.selection.$from.depth).toBe(1); // cursor is at top level
    editor.destroy();
  });
  it('9.271 open is document state for editors; readers get persist:false', () => {
    const editor = createTestEditor();
    typeText(editor, '< T');
    editor.commands.updateAttributes('details', { open: false });
    expect(editor.getJSON().content?.[0]?.attrs?.open).toBe(false);
    editor.destroy();
    const reader = createTestEditor({ readOnly: true });
    const details = reader.extensionManager.extensions.find((e) => e.name === 'details');
    expect(details?.options.persist).toBe(false);
    reader.destroy();
  });
});
```

In `test/editor-css-binding.test.ts` add `9.272`: `expect(declared(ruleBody(EDITOR_CSS, '.editor-details'), 'border')).not.toBeNull()` and `expect(declared(ruleBody(EDITOR_CSS, '.editor-details > summary'), 'cursor')).toBe('pointer')`.

If the Details extension's own keymap already satisfies 9.269 or 9.270, the test passes before your shortcut exists — then do NOT add a duplicate shortcut; record in the commit body which behaviour came from the extension, and keep the test.

- [ ] **Step 3: Run to verify failure.**

- [ ] **Step 4: Implement** — `src/extensions/collapsible.ts`:

```ts
import { Extension, InputRule } from '@tiptap/core';
import { TextSelection } from '@tiptap/pm/state';

export const Collapsible = Extension.create({
  name: 'collapsible',
  addInputRules() {
    return [
      new InputRule({
        find: /^<\s$/,
        handler: ({ state, range, chain }) => {
          const { $from } = state.selection;
          if ($from.parent.type.name !== 'paragraph' || $from.parentOffset !== range.to - $from.start()) return null;
          chain()
            .deleteRange(range)
            .insertContentAt(range.from - 1, {
              type: 'details', attrs: { open: true },
              content: [{ type: 'detailsSummary' }, { type: 'detailsContent', content: [{ type: 'paragraph' }] }],
            })
            .run();
          // the paragraph the rule fired in is now empty and follows the block: remove it, put the cursor in the summary
          const { tr } = this.editor.state;
          const pos = range.from - 1;
          const details = tr.doc.nodeAt(pos);
          if (details !== null) {
            const summaryPos = pos + 1;
            const after = pos + details.nodeSize;
            const trailing = tr.doc.nodeAt(after);
            if (trailing?.type.name === 'paragraph' && trailing.content.size === 0) tr.delete(after, after + trailing.nodeSize);
            tr.setSelection(TextSelection.create(tr.doc, summaryPos + 1));
            this.editor.view.dispatch(tr);
          }
          return undefined;
        },
      }),
    ];
  },
  addKeyboardShortcuts() {
    return {
      Enter: ({ editor }) => {
        const { $from, empty } = editor.state.selection;
        if (!empty) return false;
        if ($from.parent.type.name === 'detailsSummary') {
          const contentPos = $from.after() + 2; // into detailsContent's first paragraph
          return editor.chain().setTextSelection(contentPos).run();
        }
        if ($from.parent.type.name === 'paragraph' && $from.parent.content.size === 0 && $from.node(-1).type.name === 'detailsContent'
            && $from.index(-1) === $from.node(-1).childCount - 1 && $from.node(-1).childCount > 1) {
          const paraStart = $from.before();
          const detailsEnd = $from.after(-2);
          return editor.chain()
            .deleteRange({ from: paraStart, to: paraStart + $from.parent.nodeSize })
            .insertContentAt(detailsEnd - $from.parent.nodeSize, { type: 'paragraph' })
            .setTextSelection(detailsEnd - $from.parent.nodeSize + 1)
            .run();
        }
        return false;
      },
      Backspace: ({ editor }) => {
        const { $from, empty } = editor.state.selection;
        if (!empty || $from.parentOffset !== 0 || $from.parent.type.name !== 'detailsSummary') return false;
        const details = $from.node(-1);
        if (details.textContent.length !== 0) return false;
        const from = $from.before(-1);
        return editor.chain().deleteRange({ from, to: from + details.nodeSize }).insertContentAt(from, { type: 'paragraph' }).setTextSelection(from + 1).run();
      },
    };
  },
});
```

The position arithmetic above is the intent; **the tests decide**. Adjust offsets until 9.268–9.270 pass, and do not weaken a test to match the code. Add `Collapsible` to the extension list right after `DetailsContent`; add `collapsible: 1` to `EXPECTED_INPUT_RULES`. CSS in `editor.css`:

```css
.editor-details { border: 1px solid var(--gn-border, #d0d4dc); border-radius: 8px; padding: 6px 10px; margin: 8px 0; }
.editor-details > summary { cursor: pointer; font-weight: 600; }
.editor-details > summary:empty::before { content: 'Title'; opacity: 0.5; }
```

(Use whichever token name `editor.css` already uses for borders; open the file's `.ticket-editor__content` block to copy it.)

- [ ] **Step 5: Run to verify pass** (whole editor suite).

- [ ] **Step 6: Mutations, flip, commit.** Features §9: `- ✅ **A collapsible block** — start a line with \`< \`, the rest of the line is the title, Enter moves into the body, Enter on an empty last line leaves the block; the folded state is saved with the document (spec §8.4).`

```bash
git add packages/editor test-cases Features.md
git commit -m "Notes 4/Task 3: collapsible block on '< ' with keymap and persisted open state (9.268-9.272)"
```

---

### Task 4: Code block with a copy button; toolbar buttons

**Files:**
- Create: `packages/editor/src/extensions/code-block-copy.ts`
- Modify: `src/schema/extensions.ts` (`StarterKit.configure({ codeBlock: false })` + `CodeBlockWithCopy`), `src/components/EditorToolbar.tsx:123-176`, `src/styles/editor.css`, `test/rule-census.test.ts` (unchanged counts — `codeBlock: 2` stays; verify)
- Test: `packages/editor/test/code-block-copy.test.ts`, `test/editor-toolbar.test.tsx` (extend), `test/editor-css-binding.test.ts`
- Docs: `9.273`–`9.275`

**Interfaces:**
- Consumes: `CodeBlock` from `@tiptap/extension-code-block`; node view API (`addNodeView` returning `{ dom, contentDOM }`).
- Produces: `CodeBlockWithCopy` (node name stays `codeBlock`); toolbar entries with keys `task`, `codeBlock`, `collapsible` (wiki-link button is Task 5).

- [ ] **Step 1: Cases**

```markdown
- ❌ **9.273 — a code block renders a `button.editor-codeblock__copy[aria-label="Copy code"]` outside the editable content; clicking it writes the block's text to `navigator.clipboard.writeText`; the node is still named `codeBlock` and its two input rules survive.** Mutation: drop the button.
- ❌ **9.274 — the toolbar gains Task item, Code block and Collapsible buttons that run the matching commands; control: Bold still toggles bold.** Mutation: remove the `task` entry.
- ❌ **9.275 — `editor.css` styles `.editor-codeblock` (position: relative) and `.editor-codeblock__copy` (position: absolute).** Mutation: delete the copy rule.
```

- [ ] **Step 2: Failing tests** — `test/code-block-copy.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { createTestEditor } from './helpers/create-editor.js';

describe('9.273 code block copy button', () => {
  it('9.273 renders a copy button that writes the text; node name and rules unchanged', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(globalThis.navigator, 'clipboard', { value: { writeText }, configurable: true });
    const editor = createTestEditor(undefined, { type: 'doc', content: [{ type: 'codeBlock', content: [{ type: 'text', text: 'npm run gst' }] }] });
    const button = editor.view.dom.querySelector<HTMLButtonElement>('button.editor-codeblock__copy');
    expect(button?.getAttribute('aria-label')).toBe('Copy code');
    expect(button?.getAttribute('contenteditable')).toBe('false');
    button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await Promise.resolve();
    expect(writeText).toHaveBeenCalledWith('npm run gst');
    expect(editor.schema.nodes['codeBlock']).toBeDefined();
    editor.destroy();
  });
});
```

Toolbar (`test/editor-toolbar.test.tsx`, follow the file's existing render helper): assert buttons named `Task item`, `Code block`, `Collapsible` exist and, clicked, produce a `taskList` / `codeBlock` / `details` node in `editor.getJSON()`; control `Bold`. CSS binding: `9.275`.

- [ ] **Step 3: Run to verify failure.**

- [ ] **Step 4: Implement** — `code-block-copy.ts`:

```ts
import { CodeBlock } from '@tiptap/extension-code-block';

export const CodeBlockWithCopy = CodeBlock.extend({
  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement('div');
      dom.className = 'editor-codeblock';
      const pre = document.createElement('pre');
      const code = document.createElement('code');
      if (node.attrs.language) code.className = `language-${node.attrs.language}`;
      pre.appendChild(code);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'editor-codeblock__copy';
      button.setAttribute('aria-label', 'Copy code');
      button.setAttribute('contenteditable', 'false');
      button.textContent = 'Copy';
      button.addEventListener('mousedown', (e) => e.preventDefault());
      button.addEventListener('click', () => {
        const text = code.textContent ?? '';
        const done = () => { button.textContent = 'Copied'; setTimeout(() => { button.textContent = 'Copy'; }, 1500); };
        if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(done, () => {});
        else { const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); done(); }
      });
      dom.append(pre, button);
      return { dom, contentDOM: code, ignoreMutation: (m) => m.target === button || button.contains(m.target as Node) };
    };
  },
});
```

`extensions.ts`: `StarterKit.configure({ document: false, link: false, underline: false, codeBlock: false })` and add `CodeBlockWithCopy` next to `Collapsible`. Toolbar entries (in `controls`, `:123-176`, same shape as `bold`): `{ key: 'task', label: '☐', name: 'Task item', active: editor.isActive('taskItem'), run: () => editor.chain().focus().toggleTaskList().run() }`, `{ key: 'codeBlock', label: '</>', name: 'Code block', active: editor.isActive('codeBlock'), run: () => editor.chain().focus().toggleCodeBlock().run() }`, `{ key: 'collapsible', label: '▸', name: 'Collapsible', active: editor.isActive('details'), run: () => editor.chain().focus().setDetails().run() }` (`setDetails` is the Details extension's command; if absent at this version, insert the same content Task 3's input rule inserts). CSS: `.editor-codeblock { position: relative; }`, `.editor-codeblock__copy { position: absolute; top: 6px; right: 6px; … }`.

- [ ] **Step 5: Run to verify pass** (whole editor suite; the rule census must still say `codeBlock: 2`).

- [ ] **Step 6: Mutations, flip, commit.** Features §9: `- ✅ **Code blocks carry a Copy button; toolbar buttons for task item, code block and collapsible.**`

```bash
git add packages/editor test-cases Features.md
git commit -m "Notes 4/Task 4: code block copy button and toolbar buttons (9.273-9.275)"
```

---

### Task 5: Wiki-links to notes — node, `[[` suggestion, popup, threading, WebView bridge

**Files:**
- Create: `packages/editor/src/extensions/wiki-link.ts`, `src/extensions/wiki-link-popup.ts`
- Modify: `src/schema/extensions.ts:14-26` (options), extension list; `src/components/TicketEditor.tsx:14-65`, `:77-114`; `src/components/TicketEditorSlot.tsx:70-144`; `packages/app-core/src/views/editor-slot.tsx:79-140`; `src/components/EditorToolbar.tsx`; `src/webview/bridge.ts:7-19`, `src/webview/entry.tsx:54-66`; `src/styles/editor.css`; `test/schema.test.ts` (add `wikiLink`); `test/rule-census.test.ts` (unchanged: the suggestion is a plugin, not a rule); `test/setup.ts` (polyfills)
- Test: `packages/editor/test/wiki-link.test.ts`, `test/ticket-editor-slot.test.tsx` (the twin transcription), `test/webview-bridge.test.ts` (extend), `test/editor-css-binding.test.ts`
- Docs: `9.276`–`9.282`

**Interfaces:**
- Consumes: `Suggestion` from `@tiptap/suggestion` and the mention pattern (`src/extensions/mention.ts:152-262`, popup `mention-popup.ts`); `propsRef` pattern (`TicketEditor.tsx:72-75`).
- Produces:
  - Node `wikiLink` (inline, atom) with attrs `{ noteId: string; title: string }`; HTML `<a data-note-id data-note-title class="editor-wikilink[ editor-wikilink--missing]" href="/notes/<id>">title</a>`.
  - Options on `EditorSchemaOptions`: `queryNotes?: (query: string) => Promise<NoteLinkCandidate[]>`; `resolveNoteTitle?: (noteId: string) => string | null`; `previewNote?: (noteId: string) => Promise<string | null>`; `onNavigateNote?: (noteId: string) => void`. `export type NoteLinkCandidate = { noteId: string; title: string }`.
  - The same four props on `TicketEditorProps`, `EditorSlotProps` and app-core's twin (all optional; default query returns `[]`, default resolve returns the stored title).
  - Command `insertWikiLink({ noteId, title })`.
  - Bridge messages: host→editor `{ type: 'noteResults', requestId, candidates }`; editor→host `{ type: 'noteQuery', requestId, query }`, mirroring `mentionQuery`/`mentionResults`; `EDITOR_BRIDGE_VERSION` stays 1 (additive).

- [ ] **Step 1: Cases**

```markdown
- ❌ **9.276 — typing `[[co` calls `queryNotes('co')` and the popup lists the candidates; Enter inserts `wikiLink { noteId, title }` followed by a space; Escape leaves `[[co` as text.** Mutation: drop the `char` config.
- ❌ **9.277 — the rendered link shows `resolveNoteTitle(noteId)` when it returns a string (rename-following) and the stored title when it returns `undefined`… (resolver absent).** Mutation: always render the stored title.
- ❌ **9.278 — when `resolveNoteTitle` returns `null` the node renders as `span.editor-wikilink--missing` with no `href`.** Mutation: render an `<a>` anyway.
- ❌ **9.279 — `docToPlainText` sees the title (already Task 2) and `getJSON()` stores exactly `{ noteId, title }`.** Mutation: add a third attr.
- ❌ **9.280 — the four options thread through `TicketEditorProps` and both `EditorSlotProps`; the twin-transcription test in `ticket-editor-slot.test.tsx` is extended and green.** Mutation: drop one prop from app-core's twin.
- ❌ **9.281 — the WebView bridge parses `noteResults` and serialises `noteQuery`; an unknown type is still refused (control).** Mutation: drop the `noteResults` case from `parseHostMessage`.
- ❌ **9.282 — `editor.css` styles `.editor-wikilink` and `.editor-wikilink--missing` (distinct color).** Mutation: delete the missing rule.
```

- [ ] **Step 2: Failing tests** — `test/setup.ts`: add the polyfills the suggestion popup needs under jsdom (`Range.prototype.getClientRects`, `getBoundingClientRect`, `Element.prototype.scrollIntoView`, a no-op `ResizeObserver`), copied from `/Users/kiro/my_projects/knowledge-base/src/test/setup.ts`. Then `test/wiki-link.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { createTestEditor } from './helpers/create-editor.js';
import { typeText } from './helpers/type-text.js';

const NOTES = [{ noteId: 'n1', title: 'Cold room' }, { noteId: 'n2', title: 'Compressor log' }];

describe('9.276-9.279 wiki-links', () => {
  it('9.276 [[ opens the suggestion; Enter inserts the node; Escape keeps the text', async () => {
    const queryNotes = vi.fn(async (q: string) => NOTES.filter((n) => n.title.toLowerCase().includes(q.toLowerCase())));
    const editor = createTestEditor({ queryNotes });
    typeText(editor, 'see [[co');
    await vi.waitFor(() => expect(queryNotes).toHaveBeenCalledWith('co'));
    await vi.waitFor(() => expect(document.querySelector('.wikilink-popup')).not.toBeNull());
    editor.view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    const para = editor.getJSON().content?.[0];
    const link = para?.content?.find((n) => n.type === 'wikiLink');
    expect(link?.attrs).toEqual({ noteId: 'n1', title: 'Cold room' });
    editor.commands.clearContent();
    typeText(editor, '[[co');
    editor.view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(editor.getText()).toBe('[[co');
    editor.destroy();
  });
  it('9.277/9.278 rendering follows the resolver: live title, stored title, or the missing pill', () => {
    const doc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'wikiLink', attrs: { noteId: 'n1', title: 'Old title' } }] }] };
    const live = createTestEditor({ resolveNoteTitle: () => 'New title' }, doc);
    expect(live.view.dom.querySelector('a.editor-wikilink')?.textContent).toBe('New title');
    expect(live.view.dom.querySelector('a.editor-wikilink')?.getAttribute('href')).toBe('/notes/n1');
    live.destroy();
    const plain = createTestEditor(undefined, doc);
    expect(plain.view.dom.querySelector('a.editor-wikilink')?.textContent).toBe('Old title');
    plain.destroy();
    const missing = createTestEditor({ resolveNoteTitle: () => null }, doc);
    const pill = missing.view.dom.querySelector('.editor-wikilink--missing');
    expect(pill?.tagName).toBe('SPAN');
    expect(pill?.getAttribute('href')).toBeNull();
    expect(pill?.textContent).toBe('Old title');
    missing.destroy();
  });
  it('9.279 the stored attrs are exactly noteId and title', () => {
    const editor = createTestEditor();
    editor.commands.insertWikiLink({ noteId: 'n2', title: 'Compressor log' });
    const link = editor.getJSON().content?.[0]?.content?.find((n) => n.type === 'wikiLink');
    expect(Object.keys(link?.attrs ?? {}).sort()).toEqual(['noteId', 'title']);
    editor.destroy();
  });
});
```

`ticket-editor-slot.test.tsx`: extend the type-level transcription with the four props (9.280). `webview-bridge.test.ts`: parse `{ type: 'noteResults', requestId: 'r1', candidates: NOTES }` → ok; serialise `{ type: 'noteQuery', requestId: 'r1', query: 'co' }`; control: `{ type: 'bogus' }` refused (9.281). CSS binding 9.282.

- [ ] **Step 3: Run to verify failure.**

- [ ] **Step 4: Implement** — `wiki-link.ts`, modelled line-for-line on `mention.ts:152-262`:

```ts
import { mergeAttributes, Node } from '@tiptap/core';
import { PluginKey } from '@tiptap/pm/state';
import Suggestion from '@tiptap/suggestion';
import { createWikiLinkPopup } from './wiki-link-popup.js';

export type NoteLinkCandidate = { noteId: string; title: string };
export type WikiLinkOptions = {
  queryNotes: (query: string) => Promise<NoteLinkCandidate[]>;
  resolveNoteTitle?: (noteId: string) => string | null;
  previewNote?: (noteId: string) => Promise<string | null>;
  onNavigateNote?: (noteId: string) => void;
};
export const wikiLinkSuggestionKey = new PluginKey('wikiLinkSuggestion');

declare module '@tiptap/core' {
  interface Commands<ReturnType> { wikiLink: { insertWikiLink: (attrs: NoteLinkCandidate) => ReturnType } }
}

export const WikiLink = Node.create<WikiLinkOptions>({
  name: 'wikiLink', group: 'inline', inline: true, atom: true, selectable: true,
  addOptions() { return { queryNotes: async () => [] }; },
  addAttributes() {
    return {
      noteId: { default: '', parseHTML: (el) => el.getAttribute('data-note-id') ?? '', renderHTML: (a) => ({ 'data-note-id': a.noteId }) },
      title: { default: '', parseHTML: (el) => el.getAttribute('data-note-title') ?? el.textContent ?? '', renderHTML: (a) => ({ 'data-note-title': a.title }) },
    };
  },
  parseHTML() { return [{ tag: 'a[data-note-id]' }, { tag: 'span[data-note-id]' }]; },
  renderHTML({ node, HTMLAttributes }) {
    return ['a', mergeAttributes(HTMLAttributes, { class: 'editor-wikilink', href: `/notes/${node.attrs.noteId}` }), node.attrs.title];
  },
  addNodeView() {
    return ({ node }) => {
      const resolved = this.options.resolveNoteTitle === undefined ? node.attrs.title : this.options.resolveNoteTitle(node.attrs.noteId);
      const missing = resolved === null;
      const dom = document.createElement(missing ? 'span' : 'a');
      dom.className = missing ? 'editor-wikilink editor-wikilink--missing' : 'editor-wikilink';
      dom.setAttribute('data-note-id', node.attrs.noteId);
      dom.setAttribute('data-note-title', node.attrs.title);
      dom.textContent = missing ? node.attrs.title : resolved;
      if (!missing) {
        dom.setAttribute('href', `/notes/${node.attrs.noteId}`);
        dom.addEventListener('click', (e) => { if (this.options.onNavigateNote) { e.preventDefault(); this.options.onNavigateNote(node.attrs.noteId); } });
        if (this.options.previewNote) attachHoverPreview(dom, () => this.options.previewNote!(node.attrs.noteId));
      }
      return { dom };
    };
  },
  addCommands() {
    return { insertWikiLink: (attrs) => ({ chain }) => chain().insertContent([{ type: this.name, attrs }, { type: 'text', text: ' ' }]).run() };
  },
  addProseMirrorPlugins() {
    return [Suggestion<NoteLinkCandidate, NoteLinkCandidate>({
      editor: this.editor, pluginKey: wikiLinkSuggestionKey, char: '[[', allowSpaces: true,
      items: async ({ query }) => (await this.options.queryNotes(query)).slice(0, 8),
      command: ({ editor, range, props }) => { editor.chain().focus().deleteRange(range).insertWikiLink(props).run(); },
      render: () => createWikiLinkPopup(),
    })];
  },
});
```

`attachHoverPreview(el, load)` (same file): on `mouseenter` start a 400 ms timer; on fire, `load()` and show a `div.wikilink-preview` positioned under the element with the first 200 characters (or nothing on `null`); remove on `mouseleave`. `wiki-link-popup.ts`: copy `mention-popup.ts` (229 lines) with class names `wikilink-popup`, `wikilink-popup__item`, `--active`, listing `title`. Options threading: `EditorSchemaOptions` gains the four; `extensions.ts` adds `WikiLink.configure({ queryNotes: options.queryNotes ?? (async () => []), ...(options.resolveNoteTitle ? { resolveNoteTitle: options.resolveNoteTitle } : {}), ...(options.previewNote ? { previewNote: options.previewNote } : {}), ...(options.onNavigateNote ? { onNavigateNote: options.onNavigateNote } : {}) })` (conditional spreads, the `TicketImage` reason at `:167-169`); `TicketEditor.tsx` passes `queryNotes: (q) => propsRef.current.queryNotes?.(q) ?? Promise.resolve([])` and the others via `propsRef`; `TicketEditorSlot.tsx` and app-core's `editor-slot.tsx` gain the four optional props with identical docblocks. Toolbar: `{ key: 'wikiLink', label: '[[', name: 'Link a note', run: () => editor.chain().focus().insertContent('[[').run() }`. Bridge: add the two message variants to the unions (`bridge.ts:7-19`), `parseHostMessage` case, `serializeEditorMessage` pass-through; `entry.tsx` wires `queryNotes` as it wires `queryUsers` (a pending-request map keyed by `requestId`). CSS: `.editor-wikilink { … }`, `.editor-wikilink--missing { color: …; background: …; }`, `.wikilink-popup*`, `.wikilink-preview`.

Add `'wikiLink'` to `SCHEMA_V2_NODES`.

- [ ] **Step 5: Run to verify pass** in `packages/editor` and `packages/app-core`; `pnpm typecheck`.

- [ ] **Step 6: Mutations, flip, commit.** Features §9: `- ✅ **Wiki-links between notes** — type \`[[\` to pick a note; the link stores the note id, follows renames, and shows a red pill when the target is gone or unreadable (spec §8.5).`

```bash
git add packages/editor packages/app-core test-cases Features.md
git commit -m "Notes 4/Task 5: wiki-links to notes with [[ suggestion, prop threading and bridge messages (9.276-9.282)"
```

---

### Task 6: Markdown paste, Markdown copy, Markdown export

**Files:**
- Create: `packages/editor/src/markdown/serializer.ts` (ported from `/Users/kiro/my_projects/knowledge-base/src/app/knowledge_base/features/document/extensions/markdownSerializer.ts`), `src/extensions/markdown-clipboard.ts`
- Modify: `src/schema/extensions.ts` (add `MarkdownClipboard`), `src/index.ts` (export `exportMarkdown`)
- Test: `packages/editor/test/markdown-serializer.test.ts` (port of the source's 283-line suite, re-keyed), `test/markdown-clipboard.test.ts`
- Docs: `9.283`–`9.287`

**Interfaces:**
- Consumes: `markdown-it`; the DOM (`DOMParser`) for HTML→Markdown; `DOMSerializer` from `@tiptap/pm/model` for slice→HTML.
- Produces: `htmlToMarkdown(html): string`, `markdownToHtml(md): string`, `exportMarkdown(doc: unknown): string` (renders the doc with the editor schema's `DOMSerializer`, then `htmlToMarkdown`); `looksLikeMarkdown(text): boolean`; extension `MarkdownClipboard` providing `editorProps.handlePaste` and `editorProps.clipboardTextSerializer`.

- [ ] **Step 1: Cases**

```markdown
- ❌ **9.283 — `htmlToMarkdown` and `markdownToHtml` pass the ported source cases** (headings, lists, task items, code with language, blockquote, links, images, tables, hr) re-keyed for `<a data-note-id>` wiki-links (`[[Title]]`) and **with `<details><summary>`** in both directions. Mutation: drop the `details` case from `nodeToMarkdown`.
- ❌ **9.284 — `looksLikeMarkdown` is true for a line starting with `# `, `- `, `* `, `1. `, `> `, three backticks, or text containing `**` or `[[`; false for `hello world`, `a < b`, `10 * 3`.** Mutation: match `*` anywhere.
- ❌ **9.285 — pasting plain text that looks like Markdown (no `text/html` on the clipboard) inserts heading/list/bold nodes; control: the same text with `text/html` present is inserted by the default handler (as a paragraph), and plain non-Markdown text stays a paragraph.** Mutation: ignore the `text/html` check.
- ❌ **9.286 — copying a selection puts Markdown in the plain-text flavour: `clipboardTextSerializer` returns `## H\n\n- a\n- b\n\n**bold**` for that content.** Mutation: return `slice.content.textBetween`.
- ❌ **9.287 — round trip: a document with heading, bullet list, task list, code block, details, bold and a link → `exportMarkdown` → `markdownToHtml` → editor → `getJSON()` equals the original (ignoring `wikiLink`, which becomes text).** Mutation: drop task items from `markdownToHtml`'s checkbox rewrite.
```

- [ ] **Step 2: Failing tests** — port `markdownSerializer.test.ts` case by case into `test/markdown-serializer.test.ts` (keep its case numbers in the `it` names as `DOC-4.4-NN` after the `9.283` prefix), replacing the wiki-link cases with `<a data-note-id="n1" data-note-title="Cold room">` ↔ `[[Cold room]]`, adding `<details open><summary>T</summary><p>b</p></details>` ↔ `<details open>\n<summary>T</summary>\n\nb\n\n</details>`. `test/markdown-clipboard.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createTestEditor } from './helpers/create-editor.js';
import { looksLikeMarkdown } from '../src/markdown/serializer.js';

function paste(editor: ReturnType<typeof createTestEditor>, text: string, html?: string) {
  const dt = { getData: (t: string) => (t === 'text/html' ? (html ?? '') : t === 'text/plain' ? text : ''), types: html ? ['text/html', 'text/plain'] : ['text/plain'] };
  const event = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent;
  Object.defineProperty(event, 'clipboardData', { value: dt });
  editor.view.dom.dispatchEvent(event);
}
describe('9.284-9.286 markdown clipboard', () => {
  it('9.284 looksLikeMarkdown', () => {
    for (const t of ['# H', '- a', '* a', '1. a', '> q', '```\nx\n```', 'x **y** z', 'see [[Cold']) expect(looksLikeMarkdown(t), t).toBe(true);
    for (const t of ['hello world', 'a < b', '10 * 3']) expect(looksLikeMarkdown(t), t).toBe(false);
  });
  it('9.285 plain markdown paste converts; html paste and plain prose do not', () => {
    const editor = createTestEditor();
    paste(editor, '# H\n\n- a\n\n**b**');
    const types = editor.getJSON().content?.map((n) => n.type);
    expect(types).toEqual(['heading', 'bulletList', 'paragraph']);
    editor.commands.clearContent();
    paste(editor, '# H', '<p># H</p>');
    expect(editor.getJSON().content?.[0]?.type).toBe('paragraph');
    editor.commands.clearContent();
    paste(editor, 'hello world');
    expect(editor.getJSON().content?.[0]?.type).toBe('paragraph');
    editor.destroy();
  });
  it('9.286 the plain-text clipboard flavour is Markdown', () => {
    const editor = createTestEditor(undefined, { type: 'doc', content: [
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'H' }] },
      { type: 'bulletList', content: [
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'a' }] }] },
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'b' }] }] } ] },
      { type: 'paragraph', content: [{ type: 'text', text: 'bold', marks: [{ type: 'bold' }] }] },
    ] });
    editor.commands.selectAll();
    const serialize = editor.view.someProp('clipboardTextSerializer');
    expect(serialize).toBeDefined();
    const text = serialize!(editor.state.selection.content(), editor.view);
    expect(text).toBe('## H\n\n- a\n- b\n\n**bold**');
    editor.destroy();
  });
});
```

Plus a `9.287` round-trip test in the same file using `exportMarkdown(editor.getJSON())` and `editor.commands.setContent(markdownToHtml(md))`.

- [ ] **Step 3: Run to verify failure.**

- [ ] **Step 4: Implement** — copy the serializer, re-key the wiki-link `span` handling to `a[data-note-id]` / `[[title]]`, add `details`/`summary` cases (HTML passthrough on the Markdown side, since `markdown-it` is configured `html: true`), export `looksLikeMarkdown` with the exact heuristic of 9.284 (line-start regex `/^(#{1,6} |[-*] |\d+\. |> |```)/m` or `/\*\*|\[\[/`). `markdown-clipboard.ts`:

```ts
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { DOMSerializer } from '@tiptap/pm/model';
import { htmlToMarkdown, looksLikeMarkdown, markdownToHtml } from '../markdown/serializer.js';

export const MarkdownClipboard = Extension.create({
  name: 'markdownClipboard',
  addProseMirrorPlugins() {
    const editor = this.editor;
    return [new Plugin({
      key: new PluginKey('markdownClipboard'),
      props: {
        handlePaste(view, event) {
          const data = event.clipboardData;
          if (!data || data.types.includes('text/html')) return false;
          const text = data.getData('text/plain');
          if (!looksLikeMarkdown(text)) return false;
          editor.commands.insertContent(markdownToHtml(text));
          return true;
        },
        clipboardTextSerializer(slice) {
          const serializer = DOMSerializer.fromSchema(editor.schema);
          const container = document.createElement('div');
          container.appendChild(serializer.serializeFragment(slice.content));
          return htmlToMarkdown(container.innerHTML);
        },
      },
    })];
  },
});
```

`exportMarkdown(doc)`: build a `Node` from JSON with the schema (`createTestEditor` is test-only; in `src/` use `Node.fromJSON(schema, doc)` with a schema built from `buildEditorExtensions()` via `getSchema` from `@tiptap/core`), serialize with `DOMSerializer`, then `htmlToMarkdown`. Add `MarkdownClipboard` to the extension list.

- [ ] **Step 5: Run to verify pass.**

- [ ] **Step 6: Mutations, flip, commit.** Features §9: `- ✅ **Markdown in and out** — pasting Markdown text converts it; copying formatted content puts Markdown in the plain-text clipboard; \`exportMarkdown\` for a whole document (spec §8.6).`

```bash
git add packages/editor test-cases Features.md pnpm-lock.yaml
git commit -m "Notes 4/Task 6: Markdown paste, copy and export around the ported serializer (9.283-9.287)"
```

---

### Task 7: Reading extras — reading meta and the TOC

**Files:**
- Create: `packages/editor/src/reading/reading-meta.ts`, `src/reading/ReadingTOC.tsx`
- Modify: `src/index.ts` (exports), `src/styles/editor.css`
- Test: `packages/editor/test/reading-meta.test.ts`, `test/reading-toc.test.tsx`, `test/editor-css-binding.test.ts`
- Docs: `9.288`–`9.290`

**Interfaces:**
- Consumes: the rendered editor DOM (`editor.view.dom`).
- Produces: `extractReadingMeta(root: HTMLElement): ReadingMeta` where `ReadingMeta = { wordCount: number; headings: { id: string; level: 1 | 2 | 3; text: string }[] }` (stamps `id` on the heading elements, slug + collision suffix, ported from the source's `extractReadingMeta`, `MarkdownEditor.tsx:186-211`); `readingTimeMinutes(wordCount): number` (`Math.max(1, Math.round(n / 200))`, 0 for 0 words); `ReadingTOC({ headings, scrollContainerRef })` (ported from the source's `ReadingTOC.tsx:8-17`, visibility rules: hidden below 3 headings; the width rule is the page's, not the component's).

- [ ] **Step 1: Cases**

```markdown
- ❌ **9.288 — `extractReadingMeta` counts words and lists h1–h3 with stable slug ids; two headings with the same text get `-2` suffixes; the ids are stamped on the elements.** Mutation: stop suffixing.
- ❌ **9.289 — `readingTimeMinutes`: 0→0, 1→1, 199→1, 300→2.** Mutation: drop the `max(1, …)`.
- ❌ **9.290 — `ReadingTOC` renders nothing under 3 headings and a `nav[aria-label="On this page"]` with one link per heading otherwise.** Mutation: render at 2.
```

- [ ] **Step 2–6:** tests per the cases (render the TOC with `@testing-library/react`), the port, CSS `.reading-toc*`, mutations, flip, commit `Notes 4/Task 7: reading meta and table of contents (9.288-9.290)`. Features §9: `- ✅ **Reading extras for long documents** — word count, reading time and a table of contents (used by the Notes page).`

---

### Task 8: The `note` slot mode, and the mobile bundle

**Files:**
- Modify: `packages/editor/src/components/TicketEditorSlot.tsx:70-144` and `packages/app-core/src/views/editor-slot.tsx:79-140` (`mode: 'comment' | 'description' | 'note'`; `onDraft?: (doc: unknown) => void`; `onSave?: (doc: unknown) => void`; `saveState?: 'saved' | 'saving' | 'unsaved'`); `TicketEditorSlot.tsx:220`, `:254` (mode branches)
- Modify: `apps/mobile/src/editor/editor-html.generated.ts` via `pnpm --filter @gisik-nokma/editor build:webview && pnpm --filter mobile generate:editor-html` (open `apps/mobile/package.json` for the exact script names)
- Test: `packages/editor/test/ticket-editor-slot.test.tsx` (extend), `apps/mobile` test run
- Docs: `9.291`–`9.294`

**Interfaces:**
- Produces: in `note` mode the slot renders the toolbar, no submit button and no Markdown hint; calls `onDraft(doc)` on every document change and `onSave(doc)` on blur; `saveState` is rendered as text in the slot footer with `data-testid="editor-save-state"` (`Saved` / `Saving…` / `Not saved (kept on this device)`), which Plan 5 reads. `EditorSlotSubmission` (`editor-slot.tsx:79-81`) gains `{ type: 'note.body_set'; body: unknown }` for completeness, though note mode does not use `submit`.

- [ ] **Step 1: Cases**

```markdown
- ❌ **9.291 — note mode: toolbar present, no submit button, no Markdown hint; `onDraft` fires on each change with the current `getJSON()`; `onSave` fires on blur.** Control: comment mode still renders the submit button. Mutation: call `onSave` on every change.
- ❌ **9.292 — `saveState` renders the three texts under `data-testid="editor-save-state"`.** Mutation: swap two texts.
- ❌ **9.293 — the twin transcription in `ticket-editor-slot.test.tsx` covers `mode: 'note'`, `onDraft`, `onSave`, `saveState` in both files.** Mutation: drop `saveState` from app-core's twin.
- ❌ **9.294 — the regenerated WebView bundle contains the v2 nodes (`grep -c 'detailsSummary' apps/mobile/src/editor/editor-html.generated.ts` ≥ 1) and `apps/mobile`'s `--check` passes.** Mutation: revert the generated file.
```

- [ ] **Step 2–6:** tests in the slot suite's existing style (it mounts `TicketEditorSlot` with React Testing Library — copy its `render` helper), the implementation in both twins with identical docblocks, the bundle regeneration, `cd apps/mobile && pnpm test > /tmp/notes4-mobile.log 2>&1; tail -20 /tmp/notes4-mobile.log`, mutations, flip, commit `Notes 4/Task 8: note slot mode and the regenerated WebView bundle (9.291-9.294)`. Features §9: `- ⚙️ **The editor slot has a \`note\` mode** — autosave hooks (\`onDraft\`, \`onSave\`, \`saveState\`) instead of a submit button; the mobile WebView bundle carries schema v2.`

---

### Task 9: Plan close — full gate, PR

- [ ] **Step 1:** `pnpm turbo run build && pnpm test > /tmp/notes4-all.log 2>&1; tail -40 /tmp/notes4-all.log`; `pnpm typecheck`; `pnpm check:citations` — all green under Node 22. Reap orphaned vitest workers at `ppid=1` only, if any.
- [ ] **Step 2:** Re-read `Features.md` §9's new bullets and `test-cases/09-editor-attachments.md`'s `9.261`–`9.294` against the tree; every `✅` has a citing test.
- [ ] **Step 3:** PR body to a lane-unique file: what landed (Tasks 1–8), block `9.261`–`9.294`, summary lines with `NODE=`, the schema-version coordination note for Plan 1, the attribution line. `bash scripts/ctl/ctl pr open task/notes-4-editor-port --repo <worktree> --base release/notes --title "Notes 4/6: editor port — schema v2, collapsibles, wiki-links, Markdown, reading extras, note mode" --body <file>`; confirm the PR head equals `git rev-parse HEAD`.

---

## Self-review against the spec

- **§8.1** deps and location → Task 1 (with the vanilla node-view constraint in Global Constraints). **§8.2** files → Tasks 3–7 (paths adjusted to this package's layout: `src/extensions/`, `src/markdown/`, `src/reading/`). **§8.3** nodes and schema v2 → Task 1 and Task 5 (`wikiLink`); consequences 1–4 → Tasks 2, 8; consequence 5 (`EditorSlotSubmission`, note mode) → Task 8. **§8.4** collapsible → Task 3 (the `persist` option realises "readers toggle the view only"). **§8.5** wiki-link → Task 5 (hover preview is `previewNote`; the page supplies it in Plan 5). **§8.6** Markdown → Task 6. **§8.7** not ported → honoured. **§3.5** plain text → Task 2. **§11.8** → Tasks 1–8.
- **Names across tasks:** `SCHEMA_V2_NODES` (T1) ← T5; `Collapsible` (T3) ← T4 toolbar; `NoteLinkCandidate`, `queryNotes`, `resolveNoteTitle`, `previewNote`, `onNavigateNote` (T5) ← Plan 5; `htmlToMarkdown`, `markdownToHtml`, `exportMarkdown`, `looksLikeMarkdown` (T6) ← Plan 5; `extractReadingMeta`, `readingTimeMinutes`, `ReadingTOC` (T7) ← Plan 5; `onDraft`, `onSave`, `saveState` (T8) ← Plan 5. Consistent with the spec's §9 component tree.
- **Deviation from the spec, recorded:** spec §8.2 named `packages/ui/src/ui.css` and `gn-editor__*` classes for editor styling; the repo's rule (`ui.css:6894-6928`) puts editor CSS in `packages/editor/src/styles/editor.css` with flat names, and this plan follows the repo. The comment renderer's new classes (`gn-comment__*`) are app-core's and do belong in `ui.css`.
