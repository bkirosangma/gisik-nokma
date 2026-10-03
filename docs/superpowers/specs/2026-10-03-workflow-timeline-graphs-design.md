# Workflow and Timeline graphs (spec 2 of the Drafts / Graphs / MCP-sweep-2 series) — design

**Date:** 2026-10-03.

**Base:** `origin/release/knowledge-graph` @ `4cc486ca`, where the code below was read. Spec A's link events were read on `origin/task/kg-a-t1-events` @ `aa4f1d05` (not landed). Paths are relative to the repo root; `path:line` cites were read.

**Target branch:** a NEW release branch, cut after the Knowledge Graph release ships (owner: "a NEW release after the Knowledge Graph release"). One release branch at a time, so this spec lands as a doc in `release/knowledge-graph`, and implementation waits.

**Status:** the owner approved the design and the mockups ("looks good", 2026-10-03). This file is the written spec for review. Open questions are in §20.

**Series:**

| Spec | Subject | File | Depends on |
|---|---|---|---|
| 1 | Drafts (private tickets, keys on publish) | `2026-10-03-drafts-design.md` | — |
| 2 (this) | Workflow and Timeline graphs | `2026-10-03-workflow-timeline-graphs-design.md` | spec A (links), spec C (scope, motion code), spec E (Home), spec 1 (Parts 3–5 only) |
| 3 | MCP sweep 2 | (its own file) | — |

**Ship order inside this spec** (each Part has its own requirement-id prefixes and its own case sub-block; the plan schedules them in this order):

| Part | Subject | Needs Drafts? | Needs `leads_to`? |
|---|---|---|---|
| 1 | The shared viewport engine, row packing, and the EXISTING Timeline view made continuous | no | no |
| 2 | The model: `leads_to`, Decision, Estimate, actual dates, auto-promotion | no (publish trigger only) | defines it |
| 3 | The Workflow graph, the Graph tab, creating draft steps, Publish flow | yes | yes |
| 4 | The Timeline graph and Home's Timeline | yes | yes |
| 5 | MCP | yes | yes |

**One plan per Part,** the way specs A–E each have their own plan (`docs/superpowers/plans/2026-10-03-<part>.md`); the Parts are too large for one task list.

**Part 1 can ship alone and first.** It changes no event, no projection, no MCP tool and needs neither Drafts nor `leads_to`.

**Owner's words and rulings (2026-10-03, verbatim where quoted):**
- The Workflow graph is a flowchart of the connections between tickets, not the lifecycle workflow in Settings. It looks like the Zapier-style example: boxes, decision diamonds with Yes/No-style branches, loops.
- Decisions are a **Decision ticket type**, drawn as diamonds, with outcome-labelled branches.
- Arrows are a new link kind **"leads to"**, labelled (the outcome label lives on the link), loops allowed. Existing `blocks` links are shown in a fainter style.
- **Auto-promotion:** a ticket in Backlog moves to To-do automatically when its condition is met. Default: ANY incoming "leads to" arrow is satisfied (its source closed; for a Decision source, only the branch whose label was chosen). Per-ticket switch "wait for all". The move is attributed (system/rule) and visible in History.
- Opened from a ticket, the Workflow graph shows THAT ticket's flow. Start and End pills are automatic.
- Tickets can be created in both graphs ("+" handle after a node; a form) as drafts (spec 1), with "Publish flow".
- **Timeline graph** = the workflow graph laid on a time axis. Planned dates: Start/Due plus an Estimate, chained along the flow; explicit dates win over chained ones. Actual start and end are auto-filled when the ticket becomes active / closes. ONE graph that transforms live; the planned data is kept; a **Planned vs actual** toggle (off by default, can be turned on any time) compares them. Undated tickets sit in a tray. A today line.
- Planning flow: workflow first, then the timeline consolidates.
- The ticket sheet's tabs are Details, History, Attachments, **Graph**; inside Graph a segmented switch **Knowledge | Workflow | Timeline**. The sheet widens to **1240 px** on the Graph tab. NO "Start" button in the sheet header.
- **Home** also gets the Timeline graph, scoped to selected workspaces and projects ("overview of my work across everything"), with a **Knowledge | Timeline** switch.
- Landscape: left to right. Portrait (phones): top to bottom.
- Rule D2: every MCP write is visible in the app, attributed, and removable by a member.
- **Smooth scrolling:** "The timeline graphs, especially the one in the home page, needs smooth scrolling. not a page by page scrolling."
- **The existing Timeline view too:** "make the existing timeline view smooth too."
- **Row packing:** "no ticket per row. and the ticket key is labeled on each block. the next can stand side by side. if they happen on the same day then put it on a row below. sort of optimise towards the smallest number of rows."
- **Preloading:** "for the continuous timeline, make use of preloading for a smoother experience."

**Decisions taken in this spec** (not stated by the owner; correct them at review):
1. **Satisfied means terminal.** A source is satisfied when its state category is `terminal` (done), not when its explicit `closed` flag is set. The flag is set by a person or by the auto-close sweep days later (`apps/server/src/auto-close/sweep.ts:9-12`), which would stall every flow. A closed ticket is always terminal (`packages/rule-engine/src/checks/close.ts:60`), so "closed" is covered.
2. **Estimate is whole calendar days** (1–365), not working days.
3. **A Decision cannot enter a terminal state with branches and no chosen outcome** (DC-5). Cheap to flip (open question 2).
4. **A loop back to a finished ticket does not reopen it.** Promotion moves only tickets that are in Backlog.
5. **Home's Timeline defaults to "Mine"** (the viewer's assigned and collaborating tickets), with an "Everyone" option. The Home mockup's comment reads "Ama's tickets in the two picked projects".
6. **Relabelling a link is remove + add in one batch**, not a new event.
7. **Drafts show "Draft" where a key would be.** The mockups draw keys on drafts (`GN-148` with a dashed border); the owner's ruling is "keys only when publish", so the build follows the ruling, not the mockup.
8. **The tab is already "Graph".** Owner ruling 2026-10-03 ~14:26 (KG C T9): the Knowledge Graph release ships the fourth tab as "Graph" with a segmented switch whose only option is "Knowledge"; this release adds "Workflow" and "Timeline" to that switch. No rename.
9. **The key label outside a short bar counts as footprint** (PK-4), at a bucketed scale; the alternative, a separate label track below each lane, avoids the zoom dependence at the cost of height.
10. **Home's Timeline on a phone** is portrait with one lane per project as columns (HM-6); the mockups do not draw it.
11. **`relates` and `duplicates` are not drawn** on these graphs (FL-1); the Knowledge Graph shows them.
12. **Retiring cases 11.74, 11.79, 11.82, the second half of 11.75, 20.271's Earlier/Later half** and the 13-board-prototype-port pins (TV-1) is part of the work; they are marked 🚫 with the reason and never renumbered.
13. **The mockups draw keys on drafts** (`GN-148`, `GN-149`, `GN-152`); decision 7 follows the ruling, so the mockups should be corrected before they are the visual bar.

> **Planner reconciliation (2026-10-03), drafts Q4 ↔ graphs D-3 / open question 7:** a link that touches a draft lives on the DRAFT's stream while the draft exists (the structural fix, not a per-viewer filter). Spec A's `ticket.link_added` gains an optional, additive direction member (`from`) so the draft can carry an outgoing OR incoming link; the published ticket's stream gets nothing until publish. At publish the link is re-filed on its source's stream inside the same atomic publish (drafts §7.4). This lands in the Drafts plan as an additive payload change; spec A's T1 (`origin/task/kg-a-t1-events`) is not reopened. Atomic publish (`ingestAtomic`, drafts Q13) is accepted by the planner as the only way to meet D-4.

## 1. What exists today

**Links.** Spec A's three kinds (`blocks`, `relates`, `duplicates`) and the pair `ticket.link_added` / `ticket.link_removed {kind, targetId}`, filed on the SOURCE ticket's stream (`packages/domain/src/events/ticket-events.ts:209-229` on `origin/task/kg-a-t1-events`; the design is `docs/superpowers/specs/2026-10-03-typed-links-design.md` §2.2). Both payloads are `.strict()`. `linkReading(kind, direction)` is the one sentence table (`READINGS`, same file). The fold is `TicketState.links` (`packages/domain/src/ticket-state.ts:463-474`). The projection table is spec A's `proj_ticket_links` with `CHECK (kind IN ('blocks','relates','duplicates'))` (typed-links design §2.5).

**Ticket types.** A type is `{id, name, icon, rank, workflowId, fields}` (`packages/domain/src/ticket-types.ts:97-121`). The four built-ins are seeds, `epic` 1, `story` 2, `task` 3, `sub-task` 4 (`ticket-types.ts:142-147`). A workspace materialises them as `ticket-type.defined` events at founding (`apps/server/src/workspaces/bootstrap-workspace.ts:87`), so a new seed reaches only workspaces founded after it. A built-in's rank is locked (`type.builtin-rank`, `packages/rule-engine/src/checks/ticket-type.ts:84-94`). A child's type must outrank its parent's (`hierarchy.rank`, `checks/hierarchy.ts:165-166`); a type at rank 4 or deeper requires a parent (`DEEPEST_RANK`, `ticket-types.ts:140`). Several readers consume the seeds: `apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx:175`, `packages/app-core/src/hierarchy/epic-ancestor.ts:19`, `apps/server/src/read/ancestry.ts:45`, and the type editor (`ticket-type-editor-screen.tsx:298`) and list screen (`ticket-type-list-screen.tsx:262`).

**Built-in fields.** `BUILTIN_FIELD_IDS = ['title','description','dueDate','startDate','priority']` (`ticket-types.ts:8`). A type whose custom field id shadows one fails `ticketTypeDefSchema` (`ticket-types.ts:113-118`), and that schema is parsed on READ (`ticket-types.ts:33-40`). MCP `define_ticket_type` takes caller-chosen field ids (`packages/mcp-server/src/tools/definition-admin-tools.ts:103-119`); the app mints ULIDs (`fields-editor.tsx:165`). Day claims are `{date, note?}` in the IST day shape (`dueDateValueSchema`, `ticket-types.ts:183-192`) and ride `ticket.field_set` or `ticket.created`'s `startDate` / `dueDate` (`ticket-events.ts:150-151`). The require-field picker pins its set difference against `BUILTIN_FIELD_IDS` (case 3.972, `packages/app-core/src/workflow-builder/fields.ts:29-31`).

**Status categories, Backlog, Start.**
- Categories are `open | active | terminal` (`packages/domain/src/workflow.ts:4`).
- Backlog is a universal state, `BACKLOG_STATE_ID = 'backlog'`, category `open`, in no workflow's `states` (`workflow.ts:72-73`).
- The universal **Start** edge is `backlog → def.initialStateId` with `rules: []` for EVERY workflow, and "a workflow cannot gate its own Start edge" (`workflow.ts:81-93`). From Backlog the engine reads only the universal edges (`packages/rule-engine/src/transition.ts:117-122`). So Backlog → the workflow's first state is always legal, whatever a custom workflow declares or names. The simple-kanban template's initial state is `todo` / "To do" (`packages/domain/src/simple-kanban.ts:20-27`); a custom workflow's initial state may carry any name.
- `validateWorkflowDef` requires the initial state to be creatable (`creatable !== false`, `validate-workflow.ts:95-100`) but does not forbid a terminal category on it (§20, question 8).

**Attributed system writes.** A reserved ULID actor files the event (`packages/domain/src/system-actors.ts:40-69`: `SYSTEM_ACTOR_AUTO_CLOSE`, `SYSTEM_ACTOR_PURGE`, `SYSTEM_ACTOR_NAMES`, `isSystemActor`); the id must match `ULID_REGEX` (`packages/domain/src/ids.ts:9`, `[0-7][0-9A-HJKMNP-TV-Z]{25}`). The sweep submits through `ingestBatch`, the internal door with no permission gate but with the engine (`apps/server/src/auto-close/sweep.ts:33-41`, `:224-244`), counts a refused submission rather than erroring (`:245-258`), and runs in the backup daemon (`apps/server/src/ops/backup-daemon-main.ts:279`). Post-commit reactions use `ingest.onEventCommitted` (`apps/server/src/ingest/ingest-service.ts:52`, `:152-163`; registered at `apps/server/src/app.ts:1134-1139`). A transition may carry `cause`, today only `{kind:'reopened-for-child', childTicketId}` (`workflow.ts:200-208`); its consumers are `packages/app-core/src/view-types.ts`, `replica/replica-data-source.ts`, `online/mappers.ts`, `offline/reopen-pair.ts`, `flows/guarded-child-event.ts`, and `packages/domain/src/read-models.ts`. History narrates a transition as "Moved to <state>" (`packages/app-core/src/views/history-copy.ts:142-145`). The notification fan-out acts on `ticket.assigned` and `ticket.created` only (`apps/server/src/notifications/fanout.ts:354`).

