# UX review — executor 2

**Lane:** executor 2 (UX). **Branch:** `exec2/review-ux`, cut from `origin/main` `e4baa425`.
**Method:** the common brief's — enumerate first, cover systematically, state the boundary honestly.
**This is a report. No fix, no fix commit, no PR.** Every measurement below was taken in this worktree at
`e4baa425` unless a line says otherwise.

---

## 0. HOW TO READ THIS, AND THE ONE THING THAT SHAPES THE WHOLE REPORT

My concern is **what a person meets**. The product's help corpus — `docs/manual.md` and `docs/faq.md`,
rendered into `/help` — is a large part of what a person meets, so it is squarely in my lane, and it is
where the largest cluster of findings sits.

**A finding here is not a bug report.** Several of my findings are that a *sentence* is untrue, on a
branch that may never render, or in a document nothing checks. That is the class this repository has
recorded most often (`Prose is the untested artifact`, `checks-that-cannot-fail`), and I have graded
severity accordingly and said where I was unsure.

**Severity scale used:** Critical = a person loses data, sees another person's data, or acts on a
falsehood about money/access. Important = the product tells a person something untrue about itself, or
offers a path that cannot be completed. Minor = a true small thing, a stale count, or a claim that
over-reaches its own code.

---

## 1. ENUMERATION — my universe, written down before the findings

### 1.1 Routes a person can reach (`apps/web/app/**`, 25 route files — counted)

```
/                       → redirects to /workspaces            (app/page.tsx:3)
/workspaces                                                    (669 lines)
/sign-in                                                       (496)
/invite/[token]
/inbox                                                         (512)
/help
/account
/settings
/privacy · /terms · /not-found
/mcp/authorize · /mcp/tokens
/w/[workspaceId]                                               (1123)
/w/[workspaceId]/my-work
/w/[workspaceId]/members                                       (1002)
/w/[workspaceId]/p/[projectId]                                 (3414)
/w/[workspaceId]/settings/ticket-types{,/new,/[typeId]}
/w/[workspaceId]/settings/workflows{,/new,/[workflowId],/[workflowId]/history}
```
Measured with `find apps/web/app -type f \( -name '*.tsx' -o -name '*.ts' \) | wc -l` → **25**.

### 1.2 The view layer a person actually sees (`packages/app-core/src/views/`, 21 files)
`board.tsx` (91 KB) · `ticket-list.tsx` (60 KB) · `ticket-sheet.tsx` (141 KB) · `transition-dialog.tsx`
(25 KB) · `bulk-close-dialog.tsx` · `create-ticket-flow.tsx` · `new-ticket-dialog.tsx` ·
`reopen-dialog.tsx` · `my-work.tsx` · `comments-thread.tsx` · `attachment-list.tsx` ·
`attention-strip.tsx` · `visibility-editor.tsx` (25 KB) · `editor-slot.tsx` · `history-list.tsx` ·
`rollup-text.ts` · `list-model.ts` · `backlog-rank.ts` · `board-arrows.ts` · `board-moves.ts` ·
`field-claims.ts` · `use-live-query.ts` · `use-preferences.ts`

### 1.3 The shell and the chrome (`apps/web/src/`, 38 files)
`app-nav.tsx` · `account-menu.tsx` · `inbox-nav-link.tsx` · `last-project-nav.tsx` ·
`account/*` (profile, appearance, workspaces) · `workspace-viewer.ts` · `expired-session.tsx` ·
`shell-refusal.tsx` · `theme-toggle.tsx` · `style-toggle.tsx` · `legal-chrome.tsx` · `legal-nav.tsx` ·
`mcp-tokens-screen.tsx` · `authoring/*` · `backlog-*` · `filter-*`

### 1.4 Shared surfaces
`packages/ui/src/components/*` (avatar, button, card, chip, dialog, info-tip, segmented-control, sheet,
switch, table, **toast**) · `packages/app-core/src/inbox/inbox-view.tsx` · `calendar/calendar-view.tsx` ·
`timeline/timeline-view.tsx` · `sync/sync-status-bar.tsx` · `help/help-browser.tsx` ·
`workflow-builder/ui/*.tsx` (21 files) · `workflow-builder/ticket-types/*`

### 1.5 The copy
`docs/manual.md` (1397 lines) · `docs/faq.md` (996 lines) · `packages/app-core/src/help/content.generated.ts`
(generated, gated by `check:help`) · every user-facing string in the files above.

### 1.6 Case ids in my concern
`/help` has its own catalogue — `test-cases/15-in-app-help.md`, ids **15.1 – 15.43**, all read.
The 13.x catalogue carries the screen work; I did **not** attempt to verify 13.x ids one by one (see §9).

### 1.7 The comparison surface
Staged export at `/Users/kiro/my_projects/gisik-nokma-lanes/prototype-2026-09-20/`.
I verified the brief's warning rather than adopting it: the repo's own copy
`design-system/interactive/desktop.dc.html` is camelCased — `grep -o 'viewBox' | wc -l` → **0**,
`grep -o 'sc-camel-view-box' | wc -l` → **24**; `onClick` → **0**, `sc-camel-on-click` → **161**.
⚠ The brief says 160; I measure **161**. `viewBox` is case-sensitive in SVG, so the repo copy cannot be
the prototype. Every prototype citation below names a file in the staged export.

---

## 2. FINDINGS — nine, five parts each

