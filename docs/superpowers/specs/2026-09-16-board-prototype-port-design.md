# The project board — porting the desktop prototype's design

**Date:** 2026-09-16
**Branch:** `owner/workspace-edits`
**Reference:** `design-system/interactive/desktop.dc.html:314-548` (the `isWork`
block) and `:1367-1417` (the `showFilters` sheet)

## What this is

Make `apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx` and the four views it
mounts — `Board`, `TicketList`, `CalendarView`, `TimelineView` — match the
desktop prototype, **including the behaviour the prototype implies**. The owner's
scope ruling was "everything in the prototype", not a visual port: the search
box, the Filters sheet, the workflow picker, drag-and-drop and the per-card move
arrows are all in scope.

The owner attached a bundled `.dc.html` export. Seven distinctive metric strings
from it were checked against the in-repo copy and all seven are present verbatim,
with a negative control confirming the check can report absence:

| String checked | in-repo hits |
|---|---|
| `min-width:288px;flex:0 0 288px` | 1 |
| `grid-template-columns:230px repeat(8,minmax(0,1fr))` | 2 |
| `min-height:420px` | 1 |
| `border-radius:9px;padding:2px;gap:2px` | 8 |
| `outline:2px dashed var(--warning);outline-offset:2px` | 1 |
| `min-width:820px` | 2 |
| `width:min(380px,100%)` | 1 |
| `min-width:999px;flex:0 0 999px` (negative control) | **0** |

The in-repo copy spells handlers `onClick` where the bundle has
`sc-camel-on-click` — the bundler's attribute transform, the same difference the
`/workspaces` port recorded. Every measurement below cites the in-repo file by
line.

## Rulings received (2026-09-16)

Five decisions were put to the owner before this spec was written. Three of the
five answers were **not** the recommended option, which is recorded because a
run of first-listed answers is the tell for input that was never authored by a
person (see `idle-nudger-answers-askuserquestion`).

**R1 — scope: "everything in the prototype."** Not a visual port. The five
affordances with no product mechanism behind them are to be built.

**R2 — sequencing: "one spec, one plan, phased execution."** One design document
covering all three subsystems (look, narrowing, writes), executed in phases
against a single plan. Not three separate spec→plan→implement cycles.

**R3 — workflow picker: "add *All workflows*, default to it."** The prototype's
picker selects one workflow and draws its states as the columns; the product
renders one group per workflow with every card shown exactly once. The picker
gains an `All workflows` option which is the **default**, so today's guarantee
survives as the resting state and narrowing becomes a choice the person made.

**R4 — calendar legend: "merge — prototype's look, product's control."** The
prototype's legend is a static three-item key. The product's is a *working*
per-field toggle. The merged result takes the prototype's legend-card treatment
and keeps the checkboxes, field names and counts, adding `Due date` and
`In transit` as read-only rows.

**R5 — sync strip: "named absence, with the reason."** Not drawn. See
*Stated divergences*.

## What already matches — do not churn it

- **`Chip` already is the prototype's chip.** The reference draws
  `<span class=chip><span class=dot></span>Label</span>` with a neutral
  `chipBg`/`chipShadow` ground and a per-tone coloured dot. `ui.css:109-158`
  is exactly that, with dots for `open`/`active`/`terminal`/`blocked`/`pending`/
  `restricted`/`contested`. **No new chip token roles are needed.**
- **The list's Group-by and Columns controls exist**
  (`ticket-list.tsx:186-210`), prefs-backed through `Select` and `<details>`,
  with `prefsEditable` disabling them while the preferences document has not
  loaded. The prototype's equivalents are a restyle of these, never a rebuild —
  and the three `list-prefs-origin*` notices that say *which half nobody chose*
  stay on screen.
- **The timeline's undrawn side-list exists** (`gn-timeline__side`), with
  per-reason modifier classes asserted by `timeline-view.test.tsx:396-441`. The
  prototype's "N tickets have no period to draw" footer is this control
  restyled.
