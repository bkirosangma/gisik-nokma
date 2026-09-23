# Notes — Plan 7 of 7: Inline References in Comments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In the shared editor, typing `:ticket` opens an in-place picker over tickets the person can see and inserts a ticket chip; `:note` does the same over notes and inserts the existing note link. When a ticket comment that references notes is posted, each referenced note is attached to the ticket, so its badge appears in the ticket's Notes section without reload.

**Architecture:** One new inline atom node `ticketRef` and one new suggestion trigger for it, both modelled on the mention extension; a second suggestion trigger on the existing wiki-link extension for `:note`, inserting the same `wikiLink` node. Ticket candidates come from the existing ticket search, whose server response already carries the ticket key; only the client mapper exposes it. The auto-attach is one pure function in `packages/app-core`, `attachmentsImpliedBy`, called only by the ticket sheet's comment submit, after the comment commits.

**Tech Stack:** Tiptap v3 + `@tiptap/suggestion`, vanilla-DOM popups, `packages/app-core`, vitest.

**Spec:** `docs/superpowers/specs/2026-09-23-notes-design.md` §14 (D26–D28). **Depends on:** Plans 1–6 landed (Plan 6 for the live badge the auto-attach makes appear; the editor tasks 1–4 depend only on Plan 4 and may start earlier).

## Global Constraints

- **Branch shape.** Cut `task/notes-7-inline-references` from `origin/release/notes`. One commit per task. PR `--base release/notes` through `bash scripts/ctl/ctl pr open …`.
- **Node 22; `pnpm turbo run build` before suites; log files, never `| head`; read the summary line.**
- **Every case: RED first, a control in the same `it`, the named mutation shown red after the commit, then restored.**
- **Case ids.** Editor cases: **§9 block `9.301`–`9.315`** (the §9 tip is `9.300`, spent; record the block at the top of `test-cases/09-editor-attachments.md` as Plan 4 did at `:3`). App-core, client and browser cases: **§18 block `18.271`–`18.300`**, new row `| 7 Inline references | \`18.271\`–\`18.300\` |` in `test-cases/18-notes.md:11-16`, section `## 18.13 Inline references in comments`.
- **Schema v2 pins move with the node:** `packages/editor/test/schema.test.ts:26-52` (`SCHEMA_V2_NODES`, exact sorted equality at `:75`), `rule-census.test.ts:38/46` (no entry needed unless you add rules), `doc-text-conformance.test.ts` (an inline-node `it`, template `:272/:293`), `comment-body` renderer, `docToPlainText`. `DOC_SCHEMA_VERSION` stays 2 (additive node).
- **The editor-slot contract is written twice and pinned by a source-parsing test** (`TicketEditorSlot.tsx:70-…`, `editor-slot.tsx:94-…`, `packages/editor/test/ticket-editor-slot.test.tsx:90-186`, case 9.293): every new prop lands in all three places.
- **`char` with a trailing space is unverified** in `@tiptap/suggestion`; use `char: ':ticket'` / `':note'` with `allowSpaces: true` and trim the query. Each `Suggestion` plugin needs its own `new PluginKey(...)` (`mention.ts:12`, `wiki-link.ts:26` are the pattern).
- **The mobile editor bundle is regenerated in the close** (the editor changes).
- **Never `AskUserQuestion`.** Line numbers read at `release/notes` `5b7f8fe9`; trust symbols.

---

## File map

