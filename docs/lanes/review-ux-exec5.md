# UX review — executor 5 (Opus, round 2)

**Started:** 2026-09-21 09:42:09 IST. **Lane:** executor 5 (UX). **Branch:** `exec5/review-ux`, cut from
`origin/main` `a7b6292b78c50208e8055c9f8639b1e8dcf4caa0`. **Backend:** Claude API, Opus 5.
**This is a report. No fix, no fix commit, no PR.** Every measurement below was taken in this worktree at
`a7b6292b` unless a line says otherwise. Browser observations were taken against the owner's running dev
stack (`gisik-nokma-dev-web-1`, container created 2026-09-21T02:50:16Z = 08:20 IST, serving the primary
checkout), **read-only** — no ticket, comment, member or setting was created or changed through it.

**Competing against:** `docs/lanes/review-ux-exec2.md` (DeepSeek, round 1, 19 findings, all 19 ACCEPTED in
`docs/lanes/review-compiled-controller.md` §5). Its own coverage section (§6) names what it did not reach;
that list is my target list (§1.9 below).

---

## 0. HOW TO READ THIS

My concern is **what a person meets**. Finding ids are `E5-<n>`. Each carries WHAT · WHY · WHAT WOULD HAVE
BEEN BETTER · MEASUREMENT (command + the line I opened) · SEVERITY (Critical / Important / Minor, claimed).

**Severity scale:** Critical = a person loses data or work they typed, sees another person's data, or acts on
a falsehood about money/access. Important = the product tells a person something untrue about itself, offers
a control that can only be refused, or leaves a person with no way forward. Minor = a true small thing, a
stale count, or a claim that over-reaches its own code.

**The one instrument round 1 did not have:** a running browser. Where a finding rests on a painted, driven
observation, the finding says `[BROWSER]` and names the route, the container build, and the source line that
explains what was seen. Where it rests on code alone it says `[SOURCE]`.

**Not re-found here on purpose (scores 0):** the 19 landed findings F1–F9, V1–V10 of exec 2. Where I add a
measurement the landed one lacks, the finding says so and names the landed id.

---

## 1. ENUMERATION — my universe, written down before the findings

### 1.1 Routes a person can reach — `apps/web/app/**`, 24 `page.tsx` + 1 `layout.tsx` (counted: `find apps/web/app -name page.tsx | wc -l` → 24)

| route | file | lines | walked in browser? |
|---|---|---|---|
| `/` | `app/page.tsx` | — | redirects to `/workspaces` |
| `/workspaces` | `app/workspaces/page.tsx` | 669 | |
| `/sign-in` | `app/sign-in/page.tsx` | 496 | |
| `/invite/[token]` | `app/invite/[token]/page.tsx` | 127 | |
| `/inbox` | `app/inbox/page.tsx` | 512 | |
| `/account` | `app/account/page.tsx` | 309 | |
| `/settings` | `app/settings/page.tsx` | 382 | |
| `/help` | `app/help/page.tsx` | 23 | |
| `/privacy`, `/terms` | `app/privacy/page.tsx`, `app/terms/page.tsx` | 202, 209 | |
| `/mcp/authorize` | `app/mcp/authorize/page.tsx` | 260 | |
| `/mcp/tokens` | `app/mcp/tokens/page.tsx` | 33 | |
| `/w/[workspaceId]` | `app/w/[workspaceId]/page.tsx` | 1122 | |
| `/w/[workspaceId]/my-work` | `app/w/[workspaceId]/my-work/page.tsx` | 82 | |
| `/w/[workspaceId]/members` | `app/w/[workspaceId]/members/page.tsx` | 1002 | |
| `/w/[workspaceId]/p/[projectId]` | `app/w/[workspaceId]/p/[projectId]/page.tsx` | 3414 | |
| `/w/[workspaceId]/settings/ticket-types` (+ `/new`, `/[typeId]`) | 3 files | 34, 34, 35 | |
| `/w/[workspaceId]/settings/workflows` (+ `/new`, `/[workflowId]`, `/[workflowId]/history`) | 4 files | 40, 77, 102, 53 | |

### 1.2 The view layer — `packages/app-core/src/views/` (23 files)

`attachment-list.tsx` · `attention-strip.tsx` · `backlog-rank.ts` · `board-arrows.ts` · `board-moves.ts` ·
`board.tsx` (91K) · `bulk-close-dialog.tsx` · `comments-thread.tsx` · `create-ticket-flow.tsx` ·
`editor-slot.tsx` · `field-claims.ts` · `history-list.tsx` · `list-model.ts` · `my-work.tsx` ·
`new-ticket-dialog.tsx` · `reopen-dialog.tsx` · `rollup-text.ts` · `ticket-list.tsx` (60K) ·
`ticket-sheet.tsx` (141K) · `transition-dialog.tsx` · `use-live-query.ts` · `use-preferences.ts` ·
`visibility-editor.tsx`.

### 1.3 The shell and chrome — `apps/web/src/` (38 files)

`app-nav.tsx` · `account-menu.tsx` · `account/{account-clients,appearance-section,profile-section,workspaces-section}` ·
`auth-client.ts` · `authoring/{builder-wiring,data-source-gateway}` · `backlog-rank-controls.tsx` ·
`backlog-start-button.tsx` · `backlog-start.ts` · `board-search-scope.ts` · `expired-session.tsx` ·
`filter-cycle.ts` · `filter-edits.ts` · `inbox-nav-link.tsx` · `ist-today.ts` · `last-project-nav.tsx` ·
`legal-chrome.tsx` · `legal-nav.tsx` · `list-narrowing-word.ts` · `mcp-tokens-screen.tsx` · `providers.tsx` ·
`shell-refusal.tsx` · `style-toggle.tsx` · `theme-toggle.tsx` · `ticket-dates-input.ts` · `ticket-location.ts` ·
`ticket-type-editor-pane.tsx` · `tri-state-choice.tsx` · `use-last-project.ts` · `use-last-workspace.ts` ·
`use-project-name.ts` · `use-workspace-name.ts` · `use-workspace-projects.ts` · `workspace-settings-form.tsx` ·
`workspace-viewer.ts`.

### 1.4 The surfaces exec 2 listed and did not walk

- **account** — `packages/app-core/src/account/` (6 files: `notification-preferences-gateway`, `notifications-section`, `passkey-client`, `passkeys-section`, `sessions-client`, `sessions-section`) + `apps/web/src/account/` (4).
- **inbox** — `packages/app-core/src/inbox/` (5 files: `format`, `gateway`, `icons`, `inbox-view`, `unread-badge`) + `app/inbox/page.tsx`.
- **workflow builder + ticket-type editor** — `packages/app-core/src/workflow-builder/` (40 files: 10 top-level, `ticket-types/` 7, `ui/` 17 + `rule-editors/`).
- **mcp** — `app/mcp/authorize/page.tsx`, `app/mcp/tokens/page.tsx`, `src/mcp-tokens-screen.tsx`.
- **members** — `app/w/[workspaceId]/members/page.tsx` (1002 lines).
- **flows** — `packages/app-core/src/flows/guarded-child-event.ts`.
- **mobile** — `apps/mobile/src/` (14 files; screens: `board-screen`, `help-screen`, `ticket-screen`; `editor/editor-web-view`).
- **desktop** — `apps/desktop/src/` (8 files).

### 1.5 The copy

`docs/manual.md` (1396 lines) · `docs/faq.md` (995 lines) · `scripts/help-content.mjs` → `content.generated.ts`
(gated by `check:help`) · every user-facing string in 1.1–1.4.

### 1.6 Case ids in my concern

Recounted, not adopted: `node scripts/check-case-ids.mjs` → **2606 unique ids, 25 files, highest 17.006**
(the brief says 2601; exec 2 also measured 2606). Files I own in whole or part: `05-tickets-hierarchy.md`,
`06-auth-visibility.md` (the experienced-permission half), `09-editor-attachments.md`, `11-calendar-notifications.md`
(the notification half), `13-second-wave-roles-and-navigation.md`, `13-second-wave-board-actions.md`,
`13-settings-and-workflows.md`, `13-neomorphism-and-workspace-screens.md`, `13-owner-requests-and-backlog.md`,
`14-mcp-server.md` (the authorize/tokens screens), `15-in-app-help.md`, `16-remaining-doors.md`, `17-open-work.md`.

### 1.7 The comparison surface

The export, staged read-only at `/Users/kiro/my_projects/gisik-nokma-lanes/prototype-2026-09-20/`:
`Gisik Nokma - Desktop.dc.html` (sha256 `3d142d46…`), `Gisik Nokma - Mobile.dc.html` (`14ca5b8d…`),
`help-topics-pane.md` (`a60f8bc5…`), `workspaces-gap.md` (`1ae709c4…`), `github.md` (`18d4820f…`).
Also `design-system/prototypes/{TicketSheet,McpAuthorize,Calendar,SignIn,Workspaces}.dc.html` in the repo.
**Never cited:** `design-system/interactive/desktop.dc.html` (the camelCased transform).