**Dates and actual dates.** A ticket's dates are field claims in `proj_tickets.fields` (`apps/server/migrations/1787961800000_proj-tickets.sql`). `TicketState.transitions` entries carry `toStateId, actorId, seq, workflowId, workflowVersion` and no time (`packages/domain/src/ticket-state.ts`, the `ticket.transitioned` arm); the reducer sees `env.serverTime`. Precedents for a time folded into the ticket: `closed {actorId, at}` and `reopenedAt` (`packages/domain/src/entity-state.ts:41-47`, migration `1789500000000_proj-tickets-reopened-at.sql`). The sweep argues against a second stored copy of a ledger fact (`sweep.ts:14-21`).

**The existing Timeline view.** Gantt-lite over claims, in `packages/app-core/src/timeline/timeline-model.ts` (600 lines) and `timeline-view.tsx` (416 lines):
- A bar needs BOTH a claimed start and a claimed due; anything else goes to a side list with a reason (`timeline-model.ts:206-231` doc block; `TimelineSideReason` at `:51`). "No dependencies, no critical path: out of spec."
- The window is 8 week columns (`DEFAULT_WEEKS = 8`, `timeline-model.ts:211`; option `weeksCount`, `:163`), anchored at an injected IST Monday (`:147-162`).
- **It pages.** "Earlier/Later move four weeks" (`SHIFT_DAYS = 28`, `timeline-view.tsx:118-119`); the buttons call `setAnchor(addDays(anchor, ±SHIFT_DAYS))` (`:240`, `:259`) and Today re-seeds the anchor (`:252`).
- **One row per ticket**, in epic lanes: `TimelineRow` (`timeline-model.ts:66-76`), `TimelineGroup {epicId, epicTitle, rows}` (`:88`), rows pushed per group and sorted (`:459-490`). It does NOT pack.
- Layout is a CSS grid, `--timeline-week-columns: repeat(N, minmax(0, 1fr))` (`timeline-view.tsx:225-232`, pinned by case 11.82).
- It is mounted by the project page as the fifth tab (`apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx:245-249`) and fed the SAME list as the List tab (`page.tsx:3112-3113`). That list is one answer built by walking every page: `getTickets` loops `cursor` with `limit=LIST_PAGE_SIZE` (`packages/app-core/src/online/online-data-source.ts:300-324`; server page sizes `DEFAULT_LIMIT 50`, `MAX_LIMIT 200`, keyset `ticket_id > cursor`, `apps/server/src/routes/list.ts:23-24`, `:145`; hook `useTicketList`, `packages/app-core/src/views/ticket-list.tsx:1409`). So the existing view already holds the whole project in memory.
- It is clock-free: `today` is injected, and `test/calendar/clock-free.test.ts` scans `CLOCK_FREE_ROOTS` = `claims, calendar, timeline, hierarchy, filter, provenance.ts` under `packages/app-core/src` for clock getters (`packages/app-core/test/helpers/clock-scan.ts:31-37`).
- Cases that pin the paging: 11.74 (`test-cases/11-calendar-notifications.md:73`), 11.79, 11.82, 20.271 (`test-cases/20-styling-system.md:265`, the Earlier / Today / Later control), and the week-column cases in `test-cases/13-board-prototype-port.md:689-690`, `:1926`.

**The ticket sheet.** Tabs are a `SegmentedControl` of Details / History / Attachments (`packages/app-core/src/views/ticket-sheet.tsx:3756-3763`), state `tab` (`:732`). The sheet panel is `width: min(40rem, 94vw)` = 640 px (`packages/ui/src/ui.css:480-481`); full screen is `.gn-sheet--full` at `width: 100%` (`ui.css:573-579`) with its body column capped at 53.75rem (`ui.css:580`). Below 40rem the sheet's phone arm applies (`ui.css:1059`).

**Rendering and layout dependencies.** `@xyflow/react ^12.8.2` is an `app-core` dependency (`packages/app-core/package.json:43`); the lifecycle workflow builder uses it with a hand-written layered layout (`packages/app-core/src/workflow-builder/layout.ts:23-40`). There is no ELK, dagre, d3 or Sigma in `package.json` on the release tip. The Knowledge Graph plans a pure motion engine, `packages/knowledge-graph/src/engine/{camera,wheel,fit,glide}.ts` (`docs/superpowers/plans/2026-10-03-knowledge-graph-view.md:34`, `:112` on `origin/docs/kg-plans-cd`): a critically damped camera spring τ = 85 ms (dt clamped to 100 ms), zoom limits, rubber band power 0.3, spring-back 160 ms, glide 320 ms (spec C §3.6). That package is not on the release tip yet.

**MCP.** Tools are `ToolDefinition`s in factories listed in `allTools` (`packages/mcp-server/src/tools/register.ts:35-49`); every tool is pinned in `packages/mcp-server/test/fixtures/tool-names.ts` (one block per module). `create_ticket` is `write-tools.ts:26-91` (default `start` is `'backlog'`, `:61-76`; dates as `startDate` / `dueDate`, `:13-20`). `update_ticket` is `ticket-tools.ts:70-104` and refuses a built-in passed through `fields` (`:82`). `get_ticket` is `read-tools.ts:150-171`. The house pattern for an irreversible act is a preview unless `confirm_name` is given (`delete_ticket`, `ticket-tools.ts:119-134`). Writes go through `envelopeFor` / `submitBatch` (`packages/mcp-server/src/tools/submit.ts`).

**Home.** Spec E (`docs/superpowers/specs/2026-10-03-home-design.md`) puts the Knowledge Graph on `/`, with counts for ONE workspace (§2.2; "Counts across all workspaces" is out of scope, §6). Spec C's scope pickers allow several workspaces and projects (C §3.5).

---

# PART 1 — The viewport engine, packing, and the existing Timeline view

Prefixes: **VP** (viewport), **PR** (preloading), **PK** (packing), **TV** (existing view). Case sub-block 29.001–29.119.

## 2. One engine, two adapters

