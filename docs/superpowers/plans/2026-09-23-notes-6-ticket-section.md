# Notes — Plan 6 of 7: The Ticket's Notes Section Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put a "Notes · N" section on the ticket sheet: one badge per attached note the viewer can read, each linking to the note and carrying a corner × that detaches with Undo; an "Attach note" picker over the notes the viewer reads with a "New note: <text>" row that creates an inherit-scoped note attached at birth; all live, so attachments made elsewhere appear without reload. Plus the browser cases of spec §11.10.

**Architecture:** Everything lives in `packages/app-core` (the sheet's package): a `TicketNotesSection` mounted in the Details tab between Subtasks and Comments, fed by `useLiveQuery` over `getNotesForTicket` under a ticket-scoped key; an `AttachNotePicker` that lists candidates from `getNotes` and, for the New-note row, writes `note.created` itself through the sheet's submitted-event factory (the web app's Create dialog cannot be imported into app-core, and does not need to be). The badge is Plan 5's `NoteBadge` from `packages/ui`. The detach Undo is the sheet's first `Toast`, which the kit already provides.

**Tech Stack:** React in `packages/app-core`, `@gisik-nokma/ui` (`NoteBadge`, `Popover`, `Toast`, `Button`), vitest + RTL, Playwright `e2e-stack`.

**Spec:** `docs/superpowers/specs/2026-09-23-notes-design.md` §10 and §11.10. **Depends on:** Plans 1–5 landed (`release/notes` `5b7f8fe9`).

## Global Constraints

- **Branch shape.** Cut `task/notes-6-ticket-section` from `origin/release/notes`. One commit per task. PR `--base release/notes` through `bash scripts/ctl/ctl pr open …`.
- **Node 22; `pnpm turbo run build` before suites; log files, never `| head`; read the summary line.** app-core suite: `cd packages/app-core && pnpm exec vitest run --no-file-parallelism > /tmp/notes6-appcore.log 2>&1; tail -20 /tmp/notes6-appcore.log`.
- **Every case: RED first, a control in the same `it`, the named mutation shown red after the commit, then restored.**
- **Case ids.** New block **`18.241`–`18.270`** in `test-cases/18-notes.md`; add the row `| 6 Ticket section | \`18.241\`–\`18.270\` |` to its block table (`:11-16`) in Task 1. Section `## 18.12 The ticket's Notes section`. The highest minted §18 id today is `18.229`; `18.230`–`18.240` belong to Plan 5's row and are not yours.
- **`Features.md` §15** gets one bullet per task, appended at the end.
- **Live-query keys carry the ticket id** (ruling P17, `ticket-sheet.tsx:794-806`): `` `${ticketId}:notes` ``.
- **The sheet reports failures inline today** (`role="alert"` paragraphs at `ticket-sheet.tsx:3024-3054`) and has never mounted a `Toast`; this plan mounts one for detach-with-Undo (spec §10.2), keyed like the project page's delete toast (`apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx:3658-3668`).
- **There is no `canEditTicket` on the client** (`ticket-sheet.tsx:2600-2627`): the description editor's own rule is `editorSlot !== undefined`. This plan uses the same expression for showing the × and the Attach button, and records it; a server refusal on detach/attach is shown, never hidden.
- **Never `AskUserQuestion`.** Line numbers read at `release/notes` `5b7f8fe9`; trust symbols.

---

## File map

| File | Responsibility |
|---|---|
| `packages/app-core/src/views/ticket-notes-section.tsx` (new) | the section: heading, badges, detach + Undo toast, Attach button |
| `packages/app-core/src/views/attach-note-picker.tsx` (new) | the popover picker with the New-note row |
| `packages/app-core/src/views/ticket-sheet.tsx:3692-3694` | mount point; `:147-407` no new props |
| `packages/app-core/src/index.ts` | exports |
| `packages/ui/src/ui.css` | `.gn-ticket-sheet__notes*` block beside the other sheet blocks |
| `apps/web/src/notes/note-byline.tsx:68-76` | the ticket href becomes the canonical sheet path |
| `apps/web/e2e-stack/notes-ticket.spec.ts` (new) | browser cases |
| `test-cases/18-notes.md`, `Features.md` §15 | cases, catalogue |

---

### Task 1: The section — live badges, detach with Undo

**Files:**
- Create: `packages/app-core/src/views/ticket-notes-section.tsx`
- Modify: `packages/app-core/src/views/ticket-sheet.tsx` (mount between `</section>` of subtasks at `:3692` and the comment block at `:3694` — the prototype's Subtasks → Notes → Comments order; say so in the docblock), `packages/app-core/src/index.ts`, `packages/ui/src/ui.css`
- Test: `packages/app-core/test/views/ticket-notes-section.test.tsx`
- Docs: `test-cases/18-notes.md` (row + `18.241`–`18.246`), `Features.md`

**Interfaces:**
- Consumes: `useLiveQuery` (`ticket-sheet.tsx:807-809` is the template), `dataSource.query.getNotesForTicket(workspaceId, ticketId): Promise<NoteSummary[]>` (`data-source.ts:347`), `NoteSummary` (`packages/domain/src/read-models.ts:814-825`: `noteId`, `title`, `scope.mode`, …), `NoteBadge` (`packages/ui/src/components/note-badge.tsx:32-38`: `{ title, scopeMode, href, onDetach? }`), `Toast` (`packages/ui/src/components/toast.tsx:13-35`: `{ open, message, tone?, undo?: { label?, onUndo } | null, onDismiss, durationMs? }`), the sheet's `make` factory and `dataSource.ingest`, `setServerRefusal`/`setTransportError` (`:1249-1266` shape).
- Produces: `TicketNotesSection({ dataSource, workspaceId, ticketId, projectId, currentUserId, canEdit, make, onNavigate?, onRefusal })`:
  - `<section className="gn-ticket-sheet__notes" data-testid="ticket-notes">` with `<h3 className="gn-ticket-sheet__caption">Notes · {n}</h3>` where `n` = the live query's length (unreadable notes are absent from the read, spec D5); while loading, `Notes`; on error, the thread's own `commentsUnavailable`-style sentence.
  - `<ul className="gn-ticket-sheet__note-badges">` with one `<li><NoteBadge title scopeMode={note.scope.mode} href={`/notes/${note.noteId}`} onDetach={canEdit ? … : undefined}/></li>` per note.
  - Detach writes ONE `note.detached { ticketId }` against `{ kind: 'note', id: noteId }`; on `committed` → `reload()` and a keyed `<Toast message={`Detached "${title}"`} undo={{ onUndo }} onDismiss>` whose Undo writes `note.attached { ticketId }` and reloads; on refusal → `onRefusal({ rule, reason })` (the sheet's inline alert), no toast.
  - The Attach button (`data-testid="attach-note"`, `aria-haspopup="dialog"`) is rendered only when `canEdit`; Task 2 wires it.

- [ ] **Step 1: Cases**

```markdown
## 18.12 The ticket's Notes section

- ❌ **18.241 — the section sits between Subtasks and Comments in the Details tab and reads `getNotesForTicket` under the key `<ticketId>:notes`;** the heading counts the returned notes; control: a ticket with none shows "Notes · 0" and no badges. Mutation: key without the ticket id.
- ❌ **18.242 — one badge per note, linking to `/notes/<id>`, tinted by `scope.mode`, with the × only when `canEdit`;** control: the same fixture with `canEdit: false` renders the links and no buttons. Mutation: render × for everyone.
- ❌ **18.243 — clicking × writes exactly one `note.detached { ticketId }` against the note, reloads, and shows a toast with Undo.** Mutation: file it against the ticket.
- ❌ **18.244 — Undo writes `note.attached { ticketId }` and reloads; dismiss writes nothing (control).** Mutation: Undo writes `note.detached`.
- ❌ **18.245 — a refused detach surfaces through the sheet's inline alert with the server's reason and shows no toast.** Mutation: show the toast anyway.
- ❌ **18.246 — a live update (a `refresh`/`event` frame for the workspace) re-reads the section without a reload;** the test drives the subscription callback the way `use-live-query.test.tsx` does. Mutation: drop `useLiveQuery` for a one-shot read.
```

- [ ] **Step 2: Failing tests** — mount the section directly with a stub `dataSource` (`getNotesForTicket` resolving a two-note fixture, `ingest` capturing events and answering `{ status: 'committed', … }` or a refusal), `make` from `makeSubmittedFactory({ actorId, origin: 'web' })`; and one test mounting `TicketSheet` with the existing sheet test harness (open `packages/app-core/test/views/ticket-sheet.test.tsx` for its `render` and stub shape) asserting the section's position: `container.querySelector('.gn-ticket-sheet__subtasks + .gn-ticket-sheet__notes + .gn-comments')` non-null.

- [ ] **Step 3: Run to verify failure.**

- [ ] **Step 4: Implement** — the component per the interface; in `ticket-sheet.tsx` mount `<TicketNotesSection dataSource={dataSource} workspaceId={workspaceId} ticketId={ticketId} projectId={<the ticket's projectId from ticketState>} currentUserId={currentUserId} canEdit={editorSlot !== undefined} make={make} onNavigate={onNavigate} onRefusal={(r) => setServerRefusal(r)} />` between `:3692` and `:3694`. CSS in `ui.css` beside `.gn-ticket-sheet__subtasks`: `.gn-ticket-sheet__notes`, `__note-badges { display: flex; flex-wrap: wrap; gap: 0.5rem; list-style: none; padding: 0; margin: 0.5rem 0 }`, `__attach`.

- [ ] **Step 5: Run to verify pass**, whole app-core suite, `pnpm typecheck`.

- [ ] **Step 6: Mutations, flip, commit.** Features §15: `- ✅ **A ticket shows its notes** — "Notes · N" between Subtasks and Comments, one badge per readable note linking to it, × to detach with Undo (spec §10.1–10.2; D5, D13).`

```bash
git add packages/app-core packages/ui test-cases Features.md
git commit -m "Notes 6/Task 1: the ticket's Notes section — live badges, detach with Undo (18.241-18.246)"
```

---

### Task 2: The Attach-note picker with the New-note row

**Files:**
- Create: `packages/app-core/src/views/attach-note-picker.tsx`; modify `ticket-notes-section.tsx`
- Test: `packages/app-core/test/views/attach-note-picker.test.tsx`
- Docs: `18.247`–`18.252`

**Interfaces:**
- Consumes: `Popover` (`packages/ui/src/components/popover.tsx:7-13`: `{ triggerRef, open, onClose, 'aria-label', children }`; the visibility editor's use at `visibility-editor.tsx:358`, `:595-600` is the template), `dataSource.query.getNotes(workspaceId)` and `searchNotes(workspaceId, text, { mode: 'lexical' })` (`data-source.ts:373-377`; **the replica rejects `searchNotes` with `ReplicaGapError`** — catch it and stay on the local list), `newUlid` from `@gisik-nokma/domain`, `noteCreatedPayload` shape (`{ title, homeProjectId, scope: { mode: 'inherit' }, attachTicketId }`), `onNavigate` (`TicketSheetProps:406`).
- Produces: `AttachNotePicker({ dataSource, workspaceId, ticketId, projectId, attachedIds: string[], make, onAttached(), onCreated(noteId), onRefusal })`: a search input `aria-label="Find a note"`; candidates = `getNotes(workspaceId)` minus `attachedIds`, filtered by title (case-insensitive `includes`), first 8; when the typed text is ≥ 3 characters and the local filter has < 8 hits, also `searchNotes` (lexical) merged by id, errors swallowed into a status line "Search needs a connection"; rows are buttons "<title> · <home>" (`role="option"` inside `role="listbox"`); the last row is always **"New note: <text>"** (disabled when the text is blank). Choosing a row → `note.attached { ticketId }` against that note → `onAttached()`; choosing New note → ONE `note.created { title: text, homeProjectId: projectId, scope: { mode: 'inherit' }, attachTicketId: ticketId }` with `entity: { kind: 'note', id: newUlid() }` → `onCreated(id)`; the section calls `onNavigate?.('/notes/' + id)`. Refusals → `onRefusal`.

- [ ] **Step 1: Cases**

```markdown
- ❌ **18.247 — the picker lists readable notes minus the attached ones, filtered by the typed text, at most 8;** control: an attached note never appears. Mutation: include attached notes.
- ❌ **18.248 — with ≥ 3 characters and < 8 local hits, `searchNotes` is called and its hits merge by id; a `ReplicaGapError` leaves the local list and shows "Search needs a connection".** Mutation: let the error propagate.
- ❌ **18.249 — choosing an existing note writes one `note.attached { ticketId }` and closes the picker.** Mutation: write `note.created`.
- ❌ **18.250 — "New note: <text>" writes ONE `note.created` with inherit scope, the ticket's project as home and `attachTicketId`, then navigates to `/notes/<id>`;** control: blank text disables the row. Mutation: two events (created + attached).
- ❌ **18.251 — keyboard: arrows move the active option, Enter chooses, Escape closes;** control: typing does not choose. Mutation: Enter with no active option chooses the first.
- ❌ **18.252 — a refused create shows the reason inline and keeps the picker open.** Mutation: close on refusal.
```

- [ ] **Step 2–6:** tests; implementation; run; mutations; flip; commit `Notes 6/Task 2: Attach-note picker with the New-note row (18.247-18.252)`. Features §15: `- ✅ **Attach a note from the ticket** — pick an existing note or create one on the spot, born attached and inherit-scoped (D12).`

---

### Task 3: The note page's ticket links use the canonical sheet path

**Files:**
- Modify: `apps/web/src/notes/note-byline.tsx:68-76` (the badge `href` is `/w/{ws}/my-work?ticket={id}` — a second spelling of the ticket URL; the canonical helper is `ticketSheetPath` cited at `TicketSheetProps:256`; open it and use it: `/w/<workspaceId>/p/<projectId>?ticket=<ticketId>`; `NoteSummary.attachedTickets` rows need the ticket's `projectId` — if the read lacks it, add `projectId` to `attachedTickets` in `read/notes.ts`'s summaries and the mappers (Plan 1 built them; an additive field))
- Test: `apps/web/test/note-document.test.tsx` (extend the badge href assertion)
- Docs: `18.253`

```markdown
- ❌ **18.253 — a note's attached-ticket badge links to the ticket's own project page with `?ticket=<id>`, the same path the board uses;** control: the note badge on the ticket links to `/notes/<id>`. Mutation: link to My Work.
```

- [ ] Commit `Notes 6/Task 3: note badges link to the canonical ticket path (18.253)`. Features §15: `- ⚙️ **One spelling of the ticket URL** from a note's byline.`

---

### Task 4: Browser cases and the close

**Files:**
- Create: `apps/web/e2e-stack/notes-ticket.spec.ts` (shape of `apps/web/e2e-stack/notes.spec.ts:16-50`: `signIn(page, OWNER_EMAIL)`, positive control first, role-based locators; the seeded Convenience Corner ticket from `global-setup.ts` reached via `/w/<ws>/p/<proj>?ticket=<id>` as `visibility.spec.ts` does)
- Docs: `18.254`–`18.257`

```markdown
- ❌ **18.254 🧪 — browser: open a seeded ticket, Attach note → "New note: Compressor log", the sheet navigates to the note page; back on the ticket the badge "Compressor log" is present without reload.**
- ❌ **18.255 🧪 — browser: × on the badge removes it; Undo brings it back.**
- ❌ **18.256 🧪 — browser (two sessions, spec §11.10 item 3): B can read an inherit note through ticket T; A narrows T's visibility; B's open note page returns to `/notes` with the toast.**
- ❌ **18.257 🧪 — browser (spec §11.10 item 4): seed a note "Compressor stopped in the cold room"; search "fridge broken" on the Notes page; the note appears in the meaning results after the pause.** (The perf case itself is Plan 3's `apps/server/test/search/perf.test.ts`, gated by `NOTES_PERF=1`; nothing to add here.)
```

- [ ] Write the four specs; they run against the dev stack built from `release/notes` (the owner's ruling; the controller runs them after the rebuild) and stay 🧪 with the recipe until then. Then `pnpm turbo run build && pnpm test > /tmp/notes6-all.log 2>&1; tail -40 /tmp/notes6-all.log`; `pnpm typecheck`; `pnpm check:citations`. No editor or domain change in this plan → no mobile bundle regeneration (state it in the PR body). PR: `bash scripts/ctl/ctl pr open task/notes-6-ticket-section --repo <worktree> --base release/notes --title "Notes 6/7: the ticket's Notes section" --body <file>`.

---

## Self-review against the spec

- **§10.1** placement/count → Task 1 (Subtasks → Notes → Comments; D5 by the read). **§10.2** badge/detach/Undo → Task 1 (`NoteBadge` from Plan 5; the sheet's first Toast). **§10.3** picker/create-from-ticket → Task 2 (the picker writes `note.created` itself; `CreateNoteDialog` stays in apps/web). **§10.4** live → Task 1 (18.246). **§11.9** ticket-section half → Tasks 1–2. **§11.10** items 1–2 are Plan 5's, 3–4 → Task 4.
- **Decisions recorded:** `canEdit` = `editorSlot !== undefined` (no client edit flag exists); toast for detach only, refusals inline; `searchNotes` offline gap handled by falling back to the local list.
- **Names:** `TicketNotesSection`, `AttachNotePicker` (this plan) ← Plan 7's `attachmentsImpliedBy` makes badges appear through the same live query.