Counted by severity, members named: **Important 4** (F1, F2, F3, F4), **Minor 5** (F5, F6, F7, F8, F9).

---

### F1 — IMPORTANT · The in-app help describes a product that no longer exists, in at least six places

**WHAT.** `docs/manual.md` and `docs/faq.md` — the corpus behind `/help` — carry statements that were
true of an earlier build and are false today. Named, each with the code that falsifies it:

| # | The sentence | Where | Falsified by |
|---|---|---|---|
| a | *"It has three things and no more: Workspaces / My Work / Inbox … Plus your name and a **Sign out** button on the right."* and *"**That is the entire menu.** There is no settings link, no search box, and no help link."* | `docs/manual.md:120-129` | `apps/web/src/app-nav.tsx:274-304` renders **My Work, Members, Settings** and the workspace-name link; `:333-342` renders Help and Account when signed out; `apps/web/src/account-menu.tsx:160-197` holds **Help, Account and Sign out** behind the avatar. There is no "Sign out" button on the right and no name in the bar. |
| b | *"To sign out, use the **Sign out** button on the right of the bar at the top of the screen."* | `docs/manual.md:112` | same — `account-menu.tsx:184-197`, behind the avatar menu (Round 24). |
| c | *"There is a small toggle button that cycles through three settings each time you press it"* | `docs/manual.md:133` | `apps/web/src/theme-toggle.tsx` is a `SegmentedControl` of three *segments*, not a cycling button; and it renders on `/account` (`apps/web/src/account/appearance-section.tsx:28-29`) while `app-nav.tsx` renders **no** toggle at all. |
| d | *"**Clicking the workspace name does nothing.** It is a heading, not a link. Only the project links go anywhere."* and *"with that workspace's projects listed underneath as links"* | `docs/manual.md:181-187` | `apps/web/app/workspaces/page.tsx:279-283` wraps **the entire card** in one `<Link href={/w/<id>} aria-label={workspace.name}>`, and the `<h2>{workspace.name}</h2>` sits inside it (`:290`). The per-project "links" are now one truncated **plain-text** line (`projectLine`, `apps/web/src/workspace-viewer.ts:169-178`) — there are no per-project links left to click. |
| e | *"**You cannot leave a comment on a job.** … **nothing on the web shows a comment thread** … **The phone app has a Comment button on a job and the website does not.**"* | `docs/manual.md:363-368` | `packages/app-core/src/views/ticket-sheet.tsx:2554-2578` mounts `CommentsThread` **with a live composer** (`mode="comment"`, `readOnly={false}`), and `apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx:2827` supplies the real editor. Cases 16.72–16.75 pin the thread, the route and the composer. |
| f | *"**You cannot attach a file to a job.** There is no attachment list on the web job sheet…"* | `docs/manual.md:369-372` | `ticket-sheet.tsx:2466-2467` renders `<AttachmentList entries={attachments ?? []} />` with a failure arm at `:2484-2487`, and the page actually feeds it: `apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx:2804-2805` passes `attachments={openTicketAttachments.data ?? undefined}` and `attachmentsUnavailable={…error ?? undefined}`, read from `GET /v1/workspaces/:ws/tickets/:id/attachments` (`:1102-1127`). The comment composer is also given `uploadAttachment` (`:2572`) — the docblock at `:193-199` calls it *"the only way a file can become part of a comment at all"*. |
| g | *"**Nothing in the app links to it.** There is no settings entry in the top bar. The stage builder and the job-type editor can only be reached by typing their address into the browser bar."* + *"Ask whoever set your workspace up for the addresses and bookmark them."* | `docs/manual.md:1035-1039` | `apps/web/src/app-nav.tsx:297-304` renders `<Link href={'/settings?workspaceId=' + id}>Settings</Link>` whenever a workspace is in scope. |
| h | *"Where are the settings screens? **Nothing links to them. Not in the top bar, not anywhere.**"* | `docs/faq.md:372-376` | the same `app-nav.tsx:297-304`. The FAQ answers its own headline question with "nowhere", while the answer is one click away. |

**WHY it is wrong.** `/help` is the product's own onboarding and its only in-product answer surface. A
person who reads (g) is told the screens that "make the product yours" are unreachable and is sent to ask
a colleague for a URL — in a product that renders that exact link. A person who reads (d) will avoid
clicking the one door that opens a workspace. A person who reads (e) will use the phone app for
something the web does.

**The document's own rule makes this sharper, not softer.** At `docs/manual.md:355-359` the same list
records *"The description is no longer on this list — you can write it now. It is kept here, rather than
deleted, so a reader who remembers it as an absence finds the correction where they last saw it."* So
the convention for exactly this situation is written down, was applied once, and was **not** applied to
five sibling entries in the same list. And `apps/web/app/w/[workspaceId]/page.tsx:945-957` records the
rule from the other direction: *"The documents that QUOTE this sentence (`README.md`, `docs/manual.md`,
`docs/faq.md`) … are corrected in the same change set, because a quotation of a string that no longer
exists is a citation that still resolves and still misleads."* That rule exists in this repo and was
applied to one sentence.

**WHAT WOULD HAVE BEEN BETTER.** Either (i) update the six passages in the change set that made each
one false — the docblock above says this is already the convention; or (ii) if the corpus is now
hand-maintained and slow to follow, say so at the top of `/help` and stop making absolute claims about
the chrome ("the entire menu", "nothing links to them… not anywhere"); or (iii) derive the nav section
from `navDef`-shaped data the way the sidebar derives its groups, so it cannot drift.