- **The calendar's fold control and `emptyCopy`'s three arms** stay. The
  model chooses the sentence and the view renders it verbatim; there is
  deliberately no bare "nothing here" branch and this change adds none.
- **Every read's refusal shape.** `error → ShellRefusal, null → Loading…,
  data → view` is this page's one idiom and all four arms keep it. No `?? []`
  is introduced anywhere in this work.

## Blast radius

**`apps/web` only, and this was measured rather than assumed.**

`apps/desktop/src/main.tsx:6` imports `@gisik-nokma/ui/ui.css`, so `ui.css` edits
do reach desktop. But desktop defines its **own** `TicketList`
(`apps/desktop/src/app.tsx:139`) — a different component of the same name, taking
`{ds, workspaceId}` and rendering unprefixed `ticket-list__*` classes. A grep for
`gn-(board|list|calendar|timeline)[a-z_-]*` across `apps` and `packages`,
excluding `app-core/src` and `ui.css` themselves, returns only:

- `apps/web/app/globals.css:60` — `gn-board-card__provenance`
- the board page's own `gn-list-filter*` (three lines)
- `apps/web/e2e-stack/viewport.spec.ts:203`,
  `apps/web/e2e-viewport/responsive.spec.ts:901`,
  `apps/web/e2e-viewport/type-scale.ts:21` — all `gn-board-card__provenance`
- test files under `apps/web/test` and `packages/app-core/test`

So the board/list/calendar/timeline rules are **inert on desktop and mobile**.
`gn-board-card__provenance` is the one class with consumers outside app-core, and
three of them are viewport specs — any change to it must be checked against those.

The four view components are exported from `packages/app-core/src/index.ts` but
mounted **only** by the board page. Nothing else in the repo imports them.

## The two systems this page gains

### Narrowing is two layers, and the UI must say which

| | Server axis (exists) | Client axis (new) |
|---|---|---|
| Where | `useTicketList`'s `filter` argument | `matchesFilter` over loaded data |
| Vocabulary | `filterSpecSchema` — **scalars** | `FilterSpec` — **lists** |
| Job | relieves the `LIST_PAGE_CAP` walk | narrows what is on screen |
| Reaches the board? | no — `useBoard` takes no filter | yes |

The wire takes exactly one value per id-shaped axis
(`packages/domain/src/filter-spec.ts:119-127`: `assigneeId`, `collaboratorId`,
`typeId`, `stateId`, `stateCategory`, plus scalar `blocked`, `text`, `dueBefore`,
`dueAfter`). `toServerFilterSpec` throws `UnexpressibleFilterError` on a plural
with more than one value. The client vocabulary
(`packages/app-core/src/view-types.ts:142-153`) is plural and
`matchesFilter` (`filter/matches-filter.ts:25-56`) already AND-combines it
locally — and its own docblock says a second declaration "would fork the filter
vocabulary". This change adds no third vocabulary.

**The existing "Only tickets in progress" control stays exactly where it is**, on
the page above the tabs, for the reason its own docblock gives at length: every
renderer of the list lives inside `list.error === null`, so a narrowing control
placed among them is unreachable by the person past the cap who needs it most.
It gains the prototype's chip treatment and nothing else.

**Board cards are not filterable as they stand.** `BoardCard`
(`view-types.ts:106-116`) carries `ticketId`, `title`, `typeId`, `assignee`,
`stateProvenance`, `cause`, `rollup`, `pending` — while `stateId` and `category`
live on the enclosing `BoardColumn`. A pure adapter
`boardCardToFilterState(card, column)` supplies the missing halves so one
vocabulary governs both surfaces. It is pure and exported, so its mapping is
testable without mounting a board.

**The count must not lie.** The prototype's `{shownCount}` reads `N of M shown`.
When the server narrowing is on, `M` is *itself* narrowed — so the strip says so
rather than presenting `M` as the project's total. A bare `N of M` under an
active server narrowing would assert the project holds `M` tickets when it holds
more, which is the `?? []` failure in a different costume.

**Search is client-side, and this is a decision rather than an omission.**
`filterSpecSchema` does carry a `text` axis, so a wire search is expressible. It
is not used, because `useBoard` takes no filter at all: a wire search would
narrow the list and leave the board unnarrowed, and one search box would then
answer differently on two tabs of one page — the exact asymmetry
`calendar-view.tsx`'s docblock forbids for `isEpicType`. Client-side keeps the
two consistent. The cost is stated in *Stated divergences*.

### Writes go through the transition gate, never around it

A state move is not "set column = X". `transitionOptions(def, fromStateId)`
(`views/transition-dialog.tsx:41-61`) yields only edges the workflow **declares**,
resolving exact-before-wildcard the way `rule-engine/src/transition.ts:91-93`
does, and each edge carries `rules` that may demand a comment, an evidence
attachment or field values.

So a drop or an arrow computes a target and then:

1. read `getWorkflowDef(workspaceId, group.workflowId, group.workflowVersion)` —
   the method exists on `DataSource` (`data-source.ts:138`) and `BoardGroup`
   carries both arguments (`view-types.ts:132-137`);
2. **target not among `transitionOptions`** → refuse inline, naming the moves
   that *are* available. Never a silent snap-back, which would tell the person
   their drag failed for no reason;
3. **declared, `rules` empty** → submit `ticket.transitioned` directly. The
   `pending` flag and its `claim in transit` chip already cover the in-flight
   window;
4. **declared, rules non-empty** → open the transition dialog aimed at that
   target, because the dialog needs `ticketFields: Record<string, FieldClaim>`
   and `BoardCard` does not carry them.

**Consequence, and it is visible.** The arrows are *next and previous declared
target*, not *adjacent column*. An arrow is absent where no declared move exists
in that direction. The prototype's arrows walk the column array unconditionally;
against a declared workflow that is not expressible, and an arrow that offered a
move the server then refuses would read as a bug in the product rather than a
rule.

## Metrics

All from the in-repo reference. Values are the prototype's px; the port converts
to the `rem` idiom `ui.css` already uses.

### Page chrome — `:314-352`

| Element | Value |
|---|---|
| Page padding | `0 32px 24px`, column, `gap:14px` |
| Header row top margin | `24px` |
| Breadcrumb | `13px/18px`, `label2` |
| Title | `34px/41px`, `700`, `-0.4px` |
| Search `:322` | `min-height:44px; min-width:200px; padding:0 14px; fieldBg + fieldShadow; 17px` |
| Workflow select `:325` | `min-height:44px; padding:0 12px; ctlBg + ctlShadow; 15px/600` |
| Filters `:330` | `min-height:44px; padding:0 18px; ctlBg + ctlShadow; accent; 600` |
| New ticket `:331` | `min-height:44px; padding:0 18px; accent ground; onColor; 600` |
| Tab rail `:337` | `inline-flex; segBg; radius 9px; padding 2px; gap 2px` |
| Tab | `min-height:40px; padding:0 16px; radius 7px; 15px` |
| Tab, selected | `600` + `segOnBg` + `segOnShadow` |
| Summary line `:341` | `15px/20px`, `label2` |
| Filter strip `:345` | `fill4; radius ctlR; padding 8px 12px; gap 8px` |
| Filter chip | `min-height:32px; padding:0 12px; radius 999px; chipBg + chipShadow; 13px` |

### Board — `:354-399`

| Element | Value |
|---|---|
| Column rail | `flex; gap:14px; align-items:flex-start; overflow-x:auto; padding-bottom:8px` |
| Column | `trayBg + trayShadow; radius cardR; padding 12px; **min-width:288px; flex:0 0 288px**; gap 10px` |
| Column title | `17px/22px`, `600` |
| Blocked chip | `tintDanger` ground, `danger` text, dot, `chipPad`, `13px/18px` |
| Count | `13px/18px`, `label2` |
| Card | `cardBg; radius 12px; padding 14px; cardShadow; cursor:grab` |
| Card, in transit | `outline:2px dashed var(--warning); outline-offset:2px` |
| Card title | `17px/22px`, `600` |
| Meta row | `gap:8px; margin-top:10px; wrap` |
| Avatar | `24px`, `999px`, `fill1`, `12px/600` |
| Meta line | `12px/16px`, `label2` — `danger` when overdue |
| Move button | `min-height:32px; min-width:36px; ctlBg + ctlShadow; accent; 15px/600` |
| Move button, unavailable | `opacity:0.4; cursor:not-allowed` |
| Empty column | `fill4; radius 12px; padding 22px 16px; centred; gap 8px` |
| Empty icon | `34px` circle, `chipBg + chipShadow` |
| Empty copy | `15px/20px`, `label2` |
| Empty action | `min-height:44px; padding:0 16px; ctlBg + ctlShadow; accent` |

### List — `:401-475`

| Element | Value |
|---|---|
| Container | `cardBg + cardShadow; radius cardR; overflow:auto` |
| Table | `border-collapse:collapse; **min-width:820px**` |
| Header cell | `13px/18px; 600; label2; trayBg; padding 11px 16px; nowrap` |
| Group header row | `padding 11px 16px; trayBg + trayShadow` |
| Zebra | odd rows `fill4` |
| Title cell | `padding:12px 16px 12px calc(16px + depth*22px); min-width:260px` |
| Caret | `min-width:22px; min-height:22px` |
| Title button | `17px/22px` |
| Data cell | `padding 12px 16px; 15px; nowrap` |
| Column toggle `:413` | `min-height:36px; padding:0 12px; radius 999px; cardBg + cardShadow; 13px`, 18px tick box |

### Calendar — `:477-504`

| Element | Value |
|---|---|
| Nav button | `min-height:36px; padding:0 12px; ctlBg + ctlShadow; accent` |
| Month title | `20px/25px; 600; min-width:190px; centred` |
| Today | `min-height:36px; padding:0 14px; transparent; accent; 15px/600` |
| Legend | `cardBg + cardShadow; radius ctlR; padding 7px 14px; gap 16px` |
| Legend swatch | `14x9px; radius 3px` |
| Legend label | `12px/16px` |
| Grid | `trayBg + trayShadow; radius cardR; padding 1px; 7 cols; gap 1px; **min-height:420px**` |
| Weekday head | `trayBg; padding 9px 10px; 12px/16px; 600; label2; uppercase; 0.5px` |
| Day cell | `cardBg` in month / `fill4` out; `padding 7px 8px; gap 4px` |
| Day number | `13px/18px; 600` |
| Today ring `:495` | `24px` circle, `accent` ground, `onColor` |
| Event pill | `radius 6px; padding 2px 7px; 12px/16px; accent ground; onColor` |
| Event, custom field | `tintPurple` ground, `purple` text |

### Timeline — `:506-538`

| Element | Value |
|---|---|
| Header grid | `**grid-template-columns:230px repeat(8,minmax(0,1fr))**; trayBg + trayShadow` |
| Header cell | `padding 9px 10px; 12px/16px; 600; label2` |
| Row `:520` | `min-height:42px`, zebra `fill4` |
| Row title | `padding 6px 12px; 15px/20px; ellipsis; nowrap` |
| Bar | `margin 5px 3px; padding 3px 9px; 12px/16px; accent ground; onColor; radius 6px` |
| Bar, clipped | radius `0` on the clipped side |
| Undrawn footer | `padding 12px 14px; trayBg + trayShadow` |
| Undrawn copy | `12px/16px; label2` |

### Filters sheet — `:1367-1417`

| Element | Value |
|---|---|
| Scrim | `inset:0; overlay` |
| Panel | `**width:min(380px,100%)**; full height; cardBg; radius `cardR 0 0 cardR`; `box-shadow:-12px 0 40px var(--shadow)` |
| Header | `padding 20px 24px 12px`; h2 `22px/28px; 600` |
| Section label | `13px/18px; label2; uppercase; 0.6px; 600` |
| Person row | `min-height:44px; padding:0 14px; 17px`, inside `fieldBg + fieldShadow; radius 12px` |
| Category chip | `radius 999px; padding 8px 12px; 13px`; selected `accent` ground + `onColor` |
| Toggle | track `51x31px`, knob `27px` |
| Footer | `padding 16px 24px; fill4; right-aligned; gap 10px` |

