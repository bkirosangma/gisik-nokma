# The Timeline graph and Home's Timeline (Workflow and Timeline graphs, Part 4) Implementation Plan

> **Release branch (owner, 2026-10-04):** `release/workflow-graph`, cut from `origin/release/knowledge-graph` at f9e0cd18. Every task branch is cut from `origin/release/workflow-graph` and every PR goes `--base release/workflow-graph`. The Knowledge Graph release merges to `main` first; `main` is then merged INTO `release/workflow-graph`, never rebased.

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. In the gisik orchestration, every task is ONE lane session. Follow `gisik-nokma-lanes/STEPS-common-2026-10-03.md`: numbered steps, each ending with a pushed commit + `CHECKPOINT task/<branch> <sha40> step <n>/<N>` + `HANDOFF-<branch>.md`; the sweep list + your own mutation pass before DONE. UI tasks (T2, T4, T5, T6, T7) name **`frontend-design`** in the lane prompt and measure real geometry on the primary dev stack (rule #23: no lane runs its own Docker stack).

**Goal:** the Timeline graph (the Workflow graph laid on a date axis, with work periods, passes, "Not taken", pruned ghosts, the paper pin, ✓ / ▶ marks, curved loop arrows and an undated tray) in the ticket sheet's Graph tab, and Home's Timeline: one scope (workspaces, projects, Me | Everyone) that drives both Home's six numbers and a continuously scrolling, row-packed, preloaded timeline over up to 10,000 intervals.

**Architecture:**
- **Server.** Four reads on one shared core: `computeScope` loads the viewer's visible tickets of each readable workspace in scope plus every visible `leads_to` endpoint, builds the flow components, runs Part 2's `planFlow` per component and turns plans + work periods into index entries with the pure `segmentsFor`. `readTimelineIndex`, `readTimelineChunk`, `readTimelineTray` and `readHomeSummary` slice that core. The summary generalises KG Home's `readHome` (same code path, so a one-workspace scope equals `/v1/workspaces/:id/home`). T1 measures all four BEFORE any route or UI exists.
- **Client.** `DataSource.query` gains `getTimelineIndex / getTimelineChunk / getTimelineTray / getHomeSummary` (the replica answers with a named gap). A pure `ScopeCache` (over Part 1's `RangeCache`) holds the index and chunks per scope; one subscription PER workspace in scope feeds a debounced reload; input events (dates, estimate, wait-for-all, links, title, assignee) patch locally and re-plan with `planFlow`, state-changing events refetch in the background (stale-while-revalidate).
- **Drawing.** A pure scene builder turns flow nodes (the sheet) or index entries (Home) into a **draw list** (`DrawBar`, `DrawDiamond`, `DrawConnector`, `DrawEdge`, `DrawLoop`, `DrawStrip`…); one React painter mounts only the primitives inside `[visible − V, visible + V]` on Part 1's `ScrollAdapter`. The sheet's Timeline view and Home's Timeline are the same scene builder and painter with different inputs.

**Tech stack:** TypeScript, zod 3, Postgres (read-only in this plan: no migration), Fastify, React 19, Next 15 App Router (Home), vitest 3 (node + jsdom), Playwright (Part 1's `packages/flow-graph-browser`).

**Spec:** `docs/superpowers/specs/2026-10-03-workflow-timeline-graphs-design.md`, **Part 4 (§11–13)**; read Parts 1–3 for context. Also `docs/superpowers/specs/2026-10-03-home-design.md` (spec E, which the KG release ships and this plan extends) and `docs/superpowers/specs/2026-10-03-drafts-design.md` §3.6 / §10 / §13. Code was read at `origin/release/knowledge-graph` @ `ec72d1f8`; every `file:line` below was read there. The KG release's Home code, Part 1–3 and Drafts are NOT on that tip: they are cited from their plans in the "Consumed contract" table, and **the landed code governs** (every task's Step 0 re-reads the names it uses).

**No new package.** This plan adds files inside existing packages only (`packages/domain`, `packages/app-core`, `packages/ui`, `apps/server`, `apps/web`, Part 1's `packages/flow-graph-browser`). The gate's task count (`scripts/ctl/verbs/gate.sh:56`, 36 or 41) does not change, and no task here touches `gate.sh`, `lib.test.sh`, the README gate line or the Features gate bullet. The one `package.json` edit is `packages/flow-graph-browser` gaining a `workspace:*` dependency on `@gisik-nokma/app-core` (T2), which adds no script and no gate task.

**Owner is away.** Three steps stop and report instead of deciding (each says STOP): T1 Step 7 (a server bar misses), T2 Step 6 (the real phone), T2 Step 7 (a pan bar misses). Everything else proceeds autonomously.

| Needs | From | Used by |
|---|---|---|
| Viewport engine, row packing, router, range planner and cache, zoom switch, axis header, weekend token | Part 1 | T2, T4–T7 |
| Model: `leads_to`, Decision, estimate, periods, passes, `FlowNode` / `flowNodeOf`, `planFlow`, `analyzeFlow` | Part 2 | T1, T4–T6 |
| Graph tab, inner switch, Workflow inspector, create form, Publish banner, `readFlowView` / `GET …/flow` / `getFlow`, FlowScene | Part 3 | T1 (measure), T5 |
| `listMyDrafts`, `draft_author_id` | Drafts plan | T1, T5 |
| `readHome`, `HomeResponse`, `HomeScreen`, tiles, `useHomeHighlight`, `HomeGraph` | KG Home plan (`2026-10-03-home.md`) | T1, T3, T7 |

**Order:** T1 ∥ T2 → T3 (after T1) → T4 (after T3 and T2's verdict) → T5 → T6 → T7. T2 and T7 need `NEEDS: browser`; T1 needs `NEEDS: db`.

## Global Constraints

**Release and identity**
- **Release:** `release/workflow-graph`, cut 2026-10-04 from `origin/release/knowledge-graph` at f9e0cd18 (owner; the KG release merges to `main` first, then `main` is merged INTO it, never rebased). Every task branch is `task/wtg4-<slug>` cut from `origin/release/workflow-graph`, and its PR has `--base release/workflow-graph`. Never `main`.
- **Land with** `ctl gate <sha> --base release/workflow-graph` then `ctl land <pr> --base release/workflow-graph`, with the same `--repo` for both.
- **Plan id** (ledger and `check:tasks`): `wtg-part4-timeline-graph-home` (the file stem after the date, `scripts/check-task-ledger.mjs:263`).
- **Prerequisites for T1:** Part 1's first task has landed (it creates `Features.md` §26 and `test-cases/29-workflow-timeline-graphs.md`), Part 2's model is on the branch, and the KG release's Home (spec E T1–T4) is on the branch.

**Catalogue**
- Features.md **§26 "Workflow and Timeline graphs"** ↔ `test-cases/29-workflow-timeline-graphs.md`. This plan owns **`29.290`–`29.349`** and tiles them per task: **T1 29.290–29.299 · T2 29.300–29.303 · T3 29.304–29.307 · T4 29.308–29.312 · T5 29.313–29.326 · T6 29.327–29.334 · T7 29.335–29.349**. (Spec §16.1 labels 29.290–29.329 "Timeline graph and Home's Timeline" and 29.330–29.349 "periods, passes, ghosts, pin, Home's one scope"; its TG-12 to TG-15 and HM-8 sit in neither label. The ids are the spec's; the per-task split is this plan's and every id is used once.)
- Case lines are id LINES: `- ❌ **29.290 — …**` (`test-cases/18-notes.md:23`). Each starts ❌ and flips ✅ in the same commit as its test. Test names or comments carry the id. `pnpm check:citations` needs every ✅ id in a test.
- **Before allocating,** re-grep every live tip: `for b in $(git for-each-ref refs/remotes/origin --format='%(refname:short)'); do git grep -l '29\.290\|## 26\.' "${b}" -- Features.md test-cases >/dev/null 2>&1 && echo "$b"; done`. Expect only the release branch Part 1 opened, and any line hit must be Part 1's own heading. Part 1 T1 seeds ONE Part 4 anchor in each file (`<!-- WTG4 -->` in file 29, `<!-- WTG4 bullets -->` in Features §26). T1 Step 0 writes the Part 4 sub-section and one anchor per task directly below them in BOTH files (efficiency rule #21), keeping the Part anchor lines, so parallel tasks never append at one line.
- **Ledger:** rows at the end of this plan, status `todo`.

**Numbers, copied from the spec (§11–13)**
- Index cap **10,000** entries per scope; a flow shows at most **300** tickets; a chunk is **28 days** aligned to a Monday; chunk and tray pages are **200**, keyset on `ticket_id > cursor`.
- Bars (§13): pan desktop Home at 10,000 index entries / ≤ 1,200 mounted bars **≥ 60 fps, worst frame ≤ 20 ms**; pan phone ≤ 600 mounted bars **≥ 30 fps, worst ≤ 50 ms**; flow of 300 desktop ≥ 60 fps worst ≤ 16.7 ms; flow of 100 phone ≥ 30 fps worst ≤ 50 ms; scroll stop → details **0 ms** inside the preloaded range, p95 ≤ 600 ms desktop / ≤ 900 ms phone beyond it; a fast pan across 10 viewports at one viewport per second: **zero empty frames**; zoom anchor drift ≤ 0.5 px; packing 10,000 intervals ≤ 20 ms; `GET /v1/timeline/index` at 10,000 intervals **p95 ≤ 400 ms**; `…/chunk` per 200-item page **p95 ≤ 150 ms**; `GET …/flow` at 300 tickets **p95 ≤ 120 ms**; `GET /v1/home/summary` over a three-workspace scope **p95 ≤ 200 ms**; page `scrollY` unchanged after wheel and touch pans; first-load JS on routes that open no graph: no increase.
- Geometry: bar **28 px** tall; Home lane heading **34 px**, row pitch **40 px**, **24 px per day** at the default zoom; a **long bar is 150 px or more** and shows the title on a second line (11 px text, 12 px line height, ellipsised); a portrait column is **112 px**; the paper pin is **12 px**, 6 px in from the bar's end, or after the key (+14 px to `labelPx`) on a short bar; the panel is `height: 100%` of the space under its toolbar with a **320 px** minimum; zoom 4–96 px/day, presets Day 56 / Week 24 / Month 8.
- Today line: an IST day, injected, redrawn at IST midnight. Ghost and Not-taken fills are a pale fill with a dashed border, **never reduced opacity**, text ≥ 4.5:1. Bar fill and mark ≥ 3:1 against the canvas.

**Copy rules (exact strings; no spaced em dash in any new string literal: the ui-copy scan sweeps `packages/domain/src`, `packages/mcp-server/src` and, for these surfaces, `packages/app-core/src/timeline-graph`)**
- Toolbar: `Today`; a segmented zoom switch named `Timeline zoom` with `Day`, `Week`, `Month`; a switch `Planned vs actual` (off by default); the link chip `N links` (`1 link`).
- Legend (exact): `Done (actual dates)`, `In progress (actual start)`, `Not started (planned dates)`, and, when any ticket has the switch on, `Waits for all incoming`.
- Tray: heading `Not on the timeline yet`; reasons `Add dates` / `Add an estimate` (actions, opening the ticket's sheet at that field); `Reached when <KEY> <Title> chooses <Outcome>` for a ticket a Decision's labelled outcome leads to. Strip heading `Pruned`; chip `Not taken` (`Not taken (pass 2)` from pass 2); ghost label `pruned`; revised mark `revised`.
- Home: `Start from` with `Me`, `Everyone`; `Workspaces`; `Projects`; views group `Home views` with `Knowledge`, `Timeline`; `Due in N days` only when every workspace in scope has the same N (`Due in 1 day`, `Due today`), else `Due soon`; empty `Nothing scheduled in these projects`; error `Couldn't load the timeline.` with `Retry`; cut note `Older work isn't drawn: N items before 3 Mar`; no-bar pill `Nothing in view` with `Jump to the next bar` / `previous bar`.
- No element anywhere in a timeline has the accessible name Earlier, Later, Previous or Next.

**Decisions this plan takes** (each is reported to the planner and is one branch to change)
- **D-W4-1 Who owns which read.** Part 3 owns `getFlow` and `GET /v1/workspaces/:ws/tickets/:id/flow`. This plan owns `getTimelineIndex`, `getTimelineChunk`, `getTimelineTray` and `getHomeSummary` and their routes. Part 1 builds no route (it has no consumer and `planFlow` is Part 2's). The sheet's Timeline view loads the flow whole and uses NO range route (TG-8).
- **D-W4-2 `pin` carries counts.** Spec PR-0 says `pin` is a boolean, TG-11 wants "2 notes, 1 attachment" from the index. The index entry carries `pin: { notes, attachments }`; a boolean would cost a second request for the tooltip.
- **D-W4-3 An unreadable workspace in the scope is dropped silently; 404 only when nothing readable remains.** PR says `READ_NOT_FOUND_BODY`, HM-2 and HM-7 say drop silently. One rule satisfies both and leaks nothing: an unknown workspace takes the same path as a forbidden one.
- **D-W4-4 "Me" is assignee OR collaborator** (`t.assignee_id = $v OR t.collaborator_ids @> to_jsonb($v::text)`, the clause at `apps/server/src/read/compile-filter.ts:100`), not `my-work.ts:128`, which is assignee-only.
- **D-W4-5 Own drafts come in through `listMyDrafts`, never through the visibility predicate.** After Drafts lands, `visibleTicketsWhere` and `LIVE_TICKET_WHERE` AND `draft_author_id IS NULL` (drafts spec §4.2 A3, A4). A draft is an index entry with `draft: true`, `key: null`.
- **D-W4-6 An open period's end is the response's `today`;** the web shell re-renders at IST midnight (`useIstToday`, T4) and the scene re-extends open segments and re-packs only the lanes whose footprint changed.
- **D-W4-7 Archived projects are drawn,** as D-E2 counts them in Home's numbers, so "a number lights its tickets" agrees with the graph.
- **D-W4-8 Summary type.** `HomeResponse.dueSoonDays` is one number; HM-2 needs a per-workspace map. A new `HomeSummaryResponse` is added; `GET /v1/workspaces/:id/home`, `HomeResponse` and case 14.305 stay byte-identical. Members = distinct people across the readable workspaces in scope (not narrowed by Me or by projects); Notes = notes of the scope (a note with no home project follows its workspace, as C-scope's `inGraphScope` does).
- **D-W4-9 The replica does not answer these.** Attachments (`ATTACHMENTS_ABSENCES`, `replica-data-source.ts:1242`), the roster (`:1236`) and a multi-workspace scope are not local, so `getTimelineIndex / Chunk / Tray / getHomeSummary` reject with a `ReplicaGapError` (the `ATTENTION_ABSENCES` pattern, `:679`, `:1337`). The spec says the replica builds the answers; it cannot build the pin counts or the roster, and a partial answer would be a wrong one. Reported.
- **D-W4-10 State-changing live events refetch; input events patch.** `ticket.transitioned / closed / reopened / decided / workflow_rebound / published` move work periods, which derive from the event's `serverTime` and the workflow's categories through Part 2's reducer; the client holds neither. They mark the index stale and refetch it in the background (debounced 400 ms, stale-while-revalidate, rows glide per PK-6). Dates, estimate, wait-for-all and title of a flow MEMBER, and a new link inside one flow, patch the cache at once and re-plan that flow with `planFlow`; the same edits on a singleton (it has no plan inputs in the index), a removed link (it can split a flow), a new link between flows, an assignee or collaborator change (they move Me's scope) and every note or attachment event refetch like the state events. PR-6 says state events re-plan on the client; this is the narrower honest version.
- **D-W4-11 Not taken follows the approved mockups (owner ruling O3, 2026-10-04; spec TG-3, TG-10, PK-3 as amended).** A Not-taken ticket (`notTaken !== null`; the wire field is `resolution`) that did work keeps its work-period bars: `segmentsFor` returns its `actual` segments (no `planned`), the scene draws them in the `notTaken` style (muted fill `--gn-fill-tertiary`, dashed edge, text at full contrast) with the chip `Not taken (pass n)` (`Not taken` for pass 1) and the tooltip `<key> <title>, <start> to <end>, Not taken (pass n)`, and they are in the packing union. One that never started gets ONE `stub` segment on its close day (`closedDay`, the IST day of `TicketState.closed.at`): a 6 px mark with the tooltip `<key> <title>: Not taken, <day>`, in the packing union; with Planned vs actual ON and a pruned plan (`ghost` segments), the stub is not drawn and the ghost in the lane's Pruned strip stands in for it, while the stub's day stays in the union so no row moves. Pruned ghosts stay out of the union (PK-9). A rule-2 ticket (PS-5: terminal with work, not in the live set, no `branch-not-taken` close) carries no resolution here and keeps its ordinary bars. The legend gains `Not taken, after its work` and `Not taken, never started` when the scene holds either.
- **D-W4-12 Mockup-only elements are not built** (the spec wins): the Past-due outline and "Past due, was due 2 Oct" pill; the dotted "through others' tickets" connector; the "10 dated, 1 undated, 1 draft" line; the "1 d early / 1 d late" chips; the legend's position and strings where TG-15 sets them; the tray at the right (TG-6 puts it at the foot); the "est." tag and the vertical "Revised 3 Oct 15:20" line (the spec asks for the diamond's `revised` mark only); the phone's "2 more above / 4 more below" counters.
- **D-W4-13 Tray sentence.** TG-6 writes `Reached when GN-151 Client decides chooses Needs rework`, TG-12 `Reached when GN-145 chooses Needs rework`. One function, `reachedSentence`, builds the TG-6 form (key + title) and drops the title only when the Decision's title is not visible to the viewer.
- **D-W4-14 Home's Knowledge view under a multi-workspace "Everyone"** is centred on the first selected workspace's node; "Me" centres the viewer's person node. The spec leaves this undefined (spec E's "Start from: This workspace | Me" becomes "Me | Everyone"). Reported.
- **D-W4-15 Radio groups.** VP-10 and HM-1 ask for radio groups; `SegmentedControl` renders `role="tablist"` on the KG tip (`packages/ui/src/components/segmented-control.tsx:130`, `:147`). Planner ruling P5 (2026-10-03): Part 1 T9, the first user (the Timeline zoom switch), OWNS `variant="radio"` (case 29.087). This plan CONSUMES it: T5 and T7 render `variant="radio"` and add no variant of their own; T5 Step 0 greps for it and STOPs (`NEEDS: Part 1 T9`) if it is absent.
- **D-W4-16 No server-side plan memo.** The chunk read re-computes the scope core; if it misses 150 ms with the index inside 400 ms, T1 STOPs and names the `proj_ticket_plan` fallback (spec §13); it does not build it.

**What must not change**
- `GET /v1/workspaces/:id/home`, `HomeResponse`, `HOME_NUMBER_KEYS`, MCP `get_workspace → home` and case 14.305 (byte-identical; T1 refactors `readHome` onto a shared collector with the unnarrowed path producing the same bytes).
- `classifyDue`'s rules, `readAttention`'s answers, the existing Timeline view (Part 1's), `test/calendar/clock-free.test.ts` (T4 ADDS `timeline-graph` to `CLOCK_FREE_ROOTS`; nothing under it reads a clock).
- Visibility: a hidden ticket is a hole in a flow (the walk does not pass through it) and absent from items, flows, counts and ids.

**Tests and tooling**
- **Node 22** for `pnpm install` in a worktree.
- Every test run goes through the slot runner: `SR=/Users/kiro/my_projects/gisik-nokma-lanes/slot-run.sh; "$SR" <label> -- <cmd>`. Labels below are per task (`wtg4-t1` …).
- **Never pipe a test or build run into `head`.** Use `> /tmp/x.log 2>&1; tail -N /tmp/x.log`. vitest `--maxWorkers=2`. No `pkill`/`killall`.
- **Build before suites.** Web reads app-core's `dist`; the server reads domain, rule-engine and app-core `dist`: `pnpm turbo run build --filter=@gisik-nokma/web...`.
- **App-core online/sync changes** (T4) ⇒ also run the server integration files (`apps/server/test/integration/*.test.ts`) WHOLE. An editor/domain change ⇒ regenerate the mobile editor bundle (this plan adds no event, so it should not; T1 greps and says so).
- **`ui.css` changes** (T2, T4–T7) ⇒ run the ui, app-core and web suites WHOLE.
- **Every run quoted in a report is named LOCAL.** CI runs only on the release→main PR.
- **Controls live in the same `it()`** as the case they guard (a refusal test also proves the same call with one input changed is accepted).
- **No new event type, notification kind or projection** in this plan. If a lane finds it needs one, it STOPs and reports (the census rules of Part 2 §8.4 would apply).
- **Features.md and `test-cases/`** change in the same commit as the code.
- **Prose is a claim.** Any docblock, Features line or case that says the Home is single-workspace, that the numbers are one workspace's, or that a timeline pages, is rewritten in the commit that makes it false (T7 lists its sites).
- Gate task count and every pinned member/registry count are MEASURED on the tip at execution and pinned in the same task that changes them; never copy a number from this plan.

## Consumed contract

Names this plan calls but does not write. "Per plan X" means that plan's text; **the landed code governs**, and each task's Step 0 re-reads the row it uses and changes only its call sites (T2 puts every Part 1 call behind `timeline-graph/bridge.ts` so a signature drift is one file).

| Name | Per plan | Shape this plan assumes |
|---|---|---|
| `@gisik-nokma/viewport`: `pack`, `routeEdge`, `routeLoop`, `planRange`, `RangeCache`, `ScrollAdapter`, `ViewportDriver` | Part 1 (spec §2–5) | `pack(items, { ppdPack, labelPx }) → { rowOf: Map<id,row>, rowCount }` over items with day-interval segments (PK-1 to PK-4); `routeEdge(from, to, orient)` and `routeLoop(from, to, orient) → { d: string; labelAt: {x,y} }` (TG-5, TG-12); `planRange(state) → { want: Chunk[]; cancelLow: boolean }` (PR-1 to PR-3); `RangeCache` keeps index + chunks per scope, `patch`, `markStale`; `ViewportDriver { offset(), scale(), animateTo(), onFrame(), visibleRange() }` |
| Zoom switch (Day / Week / Month), Today button, axis header with day numbers, weekend tint, role `timelineWeekend` | Part 1 (VP-10, VP-11) | a `TimelineToolbar` / `TimelineAxis` pair or the pieces to compose one; the token role `timelineWeekend` (`--gn-timeline-weekend`; the spec calls it `--tl-weekend`) |
| `planFlow({ nodes, edges, analysis? }) → FlowPlan` (`Map<id, NodePlan>`); `analyzeFlow(nodes, edges)`; `flowNodeOf(state, wf, flags?)`; `edgeKey` | Part 2 T10, T11 (PL-1 to PL-6, FL-3; Part 2 plan :3558, :4027, :4036, :4325, :4391) | input `FlowNode = { id, typeId, stateId, category, closed, trashed, draft, parentId, isDecision, outcome, passes, notTaken: NotTakenResolution\|null, waitForAll, started, rounds, periods: WorkPeriod[] (instants), explicitStart, explicitDue, estimate, reworkEstimate, initialStateId, firstTerminalStateId }`, built ONLY by `flowNodeOf` from a `TicketState`; edges `FlowEdge = { sourceId, targetId, label }`; `NodePlan = { intervals: PlannedInterval[]; unscheduled: null\|'no-dates'\|'no-estimate'\|'start-after-due'; onTimeline: boolean }`; `PlannedInterval = { pass, start, end, basis: 'explicit'\|'chained', startsBeforePredecessor?: true, pruned?: true }` (IST days); `analyzeFlow → { starts, ends, backEdges: ReadonlySet<edgeKey>, order }`, `edgeKey(e) = "sourceId>targetId"` |
| `DECISION_TYPE_ID`, `PassRecord`, `TicketState.periods / passes / rounds / outcome`, the projection row's columns `periods, passes, rounds, outcome, closed_cause` (read through `rowToTicketState`, `projections/tickets.ts`), `proj_ticket_links.label` | Part 2 (DC-1, PS-2, WP-1, ES-1a, LK-5) | `WorkPeriod = { start: string (instant); end: string\|null; pass: number }`; `NotTakenResolution = { kind: 'not-taken'; decisionTicketId; outcome; pass }` (`resolutionOf(state)`, from the `branch-not-taken` close cause the row's `closed_cause` holds); `rowToTicketState` folds every column (Part 2 T5, T9) |
| `readFlowView(db, { workspaceId, seedId, viewerId, eff })`, `DataSource.query.getFlow(workspaceId, ticketId)`, `FlowRead` | Part 3 T3 (§4, FL-1 to FL-4, MCP `get_flow`; Part 3 plan :2307-2393; it replaces Part 2 T12's transitional route) | `FlowRead = { flowId, rootId, truncated, reached, start, end, order, nodes: FlowNodeRead[], edges: FlowEdgeRead[], autoMoves, draftCount }`; `FlowNodeRead = { id, key, draft, title, kind, typeId, parentId, projectId, state: {id,name,category}, initialStateName, assigneeId, assigneeName, dueDate, waitForAll, estimate, reworkEstimate, round, outcome, passes, resolution: NotTakenResolution\|null, alternates, periods, planned: {pass,start,end,basis,pruned: boolean}[], actual, tray: UnscheduledReason\|null, notes, pin: {notes,attachments} }`; `FlowEdgeRead = { id, kind, from, to, label, loop, taken, takenPasses, chosen }`; periods and planned are IST days |
| `FlowInspector`, `NewStepForm`, `PublishFlowBanner`, the Graph tab's inner switch (`aria-label "Graph views"`) and `TicketSheetProps.*GraphSlot` | Part 3 (SH-1, WG-3, CR-1, CR-3) | components taking `{ workspaceId, ticketId, selected, onSelect }`; the switch learns its options from which slots are mounted (KG C T9: `knowledgeGraphSlot`) |
| `FlowScene` / `FlowRenderer` | Part 3 (spec §9.2) | `mount(el, theme)`, `setScene(nodes, edges, positions)`, `setDriver`, `onPick`, `onHover`, `refreshTheme`, `destroy`. T5 Step 0 checks whether it accepts custom node kinds; if so the draw list is painted through it, else through this plan's `TimelinePainter`. The draw list is the same either way |
| `listMyDrafts(db, userId, workspaceId)` and `proj_tickets.draft_author_id` | Drafts plan (spec R55, §4.2) | `{ ticketId, projectId, … }[]` newest first; never a key |
| `readHome`, `HomeResponse`, `capIds`, `visibleMemberIds`, `dueDateOfClaim`, `addIstDays`, `HomeScreen`, `HomeNumbers`, `useHomeHighlight`, `HOME_NUMBERS`, `HomeGraph`, `homeNodeIds`, `highlightNote`, `useHome` | KG Home plan (`2026-10-03-home.md`, T1–T4) | as that plan's Interfaces blocks |
| `KnowledgeGraph` props `centre`, `config`, `scope`, `defaultWorkspaceIds`, `hops`, `highlight`, `onZones`, `onEscape`, `showHops`, `canOpen`; `kgNodeId` from `@gisik-nokma/knowledge-graph/ids` | KG C plan (T7) and the Home plan's "plan C contract" | as read at `origin/release/knowledge-graph` |
| `cardKeysFor(db, rows)` | KG C plan (T1 Step 10 exports it) | returns `Map<ticketId, key\|null>` over rows with `ticket_id, workspace_id, project_id`; already exported at `apps/server/src/read/ticket-cards.ts:325` on `origin/release/knowledge-graph` (7834d3c6) |

## Review Focus

1. **A live event in the SECOND workspace of the scope.** `useLiveQuery` subscribes one `workspaceId`; a Home that hooks only the first misses the rest. A ticket finished in workspace B must move its successors' bars and Home's lit set. Pinned by 29.310 (T4) and 29.348 (T7).
2. **A collaborator-only ticket under Me.** A ticket the viewer neither owns nor is assigned, but collaborates on, must be in Me's numbers AND on Me's timeline (and absent from "Everyone minus mine" reasoning). Pinned by 29.296 (T1) and 29.338 (T7).
3. **A workspace becoming unreadable mid-session** (membership revoked while Home is open). The next refresh drops it silently from numbers, lanes and the lit set; nothing half-drawn, no error banner, and when none is left the 404 path shows the empty state. Pinned by 29.312 (T4) and 29.347 (T7).
4. **A lit number whose tickets are all undated.** No glide target: the surface does not move, the note says none are drawn, and Esc still clears. Pinned by 29.341 (T7).
5. **Mixed `dueSoonDays` with one workspace at N = 0.** The label reads `Due soon`, never `Due today` or one workspace's N, and each ticket is classified by its own workspace's window. Pinned by 29.306 (T3) and 29.339 (T7).

---

## File structure

| File | Responsibility | Task |
|---|---|---|
| `packages/domain/src/read-models-timeline.ts` (new), `packages/domain/src/index.ts` | `TimelineEntry`, `TimelineSegment`, `TimelinePin`, `TimelineResolution`, `TimelineFlow`, `TimelineDetail`, `TimelineTrayItem`, `TimelineIndexResponse`, `TimelineChunkResponse`, `TimelineTrayResponse`, `HomeSummaryResponse`, the caps | 1 |
| `packages/domain/src/flow/segments.ts` (new) | `segmentsFor`: periods + plan + `notTaken` → segments (pure, clock-free) | 1 |
| `apps/server/src/timeline/{scope,load,assemble,compute,as-of,read-index,read-chunk,read-tray,read-summary}.ts` (new) | scope parsing and the readable-workspace gate; the SQL; the pure assembler; the shared core; the four reads | 1 |
| `apps/server/src/routes/home.ts` | `readHome` split into `collectHome` (+ `narrow`) and `toHomeResponse`; unnarrowed bytes unchanged | 1 |
| `apps/server/test/timeline/**` (new) | assembler, visibility, pins, perf (gated), routes | 1, 3 |
| `apps/server/src/routes/timeline.ts`, `apps/server/src/timeline/days.ts` (new), `apps/server/src/app.ts` | the four routes and their registration | 3 |
| `packages/app-core/src/data-source.ts`, `online/{online-data-source,mappers,index}.ts`, `replica/replica-data-source.ts` | `getTimelineIndex / Chunk / Tray`, `getHomeSummary`; mappers; replica gaps | 4 |
| `packages/app-core/src/timeline-graph/{days,bridge,draw-types,painter,scope-cache,scope-feed,live-patch,use-timeline-scope,use-ist-today,index}.ts(x)` (new), `packages/app-core/package.json` (`./timeline-graph` export), `packages/app-core/test/helpers/clock-scan.ts` | bridge to Part 1; draw-list types; painter; cache, live patch, hook; clock-free root | 2, 4 |
| `packages/app-core/src/timeline-graph/{scene,model,labels,reached,toolbar,legend,tray,timeline-graph}.ts(x)` (new) | the pure scene builder, the toggle model, copy, the React shell used by the sheet and Home | 5, 6 |
| `packages/app-core/src/views/ticket-sheet.tsx` | `timelineGraphSlot` | 5 |
| `packages/ui/src/ui.css`, `packages/ui/src/tokens.ts`, `packages/ui/test/tokens.test.ts` | `.gn-tlg*` rules; roles and their `CONTRAST_PAIRS` | 2, 4–6 |
| `packages/flow-graph-browser/harness/timeline-stress.{html,ts}`, `tests/timeline-stress.spec.ts`, `package.json` (new dep) | the Home-shaped pan scene (desktop GPU, Pixel proxy, real phone) | 2 |
| `apps/web/src/home/{home-scope,home-scope-bar,home-timeline,home-summary-hook,home-copy}.ts(x)`, `home-screen.tsx`, `home-numbers.tsx`, `use-home-highlight.ts`, `home-graph.tsx` | one scope for numbers and graph; Home's Timeline; lighting + glide | 7 |
| `apps/web/src/use-ist-today.ts` or app-core's hook | IST-midnight re-render | 4 |
| `Features.md` §26, `test-cases/29-workflow-timeline-graphs.md`, `test-cases/27-knowledge-graph.md` (27.6xx amendments), `docs/manual.md` | catalogue and help | each task its own lines |

**Parallelism:** T1 ∥ T2 (server vs browser harness). T3 needs T1. T4 needs T3 and T2's verdict. T5 → T6 → T7 are serial because each extends the one scene builder. Shared files: `Features.md`, file 29 and `ui.css` (each task writes under its own anchor / its own `/* WTG4 Tn */` comment block).

---
### Task 1: The four server reads, measured first (cases 29.290–29.299)

**Blocked until KG E T1 (Home, `apps/server/src/routes/home.ts`) lands on `release/knowledge-graph`.** (Planner ruling P7, 2026-10-03: no origin ref carries it yet. Check `git ls-tree origin/release/knowledge-graph apps/server/src/routes/home.ts` first; if it prints nothing, STOP with `NEEDS: KG E T1`.)

**Branch** `task/wtg4-reads`. **Files:**
- Create:
  - `packages/domain/src/read-models-timeline.ts`
  - `packages/domain/src/flow/segments.ts`, `packages/domain/test/flow/segments.test.ts`
  - `apps/server/src/timeline/scope.ts`, `load.ts`, `assemble.ts`, `compute.ts`, `as-of.ts`, `read-index.ts`, `read-chunk.ts`, `read-tray.ts`, `read-summary.ts`
  - `apps/server/test/timeline/assemble.test.ts`, `scope-visibility.test.ts`, `pins.test.ts`, `reads.test.ts`, `perf.test.ts`
  - `apps/server/test/timeline/helpers/world.ts`
- Modify:
  - `packages/domain/src/index.ts` (two `export *` lines beside `read-models.js`, `:44`, and Part 2's flow exports)
  - `apps/server/src/routes/home.ts` (KG Home T1's file: `readHome` → `collectHome` + `toHomeResponse`, unnarrowed bytes unchanged)
  - `Features.md` §26, `test-cases/29-workflow-timeline-graphs.md` (the Part 4 sub-section, Step 0)

**Interfaces:**
- **Consumes:** `planFlow({nodes, edges, analysis?})`, `FlowNode`, `FlowEdge`, `NodePlan`, `PlannedInterval`, `flowNodeOf(state, wf, flags?)`, `NotTakenResolution`, `PassRecord`, `DECISION_TYPE_ID` (Part 2 T5, T9, T10, T11); `rowToTicketState` and its row type (`projections/tickets.ts`, carrying Part 2's `periods, passes, rounds, outcome, closed_cause`; the fold-then-`flowNodeOf` path of Part 2 T12's `walkFlow`, Part 2 plan :5359-5384); `foldedWorkflowDefs(db, workspaceId, pairs)` (`read/workflow-defs.ts:64`); `readFlowView` (Part 3 T3; timed by 29.292); `listMyDrafts` (Drafts); `cardKeysFor` (KG C); `readHome`'s helpers `capIds`, `visibleMemberIds`, `dueDateOfClaim`, `addIstDays` (KG Home T1); `visibleTicketsWhere`, `visibleNotesWhere`, `LIVE_TICKET_WHERE` (`apps/server/src/read/visible-where.ts:136`, `:294`, `:231`); `requireMember` (`read/membership.ts`); `NOTE_PROJECT_LIVE_WHERE` (`read/notes.ts:25`, already exported on the KG tip).
- **Produces** (from `@gisik-nokma/domain`): `TIMELINE_INDEX_CAP = 10_000`, `TIMELINE_FLOW_CAP = 300`, `TIMELINE_CHUNK_DAYS = 28`, `TIMELINE_PAGE_SIZE = 200`; the types of the file map above; `segmentsFor(input): TimelineSegment[]`.
- **Produces** (server): `parseTimelineScope(query): TimelineScope | null`; `readableWorkspaces(db, userId, scope): Promise<ReadableWorkspace[]>`; `scopeKey(scope): string`; `readTimelineIndex(db, readable, viewerId, scope, now): Promise<TimelineIndexResponse>`; `readTimelineChunk(db, readable, viewerId, scope, now, window, cursor?, pageSize?)`; `readTimelineTray(db, readable, viewerId, scope, now, cursor?, pageSize?)`; `readHomeSummary(db, readable, viewerId, scope, now): Promise<HomeSummaryResponse>`; `collectHome` / `toHomeResponse` / `HomeNarrow` from `routes/home.ts`; `computeScope(...) → ScopeCore` (T3 and the MCP `get_timeline` of Part 5 reuse it).

Siblings copied: `apps/server/src/routes/home.ts` (KG Home T1) for the shape of a count read; `readList` (`routes/list.ts:~100-160`) for the keyset pager; `test/routes/home-perf.test.ts` (KG Home T1) for the gated measurement; `seedReadScenario` (`test/helpers/read-scenario.ts:120-200`) for the world's events (`workspace.created`, `membership.granted`, `project.created`, `project.member_added`, `workflow.defined`, `ticket-type.defined`, `ticket.created`, `visibility.set`).

- [ ] **Step 0: Pre-flight, the catalogue, and the landed names**

  1. `git fetch origin`; cut `task/wtg4-reads` from `origin/release/workflow-graph`; `pnpm install` under Node 22.
  2. **Re-read what this task calls** and write the landed signatures into the first lines of `HANDOFF-wtg4-reads.md`:
     - `grep -n "export function planFlow\|export function analyzeFlow\|export function flowNodeOf\|export function edgeKey\|export type FlowNode\|export type NodePlan\|export type PlannedInterval" packages/domain/src/flow/*.ts`;
     - `grep -n "periods\|passes\|rounds\|outcome\|closed_cause\|draft_author_id" apps/server/src/projections/tickets.ts` (the columns `rowToTicketState` reads; `load.ts` selects `t.*` and folds it exactly as Part 2 T12's `walkFlow` does, so a missing column means Part 2 or Drafts has not landed: STOP);
     - `grep -n "export async function listMyDrafts" apps/server/src/read/drafts.ts`;
     - `grep -n "export.*cardKeysFor" apps/server/src/read/ticket-cards.ts`;
     - `grep -n "label" apps/server/migrations/*proj-ticket-links*.sql` (Part 2's `label` column);
     - `grep -rn "readHome\b" apps/server/src/routes/home.ts` (KG Home T1 landed).
     - `grep -n "export function rowToTicketState\|export async function foldedWorkflowDefs" apps/server/src/projections/tickets.ts apps/server/src/read/workflow-defs.ts` (`:152` and `:64` on the KG tip; `load.ts` folds each row with `rowToTicketState` and makes its `FlowNode` with `flowNodeOf` against the ticket's own workflow version, the path of Part 2 T12, Part 2 plan :5359-5384);
     - `grep -n "export async function resolveEffectiveRole\|export async function requireMember" apps/server/src/permissions/effective-role.ts apps/server/src/read/membership.ts` (`:119` and `:60` on the KG tip: `readableWorkspaces` uses `requireMember(db, userId, workspaceId): Promise<EffectiveRole | null>`; the tests build roles with `resolveEffectiveRole(pool, userId, workspaceId)`);
     - `grep -n "HOME_ID_CAP\|capIds\|type Dated\|visibleMemberIds" apps/server/src/routes/home.ts packages/domain/src/read-models.ts` (none of these exist on the KG tip; KG Home T1 adds them. If a name differs after it landed, use the landed one and say so in the handoff; `Dated` is `{ id: string; day: string }` and is exported by this task).
     - `grep -n "NOTE_PROJECT_LIVE_WHERE" apps/server/src/read/notes.ts` (already `export const` at `:25` on the KG tip; consume it, never export it again).
     If any of these fails, STOP: a prerequisite plan has not landed.
  3. **Catalogue.** Re-grep every live tip (command in Global Constraints). Guard: `grep -n '^<!-- WTG4 -->$' test-cases/29-workflow-timeline-graphs.md && grep -n '^<!-- WTG4 bullets -->$' Features.md`; if either is missing, Part 1 T1 has not landed: STOP. In `test-cases/29-workflow-timeline-graphs.md`, directly below Part 1's `<!-- WTG4 -->` (keep that line), add:
     ```markdown
     ## 29.4 Part 4 — The Timeline graph and Home's Timeline (29.290–29.349)

     Plan `docs/superpowers/plans/2026-10-03-wtg-part4-timeline-graph-home.md`; spec `docs/superpowers/specs/2026-10-03-workflow-timeline-graphs-design.md` §11–13. Ids tile 29.290–29.349: T1 290–299 · T2 300–303 · T3 304–307 · T4 308–312 · T5 313–326 · T6 327–334 · T7 335–349.

     <!-- WTG4 T1 -->

     <!-- WTG4 T2 -->

     <!-- WTG4 T3 -->

     <!-- WTG4 T4 -->

     <!-- WTG4 T5 -->

     <!-- WTG4 T6 -->

     <!-- WTG4 T7 -->

     <!-- WTG4 end -->
     ```
     In `Features.md` §26, directly below Part 1's `<!-- WTG4 bullets -->` (keep that line), add a sub-heading `### Timeline graph and Home's Timeline (Part 4)` and seven anchor lines `<!-- WTG4 bullet T1 -->` … `<!-- WTG4 bullet T7 -->`.
  4. Run: `node scripts/check-case-ids.mjs && pnpm check:citations`. Expected: both pass.

  Commit: `wtg4 T1: open the Part 4 sub-section and per-task anchors under Part 1's Part 4 anchors in Features §26 and test-cases/29`.

- [ ] **Step 1: The read models and `segmentsFor`, test first (29.294)**

  Case line under `<!-- WTG4 T1 -->`:
  - `- ❌ **29.294 — `segmentsFor` turns periods, plan and resolution into the segments the packer and the painter share:** an unworked ticket is its planned bar; an open period ends at `today`; a closed period does not move with `today`; two passes keep both periods; a Not-taken ticket that did work keeps its `actual` segments and has NO `planned` one; a never-started Not-taken ticket has exactly one `stub` segment on its close day (and no stub without a close day); pruned ghosts are kept either way (TG-3, TG-10, PK-3 as amended by owner ruling O3); control: the same input without the resolution gets its planned bar back and no stub. Mutation: end an open period at its planned end → the first half reds; drop the stub → the never-started assertion reds.`

  `packages/domain/test/flow/segments.test.ts`:
  ```ts
  import { describe, expect, it } from 'vitest';
  import { segmentsFor } from '../../src/flow/segments.js';

  const planned = [{ pass: 1, start: '2026-10-05', end: '2026-10-07', basis: 'explicit' as const }]; // Part 2's PlannedInterval: `pruned` only when pruned
  const ghost = [{ pass: 1, start: '2026-10-08', end: '2026-10-09', basis: 'chained' as const, pruned: true as const }];
  const notTaken = { kind: 'not-taken' as const, decisionTicketId: '01HZ0000000000000000000001', outcome: 'Yes', pass: 1 };

  describe('29.294 segmentsFor', () => {
    it('29.294 planned bar; open period grows to today; closed period stays; control: moving today moves only the open end', () => {
      expect(segmentsFor({ periods: [], planned, notTaken: null, closedDay: null, today: '2026-10-03' })).toEqual([
        { start: '2026-10-05', end: '2026-10-07', pass: 1, type: 'planned' },
      ]);
      const open = (today: string) =>
        segmentsFor({ periods: [{ start: '2026-10-01', end: null, pass: 1 }], planned, notTaken: null, closedDay: null, today });
      expect(open('2026-10-03').find((s) => s.type === 'actual')).toEqual({ start: '2026-10-01', end: '2026-10-03', pass: 1, type: 'actual' });
      expect(open('2026-10-09').find((s) => s.type === 'actual')?.end).toBe('2026-10-09');
      const closed = (today: string) =>
        segmentsFor({ periods: [{ start: '2026-10-01', end: '2026-10-02', pass: 1 }], planned: [], notTaken: null, closedDay: null, today });
      expect(closed('2026-10-03')).toEqual(closed('2026-10-20')); // control
    });

    it('29.294 two passes keep both periods, in start order; a period opened today is one day, never negative', () => {
      const two = segmentsFor({
        periods: [{ start: '2026-10-06', end: null, pass: 2 }, { start: '2026-10-01', end: '2026-10-04', pass: 1 }],
        planned: [], notTaken: null, closedDay: null, today: '2026-10-06',
      });
      expect(two.map((s) => [s.pass, s.start, s.end])).toEqual([[1, '2026-10-01', '2026-10-04'], [2, '2026-10-06', '2026-10-06']]);
      // a clock that is a day behind the period's own serverTime never yields end < start
      const skew = segmentsFor({ periods: [{ start: '2026-10-07', end: null, pass: 1 }], planned: [], notTaken: null, closedDay: null, today: '2026-10-06' });
      expect(skew[0]).toMatchObject({ start: '2026-10-07', end: '2026-10-07' });
    });

    it('29.294 Not taken: work stays as actual segments, a never-started ticket is one stub on its close day, ghosts stay; control: no resolution brings the planned bar back and no stub', () => {
      const worked = segmentsFor({ periods: [{ start: '2026-10-01', end: '2026-10-02', pass: 1 }], planned, notTaken, closedDay: '2026-10-04', today: '2026-10-05' });
      expect(worked).toEqual([{ start: '2026-10-01', end: '2026-10-02', pass: 1, type: 'actual' }]); // TG-10: the work stays drawn; no planned, no stub
      const workedWithGhost = segmentsFor({ periods: [{ start: '2026-10-01', end: '2026-10-02', pass: 1 }], planned: [...planned, ...ghost], notTaken, closedDay: '2026-10-04', today: '2026-10-05' });
      expect(workedWithGhost.map((s) => s.type)).toEqual(['actual', 'ghost']);
      expect(segmentsFor({ periods: [], planned: [...planned, ...ghost], notTaken, closedDay: '2026-10-04', today: '2026-10-05' })).toEqual([
        { start: '2026-10-04', end: '2026-10-04', pass: 1, type: 'stub' },
        { start: '2026-10-08', end: '2026-10-09', pass: 1, type: 'ghost' },
      ]);
      expect(segmentsFor({ periods: [], planned, notTaken, closedDay: null, today: '2026-10-05' })).toEqual([]); // no close day, no stub
      const freeWorked = segmentsFor({ periods: [{ start: '2026-10-01', end: '2026-10-02', pass: 1 }], planned, notTaken: null, closedDay: null, today: '2026-10-03' });
      expect(freeWorked.map((s) => s.type)).toEqual(['actual', 'planned']); // control
      const free = segmentsFor({ periods: [], planned, notTaken: null, closedDay: '2026-10-04', today: '2026-10-03' });
      expect(free.map((s) => s.type)).toEqual(['planned']); // control: a close day alone makes no stub
    });
  });
  ```
  Run: `"$SR" wtg4-t1 -- pnpm --filter @gisik-nokma/domain exec vitest run test/flow/segments.test.ts --maxWorkers=2 > /tmp/wtg4-t1.log 2>&1; tail -20 /tmp/wtg4-t1.log`. Expected: FAIL (`segments.js` does not exist).

  `packages/domain/src/read-models-timeline.ts`:
  ```ts
  import type { PassRecord } from './ticket-state.js';
  import type { StateCategory } from './workflow.js';
  import type { FlowNode, NotTakenResolution } from './flow/index.js';

  /** Spec §4 / PR-0 / §13. */
  export const TIMELINE_INDEX_CAP = 10_000;
  export const TIMELINE_FLOW_CAP = 300;
  export const TIMELINE_CHUNK_DAYS = 28;
  export const TIMELINE_PAGE_SIZE = 200;

  /** `stub`: a never-started Not-taken ticket's close day (TG-10, D-W4-11). */
  export type TimelineSegmentType = 'actual' | 'planned' | 'ghost' | 'stub';
  /** Inclusive IST days (`YYYY-MM-DD`). `pass` is the ticket's round when the work or plan belongs to it. */
  export type TimelineSegment = { start: string; end: string; pass: number; type: TimelineSegmentType };
  /** D-W4-2: counts, not a boolean (TG-11's tooltip is "2 notes, 1 attachment"). */
  export type TimelinePin = { notes: number; attachments: number };
  /** The index's wire name is `resolution` (spec :174, as Part 3's `FlowNodeRead.resolution`); the value is Part 2's `NotTakenResolution` (`FlowNode.notTaken`). */
  export type TimelineResolution = NotTakenResolution | null;
  export type TimelineUnscheduledReason = 'no-dates' | 'no-estimate' | 'start-after-due';

  /** PR-0's index entry (+ `workspaceId`, needed once a scope spans workspaces). About 100 bytes plus 16 per segment. */
  export type TimelineEntry = {
    id: string;
    workspaceId: string;
    key: string | null;
    draft: boolean;
    kind: 'ticket' | 'decision';
    /** The project id: Home's lane. */
    lane: string;
    segments: TimelineSegment[];
    pin: TimelinePin;
    resolution: TimelineResolution;
    category: StateCategory;
    flowId: string | null;
  };

  export type TimelineFlowEdge = { from: string; to: string; kind: 'leads_to' | 'blocks'; label: string | null };
  /** Plan inputs (Part 2's `FlowNode`, periods as instants) for EVERY visible member of an included flow, including members `items` leaves out (Me, project scope). A flow over the cap is `truncated` with no `nodes`: the client refetches instead of re-planning. */
  export type TimelineFlow = {
    id: string;
    workspaceId: string;
    truncated: boolean;
    nodes: FlowNode[];
    edges: TimelineFlowEdge[];
  };

  export type TimelineDetail = {
    id: string;
    title: string;
    stateId: string;
    stateName: string;
    assigneeId: string | null;
    dueDate: string | null;
    basis: 'explicit' | 'chained' | null;
    startsBeforePredecessor: boolean;
    round: number;
    waitForAll: boolean;
    estimate: number | null;
    passes: PassRecord[] | null;
  };

  export type TimelineTrayItem = {
    id: string;
    workspaceId: string;
    projectId: string;
    key: string | null;
    title: string;
    draft: boolean;
    reason: TimelineUnscheduledReason;
    /** TG-6 / TG-12: set when a Decision's labelled outcome leads here. */
    reachedBy: { decisionTicketId: string; decisionKey: string | null; decisionTitle: string; outcome: string } | null;
  };

  export type TimelineIndexResponse = {
    today: string;
    /** D-W4-23: per readable workspace, the stream head (`readStreamSeq`) read BEFORE the scope was loaded. The client applies only events with a larger `workspaceSeq`. */
    asOf: Record<string, number>;
    items: TimelineEntry[];
    flows: TimelineFlow[];
    tray: { count: number };
    /** The cut of PR-0: "Older work isn't drawn: N items before 3 Mar". */
    truncated: null | { dropped: number; before: string };
  };
  export type TimelineChunkResponse = { items: TimelineDetail[]; nextCursor: string | null };
  export type TimelineTrayResponse = { items: TimelineTrayItem[]; nextCursor: string | null };

  /** HM-2 (D-W4-8). `members` is null only when EVERY readable workspace withholds the roster (a guest). */
  export type HomeSummaryResponse = {
    generatedAt: string;
    /** D-W4-23, as on the index. */
    asOf: Record<string, number>;
    workspaceIds: string[];
    dueSoonDays: Record<string, number>;
    counts: { tickets: number; open: number; pastDue: number; dueSoon: number; members: number | null; notes: number };
    ids: Record<'tickets' | 'open' | 'pastDue' | 'dueSoon' | 'members' | 'notes', string[]>;
  };
  ```
  `packages/domain/src/flow/segments.ts`:
  ```ts
  import type { TimelineResolution, TimelineSegment } from '../read-models-timeline.js';

  export type SegmentInput = {
    /** Work periods as IST days (WP-1, already through `istDayOf`); `end: null` is an open period. */
    periods: readonly { start: string; end: string | null; pass: number }[];
    /** Part 2's `NodePlan.intervals` (`PlannedInterval`, `pruned?: true`) or Part 3's `FlowNodeRead.planned` (`pruned: boolean`) (PL-3, PL-6). */
    planned: readonly { pass: number; start: string; end: string; basis: 'explicit' | 'chained'; pruned?: boolean }[];
    /** Part 2's `FlowNode.notTaken`; Part 3's wire and the index call the same value `resolution`. */
    notTaken: TimelineResolution;
    /** The IST day of the ticket's close (`TicketState.closed.at` through `istDayOf`), or null when unknown; read only for a never-started Not-taken ticket's stub (TG-10). */
    closedDay: string | null;
    /** The IST day, injected: this module reads no clock. */
    today: string;
  };

  const ORDER: Record<TimelineSegment['type'], number> = { actual: 0, stub: 1, planned: 2, ghost: 3 };
  const later = (a: string, b: string): string => (a > b ? a : b);

  /**
   * One ticket's drawable intervals (spec PR-0, TG-3, TG-9, TG-10, PK-3).
   * - actual: each work period; an open one runs to `today` (D-W4-6) and never ends before it starts; a Not-taken ticket keeps them (D-W4-11, TG-10);
   * - planned: each pass's planned interval, unless the ticket is Not taken;
   * - ghost: a pruned branch's planned interval (PL-6), kept on Not-taken tickets so the toggle can show it;
   * - stub: ONE segment on the close day of a Not-taken ticket that never worked (no periods), when the close day is known (TG-10).
   */
  export function segmentsFor(input: SegmentInput): TimelineSegment[] {
    const out: TimelineSegment[] = [];
    for (const p of input.periods) {
      out.push({ start: p.start, end: p.end ?? later(p.start, input.today), pass: p.pass, type: 'actual' });
    }
    for (const pl of input.planned) {
      if (pl.pruned === true) out.push({ start: pl.start, end: pl.end, pass: pl.pass, type: 'ghost' });
      else if (input.notTaken === null) out.push({ start: pl.start, end: pl.end, pass: pl.pass, type: 'planned' });
    }
    if (input.notTaken !== null && input.periods.length === 0 && input.closedDay !== null) {
      out.push({ start: input.closedDay, end: input.closedDay, pass: input.notTaken.pass, type: 'stub' });
    }
    return out.sort(
      (a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : ORDER[a.type] - ORDER[b.type] || a.pass - b.pass),
    );
  }
  ```
  Export both from `packages/domain/src/index.ts`. Run the test again: PASS. Flip 29.294 to ✅.

  Commit.

- [ ] **Step 2: The pure assembler, test first (29.295, 29.298)**

  Case lines:
  - `- ❌ **29.295 — the assembler plans each flow component once and turns it into index entries:** a chained successor starts the day after its predecessor's end; a singleton has `flowId: null`; a member hidden by Me is in `flows[].nodes` but not in `items`; a Not-taken ticket is never in the tray; one that never started is an entry whose only drawn segment is a `stub` on its close day (D-W4-11), and one that worked is an entry with its `actual` segments; an undated ticket is in the tray with its reason (`no-dates`, and `no-estimate` when it has a ready day but no estimate); a Decision's labelled outcome target says `reachedBy`; control: the same ticket with an estimate is on the timeline. Mutation: treat a Not-taken ticket as undated → the tray assertion reds.`
  - `- ❌ **29.298 — the caps:** over `TIMELINE_INDEX_CAP` the entries that ended longest ago are dropped and `truncated` names the count and the earliest kept end; a flow over `TIMELINE_FLOW_CAP` is `truncated: true` with no `nodes` and its members are still planned; control: exactly at the cap nothing is cut. Mutation: drop the newest instead → the kept-set assertion reds.`

  `apps/server/test/timeline/assemble.test.ts` (pure: no database). Use the real `planFlow`:
  ```ts
  import { describe, expect, it } from 'vitest';
  import { DECISION_TYPE_ID, type FlowNode } from '@gisik-nokma/domain';
  import { assembleScope, mergeCores, type LoadedEdge, type LoadedTicket } from '../../src/timeline/assemble.js';

  const id = (n: number): string => `01HZ${String(n).padStart(22, '0')}`;
  /** Part 2's `FlowNode` (Part 2 plan :4036), the same literal as Part 3 T3's `node` fixture; `load.ts` makes the real ones with `flowNodeOf`. */
  const fnode = (nid: string, over: Partial<FlowNode> = {}): FlowNode => ({
    id: nid, typeId: 'task', stateId: 'todo', category: 'open', closed: false, trashed: false, draft: false, parentId: null, isDecision: false, outcome: null, passes: [],
    notTaken: null, waitForAll: false, started: false, rounds: 1, periods: [], explicitStart: null, explicitDue: null, estimate: null, reworkEstimate: null,
    initialStateId: 'todo', firstTerminalStateId: 'done', ...over,
  });
  type Over = Partial<FlowNode> & Partial<Pick<LoadedTicket, 'workspaceId' | 'projectId' | 'stateName' | 'assigneeId' | 'title' | 'inScope'>>;
  function t(n: number, over: Over = {}): LoadedTicket {
    const { workspaceId = 'W', projectId = 'P1', stateName = 'To do', assigneeId = null, title = `T${n}`, inScope = true, ...node } = over;
    return { id: id(n), workspaceId, projectId, stateName, assigneeId, title, inScope, closedDay: node.notTaken ? '2026-10-02' : null, node: fnode(id(n), { isDecision: node.typeId === DECISION_TYPE_ID, ...node }) };
  }
  const lead = (a: number, b: number, label: string | null = null): LoadedEdge =>
    ({ workspaceId: 'W', from: id(a), to: id(b), kind: 'leads_to', label });
  const none = new Map<string, string | null>();
  const pins = new Map();
  const TODAY = '2026-10-03';

  describe('29.295 assembleScope', () => {
    it('29.295 chains a successor the day after; singleton has no flow; Me-hidden member rides flows[]; a never-started Not taken is a stub entry, never a tray row', () => {
      const tickets = [
        t(1, { explicitStart: '2026-10-05', estimate: 3 }),                                   // [10-05, 10-07]
        t(2, { estimate: 2, inScope: false }),                                                // chained [10-08, 10-09], hidden by Me
        t(3, { estimate: 2 }),                                                                // chained after 2: [10-10, 10-11]
        t(4, { explicitStart: '2026-10-20', estimate: 1 }),                                   // singleton
        t(5, { notTaken: { kind: 'not-taken', decisionTicketId: id(9), outcome: 'No', pass: 1 }, category: 'terminal' }),
      ];
      const core = assembleScope({ tickets, edges: [lead(1, 2), lead(2, 3)], keys: none, pins, today: TODAY });
      const seg = (n: number) => core.entries.find((e) => e.id === id(n))?.segments;
      expect(seg(1)).toEqual([{ start: '2026-10-05', end: '2026-10-07', pass: 1, type: 'planned' }]);
      expect(seg(3)).toEqual([{ start: '2026-10-10', end: '2026-10-11', pass: 1, type: 'planned' }]);
      expect(core.entries.find((e) => e.id === id(2))).toBeUndefined();                       // not in scope: not an item
      expect(core.flows).toHaveLength(1);
      expect(core.flows[0]?.nodes.map((n) => n.id)).toContain(id(2));                         // but its plan inputs ride along
      expect(core.entries.find((e) => e.id === id(4))?.flowId).toBeNull();
      expect(core.entries.find((e) => e.id === id(1))?.flowId).toBe(id(1));                   // named by the smallest member
      expect(core.entries.find((e) => e.id === id(5))?.segments).toEqual([{ start: '2026-10-02', end: '2026-10-02', pass: 1, type: 'stub' }]); // D-W4-11
      expect(core.tray.find((r) => r.id === id(5))).toBeUndefined();                          // Not taken is never in the tray
    });

    it('29.295 tray reasons and reachedBy; control: an estimate puts the same ticket on the timeline', () => {
      const dec = t(10, { typeId: DECISION_TYPE_ID, explicitStart: '2026-10-05', estimate: 1, title: 'Client decides' });
      const tickets = [dec, t(11, { estimate: 2 }), t(12), t(13, { explicitStart: '2026-10-09' })];
      const edges = [lead(10, 11, 'Needs rework'), lead(10, 12, 'Yes')];
      const core = assembleScope({ tickets, edges, keys: new Map([[id(10), 'GN-151']]), pins, today: TODAY });
      const row = (n: number) => core.tray.find((r) => r.id === id(n));
      expect(row(12)?.reason).toBe('no-estimate');                                            // ready day, no estimate
      expect(row(12)?.reachedBy).toEqual({ decisionTicketId: id(10), decisionKey: 'GN-151', decisionTitle: 'Client decides', outcome: 'Yes' });
      expect(row(11)).toBeUndefined();                                                        // control: estimate → on the timeline
      expect(core.entries.some((e) => e.id === id(11))).toBe(true);
      const lone = assembleScope({ tickets: [t(20)], edges: [], keys: none, pins, today: TODAY });
      expect(lone.tray[0]?.reason).toBe('no-dates');
    });

    it('29.295 a started ticket with no dates is drawn (PL-4); a draft has no key', () => {
      const started = t(30, { category: 'active', periods: [{ start: '2026-10-01T04:00:00.000Z', end: null, pass: 1 }] });
      const draft = t(31, { draft: true, explicitStart: '2026-10-06', estimate: 1 });
      const core = assembleScope({ tickets: [started, draft], edges: [], keys: new Map([[id(31), null]]), pins, today: TODAY });
      expect(core.entries.find((e) => e.id === id(30))?.segments).toEqual([{ start: '2026-10-01', end: TODAY, pass: 1, type: 'actual' }]);
      expect(core.entries.find((e) => e.id === id(31))).toMatchObject({ draft: true, key: null });
    });
  });

  describe('29.298 the caps', () => {
    it('29.298 over the index cap the longest-ago entries go; control: at the cap nothing is cut', () => {
      const tickets = [1, 2, 3, 4, 5].map((n) => t(n, { explicitStart: `2026-10-0${n}`, estimate: 1 }));
      const cores = [assembleScope({ tickets, edges: [], keys: none, pins, today: TODAY })];
      const cut = mergeCores(TODAY, cores, { index: 3, flow: 300 });
      expect(cut.entries.map((e) => e.id)).toEqual([id(3), id(4), id(5)]);
      expect(cut.truncated).toEqual({ dropped: 2, before: '2026-10-03' });
      expect(mergeCores(TODAY, cores, { index: 5, flow: 300 }).truncated).toBeNull();
    });

    it('29.298 a flow over the flow cap is truncated with no nodes, still planned; control: at the cap it keeps its nodes', () => {
      const chain = (n: number) => Array.from({ length: n }, (_, i) => t(i + 1, i === 0 ? { explicitStart: '2026-10-05', estimate: 1 } : { estimate: 1 }));
      const edges = (n: number) => Array.from({ length: n - 1 }, (_, i) => lead(i + 1, i + 2));
      const big = assembleScope({ tickets: chain(5), edges: edges(5), keys: none, pins, today: TODAY }, { index: 100, flow: 4 });
      expect(big.flows[0]).toMatchObject({ truncated: true, nodes: [] });
      expect(big.entries).toHaveLength(5);
      const ok = assembleScope({ tickets: chain(4), edges: edges(4), keys: none, pins, today: TODAY }, { index: 100, flow: 4 });
      expect(ok.flows[0]?.truncated).toBe(false);
      expect(ok.flows[0]?.nodes).toHaveLength(4);
    });
  });
  ```
  Run: `"$SR" wtg4-t1 -- pnpm --filter @gisik-nokma/server exec vitest run test/timeline/assemble.test.ts --maxWorkers=2 > /tmp/wtg4-t1.log 2>&1; tail -30 /tmp/wtg4-t1.log`. Expected: FAIL (`assemble.js` does not exist).

  `apps/server/src/timeline/assemble.ts`:
  ```ts
  import {
    istDayOf,
    planFlow,
    segmentsFor,
    TIMELINE_FLOW_CAP,
    TIMELINE_INDEX_CAP,
    type FlowNode,
    type TimelineDetail,
    type TimelineEntry,
    type TimelineFlow,
    type TimelinePin,
    type TimelineTrayItem,
    type WorkPeriod,
  } from '@gisik-nokma/domain';

  /** One loaded ticket: what the SQL read plus the facts the assembler needs. Pure data, so the assembler is testable without a database. */
  export type LoadedTicket = {
    id: string; workspaceId: string; projectId: string; stateName: string;
    assigneeId: string | null; title: string;
    /** Passes the project / Me narrowing. Out-of-scope tickets are flow members only. */
    inScope: boolean;
    /** IST day of `TicketState.closed.at` (null when open): the stub day of a never-started Not-taken ticket (D-W4-11). */
    closedDay: string | null;
    /** Part 2's single flow input (type, state, category, draft, dates, estimates, wait-for-all, periods as instants, passes, rounds, `notTaken`), made in `load.ts` by `flowNodeOf(rowToTicketState(row), def, { draft })` and by nothing else (Part 2 T10). */
    node: FlowNode;
  };
  export type LoadedEdge = { workspaceId: string; from: string; to: string; kind: 'leads_to' | 'blocks'; label: string | null };
  export type Limits = { index: number; flow: number };
  export const DEFAULT_LIMITS: Limits = { index: TIMELINE_INDEX_CAP, flow: TIMELINE_FLOW_CAP };

  export type ScopeCore = {
    today: string;
    entries: TimelineEntry[];
    flows: TimelineFlow[];
    tray: TimelineTrayItem[];
    details: Map<string, TimelineDetail>;
    truncated: null | { dropped: number; before: string };
  };

  const NO_PIN: TimelinePin = { notes: 0, attachments: 0 };

  /**
   * Weakly connected components over `leads_to` edges whose two ends are both LOADED: a hidden ticket is simply never loaded, so it is a hole
   * and the walk cannot pass through it (FL-1). A component is named by its smallest member id; members are sorted. Deterministic.
   */
  export function componentsOf(ids: readonly string[], edges: readonly LoadedEdge[]): Map<string, string[]> {
    const parent = new Map(ids.map((x) => [x, x]));
    const find = (x: string): string => {
      let r = x;
      while (parent.get(r) !== r) r = parent.get(r) as string;
      for (let c = x; parent.get(c) !== r; ) { const next = parent.get(c) as string; parent.set(c, r); c = next; }
      return r;
    };
    for (const e of edges) {
      if (e.kind !== 'leads_to' || !parent.has(e.from) || !parent.has(e.to)) continue;
      const a = find(e.from), b = find(e.to);
      if (a !== b) parent.set(a < b ? b : a, a < b ? a : b); // always attach the larger root under the smaller: roots stay the minimum
    }
    const out = new Map<string, string[]>();
    for (const x of [...ids].sort()) {
      const r = find(x);
      out.set(r, [...(out.get(r) ?? []), x]);
    }
    return out;
  }

  /** `FlowNode.periods` are instants (WP-1); `segmentsFor` draws IST days. `planFlow` converts for itself (Part 2 T11, `istDayOf(period.end)`). */
  export const dayPeriods = (periods: readonly WorkPeriod[]) =>
    periods.map((p) => ({ start: istDayOf(p.start), end: p.end === null ? null : istDayOf(p.end), pass: p.pass }));

  export function assembleScope(
    i: { tickets: readonly LoadedTicket[]; edges: readonly LoadedEdge[]; keys: ReadonlyMap<string, string | null>; pins: ReadonlyMap<string, TimelinePin>; today: string },
    limits: Limits = DEFAULT_LIMITS,
  ): ScopeCore {
    const byId = new Map(i.tickets.map((t) => [t.id, t]));
    const entries: TimelineEntry[] = [];
    const flows: TimelineFlow[] = [];
    const tray: TimelineTrayItem[] = [];
    const details = new Map<string, TimelineDetail>();

    for (const [root, members] of componentsOf([...byId.keys()], i.edges)) {
      const set = new Set(members);
      const inFlow = members.length > 1;
      const nodes = members.map((m) => (byId.get(m) as LoadedTicket).node);
      const inner = i.edges.filter((e) => set.has(e.from) && set.has(e.to));
      const plan = planFlow({ nodes, edges: inner.filter((e) => e.kind === 'leads_to').map(({ from, to, label }) => ({ sourceId: from, targetId: to, label })) });
      const tooBig = members.length > limits.flow;
      if (inFlow && members.some((m) => byId.get(m)?.inScope === true)) {
        flows.push({
          id: root, workspaceId: (byId.get(root) as LoadedTicket).workspaceId, truncated: tooBig, nodes: tooBig ? [] : nodes,
          edges: tooBig ? [] : inner.map(({ from, to, kind, label }) => ({ from, to, kind, label })),
        });
      }
      for (const m of members) {
        const tk = byId.get(m) as LoadedTicket;
        const np = plan.get(m);
        if (np === undefined) continue;
        const key = i.keys.get(m) ?? null;
        const n = tk.node;
        const segments = segmentsFor({ periods: dayPeriods(n.periods), planned: np.intervals, notTaken: n.notTaken, closedDay: tk.closedDay, today: i.today });
        const firstPlanned = np.intervals.find((p) => p.pruned !== true);
        details.set(m, {
          id: m, title: tk.title, stateId: n.stateId, stateName: tk.stateName, assigneeId: tk.assigneeId,
          dueDate: n.explicitDue, basis: firstPlanned?.basis ?? null,
          startsBeforePredecessor: np.intervals.some((p) => p.startsBeforePredecessor === true),
          round: n.rounds, waitForAll: n.waitForAll, estimate: n.estimate,
          passes: n.isDecision ? n.passes : null,
        });
        if (!tk.inScope) continue;
        if (segments.length > 0) {
          entries.push({
            id: m, workspaceId: tk.workspaceId, key, draft: n.draft,
            kind: n.isDecision ? 'decision' : 'ticket', lane: tk.projectId,
            segments, pin: i.pins.get(m) ?? NO_PIN, resolution: n.notTaken, category: n.category, flowId: inFlow ? root : null,
          });
        } else if (n.notTaken === null) {
          tray.push({
            id: m, workspaceId: tk.workspaceId, projectId: tk.projectId, key, title: tk.title, draft: n.draft,
            reason: np.unscheduled ?? 'no-dates',
            reachedBy: reachedBy(m, inner, byId, i.keys),
          });
        }
      }
    }
    entries.sort((a, b) => (a.id < b.id ? -1 : 1));
    tray.sort((a, b) => (a.id < b.id ? -1 : 1));
    return { today: i.today, entries, flows, tray, details, truncated: null };
  }

  /** TG-6 / TG-12: the lowest-id Decision with a LABELLED edge into this ticket. */
  function reachedBy(
    target: string, edges: readonly LoadedEdge[], byId: ReadonlyMap<string, LoadedTicket>, keys: ReadonlyMap<string, string | null>,
  ): TimelineTrayItem['reachedBy'] {
    const via = edges
      .filter((e) => e.kind === 'leads_to' && e.to === target && e.label !== null && byId.get(e.from)?.node.isDecision === true)
      .sort((a, b) => (a.from < b.from ? -1 : 1))[0];
    if (via === undefined) return null;
    const d = byId.get(via.from) as LoadedTicket;
    return { decisionTicketId: d.id, decisionKey: keys.get(d.id) ?? null, decisionTitle: d.title, outcome: via.label as string };
  }

  const endOf = (e: TimelineEntry): string => e.segments.reduce((m, s) => (s.end > m ? s.end : m), '');

  /** Merge per-workspace cores and apply PR-0's cap: the entries that ended longest ago go first. */
  export function mergeCores(today: string, cores: readonly ScopeCore[], limits: Limits = DEFAULT_LIMITS): ScopeCore {
    const all = cores.flatMap((c) => c.entries);
    let entries = all;
    let truncated: ScopeCore['truncated'] = null;
    if (all.length > limits.index) {
      const byEnd = [...all].sort((a, b) => (endOf(a) < endOf(b) ? -1 : endOf(a) > endOf(b) ? 1 : a.id < b.id ? -1 : 1));
      const keep = new Set(byEnd.slice(all.length - limits.index).map((e) => e.id));
      entries = all.filter((e) => keep.has(e.id));
      truncated = { dropped: all.length - limits.index, before: endOf(byEnd[all.length - limits.index] as TimelineEntry) };
    }
    return {
      today, entries,
      flows: cores.flatMap((c) => c.flows),
      tray: cores.flatMap((c) => c.tray),
      details: new Map(cores.flatMap((c) => [...c.details])),
      truncated,
    };
  }
  ```
  In the test above `t()` splits its overrides into the `LoadedTicket` facts and Part 2's `FlowNode` (`fnode`); `assembleScope`'s second argument is the injectable limits. Run the test again. Expected: PASS (29.295, 29.298 pure halves).
  - If `planFlow`'s landed output names differ from `np.intervals` / `np.unscheduled` (Part 2 plan :4391), change `assemble.ts` only and say so in the handoff.
  - Flip 29.295 and 29.298 to ✅ (29.298's `mergeCores` half is covered; the flow cap half is covered in the same test).

  Commit.

- [ ] **Step 3: One collector for Home's numbers, and the scope summary (29.293)**

  Case line:
  - `- ❌ **29.293 — `readHomeSummary` over ONE readable workspace with no narrowing equals `readHome` for the same viewer and instant (counts and ids); over several it sums the tickets and notes, counts members once per person, classifies each ticket by its own workspace's window (`dueSoonDays` is a map), and drops an unreadable workspace; its p95 over a three-workspace scope is ≤ 200 ms (gated, KG Home's `HOME_PERF` pattern). Control: Me narrows tickets and not members or notes. `asOf` holds one entry per readable workspace (none for a dropped one) equal to that workspace's `max(workspace_seq)` read before the load (D-W4-23); control: appending an event after the read does not change an `asOf` already returned. Mutation: count members per workspace → the distinct-people assertion reds.`

  **First, before `home.ts` is touched, capture the golden.** The world mints its ids with `newUlid()` on every run (`test/helpers/read-scenario.ts:123-126`), so a raw JSON golden would fail on its second run; the golden is therefore NORMALISED: every id the world names becomes its field name, every other ULID becomes `#`, arrays are sorted, keys are sorted, and `generatedAt` is dropped. The clock is frozen at `SCENARIO_NOW` (`read-scenario.ts:20`, wired at `read-app.ts:215`), so classification by day is stable. `apps/server/test/timeline/home-golden.ts` (the helper, shared with T3) and `home-golden.test.ts` (read `test/routes/home.test.ts` first and copy its database, app and `read` world setup):
  ```ts
  // home-golden.ts
  import { ULID_REGEX } from '@gisik-nokma/domain';
  /** `names`: the world's own id fields (`read.world`) so a failure says WHICH entity moved. Everything else that looks like an id is `#`. */
  export function normaliseHome(body: object, world: Record<string, unknown>): string {
    const names = new Map(Object.entries(world).filter(([, v]) => typeof v === 'string').map(([k, v]) => [v as string, k]));
    const norm = (o: unknown): unknown =>
      typeof o === 'string' ? (names.get(o) ?? (ULID_REGEX.test(o) ? '#' : o))
      : Array.isArray(o) ? o.map(norm).map((x) => JSON.stringify(x)).sort().map((x) => JSON.parse(x) as unknown)
      : o !== null && typeof o === 'object' ? Object.fromEntries(Object.entries(o).filter(([k]) => k !== 'generatedAt').sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => [k, norm(v)]))
      : o;
    return JSON.stringify(norm(body), null, 1) + '\n';
  }

  // home-golden.test.ts
  import { readFileSync, writeFileSync } from 'node:fs';
  import { describe, expect, it } from 'vitest';
  import { SCENARIO_NOW } from '../helpers/read-scenario.js';
  import { normaliseHome } from './home-golden.js';
  // … KG Home's setup: database, `read` world, `resolveEffectiveRole`, `readHome`
  const FILE = new URL('./fixtures/home-golden.json', import.meta.url);
  describe('29.307 readHome is byte-identical across the collector split', () => {
    it('29.307 the normalised body for the KG Home world equals the stored golden, twice in a row; control: a changed count is caught', async () => {
      const eff = await resolveEffectiveRole(db.pool, read.users.owner, read.world.workspaceId);
      const body = normaliseHome(await readHome(db.pool, eff, read.users.owner, read.world.workspaceId, SCENARIO_NOW), read.world);
      if (process.env['WTG4_CAPTURE'] === '1') writeFileSync(FILE, body);
      expect(body).toBe(readFileSync(FILE, 'utf8'));
      const again = normaliseHome(await readHome(db.pool, eff, read.users.owner, read.world.workspaceId, SCENARIO_NOW), read.world);
      expect(again).toBe(body); // stable across calls
      expect(normaliseHome({ ...JSON.parse(body), counts: { tickets: -1 } }, read.world)).not.toBe(body); // control: the comparison can fail
    });
  });
  ```
  (`read.users.owner` and `read.world.workspaceId`: copy the names `test/routes/home.test.ts` uses for the owner's id and the workspace id; they are the only two to adapt.) Run it ONCE with `WTG4_CAPTURE=1` on the untouched `home.ts`, run it again WITHOUT the flag (a fresh world, fresh ids: it must still pass, or the normalisation is wrong), check `git diff --stat` shows only the new files, and commit test + helper + fixture: `wtg4 T1: golden of readHome before the collector split`. After the split below, run it without the flag: PASS is the byte-identical proof, and T3's route test reuses `normaliseHome` and the same file. The test title carries 29.307 because that case is the byte-identical claim; its case line is seeded by T3 and flips there, so this commit does not touch it.

  In `apps/server/src/routes/home.ts` (KG Home T1), split `readHome`. The landed body is the plan's Step 3 code; the diff is: the signature, two optional clauses, and the two-function split. Replace `readHome` with:
  ```ts
  export type HomeNarrow = { projectIds?: readonly string[]; mine?: boolean };
  export type HomeCollected = {
    workspaceId: string;
    dueSoonDays: number;
    tickets: string[];
    open: string[];
    pastDue: Dated[];
    dueSoon: Dated[];
    members: string[] | null;
    notes: string[];
  };

  /**
   * Everything `readHome` computed, before it is shaped. `narrow` is the Home scope's (HM-2): selected projects narrow the tickets and the notes
   * (a note with no home project follows its workspace); Me narrows the TICKETS only, to assigned OR collaborating (D-W4-4,
   * `read/compile-filter.ts:100`); the roster is never narrowed. `narrow = {}` is the single-workspace Home, unchanged.
   */
  export async function collectHome(
    db: Queryable, eff: EffectiveRole, viewerId: string, workspaceId: string, now: Date, narrow: HomeNarrow = {},
  ): Promise<HomeCollected> {
    const settings = await getWorkspaceSettings(db, workspaceId);
    const today = istDayOf(now.toISOString());
    const horizon = addIstDays(today, settings.dueSoonDays);
    const projects = narrow.projectIds === undefined ? [] : [...narrow.projectIds];

    const params = new SqlParams();
    const where = [`t.workspace_id = ${params.add(workspaceId)}`, visibleTicketsWhere(eff, viewerId, params), LIVE_TICKET_WHERE];
    if (projects.length > 0) where.push(`t.project_id = ANY(${params.add(projects)}::text[])`);
    if (narrow.mine === true) {
      where.push(`(t.assignee_id = ${params.add(viewerId)} OR t.collaborator_ids @> to_jsonb(${params.add(viewerId)}::text))`);
    }
    // … the ticket SELECT, the Open / pastDue / dueSoon loop and the notes SELECT are the landed body, unchanged, except that the notes
    // WHERE gains, after `'n.deleted = FALSE'`:
    //   projects.length > 0 ? `(n.home_project_id IS NULL OR n.home_project_id = ANY(${noteParams.add(projects)}::text[]))` : 'TRUE'
    const members = await visibleMemberIds(db, eff, workspaceId);
    return { workspaceId, dueSoonDays: settings.dueSoonDays, tickets, open, pastDue, dueSoon, members, notes };
  }

  export function toHomeResponse(c: HomeCollected, now: Date): HomeResponse {
    return {
      workspaceId: c.workspaceId,
      generatedAt: now.toISOString(),
      dueSoonDays: c.dueSoonDays,
      counts: {
        tickets: c.tickets.length, open: c.open.length, pastDue: c.pastDue.length, dueSoon: c.dueSoon.length,
        members: c.members === null ? null : c.members.length, notes: c.notes.length,
      },
      ids: {
        tickets: capIds(c.tickets), open: capIds(c.open), pastDue: capIds(c.pastDue.map((d) => d.id)),
        dueSoon: capIds(c.dueSoon.map((d) => d.id)), members: capIds(c.members ?? []), notes: capIds(c.notes),
      },
    };
  }

  export async function readHome(
    db: Queryable, eff: EffectiveRole, viewerId: string, workspaceId: string, now: Date,
  ): Promise<HomeResponse> {
    return toHomeResponse(await collectHome(db, eff, viewerId, workspaceId, now), now);
  }
  ```
  `Dated` is exported (it was module-private); the `// …` comment above stands for the landed lines you keep, not for code to delete.

  Re-run KG Home's `test/routes/home.test.ts` and MCP `workspace-tools.test.ts` (14.305): PASS, unedited. That is the "byte-identical" proof.

  `apps/server/src/timeline/as-of.ts` (D-W4-23; `readStreamSeq` is `sync/stream-seq.ts:25` and takes `Pool | PoolClient`, which is `Queryable`):
  ```ts
  import { readStreamSeq } from '../sync/stream-seq.js';
  import type { Queryable } from '../db/queryable.js';
  import type { ReadableWorkspace } from './scope.js';

  /**
   * The cut a response is consistent with: each readable workspace's stream head. It is read BEFORE the scope is loaded, so an event committed
   * while the load runs has a `workspaceSeq` above the value returned and the client applies it; reading after would claim events the data
   * does not hold. `workspace_seq` is assigned under `lockWorkspace`, so nothing at or below a committed max is still in flight (`stream-seq.ts:13-19`).
   */
  export async function readAsOf(db: Queryable, readable: readonly ReadableWorkspace[]): Promise<Record<string, number>> {
    const heads = await Promise.all(readable.map(async (r) => [r.workspaceId, await readStreamSeq(db, r.workspaceId)] as const));
    return Object.fromEntries(heads);
  }
  ```

  `apps/server/src/timeline/read-summary.ts`:
  ```ts
  import { HOME_ID_CAP, type HomeSummaryResponse } from '@gisik-nokma/domain';
  import type { Queryable } from '../db/queryable.js';
  import { collectHome, type HomeCollected } from '../routes/home.js';
  import { readAsOf } from './as-of.js';
  import type { ReadableWorkspace, TimelineScope } from './scope.js';

  const byDayThenId = (a: { id: string; day: string }, b: { id: string; day: string }): number =>
    a.day < b.day ? -1 : a.day > b.day ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  const cap = (ids: readonly string[]): string[] => ids.slice(0, HOME_ID_CAP);

  /** HM-2. Counts are lengths of the merged lists BEFORE the id cap, so a count never depends on the cap. */
  export async function readHomeSummary(
    db: Queryable, readable: readonly ReadableWorkspace[], viewerId: string, scope: TimelineScope, now: Date,
  ): Promise<HomeSummaryResponse> {
    const asOf = await readAsOf(db, readable); // BEFORE the load: an event committed during the load is then newer than `asOf`, never silently inside it
    const parts: HomeCollected[] = await Promise.all(
      readable.map(({ workspaceId, eff }) => collectHome(db, eff, viewerId, workspaceId, now, { projectIds: scope.projectIds, mine: scope.mine })),
    );
    const newestFirst = (a: string, b: string): number => (a < b ? 1 : a > b ? -1 : 0); // ULIDs sort by time
    const tickets = parts.flatMap((p) => p.tickets).sort(newestFirst);
    const open = parts.flatMap((p) => p.open).sort(newestFirst);
    const pastDue = parts.flatMap((p) => p.pastDue).sort(byDayThenId);
    const dueSoon = parts.flatMap((p) => p.dueSoon).sort(byDayThenId);
    const notes = parts.flatMap((p) => p.notes);
    const rosters = parts.map((p) => p.members).filter((m): m is string[] => m !== null);
    const members = rosters.length === 0 ? null : [...new Set(rosters.flat())].sort(); // one person, once, across workspaces
    return {
      generatedAt: now.toISOString(),
      asOf,
      workspaceIds: parts.map((p) => p.workspaceId),
      dueSoonDays: Object.fromEntries(parts.map((p) => [p.workspaceId, p.dueSoonDays])),
      counts: {
        tickets: tickets.length, open: open.length, pastDue: pastDue.length, dueSoon: dueSoon.length,
        members: members === null ? null : members.length, notes: notes.length,
      },
      ids: {
        tickets: cap(tickets), open: cap(open), pastDue: cap(pastDue.map((d) => d.id)),
        dueSoon: cap(dueSoon.map((d) => d.id)), members: cap(members ?? []), notes: cap(notes),
      },
    };
  }
  ```
  The test lives in `apps/server/test/timeline/reads.test.ts` (Step 5) so it shares that file's world. Flip 29.293 only when its gated perf half has run (Step 6).

  Commit.

- [ ] **Step 4: Scope, the SQL, pins, and the world (29.296, 29.297)**

  Case lines:
  - `- ❌ **29.296 — the scope gate and the visibility of the load:** an unreadable workspace is dropped silently and `[]` means the caller answers 404; Me includes a ticket the viewer only COLLABORATES on (and excludes one assigned to someone else with no collaboration), and Everyone includes both; a ticket the viewer cannot see is a hole (the flow through it splits, no id of it appears in items, flows, tray or counts); the viewer's own draft is an item with `key: null` and nobody else's is; control: the owner sees the hidden ticket's flow whole. Mutation: drop the `collaborator_ids` arm → the Me assertion reds; load drafts through `visibleTicketsWhere` → the draft assertion reds.`
  - `- ❌ **29.297 — the pin counts the viewer's visible notes and the ticket's attachments:** a workspace-scope note attached to a ticket counts for everyone; the author's private note counts for the author and NOT for another member; a deleted note and a note of a deleted project do not count; a ticket-owned attachment counts; a note-owned attachment (`ticket_id` NULL) does not; control: the same ticket for the owner. Mutation: drop `n.deleted = FALSE` → the deleted-note assertion reds.`

  `apps/server/src/timeline/scope.ts`:
  ```ts
  import { ULID_REGEX } from '@gisik-nokma/domain';
  import type { Queryable } from '../db/queryable.js';
  import type { EffectiveRole } from '../permissions/effective-role.js';
  import { requireMember } from '../read/membership.js';

  export type TimelineScope = { workspaceIds: string[]; projectIds: string[]; mine: boolean };
  export type ReadableWorkspace = { workspaceId: string; eff: EffectiveRole };

  const MAX_WORKSPACES = 20;
  const MAX_PROJECTS = 200;

  function idList(raw: unknown, max: number): string[] | null {
    if (raw === undefined || raw === '') return [];
    if (typeof raw !== 'string') return null;
    const ids = [...new Set(raw.split(','))].sort();
    return ids.length > max || ids.some((x) => !ULID_REGEX.test(x)) ? null : ids;
  }

  /** `?ws=a,b&proj=c&mine=1`. `null` is a 400. The key is canonical (sorted, deduplicated) so a cache can use it. */
  export function parseTimelineScope(query: Record<string, unknown>): TimelineScope | null {
    const ws = idList(query['ws'], MAX_WORKSPACES);
    const proj = idList(query['proj'], MAX_PROJECTS);
    const mine = query['mine'];
    if (ws === null || ws.length === 0 || proj === null) return null;
    if (mine !== undefined && mine !== '1' && mine !== '0') return null;
    return { workspaceIds: ws, projectIds: proj, mine: mine === '1' };
  }

  export const scopeKey = (s: TimelineScope): string => `${s.workspaceIds.join(',')}|${s.projectIds.join(',')}|${s.mine ? 1 : 0}`;

  /**
   * D-W4-3: a workspace the viewer cannot read is DROPPED, silently; the caller answers 404 only when nothing readable is left. A workspace that does
   * not exist takes the same path as a forbidden one (`requireMember` returns null for both), so the drop leaks nothing.
   */
  export async function readableWorkspaces(db: Queryable, userId: string, scope: TimelineScope): Promise<ReadableWorkspace[]> {
    const out: ReadableWorkspace[] = [];
    for (const workspaceId of scope.workspaceIds) {
      const eff = await requireMember(db, userId, workspaceId);
      if (eff !== null) out.push({ workspaceId, eff });
    }
    return out;
  }
  ```
  `apps/server/src/timeline/load.ts`:
  ```ts
  import { flowNodeOf, istDayOf, statesWithBacklog, type TimelinePin } from '@gisik-nokma/domain';
  import type { Queryable } from '../db/queryable.js';
  import type { EffectiveRole } from '../permissions/effective-role.js';
  import { rowToTicketState } from '../projections/tickets.js';
  import { listMyDrafts } from '../read/drafts.js';
  import { NOTE_PROJECT_LIVE_WHERE } from '../read/notes.js';
  import { SqlParams } from '../read/sql-params.js';
  import { LIVE_TICKET_WHERE, visibleNotesWhere, visibleTicketsWhere } from '../read/visible-where.js';
  import { foldedWorkflowDefs } from '../read/workflow-defs.js';
  import type { LoadedEdge, LoadedTicket } from './assemble.js';
  import type { TimelineScope } from './scope.js';

  /** The projection row `rowToTicketState` folds, declared as Part 2 T12's `walkFlow` declares it (`read-flow.ts`). `t.*` carries Part 2's and Drafts' columns. */
  type TicketRow = Parameters<typeof rowToTicketState>[0];
  type Row = TicketRow & { in_scope?: boolean };
  type Def = Parameters<typeof flowNodeOf>[1];

  /** Part 2's one way to make a flow input: fold the row, then `flowNodeOf` against the ticket's own workflow version (Part 2 plan :5359-5384). */
  function loaded(row: Row, inScope: boolean, draft: boolean, def: Def, stateName: string): LoadedTicket {
    const title = row.fields['title']?.value;
    const state = rowToTicketState(row);
    return {
      id: row.ticket_id, workspaceId: row.workspace_id, projectId: row.project_id, stateName,
      assigneeId: row.assignee_id, title: typeof title === 'string' ? title : '', inScope,
      closedDay: state.closed?.at ? istDayOf(state.closed.at) : null,
      node: flowNodeOf(state, def, { draft }),
    };
  }

  const meClause = (viewerId: string, params: SqlParams): string =>
    `(t.assignee_id = ${params.add(viewerId)} OR t.collaborator_ids @> to_jsonb(${params.add(viewerId)}::text))`;

  /**
   * One workspace's loaded set: the viewer's VISIBLE live tickets that are in scope, plus every visible ticket at either end of a `leads_to`
   * (flow members the narrowing leaves out), plus the viewer's OWN drafts through `listMyDrafts` (D-W4-5). Hidden tickets are not loaded, so they are
   * holes. Edges are kept only when BOTH ends are loaded.
   */
  export async function loadWorkspace(
    db: Queryable, eff: EffectiveRole, viewerId: string, workspaceId: string, scope: TimelineScope,
  ): Promise<{ tickets: LoadedTicket[]; edges: LoadedEdge[]; rows: Row[] }> {
    const params = new SqlParams();
    const scoped: string[] = ['TRUE'];
    if (scope.projectIds.length > 0) scoped.push(`t.project_id = ANY(${params.add(scope.projectIds)}::text[])`);
    if (scope.mine) scoped.push(meClause(viewerId, params));
    const inScopeSql = scoped.join(' AND ');
    const visible = `${visibleTicketsWhere(eff, viewerId, params)} AND ${LIVE_TICKET_WHERE}`;
    const { rows } = await db.query<Row>(
      `SELECT t.*, (${inScopeSql}) AS in_scope
         FROM proj_tickets t
         JOIN proj_visibility v ON v.ticket_id = t.ticket_id
        WHERE t.workspace_id = ${params.add(workspaceId)} AND ${visible}
          AND ((${inScopeSql}) OR EXISTS (
                SELECT 1 FROM proj_ticket_links l
                 WHERE l.kind = 'leads_to' AND (l.source_id = t.ticket_id OR l.target_id = t.ticket_id)))
        ORDER BY t.ticket_id`,
      params.toArray(),
    );

    const mine = await listMyDrafts(db, viewerId, workspaceId);
    const draftRows = mine.length === 0 ? [] : (await db.query<Row>(
      'SELECT t.* FROM proj_tickets t WHERE t.workspace_id = $1 AND t.ticket_id = ANY ($2::text[])', // Part 2 T12's row fetch
      [workspaceId, mine.map((d) => d.ticketId)],
    )).rows;
    const draftIds = new Set(draftRows.map((r) => r.ticket_id));
    const all = [...rows.filter((r) => !draftIds.has(r.ticket_id)), ...draftRows];

    const defs = await foldedWorkflowDefs(db, workspaceId, all.map((r) => ({ workflowId: r.workflow_id, version: r.workflow_version })));
    const defOf = (r: Row): Def => {
      const def = defs.get(`${r.workflow_id}@${r.workflow_version}`);
      if (def === undefined) throw new Error(`loadWorkspace: no workflow definition ${r.workflow_id}@${r.workflow_version} for ticket ${r.ticket_id}; the projection and the ledger disagree`);
      return def;
    };
    const stateName = (r: Row): string => statesWithBacklog(defOf(r)).find((s) => s.id === r.state_id)?.name ?? r.state_id;
    const draftInScope = (r: Row): boolean =>
      (scope.projectIds.length === 0 || scope.projectIds.includes(r.project_id)) &&
      (!scope.mine || r.assignee_id === viewerId || (r.collaborator_ids as string[]).includes(viewerId));
    const tickets = all.map((r) => loaded(r, draftIds.has(r.ticket_id) ? draftInScope(r) : r.in_scope === true, draftIds.has(r.ticket_id), defOf(r), stateName(r)));

    const ids = new Set(tickets.map((t) => t.id));
    const { rows: edgeRows } = await db.query<{ source_id: string; target_id: string; kind: 'leads_to' | 'blocks'; label: string | null }>(
      `SELECT source_id, target_id, kind, label FROM proj_ticket_links WHERE workspace_id = $1 AND kind IN ('leads_to', 'blocks')`,
      [workspaceId],
    );
    const edges: LoadedEdge[] = edgeRows
      .filter((e) => ids.has(e.source_id) && ids.has(e.target_id))
      .map((e) => ({ workspaceId, from: e.source_id, to: e.target_id, kind: e.kind, label: e.label }));
    return { tickets, edges, rows: all };
  }

  /**
   * TG-11 / D-W4-2: per ticket, the notes THIS viewer can see attached to it and its ticket-owned attachments. A note-owned attachment has
   * `ticket_id IS NULL` (`1790110000000_attachments-note-owner.sql`) and is not counted; no attachment-removal event exists on the tip, so every row is live
   * until a purge deletes it (`purge/erasure.ts:85`).
   */
  export async function loadPins(db: Queryable, eff: EffectiveRole, viewerId: string, ticketIds: readonly string[]): Promise<Map<string, TimelinePin>> {
    const pins = new Map<string, TimelinePin>();
    if (ticketIds.length === 0) return pins;
    const params = new SqlParams();
    const ids = params.add([...ticketIds]);
    const notes = await db.query<{ ticket_id: string; n: number }>(
      `SELECT pa.ticket_id, count(DISTINCT n.note_id)::int AS n
         FROM proj_note_attachments pa
         JOIN proj_notes n ON n.note_id = pa.note_id
        WHERE pa.ticket_id = ANY(${ids}::text[]) AND n.deleted = FALSE AND ${NOTE_PROJECT_LIVE_WHERE} AND ${visibleNotesWhere(eff, viewerId, params)}
        GROUP BY pa.ticket_id`,
      params.toArray(),
    );
    const files = await db.query<{ ticket_id: string; n: number }>(
      `SELECT ticket_id, count(*)::int AS n FROM attachments WHERE ticket_id = ANY($1::text[]) GROUP BY ticket_id`,
      [[...ticketIds]],
    );
    for (const r of notes.rows) pins.set(r.ticket_id, { notes: r.n, attachments: 0 });
    for (const r of files.rows) pins.set(r.ticket_id, { notes: pins.get(r.ticket_id)?.notes ?? 0, attachments: r.n });
    return pins;
  }
  ```
  `compute.ts`:
  ```ts
  import { istDayOf } from '@gisik-nokma/domain';
  import type { Queryable } from '../db/queryable.js';
  import { cardKeysFor } from '../read/ticket-cards.js';
  import { assembleScope, mergeCores, DEFAULT_LIMITS, type Limits, type ScopeCore } from './assemble.js';
  import { loadPins, loadWorkspace } from './load.js';
  import type { ReadableWorkspace, TimelineScope } from './scope.js';

  /** The ONE core the index, chunk, tray (and Part 5's `get_timeline`) slice. Planning runs per flow component inside `assembleScope`. */
  export async function computeScope(
    db: Queryable, readable: readonly ReadableWorkspace[], viewerId: string, scope: TimelineScope, now: Date, limits: Limits = DEFAULT_LIMITS,
  ): Promise<ScopeCore> {
    const today = istDayOf(now.toISOString());
    const cores = await Promise.all(
      readable.map(async ({ workspaceId, eff }) => {
        const loaded = await loadWorkspace(db, eff, viewerId, workspaceId, scope);
        const keys = await cardKeysFor(db, loaded.rows);
        const pins = await loadPins(db, eff, viewerId, loaded.tickets.filter((t) => t.inScope).map((t) => t.id));
        return assembleScope({ tickets: loaded.tickets, edges: loaded.edges, keys, pins, today }, limits);
      }),
    );
    return mergeCores(today, cores, limits);
  }
  ```
  The world helper `apps/server/test/timeline/helpers/world.ts` (copy `seedReadScenario`'s event shapes; ids minted with `newUlid`, one fresh database per file as that helper's docblock requires):
  ```ts
  import type { Pool } from 'pg';
  import { newUlid, type LedgerEvent } from '@gisik-nokma/domain';
  import { applyCommitted, makeCommitted } from '../../helpers/apply.js';
  import { membershipId } from '../../helpers/read-scenario.js'; // or the helper's own export: grep `membershipId` first

  export type TWorkspace = { workspaceId: string; wf: string; p1: string; p2: string };
  export type TimelineWorld = {
    ama: string; bo: string; cy: string;
    A: TWorkspace; B: TWorkspace; C: TWorkspace;
    t: Record<'dated' | 'mine' | 'collab' | 'other' | 'hidden' | 'step1' | 'step2' | 'draft' | 'fStart' | 'fDec' | 'fYes' | 'fNo' | 'bTask', string>;
  };

  /** ama owns A and is a member of B; bo is a member of A; cy owns C (ama is NOT in C). */
  export async function seedTimelineWorld(pool: Pool): Promise<TimelineWorld> {
    const ama = newUlid(), bo = newUlid(), cy = newUlid();
    const mk = async (owner: string, members: string[]): Promise<TWorkspace> => {
      const w: TWorkspace = { workspaceId: newUlid(), wf: `wf-${newUlid()}`, p1: newUlid(), p2: newUlid() };
      const ws = { workspaceId: w.workspaceId, actorId: owner };
      const ev: LedgerEvent[] = [
        makeCommitted({ ...ws, entity: { kind: 'workspace', id: w.workspaceId }, type: 'workspace.created', payload: { name: 'W' } }),
        makeCommitted({ ...ws, entity: { kind: 'membership', id: membershipId(w.workspaceId, owner) }, type: 'membership.granted', payload: { userId: owner, role: 'owner' } }),
        ...members.map((m) => makeCommitted({ ...ws, entity: { kind: 'membership', id: membershipId(w.workspaceId, m) }, type: 'membership.granted', payload: { userId: m, role: 'member' } })),
        makeCommitted({ ...ws, entity: { kind: 'project', id: w.p1 }, type: 'project.created', payload: { name: 'Client pitches' } }),
        makeCommitted({ ...ws, entity: { kind: 'project', id: w.p2 }, type: 'project.created', payload: { name: 'Website' } }),
        ...[owner, ...members].flatMap((u) => [w.p1, w.p2].map((p) => makeCommitted({ ...ws, entity: { kind: 'project', id: p }, type: 'project.member_added', payload: { userId: u, projectAdmin: u === owner } }))),
        makeCommitted({ ...ws, entity: { kind: 'workflow', id: w.wf }, type: 'workflow.defined', payload: {
          id: w.wf, version: 1, name: 'Flow', initialStateId: 'todo',
          states: [{ id: 'todo', name: 'To do', category: 'open' }, { id: 'doing', name: 'Doing', category: 'active' }, { id: 'done', name: 'Done', category: 'terminal' }],
          transitions: ['todo', 'doing', 'done'].map((to) => ({ from: '*', to, rules: [] })),
        } }),
        makeCommitted({ ...ws, entity: { kind: 'ticket-type', id: 'task' }, type: 'ticket-type.defined', payload: { id: 'task', name: 'Task', icon: 'check', rank: 3, workflowId: w.wf, fields: [] } }),
        makeCommitted({ ...ws, entity: { kind: 'ticket-type', id: 'decision' }, type: 'ticket-type.defined', payload: { id: 'decision', name: 'Decision', icon: 'diamond', rank: 3, workflowId: w.wf, fields: [] } }),
      ];
      await applyCommitted(pool, ev);
      return w;
    };
    const A = await mk(ama, [bo]);
    const B = await mk(bo, [ama]);
    const C = await mk(cy, []);
    const t = Object.fromEntries(['dated', 'mine', 'collab', 'other', 'hidden', 'step1', 'step2', 'draft', 'fStart', 'fDec', 'fYes', 'fNo', 'bTask'].map((k) => [k, newUlid()])) as TimelineWorld['t'];
    const wa = { workspaceId: A.workspaceId, actorId: ama };
    const task = (id: string, w: TWorkspace, project: string, title: string, extra: Record<string, unknown> = {}, typeId = 'task'): LedgerEvent =>
      makeCommitted({ workspaceId: w.workspaceId, actorId: ama, entity: { kind: 'ticket', id }, type: 'ticket.created', payload: { typeId, projectId: project, parentId: null, title, ...extra } });
    const set = (id: string, w: TWorkspace, fieldId: string, value: unknown): LedgerEvent =>
      makeCommitted({ workspaceId: w.workspaceId, actorId: ama, entity: { kind: 'ticket', id }, type: 'ticket.field_set', payload: { fieldId, value } });
    const link = (from: string, to: string, w: TWorkspace, label?: string): LedgerEvent =>
      makeCommitted({ workspaceId: w.workspaceId, actorId: ama, entity: { kind: 'ticket', id: from }, type: 'ticket.link_added', payload: { kind: 'leads_to', targetId: to, ...(label === undefined ? {} : { label }) } });
    await applyCommitted(pool, [
      task(t.dated, A, A.p1, 'Dated', { startDate: { date: '2026-10-05' }, dueDate: { date: '2026-10-07' } }),
      task(t.mine, A, A.p1, 'Mine', { startDate: { date: '2026-10-08' }, estimate: 2 }),
      makeCommitted({ ...wa, entity: { kind: 'ticket', id: t.mine }, type: 'ticket.assigned', payload: { assigneeId: ama } }),
      task(t.collab, A, A.p1, 'Collab only', { startDate: { date: '2026-10-09' }, estimate: 1 }),
      makeCommitted({ ...wa, entity: { kind: 'ticket', id: t.collab }, type: 'ticket.assigned', payload: { assigneeId: bo } }),
      makeCommitted({ ...wa, entity: { kind: 'ticket', id: t.collab }, type: 'ticket.collaborator_added', payload: { userId: ama } }),
      task(t.other, A, A.p1, 'Someone else', { startDate: { date: '2026-10-09' }, estimate: 1 }),
      makeCommitted({ ...wa, entity: { kind: 'ticket', id: t.other }, type: 'ticket.assigned', payload: { assigneeId: bo } }),
      // a three-ticket chain whose middle is hidden from bo (explicit audience: ama only)
      task(t.step1, A, A.p1, 'Step 1', { startDate: { date: '2026-10-12' }, estimate: 1 }),
      task(t.hidden, A, A.p1, 'Hidden middle', { estimate: 1 }),
      makeCommitted({ ...wa, entity: { kind: 'ticket', id: t.hidden }, type: 'visibility.set', payload: { ticketId: t.hidden, mode: 'explicit', userIds: [ama] } }),
      task(t.step2, A, A.p1, 'Step 2', { estimate: 1 }),
      link(t.step1, t.hidden, A), link(t.hidden, t.step2, A),
      // a diamond in project 2
      task(t.fStart, A, A.p2, 'Brief', { startDate: { date: '2026-10-05' }, estimate: 3 }),
      task(t.fDec, A, A.p2, 'Client decides', { estimate: 1 }, 'decision'),
      task(t.fYes, A, A.p2, 'Approved', { estimate: 2 }),
      task(t.fNo, A, A.p2, 'Rework', { estimate: 2 }),
      link(t.fStart, t.fDec, A), link(t.fDec, t.fYes, A, 'Yes'), link(t.fDec, t.fNo, A, 'No'),
      // workspace B: one dated task that ama sees as a member
      task(t.bTask, B, B.p1, 'B task', { startDate: { date: '2026-10-06' }, estimate: 1 }),
    ]);
    return { ama, bo, cy, A, B, C, t };
  }
  ```
  Notes on the helper: (1) `ticket.created`'s `startDate`, `dueDate` and `estimate` are birth members (spec ES-1, `ticket-events.ts:150-151`); if Part 2 shaped `estimate` differently, change `task()` only. (2) The draft fixture `t.draft` is created in the test itself with Drafts' own `ticket.created` form (`draft: true`, drafts spec R25 / §3.2): read the Drafts plan's fixture helper and copy it, because the draft payload shape is Drafts'. (3) `membershipId` is the helper `seedNeighbourWorkspace` imports (`test/helpers/read-app.ts`): `grep -n "membershipId" apps/server/test/helpers/*.ts` and import from where it lives.

  `apps/server/test/timeline/scope-visibility.test.ts` (29.296):
  ```ts
  import { afterAll, beforeAll, describe, expect, it } from 'vitest';
  import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
  import { computeScope } from '../../src/timeline/compute.js';
  import { parseTimelineScope, readableWorkspaces } from '../../src/timeline/scope.js';
  import { resolveEffectiveRole } from '../../src/permissions/effective-role.js';
  import { seedTimelineWorld, type TimelineWorld } from './helpers/world.js';

  const NOW = new Date('2026-10-03T06:00:00.000Z');
  let db: TestDatabase;
  let w: TimelineWorld;
  beforeAll(async () => { db = await createTestDatabase(); w = await seedTimelineWorld(db.pool); }, 120_000);
  afterAll(async () => { await db.drop(); });

  const scopeOf = (ws: string[], mine = false) => ({ workspaceIds: [...ws].sort(), projectIds: [] as string[], mine });
  async function core(viewer: string, ws: string[], mine = false) {
    const scope = scopeOf(ws, mine);
    return computeScope(db.pool, await readableWorkspaces(db.pool, viewer, scope), viewer, scope, NOW);
  }
  const ids = (c: Awaited<ReturnType<typeof core>>) => new Set(c.entries.map((e) => e.id));

  describe('29.296 scope gate and visibility', () => {
    it('29.296 an unreadable workspace is dropped; none readable is []; control: its own member reads it', async () => {
      const scope = scopeOf([w.A.workspaceId, w.B.workspaceId, w.C.workspaceId]);
      const r = await readableWorkspaces(db.pool, w.ama, scope);
      expect(r.map((x) => x.workspaceId).sort()).toEqual([w.A.workspaceId, w.B.workspaceId].sort());
      expect(await readableWorkspaces(db.pool, w.ama, scopeOf([w.C.workspaceId]))).toEqual([]);
      expect(await readableWorkspaces(db.pool, w.cy, scopeOf([w.C.workspaceId]))).toHaveLength(1);
      expect(parseTimelineScope({ ws: '' })).toBeNull();
      expect(parseTimelineScope({ ws: `${w.A.workspaceId}`, mine: 'maybe' })).toBeNull();
    });

    it('29.296 Me = assigned OR collaborating; Everyone adds the rest', async () => {
      const me = ids(await core(w.ama, [w.A.workspaceId], true));
      expect(me.has(w.t.mine)).toBe(true);
      expect(me.has(w.t.collab)).toBe(true);        // collaborator only: the Review Focus line
      expect(me.has(w.t.other)).toBe(false);        // assigned to bo, ama not on it
      const everyone = ids(await core(w.ama, [w.A.workspaceId], false));
      expect(everyone.has(w.t.other)).toBe(true);   // control
    });

    it('29.296 a hidden ticket is a hole: bo sees two flows-of-one, ama sees one flow of three', async () => {
      const bo = await core(w.bo, [w.A.workspaceId]);
      const boText = JSON.stringify(bo, (_k, v) => (v instanceof Map ? [...v] : v));
      expect(boText).not.toContain(w.t.hidden);
      expect(bo.entries.find((e) => e.id === w.t.step1)?.flowId).toBeNull();
      expect(bo.entries.find((e) => e.id === w.t.step2)?.flowId).toBeNull();
      const ama = await core(w.ama, [w.A.workspaceId]);
      const f = ama.flows.find((x) => x.nodes.some((n) => n.id === w.t.hidden));
      expect(f?.nodes.map((n) => n.id).sort()).toEqual([w.t.step1, w.t.hidden, w.t.step2].sort());   // control: the owner sees it whole
    });

    it('29.296 the diamond chains: Yes and No both start the day after the decision ends', async () => {
      const a = await core(w.ama, [w.A.workspaceId]);
      const seg = (id: string) => a.entries.find((e) => e.id === id)?.segments[0];
      expect(seg(w.t.fStart)).toMatchObject({ start: '2026-10-05', end: '2026-10-07' });
      expect(seg(w.t.fDec)).toMatchObject({ start: '2026-10-08', end: '2026-10-08' });
      expect(seg(w.t.fYes)?.start).toBe('2026-10-09');
      expect(seg(w.t.fNo)?.start).toBe('2026-10-09');
    });
  });
  ```
  Add the draft case in the same file once the Drafts fixture is copied (Step 0 note): `ama` core has `entries.find(e => e.id === draftId)` with `{ draft: true, key: null }`; `bo` core does not contain `draftId` anywhere.

  `pins.test.ts` (29.297): seed on top of the same world:
  ```ts
  // note.created {title, homeProjectId, scope:{mode:'workspace'}, attachTicketId} as notes-fixture.ts:213-217 does
  // a private note by ama attached to t.dated; a deleted one ('note.deleted'); an attachments row:
  //   INSERT INTO attachments (id, workspace_id, ticket_id, uploader_id, filename, mime, size, object_key)
  //   VALUES ($1, $2, $3, $4, 'a.pdf', 'application/pdf', 1, $5)
  // and a note-owned attachment (ticket_id NULL, note_id set) which must not count.
  it('29.297 …', async () => {
    const amaPins = await loadPins(db.pool, await resolveEffectiveRole(db.pool, w.ama, w.A.workspaceId), w.ama, [w.t.dated]);
    const boPins = await loadPins(db.pool, await resolveEffectiveRole(db.pool, w.bo, w.A.workspaceId), w.bo, [w.t.dated]);
    expect(amaPins.get(w.t.dated)).toEqual({ notes: 2, attachments: 1 }); // workspace note + her private note; the deleted one is not counted
    expect(boPins.get(w.t.dated)).toEqual({ notes: 1, attachments: 1 }); // control: bo does not see ama's private note
  });
  ```
  Write it out in full in the file (the comment block is the seed list, the `it` is the assertion).

  Run: `"$SR" wtg4-t1 -- pnpm --filter @gisik-nokma/server exec vitest run test/timeline --maxWorkers=2 > /tmp/wtg4-t1.log 2>&1; tail -40 /tmp/wtg4-t1.log`. Expected: PASS for 29.296 and 29.297. A failure naming a missing column means Part 2 or Drafts has not landed (Step 0 STOP): `load.ts` selects `t.*` and folds it with `rowToTicketState`. Flip 29.296 and 29.297 to ✅.

  Commit.

- [ ] **Step 5: The reads: index, chunk, tray (29.299)**

  Case line:
  - `- ❌ **29.299 — the index, chunk and tray slice one core:** the index answers `{today, items, flows, tray:{count}, truncated}` with the tray count equal to the tray route's total; a chunk returns the DETAILS of exactly the entries with a segment overlapping its window, in `ticket_id` order, 200 per page by keyset (`pageSize` injectable), `nextCursor` null on the last page; the tray pages the same way with reasons and `reachedBy`; control: a window with no overlap returns `[]`. The index carries `asOf` exactly as the summary does (same helper); an event appended to workspace B between two index reads raises only B's entry. Mutation: overlap test uses `<` for `<=` at the window's edge → the boundary assertion reds.`

  `read-index.ts`, `read-chunk.ts`, `read-tray.ts`:
  ```ts
  // read-index.ts
  import type { TimelineIndexResponse } from '@gisik-nokma/domain';
  import type { Queryable } from '../db/queryable.js';
  import { readAsOf } from './as-of.js';
  import { computeScope } from './compute.js';
  import type { ReadableWorkspace, TimelineScope } from './scope.js';

  export async function readTimelineIndex(
    db: Queryable, readable: readonly ReadableWorkspace[], viewerId: string, scope: TimelineScope, now: Date,
  ): Promise<TimelineIndexResponse> {
    const asOf = await readAsOf(db, readable); // BEFORE the load (D-W4-23)
    const core = await computeScope(db, readable, viewerId, scope, now);
    return { today: core.today, asOf, items: core.entries, flows: core.flows, tray: { count: core.tray.length }, truncated: core.truncated };
  }

  // read-chunk.ts
  import { TIMELINE_PAGE_SIZE, type TimelineChunkResponse } from '@gisik-nokma/domain';
  export async function readTimelineChunk(
    db: Queryable, readable: readonly ReadableWorkspace[], viewerId: string, scope: TimelineScope, now: Date,
    window: { from: string; to: string }, cursor?: string, pageSize: number = TIMELINE_PAGE_SIZE,
  ): Promise<TimelineChunkResponse> {
    const core = await computeScope(db, readable, viewerId, scope, now);
    const hit = core.entries
      .filter((e) => e.segments.some((s) => s.start <= window.to && s.end >= window.from))   // inclusive both ends
      .filter((e) => cursor === undefined || e.id > cursor)
      .sort((a, b) => (a.id < b.id ? -1 : 1));
    const page = hit.slice(0, pageSize);
    return {
      items: page.map((e) => core.details.get(e.id)).filter((d): d is NonNullable<typeof d> => d !== undefined),
      nextCursor: hit.length > pageSize ? (page[page.length - 1]?.id ?? null) : null,
    };
  }

  // read-tray.ts
  import type { TimelineTrayResponse } from '@gisik-nokma/domain';
  export async function readTimelineTray(
    db: Queryable, readable: readonly ReadableWorkspace[], viewerId: string, scope: TimelineScope, now: Date,
    cursor?: string, pageSize: number = TIMELINE_PAGE_SIZE,
  ): Promise<TimelineTrayResponse> {
    const core = await computeScope(db, readable, viewerId, scope, now);
    const rows = core.tray.filter((r) => cursor === undefined || r.id > cursor);
    const page = rows.slice(0, pageSize);
    return { items: page, nextCursor: rows.length > pageSize ? (page[page.length - 1]?.id ?? null) : null };
  }
  ```
  `reads.test.ts` runs on the same world with `pageSize` 2 and asserts, in this order: the index's `tray.count` equals the tray's total across pages; the chunk of `[2026-10-05, 2026-10-11]` contains `dated`, `mine`, `fStart` and not `bTask` (workspace B is in scope only when listed), page 1 has 2 items and a `nextCursor`, page 2 starts after it, and the pages' union equals an unpaged read; a window `[2026-12-01, 2026-12-28]` returns `[]` (control); the boundary: a window whose `to` equals `dated`'s `start` (`2026-10-05`) includes it and `to = 2026-10-04` does not; `readHomeSummary` over `[A]` unnarrowed equals `toHomeResponse(collectHome(...))` field for field, over `[A, B]` the ticket count is the sum and `dueSoonDays` has two keys, over `[A, B, C]` for `ama` it equals `[A, B]` (C dropped), and Me narrows `counts.tickets` but not `counts.members` or `counts.notes`. `asOf` of the index and of the summary over `[A, B]` equals `{A: head(A), B: head(B)}` (read with `readStreamSeq` in the test), has no key for C, and after appending one event to B (`appendEvent` helper, `grep -n appendEvent apps/server/test/helpers`) a second read raises only B's entry while the first response object is unchanged (control).

  Run: `"$SR" wtg4-t1 -- pnpm --filter @gisik-nokma/server exec vitest run test/timeline --maxWorkers=2 > /tmp/wtg4-t1.log 2>&1; tail -40 /tmp/wtg4-t1.log`. Expected: PASS. Flip 29.299.

  Commit.

- [ ] **Step 6: The measurement (29.290–29.293), written like KG Home's 27.600**

  Case lines (all ❌ until quoted):
  - `- ❌ **29.290 — `readTimelineIndex` over a three-workspace, 10,000-interval scope (diamonds, loops, cross-project members, Me-narrowed members) is p95 ≤ 400 ms for the owner AND a member; the timed call includes the component walk and `planFlow`, not just the SELECT. Gated (`TIMELINE_PERF=1`); the line quoted is LOCAL, with the machine named.**`
  - `- ❌ **29.291 — `readTimelineChunk` per 200-item page is p95 ≤ 150 ms on the same scope.**`
  - `- ❌ **29.292 — Part 3's `readFlowView` (the read behind `GET …/flow`) on a 300-ticket flow is p95 ≤ 120 ms.**`
  - (29.293 is Step 3's; its perf half, `readHomeSummary` over three workspaces p95 ≤ 200 ms, runs here.)

  `apps/server/test/timeline/perf.test.ts`, gated and self-announcing exactly as `home-perf.test.ts` is (`ENABLED = process.env['TIMELINE_PERF'] === '1'`; when off it prints what it would measure and `it.skip`s). Sizes: `TIMELINE_PERF_TICKETS` (default 10,000, split over three workspaces) — **if the brief supplies prod counts use `max(10 × prod, 10,000)`; with none, use the floor and write `prod counts not supplied; floor used` in each case line**. Seeding is through `applyCommitted`; flows are generated in a loop:
  ```ts
  // per flow of 12 (every 12th ticket starts one): start → a → D(decision) → {b: 'Yes', c: 'No'} → d → e, with a LOOP edge D → a labelled 'Needs rework',
  // members alternate project 1 / project 2, every 4th flow is assigned to the viewer so Me narrows the scope but not the flows,
  // a third carry periods ('ticket.transitioned' to 'doing' then 'done'), one in ten has a note attached (note.created attachTicketId).
  // ONE flow of exactly 300 tickets (a chain with a Decision every 10th) in workspace A for 29.292.
  ```
  Then, for each viewer (`owner` = `ama`, `member` = a member without ownership) and for the Me and Everyone scopes: 10 warm-up calls, 100 timed calls, `percentile(sorted, 0.95)` (copy `home-perf.test.ts`'s helper), print `timeline-perf: <fn> p95 <ms> ms (<n> intervals, <ws> workspaces, owner|member, mine|everyone), machine <platform>/<arch>`, `expect(p95).toBeLessThanOrEqual(bar)`. `readTimelineChunk` is timed per page over six windows spread across the range.

  Run: `TIMELINE_PERF=1 "$SR" wtg4-t1 -- pnpm --filter @gisik-nokma/server exec vitest run test/timeline/perf.test.ts --maxWorkers=2 > /tmp/wtg4-t1-perf.log 2>&1; tail -30 /tmp/wtg4-t1-perf.log`. Quote every printed line in the commit message and the case lines, named LOCAL.

  Commit.

- [ ] **Step 7: STOP AND REPORT: the server bars**

  Send the owner (and write into `HANDOFF-wtg4-reads.md`) the printed lines for 29.290–29.293.
  - **All four met:** proceed.
  - **Any missed (index > 400 ms, chunk > 150 ms, flow > 120 ms, summary > 200 ms):** **STOP.** Run `EXPLAIN (ANALYZE, BUFFERS)` on `loadWorkspace`'s ticket SELECT and time `planFlow` alone over the same components, so the report says whether the SELECT or the planning is the cost. Name the spec's fallback (§13): a rebuildable projection `proj_ticket_plan (ticket_id, workspace_id, plan_start, plan_end, basis)` recomputed per flow component on the events that change a plan, indexed `(workspace_id, plan_start, plan_end)`. **Do not build it, do not tune on your own, and do not start T3.** T2 may continue (it is independent).

- [ ] **Step 8: Catalogue, mutations, Features, DONE**

  Flip 29.290–29.293 (✅ with the quoted LOCAL lines). Add the Features bullet under `<!-- WTG4 bullet T1 -->`: *"Timeline reads (⚙️): `readTimelineIndex / Chunk / Tray` and `readHomeSummary` over a scope of workspaces, projects and Me | Everyone, one core that walks flows, plans them with `planFlow` and returns drawable segments; unreadable workspaces drop silently. `apps/server/src/timeline/*`."*

  Mutations to run and report (each must red the named case, then be reverted):
  1. drop the `collaborator_ids` arm in `meClause` → 29.296;
  2. load drafts through the visibility predicate instead of `listMyDrafts` → 29.296;
  3. include hidden endpoints in `ids` → 29.296 (hole);
  4. drop `n.deleted = FALSE` in `loadPins` → 29.297;
  5. end an open period at its planned end in `segmentsFor` → 29.294;
  5a. drop the `stub` push in `segmentsFor` → 29.294 (and 29.295's stub entry);
  6. `<` for `<=` in the chunk overlap → 29.299;
  7. count members per workspace instead of distinct in `readHomeSummary` → 29.293;
  8. give `reachedBy` to an unlabelled edge → 29.295.

  Run the neighbours WHOLE: `apps/server` routes and integration files, `packages/domain`, and say `no mobile editor bundle regeneration: this task adds no event or registry entry (grep of vocabulary.ts is unchanged)`.

  Commit; DONE.

---
### Task 2: The painter and the Home-shaped pan scene, measured first (cases 29.300–29.303)

**Branch** `task/wtg4-painter`. **NEEDS:** browser. **UI task: invoke `frontend-design` in the lane prompt.** Runs in parallel with T1 (no shared file except the catalogue anchors).

**Files:**
- Create:
  - `packages/app-core/src/timeline-graph/days.ts`, `bridge.ts`, `draw-types.ts`, `draw-index.ts`, `painter.tsx`, `index.ts`
  - `packages/app-core/test/timeline-graph/{days,draw-index,painter}.test.ts(x)`
  - `packages/flow-graph-browser/harness/timeline-stress.html`, `timeline-stress.tsx`, `timeline-scene.ts`
  - `packages/flow-graph-browser/tests/timeline-stress.spec.ts`
- Modify:
  - `packages/app-core/package.json` (`"./timeline-graph"` subpath export, beside the existing `./views` style entries: copy one, `grep -n '"\./' packages/app-core/package.json`)
  - `packages/flow-graph-browser/package.json` (dependency `"@gisik-nokma/app-core": "workspace:*"`; no script)
  - `packages/ui/src/ui.css` (a `/* WTG4 T2 */` block of `.gn-tlg*` rules)
  - `Features.md` §26 (`<!-- WTG4 bullet T2 -->`), `test-cases/29-workflow-timeline-graphs.md` (`<!-- WTG4 T2 -->`)

**Interfaces:**
- **Consumes** (all through `bridge.ts`): `@gisik-nokma/viewport` `ScrollAdapter`, `ViewportDriver` (Part 1).
- **Produces:** `dayNumber / dayString / addDays / mondayOf / chunkStart` (`days.ts`); the draw-list types; `DrawIndex` (`new DrawIndex(draws, bucketPx?)`, `.query(view): Draw[]`); `TimelinePainter` props `{ draws: readonly Draw[]; index: DrawIndex; view: View; overscan: number; selectedId?: string | null; onPick?: (id: string) => void; width: number; height: number; className?: string }`; `bridge.attachDriver(el, opts)` returning the driver and an `onWindow(cb)` subscription that fires only when the quantised window changes.

Siblings copied: Part 1's `packages/flow-graph-browser/harness/*` stress page and `tests/*.spec.ts` (Step 0 finds them; if Part 1 has not landed a stress page, copy the browser harness files of KG C T1 on `origin/task/kg-c-t1-measure`); `packages/ui/src/components/segmented-control.tsx` for `.gn-` class naming.

- [ ] **Step 0: Pre-flight and the landed Part 1 names**

  1. Cut `task/wtg4-painter` from `origin/release/workflow-graph`; `pnpm install` under Node 22.
  2. `grep -n "export" packages/viewport/src/index.ts` and write the landed signatures of `ScrollAdapter`, `ViewportDriver`, `pack`, `routeEdge`, `routeLoop`, `RangeCache` into `HANDOFF-wtg4-painter.md`. `ls packages/flow-graph-browser/harness packages/flow-graph-browser/tests`. `grep -n "Date.now\|new Date()" packages/app-core/test/helpers/clock-scan.ts` to learn what the clock-free scan flags (T4 adds `timeline-graph` to its roots; write nothing here that would trip it: `days.ts` uses `Date.UTC` with arguments only).
  3. If `@gisik-nokma/viewport` does not exist, STOP: Part 1 has not landed.

- [ ] **Step 1: Day arithmetic, test first (no case id: it is infrastructure of 29.303)**

  `packages/app-core/test/timeline-graph/days.test.ts`:
  ```ts
  import { describe, expect, it } from 'vitest';
  import { addDays, chunkStart, dayNumber, dayString, mondayOf } from '../../src/timeline-graph/days.js';

  describe('29.303 day arithmetic (infrastructure of the windowed mount)', () => {
    it('round-trips and adds across a month and a leap day', () => {
      expect(dayString(dayNumber('2026-10-03'))).toBe('2026-10-03');
      expect(addDays('2026-02-27', 3)).toBe('2026-03-02');
      expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
      expect(dayNumber('2026-10-04') - dayNumber('2026-10-03')).toBe(1);
    });
    it('mondayOf: a Sunday and a Monday; chunkStart is always a Monday and 28-day aligned', () => {
      expect(mondayOf('2026-10-04')).toBe('2026-09-28'); // Sunday
      expect(mondayOf('2026-09-28')).toBe('2026-09-28'); // control: a Monday is its own
      for (const d of ['2026-01-01', '2026-10-03', '2027-03-31']) {
        expect(mondayOf(chunkStart(d))).toBe(chunkStart(d));
        expect((dayNumber(chunkStart(d)) - dayNumber('1970-01-05')) % 28).toBe(0);
        expect(dayNumber(d) - dayNumber(chunkStart(d))).toBeLessThan(28);
        expect(dayNumber(d) - dayNumber(chunkStart(d))).toBeGreaterThanOrEqual(0);
      }
    });
  });
  ```
  `packages/app-core/src/timeline-graph/days.ts`:
  ```ts
  /** IST day strings (`YYYY-MM-DD`) as whole day numbers. No clock is read here: every call passes its date in (the clock-free scan applies to this directory). */
  const DAY_MS = 86_400_000;
  /** 1970-01-05 was a Monday: chunks are 28-day blocks counted from it. */
  const MONDAY_EPOCH = 4;

  export function dayNumber(ymd: string): number {
    const [y, m, d] = ymd.split('-').map(Number) as [number, number, number];
    return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
  }
  export const dayString = (n: number): string => new Date(n * DAY_MS).toISOString().slice(0, 10);
  export const addDays = (ymd: string, n: number): string => dayString(dayNumber(ymd) + n);
  export function mondayOf(ymd: string): string {
    const n = dayNumber(ymd);
    return dayString(n - ((n + 3) % 7)); // 1970-01-01 was a Thursday: (n + 3) % 7 is 0 on Mondays
  }
  /** The first day of the 28-day chunk holding `ymd` (spec PR: chunks are 28 days aligned to a Monday). */
  export function chunkStart(ymd: string): string {
    const n = dayNumber(ymd);
    return dayString(MONDAY_EPOCH + Math.floor((n - MONDAY_EPOCH) / 28) * 28);
  }
  ```
  Run: `"$SR" wtg4-t2 -- pnpm --filter @gisik-nokma/app-core exec vitest run test/timeline-graph/days.test.ts --maxWorkers=2 > /tmp/wtg4-t2.log 2>&1; tail -20 /tmp/wtg4-t2.log`. Expected FAIL then (after the file) PASS. Commit.

- [ ] **Step 2: Draw-list types and the bucket index, test first (29.303)**

  Case line under `<!-- WTG4 T2 -->`:
  - `- ❌ **29.303 — the painter mounts only what is near the view:** with 10,000 draws the index returns the primitives whose bounds touch `[view − overscan, view + overscan]` and no others; an item spanning several buckets is returned once; moving the view by less than a bucket changes no mounted id (no React churn), moving it by more mounts the new ids and unmounts the old; selection and pick work on a mounted primitive; the painter's DOM carries no `aria` name Earlier, Later, Previous or Next; control: the same view with overscan 0 returns fewer. Mutation: build buckets from `x0` only → a long bar vanishes at the window's right edge and the span assertion reds.`

  `packages/app-core/src/timeline-graph/draw-types.ts`:
  ```ts
  import type { TimelinePin } from '@gisik-nokma/domain';

  /** Content-space pixels. `y` grows downward, `x` with the day axis. */
  export type Bounds = { x0: number; x1: number; y0: number; y1: number };
  export type View = Bounds;

  export type BarStyle = 'done' | 'active' | 'planned' | 'ghost';
  /** `dim`: drawn at the emphasis opacity (Home's lit set, HM-2, and the selected flow, HM-4). Never set on text that must keep 4.5:1 by itself (ghosts, Not taken). */
  type Base = { id: string; b: Bounds; z: number; dim?: boolean };

  /** A 28 px bar (TG-1, TG-2). `passRank` 0 for the first pass, 1, 2 for later ones (T6). */
  export type DrawBar = Base & {
    kind: 'bar';
    ticketId: string;
    style: BarStyle;
    key: string | null;
    title: string;
    /** A bar of 150 px or more shows the title on a second line (§13). */
    long: boolean;
    /** ✓ on done, ▶ on active (TG-4); null on planned and ghost. */
    mark: 'done' | 'active' | null;
    passRank: 0 | 1 | 2;
    pass: number;
    pin: TimelinePin | null;
    /** `Not taken (pass 2)` and similar chips. */
    chip: string | null;
    draft: boolean;
    /** `labelPx` that packing reserved to the right of a short bar (key, plus 14 px when the pin follows it, PK-4). */
    labelPx: number;
    /** A bar too narrow for its key shows the key AFTER the bar; a pin that does not fit inside the bar's end follows the key (TG-11). */
    keyOutside: boolean;
    pinAt: 'inside' | 'after-key' | null;
    ariaLabel: string;
  };
  export type DrawDiamond = Base & {
    kind: 'diamond';
    ticketId: string;
    style: BarStyle;
    key: string | null;
    title: string;
    mark: 'done' | 'active' | null;
    revised: boolean;
    pin: TimelinePin | null;
    draft: boolean;
    ariaLabel: string;
  };
  /** The thin line across a gap between two work periods of one ticket (TG-9). */
  export type DrawConnector = Base & { kind: 'connector'; ticketId: string; dashed: boolean };
  export type DrawEdge = Base & {
    kind: 'edge';
    from: string;
    to: string;
    d: string;
    label: { x: number; y: number; text: string } | null;
    edgeKind: 'leads_to' | 'blocks';
    loop: boolean;
    taken: boolean | null;
  };
  export type DrawHeading = Base & { kind: 'heading'; text: string; sticky: boolean };
  export type DrawStrip = Base & { kind: 'strip'; text: string };
  export type DrawToday = Base & { kind: 'today'; text: string };
  export type DrawWeekend = Base & { kind: 'weekend' };
  export type Draw = DrawBar | DrawDiamond | DrawConnector | DrawEdge | DrawHeading | DrawStrip | DrawToday | DrawWeekend;
  ```
  `packages/app-core/test/timeline-graph/draw-index.test.ts`:
  ```ts
  import { describe, expect, it } from 'vitest';
  import { DrawIndex } from '../../src/timeline-graph/draw-index.js';
  import type { Draw } from '../../src/timeline-graph/draw-types.js';

  const bar = (i: number, x0: number, w: number, row: number): Draw => ({
    kind: 'bar', id: `b${i}`, ticketId: `t${i}`, z: 1, b: { x0, x1: x0 + w, y0: row * 40, y1: row * 40 + 28 },
    style: 'planned', key: null, title: 't', long: w >= 150, mark: null, passRank: 0, pass: 1, pin: null, chip: null, draft: false, labelPx: 0, keyOutside: false, pinAt: null, ariaLabel: 't',
  });
  const many: Draw[] = Array.from({ length: 10_000 }, (_, i) => bar(i, (i * 37) % 26_400, 24 + (i % 7) * 24, i % 120));

  describe('29.303 DrawIndex', () => {
    const index = new DrawIndex(many);
    it('29.303 returns exactly the touching primitives, once each; control: overscan 0 returns fewer', () => {
      const view = { x0: 5_000, x1: 6_500, y0: 400, y1: 1_300 };
      const ids = index.query(view).map((d) => d.id);
      expect(new Set(ids).size).toBe(ids.length);
      const expected = many.filter((d) => d.b.x1 >= view.x0 && d.b.x0 <= view.x1 && d.b.y1 >= view.y0 && d.b.y0 <= view.y1).map((d) => d.id);
      expect([...ids].sort()).toEqual([...expected].sort());
      const wide = index.query({ x0: view.x0 - 1_500, x1: view.x1 + 1_500, y0: view.y0 - 900, y1: view.y1 + 900 });
      expect(wide.length).toBeGreaterThan(ids.length);
    });
    it('29.303 a bar spanning many buckets is found from any bucket it covers', () => {
      const long: Draw[] = [bar(1, 0, 5_000, 0), bar(2, 100, 24, 0)];
      const idx = new DrawIndex(long, 512);
      expect(idx.query({ x0: 4_000, x1: 4_100, y0: 0, y1: 28 }).map((d) => d.id)).toEqual(['b1']);
    });
  });
  ```
  `draw-index.ts`:
  ```ts
  import type { Bounds, Draw, View } from './draw-types.js';

  /** A uniform grid on the x axis. Each primitive is inserted in EVERY column its bounds cross, so a long bar or a loop arrow is found from any of them. */
  export class DrawIndex {
    private readonly columns = new Map<number, Draw[]>();
    constructor(draws: readonly Draw[], private readonly bucketPx = 512) {
      for (const d of draws) {
        const first = Math.floor(d.b.x0 / bucketPx);
        const last = Math.floor(d.b.x1 / bucketPx);
        for (let c = first; c <= last; c++) {
          const list = this.columns.get(c);
          if (list === undefined) this.columns.set(c, [d]);
          else list.push(d);
        }
      }
    }
    query(view: View): Draw[] {
      const seen = new Set<string>();
      const out: Draw[] = [];
      for (let c = Math.floor(view.x0 / this.bucketPx); c <= Math.floor(view.x1 / this.bucketPx); c++) {
        for (const d of this.columns.get(c) ?? []) {
          if (seen.has(d.id) || !touches(d.b, view)) continue;
          seen.add(d.id);
          out.push(d);
        }
      }
      return out.sort((a, b) => a.z - b.z || (a.id < b.id ? -1 : 1));
    }
  }
  const touches = (a: Bounds, v: Bounds): boolean => a.x1 >= v.x0 && a.x0 <= v.x1 && a.y1 >= v.y0 && a.y0 <= v.y1;
  ```
  Run it. Expected: FAIL then PASS.

  Commit.

- [ ] **Step 3: The bridge and the painter, test first (29.303)**

  `bridge.ts` is the ONLY file in this plan that imports `@gisik-nokma/viewport`. Write it against the landed names recorded in Step 0; the shape the rest of the plan uses is:
  ```ts
  import { ScrollAdapter, type ViewportDriver } from '@gisik-nokma/viewport';
  import type { View } from './draw-types.js';

  export type Windowed = { driver: ViewportDriver; onWindow(cb: (v: View) => void): () => void; destroy(): void };

  /** Wire Part 1's scroll adapter to an element. `quantisePx` makes `onWindow` fire only when the visible window crosses a bucket, so React renders a few times a second, never per frame. */
  export function attachDriver(el: HTMLElement, opts: { quantisePx: number; contentW: number; contentH: number }): Windowed {
    const adapter = new ScrollAdapter(el, { contentSize: { w: opts.contentW, h: opts.contentH } });
    const driver = adapter.driver;
    const listeners = new Set<(v: View) => void>();
    let last = '';
    const stop = driver.onFrame(() => {
      const r = driver.visibleRange();
      const q = (n: number): number => Math.floor(n / opts.quantisePx) * opts.quantisePx;
      const view: View = { x0: q(r.x0), x1: q(r.x1) + opts.quantisePx, y0: q(r.y0), y1: q(r.y1) + opts.quantisePx };
      const key = `${view.x0}|${view.x1}|${view.y0}|${view.y1}`;
      if (key === last) return;
      last = key;
      for (const cb of listeners) cb(view);
    });
    return { driver, onWindow: (cb) => (listeners.add(cb), () => listeners.delete(cb)), destroy: () => { stop(); adapter.destroy(); } };
  }
  ```
  If the landed `ScrollAdapter` differs (constructor, `driver`, `onFrame`, `visibleRange`), change this file only.

  `painter.test.tsx` (jsdom):
  ```tsx
  // @vitest-environment jsdom
  import { describe, expect, it, vi } from 'vitest';
  import { fireEvent, render } from '@testing-library/react';
  import { DrawIndex } from '../../src/timeline-graph/draw-index.js';
  import type { Draw } from '../../src/timeline-graph/draw-types.js';
  import { TimelinePainter } from '../../src/timeline-graph/painter.js';

  const bar = (i: number, x0: number): Draw => ({
    kind: 'bar', id: `b${i}`, ticketId: `t${i}`, z: 1, b: { x0, x1: x0 + 96, y0: 0, y1: 28 }, style: 'done', key: `GN-${i}`, title: `Bar ${i}`,
    long: false, mark: 'done', passRank: 0, pass: 1, pin: null, chip: null, draft: false, labelPx: 60, keyOutside: false, pinAt: null, ariaLabel: `Bar ${i}, done`,
  });
  const draws = Array.from({ length: 200 }, (_, i) => bar(i, i * 120));
  const index = new DrawIndex(draws);
  const props = { draws, index, overscan: 0, width: 24_000, height: 400 };

  describe('29.303 TimelinePainter', () => {
    it('29.303 mounts only the window; a sub-bucket move changes nothing; a bigger one swaps ids; control: overscan mounts more', () => {
      const { container, rerender } = render(<TimelinePainter {...props} view={{ x0: 0, x1: 600, y0: 0, y1: 400 }} />);
      const ids = () => [...container.querySelectorAll('[data-draw-id]')].map((e) => e.getAttribute('data-draw-id'));
      const first = ids();
      expect(first.length).toBeGreaterThan(0);
      expect(first.length).toBeLessThan(10);
      rerender(<TimelinePainter {...props} view={{ x0: 0, x1: 600, y0: 0, y1: 400 }} />);
      expect(ids()).toEqual(first);
      rerender(<TimelinePainter {...props} view={{ x0: 6_000, x1: 6_600, y0: 0, y1: 400 }} />);
      expect(ids().some((id) => first.includes(id))).toBe(false);
      rerender(<TimelinePainter {...props} overscan={600} view={{ x0: 6_000, x1: 6_600, y0: 0, y1: 400 }} />);
      expect(ids().length).toBeGreaterThan(first.length);
    });
    it('29.303 pick on a mounted bar; selection marks it; no control is named Earlier, Later, Previous or Next', () => {
      const onPick = vi.fn();
      const { container } = render(<TimelinePainter {...props} view={{ x0: 0, x1: 300, y0: 0, y1: 400 }} selectedId="b0" onPick={onPick} />);
      const b0 = container.querySelector('[data-draw-id="b0"]') as HTMLElement;
      expect(b0.getAttribute('aria-pressed')).toBe('true');
      fireEvent.click(b0);
      expect(onPick).toHaveBeenCalledWith('b0');
      const names = [...container.querySelectorAll('[aria-label]')].map((e) => e.getAttribute('aria-label') ?? '');
      expect(names.some((n) => /^(earlier|later|previous|next)$/i.test(n))).toBe(false);
    });
  });
  ```
  `painter.tsx`:
  ```tsx
  import { useMemo, type CSSProperties, type ReactElement } from 'react';
  import type { Draw, DrawBar, DrawDiamond, DrawEdge, View } from './draw-types.js';
  import type { DrawIndex } from './draw-index.js';

  export type TimelinePainterProps = {
    draws: readonly Draw[];
    index: DrawIndex;
    view: View;
    overscan: number;
    width: number;
    height: number;
    selectedId?: string | null;
    onPick?: (id: string) => void;
    className?: string;
  };

  const box = (b: Draw['b']): CSSProperties => ({ left: b.x0, top: b.y0, width: b.x1 - b.x0, height: b.y1 - b.y0 });

  function Bar({ d, selected, onPick }: { d: DrawBar; selected: boolean; onPick?: (id: string) => void }): ReactElement {
    return (
      <button
        type="button" data-draw-id={d.id} data-style={d.style} data-pass-rank={d.passRank} aria-pressed={selected} aria-label={d.ariaLabel} data-dim={d.dim === true} data-draft={d.draft}
        className="gn-tlg-bar" style={box(d.b)} onClick={() => onPick?.(d.ticketId)}
      >
        {d.mark !== null && <span className="gn-tlg-mark" aria-hidden="true">{d.mark === 'done' ? '✓' : '▶'}</span>}
        <span className="gn-tlg-key" data-outside={d.keyOutside}>{d.draft ? 'Draft' : (d.key ?? '')}</span>
        {d.long && <span className="gn-tlg-title">{d.title}</span>}
        {d.chip !== null && <span className="gn-tlg-chip">{d.chip}</span>}
        {d.pin !== null && <span className="gn-tlg-pin" aria-hidden="true" data-at={d.pinAt} data-notes={d.pin.notes} data-attachments={d.pin.attachments} />}
      </button>
    );
  }
  function Diamond({ d, selected, onPick }: { d: DrawDiamond; selected: boolean; onPick?: (id: string) => void }): ReactElement {
    return (
      <button type="button" data-draw-id={d.id} data-style={d.style} aria-pressed={selected} aria-label={d.ariaLabel} className="gn-tlg-diamond" style={box(d.b)} onClick={() => onPick?.(d.ticketId)}>
        {d.mark !== null && <span className="gn-tlg-mark" aria-hidden="true">{d.mark === 'done' ? '✓' : '▶'}</span>}
        {d.revised && <span className="gn-tlg-revised">revised</span>}
      </button>
    );
  }

  /**
   * Mounts only the primitives inside `view` widened by `overscan` (spec VP: "window the DOM"). Edges go in ONE svg per render, not one per edge; the
   * driver (Part 1) moves the content layer, so this component re-renders when the quantised window changes, not per frame.
   */
  export function TimelinePainter(p: TimelinePainterProps): ReactElement {
    const win: View = { x0: p.view.x0 - p.overscan, x1: p.view.x1 + p.overscan, y0: p.view.y0 - p.overscan, y1: p.view.y1 + p.overscan };
    const mounted = useMemo(() => p.index.query(win), [p.index, win.x0, win.x1, win.y0, win.y1]); // eslint-disable-line react-hooks/exhaustive-deps
    const edges = mounted.filter((d): d is DrawEdge => d.kind === 'edge');
    return (
      <div className={`gn-tlg-canvas ${p.className ?? ''}`} style={{ width: p.width, height: p.height }} data-mounted={mounted.length}>
        {mounted.map((d) => {
          switch (d.kind) {
            case 'bar': return <Bar key={d.id} d={d} selected={p.selectedId === d.ticketId || p.selectedId === d.id} onPick={p.onPick} />;
            case 'diamond': return <Diamond key={d.id} d={d} selected={p.selectedId === d.ticketId || p.selectedId === d.id} onPick={p.onPick} />;
            case 'connector': return <div key={d.id} data-draw-id={d.id} className="gn-tlg-connector" data-dashed={d.dashed} style={box(d.b)} />;
            case 'heading': return <div key={d.id} data-draw-id={d.id} className="gn-tlg-heading" style={box(d.b)}>{d.text}</div>;
            case 'strip': return <div key={d.id} data-draw-id={d.id} className="gn-tlg-strip" style={box(d.b)}>{d.text}</div>;
            case 'today': return <div key={d.id} data-draw-id={d.id} className="gn-tlg-today" style={box(d.b)}><span>{d.text}</span></div>;
            case 'weekend': return <div key={d.id} data-draw-id={d.id} className="gn-tlg-weekend" style={box(d.b)} />;
            default: return null;
          }
        })}
        {edges.length > 0 && (
          <svg className="gn-tlg-edges" width={p.width} height={p.height} aria-hidden="true">
            {edges.map((e) => (
              <g key={e.id} data-draw-id={e.id} data-loop={e.loop} data-kind={e.edgeKind} data-dim={e.dim === true}>
                <path d={e.d} className="gn-tlg-edge" />
                {e.label !== null && <text x={e.label.x} y={e.label.y} className="gn-tlg-edge-label">{e.label.text}</text>}
              </g>
            ))}
          </svg>
        )}
      </div>
    );
  }
  ```
  `index.ts` re-exports `days`, `draw-types`, `draw-index`, `painter` (not `bridge`: it stays internal). Add the package export. Add the `/* WTG4 T2 */` CSS: `.gn-tlg-canvas { position: relative; }`, `.gn-tlg-bar, .gn-tlg-diamond, .gn-tlg-connector, .gn-tlg-heading, .gn-tlg-strip, .gn-tlg-today, .gn-tlg-weekend { position: absolute; }` plus the four bar styles using EXISTING status tokens (read `tokens.ts` Step 0 for the status roles; new roles, if any, go in with `CONTRAST_PAIRS`: bar fill and mark >= 3:1 against the canvas, text >= 4.5:1 on a ghost fill; ghost = pale fill + `border: 1px dashed`, never `opacity`). Also `.gn-tlg-bar { height: 28px; }`.
  Run the painter and draw-index tests, `pnpm --filter @gisik-nokma/ui exec vitest run test/tokens.test.ts`, then typecheck. Flip 29.303 to ✅ only after the browser half (scrollY unchanged) of Step 5.

  Commit.

- [ ] **Step 4: The Home-shaped scene and the harness (29.300, 29.301)**

  Case lines:
  - `- ❌ **29.300 — desktop pan, Home-shaped: 10,000 index entries over 120 rows (34 px lane headings, 40 px row pitch, 28 px bars, 24 px per day), at most 1,200 mounted bars, a continuous pan of 10 viewports at one viewport per second on a 1440 x 900 window runs at >= 60 fps with the worst frame <= 20 ms and ZERO frames with fewer mounted bars than the window needs. Gated (`TLG_GPU=1`: headless Chromium has no GPU, so the owner or a GPU runner sets it); the line quoted is LOCAL with the machine named. Control: the same scene mounted WITHOUT the windowing (every bar) misses the bar, which proves the scene is heavy enough to measure.**`
  - `- ❌ **29.301 — Pixel 7 proxy (412 x 915 at DPR 2.625, 4x CPU throttle, touch): 600 bars mounted, >= 30 fps, worst frame <= 50 ms, over a 10-viewport pan; page `scrollY` is unchanged after wheel and touch pans. Runs on the default browser project.**`
  - `- ❌ **29.302 — real phone: the same Home-shaped scene on the owner's phone holds >= 30 fps with the worst frame <= 50 ms. Manual (owner taps Run; the numbers are quoted in the commit that flips this line), because no emulator reproduces a phone's GPU.**`

  `timeline-scene.ts` (deterministic; no `Math.random`):
  ```ts
  import type { Draw } from '@gisik-nokma/app-core/timeline-graph';

  const mulberry32 = (seed: number) => () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

  export const PPD = 24, BAR_H = 28, PITCH = 40, HEADING_H = 34;
  export type SceneSpec = { count: number; days: number; lanes: number; rowsPerLane: number };

  /** Home-shaped (HM-3): lane headings, packed rows, long and short bars, edges only for one selected flow. */
  export function makeHomeScene(spec: SceneSpec): { draws: Draw[]; width: number; height: number } {
    const rnd = mulberry32(7);
    const draws: Draw[] = [];
    const laneH = HEADING_H + spec.rowsPerLane * PITCH;
    for (let l = 0; l < spec.lanes; l++) {
      draws.push({ kind: 'heading', id: `h${l}`, z: 0, sticky: true, text: `Project ${l + 1}`, b: { x0: 0, x1: spec.days * PPD, y0: l * laneH, y1: l * laneH + HEADING_H } });
    }
    for (let i = 0; i < spec.count; i++) {
      const lane = i % spec.lanes;
      const row = Math.floor(rnd() * spec.rowsPerLane);
      const start = Math.floor(rnd() * (spec.days - 8));
      const len = 1 + Math.floor(rnd() * (rnd() < 0.15 ? 12 : 4));
      const w = len * PPD;
      const y0 = lane * laneH + HEADING_H + row * PITCH;
      draws.push({
        kind: 'bar', id: `b${i}`, ticketId: `t${i}`, z: 1, b: { x0: start * PPD, x1: start * PPD + w, y0, y1: y0 + BAR_H },
        style: (['done', 'active', 'planned'] as const)[i % 3], key: `GN-${i}`, title: `Item ${i}`, long: w >= 150,
        mark: i % 3 === 0 ? 'done' : i % 3 === 1 ? 'active' : null, passRank: 0, pass: 1, pin: i % 10 === 0 ? { notes: 1, attachments: 0 } : null,
        chip: null, draft: false, labelPx: w >= 150 ? 0 : 56, keyOutside: w < 64, pinAt: i % 10 === 0 ? (w < 82 ? 'after-key' : 'inside') : null, ariaLabel: `Item ${i}`,
      });
    }
    return { draws, width: spec.days * PPD, height: spec.lanes * laneH };
  }
  export const DESKTOP: SceneSpec = { count: 10_000, days: 1_100, lanes: 12, rowsPerLane: 10 };
  /** Tuned in Step 4 until `maxMounted` sits near 600 on the 412 px viewport; record the final numbers in the handoff. */
  export const PHONE: SceneSpec = { count: 3_000, days: 1_100, lanes: 12, rowsPerLane: 10 };
  ```
  The page imports `DrawIndex`, `TimelinePainter` and `Draw` from `@gisik-nokma/app-core/timeline-graph`, as the product does.

  `timeline-stress.tsx` (the page): mounts `TimelinePainter` in a `div` of the viewport's size with `overflow: hidden`, drives `bridge`-free scrolling by setting `translate3d(-x, -y, 0)` on the canvas's parent every frame (the product's driver does the same through `attachDriver`; the harness uses `attachDriver` too, so the same code is measured), and exposes `window.__tlg = { run(mode): Promise<Result> }`:
  ```ts
  type Result = { fps: number; worstMs: number; frames: number; maxMounted: number; minMounted: number; emptyFrames: number; scrollYBefore: number; scrollYAfter: number };
  // run: 10 viewports at one viewport per second (desktop 'desktop'), same for 'phone'; per rAF: advance x by viewportW * dt/1000,
  // record dt, read `canvas.dataset.mounted`; an "empty frame" is a frame whose mounted bar count is 0 while the scene has bars in that window
  // (computed from the same index with overscan 0); `unwindowed` mode passes overscan = Infinity-ish (the whole scene) for the control.
  ```
  Write the loop in full:
  ```ts
  // Module scope of timeline-stress.tsx. `setView` is assigned by the page component on mount (`flushSync(() => setViewState(v))`), so a call renders
  // synchronously inside the frame being measured; `mountScene(scene, { overscan? })` is the page's own async function (`createRoot(...).render(<Stage draws={scene.draws} overscan={…} />)`; `Stage` renders `TimelinePainter` and calls `registerSetView` from an effect) and resolves after two animation frames.
  import { flushSync } from 'react-dom';
  import { DrawIndex, type View } from '@gisik-nokma/app-core/timeline-graph';
  import { DESKTOP, PHONE, makeHomeScene } from './timeline-scene';

  let setView: (v: View) => void = () => undefined;
  export const registerSetView = (fn: (v: View) => void): void => { setView = (v) => flushSync(() => fn(v)); };
  const canvas = (): HTMLElement => document.querySelector<HTMLElement>('.gn-tlg-canvas') ?? document.body;

  async function run(mode: 'desktop' | 'phone' | 'unwindowed'): Promise<Result> {
    const scene = makeHomeScene(mode === 'phone' ? PHONE : DESKTOP);
    const index = new DrawIndex(scene.draws); // the same index the painter queries, so "bars the window needs" is measured, not assumed
    await mountScene(scene, { overscan: mode === 'unwindowed' ? scene.width : undefined }); // resolves after the first paint
    const vw = innerWidth, vh = innerHeight;
    const scrollYBefore = scrollY;
    let x = 0, last = performance.now(), worst = 0, frames = 0, maxM = 0, minM = Infinity, empty = 0;
    const t0 = last;
    const total = vw * 10;
    await new Promise<void>((done) => {
      const tick = (now: number): void => {
        const dt = now - last; last = now;
        if (frames > 0) worst = Math.max(worst, dt);
        frames++;
        x = Math.min(total, x + (vw * dt) / 1000);
        setView({ x0: x, x1: x + vw, y0: 0, y1: vh });
        const mounted = Number(canvas().dataset['mounted'] ?? 0);
        maxM = Math.max(maxM, mounted); minM = Math.min(minM, mounted);
        if (mounted === 0 && index.query({ x0: x, x1: x + vw, y0: 0, y1: vh }).length > 0) empty++;
        if (x >= total) done(); else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    return { fps: (frames * 1000) / (performance.now() - t0), worstMs: worst, frames, maxMounted: maxM, minMounted: minM, emptyFrames: empty, scrollYBefore, scrollYAfter: scrollY };
  }
  ```
  (`setView`, `canvas`, `index` and `mountScene` are the module-scope names declared above the function.) (`setView` is the page's `flushSync` state setter, so React renders inside the frame being measured; the mounted count is read after.)

  `tests/timeline-stress.spec.ts`:
  ```ts
  import { expect, test } from '@playwright/test';

  const GPU = process.env['TLG_GPU'] === '1';

  test.describe('29.300 desktop pan (gated: needs a GPU)', () => {
    test.skip(!GPU, 'TLG_GPU is not 1: headless Chromium has no GPU, so 60 fps is not measurable here; set TLG_GPU=1 on a GPU machine');
    test('29.300 windowed pan holds 60 fps; unwindowed control misses', async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto('/timeline-stress.html?scene=desktop');
      const r = await page.evaluate(() => (window as any).__tlg.run('desktop'));
      console.log(`tlg-pan desktop ${JSON.stringify(r)} machine ${process.platform}/${process.arch}`);
      expect(r.maxMounted).toBeLessThanOrEqual(1_200);
      expect(r.emptyFrames).toBe(0);
      expect(r.fps).toBeGreaterThanOrEqual(60);
      expect(r.worstMs).toBeLessThanOrEqual(20);
      const control = await page.evaluate(() => (window as any).__tlg.run('unwindowed'));
      expect(control.worstMs > 20 || control.fps < 60).toBe(true); // 29.300 control
    });
  });

  test.describe('29.301 Pixel 7 proxy', () => {
    test.use({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true });
    test('29.301 600 bars, 30 fps, worst 50 ms; scrollY unchanged after wheel and touch pans', async ({ page, context }) => {
      const cdp = await context.newCDPSession(page);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
      await page.goto('/timeline-stress.html?scene=phone');
      const r = await page.evaluate(() => (window as any).__tlg.run('phone'));
      console.log(`tlg-pan phone ${JSON.stringify(r)} machine ${process.platform}/${process.arch}`);
      expect(r.maxMounted).toBeLessThanOrEqual(600);
      expect(r.emptyFrames).toBe(0);
      expect(r.fps).toBeGreaterThanOrEqual(30);
      expect(r.worstMs).toBeLessThanOrEqual(50);
      expect(r.scrollYAfter).toBe(r.scrollYBefore);
      // wheel and a touch drag over the canvas must not scroll the page either
      await page.mouse.move(200, 400);
      await page.mouse.wheel(0, 600);
      await page.touchscreen.tap(200, 400);
      expect(await page.evaluate(() => scrollY)).toBe(r.scrollYBefore);
    });
  });
  ```
  The `phone` scene's density is tuned until `maxMounted` sits near 600 (the generator's `count` and `days` are the knobs; record the final numbers in `HANDOFF`).

  Run: `"$SR" wtg4-t2 -- pnpm --filter @gisik-nokma/flow-graph-browser exec playwright test timeline-stress --project=chromium > /tmp/wtg4-t2.log 2>&1; tail -30 /tmp/wtg4-t2.log` (29.301 and the skipped 29.300). On a GPU machine: `TLG_GPU=1 …` (the owner or the primary checkout; note which in the report).

  Commit.

- [ ] **Step 5: Flip what ran, quote the lines**

  Flip 29.301 and 29.303 (browser half) to ✅ with the printed `tlg-pan phone …` line named LOCAL. 29.300 stays ❌ until a GPU run prints its line; the report says so.

  Commit.

- [ ] **Step 6: STOP AND REPORT: the real phone**

  Start the harness with `pnpm --filter @gisik-nokma/flow-graph-browser exec vite --host` (or the package's `dev` script with `--host`), find the LAN address, and send the owner `http://<lan-ip>:<port>/timeline-stress.html?scene=phone` with the instruction: *open it on the phone, tap Run, report the three numbers shown (fps, worst frame, max mounted)*. The page shows the `Result` as large text after the run. **STOP.** Record the owner's numbers in the commit message and flip the seeded 29.302 line from ❌ to 🟡 (manual: the numbers are in that commit; the line text is unchanged). If the owner is away, leave 29.302 ❌ and the task DONE-with-note; do not block T3.

- [ ] **Step 7: STOP AND REPORT: a pan bar misses**

  If 29.301 (or a GPU run of 29.300) misses: **STOP** and report the Result JSON. Diagnose in this order and report, without fixing beyond the painter: (a) mounted count above the cap (window or density wrong); (b) React render time per window change (profile `TimelinePainter` with `performance.measure`); (c) the CSS (box-shadow, `will-change`, layer count). The spec's lever is windowing harder (smaller `overscan`, coarser `quantisePx`), which this task may adjust and state; anything structural (canvas) is the owner's call.

- [ ] **Step 8: Mutations, Features, DONE**

  Mutations: (1) buckets from `x0` only → 29.303 span case; (2) drop the dedupe `Set` → 29.303 once-each; (3) `overscan` ignored → 29.303 control. Run the neighbours WHOLE: `packages/ui`, `packages/app-core` and `apps/web` suites (ui.css changed), after `pnpm turbo run build --filter=@gisik-nokma/web...`. Features bullet under `<!-- WTG4 bullet T2 -->`: *"Timeline painter (⚙️): a windowed React painter over a pure draw list and a bucket index; mounts only primitives near the view; measured on a Home-shaped 10,000-interval scene (desktop GPU, Pixel 7 proxy, real phone). `packages/app-core/src/timeline-graph/`, `packages/flow-graph-browser/harness/timeline-stress.*`."*

  Commit; DONE.

---

### Task 3: The four routes (cases 29.304–29.307)

**Branch** `task/wtg4-routes`. **NEEDS:** db. Depends on T1.

**Files:**
- Create: `apps/server/src/routes/timeline.ts` (all four routes: they share one gate), `apps/server/src/timeline/days.ts` (5-line `dayNumber`), `apps/server/test/timeline/routes.test.ts`
- Modify: `apps/server/src/app.ts` (two registrations beside `registerAttentionRoutes`, `:1042`), `Features.md` §26 (`<!-- WTG4 bullet T3 -->`), `test-cases/29-workflow-timeline-graphs.md` (`<!-- WTG4 T3 -->`)

**Interfaces:**
- **Consumes:** T1's `parseTimelineScope`, `readableWorkspaces`, `readTimelineIndex / Chunk / Tray`, `readHomeSummary`; `requireSession` (`request.currentUserId`); `READ_NOT_FOUND_BODY` (`read/membership.ts`).
- **Produces:** `GET /v1/timeline/index?ws=a,b&proj=c&mine=1`, `GET /v1/timeline/chunk?…&from=YYYY-MM-DD&to=YYYY-MM-DD&cursor=`, `GET /v1/timeline/tray?…&cursor=`, `GET /v1/home/summary?…`; `registerTimelineRoutes(app, deps, requireSession)` (registers all four).

Sibling copied: `registerAttentionRoutes` (`routes/attention.ts:~410-432`: `deps: { pool, now? }`, the `requireSession` preHandler by parameter, `READ_NOT_FOUND_BODY`) and its test `test/routes/attention.test.ts` (`buildReadTestApp`, `read.authOf(role)`, `UNAUTHENTICATED_BODY`).

- [ ] **Step 0: Pre-flight**

  Cut the branch; `git merge-base --is-ancestor <T1 sha> HEAD` (T1 is in the release branch); `grep -n "registerAttentionRoutes" apps/server/src/app.ts` to see where it sits now; `grep -rn "400" apps/server/src/routes/list.ts | head -3`-style reads are fine, but run them as `grep` without `-m` and without `| head`: read `list.ts:380-410` for the named-400 style (`{ error: 'invalid_filter' }`).

- [ ] **Step 1: The route tests, first (29.304, 29.305, 29.306, 29.307)**

  Case lines:
  - `- ❌ **29.304 — the doors:** no session and a forged bearer are 401 `UNAUTHENTICATED_BODY`; a bad scope (`ws` missing, not a ULID, more than 20, `mine=maybe`, `proj` over 200) is a named 400 `{error:'invalid_scope'}`; a scope whose workspaces are ALL unreadable (unknown, or the caller is outside) is the frozen `READ_NOT_FOUND_BODY` 404 with the same bytes and headers for an unknown id and a forbidden one; a scope with one readable and one unreadable workspace is 200 and names only the readable one in `flows` and `items` (case: nothing of the unreadable one appears); control: the same URL as a member is 200. Mutation: 403 for forbidden → the identical-bytes assertion reds.`
  - `- ❌ **29.305 — chunk and tray parameters:** a chunk needs `from` and `to` as real IST days with `from <= to` and a span of at most 28 days (else `invalid_window`); `cursor` must be a ULID (else `invalid_cursor`); paging with the returned `nextCursor` walks every item once and ends with null; a tray page after the last is `[]`; control: `from == to` is accepted. Mutation: accept a 60-day window → the span case reds.`
  - `- ❌ **29.306 — `GET /v1/home/summary` equals spec E's numbers on ONE workspace and generalises over several:** with `ws=<one>` and no narrowing its counts and ids equal `GET /v1/workspaces/:id/home` for the same viewer; over two workspaces whose `dueSoonDays` are 7 and 0 the map has both, each ticket is classified by its own workspace's window, and Members counts a person who belongs to both once; Me narrows tickets, not Members or Notes; projects narrow tickets and notes. Mutation: use one workspace's `dueSoonDays` for all → the classification assertion reds.`
  - `- ❌ **29.307 — nothing existing moved:** `GET /v1/workspaces/:id/home` is byte-identical to the stored golden from before this change, and MCP `get_workspace → home` (14.305) still passes unedited; the timeline index route's response contains no field `readHome` has that it should not (no `dueSoonDays` number).`

  `apps/server/test/timeline/routes.test.ts` copies `attention.test.ts`'s skeleton (`createTestDatabase`, `buildReadTestApp`, `signInWithPhone`) and the T1 world:
  ```ts
  import { afterAll, beforeAll, describe, expect, it } from 'vitest';
  import { newUlid } from '@gisik-nokma/domain';
  import { UNAUTHENTICATED_BODY } from '../../src/auth/require-session.js';
  import { READ_NOT_FOUND_BODY } from '../../src/read/membership.js';
  import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
  import { buildReadTestApp, type ReadWorld } from '../helpers/read-app.js';
  import { seedTimelineWorld, type TimelineWorld } from './helpers/world.js';

  let db: TestDatabase;
  let read: ReadWorld;
  beforeAll(async () => { db = await createTestDatabase(); read = await buildReadTestApp(db); }, 120_000);
  afterAll(async () => { await read.app.close(); await db.drop(); });

  const get = (url: string, role?: 'owner' | 'member' | 'outsider') =>
    read.app.inject({ method: 'GET', url, headers: role === undefined ? {} : read.authOf(role) });

  describe('29.304 the doors', () => {
    it('29.304 401 without a session, 401 on a forged bearer; 200 for a member (control)', async () => {
      const ws = read.world.workspaceId;
      const url = `/v1/timeline/index?ws=${ws}`;
      const none = await get(url);
      expect(none.statusCode).toBe(401);
      expect(none.json()).toEqual(UNAUTHENTICATED_BODY);
      const forged = await read.app.inject({ method: 'GET', url, headers: { authorization: 'Bearer forged' } });
      expect(forged.statusCode).toBe(401);
      expect((await get(url, 'member')).statusCode).toBe(200);
    });

    it('29.304 bad scope is a named 400; all-unreadable is the identical 404 for unknown and forbidden', async () => {
      const ws = read.world.workspaceId;
      // the 21 ws ids and the 201 proj ids are DISTINCT: a repeated id would be de-duplicated to one and pass as valid
      for (const q of ['', 'ws=', 'ws=not-a-ulid', `ws=${ws}&mine=maybe`, `proj=${Array.from({ length: 201 }, () => newUlid()).join(',')}&ws=${ws}`, `ws=${Array.from({ length: 21 }, () => newUlid()).join(',')}`]) {
        const r = await get(`/v1/timeline/index?${q}`, 'member');
        expect(r.statusCode, q).toBe(400);
        expect(r.json()).toEqual({ error: 'invalid_scope' });
      }
      const unknown = await get('/v1/timeline/index?ws=01HZZZZZZZZZZZZZZZZZZZZZZZ', 'member');
      const forbidden = await get(`/v1/timeline/index?ws=${read.neighbour.workspaceId}`, 'member');
      expect(unknown.statusCode).toBe(404);
      expect(forbidden.statusCode).toBe(404);
      expect(unknown.json()).toEqual(READ_NOT_FOUND_BODY);
      expect(forbidden.body).toBe(unknown.body);
      expect(forbidden.headers['content-length']).toBe(unknown.headers['content-length']);
    });

    it('29.304 one readable + one unreadable is 200 and nothing of the unreadable appears', async () => {
      const r = await get(`/v1/timeline/index?ws=${[read.world.workspaceId, read.neighbour.workspaceId].sort().join(',')}`, 'member');
      expect(r.statusCode).toBe(200);
      expect(r.body).not.toContain(read.neighbour.workspaceId);
    });
  });
  ```
  (`read.neighbour.workspaceId` is `NeighbourWorkspace`'s field: `grep -n "NeighbourWorkspace" -A6 apps/server/test/helpers/read-app.ts` first.) The 29.305 tests build windows `from=2026-10-01&to=2026-10-28` (accepted), `to=2026-12-01` (400 `invalid_window`), `from=2026-10-05&to=2026-10-01` (400), `from=2026-02-30` (400), `cursor=zzz` (400 `invalid_cursor`), `from=to` accepted, and page the tray/chunk with a pageSize — the HTTP route fixes it at `TIMELINE_PAGE_SIZE`, so the walk test uses a scope with 450 seeded tickets (generated in `beforeAll` of that `describe`) and asserts 200 + 200 + 50 and `nextCursor === null` last. The 29.306 tests use `seedTimelineWorld` (a second `describe` with its own database) and `workspace.settings_set` to give B `dueSoonDays: 0` (grep the payload at `projections/workspace-settings.ts`), compare `/v1/home/summary?ws=A` to `/v1/workspaces/A/home` field by field, and assert the Members dedupe by granting `bo` in both A and B. The 29.307 golden is T1 Step 3's `apps/server/test/timeline/fixtures/home-golden.json` (normalised: world ids by field name, other ULIDs `#`, sorted, no `generatedAt`); this route test requests `GET /v1/workspaces/:id/home` AS THE OWNER (the viewer the golden was captured for; the app's clock is frozen at `SCENARIO_NOW`, `read-app.ts:215`, the instant the golden used), runs the body through `normaliseHome(body, read.world)` from `test/timeline/home-golden.ts`, and compares it with that file. If the file is missing, STOP: T1 Step 3 was skipped.

  Run: `"$SR" wtg4-t3 -- pnpm --filter @gisik-nokma/server exec vitest run test/timeline/routes.test.ts --maxWorkers=2 > /tmp/wtg4-t3.log 2>&1; tail -40 /tmp/wtg4-t3.log`. Expected: FAIL (404 on every route).

- [ ] **Step 2: The routes**

  `apps/server/src/routes/timeline.ts`:
  ```ts
  import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
  import { ULID_REGEX } from '@gisik-nokma/domain';
  import type { Queryable } from '../db/queryable.js';
  import { READ_NOT_FOUND_BODY } from '../read/membership.js';
  import { readTimelineChunk } from '../timeline/read-chunk.js';
  import { readTimelineIndex } from '../timeline/read-index.js';
  import { readTimelineTray } from '../timeline/read-tray.js';
  import { parseTimelineScope, readableWorkspaces } from '../timeline/scope.js';
  import { readHomeSummary } from '../timeline/read-summary.js';
  import { dayNumber } from '../timeline/days.js';

  const DAY = /^\d{4}-\d{2}-\d{2}$/;
  const realDay = (s: unknown): s is string => typeof s === 'string' && DAY.test(s) && new Date(`${s}T00:00:00Z`).toISOString().startsWith(s);

  type Q = Record<string, unknown>;

  /** Shared gate: scope (400) → readable workspaces (404 when none) → handler. D-W4-3. */
  async function gated<T>(
    deps: { pool: Queryable; now: () => Date }, request: { query: unknown; currentUserId: string }, reply: { status(n: number): { send(b: unknown): unknown } },
    run: (readable: Awaited<ReturnType<typeof readableWorkspaces>>, scope: NonNullable<ReturnType<typeof parseTimelineScope>>) => Promise<T>,
  ): Promise<T | unknown> {
    const scope = parseTimelineScope(request.query as Q);
    if (scope === null) return reply.status(400).send({ error: 'invalid_scope' });
    const readable = await readableWorkspaces(deps.pool, request.currentUserId, scope);
    if (readable.length === 0) return reply.status(404).send(READ_NOT_FOUND_BODY);
    return run(readable, scope);
  }

  export function registerTimelineRoutes(
    app: FastifyInstance, deps: { pool: Queryable; now?: () => Date }, requireSession: preHandlerHookHandler,
  ): void {
    const d = { pool: deps.pool, now: deps.now ?? ((): Date => new Date()) };
    app.get('/v1/timeline/index', { preHandler: requireSession }, (request, reply) =>
      gated(d, request, reply, (readable, scope) => readTimelineIndex(d.pool, readable, request.currentUserId, scope, d.now())));

    app.get('/v1/timeline/chunk', { preHandler: requireSession }, (request, reply) => {
      const q = request.query as Q;
      const { from, to, cursor } = q;
      if (!realDay(from) || !realDay(to) || from > to || dayNumber(to) - dayNumber(from) > 27) return reply.status(400).send({ error: 'invalid_window' });
      if (cursor !== undefined && (typeof cursor !== 'string' || !ULID_REGEX.test(cursor))) return reply.status(400).send({ error: 'invalid_cursor' });
      return gated(d, request, reply, (readable, scope) =>
        readTimelineChunk(d.pool, readable, request.currentUserId, scope, d.now(), { from, to }, cursor as string | undefined));
    });

    app.get('/v1/timeline/tray', { preHandler: requireSession }, (request, reply) => {
      const { cursor } = request.query as Q;
      if (cursor !== undefined && (typeof cursor !== 'string' || !ULID_REGEX.test(cursor))) return reply.status(400).send({ error: 'invalid_cursor' });
      return gated(d, request, reply, (readable, scope) =>
        readTimelineTray(d.pool, readable, request.currentUserId, scope, d.now(), cursor as string | undefined));
    });

    app.get('/v1/home/summary', { preHandler: requireSession }, (request, reply) =>
      gated(d, request, reply, (readable, scope) => readHomeSummary(d.pool, readable, request.currentUserId, scope, d.now())));
  }
  ```
  `apps/server/src/timeline/days.ts` is `export const dayNumber = (ymd: string): number => { const [y, m, d] = ymd.split('-').map(Number) as [number, number, number]; return Math.round(Date.UTC(y, m - 1, d) / 86_400_000); };` (the server may not import app-core). The four routes share one file because they share `gated`. Register in `app.ts` after `registerAttentionRoutes(...)`: `registerTimelineRoutes(app, { pool: deps.pool, now: deps.now }, requireSession);`.
  `TimelineScope` validation is done once, by `parseTimelineScope` (T1). Run the test again: PASS 29.304–29.306. Run `MCP workspace-tools.test.ts` and `test/routes/home.test.ts` unedited: PASS (29.307).

  Flip 29.304–29.307. Commit.

- [ ] **Step 3: Mutations, Features, DONE**

  Mutations: (1) 403 for forbidden → 29.304; (2) accept a 60-day window → 29.305; (3) one workspace's `dueSoonDays` for all in `readHomeSummary` → 29.306; (4) drop `requireSession` on one route → 29.304. Run the server suite's routes and integration folders WHOLE. Features bullet under `<!-- WTG4 bullet T3 -->`: *"Timeline and Home summary routes (⚙️): `GET /v1/timeline/{index,chunk,tray}` and `GET /v1/home/summary` over `?ws=&proj=&mine=`; unreadable workspaces drop silently, 404 only when none is readable. `apps/server/src/routes/timeline.ts`."*

  Commit; DONE.

---
### Task 4: The client data layer: DataSource, cache, live, today (cases 29.308–29.312)

**Branch** `task/wtg4-client-data`. Depends on T3 (routes) and T2's verdict (bars met, or the owner's ruling). **App-core online/sync change: also run the server integration files WHOLE.**

**Files:**
- Create:
  - `packages/app-core/src/timeline-graph/{scope,live-patch,scope-cache,scope-feed,use-timeline-scope}.ts(x)`
  - `packages/app-core/src/online/map-timeline.ts`
  - `packages/app-core/test/timeline-graph/{scope,live-patch,scope-cache,scope-feed,use-timeline-scope}.test.ts(x)`, `packages/app-core/test/online/timeline-data-source.test.ts`
  - `apps/web/src/use-ist-today.ts`, `apps/web/test/use-ist-today.test.tsx`
- Modify:
  - `packages/app-core/src/data-source.ts` (four methods on `DataSourceQuery`, beside `getAttention`, `:419`)
  - `packages/app-core/src/online/online-data-source.ts` (four methods, beside `getAttention`, `:570`)
  - `packages/app-core/src/replica/replica-data-source.ts` (`TIMELINE_ABSENCES`, four rejecting methods beside `:1337`, four `REPLICA_GAPS` keys at `:679`)
  - every other `DataSource` implementer the Step 0 grep finds (test fakes, the mobile shell)
  - `apps/server/test/integration/soft-delete-client-surface.test.ts` (the `DataSourceQuery` census: four rows in `DECIDED` and `call`, and the `expect(MEMBERS).toHaveLength(…)` pin bumped by four from the number MEASURED on the branch; Drafts T8 and Part 3 T3, T9 and T11 bumped it before this task)
  - `packages/app-core/test/helpers/clock-scan.ts` (`CLOCK_FREE_ROOTS`, `:31`: add `'timeline-graph'`)
  - `packages/app-core/src/timeline-graph/index.ts` (re-exports)
  - `Features.md` §26 (`<!-- WTG4 bullet T4 -->`), `test-cases/29-workflow-timeline-graphs.md` (`<!-- WTG4 T4 -->`)

**Interfaces:**
- **Consumes:** T1's response types from `@gisik-nokma/domain`; `planFlow`, `segmentsFor` (Part 2 / T1); `subscribe(workspaceId, afterSeq, cb)` (`data-source.ts:459`) and the frames of `ClientStreamFrame` (`event` carries `envelope: LedgerEvent`, `stream-frames.ts:170`); `asRecord / asArray / asString / asNumber / asStringOrNull / MappingError` (`wire-readers.ts:10-47`); `bridge.planRange` (Part 1, via T2's bridge); `istDayBounds` (domain).
- **Produces:** `ScopeArg`, `scopeQuery(scope)`, `scopeKey(scope)`; `DataSourceQuery.getTimelineIndex(scope) / getTimelineChunk(scope, window, cursor?) / getTimelineTray(scope, cursor?) / getHomeSummary(scope)`, each `Promise<X | null>` where `null` means no workspace of the scope is readable (the GET 404 affordance, `online/http.ts:121`); `classifyEvent(type): 'patch' | 'stale' | 'ignore'`; `applyInputEvent(core, ev, today)`; `class ScopeCache` (with `asOf`); `subscribeScope(source, workspaceIds, getAsOf, onFrame): ScopeFeed` (T7 reuses it); `useTimelineScope(source, scope, opts?)`; `useIstToday()` (web).

Siblings copied: `getAttention` end to end (`data-source.ts:419`, `online-data-source.ts:570`, `replica-data-source.ts:448,679,1337`, `test/online/online-data-source.test.ts:50` `recordingFetch`); `useLiveQuery` (`views/use-live-query.ts`) for the issue-ordered load and the epoch guard.

- [ ] **Step 0: Pre-flight**

  1. Cut the branch from `origin/release/workflow-graph`; `pnpm install` under Node 22; `pnpm turbo run build --filter=@gisik-nokma/web...`.
  2. Find every implementer: `grep -rln "getAttention" --include=*.ts --include=*.tsx packages apps | grep -v node_modules` and list them in `HANDOFF-wtg4-client-data.md`. Each gets the four methods (a fake returns a canned value or `null`; the replica rejects).
  3. Confirm the stream behaviour the live gate depends on: `grep -n "workspaceSeq\|caught-up\|existing" packages/app-core/src/online/stream.ts` and read `:357-359, :409-410, :455-468`. Measured on the KG tip: rooms are shared per workspace; a FIRST subscriber to a room replays from its `afterSeq` (cursor 0 replays history) and gets one `caught-up`; a LATER subscriber to an existing room gets no replay and no `caught-up` (`stream.ts:455-468`); every `event` frame carries `envelope.workspaceSeq`. So `caught-up` cannot tell a hook that history is over, and the hook never waits for it: it compares each event's `workspaceSeq` with the `asOf` of the data it holds (D-W4-23). If the landed stream differs, STOP and report.
  4. `grep -n "export" packages/app-core/test/helpers/clock-scan.ts` and read `:31-60` so the new root's scan is understood; `hasUtc` calls with arguments (`Date.UTC(...)`) are the only date use in this directory.

- [ ] **Step 1: Scope and the mappers, test first (29.308)**

  Case lines under `<!-- WTG4 T4 -->`:
  - `- ❌ **29.308 — the four reads reach the server by one canonical URL and are read strictly:** `scopeQuery` sorts and de-duplicates ids and prints `mine=0|1`, so two spellings of one scope are one URL and one cache key; the online source GETs `/v1/timeline/index`, `/chunk` (with `from`, `to`, `cursor`), `/tray` and `/v1/home/summary` with that query; a 404 answer is `null`; a body with a segment type outside `actual|planned|ghost`, a boolean `pin` (D-W4-2), a missing `today`, a missing or non-numeric `asOf` (D-W4-23), or a flow node without an id is a `MappingError`; the replica rejects all four with `ReplicaGapError` naming the roster and attachments, and `REPLICA_GAPS` lists the four keys; control: the same bodies without the corruption map. Mutation: do not sort ids → the canonical-URL assertion reds.`

  `packages/app-core/test/timeline-graph/scope.test.ts`:
  ```ts
  import { describe, expect, it } from 'vitest';
  import { scopeKey, scopeQuery } from '../../src/timeline-graph/scope.js';

  describe('29.308 scope', () => {
    it('29.308 two spellings of one scope are one URL and one key; Me prints mine=1; control: a different project is a different key', () => {
      const a = { workspaceIds: ['B', 'A', 'A'], projectIds: [], mine: false };
      const b = { workspaceIds: ['A', 'B'], projectIds: [], mine: false };
      expect(scopeQuery(a)).toBe('ws=A,B&mine=0');
      expect(scopeQuery(a)).toBe(scopeQuery(b));
      expect(scopeKey(a)).toBe(scopeKey(b));
      expect(scopeQuery({ ...b, projectIds: ['P2', 'P1'], mine: true })).toBe('ws=A,B&proj=P1,P2&mine=1');
      expect(scopeKey({ ...b, projectIds: ['P1'] })).not.toBe(scopeKey(b));
    });
  });
  ```
  `scope.ts`:
  ```ts
  /** One Home / graph scope: workspaces, optional projects, Me or Everyone (HM-1). */
  export type ScopeArg = { workspaceIds: readonly string[]; projectIds: readonly string[]; mine: boolean };

  const canon = (ids: readonly string[]): string[] => [...new Set(ids)].sort();

  /** The query string every timeline / summary read uses; ids sorted so one scope is one URL (and one server-side cache key). */
  export function scopeQuery(s: ScopeArg): string {
    const parts = [`ws=${canon(s.workspaceIds).join(',')}`];
    if (s.projectIds.length > 0) parts.push(`proj=${canon(s.projectIds).join(',')}`);
    parts.push(`mine=${s.mine ? 1 : 0}`);
    return parts.join('&');
  }
  export const scopeKey = (s: ScopeArg): string => scopeQuery(s);
  ```
  `packages/app-core/test/online/timeline-data-source.test.ts` (copy `recordingFetch` from `online-data-source.test.ts:50`):
  ```ts
  import { describe, expect, it } from 'vitest';
  import { createOnlineDataSource } from '../../src/online/online-data-source.js';
  import { MappingError } from '../../src/online/mappers.js';
  import { REPLICA_GAPS, ReplicaGapError } from '../../src/replica/replica-data-source.js';

  function recordingFetch(answers: Record<string, unknown>) {
    const calls: string[] = [];
    const fetchImpl = async (input: string) => {
      calls.push(input);
      const path = input.replace(/^https?:\/\/[^/]+/, '').split('?')[0] ?? '';
      const body = answers[path];
      return { ok: body !== undefined, status: body === undefined ? 404 : 200, json: async () => body } as Response;
    };
    return { fetchImpl, calls };
  }
  const entry = (over: Record<string, unknown> = {}) => ({
    id: '01HZ0000000000000000000001', workspaceId: 'W', key: 'GN-1', draft: false, kind: 'ticket', lane: 'P',
    segments: [{ start: '2026-10-05', end: '2026-10-07', pass: 1, type: 'planned' }], pin: { notes: 0, attachments: 0 },
    resolution: null, category: 'open', flowId: null, ...over,
  });
  const index = (over: Record<string, unknown> = {}) => ({ today: '2026-10-03', asOf: { W1: 7, W2: 9 }, items: [entry()], flows: [], tray: { count: 0 }, truncated: null, ...over });
  const scope = { workspaceIds: ['W2', 'W1'], projectIds: [], mine: true };

  describe('29.308 timeline reads', () => {
    it('29.308 GETs the canonical URLs; a 404 is null', async () => {
      const { fetchImpl, calls } = recordingFetch({
        '/v1/timeline/index': index(), '/v1/timeline/chunk': { items: [], nextCursor: null }, '/v1/timeline/tray': { items: [], nextCursor: null },
      });
      const source = createOnlineDataSource({ baseUrl: 'http://s.test', fetchImpl });
      await source.query.getTimelineIndex(scope);
      await source.query.getTimelineChunk(scope, { from: '2026-10-05', to: '2026-11-01' }, 'C1');
      await source.query.getTimelineTray(scope);
      expect(calls[0]).toBe('http://s.test/v1/timeline/index?ws=W1,W2&mine=1');
      expect(calls[1]).toBe('http://s.test/v1/timeline/chunk?ws=W1,W2&mine=1&from=2026-10-05&to=2026-11-01&cursor=C1');
      expect(calls[2]).toBe('http://s.test/v1/timeline/tray?ws=W1,W2&mine=1');
      expect(await source.query.getHomeSummary(scope)).toBeNull(); // no /v1/home/summary answer: the 404 affordance
    });

    it('29.308 corrupt bodies are MappingErrors; control: the clean body maps', async () => {
      const bad = [
        index({ items: [entry({ segments: [{ start: '2026-10-05', end: '2026-10-07', pass: 1, type: 'bogus' }] })] }),
        index({ items: [entry({ pin: true })] }),
        (({ today: _t, ...rest }) => rest)(index()),
        (({ asOf: _a, ...rest }) => rest)(index()),            // a missing cut is never guessed as 0 (D-W4-23)
        index({ asOf: { W1: 'seven' } }),
        index({ flows: [{ id: 'F', workspaceId: 'W', truncated: false, nodes: [{ kind: 'ticket' }], edges: [] }] }),
      ];
      for (const body of bad) {
        const { fetchImpl } = recordingFetch({ '/v1/timeline/index': body });
        await expect(createOnlineDataSource({ baseUrl: '', fetchImpl }).query.getTimelineIndex(scope)).rejects.toBeInstanceOf(MappingError);
      }
      const { fetchImpl } = recordingFetch({ '/v1/timeline/index': index() });
      const ok = await createOnlineDataSource({ baseUrl: '', fetchImpl }).query.getTimelineIndex(scope);
      expect(ok?.items[0]?.pin).toEqual({ notes: 0, attachments: 0 });
    });

    it('29.308 the replica refuses all four, and REPLICA_GAPS lists them', () => {
      for (const m of ['getTimelineIndex', 'getTimelineChunk', 'getTimelineTray', 'getHomeSummary']) {
        expect(Object.keys(REPLICA_GAPS)).toContain(m);
        expect(REPLICA_GAPS[m]?.some((a) => /roster|attachment/i.test(a.because))).toBe(true);
      }
      expect(new ReplicaGapError('getTimelineIndex', REPLICA_GAPS['getTimelineIndex'] ?? []).absences.length).toBeGreaterThan(0);
    });
  });
  ```
  Add to the replica test that already compares `REPLICA_GAPS` keys with the rejecting methods (`12.185`) nothing: the new keys satisfy it; run it unedited as the proof. Run: `"$SR" wtg4-t4 -- pnpm --filter @gisik-nokma/app-core exec vitest run test/timeline-graph/scope.test.ts test/online/timeline-data-source.test.ts --maxWorkers=2 > /tmp/wtg4-t4.log 2>&1; tail -30 /tmp/wtg4-t4.log`. Expected FAIL.

  `data-source.ts` (inside `DataSourceQuery`, after `getAttention`):
  ```ts
  /**
   * The Timeline graph and Home's one scope (Workflow and Timeline graphs, Part 4). `null` is "no workspace of this scope is readable by you":
   * the route's 404 and the transport's GET affordance. A scope with SOME readable workspaces answers for those and says nothing of the rest (D-W4-3).
   * The offline copy cannot answer any of these (attachments, roster and a multi-workspace scope are not local): `ReplicaGapError`.
   */
  getTimelineIndex(scope: ScopeArg): Promise<TimelineIndexResponse | null>;
  getTimelineChunk(scope: ScopeArg, window: { from: string; to: string }, cursor?: string): Promise<TimelineChunkResponse | null>;
  getTimelineTray(scope: ScopeArg, cursor?: string): Promise<TimelineTrayResponse | null>;
  getHomeSummary(scope: ScopeArg): Promise<HomeSummaryResponse | null>;
  ```
  `online/map-timeline.ts`:
  ```ts
  import type { TimelineChunkResponse, TimelineEntry, TimelineIndexResponse, TimelineSegment, TimelineTrayItem, TimelineTrayResponse, HomeSummaryResponse, TimelineFlow } from '@gisik-nokma/domain';
  import { MappingError, asArray, asNumber, asRecord, asString, asStringOrNull } from '../wire-readers.js';

  const SEGMENT_TYPES = ['actual', 'planned', 'ghost', 'stub'] as const;
  const CATEGORIES = ['open', 'active', 'terminal', 'backlog'] as const; // StateCategory: copy the domain's own list at Step 0

  function oneOf<T extends string>(value: unknown, allowed: readonly T[], path: string): T {
    if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) throw new MappingError(path, `one of ${allowed.join('/')}`);
    return value as T;
  }
  const day = (v: unknown, path: string): string => {
    const s = asString(v, path);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new MappingError(path, 'a YYYY-MM-DD day');
    return s;
  };
  function segment(raw: unknown, path: string): TimelineSegment {
    const r = asRecord(raw, path);
    return { start: day(r['start'], `${path}.start`), end: day(r['end'], `${path}.end`), pass: asNumber(r['pass'], `${path}.pass`), type: oneOf(r['type'], SEGMENT_TYPES, `${path}.type`) };
  }
  function entry(raw: unknown, path: string): TimelineEntry {
    const r = asRecord(raw, path);
    const pin = asRecord(r['pin'], `${path}.pin`); // a boolean pin is the old shape: refuse it (D-W4-2)
    const res = r['resolution'];
    const resolution = res === null ? null : (() => {
      const x = asRecord(res, `${path}.resolution`);
      return { kind: 'not-taken' as const, decisionTicketId: asString(x['decisionTicketId'], `${path}.resolution.decisionTicketId`), outcome: asString(x['outcome'], `${path}.resolution.outcome`), pass: asNumber(x['pass'], `${path}.resolution.pass`) };
    })();
    return {
      id: asString(r['id'], `${path}.id`), workspaceId: asString(r['workspaceId'], `${path}.workspaceId`), key: asStringOrNull(r, 'key', path),
      draft: r['draft'] === true, kind: oneOf(r['kind'], ['ticket', 'decision'] as const, `${path}.kind`), lane: asString(r['lane'], `${path}.lane`),
      segments: asArray(r['segments'], `${path}.segments`).map((s, i) => segment(s, `${path}.segments[${i}]`)),
      pin: { notes: asNumber(pin['notes'], `${path}.pin.notes`), attachments: asNumber(pin['attachments'], `${path}.pin.attachments`) },
      resolution, category: oneOf(r['category'], CATEGORIES, `${path}.category`), flowId: asStringOrNull(r, 'flowId', path),
    };
  }
  function flow(raw: unknown, path: string): TimelineFlow {
    const r = asRecord(raw, path);
    const nodes = asArray(r['nodes'], `${path}.nodes`).map((n, i) => {
      const o = asRecord(n, `${path}.nodes[${i}]`);
      asString(o['id'], `${path}.nodes[${i}].id`);
      return o as unknown as TimelineFlow['nodes'][number]; // the plan inputs are Part 2's FlowNode (made by `flowNodeOf` on the server): its own tests own the field shapes
    });
    const edges = asArray(r['edges'], `${path}.edges`).map((e, i) => {
      const o = asRecord(e, `${path}.edges[${i}]`);
      return { from: asString(o['from'], `${path}.edges[${i}].from`), to: asString(o['to'], `${path}.edges[${i}].to`), kind: oneOf(o['kind'], ['leads_to', 'blocks'] as const, `${path}.edges[${i}].kind`), label: asStringOrNull(o, 'label', `${path}.edges[${i}]`) };
    });
    return { id: asString(r['id'], `${path}.id`), workspaceId: asString(r['workspaceId'], `${path}.workspaceId`), truncated: r['truncated'] === true, nodes, edges };
  }

  /** `asOf`: workspace id to its stream head (D-W4-23). A missing or non-numeric entry is a MappingError, never a guessed 0 (a 0 would claim the data is older than every event). */
  const seqMap = (raw: unknown, path: string): Record<string, number> =>
    Object.fromEntries(Object.entries(asRecord(raw, path)).map(([k, v]) => [k, asNumber(v, `${path}.${k}`)]));

  export function mapTimelineIndex(raw: unknown): TimelineIndexResponse | null {
    if (raw === null) return null;
    const r = asRecord(raw, 'timelineIndex');
    const tr = r['truncated'];
    return {
      today: day(r['today'], 'timelineIndex.today'),
      asOf: seqMap(r['asOf'], 'timelineIndex.asOf'),
      items: asArray(r['items'], 'timelineIndex.items').map((e, i) => entry(e, `timelineIndex.items[${i}]`)),
      flows: asArray(r['flows'], 'timelineIndex.flows').map((f, i) => flow(f, `timelineIndex.flows[${i}]`)),
      tray: { count: asNumber(asRecord(r['tray'], 'timelineIndex.tray')['count'], 'timelineIndex.tray.count') },
      truncated: tr === null || tr === undefined ? null : (() => { const t = asRecord(tr, 'timelineIndex.truncated'); return { dropped: asNumber(t['dropped'], 'dropped'), before: day(t['before'], 'before') }; })(),
    };
  }
  export function mapTimelineChunk(raw: unknown): TimelineChunkResponse | null {
    if (raw === null) return null;
    const r = asRecord(raw, 'timelineChunk');
    return {
      items: asArray(r['items'], 'timelineChunk.items').map((d, i) => {
        const o = asRecord(d, `timelineChunk.items[${i}]`);
        asString(o['id'], `timelineChunk.items[${i}].id`);
        asString(o['title'], `timelineChunk.items[${i}].title`);
        return o as unknown as TimelineChunkResponse['items'][number];
      }),
      nextCursor: asStringOrNull(r, 'nextCursor', 'timelineChunk'),
    };
  }
  export function mapTimelineTray(raw: unknown): TimelineTrayResponse | null {
    if (raw === null) return null;
    const r = asRecord(raw, 'timelineTray');
    return {
      items: asArray(r['items'], 'timelineTray.items').map((t, i): TimelineTrayItem => {
        const o = asRecord(t, `timelineTray.items[${i}]`);
        const rb = o['reachedBy'];
        return {
          id: asString(o['id'], 'id'), workspaceId: asString(o['workspaceId'], 'workspaceId'), projectId: asString(o['projectId'], 'projectId'),
          key: asStringOrNull(o, 'key', 'tray'), title: asString(o['title'], 'title'), draft: o['draft'] === true,
          reason: oneOf(o['reason'], ['no-dates', 'no-estimate', 'start-after-due'] as const, 'reason'),
          reachedBy: rb === null || rb === undefined ? null : (() => { const x = asRecord(rb, 'reachedBy'); return { decisionTicketId: asString(x['decisionTicketId'], 'decisionTicketId'), decisionKey: asStringOrNull(x, 'decisionKey', 'reachedBy'), decisionTitle: asString(x['decisionTitle'], 'decisionTitle'), outcome: asString(x['outcome'], 'outcome') }; })(),
        };
      }),
      nextCursor: asStringOrNull(r, 'nextCursor', 'timelineTray'),
    };
  }
  export function mapHomeSummary(raw: unknown): HomeSummaryResponse | null {
    if (raw === null) return null;
    const r = asRecord(raw, 'homeSummary');
    const c = asRecord(r['counts'], 'homeSummary.counts');
    const ids = asRecord(r['ids'], 'homeSummary.ids');
    const list = (k: string): string[] => asArray(ids[k], `homeSummary.ids.${k}`).map((x, i) => asString(x, `homeSummary.ids.${k}[${i}]`));
    const days = asRecord(r['dueSoonDays'], 'homeSummary.dueSoonDays');
    return {
      generatedAt: asString(r['generatedAt'], 'generatedAt'),
      asOf: seqMap(r['asOf'], 'homeSummary.asOf'),
      workspaceIds: asArray(r['workspaceIds'], 'workspaceIds').map((x, i) => asString(x, `workspaceIds[${i}]`)),
      dueSoonDays: Object.fromEntries(Object.entries(days).map(([k, v]) => [k, asNumber(v, `dueSoonDays.${k}`)])),
      counts: {
        tickets: asNumber(c['tickets'], 'tickets'), open: asNumber(c['open'], 'open'), pastDue: asNumber(c['pastDue'], 'pastDue'),
        dueSoon: asNumber(c['dueSoon'], 'dueSoon'), members: c['members'] === null ? null : asNumber(c['members'], 'members'), notes: asNumber(c['notes'], 'notes'),
      },
      ids: { tickets: list('tickets'), open: list('open'), pastDue: list('pastDue'), dueSoon: list('dueSoon'), members: list('members'), notes: list('notes') },
    };
  }
  ```
  `online-data-source.ts`, beside `getAttention`:
  ```ts
  getTimelineIndex: async (scope) => mapTimelineIndex(await http.get(`/v1/timeline/index?${scopeQuery(scope)}`)),
  getTimelineChunk: async (scope, window, cursor) =>
    mapTimelineChunk(await http.get(`/v1/timeline/chunk?${scopeQuery(scope)}&from=${window.from}&to=${window.to}${cursor === undefined ? '' : `&cursor=${cursor}`}`)),
  getTimelineTray: async (scope, cursor) =>
    mapTimelineTray(await http.get(`/v1/timeline/tray?${scopeQuery(scope)}${cursor === undefined ? '' : `&cursor=${cursor}`}`)),
  getHomeSummary: async (scope) => mapHomeSummary(await http.get(`/v1/home/summary?${scopeQuery(scope)}`)),
  ```
  `replica-data-source.ts`:
  ```ts
  const TIMELINE_ABSENCES: readonly ReplicaAbsence[] = [
    { field: 'TimelineEntry.pin', because: 'attachment counts are not replicated (see ATTACHMENTS_ABSENCES), and a pin that omitted them would say a ticket has no attachment when it has', owner: 'Plan 10: an attachments table' },
    { field: 'HomeSummaryResponse.counts.members', because: 'no roster is replicated (see MEMBERS_ABSENCES), and a scope can span workspaces the device has not synced', owner: 'Plan 10: a roster accessor' },
    { field: 'scope', because: 'a scope can name several workspaces and Me | Everyone across them; the replica serves one workspace at a time', owner: 'Plan 10: a multi-workspace local query' },
  ];
  // in REPLICA_GAPS: getTimelineIndex, getTimelineChunk, getTimelineTray, getHomeSummary: TIMELINE_ABSENCES
  //   (Part 3 T3, T9 and T11 have already put getFlow, publishFlow, previewDecide and decide directly under getAttention; the key order is
  //   tested, so put these four after the last of Part 3's keys, and bump the DataSourceQuery member count of
  //   soft-delete-client-surface.test.ts by the number MEASURED on the branch, never by a number copied from a plan)
  // in the source: getTimelineIndex: () => Promise.reject(new ReplicaGapError('getTimelineIndex', TIMELINE_ABSENCES)), … (four lines)
  ```
  Run: PASS. Flip 29.308. Commit.

- [ ] **Step 2: Event classes and the live patch, test first (29.309)**

  Case lines:
  - `- ❌ **29.309 — every event type is classified, and the patch re-plans:** each type in `domainRegistry.registrations()` whose name starts `ticket.`, `visibility.`, `membership.`, `project.`, `note.` or `attachment.` is in the explicit table as `patch`, `stale` or `ignore` (a new type with no entry reds); `ticket.field_set` of `dueDate`, `startDate`, `estimate`, `reworkEstimate` or `waitForAll` on a flow MEMBER re-plans the flow with `planFlow` and moves its successors' segments without a request; the same on a singleton, a `leads_to` removal, a link between two flows, `ticket.assigned`, `ticket.collaborator_added` and any `ticket.transitioned` answer `stale`; a patch that changes who is on the tray answers `stale`; control: the same dueDate change on a member patches. Mutation: classify `ticket.transitioned` as `patch` → the table case reds.`

  `packages/app-core/test/timeline-graph/live-patch.test.ts`:
  ```ts
  import { describe, expect, it } from 'vitest';
  import { domainRegistry, DECISION_TYPE_ID, type FlowNode, type TimelineEntry, type TimelineFlow } from '@gisik-nokma/domain';
  import { applyInputEvent, classifyEvent, EVENT_CLASS, type PatchableCore } from '../../src/timeline-graph/live-patch.js';

  const WATCHED = /^(ticket|visibility|membership|project|note|attachment)\./;
  /** Part 2's `FlowNode` (Part 2 plan :4036): the index carries the server's `flowNodeOf` output. */
  const node = (id: string, over: Partial<FlowNode> = {}): FlowNode => ({
    id, typeId: 'task', stateId: 'todo', category: 'open', closed: false, trashed: false, draft: false, parentId: null, isDecision: false, outcome: null, passes: [],
    notTaken: null, waitForAll: false, started: false, rounds: 1, periods: [], explicitStart: null, explicitDue: null, estimate: 2, reworkEstimate: null,
    initialStateId: 'todo', firstTerminalStateId: 'done', ...over,
  });
  const entry = (id: string, flowId: string | null, segments: TimelineEntry['segments']): TimelineEntry => ({
    id, workspaceId: 'W', key: id, draft: false, kind: 'ticket', lane: 'P', segments, pin: { notes: 0, attachments: 0 }, resolution: null, category: 'open', flowId,
  });
  const core = (): PatchableCore => ({
    items: [
      entry('A', 'A', [{ start: '2026-10-05', end: '2026-10-06', pass: 1, type: 'planned' }]),
      entry('B', 'A', [{ start: '2026-10-07', end: '2026-10-08', pass: 1, type: 'planned' }]),
      entry('S', null, [{ start: '2026-10-20', end: '2026-10-21', pass: 1, type: 'planned' }]),
    ],
    flows: [{ id: 'A', workspaceId: 'W', truncated: false, nodes: [node('A', { explicitStart: '2026-10-05' }), node('B')], edges: [{ from: 'A', to: 'B', kind: 'leads_to', label: null }] } satisfies TimelineFlow],
    details: new Map(),
  });
  const ev = (type: string, entityId: string, payload: Record<string, unknown>) => ({ type, entityId, payload });
  const TODAY = '2026-10-03';

  describe('29.309 classification', () => {
    it('29.309 every watched registered type has a class (a new event cannot be silently ignored)', () => {
      const watched = domainRegistry.registrations().map((r) => r.type).filter((t) => WATCHED.test(t));
      expect(watched.length).toBeGreaterThan(10);
      expect(watched.filter((t) => EVENT_CLASS[t] === undefined)).toEqual([]);
      expect(classifyEvent('ticket.transitioned')).toBe('stale');
      expect(classifyEvent('ticket.field_set')).toBe('patch');
      expect(classifyEvent('comment.added')).toBe('ignore');
      expect(classifyEvent('ticket.some_future_type')).toBe('stale'); // unknown inside a watched prefix is stale, never ignore
    });
  });

  describe('29.309 applyInputEvent', () => {
    it('29.309 a longer estimate on a flow member re-plans: B moves to the day after A\'s new end; no request', () => {
      const r = applyInputEvent(core(), ev('ticket.field_set', 'A', { fieldId: 'estimate', value: 5 }), TODAY);
      expect(r.result).toBe('patched');
      expect(r.next.items.find((e) => e.id === 'A')?.segments[0]).toMatchObject({ start: '2026-10-05', end: '2026-10-09' });
      expect(r.next.items.find((e) => e.id === 'B')?.segments[0]?.start).toBe('2026-10-10'); // chained: the day after A's new end
      expect(core().items.find((e) => e.id === 'B')?.segments[0]?.start).toBe('2026-10-07'); // control: the input core is untouched
    });
    it('29.309 singleton, link removal, link between flows, assignee, collaborator and transitions are stale', () => {
      for (const e of [
        ev('ticket.field_set', 'S', { fieldId: 'dueDate', value: { date: '2026-10-22' } }),
        ev('ticket.link_removed', 'A', { kind: 'leads_to', targetId: 'B' }),
        ev('ticket.link_added', 'B', { kind: 'leads_to', targetId: 'S' }),
        ev('ticket.assigned', 'A', { assigneeId: 'U' }),
        ev('ticket.collaborator_added', 'A', { userId: 'U' }),
        ev('ticket.transitioned', 'A', { to: 'done' }),
      ]) expect(applyInputEvent(core(), e, TODAY).result, e.type).toBe('stale');
    });
    it('29.309 a patch that would put a member on or off the tray is stale; a title is patched into details', () => {
      // clearing A's only dates and estimate leaves nothing to draw: the tray changes, which is a server page
      const clear = applyInputEvent(core(), ev('ticket.field_set', 'A', { fieldId: 'startDate', value: null }), TODAY);
      expect(clear.result).toBe('stale');
      const t = applyInputEvent({ ...core(), details: new Map([['A', { id: 'A', title: 'Old' } as never]]) }, ev('ticket.field_set', 'A', { fieldId: 'title', value: 'New' }), TODAY);
      expect(t.result).toBe('patched');
      expect(t.next.details.get('A')?.title).toBe('New');
    });
  });
  ```
  `live-patch.ts`:
  ```ts
  import { istDayOf, planFlow, segmentsFor, type FlowNode, type TimelineDetail, type TimelineEntry, type TimelineFlow } from '@gisik-nokma/domain';

  export type EventClass = 'patch' | 'stale' | 'ignore';
  export type PatchResult = 'patched' | 'stale' | 'ignored';
  export type PatchableCore = { items: TimelineEntry[]; flows: TimelineFlow[]; details: Map<string, TimelineDetail> };
  export type InputEvent = { type: string; entityId: string; payload: Record<string, unknown> };

  /**
   * D-W4-10. `patch`: the event is an INPUT of the plan and the client can re-plan it (dates, estimate, wait-for-all, title, a new link inside one
   * flow). `stale`: it moves periods, membership of the scope, visibility or pin counts, which derive from facts the client does not hold: refetch.
   * `ignore`: it cannot change any drawn fact. The table is EXPLICIT per type, and a census test iterates the registry, so a new event type must be
   * classified here to pass.
   */
  export const EVENT_CLASS: Readonly<Record<string, EventClass>> = {
    'ticket.field_set': 'patch', 'ticket.link_added': 'patch',
    'ticket.link_removed': 'stale', 'ticket.created': 'stale', 'ticket.transitioned': 'stale', 'ticket.closed': 'stale', 'ticket.reopened': 'stale',
    'ticket.decided': 'stale', 'ticket.workflow_rebound': 'stale', 'ticket.published': 'stale', 'ticket.assigned': 'stale', 'ticket.unassigned': 'stale',
    'ticket.collaborator_added': 'stale', 'ticket.collaborator_removed': 'stale', 'ticket.deleted': 'stale', 'ticket.restored': 'stale',
    'ticket.moved': 'stale', 'ticket.retyped': 'stale', 'ticket.parent_set': 'stale', 'ticket.ranked': 'ignore',
    'visibility.set': 'stale',
    'membership.granted': 'stale', 'membership.revoked': 'stale', 'membership.role_changed': 'stale',
    'project.created': 'stale', 'project.archived': 'stale', 'project.restored': 'stale', 'project.deleted': 'stale', 'project.undeleted': 'stale',
    'project.member_added': 'stale', 'project.member_removed': 'stale', 'project.renamed': 'stale',
    'note.created': 'stale', 'note.deleted': 'stale', 'note.restored': 'stale', 'note.moved': 'stale', 'note.scope_set': 'stale',
    'note.updated': 'ignore', 'note.renamed': 'ignore',
    'attachment.added': 'stale', 'attachment.removed': 'stale',
  };
  const WATCHED = /^(ticket|visibility|membership|project|note|attachment)\./;
  export function classifyEvent(type: string): EventClass {
    const known = EVENT_CLASS[type];
    if (known !== undefined) return known;
    return WATCHED.test(type) ? 'stale' : 'ignore';
  }

  const PLAN_FIELDS = new Set(['startDate', 'dueDate', 'estimate', 'reworkEstimate', 'waitForAll']);
  const dayOf = (v: unknown): string | null => (v !== null && typeof v === 'object' && typeof (v as { date?: unknown }).date === 'string' ? (v as { date: string }).date : null);
  const numOf = (v: unknown): number | null => (typeof v === 'number' ? v : null);

  function withField(n: FlowNode, fieldId: string, value: unknown): FlowNode {
    switch (fieldId) {
      case 'startDate': return { ...n, explicitStart: dayOf(value) };
      case 'dueDate': return { ...n, explicitDue: dayOf(value) };
      case 'estimate': return { ...n, estimate: numOf(value) };
      case 'reworkEstimate': return { ...n, reworkEstimate: numOf(value) };
      default: return { ...n, waitForAll: value === true };
    }
  }

  /** Re-plan one flow and rewrite the segments of its members that have entries. `null` when the tray would change (that is a server page). */
  function replan(core: PatchableCore, flow: TimelineFlow, today: string): PatchableCore | null {
    const plan = planFlow({ nodes: flow.nodes, edges: flow.edges.filter((e) => e.kind === 'leads_to').map(({ from, to, label }) => ({ sourceId: from, targetId: to, label })) });
    const items = core.items.map((e) => ({ ...e }));
    for (const n of flow.nodes) {
      const np = plan.get(n.id);
      if (np === undefined) continue;
      const i = items.findIndex((e) => e.id === n.id);
      const periods = n.periods.map((p) => ({ start: istDayOf(p.start), end: p.end === null ? null : istDayOf(p.end), pass: p.pass })); // FlowNode periods are instants
      const prevStub = i === -1 ? undefined : (items[i] as TimelineEntry).segments.find((x) => x.type === 'stub'); // FlowNode has no close time: keep the server's stub day
      const segments = segmentsFor({ periods, planned: np.intervals, notTaken: n.notTaken, closedDay: prevStub?.start ?? null, today });
      const wasDrawn = i !== -1;
      const nowDrawn = segments.length > 0;
      if (wasDrawn !== nowDrawn && n.notTaken === null) return null; // tray membership changed: a server page
      if (wasDrawn) items[i] = { ...(items[i] as TimelineEntry), segments };
    }
    return { ...core, items };
  }

  export function applyInputEvent(core: PatchableCore, ev: InputEvent, today: string): { next: PatchableCore; result: PatchResult } {
    const stale = { next: core, result: 'stale' as const };
    const cls = classifyEvent(ev.type);
    if (cls === 'ignore') return { next: core, result: 'ignored' };
    if (cls === 'stale') return stale;
    if (ev.type === 'ticket.field_set') {
      const fieldId = String(ev.payload['fieldId']);
      if (fieldId === 'title') {
        const d = core.details.get(ev.entityId);
        if (d === undefined) return stale; // nothing drawn yet to rename: the chunk will bring it
        const details = new Map(core.details).set(ev.entityId, { ...d, title: String(ev.payload['value'] ?? '') });
        return { next: { ...core, details }, result: 'patched' };
      }
      if (!PLAN_FIELDS.has(fieldId)) return { next: core, result: 'ignored' };
      const flow = core.flows.find((f) => !f.truncated && f.nodes.some((n) => n.id === ev.entityId));
      if (flow === undefined) return stale; // a singleton has no plan inputs in the index
      const nodes = flow.nodes.map((n) => (n.id === ev.entityId ? withField(n, fieldId, ev.payload['value']) : n));
      const nextFlow = { ...flow, nodes };
      const re = replan(core, nextFlow, today);
      if (re === null) return stale;
      return { next: { ...re, flows: core.flows.map((f) => (f === flow ? nextFlow : f)) }, result: 'patched' };
    }
    if (ev.type === 'ticket.link_added') {
      if (ev.payload['kind'] !== 'leads_to') return stale;
      const target = String(ev.payload['targetId']);
      const flow = core.flows.find((f) => !f.truncated && f.nodes.some((n) => n.id === ev.entityId) && f.nodes.some((n) => n.id === target));
      if (flow === undefined) return stale; // between flows or singletons: components merge, refetch
      const label = typeof ev.payload['label'] === 'string' ? ev.payload['label'] : null;
      const nextFlow = { ...flow, edges: [...flow.edges, { from: ev.entityId, to: target, kind: 'leads_to' as const, label }] };
      const re = replan(core, nextFlow, today);
      if (re === null) return stale;
      return { next: { ...re, flows: core.flows.map((f) => (f === flow ? nextFlow : f)) }, result: 'patched' };
    }
    return stale;
  }
  ```
  The `EVENT_CLASS` keys are written from the registry at Step 0: run `node -e` over `domainRegistry.registrations()` filtered by `WATCHED` and make the table list every one (the names above are the ones read on the tip; the census test is the arbiter, and it names the missing ones). Run the test, fix the table until the census passes. Flip 29.309. Commit.

- [ ] **Step 3: `ScopeCache` (29.310 part 1)**

  Case line:
  - `- ❌ **29.310 — a live event in the SECOND workspace of the scope moves the bars, and an event the held data already contains is never applied twice (Review Focus 1):** with a two-workspace scope, a `ticket.field_set estimate` event in workspace B whose `workspaceSeq` is above B's `asOf` patches B's flow in the cache and notifies subscribers WITHOUT a request; a `ticket.transitioned` above `asOf` marks the cache stale and ONE index refetch follows 400 ms later (a second event inside the window does not add a second); an event at or below `asOf` (a history replay, or a late joiner's duplicate) does nothing; events that arrive BEFORE the first answer and are newer than its `asOf` cause exactly one refetch after it, and older ones none; an event in neither workspace does nothing; a `caught-up` frame is never waited for (a hook that joined an existing room never receives one); control: the same events in A behave the same. Mutation: subscribe only the first workspace → the B assertions red; compare `workspaceSeq` with `>=` → the at-`asOf` assertion reds; gate on `caught-up` instead of `asOf` → the late-joiner assertion reds.`

  `scope-cache.ts`:
  ```ts
  import type { TimelineChunkResponse, TimelineDetail, TimelineEntry, TimelineFlow, TimelineIndexResponse, TimelineTrayItem, TimelineTrayResponse } from '@gisik-nokma/domain';
  import { applyInputEvent, type InputEvent, type PatchResult } from './live-patch.js';

  /**
   * Everything the client holds for ONE scope: the index (always whole), the chunk details that have arrived, and the tray pages. Pure state plus a
   * version counter for `useSyncExternalStore`; no timers, no network, no clock (D-W4-6: `today` arrives with every index and from `setToday`).
   * Stale-while-revalidate: `applyIndex` replaces entries but KEEPS the details already held, so rows glide and titles do not flash.
   */
  export class ScopeCache {
    private listeners = new Set<() => void>();
    private version_ = 0;
    private index: TimelineIndexResponse | null = null;
    private details = new Map<string, TimelineDetail>();
    private resident = new Set<string>();
    private tray: TimelineTrayItem[] = [];
    private trayNext: string | null | undefined = undefined; // undefined: no page fetched yet
    private stale_ = false;

    subscribe = (cb: () => void): (() => void) => { this.listeners.add(cb); return () => this.listeners.delete(cb); };
    version = (): number => this.version_;
    private bump(): void { this.version_ += 1; for (const l of [...this.listeners]) l(); }

    get today(): string { return this.index?.today ?? ''; }
    /** The stream head per workspace the held index is consistent with; `null` before the first answer (D-W4-23). Kept across `applyEvent` patches: they are newer than `asOf`, so the gate must not move. */
    get asOf(): Readonly<Record<string, number>> | null { return this.index?.asOf ?? null; }
    get items(): readonly TimelineEntry[] { return this.index?.items ?? []; }
    get flows(): readonly TimelineFlow[] { return this.index?.flows ?? []; }
    get truncated(): TimelineIndexResponse['truncated'] { return this.index?.truncated ?? null; }
    get trayCount(): number { return this.index?.tray.count ?? 0; }
    get trayItems(): readonly TimelineTrayItem[] { return this.tray; }
    get hasMoreTray(): boolean { return this.trayNext === undefined || this.trayNext !== null; }
    get isStale(): boolean { return this.stale_; }
    detail(id: string): TimelineDetail | undefined { return this.details.get(id); }

    applyIndex(resp: TimelineIndexResponse): void {
      const ids = new Set(resp.items.map((e) => e.id));
      for (const id of [...this.details.keys()]) if (!ids.has(id)) this.details.delete(id); // a ticket that left the scope takes its detail with it
      this.index = resp;
      this.resident.clear(); // chunks are re-fetched lazily; their old details stay on screen until replaced
      this.tray = [];
      this.trayNext = undefined;
      this.stale_ = false;
      this.bump();
    }
    markStale(): void { if (!this.stale_) { this.stale_ = true; this.bump(); } }
    /** The 28-day windows in `windows` the cache does not hold. */
    missing(windows: readonly { from: string; to: string }[]): { from: string; to: string }[] { return windows.filter((w) => !this.resident.has(w.from)); }
    applyChunk(window: { from: string; to: string }, resp: TimelineChunkResponse, lastPage: boolean): void {
      for (const d of resp.items) this.details.set(d.id, d);
      if (lastPage) this.resident.add(window.from);
      this.bump();
    }
    applyTray(resp: TimelineTrayResponse): void {
      this.tray = [...this.tray, ...resp.items];
      this.trayNext = resp.nextCursor;
      this.bump();
    }
    nextTrayCursor(): string | undefined { return this.tray.length === 0 ? undefined : this.tray[this.tray.length - 1]?.id; }

    /** A live event. Returns what happened so the caller can schedule a refetch on `stale`. */
    applyEvent(ev: InputEvent): PatchResult {
      if (this.index === null) return 'ignored';
      const { next, result } = applyInputEvent({ items: [...this.index.items], flows: [...this.index.flows], details: this.details }, ev, this.index.today);
      if (result === 'patched') {
        this.index = { ...this.index, items: next.items, flows: next.flows };
        this.details = next.details;
        this.bump();
      } else if (result === 'stale') this.markStale();
      return result;
    }

    /** IST midnight (D-W4-6): extend every OPEN actual segment (a last actual segment of an active ticket that ended on the old day) to the new day, and ask for a refetch. */
    setToday(day: string): void {
      if (this.index === null || this.index.today === day) return;
      const old = this.index.today;
      const items = this.index.items.map((e) => {
        if (e.category !== 'active') return e;
        const lastActual = [...e.segments].reverse().find((s) => s.type === 'actual');
        if (lastActual === undefined || lastActual.end !== old) return e;
        return { ...e, segments: e.segments.map((s) => (s === lastActual ? { ...s, end: day } : s)) };
      });
      this.index = { ...this.index, today: day, items };
      this.stale_ = true;
      this.bump();
    }
  }
  ```
  `scope-cache.test.ts`: stale-while-revalidate keeps details across `applyIndex`; `missing` honours `resident`; `applyChunk(..., false)` (a middle page) does not mark resident; `setToday` extends an open segment and not a closed one (control) and sets stale; `applyEvent` notifies subscribers once. Write each as an `it` under id `29.311`'s sibling? They belong to 29.310's cache half: name them `29.310 ScopeCache …`.

- [ ] **Step 4: The feed, the hook, per-workspace subscription, debounced refetch (2  `scope-feed.ts` (D-W4-23; T7's `useHomeSummary` calls it too):
  ```ts
  import type { ClientStreamFrame, DataSource, Unsubscribe } from '../data-source.js';

  export type ScopeFeed = {
    stop: Unsubscribe;
    /**
     * Call once with the `asOf` of an answer that just landed. True when a frame NEWER than it arrived before any answer was held
     * (so the answer may be missing it): the caller schedules one refetch. Consumes what it counted.
     */
    missedSince(asOf: Readonly<Record<string, number>>): boolean;
  };

  /**
   * One subscription per workspace of the scope (Review Focus 1). It never waits for `caught-up`: rooms are shared per workspace, and a later
   * subscriber to an existing room gets no replay and no `caught-up` (`online/stream.ts:455-468`). Instead each event is judged against `getAsOf()`,
   * the stream head the held data is consistent with: at or below it the data already contains it (a cursor-0 replay, a duplicate), above it is news.
   * `purge`, `refresh`, `scope-revoked` and `reach-granted` carry no sequence; they are news whenever data is held.
   * Before any answer is held nothing is delivered; the newest sequence per workspace is remembered for `missedSince`.
   */
  export function subscribeScope(
    source: Pick<DataSource, 'subscribe'>,
    workspaceIds: readonly string[],
    getAsOf: () => Readonly<Record<string, number>> | null,
    onFrame: (frame: ClientStreamFrame, workspaceId: string) => void,
  ): ScopeFeed {
    const seen = new Map<string, number>();
    const stops = workspaceIds.map((ws) =>
      source.subscribe(ws, 0, (frame) => {
        const isEvent = frame.type === 'event';
        const news = isEvent || frame.type === 'purge' || frame.type === 'refresh' || frame.type === 'scope-revoked' || frame.type === 'reach-granted';
        if (!news) return; // caught-up, error
        const seq = isEvent ? frame.envelope.workspaceSeq : Number.POSITIVE_INFINITY;
        const asOf = getAsOf();
        if (asOf === null) { seen.set(ws, Math.max(seen.get(ws) ?? 0, seq)); return; }
        const head = asOf[ws];
        if (head === undefined) return; // a workspace the answer does not cover (unreadable): nothing of it is drawn
        if (seq <= head) return;
        onFrame(frame, ws);
      }),
    );
    return {
      stop: () => { for (const stop of stops) stop(); },
      missedSince(asOf) {
        let missed = false;
        for (const [ws, seq] of seen) { const head = asOf[ws]; if (head !== undefined && seq > head) missed = true; }
        seen.clear();
        return missed;
      },
    };
  }
  ```
  `scope-feed.test.ts` (pure; a fake `subscribe` that records callbacks): an event at `asOf` is dropped and one above it is delivered, per workspace, with workspace B's own head (control: A's head does not gate B); with `getAsOf` returning `null` nothing is delivered and `missedSince({B: 5})` is true after an event with `workspaceSeq: 6` and false after one with `5` (and a second call returns false: consumed); a `purge` before any answer makes `missedSince` true; a `caught-up` frame is ignored in every state; a workspace absent from `asOf` is ignored. Name them `29.310 subscribeScope …`.

9.310)**

  `use-timeline-scope.ts`:
  ```ts
  import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore, useState } from 'react';
  import type { DataSource } from '../data-source.js';
  import { chunkStart, addDays } from './days.js';
  import { ScopeCache } from './scope-cache.js';
  import { subscribeScope, type ScopeFeed } from './scope-feed.js';
  import { scopeKey, type ScopeArg } from './scope.js';

  export type ScopeStatus = 'loading' | 'ready' | 'empty' | 'error';
  export type UseTimelineScope = { status: ScopeStatus; error: string | null; cache: ScopeCache; version: number; reload: () => void; loadWindow: (from: string, to: string) => void; loadMoreTray: () => void };

  /**
   * ONE subscription per workspace in the scope (Review Focus 1: `useLiveQuery` subscribes a single `workspaceId`), gated by the index's `asOf`
   * (`subscribeScope`, D-W4-23). `patch` events are applied to the cache at once; `stale` ones schedule ONE refetch `debounceMs` later, however many arrive.
   */
  export function useTimelineScope(source: DataSource, scope: ScopeArg, opts: { debounceMs?: number } = {}): UseTimelineScope {
    const debounceMs = opts.debounceMs ?? 400;
    const key = scopeKey(scope);
    const cache = useMemo(() => new ScopeCache(), [key]); // eslint-disable-line react-hooks/exhaustive-deps
    const scopeRef = useRef(scope);
    scopeRef.current = scope;
    const [status, setStatus] = useState<ScopeStatus>('loading');
    const [error, setError] = useState<string | null>(null);
    const issued = useRef(0);
    const version = useSyncExternalStore(cache.subscribe, cache.version, cache.version);

    const feed = useRef<ScopeFeed | null>(null);
    const scheduleRef = useRef<() => void>(() => undefined);

    const reload = useCallback(() => {
      const mine = (issued.current += 1);
      source.query.getTimelineIndex(scopeRef.current).then(
        (resp) => {
          if (mine !== issued.current) return; // an older answer never overwrites a newer one (useLiveQuery's issue order)
          if (resp === null) { setStatus('empty'); setError(null); return; }
          cache.applyIndex(resp);
          setStatus('ready');
          setError(null);
          if (feed.current?.missedSince(resp.asOf) === true) scheduleRef.current(); // news arrived before this answer and is newer than it
        },
        (cause: unknown) => {
          if (mine !== issued.current) return;
          setError(cause instanceof Error ? cause.message : String(cause));
          setStatus('error'); // whatever is drawn stays (HM-7)
        },
      );
    }, [source, cache]);

    // The subscription is opened BEFORE the first read is issued, so an event committed between the server's `asOf` cut and our join is still seen.
    useEffect(() => {
      let timer: ReturnType<typeof setTimeout> | null = null;
      const schedule = (): void => {
        if (timer !== null) return; // ONE refetch per window, however many events arrive inside it
        timer = setTimeout(() => { timer = null; reload(); }, debounceMs);
      };
      scheduleRef.current = schedule;
      const f = subscribeScope(source, scope.workspaceIds, () => cache.asOf, (frame) => {
        if (frame.type !== 'event') { cache.markStale(); schedule(); return; }
        const e = frame.envelope;
        const result = cache.applyEvent({ type: e.type, entityId: e.entity.id, payload: e.payload as Record<string, unknown> });
        if (result === 'stale') schedule();
      });
      feed.current = f;
      return () => { if (timer !== null) clearTimeout(timer); f.stop(); feed.current = null; scheduleRef.current = () => undefined; };
    }, [source, cache, key, reload, debounceMs]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => { setStatus('loading'); setError(null); reload(); }, [key, reload]);

    const inFlight = useRef(new Set<string>());
    const loadWindow = useCallback((from: string, to: string) => {
      const windows: { from: string; to: string }[] = [];
      for (let s = chunkStart(from); s <= to; s = addDays(s, 28)) windows.push({ from: s, to: addDays(s, 27) });
      for (const w of cache.missing(windows)) {
        const k = `${w.from}`;
        if (inFlight.current.has(k)) continue;
        inFlight.current.add(k);
        const page = (cursor?: string): void => {
          source.query.getTimelineChunk(scopeRef.current, w, cursor).then((resp) => {
            if (resp === null) { inFlight.current.delete(k); return; }
            const last = resp.nextCursor === null;
            cache.applyChunk(w, resp, last);
            if (last) inFlight.current.delete(k); else page(resp.nextCursor ?? undefined);
          }, () => { inFlight.current.delete(k); });
        };
        page();
      }
    }, [source, cache]);

    const loadMoreTray = useCallback(() => {
      if (!cache.hasMoreTray) return;
      source.query.getTimelineTray(scopeRef.current, cache.nextTrayCursor()).then((r) => { if (r !== null) cache.applyTray(r); }, () => undefined);
    }, [source, cache]);

    return { status, error, cache, version, reload, loadWindow, loadMoreTray };
  }
  ```
  (`addDays`'s string comparison `s <= to` is valid for `YYYY-MM-DD`. The planner `bridge.planRange` chooses `from`/`to` for Home in T7; a sheet needs no window.)

  `use-timeline-scope.test.tsx` (jsdom, fake timers, a fake `DataSource` whose `subscribe` records callbacks per workspace and whose `getTimelineIndex` counts calls and returns an index with a flow `A → B` in workspace `W2`):
  ```tsx
  // @vitest-environment jsdom
  import { act, renderHook } from '@testing-library/react';
  import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
  // … fake source: subs: Map<ws, cb>; index(): TimelineIndexResponse with asOf {W1: 3, W2: 9}, items for ws 'W1' (singleton S) and flow A→B in 'W2'; getTimelineIndex = vi.fn(async () => index())
  const frame = (ws: string, workspaceSeq: number, type: string, entityId: string, payload: Record<string, unknown>) =>
    ({ type: 'event', envelope: { type, workspaceId: ws, workspaceSeq, entity: { id: entityId }, payload } });
  describe('29.310 useTimelineScope', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());
    it('29.310 events in the SECOND workspace: at or below asOf nothing; above it patch with no request, one debounced refetch on stale; no caught-up is ever sent; control: the first workspace behaves the same', async () => {
      const { source, subs, getIndex } = fake();
      const { result } = renderHook(() => useTimelineScope(source, { workspaceIds: ['W1', 'W2'], projectIds: [], mine: false }));
      await act(async () => { await vi.advanceTimersByTimeAsync(0); });
      expect(result.current.status).toBe('ready');
      expect(getIndex).toHaveBeenCalledTimes(1);
      // at or below asOf (W2 = 9): a history replay or a late joiner's duplicate; the data already holds it
      act(() => { subs.get('W2')?.(frame('W2', 9, 'ticket.transitioned', 'A', {})); subs.get('W2')?.(frame('W2', 4, 'ticket.field_set', 'A', { fieldId: 'estimate', value: 9 })); });
      await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
      expect(getIndex).toHaveBeenCalledTimes(1);
      const before = result.current.cache.items.find((e) => e.id === 'B')?.segments[0]?.start;
      // above asOf: an estimate change on a member of W2's flow is patched, no request (and NO caught-up frame was ever delivered)
      act(() => { subs.get('W2')?.(frame('W2', 10, 'ticket.field_set', 'A', { fieldId: 'estimate', value: 6 })); });
      expect(result.current.cache.items.find((e) => e.id === 'B')?.segments[0]?.start).not.toBe(before);
      expect(getIndex).toHaveBeenCalledTimes(1);
      // two state events inside the window: ONE refetch, 400 ms after the first
      act(() => { subs.get('W2')?.(frame('W2', 11, 'ticket.transitioned', 'A', {})); subs.get('W2')?.(frame('W2', 12, 'ticket.closed', 'B', {})); });
      await act(async () => { await vi.advanceTimersByTimeAsync(399); });
      expect(getIndex).toHaveBeenCalledTimes(1);
      await act(async () => { await vi.advanceTimersByTimeAsync(2); });
      expect(getIndex).toHaveBeenCalledTimes(2);
      // control: W1 (asOf 3) behaves the same, with its own head
      act(() => { subs.get('W1')?.(frame('W1', 3, 'ticket.transitioned', 'S', {})); }); // at its head: nothing
      await act(async () => { await vi.advanceTimersByTimeAsync(401); });
      expect(getIndex).toHaveBeenCalledTimes(2);
      act(() => { subs.get('W1')?.(frame('W1', 4, 'ticket.transitioned', 'S', {})); });
      await act(async () => { await vi.advanceTimersByTimeAsync(401); });
      expect(getIndex).toHaveBeenCalledTimes(3);
    });

    it('29.310 events that arrive BEFORE the first answer: newer than its asOf cause exactly one refetch after it, older cause none', async () => {
      const gate = deferred<TimelineIndexResponse>(); // the first getTimelineIndex waits on it
      const { source, subs, getIndex } = fake({ firstAnswer: gate.promise });
      renderHook(() => useTimelineScope(source, { workspaceIds: ['W1', 'W2'], projectIds: [], mine: false }));
      act(() => { subs.get('W2')?.(frame('W2', 8, 'ticket.transitioned', 'A', {})); subs.get('W2')?.(frame('W2', 10, 'ticket.transitioned', 'A', {})); });
      await act(async () => { gate.resolve(indexWithAsOf({ W1: 3, W2: 9 })); await vi.advanceTimersByTimeAsync(401); });
      expect(getIndex).toHaveBeenCalledTimes(2); // seq 10 > 9
      // control: the same early event at or below asOf asks for nothing
      const g2 = deferred<TimelineIndexResponse>();
      const second = fake({ firstAnswer: g2.promise });
      renderHook(() => useTimelineScope(second.source, { workspaceIds: ['W1', 'W2'], projectIds: [], mine: false }));
      act(() => { second.subs.get('W2')?.(frame('W2', 8, 'ticket.transitioned', 'A', {})); });
      await act(async () => { g2.resolve(indexWithAsOf({ W1: 3, W2: 9 })); await vi.advanceTimersByTimeAsync(1_000); });
      expect(second.getIndex).toHaveBeenCalledTimes(1);
    });
  });
  ```
  Write `fake({ firstAnswer? })`, `deferred<T>()` and `indexWithAsOf(asOf)` in full in the test (a `DataSource`-shaped object cast `as unknown as DataSource` with only `query.getTimelineIndex/Chunk/Tray` and `subscribe`; `subscribe(ws, _after, cb)` stores `cb` and returns an unsubscribe; `firstAnswer`, when given, is what the FIRST `getTimelineIndex` call returns; the index builder returns the `entry` shape of `live-patch.test.ts` plus `asOf`). Flip 29.310 after both the cache half and this pass. Commit.

- [ ] **Step 5: A workspace that stops being readable (29.312)**

  Case line:
  - `- ❌ **29.312 — a workspace that becomes unreadable mid-session is dropped without an error (Review Focus 3):** after a refetch whose answer has no item of workspace B the cache holds none of B's ids and status stays `ready` with no error; a refetch answering `null` (nothing readable) sets status `empty`, leaves no error, and keeps the last drawn data out of `items` only after the cache is cleared by the caller (the hook exposes `empty`, the screen decides); a `scope-revoked` frame marks the cache stale and refetches once; control: a thrown read is status `error` with the previous items still held. Mutation: treat `null` as an error → the empty assertion reds.`

  Tests extend `use-timeline-scope.test.tsx`: first index has B items; second answer omits them → `cache.items` has no B id and `status === 'ready'` and `error === null`; third answer `null` → `status === 'empty'`; a `scope-revoked` frame after the first answer → `getIndex` called once more after 400 ms; `mockRejectedValueOnce(new Error('boom'))` → `status === 'error'` and `cache.items` unchanged. In the hook, `empty` leaves the cache as is; the screens render the empty state by `status`, so nothing half-drawn can show (T7's 29.347 pins the screen).

  Commit.

- [ ] **Step 6: Today at IST midnight, the clock-free root (29.311)**

  Case line:
  - `- ❌ **29.311 — `useIstToday` returns the IST day and changes it at IST midnight:** at 18:29:59Z it reads the current day, one second later the next; a re-render without midnight keeps the same string; the timer is cleared on unmount; `timeline-graph` is a clock-free root and the scan (`CLOCK_FREE_ROOTS`) finds no clock read under it; control: the same scan fails on a probe file that calls `Date.now()` (the scan can fail).`

  `apps/web/src/use-ist-today.ts`:
  ```ts
  'use client';
  import { useEffect, useState } from 'react';
  import { istDayBounds, istDayOf } from '@gisik-nokma/domain';

  /**
   * The IST day, injected into every timeline surface (the timeline code reads no clock; this hook is where the clock is read), and re-rendered at
   * IST midnight so the today line moves and open bars grow without a reload (D-W4-6).
   */
  export function useIstToday(): string {
    const [day, setDay] = useState(() => istDayOf(new Date().toISOString()));
    useEffect(() => {
      let timer: ReturnType<typeof setTimeout>;
      const arm = (): void => {
        const now = new Date();
        const endsAt = Date.parse(istDayBounds(istDayOf(now.toISOString())).endUtc);
        timer = setTimeout(() => { setDay(istDayOf(new Date().toISOString())); arm(); }, Math.max(1_000, endsAt - now.getTime() + 50));
      };
      arm();
      return () => clearTimeout(timer);
    }, []);
    return day;
  }
  ```
  Test (`vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-03T18:29:59Z'))` renders `'2026-10-03'`; `advanceTimersByTime(2_000)` → `'2026-10-04'`; `unmount` leaves `vi.getTimerCount() === 0`). Add `'timeline-graph'` to `CLOCK_FREE_ROOTS` and run the clock-free test: PASS; add the probe control the way the file's own control does (read `clock-scan.test.ts`). Commit.

- [ ] **Step 7: Neighbours, mutations, Features, DONE**

  Run WHOLE: `packages/app-core` (all), `apps/server/test/integration/*.test.ts`, `apps/web` suite (after a build). Mutations: (1) unsorted ids in `scopeQuery` → 29.308; (2) `ticket.transitioned` as `patch` → 29.309; (3) subscribe only `workspaceIds[0]` → 29.310; (4) `null` as error → 29.312; (5) gate on `caught-up` instead of `asOf`, or compare `workspaceSeq >= asOf` → 29.310; (6) no timer clear → 29.311. Features bullet under `<!-- WTG4 bullet T4 -->`: *"Timeline client data (⚙️): `DataSource.query.getTimelineIndex / Chunk / Tray` and `getHomeSummary` (the replica refuses), a per-scope cache that patches plan inputs and refetches state changes, one subscription per workspace in the scope gated by the response's `asOf` stream cut, and the IST-midnight today. `packages/app-core/src/timeline-graph/`, `apps/web/src/use-ist-today.ts`."*

  Commit; DONE.

---
### Task 5: The sheet's Timeline view: scene builder, toolbar, legend, tray, phone (cases 29.313–29.326)

**Branch** `task/wtg4-sheet-timeline`. **UI task: invoke `frontend-design` in the lane prompt.** Depends on T4 (and on Part 3's Graph tab being on the branch).

**Files:**
- Create (all under `packages/app-core/src/timeline-graph/`):
  - `geometry.ts`, `labels.ts`, `model.ts`, `scene.ts`, `toolbar.tsx`, `legend.tsx`, `tray.tsx`, `timeline-graph.tsx`, `ticket-timeline.tsx`
  - tests under `packages/app-core/test/timeline-graph/`: `geometry`, `labels`, `model`, `scene`, `scene-real-router`, `tray`, `toolbar-legend`, `ticket-timeline`
  - `apps/web/e2e-stack/timeline-graph.spec.ts` (real geometry, primary dev stack)
- Modify:
  - `packages/app-core/src/timeline-graph/bridge.ts` (add `packLanes`, `edgePath`, `loopPath`, `scrollTo`, `TimelineAxisBar`)
  - `packages/app-core/src/views/ticket-sheet.tsx` (`timelineGraphSlot`)
  - `apps/web` ticket-sheet host (mounts the slot with `useIstToday()` and `useIsPhone()`)
  - (no change to `packages/ui/src/components/segmented-control.tsx`: Part 1 T9 owns `variant="radio"`, ruling P5; this task consumes it)
  - `packages/ui/src/ui.css` (`/* WTG4 T5 */`), `packages/ui/src/tokens.ts` + `packages/ui/test/tokens.test.ts` (only if Step 0 finds no suitable role)
  - `Features.md` §26 (`<!-- WTG4 bullet T5 -->`), `test-cases/29-workflow-timeline-graphs.md` (`<!-- WTG4 T5 -->`), `docs/manual.md` (the Timeline paragraph)

**Interfaces:**
- **Consumes:** T2's `Draw*` types, `DrawIndex`, `TimelinePainter`, `attachDriver`, `days.ts`; T4's `ScopeArg`, `useTimelineScope`; T1's `segmentsFor`; Part 2's `planFlow`, `analyzeFlow`, `edgeKey`, `FlowNode`; Part 3's `FlowRead`, `DataSource.query.getFlow(workspaceId, ticketId)`, the Graph tab's inner switch and `TicketSheetProps.*GraphSlot`; Part 1's `pack`, `routeEdge`, `routeLoop`, the zoom switch and axis pieces (through `bridge.ts`).
- **Produces:**
  - `buildScene(input, pack, route): Scene` and the input types `SceneEntry`, `SceneEdge`, `SceneLane`, `SceneOptions`, `Packer`, `Router`;
  - `drawnSegments(entry, plannedVsActual)`, `keyAndPin(width, hasPin)`;
  - `fromFlowRead(flow, today): { entries; edges; tray }`; `readFlag / writeFlag`;
  - `COPY`, `linkChip`, `reachedSentence`, `pinText`, `barAria`;
  - `TimelineGraph` props `{ entries; edges; tray; today; orientation; selectedId; onSelect; onOpenField; emphasis?; lanes?; edgeScope?; originDay?; spanDays?; storageKey; className? }`;
  - `TicketTimeline` props `{ source; workspaceId; ticketId; today; orientation; selected; onSelect; onOpenField }`.

Siblings copied: Part 3's `FlowScene` wiring in the Workflow view for how a view reads `getFlow` through `useLiveQuery`; KG C T9's `knowledgeGraphSlot` for the sheet slot and the inner switch; `SegmentedControl` for the toolbar's classes.

- [ ] **Step 0: Pre-flight, the radio group, the token bindings**

  1. Cut the branch; build; `grep -n "GraphSlot" packages/app-core/src/views/ticket-sheet.tsx` and read the Graph tab's switch (`aria-label "Graph views"`); `grep -rn "export type FlowRead" packages` and write FlowRead's landed fields into the handoff; `grep -n "radiogroup" -r packages/ui/src packages/app-core/src apps/web/src` (D-W4-15).
  2. **The radio variant is Part 1 T9's (ruling P5, case 29.087).** The `radiogroup` grep above must find it in `packages/ui/src/components/segmented-control.tsx`; if it is absent, STOP with `NEEDS: Part 1 T9 (variant="radio")`. Do not add it here.
  3. **Token bindings.** `grep -n "TOKEN_ROLES" -A5 packages/ui/src/tokens.ts` and the `CONTRAST_PAIRS` helper in `packages/ui/test/tokens.test.ts`. The CSS below binds: done = `--gn-category-terminal` fill with `--gn-success-text`; active = `--gn-category-active` with `--gn-accent-text`; planned = `--gn-fill-quaternary` with a `--gn-border-strong` outline and `--gn-text`; the canvas is `--gn-surface`; the weekend tint is Part 1's `--gn-timeline-weekend`. Add to `tokens.test.ts` one `describe('29.319 …')` asserting, per theme and for each of hig / minimal / neo, fill vs canvas >= 3 and text vs fill >= 4.5 for these bindings, using the file's own contrast helper. If a binding misses, add a role (primitive + `themes` row in both themes + a `CONTRAST_PAIRS` row) rather than lowering a bar.
  4. Print `TICKET_SHEET`'s width rule for the Graph tab: `grep -n "1240" packages/app-core/src apps/web/src -r` (SH-2 is Part 3's; this task only relies on it).

- [ ] **Step 1: Geometry, labels, model: pure pieces, test first (29.314, 29.318, 29.322 copy, 29.324 copy)**

  Case lines under `<!-- WTG4 T5 -->` (all start ❌):
  - `- ❌ **29.313 — the sheet's Graph tab gains a Timeline view:** the inner switch lists `Timeline` exactly when `timelineGraphSlot` is mounted (and keeps its other options); selecting it renders the flow whole from ONE `getFlow` call and makes NO request to `/v1/timeline/*` (TG-8); the selected node is shared with the Workflow view (selecting a bar then switching back keeps it); control: without the slot the switch has no Timeline option. Mutation: always list the option → the control reds.`
  - `- ❌ **29.314 — x is the day:** a bar spans `[start, end + 1)` days at `ppd` px per day, so a one-day bar is `ppd` wide and a successor that starts the next day touches its predecessor; the today line is at today's x; the presets are Day 56, Week 24, Month 8 px/day within 4–96; zooming keeps the day under the anchor within 0.5 px for every pair of presets. Mutation: use `end` instead of `end + 1` → the width assertion reds.`
  - `- ❌ **29.315 — chaining shows:** a flow whose B is chained after A draws B's bar from the day after A's end; lengthening A's estimate by the live patch of T4 moves B by the same number of days and no other bar; control: a bar with explicit dates does not move.`
  - `- ❌ **29.316 — Planned vs actual follows the TG-3 table and never moves a row:** OFF: a not-started ticket shows its planned bar, a started one only its solid segment, a finished one one segment per period, a reopened one its periods plus the current pass's planned outline; ON adds every pass's planned outline; `rowOf` is identical OFF and ON; the setting is remembered per browser, and a throwing storage reads as OFF and writing does not throw. Mutation: pack from drawn segments instead of the union → the row-equality assertion reds.`
  - `- ❌ **29.317 — packing is Part 1's `pack` over the union of every non-ghost segment:** two overlapping tickets get different rows; a ticket's gap between periods can hold another ticket's bar on the same row; a Decision occupies its end day; control: non-overlapping tickets share a row. (Real `pack`, not a fake.)`
  - `- ❌ **29.318 — bar geometry:** a bar is 28 px tall; one 150 px or wider shows the title on a second line (11 px text, 12 px line height, ellipsised) and a narrower one the key only; a bar too narrow for its key shows the key after the bar and the packer is told `labelPx`; a draft shows `Draft` for the key with a dashed border; the accessible name contains the title. Mutation: long threshold 149 → the boundary assertion reds.`
  - `- ❌ **29.319 — status is never colour alone:** a done bar carries ✓ and the word Done in its accessible description, an open period ▶ and In progress, a not-started bar no mark and Not started; a diamond shows the same marks; fill and mark are >= 3:1 against the canvas and text >= 4.5:1 on its fill in light and dark for hig, minimal and neo (`tokens.test.ts`). Mutation: swap the marks → the mark assertion reds.`
  - `- ❌ **29.320 — edges:** an arrow leaves the source's last bar at its end anchor and enters the target's first bar at its start anchor, axis-aligned, through Part 1's router; both `leads_to` and `blocks` edges are drawn and counted in `N links`; an edge whose end has no bar is skipped and not counted; in the real-router fixtures no arrow crosses a third bar. Mutation: anchor at the bar's start for both ends → the anchor assertion reds.`
  - `- ❌ **29.321 — loops are curved return arrows:** a loop edge leaves the Decision's top and enters the target's start from above (portrait: left to top), labelled with the outcome and ` ↺ N` when passes took it; there is NO pill element and no `pill` in the draw list; a loop whose target has no bar is not drawn and its target is in the tray with the outcome named. Mutation: route a loop with `routeEdge` → the curve assertion reds.`
  - `- ❌ **29.322 — the tray:** heading `Not on the timeline yet`; each row has its reason as an action (`Add dates`, `Add an estimate`) that calls `onOpenField(ticketId, 'dates' | 'estimate')`; a ticket reached by a Decision's labelled outcome says `Reached when GN-151 Client decides chooses Needs rework`; a Decision with no visible title says `Reached when GN-151 chooses Needs rework`; the tray sits at the foot, outside the scrolling canvas; control: an unlabelled edge adds no sentence.`
  - `- ❌ **29.323 — phones:** time runs DOWN, rows become 112 px columns on a 120 px pitch, a bar's title wraps in up to 3 lines (ellipsis after) and the bar grows to fit the key and the lines; selecting a bar opens the bottom card; the toolbar's toggle, Today and zoom stay in one bar; the tray is a bottom disclosure. Mutation: 2 lines → the 3-line fixture reds.`
  - `- ❌ **29.324 — toolbar and legend copy are exact:** the toolbar has `Today`, the radio group named `Timeline zoom` with Day, Week, Month, the switch `Planned vs actual` (off by default) and the chip `N links` (`1 link`); the legend reads `Done (actual dates)`, `In progress (actual start)`, `Not started (planned dates)` and `Waits for all incoming` ONLY when a node has the switch on; NO element in the view has the accessible name Earlier, Later, Previous or Next; zoom changes `aria-checked` and the px per day. Mutation: always show the last legend entry → the control reds.`
  - `- ❌ **29.325 — the panel fills the space under its toolbar (measured, primary dev stack):** at a 1240 px wide sheet and at 390 x 844 the canvas is `height: 100%` of the space under the toolbar with a 320 px minimum, rows scroll inside it, the toolbar and the tray stay pinned, the page does not grow taller, and page `scrollY` is unchanged after a wheel pan and a touch pan. Quoted LOCAL with the measured numbers.`
  - `- ❌ **29.326 — live in the sheet:** an event that moves a flow member changes its bar after the debounced reload without losing the selection or the toggle; control: an event in another workspace changes nothing.`

  `geometry.ts` (+ test `geometry.test.ts` carrying 29.314 for the presets and anchor):
  ```ts
  export const BAR_H = 28;
  export const ROW_PITCH = 40;
  export const HEADING_H = 34;
  export const COL_W = 112;
  export const COL_PITCH = 120;
  export const LONG_BAR_PX = 150;
  export const KEY_PX = 64;
  export const PIN_PX = 14;
  export const KEY_INSIDE_MIN_PX = 64;
  export const PIN_INSIDE_MIN_PX = 82;
  export const DIAMOND = 28;
  export const LANE_GAP = 12;
  export const LOOP_PAD = 60;
  export const PPD_MIN = 4;
  export const PPD_MAX = 96;
  export const ZOOM = { day: 56, week: 24, month: 8 } as const;
  export type ZoomName = keyof typeof ZOOM;
  export const clampPpd = (n: number): number => Math.min(PPD_MAX, Math.max(PPD_MIN, n));
  export const zoomNameOf = (ppd: number): ZoomName | null => (Object.entries(ZOOM).find(([, v]) => v === ppd)?.[0] as ZoomName | undefined) ?? null;

  /** The scroll offset that keeps the day under `anchorPx` (a distance from the viewport's start) where it was when ppd changes. */
  export const anchorScroll = (scroll: number, anchorPx: number, oldPpd: number, newPpd: number): number => ((scroll + anchorPx) * newPpd) / oldPpd - anchorPx;

  /**
   * Where the key and the pin go on a bar `width` px wide (TG-11, PK-4). A bar too narrow for its key shows it after the bar; a pin that does not fit
   * inside the bar's end follows the key. `labelPx` is what packing must reserve to the right of the bar (the key, plus 14 px when the pin follows it).
   */
  export function keyAndPin(width: number, hasPin: boolean): { keyOutside: boolean; pinAt: 'inside' | 'after-key' | null; labelPx: number } {
    const keyOutside = width < (hasPin ? PIN_INSIDE_MIN_PX : KEY_INSIDE_MIN_PX);
    return { keyOutside, pinAt: hasPin ? (keyOutside ? 'after-key' : 'inside') : null, labelPx: keyOutside ? KEY_PX + (hasPin ? PIN_PX : 0) : 0 };
  }
  ```
  `geometry.test.ts`:
  ```ts
  import { describe, expect, it } from 'vitest';
  import { ZOOM, anchorScroll, clampPpd, keyAndPin, LONG_BAR_PX, PPD_MAX, PPD_MIN } from '../../src/timeline-graph/geometry.js';

  describe('29.314 zoom', () => {
    it('29.314 presets are inside 4..96 and the anchor drifts <= 0.5 px for every pair', () => {
      expect(Object.values(ZOOM)).toEqual([56, 24, 8]);
      expect([clampPpd(1), clampPpd(500)]).toEqual([PPD_MIN, PPD_MAX]);
      for (const a of Object.values(ZOOM)) for (const b of Object.values(ZOOM)) {
        for (const [scroll, anchor] of [[0, 300], [1234, 711], [98765, 40]] as const) {
          const dayAtAnchor = (scroll + anchor) / a;
          const next = anchorScroll(scroll, anchor, a, b);
          expect(Math.abs((next + anchor) / b - dayAtAnchor) * b).toBeLessThanOrEqual(0.5);
        }
      }
    });
  });
  describe('29.318 key and pin placement', () => {
    it('29.318 pin inside the end on a wide bar; after the key (+14 to labelPx) on a short one; 150 is long, 149 is not', () => {
      expect(keyAndPin(120, true)).toEqual({ keyOutside: false, pinAt: 'inside', labelPx: 0 });
      expect(keyAndPin(40, true)).toEqual({ keyOutside: true, pinAt: 'after-key', labelPx: 78 });
      expect(keyAndPin(40, false)).toEqual({ keyOutside: true, pinAt: null, labelPx: 64 });
      expect(keyAndPin(64, false).keyOutside).toBe(false); // control: the boundary
      expect(LONG_BAR_PX).toBe(150);
    });
  });
  ```
  `labels.ts` (the only place the copy lives; no spaced em dash):
  ```ts
  import type { TimelinePin, TimelineTrayItem } from '@gisik-nokma/domain';

  export const COPY = {
    today: 'Today', zoomLabel: 'Timeline zoom', day: 'Day', week: 'Week', month: 'Month', plannedVsActual: 'Planned vs actual',
    legendDone: 'Done (actual dates)', legendActive: 'In progress (actual start)', legendPlanned: 'Not started (planned dates)', legendWaitAll: 'Waits for all incoming',
    trayHeading: 'Not on the timeline yet', addDates: 'Add dates', addEstimate: 'Add an estimate',
    pruned: 'Pruned', ghost: 'pruned', revised: 'revised', notTaken: 'Not taken',
    legendNotTakenWorked: 'Not taken, after its work', legendNotTakenStub: 'Not taken, never started',
    empty: 'Nothing scheduled in these projects', error: "Couldn't load the timeline.", retry: 'Retry',
  } as const;

  export const linkChip = (n: number): string => (n === 1 ? '1 link' : `${n} links`);

  const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;
  /** "2 notes, 1 attachment"; empty when there is neither. */
  export function pinText(pin: TimelinePin | null): string {
    if (pin === null) return '';
    return [pin.notes > 0 ? plural(pin.notes, 'note', 'notes') : '', pin.attachments > 0 ? plural(pin.attachments, 'attachment', 'attachments') : ''].filter(Boolean).join(', ');
  }

  export const statusWord = (style: 'done' | 'active' | 'planned' | 'ghost'): string =>
    style === 'done' ? 'Done' : style === 'active' ? 'In progress' : style === 'planned' ? 'Not started' : 'Pruned';

  export function barAria(b: { key: string | null; title: string | null; draft: boolean; style: 'done' | 'active' | 'planned' | 'ghost'; pass: number; pin: TimelinePin | null; chip: string | null }): string {
    return [`${b.draft ? 'Draft' : (b.key ?? '')} ${b.title ?? ''}`.trim(), statusWord(b.style), b.pass > 1 ? `pass ${b.pass}` : '', pinText(b.pin), b.chip ?? ''].filter(Boolean).join(', ');
  }

  /** TG-6 / TG-12 (D-W4-13). The title is dropped only when the viewer cannot read the Decision's title (it is then null). */
  export function reachedSentence(r: NonNullable<TimelineTrayItem['reachedBy']>): string {
    const who = [r.decisionKey, r.decisionTitle === '' ? null : r.decisionTitle].filter((x): x is string => x !== null).join(' ');
    return `Reached when ${who} chooses ${r.outcome}`;
  }
  export const trayActionLabel = (reason: TimelineTrayItem['reason']): string => (reason === 'no-estimate' ? COPY.addEstimate : COPY.addDates);
  export const trayActionField = (reason: TimelineTrayItem['reason']): 'dates' | 'estimate' => (reason === 'no-estimate' ? 'estimate' : 'dates');
  ```
  `labels.test.ts` pins every `COPY` string exactly, `linkChip(1)`, `pinText` for (2,1), (1,0), (0,3), null; `reachedSentence` both forms; `trayAction*` for the three reasons; and a scan: `Object.values(COPY).every(s => !/\s—\s/.test(s))`. Run: FAIL then PASS.

  `model.ts`:
  ```ts
  import { istDayOf, segmentsFor, type TimelineTrayItem } from '@gisik-nokma/domain';
  import type { FlowRead } from '@gisik-nokma/domain'; // Step 0: the landed module of FlowRead
  import type { SceneEdge, SceneEntry } from './scene.js';

  type StorageLike = { getItem(k: string): string | null; setItem(k: string, v: string): void };
  const defaultStorage = (): StorageLike | null => {
    try { return globalThis.localStorage ?? null; } catch { return null; }
  };
  /** TG-3: remembered per browser; a blocked store (private window, site data off) gives `false` and a write that does nothing. */
  export function readFlag(key: string, storage: StorageLike | null = defaultStorage()): boolean {
    try { return storage?.getItem(key) === '1'; } catch { return false; }
  }
  export function writeFlag(key: string, value: boolean, storage: StorageLike | null = defaultStorage()): void {
    try { storage?.setItem(key, value ? '1' : '0'); } catch { /* blocked store: the setting lasts for this page only */ }
  }

  /**
   * The stub day of a never-started Not-taken node in the sheet view (D-W4-11). Part 3's `FlowNodeRead` carries no close time, so it is the day
   * the closing Decision's pass was chosen (its latest revision when revised): the settle that closed it ran then (PS-5). `null` when the Decision
   * is not in the viewer's flow, and then no stub is drawn (the index path uses the close itself).
   */
  export function notTakenDay(n: Pick<FlowRead['nodes'][number], 'resolution' | 'periods'>, byId: ReadonlyMap<string, FlowRead['nodes'][number]>): string | null {
    if (n.resolution === null || n.periods.length > 0) return null;
    const rec = byId.get(n.resolution.decisionTicketId)?.passes.find((p) => p.pass === n.resolution?.pass);
    if (rec === undefined) return null;
    const at = rec.revisions.length > 0 ? (rec.revisions[rec.revisions.length - 1] as { at: string }).at : rec.at;
    return istDayOf(at);
  }

  /** A sheet's flow as scene inputs. Periods and planned intervals arrive as IST days (Part 3); `segmentsFor` is the same function the index uses. */
  export function fromFlowRead(flow: FlowRead, today: string): { entries: SceneEntry[]; edges: SceneEdge[]; tray: TimelineTrayItem[] } {
    const byId = new Map(flow.nodes.map((n) => [n.id, n]));
    const entries: SceneEntry[] = [];
    const tray: TimelineTrayItem[] = [];
    for (const n of flow.nodes) {
      const segments = segmentsFor({ periods: n.periods, planned: n.planned, notTaken: n.resolution, closedDay: notTakenDay(n, byId), today }); // Part 3's wire name is `resolution`
      if (segments.length > 0) {
        entries.push({
          id: n.id, key: n.key, title: n.title, draft: n.draft, kind: n.kind, lane: 'flow', segments,
          pin: n.pin ?? { notes: 0, attachments: 0 }, resolution: n.resolution, category: n.state.category, flowId: flow.flowId, waitForAll: n.waitForAll,
        });
      } else if (n.tray !== null && n.resolution === null) {
        const via = flow.edges.filter((e) => e.to === n.id && e.label !== null && byId.get(e.from)?.kind === 'decision').sort((a, b) => (a.from < b.from ? -1 : 1))[0];
        const d = via === undefined ? undefined : byId.get(via.from);
        tray.push({
          id: n.id, workspaceId: '', projectId: '', key: n.key, title: n.title, draft: n.draft, reason: n.tray,
          reachedBy: d === undefined || via === undefined ? null : { decisionTicketId: d.id, decisionKey: d.key, decisionTitle: d.title, outcome: via.label as string },
        });
      }
    }
    const edges: SceneEdge[] = flow.edges.map((e) => ({ from: e.from, to: e.to, kind: e.kind, label: e.label, loop: e.loop, taken: e.taken }));
    return { entries, edges, tray };
  }
  ```
  `model.test.ts`: `readFlag` reads `'1'`, throws → `false` and `writeFlag` does not throw (29.316), `fromFlowRead` on a fixture of a diamond (Decision → Yes / No) with one undated ticket: entries for dated nodes, the undated one in `tray` with `reachedBy` naming the Decision and outcome (29.322), a draft node has `key: null` (29.318). Commit.

- [ ] **Step 2: The scene builder, test first (29.314–29.321, 29.323)**

  `scene.ts`:
  ```ts
  import type { StateCategory, TimelinePin, TimelineResolution, TimelineSegment } from '@gisik-nokma/domain';
  import { addDays, dayNumber } from './days.js';
  import type { Bounds, BarStyle, Draw, DrawBar, DrawDiamond, DrawEdge } from './draw-types.js';
  import { BAR_H, COL_PITCH, COL_W, DIAMOND, HEADING_H, LANE_GAP, LONG_BAR_PX, LOOP_PAD, ROW_PITCH, keyAndPin } from './geometry.js';
  import { barAria, pinText } from './labels.js';

  export type SceneEntry = {
    id: string; key: string | null; title: string | null; draft: boolean; kind: 'ticket' | 'decision'; lane: string;
    segments: readonly TimelineSegment[]; pin: TimelinePin; resolution: TimelineResolution; category: StateCategory; flowId: string | null;
    waitForAll?: boolean;
  };
  export type SceneEdge = { from: string; to: string; kind: 'leads_to' | 'blocks'; label: string | null; loop: boolean; taken: boolean | null; passes?: number };
  export type SceneLane = { id: string; heading: string | null };
  export type SceneOptions = {
    today: string; originDay: string; spanDays: number; ppd: number; orientation: 'landscape' | 'portrait'; plannedVsActual: boolean;
    lanes: readonly SceneLane[]; selectedId: string | null;
    /** `all` (the sheet), only the edges of one flow (Home, HM-4), or none. */
    edges: 'all' | 'none' | { flowId: string };
    /** Ticket ids that stay at full strength; everything else is `dim`. `null`: nothing dims. */
    lit: ReadonlySet<string> | null;
  };
  export type PackItem = { id: string; lane: string; spans: { start: number; end: number }[]; labelPx: number };
  export type Packer = (items: PackItem[], o: { ppd: number }) => { rowOf: Map<string, number>; rowCount: Map<string, number> };
  export type Router = {
    edge(from: Bounds, to: Bounds, orientation: 'landscape' | 'portrait'): { d: string; label: { x: number; y: number } };
    loop(from: Bounds, to: Bounds, orientation: 'landscape' | 'portrait'): { d: string; label: { x: number; y: number } };
  };
  export type Scene = {
    draws: Draw[]; width: number; height: number; rowOf: Map<string, number>;
    laneExtent: Map<string, { start: number; size: number }>; todayPx: number; linkCount: number;
    /** The bar (or diamond) an edge anchors on, by ticket id. */
    anchors: Map<string, { first: Bounds; last: Bounds }>;
  };

  /** TG-3: the segments drawn for this setting. A planned segment shows when the toggle is ON or its pass has no actual period yet. */
  export function drawnSegments(e: Pick<SceneEntry, 'segments'>, plannedVsActual: boolean): TimelineSegment[] {
    const worked = new Set(e.segments.filter((s) => s.type === 'actual').map((s) => s.pass));
    return e.segments.filter((s) => s.type === 'actual' || (s.type === 'planned' && (plannedVsActual || !worked.has(s.pass))));
  }

  const dayX = (day: string, o: Pick<SceneOptions, 'originDay' | 'ppd'>): number => (dayNumber(day) - dayNumber(o.originDay)) * o.ppd;
  const isWeekend = (n: number): boolean => (n + 3) % 7 >= 5; // 1970-01-01 was a Thursday: Monday is 0, Saturday 5, Sunday 6

  /** PK-3: the packing footprint is the UNION of every non-ghost segment, so the toggle never changes a row. */
  function packItems(entries: readonly SceneEntry[], o: SceneOptions): PackItem[] {
    return entries.filter((e) => e.segments.some((s) => s.type !== 'ghost')).map((e) => {
      const spans = e.segments.filter((s) => s.type !== 'ghost').map((s) => ({ start: dayNumber(s.start), end: dayNumber(s.end) }));
      const widest = Math.max(...spans.map((s) => (s.end - s.start + 1) * o.ppd));
      return { id: e.id, lane: e.lane, spans, labelPx: keyAndPin(widest, e.pin.notes + e.pin.attachments > 0).labelPx };
    });
  }

  const titleLines = (title: string | null): number => Math.min(3, Math.max(1, Math.ceil(((title ?? '').length * 6) / (COL_W - 12))));

  export function buildScene(entries: readonly SceneEntry[], edges: readonly SceneEdge[], o: SceneOptions, pack: Packer, route: Router): Scene {
    const portrait = o.orientation === 'portrait';
    const packed = pack(packItems(entries, o), { ppd: o.ppd });
    const anyHeading = o.lanes.some((l) => l.heading !== null);
    const uPad = portrait && anyHeading ? HEADING_H : 0;

    // Lanes: stacked rows (landscape) or side-by-side columns (portrait, PK-7).
    const laneExtent = new Map<string, { start: number; size: number }>();
    let cursor = 0;
    for (const l of o.lanes) {
      const rows = packed.rowCount.get(l.id) ?? 0;
      const size = portrait ? Math.max(1, rows) * COL_PITCH : (l.heading === null ? 0 : HEADING_H) + Math.max(1, rows) * ROW_PITCH;
      laneExtent.set(l.id, { start: cursor, size });
      cursor += size + LANE_GAP;
    }
    const span = o.spanDays * o.ppd;
    const width = portrait ? cursor : span;
    const height = portrait ? span + uPad : cursor;

    const place = (u0: number, u1: number, v: number, thick: number): Bounds =>
      portrait
        ? { x0: v, x1: v + COL_W, y0: u0 + uPad, y1: u0 + uPad + Math.max(u1 - u0, thick) }
        : { x0: u0, x1: u0 + Math.max(u1 - u0, 1), y0: v, y1: v + thick };
    const vOf = (laneId: string, row: number): number => {
      const ext = laneExtent.get(laneId) ?? { start: 0, size: 0 };
      const lane = o.lanes.find((l) => l.id === laneId);
      return portrait ? ext.start + row * COL_PITCH : ext.start + (lane?.heading === null || lane === undefined ? 0 : HEADING_H) + row * ROW_PITCH;
    };

    const draws: Draw[] = [];
    // Weekend tint at 16 px/day and above (VP-11), then headings, today.
    if (o.ppd >= 16) {
      for (let i = 0; i < o.spanDays; i++) {
        if (isWeekend(dayNumber(o.originDay) + i)) {
          const b = portrait ? { x0: 0, x1: width, y0: i * o.ppd + uPad, y1: (i + 1) * o.ppd + uPad } : { x0: i * o.ppd, x1: (i + 1) * o.ppd, y0: 0, y1: height };
          draws.push({ kind: 'weekend', id: `we${i}`, z: 0, b });
        }
      }
    }
    for (const l of o.lanes) {
      if (l.heading === null) continue;
      const ext = laneExtent.get(l.id) as { start: number; size: number };
      draws.push({
        kind: 'heading', id: `h:${l.id}`, z: 1, sticky: true, text: l.heading,
        b: portrait ? { x0: ext.start, x1: ext.start + ext.size, y0: 0, y1: HEADING_H } : { x0: 0, x1: width, y0: ext.start, y1: ext.start + HEADING_H },
      });
    }
    const todayPx = dayX(o.today, o);
    draws.push({
      kind: 'today', id: 'today', z: 4, text: 'Today',
      b: portrait ? { x0: 0, x1: width, y0: todayPx + uPad, y1: todayPx + uPad + 2 } : { x0: todayPx, x1: todayPx + 2, y0: 0, y1: height },
    });

    const anchors = new Map<string, { first: Bounds; last: Bounds }>();
    const dim = (id: string): boolean => o.lit !== null && !o.lit.has(id);
    for (const e of entries) {
      const row = packed.rowOf.get(e.id);
      if (row === undefined) continue;
      const v = vOf(e.lane, row);
      const segs = drawnSegments(e, o.plannedVsActual);
      const lastActualIdx = segs.map((s) => s.type).lastIndexOf('actual');
      const hasPin = e.pin.notes + e.pin.attachments > 0;
      const bounds: Bounds[] = [];
      segs.forEach((seg, i) => {
        const u0 = dayX(seg.start, o), u1 = dayX(addDays(seg.end, 1), o);
        const active = seg.type === 'actual' && i === lastActualIdx && e.category === 'active' && seg.end >= o.today;
        const style: BarStyle = seg.type === 'planned' ? 'planned' : active ? 'active' : 'done';
        const mark = seg.type === 'planned' ? null : active ? 'active' : 'done';
        if (e.kind === 'decision') {
          if (i !== segs.length - 1) return; // one diamond, on the end day of the last drawn segment (T6 draws one per closed period)
          const centre = u1 - o.ppd / 2;
          let b = place(centre - DIAMOND / 2, centre + DIAMOND / 2, v + (BAR_H - DIAMOND) / 2, DIAMOND);
          if (portrait) b = { x0: b.x0 + (COL_W - DIAMOND) / 2, x1: b.x0 + (COL_W - DIAMOND) / 2 + DIAMOND, y0: b.y0, y1: b.y0 + DIAMOND };
          const d: DrawDiamond = {
            kind: 'diamond', id: `${e.id}:d`, ticketId: e.id, z: 3, b, style, key: e.key, title: e.title ?? '', mark, revised: false,
            pin: hasPin ? e.pin : null, draft: e.draft, dim: dim(e.id), ariaLabel: barAria({ key: e.key, title: e.title, draft: e.draft, style, pass: seg.pass, pin: hasPin ? e.pin : null, chip: null }),
          };
          draws.push(d); bounds.push(b);
          return;
        }
        const thick = BAR_H;
        let b = place(u0, u1, v, thick);
        const widthPx = portrait ? COL_W : b.x1 - b.x0;
        const kp = keyAndPin(widthPx, hasPin);
        if (portrait) b = { ...b, y1: Math.max(b.y1, b.y0 + 16 + 12 * (1 + titleLines(e.title))) }; // grows to fit the key and up to 3 title lines
        const bar: DrawBar = {
          kind: 'bar', id: `${e.id}:${seg.type[0]}${seg.pass}:${i}`, ticketId: e.id, z: seg.type === 'planned' ? 2 : 3, b, style,
          key: e.key, title: e.title ?? '', long: portrait || widthPx >= LONG_BAR_PX, mark, passRank: 0, pass: seg.pass, pin: hasPin ? e.pin : null,
          chip: null, draft: e.draft, labelPx: kp.labelPx, keyOutside: portrait ? false : kp.keyOutside, pinAt: portrait && hasPin ? 'inside' : kp.pinAt,
          dim: dim(e.id), ariaLabel: barAria({ key: e.key, title: e.title, draft: e.draft, style, pass: seg.pass, pin: hasPin ? e.pin : null, chip: null }),
        };
        draws.push(bar); bounds.push(b);
      });
      if (bounds.length > 0) {
        // `first` is the earliest-starting bar (an arrow enters its start), `last` the latest-ending (an arrow leaves its end)
        const byStart = [...bounds].sort((a, b) => (portrait ? a.y0 - b.y0 : a.x0 - b.x0));
        const byEnd = [...bounds].sort((a, b) => (portrait ? a.y1 - b.y1 : a.x1 - b.x1));
        anchors.set(e.id, { first: byStart[0] as Bounds, last: byEnd[byEnd.length - 1] as Bounds });
      }
    }

    const flowOf = new Map(entries.map((e) => [e.id, e.flowId]));
    let linkCount = 0;
    if (o.edges !== 'none') {
      for (const ed of edges) {
        const from = anchors.get(ed.from), to = anchors.get(ed.to);
        if (from === undefined || to === undefined) continue;
        if (o.edges !== 'all' && (flowOf.get(ed.from) !== o.edges.flowId || flowOf.get(ed.to) !== o.edges.flowId)) continue;
        const r = ed.loop ? route.loop(from.last, to.first, o.orientation) : route.edge(from.last, to.first, o.orientation);
        const pad = ed.loop ? LOOP_PAD : 8;
        const b: Bounds = {
          x0: Math.min(from.last.x0, to.first.x0) - pad, x1: Math.max(from.last.x1, to.first.x1) + pad,
          y0: Math.min(from.last.y0, to.first.y0) - pad, y1: Math.max(from.last.y1, to.first.y1) + pad,
        };
        const text = ed.label === null ? null : `${ed.label}${ed.loop && (ed.passes ?? 0) > 1 ? ` ↺ ${ed.passes}` : ''}`;
        draws.push({
          kind: 'edge', id: `${ed.from}>${ed.to}:${ed.kind}`, z: 5, b, from: ed.from, to: ed.to, d: r.d, edgeKind: ed.kind, loop: ed.loop, taken: ed.taken,
          label: text === null ? null : { x: r.label.x, y: r.label.y, text }, dim: dim(ed.from) || dim(ed.to),
        });
        linkCount += 1;
      }
    }
    return { draws, width, height, rowOf: packed.rowOf, laneExtent, todayPx, linkCount, anchors };
  }

  /** The earliest day to draw from and how many days to span, for a set of entries (the sheet derives them; Home passes its own). */
  export function extentOf(entries: readonly SceneEntry[], today: string): { originDay: string; spanDays: number } {
    let lo = dayNumber(today), hi = dayNumber(today);
    for (const e of entries) for (const s of e.segments) { lo = Math.min(lo, dayNumber(s.start)); hi = Math.max(hi, dayNumber(s.end)); }
    const origin = addDays(today, lo - dayNumber(today) - 3);
    return { originDay: origin, spanDays: hi - lo + 12 };
  }
  ```
  Test helper `apps/…/test/timeline-graph/helpers/greedy.ts` (a deterministic fake packer for the pure cases; the real one runs in 29.317 and 29.320):
  ```ts
  import type { Packer } from '../../../src/timeline-graph/scene.js';
  export const greedy: Packer = (items) => {
    const rowOf = new Map<string, number>(); const rowCount = new Map<string, number>(); const ends = new Map<string, number[]>();
    for (const it of [...items].sort((a, b) => a.spans[0]!.start - b.spans[0]!.start || (a.id < b.id ? -1 : 1))) {
      const rows = ends.get(it.lane) ?? []; const start = it.spans[0]!.start; const end = Math.max(...it.spans.map((s) => s.end));
      let r = rows.findIndex((e) => e < start);
      if (r === -1) { r = rows.length; rows.push(end); } else rows[r] = end;
      ends.set(it.lane, rows); rowOf.set(it.id, r); rowCount.set(it.lane, rows.length);
    }
    return { rowOf, rowCount };
  };
  export const straight = { edge: (f: any, t: any) => ({ d: `M${f.x1} ${(f.y0 + f.y1) / 2}H${t.x0}`, label: { x: (f.x1 + t.x0) / 2, y: f.y0 } }), loop: (f: any, t: any) => ({ d: `M${f.x0} ${f.y0}C${f.x0} ${f.y0 - 40} ${t.x0} ${t.y0 - 40} ${t.x0} ${t.y0}`, label: { x: (f.x0 + t.x0) / 2, y: f.y0 - 30 } }) };
  ```
  `scene.test.ts` (each case an `it` whose title starts with its id):
  ```ts
  import { describe, expect, it } from 'vitest';
  import { applyInputEvent } from '../../src/timeline-graph/live-patch.js';
  import { buildScene, drawnSegments, type SceneEntry, type SceneOptions } from '../../src/timeline-graph/scene.js';
  import { greedy, straight } from './helpers/greedy.js';

  const TODAY = '2026-10-03';
  const O: SceneOptions = { today: TODAY, originDay: '2026-09-28', spanDays: 60, ppd: 24, orientation: 'landscape', plannedVsActual: false, lanes: [{ id: 'flow', heading: null }], selectedId: null, edges: 'all', lit: null };
  const ent = (id: string, segs: [string, string, 'actual' | 'planned', number?][], over: Partial<SceneEntry> = {}): SceneEntry => ({
    id, key: `GN-${id}`, title: `Title ${id}`, draft: false, kind: 'ticket', lane: 'flow',
    segments: segs.map(([start, end, type, pass]) => ({ start, end, type, pass: pass ?? 1 })), pin: { notes: 0, attachments: 0 }, resolution: null, category: 'open', flowId: null, ...over,
  });
  const bar = (s: ReturnType<typeof buildScene>, id: string) => s.draws.find((d) => d.kind === 'bar' && d.ticketId === id);

  describe('29.314 x is the day', () => {
    it('29.314 inclusive end: a one-day bar is ppd wide; the next day touches; today line at today', () => {
      const s = buildScene([ent('A', [['2026-10-05', '2026-10-05', 'planned']]), ent('B', [['2026-10-06', '2026-10-07', 'planned']])], [], O, greedy, straight);
      const a = bar(s, 'A')!.b, b = bar(s, 'B')!.b;
      expect(a.x1 - a.x0).toBe(24);
      expect(b.x0).toBe(a.x1);
      expect(b.x1 - b.x0).toBe(48);
      expect(s.todayPx).toBe(5 * 24); // 28 Sep → 3 Oct
      expect(a.y1 - a.y0).toBe(28);
    });
  });
  describe('29.315 chaining shows', () => {
    it('29.315 lengthening A moves B by the same days and nothing else; control: an explicit bar stays', () => {
      const items = [ent('A', [['2026-10-05', '2026-10-06', 'planned']], { flowId: 'A' }), ent('B', [['2026-10-07', '2026-10-08', 'planned']], { flowId: 'A' }), ent('X', [['2026-10-12', '2026-10-13', 'planned']])];
      const flow = { id: 'A', workspaceId: 'W', truncated: false, edges: [{ from: 'A', to: 'B', kind: 'leads_to' as const, label: null }],
        nodes: ['A', 'B'].map((id) => ({ id, typeId: 'task', stateId: 'todo', category: 'open' as const, closed: false, trashed: false, draft: false, parentId: null, isDecision: false, outcome: null, passes: [], notTaken: null, waitForAll: false, started: false, rounds: 1, periods: [], explicitStart: id === 'A' ? '2026-10-05' : null, explicitDue: null, estimate: 2, reworkEstimate: null, initialStateId: 'todo', firstTerminalStateId: 'done' })) }; // Part 2's FlowNode
      const before = buildScene(items, [], O, greedy, straight);
      const r = applyInputEvent({ items: items.map((e) => ({ ...e, workspaceId: 'W', lane: 'P' })) as never, flows: [flow], details: new Map() }, { type: 'ticket.field_set', entityId: 'A', payload: { fieldId: 'estimate', value: 5 } }, TODAY);
      const after = buildScene(r.next.items.map((e) => ({ ...(e as object), lane: 'flow', title: 'T' })) as never, [], O, greedy, straight);
      expect(bar(after, 'B')!.b.x0 - bar(before, 'B')!.b.x0).toBe(3 * 24);
      expect(bar(after, 'X')!.b.x0).toBe(bar(before, 'X')!.b.x0);
    });
  });
  describe('29.316 Planned vs actual', () => {
    const worked = ent('W', [['2026-10-01', '2026-10-02', 'actual'], ['2026-10-05', '2026-10-06', 'planned']]);
    const reopened = ent('R', [['2026-09-29', '2026-09-30', 'actual', 1], ['2026-09-28', '2026-09-29', 'planned', 1], ['2026-10-05', '2026-10-06', 'planned', 2]]);
    it('29.316 OFF/ON follow the TG-3 table', () => {
      expect(drawnSegments(worked, false).map((s) => s.type)).toEqual(['actual']);
      expect(drawnSegments(worked, true).map((s) => s.type)).toEqual(['actual', 'planned']);
      expect(drawnSegments(reopened, false).map((s) => `${s.type}${s.pass}`)).toEqual(['actual1', 'planned2']);
      expect(drawnSegments(reopened, true)).toHaveLength(3);
      expect(drawnSegments(ent('N', [['2026-10-05', '2026-10-06', 'planned']]), false)).toHaveLength(1);
    });
    it('29.316 the toggle never moves a row', () => {
      const items = [worked, reopened, ent('Z', [['2026-10-01', '2026-10-10', 'planned']])];
      const off = buildScene(items, [], { ...O, plannedVsActual: false }, greedy, straight);
      const on = buildScene(items, [], { ...O, plannedVsActual: true }, greedy, straight);
      expect([...on.rowOf]).toEqual([...off.rowOf]);
    });
  });
  describe('29.318 / 29.319 geometry and marks', () => {
    it('29.318 long at 150 px, not at 149; a draft shows Draft; accessible name has the title', () => {
      const wide = buildScene([ent('L', [['2026-10-05', '2026-10-11', 'planned']])], [], { ...O, ppd: 24 }, greedy, straight); // 7 d × 24 = 168
      expect((bar(wide, 'L') as any).long).toBe(true);
      const w149 = buildScene([ent('S', [['2026-10-05', '2026-10-10', 'planned']])], [], { ...O, ppd: 24.8 }, greedy, straight); // 6 d × 24.8 = 148.8
      expect((bar(w149, 'S') as any).long).toBe(false);
      const d = bar(buildScene([ent('D', [['2026-10-05', '2026-10-07', 'planned']], { draft: true, key: null })], [], O, greedy, straight), 'D') as any;
      expect(d.draft).toBe(true);
      expect(d.ariaLabel).toContain('Draft');
      expect(d.ariaLabel).toContain('Title D');
    });
    it('29.319 done ✓, open period ▶, planned none; a diamond carries the same marks', () => {
      const s = buildScene([
        ent('A', [['2026-09-29', '2026-10-01', 'actual']], { category: 'terminal' }),
        ent('B', [['2026-10-01', TODAY, 'actual']], { category: 'active' }),
        ent('C', [['2026-10-06', '2026-10-07', 'planned']]),
        ent('D', [['2026-09-30', '2026-09-30', 'actual']], { kind: 'decision', category: 'terminal' }),
      ], [], O, greedy, straight);
      expect([bar(s, 'A'), bar(s, 'B'), bar(s, 'C')].map((b: any) => b.mark)).toEqual(['done', 'active', null]);
      expect((bar(s, 'B') as any).ariaLabel).toContain('In progress');
      expect((bar(s, 'A') as any).ariaLabel).toContain('Done');
      expect((bar(s, 'C') as any).ariaLabel).toContain('Not started');
      expect((s.draws.find((d) => d.kind === 'diamond') as any).mark).toBe('done');
    });
  });
  describe('29.320 / 29.321 edges and loops', () => {
    const a = ent('A', [['2026-10-05', '2026-10-06', 'planned']]), b = ent('B', [['2026-10-08', '2026-10-09', 'planned']]), dec = ent('D', [['2026-10-07', '2026-10-07', 'planned']], { kind: 'decision' });
    it('29.320 anchors, both kinds counted, an edge without a bar skipped', () => {
      const s = buildScene([a, b], [
        { from: 'A', to: 'B', kind: 'leads_to', label: null, loop: false, taken: null },
        { from: 'A', to: 'B', kind: 'blocks', label: null, loop: false, taken: null },
        { from: 'A', to: 'GHOST', kind: 'leads_to', label: null, loop: false, taken: null },
      ], O, greedy, straight);
      expect(s.linkCount).toBe(2);
      const e = s.draws.find((d) => d.kind === 'edge') as any;
      expect(e.d.startsWith(`M${bar(s, 'A')!.b.x1} `)).toBe(true); // leaves the source's END
      expect(e.d.endsWith(`H${bar(s, 'B')!.b.x0}`)).toBe(true);    // enters the target's START
    });
    it('29.321 a loop is routed by the loop router, labelled with the outcome and passes; no pill; no bar, no loop', () => {
      const s = buildScene([a, dec], [{ from: 'D', to: 'A', kind: 'leads_to', label: 'Needs rework', loop: true, taken: true, passes: 2 }], O, greedy, straight);
      const e = s.draws.find((d) => d.kind === 'edge') as any;
      expect(e.d).toContain('C');                       // a cubic, not the axis-aligned run
      expect(e.label.text).toBe('Needs rework ↺ 2');
      expect(s.draws.some((d) => (d.kind as string) === 'pill')).toBe(false);
      const none = buildScene([dec], [{ from: 'D', to: 'A', kind: 'leads_to', label: 'Needs rework', loop: true, taken: true }], O, greedy, straight);
      expect(none.linkCount).toBe(0);
    });
    it('29.320 Home scope: only the selected flow\'s edges; control: all', () => {
      const f = (id: string, flowId: string) => ent(id, [['2026-10-05', '2026-10-06', 'planned']], { flowId });
      const items = [f('A', 'F1'), f('B', 'F1'), f('C', 'F2'), f('D', 'F2')];
      const eds = [{ from: 'A', to: 'B', kind: 'leads_to' as const, label: null, loop: false, taken: null }, { from: 'C', to: 'D', kind: 'leads_to' as const, label: null, loop: false, taken: null }];
      expect(buildScene(items, eds, { ...O, edges: { flowId: 'F1' } }, greedy, straight).linkCount).toBe(1);
      expect(buildScene(items, eds, O, greedy, straight).linkCount).toBe(2);
    });
  });
  describe('29.323 phones', () => {
    it('29.323 portrait: 112 px columns, time down, bar grows to 3 title lines', () => {
      const long = ent('A', [['2026-10-05', '2026-10-05', 'planned']], { title: 'A very long ticket title that should wrap into three lines at most and then stop with an ellipsis here' });
      const s = buildScene([long, ent('B', [['2026-10-05', '2026-10-05', 'planned']])], [], { ...O, orientation: 'portrait' }, greedy, straight);
      const a = bar(s, 'A')!.b, b = bar(s, 'B')!.b;
      expect(a.x1 - a.x0).toBe(112);
      expect(b.x0 - a.x0).toBe(120);                        // second column, 120 px pitch
      expect(a.y0).toBe(7 * 24);                            // 28 Sep → 5 Oct, time runs down
      expect(a.y1 - a.y0).toBe(16 + 12 * 4);                // key + 3 lines (>= 28)
      expect(b.y1 - b.y0).toBeGreaterThanOrEqual(28);
    });
  });
  ```
  Also `scene-real-router.test.ts` (29.317, 29.320): uses `bridge.packLanes`, `bridge.edgePath` and `loopPath` (Part 1's real functions) on a fixture of 6 tickets: asserts different rows for overlapping tickets, the gap-sharing case (ticket P with segments `[10-01,10-02]` and `[10-09,10-10]` and ticket Q `[10-04,10-05]` on the same row), the Decision occupying only its end day, an `edgePath` that starts at the source's x1 and ends at the target's x0 and whose segments are axis-aligned (parse `d` into `M/H/V`), and no arrow crossing a third bar (rect-segment intersection over the fixture). Control: non-overlapping tickets share row 0.

  Run: `"$SR" wtg4-t5 -- pnpm --filter @gisik-nokma/app-core exec vitest run test/timeline-graph --maxWorkers=2 > /tmp/wtg4-t5.log 2>&1; tail -40 /tmp/wtg4-t5.log`. Expected FAIL then PASS. In `bridge.ts` add:
  ```ts
  import { pack, routeEdge, routeLoop } from '@gisik-nokma/viewport';
  import type { Packer, Router } from './scene.js';

  /** Part 1's packer behind this plan's `Packer` shape. Adjust the property names here if the landed `pack` differs. */
  export const packLanes: Packer = (items, o) => {
    const byLane = new Map<string, typeof items>();
    for (const it of items) byLane.set(it.lane, [...(byLane.get(it.lane) ?? []), it]);
    const rowOf = new Map<string, number>(); const rowCount = new Map<string, number>();
    for (const [lane, list] of byLane) {
      const r = pack(list.map((i) => ({ id: i.id, segments: i.spans, labelPx: i.labelPx })), { ppdPack: o.ppd });
      for (const [id, row] of r.rowOf) rowOf.set(id, row);
      rowCount.set(lane, r.rowCount);
    }
    return { rowOf, rowCount };
  };
  const anchor = (b: { x0: number; x1: number; y0: number; y1: number }) => ({ x0: b.x0, x1: b.x1, y0: b.y0, y1: b.y1 });
  export const router: Router = {
    edge: (from, to, orientation) => routeEdge(anchor(from), anchor(to), orientation),
    loop: (from, to, orientation) => routeLoop(anchor(from), anchor(to), orientation),
  };
  ```
  and flip 29.314–29.321 and 29.323 as their tests pass. Commit.

- [ ] **Step 3: Toolbar, legend, tray, the shell (29.322, 29.324, 29.316 persistence)**

  `toolbar.tsx`:
  ```tsx
  import type { ReactElement } from 'react';
  import { SegmentedControl } from '@gisik-nokma/ui';
  import { COPY, linkChip } from './labels.js';
  import { ZOOM, zoomNameOf, type ZoomName } from './geometry.js';

  export type TimelineToolbarProps = { ppd: number; onZoom: (name: ZoomName) => void; onToday: () => void; plannedVsActual: boolean; onTogglePlanned: (v: boolean) => void; linkCount: number };

  export function TimelineToolbar(p: TimelineToolbarProps): ReactElement {
    const name = zoomNameOf(p.ppd);
    return (
      <div className="gn-tlg-toolbar">
        <button type="button" className="gn-tlg-today-btn" onClick={p.onToday}>{COPY.today}</button>
        <SegmentedControl<ZoomName>
          variant="radio" aria-label={COPY.zoomLabel} value={name ?? 'week'} onChange={p.onZoom}
          options={[{ value: 'day', label: COPY.day }, { value: 'week', label: COPY.week }, { value: 'month', label: COPY.month }]}
        />
        <button type="button" role="switch" aria-checked={p.plannedVsActual} className="gn-tlg-switch" onClick={() => p.onTogglePlanned(!p.plannedVsActual)}>
          <span className="gn-tlg-switch-track" aria-hidden="true" />
          {COPY.plannedVsActual}
        </button>
        <span className="gn-tlg-links">{linkChip(p.linkCount)}</span>
      </div>
    );
  }
  export { ZOOM };
  ```
  `legend.tsx`:
  ```tsx
  import type { ReactElement } from 'react';
  import { COPY } from './labels.js';

  export function TimelineLegend({ waitsForAll }: { waitsForAll: boolean }): ReactElement {
    const rows: { style: 'done' | 'active' | 'planned' | 'wait'; mark: string; text: string }[] = [
      { style: 'done', mark: '✓', text: COPY.legendDone },
      { style: 'active', mark: '▶', text: COPY.legendActive },
      { style: 'planned', mark: '', text: COPY.legendPlanned },
      ...(waitsForAll ? [{ style: 'wait' as const, mark: '', text: COPY.legendWaitAll }] : []),
    ];
    return (
      <ul className="gn-tlg-legend" aria-label="Legend">
        {rows.map((r) => (
          <li key={r.style} data-style={r.style}><span className="gn-tlg-swatch" data-style={r.style} aria-hidden="true">{r.mark}</span>{r.text}</li>
        ))}
      </ul>
    );
  }
  ```
  `tray.tsx`:
  ```tsx
  import { useState, type ReactElement } from 'react';
  import type { TimelineTrayItem } from '@gisik-nokma/domain';
  import { COPY, reachedSentence, trayActionField, trayActionLabel } from './labels.js';

  export type TimelineTrayProps = { items: readonly TimelineTrayItem[]; total: number; onOpenField: (ticketId: string, field: 'dates' | 'estimate') => void; onMore?: () => void; disclosure?: boolean };

  /** TG-6: the foot of the graph, outside the scrolling canvas. On a phone it is a disclosure (TG-7). */
  export function TimelineTray(p: TimelineTrayProps): ReactElement | null {
    const [open, setOpen] = useState(!p.disclosure);
    if (p.total === 0 && p.items.length === 0) return null;
    const list = (
      <ul className="gn-tlg-tray-list">
        {p.items.map((t) => (
          <li key={t.id} className="gn-tlg-tray-row">
            <span className="gn-tlg-tray-key">{t.draft ? 'Draft' : (t.key ?? '')}</span>
            <span className="gn-tlg-tray-title">{t.title}</span>
            {t.reachedBy !== null && <span className="gn-tlg-tray-reached">{reachedSentence(t.reachedBy)}</span>}
            <button type="button" className="gn-tlg-tray-action" onClick={() => p.onOpenField(t.id, trayActionField(t.reason))}>{trayActionLabel(t.reason)}</button>
          </li>
        ))}
        {p.items.length < p.total && p.onMore !== undefined && <li><button type="button" className="gn-tlg-tray-more" onClick={p.onMore}>{`Show more (${p.total - p.items.length})`}</button></li>}
      </ul>
    );
    return (
      <section className="gn-tlg-tray" aria-label={COPY.trayHeading}>
        {p.disclosure
          ? <button type="button" className="gn-tlg-tray-head" aria-expanded={open} onClick={() => setOpen(!open)}>{`${COPY.trayHeading} (${p.total})`}</button>
          : <h3 className="gn-tlg-tray-head">{COPY.trayHeading}</h3>}
        {open && list}
      </section>
    );
  }
  ```
  Tests (`tray.test.tsx`, `toolbar-legend.test.tsx`, jsdom): the exact strings; `Add dates` calls `onOpenField(id,'dates')`, `Add an estimate` calls `'estimate'`, `start-after-due` is `Add dates`; the reached sentence both forms; an unlabelled row has no `.gn-tlg-tray-reached` (control); disclosure collapses on a phone; legend shows the fourth entry only with `waitsForAll` (control same `it()`); zoom group `role=radiogroup` named `Timeline zoom`, clicking Day sets `onZoom('day')` and `aria-checked` follows `ppd`; the switch is off by default and toggles; **no element** in the rendered toolbar, legend or tray has an accessible name matching `/^(earlier|later|previous|next)$/i`; the `N links` chip singular/plural.

  `timeline-graph.tsx` (the shell used by the sheet now and by Home in T7):
  ```tsx
  import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
  import type { TimelineTrayItem } from '@gisik-nokma/domain';
  import { attachDriver, packLanes, router, scrollTo, type Windowed } from './bridge.js';
  import { DrawIndex } from './draw-index.js';
  import { ZOOM, anchorScroll, clampPpd, type ZoomName } from './geometry.js';
  import { TimelineLegend } from './legend.js';
  import { readFlag, writeFlag } from './model.js';
  import { TimelinePainter } from './painter.js';
  import { buildScene, extentOf, type SceneEdge, type SceneEntry, type SceneLane, type SceneOptions } from './scene.js';
  import { TimelineToolbar } from './toolbar.js';
  import { TimelineTray } from './tray.js';
  import type { View } from './draw-types.js';

  export type TimelineGraphProps = {
    entries: readonly SceneEntry[]; edges: readonly SceneEdge[]; tray: readonly TimelineTrayItem[]; trayTotal?: number;
    today: string; orientation: 'landscape' | 'portrait';
    selectedId: string | null; onSelect: (ticketId: string) => void; onOpenField: (ticketId: string, field: 'dates' | 'estimate') => void;
    lanes?: readonly SceneLane[]; edgeScope?: SceneOptions['edges']; lit?: ReadonlySet<string> | null;
    originDay?: string; spanDays?: number;
    /** localStorage key of the Planned vs actual switch ("per browser"). */
    storageKey: string;
    onNeedWindow?: (fromDay: string, toDay: string) => void; onMoreTray?: () => void;
    className?: string;
  };

  const OVERSCAN = 800;

  export function TimelineGraph(p: TimelineGraphProps): ReactElement {
    const [ppd, setPpd] = useState<number>(ZOOM.week);
    const [planned, setPlanned] = useState<boolean>(() => readFlag(p.storageKey));
    const [view, setView] = useState<View>({ x0: 0, x1: 1_600, y0: 0, y1: 1_000 });
    const host = useRef<HTMLDivElement | null>(null);
    const win = useRef<Windowed | null>(null);

    const extent = useMemo(() => (p.originDay !== undefined && p.spanDays !== undefined ? { originDay: p.originDay, spanDays: p.spanDays } : extentOf(p.entries, p.today)), [p.entries, p.today, p.originDay, p.spanDays]);
    const lanes = p.lanes ?? [{ id: 'flow', heading: null }];
    const scene = useMemo(
      () => buildScene(p.entries, p.edges, { today: p.today, ...extent, ppd, orientation: p.orientation, plannedVsActual: planned, lanes, selectedId: p.selectedId, edges: p.edgeScope ?? 'all', lit: p.lit ?? null }, packLanes, router),
      [p.entries, p.edges, p.today, extent, ppd, planned, p.orientation, lanes, p.selectedId, p.edgeScope, p.lit],
    );
    const index = useMemo(() => new DrawIndex(scene.draws), [scene.draws]);

    useEffect(() => {
      if (host.current === null) return undefined;
      const w = attachDriver(host.current, { quantisePx: 256, contentW: scene.width, contentH: scene.height });
      win.current = w;
      const off = w.onWindow((v) => setView(v));
      return () => { off(); w.destroy(); win.current = null; };
    }, [scene.width, scene.height]);

    const todayTo = useCallback((smooth: boolean) => {
      if (win.current === null) return;
      const at = scene.todayPx - (p.orientation === 'portrait' ? 160 : 320);
      scrollTo(win.current, p.orientation === 'portrait' ? { y: Math.max(0, at) } : { x: Math.max(0, at) }, smooth);
    }, [scene.todayPx, p.orientation]);
    useEffect(() => { todayTo(false); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const onZoom = (name: ZoomName): void => {
      const next = clampPpd(ZOOM[name]);
      const w = win.current;
      if (w !== null) {
        const portrait = p.orientation === 'portrait';
        const anchorPx = portrait ? 200 : 400;
        const cur = portrait ? view.y0 : view.x0;
        const to = anchorScroll(cur, anchorPx, ppd, next);
        scrollTo(w, portrait ? { y: to } : { x: to }, false);
      }
      setPpd(next);
    };
    const toggle = (v: boolean): void => { setPlanned(v); writeFlag(p.storageKey, v); };
    const waitsForAll = p.entries.some((e) => e.waitForAll === true);

    return (
      <div className={`gn-tlg ${p.className ?? ''}`} data-orientation={p.orientation}>
        <TimelineToolbar ppd={ppd} onZoom={onZoom} onToday={() => todayTo(true)} plannedVsActual={planned} onTogglePlanned={toggle} linkCount={scene.linkCount} />
        <TimelineLegend waitsForAll={waitsForAll} />
        <div ref={host} className="gn-tlg-panel" tabIndex={0} aria-label="Timeline">
          <TimelinePainter draws={scene.draws} index={index} view={view} overscan={OVERSCAN} width={scene.width} height={scene.height} selectedId={p.selectedId} onPick={p.onSelect} />
        </div>
        <TimelineTray items={p.tray} total={p.trayTotal ?? p.tray.length} onOpenField={p.onOpenField} onMore={p.onMoreTray} disclosure={p.orientation === 'portrait'} />
      </div>
    );
  }
  ```
  (`onNeedWindow` is wired in T7 where chunks are fetched; the sheet never calls it.) Add `scrollTo` to `bridge.ts` over the landed driver (`driver.animateTo` / `driver.setOffset`), and the `Windowed` it returns. Tests (`timeline-graph.test.tsx`, jsdom with a fake `bridge` via `vi.mock('../../src/timeline-graph/bridge.js')` returning a controllable `attachDriver`): the switch is off by default; turning it on writes `'1'` to the injected storage (test sets `localStorage` to a throwing stub → no throw, reads off) (29.316); zoom radio changes the bar widths from 24 to 56 px/day (29.324); the toolbar and tray remain in the DOM outside `.gn-tlg-panel` (29.322/29.325 structure); the panel has `tabIndex 0` and an accessible name. Commit.

- [ ] **Step 4: The sheet slot and the live wrapper (29.313, 29.326)**

  `ticket-timeline.tsx`:
  ```tsx
  import { useMemo, type ReactElement } from 'react';
  import type { DataSource } from '../data-source.js';
  import { useLiveQuery } from '../views/use-live-query.js';
  import { fromFlowRead } from './model.js';
  import { TimelineGraph } from './timeline-graph.js';

  export type TicketTimelineProps = {
    source: DataSource; workspaceId: string; ticketId: string; today: string; orientation: 'landscape' | 'portrait';
    selected: string | null; onSelect: (ticketId: string) => void; onOpenField: (ticketId: string, field: 'dates' | 'estimate') => void;
  };

  /** The sheet's Timeline view (TG-1, TG-8): the flow whole, one `getFlow`, live through the workspace stream. NO timeline range route. */
  export function TicketTimeline(p: TicketTimelineProps): ReactElement {
    const flow = useLiveQuery(p.source, p.workspaceId, `flow:${p.ticketId}`, () => p.source.query.getFlow(p.workspaceId, p.ticketId), { cacheKey: `flow:${p.ticketId}` });
    const model = useMemo(() => (flow.data === null ? null : fromFlowRead(flow.data, p.today)), [flow.data, p.today]);
    if (model === null) return <div className="gn-tlg-state" role="status">{flow.error === null ? 'Loading the timeline' : "Couldn't load the timeline."}</div>;
    return (
      <TimelineGraph
        entries={model.entries} edges={model.edges} tray={model.tray} today={p.today} orientation={p.orientation}
        selectedId={p.selected} onSelect={p.onSelect} onOpenField={p.onOpenField} storageKey="gn.timeline.plannedVsActual"
      />
    );
  }
  ```
  `ticket-sheet.tsx`: add `timelineGraphSlot?: ReactNode` to `TicketSheetProps` and extend the Graph tab's switch with the same condition `knowledgeGraphSlot` uses (read it at Step 0):
  ```tsx
  // options of the "Graph views" switch, in the order Workflow, Timeline, Knowledge
  ...(timelineGraphSlot === undefined ? [] : [{ value: 'timeline' as const, label: 'Timeline' }]),
  // the body
  {graphView === 'timeline' && timelineGraphSlot}
  ```
  The web host passes `timelineGraphSlot={<TicketTimeline source={source} workspaceId={workspaceId} ticketId={ticketId} today={today} orientation={isPhone ? 'portrait' : 'landscape'} selected={selected} onSelect={setSelected} onOpenField={openField} />}` with `today = useIstToday()` (T4) and `openField` = the sheet's own "open at this field" (`grep -n "focusField\|openAt" packages/app-core/src/views/ticket-sheet.tsx`; if none exists, scroll the Details tab to the field and focus it: write that function in the host, with a test).

  `ticket-timeline.test.tsx` (29.313, 29.326): a fake `DataSource` whose `query.getFlow` resolves a diamond fixture and records calls; the fake `fetch` / `getTimelineIndex` throws if called (proof of NO range route); `getFlow` is called once; with the slot absent the switch has no `Timeline` option, with it present it does (control, same `it()`); selecting `Timeline` then back to `Workflow` keeps `selected`; after an `event` frame in the same workspace the debounced reload (fake timers 200 ms, the hook's own) re-fetches, the changed estimate moves the bar and `selected` and the toggle are kept; an event frame for ANOTHER workspace id never reaches this subscription. Commit.

- [ ] **Step 5: CSS, the token binding test, real geometry (29.319, 29.325)**

  `ui.css` `/* WTG4 T5 */` (new rules only; append in this block; no existing rule changes):
  ```css
  .gn-tlg { display: flex; flex-direction: column; height: 100%; min-height: 320px; min-width: 0; }
  .gn-tlg-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 6px 0; flex: 0 0 auto; }
  .gn-tlg-legend { display: flex; flex-wrap: wrap; gap: 4px 16px; margin: 0; padding: 0 0 6px; list-style: none; font-size: 12px; color: var(--gn-text-muted); flex: 0 0 auto; }
  .gn-tlg-swatch { display: inline-flex; width: 18px; height: 14px; margin-right: 6px; align-items: center; justify-content: center; border-radius: 3px; font-size: 10px; vertical-align: middle; }
  .gn-tlg-swatch[data-style='done'], .gn-tlg-bar[data-style='done'] { background: var(--gn-category-terminal); color: var(--gn-success-text); }
  .gn-tlg-swatch[data-style='active'], .gn-tlg-bar[data-style='active'] { background: var(--gn-category-active); color: var(--gn-accent-text); }
  .gn-tlg-swatch[data-style='planned'], .gn-tlg-bar[data-style='planned'] { background: var(--gn-fill-quaternary); color: var(--gn-text); outline: 1px solid var(--gn-border-strong); outline-offset: -1px; }
  .gn-tlg-swatch[data-style='wait'] { border: 1px solid var(--gn-border-strong); }
  .gn-tlg-panel { position: relative; flex: 1 1 0; min-height: 0; overflow: hidden; overscroll-behavior: contain; touch-action: none; background: var(--gn-surface); border: 1px solid var(--gn-border); border-radius: var(--gn-radius-card); }
  .gn-tlg-canvas { position: absolute; left: 0; top: 0; }
  .gn-tlg-bar, .gn-tlg-diamond { box-sizing: border-box; display: flex; flex-direction: column; justify-content: center; padding: 0 6px; border: 0; border-radius: 4px; font: inherit; font-size: 11px; line-height: 12px; text-align: left; overflow: hidden; cursor: pointer; }
  .gn-tlg-bar[data-draft='true'] { border: 1px dashed var(--gn-border-strong); }
  .gn-tlg-bar[aria-pressed='true'], .gn-tlg-diamond[aria-pressed='true'] { outline: 2px solid var(--gn-focus-ring); outline-offset: 1px; }
  .gn-tlg-bar[data-dim='true'], .gn-tlg-diamond[data-dim='true'] { opacity: 0.32; }
  .gn-tlg-title { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .gn-tlg-key[data-outside='true'] { position: absolute; left: 100%; margin-left: 6px; color: var(--gn-text); white-space: nowrap; }
  .gn-tlg-mark { margin-right: 4px; }
  .gn-tlg-pin { position: absolute; width: 12px; height: 12px; }
  .gn-tlg-pin[data-at='inside'] { right: 6px; top: 8px; }
  .gn-tlg-edges { position: absolute; left: 0; top: 0; pointer-events: none; overflow: visible; }
  .gn-tlg-edge { fill: none; stroke: var(--gn-text-muted); stroke-width: 1.5; }
  .gn-tlg-edge-label { font-size: 11px; fill: var(--gn-text); paint-order: stroke; stroke: var(--gn-surface); stroke-width: 4px; }
  .gn-tlg-heading { display: flex; align-items: center; padding: 0 8px; font-weight: 600; background: var(--gn-surface-sunken); }
  .gn-tlg-today { background: var(--gn-danger); } .gn-tlg-today > span { position: absolute; top: 0; left: 4px; font-size: 11px; color: var(--gn-danger); }
  .gn-tlg-weekend { background: var(--gn-timeline-weekend); }
  .gn-tlg-tray { flex: 0 0 auto; max-height: 40%; overflow: auto; border-top: 1px solid var(--gn-border); padding-top: 6px; }
  ```
  The `.gn-tlg-bar`'s `position` is `absolute` through the T2 block. Add the token test described in Step 0.3. Run the `ui`, `app-core` and `web` suites WHOLE.

  **Geometry on the primary dev stack** (`apps/web/e2e-stack/timeline-graph.spec.ts`, copying the structure of a sibling spec in that folder; the primary stack is rebuilt by the owner or `ctl rebuild`; no lane starts its own stack): open a ticket with a flow of at least 6 members (seeded through the API in the spec's setup), open the Graph tab, choose Timeline, and assert with `boundingBox()`:
  - at `1240 x 900`: `.gn-tlg-panel` height = the sheet body's height minus the toolbar and legend heights (within 1 px) and >= 320; the sheet width is 1240; a bar's height is 28; a long bar has a `.gn-tlg-title`; `document.scrollingElement.scrollHeight` unchanged after `page.mouse.wheel` over the panel; `scrollY` unchanged;
  - at `390 x 844`: columns are 112 wide; the tray is a disclosure; the bottom card opens on tap;
  - print `tlg-geometry <numbers> machine <platform/arch>` and quote it LOCAL in the commit and the case line.
  Flip 29.319, 29.325 after the run. Commit.

- [ ] **Step 6: Neighbours, mutations, manual, Features, DONE**

  Mutations: (1) `end` for `end + 1` → 29.314; (2) pack drawn segments → 29.316; (3) long threshold 149 → 29.318; (4) swap ✓ and ▶ → 29.319; (5) both anchors at the start → 29.320; (6) `routeEdge` for loops → 29.321; (7) always render the Waits entry → 29.324; (8) always list the Timeline option → 29.313; (9) 2 lines in portrait → 29.323. `docs/manual.md`: one paragraph under the ticket sheet's Graph tab: what Timeline shows, Planned vs actual, the tray (copy the section's existing tone and check that no sentence says the sheet has two graph views). Features bullet under `<!-- WTG4 bullet T5 -->`: *"Timeline view in the ticket sheet (✅): the flow laid on a date axis with 28 px bars, ✓ / ▶ marks, chained dates, curved loop arrows, a Planned vs actual switch, Day / Week / Month zoom, an undated tray and a phone layout. `packages/app-core/src/timeline-graph/`."*

  `timeline-graph/index.ts` re-exports `geometry`, `labels`, `model`, `scene`, `toolbar`, `legend`, `tray`, `timeline-graph` and `ticket-timeline` (T6 and T7 import them by the package subpath `@gisik-nokma/app-core/timeline-graph`). Run WHOLE: `packages/ui`, `packages/app-core`, `apps/web` (build first). Commit; DONE.

---
### Task 6: Periods, passes, Not taken, ghosts, revised, the paper pin (cases 29.327–29.334)

**Branch** `task/wtg4-passes`. **UI task: invoke `frontend-design` in the lane prompt.** Depends on T5 (one scene builder, extended here). T5 → T6 → T7 are serial.

**Files:**
- Modify:
  - `packages/domain/src/read-models-timeline.ts` (`TimelineSegment.earlier?: number`)
  - `packages/domain/src/flow/segments.ts` (the 8-pass cap)
  - `packages/domain/test/flow/segments.test.ts`
  - `packages/app-core/src/online/map-timeline.ts` (the `earlier` field)
  - `packages/app-core/src/timeline-graph/{draw-types,scene,labels,model,painter,legend}.ts(x)`
  - `packages/ui/src/ui.css` (`/* WTG4 T6 */`)
  - `packages/ui/src/tokens.ts` + `packages/ui/test/tokens.test.ts` (only if the ghost, Not-taken or stub bindings miss their bar: text 4.5:1, stub mark 3:1 against the canvas)
  - the tests of T5 (`scene.test.ts`, `scene-real-router.test.ts`, `labels.test.ts`)
  - `Features.md` §26 (`<!-- WTG4 bullet T6 -->`), `test-cases/29-workflow-timeline-graphs.md` (`<!-- WTG4 T6 -->`)

**Interfaces:**
- **Consumes:** T5's `buildScene`, `SceneEntry`, `drawnSegments`, `keyAndPin`, `COPY`, `barAria`; T1's `segmentsFor`; Part 2's `PassRecord` (`{ pass; outcome; by; at; revisions: { from; to; by; at }[] }`, PS-2); `formatIstInstant` (`packages/domain/src/clock-skew.ts`, the calendar surface's formatter).
- **Produces:**
  - `SceneEntry` gains `revised?: string | null` (the PS-6 sentence, non-null = the revised mark) and `tooltip?: string | null` (the `passTooltip` string);
  - `DrawBar.tooltip?: string | null`; `DrawDiamond.revised: string | null`;
  - `labels.ts`: `passTooltip`, `revisedSentence`, `clearedSentence`, `notTakenChip`, `revisionOf`;
  - the Pruned strip (`DrawStrip` id `strip:<lane>`).

- [ ] **Step 0: Pre-flight**

  1. Cut the branch; build. Print `formatIstInstant('2026-10-02T12:34:00.000Z')` with `node -e` against the built domain and write the exact output into the handoff: the revised sentence is `Decision revised: Yes → No by Ama Rangsa, 2 Oct 18:04`, so the formatter must give `2 Oct 18:04` for `12:34Z`. If its form differs, write the three-line adapter in `labels.ts` (day-of-month, English short month, `HH:mm`, IST by +330 minutes arithmetic, no `Intl`).
  2. `grep -n "passes\|revisions" packages/domain/src/ticket-state.ts packages/domain/src/read-models.ts` to confirm `PassRecord` as landed. Re-read the History sentence for revisions in Part 2's History mapper (`grep -rn "Decision revised"`): the revised mark's tooltip is that very string, so import it if it is a function there.

- [ ] **Step 1: The 8-pass cap, test first (29.329)**

  Case lines under `<!-- WTG4 T6 -->`:
  - `- ❌ **29.327 — periods are solid segments joined by a thin dashed connector:** a reopened ticket draws one bar per work period on ONE row; consecutive periods are joined by a 1 px connector at the bars' mid-height across the gap (dashed, 60% opacity); the first bar reads `GN-143`, the later ones `GN-143 ↺2`, `GN-143 ↺3`; an open period ends at today; another ticket's bar fits in the gap on the same row (real `pack`); control: a ticket with one period draws no connector. Mutation: drop the `↺` suffix → the label assertion reds.`
  - `- ❌ **29.328 — a reopened ticket with no period yet in the new pass shows that pass's planned bar in outline, labelled `↺2`, and its tooltip lists each period:** `Pass 1: 2 Oct → 5 Oct. Reopened by GN-145 (Needs rework), 6 Oct. Pass 2: 8 Oct →` where the cause line is present only when the Decision's pass record is held (sheet: always; Home: when the Decision's detail has been loaded); without it the sentence is `Pass 1: 2 Oct → 5 Oct. Pass 2: 8 Oct →`; periods are retroactive (a ticket reopened last month shows both today). Mutation: omit the open period's arrow → the sentence assertion reds.`
  - `- ❌ **29.329 — planned outlines per pass, and the 8-pass cap:** with Planned vs actual ON each pass's planned outline sits behind its own period (lower z, a pass-rank outline style: solid for pass 1, dashed for 2, dotted for 3 or more, so passes differ by more than colour); a ticket with more than 8 passes keeps its 8 most recent in the index and older ones are ONE `+N earlier` summary segment (`pass: 0`, `earlier: N`); control: 8 passes are all kept. Mutation: cap at 9 → the 10-pass assertion reds.`
  - `- ❌ **29.330 — a Decision is a diamond on the end day of each closed period:** two closed periods give two diamonds, the second labelled `GN-151 ↺2`; an open period gives a diamond at today with ▶; a finished one carries ✓ beside the key; a diamond is 28 px and never touches its neighbour's bar. Mutation: draw only the last period → the count reds.`
  - `- ❌ **29.331 — Not taken (owner ruling O3, the approved mockups):** a Not-taken ticket that did work keeps its work-period bars in the `notTaken` style (muted fill, dashed edge, never `opacity` below 1, text >= 4.5:1) with the chip `Not taken` (`Not taken (pass 2)` from pass 2) and the tooltip `<key> <title>, <start> to <end>, Not taken (pass n)`, and those bars take a row (packing union); a never-started one draws a 6 px stub at its close day with the tooltip `<key> <title>: Not taken, <day>`, which occupies that day in the union; with Planned vs actual ON and a pruned plan the stub is not drawn and its ghost sits in the Pruned strip, and no live row moves; neither is in the tray; the legend shows `Not taken, after its work` / `Not taken, never started` only when the scene holds one; control: the same worked ticket without a resolution has the done style and no chip. Mutation: draw the worked Not-taken bars in the done style → the style assertion reds; drop the stub → the stub assertion reds; chip text from the wrong pass → the pass-2 assertion reds.`
  - `- ❌ **29.332 — pruned ghosts:** with Planned vs actual ON a lane gains a strip headed `Pruned` under its rows holding the pruned branch's planned bars as ghosts (pale fill, dashed border, label `pruned`, text >= 4.5:1, no `opacity` below 1 on text); OFF the strip is absent; turning it on moves NO live row (PK-3, PK-9); a ghost has no arrows and no edge anchors; control: a lane with no ghosts has no strip. Mutation: include ghosts in the packing footprint → the row-equality assertion reds.`
  - `- ❌ **29.333 — the revised mark:** the diamond of a Decision whose current pass has a revision shows the mark `revised` whose tooltip is `Decision revised: Yes → No by Ama Rangsa, 2 Oct 18:04` (a clearing reads `Cleared the decision (was Yes)`); a Decision with no revisions shows none; control: an earlier pass's revision does not mark a diamond of a later pass. Mutation: mark every Decision with passes → the control reds.`
  - `- ❌ **29.334 — the paper pin:** a ticket with a note the viewer can see or any attachment shows a 12 px pin inside the bar's trailing edge 6 px in, or after the key on a bar too short to hold it (adding 14 px to `labelPx`); its tooltip and the bar's accessible description read `2 notes, 1 attachment` (singular `1 note`); it is not a button and not focusable; a ticket with neither shows none; control: the same ticket's pin is absent in a scope where the counts are zero. Measured in the browser: right inset 6 px, 12 px square.`

  Domain test (extend `packages/domain/test/flow/segments.test.ts`):
  ```ts
  it('29.329 keeps the 8 most recent passes and summarises older ones as one "+N earlier" segment; control: 8 are all kept', () => {
    const mk = (n: number) => Array.from({ length: n }, (_, i) => ({ start: `2026-09-${String(i * 2 + 1).padStart(2, '0')}`, end: `2026-09-${String(i * 2 + 2).padStart(2, '0')}`, pass: i + 1 }));
    const ten = segmentsFor({ periods: mk(10), planned: [], notTaken: null, closedDay: null, today: '2026-10-03' });
    expect(ten.filter((s) => s.pass >= 3).length).toBe(8);
    const summary = ten.find((s) => s.pass === 0);
    expect(summary).toMatchObject({ type: 'actual', earlier: 2, start: '2026-09-01', end: '2026-09-04' });
    const eight = segmentsFor({ periods: mk(8), planned: [], notTaken: null, closedDay: null, today: '2026-10-03' });
    expect(eight.find((s) => s.pass === 0)).toBeUndefined();
    expect(eight).toHaveLength(8);
  });
  ```
  Implement in `segments.ts`: after building `out`, compute the distinct pass numbers; if more than 8, drop every segment (all three types) of the passes below `maxPass - 7`, and push one `{ start: min(start of dropped), end: max(end of dropped), pass: 0, type: 'actual', earlier: <number of dropped passes> }`; keep the sort. `TimelineSegment` gains `earlier?: number`; `map-timeline.ts`'s `segment()` copies `earlier` when it is a number (add one assertion to 29.308's clean case). Run the domain and app-core mapper tests. Commit.

- [ ] **Step 2: Labels and sentences, test first (29.328, 29.333, 29.331)**

  Add to `labels.ts`:
  ```ts
  import { formatIstInstant } from '@gisik-nokma/domain';

  const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  /** "2 Oct" from an IST day. */
  export const dayLabel = (ymd: string): string => `${Number(ymd.slice(8, 10))} ${SHORT[Number(ymd.slice(5, 7)) - 1]}`;

  export const notTakenChip = (r: { pass: number } | null): string | null => (r === null ? null : r.pass > 1 ? `${COPY.notTaken} (pass ${r.pass})` : COPY.notTaken);
  /** TG-10 tooltips (the mockup `Timeline-passes`): a worked Not-taken bar, and a never-started one's stub. */
  export const notTakenBarTip = (key: string | null, title: string, start: string, end: string, chip: string): string =>
    `${key ?? 'Draft'} ${title}, ${dayLabel(start)} to ${dayLabel(end)}, ${chip}`;
  export const stubTip = (key: string | null, title: string, day: string): string => `${key ?? 'Draft'} ${title}: ${COPY.notTaken}, ${dayLabel(day)}`;

  type Rev = { from: string | null; to: string | null; by: string; at: string };
  /** PS-6, the History sentence. `name` null leaves "by …" out rather than printing an id. */
  export function revisedSentence(r: Rev, name: string | null): string {
    const by = name === null ? '' : ` by ${name}`;
    if (r.to === null) return `Cleared the decision (was ${r.from ?? 'nothing'})`;
    return `Decision revised: ${r.from ?? 'none'} → ${r.to}${by}, ${formatIstInstant(r.at)}`;
  }
  /** The mark belongs to the CURRENT (last) pass only. */
  export function revisionOf(passes: readonly { revisions: readonly Rev[] }[] | null): Rev | null {
    const last = passes === null ? undefined : passes[passes.length - 1];
    return last === undefined ? null : (last.revisions[last.revisions.length - 1] ?? null);
  }

  /** TG-9: "Pass 1: 2 Oct → 5 Oct. Reopened by GN-145 (Needs rework), 6 Oct. Pass 2: 8 Oct →". `causes[pass]` is the sentence part after "Reopened by". */
  export function passTooltip(periods: readonly { start: string; end: string | null; pass: number }[], causes: Record<number, string> = {}): string {
    const sorted = [...periods].sort((a, b) => a.pass - b.pass || (a.start < b.start ? -1 : 1));
    return sorted
      .map((p, i) => {
        const span = `Pass ${p.pass}: ${dayLabel(p.start)} →${p.end === null ? '' : ` ${dayLabel(p.end)}`}.`;
        const next = sorted[i + 1];
        const cause = next === undefined ? undefined : causes[next.pass];
        return cause === undefined ? span : `${span} Reopened by ${cause}.`;
      })
      .join(' ');
  }
  ```
  `labels.test.ts` additions: `notTakenBarTip('GN-163', 'Build page', '2026-09-26', '2026-09-28', 'Not taken (pass 2)')` is `GN-163 Build page, 26 Sep to 28 Sep, Not taken (pass 2)` and `stubTip('GN-165', 'Brief', '2026-09-25')` is `GN-165 Brief: Not taken, 25 Sep` (29.331, the mockup's words); the three sentences exactly (with the `formatIstInstant` form recorded in Step 0), `revisionOf` takes the LAST pass only (control: an earlier pass's revision gives `null`), `notTakenChip` for pass 1 and 2 and `null`, `passTooltip` with and without causes (`causes = { 2: 'GN-145 (Needs rework), 6 Oct' }`), `dayLabel('2026-10-02') === '2 Oct'`. Run: FAIL then PASS. Commit.

- [ ] **Step 3: The scene: connectors, labels, per-period diamonds, Not taken, ghosts, revised, pin (29.327–29.334)**

  Types (`draw-types.ts`): `BarStyle` gains `'notTaken'` (`'done' | 'active' | 'planned' | 'ghost' | 'notTaken'`: a worked Not-taken ticket's bars, D-W4-11; `barAria`'s `style` widens the same way); a new `DrawStub = Base & { kind: 'stub'; ticketId: string; key: string | null; title: string; chip: string; tooltip: string; ariaLabel: string }` joins `Draw` (6 x 24 px, centred on its day, the key and chip printed after it as the mockup does); `DrawBar` gains `tooltip?: string | null`; `DrawDiamond.revised: string | null` (was `boolean`); T5's `revised: false` becomes `revised: null` and the painter test fixtures follow.

  Replace the per-entry `for (const e of entries) { … }` loop of `buildScene` (T5 Step 2) and the lane layout above it with the following. First the extra packing for the strip, before `laneExtent`:
  ```ts
  const STRIP_HEAD = 24;
  const ghostItems: PackItem[] = !o.plannedVsActual ? [] : entries.filter((e) => e.segments.some((s) => s.type === 'ghost')).map((e) => ({
    id: e.id, lane: e.lane, spans: e.segments.filter((s) => s.type === 'ghost').map((s) => ({ start: dayNumber(s.start), end: dayNumber(s.end) })), labelPx: KEY_PX,
  }));
  const gpacked = pack(ghostItems, { ppd: o.ppd });
  ```
  and in the lane loop, the size becomes (`gRows = gpacked.rowCount.get(l.id) ?? 0`):
  ```ts
  const size = portrait
    ? (Math.max(1, rows) + gRows) * COL_PITCH
    : (l.heading === null ? 0 : HEADING_H) + Math.max(1, rows) * ROW_PITCH + (gRows > 0 ? STRIP_HEAD + gRows * ROW_PITCH : 0);
  ```
  After the headings, one `DrawStrip` per lane with `gRows > 0`:
  ```ts
  for (const l of o.lanes) {
    const gRows = gpacked.rowCount.get(l.id) ?? 0;
    if (gRows === 0) continue;
    const ext = laneExtent.get(l.id) as { start: number; size: number };
    const rows = Math.max(1, packed.rowCount.get(l.id) ?? 0);
    const top = portrait ? 0 : ext.start + (l.heading === null ? 0 : HEADING_H) + rows * ROW_PITCH;
    draws.push({ kind: 'strip', id: `strip:${l.id}`, z: 1, text: COPY.pruned, b: portrait ? { x0: ext.start + rows * COL_PITCH, x1: ext.start + ext.size, y0: 0, y1: HEADING_H } : { x0: 0, x1: width, y0: top, y1: top + STRIP_HEAD } });
  }
  ```
  Replace T5's `drawnSegments` (a stub is drawn unless its ghost stands in for it, D-W4-11):
  ```ts
  export function drawnSegments(e: Pick<SceneEntry, 'segments'>, plannedVsActual: boolean): TimelineSegment[] {
    const worked = new Set(e.segments.filter((s) => s.type === 'actual').map((s) => s.pass));
    const ghostShown = plannedVsActual && e.segments.some((s) => s.type === 'ghost');
    return e.segments.filter((s) => s.type === 'actual' || (s.type === 'planned' && (plannedVsActual || !worked.has(s.pass))) || (s.type === 'stub' && !ghostShown));
  }
  ```
  Then the entry loop:
  ```ts
  const keyOf = (e: SceneEntry, pass: number): string | null => (e.key === null ? null : pass > 1 ? `${e.key} ↺${pass}` : e.key);
  for (const e of entries) {
    const row = packed.rowOf.get(e.id);
    const segsAll = drawnSegments(e, o.plannedVsActual);
    if (row !== undefined) {
      const v = vOf(e.lane, row);
      const segs = [...segsAll].sort((a, b) => (a.start < b.start ? -1 : 1));
      const lastActualIdx = segs.map((s) => s.type).lastIndexOf('actual');
      const hasPin = e.pin.notes + e.pin.attachments > 0;
      const chip = notTakenChip(e.resolution); // D-W4-11: non-null only on a Not-taken ticket
      const bounds: Bounds[] = [];
      const actualBounds: Bounds[] = [];
      segs.forEach((seg, i) => {
        const u0 = dayX(seg.start, o), u1 = dayX(addDays(seg.end, 1), o);
        const isLast = i === segs.length - 1;
        if (seg.type === 'stub') {
          // TG-10: a never-started Not-taken ticket is a 6 px mark centred on its close day (6 px wide in both orientations).
          const c = (u0 + u1) / 2;
          let b = place(c - 3, c + 3, v + 2, BAR_H - 4);
          if (portrait) b = { x0: b.x0 + COL_W / 2 - 3, x1: b.x0 + COL_W / 2 + 3, y0: b.y0, y1: b.y0 + BAR_H - 4 };
          const text = chip ?? COPY.notTaken;
          draws.push({ kind: 'stub', id: `${e.id}:s`, ticketId: e.id, z: 3, b, key: e.key, title: e.title ?? '', chip: text, dim: dim(e.id),
            tooltip: stubTip(e.key, e.title ?? '', seg.start), ariaLabel: `${stubTip(e.key, e.title ?? '', seg.start)}` });
          bounds.push(b);
          return;
        }
        const nt = chip !== null && seg.type === 'actual';
        const active = !nt && seg.type === 'actual' && i === lastActualIdx && e.category === 'active' && seg.end >= o.today;
        const style: BarStyle = seg.type === 'planned' ? 'planned' : nt ? 'notTaken' : active ? 'active' : 'done';
        const mark = seg.type === 'planned' || nt ? null : active ? 'active' : 'done';
        if (e.kind === 'decision') {
          const centre = u1 - o.ppd / 2;
          let b = place(centre - DIAMOND / 2, centre + DIAMOND / 2, v + (BAR_H - DIAMOND) / 2, DIAMOND);
          if (portrait) b = { x0: b.x0 + (COL_W - DIAMOND) / 2, x1: b.x0 + (COL_W - DIAMOND) / 2 + DIAMOND, y0: b.y0, y1: b.y0 + DIAMOND };
          draws.push({
            kind: 'diamond', id: `${e.id}:d${i}`, ticketId: e.id, z: 3, b, style, key: keyOf(e, seg.pass), title: e.title ?? '', mark,
            revised: isLast ? (e.revised ?? null) : null, pin: isLast && hasPin ? e.pin : null, draft: e.draft, dim: dim(e.id),
            ariaLabel: barAria({ key: keyOf(e, seg.pass), title: e.title, draft: e.draft, style, pass: seg.pass, pin: isLast && hasPin ? e.pin : null, chip: null }),
          });
          bounds.push(b);
          return;
        }
        let b = place(u0, u1, v, BAR_H);
        const widthPx = portrait ? COL_W : b.x1 - b.x0;
        const kp = keyAndPin(widthPx, isLast && hasPin);
        if (portrait) b = { ...b, y1: Math.max(b.y1, b.y0 + 16 + 12 * (1 + titleLines(e.title))) };
        draws.push({
          kind: 'bar', id: `${e.id}:${seg.type[0]}${seg.pass}:${i}`, ticketId: e.id, z: seg.type === 'planned' ? 2 : 3, b, style,
          key: keyOf(e, seg.pass), title: e.title ?? '', long: portrait || widthPx >= LONG_BAR_PX, mark, passRank: Math.min(2, Math.max(0, seg.pass - 1)) as 0 | 1 | 2,
          pass: seg.pass, pin: isLast && hasPin ? e.pin : null, chip: isLast ? chip : null, draft: e.draft, labelPx: kp.labelPx,
          keyOutside: portrait ? false : kp.keyOutside, pinAt: portrait && isLast && hasPin ? 'inside' : kp.pinAt, dim: dim(e.id),
          tooltip: nt ? notTakenBarTip(keyOf(e, seg.pass), e.title ?? '', seg.start, seg.end, chip as string) : e.tooltip ?? null,
          ariaLabel: barAria({ key: keyOf(e, seg.pass), title: e.title, draft: e.draft, style, pass: seg.pass, pin: isLast && hasPin ? e.pin : null, chip: nt ? chip : null }),
        });
        bounds.push(b);
        if (seg.type === 'actual') actualBounds.push(b);
      });
      // TG-9: a 1 px dashed connector at mid-height across the gap between consecutive actual segments.
      const acts = [...actualBounds].sort((a, b) => (portrait ? a.y0 - b.y0 : a.x0 - b.x0));
      acts.slice(1).forEach((next, k) => {
        const prev = acts[k] as Bounds;
        draws.push(portrait
          ? { kind: 'connector', id: `${e.id}:c${k}`, ticketId: e.id, z: 2, dashed: true, b: { x0: prev.x0 + COL_W / 2, x1: prev.x0 + COL_W / 2 + 1, y0: prev.y1, y1: next.y0 } }
          : { kind: 'connector', id: `${e.id}:c${k}`, ticketId: e.id, z: 2, dashed: true, b: { x0: prev.x1, x1: next.x0, y0: prev.y0 + BAR_H / 2, y1: prev.y0 + BAR_H / 2 + 1 } });
      });
      if (bounds.length > 0) {
        const byStart = [...bounds].sort((a, b) => (portrait ? a.y0 - b.y0 : a.x0 - b.x0));
        const byEnd = [...bounds].sort((a, b) => (portrait ? a.y1 - b.y1 : a.x1 - b.x1));
        anchors.set(e.id, { first: byStart[0] as Bounds, last: byEnd[byEnd.length - 1] as Bounds });
      }
    }
    // PK-9: ghosts live in the lane's strip, with no anchors (no arrows), no part in any row.
    const grow = gpacked.rowOf.get(e.id);
    if (grow !== undefined) {
      const ext = laneExtent.get(e.lane) as { start: number; size: number };
      const lane = o.lanes.find((l) => l.id === e.lane);
      const rows = Math.max(1, packed.rowCount.get(e.lane) ?? 0);
      const gv = portrait ? ext.start + (rows + grow) * COL_PITCH : ext.start + (lane?.heading === null || lane === undefined ? 0 : HEADING_H) + rows * ROW_PITCH + STRIP_HEAD + grow * ROW_PITCH;
      e.segments.filter((s) => s.type === 'ghost').forEach((seg, gi) => {
        const b = place(dayX(seg.start, o), dayX(addDays(seg.end, 1), o), gv, BAR_H);
        draws.push({
          kind: 'bar', id: `${e.id}:g${seg.pass}:${gi}`, ticketId: e.id, z: 2, b, style: 'ghost', key: e.key, title: e.title ?? '', long: false, mark: null, passRank: 0,
          pass: seg.pass, pin: null, chip: COPY.ghost, draft: e.draft, labelPx: KEY_PX, keyOutside: false, pinAt: null, dim: dim(e.id), tooltip: notTakenChip(e.resolution),
          ariaLabel: barAria({ key: e.key, title: e.title, draft: e.draft, style: 'ghost', pass: seg.pass, pin: null, chip: COPY.ghost }),
        });
      });
    }
  }
  ```
  `SceneEntry` gains `revised?: string | null` and `tooltip?: string | null`; the tooltip string is built by the host with `passTooltip` and handed in. In `model.ts`'s `fromFlowRead` set, per node: `revised` from `revisionOf(n.passes)` through `revisedSentence(rev, nameOf(rev.by))` (`nameOf` is an injected argument defaulting to `() => null`), and `tooltip` from `passTooltip(n.periods, causes)` for a node with more than one period or a round above 1, where `causes[pass]` is built from the loop edges into the node: for each `taken` loop edge `D → node` labelled `L`, the Decision's pass records with outcome `L` give pass `k` whose `at` is the day of the reopening: `causes[k + 1] = ` `${D.key} (${L}), ${dayLabel(istDayOf(at))}`.

  Painter: a `DrawStub` renders a `button` (`className="gn-tlg-stub"`, `title={d.tooltip}`, `aria-label={d.ariaLabel}`, opening the ticket like a bar) and, after it, `<span className="gn-tlg-stub-label"><b>{key}</b> {chip}</span>`; a bar with `style='notTaken'` renders `data-style="notTaken"` and its chip. `legend.tsx` takes `notTaken: { worked: boolean; stub: boolean }` (the host derives both from the scene's draws) and appends `{ style: 'notTaken', text: COPY.legendNotTakenWorked }` and `{ style: 'stub', text: COPY.legendNotTakenStub }` only when each is true (29.324's rows are unchanged otherwise). `DrawDiamond.revised` renders `<span className="gn-tlg-revised" title={d.revised}>revised</span>` when non-null; `DrawBar.tooltip` becomes the button's `title`; the pin span gets `title={pinText(d.pin)}` and stays `aria-hidden`; a ghost bar renders its chip. Painter test additions: the pin is a `span` (not a button, `tabIndex` absent) with the right `title`; the revised span carries the sentence.

  CSS (`/* WTG4 T6 */`):
  ```css
  .gn-tlg-bar[data-style='ghost'] { background: var(--gn-fill-tertiary); color: var(--gn-text); border: 1px dashed var(--gn-border-strong); }
  .gn-tlg-bar[data-style='notTaken'] { background: var(--gn-fill-tertiary); color: var(--gn-text); border: 1.3px dashed var(--gn-border-strong); }
  .gn-tlg-stub { position: absolute; width: 6px; border-radius: 3px; background: var(--gn-border-strong); padding: 0; border: 0; }
  .gn-tlg-stub-label { position: absolute; font-size: 11px; color: var(--gn-text); white-space: nowrap; }
  .gn-tlg-bar[data-style='planned'][data-pass-rank='1'] { outline-style: dashed; }
  .gn-tlg-bar[data-style='planned'][data-pass-rank='2'] { outline-style: dotted; }
  .gn-tlg-connector { border-top: 1px dashed var(--gn-text-muted); opacity: 0.6; }
  .gn-tlg-strip { display: flex; align-items: center; padding: 0 8px; font-size: 11px; font-weight: 600; color: var(--gn-text-muted); border-top: 1px solid var(--gn-border); }
  .gn-tlg-chip { margin-left: 6px; padding: 0 4px; font-size: 10px; border: 1px solid var(--gn-border-strong); border-radius: 3px; }
  .gn-tlg-revised { margin-left: 6px; font-size: 10px; font-weight: 600; }
  .gn-tlg-pin { background: currentColor; mask: var(--gn-tlg-pin-mask) center / contain no-repeat; }
  .gn-tlg-pin[data-at='after-key'] { position: absolute; left: calc(100% + 6px + 64px); top: 8px; }
  ```
  `--gn-tlg-pin-mask` is a data-URI paperclip glyph defined once beside the block (a 12 x 12 SVG path; the lane draws it with the icons already in `packages/ui/src/icons`: read that folder first and reuse its paperclip or paper-pin icon if one exists, rendering it as the `span`'s child instead of a mask). Contrast: add to the T5 `describe('29.319 …')` in `tokens.test.ts` a `29.332 / 29.331` block: text (`--gn-text`) on `fillTertiary` >= 4.5 in light and dark for the three styles (ghost and notTaken share it), and the stub mark (`borderStrong`) on the canvas (`surface`) >= 3; if one misses, add a role. Assert in the scene test that no ghost CSS rule sets `opacity` below 1: read `UI_CSS` the way `components.test.tsx`'s `rule()` does and grep the ghost, notTaken and stub selectors' bodies for `opacity` (29.331, 29.332).

  Scene tests (extend `scene.test.ts`; the 29.317-style real-pack cases extend `scene-real-router.test.ts`):
  ```ts
  describe('29.327 / 29.328 periods and passes', () => {
    const reopened = ent('R', [['2026-10-01', '2026-10-02', 'actual', 1], ['2026-10-06', TODAY_PLUS5, 'actual', 2]], { category: 'active' });
    it('29.327 one row, a dashed connector at mid-height across the gap, labels with the pass suffix, control: one period no connector', () => {
      const s = buildScene([reopened], [], { ...O, today: '2026-10-08' }, greedy, straight);
      const bars = s.draws.filter((d) => d.kind === 'bar') as any[];
      expect(bars.map((b) => b.key)).toEqual(['GN-R', 'GN-R ↺2']);
      expect(new Set(bars.map((b) => b.b.y0)).size).toBe(1);
      const c = s.draws.find((d) => d.kind === 'connector') as any;
      expect(c.b.x0).toBe(bars[0].b.x1);
      expect(c.b.x1).toBe(bars[1].b.x0);
      expect(c.b.y0).toBe(bars[0].b.y0 + 14);
      expect(c.dashed).toBe(true);
      const one = buildScene([ent('O', [['2026-10-01', '2026-10-02', 'actual']])], [], O, greedy, straight);
      expect(one.draws.some((d) => d.kind === 'connector')).toBe(false);
    });
  });
  describe('29.330 diamonds per closed period', () => {
    it('29.330 two closed periods: two diamonds, the second ↺2; an open one ▶ at today', () => {
      const d = ent('D', [['2026-10-01', '2026-10-01', 'actual', 1], ['2026-10-06', '2026-10-06', 'actual', 2]], { kind: 'decision', category: 'terminal' });
      const ds = buildScene([d], [], O, greedy, straight).draws.filter((x) => x.kind === 'diamond') as any[];
      expect(ds).toHaveLength(2);
      expect(ds[1].key).toBe('GN-D ↺2');
      const open = buildScene([ent('E', [['2026-10-01', '2026-10-03', 'actual']], { kind: 'decision', category: 'active' })], [], O, greedy, straight).draws.find((x) => x.kind === 'diamond') as any;
      expect(open.mark).toBe('active');
    });
  });
  describe('29.331 Not taken', () => {
    const nt = { kind: 'not-taken' as const, decisionTicketId: 'D', outcome: 'No', pass: 2 };
    it('29.331 worked: notTaken style, chip and tooltip, in a row; never started: a 6 px stub at the close day that holds its day; control: no resolution, done style, no chip', () => {
      const worked = ent('W', [['2026-10-01', '2026-10-02', 'actual', 2]], { resolution: nt, category: 'terminal' });
      const stubbed = ent('S', [['2026-10-02', '2026-10-02', 'stub' as never, 2]], { resolution: nt, category: 'terminal' });
      const rival = ent('R', [['2026-10-02', '2026-10-03', 'planned']]);
      const s = buildScene([worked, stubbed, rival], [], O, greedy, straight);
      const bar = s.draws.find((d) => d.kind === 'bar' && (d as any).ticketId === 'W') as any;
      expect([bar.style, bar.chip, bar.mark]).toEqual(['notTaken', 'Not taken (pass 2)', null]);
      expect(bar.tooltip).toBe('GN-W ↺2 Title W, 1 Oct to 2 Oct, Not taken (pass 2)');
      expect(s.rowOf.has('W')).toBe(true); // in the packing union
      const stub = s.draws.find((d) => d.kind === 'stub') as any;
      expect(stub.b.x1 - stub.b.x0).toBe(6);
      expect(stub.tooltip).toBe('GN-S Title S: Not taken, 2 Oct');
      expect(s.rowOf.get('S')).not.toBe(s.rowOf.get('R')); // the stub's day is occupied: the overlapping rival takes another row
      const free = buildScene([ent('F', [['2026-10-01', '2026-10-02', 'actual']], { category: 'terminal' })], [], O, greedy, straight).draws.find((d) => d.kind === 'bar') as any;
      expect([free.style, free.chip, free.tooltip ?? null]).toEqual(['done', null, null]); // control
    });
    it('29.331 with the toggle ON a pruned never-started ticket shows its ghost instead of the stub, and no live row moves', () => {
      const pruned = ent('P', [['2026-10-02', '2026-10-02', 'stub' as never, 1], ['2026-10-05', '2026-10-06', 'ghost' as never, 1]], { resolution: { ...nt, pass: 1 } });
      const live = ent('L', [['2026-10-05', '2026-10-07', 'planned']]);
      const off = buildScene([live, pruned], [], { ...O, plannedVsActual: false }, greedy, straight);
      const on = buildScene([live, pruned], [], { ...O, plannedVsActual: true }, greedy, straight);
      expect(off.draws.some((d) => d.kind === 'stub')).toBe(true);
      expect(on.draws.some((d) => d.kind === 'stub')).toBe(false);
      const ghost = on.draws.find((d) => d.kind === 'bar' && (d as any).style === 'ghost') as any;
      expect(ghost.tooltip).toBe('Not taken');
      expect([...on.rowOf]).toEqual([...off.rowOf]); // the stub's day stays in the union either way
    });
  });
  describe('29.332 ghosts', () => {
    const live = ent('L', [['2026-10-05', '2026-10-07', 'planned']]);
    const pruned = ent('P', [['2026-10-05', '2026-10-07', 'ghost' as never]], { resolution: { kind: 'not-taken', decisionTicketId: 'D', outcome: 'No', pass: 1 } });
    it('29.332 strip only with the toggle ON; no live row moves; ghosts have no anchors; control: a lane without ghosts has no strip', () => {
      const off = buildScene([live, pruned], [], { ...O, plannedVsActual: false }, greedy, straight);
      const on = buildScene([live, pruned], [], { ...O, plannedVsActual: true }, greedy, straight);
      expect(off.draws.some((d) => d.kind === 'strip')).toBe(false);
      const strip = on.draws.find((d) => d.kind === 'strip') as any;
      expect(strip.text).toBe('Pruned');
      expect([...on.rowOf]).toEqual([...off.rowOf]);
      const ghost = on.draws.find((d) => d.kind === 'bar' && (d as any).style === 'ghost') as any;
      expect(ghost.chip).toBe('pruned');
      expect(ghost.b.y0).toBeGreaterThan(strip.b.y0);
      expect(on.anchors.has('P')).toBe(false);
      const clean = buildScene([live], [], { ...O, plannedVsActual: true }, greedy, straight);
      expect(clean.draws.some((d) => d.kind === 'strip')).toBe(false);
    });
  });
  describe('29.334 the pin', () => {
    it('29.334 inside on a wide bar, after the key (+14) on a short one, text and a11y; control: no counts, no pin', () => {
      const wide = ent('W', [['2026-10-05', '2026-10-09', 'planned']], { pin: { notes: 2, attachments: 1 } });
      const short = ent('S', [['2026-10-12', '2026-10-12', 'planned']], { pin: { notes: 1, attachments: 0 } });
      const none = ent('N', [['2026-10-12', '2026-10-13', 'planned']]);
      const s = buildScene([wide, short, none], [], O, greedy, straight);
      const b = (id: string) => s.draws.find((d) => d.kind === 'bar' && (d as any).ticketId === id) as any;
      expect([b('W').pinAt, b('S').pinAt, b('N').pin]).toEqual(['inside', 'after-key', null]);
      expect(b('S').labelPx).toBe(78);
      expect(b('W').ariaLabel).toContain('2 notes, 1 attachment');
      expect(b('S').ariaLabel).toContain('1 note');
    });
  });
  ```
  (`TODAY_PLUS5` in the 29.327 fixture is `'2026-10-08'`; write the literal. The `'ghost' as never` casts stand for the segment `type`; use the real `TimelineSegment` type in the lane's version.) The 29.329 per-pass test in `scene.test.ts`: with the toggle ON, a reopened ticket's pass-1 and pass-2 planned segments draw with `passRank` 0 and 1 and `z` below the actual bars; OFF only the current pass's planned outline draws (29.316 already pins the table; this pins the rank). The 29.327 gap-sharing real-`pack` case goes in `scene-real-router.test.ts`: ticket P (two periods with a 6-day gap) and Q inside the gap share row 0. The 29.328 and 29.333 sentence cases are Step 2's. Run: FAIL then PASS; flip 29.327–29.334 as they pass. Commit.

- [ ] **Step 4: Real geometry for the pin, the connector and the strip (29.334, 29.332)**

  Extend `apps/web/e2e-stack/timeline-graph.spec.ts` (T5): seed a flow with a reopened ticket (two periods), a Decision with a revision, a ticket with a note and an attachment and a pruned branch. Measure and assert with `boundingBox()` on the primary dev stack: the pin is 12 x 12 and its right edge is 6 px (±1) inside the bar's right edge; on a one-day bar at Week zoom it sits to the right of the key; the connector's `y` is the bars' mid-height ±1; with the toggle ON the strip appears below the last live row and `boundingBox()` of every live bar is unchanged (compare before and after); the ghost label reads `pruned`. Print `tlg-passes <numbers> machine <platform/arch>` and quote it LOCAL. Commit.

- [ ] **Step 5: Mutations, Features, DONE**

  Mutations: (1) drop the `↺` suffix → 29.327; (2) omit the open period's arrow → 29.328; (3) cap 9 → 29.329; (4) draw only the last diamond → 29.330; (5) chip from the wrong pass → 29.331; (5a) draw a worked Not-taken bar in the done style → 29.331; (5b) drop the stub branch → 29.331; (5c) draw the stub even when its ghost is shown → 29.331 (toggle case); (6) ghosts in the pack footprint → 29.332; (7) mark every Decision with passes → 29.333; (8) 12 px → 14 px pin → 29.334 (browser). Run `packages/domain`, `packages/app-core`, `packages/ui`, `apps/web` suites WHOLE (domain change: the mobile editor bundle is not affected, since no event or registry entry changed; say so). Features bullet under `<!-- WTG4 bullet T6 -->`: *"Periods, passes and ghosts on the timeline (✅): reopened tickets draw each work period joined by a dashed connector (`GN-143 ↺2`), Decisions draw a diamond per closed period with a `revised` mark, Not-taken tickets keep their work as muted, dashed bars with a `Not taken (pass n)` chip and a never-started one is a 6 px stub at its close day (both in the packing union; legend `Not taken, after its work` / `Not taken, never started`), pruned branches appear as ghosts in a Pruned strip with the toggle on (standing in for a pruned ticket's stub), and tickets with notes or attachments carry a paper pin. `packages/app-core/src/timeline-graph/scene.ts`."*

  Commit; DONE.

---
### Task 7: Home's one scope, numbers and Timeline (cases 29.335–29.349)

**Blocked until KG E T1 (Home, `apps/server/src/routes/home.ts`) lands on `release/knowledge-graph`.** (Planner ruling P7, 2026-10-03: no origin ref carries it yet. Check `git ls-tree origin/release/knowledge-graph apps/server/src/routes/home.ts` first; if it prints nothing, STOP with `NEEDS: KG E T1`.)

**Branch** `task/wtg4-home-timeline`. **UI task: invoke `frontend-design` in the lane prompt.** **NEEDS:** browser. Depends on T6 and on the KG release's Home (KG Home T1–T4) being on the branch.

**Files:**
- Create (all `apps/web/src/home/`):
  - `home-scope.ts`, `home-scope-bar.tsx`, `use-home-summary.ts`, `home-timeline.tsx`, `home-timeline-note.ts`
  - tests in `apps/web/test/`: `home-scope.test.ts`, `home-scope-bar.test.tsx`, `home-summary.test.tsx`, `home-timeline.test.tsx`, `home-body-scope.test.tsx`
  - `apps/web/e2e-stack/home-timeline.spec.ts`
- Modify:
  - `apps/web/src/home/{home-screen,home-numbers,home-copy,use-home-highlight,home-graph}.tsx|ts` (KG Home T2–T4)
  - `apps/web/app/globals.css` (`/* WTG4 T7 */`)
  - `packages/app-core/src/timeline-graph/{timeline-graph,painter,geometry}.ts(x)` (glide, window callbacks, dim kind)
  - `test-cases/27-knowledge-graph.md` (amend or 🚫 the 27.6xx cases the Step 0 table lists; never renumber)
  - `docs/manual.md` (the Home section), `Features.md` §24 (the Home bullets that say single-workspace) and §26 (`<!-- WTG4 bullet T7 -->`), `test-cases/29-workflow-timeline-graphs.md` (`<!-- WTG4 T7 -->`)

**Interfaces:**
- **Consumes:** T4's `useTimelineScope`, `subscribeScope`, `ScopeArg`, `scopeQuery`, `DataSource.query.getHomeSummary`; T5/T6's `TimelineGraph`, `SceneEntry`, `SceneLane`, `COPY`, `dayLabel`, `passTooltip`, `revisedSentence`, `revisionOf`; KG Home's `HomeScreen`, `HomeBody`, `HomeNumbers`, `HOME_NUMBERS`, `dueSoonLabel`, `useHomeHighlight`, `HomeGraph`, `homeNodeIds`, `highlightNote`; `useMyWorkspaces` (`apps/web/src/use-my-workspaces.ts:96`; it returns `{ rows, error, reload }`, `rows: WorkspaceRef[] | null`, and a `WorkspaceRef` carries `projects: ProjectRef[]`, `view-types.ts:172-221`) and `useIsPhone` (web); `useIstToday` (T4); `SegmentedControl variant="radio"` (T5).
- **Produces:**
  - `HomeScope = { workspaceIds: string[]; projectIds: string[]; start: 'me' | 'everyone'; view: 'knowledge' | 'timeline' }`, `defaultScope`, `readScope`, `writeScope`, `toScopeArg`, `dueSoonDaysOf(map): number | null`;
  - `HomeScopeBar`, `ScopeMultiSelect`;
  - `useHomeSummary(source, scope, debounceMs?): { summary; empty; failed; reload }`;
  - `HomeNumbersData = { counts; ids; dueSoonDays: number | null }` and `toNumbersData(summary)`;
  - `HomeTimeline` props `{ source; scope: ScopeArg; summary; pressed: HomeNumberKey | null; workspaces: WorkspaceRef[]; today; orientation; onOpenTicket }`;
  - nothing new in app-core's stream layer: `subscribeScope` and `ScopeFeed` are T4's (`timeline-graph/scope-feed.ts`).

- [ ] **Step 0: Pre-flight, the extraction, the amendment table**

  1. Cut the branch; build. Re-read the landed KG Home files: `HomeBody` (`home-screen.tsx`), `HomeNumbers`, `home-copy.ts`, `use-home-highlight.ts`, `home-graph.tsx`, and `KnowledgeGraph`'s landed props (`grep -n "export type KnowledgeGraphProps" -A40 packages/knowledge-graph/src`). Write their signatures into `HANDOFF-wtg4-home-timeline.md`.
  2. **Confirm T4's feed.** `subscribeScope(source, workspaceIds, getAsOf, onFrame): ScopeFeed` and `ScopeFeed.missedSince` were written by T4 for this reuse (D-W4-23): `grep -n "export" packages/app-core/src/timeline-graph/scope-feed.ts packages/app-core/src/timeline-graph/index.ts`. If `index.ts` does not export `subscribeScope`, `classifyEvent`, `scopeKey`, `ScopeArg` and `ScopeFeed`, add them (a one-line change, stated in the handoff). T4's tests run unchanged.
  3. **The amendment table.** `grep -n "27\.6[3-5][0-9]" test-cases/27-knowledge-graph.md` and write, for each case on Home's numbers and graph, one of: **amend** (the sentence is rewritten and its test updated, same id, stays ✅), **🚫** (the behaviour no longer exists; a one-line reason), or **keep**. The rules: a case that names the `Start from` options `This workspace | Me` becomes `Me | Everyone` and the default flips to Me; a case whose numbers come from `getHome` reads `getHomeSummary` over the one-workspace Everyone scope (equal by 29.306); a case that fixes the default numbers as the whole workspace's is amended because the default is now Me; the Esc, highlight, note, "N not drawn" and glide-free Knowledge cases are kept. No id is renumbered or reused.

- [ ] **Step 1: The scope state, test first (29.335)**

  Case lines under `<!-- WTG4 T7 -->`:
  - `- ❌ **29.335 — Home has ONE scope bar:** `Workspaces` (multi-select, default the current workspace), `Projects` (multi-select, default all of the selected workspaces' projects), `Start from` (a labelled radio group, `Me` | `Everyone`, default Me) and, below the numbers, `Home views` (a radio group, `Knowledge` | `Timeline`); everything is remembered per browser; storage that throws gives the defaults and a write that does not throw; a stored workspace the viewer no longer belongs to is dropped and an empty result falls back to the current workspace; at least one workspace stays selected; selecting every project stores "all projects"; a project of an unselected workspace is dropped. The stored scope is read only once the roster is known, and the first render never writes: with the roster still loading, storage keeps the stored two-workspace scope (no `setItem`), and when the roster arrives that scope is what the bar and the requests use; control: only the person's own change writes. Mutation: keep a stale workspace id → the drop assertion reds.`
  - `- ❌ **29.336 — the numbers count the whole scope and only the scope:** the six numbers come from ONE `getHomeSummary(scope)` per scope and per live refetch; panning, scrolling and zooming the timeline never call it; changing Start from, a workspace or a project calls it once; a one-workspace Everyone scope renders the same six numbers as spec E's Home for the same data. Mutation: refetch the summary on window loads → the call-count assertion reds.`
  - `- ❌ **29.337 — the Due label:** `Due in N days` when every workspace in scope has the same N (`Due today` for 0, `Due in 1 day` for 1), else `Due soon`; control: a one-workspace scope reads exactly as spec E.`
  - `- ❌ **29.338 — Me is assigned OR collaborating, and narrows tickets only (Review Focus 2):** with Me, a ticket the viewer only collaborates on is in Tickets, Open and the timeline's lanes; Members and Notes are unchanged by Me; Everyone adds the other tickets. Mutation: Me as assignee only → the collaborator assertion reds.`
  - `- ❌ **29.339 — mixed windows (Review Focus 5):** two workspaces with `dueSoonDays` 7 and 0 read `Due soon`, never `Due today` and never `Due in 7 days`; with both 0 it reads `Due today`.`

  `home-scope.ts`:
  ```ts
  import type { ScopeArg } from '@gisik-nokma/app-core/timeline-graph';

  export type StartFrom = 'me' | 'everyone';
  export type HomeView = 'knowledge' | 'timeline';
  export type HomeScope = { workspaceIds: string[]; projectIds: string[]; start: StartFrom; view: HomeView };
  export type KnownWorkspace = { id: string; projects: readonly { id: string }[] };

  const KEY = 'gn.home.scope.v1';
  type StorageLike = { getItem(k: string): string | null; setItem(k: string, v: string): void };
  const store = (): StorageLike | null => { try { return globalThis.localStorage ?? null; } catch { return null; } };

  export const defaultScope = (currentWorkspaceId: string): HomeScope => ({ workspaceIds: [currentWorkspaceId], projectIds: [], start: 'me', view: 'knowledge' });

  /** The remembered scope, repaired against what the viewer can still reach (a revoked workspace, a deleted project). Never throws. */
  export function readScope(current: string, known: readonly KnownWorkspace[], storage: StorageLike | null = store()): HomeScope {
    const fallback = defaultScope(current);
    try {
      const raw = storage?.getItem(KEY);
      if (raw === null || raw === undefined) return fallback;
      const o = JSON.parse(raw) as Partial<HomeScope>;
      const ids = new Set(known.map((k) => k.id));
      const workspaceIds = (Array.isArray(o.workspaceIds) ? o.workspaceIds : []).filter((w): w is string => typeof w === 'string' && ids.has(w));
      if (workspaceIds.length === 0) return { ...fallback, start: o.start === 'everyone' ? 'everyone' : 'me', view: o.view === 'timeline' ? 'timeline' : 'knowledge' };
      const projects = new Set(known.filter((k) => workspaceIds.includes(k.id)).flatMap((k) => k.projects.map((p) => p.id)));
      const projectIds = (Array.isArray(o.projectIds) ? o.projectIds : []).filter((p): p is string => typeof p === 'string' && projects.has(p));
      return { workspaceIds, projectIds, start: o.start === 'everyone' ? 'everyone' : 'me', view: o.view === 'timeline' ? 'timeline' : 'knowledge' };
    } catch { return fallback; }
  }
  export function writeScope(scope: HomeScope, storage: StorageLike | null = store()): void {
    try { storage?.setItem(KEY, JSON.stringify(scope)); } catch { /* blocked store: the scope lasts for this page only */ }
  }
  export const toScopeArg = (s: HomeScope): ScopeArg => ({ workspaceIds: s.workspaceIds, projectIds: s.projectIds, mine: s.start === 'me' });

  /** HM-2: one N when every workspace has the same window, else null (the label reads "Due soon"). */
  export function dueSoonDaysOf(map: Readonly<Record<string, number>>): number | null {
    const v = Object.values(map);
    return v.length > 0 && v.every((n) => n === v[0]) ? (v[0] as number) : null;
  }
  ```
  `home-scope.test.ts`: defaults; a round trip; a storage whose `getItem`/`setItem` throw gives the default and `writeScope` does not throw; an unknown workspace id is dropped, an all-unknown scope falls back to `current` but keeps `start` and `view`; garbage enums give defaults; a project of an unselected workspace is dropped (29.335). `dueSoonDaysOf({a:7,b:7}) === 7`, `{a:7,b:0} === null`, `{a:0} === 0`, `{} === null` (29.337, 29.339). Run: FAIL then PASS. Commit.

- [ ] **Step 2: The scope bar (29.335)**

  `home-scope-bar.tsx`:
  ```tsx
  'use client';
  import { useEffect, useRef, useState, type ReactElement } from 'react';
  import type { WorkspaceRef } from '@gisik-nokma/app-core';
  import { SegmentedControl } from '@gisik-nokma/ui';
  import type { HomeScope, StartFrom } from './home-scope.js';

  type Option = { value: string; label: string };

  /** A disclosure of checkboxes. Escape closes it and is marked handled, so the number highlight does not clear on the same key. */
  export function ScopeMultiSelect(p: { label: string; options: readonly Option[]; value: readonly string[]; allLabel: string; minOne?: boolean; onChange: (v: string[]) => void }): ReactElement {
    const [open, setOpen] = useState(false);
    const root = useRef<HTMLDivElement | null>(null);
    useEffect(() => {
      if (!open) return undefined;
      const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') { e.preventDefault(); setOpen(false); } };
      const onDown = (e: MouseEvent): void => { if (root.current !== null && !root.current.contains(e.target as Node)) setOpen(false); };
      window.addEventListener('keydown', onKey);
      window.addEventListener('mousedown', onDown);
      return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('mousedown', onDown); };
    }, [open]);
    const all = p.value.length === 0 || p.value.length === p.options.length;
    const summary = all ? p.allLabel : p.value.length === 1 ? (p.options.find((o) => o.value === p.value[0])?.label ?? p.allLabel) : `${p.value.length} selected`;
    const toggle = (v: string): void => {
      const on = p.value.includes(v) || (p.value.length === 0 && !p.minOne);
      const base = p.value.length === 0 && !p.minOne ? p.options.map((o) => o.value) : [...p.value];
      const next = on ? base.filter((x) => x !== v) : [...base, v];
      if (p.minOne === true && next.length === 0) return; // at least one workspace stays selected
      p.onChange(next.length === p.options.length && p.minOne !== true ? [] : next);
    };
    return (
      <div className="gn-home__multi" ref={root}>
        <button type="button" className="gn-home__multi-btn" aria-haspopup="true" aria-expanded={open} onClick={() => setOpen(!open)}>
          <span className="gn-home__multi-label">{p.label}</span> <span className="gn-home__multi-value">{summary}</span>
        </button>
        {open && (
          <div className="gn-home__multi-panel" role="group" aria-label={p.label}>
            {p.options.map((o) => {
              const checked = p.value.length === 0 && !p.minOne ? true : p.value.includes(o.value);
              return <label key={o.value} className="gn-home__multi-row"><input type="checkbox" checked={checked} onChange={() => toggle(o.value)} /> {o.label}</label>;
            })}
          </div>
        )}
      </div>
    );
  }

  export function HomeScopeBar(p: { workspaces: readonly WorkspaceRef[]; scope: HomeScope; onChange: (s: HomeScope) => void }): ReactElement {
    const picked = p.workspaces.filter((w) => p.scope.workspaceIds.includes(w.id));
    const many = picked.length > 1;
    const projectOptions: Option[] = picked.flatMap((w) => w.projects.filter((pr) => !pr.archived).map((pr) => ({ value: pr.id, label: many ? `${w.name} / ${pr.name}` : pr.name })));
    return (
      <div className="gn-home__scope" aria-label="Home scope" role="group">
        <ScopeMultiSelect
          label="Workspaces" minOne allLabel="All" value={p.scope.workspaceIds} options={p.workspaces.map((w) => ({ value: w.id, label: w.name }))}
          onChange={(ids) => p.onChange({ ...p.scope, workspaceIds: ids, projectIds: [] })}
        />
        <ScopeMultiSelect label="Projects" allLabel="All" value={p.scope.projectIds} options={projectOptions} onChange={(ids) => p.onChange({ ...p.scope, projectIds: ids })} />
        <SegmentedControl<StartFrom>
          variant="radio" aria-label="Start from" value={p.scope.start} onChange={(start) => p.onChange({ ...p.scope, start })}
          options={[{ value: 'me', label: 'Me' }, { value: 'everyone', label: 'Everyone' }]}
        />
      </div>
    );
  }
  ```
  The visible label `Start from` sits beside the group in the layout (`<span id>` + `aria-labelledby` is the alternative; the radiogroup's `aria-label` is the exact string either way). Archived projects are not offered but remain in the numbers (D-W4-7). `home-scope-bar.test.tsx` (jsdom): the exact option names; Me | Everyone default Me; the multi-selects open, check and close with Escape and that Escape's `defaultPrevented` is true (so the highlight listener skips it); unchecking the last workspace is ignored (control: unchecking one of two works); choosing every project emits `[]`; changing the workspaces resets the projects; with two workspaces the project labels are prefixed by the workspace name. Commit.

- [ ] **Step 3: The summary hook and the numbers (29.336–29.339)**

  `use-home-summary.ts`:
  ```ts
  import { useCallback, useEffect, useRef, useState } from 'react';
  import type { HomeSummaryResponse } from '@gisik-nokma/domain';
  import type { DataSource } from '@gisik-nokma/app-core';
  import { subscribeScope, scopeKey, classifyEvent, type ScopeArg, type ScopeFeed } from '@gisik-nokma/app-core/timeline-graph';

  /**
   * The six numbers of the scope. Live like the timeline: `subscribeScope` gates every event against the answer's `asOf` (D-W4-23), so a cursor-0
   * replay or a late-joined room costs nothing, and news that arrives before the first answer but is newer than it costs exactly one refetch.
   */
  export function useHomeSummary(source: DataSource, scope: ScopeArg, debounceMs = 400): { summary: HomeSummaryResponse | null; empty: boolean; failed: boolean; reload: () => void } {
    const [summary, setSummary] = useState<HomeSummaryResponse | null>(null);
    const [empty, setEmpty] = useState(false);
    const [failed, setFailed] = useState(false);
    const scopeRef = useRef(scope);
    scopeRef.current = scope;
    const issued = useRef(0);
    const asOfRef = useRef<Readonly<Record<string, number>> | null>(null);
    const feed = useRef<ScopeFeed | null>(null);
    const scheduleRef = useRef<() => void>(() => undefined);
    const key = scopeKey(scope);
    const reload = useCallback(() => {
      const mine = (issued.current += 1);
      source.query.getHomeSummary(scopeRef.current).then(
        (r) => {
          if (mine !== issued.current) return;
          setFailed(false); setEmpty(r === null); setSummary(r);
          asOfRef.current = r === null ? {} : r.asOf; // nothing readable: no workspace's events matter
          if (r !== null && feed.current?.missedSince(r.asOf) === true) scheduleRef.current();
        },
        () => { if (mine === issued.current) setFailed(true); }, // the last good numbers (and their asOf) stay
      );
    }, [source]);
    useEffect(() => {
      let timer: ReturnType<typeof setTimeout> | null = null;
      asOfRef.current = null; // a new scope holds no answer yet
      const schedule = (): void => {
        if (timer !== null) return;
        timer = setTimeout(() => { timer = null; reload(); }, debounceMs);
      };
      scheduleRef.current = schedule;
      const f = subscribeScope(source, scope.workspaceIds, () => asOfRef.current, (frame) => {
        if (frame.type === 'event' && classifyEvent(frame.envelope.type) === 'ignore') return;
        schedule();
      });
      feed.current = f;
      return () => { if (timer !== null) clearTimeout(timer); f.stop(); feed.current = null; scheduleRef.current = () => undefined; };
    }, [source, key, reload, debounceMs]); // eslint-disable-line react-hooks/exhaustive-deps
    useEffect(() => { reload(); }, [key, reload]); // after the subscription effect: the join precedes the read
    return { summary, empty, failed, reload };
  }
  ```
  `home-copy.ts` changes: `dueSoonLabel(n: number | null): string` returns `Due soon` for `null`, else the old strings; `HOME_NUMBERS[i].label` and `.noun` take `number | null`; `toNumbersData`:
  ```ts
  export type HomeNumbersData = Pick<HomeResponse, 'counts' | 'ids'> & { dueSoonDays: number | null };
  export const toNumbersData = (s: HomeSummaryResponse): HomeNumbersData => ({ counts: s.counts, ids: s.ids, dueSoonDays: dueSoonDaysOf(s.dueSoonDays) });
  ```
  `HomeNumbers` and `useHomeHighlight` take `HomeNumbersData` where they took `HomeResponse` (a `HomeResponse` is assignable: `dueSoonDays` number); `HomeNumbers`'s failed-load fallback label stays `Due soon` (KG Home's rule for "never answered"). KG Home's own cases for these components keep passing with a `HomeResponse` argument (run them unedited first; they are the proof the widening broke nothing).

  Tests (`home-summary.test.tsx`, `home-numbers` additions): the hook calls `getHomeSummary` once per scope key (a rerender with a re-spelled but equal scope does not refetch); a `ticket.transitioned` whose `workspaceSeq` is above the answer's `asOf` schedules ONE refetch and one at or below it none (the fake never sends `caught-up`); an event newer than the first answer's `asOf` that arrived before that answer causes one refetch after it; an `ignore` event (`comment.added`) none; a rejection keeps the last numbers and sets `failed` (29.336). The label cases of 29.337 and 29.339 render `HomeNumbers` with `dueSoonDays: 7`, `0`, `1`, `null`. The 29.338 case renders `HomeBody` with a fake source whose `getHomeSummary` records its argument: Me → `mine: true`, flipping to Everyone → `mine: false` and the numbers change; Members and Notes are the same in both answers because the fake serves them so (the server half is 29.306); the collaborator-only ticket appears in the Me timeline lanes (Step 4). Commit.

- [ ] **Step 4: Home's Timeline (29.340–29.346)**

  Case lines:
  - `- ❌ **29.340 — a number lights its tickets on the timeline:** pressing Tickets, Open, Past due or Due soon dims every other bar to 25% and every edge to 12% (`data-dim-kind="lit"`); pressing the lit number, another number or Escape clears; Escape closes an open multi-select before it clears the highlight; control: nothing pressed, nothing dims. Mutation: dim at 32% → the opacity assertion reds.`
  - `- ❌ **29.341 — the glide, and the empty lit set (Review Focus 4):** pressing a number glides the timeline to the EARLIEST start of the lit tickets that are drawn; when none of them is drawn (all undated, or out of the index) the surface does not move, the note reads `None are drawn on the timeline.` and Escape still clears; Members and Notes light nothing on the timeline and the note says so; control: one drawn lit ticket glides to its start. Mutation: glide to the last lit ticket → the earliest assertion reds.`
  - `- ❌ **29.342 — the note counts what is not drawn:** the note reads `3 tickets, lit up on the timeline. 12 not drawn.` where `12` is the number's count minus the lit ids that have a bar; an id in `summary.ids` that is not in the index is counted in `not drawn`; with nothing missing the sentence has no second clause.`
  - `- ❌ **29.343 — lanes (measured):** one lane per project (prefixed with the workspace name when several workspaces are picked), a 34 px heading, 40 px row pitch, 24 px per day at the default Week zoom, 28 px bars; only the primitives near the view are mounted (<= 1,200 on a desktop window); the page does not scroll when the canvas is panned. Quoted LOCAL with the measured numbers.`
  - `- ❌ **29.344 — arrows for the selected flow only:** with nothing selected no arrow is drawn; selecting a bar draws its flow's arrows and dims the other bars to 32% (`data-dim-kind="flow"`); selecting another bar swaps; no arrow crosses workspaces; control: a singleton bar draws no arrows. Mutation: draw all flows' arrows → the count reds.`
  - `- ❌ **29.345 — phones:** portrait, one lane per project as a column of 112 px, time down, horizontal pan across lanes, the numbers 3-up, the view switch reachable without scrolling past the graph; page `scrollY` unchanged after pans.`
  - `- ❌ **29.346 — states:** loading is a skeleton of lane headings and ghost bars (no layout shift: the skeleton and the loaded graph have the same panel height); empty reads `Nothing scheduled in these projects` with the tray count; an error reads `Couldn't load the timeline.` with `Retry` and keeps what is drawn; a cut index shows `Older work isn't drawn: N items before 3 Mar`; with no bar in view a pill `Nothing in view` offers `Jump to the next bar` and `Jump to the previous bar`, which glide. Mutation: drop the error banner's Retry → the control reds.`

  `home-timeline-note.ts`:
  ```ts
  import type { HomeNumberKey } from '@gisik-nokma/domain';
  import { HOME_NUMBERS } from './home-copy.js';

  export function timelineNote(a: { key: HomeNumberKey; total: number; lit: number; dueSoonDays: number | null }): string {
    const spec = HOME_NUMBERS.find((n) => n.key === a.key);
    if (spec === undefined) return '';
    if (a.key === 'members' || a.key === 'notes') return `${a.key === 'members' ? 'Members' : 'Notes'} are not drawn on the timeline.`;
    if (a.total === 0) return '';
    if (a.lit === 0) return 'None are drawn on the timeline.';
    const head = `${a.lit} ${spec.noun(a.lit, a.dueSoonDays)}, lit up on the timeline.`;
    return a.total - a.lit > 0 ? `${head} ${a.total - a.lit} not drawn.` : head;
  }
  ```
  `home-timeline.tsx`:
  ```tsx
  'use client';
  import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
  import { analyzeFlow, edgeKey, type HomeNumberKey, type HomeSummaryResponse, type TimelineEntry, type TimelineFlow } from '@gisik-nokma/domain';
  import type { DataSource, WorkspaceRef } from '@gisik-nokma/app-core';
  import { COPY, TimelineGraph, dayLabel, useTimelineScope, type SceneEdge, type SceneEntry, type SceneLane, type ScopeArg } from '@gisik-nokma/app-core/timeline-graph';
  import { Button, Skeleton, SkeletonRegion } from '@gisik-nokma/ui';
  import { timelineNote } from './home-timeline-note.js';

  const TICKET_KEYS: readonly HomeNumberKey[] = ['tickets', 'open', 'pastDue', 'dueSoon'];
  const earliest = (e: TimelineEntry): string | null => e.segments.filter((s) => s.type !== 'ghost').map((s) => s.start).sort()[0] ?? null;

  /** Every non-truncated flow's edges; the ones Part 2's analysis marks as back edges are the loops (TG-12). */
  function edgesOf(flows: readonly TimelineFlow[]): SceneEdge[] {
    return flows.filter((f) => !f.truncated).flatMap((f) => {
      const back = analyzeFlow(f.nodes, f.edges.filter((e) => e.kind === 'leads_to').map(({ from, to, label }) => ({ sourceId: from, targetId: to, label }))).backEdges;
      return f.edges.map((e) => ({ from: e.from, to: e.to, kind: e.kind, label: e.label, loop: back.has(edgeKey({ sourceId: e.from, targetId: e.to })), taken: null }));
    });
  }

  export type HomeTimelineProps = {
    source: DataSource; scope: ScopeArg; summary: HomeSummaryResponse | null; pressed: HomeNumberKey | null; dueSoonDays: number | null;
    workspaces: readonly WorkspaceRef[]; today: string; orientation: 'landscape' | 'portrait';
    onOpenTicket: (ticketId: string, workspaceId: string, field?: 'dates' | 'estimate') => void;
    /** The note under the numbers is rendered by the parent from this string. */
    onNote: (text: string) => void;
  };

  export function HomeTimeline(p: HomeTimelineProps): ReactElement {
    const t = useTimelineScope(p.source, p.scope);
    const [selected, setSelected] = useState<string | null>(null);
    const [visible, setVisible] = useState<{ from: string; to: string } | null>(null);
    const [glide, setGlide] = useState<{ day: string; nonce: number } | null>(null);
    const counter = useRef(0);
    const items = t.cache.items;

    const entries: SceneEntry[] = useMemo(() => items.map((e) => ({ ...e, title: t.cache.detail(e.id)?.title ?? null })), [items, t.version]); // eslint-disable-line react-hooks/exhaustive-deps
    const lanes: SceneLane[] = useMemo(() => {
      const many = p.scope.workspaceIds.length > 1;
      const used = new Set(items.map((e) => e.lane));
      return p.workspaces.filter((w) => p.scope.workspaceIds.includes(w.id)).flatMap((w) =>
        w.projects.filter((pr) => used.has(pr.id)).map((pr) => ({ id: pr.id, heading: many ? `${w.name} / ${pr.name}` : pr.name })));
    }, [items, p.workspaces, p.scope.workspaceIds]);

    const litTickets = useMemo(() => (p.pressed !== null && TICKET_KEYS.includes(p.pressed) && p.summary !== null ? new Set(p.summary.ids[p.pressed]) : null), [p.pressed, p.summary]);
    const drawnLit = useMemo(() => (litTickets === null ? [] : items.filter((e) => litTickets.has(e.id) && e.segments.some((s) => s.type !== 'ghost'))), [litTickets, items]);
    const total = p.pressed === null || p.summary === null ? 0 : (p.summary.counts[p.pressed] ?? 0);

    // The note follows the render; the glide follows the PRESS (a reload that re-renders must not re-scroll).
    const noteText = p.pressed === null ? '' : timelineNote({ key: p.pressed, total, lit: drawnLit.length, dueSoonDays: p.dueSoonDays });
    useEffect(() => { p.onNote(noteText); }, [noteText]); // eslint-disable-line react-hooks/exhaustive-deps
    const lastPressed = useRef<HomeNumberKey | null>(null);
    useEffect(() => {
      if (p.pressed === lastPressed.current) return;
      lastPressed.current = p.pressed;
      if (p.pressed === null || drawnLit.length === 0) return; // nothing drawn: the surface does not move
      const first = drawnLit.map(earliest).filter((d): d is string => d !== null).sort()[0];
      if (first !== undefined) setGlide({ day: first, nonce: ++counter.current });
    }, [p.pressed, drawnLit]);

    const flowOf = selected === null ? null : (items.find((e) => e.id === selected)?.flowId ?? null);
    const flowMembers = useMemo(() => (flowOf === null ? null : new Set(items.filter((e) => e.flowId === flowOf).map((e) => e.id))), [flowOf, items]);
    const lit = litTickets ?? flowMembers;
    const dimKind = litTickets !== null ? 'lit' : 'flow';

    const inView = visible === null || items.some((e) => e.segments.some((s) => s.type !== 'ghost' && s.start <= visible.to && s.end >= visible.from));
    const jump = (dir: 'next' | 'previous'): void => {
      if (visible === null) return;
      const days = items
        .flatMap((e) => e.segments.filter((s) => s.type !== 'ghost').map((s) => (dir === 'next' ? s.start : s.end)))
        .filter((d) => (dir === 'next' ? d > visible.to : d < visible.from))
        .sort();
      const day = dir === 'next' ? days[0] : days[days.length - 1];
      if (day !== undefined) setGlide({ day, nonce: ++counter.current });
    };

    if (t.status === 'loading' && items.length === 0) {
      return (
        <SkeletonRegion label="Loading the timeline" className="gn-home__tl-skeleton">
          {[0, 1, 2].map((l) => (
            <div key={l} className="gn-home__tl-skel-lane">
              <Skeleton width="8rem" height="34px" />
              {[0, 1, 2, 3].map((b) => <Skeleton key={b} width={`${3 + ((l + b) % 3)}rem`} height="28px" />)}
            </div>
          ))}
        </SkeletonRegion>
      );
    }
    if (t.status === 'empty' || (t.status === 'ready' && items.length === 0 && t.cache.trayCount === 0)) {
      return <p className="gn-home__tl-empty" role="status">{COPY.empty}{t.cache.trayCount > 0 ? ` (${t.cache.trayCount} not on the timeline yet)` : ''}</p>;
    }
    return (
      <div className="gn-home__tl">
        {t.status === 'error' && (
          <div className="gn-home__refusal" role="alert"><p>{COPY.error}</p><Button onClick={t.reload}>{COPY.retry}</Button></div>
        )}
        {t.cache.truncated !== null && <p className="gn-home__tl-cut">{`Older work isn't drawn: ${t.cache.truncated.dropped} items before ${dayLabel(t.cache.truncated.before)}`}</p>}
        {!inView && items.length > 0 && (
          <div className="gn-home__tl-pill" role="status">
            <span>Nothing in view</span>
            <Button onClick={() => jump('next')}>Jump to the next bar</Button>
            <Button onClick={() => jump('previous')}>Jump to the previous bar</Button>
          </div>
        )}
        <TimelineGraph
          entries={entries} edges={edgesOf(t.cache.flows)} tray={t.cache.trayItems} trayTotal={t.cache.trayCount} today={p.today} orientation={p.orientation}
          lanes={lanes} edgeScope={flowOf === null ? 'none' : { flowId: flowOf }} lit={lit} dimKind={dimKind}
          selectedId={selected} onSelect={(id) => setSelected((cur) => (cur === id ? null : id))}
          onOpenField={(id, field) => p.onOpenTicket(id, items.find((e) => e.id === id)?.workspaceId ?? '', field)}
          glideTo={glide} onVisibleDays={(from, to) => setVisible({ from, to })} onNeedWindow={t.loadWindow} onMoreTray={t.loadMoreTray}
          storageKey="gn.timeline.plannedVsActual"
        />
      </div>
    );
  }
  ```
  The skeleton uses KG Home's `Skeleton` and `SkeletonRegion` (`packages/ui`); a lane's skeleton height equals the loaded panel's (`.gn-tlg` is `height: 100%` in both), so there is no layout shift (29.346 measures it). `analyzeFlow`'s `backEdges` holds `edgeKey`s (`sourceId>targetId`, Part 2 plan :4027), and `edgesOf` builds each key with `edgeKey` itself, so the key form cannot drift.

  `TimelineGraph` (app-core, T5's file) gains the props `dimKind?: 'lit' | 'flow'` (forwarded to the painter as `data-dim-kind` on the canvas), `glideTo?: { day: string; nonce: number } | null` (an effect on `glideTo?.nonce` scrolls so that day sits a quarter of the viewport in, smoothly) and `onVisibleDays?: (from: string, to: string) => void`; its `onNeedWindow` is now called from an effect on `view` with the preloaded range: the visible range widened by one viewport each side (Part 1's `planRange` through `bridge.planWindow` if it exposes one; otherwise this fixed widening, stated in the handoff). `windowDays(view, ppd, originDay, orientation)` is a pure function in `geometry.ts` with its own test (a view of x 2400..3840 at 24 px/day from origin 2026-09-28 gives days 2027-01-06..2027-03-07... compute the expected values in the test from `addDays`). CSS: `.gn-tlg-canvas[data-dim-kind='lit'] [data-dim='true'] { opacity: 0.25 } .gn-tlg-canvas[data-dim-kind='lit'] .gn-tlg-edges [data-dim='true'] { opacity: 0.12 } .gn-tlg-canvas[data-dim-kind='flow'] [data-dim='true'] { opacity: 0.32 }` and drop T5's generic `[data-dim='true']` opacity rule.

  Tests (`home-timeline.test.tsx`, jsdom, a fake source serving an index with two projects, one flow A→B→C and one collaborator-only ticket): 29.340 dim kinds and values by reading the rendered attributes and the stylesheet rule text; pressing glides (the fake `bridge.scrollTo` records the target day = earliest lit start) and a second press of the same number clears; all lit ids undated → no scroll call and the note `None are drawn on the timeline.`; Members → note, no dimming; 29.342 note arithmetic with ids missing from the index; 29.343 lane headings and prefixes (with two workspaces) and `unused projects get no lane`; 29.344 edges only after a click on a flow member, none for a singleton, none across workspaces; 29.346 skeleton, empty text with the tray count, error banner with `Retry` calling `reload` and the graph still mounted, the cut note exactly `Older work isn't drawn: 4 items before 3 Mar`, the pill appears when the visible range has no bars and `Jump to the next bar` moves the glide target to the earliest later start; no element named Earlier/Later/Previous/Next. Commit.

- [ ] **Step 5: HomeBody, the Knowledge view under the scope, Escape order (29.340, 29.349)**

  `home-screen.tsx` (`HomeBody`): replace KG Home's single-workspace body with
  ```tsx
  function HomeBody({ workspaceId }: { workspaceId: string }) {
    const { dataSource } = useAppServices();
    const { rows: workspaces } = useMyWorkspaces(); // `rows`, not `workspaces`: null until the roster is known
    const today = useIstToday();
    const phone = useIsPhone();
    // The stored scope can only be repaired against the roster, so it is read when the roster arrives. Until then the default (the current
    // workspace, Me) is used and NOTHING is written: writing it would overwrite the person's stored two-workspace scope with the default.
    // Storage is written only by the person's own change.
    const [chosen, setChosen] = useState<HomeScope | null>(null);
    const stored = useMemo(() => (workspaces === null ? null : readScope(workspaceId, workspaces)), [workspaces, workspaceId]);
    const scope = chosen ?? stored ?? defaultScope(workspaceId);
    const setScope = useCallback((next: HomeScope) => { setChosen(next); writeScope(next); }, []);
    const arg = useMemo(() => toScopeArg(scope), [scope]);
    const { summary, failed, reload } = useHomeSummary(dataSource, arg);
    const numbers = summary === null ? null : toNumbersData(summary);
    const highlight = useHomeHighlight(numbers);
    const [tlNote, setTlNote] = useState('');
    const onEscape = () => { if (highlight.pressed === null) return false; highlight.clear(); return true; };
    return (
      <>
        <HomeScopeBar workspaces={workspaces ?? []} scope={scope} onChange={setScope} />
        <HomeNumbers home={numbers} failed={failed && numbers === null} onRetry={reload} pressed={highlight.pressed} onToggle={highlight.toggle} />
        <SegmentedControl<HomeView> variant="radio" aria-label="Home views" value={scope.view} onChange={(view) => setScope({ ...scope, view })}
          options={[{ value: 'knowledge', label: 'Knowledge' }, { value: 'timeline', label: 'Timeline' }]} />
        {scope.view === 'timeline'
          ? <HomeTimelineLazy source={dataSource} scope={arg} summary={summary} pressed={highlight.pressed} dueSoonDays={numbers?.dueSoonDays ?? null} workspaces={workspaces ?? []}
              today={today} orientation={phone ? 'portrait' : 'landscape'} onNote={setTlNote} onOpenTicket={openTicket} />
          : <HomeGraph workspaceId={scope.workspaceIds[0] ?? workspaceId} viewerId={viewerId} scope={scope} home={numbers} pressed={highlight.pressed} onEscape={onEscape} phone={phone} />}
        {scope.view === 'timeline' && <p className="gn-home__note" aria-live="polite">{tlNote}</p>}
      </>
    );
  }
  ```
  with `HomeTimelineLazy = dynamic(() => import('./home-timeline.js').then((m) => m.HomeTimeline), { ssr: false, loading: () => <div className="gn-home__tl-placeholder" aria-hidden="true" /> })` so a viewer who never opens Timeline downloads none of it (29.349 measures). `viewerId` and `openTicket` come from the same places KG Home's `HomeBody` already gets them (`useAppServices` / the router: `openTicket` navigates to the ticket's project route with `?ticket=<id>`; for a field, add `&focus=dates|estimate`, which the sheet reads: grep `focus` handling in the sheet host and reuse what exists). The empty state lives in `HomeTimeline`; a summary of `null` (nothing readable) leaves the numbers at their loading `–`, which KG Home's failed-load rules already cover.

  `home-graph.tsx`: remove its own `Start from` control (the scope bar owns it); its props become `{ workspaceId; viewerId; scope: HomeScope; home: HomeNumbersData | null; pressed; onEscape; phone }`; the centre is `scope.start === 'me' ? { kind: 'person', id: viewerId } : { kind: 'workspace', id: scope.workspaceIds[0] }` (D-W4-14) and the component passes `defaultWorkspaceIds={scope.workspaceIds}`. Re-run KG Home's `home-graph.test.tsx` and amend per the Step 0 table.

  Escape order, pinned in `home-body-scope.test.tsx` (29.340): open the Projects multi-select, press Escape → the panel closes and the highlight stays; press Escape again → the highlight clears; with focus on a tile, Escape clears it. Commit.

- [ ] **Step 6: The two Review Focus cases at screen level (29.347, 29.348)**

  Case lines:
  - `- ❌ **29.347 — a workspace that stops being readable while Home is open (Review Focus 3):** the next refresh drops it from the numbers, the lanes and the lit set with no error banner and nothing half-drawn; when nothing readable is left the screen shows the empty state; the stored scope keeps working next load because `readScope` drops the id.`
  - `- ❌ **29.348 — a live event in the SECOND workspace (Review Focus 1):** with workspaces A and B picked, finishing a ticket in B (a `ticket.transitioned` whose `workspaceSeq` is above B's `asOf`; the fake sends no `caught-up`) refreshes the summary within 400 ms plus the read, the lit set of a pressed number changes, and a successor's bar in B moves after the index refetch; control: the same event in A does the same.`

  `home-body-scope.test.tsx` (extend; first, the 29.335 roster case: render `HomeBody` with `useMyWorkspaces` mocked to `{ rows: null }` and a fake storage holding a two-workspace scope, assert the storage's `setItem` was never called and the first `getHomeSummary` used the default scope; then rerender with the roster, assert the bar shows both workspaces and the next request carries both; control: choosing `Everyone` calls `setItem` once): a fake source with two workspaces; frames pushed per workspace; assertions through the rendered note text, the bar x positions read from `data-draw-id` boxes (`style.left`) and the call counts of `getHomeSummary` / `getTimelineIndex`. For 29.347 the second answers omit B (`workspaceIds: [A]`, no B lanes, no `role=alert`), the third answers `null` (the empty state `Nothing scheduled in these projects`). Commit.

- [ ] **Step 7: Real geometry, the pan, and the first-load check on the primary dev stack (29.343, 29.345, 29.349)**

  Case line:
  - `- ❌ **29.349 — nothing else moved:** the Knowledge view's centre under the new scope is the person node for Me and the first selected workspace's node for Everyone (D-W4-14); the 27.6xx cases listed in the handoff table are amended or 🚫 in this commit; `docs/manual.md`'s Home section describes the one scope, the two views and the lit-number glide; prose that says Home is one workspace is rewritten (the sweep list is in the handoff); on routes that open no graph (`/my-work`, `/inbox`, the project routes) `next build`'s First Load JS is within 1 kB of the base tip. Quoted LOCAL.`

  `apps/web/e2e-stack/home-timeline.spec.ts` (copy the structure of a sibling in `e2e-stack/`; seed through the API in `beforeAll`: 2 workspaces, 3 projects each, 240 tickets with chained flows, a Decision with a loop, 6 undated; with `HOME_TIMELINE_PERF=1` seed 10,000 intervals over 12 lanes in batches of 100 events):
  - at `1440 x 900`: open `/`, choose Timeline; assert lane heading 34 px, the distance between two vertically adjacent bars of one lane is 40 px (±1), a one-day bar is 24 px wide at the default zoom, bars are 28 px; the panel's bottom edge is within 1 px of the viewport's bottom minus the page padding (it fills the height under the numbers) and the page's `scrollHeight` does not change when the graph loads; pan 10 viewports (a loop of `page.mouse.wheel` deltas on the canvas) while reading `data-mounted`: max <= 1,200 and never 0 when the scene has bars in view; `scrollY` unchanged;
  - press `Past due`: the canvas glides (the scroll position changes to the earliest lit start ± 1 day) and dimmed bars have computed `opacity` 0.25;
  - select a bar of a flow: `svg.gn-tlg-edges` appears with the flow's edge count; select a singleton: none;
  - at `390 x 844`: columns 112 px, numbers three per row, no horizontal page scroll, `scrollY` unchanged after a touch pan;
  - print `home-timeline <numbers> machine <platform/arch>` and quote it LOCAL.

  First-load JS: `pnpm turbo run build --filter=@gisik-nokma/web... > /tmp/wtg4-t7-build.log 2>&1; tail -60 /tmp/wtg4-t7-build.log` on the base tip (`git worktree` NOT needed: run it before the first T7 commit and save the route table to the handoff) and again on the branch; compare the rows for routes that open no graph. Commit.

- [ ] **Step 8: The prose sweep, the 27.6xx amendments, manual, mutations, Features, DONE**

  1. Sweep: `grep -rn "This workspace\|single-workspace\|one workspace's\|the workspace's numbers" apps/web/src/home apps/web/test docs/manual.md Features.md test-cases/27-knowledge-graph.md docs/superpowers/specs/2026-10-03-home-design.md` and rewrite each hit that is now false; the specs are not edited (they are the record), the code docblocks, `Features.md` §24, `docs/manual.md` and the cases are.
  2. Apply the Step 0 table to `test-cases/27-knowledge-graph.md` and the tests carrying those ids.
  3. Mutations: (1) keep a stale workspace id → 29.335; (2) refetch the summary on window loads → 29.336; (3) Me as assignee only (change the server clause locally) → 29.338, the T1 case also reds; (4) dim at 32% for lit → 29.340; (5) glide to the last lit start → 29.341; (6) count only lit ids in `ids` → 29.342; (7) draw all flows' edges → 29.344; (8) drop Retry → 29.346; (9) subscribe only the first workspace in `useHomeSummary` → 29.348.
  4. Run WHOLE: `apps/web`, `packages/app-core`, `packages/ui`, the KG Home cases (`home-*.test.tsx`), then the e2e-stack spec on the primary stack (the owner or `ctl rebuild` has the stack current; report the commit it served).
  5. Features: add under `<!-- WTG4 bullet T7 -->`: *"Home's one scope and Timeline (✅): Workspaces, Projects, Start from Me | Everyone and Home views Knowledge | Timeline drive both the six numbers and the graph; the Timeline lays every project's work in lanes, a pressed number lights its tickets and glides to the first, and a clicked bar shows its flow's arrows. `apps/web/src/home/`, `apps/server/src/timeline/read-summary.ts`."* Edit the §24 Home bullets from single-workspace to scope.

  Commit; DONE.

---

## Self-review

**Spec coverage (Part 4: §11–13).**
- TG-1 (one graph, same nodes and edges): T5 (`fromFlowRead` reads Part 3's `getFlow`; the inspector, create form and Publish banner are Part 3's and ride the Graph tab). TG-2 layout, today line, header labels: T5 `buildScene`, `TimelineGraph` (the axis labels are Part 1's, used through `bridge`). TG-3 table, toggle, persistence: T5 29.316. TG-4 chaining: T5 29.315 (and T4 re-plan). TG-5 edge routing: T5 29.320 through Part 1's router. TG-6 tray and sentence: T1 (reasons, `reachedBy`), T5 29.322. TG-7 phones: T5 29.323. TG-8 windowing: T5 29.313 (no range route), T7 (Home). TG-9 periods and passes: T6 29.327–29.329. TG-10 Not taken and pruned: T6 29.331–29.333. TG-11 the pin: T1 29.297 (counts), T6 29.334. TG-12 loops: T5 29.321 (+ T1 reachedBy). TG-13 geometry and panel: T5 29.318, 29.325. TG-14 marks: T5 29.319. TG-15 copy: T5 29.324.
- HM-1 scope bar: T7 29.335. HM-2 the numbers over a scope, Me, `Due` label, lighting and glide, ids cap: T1 29.293, T3 29.306, T7 29.336–29.342. HM-3 lanes: T7 29.343. HM-4 arrows: T7 29.344. HM-5 bars: T2 29.300–29.302 and T7 29.343. HM-6 phones: T7 29.345. HM-7 states: T7 29.346–29.347. HM-8 audit rules: T5/T6/T7 (no paging controls asserted in 29.324 and 29.346).
- §13 bars: server bars T1 29.290–29.293; pan bars T2; geometry T5/T7; `first-load JS` T7 29.349; zoom drift T5 29.314; packing 10,000 in 20 ms is Part 1's (this plan consumes `pack`; T2's scene packs through the same call, and its harness prints the pack time: add the `pack(10_000)` timing to the T2 result line if Part 1's case did not already quote it).
- Cases 29.290–29.349: all 60 used once (T1 290–299, T2 300–303, T3 304–307, T4 308–312, T5 313–326, T6 327–334, T7 335–349).

**Placeholder scan.** No TBD or "similar to Task N". Steps that say "write the landed signature" (Step 0 of T1, T2, T4, T5, T7) are reads, each ending in a handoff line, not deferred design. The two spots that name an adapter the lane may have to write (`formatIstInstant`'s format in T6, `bridge.ts` property names in T2/T5) say what the adapter must output and which one file holds it.

**Type consistency.** `TimelineEntry`, `TimelineSegment` (`earlier?` added in T6), `TimelineFlow`, `TimelineDetail`, `TimelineTrayItem`, `HomeSummaryResponse` are defined in T1 and used unchanged by T3 (routes), T4 (mappers, cache, hook), T5–T7. `ScopeArg` (T4) = the server's `TimelineScope` with `mine`. `TimelineIndexResponse` and `HomeSummaryResponse` both carry `asOf: Record<workspaceId, number>` (T1 `readAsOf`, mapped strictly by T4's `seqMap`); T4's `ScopeCache.asOf` and T7's `useHomeSummary` hand it to `subscribeScope(source, workspaceIds, getAsOf, onFrame): ScopeFeed` (T4 `scope-feed.ts`), and neither hook waits for `caught-up`. `SceneEntry` (T5) is `TimelineEntry` plus `title`, `waitForAll`, `revised`, `tooltip` (T6). `DrawBar`/`DrawDiamond`/`DrawEdge` fields added later (T5: `dim`, `edgeKind`, `keyOutside`, `pinAt`; T6: `tooltip`, `revised: string | null`) are the single definition in `draw-types.ts` (T2) with each task's edit stated. `HomeNumbersData` (T7) widens `HomeResponse`'s two consumers without changing their callers.

**Review Focus coverage.** 1: 29.310, 29.348. 2: 29.296, 29.338. 3: 29.312, 29.347. 4: 29.341. 5: 29.306, 29.339.

## Decisions taken while writing the tasks (beyond D-W4-1 to 16)

- **D-W4-17 Reopening causes in the pass tooltip** appear only where the Decision's pass records are held (the sheet always; Home once the Decision's detail is loaded). The index carries no cause, and adding one would put a per-ticket string into a 10,000-entry payload.
- **D-W4-18 Members and Notes light nothing on the Timeline;** the note says so (HM-2 lights "its tickets in the current graph" and these are not tickets).
- **D-W4-19 Scope bar placement.** The `Home views` control sits between the numbers and the graph; the scope bar sits above the numbers (HM-1 says "below them" for the views).
- **D-W4-20 The 8-pass cap** is applied in `segmentsFor` (T6): older passes collapse to one `pass: 0` summary segment with `earlier: N`.
- **D-W4-21 Singleton edits refetch.** Dates or estimate edited on a ticket that is in no flow have no plan inputs in the index, so they follow the stale path (T4 29.309); flow members re-plan locally.
- **D-W4-22 `Start from` lives in the scope bar only;** the Knowledge view's own control (KG Home T4) is removed.
- **D-W4-23 Live updates are gated by a stream cut, not by `caught-up`.** Rooms are shared per workspace (`online/stream.ts:455-468`), so a hook that joins an existing room never receives a `caught-up`, and a first joiner replays history from cursor 0. Both the index and the summary therefore carry `asOf` (per readable workspace, `readStreamSeq` read BEFORE the load); `subscribeScope` delivers only events with `workspaceSeq` above it, remembers the newest earlier ones, and one refetch follows an answer that was older than something already seen. The subscription is opened before the read. Cost: one extra integer query per readable workspace per read.
- **D-W4-24 Home's stored scope waits for the roster** (`useMyWorkspaces` returns `rows`, null while loading). Until then the default scope (the current workspace, Me) is used for the first request and NOTHING is written; only the person's own change writes storage. Accepted cost, stated: a person whose stored scope differs from the default sees the default's numbers for the moment the roster takes (the shared roster cache usually makes it zero), then one refetch with the stored scope; 29.335 pins both the no-write and the refetch.

## Execution

Execution: the gisik-nokma lanes (one task = one session), per the planner.

## Ledger rows

```
wtg-part4-timeline-graph-home	1	todo	-	-	not started (BLOCKED until KG E T1 (routes/home.ts) lands on release/knowledge-graph; waits for Part 2 model; measure-first: four server reads and their bars)
wtg-part4-timeline-graph-home	2	todo	-	-	not started (parallel with T1; waits for Part 1 viewport; painter and Home-shaped pan bars, real phone STOP)
wtg-part4-timeline-graph-home	3	todo	-	-	not started (waits for T1; routes)
wtg-part4-timeline-graph-home	4	todo	-	-	not started (waits for T3 and T2 verdict; DataSource, cache, live, IST today)
wtg-part4-timeline-graph-home	5	todo	-	-	not started (waits for T4 and Part 3 Graph tab; sheet Timeline view)
wtg-part4-timeline-graph-home	6	todo	-	-	not started (waits for T5; periods, passes, Not taken, ghosts, pin)
wtg-part4-timeline-graph-home	7	todo	-	-	not started (BLOCKED until KG E T1 (routes/home.ts) lands on release/knowledge-graph; waits for T6 and KG Home T1-T4; Home one scope and Timeline)
```