| File | Responsibility |
|---|---|
| `packages/editor/src/extensions/ticket-ref.ts` (new), `ticket-ref-popup.ts` (new) | the node, its `:ticket` suggestion, the popup |
| `packages/editor/src/extensions/wiki-link.ts:155-182` | second suggestion plugin for `:note` |
| `packages/editor/src/schema/extensions.ts:25-55`, `:81` | `queryTickets?`, `resolveTicketHref?`; extension list |
| `packages/editor/src/components/TicketEditor.tsx:16-54`, `TicketEditorSlot.tsx:70-…`, `packages/app-core/src/views/editor-slot.tsx:94-…` | prop threading (three places) |
| `packages/editor/src/webview/bridge.ts:8-22`, `:136-145`, `entry.tsx:54-69`, `create-editor-bridge.ts` | `ticketQuery` / `ticketResults` |
| `packages/editor/src/styles/editor.css`, `test/editor-css-binding.test.ts` | `.editor-ticketref`, `.ticketref-popup*` |
| `packages/app-core/src/views/comment-body.tsx:256-270`, `packages/domain/src/doc-text.ts:93-98` | render + plain text |
| `packages/app-core/src/online/mappers.ts:2195-2209`, `src/view-types.ts` (`SearchHit`) | `key` on search hits |
| `packages/app-core/src/flows/attachments-implied-by.ts` (new), `src/views/ticket-sheet.tsx:1240-1267` | the auto-attach |
| `apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx`, `apps/web/src/notes/note-document.tsx` | supply `queryTickets` / `resolveTicketHref` to the slots |
| `apps/mobile/src/editor/editor-html.generated.ts` | regenerated |
| `test-cases/09-editor-attachments.md`, `test-cases/18-notes.md`, `Features.md` §15 | cases, catalogue |

---

### Task 1: The `ticketRef` node and the `:ticket` picker

**Files:**
- Create: `packages/editor/src/extensions/ticket-ref.ts`, `ticket-ref-popup.ts` (copy `mention-popup.ts:16-225`, class names `ticketref-popup`, `__list`, `__status`, `ticketRefResultAnnouncement`)
- Modify: `src/schema/extensions.ts:25-55` (options), `:81` (list), `src/styles/editor.css`, `test/schema.test.ts:26-52`, `test/editor-css-binding.test.ts`
- Test: `packages/editor/test/ticket-ref.test.ts`
- Docs: `test-cases/09-editor-attachments.md` (block line + `9.301`–`9.306`), `Features.md`

**Interfaces:**
- Consumes: `Suggestion` from `@tiptap/suggestion` as `mention.ts:221-261` uses it; `typeText` helper; `test/setup.ts` polyfills (Plan 4).
- Produces:
  - `export type TicketRefCandidate = { ticketId: string; projectId: string; key: string; title: string }`.
  - `EditorSchemaOptions` gains `queryTickets?: (query: string) => Promise<TicketRefCandidate[]>` (default `async () => []`) and `resolveTicketHref?: (ref: { ticketId: string; projectId: string }) => string | null` (default `null` → the chip renders as a `<span>` with no link).
  - Node `ticketRef`: inline, atom, selectable; attrs `ticketId`, `projectId`, `key`, `title` (strings; parse from `data-ticket-id`, `data-project-id`, `data-ticket-key`, `data-ticket-title`); `renderHTML` → `['a', { class: 'editor-ticketref', 'data-…', href }, `${key} ${title}`]` when `resolveTicketHref` gives a string, else a `span`; vanilla `addNodeView` (as `wiki-link.ts` does) so the href resolves at mount time; `renderText` → `` `${key} ${title}` ``.
  - `addProseMirrorPlugins`: `Suggestion({ editor, pluginKey: ticketRefSuggestionKey, char: ':ticket', allowSpaces: true, allow: <the code-block gate of wiki-link.ts:169>, items: async ({ query }) => (await this.options.queryTickets(query.trim())).slice(0, 8), command: ({ editor, range, props }) => editor.chain().focus().deleteRange(range).insertContent([{ type: 'ticketRef', attrs: props }, { type: 'text', text: ' ' }]).run(), render: () => createTicketRefPopup() })`. Rows show `KEY title`.

- [ ] **Step 1: Cases** (`test-cases/09-editor-attachments.md`, new block line "Block `9.301`–`9.315` is the inline references (Plan 7)")

