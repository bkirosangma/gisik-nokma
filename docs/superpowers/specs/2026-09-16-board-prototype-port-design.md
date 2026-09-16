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

**R6 — the board with columns but no cards: extend the condition, keep the
rail.** Ruled after the spec review, not before it — raised by the review pass
that measured the third empty case. This one *did* go the recommended way, which
is worth naming beside the tally above: the owner answered it in their own words
("go with your recommendation") as free text, not by selecting an option this
document had written for them. Detail in *The board that has columns but no
cards*.

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

### The `gn-*view*` grep has a hole, and it is the shared components

That grep finds classes whose names *start* with a view prefix. It cannot find
the shared component classes these views render through, and those are not inert
anywhere:

- `board.tsx:10` imports `Avatar, Button, Card, Chip`; `:650` renders
  `<Card className="gn-board-card">`, and `card.tsx:7` composes
  `['gn-card', className]` — so today the board card **is** a `.gn-card`, with
  no `.gn-board-card` rule of its own anywhere in `ui.css`.
- `ticket-list.tsx:2` imports `Avatar, Chip, Select, Table`.

`.gn-card` is `padding: 0.75rem` (12px); the prototype's board card is 14px
(Metrics, board table). **That 2px cannot be taken out of `.gn-card`** — it would
move every card in the product, desktop included.

**The rule for this port:** view styling lands on the view-scoped selector
(`.gn-board-card`, `.gn-list-*`, …), never by editing `.gn-card`, `.gn-chip`,
`.gn-avatar`, `.gn-table` or `.gn-select`. Those are shared surfaces. If a
prototype metric turns out to be reachable *only* through a shared rule, that
edit stops being part of the port and gets justified individually as a component
improvement, the way the `/workspaces` spec handled its shared-surface edits.
`.gn-chip` is the case that already went the right way: it matches the prototype
exactly (see "What already matches"), so nothing needs to be done to it.

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

**Board cards are not filterable as they stand, and the first design for fixing
that was wrong.** `BoardCard` (`view-types.ts:106-116`) carries `ticketId`,
`title`, `typeId`, `assignee`, `stateProvenance`, `cause`, `rollup`, `pending`;
`stateId` and `category` live on the enclosing `BoardColumn`. This spec
originally proposed a `boardCardToFilterState(card, column)` adapter
synthesizing a `TicketState` so `matchesFilter` could be reused unchanged.
**That adapter must not be built.**

`matchesFilter` fails **closed** on every axis, so a synthesized state does not
degrade — it empties the board:

| Axis | `matches-filter.ts` | On a synthesized state |
|---|---|---|
| `collaboratorIds` | `:30` `some(id => state.collaboratorIds.includes(id))` | `[]` → false → **every card dropped** |
| `dueBefore` / `dueAfter` | `:69-71` via `claimedDueDay` | no `dueDate` claim → null → **every card dropped** |
| `fields` | `:83-84` `claimText(state.fields[id]?.value)` | absent → null ≠ wanted → **every card dropped** |

A board reading `0 of 40 shown` while the list shows forty is worse than the
failure `board.tsx:216-219` warns about, and the disclosure invariant cannot
rescue it: the count would be telling the truth about a lie. Reuse would also
require wrapping `card.title` in a fabricated `FieldClaim` with invented
`actorId`, `clientTime` and `serverTime` (`entity-state.ts:6`) purely to satisfy
`matchesFilter`'s `state.fields['title']` read — inventing provenance in an
event-sourced product to feed a matcher.

**The board is the only lossy surface.** `calendar-model.ts:271` and the
timeline model both call `matchesFilter` on real `TicketState` (via
`TicketDatesInput`), and the list has the server. Three of the four tabs serve
all ten axes correctly; only the board's view-model has dropped the fields.

**So the incapacity becomes a type, not a runtime surprise:**

- `BoardFilterSpec = Pick<FilterSpec, 'text' | 'assigneeIds' | 'typeIds' |
  'stateIds' | 'stateCategories' | 'projectIds'>` — **derived** with `Pick`, never
  hand-copied, so it cannot drift from `FilterSpec` into the second vocabulary
  `matches-filter.ts`'s docblock forbids.
- A small pure predicate over that type consumes `BoardCard` + `BoardColumn` +
  `BoardGroup` directly. No synthesized state, no invented provenance.
- An axis the board cannot evaluate then fails `tsc` on the board path rather
  than silently emptying the rail.