### 1.8 The nine edge classes, walked per surface

EMPTY · ERROR · PERMISSION-REFUSED · OFFLINE/REPLICA-DEGRADED · SOFT-DELETED · CONCURRENT · NARROW VIEWPORT ·
FIRST-RUN · SERVER-REFUSES-WHILE-CLIENT-BELIEVES.

### 1.9 The round-1 lane's own boundary — my target list, in its words (`review-ux-exec2.md` §6)

1. `ticket-sheet.tsx` ~85% unread: "the fields section, history tab, assignee row, dates rows and the transition/close/reopen controls".
2. `board.tsx` drag/move machinery.
3. The five flows end-to-end.
4. `apps/mobile`. 5. `apps/desktop`.
6. `/inbox`, `/members`, `/account`, `/settings`, `/mcp/*` — "listed, not walked".
7. Workflow builder and ticket-type editor.
8. `test-cases/13-*.md` not verified id by id.
9. **"No running browser. I did not open the app."**

Plus the ~40 **unverified** candidates in its §2d/§2e, which the compiled ruling §7.1 explicitly left
un-ruled ("the honest disposition: a verification pass").

### 1.10 How the graph was used

`graphify-out/GRAPH_REPORT.md` (built from `e2769d60`; 10,970 nodes / 19,700 edges / 705 communities) —
read the community hub index, the god-node list (all ten are test/infra symbols — `createTestDatabase`,
`TestDatabase`, `Queryable`, `buildProjectionRegistry`, `stubServices`… — none is a UX surface, which itself
says the UX layer is a leaf in this graph), and the communities for `my-work.ts` (9), `help/index.ts` (11),
`account/page.tsx` (79), `ticket-type-editor-screen.tsx` (84), `inbox/page.tsx` (144), `help-screen.tsx`
(192), `toast.tsx` (300), `comments-thread.tsx` (303), `settings-page.test.tsx` (365). The inbox community
handed me its copy constants by name (`BULK_REFUSED_COPY`, `BULK_UNREACHED_COPY`, `CANNOT_OPEN_COPY`,
`EMPTY_COPY`, `EMPTY_INBOX_COPY`) before I opened the file. Further queries are logged in §6.

---

## 2. FINDINGS

Export cited throughout as `EXPORT` = `/Users/kiro/my_projects/gisik-nokma-lanes/prototype-2026-09-20/Gisik Nokma - Desktop.dc.html`
(sha256 `3d142d464a070b33…`, measured `shasum -a 256`). Browser = the owner's `gisik-nokma-dev-web-1` on `:3001`,
signed in as the owner, project `Shop operations` (`/w/0TZSS5W6ATCTF2YBPMWGGP9JF5/p/0XB92YA4CGEBF9S285AH4SDXR1`).

### E5-1 — IMPORTANT · The help says "there is no dragging on the board"; every card is draggable and carries move arrows `[BROWSER]` `[SOURCE]`

**WHAT.** `docs/manual.md:664` — *"Columns, one per stage, with cards in them. You do not drag cards — you open one
and press Move (§7)."* and `docs/faq.md:307` — the FIRST answer under "Stages and moves", *"How do I mark something
done?"*: *"Open the job, press **Move…**, pick the stage, press Move. There is no dragging on the board."* Both are
false. `docs/manual.md:666-668` then lists what a card shows (*"the title, who it is on, whether it is blocked, its
progress, and a small 'who · when' button"*) and names no move arrows.

**WHY.** The help is the product's onboarding surface. Its answer to the most basic question a person asks of a board
("how do I mark something done?") names one path as the ONLY path and denies the two faster ones that are painted on
every card. A sibling class of exec 2's `F1` (help describes a product that no longer exists) — but `F1`'s eight rows
(a–h) are the nav, sign-out, theme toggle, workspace card, comments, attachments and settings links; **none touches
the Board section or the "Stages and moves" answer.** This is a wider true scope with a browser measurement `F1` did
not have.

**WHAT WOULD HAVE BEEN BETTER.** Apply the corpus's own convention (`docs/manual.md:355-359`: a superseded absence is
kept and corrected in place) to `:664` and `:307`: *"Drag a card to a column, press ‹ › on the card, or open it and
press Move."* — and add the arrows to the `:666` list.

**MEASUREMENT.** `[SOURCE]` `packages/app-core/src/views/board.tsx:977` `draggable={arrows !== null}`, `:978-984`
`onDragStart` sets `DRAG_TICKET_FORMAT`; `:880` `onDropCard={handleDrop}`; `:661-662` `onDragOver`/`onDrop` wired
when `onDropCard !== null`. `[BROWSER]` on the Board tab, JS over the painted DOM:
`{cards: 24, draggable: 24}` — every `.gn-board__card-slot` has `draggable="true"`; and every card carries two
`.gn-board-card__move` buttons, accessible names `"Move to previous state — unavailable"` /
`"Move to next state — Next or In progress or Waiting or Done"` (read via `read_page`, refs 21–34). Opened lines:
`docs/manual.md:664`, `docs/faq.md:307`.

**SEVERITY: Important** (claimed). Same class and severity as the accepted `exec2-F1`; the passage is the help's
first answer about moving work.

---

### E5-2 — IMPORTANT · A ticket a week overdue looks like every other card on the Board; the export's card carries the key and a due label that turns red `[BROWSER]` `[SOURCE]` — category 3

**WHAT.** The export's board card (`EXPORT:357-379`) draws a `meta` line built at `:2493-2499`:
`bits = [t.id]; … bits.push(chDone + "/" + ch.length + " subtasks"); … bits.push("waiting on " + t.blockedBy); …
bits.push(di.label)` and colours it `di.late ? "var(--danger)" : "var(--label2)"` (`:2503`). The product's card
(`board.tsx:1029-1063`) renders title, an optional avatar, a `pending`/`reopened` chip, a rollup, and a `who · when`
fold. **No key. No due date. No lateness.** Ticket `CCSO-3` is due `14 Sep 2026` (sheet `Due` row, `[BROWSER]`);
today is `21 Sep 2026`; its board card is indistinguishable from an undated one — its meta div is literally empty
(`<div class="gn-board-card__meta"></div>`, `[BROWSER]`).

