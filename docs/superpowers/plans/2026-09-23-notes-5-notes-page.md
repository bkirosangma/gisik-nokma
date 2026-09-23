# Notes — Plan 5 of 6: The Notes Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the `/notes` page in the web app: a link left of Inbox, a left tree of every workspace and project the person belongs to with their notes, a Create dialog with home and scope, a note document with editable title, byline, autosaving editor, wiki-links, history with restore, comments, the search box with author and scope filters, and every drawn state from spec §9.7.

**Architecture:** One client page component `NotesPage` (`apps/web/src/notes/`) mounted by two routes, `/notes` and `/notes/[noteId]`. The page reads `getMyWorkspaces()` once and renders one `WorkspaceNotesSection` per workspace, each owning its own `useLiveQuery` over `getNotes` and its own `useNotesSearch`, because hooks cannot run in a loop. Writes are events through `makeSubmittedFactory` + `dataSource.ingest`, exactly as the ticket sheet submits comments. The editor is the shared `TicketEditorSlot` in `note` mode; one gap it still has (uploads keyed by ticket) is closed here by threading `noteId` through both slot twins. Page CSS lives in `apps/web/app/globals.css` under `.gn-notes*`, because `ui.css` styles only what `packages/app-core` renders.

**Tech Stack:** Next.js app router (client pages), React 19, `@gisik-nokma/app-core` data source + `useLiveQuery`, `@gisik-nokma/editor` slot and reading helpers, `@gisik-nokma/ui` kit, vitest + RTL with `stubServices`, Playwright `e2e-stack`.

**Spec:** `docs/superpowers/specs/2026-09-23-notes-design.md` §9 (and §8.5 wiki-link props, §10.2 `NoteBadge`, which this plan builds because the byline needs it first; Plan 6 reuses it). **Depends on:** Plans 1, 2 and 4 landed in `release/notes` (they are, at `35e2f465`), and **Plan 3 landed** for Task 8 only (`searchNotes`, `useNotesSearch`, `NoteSearchHit`); Tasks 1–7 and 9 do not touch search and may start before Plan 3 merges, but the PR merges only after Plan 3 is in.

## Global Constraints

