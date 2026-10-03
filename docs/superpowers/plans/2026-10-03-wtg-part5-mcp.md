# Workflow and Timeline graphs, Part 5: MCP Implementation Plan

> **Release branch (owner, 2026-10-04):** `release/workflow-graph`, cut from `origin/release/knowledge-graph` at f9e0cd18. Every task branch is cut from `origin/release/workflow-graph` and every PR goes `--base release/workflow-graph`. The Knowledge Graph release merges to `main` first; `main` is then merged INTO `release/workflow-graph`, never rebased.

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. In the gisik orchestration, every task is ONE lane session. Follow `gisik-nokma-lanes/STEPS-common-2026-10-03.md`: numbered steps, each ending with a pushed commit + `CHECKPOINT task/<branch> <sha40> step <n>/<N>` + `HANDOFF-<branch>.md`; the sweep list + your own mutation pass before DONE.

**Goal:** an assistant can build, run and read a flow and a timeline through MCP: `link_tickets` takes `leads_to` with a label and relabels it (draft-aware), `set_wait_for_all`, `estimate` / `reworkEstimate` on create and update, `get_flow`, `get_timeline`, `resolve_decision` (records the pass, revises, previews the cascade) and `publish_flow`; `get_ticket` reads passes, rounds, periods and the Not-taken resolution. Every write is visible, attributed and removable (rule D2).

**Architecture:**
- **One module, one seam file.** Five new tools in a new `flow` module (`flow-tools.ts`). Every route, wire shape and field name that Parts 2 to 4 and the Drafts spec own is spelled in ONE file, `flow-seams.ts`, behind zod schemas. A name that differs on the landed code is a one-file fix, and a missing member fails loudly with the owner named.
- **The server decides, the tool relays.** The flow, the timeline and the Decide cascade are computed by Part 2 to 4 server code (`planFlow`, `planSettle`, the visibility predicates). The tools read their routes, sanitise ids the caller cannot have, and add the MCP-only parts: the preview, the confirmation, the pre-checks and the `from` guard.
- **No new atomicity in this plan.** `POST /v1/events` commits each event in its own transaction and goes on after a refusal (`apps/server/src/ingest/ingest-service.ts:432-445`). So the two writes that need all-or-nothing use the doors the Drafts and Part 3 plans add (`drafts/publish`, `decide`); `relabel`, which only has the event door, pre-checks and compensates.

**Tech stack:** TypeScript, zod 3, `@modelcontextprotocol/sdk` 1.30, vitest 3, Fastify + Postgres for the hosted-door tests.

**Spec:** `docs/superpowers/specs/2026-10-03-workflow-timeline-graphs-design.md`, Part 5 (§14 the tools, §15 the needs from Drafts), with §7.1 to §8.6 and §10 to §12 for context. Cases `29.375`–`29.389`. Read the spec first; its ids (LK, DC, ES, FL, PL, AP, PS, WG, CR, TG, HM, MC, D-n) are cited below. Code was read at `origin/release/knowledge-graph` (`ec72d1f8`); every `file:line` below is from that tree. Re-read before editing: the tip moves, and Parts 1 to 4 and Drafts land before this plan runs.

## Dependencies

| Needs | Owner | What this plan consumes | Seam |
|---|---|---|---|
| `link_tickets`, the links route, `get_ticket.links` | typed-links T4 (Knowledge Graph release) | the tool this plan extends; `GET /v1/workspaces/:ws/tickets/:id/links` | S1 |
| `leads_to`, `label`, Decision, `ticket.decided`, `estimate` / `reworkEstimate` / `waitForAll`, folded `outcome` / `passes` / `rounds` / `periods` / `resolution` | Graph Part 2 | domain exports, `BUILT_IN` set, `redactedPayload` arms, `ticketState` members | S1, S8, S10 |
| the flow route, the Decide door (with a dry run), the origin rule | Graph Part 3 | `GET …/tickets/:id/flow`, `POST …/tickets/:id/decide` | S4, S5, S9 |
| `/v1/timeline/{index,chunk,tray}` | Graph Part 4 | the three timeline reads | S7 |
| draft flag, the `from` link form, `POST …/drafts/publish` | Drafts | `isDraftDetail`, link events on a draft's stream, the all-or-nothing publish | S2, S3, S6 |

Order inside the series: Graph Part 1 first, Drafts next, Part 2 after Drafts T1, **Parts 3 to 5 after Part 2 and Drafts; this plan after Parts 3 and 4** (its reads and its Decide door). MCP sweep 2 (`2026-10-03-mcp-sweep-2.md`) is independent and edits the same registry lines (see Global Constraints).

## Global Constraints

**Release and identity**
- **Release:** `release/workflow-graph`, cut 2026-10-04 from `origin/release/knowledge-graph` at f9e0cd18 (owner). Every task branch is `task/wtg-part5-t<n>-<slug>` cut from `origin/release/workflow-graph`, and its PR has `--base release/workflow-graph`. Never `main`.
- **Catalogue:** `Features.md` §26 "Workflow and Timeline graphs" ↔ `test-cases/29-workflow-timeline-graphs.md`, both created by Graph Part 1 T1. This plan owns `29.375`–`29.389`: T1 `29.375–29.378`, T2 `29.379–29.381`, T3 `29.382–29.383`, T4 `29.384–29.386`, T5 `29.387–29.389`. Nothing else is free: `29.390` onward is Part 2's notification block.
- **Case lines are id lines:** `- ❌ **29.375 — …**`. Each starts ❌ and flips ✅ in the same commit as its test. Test names or comments carry the id. `pnpm check:citations` must pass.
- **Anchors:** Part 1 T1 seeds ONE Part 5 anchor in each file (`<!-- wtg-part5-mcp -->` in `test-cases/29-…`, `<!-- wtg-part5-mcp bullets -->` in `Features.md` §26). T1 writes this plan's sub-section directly below them, keeping the Part anchor lines, and pre-seeds `<!-- wtg-part5-mcp T1 -->` … `<!-- wtg-part5-mcp T5 -->` in `test-cases/29-…` and `<!-- wtg-part5-mcp T1 bullet -->` … `T5 bullet` in `Features.md` §26, so parallel tasks never append to the same line. Each task writes only below its own anchors.
- **Before allocating,** re-grep every live release and task tip for `29.375` (`git for-each-ref refs/remotes/origin --format='%(refname:short)'`, then `git grep -l '29\.37[5-9]\|29\.38'` on each). On 2026-10-03 none had a `29-*` file.
- **Ledger:** plan id `wtg-part5-mcp` (`scripts/check-task-ledger.mjs` strips the date). Rows are given at the end of this plan.
- **Gate:** no new package, so `ctl gate`'s expected task count is unchanged. Do not edit `scripts/ctl/verbs/gate.sh`. Read the count from the tip when quoting a gate; never copy a number from this plan.

**The registry pins are re-read, never copied**
- Several plans add tools to the same lines: typed-links T4 (`link_tickets`), the Drafts plan (`draft` module), MCP sweep 2 (its own five tools in existing blocks), the graph/semantic-layer plans (`graph`, `concept`), and this plan (five).
- So the count in `register.test.ts` 14.555 (`FINAL`, `toHaveLength`, its title), the spelled count in `test-cases/14-mcp-server.md` (the 14.555 line) and in `Features.md` (the "Sixty-three tools in both doors" sentence, grep `-i 'sixty-three\|63 tools'`) is **re-derived from the tip at execution**: count `allTools` on the branch you start from, add yours, write that number. Never hard-code a number from this plan, from the sweep-2 spec (68) or from typed-links (64).
- **The `flow` module is the last factory and the last block.** `flowTools(session)` goes last in `allTools` and `flow` goes last in `TOOL_NAMES_BY_MODULE`, after whatever blocks the tip has at execution (`draft`, `graph`, `concept`, …).
- **Final tool order inside the block:** `set_wait_for_all` (T1), `get_flow` (T2), `get_timeline` (T3), `resolve_decision` (T4), `publish_flow` (T5). Each task adds its name on its own line, in that order, and `FINAL` gets the same name on its own line after the last name the tip has.
- **Every new tool needs a `SWEEP` entry** (`packages/mcp-server/test/fixtures/tool-sweep.ts`) with a valid fake answer, or the stdout sweep (14.88) goes red.
- Tasks that touch these lines **land in sequence** (T1, T2, T3, T4, T5). The seam probes and the unit tests of different tasks do not conflict, but the pin hunks do.

**Merge points with other plans (say so in each PR body)**
- `write-tools.ts` `birthShape` and the `ticket.created` payload: Drafts adds `draft`, MCP sweep 2 adds `assignee_email`, this plan adds `estimate`. One line each; rebase, never overwrite.
- `ticket-tools.ts` `link_tickets`: typed-links T4 writes it; T1 replaces its handler body and keeps its description sentences.
- `preview.ts`: **do not change `confirmOrPreview`'s signature.** MCP sweep 2 adds a fourth parameter (its §8.3). This plan wraps it and spreads extra members onto its result.
- `tool-names.ts`, `tool-sweep.ts`, `register.test.ts`, `Features.md` §14/§26, `test-cases/14-mcp-server.md` (the count line).

**What this plan does not add (Part 2 does; assert it, never re-add)**
- The three ids in `BUILT_IN` (`ticket-tools.ts:19`, ES-1a), the `redactedPayload` arms for `ticket.decided` and the flow causes (§8.4), `DECISION_TYPE_ID`, `estimateValueSchema`, `SYSTEM_ACTOR_FLOW`. T1's probe fails with the owner named if one is missing.

**Copy rules**
- No spaced em dash in any reply, refusal or error string under `packages/mcp-server/src` (the HK-3b scan in `packages/app-core/test/copy/ui-copy.test.ts`; `description:` literals are exempt). Use a colon, a comma or a full stop.
- A refusal passes through verbatim: `refused by <rule>: <reason>` (`submit.ts:30`), `event <i> refused by …` in a batch (`submit.ts:49`). A tool never rewords one.
- A ticket the caller cannot see answers `ticket not found or not visible to you` (`reads.ts:9`, `ticket-tools.ts:26`).
- Preview shape is the house one (`preview.ts:1-9`): `{ preview: true, wouldChange, counts, nothingChanged: true, confirm }`. Extra members are spread on. The spec's word `sentence` is NOT used (decision 1).

**Tests and tooling**
- **Node 22** for `pnpm install` in a worktree. Every test run goes through `/Users/kiro/my_projects/gisik-nokma-lanes/slot-run.sh <label> -- <cmd>`.
- **Never pipe a test or build run into `head`** (use `| tail -N` or `> /tmp/x.log 2>&1`). No `pkill` / `killall`. vitest `--maxWorkers=2`.
- **Build before suites.** The server reads domain, rule-engine and app-core `dist`; mcp-server reads domain `dist`. An app-core online/sync change ⇒ also run the server integration files (none here).
- **Every run quoted in a report is named LOCAL.** CI runs only on the release→main PR.
- **Controls live in the same `it()`** as the case they guard: each refusal also proves the same call with one input changed is accepted.
- **Hosted tests** (`apps/server/test/mcp/**`) run against the real app and database through `POST /mcp`, like `mcp-tickets.test.ts`. They need Parts 2 to 4 and Drafts built.
- **A seam probe that fails is a STOP, not a task.** If a probe names a Part or the Drafts plan as the owner, do not build the missing piece here: report it to the planner and wait. Only a wrong NAME (the thing exists, spelled differently) is fixed here, in `flow-seams.ts`.
- **Features.md and `test-cases/`** change in the same commit as the code. No UI task here, so no `frontend-design`.