**THE MEASUREMENT.** Every line above was opened and read in this worktree at `e4baa425`. The positive
control for the strongest one (g/h) is a **live test on the same path**: `apps/web/test/app-nav.test.tsx:592`
asserts `expect(screen.getByRole('link', { name: 'Settings' })).toBeInTheDocument()` — case **13.428**,
whose own name is *"THE JITTER. Owner: 'the nav bar item jitters on changing pages.'"*. So the Settings
link is not merely present in the source; it is rendered by a suite the gate collects.

**SEVERITY: Important.** I considered Critical and declined: nothing is destroyed, no wrong write is
made, and the person can discover the truth by looking at the bar. What is wrong is that the product's
own help misdescribes the product — repeatedly, and in the direction that makes it look less capable
than it is.

---

### F2 — IMPORTANT · The only gate over the help corpus cannot fail on the property that matters

**WHAT.** `pnpm check:help` runs `node scripts/help-content.mjs --check`. Run here: **EXIT 0**, printing
`help-content: ok (2 documents, 29 sections, 231 entries, generated copy matches source)`.

It verifies that `content.generated.ts` was generated **from** `docs/manual.md` + `docs/faq.md`. It has
no assertion about whether either document is **true of the product**. Every one of F1's eight rows
passes it. So the corpus can drift arbitrarily far from the build and the gate stays green by
construction.

**WHY it is wrong.** `test-cases/15-in-app-help.md:38-42` names the hazard exactly — *"A generated
artifact with no check against its source goes stale silently — users reading an old manual while
`docs/manual.md` says something else, with no symptom until somebody follows an instruction that
stopped being true."* **The gate guards the narrower half of its own stated hazard.** The half it names
— following an instruction that stopped being true — is precisely what F1 is, and it is unguarded.

**WHAT WOULD HAVE BEEN BETTER.** The corpus cannot be verified against the product mechanically in
general, but the parts that can be are the parts that keep breaking: **strings quoted from the product**
(`manual.md` quotes "No workspaces yet. Ask an admin for an invite link — or create your own." and
"No workspaces yet…" — cacheable), **route mentions** (`/settings` appears in prose as an address), and
**named controls** (`Sign out`, `Settings`, `Comment`). A check that every back-ticked control name in
the manual appears as a literal in `apps/`+`packages/` would have caught rows (a), (b), (c) and (g) on
the day each broke. The repo already has this pattern elsewhere (`check-runbook-commands.mjs` verifies
every command the runbook names).

**THE MEASUREMENT.** `node scripts/help-content.mjs --check > /tmp/ux-help-check.log 2>&1; echo EXIT=$?`
→ `EXIT=0`; tail of the log quoted above. The gate is real and passes; that is the point.

**SEVERITY: Important.** Not Minor, because this is the *mechanism* by which F1 happened and will happen
again: a green light over an unverified artifact is worse than no light.

---

### F3 — IMPORTANT · A comment renders as plain text while the composer offers marks it discards; a link's destination is unrecoverable

**WHAT.** The comment composer is the real editor and offers **Bold, Italic, Code, Link, List, Quote**.
The thread renders each comment body through `docToPlainText`, which reads a node's `type`/`text`/`attrs`
and **ignores `marks` entirely**. Consequences, in the person's terms:

| a person does | stored | rendered in the thread |
|---|---|---|
| bolds a word | `marks: [{type:'bold'}]` | plain — the emphasis is gone |
| italicises, or marks code | same shape | plain |
| types `[text](url)` or uses the Link button | `marks: [{type:'link',attrs:{href}}]` | **the label only; the URL is gone and is not recoverable on screen** |
| makes a bulleted or numbered list | `bulletList`/`orderedList` | lines **with no bullets or numbers** |
| quotes with `>` | `blockquote` | a line break |
| `@`-mentions someone | `mention` node | `@Name` — **preserved** |
| embeds an image | `image` node | **nothing** (documented) |

**WHY it is wrong.** Three reasons, in increasing order of cost.

1. The product teaches the thing it discards: `packages/editor/src/components/EditorToolbar.tsx:56`
   exports `MARKDOWN_HINT = 'Markdown: **bold**, *italic*, `code`, > quote, - list, [text](url)'`, and
   the toolbar draws `B i code link list quote` in the prototype's order (`:107-119`).
2. The **link** case is not a lesser rendering, it is a **loss**: the destination cannot be read back
   from the screen, and the case that pins the behaviour pins it for the search index's motive, not the
   thread's — `packages/editor/test/doc-text-conformance.test.ts:163`
   *"renders a link as its text, not its href — the URL is never indexed"*. **A search decision has
   become a display decision, because one function serves both.**
3. The description row in the same sheet renders the same kind of document **richly** — `editorSlot` is
   `TicketEditorSlot` (`apps/web/.../page.tsx:2827`), a Tiptap `EditorContent` — so **the same document
   type renders one way in the description and another way in the comment directly beneath it.**

**WHAT WOULD HAVE BEEN BETTER.** Either render the thread through the read-only editor (as the
description does), or render through a projection that keeps marks and hrefs; or, if plain text is the
decision, **remove the formatting controls from the comment composer** and say why. The one thing that
should not stand is a toolbar whose output the next block deletes.