**Requirement VP-0 (the seam).** A new pure-and-DOM package `packages/viewport` (`@gisik-nokma/viewport`) holds ALL motion and range logic for the three time surfaces (the existing Timeline view, the Timeline graph, Home's Timeline) and the Workflow graph's camera:
- `src/` pure modules, no DOM and no clock: `spring`, `momentum`, `rubber-band`, `anchored-zoom`, `range-plan` (what to load), `range-cache`, `pack` (row packing), `route` (edge routing on packed rows).
- `src/dom/` thin adapters that own `requestAnimationFrame` and `performance.now()`:
  - `ScrollAdapter`: a native scroll container (`overflow: auto`) with a virtualised inner surface. It is used by the time views, which want the platform's touch momentum and keyboard scrolling.
  - `CameraAdapter`: a transform camera over one `<div>`/`<svg>` layer, with pointer, wheel and pinch handling. It is used by the Workflow graph, which pans and zooms freely in 2D.
- Both adapters implement one interface, `ViewportDriver { offset(), scale(), animateTo(target, opts), onFrame(cb), visibleRange() }`, so the range planner, the cache and the packer never know which one is under them.

**Why outside `packages/app-core/src/timeline`:** the clock-free scan covers `claims, calendar, timeline, hierarchy, filter` (`clock-scan.ts:31-37`) and would redden on `requestAnimationFrame` / `performance.now()`. The pure planner and packer stay clock-free anyway; only `src/dom/` reads time. The existing view keeps `today` as an injected prop.

**Task order inside Part 1.** T1 is a MEASUREMENT harness, not the lift: a stress scene in a private browser package (following `origin/task/kg-c-t1-measure`'s `packages/knowledge-graph-browser/harness/stress.ts`) with a synthetic 10,000-interval index and 1,200 mounted bars, run on the desktop and on a real phone against the §13 pan bars, before anything else is built; if a bar fails, the plan stops and asks. T2 is the lift below.

**Reuse of the Knowledge Graph's motion code.** The KG plans the same math in `packages/knowledge-graph/src/engine/{camera,wheel,glide}.ts`. Part 1's T2 lifts those modules into `packages/viewport` with no behaviour change, and the KG package imports them back (its own tests stay green). If the lifted code is welded to Sigma's camera type, the task extracts the spring, wheel and glide maths and leaves the Sigma binding in the KG. If the KG release has not shipped these modules, Part 1 writes them and the KG imports them later. The spring constants below equal the KG's, so the two feel alike.

## 3. Smooth movement (VP)

**VP-1. One continuous axis.** The time axis is one canvas. There is no previous/next period, no "page", and no re-render by page. The Earlier / Later buttons are removed (`timeline-view.tsx:236-263`); Today and the zoom controls stay.

**VP-2. Pan input.**
- Horizontal wheel delta, a trackpad two-finger swipe, or Shift + wheel pans along the time axis. A plain vertical wheel scrolls the rows (native).
- Mouse drag on empty canvas pans, with momentum on release.
- Touch: one-finger drag pans with the platform's momentum (`ScrollAdapter`) or the engine's (`CameraAdapter`).
- Text is never selected during a drag, and the page never scrolls under the canvas (the KG's trap 7: `preventDefault` on a non-passive `wheel` listener, `touch-action` and `overscroll-behavior: contain` on the canvas only).

**VP-3. Momentum.** On release the offset keeps its release velocity `v0` and decays `v(t) = v0·e^(−t/τm)`, τm = 240 ms, stopping below 2 px/s. The velocity is the least-squares slope of the last 80 ms of pointer samples.

**VP-4. Keyboard.** The canvas is focusable (`role="group"`, accessible name "Timeline"). Left/Right glide 7 days; Shift + Left/Right glide 28 days; PageUp/PageDown glide one viewport minus 10%; Home or `T` glides to Today; `+` / `−` zoom about the centre. Each glide is the critically damped spring, τ = 85 ms (about 300 ms to settle, dt clamped to 100 ms), never a jump.

**VP-5. Today and jump-to-ticket glide.** Today and "show this ticket" (from the tray, the inspector, or a link) animate. The travel is capped at 450 ms whatever the distance; between the two ends the surface shows the whole-scope interval index (PR-0), so a long glide crosses drawn bars, never an empty band. With `prefers-reduced-motion` every glide is instant.

**VP-6. Zoom.**
- Continuous, 4 to 96 px per day; presets Day 56 px/day, Week 24 px/day, Month 8 px/day (the Home mockup draws 24 px a day).
- Ctrl + wheel or a trackpad pinch zooms about the pointer; the Day/Week/Month buttons and `+` / `−` zoom about the viewport centre; they animate on a log scale with the same spring.
- **Anchor invariant:** the day under the anchor keeps its screen x within 0.5 px on every frame.
- The header labels change with the scale and cross-fade (never pop): day numbers at ≥ 40 px/day; "W 28 Sep" week labels from 16 to 40; month labels below 16.

**VP-7. Limits.** The pan range is the scope's earliest drawn day minus one viewport to its latest plus one viewport (around today ± 8 weeks when nothing is drawn). Past a limit the surface rubber-bands (power 0.3) and springs back 160 ms after the last input (KG parity).

**VP-8. Frame discipline.** Movement is a compositor `transform` on one layer; sticky lane headings and the axis header are separate layers. At most one layout per frame.

**VP-9. Reduced motion.** Every animation in this Part is instant under `prefers-reduced-motion`.

## 4. Preloading and the range API (PR)

**Terms.** `ppd` = pixels per day now. `V` = the viewport width in days (`width / ppd`). A **chunk** = 28 days aligned to a Monday (the existing view's paging unit, `SHIFT_DAYS`, `timeline-view.tsx:119`, with `mondayOnOrBefore`, `packages/app-core/src/claims/dates.ts:93`). A **scope** = the sorted workspace ids, sorted project ids and the Mine/Everyone flag.

**PR-0. The whole-scope interval index (stability of rows).** Greedy packing over a range that grows leftward would re-pack rows already on screen, and the owner asked for the smallest number of rows. So the surfaces that fetch (Timeline graph, Home) first load a light **interval index** of the whole scope, and pack over it; range preloading then fills in details only.
- One index entry: `{id, key|null, draft, kind: 'ticket'|'decision', lane, start, end, plannedStart, plannedEnd, actualStart, actualEnd, category, flowId|null}`; about 100 bytes each.
- Cap 10,000 entries per scope. If the cap cuts, it drops the entries that ended longest ago first and the surface says "Older work isn't drawn: N items before 3 Mar".
- Rows are computed once from the index (PK), so a details chunk arriving never moves a row, and a bar is drawn (its key, its colour) before its title arrives.
- `flows[]` carries, for EVERY visible member of each included flow component, the plan inputs (explicit dates, estimate, wait-for-all, category, actual end) and the flow edges (FL-1) — including members that `items` leaves out because of Mine or a project scope (other people's tickets, other projects of the same workspace). Without them the client could not re-plan on a live update with the same function. These members count toward the 10,000 cap.

**PR-1. First paint.** Open loads the index and the details for `[visibleStart − V, visibleEnd + V]` rounded out to chunk boundaries (at 24 px/day on 1200 px, V = 50 days, so 6 chunks). Nothing paints before both arrive, apart from the skeleton (HM-7), so the first pan never waits.

**PR-2. Ahead of travel.** While the offset moves, the planner keeps the loaded range ahead of the direction of travel by `max(V, |v̂| × 1.5 s)`, where `v̂` is the smoothed velocity in days per second (so at least 1 s of fast panning, with 50% slack), and keeps the other side at ≥ 0.5 V. Ahead chunks fetch at high priority, the far side at low priority; a reversal cancels in-flight low-priority fetches. At most 2 fetches in flight.

**PR-3. Idle widening.** When nothing moves for 200 ms, an idle callback (`requestIdleCallback`, else a 200 ms timer) loads one more chunk per tick, alternating sides, until the cap: 40 chunks or 10,000 details entries per scope, whichever comes first. Eviction removes the chunk farthest from the viewport centre first, and never evicts `[visible − V, visible + V]`.

**PR-4. The next zoom level.** After the view settles, the planner makes sure the details and the packing for the next coarser preset (its own `V′`, centred on the viewport, within the cap) are ready, and precomputes the packing for the neighbouring scale buckets (PK-6). A zoom change shows bars immediately.

**PR-5. Pre-layout and pre-render.** Packing covers the whole index (PK-5). Items in `[visible − V, visible + V]` are mounted in the DOM before they scroll in, in batches of at most 4 ms of main-thread work per frame. After first paint, nothing is inserted INSIDE the viewport except by a live event (PR-6), so arriving data never reflows what is on screen.

**PR-6. Cache and live updates.** Loaded chunks and the index are cached per scope in a `RangeCache` (pure, in `packages/viewport`), and a return to the same scope reuses them (the same idea as the list's session cache, `cacheKey` at `ticket-list.tsx:1435`). A live event (from the existing stream, `packages/app-core/src/online/stream.ts`) patches the cache:
- an event that changes one entry (title, assignee, state, dates, estimate, wait-for-all, a link, a decision) re-plans that entry's flow component on the client with the shared planner (PL) and patches the index and the packed rows;
- an event that could add an entry the cache cannot know about (new dates falling in a loaded chunk) marks the chunk stale and refetches it in the background; the stale chunk stays drawn until the new one lands (stale-while-revalidate), so a refetch never blanks.

**PR-7. Bars.** See §13. The key one: a fast pan across 10 viewports at the preload rate (one viewport per second) never shows an empty band in a scene whose fetch latency is the server's p95, and scroll-stop → details shown is 0 ms inside the preloaded range.

**The range-fetch API (new; nothing like it exists):**
- Every read in the app today is one workspace (`list.ts`, `my-work.ts`), and `FilterSpec` has only a `due` bound on the due date (`packages/domain/src/filter-spec.ts:183-190`). Neither can range over start/due overlap or chained dates, or over several workspaces.
- Routes (Fastify, `apps/server/src/routes/timeline.ts`, registered beside `routes/graph.ts` of spec C):
  - `GET /v1/timeline/index?ws=<id,…>&proj=<id,…>&mine=1|0` returns `{ today, items[], flows[], tray: {count}, truncated }`.
  - `GET /v1/timeline/chunk?ws=…&proj=…&mine=…&from=<Monday>&to=<Monday+27>&cursor=` returns the details of the entries overlapping the chunk: `{ items[], nextCursor }`. Page size 200, keyset on `ticket_id > cursor`, the list route's own pattern (`list.ts:23-24`, `:145`).
  - `GET /v1/timeline/tray?ws=…&proj=…&mine=…&cursor=` returns the unscheduled tickets with their reason, 200 per page.
  - `GET /v1/workspaces/:ws/tickets/:id/flow` returns one ticket's flow (FL-1 to FL-3).
- Visibility uses `visibleTicketsWhere(eff, userId, params)` and `LIVE_TICKET_WHERE` (`apps/server/src/read/visible-where.ts:136`, `:231`), per workspace with `requireMember` (`read/membership.ts`); a workspace the viewer is not a member of answers like an unknown one (`READ_NOT_FOUND_BODY`). A hidden ticket is absent from items, flows and counts.
- App side: `DataSourceQuery` (`packages/app-core/src/data-source.ts`, `query` at `:458`) gains `getTimelineIndex`, `getTimelineChunk`, `getTimelineTray`, `getFlow`; implemented in `online/online-data-source.ts` and in `replica/replica-data-source.ts` (the replica builds the same answers from its folded tickets, using the same pure planner).
- **The existing view does not use these routes.** Its data is the list's single walk (§1). For it the "range" is a layout and render window over rows already in memory; PR-1 to PR-5 apply to packing and DOM mounting, and PR-6's cache is the list's own session cache. No fetch changes.

## 5. Row packing (PK)

**PK-1. The rule.** Within one lane, items are sorted by `(start day, key, id)` and each goes into the FIRST row where no item shares any day with it (adjacent days do not overlap, so "the next can stand side by side"). Keys sort naturally (`GN-9` before `GN-10`); items without a key (drafts) sort after keyed items with the same start, by id.

**PK-2. Minimal.** Greedy-by-start with first-fit is optimal for interval graphs, so the row count equals the largest number of FOOTPRINT intervals (PK-3 hull, PK-4 label footprint, at the packing scale) overlapping on any one day. For bars longer than their labels the footprint is the drawn bar, so it is the largest number of bars overlapping on one day; the property test asserts both forms. A property test (random intervals, 200 seeds) asserts exactly that, with a control in the same `it`: a planted packer that fills rows last-fit produces more rows on at least one seed and the assertion catches it.

**PK-3. Occupancy is the hull of what is drawn.** An item's interval for packing is the hull `[min(planned start, actual start), max(planned end, actual end)]`, so the Planned vs actual toggle (TG-3) never changes a row. A decision (a diamond) occupies its end day.

**PK-4. The key label counts.** Every bar shows its ticket key (drafts show "Draft"). A bar shorter than its label shows the key just outside its end, never hidden. So the label is part of the footprint: `footprint = [start, max(end, start + ⌈labelPx / ppd⌉ − 1)]` when the bar is shorter than its label, where `labelPx` is the measured width of the key (a cached text measurement, injected so the packer is pure). The title appears inside the bar when it fits, ellipsised otherwise. Because the footprint depends on `ppd`, **packing depends on zoom**, but never frame by frame: packing uses a **bucketed scale** `ppdPack = 2^⌊log2 ppd⌋` (4, 8, 16, 32, 64 px per day), the lower bound of its bucket, so the footprint is never smaller than the label needs anywhere inside the bucket. Rows re-pack only when a zoom gesture SETTLES in a different bucket (PK-6), never mid-pinch. While a gesture is in progress, an outside-end key label that no longer fits its footprint fades out and returns after the re-pack glide.

**PK-5. Lanes.**
- A lane packs independently. Home: one lane per project, in project order, each with a heading row (the mockup's 34 px) and its own rows. The existing view: one lane per epic, as today (`TimelineGroup`, `timeline-model.ts:88`). The flow graph: one lane.
- Packing runs over the WHOLE index of the lane, not the viewport (PR-0), in the pure packer, ≤ 20 ms for 10,000 items (or in a worker).

**PK-6. Stability.**
- Pan, preload and details arrival never change a row (rows come from the index).
- A live change (a ticket's dates, an estimate, a state that moves it between planned and actual) re-packs only that item's lane; a bar whose row changed glides to the new row over 200 ms (FLIP), never jumps.
- A zoom gesture that settles in a different bucket re-packs (PK-4); bars glide to their rows over 200 ms. The packing for the neighbouring buckets is precomputed after settle (PR-4), so the glide starts at once. Within a bucket, rows do not change.
- The packing is a pure function of the index and `ppd`, deterministic across devices.

**PK-7. Orientation.** Landscape: time runs left to right, rows stack downward. Portrait (phones, the container narrower than 40rem, `ui.css:1059`): time runs DOWN, and the same packing yields columns. A lane's width is its column count × 112 px; lanes sit side by side with a sticky heading row; beyond the screen width the surface also pans horizontally (2D).

**PK-8. Labels.** Key always. Title inside the bar when it fits. A draft shows "Draft" in place of the key, with a dashed border. A decision shows its diamond with the key beside it.

## 6. The existing Timeline view, made continuous and packed (TV)

Case sub-block 29.080–29.119. Task-sized, shippable alone.

**TV-1. Continuous.** Replace the 8-week grid with the ScrollAdapter surface (VP, PR). Retired: the Earlier / Later buttons and `SHIFT_DAYS` (`timeline-view.tsx:118-119`, `:236-263`), the `weeksCount` and `anchor` options and `TimelineWeekCol` / `TimelineBarSpan` (`timeline-model.ts:30-36`, `:147-163`, `:211`), and the `--timeline-week-columns` grid (`timeline-view.tsx:225-232`, `ui.css`). Retired cases (marked 🚫 with the reason "the Timeline is one continuous axis, 2026-10-03"): 11.74, 11.79, 11.82, 20.271's Earlier/Later half, the second half of 11.75 (TV-9), and the week-column cases at `test-cases/13-board-prototype-port.md:689-690`, `:1926`. Their replacements are in 29.080–29.119. The Features.md Timeline bullets (`Features.md:198-199`, `:2761`) are edited in the same change.

**TV-2. What stays.** The claims semantics are unchanged: a bar needs BOTH claims; the side list and its five reasons (`TimelineSideReason`, `:51`) stay as the tray; epic lanes and `hideEpicRows` / `laneEpicId` / `isEpicType` / the filter stay; custom date claims stay beside the ticket; the `aria-describedby` date span (case 11.222) stays; provenance stays. It does NOT adopt `leads_to`, estimates or chaining (they are Parts 2–4), so it needs neither Drafts nor `leads_to`.

**TV-3. Extent.** The drawn axis (header and grid) covers the pan range of VP-7: from the earliest claimed day minus one viewport to the latest plus one viewport, and at least today ± 56 days. It opens centred on today.

**TV-4. Packed.** Each epic lane packs its bars (PK-1 to PK-6). The model replaces `rows: TimelineRow[]` per group (`timeline-model.ts:88`, `:459-490`) with `lanes` of packed rows; the one-row-per-ticket order is gone.

**TV-5. Key on each bar.** The bar shows the ticket key (`TicketDatesInput.key`, `claims/ticket-dates.ts:46`), plus the title when it fits (PK-4). The accessible name stays the title alone, as case 11.222 requires, with the key in the description.

**TV-6. Phones.** The existing phone layout (the same grid) is replaced by the portrait layout (PK-7).

**TV-7. Preloading in this view** is layout and render only (§4, last bullet). The list's skeleton and stale-while-revalidate rules (`useTicketList`, `ticket-list.tsx:1435-1447`) are unchanged.

**TV-9. The out-of-window copy is replaced.** The model's second empty arm, `TIMELINE_OUT_OF_WINDOW_COPY` ("dated work scheduled outside these weeks", `timeline-model.ts:4`, `:564-599`, pinned by case 11.75), has no meaning on a continuous axis. The first arm (nothing claimed, or a narrowing emptied it: `TIMELINE_EMPTY_COPY`) stays. When the viewport shows no bar but bars exist elsewhere, a pill reads "Nothing in view" with "Jump to the next bar" / "previous bar" controls that glide (VP-5). Case 11.75 is amended (the first half stays; the second half is retired).

**TV-8. Clock-free.** The new model and view code under `src/timeline` stays clock-free (the scan stays green); the engine's clock reads live in `packages/viewport/src/dom/`.

---

# PART 2 — The model

Prefixes: **LK** (links), **DC** (Decision), **ES** (estimate, wait-for-all, actual dates), **FL** (flow), **PL** (planning), **AP** (auto-promotion). Case sub-block 29.120–29.229.

## 7. Links, Decisions, fields

### 7.1 The `leads_to` kind (LK)

**LK-1. The kind.** `TICKET_LINK_KINDS` becomes `['blocks','relates','duplicates','leads_to']`. It reads "leads to" from the source and "comes after" from the target (the `READINGS` table, `ticket-events.ts` of spec A). Stored as source → target: "GN-144 leads to GN-147".

**LK-2. The label.**
- `ticketLinkAddedPayload` gains an optional `label` (a non-blank name, trimmed, 1–60 characters, built like `displayName` in `packages/domain/src/display-name.ts`). A `refine` refuses `label` on any kind but `leads_to`.
- `ticket.link_removed` is unchanged (`{kind, targetId}`).
- Absent label means no label. The additive-field rule applies: no stored event changes meaning.

**LK-3. Rules** (extending spec A §2.3):
1. Rules 1–3, 6, 7 of spec A apply (no self-link, same workspace, neither trashed, no duplicate of the same ordered pair, edit rights on the source and `canSee` on the target to add, either end to remove).
2. Spec A's rules 4 and 5 (no direct reverse) do NOT apply to `leads_to`: loops are allowed, including a two-ticket loop (A → B and B → A).
3. **Decision sources need labels.** A `leads_to` from a Decision ticket requires a `label` (`link.label-required`), and its outgoing labels are unique after trim and case folding (`link.label-duplicate`). From any other ticket the label is optional.
4. A `leads_to` between a ticket and a draft is private to the draft's author until publish (D-3 in §15, and question 7 in §20).

**LK-4. Relabel** is one batch: `ticket.link_removed` then `ticket.link_added` with the new label. No new event type. A resolved Decision whose chosen outcome no longer matches any branch shows a warning on the diamond ("outcome 'Yes' has no branch") and the Decide control offers the labels again.

**LK-5. Projection.** A migration widens the CHECK on `proj_ticket_links` to include `'leads_to'` and adds `label text NULL`; the primary key stays `(source_id, target_id, kind)`, so at most one `leads_to` per ordered pair. (A Decision that sends two outcomes to the same ticket needs two tickets or one label such as "Yes or maybe"; every branch in the mockups goes to a different ticket.) The projection (`apps/server/src/projections/ticket-links.ts`, spec A) writes the label.

**LK-6. Census.** `leads_to` and `label` touch the lists spec A §2.6 enumerates: `linkReading`, `describeEvent` ("Linked: GN-144 leads to GN-147 (Yes)"), `redactedPayload` (the label of a redacted target is kept; the target becomes "a ticket you can't see"), `precheck.ts` and the engine check (`rule-engine/src/checks/links.ts`), `check-permission.ts`, the replica, and spec A's Links section (kind Select gains "Leads to" with a label input, grouped under "leads to" and "comes after"). Spec A's census test (its case 7) is extended so `leads_to` and `label` are asserted in each list.

### 7.2 The Decision ticket type (DC)

**DC-1. A built-in type.** Add a fifth seed to `BUILTIN_TICKET_TYPE_SEEDS` (`ticket-types.ts:142-147`): `{ id: 'decision', name: 'Decision', icon: 'diamond', rank: 3 }`, and export `DECISION_TYPE_ID = 'decision'` beside `SUB_TASK_TYPE_ID` (`ticket-types.ts:123`). It is bound to the workspace's default workflow, with no custom fields. If the icon set has no diamond (`packages/app-core/src/workflow-builder/ticket-types/icons.tsx:29`, names `flag`, `book`, `check`, …), the plan adds a `diamond` shape to `TYPE_ICONS`.

**Why a seed, not an optional `decision` flag on `ticketTypeDefSchema`:**
- A seed has a stable id like the other four, so the engine, the graph and MCP recognise a Decision by `typeId === DECISION_TYPE_ID`, exactly as the sub-task is recognised.
- Its rank is locked by `type.builtin-rank` (`checks/ticket-type.ts:84-94`), so an admin cannot move it to rank 4 and force a parent onto it.
- A flag would let an admin turn a type that already holds tickets into a Decision (the engine never re-asks occupancy, `checks/ticket-type.ts` doc block), and it would still need a backfill to put any Decision type into existing workspaces.
- The cost of the seed: it reaches only new workspaces (`bootstrap-workspace.ts:87`) and enters the seed readers (`page.tsx:175`, `epic-ancestor.ts:19`, `ancestry.ts:45`, the type editor and list screen). Those find the epic by rank 1 or id `epic`, so a second rank-3 seed does not change them; the plan greps each reader and the case counts that pin four seeds.

**DC-2. Rank 3** makes a Decision a peer of Task: it may sit under an epic or a story (`hierarchy.rank`, `checks/hierarchy.ts:165-166`), at a project's root (rank < 4, `checks/hierarchy.ts:132`), and never under a Task or a sub-task.

**DC-3. Existing workspaces.** A one-off, idempotent server job (run once at the release's deploy, then harmless to re-run) appends `ticket-type.defined` for `decision` in every workspace that lacks a type with that id, through `ingestBatch` under the reserved flow actor (AP-2), bound to that workspace's default workflow (the workflow of its `task` type). It skips a workspace that already has a type with the id `decision` (that type is then treated as the Decision type; open question 6).

**DC-4. The outcome event.** New `ticket.decided` (ticket entity, version 1):

```ts
ticketDecidedPayload = z.object({ outcome: displayName(max 60).nullable() }).strict();
```

- `outcome` names one of the ticket's outgoing `leads_to` labels, compared after trim and case folding; `null` clears the outcome (this is the member's way to remove a decision, Rule D2).
- It folds into `TicketState.outcome?: { value: string; actorId: string; at: string } | null`; absent until a first decision, `null` after a clear (the `closed` precedent, `entity-state.ts:41`).
- Engine checks (`rule-engine/src/checks/decision.ts`): the ticket must be a Decision (`decision.not-a-decision`); a non-null `outcome` must match an outgoing `leads_to` label (`decision.unknown-outcome`, naming the labels). It is allowed while the ticket is terminal (a re-decision); it never reverses a promotion already made.
- Permission: the same right as `ticket.field_set` on the ticket.

**DC-5. The close rule (decision 3).** `ticket.transitioned` into a `terminal` category, and `ticket.closed`, are refused for a Decision that has at least one outgoing `leads_to` and no outcome (`decision.outcome-required`: "Choose an outcome before finishing this decision."). A Decision with no outgoing `leads_to` finishes freely. The check reads `TicketState.links` and `TicketState.outcome`, so it runs identically on the server and the replica. This is an engine rule next to `parent-terminal-with-open-children` (`transition.ts:152-168`). The Decide control (WG-3) writes the outcome and the transition in one batch.

**The auto-close sweep mirrors DC-5.** A terminal Decision with branches and no outcome can exist without a transition (a republish re-categorises its state, `proj_tickets.state_category` docs), and the sweep's SELECT mirrors every close refusal "so it never builds a close this door refuses" (`apps/server/src/auto-close/sweep.ts:198-215`). So the sweep gains the clause `NOT (t.type_id = 'decision' AND t.outcome IS NULL AND EXISTS (SELECT 1 FROM proj_ticket_links l WHERE l.source_id = t.ticket_id AND l.kind = 'leads_to'))`. Clearing the outcome of a terminal Decision (`outcome: null`) is allowed; the same clause keeps the sweep from closing it. Cases: the sweep does not select such a Decision, and the control selects the same Decision with an outcome.

**DC-6. Display.** The graph draws a Decision as a diamond; elsewhere (board cards, list, sheet) it is an ordinary ticket with the diamond icon. The sheet of a Decision shows a **Decide** control: one button per outgoing label ("Yes", "No", "Need more info"), the chosen one marked, and "Clear".

### 7.3 Estimate, wait-for-all, actual dates (ES)

**ES-1. Estimate.** A sixth built-in field, `estimate`: whole days, 1 to 365 (`estimateValueSchema = z.number().int().min(1).max(365)`; `null` clears), written by `ticket.field_set {fieldId:'estimate'}`. It is also an optional `ticket.created` member (the birth-field precedent: `startDate`, `ticket-events.ts:150-151`), and an `estimate` control beside Start date and Due date in the new-ticket form and the sheet. It joins the require-field picker (`BUILTIN_FIELD_CHOICES`, `workflow-builder/fields.ts:33-38`).

**ES-2. Wait-for-all.** A seventh built-in, `waitForAll`: `true`, or `null` to clear (absent = off), via `ticket.field_set`. A field claim gives attribution, both clocks and History for free. It is EXCLUDED from the require-field picker (a rule on it could never fail, the reason `priority` is excluded, `workflow-builder/fields.ts:11-19`), so case 3.972's set difference is updated by name: `priority` and `waitForAll` excluded.

**ES-1a. The built-in census** (template: `docs/superpowers/specs/2026-09-22-priority-builtin-design.md`). Adding `estimate` and `waitForAll` as built-ins touches each of these, in the same change:

| Place | What changes |
|---|---|
| `packages/domain/src/ticket-types.ts` | `BUILTIN_FIELD_IDS` (both), `estimateValueSchema`, a `waitForAll` value schema (`true` or `null`) |
| `packages/domain/src/events/ticket-events.ts` | `ticket.created` gains optional `estimate` |
| `packages/domain/src/ticket-state.ts` creation branch | folds `estimate` at birth as `startDate` is (`:150-151` of the payload; the fold writes no key for an absent member) |
| `packages/rule-engine/src/checks/fields.ts:123-155` | a value-check arm for each id (without one, `ticket.field_set` refuses or accepts any value) |
| `packages/app-core/src/precheck.ts` and `replica/` | the same two arms; the replica folds both |
| `packages/mcp-server/src/tools/ticket-tools.ts:19` `BUILT_IN` set | add both, so `fields` cannot carry them; `estimate` gets an argument, `waitForAll` gets `set_wait_for_all` |
| `packages/app-core/src/views/history-copy.ts` | "Set Estimate to 3 days", "Turned on Wait for all incoming" |
| `packages/app-core/src/workflow-builder/fields.ts:33-38` | `estimate` joins `BUILTIN_FIELD_CHOICES`; `waitForAll` is excluded and case 3.972 is updated by name |
| `apps/server/src/projections/tickets.ts:152` `rowToTicketState` and `read/ticket-cards.ts:75` `PROJ_TICKET_COLUMNS` | read the new columns `started_at`, `ended_at`, `outcome` back into `TicketState` |

**ES-3. The shadow risk (pre-flight).** Adding two ids to `BUILTIN_FIELD_IDS` makes a stored custom field with id `estimate` or `waitForAll` fail `ticketTypeDefSchema` at READ (`ticket-types.ts:33-40`, `:113-118`). MCP `define_ticket_type` accepts any id (`definition-admin-tools.ts:103-119`), so this is possible. The plan's first task of Part 2 runs a read-only query against prod (and the dev copy) for such ids and records the result; if any exist, that workspace's field is renamed by a migration event before the release, or the plan stops and asks.

**ES-4. Actual dates are derived, never authored.** `TicketState` gains `startedAt?: string | null` and `endedAt?: string | null`, folded by the shared reducer from `env.serverTime` (the `closed` / `reopenedAt` precedent):
- `startedAt` = the `serverTime` of the first event that places the ticket in a category other than `open` (a `ticket.created` with a `stateId` in an active state, a `ticket.transitioned` into `active` or `terminal`, or a `ticket.workflow_rebound` whose `toStateId` is in such a category; the rebound arm is `ticket-state.ts:361`). A rebound onto a terminal state sets `endedAt` the same way. Backlog → the first state does not count (that is `open`). It is never cleared.
- `endedAt` = the `serverTime` of the event that last placed the ticket in `terminal`; set to `null` by a transition into a non-terminal category. A `ticket.reopened` does not change it (the state stays terminal, `close.ts`).
- Projected to `proj_tickets.started_at` / `ended_at` (`timestamptz NULL`); a rebuild from the ledger recomputes them (the plan runs `rebuildProjection` for `proj_tickets` after the migration, `apps/server/src/projections/rebuild.ts`, and `tools/verify-projections.ts` stays green). Historic tickets get their real dates this way.
- A pending (not yet accepted) event has no `serverTime`; the replica leaves the two members unchanged until acceptance.
- A workflow republish that re-categorises a state moves tickets without events (`proj_tickets.state_category` docs) and does not change these members.
- The displayed day is the IST day of the instant (`istDayOf`, `packages/domain/src/ist-day.ts`), never the device's.

## 8. Flow, planning, auto-promotion

### 8.1 The flow (FL)

**FL-1. Definition.** A ticket's **flow** is the weakly connected component of the ticket over `leads_to` links (both directions, transitive), within one workspace, over live (not trashed) tickets the viewer can see (`visibleTicketsWhere`, `LIVE_TICKET_WHERE`), plus the viewer's own drafts (CR-2). A hidden ticket is a hole: the walk does not pass through it, and no placeholder is drawn (the KG's rule; spec A §2.4). Parent/child links do not make a flow. `blocks`, `relates` and `duplicates` never extend a flow; a `blocks` link is DRAWN (fainter) when both ends are in the flow; `relates` and `duplicates` are not drawn on these graphs (they are in the Knowledge Graph).

**FL-2. Cap.** A flow shows at most 300 tickets. The walk goes ring by ring (one query per ring, at most 30 rings, like spec C's neighbours endpoint). Past the cap the answer says `truncated: true` and the surfaces say "Showing 300 of the first N reached" and offer "Open this ticket's neighbours only".

**FL-3. Pure analysis** (`packages/domain/src/flow/analysis.ts`, clock-free, one function used by the server, the replica, the app and tests):
- **Start** nodes: no incoming `leads_to`. **End** nodes: no outgoing `leads_to`. Each gets an automatic "Start" / "End" pill. A node in a pure loop has neither.
- **Back edges** (loops): depth-first search from the Start nodes in ascending ULID order (then, for unvisited nodes, from each in ascending ULID order); out-edges visited in ascending target ULID; an edge into a node currently on the stack is a back edge. The set is deterministic for a graph.
- **Flow order:** Kahn's topological order over the edges without back edges; among ready nodes the smallest `(explicit sort day, id)` first, where the explicit sort day is `startDate`, else `dueDate`, else none (none sorts last). It is data-only (no dependency on planning), so chaining cannot depend on it circularly. Publish order (CR-3) and the accessible list use it.
- Back edges are excluded from chaining (PL) and from flow order, and from "wait for all" (AP-3); they are drawn as loops.

**FL-4. Header counts.** The graph header shows the ticket count ("13 tickets in this flow"), `Leads to N`, `Blocks N`, and, for tickets whose switch is on, a legend "Waits for all incoming".

### 8.2 Planning (PL)

`planFlow(nodes, edges)` in `packages/domain/src/flow/plan.ts`: pure, clock-free, shared by the server's index and flow reads, the replica, and the app's live patches.

**Inputs per node:** `id`, `explicitStart`, `explicitDue` (IST days), `estimate`, `waitForAll`, `category`, `endedDay` (from `endedAt`), `kind`.

**PL-1. Predecessor end.** For a predecessor `p`: its end is `endedDay` when `p` is terminal and `endedAt` exists (what actually happened); otherwise `p`'s planned end if it has one; otherwise unknown. Chaining never uses today, so a plan changes only on an event (an overdue active predecessor does not slide its successors; the bar of the active ticket itself extends to today, TG-3).

**PL-2. Ready day `R(t)`** from the non-back incoming edges `I′` with known ends `E = {end(p) + 1}`: default ("any") `R = min(E)`; with `waitForAll`, `R = max(E)` and `R` is unknown if any `p ∈ I′` has an unknown end. No incoming edges: `R` is undefined.

**PL-3. The planned interval** (inclusive IST days), in this order, explicit dates win:

| Given | Planned interval |
|---|---|
| start and due | `[start, due]`; if start > due: unscheduled, reason `start-after-due` |
| start and estimate | `[start, start + n − 1]` |
| due and estimate | `[due − n + 1, due]` |
| start only | `[start, start]` |
| due only | `[due, due]` |
| neither, estimate and `R` | `[R, R + n − 1]` (basis `chained`) |
| neither, `R` but no estimate | unscheduled, reason `no-estimate` ("Add an estimate") |
| anything else | unscheduled, reason `no-dates` ("Add dates") |

The basis is `explicit` when a start or due exists, else `chained`. When an explicit start is earlier than `R`, the node carries `startsBeforePredecessor` (a small warning glyph; never blocking).

**PL-4. A ticket is on the timeline** when it has a planned interval OR has `startedAt` (it happened, so it is drawn even undated). Otherwise it sits in the tray with its reason.

**PL-5. Live transformation.** A transition that starts or finishes a ticket changes its actual dates (ES-4) and therefore its successors' chained plans, with no extra writes. The planned values are kept (they are inputs), so the Planned vs actual toggle can compare at any time.

### 8.3 Auto-promotion (AP)

**AP-1. What it does.** A ticket in Backlog moves to its workflow's first state (the universal Start edge, always legal: §1) when its incoming condition is met. It is a `ticket.transitioned {to: initialStateId, cause}` event, not a new mechanism, so every existing consumer (history, boards, the replica, notifications) already understands it. If the workflow's initial state has category `terminal` (nothing forbids it, §1), promotion is skipped and logged (open question 8).

**AP-2. Attribution.**
- A new reserved actor `SYSTEM_ACTOR_FLOW = '00000000000000000000SYS0FW'` in `system-actors.ts`, display name "Flow", added to `SYSTEM_ACTOR_NAMES` (the id matches `ULID_REGEX`, `ids.ts:9`; a case pins it with a negative control, like 13.722).
- `ticketTransitionedPayloadSchema.cause` (`workflow.ts:207`) becomes a discriminated union: the existing `reopened-for-child` and `{ kind: 'led-to', sourceTicketId: ulidString, label?: string }`. The consumers listed in §1 handle the new arm; `describeEvent` reads it.
- **Forgery guard.** An engine rule in `evaluateTicketTransitioned` (`transition.ts`) refuses `cause.kind === 'led-to'` unless `env.actorId === SYSTEM_ACTOR_FLOW` (`cause.forged`). No client can file as the reserved actor (`system-actors.ts:30-33`), so a member cannot dress a manual move as automatic.
- History reads: "Moved to To do automatically, because GN-145 was closed". For a viewer who cannot see the source ticket it reads "because an earlier step was finished" (no key, no title).

**AP-3. The condition.** For a target `T` currently in Backlog, live, not a draft, with `I(T)` = its incoming `leads_to` links from live sources:
- an edge `S → T` is **satisfied** when `S` is in a `terminal` category AND (`S` is not a Decision OR `S.outcome` equals the edge's label after trim and case folding);
- default ("any"): promote when `I(T)` is non-empty and at least one edge is satisfied;
- `waitForAll`: promote when every edge of `I′(T)` (without back edges; if that leaves none, `I(T)`) is satisfied;
- a trashed source is not in `I(T)`; a hidden source still counts (the rule ignores visibility);
- a satisfied edge from a source that was finished and later moved out of terminal is not satisfied (state is read now).

**AP-4. Triggers** (events that re-evaluate a target; the target's own transition into Backlog is NOT a trigger, so "Send to backlog" sticks until the next real change):

| Event | Targets re-evaluated |
|---|---|
| `ticket.transitioned` on `S` | `S`'s outgoing `leads_to` targets |
| `ticket.decided` on `S` | the same |
| `ticket.deleted`, `ticket.restored` on `S` | the same |
| `ticket.link_added` / `ticket.link_removed` of a `leads_to` | the link's target |
| `ticket.field_set` of `waitForAll` on `T` | `T` |
| `ticket.restored` on `T` | `T` |
| a draft published (spec 1) | the published ticket (as a target) |

**AP-5. Where it runs.** Server only; a replica never promotes (a replica is visibility-scoped and cannot see every source). A new `apps/server/src/flow/promote.ts`:
- `createFlowPromoter({ pool, ingest })` with `onCommitted(event)`, registered with `ingest.onEventCommitted` beside the notification fan-out (`app.ts:1134-1139`), fire-and-forget like it;
- it evaluates with the pure `promotionsFor(...)` of `packages/domain/src/flow/promotion.ts` and submits through `ingestBatch` as `SYSTEM_ACTOR_FLOW`, `origin: 'server'`, `cause: {kind:'led-to', sourceTicketId: <the source that completed the condition>, label?}`;
- a refused submission (the world moved, or a second source already promoted it) is counted and logged, not an error (`sweep.ts:245-258`);
- the listener is fire-and-forget, so a crash between a commit and its promotion would lose a promotion. **A reconciling sweep** `runFlowSweep({pool, ingest})` selects Backlog tickets that have incoming `leads_to` and a met condition, and submits the same event. It is idempotent (a promoted ticket is no longer in Backlog) and runs on the backup daemon's tick beside the auto-close sweep (`backup-daemon-main.ts:279`).

**AP-6. A loop never reopens.** An edge into a ticket that is not in Backlog does nothing. A Decision whose "No" branch loops to an already-finished step leaves that step finished; the graph draws the edge as a loop with the tooltip "Loops back; a finished step stays finished". Whoever wants another pass creates a new ticket or reopens by hand (open question 3).

**AP-7. Notifications.** Promotion sends none in this spec (the fan-out acts on assignment and creation only, `fanout.ts:354`); open question 4.

### 8.4 Vocabulary census for the new and changed events (new event type ⇒ every list)

Each is updated in the same change and the plan's last Part-2 task greps the registry against each. For `ticket.decided` (new) and the widened `ticket.link_added` / `ticket.transitioned` payloads:

| Place | What changes |
|---|---|
| `packages/domain/src/vocabulary.ts` | register `ticket.decided` |
| `packages/domain/src/ticket-state.ts` `TICKET_EVENT_TYPES`, `applyTicketEvent` | add `ticket.decided`; fold `outcome`, `startedAt`, `endedAt`, the widened links |
| `apps/server/src/sync/sync-routes.ts` `BOOTSTRAP_BACKFILL_TYPES` | `ticket.decided` (silent failure if missed) |
| `packages/rule-engine/src/evaluate.ts` + `fixtures/harness.ts` | dispatch `ticket.decided`; add `checks/decision.ts`; the close rule and the forged-cause rule in `transition.ts` / `close.ts` |
| `packages/app-core/src/precheck.ts` | the same rules on the client |
| `apps/server/src/permissions/check-permission.ts` | `ticket.decided` (as `field_set`) |
| `packages/app-core/src/views/history-copy.ts` | "Decided: Yes", "Cleared the decision", the `led-to` sentence |
| `packages/mcp-server/src/tools/ticket-tools.ts` `redactedPayload` | the outcome label stays; a hidden `sourceTicketId` is redacted |
| `apps/server/src/notifications/fanout.ts` | explicit no-op arms |
| `apps/server/src/purge/check-purged.ts` | a purged source in a `cause` |
| `packages/sync-client/src/replica/replica.ts` | the replica folds all of it |
| `apps/mobile/src/editor/editor-html.generated.ts` | regenerate (it embeds the domain registry; the lesson from T1's fix commit) |

---

# PART 3 — The Workflow graph

Prefixes: **SH** (sheet), **WG** (workflow graph), **CR** (create, publish), **RN** (renderer). Case sub-block 29.230–29.289.

## 9. Renderer and layout (RN)

### 9.1 What each surface needs

The Workflow graph needs boxes, diamonds, labelled branches and loops with orthogonal routing, on a free 2D camera. The Timeline graph and Home's Timeline need bars on a date axis, packed into rows, with arrows between bars, and up to thousands of items. The two layouts differ (graph layering versus date and packing); the camera, the scene drawing and the input should not.

### 9.2 Approaches

| | A. `@xyflow/react` (React Flow) + a layout lib | B. ELK layered + our own SVG/DOM scene on the shared viewport | C. Sigma (the KG's renderer) |
|---|---|---|---|
| Already a dependency | yes (`app-core/package.json:43`) | `elkjs` is new, lazy-loaded | new in the KG release |
| Diamonds, labelled edges, loops, orthogonal routing | custom nodes and `EdgeLabelRenderer`; edges are bezier/smoothstep, not routed around nodes | ELK routes orthogonally with ports and places edge labels; loops via cycle breaking | WebGL: diamonds, DOM-quality text and labelled orthogonal edges are awkward (spec C draws labels as textures) |
| Our camera (spring, momentum, anchored zoom) | no: its own d3-zoom, a second scroll feel | yes: the shared `ViewportDriver` | yes, but only for graphs |
| A date axis with packed rows, prefetch, thousands of bars | no: nodes are not a time surface, no windowing by range | yes: the same scene draws bars | no |
| Accessibility | DOM nodes | DOM text, SVG paths | canvas, `role="img"` |
| Weight | none new | ELK (about 1.5 MB minified, unverified: the plan measures); in a worker; loaded only when Workflow is opened | KG's own cost |

**Recommendation: B.** One `FlowScene` (SVG paths for edges, DOM for nodes and text) on the shared viewport engine draws all three surfaces; the Workflow graph's layout comes from ELK in a Web Worker; the Timeline surfaces use their own date layout and the packer, and need no ELK. This gives the owner's smoothness rulings ONE motion engine, and it matches the approved mockups, which are absolute-positioned DOM with orthogonal segments.

**Fallback.** If ELK misses a bar in §13 (layout time, bundle, licence — believed EPL-2.0, the first task confirms), the plan stops and asks. The named fallback for the Workflow graph only is A with the layout computed by the same pure analysis (FL-3) and a hand-written layered layout like `workflow-builder/layout.ts`; the Timeline surfaces stay on B either way.

**The seam.** `FlowRenderer` interface: `mount(el, theme)`, `setScene(nodes, edges, positions)`, `setDriver(driver)`, `onPick` / `onHover`, `refreshTheme()`, `destroy()`. Only `packages/flow-graph/src/render/` and `layout/elk.ts` import `elkjs`; a dependency check on the TypeScript program's resolved imports fails otherwise (not a regex: side-effect imports, the lesson from the KG's check). The version is pinned exactly, the version the first task measures.

**Measured first.** The first task of Part 3 measures ELK on a fixture shaped like the mockup flow (13 nodes) and on 60, 150 and 300 nodes, on the desktop and the real phone, against §13, before any scene work.

### 9.3 Layout (WG, Workflow graph)

- ELK `layered`, direction `RIGHT` (landscape) or `DOWN` (portrait), edge routing `ORTHOGONAL`, a fixed `randomSeed`, `considerModelOrder` by flow order (FL-3), cycle breaking by ELK; a Decision's branches use distinct ports (top, right, bottom); edge labels placed by ELK. Node sizes from the mockup: ticket 140 × 64, decision 176 × 108, pills 22 high.
- Positions are computed per view and never saved (the KG's assumption).
- **Stability (mental map):** adding one leaf node to a flow leaves ≥ 90% of existing nodes within 1 px of where they were; otherwise nodes glide to their new place over 240 ms. Layout runs in the worker and the previous layout stays drawn until the new one is ready.
- **Orientation** follows the graph container, not the device: narrower than 40rem is portrait (`ui.css:1059`), else landscape; a phone held sideways is landscape.

## 10. The Graph tab, the Workflow graph, creating steps (SH, WG, CR)

### 10.1 The sheet (SH)

**SH-1.** The sheet's tabs become Details, History, Attachments, **Graph** (`ticket-sheet.tsx:3756-3763`; the tab state `:732` gains `'graph'`). Inside Graph a second `SegmentedControl` (aria-label "Graph views") switches Knowledge | Workflow | Timeline; the choice is remembered per browser (`localStorage`, wrapped in try/catch). If the release has only Knowledge, the control is not drawn.

**SH-2. Width.** While the Graph tab is open the panel is `width: min(1240px, 94vw)`; every other tab stays `min(40rem, 94vw)` (`ui.css:480-481`). The change animates with the sheet's own slide timing (`ui.css:480-488`), and the content under the other tabs does not re-wrap mid-animation (the width is applied with the tab). Full screen still wins (`.gn-sheet--full`, `ui.css:573-579`), and **on the Graph tab the full-screen body column drops its 53.75rem cap** (`ui.css:580`) so the graph uses the window. Below 40rem the sheet is the phone sheet; the Graph tab fills it.

**SH-3. No Start button** in the sheet header (the mockup's was invented).

**SH-4. The tab name.** The tab is "Graph" with an inner Knowledge | Workflow | Timeline switch. The KG release already ships "Graph" with "Knowledge" as the switch's only option (owner ruling 2026-10-03 ~14:26, KG C T9, which amends spec C §1's "Knowledge Graph" tab name); this spec adds the other two options.

**SH-5. Opened from a ticket.** The Workflow view shows THAT ticket's flow, with the ticket highlighted (the mockup's 2.5 px ring). A ticket in no flow shows itself with the Start and End pills and one "+" handle, and the line "This ticket isn't in a flow yet. Add what comes next."

### 10.2 The Workflow graph (WG)

**WG-1. Nodes.** A ticket is a 140 × 64 rounded box: status dot in the category colour (open / active / done tokens), key, assignee initials, title (two lines). A Decision is a diamond with its question text and key. A draft has a dashed border and the tag "Draft" (no key). Start and End are pills on the nodes FL-3 names. A ticket with `waitForAll` on shows a "waits for all" glyph.

**WG-2. Edges.** `leads_to`: solid, 2 px, arrowhead, with a label pill when it has a label (Yes / No / Need more info). `blocks`: dashed, 1.6 px, 60% opacity, a red token, labelled "blocks". A loop edge is drawn around the outside with the same style and the tooltip of AP-6. Colours are tokens in `packages/ui` with contrast pairs in `tokens.test.ts` (edges 3:1, labels 4.5:1), light and dark. `relates` and `duplicates` are not drawn.

**WG-3. Inspector** (a selected node; the right-hand panel on desktop, a bottom card on a phone), from the mockup:
- header: key, type ("Decision"), title, state, assignee, due;
- a plain sentence: "Moves to To do when GN-150 closes. Nobody has to move it." (for a Backlog ticket with incoming links), or the state it is in;
- the **Wait for all incoming** switch (writes `waitForAll`); the helper text "Off: it moves as soon as any ticket that leads here is done. On: it waits for all of them.";
- **Comes after:** the incoming sources; **Leads to:** the outgoing links with their labels (editable: relabel, remove with Undo);
- for a Decision, the **Decide** control;
- **Automatic moves in this flow:** the last five `led-to` transitions ("GN-146 Moved to To do automatically, because GN-145 was closed, 2 Oct 18:04");
- an **Open ticket** button.

**WG-4. Interaction.**
- Click selects; double-click or Enter opens the ticket sheet for that node (in this sheet it re-centres the flow; the trail and Back follow the KG's pattern, spec C §3.5).
- A "+" handle after each node (on hover, focus, and `N` on the selected node) opens the create form (§10.3). On a Decision the form first asks the outcome label.
- Dragging from a node's handle to another node creates a `leads_to` between existing tickets (label asked for a Decision source); on a phone this is the sheet's Links section (spec A §3.1, whose kind Select gains "Leads to").
- Fit, zoom (+ / − / Fit at the bottom right), pan and pinch are the shared engine (VP-2 to VP-9).
- **The accessible list** under the canvas: "This flow, in order", one row per ticket in flow order (FL-3) with the sentence "GN-147 Pitch is approved, after GN-144 (Yes)". It is the keyboard and screen-reader path; each row selects or opens. The canvas is `role="img"` with a summary label.

**WG-5. Live.** Events from the stream update the scene: a promotion shows the node's state change and a brief highlight; new nodes and links animate in over 240 ms. Reduced motion: instant.

**WG-6. Header chips and the Publish banner** (from the mockup): "13 tickets in this flow", `Leads to 17`, `Blocks 1`, and when drafts exist "3 drafts in this flow. Only you can see them. Publishing makes every draft a Backlog ticket." with the **Publish flow** button.

### 10.3 Creating steps and Publish flow (CR)

**CR-1. The form** (the mockup's "New draft after GN-150"): Title; Type (Task | Decision); Estimate (days); the helper "Starts when GN-150 is done, unless you give it dates."; Cancel; **Create draft**. Optional Start / Due. On Create the new draft appears with a dashed border after the source and a `leads_to` from the source to it (the label from the form when the source is a Decision).

**CR-2. Always a draft.** A ticket created in either graph is a draft (spec 1): private to its author, with no key, shown as "Draft". The graph never creates a published ticket.

**CR-3. Publish flow.**
- One action publishes every draft in the flow at once, all-or-nothing, in one transaction: either every draft gets its key, becomes a Backlog ticket and its links become public, or nothing changes and the person is told why.
- **Key order = flow order** (FL-3): the draft earliest in the topological order gets the next key. The ready-set tie-break (explicit sort day, then ULID) makes it reproducible. The Drafts spec assigns the keys; this spec fixes the order (§15).
- After a publish, each published ticket is evaluated for promotion (AP-4), so a draft whose source is already done is promoted at once.
- The button is disabled with a reason when the person is not the author of every draft in the flow, or a draft's parent or type is no longer valid; the refusal names the draft.

**CR-4. A discarded draft** takes its links with it (spec 1 owns the rule); the graph removes the node and its edges. Undo while the toast shows is spec 1's.

---

# PART 4 — The Timeline graph and Home's Timeline

Prefixes: **TG** (Timeline graph), **HM** (Home). Case sub-block 29.290–29.349.

## 11. The Timeline graph (TG)

**TG-1. One graph.** The Timeline view is the Workflow graph laid on a date axis: the same nodes, the same `leads_to` arrows (the edges leave a bar's end and enter the next bar's start), the same inspector, the same create form and Publish banner. Planning goes workflow first; the timeline then consolidates.

**TG-2. Layout.** X is the day (the shared viewport, VP). Items are packed into rows (PK-1 to PK-6). A ticket is a bar `[start, end]`; a Decision is a diamond on its end day. A today line (an IST day, injected, redrawn at IST midnight) crosses all rows. The header shows week labels ("W 28 Sep") or day/month labels by scale (VP-6).

**TG-3. What a bar is** (live, one graph):

| Ticket state | Planned vs actual OFF (default) | ON |
|---|---|---|
| not started | the planned bar, light fill (outline style) | the same |
| started, not finished | a solid bar from the actual start day to today, growing | the solid bar, plus the planned bar as an outline behind it |
| finished | a solid bar from the actual start day to the actual end day | the same, plus the planned outline |
| undated and unstarted | in the tray | in the tray |

The toggle is a labelled switch, "Planned vs actual", off by default, and can be turned on at any time; it is remembered per browser (try/catch, a blocked store gives off). Turning it on or off never moves a row (PK-3).

**TG-4. Chaining shows.** A successor whose dates are chained begins the day after its predecessor's end (PL-2); finishing a predecessor early or late moves its successors' bars on the next render (PL-1, PL-5), with the glide of PK-6. The inspector says where a date comes from: "Dates chained from GN-150", "Explicit dates", "Starts before GN-150 ends".

**TG-5. Edge routing** (`packages/viewport/src/route.ts`, pure): an arrow leaves the source bar's end anchor, runs on axis-aligned segments only, and enters the target bar's start anchor from the left (landscape) or from above (portrait) with the arrowhead on the anchor. It never crosses a bar other than its two ends in the fixtures; it takes a vertical run in the gutter just before the target (at `targetStart − 14 px`), or just after the source end when the target starts before the source ends (an explicit overlap), and a loop runs outside the bars to the right (landscape). The route is deterministic. A label pill sits on the longest horizontal segment.

**TG-6. The tray** ("Not on the timeline yet"): a strip at the foot of the graph listing unscheduled tickets with the reason and one action each: "Add dates" or "Add an estimate" (opening the ticket's sheet at that field). Dropping a tray item on the axis is out of scope.

**TG-7. Phones.** Time runs down, the same packing in columns (PK-7). Selecting a bar opens the bottom card; the toggle, Today and zoom sit in the bar; the tray is a bottom disclosure.

**TG-8. Windowing.** In the ticket sheet the Timeline view loads the flow (≤ 300 tickets) whole and needs no range fetch; PR-0 to PR-7 apply to Home's Timeline and to nothing smaller than a flow's own render window (VP, PR-5).

## 12. Home's Timeline (HM)

**HM-1. The switch.** Home (spec E §2.2) gains a **Knowledge | Timeline** segmented control (a radio group, aria-label "Home views") above the graph, remembered per browser. The six numbers stay.

**HM-2. Scope.** The Timeline uses spec C's scope pickers (Workspaces multi-select, default the current one; Projects multi-select, default all; C §3.5) and a **Mine | Everyone** switch, default Mine: tickets assigned to the viewer or where the viewer collaborates. The Home mockup draws "Ama's tickets in the two picked projects". Counts and the lighting of numbers (spec E §2.3) keep their single-workspace meaning; the "lit" ids dim non-matching bars on the Timeline the way they dim graph items (25%).

**HM-3. Lanes.** One lane per project (workspace-prefixed when several workspaces are picked), each with a 34 px heading, packing its own bars (PK-5); row height 40 px, 24 px per day at the default zoom (the mockup). Lanes are virtualised vertically as well as in time.

**HM-4. Arrows.** To bound the cost, arrows are drawn only for the SELECTED ticket's flow (click a bar: its flow's arrows appear and the other bars dim to 32%); a flow lives in one workspace, so there are no cross-workspace arrows.

**HM-5. This is the hardest case**, so the bars in §13 are set for it: up to 10,000 index entries, up to 1,200 mounted bars on a desktop and 600 on a phone.

**HM-6. Phones.** Portrait (time runs down), one lane per project as columns (PK-7), horizontal pan across lanes. (Not in the mockups; Decisions list, item 10.)

**HM-7. States.** Loading: the index skeleton (lane headings and ghost bars at the packed rows' shapes, no layout shift, the smoothness placeholder rules). Empty: "Nothing scheduled in these projects" with the tray count. Error: "Couldn't load the timeline. Retry", with whatever is drawn kept. A scope with a workspace the viewer cannot read drops it silently.

## 13. Bars (set by this spec, measured in each Part's first task, not assumed)

Where each is measured: the pan, zoom, preload, packing and latency bars in **Part 1's T1** (the stress harness, desktop and real phone); the ELK bars in **Part 3's T1**; the three endpoint bars in **Part 4's T1** on a prod-sized copy. A bar that fails stops the plan and asks the owner.

The desktop reference is an M2 Pro class machine (the KG's); the phone is a real mid-range phone the plan names, measured on the device (not in an emulator).

| Bar | Target |
|---|---|
| Pan, desktop: Home Timeline at 10,000 index entries, ≤ 1,200 mounted bars | ≥ 60 fps, worst frame ≤ 20 ms |
| Pan, phone: same scope, ≤ 600 mounted bars | ≥ 30 fps, worst frame ≤ 50 ms |
| Pan, desktop: a flow of 300 bars/nodes (Timeline or Workflow) | ≥ 60 fps, worst frame ≤ 16.7 ms |
| Pan, phone: a flow of 100 | ≥ 30 fps, worst frame ≤ 50 ms |
| The existing project Timeline at 2,000 dated tickets | the desktop and phone numbers above |
| Scroll stop → details shown, inside the preloaded range | 0 ms (the same frame) |
| Scroll stop → details shown, beyond it | p95 ≤ 600 ms desktop, ≤ 900 ms phone |
| A fast pan across 10 viewports at one viewport per second, fetch latency = the server p95 | zero frames with an empty band |
| Zoom anchor drift | ≤ 0.5 px on every frame |
| Packing 10,000 intervals | ≤ 20 ms |
| ELK layout, 150 nodes / 200 edges (worker) | p95 ≤ 250 ms desktop; 60 nodes ≤ 700 ms phone; no main-thread task over 50 ms |
| Adding one leaf to a flow | ≥ 90% of nodes stay within 1 px |
| `GET /v1/timeline/index` at 10,000 intervals | p95 ≤ 400 ms |
| `GET /v1/timeline/chunk` per 200-item page | p95 ≤ 150 ms (the KG's per-ring budget) |
| `GET …/flow` at 300 tickets | p95 ≤ 120 ms (spec E's budget class) |
| Page `scrollY` after wheel and touch pans | unchanged |
| First-load JS on routes that do not open a graph | no increase (ELK is lazy and in a worker) |

If the index query misses its bar, the fallback is a rebuildable projection `proj_ticket_plan (ticket_id, workspace_id, plan_start, plan_end, basis)` recomputed per flow component on the events that change a plan (PL), with an index on `(workspace_id, plan_start, plan_end)`. The plan decides after the first task's measurement on a prod-sized copy; this spec does not build it unless the bar fails. If a bar fails and cannot be fixed in the adapter, the plan stops and asks the owner.

---

# PART 5 — MCP

Prefix: **MC**. Case sub-block 29.350–29.389. The five new tools go in a new module `flow` in `TOOL_NAMES_BY_MODULE` (`packages/mcp-server/test/fixtures/tool-names.ts`) and in `allTools` (`register.ts:35-49`); `link_tickets` (spec A) and `create_ticket` / `update_ticket` are extended. The registry pins (14.80 / 14.81 and `register.test.ts`) move by five names at landing; their behaviour cases are in this file (29.350–29.389), not in the 14.x block reserved for the MCP sweep.

**Rule D2 for every tool below:** it is visible in the app (History and the graph), attributed (the actor, with "via Claude" for `origin:'mcp'`), and removable by a member (the inverse is in the table).

## 14. The tools

| Tool | Input | Does | D2: removable by |
|---|---|---|---|
| `link_tickets` (spec A, extended) | `{ workspaceId, ticketId, targetId, kind: 'blocks'\|'relates'\|'duplicates'\|'leads_to', action: 'add'\|'remove'\|'relabel', label? }` | `leads_to` accepts `label` (required when the source is a Decision). `relabel` is one batch (`link_removed`, `link_added`). The rule text passes through as `refused by <rule>: <reason>` (`submit.ts:21`). `workspaceId` is added like every write tool (`write-tools.ts:35`). | the Links section and the graph's inspector; `remove` |
| `resolve_decision` | `{ workspaceId, ticketId, outcome: string \| null, close?: boolean }` (default `close: true`) | Writes `ticket.decided`. With `close` and a non-null outcome it then moves the ticket to a terminal state in the same batch: if exactly one terminal state is reachable from the current state by one declared edge it uses it; if none or several, it records the outcome only and answers with the candidate states (call `transition_ticket`). Promotions follow within seconds and appear in `get_flow`. | `outcome: null` clears it; the Decide control |
| `set_wait_for_all` | `{ workspaceId, ticketId, value: boolean }` | `ticket.field_set {fieldId:'waitForAll'}` (`true`, or `null` for off). `update_ticket` refuses it through `fields` (`ticket-tools.ts:82`), hence the tool. | the switch in the inspector |
| `get_flow` | `{ workspaceId, ticketId }` | Read. The ticket's flow: `{ flowId, truncated, start: [id], end: [id], nodes: [{id, key\|null, draft, title, kind, state: {id,name,category}, assigneeId, waitForAll, estimate, outcome, planned: {start,end,basis}\|null, actual: {start,end}\|null, tray: reason\|null}], edges: [{kind, from, to, label, loop}], autoMoves: [{ticketId, at, becauseTicketId\|null}], draftCount }`. Only what the caller can see; the caller's own drafts are included, others' never. | read only |
| `publish_flow` | `{ workspaceId, ticketId, confirm?: boolean }` | Publishes every draft in the ticket's flow (spec 1's all-or-nothing primitive, D-4 in §15). Without `confirm: true` it returns a preview — the drafts, the order, and the keys they would take — and changes nothing (the `delete_ticket` pattern, `ticket-tools.ts:119-134`), because keys are counted and never reused. | not undoable (a published ticket is deleted like any other); stated in the description |
| `get_timeline` | `{ workspaceId \| workspaceIds, projectIds?, mine?: boolean, from?, to?, includeTray?: boolean, limit?: number, cursor? }` | Read. `{ today, items: [{id, key\|null, title, kind, lane, planned, actual, basis, state, flowId}], flows: [{id, nodes, edges}], tray: [{id, key, title, reason}], nextCursor }`. Defaults: `from` = today − 14 days, `to` = today + 60 days, `limit` ≤ 500; planning uses the same shared planner as the app. | read only |
| `create_ticket`, `update_ticket` (extended) | `estimate?: number \| null` (whole days) | `estimate` rides `ticket.created.estimate` / `ticket.field_set`. `typeId: 'decision'` works through `create_ticket` unchanged. | `update_ticket {estimate: null}` |

`get_ticket` (spec A §4) also lists `leads_to` links with their `label` in `links`, visible ends only. `list_ticket_types` lists the Decision type.

## 15. Needs from the Drafts spec (`2026-10-03-drafts-design.md`)

This spec cannot be built until these hold in spec 1 (the plan writer reconciles names):

| # | Need | Used by |
|---|---|---|
| D-1 | A draft is an entity with an id and NO key; it shows "Draft". | WG-1, PK-4 |
| D-2 | Creating a draft takes `typeId`, `projectId`, `parentId?`, `title`, `estimate?`, `startDate?`, `dueDate?`. | CR-1 |
| D-3 | **A link that touches a draft is private to the draft's author and is not narrated in History, MCP, notifications or the Knowledge Graph.** Spec A files `link_added` on the SOURCE's stream (typed-links §2.2) and narrates it in History and MCP. A published ticket that leads to a draft would leak the draft ("a ticket you can't see") from the published ticket's history. So the link must live in draft-private storage until both ends are published. | LK-3.4, CR-3 |
| D-4 | A **transactional publish of an ordered set of drafts**: every key assigned in the given order, every draft's links made public, all or nothing. | CR-3, `publish_flow` |
| D-5 | Publishing emits the committed events that AP-4 lists ("a draft published"), so promotion is evaluated. | AP-4 |
| D-6 | Discarding a draft removes the links touching it. | CR-4 |
| D-7 | A draft cannot be decided, transitioned, promoted, linked from another author, or counted in any read except its author's. | AP-3, FL-1 |
| D-8 | Reads of drafts for the flow and timeline endpoints: "the viewer's own drafts in a workspace" as a query helper. | `get_flow`, TG |

---

## 16. Testing and proof

### 16.1 Case block

**Features.md §26 "Workflow and Timeline graphs"** ↔ **`test-cases/29-workflow-timeline-graphs.md`**, ids 3-digit padded `29.001`–`29.399` (the fixed block). On 2026-10-03 every live release, task and docs tip was grepped (`git for-each-ref refs/remotes/origin`): none has Features §25 or §26, and none has `test-cases/28-*` or `29-*` (§25 / file 28 are Drafts'; §24 / file 27 are the Knowledge Graph's). The plan re-greps every live tip before allocating. Each case's test carries its id.

| Sub-block | Part / subject |
|---|---|
| 29.001–29.049 | Part 1: viewport engine (VP), preloading (PR) |
| 29.050–29.079 | Part 1: packing and routing (PK) |
| 29.080–29.119 | Part 1: the existing Timeline view (TV), including the retired cases |
| 29.120–29.149 | Part 2: links and Decision (LK, DC) |
| 29.150–29.179 | Part 2: estimate, wait-for-all, actual dates (ES) |
| 29.180–29.199 | Part 2: flow analysis (FL) and planning (PL) |
| 29.200–29.229 | Part 2: auto-promotion (AP) |
| 29.230–29.289 | Part 3: sheet, Workflow graph, create and publish (SH, WG, CR, RN) |
| 29.290–29.349 | Part 4: Timeline graph and Home (TG, HM) |
| 29.350–29.389 | Part 5: MCP (MC) |
| 29.390–29.399 | reserved for follow-ups |

### 16.2 Cases (in order, RED first; each with its control in the same `it`)

**Part 1.**
1. **Spring and momentum** settle (τ = 85 ms; momentum τm = 240 ms) with the dt clamp at 100 ms; the control is a clamp of 1 s that would overshoot.
2. **Anchored zoom:** the anchor day keeps its x within 0.5 px over a zoom sweep; control: zooming about the centre moves the pointer's day.
3. **Range planner:** the loaded range for a given offset and velocity matches PR-1 and PR-2 exactly (ahead = `max(V, |v̂| × 1.5 s)`); reversal drops low-priority fetches; idle widening stops at the caps and evicts the farthest chunk first, never `[visible − V, visible + V]`.
4. **`RangeCache`:** a live patch changes one entry without a refetch; a stale chunk stays drawn until its replacement lands; a return to a scope reuses its chunks.
5. **Packer:** rows equal the maximum overlap on any day over 200 random seeds (PK-2); adjacent days share a row; ties are by key then id; footprint rules (PK-4); the planned/actual hull never re-packs on toggle (PK-3); a draft sorts after keyed items on the same start; stability — adding a far-future item changes no existing row.
6. **Router:** axis-aligned, anchors correct, never through a third bar on the fixtures, deterministic (TG-5).
7. **Browser harness** (`packages/flow-graph-browser`, a private Playwright package on its own port, following `packages/knowledge-graph-browser` and `packages/workflow-canvas-browser`): wheel, drag, touch and keyboard pans; momentum; Today glides; the page `scrollY` is unchanged; a 10-viewport fast pan shows no empty band (PR-7) with a fake range source at the server p95 latency; reduced motion is instant. Headless Chrome renders in software, so each test waits for the surface to settle rather than for a timer.
8. **The existing view (TV):** claims semantics unchanged (a bar needs both claims, five side reasons, epic lanes, provenance); packing per epic lane; keys on bars; no Earlier/Later; clock-free scan green; retired cases marked 🚫 with the reason; 20.271 narrowed to Today.

**Part 2.**
9. **Domain:** `leads_to` and `label` payloads (label refused on other kinds, blank, 61 characters); `ticket.decided`; `cause` union; reserved-actor id against `ULID_REGEX` with a negative control.
10. **Engine:** LK-3 rules one by one (a Decision's unlabeled branch refused, duplicate label refused, a loop accepted, a reverse `blocks` still refused); DC-4 and DC-5 (`decision.outcome-required` with the control of a Decision with no branches finishing freely); the forged-cause guard.
11. **Reducer:** `startedAt` / `endedAt` for each path (born active; open → active; open → terminal; terminal → active clears `endedAt`; reopen leaves it); a rebuild equals the live table (`tools/verify-projections.ts`).
12. **Flow analysis:** Start/End, back edges, flow order on a diamond, a loop, two starts and a pure cycle.
13. **Planner:** every row of PL-3; chaining from an actual end; `any` versus `waitForAll`; a loop edge excluded; `startsBeforePredecessor`; explicit wins.
14. **Promotion:** every trigger of AP-4 and the non-trigger (a manual Send to backlog sticks); `any` / `waitForAll`; the Decision branch (the chosen label only); a trashed source; a custom workflow whose first state is not named "To do"; a promotion refused harmlessly the second time; the sweep promotes what a dropped listener missed; a loop edge into a finished ticket does nothing.
15. **Visibility and flow read:** a hidden ticket is a hole with no count; the control is a viewer with access; the cap and `truncated`.
16. **Census:** a test lists every `ticket.*` registration and asserts each list in §8.4.
17. **Pre-flight:** a test of the shadow check (`estimate` / `waitForAll` as custom field ids).

**Parts 3–4.**
18. **Layout** (ELK fixture): the mockup's 13-node flow lays out with no overlap; a loop is routed; the ports of a Decision are distinct; adding a leaf keeps ≥ 90% of nodes; portrait versus landscape.
19. **App:** the Graph tab and its width on desktop, full screen without the cap, and the phone sheet; the Workflow view for a ticket in no flow; the inspector fields; Decide; the wait-for-all switch; "+" creates a draft with a link; Publish flow (order, all-or-nothing, a refusal naming the draft).
20. **Timeline graph:** the toggle (off by default; on shows outlines; neither moves a row); the tray reasons and actions; the today line; a finish moves successors live; portrait columns.
21. **Home:** the switch; Mine and Everyone; per-project lanes; arrows only for the selected flow; lit ids dim bars; the fog of a scope that drops a workspace.
22. **Bars (§13)** as measured results on the desktop and the real phone, recorded in the plan's task notes.

**Part 5.**
23. **MCP:** each tool adds, refuses (the rule text passes through), and is removable (D2); `publish_flow` previews without `confirm`; `resolve_decision` with one, none and several terminal candidates; `get_timeline` limits; `get_flow` shows only visible ends and only the caller's drafts.

### 16.3 Gate

Part 1 adds a browser package, which adds tasks to the gate's count; the plan updates the gate's expected task count in the same change (the KG's rule). The plan names the LOCAL run it quotes, because CI does not run on a dev PR (the repo's rules).

## 17. Files (expected)

- `packages/viewport/` (new): `src/{spring,momentum,rubber-band,anchored-zoom,range-plan,range-cache,pack,route}.ts`, `src/dom/{scroll-adapter,camera-adapter}.ts`, tests.
- `packages/flow-graph/` (new): `FlowScene`, `render/`, `layout/elk.ts` (the only `elkjs` importer), the React wrappers; `packages/flow-graph-browser/` (new, private).
- `packages/domain/src/`: `events/ticket-events.ts`, `vocabulary.ts`, `ticket-state.ts`, `entity-state.ts`, `workflow.ts` (cause), `ticket-types.ts` (seed, `estimate`, `waitForAll`, `DECISION_TYPE_ID`), `system-actors.ts`, `flow/{analysis,plan,promotion}.ts`.
- `packages/rule-engine/src/`: `checks/decision.ts`, `checks/close.ts`, `transition.ts`, `evaluate.ts`, `checks/links.ts` (spec A), `fixtures/harness.ts`.
- `apps/server/`: migrations (`proj_ticket_links` widen + `label`; `proj_tickets` `started_at`, `ended_at`, `outcome`), `projections/{tickets,ticket-links}.ts`, `flow/{promote,sweep}.ts`, `routes/timeline.ts`, the flow route, `ops/backup-daemon-main.ts`, `app.ts`, `workspaces/bootstrap-workspace.ts`, the Decision backfill job.
- `packages/app-core/src/`: `views/ticket-sheet.tsx` (tab, width, Decide), `timeline/{timeline-model,timeline-view}.tsx` (Part 1), `data-source.ts`, `online/online-data-source.ts`, `replica/replica-data-source.ts`, `views/history-copy.ts`, `precheck.ts`, `workflow-builder/fields.ts`, `workflow-builder/ticket-types/icons.tsx`, a new `views/ticket-links-section.tsx` extension (spec A).
- `apps/web/`: `src/home/*` (Home's switch and Timeline), the project page.
- `packages/ui/src/ui.css` (sheet width, Graph tab, timeline grid retired) and `tokens.ts` / `tokens.test.ts`.
- `packages/mcp-server/src/tools/{write-tools,ticket-tools,read-tools,flow-tools}.ts`, `test/fixtures/tool-names.ts`.
- `Features.md` §26 (and the Timeline bullets edited), `test-cases/29-workflow-timeline-graphs.md`, the retired cases in 11, 13 and 20.

## 18. Out of scope

- Notifications for auto-moves, flow changes or decisions.
- Dragging a tray item onto the axis to date it; dragging bars to change dates.
- Critical path, resource levelling, working-day calendars or holidays.
- Saved node positions or free node dragging.
- Cross-workspace flows or arrows.
- Custom Decision types, or more than one `leads_to` per ordered pair.
- Reopening a finished step because a loop points at it.
- Drawing `relates` and `duplicates` on these graphs.
- Counts across all workspaces on Home (spec E).
- Changing what the List, Board or Calendar read; changing the project page's list walk.

## 19. Risks

- **ELK is the heaviest new dependency** (size, licence, worker setup). Mitigated by the lazy worker load, the first-task measurement, the pinned version, the seam, and the named fallback.
- **The index endpoint on a large scope.** Planning needs whole flow components, so range filtering in SQL is not enough. The bar and the projection fallback are in §13.
- **Built-in id shadowing** breaks a type's read (ES-3). The pre-flight is a hard gate.
- **Packing depends on zoom** (PK-4), so a zoom re-packs. The glide and the precomputed neighbours keep it from reading as a jump; if it still jars, the alternative is to draw the outside key on its own label track (Decisions list, item 9).
- **The listener is best-effort,** so the sweep is part of the feature, not an extra.
- **Publish flow depends on a transactional primitive in spec 1** (D-4). If spec 1 cannot make publish atomic, `publish_flow` and the button must say "partial" and this spec's CR-3 changes.
- **Retiring paging** touches pinned cases in three catalogues; the plan greps every pin before deleting the grid.

## 20. Open questions

Code-forced questions, each with the line that forces it. The preference calls are in the Decisions list at the top.

1. **Tab name — RESOLVED.** The owner ruled 2026-10-03 ~14:26 (KG C T9) that the KG release itself names the tab "Graph" with a Knowledge-only switch; see SH-4.
2. **Decision close rule.** DC-5 refuses finishing a Decision that has branches and no outcome (`checks/close.ts:60`, `transition.ts:152-168`). Without it a Decision closed from the board silently stalls its flow. Alternative: allow it and warn on the diamond.
3. **Loop back to a finished step.** AP-6 leaves it finished, because the engine refuses every move on a closed ticket (`transition.ts:73-76`) and a reopen would be a second system act. Alternative: a satisfied loop edge reopens its target.
4. **Notifying an auto-moved ticket's assignee.** None in this spec. The fan-out acts on assignment and creation only (`fanout.ts:354`); a "Ready to start" notification is a new notification kind.
5. **Which "closed" satisfies a source.** The owner's word is "closed"; the code has two meanings, the terminal category and the explicit `closed` flag that a person or the sweep sets days later (`sweep.ts:9-12`, `close.ts:60`). Decision 1 uses the terminal category. Confirm.
6. **A workspace that already has a custom type with id `decision`.** DC-3 adopts it as the Decision type; it may have another rank or fields, and its rank would be locked on the next definition (`checks/ticket-type.ts:84-94`). Part 2's pre-flight reads prod for any such type before the release.
7. **Draft privacy versus spec A's stream rule.** Spec A files `link_added` on the SOURCE's stream and narrates it in History and MCP (`typed-links-design.md` §2.2, §2.6), so a published ticket that leads to a draft would expose the draft. Recommendation (D-3): draft-side storage until publish. The Drafts spec decides.
8. **A workflow whose initial state is terminal.** `validateWorkflowDef` checks only `creatable` on it (`validate-workflow.ts:83-100`), and a promotion would finish the ticket; AP-1 skips such a workflow. Should the validator refuse it?
9. **Home's counts are one workspace** (`home-design.md:54`, `:117`: "Counts across all workspaces" is out of scope) while the Timeline can span several workspaces (spec C's scope). HM-2 keeps the counts and the lighting single-workspace. Confirm.
10. **The shared motion code may not exist on the tip.** The KG plans `engine/{camera,wheel,fit,glide}.ts` (`docs/superpowers/plans/2026-10-03-knowledge-graph-view.md:112` on `origin/docs/kg-plans-cd`); `packages/knowledge-graph` on `origin/task/kg-c-t1-measure` has only `render/`. If the KG release ships them differently, Part 1's T2 (the lift) is a write. The plan writer reads the KG's tip first.
11. **The prod shadow check for `estimate` and `waitForAll`** (ES-3) decides whether a rename migration is needed; `ticket-types.ts:113-118` throws at read, so this is a gate, not a preference.