```markdown
- ❌ **9.301 — schema v2 gains `ticketRef` and the closed-vocabulary case still passes** (the list gains exactly one name). Mutation: drop the node from the extension list.
- ❌ **9.302 — typing `:ticket comp` calls `queryTickets('comp')`, the popup lists `KEY title` rows, Enter inserts `ticketRef { ticketId, projectId, key, title }` followed by a space;** controls: `re: ticket 5` opens nothing; `:ticketfoo` opens nothing (no space after the trigger is fine, but the query is `foo` — decide and pin one behaviour: the trigger requires whitespace or end after `:ticket`, so `:ticketfoo` opens nothing). Mutation: drop `allowSpaces`.
- ❌ **9.303 — inside a code block `:ticket` opens nothing** (the shared `allow` gate). Mutation: remove `allow`.
- ❌ **9.304 — the chip renders as `a.editor-ticketref[href]` when `resolveTicketHref` returns a string and as `span.editor-ticketref` without href when it returns null;** text is `KEY title`. Mutation: always render `<a>`.
- ❌ **9.305 — Escape closes the picker leaving `:ticket comp` as text.** Mutation: delete the range on Escape.
- ❌ **9.306 — `editor.css` styles `.editor-ticketref` and `.ticketref-popup`** (binding test). Mutation: delete the popup rule.
```

- [ ] **Step 2–6:** tests in the style of `test/wiki-link.test.ts` (Plan 4); implement; run the editor suite; mutations; flip; commit `Notes 7/Task 1: ticketRef node and the :ticket picker (9.301-9.306)`. Features §15: `- ✅ **\`:ticket\` in any editor** opens a picker over tickets you can see and inserts a chip with the key and title (D26).`

---

### Task 2: The `:note` trigger on wiki-links

**Files:**
- Modify: `packages/editor/src/extensions/wiki-link.ts:155-182` (return TWO `Suggestion` plugins: the existing `[[` one and a new one with `pluginKey: noteRefSuggestionKey = new PluginKey('noteRefSuggestion')`, `char: ':note'`, `allowSpaces: true`, same `allow`, `items`, `command`, `render`)
- Test: `packages/editor/test/wiki-link.test.ts` (extend)
- Docs: `9.307`–`9.308`