## Token work

`packages/ui/test/token-discipline.test.ts` bans literal colours and
`packages/ui/test/tokens.test.ts:128` ("every `var(--gn-…)` in `ui.css` names a
declared role", asserted at `:138`) requires every role referenced to exist. So any role this port needs must be **declared**, with its
contrast pairs, in the same change that first references it.

The audit is T1 and its result is not pre-judged here. What is already known:

- **Chips need nothing** — see *What already matches*.
- `tintWarning`, `selected`, `surfaceSunken`/`surfaceRaised`,
  `fillPrimary`…`fillQuaternary` and the tray/field/chip shadow roles all landed
  during the `/workspaces` work and are reused.
- The prototype's `tintDanger` (blocked column chip) and `tintPurple` (calendar
  custom-field pill) **do** gain consumers in this change, unlike in the
  `/workspaces` port where they were deliberately not added for want of one. They
  are added here, each with its consumer named.

**The contrast trap applies and the reference point is the composite.** A tint is
a translucent wash; the obligation is against the tint **over its ground**, not
against the tint alone. `tokens.ts:275` carries this reasoning — a fill
"measured where it is real, composited over `surface`" — with the worked
measurement at `:287`. Measured in **both themes × all three styles** — and for
`tintPurple` the ground is the calendar day cell (`cardBg` in month, `fill4`
out), which is two grounds, not one.

