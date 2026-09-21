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
| `/` | `app/page.tsx` | — | redirects to `/workspaces` | yes (landed on `/workspaces`) |
| `/workspaces` | `app/workspaces/page.tsx` | 669 | yes |
| `/sign-in` | `app/sign-in/page.tsx` | 496 | no (already signed in) |
| `/invite/[token]` | `app/invite/[token]/page.tsx` | 127 | no (no live token) — source |
| `/inbox` | `app/inbox/page.tsx` | 512 | yes (empty state) |
| `/account` | `app/account/page.tsx` | 309 | yes (+ injected failed read, captured PUT) |
| `/settings` | `app/settings/page.tsx` | 382 | yes, Ticket types tab (+ injected 500); Workflows/Workspace tabs no |
| `/help` | `app/help/page.tsx` | 23 | no |
| `/privacy`, `/terms` | `app/privacy/page.tsx`, `app/terms/page.tsx` | 202, 209 | no |
| `/mcp/authorize` | `app/mcp/authorize/page.tsx` | 260 | yes |
| `/mcp/tokens` | `app/mcp/tokens/page.tsx` | 33 | yes |
| `/w/[workspaceId]` | `app/w/[workspaceId]/page.tsx` | 1122 | no — source only |
| `/w/[workspaceId]/my-work` | `app/w/[workspaceId]/my-work/page.tsx` | 82 | no |
| `/w/[workspaceId]/members` | `app/w/[workspaceId]/members/page.tsx` | 1002 | yes |
| `/w/[workspaceId]/p/[projectId]` | `app/w/[workspaceId]/p/[projectId]/page.tsx` | 3414 | yes — Board tab, Filters sheet, New-ticket dialog, ticket sheet (`CCSO-3`), Move dialog; Backlog/List/Calendar/Timeline tabs no |
| `/w/[workspaceId]/settings/ticket-types` (+ `/new`, `/[typeId]`) | 3 files | 34, 34, 35 | list via `/settings` yes; editor no |
| `/w/[workspaceId]/settings/workflows` (+ `/new`, `/[workflowId]`, `/[workflowId]/history`) | 4 files | 40, 77, 102, 53 | no — source only |

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

### 2.0 Index — every finding, its surface, the edge class it sits in, the instrument, and its sibling in another lane

| id | sev | surface | edge class(es) | instrument | sibling elsewhere |
|---|---|---|---|---|---|
| E5-1 | Imp | help ↔ board | copy | browser + source | class of `exec2-F1` |
| E5-2 | Imp | board card | — (prototype cat. 3) | browser + source | — |
| E5-3 | Imp | sheet crumb | — (prototype cat. 3) | browser + wire + source | `exec4-E4-1` |
| E5-4 | Imp | assignee picker, mentions, Filters | EMPTY (a nameless member) | browser + wire + source | `exec4-E4-18` |
| E5-5 | Imp | Filters sheet | offers-then-refuses | browser + source | — |
| E5-6 | Imp | sheet Due row | first-run of a flow (prototype cat. 3) | browser + source | — |
| E5-7 | Imp | Move dialog | SERVER-REFUSES-WHILE-CLIENT-BELIEVES (inverted: client refuses while the door would accept) | browser + source | `exec2-E2-40` (`require-field`) |
| E5-8 | Imp | History tab | — (prototype cat. 3) | browser + source | `exec4-E4-19` |
| E5-9 | Imp | sheet Delete | PERMISSION-REFUSED (geometry) | browser + source | `exec2-E2-35` (confirmation angle) |
| E5-10 | Imp | inbox | ERROR (silent) | source | `exec2-E2-26` |
| E5-11 | Imp | invite form | — (prototype cat. 3) | browser + source | — |
| E5-12 | Min | `/workspaces` vs `/account` | copy (units) | browser + source | — |
| E5-13 | **Crit** | `/account` | ERROR → SERVER-ACCEPTS-WHAT-THE-CLIENT-GUESSED | browser, injected + signed-out | `exec2-E2-23/24` (adjacent arms) |
| E5-14 | Min | ticket-type list | offers-then-refuses (hover-only reason) | browser + source | — |
| E5-15 | Imp | `/settings` | ERROR (loading for ever) | browser, injected | `exec2-E2-20` |
| E5-16 | Imp | New-ticket dialog | FIRST-RUN default (prototype cat. 3) | browser + source | — |
| E5-17 | Min | `/mcp/tokens` | navigation (orphan) | browser + source | — |
| E5-18 | Min | `/invite/[token]` | FIRST-RUN, ERROR arm (prototype cat. 3) | source + browser (dead arm) | — |
| E5-19 | Min | `/account` Save name | ERROR (silent) | source | — |
| E5-20 | Imp | Move dialog + sheet | CONCURRENT controls (two Escape listeners) | source (+ pair observed) | `exec2-E2-34` |
| E5-21 | Imp | phone Comment + help | SERVER-REFUSES-WHILE-CLIENT-BELIEVES | source | `exec2-E2-42` |
| E5-22 | Min | subtask form | copy (silent type) | browser + source | — |
| E5-23 | Min | workspace home | FIRST-RUN | source | — |
| E5-24 | Imp | help (4 passages) | copy | browser + source | `exec6-E6-1` (delete row) |
| E5-25 | Imp | every write catch (9) | ERROR (401 painted as transport) | source | — |
| E5-26 | Imp | desktop first screen | FIRST-RUN | source | — |
| E5-27 | Imp | Move submit | ERROR (silent), CONCURRENT (no latch) | source | `exec2-E2-29` |
| E5-28 | Imp | workflow Publish | ERROR (stuck) | source | `exec2-E2-22` (mapping half) |
| E5-29 | Min | state-mapping dialog | copy | source | — |
| E5-30 | Min | shell refusal panel (5 routes) | ERROR (copy) | source | — |
| E5-31 | Imp | signed-out app bar | PERMISSION-REFUSED / FIRST-RUN | browser (2nd, 390 px) + source | — |
| E5-32 | Imp | signed-out deep link + help | FIRST-RUN (copy) | browser (2nd) + source | — |
| E5-33 | Min | `/sign-in` | ERROR (copy) | browser (2nd, 390 px) + source | — |
| E5-34 | Min | nav project item on an archived project | SOFT-DELETED (project) | source | extends `exec2-E2-38` |
| E5-35 | Min | inbox rows | copy (no time, no ticket) — prototype cat. 3 | source | — |