```markdown
- ❌ **9.307 — `:note co` opens the wiki-link picker and Enter inserts the same `wikiLink { noteId, title }` node `[[co` would;** control: `[[` still works. Mutation: give the second plugin the first plugin's key (ProseMirror throws — the test asserts the editor constructs).
- ❌ **9.308 — `:notebook` in prose opens nothing.** Mutation: drop the whitespace requirement.
```

- [ ] Commit `Notes 7/Task 2: the :note trigger inserts the existing note link (9.307-9.308)`. Features §15: `- ✅ **\`:note\` inserts a note link**, the same one \`[[\` makes (D26).`

---

### Task 3: Prop threading, bridge messages, plain text and the comment renderer

**Files:**
- Modify: `TicketEditor.tsx:16-54` (`queryTickets?`, `resolveTicketHref?` → `buildEditorExtensions` via `propsRef`), `TicketEditorSlot.tsx:70-…` and `packages/app-core/src/views/editor-slot.tsx:94-…` (both twins), `packages/editor/test/ticket-editor-slot.test.tsx:90-134` (the transcription), `src/webview/bridge.ts:8-22` + `:136-145` (`ticketResults` / `ticketQuery`, copies of the note pair), `create-editor-bridge.ts` (`resolveTickets`), `entry.tsx:54-69` (proxy), `packages/domain/src/doc-text.ts:93-98` (`ticketRef` → `` `${key} ${title}` ``, an inline node — NOT in `BLOCK_NODE_TYPES`), `packages/app-core/src/views/comment-body.tsx:256-270` (`ticketRef` → `<a class="gn-comment__ticketref" href={safeHref(resolved)}>KEY title</a>` — the renderer has no href resolver: add an optional `ticketHref?: (ref) => string | null` parameter to `renderCommentBody` defaulting to a `span`; `CommentsThread` gains the same optional prop and the sheet/page pass it), `packages/editor/test/doc-text-conformance.test.ts` (new inline `it`), `packages/ui/src/ui.css` (`.gn-comment__ticketref`)
- Test: the twin test, `test/webview-bridge.test.ts`, `packages/domain/test/doc-text.test.ts`, `packages/app-core/test/comment-body.test.tsx`
- Docs: `9.309`–`9.312`

```markdown
- ❌ **9.309 — the twin transcription covers `queryTickets` and `resolveTicketHref` in both files.** Mutation: drop one from app-core's twin.
- ❌ **9.310 — the bridge parses `ticketResults` and serialises `ticketQuery`; control: an unknown type is refused.** Mutation: drop the `ticketResults` case.
- ❌ **9.311 — `docToPlainText` renders `ticketRef` as `KEY title`; a missing key falls back to the title (control in the same `it`).** Mutation: render the ticket id.
- ❌ **9.312 — `renderCommentBody` renders `ticketRef` as a link when `ticketHref` resolves and as a span otherwise;** control: `wikiLink` unchanged. Mutation: link with `href="#"`.
```

- [ ] Commit `Notes 7/Task 3: threading, bridge, plain text, comment renderer for ticketRef (9.309-9.312)`. Features §15: `- ⚙️ **Ticket references survive everywhere a document goes** — plain text, the comment renderer, the mobile bridge.`

---

### Task 4: Ticket candidates from search; the pages supply the callbacks

**Files:**
- Modify: `packages/app-core/src/online/mappers.ts:2195-2209` (`mapSearchHits` reads `card.key`), `packages/app-core/src/view-types.ts` (`SearchHit.key: string | null`), `apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx` (build `queryTickets = async (q) => (await dataSource.query.search(workspaceId, q)).map(h => ({ ticketId: h.ticketId, projectId: h.projectId, key: h.key ?? h.ticketId.slice(-6), title: h.title }))` and `resolveTicketHref = ({ ticketId, projectId }) => ticketSheetPath(workspaceId, projectId, ticketId)`; pass both into the sheet's `editorSlot` props and the `CommentsThread`'s `ticketHref`), `apps/web/src/notes/note-document.tsx` and `note-comments.tsx` (same two callbacks for the note's editor and thread)
- Test: `packages/app-core/test/online/note-mappers.test.ts` (extend or sibling), `apps/web/test/note-document.test.tsx`, the project page test that mounts the sheet
- Docs: `18.271`–`18.274`

```markdown
## 18.13 Inline references in comments

- ❌ **18.271 — `mapSearchHits` exposes `key` from the card (`null` stays `null`);** control: the other fields unchanged. Mutation: drop `key`.
- ❌ **18.272 — the project page's `queryTickets` maps search hits to candidates and its `resolveTicketHref` yields the canonical sheet path;** offline (the replica's `search` gap) the picker's status line says "Search needs a connection" and the editor still mounts. Mutation: throw on the gap.
- ❌ **18.273 — the note page supplies the same two callbacks to its editor and its comment thread.** Mutation: omit `resolveTicketHref` on the note page.
- ❌ **18.274 — a ticket chip in a rendered comment links to the ticket's page.** Mutation: link to `/notes/…`.
```

- [ ] Commit `Notes 7/Task 4: ticket candidates from search; pages supply the callbacks (18.271-18.274)`. Features §15: `- ⚙️ **The \`:ticket\` picker searches the workspace's tickets** through the existing search; the key rides on every hit.`

---

### Task 5: `attachmentsImpliedBy` and the ticket comment submit

**Files:**
- Create: `packages/app-core/src/flows/attachments-implied-by.ts`
- Modify: `packages/app-core/src/views/ticket-sheet.tsx:1240-1267` (`submitComment`)
- Test: `packages/app-core/test/flows/attachments-implied-by.test.ts`, `packages/app-core/test/views/ticket-sheet-comments.test.tsx` (extend)
- Docs: `18.275`–`18.280`

**Interfaces:**
- Produces: `attachmentsImpliedBy(body: unknown, ticketId: string, alreadyAttached: readonly string[], make): SubmittedEvent[]` — walks the document, collects distinct `wikiLink.attrs.noteId` values not in `alreadyAttached`, returns one `note.attached { ticketId }` per note filed against `{ kind: 'note', id: noteId }`; returns `[]` for a body without references. In `submitComment`: after the comment's `committed` result (`:1254`), `const implied = attachmentsImpliedBy(submission.payload.body, ticketId, attachedNoteIds, make)`; if non-empty, `await dataSource.ingest(implied)` and, for each non-committed result, push `Couldn't attach "<title>": <reason>` into a list shown by the sheet's `Toast` (Plan 6's, tone `'error'`, no undo) — the comment stays posted (D28). `attachedNoteIds` comes from the section's live query (lift it: the sheet owns the `<ticketId>:notes` query and passes `data` to both the section and `submitComment`). Note comments (`apps/web/src/notes/note-comments.tsx`) do not call it.

```markdown
- ❌ **18.275 — `attachmentsImpliedBy` returns one `note.attached` per distinct referenced note, skipping already-attached ones; `[]` for a body with none (control).** Mutation: one per occurrence.
- ❌ **18.276 — posting a ticket comment with two note references ingests the comment first, then two attachments; the section's live query reloads and shows both badges.** Mutation: ingest the attachments before the comment.
- ❌ **18.277 — a refused attachment leaves the comment posted and shows the toast naming the note and the reason.** Mutation: roll the comment back.
- ❌ **18.278 — a note comment with a `wikiLink` never produces `note.attached` (D28).** Mutation: call the helper from `note-comments.tsx`.
- ❌ **18.279 — a `ticketRef` in a comment produces no event (references to tickets attach nothing).** Mutation: treat `ticketRef` like `wikiLink`.
- ❌ **18.280 — removing a reference later (a new comment without it) detaches nothing (control: the badge stays).** Mutation: emit `note.detached` for notes absent from the new comment.
```

- [ ] Commit `Notes 7/Task 5: tagging a note in a ticket comment attaches it (18.275-18.280)`. Features §15: `- ✅ **Tag a note in a ticket comment and it is attached** — the badge appears in the ticket's Notes section; a refused attachment leaves the comment and says why (D27–D28).`

---

### Task 6: Close — mobile bundle, browser case, gate, PR

- [ ] Regenerate the bundle (`pnpm --filter @gisik-nokma/editor build:webview && pnpm --filter mobile generate:editor-html`; `cd apps/mobile && pnpm test` passes `--check`) — case `18.281 ✅`.
- [ ] `apps/web/e2e-stack/notes-references.spec.ts` — `18.282 🧪`: on a seeded ticket, post a comment "see :note Compressor" picking the note; the badge appears in the Notes section without reload; `18.283 🧪`: `:ticket` in a note's comment inserts a chip that opens the ticket. Recipes in the case text; run after the dev-stack rebuild.
- [ ] `pnpm turbo run build && pnpm test > /tmp/notes7-all.log 2>&1; tail -40 /tmp/notes7-all.log`; `pnpm typecheck`; `pnpm check:citations`. PR: `bash scripts/ctl/ctl pr open task/notes-7-inline-references --repo <worktree> --base release/notes --title "Notes 7/7: inline :ticket / :note references; tagging attaches" --body <file>`.

---

## Self-review against the spec

- **§14.1** triggers/pickers → Tasks 1–2 (with the `allowSpaces` + trimmed-query form instead of a trailing-space `char`, recorded). **§14.2** node/plain text/renderer → Tasks 1, 3; "the server route gains `key`" is **already true** (`TicketCard.key`, `read-models.ts:217`) — only the client mapper changes (Task 4), recorded as a spec correction. **§14.3** auto-attach → Task 5 (after the comment commits; refusals to the sheet's Toast, which Plan 6 introduced; D28 honoured by 18.278). **§14.4** bridge → Task 3. **§14.5** → all tasks.
- **Offline:** the replica's ticket `search` is still a gap; the `:ticket` picker degrades to a status line (18.272). Recorded, not hidden.
- **Names:** `TicketRefCandidate`, `queryTickets`, `resolveTicketHref` (T1) ← T3, T4; `noteRefSuggestionKey` (T2); `ticketHref` on `renderCommentBody`/`CommentsThread` (T3) ← T4; `attachmentsImpliedBy` (T5) ← Plan 6's section live query.