- **Branch shape.** Cut `task/notes-5-notes-page` from `origin/release/notes`. One commit per task. PR `--base release/notes` through `bash scripts/ctl/ctl pr open …`.
- **Node 22; `pnpm turbo run build` before suites; log files, never `| head`; read the summary line.** Web suite: `cd apps/web && pnpm exec vitest run --no-file-parallelism > /tmp/notes5-web.log 2>&1; tail -20 /tmp/notes5-web.log`.
- **Every case: RED first, a control in the same `it`, the named mutation shown red after the commit, then restored.**
- **Case ids.** Block **`18.181`–`18.240`** in `test-cases/18-notes.md`; add the row `| 5 Notes page | \`18.181\`–\`18.240\` |` to its block table in Task 1. Section `## 18.11 The Notes page`.
- **`Features.md` §15** gets one bullet per task, appended at the end of the section (the file ends there).
- **Reads are `dataSource.query.<method>(…)`** (`packages/app-core/src/data-source.ts:350`: `DataSource = { ingest, query, subscribe }`). `useLiveQuery(source: DataSource, workspaceId, key, load)` takes the whole `DataSource`; `useNotesSearch(query: DataSourceQuery, …)` takes `.query`.
- **Writes** are `const make = makeSubmittedFactory({ actorId: user.id, origin: 'web' })` (`packages/app-core/src/submit.ts:25`), `make({ workspaceId, entity: { kind: 'note', id }, type, payload })`, `await dataSource.ingest([event])`, then check `result[0].status === 'committed'`. The idiom to copy is `submitComment` in `packages/app-core/src/views/ticket-sheet.tsx:1240-1263`.
- **Unstubbed reads reject** in web tests (`apps/web/test/helpers/stub-services.ts:108-110`); the seven note reads are already declared there (`:137-143`). Every test stubs exactly what its page will call.
- **Page CSS goes in `apps/web/app/globals.css`** as one `.gn-notes*` block, grouped like `.gn-workspaces*` (`:249-280`); colours only through `--gn-*` tokens from `packages/ui/src/tokens.ts`; **breakpoints are the existing ones**: `60rem` (drawer) and `64rem` (TOC), never a new value (`globals.css:206-208`). Check 11.95 (rendered classes ⇔ styled rules) must stay green.
- **The editor-slot contract is written twice** (`packages/editor/src/components/TicketEditorSlot.tsx:70-152`, `packages/app-core/src/views/editor-slot.tsx:94-186`, pinned by `packages/editor/test/ticket-editor-slot.test.tsx`): Task 4 adds `noteId?` to both or to neither.
- **The mobile editor bundle must be regenerated in the close** (Task 10): Task 4 touches `packages/editor`.
- **Never `AskUserQuestion`.** Line numbers read at `release/notes` `35e2f465` (Plan 3's at `81db5f62`); trust symbols.

---

## File map

| File | Responsibility |
|---|---|
| `apps/web/app/notes/layout.tsx`, `app/notes/page.tsx`, `app/notes/[noteId]/page.tsx` (new) | routes; title; mount `NotesPage` |
| `apps/web/src/notes-nav-link.tsx` (new), `apps/web/src/app-nav.tsx:465-467` | the nav link left of Inbox |
| `packages/ui/src/select/select-icons.tsx`, `packages/ui/src/index.ts` | `PageIcon` |
| `apps/web/src/notes/notes-page.tsx` (new) | page shell, workspaces read, header, layout, states |
| `apps/web/src/notes/workspace-notes-section.tsx` (new) | one workspace: live notes, project groups, deleted group, search results |
| `apps/web/src/notes/note-row.tsx` (new) | one tree row |
| `apps/web/src/notes/create-note-dialog.tsx` (new), `apps/web/src/notes/scope-editor.tsx` (new) | create + scope |
| `packages/app-core/src/views/people-picker.tsx` (new), `visibility-editor.tsx:617-660` | the extracted picker |
| `packages/ui/src/components/note-badge.tsx` (new), `packages/ui/src/index.ts`, `packages/ui/src/ui.css` | `NoteBadge` (spec §10.2) |
| `apps/web/src/notes/note-document.tsx` (new), `note-byline.tsx` (new), `note-title.tsx` (new) | the document |
| `packages/editor/src/components/TicketEditorSlot.tsx`, `packages/app-core/src/views/editor-slot.tsx` | `noteId?` for uploads in note mode |
| `apps/web/src/notes/use-note-autosave.ts` (new) | drafts, coalescing, save state |
| `apps/web/src/notes/history-panel.tsx` (new) | versions, view, restore |
| `apps/web/src/notes/note-comments.tsx` (new) | thread on a note |
| `apps/web/src/notes/notes-search-header.tsx` (new) | box + filters (Plan 3's hook) |
| `apps/web/app/globals.css` | `.gn-notes*` block |
| `apps/web/e2e-stack/notes.spec.ts` (new) | browser case |
| `test-cases/18-notes.md`, `Features.md` §15 | cases, catalogue |

---

### Task 1: Routes, nav link, page shell, workspaces read

**Files:**
- Create: `apps/web/app/notes/layout.tsx` (copy `apps/web/app/inbox/layout.tsx` with `documentTitleFor('Notes')` — `apps/web/src/page-title.ts:50`), `apps/web/app/notes/page.tsx`, `apps/web/app/notes/[noteId]/page.tsx`, `apps/web/src/notes/notes-page.tsx`, `apps/web/src/notes-nav-link.tsx`
- Modify: `apps/web/src/app-nav.tsx:465-467` (insert `<NotesNavLink active={…} />` **before** `<InboxNavLink …/>`), `packages/ui/src/select/select-icons.tsx` + `packages/ui/src/index.ts` (`PageIcon({ size = 16 })`), `apps/web/app/globals.css` (`.gn-notes`, `.gn-notes__header`, `.gn-notes__body`, `.gn-notes__tree`, `.gn-notes__document`, `.gn-notes__toc`)
- Test: `apps/web/test/notes-page.test.tsx` (new), `apps/web/test/app-nav.test.tsx` (extend)
- Docs: `test-cases/18-notes.md` (row + `18.181`–`18.185`), `Features.md`

**Interfaces:**
- Consumes: `useAppServices()` (`apps/web/src/providers.tsx:170`), `useCurrentUser()` (`:215`), `useSessionStatus()` (`:255`), `dataSource.query.getMyWorkspaces()` (`WorkspaceRef` with nested `projects[]` and `role`; see `apps/web/app/workspaces/page.tsx:24-33` for the three arms loading/refused/empty), `useParams`/`usePathname` from `next/navigation`, `<AppNav/>`, `.gn-shell`/`.gn-shell__main`/`.gn-page-title` (`globals.css:140`, `:141`, `:161`).
- Produces: `NotesPage({ noteId?: string })` rendering `<main id="gn-main" className="gn-shell"><AppNav/><div className="gn-notes" data-testid="notes-page">…` with `.gn-notes__header` (`<h1 className="gn-page-title">Notes</h1>` + a slot for Task 8's search), `.gn-notes__body` = `<nav aria-label="Notes" className="gn-notes__tree">` + `<section className="gn-notes__document">` + `<aside className="gn-notes__toc">`; `NotesNavLink({ active })` = `<Link href="/notes" aria-current={active ? 'page' : undefined}><PageIcon/> Notes</Link>`; active = `pathname === '/notes' || pathname.startsWith('/notes/')` — **the first prefix match in `app-nav.tsx`**, stated in the commit body (`current()` at `:230` is exact-equality; a note's own URL must still light the link).

- [ ] **Step 1: Cases**

```markdown
## 18.11 The Notes page

- ❌ **18.181 — `/notes` renders the page shell with the three regions and the title "Notes";** the document region says "Pick a note, or create one" when no note is open. Control: `/inbox` still renders its own title. Mutation: drop the tree region.
- ❌ **18.182 — the Notes link sits immediately before the Inbox link, carries `aria-current="page"` on `/notes` AND on `/notes/<id>`, and not on `/inbox`.** Mutation: use exact equality only.
- ❌ **18.183 — the page reads `getMyWorkspaces()` once and renders one section per workspace, headed by the workspace name, with one sub-heading per project;** control: a workspace with no projects renders only its own heading. Mutation: render projects from the first workspace under every workspace.
- ❌ **18.184 — a refused workspaces read renders `ShellRefusal`; an empty list renders "No notes yet" with the Create button;** loading renders neither. Mutation: render "No notes yet" while loading.
- ❌ **18.185 — the document title is "Notes · Gisik Nokma"** (`layout.tsx` metadata, asserted by reading the file the way `apps/web/test/*document-title*` cases do — find the existing pattern with `grep -rl documentTitleFor apps/web/test`). Mutation: drop the layout.
```

- [ ] **Step 2: Failing tests** — `apps/web/test/notes-page.test.tsx`, modelled on `apps/web/test/project-page-head.test.tsx:50-62` (route mocks; make `usePathname` return a variable so 18.182 can flip it) and `apps/web/test/inbox-page.test.tsx:19-30`; `world()` = `stubServices({ getMyWorkspaces: async () => [WS_A, WS_B], getNotes: async () => [], getDeletedNotes: async () => [] })` with `WS_A` having two projects and `WS_B` none; render `<Providers services={world()}><NotesPage/></Providers>`; assert with `screen.getByRole('navigation', { name: 'Notes' })`, `getByRole('heading', { name: 'Garo Hills Logistics' })`, etc. For 18.182 extend `app-nav.test.tsx` in its own style. For 18.184 stub `getMyWorkspaces` to reject with the refusal shape the workspaces page test uses (open `apps/web/test/workspaces-page.test.tsx` or the nearest, copy its refusal fixture).

- [ ] **Step 3: Run to verify failure.**

- [ ] **Step 4: Implement** — `notes-page.tsx`:

```tsx
'use client';
export function NotesPage({ noteId }: { noteId?: string }) {
  const { dataSource } = useAppServices();
  const user = useCurrentUser();
  const status = useSessionStatus();
  const [workspaces, setWorkspaces] = useState<WorkspaceRef[] | null>(null);
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  useEffect(() => { /* the workspaces/page.tsx:24-33 shape: load, refused → setRefusal, else setWorkspaces */ }, [dataSource]);
  if (status !== 'signed-in' || user === null) return <SignedOutOrLoading/>;   // reuse what inbox/page.tsx renders for these states
  return (
    <main id="gn-main" className="gn-shell">
      <AppNav />
      <div className="gn-notes" data-testid="notes-page">
        <div className="gn-notes__header"><h1 className="gn-page-title">Notes</h1>{/* Task 8 mounts NotesSearchHeader here */}</div>
        <div className="gn-notes__body">
          <nav aria-label="Notes" className="gn-notes__tree">
            {refusal ? <ShellRefusal … /> : workspaces === null ? <p className="gn-notes__loading">Loading…</p>
              : workspaces.length === 0 ? <EmptyTree/> : workspaces.map((ws) => <WorkspaceNotesSection key={ws.id} workspace={ws} openNoteId={noteId} />)}
          </nav>
          <section className="gn-notes__document" data-testid="note-document-region">
            {noteId === undefined ? <p className="gn-notes__hint">Pick a note, or create one.</p> : <NoteDocument noteId={noteId} workspaces={workspaces ?? []} />}
          </section>
          <aside className="gn-notes__toc" aria-label="On this page" />
        </div>
      </div>
    </main>
  );
}
```

In Task 1 `WorkspaceNotesSection` renders only the headings (workspace `<h2>`, project `<h3>`s); `NoteDocument` is a placeholder that renders the id (Task 4 replaces it). `app/notes/page.tsx` = `<NotesPage/>`; `app/notes/[noteId]/page.tsx` = `const { noteId } = useParams<{ noteId: string }>(); return <NotesPage noteId={noteId}/>`. CSS: `.gn-notes__body { display: grid; grid-template-columns: 18rem minmax(0, 1fr); gap: 1.5rem; }` with `.gn-notes__toc` hidden below `64rem` and shown as a third `14rem` column at and above it; below `60rem` the tree becomes a full-width block above the document (the drawer behaviour is Task 9).

- [ ] **Step 5: Run to verify pass**, plus `pnpm typecheck` for `apps/web` and `packages/ui`.

- [ ] **Step 6: Mutations, flip, commit.** Features §15: `- ✅ **A Notes page at \`/notes\`**, linked left of Inbox, listing every workspace and project the person belongs to (spec §9.1–9.2).`

