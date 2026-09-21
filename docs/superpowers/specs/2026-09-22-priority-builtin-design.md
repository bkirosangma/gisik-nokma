# Priority is a built-in: every ticket has one, and it starts at P2

**Date:** 2026-09-22
**Branch:** `owner/priority-builtin`
**Owner's words:** "priority should not be a custom field. start date, due
date, these should be first class properties of all tickets." Then, asked
whether a priority can be cleared: "priority is always there. everything
starts at p2 the middle." Value set: P1 / P2 / P3, fixed (the prototype's).
Scope: the domain built-in and the sheet's segmented control, plus a start
date row on the sheet, priority on the new-ticket form, priority in the
list's grouping, column and filter, and a priority badge on board cards.

## What this is

Today `BUILTIN_FIELD_IDS` (`packages/domain/src/ticket-types.ts:8`) is
`title, description, dueDate, startDate`. Start and due date are already
first class: the engine validates them on every ticket whatever its type
declares (`packages/rule-engine/src/checks/fields.ts:140`). Priority is not:
the word appears in zero domain files, so the sheet draws it read-only as a
custom-field convention and prints *No priority claimed* when a type declares
no such field (door G, 2026-09-19; case `16.29` pins the absence).

This change makes `priority` the fifth built-in, with three properties the
other four do not share:

1. **It is always present.** No ticket is ever without a priority. There is no
   never-claimed state and no clearing claim.
2. **It starts at P2.** Creation writes the claim.
3. **Its value set is closed:** `P1`, `P2`, `P3`, ordered P1 first.

It also closes a second gap the ruling names: the sheet never draws
**start date** although it has been a built-in since Plan 3. It gets a row.

## Why creation writes the claim (approach A)

Every field row on the sheet is a VALUE plus WHO claimed it and WHEN
(invariant 4: a value with no claim beside it reads as a property the ticket
has, and nothing is invented). "Always there" therefore cannot be a reader
default, and three ways of making it true were weighed:

- **A. Creation writes the P2 claim (chosen).** `ticket.created` gains an
  optional `priority` member; **absent means P2**, the same rule its `start`
  member already follows (`packages/domain/src/events/ticket-events.ts:56`:
  "absent means focus — that is what every v1 event meant"). The reducer
  writes `fields.priority` on creation exactly as it writes `fields.title`
  unconditionally (`packages/domain/src/ticket-state.ts:160`), so the claim
  carries the creator's id and both clocks. A ticket nobody ever prioritised
  reads *P2 — set by Kiro on 3 Sep 2026*, and that is true: creating it at the
  default was the claim.
- **B. Readers default to P2 when the claim is absent.** Rejected: four read
  sites to drift (server assembler, replica, sheet, list filter), and the row
  would show a value with no claim line — the exact thing invariant 4 forbids.
- **C. Backfill a `ticket.field_set` per existing ticket under a system
  actor.** Rejected: the product refuses to attribute anything to "system"
  (`actorLabel` never prints it), and it would invent claims.

**Existing tickets** get their P2 claim by **replay**, not migration. The
reducer is the one source of `TicketState` for the server projection
(`apps/server/src/projections/tickets.ts`, rebuilt by
`apps/server/src/projections/rebuild.ts`) and for the offline replica
(`packages/app-core/src/replica/replica-data-source.ts`), so a rebuild of the
tickets projection after deploy, and the replica's next bootstrap, put the
claim on every ticket with its creation event's actor and clocks. No new
table, no new column, no data migration.

## Domain (`packages/domain`)

- `ticket-types.ts`: `BUILTIN_FIELD_IDS` becomes
  `['title', 'description', 'dueDate', 'startDate', 'priority']`. The existing
  refine at `:113` then refuses any ticket type declaring a custom field with
  id `priority` ("shadows a built-in field").
- New, beside `dueDateValueSchema`: `PRIORITIES = ['P1', 'P2', 'P3'] as const`,
  `prioritySchema = z.enum(PRIORITIES)`, `type Priority`, and
  `DEFAULT_PRIORITY: Priority = 'P2'`. The three values have ONE origin; no
  other file spells them.
- `events/ticket-events.ts`: `ticketCreatedPayload` gains
  `priority: prioritySchema.optional()`. The docblock states that absence
  means `DEFAULT_PRIORITY` and why (the `start` precedent). The
  `ticketFieldSetPayload` docblock's built-in list gains `priority`.