**Edge classes reached, by finding:** EMPTY (E5-4) · ERROR (E5-10, 13, 15, 18, 19, 25, 27, 28, 30, 33) ·
PERMISSION-REFUSED (E5-9, 31) · OFFLINE/REPLICA-DEGRADED (**not reached** — web is online-only; phone/desktop read at two
screens) · SOFT-DELETED (E5-34 for projects; tickets **not reached** by me — `exec4-E4-23` holds it, §6.6) · CONCURRENT (E5-20, 27) · NARROW
VIEWPORT (signed-out only: E5-31, 33) · FIRST-RUN (E5-6, 16, 18, 23, 26, 31, 32) · SERVER-REFUSES-WHILE-CLIENT-BELIEVES
(E5-7 inverted, 13, 21).

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
bits.push(di.label)` and colours it `di.late ? "var(--danger)" : "var(--label2)"` (`:2504`). The product's card
(`board.tsx:1029-1063`) renders title, an optional avatar, a `pending`/`reopened` chip, a rollup, and a `who · when`
fold. **No key. No due date. No lateness.** Ticket `CCSO-3` is due `14 Sep 2026` (sheet `Due` row, `[BROWSER]`);
the measurement was taken on `2026-09-21` (`date` on the box, and the report's start line); its board card is
indistinguishable from an undated one — its meta div is literally empty
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

**MEASUREMENT.** `EXPORT:2493-2504` opened; `board.tsx:1029-1063` opened; `view-types.ts:204-214` opened;
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
nothing"* (`:1751-1758`). A crumb that REPEATS a level states one too. The docblock at `view-types.ts:524-529` guards
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
product's primary sign-in path. That page fixed its three sites with `memberLabel` (`:671-676`, name → email → id)
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

**Scope, stated rather than implied.** The 3,943 px is **one ticket's** (`CCSO-3`, a long seeded description). I
attempted the same measurement on a short ticket (`01M1YPTE…`, *"Order more till roll"*) and could not: the browser
tab went `hidden` and stopped hydrating (§6.1). So the number is CCSO-3's; the structural claim is what holds
generally — between the slot (under the tab bar) and the footer sit, on every ticket, the state row, the Subtasks
section with its form, four field rows, the description editor with its toolbar, the visibility editor with four
radios and a roster, the attachment list and the comment thread with its composer (`ticket-sheet.tsx:1994-2607`).
Whether a minimal ticket's body exceeds 756 px I did **not** measure; the finding is *"on any ticket whose body
scrolls, the refusal renders where the person is not"*, and CCSO-3 is one measured instance.

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

**Observation, not scored — and corrected by another lane:** the `Channel` select (`email`/`sms`/`whatsapp`)
MATCHES the export (`EXPORT:753-755`), and the manual (`:229-234`) says the product sends by none of them. I left it
at category 1. exec 6's `E6-9` then measured the DOOR: `INVITE_CHANNELS = ['email', 'phone']`, so `sms` and
`whatsapp` are refused with a 422 naming a value the form does not offer. That is the finding underneath this
control, it is theirs, and it shows the limit of a drawing-match: **the export copied the form, not the door.**

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

### E5-13 — CRITICAL · After a failed preferences read, `/account` paints all five notifications ON and one toggle PUTs a whole document built from that guess — silently overwriting whatever the person had muted `[BROWSER, reproduced with zero server writes]` `[SOURCE]` (verifies exec 2 §2e's "two account sections with no error prop", and goes further)

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

**Second reproduction, no injection (devtools browser, isolated context, 390 px emulated, signed OUT):** open
`/account` with no session. The three reads answer **401** (`fetch` from the page: `prefs: 401, workspaces: 401,
sessions: 401`) and the page paints *"Your account — This is you, across every workspace"*, the Notifications
section with **five toggles `checked: true, disabled: false`**, a *"Your workspaces"* heading over nothing, and
*"No signed-in devices to show."* — for a visitor who is nobody. Only the newest section says the truth:
*"Connected assistants — Sign in to see and revoke…"*. A visitor who flips a toggle sends the same guessed PUT (it
gets a 401 and reverts silently — `exec2-E2-24`'s arm).

**WHY.** The page's own comment (`:74-80`) says the literal *"merely renders every kind as on for this visit, without
asserting that fact about the account"* — and then `toggleKind` asserts it to the server. The sessions section
(`sessions-section.tsx:56-63`) hedges its empty sentence for the same collapsed read — *"this component cannot tell
which"* — while a signed-in person always has at least the current session, so "No signed-in devices to show" on
`/account` (`[BROWSER]`) can only be a failed read painted as an empty state. A third site does not even hedge:
`account/page.tsx:180` `passkeyClient.list().then(setPasskeys, () => setPasskeys([]))` → `passkeys-section.tsx:96-97`
*"You have no passkeys yet."* — *"yet"* asserts a fact about the account, over a read that answered nothing, to a
person who (here) holds seventeen (`[BROWSER]` `/account` lists 17 `Delete passkey …` controls). A fourth, `:67` `getMyWorkspaces().then(setWorkspaces, () => setWorkspaces([]))`, paints the *"Your workspaces"*
heading over an empty list (`workspaces-section.tsx` has no empty arm) and its comment (`:58-66`) calls the silence
*"Deliberate, not an oversight"* while inviting the fix (*"that's an `error` state added here"*). Four failed-read
collapses, all on one page (a regex sweep for `.then(<setter>, () => set…(` over `apps/web` and `packages/app-core/src`
→ exactly these four). This is the brief's expensive shape inverted: the server ACCEPTS a claim the client invented
— and, for passkeys and workspaces, the client asserts an absence the server never stated.

**WHAT WOULD HAVE BEEN BETTER.** Hold `prefs = null` on a failed read and render the five rows disabled with *"Your
preferences could not be loaded"*; make `toggleKind` refuse to save unless the last `load` succeeded; same for
sessions (`:91`).

**MEASUREMENT.** `[BROWSER]` JS transcript above (`cap` array: `[{GET, blocked:true}, {PUT, body:"{\"mutedKinds\":[\"assignment\"]}"}]`).
`[SOURCE]` `account/page.tsx:74-81`, `:91`, `:180`, `:215-232`; `passkeys-section.tsx:96-97`; `notification-preferences-gateway.ts:18-22`;
`sessions-section.tsx:56-63`.

**SEVERITY: Critical** (claimed). A person's stored settings are overwritten by a default the product itself says it
is not asserting, silently, with no way to notice. On my scale that is data loss caused by a failed read — the same
class as the accepted `exec2-V2` (a failed re-read destroys an invitation URL). The loss is a preference document,
re-settable once noticed; it will not be noticed, because nothing on the page says the read failed.

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
above; `EXPORT:2216`, `:2274-2282`. **Both paths default to Epic:** the loaded path is the workspace's rank order
(rank 1 = Epic on `/settings`); the loading fallback `BUILTIN_TYPE_LADDER` (`page.tsx:133`) maps
`BUILTIN_TICKET_TYPE_SEEDS`, whose first entry is `{ id: 'epic', name: 'Epic', rank: 1 }`
(`packages/domain/src/ticket-types.ts:139`). The combobox paints the NAME of `typeId` (`new-ticket-dialog.tsx:143`
`value={typeId === '' ? null : typeId}`) and `:284` submits that `typeId` — so a painted `Epic` is the id that would
be filed.

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

### E5-18 — MINOR · The invite landing page offers Join or nothing: no Decline, no inviter, no expiry; the export draws all three — and its dead arm offers no link at all `[SOURCE]` `[BROWSER: dead arm]` — category 3, wire-limited

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

**The page's other arm, measured at paint:** `/invite/not-a-real-token` signed out (second browser, 390 px) renders
*"This invitation link does not open anything. It may have been used, withdrawn, or lapsed — ask whoever invited you
for a new one."* with **`links: []` and no `<nav>`** — no Sign in, no Workspaces, no Help. A person who already has
an account and a lapsed link is left on a page with nothing to press (`page.tsx:92-96`).

**MEASUREMENT.** `[SOURCE]` lines above; `EXPORT:1761-1789`. The live arm not driven — I hold no live invitation
token; the dead arm `[BROWSER]` as above.

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

### E5-20 — IMPORTANT · One Escape in the Move dialog closes the ticket sheet under it — the `Sheet`'s own guard says a child must `preventDefault()`, and its sibling `Dialog` does not `[SOURCE]` `[BROWSER: the stacked pair observed]` (verifies exec 2 §2e's "two `aria-modal` dialogs … one Escape closing both", unmeasured there)

**WHAT.** With `CCSO-3` open, `Move…` mounts `TransitionDialog` (`ticket-sheet.tsx:2624`) → `Dialog`
(`transition-dialog.tsx:382`); the DOM then holds **two** `role="dialog"` elements (`[BROWSER]` `dialogs: 2`,
`aria-modal="true"` on the Move dialog). `packages/ui/src/components/dialog.tsx:6-13`: a document-level `keydown`
that calls `onClose()` on `Escape` **with no `preventDefault()`**. `packages/ui/src/components/sheet.tsx:56-90`: a
document-level `keydown` that closes the sheet on `Escape` unless `event.defaultPrevented` — and its docblock is
explicit: *"A child that handles Escape must call `preventDefault()` for this guard to see it."* The Sheet's listener
was registered first (the sheet mounted first), so on one Escape it runs first, sees `defaultPrevented === false`,
and calls the sheet's `onClose`; then the dialog's listener closes the dialog. (The order does not matter: neither handler
sets `defaultPrevented`, so both fire in either order.) The rendered outcome — the person who meant to cancel a move
landing back on the board — is **unverified**: the browser stopped hydrating before I pressed Escape with both open
(§6.1), and the `×` button path I did drive closed only the dialog (`dialogsAfter: 1`), which is the close-button
path and says nothing about Escape. What is verified is the mechanism: two `document` listeners, one guard, and the
guard's precondition unmet by the sibling component.

**WHY.** The fix round that added the guard fixed the ONE child it was looking at — the title field
(`ticket-sheet.tsx:1831-1845`, `preventDefault` "IS LOAD-BEARING", case `16.86` *"does not close the sheet"*) — and
not the `Dialog` component in the same package, which is the child every Move, Reopen and Bulk-close goes through.
The same stacking exists on the board: in the `needs-reopen` arm `create-ticket-flow.tsx:250-253` opens
`ReopenDialog` without closing `NewTicketDialog` (`:359-372`), so both `Dialog`s are open and one Escape cancels the
reopen prompt AND dismisses the New-ticket dialog.

**WHAT WOULD HAVE BEEN BETTER.** `Dialog`'s handler calls `event.preventDefault()` after `onClose()` — one line — so
the Sheet's guard sees it; or the Sheet listens on its own root instead of `document`.

**MEASUREMENT.** `[SOURCE]` `dialog.tsx:6-13` (opened: no `preventDefault`), `sheet.tsx:56-90` (opened: the guard and
its contract), `ticket-sheet.tsx:2624`, `transition-dialog.tsx:382`, `create-ticket-flow.tsx:246-256`, `:359-372`.
`[BROWSER]` the pair was observed open together; **the Escape itself was not pressed with both open** — the browser
became unusable before I returned to it (§6.1). `grep -n Escape packages/app-core/test/views/ticket-sheet.test.tsx`
→ only `16.86` (the title field); no case presses Escape with the Move dialog open.

**SEVERITY: Important** (claimed). A cancel that discards more than the person cancelled, on every ticket move.

---

### E5-21 — IMPORTANT · The manual sends a person to the phone to comment; the phone files the comment under the ASSIGNEE's id (or the literal `'me'`), the server refuses that as identity spoofing, and the app shows nothing `[SOURCE]` — the phone half of exec 2's `F1(e)`, which it verified "on the web half only"

**WHAT.** `docs/manual.md:365-366`: *"**The phone app has a Comment button on a job and the website does not.**"*
The button exists (`apps/mobile/src/screens/ticket-screen.tsx:126`). Its handler (`:36-57`) submits
`comment.added` with `actorId: state.assigneeId ?? 'me'` — the comment carries **the assignee's identity**, or a
five-byte literal when nobody is assigned — under a comment that says so: *"Interim … the session user id is not
wired up (no auth flow in this shell yet)."* The server refuses any event whose actor is not the session's:
`check-permission.ts:542-545` `if (env.actorId !== ctx.sessionUserId) return refuse(IDENTITY_SPOOF_REASON)`, and the
sync door independently: `sync-service.ts:321-324` `if (event.actorId !== userId) return { status: 'invalid' … }`.
On the phone the submit's only failure arm swallows the expected outcome — `:54` `if (err instanceof
OfflineAcceptError) return; // queued locally — the expected offline outcome` — so the person sees no error and no
posted comment.

**WHY.** exec 2's `F1(e)` showed the web HALF of that manual sentence is false (the web has a composer) and said
*"I verified the web half only."* The phone half is false in the other direction: the button is there and what it
files can never be committed — the actor on the event is not the session's, and `IDENTITY_SPOOF_REASON` exists to
refuse exactly that, so the refusal is guaranteed by construction. The words typed sit in a local queue that will be
refused at the first sync that has a session, and the app reports nothing at either moment. The manual's
`:1203-1213` caveats ("Treat both as early") do not mention that a phone comment cannot be posted.

**WHAT WOULD HAVE BEEN BETTER.** Until the phone has a session, withhold the Comment control with a sentence
(the New-ticket rule: asks before it offers) rather than accept into a queue that will be refused; and correct the
manual sentence to say the web has the thread and the phone does not yet post one as you.

**MEASUREMENT.** `[SOURCE]` `ticket-screen.tsx:36-57`, `:54`, `:126`; `check-permission.ts:542-545`;
`sync-service.ts:318-324`; `docs/manual.md:363-366`, `:1203-1216`. Not driven: no phone, no mobile session.

**SEVERITY: Important** (claimed). The manual already flags the phone app as untested and early; the finding is that
it flags the wrong danger and sends people to the phone for the one thing the phone cannot do.

---

### E5-22 — MINOR · "Add subtask" never says what it will file: under an Epic it silently births a Task (skipping Story); the fallback rule is flagged "for a ruling" and unruled `[BROWSER]` `[SOURCE]`

**WHAT.** The subtask section reads `New subtask title` + `Add subtask` (`ticket-sheet.tsx:2295`, `:2306`; `[BROWSER]`
on `CCSO-3`) and no sentence names the type the child will take. The type is chosen by `subtaskTypeFor`
(`:118-131`): rule 1, the built-in `task` whenever legal; rule 2, otherwise the SHALLOWEST legal type. Under an Epic
(rank 1) `task` (rank 3) is legal, so the child is a **Task** — the Story rank between them is skipped; under an
Errand (rank 3) it is a Sub-task. `subtaskType.name` is read nowhere in the render (`grep -n 'subtaskType' …` → the
predicate, the payload `:1388`, and the arm gates only).

**WHY.** The fix of 2026-09-20 made the form ask before it offers (`:1303-1330`) — the right rule — and its own
docblock says of rule 2: *"the one judgement in this change that is not forced, and it is flagged for a ruling
rather than settled here"* (`:106-113`). A person on an Epic who wants a Story child must know to use New ticket
with a Parent instead; the form beside them will make a Task without saying so. Two doors, two answers, one of them
silent.

**WHAT WOULD HAVE BEEN BETTER.** One clause: *"Adds a **Task** under this epic"* (the type is already in hand), or a
type picker over the legal set when more than one qualifies.

**MEASUREMENT.** `[BROWSER]` subtask section text; `[SOURCE]` `:96-131`, `:1334-1346`, `:1379-1388`, `:2294-2306`.

**SEVERITY: Minor** (claimed).

---

### E5-23 — MINOR · A brand-new owner's workspace home says "No projects you can open are active here" — a sentence written for the excluded member, read by the founder above the form that makes the first project `[SOURCE]` — FIRST-RUN

**WHAT.** `apps/web/app/w/[workspaceId]/page.tsx:883-887`: when `shown.length === 0` the home renders *"No projects
you can open are active here."* The comment above it (`:884-886`) says why: *"A member outside every project has an
empty live list in a workspace full of them, and 'there are no projects' would be a claim about the workspace."*
Correct for that member. An owner who founded the workspace seconds ago (`exec2-F5`'s person, arriving from
`/my-work`'s four negatives) has `shown = []` for the other reason — the workspace has none — and reads a sentence
that says the opposite ("you can open" presupposes projects they cannot), directly above `<NewProjectForm>`
(`:958-959`, rendered for `isAdmin`).

**WHY.** The nine edge classes include FIRST-RUN, and the recorded rule for this file is that *"'there are no
projects' would be a claim about the workspace"* — a claim the OWNER is entitled to, since an owner's list IS the
workspace's list (`isAdmin` sees everything). The one sentence serves two facts and is true of one. Controller ruling
§4 #4 ordered a first-run pointer on `/my-work`; this is the sibling surface the founder lands on next, and it has
the form but not the sentence.

**WHAT WOULD HAVE BEEN BETTER.** Branch on `isAdmin && projects.length === 0`: *"No projects yet — create the first
one below."*; keep the member's sentence for the member.

**MEASUREMENT.** `[SOURCE]` `:666` (`shown`), `:883-887`, `:958-962`. Not driven — I will not found a workspace in
the owner's database.

**SEVERITY: Minor** (claimed).

---

### E5-24 — IMPORTANT · Four more passages of the help describe a product that no longer exists — "no change role", "you cannot rename a job", "you cannot delete a job", "you cannot see what [visibility] is currently set to" `[BROWSER]` `[SOURCE]` — sibling of `exec2-F1`, none of its eight rows

| # | the sentence | where | falsified by |
|---|---|---|---|
| a | *"**You can see, and you cannot change.** … That role is read-only: there is no "remove", and no "change role"."* and `faq.md:143-147` *"Where do I change somebody's role, or take them off? Nowhere on screen."* | `docs/manual.md:299-300`, `docs/faq.md:143-147` | `[BROWSER]` `/w/…/members` paints a `Role` select per row (`Role for accountant@e2e.gisik-nokma.local`, options admin/member/guest); `members/page.tsx:334-350` `changeRole` submits it. **"no remove" is still true** (`grep -n 'Remove' members/page.tsx` → 0 controls); the sentence is half-right and states the half that changed as unchanged. |
| b | *"**You cannot rename a job.**"* | `docs/manual.md:371` | `ticket-sheet.tsx:1818` `aria-label="Ticket title"` — an editable input; `:1806-1810` *"`onBlur` commits, `Enter` commits, `Escape` abandons"*; `[BROWSER]` `textbox "Ticket title"` in the sheet's accessibility tree. |
| c | *"**You cannot delete a job.** If your stages include a "won't do" or "cancelled" stage, moving it there is the nearest thing available."* | `docs/manual.md:372-373` | `ticket-sheet.tsx:2612-2621` the footer `Delete` (E5-9); `[BROWSER]` `button "Delete"` on the sheet. |
| d | *"**You can set who sees a job. You cannot see what it is currently set to.** On the one screen whose entire subject is who can see what, the current audience is shown as unavailable rather than guessed."* | `docs/manual.md:989-993` | `routes/tickets.ts:78-90` serves `own_mode`/`resolved_mode` on the detail read; `mappers.ts:1992` maps it; `ticket-sheet.tsx:649-653` builds `standingVisibility` from it and passes `current=` (`:2512`); `visibility-editor.tsx:315-330` renders the *unserved* arm only when `current === null` and otherwise `standingSentence(current, nameOf)`. `[BROWSER]` the wire for `CCSO-3`'s parent object carried `own_mode: "inherit", resolved_mode: "project"`. |

**WHY.** The same defect and the same direction as `exec2-F1` (accepted, Important): the product's own help makes it
look less capable than it is — here on the four most basic acts a person takes on a ticket and a person (rename,
delete, set a role, read who can see). `check:help` cannot see any of these (`exec2-F2`). `F1`'s rows a–h are the
nav, sign-out, the theme toggle, the workspace card, comments, attachments and the settings links; none is these
four passages, so this is a wider true scope with its own measurements.

**WHAT WOULD HAVE BEEN BETTER.** The corpus's own convention (`docs/manual.md:355-359`): keep each entry, mark it
superseded, say what is now true. For (a), keep "no remove" and drop "no change role".

**MEASUREMENT.** Each cell above names the line opened. `[BROWSER]` controls from the members-page and sheet
accessibility trees recorded earlier in this report.

**SEVERITY: Important** (claimed) — `F1`'s severity for `F1`'s class.

---

### E5-25 — IMPORTANT · A write after the session expires is reported as *"We could not reach the server"* — at nine sites in seven files — and none of them sends the person to sign in, though every READ does `[SOURCE]`

**WHAT.** The events door answers refusals inside a `200` body (`routes/events.ts:102` `return { results }`); a
`401` is produced only by the session guard before the handler (`auth/require-session.ts:102`
`reply.code(401).send(UNAUTHENTICATED_BODY)`). The client transport throws `HttpError` on any non-2xx
(`online/http.ts:134`) with `message = "HTTP 401 for /v1/events"`. Every write `catch` in the product then paints
that as transport: `ticket-sheet.tsx:1074` *"We could not reach the server for this change — HTTP 401 for
/v1/events"*, and the same sentence at `board.tsx:1430`, `:1532`, `:1736`, `bulk-close-dialog.tsx:233`,
`backlog-rank-controls.tsx:186`, `backlog-start-button.tsx:113`, `workspace-settings-form.tsx:298`,
`page.tsx:848` (the delete's Undo) — nine sites, `grep -rn 'could not reach the server'`. Meanwhile
`apps/web/src/expired-session.tsx` is *"The ONE author of 'a 401 is not a refusal, it is a session that ended'"* and
its hook is fed **reads only**: `page.tsx:1094-1098` `useSignInOnExpiredSession([board.error, list.error,
ticketTypes.error])`; `inbox/page.tsx:234`; `w/[workspaceId]/page.tsx:219`. No write error is on any of those lists — and it could not be: the sheet's `transportError` is component-local state
(`ticket-sheet.tsx:1074` `setTransportError`), never lifted to the page that owns the hook. The irony is that the
sentence already CONTAINS the hook's predicate — `EXPIRED_SESSION_PREFIX = 'HTTP 401 '` (`expired-session.tsx:49`) is a
string match, and `"… — HTTP 401 for /v1/events"` carries it — so the classifier exists and the writes simply never
reach it.

**WHY.** A person whose session lapsed while a sheet was open presses Move, Close, Delete, Save, Start, or Undo, and
is told the server is unreachable — the server was reached and said the one thing the product elsewhere treats as
its own category. Rulings 27/33 split *refusal* from *transport*; a session that ended is a third thing, and the
`expired-session.tsx` docblock (`:9-18`) records that leaving it on the wrong side produced *"a panel telling a person
their work 'cannot be read', when the true and actionable sentence is sign in again"* — for reads. The writes were
never brought under the same rule. The person's typed comment / title draft is also stranded behind a sentence that
suggests retrying, when retrying cannot succeed.

**WHAT WOULD HAVE BEEN BETTER.** One predicate on the catch — `error instanceof HttpError && error.status === 401` (the
transport HAS the status, `http.ts:50`) — routing to the same `/sign-in?next=` redirect reads use, with a sentence
*"Your session has ended — sign in again to send this."*; or feed each page's write-error state into its existing
`useSignInOnExpiredSession` list.

**MEASUREMENT.** `[SOURCE]` every line above opened. Not driven: I will not sign the owner's session out, and the
browser stopped hydrating before I could inject a `401` on `/v1/events` (§6.1) — the injection would have been the
same technique as E5-13/E5-15 and is the reproduction the judge can run: wrap `fetch` to answer `401` for `POST
/v1/events`, press `Move`, read the transport slot.

**SEVERITY: Important** (claimed). The product tells a person something untrue about itself at the moment they can
least afford it, on every write surface, and withholds the one action that would help.

---

### E5-26 — IMPORTANT · The desktop app's only first-run sentence sends a person to a Settings screen it does not have, for a token nothing issues — and the manual says the step is merely awkward `[SOURCE]` — FIRST-RUN

**WHAT.** `apps/desktop/src/app.tsx:95-102`: with no stored token the whole app is one paragraph — *"Sign in on the
web app, then paste your token in Settings (interim flow — see plan Open questions)."* — plus a help toggle. The
token is read from `localStorage.getItem('gisik.token')` (`:40`) and the workspace from `'gisik.workspaceId'`
(`:39`); the comment at `:17-19` says they *"arrive via localStorage set on the sign-in page."*
`grep -rn "gisik.token\|gisik.workspaceId" apps/web/app apps/web/src` → **0** — no sign-in page sets them.
`grep -rni settings apps/desktop/src/app.tsx` → only the hint itself — there is **no Settings screen** in the desktop
app. And the web has no page that shows a token: `/mcp/tokens` says *"The connection itself is never shown — only a
one-way hash of it is stored, so there is nothing here to copy"* (`[BROWSER]`, `mcp-tokens-screen.tsx:343`).

**WHY.** `docs/manual.md:1209-1211` describes this as *"It tells you to sign in on the website, then copy something
across and paste it into the app's settings by hand. That is described as a temporary arrangement. It is not
something to ask a nervous colleague to do."* — awkward, but doable. It is not doable: there is nothing to copy, no
screen to paste into, and the sentence cites a planning document (*"plan Open questions"*) a person cannot open.
FIRST-RUN is one of the nine edge classes; the desktop's is a locked door with a note describing a key.

**WHAT WOULD HAVE BEEN BETTER.** Until the desktop has a sign-in, say so plainly — *"The desktop app cannot sign in
yet — use the website."* — and drop the plan reference; or ship the settings form the sentence promises.

**MEASUREMENT.** `[SOURCE]` `app.tsx:14-19`, `:39-40`, `:95-102`; the two greps above (0 hits each);
`docs/manual.md:1203-1213`.

**SEVERITY: Important** (claimed) — no way forward on the surface, and the help describes a path that is not there.
Minor if the judge weighs the manual's "treat both as early" as sufficient warning.

---

### E5-27 — IMPORTANT · A Move that fails in transport is silence — no sentence, no latch, the dialog stays open — while Close, Reopen and Delete on the same sheet have both; the sheet's own comment records the gap and hands the dialog `transportError={null}` `[SOURCE]` (verifies exec 2 §2d's "a transport failure during a Move has no surface at all", unmeasured there)

**WHAT.** `ticket-sheet.tsx:711-745` `submitTransition`: builds the events, `await dataSource.ingest([...])`, reads
the results — **no `try`/`catch`, no `submitting` guard**. `transition-dialog.tsx:366-379` `submit()` and `:515`
`<Button variant="primary" disabled={blocked} onClick={submit}>` — `blocked` (`:360-364`) is the form's validity
only; nothing disables Move while a submission is in flight (`grep -n submitting transition-dialog.tsx` → 0). The
sheet mounts the dialog with `transportError={null}` and says why at `:2637-2644`: *"`submitTransition` above stays
unguarded … a rejected `ingest` here is an unhandled promise rejection, not a state this component tracks, so there
is nothing to pass but `null`."* The sibling writes on the same sheet — `submitTicketEvent` for Close/Reopen/Delete
(`:1025-1077`) — have the latch (`:1029` `if (submitting) return`), the transport arm (`:1071-1074` *"We could not
reach the server for this change — …"*), and the silence arm (`:1040-1051` *"The server did not answer this
change."*).

**WHY.** Move is the most frequent write a person makes on a ticket. When the request drops, the dialog simply stays
open with an enabled Move button and no sentence; the person presses again — and because there is no latch, a
request that did go through and one that did not are both re-sent, so a slow network can file two transitions.
The comment at `:2637-2644` ends *"Not Ruling 27's scope … it just never caught the rejection at all"* — an author
naming the gap is a record of the gap, not a ruling that it should stay. The controller accepted `exec2-V10` (Create
with no re-entrancy guard) as Critical; this is the same shape one dialog over, with the consequence bounded by the
engine (a repeated same-state move is refused where the workflow declares no self-edge, `3.71`).

**WHAT WOULD HAVE BEEN BETTER.** Wrap `submitTransition` in the same `try`/`catch`/`finally` as `submitTicketEvent`,
feed the dialog's `transportError` prop (it already renders it, `transition-dialog.tsx:491-495`), and disable Move
while in flight.

**MEASUREMENT.** `[SOURCE]` `ticket-sheet.tsx:711-745`, `:1025-1077`, `:2637-2644`; `transition-dialog.tsx:360-379`,
`:515`, `:491-495`. Not driven (§6.1); the reproduction is the E5-13/E5-15 technique: wrap `fetch` to throw on
`POST /v1/events`, press Move, observe the dialog.

**SEVERITY: Important** (claimed). A press that does nothing and says nothing, on the sheet's primary action, beside
three siblings that do it right.

---

### E5-28 — IMPORTANT · A dropped connection during Publish leaves the workflow builder's Publish button disabled for ever with no sentence; a refusal discards the state mapping the person just built `[SOURCE]` (verifies exec 2 §2e's "state-mapping dialog unmounted before the server answers", and goes further)

**WHAT.** `workflow-builder/ui/publish-controls.tsx:64-86` `submitPayload`: `setState({ phase: 'submitting' })`,
then `await env.gateway.submit([event])` — **no `try`/`catch`** (the file's only `try` is around the occupancy READ,
`:95-98`). Both callers discard the promise: `:91` `await submitPayload()` inside `onPublishClick` (itself invoked
as `void onPublishClick()`, `:113`), and `:126` `onConfirm={(mapping) => void submitPayload(mapping)}`. The Publish
button is `disabled={issues.length > 0 || state.phase === 'submitting'}` (`:111`), and nothing but a server answer
ever leaves `submitting`. So a transport failure — the request never reaching the server — leaves the person with a
greyed Publish, no banner (`:129-146` render only `published`/`refused`/`invalid`), and no way back but a reload.
(`submit` is `dataSource.ingest` — `apps/web/src/authoring/data-source-gateway.ts:327` — which throws `HttpError` or
the fetch `TypeError`; and if it ever resolved with a shape the `switch` at `:71-83` does not name, that path also
returns without leaving `submitting`. Either way the phase is stuck.)
Separately, the confirm path sets `submitting` and so unmounts `StateMappingDialog` (`:117`, rendered only while
`phase === 'mapping'`) before the server answers; on `refused` the banner says *"The server refused this publish."*
under an idle Publish button and the mapping the person built is gone — pressing Publish again reopens an EMPTY
mapping dialog.

**WHY.** The builder is the one surface whose whole job is a deliberate, multi-step act (map every dropped state,
confirm), and its final press has neither of the two arms the ticket sheet's `submitTicketEvent` has
(`ticket-sheet.tsx:1040-1074`): no *"did not answer"* and no *"could not reach"*. Ruling 27/33's split is applied
everywhere on the board and the sheet and not here. A refusal that throws away the mapping is a refusal that costs
the person the work the dialog exists to collect.

**WHAT WOULD HAVE BEEN BETTER.** A `catch` that sets a `transport` phase with the sheet's sentence and re-enables
Publish; on `refused`, keep the mapping in state and reopen the dialog pre-filled.

**MEASUREMENT.** `[SOURCE]` `publish-controls.tsx:55-148` opened in full; `grep -n 'catch\|try {'` → the occupancy
read only. Not driven (§6.1; the builder needs a draft to publish, which is a write).

**SEVERITY: Important** (claimed). A stuck control with no sentence, on the surface the manual calls "the one thing
that makes the product yours".

---

### E5-29 — MINOR · The state-mapping dialog says "Publishing cannot see which tickets sit in which state" directly above rows that say "3 tickets sit here today" `[SOURCE]`

**WHAT.** `workflow-builder/ui/state-mapping-dialog.tsx:52-54` body: *"Version N+1 removes states that version N has.
**Publishing cannot see which tickets sit in which state**, so every removed state needs a destination — occupied
or not."* Each row beneath (`:58-62`) prints `countLine(...)` → *"3 tickets sit here today"* / *"1 ticket sits here
today"* (`:10-15`), from `getStateOccupancy`.

**WHY.** The docblock (`:17-33`) is precise: the RULE does not consult occupancy (client replicas are
visibility-scoped, so the two engines would disagree), and the count is *"a courtesy"*. The sentence a person reads
says the product cannot see the thing it prints on the next line. What is true — *"the counts do not decide; every
removed state needs a destination whether or not anything sits in it"* — is what the docblock says and the copy
does not.

**WHAT WOULD HAVE BEEN BETTER.** *"The counts below are for your information only — the rule needs a destination
for every removed state, occupied or not."*

**MEASUREMENT.** `[SOURCE]` lines above opened.

**SEVERITY: Minor** (claimed).

---

### E5-30 — MINOR · The shared read-refusal panel on five routes says "… cannot be shown **yet**", appends the transport's raw string, and names no action; the workflow screens' sibling sentence names one `[SOURCE]`

**WHAT.** `apps/web/src/shell-refusal.tsx` (`ShellRefusal`, the last function in the file): `<p role="status">
<span>{what} cannot be shown yet.</span>{message}</p>`. `message` is the page's `error` string — `LiveQueryResult.error`,
the stringified cause — so a 500 reads *"Your inbox cannot be shown yet. HTTP 500 for /v1/me/notifications"*
(`inbox/page.tsx:446`), *"My Work cannot be shown yet. HTTP 500 for /v1/me/work"* (`my-work/page.tsx:71`), and the
same on `/workspaces` (`:81`), the attention strip (`:65`), the roster (`members/page.tsx:397`) and the workflow
draft (`workflows/[workflowId]/page.tsx:90`).

**WHY.** *"yet"* promises a later; for a 500 or a `MappingError` nothing later is coming, and the component's own
docblock (`:23`) says of the spinner it replaced that *"'the answer is coming'; it is not."* The appended string is
the wire's (`HttpError.message`), not a person's sentence. And the panel names no way forward, where the product's
own sibling arms do: `workflow-list-screen.tsx:200` *"Could not load workflows — reload to try again."*,
`workflow-builder-screen.tsx:89-91` *"… — reload to try again."* `role="status"` (polite) for a read that failed
outright is the UI lane's to weigh; the copy is mine.

**WHAT WOULD HAVE BEEN BETTER.** *"{what} could not be loaded — reload to try again."* with the wire string as a
secondary line, and the 401 arm already routed elsewhere (`expired-session.tsx`) left as is.

**MEASUREMENT.** `[SOURCE]` `shell-refusal.tsx` render opened; the six call sites above (`grep -rn '<ShellRefusal'
apps/web/app` → 6 mounts on 5 routes; the docblock counts the panel's reach as every refusing read); sibling
sentences at `workflow-list-screen.tsx:200`, `workflow-builder-screen.tsx:89-91`.

**SEVERITY: Minor** (claimed).

---

### E5-31 — IMPORTANT · The signed-out app bar offers Workspaces, Account, an Inbox icon and "No workspace selected — pick one…" to a visitor who cannot use any of them, and no Sign in; the legal pages' bar offers Sign in `[BROWSER, devtools isolated context, 390 px]` `[SOURCE]` — FIRST-RUN / PERMISSION-REFUSED

**WHAT.** Signed out on `/help` (the route `app-nav.tsx:330-332` calls *"the route most likely to be wanted by
someone who cannot get in"*), the bar paints: `Workspaces -> /workspaces`, `Help`, `Account -> /account`, an
unlabelled inbox link `-> /inbox`, and the scope note *"No workspace selected — pick one to reach its board, members
and settings."* (`[BROWSER]`, nav links and text). No **Sign in**. `app-nav.tsx:333-342` is the `user === null` arm:
Help + Account, nothing else. The legal bar has the arm the app bar lacks: `legal-nav.tsx:96-99` `user === null ? <Link
className="gn-nav__signin" href="/sign-in">Sign in</Link>`. Pressing **Workspaces** signed out lands on `/sign-in`
by a 401 bounce (`[BROWSER]`: `location.pathname` → `/sign-in`, no `next=`); pressing **Account** paints the page
E5-13's second reproduction describes.

**WHY.** A person who cannot get in reads the help, wants to sign in, and the bar offers them a workspace picker
sentence, an inbox and an account page — every one of which presupposes the session they do not have — while the
one control they need is on `/privacy` and `/terms` only. The `app-nav.tsx` comment says the fallback exists *"so
they fall back to being bar links exactly as they were before Round 24"* — a record of what was kept, not a ruling
on what a signed-out bar should say. The scope note's own rule (`:343-345`) is that it reads `workspaceId` alone so a
slow lookup cannot make it lie; a missing SESSION makes it lie in the same words.

**WHAT WOULD HAVE BEEN BETTER.** The legal bar's arm: `user === null` → Help + **Sign in** (with `next=`), and
withhold the scope note and the inbox icon until there is someone to scope.

**MEASUREMENT.** `[BROWSER]` (devtools MCP, its own Chrome, isolated context `exec5`, `emulate 390x844x3,mobile`):
`/help` nav links and `navText` as quoted; `/workspaces` → `/sign-in`; `/account` as in E5-13. `[SOURCE]`
`app-nav.tsx:312-345`, `legal-nav.tsx:96-105`.

**SEVERITY: Important** (claimed). Every offered control refuses, the needed one is absent, on the one page the
product expects a locked-out person to reach.

---

### E5-32 — IMPORTANT · The help promises a signed-out link to a job "remembers where you were headed"; every data page bounces to `/sign-in` with no `next=`, so the link is dropped — the invite link, the consent page and the settings shell all keep theirs `[BROWSER, devtools isolated context]` `[SOURCE]`

**WHAT.** `docs/manual.md:109-110`: *"The same is true if you click a link (an invitation, or a link to a job) while
signed out: it remembers where you were headed and sends you there afterwards."* Signed out, opening
`/w/0TZSS5W6ATCTF2YBPMWGGP9JF5/p/0XB92YA4CGEBF9S285AH4SDXR1?ticket=0320JX4SK3KBJ616QP82T8WRJ2` — the shape every
notification deep link and every pasted ticket link has — lands on **`/sign-in` with `hasNext: false`** (`[BROWSER]`,
`location.pathname + location.search` → `/sign-in`). The bounce is `expired-session.tsx:70-74`:
`if (expired) router.push('/sign-in');` — no `next`. It is the ONE author of the 401 redirect and is called by
`/workspaces`, `/w/[workspaceId]`, `/w/…/my-work`, `/w/…/p/[projectId]` and `/inbox` (§6.1 grep), so **no data page
keeps the destination**. Four other sites do: `invite/[token]/page.tsx:107` (`/sign-in?next=/invite/<token>`),
`mcp/authorize/page.tsx:143`, `mcp-tokens-screen.tsx:223`, `authoring/builder-wiring.tsx:163` — and the sign-in page
honours `?next=` (`sign-in/page.tsx:58`, constrained to a same-site path).

**WHY.** The sentence is true of the invitation half and false of the job half — the recurring "true of one path,
stated of the product" shape, on the exact case the manual chose as its example. The person who was sent a ticket
link, signed in, and landed on the workspace list has lost the ticket they came for; the mechanism to keep it exists
four files away and the bounce simply does not use it.

**WHAT WOULD HAVE BEEN BETTER.** `router.push('/sign-in?next=' + encodeURIComponent(pathname + search))` in the hook
— the same shape the four sibling sites use — or correct `docs/manual.md:109` to "an invitation".

**MEASUREMENT.** `[BROWSER]` as above (second browser, no session, 390 px). `[SOURCE]` `expired-session.tsx:70-74`;
`docs/manual.md:107-110`; the four `sign-in?next=` sites (`grep -rn 'sign-in?next=' apps/web` → 4, none in the hook);
`sign-in/page.tsx:56-66`.

**SEVERITY: Important** (claimed). The help states a behaviour the product lacks on the most common signed-out entry,
and the person loses the link.

---

### E5-33 — MINOR · Pressing "Send magic link" with nothing typed makes a server round trip and paints the validator's own path — "[body.email] Invalid email address" `[BROWSER, devtools isolated context, 390 px]` `[SOURCE]`

**WHAT.** `/sign-in`, signed out: the email input is `type="email"` with no `required` (`sign-in/page.tsx:356-369`),
the control is a `<Button onClick>` rather than a form submit (`:378-388`), so nothing checks for an empty field
before `authClient.signIn.magicLink({ email: '' })` is sent; the server's `400` message is rendered verbatim by
`fail(linkError.message)` (`:188`, `:384-386`) in the card's `role="alert"` (`:485`). Painted after one press on
an empty field: **`[body.email] Invalid email address`** (`[BROWSER]`, alerts list).

**WHY.** The first sentence a new person can meet from the product is a zod path. The page's own default
(`'Sign-in failed. Try again.'`, `:188`) shows the author expected to write sentences here; the branch that fires
most — an empty or mistyped address — hands the wire's string through untouched.

**WHAT WOULD HAVE BEEN BETTER.** `required` on the input and a `<form onSubmit>` so the browser refuses an empty
press locally; map the validator's message to *"Enter the email address you signed up with."*

**MEASUREMENT.** `[BROWSER]` second browser: `before: {inputType: "email", required: false}`; after clicking
`Send magic link` with the field empty → alert `"[body.email] Invalid email address"` (the request went through
better-auth's own fetch, not `window.fetch`, so the page-level patch saw `reqs: []`). `[SOURCE]` lines above. No
token was minted: the server refused the body before any write.

**SEVERITY: Minor** (claimed).

---

### E5-34 — MINOR · On an archived project's own page, the bar's project item names and links a DIFFERENT project — the docblock that made the item "a function of the ROUTE" is true only for live routes `[SOURCE]` — SOFT-DELETED (project) — extends `exec2-E2-38` with the measurement it lacks

**WHAT.** `apps/web/src/last-project-nav.tsx:114-127`: `routeProjectId` comes from `useParams`;
`useLastProject(workspaceId, routeProjectId, userId)` answers `{status: 'remembered', projectId: routeProjectId}`
whenever the route carries one (`use-last-project.ts:185-187`); then `live = projects.filter(p => !p.archived)`
(`:121`), `rememberedLive = live.find(p => p.id === remembered.projectId) ?? null` (`:122-124`), and
`shown = rememberedLive ?? live[0]` (`:127`). For an archived project's route, `find` misses and the item shows
`live[0]`: the FIRST live project's name, `href` (`:188`), and no `aria-current` (`:234`, `pathname !== projectHref`).
In the dev workspace: on `/w/…/p/01M25DBPXAK3NC9YRVS95MB7J6` (`gggg`, `archived: true` on the wire, §E5-12) the bar
would read **Shop operations**.

**WHY.** The docblock at `:100-113` records why the item reads the route: an earlier version *"named the project you
had left … self-healed one navigation later, which is exactly what would have made it survive a casual look"*, fixed
by *"Taking the id from `useParams` … so the ordering stops mattering."* The live filter re-introduces the same
defect for exactly the population where orientation matters most — a person on a retired project's board — and
`exec2-E2-38` measured that the page itself carries **0** occurrences of `archived`. So on that page nothing says
"archived" and the one orientation control names somewhere else.

**WHAT WOULD HAVE BEEN BETTER.** When `routeProjectId` names an archived project, show it (dimmed, badged, as the
workspace home already draws archived cards) and keep the dropdown live-only; or, at minimum, keep `aria-current`
honest by not substituting.

**MEASUREMENT.** `[SOURCE]` `last-project-nav.tsx:100-127`, `:188`, `:234`; `use-last-project.ts:145-190`. Not driven
(§6.1). The wire fact — one archived project in the dev workspace — is E5-12's `[BROWSER]` `GET /v1/me/workspaces`.

**SEVERITY: Minor** (claimed).

---

### E5-35 — MINOR · No inbox row says WHEN — `createdAt` is on every notification and rendered nowhere — and the two rows that could name their ticket do not: the mention drops a `ticketTitle` it carries, the contested claim has none and prints a rule slug `[SOURCE]` — category 3 (recorded as "render-only", unruled)

**WHAT.** `inbox-view.tsx:66-109`: a row is icon + headline + body + unread dot. `grep -n createdAt inbox-view.tsx
format.ts` → **0** — the wire's `Notification.createdAt` (`domain/notifications.ts:134`, `:146`) reaches no row. The
export's row draws `{{ n.time }}` (`EXPORT:606-637`). Headlines (`format.ts:73-103`): a mention is *"<name> mentioned
you"* with the excerpt as body — `mentionNotificationPayloadSchema` carries `ticketTitle` (`notifications.ts:66`)
and neither headline nor body uses it; a contested claim is *"Your claim was contested — require-comment"* with the
engine's reason as body — the payload (`:77-81`) has `ticketId`, `rule`, `reason` and no title, so the row cannot
name the ticket, and the headline prints the rule's slug (`payload.rule`) where a person reads a sentence — the
same shape as E5-8's `ticket.field_set`.

**WHY.** An inbox is a list of things that happened; without a time a person cannot tell this morning's from last
month's, and the unread dot is the only ordering cue. `docs/design/prototype-delta-2026-09-18.md` (`isInbox`) records
the time and the per-row toggle as *"render-only and S-sized"* and notes *"`n.time` is carried"* — a record, and the
two WIRE gaps in the same entry (filter tabs, bulk mark-read) have since been built (`[BROWSER]` `/inbox` shows
All/Unread/Mentions; `inbox/page.tsx:300` `markAllRead`) while the render-only one was not. The manual
(`docs/manual.md:884-893`) lists the five sentences and none names a time or, for a mention, the ticket.

**WHAT WOULD HAVE BEEN BETTER.** `formatDateTime(notification.createdAt)` on the row (the sheet's one renderer);
the mention body as *"<excerpt>" — on <ticketTitle>*; the rule's human name from the workflow (or the reason alone)
instead of the slug; `ticketTitle` added to the contested payload at the producer.

**MEASUREMENT.** `[SOURCE]` lines above opened; `EXPORT:606-640` opened (`{{ n.time }}`, `{{ n.toggleRead }}`). Not
painted: the owner's inbox is empty (`[BROWSER]` `EMPTY_INBOX_COPY`) and I mint no notifications in their database.

**SEVERITY: Minor** (claimed).

---

## 3. THE PROTOTYPE — classified

Every comparison I made, against `EXPORT` (`Gisik Nokma - Desktop.dc.html`, sha256 `3d142d464a070b33…`), by the
brief's three categories.

| # | surface | export | product | class | where |
|---|---|---|---|---|---|
| 1 | Board card meta (key · subtasks · blocker · source · due, red when late) | `:357-379`, `:2493-2504` | title + `who · when` fold; meta div empty | **3 — no ruling** (WIRE GAP is a record) | E5-2 |
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
| 15 | Invite form Channel | `:753-755` | same three | 1 in the drawing — but the door refuses two of them (`exec6-E6-9`, measured through the route) | E5-11 note |
| 16 | Invite form Project access (named select) | `:765-775` | comma-separated ids text box | **3 — no ruling** | E5-11 |
| 17 | Invite landing (inviter, expiry, tray, Decline/Accept) | `:1761-1789` | one sentence + Join | **3 — recorded, unruled; wire-limited** | E5-18 |
| 18 | `/mcp/authorize` shows code vs product types code | `:1828-1836` | person types the assistant's code; Deny present | 3 by the delta doc; product's direction is the standard device flow — **not filed** | — |
| 19 | Founding lands on the list + toast | `:2741-2752` | `/my-work` | 2 — ruled (`exec2-F5`, controller §4 #4); remedy not yet in tree at `a7b6292b` (`grep -in 'first-run\|new project' my-work.tsx` → 0) — **not filed**, it is F5's remedy | — |
| 20 | Epic band count | `:2904-2927` | counts membership on screen | 2 — ruled (controller §4 #5); the ordered "record the ruling beside `ticket-list.tsx:656-664`" not yet done — **not filed** | — |
| 21 | Inbox row time + per-row read toggle | `:606-640` (`n.time`, `n.toggleRead`) | no time, mark-read on open | **3 — recorded as "render-only", no ruling** | E5-35 |

**Category-3 members, counted: 9** (rows 1, 4, 6, 8, 12, 16, 17, 21 filed; 13 folded). **Category-2 argued: 1** (row 9,
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
| `13.451` | 13 | ✅ | ✅ | ✅ — *"Picking a Collaborator … does not narrow the board … but the scope note names 'collaborator' as not applied"* | E5-5: the case pins the after-the-press disclosure as the property; nothing asks whether the control should be offered |
| `13.468` | 13 | ✅ | ✅ | ✅ | the workflow picker's default; no case pins the New-ticket TYPE default (E5-16) |
| `15.*` (help) | 15 | — | — | ⚠ | `12 cases, 5 planted` per exec 2's recount; the help corpus's Board section (E5-1) is not among the planted defects — `check:help` cannot see it |

**Cases that assert a property the product has quietly stopped having:** none found among those I opened. **Cases that
witness a defect as a property:** `3.72` (E5-7), `11.147` (E5-10) and `13.451` (E5-5) — all true of the code, the first
two pinning behaviour a sibling docblock calls wrong, the third pinning a disclosure the brief's own rule calls late.

**Not verified id by id:** `test-cases/13-*.md` (11 files, ~1.2 MB) — the same boundary exec 2 stated, and I did not
close it.

---

## 5. COUNT BY SEVERITY, MEMBERS NAMED

**35 findings** (`grep -c '^### E5-' docs/lanes/review-ux-exec5.md` → 35). By claimed severity, read from the
heading text: **Critical 1 · Important 22 · Minor 12** (1 + 22 + 12 = 35).

- **Critical (1):** E5-13
- **Important (22):** E5-1, E5-2, E5-3, E5-4, E5-5, E5-6, E5-7, E5-8, E5-9, E5-10, E5-11, E5-15, E5-16, E5-20, E5-21, E5-24, E5-25, E5-26, E5-27, E5-28, E5-31, E5-32
- **Minor (12):** E5-12, E5-14, E5-17, E5-18, E5-19, E5-22, E5-23, E5-29, E5-30, E5-33, E5-34, E5-35

**Browser-measured (`[BROWSER]` in the heading):** E5-1, E5-2, E5-3, E5-4, E5-5, E5-6, E5-7, E5-8, E5-9, E5-11,
E5-12, E5-13, E5-14, E5-15, E5-16, E5-17, E5-20 (pair observed), E5-22, E5-24, E5-31, E5-32, E5-33 = 22 of 35. **Reproduced with an injected failure, zero server writes:** E5-13,
E5-15. **Source-only:** E5-10, E5-18, E5-19, E5-21, E5-23, E5-25, E5-26, E5-27, E5-28, E5-29, E5-30, E5-34, E5-35.

**Verifies an exec 2 §2d/§2e hypothesis with a measurement it lacked:** E5-10 (single-row mark-read), E5-13 (account
sections' failed reads — and further, the overwrite), E5-15 (ticket-types loading forever), E5-20 (stacked dialogs and
Escape — the source mechanism, with the pair observed), E5-27 (Move's missing transport arm and latch), E5-28 (Publish stuck on a dropped connection). **Adjacent to a §2d
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

**The browser stopped being usable at ~10:30 IST.** After the first tab was closed, every new MCP tab opened
`document.visibilityState === "hidden"` behind another window on this box and Chrome deferred hydration indefinitely
(`/v1/` requests: 0 after 57 s; renderer not pegged; `uptime` load 1.40; ~85 MB free). Three fresh tabs, a focus
click and two reloads did not change it, so per the brief's own rule I stopped rather than kept retrying. Everything
after that point is `[SOURCE]`, except as follows. Consequences named where they land: E5-9's second measurement (§
scope note) and the injected-403 refusal walks (below).

**A second browser, for signed-out surfaces only (from ~11:20 IST).** The `chrome-devtools` MCP runs its own Chrome
(no session cookie; I did not sign the owner's account in from it — that would write a session row into their
stack). Its pages are visible and hydrate, and `emulate` gives a true 390×844 mobile viewport. Walked there,
signed out, at 390 px: `/help`, `/account`, `/workspaces` (→ `/sign-in`), `/sign-in`. Findings from it: E5-31, E5-32, E5-33, and
E5-13's second reproduction. **NARROW VIEWPORT is therefore reached for the signed-out shell only**; every
signed-in surface at phone width remains unmeasured by me (exec 4's E4-7/E4-9/E4-11 cover some of it).

**Not walked in the browser:** Backlog, List, Calendar, Timeline tabs (opened the page; did not drive them) ·
`/w/[workspaceId]` home · `/my-work` · `/help` · `/invite/[token]` (no live token) · `/sign-in` (signed in already; did
not sign out of the owner's session) · `/settings` Workflows and Workspace tabs · the workflow builder · the
ticket-type editor · the comment composer (V7 already covers its refusal path) · attachments upload · the subtask chain
end-to-end (no writes) · the delete/undo round trip (no writes) · **NARROW VIEWPORT** — `resize_window` reported success
but the page stayed at 1512 px (macOS full-screen window); the repo's `apps/web/e2e-viewport/responsive.spec.ts`
measures 390/768/1512 and I did not run it; signed-out routes at 390 px were later reached in the second browser (above).

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

1. **`apps/mobile` and `apps/desktop`** — of desktop I read only `app.tsx:14-135` (E5-26); of mobile only
   `screens/ticket-screen.tsx:30-130` (E5-21) and `board-screen.tsx:40-60` (the status wording). The storage layers,
   the help screens, the editor web view and every offline arm are unread.
2. **The workflow builder as a person meets it** (canvas, inspector, history screen) — read its load arms as
   positive controls for E5-15 and `publish-controls.tsx` and `state-mapping-dialog.tsx` in full (E5-28, E5-29).
   `workflow-rebind-dialog.tsx`, the inspectors and the canvas remain unread.
3. **The comment thread, attachments door, subtask chain, close/reopen and delete/undo as END-TO-END FLOWS** — each
   needs a write against the owner's database. I read the code at the seams (E5-7, E5-9) and did not drive them.
4. **Permissions as a member or guest** — I held only the owner's session. Every refusal path was reproduced by
   injecting a failure client-side (E5-13, E5-15) or read from source; none was observed as a real 403/422.
5. **`/help` at paint**, `/sign-in`, `/privacy`, `/terms`, `/my-work` — not opened; `/w/[workspaceId]` home read in source only (`:660-680`, `:860-890`, `:950-1000`).
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

### 6.4a Two mechanical sweeps, with their universes

- **Help absolutes.** `grep -ciE '<absolute-claim pattern>' docs/manual.md` → **61** candidate lines; the same over
  `docs/faq.md` → **37**. Every line was read; the ones not already in `exec2-F1` (a–h), `exec2-F5`, or the manual's
  own honest gaps (due dates, channels, project ids) were checked against code: **E5-1** (`:664`, `faq:307`), **E5-21**
  (`:365-366`), **E5-24** (`:299-300`, `:371`, `:372-373`, `:989-993`, `faq:143-147`). The rest I opened were still
  true (`:225` no cross-project move, `:708` no sort control, `:418` the 200 cap, `:873` the strip's absence,
  `:932`/`faq:634` no email, `faq:519-525` no saved-filters menu — `SavedFiltersMenu` has no mount).
- **Write catches.** `grep -rn 'could not reach the server' packages/app-core/src apps/web/app apps/web/src` →
  **9 product sites in 7 files** (plus one e2e helper string, not a product sentence), all listed in E5-25; each
  opened; all nine paint an `HttpError` 401 as transport.

### 6.4b Hypotheses opened and KILLED by reading — recorded so the judge can see the method, not just the hits

- **"An epic band titled by a ULID under a Filters-sheet narrowing"** — `labels.epicTitle` (`page.tsx:1179-1200`)
  falls back to the raw id unless `activeOnly`; but it reads `list.rows` UNnarrowed on purpose (`:655-666`: *"an epic
  the filter dropped must still name itself above its surviving children"*), and `listNarrowing` (`:667-671`) is a
  separate memo. So a Filters-sheet narrowing keeps the name; only the server-side `activeOnly` read can drop the
  epic, and that arm has its sentence. **Not a finding.**
- **"The Backlog's epic band with the epic row absent reads as a broken list"** (the brief's pointer) — the band is a
  group label (`section.label`), the export does the same (`EXPORT:2896-2928`, and names an absent epic *"An epic
  outside this narrowing"*), and the product names it too on the one path that can lose it. **Matches; not a finding.**
- **"Delete with no confirmation"** (exec 2 §2d) — the export has none either (`EXPORT:3794-3799`, undo toast). **Category 1;
  the finding that survived is the refusal's geometry (E5-9).**
- **"`/mcp/authorize` has no deny path"** (`prototype-delta` entry) — stale: `Deny` is painted (`[BROWSER]`). **Not a
  finding.**
- **The workflow builder's read-only banner and the Workspace settings form's member arm** — both withhold with a
  sentence (`read-only-banner.tsx:35-39`, `workspace-settings-form.tsx:442`). **The pattern done right; not findings.**

### 6.5 Stale figures I was handed, recounted

| claim | measured | command |
|---|---|---|
| *"2601 ids across 25 files"* | **2606** | `node scripts/check-case-ids.mjs` |
| *"`onClick` → `sc-camel-on-click` (160 attributes)"* | not recounted (exec 2 measured 161; I never cited the repo copy) | — |
| my own §5 first count (13/6) | **14/5** | `grep -c '^### E5-'` + the heading text |
| a heading tally through the shell proxy (`grep … \| grep -c IMPORTANT` → 17) | **22** (`awk` over the file: `total=33 critical=1 important=22 minor=10`) | the proxy paginates long `grep` output (`[+8 more]`), so a count piped from it is a count of the first page |

### 6.6 Held for phase 2 (refutations) — noted, not filed

- exec 2's `V8` ("Opening any parent ticket raises a false alert") — I opened a parent-less child only; **not** tested.
- exec 2's `F9` reachability (comment box on a refused post) — not tested.
- exec 2's `V1` (empty board invites a create; no web caller wires `onCreateTicket`) — **checked and it HOLDS**:
  `grep -c onCreateTicket apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx` → 0 at `a7b6292b`, and my painted
  empty columns showed the `+` glyph with *"No tickets in this column."* and no button. Not a refutation.
- exec 4's `E4-23` (a `404` ticket opens a sheet stuck on "Loading…") — **checked and it HOLDS**, and it is in MY edge
  classes (SOFT-DELETED, ERROR): `online/http.ts` resolves a READ's 404 to `null`, `online-data-source.ts:271-274`
  `getTicket` returns `null`, and `ticket-sheet.tsx:626-631` renders `Loading…` whenever `read.data === null &&
  read.error === null`. So a deep link to a soft-deleted ticket (after the 15-s undo lapses) or to one the viewer may
  not see is a spinner that never stops. **I missed it and learned of it from exec 4's pushed report; I am not filing
  it**, on the same rule exec 2 applied to my E5-8 — filing after reading cannot be separated from copying.
- Round-2 siblings noted for the judge, all concurrent and independently measured on both sides: E4-1/E5-3 (epic crumb),
  E4-18/E5-4 (blank option), E4-19/E5-8 (history slug), E6-1/E5-24c (help says cannot delete), E2-20/E5-15,
  E2-22/E5-28, E2-23·E2-24/E5-13 (theirs: refused save + failed revert; mine: failed read → guessed PUT, captured),
  E2-26/E5-10, E2-29/E5-27, E2-34/E5-20, E2-40/E5-7 (theirs `require-field`, mine `require-comment`), E2-42/E5-21.
- exec 6's `E6-9` (the invite door refuses `sms`/`whatsapp`, accepts `phone`) — measured through the real door; it
  is the finding under the Channel control I recorded as "matches the export, not scored" (E5-11 note). **A match
  with the drawing is not a defence when the door disagrees** — noted against my own §3 row 15.
- **exec 2's round-2 claims opened against source, each holding:** `E2-24` (refused save + failed revert: `account/page.tsx:223-229`),
  `E2-27` (`syncStatusLabel` answers `Live` for any unrecognised status — `sync/sync-status-bar.tsx`, `status: string`,
  final `return`), `E2-32` (the Move dialog resets evidence on close, `transition-dialog.tsx:352-358`, and never
  `comment`: `grep -c "setComment('')"` → 0), `E2-35` (delete asks nothing: `ticket-sheet.tsx:2612-2621`), `E2-37`
  (`new-ticket-dialog.tsx` has zero `useEffect` and no `setTitle('')`), `E2-38` (`page.tsx` has 0 occurrences of
  `archived` — and E5-34 is what the bar does on that page), `E2-39` (`workflow-builder-screen.tsx:72`
  `listMembers().catch(() => [])`), `E2-40` (`rule-engine/src/rules/require-field.ts:9` reads `input.ticket.fields[rule.field]`, never the payload — opened). **No
  falsifying measurement found in any of them.**
- Nothing I measured contradicts a landed exec 2 finding. **I have no refutation to file at this time**; if I find one
  in the remaining window it goes to `docs/lanes/review-refutations-exec5.md`.

---

*executor 5 — UX (Opus). **Report complete for phase 1 at the time of the last push** (see `git log
origin/exec5/review-ux`). 35 findings — Critical 1 · Important 22 · Minor 12 — members named in §5. No PR opened, no
file changed except this report. No AskUserQuestion, no Workflow, no subagent used.*