```bash
git add apps/web packages/ui test-cases Features.md
git commit -m "Notes 5/Task 1: /notes routes, nav link, page shell and the workspaces fan-out (18.181-18.185)"
```

---

### Task 2: The tree — live notes per workspace, project groups, ticket keys, Deleted group, title filter

**Files:**
- Modify: `apps/web/src/notes/workspace-notes-section.tsx`; create `apps/web/src/notes/note-row.tsx`; `globals.css` (`.gn-notes__section`, `__group`, `__row`, `__row--open`, `__keys`, `__deleted`, `__filter`)
- Test: `apps/web/test/notes-tree.test.tsx`
- Docs: `18.186`–`18.190`

**Interfaces:**
- Consumes: `useLiveQuery(dataSource, ws.id, 'notes', () => dataSource.query.getNotes(ws.id))` and `'deleted-notes'` → `getDeletedNotes`; `NoteSummary` (`packages/domain/src/read-models.ts:763`); `WorkspaceRef.role`; `useCurrentUser`.
- Produces: `WorkspaceNotesSection({ workspace, openNoteId, titleFilter, onRestore })`: under the workspace heading, the workspace-level notes (`homeProjectId === ''`) sorted `updatedAt DESC`, then one group per project (heading = project name) with that project's notes; each `NoteRow` = `<Link href={/notes/<id>} aria-current={open ? 'page' : undefined} data-testid="note-row-<id>">` with the title and, when `attachedTickets.length > 0`, `<span className="gn-notes__keys">` listing the keys; a `Deleted` group (`data-testid="notes-deleted"`) rendered only when `getDeletedNotes` returns rows AND (`workspace.role` is `owner` or `admin`, or any row's `authorId === user.id`), each row with a **Restore** button writing `note.restored`; the title filter input (`aria-label="Filter by title"`) in the tree header narrows every section case-insensitively.

- [ ] **Step 1: Cases**