## Tasks

### T0 — Read the prototype's style blocks
Read the hig / minimal / neo blocks in `desktop.dc.html` for the real values of
`cardShadow`, `ctlShadow`, `chipShadow`, `fieldShadow`, `trayShadow`, `segOnShadow`,
`chipPad`, `cardR`, `ctlR`, `tintDanger` and `tintPurple`. The markup gives the
vocabulary; only these blocks give the values, and neo inverts several to inset.
**No CSS is written before this read.**

### T1 — Token audit and any new roles
Enumerate every `var(--…)` the board block names, diff against declared roles,
add only those with a consumer in this change, each with `CONTRAST_PAIRS`
measured on the **composite** per the section above.

### T2 — Page chrome (`apps/web` only)
Breadcrumb, 34px title, header control row, the tab rail as a real segmented
control. The tabs keep `role="tablist"` / `role="tab"` / `aria-selected`; this is
a restyle of the existing controls, not a rebuild.

### T3 — Client narrowing
`boardCardToFilterState` adapter; Filters sheet; search box; active-filter chips;
the honest `N of M shown` count. Control and behaviour land together — an inert
Filters button is a button that lies.

### T4 — Board view
Columns as trays, cards, per-column empty state, and the workflow picker with
`All workflows` defaulted (R3). The picker's narrowing shows its count and a
removable chip naming what is hidden.

