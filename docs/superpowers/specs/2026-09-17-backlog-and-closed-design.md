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
twelve of fifteen, restated, and the replica backfill list (`sync-routes.ts`)
gains both types — the docblock names that list as the live example of a
reader that must be complete.

### 1.3 Creation

`ticketCreatedPayload` — the schema the ingest DOOR validates new events with
— gains `start: z.enum(['backlog', 'focus'])`, **required**: a client must
say where the ticket starts, and "backlog by default" is the CLIENT's default
(§5.4), refused at the door if omitted rather than silently defaulted. The
reducer reads a lenient sibling, `ticketCreatedPayloadStored` (the same
schema with `start` optional), and falls back to `'focus'` when the field is
absent — because an event written before this change WAS born in focus, and
a replay must reproduce what happened, not what the rule is now. So: new
tickets land in `BACKLOG_STATE` (`stateId: 'backlog'`, `stateCategory: 'open'`)
unless `start === 'focus'`; every ticket that already exists keeps the state
it has, on the live projection AND on a rebuild. No state migration (§3.4).

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

## 3. Server

### 3.1 Projection

Migration `1789000000000_proj-tickets-closed.sql`: `closed_at timestamptz NULL`,
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
the reducer reads a legacy `ticket.created` (no `start`) as `focus` (§1.3).
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
through the same `moveOutcome`/`TransitionDialog` path the arrows use — a
gated initial edge still asks. Empty state: "Nothing in the backlog — new
tickets land here." No ranking, no drag-ordering (§8).

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
  show the server's answer in the sheet's existing refusal slot.
- **Move…** disabled while closed, with the sentence "Closed — reopen it
  first" beside it (not a tooltip).

### 5.4 New ticket

The dialog states "Starts in the backlog" under the title field. The only
creation path in the product is this dialog (there is no create-from-sheet
affordance — checked, not assumed), so the in-focus exception keys on the
PARENT CHOSEN IN THE DIALOG: when the selected parent is in focus
(`stateId !== 'backlog'` AND not closed), a checkbox "Start in focus" appears,
checked by default, and sets `start: 'focus'`; with no parent, or a backlog
or closed parent, there is no checkbox — backlog, always.
`parentCandidates` therefore carry `inFocus: boolean` beside `id`/`title`.

### 5.5 Filters sheet and the other tabs

- A **Closed** tri-state control in the sheet: All / Closed only / Not
  closed, mapping to `closed: undefined | true | false`; strip chip
  "Closed: only" / "Closed: hidden".
- State chips include "Backlog".
- List: closed rows carry a "Closed" chip in the state column. Calendar and
  Timeline: the page passes `closed: false` into their narrowing unless the
  filter sets `closed` explicitly — "hidden by default, filter overrides".
  The strip's count on those two tabs treats the default hide as a narrowing
  (`shown !== total` opens it, with the "Closed: hidden" chip present so the
  person sees why).

## 6. Offline replica

`replica-data-source.ts` applies events through the shared reducer, so the
flag folds for free. Its `getBoard` mirrors §3.2's exclusion; its `getTickets`
rows carry `closed`; its outbox accepts `ticket.closed`/`ticket.reopened`.
The bootstrap backfill list gains the two types (§1.2).

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
- **Server.** `proj_tickets.rank text NULL`; the list route orders rows with
  `rank ASC NULLS LAST, ticket_id ASC`; `ListRow.rank`.
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