**Decisions this plan took (correct them at review)**
1. **The preview keeps the house keys** (`wouldChange`, `counts`, `confirm`), not the spec's `sentence`; it adds `tickets`, `startedTickets`, `hiddenMoves` beside them.
2. **`resolve_decision` previews from the SERVER's plan** (`dryRun` on the Decide door), not from `get_flow`'s visible graph. A client-side `planSettle` over the visible graph misses the tickets the caller cannot see (spec §10.2, PS-6 "Some steps you can't see will also move" is not derivable on a client).
3. **`publish_flow`'s preview does not show keys.** No route reads a project's next number (grep of the tip and of the Drafts spec found none), and the Drafts spec says keys are assigned when the publish commits. The preview shows the order, each draft's title and its parent, and says keys are assigned when the publish commits (the spec's "the keys they would take" cannot be shown).
4. **`publish_flow` order** is the flow order (FL-3, the order `get_flow` lists nodes in), with each draft parent pulled ahead of its draft children (Drafts R51).
5. **`get_timeline` defaults:** `mine: false` (everyone visible), `limit` 200 (max 500), a window of at most 180 days, `includeTray` fetches one tray page (200) and reports `trayCount`. `flows[].nodes` are ids only (the plan inputs are for the app's re-planner).
6. **`link_tickets` removal prefers the outgoing link** when both directions of a `leads_to` loop are stored (A→B and B→A). To remove B→A, call with `ticketId` B.
7. **A cleared pass is a revision** (PS-2 rule 2): `resolve_decision` reports `pass` and `revised` exactly as the Decide door's write answers them (`{filed, pass, revised: {from, to} | null}`, Part 3 T11, planner ruling P2); the tool neither re-reads the Decision nor computes them from its request.
8. **`get_ticket` and `get_flow` null any id that is not in the visible set** (a Not-taken resolution's Decision, `autoMoves.becauseTicketId`, `alternates`), as defence in depth over the server's redaction.
9. **`get_timeline`'s `pin` follows TG-11 and §14** (counts `{notes, attachments}` on the index entry), the same as spec :174 since the reconcile (it used to say "true when…"); probe S7 stops if Part 4 shipped a boolean.
10. **`resolve_decision` consumes Part 3 T11's Decide door for every choice** (the spec names `ingestAtomic` but no client-callable route; planner ruling P1). `close` follows spec §14: by default (`close: true`) the body omits `finishStateId`, so the door finishes an unfinished Decision given an outcome into the workflow's first-declared terminal state when one is reachable (D-W3-44); `close: false` sends `finishStateId: null`, which records the outcome only (no finish, no cascade). The tool never writes through the event door. It sends the same body twice, with `dryRun: true` and then without it, names the plan's moves through `readFlow`, refuses a plan that says `blocked` before writing with the engine's own `blocked.sentence` (planner ruling P3; the dry run does not run the gates, D-W3-41), and validates nothing else the server owns (`closeStarted` membership, unknown or same outcome): those refusals pass through verbatim (`postDecide`). What happened to the Decision itself (`finish`) is read from the write's `filed` list.
11. **`publish_flow` publishes the drafts of the flow only.** A draft whose parent is a draft outside the flow is not pulled in silently; the server's `draft.parent-unpublished` refusal names the draft and nothing is published (Drafts R51).

- Gate task count and every pinned member/registry count are MEASURED on the tip at execution and pinned in the same task that changes them; never copy a number from this plan.

## Review Focus

1. **A `relabel` left half-applied.** The event door commits the remove and goes on after a refused add, so the link vanishes. Pre-checks (blank, duplicate, Decision needs a label) plus a compensating add; if even that is refused the error says the link must be re-added and with which label. Pinned by 29.376 (T1).
2. **The wrong edge removed in a loop.** A→B and B→A are both stored; `link_tickets remove` (A, B) must file on A's stream, not B's. Pinned by 29.376 (T1).
3. **A hidden Decision's id in a reply.** `get_ticket.resolution`, `get_flow.nodes[].resolution`, `alternates`, `autoMoves`, `ticketState.closed.cause`: none may carry the id, key or title of a ticket the caller cannot see. The test serialises the whole reply and asserts the hidden ULID is absent, with the visible-caller control in the same `it`. Pinned by 29.380 and 29.381 (T2).
4. **`publish_flow` after a lost response, and a child ahead of its parent.** A retry re-reads the flow, so the already-published drafts drop out (Drafts R53); the child-first flow order is reordered parent-first; a 409 refusal reaches the assistant in the product's words, naming the draft. Pinned by 29.387 (T5).
5. **`resolve_decision` racing a revision.** The tool sends the outcome it read as `from`; a change in between is refused `decision.stale-from` and nothing is written; a preview writes nothing at all (the recorded requests are asserted, not the reply); a wrong-case key is still a preview. Pinned by 29.385 and 29.386 (T4).

---

## File structure

| File | Responsibility | Task |
|---|---|---|
| `packages/mcp-server/src/tools/flow-seams.ts` (new) | every route and wire shape owned by Parts 2 to 4 and Drafts: paths, `isDraftDetail`, zod schemas for the flow, the Decide plan and reply, the timeline reads, the publish reply | 1 (draft flag), 2, 3, 4, 5 (each appends its own) |
| `packages/mcp-server/src/tools/link-events.ts` (new) | `linkEvent` (which stream, which payload), `pickLink`, `describeResult`, `relabelStored` | 1 |
| `packages/mcp-server/src/tools/ticket-tools.ts` | `link_tickets` handler (leads_to, label, relabel, draft-aware); `update_ticket` `estimate` / `reworkEstimate`; `waitForAll` message; `TicketDetailWire` widened | 1 |
| `packages/mcp-server/src/tools/write-tools.ts` | `create_ticket` `estimate` | 1 |
| `packages/mcp-server/src/tools/flow-tools.ts` (new) | `flowTools(session)`: the five tools, appended one per task | 1 (`set_wait_for_all`), 2, 3, 4, 5 |
| `packages/mcp-server/src/tools/flow-answer.ts` (new) | `toFlowAnswer(wire)`: the sanitised `get_flow` answer | 2 |
| `packages/mcp-server/src/tools/ticket-flow-facts.ts` (new) | `withFlowFacts`: passes, round, periods, resolution for `get_ticket`, ids stripped | 2 |
| `packages/mcp-server/src/tools/read-tools.ts` | `get_ticket` calls `withFlowFacts` | 2 |
| `packages/mcp-server/src/tools/timeline-window.ts` (new) | Monday-aligned chunks, the window fetch, merge, sort, cursor | 3 |
| `packages/mcp-server/src/tools/decision.ts` (new) | `toDecidePlan`, `hasEffects`, `previewSentence`, `planTickets` | 4 |
| `packages/mcp-server/src/tools/publish-order.ts` (new) | `publishOrder` (flow order, parents first), `publishPreview`, `publishAll` (the one request, the 409 in the product's words) | 5 |
| `packages/mcp-server/src/tools/register.ts` | `...flowTools(session)` last | 1 |
| `packages/mcp-server/test/fixtures/{tool-names,tool-sweep}.ts`, `test/register.test.ts` | pins | each task |
| `packages/mcp-server/test/fixtures/flow-fixtures.ts` (new) | ids, `fakeFlow(routes, opts)` session | 1 |
| `packages/mcp-server/test/{link-tools,flow-tools,flow-get-tools,timeline-tools,decision-tools,publish-flow,flow-registry}.test.ts` (new) | unit cases | 1 to 5 |
| `apps/server/test/mcp/helpers/flow-world.ts` (new) | `ok`, `mk`, `until`, the hosted-world helpers | 1 |
| `apps/server/test/mcp/flow-seams.test.ts` (new) | the seam probes S1 to S10, one `it` each, each naming its owner | 1 to 5 (each appends) |
| `apps/server/test/mcp/mcp-flow.test.ts` (new) | hosted round trips and door matrix | 1 to 5 |
| `docs/manual.md` §16 (+ `pnpm help:generate`) | one bullet: flows and timelines | 5 |
| `Features.md` §26, `test-cases/29-workflow-timeline-graphs.md` | this plan's bullets and cases | each task |
| `docs/lanes/task-ledger.tsv` | the five rows | by the plan's PR |

**Parallelism:** none. The tasks land strictly in order T1, T2, T3, T4, T5: they share one module, one seam file and the same registry pin lines, and each pin names the tool before it (`get_timeline` after `get_flow`, `resolve_decision` after `get_timeline`, `publish_flow` after `resolve_decision`), which the contiguous-block case 29.389 in T5 pins. The code-level dependencies are narrower (T4 and T5 need only T1's module, fixtures and world helpers; T5 also needs T2's `readFlow` and `toFlowAnswer`; the Decide door is Part 3's) and are the reason a task may be reviewed early, not landed early.

**Seams (S1 to S10), each probed by the task that first needs it.**

| Seam | Owner | Shape consumed | Probed in |
|---|---|---|---|
| S1 | typed-links T4 + Part 2 | links rows `{kind, direction: 'out'\|'in', label: string\|null, ticket: {id, key, title}}`; `TICKET_LINK_KINDS` contains `leads_to` | T1 |
| S2 | Drafts T4 (G7, decision 2) | the ticket detail `GET …/tickets/:id` of the author's draft serves `ticketState.draft = {authorId, at, discarded?}` and `key: null`; there is NO top-level `draft` on the server's detail (the top-level `draft: true` is the MCP `get_ticket` answer's, added by Drafts T7, 28.139) | T1 |
| S3 | Drafts R42, Part 2 LK-2 | `ticket.link_added` / `link_removed` accept `from`; `link_added` accepts `label` | T1 |
| S8 | Part 2 | `@gisik-nokma/domain` exports `DECISION_TYPE_ID`, `estimateValueSchema`; `BUILT_IN` holds the three ids | T1 |
| S10 | Part 2 (T5, T8, T9) | `ticketState` carries `outcome`, `passes`, `rounds`, `periods` and `closed.cause`; there is NO folded `resolution` member (Part 2 decision 2: it is derived by `resolutionOf` from a `branch-not-taken` `closed.cause`; the projection column is `closed_cause`), so `get_ticket` derives it the same way | T2 |
| S4 | Part 3 | `GET /v1/workspaces/:ws/tickets/:id/flow` answers the `flowWireSchema` below, nodes in flow order, `parentId` on every node | T2 |
| S7 | Part 4 T3 (`TimelineIndexResponse`, `TimelineChunkResponse`, `TimelineTrayResponse` in `read-models-timeline.ts`) | `GET /v1/timeline/index?ws=a,b&proj=c&mine=1` → `{today, asOf, items, flows, tray: {count}, truncated: null \| {dropped, before}}`, index `pin` as counts `{notes, attachments}`; `/chunk?…&from&to` (≤ 28 days) → `{items: [{id, title, stateId, stateName, basis, …}], nextCursor}`; `/tray?…` → `{items: [{id, key, title, reason, …}], nextCursor}` | T3 |
| S5 | Part 3 T11 (D-W3-41 to D-W3-45, planner rulings P1 to P3) | `POST /v1/workspaces/:ws/tickets/:id/decide`, closed body `{outcome, from?, closeStarted?, dryRun?, finishStateId?: string \| null}` (omitted: the first-declared terminal state when one is reachable; `null`: record the outcome only; a string: that reachable terminal state, else 422 `decision.bad-finish-state`); dry run `200 {plan: {moves: [{ticketId, kind: 'reopen' \| 'backlog' \| 'not-taken'}], hiddenMoves, started, blocked: {ticketId \| null, reason, sentence} \| null}}`; write `200 {filed: string[], pass: number, revised: {from, to} \| null}`; refusals `409 {rule: 'decision.stale-from', reason}`, `422 {rule, reason}`, `400 {rule: 'ingest.<code>', reason}`, the shared 404 | T4 |
| S9 | Parts 3 and Drafts | the Decide door derives `origin` from `request.authKind === 'mcp-token' ? 'mcp' : 'web'` (Part 3 T11; the precedent is `apps/server/src/routes/workspaces.ts:70-80`, `:145`); the publish door does NOT: it records the body's `origin` (default `web`, Drafts T5b decision 8), so `publish_flow` sends `origin: 'mcp'` | T4, T5 |
| S6 | Drafts T5b (R48/R49) | `POST /v1/workspaces/:ws/drafts/publish {ticketIds: string[]; origin?: 'web' \| 'mobile' \| 'desktop' \| 'mcp'}` (≤ 200 ids; `origin` is a BODY member, default `web`, Drafts T5b decision 8) → `200 {results: [{ticketId, key}]}`; refusal `409 {rule: 'draft.publish-refused', ticketId, cause: {rule, reason}}`; `400 {error: 'bad_request', message}`; `404` for a non-member | T5 |

---

### Task 1: `link_tickets` (leads_to, label, relabel, draft ends), `set_wait_for_all`, `estimate` (cases 29.375–29.378)

**Branch:** `task/wtg-part5-t1-simple-writes` from `origin/release/workflow-graph`; PR `--base release/workflow-graph`.

**Files:**
- Create:
  - `packages/mcp-server/src/tools/flow-seams.ts` (this task adds `isDraftDetail` only)
  - `packages/mcp-server/src/tools/link-events.ts`
  - `packages/mcp-server/src/tools/flow-tools.ts` (this task adds `set_wait_for_all` only)
  - `packages/mcp-server/test/fixtures/flow-fixtures.ts`
  - `packages/mcp-server/test/link-tools.test.ts`, `packages/mcp-server/test/flow-tools.test.ts`
  - `apps/server/test/mcp/helpers/flow-world.ts`, `apps/server/test/mcp/flow-seams.test.ts`, `apps/server/test/mcp/mcp-flow.test.ts`
- Modify:
  - `packages/mcp-server/src/tools/ticket-tools.ts`: `BUILT_IN` (`:19`, assert only), `TicketDetailWire` (`:11-16`), `updateShape` (`:31-38`), the built-in loop (`:84-86`), the events (`:97-98`), a new `link_tickets` handler after `rank_ticket` (`:166-182`; typed-links T4 put the tool there, copy its description sentences)
  - `packages/mcp-server/src/tools/write-tools.ts`: `birthShape` (`:14-21`) and the `ticket.created` payload (`:81-86`)
  - `packages/mcp-server/src/tools/read-tools.ts`: nothing in T1 (Graph Part 2 T2 owns the `label` spread on `get_ticket`'s `links` mapping; T1 only asserts it in 29.375; T2 adds the flow facts)
  - `packages/mcp-server/src/tools/register.ts`: import and `...flowTools(session),` last (`:27-42`)
  - `packages/mcp-server/test/fixtures/tool-names.ts`, `tool-sweep.ts`; `packages/mcp-server/test/register.test.ts:87-110` (14.555)
  - Catalogue: `test-cases/29-workflow-timeline-graphs.md`, `Features.md` §26, `test-cases/14-mcp-server.md` (the 14.555 line), `Features.md` (the spelled tool count)

**Interfaces:**
- **Consumes:** typed-links T4's `link_tickets` and links route (S1); Part 2's `TICKET_LINK_KINDS` with `leads_to`, `estimateValueSchema`, `BUILTIN_FIELD_IDS` with the three ids (S8); `ticket.link_added { label }` (S3, LK-2); Drafts' `ticketState.draft` on the ticket detail (S2, Drafts T4 G7) and the `from` member (S3, R42).
- **Produces:**
  - `isDraftDetail(detail: { ticketState?: { draft?: unknown } }): boolean`;
  - `type LinkRow`, `type LinkEnd = { id: string; draft: boolean }`, `type LinkSpec = { kind: TicketLinkKind; source: LinkEnd; target: LinkEnd; label?: string }`;
  - `linkEvent(session, workspaceId, type, spec): SubmittedEvent`, `pickLink(links, kind, otherId): LinkRow | undefined`, `describeResult(result, index): string`, `relabelStored(session, workspaceId, stored, otherLabels, newLabel): Promise<unknown>`;
  - `flowTools(session): ToolDefinition[]`, registered last;
  - the test fixtures `fakeFlow(routes, opts)`, `ulid`, `WS`, `ME`, and the hosted helpers `ok`, `mk`, `until`.

- [ ] **Step 1: Open this plan's catalogue sections and anchors**

  Guard first: `test -f test-cases/29-workflow-timeline-graphs.md && grep -n '^## 26\.' Features.md && grep -n '^<!-- wtg-part5-mcp -->$' test-cases/29-workflow-timeline-graphs.md && grep -n '^<!-- wtg-part5-mcp bullets -->$' Features.md`. If any is missing, Graph Part 1 T1 has not landed: STOP and tell the planner.

  `test-cases/29-workflow-timeline-graphs.md`: read its existing sub-section headings and match their scheme, then write directly below Part 1's `<!-- wtg-part5-mcp -->` (keep that line; the heading below assumes Part 1 numbered its sections `29.1`…, so Part 5 is `29.5`):
  ```markdown
  ## 29.5 Part 5: MCP (29.375–29.389)

  Plan `docs/superpowers/plans/2026-10-03-wtg-part5-mcp.md`. T1 29.375–29.378 · T2 29.379–29.381 · T3 29.382–29.383 · T4 29.384–29.386 · T5 29.387–29.389.

  <!-- wtg-part5-mcp T1 -->
  <!-- wtg-part5-mcp T2 -->
  <!-- wtg-part5-mcp T3 -->
  <!-- wtg-part5-mcp T4 -->
  <!-- wtg-part5-mcp T5 -->
  ```
  `Features.md` §26: directly below Part 1's `<!-- wtg-part5-mcp bullets -->` (keep that line), write `### MCP (Part 5)` and five lines `<!-- wtg-part5-mcp T1 bullet -->` … `T5 bullet`.

  Run: `node scripts/check-case-ids.mjs && pnpm check:citations`. Expected: both pass.
  Commit: `wtg-part5 T1: open the Part 5 sub-sections and per-task anchors under Part 1's Part 5 anchors`.

- [ ] **Step 2: The seam probes S1, S2, S3, S8 (hosted, RED means STOP)**

  Case lines are in Step 3; these probes carry no case id (they guard the plan, not the product).

  `apps/server/test/mcp/helpers/flow-world.ts`:
  ```ts
  import { expect } from 'vitest';
  import { newUlid } from '@gisik-nokma/domain';
  import { buildDoorWorld, callTool, type Caller, type DoorWorld } from './door-matrix.js';

  export { buildDoorWorld, callTool };
  export type { Caller, DoorWorld };

  /** One successful tool call: the parsed JSON answer. A refusal fails the test with the tool's own words. */
  export async function ok(w: DoorWorld, who: Caller, tool: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
    const r = await callTool(w.app, who.token, tool, args);
    expect(r.isError, `${tool}: ${r.text}`).toBe(false);
    return r.json as Record<string, unknown>;
  }

  /** A ticket in the world's project, made by MCP as `who`. Returns its id. */
  export async function mk(w: DoorWorld, who: Caller, title: string, extra: Record<string, unknown> = {}): Promise<string> {
    const out = await ok(w, who, 'create_ticket', { workspaceId: w.workspaceId, projectId: w.projectId, typeId: 'task', title, ...extra });
    return out['ticketId'] as string;
  }

  /** Poll until `fn` answers non-null. The flow's cascade is filed AFTER the person's act (spec AP-5), so a test waits for it. */
  export async function until<T>(what: string, fn: () => Promise<T | null>, ms = 8000): Promise<T> {
    const started = Date.now();
    for (;;) {
      const value = await fn();
      if (value !== null) return value;
      if (Date.now() - started > ms) throw new Error(`timed out waiting for ${what}`);
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  /** Raw events through the event door as `who` (the session token), for probes that must not depend on a Part 5 tool. */
  export async function rawEvents(w: DoorWorld, who: Caller, events: Array<{ entityId: string; type: string; payload: unknown }>) {
    const res = await w.app.inject({
      method: 'POST', url: '/v1/events', headers: { authorization: `Bearer ${who.sessionToken}` },
      payload: { events: events.map((e) => ({
        id: newUlid(), workspaceId: w.workspaceId, entity: { kind: 'ticket', id: e.entityId },
        type: e.type, version: 1, payload: e.payload, actorId: who.userId, origin: 'web', clientTime: new Date().toISOString(),
      })) },
    });
    return res.json<{ results: Array<{ status: string; rule?: string; reason?: string }> }>().results;
  }
  ```

  `apps/server/test/mcp/flow-seams.test.ts`:
  ```ts
  import { afterAll, beforeAll, describe, expect, it } from 'vitest';
  import * as domain from '@gisik-nokma/domain';
  import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
  import { buildDoorWorld, mk, ok, rawEvents } from './helpers/flow-world.js';

  /**
   * Seam probes for the Part 5 MCP tools. A failure here names the OWNER of the missing piece:
   * do not build it in this plan, report it to the planner and wait (Global Constraints). Run LOCALLY.
   */
  let db: TestDatabase;
  beforeAll(async () => { db = await createTestDatabase(); });
  afterAll(async () => { await db.drop(); });

  describe('SEAM probes (Part 5 T1)', () => {
    it('SEAM S8 (Graph Part 2): the domain exports what the tools import', () => {
      expect(domain.DECISION_TYPE_ID, 'DECISION_TYPE_ID').toBe('decision');
      expect(typeof domain.estimateValueSchema.safeParse, 'estimateValueSchema').toBe('function');
      expect(domain.estimateValueSchema.safeParse(365).success).toBe(true);
      expect(domain.estimateValueSchema.safeParse(366).success).toBe(false);
      for (const f of ['estimate', 'waitForAll', 'reworkEstimate']) expect(domain.BUILTIN_FIELD_IDS as readonly string[], f).toContain(f);
      expect(domain.TICKET_LINK_KINDS as readonly string[]).toContain('leads_to');
    });

    it('SEAM S1/S3 (typed-links T4, Graph Part 2): a labelled leads_to is stored and the links route returns the label and direction', async () => {
      const w = await buildDoorWorld(db, '3751');
      const decision = await mk(w, w.owner, 'Client decides', { typeId: 'decision' }); // S8: the Decision seed exists in a new workspace
      const next = await mk(w, w.owner, 'Pitch');
      const [r] = await rawEvents(w, w.owner, [{ entityId: decision, type: 'ticket.link_added', payload: { kind: 'leads_to', targetId: next, label: 'Yes' } }]);
      expect(r?.status, `S3: ${r?.reason}`).toBe('committed');
      const res = await w.app.inject({ method: 'GET', url: `/v1/workspaces/${w.workspaceId}/tickets/${decision}/links`, headers: { authorization: `Bearer ${w.owner.sessionToken}` } });
      const rows = res.json<{ links: Array<{ kind: string; direction: string; label?: string | null; ticket: { id: string } }> }>().links;
      expect(rows.find((l) => l.kind === 'leads_to' && l.direction === 'out' && l.ticket.id === next)?.label, 'S1: the links row carries `label`').toBe('Yes');
      // control: the other end sees the same link as incoming, with the label too
      const back = await w.app.inject({ method: 'GET', url: `/v1/workspaces/${w.workspaceId}/tickets/${next}/links`, headers: { authorization: `Bearer ${w.owner.sessionToken}` } });
      expect(back.json<{ links: Array<{ direction: string; label?: string | null }> }>().links.some((l) => l.direction === 'in' && l.label === 'Yes')).toBe(true);
    });

    it('SEAM S2/S3 (Drafts): the ticket detail carries `ticketState.draft` and `key: null`, and a link whose target is a draft takes the `from` form on the draft stream', async () => {
      const w = await buildDoorWorld(db, '3752');
      const draft = domain.newUlid();
      const [created] = await rawEvents(w, w.owner, [{ entityId: draft, type: 'ticket.created', payload: { typeId: 'task', projectId: w.projectId, parentId: null, title: 'A draft', start: 'backlog', draft: true } }]);
      expect(created?.status, `Drafts D2: ${created?.reason}`).toBe('committed');
      const detail = await w.app.inject({ method: 'GET', url: `/v1/workspaces/${w.workspaceId}/tickets/${draft}`, headers: { authorization: `Bearer ${w.owner.sessionToken}` } });
      const read = detail.json<{ key: string | null; ticketState: { draft?: { authorId: string } } }>();
      expect(read.ticketState.draft?.authorId, 'S2 (Drafts T4 G7): `ticketState.draft.authorId`').toBe(w.owner.userId);
      expect(read.key, 'S2: a draft has no key').toBeNull();
      const [linked] = await rawEvents(w, w.owner, [{ entityId: draft, type: 'ticket.link_added', payload: { kind: 'blocks', targetId: draft, from: w.ticketId } }]);
      expect(linked?.status, `S3 (Drafts R42): ${linked?.reason}`).toBe('committed');
      // control: the plain form on the PUBLISHED source's stream, naming the draft, is refused (R43 draft.link-form)
      const [plain] = await rawEvents(w, w.owner, [{ entityId: w.ticketId, type: 'ticket.link_added', payload: { kind: 'relates', targetId: draft } }]);
      expect(plain?.status).toBe('refused');
      expect(plain?.rule).toBe('draft.link-form');
    });
  });
  ```
  Run (LOCAL): `/Users/kiro/my_projects/gisik-nokma-lanes/slot-run.sh wtg5-t1-probe -- pnpm --filter @gisik-nokma/server exec vitest run test/mcp/flow-seams.test.ts --maxWorkers=2 > /tmp/wtg5-t1-probe.log 2>&1; tail -40 /tmp/wtg5-t1-probe.log`.
  Expected: PASS. A red probe is a STOP: the message names the owner (`S8`, `S1/S3`, `S2/S3`). If the failure is only a NAME (the thing exists, spelled differently), fix the probe and `flow-seams.ts` here and say so in the handoff.

  Commit: `wtg-part5 T1: seam probes S1 S2 S3 S8`.

- [ ] **Step 3: The case lines and the RED unit tests (29.375–29.378)**

  Case lines under `<!-- wtg-part5-mcp T1 -->`, all ❌:
  - `- ❌ **29.375 — `link_tickets` `action: 'add'` with `kind: 'leads_to'` files ONE `ticket.link_added {kind, targetId, label}` with the TRIMMED label on the source's stream (`origin: 'mcp'`, the session actor); from a Decision with no label the server's `link.label-required` passes through verbatim; a link whose target is a draft and whose source is published files on the DRAFT's stream with `from`, a link whose source is a draft files plain on the draft, and a link between two published tickets files plain, and `get_ticket.links` carries the `label` of a `leads_to` row;** control: a `label` on `kind: 'blocks'` is refused before anything is sent, `blocks` between two published tickets carries no `label` key, and a `blocks` row in `get_ticket.links` has no `label` member. Mutation: drop `from` in `linkEvent` → the draft case reddens.`
  - `- ❌ **29.376 — `remove` and `relabel` file on the STORED source: with A→B and B→A both stored, `remove` (A, B) files on A's stream and (B, A) on B's, an incoming-only link is removed from the other stream, and a `relabel` is one batch `[link_removed, link_added]` after three pre-checks (the label is not the current one, not another outgoing branch's label after trim and case folding, present); when the add is refused after the remove committed, the old link is put back and the error says so, and if even that is refused the error names the label to re-add;** control: the same relabel with a free label commits both events. Mutation: `pickLink` returns the first match → the loop case reddens; skip the compensating add → the compensation case reddens.`
  - `- ❌ **29.377 — `set_wait_for_all {value}` files `ticket.field_set {fieldId: 'waitForAll', value: true}` for on and `value: null` for off (never `false`), origin `mcp`; `update_ticket` refuses `fields: {waitForAll}` with "use the set_wait_for_all tool", and the other built-ins keep their messages;** control: a custom field id is still accepted by `update_ticket`, and a non-boolean `value` is refused by the schema. Mutation: send `a.value` raw → off files `false` and the case reddens.`
  - `- ❌ **29.378 — `create_ticket` carries `estimate` in `ticket.created` (absent when omitted); `update_ticket` files `estimate` / `reworkEstimate` as `ticket.field_set`, `null` clears; 0, 366 and 2.5 are refused by the schema before anything is sent; `fields: {estimate}` and `fields: {reworkEstimate}` are refused as built-ins;** control: 1 and 365 are accepted. Mutation: widen the schema to `max(366)` → the 366 case reddens.`

  `packages/mcp-server/test/fixtures/flow-fixtures.ts`:
  ```ts
  import { HttpError } from '../../src/http-client.js';
  import type { Session } from '../../src/session.js';
  import { NO_TRANSFER } from './fake-session.js';

  export const ulid = (tag: string): string => `01J0${tag}`.padEnd(26, '0');
  export const ME = ulid('ME');
  export const WS = ulid('WS');
  export const COMMITTED = { status: 'committed', eventId: 'e', seq: 1, serverTime: '2026-10-03T10:00:00.000Z' };

  type Responder = unknown | ((path: string) => unknown);
  type PostResponder = unknown | ((body: unknown) => unknown);

  /**
   * A fake `Session` that records every request. `routes` answers GETs by exact path (or `path?query`; a function
   * answers with the full path, so it can read the query). `posts` answers JSON POSTs by path. `results` answers
   * `postEvents` per batch (index, events); the default is one COMMITTED result per event. An unknown GET is the
   * product's 404, so "not visible to you" is exercised for free.
   */
  export function fakeFlow(
    routes: Record<string, Responder> = {},
    opts: { posts?: Record<string, PostResponder>; results?: (batchIndex: number, events: unknown[]) => unknown[] | undefined } = {},
  ) {
    const gets: string[] = [];
    const posts: Array<{ path: string; body: unknown }> = [];
    const batches: Array<Array<Record<string, unknown>>> = [];
    const session: Session = {
      userId: () => ME,
      get: async (path) => {
        gets.push(path);
        for (const [p, r] of Object.entries(routes)) {
          if (path === p || path.startsWith(`${p}?`)) return typeof r === 'function' ? (r as (x: string) => unknown)(path) : r;
        }
        throw new HttpError(404, { error: 'not_found' });
      },
      post: async (path, body) => {
        posts.push({ path, body });
        const r = opts.posts?.[path];
        if (r === undefined) throw new HttpError(404, { error: 'not_found' });
        return typeof r === 'function' ? (r as (x: unknown) => unknown)(body) : r;
      },
      postEvents: async (events) => {
        batches.push(events as Array<Record<string, unknown>>);
        return { results: opts.results?.(batches.length - 1, events) ?? events.map(() => COMMITTED) };
      },
      ...NO_TRANSFER,
    };
    return { session, gets, posts, batches };
  }

  /** The ticket-detail answer the tools read: draft flag, type, state. */
  export const detail = (over: { key?: string | null; draft?: boolean; typeId?: string; stateId?: string; stateCategory?: string; links?: unknown[]; outcome?: string | null; rank?: string | null } = {}) => ({
    key: over.key ?? 'GN-1', title: 'A ticket',
    ticketState: {
      // Drafts T4 G7: a draft's detail carries `ticketState.draft` (no top-level flag on the server's read).
      ...(over.draft === true ? { draft: { authorId: 'u-author', at: '2026-10-03T00:00:00.000Z' } } : {}),
      fields: {}, rank: over.rank ?? null, workflowId: 'wf', workflowVersion: 1, typeId: over.typeId ?? 'task',
      stateId: over.stateId ?? 'todo', stateCategory: over.stateCategory ?? 'active', outcome: over.outcome ?? null, links: over.links ?? [],
    },
    rollup: null,
  });
  ```
  `packages/mcp-server/test/link-tools.test.ts` (29.375 and 29.376):
  ```ts
  import { describe, expect, it } from 'vitest';
  import { readTools } from '../src/tools/read-tools.js';
  import { ticketTools } from '../src/tools/ticket-tools.js';
  import { COMMITTED, ME, WS, detail, fakeFlow, ulid } from './fixtures/flow-fixtures.js';

  const A = ulid('AAA');
  const B = ulid('BBB');
  const D = ulid('DEC'); // a Decision
  const DR = ulid('DRF'); // a draft
  const tw = `/v1/workspaces/${WS}/tickets`;
  const row = (kind: string, direction: 'out' | 'in', id: string, label: string | null = null) => ({ kind, direction, label, ticket: { id, key: 'GN-9', title: 'T' } });
  const ENDS = {
    [`${tw}/${A}`]: detail({ key: 'GN-1' }), [`${tw}/${B}`]: detail({ key: 'GN-2' }), [`${tw}/${D}`]: detail({ key: 'GN-3', typeId: 'decision' }),
    [`${tw}/${DR}`]: detail({ key: null, draft: true }),
  };
  const tool = (s: Parameters<typeof ticketTools>[0]) => ticketTools(s).find((t) => t.name === 'link_tickets')!;
  const base = { workspaceId: WS, kind: 'leads_to', action: 'add' } as const;

  describe('29.375 link_tickets: leads_to, label, draft ends', () => {
    it('29.375 files one link_added with the trimmed label; a Decision without a label is the server refusal verbatim; label on blocks is refused unsent', async () => {
      const f = fakeFlow(ENDS);
      await tool(f.session).handler({ ...base, ticketId: D, targetId: A, label: '  Yes  ' });
      expect(f.batches).toHaveLength(1);
      expect(f.batches[0]).toHaveLength(1);
      expect(f.batches[0]![0]).toMatchObject({ type: 'ticket.link_added', origin: 'mcp', actorId: ME, entity: { kind: 'ticket', id: D }, payload: { kind: 'leads_to', targetId: A, label: 'Yes' } });

      await expect(tool(f.session).handler({ ...base, kind: 'blocks', ticketId: A, targetId: B, label: 'x' })).rejects.toThrow('label only applies to "leads_to" links');
      expect(f.batches, 'refused before anything was sent').toHaveLength(1);
      await tool(f.session).handler({ ...base, kind: 'blocks', ticketId: A, targetId: B }); // control: blocks without a label
      expect(f.batches[1]![0]!['payload']).toEqual({ kind: 'blocks', targetId: B }); // no `label`, no `from`

      const refused = fakeFlow(ENDS, { results: () => [{ status: 'refused', eventId: 'e', rule: 'link.label-required', reason: 'A link from a Decision needs a label.' }] });
      await expect(tool(refused.session).handler({ ...base, ticketId: D, targetId: A })).rejects.toThrow('refused by link.label-required: A link from a Decision needs a label.');
    });

    it('29.375 a draft end files on the draft stream: from-form when the source is published, plain when the source is a draft', async () => {
      const f = fakeFlow(ENDS);
      await tool(f.session).handler({ ...base, kind: 'blocks', ticketId: A, targetId: DR }); // published -> draft
      expect(f.batches[0]![0]).toMatchObject({ entity: { id: DR }, payload: { kind: 'blocks', targetId: DR, from: A } });
      await tool(f.session).handler({ ...base, ticketId: DR, targetId: A, label: 'Next' }); // draft -> published
      expect(f.batches[1]![0]).toMatchObject({ entity: { id: DR }, payload: { kind: 'leads_to', targetId: A, label: 'Next' } });
      expect((f.batches[1]![0]!['payload'] as Record<string, unknown>)['from']).toBeUndefined();
      await tool(f.session).handler({ ...base, kind: 'blocks', ticketId: A, targetId: B }); // control: published -> published, plain on A
      expect(f.batches[2]![0]).toMatchObject({ entity: { id: A }, payload: { kind: 'blocks', targetId: B } });
      expect((f.batches[2]![0]!['payload'] as Record<string, unknown>)['from']).toBeUndefined();
    });
  });

  describe('29.375 get_ticket.links carries the label', () => {
    it('29.375 a leads_to row keeps its label; a blocks row has none', async () => {
      const f = fakeFlow({ [`${tw}/${D}`]: detail({ typeId: 'decision' }), [`${tw}/${D}/links`]: { links: [row('leads_to', 'out', A, 'Yes'), row('blocks', 'out', B)] } });
      const getTicket = readTools(f.session).find((t) => t.name === 'get_ticket')!;
      const out = (await getTicket.handler({ workspaceId: WS, ticketId: D })) as { links: Array<{ kind: string; label?: string }> };
      expect(out.links.find((l) => l.kind === 'leads_to')?.label).toBe('Yes');
      expect('label' in out.links.find((l) => l.kind === 'blocks')!).toBe(false); // control
    });
  });

  describe('29.376 link_tickets: remove and relabel file on the stored source', () => {
    const LOOP_A = { links: [row('leads_to', 'out', B, 'Yes'), row('leads_to', 'in', B)] }; // A -> B and B -> A
    const LOOP_B = { links: [row('leads_to', 'out', A), row('leads_to', 'in', A, 'Yes')] };
    const remove = { workspaceId: WS, kind: 'leads_to', action: 'remove' } as const;

    it('29.376 a two-ticket loop: remove (A, B) files on A, (B, A) on B; an incoming-only link is removed from the other stream', async () => {
      const f = fakeFlow({ ...ENDS, [`${tw}/${A}/links`]: LOOP_A, [`${tw}/${B}/links`]: LOOP_B });
      await tool(f.session).handler({ ...remove, ticketId: A, targetId: B });
      expect(f.batches[0]![0]).toMatchObject({ type: 'ticket.link_removed', entity: { id: A }, payload: { kind: 'leads_to', targetId: B } });
      await tool(f.session).handler({ ...remove, ticketId: B, targetId: A });
      expect(f.batches[1]![0]).toMatchObject({ type: 'ticket.link_removed', entity: { id: B }, payload: { kind: 'leads_to', targetId: A } });
      const incoming = fakeFlow({ ...ENDS, [`${tw}/${A}/links`]: { links: [row('leads_to', 'in', B)] } });
      await tool(incoming.session).handler({ ...remove, ticketId: A, targetId: B }); // stored B -> A
      expect(incoming.batches[0]![0]).toMatchObject({ entity: { id: B }, payload: { kind: 'leads_to', targetId: A } });
      await expect(tool(fakeFlow({ ...ENDS, [`${tw}/${A}/links`]: { links: [] } }).session).handler({ ...remove, ticketId: A, targetId: B }))
        .rejects.toThrow(`no "leads_to" link between ${A} and ${B} that you can see`);
    });

    const relabel = { workspaceId: WS, kind: 'leads_to', action: 'relabel' } as const;
    const DEC_LINKS = { links: [row('leads_to', 'out', A, 'Yes'), row('leads_to', 'out', B, 'No')] };

    it('29.376 relabel is one batch [link_removed, link_added] after its pre-checks; control: a free label commits both', async () => {
      const f = fakeFlow({ ...ENDS, [`${tw}/${D}/links`]: DEC_LINKS });
      await tool(f.session).handler({ ...relabel, ticketId: D, targetId: A, label: 'Approved' });
      expect(f.batches).toHaveLength(1);
      expect(f.batches[0]!.map((e) => [e['type'], (e['payload'] as Record<string, unknown>)['label'] ?? null])).toEqual([['ticket.link_removed', null], ['ticket.link_added', 'Approved']]);
      for (const e of f.batches[0]!) expect(e).toMatchObject({ origin: 'mcp', entity: { id: D } });
      // pre-checks send nothing
      for (const [label, why] of [['Yes', 'already has this label'], ['no', 'already labelled "no"']] as const) {
        await expect(tool(f.session).handler({ ...relabel, ticketId: D, targetId: A, label })).rejects.toThrow(why);
      }
      expect(f.batches, 'pre-checks sent nothing').toHaveLength(1);
      await expect(tool(f.session).handler({ ...relabel, kind: 'blocks', ticketId: D, targetId: A, label: 'x' })).rejects.toThrow('label only applies');
      await expect(tool(f.session).handler({ ...relabel, ticketId: D, targetId: A })).rejects.toThrow('relabel needs kind "leads_to" and the new label');
    });

    it('29.376 a refused add after a committed remove puts the old link back; if that is refused too, the error names the label to re-add', async () => {
      const refuse = { status: 'refused', eventId: 'e', rule: 'link.label-duplicate', reason: 'Another branch already has this label.' };
      const putBack = fakeFlow({ ...ENDS, [`${tw}/${D}/links`]: DEC_LINKS }, { results: (i) => (i === 0 ? [COMMITTED, refuse] : undefined) });
      await expect(tool(putBack.session).handler({ ...relabel, ticketId: D, targetId: A, label: 'Approved' }))
        .rejects.toThrow('event 1 refused by link.label-duplicate: Another branch already has this label. The previous link was put back, so nothing changed.');
      expect(putBack.batches).toHaveLength(2);
      expect(putBack.batches[1]).toHaveLength(1);
      expect(putBack.batches[1]![0]).toMatchObject({ type: 'ticket.link_added', entity: { id: D }, payload: { kind: 'leads_to', targetId: A, label: 'Yes' } });

      const stuck = fakeFlow({ ...ENDS, [`${tw}/${D}/links`]: DEC_LINKS }, { results: (i) => (i === 0 ? [COMMITTED, refuse] : [refuse]) });
      await expect(tool(stuck.session).handler({ ...relabel, ticketId: D, targetId: A, label: 'Approved' }))
        .rejects.toThrow('could NOT be put back: add it again with link_tickets (action "add", label "Yes")');
    });
  });
  ```
  `packages/mcp-server/test/flow-tools.test.ts` (29.377 and 29.378):
  ```ts
  import { describe, expect, it } from 'vitest';
  import { flowTools } from '../src/tools/flow-tools.js';
  import { ticketTools } from '../src/tools/ticket-tools.js';
  import { writeTools } from '../src/tools/write-tools.js';
  import { ME, WS, fakeFlow, ulid } from './fixtures/flow-fixtures.js';

  const T = ulid('TKT');
  const P = ulid('PRJ');
  const find = <X extends { name: string }>(tools: X[], name: string): X => {
    const t = tools.find((x) => x.name === name);
    if (t === undefined) throw new Error(`no tool named ${name}`);
    return t;
  };

  describe('29.377 set_wait_for_all', () => {
    it('29.377 on files true, off files null (never false); update_ticket points at the tool; control: a custom field still passes', async () => {
      const f = fakeFlow();
      const wait = find(flowTools(f.session), 'set_wait_for_all');
      await wait.handler({ workspaceId: WS, ticketId: T, value: true });
      await wait.handler({ workspaceId: WS, ticketId: T, value: false });
      expect(f.batches.map((b) => b[0])).toMatchObject([
        { type: 'ticket.field_set', origin: 'mcp', actorId: ME, entity: { id: T }, payload: { fieldId: 'waitForAll', value: true } },
        { type: 'ticket.field_set', payload: { fieldId: 'waitForAll', value: null } },
      ]);
      await expect(wait.handler({ workspaceId: WS, ticketId: T, value: 'yes' })).rejects.toThrow();
      expect(f.batches).toHaveLength(2);
      const update = find(ticketTools(f.session), 'update_ticket');
      await expect(update.handler({ workspaceId: WS, ticketId: T, fields: { waitForAll: true } })).rejects.toThrow('"waitForAll" is a built-in field: use the set_wait_for_all tool');
      await expect(update.handler({ workspaceId: WS, ticketId: T, fields: { title: 'x' } })).rejects.toThrow('"title" is a built-in field: use the title argument');
      expect(f.batches, 'refusals send nothing').toHaveLength(2);
      await update.handler({ workspaceId: WS, ticketId: T, fields: { region: 'south' } }); // control
      expect(f.batches[2]![0]).toMatchObject({ payload: { fieldId: 'region', value: 'south' } });
    });
  });

  describe('29.378 estimate and reworkEstimate', () => {
    it('29.378 create carries estimate in ticket.created, absent when omitted; update files field_set, null clears', async () => {
      const f = fakeFlow();
      const create = find(writeTools(f.session), 'create_ticket');
      const base = { workspaceId: WS, projectId: P, typeId: 'task', title: 'Pitch' };
      await create.handler({ ...base, estimate: 3 });
      await create.handler(base);
      expect((f.batches[0]![0]!['payload'] as Record<string, unknown>)['estimate']).toBe(3);
      expect('estimate' in (f.batches[1]![0]!['payload'] as Record<string, unknown>)).toBe(false);
      const update = find(ticketTools(f.session), 'update_ticket');
      await update.handler({ workspaceId: WS, ticketId: T, estimate: 5, reworkEstimate: 2 });
      await update.handler({ workspaceId: WS, ticketId: T, estimate: null, reworkEstimate: null });
      expect(f.batches[2]!.map((e) => (e['payload'] as Record<string, unknown>))).toEqual([{ fieldId: 'estimate', value: 5 }, { fieldId: 'reworkEstimate', value: 2 }]);
      expect(f.batches[3]!.map((e) => (e['payload'] as Record<string, unknown>)['value'])).toEqual([null, null]);
    });

    it('29.378 0, 366 and 2.5 are refused unsent; 1 and 365 pass; estimate and reworkEstimate are built-ins for `fields`', async () => {
      const f = fakeFlow();
      const update = find(ticketTools(f.session), 'update_ticket');
      const create = find(writeTools(f.session), 'create_ticket');
      for (const bad of [0, 366, 2.5]) {
        await expect(update.handler({ workspaceId: WS, ticketId: T, estimate: bad })).rejects.toThrow();
        await expect(update.handler({ workspaceId: WS, ticketId: T, reworkEstimate: bad })).rejects.toThrow();
        await expect(create.handler({ workspaceId: WS, projectId: P, typeId: 'task', title: 'x', estimate: bad })).rejects.toThrow();
      }
      expect(f.batches, 'refused by the schema, nothing sent').toEqual([]);
      for (const good of [1, 365]) await update.handler({ workspaceId: WS, ticketId: T, estimate: good }); // control
      expect(f.batches).toHaveLength(2);
      await expect(update.handler({ workspaceId: WS, ticketId: T, fields: { estimate: 3 } })).rejects.toThrow('"estimate" is a built-in field: use the estimate argument');
      await expect(update.handler({ workspaceId: WS, ticketId: T, fields: { reworkEstimate: 3 } })).rejects.toThrow('"reworkEstimate" is a built-in field: use the reworkEstimate argument');
    });
  });
  ```
  Run (LOCAL): `/Users/kiro/my_projects/gisik-nokma-lanes/slot-run.sh wtg5-t1-red -- pnpm --filter @gisik-nokma/mcp-server exec vitest run test/link-tools.test.ts test/flow-tools.test.ts --maxWorkers=2 > /tmp/wtg5-t1-red.log 2>&1; tail -40 /tmp/wtg5-t1-red.log`.
  Expected: FAIL (`flow-tools.js` and `link-events.js` do not exist; `estimate` is not in the schemas).

- [ ] **Step 4: Implement**

  **`flow-seams.ts`** (T1 adds the first export; T2 to T5 append):
  ```ts
  /**
   * THE SEAM FILE. Every route, wire shape and field name that Graph Parts 2 to 4 and the Drafts plan own is spelled
   * here and nowhere else in `packages/mcp-server`. A name that differs on the landed code is fixed in this file;
   * a piece that is MISSING is not built here (see the plan's Global Constraints).
   */

  /** Drafts T4 (G7): the server's ticket detail of the author's own draft carries `ticketState.draft = {authorId, at}` (probe S2). A published ticket has no such member. */
  export function isDraftDetail(detail: { ticketState?: { draft?: unknown } }): boolean {
    return detail.ticketState?.draft !== undefined && detail.ticketState.draft !== null;
  }
  ```

  **`link-events.ts`:**
  ```ts
  import type { SubmittedEvent, TicketLinkKind } from '@gisik-nokma/domain';
  import type { Session } from '../session.js';
  import { envelopeFor } from './submit.js';

  /** One row of `GET …/tickets/:id/links` (typed-links T4, `label` from Graph Part 2). */
  export type LinkRow = { kind: string; direction: 'out' | 'in'; label?: string | null; ticket: { id: string; key?: string | null; title?: string | null } };
  export type LinkEnd = { id: string; draft: boolean };
  export type LinkSpec = { kind: TicketLinkKind; source: LinkEnd; target: LinkEnd; label?: string | undefined };
  export type ResultLike = { status: string; rule?: string; reason?: string; code?: string; message?: string };

  const fold = (s: string): string => s.trim().toLowerCase();

  /**
   * The ONE place that decides which stream a link event goes on (Drafts R42, R43). A link that touches a draft lives on
   * the DRAFT's stream: a draft source files as always; a published source and a draft target file on the draft's stream
   * with `targetId` = the draft and `from` = the source. A plain form on a published stream naming a draft is refused
   * `draft.link-form`. `link_removed` carries no label (LK-2); a label rides `link_added` only.
   */
  export function linkEvent(session: Session, workspaceId: string, type: 'ticket.link_added' | 'ticket.link_removed', spec: LinkSpec): SubmittedEvent {
    const onDraft = spec.target.draft && !spec.source.draft;
    const payload: Record<string, unknown> = { kind: spec.kind, targetId: spec.target.id };
    if (onDraft) payload['from'] = spec.source.id;
    if (type === 'ticket.link_added' && spec.label !== undefined) payload['label'] = spec.label;
    return envelopeFor(session, workspaceId, { kind: 'ticket', id: onDraft ? spec.target.id : spec.source.id }, type, payload);
  }

  /**
   * The stored link between `ticketId` and `otherId`. When BOTH directions of a `leads_to` are stored (a two-ticket loop,
   * which Graph Part 2 allows) the outgoing one wins: `remove (A, B)` removes A→B. To remove B→A, call with B first.
   */
  export function pickLink(links: readonly LinkRow[], kind: string, otherId: string): LinkRow | undefined {
    const same = links.filter((l) => l.kind === kind && l.ticket.id === otherId);
    return same.find((l) => l.direction === 'out') ?? same[0];
  }

  /** A result in the words `submitBatch` uses (`submit.ts:49-50`), for the places this file reads results itself. */
  export function describeResult(r: ResultLike | undefined, index: number): string {
    if (r === undefined) return `event ${index} has no result`;
    if (r.status === 'refused') return `event ${index} refused by ${r.rule}: ${(r.reason ?? '').replace(/\.$/, '')}`;
    if (r.status === 'invalid') return `event ${index} ${r.code}: ${r.message}`;
    return `event ${index} ${r.status}`;
  }

  /**
   * Relabel = remove + add (LK-4). The event door commits each event in its own transaction and goes ON after a refusal
   * (`apps/server/src/ingest/ingest-service.ts:432-445`), so a refused add leaves the remove standing and the link gone.
   * Three pre-checks make that rare (not blank, not the current label, not another outgoing branch's label); the race that
   * remains (another writer between the read and the write) is compensated: the old link is added back, and if even that
   * is refused the error says which label to re-add.
   */
  export async function relabelStored(
    session: Session,
    workspaceId: string,
    stored: LinkSpec,
    otherLabels: readonly string[],
    newLabel: string,
  ): Promise<unknown[]> {
    if (stored.label === newLabel) throw new Error('the link already has this label');
    if (otherLabels.some((l) => fold(l) === fold(newLabel))) throw new Error(`another branch of this ticket is already labelled "${newLabel}"`);
    const body = (await session.postEvents([
      linkEvent(session, workspaceId, 'ticket.link_removed', stored),
      linkEvent(session, workspaceId, 'ticket.link_added', { ...stored, label: newLabel }),
    ])) as { results: ResultLike[] };
    if (body.results.length !== 2) throw new Error('gisik-nokma answered a different number of results than events sent');
    const [removed, added] = body.results;
    if (removed?.status === 'committed' && added?.status === 'committed') return body.results;
    if (removed?.status === 'committed') {
      const back = (await session.postEvents([linkEvent(session, workspaceId, 'ticket.link_added', stored)])) as { results: ResultLike[] };
      const restored = back.results[0]?.status === 'committed';
      throw new Error(
        `${describeResult(added, 1)}. ` +
          (restored
            ? 'The previous link was put back, so nothing changed.'
            : `The previous link could NOT be put back: add it again with link_tickets (action "add", label "${stored.label ?? ''}").`),
      );
    }
    throw new Error(`${describeResult(removed, 0)}.${added?.status === 'committed' ? ' The link with the new label was added.' : ''}`);
  }
  ```
  `describeResult` trims the reason's final full stop, so the compensation message reads as one sentence pair (the test above pins it).

  **`ticket-tools.ts`:**
  - Imports: `import { PRIORITIES, TICKET_LINK_KINDS, estimateValueSchema, rankBetween } from '@gisik-nokma/domain';`, `import { isDraftDetail } from './flow-seams.js';`, `import { linkEvent, pickLink, relabelStored, type LinkEnd, type LinkRow } from './link-events.js';`.
  - Widen the detail type (additive; nothing else reads these):
    ```ts
    export type TicketDetailWire = {
      key: string | null;
      title: string;
      ticketState: {
        draft?: { authorId: string; at: string; discarded?: true };
        fields: Record<string, { value: unknown }>; rank?: string | null; workflowId: string;
        typeId?: string; stateId?: string; stateCategory?: string; workflowVersion?: number; parentId?: string | null;
        outcome?: string | null; links?: Array<{ kind: string; targetId: string; label?: string | null }>;
      };
      rollup?: { totalChildren?: number } | null;
    };
    ```
  - Do NOT touch `BUILT_IN` (`:19`): Part 2 added `estimate`, `waitForAll`, `reworkEstimate` (ES-1a). The test above fails if it did not. Change only the message, below.
  - `updateShape` (`:31-38`) gains, after `dueDate`: `estimate: estimateValueSchema.nullable().optional(), reworkEstimate: estimateValueSchema.nullable().optional(),`.
  - The built-in loop (`:84-86`) becomes:
    ```ts
        for (const key of Object.keys(a.fields ?? {})) {
          if (BUILT_IN.has(key)) throw new Error(`"${key}" is a built-in field: use ${key === 'waitForAll' ? 'the set_wait_for_all tool' : `the ${key} argument`}`);
        }
    ```
  - After the `dueDate` line (`:98`): `if (a.estimate !== undefined) events.push(set('estimate', a.estimate)); if (a.reworkEstimate !== undefined) events.push(set('reworkEstimate', a.reworkEstimate));` (a `null` clears, like `startDate`). Add `estimate` and `reworkEstimate` to the tool's description sentence: "estimate / reworkEstimate (whole days 1–365, null clears)".
  - `link_tickets`: replace the handler body typed-links T4 wrote (re-read it first and keep its description sentences about the kinds). Graph Part 2 T2 narrowed both schemas to a local `LINK_TICKETS_KINDS` (every kind but `leads_to`, with a comment naming Part 5): delete that constant and its comment here, so `z.enum(TICKET_LINK_KINDS)` below is the only kind list:
    ```ts
    const label = z.string().trim().min(1).max(60).optional();
    const linkShape = {
      workspaceId: id, ticketId: id, targetId: id,
      kind: z.enum(TICKET_LINK_KINDS), action: z.enum(['add', 'remove', 'relabel']), label,
    };
    ```
    ```ts
        {
          name: 'link_tickets',
          description:
            'Add, remove or relabel a typed link between two tickets: kind "blocks" (ticketId blocks targetId), "relates" (either way), "duplicates" ' +
            '(ticketId duplicates the original, targetId) or "leads_to" (ticketId leads to targetId: an arrow in the flow; a Decision\'s arrows each need a `label`, ' +
            'the outcome that sends the flow that way, 1–60 characters). action "add", "remove" or "relabel" (leads_to only, with the new `label`). ' +
            'Removing works from either end; if a loop stores both directions between two tickets, the one leaving ticketId is removed. ' +
            'A link to or from one of your drafts lives on the draft and is private to you until it is published. Every rule is the product\'s.',
          inputSchema: linkShape,
          handler: async (args) => {
            const a = z.object(linkShape).parse(args);
            if (a.label !== undefined && a.kind !== 'leads_to') throw new Error('label only applies to "leads_to" links');
            if (a.action === 'remove' && a.label !== undefined) throw new Error('remove takes no label: it removes the link between the two tickets');
            const endOf = async (ticketId: string): Promise<LinkEnd> => ({ id: ticketId, draft: isDraftDetail(await readTicket(session, a.workspaceId, ticketId)) });
            const linksOf = async (ticketId: string): Promise<LinkRow[]> => {
              try {
                return ((await session.get(`/v1/workspaces/${enc(a.workspaceId)}/tickets/${enc(ticketId)}/links`)) as { links: LinkRow[] }).links;
              } catch (error) {
                if (error instanceof HttpError && error.status === 404) throw new Error('ticket not found or not visible to you');
                throw error;
              }
            };
            if (a.action === 'add') {
              const [source, target] = await Promise.all([endOf(a.ticketId), endOf(a.targetId)]);
              return { result: await submitOne(session, linkEvent(session, a.workspaceId, 'ticket.link_added', { kind: a.kind, source, target, label: a.label })) };
            }
            const newLabel = a.label;
            if (a.action === 'relabel' && (a.kind !== 'leads_to' || newLabel === undefined)) throw new Error('relabel needs kind "leads_to" and the new label');
            const links = await linksOf(a.ticketId);
            const found = pickLink(links, a.kind, a.targetId);
            if (found === undefined) throw new Error(`no "${a.kind}" link between ${a.ticketId} and ${a.targetId} that you can see`);
            // The stored source decides the stream (spec A §2.2): find the link as the app shows it.
            const [sourceId, targetId] = found.direction === 'out' ? [a.ticketId, a.targetId] : [a.targetId, a.ticketId];
            const [source, target] = await Promise.all([endOf(sourceId), endOf(targetId)]);
            const stored = { kind: a.kind, source, target, label: found.label ?? undefined };
            if (a.action === 'remove') return { result: await submitOne(session, linkEvent(session, a.workspaceId, 'ticket.link_removed', stored)) };
            const sourceLinks = sourceId === a.ticketId ? links : await linksOf(sourceId);
            const others = sourceLinks
              .filter((l) => l.kind === 'leads_to' && l.direction === 'out' && l.ticket.id !== targetId)
              .map((l) => l.label ?? '')
              .filter((l) => l !== '');
            return { results: await relabelStored(session, a.workspaceId, stored, others, newLabel as string) };
          },
        },
    ```
  - Add `import { submitOne } from './submit.js'` to the existing `./submit.js` import if typed-links did not (`submit.ts:20`).

  **`write-tools.ts`:** `import { …, estimateValueSchema } from '@gisik-nokma/domain'`; `birthShape` gains `estimate: estimateValueSchema.optional(),` (one line; Drafts and sweep 2 add theirs beside it); in the `ticket.created` payload, after the `dueDate` spread (`:86`): `...(a.estimate === undefined ? {} : { estimate: a.estimate }),`. The description gains "`estimate` (whole days 1–365)".

  **`read-tools.ts` `get_ticket`:** add nothing. Graph Part 2 T2 (case 29.126) owns the `label` spread on each links row (`...(l.label === undefined || l.label === null ? {} : { label: l.label })`); confirm it landed with `grep -n "label" packages/mcp-server/src/tools/read-tools.ts`, and if it is absent STOP and tell the planner (Part 2 T2 has not landed) rather than adding a second copy. The 29.375 test below is this plan's consumer check. (T2 adds the flow facts to the same handler.)

  **`flow-tools.ts`:**
  ```ts
  import { z } from 'zod';
  import type { Session } from '../session.js';
  import type { ToolDefinition } from './read-tools.js';
  import { envelopeFor, submitOne } from './submit.js';

  const id = z.string().min(1);

  /**
   * The Workflow / Timeline graph tools (Graph Part 5). One module, five tools, appended one per task:
   * set_wait_for_all (T1), get_flow (T2), get_timeline (T3), resolve_decision (T4), publish_flow (T5).
   * Every write is a visible, attributed (`origin: 'mcp'`) and removable act (rule D2).
   */
  export function flowTools(session: Session): ToolDefinition[] {
    return [
      {
        name: 'set_wait_for_all',
        description:
          'Turn "wait for all incoming" on or off for a ticket in a flow. Off (the default): the ticket moves from Backlog to its first status as soon as ANY ticket that leads to it ' +
          'is done. On: it waits until ALL of them are done (a branch a Decision did not take does not count). Turn it off again with value false. update_ticket cannot set it.',
        inputSchema: { workspaceId: id, ticketId: id, value: z.boolean() },
        handler: async (args) => {
          const a = z.object({ workspaceId: id, ticketId: id, value: z.boolean() }).parse(args);
          const event = envelopeFor(session, a.workspaceId, { kind: 'ticket', id: a.ticketId }, 'ticket.field_set', { fieldId: 'waitForAll', value: a.value ? true : null });
          return { result: await submitOne(session, event) };
        },
      },
    ];
  }
  ```

  **`register.ts`:** `import { flowTools } from './flow-tools.js';` and `...flowTools(session),` as the LAST element of `allTools`, after whatever the tip lists last; update the docblock's list by one clause.

  **Pins (re-derive every count from the tip):**
  - `tool-names.ts`: after the last block the tip has, add
    ```ts
      flow: [
        // flow begin (wtg-part5 T1 to T5)
        'set_wait_for_all',
        // flow end
      ],
    ```
  - `tool-sweep.ts`, after the last block: `// flow begin` / `set_wait_for_all: { args: { workspaceId: 'w', ticketId: 't', value: true } },` / `// flow end`.
  - `register.test.ts` 14.555: append `'set_wait_for_all',` on its own line after the last name the tip's `FINAL` lists; set `toHaveLength` and the `it(…)` title to the new count. Count it: `grep -c "'" ` is not a count; run `allTools` in a scratch test, or count the list. Never copy a number.
  - `test-cases/14-mcp-server.md` (the `14.555` line) and `Features.md` (grep `-i 'sixty-three\|63 tools'`): update the spelled count to the new total.

  Run (LOCAL): `/Users/kiro/my_projects/gisik-nokma-lanes/slot-run.sh wtg5-t1-green -- pnpm --filter @gisik-nokma/mcp-server exec vitest run --maxWorkers=2 > /tmp/wtg5-t1-green.log 2>&1; tail -40 /tmp/wtg5-t1-green.log`.
  Expected: PASS, including 14.80, 14.81, 14.555, 14.88 (the sweep reaches `set_wait_for_all`) and the existing `update_ticket` / `link_tickets` cases. Flip 29.375–29.378 ✅ under the anchor.

  Commit: `wtg-part5 T1: link_tickets leads_to/label/relabel (draft aware), set_wait_for_all, estimate`.

- [ ] **Step 5: The hosted round trip and the door rows**

  `apps/server/test/mcp/mcp-flow.test.ts`:
  ```ts
  import { afterAll, beforeAll, describe, expect, it } from 'vitest';
  import { NOT_A_MEMBER_REASON, PERMISSION_ROLE_RULE } from '../../src/permissions/check-permission.js';
  import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
  import { runDoorMatrix } from './helpers/door-matrix.js';
  import { buildDoorWorld, callTool, mk, ok } from './helpers/flow-world.js';

  /** Graph Part 5, hosted door. Every call is a `tools/call` on `POST /mcp`. Run LOCALLY. */
  let db: TestDatabase;
  beforeAll(async () => { db = await createTestDatabase(); });
  afterAll(async () => { await db.drop(); });

  describe('29.375–29.378 the simple writes through the hosted door', () => {
    it('29.375 29.376 a labelled arrow, a relabel, a loop removed from the right end; every event origin mcp', async () => {
      const w = await buildDoorWorld(db, '3753');
      const decision = await mk(w, w.owner, 'Client decides', { typeId: 'decision' });
      const yes = await mk(w, w.owner, 'Pitch');
      const no = await mk(w, w.owner, 'Rework');
      const link = (args: Record<string, unknown>) => ok(w, w.owner, 'link_tickets', { workspaceId: w.workspaceId, kind: 'leads_to', ...args });
      await link({ ticketId: decision, targetId: yes, action: 'add', label: 'Yes' });
      await link({ ticketId: decision, targetId: no, action: 'add', label: 'No' });
      const refused = await callTool(w.app, w.owner.token, 'link_tickets', { workspaceId: w.workspaceId, kind: 'leads_to', ticketId: decision, targetId: w.ticketId, action: 'add' });
      expect(refused.isError).toBe(true);
      expect(refused.text).toContain('refused by link.label-required'); // control: the labelled adds above committed
      await link({ ticketId: decision, targetId: yes, action: 'relabel', label: 'Approved' });
      const got = (await ok(w, w.owner, 'get_ticket', { workspaceId: w.workspaceId, ticketId: decision })) as { links: Array<{ kind: string; direction: string; label?: string; ticket: { id: string } }> };
      expect(got.links.find((l) => l.ticket.id === yes)?.label).toBe('Approved');
      expect(got.links.find((l) => l.ticket.id === no)?.label).toBe('No');
      // a loop: yes -> decision as well; removing (yes, decision) must not touch decision -> yes
      await link({ ticketId: yes, targetId: decision, action: 'add' });
      await link({ ticketId: yes, targetId: decision, action: 'remove' });
      const after = (await ok(w, w.owner, 'get_ticket', { workspaceId: w.workspaceId, ticketId: decision })) as { links: Array<{ direction: string; ticket: { id: string } }> };
      expect(after.links.some((l) => l.direction === 'out' && l.ticket.id === yes)).toBe(true);
      expect(after.links.some((l) => l.direction === 'in' && l.ticket.id === yes)).toBe(false);
      const origins = await db.pool.query<{ origin: string }>(`SELECT DISTINCT origin FROM events WHERE entity_id = $1 AND type LIKE 'ticket.link_%'`, [decision]);
      expect(origins.rows.map((r) => r.origin)).toEqual(['mcp']);
    });

    it('29.377 29.378 wait-for-all and estimate are claims in the History, attributed to mcp, and clear', async () => {
      const w = await buildDoorWorld(db, '3754');
      const t = await mk(w, w.owner, 'Plan', { estimate: 3 });
      await ok(w, w.owner, 'set_wait_for_all', { workspaceId: w.workspaceId, ticketId: t, value: true });
      await ok(w, w.owner, 'update_ticket', { workspaceId: w.workspaceId, ticketId: t, estimate: 5, reworkEstimate: 2 });
      await ok(w, w.owner, 'set_wait_for_all', { workspaceId: w.workspaceId, ticketId: t, value: false });
      await ok(w, w.owner, 'update_ticket', { workspaceId: w.workspaceId, ticketId: t, estimate: null, reworkEstimate: null });
      const history = (await ok(w, w.owner, 'get_ticket_history', { ticketId: t })) as { events: Array<{ type: string; origin: string; payload: { fieldId?: string; value?: unknown } }> };
      const fieldSets = history.events.filter((e) => e.type === 'ticket.field_set').map((e) => [e.payload.fieldId, e.payload.value, e.origin]);
      expect(fieldSets).toEqual(expect.arrayContaining([['waitForAll', true, 'mcp'], ['waitForAll', null, 'mcp'], ['estimate', 5, 'mcp'], ['estimate', null, 'mcp'], ['reworkEstimate', null, 'mcp']]));
    });

    it('29.375 29.377 door rows: a stranger is answered uniformly, a member may', async () => {
      const w = await buildDoorWorld(db, '3755');
      const NOT_MEMBER = `refused by ${PERMISSION_ROLE_RULE}: ${NOT_A_MEMBER_REASON}`;
      await runDoorMatrix(w, [
        { tool: 'link_tickets', args: (x) => ({ workspaceId: x.workspaceId, ticketId: x.ticketId, targetId: x.secondTicketId, kind: 'leads_to', action: 'add' }), stranger: 'ticket not found or not visible to you', allowed: { caller: 'member', eventType: 'ticket.link_added' } },
        { tool: 'set_wait_for_all', args: (x) => ({ workspaceId: x.workspaceId, ticketId: x.ticketId, value: true }), stranger: NOT_MEMBER, allowed: { caller: 'member', eventType: 'ticket.field_set' } },
      ]);
    });
  });
  ```
  Run (LOCAL): `/Users/kiro/my_projects/gisik-nokma-lanes/slot-run.sh wtg5-t1-hosted -- pnpm --filter @gisik-nokma/server exec vitest run test/mcp/mcp-flow.test.ts test/mcp/flow-seams.test.ts test/mcp/mcp-tickets.test.ts test/mcp/mcp-http.test.ts --maxWorkers=2 > /tmp/wtg5-t1-hosted.log 2>&1; tail -40 /tmp/wtg5-t1-hosted.log`.
  Expected: PASS (14.262 compares the hosted list to `allTools`, so it follows the new tool).
  If the stranger sentence for `link_tickets` differs (the hosted door may answer the permission refusal first), copy the observed sentence into the row and say so in the handoff; the rule is "uniform and not an oracle".

- [ ] **Step 6: Features, sweeps, mutations, DONE**
  - **Features:** replace `<!-- wtg-part5-mcp T1 bullet -->` with `- ✅ **MCP: leads_to links, wait-for-all and estimates** (Graph Part 5 T1; `packages/mcp-server/src/tools/link-events.ts`, `ticket-tools.ts`, `flow-tools.ts`, `write-tools.ts`) — …`. Name: `link_tickets` takes `leads_to` with a label, relabels in one batch with a put-back when the add is refused, removes the outgoing edge of a loop, and files links that touch a draft on the draft's stream; `set_wait_for_all`; `estimate` / `reworkEstimate` on create and update. Cases 29.375–29.378.
  - **Checks:** `node scripts/check-case-ids.mjs`, `pnpm check:citations`, `pnpm check:tasks`.
  - **Sweeps (LOCAL):** mcp-server WHOLE; server `test/mcp` WHOLE; `packages/app-core/test/copy/ui-copy.test.ts` (no spaced em dash in the new strings).
  - **Mutations:** as named on each case line (run them; a survivor means the test does not guard what its line says).

  Push. DONE.

---

### Task 2: `get_flow` and the flow facts on `get_ticket` (cases 29.379–29.381)

**Branch:** `task/wtg-part5-t2-get-flow` from `origin/release/workflow-graph`; PR `--base release/workflow-graph`. Starts after T1 has landed.

**Files:**
- Create:
  - `packages/mcp-server/src/tools/flow-answer.ts`
  - `packages/mcp-server/src/tools/ticket-flow-facts.ts`
  - `packages/mcp-server/test/flow-get-tools.test.ts`
- Modify:
  - `packages/mcp-server/src/tools/flow-seams.ts` (append `FLOW_PATH`, `flowNodeSchema`, `flowWireSchema`, `FlowWire`, `parseWire`)
  - `packages/mcp-server/src/tools/flow-tools.ts` (append `get_flow` after `set_wait_for_all`)
  - `packages/mcp-server/src/tools/read-tools.ts` (`get_ticket`: `withFlowFacts`, description)
  - `packages/mcp-server/test/fixtures/flow-fixtures.ts` (append `flowNode`, `flowWire`)
  - Pins: `tool-names.ts`, `tool-sweep.ts`, `register.test.ts` (14.555), the two spelled counts
  - `apps/server/test/mcp/flow-seams.test.ts` (S4, S10), `apps/server/test/mcp/mcp-flow.test.ts`
  - Catalogue: `test-cases/29-…` under `<!-- wtg-part5-mcp T2 -->`, `Features.md` §26 under `<!-- wtg-part5-mcp T2 bullet -->`

**Interfaces:**
- **Consumes:** Graph Part 3's flow route (S4), the folded `ticketState` members of Part 2 (S10), T1's `flow-tools.ts`, `flow-fixtures.ts`, `flow-world.ts`.
- **Produces:**
  - `FLOW_PATH(workspaceId, ticketId): string`; `flowWireSchema` and `type FlowWire`;
  - `readFlow(session, workspaceId, ticketId): Promise<FlowWire>` and `toFlowAnswer(wire: FlowWire): FlowWire` (flow-answer.ts; `publish_flow` reuses both);
  - `withFlowFacts(session, workspaceId, state): Promise<{ state: Record<string, unknown>; facts: Record<string, unknown> }>`.

- [ ] **Step 1: The seam probes S10 and S4 (hosted, RED means STOP)**

  Append to `apps/server/test/mcp/flow-seams.test.ts` (inside the existing `describe`, or a second one):
  ```ts
    it('SEAM S10 (Graph Part 2): the folded ticketState carries outcome and passes after a decision', async () => {
      const w = await buildDoorWorld(db, '3761');
      const decision = await mk(w, w.owner, 'Client decides', { typeId: 'decision' });
      const next = await mk(w, w.owner, 'Pitch');
      await rawEvents(w, w.owner, [{ entityId: decision, type: 'ticket.link_added', payload: { kind: 'leads_to', targetId: next, label: 'Yes' } }]);
      const [decided] = await rawEvents(w, w.owner, [{ entityId: decision, type: 'ticket.decided', payload: { outcome: 'Yes' } }]);
      expect(decided?.status, `Part 2 DC-4: ${decided?.reason}`).toBe('committed');
      const res = await w.app.inject({ method: 'GET', url: `/v1/workspaces/${w.workspaceId}/tickets/${decision}`, headers: { authorization: `Bearer ${w.owner.sessionToken}` } });
      const state = res.json<{ ticketState: { outcome?: string | null; passes?: unknown[] } }>().ticketState;
      expect(state.outcome, 'S10: ticketState.outcome').toBe('Yes');
      expect(state.passes?.length, 'S10: ticketState.passes').toBe(1);
    });

    it('SEAM S4 (Graph Part 3): the flow route answers every member get_flow reads, nodes in flow order', async () => {
      const w = await buildDoorWorld(db, '3762');
      const decision = await mk(w, w.owner, 'Client decides', { typeId: 'decision' });
      const next = await mk(w, w.owner, 'Pitch');
      await rawEvents(w, w.owner, [{ entityId: decision, type: 'ticket.link_added', payload: { kind: 'leads_to', targetId: next, label: 'Yes' } }]);
      const res = await w.app.inject({ method: 'GET', url: `/v1/workspaces/${w.workspaceId}/tickets/${decision}/flow`, headers: { authorization: `Bearer ${w.owner.sessionToken}` } });
      expect(res.statusCode, 'S4: the flow route exists').toBe(200);
      const flow = res.json<Record<string, unknown> & { nodes: Array<Record<string, unknown>>; edges: Array<Record<string, unknown>> }>();
      for (const k of ['flowId', 'truncated', 'start', 'end', 'nodes', 'edges', 'autoMoves', 'draftCount']) expect(flow, `S4 flow.${k}`).toHaveProperty(k);
      for (const k of ['id', 'key', 'draft', 'title', 'parentId', 'kind', 'state', 'assigneeId', 'waitForAll', 'estimate', 'reworkEstimate', 'round', 'outcome', 'passes', 'resolution', 'alternates', 'periods', 'planned', 'actual', 'tray', 'notes']) {
        expect(flow.nodes[0], `S4 node.${k}`).toHaveProperty(k);
      }
      for (const k of ['kind', 'from', 'to', 'label', 'loop', 'taken']) expect(flow.edges[0], `S4 edge.${k}`).toHaveProperty(k);
      expect(flow.nodes.map((n) => n['id']), 'S4: the Decision precedes what it leads to (flow order)').toEqual([decision, next]);
      // a ticket in no flow: 200, and its only node is itself (the T5 cases and door rows call the route on unconnected tickets)
      const alone = await mk(w, w.owner, 'Alone');
      const lone = await w.app.inject({ method: 'GET', url: `/v1/workspaces/${w.workspaceId}/tickets/${alone}/flow`, headers: { authorization: `Bearer ${w.owner.sessionToken}` } });
      expect(lone.statusCode, 'S4: an unconnected ticket has a flow of one').toBe(200);
      expect(lone.json<{ nodes: Array<{ id: string }> }>().nodes.map((n) => n.id)).toEqual([alone]);
    });
  ```
  Run (LOCAL): `…/slot-run.sh wtg5-t2-probe -- pnpm --filter @gisik-nokma/server exec vitest run test/mcp/flow-seams.test.ts --maxWorkers=2 > /tmp/wtg5-t2-probe.log 2>&1; tail -40 /tmp/wtg5-t2-probe.log`. Expected: PASS. A red probe is a STOP naming Part 2 or Part 3.
  Commit: `wtg-part5 T2: seam probes S4 S10`.

- [ ] **Step 2: Case lines and RED unit tests (29.379–29.381)**

  Case lines under `<!-- wtg-part5-mcp T2 -->`, all ❌:
  - `- ❌ **29.379 — `get_flow` answers the flow in the route's order with, per node, `state`, `waitForAll`, `estimate`, `reworkEstimate`, `round`, `outcome`, `passes` (each pass with its revisions), `resolution`, `alternates`, `periods`, `planned`, `actual`, `tray`, `notes`, and per edge `loop` and `taken`; the caller's own draft is a node with `key: null`;** control: a flow answer missing a member the tool reads fails with a sentence that names the member and says it is a server mismatch. Mutation: drop `passes` from the schema → the pass case reddens.`
  - `- ❌ **29.380 — every id that is not a visible node becomes `null` in `resolution.decisionTicketId`, `alternates[].viaDecisionId` / `firstTicketId`, `autoMoves[].becauseTicketId` and `parentId`, and an edge or auto move that names an unseen ticket is dropped: the serialised reply never contains the hidden id (hosted: a member who cannot see the Decision);** control: the same wire with the Decision among the nodes keeps every id, and the hosted owner sees them. Mutation: skip the `known()` pass → the hidden id appears.`
  - `- ❌ **29.381 — `get_ticket` lifts `passes` (a Decision), `round` and `periods` (round 2 or more) and a Not-taken `resolution` to the top level, removes them and `closed.cause` from `ticketState` (one representation), and shows the resolution's Decision only if the caller can read it (`decision: {id, key, title}` or `null`); `outcome` stays in `ticketState`; `list_ticket_types` lists the Decision type (hosted);** control: a round-1 ticket has no `round` / `periods`, and a visible Decision is named. Mutation: spread `ticketState` unfiltered → the hidden id appears.`

  Append to `packages/mcp-server/test/fixtures/flow-fixtures.ts`:
  ```ts
  import type { FlowWire } from '../../src/tools/flow-seams.js';

  type Node = FlowWire['nodes'][number];
  /** One flow node with every member a flow answer has, defaulting to a plain Backlog task. */
  export const flowNode = (id: string, over: Partial<Node> = {}): Node => ({
    id, key: `GN-${id.slice(-3)}`, draft: false, title: `Ticket ${id.slice(-3)}`, parentId: null, kind: 'ticket',
    state: { id: 'backlog', name: 'Backlog', category: 'open' }, assigneeId: null, waitForAll: false, estimate: null, reworkEstimate: null, round: 1,
    outcome: null, passes: [], resolution: null, alternates: [], periods: [], planned: [], actual: null, tray: null, notes: [], ...over,
  });
  export const flowWire = (nodes: Node[], over: Partial<FlowWire> = {}): FlowWire => ({
    flowId: 'f1', truncated: false, start: [nodes[0]!.id], end: [nodes.at(-1)!.id], nodes, edges: [], autoMoves: [], draftCount: nodes.filter((n) => n.draft).length, ...over,
  });
  ```
  `packages/mcp-server/test/flow-get-tools.test.ts`:
  ```ts
  import { describe, expect, it } from 'vitest';
  import { flowTools } from '../src/tools/flow-tools.js';
  import { readTools } from '../src/tools/read-tools.js';
  import { WS, detail, fakeFlow, flowNode, flowWire, ulid } from './fixtures/flow-fixtures.js';

  const D = ulid('DEC'); // the Decision
  const T1 = ulid('TK1'); // the loop target, in its second round
  const T2 = ulid('TK2'); // the branch not taken
  const DR = ulid('DRF'); // the caller's own draft
  const HIDDEN = ulid('HID'); // a ticket the caller cannot see
  const FLOW = `/v1/workspaces/${WS}/tickets/${T1}/flow`;
  const tool = (f: ReturnType<typeof fakeFlow>, name: string) => flowTools(f.session).find((t) => t.name === name)!;

  const PASSES = [
    { pass: 1, outcome: 'Needs rework', by: 'u1', at: '2026-10-02T10:00:00.000Z', revisions: [{ from: 'Approved', to: 'Needs rework', by: 'u1', at: '2026-10-02T11:00:00.000Z' }] },
    { pass: 2, outcome: 'Approved', by: 'u1', at: '2026-10-03T10:00:00.000Z', revisions: [] },
  ];
  const wire = () => flowWire(
    [
      flowNode(T1, { round: 2, periods: [{ start: '2026-10-01', end: '2026-10-02', pass: 1 }, { start: '2026-10-04', end: null, pass: 2 }], planned: [{ pass: 1, start: '2026-10-01', end: '2026-10-02', basis: 'explicit', pruned: false }] }),
      flowNode(D, { kind: 'decision', state: { id: 'done', name: 'Done', category: 'terminal' }, outcome: 'Approved', passes: PASSES }),
      flowNode(T2, { resolution: { kind: 'not-taken', decisionTicketId: D, outcome: 'Approved', pass: 2 }, alternates: [{ viaDecisionId: D, outcome: 'Needs rework', firstTicketId: T1 }] }),
      flowNode(DR, { draft: true, key: null, title: 'A draft step' }),
    ],
    {
      edges: [
        { kind: 'leads_to', from: T1, to: D, label: null, loop: false, taken: 0 },
        { kind: 'leads_to', from: D, to: T1, label: 'Needs rework', loop: true, taken: 1 },
        { kind: 'leads_to', from: D, to: T2, label: 'Approved', loop: false, taken: 1 },
      ],
      autoMoves: [{ ticketId: T2, at: '2026-10-03T10:00:00.000Z', kind: 'branch-not-taken', becauseTicketId: D, pass: 2 }],
    },
  );

  describe('29.379 get_flow', () => {
    it('29.379 answers passes with revisions, periods, resolution, alternates, loop and taken; the own draft has no key', async () => {
      const f = fakeFlow({ [FLOW]: wire() });
      const out = (await tool(f, 'get_flow').handler({ workspaceId: WS, ticketId: T1 })) as ReturnType<typeof wire>;
      expect(out.nodes.map((n) => n.id)).toEqual([T1, D, T2, DR]); // the route's order
      const decision = out.nodes.find((n) => n.id === D)!;
      expect(decision.passes.map((p) => [p.pass, p.outcome, p.revisions.length])).toEqual([[1, 'Needs rework', 1], [2, 'Approved', 0]]);
      expect(out.nodes.find((n) => n.id === T1)).toMatchObject({ round: 2, periods: [{ pass: 1 }, { pass: 2, end: null }] });
      expect(out.nodes.find((n) => n.id === T2)?.resolution).toEqual({ kind: 'not-taken', decisionTicketId: D, outcome: 'Approved', pass: 2 });
      expect(out.edges.find((e) => e.loop)).toMatchObject({ label: 'Needs rework', taken: 1 });
      expect(out.nodes.find((n) => n.id === DR)).toMatchObject({ draft: true, key: null });
      expect(out.draftCount).toBe(1);
    });

    it('29.379 a flow missing a member the tool reads fails by naming it; control: the complete wire passes', async () => {
      const broken = wire() as unknown as { nodes: Array<Record<string, unknown>> };
      delete broken.nodes[1]!['passes'];
      const bad = fakeFlow({ [FLOW]: broken });
      await expect(tool(bad, 'get_flow').handler({ workspaceId: WS, ticketId: T1 })).rejects.toThrow(/nodes\.1\.passes.*server/);
      await expect(tool(fakeFlow({ [FLOW]: wire() }), 'get_flow').handler({ workspaceId: WS, ticketId: T1 })).resolves.toBeTruthy();
      await expect(tool(fakeFlow({}), 'get_flow').handler({ workspaceId: WS, ticketId: T1 })).rejects.toThrow('ticket not found or not visible to you');
    });
  });

  describe('29.380 get_flow shows only what the caller can see', () => {
    it('29.380 an id outside the visible nodes is null, an edge or move naming it is dropped, and the hidden id is nowhere in the reply', async () => {
      const w = wire();
      w.nodes[2]!.resolution = { kind: 'not-taken', decisionTicketId: HIDDEN, outcome: 'Approved', pass: 2 };
      w.nodes[2]!.alternates = [{ viaDecisionId: HIDDEN, outcome: 'Needs rework', firstTicketId: HIDDEN }];
      w.nodes[2]!.parentId = HIDDEN;
      w.edges.push({ kind: 'leads_to', from: HIDDEN, to: T2, label: 'x', loop: false, taken: 0 });
      w.autoMoves.push({ ticketId: T2, at: '2026-10-03T10:00:00.000Z', kind: 'led-to', becauseTicketId: HIDDEN, pass: null }, { ticketId: HIDDEN, at: '2026-10-03T10:00:00.000Z', kind: 'led-to', becauseTicketId: T1, pass: null });
      const out = await tool(fakeFlow({ [FLOW]: w }), 'get_flow').handler({ workspaceId: WS, ticketId: T1 });
      expect(JSON.stringify(out)).not.toContain(HIDDEN);
      const flow = out as ReturnType<typeof wire>;
      expect(flow.nodes[2]).toMatchObject({ parentId: null, resolution: { decisionTicketId: null }, alternates: [{ viaDecisionId: null, firstTicketId: null }] });
      expect(flow.edges).toHaveLength(3); // the edge from HIDDEN is gone
      expect(flow.autoMoves.map((m) => [m.ticketId, m.becauseTicketId])).toEqual([[T2, D], [T2, null]]);
      // control: with the Decision among the visible nodes every id survives
      const kept = (await tool(fakeFlow({ [FLOW]: wire() }), 'get_flow').handler({ workspaceId: WS, ticketId: T1 })) as ReturnType<typeof wire>;
      expect(kept.nodes[2]).toMatchObject({ resolution: { decisionTicketId: D }, alternates: [{ viaDecisionId: D, firstTicketId: T1 }] });
    });
  });

  describe('29.381 get_ticket flow facts', () => {
    const tw = `/v1/workspaces/${WS}/tickets`;
    const stateOf = (extra: Record<string, unknown>) => ({ ...detail({ typeId: 'task' }), ticketState: { ...detail().ticketState, ...extra } });
    const getTicket = (f: ReturnType<typeof fakeFlow>) => readTools(f.session).find((t) => t.name === 'get_ticket')!;
    const routes = (id: string, extra: Record<string, unknown>, more: Record<string, unknown> = {}) => ({ [`${tw}/${id}`]: stateOf(extra), [`${tw}/${id}/links`]: { links: [] }, ...more });

    it('29.381 passes, round and periods are lifted and leave ticketState; a round-1 ticket has no round or periods', async () => {
      const f = fakeFlow(routes(D, { outcome: 'Approved', passes: PASSES, rounds: 2, periods: [{ start: '2026-10-01', end: '2026-10-02', pass: 1 }] }));
      const out = (await getTicket(f).handler({ workspaceId: WS, ticketId: D })) as Record<string, unknown> & { ticketState: Record<string, unknown> };
      expect(out['passes']).toEqual(PASSES);
      expect(out['round']).toBe(2);
      expect(out['periods']).toEqual([{ start: '2026-10-01', end: '2026-10-02', pass: 1 }]);
      for (const k of ['passes', 'rounds', 'periods', 'resolution']) expect(out.ticketState, `ticketState.${k} is gone`).not.toHaveProperty(k);
      expect(out.ticketState['outcome']).toBe('Approved');
      const once = fakeFlow(routes(T1, { rounds: 1, periods: [{ start: '2026-10-01', end: '2026-10-02', pass: 1 }] })); // control
      const plain = (await getTicket(once).handler({ workspaceId: WS, ticketId: T1 })) as Record<string, unknown>;
      expect(plain).not.toHaveProperty('round');
      expect(plain).not.toHaveProperty('periods');
    });

    it('29.381 a Not-taken resolution names its Decision only when the caller can read it; closed.cause never leaves', async () => {
      // Part 2 serves no `resolution` member: the cause alone carries it (decision 2).
      const closed = { actorId: 'flow', at: '2026-10-03T10:00:00.000Z', cause: { kind: 'branch-not-taken', decisionTicketId: D, outcome: 'Approved', pass: 1 } };
      const visible = fakeFlow(routes(T2, { closed }, { [`${tw}/${D}`]: detail({ key: 'GN-145', typeId: 'decision' }) }));
      const seen = (await getTicket(visible).handler({ workspaceId: WS, ticketId: T2 })) as { resolution: { decision: unknown }; ticketState: { closed: Record<string, unknown> } };
      expect(seen.resolution).toMatchObject({ kind: 'not-taken', outcome: 'Approved', pass: 1, decision: { id: D, key: 'GN-145' } });
      expect(seen.ticketState.closed).toEqual({ actorId: 'flow', at: '2026-10-03T10:00:00.000Z' }); // no cause
      const hidden = fakeFlow(routes(T2, { closed })); // the Decision's route answers 404
      const out = await getTicket(hidden).handler({ workspaceId: WS, ticketId: T2 });
      expect((out as { resolution: { decision: unknown } }).resolution.decision).toBeNull();
      expect(JSON.stringify(out)).not.toContain(D);
    });
  });
  ```
  Run (LOCAL): `…/slot-run.sh wtg5-t2-red -- pnpm --filter @gisik-nokma/mcp-server exec vitest run test/flow-get-tools.test.ts --maxWorkers=2 > /tmp/wtg5-t2-red.log 2>&1; tail -40 /tmp/wtg5-t2-red.log`. Expected: FAIL (`get_flow`, `flowWireSchema`, `withFlowFacts` do not exist).

- [ ] **Step 3: Implement**

  **`flow-seams.ts`** (append; add `import { z } from 'zod';` at the top):
  ```ts
  const enc = encodeURIComponent;

  /** Graph Part 3: `GET /v1/workspaces/:ws/tickets/:id/flow` (spec §4, FL-1 to FL-3). Probe S4. */
  export const FLOW_PATH = (workspaceId: string, ticketId: string): string => `/v1/workspaces/${enc(workspaceId)}/tickets/${enc(ticketId)}/flow`;

  const at = z.string().min(1);
  const passRecord = z.object({
    pass: z.number().int().min(1), outcome: z.string().nullable(), by: z.string(), at,
    revisions: z.array(z.object({ from: z.string().nullable(), to: z.string().nullable(), by: z.string(), at })),
  });
  /** One node of a flow. `parentId` is required (publish_flow orders parents first); every id that can name another ticket is nullable because the caller may not see it. */
  export const flowNodeSchema = z.object({
    id: z.string(), key: z.string().nullable(), draft: z.boolean(), title: z.string(), parentId: z.string().nullable(),
    kind: z.enum(['ticket', 'decision']),
    state: z.object({ id: z.string(), name: z.string(), category: z.enum(['open', 'active', 'terminal']) }),
    assigneeId: z.string().nullable(), waitForAll: z.boolean(),
    estimate: z.number().int().nullable(), reworkEstimate: z.number().int().nullable(), round: z.number().int().min(1),
    outcome: z.string().nullable(), passes: z.array(passRecord),
    resolution: z.object({ kind: z.literal('not-taken'), decisionTicketId: z.string().nullable(), outcome: z.string(), pass: z.number().int() }).nullable(),
    alternates: z.array(z.object({ viaDecisionId: z.string().nullable(), outcome: z.string(), firstTicketId: z.string().nullable() })),
    periods: z.array(z.object({ start: at, end: at.nullable(), pass: z.number().int() })),
    planned: z.array(z.object({ pass: z.number().int(), start: z.string(), end: z.string(), basis: z.enum(['explicit', 'chained']), pruned: z.boolean() })),
    actual: z.object({ start: at, end: at.nullable() }).nullable(),
    tray: z.string().nullable(),
    notes: z.array(z.object({ id: z.string(), title: z.string() })),
  });
  export const flowWireSchema = z.object({
    flowId: z.string(), truncated: z.boolean(), start: z.array(z.string()), end: z.array(z.string()),
    nodes: z.array(flowNodeSchema),
    edges: z.array(z.object({ kind: z.enum(['leads_to', 'blocks']), from: z.string(), to: z.string(), label: z.string().nullable(), loop: z.boolean(), taken: z.number().int().min(0) })),
    autoMoves: z.array(z.object({ ticketId: z.string(), at, kind: z.enum(['led-to', 'reopened-by-flow', 'branch-not-taken']), becauseTicketId: z.string().nullable(), pass: z.number().int().nullable() })),
    draftCount: z.number().int().min(0),
  });
  export type FlowWire = z.infer<typeof flowWireSchema>;

  /** A route's answer, parsed. A missing or mistyped member is a version mismatch between this tool and the server, said so (T3, T4, T5 use it too). */
  export function parseWire<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, wire: unknown, what: string): T {
    const parsed = schema.safeParse(wire);
    if (parsed.success) return parsed.data;
    const issue = parsed.error.issues[0];
    throw new Error(`the ${what} answer is not the shape this tool reads (${issue?.path.join('.') ?? 'unknown'}: ${issue?.message ?? 'invalid'}). This is a server mismatch, not something a retry fixes.`);
  }
  ```

  **`flow-answer.ts`:**
  ```ts
  import type { Session } from '../session.js';
  import { FLOW_PATH, flowWireSchema, parseWire, type FlowWire } from './flow-seams.js';
  import { readOrNotFound } from './reads.js';

  /** The flow route's answer, parsed (`parseWire` says which member is wrong and that it is a server mismatch). */
  export async function readFlow(session: Session, workspaceId: string, ticketId: string): Promise<FlowWire> {
    return parseWire(flowWireSchema, await readOrNotFound(session, FLOW_PATH(workspaceId, ticketId), 'ticket'), 'flow');
  }

  /**
   * Decision 8 / spec §14 "only what the caller can see": the server redacts, and this pass makes it impossible to forget.
   * An id that is not a node of the flow becomes null; an edge or an automatic move that names an unseen ticket is dropped.
   * A parent outside the flow reads null (publish_flow needs only parents that are drafts of the flow). A flow cut at its
   * cap (`truncated`) nulls the ids it did not return, which is the safe side.
   */
  export function toFlowAnswer(wire: FlowWire): FlowWire {
    const seen = new Set(wire.nodes.map((n) => n.id));
    const known = (id: string | null): string | null => (id !== null && seen.has(id) ? id : null);
    return {
      ...wire,
      start: wire.start.filter((id) => seen.has(id)),
      end: wire.end.filter((id) => seen.has(id)),
      nodes: wire.nodes.map((n) => ({
        ...n,
        parentId: known(n.parentId),
        resolution: n.resolution === null ? null : { ...n.resolution, decisionTicketId: known(n.resolution.decisionTicketId) },
        alternates: n.alternates.map((a) => ({ ...a, viaDecisionId: known(a.viaDecisionId), firstTicketId: known(a.firstTicketId) })),
      })),
      edges: wire.edges.filter((e) => seen.has(e.from) && seen.has(e.to)),
      autoMoves: wire.autoMoves.filter((m) => seen.has(m.ticketId)).map((m) => ({ ...m, becauseTicketId: known(m.becauseTicketId) })),
    };
  }
  ```

  **`ticket-flow-facts.ts`:**
  ```ts
  import { HttpError } from '../http-client.js';
  import type { Session } from '../session.js';

  type Obj = Record<string, unknown>;
  const enc = encodeURIComponent;

  /**
   * What `get_ticket` adds about the flow (spec §14, last paragraph). Part 2 folds `passes`, `rounds`, `periods` and a close
   * `cause` into `ticketState`; the Not-taken resolution is DERIVED from a `branch-not-taken` cause (Part 2 decision 2, `resolutionOf`); some name OTHER tickets (a Not-taken ticket's Decision). So they are lifted to
   * the top level in one representation, the raw members leave `ticketState`, and the Decision is named only if the caller
   * can read it (one read; a hidden ticket answers 404). The id of a hidden Decision appears nowhere in the reply.
   */
  export async function withFlowFacts(session: Session, workspaceId: string, state: Obj): Promise<{ state: Obj; facts: Obj }> {
    const { passes, rounds, periods, resolution, closed, ...rest } = state;
    const facts: Obj = {};
    if (Array.isArray(passes) && passes.length > 0) facts['passes'] = passes;
    const round = typeof rounds === 'number' ? rounds : 1;
    if (round >= 2) {
      facts['round'] = round;
      facts['periods'] = Array.isArray(periods) ? periods : [];
    }
    // Part 2 decision 2: no folded `resolution`; read it off the close cause exactly as `resolutionOf` does (a served `resolution` is accepted too).
    const cause = closed !== null && typeof closed === 'object' ? ((closed as Obj)['cause'] as Obj | null | undefined) : undefined;
    const fromCause = cause !== null && cause !== undefined && cause['kind'] === 'branch-not-taken'
      ? { kind: 'not-taken', decisionTicketId: cause['decisionTicketId'], outcome: cause['outcome'], pass: cause['pass'] }
      : null;
    const r = (resolution as Obj | null | undefined) ?? fromCause;
    if (r !== null && r !== undefined && r['kind'] === 'not-taken') {
      facts['resolution'] = { kind: 'not-taken', outcome: r['outcome'], pass: r['pass'], decision: await readableTicket(session, workspaceId, r['decisionTicketId']) };
    }
    const keptClosed = closed !== null && typeof closed === 'object' ? (({ cause: _cause, ...c }) => c)(closed as Obj) : closed;
    return { state: { ...rest, ...(closed === undefined ? {} : { closed: keptClosed }) }, facts };
  }

  async function readableTicket(session: Session, workspaceId: string, id: unknown): Promise<{ id: string; key: string | null; title: string } | null> {
    if (typeof id !== 'string') return null;
    try {
      const d = (await session.get(`/v1/workspaces/${enc(workspaceId)}/tickets/${enc(id)}`)) as { key: string | null; title: string };
      return { id, key: d.key, title: d.title };
    } catch (error) {
      if (error instanceof HttpError && error.status === 404) return null;
      throw error;
    }
  }
  ```

  **`read-tools.ts` `get_ticket`:** import `withFlowFacts`; after `detail` and the links read (typed-links T4), compute
  ```ts
        const flow = detail.ticketState === undefined ? undefined : await withFlowFacts(session, parsed.workspaceId, detail.ticketState as Record<string, unknown>);
  ```
  then, in the returned object, use `flow.state` wherever the handler used `detail.ticketState` for the `ticketState` it returns (keep the `fields` / `description` split exactly as it is) and spread `...(flow?.facts ?? {})` beside `...detail`. Append to the description: "Also: for a Decision its `passes`; for a ticket in its second round or later, `round` and `periods`; for a ticket closed as Not taken, its `resolution` (the Decision is named only if you can read it); `leads_to` links carry their `label`."

  **`flow-tools.ts`:** add after `set_wait_for_all`:
  ```ts
      {
        name: 'get_flow',
        description:
          'Read the flow a ticket belongs to: the tickets connected to it by "leads to" arrows, in flow order, with the arrows. Per ticket: status, wait-for-all, estimate and rework estimate, round (how many times the flow reran it), ' +
          'a Decision\'s current outcome and every pass (with its revisions), a "Not taken" resolution, the alternate branches of a Decision it sits behind, its work periods (real time worked, one per pass), ' +
          'planned intervals (pruned ones are branches the Decision left), its actual start and end, the reason it is not on the timeline, and the notes attached to it. Arrows carry `loop` and, for a loop, `taken`: ' +
          'how many passes took it. `autoMoves` lists what the flow did by itself (moved to To do, reopened, closed Not taken). Only what you can see; your own drafts are included, other people\'s never are.',
        inputSchema: { workspaceId: id, ticketId: id },
        handler: async (args) => {
          const a = z.object({ workspaceId: id, ticketId: id }).parse(args);
          return toFlowAnswer(await readFlow(session, a.workspaceId, a.ticketId));
        },
      },
  ```
  with `import { readFlow, toFlowAnswer } from './flow-answer.js';`.

  **Pins:** `tool-names.ts` flow block gets `'get_flow',` on its own line after `'set_wait_for_all',`; `tool-sweep.ts`: `get_flow: { args: { workspaceId: 'w', ticketId: 't' }, session: { get: async () => ({ flowId: 'f', truncated: false, start: [], end: [], nodes: [], edges: [], autoMoves: [], draftCount: 0 }) } },`; `register.test.ts` 14.555: `'get_flow',` after `'set_wait_for_all',`, the count re-derived; the two spelled counts re-derived.

  Run (LOCAL): `…/slot-run.sh wtg5-t2-green -- pnpm --filter @gisik-nokma/mcp-server exec vitest run --maxWorkers=2 > /tmp/wtg5-t2-green.log 2>&1; tail -40 /tmp/wtg5-t2-green.log`.
  Expected: PASS including 14.80, 14.81, 14.555, 14.88. Flip 29.379–29.381 ✅ (the hosted parts of 29.380 and 29.381 flip after Step 4).

  Commit: `wtg-part5 T2: get_flow and flow facts on get_ticket`.

- [ ] **Step 4: The hosted cases (visibility)**

  Append to `apps/server/test/mcp/mcp-flow.test.ts`:
  ```ts
  describe('29.380 29.381 get_flow and get_ticket through the hosted door', () => {
    it('29.380 a member who cannot see the Decision sees neither its id nor its arrows; the owner sees both', async () => {
      const w = await buildDoorWorld(db, '3763');
      const second = await ok(w, w.owner, 'create_project', { workspaceId: w.workspaceId, name: 'Hidden' });
      const decision = await mk(w, w.owner, 'Client decides', { typeId: 'decision', projectId: second['projectId'] as string });
      const key = ((await ok(w, w.owner, 'get_ticket', { workspaceId: w.workspaceId, ticketId: decision })) as { key: string }).key;
      await ok(w, w.owner, 'set_visibility', { workspaceId: w.workspaceId, ticketId: decision, mode: 'project', confirm_name: key });
      const visible = await mk(w, w.owner, 'Pitch');
      await ok(w, w.owner, 'link_tickets', { workspaceId: w.workspaceId, ticketId: decision, targetId: visible, kind: 'leads_to', action: 'add', label: 'Yes' });
      // the control that the hide worked: the member cannot read the Decision
      const hiddenRead = await callTool(w.app, w.member.token, 'get_ticket', { workspaceId: w.workspaceId, ticketId: decision });
      expect(hiddenRead.isError).toBe(true);
      const asMember = await ok(w, w.member, 'get_flow', { workspaceId: w.workspaceId, ticketId: visible });
      expect(JSON.stringify(asMember)).not.toContain(decision);
      expect((asMember['nodes'] as unknown[]).length).toBe(1);
      const asOwner = await ok(w, w.owner, 'get_flow', { workspaceId: w.workspaceId, ticketId: visible });
      expect((asOwner['nodes'] as Array<{ id: string }>).map((n) => n.id)).toEqual([decision, visible]);
      expect((asOwner['edges'] as Array<{ label: string }>)[0]?.label).toBe('Yes');
    });

    it('29.381 get_ticket carries passes after a decision and list_ticket_types lists the Decision', async () => {
      const w = await buildDoorWorld(db, '3764');
      const decision = await mk(w, w.owner, 'Client decides', { typeId: 'decision' });
      const next = await mk(w, w.owner, 'Pitch');
      await ok(w, w.owner, 'link_tickets', { workspaceId: w.workspaceId, ticketId: decision, targetId: next, kind: 'leads_to', action: 'add', label: 'Yes' });
      await rawEvents(w, w.owner, [{ entityId: decision, type: 'ticket.decided', payload: { outcome: 'Yes' } }]);
      const got = (await ok(w, w.owner, 'get_ticket', { workspaceId: w.workspaceId, ticketId: decision })) as { passes: Array<{ pass: number; outcome: string }>; ticketState: Record<string, unknown> };
      expect(got.passes.map((p) => [p.pass, p.outcome])).toEqual([[1, 'Yes']]);
      expect(got.ticketState).not.toHaveProperty('passes');
      const types = (await ok(w, w.owner, 'list_ticket_types', { workspaceId: w.workspaceId })) as { ticketTypes: Array<{ id: string; rank: number }> };
      expect(types.ticketTypes.find((t) => t.id === 'decision')?.rank).toBe(3);
    });
  });
  ```
  (import `rawEvents` from `./helpers/flow-world.js`). If the member can still read the Decision after `set_visibility`, the control line fails: read `apps/server/test/mcp/mcp-definitions.test.ts` for the `mode` that narrows a ticket to its project and use that; the control exists to catch exactly this.
  And one more case in the same `describe`, because the unit test's fake `ticketState` holds exactly the members `withFlowFacts` strips and so cannot catch an id Part 2 carries somewhere else (Review Focus 3):
  ```ts
    it('29.381 get_ticket on a Not-taken step never carries the id of a Decision the member cannot read; the owner sees it', async () => {
      const w = await buildDoorWorld(db, '3765');
      const second = await ok(w, w.owner, 'create_project', { workspaceId: w.workspaceId, name: 'Hidden' });
      const decision = await mk(w, w.owner, 'Client decides', { typeId: 'decision', projectId: second['projectId'] as string });
      const yes = await mk(w, w.owner, 'Pitch');
      const no = await mk(w, w.owner, 'Rework');
      await rawEvents(w, w.owner, [
        { entityId: decision, type: 'ticket.link_added', payload: { kind: 'leads_to', targetId: yes, label: 'Yes' } },
        { entityId: decision, type: 'ticket.link_added', payload: { kind: 'leads_to', targetId: no, label: 'No' } },
      ]);
      await rawEvents(w, w.owner, [{ entityId: decision, type: 'ticket.decided', payload: { outcome: 'Yes' } }]);
      const read = (who: typeof w.owner) => until('the flow closing the other branch', async () => {
        const r = await callTool(w.app, who.token, 'get_ticket', { workspaceId: w.workspaceId, ticketId: no });
        return r.isError || !(r.json as { resolution?: unknown }).resolution ? null : r;
      });
      const asOwner = await read(w.owner);
      expect((asOwner.json as { resolution: { decision: { id: string } | null } }).resolution.decision?.id).toBe(decision); // control: the owner can read the Decision
      const asMember = await read(w.member);
      expect((asMember.json as { resolution: { decision: unknown } }).resolution.decision).toBeNull();
      expect(asMember.text).not.toContain(decision); // the WHOLE reply, not just the member this tool knows about
    });
  ```
  (import `callTool`, `until` from `./helpers/flow-world.js`.)

  Run (LOCAL): `…/slot-run.sh wtg5-t2-hosted -- pnpm --filter @gisik-nokma/server exec vitest run test/mcp --maxWorkers=2 > /tmp/wtg5-t2-hosted.log 2>&1; tail -40 /tmp/wtg5-t2-hosted.log`. Expected: PASS.

- [ ] **Step 5: Features, sweeps, mutations, DONE**
  - **Features:** replace `<!-- wtg-part5-mcp T2 bullet -->` with `- ✅ **MCP: read a flow and its facts** (Graph Part 5 T2; `packages/mcp-server/src/tools/flow-answer.ts`, `flow-tools.ts`, `ticket-flow-facts.ts`, `read-tools.ts`) — `get_flow` answers the connected tickets in flow order with passes, periods, Not-taken resolutions, alternates, loop counts and automatic moves; ids of tickets the caller cannot see are null and their arrows are dropped; `get_ticket` lifts passes, round, periods and a Not-taken resolution to one place and never names a Decision the caller cannot read. Cases 29.379–29.381.`
  - **Checks:** `node scripts/check-case-ids.mjs`, `pnpm check:citations`, `pnpm check:tasks`.
  - **Sweeps (LOCAL):** mcp-server WHOLE; server `test/mcp` WHOLE; the ui-copy scan.
  - **Mutations:**

    | Case | Mutation |
    |---|---|
    | 29.379 | drop `passes` from `flowNodeSchema` → the pass case reddens |
    | 29.380 | skip the `known()` pass → the hidden id appears in the serialised reply |
    | 29.381 | spread `ticketState` unfiltered in `get_ticket` → `ticketState.passes` reappears and the hidden Decision id leaks |

  Push. DONE.

---

### Task 3: `get_timeline` (cases 29.382–29.383)

**Branch:** `task/wtg-part5-t3-get-timeline` from `origin/release/workflow-graph`; PR `--base release/workflow-graph`. Starts after T2 has landed (it appends to the same module, seam file and pin lines).

**Files:**
- Create:
  - `packages/mcp-server/src/tools/timeline-window.ts`
  - `packages/mcp-server/test/timeline-tools.test.ts`
- Modify:
  - `packages/mcp-server/src/tools/flow-seams.ts` (append the three paths, `TimelineScope`, `timelineQuery`, the three schemas)
  - `packages/mcp-server/src/tools/flow-tools.ts` (append `get_timeline` after `get_flow`)
  - Pins: `tool-names.ts`, `tool-sweep.ts`, `register.test.ts` (14.555), the two spelled counts
  - `apps/server/test/mcp/flow-seams.test.ts` (S7), `apps/server/test/mcp/mcp-flow.test.ts`
  - Catalogue: `test-cases/29-…` under `<!-- wtg-part5-mcp T3 -->`, `Features.md` §26 under `<!-- wtg-part5-mcp T3 bullet -->`

**Interfaces:**
- **Consumes:** Graph Part 4's three routes (S7); `readOrNotFound` (`reads.ts:6`); `parseWire` (T2).
- **Produces:**
  - `readTimeline(session, scope, opts): Promise<TimelineAnswer>` (timeline-window.ts);
  - pure helpers `addDays`, `daysBetween`, `mondayOnOrBefore`, `isIsoDay`, `chunkStarts`, `compareKeys`, constants `CHUNK_DAYS = 28`, `MAX_WINDOW_DAYS = 180`.

- [ ] **Step 1: The seam probe S7 (hosted, RED means STOP)**

  Append to `apps/server/test/mcp/flow-seams.test.ts`:
  ```ts
    it('SEAM S7 (Graph Part 4): the timeline routes answer the members get_timeline reads, pin as counts', async () => {
      const w = await buildDoorWorld(db, '3771');
      const get = async (url: string) => (await w.app.inject({ method: 'GET', url, headers: { authorization: `Bearer ${w.owner.sessionToken}` } })).json<Record<string, any>>();
      const scope = `ws=${w.workspaceId}&mine=0`;
      const index = await get(`/v1/timeline/index?${scope}`);
      for (const k of ['today', 'items', 'flows', 'tray', 'truncated']) expect(index, `S7 index.${k}`).toHaveProperty(k);
      expect(index['tray'], 'S7 index.tray.count').toHaveProperty('count');
      await ok(w, w.owner, 'update_ticket', { workspaceId: w.workspaceId, ticketId: w.ticketId, startDate: '2026-10-05', dueDate: '2026-10-09' });
      const dated = await get(`/v1/timeline/index?${scope}`);
      const entry = (dated['items'] as Array<Record<string, any>>).find((e) => e['id'] === w.ticketId);
      expect(entry, 'S7: a dated ticket is an index entry').toBeDefined();
      for (const k of ['id', 'key', 'draft', 'kind', 'lane', 'segments', 'pin', 'resolution', 'category', 'flowId']) expect(entry, `S7 entry.${k}`).toHaveProperty(k);
      expect(typeof entry?.['pin'], 'S7: pin rides the index entry as counts {notes, attachments} (TG-11; PR-0 says "true when", the two disagree)').toBe('object');
      expect(entry?.['pin']).toHaveProperty('notes');
      const chunk = await get(`/v1/timeline/chunk?${scope}&from=2026-09-28&to=2026-10-25`);
      const detail = (chunk['items'] as Array<Record<string, any>>).find((e) => e['id'] === w.ticketId);
      for (const k of ['title', 'stateId', 'stateName', 'basis']) expect(detail, `S7 chunk item.${k}`).toHaveProperty(k);
      expect(chunk, 'S7 chunk.nextCursor').toHaveProperty('nextCursor');
      const tray = await get(`/v1/timeline/tray?${scope}`);
      expect(tray, 'S7 tray.items').toHaveProperty('items');
      expect(tray, 'S7 tray.nextCursor').toHaveProperty('nextCursor');
      const first = (tray['items'] as Array<Record<string, any>>)[0];
      for (const k of ['id', 'key', 'title', 'reason']) expect(first, `S7 tray item.${k}`).toHaveProperty(k);
    });
  ```
  Run (LOCAL): `…/slot-run.sh wtg5-t3-probe -- pnpm --filter @gisik-nokma/server exec vitest run test/mcp/flow-seams.test.ts --maxWorkers=2 > /tmp/wtg5-t3-probe.log 2>&1; tail -40 /tmp/wtg5-t3-probe.log`. Expected: PASS. A red probe is a STOP naming Part 4. The `pin` line is the one known spec disagreement (PR-0 `docs/superpowers/specs/2026-10-03-workflow-timeline-graphs-design.md:174` "true when…" vs TG-11 `:714` "the counts ride the index entry"); the plan follows TG-11 and the §14 tool shape `pin: {notes, attachments}`. If Part 4 shipped a boolean, STOP and ask the planner; do not guess counts.
  Commit: `wtg-part5 T3: seam probe S7`.

- [ ] **Step 2: Case lines and RED unit tests (29.382–29.383)**

  Case lines under `<!-- wtg-part5-mcp T3 -->`, all ❌:
  - `- ❌ **29.382 — `get_timeline` takes exactly one of `workspaceId` / `workspaceIds`; with no `from` / `to` it reads today − 14 to today + 60 from the index's own `today`; it asks the chunk route once per Monday-aligned 28 days and reads every page of each; it keeps the entries with a segment overlapping the window (a segment ending on `from` or starting on `to` counts), sorts them by first segment start, natural key (`GN-9` before `GN-10`), id (a draft after keyed entries at a tie), and pages them with `limit` (default 200, at most 500) and an offset `cursor`; a window over 180 days, `to` before `from`, a foreign cursor and a malformed day are refused before anything is sent;** control: exactly 180 days is read. Mutation: compare `segment.end > from` → the boundary entry drops and the case reddens.`
  - `- ❌ **29.383 — each entry carries `pin: {notes, attachments}`, `basis`, `state` and `title` (from the chunk), `key: null` for the caller's own draft; a Not-taken `resolution.decisionTicketId` that names a ticket outside the answer is `null` and `flows[]` keep only the edges between returned entries; `includeTray` reads ONE tray page and `trayCount` is always the index's count, without `includeTray` the tray route is not called; a workspace the caller cannot read answers `workspace not found or not visible to you`; a member's draft is absent for everyone else (hosted);** control: with `includeTray: true` the tray is listed, and the same entry with a visible Decision keeps its id. Mutation: skip the id filter → the hidden id appears in the serialised reply.`

  `packages/mcp-server/test/timeline-tools.test.ts`:
  ```ts
  import { describe, expect, it } from 'vitest';
  import { flowTools } from '../src/tools/flow-tools.js';
  import { addDays, chunkStarts, compareKeys, mondayOnOrBefore } from '../src/tools/timeline-window.js';
  import { WS, fakeFlow, ulid } from './fixtures/flow-fixtures.js';

  const P = '/v1/timeline';
  const [A, B, C, D, E, F, G, H, I, J, X, Y, Z, HIDDEN] = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'X', 'Y', 'Z', 'HID'].map((n) => ulid(`TL${n}`));
  const seg = (start: string, end: string, type = 'planned', pass: number | null = 1) => ({ start, end, pass, type });
  const entry = (id: string, key: string | null, over: Record<string, unknown> = {}) => ({
    id, key, draft: key === null, kind: 'ticket', lane: 'p1', segments: [seg('2026-10-05', '2026-10-09')], pin: { notes: 0, attachments: 0 },
    resolution: null, category: 'open', flowId: null, ...over,
  });
  const index = (items: unknown[], over: Record<string, unknown> = {}) => ({ today: '2026-10-07', asOf: {}, truncated: null, items, flows: [], tray: { count: 0 }, ...over });
  const detail = (id: string, title: string) => ({ id, title, stateId: 'todo', stateName: 'To do', basis: 'explicit' });
  type Out = { today: string; from: string; to: string; items: Array<Record<string, unknown> & { id: string }>; flows: Array<{ id: string; nodes: string[]; edges: unknown[] }>; trayCount: number; tray?: unknown[]; truncated: boolean; nextCursor: string | null };
  const run = (f: ReturnType<typeof fakeFlow>, args: Record<string, unknown> = { workspaceId: WS }) =>
    flowTools(f.session).find((t) => t.name === 'get_timeline')!.handler(args) as Promise<Out>;
  const q = (path: string) => new URL(path, 'http://x').searchParams;

  describe('29.382 the date helpers', () => {
    it('29.382 mondayOnOrBefore, addDays, chunkStarts and natural key order', () => {
      expect(mondayOnOrBefore('2026-09-23')).toBe('2026-09-21'); // a Wednesday
      expect(mondayOnOrBefore('2026-09-21')).toBe('2026-09-21'); // a Monday stays
      expect(mondayOnOrBefore('2026-09-27')).toBe('2026-09-21'); // a Sunday goes back six days
      expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
      expect(chunkStarts('2026-09-23', '2026-12-06')).toEqual(['2026-09-21', '2026-10-19', '2026-11-16']);
      expect(chunkStarts('2026-10-19', '2026-11-15')).toEqual(['2026-10-19']); // the window ends on the chunk's last day: no extra chunk
      expect(['GN-10', 'GN-9', null, 'AA-2'].sort(compareKeys)).toEqual(['AA-2', 'GN-9', 'GN-10', null]);
    });
  });

  describe('29.382 get_timeline window, order, paging', () => {
    it('29.382 reads today-14..today+60 from the index, one chunk per Monday-aligned 28 days, every page, and sends the scope', async () => {
      const f = fakeFlow({
        [`${P}/index`]: index([entry(A, 'GN-1'), entry(B, 'GN-2')]),
        [`${P}/chunk`]: (path: string) => (q(path).get('cursor') === 'c1' ? { items: [detail(B, 'Beta')], nextCursor: null } : { items: [detail(A, 'Alpha')], nextCursor: 'c1' }),
      });
      const out = await run(f);
      expect([out.today, out.from, out.to]).toEqual(['2026-10-07', '2026-09-23', '2026-12-06']);
      expect(q(f.gets[0]!).get('ws')).toBe(WS);
      expect(q(f.gets[0]!).get('mine')).toBe('0');
      expect(q(f.gets[0]!).has('proj')).toBe(false);
      const chunks = f.gets.filter((p) => p.startsWith(`${P}/chunk`));
      expect(chunks.filter((p) => !q(p).has('cursor')).map((p) => [q(p).get('from'), q(p).get('to')])).toEqual([
        ['2026-09-21', '2026-10-18'], ['2026-10-19', '2026-11-15'], ['2026-11-16', '2026-12-13'],
      ]);
      expect(chunks).toHaveLength(6); // two pages per chunk: the second page is read too
      expect(out.items.map((i) => [i.id, i['title']])).toEqual([[A, 'Alpha'], [B, 'Beta']]);
      expect(out.items[0]).toMatchObject({ basis: 'explicit', state: { id: 'todo' } });
      // the scope arguments reach the query
      const g = fakeFlow({ [`${P}/index`]: index([]), [`${P}/chunk`]: { items: [], nextCursor: null } });
      await run(g, { workspaceIds: [WS, ulid('WS2')], projectIds: [ulid('PRJ')], mine: true });
      expect(q(g.gets[0]!).get('ws')).toBe([WS, ulid('WS2')].sort().join(','));
      expect(q(g.gets[0]!).get('proj')).toBe(ulid('PRJ'));
      expect(q(g.gets[0]!).get('mine')).toBe('1');
    });

    it('29.382 keeps what overlaps the window (both edges inclusive) and sorts by first start, natural key, id; a draft goes last at a tie', async () => {
      const items = [
        entry(A, 'GN-10'), entry(B, 'GN-9'), entry(C, null),
        entry(D, 'GN-4', { segments: [seg('2026-10-01', '2026-10-02')] }),
        entry(E, 'GN-5', { segments: [seg('2027-03-01', '2027-03-02')] }), // after the window
        entry(F, 'GN-3', { segments: [seg('2026-08-01', '2026-08-03', 'actual'), seg('2026-10-06', '2026-10-08')] }), // one segment inside: kept, first start is August
        entry(G, 'GN-7', { segments: [seg('2026-09-01', '2026-09-10')] }), // before the window
        entry(H, 'GN-6', { segments: [seg('2026-09-20', '2026-09-23')] }), // ends ON from: kept
        entry(I, 'GN-8', { segments: [seg('2026-12-06', '2026-12-08')] }), // starts ON to: kept
        entry(J, 'GN-11', { segments: [seg('2026-12-07', '2026-12-09')] }), // one day after to
      ];
      const out = await run(fakeFlow({ [`${P}/index`]: index(items), [`${P}/chunk`]: { items: [], nextCursor: null } }));
      expect(out.items.map((i) => i.id)).toEqual([F, H, D, B, A, C, I]);
      expect(out.items.find((i) => i.id === C)).toMatchObject({ key: null, draft: true, title: null }); // a missing detail is null, not a guess
      expect(out.items.find((i) => i.id === F)?.['segments']).toHaveLength(2); // segments are not clipped
    });

    it('29.382 limit and cursor page the sorted list; a foreign cursor is refused', async () => {
      const items = ['1', '2', '3', '4', '5'].map((n) => entry(ulid(`TP${n}`), `GN-${n}`, { segments: [seg(`2026-10-0${n}`, `2026-10-0${n}`)] }));
      const f = () => fakeFlow({ [`${P}/index`]: index(items), [`${P}/chunk`]: { items: [], nextCursor: null } });
      const p1 = await run(f(), { workspaceId: WS, limit: 2 });
      expect(p1.items.map((i) => i['key'])).toEqual(['GN-1', 'GN-2']);
      expect(p1.nextCursor).toBe('2');
      const p3 = await run(f(), { workspaceId: WS, limit: 2, cursor: '4' });
      expect(p3.items.map((i) => i['key'])).toEqual(['GN-5']);
      expect(p3.nextCursor).toBeNull();
      await expect(run(f(), { workspaceId: WS, cursor: '99' })).rejects.toThrow('cursor is not one this tool gave out');
      await expect(run(f(), { workspaceId: WS, limit: 501 })).rejects.toThrow(); // the schema caps at 500
      await expect(run(f(), { workspaceId: WS, limit: 500 })).resolves.toBeTruthy(); // control
    });

    it('29.382 refuses a bad scope or window before anything is sent; exactly 180 days is read', async () => {
      const none = fakeFlow({});
      await expect(run(none, {})).rejects.toThrow('get_timeline needs a scope: pass workspaceId (one workspace) or workspaceIds (several).');
      await expect(run(none, { workspaceId: WS, workspaceIds: [WS] })).rejects.toThrow('get_timeline takes workspaceId OR workspaceIds, not both.');
      await expect(run(none, { workspaceId: WS, from: '2026-10-09', to: '2026-10-05' })).rejects.toThrow('to must not be before from.');
      await expect(run(none, { workspaceId: WS, from: '2026-04-01', to: '2026-09-28' })).rejects.toThrow('the window is 181 days; get_timeline reads at most 180 days at a time');
      await expect(run(none, { workspaceId: WS, from: '2026-02-30', to: '2026-03-05' })).rejects.toThrow(); // not a real day
      expect(none.gets).toEqual([]); // nothing was sent
      const ok = fakeFlow({ [`${P}/index`]: index([]), [`${P}/chunk`]: { items: [], nextCursor: null } });
      const out = await run(ok, { workspaceId: WS, from: '2026-04-01', to: '2026-09-27' }); // 180 days inclusive
      expect([out.from, out.to]).toEqual(['2026-04-01', '2026-09-27']);
      // only `from` given: the default `to` may push the window past 180 days; that is refused after the index answers
      await expect(run(fakeFlow({ [`${P}/index`]: index([]) }), { workspaceId: WS, from: '2026-01-01' })).rejects.toThrow('the window is');
    });
  });

  describe('29.383 get_timeline pin, ids, tray, visibility', () => {
    it('29.383 pin counts ride each entry; an id outside the answer is null; flows keep only edges between returned entries', async () => {
      const items = [
        entry(X, 'GN-1', { pin: { notes: 2, attachments: 1 }, flowId: 'f1' }),
        entry(Y, 'GN-2', { flowId: 'f1', resolution: { kind: 'not-taken', decisionTicketId: HIDDEN, outcome: 'No', pass: 1 } }),
        entry(Z, 'GN-3', { flowId: 'f1', resolution: { kind: 'not-taken', decisionTicketId: X, outcome: 'No', pass: 1 } }),
      ];
      const flows = [{ id: 'f1', nodes: [{ id: X }, { id: Y }, { id: Z }], edges: [{ kind: 'leads_to', from: X, to: Z }, { kind: 'leads_to', from: HIDDEN, to: Y }] }];
      const out = await run(fakeFlow({ [`${P}/index`]: index(items, { flows }), [`${P}/chunk`]: { items: [], nextCursor: null } }));
      expect(JSON.stringify(out)).not.toContain(HIDDEN);
      expect(out.items.find((i) => i.id === X)?.['pin']).toEqual({ notes: 2, attachments: 1 });
      expect(out.items.find((i) => i.id === Y)?.['resolution']).toEqual({ kind: 'not-taken', decisionTicketId: null, outcome: 'No', pass: 1 });
      expect(out.items.find((i) => i.id === Z)?.['resolution']).toMatchObject({ decisionTicketId: X }); // control: a visible Decision keeps its id
      expect(out.flows).toEqual([{ id: 'f1', nodes: [X, Y, Z], edges: [{ kind: 'leads_to', from: X, to: Z }] }]);
    });

    it('29.383 includeTray reads one tray page; without it the tray route is not called; trayCount is always the index count', async () => {
      const routes = {
        [`${P}/index`]: index([entry(X, 'GN-1')], { tray: { count: 3 } }),
        [`${P}/chunk`]: { items: [], nextCursor: null },
        [`${P}/tray`]: { items: [{ id: Y, key: 'GN-2', title: 'No dates', reason: 'no-dates' }], nextCursor: 'more' },
      };
      const without = fakeFlow(routes);
      const a = await run(without);
      expect(a.trayCount).toBe(3);
      expect(a).not.toHaveProperty('tray');
      expect(without.gets.some((p) => p.startsWith(`${P}/tray`))).toBe(false);
      const withTray = fakeFlow(routes);
      const b = await run(withTray, { workspaceId: WS, includeTray: true });
      expect(b.tray).toEqual([{ id: Y, key: 'GN-2', title: 'No dates', reason: 'no-dates' }]);
      expect(withTray.gets.filter((p) => p.startsWith(`${P}/tray`))).toHaveLength(1); // one page only, however many there are
      expect(b.trayCount).toBe(3);
    });

    it('29.383 a workspace the caller cannot read, and an answer of the wrong shape, are said plainly', async () => {
      await expect(run(fakeFlow({}))).rejects.toThrow('workspace not found or not visible to you');
      const bad = index([entry(X, 'GN-1')]);
      delete (bad.items[0] as Record<string, unknown>)['pin'];
      await expect(run(fakeFlow({ [`${P}/index`]: bad }))).rejects.toThrow(/items\.0\.pin.*server/);
      await expect(run(fakeFlow({ [`${P}/index`]: index([entry(X, 'GN-1')]), [`${P}/chunk`]: { items: [], nextCursor: null } }))).resolves.toBeTruthy(); // control
    });
  });
  ```
  Run (LOCAL): `…/slot-run.sh wtg5-t3-red -- pnpm --filter @gisik-nokma/mcp-server exec vitest run test/timeline-tools.test.ts --maxWorkers=2 > /tmp/wtg5-t3-red.log 2>&1; tail -40 /tmp/wtg5-t3-red.log`. Expected: FAIL (`timeline-window.ts` and `get_timeline` do not exist).

- [ ] **Step 3: Implement**

  **`flow-seams.ts`** (append):
  ```ts
  /** Graph Part 4: the three range reads of the timeline (spec §4). Probe S7. */
  export const TIMELINE_INDEX_PATH = '/v1/timeline/index';
  export const TIMELINE_CHUNK_PATH = '/v1/timeline/chunk';
  export const TIMELINE_TRAY_PATH = '/v1/timeline/tray';

  export type TimelineScope = { workspaceIds: string[]; projectIds: string[]; mine: boolean };
  /** `ws` / `proj` are sorted so the same scope is always the same query (the app's cache key is the sorted scope). */
  export function timelineQuery(scope: TimelineScope, extra: Record<string, string> = {}): string {
    const query = new URLSearchParams();
    query.set('ws', [...scope.workspaceIds].sort().join(','));
    if (scope.projectIds.length > 0) query.set('proj', [...scope.projectIds].sort().join(','));
    query.set('mine', scope.mine ? '1' : '0');
    for (const [k, v] of Object.entries(extra)) query.set(k, v);
    return query.toString();
  }

  const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
  const timelineSegment = z.object({ start: day, end: day, pass: z.number().int().nullable(), type: z.enum(['actual', 'planned', 'ghost', 'stub']) }); // 'stub': a never-started Not-taken ticket's close day (owner ruling O3, TG-10)
  export const timelineIndexSchema = z.object({
    today: day,
    /** Part 4's PR-0 cut: `null`, or how many older items were dropped and before which day. */
    truncated: z.object({ dropped: z.number().int().min(0), before: day }).nullable(),
    items: z.array(z.object({
      id: z.string(), key: z.string().nullable(), draft: z.boolean(), kind: z.enum(['ticket', 'decision']), lane: z.string(),
      segments: z.array(timelineSegment),
      pin: z.object({ notes: z.number().int().min(0), attachments: z.number().int().min(0) }),
      resolution: z.object({ kind: z.literal('not-taken'), decisionTicketId: z.string().nullable(), outcome: z.string(), pass: z.number().int() }).nullable(),
      category: z.enum(['open', 'active', 'terminal']), flowId: z.string().nullable(),
    })),
    flows: z.array(z.object({ id: z.string(), nodes: z.array(z.object({ id: z.string() })), edges: z.array(z.object({ kind: z.string(), from: z.string(), to: z.string() })) })),
    tray: z.object({ count: z.number().int().min(0) }),
  });
  export const timelineChunkSchema = z.object({
    items: z.array(z.object({
      /** Part 4's `TimelineDetail`: the state's id and name; its category rides the index entry. */
      id: z.string(), title: z.string(), stateId: z.string(), stateName: z.string(),
      basis: z.enum(['explicit', 'chained']).nullable(),
    })),
    nextCursor: z.string().nullable(),
  });
  export const timelineTraySchema = z.object({
    items: z.array(z.object({ id: z.string(), key: z.string().nullable(), title: z.string(), reason: z.string() })),
    nextCursor: z.string().nullable(),
  });
  export type TimelineIndex = z.infer<typeof timelineIndexSchema>;
  ```

  **`timeline-window.ts`:**
  ```ts
  import type { Session } from '../session.js';
  import {
    TIMELINE_CHUNK_PATH, TIMELINE_INDEX_PATH, TIMELINE_TRAY_PATH, parseWire, timelineChunkSchema, timelineIndexSchema, timelineQuery, timelineTraySchema, type TimelineScope,
  } from './flow-seams.js';
  import { readOrNotFound } from './reads.js';

  export const CHUNK_DAYS = 28; // the app's paging unit (spec §4, Terms)
  export const MAX_WINDOW_DAYS = 180;
  const MAX_CHUNK_PAGES = 40; // a safety stop on a runaway cursor, not a product limit
  const DAY_MS = 86_400_000;
  const ms = (iso: string): number => Date.parse(`${iso}T00:00:00Z`);

  export const isIsoDay = (s: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(ms(s)).toISOString().slice(0, 10) === s;
  export const addDays = (iso: string, n: number): string => new Date(ms(iso) + n * DAY_MS).toISOString().slice(0, 10);
  export const daysBetween = (a: string, b: string): number => Math.round((ms(b) - ms(a)) / DAY_MS);
  /** The Monday on or before `iso` (the app's `mondayOnOrBefore`, `claims/dates.ts:93`). */
  export const mondayOnOrBefore = (iso: string): string => addDays(iso, -((new Date(ms(iso)).getUTCDay() + 6) % 7));
  /** The Mondays of the 28-day chunks that cover `[from, to]`. */
  export function chunkStarts(from: string, to: string): string[] {
    const out: string[] = [];
    for (let d = mondayOnOrBefore(from); d <= to; d = addDays(d, CHUNK_DAYS)) out.push(d);
    return out;
  }

  const splitKey = (key: string): [string, number] => {
    const m = /^(.*)-(\d+)$/.exec(key);
    return m === null ? [key, 0] : [m[1]!, Number(m[2])];
  };
  /** Natural key order (`GN-9` before `GN-10`); a missing key (a draft) sorts after every key (PK-1). */
  export function compareKeys(a: string | null, b: string | null): number {
    if (a === b) return 0;
    if (a === null) return 1;
    if (b === null) return -1;
    const [pa, na] = splitKey(a);
    const [pb, nb] = splitKey(b);
    return pa === pb ? na - nb : pa < pb ? -1 : 1;
  }

  export type TimelineAnswer = {
    today: string; from: string; to: string;
    items: Array<Record<string, unknown> & { id: string }>;
    flows: Array<{ id: string; nodes: string[]; edges: Array<{ kind: string; from: string; to: string }> }>;
    trayCount: number; tray?: Array<{ id: string; key: string | null; title: string; reason: string }>;
    truncated: boolean; nextCursor: string | null;
  };

  export const windowError = (from: string, to: string): string | null => {
    if (to < from) return 'to must not be before from.';
    const days = daysBetween(from, to) + 1;
    return days > MAX_WINDOW_DAYS ? `the window is ${days} days; get_timeline reads at most ${MAX_WINDOW_DAYS} days at a time. Narrow from and to, or call again for the next window.` : null;
  };

  /**
   * One window of the timeline, assembled from Part 4's three reads. The INDEX is the authority for segments (it covers the
   * whole scope, so rows never depend on what was fetched); the CHUNKS add title, state and basis for the window; the TRAY is
   * one page, on request. Stateless: every call re-reads, and the cursor is an offset into the sorted list.
   */
  export async function readTimeline(
    session: Session,
    scope: TimelineScope,
    opts: { from?: string | undefined; to?: string | undefined; includeTray: boolean; limit: number; cursor?: string | undefined },
  ): Promise<TimelineAnswer> {
    const index = parseWire(timelineIndexSchema, await readOrNotFound(session, `${TIMELINE_INDEX_PATH}?${timelineQuery(scope)}`, 'workspace'), 'timeline index');
    const from = opts.from ?? addDays(index.today, -14);
    const to = opts.to ?? addDays(index.today, 60);
    const bad = windowError(from, to);
    if (bad !== null) throw new Error(bad);

    const details = new Map<string, { title: string; stateId: string; stateName: string; basis: string | null }>();
    let truncated = index.truncated !== null;
    let pages = 0;
    for (const start of chunkStarts(from, to)) {
      let cursor: string | undefined;
      do {
        if (pages++ >= MAX_CHUNK_PAGES) { truncated = true; break; }
        const query = timelineQuery(scope, { from: start, to: addDays(start, CHUNK_DAYS - 1), ...(cursor === undefined ? {} : { cursor }) });
        const chunk = parseWire(timelineChunkSchema, await readOrNotFound(session, `${TIMELINE_CHUNK_PATH}?${query}`, 'workspace'), 'timeline chunk');
        for (const d of chunk.items) details.set(d.id, d);
        cursor = chunk.nextCursor ?? undefined;
      } while (cursor !== undefined);
    }

    const firstStart = (segments: Array<{ start: string }>): string => segments.reduce((min, s) => (s.start < min ? s.start : min), '9999-12-31');
    const inWindow = index.items
      .filter((e) => e.segments.some((s) => s.start <= to && s.end >= from))
      .sort((a, b) => firstStart(a.segments).localeCompare(firstStart(b.segments)) || compareKeys(a.key, b.key) || a.id.localeCompare(b.id));

    const offset = opts.cursor === undefined ? 0 : Number(opts.cursor);
    if (opts.cursor !== undefined && (!/^\d+$/.test(opts.cursor) || offset > inWindow.length)) throw new Error('cursor is not one this tool gave out');
    const slice = inWindow.slice(offset, offset + opts.limit);

    const seen = new Set<string>([...index.items.map((e) => e.id), ...index.flows.flatMap((f) => f.nodes.map((n) => n.id))]);
    const known = (id: string | null): string | null => (id !== null && seen.has(id) ? id : null);
    const items = slice.map((e) => {
      const d = details.get(e.id);
      return {
        id: e.id, key: e.key, draft: e.draft, title: d?.title ?? null, kind: e.kind, lane: e.lane, segments: e.segments, pin: e.pin,
        resolution: e.resolution === null ? null : { ...e.resolution, decisionTicketId: known(e.resolution.decisionTicketId) },
        basis: d?.basis ?? null, state: d === undefined ? null : { id: d.stateId, name: d.stateName, category: e.category }, flowId: e.flowId,
      };
    });
    const flowIds = new Set(items.map((i) => i.flowId).filter((f): f is string => f !== null));
    const flows = index.flows.filter((f) => flowIds.has(f.id)).map((f) => {
      const ids = new Set(f.nodes.map((n) => n.id));
      return { id: f.id, nodes: f.nodes.map((n) => n.id), edges: f.edges.filter((e) => ids.has(e.from) && ids.has(e.to)) };
    });

    const answer: TimelineAnswer = {
      today: index.today, from, to, items, flows, trayCount: index.tray.count, truncated,
      nextCursor: offset + opts.limit < inWindow.length ? String(offset + opts.limit) : null,
    };
    if (opts.includeTray) {
      answer.tray = parseWire(timelineTraySchema, await readOrNotFound(session, `${TIMELINE_TRAY_PATH}?${timelineQuery(scope)}`, 'workspace'), 'timeline tray').items;
    }
    return answer;
  }
  ```
  Notes for the implementer: `seen` covers entries AND flow members, because a flow lists members the Me / project scope leaves out of `items` and the caller can see them (spec PR-0, `flows[]`); a Decision outside both is hidden or out of scope, and its id is dropped. The tray is one page (`nextCursor` is deliberately not followed); `trayCount` tells the assistant how many exist.

  **`flow-tools.ts`:** add after `get_flow` (imports `readTimeline`, `isIsoDay`, `windowError` from `./timeline-window.js`):
  ```ts
      {
        name: 'get_timeline',
        description:
          'Read the timeline: who works on what, and when. Give workspaceId (one workspace) OR workspaceIds (several), optionally projectIds, and mine: true for only your own work (default: everything you can see). ' +
          'Window: from / to as YYYY-MM-DD, default 14 days back to 60 days ahead, at most 180 days; call again with the next window for more. Each item has its `segments` (real work periods, including those of a Not-taken ticket that was worked, planned intervals, the ghosts of branches a Decision left, and a one-day stub for a Not-taken ticket that never started), ' +
          '`basis` (explicit dates or chained from a predecessor), `state`, `pin` (how many notes and attachments it has), and a "Not taken" `resolution`. `flows` lists which items are connected. Items are ordered by start, then key; ' +
          'limit (default 200, at most 500) and cursor page them. includeTray: true also lists up to 200 tickets with no dates or estimate ("not on the timeline yet") with the reason; `trayCount` always says how many there are. Your own drafts are included, other people\'s never are.',
        inputSchema: timelineShape,
        handler: async (args) => {
          const a = z.object(timelineShape).parse(args);
          if (a.workspaceId === undefined && a.workspaceIds === undefined) throw new Error('get_timeline needs a scope: pass workspaceId (one workspace) or workspaceIds (several).');
          if (a.workspaceId !== undefined && a.workspaceIds !== undefined) throw new Error('get_timeline takes workspaceId OR workspaceIds, not both.');
          if (a.from !== undefined && a.to !== undefined) {
            const bad = windowError(a.from, a.to);
            if (bad !== null) throw new Error(bad);
          }
          return readTimeline(session, { workspaceIds: a.workspaceIds ?? [a.workspaceId!], projectIds: a.projectIds ?? [], mine: a.mine ?? false }, {
            from: a.from, to: a.to, includeTray: a.includeTray ?? false, limit: a.limit ?? 200, cursor: a.cursor,
          });
        },
      },
  ```
  and, above `flowTools`:
  ```ts
  const dayArg = z.string().refine(isIsoDay, 'a real day as YYYY-MM-DD');
  const timelineShape = {
    workspaceId: id.optional(), workspaceIds: z.array(id).min(1).max(20).optional(), projectIds: z.array(id).max(50).optional(),
    mine: z.boolean().optional(), from: dayArg.optional(), to: dayArg.optional(), includeTray: z.boolean().optional(),
    limit: z.number().int().min(1).max(500).optional(), cursor: z.string().regex(/^\d+$/).optional(),
  };
  ```

  **Pins:** `tool-names.ts`: `'get_timeline',` after `'get_flow',`; `tool-sweep.ts`: `get_timeline: { args: { workspaceId: 'w' }, session: { get: async (path: string) => (path.startsWith('/v1/timeline/index') ? { today: '2026-10-07', asOf: {}, truncated: null, items: [], flows: [], tray: { count: 0 } } : { items: [], nextCursor: null }) } },`; `register.test.ts` 14.555: `'get_timeline',` after `'get_flow',`; counts re-derived (tip + 1).

  Run (LOCAL): `…/slot-run.sh wtg5-t3-green -- pnpm --filter @gisik-nokma/mcp-server exec vitest run --maxWorkers=2 > /tmp/wtg5-t3-green.log 2>&1; tail -40 /tmp/wtg5-t3-green.log`.
  Expected: PASS including 14.80, 14.81, 14.555, 14.88. Flip 29.382 ✅ and the unit part of 29.383.
  Commit: `wtg-part5 T3: get_timeline`.

- [ ] **Step 4: The hosted cases**

  Append to `apps/server/test/mcp/mcp-flow.test.ts`:
  ```ts
  describe('29.382 29.383 get_timeline through the hosted door', () => {
    it('29.382 a dated ticket is an item with a planned segment, an undated one is in the tray, the window is explicit', async () => {
      const w = await buildDoorWorld(db, '3772');
      await ok(w, w.owner, 'update_ticket', { workspaceId: w.workspaceId, ticketId: w.ticketId, startDate: '2026-10-05', dueDate: '2026-10-09' });
      const out = (await ok(w, w.owner, 'get_timeline', { workspaceId: w.workspaceId, from: '2026-10-01', to: '2026-10-31', includeTray: true })) as {
        items: Array<{ id: string; segments: Array<{ start: string; end: string }>; pin: { notes: number } }>; tray: Array<{ id: string; reason: string }>; trayCount: number;
      };
      const item = out.items.find((i) => i.id === w.ticketId);
      expect(item?.segments.some((s) => s.start <= '2026-10-09' && s.end >= '2026-10-05')).toBe(true);
      expect(item?.pin).toEqual({ notes: 0, attachments: 0 });
      expect(out.tray.map((t) => t.id)).toContain(w.secondTicketId);
      expect(out.trayCount).toBeGreaterThanOrEqual(1);
      const wide = await callTool(w.app, w.owner.token, 'get_timeline', { workspaceId: w.workspaceId, from: '2026-01-01', to: '2026-12-31' }); // control: refused, same call narrowed above
      expect(wide.isError).toBe(true);
    });

    it('29.383 a stranger is answered uniformly; another author\'s draft is absent, the author sees theirs with key null', async () => {
      const w = await buildDoorWorld(db, '3773');
      const draft = await mk(w, w.owner, 'My draft', { draft: true });
      await ok(w, w.owner, 'update_ticket', { workspaceId: w.workspaceId, ticketId: draft, startDate: '2026-10-12', dueDate: '2026-10-14' });
      const args = { workspaceId: w.workspaceId, from: '2026-10-01', to: '2026-10-31' };
      const mine = (await ok(w, w.owner, 'get_timeline', args)) as { items: Array<{ id: string; key: string | null }> };
      expect(mine.items.find((i) => i.id === draft)).toMatchObject({ key: null });
      const theirs = (await ok(w, w.member, 'get_timeline', args)) as { items: Array<{ id: string }> };
      expect(JSON.stringify(theirs)).not.toContain(draft);
      const stranger = await callTool(w.app, w.stranger.token, 'get_timeline', args);
      expect(stranger.isError).toBe(true);
      expect(stranger.text).toBe('workspace not found or not visible to you');
    });
  });
  ```
  Run (LOCAL): `…/slot-run.sh wtg5-t3-hosted -- pnpm --filter @gisik-nokma/server exec vitest run test/mcp --maxWorkers=2 > /tmp/wtg5-t3-hosted.log 2>&1; tail -40 /tmp/wtg5-t3-hosted.log`. Expected: PASS. If the stranger sentence differs (the timeline route's uniform 404 may carry another body), copy the observed sentence and say so; the rule is "uniform and not an oracle".

- [ ] **Step 5: Features, sweeps, mutations, DONE**
  - **Features:** replace `<!-- wtg-part5-mcp T3 bullet -->` with `- ✅ **MCP: read the timeline** (Graph Part 5 T3; `packages/mcp-server/src/tools/timeline-window.ts`, `flow-tools.ts`) — `get_timeline` reads a window of up to 180 days over one or several workspaces (default 14 days back to 60 ahead), assembled from the timeline index, Monday-aligned 28-day chunks and an optional tray page; items are ordered by start and natural key and paged; pins are counts, Not-taken resolutions name only visible Decisions, and other people's drafts never appear. Cases 29.382–29.383.`
  - **Checks:** `node scripts/check-case-ids.mjs`, `pnpm check:citations`, `pnpm check:tasks`.
  - **Sweeps (LOCAL):** mcp-server WHOLE; server `test/mcp` WHOLE; the ui-copy scan.
  - **Mutations:**

    | Case | Mutation |
    |---|---|
    | 29.382 | `s.end > from` in the overlap filter → the boundary entry (ends on `from`) drops |
    | 29.382 | `chunkStarts` starts at `from` instead of the Monday → the chunk request list differs |
    | 29.382 | `compareKeys` plain string compare → `GN-10` before `GN-9` |
    | 29.383 | skip `known()` on the resolution → the hidden id appears in the serialised reply |
    | 29.383 | follow the tray `nextCursor` → the single-tray-page assertion reddens |

  Push. DONE.

---

### Task 4: `resolve_decision` (cases 29.384–29.386)

**Branch:** `task/wtg-part5-t4-resolve-decision` from `origin/release/workflow-graph`; PR `--base release/workflow-graph`. Starts after T3 has landed (strict order: the pin lines name the tool before). Code-level it needs T1's module, fixtures and world helpers and T2's `readFlow`, `flowNode`, `flowWire`.

**Files:**
- Create:
  - `packages/mcp-server/src/tools/decision.ts`
  - `packages/mcp-server/test/decision-tools.test.ts`
- Modify:
  - `packages/mcp-server/src/tools/flow-seams.ts` (append `DECIDE_PATH`, `decideDoorPlanSchema`, `DecideDoorPlan`, `decideFiledSchema`, `postDecide`)
  - `packages/mcp-server/src/tools/flow-tools.ts` (append `resolve_decision`)
  - Pins: `tool-names.ts`, `tool-sweep.ts`, `register.test.ts` (14.555), the two spelled counts
  - `apps/server/test/mcp/flow-seams.test.ts` (S5, S9), `apps/server/test/mcp/mcp-flow.test.ts`
  - Catalogue: `test-cases/29-…` under `<!-- wtg-part5-mcp T4 -->`, `Features.md` §26 under `<!-- wtg-part5-mcp T4 bullet -->`

**Interfaces:**
- **Consumes:** Graph Part 3 T11's Decide door (S5) and its origin rule (S9), exactly as T11 produces them (below), for EVERY choice (no event-door path); Part 2's folded `ticketState.outcome?` (S10), read once before the request to send as `from`; T2's `readFlow` (names the tickets the plan moves) and `parseWire`; `confirmOrPreview` (`preview.ts:17`, signature unchanged), `readOrNotFound`, `HttpError` (`http-client.ts:10`).
- **Produces:** `resolve_decision` in `flowTools`; pure helpers `toDecidePlan`, `hasEffects`, `previewSentence`, `planTickets` and the type `DecidePlan` (decision.ts); `postDecide` (flow-seams.ts).

**The Decide door this task consumes (S5 and S9, produced by Graph Part 3 T11; decisions D-W3-41 to D-W3-45; planner rulings P1 to P3).** `POST /v1/events` commits each event on its own (`apps/server/src/ingest/ingest-service.ts:432-445`), so the outcome and its finishing transition (DC-5) can be one batch only through Part 3's door, and every choice goes through it. Spelled only in `flow-seams.ts`:
```
POST /v1/workspaces/:workspaceId/tickets/:ticketId/decide
  body  { outcome: string | null, from?: string | null, closeStarted?: string[], dryRun?: boolean, finishStateId?: string | null }   (closed: no origin)
        finishStateId omitted -> finish into the FIRST-declared terminal state when one is reachable (D-W3-44)
        finishStateId null    -> record the outcome only: 'ticket.decided', no finish, no cascade
        finishStateId string  -> finish into that reachable terminal state, else 422 decision.bad-finish-state (this tool never sends one)
  dryRun true   -> 200 { plan: { moves: [{ ticketId, kind: 'reopen' | 'backlog' | 'not-taken' }], hiddenMoves: boolean, started: string[], blocked: { ticketId: string | null, reason: string, sentence: string } | null } }
                   (writes nothing; names only tickets on the caller's own walk; does NOT run the cascade-blocked / bad-close-started gates: `blocked` is the plan's own word, `sentence` the engine's reason text)
  dryRun absent -> 200 { filed: string[], pass: number, revised: { from: string | null, to: string | null } | null }   ('ticket.decided', plus 'ticket.transitioned' when it finished; one batch, origin from authKind)
  refusal       -> 409 { rule: 'decision.stale-from', reason } | 422 { rule, reason } (decision.not-a-decision, decision.unknown-outcome, decision.same-outcome, decision.bad-finish-state,
                   decision.cascade-blocked, decision.bad-close-started) | 400 { rule: 'ingest.<code>', reason } | the shared 404 for anything the caller may not see
```
`close` follows spec §14 (planner ruling P1): `close: true` (the default) omits `finishStateId`, `close: false` sends `null`. `postJson` (`submit.ts:93`) is not used: it rewords only a 400/422 body with `status` or `message` and rethrows a 409, so the door's `{rule, reason}` bodies get their own mapping, `postDecide`.

- [ ] **Step 1: The seam probes S5 and S9 (hosted, RED means STOP)**

  Append to `apps/server/test/mcp/flow-seams.test.ts`:
  ```ts
    it('SEAM S5 + S9 (Graph Part 3 T11): the Decide door previews without writing, records an outcome only on finishStateId null, files the outcome and the finish as one batch as the caller with origin mcp, answers pass and revised, and refuses a stale from with 409', async () => {
      const w = await buildDoorWorld(db, '3781');
      const decision = await mk(w, w.owner, 'Client decides', { typeId: 'decision' });
      const yes = await mk(w, w.owner, 'Pitch');
      const no = await mk(w, w.owner, 'Rework');
      await rawEvents(w, w.owner, [
        { entityId: decision, type: 'ticket.link_added', payload: { kind: 'leads_to', targetId: yes, label: 'Yes' } },
        { entityId: decision, type: 'ticket.link_added', payload: { kind: 'leads_to', targetId: no, label: 'No' } },
        { entityId: decision, type: 'ticket.transitioned', payload: { to: 'todo' } },
        { entityId: decision, type: 'ticket.transitioned', payload: { to: 'doing' } }, // one move from the finished status
      ]);
      const door = (extra: Record<string, unknown>, token = w.owner.token) => w.app.inject({
        method: 'POST', url: `/v1/workspaces/${w.workspaceId}/tickets/${decision}/decide`,
        headers: { authorization: `Bearer ${token}` }, payload: { outcome: 'Yes', from: null, closeStarted: [], ...extra },
      });
      const dry = await door({ dryRun: true });
      expect(dry.statusCode, 'S5: the Decide route exists').toBe(200);
      const plan = dry.json<{ plan: Record<string, unknown> }>().plan;
      for (const k of ['moves', 'hiddenMoves', 'started', 'blocked']) expect(plan, `S5 plan.${k}`).toHaveProperty(k);
      // `blocked` carries {ticketId, reason, sentence} when set (Part 3 T11, ruling P3); the schema in flow-seams.ts fails by naming a missing member
      expect(plan['moves'], 'S5: a move is {ticketId, kind}').toContainEqual({ ticketId: no, kind: 'not-taken' });
      const before = await db.pool.query(`SELECT count(*)::int AS n FROM events WHERE entity_id = $1 AND type = 'ticket.decided'`, [decision]);
      expect(before.rows[0].n, 'S5: a dry run writes nothing').toBe(0);
      const stale = await door({ from: 'Maybe' });
      expect(stale.statusCode, 'S5: a stale from is a 409').toBe(409);
      expect(stale.json<{ rule: string; reason: unknown }>()).toMatchObject({ rule: 'decision.stale-from', reason: expect.any(String) });
      expect((await door({ origin: 'web' })).statusCode, 'S5: the body is closed').toBe(400);
      const badFinish = await door({ finishStateId: 'todo' }); // not a terminal state
      expect(badFinish.statusCode, 'S5: a finishStateId that is not a reachable terminal state').toBe(422);
      expect(badFinish.json<{ rule: string }>().rule).toBe('decision.bad-finish-state');
      const recordOnly = await door({ outcome: 'No', finishStateId: null });
      expect(recordOnly.statusCode, `S5: ${recordOnly.body}`).toBe(200);
      expect(recordOnly.json(), 'S5: null records the outcome only').toEqual({ filed: ['ticket.decided'], pass: 1, revised: null });
      const real = await door({ from: 'No' }); // finishStateId omitted: the first-declared terminal state, one move away
      expect(real.statusCode, `S5: ${real.body}`).toBe(200);
      expect(real.json(), 'S5: the write answers what it filed, the pass and the revision').toEqual({ filed: ['ticket.decided', 'ticket.transitioned'], pass: 1, revised: { from: 'No', to: 'Yes' } });
      // the stranger is answered like any unknown ticket (the door runs the read gate first)
      expect((await door({ dryRun: true }, w.stranger.token)).statusCode, 'S5: a stranger').toBe(404);
      // S9: the batch is the caller's, origin mcp when the bearer is an MCP token (Part 3 T11: authKind)
      const rows = await db.pool.query<{ type: string; origin: string; actor_id: string }>(
        `SELECT type, origin, actor_id FROM events WHERE entity_id = $1 AND type IN ('ticket.decided', 'ticket.transitioned') ORDER BY seq DESC LIMIT 2`, [decision]);
      expect(rows.rows.map((r) => r.type).sort()).toEqual(['ticket.decided', 'ticket.transitioned']);
      expect(rows.rows.every((r) => r.actor_id === w.owner.userId), 'S9: filed as the caller').toBe(true);
      expect(rows.rows.every((r) => r.origin === 'mcp'), 'S9: authKind mcp-token files origin mcp').toBe(true);
    });
  ```
  Run (LOCAL): `…/slot-run.sh wtg5-t4-probe -- pnpm --filter @gisik-nokma/server exec vitest run test/mcp/flow-seams.test.ts --maxWorkers=2 > /tmp/wtg5-t4-probe.log 2>&1; tail -40 /tmp/wtg5-t4-probe.log`. Expected: PASS. A red probe is a STOP naming Part 3 (S5/S9). A different NAME (`dry_run`, `ticket_id`) is fixed in `flow-seams.ts` and the probe, and said in the handoff.
  Commit: `wtg-part5 T4: seam probes S5 S9`.

- [ ] **Step 2: Case lines and RED unit tests (29.384–29.386)**

  Case lines under `<!-- wtg-part5-mcp T4 -->`, all ❌:
  - `- ❌ **29.384 — `resolve_decision` files every choice through Graph Part 3's Decide door: with `close` (the default) the body omits `finishStateId`, so the door finishes the Decision into the workflow's first-declared terminal state when one is reachable, and the answer says `finish: {closed: true}` when the door's `filed` lists the transition, otherwise `finish: {closed: false, why: 'no-terminal-state-reachable'}` so the assistant can call `transition_ticket`; `close: false` sends `finishStateId: null` on both requests and records the outcome only (`why: 'close-not-requested'`); a clear (`outcome: null`) and a Decision already in a terminal state are not finished (`outcome-cleared`, `already-finished`); nothing ever goes through the event door;** control: the same unfinished Decision with `close` omitted finishes through the door. Mutation: send `finishStateId: null` whatever `close` says → the default-close case reddens.`
  - `- ❌ **29.385 — the tool reads the Decision's current outcome once and sends it as `from` on every request (null when there is none), so a first choice is a new pass, a different one a revision and a clear removes the outcome; `pass` and `revised` are the door's write answer passed through (`revised: {from, to}` or `null`), never re-read and never computed from the request; a stale `from` refused by the server (`decision.stale-from`, a 409) reaches the assistant verbatim and no write follows; a ticket that is not a Decision, an unknown outcome, the same outcome again and a bad `closeStarted` are the server's refusals verbatim;** control: the same call with the outcome the Decision really has is accepted. Mutation: send `from: null` always → the revision case reddens.`
  - `- ❌ **29.386 — the plan comes from the door's dry run, its moves named through the caller's own flow read: when it reopens, moves back to Backlog or closes any ticket (or says some moves are hidden), a call without `confirm_name` equal to the Decision's KEY (exact, case and spaces count) returns the house preview `{preview: true, wouldChange, counts: {reopened, backToBacklog, closedNotTaken}, nothingChanged: true, confirm}` plus `tickets`, `startedTickets`, `hiddenMoves` and writes NOTHING (only a `dryRun: true` request was sent); with the key it writes once, with `closeStarted` on both requests; a plan with no effects writes at once; a plan that says `blocked` is refused before any write as `refused by decision.cascade-blocked: <blocked.sentence>`, the engine's own sentence and nothing of the tool's, and the write's own refusals are the server's words;** control: the exact key on the same call writes, a lower-cased key is still a preview. Mutation: compare `confirm_name` case-insensitively → the wrong-case case reddens.`

  `packages/mcp-server/test/decision-tools.test.ts`:
  ```ts
  import { describe, expect, it } from 'vitest';
  import { HttpError } from '../src/http-client.js';
  import { planTickets, previewSentence, toDecidePlan } from '../src/tools/decision.js';
  import { flowTools } from '../src/tools/flow-tools.js';
  import { WS, detail, fakeFlow, flowNode, flowWire, ulid } from './fixtures/flow-fixtures.js';

  const D = ulid('DEC');
  const S1 = ulid('ST1'); // a started step on the branch being left
  const T1 = ulid('TK1');
  const T2 = ulid('TK2');
  const tw = `/v1/workspaces/${WS}/tickets`;
  const DECIDE = `${tw}/${D}/decide`;
  const FLOW = flowWire([
    flowNode(D, { key: 'GN-145', kind: 'decision' }), flowNode(T1, { key: 'GN-143' }), flowNode(S1, { key: 'GN-146' }), flowNode(T2, { key: 'GN-147' }),
  ]);
  const moved = (id: string, key: string) => ({ id, key, title: `Title ${key}` });
  const EMPTY = { reopened: [], backToBacklog: [], closedNotTaken: [], startedTickets: [], hiddenMoves: false };
  type Kind = 'reopen' | 'backlog' | 'not-taken';
  type Blocked = { ticketId: string | null; reason: string; sentence: string };
  const plan = (moves: Array<[string, Kind]> = [], extra: { hiddenMoves?: boolean; started?: string[]; blocked?: Blocked | null } = {}) =>
    ({ plan: { moves: moves.map(([ticketId, kind]) => ({ ticketId, kind })), hiddenMoves: false, started: [], blocked: null, ...extra } });
  /** The door's write answer (Part 3 T11, ruling P2): what it filed, the pass and the revision. */
  const filed = (types: string[] = ['ticket.decided', 'ticket.transitioned'], pass = 1, revised: { from: string | null; to: string | null } | null = null) => ({ filed: types, pass, revised });
  const isDry = (b: unknown) => (b as { dryRun?: boolean }).dryRun === true;
  const decisionDetail = (over: { stateId?: string; stateCategory?: string; outcome?: string | null } = {}) =>
    detail({ key: 'GN-145', typeId: 'decision', stateId: over.stateId ?? 'doing', stateCategory: over.stateCategory ?? 'active', outcome: over.outcome ?? null });
  /** The detail read answers `detail`; the door answers `posts`. No event batch is ever expected (every choice goes through the door). */
  const build = (opts: { detail?: unknown; posts?: (body: unknown) => unknown } = {}) =>
    fakeFlow(
      { [`${tw}/${D}`]: opts.detail ?? decisionDetail(), [`${tw}/${D}/flow`]: FLOW },
      { posts: { [DECIDE]: opts.posts ?? ((body: unknown) => (isDry(body) ? plan() : filed())) } },
    );
  const run = (f: ReturnType<typeof fakeFlow>, args: Record<string, unknown>) =>
    flowTools(f.session).find((t) => t.name === 'resolve_decision')!.handler({ workspaceId: WS, ticketId: D, outcome: 'Yes', ...args }) as Promise<Record<string, any>>;
  const bodies = (f: ReturnType<typeof fakeFlow>) => f.posts.map((p) => p.body as Record<string, unknown>);
  const detailReads = (f: ReturnType<typeof fakeFlow>) => f.gets.filter((p) => p === `${tw}/${D}`).length;
  const refuse = (status: number, rule: string, reason: string) => () => { throw new HttpError(status, { rule, reason }); };

  describe('29.384 every choice goes through the Decide door; close picks finishStateId', () => {
    it('29.384 close (the default) omits finishStateId and the door finishes; close: false sends finishStateId null on both requests and nothing finishes', async () => {
      const one = build();
      const out = await run(one, {});
      expect(bodies(one).map((b) => b['dryRun'])).toEqual([true, undefined]); // the dry run, then the write
      expect(bodies(one).every((b) => !('finishStateId' in b))).toBe(true); // omitted: the door's first-declared rule
      expect(one.batches).toEqual([]); // never the event door
      expect(out['finish']).toEqual({ closed: true });
      expect(out['filed']).toEqual(['ticket.decided', 'ticket.transitioned']);

      const keep = build({ posts: (b) => (isDry(b) ? plan() : filed(['ticket.decided'])) });
      expect((await run(keep, { close: false }))['finish']).toEqual({ closed: false, why: 'close-not-requested' });
      expect(bodies(keep).map((b) => [b['dryRun'], b['finishStateId']])).toEqual([[true, null], [undefined, null]]); // record only, on both requests
      expect(keep.batches).toEqual([]);
    });

    it('29.384 an outcome the door did not finish says so (the assistant can call transition_ticket)', async () => {
      const none = build({ detail: decisionDetail({ stateId: 'todo', stateCategory: 'open' }), posts: (b) => (isDry(b) ? plan() : filed(['ticket.decided'])) });
      const n = await run(none, {});
      expect(n).toMatchObject({ filed: ['ticket.decided'], cascade: 'none', finish: { closed: false, why: 'no-terminal-state-reachable' } });
      expect(bodies(none).every((b) => !('finishStateId' in b))).toBe(true); // control: close was asked for; the door found nothing to finish into
    });

    it('29.384 a clear and an already finished Decision go through the door, which does not finish them', async () => {
      const clear = build({ detail: decisionDetail({ outcome: 'Yes' }), posts: (b) => (isDry(b) ? plan() : filed(['ticket.decided'], 1, { from: 'Yes', to: null })) });
      expect((await run(clear, { outcome: null }))['finish']).toEqual({ closed: false, why: 'outcome-cleared' });
      expect(bodies(clear).every((b) => b['outcome'] === null && b['from'] === 'Yes')).toBe(true);
      expect(clear.batches).toEqual([]);
      const finished = build({ detail: decisionDetail({ stateId: 'done', stateCategory: 'terminal', outcome: 'No' }), posts: (b) => (isDry(b) ? plan() : filed(['ticket.decided'], 1, { from: 'No', to: 'Yes' })) });
      expect((await run(finished, { outcome: 'Yes' }))['finish']).toEqual({ closed: false, why: 'already-finished' });
      expect(bodies(finished)).toHaveLength(2);
    });

    it('29.384 a draft cannot be decided; nothing is sent', async () => {
      const f = build({ detail: detail({ key: null, draft: true, typeId: 'decision' }) });
      await expect(run(f, {})).rejects.toThrow('a draft cannot be decided: publish it first');
      expect(f.posts).toEqual([]);
      expect(f.batches).toEqual([]);
    });
  });

  describe('29.385 the pass, the revision, the stale guard', () => {
    it('29.385 sends the current outcome as from on every request; pass and revised are the write\'s own answer, never re-read', async () => {
      const first = build();
      expect(await run(first, {})).toMatchObject({ pass: 1, revised: null, cascade: 'none' });
      expect(bodies(first).map((b) => b['from'])).toEqual([null, null]); // no outcome yet: a new pass
      expect(detailReads(first)).toBe(1); // read once, before the request; never after the write

      const finished = { stateId: 'done', stateCategory: 'terminal', outcome: 'Yes' };
      const revise = build({ detail: decisionDetail(finished), posts: (b) => (isDry(b) ? plan() : filed(['ticket.decided'], 1, { from: 'Yes', to: 'No' })) });
      const out = await run(revise, { outcome: 'No' });
      expect(bodies(revise).map((b) => [b['outcome'], b['from']])).toEqual([['No', 'Yes'], ['No', 'Yes']]);
      expect(out).toMatchObject({ filed: ['ticket.decided'], pass: 1, revised: { from: 'Yes', to: 'No' }, cascade: 'none' });

      // the server's answer is the answer even when the request looks like a revision: a re-run loop released the outcome into pass 2
      const rerun = build({ detail: decisionDetail(finished), posts: (b) => (isDry(b) ? plan() : filed(['ticket.decided'], 2, null)) });
      expect(await run(rerun, { outcome: 'No' })).toMatchObject({ pass: 2, revised: null });

      const alone = build({ detail: decisionDetail({ outcome: 'Yes' }), posts: (b) => (isDry(b) ? plan() : filed(['ticket.decided'], 1, { from: 'Yes', to: 'No' })) });
      expect(await run(alone, { outcome: 'No', close: false })).toMatchObject({ pass: 1, revised: { from: 'Yes', to: 'No' } });
      expect(bodies(alone).map((b) => [b['from'], b['finishStateId']])).toEqual([['Yes', null], ['Yes', null]]);
    });

    it('29.385 a write answer without pass is a named failure, not a guess', async () => {
      const f = build({ posts: (b) => (isDry(b) ? plan() : { filed: ['ticket.decided'] }) });
      await expect(run(f, {})).rejects.toThrow(/pass/);
    });

    it('29.385 a stale from, an unknown outcome, the same outcome and a non-Decision are the server\'s words, and no write follows the refusal', async () => {
      const stale = build({ detail: decisionDetail({ outcome: 'Yes' }), posts: refuse(409, 'decision.stale-from', 'The decision changed to Maybe since you looked.') });
      await expect(run(stale, { outcome: null })).rejects.toThrow('refused by decision.stale-from: The decision changed to Maybe since you looked.');
      expect(bodies(stale)).toHaveLength(1); // only the dry run; the write never followed
      const staleKeep = build({ detail: decisionDetail({ outcome: 'Yes' }), posts: refuse(409, 'decision.stale-from', 'The decision changed to No since you looked.') });
      await expect(run(staleKeep, { outcome: 'Maybe', close: false })).rejects.toThrow('refused by decision.stale-from: The decision changed to No since you looked.');
      const unknown = build({ posts: refuse(422, 'decision.unknown-outcome', 'Choose one of: Yes, No.') });
      await expect(run(unknown, { outcome: 'Perhaps' })).rejects.toThrow('refused by decision.unknown-outcome: Choose one of: Yes, No.');
      const same = build({ detail: decisionDetail({ stateId: 'done', stateCategory: 'terminal', outcome: 'Yes' }), posts: refuse(422, 'decision.same-outcome', 'That is already the outcome.') });
      await expect(run(same, { outcome: 'Yes' })).rejects.toThrow('refused by decision.same-outcome: That is already the outcome.');
      const notDecision = build({ detail: detail({ key: 'GN-2', typeId: 'task', stateId: 'doing', stateCategory: 'active' }), posts: refuse(422, 'decision.not-a-decision', 'Only a decision can be given an outcome.') });
      await expect(run(notDecision, {})).rejects.toThrow('refused by decision.not-a-decision: Only a decision can be given an outcome.');
      const control = build({ detail: decisionDetail({ stateId: 'done', stateCategory: 'terminal', outcome: 'Yes' }), posts: (b) => (isDry(b) ? plan() : filed(['ticket.decided'], 1, { from: 'Yes', to: 'No' })) });
      await expect(run(control, { outcome: 'No' })).resolves.toMatchObject({ filed: ['ticket.decided'] }); // control: the right from is accepted
    });

    it('29.385 a 404 on the Decision or on its door is the one-sentence not-found', async () => {
      await expect(run(fakeFlow({}, { posts: {} }), {})).rejects.toThrow('ticket not found or not visible to you');
      const gone = build({ posts: () => { throw new HttpError(404, { error: 'not_found' }); } });
      await expect(run(gone, {})).rejects.toThrow('ticket not found or not visible to you');
    });
  });

  describe('29.386 the preview and the write', () => {
    const effects = plan([[T2, 'not-taken'], [T1, 'reopen']], { started: [S1] });
    const withEffects = (more: Record<string, unknown> = {}) => build({ posts: (b) => (isDry(b) ? { plan: { ...effects.plan, ...more } } : filed()) });

    it('29.386 toDecidePlan names the door\'s moves through the caller\'s flow', () => {
      expect(toDecidePlan(effects.plan, FLOW.nodes)).toEqual({
        reopened: [{ id: T1, key: 'GN-143', title: FLOW.nodes[1]!.title }], backToBacklog: [], closedNotTaken: [{ id: T2, key: 'GN-147', title: FLOW.nodes[3]!.title }],
        startedTickets: [{ id: S1, key: 'GN-146', title: FLOW.nodes[2]!.title }], hiddenMoves: false,
      });
      expect(toDecidePlan(plan([[T1, 'backlog']]).plan, []).backToBacklog).toEqual([{ id: T1, key: null, title: T1 }]); // a ticket the flow read did not list keeps its id
    });

    it('29.386 a plan with effects and no confirm_name is a preview and writes nothing; a lower-cased key is still a preview', async () => {
      const f = withEffects();
      const out = await run(f, {});
      expect(out).toMatchObject({
        preview: true, nothingChanged: true, confirm: 'confirm_name must be "GN-145"',
        counts: { reopened: 1, backToBacklog: 0, closedNotTaken: 1 },
        tickets: [{ key: 'GN-143', move: 'reopened' }, { key: 'GN-147', move: 'closed-not-taken' }],
        startedTickets: [{ id: S1, key: 'GN-146' }], hiddenMoves: false,
      });
      expect(out['wouldChange']).toContain('reopens GN-143');
      expect(out['wouldChange']).toContain('closes GN-147 as Not taken');
      expect(bodies(f).map((b) => b['dryRun'])).toEqual([true]); // the recorded requests: the preview sent no write
      expect(f.batches).toEqual([]);
      const lower = withEffects();
      expect((await run(lower, { confirm_name: 'gn-145' }))['preview']).toBe(true);
      expect(bodies(lower).map((b) => b['dryRun'])).toEqual([true]);
    });

    it('29.386 the exact key writes once, closeStarted rides both requests; a plan with no effects writes at once', async () => {
      const f = withEffects();
      const out = await run(f, { confirm_name: 'GN-145', closeStarted: [S1] });
      expect(bodies(f).map((b) => [b['dryRun'], b['closeStarted']])).toEqual([[true, [S1]], [undefined, [S1]]]);
      expect(out).toMatchObject({ filed: ['ticket.decided', 'ticket.transitioned'], cascade: 'pending' });
      expect(out).not.toHaveProperty('preview');
      const quiet = build();
      const q = await run(quiet, {}); // no confirm_name: nothing moves
      expect(bodies(quiet).map((b) => b['dryRun'])).toEqual([true, undefined]);
      expect(q['cascade']).toBe('none');
      const hidden = withEffects({ moves: [], started: [], hiddenMoves: true });
      const h = await run(hidden, {});
      expect(h['preview']).toBe(true); // moves the caller cannot see still need the key
      expect(h['wouldChange']).toContain("Some steps you can't see will also move.");
    });

    it('29.386 a blocked plan is refused before any write with the engine\'s own sentence; the write\'s own refusals are the server\'s words', async () => {
      const blockedBy = (blocked: Blocked) => build({ posts: () => plan([[T2, 'not-taken']], { blocked }) });
      const named = blockedBy({ ticketId: T2, reason: 'child-open', sentence: 'GN-147 has an open child ticket.' });
      await expect(run(named, { confirm_name: 'GN-145' })).rejects.toThrow(/^refused by decision\.cascade-blocked: GN-147 has an open child ticket\.$/); // the sentence verbatim, nothing of the tool's
      expect(bodies(named)).toHaveLength(1);
      const hidden = blockedBy({ ticketId: null, reason: 'child-open', sentence: "A step you can't see has an open child ticket." });
      await expect(run(hidden, { confirm_name: 'GN-145' })).rejects.toThrow(/^refused by decision\.cascade-blocked: A step you can't see has an open child ticket\.$/);
      const raced = build({ posts: (b) => (isDry(b) ? plan() : refuse(422, 'decision.cascade-blocked', 'GN-147 has an open child.')()) });
      await expect(run(raced, {})).rejects.toThrow('refused by decision.cascade-blocked: GN-147 has an open child.');
      const badStarted = build({ posts: (b) => (isDry(b) ? plan() : refuse(422, 'decision.bad-close-started', 'GN-146 is not a started step on the branch being left.')()) });
      await expect(run(badStarted, { closeStarted: [S1] })).rejects.toThrow('refused by decision.bad-close-started: GN-146 is not a started step on the branch being left.');
    });

    it('29.386 previewSentence and planTickets', () => {
      const p = { ...EMPTY, reopened: [moved(T1, 'GN-143')], backToBacklog: [moved(S1, 'GN-144'), moved(T2, 'GN-145')], closedNotTaken: [] };
      expect(previewSentence(p, { outcome: 'Needs rework', revised: false })).toBe('Choosing "Needs rework" reopens GN-143 and puts GN-144, GN-145 back in Backlog.');
      expect(previewSentence({ ...EMPTY, closedNotTaken: [moved(T2, 'GN-147')] }, { outcome: null, revised: false })).toBe('Clearing the decision closes GN-147 as Not taken.');
      expect(previewSentence({ ...EMPTY, closedNotTaken: [moved(T2, 'GN-147')], startedTickets: [moved(S1, 'GN-146'), moved(T1, 'GN-148')] }, { outcome: 'No', revised: true }))
        .toBe('Changing the decision to "No" closes GN-147 as Not taken. 2 started steps on the branch being left keep going unless you name them in closeStarted.');
      expect(planTickets(p).map((t) => [t.key, t.move])).toEqual([['GN-143', 'reopened'], ['GN-144', 'back-to-backlog'], ['GN-145', 'back-to-backlog']]);
    });
  });
  ```
  Run (LOCAL): `…/slot-run.sh wtg5-t4-red -- pnpm --filter @gisik-nokma/mcp-server exec vitest run test/decision-tools.test.ts --maxWorkers=2 > /tmp/wtg5-t4-red.log 2>&1; tail -40 /tmp/wtg5-t4-red.log`. Expected: FAIL (`decision.ts` does not exist).

- [ ] **Step 3: Implement**

  **`flow-seams.ts`** (append; add `import { HttpError } from '../http-client.js';` and `import type { Session } from '../session.js';` at the top):
  ```ts
  /** Graph Part 3 T11: the Decide door (see the plan's T4 header). Probe S5. */
  export const DECIDE_PATH = (workspaceId: string, ticketId: string): string => `/v1/workspaces/${enc(workspaceId)}/tickets/${enc(ticketId)}/decide`;
  /** Part 3 T11 `DecidePlanRead`: named only for the caller's own walk; `blocked.ticketId` is null when the blocker is hidden, `blocked.sentence` is the engine's reason text (ruling P3). */
  export const decideDoorPlanSchema = z.object({
    plan: z.object({
      moves: z.array(z.object({ ticketId: z.string(), kind: z.enum(['reopen', 'backlog', 'not-taken']) })),
      hiddenMoves: z.boolean(),
      started: z.array(z.string()),
      blocked: z.object({ ticketId: z.string().nullable(), reason: z.string(), sentence: z.string().min(1) }).nullable(),
    }),
  });
  export type DecideDoorPlan = z.infer<typeof decideDoorPlanSchema>['plan'];
  /** Part 3 T11's write answer (ruling P2): what it filed, the pass the choice landed in, and the revision it made (null for a new pass). */
  export const decideFiledSchema = z.object({
    filed: z.array(z.string()).min(1),
    pass: z.number().int().min(1),
    revised: z.object({ from: z.string().nullable(), to: z.string().nullable() }).nullable(),
  });

  /**
   * POST to the Decide door with its refusals in the server's own words. The door answers `{rule, reason}` with no `status`
   * (409 for a stale `from`, 422 for the rest, 400 `ingest.<code>`), which `postJson` would print as raw JSON, and the shared
   * 404 for anything the caller may not see, which `postJson` rethrows. Everything else is rethrown untouched.
   */
  export async function postDecide(session: Session, path: string, body: unknown): Promise<unknown> {
    try {
      return await session.post(path, body);
    } catch (error) {
      if (!(error instanceof HttpError)) throw error;
      if (error.status === 404) throw new Error('ticket not found or not visible to you');
      const b = (error.body ?? {}) as Record<string, unknown>;
      if ([400, 409, 422].includes(error.status) && typeof b['rule'] === 'string' && typeof b['reason'] === 'string') throw new Error(`refused by ${b['rule']}: ${b['reason']}`);
      if (error.status === 400 && typeof b['message'] === 'string') throw new Error(b['message']);
      throw error;
    }
  }
  ```

  **`decision.ts`:**
  ```ts
  import type { DecideDoorPlan } from './flow-seams.js';

  type Moved = { id: string; key: string | null; title: string };
  /** The plan as the tool shows it: the door's moves, named. */
  export type DecidePlan = { reopened: Moved[]; backToBacklog: Moved[]; closedNotTaken: Moved[]; startedTickets: Moved[]; hiddenMoves: boolean };

  /** The door's plan with each ticket named from the caller's own flow read (the door names only tickets on that walk, D-W3-43). */
  export function toDecidePlan(door: DecideDoorPlan, nodes: ReadonlyArray<{ id: string; key: string | null; title: string }>): DecidePlan {
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const named = (id: string): Moved => {
      const n = byId.get(id);
      return n === undefined ? { id, key: null, title: id } : { id, key: n.key, title: n.title };
    };
    const of = (kind: DecideDoorPlan['moves'][number]['kind']): Moved[] => door.moves.filter((m) => m.kind === kind).map((m) => named(m.ticketId));
    return { reopened: of('reopen'), backToBacklog: of('backlog'), closedNotTaken: of('not-taken'), startedTickets: door.started.map(named), hiddenMoves: door.hiddenMoves };
  }

  const name = (t: Moved): string => t.key ?? t.title;
  const list = (ts: Moved[]): string => ts.map(name).join(', ');

  /** The tickets the plan moves, in the order a person reads them: reopened, back to Backlog, closed Not taken. */
  export function planTickets(plan: DecidePlan): Array<{ key: string | null; title: string; move: 'reopened' | 'back-to-backlog' | 'closed-not-taken' }> {
    return [
      ...plan.reopened.map((t) => ({ key: t.key, title: t.title, move: 'reopened' as const })),
      ...plan.backToBacklog.map((t) => ({ key: t.key, title: t.title, move: 'back-to-backlog' as const })),
      ...plan.closedNotTaken.map((t) => ({ key: t.key, title: t.title, move: 'closed-not-taken' as const })),
    ];
  }

  export const hasEffects = (plan: DecidePlan): boolean =>
    plan.reopened.length + plan.backToBacklog.length + plan.closedNotTaken.length > 0 || plan.hiddenMoves;

  function joinAnd(parts: string[]): string {
    return parts.length <= 1 ? (parts[0] ?? '') : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`;
  }

  /** PS-6's wording: "This reopens GN-143 and puts GN-144 back in Backlog", "Some steps you can't see will also move". */
  export function previewSentence(plan: DecidePlan, ctx: { outcome: string | null; revised: boolean }): string {
    const lead = ctx.outcome === null ? 'Clearing the decision' : ctx.revised ? `Changing the decision to "${ctx.outcome}"` : `Choosing "${ctx.outcome}"`;
    const parts: string[] = [];
    if (plan.reopened.length > 0) parts.push(`reopens ${list(plan.reopened)}`);
    if (plan.backToBacklog.length > 0) parts.push(`puts ${list(plan.backToBacklog)} back in Backlog`);
    if (plan.closedNotTaken.length > 0) parts.push(`closes ${list(plan.closedNotTaken)} as Not taken`);
    let sentence = `${parts.length > 0 ? `${lead} ${joinAnd(parts)}.` : `${lead}.`}${plan.hiddenMoves ? " Some steps you can't see will also move." : ''}`;
    if (plan.startedTickets.length > 0) {
      const n = plan.startedTickets.length;
      sentence += ` ${n} started step${n === 1 ? '' : 's'} on the branch being left keep${n === 1 ? 's' : ''} going unless you name ${n === 1 ? 'it' : 'them'} in closeStarted.`;
    }
    return sentence;
  }
  ```
  In `previewSentence` the test strings above are the contract: `Choosing "Needs rework" reopens GN-143 and puts GN-144, GN-145 back in Backlog.`; `Clearing the decision closes GN-147 as Not taken.`; `Changing the decision to "No" closes GN-147 as Not taken. 2 started steps on the branch being left keep going unless you name them in closeStarted.` The preview's lead word follows `from !== null` (a Decision that has an outcome is being changed); the ANSWER's `revised` is the fold's, read after the write.

  **`flow-tools.ts`:** add after `get_timeline` (imports `confirmOrPreview` from `./preview.js`; `readOrNotFound` from `./reads.js`; `DECIDE_PATH`, `decideDoorPlanSchema`, `decideFiledSchema`, `postDecide`, `parseWire`, `isDraftDetail` from `./flow-seams.js`; `hasEffects`, `planTickets`, `previewSentence`, `toDecidePlan` from `./decision.js`; `readFlow` from `./flow-answer.js`. No event-door import: every choice goes through the Decide door):
  ```ts
      {
        name: 'resolve_decision',
        description:
          'Record which way a Decision goes. outcome is one of the labels on the arrows leaving it, or null to clear the choice. A first choice is a new pass; a different choice later is a REVISION of the current pass ' +
          '(it is recorded as one); clearing returns the steps the Decision had marked "Not taken" to Backlog. By default (close: true) the Decision is also finished in the same step, into the workflow\'s first finished status when one can be reached; ' +
          'close: false records the outcome only. When the Decision is not finished, `finish.why` says why; use transition_ticket to finish it. Choosing can move OTHER tickets: reopen a loop, send its steps back to Backlog, close the branch not taken. ' +
          'When it would, confirm_name must be the Decision\'s KEY (e.g. GN-145); without it you get a preview of exactly what would move and nothing changes. closeStarted lists started steps on the branch being left to close as "Not taken" ' +
          '(default: they keep going; the preview lists them). The moves are made by the flow a moment after this call and show in get_flow. Revise it, or clear it with outcome null, to undo.',
        inputSchema: { workspaceId: id, ticketId: id, outcome: z.string().min(1).nullable(), close: z.boolean().optional(), closeStarted: z.array(id).max(50).optional(), confirm_name: z.string().optional() },
        handler: async (args) => {
          const a = z.object({ workspaceId: id, ticketId: id, outcome: z.string().min(1).nullable(), close: z.boolean().optional(), closeStarted: z.array(id).max(50).optional(), confirm_name: z.string().optional() }).parse(args);
          const ticket = await readDecision(session, a.workspaceId, a.ticketId);
          if (isDraftDetail(ticket)) throw new Error('a draft cannot be decided: publish it first (publish_draft, or publish_flow for the whole flow).');
          const from = ticket.ticketState.outcome ?? null;
          const close = a.close ?? true;
          const door = DECIDE_PATH(a.workspaceId, a.ticketId);
          // Spec §14 `close` (ruling P1): close (the default) omits finishStateId, so the door finishes into the first-declared terminal state
          // when one is reachable; close: false sends null, which records the outcome only. The same body rides both requests.
          const body = { outcome: a.outcome, from, closeStarted: a.closeStarted ?? [], ...(close ? {} : { finishStateId: null }) };
          // The server's own plan, with the steps the caller cannot see counted: nothing is written by this request.
          const dry = parseWire(decideDoorPlanSchema, await postDecide(session, door, { ...body, dryRun: true }), 'decide plan').plan;
          // The engine's own sentence, verbatim (ruling P3): nothing has been written.
          if (dry.blocked !== null) throw new Error(`refused by decision.cascade-blocked: ${dry.blocked.sentence}`);
          const nodes = dry.moves.length + dry.started.length > 0 ? (await readFlow(session, a.workspaceId, a.ticketId)).nodes : [];
          const plan = toDecidePlan(dry, nodes);
          if (hasEffects(plan)) {
            const preview = await confirmOrPreview(ticket.key ?? a.ticketId, a.confirm_name, async () => ({
              sentence: previewSentence(plan, { outcome: a.outcome, revised: from !== null }),
              counts: { reopened: plan.reopened.length, backToBacklog: plan.backToBacklog.length, closedNotTaken: plan.closedNotTaken.length },
            }));
            if (preview !== null) return { ...preview, tickets: planTickets(plan), startedTickets: plan.startedTickets, hiddenMoves: plan.hiddenMoves };
          }
          const written = parseWire(decideFiledSchema, await postDecide(session, door, body), 'decide');
          // pass and revised are the door's own answer (ruling P2): no re-read.
          return { filed: written.filed, pass: written.pass, revised: written.revised, cascade: hasEffects(plan) ? 'pending' : 'none', finish: finishAnswer(ticket, { outcome: a.outcome, close }, written.filed) };
        },
      },
  ```
  and, above `flowTools` (same file):
  ```ts
  const TICKET_PATH = (workspaceId: string, ticketId: string): string => `/v1/workspaces/${encodeURIComponent(workspaceId)}/tickets/${encodeURIComponent(ticketId)}`;
  const decisionTicketSchema = z.object({
    key: z.string().nullable(),
    ticketState: z.object({
      draft: z.unknown().optional(), // Drafts T4 G7: present on a draft (isDraftDetail)
      stateId: z.string(), stateCategory: z.string(),
      outcome: z.string().nullable().optional(), // Part 2: absent when there is none
    }),
  });
  type DecisionTicket = z.infer<typeof decisionTicketSchema>;
  const readDecision = async (session: Session, workspaceId: string, ticketId: string): Promise<DecisionTicket> =>
    parseWire(decisionTicketSchema, await readOrNotFound(session, TICKET_PATH(workspaceId, ticketId), 'ticket'), 'ticket');

  /** What happened to the Decision itself, from the request and the door's own `filed` list (no re-read). */
  function finishAnswer(ticket: DecisionTicket, ask: { outcome: string | null; close: boolean }, filed: readonly string[]): Record<string, unknown> {
    if (ask.outcome === null) return { closed: false, why: 'outcome-cleared' };
    if (ticket.ticketState.stateCategory === 'terminal') return { closed: false, why: 'already-finished' };
    if (!ask.close) return { closed: false, why: 'close-not-requested' };
    return filed.includes('ticket.transitioned') ? { closed: true } : { closed: false, why: 'no-terminal-state-reachable' };
  }
  ```
  Notes: the Decision's `ticketState.outcome` is Part 2's member (S10), read once to send as `from`; `parseWire` fails by naming a missing member if Part 2 spelled it differently, and fails the same way on a write answer without `pass` or `revised` (Part 3 T11). `closeStarted` is sent on BOTH door requests and is not checked client-side: the server owns `decision.bad-close-started` (PS-9) and answers in its own words. A `ticket` read of a task (not a Decision) passes `decisionTicketSchema`, and the door's dry run is what refuses it (`decision.not-a-decision`, verbatim). The door's write is sent WITHOUT `dryRun` (Part 3's own client does the same, 29.279).

  **Pins:** `tool-names.ts`: `'resolve_decision',` after `'get_timeline',`; `tool-sweep.ts`:
  ```ts
  resolve_decision: {
    args: { workspaceId: 'w', ticketId: 't', outcome: null },
    session: {
      get: async () => ({ key: 'GN-1', ticketState: { stateId: 'doing', stateCategory: 'active' } }),
      post: async (_p, body) => ((body as { dryRun?: boolean }).dryRun === true ? { plan: { moves: [], hiddenMoves: false, started: [], blocked: null } } : { filed: ['ticket.decided'], pass: 1, revised: null }),
    },
  },
  ```
  `register.test.ts` 14.555: `'resolve_decision',` after `'get_timeline',`; counts re-derived.

  Run (LOCAL): `…/slot-run.sh wtg5-t4-green -- pnpm --filter @gisik-nokma/mcp-server exec vitest run --maxWorkers=2 > /tmp/wtg5-t4-green.log 2>&1; tail -40 /tmp/wtg5-t4-green.log`.
  Expected: PASS including 14.80, 14.81, 14.555, 14.88. Flip 29.384–29.386 ✅ (the hosted parts after Step 4).
  Commit: `wtg-part5 T4: resolve_decision`.

- [ ] **Step 4: The hosted cases (a branch, a revision, a clear, the cascade)**

  Append to `apps/server/test/mcp/mcp-flow.test.ts`:
  ```ts
  describe('29.384 29.385 29.386 resolve_decision through the hosted door', () => {
    const world = async (tail: string) => {
      const w = await buildDoorWorld(db, tail);
      const decision = await mk(w, w.owner, 'Client decides', { typeId: 'decision' });
      const yes = await mk(w, w.owner, 'Pitch');
      const no = await mk(w, w.owner, 'Rework');
      const link = (targetId: string, label: string) => ok(w, w.owner, 'link_tickets', { workspaceId: w.workspaceId, ticketId: decision, targetId, kind: 'leads_to', action: 'add', label });
      await link(yes, 'Yes');
      await link(no, 'No');
      return { w, decision, yes, no };
    };
    const state = async (w: Awaited<ReturnType<typeof buildDoorWorld>>, ticketId: string) =>
      (await ok(w, w.owner, 'get_ticket', { workspaceId: w.workspaceId, ticketId })) as { key: string; ticketState: { stateId: string; outcome?: string | null }; resolution?: { kind: string; outcome: string; decision: { id: string } | null }; passes?: Array<{ pass: number; outcome: string | null; revisions: unknown[] }> };

    it('29.384 29.386 a branch: the preview names what would close and writes nothing; the key writes through the door; the flow closes the other branch Not taken', async () => {
      const { w, decision, yes, no } = await world('3791');
      await ok(w, w.owner, 'transition_ticket', { workspaceId: w.workspaceId, ticketId: decision, to: 'todo' });
      await ok(w, w.owner, 'transition_ticket', { workspaceId: w.workspaceId, ticketId: decision, to: 'doing' });
      const key = (await state(w, decision)).key;
      const preview = (await ok(w, w.owner, 'resolve_decision', { workspaceId: w.workspaceId, ticketId: decision, outcome: 'Yes' })) as { preview?: boolean; tickets: Array<{ key: string | null; move: string }> };
      expect(preview.preview).toBe(true);
      expect(preview.tickets).toContainEqual(expect.objectContaining({ key: (await state(w, no)).key, move: 'closed-not-taken' })); // named through the caller's flow read
      expect((await state(w, decision)).ticketState.outcome ?? null).toBeNull(); // the preview wrote nothing
      const lower = (await ok(w, w.owner, 'resolve_decision', { workspaceId: w.workspaceId, ticketId: decision, outcome: 'Yes', confirm_name: key.toLowerCase() })) as { preview?: boolean };
      expect(lower.preview).toBe(true); // control: only the exact key writes
      const written = (await ok(w, w.owner, 'resolve_decision', { workspaceId: w.workspaceId, ticketId: decision, outcome: 'Yes', confirm_name: key })) as { filed: string[]; pass: number; revised: { from: string | null; to: string | null } | null; cascade: string; finish: { closed: boolean } };
      expect(written).toMatchObject({ filed: ['ticket.decided', 'ticket.transitioned'], pass: 1, revised: null, cascade: 'pending', finish: { closed: true } });
      const after = await state(w, decision);
      expect(after.ticketState.stateId).toBe('done');
      expect(after.passes?.map((p) => [p.pass, p.outcome])).toEqual([[1, 'Yes']]);
      const notTaken = await until('the flow closing the other branch', async () => {
        const t = await state(w, no);
        return t.resolution?.kind === 'not-taken' ? t : null;
      });
      expect(notTaken.resolution).toMatchObject({ kind: 'not-taken', outcome: 'Yes', decision: { id: decision } });
      expect((await state(w, yes)).resolution).toBeUndefined(); // the chosen branch is not touched
    });

    it('29.385 a revision is recorded as one and a clear removes the outcome; every decided event is the caller\'s, origin mcp', async () => {
      const { w, decision } = await world('3792');
      // close: false sends finishStateId null: the Decide door records the outcome only, the Decision stays unfinished and nothing else moves
      const call = (args: Record<string, unknown>) => ok(w, w.owner, 'resolve_decision', { workspaceId: w.workspaceId, ticketId: decision, close: false, ...args });
      const key = (await state(w, decision)).key;
      expect(await call({ outcome: 'Yes' })).toMatchObject({ filed: ['ticket.decided'], pass: 1, revised: null, cascade: 'none', finish: { closed: false, why: 'close-not-requested' } });
      expect((await state(w, decision)).passes).toHaveLength(1);
      expect(await call({ outcome: 'No' })).toMatchObject({ pass: 1, revised: { from: 'Yes', to: 'No' } }); // the door's own answer
      const mid = await state(w, decision);
      expect(mid.ticketState.outcome).toBe('No');
      expect(mid.passes?.[0]?.revisions).toHaveLength(1);
      await call({ outcome: null, confirm_name: key }); // a clear, through the same door
      expect((await state(w, decision)).ticketState.outcome ?? null).toBeNull();
      const rows = await db.pool.query<{ origin: string; actor_id: string }>(`SELECT DISTINCT origin, actor_id FROM events WHERE entity_id = $1 AND type = 'ticket.decided'`, [decision]);
      expect(rows.rows).toEqual([{ origin: 'mcp', actor_id: w.owner.userId }]); // one door, origin by authKind (S9)
    });

    it('29.386 door rows: a stranger is answered uniformly; a member may decide', async () => {
      const { w, decision } = await world('3793');
      // close: false records the outcome only (finishStateId null), so nothing moves and no key is asked for
      await runDoorMatrix(w, [
        { tool: 'resolve_decision', args: () => ({ workspaceId: w.workspaceId, ticketId: decision, outcome: 'Yes', close: false }), stranger: 'ticket not found or not visible to you', allowed: { caller: 'member', eventType: 'ticket.decided' } },
      ]);
    });
  });
  ```
  (import `until` from `./helpers/flow-world.js`.) The first test needs the Decision type bound to the default workflow (DC-3, bootstrap seed), `doing → done` declared with `done` its first terminal state, and the flow's cascade (Part 3 AP-5): `until` waits for it, never a sleep.
  Run (LOCAL): `…/slot-run.sh wtg5-t4-hosted -- pnpm --filter @gisik-nokma/server exec vitest run test/mcp --maxWorkers=2 > /tmp/wtg5-t4-hosted.log 2>&1; tail -40 /tmp/wtg5-t4-hosted.log`. Expected: PASS.

- [ ] **Step 5: Features, sweeps, mutations, DONE**
  - **Features:** replace `<!-- wtg-part5-mcp T4 bullet -->` with `- ✅ **MCP: decide a Decision** (Graph Part 5 T4; `packages/mcp-server/src/tools/decision.ts`, `flow-tools.ts`) — `resolve_decision` records an outcome as a new pass, a revision or a clear (reading the current outcome and sending it as `from`) through the Decide door, which finishes the Decision into the workflow's first finished status when one can be reached, or records the outcome only with `close: false`; it answers the pass and the revision the door filed; previews what the choice would reopen, send back to Backlog or close as Not taken (from the door's own plan, hidden steps included) and writes nothing without the Decision's key; a blocked plan is refused in the engine's own words; `closeStarted` closes started steps on the branch being left. Cases 29.384–29.386.`
  - **Checks:** `node scripts/check-case-ids.mjs`, `pnpm check:citations`, `pnpm check:tasks`.
  - **Sweeps (LOCAL):** mcp-server WHOLE; server `test/mcp` WHOLE; the ui-copy scan (the new strings carry no spaced em dash).
  - **Mutations:**

    | Case | Mutation |
    |---|---|
    | 29.384 | send `finishStateId: null` whatever `close` says → the default-close case reddens (and the hosted branch case stays unfinished) |
    | 29.384 | never send `finishStateId` → the `close: false` case reddens (both-requests `null` assertion) |
    | 29.384 | answer `finish: {closed: true}` without reading `filed` → the no-terminal-state case reddens |
    | 29.385 | send `from: null` on the write → the revision hosted case reddens (`revised` null) and the unit `from` assertion reddens |
    | 29.385 | answer `revised` from the request (`from !== null`) instead of the door's answer → the re-run case (pass 2, `revised: null`) reddens |
    | 29.385 | re-read the Decision after the write → the `detailReads` assertion reddens |
    | 29.386 | `confirmOrPreview(key.toLowerCase(), a.confirm_name.toLowerCase()…)` → the lower-cased-key case reddens |
    | 29.386 | skip the dry run and write straight away → "the preview sent no write" reddens |
    | 29.386 | send `closeStarted` only on the write → the both-requests assertion reddens |
    | 29.386 | ignore `plan.blocked` → the blocked case sends a write and reddens |
    | 29.386 | word the blocked refusal itself (`${key} cannot move (${reason})`) instead of `blocked.sentence` → the exact-sentence case reddens |

  Push. DONE.

---

### Task 5: `publish_flow`, the rule-D2 round trip, the door rows, the registry audit and the manual (cases 29.387–29.389)

**Branch:** `task/wtg-part5-t5-publish-flow` from `origin/release/workflow-graph`; PR `--base release/workflow-graph`. Starts after T4 has landed (strict order); lands last, so it also closes the registry (the final audit below) and the manual. Code-level it needs T1's module and T2's `readFlow`.

**Files:**
- Create:
  - `packages/mcp-server/src/tools/publish-order.ts` (`publishOrder`, `publishPreview`, `publishAll`)
  - `packages/mcp-server/test/publish-flow.test.ts`
  - `packages/mcp-server/test/flow-registry.test.ts`
- Modify:
  - `packages/mcp-server/src/tools/flow-seams.ts` (append `PUBLISH_DRAFTS_PATH`, `publishReplySchema`, `publishRefusalSchema`)
  - `packages/mcp-server/src/tools/flow-tools.ts` (append `publish_flow`)
  - Pins: `tool-names.ts`, `tool-sweep.ts`, `register.test.ts` (14.555), the two spelled counts
  - `apps/server/test/mcp/flow-seams.test.ts` (S6, flow actor), `apps/server/test/mcp/mcp-flow.test.ts`
  - `docs/manual.md` §16 ("What your assistant can do": one bullet), then `pnpm help:generate`
  - Catalogue: `test-cases/29-…` under `<!-- wtg-part5-mcp T5 -->`, `Features.md` §26 under `<!-- wtg-part5-mcp T5 bullet -->`

**Interfaces:**
- **Consumes:** Drafts R48 to R53 (`POST /v1/workspaces/:ws/drafts/publish`, S6); `readFlow` (T2, `flow-answer.ts`); `postJson`, `parseWire`, the `Preview` type (`preview.ts:1`); `HttpError` (`http-client.ts`).
- **Produces:** `publishOrder(drafts: PublishDraft[]): PublishDraft[]`; `publishPreview(drafts): Preview & { drafts: [...] }`; `publishAll(session, workspaceId, drafts)`; `MAX_PUBLISH_SET = 200` and `tooManyDraftsSentence(n): string` (planner ruling P4); the `publish_flow` tool.

- [ ] **Step 1: The seam probe S6 and the flow-actor export (hosted, RED means STOP)**

  Append to `apps/server/test/mcp/flow-seams.test.ts`:
  ```ts
    it('SEAM S6 (Drafts R48-R53): the publish route takes ordered ids, answers keys in order, refuses 409 naming the draft, and files as the caller with origin mcp', async () => {
      const w = await buildDoorWorld(db, '3805');
      const first = await mk(w, w.owner, 'First step', { draft: true });
      const second = await mk(w, w.owner, 'Second step', { draft: true });
      const publish = (ids: string[]) => w.app.inject({
        method: 'POST', url: `/v1/workspaces/${w.workspaceId}/drafts/publish`,
        headers: { authorization: `Bearer ${w.owner.token}` }, payload: { ticketIds: ids, origin: 'mcp' }, // Drafts T5b decision 8: origin rides the body
      });
      const parent = await mk(w, w.owner, 'Epic', { draft: true, typeId: 'epic' });
      const child = await mk(w, w.owner, 'Child', { draft: true, parentId: parent });
      const refused = await publish([child]);
      expect(refused.statusCode, 'S6: a child ahead of its unpublished parent is a 409').toBe(409);
      expect(refused.json<{ rule: string; ticketId: string; cause: { rule: string; reason: string } }>()).toMatchObject({ rule: 'draft.publish-refused', ticketId: child, cause: { rule: 'draft.parent-unpublished' } });
      const ok2 = await publish([first, second]);
      expect(ok2.statusCode, `S6: ${ok2.body}`).toBe(200);
      expect(ok2.json<{ results: Array<{ ticketId: string; key: string }> }>().results.map((r) => r.ticketId)).toEqual([first, second]);
      const row = await db.pool.query<{ origin: string; actor_id: string }>(`SELECT origin, actor_id FROM events WHERE entity_id = $1 AND type = 'ticket.published'`, [first]);
      expect(row.rows[0], 'S9: the publish door files as the caller').toMatchObject({ actor_id: w.owner.userId, origin: 'mcp' });
    });

    it('SEAM (Graph Part 2): SYSTEM_ACTOR_FLOW is exported for the D2 attribution test', () => {
      expect(typeof domain.SYSTEM_ACTOR_FLOW, 'SYSTEM_ACTOR_FLOW').toBe('string');
    });
  ```
  Run (LOCAL): `…/slot-run.sh wtg5-t5-probe -- pnpm --filter @gisik-nokma/server exec vitest run test/mcp/flow-seams.test.ts --maxWorkers=2 > /tmp/wtg5-t5-probe.log 2>&1; tail -40 /tmp/wtg5-t5-probe.log`. Expected: PASS. A red probe is a STOP naming the Drafts plan (S6) or Part 2.
  Commit: `wtg-part5 T5: seam probe S6`.

- [ ] **Step 2: Case lines and RED unit tests (29.387–29.389)**

  Case lines under `<!-- wtg-part5-mcp T5 -->`, all ❌:
  - `- ❌ **29.387 — `publish_flow` reads the flow, takes its drafts in flow order with every draft parent ahead of its draft children, and without `confirm: true` returns the house preview (`preview: true`, `wouldChange`, `counts: {drafts}`, `nothingChanged: true`, `confirm`, plus `drafts: [{position, id, title, parentTitle}]`) and sends NO write; with `confirm: true` it posts ONE `{ticketIds}` to the publish route and answers `{published: [{ticketId, key, title}], count}`; a retry after a lost response re-reads the flow, so ids that are no longer drafts drop out; a flow with no drafts answers `nothingToPublish` and sends nothing; a flow with more than 200 drafts (the publish route's limit, Drafts `MAX_PUBLISH_SET`) is refused up front, preview or not, with `This flow has <n> drafts; publish_flow publishes at most 200 at once (it never splits a publish). Publish it in parts from the app.` and no request beyond the flow read (the publish stays atomic and is never batched, planner ruling P4); the server's `409 draft.publish-refused` reaches the assistant as `refused by <cause rule>: <reason> (draft "<title>", nothing was published).`;** control: `confirm: false` is a preview, `confirm: true` on the same flow publishes, and exactly 200 drafts publish in ONE request. Mutation: list ids in node order → the child-first case reddens; drop the 200 guard → the 241-draft case posts and reddens.`
  - `- ❌ **29.388 — rule D2, hosted: every write the five tools make is an event in the History with `origin: 'mcp'` and the caller as actor (link, label, wait-for-all, estimate, outcome, publish), what the flow does by itself is filed by the flow actor with origin `server` and never by the caller, and each write can be undone by a tool: `link_tickets` remove or relabel, `set_wait_for_all` false, `estimate` null, `resolve_decision` revised or `outcome: null` (which returns the Not-taken tickets to Backlog); a published flow is the one write that cannot be undone, and its description says so;** control: after the undo the History still shows the original acts (nothing is erased). Mutation: file the clear with `outcome: 'null'` → the return to Backlog never happens and the case reddens.`
  - `- ❌ **29.389 — the five flow tools are registered once, contiguous and in the final order after the tools the tip had (`set_wait_for_all`, `get_flow`, `get_timeline`, `resolve_decision`, `publish_flow`), each has a sweep entry, the write tools' descriptions say how to undo (or that they cannot be undone), and through the hosted door a stranger is answered by one uniform sentence per read tool while a member may read; `docs/manual.md` §16 names flows and timelines and `pnpm check:help` passes;** control: the sweep (14.88) drives every flow tool. Mutation: drop `publish_flow` from the sweep → 14.88 and this case redden.`

  `packages/mcp-server/test/publish-flow.test.ts`:
  ```ts
  import { describe, expect, it } from 'vitest';
  import { HttpError } from '../src/http-client.js';
  import { flowTools } from '../src/tools/flow-tools.js';
  import { publishOrder } from '../src/tools/publish-order.js';
  import { WS, fakeFlow, flowNode, flowWire, ulid } from './fixtures/flow-fixtures.js';

  const N = ulid('PUB'); // a published ticket in the flow
  const P = ulid('PAR'); // a draft parent
  const C = ulid('CHD'); // its draft child, listed FIRST in flow order
  const L = ulid('LST'); // another draft
  const FLOW = `/v1/workspaces/${WS}/tickets/${N}/flow`;
  const PUB = `/v1/workspaces/${WS}/drafts/publish`;
  const draft = (id: string, title: string, over: Record<string, unknown> = {}) => flowNode(id, { draft: true, key: null, title, ...over });
  const wire = () => flowWire([flowNode(N, { title: 'Published' }), draft(C, 'Child', { parentId: P }), draft(P, 'Parent'), draft(L, 'Last')]);
  const keys = (ids: string[]) => ({ results: ids.map((ticketId, i) => ({ ticketId, key: `GN-${20 + i}` })) });
  const run = (f: ReturnType<typeof fakeFlow>, args: Record<string, unknown> = {}) =>
    flowTools(f.session).find((t) => t.name === 'publish_flow')!.handler({ workspaceId: WS, ticketId: N, ...args }) as Promise<Record<string, any>>;
  const posted = (f: ReturnType<typeof fakeFlow>) => f.posts.map((p) => p.body as { ticketIds: string[]; origin: string });

  describe('29.387 publish_flow', () => {
    it('29.387 publishOrder puts a draft parent ahead of its children and keeps flow order otherwise', () => {
      const d = (id: string, parentId: string | null = null) => ({ id, title: id, parentId });
      expect(publishOrder([d('c', 'p'), d('p'), d('l')]).map((x) => x.id)).toEqual(['p', 'c', 'l']);
      expect(publishOrder([d('a'), d('b'), d('c')]).map((x) => x.id)).toEqual(['a', 'b', 'c']);
      expect(publishOrder([d('c', 'outside'), d('b')]).map((x) => x.id)).toEqual(['c', 'b']); // a parent outside the flow is the server's to refuse
      expect(publishOrder([d('a', 'b'), d('b', 'a')]).map((x) => x.id).sort()).toEqual(['a', 'b']); // a cycle cannot loop (the hierarchy forbids one; the guard is cheap)
    });

    it('29.387 without confirm: true it is a preview in publish order and sends no write; with it, one request in that order', async () => {
      const f = fakeFlow({ [FLOW]: wire() }, { posts: { [PUB]: keys([P, C, L]) } });
      const preview = await run(f);
      expect(preview).toMatchObject({ preview: true, nothingChanged: true, counts: { drafts: 3 }, confirm: 'pass confirm: true to publish' });
      expect(preview['drafts']).toEqual([
        { position: 1, id: P, title: 'Parent', parentTitle: null },
        { position: 2, id: C, title: 'Child', parentTitle: 'Parent' },
        { position: 3, id: L, title: 'Last', parentTitle: null },
      ]);
      expect(preview['wouldChange']).toContain('never reused');
      expect(preview['wouldChange']).toContain('1. "Parent", 2. "Child", 3. "Last"');
      expect(f.posts).toEqual([]); // the recorded requests: the preview wrote nothing
      expect((await run(f, { confirm: false }))['preview']).toBe(true); // control: false is not consent
      const done = await run(f, { confirm: true });
      expect(posted(f)).toEqual([{ ticketIds: [P, C, L], origin: 'mcp' }]); // parent ahead of its child although the flow listed the child first; origin rides the body (Drafts T5b)
      expect(done).toEqual({ published: [{ ticketId: P, key: 'GN-20', title: 'Parent' }, { ticketId: C, key: 'GN-21', title: 'Child' }, { ticketId: L, key: 'GN-22', title: 'Last' }], count: 3 });
    });

    it('29.387 a retry after a lost response re-reads the flow: ids that are no longer drafts drop out', async () => {
      let reads = 0;
      const f = fakeFlow(
        { [FLOW]: () => (reads++ === 0 ? wire() : flowWire([flowNode(N), flowNode(P, { title: 'Parent' }), draft(C, 'Child', { parentId: P }), draft(L, 'Last')])) },
        { posts: { [PUB]: (body: unknown) => { if (reads === 1) throw new Error('socket hang up'); return keys((body as { ticketIds: string[] }).ticketIds); } } },
      );
      await expect(run(f, { confirm: true })).rejects.toThrow('socket hang up'); // the answer was lost
      const again = await run(f, { confirm: true });
      expect(posted(f)).toEqual([{ ticketIds: [P, C, L], origin: 'mcp' }, { ticketIds: [C, L], origin: 'mcp' }]); // the parent is already published
      expect(again['count']).toBe(2);
    });

    it('29.387 a flow with no drafts says so and sends nothing; control: one draft publishes', async () => {
      const none = fakeFlow({ [FLOW]: flowWire([flowNode(N)]) }, { posts: { [PUB]: keys([]) } });
      expect(await run(none, { confirm: true })).toMatchObject({ published: [], nothingToPublish: true });
      expect(none.posts).toEqual([]);
      const one = fakeFlow({ [FLOW]: flowWire([flowNode(N), draft(L, 'Last')]) }, { posts: { [PUB]: keys([L]) } });
      expect((await run(one, { confirm: true }))['count']).toBe(1);
    });

    it('29.387 more than 200 drafts are refused up front, preview or not, with nothing sent; control: exactly 200 publish in ONE request', async () => {
      const many = (n: number) => flowWire([flowNode(N), ...Array.from({ length: n }, (_, i) => draft(ulid(`M${i}`), `Draft ${i + 1}`))]);
      const big = fakeFlow({ [FLOW]: many(241) }, { posts: { [PUB]: keys([]) } });
      const sentence = 'This flow has 241 drafts; publish_flow publishes at most 200 at once (it never splits a publish). Publish it in parts from the app.';
      await expect(run(big, { confirm: true })).rejects.toThrow(sentence);
      await expect(run(big, {})).rejects.toThrow(sentence); // the preview too: it would promise a publish the route refuses
      expect(big.posts).toEqual([]); // never batched, never sent
      expect(big.gets.every((g) => g.startsWith(FLOW))).toBe(true); // the flow read and nothing else
      const two00 = many(200);
      const edge = fakeFlow({ [FLOW]: two00 }, { posts: { [PUB]: keys(two00.nodes.filter((n) => n.draft).map((n) => n.id)) } });
      expect((await run(edge, { confirm: true }))['count']).toBe(200); // control: at the limit
      expect(posted(edge)).toHaveLength(1);
      expect(posted(edge)[0]!.ticketIds).toHaveLength(200);
    });

    it('29.387 a 409 refusal is the product\'s words naming the draft and saying nothing was published; a 404 and a wrong reply are said plainly', async () => {
      const refuse = (reason: string) => () => { throw new HttpError(409, { rule: 'draft.publish-refused', ticketId: C, cause: { rule: 'draft.parent-unpublished', reason } }); };
      const f = fakeFlow({ [FLOW]: wire() }, { posts: { [PUB]: refuse('Publish the parent first.') } });
      await expect(run(f, { confirm: true })).rejects.toThrow('refused by draft.parent-unpublished: Publish the parent first (draft "Child", nothing was published).');
      const unknown = fakeFlow({ [FLOW]: wire() }, { posts: { [PUB]: () => { throw new HttpError(404, { error: 'not_found' }); } } });
      await expect(run(unknown, { confirm: true })).rejects.toThrow('ticket not found or not visible to you (nothing was published).');
      const odd = fakeFlow({ [FLOW]: wire() }, { posts: { [PUB]: () => { throw new HttpError(409, { surprise: true }); } } });
      await expect(run(odd, { confirm: true })).rejects.toThrow('gisik-nokma answered 409');
      const wrong = fakeFlow({ [FLOW]: wire() }, { posts: { [PUB]: keys([L]) } }); // the server published a different set
      await expect(run(wrong, { confirm: true })).rejects.toThrow('a different set of drafts');
      await expect(run(fakeFlow({}), { confirm: true })).rejects.toThrow('ticket not found or not visible to you'); // the flow is not readable
    });
  });
  ```
  `packages/mcp-server/test/flow-registry.test.ts`:
  ```ts
  import { describe, expect, it } from 'vitest';
  import { allTools } from '../src/tools/register.js';
  import { fakeFlow } from './fixtures/flow-fixtures.js';
  import { TOOL_NAMES_BY_MODULE } from './fixtures/tool-names.js';
  import { SWEEP } from './fixtures/tool-sweep.js';

  const FLOW = ['set_wait_for_all', 'get_flow', 'get_timeline', 'resolve_decision', 'publish_flow'];
  const UNDO: Record<string, RegExp> = {
    set_wait_for_all: /Turn it off again/,
    resolve_decision: /Revise it, or clear it with outcome null, to undo\./,
    publish_flow: /cannot be undone/,
  };

  describe('29.389 the flow tools in the registry', () => {
    it('29.389 registered once, contiguous in the final order, each with a sweep entry and an honest undo sentence', () => {
      const tools = allTools(fakeFlow().session);
      const names = tools.map((t) => t.name);
      expect(TOOL_NAMES_BY_MODULE.flow).toEqual(FLOW);
      const at = names.indexOf(FLOW[0]!);
      expect(at).toBeGreaterThanOrEqual(0);
      expect(names.slice(at, at + FLOW.length)).toEqual(FLOW); // contiguous, in the plan's order
      expect(new Set(names).size).toBe(names.length); // no tool twice (a merge of two plans would show here)
      for (const n of FLOW) expect(Object.keys(SWEEP), `${n} has a sweep entry`).toContain(n);
      for (const [name, pattern] of Object.entries(UNDO)) {
        expect(tools.find((t) => t.name === name)?.description, `${name} says how to undo`).toMatch(pattern);
      }
      // control: the pattern is not vacuous: a tool that says nothing about undo does not match it
      expect(tools.find((t) => t.name === 'get_flow')?.description).not.toMatch(/cannot be undone/);
    });
  });
  ```
  Run (LOCAL): `…/slot-run.sh wtg5-t5-red -- pnpm --filter @gisik-nokma/mcp-server exec vitest run test/publish-flow.test.ts test/flow-registry.test.ts --maxWorkers=2 > /tmp/wtg5-t5-red.log 2>&1; tail -40 /tmp/wtg5-t5-red.log`. Expected: FAIL (`publish-order.ts` and `publish_flow` do not exist).

- [ ] **Step 3: Implement**

  **`flow-seams.ts`** (append):
  ```ts
  /** Drafts R48 to R53: the all-or-nothing publish of an ordered set of drafts. Probe S6. */
  export const PUBLISH_DRAFTS_PATH = (workspaceId: string): string => `/v1/workspaces/${enc(workspaceId)}/drafts/publish`;
  export const publishReplySchema = z.object({ results: z.array(z.object({ ticketId: z.string(), key: z.string() })) });
  export const publishRefusalSchema = z.object({
    rule: z.literal('draft.publish-refused'), ticketId: z.string(), cause: z.object({ rule: z.string(), reason: z.string() }),
  });
  ```

  **`publish-order.ts`:**
  ```ts
  import { HttpError } from '../http-client.js';
  import type { Session } from '../session.js';
  import { PUBLISH_DRAFTS_PATH, parseWire, publishRefusalSchema, publishReplySchema } from './flow-seams.js';
  import type { Preview } from './preview.js';
  import { postJson } from './submit.js';

  export type PublishDraft = { id: string; title: string; parentId: string | null };

  /** The publish route's limit (Drafts T5b `MAX_PUBLISH_SET`, ≤ 200 ids). A larger flow is refused up front, never split: the publish is all or nothing (planner ruling P4). */
  export const MAX_PUBLISH_SET = 200;
  export const tooManyDraftsSentence = (n: number): string =>
    `This flow has ${n} drafts; publish_flow publishes at most ${MAX_PUBLISH_SET} at once (it never splits a publish). Publish it in parts from the app.`;

  /**
   * The order the drafts are published in: the flow's own order (FL-3), except that a draft parent that is in the list
   * goes ahead of its children, because the route does not sort (Drafts R51: a child listed before its unpublished
   * parent fails `draft.parent-unpublished` and rolls everything back). A parent that is NOT in the list is left to the
   * server, which refuses in its own words naming the draft. Stable; the guard stops a cycle.
   */
  export function publishOrder(drafts: readonly PublishDraft[]): PublishDraft[] {
    const byId = new Map(drafts.map((d) => [d.id, d]));
    const placed = new Set<string>();
    const out: PublishDraft[] = [];
    const visit = (d: PublishDraft, trail: Set<string>): void => {
      if (placed.has(d.id) || trail.has(d.id)) return;
      trail.add(d.id);
      const parent = d.parentId === null ? undefined : byId.get(d.parentId);
      if (parent !== undefined) visit(parent, trail);
      placed.add(d.id);
      out.push(d);
    };
    for (const d of drafts) visit(d, new Set());
    return out;
  }

  /** The house preview (`preview.ts:1-9`), hand built because the confirmation here is a boolean, and with no keys (Decision 3). */
  export function publishPreview(drafts: readonly PublishDraft[]): Preview & { drafts: Array<{ position: number; id: string; title: string; parentTitle: string | null }> } {
    const titles = new Map(drafts.map((d) => [d.id, d.title]));
    const n = drafts.length;
    return {
      preview: true,
      wouldChange:
        `Publishes ${n} draft${n === 1 ? '' : 's'} in this order: ${drafts.map((d, i) => `${i + 1}. "${d.title}"`).join(', ')}. ` +
        'Each takes the next ticket key of its project when the publish commits, and keys are counted and never reused. ' +
        'All or nothing: if any draft is refused, none is published. A published ticket cannot be made a draft again; it is deleted like any other ticket.',
      counts: { drafts: n },
      nothingChanged: true,
      confirm: 'pass confirm: true to publish',
      drafts: drafts.map((d, i) => ({ position: i + 1, id: d.id, title: d.title, parentTitle: d.parentId === null ? null : (titles.get(d.parentId) ?? null) })),
    };
  }

  /** One request to the all-or-nothing route. A 409 is the product explaining itself: the rule, the reason, and WHICH draft. */
  export async function publishAll(session: Session, workspaceId: string, drafts: readonly PublishDraft[]) {
    const titles = new Map(drafts.map((d) => [d.id, d.title]));
    let reply: unknown;
    try {
      // Drafts T5b decision 8: the route records the BODY's origin (default web), not the bearer's kind.
      reply = await postJson(session, PUBLISH_DRAFTS_PATH(workspaceId), { ticketIds: drafts.map((d) => d.id), origin: 'mcp' });
    } catch (error) {
      if (error instanceof HttpError && error.status === 409) {
        const refusal = publishRefusalSchema.safeParse(error.body);
        if (refusal.success) {
          const { ticketId, cause } = refusal.data;
          throw new Error(`refused by ${cause.rule}: ${cause.reason.replace(/\.$/, '')} (draft "${titles.get(ticketId) ?? ticketId}", nothing was published).`);
        }
        throw new Error(`gisik-nokma answered 409: ${JSON.stringify(error.body)}`);
      }
      if (error instanceof HttpError && error.status === 404) throw new Error('ticket not found or not visible to you (nothing was published).');
      throw error;
    }
    const parsed = parseWire(publishReplySchema, reply, 'publish');
    const asked = new Set(drafts.map((d) => d.id));
    if (parsed.results.length !== asked.size || parsed.results.some((r) => !asked.has(r.ticketId))) {
      throw new Error('gisik-nokma published a different set of drafts than the ones asked for. Check get_flow before trying again.');
    }
    return { published: parsed.results.map((r) => ({ ticketId: r.ticketId, key: r.key, title: titles.get(r.ticketId) ?? null })), count: parsed.results.length };
  }
  ```

  **`flow-tools.ts`:** add after `resolve_decision` (imports `MAX_PUBLISH_SET`, `publishAll`, `publishOrder`, `publishPreview`, `tooManyDraftsSentence` from `./publish-order.js`; `readFlow` from `./flow-answer.js`):
  ```ts
      {
        name: 'publish_flow',
        description:
          'Publish every draft in the flow a ticket belongs to, all or nothing, in flow order with a draft parent ahead of its children. Your drafts have no ticket key and are private until published; publishing gives each the next key of its project. ' +
          'Without confirm: true you get a preview (the drafts, their order) and nothing changes. If any draft is refused, none is published and the refusal names the draft; fix it and call again (drafts already published are skipped). ' +
          'At most 200 drafts are published at once and a publish is never split: a larger flow is refused, publish it in parts from the app. ' +
          'Publishing a flow cannot be undone: a published ticket cannot become a draft again, it can only be deleted like any other ticket. The flow may then move tickets by itself (a published step whose predecessors are done is promoted to To do).',
        inputSchema: { workspaceId: id, ticketId: id, confirm: z.boolean().optional() },
        handler: async (args) => {
          const a = z.object({ workspaceId: id, ticketId: id, confirm: z.boolean().optional() }).parse(args);
          const flow = await readFlow(session, a.workspaceId, a.ticketId);
          const drafts = publishOrder(flow.nodes.filter((n) => n.draft).map((n) => ({ id: n.id, title: n.title, parentId: n.parentId })));
          if (drafts.length === 0) return { published: [], nothingToPublish: true, message: 'There are no drafts in this flow, so nothing was published.' };
          // Before any request beyond the flow read, preview included: one atomic publish of at most 200 (ruling P4).
          if (drafts.length > MAX_PUBLISH_SET) throw new Error(tooManyDraftsSentence(drafts.length));
          return a.confirm === true ? publishAll(session, a.workspaceId, drafts) : publishPreview(drafts);
        },
      },
  ```
  Note: `readFlow` returns the RAW wire, not `toFlowAnswer`'s: `parentId` of a node whose parent is outside the flow must stay readable here only to decide ordering, and `publishOrder` ignores a parent that is not in the list anyway.

  **Pins:** `tool-names.ts`: `'publish_flow',` after `'resolve_decision',`; `tool-sweep.ts`: `publish_flow: { args: { workspaceId: 'w', ticketId: 't' }, session: { get: async () => ({ flowId: 'f', truncated: false, start: [], end: [], nodes: [], edges: [], autoMoves: [], draftCount: 0 }) } },`; `register.test.ts` 14.555: `'publish_flow',` after `'resolve_decision',`; counts re-derived. After this task `TOOL_NAMES_BY_MODULE.flow` is exactly the five-name list the registry test pins.

  Run (LOCAL): `…/slot-run.sh wtg5-t5-green -- pnpm --filter @gisik-nokma/mcp-server exec vitest run --maxWorkers=2 > /tmp/wtg5-t5-green.log 2>&1; tail -40 /tmp/wtg5-t5-green.log`.
  Expected: PASS including 14.80, 14.81, 14.555, 14.88, 29.387 and 29.389's unit part. Flip 29.387 ✅.
  Commit: `wtg-part5 T5: publish_flow, registry audit`.

- [ ] **Step 4: The hosted cases (publish, rule D2, door rows)**

  Append to `apps/server/test/mcp/mcp-flow.test.ts` (add `import * as domain from '@gisik-nokma/domain';` and `until` to the imports):
  ```ts
  describe('29.387 29.388 29.389 publish_flow and rule D2 through the hosted door', () => {
    const ticketOf = async (w: Awaited<ReturnType<typeof buildDoorWorld>>, ticketId: string) =>
      (await ok(w, w.owner, 'get_ticket', { workspaceId: w.workspaceId, ticketId })) as {
        key: string | null; draft?: boolean; ticketState: { stateId: string; outcome?: string | null }; resolution?: { kind: string }; links: Array<{ direction: string; ticket: { id: string } }>;
      };

    it('29.387 a preview writes nothing; the confirmed publish gives consecutive keys in flow order and re-files the link; a retry has nothing to publish', async () => {
      const w = await buildDoorWorld(db, '3801');
      const first = await mk(w, w.owner, 'First step', { draft: true });
      const second = await mk(w, w.owner, 'Second step', { draft: true });
      await ok(w, w.owner, 'link_tickets', { workspaceId: w.workspaceId, ticketId: first, targetId: second, kind: 'leads_to', action: 'add' });
      const preview = (await ok(w, w.owner, 'publish_flow', { workspaceId: w.workspaceId, ticketId: second })) as { preview: boolean; drafts: Array<{ title: string }> };
      expect(preview.preview).toBe(true);
      expect(preview.drafts.map((d) => d.title)).toEqual(['First step', 'Second step']);
      expect((await ticketOf(w, first)).draft).toBe(true); // the preview wrote nothing
      const done = (await ok(w, w.owner, 'publish_flow', { workspaceId: w.workspaceId, ticketId: second, confirm: true })) as { count: number; published: Array<{ ticketId: string; key: string }> };
      expect(done.published.map((p) => p.ticketId)).toEqual([first, second]);
      const n = (key: string) => Number(key.split('-').pop());
      expect(n(done.published[1]!.key)).toBe(n(done.published[0]!.key) + 1); // consecutive, in flow order
      const after = await ticketOf(w, first);
      expect(after.draft ?? false).toBe(false);
      expect(after.links.some((l) => l.direction === 'out' && l.ticket.id === second)).toBe(true);
      const again = await ok(w, w.owner, 'publish_flow', { workspaceId: w.workspaceId, ticketId: second, confirm: true });
      expect(again).toMatchObject({ nothingToPublish: true });
      const row = await db.pool.query<{ origin: string; actor_id: string }>(`SELECT origin, actor_id FROM events WHERE entity_id = $1 AND type = 'ticket.published'`, [first]);
      expect(row.rows).toEqual([{ origin: 'mcp', actor_id: w.owner.userId }]);
    });

    it('29.387 a child under a draft parent outside the flow is refused naming the draft, nothing is published; publishing the parent first succeeds', async () => {
      const w = await buildDoorWorld(db, '3803');
      const parent = await mk(w, w.owner, 'Epic', { draft: true, typeId: 'epic' });
      const child = await mk(w, w.owner, 'Child', { draft: true, parentId: parent });
      const refused = await callTool(w.app, w.owner.token, 'publish_flow', { workspaceId: w.workspaceId, ticketId: child, confirm: true });
      expect(refused.isError).toBe(true);
      expect(refused.text).toContain('refused by draft.parent-unpublished');
      expect(refused.text).toContain('draft "Child", nothing was published');
      expect((await ticketOf(w, child)).draft).toBe(true);
      await ok(w, w.owner, 'publish_flow', { workspaceId: w.workspaceId, ticketId: parent, confirm: true }); // control: the same child now publishes
      expect(await ok(w, w.owner, 'publish_flow', { workspaceId: w.workspaceId, ticketId: child, confirm: true })).toMatchObject({ count: 1 });
    });

    it('29.388 rule D2: every write is the caller\'s with origin mcp, the flow\'s moves are the flow actor\'s, and each can be undone', async () => {
      const w = await buildDoorWorld(db, '3802');
      const decision = await mk(w, w.owner, 'Client decides', { typeId: 'decision' });
      const yes = await mk(w, w.owner, 'Pitch');
      const no = await mk(w, w.owner, 'Rework');
      const link = (args: Record<string, unknown>) => ok(w, w.owner, 'link_tickets', { workspaceId: w.workspaceId, kind: 'leads_to', ...args });
      await link({ ticketId: decision, targetId: yes, action: 'add', label: 'Yes' });
      await link({ ticketId: decision, targetId: no, action: 'add', label: 'No' });
      await ok(w, w.owner, 'set_wait_for_all', { workspaceId: w.workspaceId, ticketId: yes, value: true });
      await ok(w, w.owner, 'update_ticket', { workspaceId: w.workspaceId, ticketId: yes, estimate: 3 });
      // undo each, in the same ledger
      await ok(w, w.owner, 'set_wait_for_all', { workspaceId: w.workspaceId, ticketId: yes, value: false });
      await ok(w, w.owner, 'update_ticket', { workspaceId: w.workspaceId, ticketId: yes, estimate: null });
      await link({ ticketId: decision, targetId: no, action: 'relabel', label: 'Nope' });
      await link({ ticketId: decision, targetId: no, action: 'remove' });
      await link({ ticketId: decision, targetId: no, action: 'add', label: 'No' });
      const key = (await ticketOf(w, decision)).key!;
      await ok(w, w.owner, 'transition_ticket', { workspaceId: w.workspaceId, ticketId: decision, to: 'todo' });
      await ok(w, w.owner, 'transition_ticket', { workspaceId: w.workspaceId, ticketId: decision, to: 'doing' });
      // finished through the Decide door (one move to Done): only a finished Decision settles its branches (Part 2)
      await ok(w, w.owner, 'resolve_decision', { workspaceId: w.workspaceId, ticketId: decision, outcome: 'Yes', confirm_name: key });
      await until('the flow closing the branch not taken', async () => ((await ticketOf(w, no)).resolution?.kind === 'not-taken' ? true : null));
      const moves = await db.pool.query<{ actor_id: string; origin: string }>(`SELECT actor_id, origin FROM events WHERE entity_id = $1 AND type = 'ticket.transitioned'`, [no]);
      expect(moves.rows.length).toBeGreaterThan(0);
      expect(moves.rows.every((r) => r.actor_id === domain.SYSTEM_ACTOR_FLOW && r.origin === 'server')).toBe(true); // never the caller
      // the undo of a decision: clearing returns the Not-taken ticket to Backlog (PS-5 rule 6)
      await ok(w, w.owner, 'resolve_decision', { workspaceId: w.workspaceId, ticketId: decision, outcome: null, confirm_name: key });
      await until('the Not-taken ticket back in Backlog', async () => {
        const t = await ticketOf(w, no);
        return t.ticketState.stateId === 'backlog' && t.resolution === undefined ? true : null;
      });
      const mine = await db.pool.query<{ origin: string }>(
        `SELECT DISTINCT origin FROM events WHERE workspace_id = $1 AND actor_id = $2 AND type IN ('ticket.link_added','ticket.link_removed','ticket.field_set','ticket.decided')`,
        [w.workspaceId, w.owner.userId],
      );
      expect(mine.rows.map((r) => r.origin)).toEqual(['mcp']);
      const history = (await ok(w, w.owner, 'get_ticket_history', { ticketId: decision })) as { events: Array<{ type: string; origin: string }> };
      expect(history.events.filter((e) => e.type === 'ticket.decided').map((e) => e.origin)).toEqual(['mcp', 'mcp']); // the choice and its clear are both still there
    });

    it('29.389 door rows: one uniform sentence for a stranger on each read, a member may', async () => {
      const w = await buildDoorWorld(db, '3804');
      await runDoorMatrix(w, [
        { tool: 'get_flow', args: (x) => ({ workspaceId: x.workspaceId, ticketId: x.ticketId }), stranger: 'ticket not found or not visible to you', allowed: { caller: 'member' } },
        { tool: 'get_timeline', args: (x) => ({ workspaceId: x.workspaceId }), stranger: 'workspace not found or not visible to you', allowed: { caller: 'member' } },
        { tool: 'publish_flow', args: (x) => ({ workspaceId: x.workspaceId, ticketId: x.ticketId }), stranger: 'ticket not found or not visible to you', allowed: { caller: 'member' } },
      ]);
    });
  });
  ```
  Run (LOCAL): `…/slot-run.sh wtg5-t5-hosted -- pnpm --filter @gisik-nokma/server exec vitest run test/mcp --maxWorkers=2 > /tmp/wtg5-t5-hosted.log 2>&1; tail -40 /tmp/wtg5-t5-hosted.log`. Expected: PASS, including 14.262 (the hosted list equals `allTools`). If a stranger sentence differs from the one written (the door may answer another first), copy the observed sentence into the row and say so in the handoff; the rule is "uniform and not an oracle".

- [ ] **Step 5: The manual, Features, final audit, sweeps, mutations, DONE**
  - **Manual:** in `docs/manual.md` §16, under "What your assistant can do" (grep `-n '^### What your assistant can do'`), add one bullet after **Tickets.**: `- **Flows and timelines.** Connect tickets with "leads to" arrows (with a label such as "Yes" or "No"), mark a step to wait for all of the steps before it, give a step an estimate, read a whole flow (what happened on each pass, what was not taken) and the timeline for a stretch of weeks, record which way a Decision goes, and publish a flow of drafts together. Choosing a Decision's way can move other tickets, so the assistant first shows you which and waits for the Decision's key; publishing a flow cannot be undone.` Then `pnpm help:generate` and `pnpm check:help` (LOCAL), and commit the regenerated help content in the same commit.
  - **Features:** replace `<!-- wtg-part5-mcp T5 bullet -->` with `- ✅ **MCP: publish a flow, and the whole Part 5 set** (Graph Part 5 T5; `packages/mcp-server/src/tools/publish-order.ts`, `flow-tools.ts`, `docs/manual.md` §16) — `publish_flow` previews the drafts of a flow in publish order (parents first) and writes nothing without `confirm: true`, then publishes them all or none through the Drafts publish route, naming the refused draft, and refuses a flow of more than 200 drafts up front (never split); every Part 5 write is visible, attributed to mcp or the flow actor and undoable except the publish (rule D2); the five flow tools are pinned in the registry. Cases 29.387–29.389.`
  - **Final audit of the registry (this task closes it):** re-count `allTools` on the branch and confirm the number in `register.test.ts` 14.555 (its `FINAL`, `toHaveLength` and `it(…)` title), in `test-cases/14-mcp-server.md` (the 14.555 line) and in `Features.md` (the spelled count) is the SAME number and equals tip + the plans that landed before this one + 5. `flow-registry.test.ts` pins the contiguous five.
  - **Checks:** `node scripts/check-case-ids.mjs`, `pnpm check:citations` (every ✅ 29.375–29.389 is in a test), `pnpm check:tasks`, `pnpm check:help`.
  - **Sweeps (LOCAL):** mcp-server WHOLE; server `test/mcp` WHOLE; the ui-copy scan; and, because the hosted list changed, the Part 5 files together: `test/mcp/mcp-flow.test.ts`, `test/mcp/flow-seams.test.ts`, `test/mcp/mcp-http.test.ts`.
  - **Mutations:**

    | Case | Mutation |
    |---|---|
    | 29.387 | `publishOrder` returns node order → the child-first case reddens |
    | 29.387 | post `confirm !== false` instead of `=== true` → the `confirm: false` control reddens |
    | 29.387 | do not re-read the flow on a call (cache it) → the retry case reddens |
    | 29.387 | word the 409 without the draft title → the refusal case reddens |
    | 29.387 | drop the `MAX_PUBLISH_SET` guard → the 241-draft case posts and reddens |
    | 29.387 | compare `>=` instead of `>` → the 200-draft control reddens |
    | 29.387 | guard only the confirmed call → the preview half of the 241-draft case reddens |
    | 29.388 | `outcome: 'null'` string on clear → the Backlog return never happens (hosted) |
    | 29.388 | file `set_wait_for_all` false as `false` → the History assertion in T1 and the off state disagree |
    | 29.389 | drop `publish_flow` from `tool-sweep.ts` → 14.88 and the registry case redden |

  Push. DONE: report the local runs, named LOCAL, with the counts you re-derived.

---

## Self-review

**1. Spec coverage (Part 5: §14 the tools, §15 the Drafts needs).**

| Spec item | Where |
|---|---|
| `link_tickets` `leads_to` + `label`, relabel, remove | T1 (29.375, 29.376) |
| links that touch a draft (Drafts R42/R43, spec §15 D-3) | T1 (29.375) |
| `set_wait_for_all`; `update_ticket` refuses `waitForAll` | T1 (29.377) |
| `estimate` / `reworkEstimate` on create and update | T1 (29.378) |
| `get_ticket.links` carries the label (spec A drops it today) | Graph Part 2 T2 adds it (29.126); T1 asserts it (29.375) |
| `get_flow`: passes, periods, resolution (Not taken), alternates, taken, only visible ends and the caller's drafts | T2 (29.379, 29.380) |
| `get_ticket`: passes, round, periods, resolution, no hidden Decision id | T2 (29.381) |
| `get_timeline` and its limits | T3 (29.382, 29.383) |
| `resolve_decision`: `close` (`finishStateId` omitted or `null`), the door's first-declared finish, `from` and revision (the door's `pass`/`revised`), clear, preview, `closeStarted`, blocked in the engine's words | T4 (29.384–29.386) |
| `publish_flow` preview, atomic publish, the refusal naming the draft (§15 D-4), more than 200 drafts refused up front (planner ruling P4) | T5 (29.387) |
| Rule D2: visible, attributed, removable | T5 (29.388) |
| registry, sweep, door rows, manual | T5 (29.389) |

Not in this plan, by design: the notification, History-copy and `redactedPayload` arms for the new events (Part 2 owns them, spec §8.4; nothing here re-adds them); `list_my_drafts` / `publish_draft` / `discard_draft` (Drafts); the semantic-layer and sweep-2 tools.

**2. Placeholder scan.** No "TBD", "similar to Task N", "add appropriate handling". Every code step has code. Two places say "copy the observed sentence" (the stranger rows in the hosted tests): that is a measured-value instruction with a stated rule, not a gap.

**3. Type consistency.** `flowWireSchema` / `FlowWire` (T2) are what `readFlow` returns and `toFlowAnswer` takes (T2) and `publish_flow` reads (T5: `n.draft`, `n.title`, `n.parentId`). `parseWire` (T2) is used by T3 to T5. `TimelineScope`, `timelineQuery`, `readTimeline` (T3) are used only in T3. `DecidePlan` (T4, `decision.ts`) is what `previewSentence`, `planTickets` and the tool take; `toDecidePlan` builds it from the door's `DecideDoorPlan` (`decideDoorPlanSchema.plan`) and `readFlow`'s nodes. `PublishDraft` (T5) is built from `FlowWire['nodes']`. `fakeFlow`, `flowNode`, `flowWire`, `detail`, `ulid`, `WS` come from `flow-fixtures.ts` (T1, extended in T2). `ok`, `mk`, `until`, `rawEvents`, `buildDoorWorld`, `callTool` come from `flow-world.ts` (T1). The tool order in `flowTools` and in the pins is `set_wait_for_all`, `get_flow`, `get_timeline`, `resolve_decision`, `publish_flow` everywhere.

**4. Review Focus mapping.** (1) half-applied relabel: 29.376 (T1). (2) wrong loop edge: 29.376 (T1). (3) hidden Decision id: 29.380, 29.381 (T2), 29.383 (T3). (4) `publish_flow` retry, child-first, 409: 29.387 (T5). (5) `resolve_decision` stale `from` and a preview that writes nothing: 29.385, 29.386 (T4).

**Spec gaps and contradictions found (for the planner):**
- **No client-callable atomic Decide door in the spec.** §14 says the tool records the outcome and finishes the Decision "in the same atomic batch", but only the in-server `ingestAtomic` (D-10) is named; `POST /v1/events` commits each event on its own (`apps/server/src/ingest/ingest-service.ts:432-445`). Part 3 T11 adds `POST …/tickets/:id/decide` with a dry run (probe S5), which this plan consumes for every choice.
- **Settled by planner rulings P1 to P3 (reconcile, 2026-10-03):** the door takes `finishStateId?: string | null` (`close: false` sends `null`, `close: true` omits it), its write answers `{filed, pass, revised}`, and its dry run's `blocked` carries the engine's `sentence`. T4 uses the door for every choice; no event-door path remains.
- **`pin` in the timeline index:** PR-0 (spec line 174) says `pin` is "true when…"; TG-11 (line 714) says "the counts ride the index entry"; §14 says `pin: {notes, attachments}`. The plan follows TG-11 and §14 (probe S7).
- **`publish_flow` and the route's 200-id limit:** settled by planner ruling P4: a flow of more than 200 drafts is refused up front (the publish is atomic and never batched); the spec's §14 `publish_flow` line carries it (the parent's spec edit).
- **`publish_flow` preview "the keys they would take"** (§14) cannot be shown: no route reads a project's next key and the Drafts spec assigns keys at commit (R50). The preview shows order and titles (Decision 3).
- **typed-links T4's `get_ticket.links` drops `label`**: Graph Part 2 T2 adds the passthrough (29.126); T1 only asserts it.
- **Spec §14 `resolve_decision` preview shape** uses `sentence`; the house `Preview` uses `wouldChange` (`preview.ts:1-9`). The plan keeps the house keys (Decision 1).

**Execution:** the gisik-nokma lanes (one task = one session), per the planner.

---

## Ledger rows

Append to `docs/lanes/task-ledger.tsv` (tab separated; plan id is the file stem without the date):

```
wtg-part5-mcp	1	todo	-	-	not started (waits for Graph Parts 2-4 and Drafts; link_tickets leads_to/label/relabel, set_wait_for_all, estimate; adds its per-task anchors under Part 1's Part 5 anchor)
wtg-part5-mcp	2	todo	-	-	not started (waits for T1; get_flow and the flow facts on get_ticket)
wtg-part5-mcp	3	todo	-	-	not started (waits for T2 and Graph Part 4; get_timeline)
wtg-part5-mcp	4	todo	-	-	not started (waits for T3 and Graph Part 3's Decide door; resolve_decision)
wtg-part5-mcp	5	todo	-	-	not started (waits for T4 and the Drafts publish route; publish_flow, rule D2, registry audit, manual)
```