### T5 — List, Calendar, Timeline
Restyle per the metrics tables. The calendar legend is the R4 merge. The
timeline's undrawn list keeps its per-reason modifier classes.

### T6 — Board writes
Drag-and-drop and the arrows, through the four-step gate above. The refusal path
is built first, because it is the one a wrong target hits.

### T7 — Docs
`Features.md` and the owning `test-cases/` files, in the same change set —
never a follow-up.

## Test impact

| File | Change |
|---|---|
| `apps/web/test/project-calendar-timeline.test.tsx` | queries `.gn-calendar`, `.gn-timeline`, `.gn-board` — re-verify, do not assume |
| `apps/web/test/project-create-gate.test.tsx` | New-ticket moves into the header row |
| `apps/web/test/list-prefs-wiring.test.tsx` | Group-by / Columns restyled, wiring unchanged |
| `apps/web/test/page-refusals.test.tsx` | all four refusal arms must still read the same |
| `packages/app-core/test/views/board.test.tsx` | per-column empty state; `EMPTY_BOARD_COPY` unchanged |
| `packages/app-core/test/views/ticket-list.test.tsx` | table markup |
| `packages/app-core/test/calendar/calendar-view.test.tsx` | merged legend — the per-field toggle must still toggle |
| `packages/app-core/test/timeline/timeline-view.test.tsx` | `:396-441` modifier classes, `:539-625` row/bar/title |
| `packages/app-core/test/inbox/inbox-css-binding.test.tsx` | references `gn-timeline__bar` — a CSS-binding gate |
| `packages/app-core/test/sync-ux-css-binding.test.tsx` | the binding pattern these gates follow |
| `packages/ui/test/tokens.test.ts` | composite contrast for any role T1 adds |
| `apps/web/e2e-viewport/*` | three specs reference `gn-board-card__provenance` |