```markdown
- ❌ **18.186 — notes are grouped by home:** workspace-level notes under the workspace heading, project notes under their project heading, newest `updatedAt` first;** control: a note with an unknown `homeProjectId` renders under the workspace heading with its project id as the group name rather than vanishing. Mutation: sort ascending.
- ❌ **18.187 — an attached note shows its ticket keys beside the title.** Mutation: drop the keys.
- ❌ **18.188 — the open note's row carries `aria-current="page"`; control: the others do not.** Mutation: mark every row.
- ❌ **18.189 — the Deleted group appears for an author with a deleted note and for an admin; not for a member with none of their own;** Restore writes exactly one `note.restored` against the note, then the live query reloads. Mutation: show it to everyone.
- ❌ **18.190 — the title filter narrows rows across sections, case-insensitively; clearing restores them;** control: a project heading with no matching rows is hidden while filtering. Mutation: match case-sensitively.
```

- [ ] **Step 2–6:** tests with `stubServices` note reads returning fixtures and the `ingested` capture pattern (`apps/web/test/new-ticket-opens-sheet.test.tsx:160-200`) for Restore; implement; run; mutations; flip; commit `Notes 5/Task 2: the notes tree — grouping, keys, current row, Deleted group, title filter (18.186-18.190)`. Features §15: `- ✅ **The tree**: notes under their workspace or project, ticket keys beside attached notes, a Deleted group with Restore, a title filter.`

---

### Task 3: Create dialog, scope editor, the people picker, `note.created` and `note.scope_set`

**Files:**
- Create: `apps/web/src/notes/create-note-dialog.tsx`, `apps/web/src/notes/scope-editor.tsx`, `packages/app-core/src/views/people-picker.tsx`
- Modify: `packages/app-core/src/views/visibility-editor.tsx:617-660` (use `PeoplePicker` instead of the inline fieldset), `packages/app-core/src/index.ts` (export `PeoplePicker`), `notes-page.tsx` (Create button in the tree header), `globals.css`
- Test: `apps/web/test/create-note-dialog.test.tsx`, `packages/app-core/test/views/people-picker.test.tsx`, existing `visibility-editor` tests must stay green
- Docs: `18.191`–`18.196`

**Interfaces:**
- Consumes: `Dialog` (`packages/ui/src/components/dialog.tsx:4`: `{ open, title, onClose, children }`), `Popover` (`popover.tsx:7-14`: `{ triggerRef, open, onClose, 'aria-label', children }`), `Select` single (`packages/ui/src/select/select.tsx:42-69`), `dataSource.query.getMembers(workspaceId): Promise<RosterMember[]>` (`data-source.ts:219`), `memberLabel` (`packages/app-core/src/member-label.ts`), `NOTE_SCOPE_MODES`, `NoteScope`, `newUlid` from `@gisik-nokma/domain`, `makeSubmittedFactory`, `useRouter().push`.
- Produces:
  - `PeoplePicker({ members: RosterMember[]; selected: string[]; onToggle(userId: string): void; legend?: string })` — the 40 lines from `visibility-editor.tsx:617-660` made a component (`<fieldset className="gn-visibility__people">`, checkboxes, `memberLabel`); `VisibilityEditor` now renders it.
  - `CreateNoteDialog({ open, onClose, workspaces: WorkspaceRef[], defaultHome: { workspaceId, projectId: string }, attachTicket?: { workspaceId, ticketId, projectId }, onCreated(noteId, workspaceId) })`: Title input (required, `aria-label="Title"`), Home `Select` whose options are every workspace ("<name> — workspace", value `ws:<id>`) and every project ("<ws> / <project>", value `p:<wsId>:<projectId>`), default per `defaultHome`; Scope `Select` with `private`, `workspace`, `project` (only when the chosen home is a project), `explicit` (reveals `PeoplePicker` over `getMembers(chosen workspace)`), and `inherit` **only when `attachTicket` is given**, preselected then. Create writes ONE `note.created { title, homeProjectId, scope, attachTicketId? }` with `entity: { kind: 'note', id: newUlid() }` in the chosen workspace, then `onCreated`; the page navigates to `/notes/<id>`. Refusal → the dialog shows the reason and stays open.
  - `ScopeEditor({ note: NoteDetail, members, canEdit, onChanged })`: a chip button `data-testid="note-scope"` showing the mode; when `canEdit`, opens a `Popover` with the same Scope select (+ picker for `explicit`; `inherit` only when `note.attachedTickets.length > 0`) writing `note.scope_set`.

- [ ] **Step 1: Cases**

```markdown
- ❌ **18.191 — `PeoplePicker` renders one checkbox per member labelled by `memberLabel`, checked for `selected`, and calls `onToggle(id)`;** `VisibilityEditor` still passes its own tests after the extraction (they are the control). Mutation: label by id.
- ❌ **18.192 — the Home select lists every workspace and project the person belongs to, defaulting to `defaultHome`;** control: a workspace with no projects contributes one option. Mutation: list projects of the first workspace only.
- ❌ **18.193 — Scope offers `project` only for a project home, `inherit` only when `attachTicket` is given, and `explicit` reveals the picker;** control: `private` and `workspace` always. Mutation: always offer `inherit`.
- ❌ **18.194 — Create writes exactly one `note.created` in the chosen workspace with `homeProjectId`, `scope` (with `userIds` for explicit) and `attachTicketId` when given, then navigates to `/notes/<id>`;** a refused ingest keeps the dialog open with the reason. Mutation: navigate before the ingest resolves.
- ❌ **18.195 — the scope chip shows the mode; for an editor it opens the editor and a change writes `note.scope_set`; for a reader it is static text (control).** Mutation: open for readers.
- ❌ **18.196 — `inherit` is offered in the scope editor only while the note has ≥ 1 attached ticket.** Mutation: always offer it.
```

- [ ] **Step 2–6:** tests (dialog via `userEvent`, `ingested` capture, `push` spy); implement; run web, app-core and ui suites; mutations; flip; commit `Notes 5/Task 3: Create dialog, scope editor, PeoplePicker extracted (18.191-18.196)`. Features §15: `- ✅ **Create a note anywhere you belong**, choosing its home and scope; change scope later from the byline (spec §9.3; D3).`

