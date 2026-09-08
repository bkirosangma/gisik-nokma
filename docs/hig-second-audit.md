# Second reconciliation audit — the interactive prototype's new features against the code

*2026-09-09. Read-only, docs-only. Part A of
`gisik-nokma-lanes/CTL-DISPATCH-2026-09-09-second-audit-neo.md`. Produced before any neo restyle, for
the reason the first audit came before the HIG one: **so nothing the product already does is deleted to
match a picture.***

The first audit (`docs/hig-reconciliation-audit.md`, #355) classified 23 static prototypes. The owner's
design session has since grown an interactive prototype carrying features that set was never audited
against, and the owner has now chosen its `neo` style for the whole product. This document classifies
that new material against the **code**. **Part B — the neo token extraction — waits for the exported
files to reach `design-system/`** (`git log -- design-system/`); it is not in this document.

## How to read this

Columns as in the first audit: **S** styling only (adopt) · **I** invented, does not exist (do not
build) · **D** dropped — exists in the product, absent from the prototype (**keep and restyle, never
delete**) · **C** copy divergence (flag to the owner; shipped copy is never silently reworded).

Verdicts are **exists / partial / absent** against the code — not against plans, the test-case
catalogue, or the prototype, all of which run ahead of and behind the code in both directions.

## THE HEADLINE — it inverts what the dispatch expected

**Four of the six "new features" are substantially already built.** The List view ships its header,
Group by, Columns picker and collapsible hierarchy. Subtasks are already real tickets. Projects already
carry several workflows at once. The calendar already exists and is mounted on web.

**What is genuinely absent is narrower than it looks:** a board workflow *picker*, breadcrumbs, the
full-screen toggle, a week view, and any of it on mobile.

### The two rows that would do damage if applied literally

**1. The board (#2) — the prototype's model is not the product's.** The prototype lets you *choose* one
workflow and the columns follow. The product renders **one group per workflow at once**, deliberately
(`board.tsx:39`, *"a project mixing workflows gets one group per workflow, because merging..."*).
Worse, a picker cannot be bolted on: workflow binding is **per ticket-TYPE** — `proj_projects` has no
workflow column at all, `proj_ticket_types.workflow_id` is `NOT NULL`, and a ticket is stamped with its
type's workflow at creation. And **the selection has nowhere to go**: `getBoard(projectId)` takes no
workflow argument and the board route declares only `{ Params: { projectId: string } }`. **This is a
data-model and API change wearing a restyle's clothes.**

**2. Breadcrumbs (#4) would delete a permission state.** The ticket surface renders exactly one
ancestry level, in **three self-describing branches** (`ticket-sheet.tsx:334-343`): `At project root`
· `Restricted parent — exists, but you can't see it` · the parent's title. The comment above it says
why: *"A RESTRICTED parent is existence-without-title... rendering it as 'At project root' would turn a
restriction into a vanish (invariant 5)."* **A navigable Workspace › Project › Sprint › Epic › Parent
trail built naively drops the restricted branch and converts a permission boundary into a silent
absence.** Keep the three-state treatment; the trail must degrade to it.

## Part A — the six feature groups

| # | feature | verdict | the sentence that matters |
|---|---|---|---|
| 1 | List view | **exists** (4 of 6 sub-items; 2 partial) | header, hierarchy, progress and claim-attribution ship; Group by and Columns are each missing the **workflow** axis |
| 2 | Workflow selector on board | **partial — different model** | projects carry many workflows and the board groups per workflow; no picker, and a choice cannot reach the server |
| 3 | Subtasks as real tickets | **exists** (3 of 4; 1 partial) | `sub-task` is a builtin ticket type at `DEEPEST_RANK`; only the *"Subtask of…"* wording is missing |
| 4 | Breadcrumbs | **absent** | one non-navigable ancestry level exists, in three honest branches — see the damage note above |
| 5 | Full-screen ticket | **absent** | `SheetProps` is `{ open, title, onClose, children }`; there is no slot for a toggle |
| 6 | Mobile calendar | **absent on mobile; month grid exists on web** | a **port plus a build**, not a from-scratch calendar |

### 1. List view — EXISTS, with two partials that share one root cause

`packages/app-core/src/views/ticket-list.tsx`, `list-model.ts`, `view-types.ts`.

* **(a) header "N tickets · N done" — exists.** `:166` `` `${counts.total} tickets · ${counts.terminal} done` ``.
  **D-row:** when the page's `activeOnly` filter is on, the header deliberately swaps to
  `` `${counts.total} matching` `` and **drops the done half** (`:167`), because a narrowed list is
  *"structurally always `0 done`. A number that can only ever say zero is"* misleading (`:157-161`).
  The prototype does not show this. Keep it.
* **(b) Group by — partial.** Five of six axes ship: `GROUPING_OPTIONS` at `:31` is
  `['epic', 'status', 'assignee', 'type', 'flat']` (`flat` is the prototype's "nothing").
  **`workflow` is absent** — from the `Grouping` union (`view-types.ts:83`), from the options array,
  and from the server's `groupCards`.
  **Gap:** *add a `workflow` grouping axis — which requires carrying `workflowId`/`workflowName` onto
  `ListRow` first, because the server's `ListCard` has it (its `status` case keys on
  `` `${card.workflowId}:${card.stateId}` ``) and drops it before the client row is built.*
  **C-row:** options render the raw union member as the label, so the user sees `epic` and `flat`
  rather than `Epic` and `nothing`.
* **(c) Columns picker — partial.** Real (`<details>/<summary>Columns</summary>` at `:206`, a checkbox
  per column), offering five of the prototype's eight: `AVAILABLE_COLUMNS` at `:32` is
  `['status', 'assignee', 'dueDate', 'type', 'progress']`.
  **`Priority` does not exist anywhere in the repo's source** (0 hits against a 55-line positive
  control on the same path) — it is an **I-row: do not build it as a column, it is a field the product
  does not have.** `Workflow` has no column id for the same reason as (b). There is no `Ticket`
  column: the Title column is fixed, prepended outside the `columns` map, and absent from the picker.
  **Gap:** *`ListColumnId` already admits `` `field:${string}` `` and both `columnLabel` and `ListCell`
  render it, but `AVAILABLE_COLUMNS` lists no `field:` entry — so custom-field columns are unreachable
  from the picker although the render path exists.*
  Note `DEFAULT_LIST_COLUMNS` omits `type`, so Type is offered but off by default.
* **(d) hierarchy with carets and per-depth indentation — exists.** `:313`
  `` style={{ paddingLeft: `${node.depth * 1.1}rem` }} ``, `:322` `▸`/`▾`, `:315` caret only when
  `node.hasChildren`. Nesting is **generic `parentId` depth-first, not a fixed three-tier ladder**, so
  epic → ticket → subtask is one instance of arbitrary depth. `list-model.ts:128` `nestRows`, `:158`
  `visibleNodes(nodes, collapsed)`.
* **(e) Progress "2 of 4 done" — exists.** `rollup-text.ts:17`
  `` `${rollup.terminalChildren} of ${rollup.totalChildren} done` ``, with a ` · N restricted` suffix
  when children are hidden from the viewer (`:18`) — **another honesty affordance the prototype omits.**
  **Caveat:** live on the online path; the **replica (offline) source hard-codes `rollup: null`**, so
  progress does not render offline.
* **(f) claim-provenance suffix on dates — exists.** `:378-379` renders
  `{formatDate(...)} — {actorLabel(...)}` then the literal `'s claim`, implementing the comment at
  `:371` (*"A date is a CLAIM and renders attributed"*). **C-row:** `formatDate` yields a full IST day
  (`30 Aug 2026`), not the prototype's weekday abbreviation (`Due Thu`).

**D-row for the whole view:** the server persists `listColumns` and `grouping` as two records keyed by
project (`ticket-list.tsx:433`), and `:441` names the half-set hazard — a project present in one record
and absent from the other. A restyle must not drop the persistence.

### 2. Workflow selector on the board — PARTIAL, and the model differs

* **(a) a project holding tickets on different workflows — exists**, but the binding is **per
  ticket-TYPE**: `migrations/1787961500000_proj-projects.sql` has no workflow column;
  `1787961700000_proj-ticket-types.sql:51` `workflow_id text NOT NULL`. Three ticket types on three
  workflows ⇒ three groups.
* **(b) a board-level picker — absent.** `BoardProps` (`board.tsx:9`) is `{ board, onOpenTicket }`;
  the sole mount is `<Board board={board.data} onOpenTicket={openTicket} />`
  (`p/[projectId]/page.tsx:609`). The only workflow-choosing UI in the product is the **ticket-type
  editor** in workspace settings (`<select aria-label="Workflow">`), which binds a workflow to a
  *type* — a different act.
* **(c) columns derive from the chosen workflow — partial.** They derive from workflow
  **definitions** — `def.states` → one column per state in the definition's own order, on both paths
  (`routes/board.ts:116`, `replica-data-source.ts:920`) — and the column set is a pure function of the
  distinct workflow ids on the viewer-visible rows. **There is no plumbing for a choice.**
* **(d) per-workflow counts in the picker — absent.** `BoardGroup` (`view-types.ts:60`) carries
  `workflowId`, `workflowVersion`, `workflowName` and **no count**; the only count on the board is
  per column (`column.cards.length`).

**Gap:** *narrow the existing per-workflow groups to one via a board-level filter — requiring a
workflow argument on `getBoard` and the board route, a group-level count on `BoardGroup`, and a
decision on the leak below — without removing the multi-group rendering that ships today.*

**A picker is a permissions question, not a style choice.** `board.tsx:61-64` records a deliberate
refusal: the empty copy says *"no tickets", NOT "no columns" and not "no workflow"*, because naming
workflows *"whose workflows this viewer may not read — inventing them would leak a"* permission. **A
picker that lists every workflow with counts is exactly that leak.** Route it to the owner before it
is designed.

### 3. Subtasks as real tickets — EXISTS

* **(a) first-class tickets — exists, and more strongly than a bespoke model would give.** There is no
  subtask entity: a sub-task is an ordinary ticket whose **type** sits at rank 4.
  `packages/domain/src/ticket-types.ts:76` `{ id: SUB_TASK_TYPE_ID, name: 'Sub-task', icon: 'list', rank: 4 }`;
  `:70` `DEEPEST_RANK = 4`. Everything a ticket has, a sub-task has, *because it is one*.
* **(b) open as tickets — exists.** `openTicket(ticketId)` is passed to list, board and attention
  strip and **nothing branches on type**; `ticket-list.tsx:327` opens from inside the indented tree.
* **(c) a "Subtask of…" chip — partial, and the gap is one word.** The parent block
  (`ticket-sheet.tsx:334`) is live with all three branches, but the visible-parent branch is a bare
  `<span>{ticketRead.parent.title}</span>` (`:342`) **with no relation label** — unlike its
  self-describing siblings. A controlled grep over all `.tsx` found no occurrence of *"subtask of"*,
  *"sub-task of"* or *"parent of"*.
  **Gap:** *label the visible-parent branch so the title is identifiable as the parent, matching the
  self-describing style of the other two branches.*
* **(d) created as tickets — exists.** `new-ticket-dialog.tsx:4`
  `NewTicketDraft = { title, typeId, parentId }`, with a Type picker and a Parent picker; the type
  roster is passed **unfiltered** (no rank exclusion), and the draft becomes a real `ticket.created`
  event.

**Spelling note that explains the search:** product code spells it `sub-task`; the five files matching
`subtask` are test fixtures and tests, none of them product UI.

**Mobile gap:** `apps/mobile` has **no subtask or parent surface at all** — `ticket-screen.tsx` renders
title, comments and contests only; no type, no parent, no children, no creation flow.

### 4. Breadcrumbs — ABSENT (see the damage note in the headline)

`breadcrumb` occurs exactly twice in source, both **prose in comments about something else**
(`routes/tickets.ts:197`; `domain/src/events/ticket-events.ts:19`) — never a component, element, class,
route or prop. No ancestor-chain builder exists. The one level that renders
(`ticket-sheet.tsx:334-343`) has no `href`, no `onClick`, no router push — **display only**, verified
by hand.

`packages/app-core/src/hierarchy/epic-ancestor.ts:44` `epicAncestorOf` is a real, cycle-safe ancestor
walk (used by calendar, timeline, list and replica) that **deliberately answers null rather than
guessing** — the foundation a trail would build on.

### 5. Full-screen ticket — ABSENT

`fullScreen` has zero hits in any hand-written `.ts`/`.tsx` across `packages/*/src`, `apps/*/src` and
`apps/web/app`; the single file-level match is `apps/mobile/src/editor/editor-html.generated.ts`, a
generated one-line bundle. No `860` cap in the stylesheets.

The sheet header (`packages/ui/src/components/sheet.tsx:26-28`) is exactly a title and a close button,
and `SheetProps` (`:3`) is `{ open, title, onClose, children }` — **no slot for a toggle**.
`ticket-sheet.tsx`'s complete local state is `tab`, `moveOpen`, `serverRefusal` (`:170-172`) —
**nothing tracks a presentation mode** — and its sole render path is `<Sheet open ...>` with `open`
hard-coded true (`:315`), with no alternate branch in 470+ lines.

### 6. Mobile calendar — ABSENT on mobile; the month grid exists on web

* **(a) Week view — absent everywhere**, mobile *and* web. `calendar-view.tsx`'s entire view state is
  `month`, `expandedWeeks`, `hiddenFields` (`:192-200`); there is no week/month mode.
* **(b) Month view — partial.** A month calendar is real, tested and mounted on web
  (`p/[projectId]/page.tsx:548`, behind the Calendar tab at `:525-528`). But **none of the prototype's
  cell UI exists**: a day cell renders only the day number (`calendar-view.tsx:335`
  `{Number(day.slice(8))}`) — no ticket name, no per-cell count. The `+N` that exists is a
  **per-week-row fold** over the whole row (`:387` `+{folded} more`, `MAX_VISIBLE_PER_WEEK = 4` at
  `:91`), not a per-cell first-ticket summary. There is no day-selection state and no selected-day
  list below the grid.
* **Nothing under `apps/mobile` mounts `CalendarView`**; the navigator registers exactly Board, Help
  and Ticket (`app.tsx:65, :89, :90`). The two `calendar` tokens under `apps/mobile/` are a prose
  comment (`ticket-screen.tsx:112`) and the generated editor bundle.

**Gap:** *port the existing month grid to a mobile screen AND build the cell summary, the day-selection
state and the selected-day list, none of which exist on either platform.*

## The first audit's I-rows, re-verified against today's code

Verified by hand plus an independent reader, each with a positive and a negative control through its
own path (`zzqqxxNotARealToken` → exit 1, against working controls at exit 0).

**All eight are still absent. All eight stay invented; none may be built as part of a restyle.**

But "absent" hides a cost gradient that decides how expensive each one is if the owner ever does scope
it, and the gradient is the useful part:

| I-row | today | what kind of absence |
|---|---|---|
| member counts | **still absent** | **data absence at every layer** — `WorkspaceRef` is `{ id, name, projects }` (`view-types.ts:5`); no count in the type, the mapper, or the server route |
| "One invitation is waiting" banner | **still absent** | **data and surface absence** — `Decline` occurs nowhere in the five searched directories |
| active/blocked chips | **still absent here** | **primitive exists and is live elsewhere** — `Chip` renders on the board with `blocked`, `pending` and `active` tones (`board.tsx:99, :158, :160`); it is simply not on the workspace card |
| initials tiles / avatars | **still absent here** | **primitive exists** — `packages/ui/src/components/avatar.tsx:12` with `gn-avatar` styles; `board.tsx:2` already imports `Avatar` |
| role labels | **still absent** | **the data EXISTS** — the server carries the caller's role on `/v1/me/workspaces`; only the display is missing, so this is the cheapest of the eight and the one most likely to be mistaken for free |
| Help / Account in nav | **still absent** | `app-nav.tsx` renders `Workspaces` (`:16`), conditional `My Work` (`:17`), `InboxNavLink` (`:24`), a spacer, `ThemeToggle` (`:26`), and a conditional `Sign out {user.name}` Button — and nothing else |
| avatar in the nav | **still absent** | the nav ends in a plain text Button; `gn-avatar` appears only in `packages/ui` |
| C-row subtitle "…workspaces you belong to." | **still not adopted** | 0 matches on the page. The only `you belong` hits are `help/content.generated.ts:890, :925` — **generated help prose describing the page, not copy the page renders** |

Two cautions for whoever acts on this table:

* **"The primitive exists" is not "the feature is cheap."** A chip on a workspace card still needs a
  count or a state to display, and rows 1 and 2 show that data does not exist. The primitive removes
  the *rendering* cost, not the *data* cost.
* **`apps/web/app/account` does not exist**, consistent with HIG Task 12 being unstarted — so "Account
  in the nav" is not merely unstyled, it has no destination to link to.

## One contradiction found in passing, for the controller

`ticket-sheet.tsx:141` and `online-data-source.ts:89` disagree about whether `getTicket` answers
against the real server: one docblock says it refuses today, the other says it answers now. The tie was
broken by reading both implementations. **One of the two comments is stale; a reader trusting the wrong
one draws the wrong conclusion about the ticket surface.** Not fixed here — this audit is read-only.

## Method, and the searches that lied

Six parallel readers plus my own independent pass over every group. **Agent output is a claim, not
evidence** (the first audit's rule), so every load-bearing verdict above was re-read in source by hand;
the ancestry block, the parent span's lack of a link, and all eight I-rows were verified directly.

Every category carried a **positive control** (a term expected present) and a **negative control** (one
expected absent) through the **same search path**, because an "absent" from a broken search is
indistinguishable from a real absence. **Three searches failed exactly that way while this audit was
being written, and all three would have produced confident, wrong answers:**

* `git grep -n "subtask"` returned **nothing** — the code spells it `SUBTASK` / `Sub-task` /
  `sub-task`. A case-sensitive search would have reported the feature absent when it ships.
* A search for the 860px cap on the bare token `860` matched **Cargo.lock checksums**, and had to be
  rescoped to the stylesheets.
* Group 2's reader disclosed that its **first** picker search "returned a void 0 hits through a
  nonexistent path that rtk reported as `exit=1` with empty stderr"; re-run correctly it returned 7
  real hits. **A tool reporting a clean failure for a path that does not exist is the most dangerous
  of the three, because nothing about the output says so.**

* And one failure in the **opposite** direction, which matters because the other three would have said
  "absent" and this one would have said "exists": a first pass for `priority` **without**
  `--exclude='*.generated.ts'` returned 745 KB of noise from
  `apps/mobile/src/editor/editor-html.generated.ts` — a minified React bundle that happens to contain
  the word. **A generated artifact will confirm almost any feature you go looking for.** Every search
  reported here excludes it; the `Priority` verdict rests on 0 source hits against a 55-line positive
  control on the same path.

That is the whole argument for the control rule, and it is why the rule is now standing. Three of the
four failures produce a confident *absent*; the fourth produces a confident *exists*. **Neither
direction announces itself**, which is why the control has to run on the same path as the measurement
rather than being reasoned about afterwards.