**And the scope asymmetry is disclosed.** The type fix stops the wrong answer
but not the surprise: a person can set a collaborator filter on the list tab,
switch to Board, and see a different population. That is the same asymmetry the
search ruling settled ("one box answering differently on two tabs"), so it is
named the same way — the board tab states which active filters it cannot apply.
This is disclosure of **scope**, and it sits *beside* the `N of M shown` count
rather than inside it: the count reports cards the board filtered, the scope
note reports axes the board never evaluated. Conflating them would put a number
on a filter that never ran.

**The count must not lie.** The prototype's `{shownCount}` reads `N of M shown`.
When the server narrowing is on, `M` is *itself* narrowed — so the strip says so
rather than presenting `M` as the project's total. A bare `N of M` under an
active server narrowing would assert the project holds `M` tickets when it holds
more, which is the `?? []` failure in a different costume.

**The disclosure invariant, stated once for both mechanisms.** `board.tsx:216-219`
holds that a rearrangement which drops a card "is a filter wearing a grouping's
name, and the ticket it dropped is gone with nothing saying so". Two things in
this change can drop a card from view: the **client filter** (T3) and the
**workflow picker** (T4). Ruling R3 keeps the picker's *resting* state total by
defaulting it to `All workflows`, but a default is not a guarantee — the moment
either mechanism is engaged, cards leave the screen.

> **Invariant:** no mechanism that removes cards from view may render without
> both (a) the `N of M shown` count and (b) a removable chip naming what is
> hidden. Neither half ships without the other, and neither mechanism is exempt.

That pairing is what discharges `board.tsx:216-219` — not R3's default. It is one
invariant over two features, so T3 and T4 satisfy the same requirement rather
than each inventing its own disclosure.

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
declared role", asserted at `:138`) requires every role referenced to exist. So
any role this port needs must be **declared**, with its contrast obligation
discharged in the way its kind requires (below), in the same change that first
references it.

Naming: the product does not reuse the prototype's role names. The prototype's
`fill1`…`fill4` are `fillPrimary`…`fillQuaternary`; `label2`/`label3` are
`textMuted`/`textSubtle`; `purple` is `violet600`/`violet300`. Per-family
variants carry `Warm` (neo) and `Navy` (hig/minimal) in the middle —
`tintWarmWarning` / `tintNavyWarning` — resolved per style by the maps at
`tokens.ts:708` and `:745`. New roles follow that shape; T1 does not invent a
second convention.

The audit is T1 and its result is not pre-judged here. What is already known:

- **Chips need nothing** — see *What already matches*.
- `tintWarning`, `selected`, `surfaceSunken`/`surfaceRaised`,
  `fillPrimary`…`fillQuaternary` and the tray/field/chip shadow roles all landed
  during the `/workspaces` work and are reused.
- ~~The prototype's `tintDanger` (blocked column chip) and `tintPurple` (calendar
  custom-field pill) **do** gain consumers in this change… They are added here,
  each with its consumer named.~~ **WITHDRAWN 2026-09-16 on measurement — neither
  tint is added.** See *Both tints were measured and neither can ship* below.

**The contrast trap applies, and an earlier draft of this section got its
mechanism backwards.** It said the new tints get `CONTRAST_PAIRS` rows measured
on the composite. They must get the opposite:

> `tokens.ts:226` and `:273`: these are ALPHA, and **no `CONTRAST_PAIRS` row may
> name them** — `relativeLuminance` ignores alpha by documented design, so a
> declared pair would compute the tint's own colour against a background it is
> actually blended INTO. "A false green", in the file's own words.