New cases are needed for: the `boardCardToFilterState` mapping; the `N of M`
count under an active server narrowing; the workflow picker's `All` default; a
drop on an undeclared target; a drop on a rules-bearing edge opening the dialog;
and the per-column empty state. They go into `test-cases/` at the next free
numbers in the owning section. **Existing IDs are never renumbered.**

## Verification

- **Baseline the viewport E2E suite before touching anything.** It has been red
  on the tap-target ratchet before; without a recorded baseline a new board
  offender is filed under the known failures and never surfaces.
- `packages/ui`, `packages/app-core` and `apps/web` suites, plus typecheck. A
  gate result is not evidence unless it **names its Node version**.
- The token-discipline gate — and it is run so that its cache cannot replay a
  green over a tree it did not police.
- A live read of the board, list, calendar and timeline in all three styles ×
  both themes.
- **No test run is piped into `head`.** Use `| tail -N`, or redirect to a file
  and `head` the file. After any run that returned suspiciously fast, reap only
  workers reparented to `ppid=1`.
- Any relative CSS assertion gets an absolute one beside it: a check that
  compares a column to its sibling passes when both lose their ground.

## Stated divergences

Named here rather than discovered in review.

- **The sync strip is not drawn** (R5). `apps/web` has no `@gisik-nokma/sync-client`
  dependency and runs no engine, so `status`, `queued`, `failed` and
  `engine.lastError()` have no source. `cache.ts:9` records that the cache
  replaces the snapshot "rather than patching it optimistically", so there is no
  countable in-flight queue either. A strip reading `Live · 0 queued` would
  assert a sync state nothing computed — and would keep asserting it during an
  outage, which is when someone would actually look. Desktop and mobile render
  real ones from their replicas; web gets one when web gets an engine.
- **Search reaches only what has loaded.** Client-side by the argument above.
  Past `LIST_PAGE_CAP` the list refuses, and the refusal must say search cannot
  help there — otherwise an empty result reads as "no match" when it means "not
  asked".
- **The move arrows follow declared edges, not column order.** An arrow is
  absent where the workflow declares no move that way. The prototype's walk the
  column array unconditionally.
- **The Filters sheet's multi-select is client-side only.** The wire takes one
  value per axis. The sheet narrows what is on screen; it does not re-ask the
  server, and therefore does not relieve the cap. The "Only tickets in progress"
  control is the one that does, and it stays separate for that reason.
- **`EMPTY_BOARD_COPY` is unchanged.** It is pinned copy for the *zero-groups*
  board, asserted by shell tests. The prototype's per-column empty card is a
  different granularity and is added alongside it, for an empty column inside a
  non-empty board.

## Out of scope

- **Wiring a sync engine into `apps/web`** — the only thing that would make the
  prototype's strip literally true. A larger project than this whole port, with
  its own storage, reconnection and conflict decisions.
- **A plural `stateCategory` on the list route**, or a negation term. Recorded by
  the page's own docblock as what "not done" would need; unchanged here.
- **`TicketSheet`'s empty-actor window** (`page.tsx:648-655`). Known, recorded,
  and a change to that component's contract rather than this page's.
