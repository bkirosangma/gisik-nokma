# Settings → Workflows — the port plan

> **For agentic workers:** this plan is executed one task at a time, dispatched by the controller. Each
> task is one PR, base `main`. **Do not run two tasks at once** — several share `gateway.ts` and
> `builder-reads.ts`.

**Goal:** bring `/settings`' workflows cluster — the workflow list, the ticket-type list and the
ticket-type editor — to the 2026-09-18 prototype export.

**Authority, and there is no spec document to invent.** The owner's instruction of 2026-09-18: *"next task
to queue: settings->workflows. need a full check on what is built, what is left, and what the differences
is from the prototype."* The check already existed — **`docs/design/prototype-delta-2026-09-18.md`**, which
carries a per-screen *block → route → gap → verdict* row for every screen here. **This plan stages what
that document measured; it does not re-measure it.** Where a product decision is needed this plan names
the one already taken rather than making a new one.

**Prototype revision:** read `design-system/interactive/desktop.dc.html` **out of `main`** (`@227434a5`).
**The primary checkout sits on a retired branch whose copy is 15 lines short** — `isWorkflows` is at
`841` there and `826` in that stale tree. Every line number below is from `main`.

---

## ✅ THE HOLD IS LIFTED — the owner answered all four headings on 2026-09-19

`docs/lanes/owner-holds.md` §1 held four items in this cluster. **The owner has now answered every one, row
by row**, and the register records each ruling. **Three are approved to build; one is dropped.**

| heading | owner's answer | what it means |
|---|---|---|
| **Task 2** — the `isWorkflows` status badge | **drop it** | **BUILD NOTHING.** Record it as a **named absence** in the docblock — not as an outstanding gap. The read serves only published workflows, so a field holding one value would be a badge that lies by omission |
| **Task 3** — the `isWorkflows` second action | **yes** | **BUILD IT**, and **it is ONE decision with the version-history screen** — see the box below |
| **Task 6 + 7** — the `isTypes` ↑/↓ reorder | **yes** | **BUILD BOTH — AS A RENDER TASK. ⛔ NO ROUTE AND NO GATEWAY OP.** This row's original prediction — *"expect a route and a gateway method over data that already exists"* — was **refuted on 2026-09-19 by this plan's own Task 6 section, which is authoritative over this row.** The door already exists: `onSave` authors a `ticket-type.defined` event carrying `rank` through `gateway.submit` |
| **Task 8** — the `isTypes` `"N tickets"` count | **yes** | **BUILD IT, and it needs NEW server surface.** The only population read is pinned to one workflow (`WHERE workspace_id = $1 AND type_id = $2 AND workflow_id = $3`, `builder-reads.ts:408-414`) and the screen itself records that using it here prints a **wrong** number. The `"Draft"` badge stays a **named absence** — that half was separately ruled not-a-state |

### ⚠ THE VERSION-HISTORY DECISION, in full, because it is the first of its kind here

The owner's **yes** covers **Task 3 (the second action) and the version-history screen as ONE task.** The
measurement, verified at three lines:

| | |
|---|---|
| the route takes it | `builder-reads.ts` — `version?: string` on `/v1/workspaces/:workspaceId/workflows/:workflowId` |
| the query takes it | `packages/app-core/src/data-source.ts:146` — `getWorkflowDef(workspaceId, workflowId, version?: number)` |
| the web adapter **drops it** | `apps/web/src/authoring/data-source-gateway.ts:224` — `getWorkflow: (workspaceId, workflowId) => …getWorkflowDef(workspaceId, workflowId)` |
| history screens in `apps/web/app` | **0** |

**So the chain is readable today and only the screen is missing — and the PROTOTYPE DOES NOT DRAW ONE**
(its `View history` handler is a toast, `:3187`). **This is therefore the first port in this repo that
draws a screen the prototype does not have**, and that is why it needed an owner answer rather than a
ruling. **Build it with that stated in the docblock**, so a reader comparing the two finds the reason.