- `ticket-state.ts`: the `ticket.created` arm writes
  `fields: { title: claim(p.title, env), priority: claim(p.priority ?? DEFAULT_PRIORITY, env) }`.
  This is the only place a default is applied, and it is applied at REDUCE
  time against the creation event, never at parse (the `required` docblock in
  `ticket-types.ts` explains why a parse-time default would invent a claim on
  every stored event; the same reasoning holds here, and the reducer is where
  the creator's claim is already minted).
- `read-models.ts`: `TicketCard` gains `priority: PriorityClaim`, where
  `PriorityClaim = { value: Priority; actorId; clientTime; serverTime }`.
  Never nullable and never a three-state union: unlike `dueDate`, there is no
  never-claimed or cleared state to represent. The docblock says so.
- `filter-spec.ts`: `filterSpecSchema` gains `priority`, a set of levels
  (absent = all), following the wire convention `stateId` uses so
  `toServerFilterSpec` (`packages/app-core/src/online/mappers.ts:1026`) maps it
  the same way. `GROUPINGS` gains `'priority'`.

## Rule engine (`packages/rule-engine`)

`checks/fields.ts`: a `priority` branch beside the two day-claim built-ins,
before the type is resolved:

- `value === null` → `refuse('field.priority-required')`, a new entry in
  `checks/refusals.ts` worded like `field.title-required`: *A ticket always
  has a priority. Change it instead of clearing it.*
- otherwise `prioritySchema.safeParse(value).success ? ACCEPT :
  refuse('field.type-mismatch', fieldKindRefusal('Priority', 'one of P1, P2 or P3'))`.

The docblock's "the four built-ins" becomes five.

## Server (`apps/server`)

- `read/ticket-cards.ts`: `priorityOf(row)` beside `dueDateOf`, reading
  `row.fields['priority']`. A missing or non-enum claim THROWS with the same
  wording `dueDateOf` uses for an impossible claim ("the door refuses that, so
  this event did not come through it"), because after replay every ticket has
  one; an absence means the projection was not rebuilt, and an assembler that
  filled in P2 would be approach B by the back door.
- `read/compile-filter.ts`: `priority` compiles to
  `(t.fields -> 'priority' ->> 'value') = ANY(...)` or `=`, bound as a
  parameter like every other clause.
- Grouping by priority is client-side like the other groupings; the server
  needs no new endpoint.
- Seeds: `seed-convenience-corner.ts` and `seed-dev-workspace.ts` may set
  `priority` on a few created tickets so a fresh database shows all three
  levels; unset ones become P2 by the default. `cc-map.ts` maps the
  prototype's `pri` field where the snapshot carries one.

## Sync and mappers (`packages/app-core`)

- `online/mappers.ts`: `mapPriority` beside `mapDueDate` at the three card
  sites (`:566`, `:1582`, `:2222`); a card without a valid `priority` is a
  mapper refusal, not a default. `LIST_COLUMN_IDS` (`:303`) gains
  `'priority'`.
- `replica/replica-data-source.ts`: `priorityOf(state)` beside `dueDateOf`
  (`:738`) at both card sites; same throw-not-default rule as the server.
- `view-types.ts`: `ListRow`, the board card row and the My Work row gain
  `priority: { value: Priority; claim: ClaimProvenance }`. `ListColumnId`
  gains `'priority'`; `Grouping` follows `GROUPINGS`.
- `filter/list-filter.ts`: a `priorities` axis with the same narrow/exclude
  treatment `assigneeIds` has (`:35`, `:54`).
- `views/list-model.ts`: `BUILTIN_COLUMN_LABELS.priority = 'Priority'`;
  `groupRows` gains the `priority` partition with sections P1, P2, P3 in that
  order, every row in exactly one (the planted-defect property holds).

## Sheet (`packages/app-core/src/views/ticket-sheet.tsx`)

- **Priority row** becomes the prototype's control
  (`design-system/interactive/desktop.dc.html:1192-1198`): an inline
  three-segment control, the current value emphasised, always drawn. Clicking
  a segment writes `ticket.field_set {fieldId:'priority', value}` through the
  same write path the Due editor uses (`:1546`); clicking the selected segment
  does nothing (there is nothing to clear to). The claim line
  (`set by … on …`) stays under it. The *No priority claimed* branch is
  deleted: a ticket without a claim throws in the assembler before it
  reaches the sheet.
- **Start date row** joins the field rows between Due and Type, a
  `<input type="date">` with the identical behaviour and copy the Due editor
  has, reading through `dateClaimOf(…, 'startDate')`. Its absent copy is
  *No date claimed*, the prototype's own.
- The `fieldId` exclusion at `:3090` keeps `priority` out of the generic
  custom-field rows (it already is) and adds `startDate`.
- The door G docblock (`:1630`–`:1690`) is rewritten: Priority is no longer
  "the unbuilt door". The `16.29` docblock's own request ("so that taking it
  later is a decision rather than a drift") is fulfilled here and the sentence
  is removed.

## New-ticket dialog (`packages/app-core/src/views/new-ticket-dialog.tsx`)

A three-segment control labelled Priority, preselected at `DEFAULT_PRIORITY`,
after the type picker (prototype `:1592-1599`). `NewTicketDraft` gains
`priority: Priority`, and `create-ticket-flow.tsx:241` sends it in the
`ticket.created` payload. The product's client ALWAYS sends it explicitly, as
it does `start`; the absent-means-P2 rule exists for the wire, not for the
product's own client.

## Board card (`packages/app-core/src/views/board.tsx`)

A small badge `P1` / `P2` / `P3` beside the due label, `title` attributed
like the due label's (`:1153`). Classes `gn-board-card__priority` and
`gn-board-card__priority--p1` in `packages/ui/src/ui.css` beside `:1164`; P1
takes `var(--gn-danger)` in the same weight `--late` uses, P2 and P3 the muted
tone. P2 is the default, so a P2 badge is drawn (the value is a fact on every
card) but not emphasised.

## Copy, help and catalogue

- `history-copy.ts`'s `describeEvent` already narrates `field_set` by field
  id; the sentence for `priority` reads *Set priority to P1*. The
  `ticket.created` sentence does not mention the default.
- The help corpus paragraph that lists Priority among rows "there to read
  rather than to change" (`help/content.generated.ts:1990`) is regenerated
  from its source with Priority moved to the real controls.
- `Features.md` line 431's bullet is rewritten: Priority is a built-in, the
  editors are built, the door G classification is superseded (Type remains the
  read-only one). The new-ticket, list, board and start-date rows are added
  under their sections. Same change set.
- `test-cases/`: `16.29` is amended to assert the segmented control, the
  start-date editor and Type's read-only-ness; `16.23`–`16.30` are re-read.
  New cases land in `03-foundation-ledger.md` (payload, reducer default,
  engine refusals), `13-board-prototype-port.md` (sheet control, start row,
  card badge, new-ticket control), `07-api-realtime-search.md` (filter axis).
  The plan assigns each writer a BLOCK of ids up front.

## Compatibility and risk

- **Stored events.** No stored event changes meaning: a `ticket.created`
  without `priority` meant P2 (every v1 ticket now has one), and every stored
  `ticket.field_set` still parses. `ticketCreatedPayload` is parsed at ingest
  and stores the schema's OUTPUT, so the optional member reaches the ledger
  only when the client sends it — never a defaulted `P2` written into the
  event.
- **Hand-made ticket types with a custom `priority` field** will fail
  `ticketTypeDefSchema.parse` after this change (shadow refusal). The seeds
  declare none. Before merge: read the dev database at 54330 read-only for
  any `ticket-type.defined` payload whose fields include id `priority` and
  report the count. If any exist, the owner decides between renaming that
  field's id in a new definition event and leaving the type unparseable.
- **Deploy order.** The tickets projection must be rebuilt after the new
  reducer ships, or the assembler throws on every card. The rebuild is the
  existing `rebuildProjection`; the plan's last task runs it against the dev
  stack and measures that every `proj_tickets.fields` row carries
  `priority`.
- **Snapshots.** `snapshot-store.ts` says nothing writes snapshots yet, so
  replay is from event 1 and the creation event is always replayed. If
  snapshots ever start being written, a snapshot taken BEFORE this change
  lacks the claim; the assembler's throw is what would surface that.

## Out of scope

- A workspace-configurable priority ladder (rejected in favour of the fixed
  three).
- A free sort control in the list. The list has no sort today (rows are
  grouped, and the backlog is drag-ranked); "sort by priority" is realised as
  the `priority` GROUPING (sections P1, P2, P3), a `priority` column and a
  `priority` filter. A sort key that reorders rows inside a section is a
  separate door, not taken here.
- Notifications on priority changes; `date-approaching` stays `dueDate` only.
- Search indexing of priority.