A tint is a translucent wash, so the obligation is against the tint **over its
ground** — but it is discharged in `tokens.test.ts`, not in `CONTRAST_PAIRS`.
The established idiom is `tintWarning`'s block at `tokens.test.ts:620-654`: a
local `over(src, dst)` compositor (`:622-628`, "the compositing
`relativeLuminance` deliberately lacks"), looped over `STYLE_NAMES × THEME_NAMES`,
and — load-bearing — **the anti-vacuous control at `:641`**:

```ts
expect(washed, `${style}/${theme}: the tint composites to nothing`).not.toBe(surface);
```

Without that line a fully transparent tint composites to the bare surface and
both contrast assertions pass by measuring text on a surface that already
passed. The check could not fail for the reason it exists. **T1 copies this
shape, including the control**; it does not write a new one.

The grounds each new tint is measured against:

| Role | Consumer | Ground(s) |
|---|---|---|
| `tintDanger` | blocked column chip (board metrics) | the column tray — `trayBg`, which is `surfaceSunken` (hig/minimal) and a neo-specific paper; **not** `surface` |
| `tintPurple` | calendar custom-field event pill | the day cell, which is **two** grounds: `cardBg` in month, `fillQuaternary` out |

`tintWarning`'s block measures one ground because its banner sits at page level,
and its docblock says so explicitly (`tokens.test.ts:616-618`: "if it is ever
nested inside a card, this check is measuring the wrong ground"). Neither new
tint sits at page level, so neither may copy that single-ground assumption —
this is the one place T1 must diverge from the idiom it otherwise follows.

The foreground measured against each composite is the text the prototype puts on
it: `danger` on the blocked chip, `violet600`/`violet300` on the event pill.

### Both tints were measured and NEITHER can ship (2026-09-16)

The measurement above was performed rather than assumed, and it failed. Numbers
below were produced twice independently — by the implementer and by the
controller — using the same `over`/`contrastRatio` implementation
`tokens.test.ts` already holds.

**`tintDanger` + `danger` text, over the column tray, fails 4.5:1 everywhere:**

| style/theme | composite | ratio |
|---|---|---|
| hig/minimal light | `#dec3b7` | **3.229** |
| neo light | `#e6cdc4` | **3.562** |
| hig/minimal dark | `#474265` | **3.331** |
| neo dark | `#3a324a` | **4.291** |

Not a palette accident: the prototype's own native red fails five of the six.
The prototype's blocked chip is a tinted ground with same-hue text, and that
combination is not readable at 13px in any theme this product ships.

**The product does not need it.** `.gn-chip` carries tone as `.gn-chip__dot`
(`ui.css:154`) — a non-text graphic, governed by WCAG 1.4.11's 3:1, not
1.4.3's 4.5 — with `color: var(--gn-text)` for the label. `board.tsx:409`
already renders `<Chip tone={column.blocked ? 'blocked' : column.category}>`.
This chip is squarely inside *What already matches — do not churn it*.

**`tintPurple` + `customMarker` fails too, and has no headroom to rescue.**
`customMarker` on bare neo paper is **4.807** — it clears 4.5 by a hair before
any wash is applied. An alpha sweep shows in-month needs alpha ≤ **0.047** to
stay above 4.5 where the prototype uses 0.129, and the out-of-month ground (the
day cell's `fillQuaternary` over `surface`) fails even at 0.071. So the
precedented remedy — the same-hue alpha nudge `fillNavyHig3` and `fillNavyNeo3`
used — cannot apply.

The alternative considered and rejected: add a second, text-safe purple from the
prototype's own ink (`#4C4A8F`/`#B7B4F4`, which does clear every composite). It
would add a role to the product's colour vocabulary in order to replicate a
decoration the product already achieves — `.gn-calendar__item--custom`
(`ui.css:1222`) renders custom events in `customMarker` today, with a live
`CONTRAST_PAIRS` row guaranteeing it against `surface`.

**Consequence: T1 has no work left and is struck.** The blocked chip keeps
`<Chip tone="blocked">`; the calendar's custom-field event keeps `customMarker`
text rather than gaining a tinted pill. Both are recorded in *Stated
divergences*. Nothing else in the port depends on either role.

## The board that has columns but no cards (R6)

The per-column empty card (prototype, board metrics) and `EMPTY_BOARD_COPY` were
described in this spec as covering different granularities, so no existing test
changes meaning. Measuring the third case shows that framing is incomplete.

`board.tsx:70` (pre-R6; that line is unrelated comment prose today — this
whole section describes the code as it stood before the ruling below, not as
it stands now) is the only site that renders `EMPTY_BOARD_COPY`, and its
condition is `board.groups.length === 0`. Columns are exactly the attached
workflow's states, and empty ones render (`:38`). There is **no per-group or
per-column empty branch today** — grep finds none. So a project that *has* a
workflow attached and *zero* tickets takes `groups.length === 1`, skips the
pinned sentence entirely, and draws a rail of empty column trays.

After T4 that becomes a rail of six empty-state cards, still with no whole-board
sentence. The pre-R6 `board.tsx:70`'s own docblock says an empty board must say something
because "a page that had loaded, had refused nothing, and said nothing" cannot be
told from one still painting. Six empty column cards may re-create exactly that
failure one layer down.

**Ruled: extend the condition, keep the rail.** Show the pinned sentence and its
create button *above* a rail that still renders, whenever the board holds zero
cards in total rather than only when it holds zero groups. The rail stays because
it is the one place the attached workflow's states are visible to someone who has
just attached it.

`groups.length === 0` implies `totalCards === 0`, so the new condition is a
strict **superset** of the old one. Three consequences the plan must honour:

- `EMPTY_BOARD_COPY`'s text does not change, and neither does the existing
  assertion on it — the zero-groups case still takes the branch it always took.
- The zero-groups case keeps rendering `gn-board--empty` with **no** rail, since
  there are no columns to draw. The rail appears only in the new case.
- A new test is needed for the new case specifically — one group, every column
  empty, sentence present *and* rail present. Without it the superset is
  untested, because the existing assertion passes on the old branch either way.

The alternative considered and not taken: leave the condition alone and let the
per-column cards carry it. Fewer moving parts, but it leaves the board silent in
exactly the state the pre-R6 `board.tsx:70`'s docblock was written about.

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
`BoardFilterSpec` (derived with `Pick`) and its pure predicate — **not** a
synthesized `TicketState`; Filters sheet; search box; active-filter chips; the
honest `N of M shown` count; and the board tab's scope note for axes it cannot
evaluate. Control and behaviour land together — an inert Filters button is a
button that lies.

Two tests, and neither substitutes for the other: an **agreement** test that the
board predicate and `matchesFilter` decide the six shared axes identically on
equivalent inputs, and a **compile-time negative** (`@ts-expect-error`) proving
`collaboratorIds` is rejected on the board path. Agreement alone would pass if
both sides were wrong the same way; the negative is what proves the narrowing
exists at all.

### T4 — Board view
Columns as trays, cards, per-column empty state, and the workflow picker with
`All workflows` defaulted (R3). The picker satisfies the **disclosure invariant**
above — the same one T3 satisfies, not a second one. Card styling lands on
`.gn-board-card`; `.gn-card` is not touched (Blast radius). Includes the
zero-cards-with-columns behaviour per **R6**, with the new test that case needs.

### T5 — List, Calendar, Timeline
Restyle per the metrics tables. The calendar legend is the R4 merge. The
timeline's undrawn list keeps its per-reason modifier classes.

### T6 — Board writes
Drag-and-drop and the arrows, through the four-step gate above. The refusal path
is built first, because it is the one a wrong target hits — **and it ships with a
positive control in the same change**: a drop onto a declared, rules-free edge
that actually transitions the ticket. A refusal that fires on everything is
indistinguishable from a refusal that works, and only the successful drop tells
the two apart.

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
| `packages/app-core/test/views/board.test.tsx` | per-column empty state; the R6 zero-cards-with-columns case; `EMPTY_BOARD_COPY` text and its zero-groups assertion unchanged |
| `packages/app-core/test/views/ticket-list.test.tsx` | table markup |
| `packages/app-core/test/calendar/calendar-view.test.tsx` | merged legend — the per-field toggle must still toggle |
| `packages/app-core/test/timeline/timeline-view.test.tsx` | `:396-441` modifier classes, `:539-625` row/bar/title |
| `packages/app-core/test/inbox/inbox-css-binding.test.tsx` | references `gn-timeline__bar` — a CSS-binding gate |
| `packages/app-core/test/sync-ux-css-binding.test.tsx` | the binding pattern these gates follow |
| `packages/ui/test/tokens.test.ts` | composite contrast for any role T1 adds |
| `apps/web/e2e-viewport/*` | three specs reference `gn-board-card__provenance` |

New cases are needed for: the board predicate's agreement with `matchesFilter`
on the six shared axes, and its compile-time rejection of the four it cannot
serve; the board tab's scope note for unevaluated axes; the `N of M`
count under an active server narrowing; the workflow picker's `All` default; a
drop on an undeclared target; a drop on a rules-bearing edge opening the dialog;
a drop on a declared rules-free edge that **succeeds** (T6's positive control);
the per-column empty state; and the R6 case — one group, every column empty,
sentence present *and* rail present, which the existing zero-groups assertion
cannot witness. They go into `test-cases/` at the next free numbers in the owning
section. **Existing IDs are never renumbered.**

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
