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

(filled in as measured — see §5 for the count with members named)

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
