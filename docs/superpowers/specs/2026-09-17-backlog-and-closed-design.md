# Backlog and closed: the board shows only what is in focus

**Date:** 2026-09-17
**Branch:** `owner/workspace-edits`
**Owner's words:** "lets have another status for tickets (this status is
default in all workflows) - backlog. have a separate tab for backlogs. so that
board is only populated by tickets which need to be in focus. another status on
the other side should be closed. closed tickets are also not shown on the
board." Then: "backlog by default. and lets actually have closed be a flag
instead of a status. but you can only close a ticket in a terminal state. so
that we can see the final state of the ticket easily, and maybe even filter to
see things." Then: "explicit reopen."

## What this is

Two additions to every ticket's lifecycle, neither authored in a workflow:

1. **Backlog** — a universal state every workflow implicitly has, BEFORE its
   own initial state. New tickets are born there. The board never shows it; a
   new Backlog tab does, with a per-row **Start** that pulls the ticket into
   its workflow's initial state.
2. **Closed** — a flag, not a state, settable only while a ticket sits in a
   terminal state of its workflow. The ticket keeps its final state (Done,
   Approved, …) visibly; the board hides closed tickets; the list shows them
   with a badge and lets you filter on the flag. Reopening is explicit.

## Decisions the owner made in the brainstorm (settled)

| Question | Ruling |
|---|---|
| Universal built-in states vs default rows the builder manages | **Universal built-ins.** Nothing to migrate; every workflow gets them by construction; the builder never shows them. |
| Where a new ticket starts | **Backlog by default.** Exception (assumed, not ruled against): a child created from an in-focus parent's ticket sheet starts in focus. |
| Closed: state or flag | **A flag**, settable only in a terminal state, so the final state stays visible and filterable. |
| Can a closed ticket be moved | **Explicit reopen.** Transitions are refused while closed; Reopen clears the flag and leaves the ticket in its terminal state. |
| Other tabs | **Backlog tab** (list of backlog rows + Start); **List** shows everything, closed rows badged, `closed` is a filter; **Calendar/Timeline** hide closed by default, show backlog. |

## What was found before designing (facts the design rests on)

- A ticket is born in `wf.initialStateId` with that state's category
  (`packages/domain/src/ticket-state.ts:118-134`, the `ticket.created` branch
  of `applyTicketEvent`). `TicketState` (`packages/domain/src/entity-state.ts:24-39`)
  carries `stateId`, `stateCategory`, `transitions[]` and no flag of any kind.
- The engine resolves a transition's target with
  `latest.states.find(id === payload.to)` and refuses `unknown-state`
  otherwise (`packages/rule-engine/src/transition.ts:85-88`); the
  parent-can't-outrun-children invariant keys on `toState.category === 'terminal'`
  (`:104-115`). So a universal state must be known to the engine, not only to
  the reducer.
- `proj_tickets` (`apps/server/migrations/1787961800000_proj-tickets.sql:73-89`)
  is the head-state projection; `state_category` is `CHECK (IN ('open','active','terminal'))`.
  Readers: `apps/server/src/read/ticket-cards.ts` (the shared card select),
  `routes/board.ts` (`readBoard`, which also builds STRAGGLER columns for a
  ticket whose state is not in its def — `:206-236` — so a backlog ticket
  would render as a column named `backlog` today), `routes/list.ts`,
  `routes/my-work.ts` (groups by `state_category`, refuses a fourth value),
  `routes/attention.ts:233` (skips terminal), `visibility/rollup.ts:256`
  (terminal children counts), `read/compile-filter.ts` (wire filter).
- The workflow-version fold on republish (`foldTicketToWorkflowVersion`,
  `ticket-state.ts:~300`) maps a ticket's state through `stateMapping` when
  its state was dropped — a ticket in `backlog` is in no def's `states`, so
  the fold must treat the universal id as never-dropped.
- `validateWorkflowDef` (`packages/domain/src/validate-workflow.ts:12`) and
  `adviseWorkflowDef` (`advise-workflow.ts:28`) are the publish gates; neither
  reserves any id today.