**THE MEASUREMENT.** `packages/app-core/src/views/comments-thread.tsx:118` `const text =
docToPlainText(comment.body);` and `:129` `<p className="gn-comment__body">{text}</p>`.
`packages/domain/src/doc-text.ts:51-76` — `render()` returns `candidate.text` for a `text` node and
never reads `candidate.marks`. The composer: `ticket-sheet.tsx:2558-2576` (`mode="comment"`,
`readOnly={false}`) reached through `editorSlot={TicketEditorSlot}` at
`apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx:2827`.

**Classification, stated honestly.** The *thread renders plain text* is a declared decision —
`test-cases/16-remaining-doors.md:1118`, *"A comment's files are CHIPS, not inline images. `docToPlainText`
draws an `image` node as nothing…"* — **but that recorded rationale covers images only.** I searched for
a ruling on the marks/href loss and found none: `packages|apps|test-cases` contain no text addressing
link or emphasis loss in the thread, and the only pin on the behaviour is the search-motivated
conformance case. So this is **category 3: diverges, no ruling found**, with the search that failed to
find one named above.

**SEVERITY: Important.**

---

### F4 — IMPORTANT · The visibility editor's read-only sentence can never render in the shipped app — and states the rule wrongly

**WHAT.** `packages/app-core/src/views/visibility-editor.tsx:441-443` renders, for a viewer who may not
edit:

> *"Only a project admin, or whoever created this ticket, can change who sees it."*

Two independent defects in one arm.

**(i) It is dead.** It renders only when `canEdit === false`. `canEdit` is the sheet's `canSetVisibility`
prop, whose declared default is `true` (`ticket-sheet.tsx:422`, `canSetVisibility = true`), and a
measured sweep of **`apps/web/**`, `apps/desktop/**` and `apps/mobile/**`** for `canSetVisibility` finds
**one hit, and it is a comment** (`apps/web/app/w/[work…]/p/[projectId]/page.tsx:2825`);
`apps/desktop` + `apps/mobile` yield **0 hits across 27 files scanned**. **No caller anywhere passes
it.** So the arm cannot render in any shipped surface.

**(ii) It is false.** The server's rule (`apps/server/src/permissions/check-permission.ts:1058-1060`) is
`allowed = (visibility !== null && hasProjectAdminRights(ctx.eff, visibility.projectId)) || ctx.sessionUserId === creatorId`,
and `hasProjectAdminRights` (`apps/server/src/permissions/effective-role.ts`) is
`workspaceRole === 'owner' || workspaceRole === 'admin' || projectAdmin`. So a **workspace owner or
admin can change any ticket's visibility** — the sentence omits both.

Its own sibling two lines up has it right: `visibility-editor.tsx:31`
`OWNER_ALWAYS_SEES_COPY = 'Visible to: these people — and the workspace owner, always.'`, and the
lockout warning at `:34` reads *"A project admin — or the workspace owner, who always sees — can restore
it."* **Two sentences in one component, disagreeing about who may act.**

**WHY it is wrong.** This is the product's answer to *"then who can?"* — the exact question a person
who has just been told "no" is asking. Getting it wrong sends them to the wrong colleague, and the
omission is invisible to the people best placed to notice it (owners never read it).

**WHAT WOULD HAVE BEEN BETTER.** One sentence, checked against `check-permission.ts` the way the sibling
was: *"Only a project admin, a workspace owner or admin, or whoever created this ticket, can change who
sees it."* And the dead arm should either be deleted or given the read that makes it reachable — the
sheet's own docblock at `:225-241` argues at length that the client cannot know role or creator, which
is a sound argument for showing the control and letting the door refuse; it is **not** an argument for
keeping an unreachable sentence that is also wrong.

**THE MEASUREMENT.** Default: `ticket-sheet.tsx:422`. Sweep: `node`-walk of `apps/web/**`,
`apps/desktop/**` and `apps/mobile/**` for `canSetVisibility` → `page.tsx:2825` (a comment) in web,
**0 across 27 files** in desktop+mobile; the denominator is stated so the walk is falsifiable rather
than a silent empty. Server rule read at `check-permission.ts:1052-1064`; `hasProjectAdminRights` read
in `effective-role.ts`. Sibling copy read at `visibility-editor.tsx:31` and `:34`.

**SEVERITY: Important.** (i) alone would be Minor — a dead branch. (ii) alone would be Minor — a copy
error. Together they are the permission surface, and this repository treats permission copy as
load-bearing.

---

### F5 — MINOR · The founding flow lands a new owner on a page of four negatives; the prototype lands on the list with a confirmation

**WHAT.** `FoundingForm` navigates to `/w/<workspaceId>/my-work` on success
(`apps/web/app/workspaces/page.tsx:613-614`). For a workspace founded seconds earlier there are no
projects and no tickets, so `MyWork` (`packages/app-core/src/views/my-work.tsx`) renders exactly four
sentences and nothing else:

> *"Nothing assigned to you." · "No claims in transit." · "No contested claims." · "Nothing has been shared with you."*

No control, and no pointer to the New-project form — which exists, on `/w/<id>`
(`apps/web/app/w/[workspaceId]/page.tsx:958-964`, `NewProjectForm`). The manual's own §3 says why that
matters: *"A brand-new workspace has no projects… Jobs live inside projects. So a workspace with no
projects has nowhere to put work."* (`docs/manual.md:174-175`).

