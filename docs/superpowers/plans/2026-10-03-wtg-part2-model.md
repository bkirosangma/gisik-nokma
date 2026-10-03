# Workflow and Timeline graphs, Part 2: the model, Implementation Plan

> **Release branch (owner, 2026-10-04):** `release/workflow-graph`, cut from `origin/release/knowledge-graph` at f9e0cd18. Every task branch is cut from `origin/release/workflow-graph` and every PR goes `--base release/workflow-graph`. The Knowledge Graph release merges to `main` first; `main` is then merged INTO `release/workflow-graph`, never rebased.

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. In the gisik orchestration, every task is ONE lane session. Follow `gisik-nokma-lanes/STEPS-common-2026-10-03.md`: numbered steps, each ending with a pushed commit + `CHECKPOINT task/<branch> <sha40> step <n>/<N>` + `HANDOFF-<branch>.md`; the sweep list + your own mutation pass before DONE.

**Goal:** the data model under the Workflow and Timeline graphs: a `leads_to` link with an outcome label, a Decision ticket type with recorded passes, an estimate / rework estimate / wait-for-all trio of built-in fields, work periods and derived actual dates, a pure flow analysis and planner, auto-promotion of Backlog tickets (server listener plus a reconciling sweep), the loop / Not-taken / revision cascade (`planSettle`, a server settler, two gates), two new notification kinds, and the History copy. No graph is drawn here; Parts 3 to 5 consume it.

**Architecture:**
- **Everything is ledger events and a fold.** `leads_to` rides spec A's `ticket.link_added` (a new optional `label`). `ticket.decided` is the one new event type and folds into `TicketState.outcome` / `passes`. Flow-caused moves are ordinary `ticket.transitioned` / `ticket.closed` / `ticket.reopened` events carrying a `cause`, filed by a reserved actor, so boards, History, the replica and notifications already understand them.
- **Pure first, server second.** `packages/domain/src/flow/` holds clock-free pure functions (`analyzeFlow`, `planFlow`, `promotionsFor`, `planSettle`) over one input shape (`FlowNode` + `FlowEdge`) that the server, the replica and the app share. The server (`apps/server/src/flow/`) reads a flow with `readFlow`, then a listener (`promote.ts`, `settle.ts`) and a reconciling sweep (`sweep.ts`, on the backup daemon) apply the plans through `ingestBatch` / `ingestAtomic` as `SYSTEM_ACTOR_FLOW`.
- **One controlled bend of the engine.** The flow actor, and only with a flow cause, may reopen a finished ticket and send a ticket to Backlog or to the first terminal state (PS-11); every other rule stays, and the cases pin both directions.

**Tech stack:** TypeScript, zod 3, Postgres (node-pg-migrate SQL files), Fastify, React 19, vitest 3 (node + jsdom), better-sqlite3 (replica tests).

**Spec:** `docs/superpowers/specs/2026-10-03-workflow-timeline-graphs-design.md`, **Part 2 only**: §7 (LK, DC, ES, WP), §8 (FL, PL, AP, the §8.4 census, PS, NT), with §15, §16 and §20 for the Drafts needs, the case blocks and the planner rulings. Read the whole spec for context; section numbers and requirement ids (LK-1 ... NT-4) are cited below. Code was read at `origin/release/knowledge-graph` (`ec72d1f8`); every `file:line` below is from that tree unless it says it comes from another plan. Re-read before editing: the Drafts release lands first and moves several of these files.

**Depends on / feeds:**

| | What | Why |
|---|---|---|
| Needs | Part 1 of this spec (`2026-10-03-wtg-part1-*.md`), its first task | creates `test-cases/29-workflow-timeline-graphs.md` and Features §26 with the README rows and ONE Part 2 anchor in each (`<!-- wtg-part2-model -->`, `<!-- wtg-part2-model bullets -->`); our T1 writes its sub-heading and per-task anchors below them |
| Needs | Knowledge Graph spec A (`2026-10-03-typed-links.md`), T1 to T5 | the link events (T1 is on the tip), `proj_ticket_links`, `checkTicketLink`, the precheck / permission arms, the read route and the Links section that T2 and T3 extend |
| Needs | Drafts (`2026-10-03-drafts.md`) T1 (events) | the additive `from` member on `ticket.link_added` (T2 adds `label` on top of it) |
| Needs | Drafts: the viewer's-own-drafts helper (D-8), the publish trigger events (D-5), `ingestAtomic` (R47) | T12 (flow read), T13 (publish re-evaluates promotion), T16 (the settler's atomic batch) |
| Feeds | Parts 3, 4, 5 of this spec | `readFlow` (T12; Part 3 T3 replaces T12's small `FlowReadWire` route with the rich `FlowRead` on the same path, D-W3-4), `planFlow` (T11), `planSettle` (T15), the Decision / pass / period fields on `TicketState` |

The MCP tool arguments (`set_wait_for_all`, `resolve_decision`, `link_tickets` with `leads_to`), the Decide control, the graph tab and the timelines are Parts 3 to 5. This plan adds no package, so the gate's task count is whatever Part 1 left it at.

## Where this plan departs from the spec's wording

Decided by the planner; each is also in the task that applies it.

1. **`ticket.decided` is not added to `BOOTSTRAP_BACKFILL_TYPES`** (spec §8.4 says to). It folds into `TicketState`, so it goes in `TICKET_EVENT_TYPES`; the docblock rule in `apps/server/src/sync/sync-routes.ts` is that folding types are not backfilled. T5 records the reasoning and the census asserts the type is in exactly one list. (T5, T19)
2. **`startedAt`, `endedAt` and `resolution` are derived, not folded** (spec §8.4 and ES-1a list them as folded). `TicketState.periods` is the only stored fold; `startedAtOf`, `endedAtOf`, `hasStarted`, `resolutionOf` and `ticketRound` are functions. The `proj_tickets.started_at` / `ended_at` columns are written from the periods. (T9)
3. **`rounds` counts `ticket.transitioned` events with cause `reopened-by-flow`, not "events with that cause"** (PS-2): a reset of a finished ticket files a `ticket.reopened` and a `ticket.transitioned`, both carrying the cause, which would count twice. (T9)
4. **The projection stores `closed_cause`, not a `resolution` column** (spec §17 lists `resolution`); the resolution is derived from the cause. (T9)
5. **The new gates are no-ops for every transition except a person finishing a Decision.** A `ServerGate` matches on event type only (`gates/server-gate.ts:32-36`; the gates loop is `ingest-service.ts:341-342`), so a naive gate on `ticket.transitioned` would judge every promotion and cascade move. (T16)
6. **The retroactive periods make stored snapshots and replica states stale**; T9 invalidates them rather than relying on the migration alone.
7. **Relabel is not atomic on the client door.** `ingestBatch` commits event by event (`ingest-service.ts:56-58`), so LK-4's "one batch" can commit the removal and refuse the add. T3 compensates by re-filing the original link and showing the server's reason; the true atomic form needs a gated client route over Drafts T5b's `ingestClientAtomic`, and Drafts exposes that door only through `POST …/drafts/publish` (no generic atomic route exists). (T3)
8. **`DECISION_TYPE_ID` is exported by T2, not T5**, so the label rules can recognise a Decision without a cycle; T5 adds only the seed. (T2, T5)
9. **Notification payloads hold titles, not keys, and a hidden Decision is stored as null at delivery**, because `notifications/store.ts:12-16` forbids redaction on read. (T18)
10. **The promoter uses the server's `serverAppend`, and the settler a new `serverAtomic`**, because `AppDeps.ingest` has no `ingestBatch` (`app.ts:87`); the backup daemon's ingest has no gates and no listeners (`ops/backup-daemon-main.ts:202`), which is why the reconciling sweep is part of the feature. (T13, T14, T16)
11. **`led-to` needs an engine clause** (`cause.led-to-not-backlog`: a promotion must start from Backlog), and the exemption refuses a move to the ticket's current state. (T8, T13)

## Global Constraints

**Release and identity**
- **Release:** `release/workflow-graph`, cut 2026-10-04 from `origin/release/knowledge-graph` at f9e0cd18 (owner; the KG release merges to `main` first, then `main` is merged INTO it, never rebased). Every task branch is `task/wtg2-<slug>`, cut from `origin/release/workflow-graph`, and its PR has `--base release/workflow-graph`. Never `main`. A merge to `main` is the release and happens on the owner's word.
- **Order:** Part 1 first, then Drafts, then this plan. Inside the plan, see each task's **Needs** line and the Parallelism notes.
- **Catalogue:** Features.md §26 "Workflow and Timeline graphs" ↔ `test-cases/29-workflow-timeline-graphs.md`, both opened by Part 1's first task. This plan owns, exactly: `29.120`-`29.127` (T2), `29.128`-`29.133` (T3), `29.134`-`29.137` and `29.356`-`29.358` (T5), `29.138`-`29.142` (T6), `29.143`-`29.144` (T7), `29.145`-`29.146` (T19), `29.147`-`29.152` (T1), `29.153`-`29.166` (T4), `29.167`-`29.170`, `29.350`-`29.355` and `29.359`-`29.360` (T9), `29.180`-`29.186` (T10), `29.187`-`29.189` (T12), `29.190`-`29.199` (T11), `29.200`-`29.209` and `29.361`-`29.363` (T8), `29.210`-`29.221` (T13), `29.222`-`29.229` (T14), `29.364`-`29.367` (T15), `29.368`-`29.370` (T16), `29.371`-`29.374` (T17), `29.390`-`29.399` (T18). `29.171`-`29.179` stay free. Part 1 owns `29.001`-`29.119`; Parts 3 to 5 own the rest.
- **Case lines are id lines:** `- ❌ **29.120 — …**`. Each starts ❌ and flips ✅ in the same commit as its test. Test names or comments carry the id. `node scripts/check-case-ids.mjs` and `pnpm check:citations` must pass.
- **Before allocating,** `git fetch` and re-grep every live release and task tip for `29-workflow-timeline-graphs.md` and `## 26.` (`git for-each-ref refs/remotes/origin --format='%(refname:short)'`, then `git grep -l` on each).
- **Anchors:** Part 1 T1 seeds ONE Part 2 anchor in each file (`<!-- wtg-part2-model -->` in the cases file, `<!-- wtg-part2-model bullets -->` in Features §26). Our T1 writes, directly below them, the `## 29.2` / `### Part 2` sub-heading and one `<!-- wtg-part2-model T<n> -->` anchor per task in the cases file and one `<!-- wtg-part2-model T<n> bullet -->` in Features §26 (efficiency rule #21). Each task writes only below its own anchors, and keeps them (29.146 reads a task's bullets below its anchor); where a step says "replace the anchor", write the bullet directly below it instead.
- **Ledger:** plan id `wtg-part2-model` (`scripts/check-task-ledger.mjs` strips the date). Rows are given at the end of this plan.
- **Migrations:** this plan's stamps start at `1792100000000`; T1 re-checks `max(existing) + 1` over every live tip and bumps all of ours if the Drafts plan went higher. node-pg-migrate refuses a new file that sorts before an applied one. Old migration files are never edited.

**Model facts, copied from the spec**
- Link kinds: `blocks`, `relates`, `duplicates`, `leads_to`. A `leads_to` reads "leads to" from the source and "comes after" from the target. `label`: optional on `ticket.link_added`, trimmed, 1 to 60 characters, refused on any kind but `leads_to`; `ticket.link_removed` is unchanged. At most one `leads_to` per ordered pair. A `leads_to` from a Decision requires a label; a Decision's outgoing labels are unique after trim and case folding. Loops (including A to B and B to A) are allowed for `leads_to` only.
- Decision: a built-in type `{ id: 'decision', name: 'Decision', icon: 'diamond', rank: 3 }`. `ticket.decided {outcome: string|null, from?: string|null, closeStarted?: string[]}` strict. A Decision with at least one outgoing `leads_to` and no outcome cannot enter a terminal state or be closed (`decision.outcome-required`).
- Fields: `estimate` and `reworkEstimate` are whole calendar days 1 to 365 (`null` clears); `waitForAll` is `true` or `null`. Absent means off / no estimate. `waitForAll` is excluded from the require-field picker.
- Satisfied means TERMINAL, not the closed flag. An edge `S -> T` is satisfied when S is terminal AND has no not-taken resolution AND (S is not a Decision OR S's outcome equals the edge label after trim and case folding).
- Flow actor: `SYSTEM_ACTOR_FLOW = '00000000000000000000SYS0FW'`, display "Flow". Causes: `led-to {sourceTicketId, label?, triggeredBy}`, `reopened-by-flow {decisionTicketId, outcome, pass, decidedBy, decisionEventId}`, `branch-not-taken {same fields}`. Any flow cause not filed by the flow actor is refused (`cause.forged`).
- A work period is `{start, end|null, pass}` from event `serverTime`; a ticket "has started" when its last period is open. A Not-taken close opens and closes no period.
- Flow cap: 300 tickets, 30 rings, `truncated: true` past it. A hidden ticket is a hole: no placeholder, no count.
- Notifications: `flow-ready` ("Ready to start") and `flow-reopened` ("Reopened by the flow"); both on by default and mutable; dedup keys `flow-ready:${eventId}` and `flow-reopened:${eventId}`.

**Copy rules** (no spaced em dash in any new string literal; the ui-copy scan sweeps `packages/domain/src` and `packages/mcp-server/src`)
- History: "Decided: Yes", "Decision revised: Yes → No", "Cleared the decision (was Yes)", "Moved to To do automatically, because GN-145 was closed" (a viewer who cannot see the source: "because an earlier step was finished"), "(pass 2)" suffix, "Closed as not taken, because …", "Reopened by the flow, because …".
- Engine reasons: `decision.outcome-required` "Choose an outcome before finishing this decision."; `decision.stale-from` "The decision changed to <X> since you looked."
- Notification preference rows: "A ticket is ready to start", "A ticket was reopened by a flow".

**What must not change**
- `REFUSAL_RULES` (kebab ids pinned exactly by `packages/rule-engine/test/engine.test.ts:671-702`); the new ids are dotted `REFUSALS` keys.
- `ENTITY_KINDS`. `BOOTSTRAP_BACKFILL_TYPES`' members (see departure 1).
- The auto-close sweep's behaviour for every ticket except a Decision with branches and no outcome.
- No package is added, so the gate's task count is unchanged by this plan.
- `reference/` is frozen.

**Tests and tooling**
- **Node 22** for `pnpm install` in a worktree.
- **Every test run goes through `/Users/kiro/my_projects/gisik-nokma-lanes/slot-run.sh <label> -- <cmd>`**, redirected to a log and read with `tail`. **Never pipe a test or build run into `head`** (the runner dies on EPIPE and its workers are orphaned); no `pkill` / `killall`. vitest `--maxWorkers=2`.
- **Build before suites.** Web reads app-core's `dist`; the server reads domain, rule-engine and app-core `dist`.
- **An app-core online/sync change** (T3, T12, T17) ⇒ also run the server integration files (`apps/server` WHOLE). **A `ui.css` change** ⇒ run the ui, app-core and web suites WHOLE.
- **An editor / domain registry change** (T2, T5, T8, T18) ⇒ regenerate the mobile editor bundle (`apps/mobile/src/editor/editor-html.generated.ts`) and commit it.
- **Every run quoted in a report is named LOCAL.** CI runs only on the release→main PR.
- **Controls live in the same `it()`** as the case they guard: a refusal test also proves the same call with one input changed is accepted.
- **A new event type, payload member or cause ⇒ every vocabulary census in the same task,** and the existing census test (`apps/server/test/census/ticket-vocabulary-census.test.ts`) is extended in that task. T19 is the final cross-check, not the first place a list is updated.
- **Features.md and test-cases** change in the same commit as the code.
- **UI tasks (T3, T18)** name `frontend-design` in the lane prompt and measure geometry on the primary stack only (rule #23: no lane runs its own Docker stack).
- **Task sizing:** one task = one lane session (about 1 to 3 hours), ending in a reviewable, independently testable deliverable.
- Gate task count and every pinned member/registry count are MEASURED on the tip at execution and pinned in the same task that changes them; never copy a number from this plan.

## Review Focus

1. **A viewer who cannot see a flow's source or Decision learns nothing about it from the model.** History, the flow read and the notifications all carry flow causes; a hidden ticket gives no key, title, id, `triggeredBy` or `decidedBy`, and a stored notification keeps null. Pinned by 29.373 (T17), 29.187 (T12), 29.395 (T18), 29.126 (T2).
2. **A relabel or a duplicate label must never lose a branch.** A Decision's blank, whitespace-only or case-variant duplicate label is refused; when the removal commits and the add is refused, the original link is filed again. Pinned by 29.123 (T2) and 29.132 (T3).
3. **A new ticket never defaults to Decision.** The rank-3 Decision sorts before Task by id, and a workspace with a custom ladder and no `task` type must still pick a non-Decision type. Pinned by 29.134 and 29.144 (T5, T7).
4. **A person's "Send to backlog" sticks, and the new gates judge only a person finishing a Decision.** A manual move into Backlog is not a promotion trigger (a flow-caused one is), and the gates return at once for promotions and cascade moves. Pinned by 29.216 (T13) and 29.370 (T16).
5. **"Not taken" is closed, never done, and a flow edge case is a boundary.** A parent with a skipped branch never reads "all done", a reopened ticket keeps its first period, and a flow of exactly 31 tickets is not `truncated` while a non-empty 31st ring is. Pinned by 29.374 (T17), 29.167 (T9) and 29.189 (T12).

---

## File structure

One row per file; the rightmost column lists the tasks that touch it, in landing order.

| File | Responsibility | Tasks |
|---|---|---|
| `packages/domain/src/link-label.ts` | linkLabelSchema (refuse blank, max 60), LINK_LABEL_MAX, normaliseLinkLabel | 2 |
| `packages/domain/src/events/ticket-events.ts` | leads_to kind, optional label on link_added + refine, readings; ticket.created optional estimate member; field_set docblock; ticketDecidedPayload, DECISION_CLOSE_STARTED_MAX; closed/reopened payload cause | 2, 4, 5, 8 |
| `packages/domain/src/ticket-types.ts` | export DECISION_TYPE_ID (T5 consumes it, adds the seed); BUILTIN_FIELD_IDS gains estimate/waitForAll/reworkEstimate; estimateValueSchema, waitForAllValueSchema, claimedEstimate, claimedWaitForAll; fifth built-in seed (Decision, diamond, rank 3) | 2, 4, 5 |
| `packages/domain/src/entity-state.ts` | TicketLink.label?; TicketState.periods?, rounds?; TicketState.outcome/passes, PassRecord, PassRevision; TicketState.closed.cause | 2, 5, 8, 9 |
| `packages/domain/src/ticket-state.ts` | link_added arm keeps the label; Creation fold writes the estimate claim (no key when absent); periods and rounds folded in the creation, transitioned and rebound arms; TICKET_FOLD_VERSION = 2; TICKET_EVENT_TYPES member, foldDecided, releaseOutcome; closed stores cause; reopened-by-flow releases outcome | 2, 4, 5, 8, 9 |
| `packages/rule-engine/src/checks/links.ts` | leads_to: reverse guard, link.label-required / link.label-duplicate | 2 |
| `packages/rule-engine/src/checks/refusals.ts` | two REFUSALS keys, labelDuplicateRefusal; cause.led-to-not-backlog key; decision.* keys and reason builders; cause.forged key | 2, 6, 8, 13 |
| `apps/server/migrations/1792100000000_proj-ticket-links-leads-to.sql` | widen kind CHECK, add label + label CHECK | 2 |
| `apps/server/src/projections/ticket-links.ts` | INSERT writes label | 2 |
| `apps/server/src/read/ticket-links.ts` | label on TicketLinkWire | 2 |
| `apps/server/src/routes/ticket-history.ts` | withheld target keeps label; causeTicket on the wire type; calls annotateFlowCauses | 2, 17 |
| `packages/app-core/src/views/history-copy.ts` | "Linked: leads to GN-147 (Yes)"; History sentences for the three built-ins; flow and decision sentences, pass suffix, historyRounds; History sentences for ticket.decided, closeStarted redaction; redactedPayload for hidden cause ids | 2, 4, 5, 8, 17 |
| `packages/app-core/src/view-types.ts` | TicketLinkView.label?; TicketHistoryEvent.causeTicket, ListRow.notTaken, RollupToViewer.notTakenChildren; TransitionCause union | 2, 8, 17 |
| `packages/app-core/src/online/mappers.ts` | mapTicketState + mapTicketLinks carry label; mapHistory causeTicket, mapListRow notTaken, mapRollup notTakenChildren; mapPasses, outcome/passes in mapTicketState; mapCause accepts flow kinds | 2, 5, 8, 17 |
| `packages/app-core/src/replica/replica-data-source.ts` | getTicketLinks returns label; list row notTaken from resolutionOf; causeOf serves flow kinds | 2, 8, 17 |
| `packages/mcp-server/src/tools/ticket-tools.ts` | redactedPayload keeps label; link_tickets refuses leads_to until Part 5; update_ticket fields guard refuses the three flow built-ins; type list copy for the fifth built-in | 2, 4, 5 |
| `packages/mcp-server/src/tools/read-tools.ts` | get_ticket.links carries label | 2 |
| `apps/mobile/src/editor/editor-html.generated.ts` | regenerated (embeds the domain registry); regenerated editor bundle | 2, 8 |
| `packages/domain/test/link-label.test.ts` | 29.120, 29.121 | 2 |
| `packages/rule-engine/test/links-leads-to.test.ts` | 29.122, 29.123 | 2 |
| `apps/server/test/permissions/check-leads-to-permission.test.ts` | 29.124 (gate) | 2 |
| `packages/app-core/test/precheck-leads-to.test.ts` | 29.124 (precheck) | 2 |
| `apps/server/test/projections/ticket-links-leads-to.test.ts` | 29.125 | 2 |
| `apps/server/test/census/ticket-vocabulary-census.test.ts` | extended: 29.127 label census; 29.399 notification kind census | 2, 18 |
| `packages/app-core/src/views/ticket-links-section.tsx` | Leads to / Comes after, label input, relabel with compensation, isDecision prop | 3 |
| `packages/app-core/src/views/ticket-sheet.tsx` | pass isDecision to the Links section; Estimate row between Start and Type, own-row exclusions, submitEstimate twin; subtaskTypeFor prefers a non-Decision type and falls back to the Decision only when it is the sole legal type (T5 owns it; T7 only pins it) | 3, 4, 5 |
| `packages/ui/src/ui.css` | label chip, hint, relabel form rules; Estimate input width | 3, 4 |
| `docs/manual.md` | Linking tickets: leads to, label, Edit label; Estimate in the new-ticket and sheet sections (T4); five built-in types (T7) | 3, 4 |
| `packages/app-core/test/views/ticket-links-leads-to.test.tsx` | 29.128-29.133 | 3 |
| `apps/server/test/census/wtg-part2-census.test.ts` | one table: every spec 8.4 and NT-3 row, with planted controls (29.145) | 19 |
| `apps/server/test/tooling/wtg-part2-catalogue.test.ts` | no open Part 2 case, a Features bullet per task, no dead path (29.146) | 19 |
| `Features.md` | section 26 bullets for T2, T3, T19; the Part 2 sub-heading and per-task anchors below Part 1's `<!-- wtg-part2-model bullets -->` (T1); per-task bullets; five-type wording (T7) | 1, 19 |
| `apps/server/src/tools/wtg-preflight.ts` | Read-only pre-flight detector: shadow ids, existing decision type, terminal-initial workflows; CLI inside a READ ONLY transaction | 1 |
| `apps/server/test/tools/wtg-preflight.test.ts` | Fixture tests for the three detectors and the report/exit code (29.147-29.149, 29.151) | 1 |
| `apps/server/test/census/terminal-category-readers.test.ts` | Census of every non-test reader of the terminal category, classified definition/invariant/done-meaning (29.150) | 1 |
| `apps/server/package.json` | Scripts wtg:preflight (T1) and wtg:backfill-decision (T7) | 1 |
| `test-cases/29-workflow-timeline-graphs.md` | the `## 29.2` sub-section and Part 2's per-task anchors, below Part 1's `<!-- wtg-part2-model -->` (the file is Part 1 T1's) | 1 |
| `packages/rule-engine/src/checks/fields.ts` | Engine value-check arms for estimate, reworkEstimate, waitForAll | 4 |
| `packages/app-core/src/workflow-builder/fields.ts` | require-field picker offers Estimate and Rework estimate, never Wait for all | 4 |
| `packages/app-core/src/views/optimistic-ticket.ts` | Optimistic overlay for the estimate claim | 4 |
| `packages/app-core/src/views/new-ticket-dialog.tsx` | Estimate input, draft member, validation (T4); defaultRootTypeFor prefers a non-Decision type and falls back to the Decision only when it is the sole legal type (T5 owns it; T7 only pins it) | 4, 5 |
| `packages/app-core/src/views/create-ticket-flow.tsx` | Sends estimate as a bare number | 4 |
| `apps/server/test/proj-tickets.test.ts` | Projection round trip of the three claims and a birth estimate (29.160) | 4 |
| `apps/server/src/flow/decision-backfill.ts` | DC-3 backfill: candidate SELECT, backfillDecisionType via ingestBatch under the flow actor, interval reader, boot-then-repeat delay | 7 |
| `apps/server/src/tools/backfill-decision-type.ts` | CLI for the backfill with --dry-run | 7 |
| `apps/server/test/flow/decision-backfill.test.ts` | Backfill cases (29.143) | 7 |
| `apps/server/src/ops/backup-daemon-main.ts` | Schedules the decision-backfill job on the backup worker; flow job, FLOW_SWEEP_INTERVAL_MS, daemon listeners, atomic ingest to the sweep | 7, 14, 16 |
| `apps/server/test/ops/backup-daemon-main.test.ts` | Daemon wiring case for decision-backfill (29.143); case 29.228 (zero interval, job runs) | 7, 14 |
| `.env.example` | DECISION_BACKFILL_INTERVAL_MS; FLOW_SWEEP_INTERVAL_MS | 7, 14 |
| `packages/app-core/test/views/subtask-type-for.test.ts` | Tie-break regression for subtaskTypeFor with the Decision seed (29.144) | 7 |
| `packages/app-core/src/workflow-builder/ticket-types/icons.tsx` | diamond icon entry (T5) | 5 |
| `apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx` | BUILTIN_LADDER_NOTICE loses its count (T5; T7 does not touch it) | 5 |
| `apps/server/test/routes/workspaces.test.ts` | Founding pins amended to eight events / five types (29.144) | 7 |
| `apps/server/test/permissions/check-role-permission.test.ts` | Founding pins amended to eight events / five types (29.144) | 7 |
| `apps/server/test/routes/workspace-bootstrap-failure.test.ts` | Complete founding sequence gains the fifth type | 7 |
| `apps/server/test/seed/seed-cc.test.ts` | Server-appended event count 6 to 7 | 7 |
| `packages/domain/src/flow/derive.ts (new)` | WorkPeriod, NotTakenResolution, ticketRound, startedAtOf, endedAtOf, hasStarted, notTakenOf, resolutionOf | 9 |
| `packages/domain/src/flow/periods.ts (new)` | foldWorkPeriods, setPeriods, keepConfirmedPeriods | 9 |
| `packages/domain/src/index.ts` | export flow/derive and flow/periods; export flow/causes; the per-file flow exports replaced by one export of flow/index.js | 8, 9, 10 |
| `apps/server/migrations/1792100200000_proj-tickets-periods.sql (new)` | proj_tickets started_at, ended_at, periods, rounds, closed_cause; snapshots.fold_version | 9 |
| `apps/server/src/projections/tickets.ts` | TicketRow, rowToTicketState and upsertTicket read and write the five columns; TicketRow, rowToTicketState, upsertTicket outcome/passes ($21, $22) | 5, 9 |
| `apps/server/src/ledger/snapshot-store.ts` | Snapshot.foldVersion, SnapshotInput, fold_version column | 9 |
| `apps/server/src/sync/snapshot-writer.ts` | foldTicketHead restates a stale-version snapshot; due query fold_version arm; immediate start | 9 |
| `apps/server/src/index.ts` | startSnapshotWriter immediate:true; pass serverAtomic | 9, 16 |
| `packages/sync-client/src/precheck/local-context.ts` | pending fold keeps confirmed periods | 9 |
| `packages/sync-client/src/storage/schema.ts` | LOCAL_SCHEMA_VERSION = 5 | 9 |
| `packages/sync-client/src/replica/replica.ts` | schema-5 open owes a pull for every held ticket | 9 |
| `packages/domain/test/work-periods.test.ts (new)` | cases 29.167, 29.168, 29.350-29.353 | 9 |
| `apps/server/test/projections/tickets-periods.test.ts (new)` | cases 29.169, 29.170, 29.359 | 9 |
| `apps/server/test/sync/snapshot-fold-version.test.ts (new)` | case 29.355 | 9 |
| `packages/sync-client/test/replica-periods.test.ts (new)` | cases 29.354, 29.360 | 9 |
| `apps/server/src/read/history-causes.ts (new)` | annotateFlowCauses: per-viewer causeTicket key and withheld cause ids | 17 |
| `apps/server/src/visibility/rollup.ts` | RollupView.notTaken; terminal counts done only | 17 |
| `apps/server/src/read/ticket-cards.ts` | PROJ_TICKET_COLUMNS += t.closed_cause; card notTaken; rollup notTakenChildren | 17 |
| `apps/server/src/routes/tickets.ts` | single-ticket rollup carries notTakenChildren | 17 |
| `apps/server/src/projections/rollups.ts` | docblock: terminal_children includes not-taken, not a done count | 17 |
| `packages/domain/src/read-models.ts` | TicketCard.notTaken?, TicketRollup.notTakenChildren?; TransitionCause union | 8, 17 |
| `packages/app-core/src/views/history-list.tsx` | passes each event round to describeEvent | 17 |
| `packages/app-core/src/views/list-model.ts` | countRows: a not-taken row is not done | 17 |
| `packages/app-core/src/views/rollup-text.ts` | formatRollup names not-taken children | 17 |
| `apps/server/test/routes/ticket-history-causes.test.ts (new)` | case 29.373 | 17 |
| `apps/server/src/flow/sweep.ts` | runFlowSweep: promote half now, settle half seam; settle half replaces the seam (60 s grace, 14 day lookback) | 14, 16 |
| `apps/server/src/ops/daemon-listeners.ts` | registerDaemonListeners: notification fan-out on the daemon ingest | 14 |
| `apps/server/test/flow/sweep.test.ts` | cases 29.222-29.227 | 14 |
| `apps/server/test/ops/daemon-listeners.test.ts` | case 29.229 | 14 |
| `apps/server/src/flow/settle.ts` | createFlowSettler, settleDecision, latestDecided, pendingSettle | 16 |
| `apps/server/src/gates/decision-gates.ts` | closeStarted gate, cascade gates, makeDecisionGates | 16 |
| `apps/server/src/gates/index.ts` | append the decision gates | 16 |
| `apps/server/src/app.ts` | AppDeps.serverAtomic, settler registration; register the flow promoter; import and register registerFlowRoute after the ticket-history route | 12, 13, 16 |
| `apps/server/test/gates/gate-seam.test.ts` | pinned gate list gains the three decision gates (9.229) | 16 |
| `apps/server/test/gates/decision-gates.test.ts` | case 29.370 | 16 |
| `apps/server/test/flow/settle.test.ts` | cases 29.368-29.369 | 16 |
| `apps/server/test/flow/flow-world.ts` | gatedIngest, loopWorld; shared flow test world | 13, 16 |
| `packages/domain/src/notifications.ts` | flow-ready and flow-reopened kinds, payload schemas | 18 |
| `apps/server/migrations/1792100300000_notification-kinds-flow.sql` | both kind CHECKs widened; Down deletes new-kind rows | 18 |
| `apps/server/src/notifications/fanout.ts` | handleFlowReady, handleFlowReopened, no-op arms; no-op arm for ticket.decided | 5, 18 |
| `packages/app-core/src/inbox/format.ts` | headline and body arms | 18 |
| `packages/app-core/src/inbox/icons.tsx` | two glyphs | 18 |
| `packages/app-core/src/account/notifications-section.tsx` | two preference labels | 18 |
| `packages/mcp-server/src/tools/discovery-tools.ts` | list_notifications description | 18 |
| `apps/server/test/notifications/flow-fanout.test.ts` | cases 29.392-29.396 | 18 |
| `apps/mobile (generated editor bundle)` | regenerated by generate:editor-html | 18 |
| `packages/domain/src/flow/promotion.ts` | promotionsFor, Promotion | 13 |
| `packages/domain/test/flow-promotion.test.ts` | cases 29.210-29.213 | 13 |
| `apps/server/src/flow/promote.ts` | promoteTargets, triggeredByOf, retargetsOf, createFlowPromoter, FLOW_SERVER_CAP | 13 |
| `apps/server/test/flow/promote.test.ts` | cases 29.214-29.221 | 13 |
| `packages/rule-engine/test/led-to-promotion.test.ts` | led-to refused outside Backlog | 13 |
| `packages/domain/src/flow/index.ts` | export promotion; export plan.js; export settle.js | 11, 13, 15 |
| `packages/rule-engine/src/transition.ts` | cause.led-to-not-backlog clause; DC-5 inside the terminal block; forgery guard, synthetic edge, DC-5 exemption | 6, 8, 13 |
| `apps/server/migrations/1792100100000_proj-tickets-decision.sql` | outcome and passes columns on proj_tickets | 5 |
| `packages/domain/src/vocabulary.ts` | register ticket.decided v1 | 5 |
| `packages/domain/test/decision-event.test.ts` | domain cases 29.134-29.136, 29.356-29.357 | 5 |
| `apps/server/src/sync/sync-routes.ts` | docblock arithmetic; no backfill entry | 5 |
| `apps/server/src/purge/check-purged.ts` | payloadIds closeStarted arm; payloadIds names sourceTicketId/decisionTicketId | 5, 8 |
| `apps/server/test/projections/tickets-decision.test.ts` | projection round trip | 5 |
| `packages/sync-client/test/replica-decision.test.ts` | replica fold case 29.358 | 5 |
| `packages/app-core/test/views/decision-type-defaults.test.ts` | default-type pickers never choose Decision | 5 |
| `packages/rule-engine/src/checks/decision.ts` | checkTicketDecided, decisionOutcomeRequired, outcomeLabels | 6 |
| `packages/rule-engine/src/evaluate.ts` | ticket.decided dispatch arm | 6 |
| `packages/rule-engine/src/checks/close.ts` | DC-5 at the close door; forgery guard, DC-5 exemption | 6, 8 |
| `packages/rule-engine/src/index.ts` | export decision checks and builders; export flow-cause helpers | 6, 8 |
| `packages/rule-engine/test/decision.test.ts` | engine cases 29.138-29.140 | 6 |
| `packages/app-core/src/precheck.ts` | precheckTicketDecided, DC-5 mirror with not-evaluated on unseen branches | 6 |
| `packages/app-core/test/precheck-decision.test.ts` | client mirror case 29.141 | 6 |
| `apps/server/src/auto-close/sweep.ts` | SELECT clause skipping outcome-less Decisions with leads_to | 6 |
| `apps/server/test/auto-close/sweep.test.ts` | sweep case 29.142 | 6 |
| `apps/server/test/decision/decision-door.test.ts` | real ingest door case 29.140 | 6 |
| `packages/domain/src/flow/causes.ts` | flow cause schemas, isFlowCause, viewerSafeCause | 8 |
| `packages/domain/src/workflow.ts` | transitioned payload cause union | 8 |
| `packages/domain/src/system-actors.ts` | SYSTEM_ACTOR_FLOW and name | 8 |
| `packages/domain/test/flow-causes.test.ts` | domain cases 29.200-29.202, 29.206 | 8 |
| `packages/rule-engine/src/checks/flow-cause.ts` | flowCauseForgery, flowExemptEdge | 8 |
| `packages/rule-engine/test/flow-cause.test.ts` | engine cases 29.203-29.205, 29.361-29.363 | 8 |
| `apps/server/src/read/state-provenance.ts` | serve flow causes as kind only | 8 |
| `apps/server/test/read/flow-cause-serving.test.ts` | serving case 29.207 | 8 |
| `packages/app-core/src/views/board.tsx` | chip only for reopened-for-child | 8 |
| `packages/domain/src/flow/types.ts (new)` | FlowEdge, edgeKey, FlowNode (the one input shape), FlowAnalysis | 10 |
| `packages/domain/src/flow/analysis.ts (new)` | analyzeFlow: Start/End, iterative DFS back edges, Kahn flow order | 10 |
| `packages/domain/src/flow/graph.ts (new)` | sameLabel, forwardEdges, effectiveEdges, liveSet, loopBody, branchOf | 10 |
| `packages/domain/src/flow/node.ts (new)` | flowNodeOf: the single door from TicketState + WorkflowDef to FlowNode | 10 |
| `packages/domain/src/flow/index.ts (new)` | barrel for every file under flow/ (causes, derive, periods, types, analysis, graph, node; T11/T13/T15 append) | 10 |
| `packages/domain/test/flow/fixtures.ts (new)` | shared flow fixtures: uid, fnode, decision, edge, the mockup 13-node flow (T11, T15 import it) | 10 |
| `packages/domain/test/flow/analysis.test.ts (new)` | cases 29.180-29.182, 29.186 purity | 10 |
| `packages/domain/test/flow/graph.test.ts (new)` | cases 29.183-29.184 | 10 |
| `packages/domain/test/flow/node.test.ts (new)` | case 29.185 | 10 |
| `packages/domain/test/flow/clock-free.test.ts (new)` | case 29.186 the flow directory reads no clock or device zone (T11, T15 add file names) | 10 |
| `packages/domain/src/flow/plan.ts (new)` | planFlow: PL-1..PL-6 planned IST-day intervals per pass, pruned ghosts, unscheduled reasons, onTimeline | 11 |
| `packages/domain/test/flow/plan.test.ts (new)` | cases 29.190-29.199 | 11 |
| `packages/domain/test/flow/clock-free.test.ts` | name plan.ts in the scanned list; name settle.ts in the scanned list | 11, 15 |
| `apps/server/src/flow/read-flow.ts (new)` | readFlow/walkFlow: ring-by-ring flow walk, holes, own drafts, cap 300, 30 rings, truncated/reached | 12 |
| `apps/server/src/routes/flow.ts (new)` | GET /v1/workspaces/:workspaceId/tickets/:ticketId/flow and the FlowReadWire shape | 12 |
| `apps/server/test/flow/read-flow.test.ts (new)` | cases 29.187-29.189 | 12 |
| `packages/domain/src/flow/settle.ts (new)` | planSettle (PS-4/5/6) and settleEvents (flow-actor events with flow causes) | 15 |
| `packages/domain/test/flow/settle.test.ts (new)` | cases 29.364-29.367 | 15 |
| `Features.md` §26, `test-cases/29-workflow-timeline-graphs.md` | the Part 2 anchors (T1) and each task's own bullets and case lines | 1-19 |


**Parallelism and landing order**
- **T1 first.** Its recorded dev run, and the owner's prod run, block T4 and T5 (not only T1's merge).
- **T8 (flow causes) is independent** and can run beside T2 to T6; T8's Step 7 needs T6 merged, so land T6 before T8.
- **Chains:** T2 then T3; T5 needs T2; T6 needs T5; T7 needs T6 and T8; T9 needs T8; T10 needs T2, T4, T5, T9; T11 needs T10; T12 needs T10 and Drafts; T13 needs T8, T10, T12; T14 needs T13; T15 needs T5, T8, T9, T10; T16 needs T13 to T15 and Drafts' `ingestAtomic`; T17 needs T5, T8, T9; T18 needs T8, T13; T19 last.
- **Suggested waves** (seat ceiling 4 lanes plus 2 reviewers): (1) T1, T2, T8; (2) T3, T4, T5, T9; (3) T6, T10, T17; (4) T7, T11, T12, T15; (5) T13, T14, T16, T18; (6) T19.
- **Shared files** (merge order decides who continues; each task re-reads the file before editing): `packages/domain/src/ticket-state.ts` (T2, T5, T8, T9), `ticket-types.ts` (T2, T4, T5), `check-purged.ts` `payloadIds` and `history-copy.ts` `redactedPayload` (T2, T5, T8), `flow/index.ts` (T8 to T15), `app.ts` (T13, T14, T16), `ticket-vocabulary-census.test.ts` (T2, T5, T8, T18, T19). T5 writes the minimal `ticket.decided` History arm the 3.183 census forces; T17 replaces it.

## Not in this plan
- The Decide control and its confirmation dialog, the Graph tab, the Workflow graph and the Timeline graph, Home's Timeline (Parts 3 and 4).
- The MCP tools and arguments: `link_tickets` with `leads_to`, `resolve_decision`, `set_wait_for_all`, `get_flow`, `publish_flow`, `get_timeline`, the `estimate` / `reworkEstimate` arguments (Part 5). Part 2 only keeps the three new ids out of `fields` and extends `redactedPayload`.
- `ingestAtomic`, the viewer's-drafts helper and the publish trigger (the Drafts plan).
- `mapClosed` carrying `closed.cause` to the app (`online/mappers.ts:1705-1712` drops it); the Part 3 sheet chip needs it.
- Changing `validateWorkflowDef` to refuse a terminal initial state (promotion skips such a workflow, and T1 reports how many exist).
- Notifications for a Not-taken close, an outcome, a revision or a Decision's own reset (NT-4).

---

### Task 1: Pre-flight: shadow ids, existing `decision` type, terminal-initial workflows, terminal-category readers (cases 29.147-29.152)

**Branch:** `task/wtg2-preflight` from `origin/release/workflow-graph`; PR `--base release/workflow-graph`. **Needs:** nothing. **T4 and T5 are blocked on this task's RECORDED prod result (Step 8), not only on its merge** (a lane has no prod access; the owner runs the script).

**Files:**
- Create:
  - `apps/server/src/tools/wtg-preflight.ts` (the detectors, the formatter, the CLI)
  - `apps/server/test/tools/wtg-preflight.test.ts` (29.147-29.149, 29.151)
  - `apps/server/test/census/terminal-category-readers.test.ts` (29.150)
- Modify:
  - `apps/server/package.json:15` (add `wtg:preflight` after `search:preflight`)
  - `test-cases/29-workflow-timeline-graphs.md` (Part 1 T1's file: the `## 29.2` sub-section and the T1..T19 anchors below `<!-- wtg-part2-model -->`, Step 1)
  - `Features.md` §26 (the `### Part 2: the model` sub-heading and the T1..T19 bullet anchors below `<!-- wtg-part2-model bullets -->`; then this task's bullet)

**Interfaces:**
- **Consumes:** `createPool` (`apps/server/src/db.ts`), `optionalDatabaseCaCert` (`apps/server/src/ops/backup-env.ts`), `Queryable` (`apps/server/src/db/queryable.ts`). Sibling pattern: `apps/server/src/tools/search-preflight.ts` (`main()` reads `DATABASE_URL` directly, NOT `loadConfig`, because it is pointed at a target database; announces the pool's TLS mode before the first query; `executedDirectly` guard at the bottom).
- **Produces** (T4 and T5 read the recorded output; T17 re-runs 29.150):
  - `NEW_BUILTIN_FIELD_IDS = ['estimate', 'waitForAll', 'reworkEstimate'] as const`
  - `type ShadowFinding = { source: 'ledger-definition'; workspaceId: string; typeId: string; fieldId: string; eventId: string } | { source: 'type-projection'; workspaceId: string; typeId: string; fieldId: string } | { source: 'field-claim'; workspaceId: string; fieldId: string; claims: number }`
  - `type ExistingDecisionType = { workspaceId: string; name: string; rank: number; workflowId: string; taskWorkflowId: string | null; rankMatchesSeed: boolean; sameWorkflowAsTask: boolean }`
  - `type TerminalInitialWorkflow = { workspaceId: string; workflowId: string; version: number; initialStateId: string; boundTypes: number }`
  - `type WtgPreflightReport = { database: string; workspaces: number; shadows: ShadowFinding[]; decisionTypes: ExistingDecisionType[]; terminalInitialWorkflows: TerminalInitialWorkflow[] }`
  - `wtgPreflight(db: Queryable): Promise<WtgPreflightReport>`; `formatWtgPreflight(report): string`; `wtgPreflightExitCode(report): 0 | 1` (1 only when `shadows` is non-empty); `inReadOnlyTransaction<T>(pool: Pool, fn: (db: Queryable) => Promise<T>): Promise<T>`.

**Why the detector reads the LEDGER and never parses (ES-3, spec test 17).** `ticketTypesProjection.apply` calls `ticketTypeDefSchema.parse(event.payload)` on every `ticket-type.defined` it replays (`apps/server/src/projections/ticket-types.ts:56`), and the replica does the same (`packages/sync-client/src/replica/replica.ts:295`). So after T4 widens `BUILTIN_FIELD_IDS`, a shadowing definition anywhere in the ledger, current or superseded, makes a rebuild throw. A rename done with a NEW definition event repairs only the projection row; it cannot repair the old event. Hence three sources (ledger events, `proj_ticket_types.fields`, `ticket.field_set` claims, which T4 would start reading as the built-in), and any `ledger-definition` hit is a stop-and-ask for T4.

**Why the fixture writes RAW rows (not `applyCommitted`).** `applyCommitted` runs every projection, and `ticketTypesProjection` parses with the live schema. The day T4 lands, a fixture built with it would throw inside the projection. `appendTestEvent` (`apps/server/test/helpers/ledger.ts`) and a direct `INSERT INTO proj_ticket_types` keep 29.147 green after T4.

- [ ] **Step 1: Re-check the tips, the stamps, and open the catalogue**

  Run (read-only; `git fetch` only moves remote refs):
  ```bash
  git fetch origin --prune
  for r in $(git for-each-ref refs/remotes/origin --format='%(refname:short)' | grep -E 'release/|wtg|drafts'); do
    git grep -l -e '29-workflow-timeline-graphs' -e '^## 26\.' "$r" -- test-cases Features.md 2>/dev/null | sed "s#^#$r #"
  done
  for r in $(git for-each-ref refs/remotes/origin --format='%(refname:short)'); do
    echo "$(git ls-tree --name-only "$r" apps/server/migrations/ | sed 's#.*/##' | sort | tail -1) $r"
  done | sort | tail -3
  ```
  Measured when this plan was written (2026-10-03): the first loop printed nothing (no live tip has file 29 or Features section 26); the last migration stamp on any live tip was `1791500000000` (`origin/task/kg-b-t1-index`). The contract's stamps start at `1792100000000` (T2 `1792100000000`, T5 `1792100100000`, T9 `1792100200000`, T18 `1792100300000`). **If the second loop prints a stamp >= `1792100000000`** (the Drafts plan lands first and may have taken the range), add `(that stamp - 1792100000000 + 100000000)` to all four stamps, edit the four names in the plan ledger rows, and write the new values in this task's HANDOFF. `node scripts/check-migration-order.mjs` is the arbiter at each task's gate.

  - **Guard.** `test -f test-cases/29-workflow-timeline-graphs.md && grep -n '^<!-- wtg-part2-model -->$' test-cases/29-workflow-timeline-graphs.md && grep -n '^<!-- wtg-part2-model bullets -->$' Features.md`. If any of the three fails, Graph Part 1 T1 has not landed (the execution order is Part 1, Drafts, then this plan): STOP and tell the planner. Do not create the file, the README row or the baseline entry here; they are Part 1 T1's. (The first loop above printing nothing would mean the same thing.)
  - **Directly below `<!-- wtg-part2-model -->`** in `test-cases/29-workflow-timeline-graphs.md` (keep that line), write:
    ```markdown

    ## 29.2 Part 2: the model

    Plan `docs/superpowers/plans/2026-10-03-wtg-part2-model.md`; spec `docs/superpowers/specs/2026-10-03-workflow-timeline-graphs-design.md`. Ids by task: the Global Constraints "Catalogue" line. `29.171`-`29.179` stay free.

    <!-- wtg-part2-model T1 -->
    ```
    ... then one line `<!-- wtg-part2-model T<n> -->` for n = 2..19.
  - **Directly below `<!-- wtg-part2-model bullets -->`** in `Features.md` §26 (keep that line), write `### Part 2: the model` and `<!-- wtg-part2-model T1 bullet -->` ... `<!-- wtg-part2-model T19 bullet -->`, one per line.

  Run: `node scripts/check-case-ids.mjs && pnpm check:citations`. Expected: both pass.

  Commit: `wtg2 T1: open the Part 2 sub-sections and per-task anchors under Part 1's Part 2 anchors in Features §26 and test-cases/29`.

- [ ] **Step 2: Write the case lines under `<!-- wtg-part2-model T1 -->`, all ❌**

  - `- ❌ **29.147 — the shadow detector reports a custom field whose id is estimate, waitForAll or reworkEstimate from three sources: any ticket-type.defined event (current or superseded), the proj_ticket_types row, and ticket.field_set claims;** control: near-miss ids (estimates, Estimate), another field, and a workspace with none are NOT reported, and a superseded shadowing definition has NO type-projection finding but still has a ledger-definition one. Mutation: scan only proj_ticket_types → the superseded and claim assertions fail.`
  - `- ❌ **29.148 — an existing type with id decision is reported per workspace with its rank, workflow, the task type's workflow, rankMatchesSeed (rank 3) and sameWorkflowAsTask;** control: a workspace with no decision type is absent. Mutation: drop the rank comparison → a rank-5 decision reads rankMatchesSeed true.`
  - `- ❌ **29.149 — a workflow whose CURRENT (highest) version has a terminal initial state is reported with its bound-type count;** control: an open initial state, and a workflow whose old version was terminal-initial but whose latest is fixed, are not. Mutation: read every version → the superseded workflow appears.`
  - `- ❌ **29.150 — THE TERMINAL-READER CENSUS: every non-test source file that reads the terminal state category or the rollup's terminal count is classified definition, invariant or done-meaning; a new reader fails the test;** control: a planted file is reported, a comment-only mention and a .test. file are not. Mutation: drop the comment filter → a docblock mention reads as a reader.`
  - `- ❌ **29.151 — the report prints every finding (workspace id, source, field) and exits 1 only for shadows (decision and terminal-initial findings are warnings, exit 0); the CLI runs inside a READ ONLY transaction;** control: the same INSERT commits on the plain pool. Mutation: drop BEGIN READ ONLY → the write inside succeeds.`
  - `- ❌ **29.152 — the owner ran the script against PROD and pasted the output into HANDOFF-task-wtg2-preflight.md, showing zero ledger-definition and zero field-claim shadows (or an owner ruling per hit);** control: the dev-database run (Step 6) is recorded beside it. 🧪 when the output is pasted.`

  Commit: `wtg2 T1: case lines 29.147-29.152 (red)`.

- [ ] **Step 3: Write the RED detector tests**

  `apps/server/test/tools/wtg-preflight.test.ts` (copy `apps/server/test/tools/sweep-orphans.test.ts`'s `createTestDatabase` lifecycle and `apps/server/test/search/preflight.test.ts`'s one-database-per-file shape):
  ```ts
  import { afterAll, beforeAll, describe, expect, it } from 'vitest';
  import { newUlid } from '@gisik-nokma/domain';
  import {
    NEW_BUILTIN_FIELD_IDS,
    formatWtgPreflight,
    inReadOnlyTransaction,
    wtgPreflight,
    wtgPreflightExitCode,
    type WtgPreflightReport,
  } from '../../src/tools/wtg-preflight.js';
  import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
  import { testEnvelope } from '../helpers/envelope.js';
  import { appendTestEvent } from '../helpers/ledger.js';

  const ACTOR = '01J9GUKR000000000000000000';
  let db: TestDatabase;
  beforeAll(async () => { db = await createTestDatabase(); });
  afterAll(async () => { await db.drop(); });

  type FieldDef = { id: string; name: string; type: string };
  type Def = { id: string; name: string; icon: string; rank: number; workflowId: string; fields: FieldDef[] };
  const def = (id: string, over: Partial<Def> = {}): Def =>
    ({ id, name: id, icon: 'check', rank: 3, workflowId: 'wf', fields: [], ...over });
  const num = (id: string): FieldDef => ({ id, name: id, type: 'number' });

  // RAW writes on purpose (see "Why the fixture writes RAW rows").
  async function defineRaw(workspaceId: string, d: Def): Promise<string> {
    const event = testEnvelope({ workspaceId, actorId: ACTOR, entity: { kind: 'ticket-type', id: newUlid() }, type: 'ticket-type.defined', payload: d });
    await appendTestEvent(db.pool, event);
    return event.id;
  }
  async function projectRaw(workspaceId: string, d: Def): Promise<void> {
    await db.pool.query(
      `INSERT INTO proj_ticket_types (workspace_id, type_id, name, icon, rank, workflow_id, fields, defined_by, defined_at, defined_workspace_seq)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now(), 1)`,
      [workspaceId, d.id, d.name, d.icon, d.rank, d.workflowId, JSON.stringify(d.fields), ACTOR],
    );
  }
  async function claimRaw(workspaceId: string, fieldId: string): Promise<void> {
    await appendTestEvent(db.pool, testEnvelope({ workspaceId, actorId: ACTOR, entity: { kind: 'ticket', id: newUlid() }, type: 'ticket.field_set', payload: { fieldId, value: '3 hours' } }));
  }
  async function workflowRaw(workspaceId: string, workflowId: string, version: number, initialStateId: string): Promise<void> {
    const states = [{ id: 'todo', name: 'To do', category: 'open' }, { id: 'done', name: 'Done', category: 'terminal' }];
    await db.pool.query(
      `INSERT INTO proj_workflows (workspace_id, workflow_id, version, name, definition, defined_by, defined_at, published_workspace_seq)
       VALUES ($1, $2, $3, 'wf', $4, $5, now(), $3)`,
      [workspaceId, workflowId, version, JSON.stringify({ id: workflowId, version, name: 'wf', initialStateId, states, transitions: [] }), ACTOR],
    );
  }

  describe('29.147 shadow detector', () => {
    it('29.147 reports ledger, projection and claim shadows; superseded counts in the ledger only; near misses are clean', async () => {
      const dirty = newUlid(); const superseded = newUlid(); const clean = newUlid();
      const bad = def('invoice', { fields: [num('estimate'), num('amount')] });
      const eventId = await defineRaw(dirty, bad);
      await projectRaw(dirty, bad);
      await claimRaw(dirty, 'estimate');
      await defineRaw(superseded, def('bug', { fields: [num('waitForAll')] }));
      const fixed = def('bug');
      await defineRaw(superseded, fixed);
      await projectRaw(superseded, fixed);
      await defineRaw(clean, def('task', { fields: [num('estimates'), num('Estimate'), num('rework')] }));
      await projectRaw(clean, def('task', { fields: [num('estimates'), num('Estimate'), num('rework')] }));

      const { shadows } = await wtgPreflight(db.pool);
      expect(shadows).toContainEqual({ source: 'ledger-definition', workspaceId: dirty, typeId: 'invoice', fieldId: 'estimate', eventId });
      expect(shadows).toContainEqual({ source: 'type-projection', workspaceId: dirty, typeId: 'invoice', fieldId: 'estimate' });
      expect(shadows).toContainEqual({ source: 'field-claim', workspaceId: dirty, fieldId: 'estimate', claims: 1 });
      expect(shadows).toContainEqual(expect.objectContaining({ source: 'ledger-definition', workspaceId: superseded, typeId: 'bug', fieldId: 'waitForAll' }));
      expect(shadows.filter((s) => s.source === 'type-projection' && s.workspaceId === superseded)).toEqual([]);
      // control, same it(): nothing else is reported
      expect(shadows.some((s) => s.workspaceId === clean)).toBe(false);
      expect(shadows.some((s) => s.fieldId === 'amount')).toBe(false);
      expect([...NEW_BUILTIN_FIELD_IDS]).toEqual(['estimate', 'waitForAll', 'reworkEstimate']);
    });
  });

  describe('29.148 existing decision types', () => {
    it('29.148 reports rank, workflow and the task workflow per workspace; a workspace without one is absent', async () => {
      const a = newUlid(); const b = newUlid(); const c = newUlid();
      await projectRaw(a, def('task', { workflowId: 'wf-a' }));
      await projectRaw(a, def('decision', { rank: 3, workflowId: 'wf-a' }));
      await projectRaw(b, def('task', { workflowId: 'wf-b1' }));
      await projectRaw(b, def('decision', { rank: 5, workflowId: 'wf-b2' }));
      await projectRaw(c, def('task'));
      const { decisionTypes } = await wtgPreflight(db.pool);
      expect(decisionTypes).toContainEqual({ workspaceId: a, name: 'decision', rank: 3, workflowId: 'wf-a', taskWorkflowId: 'wf-a', rankMatchesSeed: true, sameWorkflowAsTask: true });
      expect(decisionTypes).toContainEqual({ workspaceId: b, name: 'decision', rank: 5, workflowId: 'wf-b2', taskWorkflowId: 'wf-b1', rankMatchesSeed: false, sameWorkflowAsTask: false });
      expect(decisionTypes.some((d) => d.workspaceId === c)).toBe(false);
    });
  });

  describe('29.149 terminal-initial workflows', () => {
    it('29.149 reports only the highest version, with its bound types', async () => {
      const ws = newUlid(); const open = newUlid(); const term = newUlid(); const fixed = newUlid(); const broke = newUlid();
      await workflowRaw(ws, open, 1, 'todo');
      await workflowRaw(ws, term, 1, 'done');
      await projectRaw(ws, def('chore', { workflowId: term }));
      await workflowRaw(ws, fixed, 1, 'done');
      await workflowRaw(ws, fixed, 2, 'todo');
      await workflowRaw(ws, broke, 1, 'todo');
      await workflowRaw(ws, broke, 2, 'done');
      const found = (await wtgPreflight(db.pool)).terminalInitialWorkflows.filter((w) => w.workspaceId === ws);
      expect(found).toContainEqual({ workspaceId: ws, workflowId: term, version: 1, initialStateId: 'done', boundTypes: 1 });
      expect(found).toContainEqual({ workspaceId: ws, workflowId: broke, version: 2, initialStateId: 'done', boundTypes: 0 });
      expect(found.map((w) => w.workflowId).sort()).toEqual([broke, term].sort());
    });
  });

  describe('29.151 report, exit code, read-only', () => {
    it('29.151 prints every finding, exits 1 only for shadows, and the CLI transaction cannot write', async () => {
      const clean: WtgPreflightReport = { database: 'x', workspaces: 3, shadows: [], decisionTypes: [], terminalInitialWorkflows: [] };
      expect(wtgPreflightExitCode(clean)).toBe(0);
      expect(formatWtgPreflight(clean)).toContain('shadowing custom fields: none');
      const warn = { ...clean, decisionTypes: [{ workspaceId: 'W2', name: 'Decision', rank: 5, workflowId: 'wf', taskWorkflowId: 'wf', rankMatchesSeed: false, sameWorkflowAsTask: true }] };
      expect(wtgPreflightExitCode(warn)).toBe(0);
      expect(formatWtgPreflight(warn)).toContain('W2');
      const blocked = { ...clean, shadows: [{ source: 'field-claim' as const, workspaceId: 'W1', fieldId: 'estimate', claims: 2 }] };
      expect(wtgPreflightExitCode(blocked)).toBe(1);
      expect(formatWtgPreflight(blocked)).toMatch(/field-claim\s+W1.*estimate/);
      await expect(inReadOnlyTransaction(db.pool, (tx) => tx.query(`INSERT INTO proj_workspaces (workspace_id) VALUES ('w-ro')`))).rejects.toThrow(/read-only transaction/);
      await db.pool.query(`INSERT INTO proj_workspaces (workspace_id) VALUES ($1)`, [newUlid()]); // control
    });
  });
  ```
  Run (LOCAL, build first): `/Users/kiro/my_projects/gisik-nokma-lanes/slot-run.sh wtg2-t1-red -- pnpm --filter @gisik-nokma/server exec vitest run test/tools/wtg-preflight.test.ts --maxWorkers=2 > /tmp/wtg2-t1-red.log 2>&1; tail -30 /tmp/wtg2-t1-red.log`. Expected: FAIL, `Cannot find module '../../src/tools/wtg-preflight.js'`.

  Commit: `wtg2 T1: red tests for the pre-flight detectors`.

- [ ] **Step 4: Implement `apps/server/src/tools/wtg-preflight.ts` and the script**

  ```ts
  import { pathToFileURL } from 'node:url';
  import type { Pool } from 'pg';
  import { createPool } from '../db.js';
  import type { Queryable } from '../db/queryable.js';
  import { optionalDatabaseCaCert } from '../ops/backup-env.js';

  /** The ids Part 2 adds to BUILTIN_FIELD_IDS. A literal on purpose: this tool must give the same answer before and after T4. T4's 29.153 asserts it is a subset of the domain list. */
  export const NEW_BUILTIN_FIELD_IDS = ['estimate', 'waitForAll', 'reworkEstimate'] as const;
  const DECISION_SEED_RANK = 3;

  export type ShadowFinding =
    | { source: 'ledger-definition'; workspaceId: string; typeId: string; fieldId: string; eventId: string }
    | { source: 'type-projection'; workspaceId: string; typeId: string; fieldId: string }
    | { source: 'field-claim'; workspaceId: string; fieldId: string; claims: number };
  export type ExistingDecisionType = { workspaceId: string; name: string; rank: number; workflowId: string; taskWorkflowId: string | null; rankMatchesSeed: boolean; sameWorkflowAsTask: boolean };
  export type TerminalInitialWorkflow = { workspaceId: string; workflowId: string; version: number; initialStateId: string; boundTypes: number };
  export type WtgPreflightReport = { database: string; workspaces: number; shadows: ShadowFinding[]; decisionTypes: ExistingDecisionType[]; terminalInitialWorkflows: TerminalInitialWorkflow[] };

  export async function wtgPreflight(db: Queryable): Promise<WtgPreflightReport> {
    const ids = [...NEW_BUILTIN_FIELD_IDS];
    const context = await db.query<{ database: string; workspaces: string }>(
      `SELECT current_database() AS database,
              (SELECT count(DISTINCT workspace_id) FROM events WHERE type = 'workspace.created') AS workspaces`,
    );
    const ledger = await db.query<{ workspace_id: string; event_id: string; type_id: string; field_id: string }>(
      `SELECT e.workspace_id, e.id AS event_id, e.payload->>'id' AS type_id, f->>'id' AS field_id
         FROM events e
        CROSS JOIN LATERAL jsonb_array_elements(
              CASE WHEN jsonb_typeof(e.payload->'fields') = 'array' THEN e.payload->'fields' ELSE '[]'::jsonb END) AS f
        WHERE e.type = 'ticket-type.defined' AND f->>'id' = ANY($1::text[])
        ORDER BY e.workspace_id, e.workspace_seq, f->>'id'`,
      [ids],
    );
    const projected = await db.query<{ workspace_id: string; type_id: string; field_id: string }>(
      `SELECT t.workspace_id, t.type_id, f->>'id' AS field_id
         FROM proj_ticket_types t CROSS JOIN LATERAL jsonb_array_elements(t.fields) AS f
        WHERE f->>'id' = ANY($1::text[]) ORDER BY 1, 2, 3`,
      [ids],
    );
    const claims = await db.query<{ workspace_id: string; field_id: string; claims: string }>(
      `SELECT e.workspace_id, e.payload->>'fieldId' AS field_id, count(*) AS claims
         FROM events e WHERE e.type = 'ticket.field_set' AND e.payload->>'fieldId' = ANY($1::text[])
        GROUP BY 1, 2 ORDER BY 1, 2`,
      [ids],
    );
    const decisions = await db.query<{ workspace_id: string; name: string; rank: number; workflow_id: string; task_workflow_id: string | null }>(
      `SELECT t.workspace_id, t.name, t.rank, t.workflow_id,
              (SELECT k.workflow_id FROM proj_ticket_types k WHERE k.workspace_id = t.workspace_id AND k.type_id = 'task') AS task_workflow_id
         FROM proj_ticket_types t WHERE t.type_id = 'decision' ORDER BY t.workspace_id`,
    );
    const terminal = await db.query<{ workspace_id: string; workflow_id: string; version: number; initial_state_id: string; bound_types: string }>(
      `SELECT w.workspace_id, w.workflow_id, w.version, w.definition->>'initialStateId' AS initial_state_id,
              (SELECT count(*) FROM proj_ticket_types t WHERE t.workspace_id = w.workspace_id AND t.workflow_id = w.workflow_id) AS bound_types
         FROM proj_workflows w
        WHERE w.version = (SELECT max(v.version) FROM proj_workflows v WHERE v.workflow_id = w.workflow_id)
          AND EXISTS (SELECT 1 FROM jsonb_array_elements(w.definition->'states') s
                       WHERE s->>'id' = w.definition->>'initialStateId' AND s->>'category' = 'terminal')
        ORDER BY 1, 2`,
    );
    return {
      database: context.rows[0]?.database ?? '',
      workspaces: Number(context.rows[0]?.workspaces ?? 0),
      shadows: [
        ...ledger.rows.map((r): ShadowFinding => ({ source: 'ledger-definition', workspaceId: r.workspace_id, typeId: r.type_id, fieldId: r.field_id, eventId: r.event_id })),
        ...projected.rows.map((r): ShadowFinding => ({ source: 'type-projection', workspaceId: r.workspace_id, typeId: r.type_id, fieldId: r.field_id })),
        ...claims.rows.map((r): ShadowFinding => ({ source: 'field-claim', workspaceId: r.workspace_id, fieldId: r.field_id, claims: Number(r.claims) })),
      ],
      decisionTypes: decisions.rows.map((r) => ({
        workspaceId: r.workspace_id, name: r.name, rank: r.rank, workflowId: r.workflow_id, taskWorkflowId: r.task_workflow_id,
        rankMatchesSeed: r.rank === DECISION_SEED_RANK, sameWorkflowAsTask: r.workflow_id === r.task_workflow_id,
      })),
      terminalInitialWorkflows: terminal.rows.map((r) => ({
        workspaceId: r.workspace_id, workflowId: r.workflow_id, version: r.version, initialStateId: r.initial_state_id, boundTypes: Number(r.bound_types),
      })),
    };
  }

  export function wtgPreflightExitCode(report: WtgPreflightReport): 0 | 1 {
    return report.shadows.length > 0 ? 1 : 0;
  }

  export function formatWtgPreflight(report: WtgPreflightReport): string {
    const lines = [`wtg-preflight: database ${report.database} (${report.workspaces} workspaces)`];
    lines.push(report.shadows.length === 0 ? '  shadowing custom fields: none' : `  shadowing custom fields: ${report.shadows.length} (BLOCKS wtg2 T4)`);
    for (const s of report.shadows) {
      lines.push(s.source === 'field-claim'
        ? `    ${s.source.padEnd(18)} ${s.workspaceId} field ${s.fieldId} (${s.claims} claims)`
        : `    ${s.source.padEnd(18)} ${s.workspaceId} type ${s.typeId} field ${s.fieldId}${s.source === 'ledger-definition' ? ` (event ${s.eventId})` : ''}`);
    }
    lines.push(report.decisionTypes.length === 0 ? "  existing 'decision' types: none" : `  existing 'decision' types: ${report.decisionTypes.length} (T7 adopts them)`);
    for (const d of report.decisionTypes) {
      lines.push(`    ${d.workspaceId} "${d.name}" rank ${d.rank}${d.rankMatchesSeed ? '' : ' (NOT 3: no edit after T5)'} workflow ${d.workflowId}${d.sameWorkflowAsTask ? '' : ` (task uses ${d.taskWorkflowId ?? 'none'})`}`);
    }
    lines.push(report.terminalInitialWorkflows.length === 0 ? '  workflows with a terminal initial state: none' : `  workflows with a terminal initial state: ${report.terminalInitialWorkflows.length} (promotion skips them)`);
    for (const w of report.terminalInitialWorkflows) lines.push(`    ${w.workspaceId} workflow ${w.workflowId} v${w.version} initial "${w.initialStateId}" (${w.boundTypes} bound types)`);
    return lines.join('\n');
  }

  /** Everything the CLI reads runs inside BEGIN READ ONLY: this tool is pointed at PROD by the owner. */
  export async function inReadOnlyTransaction<T>(pool: Pool, fn: (db: Queryable) => Promise<T>): Promise<T> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN READ ONLY');
      try { return await fn(client); } finally { await client.query('ROLLBACK'); }
    } finally {
      client.release();
    }
  }

  async function main(): Promise<void> {
    const databaseUrl = process.env['DATABASE_URL'];
    if (!databaseUrl) { console.error('DATABASE_URL is required'); process.exit(2); }
    const pool = createPool(databaseUrl, { caCert: optionalDatabaseCaCert(process.env) });
    console.log(JSON.stringify({ msg: 'database pool', tls: pool.options.ssl ? 'ca' : 'none' }));
    try {
      const report = await inReadOnlyTransaction(pool, wtgPreflight);
      console.log(formatWtgPreflight(report));
      process.exitCode = wtgPreflightExitCode(report);
    } finally {
      await pool.end();
    }
  }

  const executedDirectly = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
  if (executedDirectly) main().catch((error: unknown) => { console.error(error); process.exit(1); });
  ```
  `apps/server/package.json:15`: add `"wtg:preflight": "tsx src/tools/wtg-preflight.ts",` after `"search:preflight"`.

  Run (LOCAL): the Step 3 command with label `wtg2-t1-green`. Expected: PASS (4 tests). Flip 29.147, 29.148, 29.149, 29.151 to ✅.

  Commit: `wtg2 T1: the pre-flight detectors, formatter and CLI (29.147-29.149, 29.151)`.

- [ ] **Step 5: The terminal-reader census (29.150), RED then green**

  `apps/server/test/census/terminal-category-readers.test.ts` (sibling: `apps/server/test/census/ticket-vocabulary-census.test.ts`, a registry census with a planted-control; this one walks source files, as `packages/app-core/test/helpers/clock-scan.ts` does for clock getters):
  ```ts
  import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
  import { tmpdir } from 'node:os';
  import { join, relative, resolve } from 'node:path';
  import { describe, expect, it } from 'vitest';

  const ROOT = resolve(import.meta.dirname, '../../../..');
  const SCAN_DIRS = ['apps/server/src', 'apps/web/app', 'apps/web/src', 'packages/app-core/src', 'packages/domain/src', 'packages/rule-engine/src', 'packages/mcp-server/src', 'packages/sync-client/src', 'packages/ui/src', 'packages/editor/src'];
  const PATTERN = /['"]terminal['"]|\bterminal(?:Children|_children)\b|\.terminal\b|\bterminal:\s*(?:\[|[A-Z])/;
  const SKIP = /(?:^|\/)(?:node_modules|dist|test|tests|e2e|\.next)(?:\/|$)|\.test\.|\.generated\./;

  export function scanTerminalReaders(root: string, dirs: readonly string[]): Map<string, number[]> {
    const found = new Map<string, number[]>();
    const walk = (dir: string): void => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        const rel = relative(root, path);
        if (SKIP.test(rel)) continue;
        if (statSync(path).isDirectory()) { walk(path); continue; }
        if (!/\.(ts|tsx|sql)$/.test(name)) continue;
        const hits: number[] = [];
        readFileSync(path, 'utf8').split('\n').forEach((line, index) => {
          const text = line.trim();
          if (text.startsWith('//') || text.startsWith('*') || text.startsWith('/*')) return;
          if (PATTERN.test(line)) hits.push(index + 1);
        });
        if (hits.length > 0) found.set(rel, hits);
      }
    };
    for (const dir of dirs) if (existsSync(join(root, dir))) walk(join(root, dir));
    return found;
  }

  /** definition: authors or validates a workflow. invariant: "terminal" means finished, and a Not-taken ticket parked there IS finished (parent close, attention, sweeps, the board column). done-meaning: a count or sentence that means DONE; T17 makes each exclude a not-taken resolution. */
  type Reader = 'definition' | 'invariant' | 'done-meaning';
  export const TERMINAL_READERS: Record<string, Reader> = {};

  describe('29.150 terminal-category readers', () => {
    it('29.150 every reader is classified; the scan sees a planted reader and ignores comments and test files', () => {
      const dir = mkdtempSync(join(tmpdir(), 'wtg-scan-'));
      mkdirSync(join(dir, 'src'));
      writeFileSync(join(dir, 'src', 'planted.ts'), "export const done = (t: { state_category: string }) => t.state_category === 'terminal';\n");
      writeFileSync(join(dir, 'src', 'docblock.ts'), "// a 'terminal' mention in a comment\n/**\n * 'terminal' in a docblock\n */\nexport const x = 1;\n");
      writeFileSync(join(dir, 'src', 'planted.test.ts'), "const a = 'terminal';\n");
      expect([...scanTerminalReaders(dir, ['src']).keys()]).toEqual(['src/planted.ts']);

      const found = scanTerminalReaders(ROOT, SCAN_DIRS);
      expect([...found.keys()].sort()).toEqual(Object.keys(TERMINAL_READERS).sort());
      expect(Object.values(TERMINAL_READERS).every((c) => ['definition', 'invariant', 'done-meaning'].includes(c))).toBe(true);
    });
  });
  ```
  Run (LOCAL): `... vitest run test/census/terminal-category-readers.test.ts` with label `wtg2-t1-census`. Expected: FAIL; the diff lists the files the scan found (38 at `ec72d1f8`; they are the keys below). Then fill `TERMINAL_READERS` with exactly these (the classes are this task's reading; each file's lines at plan time are in Step 6's table):
  ```ts
  export const TERMINAL_READERS: Record<string, Reader> = {
    // definition (15)
    'apps/server/src/routes/builder-reads.ts': 'definition',
    'packages/app-core/src/workflow-builder/anchor-issues.ts': 'definition',
    'packages/app-core/src/workflow-builder/templates.ts': 'definition',
    'packages/app-core/src/workflow-builder/ui/builder-panels.tsx': 'definition',
    'packages/app-core/src/workflow-builder/ui/flow-graph.ts': 'definition',
    'packages/app-core/src/workflow-builder/ui/state-node.tsx': 'definition',
    'packages/domain/src/simple-kanban.ts': 'definition',
    'packages/domain/src/validate-workflow.ts': 'definition',
    'packages/domain/src/workflow-helpers.ts': 'definition',
    'packages/domain/src/workflow.ts': 'definition',
    'packages/domain/src/workflows/errand-with-waits.ts': 'definition',
    'packages/rule-engine/src/checks/test-support.ts': 'definition',
    'packages/rule-engine/src/checks/workflow-rebind.ts': 'definition',
    'packages/rule-engine/src/workflow-defined.ts': 'definition',
    'packages/ui/src/components/chip.tsx': 'definition',
    // invariant (12)
    'apps/server/src/auto-close/sweep.ts': 'invariant',
    'apps/server/src/notifications/sweep.ts': 'invariant',
    'apps/server/src/routes/attention.ts': 'invariant',
    'apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx': 'invariant',
    'packages/app-core/src/flows/guarded-child-event.ts': 'invariant',
    'packages/app-core/src/offline/reopen-pair.ts': 'invariant',
    'packages/app-core/src/precheck.ts': 'invariant',
    'packages/app-core/src/views/board.tsx': 'invariant',
    'packages/app-core/src/views/ticket-sheet.tsx': 'invariant',
    'packages/rule-engine/src/checks/close.ts': 'invariant',
    'packages/rule-engine/src/checks/hierarchy.ts': 'invariant',
    'packages/rule-engine/src/transition.ts': 'invariant',
    // done-meaning (11): T17 changes these
    'apps/server/src/projections/rollups.ts': 'done-meaning',
    'apps/server/src/read/ticket-cards.ts': 'done-meaning',
    'apps/server/src/routes/my-work.ts': 'done-meaning',
    'apps/server/src/routes/tickets.ts': 'done-meaning',
    'apps/server/src/visibility/rollup.ts': 'done-meaning',
    'packages/app-core/src/online/mappers.ts': 'done-meaning',
    'packages/app-core/src/view-types.ts': 'done-meaning',
    'packages/app-core/src/views/list-model.ts': 'done-meaning',
    'packages/app-core/src/views/rollup-text.ts': 'done-meaning',
    'packages/app-core/src/views/ticket-list.tsx': 'done-meaning',
    'packages/domain/src/read-models.ts': 'done-meaning',
  };
  ```
  If the scan at execution time lists a file not above (a lane merged a new reader), classify it by the three definitions and note it in the HANDOFF. Expected after filling: PASS. Flip 29.150 ✅.

  Commit: `wtg2 T1: terminal-category reader census (29.150)`.

- [ ] **Step 6: Run against the DEV database and record the readers**

  `DATABASE_URL=postgres://gisik:gisik@localhost:54330/gisik_nokma pnpm --filter @gisik-nokma/server run wtg:preflight` (54330 is the dev stack; 54329 is the shared TEST Postgres, never point this at it). Paste the whole output into the HANDOFF. **Measured read-only at plan time (2026-10-03):** `7 workspaces; shadowing custom fields: none; existing 'decision' types: none; workflows with a terminal initial state: none`. Same query set also showed 2 of the 7 workspaces have NO `task` type and 1 is deleted: T7's backfill must skip both.

  Record the readers (this is Q1's list; spec question 1 asks for it) in the HANDOFF as `file:line` for the `done-meaning` class, re-generated by the Step 5 scan if the tip moved:
  - `apps/server/src/projections/rollups.ts:234` (`count(*) FILTER (WHERE state_category = 'terminal')` into `terminal_children`), also `:108,118,153,230,244`
  - `apps/server/src/visibility/rollup.ts:329-330,366` (`tally.terminal`), `:147`
  - `apps/server/src/read/ticket-cards.ts:179` and `apps/server/src/routes/tickets.ts:511` (`terminalChildren: rollupView.terminal`)
  - `apps/server/src/routes/my-work.ts:537-538` (`groups.terminal`), `:151,176`
  - `packages/app-core/src/views/rollup-text.ts:17` ("N of M done"), `views/list-model.ts:42` and `views/ticket-list.tsx:530` ("N tickets, N done"), `online/mappers.ts:411,2432`, `view-types.ts:246`, `packages/domain/src/read-models.ts:96,510`
  - `invariant` (no change expected, a Not-taken ticket in the terminal state is finished): `rule-engine/src/transition.ts:152-155,186-191`, `checks/close.ts:60,72`, `checks/hierarchy.ts:173,327`, `app-core/src/precheck.ts:445-510,661-693`, `auto-close/sweep.ts:186,214`, `notifications/sweep.ts:186`, `routes/attention.ts:260`, `views/board.tsx:1364,3088`, `views/ticket-sheet.tsx:3874`, `page.tsx:1064`.
  - **Not readers of done-ness, though the spec names one:** `apps/server/src/read/workspace-counts.ts:68` (`visibleProjectCounts`) counts every live ticket and the blocked ones; it reads no state category (spec question 1 says "Open means not in the done category" there; at `ec72d1f8` it does not). Home's "Open" (`docs/superpowers/plans/2026-10-03-home.md`, D-E1: `state_category <> 'terminal' AND closed_at IS NULL`) already excludes a Not-taken ticket because that close sets `closed_at`; its done-side counts are not on this tip, so T17 re-greps the Home route when it merges and 29.150 will fail on it.

  No commit (HANDOFF text only).

- [ ] **Step 7: Features bullet, sweeps**

  Put under `<!-- wtg-part2-model T1 bullet -->` (keep the anchor line, T19 reads the bullets below it):
  `- ⚙️ **Part 2 pre-flight** (wtg2 T1; `apps/server/src/tools/wtg-preflight.ts`, `pnpm --filter @gisik-nokma/server run wtg:preflight`) — a READ ONLY report of custom fields that would shadow the new built-ins (ledger events, type rows, claims), existing `decision` types, workflows whose initial state is terminal; exit 1 on a shadow. A source-walking census (`apps/server/test/census/terminal-category-readers.test.ts`) classifies every reader of the terminal category. Cases 29.147-29.152.`
  Checks: `node scripts/check-case-ids.mjs`, `pnpm check:citations`, `pnpm check:tasks`; server `test/tools test/census` suites (LOCAL).

  Commit: `wtg2 T1: Features bullet`.

- [ ] **Step 8: THE RECORDED OWNER STEP (case 29.152)**

  Put this block, verbatim, at the top of `HANDOFF-task-wtg2-preflight.md` and in the PR body, and do not merge the T4 or T5 branches' work until the output is pasted back:
  > **Owner, before wtg2 T4 starts:** run, from a checkout of this branch on your machine,
  > `DATABASE_URL='<the prod connection string from the DigitalOcean database page>' DATABASE_CA_CERT="$(cat <the cluster CA pem>)" pnpm --filter @gisik-nokma/server run wtg:preflight`
  > It opens one READ ONLY transaction and rolls it back. Paste the full output below. **Go for T4:** `shadowing custom fields: none`. **Stop and ask:** any `ledger-definition` line (a rename cannot repair an old event; T4 would need a tolerant legacy parse) or `field-claim` line (existing values would be reread as the new built-in). `decision` and terminal-initial lines are information for T7 and the planner.

  Flip 29.152 to 🧪 only when the output is pasted. Push. DONE + REVIEW (NEEDS: nothing; the dev-run output, the Step 1 tip/stamp result, and the owner block above in the HANDOFF).

**Mutations:** 29.147 scan only `proj_ticket_types` → superseded, claim assertions red. 29.148 drop `rankMatchesSeed` comparison → the rank-5 row reads true. 29.149 drop the `max(version)` clause → `fixed` appears. 29.150 drop the comment filter → `docblock.ts` appears in the control. 29.151 drop `BEGIN READ ONLY` → the INSERT inside succeeds.

---

### Task 2: `leads_to` and its label: events, engine rules, permission, projection, History, redaction (cases 29.120-29.127)

**Branch:** `task/wtg2-leads-to` from `origin/release/workflow-graph`; PR `--base release/workflow-graph`. **Needs:** typed-links T1-T4 merged (T2-T4 are plan text only on the knowledge-graph tip: this task is written as the DELTA on their shapes, cited as "typed-links T<n> `symbol`"); the Drafts task that adds the `from` member to both link payloads (R42-R44; no Drafts plan file exists at drafting time, so re-read the merged `ticket-events.ts` and `checks/links.ts` first and keep every Drafts line).

**Files:**
- Create: `packages/domain/src/link-label.ts`; `packages/domain/test/link-label.test.ts`; `apps/server/migrations/1792100000000_proj-ticket-links-leads-to.sql` (re-check it still sorts after the highest applied migration; `pnpm check:migrations`); `packages/rule-engine/test/links-leads-to.test.ts` (copy typed-links T3 `test/links.test.ts` helpers); `apps/server/test/permissions/check-leads-to-permission.test.ts` (copy typed-links T3 `check-link-permission.test.ts`); `packages/app-core/test/precheck-leads-to.test.ts` (copy typed-links T3 `precheck-links.test.ts`); `apps/server/test/projections/ticket-links-leads-to.test.ts` (copy typed-links T2 `ticket-links.test.ts` setup).
- Modify: `packages/domain/src/index.ts:19` (export `link-label.js` beside `display-name.js`); `packages/domain/src/events/ticket-events.ts:216-232` (kind list, payload, imports `:1-4`); `packages/domain/src/ticket-types.ts:123` (`DECISION_TYPE_ID`); `packages/domain/src/entity-state.ts:129` (`TicketLink`); `packages/domain/src/ticket-state.ts:463-468` (add arm); `packages/rule-engine/src/checks/refusals.ts` (two keys + builder, beside typed-links T3's `link.*`); `packages/rule-engine/src/checks/links.ts` (typed-links T3 `checkTicketLink`); `apps/server/src/projections/ticket-links.ts` (typed-links T2); `apps/server/src/read/ticket-links.ts`, `apps/server/src/routes/ticket-history.ts` (typed-links T4); `packages/app-core/src/view-types.ts`, `online/mappers.ts` (`mapTicketState`, `mapTicketLinks`), `replica/replica-data-source.ts` (`getTicketLinks`) (typed-links T4); `packages/app-core/src/views/history-copy.ts:226-235`; `packages/mcp-server/src/tools/ticket-tools.ts:41-44` (`redactedPayload`) and typed-links T4's `link_tickets`; `packages/mcp-server/src/tools/read-tools.ts` (typed-links T4's `get_ticket.links` map); `apps/mobile/src/editor/editor-html.generated.ts` (regenerated).
- Tests extended: `packages/domain/test/ticket-link-events.test.ts:92-105` (27.008 pins three readings rows with `toEqual`: it goes red on purpose, edited in Step 2); `apps/server/test/census/ticket-vocabulary-census.test.ts`; `packages/app-core/test/views/history-copy.test.ts` (27.005 block); `packages/mcp-server/test/redacted-payload.test.ts` (27.006).

**Interfaces:**
- Consumes: typed-links T1 `TICKET_LINK_KINDS`, `linkReading`, `TicketLink`, `payloadIds`, `redactedPayload`; T2 `proj_ticket_links`; T3 `checkTicketLink`, `REFUSALS`, `linkExistsRefusal`; T4 `TicketLinkWire`, `TicketLinkView`; Drafts' optional `from` on both payloads.
- Produces (domain): `TICKET_LINK_KINDS = ['blocks','relates','duplicates','leads_to']`; `linkLabelSchema`; `LINK_LABEL_MAX = 60`; `normaliseLinkLabel(label: string): string`; `linkReading('leads_to','out') = 'leads to'`, `('in') = 'comes after'`; `TicketLink = { kind; targetId; label?: string }` (`label` ABSENT when none; Drafts' `from` stays beside it); **`DECISION_TYPE_ID = 'decision'`** (see Why).
- Produces (rule-engine): refusals `link.label-required`, `link.label-duplicate`; `labelDuplicateRefusal(label: string): string`.
- Produces (wire): `TicketLinkWire.label?: string`, `TicketLinkView.label?: string` (T3 renders them).

**Why `DECISION_TYPE_ID` is exported here, not by T5.** The label rules must recognise a Decision by `typeId === DECISION_TYPE_ID` (spec DC-1). `ticket-types.ts` imports only `zod`, `display-name` and `ist-day` (read `:1-3`), and `ticket-events.ts:4` already imports from it, so one `export const` beside `SUB_TASK_TYPE_ID` (`:123`) cannot cycle; rule-engine already depends on domain. A bare `'decision'` in engine code would leave a duplicate string for T5 to hunt. T5 therefore CONSUMES the constant and adds only the seed (parent: change T5's Produces line). Until T5 lands no ticket has that type, so the rules are dormant in production; the tests define a `decision` type locally.

**Why the label is refused when blank, never trimmed.** `display-name.ts`'s docblock: the ledger stores the claim as made, "it REFUSES rather than trims". A zod `.trim()` is a transform, so the folded value would differ from the stored payload. `linkLabelSchema` therefore has the `displayName` construction plus `.max(60)`; trimming and case folding live only in `normaliseLinkLabel`, used by comparisons. The UI (T3) trims before sending, so stored labels are trimmed in practice. `ticket.decided.outcome` (T5) takes the same construction.

**Why `ticketLinkAddedPayload` stays one strict object plus refines.** Every use in the tree is `.parse` / `.safeParse` (grep at drafting: `vocabulary.ts:278`, `ticket-state.ts:464`, tests), so the schema becoming a `ZodEffects` breaks nothing; re-grep `ticketLinkAddedPayload\.\(shape\|extend\|pick\|omit\)` before the edit. `ticket.link_removed` gets NO label member (spec LK-2: "unchanged").

- [ ] **Step 1: Case lines, then the RED domain tests (29.120, 29.121)**

  Under `<!-- wtg-part2-model T2 -->` in `test-cases/29-workflow-timeline-graphs.md`, all ❌:
  - `- ❌ **29.120 — `leads_to` is a fourth link kind and `label` an optional member of `ticket.link_added` only: accepted on `leads_to` up to 60 characters, refused on `blocks`/`relates`/`duplicates` at parse time, refused blank and at 61 characters, and refused on `ticket.link_removed` (strict); `normaliseLinkLabel(" Yes ")` equals `normaliseLinkLabel("yes")`, and `leads_to` reads "leads to" / "comes after";** control: the same payload without a label parses on every kind. Mutation: drop the `refine` → the `blocks` + label case parses.`
  - `- ❌ **29.121 — the fold keeps `label` on a `leads_to` link and writes NO `label` key when there is none; a second add of the same ordered pair is a no-op even with another label; a relabel (remove then add) ends with the new label;** control: a `blocks` link folds to `{kind, targetId}` exactly. Mutation: fold `label: p.label ?? null` → the no-key assertion fails.`
  - `- ❌ **29.122 — the engine accepts a two-ticket loop (A leads to B with B leads to A stored) and a label-free `leads_to` between ordinary tickets, refuses a self-link and the same ordered pair again (`link.duplicate`, even with another label);** control: the same shape with `blocks` is still refused `link.reverse`. Mutation: leave the reverse check unguarded → the loop is refused.`
  - `- ❌ **29.123 — a `leads_to` whose SOURCE is a Decision needs a label (`link.label-required`) and a label no sibling branch already has after trim and case folding (`link.label-duplicate`, naming only the label); a relabel (remove then add) may reuse the freed label but not a sibling's; a draft-side `from` form is judged on `from`;** control: the same unlabeled link from a Task, and the same label on a second Decision or a second Task, are accepted. Mutation: compare labels without `normaliseLinkLabel` → " yes " is accepted.`
  - `- ❌ **29.124 — the permission gate and the client precheck treat `leads_to` like the other kinds: a member who cannot see the target is refused `permission.visibility` with the one sentence, and the precheck predicts `link.label-required` word for word from the cache;** control: a visible target passes the gate and a labelled link passes the precheck. Mutation: skip the target `canSee` for `leads_to` → the hidden target passes.`
  - `- ❌ **29.125 — `proj_ticket_links` accepts kind `leads_to` and stores `label` (NULL for other kinds); the Postgres CHECK refuses an unknown kind and a label on a non-`leads_to` row; a relabel batch rewrites the row; `proj_tickets.links` reads back through `rowToTicketState` with the label; a rebuild equals the live tables;** control: a `blocks` row keeps `label` NULL. Mutation: omit `label` from the INSERT → the stored label is NULL.`
  - `- ❌ **29.126 — the label shows everywhere the link does: `describeEvent` reads `Linked: leads to GN-147 (Yes)` (withheld target: `Linked: leads to a ticket you can't see (Yes)`), the History route keeps `label` when it withholds a target, `redactedPayload` keeps it, `GET …/links` / `getTicketLinks` (online and replica) / `get_ticket.links` carry it, and `link_tickets` still refuses kind `leads_to` until Part 5; and a non-author NEVER sees a `leads_to` edge whose end is someone else's draft (planner ruling B): the published ticket's `GET …/links`, its `ticketState.links` (so `get_ticket.links`) and its History carry neither the edge nor a count of it (the list length and the History length are what they were before the draft linked);** control: a label-free link reads exactly as before, and in the SAME `it()` the draft's author, on the draft's own sheet, sees the edge with its label. Mutation: drop `label` from the withheld payload → the hidden-target sentence loses `(Yes)`; let the label select bypass Drafts T6's `ends` filter (or skip the `ticketState` link filter for `leads_to`) → the stranger's read lists the edge.`
  - `- ❌ **29.127 — THE CENSUS (link label): `payloadIds` names only the target of a labelled link (a label that looks like a ULID is not an id), every kind in `TICKET_LINK_KINDS` has both readings, `describeEvent` and `redactedPayload` handle every kind, and the regenerated mobile bundle knows `leads_to`;** control: the planted-registration control of 27.004 still fires. Mutation: scan every string member in `payloadIds` → the ULID-shaped label is reported.`

  `packages/domain/test/link-label.test.ts` (imports as `ticket-link-events.test.ts:1-18`; `bornState`, `deps`, `link` helpers copied from that file with a `label` parameter):
  ```ts
  import { describe, expect, it } from 'vitest';
  import {
    applyTicketEvent, linkReading, makeEnvelope, newUlid, normaliseLinkLabel, parseEvent,
    TICKET_LINK_KINDS, ticketLinkAddedPayload, ticketLinkRemovedPayload,
  } from '../src/index.js';

  const TARGET = newUlid();
  describe('29.120 leads_to and its label', () => {
    it('29.120 label only on leads_to, 1..60 non-blank, never on link_removed; readings; normalisation', () => {
      expect(TICKET_LINK_KINDS).toEqual(['blocks', 'relates', 'duplicates', 'leads_to']);
      const ok = (p: object) => ticketLinkAddedPayload.safeParse(p).success;
      expect(ok({ kind: 'leads_to', targetId: TARGET, label: 'Yes' })).toBe(true);
      expect(ok({ kind: 'leads_to', targetId: TARGET, label: 'y'.repeat(60) })).toBe(true);
      expect(ok({ kind: 'leads_to', targetId: TARGET, label: 'y'.repeat(61) })).toBe(false);
      expect(ok({ kind: 'leads_to', targetId: TARGET, label: '   ' })).toBe(false);
      expect(ok({ kind: 'leads_to', targetId: TARGET, label: '' })).toBe(false);
      for (const kind of ['blocks', 'relates', 'duplicates']) {
        expect(ok({ kind, targetId: TARGET, label: 'Yes' })).toBe(false);
        expect(ok({ kind, targetId: TARGET })).toBe(true); // control
      }
      expect(ok({ kind: 'leads_to', targetId: TARGET })).toBe(true);
      expect(ticketLinkRemovedPayload.safeParse({ kind: 'leads_to', targetId: TARGET }).success).toBe(true);
      expect(ticketLinkRemovedPayload.safeParse({ kind: 'leads_to', targetId: TARGET, label: 'Yes' }).success).toBe(false);
      expect(normaliseLinkLabel(' Yes ')).toBe(normaliseLinkLabel('yes'));
      expect(normaliseLinkLabel('Yes')).not.toBe(normaliseLinkLabel('No'));
      expect([linkReading('leads_to', 'out'), linkReading('leads_to', 'in')]).toEqual(['leads to', 'comes after']);
      // through the door
      const { serverTime: _s, seq: _q, ...sub } = makeEnvelope({ type: 'ticket.link_added', entity: { kind: 'ticket', id: newUlid() }, payload: { kind: 'blocks', targetId: TARGET, label: 'Yes' } });
      expect(parseEvent(sub).ok).toBe(false);
    });
  });
  ```
  29.121 in the same file, folding with the `ticket-link-events.test.ts` fixtures (`born`, `deps`):
  ```ts
  it('29.121 the fold keeps the label on leads_to only, adds idempotently, relabels by remove+add', () => {
    const a = applyTicketEvent(born, link('ticket.link_added', 'leads_to', TARGET, 'Yes'), deps);
    expect(a.links).toEqual([{ kind: 'leads_to', targetId: TARGET, label: 'Yes' }]);
    expect(applyTicketEvent(a, link('ticket.link_added', 'leads_to', TARGET, 'No'), deps)).toBe(a); // same ordered pair: no-op
    const unlabeled = applyTicketEvent(born, link('ticket.link_added', 'leads_to', TARGET), deps);
    expect('label' in unlabeled.links![0]!).toBe(false);
    const relabelled = applyTicketEvent(applyTicketEvent(a, link('ticket.link_removed', 'leads_to', TARGET), deps), link('ticket.link_added', 'leads_to', TARGET, 'Maybe'), deps);
    expect(relabelled.links).toEqual([{ kind: 'leads_to', targetId: TARGET, label: 'Maybe' }]);
    expect(applyTicketEvent(born, link('ticket.link_added', 'blocks', TARGET), deps).links).toEqual([{ kind: 'blocks', targetId: TARGET }]); // control
  });
  ```
  Run: `/Users/kiro/my_projects/gisik-nokma-lanes/slot-run.sh wtg2-t2-domain -- pnpm --filter @gisik-nokma/domain exec vitest run test/link-label.test.ts --maxWorkers=2 > /tmp/wtg2-t2-domain.log 2>&1; tail -30 /tmp/wtg2-t2-domain.log`. Expected: FAIL (`normaliseLinkLabel` is not exported).
  Commit: `wtg2 T2: case lines 29.120-29.127 and the RED domain tests`.

- [ ] **Step 2: Domain implementation**

  `packages/domain/src/link-label.ts`:
  ```ts
  import { z } from 'zod';

  /** A link label: a branch name such as "Yes". 1..60 characters. */
  export const LINK_LABEL_MAX = 60;

  /**
   * Built like `displayName` (`display-name.ts`): it REFUSES a blank label and stores padding verbatim, because the
   * ledger keeps the claim as it was made. Comparisons go through `normaliseLinkLabel`, never through the stored text.
   */
  export const linkLabelSchema = z
    .string()
    .min(1)
    .max(LINK_LABEL_MAX)
    .refine((value) => value.length === 0 || value.trim() !== '', 'must not be blank: a label of only spaces names nothing');

  /** The one comparison key for labels (LK-3): trim, then fold case. */
  export function normaliseLinkLabel(label: string): string {
    return label.trim().toLocaleLowerCase('en');
  }
  ```
  `index.ts`: `export * from './link-label.js';` after `display-name.js`. `ticket-types.ts` after `SUB_TASK_TYPE_ID`: `/** The built-in Decision type's id (spec DC-1). T5 of the wtg-part2-model plan adds the seed; the label rules (LK-3) read the id from here. */ export const DECISION_TYPE_ID = 'decision';`

  `ticket-events.ts`: import `linkLabelSchema` from `'../link-label.js'`; change the kinds to `['blocks', 'relates', 'duplicates', 'leads_to']`; add `leads_to: { out: 'leads to', in: 'comes after' }` to `READINGS` (`:224-228`, a `Record<TicketLinkKind, …>`, so this is a compile error until added); and on `ticketLinkAddedPayload` add the member and a SECOND refine after any refine the Drafts task wrote (re-read `:218` first; keep `from`):
  ```ts
  export const ticketLinkAddedPayload = z
    .object({ kind: z.enum(TICKET_LINK_KINDS), targetId: ulidString, label: linkLabelSchema.optional() /* , from: <Drafts' line, kept> */ })
    .strict()
    /* .refine(<Drafts' from !== targetId>, …) kept here, */
    .refine((p) => p.label === undefined || p.kind === 'leads_to', { message: 'a label belongs to a leads_to link only', path: ['label'] });
  ```
  `ticketLinkRemovedPayload` is untouched (it picks up the fourth kind from the enum).
  `entity-state.ts:129`: `export type TicketLink = { kind: TicketLinkKind; targetId: string; label?: string /* + Drafts' from */ };` with the docblock line "`label`: a `leads_to` branch name, ABSENT when none".
  `ticket-state.ts:463-468`: the add arm pushes the label only when present (keep the Drafts `from` spread if the arm has one):
  ```ts
      return {
        ...state,
        links: [...links, { kind: p.kind, targetId: p.targetId, ...(p.label === undefined ? {} : { label: p.label }) }],
      };
  ```
  `ticket-link-events.test.ts` 27.008 (`:92-105`): add `['leads_to', 'leads to', 'comes after']` to the expected rows and say in the commit that 27.008 is edited on purpose.

  Run the domain suite WHOLE (`pnpm --filter @gisik-nokma/domain build && … exec vitest run --maxWorkers=2`). Expected: PASS 29.120, 29.121, 27.001-27.008. Flip 29.120, 29.121 ✅.
  Commit: `wtg2 T2: leads_to, the label, DECISION_TYPE_ID and the fold`.

- [ ] **Step 3: The engine rules (29.122, 29.123)**

  `packages/rule-engine/test/links-leads-to.test.ts` (header exactly as typed-links T3 `links.test.ts`, plus a local Decision type):
  ```ts
  import { DECISION_TYPE_ID } from '@gisik-nokma/domain';
  const DECISION = { ...TASK, id: DECISION_TYPE_ID, name: 'Decision', icon: 'diamond' };
  const D = '01J9GTKD100000000000000000';
  const D2 = '01J9GTKE100000000000000000';
  const bornAs = (id: string, title: string, typeId: string): EventEnvelope =>
    makeEnvelope({ type: 'ticket.created', entity: { kind: 'ticket', id }, workspaceId: WS, payload: { typeId, projectId: PROJECT, parentId: null, title } });
  const lead = (source: string, target: string, label?: string): EventEnvelope =>
    makeEnvelope({ type: 'ticket.link_added', entity: { kind: 'ticket', id: source }, workspaceId: WS, payload: { kind: 'leads_to', targetId: target, ...(label === undefined ? {} : { label }) } });
  const unlead = (source: string, target: string): EventEnvelope =>
    makeEnvelope({ type: 'ticket.link_removed', entity: { kind: 'ticket', id: source }, workspaceId: WS, payload: { kind: 'leads_to', targetId: target } });
  const world = (...after: EventEnvelope[]) =>
    buildMemoryContext([WF], [typeDefined(TASK), typeDefined(DECISION), born(A, 'Ice maker'), born(B, 'Chiller'), born(C, 'Freezer'), bornAs(D, 'Go ahead?', DECISION_TYPE_ID), bornAs(D2, 'Second look', DECISION_TYPE_ID), ...after]);
  ```
  (`A`, `B`, `C`, `born`, `ok` are typed-links T3's.) Tests:
  ```ts
  it('29.122 loops and label-free links are accepted; self and the same ordered pair are refused; blocks reverse is still refused', async () => {
    expect(await evaluateEvent(lead(A, B), world(lead(B, A)))).toEqual(ok);                    // a two-ticket loop
    expect(await evaluateEvent(lead(A, B), world())).toEqual(ok);                              // label optional off a Decision
    expect((await evaluateEvent(lead(A, A), world()))).toMatchObject({ rule: 'link.self' });
    expect(await evaluateEvent(lead(A, B, 'x'), world(lead(A, B)))).toEqual({
      refused: true, rule: 'link.duplicate', reason: '"Ice maker" already leads to "Chiller".' });
    const block = (s: string, t: string) => link(s, 'blocks', t);                              // control
    expect(await evaluateEvent(block(A, B), world(block(B, A)))).toMatchObject({ rule: 'link.reverse' });
  });
  it('29.123 a Decision source needs a unique label; relabel frees the old one; from-form is judged on from', async () => {
    expect(await evaluateEvent(lead(D, B), world())).toEqual({ refused: true, rule: 'link.label-required',
      reason: 'Name the branch: a link from a Decision needs a label, such as "Yes" or "No".' });
    expect(await evaluateEvent(lead(D, B, 'Yes'), world())).toEqual(ok);                        // control
    expect(await evaluateEvent(lead(A, B), world())).toEqual(ok);                               // control: a Task
    const yes = world(lead(D, B, 'Yes'));
    expect(await evaluateEvent(lead(D, C, ' yes '), yes)).toEqual({ refused: true, rule: 'link.label-duplicate',
      reason: 'This Decision already has a branch labelled "yes".' });
    expect(await evaluateEvent(lead(D, C, 'No'), yes)).toEqual(ok);
    expect(await evaluateEvent(lead(D2, C, 'Yes'), yes)).toEqual(ok);                           // another Decision
    const tasks = world(lead(A, B, 'Yes'));
    expect(await evaluateEvent(lead(A, C, 'Yes'), tasks)).toEqual(ok);                          // a Task may repeat a label
    // relabel = remove then add (LK-4): the freed label is reusable, a sibling's is not
    const two = world(lead(D, B, 'Yes'), lead(D, C, 'No'));
    const afterRemove = world(lead(D, B, 'Yes'), lead(D, C, 'No'), unlead(D, B));
    expect(await evaluateEvent(lead(D, B, 'Maybe'), afterRemove)).toEqual(ok);
    expect(await evaluateEvent(lead(D, B, 'Yes'), afterRemove)).toEqual(ok);
    expect(await evaluateEvent(lead(D, B, 'no'), afterRemove)).toMatchObject({ rule: 'link.label-duplicate' });
    expect(await evaluateEvent(lead(D, B, 'Maybe'), two)).toMatchObject({ rule: 'link.duplicate' }); // control: no removal first
  });
  ```
  Add a third `it` for the draft form after reading the Drafts R42 shape in the merged code: an event on the draft X's stream `{kind:'leads_to', targetId: X, from: D}` (X made the way the Drafts task's engine tests make a draft) is refused `link.label-required` without a label and accepted with one, and the same from a Task source is accepted unlabeled.

  Run: `slot-run.sh wtg2-t2-engine -- pnpm --filter @gisik-nokma/rule-engine exec vitest run test/links-leads-to.test.ts --maxWorkers=2 > /tmp/wtg2-t2-engine.log 2>&1; tail -40 /tmp/wtg2-t2-engine.log`. Expected: FAIL (the loop is refused `link.reverse`; no label rule).

  `refusals.ts`, beside typed-links T3's `link.absent`:
  ```ts
    /** Leads-to labels (workflow-timeline-graphs LK-3). The duplicate reason is built by `labelDuplicateRefusal`; it names the label only. */
    'link.label-required': 'Name the branch: a link from a Decision needs a label, such as "Yes" or "No".',
    'link.label-duplicate': 'This Decision already has a branch with that label.',
  ```
  ```ts
  /** The duplicate reason names ONLY the label: the sibling's target may be a ticket this reader cannot see, so no title. */
  export function labelDuplicateRefusal(label: string): string {
    return `This Decision already has a branch labelled "${label.trim()}".`;
  }
  ```
  `checks/links.ts` (typed-links T3's `checkTicketLink`): import `DECISION_TYPE_ID, normaliseLinkLabel` from `@gisik-nokma/domain` and `labelDuplicateRefusal`; guard the reverse branch and add the label block before the final `return ACCEPT;`:
  ```ts
    if (kind !== 'leads_to' && holds(target, kind, source.id)) {      // rules 4 and 5 do not apply to leads_to (LK-3.2)
      return refuse(kind === 'relates' ? 'link.duplicate' : 'link.reverse', linkExistsRefusal(kind, titleOf(target), titleOf(source)));
    }
    if (kind === 'leads_to') {
      // The pair's SOURCE: Drafts R42 files the draft-side form on the draft's stream with `from` = the real source.
      const pairSource = parsed.data.from === undefined ? source : await getTicketState(ctx, parsed.data.from);
      if (pairSource === null) return refuse('link.unknown-target');
      if (pairSource.typeId === DECISION_TYPE_ID) {
        if (parsed.data.label === undefined) return refuse('link.label-required');
        const wanted = normaliseLinkLabel(parsed.data.label);
        const clash = (pairSource.links ?? []).some((l) => l.kind === 'leads_to' && l.label !== undefined && normaliseLinkLabel(l.label) === wanted);
        if (clash) return refuse('link.label-duplicate', labelDuplicateRefusal(parsed.data.label));
      }
    }
    return ACCEPT;
  ```
  If the Drafts task already resolves the pair's source into a variable, use it instead of `pairSource` and delete the `from` line. Order matters: `link.duplicate` (same ordered pair) is judged before the label rules, as the test pins.
  Run the rule-engine suite WHOLE. Expected: PASS 29.122, 29.123 and typed-links 27.035-27.042; `engine.test.ts:671-702` unchanged (dotted ids are `REFUSALS` keys, not `REFUSAL_RULES`). Flip ✅.
  Commit: `wtg2 T2: leads_to engine rules (loops allowed, Decision labels)`.

- [ ] **Step 4: Permission and precheck (29.124)**

  `check-leads-to-permission.test.ts`: the typed-links T3 world (`buildReadTestApp`; member sees `taskInEpicId` and `sharedTaskId`, not `hiddenTaskId`); one `it` files `{kind:'leads_to', targetId: hidden, label:'Yes'}` as the member and expects `permission.visibility` with `'The other ticket does not exist in this workspace, or you cannot see it.'`; control: target `sharedTaskId` returns `null`. No production change: the gate keys on event type and `targetId`, not kind (typed-links T3 `check-permission.ts` arm).
  `precheck-leads-to.test.ts`: seed a cache with a Decision (`ticketStateSeed({ id: D, typeId: 'decision', … })`) and a Task; `precheckEvent(lead(D, B), cache)` is `{ kind: 'refused', rule: 'link.label-required', reason: <the literal sentence> }`; with `label: 'Yes'` it is `{ kind: 'passed' }`. No production change either: typed-links T3 routes link events to the shared engine.
  Run both files. Expected: PASS (they pass at once; they are regression pins, so prove them with the mutation in the table). Flip 29.124 ✅.
  Commit: `wtg2 T2: pin the gate and the precheck for leads_to`.

- [ ] **Step 5: Projection (29.125)**

  `1792100000000_proj-ticket-links-leads-to.sql`. The inline `kind text NOT NULL CHECK (...)` of typed-links T2 got Postgres' automatic name `proj_ticket_links_kind_check` (`<table>_<column>_check`); the statement has no `IF EXISTS`, so a wrong name fails loudly, and the test reads the name back:
  ```sql
  -- Up Migration
  -- leads_to (workflow-timeline-graphs LK-5): widen the kind CHECK, add the label. PK stays (source_id, target_id, kind).
  ALTER TABLE proj_ticket_links DROP CONSTRAINT proj_ticket_links_kind_check;
  ALTER TABLE proj_ticket_links ADD CONSTRAINT proj_ticket_links_kind_check CHECK (kind IN ('blocks','relates','duplicates','leads_to'));
  ALTER TABLE proj_ticket_links ADD COLUMN label text NULL;
  ALTER TABLE proj_ticket_links ADD CONSTRAINT proj_ticket_links_label_check CHECK (label IS NULL OR kind = 'leads_to');
  COMMENT ON COLUMN proj_ticket_links.label IS 'A leads_to branch label (the outcome name of a Decision), NULL when none and always NULL on other kinds.';

  -- Down Migration
  DELETE FROM proj_ticket_links WHERE kind = 'leads_to';
  ALTER TABLE proj_ticket_links DROP CONSTRAINT proj_ticket_links_label_check;
  ALTER TABLE proj_ticket_links DROP COLUMN label;
  ALTER TABLE proj_ticket_links DROP CONSTRAINT proj_ticket_links_kind_check;
  ALTER TABLE proj_ticket_links ADD CONSTRAINT proj_ticket_links_kind_check CHECK (kind IN ('blocks','relates','duplicates'));
  ```
  `projections/ticket-links.ts` (typed-links T2): `const { kind, targetId, label } = ticketLinkAddedPayload.parse(event.payload);`, add `label` as the 5th column and `label ?? null` as the matching value in the INSERT (re-number `$n`), keep Drafts' `source_id = from ?? entity id`. `rowToTicketState` and `upsertTicket` need NO change: `proj_tickets.links` stores the fold's objects as JSON, so `label` rides along; the test proves it.

  `ticket-links-leads-to.test.ts` (copy the `beforeAll`/`afterAll`/`applyCommitted`/`makeCommitted` setup of typed-links T2 `ticket-links.test.ts`; its `rows()` helper gains `label`):
  ```ts
  const lead = (type: 'ticket.link_added' | 'ticket.link_removed', source: string, target: string, label?: string) =>
    makeCommitted({ workspaceId: f.WS, actorId: f.ids.owner, entity: { kind: 'ticket', id: source }, type,
      payload: { kind: 'leads_to', targetId: target, ...(label === undefined ? {} : { label }) } });
  it('29.125 label stored, relabel rewrites, CHECKs refuse, links round-trip, rebuild equals live', async () => {
    await applyCommitted(db.pool, [lead('ticket.link_added', f.TP, f.TE, 'Yes'), link('ticket.link_added', f.TP, 'blocks', f.TE)]);
    expect((await rows()).map((r) => [r.kind, r.label])).toEqual([['blocks', null], ['leads_to', 'Yes']]);   // control: blocks NULL
    await applyCommitted(db.pool, [lead('ticket.link_removed', f.TP, f.TE), lead('ticket.link_added', f.TP, f.TE, 'Maybe')]);
    expect((await rows()).find((r) => r.kind === 'leads_to')?.label).toBe('Maybe');
    expect((await getTicketStateFromDb(db.pool, f.TP))?.links).toContainEqual({ kind: 'leads_to', targetId: f.TE, label: 'Maybe' });
    const def = (await db.pool.query("SELECT pg_get_constraintdef(oid) AS d FROM pg_constraint WHERE conname = 'proj_ticket_links_kind_check'")).rows[0].d;
    expect(def).toContain('leads_to');
    const insert = (kind: string, label: string | null) => db.pool.query(
      `INSERT INTO proj_ticket_links (workspace_id, source_id, target_id, kind, label, created_by, created_at, origin, seq) VALUES ($1,$2,$3,$4,$5,$6,now(),'web',1)`,
      [f.WS, f.TE, f.TP, kind, label, f.ids.owner]);
    await expect(insert('parent', null)).rejects.toMatchObject({ code: '23514' });
    await expect(insert('blocks', 'Yes')).rejects.toMatchObject({ code: '23514' });
    await expect(insert('leads_to', 'Yes')).resolves.toBeDefined();
    await db.pool.query("DELETE FROM proj_ticket_links WHERE source_id = $1 AND target_id = $2 AND label = 'Yes'", [f.TE, f.TP]); // a hand-made row has no ledger event
    const verdict = await verifyProjections({ pool: db.pool, projections: buildProjectionRegistry() });
    expect(verdict.clean, JSON.stringify(verdict.diffs)).toBe(true);
  });
  ```
  Run with `pnpm check:migrations` and the server `test/projections` folder. Expected: PASS. Flip 29.125 ✅.
  Commit: `wtg2 T2: proj_ticket_links takes leads_to and a label`.

- [ ] **Step 6: History, redaction, reads, MCP, census, mobile bundle (29.126, 29.127)**

  Edits (each `label` is optional and absent when none, the domain's shape):
  - `history-copy.ts:226-235`: `const label = str(payload, 'label'); … return `${verb}: ${linkReading(kind as TicketLinkKind, 'out')} ${other}${label === null ? '' : ` (${label})`}`;`. This follows the tip's shape, which never names the source key (`Linked: leads to GN-147 (Yes)`); spec LK-6's "Linked: GN-144 leads to GN-147 (Yes)" is a FINDING (below).
  - `routes/ticket-history.ts` (typed-links T4 withheld branch): `e.payload = { kind: p.kind, targetId: null, ...(p.label === undefined ? {} : { label: p.label }) };` with `p` typed `{ kind: string; targetId: string; label?: string }`.
  - `ticket-tools.ts:42-44`: `{ kind: payload['kind'], target: "a ticket you can't see", ...(payload['label'] === undefined ? {} : { label: payload['label'] }) }`.
  - Wire: `read/ticket-links.ts` selects `l.label` and spreads `...(r.label === null ? {} : { label: r.label })` onto the wire row (`TicketLinkWire.label?: string`); `view-types.ts` `TicketLinkView.label?: string`; `mappers.ts` `mapTicketLinks` reads `label` with `asString` when present and `mapTicketState` keeps `label` on each `links` entry (validate with `asString`, leave the key absent otherwise); `replica-data-source.ts` `getTicketLinks` passes `l.label` into `view(...)` (add a `label?: string` argument, spread when defined); `read-tools.ts` `get_ticket.links` map adds the same spread.
  - **No edge to someone else's draft (planner ruling B, case 29.126).** The `l.label` select goes into the SAME statement as Drafts T6's `ends` filter (`read/ticket-links.ts`, Drafts plan T6 Step 5: other end `LIVE_TICKET_WHERE AND visibleTicketsWhere`, own drafts only on the draft's own sheet), never a second statement or a count that skips it; the `ticketState` link filter in `routes/tickets.ts` (Drafts T6) runs BEFORE the label spread, so `get_ticket.links` (via `read-tools.ts`) inherits it; the History withheld branch above changes no visibility (a draft's edge is on the draft's stream, Drafts R42 and owner ruling O1, so the published ticket's History holds no event naming it). No path counts links separately from the filtered list.
  - `link_tickets` (typed-links T4) must NOT start accepting `leads_to` (it has no label argument; Part 5 owns it): replace `z.enum(TICKET_LINK_KINDS)` in both schemas by a local `const LINK_TICKETS_KINDS = TICKET_LINK_KINDS.filter((k) => k !== 'leads_to') as ['blocks', 'relates', 'duplicates']` and `z.enum(LINK_TICKETS_KINDS)`, with a comment naming Part 5.

  Tests, ids in the names:
  - `history-copy.test.ts`, inside the 27.005 describe: `describe('29.126 …')` with `linkEvent` extended by a `label` member: `expect(describeEvent(…('ticket.link_added','leads_to',{key:'GN-147'},'Yes'))).toBe('Linked: leads to GN-147 (Yes)')`; withheld `"Linked: leads to a ticket you can't see (Yes)"`; no label `'Linked: leads to GN-147'`; census loop `for (const kind of TICKET_LINK_KINDS) expect(describeEvent(linkEvent('ticket.link_added', kind, { key: 'GN-1' }))).not.toBe('ticket.link_added')` (29.127).
  - `redacted-payload.test.ts`: `redactedPayload('ticket.link_added','e1',{ kind:'leads_to', targetId:null, label:'Yes' })` equals `{ kind:'leads_to', target:"a ticket you can't see", label:'Yes' }` (29.126); census loop over every kind (29.127); in `ticket-tools.test.ts` a `link_tickets` call with `kind: 'leads_to'` rejects at the input schema before anything is sent (29.126).
  - `apps/server/test/routes/ticket-links.test.ts` (typed-links T4): a `leads_to` row with label `Yes` appears on `GET …/links` with `label: 'Yes'` in both directions and a label-free row has no `label` key; the History route's hidden-target event keeps `payload.label`. Replica/mapper cases: extend typed-links 27.061 and 27.063 with a labelled link (`mapTicketLinks` keeps it; `getTicketLinks` returns it for `out` and `in`). All named 29.126.
  - Ruling B, same file (`ticket-links.test.ts`), ONE `it('29.126 a stranger never sees a leads_to edge to someone else\'s draft; the author does')` (Drafts' draft helpers, as Drafts 28.117 builds them): published S, the member's draft D, a from-form `{kind:'leads_to', targetId: D, from: S, label: 'Yes'}` on D's stream. As another member AND as the owner: `GET …/tickets/S/links` has no row naming D and its length equals the length read before the link was filed; `GET …/tickets/S` `ticketState.links` has no entry naming D; `GET …/tickets/S/history` has no event naming D or `Yes`, same length as before. CONTROL in the same `it()`: the author's `GET …/tickets/D/links` lists S as `in` with `label: 'Yes'`. Then publish D: the owner's S read lists D as `out` with `label: 'Yes'` (the R44 re-file).
  - Census, `ticket-vocabulary-census.test.ts` (append inside the 27.004 file, new `describe('29.127 …')`):
    ```ts
    it('29.127 payloadIds names only the target of a labelled link; every kind reads both ways', () => {
      const T = '01J9GTKB000000000000000000';
      const lookalike = '01J9GTKC000000000000000000';
      expect(payloadIds('ticket.link_added', { kind: 'leads_to', targetId: T, label: lookalike })).toEqual([['ticket', T]]);
      expect(payloadIds('ticket.link_added', { kind: 'leads_to', targetId: T, label: 'Yes' })).toEqual([['ticket', T]]);
      for (const kind of TICKET_LINK_KINDS) for (const dir of ['out', 'in'] as const) expect(linkReading(kind, dir).length).toBeGreaterThan(0);
    });
    ```
    Fanout needs no new arm (the no-op arm `fanout.ts:390` matches by event type); `check-purged.ts` needs none (a label is not an id).
  - Mobile bundle: `pnpm --filter @gisik-nokma/editor run build:webview && pnpm --filter @gisik-nokma/mobile run generate:editor-html`, then `grep -c leads_to apps/mobile/src/editor/editor-html.generated.ts` must print at least 1. `generate-editor-html.mjs --check` WARNS and exits 0 when the webview bundle is unbuilt (read its header), so it proves nothing until the first command has run; the `grep` is the real assertion.

  Run (LOCAL): build domain, rule-engine, app-core, mcp-server; app-core, mcp-server, sync-client and server WHOLE (an online-mapper change reaches the server integration files); `pnpm check:migrations`, `pnpm check:citations`, `node scripts/check-case-ids.mjs`. Expected: PASS. Flip 29.124-29.127 as each test lands.
  Commit: `wtg2 T2: the label in History, redaction, reads and the census`.

- [ ] **Step 7: Features, mutations, DONE**
  - **Features:** put under `<!-- wtg-part2-model T2 bullet -->` (keep the anchor line, T19 reads the bullets below it) `- ⚙️ **Leads-to links: a fourth link kind with a branch label** (`packages/domain/src/events/ticket-events.ts`, `link-label.ts`, `packages/rule-engine/src/checks/links.ts`, `apps/server/migrations/1792100000000_proj-ticket-links-leads-to.sql`) — "A leads to B" with an optional label (required, and unique per Decision, when the source is a Decision); loops allowed; relabel is remove + add; History reads "Linked: leads to GN-147 (Yes)". Cases 29.120-29.127.`
  - **Mutations (each must go red, then be reverted):**

    | Case | Mutation | Expected red |
    |---|---|---|
    | 29.120 | drop the label `refine` | `blocks` + label parses |
    | 29.121 | fold `label: p.label ?? null` | no-key assertion |
    | 29.122 | remove the `kind !== 'leads_to' &&` guard | loop refused `link.reverse` |
    | 29.123 | compare `l.label === parsed.data.label` | `' yes '` accepted |
    | 29.123 | judge on `source` instead of `pairSource` | draft-form case |
    | 29.124 | skip the target `canSee` for `leads_to` | hidden target passes |
    | 29.125 | omit `label` from the INSERT | stored label NULL |
    | 29.126 | drop `label` from the withheld payload | sentence loses `(Yes)` |
    | 29.126 | select the label in a second statement without Drafts T6's `ends` filter | the stranger's S read lists D (ruling B) |
    | 29.127 | `payloadIds` scans every string member | lookalike label reported |

  Push. DONE + REVIEW (NEEDS: none; the Links UI is T3).

---

### Task 3: The Links section: "Leads to", the label, relabel and grouping (cases 29.128-29.133)

**Lane prompt names `frontend-design`.** Geometry (the 44px rows, the 390px layout) is measured only on the primary stack (rule #23), never in a lane worktree.

**Branch:** `task/wtg2-leads-to-ui` from `origin/release/workflow-graph`; PR `--base release/workflow-graph`. **Needs:** T2 (the label on `TicketLinkView`, the engine rules); typed-links T5 (`ticket-links-section.tsx` is plan text only on the knowledge-graph tip: this task is the DELTA on its symbols `CHOICES`, `GROUP_ORDER`, `readingOf`, `eventFor`, `file`, the row markup and the picker body; re-read the merged file first).

**Files:**
- Modify: `packages/app-core/src/views/ticket-links-section.tsx` (typed-links T5); `packages/app-core/src/views/ticket-sheet.tsx` (the `<TicketLinksSection …/>` mount typed-links T5 placed between the `{phone ? descriptionSection : null}` block and the rollup line; `state.typeId` is in scope there, read at `:2429`); `packages/ui/src/ui.css` (inside the `/* Knowledge Graph A: ticket links */` block typed-links T5 opened); `docs/manual.md` §5 (typed-links T5's "Linking tickets" paragraph).
- Create: `packages/app-core/test/views/ticket-links-leads-to.test.tsx` (copy typed-links T5 `ticket-links-section.test.tsx`: `Harness`, `row`, `make`, `COMMIT`, `createFakeDataSource`, the `viewport({ phone })` stub of `board-phone.test.tsx:29-40`).
- Test (sheet): the file typed-links T5 step 3 put 27.074 in (`packages/app-core/test/views/ticket-sheet*.test.tsx`).

**Interfaces:**
- Consumes: T2's `TicketLinkView.label?: string`, `LINK_LABEL_MAX`, `normaliseLinkLabel`, `DECISION_TYPE_ID` (all `@gisik-nokma/domain`); typed-links T5's `TicketLinksSectionProps`, `MakeSubmitted`, `PrecheckResult`; **Drafts T8's draft routing (planner ruling A, 2026-10-04): on a draft's sheet Drafts T8 makes the EXISTING Links section (and the parent/child controls) file through the draft-side `from` form of Drafts T6 (adding a link, removing one, setting a parent); this task builds the "Leads to" UI on that path and owns no routing of its own** (re-read the merged section for the draft flag's prop name and the routing helper; if they are absent, STOP `NEEDS: Drafts T8`).
- Produces: `TicketLinksSectionProps.isDecision: boolean` (is THIS ticket a Decision; the sheet passes `state.typeId === DECISION_TYPE_ID`) (the draft flag is Drafts T8's prop, consumed, not produced here). No other prop changes. The toast state becomes `{ label: string; undo: () => Promise<void> }` (it held a `SubmittedEvent`): a relabel's Undo is two events, not one.

**What the section can and cannot know.** `queryTickets` results carry `{ticketId, projectId, key, title}` and no `typeId` (typed-links T5 props), so the type of the OTHER ticket is unknown. Choice table delta, in the style of typed-links T5's:

| Choice | Stream | Payload | Label |
|---|---|---|---|
| Leads to | this | `{kind:'leads_to', targetId: other, label?}` | required when `isDecision`, else optional |
| Comes after | other | `{kind:'leads_to', targetId: this, label?}` | optional here; the engine refuses `link.label-required` when the OTHER ticket is a Decision, and that sentence shows beside Add (typed-links 27.067 path) |
| Comes after, THIS ticket a draft | this (the draft) | `{kind:'leads_to', targetId: this, from: other, label?}` (Drafts R42 from-form, through Drafts T8's routing) | as the row above |

**Why a draft's links never touch the other stream (owner ruling O1, 2026-10-04: "everything about a draft is not solid yet. a discard removes everything, even a connection or a link").** A `leads_to` or Decision edge touching a draft lives ONLY on the draft's stream: the published ticket shows nothing of it until publish (the R44 re-file makes it real), and a discard erases it with the draft (Drafts 28.102). Drafts R43 refuses a plain `ticket.link_added` on a public stream naming a draft (`draft.link-form`), so a "Comes after" from a draft's sheet that went to the other stream would be refused, never filed. Every choice that would file on the OTHER stream (`onOther`) therefore files, on a draft's sheet, the from-form on THIS draft's stream, and so do its removal, its relabel pair and their Undo (`ticket.link_removed` carries the same `from`). **The routing is Drafts T8's (planner ruling A): this task only puts `leads_to` and its label on that path.** From a published ticket's sheet a draft is never offered (the picker's search reads `LIVE_TICKET_WHERE`, which excludes drafts), so no other row changes.

**Why relabel compensates instead of trusting one batch.** LK-4 calls a relabel "one batch", but `ingestBatch` commits each event on its own and "never rolls back its neighbours" (`apps/server/src/ingest/ingest-service.ts:56-58`), and Drafts T5b's `ingestClientAtomic` is reachable only through `POST …/drafts/publish`, not through a generic route. A removal that commits followed by an add the engine refuses (a sibling's label) would LOSE the branch. So the section (a) checks the new label against this Decision's other outgoing labels locally with `normaliseLinkLabel`, (b) sends `[link_removed, link_added]` in one `ingest` call, and (c) when the second event is not committed, files the original `link_added` again and shows the refusal. The client precheck is not used for the add: the cache still holds the pair, so it would answer `link.duplicate`.

- [ ] **Step 1: Case lines, then the RED tests (29.128-29.133)**

  Under `<!-- wtg-part2-model T3 -->`, all ❌:
  - `- ❌ **29.128 — the Add link picker offers "Leads to" and "Comes after"; with a label typed, "Leads to" files ONE `ticket.link_added {kind:'leads_to', targetId, label}` on THIS ticket's stream (label trimmed) and "Comes after" files it on the OTHER ticket's stream with `targetId` = this ticket; on a DRAFT's sheet "Comes after" files the Drafts from-form `{kind:'leads_to', targetId: this, from: other, label}` on the draft's OWN stream and nothing reaches the published ticket's stream (owner ruling O1);** control: with no label the payload has no `label` member at all. Mutation: file "Comes after" on this stream → the stream assertion fails; send `leads_to` around Drafts T8's draft routing → the draft case files on the other stream.`
  - `- ❌ **29.129 — leads-to rows are grouped under "Leads to" and "Comes after", each row shows its label as a chip, Remove is named with the label, and Undo of a removal re-adds the link WITH its label;** control: a label-free row has no chip. Mutation: build the Undo event without the label → the re-added payload lacks `label`.`
  - `- ❌ **29.130 — on a Decision, "Leads to" cannot be added until the label is non-blank (the result buttons are disabled and a hint says why; nothing is sent), and the ticket sheet passes `isDecision` from the ticket's type;** control: on a Task the same add is enabled with no label, and "Comes after" is enabled on a Decision, where an engine `link.label-required` refusal shows beside Add. Mutation: ignore `isDecision` → the Decision add is enabled.`
  - `- ❌ **29.131 — "Edit label" on a leads-to row files `[ticket.link_removed, ticket.link_added]` in ONE ingest call, in that order, on the stored source's stream, shows "Relabelled: leads to GN-147 (Maybe)" with an Undo that restores the old label the same way, and a double click on Save files it once;** control: Save with the label unchanged files nothing. Mutation: file the add before the removal → the order assertion fails.`
  - `- ❌ **29.132 — a relabel to a label a sibling branch already has (after trim and case folding) is refused locally with the engine's sentence and sends nothing; when the server commits the removal and refuses the add, the section files the original link again and shows the server's reason, so the branch is never lost;** control: a relabel the server accepts files exactly one call. Mutation: drop the compensation → the second ingest call is missing.`
  - `- ❌ **29.133 — on a phone (≤40rem) the label input sits in the "Add link" bottom sheet and the relabel form is reachable in the row; on desktop the picker is the Popover;** control: the same controls exist at both widths. Geometry (44px targets at 390px) is recorded from the primary stack in Step 5.`

  `ticket-links-leads-to.test.tsx` (header and helpers as typed-links T5's test file; `row` gains a `label` argument; the Harness forwards `isDecision`):
  ```tsx
  const row = (kind: TicketLinkView['kind'], direction: 'out' | 'in', key: string, label?: string, id = OTHER): TicketLinkView => ({
    kind, direction, ...(label === undefined ? {} : { label }), ticket: { id, projectId: 'p', key, title: `Title ${key}`, stateCategory: 'open' },
  });
  const PICK = { ticketId: OTHER, projectId: 'p', key: 'GN-133', title: 'Chiller' };
  /** Select "Link type" by its option label: reuse the helper typed-links 27.066 settled on in ticket-links-section.test.tsx if it differs. */
  async function chooseKind(name: string) {
    await userEvent.click(screen.getByLabelText('Link type'));
    await userEvent.click(await screen.findByRole('option', { name }));
  }
  const flat = (s: ReturnType<typeof createFakeDataSource>) => s.ingested.flat().map((e) => [e.type, e.entity.id, e.payload]);

  it('29.128 Leads to / Comes after file on the right stream; the label is trimmed; no label, no member', async () => {
    const source = createFakeDataSource({ getTicketLinks: async () => [] }, COMMIT);
    render(<Harness dataSource={source} workspaceId={WS} ticketId={TICKET} canEdit isDecision={false} make={make} queryTickets={async () => [PICK]} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Add link' }));
    await chooseKind('Leads to');
    await userEvent.type(screen.getByLabelText('Link label'), '  Yes ');
    await userEvent.click(await screen.findByRole('button', { name: 'GN-133 Chiller' }));
    expect(flat(source)).toEqual([['ticket.link_added', TICKET, { kind: 'leads_to', targetId: OTHER, label: 'Yes' }]]);
    await userEvent.click(await screen.findByRole('button', { name: 'Add link' }));
    await chooseKind('Comes after');
    await userEvent.click(await screen.findByRole('button', { name: 'GN-133 Chiller' }));
    const second = source.ingested.flat()[1]!;
    expect([second.entity.id, second.payload]).toEqual([OTHER, { kind: 'leads_to', targetId: TICKET }]);
    expect('label' in (second.payload as object)).toBe(false);
  });
  it('29.128 on a draft\'s sheet Comes after files the from-form on the DRAFT\'s stream, never on the published ticket\'s (owner ruling O1)', async () => {
    const source = createFakeDataSource({ getTicketLinks: async () => [] }, COMMIT);
    render(<Harness dataSource={source} workspaceId={WS} ticketId={TICKET} canEdit isDecision={false} isDraft make={make} queryTickets={async () => [PICK]} />); // `isDraft`: Drafts T8's prop name; re-read the merged section and rename here if it differs
    await userEvent.click(await screen.findByRole('button', { name: 'Add link' }));
    await chooseKind('Comes after');
    await userEvent.type(screen.getByLabelText('Link label'), 'Yes');
    await userEvent.click(await screen.findByRole('button', { name: 'GN-133 Chiller' }));
    expect(flat(source)).toEqual([['ticket.link_added', TICKET, { kind: 'leads_to', targetId: TICKET, from: OTHER, label: 'Yes' }]]);
    expect(source.ingested.flat().some((e) => e.entity.id === OTHER)).toBe(false); // nothing reaches the published ticket's stream
  });
  it('29.131 relabel is one remove+add call, ordered, undoable, once per double click; unchanged files nothing', async () => {
    let stored = [row('leads_to', 'out', 'GN-147', 'Yes')];
    const source = createFakeDataSource({ getTicketLinks: async () => stored }, (events) => { stored = [row('leads_to', 'out', 'GN-147', 'Maybe')]; return COMMIT(events); });
    render(<Harness dataSource={source} workspaceId={WS} ticketId={TICKET} canEdit isDecision={false} make={make} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Edit label: leads to GN-147' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));                        // control: unchanged
    expect(source.ingested).toHaveLength(0);                                                    // the form closes on an unchanged Save
    await userEvent.click(screen.getByRole('button', { name: 'Edit label: leads to GN-147' }));
    const input = screen.getByLabelText('New label');
    await userEvent.clear(input);
    await userEvent.type(input, ' Maybe ');
    await userEvent.dblClick(screen.getByRole('button', { name: 'Save' }));
    expect(source.ingested).toHaveLength(1);
    expect(source.ingested[0]!.map((e) => [e.type, e.entity.id, e.payload])).toEqual([
      ['ticket.link_removed', TICKET, { kind: 'leads_to', targetId: OTHER }],
      ['ticket.link_added', TICKET, { kind: 'leads_to', targetId: OTHER, label: 'Maybe' }],
    ]);
    await screen.findByText('Relabelled: leads to GN-147 (Maybe)');
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(source.ingested[1]!.map((e) => e.type)).toEqual(['ticket.link_removed', 'ticket.link_added']);
    expect((source.ingested[1]![1]!.payload as { label?: string }).label).toBe('Yes');
  });
  it('29.132 sibling label refused locally; a refused add is compensated', async () => {
    const two = [row('leads_to', 'out', 'GN-147', 'Yes'), row('leads_to', 'out', 'GN-150', 'No', '01J9GTKC000000000000000000')];
    const local = createFakeDataSource({ getTicketLinks: async () => two }, COMMIT);
    render(<Harness dataSource={local} workspaceId={WS} ticketId={TICKET} canEdit isDecision make={make} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Edit label: leads to GN-150' }));
    await userEvent.clear(screen.getByLabelText('New label'));
    await userEvent.type(screen.getByLabelText('New label'), ' yes');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect((await screen.findByRole('alert')).textContent).toBe('This Decision already has a branch labelled "yes".');
    expect(local.ingested).toHaveLength(0);
    cleanup();
    const REASON = 'This Decision already has a branch labelled "Maybe".';
    const refuseAdd: IngestScript = (events) => events.map((e, i) => i === 0
      ? { status: 'committed', eventId: e.id, seq: 1, serverTime: '2026-10-03T10:00:00.000Z' }
      : { status: 'refused', eventId: e.id, rule: 'link.label-duplicate', reason: REASON });
    const server = createFakeDataSource({ getTicketLinks: async () => [row('leads_to', 'out', 'GN-147', 'Yes')] }, (events) => (events.length === 2 ? refuseAdd(events) : COMMIT(events)));
    render(<Harness dataSource={server} workspaceId={WS} ticketId={TICKET} canEdit isDecision={false} make={make} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Edit label: leads to GN-147' }));
    await userEvent.clear(screen.getByLabelText('New label'));
    await userEvent.type(screen.getByLabelText('New label'), 'Maybe');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(server.ingested).toHaveLength(2));
    expect(server.ingested[1]!.map((e) => [e.type, e.payload])).toEqual([['ticket.link_added', { kind: 'leads_to', targetId: OTHER, label: 'Yes' }]]);
    expect((await screen.findByRole('alert')).textContent).toBe(REASON);
  });
  ```
  Write 29.129 (grouping, chip, `Remove: leads to GN-147 (Yes)`, toast `Removed link: leads to GN-147 (Yes)`, Undo re-adds with `label: 'Yes'`, control `Remove: comes after GN-133` with no chip), 29.130 (a Decision: result buttons `toBeDisabled()` until the label has text, hint `Required: name this branch, for example Yes or No.`, `source.ingested` empty after clicking the disabled button; controls as the case line, the refusal one via an ingest script answering `{status:'refused', rule:'link.label-required', reason:'Name the branch: a link from a Decision needs a label, such as "Yes" or "No".'}` and `getByRole('alert')`), and 29.133 (`viewport({ phone: true })`: `getByRole('dialog', { name: 'Add link' })` contains `Link label`; the relabel form is present; desktop: no dialog) in the same shape. Sheet case 29.130b in the sheet test file: a `MINIMAL_READ` whose `ticketState.typeId` is `'decision'` opens Add link, chooses "Leads to", and the result button is disabled; control: `typeId: 'task'` enables it.
  Run: `/Users/kiro/my_projects/gisik-nokma-lanes/slot-run.sh wtg2-t3-red -- pnpm --filter @gisik-nokma/app-core exec vitest run test/views/ticket-links-leads-to.test.tsx --maxWorkers=2 > /tmp/wtg2-t3-red.log 2>&1; tail -40 /tmp/wtg2-t3-red.log`. Expected: FAIL (no "Leads to" option, no `isDecision` prop).
  Commit: `wtg2 T3: case lines 29.128-29.133 and the RED section tests`.

- [ ] **Step 2: The section**

  `ticket-links-section.tsx`, as edits to typed-links T5's code (imports: add `LINK_LABEL_MAX, normaliseLinkLabel` from `@gisik-nokma/domain`):
  ```tsx
  type Choice = 'blocks' | 'blocked-by' | 'relates' | 'duplicates' | 'duplicated-by' | 'leads-to' | 'comes-after';
  // appended to CHOICES:
  { value: 'leads-to', label: 'Leads to', kind: 'leads_to', onOther: false },
  { value: 'comes-after', label: 'Comes after', kind: 'leads_to', onOther: true },
  const GROUP_ORDER = ['blocks', 'is blocked by', 'relates to', 'duplicates', 'is duplicated by', 'leads to', 'comes after'];
  const isLeads = (c: Choice) => c === 'leads-to' || c === 'comes-after';
  const withLabel = (l: { reading: string; key: string; label?: string }) => `${l.reading} ${l.key}${l.label === undefined ? '' : ` (${l.label})`}`;
  ```
  `eventFor` takes a trailing `label?: string` and adds `...(label === undefined || type === 'ticket.link_removed' ? {} : { label })` to the payload, and nothing else about streams: Drafts T8 (planner ruling A) already routes every `onOther` choice and every incoming-row removal on a draft's sheet to THIS ticket's stream as `{kind, targetId: ticketId, from: other, …}` (O1; Drafts R42). `leads_to`, its label, the relabel pair and their Undo go through that same routing; add no `isDraft` branch of your own. State: `label: string` (picker), `editing: { key: string; value: string } | null`. In the component body:
  ```tsx
  const labelNeeded = isDecision && choice === 'leads-to';
  const rowKey = (l: TicketLinkView) => `${l.kind}:${l.direction}:${l.ticket.id}`;

  async function relabel(row: TicketLinkView, next: string): Promise<void> {
    const clean = next.trim();
    if (clean === (row.label ?? '')) { setEditing(null); return; }                        // nothing changed: send nothing
    const outgoing = row.direction === 'out';
    if (outgoing && isDecision && clean === '') { setRefusal('Name the branch: a link from a Decision needs a label, such as "Yes" or "No".'); return; }
    const clash = outgoing && isDecision && (links.data ?? []).some((o) => o !== row && o.kind === 'leads_to' && o.direction === 'out'
      && o.label !== undefined && normaliseLinkLabel(o.label) === normaliseLinkLabel(clean));
    if (clash) { setRefusal(`This Decision already has a branch labelled "${clean}".`); return; }   // the engine's sentence, pinned by a test in both packages
    const guard = `relabel:${row.ticket.id}:${row.direction}`;
    if (inFlight.current.has(guard)) return;
    inFlight.current.add(guard);
    try {
      const mk = (type: 'ticket.link_added' | 'ticket.link_removed', label?: string) =>
        eventFor(make, workspaceId, ticketId, row.ticket.id, 'leads_to', row.direction === 'in', type, label);
      const results = await dataSource.ingest([mk('ticket.link_removed'), mk('ticket.link_added', clean === '' ? undefined : clean)]);
      const [removed, added] = results;
      if (removed?.status !== 'committed') { setRefusal(reasonOf(removed)); return; }      // nothing changed
      if (added?.status !== 'committed') {
        await dataSource.ingest([mk('ticket.link_added', row.label)]);                       // compensate: the branch comes back
        setRefusal(reasonOf(added)); links.reload(); return;
      }
      setEditing(null); setRefusal(null); links.reload();
      const shown = withLabel({ reading: readingOf(row), key: row.ticket.key ?? row.ticket.title, ...(clean === '' ? {} : { label: clean }) });
      setToast({ label: `Relabelled: ${shown}`, undo: () => relabel({ ...row, ...(clean === '' ? {} : { label: clean }) }, row.label ?? '') });
    } finally {
      inFlight.current.delete(guard);
    }
  }
  ```
  with `reasonOf(r)` = `r === undefined ? 'The server did not answer this change.' : r.status === 'refused' ? r.reason : r.status === 'invalid' ? r.message : ''` (typed-links T5's `file` switch, factored; `committed` never reaches it). For a row with `{...row, label}` and no label (`clean === ''`), build the object without the key (`exactOptionalPropertyTypes`).
  Row markup additions (inside typed-links T5's `<li>`): after the title, `{l.label === undefined ? null : <span className="gn-ticket-sheet__link-label">{l.label}</span>}`; the Remove `aria-label` becomes `` `Remove: ${withLabel({ reading, key: l.ticket.key ?? l.ticket.title, ...(l.label === undefined ? {} : { label: l.label }) })}` `` (unchanged text for a label-free row, so typed-links 27.068 stays green); the removal toast text uses the same `withLabel`, and its Undo closure files `eventFor(…, 'ticket.link_added', l.label)` through `file` (the label goes back). For `l.kind === 'leads_to' && canEdit && !busy` add before Remove:
  ```tsx
  <button type="button" className="gn-button gn-button--ghost gn-ticket-sheet__link-edit"
    aria-label={`Edit label: ${readingOf(l)} ${l.ticket.key ?? l.ticket.title}`} onClick={() => setEditing({ key: rowKey(l), value: l.label ?? '' })}>Edit label</button>
  ```
  And, when `editing?.key === rowKey(l)`, below the row's text:
  ```tsx
  <form className="gn-ticket-sheet__link-relabel" onSubmit={(e) => { e.preventDefault(); void relabel(l, editing.value); }}>
    <input type="text" className="gn-input" aria-label="New label" maxLength={LINK_LABEL_MAX} value={editing.value}
      onChange={(e) => setEditing({ key: editing.key, value: e.target.value })} />
    <button type="submit" className="gn-button">Save</button>
    <button type="button" className="gn-button gn-button--ghost" onClick={() => setEditing(null)}>Cancel</button>
  </form>
  ```
  Picker body, after the `Link type` Select and shown only when `isLeads(choice)`:
  ```tsx
  <input type="text" className="gn-input" aria-label="Link label" aria-describedby="gn-link-label-hint" maxLength={LINK_LABEL_MAX}
    placeholder="For example Yes or No" value={label} onChange={(e) => setLabel(e.target.value)} />
  <p id="gn-link-label-hint" className="gn-ticket-sheet__link-hint">
    {labelNeeded ? 'Required: name this branch, for example Yes or No.'
      : choice === 'comes-after' ? 'Optional. Required when the other ticket is a Decision.' : 'Optional.'}
  </p>
  ```
  Each result button gets `disabled={labelNeeded && label.trim() === ''}`; `add(r)` calls `eventFor(…, 'ticket.link_added', isLeads(choice) && label.trim() !== '' ? label.trim() : undefined)`, puts the same label on the pending row, and clears `label` after the call. Changing `choice` to a non-leads kind never sends the typed label. `TicketLinksSectionProps` gains `isDecision: boolean`; the toast render calls `toast.undo()`; the existing remove path wraps its event as `undo: () => file(addEvent, key)`.
  `ticket-sheet.tsx`: add `isDecision={state.typeId === DECISION_TYPE_ID}` to the mount (import the constant from `@gisik-nokma/domain`); the draft flag is already passed by Drafts T8.
  `ui.css`, inside the links block (tokens read in this file: `--gn-text-muted` `:87`, `--gn-surface-raised` `:243`, `--gn-radius-card` `:287`):
  ```css
  .gn-ticket-sheet__link-row { flex-wrap: wrap; }
  .gn-ticket-sheet__link-label { flex: none; padding: 0 0.5rem; border-radius: var(--gn-radius-card); background: var(--gn-surface-raised); color: var(--gn-text-muted); font-size: 0.8125rem; }
  .gn-ticket-sheet__link-hint { margin: 0; color: var(--gn-text-muted); font-size: 0.8125rem; }
  .gn-ticket-sheet__link-relabel { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; flex-basis: 100%; }
  .gn-ticket-sheet__link-relabel input { flex: 1 1 10rem; min-width: 0; min-height: 2.75rem; }
  .gn-ticket-sheet__link-relabel button, .gn-ticket-sheet__link-edit { min-height: 2.75rem; }
  ```
  Run the new file, typed-links' `ticket-links-section.test.tsx` and `ticket-notes-section.test.tsx` (18.241a), then app-core, ui and web WHOLE (ui.css ⇒ all three), each LOCAL. Expected: PASS 29.128-29.133 and every typed-links 27.065-27.076. Flip ✅.
  Commit: `wtg2 T3: Leads to, the label input and relabel in the Links section`.

- [ ] **Step 3: Manual, Features**
  - `docs/manual.md` §5, in the "Linking tickets" paragraph, add: "Leads to" and "Comes after" describe order of work; give a link a label (for example Yes) to name a branch, edit it with Edit label, and a Decision's branches must each have a label that no other branch of that Decision uses. Run `pnpm help:generate && pnpm check:help`.
  - `Features.md`: put under `<!-- wtg-part2-model T3 bullet -->` (keep the anchor line, T19 reads the bullets below it) `- ✅ **Leads-to links in the ticket sheet** (`packages/app-core/src/views/ticket-links-section.tsx`, `ticket-sheet.tsx`) — the Links section adds "Leads to" / "Comes after" with a label (required for a Decision's branches), groups them, shows the label on each row and relabels in one step with Undo. Cases 29.128-29.133.`
  Commit: `wtg2 T3: manual and Features`.

- [ ] **Step 4: Mutations (each red, then reverted)**

  | Case | Mutation | Expected red |
  |---|---|---|
  | 29.128 | file "Comes after" with `onOther: false` | stream assertion |
  | 29.128 | send `leads_to` around Drafts T8's draft routing | the draft case files on `OTHER`'s stream |
  | 29.129 | build the Undo `link_added` without `l.label` | re-added payload lacks `label` |
  | 29.130 | `labelNeeded = false` | Decision add enabled |
  | 29.131 | swap the two events in the `ingest` array | order assertion |
  | 29.132 | delete the compensating `ingest` | second call missing |
  | 29.132 | compare `o.label === clean` without `normaliseLinkLabel` | `" yes"` accepted |

- [ ] **Step 5: Browser check on the primary stack, then DONE**

  Rebuild the dev stack from the release branch (`ctl rebuild`), then at 1280 px and 390 px: add "Leads to" with a label, add one on a Decision without a label (disabled), relabel and Undo, trigger the duplicate-label refusal. Measure the row, Edit label, Save and Cancel targets at 390 px (each at least 44 px) and the chip contrast in both themes (4.5:1); put screenshots and the numbers in the PR and in `HANDOFF`. Checks: `pnpm check:citations`, `pnpm check:tasks`, `node scripts/check-case-ids.mjs`.
  Push. DONE + REVIEW (NEEDS: browser, desktop + 390px).

---

### Task 4: Built-ins `estimate`, `reworkEstimate`, `waitForAll` (the ES-1a census) (cases 29.153-29.166)

**Branch:** `task/wtg2-estimate-fields` from `origin/release/workflow-graph`; PR `--base release/workflow-graph`. **Needs:** T1 merged AND **its recorded prod result pasted in `HANDOFF-task-wtg2-preflight.md` with `shadowing custom fields: none`** (T1 Step 8). Step 0 below re-reads that file; if it is absent or lists a `ledger-definition` or `field-claim` line, STOP and ask the owner (a rename event cannot repair a historical definition that `ticketTypeDefSchema.parse` re-reads on every rebuild and replica bootstrap).

**Files:**
- Modify (domain): `packages/domain/src/ticket-types.ts:8` and after `:207`; `packages/domain/src/events/ticket-events.ts:149-152` (+ the `ticketFieldSetPayload` docblock `:195-198`); `packages/domain/src/ticket-state.ts:221-222`.
- Modify (engine): `packages/rule-engine/src/checks/fields.ts:85-90` (docblock "five" to "eight") and after `:152` (three arms).
- Modify (app-core): `workflow-builder/fields.ts:33-38`; `views/history-copy.ts:134-141`; `views/optimistic-ticket.ts:30-60,75-100`; `views/ticket-sheet.tsx` (`FIXED_FIELD_ROWS :588`, `OWN_ROW_FIELD_IDS :605-611`, state `:869-871`, read `:2438`, submit after `:2312`, row after `:4071`, renumber `:4073,:4105`); `views/new-ticket-dialog.tsx` (`:207`, `:493`, `:616`, `:814`, `:930`, `:947`, render after `:1160`); `views/create-ticket-flow.tsx:361-362`.
- Modify (other): `packages/ui/src/ui.css:3618`; `packages/mcp-server/src/tools/ticket-tools.ts:19,76`; `docs/manual.md:519,546`; `packages/app-core/src/help/content.generated.ts` (generated); `Features.md`; `test-cases/29-workflow-timeline-graphs.md`.
- Tests (modify): `packages/domain/test/ticket-types.test.ts:180`; `packages/domain/test/ticket-state.test.ts`; `packages/rule-engine/test/fields.test.ts`, `ticket-type.test.ts`; `packages/app-core/test/workflow-builder/summaries.test.ts:100-113`, `rule-editors.test.tsx:129-133`; `test/views/history-copy.test.ts`, `ticket-sheet.test.tsx:3099-3110,3236-3270`, `ticket-sheet-optimistic.test.tsx`, `new-ticket-dialog.test.tsx`, `create-ticket-flow.test.tsx`; `packages/mcp-server/test/ticket-tools.test.ts:96-100`; `apps/server/test/proj-tickets.test.ts`; `apps/server/test/tools/wtg-preflight.test.ts` (T1's, one assertion).

**Interfaces:**
- **Consumes:** T1's `NEW_BUILTIN_FIELD_IDS`; the sibling template `docs/superpowers/specs/2026-09-22-priority-builtin-design.md` (domain, engine, server, sync, sheet, dialog, copy sections). Unlike priority these three are OPTIONAL claims (absent means none), so they follow `startDate`: the creation branch writes NO KEY when the member is absent (`ticket-state.ts:221-222`), and there is no reader that throws on absence.
- **Produces** (`@gisik-nokma/domain`; T10 `flowNodeOf` and T11 read them): `estimateValueSchema = z.number().int().min(1).max(365)`; `waitForAllValueSchema = z.literal(true)`; `claimedEstimate(fields, id: 'estimate' | 'reworkEstimate'): number | null` and `claimedWaitForAll(fields): boolean`, both over `Readonly<Record<string, { readonly value: unknown } | undefined>>`, both total (a stored claim that fails its schema reads as null/false, never throws); `BUILTIN_FIELD_IDS` = `['title','description','dueDate','startDate','priority','estimate','waitForAll','reworkEstimate']`; `ticketCreatedPayload.estimate?: number`; claim value shapes: `fields.estimate.value` and `fields.reworkEstimate.value` are bare integers, `fields.waitForAll.value` is `true`; `null` is a clearing claim for all three.

**Findings that shape this task (read, not assumed).**
- `precheck.ts` has NO `ticket.field_set` arm: `precheckEvent` routes only `ticket.transitioned` (`packages/app-core/src/precheck.ts:337-348`, comment names `ticket.field_set` as unreachable), and the replica folds with the shared `applyTicketEvent`. Spec ES-1a's "precheck and replica arms" rows are therefore satisfied by the domain and engine changes; nothing is added there and a case (29.156) pins the replica fold through the reducer.
- The sheet's generic loop draws every claim not in `OWN_ROW_FIELD_IDS` as a raw-id row (`ticket-sheet.tsx:4139-4195`). Without adding all three ids, the first `waitForAll` claim would render a row titled `waitForAll`.
- Part 3 owns the `reworkEstimate` and `waitForAll` controls (inspector; they need rounds and loop membership from T9/T10). This task ships their data path only: schema, engine, history, picker, MCP guard.
- Adding a row at index 5 flips the tint of Visibility and of the first loop row (`FIXED_FIELD_ROWS` 7 to 8), so case 16.129's seam assertions are amended below.

- [ ] **Step 0: Gate on T1's recorded result**

  `grep -n "shadowing custom fields" HANDOFF-task-wtg2-preflight.md` (the T1 branch's file, or the plan ledger's pasted copy). Expected: `none`. Anything else: stop.

- [ ] **Step 1: Case lines under `<!-- wtg-part2-model T4 -->`, all ❌**

  - `- ❌ **29.153 — BUILTIN_FIELD_IDS lists the eight ids in the ES-1a order; a custom field with id estimate, waitForAll or reworkEstimate is refused "shadows a built-in field";** control: estimates is accepted. estimateValueSchema takes 1..365 integers only; waitForAllValueSchema takes only true; the claimed* helpers never throw on a bad stored claim; T1's NEW_BUILTIN_FIELD_IDS is a subset. Mutation: drop one id from BUILTIN_FIELD_IDS → its shadow assertion fails.`
  - `- ❌ **29.154 — ticket.created accepts an optional estimate (1..365 integer) and refuses 0, 366, 2.5, "3" and null;** control: a v1 payload parses to an output with NO estimate key. Mutation: .default(1) → the absent-key assertion fails.`
  - `- ❌ **29.155 — the creation fold writes the estimate claim with the creator and the creation clocks, and NO key when the member is absent;** control: the absent case keeps ['priority','title']. Mutation: write claim(null) when absent → the key assertion fails.`
  - `- ❌ **29.156 — ticket.field_set folds estimate, reworkEstimate and waitForAll as claims (set, replace, clear to a null claim) and the replica store folds them through the same reducer;** control: priority is untouched. Mutation: ignore waitForAll in the fold → the claim is absent.`
  - `- ❌ **29.157 — the engine accepts estimate and reworkEstimate 1, 365 and null on any ticket (answered before the type resolves) and refuses 0, 366, 2.5, "3", true with "Estimate" needs a whole number of days from 1 to 365.;** control: reworkEstimate names itself "Rework estimate". Mutation: min 0 → 0 is accepted.`
  - `- ❌ **29.158 — the engine accepts waitForAll true and null and refuses false, "yes", 1 with "Wait for all incoming" needs true to turn it on, or null to clear it.;** control: the same call with true passes. Mutation: accept false → the false refusal fails.`
  - `- ❌ **29.159 — checkTicketTypeDefined refuses a definition with a custom field estimate (malformed payload naming "shadows a built-in field");** control: a field id estimates passes. Mutation: leave BUILTIN_FIELD_IDS at five → the refusal disappears.`
  - `- ❌ **29.160 — proj_tickets stores the three claims and a birth estimate verbatim and getTicketStateFromDb returns them with provenance;** control: a ticket with none has no such keys. Mutation: filter unknown field ids in the projection → the claims vanish.`
  - `- ❌ **29.161 — History reads "Set Estimate to 3 days", "Set Estimate to 1 day", "Cleared Estimate", "Set Rework estimate to 2 days", "Turned on Wait for all incoming", "Turned off Wait for all incoming";** control: priority still reads "Set priority to P1" and a custom field stays generic. Mutation: drop the singular → "1 days".`
  - `- ❌ **29.162 — the require-field picker offers Estimate and Rework estimate and never Wait for all incoming (3.972 amended by name); a require-field rule on estimate refuses an unset ticket and passes a set one;** control: title is still offered. Mutation: add waitForAll to BUILTIN_FIELD_CHOICES → 3.972 fails.`
  - `- ❌ **29.163 — update_ticket refuses fields carrying estimate, reworkEstimate or waitForAll before any write;** control: a custom field id passes and sends one event. Mutation: remove the ids from the guard → a field_set is sent.`
  - `- ❌ **29.164 — the sheet draws the Estimate row between Start and Type; a changed whole number files field_set estimate, a blank files null, 0 / 2.5 / 366 file nothing and say why; the value shows at once with Saving…; claims for reworkEstimate and waitForAll draw no generic row;** control: a custom claim still draws its row and the grid still alternates end to end. Mutation: drop the three ids from OWN_ROW_FIELD_IDS → a field-waitForAll row appears.`
  - `- ❌ **29.165 — the new-ticket dialog has an Estimate input, empty by default and omitted from the draft when empty; an invalid number disables Create with a reason; CreateTicketFlow sends estimate as a bare number;** control: dates behave as before. Mutation: send String(n) → the payload parse fails.`
  - `- ❌ **29.166 — after the change, rebuilding proj_ticket_types and proj_tickets over the DEV ledger completes and verify:projections is clean;** control: T1's dev pre-flight output is attached. 🧪 once run.`

  Commit: `wtg2 T4: case lines 29.153-29.166 (red)`.

- [ ] **Step 2: Domain RED, then GREEN (29.153-29.156)**

  `packages/domain/test/ticket-types.test.ts`: change `:180` to the eight ids, and add (uses the file's `base` and `ticketTypeDefSchema` imports, add `estimateValueSchema, waitForAllValueSchema, claimedEstimate, claimedWaitForAll`):
  ```ts
  it('29.153 the three flow built-ins are reserved ids, validated by one origin', () => {
    for (const id of ['estimate', 'waitForAll', 'reworkEstimate']) {
      expect(() => ticketTypeDefSchema.parse({ ...base, fields: [{ id, name: 'X', type: 'number' }] }), id).toThrow(/shadows a built-in field/);
    }
    expect(() => ticketTypeDefSchema.parse({ ...base, fields: [{ id: 'estimates', name: 'X', type: 'number' }] })).not.toThrow(); // control
    for (const ok of [1, 3, 365]) expect(estimateValueSchema.parse(ok)).toBe(ok);
    for (const bad of [0, 366, 2.5, -1, '3', Number.NaN, null, true]) expect(estimateValueSchema.safeParse(bad).success, String(bad)).toBe(false);
    expect(waitForAllValueSchema.safeParse(true).success).toBe(true);
    for (const bad of [false, null, 'true', 1]) expect(waitForAllValueSchema.safeParse(bad).success, String(bad)).toBe(false);
    expect(claimedEstimate({ estimate: { value: 3 } }, 'estimate')).toBe(3);
    expect(claimedEstimate({ estimate: { value: 0 } }, 'estimate')).toBeNull();
    expect(claimedEstimate({}, 'reworkEstimate')).toBeNull();
    expect(claimedWaitForAll({ waitForAll: { value: true } })).toBe(true);
    expect(claimedWaitForAll({ waitForAll: { value: null } })).toBe(false);
  });
  ```
  `apps/server/test/tools/wtg-preflight.test.ts`: add to the 29.147 `it`: `expect(NEW_BUILTIN_FIELD_IDS.every((id) => (BUILTIN_FIELD_IDS as readonly string[]).includes(id))).toBe(true);` (import `BUILTIN_FIELD_IDS` from `@gisik-nokma/domain`).

  `packages/domain/test/ticket-state.test.ts` (after 3.966; uses `createdWith`, `createdState`, `fold`, `deps`, `TICKET`, `makeEnvelope`):
  ```ts
  describe('29.154-29.156 estimate, rework estimate, wait-for-all', () => {
    const base = { typeId: 'task', projectId: '01J9GPRJ000000000000000000', parentId: null, title: 'T' };
    it('29.154 ticket.created takes an optional whole-day estimate', () => {
      expect(ticketCreatedPayload.parse({ ...base, estimate: 7 }).estimate).toBe(7);
      for (const bad of [0, 366, 2.5, '3', null]) expect(ticketCreatedPayload.safeParse({ ...base, estimate: bad }).success, String(bad)).toBe(false);
      expect('estimate' in ticketCreatedPayload.parse(base)).toBe(false); // control: absent stays absent
    });
    it('29.155 the creation fold writes the estimate claim, or no key', () => {
      const state = fold([createdWith({ estimate: 4 })]);
      expect(state.fields.estimate).toEqual({ value: 4, actorId: createdWith({}).actorId, clientTime: createdWith({}).clientTime, serverTime: createdWith({}).serverTime });
      expect(Object.keys(createdState().fields).sort()).toEqual(['priority', 'title']); // control
    });
    it('29.156 field_set folds the three claims: set, replace, clear', () => {
      const set = (fieldId: string, value: unknown) => makeEnvelope({ type: 'ticket.field_set', entity: { kind: 'ticket', id: TICKET }, payload: { fieldId, value }, actorId: 'user-anselma' });
      let state = fold([createdWith({}), set('estimate', 3), set('reworkEstimate', 2), set('waitForAll', true), set('estimate', 5)]);
      expect(state.fields.estimate?.value).toBe(5);
      expect(state.fields.reworkEstimate?.value).toBe(2);
      expect(state.fields.waitForAll).toMatchObject({ value: true, actorId: 'user-anselma' });
      state = applyTicketEvent(state, set('waitForAll', null), deps);
      expect(state.fields.waitForAll?.value).toBeNull(); // a clearing CLAIM, not a deleted key
      expect(state.fields.priority?.value).toBe('P2'); // control
    });
  });
  ```
  Replica (29.156 second half): in `packages/sync-client/test/replica.test.ts`, copy the nearest existing `ticket.field_set` case (grep `fieldId: 'dueDate'` there for the helper and the store read), apply `{fieldId:'estimate', value: 3}` and assert the replica's ticket state has `fields.estimate.value === 3`.

  Run (LOCAL; build domain first): `/Users/kiro/my_projects/gisik-nokma-lanes/slot-run.sh wtg2-t4-domain -- pnpm --filter @gisik-nokma/domain exec vitest run --maxWorkers=2 > /tmp/wtg2-t4-domain.log 2>&1; tail -30 /tmp/wtg2-t4-domain.log`. Expected FAIL (undefined exports, five-id list).

  Implement. `ticket-types.ts:8`: the eight ids. After `DEFAULT_PRIORITY` (`:207`):
  ```ts
  /** Estimate and rework estimate: whole calendar days, 1 to 365 (spec ES-1, decision 2). `null` clears; that is the engine's branch. */
  export const estimateValueSchema = z.number().int().min(1).max(365);
  /** Wait for all incoming: `true`, cleared with `null` at the engine; absent means off. `false` is not a value, so "on" and "never said" are the only readings. */
  export const waitForAllValueSchema = z.literal(true);

  type ClaimBag = Readonly<Record<string, { readonly value: unknown } | undefined>>;
  /** Total: a stored claim that fails the schema reads as no estimate. T10/T11 read estimates through these, never `fields.x.value` directly. */
  export function claimedEstimate(fields: ClaimBag, id: 'estimate' | 'reworkEstimate'): number | null {
    const parsed = estimateValueSchema.safeParse(fields[id]?.value);
    return parsed.success ? parsed.data : null;
  }
  export function claimedWaitForAll(fields: ClaimBag): boolean {
    return waitForAllValueSchema.safeParse(fields['waitForAll']?.value).success;
  }
  ```
  `ticket-events.ts` (import `estimateValueSchema` beside `dueDateValueSchema`), after `dueDate: dueDateValueSchema.optional(),`:
  ```ts
      /**
       * The birth ESTIMATE in whole days (ES-1). OPTIONAL, AND ABSENT MEANS NO CLAIM, the `startDate` rule above:
       * the reducer writes no key for an absent member, because a null claim would be a clearing nobody made.
       */
      estimate: estimateValueSchema.optional(),
  ```
  Update the `ticketFieldSetPayload` docblock list (`:195-198`) to name the three. `ticket-state.ts` after the `dueDate` line: `...(p.estimate === undefined ? {} : { estimate: claim(p.estimate, env) }),`.

  Run: same command. Expected PASS. Flip 29.153-29.156 ✅ (29.156 after the replica `it` passes: `pnpm --filter @gisik-nokma/sync-client exec vitest run test/replica.test.ts`).

  Commit: `wtg2 T4: domain built-ins estimate, reworkEstimate, waitForAll (29.153-29.156)`.

- [ ] **Step 3: Engine arms (29.157-29.159)**

  RED, `packages/rule-engine/test/fields.test.ts` after 3.967 (uses `checkTicketFieldSet`, `fieldSet`, `ctx`, `ctxWithoutTheTicketsType`):
  ```ts
  it('29.157 estimate and reworkEstimate: whole days 1..365 or null, on any ticket', async () => {
    for (const [id, name] of [['estimate', 'Estimate'], ['reworkEstimate', 'Rework estimate']] as const) {
      for (const ok of [1, 365, null]) expect(await checkTicketFieldSet(fieldSet(id, ok), ctx()), `${id} ${String(ok)}`).toEqual({ refused: false });
      expect(await checkTicketFieldSet(fieldSet(id, 3), ctxWithoutTheTicketsType())).toEqual({ refused: false });
      for (const bad of [0, 366, 2.5, '3', true]) {
        expect(await checkTicketFieldSet(fieldSet(id, bad), ctx()), `${id} ${String(bad)}`).toEqual({
          refused: true, rule: 'field.type-mismatch', reason: `"${name}" needs a whole number of days from 1 to 365.`,
        });
      }
    }
  });
  it('29.158 waitForAll: true or null only', async () => {
    expect(await checkTicketFieldSet(fieldSet('waitForAll', true), ctx())).toEqual({ refused: false });
    expect(await checkTicketFieldSet(fieldSet('waitForAll', null), ctx())).toEqual({ refused: false });
    for (const bad of [false, 'yes', 1]) {
      expect(await checkTicketFieldSet(fieldSet('waitForAll', bad), ctx()), String(bad)).toEqual({
        refused: true, rule: 'field.type-mismatch', reason: '"Wait for all incoming" needs true to turn it on, or null to clear it.',
      });
    }
  });
  ```
  `packages/rule-engine/test/ticket-type.test.ts` (uses `def`, `typeDefined`, `ctx`):
  ```ts
  it('29.159 a custom field that shadows a flow built-in is refused at the door', async () => {
    const refused = await checkTicketTypeDefined(typeDefined(def({ id: 'invoice', name: 'Invoice', rank: 3, fields: [{ id: 'estimate', name: 'Estimate', type: 'number' }] })), ctx());
    expect(refused).toMatchObject({ refused: true, rule: 'malformed-payload' });
    expect((refused as { reason: string }).reason).toContain('shadows a built-in field');
    expect(await checkTicketTypeDefined(typeDefined(def({ id: 'invoice', name: 'Invoice', rank: 3, fields: [{ id: 'estimates', name: 'E', type: 'number' }] })), ctx())).toEqual({ refused: false }); // control
  });
  ```
  (Confirm the literal rule id by running once: `REFUSAL_RULES.malformedPayload` in `packages/rule-engine/src/refusal-rules.ts`; the first run's diff names it.)

  Run `wtg2-t4-engine` (`pnpm --filter @gisik-nokma/rule-engine exec vitest run test/fields.test.ts test/ticket-type.test.ts`). Expected FAIL (accepted/unknown-field).

  Implement in `checks/fields.ts` after the priority arm (`:152`), before "Now, and only now" (`:153`); import `estimateValueSchema, waitForAllValueSchema`; docblock `:85-90` "the five built-ins" becomes eight:
  ```ts
  // Estimate and rework estimate (ES-1, ES-5): the same whole-day schema, answered before the type resolves.
  if (p.fieldId === 'estimate' || p.fieldId === 'reworkEstimate') {
    if (value === null) return ACCEPT;
    return estimateValueSchema.safeParse(value).success
      ? ACCEPT
      : refuse('field.type-mismatch', fieldKindRefusal(p.fieldId === 'estimate' ? 'Estimate' : 'Rework estimate', 'a whole number of days from 1 to 365'));
  }
  // Wait for all incoming (ES-2): on, or cleared. `false` is not a claim anyone should make.
  if (p.fieldId === 'waitForAll') {
    if (value === null) return ACCEPT;
    return waitForAllValueSchema.safeParse(value).success
      ? ACCEPT
      : refuse('field.type-mismatch', fieldKindRefusal('Wait for all incoming', 'true to turn it on, or null to clear it'));
  }
  ```
  Run: same. Expected PASS; flip 29.157-29.159 ✅. Commit: `wtg2 T4: engine arms for the three built-ins (29.157-29.159)`.

- [ ] **Step 4: Projection, History, picker, MCP (29.160-29.163)**

  `apps/server/test/proj-tickets.test.ts` (inside `describe('proj_tickets')`, uses `SEED`, `ticketEvent`, `created`, `applyAll`, `asLedger`, `getTicketStateFromDb`, `CHILD`, `NEWBORN`):
  ```ts
  it('29.160 the three claims and a birth estimate are stored verbatim with provenance', async () => {
    const born: Draft = { ...created(WS, NEWBORN, 'task', PARENT, 'Estimated at birth'), payload: { typeId: 'task', projectId: PROJECT, parentId: PARENT, title: 'Estimated at birth', estimate: 4 } };
    await applyAll(asLedger([...SEED, born,
      ticketEvent(CHILD, 'ticket.field_set', { fieldId: 'estimate', value: 3 }),
      ticketEvent(CHILD, 'ticket.field_set', { fieldId: 'reworkEstimate', value: 2 }),
      ticketEvent(CHILD, 'ticket.field_set', { fieldId: 'waitForAll', value: true })]));
    const child = await getTicketStateFromDb(db.pool, WS, CHILD);
    expect(child?.fields['estimate']).toMatchObject({ value: 3, actorId: ACTOR });
    expect(child?.fields['reworkEstimate']?.value).toBe(2);
    expect(child?.fields['waitForAll']?.value).toBe(true);
    expect((await getTicketStateFromDb(db.pool, WS, NEWBORN))?.fields['estimate']?.value).toBe(4);
    const plain = await getTicketStateFromDb(db.pool, WS, GRANDCHILD); // control
    expect(Object.keys(plain?.fields ?? {}).sort()).toEqual(['priority', 'title']);
  });
  ```
  `history-copy.test.ts` (copy 3.973's `eventOf` + `describeEvent` shape, `:241-260`):
  ```ts
  it('29.161 estimate, rework estimate and wait-for-all sentences; priority and custom fields unchanged', () => {
    const set = (fieldId: string, value: unknown) => describeEvent({ ...eventOf('ticket.field_set'), payload: { fieldId, value } });
    expect(set('estimate', 3)).toBe('Set Estimate to 3 days');
    expect(set('estimate', 1)).toBe('Set Estimate to 1 day');
    expect(set('estimate', null)).toBe('Cleared Estimate');
    expect(set('reworkEstimate', 2)).toBe('Set Rework estimate to 2 days');
    expect(set('waitForAll', true)).toBe('Turned on Wait for all incoming');
    expect(set('waitForAll', null)).toBe('Turned off Wait for all incoming');
    expect(set('priority', 'P1')).toBe('Set priority to P1'); // control
    expect(set('region', 'North')).toBe('Set region to North');
  });
  ```
  `summaries.test.ts` 3.972: expected difference `['priority', 'waitForAll']`, add `expect([...BUILTIN_FIELD_IDS]).toContain('waitForAll'); expect(chosen).not.toContain('waitForAll');`, control `expect(chosen).toEqual(['title','description','dueDate','startDate','estimate','reworkEstimate'])`; rename the title "MINUS priority and waitForAll". `rule-editors.test.tsx:133`: `['Title','Description','Due date','Start date','Estimate','Rework estimate','Counterparty (Errand)']`. 29.162's rule check in `packages/rule-engine/test/` next to `require-different-user.test.ts` style: `evaluateRequireField({kind:'require-field', field:'estimate'}, input)` with `ticket.fields.estimate` absent refuses and `{value: 3}` passes (copy the nearest `require-field` test's `input` builder: grep `require-field` in `packages/rule-engine/test`).

  `packages/mcp-server/test/ticket-tools.test.ts` after `:100` (uses `tool`, `fake`, `ROUTES`, `WS`, `T`):
  ```ts
  for (const id of ['estimate', 'reworkEstimate', 'waitForAll']) {
    await expect(tool('update_ticket', f.session).handler({ workspaceId: WS, ticketId: T, fields: { [id]: 3 } })).rejects.toThrow(`"${id}" is a built-in field`);
  }
  expect(f.batches, '29.163 refusals send nothing').toHaveLength(1);
  ```
  (placed inside the `it` that already holds the title guard, before its control line, so the count stays and the control still proves a custom field sends one event.)

  Implement: `workflow-builder/fields.ts`: after the `startDate` entry add `{ id: 'estimate', name: 'Estimate', source: 'Built-in' }, { id: 'reworkEstimate', name: 'Rework estimate', source: 'Built-in' }`; append to the docblock a third bullet: `waitForAll` is EXCLUDED because it is optional but a gate on `true` is meaningless as a require-field (a rule on a switch would force every move to turn it on); case 3.972 names both exclusions. `history-copy.ts` before the generic arm:
  ```ts
  const days = (n: number): string => `${n} ${n === 1 ? 'day' : 'days'}`;
  /** The three flow built-ins read by name; anything unrecognised falls through to the generic sentence. */
  function flowFieldSentence(fieldId: string, value: unknown): string | null {
    if (fieldId === 'estimate' || fieldId === 'reworkEstimate') {
      const name = fieldId === 'estimate' ? 'Estimate' : 'Rework estimate';
      if (value === null) return `Cleared ${name}`;
      return typeof value === 'number' ? `Set ${name} to ${days(value)}` : null;
    }
    if (fieldId === 'waitForAll') return value === null ? 'Turned off Wait for all incoming' : value === true ? 'Turned on Wait for all incoming' : null;
    return null;
  }
  ```
  and in the `ticket.field_set` case after the `fieldId` null check: `const flow = flowFieldSentence(fieldId, payload['value']); if (flow !== null) return flow;`. MCP `ticket-tools.ts:19`: `const BUILT_IN = new Set([...existing, 'estimate', 'reworkEstimate', 'waitForAll']);` and change the throw at `:76` to
  `throw new Error(FLOW_BUILT_IN.has(key) ? \`"${key}" is a built-in field and cannot be set through fields\` : \`"${key}" is a built-in field: use the ${key} argument\`);` with `const FLOW_BUILT_IN = new Set(['estimate','reworkEstimate','waitForAll']);` (the "use the argument" sentence would be false until Part 5 adds the arguments; Part 5 deletes `FLOW_BUILT_IN`).

  Run (`wtg2-t4-server-app`): domain+rule-engine builds, then `pnpm --filter @gisik-nokma/server exec vitest run test/proj-tickets.test.ts`, app-core `test/views/history-copy.test.ts test/workflow-builder`, mcp-server WHOLE. Expected PASS after the edits (FAIL before). Flip 29.160-29.163 ✅.

  Commit: `wtg2 T4: projection round-trip, History, picker and MCP guard (29.160-29.163)`.

- [ ] **Step 5: Sheet and dialog (29.164-29.165)** (name `frontend-design` in the lane prompt; the control reuses the Start/Due sibling's classes, geometry is not measured here beyond that sibling)

  RED tests. `ticket-sheet.test.tsx` after 16.105 (uses `renderSheet`, `settled`, `ticketRead`, `ticketStateSeed`):
  ```tsx
  it('29.164 the Estimate row: between Start and Type; whole days file field_set, blank files null, invalid files nothing', async () => {
    const source = renderSheet(ticketRead());
    await settled();
    const row = screen.getByTestId('field-estimate');
    expect(screen.getByTestId('field-start').compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(row.compareDocumentPosition(screen.getByTestId('field-type')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const input = within(row).getByLabelText('Estimate (days)');
    fireEvent.change(input, { target: { value: '3' } });
    fireEvent.blur(input);
    await waitFor(() => expect(source.ingested).toHaveLength(1));
    expect(source.ingested[0]![0]!.payload).toEqual({ fieldId: 'estimate', value: 3 });
    for (const bad of ['2.5', '0', '366']) {
      fireEvent.change(input, { target: { value: bad } });
      fireEvent.blur(input);
      expect(await within(row).findByRole('alert'), bad).toHaveTextContent('Estimate must be a whole number of days from 1 to 365.');
    }
    expect(source.ingested).toHaveLength(1);
  });
  it('29.164 a claimed estimate clears with a blank; the flow built-ins draw no generic rows', async () => {
    const claim = (value: unknown) => ({ value, actorId: 'user_anselma', clientTime: '2026-08-18T08:04:00.000Z', serverTime: '2026-08-18T08:05:00.000Z' });
    const source = renderSheet(ticketRead({ ticket: ticketStateSeed({ fields: { ...ticketRead().ticket.fields, estimate: claim(4), reworkEstimate: claim(2), waitForAll: claim(true), counterparty: claim('Anselma Marak') } }) }));
    await settled();
    const row = screen.getByTestId('field-estimate');
    expect(within(row).getByLabelText('Estimate (days)')).toHaveValue(4);
    expect(within(row).getByText('set by Anselma Marak on 18 Aug 2026')).toBeInTheDocument();
    expect(screen.queryByTestId('field-reworkEstimate')).toBeNull();
    expect(screen.queryByTestId('field-waitForAll')).toBeNull();
    expect(screen.getByTestId('field-counterparty')).toBeInTheDocument(); // control
    fireEvent.change(within(row).getByLabelText('Estimate (days)'), { target: { value: '' } });
    fireEvent.blur(within(row).getByLabelText('Estimate (days)'));
    await waitFor(() => expect(source.ingested).toHaveLength(1));
    expect(source.ingested[0]![0]!.payload).toEqual({ fieldId: 'estimate', value: null });
  });
  ```
  Amend 13.113's `ids` (`:3099-3110`) to insert `'field-estimate'` after `'field-start'`; amend 16.129 (`:3236-3270`): `rows` length 9, Visibility (index 7) tinted `true`, counterparty (index 8) tinted `false`, and fix the "seven fixed rows" comment to eight. `ticket-sheet-optimistic.test.tsx` (uses `mount`, `committed`, `userEvent`):
  ```tsx
  it('29.164 an estimate shows at once with Saving… and survives a stale reload', async () => {
    const user = userEvent.setup();
    const { writes } = await mount();
    const row = () => screen.getByTestId('field-estimate');
    expect(row().textContent).toContain('No estimate'); // control
    await user.type(within(row()).getByLabelText('Estimate (days)'), '3');
    await user.tab();
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(within(row()).getByLabelText('Estimate (days)')).toHaveValue(3);
    expect(row().textContent).toContain('Saving…');
    writes[0]!.resolve([committed]);
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(within(row()).getByLabelText('Estimate (days)')).toHaveValue(3);
    expect(row().textContent).not.toContain('No estimate');
  });
  ```
  `new-ticket-dialog.test.tsx` (inside the 13.1443 describe, uses `baseProps`) and `create-ticket-flow.test.tsx` (uses `renderFlow`, `ticketCreatedPayload`):
  ```tsx
  it('29.165 the Estimate input is empty by default, omitted when empty, and an invalid number disables Create', () => {
    const onCreate = vi.fn();
    render(<NewTicketDialog {...baseProps({ onCreate })} />);
    expect(screen.getByLabelText('Estimate (days)')).toHaveValue(null);
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Order the tent' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create ticket' }));
    expect(onCreate.mock.calls[0]?.[0]).not.toHaveProperty('estimate');
  });
  it('29.165 an estimate of 2.5 disables Create with its reason; 5 is carried as the number 5', () => {
    const onCreate = vi.fn();
    render(<NewTicketDialog {...baseProps({ onCreate })} />);
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Order the tent' } });
    fireEvent.change(screen.getByLabelText('Estimate (days)'), { target: { value: '2.5' } });
    expect(screen.getByText('Estimate must be a whole number of days from 1 to 365.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create ticket' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Estimate (days)'), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create ticket' }));
    expect(onCreate.mock.calls[0]?.[0]).toMatchObject({ estimate: 5 });
  });
  // create-ticket-flow.test.tsx
  it('29.165 the flow sends estimate as a bare number', async () => {
    const source = createFakeDataSource();
    renderFlow(source);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Create ticket' }));
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Renew the trade licence' } });
    fireEvent.change(screen.getByLabelText('Estimate (days)'), { target: { value: '5' } });
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Create ticket' })).getByRole('button', { name: 'Create ticket' }));
    expect(ticketCreatedPayload(source)['estimate']).toBe(5);
  });
  ```
  Run (`wtg2-t4-ui`): `pnpm --filter @gisik-nokma/domain build && pnpm --filter @gisik-nokma/rule-engine build`, then app-core `test/views/ticket-sheet.test.tsx test/views/ticket-sheet-optimistic.test.tsx test/views/new-ticket-dialog.test.tsx test/views/create-ticket-flow.test.tsx`. Expected FAIL (no row, no input).

  Implement.
  - `optimistic-ticket.ts`: `TicketOverlay` gains `/** Whole days, or null for a cleared estimate. */ estimate?: number | null;`; `CLAIM_FIELDS` gains `'estimate'`; `claimValueOf`: `if (field === 'priority' || field === 'estimate') return value;`; `readValueOf` gains `case 'estimate': return read.ticket.fields['estimate']?.value ?? null;`.
  - `ticket-sheet.tsx`: `FIXED_FIELD_ROWS = 8`; `OWN_ROW_FIELD_IDS` adds `'estimate','reworkEstimate','waitForAll'`; after `startSubmittingRef` (`:871`): `const [estimateDraft, setEstimateDraft] = useState<string | null>(null); const [estimateSaving, setEstimateSaving] = useState(false); const [estimateInvalid, setEstimateInvalid] = useState(false); const estimateSubmittingRef = useRef(false);`; after `:2438`: `const estimate = claimedEstimate(state.fields, 'estimate'); const estimateClaim = state.fields['estimate'];`; after `submitStartDate` (`:2312`), its twin:
    ```tsx
    const submitEstimate = async (raw: string): Promise<void> => {
      const next = raw.trim() === '' ? null : Number(raw);
      if (next !== null && !estimateValueSchema.safeParse(next).success) { setEstimateInvalid(true); return; }
      setEstimateInvalid(false);
      if (next === estimate) { setEstimateDraft(null); return; }
      if (estimateSubmittingRef.current) return;
      estimateSubmittingRef.current = true;
      setEstimateSaving(true);
      try {
        const event = make({ workspaceId, entity: { kind: 'ticket', id: ticketId }, type: 'ticket.field_set', payload: { fieldId: 'estimate', value: next } });
        optimistic.begin({ estimate: next });
        let results: Awaited<ReturnType<typeof dataSource.ingest>>;
        try { results = await dataSource.ingest([event]); } catch (cause) { optimistic.drop('estimate'); throw cause; }
        const result = results[0];
        if (result === undefined) { optimistic.drop('estimate'); setServerRefusal(null); setTransportError('The server did not answer this change.'); return; }
        if (result.status === 'committed') { optimistic.settle('estimate'); setServerRefusal(null); setTransportError(null); setEstimateDraft(null); read.reload(); history.reload(); return; }
        optimistic.drop('estimate');
        if (result.status === 'refused') setServerRefusal({ rule: result.rule, reason: result.reason });
        else setServerRefusal({ rule: result.code, reason: result.message });
      } finally { estimateSubmittingRef.current = false; setEstimateSaving(false); }
    };
    ```
    Row (copy the Start row's `onBlur`/`onKeyDown` Enter/Escape handlers verbatim, renaming to the estimate state), placed between the Start row and the Type row, with `fieldRowClass(5)`; Type becomes `fieldRowClass(6)`, Visibility `fieldRowClass(7)`:
    ```tsx
    <div className={fieldRowClass(5)} data-testid="field-estimate">
      <dt>Estimate</dt>
      <dd>
        <input className="gn-field__input gn-ticket-sheet__estimate-input" type="number" min={1} max={365} step={1} inputMode="numeric"
          aria-label="Estimate (days)" value={estimateDraft ?? (estimate === null ? '' : String(estimate))} disabled={estimateSaving}
          onChange={(event) => setEstimateDraft(event.target.value)}
          onBlur={() => { if (estimateDraft !== null) void submitEstimate(estimateDraft); }}
          onKeyDown={/* the Start row's Enter and Escape handlers, with submitEstimate / setEstimateDraft(null) + setEstimateInvalid(false) */} />
        {estimateInvalid ? <span role="alert" className="gn-refusal gn-refusal--preview">Estimate must be a whole number of days from 1 to 365.</span> : estimate === null ? (
          <span className="gn-ticket-sheet__absent">No estimate</span>
        ) : (
          <span className="gn-ticket-sheet__claim">{optimistic.overlaidFields.has('estimate') || estimateClaim === undefined ? SAVING_CLAIM : `set by ${nameOf(estimateClaim.actorId)} on ${formatDate(estimateClaim.serverTime)}`}</span>
        )}
      </dd>
    </div>
    ```
    Import `claimedEstimate, estimateValueSchema` from `@gisik-nokma/domain`. `ui.css:3618`: add `.gn-ticket-sheet__estimate-input { align-self: start; width: 6rem; }`.
  - `new-ticket-dialog.tsx`: `NewTicketDraft` gains `estimate?: number;` (`:207`, docblock: absent means no claim); `const [estimate, setEstimate] = useState('');` (`:494`); restore `setEstimate(restoreDraft.estimate === undefined ? '' : String(restoreDraft.estimate));` (`:617`); `const estimateInvalid = estimate.trim() !== '' && !estimateValueSchema.safeParse(Number(estimate)).success;` (`:815`); payload `...(estimate.trim() === '' ? {} : { estimate: Number(estimate) }),` (`:931`); the Create `disabled` condition and `disabledHint` gain `estimateInvalid` (`'Fix the estimate to create the ticket'`, after the dates arm); after the Due date label (`:1160`) the same `<label className="gn-new-ticket__field">Estimate (days)<input className="gn-field__input" type="number" min={1} max={365} step={1} inputMode="numeric" aria-label="Estimate (days)" value={estimate} onChange={(event) => setEstimate(event.target.value)} />` plus the `role="alert"` sentence when invalid.
  - `create-ticket-flow.tsx:362`: `...(draft.estimate === undefined ? {} : { estimate: draft.estimate }),`.

  Run `wtg2-t4-ui` again, then **ui.css changed, so app-core and web suites WHOLE** (`wtg2-t4-app-core`, `wtg2-t4-web`). Expected PASS. Flip 29.164-29.165 ✅.

  Commit: `wtg2 T4: the Estimate row and field (29.164-29.165)`.

- [ ] **Step 6: Manual, help, mobile bundle, Features**

  `docs/manual.md:519`: `- **Start date**, **Due date** and **Estimate (days)** — optional, empty by default. Leave any blank to claim nothing; an estimate is a whole number of days from 1 to 365.` `:546` append a step `6. **Set or clear its estimate** — the **Estimate** row's number box, like Start. (§5)`. Run `pnpm help:generate && pnpm check:help`. Mobile bundle: `pnpm --filter @gisik-nokma/editor run build:webview && node apps/mobile/scripts/generate-editor-html.mjs --check`; if it reports `stale`, rerun without `--check` and commit the generated file. Features: put under `<!-- wtg-part2-model T4 bullet -->` (keep the anchor line, T19 reads the bullets below it)
  `- ✅ **Estimate** (wtg2 T4; `packages/domain/src/ticket-types.ts`, `views/ticket-sheet.tsx`, `views/new-ticket-dialog.tsx`) — a whole-day estimate (1 to 365) beside Start and Due, in the new-ticket form and the sheet; History reads "Set Estimate to 3 days". It joins the require-field picker.` and `- ⚙️ **Rework estimate and Wait for all incoming built-ins** (wtg2 T4; same files, `packages/rule-engine/src/checks/fields.ts`) — claims written by `ticket.field_set`, validated by the engine, read through `claimedEstimate` / `claimedWaitForAll`; `fields` in MCP `update_ticket` refuses all three. Controls arrive in Part 3. Cases 29.153-29.166.`
  Run `node scripts/check-case-ids.mjs && pnpm check:citations`. Commit: `wtg2 T4: manual, help, bundle, Features`.

- [ ] **Step 7: Dev rebuild (29.166), sweeps, DONE**

  With the dev stack up: `DATABASE_URL=postgres://gisik:gisik@localhost:54330/gisik_nokma pnpm --filter @gisik-nokma/server run rebuild:projection -- proj_ticket_types` then `... proj_tickets`, then `... run verify:projections`. Expected: no throw, verifier clean. Paste into the HANDOFF; flip 29.166 to 🧪. Sweeps (LOCAL, `--maxWorkers=2`): domain, rule-engine, mcp-server, sync-client, app-core, web WHOLE; server `test/proj-tickets.test.ts test/tools test/census`. `pnpm check:tasks`. **Mutations:** the ones on 29.153, 29.154, 29.155, 29.156, 29.157, 29.158, 29.159, 29.160, 29.161, 29.162, 29.163, 29.164, 29.165. Push. DONE + REVIEW (NEEDS: T1's recorded result).

---

### Task 5: The Decision type and `ticket.decided`: seed, event, fold of outcome and passes, census (cases 29.134-29.137, 29.356-29.358)

**Branch:** `task/wtg2-decision` from `origin/release/workflow-graph`; PR `--base release/workflow-graph`. **Needs:** T1 merged AND its recorded prod/dev result (no workspace holds a custom type with id `decision` at another rank, ES-3/Q3: a seed id that collides is adopted by DC-3, and its rank would be locked by `type.builtin-rank`); T2 merged (`DECISION_TYPE_ID` in `ticket-types.ts`, `linkLabelSchema` in `link-label.ts`, `TicketState.links`, the `links` column that makes the next two columns `$21`/`$22`). **Scope (contract decision 15):** type, event, fold, projection columns, census. The checks, the close rule and the sweep mirror are T6; the loop reset is T8 (this task leaves the named seam `releaseOutcome`).

**Files:**
- Create: `apps/server/migrations/1792100100000_proj-tickets-decision.sql`; `packages/domain/test/decision-event.test.ts`; `apps/server/test/projections/tickets-decision.test.ts`; `packages/sync-client/test/replica-decision.test.ts`; `packages/app-core/test/views/decision-type-defaults.test.ts`.
- Modify (re-read each; lines are from the tip): `packages/domain/src/events/ticket-events.ts` (after `ticketReopenedPayload`, `:315`; imports `:1-4`); `packages/domain/src/vocabulary.ts` (import list `:46-53`, new block after the link pair `:274-285`); `packages/domain/src/entity-state.ts` (`TicketState` `:33-127`, new exported types after `TicketLink` `:129`); `packages/domain/src/ticket-state.ts` (docblock `:53-107`, list `:89-107`, import `:7-21`, new arm after `ticket.link_removed` `:469-477`, new exports after `foldTicketEvent` `:504`); `packages/domain/src/ticket-types.ts` (`BUILTIN_TICKET_TYPE_SEEDS` `:142-147`); `apps/server/src/projections/tickets.ts` (`TicketRow` `:87-118`, `rowToTicketState` `:152-218`, `upsertTicket` `:284-359`); `apps/server/src/sync/sync-routes.ts` (docblock `:30-60`); `apps/server/src/purge/check-purged.ts` (`payloadIds` `:25-75`); `apps/server/src/notifications/fanout.ts` (chain `:353-401`); `packages/app-core/src/workflow-builder/ticket-types/icons.tsx` (`TYPE_ICONS` `:30-96`); `packages/app-core/src/online/mappers.ts` (`mapTicketState` `:1956`, end of literal `:2056`); `packages/app-core/src/views/history-copy.ts` (`describeEvent` switch `:150-247`); `packages/app-core/src/views/new-ticket-dialog.tsx:71-77` and `ticket-sheet.tsx:171-182`; `apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx:194`; `packages/mcp-server/src/tools/ticket-tools.ts:39-65`.
- Tests edited (they go red on purpose): `packages/domain/test/ticket-state.test.ts:712` (`toHaveLength(17)`), `packages/domain/test/ticket-types.test.ts:164-190`, `packages/app-core/test/views/history-copy.test.ts` (`REGISTRATIONS_ON_2026_10_03`, the CONTROL case's `.toBe(17)`, `VALID_PAYLOAD`), `packages/app-core/test/ticket-types/ticket-types.test.tsx:668,685-686` (the list sorts by `rank` then id, so Decision draws between Story and Task), `apps/web/test/project-create-gate.test.tsx:449` (the fallback ladder is now five), `packages/rule-engine/test/live-ticket.test.ts:62-81`, `packages/rule-engine/test/ticket-type.test.ts:140-155`, `apps/server/test/permissions/check-role-permission.test.ts:637-649`, `apps/server/test/routes/workspaces.test.ts:142-155,365`, `apps/server/test/routes/workspace-bootstrap-failure.test.ts:~251`, `apps/server/test/seed/seed-cc.test.ts:164-169`, `apps/server/test/census/ticket-vocabulary-census.test.ts`, `apps/server/test/permissions/check-visibility-permission.test.ts`, `apps/server/test/notifications/fanout.test.ts:182-203`, `packages/mcp-server/test/redacted-payload.test.ts`.

**Interfaces:**
- Consumes: T2 `DECISION_TYPE_ID`, `linkLabelSchema`, `TicketLink`, `normaliseLinkLabel`.
- Produces (`@gisik-nokma/domain`): `ticketDecidedPayload`, `DECISION_CLOSE_STARTED_MAX = 50`, `type PassRevision = {from: string|null; to: string|null; by: string; at: string}`, `type PassRecord = {pass: number; outcome: string|null; by: string; at: string; revisions: PassRevision[]}`, `TicketState.outcome?: string` (ABSENT when none), `TicketState.passes?: PassRecord[]` (absent until the first choice), `releaseOutcome(state: TicketState): TicketState` (the PS-2 reset seam), `TICKET_EVENT_TYPES` gains `'ticket.decided'` (18 members), `BUILTIN_TICKET_TYPE_SEEDS` gains `{id: DECISION_TYPE_ID, name: 'Decision', icon: 'diamond', rank: 3}` (5 seeds). Server: `proj_tickets.outcome text NULL`, `proj_tickets.passes jsonb NOT NULL DEFAULT '[]'`.

**Why `ticket.decided` is NOT in `BOOTSTRAP_BACKFILL_TYPES` (spec §8.4's row says it is; contract decision 1).** The docblock at `sync-routes.ts:22-30` states the rule: a type the reducer folds rides the snapshot, and only types that carry content beyond the fold (`comment.added`, `attachment.added`, the contest pair, `visibility.set`, the comment edit and delete) are backfilled below it. `ticket.decided` folds fully into `outcome` and `passes` (the pass record IS the content, and `closeStarted` is a request for the settle, not history a replica needs). Backfilling it would also double-apply it: `refoldTicket` folds both the snapshot's state and the backfilled tail. The census in Step 5 asserts it is in exactly one list. A new type, so there is no retro problem (a snapshot written before this task cannot lack what no event ever carried).

**Why the seed needs three guards beyond the array entry.** (1) `defaultRootTypeFor` (`new-ticket-dialog.tsx:71-77`) takes the deepest root-legal type and breaks rank ties by `type.id < best.id`: with Decision at rank 3 beside Task, `'decision' < 'task'` makes a Decision the default type of every new root ticket. `subtaskTypeFor` (`ticket-sheet.tsx:171-182`) prefers the id `task` but falls to the same tie-break when a workspace has no `task` type. Both skip `DECISION_TYPE_ID` unless it is the only legal type (29.134; T5 is the one owner, T7 only pins it). (2) `bootstrapWorkspace` maps every seed (`bootstrap-workspace.ts:87`), so every new workspace's founding sequence grows from seven events to eight; five existing tests pin the old arithmetic (Step 3). (3) `BUILTIN_LADDER_NOTICE` (`page.tsx:194`) says "four"; the fallback ladder is derived from the seeds, so it now shows five. The sentence loses its count (T7 must not repeat this edit). The manual (`docs/manual.md:48,227,1555` say "four built-in") and its generated help are T7's, with the regeneration.

- [ ] **Step 1: Catalogue**

  Under `<!-- wtg-part2-model T5 -->` in `test-cases/29-workflow-timeline-graphs.md` (all ❌), and the Features bullets under `<!-- wtg-part2-model T5 bullet -->`:
  - `- ❌ **29.134 — "Decision" is a fifth built-in type (id decision, icon diamond, rank 3) bound to the workspace's default workflow with no fields; its rank is locked (type.builtin-rank), a new workspace's founding sequence defines it, and neither the New ticket dialog nor "Add sub-task" ever defaults to it;** control: the ladder still has epic, story, task, sub-task with DEEPEST_RANK 4, and a Task is the default for the same ladder without a Decision. Mutation: drop the Decision exclusion in defaultRootTypeFor → it returns decision.`
  - `- ❌ **29.135 — ticket.decided is registered once at v1 against ticket; its payload is strict ({outcome: 1..60 non-blank or null, REQUIRED}, optional from, optional closeStarted of at most 50 ULIDs); a deleted ticket refuses it; the permission door gives it ticket.field_set's right (canSee, nothing more); the purge door names every closeStarted id;** control: an absent outcome is refused (absent is not a clear). Mutation: make outcome optional → the empty payload parses.`
  - `- ❌ **29.136 — TicketState.outcome is ABSENT until the first choice, then the latest choice; a clear removes the key; from and closeStarted are not folded;** control: a ticket never decided has neither outcome nor passes. Mutation: fold \`outcome: p.outcome\` on a clear → the key is present as null.`
  - `- ❌ **29.137 — the Part 2 census lists ticket.decided in TICKET_EVENT_TYPES and in no backfill list, narrates it in History ("Decided: Yes", "Decision revised: Yes → No", "Cleared the decision (was Yes)"), keeps its outcome in a redacted payload and phrases a withheld closeStarted id, gives it a no-op fan-out arm, and proj_tickets.outcome and passes round-trip through rowToTicketState and a rebuild equals the live table;** control: a planted unlisted ticket type is still reported. Mutation: add it to BOOTSTRAP_BACKFILL_TYPES → the exactly-one-list assertion fails.`
  - `- ❌ **29.356 — the first choice opens pass 1; a differing choice is a revision {from, to, by, at} of the last pass; a clear records a revision to null; a choice after a clear fills the same pass in (no new pass);** control: the earlier state value is not mutated. Mutation: open a new pass on a differing choice → passes has two records.`
  - `- ❌ **29.357 — after releaseOutcome (the loop reset, wired by T8) the current outcome is gone, passes is untouched, and the next choice opens pass 2 with pass 1 unchanged;** control: releasing a state with no outcome returns the same object. Mutation: have the reducer revise instead of append after a release → pass 1 changes.`
  - `- ❌ **29.358 — the replica folds ticket.decided into the confirmed state (outcome and passes) and the online mapper carries both onto TicketState, absent when absent;** control: a ticket never decided maps to a state with neither key. Mutation: drop passes from mapTicketState → the mapped state loses its pass record.`
  Features: `- ✅ **Decision tickets** (\`packages/domain/src/ticket-types.ts\`, \`packages/domain/src/events/ticket-events.ts\`) — a fifth built-in type that records an outcome and keeps every pass; never the default type. Cases 29.134-29.137, 29.356-29.358.` and `- ⚙️ **Decision outcome and passes fold** (\`packages/domain/src/ticket-state.ts\`, \`apps/server/migrations/1792100100000_proj-tickets-decision.sql\`) — \`proj_tickets.outcome/passes\` round-trip and rebuild.`
  Run `node scripts/check-case-ids.mjs && pnpm check:citations`. Expected: PASS. Commit: `wtg2 T5: open the Decision cases and Features bullets`.

- [ ] **Step 2: RED domain tests (29.134, 29.135, 29.136, 29.356, 29.357)**

  `packages/domain/test/decision-event.test.ts`, header and `deps`/`bornState` copied from `ticket-link-events.test.ts:1-48` (same one-workflow world; `makeEnvelope`, `parseEvent`, `newUlid` from `../src/index.js`):
  ```ts
  import { describe, expect, it } from 'vitest';
  import {
    applyTicketEvent, BUILTIN_TICKET_TYPE_SEEDS, builtinTicketTypeDefs, DECISION_TYPE_ID, DEEPEST_RANK, domainRegistry,
    makeEnvelope, newUlid, parseEvent, releaseOutcome, TICKET_EVENT_TYPES, ticketDecidedPayload, ticketTypeDefSchema,
    type TicketState, type TicketStateDeps,
  } from '../src/index.js';

  const SOURCE = newUlid();
  const OTHER = newUlid();
  const PROJECT = '01J9GPRJ000000000000000000';
  const A = '01J9GACT000000000000000001';
  const B = '01J9GACT000000000000000002';
  const T1 = '2026-10-03T09:00:00.000Z', T2 = '2026-10-03T09:05:00.000Z', T3 = '2026-10-03T09:10:00.000Z', T4 = '2026-10-03T09:15:00.000Z';
  // deps and bornState(): verbatim from ticket-link-events.test.ts:20-48 (bornState files `SOURCE`).

  const decided = (outcome: string | null, o: { from?: string | null; actorId?: string; serverTime?: string; closeStarted?: string[] } = {}) =>
    makeEnvelope({
      type: 'ticket.decided',
      entity: { kind: 'ticket', id: SOURCE },
      payload: { outcome, ...(o.from === undefined ? {} : { from: o.from }), ...(o.closeStarted === undefined ? {} : { closeStarted: o.closeStarted }) },
      ...(o.actorId === undefined ? {} : { actorId: o.actorId }),
      ...(o.serverTime === undefined ? {} : { serverTime: o.serverTime }),
    });

  describe('29.134 the Decision seed', () => {
    it('29.134 a fifth built-in at rank 3 beside Task, DEEPEST_RANK unmoved, every materialised def parses', () => {
      expect(DECISION_TYPE_ID).toBe('decision');
      expect(BUILTIN_TICKET_TYPE_SEEDS.find((s) => s.id === DECISION_TYPE_ID)).toEqual({ id: 'decision', name: 'Decision', icon: 'diamond', rank: 3 });
      expect(BUILTIN_TICKET_TYPE_SEEDS.map((s) => s.id)).toEqual(['epic', 'story', 'task', 'sub-task', 'decision']);
      expect(DEEPEST_RANK).toBe(4); // control: the floor is still the sub-task's
      const defs = builtinTicketTypeDefs('wf-default');
      expect(defs).toHaveLength(5);
      for (const def of defs) {
        expect(ticketTypeDefSchema.parse(def)).toEqual(def);
        expect(def.workflowId).toBe('wf-default');
        expect(def.fields).toEqual([]);
      }
    });
  });

  describe('29.135 ticket.decided payload and registration', () => {
    it('29.135 outcome REQUIRED and nullable; from and closeStarted optional; blank, 61 characters, extra members and non-ULID ids refused', () => {
      const ok = (p: unknown) => ticketDecidedPayload.safeParse(p).success;
      expect(ok({ outcome: 'Yes' })).toBe(true);
      expect(ok({ outcome: null })).toBe(true);
      expect(ok({ outcome: 'No', from: 'Yes' })).toBe(true);
      expect(ok({ outcome: 'No', from: null })).toBe(true);
      expect(ok({ outcome: 'Yes', closeStarted: [OTHER] })).toBe(true);
      expect(ok({})).toBe(false); // absent is not a clear
      expect(ok({ outcome: '   ' })).toBe(false);
      expect(ok({ outcome: 'x'.repeat(61) })).toBe(false);
      expect(ok({ outcome: 'x'.repeat(60) })).toBe(true); // control: the boundary
      expect(ok({ outcome: 'Yes', note: 'x' })).toBe(false);
      expect(ok({ outcome: 'Yes', closeStarted: ['GN-146'] })).toBe(false);
      expect(ok({ outcome: 'Yes', closeStarted: Array.from({ length: 51 }, () => newUlid()) })).toBe(false);
      expect(ok({ outcome: 'Yes', closeStarted: Array.from({ length: 50 }, () => newUlid()) })).toBe(true);
    });
    it('29.135 registered once at v1 against ticket only, folded (in TICKET_EVENT_TYPES), refused against a note', () => {
      expect(domainRegistry.get('ticket.decided', 1)?.entityKind).toBe('ticket');
      expect((TICKET_EVENT_TYPES as readonly string[]).includes('ticket.decided')).toBe(true);
      const keys = domainRegistry.registrations().map((r) => `${r.type}@${r.version}`);
      expect(keys.filter((k) => k === 'ticket.decided@1')).toHaveLength(1);
      const { serverTime: _s, seq: _q, ...onNote } = decided('Yes');
      expect(parseEvent({ ...onNote, entity: { kind: 'note', id: SOURCE } }).ok).toBe(false); // control
      expect(parseEvent(onNote).ok).toBe(true);
    });
  });

  describe('29.136 the current outcome', () => {
    it('29.136 absent until chosen, then the latest choice; a clear removes the key; from and closeStarted are not folded', () => {
      const born = bornState();
      expect('outcome' in born).toBe(false);
      expect('passes' in born).toBe(false); // control: absent, never null or []
      const yes = applyTicketEvent(born, decided('Yes'), deps);
      expect(yes.outcome).toBe('Yes');
      const no = applyTicketEvent(yes, decided('No', { from: 'Yes' }), deps);
      expect(no.outcome).toBe('No');
      const cleared = applyTicketEvent(no, decided(null, { from: 'No' }), deps);
      expect('outcome' in cleared).toBe(false);
      expect(cleared.passes).toHaveLength(1); // the record stays
      const asked = applyTicketEvent(born, decided('Yes', { closeStarted: [OTHER] }), deps);
      expect(JSON.stringify(asked)).not.toContain(OTHER);
    });
  });

  describe('29.356 / 29.357 passes', () => {
    it('29.356 a first choice opens pass 1; a differing choice and a clear are revisions of it; a choice after a clear fills it in', () => {
      const s1 = applyTicketEvent(bornState(), decided('Yes', { actorId: A, serverTime: T1 }), deps);
      expect(s1.passes).toEqual([{ pass: 1, outcome: 'Yes', by: A, at: T1, revisions: [] }]);
      const s2 = applyTicketEvent(s1, decided('No', { from: 'Yes', actorId: B, serverTime: T2 }), deps);
      expect(s2.passes).toEqual([{ pass: 1, outcome: 'No', by: A, at: T1, revisions: [{ from: 'Yes', to: 'No', by: B, at: T2 }] }]);
      const s3 = applyTicketEvent(s2, decided(null, { from: 'No', actorId: A, serverTime: T3 }), deps);
      expect(s3.passes?.[0]?.outcome).toBeNull();
      expect(s3.passes?.[0]?.revisions.at(-1)).toEqual({ from: 'No', to: null, by: A, at: T3 });
      const s4 = applyTicketEvent(s3, decided('Yes', { from: null, actorId: B, serverTime: T4 }), deps);
      expect(s4.passes).toHaveLength(1); // filled in, not a second pass
      expect(s4.passes?.[0]).toMatchObject({ pass: 1, outcome: 'Yes', by: A, at: T1 });
      expect(s4.passes?.[0]?.revisions).toHaveLength(3);
      expect(s4.passes?.[0]?.revisions.at(-1)).toEqual({ from: null, to: 'Yes', by: B, at: T4 });
      expect(s1.passes?.[0]?.revisions).toEqual([]); // control: earlier values are never mutated
    });
    it('29.357 after releaseOutcome the next choice opens pass 2 and pass 1 is unchanged', () => {
      const born = bornState();
      const s1 = applyTicketEvent(born, decided('Needs rework', { actorId: A, serverTime: T1 }), deps);
      const released = releaseOutcome(s1);
      expect('outcome' in released).toBe(false);
      expect(released.passes).toEqual(s1.passes);
      const s2 = applyTicketEvent(released, decided('Yes', { actorId: B, serverTime: T2 }), deps);
      expect(s2.outcome).toBe('Yes');
      expect(s2.passes).toEqual([s1.passes?.[0], { pass: 2, outcome: 'Yes', by: B, at: T2, revisions: [] }]);
      expect(releaseOutcome(born)).toBe(born); // control: nothing to release returns the same object
    });
  });
  ```
  Run (domain tests import `../src`, no build): `/Users/kiro/my_projects/gisik-nokma-lanes/slot-run.sh wtg2-t5-red -- pnpm --filter @gisik-nokma/domain exec vitest run test/decision-event.test.ts > /tmp/wtg2-t5-red.log 2>&1; tail -30 /tmp/wtg2-t5-red.log`. Expected: FAIL on the missing exports (`DECISION_TYPE_ID` resolves from T2; `ticketDecidedPayload`, `releaseOutcome` do not).

- [ ] **Step 3: Domain implementation**

  `ticket-events.ts` (import `linkLabelSchema` from `'../link-label.js'` beside the existing imports), after `ticketReopenedPayload` (sibling: `ticketRankedPayload`'s strict object, `:356-363`):
  ```ts
  /** Most tickets one `ticket.decided` may ask the settle to close "Not taken" while they are started (PS-6). */
  export const DECISION_CLOSE_STARTED_MAX = 50;
  /**
   * `ticket.decided` (DC-4): the outcome of a Decision. `outcome: null` clears it. `from` is the outcome the sender saw: the
   * engine refuses a stale one (`decision.stale-from`, T6). `closeStarted` is a request to the settle (T15/T16), recorded
   * here so the ledger shows what the person chose; it folds into nothing. `outcome` is REQUIRED: an absent member would be a
   * clear nobody asked for.
   */
  export const ticketDecidedPayload = z
    .object({
      outcome: linkLabelSchema.nullable(),
      from: linkLabelSchema.nullable().optional(),
      closeStarted: z.array(ulidString).max(DECISION_CLOSE_STARTED_MAX).optional(),
    })
    .strict();
  ```
  `vocabulary.ts`: add `ticketDecidedPayload` to the import list (`:46-53`) and, after the `ticket.link_removed` block:
  ```ts
  /** `ticket.decided` (Workflow and Timeline graphs DC-4): FOLDS into `outcome` and `passes`, so it is in `TICKET_EVENT_TYPES` and deliberately not backfilled below a snapshot. Whether the ticket is a Decision is the engine's door (`checks/decision.ts`). */
  domainRegistry.register({ type: 'ticket.decided', version: 1, entityKind: 'ticket', payloadSchema: ticketDecidedPayload });
  ```
  `entity-state.ts`, inside `TicketState` after `links?` (`:126`), and the two types after `TicketLink` (`:129`):
  ```ts
    /** A Decision's CURRENT outcome (DC-4/PS-2). ABSENT when none: never decided, cleared, or released by a loop reset. */
    outcome?: string;
    /** A Decision's pass records, oldest first (PS-2). ABSENT until the first choice; the reducer, `rowToTicketState` and the replica all agree. */
    passes?: PassRecord[];
  ```
  ```ts
  /** One change of mind inside a pass: what the sender replaced, with whom and when (`env.actorId`, `env.serverTime`). */
  export type PassRevision = { from: string | null; to: string | null; by: string; at: string };
  /** One pass of a Decision: the choice that opened it (`by`, `at`) and every revision since. `outcome` is the pass's CURRENT value (null after a clear). */
  export type PassRecord = { pass: number; outcome: string | null; by: string; at: string; revisions: PassRevision[] };
  ```
  `ticket-state.ts`: import `ticketDecidedPayload` (`:7-21`) and `PassRecord` (type, `:5`); add `'ticket.decided',` after `'ticket.link_removed',` in `TICKET_EVENT_TYPES`; in the docblock replace "SEVENTEEN of the TWENTY-TWO" with "EIGHTEEN of the TWENTY-THREE" and append "`ticket.decided` (wtg2 T5) moved both numbers again: it folds into `outcome` and `passes`."; new arm after `ticket.link_removed` (copy of the shape of `ticket.ranked`, `:427-435`):
  ```ts
    case 'ticket.decided': {
      const p = ticketDecidedPayload.parse(env.payload);
      return foldDecided(state, p.outcome, env);
    }
  ```
  and after `foldTicketEvent`:
  ```ts
  /**
   * PS-2, rules 1-4. Rule 1 (a new pass) applies when a choice arrives with no current outcome AND the last pass is not an
   * open one: there is no pass yet, or the last pass still holds the outcome a loop RELEASED. Otherwise the choice is a
   * revision of the last pass, from the current outcome (null after a clear, which is rule 2's fill-in) to the new one (rule
   * 3), or to null (rule 4). A clear with no pass at all is a ledger the engine would have refused; it records nothing.
   */
  function foldDecided(state: TicketState, outcome: string | null, env: EventEnvelope): TicketState {
    const current = state.outcome ?? null;
    const passes = state.passes ?? [];
    const last = passes[passes.length - 1];
    const stamp = { by: env.actorId, at: env.serverTime };
    let next: PassRecord[];
    if (last === undefined || (current === null && last.outcome !== null)) {
      if (outcome === null) return state;
      next = [...passes, { pass: passes.length + 1, outcome, ...stamp, revisions: [] }];
    } else {
      const revised: PassRecord = { ...last, outcome, revisions: [...last.revisions, { from: current, to: outcome, ...stamp }] };
      next = [...passes.slice(0, -1), revised];
    }
    const { outcome: _previous, ...rest } = state;
    return { ...rest, ...(outcome === null ? {} : { outcome }), passes: next };
  }

  /**
   * PS-2's last rule: a `reopened-by-flow` transition on the Decision itself releases the current outcome and leaves `passes`
   * alone, so the next choice opens the next pass. Nothing calls this until T8 wires the transition arm; it is exported and
   * tested here so the seam has a name and a contract.
   */
  export function releaseOutcome(state: TicketState): TicketState {
    if (state.outcome === undefined) return state;
    const { outcome: _released, ...rest } = state;
    return rest;
  }
  ```
  `ticket-types.ts` seeds (after `sub-task`): `{ id: DECISION_TYPE_ID, name: 'Decision', icon: 'diamond', rank: 3 },`.
  Update the five tests that pin the old arithmetic: `ticket-state.test.ts:712` `toHaveLength(18)` with the docblock count; `ticket-types.test.ts:168-174` gains `['decision', 3]` and `toHaveLength(5)` at `:185`; `history-copy.test.ts` CONTROL `.toBe(18)` and `REGISTRATIONS_ON_2026_10_03` `21` (docblock "22" becomes "23 registered, this census covers 21"); `ticket-types.test.tsx` compares the rendered order with `[...builtins].sort((a, b) => a.rank - b.rank || (a.id < b.id ? -1 : 1)).map((b) => b.name)`; `project-create-gate.test.tsx:449` expects `['Epic', 'Story', 'Task', 'Sub-task', 'Decision']` (derive it from `BUILTIN_TICKET_TYPE_SEEDS.map((s) => s.name)`, not retyped); `live-ticket.test.ts` `GATED` gains `['ticket.decided', () => ({ outcome: 'Yes' })]` (its "whole vocabulary" case parses `vocabulary.ts` and fails until it does); `ticket-type.test.ts` gains, after the dispatch case, a second `it` for the rank lock: `evaluateEvent(typeDefined(def({ id: 'decision', name: 'Decision', rank: 4 })), ctx())` equals `{ refused: true, rule: 'type.builtin-rank', reason: '"Decision" is the built-in decision type; its rank is 3 and cannot be changed. Define a custom type for differently-ranked work.' }` and the same def at rank 3 is accepted (29.134 control).
  Run the domain suite: `slot-run.sh wtg2-t5-domain -- pnpm --filter @gisik-nokma/domain exec vitest run --maxWorkers=2`. Expected: PASS. Flip 29.134 (domain half), 29.135 (domain half), 29.136, 29.356, 29.357 ✅ as each test goes green.
  Commit: `wtg2 T5: the Decision seed, ticket.decided and the fold`.

- [ ] **Step 4: Server: columns, projection, doors, census (29.135, 29.137)**

  Migration `1792100100000_proj-tickets-decision.sql` (sibling: `1789500000000_proj-tickets-reopened-at.sql`; `jsonb`, not `json`, because `verify-projections.ts` diffs with EXCEPT):
  ```sql
  -- Up Migration

  -- Workflow and Timeline graphs T5 (DC-4, PS-2): a Decision's current outcome and its pass records, projected from
  -- TicketState.outcome / TicketState.passes. Both are brand new members of a brand new event type, so every existing row is
  -- correctly NULL / '[]' and no rebuild is needed.
  ALTER TABLE proj_tickets
    ADD COLUMN outcome text NULL,
    ADD COLUMN passes jsonb NOT NULL DEFAULT '[]'::jsonb;

  COMMENT ON COLUMN proj_tickets.outcome IS 'A Decision''s current outcome label, or NULL (never decided, cleared, or released by a loop reset). Folded from ticket.decided.';
  COMMENT ON COLUMN proj_tickets.passes IS 'A Decision''s pass records, oldest first: [{pass, outcome, by, at, revisions:[{from,to,by,at}]}]. ''[]'' until the first choice.';

  -- Down Migration

  ALTER TABLE proj_tickets
    DROP COLUMN passes,
    DROP COLUMN outcome;
  ```
  `projections/tickets.ts`: `TicketRow` gains `outcome: string | null; passes: PassRecord[];` (import the type from `@gisik-nokma/domain`); the end of the `rowToTicketState` literal (after `deleted:` and typed-links T2's `links` spread) gains, with the comment "absent, never null/[]: the reducer's shape"
  ```ts
    ...(row.outcome === null ? {} : { outcome: row.outcome }),
    ...(row.passes.length === 0 ? {} : { passes: row.passes }),
  ```
  `upsertTicket`: append `outcome, passes` to the INSERT column list, `$21, $22` to VALUES (re-read: typed-links T2 made `links` `$20`; if T9 landed first, continue its numbering), `outcome = EXCLUDED.outcome, passes = EXCLUDED.passes` to ON CONFLICT, and the values `next.outcome ?? null, JSON.stringify(next.passes ?? [])` (the `?? null` guard is `rank`'s, `:318-326`).
  `check-purged.ts` `payloadIds`: `case 'ticket.decided': { const ids = payload['closeStarted']; if (Array.isArray(ids)) for (const id of ids) add('ticket', id); break; }` (a decision naming an erased ticket is refused at the door, the way a link to one is).
  `fanout.ts`, in the chain beside the link arm (`:390`): `} else if (env.type === 'ticket.decided') { // Outcomes notify nobody (NT-4); an explicit arm writes the decision where the next reader looks. } else if (...)`.
  `sync-routes.ts` docblock: "TWENTY-TWO" to "TWENTY-THREE", "seventeen of them" to "eighteen of them", and a sentence in the pair history: "**twenty-three and eighteen with wtg2 T5** (`ticket.decided`, which FOLDS into `outcome` and `passes`, so it is deliberately NOT backfilled)". Do not add it to `BOOTSTRAP_BACKFILL_TYPES`.
  Tests: `apps/server/test/projections/tickets-decision.test.ts`, structure of `tickets-rank.test.ts:1-100` (the `workflow.defined` + `ticket-type.defined` seed in `beforeAll`, `rowFor`, `applyCommitted`, `makeCommitted`, `rowToTicketState`):
  ```ts
  it('29.137 outcome and passes land, read back equal to the reducer, vanish on a clear and rebuild equal to live', async () => {
    const id = newUlid(); const actor = newUlid();
    await applyCommitted(db.pool, [makeCommitted({ workspaceId: WS, actorId: actor, entity: { kind: 'ticket', id }, type: 'ticket.created', payload: { typeId: TYPE_ID, projectId: PRJ, parentId: null, title: 'Go ahead?' } })]);
    const row0 = await rowFor(id);
    expect(row0.outcome).toBeNull(); expect(row0.passes).toEqual([]);
    expect('outcome' in rowToTicketState(row0)).toBe(false); // control: the reducer's absent shape
    const yes = makeCommitted({ workspaceId: WS, actorId: actor, entity: { kind: 'ticket', id }, type: 'ticket.decided', payload: { outcome: 'Yes' } });
    await applyCommitted(db.pool, [yes]);
    const state = rowToTicketState(await rowFor(id));
    expect(state.outcome).toBe('Yes');
    expect(state.passes).toEqual([{ pass: 1, outcome: 'Yes', by: actor, at: yes.serverTime, revisions: [] }]);
    await applyCommitted(db.pool, [makeCommitted({ workspaceId: WS, actorId: actor, entity: { kind: 'ticket', id }, type: 'ticket.decided', payload: { outcome: null, from: 'Yes' } })]);
    const cleared = rowToTicketState(await rowFor(id));
    expect('outcome' in cleared).toBe(false);
    expect(cleared.passes?.[0]?.revisions).toHaveLength(1);
    expect(await verifyProjections({ pool: db.pool, projections: buildProjectionRegistry() })).toEqual({ clean: true, diffs: [] });
  });
  ```
  (import `verifyProjections` from `../../src/tools/verify-projections.js` and `buildProjectionRegistry` from `../../src/projections/index.js`, as `test/verify-projections.test.ts:278` does.) Also: `check-visibility-permission.test.ts`, new `describe('29.135 ticket.decided has ticket.field_set's right')` using that file's `workspace()`, `seedGuest`, `seedMember`, `seedTicket`, `setVisibilityEnv`, `gate`, `ticketEvent`: for each of `['ticket.decided', 'ticket.field_set']` with payloads `{outcome:'Yes'}` / `{fieldId:'title',value:'x'}` a guest on a project-visible ticket is refused `{rule: PERMISSION_VISIBILITY_RULE, reason: TICKET_NOT_VISIBLE_REASON}`; the same guest explicitly shared (`setVisibilityEnv(..., 'explicit', [guest])`) and a project member get `null` (same `it`, so both halves and the control). `fanout.test.ts`: extend the 27.007 case's type loop with a `ticket.decided` event (payload `{ outcome: 'Yes' }`) and keep its `assigned()` control. Census, appended to `ticket-vocabulary-census.test.ts` (`describe('29.137 …')`):
  ```ts
  it('29.137 ticket.decided is folded and in no backfill list; payloadIds names every closeStarted id and nothing else', () => {
    const folded = (TICKET_EVENT_TYPES as readonly string[]).includes('ticket.decided');
    const backfilled = (BOOTSTRAP_BACKFILL_TYPES as readonly string[]).includes('ticket.decided');
    expect([folded, backfilled]).toEqual([true, false]);
    const [a, b] = ['01J9GTKB000000000000000000', '01J9GTKC000000000000000000'];
    expect(payloadIds('ticket.decided', { outcome: 'Yes', closeStarted: [a, b] })).toEqual([['ticket', a], ['ticket', b]]);
    expect(payloadIds('ticket.decided', { outcome: 'Yes' })).toEqual([]); // control: no request, no ids
  });
  ```
  Update the three founding-sequence tests (`check-role-permission.test.ts:637-649`, `workspaces.test.ts:142-155` and `:365`, `workspace-bootstrap-failure.test.ts:~251`) to one more `'ticket-type.defined'`, `slice(2, 7)` and `['epic', 'story', 'task', 'sub-task', 'decision']` (the grant moves to index 7), and `seed-cc.test.ts:164-169` `118 + 7` with "the five built-in ticket types" and "seventh... " in its prose. Re-read each for the literal numbers before editing.
  Run (LOCAL): `pnpm --filter @gisik-nokma/domain build && pnpm --filter @gisik-nokma/rule-engine build`, then `slot-run.sh wtg2-t5-server -- pnpm --filter @gisik-nokma/server exec vitest run --maxWorkers=2` plus `pnpm check:migrations`. Expected: PASS. Flip 29.135 and 29.137 (server halves).
  Commit: `wtg2 T5: proj_tickets outcome and passes, the doors and the census`.

- [ ] **Step 5: Client: icon, defaults, mapper, History, MCP, replica (29.134, 29.137, 29.358)**

  - `icons.tsx`: `diamond: [{ kind: 'path', d: 'M12 2 22 12 12 22 2 12z' }],` after `banknote`; the docblock's "sixteen" becomes "seventeen".
  - `new-ticket-dialog.tsx:70-77` (import `DECISION_TYPE_ID` from `@gisik-nokma/domain`, beside `DEEPEST_RANK`): after `const legal = ladder.filter((type) => type.rank < DEEPEST_RANK);` add `const preferred = legal.filter((type) => type.id !== DECISION_TYPE_ID); const candidates = preferred.length > 0 ? preferred : legal;` and reduce over `candidates`, with the comment "a Decision is a peer of Task by rank and would win the id tie-break; it is chosen only when nothing else is legal". `ticket-sheet.tsx:171-182`, same pattern: after `const task = legal.find(...)`/`if (task !== undefined) return task;` filter `preferred`/`candidates` the same way and reduce over `candidates` (import `DECISION_TYPE_ID` in the existing import at `:10`). (Reconciler: T5 is the ONE owner of both readers; T7 only pins them from the founding side. The fallback keeps the existing contract that a ladder with a legal type never yields `null`.) `page.tsx:194`: `'Showing the built-in ticket types while this workspace’s own types load.'`.
  - `mappers.ts`: import `PassRecord` (type) and, after `mapClosed`, add `mapPasses(raw, path)` (each entry `asRecord`; `pass` via `asNumber`; `outcome` `null` or `asString`; `by`, `at` via `asString`; `revisions` via `asArray` of `{from, to}` each `null` or `asString`, plus `by`, `at`); the end of `mapTicketState`'s literal gains, with the reason "tolerant: absent when absent, the wire's own shape (`rowToTicketState` spreads them only when set); the VALUE is still policed":
    ```ts
    ...(record['outcome'] === undefined || record['outcome'] === null ? {} : { outcome: asString(record['outcome'], `${path}.outcome`) }),
    ...(record['passes'] === undefined ? {} : { passes: mapPasses(record['passes'], `${path}.passes`) }),
    ```
  - `history-copy.ts`, after the `ticket.ranked` arm:
    ```ts
    case 'ticket.decided': {
      const outcome = payload['outcome'];
      const from = str(payload, 'from');
      if (outcome === null) return from === null ? 'Cleared the decision' : `Cleared the decision (was ${from})`;
      if (typeof outcome !== 'string' || outcome === '') return event.type;
      return from === null ? `Decided: ${outcome}` : `Decision revised: ${from} → ${outcome}`;
    }
    ```
    and `VALID_PAYLOAD['ticket.decided'] = { outcome: 'Yes' }` in `history-copy.test.ts`, plus a describe with the four sentences as literal strings and a no-payload fallback (`eventOf('ticket.decided')` with payload `{}` returns the wire name).
  - `ticket-tools.ts` `redactedPayload` (sibling: the link branch, `:41-44`): `if (type === 'ticket.decided' && Array.isArray(payload['closeStarted'])) return { ...payload, closeStarted: (payload['closeStarted'] as unknown[]).map((v) => (v === null ? "a ticket you can't see" : v)) };` The route that nulls hidden ids is T17 (see its History step); the outcome label stays. `redacted-payload.test.ts` gains the two assertions and the existing census loop (`for (const r of domainRegistry.registrations()) …not.toThrow()`) covers the empty payload.
  - Tests: `packages/app-core/test/views/decision-type-defaults.test.ts` (29.134):
    ```ts
    import { describe, expect, it } from 'vitest';
    import { defaultRootTypeFor } from '../../src/views/new-ticket-dialog.js';
    import { subtaskTypeFor } from '../../src/views/ticket-sheet.js';
    const L = (id: string, rank: number) => ({ id, name: id, rank, workflowId: 'wf', icon: 'check', fields: [] });
    describe('29.134 a Decision is never a default type', () => {
      it('29.134 a new root ticket and a new sub-item skip the Decision that ties Task on rank', () => {
        const ladder = [L('epic', 1), L('story', 2), L('task', 3), L('sub-task', 4), L('decision', 3)];
        expect(defaultRootTypeFor(ladder)?.id).toBe('task');
        expect(defaultRootTypeFor(ladder.filter((t) => t.id !== 'task'))?.id).toBe('story'); // control: Decision is skipped even when Task is absent
        expect(subtaskTypeFor(ladder.filter((t) => t.id !== 'task'), 2)?.id).toBe('sub-task');
        expect(defaultRootTypeFor([L('chore', 3), L('errand', 3)])?.id).toBe('chore'); // control: the id tie-break still applies to others
        expect(defaultRootTypeFor([L('decision', 3)])?.id).toBe('decision'); // control: legal and alone, so the last resort
        expect(subtaskTypeFor([L('story', 2), L('decision', 3)], 2)?.id).toBe('decision'); // control: the last resort for a child
      });
    });
    ```
    `mappers.test.ts` (`describe` near 13.724): `29.358` builds `ticketReadBody({ kind: 'ticket', id: 'parent-1', title: 'The epic' })`, spreads `ticketState: { ...body.ticketState, outcome: 'Yes', passes: [{ pass: 1, outcome: 'Yes', by: 'u', at: '2026-10-03T09:00:00.000Z', revisions: [] }] }`, and expects both onto `mapTicketRead(...).ticket`; the undecided body maps to a state with neither key. `replica-decision.test.ts`: copy the helpers of `replica.test.ts:80-290` (`envelope`, `workflowDefined`, `typeDefined`, `created`, `bootstrapOf`, `seededReplica`), then
    ```ts
    it('29.358 the replica folds ticket.decided into the confirmed state', async () => {
      const replica = await seededReplica();
      await replica.applyServerItem(created(TICKET, 'Go ahead?'));
      await replica.applyServerItem(envelope({ kind: 'ticket', id: TICKET }, 'ticket.decided', { outcome: 'Yes' }, { actorId: USER_B }));
      const confirmed = (await replica.getTicket(TICKET))?.confirmed;
      expect(confirmed?.outcome).toBe('Yes');
      expect(confirmed?.passes).toMatchObject([{ pass: 1, outcome: 'Yes', by: USER_B, revisions: [] }]);
      expect('outcome' in ((await replica.getTicket(OTHER_TICKET))?.confirmed ?? {})).toBe(false); // control
    });
    ```
  Run: build domain, rule-engine, app-core; `slot-run.sh wtg2-t5-client -- pnpm --filter @gisik-nokma/app-core exec vitest run --maxWorkers=2`, then mcp-server and sync-client whole. Expected: PASS. Flip 29.134, 29.137, 29.358 ✅.
  Commit: `wtg2 T5: the diamond icon, Decision defaults, mapper, History and replica`.

- [ ] **Step 6: Mobile bundle, wide runs, Features, DONE**
  1. Regenerate the editor bundle (contract decision 12): `pnpm --filter @gisik-nokma/editor run build:webview && pnpm --filter @gisik-nokma/mobile run generate:editor-html`; then `grep -c 'ticket.decided' apps/mobile/src/editor/editor-html.generated.ts` must print at least 1 (`--check` WARNS and exits 0 when the webview is unbuilt, so the grep is the assertion). Commit the generated file.
  2. WHOLE suites (the registry list and the `TicketState` shape reach every door): domain, rule-engine, app-core, sync-client, mcp-server, server (the dual-client rig `apps/server/test/dual-client/` compares whole states with `toEqual`), web. `pnpm check:citations && node scripts/check-case-ids.mjs && pnpm check:migrations`.
  3. Features: put the two bullets of Step 1 under the `<!-- wtg-part2-model T5 bullet -->` anchor (keep the anchor line: T19's 29.146 guard reads the bullets below it) (re-read them against the code).
  4. Flip the seven cases ✅ in the SAME commits as their tests. Push. DONE + REVIEW (NEEDS: T2 merged; T1's recorded result).

**Mutations** (each on the green branch, expect the named red, restore):

| Case | Mutation | Expected red |
|---|---|---|
| 29.134 | drop the Decision exclusion in `defaultRootTypeFor` | the `task` assertion |
| 29.134 | seed rank 4 | the seed `toEqual` and the `type.builtin-rank` case |
| 29.135 | make `outcome` optional | `ok({})` |
| 29.135 | omit `ticket.decided` from `GATED` | the "whole vocabulary" case in `live-ticket.test.ts` |
| 29.136 | fold `outcome: p.outcome` on a clear | `'outcome' in cleared` |
| 29.356 | append a pass on any differing choice | `passes` length after `s2` |
| 29.356 | treat `last.outcome === null` as rule 1 | `s4.passes` length |
| 29.357 | revise (not append) after a release | `s2.passes` second record |
| 29.137 | add `'ticket.decided'` to `BOOTSTRAP_BACKFILL_TYPES` | `[folded, backfilled]` |
| 29.137 | `rowToTicketState` always spreads `passes` | the absent-shape control |
| 29.358 | drop `passes` from `mapTicketState` | the mapped `passes` |

---

### Task 6: Decision rules: the engine checks, the close rule (DC-5), the client mirror and the auto-close sweep mirror (cases 29.138-29.142)

**Branch:** `task/wtg2-decision-rules` from `origin/release/workflow-graph`; PR `--base release/workflow-graph`. **Needs:** T5 merged (`ticket.decided`, `TicketState.outcome`, the `proj_tickets.outcome` column); T2 merged (`TicketState.links` with `label`, `normaliseLinkLabel`, `DECISION_TYPE_ID`, the `proj_tickets.links` jsonb column the sweep reads). **Independent of T8** (it carries the `branchNotTaken` parameter at its default; T8 Step 7 passes the real value once this task is on the tip).

**Files:**
- Create: `packages/rule-engine/src/checks/decision.ts`; `packages/rule-engine/test/decision.test.ts`; `packages/app-core/test/precheck-decision.test.ts`; `apps/server/test/decision/decision-door.test.ts`.
- Modify: `packages/rule-engine/src/checks/refusals.ts` (`REFUSALS` `:28-82`, builders after `rankRefusal` `:84`; typed-links T3 and T2 add their `link.*` keys in the same object, append ours after theirs); `packages/rule-engine/src/evaluate.ts` (import `:1-14`, switch `:40-81`); `packages/rule-engine/src/transition.ts:152-164` (the terminal block); `packages/rule-engine/src/checks/close.ts:77-95` (end of `checkTicketClosed`); `packages/rule-engine/src/index.ts` (the refusal-vocabulary export `:60-71`); `packages/app-core/src/precheck.ts` (imports `:1-20`, `precheckEvent` `:162-235`, `precheckTicketClosed` `:479-519`); `apps/server/src/auto-close/sweep.ts:176-215`; `apps/server/test/auto-close/sweep.test.ts` (a new describe after 13.1167, `:741-860`).
- Not touched, on purpose: `packages/rule-engine/src/fixtures/harness.ts`. The brief's "dispatch in the harness" has nothing to dispatch: the harness is a JSON fixture runner whose prior-event fold (`applyPriorEvent`, `:395-565`) refuses every type outside seven, links and `ticket.decided` among them, and the candidate event enters `evaluateEvent`. The cases use `buildMemoryContext` (`memory-context.ts`), which folds through the real reducer.

**Interfaces:**
- Consumes: T5 `ticketDecidedPayload`, `TicketState.outcome`; T2 `DECISION_TYPE_ID`, `normaliseLinkLabel`, `TicketLink.label`.
- Produces (rule-engine): `checkTicketDecided(env, ctx): Promise<Accept | Refusal>`; `decisionOutcomeRequired(ticket: TicketState, branchNotTaken?: boolean): Refusal | null` (pure, shared by the transition door, the close door and the client mirror; `branchNotTaken` defaults to `false` and is the DC-5 exemption T8 wires); `outcomeLabels(ticket: TicketState): string[]`; `REFUSALS['decision.not-a-decision']`, `REFUSALS['decision.outcome-required']`; builders `unknownOutcomeRefusal(outcome: string, labels: readonly string[])`, `sameOutcomeRefusal(current: string | null)`, `staleFromRefusal(current: string | null)`, all exported from the package index beside `rankRefusal`.

**Why the checks read only `ctx.getEntityState`.** The client precheck evaluates through `contextFromCache`, whose `getTicketTypeDef` THROWS (`precheck.ts:340-352`). A Decision is recognised by `ticket.typeId === DECISION_TYPE_ID` (spec DC-1), so no check here asks for a type definition, and the not-a-decision sentence names no type.

**Why `from` absent means "I saw no outcome".** DC-4: absent equals `null`. A first choice sends no `from`; a revision and a clear must send what they saw. So a double click (`{outcome:'Yes'}` twice) answers `decision.stale-from` the second time, truthfully: the decision did change since the sender looked. The order is type, stale-from, then the outcome rules, so two people revising at once hear about each other before they hear about labels. Clearing a decision that is not set is `decision.same-outcome` ("There is no decision to clear."): it would record a pass revision from null to null.

**Why the client mirror defers on an empty branch list.** DC-5's accept needs the Decision's full set of `leads_to` links; the cache holds the links THIS viewer was served, and a branch to a ticket they cannot see is a hole (spec FL-1). "Visible links: none" is therefore not "no branches", so a would-be `passed` becomes `not-evaluated` (the module's invariant: never manufacture a `passed` from absence). A refusal needs only one visible branch and no outcome, which is a fact the cache holds. The spec's sentence that the check "runs identically on the server and the replica" is true of the engine function and false of its inputs on a viewer-filtered cache (FINDING).

**Why the sweep reads `t.links`, not `proj_ticket_links`.** The engine reads `TicketState.links`, which is the `proj_tickets.links` column; "the SELECT mirrors every close refusal so it never builds a close this door refuses" (`sweep.ts:198-215`) means reading the SAME source, so the two cannot disagree after a rebuild.

- [ ] **Step 1: Catalogue**

  Under `<!-- wtg-part2-model T6 -->` (all ❌) and Features under `<!-- wtg-part2-model T6 bullet -->`:
  - `- ❌ **29.138 — ticket.decided is judged by the engine: a ticket that is not a Decision is refused decision.not-a-decision, an unknown ticket, a misfiled entity kind and a malformed payload are refused with their own sentences, and the event is reachable through evaluateEvent;** control: the same payload on a Decision is accepted. Mutation: drop the typeId check → the Task case is accepted.`
  - `- ❌ **29.139 — the outcome must be one of the Decision's outgoing leads_to labels (trim and case folded; the sentence lists them, or says there are none yet), must differ from the current one (decision.same-outcome), and must carry the outcome the sender saw (decision.stale-from, absent meaning none); null clears; a Decision already in a terminal state may be re-decided;** control: a blocks link's label-less target is not an outcome. Mutation: compare labels without folding → "yes" is refused.`
  - `- ❌ **29.140 — a Decision with at least one outgoing leads_to and no outcome cannot enter a terminal state or be closed (decision.outcome-required), on the engine and through the real ingest door; an unfinished child is still reported first;** control: no leads_to (a blocks link only), an outcome, a non-terminal target and a Task with branches all finish freely. Mutation: count any link kind → the blocks-only Decision is refused.`
  - `- ❌ **29.141 — the client precheck previews the same refusals from the cache (outcome-required when a branch is visible; the decided checks), and answers not-evaluated, never passed, when a terminal move or a close of an outcome-less Decision rests on branches this viewer cannot see, or when an outcome matches no visible label;** control: the same move with an outcome passes. Mutation: pass on an empty branch list → the not-evaluated assertion fails.`
  - `- ❌ **29.142 — the auto-close sweep does not select a terminal Decision that has a leads_to and no outcome (no envelope, no nightly refusal), including one whose outcome was cleared;** control: the same Decision with an outcome, one with no branches and a Task close in the same run. Mutation: drop the sweep clause → candidates 3, refused 1.`
  Features: `- ⚙️ **Decision rules** (\`packages/rule-engine/src/checks/decision.ts\`, \`auto-close/sweep.ts\`) — an outcome must be one of the branch labels and current; a Decision with branches cannot be finished or auto-closed without one. Cases 29.138-29.142.`
  Run `node scripts/check-case-ids.mjs && pnpm check:citations`. Commit: `wtg2 T6: open the Decision rule cases and Features bullet`.

- [ ] **Step 2: RED engine tests (29.138, 29.139, 29.140)**

  `packages/rule-engine/test/decision.test.ts`; header and builders copied from `test/close.test.ts:1-25` (`buildMemoryContext`, `evaluateEvent`, `makeEnvelope`, and `PROJECT, TASK, WF, WS, created, typeDefined` from `../src/checks/test-support.ts`):
  ```ts
  import { describe, expect, it } from 'vitest';
  import { DECISION_TYPE_ID, makeEnvelope, type EventEnvelope, type TicketTypeDef } from '@gisik-nokma/domain';
  import { buildMemoryContext } from '../src/memory-context.js';
  import { checkTicketClosed } from '../src/checks/close.js';
  import { checkTicketDecided, decisionOutcomeRequired } from '../src/checks/decision.js';
  import { evaluateEvent } from '../src/evaluate.js';
  import { PROJECT, TASK, WF, WS, created, typeDefined } from '../src/checks/test-support.js';

  const D = '01J9GDEC000000000000000000';
  const NEXT = '01J9GNXT000000000000000001';
  const NEXT2 = '01J9GNXT000000000000000002';
  const DECISION: TicketTypeDef = { id: DECISION_TYPE_ID, name: 'Decision', icon: 'diamond', rank: 3, workflowId: 'wf-basic', fields: [] };
  const on = (id: string, type: string, payload: unknown): EventEnvelope =>
    makeEnvelope({ type, entity: { kind: 'ticket', id }, workspaceId: WS, payload });
  const leadsTo = (label: string | undefined, target = NEXT, kind = 'leads_to') =>
    on(D, 'ticket.link_added', { kind, targetId: target, ...(label === undefined ? {} : { label }) });
  const decided = (outcome: string | null, from?: string | null) =>
    on(D, 'ticket.decided', { outcome, ...(from === undefined ? {} : { from }) });
  const move = (to: string) => on(D, 'ticket.transitioned', { to });
  const close = () => on(D, 'ticket.closed', {});
  /** A Decision with the named branches, then any later history. */
  const world = (labels: string[], ...after: EventEnvelope[]) =>
    buildMemoryContext([WF], [typeDefined(TASK), typeDefined(DECISION), created(D, DECISION_TYPE_ID, null, PROJECT), created(NEXT, 'task', null, PROJECT), created(NEXT2, 'task', null, PROJECT),
      ...labels.map((label, i) => leadsTo(label, i === 0 ? NEXT : NEXT2)), ...after]);
  ```
  Cases (literal sentences, never the builders):
  ```ts
  describe('29.138 checkTicketDecided: whose it is to judge', () => {
    it('29.138 refuses a Task, an unknown ticket, a misfiled kind and a bad payload; a Decision passes; evaluateEvent reaches it', async () => {
      expect(await checkTicketDecided(decided('Yes'), world(['Yes', 'No']))).toEqual({ refused: false });
      const task = on(NEXT, 'ticket.decided', { outcome: 'Yes' });
      expect(await checkTicketDecided(task, world(['Yes', 'No']))).toEqual({ refused: true, rule: 'decision.not-a-decision', reason: 'This ticket is not a Decision, so it has no outcome to choose.' });
      expect(await checkTicketDecided(on('01J9GGHO000000000000000000', 'ticket.decided', { outcome: 'Yes' }), world([]))).toEqual({ refused: true, rule: 'unknown-ticket', reason: 'This event records a decision on ticket 01J9GGHO000000000000000000, but no such ticket is known.' });
      const note = makeEnvelope({ type: 'ticket.decided', entity: { kind: 'note', id: D }, workspaceId: WS, payload: { outcome: 'Yes' } });
      expect(await checkTicketDecided(note, world([]))).toEqual({ refused: true, rule: 'malformed-payload', reason: 'This ticket.decided event does not point at a ticket; it points at a note.' });
      const bad = await checkTicketDecided(on(D, 'ticket.decided', {}), world([]));
      expect(bad).toMatchObject({ refused: true, rule: 'malformed-payload' });
      expect(bad.refused && bad.reason.startsWith("This ticket.decided event's payload is malformed: at outcome")).toBe(true);
      expect(await evaluateEvent(task, world(['Yes']))).toMatchObject({ rule: 'decision.not-a-decision' }); // dispatch
      expect(await evaluateEvent(decided('Yes'), world(['Yes']))).toEqual({ refused: false });
    });
  });

  describe('29.139 the outcome rules', () => {
    it('29.139 unknown label (listed, or "no outcomes yet"), fold-insensitive match, same, stale and clear', async () => {
      expect(await checkTicketDecided(decided('Maybe'), world(['Yes', 'No']))).toEqual({ refused: true, rule: 'decision.unknown-outcome', reason: '"Maybe" is not one of this decision\'s outcomes: "Yes", "No".' });
      expect(await checkTicketDecided(decided('Yes'), world([]))).toEqual({ refused: true, rule: 'decision.unknown-outcome', reason: 'This decision has no outcomes yet. Link it to the next steps, with a label on each, first.' });
      // a blocks link is not a branch, even with a label-shaped neighbour
      expect(await checkTicketDecided(decided('Yes'), world([], on(D, 'ticket.link_added', { kind: 'blocks', targetId: NEXT })))).toMatchObject({ rule: 'decision.unknown-outcome' });
      expect(await checkTicketDecided(decided('  yes '), world(['Yes', 'No']))).toEqual({ refused: false }); // control: trim and case fold
      const yes = world(['Yes', 'No'], decided('Yes'));
      expect(await checkTicketDecided(decided('yes', 'Yes'), yes)).toEqual({ refused: true, rule: 'decision.same-outcome', reason: 'The decision is already Yes.' });
      expect(await checkTicketDecided(decided('No'), yes)).toEqual({ refused: true, rule: 'decision.stale-from', reason: 'The decision changed to Yes since you looked.' });
      expect(await checkTicketDecided(decided('No', 'Maybe'), yes)).toMatchObject({ rule: 'decision.stale-from' });
      expect(await checkTicketDecided(decided('No', 'Yes'), yes)).toEqual({ refused: false }); // control: the right `from`
      expect(await checkTicketDecided(decided(null, 'Yes'), yes)).toEqual({ refused: false });
      expect(await checkTicketDecided(decided(null), yes)).toMatchObject({ rule: 'decision.stale-from' });
      const cleared = world(['Yes', 'No'], decided('Yes'), decided(null, 'Yes'));
      expect(await checkTicketDecided(decided(null, null), cleared)).toEqual({ refused: true, rule: 'decision.same-outcome', reason: 'There is no decision to clear.' });
      expect(await checkTicketDecided(decided('Yes', 'Yes'), cleared)).toEqual({ refused: true, rule: 'decision.stale-from', reason: 'The decision was cleared since you looked.' });
      expect(await checkTicketDecided(decided('No', 'Yes'), world(['Yes', 'No'], decided('Yes'), move('done')))).toEqual({ refused: false }); // PS-6: a terminal Decision may be re-decided
    });
  });

  describe('29.140 DC-5: no finishing without an outcome', () => {
    it('29.140 the transition door and the close door refuse; the controls finish freely; an open child is reported first', async () => {
      const outcomeRequired = { refused: true, rule: 'decision.outcome-required', reason: 'Choose an outcome before finishing this decision.' };
      expect(await evaluateEvent(move('done'), world(['Yes', 'No']))).toEqual(outcomeRequired);
      expect(await checkTicketClosed(close(), world(['Yes', 'No'], move('done')))).toEqual(outcomeRequired);
      // controls, same it(): each finishes freely
      expect(await evaluateEvent(move('done'), world(['Yes', 'No'], decided('Yes')))).toEqual({ refused: false });
      expect(await evaluateEvent(move('done'), world([], on(D, 'ticket.link_added', { kind: 'blocks', targetId: NEXT })))).toEqual({ refused: false });
      expect(await evaluateEvent(move('doing'), world(['Yes', 'No']))).toEqual({ refused: false });
      expect(await checkTicketClosed(close(), world(['Yes'], decided('Yes'), move('done')))).toEqual({ refused: false });
      const taskWithBranch = on(NEXT, 'ticket.transitioned', { to: 'done' });
      expect(await evaluateEvent(taskWithBranch, world(['Yes']))).toEqual({ refused: false });
      // a cleared decision is outcome-less again
      expect(await evaluateEvent(move('done'), world(['Yes'], decided('Yes'), decided(null, 'Yes')))).toEqual(outcomeRequired);
      // the parent-terminal invariant keeps its place in front
      const child = makeEnvelope({ type: 'ticket.created', entity: { kind: 'ticket', id: NEXT2 }, workspaceId: WS, payload: { typeId: 'task', projectId: PROJECT, parentId: D, title: 'child' } });
      expect(await evaluateEvent(move('done'), world(['Yes'], child))).toMatchObject({ rule: 'parent-terminal-with-open-children' });
    });
    it('29.140 the exemption parameter is off by default and lifts only the outcome rule', () => {
      const state = { kind: 'ticket', typeId: DECISION_TYPE_ID, links: [{ kind: 'leads_to', targetId: NEXT, label: 'Yes' }] } as never;
      expect(decisionOutcomeRequired(state)).toMatchObject({ rule: 'decision.outcome-required' });
      expect(decisionOutcomeRequired(state, true)).toBeNull();
    });
  });
  ```
  (`world([], child)` for the open-child case: the child is created with `parentId: D`; `world`'s `NEXT2` is already created, so use a fresh id `CHILD = '01J9GCHD000000000000000000'` in that one line.) Run: `pnpm --filter @gisik-nokma/domain build` then `/Users/kiro/my_projects/gisik-nokma-lanes/slot-run.sh wtg2-t6-red -- pnpm --filter @gisik-nokma/rule-engine exec vitest run test/decision.test.ts > /tmp/wtg2-t6-red.log 2>&1; tail -30 /tmp/wtg2-t6-red.log`. Expected: FAIL (no `checks/decision.js`).

- [ ] **Step 3: Engine implementation**

  `refusals.ts` (siblings: the `hierarchy.*` fixed keys `:28-82` and `rankRefusal` `:84-86`):
  ```ts
    'decision.not-a-decision': 'This ticket is not a Decision, so it has no outcome to choose.',
    'decision.outcome-required': 'Choose an outcome before finishing this decision.',
  ```
  ```ts
  /** `ticket.decided` names a label the Decision does not have. Built, like `rankRefusal`, because it names the labels. */
  export function unknownOutcomeRefusal(outcome: string, labels: readonly string[]): string {
    return labels.length === 0
      ? 'This decision has no outcomes yet. Link it to the next steps, with a label on each, first.'
      : `"${outcome}" is not one of this decision's outcomes: ${labels.map((label) => `"${label}"`).join(', ')}.`;
  }
  export function sameOutcomeRefusal(current: string | null): string {
    return current === null ? 'There is no decision to clear.' : `The decision is already ${current}.`;
  }
  /** DC-4's sentence, with the third reading it needs: the decision was cleared while the sender looked at an outcome. */
  export function staleFromRefusal(current: string | null): string {
    return current === null ? 'The decision was cleared since you looked.' : `The decision changed to ${current} since you looked.`;
  }
  ```
  `checks/decision.ts` (siblings: `checks/close.ts` for the guard order and `rank.ts` for the file shape):
  ```ts
  import { DECISION_TYPE_ID, normaliseLinkLabel, ticketDecidedPayload, type EventEnvelope, type TicketState } from '@gisik-nokma/domain';
  import type { Accept, EngineContext, Refusal } from '../engine.js';
  import { REFUSAL_RULES, malformedPayloadDetail } from '../refusal-rules.js';
  import { getTicketState } from './context-helpers.js';
  import { ACCEPT, refuse, sameOutcomeRefusal, staleFromRefusal, unknownOutcomeRefusal } from './refusals.js';

  const sameLabel = (a: string | null, b: string | null): boolean =>
    a === null || b === null ? a === b : normaliseLinkLabel(a) === normaliseLinkLabel(b);

  /** A Decision's outcomes: the labels of its outgoing `leads_to` links, in the order they were added. */
  export function outcomeLabels(ticket: TicketState): string[] {
    const labels: string[] = [];
    for (const link of ticket.links ?? []) if (link.kind === 'leads_to' && link.label !== undefined) labels.push(link.label);
    return labels;
  }

  export async function checkTicketDecided(env: EventEnvelope, ctx: EngineContext): Promise<Accept | Refusal> {
    if (env.type !== 'ticket.decided') return ACCEPT;
    if (env.entity.kind !== 'ticket') {
      return refuse(REFUSAL_RULES.malformedPayload, `This ticket.decided event does not point at a ticket; it points at a ${env.entity.kind}.`);
    }
    const parsed = ticketDecidedPayload.safeParse(env.payload);
    if (!parsed.success) {
      return refuse(REFUSAL_RULES.malformedPayload, `This ticket.decided event's payload is malformed: ${malformedPayloadDetail(parsed.error)}`);
    }
    const ticket = await getTicketState(ctx, env.entity.id);
    if (ticket === null) return refuse(REFUSAL_RULES.unknownTicket, `This event records a decision on ticket ${env.entity.id}, but no such ticket is known.`);
    if (ticket.typeId !== DECISION_TYPE_ID) return refuse('decision.not-a-decision');
    const { outcome, from } = parsed.data;
    const current = ticket.outcome ?? null;
    if (!sameLabel(from ?? null, current)) return refuse('decision.stale-from', staleFromRefusal(current));
    if (outcome === null) return current === null ? refuse('decision.same-outcome', sameOutcomeRefusal(null)) : ACCEPT;
    const labels = outcomeLabels(ticket);
    if (!labels.some((label) => sameLabel(label, outcome))) return refuse('decision.unknown-outcome', unknownOutcomeRefusal(outcome, labels));
    if (current !== null && sameLabel(current, outcome)) return refuse('decision.same-outcome', sameOutcomeRefusal(current));
    return ACCEPT;
  }

  /**
   * DC-5: a Decision with at least one outgoing `leads_to` and no outcome may not be finished. Shared by the transition door,
   * the close door and the client mirror, so the three cannot drift. Reads `TicketState.links` and `.outcome`, the facts the
   * server row, the replica and the memory context all fold. `branchNotTaken` is the one exemption (PS-5: the flow closes a
   * Decision that sits on a branch not taken); the callers pass it only AFTER `cause.forged` (T8) has proved the actor.
   */
  export function decisionOutcomeRequired(ticket: TicketState, branchNotTaken = false): Refusal | null {
    if (branchNotTaken || ticket.typeId !== DECISION_TYPE_ID || (ticket.outcome ?? null) !== null) return null;
    if (!(ticket.links ?? []).some((link) => link.kind === 'leads_to')) return null;
    return refuse('decision.outcome-required');
  }
  ```
  `evaluate.ts`: import `checkTicketDecided` and add `case 'ticket.decided': return checkTicketDecided(env, ctx);` after the `ticket.restored` arm (typed-links T3 adds the link arms in this switch; place ours after the last `ticket.*` arm of whatever is on the tip). `transition.ts` terminal block, after the `if (openCount > 0) {…}` return and before the block's closing brace (`:164`): `const outcomeRequired = decisionOutcomeRequired(ticket); if (outcomeRequired !== null) return outcomeRequired;` with the comment "DC-5, after the parent invariant (which no definition can switch off); T8 passes `branchNotTaken` here". `close.ts`: replace the final `return ACCEPT;` of `checkTicketClosed` (the one after the `openCount` refusal, `:84-85`) with `return decisionOutcomeRequired(ticket) ?? ACCEPT;`. `index.ts`: add `staleFromRefusal`, `sameOutcomeRefusal`, `unknownOutcomeRefusal` to the refusal export list and `export { checkTicketDecided, decisionOutcomeRequired, outcomeLabels } from './checks/decision.js';`.
  Run the file, then the whole rule-engine suite (the 86 shared fixtures must stay green). Expected: PASS. Flip 29.138, 29.139 and the engine half of 29.140 ✅.
  Commit: `wtg2 T6: ticket.decided checks and the close rule`.

- [ ] **Step 4: The real door (29.140) and the sweep (29.142)**

  `apps/server/test/decision/decision-door.test.ts`: the world of `auto-close/sweep.test.ts:80-130,170-230` (`createTestDatabase`, `applyCommitted`, `makeCommitted`; the `realIngest()` helper `:290-295` with `createIngestService({ pool, evaluate: evaluateEvent, projections: buildProjectionRegistry() })`): seed workflow + a `decision` type (rank 1) + a Decision with `leads_to` label `Yes` to a second ticket, via `applyCommitted`. Then:
  ```ts
  const submit = (ticketId: string, type: string, payload: unknown) =>
    ({ id: newUlid(), workspaceId: WS, entity: { kind: 'ticket', id: ticketId }, type, version: 1, payload, actorId: HUMAN, origin: 'server', clientTime: '2026-10-03T09:00:00.000Z' });
  it('29.140 the real door refuses finishing an outcome-less Decision, then accepts it after ticket.decided', async () => {
    const [refused] = await realIngest().ingestBatch([submit(D, 'ticket.transitioned', { to: 'done' })]);
    expect(refused).toMatchObject({ status: 'refused', rule: 'decision.outcome-required', reason: 'Choose an outcome before finishing this decision.' });
    const [decided] = await realIngest().ingestBatch([submit(D, 'ticket.decided', { outcome: 'Yes' })]);
    expect(decided).toMatchObject({ status: 'committed' });
    const [ok] = await realIngest().ingestBatch([submit(D, 'ticket.transitioned', { to: 'done' })]);
    expect(ok).toMatchObject({ status: 'committed' }); // control: the same move, now with an outcome, from the same row
  });
  ```
  (`D`'s workflow has `todo -> doing -> done` declared edges as in `sweep.test.ts:140-150`; start the Decision `focus` and move it to `doing` in the seed so `doing -> done` is one declared edge.) `sweep.ts`: add the clause after the child-guard `NOT EXISTS` (`:206-211`) and the parameter:
  ```sql
          -- DC-5 (wtg2 T6): a Decision with branches and no outcome is not a candidate. `checks/decision.ts` refuses its close,
          -- and a republish can leave one terminal with no transition (as for the child guard above). Read from `t.links`, the
          -- column the engine's TicketState.links comes from, so the two cannot disagree after a rebuild.
          AND NOT (
                t.type_id = $3
            AND t.outcome IS NULL
            AND EXISTS (SELECT 1 FROM jsonb_array_elements(t.links) AS l WHERE l ->> 'kind' = 'leads_to')
          )
  ```
  with `[workspaceId, cutoff, DECISION_TYPE_ID]` (import the constant from `@gisik-nokma/domain`). `sweep.test.ts`, new `describe('29.142 …')` after 13.1167, using `seedWorkflowAndType`, `seedAutoClose`, `seedTicket`, `sweep`, `closedAt`, `applyCommitted`, `makeCommitted`, `HUMAN`, `PROJECT`, `WF`, `DAYS`:
  ```ts
  async function seedDecision(ws: string, o: { branches: boolean; outcome: 'none' | 'set' | 'cleared' }): Promise<string> {
    const id = newUlid();
    const next = o.branches ? await seedTicket({ workspaceId: ws, enteredAt: '2026-09-17T00:00:00.000Z', state: 'doing' }) : null;
    const at = (type: string, payload: unknown, serverTime: string) =>
      makeCommitted({ workspaceId: ws, actorId: HUMAN, entity: { kind: 'ticket', id }, type, payload, serverTime });
    await applyCommitted(db.pool, [
      at('ticket.created', { typeId: 'decision', projectId: PROJECT, parentId: null, title: 'Go ahead?', start: 'focus' }, '2026-08-01T00:00:00.000Z'),
      ...(next === null ? [] : [at('ticket.link_added', { kind: 'leads_to', targetId: next, label: 'Yes' }, '2026-08-01T00:01:00.000Z')]),
      at('ticket.transitioned', { to: 'doing' }, '2026-08-01T00:05:00.000Z'),
      at('ticket.transitioned', { to: 'done' }, '2026-08-02T00:00:00.000Z'),
      ...(o.outcome === 'none' ? [] : [at('ticket.decided', { outcome: 'Yes' }, '2026-08-02T00:01:00.000Z')]),
      ...(o.outcome === 'cleared' ? [at('ticket.decided', { outcome: null, from: 'Yes' }, '2026-08-02T00:02:00.000Z')] : []),
    ]);
    return id;
  }
  it('29.142 an outcome-less Decision with branches is not a candidate (nor is a cleared one); the controls are', async () => {
    const ws = newUlid();
    await seedWorkflowAndType(ws);
    await applyCommitted(db.pool, [makeCommitted({ workspaceId: ws, actorId: HUMAN, entity: { kind: 'ticket-type', id: 'decision' }, type: 'ticket-type.defined', payload: { id: 'decision', name: 'Decision', icon: 'diamond', rank: 1, workflowId: WF, fields: [] } })]);
    await seedAutoClose(ws, DAYS);
    const bare = await seedDecision(ws, { branches: true, outcome: 'none' });
    const cleared = await seedDecision(ws, { branches: true, outcome: 'cleared' });
    const chosen = await seedDecision(ws, { branches: true, outcome: 'set' });
    const free = await seedDecision(ws, { branches: false, outcome: 'none' });
    const task = await seedTicket({ workspaceId: ws, enteredAt: '2026-08-02T00:00:00.000Z' });
    expect(await sweep()).toEqual({ workspacesOn: 1, candidates: 3, closed: 3, refused: 0 });
    for (const id of [chosen, free, task]) expect(await closedAt(id)).not.toBeNull();
    for (const id of [bare, cleared]) expect(await closedAt(id)).toBeNull();
  });
  ```
  Run (LOCAL): build domain and rule-engine, `slot-run.sh wtg2-t6-server -- pnpm --filter @gisik-nokma/server exec vitest run test/decision test/auto-close --maxWorkers=2`. Expected: PASS. Flip 29.140 (door half) and 29.142 ✅.
  Commit: `wtg2 T6: the real-door case and the auto-close sweep mirror`.

- [ ] **Step 5: The client mirror (29.141)**

  `precheck.ts`: import `decisionOutcomeRequired` from `@gisik-nokma/rule-engine`, `ticketDecidedPayload` and `DECISION_TYPE_ID` from the domain. In `precheckEvent`, beside the `ticket.ranked` line (`:185`): `if (submitted.type === 'ticket.decided') return precheckTicketDecided(submitted, cache, deps);`. In the transition accept branch (`:222-226`) add `if (acceptRestsOnUnseenBranches(ticket, def, payload.data)) return notEvaluated();` after the parent line. In `precheckTicketClosed`, replace the final `return { kind: 'passed' };` (`:518`) with:
  ```ts
    const needsOutcome = decisionOutcomeRequired(ticket);
    if (needsOutcome !== null) return { kind: 'refused', rule: needsOutcome.rule, reason: needsOutcome.reason };
    if (decisionBranchesUnseen(ticket)) return notEvaluated();
    return { kind: 'passed' };
  ```
  and add:
  ```ts
  /** An outcome-less Decision that shows this viewer no branch: "no branches" and "branches I cannot see" look the same here. */
  function decisionBranchesUnseen(ticket: TicketState): boolean {
    return ticket.typeId === DECISION_TYPE_ID && (ticket.outcome ?? null) === null && !(ticket.links ?? []).some((link) => link.kind === 'leads_to');
  }
  /** DC-5's accept needs every branch; the cache holds the visible ones only. A refusal needs just one visible branch and rides the engine verdict above. */
  function acceptRestsOnUnseenBranches(ticket: TicketState, def: WorkflowDef, payload: TicketTransitionedPayload): boolean {
    return decisionBranchesUnseen(ticket) && statesWithBacklog(def).find((state) => state.id === payload.to)?.category === 'terminal';
  }
  async function precheckTicketDecided(submitted: SubmittedEvent, cache: ClientStateCache, deps: PrecheckDeps): Promise<PrecheckResult> {
    if (!ticketDecidedPayload.safeParse(submitted.payload).success) return notEvaluated();
    if (cache.getTicket(submitted.entity.id) === undefined) return notEvaluated();
    const verdict = await (deps.evaluate ?? evaluateEvent)(completeForPrecheck(submitted, deps.now), contextFromCache(cache));
    if (!verdict.refused) return { kind: 'passed' }; // an outcome that matched a VISIBLE label is a fact the cache holds
    // A label matching no visible branch may still name one the viewer cannot see: defer, never refuse (the module's invariant).
    if (verdict.rule === 'decision.unknown-outcome') return notEvaluated();
    return { kind: 'refused', rule: verdict.rule, reason: verdict.reason };
  }
  ```
  `packages/app-core/test/precheck-decision.test.ts`: header (`vi.unmock('@gisik-nokma/domain')`, `make = makeSubmittedFactory`, `ACTOR`) and `readyCache` copied from `precheck.test.ts:20-125`, with `TICKET` a Decision (`ticketStateSeed({ id: TICKET, typeId: 'decision', stateId: 'doing', stateCategory: 'active', links: [...] })`):
  ```ts
  it('29.141 a visible branch and no outcome previews outcome-required for the move and the close; no visible branch defers; an outcome passes', async () => {
    const link = { kind: 'leads_to' as const, targetId: '01J9GNXT000000000000000001', label: 'Yes' };
    const done = (extras: Record<string, unknown> = {}) => transitionTo('done', { comment: { text: 'ok' }, ...extras });
    expect(await precheckEvent(done(), readyCache({ typeId: 'decision', links: [link] }))).toEqual({ kind: 'refused', rule: 'decision.outcome-required', reason: 'Choose an outcome before finishing this decision.' });
    expect(await precheckEvent(closeTicket(), readyCache({ typeId: 'decision', stateId: 'done', stateCategory: 'terminal', links: [link] }))).toMatchObject({ kind: 'refused', rule: 'decision.outcome-required' });
    expect(await precheckEvent(done(), readyCache({ typeId: 'decision' }))).toEqual({ kind: 'not-evaluated', why: 'missing-local-state' }); // no visible branch
    expect(await precheckEvent(closeTicket(), readyCache({ typeId: 'decision', stateId: 'done', stateCategory: 'terminal' }))).toEqual({ kind: 'not-evaluated', why: 'missing-local-state' });
    expect(await precheckEvent(done(), readyCache({ typeId: 'decision', links: [link], outcome: 'Yes' }))).toEqual({ kind: 'passed' }); // control
    expect(await precheckEvent(done(), readyCache({ typeId: 'task', links: [link] }))).toEqual({ kind: 'passed' }); // control: a Task
    const decide = (outcome: string | null, from?: string | null) => make({ workspaceId: WS, entity: { kind: 'ticket', id: TICKET }, type: 'ticket.decided', payload: { outcome, ...(from === undefined ? {} : { from }) } });
    expect(await precheckEvent(decide('Yes'), readyCache({ typeId: 'decision', links: [link] }))).toEqual({ kind: 'passed' });
    expect(await precheckEvent(decide('Maybe'), readyCache({ typeId: 'decision', links: [link] }))).toEqual({ kind: 'not-evaluated', why: 'missing-local-state' });
    expect(await precheckEvent(decide('No', 'Yes'), readyCache({ typeId: 'decision', links: [link] }))).toMatchObject({ kind: 'refused', rule: 'decision.stale-from' });
    expect(await precheckEvent(decide('Yes'), readyCache({ typeId: 'task', links: [link] }))).toMatchObject({ kind: 'refused', rule: 'decision.not-a-decision' });
  });
  ```
  Run: build rule-engine, `slot-run.sh wtg2-t6-app -- pnpm --filter @gisik-nokma/app-core exec vitest run --maxWorkers=2`. Expected: PASS. Flip 29.141 ✅.
  Commit: `wtg2 T6: the client precheck mirror`.

- [ ] **Step 6: Wide runs, Features, DONE**
  Build domain, rule-engine, app-core, then WHOLE rule-engine, app-core, sync-client (its local context evaluates through the engine) and server suites; `pnpm check:citations && node scripts/check-case-ids.mjs`. Flip anything left ✅ in the commit of its test; put the Step 1 bullet under the `<!-- wtg-part2-model T6 bullet -->` anchor (keep the anchor line: 29.146 reads the bullets below it). No mobile bundle step: this task changes no registry, no vocabulary and no notification kind. Push. DONE + REVIEW (NEEDS: T5, T2 merged; the `ticket.decided` server door gates `decision.bad-close-started` and `decision.cascade-blocked` are T16's, not here).

**Mutations** (each on the green branch, expect the named red, restore):

| Case | Mutation | Expected red |
|---|---|---|
| 29.138 | drop `ticket.typeId !== DECISION_TYPE_ID` | the Task case is accepted |
| 29.139 | compare `label === outcome` without `normaliseLinkLabel` | `'  yes '` refused |
| 29.139 | check unknown-outcome before stale-from | the wrong-`from` case names labels |
| 29.139 | treat absent `from` as "any" | `decided('No')` accepted over `Yes` |
| 29.140 | `links.length > 0` instead of `kind === 'leads_to'` | the blocks-only Decision is refused |
| 29.140 | drop the `close.ts` call | the close case is accepted |
| 29.140 | run DC-5 before the child count | the open-child case names the outcome |
| 29.141 | return `passed` on an empty branch list | the not-evaluated assertions |
| 29.141 | map `decision.unknown-outcome` to `refused` | `decide('Maybe')` |
| 29.142 | drop the sweep clause | `candidates: 5`, one `refused` |
| 29.142 | read `proj_ticket_links` instead of `t.links` | still green on this seed: add a Decision whose link row was removed (`ticket.link_removed`) to the seed if a reviewer wants the divergence pinned |

---

### Task 7: The Decision type in existing and new workspaces (the DC-3 backfill, founding, seed readers) (cases 29.143-29.144)

**Branch:** `task/wtg2-decision-backfill` from `origin/release/workflow-graph`; PR `--base release/workflow-graph`. **Needs:** T6 merged (the engine knows the Decision type) and T8 merged (`SYSTEM_ACTOR_FLOW`); T5 (the seed) and T2 (`DECISION_TYPE_ID`) come with them. T1's recorded prod result decides one thing here: if it lists an existing `decision` type, the backfill ADOPTS it (DC-3, open question 3) and this task changes nothing for that workspace.

**Files:**
- Create: `apps/server/src/flow/decision-backfill.ts`; `apps/server/src/tools/backfill-decision-type.ts` (CLI); `apps/server/test/flow/decision-backfill.test.ts`; `packages/app-core/test/views/subtask-type-for.test.ts`.
- Modify: `apps/server/src/ops/backup-daemon-main.ts` (import block `:1-27`, env read after `:194`, job after the `auto-close` entry `:276-292`); `apps/server/package.json:15` (script `wtg:backfill-decision`); `.env.example:385` (new variable); `docs/manual.md:48,227,1555,1579`; `packages/app-core/src/help/content.generated.ts` (generated); `Features.md:485,521,544`.
- Modify tests (the pins the fifth seed breaks): `apps/server/test/routes/workspaces.test.ts:117,142-155,233,264-265,365`; `apps/server/test/permissions/check-role-permission.test.ts:625-650,748-901`; `apps/server/test/routes/workspace-bootstrap-failure.test.ts:62,255-263`; `apps/server/test/seed/seed-cc.test.ts:164-169`; `apps/server/test/ops/backup-daemon-main.test.ts` (new case after 6.350); `packages/domain/test/ticket-types.test.ts:164-190`; `packages/app-core/test/ticket-types/ticket-types.test.tsx:239,342` (+ one icon case); `packages/app-core/test/views/new-ticket-dialog.test.tsx:1066-1100`.

**Interfaces:**
- **Consumes:** `DECISION_TYPE_ID`, `builtinTicketTypeDefs`, `ticketTypeDefSchema` (domain; the seed is T5's); `SYSTEM_ACTOR_FLOW` (T8, `packages/domain/src/system-actors.ts`); `IngestService['ingestBatch']`, `Queryable` (siblings: `apps/server/src/auto-close/sweep.ts` for the door, the refusal counting and the injected clock; `apps/server/src/ops/expired-sessions.ts:22` for the env reader).
- **Produces** (`apps/server/src/flow/decision-backfill.ts`; T14's flow sweep and the CLI read them): `type DecisionBackfillReport = { candidates: number; defined: number; refused: number; alreadyHad: number }`; `type DecisionBackfillCandidate = { workspaceId: string; workflowId: string }`; `findDecisionBackfillCandidates(pool: Queryable): Promise<DecisionBackfillCandidate[]>`; `backfillDecisionType(deps: { pool: Queryable; ingest: Pick<IngestService, 'ingestBatch'>; now?: () => Date; log?: (message: string, error?: unknown) => void }): Promise<DecisionBackfillReport>`; `decisionBackfillIntervalMs(env): number`; `firstThenEvery(everyMs: number, bootMs: number): () => number`; `DECISION_BACKFILL_BOOT_DELAY_MS = 30_000`.

**Why the job runs on the backup worker's scheduler, not as a one-shot.** `docker-entrypoint.sh` runs migrations and then starts the server or the worker from the same image; there is no pre-deploy job in `deploy/do/app.yaml`, and a migration cannot append ledger events through the engine. The `backup` worker has `instance_count: 1` and already runs `ingestBatch` (the auto-close job, `backup-daemon-main.ts:276-292`). So the job is a scheduled entry whose FIRST run lands 30 s after boot and which then repeats daily. The repeat is not decoration: during a rolling deploy the OLD server image can still found a workspace with four types after the worker's first run, and only a re-run heals it. Re-running is harmless by construction (the candidate query excludes a workspace that has the type).

**Why the SELECT is `proj_ticket_types`, not `proj_workspaces`.** `proj_workspaces` holds a row only for a workspace that has had a lifecycle event (`1790500000000_lifecycle.sql:1-13`, "absence is live"), so it cannot enumerate workspaces. A workspace that has a `task` type row is the set DC-3 binds to ("the workflow of its `task` type"); one without it has nothing to bind to and is skipped. Trashed (`deleted_at`) and purge-marked workspaces are skipped: the ledger is append-only, and an event in a workspace about to be erased is a write nobody can ever use.

**Why T7 pins `defaultRootTypeFor` and `subtaskTypeFor` (T5 changes them).** Both break rank ties by smaller id (`new-ticket-dialog.tsx:72-76`, `ticket-sheet.tsx:179-181`). `decision` (rank 3) sorts before `task` (rank 3) and before `errand`, so without T5's rule a root ticket would open on Decision, and a custom ladder without `task` would offer Decision as the sub-task default. The fix prefers any non-Decision type and falls back to the Decision only when it is all that is legal. `subtaskTypeFor` rule 1 (`task` wins whenever legal) already protects a default ladder; the regression is a custom one.

- [ ] **Step 1: Case lines under `<!-- wtg-part2-model T7 -->`, all ❌**

  - `- ❌ **29.143 — the DC-3 backfill defines the Decision type in every live workspace that has a task type and no decision type, bound to the task type's workflow, filed by the flow actor through the server origin; a second run adds nothing;** control: a workspace that already has a custom decision type (rank 5) is untouched, a deleted workspace, a purge-marked workspace and a workspace with no task type get nothing, and a refused or invalid answer is counted in refused and logged, not thrown; the daemon wires the job (first run at min(30 s, interval), then every interval) and logs "decision backfill complete". Mutation: bind to the first workflow instead of the task type's → the bound workflow differs; drop the NOT EXISTS → the second run defines again.`
  - `- ❌ **29.144 — a newly founded workspace holds eight ledger events with the Decision as its fifth type, defaultRootTypeFor and subtaskTypeFor never default to it, the type lists lock its rank and draw a diamond, and the five-type pins (founding, seed counts, manual) read five while the fallback notice (T5) names no count;** control: Decision is still chosen when it is the only legal type. Mutation: drop the DECISION_TYPE_ID filter in defaultRootTypeFor → a root ticket opens on Decision; drop the diamond entry → the Decision row draws the folder.`

  Commit: `wtg2 T7: case lines 29.143-29.144 (red)`.

- [ ] **Step 2: RED backfill tests** — `apps/server/test/flow/decision-backfill.test.ts` (database per case, as the sibling `apps/server/test/auto-close/sweep.test.ts` does; the fixture seeds LEGACY workspaces with `applyCommitted`, which does NOT run `bootstrapWorkspace`, `helpers/apply.ts:111-114`):

  ```ts
  import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
  import { evaluateEvent } from '@gisik-nokma/rule-engine';
  import {
    builtinTicketTypeDefs, DECISION_TYPE_ID, newUlid, SYSTEM_ACTOR_FLOW, ticketTypeDefSchema, type TicketTypeDef,
  } from '@gisik-nokma/domain';
  import {
    backfillDecisionType, decisionBackfillIntervalMs, findDecisionBackfillCandidates, firstThenEvery,
  } from '../../src/flow/decision-backfill.js';
  import { createIngestService } from '../../src/ingest/ingest-service.js';
  import { buildProjectionRegistry } from '../../src/projections/index.js';
  import { applyCommitted, makeCommitted, resetEntitySeqs } from '../helpers/apply.js';
  import { createTestDatabase, type TestDatabase } from '../helpers/db.js';

  const HUMAN = '01J9GUKR000000000000000000';
  let db: TestDatabase;
  beforeEach(async () => { resetEntitySeqs(); db = await createTestDatabase(); });
  afterEach(async () => { await db.drop(); });

  const door = () => createIngestService({ pool: db.pool, evaluate: evaluateEvent, projections: buildProjectionRegistry() });
  const workflowEvent = (workspaceId: string, id: string) => makeCommitted({
    workspaceId, actorId: HUMAN, entity: { kind: 'workflow', id }, type: 'workflow.defined',
    payload: { id, version: 1, name: 'Flow', initialStateId: 'todo',
      states: [{ id: 'todo', name: 'To do', category: 'open' }, { id: 'done', name: 'Done', category: 'terminal' }],
      transitions: [{ from: 'todo', to: 'done', rules: [] }] },
  });
  const typeEvent = (workspaceId: string, def: TicketTypeDef) => makeCommitted({
    workspaceId, actorId: HUMAN, entity: { kind: 'ticket-type', id: newUlid() }, type: 'ticket-type.defined', payload: def,
  });
  const lifecycle = (workspaceId: string, type: 'workspace.deleted' | 'purge.marked') => makeCommitted({
    workspaceId, actorId: HUMAN, entity: { kind: 'workspace', id: workspaceId }, type, payload: {},
  });

  /** A workspace founded BEFORE the Decision seed: four types, `task` bound to `taskWf` (default: the main workflow). */
  async function seedLegacy(workspaceId: string, opts: { taskWf?: string; withoutTask?: boolean } = {}): Promise<{ mainWf: string; taskWf: string }> {
    const mainWf = `wf-main-${workspaceId}`;
    const taskWf = opts.taskWf ?? mainWf;
    const defs = builtinTicketTypeDefs(mainWf)
      .filter((d) => d.id !== DECISION_TYPE_ID && !(opts.withoutTask === true && d.id === 'task'))
      .map((d) => (d.id === 'task' ? { ...d, workflowId: taskWf } : d));
    await applyCommitted(db.pool, [
      ...[...new Set([mainWf, taskWf])].map((id) => workflowEvent(workspaceId, id)),
      ...defs.map((d) => typeEvent(workspaceId, d)),
    ]);
    return { mainWf, taskWf };
  }
  const decisionRows = async (workspaceId: string) => (await db.pool.query<{ workflow_id: string; rank: number; icon: string; name: string; fields: unknown; defined_by: string }>(
    `SELECT workflow_id, rank, icon, name, fields, defined_by FROM proj_ticket_types WHERE workspace_id = $1 AND type_id = $2`, [workspaceId, DECISION_TYPE_ID])).rows;
  const decisionEvents = async (workspaceId: string) => (await db.pool.query<{ actor_id: string; origin: string; payload: unknown }>(
    `SELECT actor_id, origin, payload FROM events WHERE workspace_id = $1 AND type = 'ticket-type.defined' AND payload->>'id' = $2 ORDER BY workspace_seq`, [workspaceId, DECISION_TYPE_ID])).rows;

  describe('29.143 the Decision backfill', () => {
    it('29.143 binds the type to the TASK type\'s workflow, filed by the flow actor at the server origin; the other types keep theirs', async () => {
      const ws = newUlid();
      const { mainWf, taskWf } = await seedLegacy(ws, { taskWf: `wf-task-${ws}` });
      expect(taskWf).not.toBe(mainWf); // the premise: "first workflow" and "task's workflow" differ
      const report = await backfillDecisionType({ pool: db.pool, ingest: door() });
      expect(report).toEqual({ candidates: 1, defined: 1, refused: 0, alreadyHad: 0 });
      expect(await decisionRows(ws)).toEqual([{ workflow_id: taskWf, rank: 3, icon: 'diamond', name: 'Decision', fields: [], defined_by: SYSTEM_ACTOR_FLOW }]);
      const [event, ...rest] = await decisionEvents(ws);
      expect(rest).toEqual([]);
      expect(event).toMatchObject({ actor_id: SYSTEM_ACTOR_FLOW, origin: 'server' });
      expect(ticketTypeDefSchema.parse(event!.payload)).toEqual(builtinTicketTypeDefs(taskWf).find((d) => d.id === DECISION_TYPE_ID));
      const epic = await db.pool.query<{ workflow_id: string }>(`SELECT workflow_id FROM proj_ticket_types WHERE workspace_id = $1 AND type_id = 'epic'`, [ws]);
      expect(epic.rows[0]?.workflow_id).toBe(mainWf); // control: a sibling is untouched
    });

    it('29.143 a second run adds nothing', async () => {
      const ws = newUlid();
      await seedLegacy(ws);
      await backfillDecisionType({ pool: db.pool, ingest: door() });
      const again = await backfillDecisionType({ pool: db.pool, ingest: door() });
      expect(again).toEqual({ candidates: 0, defined: 0, refused: 0, alreadyHad: 1 });
      expect(await decisionEvents(ws)).toHaveLength(1);
    });

    it('29.143 adopts an existing decision type, and skips trashed, purge-marked and task-less workspaces', async () => {
      const [live, custom, trashed, marked, taskless] = [newUlid(), newUlid(), newUlid(), newUlid(), newUlid()];
      await seedLegacy(live);
      const { mainWf } = await seedLegacy(custom);
      const theirs: TicketTypeDef = { id: DECISION_TYPE_ID, name: 'Choices', icon: 'flag', rank: 5, workflowId: mainWf, fields: [] };
      await applyCommitted(db.pool, [typeEvent(custom, theirs)]);
      await seedLegacy(trashed);
      await applyCommitted(db.pool, [lifecycle(trashed, 'workspace.deleted')]);
      await seedLegacy(marked);
      await applyCommitted(db.pool, [lifecycle(marked, 'purge.marked')]);
      await seedLegacy(taskless, { withoutTask: true });

      expect((await findDecisionBackfillCandidates(db.pool)).map((c) => c.workspaceId)).toEqual([live]); // dry-run view
      const report = await backfillDecisionType({ pool: db.pool, ingest: door() });
      expect(report).toEqual({ candidates: 1, defined: 1, refused: 0, alreadyHad: 1 });
      expect(await decisionRows(live)).toHaveLength(1); // control: the live one did get it
      expect(await decisionRows(custom)).toEqual([expect.objectContaining({ name: 'Choices', rank: 5, icon: 'flag' })]);
      expect(await decisionEvents(custom)).toHaveLength(1); // only their own
      for (const skipped of [trashed, marked, taskless]) expect(await decisionRows(skipped)).toEqual([]);
    });

    it('29.143 counts a refused and an invalid answer in refused and logs each, instead of throwing', async () => {
      await seedLegacy(newUlid());
      const log = vi.fn();
      const refusing = { ingestBatch: async (events: unknown[]) => events.map((e) => ({ status: 'refused' as const, eventId: (e as { id: string }).id, rule: 'test.rule', reason: 'nope' })) };
      const invalid = { ingestBatch: async (events: unknown[]) => events.map(() => ({ status: 'invalid' as const, eventId: null, code: 'invalid-payload' as const, message: 'bad' })) };
      expect(await backfillDecisionType({ pool: db.pool, ingest: refusing as never, log })).toEqual({ candidates: 1, defined: 0, refused: 1, alreadyHad: 0 });
      expect(await backfillDecisionType({ pool: db.pool, ingest: invalid as never, log })).toEqual({ candidates: 1, defined: 0, refused: 1, alreadyHad: 0 });
      expect(log).toHaveBeenCalledTimes(2);
      expect(String(log.mock.calls[0]?.[0])).toContain('test.rule');
      expect(String(log.mock.calls[1]?.[0])).toContain('INVALID');
    });

    it('29.143 the interval reader and the boot-then-repeat delay', () => {
      expect(decisionBackfillIntervalMs({})).toBe(86_400_000);
      expect(decisionBackfillIntervalMs({ DECISION_BACKFILL_INTERVAL_MS: '  ' })).toBe(86_400_000); // empty means unset
      expect(decisionBackfillIntervalMs({ DECISION_BACKFILL_INTERVAL_MS: '300' })).toBe(300);
      const next = firstThenEvery(86_400_000, 30_000);
      expect([next(), next(), next()]).toEqual([30_000, 86_400_000, 86_400_000]);
      const quick = firstThenEvery(300, 30_000);
      expect([quick(), quick()]).toEqual([300, 300]); // never later than the interval
      expect(() => firstThenEvery(0, 30_000)()).toThrow('DECISION_BACKFILL_INTERVAL_MS');
    });
  });
  ```
  Run (LOCAL; `pnpm --filter @gisik-nokma/domain build && pnpm --filter @gisik-nokma/rule-engine build` first): `/Users/kiro/my_projects/gisik-nokma-lanes/slot-run.sh wtg2-t7-backfill -- pnpm --filter @gisik-nokma/server exec vitest run test/flow/decision-backfill.test.ts --maxWorkers=2 > /tmp/wtg2-t7-backfill.log 2>&1; tail -30 /tmp/wtg2-t7-backfill.log`. Expected FAIL (module not found).

- [ ] **Step 3: Implement** — `apps/server/src/flow/decision-backfill.ts`:

  ```ts
  import { builtinTicketTypeDefs, DECISION_TYPE_ID, newUlid, SYSTEM_ACTOR_FLOW } from '@gisik-nokma/domain';
  import type { Queryable } from '../db/queryable.js';
  import type { IngestService } from '../ingest/ingest-service.js';
  import { requirePositiveIntervalMs } from '../ops/schedule.js';

  /** The type whose workflow the Decision type is bound to (DC-3: "the workflow of its `task` type"). */
  const BINDING_TYPE_ID = 'task';
  const BATCH_SIZE = 100;
  const DEFAULT_INTERVAL_MS = 86_400_000;
  export const DECISION_BACKFILL_BOOT_DELAY_MS = 30_000;

  export type DecisionBackfillCandidate = { workspaceId: string; workflowId: string };
  export type DecisionBackfillReport = {
    /** Live workspaces with a task type and no decision type. */
    candidates: number;
    /** Definitions the door committed. */
    defined: number;
    /** Candidates the door did not commit (refused OR invalid), each logged. */
    refused: number;
    /** Workspaces that already have a decision type (the seed, a previous run, or an owner's custom type): adopted, never redefined. */
    alreadyHad: number;
  };
  export type DecisionBackfillDeps = {
    pool: Queryable;
    ingest: Pick<IngestService, 'ingestBatch'>;
    now?: () => Date;
    log?: (message: string, error?: unknown) => void;
  };

  /**
   * The workspaces that still lack the Decision type. The SELECT mirrors every reason the job must not write: a
   * deleted or purge-marked workspace is excluded (the ledger is append-only; an event in a workspace about to be
   * erased is unreadable), and a workspace with no `task` type has no workflow to bind to.
   */
  export async function findDecisionBackfillCandidates(pool: Queryable): Promise<DecisionBackfillCandidate[]> {
    const { rows } = await pool.query<{ workspace_id: string; workflow_id: string }>(
      `SELECT t.workspace_id, t.workflow_id
         FROM proj_ticket_types t
        WHERE t.type_id = $2
          AND NOT EXISTS (SELECT 1 FROM proj_ticket_types d WHERE d.workspace_id = t.workspace_id AND d.type_id = $1)
          AND NOT EXISTS (SELECT 1 FROM proj_workspaces w
                           WHERE w.workspace_id = t.workspace_id
                             AND (w.deleted_at IS NOT NULL OR w.purge_marked_at IS NOT NULL))
        ORDER BY t.workspace_id`,
      [DECISION_TYPE_ID, BINDING_TYPE_ID],
    );
    return rows.map((row) => ({ workspaceId: row.workspace_id, workflowId: row.workflow_id }));
  }

  export async function backfillDecisionType(deps: DecisionBackfillDeps): Promise<DecisionBackfillReport> {
    const log = deps.log ?? ((message: string, error?: unknown) => console.error(message, error));
    const clientTime = (deps.now === undefined ? new Date() : deps.now()).toISOString();
    const candidates = await findDecisionBackfillCandidates(deps.pool);
    const had = await deps.pool.query<{ n: number }>(
      'SELECT count(DISTINCT workspace_id)::int AS n FROM proj_ticket_types WHERE type_id = $1',
      [DECISION_TYPE_ID],
    );
    const report: DecisionBackfillReport = { candidates: candidates.length, defined: 0, refused: 0, alreadyHad: had.rows[0]?.n ?? 0 };
    if (candidates.length === 0) return report;

    for (let start = 0; start < candidates.length; start += BATCH_SIZE) {
      const batch = candidates.slice(start, start + BATCH_SIZE);
      const events = batch.map(({ workspaceId, workflowId }) => {
        // The definition comes from the SEED, never retyped here: a rank or icon spelled twice is two places to disagree.
        const def = builtinTicketTypeDefs(workflowId).find((candidate) => candidate.id === DECISION_TYPE_ID);
        if (def === undefined) throw new Error(`decision backfill: builtinTicketTypeDefs carries no '${DECISION_TYPE_ID}' seed (T5 of the wtg-part2-model plan adds it)`);
        return {
          id: newUlid(), workspaceId,
          // A fresh entity id per definition, as the founding sequence files each type (bootstrap-workspace.ts:87-89).
          entity: { kind: 'ticket-type', id: newUlid() },
          type: 'ticket-type.defined', version: 1, payload: def,
          actorId: SYSTEM_ACTOR_FLOW, origin: 'server', clientTime,
        };
      });
      const results = await deps.ingest.ingestBatch(events);
      for (const [index, result] of results.entries()) {
        if (result.status === 'committed') { report.defined += 1; continue; }
        report.refused += 1;
        const workspaceId = batch[index]?.workspaceId ?? 'unknown';
        if (result.status === 'refused') log(`decision backfill refused for workspace ${workspaceId}: ${result.rule}: ${result.reason}`);
        else log(`decision backfill produced an INVALID envelope for workspace ${workspaceId}: ${result.code}: ${result.message}`, result);
      }
    }
    return report;
  }

  /** Empty means unset (App Platform resolves an unset variable to ''); anything else is validated by `requirePositiveIntervalMs` on every call. Sibling: `expired-sessions.ts:22`. */
  export function decisionBackfillIntervalMs(env: { DECISION_BACKFILL_INTERVAL_MS?: string | undefined }): number {
    const raw = env.DECISION_BACKFILL_INTERVAL_MS;
    return Number(raw === undefined || raw.trim() === '' ? String(DEFAULT_INTERVAL_MS) : raw);
  }

  /** `startScheduler` calls `delayMs()` once up front and then again at every re-arm, so the first call is the boot delay. */
  export function firstThenEvery(everyMs: number, bootMs: number): () => number {
    let first = true;
    return () => {
      const every = requirePositiveIntervalMs(everyMs, 'DECISION_BACKFILL_INTERVAL_MS');
      if (first) { first = false; return Math.min(bootMs, every); }
      return every;
    };
  }
  ```
  Run: same command. Expected PASS. Flip nothing yet (29.143 also needs the daemon arm, Step 4).

  Commit: `wtg2 T7: the Decision backfill (29.143)`.

- [ ] **Step 4: Daemon wiring, CLI, env, wiring case**

  `backup-daemon-main.ts`: import `{ backfillDecisionType, decisionBackfillIntervalMs, DECISION_BACKFILL_BOOT_DELAY_MS, firstThenEvery } from '../flow/decision-backfill.js';` and, after `const sessionSweepIntervalMs = ...` (`:194`), `const decisionBackfillEveryMs = decisionBackfillIntervalMs(process.env);`. After the `auto-close` entry add:
  ```ts
    {
      // Spec DC-3: the Decision type for workspaces founded before the seed existed. Boot + daily, idempotent.
      name: 'decision-backfill',
      run: async (): Promise<void> => {
        const report = await backfillDecisionType({ pool, ingest });
        console.log(JSON.stringify({ msg: 'decision backfill complete', ...report }));
      },
      delayMs: firstThenEvery(decisionBackfillEveryMs, DECISION_BACKFILL_BOOT_DELAY_MS),
    },
  ```
  `delayMs: firstThenEvery(...)` is a closure created ONCE here, so its `first` flag survives the scheduler's up-front call and re-arms. `.env.example` after `:385`: `# (worker) how often the Decision-type backfill runs (wtg-part2-model T7, spec DC-3); optional, default 86400000 (daily). The first run is min(30000, this) after boot. Same refusal shape as the sweeps above.` then `DECISION_BACKFILL_INTERVAL_MS=86400000`. `package.json:15` (after `verify:projections`): `"wtg:backfill-decision": "tsx src/tools/backfill-decision-type.ts",`.

  `apps/server/src/tools/backfill-decision-type.ts` (sibling: `src/seed/cli-seed-dev-workspace.ts:45-47` composes the pool and the door; T1's `src/tools/wtg-preflight.ts` has the `executedDirectly` guard):
  ```ts
  import { pathToFileURL } from 'node:url';
  import { evaluateEvent } from '@gisik-nokma/rule-engine';
  import { createPool } from '../db.js';
  import { backfillDecisionType, findDecisionBackfillCandidates } from '../flow/decision-backfill.js';
  import { createIngestService } from '../ingest/ingest-service.js';
  import { optionalDatabaseCaCert } from '../ops/backup-env.js';
  import { buildProjectionRegistry } from '../projections/index.js';

  /** `--dry-run` lists the workspaces that would get the type and writes nothing. Exit 1 when any definition was refused. */
  async function main(): Promise<void> {
    const databaseUrl = process.env['DATABASE_URL'];
    if (!databaseUrl) { console.error('DATABASE_URL is required'); process.exit(2); }
    const pool = createPool(databaseUrl, { caCert: optionalDatabaseCaCert(process.env) });
    try {
      if (process.argv.includes('--dry-run')) {
        console.log(JSON.stringify({ msg: 'decision backfill dry run', candidates: await findDecisionBackfillCandidates(pool) }));
        return;
      }
      const ingest = createIngestService({ pool, evaluate: evaluateEvent, projections: buildProjectionRegistry() });
      const report = await backfillDecisionType({ pool, ingest });
      console.log(JSON.stringify({ msg: 'decision backfill complete', ...report }));
      if (report.refused > 0) process.exitCode = 1;
    } finally {
      await pool.end();
    }
  }
  const executedDirectly = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
  if (executedDirectly) main().catch((error: unknown) => { console.error(error); process.exit(1); });
  ```
  Wiring case, `backup-daemon-main.test.ts` after 6.350 (add `import { applyCommitted, makeCommitted } from '../helpers/apply.js'; import { builtinTicketTypeDefs, DECISION_TYPE_ID, newUlid } from '@gisik-nokma/domain';`; sibling: 6.349 above for `runDaemon` and the predicate wait):
  ```ts
  it('29.143 the daemon runs the decision-backfill job at boot: a legacy workspace gains its Decision type, and the run is logged; control: the same workspace holds no decision type before', async () => {
    const ws = newUlid();
    const wf = `wf-legacy-${ws}`;
    const legacy = builtinTicketTypeDefs(wf).filter((d) => d.id !== DECISION_TYPE_ID);
    await applyCommitted(db.pool, legacy.map((def) => makeCommitted({ workspaceId: ws, actorId: '01J9GUKR000000000000000000', entity: { kind: 'ticket-type', id: newUlid() }, type: 'ticket-type.defined', payload: def })));
    const before = await db.pool.query(`SELECT 1 FROM proj_ticket_types WHERE workspace_id = $1 AND type_id = $2`, [ws, DECISION_TYPE_ID]);
    expect(before.rowCount).toBe(0);
    const run = await runDaemon(
      { DATABASE_URL: db.url, NOTIFICATION_SWEEP_INTERVAL_MS: '3600000', DECISION_BACKFILL_INTERVAL_MS: '300' },
      (out) => out.includes('"msg":"decision backfill complete"'),
    );
    expect(run.stdout, `stderr: ${run.stderr}`).toContain('"msg":"decision backfill complete"');
    const after = await db.pool.query<{ workflow_id: string }>(`SELECT workflow_id FROM proj_ticket_types WHERE workspace_id = $1 AND type_id = $2`, [ws, DECISION_TYPE_ID]);
    expect(after.rows).toEqual([{ workflow_id: wf }]);
  }, 60_000);
  ```
  Run `wtg2-t7-daemon` (`test/ops/backup-daemon-main.test.ts test/flow`) then `pnpm check:env`. Expected FAIL before the wiring, PASS after. Flip 29.143 ✅.

  Commit: `wtg2 T7: the daemon runs the backfill; CLI; env (29.143)`.

- [ ] **Step 5: RED, then GREEN: founding and seed readers (29.144)**

  Pin sweep first, because the fifth seed (T5) makes these read four. Find every site, then amend: `grep -rn -E "'sub-task'\]|toBe\(7\)|toHaveLength\(7\)|118 \+ 6|four built-in|toHaveLength\(4\)" apps/server/test packages/domain/test packages/app-core/test apps/web/test --include='*.ts' --include='*.tsx'` and read each hit. The known sites and their edits (if T5 already made one, the grep shows it and you skip it):
  - `workspaces.test.ts:142-155`: the type list gains a fifth `'ticket-type.defined'`, `rows.slice(2, 6)` becomes `rows.slice(2, 7)`, ids `['epic', 'story', 'task', 'sub-task', DECISION_TYPE_ID]` (import it). `:233`, `:264-265`: `7` becomes `8`. `:365`: same slice and list. `:117` title and `:28` docblock say "five".
  - `check-role-permission.test.ts:635-650`: same list/slice edit; `:748,770,837,846,878,888,901`: only the lines that contain `workspaceStream(...)).length`: `sed -i '' -E '/workspaceStream/ s/toBe\(7\)/toBe(8)/' apps/server/test/permissions/check-role-permission.test.ts`, then `git diff` to confirm exactly those seven lines moved.
  - `workspace-bootstrap-failure.test.ts:255-263`: a fifth `'ticket-type.defined'` before `'membership.granted'`; `:62` "the fourth event of the seven" becomes "of the eight" (the fault is still on `story`, so the residue prefix at `:193-197` and `:244-248` is unchanged: that is the control that the injection point did not move).
  - `seed-cc.test.ts:164-169`: `118 + 6` becomes `118 + 7`, prose "the four built-in ticket types" becomes "five".
  - `packages/domain/test/ticket-types.test.ts:164-190` (T5 normally amends; verify): seeds list gains `['decision', 3]`, `DEEPEST_RANK` assertions unchanged (the max stays 4), `toHaveLength(5)`.
  - `ticket-types.test.tsx:239` `toHaveLength(5)` becomes `builtins.length + 1` and `:342` `toHaveLength(6)` becomes `builtins.length + 2` (derive from the seed, not another literal; read `:183-250` for the stripe-parity prose that counted rows by hand and fix it the same way).

  RED for the readers. `new-ticket-dialog.test.tsx`, inside the describe that owns `LADDER` (after the case at `:1079`):
  ```tsx
  it('29.144 the Decision seed ties task on rank 3 and sorts before it by id: never the default, still chosen when it is all there is', () => {
    const decision = { id: 'decision', name: 'Decision', rank: 3, workflowId: 'wf-errand' };
    expect(defaultRootTypeFor([...LADDER, decision])?.id).toBe('task');
    expect(defaultRootTypeFor([decision, ...LADDER])?.id).toBe('task'); // order independence
    expect(defaultRootTypeFor([decision])?.id).toBe('decision'); // control: legal, so the last resort
    expect(defaultRootTypeFor([decision, { id: 'errand', name: 'Errand', rank: 3, workflowId: 'wf-errand' }, { id: 'chore', name: 'Chore', rank: 3, workflowId: 'wf-errand' }])?.id).toBe('chore'); // the id tie-break among the rest is unchanged
  });
  ```
  New `packages/app-core/test/views/subtask-type-for.test.ts`:
  ```ts
  import { describe, expect, it } from 'vitest';
  import type { TicketTypeDef } from '@gisik-nokma/domain';
  import { subtaskTypeFor } from '../../src/views/ticket-sheet.js';

  const def = (id: string, rank: number): TicketTypeDef => ({ id, name: id, icon: 'check', rank, workflowId: 'wf', fields: [] });

  describe('29.144 subtaskTypeFor and the Decision seed', () => {
    it('29.144 never defaults a child to the Decision when another type is legal, and still can when it is the only one', () => {
      // No `task` in this custom ladder, so rule 2 (shallowest legal, ties by id) decides: 'decision' < 'errand'.
      expect(subtaskTypeFor([def('story', 2), def('decision', 3), def('errand', 3), def('sub-task', 4)], 2)?.id).toBe('errand');
      expect(subtaskTypeFor([def('story', 2), def('decision', 3), def('sub-task', 4)], 2)?.id).toBe('sub-task');
      expect(subtaskTypeFor([def('epic', 1), def('story', 2), def('task', 3), def('decision', 3), def('sub-task', 4)], 1)?.id).toBe('task'); // rule 1 unchanged
      expect(subtaskTypeFor([def('story', 2), def('decision', 3)], 2)?.id).toBe('decision'); // control: the last resort
    });
  });
  ```
  Icon case, `ticket-types.test.tsx` (imports `TYPE_ICON_NAMES` at `:24`; add `TYPE_ICONS, TypeIcon` and `DECISION_TYPE_ID`):
  ```tsx
  it('29.144 every built-in seed names an icon this build can draw, and the Decision draws a diamond, not the folder fallback', () => {
    for (const def of builtinTicketTypeDefs('wf')) expect(TYPE_ICON_NAMES, def.id).toContain(def.icon);
    const decision = builtinTicketTypeDefs('wf').find((d) => d.id === DECISION_TYPE_ID)!;
    const { container } = render(<TypeIcon name={decision.icon} />);
    expect(container.querySelector('path')?.getAttribute('d')).not.toBe(TYPE_ICONS.folder[0].d);
  });
  ```
  Run `wtg2-t7-readers` (app-core `test/views/new-ticket-dialog.test.tsx test/views/subtask-type-for.test.ts test/ticket-types/ticket-types.test.tsx`). Expected PASS on arrival: T5 owns the two readers, the diamond icon and the notice (reconciler: one owner), and these cases pin them from the founding side. A red here means T5 did not land as planned: STOP, `NEEDS: planner`.

  Implement: nothing in `new-ticket-dialog.tsx`, `ticket-sheet.tsx`, `icons.tsx` or `page.tsx` (T5 owns them). Prove it: `git grep -n DECISION_TYPE_ID packages/app-core/src/views/new-ticket-dialog.tsx packages/app-core/src/views/ticket-sheet.tsx` prints a line in each, and `grep -n "diamond:" packages/app-core/src/workflow-builder/ticket-types/icons.tsx` prints one.

  Run `wtg2-t7-readers` again, then WHOLE suites because the fifth seed reaches every reader: domain, rule-engine, app-core, web, and server (`--maxWorkers=2`, one at a time). Expected PASS; any remaining red names a pin the grep missed: amend it the same way and add its path to the PR description. Flip 29.144 ✅.

  Commit: `wtg2 T7: founding pins and seed-reader pins (29.144)`.

- [ ] **Step 6: Manual, help, Features, sweeps, DONE**

  `docs/manual.md:48` row becomes `| **Epic / Story / Task / Sub-task / Decision** | The five built-in kinds of ticket. Epic is the biggest and Sub-task the smallest; a Decision sits at the same level as a Task and stands for a choice between branches of work. An admin can rename these. |`; `:227` "Five built-in kinds of ticket: **epic**, **story**, **task**, **sub-task** and **decision**."; `:1555` "The five built-in types have no Reorder button"; `:1579` "You **can** rename epic, story, task, sub-task and decision". Run `pnpm help:generate && pnpm check:help`. `Features.md:485,521,544`: "four" becomes "five" and name the Decision where the list is spelled out. Add under `<!-- wtg-part2-model T7 bullet -->`: `- ⚙️ **The Decision type reaches existing workspaces** (wtg2 T7; `apps/server/src/flow/decision-backfill.ts`, job `decision-backfill` on the backup worker, `DECISION_BACKFILL_INTERVAL_MS`, CLI `pnpm --filter @gisik-nokma/server run wtg:backfill-decision [--dry-run]`) — an idempotent job defines the built-in Decision type in every live workspace that has a task type and no decision type, bound to the task type's workflow, filed by the flow actor; new workspaces get it from the founding sequence. Cases 29.143-29.144.`
  Run `node scripts/check-case-ids.mjs && pnpm check:citations && pnpm check:env && pnpm check:tasks`. The mobile editor bundle does not change (no domain registry change in this task: `DECISION_TYPE_ID` and the seed are T2's and T5's, which regenerated it); run `node apps/mobile/scripts/generate-editor-html.mjs --check` once to prove it. **Mutations:** 29.143 (bind to the first workflow; drop the NOT EXISTS; drop the `proj_workspaces` exclusion; count only `'refused'`; make `firstThenEvery` always return the interval), 29.144 (drop the `DECISION_TYPE_ID` filter in both readers; drop `diamond`: T5's code, which T7's cases must also kill). Push. DONE + REVIEW (NEEDS: T6, T8).

---

### Task 8: Flow causes, the flow actor, the forgery guard and the engine exemption (cases 29.200-29.209, 29.361-29.363)

**Branch:** `task/wtg2-flow-causes` from `origin/release/workflow-graph`; PR `--base release/workflow-graph`. **Needs:** T5 merged (`releaseOutcome`, `TicketState.outcome`). **Step 7 (the DC-5 exemption) needs T6 merged** (it passes `branchNotTaken` to `decisionOutcomeRequired`, which T6 adds with the parameter at its default); Steps 1-6 and 8 do not. If T6 is not yet on the tip when the executor reaches Step 7, stop after Step 6, push, and report `DONE (Step 7 waits for T6)`.

**Files:**
- Create: `packages/domain/src/flow/causes.ts`; `packages/rule-engine/src/checks/flow-cause.ts`; `packages/domain/test/flow-causes.test.ts`; `packages/rule-engine/test/flow-cause.test.ts`; `apps/server/test/read/flow-cause-serving.test.ts`.
- Modify: `packages/domain/src/index.ts` (export); `packages/domain/src/workflow.ts:195-209` (the `cause` field); `packages/domain/src/events/ticket-events.ts:313,315` (the two empty payloads); `packages/domain/src/system-actors.ts` (constant after `SYSTEM_ACTOR_PURGE`, map entry); `packages/domain/src/ticket-state.ts:276-333,400-426` (reducer arms); `packages/domain/src/entity-state.ts:48` (`closed` type); `packages/domain/src/read-models.ts:35` and `packages/app-core/src/view-types.ts:237` (`TransitionCause`); `packages/rule-engine/src/transition.ts` (payload parse `:55-60`, edge lookup `:117-130`, terminal block); `packages/rule-engine/src/checks/close.ts:46-95`; `packages/rule-engine/src/checks/refusals.ts` (`REFUSALS`); `packages/rule-engine/src/index.ts`; `apps/server/src/read/state-provenance.ts:50-79`; `packages/app-core/src/online/mappers.ts:560-579` (`mapCause`); `packages/app-core/src/replica/replica-data-source.ts:709-717` (`causeOf`); `packages/app-core/src/views/board.tsx:2267-2271`; `apps/server/src/purge/check-purged.ts:25-60` (`payloadIds`); `packages/app-core/src/views/history-copy.ts` (`redactedPayload`, the same function T5 edits for `closeStarted`).
- Tests edited: `packages/domain/test/ticket-state.test.ts` (after the SYS0AC test, `:1185-1196`); the Part 2 census (`ticket-vocabulary-census.test.ts`, the file T2 and T5 also add rows to); `packages/app-core` mapper test 3.43 (`reopened-by-decree` stays a refusal, see Step 6).

**Interfaces:**
- Consumes: T5 `releaseOutcome(state: TicketState): TicketState`, `DECISION_TYPE_ID` (T2).
- Produces (`@gisik-nokma/domain`): `flowCauseSchema`, `type FlowCause`, `isFlowCause(c: unknown): c is FlowCause`, `ledToCauseSchema`, `reopenedByFlowCauseSchema`, `branchNotTakenCauseSchema`, `viewerSafeCause(c: FlowCause): { kind: FlowCause['kind'] }`, `SYSTEM_ACTOR_FLOW = '00000000000000000000SYS0FW'`, `TicketState.closed?: { actorId; at; cause?: FlowCause } | null`.
- Produces (`@gisik-nokma/rule-engine`): `REFUSALS['cause.forged']`, `flowCauseForgery(env: EventEnvelope, cause: unknown): Refusal | null`. T9 reads `closed.cause` and `isFlowCause`; T16 and T17 write and render the causes.

**Why the three causes live in the domain and are checked at three doors.** The flow engine (T16) writes `led-to` on the ticket a finished predecessor started, `reopened-by-flow` on a loop reset, `branch-not-taken` on a ticket it closes because a decision went another way. Until now `cause` was opaque to the engine ("no rule reads it", `workflow.ts:205-206`). These three are not opaque: they unlock moves no workflow declares, so a person must not be able to type one. Hence `cause.forged`: any flow cause on `ticket.transitioned`, `ticket.closed` or `ticket.reopened` is refused unless `env.actorId === SYSTEM_ACTOR_FLOW`. A reserved ULID is how the existing system actors work (`system-actors.ts:49-66`); nothing accepts an actor id from a client, and `ingestBatch` stamps the actor.

**Why the exemption is a synthetic edge, not a flag on the declared one (PS-11).** A loop reset moves a ticket from `done` back to the start, and a not-taken branch closes a ticket from `todo`; no workflow declares those edges, and asking every definition to would make the flow a workflow-authoring problem. The engine builds one rules-less edge only when `flow actor && flow cause && the move's shape matches`: `reopened-by-flow` to `initialStateId` or `backlog` from any state; `branch-not-taken` to the first-declared terminal state from a non-terminal one. `led-to` exempts nothing (it is provenance only). Everything after the edge lookup still runs: the closed-ticket refusal (`transition.ts:74-76`) comes BEFORE it, and the parent/child invariants (`:152-205`) after, so the flow can no more finish a parent over open children than a person can. A person making the same move, or the flow actor making it without a cause, takes the ordinary `illegal-transition` (29.361-29.363).

**Why `closed.cause` stays reducer-only here.** `rowToTicketState` rebuilds `closed` from `closed_at`/`closed_by` (`projections/tickets.ts:175-178`), so the cause is not on the row. T9 adds the `closed_cause` column and the reader; until then the server reducer sees the cause only within one fold, `verifyProjections` compares TABLES (`tools/verify-projections.ts:59`) so there is no diff, and no engine rule reads it.

**Why the flow causes reach a viewer as `{kind}` only.** `decisionTicketId`, `sourceTicketId` and `decidedBy` name tickets and people the viewer may not see (spec FL-1). `state-provenance.ts:73-76` today copies `payload.cause` whole; with flow causes that would leak ids. `viewerSafeCause` is applied there and in the detail route's `closed.cause`; the sentences History shows for each cause are T17's.

- [ ] **Step 1: Catalogue**

  Under `<!-- wtg-part2-model T8 -->` (all ❌), Features under `<!-- wtg-part2-model T8 bullet -->`:
  - `- ❌ **29.200 — the three flow causes are strict, discriminated on kind (led-to {sourceTicketId, label?, triggeredBy}; reopened-by-flow and branch-not-taken {decisionTicketId, outcome, pass, decidedBy, decisionEventId}); isFlowCause accepts exactly those and viewerSafeCause keeps only the kind;** control: reopened-for-child is not a flow cause. Mutation: drop .strict() → the extra-key case parses.`
  - `- ❌ **29.201 — ticket.transitioned accepts the old reopened-for-child cause and the three new ones; ticket.closed accepts only branch-not-taken and ticket.reopened only reopened-by-flow, and both still parse {};** control: reopened-for-child on a close is malformed. Mutation: let closed take any flow cause → the led-to case parses.`
  - `- ❌ **29.202 — SYSTEM_ACTOR_FLOW is a ULID, is named "Flow" and counts as a system actor;** control: a 26-character string one character off the alphabet is not a ULID. Mutation: spell it with an I → the ULID assertion fails.`
  - `- ❌ **29.203 — a flow cause from anyone but the flow actor is refused cause.forged at the transition, close and reopen doors, before any other rule; the flow actor's is not;** control: a person's reopened-for-child transition is untouched. Mutation: check the actor after the edge lookup → a person's forged move is refused illegal-transition, not cause.forged.`
  - `- ❌ **29.204 — the flow actor with reopened-by-flow moves a ticket from any state to the initial state or backlog, and with branch-not-taken a non-terminal ticket to the first terminal state, over edges the workflow does not declare; a closed ticket, a parent over open children and a child leaving a terminal parent are still refused;** control: led-to opens no edge. Mutation: skip the closed check for the flow → the closed case is accepted.`
  - `- ❌ **29.205 — branch-not-taken exempts the DC-5 outcome rule on the transition and the close doors; a person's move, or the flow's without that cause, does not;** control: the same Decision with an outcome. Mutation: exempt on any flow cause → reopened-by-flow into a terminal move passes DC-5. (Needs T6.)`
  - `- ❌ **29.206 — the reducer clears a Decision's outcome (passes untouched) on a reopened-by-flow transition, leaves a Task alone, stores the cause on closed and drops it on reopen;** control: a person's transition keeps the outcome. Mutation: release on any cause → the led-to case loses its outcome.`
  - `- ❌ **29.207 — a flow cause is served to a viewer as {kind} only (state provenance and the detail route), and the online mapper and the replica accept all four kinds instead of throwing or dropping; the board chip shows "reopened, live work added" for reopened-for-child only;** control: reopened-by-decree is still a mapping error. Mutation: serve the cause whole → decisionTicketId leaks.`
  - `- ❌ **29.208 — a purged source or decision ticket refuses a flow-caused event at the ingest door (payloadIds names sourceTicketId and decisionTicketId on the three types), and History phrases a hidden id as "a ticket you can't see" and a hidden actor as "someone you can't see";** control: a live id is named. Mutation: drop the closed/reopened arms → the purged close is accepted.`
  - `- ❌ **29.209 — the Part 2 census carries the T8 row and the mobile editor bundle was rebuilt with the new payloads (grep: branch-not-taken);** control: the bundle line is asserted by grep, not by --check. Mutation: skip the rebuild → the grep finds nothing.`
  - `- ❌ **29.361 — a person's move into the first terminal state or back to the initial state over an undeclared edge is illegal-transition, with or without a cause;** control: the same move by the flow actor with the matching cause is accepted. Mutation: drop the actor test from flowExemptEdge → the person's move is accepted.`
  - `- ❌ **29.362 — the flow actor without a cause gets no exemption (illegal-transition);** control: with the cause. Mutation: key the exemption on the actor alone → accepted.`
  - `- ❌ **29.363 — the flow actor with a cause of the wrong shape for the move (reopened-by-flow into a terminal state, branch-not-taken into the initial state, led-to anywhere) gets no exemption;** control: the matching pairs. Mutation: ignore the target → the wrong-shape moves pass.`
  Features: `- ⚙️ **Flow causes and the flow actor** (\`packages/domain/src/flow/causes.ts\`, \`packages/rule-engine/src/checks/flow-cause.ts\`) — led-to, reopened-by-flow and branch-not-taken causes; only the reserved Flow actor may write them; they unlock the loop-reset and not-taken moves no workflow declares. Cases 29.200-29.209, 29.361-29.363.`
  Run `node scripts/check-case-ids.mjs && pnpm check:citations`. Commit: `wtg2 T8: open the flow-cause cases and Features bullet`.

- [ ] **Step 2: RED domain tests (29.200, 29.201, 29.202, 29.206)**

  `packages/domain/test/flow-causes.test.ts`; imports from `../src/index.js`; ULID negative control copied from `ticket-state.test.ts:1185-1196` (the SYS0AC test); reducer fixtures from `decision-event.test.ts` (T5: `deps`, `bornState`, `makeEnvelope`).
  ```ts
  const SRC = '01J9GSRC000000000000000000', DEC = '01J9GDEC000000000000000000', WHO = '01J9GACT000000000000000001', EV = '01J9GEVT000000000000000001';
  const reopenedByFlow = { kind: 'reopened-by-flow', decisionTicketId: DEC, outcome: 'No', pass: 2, decidedBy: WHO, decisionEventId: EV };
  const notTaken = { ...reopenedByFlow, kind: 'branch-not-taken' };
  const ledTo = { kind: 'led-to', sourceTicketId: SRC, label: 'Yes', triggeredBy: WHO };

  it('29.200 the causes are strict and discriminated; isFlowCause and viewerSafeCause', () => {
    for (const c of [reopenedByFlow, notTaken, ledTo, { ...ledTo, label: undefined }]) expect(flowCauseSchema.safeParse(c).success).toBe(true);
    expect(flowCauseSchema.safeParse({ ...ledTo, extra: 1 }).success).toBe(false);
    expect(flowCauseSchema.safeParse({ ...notTaken, pass: 0 }).success).toBe(false);
    expect(flowCauseSchema.safeParse({ ...notTaken, decisionTicketId: 'nope' }).success).toBe(false);
    expect(flowCauseSchema.safeParse({ kind: 'led-to', sourceTicketId: SRC }).success).toBe(false); // triggeredBy required
    expect(isFlowCause(ledTo)).toBe(true);
    expect(isFlowCause({ kind: 'reopened-for-child', childTicketId: SRC })).toBe(false); // control
    expect(isFlowCause(null)).toBe(false);
    expect(viewerSafeCause(notTaken as never)).toEqual({ kind: 'branch-not-taken' });
    expect(JSON.stringify(viewerSafeCause(ledTo as never))).not.toContain(SRC);
  });
  it('29.201 the payloads: transitioned takes four causes, closed one, reopened one', () => {
    const t = (cause: unknown) => ticketTransitionedPayloadSchema.safeParse({ to: 'done', cause }).success;
    expect([t({ kind: 'reopened-for-child', childTicketId: SRC }), t(ledTo), t(reopenedByFlow), t(notTaken)]).toEqual([true, true, true, true]);
    expect(t({ kind: 'reopened-by-decree' })).toBe(false);
    expect(ticketClosedPayload.safeParse({}).success && ticketReopenedPayload.safeParse({}).success).toBe(true); // old events still parse
    expect(ticketClosedPayload.safeParse({ cause: notTaken }).success).toBe(true);
    expect(ticketClosedPayload.safeParse({ cause: ledTo }).success).toBe(false);
    expect(ticketClosedPayload.safeParse({ cause: { kind: 'reopened-for-child', childTicketId: SRC } }).success).toBe(false); // control
    expect(ticketReopenedPayload.safeParse({ cause: reopenedByFlow }).success).toBe(true);
    expect(ticketReopenedPayload.safeParse({ cause: notTaken }).success).toBe(false);
  });
  it('29.202 SYSTEM_ACTOR_FLOW is a reserved ULID named Flow', () => {
    expect(ULID_REGEX.test(SYSTEM_ACTOR_FLOW)).toBe(true);
    expect(ULID_REGEX.test('00000000000000000000SYS0FI')).toBe(false); // negative control: one char off the alphabet
    expect(SYSTEM_ACTOR_NAMES.get(SYSTEM_ACTOR_FLOW)).toBe('Flow');
    expect(isSystemActor(SYSTEM_ACTOR_FLOW)).toBe(true);
  });
  ```
  and the reducer case (29.206), a Decision with outcome `No`, in a done state:
  ```ts
  it('29.206 reopened-by-flow releases a Decision outcome and keeps passes; Tasks and other causes are untouched; closed carries the cause', () => {
    const decision = { ...bornState({ typeId: DECISION_TYPE_ID }), outcome: 'No', passes: [{ pass: 1, outcome: 'No', by: 'u', at: '2026-10-03T09:00:00.000Z', revisions: [] }] } as TicketState;
    const flowMove = makeEnvelope({ type: 'ticket.transitioned', entity: { kind: 'ticket', id: decision.id }, payload: { to: 'todo', cause: reopenedByFlow }, actorId: SYSTEM_ACTOR_FLOW });
    const after = applyTicketEvent(decision, flowMove, deps);
    expect(after.outcome).toBeUndefined();
    expect(after.passes).toEqual(decision.passes);
    expect(applyTicketEvent({ ...decision, typeId: 'task' }, flowMove, deps).outcome).toBe('No'); // control: a Task keeps it
    const personMove = makeEnvelope({ type: 'ticket.transitioned', entity: { kind: 'ticket', id: decision.id }, payload: { to: 'todo' } });
    expect(applyTicketEvent(decision, personMove, deps).outcome).toBe('No'); // control: no cause, no release
    const closeEv = makeEnvelope({ type: 'ticket.closed', entity: { kind: 'ticket', id: decision.id }, payload: { cause: notTaken }, actorId: SYSTEM_ACTOR_FLOW });
    const closed = applyTicketEvent(decision, closeEv, deps);
    expect(closed.closed).toMatchObject({ actorId: SYSTEM_ACTOR_FLOW, cause: notTaken });
    const reopen = makeEnvelope({ type: 'ticket.reopened', entity: { kind: 'ticket', id: decision.id }, payload: {} });
    expect(applyTicketEvent(closed, reopen, deps).closed).toBeNull();
    const plain = applyTicketEvent(decision, makeEnvelope({ type: 'ticket.closed', entity: { kind: 'ticket', id: decision.id }, payload: {} }), deps);
    expect('cause' in (plain.closed ?? {})).toBe(false); // an uncaused close stays {actorId, at}
  });
  ```
  Run: `/Users/kiro/my_projects/gisik-nokma-lanes/slot-run.sh wtg2-t8-red -- pnpm --filter @gisik-nokma/domain exec vitest run test/flow-causes.test.ts > /tmp/wtg2-t8-red.log 2>&1; tail -30 /tmp/wtg2-t8-red.log`. Expected: FAIL (no `flow/causes`).

- [ ] **Step 3: Domain implementation**

  `packages/domain/src/flow/causes.ts` (sibling for style: `purge.ts` small strict schemas). `ulidString` from `../envelope.js`; `workflow.ts` imports only `zod` and `display-name.js`, so importing `causes.ts` from it makes no cycle. The outcome and label are plain non-empty strings here, not `linkLabelSchema`: the flow writes them from labels already validated at `ticket.link_added`, and importing `events/ticket-events.ts` from `workflow.ts` would close a cycle.
  ```ts
  import { z } from 'zod';
  import { ulidString } from '../envelope.js';

  const decisionCause = {
    decisionTicketId: ulidString,
    outcome: z.string().min(1),
    pass: z.number().int().min(1),
    decidedBy: ulidString,
    decisionEventId: ulidString,
  };
  export const ledToCauseSchema = z.object({ kind: z.literal('led-to'), sourceTicketId: ulidString, label: z.string().min(1).optional(), triggeredBy: ulidString }).strict();
  export const reopenedByFlowCauseSchema = z.object({ kind: z.literal('reopened-by-flow'), ...decisionCause }).strict();
  export const branchNotTakenCauseSchema = z.object({ kind: z.literal('branch-not-taken'), ...decisionCause }).strict();
  export const flowCauseSchema = z.discriminatedUnion('kind', [ledToCauseSchema, reopenedByFlowCauseSchema, branchNotTakenCauseSchema]);
  export type FlowCause = z.infer<typeof flowCauseSchema>;
  export const isFlowCause = (c: unknown): c is FlowCause => flowCauseSchema.safeParse(c).success;
  /** What a viewer is served: the kind, never the ids (FL-1: they may name a ticket or a person this viewer cannot see). */
  export const viewerSafeCause = (c: FlowCause): { kind: FlowCause['kind'] } => ({ kind: c.kind });
  ```
  `index.ts`: `export * from './flow/causes.js';`. `workflow.ts:207`:
  ```ts
  cause: z.union([z.object({ kind: z.literal('reopened-for-child'), childTicketId: z.string() }), flowCauseSchema]).optional(),
  ```
  (a plain `z.union`: the old arm is not strict, the new arms are; `import { flowCauseSchema } from './flow/causes.js'`). Update the comment above it: "opaque to rules EXCEPT the three flow kinds, which `rule-engine/checks/flow-cause.ts` polices". `ticket-events.ts:313,315`:
  ```ts
  export const ticketClosedPayload = z.object({ cause: branchNotTakenCauseSchema.optional() }).strict();
  export const ticketReopenedPayload = z.object({ cause: reopenedByFlowCauseSchema.optional() }).strict();
  ```
  `system-actors.ts`: after `SYSTEM_ACTOR_PURGE`:
  ```ts
  /** The workflow-graph flow (wtg Part 2): files `led-to`, `reopened-by-flow` and `branch-not-taken` events. Nobody's act, so not a person's id; case 29.202 pins the ULID match. */
  export const SYSTEM_ACTOR_FLOW = '00000000000000000000SYS0FW';
  ```
  and `[SYSTEM_ACTOR_FLOW, 'Flow']` in `SYSTEM_ACTOR_NAMES` (update its "Two entries" comment to three). `entity-state.ts:48`: `closed?: { actorId: string; at: string; cause?: FlowCause } | null;` (import type from `./flow/causes.js`).
  `ticket-state.ts` reducer: in `ticket.transitioned`, name the object being returned `moved` (it is the `return { ...state, stateId: p.to, … }` at `:290-333`; keep every existing property) and end the arm with
  ```ts
  return p.cause?.kind === 'reopened-by-flow' && moved.typeId === DECISION_TYPE_ID ? releaseOutcome(moved) : moved;
  ```
  In `ticket.closed`: `const p = ticketClosedPayload.parse(env.payload); return { ...state, closed: { actorId: env.actorId, at: env.serverTime, ...(p.cause === undefined ? {} : { cause: p.cause }) } };`. `ticket.reopened` only changes to `ticketReopenedPayload.parse(env.payload)` (unchanged behaviour: `closed: null` already drops the cause).
  Run the file, then the whole domain suite. Expected: PASS. Flip 29.200, 29.201, 29.202, 29.206 ✅.
  Commit: `wtg2 T8: flow causes, the flow actor and the reducer arms`.

- [ ] **Step 4: RED engine tests (29.203, 29.204, 29.361, 29.362, 29.363)**

  `packages/rule-engine/test/flow-cause.test.ts`; world and `WF_STRICT` copied from `test/transition-backlog.test.ts:1-25` (no wildcard edges: `todo → doing → done` only, so `todo → done` and `done → todo` are undeclared); `WF_TWO_TERMINALS` is `WF_STRICT` with `{ id: 'dropped', name: 'Dropped', category: 'terminal' }` added AFTER `done`.
  ```ts
  const FLOW = SYSTEM_ACTOR_FLOW, PERSON = '01J9GACT000000000000000001';
  const by = (actorId: string, type: string, payload: unknown): EventEnvelope =>
    makeEnvelope({ type, entity: { kind: 'ticket', id: T }, workspaceId: WS, payload, actorId });
  const notTaken = { kind: 'branch-not-taken', decisionTicketId: D, outcome: 'No', pass: 1, decidedBy: PERSON, decisionEventId: EV };
  const reopened = { ...notTaken, kind: 'reopened-by-flow' };
  const ledTo = { kind: 'led-to', sourceTicketId: D, triggeredBy: PERSON };
  const FORGED = 'Only the flow can record that a ticket was led here, reopened or passed over by a decision.';

  it('29.203 a flow cause from a person is cause.forged at all three doors, before any other rule; the flow actor passes', async () => {
    const w = (...after: EventEnvelope[]) => buildMemoryContext([WF_STRICT], [typeDefined(TASK), createdIn('focus'), ...after]);
    const forged = { refused: true, rule: 'cause.forged', reason: FORGED };
    expect(await evaluateEvent(by(PERSON, 'ticket.transitioned', { to: 'done', cause: notTaken }), w())).toEqual(forged);
    expect(await evaluateEvent(by(PERSON, 'ticket.transitioned', { to: 'doing', cause: ledTo }), w())).toEqual(forged); // forged even though the edge is declared
    expect(await evaluateEvent(by(PERSON, 'ticket.closed', { cause: notTaken }), w(by(PERSON, 'ticket.transitioned', { to: 'doing' }), by(PERSON, 'ticket.transitioned', { to: 'done' })))).toEqual(forged); // before the terminal and children checks
    expect(await evaluateEvent(by(PERSON, 'ticket.reopened', { cause: reopened }), w())).toEqual(forged); // before the not-closed check
    expect(await evaluateEvent(by(FLOW, 'ticket.transitioned', { to: 'doing', cause: ledTo }), w())).toEqual({ refused: false }); // control: the flow's led-to on a declared edge
    expect(await evaluateEvent(by(PERSON, 'ticket.transitioned', { to: 'doing', cause: { kind: 'reopened-for-child', childTicketId: D } }), w())).toEqual({ refused: false }); // control: a person's old cause
  });
  ```
  29.204 (flow actor; `ctxStrict(...)` is the `ctx` of `transition-backlog.test.ts` with an actor-agnostic history):
  ```ts
  it('29.204 the flow moves over undeclared edges, and every invariant still holds', async () => {
    const atDone = (def = WF_STRICT) => buildMemoryContext([def], [typeDefined(TASK), createdIn('focus'), by(PERSON, 'ticket.transitioned', { to: 'doing' }), by(PERSON, 'ticket.transitioned', { to: 'done' })]);
    expect(await evaluateEvent(by(FLOW, 'ticket.transitioned', { to: 'todo', cause: reopened }), atDone())).toEqual({ refused: false });  // done -> initial
    expect(await evaluateEvent(by(FLOW, 'ticket.transitioned', { to: 'backlog', cause: reopened }), atDone())).toEqual({ refused: false }); // done -> backlog (no universal edge from terminal)
    expect(await evaluateEvent(by(FLOW, 'ticket.transitioned', { to: 'done', cause: notTaken }), ctx('focus'))).toEqual({ refused: false }); // todo -> done
    expect(await evaluateEvent(by(FLOW, 'ticket.transitioned', { to: 'done', cause: notTaken }), buildMemoryContext([WF_TWO_TERMINALS], [typeDefined(TASK), createdIn('focus')]))).toEqual({ refused: false });
    expect(await evaluateEvent(by(FLOW, 'ticket.transitioned', { to: 'dropped', cause: notTaken }), buildMemoryContext([WF_TWO_TERMINALS], [typeDefined(TASK), createdIn('focus')]))).toMatchObject({ rule: 'illegal-transition' }); // only the FIRST terminal
    // invariants: a closed ticket
    const closed = buildMemoryContext([WF_STRICT], [typeDefined(TASK), createdIn('focus'), by(PERSON, 'ticket.transitioned', { to: 'doing' }), by(PERSON, 'ticket.transitioned', { to: 'done' }), by(PERSON, 'ticket.closed', {})]);
    expect(await evaluateEvent(by(FLOW, 'ticket.transitioned', { to: 'todo', cause: reopened }), closed)).toMatchObject({ rule: 'closed-ticket' });
    // invariants: a child leaving terminal under a terminal parent
    const P = '01J9GPAR000000000000000000';
    const underDone = buildMemoryContext([WF_STRICT], [typeDefined(TASK), createdIn('focus', P), createdIn('focus'), /* child T under P */ ...finish(T), ...finish(P)]);
    expect(await evaluateEvent(by(FLOW, 'ticket.transitioned', { to: 'todo', cause: reopened }), underDone)).toMatchObject({ rule: 'child-open-under-terminal-parent' });
    // invariants: a parent entering terminal over an open child
    const overOpen = buildMemoryContext([WF_STRICT], [typeDefined(TASK), createdIn('focus'), childOf(T)]);
    expect(await evaluateEvent(by(FLOW, 'ticket.transitioned', { to: 'done', cause: notTaken }), overOpen)).toMatchObject({ rule: 'parent-terminal-with-open-children' });
    // control: led-to opens no edge
    expect(await evaluateEvent(by(FLOW, 'ticket.transitioned', { to: 'done', cause: ledTo }), ctx('focus'))).toMatchObject({ rule: 'illegal-transition' });
  });
  ```
  Write `createdIn(start, parentId = null, id = T)`, `finish(id)` and `childOf(parent)` as three-line helpers at the head of the file (a `ticket.created` envelope with `parentId`, and the two `done`-bound transitions), copying the `created` builder of `checks/test-support.ts:80-100`; the rule ids are the pinned strings in `refusal-rules.ts` (`closed-ticket`, `parent-terminal-with-open-children`, `child-open-under-terminal-parent` — read the file and use its exact kebab ids if these differ). The three negative cases:
  ```ts
  it('29.361 a person gets no exemption, with or without a cause', async () => {
    expect(await evaluateEvent(by(PERSON, 'ticket.transitioned', { to: 'done' }), ctx('focus'))).toMatchObject({ rule: 'illegal-transition' });
    expect(await evaluateEvent(by(PERSON, 'ticket.transitioned', { to: 'todo' }), atDone())).toMatchObject({ rule: 'illegal-transition' });
    expect(await evaluateEvent(by(PERSON, 'ticket.transitioned', { to: 'done', cause: notTaken }), ctx('focus'))).toMatchObject({ rule: 'cause.forged' });
    expect(await evaluateEvent(by(FLOW, 'ticket.transitioned', { to: 'done', cause: notTaken }), ctx('focus'))).toEqual({ refused: false }); // control
  });
  it('29.362 the flow actor needs the cause', async () => {
    expect(await evaluateEvent(by(FLOW, 'ticket.transitioned', { to: 'done' }), ctx('focus'))).toMatchObject({ rule: 'illegal-transition' });
    expect(await evaluateEvent(by(FLOW, 'ticket.transitioned', { to: 'todo' }), atDone())).toMatchObject({ rule: 'illegal-transition' });
    expect(await evaluateEvent(by(FLOW, 'ticket.transitioned', { to: 'todo', cause: reopened }), atDone())).toEqual({ refused: false }); // control
  });
  it('29.363 the cause must fit the move', async () => {
    expect(await evaluateEvent(by(FLOW, 'ticket.transitioned', { to: 'done', cause: reopened }), ctx('focus'))).toMatchObject({ rule: 'illegal-transition' }); // reopened-by-flow into a terminal
    expect(await evaluateEvent(by(FLOW, 'ticket.transitioned', { to: 'todo', cause: notTaken }), atDone())).toMatchObject({ rule: 'illegal-transition' }); // not-taken into the initial state
    expect(await evaluateEvent(by(FLOW, 'ticket.transitioned', { to: 'doing', cause: reopened }), ctx('backlog'))).toMatchObject({ rule: 'illegal-transition' }); // neither initial nor backlog
    expect(await evaluateEvent(by(FLOW, 'ticket.transitioned', { to: 'done', cause: notTaken }), atDone())).toMatchObject({ rule: 'illegal-transition' }); // not-taken from a terminal ticket: nothing to pass over
  });
  ```
  (`atDone` and `ctx` are the file-level helpers above, hoisted out of the first `it`.) Run `slot-run.sh wtg2-t8-eng-red -- pnpm --filter @gisik-nokma/rule-engine exec vitest run test/flow-cause.test.ts`. Expected: FAIL.

- [ ] **Step 5: Engine implementation**

  `refusals.ts` (`REFUSALS`, a fixed key like the `hierarchy.*` ones): `'cause.forged': 'Only the flow can record that a ticket was led here, reopened or passed over by a decision.',`. `checks/flow-cause.ts`:
  ```ts
  import { SYSTEM_ACTOR_FLOW, isFlowCause, statesWithBacklog, BACKLOG_STATE_ID, stateCategoryOf, type EventEnvelope, type FlowCause, type Transition, type WorkflowDef, type WorkflowState } from '@gisik-nokma/domain';
  import type { Refusal } from '../engine.js';
  import { refuse } from './refusals.js';

  /** A flow cause on an event nobody but the flow actor may file it on. Runs FIRST at the three doors: a forged cause must hear "forged", not whatever else its move would earn. */
  export function flowCauseForgery(env: EventEnvelope, cause: unknown): Refusal | null {
    return isFlowCause(cause) && env.actorId !== SYSTEM_ACTOR_FLOW ? refuse('cause.forged') : null;
  }

  /** PS-11. The one-off, rules-less edge the flow's two moves ride; null for anything else (a person, a missing cause, `led-to`, a move of the wrong shape). */
  export function flowExemptEdge(env: EventEnvelope, def: WorkflowDef, fromStateId: string, to: WorkflowState, cause: unknown): Transition | null {
    if (env.actorId !== SYSTEM_ACTOR_FLOW || !isFlowCause(cause) || fromStateId === to.id) return null;
    if (cause.kind === 'reopened-by-flow') {
      return to.id === def.initialStateId || to.id === BACKLOG_STATE_ID ? { from: fromStateId, to: to.id, rules: [] } : null;
    }
    if (cause.kind === 'branch-not-taken') {
      const firstTerminal = def.states.find((state) => state.category === 'terminal');
      return firstTerminal !== undefined && to.id === firstTerminal.id && stateCategoryOf(def, fromStateId) !== 'terminal' ? { from: fromStateId, to: to.id, rules: [] } : null;
    }
    return null;
  }
  ```
  (`statesWithBacklog` is not needed; drop it from the import. `stateCategoryOf(def, 'backlog')` returns `open`: a ticket in backlog is non-terminal.) `transition.ts`: after `const payload = parsed.data;` (`:60`) add `const forged = flowCauseForgery(env, payload.cause); if (forged !== null) return forged;`. Replace the edge lookup (`:117-124`):
  ```ts
  const declared =
    resolved.stateId === BACKLOG_STATE_ID
      ? universalTransitions(latest).find((t) => t.from === BACKLOG_STATE_ID && t.to === payload.to)
      : (edges.find((t) => t.from === resolved.stateId && t.to === payload.to) ??
         edges.find((t) => t.from === '*' && t.to === payload.to));
  // PS-11: the flow's loop reset and not-taken moves ride a synthetic edge. Only after the closed check above and
  // before the parent/child invariants below, which no definition and no actor can switch off.
  const transition = declared ?? flowExemptEdge(env, latest, resolved.stateId, toState, payload.cause) ?? undefined;
  ```
  (The declared edge wins, so a flow move that the workflow already allows keeps its authored rules. `led-to` on a declared edge is covered by 29.203's control.) `close.ts`: in `checkTicketClosed` and `checkTicketReopened`, right after the payload parse: `const forged = flowCauseForgery(env, parsed.data.cause); if (forged !== null) return forged;`. `index.ts`: export `flowCauseForgery`, `flowExemptEdge`. Run the file, then WHOLE rule-engine. Expected: PASS. Flip 29.203, 29.204, 29.361, 29.362, 29.363 ✅.
  Commit: `wtg2 T8: the forgery guard and the flow's synthetic edges`.

- [ ] **Step 6: Consumers: serving, mapping, purge, board (29.207, 29.208)**

  `read-models.ts:35` and `view-types.ts:237`:
  ```ts
  export type TransitionCause =
    | { kind: 'reopened-for-child'; childTicketId: string }
    | { kind: 'led-to' | 'reopened-by-flow' | 'branch-not-taken' };
  ```
  `state-provenance.ts:73-76`: `cause: row.type === 'ticket.transitioned' && row.payload.cause !== undefined ? servedCause(row.payload.cause) : null` with, beside it, `function servedCause(raw: unknown): TransitionCause | null { return isFlowCause(raw) ? viewerSafeCause(raw) : (raw as TransitionCause); }` (the old kind passes through unchanged; the `payload` type becomes `{ cause?: unknown }`). The detail route's `closed.cause` (found by `grep -rn "closed" apps/server/src/read/ticket-detail*.ts`; apply `servedCause` where `closed` is serialised once T9 serves it; today nothing serves it, so this task adds the helper and its test only). `mappers.ts:566`:
  ```ts
  const FLOW_KINDS = ['led-to', 'reopened-by-flow', 'branch-not-taken'] as const;
  function mapCause(raw: unknown, path: string): TransitionCause | null {
    if (raw === null) return null;
    const record = asRecord(raw, path);
    const kind = asString(record['kind'], `${path}.kind`);
    const flow = FLOW_KINDS.find((k) => k === kind);
    if (flow !== undefined) return { kind: flow };
    if (kind !== 'reopened-for-child') throw new MappingError(`${path}.kind`, `reopened-for-child, ${FLOW_KINDS.join(', ')} (got ${kind})`);
    return { kind: 'reopened-for-child', childTicketId: asString(record['childTicketId'], `${path}.childTicketId`) };
  }
  ```
  The existing test 3.43 (`reopened-by-decree`) stays a refusal control and its expected message gains the list; update the literal. `replica-data-source.ts:709-717` (`causeOf`): after the existing `record.kind` test, `if (isFlowCause(cause)) return viewerSafeCause(cause);` before the `reopened-for-child` line, so the replica serves the same `{kind}` the server does. `board.tsx:2267`: `{card.cause?.kind === 'reopened-for-child' ? (…chip…) : null}`; the chips for the flow kinds are Part 3-4's.
  `check-purged.ts` `payloadIds` (sibling: the `ticket.link_added` arm): add
  ```ts
  case 'ticket.transitioned':
  case 'ticket.closed':
  case 'ticket.reopened': {
    const cause = payload['cause'];
    if (typeof cause === 'object' && cause !== null) {
      add('ticket', (cause as Record<string, unknown>)['sourceTicketId']);
      add('ticket', (cause as Record<string, unknown>)['decisionTicketId']);
    }
    break;
  }
  ```
  (T5 added a `closeStarted` arm on `ticket.decided`; keep it.) `redactedPayload` in `history-copy.ts` (T5's edit site): when `cause.sourceTicketId`/`decisionTicketId` is `null` the sentence says "a ticket you can't see", when `triggeredBy`/`decidedBy` is `null` "someone you can't see" (the copy for a visible id is T17's).
  Tests, `apps/server/test/read/flow-cause-serving.test.ts` (world: `state-provenance`'s existing test file for the seed): a ticket transitioned by `SYSTEM_ACTOR_FLOW` with `cause: notTaken` serves `cause: { kind: 'branch-not-taken' }` and `JSON.stringify(provenance)` contains neither `D` nor `PERSON`; a `reopened-for-child` cause is served whole (control). Mapper test in `packages/app-core/test/online/` (sibling: test 3.43): all three flow kinds map to `{kind}`; `reopened-by-decree` throws. Replica test (sibling: `replica-data-source` cause test): `causeOf` with a full flow cause returns `{ kind }` only. Purge test (sibling: `apps/server/test/purge/check-purged.test.ts`): a `ticket.closed` with `cause.decisionTicketId` of an erased ticket is refused with `PURGE_RULE`; with a live id it is accepted. Board test: a card with `cause: { kind: 'led-to' }` renders no "reopened, live work added" chip, `reopened-for-child` does (29.207).
  Run: build domain, rule-engine, app-core; `slot-run.sh wtg2-t8-consumers -- pnpm --filter @gisik-nokma/server exec vitest run test/read test/purge --maxWorkers=2` and the app-core suite. Expected: PASS. Flip 29.207, 29.208 ✅.
  Commit: `wtg2 T8: serve flow causes as kinds, map them, name them to the purge door`.

- [ ] **Step 7: The DC-5 exemption (29.205). Needs T6 merged.**

  Test (append to `test/flow-cause.test.ts`; Decision world from `test/decision.test.ts`, T6: `world(labels, ...after)`, with `by(FLOW, …)` actors and `WF_STRICT`):
  ```ts
  it('29.205 branch-not-taken exempts DC-5 on both doors; nothing else does', async () => {
    const dec = (actor: string, to: string, cause?: unknown) => by(actor, 'ticket.transitioned', cause === undefined ? { to } : { to, cause });
    const outcomeRequired = { refused: true, rule: 'decision.outcome-required', reason: 'Choose an outcome before finishing this decision.' };
    expect(await evaluateEvent(dec(FLOW, 'done', notTaken), decisionWorld(['Yes', 'No']))).toEqual({ refused: false });
    expect(await evaluateEvent(dec(PERSON, 'done'), decisionWorld(['Yes', 'No']))).toEqual(outcomeRequired); // a person: still DC-5 (control)
    expect(await evaluateEvent(dec(FLOW, 'done', ledTo), decisionWorld(['Yes', 'No']))).toMatchObject({ rule: 'illegal-transition' }); // the flow without the cause
    const closing = decisionWorld(['Yes', 'No'], dec(FLOW, 'done', notTaken));
    expect(await evaluateEvent(by(FLOW, 'ticket.closed', { cause: notTaken }), closing)).toEqual({ refused: false });
    expect(await evaluateEvent(by(PERSON, 'ticket.closed', {}), closing)).toEqual(outcomeRequired); // control
    expect(await evaluateEvent(dec(FLOW, 'done', notTaken), decisionWorld(['Yes', 'No'], by(PERSON, 'ticket.decided', { outcome: 'Yes' })))).toEqual({ refused: false }); // control: an outcome never needed the exemption
  });
  ```
  (`decisionWorld` is T6's `world` re-declared locally on `WF_STRICT`: three lines, the Decision created `focus` in `doing` with `leads_to` links.) Implementation: `transition.ts`, T6's line becomes `const outcomeRequired = decisionOutcomeRequired(ticket, payload.cause?.kind === 'branch-not-taken');`, and `checks/close.ts`'s `return decisionOutcomeRequired(ticket) ?? ACCEPT;` becomes `return decisionOutcomeRequired(ticket, parsed.data.cause?.kind === 'branch-not-taken') ?? ACCEPT;`. The forgery guard has already run, so the cause is trusted by the time it reaches either line. Run the file and the whole rule-engine suite. Expected: PASS. Flip 29.205 ✅.
  Commit: `wtg2 T8: branch-not-taken exempts the Decision outcome rule`.

- [ ] **Step 8: Census, bundle, wide runs, DONE**

  Census row (29.209): in the Part 2 census file add a `T8` row listing `cause.forged` in the refusal vocabulary and the three cause kinds; mirror T5's row. Mobile bundle: `pnpm --filter @gisik-nokma/editor run build:webview && pnpm --filter @gisik-nokma/mobile run generate:editor-html`, then `grep -c "branch-not-taken" apps/mobile/src/editor/editor-html.generated.ts` must print a number above 0 (`--check` warns and exits 0 when the webview is unbuilt, so the grep is the assertion; grep for the kind, not for `SYS0FW`, which is likely tree-shaken out of the editor bundle). Build domain, rule-engine, app-core; run the WHOLE domain, rule-engine, app-core, sync-client and server suites (`slot-run.sh wtg2-t8-wide -- … --maxWorkers=2`), `pnpm check:citations && node scripts/check-case-ids.mjs`. Flip 29.209 ✅; put the Step 1 bullet under the `<!-- wtg-part2-model T8 bullet -->` anchor (keep the anchor line: 29.146 reads the bullets below it). Push. DONE + REVIEW (NEEDS: T5 merged; Step 7 needs T6; `closed.cause` has no column until T9; the History sentences and chips for the flow causes are T17's).

**Mutations** (each on the green branch, expect the named red, restore):

| Case | Mutation | Expected red |
|---|---|---|
| 29.200 | drop `.strict()` from `ledToCauseSchema` | the extra-key case parses |
| 29.201 | `ticketClosedPayload.cause` = `flowCauseSchema.optional()` | `led-to` on a close parses |
| 29.202 | spell the constant with an I | the ULID assertion |
| 29.203 | run `flowCauseForgery` after the edge lookup | a person's forged move is `illegal-transition` |
| 29.203 | drop the guard from `checkTicketReopened` | the reopen case is `not-closed` |
| 29.204 | let the synthetic edge precede the closed-ticket check | the closed case is accepted |
| 29.204 | pick the LAST terminal state | the two-terminal case |
| 29.205 | exempt on `isFlowCause(payload.cause)` | `reopened-by-flow` into done passes DC-5 |
| 29.206 | release on any cause | the person-move control |
| 29.207 | return the raw cause in `servedCause` | `D` appears in the provenance JSON |
| 29.208 | drop the `ticket.closed` arm in `payloadIds` | the purged close is accepted |
| 29.361 | drop the actor test in `flowExemptEdge` | a person's `todo → done` is accepted |
| 29.362 | key on the actor only | the cause-less flow move is accepted |
| 29.363 | ignore `to` for `reopened-by-flow` | the into-terminal case |

---

### Task 9: Work periods, rounds, resolution, actual dates (cases 29.167-29.170, 29.350-29.355, 29.359-29.360)

**Branch:** `task/wtg2-work-periods` from `origin/release/workflow-graph`; PR `--base release/workflow-graph`. **Needs:** T8 merged (the `cause` union on `ticket.transitioned`, `ticket.closed` and `ticket.reopened`, `TicketState.closed.cause`, `isFlowCause` in `packages/domain/src/flow/causes.ts`). Independent of T2-T7. **Deploy step (owner, recorded in HANDOFF):** right after the migration runs, `pnpm --filter @gisik-nokma/server rebuild:projection proj_tickets` (the precedent is the 2026-09-22 priority change, `apps/server/src/tools/rebuild-projection.ts:6-11`); without it every pre-existing ticket has `periods = '[]'` and its next live fold would invent a zero-length period.

**Files:**
- Create: `packages/domain/src/flow/derive.ts`, `packages/domain/src/flow/periods.ts`, `apps/server/migrations/1792100200000_proj-tickets-periods.sql`.
- Modify (re-read each before editing; line numbers are from the tip):
  - `packages/domain/src/entity-state.ts:33-143` (`TicketState`: `periods?`, `rounds?`; `closed` is T8's).
  - `packages/domain/src/ticket-state.ts`: the creation return (`:177-265`), the `ticket.transitioned` arm (`:276-333`), the `ticket.workflow_rebound` arm (`:368-399`), plus `TICKET_FOLD_VERSION` beside `TICKET_EVENT_TYPES` (`:89-107`).
  - `packages/domain/src/index.ts` (after `:39`): two `export *` lines; T10 later replaces them with `export * from './flow/index.js'`.
  - `apps/server/src/projections/tickets.ts`: `TicketRow` (`:87-118`), `rowToTicketState` (`:152-218`), `upsertTicket` (`:284-359`).
  - `apps/server/src/ledger/snapshot-store.ts` (`writeSnapshot`, `overwriteSnapshot`, `readLatestSnapshot`), `apps/server/src/sync/snapshot-writer.ts` (`foldTicketHead` `:52-109`, `runSnapshotPass` `:224-`, the due query in `runSnapshotPass`, `startSnapshotWriter`), `apps/server/src/index.ts:297`.
  - `packages/sync-client/src/precheck/local-context.ts:145-156` (the pending fold), `packages/sync-client/src/storage/schema.ts:21`, `packages/sync-client/src/replica/replica.ts:411-414` and `:2152`.
- Test (create): `packages/domain/test/work-periods.test.ts`, `apps/server/test/projections/tickets-periods.test.ts`, `apps/server/test/sync/snapshot-fold-version.test.ts`, `packages/sync-client/test/replica-periods.test.ts`. Edit: `packages/sync-client/test/replica-comment-changes.test.ts:42` (`toBe(4)` becomes `toBe(5)`, and the `'4'` at `:54` becomes `'5'`), `apps/server/test/snapshot-store.test.ts` (the `readLatestSnapshot` `toEqual` literals gain `foldVersion: 2`).

**Interfaces:**
- Consumes: T8 `isFlowCause(c: unknown): c is FlowCause`; `ticketTransitionedPayloadSchema.cause` (union incl. `{kind:'reopened-by-flow'}`, `{kind:'branch-not-taken'}`); `TicketState.closed: {actorId; at; cause?: FlowCause} | null`.
- Produces (`@gisik-nokma/domain`): `type WorkPeriod = {start: string; end: string | null; pass: number}`; `type NotTakenResolution = {kind:'not-taken'; decisionTicketId: string; outcome: string; pass: number}`; `ticketRound(s): number`, `startedAtOf(s): string|null`, `endedAtOf(s): string|null`, `hasStarted(s): boolean`, `notTakenOf(cause: unknown): NotTakenResolution|null`, `resolutionOf(s): NotTakenResolution|null` (all in `flow/derive.ts`); `foldWorkPeriods(periods, move)`, `setPeriods(state, periods)`, `keepConfirmedPeriods(before, after)` (in `flow/periods.ts`); `TICKET_FOLD_VERSION = 2`; `TicketState.periods?: WorkPeriod[]` (ABSENT when empty), `TicketState.rounds?: number` (ABSENT = 1).
- Produces (server): `proj_tickets.started_at|ended_at|periods|rounds|closed_cause`; `Snapshot.foldVersion`; `snapshots.fold_version`.

**Why the decisions are what they are.**
- *Absent-when-empty* is typed-links T1's rule for `links` (`ticket-state.ts:469-476`: the reducer drops the key with the last link). The dual-client rig compares whole states with `toEqual` (the `rank` comments in the creation branch and in `rowToTicketState` record why), so `rowToTicketState` spreads `periods` only when the column's array is non-empty and `rounds` only when above 1.
- *Terminal to terminal opens nothing.* WP-1 read literally ("opens at the first event that places the ticket in a category other than open while none is open") would give a Done to Cancelled move a zero-length period. A ticket already terminal was not newly placed; `foldWorkPeriods` takes `wasTerminal` from `state.stateCategory`. Flagged to the owner in DECISIONS.
- *The reset counts before it folds periods.* `rounds` rises on the `reopened-by-flow` transition itself (contract decision 3), and the periods fold reads the NEW round, so a workflow whose initial state is `active` opens the next period with `pass` 2.
- *Refresh-on-publish does not move periods* (`foldTicketToWorkflowVersion` spreads `...state`, `ticket-state.ts:580-590`) but it re-reads the row through `rowToTicketState` and upserts it (`projections/tickets.ts:473`), so a `rowToTicketState` that forgot `periods` would erase them on every publish. 29.169 pins that.
- *Snapshots.* `foldTicketHead` RESUMES from the latest snapshot and folds only the tail (`snapshot-writer.ts:52-70`), so a snapshot written before `periods` existed makes every later fold wrong (a ticket in progress at the snapshot, finished in the tail, would get a zero-length period). Deleting the row is refused by `snapshot-refresh.ts` (its docblock: a ticket without a snapshot is served its full history, which can name a dropped state); so the stale row is RESTATED: a `fold_version` column, a due-query arm, and `overwriteSnapshot`. The replica has no ALTER path (the docblock above `snapshot_provenance` in `schema.ts`), so its seam is the durable pending-pull queue (`replica.ts:1480-1560`).
- *Pending events* are folded with `serverTime: clientTime` (`local-context.ts:145-149`); ES-4 wants the periods left alone, so the pending fold re-applies the confirmed periods.
- *`PROJ_TICKET_COLUMNS` (`read/ticket-cards.ts:75`) is NOT widened here.* Its docblock (`:42-72`) forbids carrying a column no card route reads and a mutation that deleted one survived the whole suite. Parts 3-4 add the reader and the column together; T17 adds `t.closed_cause` with its reader named.

- [ ] **Step 1: Catalogue**

  Write under `<!-- wtg-part2-model T9 -->` in `test-cases/29-workflow-timeline-graphs.md` (all ❌), and the Features bullets under `<!-- wtg-part2-model T9 bullet -->`:
  - `- ❌ **29.167 — a ticket's actual start and end are the first period's start and the last period's end on every path: born active; open to active; open straight to terminal (a zero-length period); active to terminal; terminal to active clears the end; a reopen alone leaves it;** control: a ticket that never left an open state has neither.` Mutation: open the period on `ticket.reopened` -> the reopen path reddens.
  - `- ❌ **29.168 — the derived helpers read an absent member as "none" (round 1, no dates, not started, no resolution), and the day shown for an instant is its IST day;** control: 18:29:59Z and 18:30:00Z fall on different IST days.` Mutation: `ticketRound` returns `s.rounds ?? 0`.
  - `- ❌ **29.169 — the projection writes started_at, ended_at, periods, rounds and closed_cause from the folded state, reads periods, rounds and the close cause back into the same shape the reducer makes (absent when empty), and a workflow republish leaves periods intact;** control: a never-started ticket round-trips with no periods key.` Mutation: drop `periods` from `rowToTicketState` -> the republish case reddens.
  - `- ❌ **29.170 — the migration adds the five columns with defaults ('[]', 1, NULL) and a pre-existing row reads as no periods until proj_tickets is rebuilt, which restores them;** control: a ticket created after the migration needs no rebuild.`
  - `- ❌ **29.350 — a period opens at the serverTime of the first event placing the ticket in an active or terminal category and closes on terminal or on Backlog; moving between non-terminal states inside the workflow keeps it open, and each period records the round;** control: Backlog closes, To do does not.`
  - `- ❌ **29.351 — terminal to active opens period 2 (the first stays closed); terminal to terminal opens nothing; a workflow rebound into an active state opens one;** control: the same moves from an open state.`
  - `- ❌ **29.352 — rounds is 1 plus the number of reopened-by-flow TRANSITIONS: the paired ticket.reopened and a reopened-for-child cause add nothing, and a reset into an active initial state opens the next period with the new round;** control: a person's reopen leaves rounds absent.`
  - `- ❌ **29.353 — a branch-not-taken move and close opens and closes no period and yields a not-taken resolution; a reopen clears it;** control: the same moves with no cause make a zero-length period and no resolution.`
  - `- ❌ **29.354 — a pending (unaccepted) event leaves periods unchanged in the replica overlay;** control: the same event accepted records the period.` Mutation: drop `keepConfirmedPeriods` from `local-context.ts` -> a device-clock period appears.
  - `- ❌ **29.355 — a ticket whose snapshot predates periods is restated by the snapshot pass from its full history and carries its periods; a current-version snapshot is still resumed, not refolded;** control: the tail read's lower bound is the snapshot's seq only for the current version.` Mutation: ignore `foldVersion` in `foldTicketHead` -> the stale case reddens.
  - `- ❌ **29.359 — proj_tickets rebuilt from the ledger equals the live table (verifyProjections clean) for a ticket reopened after its first finish, for a not-taken close and for a flow-reset round;** control: the verifier reports drift when one live row's periods is altered.`
  - `- ❌ **29.360 — a replica at schema version 4 owes a pull for every ticket it holds when it opens at version 5, a fresh replica owes none, and the pulled snapshot's periods reach the confirmed state;** control: opening again once the pulls are cleared owes nothing.`
  Features (`⚙️`/`✅`, each with its file path): `✅ A ticket's actual start and end dates, derived from its work periods, past and reopened (packages/domain/src/flow/derive.ts, ticket-state.ts)`; `⚙️ Work periods and rounds folded by the shared reducer and projected to proj_tickets (packages/domain/src/flow/periods.ts, apps/server/src/projections/tickets.ts)`; `⚙️ Snapshot fold versions and the replica's re-pull on schema 5 (apps/server/src/ledger/snapshot-store.ts, packages/sync-client/src/replica/replica.ts)`.
  Run: `node scripts/check-case-ids.mjs && pnpm check:citations`. Expected: pass. Commit: `wtg2 T9: open the work-period cases and Features bullets`.

- [ ] **Step 2: RED domain tests (29.167, 29.168, 29.350-29.353)**

  `packages/domain/test/work-periods.test.ts`. Copy the imports, the `WF`/`WF_SUPPORT`/`TASK_TYPE`/`deps` shape and `fold` from `packages/domain/test/ticket-state.test.ts:1-130` (it builds envelopes with `makeEnvelope`; it passes `serverTime` through `...partial`).
  ```ts
  import { describe, expect, it } from 'vitest';
  import type { TicketState } from '../src/entity-state.js';
  import { makeEnvelope } from '../src/testing.js';
  import { applyTicketEvent, type TicketStateDeps } from '../src/ticket-state.js';
  import { endedAtOf, hasStarted, resolutionOf, startedAtOf, ticketRound } from '../src/flow/derive.js';
  import { istDayOf } from '../src/ist-day.js';
  import type { TicketTypeDef } from '../src/ticket-types.js';
  import type { WorkflowDef } from '../src/workflow.js';

  const TICKET = '01J9GTKA000000000000000000';
  const DECISION = '01J9GDEC000000000000000000';
  const ACTOR = '01J9GACT000000000000000000';
  const EVT = '01J9GEVT000000000000000000';
  const open = (id: string, name: string) => ({ id, name, category: 'open' as const });
  const wf = (id: string, initialStateId: string): WorkflowDef => ({
    id, version: 1, name: id, initialStateId,
    states: [open('todo', 'To do'), { id: 'doing', name: 'Doing', category: 'active' }, { id: 'review', name: 'Review', category: 'active' },
      { id: 'done', name: 'Done', category: 'terminal' }, { id: 'dropped', name: 'Dropped', category: 'terminal' }],
    transitions: ['todo', 'doing', 'review', 'done', 'dropped'].map((to) => ({ from: '*', to, rules: [] })),
  });
  const WF_OTHER: WorkflowDef = { id: 'wf-other', version: 1, name: 'Other', initialStateId: 'new',
    states: [open('new', 'New'), { id: 'working', name: 'Working', category: 'active' }, { id: 'shut', name: 'Shut', category: 'terminal' }],
    transitions: [{ from: '*', to: 'working', rules: [] }] };
  const type = (id: string, workflowId: string): TicketTypeDef => ({ id, name: id, icon: 'check', rank: 3, workflowId, fields: [] });
  const deps: TicketStateDeps = {
    getTicketType: (id) => [type('task', 'wf-basic'), type('eager', 'wf-eager')].find((t) => t.id === id),
    getWorkflow: (id) => [wf('wf-basic', 'todo'), wf('wf-eager', 'doing'), WF_OTHER].find((w) => w.id === id),
  };
  const T = (n: number): string => `2026-09-0${n}T10:00:00.000Z`;
  const ev = (type: string, payload: unknown, n: number) =>
    makeEnvelope({ type, entity: { kind: 'ticket', id: TICKET }, payload, serverTime: T(n), seq: n });
  const created = (n: number, extra: Record<string, unknown> = {}) =>
    ev('ticket.created', { typeId: 'task', projectId: '01J9GPRJ000000000000000000', parentId: null, title: 'T', ...extra }, n);
  const to = (state: string, n: number, cause?: unknown) => ev('ticket.transitioned', cause === undefined ? { to: state } : { to: state, cause }, n);
  const fold = (events: ReturnType<typeof ev>[]): TicketState =>
    events.reduce<TicketState | undefined>((s, e) => applyTicketEvent(s, e, deps), undefined) as TicketState;
  const RESET = { kind: 'reopened-by-flow', decisionTicketId: DECISION, outcome: 'No', pass: 1, decidedBy: ACTOR, decisionEventId: EVT };
  const NOT_TAKEN = { ...RESET, kind: 'branch-not-taken', outcome: 'Yes' };
  ```
  Cases (each `it` carries its control):
  ```ts
  describe('29.167 actual dates', () => {
    it('29.167 first start, last end, on every path', () => {
      const born = fold([created(1, { stateId: 'doing' })]);
      expect([startedAtOf(born), endedAtOf(born), hasStarted(born)]).toEqual([T(1), null, true]);
      const opened = fold([created(1), to('doing', 2)]);
      expect([startedAtOf(opened), endedAtOf(opened)]).toEqual([T(2), null]);
      expect(fold([created(1), to('done', 2)]).periods).toEqual([{ start: T(2), end: T(2), pass: 1 }]);
      const finished = fold([created(1), to('doing', 2), to('done', 3)]);
      expect([startedAtOf(finished), endedAtOf(finished), hasStarted(finished)]).toEqual([T(2), T(3), false]);
      expect(endedAtOf(fold([created(1), to('doing', 2), to('done', 3), to('doing', 4)]))).toBeNull(); // terminal -> active clears it
      const reopened = fold([created(1), to('doing', 2), to('done', 3), ev('ticket.closed', {}, 4), ev('ticket.reopened', {}, 5)]);
      expect(endedAtOf(reopened)).toBe(T(3)); // a reopen alone leaves it
      const idle = fold([created(1), to('todo', 2)]); // control
      expect([startedAtOf(idle), endedAtOf(idle), 'periods' in idle]).toEqual([null, null, false]);
    });
  });
  describe('29.168 derived helpers', () => {
    it('29.168 absent members read as none; the IST day of an instant', () => {
      const idle = fold([created(1)]);
      expect([ticketRound(idle), hasStarted(idle), resolutionOf(idle)]).toEqual([1, false, null]);
      expect(istDayOf('2026-09-02T18:29:59.000Z')).toBe('2026-09-02');
      expect(istDayOf('2026-09-02T18:30:00.000Z')).toBe('2026-09-03'); // control: the boundary
    });
  });
  describe('29.350 / 29.351 periods', () => {
    it('29.350 closes on terminal or Backlog, not on a move inside the workflow', () => {
      expect(fold([created(1), to('doing', 2), to('review', 3), to('todo', 4)]).periods).toEqual([{ start: T(2), end: null, pass: 1 }]);
      expect(fold([created(1), to('doing', 2), to('backlog', 3)]).periods).toEqual([{ start: T(2), end: T(3), pass: 1 }]); // control
      expect(fold([created(1), to('doing', 2), to('done', 3)]).periods).toEqual([{ start: T(2), end: T(3), pass: 1 }]);
    });
    it('29.351 terminal to active opens period 2; terminal to terminal opens nothing; a rebound opens', () => {
      const two = fold([created(1), to('doing', 2), to('done', 3), to('doing', 4)]);
      expect(two.periods).toEqual([{ start: T(2), end: T(3), pass: 1 }, { start: T(4), end: null, pass: 1 }]);
      expect(fold([created(1), to('doing', 2), to('done', 3), to('dropped', 4)]).periods).toHaveLength(1);
      const rebound = fold([created(1), ev('ticket.workflow_rebound', { toWorkflowId: 'wf-other', toStateId: 'working' }, 2)]);
      expect(rebound.periods).toEqual([{ start: T(2), end: null, pass: 1 }]);
      expect('periods' in fold([created(1), ev('ticket.workflow_rebound', { toWorkflowId: 'wf-other', toStateId: 'new' }, 2)])).toBe(false);
    });
  });
  describe('29.352 rounds', () => {
    it('29.352 counts reopened-by-flow transitions only', () => {
      const closedAt4 = [created(1), to('doing', 2), to('done', 3), ev('ticket.closed', {}, 4)];
      const reset = fold([...closedAt4, ev('ticket.reopened', { cause: RESET }, 5)]);
      expect(ticketRound(reset)).toBe(1); // the paired reopen adds nothing
      const next = fold([...closedAt4, ev('ticket.reopened', { cause: RESET }, 5), to('todo', 6, RESET), to('doing', 7)]);
      expect(ticketRound(next)).toBe(2);
      expect(next.periods).toEqual([{ start: T(2), end: T(3), pass: 1 }, { start: T(7), end: null, pass: 2 }]);
      const child = fold([created(1), to('done', 2, { kind: 'reopened-for-child', childTicketId: DECISION })]);
      expect('rounds' in child).toBe(false); // control
      const eager = fold([created(1, { typeId: 'eager' }), to('done', 2), to('doing', 3, RESET)]); // initial state is active
      expect(eager.periods?.[1]).toEqual({ start: T(3), end: null, pass: 2 });
    });
  });
  describe('29.353 not taken', () => {
    it('29.353 opens and closes no period; a reopen clears the resolution', () => {
      const nt = fold([created(1), to('done', 2, NOT_TAKEN), ev('ticket.closed', { cause: NOT_TAKEN }, 3)]);
      expect('periods' in nt).toBe(false);
      expect(resolutionOf(nt)).toEqual({ kind: 'not-taken', decisionTicketId: DECISION, outcome: 'Yes', pass: 1 });
      expect(resolutionOf(applyTicketEvent(nt, ev('ticket.reopened', { cause: RESET }, 4), deps))).toBeNull();
      const plain = fold([created(1), to('done', 2), ev('ticket.closed', {}, 3)]); // control
      expect(plain.periods).toEqual([{ start: T(2), end: T(2), pass: 1 }]);
      expect(resolutionOf(plain)).toBeNull();
    });
  });
  ```
  Run (`slot-run.sh` below is `/Users/kiro/my_projects/gisik-nokma-lanes/slot-run.sh`): `/Users/kiro/my_projects/gisik-nokma-lanes/slot-run.sh wtg2-t9-dom -- pnpm --filter @gisik-nokma/domain exec vitest run test/work-periods.test.ts --maxWorkers=2 > /tmp/wtg2-t9-dom.log 2>&1; tail -30 /tmp/wtg2-t9-dom.log`. Expected: FAIL (`../src/flow/derive.js` does not exist). Commit: `wtg2 T9: RED reducer cases for work periods`.

- [ ] **Step 3: Implement the domain**

  `packages/domain/src/flow/derive.ts`:
  ```ts
  import type { TicketState } from '../entity-state.js';
  import { isFlowCause } from './causes.js';

  /** One interval of real work (WP-1). `start`/`end` are event `serverTime`s; `pass` is the ticket's round when it opened. */
  export type WorkPeriod = { start: string; end: string | null; pass: number };
  export type NotTakenResolution = { kind: 'not-taken'; decisionTicketId: string; outcome: string; pass: number };

  /** 1 plus the flow resets filed on the ticket (PS-2); absent reads as 1. */
  export function ticketRound(s: Pick<TicketState, 'rounds'>): number {
    return s.rounds ?? 1;
  }
  export function startedAtOf(s: Pick<TicketState, 'periods'>): string | null {
    return s.periods?.[0]?.start ?? null;
  }
  /** The last period's end; `null` while it is open or when there is none (ES-4). */
  export function endedAtOf(s: Pick<TicketState, 'periods'>): string | null {
    const last = s.periods?.[s.periods.length - 1];
    return last === undefined ? null : last.end;
  }
  /** Decision 19: started means the last period is open. */
  export function hasStarted(s: Pick<TicketState, 'periods'>): boolean {
    const last = s.periods?.[s.periods.length - 1];
    return last !== undefined && last.end === null;
  }
  /** The ONE reading of a close cause as "not taken"; the server applies it to the jsonb column too (T17). */
  export function notTakenOf(cause: unknown): NotTakenResolution | null {
    if (!isFlowCause(cause) || cause.kind !== 'branch-not-taken') return null;
    return { kind: 'not-taken', decisionTicketId: cause.decisionTicketId, outcome: cause.outcome, pass: cause.pass };
  }
  export function resolutionOf(s: Pick<TicketState, 'closed'>): NotTakenResolution | null {
    return notTakenOf(s.closed?.cause);
  }
  ```
  `packages/domain/src/flow/periods.ts`:
  ```ts
  import type { TicketState } from '../entity-state.js';
  import { BACKLOG_STATE_ID, type StateCategory } from '../workflow.js';
  import type { WorkPeriod } from './derive.js';

  export type PeriodMove = { toStateId: string; toCategory: StateCategory; at: string; wasTerminal: boolean; round: number };

  /** WP-1, one move. Returns the SAME array when nothing changes. */
  export function foldWorkPeriods(periods: readonly WorkPeriod[], move: PeriodMove): readonly WorkPeriod[] {
    const last = periods[periods.length - 1];
    // The periods with the open one closed at `move.at`, or null when none is open.
    const closed = last !== undefined && last.end === null ? [...periods.slice(0, -1), { ...last, end: move.at }] : null;
    if (move.toStateId === BACKLOG_STATE_ID) return closed ?? periods;
    if (move.toCategory === 'terminal') {
      if (closed !== null) return closed;
      return move.wasTerminal ? periods : [...periods, { start: move.at, end: move.at, pass: move.round }];
    }
    if (move.toCategory === 'active' && closed === null) return [...periods, { start: move.at, end: null, pass: move.round }];
    return periods;
  }
  /** `periods` ABSENT when empty (typed-links T1's rule for `links`), so the reducer and `rowToTicketState` agree. */
  export function setPeriods(state: TicketState, periods: readonly WorkPeriod[]): TicketState {
    if (periods.length > 0) return { ...state, periods: [...periods] };
    const { periods: _none, ...rest } = state;
    return rest;
  }
  /** ES-4: a pending event has no serverTime, so its fold keeps the confirmed periods. */
  export function keepConfirmedPeriods(before: TicketState | undefined, after: TicketState): TicketState {
    return setPeriods(after, before?.periods ?? []);
  }
  ```
  `entity-state.ts`, inside `TicketState` after `links?`:
  ```ts
  /** Work periods (WP-1), oldest first; ABSENT when the ticket never started. Derived dates: `flow/derive.ts`. */
  periods?: WorkPeriod[];
  /** 1 plus the flow resets (`reopened-by-flow` transitions) filed on this ticket; ABSENT = 1. */
  rounds?: number;
  ```
  (import `type { WorkPeriod } from './flow/derive.js'`.) `ticket-state.ts`:
  - Creation (`:148`): before the `return`, `const born = foldWorkPeriods([], { toStateId: bornIn, toCategory: category, at: env.serverTime, wasTerminal: false, round: 1 });`, and in the literal after `deleted: null,` add `...(born.length > 0 ? { periods: [...born] } : {}),`.
  - `ticket.transitioned` arm, before `return {`: 
    ```ts
    const reset = p.cause?.kind === 'reopened-by-flow';
    const round = (state.rounds ?? 1) + (reset ? 1 : 0);
    // A not-taken move places nobody in work (PS-8): it opens and closes nothing.
    const periods = p.cause?.kind === 'branch-not-taken' ? (state.periods ?? [])
      : foldWorkPeriods(state.periods ?? [], { toStateId: p.to, toCategory: category, at: env.serverTime, wasTerminal: state.stateCategory === 'terminal', round });
    ```
    wrap the existing object: `return setPeriods({ ...state, /* existing members */ ...(reset ? { rounds: round } : {}) }, periods);`. T5's fold of the Decision's own reset (`outcome`) stays where T8 put it.
  - `ticket.workflow_rebound` arm: `return setPeriods({ ...state, workflowId: ..., stateCategory: category }, foldWorkPeriods(state.periods ?? [], { toStateId: p.toStateId, toCategory: category, at: env.serverTime, wasTerminal: state.stateCategory === 'terminal', round: state.rounds ?? 1 }));`
  - Beside `TICKET_EVENT_TYPES`: 
    ```ts
    /** Bump when a retroactive member joins `TicketState`: a snapshot written under an older value is restated (T9). 2 = work periods and rounds. */
    export const TICKET_FOLD_VERSION = 2;
    ```
  - `index.ts` after `:39`: `export * from './flow/derive.js'; export * from './flow/periods.js';`
  Run the Step 2 command, then `pnpm --filter @gisik-nokma/domain build`. Expected: PASS 29.167, 29.168, 29.350-29.353. Commit: `wtg2 T9: fold work periods and rounds in the shared reducer`.

- [ ] **Step 4: RED projection tests (29.169, 29.170, 29.359)**

  `apps/server/test/projections/tickets-periods.test.ts`: copy `tickets-rank.test.ts:1-98` (imports, `createTestDatabase`, the `workflow.defined` with `doing`/`done` states plus a `ticket-type.defined`, `rowFor`, `columnsOf`), and add to the workflow `{ id: 'done', name: 'Done', category: 'terminal' }` and a transition `{ from: '*', to: 'done', rules: [] }` (and to `todo`). `makeCommitted` takes `serverTime` through `...partial`. A helper `step(ticketId, type, payload, n)` = `makeCommitted({ workspaceId: WS, actorId, entity: {kind:'ticket', id}, type, payload, serverTime: \`2026-09-0${n}T10:00:00.000Z\` })`.
  - **29.169:** apply created (n=1, `start: 'focus'`), `ticket.transitioned {to:'doing'}` (2), `{to:'done'}` (3), `ticket.closed` (4), `ticket.reopened` (5), `{to:'doing'}` (6). Row: `row.periods` `toEqual([{start:'2026-09-02T10:00:00.000Z', end:'2026-09-03T10:00:00.000Z', pass:1}, {start:'2026-09-06T10:00:00.000Z', end:null, pass:1}])`; `row.started_at.toISOString()` is the first start; `row.ended_at` is `null` (the second period is open); `row.rounds` 1; `row.closed_cause` null. `rowToTicketState(row).periods` equals `row.periods`; for a never-started ticket `'periods' in rowToTicketState(row)` is `false` and `'rounds' in` is `false` (control). Then close it with a not-taken cause (`ticket.transitioned {to:'done', cause: NOT_TAKEN}` + `ticket.closed {cause: NOT_TAKEN}` on a second ticket) and assert `row.closed_cause` `toEqual(NOT_TAKEN)` and `rowToTicketState(row).closed?.cause` `toEqual(NOT_TAKEN)`. Republish: apply a `workflow.defined` v2 for the same workflow id with the same states plus `{ id: 'review', name: 'Review', category: 'active' }`, then re-select the first ticket: `workflow_version` is 2 AND `periods` is unchanged.
  - **29.170:** `columnsOf` contains the five names; `SELECT column_default, is_nullable FROM information_schema.columns WHERE table_name='proj_tickets' AND column_name IN ('periods','rounds')` gives `'[]'::jsonb` / `1` and `NO`. Simulate a pre-migration row: `UPDATE proj_tickets SET periods = '[]', started_at = NULL, ended_at = NULL WHERE ticket_id = $1`; assert `rowToTicketState(row)` has no `periods`; `await rebuildProjection('proj_tickets', { pool: db.pool, projections: buildProjectionRegistry() })` (imported as at the top of `proj-rollups.test.ts`); the row has its two periods back. Control: a ticket created after the migration is correct with no rebuild.
  - **29.359:** after the 29.169 world plus a flow-reset ticket (created, `doing`, `done`, `closed`, `reopened {cause: RESET}`, `{to:'todo', cause: RESET}`, `{to:'doing'}` so `rounds` is 2): `const report = await verifyProjections({ pool: db.pool, projections: buildProjectionRegistry() }); expect(report.clean, formatReport(report)).toBe(true);` (imports from `../../src/tools/verify-projections.js`). Control: `UPDATE proj_tickets SET periods = '[]' WHERE ticket_id = $1`, run again, `expect(report.clean).toBe(false)`, restore.
  Run: `slot-run.sh wtg2-t9-proj -- pnpm --filter @gisik-nokma/server exec vitest run test/projections/tickets-periods.test.ts --maxWorkers=2 > /tmp/wtg2-t9-proj.log 2>&1; tail -30 /tmp/wtg2-t9-proj.log`. Expected: FAIL (`column "periods" does not exist`). Commit: `wtg2 T9: RED projection cases for periods`.

- [ ] **Step 5: Migration and projection**

  `apps/server/migrations/1792100200000_proj-tickets-periods.sql` (before writing, `git fetch` and confirm no live tip holds a larger stamp; T1 owns the renumbering rule):
  ```sql
  -- Up Migration
  -- Work periods (Workflow and Timeline graphs, WP-1). `periods` is the fold; `started_at` and `ended_at` are DERIVED from it by the projection
  -- (the first period's start, the last period's end while closed) for the sweep and the index. Existing rows read as no periods until
  -- `rebuild:projection proj_tickets` replays the ledger. `snapshots.fold_version` marks which fold wrote a snapshot (1 = before periods).
  ALTER TABLE proj_tickets
    ADD COLUMN started_at timestamptz NULL,
    ADD COLUMN ended_at timestamptz NULL,
    ADD COLUMN periods jsonb NOT NULL DEFAULT '[]',
    ADD COLUMN rounds integer NOT NULL DEFAULT 1 CHECK (rounds >= 1),
    ADD COLUMN closed_cause jsonb NULL;
  ALTER TABLE snapshots ADD COLUMN fold_version integer NOT NULL DEFAULT 1;

  -- Down Migration
  ALTER TABLE snapshots DROP COLUMN fold_version;
  ALTER TABLE proj_tickets
    DROP COLUMN closed_cause, DROP COLUMN rounds, DROP COLUMN periods, DROP COLUMN ended_at, DROP COLUMN started_at;
  ```
  `projections/tickets.ts`: `TicketRow` gains `started_at: Date | null; ended_at: Date | null; periods: WorkPeriod[]; rounds: number; closed_cause: FlowCause | null;`. In `rowToTicketState` replace the `closed:` member and append two spreads:
  ```ts
  closed: row.closed_at === null || row.closed_by === null ? null
    : { actorId: row.closed_by, at: row.closed_at.toISOString(), ...(row.closed_cause === null ? {} : { cause: row.closed_cause }) },
  // ... existing rank, reopenedAt, deleted ...
  ...(row.periods.length > 0 ? { periods: row.periods } : {}),
  ...(row.rounds > 1 ? { rounds: row.rounds } : {}),
  ```
  (`started_at`/`ended_at` are NOT read back: they are derived.) In `upsertTicket` add the five columns after the last existing one in the INSERT list, the VALUES list and the DO UPDATE list. On the bare tip the last placeholder is `$19`, so the new ones are `$20`-`$24`; if T2 or T5 merged first, shift by their count (a wrong count fails Postgres with "INSERT has more expressions than target columns", which the Step 4 run shows):
  ```ts
  startedAtOf(next), endedAtOf(next), JSON.stringify(next.periods ?? []), ticketRound(next), next.closed?.cause === undefined ? null : JSON.stringify(next.closed.cause),
  ```
  with `started_at = EXCLUDED.started_at, ended_at = EXCLUDED.ended_at, periods = EXCLUDED.periods, rounds = EXCLUDED.rounds, closed_cause = EXCLUDED.closed_cause` in the update list (a reopen folds `closed: null`, so the DO UPDATE clears the cause exactly as it clears `closed_at`, `upsertTicket` comment `:329-334`). Then `grep -rn "rowToTicketState(" apps/server/test` and give any hand-built `TicketRow` literal the new members (typecheck lists them). Run the Step 4 command. Expected: PASS 29.169, 29.170, 29.359. Commit: `wtg2 T9: project periods, rounds and the close cause`.

- [ ] **Step 6: RED then GREEN snapshot fold version (29.355)**

  `apps/server/test/sync/snapshot-fold-version.test.ts`: copy `snapshot-writer.test.ts:1-98` (ledger-only seeding with `insertEvent` + `makeCommitted`, `wfBasic`, the type/workflow entities). Seed created (`serverTime` S1), `ticket.transitioned {to:'doing'}` (S2, seq 2). Write the snapshot of `fullFold()` at seq 2 with `writeSnapshot`, then `UPDATE snapshots SET state = state - 'periods', fold_version = 1 WHERE entity_id = $1` (a pre-periods row). Append `{to:'done'}` (S3). `await runSnapshotPass(db.pool, { minEvents: 20 })` (the head is one event past the snapshot, below the threshold, so only the stale row makes it due). Expect `readLatestSnapshot(db.pool, 'ticket', TICKET)` to have `seq` 3, `foldVersion` 2 and `state.periods` `[{start: S2, end: S3, pass: 1}]` (S2 sits BELOW the old snapshot's seq, so only a full fold recovers it). Control in the same `it`: a second ticket whose snapshot is `fold_version` 2 and carries a marker `periods: [{start:'M', end:null, pass:1}]` resumes (its pass result has `start: 'M'`, `end: S3`) and `readEntityEvents` is called with `afterSeq` = its snapshot seq (use the file's `recording()` proxy). Run: `slot-run.sh wtg2-t9-snap -- pnpm --filter @gisik-nokma/server exec vitest run test/sync/snapshot-fold-version.test.ts test/sync/snapshot-writer.test.ts test/sync/snapshot-refresh.test.ts test/snapshot-store.test.ts --maxWorkers=2 > /tmp/wtg2-t9-snap.log 2>&1; tail -30 /tmp/wtg2-t9-snap.log`. Expected: FAIL (`foldVersion` undefined). Implement:
  - `snapshot-store.ts`: `export type Snapshot = {...existing, foldVersion: number}`, `export type SnapshotInput = Omit<Snapshot, 'foldVersion'>`; `writeSnapshot(client, snapshot: SnapshotInput)` and `overwriteSnapshot` insert `fold_version` as `$6` = `TICKET_FOLD_VERSION` (the `DO UPDATE SET` also sets `fold_version = excluded.fold_version`); `readLatestSnapshot` selects `fold_version` and returns `foldVersion: row.fold_version`.
  - `snapshot-writer.ts` `foldTicketHead`: after `readLatestSnapshot`, `const stale = stored !== null && stored.foldVersion < TICKET_FOLD_VERSION; const previous = stale ? null : stored;` (everything below uses `previous`), and return `restated: stale` in `FoldedTicketHead`. A stale row is as good as none for FOLDING: its `provenance` is recomputed from the full tail.
  - `runSnapshotPass`: replace the grouped sub-select with the latest row per ticket and add the stale arm:
    ```sql
    SELECT e.workspace_id, e.entity_id FROM events e
      LEFT JOIN (SELECT DISTINCT ON (entity_id) entity_id, seq AS snap_seq, fold_version
                   FROM snapshots WHERE entity_kind = 'ticket' ORDER BY entity_id, seq DESC) s ON s.entity_id = e.entity_id
     WHERE e.entity_kind = 'ticket'
     GROUP BY e.workspace_id, e.entity_id, s.snap_seq, s.fold_version
    HAVING MAX(e.seq) - COALESCE(s.snap_seq, 0) >= $1 OR s.fold_version < $2
     ORDER BY e.entity_id
    ```
    params `[minEvents, TICKET_FOLD_VERSION]`. (`DISTINCT ON` matters: superseded rows are never deleted, `snapshot-writer.ts:179`, so a plain `fold_version < $2` over all rows would keep a restated ticket due forever.) Write with `head.restated ? overwriteSnapshot : writeSnapshot` (the restate may land on the seq a stale row already holds; the plain INSERT's pkey collision stays reserved for case 12.89's overlapping passes).
  - `startSnapshotWriter`: option `immediate?: boolean`; when true, run one pass before the first interval tick. `index.ts:297` passes `immediate: true`, so a deploy restates within seconds and not one interval later.
  - `sync-routes.ts` `bootstrapTicket` keeps serving a stale row until the pass restates it (serving `null` would send the replica the full history, which the `snapshot-refresh.ts` docblock shows can name a dropped state). The window is one pass; Review Focus carries it.
  Re-run. Expected: PASS 29.355 and the three existing files. Commit: `wtg2 T9: restate snapshots written before periods existed`.

- [ ] **Step 7: RED then GREEN replica (29.354, 29.360)**

  `packages/sync-client/test/replica-periods.test.ts` (harness `purge-world.ts`: `freshReplica`, `apply`, `envelope`, `queue`, `claim`, `ticketCreated`, `bootstrap`, `WS`, `TIME`):
  ```ts
  import { buildPendingOverlay } from '../src/precheck/local-context.js';
  it('29.354 a pending event leaves periods unchanged; the accepted one records them', async () => {
    const { storage, replica } = await freshReplica();
    const A = newUlid();
    await apply(replica, [ticketCreated(A)]);
    await queue(storage, claim({ kind: 'ticket', id: A }, 'ticket.transitioned', { to: 'done' }));
    const pending = (await buildPendingOverlay({ storage, replica })).states.get(A)!;
    expect(pending.stateId).toBe('done');
    expect('periods' in pending).toBe(false);
    await apply(replica, [envelope({ kind: 'ticket', id: A }, 'ticket.transitioned', { to: 'done' })]); // control
    expect((await replica.getTicket(A))!.confirmed!.periods).toEqual([{ start: TIME, end: TIME, pass: 1 }]);
  });
  it('29.360 schema 5 owes a pull per held ticket; a fresh replica owes none', async () => {
    expect(LOCAL_SCHEMA_VERSION).toBe(5);
    const { storage, replica } = await freshReplica();
    const A = newUlid(); const B = newUlid();
    await apply(replica, [ticketCreated(A), ticketCreated(B)]);
    expect(await replica.listPendingPulls(WS)).toEqual([]);
    await storage.run("UPDATE meta SET value = '4' WHERE key = 'schema_version'", []);
    const reopened = await createReplica({ storage });
    expect((await reopened.listPendingPulls(WS)).map((t) => t.id).sort()).toEqual([A, B].sort());
    for (const id of [A, B]) await reopened.clearPendingPull(WS, id);
    expect(await (await createReplica({ storage })).listPendingPulls(WS)).toEqual([]); // control
    const held = (await reopened.getTicket(A))!.confirmed!;
    await reopened.loadTicketBootstrap({
      workspaceId: WS,
      definitions: [],
      ticket: { ticketId: A, snapshot: { seq: 1, state: { ...held, periods: [{ start: TIME, end: null, pass: 1 }] }, provenance: null }, events: [] },
    });
    expect((await reopened.getTicket(A))!.confirmed!.periods).toEqual([{ start: TIME, end: null, pass: 1 }]);
  });
  ```
  (`TicketBootstrap` is `{workspaceId, definitions, ticket: BootstrapTicket}`, `replica.ts:111-120`; `loadTicketBootstrap` writes the snapshot and calls `refoldTicket`, `replica.ts:1451-1474`, so the held ticket's confirmed state becomes the snapshot's.) Expected FAIL. Implement: `schema.ts:21` `LOCAL_SCHEMA_VERSION = 5` with a docblock line "Raised to 5 by Workflow and Timeline graphs T9: no DDL; `createReplica` re-pulls every held ticket because its stored snapshot predates work periods"; `replica.ts`: before `await migrateLocal(storage)` (`:414`) read the prior version without assuming `meta` exists,
  ```ts
  const metaExists = (await storage.all("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'meta'", [])).length > 0;
  const priorVersion = metaExists ? Number((await storage.all("SELECT value FROM meta WHERE key = 'schema_version'", []))[0]?.['value'] ?? NaN) : NaN;
  ```
  and just before `return replica` (`:2152`):
  ```ts
  if (priorVersion < 5) {
    const held = await storage.all('SELECT ticket_id, workspace_id FROM tickets', []);
    for (const ws of new Set(held.map((r) => r['workspace_id'] as string))) {
      await replica.addPendingPulls(ws, held.filter((r) => r['workspace_id'] === ws).map((r) => ({ id: r['ticket_id'] as string, headSeq: 0 })));
    }
  }
  ```
  (`NaN < 5` is false, so a fresh file owes nothing.) `local-context.ts:150-152`: `const before = states.get(ticketId); const next = foldTicketEvent(before, env, localDeps); if (next !== undefined) states.set(ticketId, keepConfirmedPeriods(before, next));`. Update the two assertions in `replica-comment-changes.test.ts`. Run the file plus `slot-run.sh wtg2-t9-sync -- pnpm --filter @gisik-nokma/sync-client exec vitest run --maxWorkers=2 > /tmp/wtg2-t9-sync.log 2>&1; tail -30 /tmp/wtg2-t9-sync.log`. Expected: PASS 29.354, 29.360. Commit: `wtg2 T9: keep periods off pending folds and re-pull held tickets on schema 5`.

- [ ] **Step 8: Wide runs, bundle, ledger, flip, push**
  1. `pnpm --filter @gisik-nokma/mobile exec node scripts/generate-editor-html.mjs --check`; if red, run without `--check` and commit `editor-html.generated.ts` (contract decision 12).
  2. Build domain, rule-engine and app-core, then the whole server and app-core suites (`ticket-state` and `local-context` are shared by every door: the dual-client rig `apps/server/test/dual-client/` must stay green).
  3. `node scripts/check-case-ids.mjs && pnpm check:citations`; flip the twelve cases ✅ in the SAME commit as their tests; re-read the Features bullets against the code.
  4. Push. DONE + REVIEW (NEEDS: T8 merged; owner runs `rebuild:projection proj_tickets` right after the migration deploys and pastes its output into HANDOFF).

**Mutations** (run each on the green branch, expect the named red, restore):

| Case | Mutation | Expected red |
|---|---|---|
| 29.167 | open a period in the `ticket.reopened` arm | the reopen path |
| 29.350 | close on any move into an open-category state | the `review` -> `todo` assertion |
| 29.352 | also count `ticket.reopened` with the cause | `ticketRound(reset)` |
| 29.353 | fold periods for a `branch-not-taken` move | `'periods' in nt` |
| 29.169 | omit `periods` from `rowToTicketState` | the republish assertion |
| 29.359 | take the workflow as of NOW in the period fold's category | the verifier reports drift after a republish |
| 29.355 | ignore `foldVersion` | the stale case |
| 29.355 | plain `fold_version < $2` over all snapshot rows | the restated ticket is due again (add a second pass assertion) |
| 29.360 | write `headSeq` without owing for `priorVersion` NaN | the fresh-replica control |

---

### Task 10: Flow analysis: Start/End, back edges, order, the effective graph, `FlowNode` (cases 29.180-29.186)

**Branch:** `task/wtg2-flow-analysis` from `origin/release/workflow-graph`; PR `--base release/workflow-graph`. **Needs:** T2 (`normaliseLinkLabel`, `DECISION_TYPE_ID`), T4 (`claimedEstimate`, `claimedWaitForAll`), T5 (`TicketState.outcome`, `TicketState.passes`, `PassRecord`), T9 (`flow/derive.ts`, `TicketState.periods`, `TicketState.rounds`) and T8 (`TicketState.closed.cause`, which T9's `resolutionOf` reads) merged. This task is pure domain code: no server, no database, no clock.

**Files:**
- Create: `packages/domain/src/flow/types.ts`, `analysis.ts`, `graph.ts`, `node.ts`, `index.ts`; `packages/domain/test/flow/fixtures.ts`, `analysis.test.ts`, `graph.test.ts`, `node.test.ts`, `clock-free.test.ts`
- Modify: `packages/domain/src/index.ts` (T9 added `export * from './flow/derive.js'; export * from './flow/periods.js';` after `:39`, and T8 added `export * from './flow/causes.js';`: replace every `./flow/*.js` line with the single `export * from './flow/index.js';`)
- Catalogue: `test-cases/29-workflow-timeline-graphs.md` under `<!-- wtg-part2-model T10 -->`; `Features.md` §26 under `<!-- wtg-part2-model T10 bullet -->`

**Interfaces:**
- **Consumes:** `TicketState` (`packages/domain/src/entity-state.ts`, with T5's `outcome?`, `passes?`, T9's `periods?`, `rounds?`, T8's `closed.cause?`); `WorkflowDef` (`workflow.ts:100-108`); `IST_DAY_REGEX` (`ist-day.ts:33`); `normaliseLinkLabel` (T2, `link-label.ts`); `DECISION_TYPE_ID`, `claimedEstimate`, `claimedWaitForAll` (T2/T4, `ticket-types.ts`); `hasStarted`, `resolutionOf`, `ticketRound`, `NotTakenResolution` (T9, `flow/derive.ts`).
- **Produces** (all re-exported from `@gisik-nokma/domain`, shapes pinned by the plan header): `type FlowEdge = {sourceId; targetId; label: string | null}`, `edgeKey(e): string`, `type FlowNode`, `type FlowAnalysis = {starts; ends; backEdges: ReadonlySet<string>; order}`, `analyzeFlow(nodes: ReadonlyArray<Pick<FlowNode,'id'|'explicitStart'|'explicitDue'>>, edges: readonly FlowEdge[]): FlowAnalysis`, `sameLabel`, `forwardEdges(edges, analysis): FlowEdge[]`, `effectiveEdges(nodes, edges): FlowEdge[]`, `liveSet(nodes, edges, analysis): Set<string>`, `loopBody(backEdge, edges, analysis): Set<string>`, `branchOf(decisionId, label: string | null, edges, analysis): Set<string>`, `flowNodeOf(state, wf, flags?): FlowNode`. T11, T13, T15 and the server read (T12) import these and nothing else about a flow's shape.

**Why one `FlowNode` and one door (`flowNodeOf`).** The planner, the promoter, the settle plan and the graph all ask the same questions of a ticket ("started?", "Not taken?", "estimate?"). If each read `TicketState.fields` itself, the server read, the replica and the tests could disagree about what "started" means. So every derived member comes from a helper that already exists (`hasStarted`, `resolutionOf`, `ticketRound`, `claimedEstimate`, `claimedWaitForAll`; T4 and T9), and `flowNodeOf` is the only function that builds a node from a state. `draft` is a caller flag because the Drafts task keeps the author on `TicketState.draft` and the read (T12) knows which drafts are the viewer's own; `trashed` defaults to the state's own soft-delete flag.

**Why `firstTerminalStateId` and `initialStateId` ride on the node.** T15 must file "Not taken" into the first-declared terminal state (planner ruling 8) and a loop reset into the initial state; both are workflow facts, and the pure code has no workflow. They are copied onto the node once, in `flowNodeOf`.

**Why the closing edge of a cycle depends on ULID order (a finding the cases pin, FL-3).** FL-3 says the search starts at the Starts in ascending id. The mockup draws its loop as `GN-146 -> GN-143`, but DFS closes a cycle at whichever edge points at the node on the stack, so with creation-order ids (`GN-142` before `GN-143`) the same graph closes at `143 -> 144` instead. Case 29.181 builds the fixture both ways (`mockup(order)` in `fixtures.ts`): the default order puts `143` before `142` to give the mockup's picture; `NUMERIC_ORDER` is the control that shows the closing edge moving. A loop is therefore a property of the ids as much as of the links; T11 and T15 only ever ask `analysis.backEdges`, never re-derive it.

**Why the search is iterative.** A 300-node chain (the FL-2 cap) is a 300-deep recursion; the explicit stack keeps the answer independent of the engine's stack size.

**Why edges to unknown ids are dropped, not resurrected.** A hidden ticket is a hole (FL-1): the read (T12) drops its links, and `analyzeFlow` ignores any edge naming an id outside `nodes` so a caller that passes raw link rows cannot make the hidden node reappear as a Start or an End. Case 29.180 pins it.

**Why `liveSet` finds roots in the WHOLE flow and walks the effective graph (PS-1).** A ticket cut off by a Decision's choice has no incoming edge in the effective graph; if roots were found there it would become a root and so be "live for free". Roots are the tickets with no incoming non-back edge in the full flow; the walk then follows effective, non-back edges. Case 29.183 pins it with the ticket `z` that only the un-chosen branch leads to.

- [ ] **Step 1: Case lines**

  Under `<!-- wtg-part2-model T10 -->` in `test-cases/29-workflow-timeline-graphs.md`, all ❌:
  - `- ❌ **29.180 — analyzeFlow names the Starts (no incoming leads_to) and Ends (no outgoing) in ascending id: the mockup's 13-node flow has GN-140 and GN-152; two Starts feeding one node both appear; a pure two-ticket loop has neither; a link to an id that is not in the node list is ignored;** control: a feeder into the loop makes the feeder the Start. Mutation: let an unknown id into the known set → the hole case gives the hidden node an End.`
  - `- ❌ **29.181 — back edges are found by a depth-first search from the Starts in ascending id with out-edges in ascending target id, and an edge into a node on the stack closes the loop: the mockup gives 146>143, 151>141, 151>149; a pure cycle closes at its larger-id edge; a self-link closes on itself;** control: the same graph with creation-order ids closes at 143>144 instead (the id order decides). Mutation: do not sort the out-edges, or start the search at the smallest id instead of at the Starts → the mockup or the feeder case differs.`
  - `- ❌ **29.182 — flow order is Kahn's order over the edges without back edges, ties by (explicit start day else due day, id) with an undated node last;** control: a later start day than the other branch's due day flips the pair, and with no days the id decides. Mutation: sort undated nodes first → the dated-beats-undated row fails.`
  - `- ❌ **29.183 — the effective graph drops, for a Decision with an outcome, its outgoing edges whose label differs (compared after trim and case folding), keeps every other edge, and the live set still contains the shared tail and not a ticket reachable only through the dropped branch;** control: an undecided Decision cuts nothing, and an outcome naming no edge cuts every branch. Mutation: compare labels strictly, or find the roots in the effective graph → the case-folded row or the `z` row fails.`
  - `- ❌ **29.184 — a loop body is the back edge's target, its Decision and every ticket on a forward path between them (not a ticket the walk merely passes through), and a branch is what an edge leads to without passing back through the Decision, a shared tail being in both;** control: an unknown label gives an empty branch. Mutation: return everything reachable from the target as the body, or let the branch walk pass through the Decision → the "No" loop and the branch rows fail.`
  - `- ❌ **29.185 — flowNodeOf builds the node from the state and the workflow: a bare ticket reads quiet defaults, a Decision with passes, periods, a Not-taken close and every claim reads through its helper, and a cleared, malformed or out-of-range claim reads as null / false;** control: 365 days is accepted, 366 and 1.5 are not. Mutation: read waitForAll as "any value present" or the estimate as "any number" → the malformed-claim row fails.`
  - `- ❌ **29.186 — the flow directory is pure: analysis does not mutate its input and answers the same for any input order, and no file under packages/domain/src/flow reads the clock or the device zone;** control: the scanner flags a planted new Date() and getFullYear(), and passes getUTCFullYear(). Mutation: add a clock read to a flow file → the scan names the file.`

  Commit: `wtg2 T10: case lines for flow analysis`.

- [ ] **Step 2: RED tests**

  The fixtures are shared: T11 and T15 import `test/flow/fixtures.ts` and do not redefine it. `fixtures.ts` follows the style of `packages/domain/test/ist-day.test.ts` (plain functions, no `beforeEach`); the directory is new, with `packages/domain/test/events/` as the precedent for a test subdirectory (the vitest include is `test/**/*.test.ts`, `packages/domain/vitest.config.ts`).

  `packages/domain/test/flow/fixtures.ts`:
  ```ts
  import type { FlowEdge, FlowNode } from '../../src/index.js';

  /** A valid-shaped ULID whose sort order is `n`: `uid(3) < uid(12)`. Flow code only compares ids, but the settle events need the real shape. */
  export function uid(n: number): string {
    return `01J00000000000000000000${String(n).padStart(3, '0')}`;
  }

  /** A node with every field at its quiet default (an open To do task with nothing claimed). Override what the case is about. */
  export function fnode(id: string, over: Partial<FlowNode> = {}): FlowNode {
    return {
      id,
      typeId: 'task',
      stateId: 'todo',
      category: 'open',
      closed: false,
      trashed: false,
      draft: false,
      parentId: null,
      isDecision: false,
      outcome: null,
      passes: [],
      notTaken: null,
      waitForAll: false,
      started: false,
      rounds: 1,
      periods: [],
      explicitStart: null,
      explicitDue: null,
      estimate: null,
      reworkEstimate: null,
      initialStateId: 'todo',
      firstTerminalStateId: 'done',
      ...over,
    };
  }

  export const edge = (sourceId: string, targetId: string, label: string | null = null): FlowEdge => ({ sourceId, targetId, label });

  /** A Decision node. */
  export const decision = (id: string, over: Partial<FlowNode> = {}): FlowNode => fnode(id, { typeId: 'decision', isDecision: true, ...over });

  /**
   * The mockup's 13-node flow (`wtg-preview/Main.dc.html`, NODES / EDGES), keyed by its ticket numbers.
   * Decisions: 144 (Yes -> 147, No -> 145), 148 (No -> 146, Yes -> 149), 151 (Yes -> 152, Need more info -> 149, No -> 141).
   *
   * The ids are assigned in `order`. The DEFAULT order is not the numeric one: GN-143 sorts before GN-142,
   * because FL-3 picks the loop-closing edge of a cycle by id order and the mockup draws the loop as 146 -> 143.
   * With the numeric order (creation order) the same graph closes its cycle at 143 -> 144 instead (case 29.181's control).
   */
  export const MOCKUP_ORDER = ['140', '141', '143', '142', '144', '145', '146', '147', '148', '149', '150', '151', '152'] as const;
  export const NUMERIC_ORDER = ['140', '141', '142', '143', '144', '145', '146', '147', '148', '149', '150', '151', '152'] as const;
  export type MockupKey = (typeof MOCKUP_ORDER)[number];

  export type Mockup = {
    ids: Record<MockupKey, string>;
    nodes: (over?: Partial<Record<MockupKey, Partial<FlowNode>>>) => FlowNode[];
    edges: () => FlowEdge[];
    /** Ticket numbers of a set of ids, sorted, for readable expectations. */
    keys: (ids: Iterable<string>) => string[];
  };

  export function mockup(order: readonly MockupKey[] = MOCKUP_ORDER): Mockup {
    const ids = Object.fromEntries(order.map((k, i) => [k, uid(i + 1)])) as Record<MockupKey, string>;
    const decisions = new Set<MockupKey>(['144', '148', '151']);
    const e = (from: MockupKey, to: MockupKey, label: string | null = null): FlowEdge => edge(ids[from], ids[to], label);
    const byId = new Map(Object.entries(ids).map(([k, id]) => [id, k] as const));
    return {
      ids,
      nodes: (over = {}) => order.map((k) => (decisions.has(k) ? decision(ids[k], over[k]) : fnode(ids[k], over[k]))),
      edges: () => [
        e('140', '141'), e('141', '142'), e('141', '143'), e('142', '144'), e('143', '144'),
        e('144', '147', 'Yes'), e('144', '145', 'No'), e('145', '146'), e('146', '143'),
        e('147', '148'), e('148', '146', 'No'), e('148', '149', 'Yes'), e('149', '150'), e('150', '151'),
        e('151', '152', 'Yes'), e('151', '149', 'Need more info'), e('151', '141', 'No'),
      ],
      keys: (set) => [...set].map((id) => byId.get(id) ?? id).sort(),
    };
  }

  export const M0 = mockup();
  export const M = M0.ids;
  export const mockupNodes = M0.nodes;
  export const mockupEdges = M0.edges;
  export const keysOf = M0.keys;
  ```

  `packages/domain/test/flow/analysis.test.ts` (cases 29.180, 29.181, 29.182, 29.186 purity):
  ```ts
  import { describe, expect, it } from 'vitest';
  import { analyzeFlow, edgeKey } from '../../src/index.js';
  import { NUMERIC_ORDER, edge, fnode, keysOf, mockup, mockupEdges, mockupNodes, uid } from './fixtures.js';

  const A = uid(1);
  const B = uid(2);
  const C = uid(3);
  const D = uid(4);
  const keysOfEdges = (set: ReadonlySet<string>, keys: (ids: Iterable<string>) => string[] = keysOf): string[] =>
    [...set].map((k) => k.split('>').map((id) => keys([id])[0] ?? id).join('>')).sort();

  describe('29.180 Start and End nodes', () => {
    it('29.180 the mockup flow has one Start (GN-140) and one End (GN-152); a node in a pure loop has neither; edges to a hidden id are ignored', () => {
      const a = analyzeFlow(mockupNodes(), mockupEdges());
      expect(keysOf(a.starts)).toEqual(['140']);
      expect(keysOf(a.ends)).toEqual(['152']);

      // two starts feeding one node
      const two = analyzeFlow([fnode(A), fnode(B), fnode(C)], [edge(A, C), edge(B, C)]);
      expect(two.starts).toEqual([A, B]);
      expect(two.ends).toEqual([C]);

      // a pure two-ticket loop: no Start, no End. CONTROL: a feeder makes its target a non-Start but the feeder a Start.
      const loop = analyzeFlow([fnode(A), fnode(B)], [edge(A, B), edge(B, A)]);
      expect(loop.starts).toEqual([]);
      expect(loop.ends).toEqual([]);
      const fed = analyzeFlow([fnode(A), fnode(B), fnode(C)], [edge(A, B), edge(B, A), edge(C, A)]);
      expect(fed.starts).toEqual([C]);

      // a link whose other end is a hole (not in `nodes`) is dropped, not resurrected as a node
      const hole = analyzeFlow([fnode(A), fnode(B)], [edge(A, B), edge(B, uid(99))]);
      expect(hole.ends).toEqual([B]);
      expect(hole.order).toEqual([A, B]);
    });
  });

  describe('29.181 back edges', () => {
    it('29.181 DFS from the Starts in ascending id, out-edges ascending: the mockup loops are 146>143, 151>141, 151>149; the id order decides which edge of a cycle closes it', () => {
      const a = analyzeFlow(mockupNodes(), mockupEdges());
      expect(keysOfEdges(a.backEdges)).toEqual(['146>143', '151>141', '151>149']);

      // CONTROL: in creation order (GN-142 sorts before GN-143) the same graph closes its cycle at 143>144 instead.
      const natural = mockup(NUMERIC_ORDER);
      const flipped = analyzeFlow(natural.nodes(), natural.edges());
      expect(keysOfEdges(flipped.backEdges, natural.keys)).toEqual(['143>144', '151>141', '151>149']);

      // a pure cycle starts its search at the smallest id; with a Start in front the same pair closes at B>A
      const pure = analyzeFlow([fnode(A), fnode(B)], [edge(A, B), edge(B, A)]);
      expect([...pure.backEdges]).toEqual([edgeKey({ sourceId: B, targetId: A })]);
      const swappedPure = analyzeFlow([fnode(A), fnode(B)], [edge(B, A), edge(A, B)]);
      expect([...swappedPure.backEdges]).toEqual([edgeKey({ sourceId: B, targetId: A })]);
      // the search enters at the Start, not at the smallest id: a(1) <-> b(2) with the feeder f(3) -> b closes at a>b
      const feeder = analyzeFlow([fnode(A), fnode(B), fnode(C)], [edge(A, B), edge(B, A), edge(C, B)]);
      expect([...feeder.backEdges]).toEqual([edgeKey({ sourceId: A, targetId: B })]);
      // a self-link closes on itself
      expect([...analyzeFlow([fnode(A)], [edge(A, A)]).backEdges]).toEqual([`${A}>${A}`]);
    });
  });

  describe('29.182 flow order', () => {
    it('29.182 Kahn over the edges without back edges; ready ties by (explicit sort day, id), a node with no day sorts last', () => {
      const full = analyzeFlow(mockupNodes(), mockupEdges());
      expect(keysOf(full.order).length).toBe(13);
      expect(full.order.map((id) => keysOf([id])[0])).toEqual(['140', '141', '143', '142', '144', '145', '147', '148', '146', '149', '150', '151', '152']);

      // diamond a -> {b, c} -> d. b has only a due day, c a start day one later: start-else-due puts b first.
      const diamond = [edge(A, B), edge(A, C), edge(B, D), edge(C, D)];
      const dated = [fnode(A), fnode(B, { explicitDue: '2026-10-02' }), fnode(C, { explicitStart: '2026-10-03' }), fnode(D)];
      expect(analyzeFlow(dated, diamond).order).toEqual([A, B, C, D]);
      // CONTROL: start earlier than b's due flips them, and with no days at all the id decides.
      const flipped = [fnode(A), fnode(B, { explicitDue: '2026-10-05' }), fnode(C, { explicitStart: '2026-10-03' }), fnode(D)];
      expect(analyzeFlow(flipped, diamond).order).toEqual([A, C, B, D]);
      expect(analyzeFlow([fnode(A), fnode(B), fnode(C), fnode(D)], diamond).order).toEqual([A, B, C, D]);
      // a dated node beats an undated one even when the undated id is smaller
      const undatedFirst = [fnode(A), fnode(B), fnode(C, { explicitDue: '2026-10-03' }), fnode(D)];
      expect(analyzeFlow(undatedFirst, diamond).order).toEqual([A, C, B, D]);
      // a loop is not an ordering constraint: the back edge is left out
      expect(analyzeFlow([fnode(A), fnode(B)], [edge(A, B), edge(B, A)]).order).toEqual([A, B]);
    });
  });

  describe('29.186 purity', () => {
    it('29.186 analysis does not mutate its inputs and gives the same answer for any input order', () => {
      const nodes = Object.freeze(mockupNodes().map((n) => Object.freeze(n)));
      const edges = Object.freeze(mockupEdges().map((e) => Object.freeze(e)));
      const a = analyzeFlow(nodes, edges);
      const b = analyzeFlow([...nodes].reverse(), [...edges].reverse());
      expect(b.order).toEqual(a.order);
      expect([...b.backEdges].sort()).toEqual([...a.backEdges].sort());
      expect(b.starts).toEqual(a.starts);
      expect(b.ends).toEqual(a.ends);
    });
  });
  ```

  `packages/domain/test/flow/graph.test.ts` (cases 29.183, 29.184):
  ```ts
  import { describe, expect, it } from 'vitest';
  import { analyzeFlow, branchOf, effectiveEdges, liveSet, loopBody, sameLabel } from '../../src/index.js';
  import { M, decision, edge, fnode, keysOf, mockupEdges, mockupNodes, uid } from './fixtures.js';

  const A = uid(1);
  const X = uid(2);
  const Y = uid(3);
  const T = uid(4);
  const Z = uid(5);

  /** a (Decision): Yes -> x, No -> y; x -> t; y -> t (the shared tail); y -> z (only behind No). */
  const tailEdges = [edge(A, X, 'Yes'), edge(A, Y, 'No'), edge(X, T), edge(Y, T), edge(Y, Z)];
  const tailNodes = (outcome: string | null) => [decision(A, { outcome }), fnode(X), fnode(Y), fnode(T), fnode(Z)];
  const live = (outcome: string | null) => {
    const nodes = tailNodes(outcome);
    return keysOfTail(liveSet(nodes, tailEdges, analyzeFlow(nodes, tailEdges)));
  };
  const NAME: Record<string, string> = { [A]: 'a', [X]: 'x', [Y]: 'y', [T]: 't', [Z]: 'z' };
  const keysOfTail = (set: Set<string>): string[] => [...set].map((id) => NAME[id] ?? id).sort();

  describe('29.183 the effective graph and the live set', () => {
    it('29.183 a chosen outcome cuts the other labels (compared after trim and case folding); the shared tail stays live; undecided cuts nothing', () => {
      expect(live('  YES ')).toEqual(['a', 't', 'x']);
      expect(live('no')).toEqual(['a', 't', 'y', 'z']);
      // CONTROL: no outcome yet, everything is live
      expect(live(null)).toEqual(['a', 't', 'x', 'y', 'z']);
      // an outcome that names no edge cuts every branch; the Decision itself stays live
      expect(live('Maybe')).toEqual(['a']);

      // the effective graph keeps the chosen edge and drops the other label's edge; everything else is untouched
      const decided = effectiveEdges(tailNodes('Yes'), tailEdges).map((e) => `${NAME[e.sourceId]}>${NAME[e.targetId]}`);
      expect(decided).toEqual(['a>x', 'x>t', 'y>t', 'y>z']);
      // an edge out of a Not-taken source stays in the effective graph (only a Decision's choice cuts edges)
      const notTaken = { kind: 'not-taken' as const, decisionTicketId: A, outcome: 'Yes', pass: 1 };
      const withNotTaken = [decision(A), fnode(X), fnode(Y, { notTaken }), fnode(T), fnode(Z)];
      expect(effectiveEdges(withNotTaken, tailEdges)).toHaveLength(5);

      // a ticket cut off by the choice must not become a root and so live for free (z has no other way in)
      expect(live('Yes')).not.toContain('z');

      // the mockup: GN-144 = "No" keeps 145 and 146 and cuts 147, and 148 to 152 behind it (they are only reachable through 147)
      const nodes = mockupNodes({ '144': { outcome: 'No' } });
      const edges = mockupEdges();
      expect(keysOf(liveSet(nodes, edges, analyzeFlow(nodes, edges)))).toEqual(['140', '141', '142', '143', '144', '145', '146']);
    });

    it('29.183 sameLabel: trim and case fold, an absent label equals only an absent label', () => {
      expect(sameLabel(' Need more INFO', 'need more info ')).toBe(true);
      expect(sameLabel('Yes', 'No')).toBe(false);
      expect(sameLabel(null, null)).toBe(true);
      expect(sameLabel(null, 'Yes')).toBe(false);
      expect(sameLabel('Yes', null)).toBe(false);
    });
  });

  describe('29.184 loop bodies and branches', () => {
    it('29.184 a loop body is the tickets on a forward path from the target to the Decision, never one the walk merely passes through', () => {
      const edges = mockupEdges();
      const nodes = mockupNodes();
      const analysis = analyzeFlow(nodes, edges);
      const back = (from: keyof typeof M, to: keyof typeof M) => ({ sourceId: M[from], targetId: M[to] });
      expect(keysOf(loopBody(back('151', '149'), edges, analysis))).toEqual(['149', '150', '151']);
      // 145 and 146 are reachable from 141 but never reach 151, so they are not in the "No" loop; 140 and 152 are outside it
      expect(keysOf(loopBody(back('151', '141'), edges, analysis))).toEqual(['141', '142', '143', '144', '147', '148', '149', '150', '151']);
      // a two-ticket loop: both
      const pair = [edge(A, X), edge(X, A)];
      const pairAnalysis = analyzeFlow([fnode(A), fnode(X)], pair);
      expect([...loopBody({ sourceId: X, targetId: A }, pair, pairAnalysis)].sort()).toEqual([A, X]);
      // a self-link: just the ticket
      expect([...loopBody({ sourceId: A, targetId: A }, [edge(A, A)], analyzeFlow([fnode(A)], [edge(A, A)]))]).toEqual([A]);
    });

    it('29.184 a branch is what an edge leads to without passing back through the Decision; a shared tail is on both', () => {
      const edges = mockupEdges();
      const analysis = analyzeFlow(mockupNodes(), edges);
      const yes = branchOf(M['144'], 'yes', edges, analysis);
      const no = branchOf(M['144'], 'No', edges, analysis);
      expect(keysOf(yes)).toEqual(['146', '147', '148', '149', '150', '151', '152']);
      expect(keysOf(no)).toEqual(['145', '146']);
      expect(yes.has(M['146']) && no.has(M['146'])).toBe(true); // GN-146 is the shared tail
      expect(branchOf(M['144'], 'Maybe', edges, analysis).size).toBe(0); // CONTROL: no such label, no branch
      expect(branchOf(M['151'], 'Need more info', edges, analysis).has(M['151'])).toBe(false); // never through the Decision itself
    });
  });
  ```

  `packages/domain/test/flow/node.test.ts` (case 29.185; `simpleKanbanWorkflowDef` is `simple-kanban.ts:64`, the same fixture the other domain tests use):
  ```ts
  import { describe, expect, it } from 'vitest';
  import { DECISION_TYPE_ID, flowNodeOf, newUlid, simpleKanbanWorkflowDef, type FieldClaim, type TicketState } from '../../src/index.js';

  const wf = simpleKanbanWorkflowDef(newUlid());

  const claim = (value: unknown): FieldClaim => ({
    value,
    actorId: newUlid(),
    clientTime: '2026-10-01T09:00:00.000Z',
    serverTime: '2026-10-01T09:00:01.000Z',
  });

  /** A bare To do task: nothing claimed, nothing folded. The control for every derived member. */
  function ticket(over: Partial<TicketState> = {}): TicketState {
    return {
      kind: 'ticket',
      id: newUlid(),
      workspaceId: newUlid(),
      projectId: newUlid(),
      typeId: 'task',
      parentId: null,
      workflowId: wf.id,
      workflowVersion: 1,
      stateId: 'todo',
      stateCategory: 'open',
      assigneeId: null,
      collaboratorIds: [],
      fields: {},
      transitions: [],
      ...over,
    };
  }

  describe('29.185 flowNodeOf', () => {
    it('29.185 a bare ticket gives a quiet node; every claim and fold the planner reads comes through its helper', () => {
      const bare = ticket();
      expect(flowNodeOf(bare, wf)).toEqual({
        id: bare.id, typeId: 'task', stateId: 'todo', category: 'open', closed: false, trashed: false, draft: false,
        parentId: null, isDecision: false, outcome: null, passes: [], notTaken: null, waitForAll: false, started: false,
        rounds: 1, periods: [], explicitStart: null, explicitDue: null, estimate: null, reworkEstimate: null,
        initialStateId: 'todo', firstTerminalStateId: 'done',
      });

      const decider = newUlid();
      const richId = newUlid();
      const rich = flowNodeOf(
        ticket({
          id: richId,
          typeId: DECISION_TYPE_ID,
          parentId: 'parent-1',
          stateId: 'doing',
          stateCategory: 'active',
          fields: {
            startDate: claim({ date: '2026-10-05' }),
            dueDate: claim({ date: '2026-10-09', note: 'client call' }),
            estimate: claim(3),
            reworkEstimate: claim(2),
            waitForAll: claim(true),
          },
          outcome: 'Yes',
          passes: [{ pass: 1, outcome: 'Yes', by: decider, at: '2026-10-02T10:00:00.000Z', revisions: [] }],
          periods: [{ start: '2026-10-02T09:00:00.000Z', end: null, pass: 2 }],
          rounds: 2,
          closed: {
            actorId: decider,
            at: '2026-10-03T09:00:00.000Z',
            cause: { kind: 'branch-not-taken', decisionTicketId: 'dec-1', outcome: 'No', pass: 1, decidedBy: decider, decisionEventId: 'ev-1' },
          },
          deleted: { actorId: decider, at: '2026-10-03T10:00:00.000Z' },
        }),
        wf,
        { draft: true },
      );
      expect(rich).toMatchObject({
        isDecision: true, parentId: 'parent-1', stateId: 'doing', category: 'active', closed: true, trashed: true, draft: true,
        outcome: 'Yes', started: true, rounds: 2, explicitStart: '2026-10-05', explicitDue: '2026-10-09',
        estimate: 3, reworkEstimate: 2, waitForAll: true,
        notTaken: { kind: 'not-taken', decisionTicketId: 'dec-1', outcome: 'No', pass: 1 },
      });
      expect(rich.passes).toHaveLength(1);
      expect(rich.periods).toEqual([{ start: '2026-10-02T09:00:00.000Z', end: null, pass: 2 }]);

      // an explicit flag beats the state's own soft-delete flag in both directions
      expect(flowNodeOf(ticket({ deleted: { actorId: decider, at: '2026-10-03T10:00:00.000Z' } }), wf, { trashed: false }).trashed).toBe(false);
      expect(flowNodeOf(ticket(), wf, { trashed: true }).trashed).toBe(true);
    });

    it('29.185 a claim of the wrong shape is no claim: a cleared or malformed value reads as null, not as a guess', () => {
      const node = flowNodeOf(
        ticket({
          fields: {
            startDate: claim(null),
            dueDate: claim({ date: 'next week' }),
            estimate: claim(0),
            reworkEstimate: claim(366),
            waitForAll: claim(null),
          },
        }),
        wf,
      );
      expect([node.explicitStart, node.explicitDue, node.estimate, node.reworkEstimate, node.waitForAll]).toEqual([null, null, null, null, false]);
      expect(flowNodeOf(ticket({ fields: { estimate: claim(1.5) } }), wf).estimate).toBeNull();
      expect(flowNodeOf(ticket({ fields: { estimate: claim(365) } }), wf).estimate).toBe(365); // CONTROL: the edge of the range is accepted
    });
  });
  ```

  `packages/domain/test/flow/clock-free.test.ts` (case 29.186). The app-core scan (`packages/app-core/test/helpers/clock-scan.ts`, used at `packages/app-core/test/calendar/clock-free.test.ts:218-292`) pins its list of domain files to the two the calendar imports and does not reach this directory, so the flow directory carries its own scan with the same five patterns. T11 adds `plan.ts` and T15 adds `settle.ts` to the named list:
  ```ts
  import { readdirSync, readFileSync } from 'node:fs';
  import { fileURLToPath } from 'node:url';
  import { describe, expect, it } from 'vitest';

  /**
   * The flow code is shared by the server, the replica and the app, so a clock or a device-timezone
   * read anywhere in it would plan one day on one machine and another day on the next. The app-core
   * scan (`packages/app-core/test/helpers/clock-scan.ts`) does not reach this directory and its list
   * of domain files is pinned to the two the calendar imports, so the flow directory has its own scan
   * here, with the same five patterns.
   */
  const FLOW_SRC = fileURLToPath(new URL('../../src/flow/', import.meta.url));
  const FORBIDDEN: ReadonlyArray<{ label: string; pattern: RegExp }> = [
    { label: 'clock read', pattern: /\bnew\s+Date\s*\(\s*\)/ },
    { label: 'clock read', pattern: /\bDate\s*\.\s*now\s*\(/ },
    { label: 'device timezone getter', pattern: /\.get(?:FullYear|Month|Date|Day|Hours|Minutes|Seconds|Milliseconds|TimezoneOffset)\s*\(/ },
    { label: 'device locale formatter', pattern: /\.toLocale[A-Za-z]*\s*\(/ },
    { label: 'device locale formatter', pattern: /\bIntl\s*\.\s*DateTimeFormat\b/ },
  ];
  const hitsIn = (text: string): string[] => FORBIDDEN.filter(({ pattern }) => pattern.test(text)).map(({ label }) => label);

  describe('29.186 the flow directory is clock-free', () => {
    it('29.186 no file under packages/domain/src/flow reads the clock or the device zone; the scanner flags a planted read', () => {
      const files = readdirSync(FLOW_SRC).filter((f) => f.endsWith('.ts'));
      // named literally: a loop over `files` would assert the list against itself
      expect(files).toContain('analysis.ts');
      expect(files).toContain('graph.ts');
      expect(files).toContain('node.ts');
      const dirty = files.filter((f) => hitsIn(readFileSync(FLOW_SRC + f, 'utf8')).length > 0);
      expect(dirty).toEqual([]);
      // CONTROL: the same scanner, on text that does read the clock
      expect(hitsIn('const t = new Date();')).toEqual(['clock read']);
      expect(hitsIn('d.getFullYear()')).toEqual(['device timezone getter']);
      expect(hitsIn('d.getUTCFullYear()')).toEqual([]);
    });
  });
  ```

  Run (`slot-run.sh` below is `/Users/kiro/my_projects/gisik-nokma-lanes/slot-run.sh`): `/Users/kiro/my_projects/gisik-nokma-lanes/slot-run.sh wtg2-t10-red -- pnpm --filter @gisik-nokma/domain exec vitest run test/flow --maxWorkers=2 > /tmp/wtg2-t10-red.log 2>&1; tail -30 /tmp/wtg2-t10-red.log`. Expected: FAIL (`analyzeFlow is not a function`, `flowNodeOf is not a function`, and the clock-free test fails on `toContain('analysis.ts')` because the file does not exist).

  Commit: `wtg2 T10: RED flow analysis cases`.

- [ ] **Step 3: Types, analysis, and the export wiring**

  `packages/domain/src/flow/types.ts`:
  ```ts
  import type { PassRecord, WorkPeriod } from '../entity-state.js';
  import type { StateCategory } from '../workflow.js';
  import type { NotTakenResolution } from './derive.js';

  /** One `leads_to` link as the flow code sees it: source -> target, with the outcome label when the link has one. */
  export type FlowEdge = { sourceId: string; targetId: string; label: string | null };

  /** The key a back edge is recorded under: one ordered pair (a `leads_to` is unique per ordered pair). */
  export function edgeKey(e: Pick<FlowEdge, 'sourceId' | 'targetId'>): string {
    return `${e.sourceId}>${e.targetId}`;
  }

  /**
   * THE single input node shape of every flow function (analysis, planner, promotion, settle).
   * Built from a `TicketState` by `flowNodeOf` (node.ts) and by nothing else, so the server read,
   * the replica and the tests cannot disagree about what "started" or "estimate" means.
   */
  export type FlowNode = {
    id: string;
    typeId: string;
    stateId: string;
    category: StateCategory;
    closed: boolean;
    trashed: boolean;
    draft: boolean;
    parentId: string | null;
    isDecision: boolean;
    outcome: string | null;
    passes: PassRecord[];
    notTaken: NotTakenResolution | null;
    waitForAll: boolean;
    started: boolean;
    rounds: number;
    periods: WorkPeriod[];
    explicitStart: string | null;
    /** IST day, YYYY-MM-DD. */
    explicitDue: string | null;
    estimate: number | null;
    reworkEstimate: number | null;
    initialStateId: string;
    firstTerminalStateId: string | null;
  };

  export type FlowAnalysis = {
    /** Nodes with no incoming `leads_to`, ascending id. A node in a pure loop is in neither list. */
    starts: string[];
    /** Nodes with no outgoing `leads_to`, ascending id. */
    ends: string[];
    /** `edgeKey`s of the loop-closing edges (FL-3). */
    backEdges: ReadonlySet<string>;
    /** Kahn order over the edges without back edges; ties by (explicit sort day, id). */
    order: string[];
  };
  ```

  `packages/domain/src/flow/analysis.ts`:
  ```ts
  import { edgeKey, type FlowAnalysis, type FlowEdge, type FlowNode } from './types.js';

  function byId(a: string, b: string): number {
    return a < b ? -1 : a > b ? 1 : 0;
  }

  /**
   * FL-3, pure and clock-free. Edges naming an id that is not in `nodes` are ignored (a hidden ticket
   * is a hole: the read drops its links, and this function must not invent the node back).
   *
   * - Start / End: no incoming / no outgoing `leads_to`.
   * - Back edges: depth-first search from the Starts in ascending id, then from every still-unvisited
   *   node in ascending id; out-edges visited in ascending target id; an edge into a node that is
   *   currently on the stack is a back edge. Deterministic for a graph, and iterative (a 300-node
   *   chain must not depend on the engine's stack depth).
   * - Order: Kahn's order over the edges without back edges (a DFS back-edge removal leaves a DAG, so
   *   every node is emitted); among ready nodes the smallest (explicit sort day, id), where the sort
   *   day is `explicitStart`, else `explicitDue`, and a node with neither sorts after every dated one.
   */
  export function analyzeFlow(
    nodes: ReadonlyArray<Pick<FlowNode, 'id' | 'explicitStart' | 'explicitDue'>>,
    edges: readonly FlowEdge[],
  ): FlowAnalysis {
    const known = new Set(nodes.map((n) => n.id));
    const ids = [...known].sort(byId);
    const targets = new Map<string, Set<string>>();
    const hasIncoming = new Set<string>();
    for (const e of edges) {
      if (!known.has(e.sourceId) || !known.has(e.targetId)) continue;
      const set = targets.get(e.sourceId) ?? new Set<string>();
      set.add(e.targetId);
      targets.set(e.sourceId, set);
      hasIncoming.add(e.targetId);
    }
    const out = new Map<string, string[]>([...targets].map(([source, set]) => [source, [...set].sort(byId)]));

    const starts = ids.filter((id) => !hasIncoming.has(id));
    const ends = ids.filter((id) => (out.get(id)?.length ?? 0) === 0);

    const color = new Map<string, 1 | 2>(); // absent = unvisited, 1 = on the stack, 2 = finished
    const backEdges = new Set<string>();
    for (const root of [...starts, ...ids]) {
      if (color.has(root)) continue;
      color.set(root, 1);
      const stack: Array<{ id: string; next: number }> = [{ id: root, next: 0 }];
      for (let frame = stack.at(-1); frame !== undefined; frame = stack.at(-1)) {
        const list = out.get(frame.id) ?? [];
        const target = list[frame.next];
        if (target === undefined) {
          color.set(frame.id, 2);
          stack.pop();
          continue;
        }
        frame.next += 1;
        const seen = color.get(target);
        if (seen === 1) backEdges.add(edgeKey({ sourceId: frame.id, targetId: target }));
        else if (seen === undefined) {
          color.set(target, 1);
          stack.push({ id: target, next: 0 });
        }
      }
    }

    const sortDay = new Map(nodes.map((n) => [n.id, n.explicitStart ?? n.explicitDue] as const));
    const comesFirst = (a: string, b: string): boolean => {
      const da = sortDay.get(a) ?? null;
      const db = sortDay.get(b) ?? null;
      if (da !== db) return db === null ? true : da === null ? false : da < db;
      return a < b;
    };
    const waiting = new Map<string, number>(ids.map((id) => [id, 0]));
    for (const [source, list] of out) {
      for (const target of list) {
        if (!backEdges.has(edgeKey({ sourceId: source, targetId: target }))) waiting.set(target, (waiting.get(target) ?? 0) + 1);
      }
    }
    const ready = ids.filter((id) => waiting.get(id) === 0);
    const order: string[] = [];
    while (ready.length > 0) {
      let best = 0;
      for (let i = 1; i < ready.length; i += 1) {
        if (comesFirst(ready[i] as string, ready[best] as string)) best = i;
      }
      const [id] = ready.splice(best, 1) as [string];
      order.push(id);
      for (const target of out.get(id) ?? []) {
        if (backEdges.has(edgeKey({ sourceId: id, targetId: target }))) continue;
        const left = (waiting.get(target) ?? 0) - 1;
        waiting.set(target, left);
        if (left === 0) ready.push(target);
      }
    }
    return { starts, ends, backEdges, order };
  }
  ```

  `packages/domain/src/flow/index.ts` (list every file under `src/flow/` that exists on the branch; `ls packages/domain/src/flow` shows `causes.ts` from T8 and `derive.ts`, `periods.ts` from T9):
  ```ts
  export * from './causes.js';
  export * from './derive.js';
  export * from './periods.js';
  export * from './types.js';
  export * from './analysis.js';
  ```
  `packages/domain/src/index.ts`: run `grep -n "./flow/" packages/domain/src/index.ts`; delete each match and put one line `export * from './flow/index.js';` where the first stood. (Two `export *` of one binding through two paths would compile, but T9's note says T10 owns this replacement, and a single door is what T13 and T15 add their own files to.)

  Run: `slot-run.sh wtg2-t10-a -- pnpm --filter @gisik-nokma/domain exec vitest run test/flow/analysis.test.ts --maxWorkers=2 > /tmp/wtg2-t10-a.log 2>&1; tail -30 /tmp/wtg2-t10-a.log`. Expected: PASS (4 tests). If a Kahn row fails, print `a.order` and compare with the expectation before changing either: the order is a function of the ids in `fixtures.ts`.

  Commit: `wtg2 T10: Start/End, back edges, flow order`.

- [ ] **Step 4: Graph terms**

  `packages/domain/src/flow/graph.ts`:
  ```ts
  import { normaliseLinkLabel } from '../link-label.js';
  import { edgeKey, type FlowAnalysis, type FlowEdge, type FlowNode } from './types.js';

  /** Two outcome labels are the same when they agree after trim and case folding; two absent labels agree, an absent and a present one do not. */
  export function sameLabel(a: string | null, b: string | null): boolean {
    if (a === null || b === null) return a === b;
    return normaliseLinkLabel(a) === normaliseLinkLabel(b);
  }

  /** The edges that are not loop-closing (FL-3): the DAG every ordering, chaining and reachability question is asked on. */
  export function forwardEdges(edges: readonly FlowEdge[], analysis: FlowAnalysis): FlowEdge[] {
    return edges.filter((e) => !analysis.backEdges.has(edgeKey(e)));
  }

  /**
   * PS-1: the flow's edges minus, for every Decision with a non-null outcome, its outgoing edges whose
   * label differs from the outcome. Only that. An edge from a Not-taken source stays (the settle plan
   * must reason about the state AFTER it runs, when that source may be live again); the promotion rule
   * AP-3 excludes Not-taken sources itself.
   */
  export function effectiveEdges(nodes: readonly FlowNode[], edges: readonly FlowEdge[]): FlowEdge[] {
    const byId = new Map(nodes.map((n) => [n.id, n] as const));
    return edges.filter((e) => {
      const source = byId.get(e.sourceId);
      if (source === undefined || !source.isDecision || source.outcome === null) return true;
      return sameLabel(e.label, source.outcome);
    });
  }

  function adjacency(edges: readonly FlowEdge[], known: ReadonlySet<string>, reverse = false): Map<string, string[]> {
    const map = new Map<string, string[]>();
    for (const e of edges) {
      if (!known.has(e.sourceId) || !known.has(e.targetId)) continue;
      const [from, to] = reverse ? [e.targetId, e.sourceId] : [e.sourceId, e.targetId];
      map.set(from, [...(map.get(from) ?? []), to]);
    }
    return map;
  }

  function reach(starts: Iterable<string>, next: ReadonlyMap<string, string[]>, blocked?: string): Set<string> {
    const seen = new Set<string>();
    const queue = [...starts].filter((id) => id !== blocked);
    for (const id of queue) seen.add(id);
    for (let i = 0; i < queue.length; i += 1) {
      for (const to of next.get(queue[i] as string) ?? []) {
        if (to === blocked || seen.has(to)) continue;
        seen.add(to);
        queue.push(to);
      }
    }
    return seen;
  }

  /**
   * PS-1: the tickets reachable from the flow's roots over the effective graph's non-back edges. A
   * root is a ticket with no incoming non-back edge in the WHOLE flow (not in the effective graph: a
   * ticket cut off by a Decision's choice must not become a root and so live for free).
   */
  export function liveSet(nodes: readonly FlowNode[], edges: readonly FlowEdge[], analysis: FlowAnalysis): Set<string> {
    const known = new Set(nodes.map((n) => n.id));
    const forward = forwardEdges(edges, analysis).filter((e) => known.has(e.sourceId) && known.has(e.targetId));
    const hasIncoming = new Set(forward.map((e) => e.targetId));
    const roots = nodes.filter((n) => !hasIncoming.has(n.id)).map((n) => n.id);
    return reach(roots, adjacency(forwardEdges(effectiveEdges(nodes, edges), analysis), known));
  }

  /**
   * PS-1: the loop body of back edge `D -> T`: `T`, `D` and every ticket on a forward path from `T`
   * to `D`, i.e. reachable from `T` AND reaching `D` over non-back edges. A ticket the walk merely
   * passes through on its way elsewhere (reachable from `T`, never reaching `D`) is not in it. Taken
   * over the whole flow, not the effective graph: the body is structure, independent of any outcome.
   */
  export function loopBody(
    backEdge: Pick<FlowEdge, 'sourceId' | 'targetId'>,
    edges: readonly FlowEdge[],
    analysis: FlowAnalysis,
  ): Set<string> {
    const forward = forwardEdges(edges, analysis);
    const known = new Set(forward.flatMap((e) => [e.sourceId, e.targetId]).concat(backEdge.sourceId, backEdge.targetId));
    const fromTarget = reach([backEdge.targetId], adjacency(forward, known));
    const toDecision = reach([backEdge.sourceId], adjacency(forward, known, true));
    return new Set([...fromTarget].filter((id) => toDecision.has(id)));
  }

  /**
   * PS-1: the tickets on branch `label` of a Decision: reachable from that edge's target over
   * non-back edges, never passing through the Decision. `label` is null for a Decision's unlabeled edge
   * (the engine requires labels, but a link relabelled out from under a Decision must not crash the plan).
   * Empty when the Decision has no such edge.
   */
  export function branchOf(
    decisionId: string,
    label: string | null,
    edges: readonly FlowEdge[],
    analysis: FlowAnalysis,
  ): Set<string> {
    const edge = edges.find((e) => e.sourceId === decisionId && sameLabel(e.label, label));
    if (edge === undefined) return new Set();
    const forward = forwardEdges(edges, analysis);
    const known = new Set(forward.flatMap((e) => [e.sourceId, e.targetId]).concat(edge.targetId));
    return reach([edge.targetId], adjacency(forward, known), decisionId);
  }
  ```

  Add `export * from './graph.js';` to `flow/index.ts`. Run: `slot-run.sh wtg2-t10-b -- pnpm --filter @gisik-nokma/domain exec vitest run test/flow/graph.test.ts --maxWorkers=2 > /tmp/wtg2-t10-b.log 2>&1; tail -30 /tmp/wtg2-t10-b.log`. Expected: PASS (4 tests).

  Commit: `wtg2 T10: effective graph, live set, loop body, branch`.

- [ ] **Step 5: `flowNodeOf`**

  `packages/domain/src/flow/node.ts`:
  ```ts
  import type { TicketState } from '../entity-state.js';
  import { IST_DAY_REGEX } from '../ist-day.js';
  import { claimedEstimate, claimedWaitForAll, DECISION_TYPE_ID } from '../ticket-types.js';
  import type { WorkflowDef } from '../workflow.js';
  import { hasStarted, resolutionOf, ticketRound } from './derive.js';
  import type { FlowNode } from './types.js';

  function dayClaim(state: TicketState, fieldId: 'startDate' | 'dueDate'): string | null {
    const value = state.fields[fieldId]?.value;
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
    const date = (value as { date?: unknown }).date;
    return typeof date === 'string' && IST_DAY_REGEX.test(date) ? date : null;
  }

  /**
   * The one door from a ticket's folded state to the flow code's node. Every derived fact comes from a
   * helper that already exists (`hasStarted`, `resolutionOf`, `ticketRound`), never from a re-read of
   * the raw members, so a node and the sheet cannot disagree about "started" or "Not taken".
   *
   * `flags.trashed` defaults to the soft-delete flag on the state; `flags.draft` defaults to false and
   * is set by the caller that knows the ticket is the viewer's own draft (a draft is not a column the
   * reducer folds into `TicketState` on this tip).
   */
  export function flowNodeOf(state: TicketState, wf: WorkflowDef, flags: { trashed?: boolean; draft?: boolean } = {}): FlowNode {
    return {
      id: state.id,
      typeId: state.typeId,
      stateId: state.stateId,
      category: state.stateCategory,
      closed: (state.closed ?? null) !== null,
      trashed: flags.trashed ?? (state.deleted ?? null) !== null,
      draft: flags.draft ?? false,
      parentId: state.parentId,
      isDecision: state.typeId === DECISION_TYPE_ID,
      outcome: state.outcome ?? null,
      passes: state.passes ?? [],
      notTaken: resolutionOf(state),
      waitForAll: claimedWaitForAll(state.fields),
      started: hasStarted(state),
      rounds: ticketRound(state),
      periods: state.periods ?? [],
      explicitStart: dayClaim(state, 'startDate'),
      explicitDue: dayClaim(state, 'dueDate'),
      estimate: claimedEstimate(state.fields, 'estimate'),
      reworkEstimate: claimedEstimate(state.fields, 'reworkEstimate'),
      initialStateId: wf.initialStateId,
      firstTerminalStateId: wf.states.find((s) => s.category === 'terminal')?.id ?? null,
    };
  }
  ```

  Add `export * from './node.js';` to `flow/index.ts`. If T4 or T9 exported a helper under another name, change the imports at the top of this file only (re-read `packages/domain/src/ticket-types.ts` and `flow/derive.ts`). Run: `slot-run.sh wtg2-t10-c -- pnpm --filter @gisik-nokma/domain exec vitest run test/flow --maxWorkers=2 > /tmp/wtg2-t10-c.log 2>&1; tail -30 /tmp/wtg2-t10-c.log`. Expected: PASS (all five files). Then `slot-run.sh wtg2-t10-tc -- pnpm --filter @gisik-nokma/domain typecheck > /tmp/wtg2-t10-tc.log 2>&1; tail -20 /tmp/wtg2-t10-tc.log` and `slot-run.sh wtg2-t10-build -- pnpm --filter @gisik-nokma/domain build > /tmp/wtg2-t10-build.log 2>&1; tail -20 /tmp/wtg2-t10-build.log`. Expected: both clean (the server and app-core read the built `dist`).

  Commit: `wtg2 T10: flowNodeOf`.

- [ ] **Step 6: Flip, Features, mutations, DONE**
  - Flip 29.180-29.186 to ✅ in the same commit as this step's last test change; run `pnpm check:citations` and `node scripts/check-case-ids.mjs` (each id appears in a test name).
  - **Features** (under `<!-- wtg-part2-model T10 bullet -->`; keep the anchor line, T19 reads the bullets below it): `- ⚙️ **Flow analysis** (wtg2 T10; `packages/domain/src/flow/{types,analysis,graph,node}.ts`) — pure, clock-free functions over a ticket's "leads to" links: Start and End tickets, loop-closing edges, flow order, the effective graph after a Decision's choice, the live set, loop bodies and branches, and the single `FlowNode` shape every flow feature reads. Cases 29.180-29.186.`
  - **Sweeps:** the whole domain suite (`slot-run.sh wtg2-t10-all -- pnpm --filter @gisik-nokma/domain exec vitest run --maxWorkers=2`), because `index.ts` changed what every package imports; then `slot-run.sh wtg2-t10-tcall -- pnpm -r typecheck` once, to prove the single `export *` door left no duplicate export in any consumer.
  - **Mutations** (each applied, the named file run, then reverted; all verified to go red on the validated implementation):

  | Case | Mutation | Expected red |
  |---|---|---|
  | 29.181 | `[...set].sort(byId)` becomes `[...set]` (out-edges unsorted) | the mockup back-edge list (3 tests fail) |
  | 29.181 | `for (const root of [...starts, ...ids])` becomes `for (const root of ids)` | the feeder row (search enters at the Start) |
  | 29.182 | `db === null ? true : da === null ? false : da < db` becomes `da === null ? true : db === null ? false : da < db` | the dated-beats-undated row |
  | 29.183 | `normaliseLinkLabel(a) === normaliseLinkLabel(b)` becomes `a === b` | the `'  YES '` row |
  | 29.183 | in `liveSet`, find `hasIncoming` from `forwardEdges(effectiveEdges(nodes, edges), analysis)` | the `z` row |
  | 29.184 | `return new Set([...fromTarget].filter((id) => toDecision.has(id)))` becomes `return fromTarget` | the "No" loop row |
  | 29.184 | drop the `decisionId` argument of `reach` in `branchOf` | the "never through the Decision" row |
  | 29.185 | `claimedWaitForAll(state.fields)` becomes `state.fields['waitForAll']?.value !== undefined` | the malformed-claim test |
  | 29.185 | `claimedEstimate(state.fields, 'estimate')` becomes `typeof state.fields['estimate']?.value === 'number' ? ... : null` | the same test (0 and 366 are numbers) |
  | 29.186 | add `const t = new Date();` to `analysis.ts` | the scan names `analysis.ts` |

  Push. DONE + REVIEW (NEEDS: T2, T4, T5, T8, T9 merged; `claimedEstimate` / `resolutionOf` names re-read).

---

### Task 11: The planner `planFlow` (cases 29.190-29.199)

**Branch:** `task/wtg2-planner` from `origin/release/workflow-graph`; PR `--base release/workflow-graph`. **Needs:** T10 merged (`FlowNode`, `analyzeFlow`, `effectiveEdges`, `liveSet`, `forwardEdges`, `sameLabel`, `test/flow/fixtures.ts`) and, through it, T4 (estimates) and T9 (periods, rounds). Pure domain code.

**Files:**
- Create: `packages/domain/src/flow/plan.ts`; `packages/domain/test/flow/plan.test.ts`
- Modify: `packages/domain/src/flow/index.ts` (one line); `packages/domain/test/flow/clock-free.test.ts` (one line)
- Catalogue: `test-cases/29-workflow-timeline-graphs.md` under `<!-- wtg-part2-model T11 -->`; `Features.md` §26 under `<!-- wtg-part2-model T11 bullet -->`

**Interfaces:**
- **Consumes:** `FlowNode`, `FlowEdge`, `FlowAnalysis`, `edgeKey`, `analyzeFlow`, `forwardEdges`, `effectiveEdges`, `liveSet`, `sameLabel` (T10); `istDayOf(instant: string): string` (`packages/domain/src/ist-day.ts:43`); the fixtures `uid`, `fnode`, `decision`, `edge`, `mockup` (T10, `test/flow/fixtures.ts`).
- **Produces:** `planFlow(input: {nodes: readonly FlowNode[]; edges: readonly FlowEdge[]; analysis?: FlowAnalysis}): FlowPlan`; `type PlannedInterval = {pass: number; start: string; end: string; basis: 'explicit' | 'chained'; startsBeforePredecessor?: true; pruned?: true}`; `type UnscheduledReason = 'start-after-due' | 'no-estimate' | 'no-dates'`; `type NodePlan = {intervals: PlannedInterval[]; unscheduled: UnscheduledReason | null; onTimeline: boolean}`; `type FlowPlan = Map<string, NodePlan>`. Dates are inclusive IST days `YYYY-MM-DD`. Part 4 (the timeline) and the MCP `get_flow` read exactly these.

**Why there is no `today` input (PL-1).** The planner never reads the clock, so a plan changes only when an event does: an overdue active predecessor does not slide its successors. `clock-free.test.ts` (T10) gains `plan.ts` in its named list, and `addDays` works in UTC arithmetic over a day string (`Date.UTC` and the `getUTC*` getters are not device-zone reads, and the scan allows them).

**Why the end of a predecessor is `actual ?? planned ?? unknown` and the actual day is `istDayOf(period.end)` (PL-1, WP-2).** A closed period for the pass is what happened; an instant at 19:00Z on the 4th is 00:30 IST on the 5th, so the UTC date would put the successor a day early. Case 29.192 plants exactly that instant.

**Why the cells are computed lazily and memoised, with a busy guard (PL-6).** Pass `k` of a loop target reads its Decision's pass `k-1`, and a node that does not run again reads its predecessors' last pass, so dependencies cross passes and no fixed loop order is right. `cellOf(k, id)` computes on demand and caches by `k:id`. On data the settle cascade produced, the dependency graph is acyclic; a half-applied cascade (a Decision that recorded a loop outcome before its body was reset) can make it cyclic, and the in-progress cell then answers "no dates" instead of recursing. Case 29.199 is that data. It is a read-side guard only; nothing is written.

**Why a node that leaves a loop chains from the loop's LAST run (a PL-6 extension the cases pin).** PL-6 plans pass `k >= 2` only for reset tickets and loop targets. A ticket after the loop (the mockup's `GN-152` after `GN-151`) is planned in pass 1, and if it chained from its predecessor's pass 1 it would be planned to start before the loop's second run ends. So `readyDay` takes each predecessor's `lastPass` unless the node itself runs again in pass `k + 1` (in which case it chains from pass `k`, the usual per-pass rule). Case 29.196's second test pins it with the control of a loop that has not run twice.

**Why a pruned node is fed by every non-back edge while a live node is fed only by live, taken sources (PL-6, AP-3).** A node on a branch the Decision did not choose is planned "as if it had been taken" (the ghost), so it chains over all forward edges; a live node never takes its ready day from a pruned or Not-taken source, because such a source "has no end" (PL-1). `pruned` intervals are flagged and never appear as a predecessor end of a live node (case 29.195).

- [ ] **Step 1: Case lines**

  Under `<!-- wtg-part2-model T11 -->`, all ❌:
  - `- ❌ **29.190 — every row of the PL-3 table, in the spec's order: start and due; start and estimate; due and estimate; start only; due only; a ready day with an estimate chains; a ready day without one is "no-estimate"; anything else is "no-dates"; start after due is unscheduled "start-after-due";** control: each row is asserted with the others' inputs absent so a row cannot pass by falling through to another. Mutation: test start+estimate before start+due → the start-and-due row gets the wrong end.`
  - `- ❌ **29.191 — an explicit start earlier than the ready day keeps its interval and carries startsBeforePredecessor; a later one does not;** control: the explicit interval is returned in both cases. Mutation: drop the flag → the warning row fails.`
  - `- ❌ **29.192 — a closed period of the pass ends the chain on its IST day (a 19:00Z end is the next IST day), an open period or none falls back to the planned end, and today is never an input;** control: the same graph with the period open chains from the plan. Mutation: take the UTC date of the end → the boundary instant puts the successor a day early.`
  - `- ❌ **29.193 — with Wait for all off a ticket is ready the day after its earliest predecessor end; with it on, the day after the latest, and any unknown predecessor end leaves it unscheduled;** control: the same ticket with the switch off is scheduled. Mutation: use the earliest for waitForAll → the late predecessor is ignored.`
  - `- ❌ **29.194 — a loop-closing edge feeds nothing: in the mockup GN-143 chains from GN-141 even with Wait for all on and a late GN-146;** control: a forward edge from the same late ticket does move its successor. Mutation: treat every edge as forward (in the incoming list and in the effective set) → GN-143 waits for GN-146.`
  - `- ❌ **29.195 — before a Decision has an outcome both branches are planned; after one the other branch's tickets are flagged pruned and no live ticket chains from them, a revised Decision ends at the later of its period end and its latest revision day, and Wait for all on the shared tail waits for the branch taken only;** control: the undecided diamond plans both. Mutation: let a pruned source feed a live ticket, or let a revision replace the end → the shared-tail or revision row fails.`
  - `- ❌ **29.196 — pass 2 of a loop target starts the day after the Decision's finish and is as long as the rework estimate (else the estimate), pass 1 stays in the output, explicit dates belong to pass 1 only, and what leaves the loop chains from the loop's last run;** control: before any loop outcome there is one pass and the exit chains from the pass-1 finish. Mutation: chain the exit from pass k, or drop the loop-target predecessor → the exit or the pass-2 start moves.`
  - `- ❌ **29.197 — a ticket is on the timeline when it has a non-pruned planned interval or has been worked;** control: an undated, never-worked ticket and a ticket with an estimate but no ready day are not. Mutation: make onTimeline plan-only → the undated worked ticket drops out.`
  - `- ❌ **29.198 — planFlow does not mutate its input and answers the same for any input order;** control: frozen inputs would throw on a write. Mutation: sort the caller's node array in place as the first line of planFlow → the frozen run throws.`
  - `- ❌ **29.199 — data a half-applied cascade can produce (a Decision that recorded a loop outcome before its body was reset) plans without recursing forever, pass 1 is unchanged, and no interval has a start after its end;** control: pass 1 of the same ticket equals its plan without the half-applied pass. Mutation: delete the busy guard → the call overflows the stack.`

  Commit: `wtg2 T11: case lines for the planner`.

- [ ] **Step 2: RED tests**

  `packages/domain/test/flow/plan.test.ts` (imports the fixtures T10 created; every expectation was computed by running the implementation below and then read against the spec table by hand):
  ```ts
  import { describe, expect, it } from 'vitest';
  import { planFlow, type FlowEdge, type FlowNode, type NodePlan } from '../../src/index.js';
  import { decision, edge, fnode, mockup, uid } from './fixtures.js';

  const [A, B, C, D, E, F] = [1, 2, 3, 4, 5, 6].map(uid) as [string, string, string, string, string, string];

  function planOf(nodes: FlowNode[], edges: FlowEdge[] = []): Map<string, NodePlan> {
    return planFlow({ nodes, edges });
  }
  const get = (plan: Map<string, NodePlan>, id: string): NodePlan => {
    const found = plan.get(id);
    if (found === undefined) throw new Error(`no plan for ${id}`);
    return found;
  };
  const span = (plan: Map<string, NodePlan>, id: string, i = 0): string => {
    const x = get(plan, id).intervals[i];
    return x === undefined ? 'none' : `${x.start}..${x.end} ${x.basis}`;
  };
  /** An IST-day-boundary instant: 19:00Z on the 4th is 00:30 IST on the 5th. */
  const period = (end: string | null, pass = 1) => ({ start: '2026-10-01T04:00:00.000Z', end, pass });

  describe('29.190 every row of the planned-interval table', () => {
    it('29.190 explicit dates win, in the spec order; a missing piece names its reason', () => {
      const p = planOf([
        fnode(A, { explicitStart: '2026-10-01', explicitDue: '2026-10-04', estimate: 9 }), // start and due: the estimate is ignored
        fnode(B, { explicitStart: '2026-10-05', explicitDue: '2026-10-01' }), // start after due
        fnode(C, { explicitStart: '2026-10-01', estimate: 3 }),
        fnode(D, { explicitDue: '2026-10-10', estimate: 4 }),
        fnode(E, { explicitStart: '2026-10-07' }),
        fnode(F, { explicitDue: '2026-10-08' }),
      ]);
      expect(span(p, A)).toBe('2026-10-01..2026-10-04 explicit');
      expect(get(p, B)).toEqual({ intervals: [], unscheduled: 'start-after-due', onTimeline: false });
      expect(span(p, C)).toBe('2026-10-01..2026-10-03 explicit');
      expect(span(p, D)).toBe('2026-10-07..2026-10-10 explicit');
      expect(span(p, E)).toBe('2026-10-07..2026-10-07 explicit');
      expect(span(p, F)).toBe('2026-10-08..2026-10-08 explicit');
      expect(get(p, A).unscheduled).toBeNull();
    });

    it('29.190 with neither date: estimate and a ready day chain; a ready day with no estimate is "no-estimate"; anything else is "no-dates"', () => {
      const edges = [edge(A, B), edge(A, C), edge(D, E)];
      const p = planOf(
        [
          fnode(A, { explicitDue: '2026-12-30' }),
          fnode(B, { estimate: 3 }), // chained across the year end: ready 2026-12-31, three days
          fnode(C), // ready day, no estimate
          fnode(D), // no dates and no predecessor
          fnode(E, { estimate: 2 }), // estimate, but its only predecessor has no end: no ready day
        ],
        edges,
      );
      expect(span(p, B)).toBe('2026-12-31..2027-01-02 chained');
      expect(get(p, C)).toEqual({ intervals: [], unscheduled: 'no-estimate', onTimeline: false });
      expect(get(p, D)).toEqual({ intervals: [], unscheduled: 'no-dates', onTimeline: false });
      expect(get(p, E).unscheduled).toBe('no-dates');
      // CONTROL: an estimate and no predecessor at all is also "no-dates"
      expect(get(planOf([fnode(A, { estimate: 3 })]), A).unscheduled).toBe('no-dates');
    });
  });

  describe('29.191 explicit dates and the warning glyph', () => {
    it('29.191 an explicit start earlier than the ready day carries startsBeforePredecessor and still wins; a later one does not', () => {
      const edges = [edge(A, B), edge(A, C)];
      const nodes = [
        fnode(A, { explicitStart: '2026-10-05', estimate: 3 }), // ends 2026-10-07, so successors are ready 2026-10-08
        fnode(B, { explicitStart: '2026-10-06', estimate: 2 }),
        fnode(C, { explicitStart: '2026-10-09', estimate: 2 }),
      ];
      const p = planOf(nodes, edges);
      expect(get(p, B).intervals[0]).toEqual({ pass: 1, start: '2026-10-06', end: '2026-10-07', basis: 'explicit', startsBeforePredecessor: true });
      expect(get(p, C).intervals[0]).toEqual({ pass: 1, start: '2026-10-09', end: '2026-10-10', basis: 'explicit' });
      // a start-less explicit due never carries the glyph
      const due = planOf([nodes[0] as FlowNode, fnode(B, { explicitDue: '2026-10-06', estimate: 1 })], [edge(A, B)]);
      expect(get(due, B).intervals[0]).not.toHaveProperty('startsBeforePredecessor');
    });
  });

  describe('29.192 chaining from what happened', () => {
    it('29.192 a closed period ends the chain on its IST day; an open period or none falls back to the plan; today is never an input', () => {
      const edges = [edge(A, B)];
      const planned = { explicitStart: '2026-10-01', estimate: 9 }; // planned end 2026-10-09
      const succ = fnode(B, { estimate: 2 });
      // actual end 19:00Z on the 4th is 00:30 IST on the 5th: the successor is ready on the 6th
      const closed = planOf([fnode(A, { ...planned, periods: [period('2026-10-04T19:00:00.000Z')] }), succ], edges);
      expect(span(closed, B)).toBe('2026-10-06..2026-10-07 chained');
      // an open period (an overdue active predecessor) does not slide its successors: the planned end stands
      const open = planOf([fnode(A, { ...planned, started: true, periods: [period(null)] }), succ], edges);
      expect(span(open, B)).toBe('2026-10-10..2026-10-11 chained');
      // CONTROL: no period at all gives the same
      expect(span(planOf([fnode(A, planned), succ], edges), B)).toBe('2026-10-10..2026-10-11 chained');
      // a person-reopened ticket has two periods of the same pass; the LAST decides
      const reopened = planOf([fnode(A, { ...planned, started: true, periods: [period('2026-10-04T06:00:00.000Z'), period(null)] }), succ], edges);
      expect(span(reopened, B)).toBe('2026-10-10..2026-10-11 chained');
      // an actual end with no plan at all still chains
      const unplanned = planOf([fnode(A, { periods: [period('2026-10-04T06:00:00.000Z')] }), succ], edges);
      expect(span(unplanned, B)).toBe('2026-10-05..2026-10-06 chained');
      expect(planFlow.length).toBe(1); // the function takes one argument: there is no `today` to pass
    });
  });

  describe('29.193 any versus wait-for-all', () => {
    it('29.193 any = the earliest predecessor end + 1; waitForAll = the latest + 1, and an unknown end leaves it unscheduled', () => {
      const nodes = (waitForAll: boolean, withY: boolean): FlowNode[] => [
        fnode(A, { explicitDue: '2026-10-05' }),
        withY ? fnode(B, { explicitDue: '2026-10-09' }) : fnode(B), // B has no plan when withY is false
        fnode(C, { estimate: 2, waitForAll }),
      ];
      const edges = [edge(A, C), edge(B, C)];
      expect(span(planOf(nodes(false, true), edges), C)).toBe('2026-10-06..2026-10-07 chained');
      expect(span(planOf(nodes(true, true), edges), C)).toBe('2026-10-10..2026-10-11 chained');
      // any ignores the predecessor with no end; waitForAll cannot know when it is ready
      expect(span(planOf(nodes(false, false), edges), C)).toBe('2026-10-06..2026-10-07 chained');
      expect(get(planOf(nodes(true, false), edges), C)).toEqual({ intervals: [], unscheduled: 'no-dates', onTimeline: false });
    });
  });

  describe('29.194 loop edges are not chained', () => {
    it('29.194 the mockup loop 146 -> 143 gives GN-143 no ready day from GN-146; GN-143 chains from GN-141 only', () => {
      const m = mockup();
      const nodes = m.nodes({
        '140': { explicitDue: '2026-10-01' },
        '141': { estimate: 2 },
        '143': { estimate: 1, waitForAll: true }, // waitForAll would wait for the late GN-146 if the loop edge counted
        '146': { explicitDue: '2026-10-20' },
      });
      const p = planFlow({ nodes, edges: m.edges() });
      expect(span(p, m.ids['141'])).toBe('2026-10-02..2026-10-03 chained');
      expect(span(p, m.ids['143'])).toBe('2026-10-04..2026-10-04 chained'); // not 2026-10-21
      // CONTROL: a forward edge from the same late ticket does feed its successor
      const forward = planFlow({ nodes: [fnode(A, { explicitDue: '2026-10-20' }), fnode(B, { estimate: 1 })], edges: [edge(A, B)] });
      expect(span(forward, B)).toBe('2026-10-21..2026-10-21 chained');
    });
  });

  /** d (Decision) -> x 'Yes', -> y 'No'; x -> t, y -> t. */
  const diamondEdges = [edge(D, A, 'Yes'), edge(D, B, 'No'), edge(A, C), edge(B, C)];
  const diamond = (over: { d?: Partial<FlowNode>; a?: Partial<FlowNode>; b?: Partial<FlowNode>; c?: Partial<FlowNode> } = {}): FlowNode[] => [
    decision(D, { explicitDue: '2026-10-06', ...over.d }),
    fnode(A, { estimate: 1, ...over.a }),
    fnode(B, { estimate: 3, ...over.b }),
    fnode(C, { estimate: 2, ...over.c }),
  ];

  describe('29.195 decisions: pruned ghosts and revisions', () => {
    it('29.195 before a choice both branches are planned; after one the other branch is a pruned ghost that no live ticket chains from', () => {
      const undecided = planOf(diamond(), diamondEdges);
      expect(span(undecided, A)).toBe('2026-10-07..2026-10-07 chained');
      expect(span(undecided, B)).toBe('2026-10-07..2026-10-09 chained');
      expect(span(undecided, C)).toBe('2026-10-08..2026-10-09 chained'); // any: min(end A, end B) = 10-07, +1
      expect(get(undecided, A).intervals[0]).not.toHaveProperty('pruned');

      const decided = planOf(diamond({ d: { outcome: 'No', category: 'terminal', stateId: 'done' } }), diamondEdges);
      expect(get(decided, A).intervals[0]).toMatchObject({ start: '2026-10-07', end: '2026-10-07', pruned: true });
      expect(get(decided, A).onTimeline).toBe(false);
      expect(get(decided, B).intervals[0]).not.toHaveProperty('pruned');
      // the tail is live through B alone: ready 10-10, not 10-08 from the pruned ghost
      expect(span(decided, C)).toBe('2026-10-10..2026-10-11 chained');
    });

    it('29.195 a revised Decision ends at the later of its period end and its latest revision, so the new branch chains from the revision', () => {
      const base = {
        outcome: 'No',
        category: 'terminal' as const,
        periods: [period('2026-10-06T08:00:00.000Z')],
        passes: [{ pass: 1, outcome: 'No', by: 'u', at: '2026-10-06T08:00:00.000Z', revisions: [] as Array<{ from: string | null; to: string | null; by: string; at: string }> }],
      };
      const plain = planOf(diamond({ d: base }), diamondEdges);
      expect(span(plain, B)).toBe('2026-10-07..2026-10-09 chained');
      const revised = planOf(
        diamond({ d: { ...base, passes: [{ ...base.passes[0]!, revisions: [{ from: 'Yes', to: 'No', by: 'u', at: '2026-10-09T08:00:00.000Z' }] }] } }),
        diamondEdges,
      );
      expect(span(revised, B)).toBe('2026-10-10..2026-10-12 chained');
      // a revision before the period end changes nothing (max, not last)
      const early = planOf(
        diamond({ d: { ...base, passes: [{ ...base.passes[0]!, revisions: [{ from: 'Yes', to: 'No', by: 'u', at: '2026-10-05T08:00:00.000Z' }] }] } }),
        diamondEdges,
      );
      expect(span(early, B)).toBe('2026-10-07..2026-10-09 chained');
    });

    it('29.195 waitForAll on the shared tail waits for the branch taken only, and a Not-taken source is not a predecessor', () => {
      const tail = planOf(diamond({ d: { outcome: 'Yes', category: 'terminal' }, c: { waitForAll: true } }), diamondEdges);
      expect(span(tail, C)).toBe('2026-10-08..2026-10-09 chained'); // waits for A (10-07), not for the pruned B (10-09)
      const notTaken = { kind: 'not-taken' as const, decisionTicketId: D, outcome: 'Yes', pass: 1 };
      const stale = planOf(diamond({ d: { outcome: 'Yes', category: 'terminal' }, b: { notTaken, category: 'terminal' }, c: { waitForAll: true } }), diamondEdges);
      expect(span(stale, C)).toBe('2026-10-08..2026-10-09 chained');
    });
  });

  /**
   * a -> b -> d (Decision); d -> a 'Again' (the loop), d -> e 'Done'.
   * Pass 1 ran: a ended 10-07, b ended 10-10, d ended 10-12 (so d's planned pass 1 is 10-11, the day after b).
   */
  function loopWorld(over: { passes?: number } = {}) {
    const closedPass1 = (end: string) => [period(end, 1)];
    const reset = (over.passes ?? 2) >= 2;
    const nodes = [
      fnode(A, { explicitStart: '2026-10-05', estimate: 3, reworkEstimate: 2, rounds: reset ? 2 : 1, periods: closedPass1('2026-10-07T06:00:00.000Z') }),
      fnode(B, { estimate: 2, rounds: reset ? 2 : 1, periods: closedPass1('2026-10-10T06:00:00.000Z') }),
      decision(D, {
        estimate: 1,
        rounds: reset ? 2 : 1,
        periods: closedPass1('2026-10-12T06:00:00.000Z'),
        outcome: reset ? null : 'Again',
        passes: [{ pass: 1, outcome: 'Again', by: 'u', at: '2026-10-12T06:00:00.000Z', revisions: [] }],
      }),
      fnode(E, { estimate: 2 }),
    ];
    const edges = [edge(A, B), edge(B, D), edge(D, A, 'Again'), edge(D, E, 'Done')];
    return { nodes, edges };
  }

  describe('29.196 passes: a loop re-runs its body', () => {
    it('29.196 pass 2 chains from the Decision pass-1 finish with the rework estimate; pass 1 is kept; explicit dates are pass 1 only', () => {
      const { nodes, edges } = loopWorld();
      const p = planOf(nodes, edges);
      expect(p.get(A)?.intervals.map((i) => `${i.pass}:${i.start}..${i.end}:${i.basis}`)).toEqual([
        '1:2026-10-05..2026-10-07:explicit',
        '2:2026-10-13..2026-10-14:chained', // D ended 10-12: the target starts the day after, two days (rework estimate)
      ]);
      expect(p.get(B)?.intervals.map((i) => `${i.pass}:${i.start}..${i.end}`)).toEqual([
        '1:2026-10-08..2026-10-09', // chained from A's ACTUAL pass-1 end (10-07), not its plan
        '2:2026-10-15..2026-10-16', // A pass 2 ends 10-14; no rework estimate, so the estimate (2)
      ]);
      expect(p.get(D)?.intervals.map((i) => `${i.pass}:${i.start}..${i.end}`)).toEqual(['1:2026-10-11..2026-10-11', '2:2026-10-17..2026-10-17']);
      // a node that does not run again has pass 1 only
      expect(get(p, E).intervals.map((i) => i.pass)).toEqual([1]);
      expect(get(p, A).unscheduled).toBeNull();
    });

    it('29.196 what leaves the loop chains from the loop\'s LAST run, not from the pass-1 finish', () => {
      const { nodes, edges } = loopWorld();
      const p = planOf(nodes, edges);
      expect(span(p, E)).toBe('2026-10-18..2026-10-19 chained'); // D pass 2 ends 10-17
      // CONTROL: before any loop outcome there is one pass and E follows the actual pass-1 finish
      const once = loopWorld({ passes: 1 });
      const q = planOf(
        once.nodes.map((n) => (n.id === D ? { ...n, passes: [], outcome: null } : n)),
        once.edges,
      );
      expect(span(q, E)).toBe('2026-10-13..2026-10-14 chained');
    });

    it('29.196 a pass with no estimate is unscheduled "no-estimate" while pass 1 keeps its interval; a loop outcome not yet reset still plans the target\'s next pass', () => {
      const { nodes, edges } = loopWorld();
      const noRework = nodes.map((n) => (n.id === A ? { ...n, estimate: null, reworkEstimate: null, explicitDue: '2026-10-07' } : n));
      const p = planOf(noRework, edges);
      expect(get(p, A).intervals.map((i) => i.pass)).toEqual([1]);
      expect(get(p, A).unscheduled).toBe('no-estimate');
      // the Decision recorded the loop outcome but nothing was reset yet (rounds still 1): the target still gets a pass 2
      const pending = loopWorld({ passes: 1 });
      const q = planOf(pending.nodes, pending.edges);
      expect(get(q, A).intervals.map((i) => i.pass)).toEqual([1, 2]);
      expect(get(q, B).intervals.map((i) => i.pass)).toEqual([1]);
    });
  });

  describe('29.197 who is on the timeline', () => {
    it('29.197 a planned interval or an actual start puts a ticket on the timeline; neither (or only a pruned ghost) does not', () => {
      const p = planOf([
        fnode(A, { explicitDue: '2026-10-05' }),
        fnode(B), // undated, never worked
        fnode(C, { periods: [period(null)], started: true }), // undated but worked: drawn
        fnode(D, { estimate: 2 }), // estimate with no ready day
      ]);
      expect([A, B, C, D].map((id) => get(p, id).onTimeline)).toEqual([true, false, true, false]);
      expect(get(p, C).unscheduled).toBe('no-dates'); // on the timeline AND unscheduled: the bar is actual-only
    });
  });

  describe('29.198 the planner is pure', () => {
    it('29.198 it does not mutate its input and ignores input order', () => {
      const { nodes, edges } = loopWorld();
      const frozenNodes = Object.freeze(nodes.map((n) => Object.freeze({ ...n, periods: Object.freeze([...n.periods]) as FlowNode['periods'] })));
      const frozenEdges = Object.freeze(edges.map((e) => Object.freeze(e)));
      const a = planFlow({ nodes: frozenNodes, edges: frozenEdges });
      const b = planFlow({ nodes: [...frozenNodes].reverse(), edges: [...frozenEdges].reverse() });
      for (const n of nodes) expect(b.get(n.id)).toEqual(a.get(n.id));
    });
  });

  describe('29.199 a half-applied cascade still plans', () => {
    it('29.199 a Decision that recorded a loop outcome before its body was reset (so passes depend on each other) terminates; pass 1 is unchanged', () => {
      // d has not finished and still counts one round, while b and a were already reset to round 2.
      const nodes = [
        fnode(A, { explicitStart: '2026-10-05', estimate: 3, rounds: 2 }),
        fnode(B, { estimate: 2, rounds: 2 }),
        decision(D, { estimate: 1, rounds: 1, passes: [{ pass: 1, outcome: 'Again', by: 'u', at: '2026-10-12T06:00:00.000Z', revisions: [] }] }),
      ];
      const edges = [edge(A, B), edge(B, D), edge(D, A, 'Again')];
      const p = planOf(nodes, edges);
      expect(span(p, A, 0)).toBe('2026-10-05..2026-10-07 explicit');
      expect(span(p, B, 0)).toBe('2026-10-08..2026-10-09 chained');
      // the cycle through passes is cut where it closes: some pass-2 interval is unscheduled, none throws
      const all = [A, B, D].flatMap((id) => get(p, id).intervals);
      expect(all.every((i) => i.start <= i.end)).toBe(true);
    });
  });
  ```

  Run (`slot-run.sh` is `/Users/kiro/my_projects/gisik-nokma-lanes/slot-run.sh`): `slot-run.sh wtg2-t11-red -- pnpm --filter @gisik-nokma/domain exec vitest run test/flow/plan.test.ts --maxWorkers=2 > /tmp/wtg2-t11-red.log 2>&1; tail -30 /tmp/wtg2-t11-red.log`. Expected: FAIL (`planFlow is not a function`).

  Commit: `wtg2 T11: RED planner cases`.

- [ ] **Step 3: `planFlow`**

  `packages/domain/src/flow/plan.ts`:
  ```ts
  import { istDayOf } from '../ist-day.js';
  import { analyzeFlow } from './analysis.js';
  import { effectiveEdges, forwardEdges, liveSet, sameLabel } from './graph.js';
  import { edgeKey, type FlowAnalysis, type FlowEdge, type FlowNode } from './types.js';

  export type PlannedInterval = {
    /** The pass (round) this interval plans; pass 1 is the original plan and is kept when later passes are added. */
    pass: number;
    /** Inclusive IST days, YYYY-MM-DD. */
    start: string;
    end: string;
    basis: 'explicit' | 'chained';
    /** PL-3: an explicit start earlier than the ready day. A warning glyph; never blocking. */
    startsBeforePredecessor?: true;
    /** PL-6: planned as if the branch had been taken; drawn only as a ghost, never a predecessor end. */
    pruned?: true;
  };
  export type UnscheduledReason = 'start-after-due' | 'no-estimate' | 'no-dates';
  export type NodePlan = {
    /** One per planned pass, ascending pass. */
    intervals: PlannedInterval[];
    /** Why the node's LATEST planned pass has no interval, or null when it has one. */
    unscheduled: UnscheduledReason | null;
    /** PL-4: has a non-pruned planned interval, or has actually been worked. */
    onTimeline: boolean;
  };
  export type FlowPlan = Map<string, NodePlan>;

  type Cell = { interval: PlannedInterval | null; reason: UnscheduledReason | null };

  const DAY_MS = 86_400_000;

  function addDays(day: string, n: number): string {
    const at = new Date(Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10))) + n * DAY_MS);
    const pad = (v: number, width: number): string => String(v).padStart(width, '0');
    return `${pad(at.getUTCFullYear(), 4)}-${pad(at.getUTCMonth() + 1, 2)}-${pad(at.getUTCDate(), 2)}`;
  }
  const earliest = (days: readonly string[]): string => days.reduce((a, b) => (b < a ? b : a));
  const latest = (days: readonly string[]): string => days.reduce((a, b) => (b > a ? b : a));

  /**
   * PL-1 to PL-6, pure and clock-free: no function here reads today, so a plan changes only when an
   * event does (an overdue active predecessor does not slide its successors).
   *
   * Passes: pass 1 is planned for every node (the original plan, kept). Pass k >= 2 is planned for a
   * node whose round reached k, and for the target of a back edge whose Decision recorded that loop
   * outcome in pass k - 1. A predecessor that does not re-run in pass k contributes nothing to pass k.
   *
   * Which edges feed a node: a live node is fed only by live, non-Not-taken sources over the effective
   * graph's non-back edges; a pruned node (not live) is planned as if its branch had been taken, so it
   * is fed by every non-back edge.
   */
  export function planFlow(input: { nodes: readonly FlowNode[]; edges: readonly FlowEdge[]; analysis?: FlowAnalysis }): FlowPlan {
    const { nodes, edges } = input;
    const analysis = input.analysis ?? analyzeFlow(nodes, edges);
    const byId = new Map(nodes.map((n) => [n.id, n] as const));
    const live = liveSet(nodes, edges, analysis);
    const effective = new Set(forwardEdges(effectiveEdges(nodes, edges), analysis).map(edgeKey));
    const forward = forwardEdges(edges, analysis).filter((e) => byId.has(e.sourceId) && byId.has(e.targetId));
    const incoming = new Map<string, FlowEdge[]>();
    for (const e of forward) incoming.set(e.targetId, [...(incoming.get(e.targetId) ?? []), e]);
    const loopsInto = new Map<string, FlowEdge[]>();
    for (const e of edges) {
      if (!analysis.backEdges.has(edgeKey(e)) || !byId.get(e.sourceId)?.isDecision || !byId.has(e.targetId)) continue;
      loopsInto.set(e.targetId, [...(loopsInto.get(e.targetId) ?? []), e]);
    }

    /** The Decision recorded this loop edge's outcome in `pass`: the target runs again in pass + 1. */
    const looped = (e: FlowEdge, pass: number): boolean =>
      (byId.get(e.sourceId)?.passes ?? []).some((r) => r.pass === pass && r.outcome !== null && sameLabel(r.outcome, e.label));
    const member = (n: FlowNode, k: number): boolean =>
      k === 1 || n.rounds >= k || (loopsInto.get(n.id) ?? []).some((e) => looped(e, k - 1));
    const maxPass = Math.max(1, ...nodes.map((n) => n.rounds), ...nodes.filter((n) => n.isDecision).map((n) => n.passes.length + 1));

    const lastPass = new Map(
      nodes.map((n) => {
        let last = 1;
        for (let k = 2; k <= maxPass; k += 1) if (member(n, k)) last = k;
        return [n.id, last] as const;
      }),
    );

    const memo = new Map<string, Cell>();
    const busy = new Set<string>();
    /**
     * The plan cell of `id` in pass `k`, or undefined when the node does not run in that pass. Computed
     * on demand and memoised, because the dependencies cross passes: a loop target's pass k reads its
     * Decision's pass k - 1, and a node that does not run again reads its predecessors' LAST pass.
     * A dependency cycle through passes cannot occur on data the settle cascade produced; if one is
     * ever read (a half-applied cascade), the cell in progress answers "no dates" instead of recursing.
     */
    const cellOf = (k: number, id: string): Cell | undefined => {
      const n = byId.get(id);
      if (n === undefined || !member(n, k)) return undefined;
      const key = `${k}:${id}`;
      const hit = memo.get(key);
      if (hit !== undefined) return hit;
      if (busy.has(key)) return { interval: null, reason: 'no-dates' };
      busy.add(key);
      const ready = readyDay(n, k);
      const cell = k === 1 ? firstPass(n, ready) : laterPass(n, k, ready);
      busy.delete(key);
      memo.set(key, cell);
      return cell;
    };

    const actualEnd = (n: FlowNode, k: number): string | null => {
      const period = n.periods.filter((p) => p.pass === k).at(-1);
      return period === undefined || period.end === null ? null : istDayOf(period.end);
    };
    /** PL-1: the end of `p` in pass `k`: what happened if the last period of that pass is closed, else the plan, else unknown. */
    const endIn = (p: FlowNode, k: number): string | null => {
      const own = actualEnd(p, k) ?? cellOf(k, p.id)?.interval?.end ?? null;
      const revisions = p.isDecision ? (p.passes.find((r) => r.pass === k)?.revisions ?? []) : [];
      if (revisions.length === 0) return own;
      const revised = latest(revisions.map((r) => istDayOf(r.at)));
      return own === null ? revised : latest([own, revised]);
    };

    /**
     * PL-2: the ready day of `n` in pass `k`, or null when no usable predecessor gives one.
     * A node that runs again later chains from its predecessors' pass k. A node whose last pass is k
     * chains from each predecessor's LAST pass, so what leaves a loop starts after the loop's final run.
     */
    const readyDay = (n: FlowNode, k: number): string | null => {
      const reruns = member(n, k + 1);
      const ends: Array<string | null> = [];
      for (const e of incoming.get(n.id) ?? []) {
        const p = byId.get(e.sourceId);
        if (p === undefined) continue;
        if (live.has(n.id) && !(live.has(p.id) && effective.has(edgeKey(e)) && p.notTaken === null)) continue;
        const pass = reruns ? k : (lastPass.get(p.id) ?? 1);
        if (!member(p, pass) || pass < k) continue;
        ends.push(endIn(p, pass));
      }
      if (k >= 2) {
        for (const e of loopsInto.get(n.id) ?? []) {
          const d = byId.get(e.sourceId);
          if (d !== undefined && looped(e, k - 1)) ends.push(endIn(d, k - 1));
        }
      }
      const known = ends.filter((d): d is string => d !== null);
      if (known.length === 0) return null;
      if (!n.waitForAll) return addDays(earliest(known), 1);
      return known.length === ends.length ? addDays(latest(known), 1) : null;
    };

    const out: FlowPlan = new Map();
    for (const n of nodes) {
      const intervals: PlannedInterval[] = [];
      let last: Cell | undefined;
      for (let k = 1; k <= maxPass; k += 1) {
        const cell = cellOf(k, n.id);
        if (cell === undefined) continue;
        last = cell;
        if (cell.interval !== null) intervals.push(live.has(n.id) ? cell.interval : { ...cell.interval, pruned: true });
      }
      out.set(n.id, {
        intervals,
        unscheduled: last?.interval === null ? (last.reason ?? null) : null,
        onTimeline: intervals.some((i) => i.pruned === undefined) || n.periods.length > 0,
      });
    }
    return out;
  }

  /** PL-3, row by row, in the spec's order: explicit dates win. */
  function firstPass(n: FlowNode, ready: string | null): Cell {
    const { explicitStart: start, explicitDue: due, estimate } = n;
    const made = (from: string, to: string, basis: PlannedInterval['basis']): Cell => ({
      interval: {
        pass: 1,
        start: from,
        end: to,
        basis,
        ...(basis === 'explicit' && start !== null && ready !== null && start < ready ? { startsBeforePredecessor: true as const } : {}),
      },
      reason: null,
    });
    if (start !== null && due !== null) return start > due ? { interval: null, reason: 'start-after-due' } : made(start, due, 'explicit');
    if (start !== null && estimate !== null) return made(start, addDays(start, estimate - 1), 'explicit');
    if (due !== null && estimate !== null) return made(addDays(due, 1 - estimate), due, 'explicit');
    if (start !== null) return made(start, start, 'explicit');
    if (due !== null) return made(due, due, 'explicit');
    if (ready !== null && estimate !== null) return made(ready, addDays(ready, estimate - 1), 'chained');
    return { interval: null, reason: ready !== null ? 'no-estimate' : 'no-dates' };
  }

  /** PL-6: explicit dates belong to pass 1; a later pass is chained and as long as the rework estimate, else the estimate. */
  function laterPass(n: FlowNode, k: number, ready: string | null): Cell {
    const days = n.reworkEstimate ?? n.estimate;
    if (ready === null) return { interval: null, reason: 'no-dates' };
    if (days === null) return { interval: null, reason: 'no-estimate' };
    return { interval: { pass: k, start: ready, end: addDays(ready, days - 1), basis: 'chained' }, reason: null };
  }
  ```

  Add `export * from './plan.js';` to `flow/index.ts`. In `clock-free.test.ts` add, after the `node.ts` line: `expect(files).toContain('plan.ts');`.

  Run: `slot-run.sh wtg2-t11-green -- pnpm --filter @gisik-nokma/domain exec vitest run test/flow --maxWorkers=2 > /tmp/wtg2-t11-green.log 2>&1; tail -30 /tmp/wtg2-t11-green.log`. Expected: PASS (T10's four test files and `plan.test.ts`, 15 tests in the new one). Then `slot-run.sh wtg2-t11-tc -- pnpm --filter @gisik-nokma/domain typecheck > /tmp/wtg2-t11-tc.log 2>&1; tail -20 /tmp/wtg2-t11-tc.log` and the same with `build`. Expected: clean.

  Commit: `wtg2 T11: planFlow`.

- [ ] **Step 4: Flip, Features, mutations, DONE**
  - Flip 29.190-29.199 to ✅ in the same commit; `pnpm check:citations`, `node scripts/check-case-ids.mjs`.
  - **Features** (under `<!-- wtg-part2-model T11 bullet -->`; keep the anchor line, T19 reads the bullets below it): `- ⚙️ **The flow planner** (wtg2 T11; `packages/domain/src/flow/plan.ts`) — plans every ticket in a flow as inclusive IST-day intervals: explicit dates win, otherwise the ticket starts the day after its predecessors end (earliest, or latest with Wait for all) and lasts its estimate; loops get a planned interval per pass, an un-chosen branch is a pruned ghost, and a reason is given for every ticket left unscheduled. Cases 29.190-29.199.`
  - **Mutations** (each applied, the named file run, then reverted; all verified red):

  | Case | Mutation | Expected red |
  |---|---|---|
  | 29.190 | test `start !== null && estimate !== null` before the start-and-due row | the start-and-due test |
  | 29.191 | `start < ready ? { startsBeforePredecessor: true as const } : {}` becomes `... ? {} : {}` | the glyph test |
  | 29.192 | `istDayOf(period.end)` becomes `period.end.slice(0, 10)` | the 19:00Z boundary row |
  | 29.193 | `addDays(latest(known), 1)` becomes `addDays(earliest(known), 1)` | the waitForAll row |
  | 29.194 | `forwardEdges(edges, analysis)` becomes `edges` in BOTH the `incoming` list and the `effective` set (one place alone survives, because the other still filters; case 29.194 kills the two-place form) | the mockup row (4 failures) |
  | 29.195 | delete the `live.has(n.id) && !(...)` continue in `readyDay` | the pruned-ghost test (2 failures) |
  | 29.195 | `return own === null ? revised : latest([own, revised])` becomes `return revised` | the revision test |
  | 29.196 | `const pass = reruns ? k : (lastPass.get(p.id) ?? 1)` becomes `const pass = k` | the exit-chaining test |
  | 29.196 | delete the loop-target predecessor (`if (d !== undefined && looped(e, k - 1)) ends.push(...)`) | the pass-2 start (3 failures) |
  | 29.197 | `|| n.periods.length > 0` removed from `onTimeline` | the worked-undated row |
  | 29.198 | `(nodes as FlowNode[]).sort((a, b) => (a.id < b.id ? 1 : -1));` as the second line of `planFlow` | the frozen-input test throws |
  | 29.199 | delete the `busy` guard line | the half-applied cascade test |
  | 29.186 | add `const __t = new Date();` to `plan.ts` | `clock-free.test.ts` names `plan.ts` |

  Push. DONE + REVIEW (NEEDS: T10 merged).

---

### Task 12: The flow read: ring-by-ring walk, visibility, cap, drafts, route (cases 29.187-29.189)

**Branch:** `task/wtg2-flow-read` from `origin/release/workflow-graph`; PR `--base release/workflow-graph`. **Needs:** T10 (`FlowNode`, `FlowEdge`, `flowNodeOf`); typed-links T2/T3 (`proj_ticket_links`, the `ticket.link_added` projection) and wtg T2 (the `label` column and the `leads_to` kind); and the **Drafts tasks** that add (a) `listMyDrafts(db, userId, workspaceId)` in `apps/server/src/read/drafts.ts` (Drafts R55, the spec's need D-8), (b) `proj_tickets.draft_author_id` / `proj_visibility.draft_author_id` and the `draft_author_id IS NULL` clause inside `visibleTicketsWhere` and `LIVE_TICKET_WHERE` (R19, A3/A4), and (c) `ticket.created {draft: true}` and the `from` member of `ticket.link_added` (R42). **Do not stub any of these:** T12 cannot compile before (a) merges, and the draft cases are meaningless before (b) and (c). T13, T14 and T16 call `readFlow` and nothing else of this task.

**Files:**
- Create: `apps/server/src/flow/read-flow.ts`; `apps/server/src/routes/flow.ts`; `apps/server/test/flow/read-flow.test.ts`
- Modify: `apps/server/src/app.ts` (import beside `registerTicketHistoryRoute`, `:45`; registration directly after `registerTicketHistoryRoute(app, { pool: deps.pool }, requireSession);`, `:945`)
- Catalogue: `test-cases/29-workflow-timeline-graphs.md` under `<!-- wtg-part2-model T12 -->`; `Features.md` §26 under `<!-- wtg-part2-model T12 bullet -->`

**Interfaces:**
- **Consumes:** `visibleTicketsWhere(eff, userId, params)` and `LIVE_TICKET_WHERE` (`apps/server/src/read/visible-where.ts:136`, `:231`); `SqlParams` (`read/sql-params.ts`); `resolveEffectiveRole(db, userId, workspaceId)` (`permissions/effective-role.ts:119`); `rowToTicketState(row)` (`projections/tickets.ts:152`); `foldedWorkflowDefs(db, workspaceId, pairs)` keyed `` `${workflowId}@${version}` `` (`read/workflow-defs.ts`); `keysForAncestors(db, workspaceId, ancestors)` (`read/ancestry.ts:356`); `NOT_FOUND_BODY` (`routes/tickets.ts:53`); `Queryable` (`db/queryable.ts:20`); `flowNodeOf`, `statesWithBacklog`, `FlowNode`, `FlowEdge`, `TicketState` (domain); `listMyDrafts` (Drafts R55; this task reads each row's `ticketId`).
- **Produces:** `readFlow(db: Queryable, args: {workspaceId: string; seedId: string; viewerId: string | null; cap?: number}): Promise<{nodes: FlowNode[]; edges: FlowEdge[]; truncated: boolean; reached: number}>` (the pinned contract shape); `walkFlow(db, args): Promise<FlowWalk>` (the same read plus the folded states, the state names and the `blocks` links, for the route); `FLOW_DEFAULT_CAP = 300`, `FLOW_MAX_RINGS = 30`; `registerFlowRoute(app, deps: {pool: Queryable}, requireSession)` serving `GET /v1/workspaces/:workspaceId/tickets/:ticketId/flow` with `FlowReadWire = {rootId; tickets: FlowTicketWire[]; links: {sourceId; targetId; label: string | null; kind: 'leads_to' | 'blocks'}[]; truncated; reached}` and `FlowTicketWire = {id; key: string | null; title; projectId; assigneeId: string | null; stateName; node: FlowNode}`. The wire is transitional: Part 3 T3 owns `GET …/flow` and replaces this route and `FlowReadWire` with its rich `FlowRead` (Part 3 D-W3-4), re-pointing this task's route assertions; Parts 3-5 consume `readFlow` and Part 3's `FlowRead`, never this wire. Keep it small.

**Why one statement per ring and ids only.** The walk (FL-2: "one query per ring, at most 30 rings") needs to know WHICH tickets a viewer may take next, not their rows. Each ring statement returns the ids of tickets that are in this workspace, are linked by `leads_to` to the previous ring, were not seen, and pass the admission test; the rows are fetched ONCE at the end for at most `cap` ids. So a hub with 100 000 neighbours costs ids, not 100 000 folded states. The link scan uses `proj_ticket_links`' primary key (`source_id, target_id, kind`) and its `target_idx` (typed-links T2 DDL), which is what `source_id = ANY(f) OR target_id = ANY(f)` wants.

**Why a hole stops the walk (FL-1).** The admission test is re-asked of every candidate in every ring, and a candidate that fails is never added to `seen`, so nothing is expanded from it. A visible ticket behind a hidden one is therefore NOT reached through it (case 29.187 seeds from both ends). Nothing about the hole leaves the read: not a placeholder, not a count (`reached` counts admitted tickets only), not an edge (the closing statement keeps only links with BOTH ends kept).

**Why the own-draft arm is separate from the visibility test (Drafts R17-R19).** After the Drafts tasks, `LIVE_TICKET_WHERE` and `visibleTicketsWhere` both AND `draft_author_id IS NULL`, even for the owner and in the constant-`TRUE` branch, so a draft can never pass them. The viewer's own drafts therefore come in through an OR arm: `t.ticket_id = ANY(<the ids listMyDrafts returned>) AND t.deleted_at IS NULL`. The ids come from the helper (R55) and not from `t.draft_author_id = viewer` because R18 says an author demoted to guest or removed from the project no longer reaches their drafts, and that rule lives in the helper. Draft-held links in both directions need no extra SQL: R42 stores them in `proj_ticket_links` as `source_id = from ?? entity id`, so the same link scan finds a draft as source and as target.

**No edge to someone else's draft (planner ruling B, 2026-10-04).** The viewer-facing read follows the rule T2 pins for the links read (case 29.126, `ticket-links.test.ts`): a non-author never sees an edge whose end is someone else's draft, nor a count of it. It holds by construction: such a draft fails the admission test (the `draft_author_id IS NULL` clause of `visibleTicketsWhere` / `LIVE_TICKET_WHERE`, and it is not in the viewer's `listMyDrafts`), so it is never `seen`, `reached` never counts it, and the closing statement keeps only links with BOTH ends kept. Case 29.188 asserts it for the owner and another member; the author's read is the control.

**Why `viewerId: null` skips the draft list but keeps `LIVE_TICKET_WHERE` (spec AP-3, cases 29.188).** The system read (promoter, settler, sweep) must not ask who is looking: a hidden source still counts (spec line "a hidden source still counts (the rule ignores visibility)"). But a trashed source "is not in I(T)" and nobody else's draft may be promoted or settled (Drafts R6-R9), so liveness and the draft clause stay. `listMyDrafts` is not called for `null` (there is no user whose drafts they are).

**Why the 31st ring is queried and `reached` is a count of what the walk admitted.** `truncated` must be true when more tickets exist than the answer holds, and a flow whose 31st ring is empty must NOT be marked truncated. So after ring 30 the walk asks the ring statement once more and sets `truncated` only when it returns rows, without adding them. `reached` is the number of tickets admitted before the walk stopped (it stops after the ring in which the count first passes `cap`), which is what the surfaces print as "Showing 300 of the first N reached" (FL-2). The `nodes` are the first `cap` in walk order: the seed, then ring by ring, ascending id inside a ring.

**Why the route returns 404 for every unreadable seed.** A seed the viewer cannot read, one that does not exist and one in another workspace all produce `nodes: []`, and the route answers the one `NOT_FOUND_BODY` for all three (the pattern of `routes/ticket-history.ts:255-330`, where `canSee` guards the same oracle). Verified at drafting time: the walk and its SQL were run against a scratch database on the shared test Postgres with the repo's real migrations, `visible-where.ts` with the Drafts clauses added by hand, and a stub for the Drafts helper; the three read cases passed and nine mutations were killed (the table below). The route file typechecks; the real-world test file below is the one thing not run before the plan was written.

- [ ] **Step 1: Case lines**

  Under `<!-- wtg-part2-model T12 -->`, all ❌:
  - `- ❌ **29.187 — a hidden ticket is a hole: the flow read returns no node, no edge, no placeholder and no count for it, does not walk through it (a readable ticket behind it is reached only from its own side), and the route answers a hidden seed with the same 404 as a missing one;** control: the owner, who can read the middle ticket, gets the whole chain with its label, and opens the hidden seed with a 200. Mutation: skip the visibility test in the ring statement, or count the hole in reached → the member's read contains the hidden ticket or reports 2.`
  - `- ❌ **29.188 — the viewer's own draft joins the flow as the source AND as the target of a link, nobody else's does (the owner and the system read see a hole), a deleted ticket and a blocks-only neighbour are not in the flow although their links exist, and viewerId null ignores visibility but never reads a draft; a non-author's read never shows an edge whose end is someone else's draft, nor counts it in `reached` (planner ruling B, the same rule as T2's links read, case 29.126);** control: the author's read of the same flow has all three tickets with the draft flagged, and the system read of the chain still includes the ticket only the owner can read. Mutation: read the author's drafts for a null viewer, drop LIVE_TICKET_WHERE from the ring statement, or let a blocks link extend the walk → the draft, the deleted ticket or the neighbour appears.`
  - `- ❌ **29.189 — the walk goes at most 30 rings out (a 31st that is not empty sets truncated, an empty one does not), past the cap the first cap tickets in ring order are returned with reached counting the ring and no edge to a cut ticket, and the route's wire carries titles, state names, the node, leads_to with its label and blocks between members, and no key for a draft;** control: the same chain seeded in the middle reads all 33 tickets untruncated, and a cap of 6 reads the whole six-ticket star. Mutation: walk a 32nd ring, count reached after the cut, or keep edges whose other end was cut → the chain, the cap or the edge row fails.`

  Commit: `wtg2 T12: case lines for the flow read`.

- [ ] **Step 2: RED tests**

  `apps/server/test/flow/read-flow.test.ts` (world and helpers copied from `test/routes/notes.test.ts:1-80`: `buildReadTestApp`, `world.authOf(role)`, `createTestDatabase`, `afterAll(db.drop)`; events through `applyCommitted`/`makeCommitted`, the seeding shape of `test/helpers/read-scenario.ts:176-189`):
  ```ts
  import { afterAll, beforeAll, describe, expect, it } from 'vitest';
  import { newUlid } from '@gisik-nokma/domain';
  import { readFlow } from '../../src/flow/read-flow.js';
  import type { FlowReadWire } from '../../src/routes/flow.js';
  import { applyCommitted, makeCommitted } from '../helpers/apply.js';
  import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
  import { buildReadTestApp, type ReadRole, type ReadWorld } from '../helpers/read-app.js';

  /**
   * The flow read (wtg Part 2, FL-1 and FL-2) against a REAL database and the REAL route.
   *
   * ## The world
   *
   * `buildReadTestApp` is `routes/notes.test.ts`'s world: a workspace, a project, and four signed-in people, with
   * three tickets this file needs by their roles: `sharedTaskId` (audience: owner and member), `hiddenTaskId`
   * (audience: the owner only) and `taskInEpicId` (project-wide, so the member reads it). They are linked
   * SH -> HI -> TE, so the member can read both ends of a chain whose middle only the owner can read.
   *
   * Events go in through `applyCommitted` (ledger plus every projection, no engine and no listener): this file is
   * about what the read returns for links that exist, not about whether the engine would have accepted them.
   *
   * ## Every absence carries its control in the same `it`
   *
   * A hole, a missing draft and an excluded ticket are all answers a broken read gives for free, so each case that
   * asserts one also reads the same flow as a person who is allowed to see it.
   */

  let db: TestDatabase;
  let rw: ReadWorld;
  let WS: string;
  let PROJECT: string;
  let OWNER: string;
  let MEMBER: string;
  let SH: string;
  let HI: string;
  let TE: string;
  /** A ticket joined to SH by `blocks` only, and one that is deleted but still linked from TE. */
  const BL = newUlid();
  const TR = newUlid();
  /** FA and FB are published; FD is the member's draft. FA -> FD (the draft is the TARGET) and FD -> FB (the draft is the SOURCE). */
  const FA = newUlid();
  const FB = newUlid();
  const FD = newUlid();

  const created = (id: string, title: string, over: Record<string, unknown> = {}, actorId = OWNER) =>
    makeCommitted({
      workspaceId: WS,
      actorId,
      entity: { kind: 'ticket', id },
      type: 'ticket.created',
      payload: { typeId: 'task', projectId: PROJECT, parentId: null, title, ...over },
    });
  /** A link filed on the SOURCE's own stream, as typed-links T2 stores it. */
  const link = (source: string, target: string, kind: 'leads_to' | 'blocks' = 'leads_to', actorId = OWNER, label?: string) =>
    makeCommitted({
      workspaceId: WS,
      actorId,
      entity: { kind: 'ticket', id: source },
      type: 'ticket.link_added',
      payload: { kind, targetId: target, ...(label === undefined ? {} : { label }) },
    });

  beforeAll(async () => {
    db = await createTestDatabase();
    rw = await buildReadTestApp(db);
    WS = rw.world.workspaceId;
    PROJECT = rw.world.projectId;
    OWNER = rw.userIds.owner;
    MEMBER = rw.userIds.member;
    SH = rw.world.sharedTaskId;
    HI = rw.world.hiddenTaskId;
    TE = rw.world.taskInEpicId;
    await applyCommitted(db.pool, [
      created(BL, 'Blocks only neighbour'),
      created(TR, 'Soon deleted'),
      link(SH, HI),
      link(HI, TE, 'leads_to', OWNER, 'Yes'),
      link(TE, TR),
      link(SH, TE, 'blocks'),
      link(SH, BL, 'blocks'),
      makeCommitted({ workspaceId: WS, actorId: OWNER, entity: { kind: 'ticket', id: TR }, type: 'ticket.deleted', payload: {} }),
      created(FA, 'Published A'),
      created(FB, 'Published B'),
      created(FD, 'My draft', { draft: true }, MEMBER),
      link(FD, FB, 'leads_to', MEMBER),
      // Drafts R42: a link whose TARGET is the draft is filed on the DRAFT's stream with `from` naming the source.
      makeCommitted({
        workspaceId: WS,
        actorId: MEMBER,
        entity: { kind: 'ticket', id: FD },
        type: 'ticket.link_added',
        payload: { kind: 'leads_to', targetId: FD, from: FA },
      }),
    ]);
  });

  afterAll(async () => {
    await db.drop();
  });

  const nodeIds = (read: { nodes: Array<{ id: string }> }): string[] => read.nodes.map((n) => n.id).sort();
  const edgeKeys = (read: { edges: Array<{ sourceId: string; targetId: string; label: string | null }> }): string[] =>
    read.edges.map((e) => `${e.sourceId}>${e.targetId}:${e.label}`).sort();
  const get = (role: ReadRole, ticketId: string) =>
    rw.app.inject({ method: 'GET', url: `/v1/workspaces/${WS}/tickets/${ticketId}/flow`, headers: rw.authOf(role) });

  describe('29.187 a hidden ticket is a hole', () => {
    it('29.187 the read drops it: no stub, no count, and the walk does not pass through it', async () => {
      const member = await readFlow(db.pool, { workspaceId: WS, seedId: SH, viewerId: MEMBER });
      expect(nodeIds(member)).toEqual([SH]);
      expect(member.edges).toEqual([]);
      expect(member.reached).toBe(1); // the hidden ticket is not counted
      expect(member.truncated).toBe(false);
      expect(Object.keys(member).sort()).toEqual(['edges', 'nodes', 'reached', 'truncated']); // no `hidden: 1`, no placeholder
      expect(JSON.stringify(member)).not.toContain(HI);

      // CONTROL: the owner can read HI, so the same flow is the whole chain, with the label
      const owner = await readFlow(db.pool, { workspaceId: WS, seedId: SH, viewerId: OWNER });
      expect(nodeIds(owner)).toEqual([HI, SH, TE].sort());
      expect(edgeKeys(owner)).toEqual([`${HI}>${TE}:Yes`, `${SH}>${HI}:null`].sort());
      expect(owner.reached).toBe(3);

      // TE is readable by the member but sits behind the hole: seeded from TE the member reaches TE alone
      expect(nodeIds(await readFlow(db.pool, { workspaceId: WS, seedId: TE, viewerId: MEMBER }))).toEqual([TE]);
      // a hidden ticket as the seed is the empty read (the route turns it into a 404)
      expect(await readFlow(db.pool, { workspaceId: WS, seedId: HI, viewerId: MEMBER })).toEqual({ nodes: [], edges: [], truncated: false, reached: 0 });
      // a signed-in person who is not in the workspace reads nothing
      expect((await readFlow(db.pool, { workspaceId: WS, seedId: SH, viewerId: rw.userIds.stranger })).nodes).toEqual([]);
    });

    it('29.187 through the route: a hidden seed answers the same 404 as a missing one, and the wire carries no trace of the hole', async () => {
      const hidden = await get('member', HI);
      const missing = await get('member', newUlid());
      expect(hidden.statusCode).toBe(404);
      expect(hidden.json()).toEqual(missing.json());
      const member = await get('member', SH);
      expect(member.statusCode).toBe(200);
      const body = member.json() as FlowReadWire;
      expect(body.tickets.map((t) => t.id)).toEqual([SH]);
      expect(body.links).toEqual([]);
      expect(JSON.stringify(body)).not.toContain('Salary review'); // the hidden ticket's title
      // CONTROL: the owner opens the same hidden ticket as a seed
      expect((await get('owner', HI)).statusCode).toBe(200);
    });
  });

  describe('29.188 drafts, deleted tickets, links that do not extend a flow, and the system read', () => {
    it('29.188 the viewer\'s own draft joins the flow in both directions; nobody else\'s does, and the system read never sees one', async () => {
      const author = await readFlow(db.pool, { workspaceId: WS, seedId: FA, viewerId: MEMBER });
      expect(nodeIds(author)).toEqual([FA, FB, FD].sort());
      expect(author.nodes.filter((n) => n.draft).map((n) => n.id)).toEqual([FD]);
      expect(edgeKeys(author)).toEqual([`${FA}>${FD}:null`, `${FD}>${FB}:null`].sort()); // draft as target AND as source
      expect(nodeIds(await readFlow(db.pool, { workspaceId: WS, seedId: FD, viewerId: MEMBER }))).toEqual([FA, FB, FD].sort());

      // CONTROL's other half: the workspace owner, whose reach is otherwise everything, sees a hole
      const owner = await readFlow(db.pool, { workspaceId: WS, seedId: FA, viewerId: OWNER });
      expect(nodeIds(owner)).toEqual([FA]);
      expect(owner.edges).toEqual([]);
      expect(owner.reached).toBe(1); // ruling B: no edge to someone else's draft and no count of it (T2's 29.126 is the links-read twin)
      expect((await readFlow(db.pool, { workspaceId: WS, seedId: FD, viewerId: OWNER })).nodes).toEqual([]);
      // the system read (viewerId null: the promoter, the settler, the sweep) ignores visibility but never reads a draft
      expect(nodeIds(await readFlow(db.pool, { workspaceId: WS, seedId: FA, viewerId: null }))).toEqual([FA]);
    });

    it('29.188 a deleted ticket and a blocks-only neighbour are not in the flow although their links exist; viewerId null ignores visibility', async () => {
      const stored = await db.pool.query<{ source_id: string; target_id: string; kind: string }>(
        'SELECT source_id, target_id, kind FROM proj_ticket_links WHERE source_id = ANY ($1::text[])',
        [[TE, SH]],
      );
      const rows = stored.rows.map((r) => `${r.source_id}>${r.target_id}:${r.kind}`);
      expect(rows).toEqual(expect.arrayContaining([`${TE}>${TR}:leads_to`, `${SH}>${BL}:blocks`]));

      const owner = await readFlow(db.pool, { workspaceId: WS, seedId: SH, viewerId: OWNER });
      expect(nodeIds(owner)).toEqual([HI, SH, TE].sort()); // neither TR (deleted) nor BL (blocks)
      // viewerId null: the hidden ticket IS read (the rule engine for promotion does not ask who is looking)
      const system = await readFlow(db.pool, { workspaceId: WS, seedId: SH, viewerId: null });
      expect(nodeIds(system)).toEqual([HI, SH, TE].sort());
      expect(system.nodes.every((n) => n.trashed === false && n.draft === false)).toBe(true);
    });
  });

  describe('29.189 the cap, truncated, reached, the ring limit, and the wire', () => {
    async function seedChain(length: number): Promise<string[]> {
      const ids = Array.from({ length }, () => newUlid());
      await applyCommitted(db.pool, [
        ...ids.map((id, i) => created(id, `Chain ${i}`)),
        ...ids.slice(1).map((id, i) => link(ids[i] as string, id)),
      ]);
      return ids;
    }

    it('29.189 at most 30 rings out from the seed; a 31st that is not empty sets truncated', async () => {
      const chain = await seedChain(33);
      const head = await readFlow(db.pool, { workspaceId: WS, seedId: chain[0] as string, viewerId: OWNER });
      expect(head.nodes).toHaveLength(31); // the seed and rings 1 to 30
      expect(head.nodes.at(-1)?.id).toBe(chain[30]);
      expect([head.truncated, head.reached]).toEqual([true, 31]);
      // CONTROL: seeded in the middle the same chain is 16 rings each way, so all 33 are read and nothing is cut
      const middle = await readFlow(db.pool, { workspaceId: WS, seedId: chain[16] as string, viewerId: OWNER });
      expect([middle.nodes.length, middle.truncated, middle.reached, middle.edges.length]).toEqual([33, false, 33, 32]);
    });

    it('29.189 past the cap the first `cap` tickets in ring order are returned, reached counts the ring, and no edge reaches a cut ticket', async () => {
      const hub = newUlid();
      const leaves = Array.from({ length: 5 }, () => newUlid()).sort();
      await applyCommitted(db.pool, [created(hub, 'Hub'), ...leaves.map((id, i) => created(id, `Leaf ${i}`)), ...leaves.map((id) => link(hub, id))]);
      const capped = await readFlow(db.pool, { workspaceId: WS, seedId: hub, viewerId: OWNER, cap: 3 });
      expect(capped.nodes.map((n) => n.id)).toEqual([hub, leaves[0], leaves[1]]); // seed first, then ascending id inside the ring
      expect([capped.truncated, capped.reached]).toEqual([true, 6]);
      expect(edgeKeys(capped)).toEqual([`${hub}>${leaves[0]}:null`, `${hub}>${leaves[1]}:null`].sort());
      // CONTROL: room for all six
      const roomy = await readFlow(db.pool, { workspaceId: WS, seedId: hub, viewerId: OWNER, cap: 6 });
      expect([roomy.nodes.length, roomy.truncated, roomy.reached, roomy.edges.length]).toEqual([6, false, 6, 5]);
    });

    it('29.189 the wire: titles, keys, state names, the node, leads_to with its label and blocks drawn between members; a draft has no key', async () => {
      const owner = await get('owner', SH);
      expect(owner.statusCode).toBe(200);
      const body = owner.json() as FlowReadWire;
      expect(body.rootId).toBe(SH);
      expect(body.tickets.map((t) => t.id).sort()).toEqual([HI, SH, TE].sort());
      const shared = body.tickets.find((t) => t.id === SH);
      expect(shared).toMatchObject({ title: 'Renew the trade licence', stateName: 'Waiting on counterparty' });
      expect(shared?.node).toMatchObject({ id: SH, stateId: 'waiting', category: 'active', draft: false });
      const links = body.links.map((l) => `${l.kind}:${l.sourceId}>${l.targetId}:${l.label}`).sort();
      expect(links).toEqual([`blocks:${SH}>${TE}:null`, `leads_to:${HI}>${TE}:Yes`, `leads_to:${SH}>${HI}:null`].sort());
      expect([body.truncated, body.reached]).toEqual([false, 3]);

      const author = (await get('member', FA)).json() as FlowReadWire;
      const draft = author.tickets.find((t) => t.id === FD);
      expect(draft?.key).toBeNull();
      expect(draft?.node.draft).toBe(true);
      expect(author.tickets.find((t) => t.id === FA)?.node.draft).toBe(false); // CONTROL: a published ticket is not flagged
    });
  });
  ```

  Build first (the server reads the domain's `dist`): `slot-run.sh wtg2-t12-build -- pnpm --filter @gisik-nokma/domain build > /tmp/wtg2-t12-build.log 2>&1; tail -20 /tmp/wtg2-t12-build.log`. Run (`slot-run.sh` is `/Users/kiro/my_projects/gisik-nokma-lanes/slot-run.sh`; the tests use the shared test Postgres on 54329, `TEST_DATABASE_ADMIN_URL`): `slot-run.sh wtg2-t12-red -- pnpm --filter @gisik-nokma/server exec vitest run test/flow/read-flow.test.ts --maxWorkers=2 > /tmp/wtg2-t12-red.log 2>&1; tail -30 /tmp/wtg2-t12-red.log`. Expected: FAIL (`Failed to resolve import "../../src/flow/read-flow.js"`).

  Commit: `wtg2 T12: RED flow read cases`.

- [ ] **Step 3: The walk**

  `apps/server/src/flow/read-flow.ts`. Before pasting, open `apps/server/src/read/drafts.ts` (the Drafts task) and check what `listMyDrafts` returns: this file reads `draft.ticketId` on each row (the single line `(await listMyDrafts(db, viewer.id, workspaceId)).map((draft) => draft.ticketId)`); if the row names its id differently, change that line only.
  ```ts
  import { flowNodeOf, statesWithBacklog, type FlowEdge, type FlowNode, type TicketState } from '@gisik-nokma/domain';
  import type { Queryable } from '../db/queryable.js';
  import { resolveEffectiveRole } from '../permissions/effective-role.js';
  import { rowToTicketState } from '../projections/tickets.js';
  import { listMyDrafts } from '../read/drafts.js';
  import { SqlParams } from '../read/sql-params.js';
  import { foldedWorkflowDefs } from '../read/workflow-defs.js';
  import { LIVE_TICKET_WHERE, visibleTicketsWhere } from '../read/visible-where.js';

  /** FL-2: a flow shows at most this many tickets. */
  export const FLOW_DEFAULT_CAP = 300;
  /** FL-2: the walk goes at most this many rings out from the ticket it was asked about. */
  export const FLOW_MAX_RINGS = 30;

  export type FlowReadArgs = {
    workspaceId: string;
    seedId: string;
    /** `null` = ignore visibility (the promoter, the settler and the sweep act for the system). Drafts are never read for `null`. */
    viewerId: string | null;
    cap?: number;
  };

  export type FlowRead = {
    /** The seed first, then ring by ring (ascending id inside a ring). Empty when the seed is not readable by the viewer. */
    nodes: FlowNode[];
    /** `leads_to` links with both ends in `nodes`. */
    edges: FlowEdge[];
    /** More tickets exist than `nodes` holds: the cap was passed, or a 31st ring is not empty. */
    truncated: boolean;
    /** How many tickets the walk admitted before it stopped (never counts a ticket the viewer cannot see). */
    reached: number;
  };

  export type FlowWalk = {
    read: FlowRead;
    /** The folded state of each returned node, for the route's titles and keys. */
    states: Map<string, TicketState>;
    /** The display name of each node's current state, in the workflow version the ticket is folded to. */
    stateNames: Map<string, string>;
    /** `blocks` links with both ends in `nodes`: drawn fainter, never part of the walk (FL-1). */
    blocks: Array<{ sourceId: string; targetId: string }>;
  };

  type TicketRow = Parameters<typeof rowToTicketState>[0];
  type LinkRow = { source_id: string; target_id: string; kind: 'leads_to' | 'blocks'; label: string | null };

  /**
   * FL-1, FL-2. The flow of `seedId` for one viewer: the weakly connected component over `leads_to`, walked ring by
   * ring, one statement per ring.
   *
   * A ticket is admitted when it is in this workspace, live, and either visible to the viewer or one of the viewer's
   * OWN drafts. Anything else is a HOLE: it is not returned, it is not counted, its links are dropped, and the walk
   * does not pass through it, so a visible ticket behind a hidden one is not reached through it.
   */
  export async function walkFlow(db: Queryable, args: FlowReadArgs): Promise<FlowWalk> {
    const { workspaceId, seedId } = args;
    const cap = Math.max(1, args.cap ?? FLOW_DEFAULT_CAP);
    const viewer =
      args.viewerId === null ? null : { id: args.viewerId, eff: await resolveEffectiveRole(db, args.viewerId, workspaceId) };
    const ownDrafts = viewer === null ? [] : (await listMyDrafts(db, viewer.id, workspaceId)).map((draft) => draft.ticketId);

    const admit = async (from: { seedId: string } | { frontier: readonly string[] }, seen: ReadonlySet<string>): Promise<string[]> => {
      const params = new SqlParams();
      const ws = params.add(workspaceId);
      const seenParam = params.add([...seen]);
      let reach: string;
      if ('seedId' in from) {
        reach = `t.ticket_id = ${params.add(from.seedId)}`;
      } else {
        const f = params.add(from.frontier);
        reach =
          `t.ticket_id IN (SELECT CASE WHEN l.source_id = ANY (${f}::text[]) THEN l.target_id ELSE l.source_id END ` +
          `FROM proj_ticket_links l WHERE l.workspace_id = ${ws} AND l.kind = 'leads_to' ` +
          `AND (l.source_id = ANY (${f}::text[]) OR l.target_id = ANY (${f}::text[])))`;
      }
      const seeable = viewer === null ? 'TRUE' : visibleTicketsWhere(viewer.eff, viewer.id, params);
      const own =
        ownDrafts.length === 0 ? 'FALSE' : `(t.ticket_id = ANY (${params.add(ownDrafts)}::text[]) AND t.deleted_at IS NULL)`;
      const { rows } = await db.query<{ ticket_id: string }>(
        `SELECT t.ticket_id
           FROM proj_tickets t
           JOIN proj_visibility v ON v.ticket_id = t.ticket_id
          WHERE t.workspace_id = ${ws}
            AND t.ticket_id <> ALL (${seenParam}::text[])
            AND ${reach}
            AND ((${LIVE_TICKET_WHERE} AND ${seeable}) OR ${own})
          ORDER BY t.ticket_id`,
        params.toArray(),
      );
      return rows.map((row) => row.ticket_id);
    };

    const seen = new Set<string>();
    const order: string[] = [];
    let truncated = false;
    let frontier = await admit({ seedId }, seen);
    for (let ring = 0; frontier.length > 0; ring += 1) {
      for (const id of frontier) {
        seen.add(id);
        order.push(id);
      }
      if (order.length > cap) break;
      const next = await admit({ frontier }, seen);
      if (ring === FLOW_MAX_RINGS) {
        truncated = next.length > 0;
        break;
      }
      frontier = next;
    }
    const reached = order.length;
    truncated = truncated || reached > cap;

    const keptIds = order.slice(0, cap);
    if (keptIds.length === 0) {
      return { read: { nodes: [], edges: [], truncated: false, reached: 0 }, states: new Map(), stateNames: new Map(), blocks: [] };
    }
    const { rows: ticketRows } = await db.query<TicketRow>(
      'SELECT t.* FROM proj_tickets t WHERE t.workspace_id = $1 AND t.ticket_id = ANY ($2::text[])',
      [workspaceId, keptIds],
    );
    const rowById = new Map(ticketRows.map((row) => [row.ticket_id, row] as const));
    const states = new Map<string, TicketState>();
    for (const id of keptIds) {
      const row = rowById.get(id);
      // A row purged between the ring statement and this one is simply gone; the next read will not see it either.
      if (row !== undefined) states.set(id, rowToTicketState(row));
    }

    const defs = await foldedWorkflowDefs(
      db,
      workspaceId,
      [...states.values()].map((state) => ({ workflowId: state.workflowId, version: state.workflowVersion })),
    );
    const ownSet = new Set(ownDrafts);
    const nodes: FlowNode[] = [];
    const stateNames = new Map<string, string>();
    for (const state of states.values()) {
      const def = defs.get(`${state.workflowId}@${state.workflowVersion}`);
      if (def === undefined) {
        throw new Error(`walkFlow: no workflow definition ${state.workflowId}@${state.workflowVersion} for ticket ${state.id}; the projection and the ledger disagree`);
      }
      nodes.push(flowNodeOf(state, def, { draft: ownSet.has(state.id) }));
      const known = statesWithBacklog(def).find((s) => s.id === state.stateId);
      if (known === undefined) {
        throw new Error(`walkFlow: ticket ${state.id} is in state ${state.stateId}, which ${state.workflowId}@${state.workflowVersion} does not declare`);
      }
      stateNames.set(state.id, known.name);
    }

    // The induced subgraph, in one statement: both ends kept. An edge to a hole or past the cap is dropped, never half-drawn.
    const nodeIds = nodes.map((node) => node.id);
    const { rows: linkRows } = await db.query<LinkRow>(
      `SELECT source_id, target_id, kind, label
         FROM proj_ticket_links
        WHERE workspace_id = $1 AND kind IN ('leads_to', 'blocks')
          AND source_id = ANY ($2::text[]) AND target_id = ANY ($2::text[])
        ORDER BY source_id, target_id, kind`,
      [workspaceId, nodeIds],
    );
    const edges: FlowEdge[] = linkRows
      .filter((row) => row.kind === 'leads_to')
      .map((row) => ({ sourceId: row.source_id, targetId: row.target_id, label: row.label ?? null }));
    const blocks = linkRows.filter((row) => row.kind === 'blocks').map((row) => ({ sourceId: row.source_id, targetId: row.target_id }));

    return { read: { nodes, edges, truncated, reached }, states, stateNames, blocks };
  }

  /** The contract shape (plan header): what the promoter, the settler, the sweep and the MCP read need. */
  export async function readFlow(db: Queryable, args: FlowReadArgs): Promise<FlowRead> {
    return (await walkFlow(db, args)).read;
  }
  ```

  Run the Step 2 command. Expected: the five `readFlow` tests PASS (29.187 read, both 29.188, 29.189 rings and cap); the two route tests (29.187 route, 29.189 wire) still FAIL (a 404 from an unregistered path).

  Commit: `wtg2 T12: the ring-by-ring flow walk`.

- [ ] **Step 4: The route**

  `apps/server/src/routes/flow.ts` (the registration signature is `registerTicketHistoryRoute`'s, `routes/ticket-history.ts:265-270`; `request.currentUserId` is the augmentation every route file uses):
  ```ts
  import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
  import type { FlowNode, TicketState } from '@gisik-nokma/domain';
  import type { Queryable } from '../db/queryable.js';
  import { walkFlow, type FlowWalk } from '../flow/read-flow.js';
  import { keysForAncestors } from '../read/ancestry.js';
  import { NOT_FOUND_BODY } from './tickets.js';

  export type FlowTicketWire = {
    id: string;
    /** `null` for the viewer's own draft (it has no number yet) and for a workspace with no prefix. */
    key: string | null;
    title: string;
    projectId: string;
    assigneeId: string | null;
    /** The display name of the ticket's current state, in the workflow version it is folded to. */
    stateName: string;
    /** The planner's and the graph's input shape; every fact about the ticket the flow code reads. */
    node: FlowNode;
  };
  export type FlowLinkWire = { sourceId: string; targetId: string; label: string | null; kind: 'leads_to' | 'blocks' };
  export type FlowReadWire = {
    rootId: string;
    tickets: FlowTicketWire[];
    links: FlowLinkWire[];
    truncated: boolean;
    reached: number;
  };

  function titleOf(state: TicketState): string {
    const claim = state.fields['title'];
    if (claim === undefined || typeof claim.value !== 'string') {
      throw new Error(`flow read: ticket ${state.id} has no string title claim; ticket.created writes one, so proj_tickets and the ledger disagree`);
    }
    return claim.value;
  }

  /** The wire form of a walk: the same rows `walkFlow` returned, plus the keys and titles a surface prints. */
  export async function flowWire(db: Queryable, workspaceId: string, rootId: string, walk: FlowWalk): Promise<FlowReadWire> {
    const stateOf = (id: string): TicketState => {
      const state = walk.states.get(id);
      if (state === undefined) throw new Error(`flow read: no state for node ${id}`);
      return state;
    };
    const stateNameOf = (id: string): string => {
      const name = walk.stateNames.get(id);
      if (name === undefined) throw new Error(`flow read: no state name for node ${id}`);
      return name;
    };
    // A draft has no number: leave it out of the key lookup rather than ask for a number that does not exist.
    const keys = await keysForAncestors(
      db,
      workspaceId,
      walk.read.nodes.filter((node) => !node.draft).map((node) => ({ ticketId: node.id, projectId: stateOf(node.id).projectId })),
    );
    return {
      rootId,
      tickets: walk.read.nodes.map((node) => {
        const state = stateOf(node.id);
        return {
          id: node.id,
          key: keys.get(node.id) ?? null,
          title: titleOf(state),
          projectId: state.projectId,
          assigneeId: state.assigneeId,
          stateName: stateNameOf(node.id),
          node,
        };
      }),
      links: [
        ...walk.read.edges.map((e): FlowLinkWire => ({ ...e, kind: 'leads_to' })),
        ...walk.blocks.map((b): FlowLinkWire => ({ ...b, label: null, kind: 'blocks' })),
      ],
      truncated: walk.read.truncated,
      reached: walk.read.reached,
    };
  }

  /**
   * `GET /v1/workspaces/:workspaceId/tickets/:ticketId/flow` (FL-1, FL-2): the flow of one ticket for the signed-in
   * viewer. A seed the viewer cannot read, one that does not exist and one in another workspace all answer the same
   * 404 body, so the route is no oracle (`routes/ticket-history.ts` does the same with `canSee`).
   */
  export function registerFlowRoute(app: FastifyInstance, deps: { pool: Queryable }, requireSession: preHandlerHookHandler): void {
    app.get<{ Params: { workspaceId: string; ticketId: string } }>(
      '/v1/workspaces/:workspaceId/tickets/:ticketId/flow',
      { preHandler: requireSession },
      async (request, reply) => {
        const { workspaceId, ticketId } = request.params;
        const walk = await walkFlow(deps.pool, { workspaceId, seedId: ticketId, viewerId: request.currentUserId });
        if (walk.read.nodes.length === 0) return reply.code(404).send(NOT_FOUND_BODY);
        return flowWire(deps.pool, workspaceId, ticketId, walk);
      },
    );
  }
  ```

  `apps/server/src/app.ts`: add `import { registerFlowRoute } from './routes/flow.js';` after the `registerTicketHistoryRoute` import (`:45`), and after `registerTicketHistoryRoute(app, { pool: deps.pool }, requireSession);` (`:945`):
  ```ts
  // One ticket's flow (wtg Part 2, FL-1): the weakly connected component over "leads to", for the signed-in viewer.
  // Same preHandler by parameter, same reason as its neighbours: the handler reads `request.currentUserId`.
  registerFlowRoute(app, { pool: deps.pool }, requireSession);
  ```
  Run the Step 2 command. Expected: PASS (7 tests). Then `slot-run.sh wtg2-t12-tc -- pnpm --filter @gisik-nokma/server typecheck > /tmp/wtg2-t12-tc.log 2>&1; tail -20 /tmp/wtg2-t12-tc.log`. Expected: clean.

  Commit: `wtg2 T12: the flow route`.

- [ ] **Step 5: Flip, Features, mutations, DONE**
  - Flip 29.187-29.189 to ✅ in the same commit; `pnpm check:citations`, `node scripts/check-case-ids.mjs`. The server suite runs WHOLE (`slot-run.sh wtg2-t12-all -- pnpm --filter @gisik-nokma/server exec vitest run --maxWorkers=2`): `app.ts` gained a route and the route census tests list every registered path.
  - **Features** (under `<!-- wtg-part2-model T12 bullet -->`; keep the anchor line, T19 reads the bullets below it): `- ⚙️ **Flow read** (wtg2 T12; `apps/server/src/flow/read-flow.ts`, `apps/server/src/routes/flow.ts`) — the connected component of a ticket over "leads to" links for one viewer, walked ring by ring: a ticket the viewer cannot read is a hole (no placeholder, no count, not walked through), the viewer's own drafts are included, at most 300 tickets and 30 rings with `truncated` and `reached`; `GET /v1/workspaces/:workspaceId/tickets/:ticketId/flow` serves it. Cases 29.187-29.189.`
  - **Mutations** (each applied to `read-flow.ts`, the file run, then reverted; all nine were run at drafting time against the scratch database, where the same assertions live in three tests, and the Expected-red column names the case of this file that carries each assertion):

  | Case | Mutation | Expected red |
  |---|---|---|
  | 29.187 | `const seeable = viewer === null ? 'TRUE' : visibleTicketsWhere(...)` becomes `const seeable = 'TRUE'` | the member's read contains HI |
  | 29.187 | drop `AND target_id = ANY ($2::text[])` from the closing statement | the member's read keeps an edge to the hole |
  | 29.188 | `ownDrafts.length === 0 ? 'FALSE' :` becomes `true ? 'FALSE' :` | the author's read loses the draft |
  | 29.188 | `ownDrafts` read even for `viewerId: null` | the system read contains the draft |
  | 29.188 | `(${LIVE_TICKET_WHERE} AND ${seeable})` becomes `(${seeable})` | TR (deleted) appears |
  | 29.188 | `AND l.kind = 'leads_to'` becomes `AND l.kind IN ('leads_to','blocks')` in the ring statement | BL appears |
  | 29.189 | delete `AND t.ticket_id <> ALL (${seenParam}::text[])` | the walk re-admits (every case in the file) |
  | 29.189 | `if (ring === FLOW_MAX_RINGS)` becomes `if (ring === FLOW_MAX_RINGS + 1)` | the 33-chain reads 32 tickets |
  | 29.189 | `const reached = order.length` becomes `Math.min(order.length, cap)` | the star reports 3 |

  Push. DONE + REVIEW (NEEDS: T10 merged; Drafts R55 helper, R19 predicates and R42 payload merged; `listMyDrafts` row member re-read).

---

### Task 13: Auto-promotion: `promotionsFor`, the promoter listener (cases 29.210-29.221)

**Branch:** `task/wtg2-promotion` from `origin/release/workflow-graph`; PR `--base release/workflow-graph`. **Needs:** T8 (flow causes, `SYSTEM_ACTOR_FLOW`, `isFlowCause`), T10 (`FlowNode`, `analyzeFlow`, `effectiveEdges`, `sameLabel`), T12 (`readFlow`), T2/T5/T9 transitively (the `leads_to` kind and `proj_ticket_links`, `ticket.decided`, `closed_cause`); Drafts (spec `2026-10-03-drafts-design.md` R55: a committed `ticket.published` event; R39: promotion skips drafts). There is no Drafts plan on any tip yet, so the one Drafts-dependent arm (AP-4's "a draft published") is tested with a hand-built `ticket.published` envelope, and the executor re-reads the Drafts plan's event name before merging.

**Files:**
- Create: `packages/domain/src/flow/promotion.ts`; `packages/domain/test/flow-promotion.test.ts`; `apps/server/src/flow/promote.ts`; `apps/server/test/flow/flow-world.ts` (the shared test world; T14, T16 import it); `apps/server/test/flow/promote.test.ts`; `packages/rule-engine/test/led-to-promotion.test.ts`
- Modify: `packages/domain/src/flow/index.ts` (add `export * from './promotion.js';` after T10's exports); `packages/rule-engine/src/transition.ts` (one clause after the `resolveCurrentStateId` check, `:81-100` at `ec72d1f8`); `packages/rule-engine/src/checks/refusals.ts` (one `REFUSALS` key, beside the `link.*` keys T2 adds); `apps/server/src/app.ts` (register the promoter beside the fan-out, `:1130-1140`)
- Catalogue: `test-cases/29-workflow-timeline-graphs.md` under `<!-- wtg-part2-model T13 -->`; `Features.md` §26 under `<!-- wtg-part2-model T13 bullet -->`

**Interfaces:**
- **Consumes:** `FlowNode`, `FlowEdge`, `edgeKey`, `analyzeFlow(...).backEdges`, `effectiveEdges`, `sameLabel` (T10: re-read `packages/domain/src/flow/index.ts` after T10 merged and fix the three import lines of `promotion.ts` to the files that really hold them; the code below assumes `./types.js`, `./analysis.js`, `./graph.js`); `readFlow(db, {workspaceId, seedId, viewerId: null, cap}) -> {nodes, edges, truncated, reached}` (T12); `isFlowCause`, `SYSTEM_ACTOR_FLOW`, `DECISION_TYPE_ID` (T8, T5); `latestWorkflowDefs` (`apps/server/src/read/workflow-defs.ts:25`); `LIVE_TICKET_WHERE` (`apps/server/src/read/visible-where.ts:231`).
- **Produces:** `promotionsFor(input: {nodes: FlowNode[]; edges: FlowEdge[]; targetIds: readonly string[]}): Promotion[]` and `type Promotion = {targetId: string; sourceTicketId: string; label: string | null}` (domain); server `type FlowIngest = {ingestBatch(events: SubmittedEvent[]): Promise<IngestResult[]>}`, `FLOW_SERVER_CAP = 2000`, `promoteTargets(deps: FlowPromoteDeps, workspaceId: string, targetIds: readonly string[]): Promise<{promoted: number; refused: number; skipped: number}>` (T14 and T16 call it), `triggeredByOf(db, sourceTicketId): Promise<string>`, `createFlowPromoter(deps): {onCommitted(event: EventEnvelope): Promise<void>}`, and the engine refusal `cause.led-to-not-backlog`.

**Why the promoter gets `ingest` as `{ingestBatch}` and app.ts passes `{ingestBatch: deps.serverAppend}`.** `AppDeps.ingest` is the narrowed `ClientIngest` with no `ingestBatch` (`apps/server/src/app.ts:87`); the internal door reaches the app only as the named capability `serverAppend` (`:137`, type `ServerAppend` at `routes/invites.ts:40`). `FlowIngest` accepts the whole `IngestService` too (the daemon passes it), because a function taking `unknown[]` is assignable to one taking `SubmittedEvent[]`.

**Why a flow-caused move into Backlog is a trigger for the moved ticket itself (an addition to AP-4's table).** AP-4 says the target's OWN move into Backlog is not a trigger, meaning a person's "Send to backlog" must stick. A loop or pass-2 settle (PS-5.3) also sends a ticket to Backlog, filed by `SYSTEM_ACTOR_FLOW` with a flow cause, and the Decision's satisfied edge then must promote it. Without this, that ticket would wait for the sweep. The distinction is the actor plus the cause, so a person's move is untouched (29.216).

**Why the engine gets one clause here (T8 owns causes, not this).** `led-to` is not covered by PS-11's exemption, so it rides the ordinary edges. If the target left Backlog and its workflow declares `doing -> todo` (or the target is already in `todo`), a late or duplicated promotion would be accepted and drag in-progress work back. A listener and the daemon sweep both submit promotions, and the daemon's ingest has no gates (`ops/backup-daemon-main.ts:202-206`), so the guard has to be an engine rule. If T8 already added the clause, delete Step 5's engine edit and keep its test.

- [ ] **Step 1: Case lines**

  Under `<!-- wtg-part2-model T13 -->`, all ❌:
  - `- ❌ **29.210 — an edge is satisfied only by a source in the terminal CATEGORY with no not-taken resolution and, from a Decision, only when its outcome equals the edge label after trim and case folding;** control: the same graph with the source active promotes nothing, and a loop-reset Decision (outcome null) satisfies nothing. Mutation: test the `closed` flag instead of the category → the finished-but-unclosed source stops promoting.`
  - `- ❌ **29.211 — with waitForAll the target needs every edge of I*(T): back edges are dropped (unless none remain), edges from a not-taken source and from a Decision's other label are dropped, a Decision with no outcome yet still holds the tail, and an empty I*(T) promotes nothing;** control: one unsatisfied forward edge keeps the target in Backlog, and a revision to the other branch makes the tail wait for the branch now taken. Mutation: keep back edges in I′ → the loop target never promotes.`
  - `- ❌ **29.212 — only a live, non-draft ticket in Backlog is ever promoted; an edge into a ticket in To do, Doing or Done does nothing; a trashed or draft source is not in I(T);** control: the same edge into a live Backlog ticket promotes. Mutation: drop the Backlog test → the To do target is listed.`
  - `- ❌ **29.213 — when several satisfied sources qualify the one named is the latest to finish, then the smallest id, the label is that edge's, and the answer is sorted by target id;** control: a source with no periods loses to one with a period. Mutation: pick the first edge → the older source is named.`
  - `- ❌ **29.214 — a committed finish of the source makes the promoter file ONE ticket.transitioned to the workflow's initial state (a workflow whose first state is not named To do included) as SYSTEM_ACTOR_FLOW, origin server, cause led-to naming the source and the person who finished it;** control: the same link before the finish files nothing. Mutation: hard-code the state id todo → the Kickoff target stays in Backlog.`
  - `- ❌ **29.215 — every AP-4 trigger re-evaluates the right target: transition, decided, deleted and restored on a source, a leads_to link added or removed, waitForAll set, restored on a target, a published draft;** controls: a blocks link, a draft-side (from) link, an assignment and a title edit trigger nothing. Mutation: drop the link_removed arm → the waitForAll row stays in Backlog.`
  - `- ❌ **29.216 — a person's Send to backlog on a promoted target sticks;** control: the next real change (the source finishing again) promotes it again, and a flow-caused move into Backlog IS evaluated. Mutation: evaluate the transitioned ticket itself on every transition → the person's move is undone.`
  - `- ❌ **29.217 — a source the viewer cannot see still counts;** control: a viewer-scoped read of the same flow does not contain it. Mutation: read the flow with a viewer → the target never promotes.`
  - `- ❌ **29.218 — a workflow whose initial state is terminal is skipped and logged (nothing is filed);** control: a default-workflow target in the same call promotes. Mutation: drop the check → the ticket is finished by the Start edge.`
  - `- ❌ **29.219 — a refused or invalid submission is counted and logged, never thrown; a second run files nothing; the engine refuses a led-to move out of any state but Backlog;** control: the same event from Backlog is accepted, and the same Doing to To do move by a person is accepted. Mutation: drop the engine clause → the stale promotion drags a Doing ticket back.`
  - `- ❌ **29.220 — a flow larger than the server cap is skipped and logged, not half-evaluated;** control: the same flow under the cap promotes. Mutation: promote from the truncated read → the waitForAll target promotes without its hidden source.`
  - `- ❌ **29.221 — buildApp subscribes the promoter on the commit feed, fire-and-forget, and unsubscribes it on close; a throwing read is logged and does not reject;** control: after close the same commit files nothing. Mutation: skip the unsubscribe → a closed app still promotes.`

  Commit: `wtg2 T13: case lines 29.210-29.221`.

- [ ] **Step 2: RED domain tests 29.210-29.213**

  `packages/domain/test/flow-promotion.test.ts` (imports as `ticket-link-events.test.ts` does: from `'../src/index.js'`):
  ```ts
  import { describe, expect, it } from 'vitest';
  import { BACKLOG_STATE_ID, promotionsFor, type FlowEdge, type FlowNode } from '../src/index.js';

  const node = (id: string, over: Partial<FlowNode> = {}): FlowNode => ({
    id, typeId: 'task', stateId: 'todo', category: 'open', closed: false, trashed: false, draft: false, parentId: null,
    isDecision: false, outcome: null, passes: [], notTaken: null, waitForAll: false, started: false, rounds: 1, periods: [],
    explicitStart: null, explicitDue: null, estimate: null, reworkEstimate: null, initialStateId: 'todo',
    firstTerminalStateId: 'done', ...over,
  });
  const backlog = (id: string, over: Partial<FlowNode> = {}) => node(id, { stateId: BACKLOG_STATE_ID, ...over });
  const done = (id: string, end = '2026-10-02T09:00:00.000Z', over: Partial<FlowNode> = {}) =>
    node(id, { stateId: 'done', category: 'terminal', periods: [{ start: '2026-10-01T09:00:00.000Z', end, pass: 1 }], ...over });
  const active = (id: string) => node(id, { stateId: 'doing', category: 'active' });
  const NOT_TAKEN = { kind: 'not-taken' as const, decisionTicketId: 'd', outcome: 'No', pass: 1 };
  const edge = (sourceId: string, targetId: string, label: string | null = null): FlowEdge => ({ sourceId, targetId, label });
  const ids = (p: ReturnType<typeof promotionsFor>) => p.map((x) => `${x.sourceTicketId}>${x.targetId}`);

  describe('29.210 the satisfied edge (any)', () => {
    it('29.210 terminal category without a not-taken resolution; a Decision only by its label', () => {
      const run = (source: FlowNode) => promotionsFor({ nodes: [source, backlog('t')], edges: [edge('s', 't')], targetIds: ['t'] });
      expect(ids(run(done('s')))).toEqual(['s>t']);
      expect(run(active('s'))).toEqual([]); // control: same graph, source still active
      expect(run(done('s', undefined, { notTaken: NOT_TAKEN }))).toEqual([]);
      const decide = (outcome: string | null) =>
        promotionsFor({
          nodes: [done('d', undefined, { isDecision: true, outcome }), backlog('y'), backlog('n')],
          edges: [edge('d', 'y', 'yes'), edge('d', 'n', 'No')], targetIds: ['y', 'n'],
        });
      expect(decide('Yes')).toEqual([{ targetId: 'y', sourceTicketId: 'd', label: 'yes' }]); // case-folded
      expect(decide(null)).toEqual([]); // loop-reset Decision satisfies nothing
    });
  });

  describe('29.211 waitForAll and I*(T)', () => {
    it('29.211 every considered edge; back edges, not-taken and other-label edges dropped; empty I* promotes nothing', () => {
      const tail = (over: Partial<FlowNode> = {}) => backlog('t', { waitForAll: true, ...over });
      expect(ids(promotionsFor({ nodes: [done('a'), done('b'), tail()], edges: [edge('a', 't'), edge('b', 't')], targetIds: ['t'] }))).toHaveLength(1);
      // control: one unsatisfied forward edge holds the target
      expect(promotionsFor({ nodes: [done('a'), active('b'), tail()], edges: [edge('a', 't'), edge('b', 't')], targetIds: ['t'] })).toEqual([]);
      // loop: s -> t -> m -> later -> t; later -> t is the back edge, so s alone decides
      const loop = (later: FlowNode, withS: boolean) =>
        promotionsFor({
          nodes: [done('s'), tail(), node('m'), later],
          edges: [...(withS ? [edge('s', 't')] : []), edge('t', 'm'), edge('m', 'later'), edge('later', 't')], targetIds: ['t'],
        });
      expect(loop(active('later'), true)).toHaveLength(1);
      expect(loop(active('later'), false)).toEqual([]); // I' empty, so I(T) = the back edge, unsatisfied
      expect(loop(done('later'), false)).toHaveLength(1);
      // diamond tail: b was closed Not taken, so only a is waited for; with b merely open the tail waits
      const diamond = (b: FlowNode, outcome: string | null) =>
        promotionsFor({
          nodes: [done('d', undefined, { isDecision: true, outcome }), done('a'), b, tail()],
          edges: [edge('d', 'a', 'A'), edge('d', 'b', 'B'), edge('a', 't'), edge('b', 't')], targetIds: ['t'],
        });
      expect(diamond(done('b', undefined, { notTaken: NOT_TAKEN }), 'A')).toHaveLength(1);
      expect(diamond(backlog('b'), 'A')).toEqual([]);
      // revised to B: a (finished with work) stays, but b is now the taken branch and is not done
      expect(diamond(active('b'), 'B')).toEqual([]);
      // a Decision edge straight into the tail: another label drops it, a pending Decision still holds it
      const direct = (outcome: string | null) =>
        promotionsFor({ nodes: [done('d', undefined, { isDecision: true, outcome }), done('a'), tail()], edges: [edge('d', 't', 'B'), edge('a', 't')], targetIds: ['t'] });
      expect(direct('A')).toHaveLength(1);
      expect(direct(null)).toEqual([]);
      // empty I*: the only source is not taken
      expect(promotionsFor({ nodes: [done('s', undefined, { notTaken: NOT_TAKEN }), tail()], edges: [edge('s', 't')], targetIds: ['t'] })).toEqual([]);
    });
  });

  describe('29.212 targets and sources that count', () => {
    it('29.212 Backlog only; live and non-draft; a trashed or draft source is not in I(T)', () => {
      const into = (target: FlowNode) => promotionsFor({ nodes: [done('s'), target], edges: [edge('s', 't')], targetIds: ['t'] });
      expect(ids(into(backlog('t')))).toEqual(['s>t']); // control
      for (const t of [node('t'), active('t'), done('t'), backlog('t', { trashed: true }), backlog('t', { draft: true })]) expect(into(t)).toEqual([]);
      const two = (b: FlowNode) => promotionsFor({ nodes: [done('a'), b, backlog('t', { waitForAll: true })], edges: [edge('a', 't'), edge('b', 't')], targetIds: ['t'] });
      expect(two(active('b'))).toEqual([]); // control: a live open source holds it
      expect(ids(two({ ...active('b'), trashed: true }))).toEqual(['a>t']);
      expect(ids(two({ ...backlog('b'), draft: true }))).toEqual(['a>t']);
    });
  });

  describe('29.213 attribution and order', () => {
    it('29.213 latest finisher, then smallest id; the edge label; sorted by target', () => {
      const pick = (a: FlowNode, b: FlowNode) => promotionsFor({ nodes: [a, b, backlog('t')], edges: [edge('a', 't', 'x'), edge('b', 't', 'y')], targetIds: ['t'] })[0];
      expect(pick(done('a', '2026-10-01T09:00:00.000Z'), done('b', '2026-10-03T09:00:00.000Z'))).toEqual({ targetId: 't', sourceTicketId: 'b', label: 'y' });
      expect(pick(done('a', '2026-10-03T09:00:00.000Z'), done('b', '2026-10-03T09:00:00.000Z'))?.sourceTicketId).toBe('a'); // tie: smallest id
      expect(pick(node('a', { stateId: 'done', category: 'terminal' }), done('b'))?.sourceTicketId).toBe('b'); // control: no period loses
      const many = promotionsFor({ nodes: [done('s'), backlog('z'), backlog('m')], edges: [edge('s', 'z'), edge('s', 'm')], targetIds: ['z', 'm', 'z'] });
      expect(many.map((p) => p.targetId)).toEqual(['m', 'z']);
    });
  });
  ```
  Run: `/Users/kiro/my_projects/gisik-nokma-lanes/slot-run.sh wtg2-t13-dom -- pnpm --filter @gisik-nokma/domain exec vitest run test/flow-promotion.test.ts --maxWorkers=2 > /tmp/wtg2-t13-dom.log 2>&1; tail -30 /tmp/wtg2-t13-dom.log`. Expected: FAIL (`promotionsFor is not a function`).

- [ ] **Step 3: `promotionsFor`**

  `packages/domain/src/flow/promotion.ts`:
  ```ts
  import { BACKLOG_STATE_ID } from '../workflow.js';
  import { analyzeFlow } from './analysis.js';
  import { effectiveEdges, sameLabel } from './graph.js';
  import { edgeKey, type FlowEdge, type FlowNode } from './types.js';

  /** AP-1 to AP-3. Pure and clock-free: the server (promoter, sweep) is its only caller (AP-5). */
  export type Promotion = { targetId: string; sourceTicketId: string; label: string | null };

  /**
   * An edge is satisfied by the source's CATEGORY, never its `closed` flag (spec decision 1: the flag is set days later by the
   * auto-close sweep). A Decision satisfies only the edge whose label is its CURRENT outcome; a loop reset leaves it null.
   */
  function satisfied(source: FlowNode, edge: FlowEdge): boolean {
    if (source.category !== 'terminal' || source.notTaken !== null) return false;
    if (!source.isDecision) return true;
    return source.outcome !== null && edge.label !== null && sameLabel(source.outcome, edge.label);
  }

  type Incoming = { edge: FlowEdge; node: FlowNode };
  const finishedAt = (n: FlowNode): string => n.periods.at(-1)?.end ?? '';

  export function promotionsFor(input: { nodes: FlowNode[]; edges: FlowEdge[]; targetIds: readonly string[] }): Promotion[] {
    const byId = new Map(input.nodes.map((n) => [n.id, n] as const));
    const analysis = analyzeFlow(input.nodes, input.edges);
    const inEffective = new Set(effectiveEdges(input.nodes, input.edges).map(edgeKey));
    const out: Promotion[] = [];
    for (const targetId of [...new Set(input.targetIds)].sort()) {
      const target = byId.get(targetId);
      if (target === undefined || target.stateId !== BACKLOG_STATE_ID || target.trashed || target.draft) continue;
      // I(T): incoming edges from live, published sources. A hidden source is present here on purpose (the read ignores visibility).
      const incoming: Incoming[] = [];
      for (const edge of input.edges) {
        const node = byId.get(edge.sourceId);
        if (edge.targetId === targetId && node !== undefined && !node.trashed && !node.draft) incoming.push({ edge, node });
      }
      incoming.sort((a, b) => (a.edge.sourceId < b.edge.sourceId ? -1 : a.edge.sourceId > b.edge.sourceId ? 1 : 0));
      if (incoming.length === 0) continue;

      let considered: Incoming[];
      if (target.waitForAll) {
        const forward = incoming.filter((i) => !analysis.backEdges.has(edgeKey(i.edge)));
        const base = forward.length > 0 ? forward : incoming; // I′, or I(T) when only back edges remain
        considered = base.filter((i) => inEffective.has(edgeKey(i.edge)) && i.node.notTaken === null); // I*
        if (considered.length === 0 || !considered.every((i) => satisfied(i.node, i.edge))) continue;
      } else {
        considered = incoming.filter((i) => satisfied(i.node, i.edge));
        if (considered.length === 0) continue;
      }
      // The source that just completed the condition: the latest finisher; `incoming` is id-sorted, so a tie keeps the smaller id.
      const pick = considered.reduce((best, cur) => (finishedAt(cur.node) > finishedAt(best.node) ? cur : best));
      out.push({ targetId, sourceTicketId: pick.edge.sourceId, label: pick.edge.label });
    }
    return out;
  }
  ```
  Add `export * from './promotion.js';` to `packages/domain/src/flow/index.ts`. Run the Step 2 command. Expected: PASS. Flip 29.210-29.213 ✅.

  Commit: `wtg2 T13: promotionsFor (AP-1 to AP-3)`.

- [ ] **Step 4: RED server and engine tests 29.214-29.221**

  `apps/server/test/flow/flow-world.ts` (the world every flow task uses; copies `auto-close/sweep.test.ts:111-329`'s `seedWorkflowAndType` / `seedTicket` / `realIngest` shapes, events through `applyCommitted` so no engine or listener runs). All ids must match `ULID_REGEX` (`ids.ts:9`, no `U`) because they pass through `parseEvent`:
  ```ts
  import type { Pool } from 'pg';
  import { evaluateEvent } from '@gisik-nokma/rule-engine';
  import { DECISION_TYPE_ID, newUlid, type LedgerEvent } from '@gisik-nokma/domain';
  import { createIngestService } from '../../src/ingest/ingest-service.js';
  import { buildProjectionRegistry } from '../../src/projections/index.js';
  import { applyCommitted, makeCommitted } from '../helpers/apply.js';

  export const WS = '01J9GWS0000000000000000000';
  export const PROJECT = '01J9GPRJ000000000000000000';
  export const PERSON = '01J9GPRS000000000000000000';
  export const ASSIGNEE = '01J9GASN000000000000000000';
  export const TASK = 'flow-task';
  export const KICKOFF_TASK = 'kickoff-task';
  export const SHIPPED_TASK = 'shipped-task';

  type Def = { id: string; initial: string; states: Array<[string, string, 'open' | 'active' | 'terminal']>; edges: Array<[string, string]> };
  const FLOW: Def = { id: 'wf-flow', initial: 'todo', states: [['todo', 'To do', 'open'], ['doing', 'Doing', 'active'], ['done', 'Done', 'terminal']],
    edges: [['todo', 'doing'], ['doing', 'done'], ['done', 'doing'], ['doing', 'todo']] };
  const KICKOFF: Def = { id: 'wf-kickoff', initial: 'kickoff', states: [['kickoff', 'Kickoff', 'open'], ['working', 'Working', 'active'], ['finished', 'Finished', 'terminal']],
    edges: [['kickoff', 'working'], ['working', 'finished']] };
  const SHIPPED: Def = { id: 'wf-shipped', initial: 'shipped', states: [['shipped', 'Shipped', 'terminal']], edges: [] };

  export async function seedFlowWorld(pool: Pool): Promise<void> {
    const events: LedgerEvent[] = [];
    for (const [def, typeId, rank] of [[FLOW, TASK, 3], [FLOW, DECISION_TYPE_ID, 3], [KICKOFF, KICKOFF_TASK, 3], [SHIPPED, SHIPPED_TASK, 3]] as const) {
      if (!events.some((e) => e.entity.id === def.id)) {
        events.push(makeCommitted({ workspaceId: WS, actorId: PERSON, entity: { kind: 'workflow', id: def.id }, type: 'workflow.defined',
          payload: { id: def.id, version: 1, name: def.id, initialStateId: def.initial,
            states: def.states.map(([id, name, category]) => ({ id, name, category })),
            transitions: def.edges.map(([from, to]) => ({ from, to, rules: [] })) } }));
      }
      events.push(makeCommitted({ workspaceId: WS, actorId: PERSON, entity: { kind: 'ticket-type', id: typeId }, type: 'ticket-type.defined',
        payload: { id: typeId, name: typeId, icon: 'check', rank, workflowId: def.id, fields: [] } }));
    }
    await applyCommitted(pool, events);
  }

  export const realIngest = (pool: Pool) => createIngestService({ pool, evaluate: evaluateEvent, projections: buildProjectionRegistry() });

  export async function step(pool: Pool, ticketId: string, type: string, payload: Record<string, unknown>, actorId = PERSON): Promise<LedgerEvent> {
    const event = makeCommitted({ workspaceId: WS, actorId, entity: { kind: 'ticket', id: ticketId }, type, payload });
    await applyCommitted(pool, [event]);
    return event;
  }

  /** `start: 'backlog'` by default; `start: 'focus'` + `moves` walks it through the workflow's states. */
  export async function addTicket(pool: Pool, o: { typeId?: string; start?: 'backlog' | 'focus'; moves?: string[]; assigneeId?: string } = {}): Promise<string> {
    const id = newUlid();
    await step(pool, id, 'ticket.created', { typeId: o.typeId ?? TASK, projectId: PROJECT, parentId: null, title: `T ${id.slice(-4)}`,
      start: o.start ?? 'backlog', ...(o.assigneeId === undefined ? {} : { assigneeId: o.assigneeId }) });
    for (const to of o.moves ?? []) await step(pool, id, 'ticket.transitioned', { to });
    return id;
  }

  export const lead = (pool: Pool, source: string, target: string, label?: string) =>
    step(pool, source, 'ticket.link_added', { kind: 'leads_to', targetId: target, ...(label === undefined ? {} : { label }) });
  export const unlink = (pool: Pool, source: string, target: string) => step(pool, source, 'ticket.link_removed', { kind: 'leads_to', targetId: target });
  export const decide = (pool: Pool, decisionId: string, outcome: string | null, extra: Record<string, unknown> = {}) =>
    step(pool, decisionId, 'ticket.decided', { outcome, ...extra });

  export async function stateOf(pool: Pool, ticketId: string): Promise<string> {
    const { rows } = await pool.query<{ state_id: string }>('SELECT state_id FROM proj_tickets WHERE ticket_id = $1', [ticketId]);
    return rows[0]!.state_id;
  }
  /** The ledger rows of one type on one ticket, oldest first. */
  export async function ledger(pool: Pool, ticketId: string, type: string) {
    const { rows } = await pool.query<{ actor_id: string; origin: string; payload: Record<string, unknown> }>(
      "SELECT actor_id, origin, payload FROM events WHERE entity_kind = 'ticket' AND entity_id = $1 AND type = $2 ORDER BY seq", [ticketId, type]);
    return rows;
  }
  ```
  `apps/server/test/flow/promote.test.ts`: header copies `auto-close/sweep.test.ts:1-9` (`afterEach`/`beforeEach`, `resetEntitySeqs()`, one `createTestDatabase()` per case because the ledger cannot be truncated). Shared:
  ```ts
  let db: TestDatabase;
  let logs: string[];
  beforeEach(async () => { resetEntitySeqs(); db = await createTestDatabase(); await seedFlowWorld(db.pool); logs = []; });
  afterEach(async () => { await db.drop(); });
  const promoter = (over: Partial<FlowPromoteDeps> = {}) =>
    createFlowPromoter({ pool: db.pool, ingest: realIngest(db.pool), log: (m) => logs.push(m), ...over });
  const finishing = async (s: string) => step(db.pool, s, 'ticket.transitioned', { to: 'done' });
  ```
  - **29.214:** `s = addTicket({start:'focus', moves:['doing']})`, `t = addTicket({assigneeId: ASSIGNEE})`, `k = addTicket({typeId: KICKOFF_TASK})`, `lead(s,t)`, `lead(s,k)`. Control first: `await p.onCommitted(linkEvent)` leaves `stateOf(t)` = `'backlog'`. Then `await p.onCommitted(await finishing(s))`. Expect `stateOf(t)` = `'todo'`, `stateOf(k)` = `'kickoff'`, and `ledger(db.pool, t, 'ticket.transitioned')` equals `[{actor_id: SYSTEM_ACTOR_FLOW, origin: 'server', payload: {to: 'todo', cause: {kind: 'led-to', sourceTicketId: s, triggeredBy: PERSON}}}]` (no `label` key for an unlabelled edge).
  - **29.215:** a table of `[name, build, promotes]`, each `build` makes its own tickets and returns `{event, target}`; the loop asserts `stateOf(target)` is `'todo'` or `'backlog'`:
    ```ts
    const A = () => addTicket(db.pool, { start: 'focus', moves: ['doing', 'done'] });  // finished source
    const wait = async (t: string) => step(db.pool, t, 'ticket.field_set', { fieldId: 'waitForAll', value: true });
    const rows: Array<[string, () => Promise<{ event: EventEnvelope; target: string }>, boolean]> = [
      ['transitioned on a source', async () => { const s = await addTicket(db.pool, { start: 'focus', moves: ['doing'] }); const t = await addTicket(db.pool); await lead(db.pool, s, t); return { event: await finishing(s), target: t }; }, true],
      ['decided on a terminal Decision', async () => { const d = await addTicket(db.pool, { typeId: DECISION_TYPE_ID, start: 'focus', moves: ['doing', 'done'] }); const t = await addTicket(db.pool); await lead(db.pool, d, t, 'Yes'); return { event: await decide(db.pool, d, 'Yes'), target: t }; }, true],
      ['deleted on a source holding a waitForAll target', async () => { const [a, b, t] = [await A(), await addTicket(db.pool, { start: 'focus', moves: ['doing'] }), await addTicket(db.pool)]; await wait(t); await lead(db.pool, a, t); await lead(db.pool, b, t); return { event: await step(db.pool, b, 'ticket.deleted', {}), target: t }; }, true],
      ['restored on a source', async () => { const s = await A(); const t = await addTicket(db.pool); await lead(db.pool, s, t); await step(db.pool, s, 'ticket.deleted', {}); return { event: await step(db.pool, s, 'ticket.restored', {}), target: t }; }, true],
      ['leads_to link added', async () => { const s = await A(); const t = await addTicket(db.pool); return { event: await lead(db.pool, s, t), target: t }; }, true],
      ['leads_to link removed', async () => { const [a, b, t] = [await A(), await addTicket(db.pool, { start: 'focus', moves: ['doing'] }), await addTicket(db.pool)]; await wait(t); await lead(db.pool, a, t); await lead(db.pool, b, t); return { event: await unlink(db.pool, b, t), target: t }; }, true],
      ['waitForAll cleared on the target', async () => { const [a, b, t] = [await A(), await addTicket(db.pool, { start: 'focus', moves: ['doing'] }), await addTicket(db.pool)]; await wait(t); await lead(db.pool, a, t); await lead(db.pool, b, t); return { event: await step(db.pool, t, 'ticket.field_set', { fieldId: 'waitForAll', value: null }), target: t }; }, true],
      ['restored on the target', async () => { const s = await A(); const t = await addTicket(db.pool); await lead(db.pool, s, t); await step(db.pool, t, 'ticket.deleted', {}); return { event: await step(db.pool, t, 'ticket.restored', {}), target: t }; }, true],
      ['published draft (hand-built Drafts event, R55)', async () => { const s = await A(); const t = await addTicket(db.pool); await lead(db.pool, s, t); return { event: makeEnvelope({ type: 'ticket.published', workspaceId: WS, entity: { kind: 'ticket', id: t }, payload: { projectId: PROJECT } }), target: t }; }, true],
      ['CONTROL a blocks link', async () => { const s = await A(); const t = await addTicket(db.pool); await lead(db.pool, s, t); await unlink(db.pool, s, t); return { event: await step(db.pool, s, 'ticket.link_added', { kind: 'blocks', targetId: t }), target: t }; }, false],
      ['CONTROL a draft-side (from) link', async () => { const s = await A(); const t = await addTicket(db.pool); await lead(db.pool, s, t); return { event: makeEnvelope({ type: 'ticket.link_added', workspaceId: WS, entity: { kind: 'ticket', id: t }, payload: { kind: 'leads_to', targetId: t, from: s } }), target: t }; }, false],
      ['CONTROL an assignment', async () => { const s = await A(); const t = await addTicket(db.pool); await lead(db.pool, s, t); return { event: await step(db.pool, t, 'ticket.assigned', { assigneeId: ASSIGNEE }), target: t }; }, false],
      ['CONTROL a title edit', async () => { const s = await A(); const t = await addTicket(db.pool); await lead(db.pool, s, t); return { event: await step(db.pool, t, 'ticket.field_set', { fieldId: 'title', value: 'x' }), target: t }; }, false],
    ];
    ```
    The `unlink` in the blocks control removes the `leads_to` row first so only the event under test could promote; the `from` control keeps its row but its event must not trigger (the Drafts projection writes such a row with `source_id = from`, R42).
  - **29.216:** `s` finishing promotes `t`; `step(t, 'ticket.transitioned', {to: 'backlog'})` by `PERSON`, then `onCommitted` of it: `stateOf(t)` stays `'backlog'`. Control: `step(s, ..., {to: 'doing'})` then `{to: 'done'}` and `onCommitted` of the second: `'todo'`. Flow-caused arm: `makeCommitted` a transition to `'backlog'` for `t` with `actorId: SYSTEM_ACTOR_FLOW` and `cause: {kind: 'reopened-by-flow', decisionTicketId: newUlid(), outcome: 'Loop', pass: 2, decidedBy: PERSON, decisionEventId: newUlid()}`: `onCommitted` promotes `t` again.
  - **29.217:** `s` finished, `t`; `lead`. `readFlow(db.pool, {workspaceId: WS, seedId: t, viewerId: ASSIGNEE, cap: 300})` returns no node `s` (this world has no memberships, so a viewer sees nothing: the control proving the viewer-scoped read cannot be the one the promoter uses); `onCommitted(finishing)` promotes `t`.
  - **29.218:** `s` finished; `shipped = addTicket({typeId: SHIPPED_TASK})`, `t`; `lead` both; `promoteTargets(deps, WS, [shipped, t])`: `stateOf(shipped)` stays `'backlog'`, `logs` has one line matching `/initial state .* terminal/`, `stateOf(t)` is `'todo'`, report `{promoted: 1, refused: 0, skipped: 1}`.
  - **29.219:** (a) `ingest: { ingestBatch: async (events) => events.map((e) => ({ status: 'refused', eventId: e.id, rule: 'illegal-transition', reason: 'no' })) }` → report `refused: 1`, a log line containing `illegal-transition`, no throw; `status: 'invalid', code: 'x', message: 'y'` → counted and logged with `x`. (b) A real promotion twice: `promoteTargets` second call reports `{promoted: 0, refused: 0, skipped: 0}` and the ledger holds one `led-to` row. (c) Rule-engine file below.
  - **29.220:** two linked tickets, `createFlowPromoter({..., flowCap: 1})`: nothing files, `logs` has a line matching `/truncated/`; control: default cap promotes.
  - **29.221:** copy `test/notifications/fanout.test.ts:858-898` ('boot wiring'): a `recordingIngest` whose `onEventCommitted` pushes to `listeners` and whose `ingestBatch` is unused, and a real-door `serverAppend` that records submitted events and answers `committed`. After `buildApp({..., serverAppend})`, `for (const l of listeners) l(finishingEvent)` and `await vi.waitFor(() => expect(sent.map((e) => e.type)).toEqual(['ticket.transitioned']))` with `sent[0].actorId === SYSTEM_ACTOR_FLOW`. Then `await app.close()`, fire the same event again: `sent` is unchanged. Fire-and-forget arm: `createFlowPromoter({pool: {query: async () => { throw new Error('db down'); }} as never, ...}).onCommitted(finishingEvent)` resolves, and `logs` has `flow promotion failed for event`.

  `packages/rule-engine/test/led-to-promotion.test.ts` (29.219c; copy `transition-backlog.test.ts:1-26` for `WF_STRICT` with `{from: 'doing', to: 'todo'}` added, `createdIn`, `ctx`):
  ```ts
  const led = (to: string): EventEnvelope => makeEnvelope({ type: 'ticket.transitioned', entity: { kind: 'ticket', id: T }, workspaceId: WS,
    actorId: SYSTEM_ACTOR_FLOW, origin: 'server',
    payload: { to, cause: { kind: 'led-to', sourceTicketId: '01J9GTKS000000000000000000', triggeredBy: '01J9GPRS000000000000000000' } } });
  it('29.219 a led-to move is legal only out of Backlog', async () => {
    expect(await evaluateEvent(led('todo'), ctx('backlog'))).toEqual({ refused: false });                 // control
    expect(await evaluateEvent(led('todo'), ctx('focus', move('doing')))).toMatchObject({ rule: 'cause.led-to-not-backlog' }); // doing -> todo is DECLARED
    expect(await evaluateEvent(led('todo'), ctx('focus'))).toMatchObject({ rule: 'cause.led-to-not-backlog' });
    expect(await evaluateEvent(move('todo'), ctx('focus', move('doing')))).toEqual({ refused: false });    // a person's move is untouched
  });
  ```
  (`move` takes no cause, as in the sibling file.) Run: `slot-run.sh wtg2-t13-srv -- pnpm --filter @gisik-nokma/server exec vitest run test/flow/promote.test.ts --maxWorkers=2` and the rule-engine file, each `> /tmp/<label>.log 2>&1; tail -40`. Expected: FAIL (`createFlowPromoter` and the refusal do not exist).

- [ ] **Step 5: The engine clause, the promoter, the wiring**

  `packages/rule-engine/src/checks/refusals.ts`, in `REFUSALS`: `'cause.led-to-not-backlog': 'A flow promotes a ticket only out of the Backlog. This one has already moved on, so nothing was changed.',`

  `packages/rule-engine/src/transition.ts`, directly after the `if (!resolved.ok) {...}` block and before `const toState` (after T8's `cause.forged` guard if it sits in that region):
  ```ts
    // AP-1: a promotion is the universal Start edge and nothing else. Without this, a late or duplicate led-to move would ride a
    // DECLARED edge (doing -> todo) and drag work in progress back. Keyed on the cause, so a person's own move is untouched.
    if (payload.cause?.kind === 'led-to' && resolved.stateId !== BACKLOG_STATE_ID) return refuse('cause.led-to-not-backlog');
  ```
  Add `import { refuse } from './checks/refusals.js';` (the overload `refuse(rule: keyof typeof REFUSALS): Refusal`, `refusals.ts:232`).

  `apps/server/src/flow/promote.ts`:
  ```ts
  import {
    BACKLOG_STATE_ID, isFlowCause, newUlid, promotionsFor, SYSTEM_ACTOR_FLOW,
    type EventEnvelope, type IngestResult, type SubmittedEvent,
  } from '@gisik-nokma/domain';
  import type { Queryable } from '../db/queryable.js';
  import { LIVE_TICKET_WHERE } from '../read/visible-where.js';
  import { latestWorkflowDefs } from '../read/workflow-defs.js';
  import { readFlow } from './read-flow.js';

  /** The internal door, narrowed to what the flow needs. The whole `IngestService` satisfies it; `app.ts` passes `{ingestBatch: deps.serverAppend}`. */
  export type FlowIngest = { ingestBatch(events: SubmittedEvent[]): Promise<IngestResult[]> };
  /** Above the UI's 300 (FL-2): a server read that is cut short cannot tell a back edge from a forward one, so it must not decide. */
  export const FLOW_SERVER_CAP = 2000;

  export type FlowPromoteDeps = {
    pool: Queryable; ingest: FlowIngest; now?: () => Date; flowCap?: number;
    log?: (message: string, error?: unknown) => void;
  };
  export type PromoteReport = { promoted: number; refused: number; skipped: number };

  const logOf = (deps: { log?: (m: string, e?: unknown) => void }) => deps.log ?? ((message: string, error?: unknown) => console.error(message, error));

  /** The person behind a source finishing: the actor of its latest transition; a flow-filed transition names its own cause's person; none, the flow actor. */
  export async function triggeredByOf(db: Queryable, sourceTicketId: string): Promise<string> {
    const { rows } = await db.query<{ actor_id: string; cause: unknown }>(
      `SELECT e.actor_id, e.payload->'cause' AS cause FROM events e
        WHERE e.entity_kind = 'ticket' AND e.entity_id = $1 AND e.type = 'ticket.transitioned'
        ORDER BY e.seq DESC LIMIT 1`, [sourceTicketId]);
    const row = rows[0];
    if (row === undefined) return SYSTEM_ACTOR_FLOW;
    if (row.actor_id !== SYSTEM_ACTOR_FLOW) return row.actor_id;
    if (!isFlowCause(row.cause)) return SYSTEM_ACTOR_FLOW;
    return row.cause.kind === 'led-to' ? row.cause.triggeredBy : row.cause.decidedBy;
  }

  /** AP-1: a workflow whose initial state is terminal would be finished by the Start edge. `FlowNode` carries no category for it, so ask the definitions. */
  async function terminalInitial(db: Queryable, workspaceId: string, ids: string[]): Promise<Set<string>> {
    if (ids.length === 0) return new Set();
    const { rows } = await db.query<{ ticket_id: string; workflow_id: string }>(
      'SELECT ticket_id, workflow_id FROM proj_tickets WHERE workspace_id = $1 AND ticket_id = ANY($2::text[])', [workspaceId, ids]);
    const defs = await latestWorkflowDefs(db, workspaceId, rows.map((r) => r.workflow_id));
    const out = new Set<string>();
    for (const r of rows) {
      const def = defs.get(r.workflow_id);
      if (def?.states.find((s) => s.id === def.initialStateId)?.category === 'terminal') out.add(r.ticket_id);
    }
    return out;
  }

  /**
   * Evaluate `targetIds` and file what is due. The ONE promotion path: the listener (AP-5), the settler (T16) and the sweep (T14) call it.
   * Each flow component is read once; a target the read did not reach (trashed, or a flow that was truncated) is skipped and logged.
   */
  export async function promoteTargets(deps: FlowPromoteDeps, workspaceId: string, targetIds: readonly string[]): Promise<PromoteReport> {
    const log = logOf(deps);
    const report: PromoteReport = { promoted: 0, refused: 0, skipped: 0 };
    const clientTime = (deps.now === undefined ? new Date() : deps.now()).toISOString();
    const covered = new Set<string>();
    for (const seed of [...new Set(targetIds)].sort()) {
      if (covered.has(seed)) continue;
      covered.add(seed);
      const flow = await readFlow(deps.pool, { workspaceId, seedId: seed, viewerId: null, cap: deps.flowCap ?? FLOW_SERVER_CAP });
      for (const n of flow.nodes) covered.add(n.id);
      if (flow.truncated) {
        report.skipped += 1;
        log(`flow promotion skipped: the flow around ticket ${seed} is truncated at ${deps.flowCap ?? FLOW_SERVER_CAP} tickets`);
        continue;
      }
      const inFlow = new Set(flow.nodes.map((n) => n.id));
      const promotions = promotionsFor({ nodes: flow.nodes, edges: flow.edges, targetIds: targetIds.filter((id) => inFlow.has(id)) });
      const blocked = await terminalInitial(deps.pool, workspaceId, promotions.map((p) => p.targetId));
      const events: SubmittedEvent[] = [];
      for (const p of promotions) {
        const node = flow.nodes.find((n) => n.id === p.targetId)!;
        if (blocked.has(p.targetId)) {
          report.skipped += 1;
          log(`flow promotion skipped for ticket ${p.targetId}: the initial state ${node.initialStateId} of its workflow is terminal`);
          continue;
        }
        events.push({
          id: newUlid(), workspaceId, entity: { kind: 'ticket', id: p.targetId }, type: 'ticket.transitioned', version: 1,
          payload: { to: node.initialStateId, cause: { kind: 'led-to', sourceTicketId: p.sourceTicketId, ...(p.label === null ? {} : { label: p.label }), triggeredBy: await triggeredByOf(deps.pool, p.sourceTicketId) } },
          actorId: SYSTEM_ACTOR_FLOW, origin: 'server', clientTime,
        });
      }
      if (events.length === 0) continue;
      const results = await deps.ingest.ingestBatch(events);
      for (const [i, result] of results.entries()) {
        if (result.status === 'committed') { report.promoted += 1; continue; }
        report.refused += 1; // copy of auto-close/sweep.ts:245-267: refused is expected (the world moved), invalid is a defect
        const ticketId = events[i]?.entity.id ?? 'unknown';
        if (result.status === 'refused') log(`flow promotion refused for ticket ${ticketId}: ${result.rule}: ${result.reason}`);
        else log(`flow promotion produced an INVALID envelope for ticket ${ticketId}: ${result.code}: ${result.message}`, result);
      }
    }
    return report;
  }
  ```
  The event-to-targets map (AP-4), one query:
  ```ts
  const SOURCE_SIDE = new Set(['ticket.transitioned', 'ticket.decided', 'ticket.closed', 'ticket.reopened', 'ticket.deleted', 'ticket.restored']);

  /** Which Backlog tickets does this committed event make worth re-evaluating? Only live Backlog tickets are ever promotable, so the query filters on both. */
  export async function retargetsOf(db: Queryable, event: EventEnvelope): Promise<string[]> {
    if (event.entity.kind !== 'ticket') return [];
    const payload = (event.payload ?? {}) as Record<string, unknown>;
    const own: string[] = [];
    const outgoing = SOURCE_SIDE.has(event.type);
    if (event.type === 'ticket.restored') own.push(event.entity.id);
    if (event.type === 'ticket.published') own.push(event.entity.id);
    // A person's Send to backlog is not a trigger; a flow-caused move into Backlog is, for the moved ticket itself (see the Why above).
    if (event.type === 'ticket.transitioned' && event.actorId === SYSTEM_ACTOR_FLOW && payload['to'] === BACKLOG_STATE_ID && isFlowCause(payload['cause'])) own.push(event.entity.id);
    if ((event.type === 'ticket.link_added' || event.type === 'ticket.link_removed') && payload['kind'] === 'leads_to' && payload['from'] === undefined && typeof payload['targetId'] === 'string') own.push(payload['targetId']);
    if (event.type === 'ticket.field_set' && payload['fieldId'] === 'waitForAll') own.push(event.entity.id);
    if (own.length === 0 && !outgoing) return [];
    const { rows } = await db.query<{ ticket_id: string }>(
      `SELECT t.ticket_id FROM proj_tickets t
        WHERE t.workspace_id = $1 AND t.state_id = $2 AND ${LIVE_TICKET_WHERE}
          AND (t.ticket_id = ANY($3::text[])
               OR ($4::boolean AND EXISTS (SELECT 1 FROM proj_ticket_links l WHERE l.source_id = $5 AND l.target_id = t.ticket_id AND l.kind = 'leads_to')))
        ORDER BY t.ticket_id`,
      [event.workspaceId, BACKLOG_STATE_ID, own, outgoing, event.entity.id]);
    return rows.map((r) => r.ticket_id);
  }

  export function createFlowPromoter(deps: FlowPromoteDeps): { onCommitted(event: EventEnvelope): Promise<void> } {
    const log = logOf(deps);
    return {
      /** Never rejects: it runs fire-and-forget after a commit (AP-5), like `notifications/fanout.ts:372`. */
      async onCommitted(event) {
        try {
          const targets = await retargetsOf(deps.pool, event);
          if (targets.length > 0) await promoteTargets(deps, event.workspaceId, targets);
        } catch (error) {
          log(`flow promotion failed for event ${event.id}`, error);
        }
      },
    };
  }
  ```
  A `ticket.link_added` with `from` has `payload['from']` defined, so it is skipped (R42: a draft-side link). `ticket.deleted`/`ticket.restored` re-evaluate the source's targets because the read puts the trashed source out of I(T) (AP-3).

  `apps/server/src/app.ts`, after the `unsubscribeNotifications` hook (`:1141`):
  ```ts
  // The auto-promotion listener (wtg Part 2, AP-5): the fourth listener on the commit feed, fire-and-forget like the fan-out above.
  // It files through the internal door, which an app holds only as the named capability `serverAppend`.
  const flowPromoter = createFlowPromoter({ pool: deps.pool, ingest: { ingestBatch: deps.serverAppend } });
  const unsubscribeFlowPromoter = deps.ingest.onEventCommitted((event) => {
    void flowPromoter.onCommitted(event);
  });
  app.addHook('onClose', () => {
    unsubscribeFlowPromoter();
  });
  ```
  Run the Step 4 commands. Expected: PASS. Flip 29.214-29.221 ✅.

  Commit: `wtg2 T13: the promoter, the led-to engine clause, the app wiring`.

- [ ] **Step 6: Features, sweeps, mutations, DONE**
  - **Features** (under `<!-- wtg-part2-model T13 bullet -->`; keep the anchor line, T19 reads the bullets below it): `- ⚙️ **Auto-promotion** (wtg2 T13; `packages/domain/src/flow/promotion.ts`, `apps/server/src/flow/promote.ts`) — a Backlog ticket moves to its workflow's first state, as the reserved Flow actor with a `led-to` cause, when any incoming "leads to" source is finished (or all of them with Wait for all); a person's Send to backlog sticks; the engine accepts a `led-to` move only out of Backlog. Cases 29.210-29.221.`
  - **Sweeps:** domain, rule-engine, and server WHOLE (the engine clause reaches every transition suite). `pnpm check:citations`, `pnpm check:tasks`, `node scripts/check-case-ids.mjs`, `pnpm check:env`.
  - **Mutations** (each run, then reverted):

  | Case | Mutation | Expected red |
  |---|---|---|
  | 29.210 | `source.closed` in place of the category test | the done-but-unclosed source |
  | 29.211 | keep back edges in `base` | the loop target |
  | 29.212 | delete the `stateId !== BACKLOG` test | the To do target |
  | 29.213 | `considered[0]` | the tie and the date pick |
  | 29.214 | `to: 'todo'` | the Kickoff target |
  | 29.215 | drop `ticket.link_removed` from `retargetsOf` | the link-removed row |
  | 29.216 | add `own.push(event.entity.id)` for every transition | the sticking case |
  | 29.217 | `viewerId: event.actorId` in `readFlow` | the hidden-source case |
  | 29.218 | drop `blocked.has` | the Shipped target |
  | 29.219 | delete the engine clause | the Doing target is dragged back |
  | 29.220 | ignore `flow.truncated` | the capped case |
  | 29.221 | delete `unsubscribeFlowPromoter()` | the after-close case |

  Push. DONE + REVIEW (NEEDS: T8/T10/T12 merged; Drafts R55 event name re-read).

---

### Task 14: The reconciling flow sweep and the daemon wiring (cases 29.222-29.229)

**Branch:** `task/wtg2-flow-sweep` from `origin/release/workflow-graph`; PR `--base release/workflow-graph`. **Needs:** T13 (`promoteTargets`, `FlowIngest`, `flow-world.ts`).

**Files:**
- Create: `apps/server/src/flow/sweep.ts`; `apps/server/src/ops/daemon-listeners.ts`; `apps/server/test/flow/sweep.test.ts`; `apps/server/test/ops/daemon-listeners.test.ts`
- Modify: `apps/server/src/ops/backup-daemon-main.ts` (import beside `:8`; the interval variable after `autoCloseSweepIntervalMs`, `:178-182`; the listener registration right after `createIngestService`, `:202-206`; a job after the `auto-close` job, `:277-292`); `apps/server/test/ops/backup-daemon-main.test.ts` (two cases after 13.731, `:218-226`); `.env.example` (after `AUTO_CLOSE_SWEEP_INTERVAL_MS`, `:369`)
- Catalogue: `test-cases/29-workflow-timeline-graphs.md` under `<!-- wtg-part2-model T14 -->`; `Features.md` §26 under `<!-- wtg-part2-model T14 bullet -->`

**Interfaces:**
- **Consumes:** T13's `promoteTargets(deps, workspaceId, targetIds)`, `FlowIngest`, `triggeredByOf`; `LIVE_TICKET_WHERE`; `requirePositiveIntervalMs` (already imported by the daemon, `backup-daemon-main.ts:23`).
- **Produces:** `runFlowSweep(deps: {pool: Queryable; ingest: FlowIngest; now?: () => Date; log?: (m: string, e?: unknown) => void}): Promise<{promoted: number; settled: number; refused: number}>`; `registerDaemonListeners(ingest: Pick<IngestService, 'onEventCommitted'>, deps: {pool: Queryable; transports: NotificationTransport[]; canSeeTicket?: CanSeeFn; log?: ...}): () => void`; env `FLOW_SWEEP_INTERVAL_MS`; the daemon job `flow`.

**Why this is part of the feature and not an extra (contract decision 5).** The promoter is registered in the SERVER process (`app.ts`). An event committed by the backup daemon's own ingest (`backup-daemon-main.ts:202`, built with no listeners and no gates) never reaches it, and a crash between a commit and a fire-and-forget promotion loses it. The sweep is the repair for both. It reuses `promoteTargets`, so there is one promotion path, not a second copy of AP-3.

**Why `registerDaemonListeners`.** A sweep promotion is filed through the daemon's ingest, so the server's fan-out never sees it and the assignee would never get "Ready to start" (NT-1). The daemon already builds the in-app transport (`:149`); registering the same `createNotificationFanout` on its ingest closes that. Dedup keys (`flow-ready:${eventId}`) make a double delivery impossible, and the fan-out has no arm that the daemon's other writers (auto-close, purge) trigger. It is a separate small module so a test can import it; `backup-daemon-main.ts` calls `main()` at import time (`test/ops/backup-daemon-main.test.ts:9-12`).

**Why the default interval is 300000 (5 minutes), not the 3600000 the other sweeps use.** The sweep is the only thing that moves a ticket after a daemon-filed event, and an auto-promotion that arrives an hour late reads as broken. The SELECT is an indexed lookup and the common answer is empty.

- [ ] **Step 1: Case lines**

  Under `<!-- wtg-part2-model T14 -->`, all ❌:
  - `- ❌ **29.222 — runFlowSweep promotes every live Backlog ticket whose incoming leads_to is met and reports {promoted, settled: 0, refused};** control: a Backlog target whose only source is still active is not touched. Mutation: drop the terminal-source clause from the SELECT → the active-source target is evaluated and the report still agrees, so the case also asserts the read count through the candidate list.`
  - `- ❌ **29.223 — a promotion the listener missed (the daemon committed the finish with no listener, or the listener was dropped) is made by the next sweep;** control: with the listener attached the same finish promotes at once and the sweep finds nothing to do. Mutation: have the sweep skip tickets whose source finished in the last hour → the dropped-listener world stays in Backlog.`
  - `- ❌ **29.224 — a second sweep files nothing;** control: the first sweep filed exactly one led-to transition. Mutation: select tickets in any state → the second run re-files into a ticket in To do and the engine's refusal shows as refused > 0.`
  - `- ❌ **29.225 — triggeredBy is the actor of the source's latest transition (a person), and the flow actor when the source has none (a republish re-categorised its state);** control: the finisher is a different person from the one who created it. Mutation: use the source's creator → the control fails.`
  - `- ❌ **29.226 — the SELECT is a superset and the exact rule decides: a waitForAll target with one open source, a Decision's other label, a trashed target and a draft target are selected or not as the rule says and nothing is filed for them, and a terminal-initial workflow is skipped and logged without counting as refused;** control: the same targets promote when the rule is met. Mutation: treat the Decision's edge as satisfied by any outcome → the other label's target is promoted.`
  - `- ❌ **29.227 — a refused submission and an invalid one are both counted in refused and logged with their rule or code, and the sweep resolves;** control: a committed one counts in promoted. Mutation: count only status refused → the invalid case under-reports.`
  - `- ❌ **29.228 — the daemon arms a job named flow on FLOW_SWEEP_INTERVAL_MS (a zero value aborts the whole scheduler naming the variable) and the job runs and logs its counts;** control: with the variable unset the daemon announces itself. Mutation: read AUTO_CLOSE_SWEEP_INTERVAL_MS for it → the zero case no longer names FLOW_SWEEP_INTERVAL_MS.`
  - `- ❌ **29.229 — registerDaemonListeners subscribes the notification fan-out on the daemon's ingest and returns an unsubscribe;** control: after the unsubscribe the same commit delivers nothing. Mutation: return a no-op unsubscribe → the control row appears.`

  Commit: `wtg2 T14: case lines 29.222-29.229`.

- [ ] **Step 2: RED tests 29.222-29.227**

  `apps/server/test/flow/sweep.test.ts` — header and `beforeEach`/`afterEach` exactly as `promote.test.ts` (T13 Step 4: `resetEntitySeqs()`, one `createTestDatabase()` + `seedFlowWorld` per case), plus:
  ```ts
  const sweep = (over: Partial<FlowSweepDeps> = {}) =>
    runFlowSweep({ pool: db.pool, ingest: realIngest(db.pool), log: (m) => logs.push(m), ...over });
  const finishedSource = () => addTicket(db.pool, { start: 'focus', moves: ['doing', 'done'] });
  const openSource = () => addTicket(db.pool, { start: 'focus', moves: ['doing'] });
  ```
  - **29.222:** `s = finishedSource()`, `o = openSource()`, `t1`, `t2` in Backlog; `lead(s, t1)`, `lead(o, t2)`. `expect(await sweep()).toEqual({ promoted: 1, settled: 0, refused: 0 })`; `stateOf(t1)` is `'todo'`, `stateOf(t2)` is `'backlog'`.
  - **29.223:** two worlds in one test, built with the real door so the events are engine-legal: a helper `submit(ingest, ticketId, to)` calls `ingest.ingestBatch([{ id: newUlid(), workspaceId: WS, entity: { kind: 'ticket', id: ticketId }, type: 'ticket.transitioned', version: 1, payload: { to }, actorId: PERSON, origin: 'web', clientTime: new Date().toISOString() }])`. World A: `ingest = realIngest(db.pool)`; `const off = ingest.onEventCommitted((e) => void createFlowPromoter({ pool: db.pool, ingest, log: () => {} }).onCommitted(e))`; `s` active, `t` linked; `await submit(ingest, s, 'done')`; `await vi.waitFor(async () => expect(await stateOf(db.pool, t)).toBe('todo'))`; a sweep then reports `promoted: 0`. World B (a second `s2`, `t2` in the same database): the listener never attached (this is what the daemon's ingest is); `submit(...)` leaves `stateOf(t2)` `'backlog'`; `sweep()` reports `promoted: 1` and `stateOf(t2)` is `'todo'`.
  - **29.224:** after one sweep, `(await ledger(db.pool, t, 'ticket.transitioned')).length` is 1 and a second `sweep()` equals `{ promoted: 0, settled: 0, refused: 0 }` with the count still 1.
  - **29.225:** `s = addTicket({ start: 'focus', moves: ['doing'] })`, finished by `await step(db.pool, s, 'ticket.transitioned', { to: 'done' }, ASSIGNEE)` (not the creator `PERSON`); after `sweep()` the `led-to` cause on `t` has `triggeredBy: ASSIGNEE`. Fallback: `s2 = addTicket({ start: 'focus' })`, then `UPDATE proj_tickets SET state_id = 'done', state_category = 'terminal' WHERE ticket_id = $1` (a republish that re-categorises a state leaves a terminal ticket with no transition event: `auto-close/sweep.ts:198-206`); its target's cause has `triggeredBy: SYSTEM_ACTOR_FLOW`.
  - **29.226:** (a) `waitForAll` target `t` with sources `a` (finished) and `b` (open): `sweep()` gives `promoted: 0` (the SQL selects it, the rule declines), then `b` finishes (`step`) and a second sweep gives `promoted: 1`. (b) `d = addTicket({ typeId: DECISION_TYPE_ID, start: 'focus', moves: ['doing', 'done'] })`, `decide(db.pool, d, 'Yes')`, targets `y` (`lead(d, y, 'Yes')`) and `n` (`lead(d, n, 'No')`): only `y` is promoted. (c) a trashed target (`step(t, 'ticket.deleted', {})`) is not promoted; a draft target (`UPDATE proj_tickets SET draft_author_id = $1`, the column Drafts adds, §11 of its spec) is not promoted. (d) a `SHIPPED_TASK` target is skipped: `logs` has a line matching `/initial state .* terminal/` and `refused` is 0.
  - **29.227:** `sweep({ ingest: { ingestBatch: async (events) => events.map((e) => ({ status: 'refused' as const, eventId: e.id, rule: 'illegal-transition', reason: 'no' })) } })` → `{ promoted: 0, settled: 0, refused: 1 }` and a log line containing `illegal-transition`; the same with `status: 'invalid'` (`code: 'x'`, `message: 'y'`) → `refused: 1`, a log line containing `x`. Control: the real door → `promoted: 1`.

  Run: `/Users/kiro/my_projects/gisik-nokma-lanes/slot-run.sh wtg2-t14 -- pnpm --filter @gisik-nokma/server exec vitest run test/flow/sweep.test.ts --maxWorkers=2 > /tmp/wtg2-t14.log 2>&1; tail -40 /tmp/wtg2-t14.log`. Expected: FAIL (`../../src/flow/sweep.js` does not exist).

- [ ] **Step 3: `runFlowSweep`**

  `apps/server/src/flow/sweep.ts`:
  ```ts
  import { BACKLOG_STATE_ID } from '@gisik-nokma/domain';
  import type { Queryable } from '../db/queryable.js';
  import { LIVE_TICKET_WHERE } from '../read/visible-where.js';
  import { promoteTargets, type FlowIngest } from './promote.js';

  /**
   * The reconciling sweep (AP-5; contract decision 5). It exists for two losses the listener cannot prevent: events committed by the
   * backup daemon's own ingest never reach the server process's listeners, and a fire-and-forget promotion dies with its process.
   *
   * Modelled on `auto-close/sweep.ts`: the reserved actor, the internal door, refusals COUNTED rather than assumed away, and
   * idempotence by the ledger itself (a promoted ticket is no longer in Backlog, so a second run selects nothing and a stale
   * `led-to` is refused by the engine, `cause.led-to-not-backlog`). There is no cursor to resume.
   */
  export type FlowSweepReport = { promoted: number; settled: number; refused: number };
  export type FlowSweepDeps = { pool: Queryable; ingest: FlowIngest; now?: () => Date; log?: (message: string, error?: unknown) => void };

  /**
   * The settle half (PS-9) runs FIRST, so a Decision's cascade is applied before promotion reads the world (AP-4: "after the settle
   * cascade"). Task 16 replaces this body; until then there is nothing to settle and it reports zero.
   */
  async function settleHalf(_deps: FlowSweepDeps): Promise<{ settled: number; refused: number }> {
    return { settled: 0, refused: 0 };
  }

  /**
   * A SUPERSET of the promotable tickets, in SQL: live, in Backlog, with an incoming `leads_to` from a live terminal source. The exact
   * rule (waitForAll, a Decision's label, not-taken sources, drafts) is `promotionsFor`'s, so a candidate it declines costs one read and
   * never an event. Draft targets are excluded by the rule, not here, so this file needs no Drafts column.
   */
  async function promoteHalf(deps: FlowSweepDeps): Promise<{ promoted: number; refused: number }> {
    const { rows } = await deps.pool.query<{ workspace_id: string; ticket_id: string }>(
      `SELECT t.workspace_id, t.ticket_id
         FROM proj_tickets t
        WHERE t.state_id = $1 AND ${LIVE_TICKET_WHERE}
          AND EXISTS (SELECT 1 FROM proj_ticket_links l JOIN proj_tickets s ON s.ticket_id = l.source_id
                       WHERE l.target_id = t.ticket_id AND l.kind = 'leads_to'
                         AND s.state_category = 'terminal' AND s.deleted_at IS NULL)
        ORDER BY t.workspace_id, t.ticket_id`,
      [BACKLOG_STATE_ID],
    );
    const byWorkspace = new Map<string, string[]>();
    for (const row of rows) byWorkspace.set(row.workspace_id, [...(byWorkspace.get(row.workspace_id) ?? []), row.ticket_id]);
    let promoted = 0;
    let refused = 0;
    for (const [workspaceId, ids] of byWorkspace) {
      const report = await promoteTargets(deps, workspaceId, ids);
      promoted += report.promoted;
      refused += report.refused;
    }
    return { promoted, refused };
  }

  export async function runFlowSweep(deps: FlowSweepDeps): Promise<FlowSweepReport> {
    const settle = await settleHalf(deps);
    const promote = await promoteHalf(deps);
    return { promoted: promote.promoted, settled: settle.settled, refused: promote.refused + settle.refused };
  }
  ```
  A target whose workflow's initial state is terminal is skipped by `promoteTargets` and logged on every run; that is one log line per run per such ticket, accepted because the validator is not changed here (decision 9).

  `apps/server/src/ops/daemon-listeners.ts`:
  ```ts
  import type { Queryable } from '../db/queryable.js';
  import type { IngestService } from '../ingest/ingest-service.js';
  import { createNotificationFanout, type CanSeeFn } from '../notifications/fanout.js';
  import type { NotificationTransport } from '../notifications/transport.js';

  /**
   * The backup daemon files events too (the flow sweep's promotions, auto-close), through an ingest nobody listens to. Registering the
   * notification fan-out on it means a daemon-filed promotion still tells the assignee (NT-1). Returns the unsubscribe.
   */
  export function registerDaemonListeners(
    ingest: Pick<IngestService, 'onEventCommitted'>,
    deps: { pool: Queryable; transports: NotificationTransport[]; canSeeTicket?: CanSeeFn; log?: (message: string, error?: unknown) => void },
  ): () => void {
    const fanout = createNotificationFanout({ pool: deps.pool, transports: deps.transports, ...(deps.canSeeTicket === undefined ? {} : { canSeeTicket: deps.canSeeTicket }), ...(deps.log === undefined ? {} : { log: deps.log }) });
    return ingest.onEventCommitted((event) => {
      void fanout.onCommitted(event);
    });
  }
  ```
  Run the Step 2 command. Expected: PASS for 29.222-29.227. Flip them ✅.

  Commit: `wtg2 T14: runFlowSweep`.

- [ ] **Step 4: The daemon**

  `backup-daemon-main.ts`:
  1. imports: `import { runFlowSweep } from '../flow/sweep.js';` and `import { registerDaemonListeners } from './daemon-listeners.js';`.
  2. after the `autoCloseSweepIntervalMs` block, the same read-once, empty-means-unset shape:
     ```ts
     const rawFlowInterval = process.env.FLOW_SWEEP_INTERVAL_MS;
     const flowSweepIntervalMs = Number(rawFlowInterval === undefined || rawFlowInterval.trim() === '' ? '300000' : rawFlowInterval);
     ```
  3. right after `const ingest = createIngestService({...})` (`:202-206`): `registerDaemonListeners(ingest, { pool, transports: [notificationTransport] });` (the unsubscribe is discarded: the process ends with the pool, `shutdown` below).
  4. in `scheduledJobs`, after the `auto-close` entry:
     ```ts
     {
       name: 'flow',
       run: async (): Promise<void> => {
         const report = await runFlowSweep({ pool, ingest });
         console.log(JSON.stringify({ msg: 'flow sweep complete', promoted: report.promoted, settled: report.settled, refused: report.refused }));
       },
       delayMs: () => requirePositiveIntervalMs(flowSweepIntervalMs, 'FLOW_SWEEP_INTERVAL_MS'),
     },
     ```
  `.env.example`, after `AUTO_CLOSE_SWEEP_INTERVAL_MS=3600000`:
  ```
  # The flow sweep (workflow and timeline graphs, AP-5) is a job of the same daemon: it promotes Backlog tickets whose incoming "leads to"
  # condition is met and repairs a promotion the server's listener missed. Same read-once, validate-on-every-call shape and the same
  # empty-means-unset handling as the sweeps above: optional, default 300000 (five minutes), and a non-positive or non-numeric value is
  # refused with THIS name, aborting the whole scheduler before any timer is armed.
  FLOW_SWEEP_INTERVAL_MS=300000
  ```
  Tests. `backup-daemon-main.test.ts` after 13.731, copying its `runDaemon` calls and the 6.349 `until` predicate:
  ```ts
  it('29.228 refuses a zero FLOW_SWEEP_INTERVAL_MS and names it, aborting the whole scheduler; control: unset announces itself', async () => {
    const ok = await runDaemon({ DATABASE_URL: db.url, NOTIFICATION_SWEEP_INTERVAL_MS: '3600000' });
    expect(ok.stdout).toContain(SCHEDULED);
    const run = await runDaemon({ DATABASE_URL: db.url, FLOW_SWEEP_INTERVAL_MS: '0' });
    expect(run.stdout).not.toContain(SCHEDULED);
    expect(run.stderr).toContain('FLOW_SWEEP_INTERVAL_MS');
  }, 120_000);
  it('29.228 the flow job runs and logs its counts', async () => {
    const line = (out: string) => out.split('\n').flatMap((l) => { try { return [JSON.parse(l) as { msg?: string }]; } catch { return []; } }).find((e) => e.msg === 'flow sweep complete');
    const run = await runDaemon({ DATABASE_URL: db.url, NOTIFICATION_SWEEP_INTERVAL_MS: '3600000', FLOW_SWEEP_INTERVAL_MS: '300' }, (out) => line(out) !== undefined);
    expect(line(run.stdout)).toMatchObject({ msg: 'flow sweep complete', promoted: 0, settled: 0, refused: 0 });
  }, 60_000);
  ```
  `apps/server/test/ops/daemon-listeners.test.ts` (29.229; pool and ingest as `promote.test.ts`, a `canSeeTicket: async () => true`, the in-app transport from `notifications/transport.ts`):
  ```ts
  it('29.229 the daemon ingest delivers through the fan-out until it is unsubscribed', async () => {
    const ingest = realIngest(db.pool);
    const off = registerDaemonListeners(ingest, { pool: db.pool, transports: [createInAppTransport(db.pool)], canSeeTicket: async () => true });
    const t1 = await addTicket(db.pool);
    await ingest.ingestBatch([assign(t1, ASSIGNEE)]);
    await vi.waitFor(async () => expect((await listNotifications(db.pool, ASSIGNEE, {})).notifications).toHaveLength(1));
    off();
    const t2 = await addTicket(db.pool);
    await ingest.ingestBatch([assign(t2, ASSIGNEE)]);
    await new Promise((r) => setTimeout(r, 200)); // the absence is the claim, so a bounded wait is the honest probe
    expect((await listNotifications(db.pool, ASSIGNEE, {})).notifications).toHaveLength(1);
  });
  ```
  where `assign(ticketId, assigneeId)` builds the `ticket.assigned` submitted event as `promote.test.ts` builds its events (actor `PERSON`, `origin: 'web'`). Run the daemon file, the new test and `pnpm check:env`. Expected: PASS; flip 29.228-29.229 ✅.

  Commit: `wtg2 T14: the flow job, FLOW_SWEEP_INTERVAL_MS, daemon listeners`.

- [ ] **Step 5: Features, sweeps, mutations, DONE**
  - **Features** (under `<!-- wtg-part2-model T14 bullet -->`; keep the anchor line, T19 reads the bullets below it): `- ⚙️ **Flow sweep** (wtg2 T14; `apps/server/src/flow/sweep.ts`, `apps/server/src/ops/backup-daemon-main.ts`) — a daemon job every five minutes (`FLOW_SWEEP_INTERVAL_MS`) promotes what the server's listener missed, idempotently; the daemon's own commits notify through the same fan-out. Cases 29.222-29.229.` (write the backticks plain, as in T13's bullet)
  - **Sweeps:** server WHOLE; `pnpm check:env`, `pnpm check:citations`, `node scripts/check-case-ids.mjs`.
  - **Mutations:** the ones named on 29.222-29.229, run, then reverted.

  Push. DONE + REVIEW (NEEDS: T13 merged).

---

### Task 15: `planSettle`, pure (cases 29.364-29.367)

**Branch:** `task/wtg2-plan-settle` from `origin/release/workflow-graph`; PR `--base release/workflow-graph`. **Needs:** T5 (Decision type, `outcome`, `passes`), T8 (`flowCauseSchema`, `FlowCause`, `SYSTEM_ACTOR_FLOW`, the `cause` members on `ticket.transitioned` / `ticket.closed` / `ticket.reopened`), T9 (`periods`, `rounds`, `closed.cause`) and T10 (`FlowNode`, `analyzeFlow`, `liveSet`, `loopBody`, `branchOf`, `sameLabel`, `test/flow/fixtures.ts`) merged. Pure domain code: no server, no database, no clock. T16 files the events this task builds.

**Files:**
- Create: `packages/domain/src/flow/settle.ts`; `packages/domain/test/flow/settle.test.ts`
- Modify: `packages/domain/src/flow/index.ts` (one line); `packages/domain/test/flow/clock-free.test.ts` (one line)
- Catalogue: `test-cases/29-workflow-timeline-graphs.md` under `<!-- wtg-part2-model T15 -->`; `Features.md` §26 under `<!-- wtg-part2-model T15 bullet -->`

**Interfaces:**
- **Consumes:** `FlowNode`, `FlowEdge`, `edgeKey`, `analyzeFlow`, `liveSet`, `loopBody`, `branchOf`, `sameLabel` (T10); `FlowCause` (T8, `flow/causes.ts`); `SYSTEM_ACTOR_FLOW` (T8, `system-actors.ts`); `SubmittedEvent` (`envelope.ts:192`); `newUlid` (`ids.ts`); `BACKLOG_STATE_ID = 'backlog'` (`workflow.ts:72`).
- **Produces:** `planSettle(input: {nodes: readonly FlowNode[]; edges: readonly FlowEdge[]; decisionId: string; closeStarted?: readonly string[]}): SettlePlan`; `type SettlePlan = {steps: SettleStep[]; blocked: {ticketId: string; reason: SettleBlockReason} | null; started: string[]; touchesOthers: boolean}`; `type SettleStep` = `{kind: 'reopen'; ticketId}` | `{kind: 'to-initial'; ticketId; toStateId}` | `{kind: 'to-backlog'; ticketId; toStateId: 'backlog'}` | `{kind: 'not-taken-transition'; ticketId; toStateId}` | `{kind: 'not-taken-close'; ticketId}`; `type SettleBlockReason = 'parent-finished' | 'child-open' | 'outcome-has-no-branch' | 'no-terminal-state'`; `type SettleContext = {workspaceId; decisionId; decisionEventId; decidedBy; outcome; pass; clientTime; mintId?}`; `settleEvents(plan: SettlePlan, ctx: SettleContext): ProposedEvent[]` with `ProposedEvent = SubmittedEvent`.

**Why `SettleContext` is wider than the plan header's `{decisionId; decisionEventId; decidedBy; outcome; pass}` (a finding).** A `SubmittedEvent` (`envelope.ts:192`, the envelope without `serverTime` and `seq`) needs `workspaceId` and `clientTime`; the pure module has neither and must not read a clock, so the caller passes both (`mintId` is a test seam for ids and defaults to `newUlid`). T16's call site (`apps/server/src/flow/settle.ts`) must pass `workspaceId: event.workspaceId` and `clientTime: now().toISOString()`; the auto-close sweep does the same for its own events (`apps/server/src/auto-close/sweep.ts:215-262`).

**Why the plan is a function of the CURRENT states only, and idempotent.** The settler can run twice (the listener and then the sweep, spec test 26), and a crash can leave half a cascade. Every rule below asks "what is still wrong now?" (a Not-taken ticket on a live branch, an off-branch ticket not yet closed), never "what did the last event change?", so planning on the states a plan produced gives no steps. Case 29.366 applies each plan with a small fold and re-plans.

**Why steps are code-level facts and `blocked` carries a code, not a sentence (PS-9).** The engine refuses two moves that a cascade can need: finishing a parent over an open child (`packages/rule-engine/src/transition.ts:152-164`, and `checks/close.ts:74` for the close) and moving a child out of a finished state while its parent is finished (`transition.ts:185-205`); `checks/close.ts:93` refuses a reopen of an open ticket, which is why a `reopen` step exists only when `node.closed` is true. The plan therefore knows those two rules, refuses the WHOLE plan (`steps: []`) when one would be hit, and returns the ticket and a stable code; T16's gate turns the code into a sentence and judges whether the viewer may be told the title.

**Why the order is: reopens parents first, closes children first (PS-5.1).** Leaving a finished state under a finished parent is refused, so the parent leaves first (depth ascending); closing a parent over open children is refused, so children close first (depth descending). Ties are the flow order from `analyzeFlow`. A parent that leaves in the same plan lets its child through (case 29.367's last row); `depth` counts hops through `parentId` and is bounded by the node count so a corrupt parent loop cannot hang it.

**Why "Not taken" is parked in the first terminal state and never in a state the plan invents (planner ruling 8).** `FlowNode.firstTerminalStateId` (T10) is the first-declared terminal state of the ticket's own workflow. A workflow with none gives `no-terminal-state`, a refusal of the plan, rather than a move to a state the engine would refuse (spec PS-8, AP-1).

**Why a started ticket on a left branch is returned in `started`, not closed (PS-6).** Started work is never closed without a person's say. `started` lists those tickets, the confirmation lists them, and the caller passes the chosen ones back as `closeStarted`; a named one closes with the rest. A finished ticket on a left branch is left alone and keeps its work (case 29.364); only an UNFINISHED one gets the Not-taken pair.

**Why a loop outcome moves the target to its initial state and the rest of the body to Backlog (PS-4).** The target is what the person is sent back to (it is "the next thing to do again"), so it reopens to its workflow's initial state; the rest of the body (the Decision included) waits in Backlog until promotion (T13) moves each as its predecessor finishes. A target that is not finished stays where it is (case 29.365), and a Backlog ticket is not moved again. Nothing is pruned: the other labels' branches are untouched by a loop.

**Why clearing returns only THIS Decision's Not-taken tickets (PS-6).** A Not-taken ticket carries the id of the Decision that closed it in `notTaken.decisionTicketId`. Clearing, a loop reset or a revision to another label reopens a Not-taken ticket only when its cause names this Decision AND the ticket is back on the live graph; another Decision's Not-taken ticket stays (case 29.365).

- [ ] **Step 1: Case lines**

  Under `<!-- wtg-part2-model T15 -->`, all ❌:
  - `- ❌ **29.364 — a non-loop outcome closes "Not taken" exactly the unfinished, unstarted tickets that only the other branches lead to (a shared tail stays), children before parents, leaves finished work and drafts and trashed tickets alone, and lists started tickets in started unless they are named in closeStarted;** control: GN-144 = Yes closes only GN-145 and GN-144 = No closes the whole Yes side in flow order, and a named started ticket closes with the rest. Mutation: ignore the live set, or close parents before children, or never ask for started tickets → the shared-tail, ordering or started rows fail.`
  - `- ❌ **29.365 — a loop outcome reopens the target to its initial state when it is finished, sends the rest of the loop body (the Decision too) to Backlog, prunes nothing, returns this Decision's own Not-taken tickets to Backlog and leaves another Decision's alone;** control: a target that is not finished stays where it is and a Backlog ticket is not moved again. Mutation: send the target to Backlog like the body, or release every Not-taken ticket → the target or the other-Decision row fails.`
  - `- ❌ **29.366 — revising reopens the Not-taken side that is live again and closes the old side if it has not run, clearing or a loop reset returns only this Decision's Not-taken tickets, an outcome whose label has no edge refuses the plan, and a plan applied to its own result is empty;** control: a non-terminal Decision with an outcome waits. Mutation: drop the reopen rule, or let an outcome without a branch close every branch → the revise or the refusal row fails.`
  - `- ❌ **29.367 — a plan the engine would refuse is refused whole (steps empty, the ticket and a code named): a ticket leaving a finished state under a finished parent, unless that parent leaves in the same plan; and settleEvents files every step as SYSTEM_ACTOR_FLOW with origin server, reopens and resets carrying reopened-by-flow and the Not-taken pair carrying branch-not-taken, each passing parseEvent;** control: the same child under an unfinished parent moves. Mutation: swap the two cause kinds, or drop the parent check → the cause or the blocked row fails.`

  Commit: `wtg2 T15: case lines for planSettle`.

- [ ] **Step 2: RED tests**

  `packages/domain/test/flow/settle.test.ts` (fixtures from T10; `parseEvent` is `parse-event.ts:29`, the same door the other event tests use, so a cause the schema does not accept fails here, not in T16):
  ```ts
  import { describe, expect, it } from 'vitest';
  import {
    SYSTEM_ACTOR_FLOW,
    parseEvent,
    planSettle,
    settleEvents,
    type FlowEdge,
    type FlowNode,
    type SettlePlan,
  } from '../../src/index.js';
  import { decision, edge, fnode, keysOf, mockup, uid } from './fixtures.js';

  const m = mockup();
  const K = m.ids;
  const [P, X, Y, Z, Q, W] = [21, 22, 23, 24, 25, 26].map(uid) as [string, string, string, string, string, string];
  const DEC = uid(20);

  const FINISHED: Partial<FlowNode> = { stateId: 'done', category: 'terminal' };
  const WORKING: Partial<FlowNode> = { stateId: 'doing', category: 'active', started: true, periods: [{ start: '2026-10-01T04:00:00.000Z', end: null, pass: 1 }] };
  const BACKLOG: Partial<FlowNode> = { stateId: 'backlog', category: 'open' };
  const notTaken = (decisionTicketId: string, outcome = 'Yes', pass = 1) =>
    ({ ...FINISHED, closed: true, notTaken: { kind: 'not-taken' as const, decisionTicketId, outcome, pass } }) satisfies Partial<FlowNode>;
  const decided = (outcome: string | null, over: Partial<FlowNode> = {}): Partial<FlowNode> => ({ outcome, ...FINISHED, ...over });

  /** `kind:ticket-number` per step, for readable expectations. */
  function show(plan: SettlePlan, keys: (ids: Iterable<string>) => string[] = keysOf): string[] {
    return plan.steps.map((s) => `${s.kind}:${keys([s.ticketId])[0]}`);
  }

  describe('29.364 a non-loop outcome closes what only the other branches lead to', () => {
    it('29.364 GN-144 = Yes: only GN-145 (reached only through "No") closes Not taken; the shared tail GN-146 stays', () => {
      const nodes = m.nodes({ '144': decided('Yes') });
      const plan = planSettle({ nodes, edges: m.edges(), decisionId: K['144'] });
      expect(show(plan)).toEqual(['not-taken-transition:145', 'not-taken-close:145']);
      expect(plan.steps[0]).toEqual({ kind: 'not-taken-transition', ticketId: K['145'], toStateId: 'done' });
      expect(plan.touchesOthers).toBe(true);
      expect(plan.blocked).toBeNull();
      expect(plan.started).toEqual([]);
      // CONTROL: GN-146 is also reached through GN-148 ("No" of the undecided GN-148), so it is live; it is not in the plan
      expect(show(plan)).not.toContain('not-taken-transition:146');
    });

    it('29.364 GN-144 = No: the whole "Yes" side closes Not taken in flow order, Decisions included; finished work and started work are left', () => {
      const edges = m.edges();
      const nodes = m.nodes({ '144': decided('No'), '147': FINISHED, '149': WORKING });
      const plan = planSettle({ nodes, edges, decisionId: K['144'] });
      // 147 is finished with work (kept, PS-5.2); 149 is started (kept, asked about); the rest of the side closes
      expect(show(plan)).toEqual([
        'not-taken-transition:148', 'not-taken-close:148',
        'not-taken-transition:150', 'not-taken-close:150',
        'not-taken-transition:151', 'not-taken-close:151',
        'not-taken-transition:152', 'not-taken-close:152',
      ]);
      expect(keysOf(plan.started)).toEqual(['149']);
      // naming the started ticket closes it too, in its place in the flow order
      const named = planSettle({ nodes, edges, decisionId: K['144'], closeStarted: [K['149']] });
      expect(show(named)).toContain('not-taken-close:149');
      expect(named.started).toEqual([]);
      // an id that is not on a left branch is not honoured (it is the gate's job to refuse it)
      const stray = planSettle({ nodes, edges, decisionId: K['144'], closeStarted: [K['140']] });
      expect(show(stray)).toEqual(show(plan));
    });

    it('29.364 the children of a closing ticket close before it; a child that must stay open blocks the whole plan', () => {
      // d: Yes -> a (live), No -> x -> y; y is a child of x, and the flow order puts x before y
      const edges = [edge(DEC, P, 'Yes'), edge(DEC, X, 'No'), edge(X, Y)];
      const nodes = [decision(DEC, decided('Yes')), fnode(P), fnode(X), fnode(Y, { parentId: X })];
      expect(show(planSettle({ nodes, edges, decisionId: DEC }), (ids) => [...ids].map((id) => ({ [X]: 'x', [Y]: 'y' })[id] ?? id))).toEqual([
        'not-taken-transition:y', 'not-taken-close:y', 'not-taken-transition:x', 'not-taken-close:x',
      ]);
      // a child that the live side also leads to is live and cannot close with its parent
      const live = planSettle({
        nodes: [decision(DEC, decided('Yes')), fnode(P), fnode(X), fnode(Y, { parentId: X })],
        edges: [...edges, edge(P, Y)],
        decisionId: DEC,
      });
      expect(live).toEqual({ steps: [], blocked: { ticketId: X, reason: 'child-open' }, started: [], touchesOthers: false });
      // and a started child that nobody named blocks too; naming it lets the plan through
      const startedChild = [decision(DEC, decided('Yes')), fnode(P), fnode(X), fnode(Y, { parentId: X, ...WORKING })];
      expect(planSettle({ nodes: startedChild, edges, decisionId: DEC }).blocked).toEqual({ ticketId: X, reason: 'child-open' });
      expect(planSettle({ nodes: startedChild, edges, decisionId: DEC, closeStarted: [Y] }).blocked).toBeNull();
    });

    it('29.364 drafts and trashed tickets are never moved', () => {
      const nodes = m.nodes({ '144': decided('Yes'), '145': { draft: true } });
      expect(planSettle({ nodes, edges: m.edges(), decisionId: K['144'] }).steps).toEqual([]);
      const trashed = m.nodes({ '144': decided('Yes'), '145': { trashed: true } });
      expect(planSettle({ nodes: trashed, edges: m.edges(), decisionId: K['144'] }).steps).toEqual([]);
    });
  });

  describe('29.365 a loop outcome re-runs the loop body', () => {
    it('29.365 GN-151 = "Need more info": the target reopens to its initial state, the rest of the body (the Decision too) goes to Backlog, nothing is pruned', () => {
      const edges = m.edges();
      const nodes = m.nodes({
        '149': { ...FINISHED, closed: true },
        '150': FINISHED, // finished but not closed: no reopen step
        '151': decided('Need more info'),
      });
      const plan = planSettle({ nodes, edges, decisionId: K['151'] });
      expect(show(plan)).toEqual(['reopen:149', 'to-initial:149', 'to-backlog:150', 'reopen:151'].filter((s) => s !== 'reopen:151').concat(['to-backlog:151']));
      expect(plan.steps[1]).toEqual({ kind: 'to-initial', ticketId: K['149'], toStateId: 'todo' });
      expect(plan.touchesOthers).toBe(true);
      // nothing is closed Not taken: GN-152 ("Yes") keeps waiting
      expect(show(plan).some((s) => s.startsWith('not-taken'))).toBe(false);
    });

    it('29.365 a started body ticket goes back too; a target that is not finished stays where it is; Backlog tickets are not moved again', () => {
      const edges = m.edges();
      const nodes = m.nodes({ '149': WORKING, '150': { ...WORKING, stateId: 'doing' }, '151': decided('Need more info', { closed: true }) });
      const plan = planSettle({ nodes, edges, decisionId: K['151'] });
      expect(show(plan)).toEqual(['to-backlog:150', 'reopen:151', 'to-backlog:151']);
      // CONTROL: the target left in Backlog, the body in Backlog: only the Decision moves
      const quiet = planSettle({ nodes: m.nodes({ '149': BACKLOG, '150': BACKLOG, '151': decided('Need more info') }), edges, decisionId: K['151'] });
      expect(show(quiet)).toEqual(['to-backlog:151']);
      expect(quiet.touchesOthers).toBe(false);
    });

    it('29.365 the "No" loop (GN-151 -> GN-141) resets GN-141 to GN-151 and leaves GN-145, GN-146 and GN-152 alone', () => {
      const nodes = m.nodes({
        '141': FINISHED, '142': FINISHED, '143': FINISHED, '144': FINISHED, '145': FINISHED, '146': FINISHED,
        '147': FINISHED, '148': FINISHED, '149': FINISHED, '150': FINISHED, '151': decided('No'),
      });
      const plan = planSettle({ nodes, edges: m.edges(), decisionId: K['151'] });
      expect(keysOf(plan.steps.map((s) => s.ticketId))).toEqual(['141', '142', '143', '144', '147', '148', '149', '150', '151']);
      expect(plan.steps.map((s) => s.kind)).toEqual(['to-initial', ...Array(8).fill('to-backlog')]);
    });

    it('29.365 this Decision\'s own Not-taken tickets return to Backlog with the loop; another Decision\'s stay', () => {
      // q -> x -> d, and d -> x 'Again' closes the loop (a Start in front so the search enters at q); d -> y 'No' was Not taken by d in pass 1; z was Not taken by someone else
      const edges: FlowEdge[] = [edge(Q, X), edge(X, DEC), edge(DEC, X, 'Again'), edge(DEC, Y, 'No'), edge(W, Z)];
      const nodes = [
        fnode(Q), decision(DEC, decided('Again')), fnode(X, { ...FINISHED, closed: true }),
        fnode(Y, notTaken(DEC, 'Yes', 1)), fnode(W), fnode(Z, notTaken(uid(99), 'Yes', 1)),
      ];
      const plan = planSettle({ nodes, edges, decisionId: DEC });
      const names = (ids: Iterable<string>) => [...ids].map((id) => ({ [X]: 'x', [Y]: 'y', [Z]: 'z', [DEC]: 'd' })[id] ?? id);
      expect(show(plan, names)).toEqual(['reopen:x', 'to-initial:x', 'to-backlog:d', 'reopen:y', 'to-backlog:y']);
      expect(show(plan, names).some((s) => s.endsWith(':z'))).toBe(false);
    });
  });

  describe('29.366 revising, clearing and the second pass', () => {
    /** d: Yes -> x, No -> y. Pass 1 chose Yes: x ran, y is Not taken. */
    const edges = [edge(DEC, X, 'Yes'), edge(DEC, Y, 'No')];
    const pass1 = (outcome: string | null, x: Partial<FlowNode>, y: Partial<FlowNode> = notTaken(DEC)) => [decision(DEC, decided(outcome)), fnode(X, x), fnode(Y, y)];
    const names = (ids: Iterable<string>) => [...ids].map((id) => ({ [X]: 'x', [Y]: 'y', [DEC]: 'd' })[id] ?? id);

    it('29.366 revising Yes -> No reopens the Not-taken "No" side to Backlog and closes the old side if it has not run; the old side\'s work is kept', () => {
      const idle = planSettle({ nodes: pass1('No', {}), edges, decisionId: DEC });
      expect(show(idle, names)).toEqual(['reopen:y', 'to-backlog:y', 'not-taken-transition:x', 'not-taken-close:x']);
      // x has finished work on the old side: it keeps its periods and is not closed (PS-5.2); y still returns
      const worked = planSettle({ nodes: pass1('No', FINISHED), edges, decisionId: DEC });
      expect(show(worked, names)).toEqual(['reopen:y', 'to-backlog:y']);
      // x is started: asked about, untouched
      const running = planSettle({ nodes: pass1('No', WORKING), edges, decisionId: DEC });
      expect(show(running, names)).toEqual(['reopen:y', 'to-backlog:y']);
      expect(names(running.started)).toEqual(['x']);
    });

    it('29.366 clearing (or a loop reset) returns only this Decision\'s Not-taken tickets; a non-terminal Decision with an outcome waits', () => {
      const cleared = planSettle({ nodes: pass1(null, {}), edges, decisionId: DEC });
      expect(show(cleared, names)).toEqual(['reopen:y', 'to-backlog:y']);
      // CONTROL: a Not-taken ticket of another Decision is not this Decision's to return
      const other = planSettle({ nodes: pass1(null, {}, notTaken(uid(98))), edges, decisionId: DEC });
      expect(other.steps).toEqual([]);
      // an outcome on a Decision that has not finished: the cascade waits for the finish
      const waiting = planSettle({ nodes: [decision(DEC, { outcome: 'No', stateId: 'doing', category: 'active' }), fnode(X), fnode(Y, notTaken(DEC))], edges, decisionId: DEC });
      expect(waiting).toEqual({ steps: [], blocked: null, started: [], touchesOthers: false });
      // not a Decision, or not in the flow: nothing
      expect(planSettle({ nodes: pass1('No', {}), edges, decisionId: X }).steps).toEqual([]);
      expect(planSettle({ nodes: pass1('No', {}), edges, decisionId: uid(77) }).steps).toEqual([]);
    });

    it('29.366 an outcome whose label has no edge any more refuses the plan instead of closing every branch', () => {
      const plan = planSettle({ nodes: pass1('Maybe', {}), edges, decisionId: DEC });
      expect(plan).toEqual({ steps: [], blocked: { ticketId: DEC, reason: 'outcome-has-no-branch' }, started: [], touchesOthers: false });
    });

    it('29.366 a settle is idempotent: applying the plan to the nodes and planning again moves nothing', () => {
      const cases: Array<{ nodes: FlowNode[]; edges: FlowEdge[]; decisionId: string }> = [
        { nodes: m.nodes({ '144': decided('No'), '147': FINISHED }), edges: m.edges(), decisionId: K['144'] },
        { nodes: m.nodes({ '149': { ...FINISHED, closed: true }, '150': FINISHED, '151': decided('Need more info') }), edges: m.edges(), decisionId: K['151'] },
        { nodes: pass1('No', {}), edges, decisionId: DEC },
        { nodes: pass1(null, {}), edges, decisionId: DEC },
      ];
      for (const c of cases) {
        const plan = planSettle(c);
        expect(plan.steps.length).toBeGreaterThan(0);
        expect(planSettle({ ...c, nodes: apply(c.nodes, plan, c.decisionId) }).steps).toEqual([]);
      }
    });
  });

  /** The state a plan leaves behind, as the reducer folds it (a reopen clears the flag and the resolution; a Decision reset clears its outcome). */
  function apply(nodes: FlowNode[], plan: SettlePlan, decisionId: string): FlowNode[] {
    const by = new Map<string, FlowNode>(nodes.map((n) => [n.id, { ...n }]));
    for (const s of plan.steps) {
      const n = by.get(s.ticketId);
      if (n === undefined) throw new Error(`step names an unknown ticket ${s.ticketId}`);
      if (s.kind === 'reopen') {
        n.closed = false;
        n.notTaken = null;
      } else if (s.kind === 'to-initial' || s.kind === 'to-backlog') {
        Object.assign(n, { stateId: s.toStateId, category: 'open', started: false });
        if (n.id === decisionId) n.outcome = null;
      } else if (s.kind === 'not-taken-transition') {
        Object.assign(n, { stateId: s.toStateId, category: 'terminal', started: false });
      } else {
        n.closed = true;
        n.notTaken = { kind: 'not-taken', decisionTicketId: decisionId, outcome: 'x', pass: 1 };
      }
    }
    return [...by.values()];
  }

  describe('29.367 a plan the engine would refuse is refused whole; the events carry the flow causes', () => {
    it('29.367 a ticket that would leave a finished state under a finished parent blocks the plan, unless the parent leaves first', () => {
      // q -> x -> d, d -> x 'Again' is the loop; x is a finished child of the finished parent p
      const edges = [edge(Q, X), edge(X, DEC), edge(DEC, X, 'Again')];
      const child = (parent: Partial<FlowNode>) => [fnode(Q), fnode(P, parent), fnode(X, { ...FINISHED, parentId: P }), decision(DEC, decided('Again'))];
      const blocked = planSettle({ nodes: child(FINISHED), edges, decisionId: DEC });
      expect(blocked).toEqual({ steps: [], blocked: { ticketId: X, reason: 'parent-finished' }, started: [], touchesOthers: false });
      // CONTROL: the same child under an unfinished parent moves
      expect(planSettle({ nodes: child({ stateId: 'doing', category: 'active' }), edges, decisionId: DEC }).blocked).toBeNull();
      // a Decision that is itself the finished child blocks for the same reason
      const dChild = [fnode(Q), fnode(P, FINISHED), fnode(X), decision(DEC, decided('Again', { parentId: P }))];
      expect(planSettle({ nodes: dChild, edges, decisionId: DEC }).blocked).toEqual({ ticketId: DEC, reason: 'parent-finished' });
      // a parent in the same plan that leaves first lets the child through
      const both = [fnode(Q), fnode(P, { ...FINISHED, closed: true }), fnode(X, { ...FINISHED, parentId: P }), decision(DEC, decided('Again'))];
      const bothEdges = [edge(Q, P), edge(P, X), edge(X, DEC), edge(DEC, P, 'Again')];
      const together = planSettle({ nodes: both, edges: bothEdges, decisionId: DEC });
      expect(together.blocked).toBeNull();
      expect(show(together, (ids) => [...ids].map((id) => ({ [P]: 'p', [X]: 'x', [DEC]: 'd' })[id] ?? id))).toEqual([
        'reopen:p', 'to-initial:p', 'to-backlog:d', 'to-backlog:x', // parents (depth 0) before children, then flow order
      ]);
    });

    it('29.367 settleEvents files each step as the flow actor, with the right cause, and every event passes the door', () => {
      const nodes = m.nodes({ '149': { ...FINISHED, closed: true }, '150': FINISHED, '151': decided('Need more info') });
      const loop = planSettle({ nodes, edges: m.edges(), decisionId: K['151'] });
      let n = 0;
      const ctx = {
        workspaceId: '01J9GWS0000000000000000000',
        decisionId: K['151'],
        decisionEventId: uid(500),
        decidedBy: uid(501),
        outcome: 'Need more info',
        pass: 1,
        clientTime: '2026-10-03T09:00:00.000Z',
        mintId: () => uid(600 + n++),
      };
      const events = settleEvents(loop, ctx);
      expect(events.map((e) => [e.type, keysOf([e.entity.id])[0]])).toEqual([
        ['ticket.reopened', '149'], ['ticket.transitioned', '149'], ['ticket.transitioned', '150'], ['ticket.transitioned', '151'],
      ]);
      expect(new Set(events.map((e) => e.id)).size).toBe(events.length);
      for (const e of events) {
        expect(e.actorId).toBe(SYSTEM_ACTOR_FLOW);
        expect(e.origin).toBe('server');
        expect(parseEvent(e)).toMatchObject({ ok: true });
        expect((e.payload as { cause: unknown }).cause).toEqual({
          kind: 'reopened-by-flow', decisionTicketId: K['151'], outcome: 'Need more info', pass: 1, decidedBy: uid(501), decisionEventId: uid(500),
        });
      }
      expect((events[1]?.payload as { to: string }).to).toBe('todo');
      expect((events[3]?.payload as { to: string }).to).toBe('backlog');

      // the Not-taken pair: a transition to the first terminal state, then the close, both branch-not-taken
      const branch = settleEvents(planSettle({ nodes: m.nodes({ '144': decided('Yes') }), edges: m.edges(), decisionId: K['144'] }), { ...ctx, decisionId: K['144'], outcome: 'Yes' });
      expect(branch.map((e) => e.type)).toEqual(['ticket.transitioned', 'ticket.closed']);
      expect((branch[0]?.payload as { to: string }).to).toBe('done');
      for (const e of branch) {
        expect(parseEvent(e)).toMatchObject({ ok: true });
        expect((e.payload as { cause: { kind: string } }).cause.kind).toBe('branch-not-taken');
      }
      // a blocked or empty plan files nothing
      expect(settleEvents({ steps: [], blocked: { ticketId: X, reason: 'child-open' }, started: [], touchesOthers: false }, ctx)).toEqual([]);
    });
  });
  ```

  Run (`slot-run.sh` is `/Users/kiro/my_projects/gisik-nokma-lanes/slot-run.sh`): `slot-run.sh wtg2-t15-red -- pnpm --filter @gisik-nokma/domain exec vitest run test/flow/settle.test.ts --maxWorkers=2 > /tmp/wtg2-t15-red.log 2>&1; tail -30 /tmp/wtg2-t15-red.log`. Expected: FAIL (`planSettle is not a function`).

  Commit: `wtg2 T15: RED planSettle cases`.

- [ ] **Step 3: `planSettle` and `settleEvents`**

  `packages/domain/src/flow/settle.ts`:
  ```ts
  import type { SubmittedEvent } from '../envelope.js';
  import { newUlid } from '../ids.js';
  import { SYSTEM_ACTOR_FLOW } from '../system-actors.js';
  import { BACKLOG_STATE_ID } from '../workflow.js';
  import { analyzeFlow } from './analysis.js';
  import type { FlowCause } from './causes.js';
  import { branchOf, liveSet, loopBody, sameLabel } from './graph.js';
  import { edgeKey, type FlowEdge, type FlowNode } from './types.js';

  export type ProposedEvent = SubmittedEvent;

  /** One move of a settle cascade. A reopen and the transition that follows it are two steps, in that order. */
  export type SettleStep =
    | { kind: 'reopen'; ticketId: string }
    | { kind: 'to-initial'; ticketId: string; toStateId: string }
    | { kind: 'to-backlog'; ticketId: string; toStateId: typeof BACKLOG_STATE_ID }
    | { kind: 'not-taken-transition'; ticketId: string; toStateId: string }
    | { kind: 'not-taken-close'; ticketId: string };

  /** Why the engine would refuse the cascade (PS-9). Stable codes; the gate turns them into sentences with keys. */
  export type SettleBlockReason =
    | 'parent-finished' // a ticket would leave a finished state under a finished parent (transition.ts:185-205)
    | 'child-open' // a ticket would be finished over a child that stays open (transition.ts:152-164)
    | 'outcome-has-no-branch' // the outcome names a label with no edge any more
    | 'no-terminal-state'; // the workflow has no terminal state to park a Not-taken ticket in

  export type SettlePlan = {
    steps: SettleStep[];
    /** A move the engine would refuse. The plan is refused whole: `steps` is empty. */
    blocked: { ticketId: string; reason: SettleBlockReason } | null;
    /** Started tickets on a branch that left the live set, not named in `closeStarted`: they need a person's choice. */
    started: string[];
    /** True when any step moves a ticket other than the Decision itself. */
    touchesOthers: boolean;
  };

  const NOTHING: SettlePlan = { steps: [], blocked: null, started: [], touchesOthers: false };
  const blockedPlan = (ticketId: string, reason: SettleBlockReason): SettlePlan => ({ steps: [], blocked: { ticketId, reason }, started: [], touchesOthers: false });

  /**
   * PS-4 to PS-6: what choosing, revising or clearing a Decision's outcome does to the rest of its flow.
   * Pure and clock-free; a function of the CURRENT node states only, so running it on the states it
   * produced gives an empty plan (a settle that arrives twice moves nothing the second time).
   *
   * - Unsettled Decision (no outcome): only the reopen to Backlog of the live tickets that carry a
   *   Not-taken close caused by THIS Decision.
   * - An outcome on a Decision that is not terminal: nothing (the cascade waits for the finish).
   * - Loop outcome (the label's edge is a back edge): the target is reopened and sent to its initial
   *   state when it is finished; every other ticket of the loop body, the Decision included, goes to
   *   Backlog; this Decision's own Not-taken tickets return to Backlog; nothing is pruned.
   * - Any other outcome: the tickets on the Decision's other branches that are not in the new live set
   *   are closed "Not taken" (children first) unless started or finished; live tickets that carry a
   *   Not-taken close are reopened to Backlog; started tickets on a left branch are untouched unless
   *   named in `closeStarted` and are returned in `started` so the caller can ask.
   * Drafts and trashed tickets are never moved.
   */
  export function planSettle(input: {
    nodes: readonly FlowNode[];
    edges: readonly FlowEdge[];
    decisionId: string;
    closeStarted?: readonly string[];
  }): SettlePlan {
    const { nodes, edges, decisionId } = input;
    const byId = new Map(nodes.map((n) => [n.id, n] as const));
    const d = byId.get(decisionId);
    if (d === undefined || !d.isDecision) return NOTHING;
    if (d.outcome !== null && d.category !== 'terminal') return NOTHING;

    const analysis = analyzeFlow(nodes, edges);
    const flowRank = new Map(analysis.order.map((id, i) => [id, i] as const));
    const depth = (n: FlowNode): number => {
      let hops = 0;
      for (let at = n.parentId === null ? undefined : byId.get(n.parentId); at !== undefined && hops <= nodes.length; at = at.parentId === null ? undefined : byId.get(at.parentId)) hops += 1;
      return hops;
    };
    const byFlowOrder = (a: FlowNode, b: FlowNode): number => (flowRank.get(a.id) ?? 0) - (flowRank.get(b.id) ?? 0);
    const movable = (n: FlowNode): boolean => !n.draft && !n.trashed;
    const parentOf = (n: FlowNode): FlowNode | undefined => (n.parentId === null ? undefined : byId.get(n.parentId));
    const reset = (ofOutcome: string | null): FlowNode[] => nodes.map((n) => (n.id === d.id ? { ...n, outcome: ofOutcome } : n));

    /** Reopen (when the closed flag is set) then a transition, for a ticket that leaves its finished or running state. */
    const leave = (n: FlowNode, to: SettleStep & { kind: 'to-initial' | 'to-backlog' }): SettleStep[] => (n.closed ? [{ kind: 'reopen', ticketId: n.id }, to] : [to]);
    /** PS-9: a ticket may not leave a finished state under a finished parent unless the parent leaves first. */
    const leavesUnderFinishedParent = (moved: readonly FlowNode[]): FlowNode | undefined => {
      const leaving = new Set(moved.filter((n) => n.category === 'terminal').map((n) => n.id));
      return moved.find((n) => {
        if (n.category !== 'terminal') return false;
        const parent = parentOf(n);
        return parent !== undefined && parent.category === 'terminal' && !leaving.has(parent.id);
      });
    };
    const parentsFirst = (a: FlowNode, b: FlowNode): number => depth(a) - depth(b) || byFlowOrder(a, b);
    const childrenFirst = (a: FlowNode, b: FlowNode): number => depth(b) - depth(a) || byFlowOrder(a, b);
    const finish = (steps: SettleStep[], started: string[]): SettlePlan => ({
      steps,
      blocked: null,
      started,
      touchesOthers: steps.some((s) => s.ticketId !== d.id),
    });
    const ownNotTaken = (live: ReadonlySet<string>): FlowNode[] =>
      nodes.filter((n) => movable(n) && n.notTaken?.decisionTicketId === d.id && live.has(n.id));

    // Unsettled: cleared, or released by a loop reset.
    if (d.outcome === null) {
      const reopened = ownNotTaken(liveSet(nodes, edges, analysis)).sort(parentsFirst);
      const stuck = leavesUnderFinishedParent(reopened);
      if (stuck !== undefined) return blockedPlan(stuck.id, 'parent-finished');
      return finish(reopened.flatMap((n) => leave(n, { kind: 'to-backlog', ticketId: n.id, toStateId: BACKLOG_STATE_ID })), []);
    }

    const chosen = edges.find((e) => e.sourceId === d.id && sameLabel(e.label, d.outcome));
    if (chosen === undefined) return blockedPlan(d.id, 'outcome-has-no-branch');

    // Loop outcome (PS-4).
    if (analysis.backEdges.has(edgeKey(chosen))) {
      const body = [...loopBody(chosen, edges, analysis)].map((id) => byId.get(id)).filter((n): n is FlowNode => n !== undefined && movable(n));
      const moved: Array<{ node: FlowNode; to: 'to-initial' | 'to-backlog' }> = [];
      for (const n of body) {
        if (n.id === chosen.targetId) {
          if (n.category === 'terminal') moved.push({ node: n, to: 'to-initial' });
        } else if (n.stateId !== BACKLOG_STATE_ID) {
          moved.push({ node: n, to: 'to-backlog' });
        }
      }
      const inBody = new Set(moved.map((m) => m.node.id));
      for (const n of ownNotTaken(liveSet(reset(null), edges, analysis))) {
        if (!inBody.has(n.id)) moved.push({ node: n, to: 'to-backlog' });
      }
      moved.sort((a, b) => parentsFirst(a.node, b.node));
      const stuck = leavesUnderFinishedParent(moved.map((m) => m.node));
      if (stuck !== undefined) return blockedPlan(stuck.id, 'parent-finished');
      return finish(
        moved.flatMap(({ node, to }) =>
          leave(node, to === 'to-initial' ? { kind: 'to-initial', ticketId: node.id, toStateId: node.initialStateId } : { kind: 'to-backlog', ticketId: node.id, toStateId: BACKLOG_STATE_ID }),
        ),
        [],
      );
    }

    // Any other outcome (PS-5).
    const live = liveSet(nodes, edges, analysis);
    const named = new Set(input.closeStarted ?? []);
    const left = new Set<string>();
    for (const e of edges) {
      if (e.sourceId !== d.id || sameLabel(e.label, d.outcome) || analysis.backEdges.has(edgeKey(e))) continue;
      for (const id of branchOf(d.id, e.label, edges, analysis)) left.add(id);
    }
    const closing = new Set<string>();
    const waiting: string[] = [];
    for (const id of [...left].sort((a, b) => (flowRank.get(a) ?? 0) - (flowRank.get(b) ?? 0))) {
      const n = byId.get(id);
      if (n === undefined || n.id === d.id || !movable(n) || live.has(id) || n.notTaken !== null || n.category === 'terminal') continue;
      if (n.started && !named.has(id)) waiting.push(id);
      else closing.add(id);
    }
    // PS-5.1: the children of a ticket that closes close first, by the same rule; one that cannot is a block.
    const childrenOf = new Map<string, FlowNode[]>();
    for (const n of nodes) if (n.parentId !== null) childrenOf.set(n.parentId, [...(childrenOf.get(n.parentId) ?? []), n]);
    const queue = [...closing];
    for (let i = 0; i < queue.length; i += 1) {
      const parentId = queue[i] as string;
      for (const child of childrenOf.get(parentId) ?? []) {
        if (child.category === 'terminal' || closing.has(child.id)) continue;
        if (!movable(child) || live.has(child.id) || (child.started && !named.has(child.id))) return blockedPlan(parentId, 'child-open');
        closing.add(child.id);
        queue.push(child.id);
      }
    }
    const closes = [...closing].map((id) => byId.get(id)).filter((n): n is FlowNode => n !== undefined).sort(childrenFirst);
    if (closes.length > 0 && closes.some((n) => n.firstTerminalStateId === null)) {
      return blockedPlan((closes.find((n) => n.firstTerminalStateId === null) as FlowNode).id, 'no-terminal-state');
    }
    const reopened = nodes.filter((n) => movable(n) && live.has(n.id) && n.notTaken !== null).sort(parentsFirst);
    const stuck = leavesUnderFinishedParent(reopened);
    if (stuck !== undefined) return blockedPlan(stuck.id, 'parent-finished');
    const steps: SettleStep[] = [
      ...reopened.flatMap((n) => leave(n, { kind: 'to-backlog', ticketId: n.id, toStateId: BACKLOG_STATE_ID })),
      ...closes.flatMap((n): SettleStep[] => [
        { kind: 'not-taken-transition', ticketId: n.id, toStateId: n.firstTerminalStateId as string },
        { kind: 'not-taken-close', ticketId: n.id },
      ]),
    ];
    return finish(steps, waiting);
  }

  /** What `settleEvents` needs beyond the plan: who decided what, when, and in which workspace. */
  export type SettleContext = {
    workspaceId: string;
    decisionId: string;
    /** The `ticket.decided` (or finishing transition) event that caused this cascade; goes into every cause. */
    decisionEventId: string;
    decidedBy: string;
    /** The label the cause names: the chosen one, or on a clear the label that was cleared. */
    outcome: string;
    pass: number;
    /** ISO instant stamped on every event as its `clientTime`; passed in so this module reads no clock. */
    clientTime: string;
    /** Event id source; defaults to `newUlid`. Tests pass a counter. */
    mintId?: () => string;
  };

  /**
   * The real events of a plan, in step order, filed as the reserved flow actor with `origin: 'server'`.
   * Loop and reopen steps carry `reopened-by-flow`; Not-taken steps carry `branch-not-taken`. The order
   * of the plan is the order of submission: reopens come before the transition that needs them,
   * parents before children when leaving a finished state, children before parents when closing.
   */
  export function settleEvents(plan: SettlePlan, ctx: SettleContext): ProposedEvent[] {
    const mint = ctx.mintId ?? newUlid;
    const cause = (kind: 'reopened-by-flow' | 'branch-not-taken'): FlowCause => ({
      kind,
      decisionTicketId: ctx.decisionId,
      outcome: ctx.outcome,
      pass: ctx.pass,
      decidedBy: ctx.decidedBy,
      decisionEventId: ctx.decisionEventId,
    });
    return plan.steps.map((step): ProposedEvent => {
      const [type, payload] = ((): [string, unknown] => {
        switch (step.kind) {
          case 'reopen':
            return ['ticket.reopened', { cause: cause('reopened-by-flow') }];
          case 'to-initial':
          case 'to-backlog':
            return ['ticket.transitioned', { to: step.toStateId, cause: cause('reopened-by-flow') }];
          case 'not-taken-transition':
            return ['ticket.transitioned', { to: step.toStateId, cause: cause('branch-not-taken') }];
          case 'not-taken-close':
            return ['ticket.closed', { cause: cause('branch-not-taken') }];
        }
      })();
      return {
        id: mint(),
        workspaceId: ctx.workspaceId,
        entity: { kind: 'ticket', id: step.ticketId },
        type,
        version: 1,
        payload,
        actorId: SYSTEM_ACTOR_FLOW,
        origin: 'server',
        clientTime: ctx.clientTime,
      };
    });
  }
  ```

  Add `export * from './settle.js';` to `flow/index.ts`, and in `clock-free.test.ts` add `expect(files).toContain('settle.ts');` after the `plan.ts` line. If T8's cause schema names a member differently from the five fields used in `cause(...)` (`kind`, `decisionTicketId`, `outcome`, `pass`, `decidedBy`, `decisionEventId`), the `parseEvent` row of 29.367 fails first; fix the object in `settleEvents` to match T8's `flowCauseSchema` (`packages/domain/src/flow/causes.ts`), not the schema.

  Run: `slot-run.sh wtg2-t15-green -- pnpm --filter @gisik-nokma/domain exec vitest run test/flow --maxWorkers=2 > /tmp/wtg2-t15-green.log 2>&1; tail -30 /tmp/wtg2-t15-green.log`. Expected: PASS (all flow test files; 14 tests in `settle.test.ts`). Then `slot-run.sh wtg2-t15-tc -- pnpm --filter @gisik-nokma/domain typecheck > /tmp/wtg2-t15-tc.log 2>&1; tail -20 /tmp/wtg2-t15-tc.log` and the same with `build`. Expected: clean.

  Commit: `wtg2 T15: planSettle and settleEvents`.

- [ ] **Step 4: Flip, Features, mutations, DONE**
  - Flip 29.364-29.367 to ✅ in the same commit; `pnpm check:citations`, `node scripts/check-case-ids.mjs`.
  - **Features** (under `<!-- wtg-part2-model T15 bullet -->`; keep the anchor line, T19 reads the bullets below it): `- ⚙️ **Settle plan** (wtg2 T15; `packages/domain/src/flow/settle.ts`) — a pure function from a flow's current states and a Decision's outcome to the moves that settle it: close the branches not taken (children first), re-run a loop body, return a revised or cleared Decision's Not-taken tickets to Backlog, refuse the whole plan when the engine would refuse a step, and build the events as the Flow actor with the right causes. Cases 29.364-29.367.`
  - **Mutations** (each applied, `settle.test.ts` run, then reverted; all verified red):

  | Case | Mutation | Expected red |
  |---|---|---|
  | 29.364 | `\|\| live.has(id) \|\| n.notTaken !== null` becomes `\|\| n.notTaken !== null` | the Yes / No rows (6 failures) |
  | 29.364 | `depth(b) - depth(a)` becomes `depth(a) - depth(b)` in `childrenFirst` | the children-first test |
  | 29.364 | `if (n.started && !named.has(id)) waiting.push(id)` becomes `if (false) waiting.push(id)` | the Decision-No row (3 failures) |
  | 29.364 | `const movable = ... => !n.draft && !n.trashed` becomes `=> true` | the drafts-and-trashed test |
  | 29.365 | `moved.push({ node: n, to: 'to-initial' })` becomes `to: 'to-backlog'` | the target row (5 failures) |
  | 29.365 | `n.notTaken?.decisionTicketId === d.id && live.has(n.id)` becomes `n.notTaken !== null && live.has(n.id)` | the other-Decision row (2 failures) |
  | 29.366 | `const reopened = nodes.filter(... n.notTaken !== null).sort(parentsFirst)` (non-loop arm) becomes `const reopened: FlowNode[] = []` | the revise test |
  | 29.366 | `if (chosen === undefined) return blockedPlan(...)` becomes `return NOTHING` | the no-branch refusal |
  | 29.367 | `cause('branch-not-taken')` for the close becomes `cause('reopened-by-flow')` | the events test |
  | 29.367 | `return parent !== undefined && parent.category === 'terminal' && !leaving.has(parent.id)` becomes `return false` | the blocked-parent test |
  | 29.186 | add `const t = new Date();` to `settle.ts` | `clock-free.test.ts` names `settle.ts` |

  Push. DONE + REVIEW (NEEDS: T5, T8, T9, T10 merged; T8's `flowCauseSchema` member names re-read; T16 updates its `settleEvents` call with `workspaceId` and `clientTime`).

---

### Task 16: The settle listener, the two server gates, the sweep's settle half (cases 29.368-29.370)

**Branch:** `task/wtg2-settle-server` from `origin/release/workflow-graph`; PR `--base release/workflow-graph`. **Needs:** T15 (`planSettle`, `settleEvents`), T13 (`flow-world.ts`, the promoter), T14 (`sweep.ts` with the `settleHalf` seam), T12 (`readFlow`), T8 (`SYSTEM_ACTOR_FLOW`, `flowCauseSchema`) and **Drafts T5b, which adds `ingestAtomic(rawEvents: unknown[]): Promise<AtomicOutcome>` on `IngestService` (Drafts R47, case 28.099; `AtomicOutcome = { status: 'committed'; results: IngestResult[] } | { status: 'rolled-back'; index: number; result: IngestResult }`, exported from `apps/server/src/ingest/ingest-service.ts`)**. `ingestAtomic` is not on the tip (`grep -rn ingestAtomic apps/server/src` returns nothing at `160ac75c`); if that task is not merged this task does not start (contract decision 11).

**Files:**
- Create: `apps/server/src/flow/settle.ts`; `apps/server/src/gates/decision-gates.ts`; `apps/server/test/flow/settle.test.ts`; `apps/server/test/gates/decision-gates.test.ts`
- Modify: `apps/server/src/flow/sweep.ts` (replace `settleHalf`, T14); `apps/server/src/gates/index.ts:11-13` (append the three gates; export the module); `apps/server/src/app.ts` (`AppDeps` next to `serverAppend` `:137`, and the listener beside the promoter T13 added near `:1130-1145`); `apps/server/src/index.ts:144` (pass `serverAtomic`); `apps/server/src/ops/backup-daemon-main.ts` (pass `ingestAtomic` to `runFlowSweep`); `apps/server/test/gates/gate-seam.test.ts:145-156` (the pinned gate list, case 9.229); `apps/server/test/flow/flow-world.ts` (add `gatedIngest`, T13's file)
- Catalogue: `test-cases/29-workflow-timeline-graphs.md` under `<!-- wtg-part2-model T16 -->`; `Features.md` §26 under `<!-- wtg-part2-model T16 bullet -->`

**Interfaces:**
- **Consumes:** `planSettle(input: {nodes: FlowNode[]; edges: FlowEdge[]; decisionId: string; closeStarted?: readonly string[]}): SettlePlan`, `settleEvents(plan, ctx: {decisionId; decisionEventId; decidedBy; outcome; pass}): ProposedEvent[]` (T15; **re-read `packages/domain/src/flow/settle.ts` for the `ProposedEvent` shape and for the `SettlePlan.blocked.reason` text before Step 3**: the one mapper `toSubmitted` below assumes `{ticketId: string; type: string; payload: Record<string, unknown>}`); `readFlow`, `FLOW_SERVER_CAP`, `FlowIngest` (T12, T13); `SYSTEM_ACTOR_FLOW`, `DECISION_TYPE_ID`, `stateCategoryOf`; `getTicketStateFromDb(db, workspaceId, ticketId)` (`projections/tickets.ts:245`); `latestWorkflowDefs(db, workspaceId, ids)` (`read/workflow-defs.ts:25`); `canSee(db, userId, ticketId)` (`visibility/can-see.ts:283`); `CanSeeFn` (`notifications/fanout.ts:67`).
- **Produces:** `createFlowSettler(deps: {pool; ingest: FlowAtomicIngest; log?; plan?: typeof planSettle; now?}): {onCommitted(event: EventEnvelope): Promise<void>; settleDecision(workspaceId, decisionId): Promise<SettleOutcome>}`; `type FlowAtomicIngest = {ingestAtomic(events: SubmittedEvent[]): Promise<AtomicOutcome>}` (Drafts T5b's signature and answer); `type SettleOutcome = 'applied' | 'empty' | 'blocked' | 'refused' | 'skipped'`; `latestDecided(db, decisionId)`; `pendingSettle(db, deps, workspaceId, decisionId): Promise<boolean>`; `AppDeps.serverAtomic?: FlowAtomicIngest['ingestAtomic']`; `makeDecisionGates(opts?: {plan?: typeof planSettle; canSeeTicket?: CanSeeFn}): ServerGate[]` (three gates); constants `RULE_DECISION_BAD_CLOSE_STARTED = 'decision.bad-close-started'`, `RULE_DECISION_CASCADE_BLOCKED = 'decision.cascade-blocked'`; `runFlowSweep` deps gain `atomic?: FlowAtomicIngest`.

**Why a listener AND a gate (PS-9, PS-10).** The gate judges a person's choice BEFORE it is appended, so a Decision whose cascade cannot be applied is refused whole, and nothing half-applies. The listener files the cascade AFTER the choice committed, as one atomic batch under the flow actor, so the cascade is all-or-nothing and its events carry the Decision as their cause. The sweep repairs a cascade the listener lost (a crash, or a Decision committed in the daemon process, contract decision 5).

**Why gates return `null` at once for the flow actor.** A gate matches ONE `eventType`, so a gate on `ticket.transitioned` runs for every transition: a person's move, T13's promotions, the cascade's own moves. The cascade is filed through the same door with the gates armed (`ingestBatch` and `ingestAtomic` both run `server gates`: `ingest-service.ts` `commitOne`), so without the early return the gate would re-plan the cascade that is already being applied, and refuse its own moves. The first line of each gate is `if (event.actorId === SYSTEM_ACTOR_FLOW) return null`, then the cheap type test, and only then a read.

**Why the gate patches the node.** `check` judges the world BEFORE the event (`gates/server-gate.ts:32-36`). For a `ticket.transitioned` into a terminal state the Decision is not yet terminal in `proj_tickets`, and for a `ticket.decided` the outcome is not yet set, so the gate takes the flow from `readFlow` and replaces the Decision's node with the claimed category and outcome before `planSettle`. `closeStarted` is not folded into state (T5), so the settler and the transition gate read it from the Decision's latest `ticket.decided` row in `events`.

**Why one in-process chain per Decision.** The listener fires for the `ticket.decided` and again for the finishing `ticket.transitioned` of the same Decision, and a person can retry. Two plans computed from the same world would file the same moves twice; the second would be refused by the engine, which is safe but noisy and it consumes ids. `settleDecision` runs through a chain keyed by the Decision, and recomputes the plan after acquiring it, so the second run sees the first run's moves and plans nothing. (FINDING for T8: the flow exemption should also refuse `to === current`, so a duplicate never commits even across processes.)

- [ ] **Step 1: Case lines**

  Under `<!-- wtg-part2-model T16 -->`, all ❌:
  - `- ❌ **29.368 — a committed Decision choice is settled by ONE atomic batch under the flow actor (origin server, every move carrying the Decision, its event, the chooser, the outcome and the pass as its cause), the first ticket of a second pass is promoted again without a sweep, the decided event and the finishing transition arriving together produce exactly one cascade, and a repeat moves nothing;** control: a Decision with no downstream tickets files nothing. Mutation: drop the per-Decision chain → the concurrent pair files two cascades and the second is counted refused.`
  - `- ❌ **29.369 — runFlowSweep settles a Decision whose cascade was lost, idempotently, only once it is older than the 60 second grace window; a blocked plan is counted refused and applied once it unblocks; pendingSettle is true while steps wait and false after;** control: a Decision settled by the listener is left alone (settled 0). Mutation: drop the grace test → the sweep races a listener that is still running and files twice.`
  - `- ❌ **29.370 — the Decision gates refuse a person's finishing transition or choice whose cascade is blocked (decision.cascade-blocked, naming the blocking ticket only to a viewer who can see it) and a closeStarted naming a ticket outside the flow (decision.bad-close-started, without ids), and they pass a promotion, a cascade move and every non-Decision transition without a single query;** control: the same finishing transition with an applicable plan commits, and a person's own finishing transition on an unrelated ticket commits. Mutation: drop the flow-actor early return → the cascade's own moves are re-planned and one is refused.`
  Sub-`it`s share an id.

  Commit: `wtg2 T16: case lines 29.368-29.370`.

- [ ] **Step 2: RED tests 29.368 and 29.369**

  `apps/server/test/flow/settle.test.ts` — imports as `promote.test.ts` (T13 Step 4) plus `{ createFlowSettler, pendingSettle } from '../../src/flow/settle.js'`, `{ createFlowPromoter }`, `{ runFlowSweep }`. World builder (the Decision loop of PS-4, built with the real door):
  ```ts
  /** s(done) -> a(done) -> d(Decision, done) ; d -[Redo]-> a is a back edge; d -[Ship]-> z. */
  async function loopWorld() {
    const s = await addTicket(db.pool, { start: 'focus', moves: ['doing', 'done'] });
    const a = await addTicket(db.pool, { start: 'focus', moves: ['doing', 'done'] });
    const d = await addTicket(db.pool, { typeId: DECISION_TYPE_ID, start: 'focus', moves: ['doing', 'done'] });
    const z = await addTicket(db.pool);
    await lead(db.pool, s, a); await lead(db.pool, a, d); await lead(db.pool, d, a, 'Redo'); await lead(db.pool, d, z, 'Ship');
    return { s, a, d, z };
  }
  function rig() {
    const ingest = realIngest(db.pool);
    const atomic = vi.fn((events: SubmittedEvent[]) => ingest.ingestAtomic(events));
    const settler = createFlowSettler({ pool: db.pool, ingest: { ingestAtomic: atomic }, log: (m) => logs.push(m) });
    const promoter = createFlowPromoter({ pool: db.pool, ingest: { ingestBatch: (e) => ingest.ingestBatch(e) }, log: (m) => logs.push(m) });
    ingest.onEventCommitted((e) => { void settler.onCommitted(e); void promoter.onCommitted(e); });
    return { ingest, atomic, settler };
  }
  ```
  - **29.368 (a), the batch:** `{ s, a, d, z } = await loopWorld(); const { atomic, settler } = rig(); const decided = await decide(db.pool, d, 'Redo'); await settler.onCommitted(decided);` Then `expect(atomic).toHaveBeenCalledTimes(1)`; every event in `atomic.mock.calls[0][0]` has `actorId` `SYSTEM_ACTOR_FLOW` and `origin` `'server'`; the `cause` of each `ticket.transitioned`/`ticket.reopened` in it is `expect.objectContaining({ kind: 'reopened-by-flow', decisionTicketId: d, outcome: 'Redo', pass: 1, decidedBy: PERSON, decisionEventId: decided.id })`. **Re-read T15's `29.364-29.367` cases (`packages/domain/test/flow-settle.test.ts`) for which steps a Redo on this shape produces and copy their expectations verbatim.**
  - **(b), pass 2 promotes its first ticket:** after (a) settles, `await vi.waitFor(async () => expect(await stateOf(db.pool, a)).toBe('todo'))` — `a` was moved to Backlog by the flow, the promoter (T13's flow-cause trigger) saw its source `s` still terminal and filed `led-to`; `(await ledger(db.pool, a, 'ticket.transitioned')).map(causeKind)` ends with `['reopened-by-flow', 'led-to']` where `causeKind = (e) => e.payload.cause?.kind`. No `runFlowSweep` is called in this test.
  - **(c), the pair:** fresh world; `Promise.all([settler.onCommitted(decided), settler.onCommitted(finishing)])` where `finishing` is the `ticket.transitioned` envelope of the Decision's move to `done` (`step` returns it; take it before `decide`). `expect(atomic).toHaveBeenCalledTimes(1)` and `(await ledger(db.pool, a, 'ticket.transitioned')).filter((e) => causeKind(e) === 'reopened-by-flow')` has length 1.
  - **(d), repeat and control:** `await settler.settleDecision(WS, d)` again resolves `'empty'` and the ledger counts do not change. Control: a Decision with no outgoing links, decided: `settleDecision` resolves `'empty'` and `atomic` is not called.
  - **29.369 (a), the lost settle:** `{ s, a, d } = await loopWorld()`; a rig whose settler is NOT attached (`const ingest = realIngest(db.pool)`), `await decide(db.pool, d, 'Redo')`. `runFlowSweep({ pool: db.pool, ingest, atomic, now: () => new Date(Date.now() + 120_000) })` → `{ promoted: 1, settled: 1, refused: 0 }` (the settle half runs first, then the promote half promotes `a` back; `promoted` is 1 because `a`'s source `s` is terminal); a second run → `{ promoted: 0, settled: 0, refused: 0 }`.
  - **(b), the grace window:** the same lost-settle world with `now: () => new Date()` → `settled: 0`; the Decision is younger than 60 s. Control: with a listener-settled Decision and `now` 120 s ahead, `settled` is 0 (the plan is empty, nothing was filed).
  - **(c), blocked then applied:** `let blocked = true; const plan = (input) => blocked ? { steps: [], blocked: { ticketId: a, reason: 'cannot reopen' }, started: [], touchesOthers: false } : planSettle(input);` `runFlowSweep({ ..., plan })` → `refused: 1, settled: 0` and a log line containing `cannot reopen`; `pendingSettle(db.pool, { plan }, WS, d)` is `true`; then `blocked = false` and the sweep gives `settled: 1`; `pendingSettle` is `false`.

  Run: `/Users/kiro/my_projects/gisik-nokma-lanes/slot-run.sh wtg2-t16a -- pnpm --filter @gisik-nokma/server exec vitest run test/flow/settle.test.ts --maxWorkers=2 > /tmp/wtg2-t16a.log 2>&1; tail -40 /tmp/wtg2-t16a.log`. Expected: FAIL (`../../src/flow/settle.js` does not exist).

- [ ] **Step 3: The settler**

  `apps/server/src/flow/settle.ts`:
  ```ts
  import {
    DECISION_TYPE_ID, newUlid, planSettle, settleEvents, SYSTEM_ACTOR_FLOW,
    type EventEnvelope, type FlowNode, type SubmittedEvent,
  } from '@gisik-nokma/domain';
  import type { Queryable } from '../db/queryable.js';
  import type { AtomicOutcome } from '../ingest/ingest-service.js';
  import { FLOW_SERVER_CAP } from './promote.js';
  import { readFlow } from './read-flow.js';

  export type FlowAtomicIngest = { ingestAtomic(events: SubmittedEvent[]): Promise<AtomicOutcome> };
  export type SettleOutcome = 'applied' | 'empty' | 'blocked' | 'refused' | 'skipped';
  export type FlowSettleDeps = { pool: Queryable; ingest: FlowAtomicIngest; log?: (m: string, e?: unknown) => void; plan?: typeof planSettle; now?: () => Date };

  /** The Decision's latest choice, from the ledger: `closeStarted` is not folded into state (T5), the event id and actor are the cause's. */
  export async function latestDecided(db: Queryable, decisionId: string): Promise<{ eventId: string; actorId: string; closeStarted: string[] } | null> {
    const { rows } = await db.query<{ id: string; actor_id: string; payload: { closeStarted?: unknown } }>(
      `SELECT id, actor_id, payload FROM events WHERE entity_kind = 'ticket' AND entity_id = $1 AND type = 'ticket.decided' ORDER BY seq DESC LIMIT 1`,
      [decisionId],
    );
    const row = rows[0];
    if (row === undefined) return null;
    const cs = row.payload.closeStarted;
    return { eventId: row.id, actorId: row.actor_id, closeStarted: Array.isArray(cs) ? cs.filter((x): x is string => typeof x === 'string') : [] };
  }

  /** Outcome and pass for the cause. A reset Decision has `outcome` null; its last revision remembers what it was. */
  export function settleContext(node: FlowNode): { outcome: string; pass: number } | null {
    const passes = node.passes ?? [];
    const last = passes.at(-1);
    if (last === undefined) return null;
    const outcome = node.outcome ?? last.revisions.at(-1)?.from ?? last.outcome;
    return outcome === null || outcome === undefined ? null : { outcome, pass: last.pass };
  }

  const chains = new Map<string, Promise<unknown>>();
  function serialised<T>(key: string, work: () => Promise<T>): Promise<T> {
    const run = (chains.get(key) ?? Promise.resolve()).then(work, work);
    const tail = run.catch(() => undefined);
    chains.set(key, tail);
    void tail.then(() => { if (chains.get(key) === tail) chains.delete(key); });
    return run;
  }

  async function plannedFor(deps: FlowSettleDeps, workspaceId: string, decisionId: string) {
    const flow = await readFlow(deps.pool, { workspaceId, seedId: decisionId, viewerId: null, cap: FLOW_SERVER_CAP });
    if (flow.truncated) return { kind: 'skipped' as const };
    const node = flow.nodes.find((n) => n.id === decisionId);
    const decided = await latestDecided(deps.pool, decisionId);
    const ctx = node === undefined ? null : settleContext(node);
    if (node === undefined || node.typeId !== DECISION_TYPE_ID || node.category !== 'terminal' || ctx === null || decided === null) return { kind: 'skipped' as const };
    const plan = (deps.plan ?? planSettle)({ nodes: flow.nodes, edges: flow.edges, decisionId, closeStarted: decided.closeStarted });
    return { kind: 'planned' as const, plan, ctx, decided };
  }

  export function settleDecision(deps: FlowSettleDeps, workspaceId: string, decisionId: string): Promise<SettleOutcome> {
    return serialised(decisionId, async () => {
      const log = deps.log ?? (() => undefined);
      try {
        const p = await plannedFor(deps, workspaceId, decisionId);
        if (p.kind === 'skipped') return 'skipped';
        if (p.plan.blocked !== null) { log(`flow settle blocked for ${decisionId}: ${p.plan.blocked.reason}`); return 'blocked'; }
        if (p.plan.steps.length === 0) return 'empty';
        const clientTime = (deps.now ?? (() => new Date()))().toISOString();
        // T15's `settleEvents` returns complete submitted events (id, workspace, entity, actor, origin, clientTime).
        const events = settleEvents(p.plan, { workspaceId, clientTime, decisionId, decisionEventId: p.decided.eventId, decidedBy: p.decided.actorId, outcome: p.ctx.outcome, pass: p.ctx.pass });
        const outcome = await deps.ingest.ingestAtomic(events);
        if (outcome.status !== 'committed') { log(`flow settle refused for ${decisionId}: event ${outcome.index} ${JSON.stringify(outcome.result)}`); return 'refused'; }
        return 'applied';
      } catch (error) { log(`flow settle failed for ${decisionId}`, error); return 'refused'; }
    });
  }

  /** "Flow changes waiting" (PS-9): the plan still has work, or cannot be applied. Server-side data only; Part 3 draws it. */
  export async function pendingSettle(db: Queryable, deps: { plan?: typeof planSettle }, workspaceId: string, decisionId: string): Promise<boolean> {
    const p = await plannedFor({ pool: db, ingest: { ingestAtomic: async () => ({ status: 'committed' as const, results: [] }) }, ...deps }, workspaceId, decisionId);
    return p.kind === 'planned' && (p.plan.blocked !== null || p.plan.steps.length > 0);
  }

  export function createFlowSettler(deps: FlowSettleDeps): { onCommitted(event: EventEnvelope): Promise<void>; settleDecision(workspaceId: string, decisionId: string): Promise<SettleOutcome> } {
    return {
      settleDecision: (workspaceId, decisionId) => settleDecision(deps, workspaceId, decisionId),
      async onCommitted(event) {
        try {
          if (event.actorId === SYSTEM_ACTOR_FLOW || event.entity.kind !== 'ticket') return; // no re-entry: the cascade's own events never settle again
          if (event.type !== 'ticket.decided' && event.type !== 'ticket.transitioned') return;
          await settleDecision(deps, event.workspaceId, event.entity.id); // not a Decision, or not terminal yet: 'skipped'
        } catch (error) { (deps.log ?? (() => undefined))('flow settle listener failed', error); }
      },
    };
  }
  ```
  **Confirm at execution:** `FlowNode`'s fields `typeId`, `category`, `outcome`, `passes` by re-reading T9/T12's `packages/domain/src/flow/types.ts`; if T12 names the type field differently, change the three reads in `plannedFor` and `settleContext`, nothing else.

  Composition. `app.ts`: add `serverAtomic?: (events: SubmittedEvent[]) => Promise<AtomicOutcome>` to `AppDeps` beside `serverAppend` (optional, like `onNoteBodyCommitted`, so the many suites that build the app without it are untouched); after the promoter registration: `const settler = deps.serverAtomic === undefined ? null : createFlowSettler({ pool: deps.pool, ingest: { ingestAtomic: deps.serverAtomic } }); const offSettler = settler === null ? null : deps.ingest.onEventCommitted((event) => { void settler.onCommitted(event); });` and `offSettler?.();` in `onClose`. `index.ts:144`: `serverAtomic: (events) => ingest.ingestAtomic(events),`. The daemon (`backup-daemon-main.ts`) passes `atomic: { ingestAtomic: (events) => ingest.ingestAtomic(events) }` to `runFlowSweep`.

  Sweep (`flow/sweep.ts`): add `atomic?: FlowAtomicIngest; plan?: typeof planSettle` to `FlowSweepDeps`, and replace `settleHalf`:
  ```ts
  const SETTLE_GRACE_SECONDS = 60;      // the listener may still be running on a fresh choice
  const SETTLE_LOOKBACK_DAYS = 14;      // bounds the scan: the sweep never re-reads every Decision ever decided
  async function settleHalf(deps: FlowSweepDeps): Promise<{ settled: number; refused: number }> {
    if (deps.atomic === undefined) return { settled: 0, refused: 0 };
    const now = (deps.now ?? (() => new Date()))();
    const { rows } = await deps.pool.query<{ workspace_id: string; ticket_id: string }>(
      `SELECT t.workspace_id, t.ticket_id
         FROM proj_tickets t
         JOIN LATERAL (SELECT max(e.server_time) AS at FROM events e
                        WHERE e.entity_kind = 'ticket' AND e.entity_id = t.ticket_id AND e.type IN ('ticket.decided', 'ticket.transitioned')) last ON true
        WHERE t.type_id = $1 AND t.state_category = 'terminal' AND ${LIVE_TICKET_WHERE}
          AND last.at < $2::timestamptz - make_interval(secs => $3) AND last.at > $2::timestamptz - make_interval(days => $4)
          AND (t.outcome IS NOT NULL OR EXISTS (SELECT 1 FROM proj_tickets c WHERE c.closed_cause->>'kind' = 'branch-not-taken' AND c.closed_cause->>'decisionTicketId' = t.ticket_id))
        ORDER BY last.at DESC LIMIT 500`,
      [DECISION_TYPE_ID, now.toISOString(), SETTLE_GRACE_SECONDS, SETTLE_LOOKBACK_DAYS],
    );
    let settled = 0; let refused = 0;
    for (const row of rows) {
      const outcome = await settleDecision({ pool: deps.pool, ingest: deps.atomic, ...(deps.log === undefined ? {} : { log: deps.log }), ...(deps.plan === undefined ? {} : { plan: deps.plan }), ...(deps.now === undefined ? {} : { now: deps.now }) }, row.workspace_id, row.ticket_id);
      if (outcome === 'applied') settled += 1;
      else if (outcome === 'blocked' || outcome === 'refused') refused += 1;
    }
    return { settled, refused };
  }
  ```
  (add `DECISION_TYPE_ID` to the domain import and `import { settleDecision, type FlowAtomicIngest } from './settle.js'; import { planSettle } from '@gisik-nokma/domain';`). **Confirm at execution:** the column names `type_id` and `closed_cause` of `proj_tickets` (T9's migration) with `grep -n "closed_cause\|type_id" apps/server/migrations/*.sql`. T14's tests pass `atomic` nowhere, so they stay green.

  Run the Step 2 command. Expected: PASS for 29.368-29.369; flip them ✅. Then `slot-run.sh wtg2-t16b -- pnpm --filter @gisik-nokma/server exec vitest run test/flow --maxWorkers=2 > /tmp/wtg2-t16b.log 2>&1; tail -30 /tmp/wtg2-t16b.log` (T13 and T14 stay green).

  Commit: `wtg2 T16: the settler, serverAtomic, the sweep's settle half`.

- [ ] **Step 4: RED tests 29.370**

  Add to `flow-world.ts`: `export const gatedIngest = (pool: Pool, gates = buildServerGates()) => createIngestService({ pool, evaluate: evaluateEvent, projections: buildProjectionRegistry(), gates });` (import `buildServerGates` from `../../src/gates/index.js`).

  `apps/server/test/gates/decision-gates.test.ts` — a `describe` with the same `beforeEach`/`afterEach` as `promote.test.ts`; `const sub = (ticketId, type, payload, actorId = PERSON): SubmittedEvent => ({ id: newUlid(), workspaceId: WS, entity: { kind: 'ticket', id: ticketId }, type, version: 1, payload, actorId, origin: 'web', clientTime: new Date().toISOString() })`; `const blockedPlan = (ticketId: string, reason: string) => () => ({ steps: [], blocked: { ticketId, reason }, started: [], touchesOthers: false })`.
  - **29.370 (a), the cascade gate on the finishing transition:** a Decision `d` in `doing` with a downstream `z`; `gates = makeDecisionGates({ plan: blockedPlan(z, 'z is locked'), canSeeTicket: async () => true })`; `gate = gates[2]`; `await gate.check(sub(d, 'ticket.transitioned', { to: 'done' }), db.pool)` equals `{ rule: 'decision.cascade-blocked', reason: expect.stringContaining('z is locked') }`. Control: with `plan: () => ({ steps: [], blocked: null, started: [], touchesOthers: false })` it returns `null`; a transition to a non-terminal state (`{ to: 'doing' }`) returns `null`.
  - **(b), the same for `ticket.decided`** (`gates[1]`, on a Decision already in `done`): `sub(d, 'ticket.decided', { outcome: 'Ship' })` is refused with the same rule; the plan passed to `blockedPlan` is called with a node whose `outcome` is `'Ship'` (a `vi.fn` wrapper records `input.nodes.find((n) => n.id === d)?.outcome`).
  - **(c), the transition gate patches the node:** `plan` records the Decision node it was given for the `{ to: 'done' }` event; `category` is `'terminal'` although the stored state is `doing`.
  - **(d), a hidden blocker is not named:** `canSeeTicket: async () => false` with `reason: 'secret title'` → the refusal's `reason` does not contain `'secret title'` and contains the generic `a step you cannot see`; with `async () => true` it does.
  - **(e), `closeStarted`:** `gates[0]`: `sub(d, 'ticket.decided', { outcome: 'Ship', closeStarted: ['01J9GXXXXXXXXXXXXXXXXXXXXX'] })` (a well-formed id outside the flow) → `rule: 'decision.bad-close-started'`, and the `reason` contains no id. Control: `closeStarted: [z]` with `z` in the flow → `null`; no `closeStarted` or an empty array → `null`.
  - **(f), pass-through without a query:** a `db` wrapper `const counted = (n: { v: number }) => ({ query: (...a: Parameters<typeof db.pool.query>) => { n.v += 1; return db.pool.query(...a); } }) as unknown as Queryable`. For each of the three gates, `check(sub(d, 'ticket.transitioned', { to: 'done' }, SYSTEM_ACTOR_FLOW), counted(n))` and `check(sub(d, 'ticket.decided', { outcome: 'Ship', closeStarted: ['x'] }, SYSTEM_ACTOR_FLOW), counted(n))` return `null` with `n.v === 0`. A person's transition of a NON-Decision ticket (`TASK`) to `done` returns `null` (this one reads one ticket row, `n.v` is 1: pins that the cheap test comes before `readFlow`). Control: the person's finishing transition of the Decision with the blocked plan IS refused (row (a)).
  - **(g), end to end through the real door:** `ingest = gatedIngest(db.pool)`; with the real `planSettle` and the `loopWorld()` of Step 2 (export it from `flow-world.ts` instead of redefining it), a person's `ticket.decided` for `Redo` commits (`status: 'committed'`); the pair of flow-actor events the settler files afterwards (Step 2's rig with `ingest`) commits too: `(await ledger(db.pool, a, 'ticket.transitioned'))` contains a `reopened-by-flow` row and no `refused` result appears in `logs`. Fix `gate-seam.test.ts:145-156` to `['comment.added', 'comment.edited', 'ticket.field_set', 'ticket.transitioned', 'ticket.decided', 'ticket.decided', 'ticket.transitioned']` and reword the 9.229 `it` title to include the three decision gates; its explanatory comment keeps its first sentence.

  Run: `slot-run.sh wtg2-t16c -- pnpm --filter @gisik-nokma/server exec vitest run test/gates --maxWorkers=2 > /tmp/wtg2-t16c.log 2>&1; tail -40 /tmp/wtg2-t16c.log`. Expected: FAIL (`decision-gates.js` missing; the seam list differs).

- [ ] **Step 5: The gates**

  `apps/server/src/gates/decision-gates.ts`:
  ```ts
  import { DECISION_TYPE_ID, planSettle, stateCategoryOf, SYSTEM_ACTOR_FLOW, type SubmittedEvent } from '@gisik-nokma/domain';
  import type { Queryable } from '../db/queryable.js';
  import { latestDecided, settleContext } from '../flow/settle.js';
  import { FLOW_SERVER_CAP } from '../flow/promote.js';
  import { readFlow } from '../flow/read-flow.js';
  import type { CanSeeFn } from '../notifications/fanout.js';
  import { getTicketStateFromDb } from '../projections/tickets.js';
  import { latestWorkflowDefs } from '../read/workflow-defs.js';
  import { canSee } from '../visibility/can-see.js';
  import type { GateRefusal, ServerGate } from './server-gate.js';

  export const RULE_DECISION_BAD_CLOSE_STARTED = 'decision.bad-close-started';
  export const RULE_DECISION_CASCADE_BLOCKED = 'decision.cascade-blocked';
  export type DecisionGateOptions = { plan?: typeof planSettle; canSeeTicket?: CanSeeFn };

  const isFlowActor = (event: SubmittedEvent): boolean => event.actorId === SYSTEM_ACTOR_FLOW;
  const closeStartedOf = (payload: unknown): string[] => {
    const cs = (payload as { closeStarted?: unknown }).closeStarted;
    return Array.isArray(cs) ? cs.filter((x): x is string => typeof x === 'string') : [];
  };

  /** `ticket.decided` with a non-empty `closeStarted`: every id must be a ticket of THIS Decision's flow (DC-4). No ids in the reason. */
  function closeStartedGate(): ServerGate {
    return {
      eventType: 'ticket.decided',
      async check(event, db): Promise<GateRefusal | null> {
        if (isFlowActor(event)) return null;
        const ids = closeStartedOf(event.payload);
        if (ids.length === 0) return null;
        const flow = await readFlow(db, { workspaceId: event.workspaceId, seedId: event.entity.id, viewerId: null, cap: FLOW_SERVER_CAP });
        if (flow.truncated) return null; // a flow too large to judge is not refused for it; the settler logs it
        const inFlow = new Set(flow.nodes.map((n) => n.id));
        return ids.every((id) => inFlow.has(id)) ? null : { rule: RULE_DECISION_BAD_CLOSE_STARTED, reason: 'Some of the tickets chosen to close are not part of this flow.' };
      },
    };
  }

  /** Plan the cascade of the choice being made, against the world BEFORE it, with the Decision's node patched to the claimed state. */
  async function cascadeRefusal(event: SubmittedEvent, db: Queryable, claim: { outcome: string | null; closeStarted: string[] }, opts: DecisionGateOptions): Promise<GateRefusal | null> {
    const flow = await readFlow(db, { workspaceId: event.workspaceId, seedId: event.entity.id, viewerId: null, cap: FLOW_SERVER_CAP });
    if (flow.truncated || claim.outcome === null) return null;
    const nodes = flow.nodes.map((n) => (n.id === event.entity.id ? { ...n, category: 'terminal' as const, outcome: claim.outcome } : n));
    const plan = (opts.plan ?? planSettle)({ nodes, edges: flow.edges, decisionId: event.entity.id, closeStarted: claim.closeStarted });
    if (plan.blocked === null) return null;
    const visible = await (opts.canSeeTicket ?? ((d, u, t) => canSee(d, u, t)))(db, event.actorId, plan.blocked.ticketId);
    return {
      rule: RULE_DECISION_CASCADE_BLOCKED,
      reason: `This choice cannot be applied: ${visible ? plan.blocked.reason : 'a step you cannot see is blocking it'}.`,
    };
  }

  function cascadeOnDecidedGate(opts: DecisionGateOptions): ServerGate {
    return {
      eventType: 'ticket.decided',
      async check(event, db) {
        if (isFlowActor(event)) return null;
        const ticket = await getTicketStateFromDb(db, event.workspaceId, event.entity.id);
        if (ticket === null || ticket.typeId !== DECISION_TYPE_ID) return null;
        const outcome = (event.payload as { outcome?: unknown }).outcome;
        return cascadeRefusal(event, db, { outcome: typeof outcome === 'string' ? outcome : null, closeStarted: closeStartedOf(event.payload) }, opts);
      },
    };
  }

  /** A Decision's own finishing transition decides nothing by itself, but it makes a stored choice take effect: judge that cascade too. */
  function cascadeOnTransitionGate(opts: DecisionGateOptions): ServerGate {
    return {
      eventType: 'ticket.transitioned',
      async check(event, db) {
        if (isFlowActor(event)) return null;
        const ticket = await getTicketStateFromDb(db, event.workspaceId, event.entity.id);
        if (ticket === null || ticket.typeId !== DECISION_TYPE_ID) return null;
        const to = (event.payload as { to?: unknown }).to;
        if (typeof to !== 'string') return null;
        const defs = await latestWorkflowDefs(db, event.workspaceId, [ticket.workflowId]);
        const def = defs.get(ticket.workflowId);
        if (def === undefined || stateCategoryOf(def, to) !== 'terminal') return null;
        const flow = ticket.outcome === undefined ? null : { outcome: ticket.outcome };
        if (flow === null) return null; // finishing with no choice made settles nothing
        const decided = await latestDecided(db, event.entity.id);
        return cascadeRefusal(event, db, { outcome: flow.outcome, closeStarted: decided?.closeStarted ?? [] }, opts);
      },
    };
  }

  export function makeDecisionGates(opts: DecisionGateOptions = {}): ServerGate[] {
    return [closeStartedGate(), cascadeOnDecidedGate(opts), cascadeOnTransitionGate(opts)];
  }
  ```
  (`settleContext` is imported only if the transition arm needs a reset Decision's remembered outcome; if lint flags it unused, delete the import.) `gates/index.ts`: `return [...makeImageEmbedGates(), makeEvidenceGate(), ...makeDecisionGates()];` and `export * from './decision-gates.js';`. Run the Step 4 command. Expected: PASS; flip 29.370 ✅.

  Commit: `wtg2 T16: the Decision gates`.

- [ ] **Step 6: Features, sweeps, mutations, DONE**
  - **Features** (under `<!-- wtg-part2-model T16 bullet -->`; keep the anchor line, T19 reads the bullets below it): `- ⚙️ **Decision settle** (wtg2 T16; `apps/server/src/flow/settle.ts`, `apps/server/src/gates/decision-gates.ts`) — a committed Decision choice is settled by one atomic batch under the flow actor; two server gates refuse a choice whose cascade is blocked or a close list outside the flow; the flow sweep repairs a lost settle. Cases 29.368-29.370.` (plain backticks)
  - **Sweeps:** server WHOLE (`gate-seam`, `ticket-vocabulary-census`, `ingest`); `node scripts/check-case-ids.mjs`; `pnpm check:citations`; the ui-copy scan (`reason` strings contain no spaced em dash).
  - **Mutations** (run, then revert; each must turn the named case red):

  | Case | Mutation | Expected red |
  |---|---|---|
  | 29.368 | remove the `serialised` wrapper | (c) files twice |
  | 29.368 | drop the `SYSTEM_ACTOR_FLOW` return in `onCommitted` | the cascade's events re-enter and (a) calls `ingestAtomic` more than once |
  | 29.369 | drop the grace clause | (b) `settled` is 1 |
  | 29.369 | count `blocked` as `applied` | (c) `refused` is 0 |
  | 29.370 | drop the flow-actor return in the transition gate | (f) `n.v` is not 0 and (g) refuses a cascade move |
  | 29.370 | name `plan.blocked.reason` unconditionally | (d) leaks `secret title` |
  | 29.370 | gate `closeStarted` with `some` instead of `every` | (e) lets the foreign id through |

  Push. DONE + REVIEW (NEEDS: T15, T13, T14 and the Drafts `ingestAtomic` task merged).

---

### Task 17: History rounds and flow sentences; "Not taken is closed, never done" in every reader (cases 29.371-29.374)

**Branch:** `task/wtg2-history-readers` from `origin/release/workflow-graph`; PR `--base release/workflow-graph`. **Needs:** T5 (`ticket.decided`, `Decision` seed), T8 (`flowCauseSchema`, `isFlowCause`, `closed.cause`, the causes on three payloads), T9 (`notTakenOf`, `proj_tickets.closed_cause`, `rounds`), and typed-links T4 (the `linkTarget` History annotation this task copies). No migration, no new event type: the 3.183 census count is unchanged by this task.

**Files:**
- Create: `apps/server/src/read/history-causes.ts`; `apps/server/test/routes/ticket-history-causes.test.ts`.
- Modify (re-read each first; lines are from the tip `ec72d1f8`):
  - `packages/app-core/src/views/history-copy.ts:48-65` (`HistoryCopyContext`), `:110-251` (`describeEvent`), `packages/app-core/src/views/history-list.tsx:49-70`.
  - `packages/app-core/src/view-types.ts` (`TicketHistoryEvent` `:757-775`, `RollupToViewer` `:244-248`, `ListRow` after `rank` `:547`); `packages/app-core/src/online/mappers.ts` (`mapHistory` `:785-802`, `mapRollup` `:392-415`, `mapListRow` tail `:1816-1821`).
  - `packages/app-core/src/views/list-model.ts:39-44` (`countRows`), `views/rollup-text.ts:16-19`, `replica/replica-data-source.ts:1139-1170` (the `rowOf` literal).
  - `apps/server/src/routes/ticket-history.ts:29-39` (wire type), `:300-309` (handler); `apps/server/src/visibility/rollup.ts` (`RollupView` `:120-137`, `ChildRow` `:138-152`, query `:279-290`, tally `:313-345`, `out.set` `:364-370`); `apps/server/src/read/ticket-cards.ts` (`ProjTicketRow` `:18-47`, `PROJ_TICKET_COLUMNS` `:75-77`, `rollup` `:174-183`, `cards.push` `:184-216`); `apps/server/src/routes/tickets.ts:506-514`; `apps/server/src/projections/rollups.ts:108` (docblock only); `packages/domain/src/read-models.ts` (`TicketRollup` `:94-99`, `TicketCard.closed` `:222`).
- Tests extended: `packages/app-core/test/views/{history-copy.test.ts,history-list.test.tsx,list-model.test.ts,rollup-text.test.ts}`, `test/online/mappers.test.ts`, `test/replica/replica-data-source.test.ts`; `apps/server/test/visibility/rollup.test.ts`, `test/read/ticket-cards.test.ts`.

**Interfaces:**
- Consumes: `isFlowCause`, `FlowCause` (T8); `notTakenOf(cause: unknown): NotTakenResolution | null` (T9, `flow/derive.ts`); `proj_tickets.closed_cause jsonb NULL` (T9); typed-links T4's `canSee` + `keysForAncestors` History pattern (`routes/ticket-history.ts`, spec A T4 Step 3).
- Produces: wire `TicketHistoryEvent.causeTicket?: { key: string | null } | null` (absent: no flow cause, an older server or the offline replica; `null`: the viewer cannot see the cause's ticket, and `payload.cause` has lost its ids); `HistoryCopyContext.round?: number`; `historyRounds(events: readonly TicketHistoryEvent[]): Map<string, number>` (event id to round); `TicketCard.notTaken?: true`, `ListRow.notTaken?: true`, `TicketRollup.notTakenChildren?: number`, `RollupToViewer.notTakenChildren?: number`, `RollupView.notTaken?: number` (all ABSENT when none); `rollupsFor`'s `terminal` is now DONE only.

**Why the decisions are what they are.**
- *Cards carry `notTaken: true`, never the Decision's id.* A card is served to viewers who may not see the Decision; the chip text (Part 3) can name it from the sheet. Absent-when-none is the repo's rule (`links`, `periods`) and keeps every existing `toEqual` on rollups and rows green.
- *`notTakenOf(row.closed_cause)` is the ONE definition* in SQL readers, the card and the replica row (`rowOf` calls `resolutionOf(state)`), so a cause with `kind` right and a body wrong cannot be "not taken" in one reader and "done" in another.
- *Done-meaning readers (T1's 29.150 list; Q1).* Changed: `visibility/rollup.ts`, `read/ticket-cards.ts`, `routes/tickets.ts`, `domain/read-models.ts`, `view-types.ts`, `online/mappers.ts`, `views/rollup-text.ts`, `views/list-model.ts` (the `ticket-list.tsx:530` text reads `countRows`, so it changes with it). Kept, with the reason: `routes/my-work.ts:137` (`t.closed_at IS NULL` already drops a not-taken ticket, because the not-taken pair ends in `ticket.closed`; pinned by 13.576 and now by the control in 29.374); `projections/rollups.ts:234` (`terminal_children` stays the structural count; its only readers are `getRollup` and tests, no card route: docblock note only); `workspace-counts.ts:68` (reads no category, T1). Home's Open already excludes closed tickets (Home plan D-E1); if Home's done-side counts have merged to the release branch by now, `git grep -n "state_category" apps/server/src/routes/home*` and apply `notTakenOf` the same way, then 29.150 stays green only if the file is classified.
- *Parent progress reads "4 of 8 done, 1 not taken".* The denominator stays all children (the file's honesty rule, `rollup-text.ts:3-14`), `terminal` drops the not-taken child, and the new count keeps the sum auditable: `terminal + notTaken + uncategorized <= total`. A parent can therefore not read "8 of 8 done" over a skipped branch.
- *History names the ticket per viewer, server-side.* `payload.cause.sourceTicketId` / `decisionTicketId` are raw ULIDs on the wire; the route follows typed-links T4 (it overrode "every claim-bearing field goes out whole" for one id) and also drops `triggeredBy` and `decidedBy` (a person's act on a ticket the viewer cannot see). `decisionEventId` stays: it is opaque and `historyRounds` pairs the reopen with its transition by it.
- *`historyRounds` counts distinct `decisionEventId`s of `reopened-by-flow`, not transitions only,* so the paired `ticket.reopened` that PRECEDES the transition (PS-5 rule 3) is labelled with the new round too; it agrees with T9's `ticketRound` because each reset files exactly one pair. Precondition: the events start at the ticket's first (`afterSeq` 0, which the History tab sends).
- *Wording is mine where the spec gives none:* spec AP-5 gives "Moved to To do automatically, because GN-145 was closed" and "an earlier step was finished"; the decision sentences are derived from PS-6 and the spec's case 28.

- [ ] **Step 1: Catalogue**

  Under `<!-- wtg-part2-model T17 -->` in `test-cases/29-workflow-timeline-graphs.md` (all ❌) and `<!-- wtg-part2-model T17 bullet -->` in Features:
  - `- ❌ **29.371 — History reads the flow in sentences: "Moved to To do automatically, because GN-145 was closed", "Reopened by the flow, because GN-151 was decided Yes", "Closed as not taken, because ...", "Decided: Yes", "Decision revised: Yes → No", "Cleared the decision (was Yes)"; a source the viewer cannot see reads "an earlier step was finished" / "an earlier decision chose Yes";** control: a close or reopen with no cause, and a transition with the old reopened-for-child cause, read as before. Mutation: print the visible wording when the key is null -> the withheld case reddens.`
  - `- ❌ **29.372 — every event of a ticket reset by the flow carries "(pass n)" from round 2 on: the paired reopen and transition count once, a person's reopen, a led-to move and a not-taken close add nothing, and a hidden-decision cause still pairs;** control: round 1 and the raw-type fallback stay bare. Mutation: count every flow cause -> the led-to control reddens.`
  - `- ❌ **29.373 — the History route annotates a flow cause per viewer: a visible ticket gives causeTicket {key} and a whole payload; a hidden one gives causeTicket null and a cause without ticket ids, triggeredBy or decidedBy;** control: the owner sees every key, and an event with no cause carries no causeTicket key. Mutation: skip the withholding -> the id appears in the member's body.`
  - `- ❌ **29.374 — Not taken is closed, never done: rollupsFor counts a not-taken terminal child in notTaken and not in terminal; a card, a list row (also from the replica) carries notTaken; countRows and formatRollup do not count it as done and the parent text names it;** control: the same child with its cause cleared is counted done, a terminal child with an unrelated cause is done, an open child carrying the cause counts as neither, and a closed not-taken ticket is in no My Work group (13.576). Mutation: tally terminal without notTakenOf -> the rollup case reddens.`
  Features: `✅ History explains automatic moves, decisions and passes ("Moved to To do automatically, because GN-145 was closed", "(pass 2)") without naming a ticket the viewer cannot see (packages/app-core/src/views/history-copy.ts, apps/server/src/read/history-causes.ts)`; `✅ A Not-taken ticket is closed, never done: parent progress, list counts and cards keep it out of "done" (apps/server/src/visibility/rollup.ts, packages/app-core/src/views/rollup-text.ts, list-model.ts)`.
  Run: `node scripts/check-case-ids.mjs && pnpm check:citations`. Expected: pass. Commit: `wtg2 T17: open the History and Not-taken reader cases`.

- [ ] **Step 2: RED app-core tests (29.371, 29.372)**

  Append to `packages/app-core/test/views/history-copy.test.ts` (uses its module-level `eventOf`; `historyRounds` joins the import from `history-copy.js`):
  ```ts
  describe('29.371 history copy: flow and decision sentences', () => {
    const ev = (type: string, payload: unknown, causeTicket?: { key: string | null } | null): TicketHistoryEvent => ({
      ...eventOf(type), payload, ...(causeTicket === undefined ? {} : { causeTicket }),
    });
    const names: Record<string, string> = { todo: 'To do', backlog: 'Backlog', done: 'Done' };
    const ctx = { stateName: (id: string): string => names[id] ?? id };
    const SRC = '01J9GTKB000000000000000000';
    const ledTo = { kind: 'led-to', sourceTicketId: SRC, triggeredBy: 'user_anselma' };
    const decision = (kind: string) => ({ kind, decisionTicketId: SRC, outcome: 'Yes', pass: 1, decidedBy: 'user_anselma', decisionEventId: 'dec-1' });

    it('29.371 narrates led-to, reopened-by-flow and branch-not-taken, with the key, without it, and with an old server', () => {
      const move = (cause: unknown, key?: { key: string | null } | null) => describeEvent(ev('ticket.transitioned', { to: 'todo', cause }, key), ctx);
      expect(move(ledTo, { key: 'GN-145' })).toBe('Moved to To do automatically, because GN-145 was closed');
      expect(move({ ...ledTo, label: 'Yes' }, { key: 'GN-145' })).toBe('Moved to To do automatically, because GN-145 was closed (Yes)');
      expect(move(ledTo, null)).toBe('Moved to To do automatically, because an earlier step was finished');
      expect(move(ledTo)).toBe('Moved to To do automatically, because an earlier step was finished'); // causeTicket absent
      expect(describeEvent(ev('ticket.transitioned', { to: 'backlog', cause: decision('reopened-by-flow') }, { key: 'GN-151' }), ctx)).toBe('Moved to Backlog by the flow, because GN-151 was decided Yes');
      expect(describeEvent(ev('ticket.transitioned', { to: 'done', cause: decision('branch-not-taken') }, { key: 'GN-151' }), ctx)).toBe('Moved to Done as not taken, because GN-151 was decided Yes');
      expect(describeEvent(ev('ticket.reopened', { cause: decision('reopened-by-flow') }, { key: 'GN-151' }))).toBe('Reopened by the flow, because GN-151 was decided Yes');
      expect(describeEvent(ev('ticket.closed', { cause: decision('branch-not-taken') }, { key: 'GN-151' }))).toBe('Closed as not taken, because GN-151 was decided Yes');
      expect(describeEvent(ev('ticket.closed', { cause: { kind: 'branch-not-taken', outcome: 'Yes', pass: 1, decisionEventId: 'dec-1' } }, null))).toBe('Closed as not taken, because an earlier decision chose Yes');
      // controls: no cause, a cause of the wrong kind for the event, and the pre-existing cause read as before
      expect(describeEvent(ev('ticket.closed', {}))).toBe('Closed');
      expect(describeEvent(ev('ticket.reopened', {}))).toBe('Reopened');
      expect(describeEvent(ev('ticket.closed', { cause: decision('reopened-by-flow') }, { key: 'GN-151' }))).toBe('Closed');
      expect(describeEvent(ev('ticket.transitioned', { to: 'todo', cause: { kind: 'reopened-for-child', childTicketId: SRC } }), ctx)).toBe('Moved to To do');
    });

    it('29.371 narrates the decision: first choice, revision, clearing, and a payload it cannot read', () => {
      expect(describeEvent(ev('ticket.decided', { outcome: 'Yes' }))).toBe('Decided: Yes');
      expect(describeEvent(ev('ticket.decided', { outcome: 'No', from: 'Yes' }))).toBe('Decision revised: Yes → No');
      expect(describeEvent(ev('ticket.decided', { outcome: null, from: 'Yes' }))).toBe('Cleared the decision (was Yes)');
      expect(describeEvent(ev('ticket.decided', { outcome: null }))).toBe('Cleared the decision');
      expect(describeEvent(ev('ticket.decided', { outcome: 7 }))).toBe('ticket.decided');
    });

    it('29.371 the pass suffix is added from round 2 and never to the raw-type fallback', () => {
      expect(describeEvent(ev('ticket.closed', {}), { round: 2 })).toBe('Closed (pass 2)');
      expect(describeEvent(ev('ticket.closed', {}), { round: 1 })).toBe('Closed');
      expect(describeEvent(ev('ticket.never_seen', {}), { round: 2 })).toBe('ticket.never_seen');
    });
  });

  describe('29.372 historyRounds', () => {
    const e = (id: string, type: string, payload: unknown): TicketHistoryEvent => ({ ...eventOf(type), id, payload });
    const reset = (n: number) => ({ kind: 'reopened-by-flow', decisionTicketId: '01J9GTKB000000000000000000', outcome: 'No', pass: n, decidedBy: 'u', decisionEventId: `dec-${n}` });
    const withheld = { kind: 'reopened-by-flow', outcome: 'No', pass: 2, decisionEventId: 'dec-2' }; // what the route leaves a viewer who cannot see the Decision

    it('29.372 counts a reset once, however its pair is split, and nothing else', () => {
      const events = [
        e('a', 'ticket.created', { typeId: 'task' }),
        e('b', 'ticket.transitioned', { to: 'done' }),
        e('c', 'ticket.reopened', { cause: reset(1) }),
        e('d', 'ticket.transitioned', { to: 'backlog', cause: reset(1) }),
        e('f', 'ticket.reopened', {}), // a person's reopen
        e('g', 'ticket.transitioned', { to: 'todo', cause: { kind: 'led-to', sourceTicketId: 'x', triggeredBy: 'u' } }),
        e('h', 'ticket.closed', { cause: { ...reset(1), kind: 'branch-not-taken' } }),
        e('i', 'ticket.reopened', { cause: withheld }),
        e('j', 'ticket.transitioned', { to: 'backlog', cause: withheld }),
      ];
      expect(Object.fromEntries(historyRounds(events))).toEqual({ a: 1, b: 1, c: 2, d: 2, f: 2, g: 2, h: 2, i: 3, j: 3 });
      expect(historyRounds([])).toEqual(new Map());
    });
  });
  ```
  Append to `history-list.test.tsx`:
  ```tsx
  it('29.372 HistoryList puts "(pass n)" on a reset ticket from round 2, and leaves round 1 and the raw fallback bare', () => {
    const at = (id: string, type: string, payload: unknown, seq: number): TicketHistoryEvent => ({ ...SKEWED, id, type, payload, seq });
    const cause = { kind: 'reopened-by-flow', outcome: 'No', pass: 1, decisionEventId: 'dec-1' };
    render(<HistoryList events={[
      at('e1', 'ticket.created', { typeId: 'task' }, 1),
      at('e2', 'ticket.reopened', { cause }, 2),
      at('e3', 'ticket.transitioned', { to: 'backlog', cause }, 3),
      at('e4', 'ticket.never_seen', {}, 4),
    ]} nameOf={() => 'Anselma Marak'} typeName={() => 'Task'} stateName={() => 'Backlog'} />);
    expect(screen.getByText('Created as Task')).toBeInTheDocument();
    expect(screen.getByText('Reopened by the flow, because an earlier decision chose No (pass 2)')).toBeInTheDocument();
    expect(screen.getByText('Moved to Backlog by the flow, because an earlier decision chose No (pass 2)')).toBeInTheDocument();
    expect(screen.getByText('ticket.never_seen')).toBeInTheDocument();
  });
  ```
  Run (`slot-run.sh` = `/Users/kiro/my_projects/gisik-nokma-lanes/slot-run.sh`; build domain first, `pnpm --filter @gisik-nokma/domain build`): `/Users/kiro/my_projects/gisik-nokma-lanes/slot-run.sh wtg2-t17-ac -- pnpm --filter @gisik-nokma/app-core exec vitest run test/views/history-copy.test.ts test/views/history-list.test.tsx --maxWorkers=2 > /tmp/wtg2-t17-ac.log 2>&1; tail -30 /tmp/wtg2-t17-ac.log`. Expected: FAIL (`historyRounds` is not exported; sentences read `Closed`). Commit: `wtg2 T17: RED History sentences and rounds`.

- [ ] **Step 3: History copy, rounds and the list (29.371, 29.372)**

  `view-types.ts` `TicketHistoryEvent`, after `linkTarget?`:
  ```ts
    /**
     * Flow-caused events only (wtg2 T17's History route): the key of the ticket the cause names (the finished source, or
     * the Decision), `null` when the server withheld a ticket this viewer cannot see, absent for an event with no flow
     * cause, an older server, or the offline replica (all three read as "cannot name it").
     */
    causeTicket?: { key: string | null } | null;
  ```
  `history-copy.ts`: add `round?: number` to `HistoryCopyContext` (docblock: "the event's round from `historyRounds`; a suffix from 2"). Rename the existing `export function describeEvent` to `function sentenceOf` (keep its docblock and body), and after the function add:
  ```ts
  /** `sentenceOf` plus the round suffix (PS-10). The raw-type fallback never takes one: `HistoryList` decides on `headline === event.type` whether to show the slug. */
  export function describeEvent(event: TicketHistoryEvent, ctx: HistoryCopyContext = {}): string {
    const text = sentenceOf(event, ctx);
    return text !== event.type && ctx.round !== undefined && ctx.round >= 2 ? `${text} (pass ${ctx.round})` : text;
  }

  type CauseView =
    | { kind: 'led-to'; label: string | null }
    | { kind: 'reopened-by-flow' | 'branch-not-taken'; outcome: string; decisionEventId: string | null };

  /** A flow cause off an opaque payload, read defensively: the route may have withheld its ids, so it is never parsed whole. */
  function causeOf(payload: Record<string, unknown>): CauseView | null {
    const raw = asRecord(payload['cause']);
    const kind = str(raw, 'kind');
    if (kind === 'led-to') return { kind, label: str(raw, 'label') };
    if (kind === 'reopened-by-flow' || kind === 'branch-not-taken') {
      const outcome = str(raw, 'outcome');
      return outcome === null ? null : { kind, outcome, decisionEventId: str(raw, 'decisionEventId') };
    }
    return null;
  }

  function because(cause: CauseView, event: TicketHistoryEvent): string {
    const key = event.causeTicket?.key ?? null; // absent and null both mean "cannot name it"
    if (cause.kind === 'led-to') {
      const label = cause.label === null ? '' : ` (${cause.label})`;
      return key === null ? `because an earlier step was finished${label}` : `because ${key} was closed${label}`;
    }
    return key === null ? `because an earlier decision chose ${cause.outcome}` : `because ${key} was decided ${cause.outcome}`;
  }

  /** Round of each event (PS-10): 1 plus the resets so far; the reopen and the transition of one reset share a `decisionEventId` and count once. */
  export function historyRounds(events: readonly TicketHistoryEvent[]): Map<string, number> {
    const rounds = new Map<string, number>();
    const resets = new Set<string>();
    let round = 1;
    for (const event of events) {
      if (event.type === 'ticket.transitioned' || event.type === 'ticket.reopened') {
        const cause = causeOf(asRecord(event.payload));
        if (cause !== null && cause.kind === 'reopened-by-flow') {
          const reset = cause.decisionEventId ?? event.id;
          if (!resets.has(reset)) { resets.add(reset); round += 1; }
        }
      }
      rounds.set(event.id, round);
    }
    return rounds;
  }
  ```
  Inside `sentenceOf`, replace the `ticket.transitioned` arm (`:142-145`) and split `ticket.closed` / `ticket.reopened` out of the grouped flag arms (`:180-183`), and add the decision arm beside them:
  ```ts
      case 'ticket.transitioned': {
        const to = str(payload, 'to');
        if (to === null) return event.type;
        const cause = causeOf(payload);
        if (cause === null) return `Moved to ${stateName(to)}`;
        const how = cause.kind === 'led-to' ? 'automatically' : cause.kind === 'reopened-by-flow' ? 'by the flow' : 'as not taken';
        return `Moved to ${stateName(to)} ${how}, ${because(cause, event)}`;
      }
      case 'ticket.closed': {
        const cause = causeOf(payload);
        return cause?.kind === 'branch-not-taken' ? `Closed as not taken, ${because(cause, event)}` : 'Closed';
      }
      case 'ticket.reopened': {
        const cause = causeOf(payload);
        return cause?.kind === 'reopened-by-flow' ? `Reopened by the flow, ${because(cause, event)}` : 'Reopened';
      }
      case 'ticket.decided': {
        // T5's 3.183 fixture forced a minimal arm; this replaces it (wording: PS-6).
        const outcome = payload['outcome'];
        const from = str(payload, 'from');
        if (outcome === null) return from === null ? 'Cleared the decision' : `Cleared the decision (was ${from})`;
        if (typeof outcome !== 'string' || outcome === '') return event.type;
        return from === null ? `Decided: ${outcome}` : `Decision revised: ${from} → ${outcome}`;
      }
  ```
  `history-list.tsx`: import `historyRounds`; before the `return`, `const rounds = historyRounds(events);`; the headline line becomes `const headline = describeEvent(event, { ...ctx, round: rounds.get(event.id) });`. Run Step 2's command. Expected: PASS. Flip 29.371, 29.372 ✅. Commit: `wtg2 T17: History sentences for the flow and the decision, pass labels`.

- [ ] **Step 4: The route annotation (29.373), RED then green**

  `apps/server/test/routes/ticket-history-causes.test.ts` (sibling: typed-links T4's 27.053 file for the events, `board.test.ts:96-104` for the world; `applyCommitted` writes the projection without the engine, so the fixture files the cause shapes directly):
  ```ts
  import { afterAll, beforeAll, describe, expect, it } from 'vitest';
  import { newUlid } from '@gisik-nokma/domain';
  import { keysForAncestors } from '../../src/read/ancestry.js';
  import { applyCommitted, makeCommitted } from '../helpers/apply.js';
  import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
  import { buildReadTestApp, type ReadRole, type ReadWorld } from '../helpers/read-app.js';

  let db: TestDatabase;
  let read: ReadWorld;
  beforeAll(async () => { db = await createTestDatabase(); read = await buildReadTestApp(db); }, 120_000);
  afterAll(async () => { await read.app.close(); await db.drop(); });

  type Served = { id: string; payload: { cause?: Record<string, unknown> }; causeTicket?: { key: string | null } | null };

  describe('29.373 History annotates a flow cause per viewer', () => {
    it('29.373 a visible ticket is keyed with the cause whole; a hidden one is null and loses its ids and people', async () => {
      const { workspaceId: WS, taskInEpicId: S, sharedTaskId: SH, hiddenTaskId: H } = read.world;
      const TRIG = newUlid(); const DECIDER = newUlid(); const DEC_EVENT = newUlid();
      const file = (type: string, payload: unknown) => makeCommitted({ workspaceId: WS, actorId: read.world.owner, entity: { kind: 'ticket', id: S }, type, payload });
      const ledVisible = file('ticket.transitioned', { to: 'doing', cause: { kind: 'led-to', sourceTicketId: SH, triggeredBy: TRIG } });
      const ledHidden = file('ticket.transitioned', { to: 'todo', cause: { kind: 'led-to', sourceTicketId: H, label: 'Yes', triggeredBy: TRIG } });
      const reopenHidden = file('ticket.reopened', { cause: { kind: 'reopened-by-flow', decisionTicketId: H, outcome: 'No', pass: 1, decidedBy: DECIDER, decisionEventId: DEC_EVENT } });
      const closedVisible = file('ticket.closed', { cause: { kind: 'branch-not-taken', decisionTicketId: SH, outcome: 'Yes', pass: 1, decidedBy: DECIDER, decisionEventId: DEC_EVENT } });
      const plain = file('ticket.transitioned', { to: 'doing' });
      await applyCommitted(db.pool, [ledVisible, ledHidden, reopenHidden, closedVisible, plain]);

      const history = async (role: ReadRole): Promise<{ body: string; byId: Map<string, Served> }> => {
        const response = await read.app.inject({ method: 'GET', url: `/v1/tickets/${S}/history`, headers: read.authOf(role) });
        expect(response.statusCode).toBe(200);
        return { body: response.body, byId: new Map((response.json() as { events: Served[] }).events.map((x) => [x.id, x])) };
      };
      const keys = await keysForAncestors(db.pool, WS, [{ ticketId: SH, projectId: read.world.projectId }, { ticketId: H, projectId: read.world.projectId }]);
      expect(keys.get(SH)).toMatch(/-\d+$/);

      const member = await history('member');
      expect(member.byId.get(ledVisible.id)?.causeTicket).toEqual({ key: keys.get(SH) });
      expect(member.byId.get(ledVisible.id)?.payload.cause).toEqual({ kind: 'led-to', sourceTicketId: SH, triggeredBy: TRIG });
      expect(member.byId.get(closedVisible.id)?.causeTicket).toEqual({ key: keys.get(SH) });
      expect(member.byId.get(ledHidden.id)?.causeTicket).toBeNull();
      expect(member.byId.get(ledHidden.id)?.payload.cause).toEqual({ kind: 'led-to', label: 'Yes' });
      expect(member.byId.get(reopenHidden.id)?.causeTicket).toBeNull();
      expect(member.byId.get(reopenHidden.id)?.payload.cause).toEqual({ kind: 'reopened-by-flow', outcome: 'No', pass: 1, decisionEventId: DEC_EVENT });
      for (const secret of [H, DECIDER]) expect(member.body, `member body leaks ${secret}`).not.toContain(secret);
      // control: an event with no flow cause carries no annotation and an untouched payload
      expect(member.byId.get(plain.id)).not.toHaveProperty('causeTicket');
      expect(member.byId.get(plain.id)?.payload).toEqual({ to: 'doing' });
      // control: the owner sees the hidden ticket, so nothing is withheld from them
      const owner = await history('owner');
      expect(owner.byId.get(ledHidden.id)?.causeTicket).toEqual({ key: keys.get(H) });
      expect(owner.byId.get(reopenHidden.id)?.payload.cause).toMatchObject({ decisionTicketId: H, decidedBy: DECIDER });
    });
  });
  ```
  Add to `packages/app-core/test/online/mappers.test.ts` (beside the `mapHistory` case `:619`):
  ```ts
  it('29.373 mapHistory carries causeTicket as {key}, null and absent', () => {
    const wire = (id: string, extra: Record<string, unknown>) => ({ id, type: 'ticket.closed', version: 1, payload: {}, actorId: ANSELMA, origin: 'web', clientTime: 'c', serverTime: 's', seq: 1, ...extra });
    const [keyed, withheld, bare] = mapHistory({ ticketId: 't', events: [wire('e1', { causeTicket: { key: 'GN-1' } }), wire('e2', { causeTicket: null }), wire('e3', {})] });
    expect(keyed?.causeTicket).toEqual({ key: 'GN-1' });
    expect(withheld?.causeTicket).toBeNull();
    expect(bare).not.toHaveProperty('causeTicket');
  });
  ```
  Run: `slot-run.sh wtg2-t17-route -- pnpm --filter @gisik-nokma/server exec vitest run test/routes/ticket-history-causes.test.ts test/routes/ticket-history.test.ts --maxWorkers=2 > /tmp/wtg2-t17-route.log 2>&1; tail -30 /tmp/wtg2-t17-route.log`. Also `slot-run.sh wtg2-t17-map -- pnpm --filter @gisik-nokma/app-core exec vitest run test/online/mappers.test.ts --maxWorkers=2 > /tmp/wtg2-t17-map.log 2>&1; tail -30 /tmp/wtg2-t17-map.log`. Expected: FAIL (no `causeTicket`). Commit: `wtg2 T17: RED History cause annotation`.

  Implementation. `apps/server/src/read/history-causes.ts` (the lookup repeats typed-links T4's link-target block on purpose: `routes/ticket-history.ts:213-224` records why two routes do not share a helper that makes them agree by construction):
  ```ts
  import { isFlowCause, type FlowCause } from '@gisik-nokma/domain';
  import type { Queryable } from '../db/queryable.js';
  import type { TicketHistoryEvent } from '../routes/ticket-history.js';
  import { canSee } from '../visibility/can-see.js';
  import { keysForAncestors } from './ancestry.js';

  /** The flow cause on a ticket event, or null (also for the older `reopened-for-child` cause, which is not the flow's). */
  export function causeOf(payload: unknown): FlowCause | null {
    const cause = typeof payload === 'object' && payload !== null ? (payload as { cause?: unknown }).cause : undefined;
    return isFlowCause(cause) ? cause : null;
  }

  export function causeTicketId(cause: FlowCause): string {
    return cause.kind === 'led-to' ? cause.sourceTicketId : cause.decisionTicketId;
  }

  /** What a viewer who cannot see the cause's ticket keeps: the kind, the outcome words and the opaque event id (History pairs a reset by it); no ticket id, no `triggeredBy`, no `decidedBy`. */
  export function withholdCauseTicket(cause: FlowCause): Record<string, unknown> {
    if (cause.kind === 'led-to') return { kind: 'led-to', ...(cause.label === undefined ? {} : { label: cause.label }) };
    return { kind: cause.kind, outcome: cause.outcome, pass: cause.pass, decisionEventId: cause.decisionEventId };
  }

  export async function annotateFlowCauses(db: Queryable, viewerId: string, events: TicketHistoryEvent[]): Promise<void> {
    const caused = events.flatMap((event) => { const cause = causeOf(event.payload); return cause === null ? [] : [{ event, cause }]; });
    if (caused.length === 0) return;
    const { rows } = await db.query<{ ticket_id: string; workspace_id: string; project_id: string }>(
      'SELECT ticket_id, workspace_id, project_id FROM proj_tickets WHERE ticket_id = ANY($1::text[])',
      [[...new Set(caused.map((c) => causeTicketId(c.cause)))]],
    );
    const visible = new Map<string, string | null>();
    for (const row of rows) {
      if (!(await canSee(db, viewerId, row.ticket_id))) continue;
      const keys = await keysForAncestors(db, row.workspace_id, [{ ticketId: row.ticket_id, projectId: row.project_id }]);
      visible.set(row.ticket_id, keys.get(row.ticket_id) ?? null);
    }
    for (const { event, cause } of caused) {
      const id = causeTicketId(cause);
      if (visible.has(id)) { event.causeTicket = { key: visible.get(id) ?? null }; continue; }
      event.causeTicket = null; // unknown and invisible are one answer, as in `canSee`
      event.payload = { ...(event.payload as object), cause: withholdCauseTicket(cause) };
    }
  }
  ```
  `routes/ticket-history.ts`: add the same optional `causeTicket?: { key: string | null } | null` member to `TicketHistoryEvent` (docblock: "flow-caused events only; the second derived field this route serves, with `linkTarget`"); import `annotateFlowCauses`; in the handler, after typed-links T4's link block and before the return: `const events = ...` (reuse T4's `events` variable) then `await annotateFlowCauses(deps.pool, request.currentUserId, events);`. The history page is at most `MAX_LIMIT` (1000) events, so the per-ticket lookups are bounded. `mappers.ts` `mapHistory` (copy typed-links T4's `linkTarget` lines): `...(event['causeTicket'] === undefined ? {} : { causeTicket: event['causeTicket'] === null ? null : mapCauseTicket(event['causeTicket'], `${path}.causeTicket`) })`, with `function mapCauseTicket(raw: unknown, path: string): { key: string | null } { const record = asRecord(raw, path); return { key: record['key'] === null ? null : asString(record['key'], `${path}.key`) }; }` above it.
  Run both Step 4 commands (server route files and the mapper file). Expected: PASS. Flip 29.373 ✅. Commit: `wtg2 T17: History names a flow cause's ticket only to viewers who can see it`.

- [ ] **Step 5: RED readers (29.374)**

  `apps/server/test/visibility/rollup.test.ts` (new describe; same `seedMember`/`seedTicket`/`setVisibilityEnv` idiom as the 25.19x block at `:322-366`):
  ```ts
  describe('29.374 rollupFor: Not taken is closed, never done', () => {
    it('29.374 a not-taken terminal child is in notTaken and not in terminal; every control child still counts as before', async () => {
      const ws = newUlid(); const prj = newUlid(); const parent = newUlid(); const viewer = newUlid();
      const [done, skipped, junk, stray] = [newUlid(), newUlid(), newUlid(), newUlid()];
      await seedMember(db.pool, ws, viewer, 'member', [{ projectId: prj }]);
      await seedTicket(db.pool, { workspaceId: ws, projectId: prj, ticketId: parent });
      for (const id of [done, skipped, junk]) await seedTicket(db.pool, { workspaceId: ws, projectId: prj, ticketId: id, parentId: parent, stateCategory: 'terminal' });
      await seedTicket(db.pool, { workspaceId: ws, projectId: prj, ticketId: stray, parentId: parent });
      await applyAll(db.pool, [done, skipped, junk, stray].map((id) => setVisibilityEnv(ws, id, 'workspace')));
      const notTaken = { kind: 'branch-not-taken', decisionTicketId: newUlid(), outcome: 'Yes', pass: 1, decidedBy: newUlid(), decisionEventId: newUlid() };
      const cause = (id: string, value: unknown) => db.pool.query('UPDATE proj_tickets SET closed_cause = $2::jsonb WHERE ticket_id = $1', [id, JSON.stringify(value)]);
      await cause(skipped, notTaken);
      await cause(junk, { kind: 'something-else' }); // a terminal child with an unrelated cause is done
      await cause(stray, notTaken);                  // an OPEN child carrying the cause is neither done nor not taken
      expect(await rollupFor(db.pool, viewer, parent)).toEqual({ total: 4, terminal: 2, notTaken: 1, uncategorized: 0, restrictedCount: 0 });
      // control: the same child with its cause cleared is done, and the key disappears
      await cause(skipped, null);
      const cleared = await rollupFor(db.pool, viewer, parent);
      expect(cleared).toEqual({ total: 4, terminal: 3, uncategorized: 0, restrictedCount: 0 });
      expect(cleared).not.toHaveProperty('notTaken');
    });
  });
  ```
  (`JSON.stringify(null)` is the string `'null'`, which `$2::jsonb` stores as JSON null, not SQL NULL; `notTakenOf` reads both as none.) `apps/server/test/read/ticket-cards.test.ts` (uses its `created`, `world`, `fetchTicketRows`, `assembleTicketCards`):
  ```ts
  describe('29.374 the card carries notTaken and the parent counts it apart from done', () => {
    it('29.374 a not-taken child has notTaken and is not terminalChildren; its finished sibling has neither', async () => {
      const [parent, finished, skipped] = [newUlid(), newUlid(), newUlid()];
      await applyCommitted(db.pool, [created({ id: parent, actorId: world.owner }), created({ id: finished, actorId: world.owner, parentId: parent }), created({ id: skipped, actorId: world.owner, parentId: parent })]);
      await db.pool.query(`UPDATE proj_tickets SET state_category = 'terminal' WHERE ticket_id = ANY($1::text[])`, [[finished, skipped]]);
      const cause = { kind: 'branch-not-taken', decisionTicketId: newUlid(), outcome: 'Yes', pass: 1, decidedBy: world.owner, decisionEventId: newUlid() };
      await db.pool.query('UPDATE proj_tickets SET closed_at = now(), closed_by = $2, closed_cause = $3::jsonb WHERE ticket_id = $1', [skipped, world.owner, JSON.stringify(cause)]);
      const cards = await assembleTicketCards(db.pool, world.owner, await fetchTicketRows(db.pool, [parent, finished, skipped]));
      const byId = new Map(cards.map((c) => [c.ticketId, c]));
      expect(byId.get(skipped)?.notTaken).toBe(true);
      expect(byId.get(finished)).not.toHaveProperty('notTaken');
      expect(byId.get(parent)?.rollup).toEqual({ totalChildren: 2, terminalChildren: 1, notTakenChildren: 1, uncategorizedChildren: 0, restrictedCount: 0 });
    });
  });
  ```
  App-core, appended to the named files (`listRowSeed` from `../helpers/seed.js`; `serverListCard`, `mapListPage`, `mapRollup` are already imported in `mappers.test.ts`; `countRows` and `fixture`/`envelope`/`TYPE_TASK`/`PROJECT` already exist in the two others):
  ```ts
  // rollup-text.test.ts
  it('29.374 names the not-taken children between done and restricted, and says nothing when there are none', () => {
    expect(formatRollup({ totalChildren: 8, terminalChildren: 4, notTakenChildren: 1, restrictedCount: 2 })).toBe('4 of 8 done, 1 not taken, 2 restricted');
    expect(formatRollup({ totalChildren: 8, terminalChildren: 5, restrictedCount: 0 })).toBe('5 of 8 done');
  });
  // list-model.test.ts
  it('29.374 countRows: a not-taken terminal row is closed, never done', () => {
    const marked = [listRowSeed({ stateCategory: 'terminal' }), listRowSeed({ stateCategory: 'terminal', notTaken: true }), listRowSeed({ stateCategory: 'active' })];
    expect(countRows(marked)).toEqual({ total: 3, terminal: 1 });
    const unmarked = [listRowSeed({ stateCategory: 'terminal' }), listRowSeed({ stateCategory: 'terminal' }), listRowSeed({ stateCategory: 'active' })];
    expect(countRows(unmarked)).toEqual({ total: 3, terminal: 2 }); // control: the same rows without the mark are done
  });
  // mappers.test.ts
  it('29.374 mapListPage carries the card notTaken mark and mapRollup carries notTakenChildren; absent stays absent', () => {
    const page = (card: ReturnType<typeof serverListCard>): ListResponse => ({ workspaceId: '01J9GWS0000000000000000000', projectId: 'p', groupBy: 'flat', groups: [{ key: 'all', label: 'All', cards: [card] }], nextCursor: null });
    expect(mapListPage(page(serverListCard({ ticketId: 't1', notTaken: true }))).rows[0]?.notTaken).toBe(true);
    expect(mapListPage(page(serverListCard({ ticketId: 't2' }))).rows[0]).not.toHaveProperty('notTaken');
    expect(mapRollup({ totalChildren: 8, terminalChildren: 4, notTakenChildren: 1, uncategorizedChildren: 0, restrictedCount: 0 })).toEqual({ totalChildren: 8, terminalChildren: 4, notTakenChildren: 1, restrictedCount: 0 });
    expect(mapRollup({ totalChildren: 8, terminalChildren: 5, uncategorizedChildren: 0, restrictedCount: 0 })).not.toHaveProperty('notTakenChildren');
  });
  // replica-data-source.test.ts, new describe at the end of the file
  describe('29.374 the replica list row carries notTaken from the folded close cause', () => {
    it('29.374 a not-taken ticket is marked and not counted done; a finished one is neither', async () => {
      const { ds, replica } = await fixture();
      const [skipped, finished] = [newUlid(), newUlid()];
      for (const [id, title] of [[skipped, 'Skipped branch'], [finished, 'Finished work']] as const) {
        await replica.applyServerItem(envelope({ kind: 'ticket', id }, 'ticket.created', { typeId: TYPE_TASK, projectId: PROJECT, parentId: null, title }));
      }
      const cause = { kind: 'branch-not-taken', decisionTicketId: newUlid(), outcome: 'Yes', pass: 1, decidedBy: USER_B, decisionEventId: newUlid() };
      await replica.applyServerItem(envelope({ kind: 'ticket', id: skipped }, 'ticket.transitioned', { to: 'done', cause }));
      await replica.applyServerItem(envelope({ kind: 'ticket', id: skipped }, 'ticket.closed', { cause }));
      await replica.applyServerItem(envelope({ kind: 'ticket', id: finished }, 'ticket.transitioned', { to: 'done' }));
      const rows = (await ds.query.getTickets(PROJECT, {}, 'flat')).rows.filter((r) => [skipped, finished].includes(r.ticketId));
      expect(rows.find((r) => r.ticketId === skipped)?.notTaken).toBe(true);
      expect(rows.find((r) => r.ticketId === finished)).not.toHaveProperty('notTaken');
      expect(countRows(rows)).toEqual({ total: 2, terminal: 1 });
    });
  });
  ```
  (`replica-data-source.test.ts` gains `import { countRows } from '../../src/views/list-model.js';`.) Runs: `slot-run.sh wtg2-t17-q1s -- pnpm --filter @gisik-nokma/server exec vitest run test/visibility/rollup.test.ts test/read/ticket-cards.test.ts --maxWorkers=2 > /tmp/wtg2-t17-q1s.log 2>&1; tail -30 /tmp/wtg2-t17-q1s.log` and `slot-run.sh wtg2-t17-q1a -- pnpm --filter @gisik-nokma/app-core exec vitest run test/views/rollup-text.test.ts test/views/list-model.test.ts test/online/mappers.test.ts test/replica/replica-data-source.test.ts --maxWorkers=2 > /tmp/wtg2-t17-q1a.log 2>&1; tail -30 /tmp/wtg2-t17-q1a.log`. Expected: FAIL (no `notTaken`; `terminal` counts the skipped child; type errors on `notTaken`). Commit: `wtg2 T17: RED Not-taken is closed, never done`.

- [ ] **Step 6: The readers (29.374)**

  Domain `read-models.ts`: `TicketCard` gains, after `closed` (`:222`): `/** wtg2 T17 (Q1): this ticket was closed "Not taken" by the flow. ABSENT otherwise; never names the Decision (a card is served to viewers who may not see it). */ notTaken?: true;` and `TicketRollup` gains `notTakenChildren?: number;` (docblock: "terminal children closed Not taken, counted APART from `terminalChildren`, which is done only; ABSENT when 0; `terminalChildren + notTakenChildren + uncategorizedChildren <= totalChildren`"); fix the inequality in the existing `uncategorizedChildren` paragraph (`:79-80`) the same way.
  `visibility/rollup.ts`: import `notTakenOf` from `@gisik-nokma/domain`; `RollupView` gains `notTaken?: number` (docblock: "terminal AND not-taken, counted apart: closed, never done; absent when 0"); `ChildRow` gains `closed_cause: unknown;`; the SELECT list becomes `... v.resolved_user_ids,\n            t.state_category, t.closed_cause`; `Tally` and its initialiser gain `notTaken: 0`; the category branch becomes
  ```ts
    } else if (child.state_category === 'terminal') {
      // Q1: a not-taken child sits in the terminal state, so the category alone cannot tell it from a finished one.
      if (notTakenOf(child.closed_cause) !== null) tally.notTaken += 1;
      else tally.terminal += 1;
    }
  ```
  and `out.set` gains `...(tally.notTaken > 0 ? { notTaken: tally.notTaken } : {}),` after `terminal`.
  `read/ticket-cards.ts`: import `notTakenOf`; `ProjTicketRow` gains `closed_cause: unknown;` (docblock: "`TicketCard.notTaken`'s source and `rollupsFor`'s, read by every card route"); `PROJ_TICKET_COLUMNS` ends `'t.assignee_id, t.collaborator_ids, t.fields, t.closed_at, t.closed_by, t.rank, t.closed_cause'` and its docblock gains the reader per its own last paragraph; the `rollup` literal gains `...(rollupView.notTaken === undefined ? {} : { notTakenChildren: rollupView.notTaken }),` after `terminalChildren`; `cards.push` gains, after `rank: row.rank,`: `...(notTakenOf(row.closed_cause) === null ? {} : { notTaken: true as const }),`. `routes/tickets.ts:511` gets the identical `notTakenChildren` spread (25.190 holds the two translations equal). `projections/rollups.ts:108`: above `terminalChildren: number;` add `/** Counts a Not-taken child as terminal (the structural fact). NOT a done count: no card route reads this table; `rollupsFor` is the reader that excludes it (wtg2 T17). */`.
  App-core `view-types.ts`: `RollupToViewer` gains `notTakenChildren?: number;` (docblock as above); `ListRow` gains, after `rank`: `/** wtg2 T17 (Q1): closed "Not taken" by the flow; ABSENT otherwise. Optional (unlike `closed`) so no legacy literal changes; `countRows` is its reader. */ notTaken?: true;`. `mappers.ts`: `mapRollup` returns `...(record['notTakenChildren'] === undefined ? {} : { notTakenChildren: asNumber(record['notTakenChildren'], `${path}.notTakenChildren`) })` after `terminalChildren`; `mapListRow` gets `...(record['notTaken'] === true ? { notTaken: true as const } : {}),` after `rank`. `list-model.ts:42`: `terminal: rows.filter((row) => row.stateCategory === 'terminal' && row.notTaken !== true).length,` (add a sentence to the docblock: a not-taken row is closed, never done). `rollup-text.ts`:
  ```ts
  export function formatRollup(rollup: RollupToViewer): string {
    const parts = [`${rollup.terminalChildren} of ${rollup.totalChildren} done`];
    if ((rollup.notTakenChildren ?? 0) > 0) parts.push(`${rollup.notTakenChildren} not taken`);
    if (rollup.restrictedCount > 0) parts.push(`${rollup.restrictedCount} restricted`);
    return parts.join(', ');
  }
  ```
  `replica-data-source.ts` (`rowOf` literal, after `closed: state.closed ?? null,`): `...(resolutionOf(state) === null ? {} : { notTaken: true as const }),` with `resolutionOf` added to the existing `@gisik-nokma/domain` import (`:13-21`).
  Run the two Step 5 commands (build domain first). Expected: PASS. Then: `slot-run.sh wtg2-t17-census -- pnpm --filter @gisik-nokma/server exec vitest run test/census/terminal-category-readers.test.ts > /tmp/wtg2-t17-census.log 2>&1; tail -30 /tmp/wtg2-t17-census.log`. Expected: PASS (no new file reads the terminal category; if it lists one, classify it per T1's three definitions). Flip 29.374 ✅. Commit: `wtg2 T17: Not taken is closed, never done in every done-meaning reader`.

- [ ] **Step 7: Wide runs, sweeps, push**

  1. `pnpm --filter @gisik-nokma/domain build && pnpm --filter @gisik-nokma/app-core build`, then the whole server and app-core suites (`slot-run.sh wtg2-t17-wide-s -- pnpm --filter @gisik-nokma/server exec vitest run --maxWorkers=2 > /tmp/wtg2-t17-wide-s.log 2>&1; tail -30 /tmp/wtg2-t17-wide-s.log`, the same for app-core, label `wtg2-t17-wide-a`): `25.190` (card rollup equals the single-read rollup), `3.183` (count unchanged by this task) and the dual-client rig must stay green. Say in the PR body that the runs are LOCAL.
  2. `pnpm --filter @gisik-nokma/mobile exec node scripts/generate-editor-html.mjs --check` (no domain registry change here; expect clean).
  3. `node scripts/check-case-ids.mjs && pnpm check:citations && pnpm check:tasks`; flip the four cases ✅ in the SAME commits as their tests (Steps 3, 4, 6); re-read the Features bullets against the code.
  4. Push. DONE + REVIEW (NEEDS: T5, T8, T9 and typed-links T4 merged; Review Focus candidates: a History page for a viewer who cannot see a flow cause's ticket leaks nothing (29.373); a parent with a skipped branch never reads "all done" (29.374)).

**Mutations** (run each on the green branch, expect the named red, restore):

| Case | Mutation | Expected red |
|---|---|---|
| 29.371 | `because` ignores `key === null` | the withheld and absent-`causeTicket` assertions |
| 29.371 | `ticket.closed` arm ignores the cause kind | the wrong-kind control (`Closed`) |
| 29.372 | drop the `resets` set (count every flow event) | `i`/`j` read 4 and 5 |
| 29.372 | count `led-to` and `branch-not-taken` too | `g`/`h` read 3 |
| 29.372 | add the suffix to the raw-type fallback | `ticket.never_seen` assertion |
| 29.373 | do not call `annotateFlowCauses` | every route assertion |
| 29.373 | annotate but keep the payload whole | `not.toContain(H)` / the exact `cause` equality |
| 29.373 | `canSee` replaced by `true` | `ledHidden.causeTicket` is `{key}` |
| 29.374 | tally `terminal` without `notTakenOf` | the rollup `terminal: 2` |
| 29.374 | `notTakenOf` accepts any cause with a `kind` | the `junk` control |
| 29.374 | drop `t.closed_cause` from `PROJ_TICKET_COLUMNS` | the card case (`notTaken` missing, `terminalChildren` 2) |
| 29.374 | `countRows` ignores `notTaken` | `terminal: 2` on the marked rows |
| 29.374 | the replica row omits `notTaken` | the replica case |

---

### Task 18: Notifications `flow-ready` and `flow-reopened` (cases 29.390-29.399)

**Branch:** `task/wtg2-notifications` from `origin/release/workflow-graph`; PR `--base release/workflow-graph`. **Needs:** T8 (`flowCauseSchema`, `SYSTEM_ACTOR_FLOW`), T13 (the `led-to` promotion this announces; `flow-world.ts`), T14 (the daemon fan-out, for the daemon-path case 29.392(c)). The cascade that produces `reopened-by-flow` (T16) is NOT needed: the tests file the transition directly.

**Files:**
- Create: `apps/server/migrations/1792100300000_notification-kinds-flow.sql`; `apps/server/test/notifications/flow-fanout.test.ts`
- Modify: `packages/domain/src/notifications.ts:31-37` (kinds), `:151-165` (schema map and union); `apps/server/src/notifications/fanout.ts` (imports `:1-15`; two handlers beside `handleAssigned`; the arm in `onCommitted` after the `ticket.assigned` branch, `~:345-350`); `packages/app-core/src/inbox/format.ts` (the two `never` switches: headline `:73-111`, body `:~126-145`); `packages/app-core/src/inbox/icons.tsx:30` (`PATHS`); `packages/app-core/src/account/notifications-section.tsx:4-10` (`LABELS`); `packages/mcp-server/src/tools/discovery-tools.ts:66` (the `list_notifications` description); `apps/server/test/census/ticket-vocabulary-census.test.ts` (a second `describe`, 29.399)
- Update the count pins (Step 6): `packages/domain/test/notifications.test.ts:31-33`; `packages/app-core/test/inbox/format.test.ts:29-34,50-59`; `packages/app-core/test/inbox/icons.test.tsx:16,28,39-51`; `packages/app-core/test/account/notifications-section.test.tsx:17-30`; `packages/app-core/test/inbox/fixtures.ts` (`PAYLOADS`); `apps/server/test/notifications/store.test.ts` and `apps/server/test/notification-preferences/store.test.ts` (their CHECK cases); the mobile editor bundle
- Catalogue: `test-cases/29-workflow-timeline-graphs.md` under `<!-- wtg-part2-model T18 -->`; `Features.md` §26 under `<!-- wtg-part2-model T18 bullet -->`

**Interfaces:**
- **Consumes:** `flowCauseSchema` / `FlowCause` (T8: `led-to {sourceTicketId, label?, triggeredBy}`, `reopened-by-flow {decisionTicketId, outcome, pass, decidedBy, decisionEventId}`); `BACKLOG_STATE_ID`; `getTicketStateFromDb` (`projections/tickets.ts:245`); `canSeeTicket: CanSeeFn` already in the fan-out deps; `titleOf` (fan-out local, `:~107`); `registerDaemonListeners` (T14); `runFlowSweep` (T14). Drafts T1/T3 `TicketState.draft` (ABSENT on every non-draft, `2026-10-03-drafts.md:40`; rebuilt from `proj_tickets.draft_author_id` by `rowToTicketState`, Drafts T3 `:1535`).
- **Produces:** `NOTIFICATION_KINDS` with `'flow-ready'` and `'flow-reopened'` appended; `flowReadyNotificationPayloadSchema`, `flowReopenedNotificationPayloadSchema` and their types; the migration; two rendered kinds.

**Why this is a payload with titles, not keys (NT-2 meets the code).** The spec's sentences name keys ("Ready to start: PRJ-12 was closed"), but no inbox path resolves a key: every existing payload carries `ticketTitle` and nothing else (`notifications.ts:62-72`), and `format.ts` has no ticket lookup. A key resolver is a read path of its own, so the rows render titles (`becauseTitle`, `decisionTitle`), the same way an assignment does. FINDING for the owner: if keys are wanted in the inbox it is a separate change that touches every kind.

**Why visibility is decided once, at delivery, and stored as null (NT-1).** The spec says "stored but redacted on read". `notifications/store.ts:12-16` and `fanout.ts:23` rule the opposite: the decision is made ONCE at delivery and a row is never redacted on read (a letter delivered is the recipient's). The two are reconciled the only way both hold: when the recipient cannot see the SOURCE ticket (`flow-ready`) or the DECISION (`flow-reopened`), the fan-out writes `null` into those members at delivery. Hence the nullable members in the schemas below, and a hidden step reads "a step you can't see" in the inbox.

**Why the flow arms test for a draft (owner ruling O2, 2026-10-04: "there should not be any notification till the ticket is published").** No notification of any kind is produced by or about a draft. `canSeeTicket` alone does not give that: a draft IS visible to its author, so the author's own draft, moved by the flow, would tell them, and a published ticket moved because of a draft source or a draft Decision would name a step that is not yet a ticket. Both arms therefore return before the recipient is chosen when the moved ticket, the `led-to` source or the `reopened-by-flow` Decision has `draft` in its state (a discarded draft keeps `draft` with `discarded: true`, so it is covered). By construction the promoter and the settler never move a draft or act for one (T12's system read never reads a draft and drops its links, 29.188), so the guard is the second line, pinned by 29.396's draft clause. Assignment and mention on a draft are the Drafts plan's (28.094: drafting events notify nobody; the notices are sent at publish).

**Why `flow-reopened` is keyed on the transition and skips the Decision itself (NT-4).** A cascade files a `ticket.transitioned` (with `cause: reopened-by-flow`) and a paired `ticket.reopened` for the same ticket. Keying on the transition gives one row per moved ticket; the paired event is a no-op arm. When the moved ticket IS the cause's Decision (its own reset, PS-2) nobody is told: the person chose, and the Decision's assignee is told by the choice, not by the reset.

- [ ] **Step 1: Case lines**

  Under `<!-- wtg-part2-model T18 -->`, all ❌:
  - `- ❌ **29.390 — both payload schemas are strict, accept a visible and a hidden shape, refuse an empty ticketId and an unknown key, and parseNotification routes each kind;** control: the five older kinds still parse. Mutation: drop .strict() from flow-ready → the unknown key is accepted.`
  - `- ❌ **29.391 — the migration lets the database store both new kinds in notifications and in muted_kinds, still refuses an unknown kind in both, and its Down removes the new-kind rows and mutes before restoring the five-kind checks;** control: a sixth unknown kind is refused. Mutation: leave the old CHECK in place → inserting flow-ready fails.`
  - `- ❌ **29.392 — a led-to transition notifies the target's assignee once ("flow-ready", key flow-ready:<transition id>), a redelivery is one row, and the same promotion filed by the backup daemon's sweep notifies through the daemon's fan-out;** control: the dedupe key is the transition's id, not the source's. Mutation: key on the source ticket id → two promotions from one source collapse into one row.`
  - `- ❌ **29.393 — flow-ready addresses nobody for an unassigned target, for the person who triggered it, or for an assignee who cannot see the target, and an assignee who cannot see the SOURCE gets the row with becauseTicketId, becauseTitle and label null;** control: a visible source carries all three. Mutation: skip the source visibility test → the hidden title is stored.`
  - `- ❌ **29.394 — each ticket moved by reopened-by-flow notifies its own assignee once ("flow-reopened", key flow-reopened:<transition id>) with decision title, outcome, pass and toBacklog taken from the cause and the destination;** control: two moved tickets give two rows to two assignees, one each. Mutation: key on the Decision event → the second moved ticket of one assignee is swallowed by the dedupe key.`
  - `- ❌ **29.395 — flow-reopened skips the Decision's own reset (NT-4), the person who made the choice, an unassigned ticket and an assignee who cannot see the ticket, and a recipient who cannot see the Decision gets decisionTicketId, decisionTitle and outcome null;** control: a visible Decision names itself. Mutation: drop the own-reset skip → the chooser's own reset notifies.`
  - `- ❌ **29.396 — the events that make no notification: a branch-not-taken transition, a branch-not-taken close, ticket.decided, the paired ticket.reopened, and a plain person transition; and nothing is produced by or about a DRAFT (owner ruling O2, 2026-10-04): a led-to or reopened-by-flow move whose moved ticket, source or Decision is a draft notifies nobody, its own author included, and the flow's notices start only after publish;** control: the same ticket's led-to transition does notify, and the same draft flow, once every member is published, gives one flow-ready and one flow-reopened row (same `it()`). Mutation: add an arm for ticket.reopened → the pair double-notifies; drop the moved-ticket draft guard → the draft-only flow notifies its author; drop the source/Decision draft guard → a published ticket moved by a draft step notifies.`
  - `- ❌ **29.397 — the preferences list shows a switch per kind (seven), muting a new kind hides its rows from the inbox list and the unread count, and a person with no preferences row receives both;** control: muting mention leaves a flow-ready row visible. Mutation: drop the kind from LABELS' source list → the switch count is five.`
  - `- ❌ **29.398 — the inbox renders every new row: the headline for visible, hidden, chose and toBacklog shapes, the body (the moved ticket's title), the open target (the moved ticket), and two icons distinct from each other and from the five older ones;** control: the five older headlines are unchanged. Mutation: reuse the assignment glyph for flow-ready → the distinct-icons case fails.`
  - `- ❌ **29.399 — the notification-kind census: every kind in NOTIFICATION_KINDS has a payload schema, is accepted by both database CHECKs, has a headline, body, icon and label, and a planted eighth kind is reported by each check;** control: the planted kind is reported. Mutation: remove the kind from one CHECK → the census names it.`

  Commit: `wtg2 T18: case lines 29.390-29.399`.

- [ ] **Step 2: RED, the schemas and the migration (29.390, 29.391)**

  Add to `packages/domain/test/notifications.test.ts` (imports as the file's existing ones plus the two schemas):
  ```ts
  const flowReady = { ticketId: 't1', ticketTitle: 'Write the copy', becauseTicketId: 't0', becauseTitle: 'Draft the brief', label: null, eventId: 'e1', clientTime: '2026-10-03T10:00:00.000Z', serverTime: '2026-10-03T10:00:01.000Z' };
  const flowReopened = { ticketId: 't1', ticketTitle: 'Write the copy', decisionTicketId: 'd1', decisionTitle: 'Ship or redo', outcome: 'Redo', pass: 2, toBacklog: false, eventId: 'e1', clientTime: '2026-10-03T10:00:00.000Z', serverTime: '2026-10-03T10:00:01.000Z' };
  describe('29.390 flow notification payloads', () => {
    it('29.390 both are strict, nullable where visibility can hide a member, and routed by kind', () => {
      expect(flowReadyNotificationPayloadSchema.parse(flowReady)).toEqual(flowReady);
      expect(flowReadyNotificationPayloadSchema.parse({ ...flowReady, becauseTicketId: null, becauseTitle: null, label: null })).toBeTruthy();
      expect(flowReopenedNotificationPayloadSchema.parse(flowReopened)).toEqual(flowReopened);
      expect(flowReopenedNotificationPayloadSchema.parse({ ...flowReopened, decisionTicketId: null, decisionTitle: null, outcome: null })).toBeTruthy();
      expect(flowReadyNotificationPayloadSchema.safeParse({ ...flowReady, ticketId: '' }).success).toBe(false);
      expect(flowReadyNotificationPayloadSchema.safeParse({ ...flowReady, urgent: true }).success).toBe(false);
      expect(flowReopenedNotificationPayloadSchema.safeParse({ ...flowReopened, pass: 0 }).success).toBe(false);
      expect(flowReopenedNotificationPayloadSchema.safeParse({ ...flowReopened, urgent: true }).success).toBe(false);
      const row = { id: 'n1', userId: 'u', workspaceId: 'w', dedupeKey: 'k', read: false, createdAt: flowReady.serverTime };
      expect(parseNotification({ ...row, kind: 'flow-ready', payload: flowReady }).kind).toBe('flow-ready');
      expect(parseNotification({ ...row, kind: 'flow-reopened', payload: flowReopened }).kind).toBe('flow-reopened');
      expect(() => parseNotification({ ...row, kind: 'flow-ready', payload: flowReopened })).toThrow(); // the wrong shape for the kind
      expect(parseNotification({ ...row, kind: 'assignment', payload: { ticketId: 't', ticketTitle: 'x', assignedBy: 'u', eventId: 'e', clientTime: 'c', serverTime: 's' } }).kind).toBe('assignment'); // control
    });
  });
  ```
  and change the `has exactly the five kinds` case (`:31-33`) to `has exactly the seven kinds` with the seven names in order (the two new ones last).

  `apps/server/test/notifications/store.test.ts` and `notification-preferences/store.test.ts`: copy the existing CHECK case of each file (grep `notifications_kind_check` / `muted_kinds` in them), and add beside it:
  ```ts
  it('29.391 the database stores both flow kinds and still refuses an unknown one', async () => {
    for (const kind of ['flow-ready', 'flow-reopened']) {
      await expect(db.pool.query(`INSERT INTO notifications (id, user_id, workspace_id, kind, dedupe_key, payload, read, created_at) VALUES ($1, 'u', 'w', $2, $1, '{}'::jsonb, false, now())`, [`n-${kind}`, kind])).resolves.toBeDefined();
      await expect(db.pool.query(`INSERT INTO user_notification_preferences (user_id, muted_kinds, updated_at) VALUES ($1, ARRAY[$2]::text[], now())`, [`u-${kind}`, kind])).resolves.toBeDefined();
    }
    await expect(db.pool.query(`INSERT INTO notifications (id, user_id, workspace_id, kind, dedupe_key, payload, read, created_at) VALUES ('n-x', 'u', 'w', 'flow-bogus', 'n-x', '{}'::jsonb, false, now())`)).rejects.toThrow(/notifications_kind_check/);
    await expect(db.pool.query(`INSERT INTO user_notification_preferences (user_id, muted_kinds, updated_at) VALUES ('u-x', ARRAY['flow-bogus']::text[], now())`)).rejects.toThrow(/user_notification_preferences_muted_kinds_check/);
  });
  ```
  Confirm the column list of `notifications` against `1788437881385_notifications.sql:1-13` and use its `INSERT` helper if the file has one. The Down is exercised by `pnpm --filter @gisik-nokma/server migrate:down` then `migrate:up` on the scratch database in Step 7 (the repo's migration-roundtrip check, if any, covers it; read `package.json` scripts for its name).

  Run: `/Users/kiro/my_projects/gisik-nokma-lanes/slot-run.sh wtg2-t18a -- pnpm --filter @gisik-nokma/domain exec vitest run test/notifications.test.ts > /tmp/wtg2-t18a.log 2>&1; tail -30 /tmp/wtg2-t18a.log`. Expected: FAIL (the schemas do not exist).

- [ ] **Step 3: Schemas and migration**

  `notifications.ts`: append `'flow-ready', 'flow-reopened'` to `NOTIFICATION_KINDS`; after `staleTicketNotificationPayloadSchema`:
  ```ts
  /**
   * A ticket became ready to start because the ticket it waits for was closed (or a Decision chose its branch). `becauseTicketId`,
   * `becauseTitle` and `label` are NULL when the recipient cannot see the source: visibility is decided ONCE, at delivery, and the row is
   * never redacted on read (`store.ts` ruling), so a hidden source is stored as absent.
   */
  export const flowReadyNotificationPayloadSchema = z
    .object({
      ticketId: nonEmpty,
      ticketTitle: z.string(),
      becauseTicketId: nonEmpty.nullable(),
      becauseTitle: z.string().nullable(),
      label: z.string().nullable(),
      eventId: nonEmpty,
      clientTime: nonEmpty,
      serverTime: nonEmpty,
    })
    .strict();
  export type FlowReadyNotificationPayload = z.infer<typeof flowReadyNotificationPayloadSchema>;

  /** A Decision's choice moved this ticket back (to To do, or to Backlog when `toBacklog`). The Decision's members are NULL for a recipient who cannot see it. */
  export const flowReopenedNotificationPayloadSchema = z
    .object({
      ticketId: nonEmpty,
      ticketTitle: z.string(),
      decisionTicketId: nonEmpty.nullable(),
      decisionTitle: z.string().nullable(),
      outcome: z.string().nullable(),
      pass: z.number().int().min(1),
      toBacklog: z.boolean(),
      eventId: nonEmpty,
      clientTime: nonEmpty,
      serverTime: nonEmpty,
    })
    .strict();
  export type FlowReopenedNotificationPayload = z.infer<typeof flowReopenedNotificationPayloadSchema>;
  ```
  add `'flow-ready': flowReadyNotificationPayloadSchema, 'flow-reopened': flowReopenedNotificationPayloadSchema,` to `notificationPayloadSchemaByKind` and the two types to the `NotificationPayload` union. Export from the package index if `notifications.ts` is re-exported by name (it is `export *` today: confirm with `grep -n notifications packages/domain/src/index.ts`).

  `apps/server/migrations/1792100300000_notification-kinds-flow.sql`:
  ```sql
  -- Up Migration

  -- Workflow and timeline graphs (Part 2, NT-3): two new notification kinds. A kind can only be ADDED through a migration, in both
  -- tables that fix the vocabulary at the database boundary. The old migration files are NOT edited: this drops and re-adds the two
  -- explicitly named constraints (`1788437881385_notifications.sql:13`, `1788900000000_user-notification-preferences.sql`).
  ALTER TABLE notifications DROP CONSTRAINT notifications_kind_check;
  ALTER TABLE notifications ADD CONSTRAINT notifications_kind_check
    CHECK (kind IN ('assignment', 'mention', 'contested-claim', 'date-approaching', 'stale-ticket', 'flow-ready', 'flow-reopened'));
  ALTER TABLE user_notification_preferences DROP CONSTRAINT user_notification_preferences_muted_kinds_check;
  ALTER TABLE user_notification_preferences ADD CONSTRAINT user_notification_preferences_muted_kinds_check
    CHECK (muted_kinds <@ ARRAY['assignment', 'mention', 'contested-claim', 'date-approaching', 'stale-ticket', 'flow-ready', 'flow-reopened']::text[]);

  -- Down Migration

  -- DESTRUCTIVE by necessity: a row of a kind the restored CHECK refuses cannot stay. Notifications are server-owned per-user
  -- messages, not ledger events (`notifications.ts`), so deleting the two new kinds loses nothing the ledger holds.
  DELETE FROM notifications WHERE kind IN ('flow-ready', 'flow-reopened');
  UPDATE user_notification_preferences SET muted_kinds = array_remove(array_remove(muted_kinds, 'flow-ready'), 'flow-reopened')
   WHERE muted_kinds && ARRAY['flow-ready', 'flow-reopened']::text[];
  ALTER TABLE notifications DROP CONSTRAINT notifications_kind_check;
  ALTER TABLE notifications ADD CONSTRAINT notifications_kind_check
    CHECK (kind IN ('assignment', 'mention', 'contested-claim', 'date-approaching', 'stale-ticket'));
  ALTER TABLE user_notification_preferences DROP CONSTRAINT user_notification_preferences_muted_kinds_check;
  ALTER TABLE user_notification_preferences ADD CONSTRAINT user_notification_preferences_muted_kinds_check
    CHECK (muted_kinds <@ ARRAY['assignment', 'mention', 'contested-claim', 'date-approaching', 'stale-ticket']::text[]);
  ```
  **Confirm at execution:** the stamp is the next free after the newest migration on the release tip (`ls apps/server/migrations | tail -3`; contract fixes `1792100300000`), and the exact existing `muted_kinds` expression in `1788900000000_user-notification-preferences.sql:50-53`. Build (`pnpm --filter @gisik-nokma/domain build`), then run the Step 2 command and `slot-run.sh wtg2-t18b -- pnpm --filter @gisik-nokma/server exec vitest run test/notifications test/notification-preferences --maxWorkers=2 > /tmp/wtg2-t18b.log 2>&1; tail -30 /tmp/wtg2-t18b.log`. Expected: PASS; flip 29.390-29.391 ✅.

  Commit: `wtg2 T18: the two kinds, their schemas, the migration`.

- [ ] **Step 4: RED, the fan-out (29.392-29.396)**

  `apps/server/test/notifications/flow-fanout.test.ts`. Copy the harness of `fanout.test.ts` (`:1-150`: the imports, `db`, `visible`, `canSeeTicket`, `fanout()`, `recordingTransport`, `rowsFor`) with these differences: **valid ULIDs** (the existing `KIRO = '01J9GUKR…'` contains `U`, which `ULID_REGEX` refuses, and `flowCauseSchema` parses ids): `const PERSON = '01J9GPRS000000000000000000'; const ASSIGNEE = '01J9GASN000000000000000000'; const OTHER = '01J9GOTH000000000000000000'; const SRC = '01J9GSRC000000000000000000'; const T1 = '01J9GTK1000000000000000000'; const T2 = '01J9GTK2000000000000000000'; const DEC = '01J9GDEC000000000000000000';` and a `seedTicket(ticketId, assigneeId, title, typeId = 'task', draftAuthorId: string | null = null)` whose INSERT is the copied one with `$6` for `type_id`, `$7` for `draft_author_id` and `draft_at = CASE WHEN $7 IS NULL THEN NULL ELSE now() END` (the Drafts T2 columns, `2026-10-03-drafts.md:1138-1149`; Drafts T3's `rowToTicketState` turns a non-null author into `TicketState.draft`, `2026-10-03-drafts.md:1532`, and leaves `draft` ABSENT otherwise, `:38`), plus `publishRow(ticketId)`: `UPDATE proj_tickets SET draft_author_id = NULL, draft_at = NULL WHERE ticket_id = $1`, which is what the `ticket.published` projection does to the row (Drafts 28.045). A helper builds the events with the real envelope maker:
  ```ts
  const cause = {
    led: (over = {}) => ({ kind: 'led-to', sourceTicketId: SRC, triggeredBy: PERSON, ...over }),
    reopened: (over = {}) => ({ kind: 'reopened-by-flow', decisionTicketId: DEC, outcome: 'Redo', pass: 2, decidedBy: PERSON, decisionEventId: newUlid(), ...over }),
    notTaken: () => ({ kind: 'branch-not-taken', decisionTicketId: DEC, outcome: 'Ship', pass: 1, decidedBy: PERSON, decisionEventId: newUlid() }),
  };
  const moved = (ticketId: string, to: string, c: unknown, actorId = SYSTEM_ACTOR_FLOW) =>
    makeEnvelope({ type: 'ticket.transitioned', entity: { kind: 'ticket', id: ticketId }, workspaceId: WS, actorId, payload: { to, cause: c } });
  ```
  - **29.392 (a):** `visible.add(`${ASSIGNEE}:${T1}`); visible.add(`${ASSIGNEE}:${SRC}`)`; `seedTicket(T1, ASSIGNEE, 'Write the copy')`, `seedTicket(SRC, null, 'Draft the brief')`; `const env = moved(T1, 'todo', cause.led())`; `await fanout().onCommitted(env)`. `rowsFor(ASSIGNEE)` has one row `{ kind: 'flow-ready', dedupe_key: `flow-ready:${env.id}`, workspace_id: WS, payload: { ticketId: T1, ticketTitle: 'Write the copy', becauseTicketId: SRC, becauseTitle: 'Draft the brief', label: null, eventId: env.id, clientTime: env.clientTime, serverTime: env.serverTime } }`; a labelled cause (`cause.led({ label: 'Yes' })`) stores `label: 'Yes'`. Read back through `listNotifications` (the file's `viaInbox` helper) so the strict read schema is exercised. **(b):** `onCommitted(env)` twice → still one row. Two different promotions from one source (`T1` and `T2`, same assignee) → two rows with different keys. **(c), the daemon path:** with `realIngest` and `seedFlowWorld` from `flow-world.ts` (T13): a target assigned to `ASSIGNEE` whose source was finished by `PERSON` with no listener attached; `registerDaemonListeners(ingest, { pool: db.pool, transports: [createInAppTransport(db.pool)], canSeeTicket: async () => true })`; `await runFlowSweep({ pool: db.pool, ingest })`; `listNotifications(db.pool, ASSIGNEE, {})` has one `flow-ready` row whose `becauseTicketId` is the source.
  - **29.393:** unassigned target → `rowsFor(ASSIGNEE)` empty; `triggeredBy: ASSIGNEE` → empty; assignee without `visible` on the target → empty and **no log line**; assignee who sees the target but not `SRC` → one row with `becauseTicketId: null, becauseTitle: null, label: null` even though the cause carried `label: 'Yes'` (serialise the row and assert it does not contain `'Draft the brief'` or `'Yes'`). Control: with `SRC` visible all three are present.
  - **29.394:** `seedTicket(T1, ASSIGNEE, 'Write the copy')`, `seedTicket(T2, OTHER, 'Review the copy')`, `seedTicket(DEC, null, 'Ship or redo', 'decision')`; `visible` for both assignees on their ticket and on `DEC`. `const a = moved(T1, 'todo', cause.reopened()); const b = moved(T2, 'backlog', cause.reopened({ decisionEventId: a.payload.cause.decisionEventId }))` (the SAME decision event): `onCommitted(a)`, `onCommitted(b)`. `rowsFor(ASSIGNEE)` has one row `payload: { ticketId: T1, ticketTitle: 'Write the copy', decisionTicketId: DEC, decisionTitle: 'Ship or redo', outcome: 'Redo', pass: 2, toBacklog: false, eventId: a.id, ... }`, `dedupe_key` `flow-reopened:${a.id}`; `rowsFor(OTHER)` has one row with `toBacklog: true`. (Different keys although the Decision event is the same; this is the mutation's red.)
  - **29.395:** moving `DEC` itself with `cause.reopened()` (`moved(DEC, 'todo', ...)`, `DEC` assigned to `ASSIGNEE`) → nothing for anyone (NT-4). `decidedBy: ASSIGNEE` on a move of `T1` → empty (the chooser is not told). Unassigned → empty. Assignee without `T1` visibility → empty. Assignee who sees `T1` but not `DEC` → one row with `decisionTicketId: null, decisionTitle: null, outcome: null` and `pass: 2` (serialise: it contains neither `'Ship or redo'` nor `'Redo'`). Control: with `DEC` visible the three are present.
  - **29.396:** with a visible assignee on `T1`, none of these produce a row: `moved(T1, 'done', cause.notTaken())` (a transition carrying `branch-not-taken`); `makeEnvelope({ type: 'ticket.closed', ..., payload: { cause: cause.notTaken() } })`; `ticket.decided` (`payload: { outcome: 'Redo' }`); `ticket.reopened` (`payload: { cause: cause.reopened() }`); a person's plain `ticket.transitioned` (`payload: { to: 'doing' }`) and one carrying the existing `reopened-for-child` cause. Control: `moved(T1, 'todo', cause.led())` gives one row.
  - **29.396, the draft clause (owner ruling O2: "there should not be any notification till the ticket is published"),** one `it('29.396 a draft flow notifies nobody, its author included; once published the same moves notify')`: `visible` gets `ASSIGNEE` on `T1`, `SRC` and `DEC` (so only the new guards can stop a row); `seedTicket(T1, ASSIGNEE, 'Write the copy', 'task', ASSIGNEE)` (the assignee's OWN draft, the one person `canSee` would let through), `seedTicket(SRC, null, 'Draft the brief', 'task', ASSIGNEE)`, `seedTicket(DEC, null, 'Ship or redo', 'decision', ASSIGNEE)`. `onCommitted(moved(T1, 'todo', cause.led()))` and `onCommitted(moved(T1, 'backlog', cause.reopened()))` → `rowsFor(ASSIGNEE)` is `[]`. Then `publishRow(T1)` only, and the same two moves (new envelopes) → still `[]` (the moved ticket is published but its source and Decision are drafts). CONTROL, same `it()`: `publishRow(SRC); publishRow(DEC)` and the same two moves → `rowsFor(ASSIGNEE).map((row) => row.kind).sort()` is `['flow-ready', 'flow-reopened']`.

  Run: `slot-run.sh wtg2-t18c -- pnpm --filter @gisik-nokma/server exec vitest run test/notifications/flow-fanout.test.ts --maxWorkers=2 > /tmp/wtg2-t18c.log 2>&1; tail -40 /tmp/wtg2-t18c.log`. Expected: FAIL (no arm; no rows).

- [ ] **Step 5: The fan-out**

  `fanout.ts`: add `import { BACKLOG_STATE_ID, flowCauseSchema, type FlowCause } from '@gisik-nokma/domain';` to the existing domain import. Beside `handleAssigned`:
  ```ts
  /** A draft (or a discarded one, whose `draft` stays with `discarded: true`) is not a ticket to anyone but its author, and makes no notice (O2). */
  async function isDraft(workspaceId: string, ticketId: string): Promise<boolean> {
    return (await getTicketStateFromDb(deps.pool, workspaceId, ticketId))?.draft !== undefined;
  }

  /** `led-to`: the target is ready (NT-1). The assignee, unless nobody is, or it is the person whose finish triggered this. */
  async function handleFlowReady(env: EventEnvelope, cause: Extract<FlowCause, { kind: 'led-to' }>): Promise<void> {
    const ticket = await getTicketStateFromDb(deps.pool, env.workspaceId, env.entity.id);
    // O2 (owner, 2026-10-04): nothing is produced by or about a draft, not even for its author; the flow's
    // notices start after publish. `draft` is ABSENT on every non-draft (Drafts T1/T3).
    if (ticket?.draft !== undefined || (await isDraft(env.workspaceId, cause.sourceTicketId))) return;
    const assigneeId = ticket?.assigneeId ?? null;
    if (assigneeId === null || assigneeId === cause.triggeredBy) return;
    if (!(await canSeeTicket(deps.pool, assigneeId, env.entity.id))) return;
    // Decided ONCE, here: the source is named only to someone who can see it (store.ts rules out redaction on read).
    const sourceVisible = await canSeeTicket(deps.pool, assigneeId, cause.sourceTicketId);
    await deliverToAll(
      deps.transports,
      compose('flow-ready', assigneeId, env.workspaceId, `flow-ready:${env.id}`, {
        ticketId: env.entity.id,
        ticketTitle: await titleOf(env.workspaceId, env.entity.id),
        becauseTicketId: sourceVisible ? cause.sourceTicketId : null,
        becauseTitle: sourceVisible ? await titleOf(env.workspaceId, cause.sourceTicketId) : null,
        label: sourceVisible ? (cause.label ?? null) : null,
        eventId: env.id,
        clientTime: env.clientTime,
        serverTime: env.serverTime,
      }),
      log,
    );
  }

  /** `reopened-by-flow` on a moved ticket: its assignee learns the flow sent it back. Keyed on THIS transition (one row per moved ticket). */
  async function handleFlowReopened(env: EventEnvelope, cause: Extract<FlowCause, { kind: 'reopened-by-flow' }>, to: unknown): Promise<void> {
    if (cause.decisionTicketId === env.entity.id) return; // NT-4: a Decision's own reset tells nobody
    const ticket = await getTicketStateFromDb(deps.pool, env.workspaceId, env.entity.id);
    if (ticket?.draft !== undefined || (await isDraft(env.workspaceId, cause.decisionTicketId))) return; // O2, as handleFlowReady
    const assigneeId = ticket?.assigneeId ?? null;
    if (assigneeId === null || assigneeId === cause.decidedBy) return;
    if (!(await canSeeTicket(deps.pool, assigneeId, env.entity.id))) return;
    const decisionVisible = await canSeeTicket(deps.pool, assigneeId, cause.decisionTicketId);
    await deliverToAll(
      deps.transports,
      compose('flow-reopened', assigneeId, env.workspaceId, `flow-reopened:${env.id}`, {
        ticketId: env.entity.id,
        ticketTitle: await titleOf(env.workspaceId, env.entity.id),
        decisionTicketId: decisionVisible ? cause.decisionTicketId : null,
        decisionTitle: decisionVisible ? await titleOf(env.workspaceId, cause.decisionTicketId) : null,
        outcome: decisionVisible ? cause.outcome : null,
        pass: cause.pass,
        toBacklog: to === BACKLOG_STATE_ID,
        eventId: env.id,
        clientTime: env.clientTime,
        serverTime: env.serverTime,
      }),
      log,
    );
  }
  ```
  In `onCommitted`, after the `ticket.assigned`/`ticket.created` branch add:
  ```ts
  } else if (env.type === 'ticket.transitioned') {
    const payload = env.payload as { to?: unknown; cause?: unknown };
    const cause = flowCauseSchema.safeParse(payload.cause);
    if (!cause.success) return; // a person's move, or the older reopened-for-child cause: not this task's business
    if (cause.data.kind === 'led-to') await handleFlowReady(env, cause.data);
    else if (cause.data.kind === 'reopened-by-flow') await handleFlowReopened(env, cause.data, payload.to);
    // branch-not-taken: the ticket was closed for an unchosen branch; nobody is told (NT-4)
  } else if (env.type === 'ticket.decided' || env.type === 'ticket.closed' || env.type === 'ticket.reopened') {
    // NT-4, named so a later reader does not add an arm: the choice, the close and the paired reopen make no notification.
  }
  ```
  `FlowCause` and `flowCauseSchema` are T8's exports (`packages/domain/src/flow/causes.ts`); if T8 exports the arm types under another name, change the two `Extract<...>` lines only. Run the Step 4 command. Expected: PASS; flip 29.392-29.396 ✅.

  Commit: `wtg2 T18: flow-ready and flow-reopened fan-out`.

- [ ] **Step 6: The surfaces, the pins, the census (29.397-29.399)**

  **Invoke `frontend-design` for the inbox rows and the preferences rows** (name it in any subagent prompt that does this step). Headlines are the spec's NT-1/NT-2 sentences with titles; no spaced em dash in any literal (the ui-copy scan covers `packages/app-core/src`).

  `format.ts`, two arms before each `default` (add the two payload types to the type import at `:2-10`):
  ```ts
  case 'flow-ready': {
    const payload = notification.payload as FlowReadyNotificationPayload;
    if (payload.becauseTitle === null) return "Ready to start: a step you can't see was closed";
    return payload.label === null ? `Ready to start: ${payload.becauseTitle} was closed` : `Ready to start: ${payload.becauseTitle} chose ${payload.label}`;
  }
  case 'flow-reopened': {
    const payload = notification.payload as FlowReopenedNotificationPayload;
    const lead = payload.toBacklog ? 'Back in Backlog by the flow' : 'Reopened by the flow';
    const what = payload.decisionTitle === null ? "a decision you can't see" : payload.outcome === null ? payload.decisionTitle : `${payload.decisionTitle} chose ${payload.outcome}`;
    return `${lead}: ${what} (pass ${payload.pass})`;
  }
  ```
  and in `notificationBody`: `case 'flow-ready': return (notification.payload as FlowReadyNotificationPayload).ticketTitle; case 'flow-reopened': return (notification.payload as FlowReopenedNotificationPayload).ticketTitle;`. `notificationTicketId` reads `ticketId`, which both payloads carry, so a row opens the moved ticket with no change.

  `icons.tsx` (`PATHS`, stroke-only like its neighbours):
  ```tsx
  /** A play mark in a circle: this is ready to start. */
  'flow-ready': (<><circle cx="12" cy="12" r="10" /><polygon points="10 8 16 12 10 16 10 8" /></>),
  /** A counter-clockwise arrow: the flow sent this back. */
  'flow-reopened': (<><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><polyline points="3 3 3 8 8 8" /></>),
  ```
  `notifications-section.tsx` `LABELS`: `'flow-ready': 'A ticket is ready to start', 'flow-reopened': 'A ticket was reopened by a flow',`.
  `discovery-tools.ts:66`: description becomes `'Your notifications, newest first (mentions, assignments, conflicts, tickets ready to start, tickets reopened by a flow). unreadOnly for just the unread; page with cursor (the answer carries nextCursor); limit 1–100.'` (the en dash is the existing text; grep `packages/mcp-server/test` for the old sentence first and update any exact match).

  Pins (each is a count that goes 5 → 7):
  - `domain/test/notifications.test.ts`: done in Step 2.
  - `app-core/test/inbox/fixtures.ts` `PAYLOADS`: add `'flow-ready': () => ({ ticketId: 't-flow-ready', ticketTitle: 'Write the copy', becauseTicketId: 't-source', becauseTitle: 'Draft the brief', label: null, eventId: 'e1', clientTime: CLIENT_TIME, serverTime: SERVER_TIME })` and `'flow-reopened': () => ({ ticketId: 't-flow-reopened', ticketTitle: 'Review the copy', decisionTicketId: 't-decision', decisionTitle: 'Ship or redo', outcome: 'Redo', pass: 2, toBacklog: false, eventId: 'e1', clientTime: CLIENT_TIME, serverTime: SERVER_TIME })`.
  - `format.test.ts:29-34` the vocabulary list (seven names), `:50-59` the ids list gains `'t-flow-ready'`, `'t-flow-reopened'`; add the 29.398 case:
    ```ts
    it('29.398 the flow rows read as sentences, hidden or not, and the five older headlines are unchanged', () => {
      const ready = (over: Record<string, unknown>) => notificationOf('flow-ready', over);
      expect(notificationHeadline(ready({}), userName)).toBe('Ready to start: Draft the brief was closed');
      expect(notificationHeadline(ready({ label: 'Yes' }), userName)).toBe('Ready to start: Draft the brief chose Yes');
      expect(notificationHeadline(ready({ becauseTicketId: null, becauseTitle: null, label: null }), userName)).toBe("Ready to start: a step you can't see was closed");
      expect(notificationBody(ready({}))).toBe('Write the copy');
      const reopened = (over: Record<string, unknown>) => notificationOf('flow-reopened', over);
      expect(notificationHeadline(reopened({}), userName)).toBe('Reopened by the flow: Ship or redo chose Redo (pass 2)');
      expect(notificationHeadline(reopened({ toBacklog: true }), userName)).toBe('Back in Backlog by the flow: Ship or redo chose Redo (pass 2)');
      expect(notificationHeadline(reopened({ decisionTicketId: null, decisionTitle: null, outcome: null }), userName)).toBe("Reopened by the flow: a decision you can't see (pass 2)");
      expect(notificationTicketId(reopened({}))).toBe('t-flow-reopened');
      expect(notificationHeadline(notificationOf('assignment'), userName)).toBe('Kiro assigned this to you'); // control
    });
    ```
    (`notificationOf(kind, over)`: extend the fixtures builder with an optional payload override spread over `PAYLOADS[kind]()`, still through `parseNotification`.)
  - `icons.test.tsx`: the docblock and titles say seven, `toHaveLength(5)` → `toHaveLength(7)`; the distinctness assertion is already `NOTIFICATION_KINDS.length`.
  - `notifications-section.test.tsx:17-30`: `toHaveLength(7)`, the checked count 7; add 29.397: the two new switches exist by their labels; unchecking `A ticket is ready to start` calls `onChange` with `mutedKinds` containing `'flow-ready'`.
  - `apps/server/test/notifications/store.test.ts` (~`:275-320`, the mute cases): add 29.397's server half: one `flow-ready` and one `mention` row for a user; `listNotifications(pool, u, { mutedKinds: ['flow-ready'] })` returns only the mention; the unread count agrees; `{ mutedKinds: [] }` returns both. A user with no preferences row (`getNotificationPreferences`) has `mutedKinds: []`.
  - `reporting-scope-guard.test.ts:285` derives from `NOTIFICATION_KINDS`; run it, and update only if it fails.

  The census, appended to `apps/server/test/census/ticket-vocabulary-census.test.ts` (same file, a second `describe`; do not write a second census file; add `createTestDatabase` and the domain imports it needs):
  ```ts
  describe('29.399 notification kind census', () => {
    const missing = (kinds: readonly string[], have: ReadonlySet<string>) => kinds.filter((k) => !have.has(k));
    it('29.399 every kind has a payload schema and both CHECKs accept it; a planted kind is reported', async () => {
      const db = await createTestDatabase();
      try {
        const accepted = async (table: 'notifications' | 'prefs', kind: string): Promise<boolean> => {
          try {
            await db.pool.query('BEGIN');
            if (table === 'notifications') await db.pool.query(`INSERT INTO notifications (id, user_id, workspace_id, kind, dedupe_key, payload, read, created_at) VALUES ('c', 'u', 'w', $1, 'c', '{}'::jsonb, false, now())`, [kind]);
            else await db.pool.query(`INSERT INTO user_notification_preferences (user_id, muted_kinds, updated_at) VALUES ('u', ARRAY[$1]::text[], now())`, [kind]);
            return true;
          } catch { return false; } finally { await db.pool.query('ROLLBACK'); }
        };
        const kinds = [...NOTIFICATION_KINDS];
        expect(await accepted('notifications', 'planted-kind')).toBe(false); // control first: the check can fail
        expect(await accepted('prefs', 'planted-kind')).toBe(false);
        expect(missing([...kinds, 'planted-kind'], new Set(Object.keys(notificationPayloadSchemaByKind)))).toEqual(['planted-kind']);
        expect(missing(kinds, new Set(Object.keys(notificationPayloadSchemaByKind)))).toEqual([]);
        for (const kind of kinds) {
          expect(await accepted('notifications', kind), `notifications_kind_check refuses ${kind}`).toBe(true);
          expect(await accepted('prefs', kind), `muted_kinds check refuses ${kind}`).toBe(true);
        }
        expect(kinds).toEqual(expect.arrayContaining(['flow-ready', 'flow-reopened']));
      } finally { await db.drop(); }
    });
  });
  ```
  The headline, body, icon and label sites are compile-enforced (`never` switches and `Record<NotificationKind, ...>`), so the census does not re-test them; the app-core pins above cover their values. Run domain, app-core and server notification suites and the census:
  `slot-run.sh wtg2-t18d -- pnpm --filter @gisik-nokma/app-core exec vitest run test/inbox test/account --maxWorkers=2 > /tmp/wtg2-t18d.log 2>&1; tail -30 /tmp/wtg2-t18d.log` then the server `test/notifications test/notification-preferences test/census test/reporting-scope-guard.test.ts` the same way (`wtg2-t18e`). Expected: PASS; flip 29.397-29.399 ✅.

  Commit: `wtg2 T18: inbox rows, preferences rows, count pins, census`.

- [ ] **Step 7: Mobile bundle, Features, sweeps, mutations, DONE**
  - **Mobile editor bundle** (contract decision 12): the domain changed, so `pnpm --filter @gisik-nokma/mobile generate:editor-html` (`apps/mobile/package.json`: `node scripts/generate-editor-html.mjs`), commit the regenerated file, then `pnpm --filter @gisik-nokma/mobile test` (its `--check` fails on a stale bundle).
  - **Migration round trip:** on a scratch database `pnpm --filter @gisik-nokma/server migrate:down` once then `migrate:up` (the Down deletes rows of the new kinds; say so in the PR body).
  - **Features** (under `<!-- wtg-part2-model T18 bullet -->`; keep the anchor line, T19 reads the bullets below it): `- ✅ **Flow notifications** (wtg2 T18; `apps/server/src/notifications/fanout.ts`, `packages/domain/src/notifications.ts`) — "Ready to start" when an auto-promotion lands on your ticket, "Reopened by the flow" when a Decision's choice sends it back; hidden steps and decisions are named only to those who can see them; both can be muted in Account. Cases 29.390-29.399.` (write the backticks plain)
  - **Sweeps:** server WHOLE; domain, app-core WHOLE (ui-copy and token-discipline scans); `pnpm check:citations`; `node scripts/check-case-ids.mjs`; `pnpm check:env`.
  - **Mutations** (run, then revert; each must turn the named case red):

  | Case | Mutation | Expected red |
  |---|---|---|
  | 29.390 | drop `.strict()` from the flow-ready schema | the unknown key parses |
  | 29.391 | leave `notifications_kind_check` unchanged in the Up | the INSERT of `flow-ready` fails |
  | 29.392 | key on `cause.sourceTicketId` | (b) one row for two promotions |
  | 29.393 | store `cause.label` unconditionally | the hidden row contains `'Yes'` |
  | 29.394 | key on `cause.decisionEventId` | `rowsFor(OTHER)` is empty |
  | 29.395 | drop the `decisionTicketId === env.entity.id` return | the Decision's own reset notifies |
  | 29.396 | add `ticket.reopened` to the arm | the paired reopen double-notifies |
  | 29.396 | drop `ticket?.draft !== undefined` in both handlers | the draft-only flow notifies its author |
  | 29.396 | drop the `isDraft(source / decision)` half | a published ticket moved by a draft step notifies |
  | 29.398 | reuse the `assignment` paths for `flow-ready` | the distinct-interiors case fails |
  | 29.399 | drop `'flow-reopened'` from the Up's `muted_kinds` CHECK | the census names it |

  Push. DONE + REVIEW (NEEDS: T8, T13, T14 merged).

---

### Task 19: The Part 2 vocabulary census (cross-check) and the closing sweep (cases 29.145-29.146)

**Branch:** `task/wtg2-census` from `origin/release/workflow-graph`; PR `--base release/workflow-graph`. **Needs:** every other task of this plan merged (T1-T18). This task adds NO production code: it is the cross-check spec §8.4 asks for ("the plan's last Part-2 task greps the registry against each"), a catalogue guard, and the sweep that must pass before the release PR. Each earlier task already updated the rows for its own additions (contract, "Census timing"); this test fails if any of them regressed or if one was never added.

**Files:**
- Create: `apps/server/test/census/wtg-part2-census.test.ts` (header and fixtures copy `apps/server/test/census/ticket-vocabulary-census.test.ts:1-30` for the registry imports; `createTestDatabase` as `apps/server/test/helpers/db.ts:31`; `REPO_ROOT` and the file-reading style as `apps/server/test/ci/ci-trigger.test.ts:13`); `apps/server/test/tooling/wtg-part2-catalogue.test.ts` (same `REPO_ROOT` pattern as `tooling/check-runbook-commands.test.ts:19`).
- Modify: `Features.md` (`<!-- wtg-part2-model T19 bullet -->`); `test-cases/29-workflow-timeline-graphs.md` (below `<!-- wtg-part2-model T19 -->`).

**Interfaces:**
- Consumes (names pinned by the contract, all from `@gisik-nokma/domain` unless stated): `ticketDecidedPayload`, `flowCauseSchema`, `SYSTEM_ACTOR_FLOW`, `TicketState.outcome / passes / periods / rounds`, `TicketState.closed.cause`, `NOTIFICATION_KINDS`, `notificationPayloadSchemaByKind`, `TICKET_EVENT_TYPES`; `@gisik-nokma/rule-engine` `buildMemoryContext`, `evaluateEvent`; server `payloadIds` (`purge/check-purged.ts`), `BOOTSTRAP_BACKFILL_TYPES` (`sync/sync-routes.ts`); the rule ids `decision.not-a-decision`, `decision.outcome-required`, `cause.forged`. Re-check `packages/domain/src/index.ts` that T5 and T8 export `ticketDecidedPayload` and `flowCauseSchema` from the barrel (the app-core and server import the package root, never a deep path).
- Produces: nothing for later tasks.

**Why a data table with a machine runner, and why some rows are text probes.** The server package depends on `domain`, `rule-engine` and `mcp-server`, and has `app-core` and `sync-client` only as devDependencies (`apps/server/package.json:34-36,49-50`); `describeEvent` and `redactedPayload` are not exported from those packages' roots, so a server test cannot call them. Their behaviour is pinned where it can be: app-core's registry-iterating 3.183 (`history-copy.test.ts`) and mcp-server's 27.006 (`redacted-payload.test.ts`) are re-run in Step 3. The table asserts, for those rows, that the SOURCE still names the new vocabulary, and every text probe is guarded by a planted control in the same `it()` so a probe that matches everything is caught (the `ci-trigger.test.ts:32-38` pattern). Behaviour is asserted wherever an import allows it: the registry, the reducer, the engine, `payloadIds`, the notification schemas, and the CHECK constraints through a real database (never by grepping migrations).

- [ ] **Step 1: Case lines**

  Under `<!-- wtg-part2-model T19 -->`, all ❌:
  - `- ❌ **29.145 — THE PART 2 CENSUS: one table lists every row of spec §8.4 (15) and NT-3 (8, plus the `stale-ticket` grep) and each still holds: `ticket.decided` is registered and in `TICKET_EVENT_TYPES` and NOT in `BOOTSTRAP_BACKFILL_TYPES`; the reducer folds links with labels, `outcome`, `passes`, `periods`, `rounds` and the close cause; the engine refuses `decision.not-a-decision`, `decision.outcome-required` and `cause.forged`; `payloadIds` names the tickets in causes and `closeStarted`; both notification kinds are in the schema map and accepted by both CHECK constraints; the new `proj_tickets` columns exist; every source file listing `stale-ticket` also lists the new kinds;** control: a planted row that cannot pass is reported by name, and the table's ids equal the spec's list so a row cannot be deleted silently. Mutation: remove `'ticket.decided'` from `TICKET_EVENT_TYPES` → row 8.4-02 and 8.4-03 are named.`
  - `- ❌ **29.146 — THE CATALOGUE GUARD: no Part 2 case id (29.120-29.229, 29.350-29.374, 29.390-29.399) is still ❌, every task T1-T19 has a `Features.md` §26 bullet under its anchor, no §26 bullet is marked `?`, and every file path named in a Part 2 bullet exists;** control: the same functions report a planted ❌ line, a planted `?` bullet and a planted missing path. Mutation: delete one T-bullet → that task is named.`

- [ ] **Step 2: The census test (RED first)**

  Write `wtg-part2-census.test.ts` with the rows below. On the merged release branch it is expected GREEN at once, so it is not evidence yet: prove each row can fail with the mutations of Step 4 before flipping 29.145.

  ```ts
  import { execFileSync } from 'node:child_process';
  import { readFileSync } from 'node:fs';
  import { dirname, join } from 'node:path';
  import { fileURLToPath } from 'node:url';
  import { afterAll, beforeAll, describe, expect, it } from 'vitest';
  import {
    applyTicketEvent, domainRegistry, flowCauseSchema, makeEnvelope, newUlid, NOTIFICATION_KINDS,
    notificationPayloadSchemaByKind, SYSTEM_ACTOR_FLOW, TICKET_EVENT_TYPES, ticketDecidedPayload,
    type EventEnvelope, type PublishedWorkflowDef, type TicketStateDeps, type TicketTypeDef,
  } from '@gisik-nokma/domain';
  import { buildMemoryContext, evaluateEvent } from '@gisik-nokma/rule-engine';
  import { payloadIds } from '../../src/purge/check-purged.js';
  import { BOOTSTRAP_BACKFILL_TYPES } from '../../src/sync/sync-routes.js';
  import { createTestDatabase, type TestDatabase } from '../helpers/db.js';

  const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../../..');
  const text = (path: string) => readFileSync(join(ROOT, path), 'utf8');
  /** Throws unless the file names every token. */
  function mentions(path: string, ...tokens: string[]): void {
    const missing = tokens.filter((t) => !text(path).includes(t));
    if (missing.length > 0) throw new Error(`${path} does not mention ${missing.join(', ')}`);
  }
  /** Tracked files under `paths` containing `needle`; `git grep` exits 1 on no match. */
  function filesWith(needle: string, ...paths: string[]): string[] {
    try { return execFileSync('git', ['grep', '-l', '-F', needle, '--', ...paths], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean); }
    catch { return []; }
  }

  type Row = { id: string; place: string; check: () => void | Promise<void> };
  async function failures(rows: readonly Row[]): Promise<string[]> {
    const out: string[] = [];
    for (const r of rows) {
      try { await r.check(); } catch (e) { out.push(`${r.id} (${r.place}): ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`); }
    }
    return out;
  }

  // ---- fixtures: one workflow, a Task and a Decision ----
  const WS = '01J9GWS0000000000000000000';
  const PROJECT = '01J9GPRJ000000000000000000';
  const WF: PublishedWorkflowDef = {
    id: 'wf-basic', version: 1, name: 'Basic', initialStateId: 'todo',
    states: [{ id: 'todo', name: 'To do', category: 'open' }, { id: 'doing', name: 'Doing', category: 'active' }, { id: 'done', name: 'Done', category: 'terminal' }],
    transitions: [{ from: '*', to: 'todo', rules: [] }, { from: '*', to: 'doing', rules: [] }, { from: '*', to: 'done', rules: [] }],
  };
  const TYPES: Record<string, TicketTypeDef> = {
    task: { id: 'task', name: 'Task', icon: 'check', rank: 3, workflowId: 'wf-basic', fields: [] },
    decision: { id: 'decision', name: 'Decision', icon: 'diamond', rank: 3, workflowId: 'wf-basic', fields: [] },
  };
  const deps: TicketStateDeps = { getTicketType: (id) => TYPES[id], getWorkflow: (id) => (id === 'wf-basic' ? WF : undefined) };
  const USER = newUlid();
  const [DEC, TASK, TGT] = [newUlid(), newUlid(), newUlid()];
  const ev = (type: string, entity: string, payload: object, actorId = USER): EventEnvelope =>
    makeEnvelope({ type, workspaceId: WS, actorId, entity: { kind: 'ticket', id: entity }, payload });
  const born = (id: string, typeId: string) => ev('ticket.created', id, { typeId, projectId: PROJECT, parentId: null, title: `t ${typeId}` });
  const cause = (kind: 'reopened-by-flow' | 'branch-not-taken') => ({ kind, decisionTicketId: DEC, outcome: 'Yes', pass: 1, decidedBy: USER, decisionEventId: newUlid() });
  const world = (...more: EventEnvelope[]) => buildMemoryContext([WF], [
    ...Object.values(TYPES).map((def) => makeEnvelope({ type: 'ticket-type.defined', workspaceId: WS, entity: { kind: 'ticket-type', id: def.id }, payload: def })),
    born(DEC, 'decision'), born(TASK, 'task'), born(TGT, 'task'),
    ev('ticket.link_added', DEC, { kind: 'leads_to', targetId: TGT, label: 'Yes' }), ...more]);
  const ruleOf = async (env: EventEnvelope, ctx: ReturnType<typeof world>) => { const v = await evaluateEvent(env, ctx); return v.refused ? v.rule : null; };

  let db: TestDatabase;
  beforeAll(async () => { db = await createTestDatabase(); });
  afterAll(async () => { await db.drop(); });
  const columns = async (table: string) => (await db.pool.query('SELECT column_name FROM information_schema.columns WHERE table_name = $1', [table])).rows.map((r) => r.column_name as string);
  const insertNotification = (kind: string) => db.pool.query(
    "INSERT INTO notifications (id, user_id, workspace_id, kind, dedupe_key, payload) VALUES ($1, $2, $3, $4, $5, '{}')", [newUlid(), USER, WS, kind, `k:${newUlid()}`]);
  const insertPrefs = (kinds: string[]) => db.pool.query('INSERT INTO user_notification_preferences (user_id, muted_kinds, updated_at) VALUES ($1, $2::text[], now())', [newUlid(), kinds]);
  ```

  The rows (spec §8.4 order, then NT-3 order; contract decisions 1-3 supersede the spec's stored `startedAt` / `endedAt` / `resolution` members, which are derived helpers, and move `ticket.decided` out of the backfill list):

  ```ts
  const ROWS: Row[] = [
    { id: '8.4-01', place: 'vocabulary.ts', check: () => {
      expect(domainRegistry.get('ticket.decided', 1)?.entityKind).toBe('ticket');
      expect(ticketDecidedPayload.safeParse({ outcome: 'Yes' }).success).toBe(true);
      expect(ticketDecidedPayload.safeParse({ outcome: 'Yes', extra: 1 }).success).toBe(false); // strict (DC-4)
      for (const k of ['reopened-by-flow', 'branch-not-taken'] as const) expect(flowCauseSchema.safeParse(cause(k)).success).toBe(true);
    } },
    { id: '8.4-02', place: 'ticket-state.ts fold', check: () => {
      expect((TICKET_EVENT_TYPES as readonly string[]).includes('ticket.decided')).toBe(true);
      let s = applyTicketEvent(undefined, born(DEC, 'decision'), deps);
      s = applyTicketEvent(s, ev('ticket.link_added', DEC, { kind: 'leads_to', targetId: TGT, label: 'Yes' }), deps);
      s = applyTicketEvent(s, ev('ticket.transitioned', DEC, { to: 'doing' }), deps);
      s = applyTicketEvent(s, ev('ticket.decided', DEC, { outcome: 'Yes' }), deps);
      expect(s.links?.[0]?.label).toBe('Yes');
      expect(s.outcome).toBe('Yes');
      expect(s.passes).toHaveLength(1);
      expect(s.periods).toHaveLength(1);
      s = applyTicketEvent(s, ev('ticket.transitioned', DEC, { to: 'todo', cause: cause('reopened-by-flow') }, SYSTEM_ACTOR_FLOW), deps);
      expect(s.rounds).toBe(2);
      const parked = applyTicketEvent(applyTicketEvent(undefined, born(TASK, 'task'), deps), ev('ticket.closed', TASK, { cause: cause('branch-not-taken') }, SYSTEM_ACTOR_FLOW), deps);
      expect(parked.closed?.cause?.kind).toBe('branch-not-taken');
    } },
    { id: '8.4-03', place: 'sync-routes.ts BOOTSTRAP_BACKFILL_TYPES', check: () => {
      // Contract decision 1: decided FOLDS, so it is in exactly one of the two lists, and it is the fold list.
      expect((BOOTSTRAP_BACKFILL_TYPES as readonly string[]).includes('ticket.decided')).toBe(false);
      for (const t of ['ticket.link_added', 'ticket.transitioned', 'ticket.closed', 'ticket.reopened']) {
        expect((TICKET_EVENT_TYPES as readonly string[]).includes(t) !== (BOOTSTRAP_BACKFILL_TYPES as readonly string[]).includes(t)).toBe(true);
      }
    } },
    { id: '8.4-04', place: 'rule-engine evaluate.ts, checks, harness', check: async () => {
      expect(await ruleOf(ev('ticket.decided', TASK, { outcome: 'Yes' }), world())).toBe('decision.not-a-decision');
      expect(await ruleOf(ev('ticket.decided', DEC, { outcome: 'Yes' }), world())).toBeNull();          // control: a Decision with that branch
      expect(await ruleOf(ev('ticket.closed', DEC, {}), world())).toBe('decision.outcome-required');
      expect(await ruleOf(ev('ticket.closed', DEC, {}), world(ev('ticket.decided', DEC, { outcome: 'Yes' })))).not.toBe('decision.outcome-required');
      expect(await ruleOf(ev('ticket.transitioned', DEC, { to: 'todo', cause: cause('reopened-by-flow') }), world())).toBe('cause.forged');
      expect(await ruleOf(ev('ticket.transitioned', DEC, { to: 'todo', cause: cause('reopened-by-flow') }, SYSTEM_ACTOR_FLOW), world())).not.toBe('cause.forged');
      mentions('packages/rule-engine/src/fixtures/harness.ts', 'ticket.decided');
    } },
    { id: '8.4-05', place: 'precheck.ts', check: () => mentions('packages/app-core/src/precheck.ts', 'ticket.decided') },
    { id: '8.4-06', place: 'check-permission.ts', check: () => mentions('apps/server/src/permissions/check-permission.ts', 'ticket.decided') },
    { id: '8.4-07', place: 'history-copy.ts', check: () => mentions('packages/app-core/src/views/history-copy.ts', 'ticket.decided', 'Decision revised', 'reopened-by-flow', 'branch-not-taken', 'led-to') },
    { id: '8.4-08', place: 'redactedPayload (ticket-tools.ts)', check: () => mentions('packages/mcp-server/src/tools/ticket-tools.ts', 'sourceTicketId', 'decisionTicketId', 'closeStarted', 'triggeredBy') },
    { id: '8.4-09', place: 'fanout.ts', check: () => mentions('apps/server/src/notifications/fanout.ts', 'ticket.decided', 'flow-ready', 'flow-reopened') },
    { id: '8.4-10', place: 'flow listeners, sweep, app.ts', check: () => {
      mentions('apps/server/src/flow/promote.ts', 'createFlowPromoter');
      mentions('apps/server/src/flow/settle.ts', 'createFlowSettler');
      mentions('apps/server/src/flow/sweep.ts', 'runFlowSweep');
      mentions('apps/server/src/app.ts', 'createFlowPromoter', 'createFlowSettler');
    } },
    { id: '8.4-11', place: 'gates/', check: () => {
      mentions('apps/server/src/gates/decision-gates.ts', 'decisionCascadeGate', 'decisionCloseStartedGate');
      expect(filesWith('decisionCascadeGate', 'apps/server/src').length).toBeGreaterThanOrEqual(2); // defined AND registered
    } },
    { id: '8.4-12', place: 'projections: new columns', check: async () => {
      expect(await columns('proj_tickets')).toEqual(expect.arrayContaining(['outcome', 'passes', 'periods', 'rounds', 'started_at', 'ended_at', 'closed_cause']));
      expect(await columns('proj_ticket_links')).toContain('label');
      mentions('apps/server/src/projections/tickets.ts', 'closed_cause', 'periods'); // rebuild == live is pinned by T5/T9 (verifyProjections)
    } },
    { id: '8.4-13', place: 'purge/check-purged.ts payloadIds', check: () => {
      const [a, b, c] = [newUlid(), newUlid(), newUlid()];
      const ids = (type: string, payload: object) => payloadIds(type, payload).map(([, id]) => id);
      expect(ids('ticket.transitioned', { to: 'todo', cause: { kind: 'led-to', sourceTicketId: a, triggeredBy: USER } })).toContain(a);
      expect(ids('ticket.transitioned', { to: 'todo', cause: cause('reopened-by-flow') })).toContain(DEC);
      expect(ids('ticket.closed', { cause: cause('branch-not-taken') })).toContain(DEC);
      expect(ids('ticket.decided', { outcome: 'Yes', closeStarted: [b, c] })).toEqual(expect.arrayContaining([b, c]));
      expect(ids('ticket.decided', { outcome: 'Yes' })).not.toContain(b); // control: ids come from the payload
    } },
    { id: '8.4-14', place: 'sync-client replica.ts', check: () => {
      mentions('packages/sync-client/src/replica/replica.ts', 'FOLDING_TICKET_TYPES: readonly string[] = TICKET_EVENT_TYPES');
      expect(text('packages/sync-client/src/replica/replica.ts').includes("'ticket.decided'")).toBe(false); // derived, never a retyped list
    } },
    { id: '8.4-15', place: 'mobile editor-html.generated.ts', check: () => mentions('apps/mobile/src/editor/editor-html.generated.ts', 'ticket.decided', 'leads_to') },
    { id: 'NT3-01', place: 'domain notifications.ts', check: () => {
      for (const k of ['flow-ready', 'flow-reopened'] as const) {
        expect((NOTIFICATION_KINDS as readonly string[]).includes(k)).toBe(true);
        expect(notificationPayloadSchemaByKind[k].safeParse({}).success).toBe(false); // strict schema present, not z.any()
      }
      const base = { ticketId: TASK, ticketTitle: 'Pitch', eventId: newUlid(), clientTime: '2026-10-03T10:00:00.000Z', serverTime: '2026-10-03T10:00:00.000Z' };
      expect(notificationPayloadSchemaByKind['flow-ready'].safeParse({ ...base, becauseTicketId: null, label: null }).success).toBe(true);
      expect(notificationPayloadSchemaByKind['flow-ready'].safeParse({ ...base, becauseTicketId: null, label: null, extra: 1 }).success).toBe(false);
      expect(notificationPayloadSchemaByKind['flow-reopened'].safeParse({ ...base, decisionTicketId: DEC, decisionTitle: 'Go?', outcome: 'Yes', pass: 2, toBacklog: false }).success).toBe(true);
    } },
    { id: 'NT3-02', place: 'notifications_kind_check', check: async () => {
      await insertNotification('flow-ready'); await insertNotification('flow-reopened');
      await expect(insertNotification('not-a-kind')).rejects.toMatchObject({ code: '23514' });  // control: still closed
    } },
    { id: 'NT3-03', place: 'muted_kinds check', check: async () => {
      await insertPrefs(['flow-ready', 'flow-reopened']);
      await expect(insertPrefs(['not-a-kind'])).rejects.toMatchObject({ code: '23514' });
    } },
    { id: 'NT3-04', place: 'inbox format.ts, icons.tsx', check: () => { for (const f of ['format.ts', 'icons.tsx']) mentions(`packages/app-core/src/inbox/${f}`, 'flow-ready', 'flow-reopened'); } },
    { id: 'NT3-05', place: 'notifications-section.tsx', check: () => mentions('packages/app-core/src/account/notifications-section.tsx', 'A ticket is ready to start', 'A ticket was reopened by a flow') },
    { id: 'NT3-06', place: 'fanout.ts arms', check: () => mentions('apps/server/src/notifications/fanout.ts', 'flow-ready', 'flow-reopened') },
    { id: 'NT3-07', place: 'pinned kind lists in tests', check: () => {
      for (const f of ['packages/domain/test/notifications.test.ts', 'packages/domain/test/notification-preferences.test.ts']) mentions(f, 'flow-ready', 'flow-reopened');
    } },
    { id: 'NT3-08', place: 'mobile bundle', check: () => mentions('apps/mobile/src/editor/editor-html.generated.ts', 'flow-ready', 'flow-reopened') },
    { id: 'NT3-grep', place: "every source file listing 'stale-ticket'", check: () => {
      // `sweep.ts` PRODUCES stale-ticket only, so it lists no other kind; every other source file lists the whole set.
      const ALLOWED = ['apps/server/src/notifications/sweep.ts'];
      const lacking = filesWith("'stale-ticket'", 'apps/*/src', 'packages/*/src').filter((f) => !ALLOWED.includes(f))
        .filter((f) => { const t = text(f); return !t.includes('flow-ready') || !t.includes('flow-reopened'); });
      expect(lacking).toEqual([]);
    } },
  ];
  const EXPECTED_IDS = ['8.4-01','8.4-02','8.4-03','8.4-04','8.4-05','8.4-06','8.4-07','8.4-08','8.4-09','8.4-10','8.4-11','8.4-12','8.4-13','8.4-14','8.4-15',
    'NT3-01','NT3-02','NT3-03','NT3-04','NT3-05','NT3-06','NT3-07','NT3-08','NT3-grep'];

  describe('29.145 the Part 2 vocabulary census', () => {
    it('29.145 every §8.4 and NT-3 row holds; a planted row is reported; the table cannot shrink silently', async () => {
      const planted: Row = { id: 'PLANTED', place: 'control', check: () => mentions('apps/server/src/app.ts', 'a_token_that_is_nowhere_in_app_ts') };
      expect((await failures([planted])).map((f) => f.split(' ')[0])).toEqual(['PLANTED']);
      expect(ROWS.map((r) => r.id)).toEqual(EXPECTED_IDS);
      const bad = await failures(ROWS);
      expect(bad, bad.join('\n')).toEqual([]);
    });
  });
  ```
  The `8.4-05` to `8.4-09` token probes name the strings the owning tasks put in those files (T5, T6, T8, T17, T18). If a task met a row through a generic arm and never wrote the token, `mentions` names the file; read the file, find the arm that does the job, and change the token to that arm's name in this commit. Do not delete the row.
  Run: `/Users/kiro/my_projects/gisik-nokma-lanes/slot-run.sh wtg2-t19 -- pnpm --filter @gisik-nokma/server exec vitest run test/census --maxWorkers=2 > /tmp/wtg2-t19.log 2>&1; tail -40 /tmp/wtg2-t19.log`. Expected: PASS (the earlier tasks are merged). Flip 29.145 ✅.
  Commit: `wtg2 T19: the Part 2 vocabulary census`.

- [ ] **Step 3: The catalogue guard (29.146)**

  `wtg-part2-catalogue.test.ts`:
  ```ts
  import { existsSync, readFileSync } from 'node:fs';
  import { dirname, join } from 'node:path';
  import { fileURLToPath } from 'node:url';
  import { expect, it } from 'vitest';

  const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../../..');
  const CASES = 'test-cases/29-workflow-timeline-graphs.md';
  const inPart2 = (n: number) => (n >= 120 && n <= 229) || (n >= 350 && n <= 374) || (n >= 390 && n <= 399);
  /** ❌ case lines whose id is a Part 2 id. */
  export const openPart2Cases = (md: string) =>
    md.split('\n').flatMap((l) => { const m = /^- ❌ \*\*29\.(\d{3})/.exec(l); return m !== null && inPart2(Number(m[1])) ? [`29.${m[1]}`] : []; });
  /** The Features §26 section, from its heading to the next `## `. */
  export function section26(md: string): string { const s = md.indexOf('\n## 26.'); const e = md.indexOf('\n## ', s + 1); return md.slice(s, e === -1 ? undefined : e); }
  /** Bullets under `<!-- wtg-part2-model T<n> bullet -->`, up to the next comment or heading. */
  export function bulletsOf(sec: string, n: number): string[] {
    const at = sec.indexOf(`<!-- wtg-part2-model T${n} bullet -->`);
    if (at === -1) return [];
    const rest = sec.slice(at).split('\n').slice(1);
    const end = rest.findIndex((l) => l.startsWith('<!--') || l.startsWith('#'));
    return (end === -1 ? rest : rest.slice(0, end)).filter((l) => l.startsWith('- '));
  }
  /** Repo paths named in backticks: a slash, a known extension, no glob or brace; a `:line` suffix is stripped. */
  export const pathsIn = (line: string) => [...line.matchAll(/`([\w@./-]+\.(?:ts|tsx|sql|md|css|mjs|json))(?::\d+(?:-\d+)?)?`/g)].map((m) => m[1]!).filter((p) => p.includes('/'));
  ```
  and the `it`:
  ```ts
  it('29.146 no open Part 2 case, a bullet per task, no "?" bullet, no dead path', () => {
    const cases = readFileSync(join(ROOT, CASES), 'utf8');
    const sec = section26(readFileSync(join(ROOT, 'Features.md'), 'utf8'));
    // controls: each function reports a planted fault
    expect(openPart2Cases('- ❌ **29.121 — x**\n- ❌ **29.050 — y**\n- ✅ **29.122 — z**')).toEqual(['29.121']);
    expect(bulletsOf('<!-- wtg-part2-model T4 bullet -->\n- a bullet\n<!-- wtg-part2-model T5 bullet -->', 4)).toHaveLength(1);
    expect(bulletsOf('<!-- wtg-part2-model T4 bullet -->\n<!-- wtg-part2-model T5 bullet -->', 4)).toHaveLength(0);
    expect(pathsIn('see `apps/server/src/nowhere/ghost.ts:12` and `README` and `a/{b,c}.ts`')).toEqual(['apps/server/src/nowhere/ghost.ts']);
    expect(existsSync(join(ROOT, 'apps/server/src/nowhere/ghost.ts'))).toBe(false);

    expect(openPart2Cases(cases)).toEqual([]);
    for (let n = 1; n <= 19; n++) expect(bulletsOf(sec, n).length, `T${n} has no Features §26 bullet`).toBeGreaterThan(0);
    expect(sec.split('\n').filter((l) => /^- \? /.test(l))).toEqual([]);
    const dead = Array.from({ length: 19 }, (_, i) => bulletsOf(sec, i + 1)).flat().flatMap(pathsIn).filter((p) => !existsSync(join(ROOT, p)));
    expect(dead).toEqual([]);
  });
  ```
  The path extractor deliberately skips glob and brace paths such as `flow/{promote,settle,sweep}.ts`, because they are not single files; the 8.4-10 row checks those three files by name. Expected: PASS once every task has flipped its cases and written its bullet; a RED run names the task or case. Flip 29.146 ✅.
  Commit: `wtg2 T19: the catalogue guard`.

- [ ] **Step 4: Mutations (each red, then reverted)**

  | Case | Mutation | Expected red |
  |---|---|---|
  | 29.145 | remove `'ticket.decided'` from `TICKET_EVENT_TYPES` | rows 8.4-02 and 8.4-03 named |
  | 29.145 | add `'ticket.decided'` to `BOOTSTRAP_BACKFILL_TYPES` | row 8.4-03 |
  | 29.145 | drop `'flow-reopened'` from the CHECK migration's list (scratch DB) | rows NT3-02, NT3-03 |
  | 29.145 | delete the `closeStarted` arm of `payloadIds` | row 8.4-13 |
  | 29.145 | delete one row from `ROWS` | the id-list assertion |
  | 29.146 | flip one Part 2 case back to ❌ | the case id is named |
  | 29.146 | delete the T7 Features bullet | `T7 has no Features §26 bullet` |

- [ ] **Step 5: The closing sweep (run on the merged release branch, BEFORE the release PR; say which run you quote)**

  The gate skips the `check:*` scripts (memory: run them before the release PR), so they are run by hand, LOCAL:
  1. **Part 2 bullets against reality.** `git grep -n "wtg-part2-model T" Features.md test-cases/29-workflow-timeline-graphs.md` lists the 19 + 19 anchors. Re-read each §26 Part 2 bullet against the code it cites (the path-existence check only proves the file is there): open the named file, find the symbol, and edit any sentence that no longer describes it (an enhanced feature is edited, a removed one deleted, no tombstones). `git grep -n "^- ? " Features.md` must print nothing in §26.
  2. **Case ids.** `node scripts/check-case-ids.mjs && pnpm check:citations` (every ✅ id is in a test; the baseline file `scripts/fixtures/check-case-citations-baseline.json` has `29-workflow-timeline-graphs.md` at the real count).
  3. **Every repo check:** `pnpm check:env && pnpm check:tasks && pnpm check:db-tz && pnpm check:migrations && pnpm check:runbook && pnpm check:help && pnpm check:ctl`, then `node scripts/check-no-silent-skips.mjs && node scripts/check-skipif-coverage.mjs`. `check:migrations` must show the four Part 2 files (`1792100000000` to `1792100300000`) in order after the Drafts migrations.
  4. **Mobile bundle.** `pnpm --filter @gisik-nokma/editor run build:webview && pnpm --filter @gisik-nokma/mobile run generate:editor-html && pnpm --filter @gisik-nokma/mobile exec node scripts/generate-editor-html.mjs --check`, then `git diff --stat apps/mobile/src/editor/editor-html.generated.ts` must be empty, and `grep -c "ticket.decided" apps/mobile/src/editor/editor-html.generated.ts` at least 1. The `--check` alone warns and exits 0 when the webview bundle is unbuilt, so the build comes first.
  5. **Manual.** `grep -n "Leads to" docs/manual.md` finds T3's paragraph; if any later task changed what a person sees in the Links section, edit it; `pnpm help:generate && pnpm check:help`.
  6. **The registry-iterating censuses owned by other packages**, run by name because the server table cannot call them: `pnpm --filter @gisik-nokma/app-core exec vitest run test/views/history-copy.test.ts`, `pnpm --filter @gisik-nokma/mcp-server exec vitest run test/redacted-payload.test.ts`, `pnpm --filter @gisik-nokma/domain exec vitest run test/notifications.test.ts test/notification-preferences.test.ts`.
  7. **Whole suites** in the order the memory notes require (build first; Node 22; `--maxWorkers=2`; no whole suite while a gate log is under two minutes old): domain, rule-engine, sync-client, app-core, mcp-server, web, then `apps/server` WHOLE.
  8. **Spec drift.** Re-read spec lines 454-476 and 547-560; if either table has gained or lost a row since this plan, update `ROWS` and `EXPECTED_IDS` in the same commit.
  Features: put under `<!-- wtg-part2-model T19 bullet -->` (keep the anchor line, T19 reads the bullets below it) `- ⚙️ **Part 2 vocabulary census and catalogue guard** (`apps/server/test/census/wtg-part2-census.test.ts`, `apps/server/test/tooling/wtg-part2-catalogue.test.ts`) — one table asserts every row of the model's event, projection, notification and bundle census; a guard fails while a Part 2 case is still open or a Part 2 bullet names a dead path. Cases 29.145-29.146.`
  Push. DONE + REVIEW (NEEDS: none). Report the sweep's results as a table of command, LOCAL, and result.

---

## Self-review (writing-plans Self-Review, done 2026-10-03 against the spec)

**1. Spec coverage**

| Spec | Tasks |
|---|---|
| LK-1, LK-2 kind and label | T2 |
| LK-3 rules, LK-4 relabel | T2 (engine), T3 (batch, UI) |
| LK-5 projection, LK-6 census | T2 |
| DC-1, DC-2 seed and rank | T5 (T7 for readers) |
| DC-3 existing workspaces | T1 (pre-flight), T7 |
| DC-4 `ticket.decided` | T5 (fold), T6 (checks) |
| DC-5 close rule and sweep mirror | T6 |
| DC-6 Decide control | Part 3 (not here) |
| ES-1, ES-2, ES-5, ES-1a | T4 |
| ES-3 shadow check | T1 (detector, dev run, owner prod step), T4 |
| ES-4 actual dates | T9 |
| WP-1 | T9 |
| FL-1, FL-2 | T12 |
| FL-3, FL-4 (header counts are Part 3) | T10 |
| PL-1 to PL-6 | T11 |
| AP-1, AP-3, AP-4, AP-5 listener, AP-6 | T13 |
| AP-2 | T8 |
| AP-5 sweep | T14 (promotion), T16 (settle half) |
| AP-7, NT-1 to NT-4 | T18 |
| 8.4 census | T2, T5, T8, T18 each for its own rows; T19 cross-check |
| PS-1 terms | T10 |
| PS-2 reducer | T5 (passes), T8 (loop reset), T9 (rounds) |
| PS-3, PS-9 | T16 |
| PS-4, PS-5, PS-6 plan | T15 (confirmation dialog is Part 3) |
| PS-7 alternates | Part 3 and 5 (reads come from T10) |
| PS-8 Not taken | T8 (cause), T9 (resolution), T17 (readers) |
| PS-10 | T17 |
| PS-11 | T8 |
| Spec test list 9 to 17, 23 to 28 | T2/T5, T6/T8, T9, T10, T11, T13/T14, T12, T19, T5/T9, T15, T8, T16, T18, T17 |
| Q1 to Q5 | T1 (reads), T8, T13; Q5 is Part 1 |

No gaps. DC-6 and PS-7 are display and belong to the later Parts.

**2. Placeholders.** Each "re-read X first" names the file and the line or symbol to look for, and the code is written for the likely answer. Migration stamps are concrete and T1 re-checks them. The Drafts names the plan depends on (D-8 helper, `ingestAtomic`, the `from` member) are called out as Needs items rather than invented.

**3. Type consistency.** These names are used identically across tasks: `FlowEdge`, `edgeKey`, `FlowNode`, `flowNodeOf`, `FlowAnalysis`, `analyzeFlow`, `effectiveEdges`, `liveSet`, `loopBody`, `branchOf`, `sameLabel`, `planFlow`, `PlannedInterval`, `NodePlan`, `FlowPlan`, `promotionsFor`, `Promotion`, `planSettle`, `SettlePlan`, `SettleStep`, `settleEvents`, `SettleContext`, `readFlow`, `walkFlow`, `FlowReadWire`, `createFlowPromoter`, `createFlowSettler`, `runFlowSweep`, `flowCauseSchema`, `FlowCause`, `isFlowCause`, `SYSTEM_ACTOR_FLOW`, `WorkPeriod`, `PassRecord`, `PassRevision`, `NotTakenResolution`, `ticketRound`, `startedAtOf`, `endedAtOf`, `hasStarted`, `resolutionOf`, `normaliseLinkLabel`, `linkLabelSchema`, `DECISION_TYPE_ID`. The wire field of a transition is `to` (`workflow.ts:200-208`), not `toStateId`; T16's `settleEvents` call was aligned with T15's `SettleContext` (adds `workspaceId` and `clientTime`).

**4. Review focus.** Each line has its cases in the owning task, listed in the section above.

## Execution handoff

Execution: the gisik-nokma lanes (one task = one session), per the planner. Each lane dispatches from the ledger, with reviewers and `ctl gate <sha> --base release/workflow-graph`, landing into `release/workflow-graph`.
- **Order:** the waves under Parallelism.
- **Pointers:** T3 and T18 name `frontend-design` and carry `NEEDS: browser` on the primary stack. T1 carries the owner's prod step.
- I recommend **subagent-driven**: nineteen tasks with hard interface hand-offs (T8's causes feed T9, T13, T15, T17, T18; T10's `FlowNode` feeds T11 to T16), a reducer change that rewrites periods retroactively (T9), and a shipped mistake in the cascade moves people's tickets.

## Ledger rows

```
wtg-part2-model	1	todo	-	-	not started (pre-flight: shadow ids, decision type, terminal-initial workflows, reader list (opens Features 26 Part 2 anchors))
wtg-part2-model	2	todo	-	-	not started (leads_to + label events, rules, projection)
wtg-part2-model	3	todo	-	-	not started (Links section Leads to + label (waits for T2))
wtg-part2-model	4	todo	-	-	not started (estimate / reworkEstimate / waitForAll built-ins (waits for T1 recorded run))
wtg-part2-model	5	todo	-	-	not started (Decision type + ticket.decided (waits for T1 recorded run, T2))
wtg-part2-model	6	todo	-	-	not started (Decision rules + sweep mirror (waits for T5))
wtg-part2-model	7	todo	-	-	not started (Decision backfill + seed readers (waits for T6, T8))
wtg-part2-model	8	todo	-	-	not started (flow causes, flow actor, engine exemption)
wtg-part2-model	9	todo	-	-	not started (work periods, rounds, actual dates (waits for T8))
wtg-part2-model	10	todo	-	-	not started (flow analysis + FlowNode (waits for T2, T4, T5, T9))
wtg-part2-model	11	todo	-	-	not started (planner (waits for T10))
wtg-part2-model	12	todo	-	-	not started (flow read (waits for T10, Drafts D-8))
wtg-part2-model	13	todo	-	-	not started (promotion (waits for T8, T10, T12, Drafts D-5))
wtg-part2-model	14	todo	-	-	not started (flow sweep + daemon (waits for T13))
wtg-part2-model	15	todo	-	-	not started (planSettle (waits for T5, T8, T9, T10))
wtg-part2-model	16	todo	-	-	not started (settle listener + gates (waits for T13-T15, Drafts ingestAtomic))
wtg-part2-model	17	todo	-	-	not started (History + Not-taken readers (waits for T5, T8, T9))
wtg-part2-model	18	todo	-	-	not started (notifications (waits for T8, T13))
wtg-part2-model	19	todo	-	-	not started (census cross-check + closing sweep (waits for all))
```