---

### Task 4: The note document — title, byline, badges, editor mount, wiki-link callbacks, uploads by note

**Files:**
- Create: `apps/web/src/notes/note-document.tsx`, `note-title.tsx`, `note-byline.tsx`; `packages/ui/src/components/note-badge.tsx` (+ export, + `.gn-note-badge*` in `ui.css`)
- Modify: `packages/editor/src/components/TicketEditorSlot.tsx:70-152` and `packages/app-core/src/views/editor-slot.tsx:94-186` (`noteId?: string`; in `note` mode uploads post with `noteId` — read how `uploadAttachment`/`uploadAttachmentHttp` build the request today and add the note owner field Plan 1 Task 8 accepts), `packages/editor/test/ticket-editor-slot.test.tsx` (the twin transcription), `globals.css`
- Test: `apps/web/test/note-document.test.tsx`, `packages/ui/test/note-badge.test.tsx`, `packages/editor/test/ticket-editor-slot.test.tsx` (extend)
- Docs: `18.197`–`18.204`

**Interfaces:**
- Consumes: `getNote(workspaceId, noteId)` — the page does not know the workspace from the URL, so `NoteDocument` finds it by trying `getNote` per workspace from the tree's list until one returns non-null, **or** (preferred, decide by reading `routes/notes.ts`'s `GET /v1/notes/:noteId`, which needs no workspace) adds nothing and calls `getNote(workspaces[0].id, noteId)`… — **STOP: read `packages/app-core/src/online/online-data-source.ts`'s `getNote` first**: Plan 1 built it as `GET /v1/notes/<noteId>` ignoring `workspaceId`, so any workspace id works online; the replica implementation filters by workspace. Use the `homeProjectId`/`workspaceId` of the tree row when the note is in the tree, else iterate workspaces. State which in the code comment.
- Consumes: `TicketEditorSlot` in `mode="note"` with `doc`, `readOnly`, `workspaceId`, `ticketId=""` is **not** acceptable — hence the `noteId?` prop; `queryNotes`, `resolveNoteTitle`, `previewNote`, `onNavigateNote` (spec §8.5), `submitSlot="none"`; `extractReadingMeta`, `readingTimeMinutes` (`@gisik-nokma/editor`); `Avatar` (`avatar.tsx:9-14`), `getMembers` for names; `RemoveIcon`; `exportMarkdown`.
- Produces:
  - `NoteBadge({ title, scopeMode, href, onDetach? })` per spec §10.2 exactly (link body + separate `<button aria-label="Detach <title>">` when `onDetach`); exported from `packages/ui`.
  - `NoteDocument({ noteId, workspaces })`: `useLiveQuery(dataSource, wsId, 'note:'+noteId, () => getNote(wsId, noteId))`; `null` after `hasAnswered` → the "no longer shared" state (Task 9); breadcrumb (`.gn-breadcrumb`: workspace name / project name / title); `NoteTitle` (an `<h1 contentEditable={canEdit}>` writing `note.renamed` on blur or Enter when changed and non-empty; Escape reverts); `NoteByline`: `<Avatar name={authorName}/>` + name + "edited <relative>", `ScopeEditor` (Task 3), one `NoteBadge` per `attachedTickets` entry (`href` = the ticket's page `/w/<ws>/p/<project>?ticket=<id>` — copy the path the board uses to open a ticket; `onDetach` when `canEdit` — writes `note.detached`), reading time (`readingTimeMinutes(extractReadingMeta(editorRoot).wordCount)` computed on doc change), a **Copy as Markdown** button (`exportMarkdown(doc)` → `navigator.clipboard.writeText`), a save indicator slot (Task 5) and a History button (Task 6); then the slot (toolbar comes with it when not read-only).
  - `canEdit = note.authorId === user.id || role === 'owner' || (role === 'admin' /* readable already */)` from the tree's `WorkspaceRef.role`.
  - Wiki-link callbacks: `queryNotes(q)` filters the page's loaded `NoteSummary[]` by title (first 8); `resolveNoteTitle(id)` returns the loaded title or `null`; `previewNote(id)` = `getNote` → `docToPlainText(body).slice(0, 200)` (import `docToPlainText` from `@gisik-nokma/domain`); `onNavigateNote(id)` = `router.push('/notes/' + id)`.

- [ ] **Step 1: Cases**

```markdown
- ❌ **18.197 — `NoteBadge` renders the title as a link to `href` and, only with `onDetach`, a separate button named "Detach <title>" that calls it; the title is truncated at 40 characters with the full title in `title=`.** Mutation: put the × inside the link.
- ❌ **18.198 — the twin transcription covers `noteId?`; in note mode an upload posts `noteId` and no `ticketId`;** control: comment mode still posts `ticketId`. Mutation: post both.
- ❌ **18.199 — the document renders breadcrumb, editable title, byline (author name from `getMembers`, edited time, scope chip, one badge per attached ticket, reading time) and the editor in note mode with the loaded body.** Mutation: mount the editor in description mode.
- ❌ **18.200 — renaming: Enter or blur with a changed, non-empty title writes one `note.renamed`; Escape reverts; an empty title writes nothing (control).** Mutation: write on every keystroke.
- ❌ **18.201 — detaching a badge writes `note.detached { ticketId }`; a reader sees no × (control).** Mutation: show × to readers.
- ❌ **18.202 — wiki-link callbacks: `queryNotes('co')` returns loaded notes whose title contains "co"; `resolveNoteTitle` returns the live title or `null` for an unknown id; `previewNote` returns the first 200 characters of plain text.** Mutation: return the stored title for unknown ids.
- ❌ **18.203 — Copy as Markdown puts `exportMarkdown(doc)` on the clipboard.** Mutation: copy `JSON.stringify(doc)`.
- ❌ **18.204 — a reader gets the editor read-only, no toolbar, a static title and scope chip;** control: the author gets all four editable. Mutation: compute `canEdit` from `role === 'member'`.
```

- [ ] **Step 2–6:** tests (`note-document.test.tsx` stubs `getNote`, `getMembers`, `getNotes`; uses the `ingested` capture; `packages/ui/test/note-badge.test.tsx` in the kit's RTL style); implement; run web, ui, editor, app-core suites; mutations; flip; commit `Notes 5/Task 4: the note document — title, byline, NoteBadge, editor in note mode, uploads by note (18.197-18.204)`. Features §15: `- ✅ **A note's page**: breadcrumb, editable title, byline with author, scope and attached tickets, reading time, Copy as Markdown, the shared editor with wiki-links (spec §9.2, §8.5).`

---

### Task 5: Autosave, drafts, the save indicator

**Files:**
- Create: `apps/web/src/notes/use-note-autosave.ts`; modify `note-document.tsx`, `note-byline.tsx`
- Test: `apps/web/test/use-note-autosave.test.tsx`
- Docs: `18.205`–`18.209`

**Interfaces:**
- Produces: `useNoteAutosave({ dataSource, userId, workspaceId, noteId, note: NoteDetail | null }): { onDraft(doc): void; onSave(doc): void; saveState: 'saved' | 'saving' | 'unsaved'; initialDoc: unknown }` implementing spec §9.4 exactly: draft key `gn.note-draft.<userId>.<noteId>`, `{ doc, at }` JSON in `localStorage` under `try/catch`; 2 s coalescing timer reset on each `onDraft`; flush on `onSave` (blur), on `beforeunload`, on unmount/route change; flush writes one `note.body_set { body }`, `committed` → remove the key, `saved`; failure → keep the key, `unsaved`; on mount, a draft newer than `note.updatedAt` becomes `initialDoc` with `unsaved`, else the key is deleted and `initialDoc = note.body`. The slot receives `onDraft`, `onSave`, `saveState`; the byline shows `data-testid="editor-save-state"` text via the slot's own footer (Plan 4 Task 8 renders it) — do not render a second indicator.

- [ ] **Step 1: Cases**

```markdown
- ❌ **18.205 — five `onDraft` calls within two seconds write ONE `note.body_set` (fake timers); control: a sixth call after a further two seconds writes a second.** Mutation: write per call.
- ❌ **18.206 — `onSave` flushes immediately; unmount flushes a pending draft.** Mutation: drop the unmount flush.
- ❌ **18.207 — a rejected ingest keeps the draft in `localStorage` and reports `unsaved`; a committed one removes it and reports `saved`.** Mutation: remove the key regardless.
- ❌ **18.208 — on mount, a stored draft newer than `note.updatedAt` is offered as `initialDoc` with `unsaved`; an older draft is discarded (control).** Mutation: prefer the draft always.
- ❌ **18.209 — `localStorage` throwing (private window) never throws out of the hook; the editor still mounts with the note's body.** Mutation: remove the `try/catch`.
```

- [ ] **Step 2–6:** hook tests with `renderHook`, `vi.useFakeTimers()`, a stubbed `Storage` that throws for 18.209; implement; run; mutations; flip; commit `Notes 5/Task 5: autosave, drafts and the save state (18.205-18.209)`. Features §15: `- ✅ **Notes save themselves** — one event per typing pause, a draft kept on the device until the server accepts it, a Saved / Saving… / Not saved indicator (D14).`

---

### Task 6: History panel and restore

**Files:**
- Create: `apps/web/src/notes/history-panel.tsx`; modify `note-document.tsx`
- Test: `apps/web/test/history-panel.test.tsx`
- Docs: `18.210`–`18.212`

**Interfaces:**
- Consumes: `Sheet` (`packages/ui/src/components/sheet.tsx:4-45`: `{ open, title, onClose, children, headerActions?, titleSlot?, full? }` — **no side prop**; use the default width), `getNoteHistory`, `getNoteVersion` (returns `NoteDetail | null` — the body is `.body`), `getMembers` names.
- Produces: `HistoryPanel({ open, onClose, workspaceId, noteId, nameOf, onRestore(body) })`: rows newest first, "<relative time> · <name>", `data-testid="history-row-<eventId>"`; selecting a row loads the version and the document region shows it read-only (`TicketEditorSlot mode="note" readOnly doc={version.body}`) under a banner "Viewing version from <time>" with **Restore** (writes `note.body_set { body: version.body }`, then back to editing) and **Back**.

- [ ] **Step 1: Cases**

```markdown
- ❌ **18.210 — History lists `getNoteHistory` newest first with names; control: an empty history renders "No saved versions yet".** Mutation: oldest first.
- ❌ **18.211 — selecting a row shows that version read-only with the banner; Back returns to the live editor without writing (control).** Mutation: write on Back.
- ❌ **18.212 — Restore writes exactly one `note.body_set` whose body equals the selected version's body.** Mutation: write the live body.
```

- [ ] **Step 2–6:** implement; run; mutations; flip; commit `Notes 5/Task 6: history panel with view and restore (18.210-18.212)`. Features §15: `- ✅ **History**: every saved version, a read-only view, Restore (D15).`

---

### Task 7: Comments on a note

**Files:**
- Create: `apps/web/src/notes/note-comments.tsx`; modify `note-document.tsx`
- Modify: `packages/app-core/src/views/comments-thread.tsx:67-76` (`files?: TicketCommentFile[]` optional on `TicketComment`, `CommentItem` tolerates absence) **or** map `NoteComment → { ...c, files: [] }` in the page — choose the mapping (no kit change) unless the thread's tests make the optional field trivial; say which in the commit body
- Test: `apps/web/test/note-comments.test.tsx`
- Docs: `18.213`–`18.215`

**Interfaces:**
- Consumes: `CommentsThread({ comments, commentsUnavailable?, nameOf, composer? })` (`comments-thread.tsx:78-103`), `getNoteComments`, the sheet's `submitComment` idiom (`ticket-sheet.tsx:1240-1263`) with `entity: { kind: 'note', id: noteId }`; the slot in `mode="comment"` with `submit` and `footerNote="Posting records an event citing you."`.
- Produces: `NoteComments({ workspaceId, noteId, nameOf, canComment })` mounting `CommentsThread` under the editor; `canComment` is every reader.

- [ ] **Step 1: Cases**

```markdown
- ❌ **18.213 — a note's comments render in the thread with author names; control: none → the thread's own empty copy.** Mutation: drop `nameOf`.
- ❌ **18.214 — posting writes one `comment.added` against `{ kind: 'note', id }`, and the thread reloads on commit.** Mutation: file it against a ticket.
- ❌ **18.215 — a reader (non-author) can post; the composer is present for every reader.** Mutation: hide it for non-authors.
```

- [ ] **Step 2–6:** implement; run web + app-core; mutations; flip; commit `Notes 5/Task 7: comments on a note (18.213-18.215)`. Features §15: `- ✅ **Comments on notes**, the same thread tickets have (D19).`

---

### Task 8: Search on the page — box, author and scope filters, results in place of the tree

**Depends on Plan 3 merged** (`searchNotes`, `useNotesSearch`, `NoteSearchHit`). Do not start before `git merge-base --is-ancestor <Plan 3 merge> origin/release/notes` says yes; merge `origin/release/notes` into the branch first.

**Files:**
- Create: `apps/web/src/notes/notes-search-header.tsx`; modify `notes-page.tsx`, `workspace-notes-section.tsx`, `globals.css` (`.gn-notes__search`, `__filters`, `__results`, `__result`, `__snippet`, `__corrected`)
- Test: `apps/web/test/notes-search.test.tsx`
- Docs: `18.216`–`18.220`

**Interfaces:**
- Consumes: `useNotesSearch(dataSource.query, workspaceId, { authorId?, scopeMode? })` → `{ query, setQuery, results, corrected, searching }` (Plan 3, `apps/web/src/use-notes-search.ts`), `NoteSearchHit` (`packages/domain/src/read-models.ts`, Plan 3), `Select` single for the two filters, `getMembers` for author options.
- Produces: `NotesSearchHeader({ value, onChange, authorId, onAuthor, scopeMode, onScope, members })` in the page header: `<input type="search" aria-label="Search notes" data-testid="notes-search">`, an Author `Select` (`aria-label="Author"`, options from the union of members across workspaces, value = user id) and a Scope `Select` (`aria-label="Scope"`). The page holds `query`, `authorId`, `scopeMode` and passes them to every `WorkspaceNotesSection`, which calls `useNotesSearch` (one per workspace) and, in an effect, `setQuery(query)`; while `query !== ''` the section renders `results` as `<ol className="gn-notes__results">` (title, snippet with `**` rendered as `<mark>`, scope chip text, keys, a `source` marker `data-source="lexical|meaning"`) instead of its groups; `corrected` renders "Showing results for <words>"; empty → "No notes match". Picking a result navigates to `/notes/<id>`.

- [ ] **Step 1: Cases**

```markdown
- ❌ **18.216 — typing replaces each section's groups with that workspace's results; clearing restores the groups (control).** Mutation: keep the groups visible.
- ❌ **18.217 — the Author and Scope selects are passed into the hook's options and change the request;** control: no filter sends none. Mutation: ignore the scope select.
- ❌ **18.218 — a `**match**` snippet renders `<mark>` around the match.** Mutation: render the asterisks.
- ❌ **18.219 — `corrected` shows "Showing results for …"; empty results show "No notes match".** Mutation: swap the two.
- ❌ **18.220 — the merge rule survives the page: lexical `[A,B]` then meaning `[B,C]` renders A, B, C in that order** (the hook is Plan 3's; this asserts the page does not re-sort). Mutation: sort results by title.
```

- [ ] **Step 2–6:** tests with `searchNotes` stubbed to return controlled promises per `mode`; implement; run; mutations; flip; commit `Notes 5/Task 8: search on the Notes page with author and scope filters (18.216-18.220)`. Features §15: `- ✅ **Search on the Notes page** — spelling results as you type, meaning results appended, author and scope filters (D21–D24).`

---

### Task 9: The drawn states, readers, responsive layout

**Files:**
- Modify: `notes-page.tsx`, `note-document.tsx`, `workspace-notes-section.tsx`, `globals.css`
- Test: `apps/web/test/notes-states.test.tsx`, `apps/web/test/notes-css.test.ts` (reads `globals.css` the way `project-page-head.test.tsx:221-287` pins rules)
- Docs: `18.221`–`18.226`

**Interfaces:**
- Produces, per spec §9.7: empty tree copy + Create; an open note whose live query returns `null` after having answered → `router.replace('/notes')` + a keyed `<Toast message="That note is no longer shared with you">` (the inbox pattern, `inbox/page.tsx:497-520`); a note whose `deleted` becomes true under you → banner "This note was deleted" with Restore (`canEdit`) or Back; the save-failure state is Task 5's `unsaved`; search-empty is Task 8's; an unreadable wiki-link target is the editor's red pill (Plan 4) — assert it renders on this page with `resolveNoteTitle` returning `null`. Responsive: below `60rem` the tree is a `<details>`-style drawer (`.gn-notes__tree--drawer`, a toggle button "Notes list", `aria-expanded`); the TOC column exists only at and above `64rem`, filled by `ReadingTOC` (`@gisik-nokma/editor`) from `extractReadingMeta(editorRoot).headings` when there are ≥ 3 headings.

- [ ] **Step 1: Cases**

```markdown
- ❌ **18.221 — an open note that stops being readable navigates to `/notes` and shows the toast; control: a note that is still readable stays.** Mutation: stay.
- ❌ **18.222 — a note deleted under you shows the banner with Restore for an editor and Back for a reader.** Mutation: show Restore to readers.
- ❌ **18.223 — an unreadable wiki-link target renders the red pill on this page.** Mutation: pass `resolveNoteTitle: () => 'x'`.
- ❌ **18.224 — `globals.css` pins: `.gn-notes__body` is a two-column grid; a `@media (max-width: 60rem)` rule makes it one column and shows `.gn-notes__tree-toggle`; a `@media (min-width: 64rem)` rule adds the TOC column; no other breakpoint value appears in the block.** Mutation: change 60rem to 59rem.
- ❌ **18.225 — the TOC lists the headings when there are three or more; nothing with two (control).** Mutation: show at two.
- ❌ **18.226 — every class the page renders has a rule in `globals.css` and every `.gn-notes*` rule is rendered** (the 11.95 shape; find that check's helper with `grep -rn "11\.95" apps/web/test` and reuse it). Mutation: add an unused rule.
```

- [ ] **Step 2–6:** implement; run; mutations; flip; commit `Notes 5/Task 9: the drawn states, readers, drawer and TOC (18.221-18.226)`. Features §15: `- ✅ **The page handles losing a note, a deleted note, offline saves and narrow screens** without a dead end (spec §9.6–9.7).`

---

### Task 10: Close — mobile bundle, browser case, full gate, PR

**Files:**
- Modify: `apps/mobile/src/editor/editor-html.generated.ts` (regenerate: `pnpm --filter @gisik-nokma/editor build:webview && pnpm --filter mobile generate:editor-html`, then `cd apps/mobile && pnpm test` passes its `--check`)
- Create: `apps/web/e2e-stack/notes.spec.ts`
- Docs: `18.227`–`18.229`

- [ ] **Step 1: Cases**

```markdown
- ❌ **18.227 — the mobile editor bundle is fresh at this head** (`generate-editor-html.mjs --check` exit 0). Mutation: revert the generated file.
- ❌ **18.228 🧪 — browser: sign in as the owner, open `/notes`, Create a workspace-level private note titled "Cold room", type a paragraph, wait for "Saved", reload, and the note is in the tree under the workspace with its body rendered** (positive control first: the workspace heading is present before the Create). Recipe in the case text.
- ❌ **18.229 🧪 — browser: rename the note and see the tree row and the document title update without reload** (the live query).
```

- [ ] **Step 2:** the spec in `apps/web/e2e-stack/notes.spec.ts` in the shape of `visibility.spec.ts:28-60` (`signIn(page, OWNER_EMAIL)`, `page.goto('/notes')`, positive control, then the flow; never a bare `toHaveCount(0)`); run it against the built stack when the controller has one on `release/notes` (the owner decides when the dev stack builds from `release/notes`); until then the two cases stay 🧪 with the recipe.
- [ ] **Step 3:** `pnpm turbo run build && pnpm test > /tmp/notes5-all.log 2>&1; tail -40 /tmp/notes5-all.log`; `pnpm typecheck`; `pnpm check:citations` — green under Node 22. Re-read `Features.md` §15 and `test-cases/18-notes.md` `18.181`–`18.229`.
- [ ] **Step 4:** PR body (lane-unique path): what landed, the block, summary lines with `NODE=`, the deviations (prefix match in the nav; `.gn-notes*` in `globals.css`; `noteId?` on both slot twins; `NoteComment` files mapping), the attribution line. `bash scripts/ctl/ctl pr open task/notes-5-notes-page --repo <worktree> --base release/notes --title "Notes 5/6: the Notes page" --body <file>`; confirm the PR head equals `HEAD`.

---

## Self-review against the spec

- **§9.1** → Task 1 (with the prefix-match deviation stated). **§9.2** tree → Tasks 1–2; document → Tasks 4–7; header → Task 8; TOC → Task 9. **§9.3** → Task 3 (the people picker is extracted rather than copied). **§9.4** → Task 5. **§9.5** → Task 6 (Sheet without a side prop). **§9.6** → Task 4 (`canEdit`) + Task 9. **§9.7** → Task 9. **§8.5** wiki-link callbacks → Task 4. **§10.2 NoteBadge** → Task 4 (Plan 6 reuses). **§11.9** page half → Tasks 1–9; **§11.10** cases 1–2 → Task 10.
- **Corrections to the spec carried here:** reads via `dataSource.query`; the Inbox does not fan out over workspaces, this page does; page CSS in `globals.css` (rule at `ui.css:4492-4500`); 960 px and 1280 px become the existing `60rem` and `64rem`; the slot needs `noteId?` for uploads; `NoteComment` has no `files`.
- **Names across tasks:** `NotesPage`, `WorkspaceNotesSection`, `NoteRow` (T1–2) ← T8, T9; `CreateNoteDialog`, `ScopeEditor`, `PeoplePicker` (T3) ← T4, Plan 6; `NoteBadge`, `NoteDocument`, `NoteByline`, `canEdit` (T4) ← T5–T9, Plan 6; `useNoteAutosave` (T5) ← T4 mount; `HistoryPanel` (T6); `NoteComments` (T7); `NotesSearchHeader` (T8).