### 🚩 SEQUENCING — the `test-cases/13` SPLIT LANDS FIRST

The owner approved splitting `test-cases/13-deployment-dogfooding.md` (**104 commits touched it today
across 71 merges**, and it conflicted on essentially every merge pair). **That split must land BEFORE any
of the tasks above**, because every one of them appends cases to that file and would collide with a
structural move underneath it. See `owner-holds.md`'s 2026-09-19 section for what the split must prove.

**Tasks 5 and 9 shipped. Task 4 was already delivered by `#447`.**

---

## Ruled 2026-09-18 — every stop-and-ask in the first draft of this plan is now CLOSED

The plan was written with three explicit stop-and-asks and one held screen. **The owner answered all of
them**, approving the controller's recommendation in each case. **No task below now waits on a product
decision** — each carries its ruling inline, and the ones that would have been guesses are now absences.

| what was open | ruling | effect |
|---|---|---|
| `isWorkflows` status badge | **drop it** | no status field, no event; a named absence (Task 2) |
| `isWorkflows` second action | **`View history` if the data is already readable, else no button** | `Duplicate` / `Discard draft` are **not** built (Task 3) |
| `isTypes` `"Draft"` badge | **not a state this product has** | named absence; Task 8 shrinks to the count (Task 8) |
| `isTypes` Edit button | **not built — row-as-door stands** | the absence is recorded, not left as an oversight (Task 7) |
| `isSettingsShell` subtitle | **leave the deliberate freeze** | a freeze outranks a prototype delta (Task 9) |
| `isBuilder` layout | **not ported** | its unstyled CSS families ship separately (last section) |

**The discipline these follow, and it is the point:** a ruling that a thing is **absent** is recorded **in
the file and in the catalogue**, never left as an empty slot. A reader comparing this product to the
prototype will find the difference either way; what they must not find is a silence that reads as an
oversight.

---

## The cluster, measured

| screen | prototype | verdict | the gap in one line |
|---|---|---|---|
| `isSettingsShell` | `:800-1011` | **none** | shape already matches; three token nits |
| `isWorkflows` | `:841-869` | **wire-gap (M)** | flat `<ul>` vs a **card grid**; **`workflow-list__*` has ZERO CSS** |
| `isTypes` | `:817-839` | **wire-gap (M)** | no reorder controls, no Edit button, no zebra rows; three strings differ |
| `isTypeEditor` | `:871-957` | **port (M)** | placement, copy, the right-hand divergence card, the implications list |
| `isBuilder` | `:1013-1093` | **HELD** | cannot port as drawn — see the last section |

## The wire gaps, enumerated — this is what makes the cluster big

Eight, in three screens. **None of them is a styling problem**, and each is why its screen's verdict is
`wire-gap` rather than `port`.

**`isWorkflows`** — (1) **the status badge**: `PublishedWorkflowDef` is
`{id,version,name,initialStateId,states,transitions,stateMapping?}` (`packages/domain/src/workflow.ts:83-116`)
with **no status**; `"Published"` is derivable but `"Superseded"` is not. (2) **the second action**:
`"Duplicate"` / `"Discard draft"` / `"View history"` have **no gateway method**
(`packages/app-core/src/workflow-builder/gateway.ts:56-94`).

**`isTypes`** — (3) **reorder**: no rank/reorder op on the gateway and **no reorder route**
(`apps/server/src/routes/builder-reads.ts`, zero hits). ⚠ **BOTH FACTS ARE TRUE AND NEITHER IS A GAP** —
**CORRECTED 2026-09-19: this is NOT wire work, and adding a route would be a second door to a thing that
already has one. Read Task 6's section before acting on this item.** (4) **the `"Draft"` badge**: `TicketTypeDef` is
`{id,name,icon,rank,workflowId,fields}` (`packages/domain/src/ticket-types.ts:27-51`) with no draft flag.
(5) **the `"N tickets"` segment**: the only population call is
`getTypeWorkflowPopulation(workspaceId, typeId, workflowId)` — **pinned to ONE workflow**
(`gateway.ts:77-85`) — and `ticket-type-list-screen.tsx:17-23` already records that the pinned count would
be wrong here.

