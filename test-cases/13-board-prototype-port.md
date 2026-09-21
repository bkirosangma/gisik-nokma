# 13. The board-prototype-port plan — test cases

Part of bucket 13 (`Features.md` §13) — one part-file of the catalogue split performed 2026-09-19.
Index and id-block allocation: [`13-deployment-dogfooding.md`](./13-deployment-dogfooding.md).
Case ids are unchanged and are never renumbered by the split.

## Task 3 — the board's own filter vocabulary (board-prototype-port plan, 2026-09-16)

**Block `13.433`–`13.434` minted here; the next free BLOCK is `13.435`.** The plan's draft proposed
synthesizing a `TicketState` from a `BoardCard` so the board could reuse `matchesFilter` directly;
rejected before being built, because `matchesFilter` fails CLOSED on every axis a card cannot supply
(`collaboratorIds`, `dueBefore`/`dueAfter`, any `fields` clause) and a synthesized state would EMPTY
the board rather than narrow it. `BoardFilterSpec` is `Pick<FilterSpec, …>` over the six axes a board
can answer; the four it cannot are unrepresentable, a compile error rather than a wrong answer on
screen. Two cases, and neither substitutes for the other: agreement proves the shared axes decide
alike, the compile-time case proves the narrowing is real rather than merely documented.

- **13.433** ✅ `matchesBoardCard` and `matchesFilter` decide identically on all six shared axes
  (assignee, type, state, state category, project, text — matching and non-matching, plus the empty
  spec) over a `BoardCard`/`BoardColumn` pair and the equivalent `TicketState`. A dedicated control
  asserts the corpus contains at least one rejection, so the agreement is not vacuously true of two
  predicates that both always answer `true`. — (`packages/app-core/test/filter/board-filter.test.ts`)
- **13.434** ✅ `collaboratorIds` and `dueBefore` are rejected on a `BoardFilterSpec` literal at
  COMPILE TIME (`@ts-expect-error`), not merely absent from a runtime check — witnessed by temporarily
  widening `BoardFilterSpec` from the `Pick` to bare `FilterSpec` and confirming `tsc` then reports
  both directives as unused (`TS2578`), proving the narrowing is what rejects the two axes rather than
  a typo the compiler happened not to catch. — (`packages/app-core/test/filter/board-filter.test.ts`)

## Task 4 — the board's search box, count, chip, and scope note (board-prototype-port plan, 2026-09-16)

**Block `13.435`–`13.444` minted here; the next free BLOCK is `13.445`.** `matchesBoardCard` (Task 3)
had no caller. This task adds one: a page-level search box narrows the board through it, an
`N of M shown` count and a removable chip are derived from the SAME pass that narrows the render
(coordinator Ruling 1 — never a second count), and a scope note names the axes a `BoardFilterSpec`
cannot answer. `13.436` replaces the brief's own Step 5 second test, which asked for a case the
architecture cannot produce — `getBoard(projectId: string)` (`data-source.ts:134`) takes no filter
argument, so the board's own total is never narrowed by the server-side "Only tickets in progress"
toggle, and the brief's literal assertion ("a bare `M` would claim the project holds more than it
does") is false of the board's `M` specifically. The real, reachable version of that hazard — `M`
accidentally sourced from the LIST's own (narrower) row count instead of the board's — is what
`13.436` actually witnesses; its FIRST version used a zero-row list fixture, which could not
distinguish a correct count from a wrong one (any wrong `M` would have failed the single assertion
just as the real bug would), so it was rewritten (fix round 1) to a nonzero, unequal list fixture
plus a negative assertion naming the exact wrong string a `list.rows`-sourced bug would print.
**Fix round 1 (coordinator Ruling 10 and concern 4)** adds `13.439`–`13.441`: the search box sits on
every tab but narrows only the board, which is the identical asymmetry the spec's own search ruling
exists to avoid, just approached from the other direction (a WIRE search would narrow the list and
leave the board unnarrowed; this client search narrows the board and leaves the other three
unnarrowed with no visible sign of it) — `13.439` is the mirror note that names the limit, only
while a search term is actually present. `describeUnappliedBoardAxes` (the board's own scope-note
logic) was extracted to a pure function (`apps/web/src/board-search-scope.ts`) specifically so it
could be unit-tested directly rather than shipping with zero executions until Task 5's Filters sheet
became its first real caller — `13.440`/`13.441` are that unit test. **Review fix round (Important
finding) adds `13.442`–`13.444`.** The disclosure gate (`page.tsx`) enumerated a DIFFERENT axis set
than the narrowing did: `activeFilterChips` covered only `text`, `boardUnappliedAxes` covered only
the four board-blind axes, but the `boardFilter` object handed to `matchesBoardCard` carries SIX
(`text`, `assigneeIds`, `typeIds`, `stateIds`, `stateCategories`, `projectIds`) — so five of those
six could narrow the rendered cards while tripping neither term, closing the whole disclosure strip
(count included) on cards that had, in fact, been dropped. Unreachable today (only `text` has a UI
control), but reachable the instant Task 5's Filters sheet or Task 8's workflow picker writes any
other axis onto the same state. **Two independent remedies, both required:** (1) the chip list is
now built by reading `boardFilter` itself (`buildBoardFilterChips`, `13.442`) — one enumeration,
not two hand-kept in sync; (2) the gate gained a THIRD, independent term,
`boardNarrowing.shown !== boardNarrowing.total` (`shouldRenderBoardNarrowingStrip`, `13.443`) —
because Task 8's workflow picker narrows by dropping whole GROUPS, never by setting a filter axis,
so no enumeration of axes, however complete, could ever notice it; only a fact about the actual
render (fewer cards shown than exist) can. `13.443` tests the gate expression directly rather than
through a page render, since the state remedy 2 exists for cannot be constructed from this page's
current inputs. `13.444` is the review's Minor: Ruling 10's mirror note gained a Calendar-tab arm
alongside its existing List/Timeline coverage.

- **13.435** ✅ Typing into the board's search box narrows the rendered grid AND reads an honest
  `N of M shown`: two of three fixture cards leave the DOM, the remaining one stays, and the count
  names both numbers correctly. — (`apps/web/test/board-narrowing.test.tsx`)
- **13.436** ✅ The count is read from `board.data`, never from `list.rows.length` — a board fixture
  of three cards against a list fixture of TWO rows (nonzero, and different from three so a
  `list.rows`-sourced bug prints a plausible wrong number rather than an obviously broken one), with
  the "Only tickets in progress" toggle on, still reads the board's own total (three) once the
  search box narrows it to one — and does NOT read "1 of 2 shown", the exact string a
  `list.rows`-sourced `M` would produce. Mutation-verified: temporarily sourcing `M` from
  `list.rows.length` was confirmed to fail this case with exactly that string before the fix
  landed. — (`apps/web/test/board-narrowing.test.tsx`)
- **13.437** ✅ The chip and the count move together: removing the one active filter chip clears the
  search box, restores every card, AND removes the count with it — no stale "M of M" survives an
  empty filter, because the strip they share is one conditional block, not two independently gated
  elements. — (`apps/web/test/board-narrowing.test.tsx`)
- **13.438** ✅ The `.gn-project__narrowing` strip does not render at all while no filter is active —
  the count is not an unconditional fixture of the board tab. — (`apps/web/test/board-narrowing.test.tsx`)
- **13.439** ✅ The List and Timeline tabs show no "search doesn't apply here" note until a search
  term actually exists, name the limit once one is typed, and drop the note again once it is
  cleared; the Board tab — where the search DOES apply — never shows the note at all, even with a
  term present and cards visibly narrowed. — (`apps/web/test/board-narrowing.test.tsx`)
- **13.440** ✅ `describeUnappliedBoardAxes` (unit, no page mount): an empty filter, an EMPTY
  `collaboratorIds`/`fields` (which must not narrow), and each of `collaboratorIds`/`dueBefore`/
  `dueAfter`/`fields` set individually — including `dueBefore` and `dueAfter` set TOGETHER, which
  names "due date" exactly once, not twice. — (`apps/web/test/board-search-scope.test.ts`)
- **13.441** ✅ `describeUnappliedBoardAxes` names all three unapplied axes together in a FIXED
  order (collaborator, due date, custom field) regardless of the order the caller supplied them on
  the `FilterSpec` object, and never names a `BoardFilterSpec`-representable axis (`text`,
  `assigneeIds`) as unapplied. — (`apps/web/test/board-search-scope.test.ts`)
- **13.442** ✅ `buildBoardFilterChips` (review, Important finding, remedy 1): emits a labelled,
  removable chip for EACH of the six `BoardFilterSpec` axes when set (not only `text`), resolves an
  id through the supplied name resolver and falls back to the raw id when the resolver has none,
  ignores an empty list axis, and each chip's `onRemove` clears exactly its own axis and no
  other. — (`apps/web/test/board-search-scope.test.ts`)
- **13.443** ✅ `shouldRenderBoardNarrowingStrip` (review, Important finding, remedy 2): false with
  nothing active and nothing hidden; true on a chip alone; true on an unapplied axis alone; true on
  ALL three together; and — the case that would fail without remedy 2 — true when `shown !== total`
  with NEITHER a chip NOR an unapplied axis, the exact state a group-dropping narrowing mechanism
  (no filter axis set) produces. Tests the gate expression directly rather than through a page
  render, per the coordinator's own instruction, since that state cannot be constructed from this
  page's current inputs (nothing here drops a group without going through a filter axis
  first). — (`apps/web/test/board-search-scope.test.ts`)
- **13.444** ✅ The review's Minor: Ruling 10's mirror note (`13.439`) is exercised on the Calendar
  tab too, not only List and Timeline — the gate is one uniform `view !== 'board'` check, so
  divergence was unlikely, but untested. — (`apps/web/test/board-narrowing.test.tsx`)

## Task 5 — the Filters sheet (board-prototype-port plan, 2026-09-16)

**Block `13.445`–`13.462` minted here.** The Filters button Task 4
deliberately left unrendered ("An inert Filters button is a button that lies... I chose do not render
it yet") gets its sheet: a `role="dialog"` side panel writing straight through to the SAME
page-level `filter` state the search box and the removable chips already share — no draft copy, no
"Apply" button. Five of `BoardFilterSpec`'s six axes get a control (`text` already had the search
box): Assignee and Collaborators as "person row" checkbox lists, Type and State as "category chip"
multi-selects, and Category over the three fixed `stateCategories` values. `projectIds` gets none —
this page is already scoped to the one project it shows, and Task 4's own report found no natural
label source for it here. `dueBefore`/`dueAfter`/`fields` get no control either: the design spec's
own Filters-sheet metrics name exactly two control shapes ("person row", "category chip"), and this
task's brief curates those same two into its metrics line while dropping the spec's "Toggle" row
entirely — the discriminating fact that no boolean/date control was meant to land here. Both remain
unsettable anywhere in the product after this task, a named gap for whoever builds their control
next, not a surprise.

`13.451` is the test Task 4's own brief deferred to this commit by name: "names the axes the board
could not evaluate, beside the count and not inside it... helper added in Task 5... do not stub the
helper." `openFiltersAndPickCollaborator` in `filters-sheet.test.tsx` is that helper, doing the real
thing — open the sheet through the Filters button, click a real checkbox — rather than reaching into
`setFilter` directly. Because `collaboratorIds` is one of the four axes `matchesBoardCard` cannot
evaluate at all, this is `describeUnappliedBoardAxes`'s (Task 4) first execution through the rendered
page rather than through its own unit test; it ran clean on the first try.

The scope note's trailing clause — "— set on the list tab, where a ticket carries the field", written
before this sheet existed — is REMOVED, not re-pointed at the Filters sheet. `boardUnappliedAxes` can
join up to three axis names in one sentence, and after this task only ONE of the three
(`collaborator`) has a control anywhere in the product; `dueBefore`/`dueAfter`/`fields` remain
unsettable anywhere. A single trailing clause cannot name a different true location per axis in a
joined list, and "set in the Filters sheet" would be right for collaborator today and silently wrong
for the other two the moment either gains a control elsewhere — the exact "names the wrong place"
failure the task's own brief warned against. `13.456` guards the deletion.

The dialog's focus contract is mutation-verified in both directions, not merely asserted once:
`account-menu.tsx`'s own docblock warns that "Escape returns focus to the trigger" is vacuously true
if focus never left it in the first place. `13.445` asserts focus DID leave the trigger on open
(`document.activeElement` inside the panel, not on the button) — confirmed load-bearing by temporarily
deleting the focus-on-open effect and watching that exact assertion fail. `13.446` asserts Escape
returns focus to the trigger — confirmed load-bearing the same way, by temporarily deleting the
focus-return line and watching that assertion fail with the trigger untouched. Both mutations were
reverted with a targeted edit (not `git checkout`), confirmed clean by re-running the full suite.

- **13.445** ✅ The Filters button opens a `role="dialog"` panel with `aria-modal="true"`, labelled by
  its own `<h2>Filters</h2>` via `aria-labelledby`, and focus moves off the trigger and into the panel
  on open. Mutation-verified: deleting the focus-on-open effect fails this exact
  assertion. — (`apps/web/test/filters-sheet.test.tsx`)
- **13.446** ✅ Escape closes the sheet and returns focus to the exact Filters button that opened it.
  Mutation-verified: deleting the focus-return line fails this exact
  assertion. — (`apps/web/test/filters-sheet.test.tsx`)
- **13.1052** ✅ The two SHARED modal primitives, `Dialog` and `Sheet`, keep the contract 13.445/13.446
  above states for the filters sheet. Both declared `aria-modal="true"` — a claim that everything outside
  them is inert — while moving no focus, trapping none, and restoring none. Three measured consequences,
  all painted on the running stack: focus stayed on the button that opened the dialog (still on *New
  ticket* at 300 ms and at 1 800 ms, `closest('[role=dialog]')` → null); a real Tab walked straight out of
  an open dialog into the page behind it; and Escape closed the dialog leaving focus on `<body>`. **The
  leak is not inert in the product either** — `board.tsx:385-393` refuses a column action precisely because
  it judges the interaction to have arrived "behind a modal — a keyboard-focus escape" (case 13.793), so a
  workaround existed specifically for it. Now each primitive moves focus to the panel itself on open
  (`tabIndex={-1}` on the panel rather than the first focusable inside it, so a screen reader announces the
  dialog's own name on arrival rather than *"Close dialog"*, the exit), contains Tab within it, and returns
  focus to the opener on close — via `@react-aria/focus`'s `FocusScope contain restoreFocus`, which
  restores only once focus has actually been lost to `<body>`, so a close that left focus somewhere
  deliberate is not overridden. Six cases, one per primitive per property plus the coupling case below;
  each opens through a real button and asserts the control focus demonstrably LEFT before asserting where
  it arrived, because "focus is inside the dialog" is vacuously true when the opener was never focused.
  **And containment must not swallow a portalled popover's own focus.** A `Select` panel portals to
  `document.body` — outside the panel in the DOM — so containment reads it as an escape and drags focus
  back off the option row. That the product's pickers still work inside its dialogs is down to a coupling
  between two rulings in this same batch, **measured rather than reasoned**: removing E4-17's `FocusScope`
  from `SelectPanel` leaves `document.activeElement` on `button.gn-select__trigger` with the option row
  never focused at all — the picker degrades silently inside every dialog — while with it focus lands on
  `li.gn-select__option`. The mechanism is React Aria's scope TREE, not the DOM: the panel's `FocusScope`
  is a child of the dialog's through React context, which crosses the portal, so `isElementInChildScope`
  answers true and `contain` leaves it be. The case exists because that dependency is invisible from
  either half — the panel's `FocusScope` reads as a redundant wrapper once the ring exists — and is the
  wire between 10.90/E4-17 and this case. Mutation-witnessed: removing that `FocusScope` kills exactly
  the two coupling cases and nothing else. — (`packages/ui/test/components.test.tsx`)

  *Id note: `13.1047`–`13.1049` are reserved and unused in executor 1's block `13.1034`–`13.1049`;
  `13.1050`–`13.1052` were minted by batch B05, which takes no allocated block and derives from the
  maximum in use against `origin/main` instead. The next free id in this space is `13.1053`.*
- **13.447** ✅ Checking a person row in the Assignee section narrows the board, shows the
  `assigneeIds` chip naming them, and the count reflects the real removal. — (`apps/web/test/filters-sheet.test.tsx`)
  **RULING E5-4 (closed), same case's own describe block extended, no new id (§13's numeric space is
  contested across concurrent batches tonight — controller allocation, 2026-09-21 21:0x):** both the
  Assignee and Collaborators person-row lists (`personSection`, shared by both) rendered `member.name`
  verbatim — blank for the magic-link population — painting a row with no visible text and no accessible
  name, unfindable by the SAME `getByRole('button', { name: … })` query every other case in this file
  already uses. Both rows now resolve through `actorLabel(member.id, member.name)`, the same fix E4-18
  applied to the ticket sheet's own Assignee picker — asserted with a nameless member seeded into the
  roster, found by id in BOTH groups. — (`apps/web/test/filters-sheet.test.tsx`)
- **13.448** ✅ Pressing a Type chip (`aria-pressed` toggles true) narrows the board, shows the
  `typeIds` chip, and the count reflects the real removal. — (`apps/web/test/filters-sheet.test.tsx`)
- **13.449** ✅ Pressing a State chip discloses via the `stateIds` chip even when it removes no card
  (every fixture card shares the one state) — the narrowing strip's three-term gate opens on a chip
  existing, independent of whether it removed anything. — (`apps/web/test/filters-sheet.test.tsx`)
- **13.450** ✅ Pressing a Category chip narrows the board to zero cards and shows the
  `stateCategories` chip — the empty-columns-not-vanished-board rule (`board.tsx:216-219`) holds at the
  limit. — (`apps/web/test/filters-sheet.test.tsx`)
- **13.451** ✅ THE DEFERRED TASK 4 TEST. Picking a Collaborator through the real
  `openFiltersAndPickCollaborator` helper does not narrow the board (the count stays `M of M`) but
  the scope note names "collaborator" as not applied on the board — the count reports cards the board
  filtered, the note reports an axis it never ran, and they stay
  separate. — (`apps/web/test/filters-sheet.test.tsx`)
- **13.452** ✅ "Clear all" resets the sheet's own five axes (proven on Assignee) without closing the
  sheet — a distinct action from "Done". — (`apps/web/test/filters-sheet.test.tsx`)
- **13.453** ✅ Absence, not an invented empty list: while the roster has not been read
  (`getMembers` never resolving), the Assignee section states so and renders no checkboxes at
  all. — (`apps/web/test/filters-sheet.test.tsx`)
- **13.454** ✅ A FAILED ticket-types read renders a refusal sentence in the Type section, never
  falling back to the built-in ladder — the built-in fallback is for a read still PENDING, never one
  that has REFUSED. — (`apps/web/test/filters-sheet.test.tsx`)
- **13.455** ✅ While the board has not been read, the State section states so rather than rendering
  zero chips (which would claim the board legitimately has no states). — (`apps/web/test/filters-sheet.test.tsx`)
- **13.456** ✅ The scope note's copy no longer names "the list tab" — the location clause removed
  because it names the wrong place for two of the three axes it can
  join. — (`apps/web/test/filters-sheet.test.tsx`)