- The project page's `view` union is `'board' | 'list' | 'calendar' | 'timeline'`
  (`apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx:155`); `TAB_NOUN`
  (the strip's scope note) is a `Record` over it, so a fifth tab is a
  compile error until named — by design (exclude-mode spec, Amendment 2).
- The ticket sheet's move affordance is one `Move…` button
  (`packages/app-core/src/views/ticket-sheet.tsx:324`) opening
  `TransitionDialog`. The board's per-card `MoveArrows` route every move
  through `moveOutcome` (`board-moves.ts`) and open the same dialog.
- The exclude-mode work (spec `2026-09-17-filter-exclude-all-tabs-design.md`)
  left the Filters sheet's State chips sourced from the board's rendered
  columns and named this change set as the one that moves the source to the
  workflow definitions (§8 there).

## 1. Domain

### 1.1 The universal state

`packages/domain/src/workflow.ts` exports:

```ts
export const BACKLOG_STATE_ID = 'backlog';
export const BACKLOG_STATE: WorkflowState = { id: BACKLOG_STATE_ID, name: 'Backlog', category: 'open' };
```

and one helper every consumer reads instead of `def.states` when it needs the
FULL state set:

```ts
/** `def.states` plus the universal Backlog state, which every workflow has without declaring it. */
export function statesWithBacklog(def: WorkflowDef): WorkflowState[];
/** The universal edges: `backlog → def.initialStateId` (Start) and `s → backlog` for every NON-terminal declared state (Send to backlog). No rules. */
export function universalTransitions(def: WorkflowDef): Transition[];
/** `def.transitions` plus `universalTransitions(def)`. */
export function transitionsWithBacklog(def: WorkflowDef): Transition[];
```

A terminal ticket cannot go to backlog: it is finished, not parked. Backlog
carries no rules, ever — a workflow cannot gate its own Start edge; the
first DECLARED edge out of the initial state keeps whatever rules it has.

`validateWorkflowDef` gains one issue: a state or transition endpoint named
`backlog` is refused ("`backlog` is reserved — every workflow has it without
declaring it").

### 1.2 The closed flag

`TicketState` gains `closed?: { actorId: string; at: string } | null`
(`at` = the event's server time, the same clock every other claim uses).
OPTIONAL on the domain type, and only there, for one measured reason: 441
`TicketState` literals in tests across five packages predate the field, and
a required field would touch every one for no behavioural gain. Every
PRODUCER sets it — the reducer (creation → `null`), `rowToTicketState`,
the replica's row mapping — and each is pinned by a test; every READER
spells `state.closed ?? null`. The wire types (`TicketCard`, `ListRow`,
`TicketRead` via the domain type) carry it REQUIRED — their fixture sites
are few and go through helpers.

Two event types registered against `entityKind: 'ticket'` in
`packages/domain/src/vocabulary.ts` with schemas in `events/ticket-events.ts`:

- `ticket.closed` — payload `{}` (the envelope carries actor and time).
- `ticket.reopened` — payload `{}`.

`applyTicketEvent` folds both: `closed` set from the envelope on `ticket.closed`,
`null` on `ticket.reopened`. Neither touches `stateId`, `stateCategory` or
`transitions`. The reducer's own "TEN of the THIRTEEN" docblock becomes
twelve of fifteen, restated. The replica backfill list (`sync-routes.ts`)
does NOT gain either type (amended 2026-09-17, see Amendments — Ruling 5):
unlike `comment.added`/`attachment.added`, neither event carries content a
replica needs verbatim beyond the fold every other head-state event already
gets, so backfilling them a second time would be redundant.

### 1.3 Creation

`ticketCreatedPayload` gains `start: z.enum(['backlog', 'focus']).optional()`,
and its ABSENCE means what the v1 payload always meant: born in focus at
`wf.initialStateId`. That is the additive-field rule for an event vocabulary
— an old ledger replays to the same head state, and no fixture that predates
the field changes meaning (measured: ~150 `ticket.created` builders across
~30 test files, one production builder). "Backlog by default" is therefore
the CLIENT's rule, and the product's one creation path (`create-ticket-flow.tsx`,
§5.4) always sends `start` explicitly — `'backlog'` unless the in-focus
exception applies — pinned by a test that fails if the field is ever
omitted. The reducer: `start === 'backlog'` → `BACKLOG_STATE`; otherwise
`wf.initialStateId` as today. No state migration (§3.4).

MCP's `create_ticket` tool is a SECOND production producer of `ticket.created`
(amended 2026-09-17, see Amendments — Ruling 51): it carries the identical
optional `start` argument under the identical additive-field rule, but its
own default is `'backlog'` rather than the schema's silent focus — an
assistant-created ticket lands where every other creation path's default
lands unless the caller names `'focus'` explicitly, and the argument's
absence still sends an explicit `start: 'backlog'` on the wire, never an
absent key.

### 1.4 The fold on republish

`foldTicketToWorkflowVersion` treats `BACKLOG_STATE_ID` as never dropped: a
backlog ticket stays in backlog at the new version (its `workflowVersion`
advances like everyone else's). `hasStateMapping`/the publish door's
"mapping required for every dropped state" never asks for a backlog mapping.

## 2. Rule engine

`packages/rule-engine/src/transition.ts` resolves `toState` and the edge over
`statesWithBacklog(latest)` / `transitionsWithBacklog(latest)`, so the two
universal edges pass the `unknown-state` and `illegal-transition` gates like
declared ones and the parent-terminal invariant keeps working off the
resolved state's category.

New refusal rules in `refusal-rules.ts`, each a `checkTicketX` in `evaluate.ts`:

| Event | Refused when | Rule id | Reason (verbatim) |
|---|---|---|---|
| `ticket.closed` | ticket's `stateCategory !== 'terminal'` | `close-requires-terminal` | `A ticket can only be closed from a terminal state; "${stateName}" is not one.` |
| `ticket.closed` | already closed | `already-closed` | `This ticket is already closed.` |
| `ticket.reopened` | not closed | `not-closed` | `This ticket is not closed.` |
| `ticket.transitioned` | ticket is closed | `closed-ticket` | `This ticket is closed — reopen it first.` |

The `closed-ticket` check runs before edge resolution (a closed ticket has
no legal move at all). Permissions: whoever may transition a ticket may
close or reopen it — no new role gate.

The hierarchy reopen offer (`hierarchy.parent-terminal`, `flows/guarded-child-event.ts`)
on a CLOSED parent submits `ticket.reopened` for the parent followed by the
reopening transition, in one ordered batch, so the person is asked once.
`precheck.ts` mirrors the four refusals for the instant preview.

**§2.3 addition (2026-09-17, see Amendments — Ruling 39):** the server
commits each event of that batch independently, so `[ticket.reopened,
transition]` can commit the reopen and still refuse the transition — a
PARTIAL commit the flow must disclose rather than mask. The `parent-refused`
outcome therefore carries `parentReopened: boolean`, true exactly when the
batch's `ticket.reopened` committed before the transition it was paired with
was refused (also carried on `invalid`, for completeness, though that
outcome exits the dialog and cannot be retried). When `parentReopened` is
true, a retry with a different target sends the transition ALONE — resending
`ticket.reopened` against an already-reopened parent would itself refuse
`not-closed` and mask the real answer. The reopen stands either way; only
the transition is retried.

**§2.4 addition (2026-09-17, see Amendments — Ruling 53; extended 2026-09-17,
see Amendments — Ruling 56):** closed ⇒ terminal must survive every path
that changes a ticket's workflow or state mapping, not only an ordinary
transition. FOUR gates hold it, not three: `checkTicketWorkflowRebound`
(`packages/rule-engine/src/checks/workflow-rebind.ts`) refuses
`ticket.workflow_rebound` for a closed ticket when the target state's
category is not terminal (`REFUSAL_RULES.closedTicket`, reason "This ticket
is closed; a migration may only move it to a terminal state."); the
corresponding pre-flight in the bulk rebind route
(`apps/server/src/routes/builder-reads.ts`) refuses the whole request before
any event is built when a closed row's mapped target is non-terminal
(`migration.closed-to-non-terminal`); `workflow.defined`'s republish check
(`packages/rule-engine/src/workflow-defined.ts`) refuses a `stateMapping`
that sends a dropped TERMINAL state to a non-terminal survivor in the new
version; and the SAME republish check also refuses a version that KEEPS a
state's id but changes its category from `terminal` to anything else — no
`stateMapping` entry is owed for a state that is not dropped, but
`foldTicketToWorkflowVersion` recomputes a ticket's `stateCategory` from the
new definition regardless of whether the id was ever mapped, so a closed
ticket sitting in a surviving state would otherwise follow the demotion
silently (Ruling 56(a), Finding N1 of the opus re-review: the builder's
category select carries no published-state lock, only a permission gate).
All four exist because `foldTicketToWorkflowVersion` and the rebind fold
both spread `...state`, so a closed ticket's `closed` claim rides along
unconditionally while `stateId` (or, for the fourth gate, the meaning of a
`stateId` the ticket already occupies) moves — a mapping or a category edit
is the kind of move `ticket.closed`/`ticket.reopened` never gate, because
neither event is emitted when either one does it.

## 3. Server

### 3.1 Projection

Migration `1789100000000_proj-tickets-closed.sql`: `closed_at timestamptz NULL`,
`closed_by text NULL` on `proj_tickets`; partial index
`proj_tickets_open_idx ON proj_tickets (workspace_id, project_id) WHERE closed_at IS NULL`
(the board's and attention's hot path). The projection writer maps
`TicketState.closed` to both columns. `state_category` keeps its three-value
CHECK — backlog is `open`.

### 3.2 Readers

- `read/ticket-cards.ts` selects `closed_at, closed_by`; every card and row
  type gains `closed: { actorId, at } | null`.
- `routes/board.ts` `readBoard`: `WHERE state_id <> 'backlog' AND closed_at IS NULL`
  before any bucketing — never a straggler column for either. The
  `appendStragglerColumns` docblock names this as the one deliberate hole.
- `routes/list.ts`: no exclusion; rows carry `closed`; a `closed` filter term
  compiles to `closed_at IS NOT NULL` / `IS NULL`.
- `routes/my-work.ts`: `WHERE closed_at IS NULL` (a closed ticket is nobody's
  work); backlog tickets stay in the `open` group.
- `routes/attention.ts`: skip closed as it skips terminal today.
- `visibility/rollup.ts`: unchanged — closed ⊂ terminal.
- `read/compile-filter.ts` + `filterSpecSchema` (`packages/domain/src/filter-spec.ts`):
  new term `closed?: boolean`.
- Search projection: unchanged (closed tickets stay searchable).

### 3.3 Read-model types

`packages/domain/src/read-models.ts`: `closed` on the ticket card, list row and
ticket read shapes. `BoardCard` needs nothing — the board never sees these.

### 3.4 Existing data

No state migration and no retroactive reading of "backlog by default": a
ticket in `todo` stays in `todo`, and a projection rebuild agrees, because
the reducer reads a `ticket.created` without `start` as focus (§1.3).
The only schema change is the two nullable `closed_*` columns, both `NULL`
for every existing row. The owner's own workspace is the only data that
exists today, and nothing in it moves.

## 4. Client vocabulary (`packages/app-core`)

- `TicketState` (domain) → `ListRow`, `TicketRead` gain `closed`.
- `FilterSpec` gains `closed?: boolean` — NOT an id axis (no include/exclude
  halves): `true` = closed only, `false` = not closed, absent = all.
  `matchesFilter`, `matchesListRow` honour it; `matchesBoardCard` does not
  carry it (unrepresentable — the board never has a closed card).
  `toServerFilterSpec` sends it as is (a single value, expressible).
- `transitionOptions(def, from)` reads `transitionsWithBacklog`/`statesWithBacklog`,
  so `MoveArrows`'s `arrowTargets`, `moveOutcome`, the picker and the
  precheck offer Start / Send to backlog with no special cases. Column order
  for the arrows: backlog is not a column, so "Send to backlog" is never an
  arrow target — it is a dialog option and a sheet action only; the picker
  lists it when the dialog is open on a non-terminal ticket.
- State options for the Filters sheet come from the workflow definitions
  (`getWorkflowDef` per group, `statesWithBacklog`), not the rendered
  columns — closing the item #3's spec deferred.

## 5. UI

### 5.1 Backlog tab

Fifth tab, `view: 'backlog'`, label "Backlog". `TicketList` over
`listNarrowing.rows.filter(row => row.stateId === BACKLOG_STATE_ID)` with the
page filter applied like every other tab, the strip per tab as today
(`TAB_NOUN.backlog = 'backlog'`). Each row gets a **Start** button (right of
the title; `aria-label` "Start <title>") that submits `ticket.transitioned {to: def.initialStateId}`
directly through `dataSource.ingest` (amended 2026-09-17, see Amendments —
Ruling 41: the sentence this replaces, "through the same
`moveOutcome`/`TransitionDialog` path the arrows use — a gated initial edge
still asks", described a branch §1.2 makes unreachable by construction; a
gated initial edge can never exist). Start's answer renders per row: a real
refusal in `gn-refusal--server` with the reason verbatim, a rejection or
silence in `gn-refusal--transport`, a `submitting` latch reset in `finally`,
and `list.reload()` on `committed`. Empty state: "Nothing in the backlog —
new tickets land here." No ranking, no drag-ordering (§8).

### 5.2 Board

Unchanged except: a card in a **terminal** column gains a **Close** button
beside the arrows (its `›` is always disabled there — the last column has no
forward edge). Click → `ticket.closed`; on `committed` the board reloads and
the card is gone; a refusal renders through the existing notice path
(`MoveRefusalNotice`'s sibling, same `gn-refusal--server` style). Cards never
show a closed badge — they are never closed.

### 5.3 Ticket sheet

- Header badge "Closed by <name> on <date>" when closed (the roster resolves
  the name; the id otherwise, per the provenance rule).
- **Close** button: rendered only when `stateCategory === 'terminal'` and not
  closed. **Reopen** button: only when closed. Both submit one event and
  show the server's answer in the sheet's existing refusal slot; both carry
  a `submitting` latch (disabled while the ingest is pending, re-enabled in
  `finally`) mirroring the board's own idiom (added 2026-09-17, see
  Amendments — Rulings 31–34).
- A real refusal renders in the sheet's existing `gn-refusal--server` slot,
  verbatim. A rejected or silent answer renders separately, in its own
  `gn-refusal--transport` slot ("We could not reach the server for this
  change — <message>" / "The server did not answer this change."), never
  worded as the server's verdict; either slot clears on the next real answer
  and Close/Reopen re-enable (added 2026-09-17, see Amendments — Rulings
  31–34).
- **Move…** disabled while closed, with the sentence "Closed — reopen it
  first" beside it (not a tooltip).
- The sheet's dismiss control is named `aria-label="Close sheet"`, distinct
  from the business **Close** button above — the two are not
  indistinguishable dialog buttons of the same name (added 2026-09-17, see
  Amendments — Ruling 31).

### 5.4 New ticket

The dialog states "Starts in the backlog" under the title field. The only
creation path in the WEB CLIENT is this dialog (there is no create-from-sheet
affordance — checked, not assumed); MCP's `create_ticket` tool is a second,
independent creation path with its own default (§1.3) (amended 2026-09-17,
see Amendments — Ruling 51). Within the dialog, the in-focus exception keys
on the PARENT CHOSEN IN THE DIALOG: when the selected parent is in focus
(`stateId !== 'backlog'` AND not closed), a checkbox "Start in focus" appears,
checked by default, and sets `start: 'focus'`; with no parent, or a backlog
or closed parent, there is no checkbox — backlog, always.
`parentCandidates` therefore carry `inFocus: boolean` beside `id`/`title`.
**"Checked by default" is per CHOSEN parent, not per dialog session**
(amended 2026-09-17, see Amendments — Ruling 40): choosing a parent — any
change of `parentId`, including a switch from one in-focus parent to
another — resets the checkbox to checked. Unticking it under one parent
does not carry forward to a different parent picked afterward.

### 5.5 Filters sheet and the other tabs

- A **Closed** tri-state control in the sheet: All / Closed only / Not
  closed, mapping to `closed: undefined | true | false`; strip chip
  "Closed: only" / "Closed: hidden".
- State chips include "Backlog".
- List: closed rows carry a "Closed" chip in the state column. Calendar and
  Timeline (amended 2026-09-17, see Amendments — Ruling 44: the original
  "the page passes `closed: false` unless the filter sets `closed`
  explicitly" made the sheet's own "All" setting unable to ever show a
  closed ticket on these two tabs, since an explicit `closed: undefined`
  is indistinguishable from an unset one — the "Closed: hidden" chip it
  mandates could then never be removed): a page-level `showClosedOnDates`
  boolean, default `false`. The effective closed clause on these two tabs is
  `filter.closed ?? (showClosedOnDates ? undefined : false)`. The strip
  carries the "Closed: hidden" chip on these tabs whenever the default is in
  force (`filter.closed === undefined && !showClosedOnDates`), with
  `onRemove: () => setShowClosedOnDates(true)`; an explicit `closed` set
  from the sheet overrides the default in both directions and clears through
  its own chip as usual, after which the default resumes (its own chip
  returns). The List tab is unaffected — it always shows everything, badged.

## 6. Offline replica

`replica-data-source.ts` applies events through the shared reducer, so the
flag folds for free. Its `getBoard` mirrors §3.2's exclusion; its `getTickets`
rows carry `closed`; its outbox accepts `ticket.closed`/`ticket.reopened`.
The bootstrap backfill list does NOT gain the two types (§1.2; amended
2026-09-17, see Amendments — Ruling 5).

## 7. Workflow builder

Never shows the universal state or edges. `validateWorkflowDef` refuses the
reserved id (§1.1); the builder surfaces that issue like any other. The
template gallery and `SIMPLE_KANBAN_TEMPLATE` are untouched.

## 8. Second wave: ranking, auto-close, bulk close (owner: "these things are actually useful")

Three features that depend on §1–§7 and ship as a SECOND plan after the core
lands. Designed and approved 2026-09-17 in the same brainstorm.

### 8.1 Backlog ranking (drag to reorder)

A per-project manual order of backlog tickets, persisted as a ledger fact —
everyone sees the same order.

- **Model.** `TicketState.rank: string | null` (`null` = never ranked); one
  event `ticket.ranked { rank }`. Ranks are order-preserving fractional
  string keys (LexoRank-style): the domain exports
  `rankBetween(before: string | null, after: string | null): string`, which
  yields a key strictly between its neighbours without renumbering anyone
  else, so a reorder is exactly ONE `ticket.ranked` for the moved ticket.
  Unranked tickets sort after ranked ones, by creation (`ticketId`, a ULID),
  so nothing needs a rank to be listed. A rank is meaningful only within the
  ticket's project. Starting a ticket keeps its rank (it leaves the tab;
  harmless).
- **Engine.** `ticket.ranked` refused unless the ticket is in backlog
  (`rank-requires-backlog`: "Only a backlog ticket can be ranked; this one is
  in \"${stateName}\"."); the schema refuses a key that is not a valid rank
  string.
- **Server.** `proj_tickets.rank text NULL`; every list row and every ticket
  read carries `rank` on the wire; **the list route keeps its `ticket_id`
  keyset order, and the Backlog tab sorts by `rank`** (amended 2026-09-18,
  see Amendments — R1).
- **UI.** The Backlog tab's rows are draggable with the board's own native
  DnD idiom (`dragstart` on the row, `drop` on a row = "place before this
  row", drop on the list's tail zone = "place last"; the dragged id in
  `dataTransfer`; `useLayoutEffect` registration, as `13.534` taught). A
  keyboard alternative on every row — "Move up" / "Move down" buttons
  (`aria-label` "Move <title> up") — so ordering is never pointer-only. The
  row moves optimistically; a refusal snaps it back with the notice. The tab
  sorts by `rank`, then creation.

### 8.2 Auto-close after N days in a terminal state

- **Setting.** `autoCloseAfterDays: number | null` on WORKSPACE settings
  (`workspace.settings_set`, beside `staleDays`/`dueSoonDays`; the same
  Settings surface; range 1–365; `null` = off; default OFF). Per-project
  override is a follow-on (§9).
- **Sweep.** A job in the existing daemon (`ops/schedule.ts`,
  `AUTO_CLOSE_SWEEP_INTERVAL_MS`, default 1 h, validated by
  `requirePositiveIntervalMs`). For each workspace with the setting on, it
  selects tickets that are terminal, not closed, not reopened-and-untouched
  (below), and whose entry into the current state — the last `transitions[]`
  entry's server time, the same instant `stateProvenanceFor` already reads —
  is ≥ N days ago (IST day arithmetic, the product's one clock), and ingests
  one `ticket.closed` per ticket THROUGH THE INGEST DOOR (`ingestAll`), never
  by writing the projection: the engine's own refusals still apply and the
  ledger records who closed what.
- **Actor.** A reserved system actor, `SYSTEM_ACTOR_AUTO_CLOSE` (a fixed ULID
  constant in the domain), `origin: 'server'`. The roster resolves it to the
  name "Auto-close"; the sheet reads "Closed by Auto-close on <date>".
- **Reopen wins.** `TicketState.reopenedAt: string | null` — set by
  `ticket.reopened`, cleared by any `ticket.transitioned`. The sweep skips
  rows with it set, so an explicit reopen is not undone an hour later; the
  next transition (even back into the same terminal state) re-arms the
  clock. Projection column `reopened_at timestamptz NULL`.

### 8.3 Bulk close

- **Board.** A TERMINAL column's header gains **Close all (N)** (N = cards in
  the column). It opens one confirm dialog listing the N titles; confirming
  submits N `ticket.closed` in ONE ingest batch. Per-ticket refusals (the
  engine decides — none expected, since a terminal ticket with open children
  cannot exist, but the dialog reports each by title) stay listed; the rest
  close and the board reloads.
- **List.** Row checkboxes and a "Close selected (N)" action in the list's
  control row, enabled only when every selected row is terminal and not
  closed — the cross-column case. Same dialog, same batch.
- **One path.** Auto-close and both bulk surfaces emit plain `ticket.closed`
  events, one per ticket; there is no "bulk" event type and no server-side
  bulk endpoint.

## 9. Named, not built

Per-project auto-close override; MCP surface changes (the MCP routes expose
what the read models carry — they gain `closed`/`rank` for free but no new
tools); a "Closed" column option in the list's per-user columns; a
cross-project backlog.

**Named during this plan's own execution (2026-09-17) — see the "Follow-ons
named during execution" list under Amendments below for each item's
file:line:** `check-case-citations.mjs` letter-suffix support;
`submitFromDialog` treating an empty results array as committed
(`board.tsx`); a rebind INTO backlog refused rather than redirected
(`workflow-rebind.ts`); fixture-suite entries for the four new refusal ids;
the untested signed-out gates on the board's `moves` and the Backlog tab's
`rowAction`; the sheet's `submitTransition` rejected-ingest path, now that a
transport slot exists for it; the board strip's "Not applied on the board:
closed." sentence untested end-to-end; and the note that 13.588a's mutation
witness discriminates only the committed path, not the rejected one.

## 10. Testing

Domain: reducer (born in backlog; `focus`; close/reopen fold; fold-on-republish
keeps backlog), validator (reserved id), `statesWithBacklog`/`transitionsWithBacklog`.
Engine: the four refusals with rule ids and reasons verbatim; Start and
Send-to-backlog pass; terminal → backlog refused as `illegal-transition`;
parent-terminal still counts a backlog child as open. Server: migration
up/down; board excludes both and produces no straggler; list includes with
`closed`; my-work/attention skip closed; compile-filter `closed`. app-core:
`transitionOptions` offers the universal edges; predicates honour `closed`;
`toServerFilterSpec` sends it. UI: Backlog tab renders only backlog rows and
Start submits the right event; Close on a terminal card; sheet Close/Reopen
and the disabled Move; New ticket's start rules; Filters sheet's Closed
control; Calendar/Timeline default hide with the chip. Second wave:
`rankBetween` (between, before-first, after-last, dense neighbours), the
`rank-requires-backlog` refusal, list ordering with NULLS LAST, row drag and
the keyboard buttons, the sweep's selection query (terminal ≥ N days, not
closed, `reopened_at` skip) against a seeded clock, the system actor's
name, the confirm dialog's per-ticket refusal list, the List's
enabled-only-when-all-terminal rule. Every guard by mutation;
`Features.md`/`test-cases/` per task; Node 22.

## 11. Files (by package)

- `packages/domain`: `workflow.ts`, `validate-workflow.ts`, `entity-state.ts`,
  `events/ticket-events.ts`, `vocabulary.ts`, `ticket-state.ts`, `filter-spec.ts`,
  `read-models.ts`.
- `packages/rule-engine`: `refusal-rules.ts`, `evaluate.ts`, `transition.ts`,
  new `close.ts`.
- `apps/server`: the migration, `projection/*` writer, `read/ticket-cards.ts`,
  `read/compile-filter.ts`, `routes/board.ts`, `routes/list.ts`,
  `routes/my-work.ts`, `routes/attention.ts`, `sync-routes.ts` backfill list.
- `packages/app-core`: `view-types.ts`, `filter/*`, `online/mappers.ts`,
  `precheck.ts`, `flows/guarded-child-event.ts`, `views/transition-dialog.ts`
  (`transitionOptions`), `views/board.tsx` (Close on terminal cards),
  `views/ticket-sheet.tsx`, `views/new-ticket-dialog.tsx`, `views/ticket-list.tsx`
  (Closed chip, Start button slot), `replica/replica-data-source.ts`.
- `apps/web`: `page.tsx` (fifth tab, Backlog view, Closed control, State
  options from defs, Calendar/Timeline default hide), `board-search-scope.ts`
  (Closed chip).
- Second wave (§8): `packages/domain` — `rank.ts` (`rankBetween`, the key
  alphabet), `events/ticket-events.ts` (`ticket.ranked`), `entity-state.ts`
  (`rank`, `reopenedAt`), `events/workspace-settings.ts` (`autoCloseAfterDays`),
  `actors.ts` (`SYSTEM_ACTOR_AUTO_CLOSE`); `packages/rule-engine` — `rank.ts`
  refusal; `apps/server` — a second migration (`rank`, `reopened_at`),
  `routes/list.ts` ordering, `ops/auto-close-sweep.ts` + its registration in
  `ops/backup-daemon-main.ts`, the settings route's new key;
  `packages/app-core` — `views/backlog-list.tsx` (rows, drag, Move up/down),
  `views/close-many-dialog.tsx` (shared by the column header and the List),
  `views/board.tsx` (Close all on terminal column headers),
  `views/ticket-list.tsx` (row checkboxes, Close selected); `apps/web` —
  the Settings page's auto-close control.

## Amendments during execution (2026-09-17)

Rulings 1–30 belong to earlier, unrelated plans (`board-prototype-port`,
`filter-exclude-all-tabs`) and are recorded in their own specs. This
section starts from this plan's own controller rulings — the unnumbered
Task 1/3/4/6 ones, then the numbered series a same-day coordinator picked
up starting at 31 (30 was the prior plan's own last number). Eight body
sentences are rewritten above, each marked "(amended 2026-09-17, see
Amendments)": §2's hierarchy-reopen-offer paragraph (Ruling 39), §5.1's
Start description (Ruling 41 — the brief's own dispatch text called this
"§5.4", but the sentence it struck actually lives in §5.1, verified by
re-reading the spec rather than trusting the section number), §5.3's
Close/Reopen bullets and dismiss-control bullet (Rulings 31–34), §5.4's
"checked by default" sentence (Ruling 40), §5.5's Calendar/Timeline bullet
(Ruling 44), §1.2/§6's replica-backfill-list sentences (Ruling 5 itself
— found stale by the final whole-branch review's Finding 6, 2026-09-17: the
appendix's own "five rewritten" count had missed that its OWN Ruling 5 was
one of the sentences requiring a body rewrite, not only an additive
amendment), §1.3/§5.4's creation-path sentences naming MCP as a second
producer (Ruling 51, Finding 4, final whole-branch review fix wave B,
2026-09-17), and §2.4's new closed-⇒-terminal-across-migrations paragraph
(Ruling 53, Finding 5, same review, same wave; extended for a fourth gate
by Ruling 56, Finding N1 of the opus re-review, round 2, same day — still
the one paragraph, so the count of rewritten sentences is unchanged by the
extension). Every other ruling here is additive and did not require a body
rewrite.

1. **Wildcard edges never resolve FROM backlog (Task 1 ruling).** §1.1's
   `universalTransitions` gives every workflow `backlog → def.initialStateId`
   (Start) with no rules — but a bare `* → X` wildcard, if allowed to
   resolve from backlog too, would let a parked ticket jump past Start
   straight to any wildcard-reachable state (e.g. Done), which is not what
   "parking" is supposed to mean. Resolution: backlog's only legal exit is
   the universal Start edge; a wildcard edge is skipped when the resolved
   `fromStateId` is `'backlog'`. Why: an author who wants "from anywhere
   including backlog" cannot express it under this rule — accepted, because
   that is what Start exists for. Where it lives: the engine's own
   resolution (`packages/rule-engine/src/transition.ts:117-121`, a ternary
   that special-cases backlog before falling through to the ordinary
   `find(exact) ?? find('*')`) and the client's mirror
   (`packages/app-core/src/views/transition-dialog.tsx:66-76`,
   `transitionOptions`'s `fromStateId === BACKLOG_STATE_ID` branch).

2. **The Closed control's tri-state labels read oddly in English, kept for
   consistency (pre-flight ruling, before Task 11).** `TriStateChoice`'s
   three states are always spelled "<label>" / "<label>, included" /
   "<label>, excluded", which makes the Closed control's accessible names
   "Closed" / "Closed, included" / "Closed, excluded" — an odd way to say
   "closed only" / "closed hidden". Resolution: accept the odd phrasing for
   consistency with every other control in the sheet; the strip's chips
   carry the plain words instead (`Closed: only` / `Closed: hidden`). Why:
   inventing a one-off wording convention for a single control is a larger
   cost than one screen-reader phrase. Cost if wrong: a follow-on label
   tweak. Where it lives: `apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx`'s
   `TriStateChoice` call for the Closed control; the chip text in
   `apps/web/src/board-search-scope.ts`.

3. **A rebind into backlog is refused, and stays refused (Task 3 ruling).**
   `workflow-rebind.ts:106`'s `target.states.some(...)` does not know about
   the universal backlog state, so rebinding a ticket onto a target
   workflow with `toStateId: 'backlog'` refuses `reboundUnknownStateRefusal`
   like any other undeclared state. Resolution: leave it refused — a rebind
   is defined as landing a ticket in a DECLARED state of the target
   workflow; parking it is a separate Send-to-backlog move afterward, not
   something a rebind should do in one step. Cost if wrong: one extra move
   for a rare operation. Where it lives:
   `packages/rule-engine/src/checks/workflow-rebind.ts:106` (unchanged by
   this plan; named as a follow-on in §9).

4. **Fixture-suite entries for the four new refusals are a follow-on, not
   this plan's scope (Task 3 ruling).** `Features.md`'s "Planted-defect
   fixture suite" bullet claimed "one per refusal path"; the four new
   refusal ids (`close-requires-terminal`, `already-closed`, `not-closed`,
   `closed-ticket`) have no such fixture. Resolution: park it as a named
   follow-on rather than build it inside this plan; the bullet is hedged in
   the same commit as this appendix. Cost if wrong: the conformance suite
   under-describes four refusals until the follow-on lands. Where it lives:
   `Features.md`'s fixture-suite bullet (hedged this task);
   `packages/rule-engine/fixtures/` (unchanged).

5. **`BOOTSTRAP_BACKFILL_TYPES` is NOT extended with the two closed-flag
   events (Task 4 ruling).** §1.2 folds `ticket.closed`/`ticket.reopened`
   into `TicketState.closed` the same way every other head-state event
   folds; unlike `comment.added`/`attachment.added`, they carry no content a
   replica needs verbatim beyond the fold, so backfilling them a second time
   would be redundant. `ADMIN_ONLY_TYPES` is likewise unchanged — closing a
   ticket is a member's business, not an admin-gated one. Where it lives:
   `apps/server/src/sync/sync-routes.ts:69` (`BOOTSTRAP_BACKFILL_TYPES`,
   unchanged by this task); the docblock's fold-count arithmetic corrected
   from "TEN of the THIRTEEN" to "twelve of fifteen"
   (`apps/server/src/sync/sync-routes.ts:31-32`).

6. **The board's drop-refusal copy never names Backlog as an alternative
   (Task 6 ruling).** `transitionOptions` now offers the universal Start and
   Send-to-backlog edges alongside declared ones, so a naive refusal message
   built off `moveOutcome.refused.available` could suggest "try Doing or
   Backlog" for a board drop — but Backlog is not a board column a drop can
   land on. Resolution: the board's own refusal copy filters `backlog` out
   of the alternatives it names before rendering; `moveOutcome` itself is
   unchanged (shared with the sheet and dialog, where Backlog IS a valid
   alternative). Cost if wrong: none functional, only a confusing sentence.
   Where it lives: `packages/app-core/src/views/board.tsx:813`
   (`const onBoard = available.filter((stateId) => stateId !== BACKLOG_STATE_ID)`).

7. **Ruling 31 — the sheet's dismiss control gets its own accessible
   name.** Finding 1 of Task 7's review: the sheet's dismiss glyph shared
   `aria-label="Close"` with the business **Close** button, two
   same-named buttons in one dialog. Fixed in the shared component:
   `aria-label="Close sheet"`, keeping the "Close" verb HIG expects for a
   dismiss glyph while making the two distinguishable by ear and by
   exact-name query. Blast radius measured: only the one component and its
   own test name it; no catalogue citation landed on the old line. Cost if
   wrong: one string. Now in the spec body (§5.3). Where it lives:
   `packages/ui/src/components/sheet.tsx:28`.

8. **Ruling 32 — Close/Reopen get a double-submit latch.** Finding 2:
   neither button disabled itself while its own ingest was in flight,
   unlike the board's arrows. Fixed by mirroring the board's `submitting`
   idiom, reset in `finally`. Move… was left alone — it opens a dialog with
   its own submit, not a direct-fire button. Now in the spec body (§5.3).
   Where it lives: `packages/app-core/src/views/ticket-sheet.tsx:195`
   (`submitting` state), `:370`/`:411` (set/reset), `:468`/`:473`
   (`disabled={submitting}` on Close/Reopen).

9. **Ruling 33 — a rejected or silent ingest gets its own transport slot,
   never worded as the server's verdict.** A transport failure (a rejected
   promise, or an ingest that answered `[]`) was, before this ruling,
   uncaught by `closeOrReopen` and would have rendered (if rendered at all)
   as `Refused by the server — ingest-rejected: <message>` — a transport
   problem captioned as the server's own answer, which Ruling 27 (an
   earlier plan's board ruling, case 13.504) already forbade doing on the
   board. Fixed with a `transportError` slot, the board's copy shape ("We
   could not reach the server for this change — <message>" /
   "The server did not answer this change."), cleared on any real answer.
   Now in the spec body (§5.3). Where it lives:
   `packages/app-core/src/views/ticket-sheet.tsx:184` (state),
   `:381`, `:405` (routing), `:529-531` (render).

10. **Ruling 34 — the silence branch also clears the server-refusal
    slot.** A gap in Ruling 33's own text: a refused answer followed by a
    silent one left BOTH notices showing. Fixed so the silence branch
    clears `serverRefusal` too, not only sets `transportError`. Now in the
    spec body (§5.3, "either slot clears on the next real answer"). Where
    it lives: `packages/app-core/src/views/ticket-sheet.tsx` (the silence
    branch of `closeOrReopen`, beside `:381`).

11. **Ruling 35 — a brief-anchor correction, not a design change.** The
    Task 8 brief's anchor ("`BoardGroupSection` passes `column.category`")
    was wrong: `MoveArrows` derives the category itself, via
    `stateCategoryOf(workflow, fromStateId)` from `@gisik-nokma/domain`, off
    props (`workflow`, `fromStateId`) `Board`'s own `arrows` render-prop
    already supplies. No prop threading needed. Cost if wrong: one helper
    call. Where it lives: `packages/app-core/src/views/board.tsx:574-582`
    (the `arrows` render-prop call site, unchanged in shape by this
    correction).

12. **Ruling 36 — `submitDirect`'s silence branch mirrors the sheet's
    Ruling 34 clear, and the redundancy is stated honestly rather than
    claimed as a live discriminator.** The implementer measured, with
    `cp`/`sha256sum`-restored mutations, that the arrow path's OWN call
    site (`attemptMove`) already clears `serverRefusal` unconditionally
    before every attempt, so this added clear is REDUNDANT there — kept
    anyway for parity with `closeCard`, where the identical line IS
    load-bearing. Case 13.590a's catalogue entry states the measured
    redundancy rather than a mutation-witness claim it would not survive.
    Where it lives: `packages/app-core/src/views/board.tsx:1090` (the
    `submitDirect` silence-branch clear).

13. **Ruling 37 — the parent event and the reopening transition are ONE
    ingest call, the child is a SEPARATE second call.** The brief's "all
    three events in one batch" conflicted with both §2.3's own wording and
    `reopenAndProceed`'s two-call shape (whose `child-refused-after-reopen`
    outcome depends on the child being separate). Resolution follows the
    spec: when the parent is closed, the parent call is ONE
    `source.ingest([ticket.reopened, ticket.transitioned])`; the child stays
    a second, separate call. Cost if wrong: one array. Where it lives:
    `packages/app-core/src/flows/guarded-child-event.ts:268` (`const batch
    = plan.parentClosed ? [...] : [...]`).

14. **Ruling 38 — a test-file-location correction, not a design change.**
    The brief named a `create-ticket-flow.test.tsx` that does not exist;
    `CreateTicketFlow` is tested in `reopen-flow.test.tsx` and
    `reopenAndProceed` in `guarded-child-event.test.ts`. Where it lives:
    `packages/app-core/test/views/reopen-flow.test.tsx`,
    `packages/app-core/test/flows/guarded-child-event.test.ts`.

15. **Ruling 39 — `parentReopened` discloses a partial commit.** Now in
    the spec body (§2.3). Where it lives:
    `packages/app-core/src/flows/guarded-child-event.ts:154` (the field),
    `:288-306` (set from the batch's first result),
    `packages/app-core/src/views/create-ticket-flow.tsx:288` (the retry
    branch that sends the transition alone when true).

16. **Ruling 40 — choosing a parent resets "Start in focus" to checked.**
    "Checked by default" is per CHOSEN parent, not per dialog session: if
    the person unticks it under parent A, then picks a different in-focus
    parent B, the box is checked again for B. §5.4's bare "checked by
    default" would otherwise read as a one-time default for the whole
    dialog session, which is not the shipped behaviour — now amended in
    the body too. Cost if wrong: one setter call. Where it lives:
    `packages/app-core/src/views/new-ticket-dialog.tsx:202`
    (`setStartInFocus(true)` on parent change).

17. **Ruling 41 — Start submits directly; no dialog exists for it.**
    Now in the spec body (§5.1) — this is the ruling the brief's own
    dispatch mislabeled as amending "§5.4"; the sentence it struck ("a
    gated initial edge still asks") actually lived in §5.1 (the Backlog
    tab), not §5.4 (New ticket), and is corrected there rather than
    perpetuating the wrong section number. Where it lives:
    `apps/web/src/backlog-start-button.tsx` (the whole component — no
    `TransitionDialog` mount, no `MoveArrows` extraction).

18. **Ruling 42 (and its amendment) — how `startTargetFor` actually
    resolves a row's Start destination.** `ListRow` carries no `workflowId`
    (`view-types.ts:187-231` — `typeId`/`stateId` only), so
    `startTargetFor(row, types, defs)` joins `row.typeId` through the
    workspace's `TicketTypeDef[]` to a `workflowId`, then reads that
    workflow's `initialStateId` from a `Map<string, WorkflowDef>` the page
    fetches ONE `getWorkflowDef` per DISTINCT workflow among the backlog
    rows on screen — never one fetch per row. A row whose target is not yet
    known renders Start disabled. Where it lives:
    `apps/web/src/backlog-start.ts:34` (`startTargetFor`).

19. **Ruling 43 — the signed-out gates on the board's `moves` and the
    Backlog tab's `rowAction` are untested, on both sides of this plan.**
    Parked as a single follow-on (one case can cover both) rather than two.
    Named in §9. Where it lives: `packages/app-core/src/views/board.tsx:94`
    (`moves?: BoardMoveCapability`), `apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx:1810`
    (`rowAction` supplied only when `session.kind === 'signed-in'`).

20. **Ruling 44 — Calendar/Timeline's closed-hide default gets a
    page-level override, closing a real spec gap.** Now in the spec body
    (§5.5) — the original text made the sheet's "All" setting unable to
    ever show a closed ticket on these two tabs. Where it lives:
    `apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx` (`showClosedOnDates`
    state and the `filter.closed ?? (showClosedOnDates ? undefined : false)`
    clause feeding `dateInputs`).

21. **Ruling 45 — State options add ONE constant entry, not a second def
    fetch.** The brief's "via `getWorkflowDef`" was dropped as
    equivalent-but-larger: the board's own columns already are the defs'
    declared states, so the Filters sheet's State options are those columns
    PLUS the universal `BACKLOG_STATE` (`{id: BACKLOG_STATE_ID, name:
    'Backlog'}`) — a constant, not a fetch. Cost if wrong: one entry. Where
    it lives: `apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx:832`
    (`names.set(BACKLOG_STATE_ID, BACKLOG_STATE.name)`, `boardStateNames`).

22. **Ruling 46 — an explicit "Closed only" filter on the Board tab gets
    a disclosure, matching the propagation argument already accepted for
    `FILTERS_SHEET_CLEARABLE_AXES`.** The board silently excludes closed
    rows regardless of the filter, so an explicit `closed: true` narrowed
    to nothing with no on-screen explanation. Fixed by pushing `'closed'`
    onto `describeUnappliedBoardAxes`'s result when `filter.closed ===
    true` (only `true` is unapplied; `false` is vacuous on a board that
    already excludes closed rows). Cost if wrong: one string. Where it
    lives: `apps/web/src/board-search-scope.ts:66`
    (`if (filter.closed === true) axes.push('closed');`).

23. **No separate worktree (pre-flight ledger ruling, before Task 1).**
    "No separate worktree — same as the previous plan": the plan's Global
    Constraints name this branch and checkout specifically because the
    owner reviews live on port 3001, and subagents never start their own
    `next dev`. Every task in this plan ran in the primary checkout,
    `owner/workspace-edits`, rather than an isolated worktree. Cost if
    wrong: an edit collision — recoverable, since nothing here is
    destructive, but not free. Where it lives: this is a process decision,
    not a code one — no file:line; recorded in
    `.superpowers/sdd/2026-09-17-backlog-and-closed-core/progress.md:6`.

24. **Every commit carries exactly one correct trailer (recurring ledger
    check, Tasks 1–5).** Each implementer/reviewer dispatch's commits were
    checked by the controller for a single, correct `Co-Authored-By` line
    naming the subagent's own model — never a missing trailer, a stray
    duplicate, or one naming the wrong model — via `git log -1
    --format=%B` on the commit in question. Recorded in the ledger as "⚠️
    trailer present (controller checked: 1 Co-Authored-By line)" (Tasks 1,
    2, 4) and "⚠️ trailers present (2/2, controller checked)" (Task 5's two
    commits); Task 3 the same. Later tasks continued the same check without
    re-stating it every time. Not a design ruling; recorded here because
    the brief asks for every ledger item, and this is one of the two
    recurring non-numbered ones with no natural home elsewhere.

25. **Amendment — Ruling 51 (Finding 4, final whole-branch review, fix wave
    B, 2026-09-17): MCP names a second creation path, and defaults it to
    backlog.** `create_ticket` (`packages/mcp-server/src/tools/write-tools.ts`)
    is a second production producer of `ticket.created` beside the web
    dialog (§5.4's own list), and it sent no `start` at all — the additive-
    field rule then read that silence as focus, so an assistant-created
    ticket landed on the board instead of the backlog every other creation
    path defaults to. Resolution: the tool's input schema gains an optional
    `start: 'backlog' | 'focus'`, and the payload it sends is `start: a.start
    ?? 'backlog'` — an explicit key on the wire either way, never an absent
    one. §1.3 and §5.4 are amended in place to name MCP as this second path.
    Cost if wrong: a client that relied on the old silent-focus behaviour
    would need to pass `start: 'focus'` explicitly — none exists (checked:
    the dev seeds under `apps/server/src/seed/*` are not a production path
    and are deliberately left unchanged; they populate boards on purpose).
    Where it lives: `packages/mcp-server/src/tools/write-tools.ts`, case
    13.607.

26. **Amendment — Ruling 52 (Finding 2, same review, same wave): a parked
    ticket carries as parked through a bulk migration; Amendment 3 still
    stands for everything else.** Two half-fixes, one owner ruling: (a) the
    bulk rebind route's occupied-state check
    (`apps/server/src/routes/builder-reads.ts`) treats a `backlog` row as
    implicitly mapped to the universal Backlog state regardless of the
    caller's `stateMap` — which cannot express a backlog destination at all,
    since it is built from the source workflow's own DECLARED states (spec
    §1.1) — so a type holding even one parked ticket is no longer an
    unconditional `migration.unmapped-state` with no map able to answer it.
    (b) `checkTicketWorkflowRebound`
    (`packages/rule-engine/src/checks/workflow-rebind.ts:106`) accepts
    `toStateId: 'backlog'` when, and only when, the ticket's OWN current
    `stateId` is already `'backlog'` — parked-to-parked, never a declared
    state rebinding INTO backlog. Amendment 3's rule — "a rebind is defined
    as landing a ticket in a DECLARED state of the target workflow; parking
    it is a separate Send-to-backlog move afterward" — is UNCHANGED for a
    ticket that is not already parked; this is a narrow carve-out for the one
    case Amendment 3 could not have anticipated (that this same plan makes
    backlog the birth state of nearly every ticket, so "a type in use" and "a
    type with a parked ticket" became close to the same set). `stateCategoryOf`
    is backlog-aware (`statesWithBacklog`), so the reducer's existing
    `ticket.workflow_rebound` fold needed no change to hand a backlog target
    the category `open` it already gives every other backlog-resident ticket.
    Cost if wrong: none identified — the dialog itself is unchanged, so this
    only ever fires through the route or a hand-built event. Where it lives:
    `apps/server/src/routes/builder-reads.ts`,
    `packages/rule-engine/src/checks/workflow-rebind.ts:106`, cases 13.605
    (engine), 13.606 (server).

27. **Amendment — Ruling 53(i–iii) (Finding 5, same review, same wave):
    closed ⇒ terminal is enforced at every path that can move a ticket
    across workflows or workflow versions, not only at close/reopen.** Three
    gates, one invariant, spec §2.4 states it in full: (i)
    `checkTicketWorkflowRebound` refuses a closed ticket whose target
    state's category is not terminal (`REFUSAL_RULES.closedTicket`); (ii) the
    bulk rebind route's own pre-flight refuses the whole migration before any
    event is built when a closed row's mapped target is non-terminal
    (`migration.closed-to-non-terminal`); (iii) `workflow.defined`'s
    republish check refuses a `stateMapping` that sends a dropped TERMINAL
    state to a non-terminal survivor. All three were needed because
    `foldTicketToWorkflowVersion` and the rebind fold both spread `...state`,
    carrying a closed ticket's `closed` claim across a `stateId` change
    neither `ticket.closed` nor `ticket.reopened` ever gates. The sheet's own
    docblock claim that "closed never survives a fold that also changes
    `stateId`" was already corrected to the true, smaller claim in fix wave A
    (Ruling 53(iv)); this wave supplies the invariant that claim pointed at.
    Cost if wrong: a closed ticket could surface as "active" or "open" on a
    board/list/my-work read while still carrying its close claim — silently,
    since nothing crashes and every existing engine check stays
    self-consistent on its own terms. Where it lives:
    `packages/rule-engine/src/checks/workflow-rebind.ts`,
    `apps/server/src/routes/builder-reads.ts`,
    `packages/rule-engine/src/workflow-defined.ts`, cases 13.608 (i), 13.609
    (ii), 13.610 (iii).

28. **Amendment — Ruling 56(a) (Finding N1 of the opus re-review, final fix
    wave round 2, 2026-09-17): a FOURTH door into the same breach — a
    surviving state's category demoted out of terminal, owing no
    `stateMapping` entry at all.** Item 27's "three gates" was true at the
    time it was written and is not true after this ruling: `workflow.defined`
    gains a second, independent check beside 53(iii)'s — for every state
    present in BOTH `latest.states` and `payload.states` (never dropped),
    if its category in `latest` is `terminal` and in `payload` is not,
    refuse. The rule id is `REFUSAL_RULES.workflowStateMapping`, the SAME
    id 53(iii) uses, not `workflowStructure` — chosen because
    `workflowStructure` refusals come from `validateWorkflowDef(payload)`
    alone, which never looks at `latest` and so could never name a "before"
    to compare against, while this check (like 53(iii)) is inherently a
    two-version comparison over the identical invariant; one rule id for
    "this republish breaks closed ⇒ terminal", whether the break came from
    a drop-and-mis-map or a keep-and-demote, costs every existing consumer
    of `workflow-state-mapping` nothing to also handle this. Cost if wrong,
    named because it is BROADER than 53(iii)'s: this gate fires on every
    terminal→non-terminal demotion of a surviving state in any workflow,
    occupied or not, where 53(iii) fires only on a drop paired with a
    non-terminal remap. An author who wants to demote a terminal state must
    instead drop it, map it terminal→terminal, and move tickets by hand
    afterward. Where it lives: `packages/rule-engine/src/workflow-defined.ts`,
    beside the 53(iii) loop; case **13.611** (new fixture `wf_two_terminal`'s
    `done` kept but demoted to active, refused; kept and unchanged,
    accepted).

29. **Amendment — Ruling 56(b) (Finding N2 of the opus re-review, same
    wave): a `stateMap` KEY of `backlog` is refused, not silently
    overridden.** The bulk rebind route already refuses `backlog` named as
    a stateMap VALUE (`migration.unknown-target-state`, since backlog is
    never in `target.states`); naming it as a KEY was the unrefused mirror
    — the dialog can never send one (`stateMap` is built from
    `fromWorkflow.states` only), but a hand-built request could, and
    `toStateIdFor` silently ignored it (a parked row always resolves to
    `BACKLOG_STATE_ID` regardless of what the map names for it, Ruling
    52(a)). New rule `migration.backlog-not-mappable`, answered right after
    `stateMap` is built — before any workspace lookup, since the question
    needs nothing but the caller's own body. Where it lives:
    `apps/server/src/routes/builder-reads.ts`; case **13.612**.

### Follow-ons named during execution

Named here and cross-referenced from §9 rather than duplicated into its
list: each is a real, scoped gap this plan found and chose not to close,
with the file:line it would touch.

- **`scripts/check-case-citations.mjs` needs letter-suffix support.** It
  folds a suffixed id (`13.556a`, `13.588a/b/c`, `13.591a-g`, `13.593a-e`,
  …) into its base id before computing the uncited set, so a suffixed case
  with no citation of its own is invisible to the ratchet. `check-case-ids.mjs`
  already handles suffixes; this script does not. Task 12's own hand check
  (grepping every suffixed id in file 13 against `packages/*/test`/`apps/*/test`)
  substitutes for the automated ratchet until this lands.
- **`submitFromDialog` treats an empty results array as committed.**
  `results.find((result) => result.status !== 'committed') === undefined`
  is also true for `results.length === 0` (an ingest that answered `[]`,
  i.e. silence) — silence-as-success on the dialog path, the 13.505-shaped
  gap the board's own `submitDirect`/`attemptMove` paths and the sheet's
  `closeOrReopen` already close. Where it lives:
  `packages/app-core/src/views/board.tsx:1390`.
- **Rebind INTO backlog is refused, not redirected** — Amendment 3 above.
  `packages/rule-engine/src/checks/workflow-rebind.ts:106`.
- **Fixture-suite entries for the four new refusal ids** — Amendment 4
  above. `packages/rule-engine/fixtures/`.
- **The signed-out gates on the board's `moves` and the Backlog tab's
  `rowAction` are both untested** — Amendment 19 (Ruling 43) above. One
  case can cover both once the page's session fixture grows a signed-out
  branch. `packages/app-core/src/views/board.tsx:94`,
  `apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx:1810`.
- **The sheet's `submitTransition` has an unhandled rejected-ingest
  path, now that a transport slot exists to catch it.** Ruling 33 gave
  `closeOrReopen` a `transportError` slot for a rejected or silent
  promise; `submitTransition` (the Move… dialog's own submit path) has the
  identical shape of gap, pre-existing and noted in its own docblock, but
  was out of this plan's scope. Where it lives:
  `packages/app-core/src/views/ticket-sheet.tsx:279` (`submitTransition`).
- **"Not applied on the board: closed." is not tested end-to-end.** The
  board strip's sentence for an explicit Closed-only filter (Ruling 46)
  is unit-tested at `describeUnappliedBoardAxes`
  (`apps/web/test/board-search-scope.test.ts`, case 13.602) but has no
  page-level sibling the way `13.440`/`13.451` cover the search-box and
  collaborator axes — `board-narrowing.test.tsx` has no such sibling
  today; the real one, if built, belongs in `filters-sheet.test.tsx`
  beside 13.451's shape.
- **13.588a's mutation witness discriminates only the COMMITTED path.**
  The re-reviewer measured that a reset placed after the `await` on
  success alone would also pass 13.588a; the REJECTED-ingest path is what
  13.588b/c actually discriminate, added in the same task's later fix
  rounds. Recorded so a future reader does not treat 13.588a alone as
  proof of the `finally` placement. `packages/app-core/test/views/ticket-sheet.test.tsx`.
- **`ListRow.closed` carries `actorId` only, so the List's Closed chip
  names the closer by id** (Finding 8, final whole-branch review,
  2026-09-17); the fix is in `apps/server/src/read/list-cards.ts` (resolve
  `closed_by` through the same actor-name path `stateProvenance` uses)
  plus the wire type and `mapClosed` — Ruling 55.

## Amendments during execution — second wave (2026-09-18)

Rulings 1–55 above belong to earlier, unrelated plans. This section starts from the
second-wave plan's own five (its `Global Constraints` names them R1–R5), then records
every ruling made during the wave's execution. **One body sentence is rewritten in
place**: §8.1's Server bullet, marked "(amended 2026-09-18, see Amendments — R1)".

**R1 — the list route does NOT order by rank, and §8.1 said it did.** §8.1's own
Server bullet claimed the list route orders rows with
`rank ASC NULLS LAST, ticket_id ASC`. That ORDER BY would break the route's keyset
cursor — `WHERE t.ticket_id > $cursor` (`apps/server/src/routes/list.ts:143-144`)
with `ORDER BY t.ticket_id` (`:153`) — and the client already assembles the whole
list by looping that cursor (Ruling P41). The deviation is therefore taken on the
CLIENT side: the server carries `rank` on every list row and every ticket read, and
the **Backlog tab** sorts by it. Unranked tickets sort after ranked ones, then by
`ticketId` ascending.

**R2 — ranking neighbours come from the rank-sorted FLAT order, not the displayed
nesting.** The Backlog tab's rank order is the source of truth; `nestRows` may draw a
backlog child under its backlog parent regardless of rank, and the rank still changes
as asked. Grouping and nesting are display-only.

**R3 — auto-close needs no permission door.** The Start edge is ungated (Ruling 41),
so the sweep's `ticket.closed` is ungated too: the daemon writes through `ingestBatch`
with `door: null` and a server origin, which is how seeds and invite acceptance
already write. The engine's own refusals still apply, and the ledger still records who
closed what.

**R4 — the `Dialog` dismiss control is renamed.** `aria-label="Close"` →
`aria-label="Close dialog"` (`packages/ui/src/components/dialog.tsx:51`). A bulk-close
dialog whose confirm reads `Close N tickets` must not share an accessible name with
its own dismiss glyph — Ruling 31's sibling. The blast radius was MEASURED rather than
grepped, because every other `Dialog` consumer's dismiss name moves with it.

**R5 — the `autoCloseAfterDays` surface is a new `Workspace` tab on `/settings`.**
One form for one event, holding all THREE `workspace.settings_set` knobs
(`staleDays`, `dueSoonDays`, `autoCloseAfterDays`); the first two had no UI before
this. Admin-only, as the event's own gate already enforces
(`apps/server/src/permissions/check-permission.ts:652`). The tab list on `/settings`
is unchanged in COUNT — `ticket-types` and `workflows` were joined by exactly one.

### Rulings recorded during the second wave's execution

- **Creation does NOT write `rank` (executor, conservative default, Task 1).**
  The plan's step text said "creation sets `rank: null`", and following it reddens
  the gate: the dual-client rig compares the client's fold against `rowToTicketState`
  with `toEqual`, and the `rank` column does not exist until Task 3. The field stays
  ABSENT on both sides until the task that owns the column can move them together;
  every reader spells `state.rank ?? null`, so absent and null are the same fact to
  every consumer. Recorded rather than asked, and not fixed by hardcoding `null` into
  the mapper — which would have been the "closed flag dead in production" failure the
  plan's own Global Constraint exists to prevent.
- **The payload door refines with `isRankKey`, not `RANK_KEY_REGEX` (Task 1's second
  deviation).** The plan's schema admits keys — any ending in `0` — that
  `rankBetween` cannot place between their neighbours: on prefix-adjacent neighbours
  (`('a','a0')`) the real function never returns, growing the string until allocation
  aborts. `ticketRankedPayload` therefore refines with `isRankKey`; no signature in
  the plan's Interfaces block changed, and `RANK_KEY_REGEX` is still the first check
  because its message names the alphabet.
- **Option B on the unranked tail (OWNER RULING, 2026-09-18).** An independent review
  found that moving an unranked row computed its neighbours from rank only, so the
  move landed somewhere the user did not ask for. The defect was **HELD rather than
  shipped** on the controller's instruction that a short hold is cheaper than
  correcting it in a second PR; the owner then ruled **option B** — rank the row
  first, then move it — and it is fixed in the same change (cases `13.711`, `13.712`).
- **Task 7's review ruling: DROP (controller, 2026-09-18).** The reviewer checked the
  two row types separately rather than together, and the ruling was to drop the claim
  rather than the code.
- **A plan-text defect: carry on with `refuseWith` (controller, 2026-09-18).** The
  plan and the shipped code disagreed about how a refusal is spelled; the executor
  filed it rather than settling it unilaterally, and the ruling was to carry on with
  `refuseWith`.
- **The client-door narrowing is CONFIRMED (controller, 2026-09-18).** A conservative
  default taken by the executor — the client door checks less than the server's —
  filed rather than assumed, and confirmed.
- **The migration-ordering ruling (OWNER RULING, 2026-09-18).** Task 7's migration was
  first numbered BELOW one already applied on the owner's dev stack, where
  `node-pg-migrate`'s `checkOrder` refuses it: a migration numbered below an applied
  one can never run, and a fresh database cannot see the problem because it applies
  both in ascending order. `73c40ea3` renamed it above `1789400000000`. The
  incident produced `scripts/check-migration-order.mjs` and its six cases
  (`13.902`–`13.906`), which now refuse that shape in CI.

## Follow-ons named during execution — second wave

Cross-referenced from §9 rather than duplicated into its list: each is a real, scoped
gap this wave found and chose not to close.

- **Per-project `autoCloseAfterDays` override** — §9's own first entry. The setting is
  workspace-scoped today; a project-level override would need a project settings
  surface that does not exist.
- **Ranking under grouping and nesting is DISPLAY-ONLY** — R2 above. The rank order is
  flat; the Backlog tab's nesting can draw a child above a row it ranks below.
- **The Board's `Close all (N)` and the List's `Close selected (N)` share one dialog,
  one batch and one path, but there is NO keyboard shortcut for either.** Two surfaces,
  one component, and no accelerator.
- **`ListRow.closed.actorName` is still the core plan's follow-on, and this wave makes
  it also name `Auto-close` — but only through `actorLabel`.** The auto-close actor is
  reserved in the domain (`SYSTEM_ACTOR_AUTO_CLOSE`), has no `users` row and no
  membership, so the roster join cannot resolve it; the sheet reads `Closed by
  Auto-close on <date>` only because `packages/app-core/src/provenance.ts`'s
  `actorLabel` knows the reserved actors. Any reader that joins the roster for a name
  instead of going through `actorLabel` will render it blank.
- **`isTypes` (reorder, per-type counts) and `isWorkflows` (a badge, a second action)
  are HELD, not outstanding.** `docs/lanes/owner-holds.md` §1 lists both as
  deliberately unbuilt and escalated to the owner. A hold is not a gap, and prose that
  reads them as unbuilt scope is describing a decision, not a debt.