**`isTypeEditor`** — (6) **the `required` toggle**: `customFieldDefSchema` is `{id,name,type,options}`
(`packages/domain/src/ticket-types.ts:11-16`) with **no `required`** at schema, wire, or `FieldsEditor`
layer. **THIS ONE IS ALREADY RULED: the owner answered yes on 2026-09-18** — *"fields gain `required`; the
blocked port unblocks"*. It is ordinary schema work now, not a stop-and-ask.

**And two that are the same shape one file over** — (7) the field **kind vocabulary and casing**:
prototype `Text / Date / Number / Attachment` vs product `['text','number','date','select','person']`
(`packages/domain/src/ticket-types.ts:4`) rendered as raw lowercase labels. (8) the **`"Draft · N issues"`
badge** the builder shows, which shares the `"Draft"` gap above.

---

## Tasks

Ordering is **no-wire first**, then wire — so owner-visible change lands while the server work is scoped,
and so a wire task never blocks a render task. Each task names its own acceptance; the plan does not
restate the repo's standing rules, which are in every dispatch.

### Task 1 — `isWorkflows`, the render-only port  *(DISPATCHED: `CTL-DISPATCH-2026-09-18-settings-workflows.md`)*
The card grid, the per-state chips with their 4px category bars, the meta line, the missing subtitle
*"Publishing records a version. Nothing already recorded is rewritten."*, and **the CSS family, which does
not exist at all** — `workflow-list__*` has zero rules, established by a controlled sweep (control fires at
31 `.ticket-type-list__` rules). The primary action is a bare `<button>` with no class.
**Not in scope:** the badge and the second action (gaps 1 and 2) — a badge that can only ever say one thing
lies by omission. **Acceptance:** the card renders for everything derivable; the two absences are named in
the file's docblock; the three arms (empty/loading/failure) still render.

### Task 2 — `isWorkflows`: the status badge  *(wire gap 1)* — **RULED: DROP IT**
**The owner ruled on 2026-09-18, approving the controller's recommendation: the badge is NOT built.**
`PublishedWorkflowDef` gains no status field and no event is added. The list serves only published defs, so
a field that can hold exactly one value would be a badge that lies by omission the moment a second state
exists.
**Deliverable:** nothing is rendered, and the absence is **named in the file's docblock** as a deliberate
scope decision — not left as an empty slot for a later reader to fill in. `Features.md` and
`test-cases/13` record it the same way.
**Depends on:** nothing. Folds into Task 1's PR if that has not yet opened.

### Task 3 — `isWorkflows`: the second action  *(wire gap 2)* — **CORRECTED 2026-09-19: THE CONDITION IS MET — BUILD IT, as ONE task with the version-history screen**
**The owner ruled on 2026-09-18, approving the controller's recommendation — CONDITIONALLY.**
**The owner resolved that condition on 2026-09-19: `yes`, and it is ONE decision with the version-history
screen.** So the conditional below **resolves to BUILD**, and *"build no button / record the absence"* is
**no longer a live outcome — do not execute that branch.**
**The measurement the condition asked for was taken, and the answer is "it is there"**, at three lines:

| | |
|---|---|
| the route takes it | `builder-reads.ts` — `version?: string` on `/v1/workspaces/:workspaceId/workflows/:workflowId` |
| the query takes it | `packages/app-core/src/data-source.ts:146` — `getWorkflowDef(workspaceId, workflowId, version?: number)` |
| the web adapter **drops it** | `apps/web/src/authoring/data-source-gateway.ts:224` |