**Task 5 fix round 1, same session — `advisor()` review before reporting done.** One real, blocking
gap: `13.453`/`13.455` proved the PENDING sentence for Assignee/Collaborators/State, but those two
sections collapsed PENDING and REFUSED into one `members === null` / `!boardLoaded` check — the Type
section already distinguished `typesError`/`typesPending` for the identical reason, and this was the
same wrong-cause failure `page.tsx`'s own `useSessionStatus` docblock was written about, one component
over: a real roster/board refusal would have printed "has not loaded yet" instead of naming the
refusal. Fixed by threading `members.error`/`board.error` (`useLiveQuery`'s own error channel) into
`FiltersSheet` as `membersError`/`boardError`, checked ahead of the pending branch in both sections —
`13.457`/`13.458` prove BOTH halves: the refusal sentence appears, AND the pending sentence does not.
Also fixed in the same round: `.gn-filters__scrim` had no `z-index`, so it would have painted BELOW
`TicketSheet`'s `.gn-sheet__scrim` (`z-index: 40`) were both ever open at once — invisible to every
test in this file, since jsdom computes no paint order at all. Matched the house scrims' own `40`
rather than inventing a second stacking scale; no case can exercise this (jsdom's blindness to paint
order is exactly the reason it was missed the first time), so it is recorded here as reasoned from the
CSS rather than proven by a test.

- **13.457** ✅ A FAILED roster read renders the refusal sentence in Assignee, and NOT the "has not
  loaded yet" pending sentence — the two are checked as mutually exclusive facts, not merely the
  refusal's presence alone. — (`apps/web/test/filters-sheet.test.tsx`)
- **13.458** ✅ A FAILED board read renders the refusal sentence in State, and NOT the "has not loaded
  yet" pending sentence, for the identical reason. — (`apps/web/test/filters-sheet.test.tsx`)

**Ruling 12 (coordinator remediation, same session) — "Clear all" was not true.** `clearAll` cleared
the sheet's own five axes and deliberately left `text` alone, on the reasoning that the search box is
Task 4's control, living outside this sheet — a correct fact about ownership and a wrong answer about
what the button ON SCREEN promises. A person who types a search term, opens Filters, and clicks a
button labelled "Clear all" would have watched the text chip survive: an accurate docblock above an
inaccurate control is still a lie to whoever is looking at the control. **Fix: `clearAll` now clears
all SIX `BoardFilterSpec` axes the narrowing strip's chips can represent — `text` included** — keeping
`activeFilterChips` as the one disclosure surface the button's label actually promises. Checked, not
assumed, before writing the fix: the search `<input>` (`ProjectBoard`'s own JSX) is
`value={filter.text ?? ''}`, a CONTROLLED component with no local state, so clearing `filter.text` was
sufficient on its own — no separate desync between the box and the filter to fix.

- **13.459** ✅ "Clear all" removes the text chip AND empties the search box — the two are asserted as
  separate failure modes (the disclosure surface lying vs. the control itself holding stale text),
  confirming the fix covers both rather than only the chip the earlier version already
  handled. — (`apps/web/test/filters-sheet.test.tsx`)

**Ruling 13 (coordinator remediation, same session) — Ruling 12's own fix cleared the WRONG six.** The
reviewer checked `clearAll` axis-by-axis against `BoardFilterSpec` rather than accepting Ruling 12's
"clears all six" claim, and found a DIFFERENT six than the docblock and both commit messages named:
`collaboratorIds` **included** (not a `BoardFilterSpec` axis — produces no chip via
`buildBoardFilterChips`, only a scope-note entry) while `projectIds` **omitted** (one of the six, WITH
a working chip). Wrong in both directions at once, and harmless only because nothing on this page sets
`filter.projectIds` yet — precisely why it needed fixing now: the first future control that writes
`projectIds` would have found "Clear all" silently failing to clear it, with nothing pointing back at
this function. **Fix:** the exact axis set — `FILTERS_SHEET_CLEARABLE_AXES`, exported once from
`page.tsx` — is now the SINGLE source both `clearAll` (via the extracted `clearFilterAxes`) and this
test file read, rather than two independently hand-typed literals, which is the mechanism that produced
the wrong six twice. `13.460`'s first case pins the array's own content; its second case is a UNIT test
against `clearFilterAxes` directly (no UI control exists for `projectIds`, so no end-to-end case is
possible) with every field asserted by NAME rather than by looping over the array under test — the
first draft of this case looped over `FILTERS_SHEET_CLEARABLE_AXES` to decide what to check, which
passed vacuously when `projectIds` was mutated out of the array (the check shrank along with the
implementation). Mutation-verified both ways: temporarily removing `projectIds` from the array failed
BOTH of `13.460`'s cases at exactly that field, and the revert was confirmed clean via
`grep -n MUTATION page.tsx` (zero matches) before the final suite run.

**MINOR (same review) — "Done" and the scrim click were wired but untested.** Both close paths route
through the same `onClose`/`closeFilters` `13.446` already mutation-proves for Escape, so the risk was
low, but neither had a passing assertion, and `filters-scrim`'s own testid was referenced by no test at
all. `13.461`/`13.462` close that gap directly.

- **13.460** ✅ `FILTERS_SHEET_CLEARABLE_AXES` names exactly the six `BoardFilterSpec` fields plus
  `collaboratorIds` (order-independent set comparison), and `clearFilterAxes` clears every one of those
  seven fields BY NAME on a `FilterSpec` carrying `projectIds` — the axis Ruling 13 found silently
  omitted, settable by no control on this page — while leaving an eighth axis outside the clearable set
  (`dueBefore`) untouched as a negative control. — (`apps/web/test/filters-sheet.test.tsx`)
- **13.461** ✅ Clicking "Done" closes the sheet and returns focus to the Filters button, the same as
  Escape. — (`apps/web/test/filters-sheet.test.tsx`)
- **13.462** ✅ Clicking the scrim (outside the panel) closes the
  sheet. — (`apps/web/test/filters-sheet.test.tsx`)

## Task 6 — columns as trays, cards, and the blocked-column indicator (board-prototype-port plan, 2026-09-16)

**Case `13.463` minted here.** Geometry only, per the task's own brief: the column rail
(`.gn-board__columns` renamed `.gn-board__rail`, spec Board `:354-399`'s "Column rail" row), the
column tray itself (`.gn-board__column` — sunken surface, sunken shadow, card radius, 18rem lane,
its own flex column layout), the count (`.gn-board__count`'s body updated to the spec's 13px/18px,
selector kept for `board.test.tsx:142`), and the card (`.gn-board-card`, 14px padding via
`.gn-card.gn-board-card`'s source-order win over the untouched `.gn-card`, never a specificity win —
both are `(0,1,0)`). One real behaviour change, not merely restyling: `.gn-board-card--pending`'s
dashed in-transit outline had a rule but no wiring — `board.tsx:719` never added the modifier class —
so it is wired onto `card.pending`, the same flag the existing "claim in transit" chip already reads.
**The blocked-column indicator needed no CSS work, confirmed rather than assumed**: `board.tsx:409`
already renders `<Chip tone={column.blocked ? 'blocked' : column.category}>`, and `.gn-chip--blocked
.gn-chip__dot` (`ui.css:155`) already carries the tone as a coloured dot against a readable
`--gn-text` label — the tinted-ground-plus-same-hue-text version the prototype and an earlier draft of
this task's own brief called for was measured (twice, independently) at 3.229–4.291 against the 4.5:1
WCAG floor in all six style×theme combinations and does not ship (spec, "Both tints were measured and
NEITHER can ship"). A second, unrelated finding surfaced while confirming that: `.gn-board__column--
blocked`'s `border-color: var(--gn-blocked)` had been inert since before this task — nothing on
`.gn-board__column` declared a `border-style`, so the colour painted nothing, and `board.test.tsx`'s
"marks a blocked state visibly" case asserts only that the class string is present, never a computed
style, so it could not have caught it.

**Coordinator rulings 14–16, same day, closing all three open items from this task's first pass.**
**Ruling 14** strikes the brief's own `.gn-board__column-title` metric (17px/22px, 600) the same way
Task 1 was struck: it has no attachment point under the header markup Tasks 3–5 already shipped
(`Chip` takes no `className`, and the header renders the column name AS the chip's own child text),
and a split into a separate title plus a standalone blocked chip was considered and rejected — that
chip's tone carries CATEGORY for every column, not only blocked, so separating them would change what
the colour means across the whole board, a semantic change outside this task's scope. **Ruling 15**
removes the spec's own `cursor: grab` from `.gn-board-card` — shipped in the first pass with no drag
behaviour behind it, the same "a control that lies" shape Task 4's own brief withheld the inert
Filters button for; it moves to Task 14's commit, beside the behaviour it promises. **Ruling 16**
removes the inert `.gn-board__column--blocked` border declaration found above — the sixth time this
session hit the "declares a visual effect that never paints" shape the dead `.gn-view-tabs` rules were
(Task 4); the class itself is untouched, still applied conditionally and still asserted by
`board.test.tsx:56-61`, only the misleading declaration is gone. Confirmed to change no rendered
pixel: nothing else in the cascade sets `border`/`border-style` on that selector either, before or
after.

**Coordinator ruling 17, code review — the padding fix's own reasoning was not applied to the
neighbouring property in the same rule.** `.gn-board-card`'s literal `border-radius: 0.75rem` (12px)
carried the SAME `(0,1,0)` specificity as `.gn-card`'s own token-driven radius and sat later in the
file, so it won on source order for every style — pinning every board card at 12px where `neo` should
draw `.gn-card`'s `--gn-radius-card` at 20px (`tokens.ts:798-801`). This is the exact defect case
13.355 already fixed one surface over (`.gn-card.gn-invite`'s literal radius tying `.gn-card`'s
token); the padding line two properties over got the "does this compete with `.gn-card`'s own token"
scrutiny (verified 12px stays the product default, only the board card takes 14px), and the radius
line, transcribed from the brief's own CSS block, did not. **Removed, not replaced with a token —
minting a `.gn-board-card`-specific radius role to preserve the prototype's flatter 12px corner was
considered and rejected, the same precedent 13.355 already set: a new token role to reproduce one
decoration.** The board card now falls through to `.gn-card`'s own radius and moves with the style
axis like every other card; the prototype's genuine 12px-vs-16px distinction is given up, honestly,
not silently.

- **13.463** ✅ `BoardCardView` outlines the card container itself (`.gn-board-card--pending`) while
  `card.pending` is true and not otherwise — proven in both directions on the same render/rerender
  pair the neighbouring "claim in transit" chip test already uses, and mutation-checked: a
  never-wired constant class fails the positive assertion, an always-wired one fails the negative. —
  (`packages/app-core/test/views/board.test.tsx`)
- **13.464** ✅ `.gn-board-card` declares no `border-radius` of its own (mirroring case 13.355's own
  source-scan shape, `neo-card-radius.test.ts`) — the rule still exists and still carries its 14px
  padding, only the radius literal is asserted absent, so the board card falls through to `.gn-card`'s
  token-driven radius rather than pinning 12px under every style. Mutation-witnessed: a planted literal
  `border-radius` on the rule is caught by the same test. — (`packages/ui/test/components.test.tsx`)
- **13.1177** ✅ A board card draws a CLAIMED due date in its meta line, and draws a date that has
  PASSED in the danger tone (`.gn-board-card__due--late`) — ruling **E5-2** (release 2026-09-22, batch
  B13), from `docs/lanes/review-ux-exec5.md:242`. **The id comes from B13's ALLOCATED §13 BLOCK,
  `13.1177`–`13.1186`** (controller allocation, 2026-09-21 22:0x: `§13` ids are now per release batch,
  the same shape `§17` already had; the block table lands in `test-cases/13-hig-per-screen.md`).
  `13.1177` is the block's first id and is free across `origin/main` AND every `origin/rel/*` head.
  **The reading this paragraph replaced is the one the block exists to retire**, and it was wrong in a
  way worth recording: it took the "next id free in the shared space" and measured it with
  `git grep -cw` — which returned a confident ZERO for `13.520` while `13.520a` and `13.520b` were
  ALREADY in `13-owner-requests-and-backlog.md`. A word-boundary match is blind to the letter-suffixed
  form, and the guard's own regex admits that form (`\d+\.\d+[a-z]?`), so the two tools disagree about
  what "taken" means. `13.1177` was re-verified with `git grep -w` across `origin/main` AND every
  `origin/rel/*` head (a `13.517` positive control in the same invocation returned 160 hits while
  `13.1177` and `13.1176` both returned none, so the search provably reaches the ids it claims are
  absent). (Separately: `\b` inside `-E` returns a silent empty on BSD grep — a same-run positive control
  is what catches it, and `13.517` is the control used here.)
  **The defect this pins:** until the ruling the Board drew NO due date at all — `BoardCard` carried
  none while `TicketCard.dueDate` was already on every card the board is projected from and
  `ListRow.dueDate` read it off the same wire — so a ticket a week overdue was indistinguishable from an
  undated one on the project's DEFAULT tab (`page.tsx:193` "The default stays `'board'`"), while the
  sheet, the List, My Work, the Calendar and the Timeline all carried the date. The label is
  `formatDate(due.date)` and the claimant rides along as the span's `title`. **The tone is computed from
  a `today` PROP, never a device clock** — `apps/web`'s project page hands `Board` the same
  `istToday()` it already hands the Calendar and Timeline tabs — and the case carries FOUR controls,
  because a tone always on and a tone never on both satisfy a single-armed assertion: a FUTURE date
  draws the label without the tone; a date due TODAY is not late (the comparison is `<`); with no
  `today` the label still draws and the tone does not; and a card claiming NO date draws no label at
  all, which is what stops the positive case passing on a span that is simply always rendered. The
  export's OTHER meta bit, the ticket key, is deliberately NOT drawn and IS a real wire gap: it is
  composed on the single-ticket read (`apps/server/src/routes/tickets.ts`), and `TicketCard` carries no
  prefix and no per-project number to compose one from. **Mutation-witnessed twice, with two distinct
  signatures:** forcing the label's condition false reddens the five label-and-tone cases and leaves the
  "no date → no label" control green (`Tests 5 failed | 49 passed`), and forcing `late` to a constant
  reddens EXACTLY the tone case and nothing else (`Tests 1 failed | 53 passed`) — the second is what
  proves the tone assertion is discriminating rather than carried by the label's own presence. —
  (`packages/app-core/test/views/board.test.tsx`)

## Task 7 — the per-column empty state and Ruling R6 (board-prototype-port plan, 2026-09-16)

**Cases `13.465`–`13.466` minted here**, continuing directly from `13.464` (verified against the real
case list via `node scripts/check-case-ids.mjs`, not the file's own "next free" prose, per this task's
own brief). `board.tsx:70` (pre-R6; that line is unrelated comment prose today, the gate it names having
been superseded by this very ruling) — its whole-board sentence (`EMPTY_BOARD_COPY`) was gated on
`board.groups.length === 0` — a project with a workflow attached and zero tickets in it took
`groups.length === 1`, skipped the sentence, and drew a silent rail of empty column trays, one layer
under the exact "loaded, refused nothing, said nothing" failure that branch was first written to catch.
**Ruling R6** (owner, spec review pass, "go with your recommendation" — the one ruling in this port that
went the recommended way rather than the owner's own free-text alternative) widens the gate to
`board.tsx`'s new `totalCards` fold: the sentence renders whenever the board holds zero cards in TOTAL,
not only when it holds zero GROUPS. `groups.length === 0` implies `totalCards === 0`, so this is a strict
**superset** — the pre-existing `EMPTY_BOARD_COPY` assertions (3.112, 3.113, and 3.114's CONTROL
sub-case) pass UNMODIFIED, run and confirmed rather than assumed (`packages/app-core` suite, 1224/1224
green, Node v22.23.2). One pre-existing test's own assertion contradicted the new behaviour by
construction rather than by defect — **3.114's second `it`**
(`test-cases/03-foundation-ledger.md:100`, "a group whose columns are all empty is NOT an empty board")
used a single-group, single-empty-column fixture and asserted `EMPTY_BOARD_COPY` absent; that fixture IS
the R6 case in miniature, so its assertion was now the opposite of correct and is AMENDED, not left
standing — see its own updated comment in `board.test.tsx` for the before/after. The rail's own presence
claim in that test (`getByRole('region', ...)`) is untouched and still passes.

**The witness (Step 6 of this task's own brief).** Reverted `emptyBanner`'s gate from `totalCards === 0`
back to the old `board.groups.length === 0` (a one-line, targeted `Edit`, never `git checkout --`, and
only after the real work below was committed) and re-ran `test/views/board.test.tsx`: **exactly two
tests reddened** — `13.466` (below) and the amended 3.114 test, both of which depend on the widened
gate by construction — while every other test, INCLUDING the three pre-existing `EMPTY_BOARD_COPY`
assertions, stayed green. Restored immediately after, confirmed clean, no second commit needed since the
mutation was never committed. Two reddening rather than the brief's literal "the new test alone" is the
correct count here: the brief's wording assumed only one new test would exist, and this task additionally
corrects a second, pre-existing test whose own assertion the ruling falsifies — both are R6-dependent by
the same construction, so both flip together.

**The per-column empty state** (spec Board `:354-399`, "Empty column"/"Empty icon"/"Empty copy"/"Empty
action" rows; markup verified against `design-system/interactive/desktop.dc.html:387-394`, the ONLY
place in the repo giving the icon itself — a plain "+" glyph, `stroke="currentColor"`, `aria-hidden`) is
a DIFFERENT granularity from R6's sentence and both may render together: `.gn-board__column-empty`
(fill4 → `--gn-fill-quaternary`, radius → the TOKEN `--gn-radius-card` rather than the prototype's
literal 12px — a new card-like rule takes the token, the same rule case 13.464 just above already
established for `.gn-board-card`'s own radius), a 34px `.gn-board__column-empty-icon` circle replicating
`.gn-chip`'s own three-branch chipBg/chipShadow treatment on a new selector (never editing the shared,
do-not-edit `.gn-chip`), and `EMPTY_COLUMN_COPY` — a new exported constant, deliberately NOT a
re-spelling of `EMPTY_BOARD_COPY` (`"No tickets in this column yet."` against `"No tickets here
yet — create one."`), because both can render on the same screen under R6 and a `getByText` query on
either must still resolve to exactly one element. The action button reuses `@gisik-nokma/ui`'s `Button`
component UNCHANGED (`.gn-button`, ghost variant) rather than inventing a `ctlBg`/`ctlShadow` CSS
treatment: `ui.css:22-30`'s own docblock already records the prototype's raised neo control shadow as an
OPEN DECISION deliberately left to the repo owner, and this port's own plan settles it for every board
control — "Board controls use `.gn-button` unchanged"
(`docs/superpowers/plans/2026-09-16-board-prototype-port.md:57`) — so this task does not reopen it.
Labelled "Add a ticket" rather than repeating the whole-board button's "Create a ticket": both reuse the
SAME unscoped `onCreateTicket` handler (`BoardProps` carries no per-column target, and adding one is
outside this task), so identical wording on every button rendered when a board is both globally and
per-column empty (R6) would be indistinguishable by accessible role and name alike; the different wording
does not claim the created ticket lands in that specific column.

**The filtered-to-zero column, considered and decided against a second copy.** `BoardColumn`
(`view-types.ts:119-125`) carries `stateId`/`name`/`category`/`blocked`/`cards` and nothing else — no
signal distinguishing a column that genuinely holds no tickets from one the client-side board filter
(`filter/board-filter.ts`, Task 3) narrowed to zero. The narrowing pass that WOULD know the difference
runs above `Board`, in the shell computing `boardNarrowing`, and it already discloses an active filter
through the `N of M shown` count and its removable chips (spec, "The count must not lie"). Writing a
second, column-scoped disclosure here — with data this component was never given — would risk an
unsynchronised second copy of the same fact, so `EMPTY_COLUMN_COPY` says only what is true in both cases,
the same discipline `EMPTY_BOARD_COPY`'s own docblock already holds itself to. No new prop, no new field
on `BoardColumn`, and no second sentence were added; this is a decision, not an oversight, and it is
recorded here rather than only in the component's own comment.

- **13.465** ✅ The per-column empty state: an empty column renders `EMPTY_COLUMN_COPY` and its icon; a
  column holding a card does not (`errandBoard()`'s three empty columns vs. `Doing`, scoped with
  `within` so a false positive from an unscoped `getByText` cannot pass). Both arms of the optional
  "Add a ticket" action are tested — present and wired to `onCreateTicket` when the shell hands one down,
  absent (words only) when it does not — the same both-arms discipline `emptyBanner`'s own docblock
  already holds itself to. — (`packages/app-core/test/views/board.test.tsx`)
- **13.466** ✅ RULING R6 ITSELF: one group, every column empty — `EMPTY_BOARD_COPY` renders AND both
  columns' names render, proving the rail survives beside the sentence. This is the case no existing
  assertion could witness before this task, and the witness above (revert to `groups.length === 0`,
  re-run) proves it: this case and the amended 3.114 test are the only two that redden. —
  (`packages/app-core/test/views/board.test.tsx`)

## Task 7 fix round — Ruling 19: the R6 sentence must be gated on the board BEFORE narrowing (found in review, 2026-09-16)

**Case `13.467` minted here**, continuing directly from `13.466`. A cross-task interaction neither Task 4
(client-side board narrowing) nor this task's own R6 caught on its own: `page.tsx:1063` hands `<Board>`
`boardNarrowing.view`, the POST-FILTER groups, never `board.data` directly (Ruling 1, Task 4). Task 4's
narrowing drops CARDS only — never a column or a group (`board.tsx:216-219`'s own invariant) — so pre-R6
this was harmless: the old gate read `board.groups.length`, which a card filter never touches, so the
narrowed-to-zero state could never reach it. R6's `totalCards` fold reads exactly the narrowed cards,
so without a fix a search matching nothing rendered `EMPTY_BOARD_COPY` — "No tickets here yet — create
one." — over a project holding real tickets, one row beneath a strip reading "0 of 10 shown" with a
removable chip: the page contradicting itself on one screen, and "create one" naming the wrong remedy
(the fix is clearing the filter sitting right there, not creating a ticket).

**Fix: `Board` gains an optional `isNarrowed?: boolean` prop** (`BoardProps`, following `onCreateTicket`'s
own precedent immediately above it — a mount with nothing to say passes nothing, and `Board` behaves
exactly as before this prop existed). `emptyBanner`'s gate becomes `totalCards === 0 && isNarrowed !==
true`. `page.tsx` passes `isNarrowed={boardNarrowing.shown !== boardNarrowing.total}` — the SAME
expression `shouldRenderBoardNarrowingStrip` already reads as one of its three terms, not a second
definition of "narrowed"; since narrowing drops cards only, `shown !== total` is true exactly when real
cards exist but were filtered away, and by construction `shown === total === 0` whenever the board is
genuinely, unfilteredly empty — so the flag never suppresses R6's real case. `EMPTY_BOARD_COPY`'s text is
unchanged; this changes WHEN it shows, never what it says.

**Deliberately NOT changed, per the ruling itself**: the per-column `EMPTY_COLUMN_COPY` shown under a
filter, where the column may hold hidden tickets. The reviewer judged that copy neutral (it names no
reason, per its own docblock) and approved it deliberately in Task 7's review; not overruled mid-task,
recorded for final review instead.

**Witness, same discipline as R6's own**: committed the real work first, then reverted `emptyBanner`'s
condition from `totalCards === 0 && isNarrowed !== true` back to `totalCards === 0` alone (a targeted
`Edit`, never `git checkout --`) and re-ran `board.test.tsx`. Confirmed the narrowed-to-zero case (the
first `it` below) reddens while the R6 case (13.466, not narrowed) and the "not narrowed" arms of this
same case stay green — proving `isNarrowed` and only `isNarrowed` discriminates the two. Restored; `git
diff --stat HEAD` empty, full suite green again.

**Standing instruction now in force (coordinator, this round): every report must carry `tsc` output for
every package touched.** `packages/ui`'s typecheck, red since `8eb40607` (Task 6 fix round 2) on two
`noUncheckedIndexedAccess` errors in `test/components.test.tsx`, was fixed in a concurrent commit
(`ddc42c21`, "Task 6 fix round 3") by another implementer on this same branch while this fix round was in
progress — confirmed by re-running `tsc -p tsconfig.typecheck.json` in `packages/ui` twice, both exit 0,
rather than assumed from the earlier report's stash-verified baseline.

- **13.467** ✅ `isNarrowed` suppresses `EMPTY_BOARD_COPY` on a board narrowed to zero cards (the rail and
  per-column empty states still render, `EMPTY_COLUMN_COPY` unaffected — the same fixture proves both:
  `isNarrowed` true suppresses, `isNarrowed` false OR omitted on the IDENTICAL fixture still shows the
  sentence, isolating the flag as the one variable that discriminates. Mutation-witnessed: reverting the
  `&& isNarrowed !== true` guard reddens this case's first `it` while 13.466 and this case's other two
  `it`s stay green. — (`packages/app-core/src/views/board.tsx`, `packages/app-core/test/views/board.test.tsx`,
  `apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx`)

## Task 8 — the workflow picker, defaulting to All workflows (Ruling R3, 2026-09-16)

**Cases `13.468`–`13.471` minted here**, continuing directly from `13.467` (verified against the real
case list via `scripts/check-case-ids.mjs`, not the file's own "next free" prose, which the script's own
self-test proves can false-hit on a truncated id — the sweep run before this task started found `13.632`
and `13.999` as apparent hits that were actually a truncation of `13.632866`/`13.9999`, two example ids
inside this file's own prose about the script's regex, three sections up). The picker narrows the board
by dropping a whole GROUP — `matchesBoardCard` (`board-filter.ts`) takes a `card`/`column`/`projectId`
and a `BoardFilterSpec`, with no group anywhere in that signature, so no axis this file's own chip
builder enumerates could ever name this mechanism. `boardNarrowing` (`page.tsx`, Task 4's "ONE PASS"
fold) widens to fold BOTH mechanisms into the SAME `shown`/`total` pair rather than gaining a second,
parallel count: `total` sums every card in every group, including ones the workflow picker drops;
`shown` counts only cards that are both in a KEPT group and pass `matchesBoardCard`.
`shouldRenderBoardNarrowingStrip`'s third term (`shown !== total`, `board-search-scope.ts`) was written
for exactly this case in Task 4's own review — before this task nothing could make it true while
`activeFilterChips` stayed empty, so the wiring was verified by reading the code, not by a test that
reaches it through real narrowing data. `13.470` is that test, and the wiring was
MUTATION-WITNESSED, not merely asserted: the gate's own call was temporarily changed from
`shown: boardNarrowing.shown` to `shown: boardNarrowing.total` (defeating only the third term), `13.470`
and `13.471` reddened while every other case in the file — including `13.468`, which does not depend on
the gate firing — stayed green, and the change was reverted and the suite re-run clean.

The picker's own chip is built separately from `buildBoardFilterChips` (which enumerates `boardFilter`'s
six fields and cannot be extended to a seventh it structurally has no data for) and merged with
`activeFilterChips` ONLY at the render site (`narrowingChips`, `page.tsx`) — the gate's own `chipCount`
argument deliberately keeps reading `activeFilterChips.length` alone, since the third term already covers
group-dropping and double-counting the workflow chip there would not change the gate's answer, only
obscure which term does the work.

**The single-workflow decision (`13.469`).** A project with exactly one workflow offers no real choice
between "All workflows" and that one workflow's name — both render the identical board. The picker is
gated on `board.data.groups.length > 1`, mirroring `Board`'s OWN identical judgment for its group heading
(`board.tsx`: `board.groups.length > 1 ? <h3 className="gn-board__workflow">`). Deliberately reads
`board.data.groups` (the full, unfiltered set), never `boardNarrowing.view.groups` — the latter is
already narrowed BY the picker, so once a workflow is picked it holds only the one surviving group, and
gating against it would unmount the very control that let a person pick it.

**Interaction with Task 7's `isNarrowed` (Ruling 19) — checked, not assumed.** Picking a workflow whose
own group holds zero cards makes `boardNarrowing.shown === 0` while `boardNarrowing.total > 0` (the OTHER
workflow's cards), so `isNarrowed` is `true` and `Board`'s `EMPTY_BOARD_COPY` — "create one" — is
suppressed exactly as it is for a card-level filter that empties the view. The per-column
`EMPTY_COLUMN_COPY` and its own "Add a ticket" button still render (unaffected by `isNarrowed`, per
`Board`'s own docblock), and the narrowing strip reads "0 of N shown" with the removable workflow chip.
Judged CORRECT, matching Ruling 19's own reasoning exactly: the remedy for an empty picked workflow is
the chip sitting in the strip, not a project-wide "create a ticket" prompt naming the wrong fix. Not
separately case-numbered — no new branch exists to test; the SAME `isNarrowed` expression Task 7 already
built and case `13.467` already covers is what fires here, over data this task's own fixtures did not
happen to construct.

- **13.468** ✅ The picker defaults to `'all'`, so every group renders, no card is dropped, and the
  disclosure strip this mechanism shares with the client filter (`13.438`'s own rule) stays absent at the
  resting state. — (`apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx`,
  `apps/web/test/board-narrowing.test.tsx`)
- **13.469** ✅ The picker renders no `<select>` at all for a project with exactly one workflow —
  mirroring `Board`'s own group-heading gate, cross-confirmed by asserting the heading is absent too. —
  (`apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx`, `apps/web/test/board-narrowing.test.tsx`)
- **13.470** ✅ THE DEFERRED TASK 4 TEST, by name: reaches `shouldRenderBoardNarrowingStrip`'s third term
  through real group-dropping data. Picking a workflow narrows the board to that group's own cards, reads
  an honest `N of M shown` against the PROJECT's whole total (not the surviving group's), and shows a
  removable chip naming the hidden workflow — the surviving cards are asserted BY NAME, not only by
  count, and the dropped group's own heading is asserted absent. Mutation-witnessed: hardcoding the
  gate's `shown` argument to equal `total` reddens this case (and `13.471`) while every other case in the
  file stays green. — (`apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx`,
  `apps/web/test/board-narrowing.test.tsx`)
- **13.471** ✅ Removing the workflow chip restores every group, resets the picker to `'all'`, and the
  strip disappears entirely — the same rule `13.438` pins for the card-level filter, proven here for the
  group-level one. — (`apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx`,
  `apps/web/test/board-narrowing.test.tsx`)

## Task 8 fix round — Ruling 20, 2026-09-16

**Cases `13.472`–`13.473` minted here**, continuing directly from `13.471` (verified against
`scripts/check-case-ids.mjs`'s real sweep, not a naive grep — see the false-hit note in the section
above). Two closures the coordinator required after reviewing Task 8's own report.

**Ruling 20(a) — the deferred fixture, taken up on the report's own offer.** The Task 8 report verified
the empty-picked-workflow / `isNarrowed` interaction by COMPOSITION: `isNarrowed={boardNarrowing.shown
!== boardNarrowing.total}` (`page.tsx`) and `Board`'s own gate (`totalCards === 0 && isNarrowed !==
true`, `board.tsx`) are both unchanged by Task 8, and case `13.467` already proves the second half while
`13.470` already proves the picker drives the first. The coordinator's reasoning for still wanting it
run: this session already carries two instances of a path that was reasoned about correctly and still
hid something when it finally executed (the board scope-note JSX shipping unexercised through two tasks;
`rule()`'s `string | undefined` sitting latent in a shared helper until one new call site used the value
as a plain string). "Composition proves the pieces; it does not run them together." `13.472` is that run,
mutation-witnessed: hardcoding `<Board isNarrowed={false}>` (defeating only the suppression) reddens
`13.472` alone — every other case in the file, `13.473` included, stays green.

**Ruling 20(b) — an unresolvable picked workflow falls back to `All`.** The Task 8 report's own second
concern: if the picked workflow's group disappears from `board.data` mid-session (reassigned or detached
elsewhere, page left open), `workflowFilter` keeps naming an id nothing in `board.data.groups` matches
any more. Recoverable (remove the chip), but until then the page would assert a phantom as real — the
chip's own label falls back to `group?.workflowName ?? workflowFilter`, and with no group to find that
prints the RAW INTERNAL ID as if it were a real, chosen narrowing, on a project that may hold tickets
(`boardNarrowing`'s own `total`) the person can no longer see any trace of. Fixed with
`resolvedWorkflowFilter` (`page.tsx`) — a plain, unmemoized `const`, recomputed every render from
`workflowFilter` and the CURRENT `board.data`, falling back to `'all'` when the picked id matches no
group; every consumer that narrows or displays by workflow (`boardNarrowing`'s `keepGroup`,
`workflowChip`, the `<select>`'s own `value`) reads THIS, never raw `workflowFilter`, except the
`<select>`'s `onChange`, which only ever WRITES a value drawn from the current option list and is
therefore always valid when written. `13.473` is the case, exercised through a REAL mid-session update —
`rerender` with a new `Providers services={…}` whose `getBoard` no longer carries the picked workflow,
keeping the SAME `ProjectPage` instance mounted so `workflowFilter`'s own state survives the change; this
is not a simulated shortcut but the same effect-dependency path (`useLiveQuery`'s first effect keys on
`source` identity) a real workspace-stream event drives in production, confirmed by reading
`use-live-query.ts`'s own two effects before relying on it. Mutation-witnessed: collapsing
`resolvedWorkflowFilter` to raw `workflowFilter` reddens `13.473` alone — all thirteen other cases in the
file, `13.472` included, stay green.

`packages/app-core/src/index.ts` also gains `EMPTY_COLUMN_COPY` in its public re-export, alongside
`EMPTY_BOARD_COPY` — `13.472` is the first `apps/web` case that needs it, for the identical reason
`EMPTY_BOARD_COPY`'s own docblock already gives (assert the SAME string that renders, never a re-typed
copy of it).

- **13.472** ✅ Picking a workflow whose own group holds zero cards, on a project whose OTHER workflow
  holds real tickets: `EMPTY_BOARD_COPY` is absent (R19's remedy is the chip, not "create one"), the
  strip reads an honest `0 of 2 shown` against the project's whole total, the removable chip names the
  picked workflow, and the rail still draws both of the picked group's columns with their own
  `EMPTY_COLUMN_COPY`. Mutation-witnessed: `isNarrowed={false}` reddens only this case. —
  (`apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx`, `apps/web/test/board-narrowing.test.tsx`,
  `packages/app-core/src/index.ts`)
- **13.473** ✅ A picked workflow that drops out of `board.data` via a real mid-session re-fetch (`rerender`
  with new `Providers services`, the SAME `ProjectPage` instance) falls back to the picker's own `'all'`
  default — no phantom chip naming a raw internal id, no strip at all, every surviving group's cards
  shown. Mutation-witnessed: collapsing `resolvedWorkflowFilter` to raw `workflowFilter` reddens only
  this case. — (`apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx`,
  `apps/web/test/board-narrowing.test.tsx`)

## Task 11: Timeline restyle — geometry only, 2026-09-16

**Case `13.474` minted here**, continuing directly from `13.473` (verified against `scripts/
check-case-ids.mjs`'s real sweep — max ordinal in this file's own `13.` pool is `13.473`, matching the
dispatching agent's own count — never the file's own "next free" prose, per the false-hit note two
sections up). Pure geometry over the metrics spec's Timeline table (`:506-538`), on selectors this task
already owns end to end (`.gn-timeline*`) — no shared-surface question of the kind Task 9 hit, since
`TimelineView` renders its own markup rather than a shared component. No new token role: `trayBg`/
`trayShadow` → `--gn-surface-sunken`/`--gn-shadow-sunken` (the same pair the board's own column trays,
Task 6, already use for identical prototype vocabulary) and `fill4` → `--gn-fill-quaternary`, both
already declared and already consumed elsewhere in `ui.css`. The bar's `accent` ground / `accentText`
text is UNCHANGED — it already used the pair `.gn-filters__chip[aria-pressed='true']` settled during
this port's own Filters-sheet task over the plan's literal `--onColor` → `--gn-text-inverted` mapping,
because `CONTRAST_PAIRS` (`tokens.ts`) measures `accentText` against `accent` and never measures
`textInverted` there — so nothing about the bar's colour changed here, only its box.

**Two pinned literals updated, both sanctioned by the tests' own docblocks rather than loosened.**
`test/timeline/timeline-view.test.tsx` (11.82, "the window width is the model's, stated once") pins the
component's published `--timeline-week-columns` value by EXACT equality (two cases: the default-eight
window and a `weeksCount:2` forward) and, separately, an EXACT substring of `ui.css` itself
(`` `grid-template-columns: 12rem var(${published[0]});` ``) whose own comment reads *"a change to the
width alone will redden this too, and re-reading this comment is the intended cost."* Both paid here:
the leading (title) track widens from Plan 9's `12rem` to the spec's `230px` (`14.375rem` — this repo's
existing rem idiom, 1rem = 16px), and the published track-list value changes from `repeat(n, 1fr)` to
`repeat(n, minmax(0, 1fr))` — the spec's own literal for this row ("`repeat(8,minmax(0,1fr))`"), and not
merely a spec transcription: a bare `1fr` track carries CSS Grid's implicit automatic minimum of `auto`
(min-content), so without `minmax(0, …)` a long bar or title could still push a week column wider than
its share and defeat `.gn-timeline__bar`'s own `overflow:hidden; text-overflow:ellipsis`. Both the
component (`timeline-view.tsx`) and the three affected assertions in `timeline-view.test.tsx` were
updated together; the test's own regex guard against the WRAPPED form
(`expect(css).not.toMatch(/repeat\(\s*var\(--timeline-/)`) is unaffected — `ui.css` still never wraps the
var in `repeat()`, only the component's own published STRING contains the function now. The `+2` column
arithmetic the `12rem` comment protects depends on there being exactly ONE leading track, not its width,
and that count is unchanged.

**Zebra uses `:nth-of-type`, not `:nth-child`, and this was checked rather than assumed.** Each row's
siblings inside `.gn-timeline__group` include the group's own `<h3 class="gn-timeline__group-heading">`
ahead of the rows; `:nth-child(odd)` would count that heading as sibling #1 and shift every row's parity
by one, so a group's FIRST row would render unshaded. Read `timeline-view.tsx` to confirm every sibling
`<div>` inside a group is in fact a `.gn-timeline__row` (the heading is the only non-div sibling), which
is what makes `:nth-of-type` — same-tag-name counting only — the correct fix rather than a coincidental
one.

**Row height is a floor, not a match.** `min-height: 2.625rem` (42px) sets the metric's own number, but
`.gn-timeline__bar` carries `margin: 0.3125rem 0.1875rem` (5px top and bottom) inside the row, and
`.gn-timeline__title` carries its own `padding: 0.25rem` — a row whose content needs more than 42px
(the bar's 16px line-height plus its 10px of vertical margin already totals 26px before the title's own
padding) renders taller than 42px rather than clipping to it, which is the correct behaviour for a floor
but is worth naming since the prototype's own 42px may read as a fixed height rather than a minimum.

**The two load-bearing checks named in this task's brief, both re-verified rather than assumed clean.**
(1) `timeline-view.test.tsx:396-441`'s per-reason side-list modifier classes
(`gn-timeline__side-entry--no-dates`/`--start-only`/`--due-only`/`--start-after-due`/`--unplaceable-day`)
are untouched by this task — no selector renamed, no modifier collapsed — and the case they anchor
(11.77) still passes; this task never rendered a side-list fixture at all, so nothing here could have
reached that code. (2) `packages/app-core/test/inbox/inbox-css-binding.test.tsx` references
`.gn-timeline__bar` in exactly three places, and reading them shows why the reference is inert to this
task: all three are FIXTURE STRINGS inside the inbox scanner's own self-test, proving the `gn-inbox`
prefix matcher is not fooled by a different prefix (`.gn-timeline__bar { color: blue; }` as planted CSS,
a rendered `<span class="gn-inbox__glyph gn-timeline__bar">` as a planted DOM tree, and
`.gn-timeline__bar[data-pending] { outline: 1px dashed red; }` as a planted attribute-selector rule) —
none of the three reads the REAL `ui.css` or the REAL `TimelineView`. The gate is a NEGATIVE control on a
literal string, not a binding assertion on this component; it passed before this task's edits and after,
unchanged (`inbox-css-binding.test.tsx`'s own suite: 8/8).

`tsc --noEmit` clean on `packages/app-core` and `packages/ui` (Node v22.23.2). `pnpm exec vitest run` on
`packages/app-core` (1227/1227) and `packages/ui` (308/308); `pnpm turbo run test` at the repo root
confirmed `apps/web`'s `test/project-calendar-timeline.test.tsx` (queries `.gn-calendar`/`.gn-timeline`/
`.gn-board` existence — Test impact table's own instruction to re-verify, not assume) still passes
against the rebuilt `dist/` app-core consumes. `packages/ui/test/token-discipline.test.ts` and
`tokens.test.ts` re-run directly (not from cache): clean, no colour literal, every new `var(--gn-…)`
declared. **No live cross-style/cross-theme visual check was performed** — the spec's own Verification
section calls for one ("A live read of the board, list, calendar and timeline in all three styles × both
themes") and it is named here as a gap for whoever reviews this before merge, not silently skipped.

- **13.474** 🟡 The timeline restyles to the prototype's metrics: 230px title column + `trayBg`/
  `trayShadow` header grid, `minmax(0, 1fr)` week tracks, 42px zebra rows, a 6px-radius `accent`/
  `accentText` bar (still `0` on the clipped side only), and a `trayBg`/`trayShadow` undrawn footer.
  **Covered:** the three literals `timeline-view.test.tsx` pins by exact equality/substring
  (`--timeline-week-columns`'s two values, the `ui.css` leading-track string), re-run and green after
  each edit; the untouched 11.77 modifier-class case and the `inbox-css-binding` self-test, both re-run
  unchanged. **NOT covered:** every other geometry value in the table above (padding, margin, radius,
  min-height, colours as rendered) — jsdom computes no layout, so nothing here mechanically asserts a
  pixel. `🧪` is not used because that marker means a hand reproduction was actually performed
  (this file's own legend), and no live render, in any style or theme, was — corrected from an initial
  `🧪` marking that overstated what had been checked. Marked `🟡` pending that render, matching `13.475`'s
  own honesty about what a suite-and-`tsc` pass does and does not prove for a pure restyle. **This bullet
  as originally written was also incomplete against the SPEC, not merely unverified by eye: the spec's
  Timeline table's "Row title" row was missing from what shipped, because the plan's own condensed prose
  had dropped it before it ever reached this task's brief — see Ruling 22, `13.477`, immediately below.**
  — (`packages/app-core/src/timeline/timeline-view.tsx`, `packages/app-core/test/timeline/
  timeline-view.test.tsx`, `packages/ui/src/ui.css`)

## Ruling 22 (coordinator, 2026-09-16) — the plan dropped a Timeline row; the spec still had it

**Case `13.477` minted here**, continuing directly from `13.476` (verified against
`scripts/check-case-ids.mjs`'s real sweep). The spec's Timeline metrics table
(`docs/superpowers/specs/2026-09-16-board-prototype-port-design.md:365-376`) has EIGHT rows; the plan's
own Task 11 section condensed that table into a single prose sentence naming only six, dropping "Header
cell" (implemented anyway, from the spec directly) and "Row title" (not implemented — nothing named it).
`task-brief` extracts the task section verbatim, so the loss was inherited silently: `grep "Row title"`
returns zero hits in the plan and zero in the Task 11 brief, against one in the spec. The coordinator
verified this directly before ruling, rather than taking the report's "every metric in its brief" framing
as sufficient — true of the brief, not of the spec the plan itself says wins on disagreement.

**The missing row:** `| Row title | padding 6px 12px; 15px/20px; ellipsis; nowrap |`. Landed on
`.gn-timeline__title` — previously `padding: 0.25rem; min-width: 0;` (4px all round, no type at all) —
now `padding: 0.375rem 0.75rem; min-width: 0; font-size: 0.9375rem; line-height: 1.25rem;`. `min-width: 0`
is kept though it names no metric: it is load-bearing for `.gn-timeline__title-text`'s own
`overflow:hidden; text-overflow:ellipsis; white-space:nowrap` (unchanged, already correct before this
ruling) to truncate inside a grid item rather than push the column wide. No token role involved — both
new values are plain length/type literals, matching how every other spacing/size value in this file is
written.

**Checked row by row against the CURRENT tree, not assumed clean from memory, per the coordinator's own
ask ("tell me if anything else is missing").** All other seven Timeline metric rows read directly against
`packages/ui/src/ui.css` after Ruling 22's own edit: Header grid (`.gn-timeline__weeks`), Header cell
(`.gn-timeline__week`), Row (`.gn-timeline__row`), Bar (`.gn-timeline__bar`), Bar-clipped
(`[data-clipped-start]`/`[data-clipped-end]`), Undrawn footer (`.gn-timeline__side`), and Undrawn copy
(`.gn-timeline__side-copy`) all match their spec row exactly. Nothing else is missing.

**Not a finding, explicitly cleared by the coordinator and left alone:** `.gn-timeline__bar`'s
`border-radius: 0.375rem` (6px) is a literal, not a token — `RADIUS_ROLES` is only `card` (16/20px) and
`control` (8/14px), neither near 6px, so this is a literal-to-literal change from the pre-existing 4px,
not a Ruling-17-shaped token→literal regression.

**A stale self-citation was also fixed in this commit, unrelated to the missing row:** a comment at
`ui.css` (immediately above `.gn-timeline__weeks,` `.gn-timeline__row`) cited
`` `.gn-filters__chip[aria-pressed='true']` `` at `:3224-3227` — correct when Ruling 21's own commit was
written, but Ruling 21's ~67-line insertion earlier in the same file moved the real rule to `:3306-3309`.
Re-grepped and corrected.

Full `packages/ui` (308/308) and `packages/app-core` (1227/1227) suites green; `packages/ui/test/
token-discipline.test.ts`/`tokens.test.ts` re-run directly (not cached): clean. `tsc --noEmit` clean on
both packages (Node v22.23.2). `pnpm turbo run test` at the repo root, run on the true final tree rather
than a pre-Ruling-21 snapshot: **all 17 tasks green, `apps/server` included (149/149)** — the `apps/server`
failures earlier this session (a different pair each of three prior runs) are now confirmed as
environmental flakes rather than anything this work touched, since the identical suite is clean here with
no `apps/server` changes at all.

- **13.477** ❌ The Timeline's "Row title" metric (`padding 6px 12px; 15px/20px`, the spec table's fourth
  row, dropped by the plan before reaching this task's brief) lands on `.gn-timeline__title`. All eight
  Timeline spec rows re-checked row by row against the shipped CSS and confirmed matching. Not verified
  by a live render in any style or theme. — (`packages/ui/src/ui.css`) — uncited on 2026-09-18: no test found; was ✅ on owner/workspace-edits d958ab8f. `timeline-view.test.tsx` uses `.gn-timeline__title` only for DOM structure (`closest()`), never for its padding, and no test reads that rule out of `ui.css`.

## Task 9: List restyle — geometry only, ONE ruling deferred, 2026-09-16

**Case `13.475` minted here**, continuing directly from `13.474` (verified against
`scripts/check-case-ids.mjs`'s real sweep, run again after Task 11's own addition — not the file's own
"next free" prose, per the false-hit note recorded three sections up). Landed on `.gn-list-*` selectors
only, per the task's own Step 1 ("`.gn-table` and `.gn-select` are shared surfaces — do not edit them"):
a new `.gn-list__table-wrap` wraps `<Table>` (`ticket-list.tsx`'s `ListTable`, `@gisik-nokma/ui`'s shared
component) FROM THE OUTSIDE, giving the metrics table's "Container" row (`cardBg + cardShadow; radius
cardR; overflow:auto`) without adding or changing any rule `Table` itself renders through
(`.gn-table__scroll`, `.gn-table`). `cardBg`/`cardShadow`/`cardR` → `--gn-surface-raised`/
`--gn-shadow-raised`/`--gn-radius-card` — not a new triple, but the SAME three roles the shared `.gn-card`
rule (`ui.css:160-165`, unedited) already pairs, confirmed by reading it rather than assumed. The
Group-by/Columns picker's `<summary>` becomes a pill (`min-height:36px; padding:0 12px; radius 999px;
cardBg + cardShadow; 13px`), its `999px` a plain corner-radius literal — lengths are not what
`token-discipline.test.ts` bans, and `radiusVariableName` names only `card`/`control` roles, so a pill
radius has never been tokenised anywhere in this file, `.gn-chip`'s own identical literal included
(`ui.css:113`). Its checkboxes are sized to the metric's 18px tick box via `accent-color: var(--gn-accent)`
— the FIRST use of that property in `ui.css`, checked by grep before writing the justifying comment, not
assumed. The collapse caret (`.gn-list__collapse`) gets a real `min-width`/`min-height: 22px` tap target
around its glyph (previously sized only to the glyph's own intrinsic box); the title button
(`.gn-list__open`) goes to 17px/22px.

**The depth-based title indentation's FORMULA changes; its TOTAL does not become pixel-exact, and this
distinction is the whole reason Task 9 could not simply "restyle the title cell."** The metric reads
`padding:12px 16px 12px calc(16px + depth*22px)`, applying to the `<td>` (`.gn-table__cell`) itself. This
task cannot zero out that shared cell's own `padding: 0.45rem 0.6rem` (the do-not-edit rule again), so the
depth term is applied where it already lived — a `paddingLeft` INLINE STYLE on the inner
`.gn-list__title-cell` span, ADDED ON TOP OF the cell's own padding rather than replacing it — with its
FORMULA corrected from the old, ungrounded `depth * 1.1rem` to the metric's own `16 + depth * 22` (in px,
computed in JS since `depth` is a render-time number, not a CSS `calc()`). The rendered offset is
therefore the metric's indentation LOGIC, layered on a base this task cannot remove — not the metric's
exact total. Recorded rather than left implicit, so a reviewer measuring pixels against the metrics table
does not read this as a shipped miss.

**DECLARED DIVERGENCE, not a match: "Group header row."** The metric (`padding 11px 16px; trayBg +
trayShadow`) is applied to `.gn-list__section-title`, the existing per-group `<h3>` that sits OUTSIDE the
table — the closest restyle available without rebuilding the grouping shape this task's own brief holds
fixed ("Keep the Group-by / Columns wiring untouched... this is a restyle, not a rewiring"). The prototype
draws this as a `<tr>` spanning the table's own columns; this product's architecture already renders one
grouping's rows as a SEPARATE `<table>` per section (`apps/web/test/list-prefs-wiring.test.tsx` proves the
wiring this shape depends on), so there is no in-table row to restyle. `trayBg`/`trayShadow` →
`--gn-surface-sunken`/`--gn-shadow-sunken`, the same pair Task 11's `.gn-timeline__weeks` uses for
identical prototype vocabulary — cited forward at the time it was written, confirmed still true by
re-reading `ui.css` after both tasks landed.

**FIVE metrics NOT implemented — a stop-and-report, not a silent gap, and named by the task's own brief
before this task started.** "Table: min-width:820px", "Header cell" (13px/18px/600/label2/trayBg/padding/
nowrap), "Zebra" (odd rows `fill4`), "Data cell" (padding/15px/nowrap), and the title cell's own
`min-width:260px` are each reachable only by putting a class on an element `Table` (`@gisik-nokma/ui`)
renders ITSELF — `<table>`, `<th>`, `<td>`, `<tr>` — confirmed by reading `table.tsx`: no `className` prop
on the root, no per-column class hook on `TableColumn`, unlike `Card` (`card.tsx:7`,
`['gn-card', className].filter(Boolean).join(' ')`), which is exactly the shape that would fix this. Two
alternatives were considered and both rejected on this task's own authority: (1) a descendant-scoped
override such as `.gn-list__table-wrap .gn-table__header {…}` still NAMES `.gn-table__header` in a
selector `grep '\.gn-table'` would find, which is precisely what the shared-surface doctrine exists to
keep out of reach from outside the component; (2) inventing a way to zero the shared cell's padding and
restate it on an inner wrapper (as was done for the title cell's indentation ALONE) cannot reach `<table>`'s
own `min-width` or `<tr>`'s own zebra at all, since neither has an inner wrapper this task controls. **A
ruling request, recorded here rather than landed:** extend `Table`'s props the same way `Card` already is
— optional `className` on `<table>`, `headerClassName`, `rowClassName`, `TableColumn.cellClassName` — so
every rule these five metrics need could be written on a `.gn-list-*` selector alone, with `.gn-table`'s
own rule untouched for `Table`'s one other repo-wide consumer today: none (`<Table` greps to exactly the
one call site in `ticket-list.tsx`, confirmed before writing this). Not built on this task's own
authority: the port's own global constraints name this precise trap for Task 9 by number ("if a list
metric seems reachable only by editing `.gn-table`, stop and report rather than editing"), and eight
implementers on this plan have been right to stop and report before this task.

**The visible result is a mixed one — a finished frame around an unfinished interior — and this is
recorded so a screenshot is not mistaken for the whole job.** A rounded, shadowed card now surrounds a
header row, zebra pattern, and data cells that still render at `Table`'s original, unrestyled metrics.

`apps/web/test/list-prefs-wiring.test.tsx` — the Group-by/Columns wiring this task was told to leave
alone — re-run unchanged, both before and after, 2/2. `packages/app-core/test/views/ticket-list.test.tsx`
37/37. Full `packages/app-core` (1227/1227) and `packages/ui` (308/308) suites green;
`packages/ui/test/token-discipline.test.ts`/`tokens.test.ts` re-run directly (not cached): clean, no
colour literal, every `var(--gn-…)` this task added (`--gn-surface-raised`, `--gn-shadow-raised`,
`--gn-radius-card`, `--gn-surface-sunken`, `--gn-shadow-sunken`, `--gn-accent`) already declared in
`TOKEN_ROLES`/`radiusVariableName`. `pnpm turbo run test` at the repo root: `apps/web` 363/363 against the
rebuilt `dist/` app-core consumes. `tsc --noEmit` clean on `packages/app-core` and `packages/ui` (Node
v22.23.2). **No live cross-style/cross-theme visual check was performed**, the same open item Task 11
carries — named here rather than silently skipped.

- **13.475** 🟡 The list restyled PARTIALLY to the prototype's metrics as of Task 9's own commit: the
  container frame, the Group-by/Columns picker pill and its 18px tick boxes, the collapse caret's 22px
  tap target, the title button's 17px/22px, and the title cell's corrected depth formula landed; the
  table's own min-width, header cell, zebra, and data-cell padding did not — each reachable only through
  the shared `Table` component's own `<table>`/`<th>`/`<td>`/`<tr>`, which had no class hook, and a ruling
  request (extend `Table` the way `Card` already is) was recorded rather than acted on. Group-by/Columns
  wiring re-verified unchanged (`list-prefs-wiring.test.tsx`, 2/2). **The ruling request was approved
  (Ruling 21) and the remaining five metrics landed — see `13.476` immediately below.** Still not
  verified by a live render in any style or theme. — (`packages/app-core/src/views/ticket-list.tsx`,
  `packages/ui/src/ui.css`)

## Ruling 21 (coordinator, 2026-09-16) — `Table` gains class hooks, the five deferred List metrics land

**Case `13.476` minted here**, continuing directly from `13.475` (verified against
`scripts/check-case-ids.mjs`'s real sweep, run again after this section's own addition). The coordinator
verified the report's premise independently before ruling — `Table` has exactly one PRODUCTION consumer
repo-wide (`ticket-list.tsx`) plus its own test (`packages/ui/test/components.test.tsx`) — and approved
extending `Table` (`packages/ui/src/components/table.tsx`) with four optional props: `className` on
`<table>`, `headerClassName` on `TableColumn` (applied to every `<th>`), `rowClassName` on `<Table>`
(applied to every `<tr>`), and `cellClassName` on `TableColumn` (applied to that column's `<td>`s). All
four compose the way `card.tsx:7` already composes `Card`'s own `className` —
`[own, extra].filter(Boolean).join(' ')`, appending to `gn-table*` rather than replacing it — so a caller
passing nothing (every consumer before this change, and `Table`'s own existing test, which passes none of
the four) gets byte-identical output. Confirmed, not assumed: `components.test.tsx`'s `Table` describe
block (renders headers/cells, asserts a row click fires) re-run unmodified and green.

`ticket-list.tsx`'s `ListTable` now passes `className="gn-list__table"` and `rowClassName="gn-list__table-row"`
to `<Table>`, and `headerClassName: 'gn-list__table-header'` plus a per-column `cellClassName`
(`gn-list__table-cell--title` on the title column, `gn-list__table-cell--data` on every other) on each
`TableColumn`. Every new `ui.css` rule these add is a plain `.gn-list-*` selector — none names
`.gn-table`/`.gn-table__header`/`.gn-table__cell`/`.gn-table__row` — so those four rules (`ui.css:284-288`
and neighbours) are unedited, confirmed by grepping the full diff for any added/removed line that BEGINS
with one of the seven shared do-not-edit selectors (`.gn-card`, `.gn-chip`, `.gn-avatar`, `.gn-table`,
`.gn-select`, `.gn-button`, `.gn-segmented`): zero matches. `.gn-list__table-cell--data`/`--title` win
over `.gn-table__cell`'s own shared `padding: 0.45rem 0.6rem` by the SAME equal-specificity/
later-source-order technique `.gn-board-card` already uses against `.gn-card` (both single-class rules,
`(0,1,0)`, this one later in the file) — not `!important`, not extra specificity.

**The title cell's padding is pixel-exact for the first time.** `.gn-list__table-cell--title` zeroes the
`<td>`'s own left padding and supplies the metric's static top/right/bottom third (`12px 16px 12px`); the
DEPTH-dependent left term (`calc(16px + depth*22px)`) stays exactly where it already was — a per-row
inline `paddingLeft` on the inner `.gn-list__title-cell` span, since `depth` is a fact about one ROW and
`cellClassName` is declared once per COLUMN — but now composes against a zeroed base instead of an
uneditable one, closing the "not pixel-exact" caveat `13.475` recorded.

No new token role: `--gn-text-muted` (label2) and `--gn-surface-sunken` (trayBg) on the header cell are
the SAME pair `.gn-timeline__weeks` already uses (`ui.css:1939-1942`); `--gn-fill-quaternary` (fill4) on
the zebra row is already declared and consumed elsewhere. The two new length-only rules (`min-width:820px`
on `.gn-list__table`, `min-width:260px` on `.gn-list__table-cell--title`) are plain literals — this file
has no length-token axis (`radiusVariableName` names only `card`/`control`), matching how every other
spacing/size value in `ui.css` is written.

Full `packages/ui` (308/308) and `packages/app-core` (1227/1227) suites green; `packages/ui/test/
token-discipline.test.ts`/`tokens.test.ts` re-run directly (not cached): clean. `tsc --noEmit` clean on
both packages (Node v22.23.2). `pnpm turbo run test` at the repo root: `apps/desktop` (3/3),
`apps/web` (363/363) — both rebuilt against the changed `packages/ui`/`packages/app-core` — green;
`apps/server` failed on two DB-dependent tests unrelated to this change (a different pair failed than in
the prior two runs, consistent with a pre-existing environmental flake, not a regression this change
introduced).

- **13.476** ❌ The five metrics `13.475` deferred now land through `Table`'s new optional class hooks:
  `.gn-list__table` (min-width:820px), `.gn-list__table-header` (13px/18px/600/label2/trayBg/padding/
  nowrap, uniform across every column), `.gn-list__table-row:nth-child(odd)` (fill4 zebra), `.gn-list__
  table-cell--data` (12px 16px padding/15px/nowrap), and `.gn-list__table-cell--title` (min-width:260px
  plus the pixel-exact static padding third). `Table`'s own test (`components.test.tsx`) and the seven
  shared do-not-edit selectors confirmed unedited by a full-diff grep. Not verified by a live render in
  any style or theme. — (`packages/ui/src/components/table.tsx`, `packages/ui/src/ui.css`,
  `packages/app-core/src/views/ticket-list.tsx`) — uncited on 2026-09-18: no test found; was ✅ on owner/workspace-edits 9dd3574b. None of its five selectors (`gn-list__table`, `__table-header`, `__table-row:nth-child(odd)`, `__table-cell--data`, `__table-cell--title`) appears in any test file; `ticket-list.test.tsx:1432` names `.gn-list__table-wrap`, a different class.

## Task 12 — the transition gate, as a pure function (board-prototype-port plan, 2026-09-16)

**Cases `13.478`–`13.485` minted here**, continuing directly from `13.477` (verified against the real
case list via `scripts/check-case-ids.mjs`'s real sweep — max ordinal in this file's own `13.` pool is
`13.477` — never the file's own "next free BLOCK" prose at :2415, which an earlier task already found to
be a false hit). Phase 6, Board writes: `moveOutcome(def, fromStateId, toStateId)` is the gate Tasks 13
(move arrows) and 14 (drag-and-drop) both route a proposed move through before anything is submitted. It
ships no UI and derives nothing of its own — built entirely over `transitionOptions`
(`views/transition-dialog.tsx:41-61`), which already predicts the engine's own `find(exact) ?? find('*')`
resolution (`rule-engine/src/transition.ts:91-93`). Fixture: `WF_ERRAND` (`test/helpers/seed.ts`), which
already declares a wildcard edge (`* -> todo`), so the plain wildcard-reachable case needed no second
fixture; two purpose-built definitions cover the precedence and wildcard-carries-rules cases below.

**Mutation-witnessed** (`board-moves.ts` edited in place, `pnpm exec vitest run test/views/
board-moves.test.ts` re-run after each edit, then reverted with a targeted `Edit` — never `git checkout
--`, which has destroyed uncommitted work in this repo before). Replacing the `transitionOptions` call
with a naive re-derivation that scanned `def.transitions` in array order and stopped at the first edge
reaching `toStateId` — ignoring exact-before-wildcard — reddened `13.483` alone; every other case in the
file stayed green. Hardcoding `available: []` on the refused branch reddened all three REFUSED cases —
`13.478`, `13.479`, **and `13.485`** (a first prediction named only the first two and was corrected against
the actual run: `13.485` is a refusal too, off `todo → todo`) — while the five direct/needs-dialog cases,
`13.480`–`13.484`, which never reach that branch, stayed green. Inverting the rules check
(`rules.length === 0` routing to `needs-dialog`, anything else to `direct`) reddened exactly those five —
`13.480`/`13.481`/`13.482`/`13.483`/`13.484`, every direct/needs-dialog case swapping kind — while
`13.478`/`13.479`/`13.485` (the refused cases, unreached by that branch) stayed green.

- **13.478** ✅ Refuses an undeclared target and names the one move that IS available from that state. —
  (`packages/app-core/src/views/board-moves.ts`, `packages/app-core/test/views/board-moves.test.ts`)
- **13.479** ✅ Refusing from a state with THREE declared edges names all three, in `transitionOptions`'
  own order — not merely a non-empty list. — (same files)
- **13.480** ✅ A declared, rules-free edge answers `direct`. — (same files)
- **13.481** ✅ A declared edge carrying `require-comment` answers `needs-dialog`. — (same files)
- **13.482** ✅ A target reachable ONLY through the wildcard edge (no exact edge exists to it) still
  answers `direct`, off the wildcard edge's own (empty) rules. — (same files)
- **13.483** ✅ Wildcard declared FIRST and carrying rules, exact declared SECOND and rules-free, both
  reaching the SAME target: the exact edge's rules win — `direct`, matching the engine's `find(exact) ??
  find('*')` regardless of array order. This is ruling P27's own concern one level up, and the case the
  re-derivation mutation above reddens alone. — (same files)
- **13.484** ✅ A wildcard-only edge that DOES carry rules answers `needs-dialog`, on a purpose-built
  definition with a `flagged` state reachable only by `* -> flagged`. — (same files)
- **13.485** ✅ A move back onto the current state refuses like any other undeclared move —
  `transitionOptions` already excludes `to === fromStateId`, even against a wildcard edge that would
  otherwise reach it. Asserts both `kind: 'refused'` and `available: ['doing']`; the mutation above
  kills it on the `available` half — self-exclusion itself (the `kind`) is pinned by
  `transitionOptions`'s own tests in `transition-dialog.test.tsx`, not mutated here. — (same files)

`tsc -p tsconfig.typecheck.json` clean on `packages/app-core` (Node v22.23.2, `pnpm exec vitest run
test/views/board-moves.test.ts`: 8/8 green). `node scripts/check-case-ids.mjs` re-run after minting:
duplicate list unchanged at `13.387`/`13.413` only.

## Task 12, Ruling 25 — `moveOutcome` must not answer differently from the dialog it opens

**Cases `13.486`–`13.487` minted here**, continuing directly from `13.485` (verified against the real
case list via `scripts/check-case-ids.mjs`'s real sweep). Same-day coordinator ruling on Task 12's own
concern 2: `TransitionDialog` skips an already-claimed `require-field` input
(`transition-dialog.tsx:183`/`:257`, calling the shared `fieldAlreadyClaimed` predicate —
extracted since this ruling to `field-claims.ts:55`, see below), but `moveOutcome` never received
`ticketFields` and always answered `needs-dialog` for any `require-field` rule — the exact fork Task 12's
own docblock warned `transitionOptions` against, arriving from the other side: two places deriving "does
this field still need asking" and free to disagree.

**Fixed by extraction, not by a third re-derivation.** `fieldAlreadyClaimed(ticketFields, field)`
(`packages/app-core/src/views/field-claims.ts`, new) is the ONE predicate now read by both
`TransitionDialog` (its `missingFields` filter and its required-field render gate) and `moveOutcome`
(its `unmet` filter). `moveOutcome` gained a fourth parameter, `ticketFields: Record<string, FieldClaim>`;
a declared edge is `direct` only once every `require-field` rule on it reads satisfied through that
predicate, and `needs-dialog` otherwise. `require-comment`/`require-evidence` are unaffected — neither has
an "already satisfied" reading before a submission exists, so either still always answers `needs-dialog`.
`restrict-to`/`require-different-user`-only edges still always answer `needs-dialog` too — recorded this
time as a DELIBERATE choice (Ruling 25), considered and rejected routing to `direct`, not the same shape
of gap `require-field` was.

**Regression proof, not just new coverage.** The full `transition-dialog.test.tsx` suite (21/21) was
re-run after refactoring the dialog onto the shared predicate — unchanged and green, confirming the
extraction changed nothing about the dialog's own behaviour, only where the check lives. The full
`packages/app-core` suite (82 files, 1239 tests) was re-run too: green.

**Mutation-witnessed** (`board-moves.ts`'s `unmet` filter edited to treat every `require-field` rule as
always unmet — `ticketFields` read but not applied — re-run, then reverted with a targeted `Edit`,
`git diff --stat` confirmed empty after). Prediction, written before running: reddens `13.486` alone;
`13.487` and all eight `13.478`–`13.485` cases stay green. Result matched exactly — 9/10 green, `13.486`
failed with `expected { kind: 'direct', toStateId: 'doing' }` and received `{ kind: 'needs-dialog', toStateId:
'doing' }`.

- **13.486** ✅ A `require-field` edge whose field the ticket ALREADY carries a value for (mirroring
  `transition-dialog.test.tsx`'s own "a required field the ticket ALREADY carries is not re-asked" scenario
  one layer up, same field name and claim shape) answers `direct`, not `needs-dialog`. — (`packages/
  app-core/src/views/board-moves.ts`, `packages/app-core/src/views/field-claims.ts`,
  `packages/app-core/test/views/board-moves.test.ts`)
- **13.487** ✅ THE CONTROL 13.486 needs: the identical edge with the field UNCLAIMED still answers
  `needs-dialog` — without it, an implementation that always answered `direct` for `require-field`, or that
  accepted `ticketFields` and silently ignored it, would pass 13.486 for the wrong reason. — (same files)

## Task 12, Ruling 26 — mirror the rule engine: trim, treat whitespace-only as unset

**Cases `13.488`–`13.489` minted here**, continuing directly from `13.487` (verified against the real case
list via `scripts/check-case-ids.mjs`'s real sweep). Same-day coordinator ruling on Ruling 25's own
follow-up: `fieldAlreadyClaimed` (`!= null`) disagreed with `evaluateRequireField`
(`packages/rule-engine/src/rules/require-field.ts`), which trims and treats a whitespace-only value as
unset — deliberate, tested, Task 9's own controller ruling
(`packages/rule-engine/test/engine.test.ts`, describe "require-field and require-evidence refuse a blank
value, not only an absent one", case "refuses require-field when the field is set to a whitespace-only
string"). Before Ruling 25 the divergence was contained (every `require-field` edge opened
`TransitionDialog`, which has `serverRefusal` wired); Ruling 25 removed that containment, so a ticket with
`dueDate: '   '` could answer `direct` from `moveOutcome` and then fail against the real server with
nothing visible on Tasks 13/14's arrows or drag-and-drop — the exact failure `transitionOptions`'s own
docblock warns against.

**Fixed by mirroring the engine's semantics, not by importing its machinery.**
`packages/rule-engine/src/index.ts:32-39` deliberately withholds `refuse()`/`ACCEPT` — "a consumer outside
this package has no business minting a `Refusal`" — so `fieldAlreadyClaimed` was NOT changed to call into
the engine; it now computes the same `isSet` expression `evaluateRequireField` computes
(`value !== undefined && value !== null && !(typeof value === 'string' && value.trim().length === 0)`),
independently stated in the client's own vocabulary.

**Checked for an existing test pinning the old, wrong behaviour before changing anything.** An earlier
pass of this grep ran over `packages/app-core/test` and `packages/app-core/src` only, and a claim naming
`packages/rule-engine/test` as covered was written before that path was actually searched — caught in
review and corrected here rather than left standing. The command actually run, both patterns over BOTH
directories: `grep -rn "value: ''" packages/app-core/test packages/rule-engine/test` and `grep -rn
"value: '   '\|value: ' '\|value: '\t" packages/app-core/test packages/rule-engine/test`. Three hits, all
accounted for and none a counter-example: a `<select>` option's `value: ''` in
`new-ticket-dialog.test.tsx` (not a `FieldClaim`); a DOM `target: { value: '   ' }` in
`saved-filters-menu.test.tsx` (not a `FieldClaim`); and `engine.test.ts:855`'s own `due_date: '   '`
fixture — the SERVER's test asserting the engine REFUSES that ticket, i.e. the correct, authoritative
behaviour this change now matches, not an assertion of the client's old, wrong "claimed" reading. No
`FieldClaim` fixture anywhere asserts a blank/whitespace value as already claimed or satisfied. Nothing
needed amending; this is a pure gap-fill, not a defect-vs-test negotiation. The full `packages/app-core`
suite (83 files, 1249 tests, up from 82/1239 — the new file and cases, nothing lost) and the full
`transition-dialog.test.tsx` (21/21) were re-run to confirm, not merely grepped for.

**The dialog's behaviour changes, and it is a FIX, not a regression**, per the coordinator's own framing:
today a blank-but-present field reads as claimed, the dialog does not prompt for it, the person clicks
Move, and the server refuses them; after the trim the dialog prompts, they fill it in, and the move
succeeds. The engine required this all along — `TransitionDialog` was the thing out of step, not the
other way round.

**The agreement is pinned by a genuine round trip against the real, exported engine**, not a
self-comparison: `packages/app-core/test/views/field-claims.test.ts` (13.489) runs `fieldAlreadyClaimed`
and the real `evaluateTransitionRules` (`@gisik-nokma/rule-engine`'s public dispatcher — the same one the
server calls) side by side over nine value shapes, through a minimal stub `EngineContext`
`evaluateRequireField` never touches (it reads only `input.ticket.fields`). Each shape states its own
expected `direct`/`unset` verdict independently, so a bug shared by both implementations would still show
up as a wrong comparison against that independent expectation rather than a silent agreement.

**Mutation-witnessed** (`fieldAlreadyClaimed`'s trim removed, reverted to bare `!= null`; reverted after
with a targeted `Edit`, `git diff --stat` confirmed empty). Prediction, written before running: reddens
`13.488` and exactly the THREE whitespace/blank sub-cases of `13.489` (empty string, whitespace-only,
mixed whitespace); the other ten `board-moves` cases and six other `field-claims` sub-cases stay green.
Result matched exactly — 4 failed / 16 passed across the two files, the failing set precisely `13.488` plus
those three `13.489` sub-cases.

- **13.488** ✅ The SAME `require-field` edge as `13.486`/`13.487`, field set to a WHITESPACE-ONLY string
  (`'   '`), answers `needs-dialog` — not `direct`. This is the case that motivated Ruling 26. —
  (`packages/app-core/src/views/board-moves.ts`, `packages/app-core/src/views/field-claims.ts`,
  `packages/app-core/test/views/board-moves.test.ts`)
- **13.489** ✅ `fieldAlreadyClaimed` agrees with the REAL rule engine across nine value shapes (absent,
  `null`, `''`, whitespace-only, mixed-whitespace, a real string, `0`, `false`, a real object) — a genuine
  round trip against `evaluateTransitionRules`, not a self-comparison, so a future drift between the two
  implementations reddens this rather than passing silently. — (`packages/app-core/src/views/
  field-claims.ts`, `packages/app-core/test/views/field-claims.test.ts`)

`tsc -p tsconfig.typecheck.json` clean on `packages/app-core` (Node v22.23.2). `node
scripts/check-case-ids.mjs` re-run after minting: duplicate list unchanged at `13.387`/`13.413` only.

## Task 13 — move arrows: refusal and its positive control (board-prototype-port plan, 2026-09-16)

**Cases `13.490`–`13.505` minted here**, continuing directly from `13.489` (verified against the real case
list via `scripts/check-case-ids.mjs`'s real sweep — max ordinal in this file's own `13.` pool was
`13.489` — never the file's own "next free BLOCK" prose, an already-recorded false hit). Phase 6, Board
writes: per-card `‹ ›` move arrows, the first WRITE path in this port. `arrowTarget`
(`views/board-arrows.ts`) resolves each arrow's target — the nearest state in that direction for which
`transitionOptions` declares a real edge, never the literal adjacent column — and `MoveArrows`
(`views/board.tsx`) routes every click through `moveOutcome` (Task 12) without re-deriving its verdict.

**`board-arrows.test.ts` — 8 cases (`13.490`–`13.497`), all against the pure `arrowTarget` scan.**
Fixture: `WF_ERRAND` for the ordinary and wildcard cases, plus one purpose-built three-state definition
(`todo -> done` declared, `doing` undeclared and sitting between them in column order) for the brief's own
canonical illustration.

**Mutation-witnessed** (`board-arrows.ts` edited in place — `scanRange.find((id) => declared.has(id)) ??
null` replaced with the naive `scanRange[0] ?? null`, i.e. the literal adjacent column, ignoring
`declared` entirely — `pnpm exec vitest run test/views/board-arrows.test.ts` re-run, then reverted with a
targeted `Edit`; a functional re-run of the full 8-case file afterward confirmed the revert, since a new,
still-untracked file shows no `git diff` either way). Prediction, written before running: reddens exactly
the two cases built to distinguish "nearest declared" from "literal adjacent" — `13.494` and `13.496` —
leaving the other six green, since every other case's expected answer happens to coincide with the literal
adjacent column for reasons unrelated to the scan (either only one candidate exists, or none does).
Result matched exactly: 6 passed / 2 failed, the failing set precisely `13.494` and `13.496` —
`expected 'waiting' to be 'doing'` and `expected 'doing' to be 'done'` respectively.

- **13.490** ✅ The nearest declared forward target IS the adjacent column — the ordinary case, `todo`
  `next` → `doing`. — (`packages/app-core/src/views/board-arrows.ts`,
  `packages/app-core/test/views/board-arrows.test.ts`)
- **13.491** ✅ No declared edge points back at `todo` from anywhere, so `previous` answers `null`. —
  (same files)
- **13.492** ✅ From `doing`, THREE targets are declared (`todo` via wildcard, `waiting`, `done`); `next`
  picks the NEARER of the two forward ones (`waiting`), not merely a declared one — proves "nearest",
  not "any". — (same files)
- **13.493** ✅ `previous` from `doing` resolves through the WILDCARD edge (`* -> todo`), not only an
  exact one. — (same files)
- **13.494** ✅ THE SKIP CASE inside the shared fixture: from `done`, `waiting` sits between `doing` and
  `done` in column order but is NOT declared reachable from `done`; `previous` skips it and lands on the
  further, genuinely declared `doing`. The mutation's own witness. — (same files)
- **13.495** ✅ `done` is the last column; `next` has nothing to scan forward into and answers `null`. —
  (same files)
- **13.496** ✅ THE BRIEF'S OWN CANONICAL EXAMPLE, its own purpose-built fixture: `todo -> done` declared,
  `doing` sitting between them purely visually with no edge touching it at all. `next` from `todo`
  resolves straight to `done`, never the physically adjacent `doing`; the paired control confirms `doing`
  itself has no move in EITHER direction, so the skip did not merely relabel which arrow `doing` answers
  to. The mutation's other witness. — (same files)
- **13.497** ✅ A `fromStateId` absent from `columnOrder` entirely has no column to scan from and answers
  `null` in both directions. — (same files)

**`board-moves-ui.test.tsx` — 8 cases (`13.498`–`13.505`), the component-level wiring: `Board`'s `moves`
capability, `MoveArrows`, and `MoveRefusalNotice`.**

**Why the refusal path is proven at the `moveOutcome`/`refusalCopy`/`MoveRefusalNotice` seam, not through a
simulated wrong click.** `MoveArrows` computes each arrow's target via `arrowTarget`, which by
construction only ever returns a member of `transitionOptions(workflow, fromStateId)` — the SAME set
`moveOutcome`'s own refusal check reads off the identical `(workflow, fromStateId)`. So a target this
component ever actually SUBMITS is, by construction, always declared, and a live click on an ENABLED arrow
cannot organically drive `moveOutcome` into its `refused` branch. `13.502`/`13.503` prove the real refusal
RENDERING instead — the actual `moveOutcome` output, fed into the actual `refusalCopy`/`MoveRefusalNotice`
— which is the honest seam given the click-side is provably unreachable, and is also exactly the pipeline
Task 14's drag-and-drop reuses for real, since a drop target is not filtered this way.

- **13.498** ✅ THE POSITIVE CONTROL the brief demands: clicking an available arrow on a declared,
  rules-free edge submits the SHIPPED `{to}` `ticket.transitioned` payload (never `{toStateId}`), with the
  right `actorId`/`origin`, calls `onMoved`, and renders no refusal of either kind. Only this case tells a
  refusal that fires on everything apart from a refusal that actually works. — (`packages/app-core/src/
  views/board.tsx`, `packages/app-core/test/views/board-moves-ui.test.tsx`)
- **13.499** ✅ THE PAIRED NEGATIVE CONTROL: the direction with no declared target is a genuinely disabled
  button (native `disabled`, not merely styled to look inert), and firing a click at it anyway submits
  nothing. — (same files)
- **13.500** ✅ The `moves` capability itself absent (not passed to `Board` at all) renders NO move arrows
  whatsoever — the whole feature absent, not merely every direction disabled. — (same files)
- **13.501** ✅ A declared edge whose rules are NOT already met (`require-comment` on the nearest-declared
  edge, a purpose-built gated `WF_ERRAND` variant) opens `TransitionDialog` rather than submitting blind.
  **The dialog is NOT pre-aimed at the arrow's own target** — only `(workflow, fromStateId)` are threaded
  through; the dialog's own `<Select>` starts empty and this test picks "Doing" from it the same way a
  person would. What it proves: the dialog opens on the right workflow and the right `fromStateId` (not
  merely that SOME dialog opens), and completing it submits the SHIPPED `{to, comment: {text}}` payload. —
  (same files)
- **13.502** ✅ The refusal pipeline, end to end and for real: `moveOutcome(WF_ERRAND, 'todo', 'waiting',
  {})` refuses with `available: ['doing']` (the one real alternative — `moveOutcome`'s own test suite
  already proves this fact; this case's job is only what renders from it), and `MoveRefusalNotice` fed
  that exact output renders text naming "Doing" BY NAME — never a bare "you can't do that", and never the
  raw id leaking through unnamed. — (same files)
- **13.503** ✅ The zero-alternatives sentence (`moveOutcome`'s `available: []`) is still an honest one —
  `"This ticket can't move from here."`, not `"try ."` — both from `refusalCopy` directly and from
  `MoveRefusalNotice`'s own rendering. — (same files)
- **13.504** ✅ A REJECTED `ingest` (a transport failure, not a server answer) does not brick the card:
  found in review, not authored blind — `submitDirect`'s own `submitting` latch (no precedent in
  `TicketSheet.submitTransition`, which never disables its Move button in flight) was originally reset
  only after a successful `await`, so a rejection left both arrows `disabled` forever with nothing on
  screen. Fixed with `try/catch/finally`. Mutation-witnessed the other direction — the FIX reverted back
  to the pre-fix shape, `pnpm exec vitest run test/views/board-moves-ui.test.tsx` re-run, reddened this
  case alone (`Unable to find role="alert"`, and the DOM dump shows both arrows `disabled=""`) — the other
  six cases in the file stayed green, then reverted with a targeted `Edit`. — (`packages/app-core/src/
  views/board.tsx`, `packages/app-core/test/views/board-moves-ui.test.tsx`)
- **13.505** ✅ THE SAME transport-failure fix `13.504` proved for `submitDirect`, now proved for
  `submitFromDialog`: found in a THIRD review round, requested before declaring the `13.504` follow-up
  done. `TransitionDialog`'s `onSubmit` prop is `void`-typed and `MoveArrows`' own call site is
  fire-and-forget (`onSubmit={(submission) => void submitFromDialog(submission)}`), so before this fix a
  rejected `ingest` from inside the dialog became an unhandled promise rejection — the dialog stayed open
  with nothing on screen saying it failed. Fixed with a `try/catch` around `submitFromDialog`'s body,
  reusing `TransitionDialog`'s EXISTING `serverRefusal` display (`transition-dialog.tsx:311-314`) rather
  than inventing a new one. Mutation-witnessed: the `try/catch` reverted to the pre-fix shape, `pnpm exec
  vitest run test/views/board-moves-ui.test.tsx` re-run, reddened this case alone (`PASS (7) FAIL (1)`,
  timeout waiting for the dialog's own alert), the other seven cases in the file stayed green, then
  reverted with a targeted `Edit` and re-confirmed `PASS (8) FAIL (0)`. — (`packages/app-core/src/
  views/board.tsx`, `packages/app-core/test/views/board-moves-ui.test.tsx`)

**A separate, related fix carries NO case number, and that absence is deliberate, not an oversight.**
The `try/catch/finally` `13.504` added made every local `setState` call in both `submitDirect` and
`submitFromDialog` run unconditionally after an `await` — including on a card that has unmounted in the
meantime, which is not rare: a successful move on ANY card (this one or a sibling) calls `moves.onMoved()`
→ `board.reload()`, which can restructure the board and unmount a DIFFERENT card whose own slower `ingest`
is still in flight. Found in a second-opinion review (the same one that led to `13.505`), fixed with a
`mountedRef` gating every local setter in both submit paths — the identical idiom `use-live-query.ts`'s
`isCurrent()` and `TransitionDialog`'s own precheck `cancelled` flag already use — while leaving
`moves.onMoved()` itself unguarded (it reaches the parent and is safe regardless of this component's mount
state). **React 18 drops the console warning for a setState on an unmounted component, so no assertion in
jsdom/RTL can observe the difference the guard makes** — confirmed true of both cited precedents as well,
neither of which carries a dedicated test for this either. Rather than write a test that only LOOKS like it
exercises the race (and would pass identically with or without the guard), this fix is documented instead
of witnessed — the honest alternative to a check that cannot fail. `packages/app-core/src/views/board.tsx`.

`tsc -p tsconfig.typecheck.json` clean on `packages/app-core`; `tsc -p tsconfig.json --noEmit && tsc -p
tsconfig.e2e.json --noEmit` (the package's own `typecheck` script) clean on `apps/web`. Node `v22.23.2`.
Full `packages/app-core` suite: 87 files, 1265 tests, green (up from 83/1249 before this task — the two
new files' 16 cases, nothing lost). Full `apps/web` suite: 363 tests, green, run AFTER wiring `moves` into
`page.tsx` — whether any of those 363 tests exercise the project page's board tab with a signed-in session
was not individually traced; the claim made here is only the measured one, that the full suite stayed
green with the wiring in place, not a claim about which tests do or do not reach the new code path.

**A repo-wide `pnpm turbo run test` (dist freshly built for every upstream package, so `apps/web`'s own
resolution of `@gisik-nokma/app-core` to `dist/` is proven against this task's REAL changes, not a stale
build) surfaced 3 unrelated timeouts in `apps/server`** (`test/determinism.test.ts`,
`test/seed/seed-dev.test.ts`, `test/visibility/grant-backfill.test.ts`, all `Error: Test timed out in
30000ms`, 1518 passed / 5 skipped otherwise) — investigated, not waved off: this task changed zero files
under `apps/server`, `apps/server:typecheck` already passed clean in the same run, the log's own error
line names a DIFFERENT Node (`v24.11.1`) than every other package ran under in this task (`v22.23.2`), and
all 18 tests across the three files pass cleanly when re-run in isolation under the correct Node with no
contention from the other 16 packages building/testing at once. Pre-existing environmental flakiness
and/or a Node-version drift in turbo's own subprocess spawning, not a regression this task introduced —
see the task report for the full account. Every package this task actually touched (`ui` 309/309,
`app-core` 1264/1264, `web` 363/363) passed clean in that same full run, as did every other untouched
package.

**Review caught two additional real defects before this landed, both fixed and both proven with their own
mutation witnesses (case `13.504` above, and see that case for the specific witness); a third was a wording
correction with no code change** — `board-moves-ui.test.tsx`'s own `13.501` describe block and the
`13.501` bullet above both originally claimed `TransitionDialog` opens "aimed at the right target"; it does
not — only `(workflow, fromStateId)` are threaded through, and the target is chosen from the dialog's own
dropdown, the same way `TicketSheet`'s "Move…" button already works. Reworded in the test file, this
file, and the task report rather than left standing. `.gn-board-card__move--previous`/`--next` were also
dropped from the arrow buttons' `className` — empty class hooks with no corresponding `ui.css` rule, the
exact shape this repo has already removed once (`481ad12c`).

**A THIRD review round, requested before declaring the `13.504` follow-up done, found two more real
issues** — `13.505` above (the `submitFromDialog` transport-failure fix, code changed and
mutation-witnessed) and the `mountedRef` guard (code changed, deliberately NOT mutation-witnessed, see
above for why). Two further points from that same round were left as documented judgment calls rather
than code changes: `submitFromDialog` still carries no `try/catch` of its OWN distinct from the transport
fix already applied (moot — the fix IS the catch); and the client-invented `rule: 'transport'`/
`rule: 'no-response'` values render through the identical `Refused by the server — ${rule}: ${reason}`
sentence a REAL server refusal uses, which a viewer cannot distinguish from an actual server answer —
changing that sentence now would redden the `13.504` mutation-witnessed assertion that the alert text
contains `'network unreachable'`, so it was left as a coordinator-level decision rather than changed
unilaterally.

`node scripts/check-case-ids.mjs` re-run after minting `13.505`: duplicate list unchanged at
`13.387`/`13.413` only.

## Ruling 27 (coordinator, 2026-09-16) — the client was minting refusals

The coordinator's own review of Task 13's four commits found what the third review round above (concern 5
in the task report) treated as a documented, deliberately-unfixed judgment call was actually a real
violation of `rule-engine/src/index.ts:32-41`'s own stated door: "`refuse()` and `ACCEPT`... stay internal…
a consumer outside this package has no business minting a `Refusal`, and exporting them would hand every
client a way to fabricate a verdict that looks engine-made". `board.tsx` never imported `refuse()` — it
built `{ rule: 'no-response'|'transport', reason }` objects by hand instead, and fed them into
`serverRefusal`, the SAME channel `TransitionDialog`'s own docblock calls "the authority's answer, shown
VERBATIM whenever present." Neither `no-response` nor `transport` exists in `REFUSAL_RULES`
(`rule-engine/src/refusal-rules.ts:9-25`, fifteen real entries). A dropped connection or an empty `ingest`
response rendered through the identical `Refused by the server — ${rule}: ${reason}` sentence a real
refusal uses — indistinguishable from an actual server verdict, and calling for the opposite next action
(retry, not "fix the thing the server objected to").

**The fix: a wholly separate channel, never a `{rule, reason}` pair.** `MoveArrows` (`board.tsx`) gained a
new `transportError: string | null` state, kept SEPARATE from `serverRefusal` rather than merged into it
with a `kind` tag — `serverRefusal` now carries ONLY what `moveOutcome`'s gate or a real `IngestResult`
actually said; `transportError` carries a plain sentence for the two cases where nobody adjudicated at all.
`TransitionDialog` (`transition-dialog.tsx`) gained the identical `transportError: string | null` prop
(now REQUIRED, matching `serverRefusal`'s own required shape — every caller must consciously pass `null`
rather than silently defaulting), rendered in its own `<p role="alert" className="gn-refusal
gn-refusal--transport">`, never alongside "Refused by the server". `ui.css` gained `.gn-refusal--transport`,
reusing the `warning` role `.gn-refusal--preview` already uses (amber, not `--server`'s danger-red) — the
same "not the authority speaking" register, a different reason. `ticket-sheet.tsx`'s own
`TransitionDialog` mount passes `transportError={null}`, with a comment explaining why: `TicketSheet.
submitTransition` stays unguarded (an unhandled promise rejection on a transport failure, the existing,
untouched precedent `board.tsx`'s own docblocks already cite) — it never fabricated a refusal either, it
just never caught the rejection at all, so there is nothing to pass but `null`. No import of `refuse()`/
`ACCEPT` anywhere — the fix stays on the "never mint a verdict" side of the door the ruling quotes, not a
smaller violation of it.

**Wording:** the "silence" case (`results[0] === undefined`) keeps its exact original sentence, moved to
the new channel — `"The server did not answer this move."` The "transport failure" case (a rejected
`ingest`) is new — `` `We could not reach the server for this move — ${message}` ``.

**On `13.504`: amended, and the amendment is quoted, not just described, per the coordinator's own
instruction.**

- **BEFORE:** `expect(screen.getByRole('alert')).toHaveTextContent('network unreachable')` — one substring
  check.
- **Measured, not assumed, that this did NOT organically redden under Ruling 27's fix** (the coordinator
  expected it would): the new sentence — `"We could not reach the server for this move — network
  unreachable"` — still CONTAINS the substring `'network unreachable'`, so the old assertion passed under
  BOTH the defective rendering and the fixed one. Running the full affected suite (`board-moves-ui.
  test.tsx` + `transition-dialog.test.tsx`) against the fix with the assertion still in its pre-amendment
  shape confirmed this directly: `PASS (29) FAIL (0)`. The test was too weak to catch the defect it was
  never written to look for — it checked that SOME message with the right substring appeared, never that
  the message avoided claiming server authority it did not have.
- **AFTER:** the alert is captured once and checked five ways — `toHaveTextContent('We could not reach the
  server for this move')`, `toHaveTextContent('network unreachable')`, `not.toHaveTextContent('Refused by
  the server')`, `toHaveClass('gn-refusal--transport')`, `not.toHaveClass('gn-refusal--server')` — plus the
  original "arrows stay usable" assertion, unchanged. `13.505` (the `submitFromDialog` sibling) got the
  identical amendment for the identical reason, quoted the same way in its own docblock.
- **Mutation witness, run against the fix itself rather than assumed correct:** `board.tsx`,
  `transition-dialog.tsx`, and `ticket-sheet.tsx` reverted in place to their exact pre-Ruling-27 content
  (`git show f5041052:<path>`, the last commit before this ruling), the two affected test files re-run.
  Result: `PASS (27) FAIL (3)` — exactly the three cases touched by this ruling (amended `13.504`, the new
  `13.506` below, amended `13.505`) and nothing else. The failure text is the ruling's own defect, produced
  by the actual reverted code rather than described secondhand: `13.504` and `13.505` both failed with
  `Received: "Refused by the server — transport: network unreachable"`; the new case failed with `Received:
  "Refused by the server — no-response: The server did not answer this move."` — direct proof the
  pre-ruling code fabricated BOTH `rule: 'transport'` and `rule: 'no-response'`, not only the one the
  coordinator's file:line citations named first. Files restored byte-identical afterward (`diff` against a
  pre-revert backup of each, confirmed clean) and the full suite re-confirmed green.

- **13.506** ✅ (new, no prior coverage existed of this path in this file) — `submitDirect`'s "silence"
  case: `ingest` answers with an empty array, so `results[0]` is `undefined` and nobody adjudicated. Same
  channel, same distinguishing assertions as amended `13.504`, checked against `"The server did not answer
  this move."` instead of the transport sentence. — (`packages/app-core/src/views/board.tsx`,
  `packages/app-core/test/views/board-moves-ui.test.tsx`)

**Case IDs `13.506` minted here**, continuing from `13.505` (verified against `scripts/check-case-ids.mjs`'s
real sweep, not this file's own prose). `packages/app-core/test/views/transition-dialog.test.tsx`'s shared
`renderDialog` helper gained a `transportError={null}` default (the prop is now required on
`TransitionDialogProps`) — no new case minted there: `13.505`'s amended assertions already exercise
`TransitionDialog`'s own `transportError` rendering through the real dialog (`within(dialog).getByRole(
'alert')`), so a second, isolated unit test of the identical render branch would be a redundant guard
rather than new coverage — the exact shape this repo's own case-review discipline warns against minting
for its own sake.

`tsc -p tsconfig.typecheck.json` clean on `packages/app-core` (Node `v22.23.2`). Full `packages/app-core`
suite: 85 files, 1266 tests, green (up from 1265 — the one new case, nothing lost). `node
scripts/check-case-ids.mjs` re-run after minting `13.506`: duplicate list unchanged at `13.387`/`13.413`
only.

## Task 14 — drag-and-drop, the plan's final task (board-prototype-port plan, 2026-09-16)

**Cases `13.507`–`13.513` minted here**, continuing directly from `13.506` (verified against the real case
list via `scripts/check-case-ids.mjs`'s real sweep, not this file's own prose). Dragging a card from one
board column and dropping it on another — the SAME `moveOutcome` gate Task 13's arrows already route
through, never a second one: a drop's target comes from whichever column it lands on, and the dragged
card's own `MoveArrows` instance (`views/board.tsx`) registers its real `attemptMove` closure into a
shared per-board registry (`MoveRegistry`) keyed by ticket id, on every render; the target column's drop
handler looks it up and calls it — the identical function an arrow click on that card would call. This
ships **no second module and no second decision point** — `views/board-arrows.ts`'s own forward reference
to "that task's own module" is corrected in place (this task's own commit) to describe the registry
instead, since no second module exists.

**`board-drag-drop.test.tsx` — 6 cases (`13.507`–`13.512`), a sibling file to `board-moves-ui.test.tsx`,
the same convention that file's own docblock set for itself relative to `board.test.tsx`.** Every test
drives the board through a REAL `fireEvent.dragStart` → (`dragover` where relevant) → `fireEvent.drop`
sequence, never calling anything drag-specific directly — the whole point of this task is that a drop and
an arrow reach `moveOutcome` through the exact same code, provable only by reaching it the way a person
actually would. `DataTransfer`/`DragEvent` are unimplemented in this repo's jsdom (25.0.1 — confirmed
empirically: `new window.DataTransfer()` throws `is not a constructor`); `@testing-library/dom`'s own
`events.js` documents the identical gap and attaches whatever plain object is passed as `dataTransfer`
directly onto the fired event with no validation, so each test builds a hand-rolled `DataTransfer`
stand-in (`setData`/`getData` over a `Map`, format-aware — never answering the same value for every
format), cast `as unknown as DataTransfer`, mirroring the established `ClipboardEvent`/`clipboardData`
precedent already in this codebase (`packages/editor/test/drive-never-inline.test.ts`). ONE instance is
passed to both the `dragStart` and the `drop` fire calls in every test, never two — a real browser hands
one `DataTransfer` object to every event in a single drag gesture, and two fakes would prove nothing about
whether the drop side actually reads what the drag side wrote.

- **13.507** ✅ THE POSITIVE CONTROL the brief demands, mirroring `13.498`'s role for the arrows: dragging
  the card in `todo` and dropping it on `doing` (a declared, rules-free edge) submits the SHIPPED `{to:
  'doing'}` `ticket.transitioned` payload with the right actor/origin, calls `onMoved`, and renders no
  alert. — (`packages/app-core/src/views/board.tsx`, `packages/app-core/test/views/board-drag-drop.test.tsx`)
- **13.508** ✅ THE CASE AN ARROW CANNOT ORGANICALLY REACH: dropping the `todo` card on `waiting` (`todo`'s
  only declared target in `WF_ERRAND` is `doing` — proven by `moveOutcome`'s own suite and reused verbatim
  by `13.502`) refuses, and the rendered alert NAMES "Doing" rather than merely appearing; nothing is
  ingested. The first END-TO-END exercise of the refusal pipeline this port has — `13.502` proves the same
  pipeline only at the pure-gate seam, because an arrow's own target is always declared by construction. —
  (same files)
- **13.509** ✅ THE THIRD OUTCOME the design spec's own Test impact section names for this task alongside
  the positive control and the refusal above ("a drop on a rules-bearing edge opening the dialog"):
  dropping on a `todo -> doing` edge regated with `require-comment` (`13.501`'s own gated-edge fixture,
  reused verbatim) opens `TransitionDialog`, aimed at the right `(workflow, fromStateId)`. Does not
  re-prove `submitFromDialog`'s own mechanics — `13.501`/`13.504`/`13.505` already do, over the identical
  function this drop reaches; this case's whole job is the DISPATCH, not what happens after. — (same files)
- **13.510** ✅ THE MECHANISM every outcome case above is blind to: `fireEvent.drop` in a test dispatches
  straight to React's listener regardless of what `dragover` did, so a suite built only from `13.507`–
  `13.509` could pass in full against an implementation where a real browser's default action (disallow
  dropping) would silently defeat every drop. Pinned directly — `fireEvent.dragOver(column, {
  dataTransfer })` returns `false`, the `dispatchEvent` return value exactly when something called
  `preventDefault()` on a cancelable event (`dragover`'s own default `cancelable: true`,
  `@testing-library/dom`'s event map) — not inferred from any drop succeeding. — (same files)
- **13.511** ✅ A `drop` with no real `dragstart` behind it (an empty `DataTransfer`, `getData` answering
  `''`) is a SILENT, INERT no-op, not a thrown error and not a refusal: `''` is not a ticket id the
  registry has ever seen, so `Map.get` answers `undefined` and the drop handler does nothing further — no
  ingest, no alert, no dialog. Distinguishes "the gate ran and refused" from "the handler found nothing to
  act on", the one outcome `MoveRegistry`'s own docblock names as the case this feature does not narrate. —
  (same files)
- **13.512** ✅ RULING 15'S OWN WORDS, proven rather than asserted in prose: "a grab cursor on an
  undraggable card is an affordance claim the product cannot honour." Mirrors `13.500`'s identical "no
  arrows at all" proof for the same `moves` capability being absent: the card's `<li>` is NOT matched by the
  literal selector `ui.css` uses to grant the grab cursor when there is no `MoveArrows` instance behind it
  to register an `attemptMove`, and a drop aimed at it anyway is still inert, since `onDropCard` itself is
  `null` on that path and the column never receives an `onDrop` handler at all. — (same files)

  **AMENDED, Ruling 29 (coordinator, 2026-09-16).** Originally asserted the literal
  `toHaveAttribute('draggable', 'false')` — a SPELLING of how the element fails to be draggable, not the
  CONTRACT the cursor rule depends on. `.gn-board__card-slot[draggable="true"]` is equally unmatched by an
  EXPLICIT `draggable="false"` and by the attribute being ABSENT entirely — both read "not draggable" to a
  browser. The old assertion would have reddened a future refactor that switched to omitting the attribute
  instead of setting it `false` (e.g. `draggable={arrows !== null ? true : undefined}`), even though the
  CSS contract would still hold — a phantom regression, found by the coordinator rather than caught by any
  test. **Now asserts the contract directly**: `card.matches('[draggable="true"]')` is `false` — the
  identical selector string `ui.css` uses, read off the real DOM via the standard `Element.matches` API,
  rather than one particular way of failing to satisfy it.

  **Mutation-witnessed both directions, not merely reasoned about.** (A) `draggable={arrows !== null}` →
  `draggable={true}` (a REAL regression — always draggable, even with no `moves` capability): reddened
  `13.512` and nothing else (`AssertionError: expected true to be false`). (B) `draggable={arrows !== null}`
  → `draggable={arrows !== null ? true : undefined}` (the PHANTOM the old assertion would have flagged —
  omits the attribute rather than setting it `false`, same CSS outcome): the AMENDED assertion stayed
  green (`PASS (9) FAIL (0)`), confirmed by first restoring the OLD assertion text and re-running the same
  mutation — which reddened, proving the fix actually removes the phantom rather than merely being asserted
  to. Both mutations reverted; the 9-case file re-confirmed green afterward.
- **13.514** ✅ THE REGISTRY MUST HOLD THE LATEST `attemptMove`, not one captured once. Every other case in
  this file drops exactly once; this drags and drops the SAME card TWICE in sequence (both times onto the
  declared, rules-free `doing` edge) and asserts BOTH submit — two `ingest` calls, `onMoved` called twice.
  Proves the `useEffect` that re-registers `attemptMove` on every render actually publishes the fresh
  closure (the one that sees `submitDirect`'s own `finally`-reset `submitting` flip back to `false`), not a
  closure frozen at first render — the shape of bug an over-eager `useCallback` memoization could introduce
  silently, either bricking the card after one move or bypassing the double-submit latch entirely, without
  touching any line this file's other six cases exercise. — (same files)

## Ruling 28 — the notice scrolls into view following a drop, never following an arrow (coordinator, 2026-09-16)

**The tension, named rather than resolved unilaterally.** `.gn-board__rail` (`packages/ui/src/ui.css:315`) is
`overflow-x: auto`. The refusal/server-refusal/transport-error notices render exactly where `MoveArrows`
already renders them for arrow clicks — under the SOURCE card, in its origin column — never a second site
near the drop point, since a second site would be the "two products" fork this task exists to avoid. But
after a rightward drag the origin column can scroll out of view before a sighted person reads why their
card snapped back, which is functionally the "silent snap-back" the design spec forbids
(`docs/superpowers/specs/2026-09-16-board-prototype-port-design.md:270-271`) — for sighted users
specifically: `role="alert"` already announces the notice to assistive technology regardless of scroll
position.

**Fix: keep the single rendering site, scroll it into view on the drop path only.** `MoveArrows` gained a
`lastAttemptSourceRef` (`'arrow' | 'drop'`), set by `attemptMove`'s own new optional second parameter
(defaulting to `'arrow'` — every arrow `onClick` is unchanged); the registry wrapper `registerAttempt`
registers now passes `'drop'` explicitly. The three notices are wrapped in one `<div
className="gn-board-card__notice" ref={noticeRef}>` (`display: contents` in `ui.css`, so the wrapper is
invisible to `.gn-board-card__moves`'s own flex layout — no visual change to the arrows or notice
placement), and a `useEffect` watching `[refusal, serverRefusal, transportError]` calls
`noticeRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' })` exactly when something is
about to render AND the triggering attempt's source was `'drop'`.

- **13.515** ✅ Drops a card onto an undeclared column (the refusal path, reusing `13.508`'s own setup) and
  asserts `scrollIntoView` — a `vi.fn()` stub, since jsdom 25 implements no `scrollIntoView` at all
  (confirmed empirically: a bare jsdom element throws `is not a function`) — was called exactly once, with
  `{ block: 'nearest', inline: 'nearest' }`. — (`packages/app-core/src/views/board.tsx`,
  `packages/app-core/test/views/board-drag-drop.test.tsx`)
- **13.516** ✅ THE PAIRED NEGATIVE, proving the DISCRIMINATION itself rather than only the drop side: an
  arrow click that reaches a real notice (`board-moves-ui.test.tsx`'s own `13.504` transport-failure
  fixture — an arrow click can never reach the CLIENT-side `refusal` notice, Task 13's own unrelated
  constraint, so any real notice reached via an arrow proves the point equally well) must NOT call
  `scrollIntoView`. `13.515` alone would still pass an implementation that scrolled on every notice
  regardless of source; this is what rules that out. — (same files)

**Both mutation-witnessed.** (1) The `scrollIntoView` call itself removed: reddened exactly `13.515`
(`AssertionError: expected "spy" to be called 1 times, but got 0 times`), `13.516` untouched (still nothing
to assert against). (2) The `lastAttemptSourceRef.current !== 'drop'` guard removed (scroll fires
regardless of source): reddened exactly `13.516` (`Number of calls: 1`, expected `0`), `13.515` untouched
(still correctly called once on its own drop). Both reverted; the 9-case file re-confirmed green
afterward.

## Ruling 29 — `13.512` asserts the contract, not one spelling of how it fails to match (coordinator, 2026-09-16)

See `13.512`'s own AMENDED bullet above for the fix and its mutation witness (both directions: the amended
assertion still catches a real regression, `draggable={true}` unconditionally, AND stays green under the
phantom `draggable={arrows !== null ? true : undefined}` mutation the OLD assertion would have wrongly
reddened on — verified by literally restoring the old assertion text against that same phantom mutation and
watching it fail, not merely reasoned about).

**Every outcome-dispatch case (`13.507`–`13.509`) and the `dragover` mechanism case (`13.510`) is
mutation-witnessed, not merely passing once.** Two mutations, each applied via a targeted `Edit`, run
against the 6-case file, then reverted via a second targeted `Edit` restoring the exact original text
(confirmed by re-reading the diff, not assumed):

1. `handleDrop`'s `if (attempt !== undefined) attempt(toStateId);` changed to `if (false && attempt !==
   undefined) attempt(toStateId);` — predicted to redden exactly the three cases that depend on
   `attemptMove` actually firing. Result: `PASS (3) FAIL (3)`, the failing set exactly `13.507`/`13.508`/
   `13.509`, the other three (`13.510`–`13.512`, none of which depends on the registry call firing)
   untouched.
2. `onDragOver`'s handler changed from `(event) => event.preventDefault()` to a no-op `(_event) => {}` —
   predicted to redden exactly `13.510`. Result: `PASS (5) FAIL (1)`, the sole failure `13.510` with
   `AssertionError: expected true to be false`.

Both mutations reverted; the full 6-case file, plus the full 76-case pre-existing board suite
(`board-moves-ui.test.tsx`, `board.test.tsx`, `board-arrows.test.ts`, `board-moves.test.ts`), re-confirmed
green afterward (`PASS (82) FAIL (0)`).

**`packages/ui/test/components.test.tsx` — 1 case (`13.513`), a CSS-binding gate, the same shape
`inbox-css-binding.test.tsx` already uses for `gn-timeline__bar`.**

- **13.513** ✅ `.gn-board__card-slot[draggable="true"]` sets `cursor: grab` in `ui.css`. Proves only that
  the RULE exists with the right body — `13.512` above is what proves `draggable="true"` (and therefore
  this selector's match) actually tracks the `moves` capability rather than being always on or always off.
  — (`packages/ui/src/ui.css`, `packages/ui/test/components.test.tsx`)

**Why `cursor: grab` is NOT declared on `.gn-board-card` itself** (Ruling 15's own instruction was to add
it "beside the behaviour that makes it true", not where the spec's literal metrics table puts it) — two
independent reasons, either alone sufficient: (1) `.gn-board-card` still renders on the READ-ONLY path
(`moves` capability absent — session loading, signed out, or no capability wired at all), where the card
genuinely cannot be dragged, and a grab cursor there would be the exact "control that lies" shape Ruling
15 already named; `13.512` is the case that would have caught the alternative. (2) Case `13.464`'s own
`rule()` helper (`packages/ui/test/components.test.tsx`) matches the FIRST literal substring
`.gn-board-card {` it finds via a plain regex with no selector parser — any new rule whose selector text
happened to end in that exact substring, even a compound one like `.foo .gn-board-card { … }`, would
silently hijack `13.464`'s match and break a case this task never touched. `.gn-board__card-slot` contains
no `.gn-board-card` substring at all (`__card-slot`, not `-card`), so it cannot collide — checked by
inspection of the regex (`packages/ui/test/components.test.tsx`'s own `rule()`), not merely assumed safe.

**Two decisions recorded here rather than left for a reviewer to find, per the task's own instruction to
surface a stated decision rather than let it be discovered:**

- **Same-column drop.** Dropping a card back onto the column it is already in is refused like any other
  undeclared target — `transitionOptions` already excludes `toStateId === fromStateId`
  (`board-moves.ts`'s own docblock), so `moveOutcome` treats a same-column drop identically to any other
  wrong target, with no special case. Consistent with the plan's own "same four outcomes" instruction; not
  separately tested, since it is the same code path `13.508` already exercises for a different
  `toStateId`.
- **Where the refusal renders.** `MoveRefusalNotice` renders where `MoveArrows` already renders it — under
  the SOURCE card, in its origin column — never a second site near the drop point. Adding a second
  rendering site would be exactly the fork ("two products") this task exists to avoid, even though the
  rail is `overflow-x: auto` and the origin column can in principle be scrolled out of view by the time the
  drag lands elsewhere. Left as-is, named rather than silently accepted.

**Keyboard reachability — proven unaffected, not merely assumed.** `board-moves-ui.test.tsx` (the arrows'
own 8-case suite, `13.498`–`13.505`) runs UNCHANGED and stays green — this task edited no assertion, no
`aria-label`, no `disabled` logic in that file (confirmed: `PASS (9) FAIL (0)` on that file alone,
unmodified). `draggable` is a plain HTML attribute; it adds no tabstop, no ARIA role, and no accessible-name
change, so the `‹ ›` arrows remain the complete keyboard path they were before this task — drag-and-drop is
a pure addition, never a replacement.

`tsc -p tsconfig.typecheck.json` clean on `packages/app-core` AND `packages/ui` (Node `v22.23.2`). Full
`packages/app-core` suite: 1272 tests green; full `packages/ui` suite: 310 tests green; full `apps/web`
suite: 363 tests green (`tsc` clean there too — `tsconfig.json` and `tsconfig.e2e.json` both). `pnpm turbo
run typecheck` and `pnpm turbo run test` both green across all 17 packages. `node scripts/check-case-ids.mjs`
re-run after minting `13.507`–`13.513`: sum rose from 2047 to 2054 (+7) and union rose from 2044 to 2051
(+7) — the same delta, so the pre-existing `13.387`/`13.413` duplicates are unchanged and no new duplicate
was introduced.

## Final whole-branch review, fix wave (2026-09-16) — Findings 1–5

The whole-branch review ("I would merge this, with Findings 1 and 2 fixed first") returned five
findings. **Case `13.517` minted here** for Finding 1, the one that changes tested behavior; Findings
2, 4 and 5 are prose/citation corrections with no new case; Finding 3 changes an exported string
constant (covered by existing cases that read the constant rather than a hand-typed copy of it, so no
new case is needed there either — see `board.test.tsx`'s own docblock on why `EMPTY_COLUMN_COPY` is
exported in the first place).

- **13.517** ✅ **Finding 1 — the Filters sheet's five non-`text` axes were undisclosed on the three
  non-board tabs.** The mirror note (Ruling 10, `13.439`/`13.444`) was gated on
  `activeFilterChips.some((chip) => chip.key === 'text')` — accurate when `text` was the only axis with
  a control, silently inert on `assigneeIds`/`typeIds`/`stateIds`/`stateCategories`/`projectIds` once
  Task 5's Filters sheet reached them onto the same page-level `filter` from every tab. Open Filters on
  List, tick an assignee, press Done: the list did not change, and nothing on screen said so — the same
  one-axis-enumeration defect `buildBoardFilterChips` was already rewritten to stop repeating for the
  strip eight lines above, recurring in the note eight lines below it.
  **Fixed by widening the gate to `activeFilterChips.length > 0 || boardUnappliedAxes.length > 0`** —
  the SAME two terms the strip's own three-term gate reads (never its third, `shown !== total`, which is
  a fact about the BOARD's own render and meaningless on a tab the board never touches).
  `activeFilterChips` already enumerates all six `BoardFilterSpec` axes; `boardUnappliedAxes` covers the
  three the board itself cannot evaluate either — between them every axis `filter` can carry is covered.
  **The sentence itself was also generalised, and deliberately does not say "the board only":** a
  `filter` set to only a `boardUnappliedAxes` entry (`collaboratorIds`/`dueBefore`/`dueAfter`/`fields`)
  narrows nothing on the board either, so claiming "the board only" would overclaim exactly there — the
  copy this wave shipped, "Filters set here are not applied on this tab.", named only what the page
  could know for certain under every combination that trips the gate. **That copy is HISTORY, and so is
  the assertion in the next sentence — both are corrected with measurements at the end of this entry.**
  Drives the REAL path — the Filters sheet's own Assignee checkbox, not a `setFilter` shortcut — on the
  List tab, and asserted the List tab's own render was untouched (the axis had no control anywhere else,
  which was precisely why the note was the only disclosure available). **Mutation-witnessed**: reverting
  the gate to the old `chip.key === 'text'` check reddened `13.517` alone — `13.439`/`13.444` (both
  driven by a real search TERM, which still trips the old gate) stayed green — confirming the new case
  discriminates rather than merely existing. Reverted with a targeted `Edit`, confirmed byte-identical by
  SHA-256 checksum (not `git diff` — this repo has a recorded case of `git diff` reporting identical for
  differing files). — (`apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx`,
  `apps/web/test/board-narrowing.test.tsx`)
  **CORRECTED 2026-09-20 — two claims above expired the day after they were written, and BOTH the
  wording and the behaviour moved.**
  *(1) The quoted copy exists nowhere in source.* A case-insensitive repo-wide sweep
  (`git grep -i -E "not applied on this tab|Filters set here"`) returns **no hit in any source tree**.
  Every match is non-source: the history quote above; **THIS paragraph's own grep pattern**, which is
  why the sweep is not quoted here as a fixed count — it matches itself, so any figure written down
  expires on the next run; a lane handoff quoting it; and a PLAN
  (`docs/superpowers/plans/2026-09-17-filter-exclude-all-tabs.md:2277`) instructing the edit that
  removed it — an instruction already carried out, since `Features.md:106` carries its replacement text.
  The positive control in the same invocation, `git grep -n "Not applied on the"`, fires on the shipped
  string at `apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx:2013`. `4837a56c` (2026-09-17) retired
  the mirror note; `a02c717c` (Task 10 fix round 1, the same day) made the scope note name its tab and
  its unapplied axes: *"Not applied on the `{tabNoun}`: `{unapplied.join(', ')}`."* — the `TAB_NOUN`
  record at `page.tsx:1911-1917`, and the docblock at `:2000-2010` recording that
  `describeUnappliedListAxes` (`apps/web/src/board-search-scope.ts:17-19`) can only ever return
  `collaborator`, so on List/Calendar/Timeline the sentence names one axis. **`13.556b`** — *"the scope
  note names the LIST tab, not the board, when it renders there"* — asserts the shipped form as
  `/not applied on the list/i` plus `/collaborator/i`
  (`apps/web/test/board-narrowing.test.tsx:571`, assertions at `:602-604`). **This is a superseded
  quote, not a wrong conclusion** — the reasoning above survived intact, in a stronger form: the shipped
  sentence is the same "name only what the page can know" rule with its two vague halves made explicit
  per tab.
  *(2) `13.517` was FLIPPED 2026-09-17.* "The List tab's own render is untouched" was true of `13.517`
  as written and false from the next day: the exclude-mode work (`4837a56c`) made the sheet's Assignee
  axis NARROW the List, and the case now asserts exactly that —
  `describe('13.517 (flipped 2026-09-17) an assignee picked in the Filters sheet narrows the List tab')`
  at `board-narrowing.test.tsx:460`, with the flip and its reason in that file's own docblock at
  `:414-428`. **Both movements point the same way: the product gained the reach the note had been
  apologising for, so the note and the assertion that depended on it both went.**

**Finding 2 — 34 stale line-number citations swept**, all introduced by this branch's own edits shifting
content the citations pointed at. Six in shipped source (`page.tsx:342`, `board-search-scope.ts:59`,
`ui.css:336`/`:718`/`:1906`, `board.tsx:1043`), the rest across `Features.md`, this file, the spec and
the plan, plus two more found in `board-narrowing.test.tsx` itself by an exhaustive repo grep that the
review's own summary count had missed. Every citation whose target still exists in the file (just moved)
was re-pointed to its real current line, verified by opening the file there rather than computing an
offset. Five citations of `board.tsx:70` name a gate (`board.groups.length === 0` as the sole
`EMPTY_BOARD_COPY` condition) that Ruling 19/R6 SUPERSEDED rather than merely moved — re-pointing those
to a "current" line would have manufactured a second falsehood that reads as freshly checked, so they
are marked `(pre-R6)` instead, left without a specific present-day line. One citation
(`transition-dialog.tsx:128`) named an inline predicate later extracted to `field-claims.ts:55`
(Ruling 25) — a cross-file re-point, not a number bump. Full table in
`.superpowers/sdd/2026-09-16-board-prototype-port/final-fix-report.md`.

**Finding 3 — `EMPTY_COLUMN_COPY`'s docblock corrected, and "yet" dropped.** The docblock justified the
unconditional per-column copy on "the narrowing pass... runs above this component... with data this
component was never given" — no longer true since Ruling 19 gave `Board` an `isNarrowed` signal; `Board`
simply does not thread it down into `BoardGroupSection`. Docblock now says exactly that: the shell can
disclose narrowing (it does, via the strip), `Board` itself now could too, but the wiring the rest of the
way stops one level short — a deferred follow-up, not a structural impossibility. **"Yet" dropped**: `No
tickets in this column yet.` reads, under an active filter, as asserting none were ever created — chosen
because it reads better once the reason it might be empty is no longer "definitely none ever existed".
No test hand-types the string (all reference the exported constant), so no case needed updating.

**Finding 4 — page.tsx docblock hedged.** "Counting it [`workflowChip`] here too would not change the
gate's answer in any case" was false for one constructible case: a workflow with its own cards picked
while an empty SIBLING group is dropped leaves `shown === total` with the other two terms already zero,
so the strip stays closed though the picker is non-default — counting `workflowChip` there would open it.
The invariant the gate exists for still holds (no card is ever hidden without disclosure) and the
`<select>` keeps showing the pick regardless, so nothing is lost; the docblock now says so instead of
claiming a certainty that does not hold.

**Finding 5 — this file's own `13.505` narrative said "checked four ways" while listing five assertions
and the code has five** (`13-board-prototype-port.md:1172`, above). Corrected to "checked five ways".

`node scripts/check-case-ids.mjs` re-run after minting `13.517`: only `13.387`/`13.413` remain as
duplicates (pre-existing, unrelated to this fix wave, carried since before Task 3 — see the "Case-id fix"
entry in `.superpowers/sdd/2026-09-16-board-prototype-port/progress.md`). Verified by ID, not by count.


## The New-ticket dialog's Title field wears the product's field treatment (lane ds1, 2026-09-21, batch B10) — case `13.1139`

**The finding, round 2 `E4-13`, IMPORTANT.** The first control a person types into in *New ticket* was
`<label class="gn-new-ticket__field">Title<input value=""></label>` — an `<input>` with **no class at
all**, inside a neumorphic sheet, on a dialog whose `Type` and `Parent` siblings paint at the product's
17 px on a 44 px control. Measured in `neo`/light: `border: 2px inset rgb(118,118,118)`,
`background-color: rgb(255,255,255)`, `border-radius: 0px`, `padding: 1px 2px`,
`font-size: 13.33px`, `getBoundingClientRect` **425×22**. `ui.css` carries exactly two `.gn-new-ticket`
rules (the actions row at `:2154`, the field wrapper at `:2155`), neither of which reaches the input, so
the user-agent box is what painted.

**Id `13.1139`, and how it was arrived at is the part worth recording.** The first pass asked
`13-second-wave-roles-and-navigation.md` for its next free number and collided with
`13-second-wave-board-actions.md`; the guard named both lines. **A per-file "next free" is not a smaller
version of the repo-wide question — it is a different question.** The second answer was a self-declared
reservation of `13.1054`–`13.1073`, verified free across all 25 catalogue files, and it was superseded
within the hour by the third: the controller allocated §13 ids per RELEASE BATCH, and **B10 owns
`13.1137`–`13.1156`**. This id was renumbered into that block in the same pass as every other §13 id the
batch had minted.

### The case

- ✅ **13.1139 — the Title control carries `gn-field__input`, and that class is a RULE, not a dead name.**
  `packages/app-core/test/views/new-ticket-dialog.test.tsx`. **The two halves are asserted together
  because either alone is passable while the defect survives:** round 1's `P1` was exactly *"a control
  styled by no rule of its own"*, so a class that matches no selector block satisfies a class-name
  assertion and changes nothing about the paint. The rule it names is read out of
  `packages/ui/src/ui.css` by the cross-package read `sync-ux-css-binding.test.tsx` and
  `inbox-css-binding.test.tsx` already establish for this question, guarded by its own control —
  without it, a needle that matched nothing would make the assertion a pass on a stylesheet that had
  lost the block entirely. `packages/ui/test/components.test.tsx` pins what that rule *says* (`13.339`);
  this case pins that this control is one of its wearers. `13.1139` was minted with the fix and the
  stylesheet was reverted to `HEAD` for the RED run, restored from a sha256-compared backup.

**No `Features.md` bullet.** This corrects an existing control's paint; it adds no affordance and no
new state, so there is no feature bullet to edit — recorded here rather than left as a silent omission.

## The active-filter chip's remove control meets the 24-px in-list floor (lane ds1, 2026-09-21, batch B10) — case `13.1140`

**The finding, round 2 `E4-14`, IMPORTANT.** On Calendar and Timeline (any view with a chip in the tray),
`button.gn-project__filter-chip-remove` — `aria-label="Remove filter — Closed: hidden"` — measured
**8.1×13** with `padding: 0`, `line-height: 13px`, `font-size: 13px` and both `min-width`/`min-height`
`auto`. The chip around it (`span.gn-project__filter-chip`, 147×26) **is a `<span>` with no handler**, so
the whole pill reads as the target and only the × in its corner responds. **The one larger equivalent was
checked before the floor was applied:** the Filters panel's own toggle behind the *Filters* button is
`90×35`, so WCAG 2.5.8's *Equivalent* exception is arguably met and this is scored on the control a
person reaches for rather than as a hard failure.

### The case

- ✅ **13.1140 — the remove rule declares the 24-px floor, in a box that honours it, and the two
  declarations that made the glyph the control are still in force.** `packages/ui/test/components.test.tsx`.
  **A source scan, not a paint.** `apps/web/e2e-*` is Playwright and is not in `pnpm test`; the property
  at issue is what the rule declares, and the stylesheet is the authority on that. `1.5rem` is this
  file's own WCAG 2.5.8 in-list floor — the same number and reasoning `.gn-attention__title` carries at
  `ui.css:1667` — and the `display: inline-grid` half is asserted alongside the min sizes on purpose,
  because that rule's own note is that `padding: 0` makes the element's height its line box, so a
  `min-height`-only edit would not hold. The third assertion is the negative half, not a control: the
  pair `padding: 0` / `line-height: 1` passes before the fix and after it, and is asserted so neither can
  return. **The chip's own new height is NOT claimed as measured** — the rule states the arithmetic
  (24 + the chip's two `0.25rem` paddings = 32, up from 26) and labels it arithmetic; the rule was
  reverted to `HEAD` for the RED run and restored from a sha256-compared backup.

**No `Features.md` bullet.** This corrects an existing control's target size; it adds no affordance, so
there is no feature bullet to edit — recorded here rather than left as a silent omission.

## Every board card's `who · when` disclosure meets the 24-px in-list floor (lane ds1, 2026-09-21, batch B10) — case `13.1141`

**The finding, round 2 `E4-3`, IMPORTANT, scored PARTIAL.** `button.gn-board-card__provenance`
toggles the state-provenance line on each card. Measured on the board at 1512×900 against the product's
own selector list (`tap-targets.ts:268-280`) and visibility filter: **24 instances** — one per card,
`document.querySelectorAll('button.gn-board-card__provenance').length` → 24 and `.gn-board-card` → 24 —
each **66×21**, `display: inline-block`. It is not the card's open control (`.gn-board__card-slot` is),
so nothing larger performs its function and WCAG 2.5.8's *Equivalent* exception does not apply. The
judge corrected the finding's "only sweep" absolute — `e2e-viewport/responsive.spec.ts:678` is a second
`measureTapTargets` call — and the core held.

### The case

- ✅ **13.1141 — the rule declares the 24-px in-list floor, and `DENSE_IN_LIST` classifies it as
  in-list.** `apps/web/test/tap-target-density.test.ts`. **Both halves are asserted together and for
  the reason the table exists at all:** a floor in the CSS with no classification is judged at 44 the
  day a sweep reaches the board, and a classification with no floor absolves a control that does not
  meet 24. The extractor is `ruleHeads` — the same comment-stripped one the liveness check uses, not a
  second copy — because `ui.css` is mostly prose and a selector merely discussed in a comment would
  answer for a rule that had been deleted. `min-height` alone is the fix: the element is UA
  `inline-block` (its rule sets no `display`), so a min size applies to it, unlike the `padding: 0` bare
  buttons elsewhere in the file whose height is their line box. `ui.css` and `e2e-viewport/tap-targets.ts`
  were each reverted to `HEAD` for the RED run and restored from sha256-compared backups.

### ⚠ Clause (b) of the membership rule is UNMET, recorded rather than implied

`tap-targets.ts`'s own membership rule requires **(a)** a CSS rule that makes the 24-px call in its own
words **AND (b) a sweep that actually visits the route it renders on.** The board route **is** in the
stack suite's accessible-name and type-scale loop, but **not** in its tap-target pass, which measures
`/my-work` alone — round-2 finding **E4-12**. So this `DENSE_IN_LIST` entry is **declared but not yet
exercised**, the same position `.gn-my-work__title` is already recorded in, and it is written in both
the entry's own `why` and the CSS rule rather than left to read as covered. Closing it needs a second
`measureTapTargets` call on the board route plus its baseline key, and the suite refuses to invent a
baseline — it needs a live stack on `:3001`, which another lane owns. **Owner: whoever widens that pass
(E4-12).** The conservative direction is guarded either way: an undeclared dense control is judged at
44, which reddens loudly.

**No `Features.md` bullet.** This corrects an existing control's target size; it adds no affordance.

## At phone width the ticket sheet's label column collapses (lane ds1, 2026-09-21, batch B10) — case `13.1142`

**The finding, round 2 `E4-7`, IMPORTANT.** With the sheet open on `CCSO-6` at `emulate 390x844`, the
description editor (`div.tiptap.ProseMirror`) measured **224×3195**; its container `dd` spanned
`x 178.6 → 402.7` while the sheet ends at `x 390` and the sheet body is `366.6` wide. Words were cut at
the right edge mid-glyph (*"as o"*, *"the"*, *"screens"*, *"look"*), and the toolbar
(`div.ticket-editor__toolbar`) reported the same `right=403`. The cause is the only rule for that class:
`ui.css` `.gn-ticket-sheet__field { display: grid; grid-template-columns: 8rem 1fr }` — a fixed 8-rem
label column with **no narrow-width override** (the file's four other `@media (max-width…)` blocks name
it nowhere).

### The case

- ✅ **13.1142 — below 40rem the row is one column, the value can shrink, and Full screen is withdrawn.**
  `packages/ui/test/components.test.tsx`. **`grid-template-columns: 1fr` is asserted together with
  `min-width: 0` on the `dd`, and that pair is the point:** a grid item's `min-width` is `auto`, so the
  column is floored at its content's min-content width and `1fr` alone would leave the editor pushing the
  column back out — the fix would look applied while changing nothing. `.gn-sheet__full` is withdrawn in
  the same block rather than a second breakpoint, because two breakpoints for one screen's phone
  treatment is how they drift apart, and the pill expands a sheet that at 390 px already fills the
  viewport. **Not painted**: the rules were not measured on a running server — `apps/web/e2e-*` is
  Playwright and is not in `pnpm test` — so what this scan proves is that the breakpoint declares them;
  the pre-fix numbers above are the finding's own, and the rule carries the same caveat. `ui.css` was
  reverted to `HEAD` for the RED run and restored from a sha256-compared backup. The block is selected by
  *containing* `.gn-ticket-sheet__field`, because `ui.css` carries more than one 40rem block.

**No `Features.md` bullet.** This corrects an existing screen's layout at a width it already served; it
adds no affordance.

## The controls that painted as raw UA chrome join the bare-control convention (lane ds1, 2026-09-21, batch B10) — case `13.1143`

**The finding, round 2 `P1`, IMPORTANT** (filed as nine sites / seven controls, corrected to eight sites / six
controls — the seventh, `gn-nav__signin`, was withdrawn because `.gn-nav a` reaches it from an ancestor).
P1 swept every static `className` literal on a `<button|input|select|textarea|summary|a>` in the product and
required that at least one of its class tokens match a selector block; six controls matched none. **The
mechanism is one line:** `apps/web/app/globals.css:84` sets `button { font: inherit }` — font ONLY, no
`border`, no `background`, no `padding` — so an unstyled button keeps the UA's `outset` edge and grey fill.
Painted by the finding on the members a browser could reach: `button.editor-slot__submit` "Save description"
**136.4×29.2** and "Comment" **86.9×29.2**, each `border: 2px outset rgb(0,0,0)`,
`background-color: rgb(239,239,239)`, `border-radius: 0px`, `padding: 1px 6px`; `button.add-rule-menu__trigger`
"Add rule" **76.6×29.2** the same — beside a *Publish* button reading `1px solid rgb(51,98,159)`, the control
in the same paint.

### ⚠ FOUR OF THE SIX ARE FIXED, AND THE OTHER TWO ARE A MEASUREMENT

`gn-attachment__link` and `attachment-item__name` are **`<a>` elements**. The UA gives an anchor **no**
border, **no** background and **no** padding, so a bare-control reset is a **no-op** on them — the reset's
shape is a *button*'s problem. Their ink comes from `globals.css:39` and the underline that remains is the
link affordance. `attachment-item__name` is additionally under an explicit both-directions contract at
`packages/editor/src/styles/editor.css:218` ("emitted deliberately and styled by nobody yet … a plain link")
asserted by `test/attachment-list-item.test.tsx`, so a box rule there would falsify a deliberate record to
fix nothing the UA had wrong. **This is recorded in `ui.css` above the reset, in `editor.css` above its own,
and in the test — not dropped.** The two stylesheets carry one grouped rule each, in the file that owns the
package: `ui.css` for `.gn-board__empty-create` and `.add-rule-menu__trigger`, `editor.css` for
`.editor-slot__submit` and `.evidence-picker__cancel` — the split `ui.css`'s own `.gn-comments` docblock
requires ("`packages/ui` styling another package's internals is the duplication this repo refuses").
`background: none`, not the reviewer's `transparent`, because `editor.css`'s header forbids a bare colour
keyword — and the shorthand resets every background property anyway.

### The case

- ✅ **13.1143 — the extractor can tell both ways, all four buttons match a selector block, each declares
  the reset in the file that owns it, and the editor's stays inside that file's no-colour rule.**
  `packages/ui/test/bare-control-coverage.test.ts`. The control runs FIRST and in both directions: 600+
  selector heads extracted, a class that genuinely has a rule reads as styled, an invented class reads as
  unstyled — and the **boundary guard is asserted on its own**, `(?<![\w-])`/`(?![\w-])`, because without it
  `gn-board__empty` would be satisfied by `gn-board__empty-create`, which is the exact "a name that looks
  covered" defect this case exists for. "Some rule exists" is not enough either: the reset's own
  declarations are asserted, since a class matching an unrelated selector would pass the coverage
  assertion and leave the UA edge in place. **Not painted by this change** — the numbers above are the
  finding's, and the case says so. `ui.css` and `editor.css` were each reverted to `HEAD` for the RED run
  and restored from sha256-compared backups.

**No `Features.md` bullet.** This corrects existing controls' paint; it adds no affordance.

## The board's whole-board empty state gets a treatment, and a recorded rationale (lane ds1, 2026-09-21, batch B10) — case `13.1144`

**The finding, round 2 `P2`, IMPORTANT.** `board.tsx:528` renders
`<div className="gn-board gn-board--empty">`, `:490` renders `gn-board__empty-copy` and `:494` renders
`gn-board__empty-create`. **All three had ZERO selector blocks** — the only two hits for the family in
`ui.css` were *comments* (`:835`, `:4980`), and `/usr/bin/git log -S'gn-board__empty-create'` shows
`b1dda062` added a mention, not a rule. So the product's first-run call to action on an empty board was a
grey outset `<button>` on a neumorphic page. It is the one board empty state with no styling: its
per-column sibling has three rules (`.gn-board__column-empty`, `-icon`, `-copy`).

### The design decision, recorded rather than left implicit

**The prototype draws no whole-board empty state at all.** So the container borrows the per-column empty
state's own shape — `fill-quaternary`, `--gn-radius-card`, the centred column, the muted `0.9375rem` copy —
rather than inventing a third treatment: two empty states on one board should read as one family. The
action takes the shared control constant **`981aa92b`** established for `.ticket-type-list__move`:
fill-tertiary, text-accent, control radius, no border, the 44 px standalone floor. **The absence is
recorded in `Features.md` as a deliberate addition**, which is what stops a later reader "correcting" the
screen back toward a prototype that never had it — the second half of the finding's own remedy.

### The case

- ✅ **13.1144 — the container carries the sibling's shape, the copy takes the sibling's type, the action
  takes the shared constant, and the P1 reset still precedes this rule.** `packages/ui/test/components.test.tsx`.
  The last case is the one worth naming: **P1's bare-control reset and this rule BOTH match
  `.gn-board__empty-create`**, deliberately — P1 removed the UA chrome, this gives the product's own — and
  they overlap on `border`, `background`, `padding` and `color`, so source order decides. If the two ever
  swap, the action silently loses its fill while every other assertion here stays green, so the order is
  pinned by index rather than assumed. **Not painted**: what is asserted is what the rules declare, and
  `apps/web/e2e-*` is Playwright, which is not in `pnpm test`. `ui.css` was reverted to `HEAD` for the RED
  run and restored from a sha256-compared backup.

## The timeline's nav buttons stop wearing the browser's bevel (lane ds1, 2026-09-21, batch B10) — case `13.1147`

**The finding, filed twice from two sides: round 2 `E4-15`** (MINOR — "the class HAS a rule, and the rule
forgot the border") **and `P35`** (MINOR, `r2 NEW` phase 2 — the same rule, reached by asking whether a
matched selector block means a fully-styled control). `.gn-timeline__nav` — the three Earlier / Today /
Later buttons — declared a radius, a background, a colour, a font, padding and a cursor, **and no
`border`**, so the user agent's `2px outset rgb(0,0,0)` survived the rule: measured with the product's own
`background: rgb(241,234,227)`, `border-radius: 6px`, `padding: 3.2px 9.6px`. **This is outside round 1's
`P1` population by construction** — P1 selected classes with ZERO matching selector blocks, and this one
matched — which is the lesson both findings share: *"matched a selector block"* and *"is fully styled"* are
different questions. `P35`'s own corroboration: the family's other two members, `.gn-timeline__bar` and
`.gn-timeline__open`, already carry `border: none`; the nav did not.

### The case

- ✅ **13.1147 — the rule declares `border`, and it takes the calendar nav's own values.** `packages/ui/test/components.test.tsx`.
  **The assertion is the PRESENCE of the declaration, not the absence of `outset`**, and the difference
  matters: `outset` is what the UA applies *because* the declaration is missing, so a test searching a
  stylesheet for the string `outset` would pass on every tree, broken or fixed. The five values are
  asserted as a PAIR with `.gn-calendar__nav` rather than as literals, because the remedy is that the two
  views' navs agree — a later edit re-diverging one of them is the regression. A third assertion keeps
  `P35`'s observation as calibration: the family's other two members already carried it. **Not painted** —
  the ratios and measurements above are the findings' own. `ui.css` was reverted to `HEAD` for the RED run
  and restored from a sha256-compared backup. Package suites: ui 416, web 639.

**No `Features.md` bullet.** This corrects an existing control's paint; it adds no affordance.

## The overlay dismiss control is a 44-px circle, not a 21-px glyph (lane ds1, 2026-09-21, batch B10) — case `13.1148`

**The finding, round 2 `E4-2`, MINOR.** `button.gn-sheet__close` — "×", `aria-label="Close sheet"` — the
visible pointer control for leaving the product's most-used overlay, measured **23.59×21.20**
(`getBoundingClientRect`) with `padding: 1px 6px` (the UA's), `min-width`/`min-height: auto`,
`font-size: 19.2px` and `background: rgba(0,0,0,0)`: the glyph WAS the box. The only rule for it
(`.gn-dialog__close, .gn-sheet__close`) sets `font`, `font-size`, `line-height`, `border`, `background`,
`color` and `cursor` — and no size. The prototype draws a 32-px filled circle.

### ⚠ The finding's opening claim was withdrawn before the freeze, and the fix records that

The first draft said *"no other pointer control closes the sheet"*, on a `[class*="backdrop"]` query that
returned null. **That query was the wrong needle** — the scrim is `div.gn-sheet__scrim` with
`onClick={onClose}` (`sheet.tsx:97-99`; the dialog's is `dialog.tsx:17`), and clicking outside closes both.
So this is **not a WCAG 2.5.8 failure in the strict sense**; it is a 21-px control whose pointer
equivalent is an unmarked area a person has to know about. The severity is set accordingly and the rule
says so rather than letting the assertion imply a stricter claim.

### The case

- ✅ **13.1148 — the dismiss control declares the 44-px floor in both dimensions, takes the prototype's
  circle and fill, and answers the size question the same way the header's other control does.**
  `packages/ui/test/components.test.tsx`. **44, not the prototype's 32:** this is the same divergence
  `.gn-sheet__full` immediately above already records — *"this repo enforces the 44px tap-target floor on
  every `button` (WCAG 2.5.5, and `tap-targets.ts` measures them), while the prototype draws 32px"* — and
  two controls in one header cannot answer it differently, so the size is asserted as a **pair** with
  `.gn-sheet__full` rather than as a literal. The circle and fill are the prototype's. A fourth assertion
  pins that the two overlay dismiss controls still SHARE one rule: `rule()` cannot be used on
  `.gn-dialog__close` because that head does not end a selector list, so the combined head's body is read
  and compared to the sheet head's — the same evidence by a different route. **Not painted**: the
  measurement above is the finding's own. `ui.css` was reverted to `HEAD` for the RED run and restored
  from a sha256-compared backup. Package suites: ui 420, web 639.

**No `Features.md` bullet.** This corrects an existing control's target size; it adds no affordance.

**One half of the finding's remedy is NOT done, named rather than implied:** it also asked for *"one sweep
that opens a sheet before measuring"*, because no current sweep enters a state where the sheet is open
(`UNAUTHED_ROUTES` covers `/help`, `/privacy`, `/terms` and a 404 probe; the stack suite's tap pass
measures `/my-work` alone). That is a Playwright change needing a live stack on `:3001`, out of this
lane's reach; the owner is whoever widens that pass, and the same gap is recorded under `13.1141`.

## The List row's two controls meet the 24-px floor, and the spacer follows (lane ds1, 2026-09-21, batch B10) — case `13.1151`

**The finding, round 2 `E4-26`, MINOR.** On the List at 1512: `button.gn-list__collapse "Collapse Open
questions"` **22×22** and `button.gn-list__open "Open questions"` **125×22** (×26 rows, `17px/22px`) — both
under WCAG 2.5.8's 24px in-list floor, the same floor `.gn-my-work__title` and `.gn-attention__title` were
moved to on 2026-09-08. `grep -n onClick packages/app-core/src/views/ticket-list.tsx` finds **three
handlers** — the Columns toggle, the caret and the title — and **no `<tr>`/row handler**, so unlike the
board card (`13.523`) there is no larger equivalent target and 2.5.8's *Equivalent* exception does not
apply. The prototype draws 22px; the floor wins, as it did for `.gn-attention__title`.

### The case

- ✅ **13.1151 — the caret is 24×24, the title's LINE BOX is 24px, the floor is asserted as a floor, and a
  planted 22px caret reddens the same reader.** `packages/app-core/test/views/ticket-list-css-binding.test.tsx`.
  **The title is raised through its line box and that is asserted rather than assumed:** `.gn-list__open`
  declares `font-size`/`line-height` only, so its height IS its line box and a `min-height` there would be
  a second, competing mechanism. `>= 24` on the two min sizes rather than `=== 24`, because a larger in-list
  target is an improvement and an equality would redden on it; the exact values are pinned in the
  assertion above. The mutation plant REPLACES the real rule rather than appending — a rule appended at the
  end leaves `declarationsFor` reading the real one, so the plant would be inert, the same lesson
  `settings-shell-tokens.test.ts`'s `withRule` records.

### ⚠ Two consequences, both recorded rather than discovered later

**(1) `.gn-list__caret-spacer` moved with the caret, and had to.** The prototype's spacer is 22px to match
its 22px caret; a 24px caret beside a 22px spacer **shears every leaf off its parent's left edge by 2px**,
which is the exact failure the `13.671` binding test exists to catch. Both absolutes in that test moved
`1.375rem` → `1.5rem` together, which is why that test carries two absolutes beside its relative one.

**(2) `declarationsFor` RETURNED THE WRONG RULE FOR `.gn-list__open`, and nothing had read it before now.**
Its docblock claimed the line-start anchor handled selector LISTS; it happens to work for
`.gn-list__collapse` (whose shared-rule line ends in a comma) and silently fails for `.gn-list__open`
(whose shared-rule line IS `^.gn-list__open {`) — returning the two-head rule's body. The helper now skips
a candidate whose preceding text ends in a comma. **The limitation was written down as if it were handled,
and it was handled for one of the two names** — which is why the fix is in the helper rather than in this
case's own reader.

**One half of the remedy is NOT done, named rather than implied:** the finding also asks for the List view
in the stack suite's route list with a `DENSE_IN_LIST` entry for each. That is a Playwright change needing
a live stack on `:3001` — the same deferral recorded under `13.1141` (E4-3) and `13.1148` (E4-2), whose
`DENSE_IN_LIST` entries are likewise declared but not yet exercised. **Owner: whoever widens that pass
(E4-12).** `ui.css` was reverted to `HEAD` for the RED run and restored from a sha256-compared backup.
Package suites: ui 420, app-core 1725, web 643.

## The segmented control's items carry the prototype's horizontal padding (lane ds1, 2026-09-21, batch B10) — case `13.1153`

**The finding, round 2 `E4-35`, MINOR.** `[role=tablist][aria-label="Filter notifications"]` on `/inbox` at
1512, owner: **`All` 31×44**, `Unread` 64×44, `Mentions` 78×44 — each item `padding: 1px 6px` (the UA's),
`min-width: auto`. `.gn-segmented__item` declares no horizontal padding, so wherever `flex: 1` has no free
space to share, **the width of a tab is the width of its word**. On the board the same class paints 92×44
and is unaffected: that track fills its row and `flex: 1` distributes the extra. The difference is the
container — `div.gn-inbox__header` is `display:flex; justify-content: space-between`, so the track is
content-sized. The prototype's segment carries `padding:0 16px`.

### The case

- ✅ **13.1153 — the rule declares `padding: 0 1rem`, does not instead invent a `min-width`, and keeps
  `flex: 1`.** `packages/ui/test/components.test.tsx`. The second assertion is the one that stops the
  cheap wrong fix: a `min-width` would repair the 31-px *All* tab and be wrong for every longer label — a
  fixed floor where the prototype has a padding, and one that does not scale with the text. The third
  pins the board's own reading, which the finding requires be untouched. **Not painted** — the 31×44
  above is the finding's own measurement. `ui.css` was reverted to `HEAD` for the RED run and restored
  from a sha256-compared backup. Package suites: ui 423, web 647.

**No `Features.md` bullet.** This corrects an existing control's metrics; it adds no affordance.

## The editor's formatting strip takes the product's fill, not an outline (lane ds1, 2026-09-21, batch B10) — case `13.1154`

**The finding, round 2 `E4-8`, IMPORTANT → scored MINOR.** In the sheet (style `neo`, light),
`button.ticket-editor__tool` painted `border: 1px solid rgb(32,43,73)` (the label ink),
`background: transparent`, `box-shadow: none`, and the strip `div.ticket-editor__toolbar` carried the same
outline on three sides — while every neighbouring control in the same sheet (`.gn-button--ghost`,
`.gn-segmented__item`, `.gn-select__trigger`, `.gn-field__input`) is border-less fill. Six outlined boxes
and an outlined rule over a soft-fill sheet. The judge scored it below the claimed severity because **the
defect itself is style consistency** — what was IMPORTANT was that the two recorded reasons for it rest on
a false premise.

### ⚠ The premise, corrected and asserted

`editor.css`'s own docblock said the fill *"is NOT transcribed, and it cannot be"* for two reasons.
**(1)** *"`packages/editor` does not depend on `packages/ui`, so no token from `tokens.ts` is
reachable"* — a PACKAGE-DEPENDENCY fact where the question is a DOCUMENT one: `apps/web/app/layout.tsx:3-4`
imports `ui.css` AND `editor.css` into one document, and custom properties cascade from the document.
**(2)** *"this file forbids colour of every kind"* — **a `var(--gn-…)` reference is not a colour
literal**, and the header's third prohibition is a bare colour *keyword*, which is why neither rule writes
`transparent`. **Checked against the scanner rather than assumed:** `packages/ui/test/helpers/colour-scan.ts`
matches a hex (`#[0-9a-fA-F]{3,8}`) in a CSS value or a string, and the functions
`rgb|rgba|hsl|hsla|oklch|oklab|color-mix(`; a token reference matches neither.

### The case

- ✅ **13.1154 — both rules declare a fill and no outline, neither writes a literal or a keyword, and the
  token-less context degrades to today's paint.** `packages/editor/test/editor-toolbar.test.tsx`. The
  third assertion is not decoration: `src/webview/entry.tsx` loads this file **without** `ui.css`, so
  `var(--gn-…)` resolves to `initial` there — `transparent` for `background`, `none` for `box-shadow` —
  which is exactly what these controls paint today, so the mobile webview regresses by nothing. It also
  pins the shape: **no fallback value**, since `var(--gn-x, <fallback>)` would change the webview's paint
  and would need a colour token the header cannot express. **Not painted** — the computed values above are
  the finding's own. `editor.css` was reverted to `HEAD` for the RED run and restored from a
  sha256-compared backup. Package suites: editor 191, ui 423, web 647.

## The viewport suite measures WCAG 1.4.10's own width (lane ds1, 2026-09-21, batch B10) — case `13.1155`

**The finding, round 2 `P27`, MINOR, `r2 NEW`, scored PARTIAL.** WCAG 2.2 §1.4.10 *Reflow* is Level AA and
names a number: content must reflow to **320 CSS px** without two-dimensional scrolling. **The narrowest
width this product was ever measured at was 390px** — 70px above the criterion — and `grep -rc "320"` over
`apps/web/e2e-viewport/*.ts` and `apps/web/e2e-stack/*.spec.ts` returned **no non-zero count**. The
verifier's correction, carried rather than smoothed over: the finding's *"`min-width` above 320px →
exactly one"* is **false** (`ui.css:1477 .gn-list__table` is a second), so the census is not restated here —
the remedy is the viewport, not the count.

### The case

- ✅ **13.1155 — 320 is a declared viewport with the criterion's own numbers, 390 is STILL measured, and
  the config maps the record so the entry becomes a real project.** `apps/web/test/viewport-reflow-320.test.ts`.
  The last assertion is what stops the first two being satisfied by a record nothing reads:
  `playwright.viewport.config.ts:184` builds its `projects[]` by **mapping** `VIEWPORTS`, so a fourth entry
  IS a fourth Playwright project and every per-viewport sweep runs at it. The second assertion is the safe
  direction — an edit that REPLACED 390 with 320 would satisfy the first and shrink coverage.
  `device: 'iPhone SE'` and not `'iPhone 5'`: Playwright ships no `iPhone 5` descriptor (checked against
  `@playwright/test`'s own `devices`), and the descriptor only contributes the non-viewport mobile
  characteristics anyway — the config pins `viewport` after the spread.

### ⚠ The baselines for this width do not exist, named here and in the source

`tap-target-baseline.json`, `accessible-names-baseline.json` and the type-scale baseline are keyed
`<viewport>|<route>` and all three **REFUSE a missing key rather than seeding it**
(`responsive.spec.ts`'s own *"the suite refuses to invent one"*). So the first run of the viewport suite
reports a missing baseline for each of the five routes at `phone-320` and stops — **loudly, in the safe
direction, with no invented number committed.** **Owner: whoever next runs `test:e2e:viewport` against a
live stack; record with `UPDATE_*_BASELINE=1` and commit the file.** This lane could not: Playwright needs
its own `next dev`, and this lane runs in push-only mode with no stack. `viewports.ts` was reverted to
`HEAD` for the RED run and restored from a sha256-compared backup. Web suite 650; `pnpm turbo run typecheck`
17/17, which is what covers `tsconfig.e2e.json`.

## The accessible-name ratchet's message says what it measures (lane ds1, 2026-09-21, batch B10) — P10, no case id

**The finding, round 2 `P10`, MINOR, judged VALID.** The ratchet's unit is an ATTRIBUTE and its failure
message claimed a PROPERTY OF ASSISTIVE TECH. `accessible-names.ts:49` counts
`all.filter((el) => el.hasAttribute(attr)).length`, and the assertion at `e2e-stack/viewport.spec.ts:720`
ended *"Something that identified an element to assistive tech is gone."* — a stronger claim than the
number supports. **A live site where the two differ is named in the finding:** an `aria-label` that left an
element and was replaced by visible text elsewhere reddens this exactly as a genuine loss does.

**Sentence corrected, no product test, per the finding's own DONE WHEN.** The message now reads *"An
`${attr}` ATTRIBUTE left the document — that is all this measured, and whether it still named anything is
not what it measured."*, and the counter's own docblock records the limits (`aria-labelledby`, visible
text) in the same place the count is taken. **The finding's own instruction is kept — keep the count, it is
cheap and it does catch a dropped attribute** — so this is a wording fix, not a relaxation.
`pnpm turbo run typecheck` 17/17 (the web package's `tsconfig.e2e.json` covers the edited spec); web suite
652.

## The board, the List and My Work stop skipping heading level 2 (lane ds1, 2026-09-21, batch B10) — T-E4-24 and T-P17

> **Case id PENDING ALLOCATION.** These two tasks are one property measured on the same three screens, so
> they are carried as ONE instrument with two arms — and B10's section-13 block (`13.1137`–`13.1156`) is
> **fully used**. The ask for three more ids is recorded in
> `docs/lanes/release-2026-09-22-progress.md`. **No id was minted outside the block**; this entry's case
> marker is therefore the task id, and the allocated id gets filled in here when it arrives.

**The findings, round 2 `E4-24` and `P17`, both MINOR.** Measured on every route: Board `H1 Shop operations`
→ `H3 Simple kanban`, `H3 Errand with waits`; List `H1` → `H3 Recently assigned`, `H3 Open questions …`;
My Work `H1 My Work` → `H3 Assigned to me` … (four). **The outline went h1 → h3 with no h2 anywhere in the
path, on three of the product's main screens.** The page title is an `h1`; the first level under it is an
`h2`. `P17` adds that no instrument measures heading level or order at all — the assertion below is a
partial answer to that, and its remaining half is named.

### The case

- ✅ **T-E4-24 / T-P17 — every section heading under a page title is an `h2`, and none is an `h3`.**
  `packages/app-core/test/views/heading-outline.test.ts`. **A SOURCE scan, and the reason is specific
  rather than convenient:** the property IS the tag — `<h3 className="…">` and `<h2 className="…">` differ
  by one character and nothing else about them changes — so the file is the authority. The extractor runs
  through a positive control over the same reader (all three families found, ≥5 headings), the fix is
  witnessed by planting the pre-fix tag back into the board's own source and reading it back as `h3` at the
  same time as the real source reads `h2`, and the levels are asserted for **all three views at once**
  because the finding measured them together.

### ⚠ Two residuals, named rather than implied

**(1) The builder is NOT covered.** `E4-24` also records that its aside panels' `h3`s hang under no `h1`
at all — the route renders `main.gn-shell` and the screen's visible title is an editable
`<input class="workflow-builder-screen__name">`, not a heading. That is a different defect (a MISSING
`h1`, not a skipped `h2`) and needs a design decision about where a heading goes on a screen whose title
is a field; the finding's own words call it *"which its own record already owes"*.
**(2) `P17`'s second half — a per-route outline WALK that fails on a skip anywhere** — is not built. A
source scan cannot see an `h2` nested under something that is not an `h1`; that needs the browser-side
sweep `P17` describes, with a recorded baseline per route.

### One existing assertion pinned the defect

`apps/web/test/board-narrowing.test.tsx` queried the group headings at `level: 3` — so the assertion was
holding the level the finding says is wrong. All four sites moved to `level: 2` **in the same change**, and
the fact that this had to happen is the finding's point stated in reverse: no instrument measures heading
level or order, so the only thing watching that number was an unrelated case's query. The RED pair:
heading-outline `2 failed | 1 passed (3)` (`/tmp/ds1-E4-24-red.log`), board-narrowing
`1 failed | 19 passed (20)` (`/tmp/ds1-E4-24-red-web.log`), with the three views reverted to `HEAD` and
rebuilt, then restored from sha256-compared backups and rebuilt again. Package suites: app-core 1728,
web 652.

## The help search announces how many answers it found (lane ds1, 2026-09-21, batch B10) — T-E4-36

> **Case id PENDING ALLOCATION** — B10's section-13 block (`13.1137`–`13.1156`) is fully used and the ask is
> recorded in `docs/lanes/release-2026-09-22-progress.md`. **No id was minted outside the block**; this
> entry's marker is the task id, and the allocated id gets filled in when it arrives.

**The finding, round 2 `E4-36`, MINOR.** `packages/app-core/src/help/help-browser.tsx:207` renders
`<p className="gn-help__results-count">` — **no role** — while the no-match arm `thirty lines below**
(`:684`, `gn-help__none`) carries `role="status"`. So the help search **announced "nothing matches" and
stayed silent when it found nine things.** Measured on `/help` at 1512, owner: after typing `invite` into
the search (`aria-label="Search the manual and FAQ"`, via the input's value setter + an `input` event),
`document.querySelectorAll('[role=status],[aria-live]')` → **none**, while the count paragraph rendered
`9 answers for “invite”` and nine `li.gn-help__result`. The mechanic the judge corrected is recorded rather
than repeated: the finding's *"`.gn-help__nav-link` first appears 2026-09-15"* mechanism is FALSE
(`git log -S` puts it at `8079e999`); the core — a status role on one arm and not the other — holds.

### The case

- ✅ **T-E4-36 — a search that finds something puts the count in a live region, the count is NOT a live
  region before there is anything to announce, and the result link meets the 24-px in-list floor.**
  `packages/app-core/test/help/help-browser.test.tsx`. **The count is the answer to the question the reader
  just asked by typing** — it is the one thing on the screen that changed — so a polite live region is what
  the sentence was missing, not a different string. `role="status"` and not a bare `aria-live`: that role
  IS `aria-live="polite"` with a name, and it is the idiom the sibling arm already uses. The negative half
  stops the first assertion being satisfied by a page that renders a status element unconditionally: an
  empty search box draws no count and therefore no status. The second half of the remedy —
  `min-height: 1.5rem` on `.gn-help__result-title` — is read out of `ui.css` the way this repo's other
  cross-package cases do, with `display: inline-flex` asserted alongside it because an inline element's
  height is its line box. `ui.css` and `help-browser.tsx` were reverted to `HEAD` for the RED run (with a
  rebuild, so the revert reached the compiled artifact) and restored from sha256-compared backups. Package
  suites: ui 426, app-core 1731, web 654.

**No `Features.md` bullet.** This corrects an existing sentence's announcement; it adds no affordance.