**WHY.** Lateness IS a product concept: `my-work.tsx` renders *"Overdue by N days"*, the List has a `dueDate` column
(`ticket-list.tsx:39`, `:1027-1059`), the Calendar and Timeline are built on it, and `Features.md:1135` sends "Due
soon" notifications. The Board is the DEFAULT view (`apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx:193` *"The default stays
`'board'`"*, `:212` `useState<ProjectTab>(DEFAULT_PROJECT_TAB)`; the export's own help says the same at `EXPORT:2027`) and the
only view where the fact is invisible. The recorded reason is a **WIRE GAP** — `docs/design/prototype-delta-2026-09-18.md:526`:
*"`{{ t.meta }}` … have **no wire fields** — WIRE GAP: `BoardCard` … is `{ticketId, title, typeId, assignee,
stateProvenance, cause, rollup, pending}` with no `chips` array and no `meta` string."* The common brief §3: *"the
reason a thing was built is not a ruling. A sentence explaining why a shortcut was taken is a record of the
shortcut."* **Search for a ruling:** `grep -rn -i 'board.{0,40}due|overdue|late.{0,30}card' docs/hig-reconciliation-audit.md
docs/design/*.md Features.md docs/lanes/controller-state.md` → no ruling on the board card's due/key; the HIG audit
`:481` rules only the `who · when` fold. `packages/app-core/src/view-types.ts:204-214` (`BoardCard`) carries no due
field; `ListRow` (`:316`) does.

**WHAT WOULD HAVE BEEN BETTER.** Carry `dueDate` (already on the list wire) and `key` onto `BoardCard` and draw the
export's meta line — at minimum the due label with the late tone. If the wire gap is to stand, record the ruling at
`board.tsx:1029` and say in the manual's Board section that lateness is shown on My Work and the List only.

**MEASUREMENT.** `EXPORT:2493-2503` opened; `board.tsx:1029-1063` opened; `view-types.ts:204-214` opened;
`prototype-delta-2026-09-18.md:526` opened. `[BROWSER]` sheet `Due 14 Sep 2026 · set by Kiro on 6 Sep 2026` for
`CCSO-3`; board card `sample` HTML shows `gn-board-card__meta` empty.

**SEVERITY: Important** (claimed). Not Critical — nothing is lost; the fact is one tab away. Important because the
default view hides the one fact a project board exists to surface, and the divergence has no ruling.

---

### E5-3 — IMPORTANT · A ticket directly under an epic reads `Epic › Epic › KEY` — the crumb states a four-deep chain the product does not have `[BROWSER]` `[SOURCE]`

**WHAT.** `CCSO-3`'s location crumb is `Convenience Corner › Shop operations › Open questions › Open questions › CCSO-3`:
two clickable crumbs, `data-testid="sheet-crumb-epic"` and `data-testid="sheet-crumb-parent"`, both reading
*"Open questions"*, both opening the same ticket.

**WHY.** `TicketRead.epic` is *"the nearest PROPER ancestor whose type carries the workspace's epic rank … The walk
starts at `parentId`"* (`view-types.ts:509-534`). So when the direct parent IS the epic, `epic.id === parent.id`, and
the sheet draws both (`ticket-sheet.tsx:1777`, `:1785`). The sheet's own comment ten lines above says why that is
wrong: *"a breadcrumb that skips a level states a hierarchy the product does not have. A crumb list is a PATH or it is
nothing"* (`:1750-1757`). A crumb that REPEATS a level states one too. The docblock at `view-types.ts:524-529` guards
only the ticket-IS-epic case (*"a ticket that IS an epic must not appear as its own grandparent"*); the parent-is-epic
case — the ordinary shape of a two-layer hierarchy — is unguarded. Case `16.70` pins the two-hop walk (*"task → story →
epic"*); nothing pins one hop. In the export the two are different fields (`epicId`, `parentId`, `EXPORT:1959-1961`)
and a `parentId` is always a non-epic story, so the duplicate never arises there — the product diverges by
construction, unruled.

**WHAT WOULD HAVE BEEN BETTER.** Draw the epic crumb only when `epic.id !== parent.id` (one line at `:1777`), and add
the one-hop case beside `16.70`.

**MEASUREMENT.** `[BROWSER]` painted nav HTML (JS over `nav.gn-ticket-sheet__crumbs`): two `<button
class="gn-ticket-sheet__crumb gn-ticket-sheet__crumb--link">Open questions</button>` with the two testids. Wire:
`GET /v1/workspaces/0TZSS5W6ATCTF2YBPMWGGP9JF5/tickets/0320JX4SK3KBJ616QP82T8WRJ2` → `parent.id === epic.id` (`sameId:
true`), `key: "CCSO-3"`. `[SOURCE]` `ticket-sheet.tsx:1534` `const epicCrumb = ticketRead.epic;`, `:1777`, `:1785`.
`test-cases/16-remaining-doors.md:1080` (`16.70`) opened.

**SEVERITY: Important** (claimed). Every direct child of an epic — the common case — states a wrong depth on its own
sheet, and the sheet's own rule calls that "not a path".

---

### E5-4 — IMPORTANT · Every email sign-up is a BLANK row in the assignee picker, the @mention list and the Filters sheet — the members page fixed this for itself and left four sibling sites `[BROWSER]` `[SOURCE]`

**WHAT.** The roster serves `displayName: ""` for a member (the dev workspace's guest, `GET /v1/workspaces/…/members`
→ `{name: "", role: "guest"}`, `[BROWSER]`). Four sites render that string raw:
- `ticket-sheet.tsx:1672` `...people.map((member) => ({ value: member.id, label: member.name }))` → the assignee
  `<select>` has an option with **no text** (`read_page`: `option value="01M1V035TASFV2G9WPWFV9QDVW"` with no name).
- `ticket-sheet.tsx:968-969` `queryUsers` filters on `member.name.toLowerCase().includes(needle)` and maps `name:
  member.name` → a nameless member can never be @mentioned by typing, and if listed is a blank row.
- `apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx:3275`, `:3289`, `:3291` — the Filters sheet's person rows:
  `label={member.name}`, `<Avatar name={member.name}>`, `<span>{member.name}</span>` → **two** rows (Assignee AND
  Collaborators) painted as `?` with `aria-label=""` (`[BROWSER]`, JS over `.gn-filters__choice--row`).

**WHY.** This is not a corner: `members/page.tsx:635-638` records that *"better-auth's magic-link plugin creates a user
with `name: name || ""` and our sign-in page sends no name … so **an email sign-up has `name === ''`**"* — the
product's primary sign-in path. That page fixed its three sites with `memberLabel` (`:672-677`, name → email → id)
and named the defect exactly: *"an accessible name that identifies nobody."* The sheet's picker sits 40 lines from
`nameOf` (`:654-655`), which already routes through `actorLabel` and its *"Honesty contract 1: … attributed, never
blank"* (`provenance.ts:4-7`) — so the same person is their id on the claim line and a blank in the picker beside it.
Recurring shape: a fix applied to one path and stated of the product.

**WHAT WOULD HAVE BEEN BETTER.** Route the four labels through `actorLabel` (as `visibility-editor.tsx:410` already
does) or lift `memberLabel` into app-core; make `queryUsers` match on the resolved label.

**MEASUREMENT.** `[BROWSER]` accessibility tree of the open sheet: `combobox "Unassigned"` → options `""`,
`"Unassigned"`, `"Kiro"`, `value="01M1V035TASFV2G9WPWFV9QDVW"` (unnamed). Filters sheet: rows
`{aria: "", text: "?"}` ×2. `[SOURCE]` lines above opened; `visibility-editor.tsx:410` opened as the positive control
(`actorLabel(member.id, member.name)`).

**SEVERITY: Important** (claimed). A control that offers a choice the person cannot identify, on the two surfaces
that assign and narrow work, for the population the product creates by default.

---

### E5-5 — IMPORTANT · The Filters sheet offers a Collaborators control that no view applies, and tells the person afterwards `[BROWSER]` `[SOURCE]`

**WHAT.** The Filters sheet renders a `Collaborators` fieldset with one tri-state row per member
(`page.tsx:3317` `{personSection('Collaborators', 'collaboratorIds')}`, `[BROWSER]` legend list `["Assignee",
"Collaborators", "Type", "State", "Closed", "Category"]`). No tab narrows by it: the manual's own words,
`docs/manual.md:826-828` — *"Collaborators is the one thing no tab applies — the strip's own sentence is 'Not applied
on the board: collaborator.' You can set it and the filter keeps it, but nothing narrows by it."*

**WHY.** The recorded rule in my brief: *"A REFUSAL THAT ARRIVES AFTER THE PRESS IS A DEFECT, even when the refusal is
correct … asks before it offers, and withholds itself rather than assert an absence."* The FiltersSheet docblock's own
principle: *"An inert Filters button is a button that lies"* (`page.tsx:3157-3160`). And the reason the fieldset
exists is a test's need for a home, not a person's: `:3147-3151` — *"`collaboratorIds` is deliberately included even
though it is one of the four axes `BoardCard` cannot answer at all … Task 4's brief explicitly deferred its third
Step-5 test … to this commit, and **this is that helper's only possible home**."* That is a record of a shortcut. The
rulings I found (`:2270-2312`, Rulings 12/13/46) govern the *strip sentence's wording* and the chip, not whether the
control should be offered.

**WHAT WOULD HAVE BEEN BETTER.** Withhold the fieldset until an axis applies it, or label it inline *"(not applied by
any view yet)"* so the person is told before the press, not in a strip after it.

**MEASUREMENT.** `[BROWSER]` legends and rows listed above. `[SOURCE]` `page.tsx:3147-3151`, `:3157-3160`, `:3317`;
`docs/manual.md:826-828`.

**SEVERITY: Important** (claimed) — it is the brief's named shape. Minor if the judge weighs the on-screen strip
sentence as sufficient.

---

### E5-6 — IMPORTANT · A due date can be seen in four places, computed as "overdue", and notified as "due soon" — and set nowhere `[SOURCE]` `[BROWSER]` — category 3

**WHAT.** The sheet's `Due` row is read-only text (`14 Sep 2026 · set by Kiro on 6 Sep 2026`; the sheet's inputs are
`Ticket title`, `gn-new-subtask-title`, the `Assignee` select and four visibility radios — no date input,
`[BROWSER]`). `grep -rn 'type="date"' apps/web packages/app-core/src/views` → **zero** in product code (the one hit
is the docblock at `ticket-sheet.tsx:1239` describing the prototype). The manual states it: `docs/manual.md:23`
*"you cannot set a due date anywhere"*, `:355`; `docs/faq.md:197-215` *"Can I set a due date?"* → no.

**WHY.** The export draws `Due` as `<input type="date">` with a note line (`EXPORT:1200-1202`) and Priority as a
segmented control (`:1193-1198`). The product ships the read half only: `ticket-sheet.tsx:1235-1243` — *"Two of the
prototype's three rows are EDITORS there, and that is a separate door — this row builds the READ … the editors are
named as an unbuilt door"*; `test-cases/16-remaining-doors.md:279-283` (Door G) says the same. An unbuilt door with a
named owner is a record, not a ruling. Meanwhile the product acts on the value it cannot accept: `my-work.tsx`
*"Overdue by N days"*, the List's due column, the Calendar and Timeline, and `Features.md:1135`'s due-soon
notification. Every due date a person will ever see on this build came from the seed.

**WHAT WOULD HAVE BEEN BETTER.** Build the export's date input on the sheet (the write path already exists —
`ticket.field_set` carries `dueDate`, `ticket-events.ts:66`), or rule the deferral and say on the sheet's Due row
that it is read-only on the web today rather than only in the manual.

**MEASUREMENT.** `[BROWSER]` sheet inputs enumerated by JS (list in E5-4's measurement); `[SOURCE]` grep above;
`ticket-sheet.tsx:1209-1250` opened; `EXPORT:1192-1206` opened; `docs/manual.md:23`, `:355` opened.

**SEVERITY: Important** (claimed). A flow the product's own surfaces are built around cannot be started.

---

### E5-7 — IMPORTANT · With a comment typed and Move enabled, the dialog still says *"none was provided"* — the exact defect the file records as fixed for `require-evidence`, unfixed for `require-comment` `[BROWSER]` `[SOURCE]`

**WHAT.** Open `CCSO-3` → `Move…` → choose `Done`. The dialog shows `Comment (required by this transition)` and,
before any keystroke, *"instant check — require-comment: This move must carry a comment explaining it, and none was
provided."* Type `review note`. **Move becomes enabled (`moveDisabled: false`) and the refusal sentence stays.**

**WHY.** `transition-dialog.tsx:127-140` records this precise class: *"attaching a file to a `require-evidence` move
left the preview insisting 'none was provided' beside a Move button that had just become **enabled**. A refusal
printed next to the control it contradicts, telling the person the move was still blocked when it was not."* The fix
widened `precheck` to `(toStateId, evidenceAttachmentId?)` (`:143`) and made `evidenceAttachmentId` an effect
dependency (`:281-296`). The comment was never added: the sheet's candidate payload is `{ to }` (+ evidence)
(`ticket-sheet.tsx:681-683`), so the engine's `require-comment` rule (`rule-engine/src/refusal-rules.ts:21`) can only
ever answer refused; and the effect's deps are `[toStateId, evidenceAttachmentId]`, so typing never re-asks. `blocked`
(`:360-364`) clears on `comment.trim() !== ''` independently. Result: an enabled primary control beside a sentence
saying it is blocked — for every `require-comment` transition in the product (the seed's "Errand with waits"
workflow has one on `Done`).

**WHAT WOULD HAVE BEEN BETTER.** Pass the comment into the candidate (the submission carries it — `TransitionSubmission`)
and add it to the effect's dependencies, exactly as the evidence fix did; or render the `require-comment` preview as
the field's requirement (*"This move needs a comment"*) and not as a refusal.

**MEASUREMENT.** `[BROWSER]` JS on the open dialog: after `select` change to `Done` and `textarea` input
`'review note'`: `{moveDisabled: false, text: "… instant check — require-comment: … and none was provided. …"}`.
`[SOURCE]` `transition-dialog.tsx:127-143`, `:281-296`, `:360-364`, `:477-481`; `ticket-sheet.tsx:673-692`.

**On case `3.72`** (`test-cases/03-foundation-ledger.md:79`): it pins that *"when the server has answered, its words
render VERBATIM in an `alert` while a disagreeing preview is left standing"* — a preview beside a SERVER verdict. This
finding is the preview beside an ENABLED CONTROL before any server answer, which the same file's docblock calls a
defect for `require-evidence`. `3.72` also asserts the pre-check is asked *"about the state the user CHOSE"* — and
only that; nothing asserts it is re-asked when the comment changes. So `3.72` witnesses the effect's dependency list
and thereby witnesses this defect as a property.

**SEVERITY: Important** (claimed). The product tells a person something untrue about itself beside the control it
contradicts — the file's own words for the sibling defect.

---

### E5-8 — IMPORTANT · The History tab prints raw event names — `ticket.field_set` three times in a row — and never says WHAT changed; the export narrates every row `[BROWSER]` `[SOURCE]` — category 3

**WHAT.** `CCSO-3`'s History tab reads, in order: `ticket.created · Kiro · from web · claimed (device clock) 6 Sep
2026, 14:46 IST · recorded (server) 6 Sep 2026, 14:46 IST`, then `ticket.field_set` ×3 with identical clocks, then
`ticket.transitioned`, `visibility.set` ×2, `ticket.transitioned` (`[BROWSER]`, tab panel text). Nothing on any row
says which field was set, to what, or which state the ticket moved to. The export's rows (`EXPORT:3733-3737`) are
sentences: *"Created as Errand"*, *"Assigned to Anselma Marak"*, *"State set to Doing"*, *"Conflicting claim recorded
on iphone-02"*.

**WHY.** `docs/manual.md:408-410`: *"Every change ever made to that job, in order, each one saying who did it and
when."* — true, and it is all it says; a person cannot learn WHAT from this tab. The wire already carries what a
sentence needs: `TicketHistoryEvent.payload: unknown` (`view-types.ts:538-548`), served by `routes/tickets.ts:701`
(`SELECT … type, version, payload …`). The renderer prints `{event.type}` (`history-list.tsx:45`) and discards the
payload. **Search for a ruling:** `history-list.tsx:5-31` rules the two CLOCKS (*"Nothing is summarised into one
'time'"*) and the actor fallback — not the sentence; `docs/hig-reconciliation-audit.md:571` rules only that the tab's
three loading arms must not be simplified; case `5.19` pins the ENDPOINT serving unsummarised; no case pins the raw
type as the row's text (`grep -rn 'gn-history__type' test-cases/` → 0; the only test reads the types as a list,
`history-list.test.tsx:109`). The divergence from the export has no ruling I could find.

**WHAT WOULD HAVE BEEN BETTER.** Narrate from `type` + `payload` (*"Due set to 14 Sep 2026"*, *"Moved to In
progress"*, *"Visibility set to project"*) with the raw type kept as a secondary label; keep both clocks exactly as
they are.

**MEASUREMENT.** `[BROWSER]` History tab text above. `[SOURCE]` `history-list.tsx:36-60`; `view-types.ts:538-548`;
`EXPORT:3733-3737`; `docs/manual.md:408-419`.

**SEVERITY: Important** (claimed). The tab exists to answer "what happened to this ticket" and cannot.

---

### E5-9 — IMPORTANT · A refused Delete answers five screens above the button that was pressed `[BROWSER]` `[SOURCE]` — and this is the measured consequence the ruling on "offered to everyone" did not weigh

**WHAT.** `Delete` sits in the sheet's footer (`ticket-sheet.tsx:2612-2621`), `position: static` at the END of the
scrolling body. Its refusal renders in the shared answer slot (`:1961-1965`, `gn-refusal--server`) directly under the
tab bar. `[BROWSER]` measured on `CCSO-3`: `.gn-sheet__body` is the scroll container, `clientHeight 756`,
`scrollHeight 4036`; the footer's top is **3,943 px below the tab bar**. A person scrolls to the bottom, presses
Delete, is refused, and the answer lands ~5 viewports above them.

**WHY.** The docblock at `:1192-1200` RULES that Delete is offered to every viewer: *"this control is NOT hidden for
anyone, deliberately … so a non-admin who presses Delete gets the engine's own refusal in `gn-refusal--server` rather
than a button that silently is not there. A hidden control cannot explain itself."* The ruling's justification is
that the refusal explains itself — and geometrically it cannot, because the slot and the control are at opposite ends
of a four-thousand-pixel body. `role="alert"` reaches assistive technology only. The slot was deliberately moved ABOVE
the tabs (`:1925-1940`) so a title refusal is visible from either tab — the same reasoning ("an answer that is
invisible … is the failure the three-slot split exists to prevent") applies to scroll position and was not applied.
Connected: the product's OWN sibling doctrine for New-ticket and (since today) the subtask form — *"asks before it
offers, and withholds itself rather than assert an absence"* (my brief; the board's *"Preparing the New ticket form…"*
`[BROWSER]`) — asks the door first. Delete does not, and its ruling rests on a refusal the person will not see.

**WHAT WOULD HAVE BEEN BETTER.** Either render Delete's refusal beside Delete (a footer-local slot, as
`TransitionDialog` has its own), or ask `check-permission`'s check 6 before offering — the New-ticket precedent — and
withhold with a sentence. The no-confirmation shape MATCHES the export (`EXPORT:3794-3799`: filter + undo toast) and
is not part of this finding.

**MEASUREMENT.** `[BROWSER]` JS: `{scrollContainer: "gn-sheet__body", scrollH: 4036, clientH: 756, footerPosition:
"static", footerOffsetFromTabs: 3942.8}`. `[SOURCE]` `:1192-1200`, `:1961-1965`, `:2612-2621`, `:1925-1940` opened.

**SEVERITY: Important** (claimed). A refusal after the press, out of view — the brief's named shape, on the
destructive control.

---

### E5-10 — IMPORTANT · A single-row "mark read" and the bulk Undo fail SILENTLY — the exact first-version defect the bulk path's own docblock says it fixed `[SOURCE]` (verifies exec 2's §2e "single-row mark-read and its Undo failing silently", unmeasured there)

**WHAT.** `apps/web/app/inbox/page.tsx:269-278` `markRead(id)`: optimistic flip, then `void
gateway.markRead(id).catch(() => loadFirstPage());` — no sentence. `:344-357` `undoMarkAllRead()`: the same,
`.catch(() => loadFirstPage())`. The bulk path `:300-340` renders `BULK_REFUSED_COPY` / `BULK_UNREACHED_COPY` and its
docblock at `:319-333` records why: *"The first version of this catch reloaded and said NOTHING: a reader over the
bound saw a click do nothing and the list snap back, with no sentence anywhere."*

**WHY.** The fix was applied to `markAllRead` and not to its two siblings in the same file, so a person who taps one
row's mark-read and is refused (404 on a row that is not theirs, or a dropped connection) sees the row flip and
snap back with no explanation; the same for Undo. The docblock's sentence *"A REFUSAL IS RENDERED, NOT SWALLOWED"* is
true of one of three paths.

**WHAT WOULD HAVE BEEN BETTER.** The same status-split sentence on both catches — `BULK_UNREACHED_COPY`'s sibling for a
row, and a one-line "could not undo" beside the toast.

**MEASUREMENT.** `[SOURCE]` lines above opened. Not driven: the owner's inbox is empty (`[BROWSER]` `/inbox` →
`EMPTY_INBOX_COPY`) and I will not mint notifications in the owner's database.

**SEVERITY: Important** (claimed). A press that does nothing and says nothing, on the surface whose job is to tell
people things.

---

### E5-11 — IMPORTANT · The invite form asks a person to type comma-separated project ULIDs; the export draws a picker of project names; the manual says the box "is not usable by a person" `[BROWSER]` `[SOURCE]` — category 3

**WHAT.** `/w/…/members` → "Invite somebody" → `Projects (comma-separated ids, optional)`, a bare text input
(`members/page.tsx:875-884`; `[BROWSER]` control list `INPUT:text` under that label). The export
(`EXPORT:765-775`) draws `Project access` as a `<select>`: `All projects in this workspace` / `Only <project name>`
per project. `docs/manual.md:236-240`: *"It asks for a comma-separated list of identifiers — long strings of letters
and numbers that you would have to go and find from somewhere. **In practice this box is not usable by a person.**"*

**WHY.** The names are one read away — the shell already has `use-workspace-projects.ts` and `GET /v1/me/workspaces`
serves `projects[].{projectId,name}` (`[BROWSER]` wire above). The form's own docblock (`:721-741`) sets the rule that
*"offering a choice the door will reject is a form that lies about what it can do"* and applies it to `owner` and to
the guest arm — but not to a field whose only honest input is an identifier no screen shows. **Search for a
ruling:** `docs/design/prototype-delta-2026-09-18.md` `isInviteAdmin` entry says *"guest hides the project field in
both"* and nothing about the field's shape; `docs/hig-reconciliation-audit.md:177` lists the field as-built;
`grep -rn 'comma-separated' Features.md test-cases/13-second-wave-roles-and-navigation.md test-cases/06-auth-visibility.md`
→ no ruling.

**WHAT WOULD HAVE BEEN BETTER.** The export's select, fed from the workspaces read the page already makes.

**MEASUREMENT.** `[BROWSER]` members page controls; `[SOURCE]` `members/page.tsx:721-741`, `:875-884`;
`EXPORT:765-775`; `docs/manual.md:229-240`.

**SEVERITY: Important** (claimed). The manual's own verdict.

**Observation, not scored:** the `Channel` select (`email`/`sms`/`whatsapp`) MATCHES the export (`EXPORT:753-755`),
and the manual (`:229-234`) says the product sends by none of them — the link is shown once and sent by hand. A
control matching the prototype is category 1; that it names three delivery channels for a product that delivers by
none is noted for the judge without a claim.

---

### E5-12 — MINOR · The same workspace is "1 project" on `/workspaces` and "2 projects" on `/account` `[BROWSER]` `[SOURCE]`

**WHAT.** `/workspaces` card for Convenience Corner: `1 project` + chip `1 archived` (`[BROWSER]`).
`/account` → Your workspaces: `Convenience Corner · owner · 2 projects` (`[BROWSER]`). Wire: `GET /v1/me/workspaces`
→ two projects, one `archived: true` (`[BROWSER]`).

**WHY.** `workspaces/page.tsx:259-264` counts `live = projects.filter(p => !p.archived)` and renders
`projectCountLine(live.length)`; `apps/web/src/account/workspaces-section.tsx:76-77` renders
`workspace.projects.length`. Two units for one word.

**WHAT WOULD HAVE BEEN BETTER.** One helper, or the account row saying `1 project · 1 archived`.

**MEASUREMENT.** Lines above opened; both pages painted.

**SEVERITY: Minor** (claimed).

---

### E5-13 — IMPORTANT · After a failed preferences read, `/account` paints all five notifications ON and one toggle PUTs a whole document built from that guess — silently overwriting whatever the person had muted `[BROWSER, reproduced with zero server writes]` `[SOURCE]` (verifies exec 2 §2e's "two account sections with no error prop", and goes further)

**WHAT.** `account/page.tsx:81` `notificationPreferences.load().then(setPrefs, () => setPrefs({ mutedKinds: [] }))`.
`toggleKind` (`:215-232`) builds `next` from `prefs.mutedKinds` and `save(next)` PUTs the WHOLE document — the
gateway's contract (`notification-preferences-gateway.ts:18-22`): *"a PUT replaces it … A caller that wants to flip
one kind reads the current value first (`load`) — exactly what `toggleKind` does."* On the failed-read path that
premise is false: the "current value" is the page's guess.

**Reproduction (no write reached the server).** On `/account`, `window.fetch` was wrapped so `GET
/v1/me/notification-preferences` throws (`TypeError: simulated network failure`) and a `PUT` to it is captured and
answered `200` locally. Client-side navigation to `/account` via `window.next.router.push`. Painted: five checkboxes,
**all `checked: true`**, no `role="alert"`, no refusal text (`errorText: []`). One click on *"A ticket is assigned to
you"* → captured `PUT /v1/me/notification-preferences` body **`{"mutedKinds":["assignment"]}`**. Had the person
previously muted `mention` and `contest`, this body un-mutes both.

**WHY.** The page's own comment (`:74-80`) says the literal *"merely renders every kind as on for this visit, without
asserting that fact about the account"* — and then `toggleKind` asserts it to the server. The sessions section
(`sessions-section.tsx:56-63`) hedges its empty sentence for the same collapsed read — *"this component cannot tell
which"* — while a signed-in person always has at least the current session, so "No signed-in devices to show" on
`/account` (`[BROWSER]`) can only be a failed read painted as an empty state. This is the brief's expensive shape
inverted: the server ACCEPTS a claim the client invented.

**WHAT WOULD HAVE BEEN BETTER.** Hold `prefs = null` on a failed read and render the five rows disabled with *"Your
preferences could not be loaded"*; make `toggleKind` refuse to save unless the last `load` succeeded; same for
sessions (`:91`).

**MEASUREMENT.** `[BROWSER]` JS transcript above (`cap` array: `[{GET, blocked:true}, {PUT, body:"{\"mutedKinds\":[\"assignment\"]}"}]`).
`[SOURCE]` `account/page.tsx:74-81`, `:91`, `:215-232`; `notification-preferences-gateway.ts:18-22`;
`sessions-section.tsx:56-63`.

**SEVERITY: Important** (claimed). A person's stored settings are overwritten by a default the product itself says it
is not asserting. I considered Critical (data loss) and held at Important because the loss is a preference document,
re-settable in five clicks once noticed — but it will not be noticed.

---

### E5-14 — MINOR · Ten reorder arrows, all disabled, the reason only in a hover `title`; and the shipped seed already carries the rank tie the arrows exist to prevent `[BROWSER]` `[SOURCE]`

**WHAT.** `/settings` → Ticket types: five rows, each with `↑`/`↓`; **all ten are `disabled`** (`[BROWSER]` control
list: `Move Epic up [disabled]` … `Move Sub-task down [disabled]`), including the custom `Errand`. The only
explanation is `title={moveBlocker(index, -1) ?? …}` (`ticket-type-list-screen.tsx:365`) — *"Built-in types keep
their rank."* — a hover tooltip, with no touch or keyboard equivalent and no sentence on screen. And the list reads
`Errand · rank 3` and `Task · rank 3` (`[BROWSER]`) under the line *"5 types. Rank orders them in every picker."*
(`:336`).

**WHY.** `moveBlocker` (`:225-233`) disables an arrow when EITHER neighbour is built-in, so with the four built-ins at
ranks 1–4 the first custom type a workspace adds can never be moved by arrows — its neighbours are always built-in.
The docblock (`:214-222`) says a tie is *"the exact tie the two-event swap exists to prevent"*, resolved server-side
by `ORDER BY rank, type_id` (`routes/builder-reads.ts:168`) — *"by nothing a person can see"* — and the seed ships
one. The editor's rank is an integer `≥ 1` (`ticket-type-editor-screen.tsx:337-344`), so a custom type cannot sit
between `Story (2)` and `Task (3)` without tying `Task`. The sentence *"Rank orders them in every picker"* is false
for the tied pair; the order there is by id.

**WHAT WOULD HAVE BEEN BETTER.** Say the blocker on screen (a line under the list: *"Built-in types keep their rank;
custom types reorder among themselves"*), or hide arrows on built-in rows; and either forbid the tie at the editor
(*"rank 3 is Task's"*) or describe tie-break in the sentence.

**MEASUREMENT.** `[BROWSER]` control list and row text on `/settings?workspaceId=…`; `[SOURCE]` lines above.

**SEVERITY: Minor** (claimed).

---

### E5-15 — IMPORTANT · A refused or failed ticket-types read leaves Settings on "Loading ticket types…" for ever — the same file's own docblock names this failure while leaving it in `[BROWSER, reproduced]` `[SOURCE]` (verifies exec 2 §2e's top Critical candidate; claimed lower)

**WHAT.** `ticket-type-list-screen.tsx:175-181`: `void Promise.all([gateway.listTicketTypes(…), gateway.listWorkflows(…)]).then(…)`
— **no rejection handler**. `:182-185`, the very next comment: *"A SEPARATE promise, and its own rejection handler.
Folded into the `Promise.all` above, a failed count would reject the whole tuple and leave the screen on 'Loading
ticket types…' for ever"* — the counts promise was split out; the two-promise tuple was not given a handler. Same
shape at `ticket-type-editor-screen.tsx:189-193` (`Promise.all([listWorkflows, listTicketTypes]).then(…)` only), with
its own `Loading ticket types…` at `:248`.

**Reproduction (read-only).** On `/settings`, `window.fetch` wrapped to answer `500 {"error":"Internal Server
Error","message":"simulated"}` for `GET /v1/workspaces/<id>/ticket-types`; client-side `router.push('/workspaces')`
then `router.push('/settings?workspaceId=…')`. Painted: `Loading ticket types…` at +5 s and still at +13 s; `alerts: []`;
`cap: [{GET …/ticket-types, blocked: true}]`. No sentence, no control, no way forward but a reload the page never
suggests.

**WHY.** The sibling screens in the SAME package handle this: `workflow-list-screen.tsx:188-197` `.catch(() =>
setLoadFailed(true))` → *"Could not load workflows — reload to try again."*; `workflow-builder-screen.tsx:77-92` →
*"Could not load workspace people and types — reload to try again."* So the pattern exists, is used twice in the
directory next door, and is absent on the two screens whose loading sentence the docblock worried about.

**WHAT WOULD HAVE BEEN BETTER.** The sibling's `.catch(() => setLoadFailed(true))` and the sibling's sentence.

**MEASUREMENT.** `[BROWSER]` transcript above; `[SOURCE]` `ticket-type-list-screen.tsx:172-199`,
`ticket-type-editor-screen.tsx:186-197`, `:248`; positive controls `workflow-list-screen.tsx:180-202`,
`workflow-builder-screen.tsx:66-95`.

**SEVERITY: Important** (claimed). exec 2's sweep rated it Critical; nothing is lost and a reload recovers, so
Important on my scale — but it is a whole settings surface with no error arm.

---

### E5-16 — IMPORTANT · "New ticket" pre-selects **Epic** — the top of the hierarchy — and a mis-filed type cannot be changed afterwards; the export pre-selects the everyday type `[BROWSER]` `[SOURCE]` — category 3

**WHAT.** Press `New ticket` on the board: the `Type` combobox opens with `value="Epic"` (`[BROWSER]`, the input's
painted value), `Parent` = `None (project root)`, `Create` disabled until a title. A person who types a title and
presses Create files an **Epic**. `new-ticket-dialog.tsx:97` `useState(typeOptions[0]?.id ?? '')`; `typeOptions` is
the workspace's types in rank order (`page.tsx:1482-1485`), so the default is always rank 1 = Epic. The export's form
defaults to `type: "Defect"` (`EXPORT:2216`), the SECOND type in its ladder (`:2274-2282`), not the first.

**WHY.** In the dev project the type distribution is Epic 3 · Errand 24 · Story/Task/Sub-task 0 (`/settings` →
Ticket types counts, `[BROWSER]`) — the default is the least likely choice 8 times in 9. And the mistake is
one-way on the web: the sheet's `Type` row is read-only (`ticket-sheet.tsx:1235-1243`, matching the export's
`<span>{{ sheetType }}</span>`), so an accidental Epic must be deleted and re-filed. An Epic is also structurally
different — it heads a hierarchy and appears in the Backlog as a group band (the brief's "visible as a name and
absent as a ticket" shape). **Search for a ruling:** `grep -rn 'typeOptions\[0\]\|default type\|first type'
new-ticket-dialog.tsx create-ticket-flow.tsx page.tsx test-cases/13-*.md test-cases/05-*.md` → only the line itself;
the dialog's docblock (`:1-84`) rules the Parent picker and the title, not the type default.

**WHAT WOULD HAVE BEEN BETTER.** Default to the deepest-legal or most-used type (the subtask form already defaults to
the deepest legal type — `exec1-P5`'s ruling records that choice), or to no selection with `Create` disabled until one
is made — the pattern the Move dialog already uses (`Choose a state`).

**MEASUREMENT.** `[BROWSER]` dialog inputs: `{label: "Type", role: "combobox", value: "Epic"}`; `[SOURCE]` lines
above; `EXPORT:2216`, `:2274-2282`.

**SEVERITY: Important** (claimed). A default that is usually wrong, on the product's most-used form, with no undo.

**Observation, not scored:** the export's new-ticket form also carries `Description`, `Column`, `Assignee` and `Due
date` (`EXPORT` overlay labels); the product's carries `Title`, `Type`, `Parent`. Assignee and description are
settable on the sheet afterwards; due date is not (E5-6). The `Title` input has no accessible name (`<input
value="">`, no `aria-label`, no `id`/`for`) — noted for the UI lane.

---

### E5-17 — MINOR · `/mcp/tokens` is a chrome-less orphan: no app nav, nothing links to it, and its own docblock says it is a Settings tab it left two rounds ago `[BROWSER]` `[SOURCE]`

**WHAT.** `/mcp/tokens` paints `Connected assistants` with **no `AppNav`** — no Workspaces/My Work/Members/Settings,
no account menu (`[BROWSER]` control list: only `Name`/`Revoke` buttons). `grep -rn "/mcp/tokens" apps/web/app
apps/web/src` → no `href` anywhere; the only non-comment hit is `mcp-tokens-screen.tsx:212` (`returnTo`), which sends
a signed-out person BACK to this chrome-less page after sign-in. `app/mcp/tokens/page.tsx:16-24` says `/settings`
*"can mount the SAME component as its 'MCP tokens' tab"*; `app/settings/page.tsx:118-125` says *"MCP tokens LEFT this
shell (Round 21) … moved it to `/account`"*. The painted `/settings` has three tabs: Ticket types · Workflows ·
Workspace.

**WHY.** A person who reaches it (bookmark, or the `returnTo`) has no way onward but the browser bar, on a page whose
sibling (`/account`) carries the full shell. The owner's ruling was *"should not be opening up a separate route"*;
the route was kept because "nobody asked for a URL to stop working" — fair — but it was kept without a nav.

**WHAT WOULD HAVE BEEN BETTER.** Redirect `/mcp/tokens` → `/account#connected-assistants`, or mount `AppNav`.

**MEASUREMENT.** `[BROWSER]` painted text and controls; `[SOURCE]` `app/mcp/tokens/page.tsx:1-33`,
`app/settings/page.tsx:118-130`, `mcp-tokens-screen.tsx:212`.

**SEVERITY: Minor** (claimed).

**Observation, not scored:** three of the four connections paint byte-identical rows (`Approved 7 Sept 2026 · Last
used 7 Sept 2026 · Name · Revoke`) with identical accessible names (`Name the connection approved 7 Sept 2026` ×3) —
the person cannot tell which assistant a `Revoke` cuts until they name them. Data-dependent (unnamed seeds), so noted
only.

---

### E5-18 — MINOR · The invite landing page offers Join or nothing: no Decline, no inviter, no expiry; the export draws all three `[SOURCE]` — category 3, wire-limited

**WHAT.** `/invite/[token]` (`page.tsx:87-126`): *"You are invited to join **<ws>** as <role>."* + `Join <ws>`. The
export (`EXPORT:1761-1789`; Decline `:1788`, Accept `:1789`): inviter name, workspace, role, member count, *"Invitation expires · In 4 days"*, a
*"What a member can do"* tray, and a Decline/Accept pair. `Decline` exists in the product only on `/workspaces`
(`workspaces/page.tsx:448-466`, `:553`) for invitations matched to the signed-in email.

**WHY.** A person holding a link they do not want has no answer on the page the link opens. `InviteSummary`
(`online/invites.ts:3-7`) is `{workspaceId, workspaceName, role}` — the wire carries no inviter and no expiry, so two
of the export's rows are a wire gap; Decline is not (the decline door exists, `myInvitations.decline`).
`docs/design/prototype-delta-2026-09-18.md`'s invite entry records the absences and issues no ruling.

**WHAT WOULD HAVE BEEN BETTER.** A Decline beside Join (the door exists), and expiry on the wire (the server holds
`expires_at`, `routes/invites.ts:514-515`, `i.invited_by, i.invited_at, t.expires_at`).

**MEASUREMENT.** `[SOURCE]` lines above; `EXPORT:1761-1789`. Not driven — I hold no live invitation token.

**SEVERITY: Minor** (claimed).

---

### E5-19 — MINOR · "Save name" says nothing on success, and a refusal without a message is reported as success `[SOURCE]`

**WHAT.** `account/page.tsx:210-213` `saveName`: `return { error: result.error?.message ?? null }`.
`profile-section.tsx:24-30` `save`: shows `error` when non-null and **nothing otherwise** — no "Saved", no
confirmation, the button just stops saying it is saving. So three outcomes paint identically: saved; refused with a
body that carried no `message`; and (if the client resolves rather than throws on transport failure) never sent.

**WHY.** The product's rule elsewhere is that a success is narrated (the delete toast, the Move dialog closing, the
minted-invite card). Here the only signal is silence, and silence is also the failure arm for a message-less error.

**WHAT WOULD HAVE BEEN BETTER.** A `role="status"` *"Name saved"* on `error === null`, and `error.message ?? 'The
server refused this change and did not say why.'` rather than `?? null`.

**MEASUREMENT.** `[SOURCE]` lines above opened. **Unverified half:** whether better-auth's `updateUser` can return an
`error` with no `message` (its client types make `message` optional) — I did not drive a refusal against the owner's
account. The success-silence half needs no measurement beyond the component: it renders no success arm.

**SEVERITY: Minor** (claimed).

---

## 3. THE PROTOTYPE — classified

Every comparison I made, against `EXPORT` (`Gisik Nokma - Desktop.dc.html`, sha256 `3d142d464a070b33…`), by the
brief's three categories.

| # | surface | export | product | class | where |
|---|---|---|---|---|---|
| 1 | Board card meta (key · subtasks · blocker · source · due, red when late) | `:357-379`, `:2493-2503` | title + `who · when` fold; meta div empty | **3 — no ruling** (WIRE GAP is a record) | E5-2 |
| 2 | Board card `who · when` fold | static `card__prov` line | clickable fold to provenance | 2 — ruled, `docs/hig-reconciliation-audit.md:481` | — |
| 3 | Board drag + arrows | drag `:372`, arrows `:378-381` | drag + arrows | 1 — matches (the HELP diverges) | E5-1 |
| 4 | Sheet crumb chain | `epicId` and `parentId` distinct fields, `:3404-3425` | `epic` = nearest proper ancestor; duplicates when parent is epic | **3 — no ruling** | E5-3 |
| 5 | Sheet title as `<input>` in a fixed column | `:1115`, panel `min(660px,100%)` `:3398` | same structure; clips at 435 px | 1 — matches (shared defect: a 63-char title clips in both; observation only) | — |
| 6 | Sheet Priority (segmented) / Due (`<input type=date>`) | `:1193-1202` | read-only rows | **3 — "unbuilt door", no ruling** | E5-6 |
| 7 | Sheet Type read-only | `:1204` | read-only | 1 | E5-16 note |
| 8 | Sheet History rows as sentences | `:3733-3737` | raw event type + actor + two clocks | **3 — no ruling on the sentence** | E5-8 |
| 9 | Sheet footer Delete, no confirm, undo toast | `:1371`, `:3794-3799` | same (no confirm; undo toast in host) | 1 — matches; "offered to everyone" is 2 — ruled at `ticket-sheet.tsx:1192-1200` | E5-9 argues the ruling's premise |
| 10 | Sheet `‹ Previous / Next ›` footer nav | `:1372-1374` | removed | 2 — ruled (owner 2026-09-20, `ticket-sheet.tsx:2590-2600`) | — |
| 11 | Move dialog | picker + comment per edge | same, plus instant check | 1 in shape | E5-7 is behaviour, not shape |
| 12 | New ticket default type | `"Defect"` (2nd) `:2216` | `typeOptions[0]` = Epic | **3 — no ruling** | E5-16 |
| 13 | New ticket fields (Description/Priority/Column/Assignee/Due) | overlay labels | Title/Type/Parent | 3 — recorded gap; folded into E5-16 note, E5-6 | — |
| 14 | Filters sheet person rows | `:1367-1417` (spec metrics) | same shape | 1 (blank rows are data-path) | E5-4, E5-5 |
| 15 | Invite form Channel | `:753-755` | same three | 1 | E5-11 note |
| 16 | Invite form Project access (named select) | `:765-775` | comma-separated ids text box | **3 — no ruling** | E5-11 |
| 17 | Invite landing (inviter, expiry, tray, Decline/Accept) | `:1761-1789` | one sentence + Join | **3 — recorded, unruled; wire-limited** | E5-18 |
| 18 | `/mcp/authorize` shows code vs product types code | `:1828-1836` | person types the assistant's code; Deny present | 3 by the delta doc; product's direction is the standard device flow — **not filed** | — |
| 19 | Founding lands on the list + toast | `:2741-2752` | `/my-work` | 2 — ruled (`exec2-F5`, controller §4 #4); remedy not yet in tree at `a7b6292b` (`grep -in 'first-run\|new project' my-work.tsx` → 0) — **not filed**, it is F5's remedy | — |
| 20 | Epic band count | `:2904-2927` | counts membership on screen | 2 — ruled (controller §4 #5); the ordered "record the ruling beside `ticket-list.tsx:656-664`" not yet done — **not filed** | — |

**Category-3 members, counted: 8** (rows 1, 4, 6, 8, 12, 16, 17 filed; 13 folded). **Category-2 argued: 1** (row 9,
E5-9). **Category 1 with a shared defect, noted not filed: 1** (row 5).

---

## 4. CASE IDS — held / witnessed / still true

Recount: `node scripts/check-case-ids.mjs` → `2606 unique ids, 25 files, highest 17.006` (brief said 2601). I did not
verify 2606 ids; I verified the ones my findings touch, and asked of each the brief's three questions.

| id | file | holds? | witnessed? | still TRUE of the product? | note |
|---|---|---|---|---|---|
| `3.72` | 03 | ✅ | ✅ | ✅ — and it witnesses E5-7's defect as a property: the pre-check is asked "about the state the user CHOSE" and nothing re-asks on comment | see E5-7 |
| `16.63` `16.64` `16.65` | 16 | ✅ | ✅ | ✅ | the crumb chain; none covers parent-is-epic (E5-3) |
| `16.70` | 16 | ✅ | ✅ | ✅ | "TWO HOPS (task → story → epic)" — the one-hop case is the hole E5-3 fills |
| `16.23`–`16.30` (Door G) | 16 | ✅ | ✅ | ✅ | the READ half; the editors are "an unbuilt door" (E5-6) |
| `5.19` | 05 | ✅ | ✅ | ✅ | the endpoint serves unsummarised; nothing pins the ROW text (E5-8) |
| `11.147` | 11 | ✅ | ✅ | ✅ — it pins the silent reload that the bulk path's docblock calls the defect | E5-10: the case witnesses a property the file elsewhere disowns |
| `11.201`–`11.205` | 11 | ✅ | ✅ | ✅ | none covers the failed-read path (E5-13) |
| `13.428` | 13 | ✅ | ✅ | ✅ | Settings link present — exec 2's control; reused as mine for the nav |
| `15.*` (help) | 15 | — | — | ⚠ | `12 cases, 5 planted` per exec 2's recount; the help corpus's Board section (E5-1) is not among the planted defects — `check:help` cannot see it |

**Cases that assert a property the product has quietly stopped having:** none found among those I opened. **Cases that
witness a defect as a property:** `3.72` (E5-7) and `11.147` (E5-10) — both true of the code and both pinning the
behaviour a sibling docblock calls wrong.

**Not verified id by id:** `test-cases/13-*.md` (11 files, ~1.2 MB) — the same boundary exec 2 stated, and I did not
close it.

---

## 5. COUNT BY SEVERITY, MEMBERS NAMED

**19 findings** (`grep -c '^### E5-' docs/lanes/review-ux-exec5.md` → 19). By claimed severity, read from the
heading text: **Critical 0 · Important 14 · Minor 5** (14 + 5 = 19).

- **Important (14):** E5-1, E5-2, E5-3, E5-4, E5-5, E5-6, E5-7, E5-8, E5-9, E5-10, E5-11, E5-13, E5-15, E5-16
- **Minor (5):** E5-12, E5-14, E5-17, E5-18, E5-19

**Browser-measured (`[BROWSER]` in the heading):** E5-1, E5-2, E5-3, E5-4, E5-5, E5-6, E5-7, E5-8, E5-9, E5-11,
E5-12, E5-13, E5-14, E5-15, E5-16, E5-17 = 16 of 19. **Reproduced with an injected failure, zero server writes:** E5-13,
E5-15. **Source-only:** E5-10, E5-18, E5-19.

**Verifies an exec 2 §2d/§2e hypothesis with a measurement it lacked:** E5-10 (single-row mark-read), E5-13 (account
sections' failed reads — and further, the overwrite), E5-15 (ticket-types loading forever). **Adjacent to a §2d
candidate with a different measurement:** E5-9 (Delete: not "no confirmation" — which matches the export — but the
refusal's geometry).

**Observations recorded, deliberately not scored (0 either way):** the sheet title clipping (shared with the export);
the Channel select naming three undelivered channels (matches the export); the three identical `/mcp/tokens` rows
(data-dependent); the New-ticket Title input's missing accessible name (UI lane); ruling #4 and #5 remedies not yet in
the tree (F5/F7's remedies, not new defects).

---

## 6. COVERAGE — what I read, what I did NOT reach, and why

### 6.1 Walked in the browser (owner's dev stack `:3001`, signed in as owner, read-only; container built 08:20 IST)

`/workspaces` · `/w/…/p/…` Board tab (cards, drag attribute, arrows, Filters sheet, New-ticket dialog opened and
closed) · the ticket sheet for `CCSO-3` (crumbs, title, Move dialog driven to the comment step and cancelled, History
tab, footer geometry, inputs enumerated, wire read for the ticket and the roster) · `/inbox` (empty) ·
`/w/…/members` · `/account` (with the injected failed preferences read and captured PUT) · `/settings` (Ticket types
tab; with the injected 500 on ticket-types) · `/mcp/tokens` · `/mcp/authorize`.

**Not walked in the browser:** Backlog, List, Calendar, Timeline tabs (opened the page; did not drive them) ·
`/w/[workspaceId]` home · `/my-work` · `/help` · `/invite/[token]` (no live token) · `/sign-in` (signed in already; did
not sign out of the owner's session) · `/settings` Workflows and Workspace tabs · the workflow builder · the
ticket-type editor · the comment composer (V7 already covers its refusal path) · attachments upload · the subtask chain
end-to-end (no writes) · the delete/undo round trip (no writes) · **NARROW VIEWPORT** — `resize_window` reported success
but the page stayed at 1512 px (macOS full-screen window); the repo's `apps/web/e2e-viewport/responsive.spec.ts`
measures 390/768/1512 and I did not run it.

### 6.2 Read in source

`board.tsx` (card view `:1000-1063`, drag `:940-1000`, drop `:640-665`, `:875-885`) · `ticket-sheet.tsx` (`:654-700`,
`:673-692`, `:960-972`, `:1150-1265`, `:1490-1560`, `:1600-1700`, `:1740-1800`, `:1920-1995`, `:2325-2345`,
`:2590-2625`) — roughly 20% of 3,800 lines, **chosen by what the browser showed**, not read linearly ·
`transition-dialog.tsx` (`:120-145`, `:262-300`, `:355-370`, `:455-500`) · `new-ticket-dialog.tsx` (`:85-120`) ·
`history-list.tsx` (full) · `provenance.ts` (`:1-35`) · `view-types.ts` (`BoardCard`, `TicketRead.epic`,
`TicketHistoryEvent`, `RosterMember`) · `online/http.ts` (`:1-80`) · `submit.ts` (full) · `inbox/page.tsx`
(`:213-380`) · `account/page.tsx` (`:70-100`, `:196-232`) · `account/{sessions-section,sessions-client,
notification-preferences-gateway}.ts(x)` · `apps/web/src/account/{profile-section,workspaces-section}.tsx` ·
`members/page.tsx` (`:630-680`, `:700-745`, `:830-890`) · `workspaces/page.tsx` (`:255-270`, `:440-470`, `:550-555`)
· `invite/[token]/page.tsx` (`:75-127`) · `mcp/tokens/page.tsx` (full) · `settings/page.tsx` (`:40-130`) ·
`mcp-tokens-screen.tsx` (grep) · `workflow-builder/ticket-types/ticket-type-list-screen.tsx` (`:160-260`, `:336`,
`:360-380`) · `ticket-type-editor-screen.tsx` (`:186-197`, `:334-344`) · `workflow-builder/ui/{workflow-list-screen,
workflow-builder-screen}.tsx` (load arms) · `docs/manual.md` (Board `:660-672`, dates `:20-25`, `:355`, `:383-401`,
Filters `:784-830`, History `:408-419`, invitations `:205-240`) · `docs/faq.md` (`:138-150`, `:197-215`, `:300-312`)
· `docs/design/prototype-delta-2026-09-18.md` (board, members, invite, account entries) ·
`docs/hig-reconciliation-audit.md` (`:478-486`, `:571-576`) · `test-cases/16-remaining-doors.md` (`:263-300`,
`:1073-1092`) · `test-cases/03-foundation-ledger.md:79` · `test-cases/11-calendar-notifications.md` (`:94-162`,
`:295-312`).

### 6.3 NOT reached, named

1. **`apps/mobile` and `apps/desktop`** — untouched, same as exec 2. The manual's phone/web contrasts are verified on
   the web half only.
2. **The workflow builder as a person meets it** (canvas, inspector, publish, state-mapping dialog, history screen) —
   read only its load arms as positive controls for E5-15. exec 2's §2e candidates there (`publish-controls.tsx:65/117`,
   `state-mapping-dialog`, `workflow-rebind-dialog`) remain unverified by me.
3. **The comment thread, attachments door, subtask chain, close/reopen and delete/undo as END-TO-END FLOWS** — each
   needs a write against the owner's database. I read the code at the seams (E5-7, E5-9) and did not drive them.
4. **Permissions as a member or guest** — I held only the owner's session. Every refusal path was reproduced by
   injecting a failure client-side (E5-13, E5-15) or read from source; none was observed as a real 403/422.
5. **`/help` at paint**, `/sign-in`, `/privacy`, `/terms`, `/w/[workspaceId]` home, `/my-work` — not opened.
6. **Backlog / List / Calendar / Timeline** — not driven; the List's due column was read in source only.
7. **`test-cases/13-*.md`** — not verified id by id.
8. **exec 2's remaining §2e candidates** (~30) beyond the three I verified — not opened.
9. **`check:help` / `scripts/help-content.mjs`** — not run; E5-1's corpus rows are read from `docs/manual.md`/`faq.md`
   directly, which is what the generator consumes.
10. **Offline / replica-degraded** — the web client is online-only (`BoardCard.pending` docblock); the edge class is
    mobile/desktop's and I did not reach them.
11. **Concurrent / interleaved** — not attempted (needs two sessions writing).

### 6.4 How the graph and the search tools were used

`graphify-out/GRAPH_REPORT.md`: community hub index and god nodes (§1.10). The inbox community (144) named
`BULK_REFUSED_COPY`/`BULK_UNREACHED_COPY`/`CANNOT_OPEN_COPY` before I opened `inbox/page.tsx`, which sent me to the
bulk path's docblock and so to E5-10. The account community (79) named `useAuthMethods`/`AccountPage`; the
ticket-type editor community (84) named `FieldsEditor`/`parseOptions`. I did **not** run `/graphify query` or
`mcp__semble__search`: every question I had was located faster by the browser (which element, which class) followed
by one `grep -n` for the class or string — the graph's code layer is a leaf structure for UX surfaces (its ten god
nodes are all test/infra symbols), so its BFS would have pointed at test helpers. Tokens saved by the graph: the
community index (~60 lines) in place of `ls -R` over 1,269 files; the report's own 357 KB was not read.

### 6.5 Stale figures I was handed, recounted

| claim | measured | command |
|---|---|---|
| *"2601 ids across 25 files"* | **2606** | `node scripts/check-case-ids.mjs` |
| *"`onClick` → `sc-camel-on-click` (160 attributes)"* | not recounted (exec 2 measured 161; I never cited the repo copy) | — |
| my own §5 first count (13/6) | **14/5** | `grep -c '^### E5-'` + the heading text |

### 6.6 Held for phase 2 (refutations) — noted, not filed

- exec 2's `V8` ("Opening any parent ticket raises a false alert") — I opened a parent-less child only; **not** tested.
- exec 2's `F9` reachability (comment box on a refused post) — not tested.
- Nothing I measured contradicts a landed exec 2 finding. **I have no refutation to file at this time**; if I find one
  in the remaining window it goes to `docs/lanes/review-refutations-exec5.md`.

---

*executor 5 — UX (Opus). **Report complete for phase 1 at the time of the last push** (see `git log
origin/exec5/review-ux`). 19 findings — Critical 0 · Important 14 · Minor 5 — members named in §5. No PR opened, no
file changed except this report. No AskUserQuestion, no Workflow, no subagent used.*