The prototype does the other thing: `foundWorkspace` (`Gisik Nokma - Desktop.dc.html:2741-2752`) stays
on the Workspaces screen, appends the card, and toasts *"<name> created · you are its owner"*. No
navigation, and a confirmation. The implementation navigates away and confirms nothing.

**WHY it is wrong.** The first thing a person does after founding is look for somewhere to put work.
The flow answers with four statements that work does not exist, and the page that can fix that is one
nav click away with nothing pointing at it. It is not a dead end — `AppNav` renders the workspace-name
link — but the flow itself does not advance.

**WHAT WOULD HAVE BEEN BETTER.** Land on `/w/<id>` (the workspace home, which carries the New-project
form for an owner), or land on the list with the prototype's confirmation toast, or (cheapest) keep the
`/my-work` destination and give the all-empty My Work state a first-run sentence with a link when the
workspace has no projects.

**THE MEASUREMENT.** Destination: `apps/web/app/workspaces/page.tsx:613-614`; witnessed by
`apps/web/test/founding.test.tsx:126-131` (*"posts the name and routes the founder into their new
workspace"*, asserting `push('/w/01J9WORKSPACE0000000000000/my-work')`) — **so the destination is
deliberate and tested; it is the choice I am reporting, not a regression.** Prototype read at
`Gisik Nokma - Desktop.dc.html:2741-2752`. My Work's four sentences: `my-work.tsx:77, 88, 99, 118`.

**Classification.** Category 3 — **diverges from the prototype, no ruling found.** I searched for one
in `docs/lanes/controller-state.md` (8635 lines) and the coordination doc for the founding destination
and found none. **Control for that null, run on the same path:** the same search method for `"founding"`
returns **12 hits** and for `"my-work"` returns **11**, so the file is readable and searchable and the
miss is a real absence, not a silent empty.

**SEVERITY: Minor.** The path is completable; the friction is at first-run, which is where it is least
affordable but not where it is fatal.

---

### F6 — MINOR · A docblock states an absolute that the same card falsifies four lines later

**WHAT.** `apps/web/app/workspaces/page.tsx:165-169` argues the guest arm:

> *"`archivedCount` is deliberately not read on this branch either, for the same reason: **a guest gets no numbers at all, not a subset of them.**"*

Four lines below the branch it describes, `:333-335` renders
`{restricted !== null ? <p className="gn-workspace-card__restricted">{restricted}</p> : null}`, where
`restricted = restrictedLine(workspace.nameRestrictedProjectCount)` and
`restrictedLine` (`apps/web/src/workspace-viewer.ts:107-110`) returns **`"1 project · name restricted"`**
— a number, shown to a guest, on the same card.

**WHY it is wrong.** The behaviour is arguably right (a guest must be able to tell "no projects" from
"projects withheld"), and `workspace-viewer.ts:152-163` **says so** — it records that 13.380 was
*retitled* precisely because "the card's own '1 project · name restricted' is a number, so the original
'no number anywhere' title was false". So the exception is known and documented at the second site; the
`ChipRow` docblock was simply never carried along. This is the repo's most-catalogued shape — a sentence
true of one path stated of the product — surviving in the one file where it has already been corrected
once.

**WHAT WOULD HAVE BEEN BETTER.** Scope the sentence to what it governs: *"no count chips on this branch
— a guest gets no ticket, member or archived numbers"*, and name the restriction sentence as the
deliberate exception, as `workspace-viewer.ts` already does.

**THE MEASUREMENT.** `apps/web/app/workspaces/page.tsx:165-169` (claim) vs `:333-335` (render) vs
`apps/web/src/workspace-viewer.ts:107-110` (`restrictedLine` returns a number) vs `:152-163` (the
acknowledged exception). All four read in this worktree.

**SEVERITY: Minor.** A comment defect with no runtime effect — but this file's own history says a
comment defect here becomes a test title, and a test title becomes a check that cannot fail.

---

### F7 — MINOR · The epic group count diverges from the prototype, and the divergence is declared but not ruled

**WHAT.** Under the List's `epic` grouping, the section band reads
`` `${groupMeta} · ${section.rows.length} tickets` `` (`packages/app-core/src/views/ticket-list.tsx:669`),
counting the **epic row itself** among its children. The prototype counts children only: it builds the
sentence at `:2923` from `const n = g.items.length` (`:2920`) while holding the epic separately in
`g.epic` (`:2904`) and rendering it above (`:2927-2928`) — so an epic with three children reads
`epic · 3 tickets` there and `epic · 4 tickets` here.

**WHY it is wrong — and how strongly.** The implementation's count is defensible and arguably better:
the band then answers for the membership actually on screen. But the divergence is recorded only as
*"DECLARED DIVERGENCE, kept deliberately"* (`ticket-list.tsx:656-664`) — **an author's decision with a
strong argument, which is not the same thing as a ruling.** The prototype is the owner-designated
comparison surface, and a count that reads `4` where the drawing says `3` is exactly the kind of small
visible difference the brief asks me to classify rather than pass over.

**WHAT WOULD HAVE BEEN BETTER.** Either adopt the prototype's children-only count, or have the band say
which membership it is counting (`epic · 4 rows (3 tickets)`), or get one line of owner ruling and
record it beside the divergence. Any of the three closes it.

**THE MEASUREMENT.** Implementation: `ticket-list.tsx:666-671` reads
`` `${groupMeta} · ${section.rows.length} ${…`ticket`/`tickets`}` ``.
Prototype: **opened directly, not inherited from the docblock.** `Gisik Nokma - Desktop.dc.html:2904`
`if (isEpicT(t)) { const g = push(t.id, t.title, "epic"); g.epic = t; return; }` — the epic goes into
`g.epic`, **not** into `g.items`; `:2920` `const n = g.items.length;`; `:2923`
`meta: g.meta + " · " + n + (n === 1 ? " ticket" : " tickets")`; `:2927`
`if (g.epic) pushRow(g.epic, 0, g.items.length);` — the epic **is rendered as a row** while being
excluded from the count. So the docblock's description is accurate, and the divergence is real:
the drawing renders four rows under a band that says three.

**Classification.** Category 3 — diverges, no ruling found.
**SEVERITY: Minor.**

---

### F8 — MINOR · A recorded self-test count is stale, in the block that documents the freshness gate

**WHAT.** `test-cases/15-in-app-help.md:44` records the parser's self-test as *"(10 cases, 4 of them
planted defects)"*. The runner prints **`self-test passed (12 cases, 5 of them planted defects)`**. The
same entry says *"a parser reporting "224 entries" tells you it ran"*; the current count is **231**.