Of the three candidates (`"Duplicate"` / `"Discard draft"` / `"View history"`, `:3174-3188`), only
**`View history`** has a plausible door: version history is what `PublishedWorkflowDef.version` and
`stateMapping` already imply. `"Duplicate"` and `"Discard draft"` are **not** built under any reading:
neither has a door, and a button with no door behind it is the exact defect this repo keeps re-finding.
**Acceptance:** a working `View history` opening a history view that renders a **REAL version chain**, with
a case asserting the **RENDERED** history — a superseded version visible **with its content**; plus the
absence of the other two candidates named in the docblock, with the reason.

### Task 4 — `isTypeEditor`: field `required`, end to end  *(wire gap 6 — ALREADY RULED YES)*
`customFieldDefSchema` (`packages/domain/src/ticket-types.ts:11-16`) gains `required`; it travels the wire
(server read + mapper) and reaches `FieldsEditor` (`fields-editor.tsx:62-173`), which gains the toggle the
prototype draws. **Carry it end to end in ONE task** — the repo's standing rule is that a wire field
carried in two tasks gets dropped in the seam. **Acceptance:** a field created as required survives a
round trip, and a case asserts the toggle's rendered state, not that a schema key exists.

### Task 5 — `isTypeEditor`: the port
Header (h2 at 22px with Cancel + Save in that row — the product puts Save at the form's foot), the
**right-hand `--tintWarning` divergence card** (the data is already carried by
`gateway.getTypeWorkflowPopulation` `:131` and `migrateTypeToWorkflow` `:169` — this is placement, not
wire), the static three-item implications list, and the copy: *"Neither choice is recommended over the
other — leaving them is a decision, not a deferral."* exists nowhere in the product (0 hits), the reopen
control has no counterpart, and the prototype names a **state** where the product names the **workflow**.
**Note:** the divergence card is the same `--tintWarning` treatment Task 2 of the attention work touches —
if that lands first, follow its precedent for the composite condition.

### Task 6 — `isTypes`: the reorder — **CORRECTED 2026-09-19: A RENDER TASK, NOT A WIRE TASK**

**⛔ DO NOT ADD A ROUTE OR A GATEWAY OP.** This plan, the delta audit (**"wire gap 3"**) and
`owner-holds.md`'s lift row **all scoped this as wire work, and all three are wrong.** The product says so
in a docblock that cites the code — `packages/app-core/src/workflow-builder/ticket-types/ticket-type-list-screen.tsx:35-56`,
measured 2026-09-18:

> *"**the hold is NOT about a missing door.** The gateway declares no update op of any kind, but the door
> is not the gateway's: `onSave` authors a `ticket-type.defined` event carrying the whole definition —
> `rank` included — and sends it through `gateway.submit`. `ticketTypeDefSchema` carries
> `rank: z.number().int().min(1)`, so a reorder control would be **assign a different rank and submit**…
> **No new route and no new projection — so if the hold lifts, this is a render task, not the wire task
> the delta audit scoped it as.**"*

**Re-verified on `main` 2026-09-19, three ways:** `rank: z.number().int().min(1)` is in the schema
(`packages/domain/src/ticket-types.ts:98`); the gateway declares **no** reorder or rank op (**0 hits**);
and built-ins are **rank-locked server-side** (`packages/rule-engine/src/checks/ticket-type.ts:60-62`
refuses `type.builtin-rank`). **Adding a route would be a second door to a thing that already has one** —
the exact defect this repo refuses by name in this same file, for the Edit button.

**So Task 6 is:** build the ↑/↓ controls (Task 7's half), have them **assign a rank and submit through the
existing door**, and carry three things the prototype does not model:
1. **A swap that moves a BUILT-IN is REFUSED server-side** (`type.builtin-rank`), so the control must
   anticipate a refusal rather than assume a swap always lands.
2. **The prototype's rank is its array index** (`rank: String(i+1)`); the product's is a **stored number
   nothing enforces uniqueness on.**
3. **The docblock above still records this as HELD** and the owner lifted it on **2026-09-19** — **update
   it in the same change set**, or a reader meets a recorded hold for approved work.

### Task 7 — `isTypes`: the port — **RULED: no Edit button; row-as-door stands**
The ↑/↓ buttons (disabled at the ends), the zebra row surface, and three strings (`"New type"` vs
`"New ticket type"`; the h2 at `1rem` vs `20px/25px`; the summary sentence).
**The owner ruled on 2026-09-18, approving the controller's recommendation: the explicit Edit button is NOT
built.** Row-as-door is a pre-existing owner ruling (`ui.css:1603-1611`) and an Edit button beside it would
be a second door to the same place. **Record the absence in the file's docblock and say why** — the
prototype draws one, and a reader comparing the two will otherwise read its absence as an oversight.

### Task 8 — `isTypes`: the `"N tickets"` count — **RULED: no `"Draft"` badge**
**The owner ruled on 2026-09-18, approving the controller's recommendation: a draft ticket type is not a
state this product has**, so the badge is not built and `TicketTypeDef` gains no draft flag. Record it as a
**named absence**.
**The task therefore shrinks to the count alone:** `countTicketsOfType` does not exist and the only
population call (`getTypeWorkflowPopulation`) is **pinned to one workflow**, which
`ticket-type-list-screen.tsx:17-23` already records would be the wrong number here. Build the count op and
the `"N tickets"` segment. **If the count turns out to need a new projection rather than a query, stop and
ask** — that is a different size of task.

### Task 9 — `isSettingsShell`: three token nits  *(verdict `none`)* — **RULED: the frozen subtitle STAYS**
Sidebar `248px` vs `flex: 0 0 12rem` = 192px (`globals.css:1226`); active item `--accent`/`--onColor` at
radius 10px vs `--gn-fill-tertiary`/`--gn-text-accent` (`:1241-1245`).
**The third nit — the subtitle at `17px/22px` vs the frozen `0.8rem` — is RULED: leave it.** The owner
approved the controller's recommendation on 2026-09-18. `globals.css:333` is deliberately frozen with its
own comment at `:286-294`, and a deliberate freeze outranks a prototype delta. **Do not touch it.** Small
enough to fold into any task above that already touches `globals.css`.

---

## NOT in this plan

**`isBuilder`'s LAYOUT is RULED — not ported.** The owner ruled on 2026-09-18, approving the controller's
recommendation. The prototype's right column **invents controls the product puts on the node** (Category and
Blocked live on `state-node.tsx:29-57`, not in the inspector) and it **omits the product's entire left
column** — adopting it as drawn would **delete `SystemRulesPanel`**, the two unauthorable invariants. **The
three-column layout, the node-hosted controls and every panel stay exactly as they are.**

**But its unstyled class families ARE being fixed now, in their own task** — dispatched as
`CTL-DISPATCH-2026-09-18-builder-unstyled-families.md`. `workflow-builder-screen*`, `state-inspector*` and
`inspector-panel*` have **no CSS at all**, established by a controlled sweep (0 hits for each, while the
same command shape finds `gn-legal__title`, `gn-workflow-canvas` and the siblings **inside the same
components**). That is a bounded **M** restyle, ruling-independent, and it does not touch the layout.

**The MCP-tokens tab is not missing.** The prototype's `settingsNav` has three entries; the product carries
two because the owner moved MCP tokens to `/account` — a ruled relocation, not an omission.

## Dependencies

- Task 4 (the `required` schema) **must land before** Task 5, which renders the toggle's consequences.
- Tasks 2, 3, 6 and 8 **all touch `gateway.ts`** and Tasks 2/3/6 touch `builder-reads.ts` — **one at a time**.
- Task 1 is independent of everything and is already dispatched.
