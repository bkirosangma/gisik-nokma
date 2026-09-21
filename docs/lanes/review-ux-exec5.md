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
soon" notifications. The Board is the DEFAULT view (`docs/manual.md:2027` *"The board is the default view"*) and the
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

**SEVERITY: Important** (claimed). The product tells a person something untrue about itself beside the control it
contradicts — the file's own words for the sibling defect.

---

## 3. THE PROTOTYPE — classified

(filled in)

---

## 4. CASE IDS — held / witnessed / still true

(filled in)

---

## 5. COUNT BY SEVERITY, MEMBERS NAMED

(filled in)

---

## 6. COVERAGE — what I read, what I did NOT reach, and why

(filled in last)