**WHY it is wrong.** This is the entry asserting that the instrument is self-checking. A reader
calibrating trust from that number is reading a figure that stopped being true two cases ago. It is
Minor in itself, but it sits in the same block as the `15.14–15.16` ❌ entries, so the section's own
"here is what is and is not witnessed" ledger is the thing that has drifted.

**WHAT WOULD HAVE BEEN BETTER.** State the count without the number (*"the self-test's own cases, each
planted defect named"*), or generate it — `scripts/help-content.mjs` prints the figure on every run, so
a check could assert the entry matches.

**THE MEASUREMENT.** `node scripts/help-content.mjs --check 2>&1 | tail -3` →
`help-content: self-test passed (12 cases, 5 of them planted defects)` /
`help-content: ok (2 documents, 29 sections, 231 entries, generated copy matches source)`.
Entry read at `test-cases/15-in-app-help.md:44`.

**SEVERITY: Minor.**

---

### F9 — MINOR · A comment box is offered on a ticket where the post can only be refused

**WHAT.** `packages/app-core/src/views/ticket-sheet.tsx:2537-2552` keeps the comment composer mounted when
the thread read failed, and names the cost in its own words: *"on a 404 — an invisible or deleted
ticket — the box is offered and the post will be refused."*

**WHY it is wrong — and why I am reporting it anyway.** My brief asks me to find controls that still
offer what can only be refused, and this is one, stated by the code itself. But the trade-off is
reasoned and the alternative is genuinely worse (*"gating the box on `comments.error` would hide a
working control every time a transient read failed"*), and the refusal lands in the sheet's own refusal
slot in the server's words. So this is a **priced, declared cost with no ruling**, not an oversight.

**WHAT WOULD HAVE BEEN BETTER.** Nothing obvious — which is the point of reporting it. If the controller
rules it accepted, the sentence at `:2547-2552` should say so and name the ruling, so the next reader
does not re-open it.

**THE MEASUREMENT.** `ticket-sheet.tsx:2537-2552`, read in full. Reachability of the 404 arm: the sheet
can be opened from a notification or a stale deep link for a ticket that has since been deleted or made
invisible; I did **not** drive that path in a running browser, so **the reachability is reasoned, not
measured.**

**SEVERITY: Minor.**

---

## 3. THE PROTOTYPE — classified, per the brief's three categories

| Surface | Class | Note |
|---|---|---|
| Nav items (`navDef`, `Gisik Nokma - Desktop.dc.html:2436-2447`; filter at `:2595`) | **2 — ruled** | Prototype has `Workspaces · ws.name · Board · My work · Inbox · Members · Settings · Help · Account`. The shipped bar has no **Board** (owner, Round 23: *"the board on the nav bar doesn't work. lets remove it"*), moves **Help/Account/Sign out** into the account menu (owner, Round 24), makes **Inbox** an icon beside the avatar (Round 24), and adds **LastProjectNav** (owner, 2026-09-18). Each is quoted at `app-nav.tsx:23-182`. The divergence still serves its rulings. |
| Scope note | **1 — matches** | Prototype `navScope`: *"No workspace selected — pick one to reach its board, members and settings."* Shipped `app-nav.tsx:381-383`: **byte-identical**. |
| Help topics pane (`help-topics-pane.md`) | **1 — implemented, evolved** | The spec asked for `<details>` groups; the shipped `help-browser.tsx:511-579` uses a button + `aria-expanded` sidebar with a scroll-spy and fragment fallback (`:591-606`). The spec's one hard constraint — *"Keep anchors, don't swap panes"* — holds: `#${document.id}-${section.id}` still renders (`:686-691`). |
| Workspace home screen (`github.md`) | **1 — implemented** | `github.md` names *"**Gap in the repo**: `apps/web/app/w/[workspaceId]/` … NO `page.tsx` at the workspace root"*; the file exists today (1123 lines). The spec is a snapshot of an older tree, not a live gap. |
| Epic group count | **3 — no ruling found** | See F7. |
| Founding destination | **3 — no ruling found** | See F5. |
| Comment thread rendering | **3 — no ruling found (for marks/hrefs)** | See F3. The plain-text *choice* is declared at 16.74; the rationale addresses images only. |
| `workspaces-gap.md`'s twelve gaps | **mostly closed** | Items 1–7, 9, 11 are built (`workspaces/page.tsx:185-194`, `:288`, `:308`, `:314-331`); item 8 (no workspace-home route) and item 10 (guest counts stated rather than withheld) are closed. **That document is stale and should not be read as a to-do list.** |
| Repo copy `design-system/interactive/desktop.dc.html` | **not a comparison surface** | Measured camelCased (see §1.7). Any inherited comparison made against it should be re-run. |

---

## 4. THE NINE EDGE CLASSES — what I actually walked

Walked in depth on: **Workspaces**, **My Work**, **the ticket sheet** (parent indicator, subtasks,
comments, visibility), **the Board's empty/narrowing arms**, **the sign-in card**, **the Toast/undo**,
**the help browser**.

| Class | Where I found it handled | Verdict |
|---|---|---|
| EMPTY | `workspaces/page.tsx:84-88` · `my-work.tsx:77,88,99,118` · `board.tsx` `EMPTY_BOARD_COPY`/`EMPTY_BOARD_EPICS_COPY` (`:184,:207`) / `EMPTY_COLUMN_*` (`:239,:263`) · `ticket-list.tsx:697-700` · `comments-thread.tsx:169` · `help-browser.tsx:671-678` · `w/[workspaceId]/page.tsx:887` | **Strong, and unusually precise.** The product distinguishes kinds of nothing rather than printing one blank: all-epic vs empty (`backlogNarrowing.epicsOnly`, `page.tsx:963,2566-2568`), narrowed vs empty (Ruling 19), *"No comments yet."* vs a failed read. |
| LOADING | `workspaces/page.tsx:83` `<p>Loading…</p>` · `my-work/page.tsx:75` | Handled. Notably absent from `InvitationBanner` **by design** (`:404-410`: *"a banner that flashed 'Loading…' would announce a possibility that usually is not there"*) — correct. |
| ERROR | `ShellRefusal` at `workspaces/page.tsx:81`, `my-work/page.tsx:65,71`; `comments-thread.tsx:178-182`; `board.tsx:1786-1807` | Strong. The comments failure sentence is the model: *"That is a failure of this read, not a statement about the ticket: it may answer on a retry."* |
| PERMISSION-REFUSED | `w/[workspaceId]/page.tsx:958-964`; `visibility-editor.tsx:433-438` | Mixed — **F4**. The project form is right (asks before it offers); the visibility control is shown-then-refused, argued but unruled. |
| OFFLINE / REPLICA-DEGRADED | `sync/sync-status-bar.tsx`; `replica-data-source.ts` | Not walked in depth — **not covered** (see §6). |
| SOFT-DELETED | `proj_tickets.deleted_at` + partial index (`1789800000000_proj-tickets-deleted.sql`); views exclude; undo at `page.tsx:826-852` | Strong. The undo is a real `ticket.restored` write, fail-closed (`undoFor: null`), with its own sentence for a refused vs unreachable restore. |
| CONCURRENT / INTERLEAVED | `ticket-sheet.tsx` claim/version handling; `transition-dialog.tsx` | Not walked in depth — **not covered**. |
| NARROW VIEWPORT | `playwright.viewport.config.ts` (own port 3021, `reuseExistingServer: false`), **gated in CI** (`ci.yml:610-665`, fanned into `gate:` at `:672-675`) | **Strong — the strongest single thing I found.** The config's docblock argues the failure modes and the suite is genuinely on the gate. |
| FIRST-RUN | `workspaces/page.tsx:88` (the sentence *"Ask an admin for an invite link — or create your own."*) · `w/[workspaceId]/page.tsx:958-964` | **Weak at the seam** — **F5**: each page is right, the *flow between them* lands the new owner on a page that cannot advance. |
| **SERVER REFUSES WHILE CLIENT BELIEVES** | `visibility-editor.tsx:288-308` (empty results array is *not* a commit: *"reporting success would be this component inventing the answer"*) · `page.tsx:826-849` · `ticket-sheet.tsx` refusal slots | **Strong where I looked.** Refusals render in the server's own words; a `committed` is the only success. The one named cost is F9. |

---

## 5. CASE IDS IN MY CONCERN

- `/help`: **15.1 – 15.43** read in full. The parser/search/sidebar properties are well witnessed. The
  **content-truth property has no case at all** (F2), and 15.13's recorded count is stale (F8).
  15.14–15.16 are honest ❌ with recorded owners.
- The epic/backlog sentences are pinned by **13.1044** (both arms of the two empty-backlog sentences).
- The founding destination is pinned by **3.126** (`founding.test.tsx:126`).
- The nav's Settings link is pinned by **13.428** (`app-nav.test.tsx:585-593`).
- 13.380's *title* was corrected once for the "no number anywhere" over-claim (F6) — the code comment
  was not.
- **I did not verify the 13.x catalogue id by id.** 2606 ids exist; verifying each against the product
  is not achievable in this pass and I will not imply otherwise.

---

## 6. COVERAGE — what I read, what I did NOT reach, and why

**Read and reviewed in this worktree at `e4baa425`:** `app-nav.tsx` (full), `account-menu.tsx` (full),
`workspace-viewer.ts` (full), `my-work.tsx` (full), `comments-thread.tsx` (full), `toast.tsx` (full),
`doc-text.ts` (full), `workspaces/page.tsx` (full), `my-work/page.tsx` (full), `sign-in/page.tsx` (the
card, methods, states), `w/[workspaceId]/page.tsx` (the states, the founding form, the archive/count
arms), the ticket sheet's parent indicator, subtask section, comment mount and visibility mount,
`visibility-editor.tsx` (the section), `ticket-list.tsx` (grouping, empty copy, `emptyCopy`),
`board.tsx` (the state arms by extraction), `help-browser.tsx` (the sidebar and the states),
`playwright.viewport.config.ts`, `.github/workflows/ci.yml` (the `viewport` and `gate` jobs),
`docs/manual.md` (targeted, and the §1–§11 headings in full), `docs/faq.md` (targeted),
`test-cases/15-in-app-help.md` (full).

**NOT reached, named rather than implied:**

1. **`ticket-sheet.tsx` in full.** I read the parent indicator (~2100–2265), the subtasks section
   (~2183–2260), the comment mount (~2518–2578), the delete path (~1180–1207) and the description row
   (~2382–2450) — roughly 15% of 3800 lines. The fields section, history tab, assignee row, dates rows
   and the transition/close/reopen controls I did **not** read line by line.
2. **`board.tsx` in full** — I reviewed its state arms by extraction, not the drag/move machinery.
3. **The five flows end-to-end** (create→assign→transition→close→reopen; invite→join; the subtask chain
   as a whole; attachments; the delete/undo round trip) — a background sweep was dispatched for these
   and **had not returned when this report was finalised**; if it lands after, its findings belong in
   the controller's compiled report and not in this file.
4. **`apps/mobile`** — untouched. The manual's claim (e) contrasts the phone and the web; I verified the
   web half only.
5. **`apps/desktop`** — untouched.
6. **`/inbox`, `/members`, `/account`, `/settings`, `/mcp/*`** — listed, not walked.
7. **The workflow builder and the ticket-type editor** (`packages/app-core/src/workflow-builder/**`,
   36 files) — not walked.
8. **`test-cases/13-*.md`** — not verified id by id (see §5).
9. **No running browser.** I did not open the app. `:3001` serves executor 1's worktree, not this one,
   and I did not bind `:3021`. **Every finding above is a code reading**, not an observation. Where a
   reading could not settle a question I have said so at the site: **F9's reachability** (reasoned, not
   driven) and **F1 row (e)** (dependent on a runtime editor mount). The prototype half of F7 was
   written as inherited and **was then opened directly** (`Gisik Nokma - Desktop.dc.html:2904/2920/2923/2927`)
   and is measured.

**Stale figures I was given, recounted rather than adopted** (the brief says to recount, and the
workspace rule says counts are readings that expire):

| Claim | Measured | Command |
|---|---|---|
| *"2601 ids across 25 files"* | **2606 ids, 25 files** | `node scripts/check-case-ids.mjs` → `bare 1136, bold 1182, marker-first 288, sum 2606, union 2606, 25 files scanned` |
| *"`onClick` → `sc-camel-on-click` (160 attributes)"* | **161** | `grep -o 'sc-camel-on-click' design-system/interactive/desktop.dc.html \| wc -l` |
| `test-cases/15-in-app-help.md:44` *"10 cases, 4 planted"* | **12 cases, 5 planted** | `node scripts/help-content.mjs --check` |

---

## 7. WHAT I AM LEAST SURE OF — aim here first

1. **F3's classification.** The thread's plain renderer is declared; the composer's toolbar is not
   addressed by anything I found. If a ruling exists that I missed, F3 becomes category 2 and should be
   rejected. **This is the finding most likely to be wrong and the most expensive to leave wrong.**
2. **F5's severity.** I called it Minor. If the owner considers first-run a gate rather than a polish
   pass, it is Important — the argument for Important is that the flow's *own* destination page cannot
   advance the journey it just started.
3. **F1's row (e) only — (f) is now closed.** The attachment half is measured end to end (the sheet
   mounts the list, the page feeds it from its own read — see the row (f) citation), so "there is no
   attachment list on the web job sheet" is false with no dependence on a runtime mount. The **comment**
   half still depends on `TicketEditorSlot` mounting successfully: the mount is unconditional and
   `editorSlot` is passed, but if the editor fails to mount, `EditorSlot` falls back to
   `PlainTextEditorSlot` and `ticket-sheet.tsx:2526-2535` then draws **no composer** — at which point
   the manual's "you cannot leave a comment" is true on that path. I did not drive it in a browser.
4. **F4(i) — now closed across all three apps, but by a sweep rather than by a run.** `canSetVisibility`
   has zero callers in `apps/web`, `apps/desktop` and `apps/mobile` (27 files in the latter two). If a
   caller is added later, or if a mount passes `false` through a spread I did not follow, the arm
   renders and the finding narrows to (ii) alone. What remains genuinely unverified is only whether
   some *future* caller exists; today's tree has none.

---

## 8. WHAT I DID NOT DO

No fix. No fix commit. No PR. Nothing was edited except this report. This is on purpose: the brief
records that the fix round is where this project's last three defects were introduced, and two of my
nine findings are themselves comments that a fix round wrote.

---

*executor 2 — UX. Report complete. Branch `exec2/review-ux` pushed for the controller to collect.*
