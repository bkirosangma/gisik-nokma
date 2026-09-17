# Filters: an exclude mode, reaching every tab

**Date:** 2026-09-17
**Branch:** `owner/workspace-edits`
**Owner's words:** "currently for filters, it is only an includes filter. need
an exclude filter as well (tickets which falls under that filter -> tickets
which does not fall under that filter -> all tickets)." Then, asked whether the
filter should stay board-only as the include filter is today: "make the filter
reach other tabs as well." Then, on mixing include and exclude values on one
axis: "per value mixing is allowed."

## What this is

Two changes to the project page's one `filter` state
(`apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx`), designed together
because the second decides the shape of the first:

1. **Every value in the Filters sheet becomes tri-state** — off → include →
   exclude → off — and the filter vocabulary gains an `exclude` half so the
   choice can be represented, evaluated, disclosed and cleared.
2. **The filter narrows all four tabs**, not the board alone. Today
   `matchesBoardCard` narrows the board and the List/Calendar/Timeline tabs
   show a note apologising that what is set is not applied there. After this,
   the same filter — include and exclude, and the search box, which lives in
   the same state — narrows the list rows those three tabs draw from, and the
   narrowing strip (chips, "N of M shown", unapplied-axes note) renders on
   every tab.

## What was found before designing (facts the design rests on)

- **The filter is client-side, and stays so.** The wire filter
  (`filterSpecSchema`) takes ONE value per axis and has no negation term at
  all; `toServerFilterSpec` (`packages/app-core/src/online/mappers.ts:837-876`,
  re-pointed 2026-09-17 — was `:836-859` before this plan's own exclude
  refusal shifted the block) refuses anything wider rather than sending a
  narrower question. `page.tsx`'s own docblock (`:187-191`, re-pointed
  2026-09-17 — was `:180-184`) already records this: "'not done' needs either
  a plural `stateCategory` on the route or a negation term, and today it has
  neither."
- **Every tab already holds the complete project.** The server list route is
  paginated (cursor, 200 rows a page), but the client walks every page and
  returns the whole set, up to a 2000-row cap past which it refuses loudly
  (`ServingGapError`, `online-data-source.ts:215-247`); the board route
  returns the whole board in one read. There is no UI pagination anywhere. So
  a client predicate over the rows each tab already has is complete, not a
  sample.
- **The page's filter never reaches the wire.** `useTicketList` is handed
  `listFilter`, which carries only the "active only" toggle; no saved-filter
  control is mounted on the project page. `toServerFilterSpec` is therefore
  unreachable from this state today — the refusal it gains below is a fence
  for a future caller, not a live path.
- **List rows can answer more axes than board cards.** `ListRow`
  (`view-types.ts:180-221`, re-pointed 2026-09-17 — was `:159-200` before
  `IdAxes` was declared above it; the same range shifted by the inserted
  lines, it already ran past the type's closing brace before this plan)
  carries `assignee`, `typeId`, `stateId`, `stateCategory`, `title`,
  `dueDate` and `fields`; it lacks collaborators.
  `BoardCard` carries no collaborators, no dates and no fields.
- **The disclosure machinery exists and is reused, not duplicated.**
  `describeUnappliedBoardAxes`, `buildBoardFilterChips`,
  `shouldRenderBoardNarrowingStrip` (`apps/web/src/board-search-scope.ts`) and
  the `FILTERS_SHEET_CLEARABLE_AXES` list that "Clear all" and its test both
  read (`page.tsx`) — whose docblock records the same "cleared a different set
  than it claimed" bug landing twice (Rulings 12 and 13).

## Approaches considered

- **A — one nested `exclude`, one predicate per row shape, client-side on all
  tabs.** Chosen; the rest of this document.
- **B — a per-axis mode flag** (`assigneeMode: 'include' | 'exclude'`).
  Rejected: the owner ruled per-value mixing IN, and six flags buy a strictly
  weaker model.
- **C — server-side.** Rejected for this change: no negation on the wire,
  every tab is already complete client-side, and it pays off only past the
  2000-row cap. Recorded as the follow-on in §8.

## 1. Data model

One vocabulary for the six id axes, declared once and used twice
(`packages/app-core/src/view-types.ts`):

```ts
/** The six id-shaped axes — every one a list, an absent or empty list narrows nothing. */
export type IdAxes = {
  assigneeIds?: string[];
  collaboratorIds?: string[];
  typeIds?: string[];
  stateIds?: string[];
  stateCategories?: StateCategory[];
  projectIds?: string[];
};

export type FilterSpec = IdAxes & {
  text?: string;
  dueBefore?: string;
  dueAfter?: string;
  fields?: Record<string, string>;
  /** The exclude half: a ticket matching ANY listed value on an axis is dropped. */
  exclude?: IdAxes;
};
```

Semantics, per axis: a ticket must match one of the includes (when any are
set) **and** none of the excludes. An id is never in both lists at once — the
sheet's cycler guarantees it (§4), and the predicates do not need to care.
`text`, `dueBefore`/`dueAfter` and `fields` have no exclude form.

The per-view specs `Pick` from both halves, so an axis a row shape cannot
answer is a compile error, not a wrong answer on screen — the exact rule
`board-filter.ts`'s docblock already states for the include half:

```ts
type BoardIdAxes = Pick<IdAxes, 'assigneeIds' | 'typeIds' | 'stateIds' | 'stateCategories' | 'projectIds'>;
export type BoardFilterSpec = Pick<FilterSpec, 'text'> & BoardIdAxes & { exclude?: BoardIdAxes };

type ListIdAxes = BoardIdAxes; // a ListRow answers the same five id axes and no collaborators
export type ListFilterSpec = Pick<FilterSpec, 'text' | 'dueBefore' | 'dueAfter' | 'fields'> &
  ListIdAxes & { exclude?: ListIdAxes };
```

The domain's wire `filterSpecSchema` is untouched.

## 2. Predicates

Three predicates, one per row shape, all honouring `exclude`:

- `matchesFilter(state: TicketState, spec: FilterSpec)` —
  `filter/matches-filter.ts`, already used by `calendar-model.ts`,
  `timeline-model.ts` and `replica-data-source.ts`. Gains the exclude checks
  after its include checks. Collaborators: excluded when ANY of the ticket's
  collaborators is listed.
- `matchesBoardCard(card, column, projectId, spec: BoardFilterSpec)` —
  `filter/board-filter.ts`. Gains the exclude checks over its five axes.
- `matchesListRow(row: ListRow, projectId, spec: ListFilterSpec)` — NEW,
  `filter/list-filter.ts`. Assignee, type, state, category, project, title
  text (`row.title`, the same titles-only divergence the other two state),
  due bounds (`row.dueDate?.date`, inclusive at both ends, undated excluded —
  `matchesFilter`'s own rule), field clauses (`row.fields`, `eq` only, the
  same `claimText` rendering), and the five exclude axes.

A small shared helper module, `filter/id-axes.ts`, holds the two base rules
so the three predicates cannot drift on them: `narrowsTo(list, value)` ("an
absent or empty list does not narrow; otherwise the value must be listed") and
`excludedBy(list, value)` ("an absent or empty list excludes nothing; otherwise
the value must not be listed"). `claimedDueDay`/`claimText` move out of
`matches-filter.ts` into the same helper so `matchesListRow` reads them rather
than re-deriving them. The agreement tests (§6) remain the real guard.

`toServerFilterSpec` (`online/mappers.ts`) throws
`UnexpressibleFilterError('exclude', 'filterSpecSchema has no negation term')`
when any `exclude` axis is non-empty — the same shape as its plural-axis
refusal, for the same reason: a silently dropped negation would answer a
different question and label it with the user's.

Disclosure helpers (`apps/web/src/board-search-scope.ts`):

- `describeUnappliedBoardAxes(filter)` also reports `exclude.collaboratorIds`
  under "collaborator".
- `describeUnappliedListAxes(filter)` — NEW — reports "collaborator" when
  either half sets it; nothing else, since a list row answers every other axis.
- `shouldRenderBoardNarrowingStrip` is renamed `shouldRenderNarrowingStrip`;
  its three terms are unchanged and now evaluated per tab.
- `buildBoardFilterChips` emits, per axis, one chip for the include half
  (unchanged) and one for the exclude half: key `exclude.<axis>`, label
  "Not assignee: Raj" / "Not type: Bug" / "Not state: Done" / "Not category:
  Terminal" / "Not project: 2 selected", `onRemove` clearing only that half.
  Renamed `buildFilterChips`, since it no longer describes the board alone.

## 3. Page wiring

In `page.tsx`:

- `listFilterSpec` is the one enumeration of `ListFilterSpec` axes from
  `filter`, beside the existing `boardFilter` enumeration (the "ONE
  enumeration" the docblock there insists on — a future axis has one object
  literal per view to update).
- `listNarrowing = { rows, shown, total }` — `list.rows` narrowed once through
  `matchesListRow`; `null` while `list.rows` is null. `TicketList`,
  `dateInputs` (and through it `CalendarView`/`TimelineView`) consume
  `listNarrowing.rows`.
- The create dialog's `parentCandidates` keep the UNnarrowed rows — a parent
  picker that hid tickets because of a view filter would be the "page asserts
  they do not exist" failure this shell refuses. `labels.epicTitle` also looks
  up in the unnarrowed rows, so an epic the filter dropped still names itself
  above its surviving children; its `activeOnly` fallback sentence stays.
- The strip renders on every tab. Board: as today, its gate fed by
  `boardNarrowing` and `boardUnappliedAxes`. Other tabs: gate fed by
  `listNarrowing.shown/total` and `listUnappliedAxes`; chips are
  `activeFilterChips` alone — the workflow-picker chip narrows groups the
  board renders and is meaningless elsewhere. One strip component, rendered
  once with per-tab inputs, not two strips.
- The mirror note (`search-not-applied-note`) and its docblock are deleted.
  The thing it apologised for is no longer true.
- The "active only" toggle is untouched: still a server-side narrowing of
  `useTicketList`, still named through `TicketList`'s `narrowing` prop, which
  renders "narrowed to {word} — not the whole project" in the summary row
  (`ticket-list.tsx:181-184`). The word becomes the join of whatever is in
  force: "tickets in progress" (toggle), "your filters" (any chip or
  unapplied axis), or "tickets in progress and your filters" (both);
  `undefined` when neither, so the unnarrowed count still reads as the
  project's own. Built by one small pure function beside the page's other
  narrowing helpers, tested for all four combinations.

## 4. Controls and chips (the Filters sheet)

Every value in the sheet — the person rows for Assignee/Collaborators and the
chips for Type/State/Category — becomes ONE control shape: a cycling
`<button>`, off → include → exclude → off. The person row keeps its avatar
(`aria-hidden`, as today) and name; its native checkbox goes, because a
checkbox cannot say "exclude" (indeterminate means "some of my children") and a
checkbox that cycled through three states would lie about its own semantics.

Three states, three signals, none carried by colour alone (ui-ux-pro-max:
"don't convey information by color alone"; "interactive elements need
accessible names"):

| state | ground | text | glyph | label |
|---|---|---|---|---|
| off | `--gn-fill-tertiary` | `--gn-text` | empty ring | plain |
| include | `--gn-accent` | `--gn-accent-text` | check | plain |
| exclude | `--gn-fill-tertiary` | `--gn-text` | ⊘ (circle-slash) | `text-decoration: line-through` |

Not danger red for exclude — exclusion is a choice, not an error. Glyphs are
inline SVG (`currentColor`, `aria-hidden`), the established idiom
(`inbox/icons.tsx`). Row height ≥ 2.75rem (the 44px touch floor this repo
already measures); `:focus-visible` ring as `.gn-filters__chip` has now;
`data-mode="off|include|exclude"` is the ONLY styling hook, keyed off the
real state rather than a parallel class.

Accessibility: `aria-pressed` is binary and would lie for three states, so it
is removed from these buttons and the state lives in the accessible NAME via
visually-hidden text — "Uma, included", "Uma, excluded", "Uma". A
screen-reader user hears the state on focus; after activation the button's
name has changed and is re-read on the next focus, which is the same contract
`aria-pressed` gave. No live region: the strip's chips already change in the
DOM, and announcing every cycle would be noise.

Pure logic in `apps/web/src/filter-cycle.ts`, tested directly:

```ts
export type ChoiceMode = 'off' | 'include' | 'exclude';
export function choiceMode(filter: FilterSpec, axis: keyof IdAxes, id: string): ChoiceMode;
export function nextMode(mode: ChoiceMode): ChoiceMode;          // off → include → exclude → off
export function withCycledId(filter: FilterSpec, axis: keyof IdAxes, id: string): FilterSpec;
```

`withCycledId` moves the id between the two halves and never leaves it in
both; a half that empties collapses to `undefined`, not `[]` (the existing
`toggledArray` convention, so a fully-deselected axis is indistinguishable
from one never touched). `withToggledId` is replaced by it.

"Clear all" clears `exclude` too: `FILTERS_SHEET_CLEARABLE_AXES` gains
`'exclude'`, and `clearFilterAxes` resets it — that one exported list is what
the button and `filters-sheet.test.tsx` both read.

The narrowing strip's exclude chips (§2) carry the same ⊘ glyph before their
"Not …" label.

## 5. Edge cases

- An excluded id that no longer resolves (a member who left the roster, a
  retired type) shows its raw id in the chip, as the include chip does today
  through the resolvers' fallback; the sheet no longer lists it, so the chip's
  × is the only way to clear it — which is why every exclude chip is
  removable.
- A filter that excludes everything: the board shows its empty state under a
  "0 of N shown" strip through the existing `isNarrowed` machinery (Ruling
  19); the list shows `TicketList`'s empty state with the narrowing word.
- `exclude.stateCategories` and the "active only" toggle compose: the server
  narrows to active, the client then drops any excluded category. Excluding
  "active" with the toggle on yields an empty list, honestly disclosed by both
  the toggle's note and the strip.
- Mixed include and exclude on one axis (`assigneeIds: [Uma]`,
  `exclude.assigneeIds: [Raj]`) evaluates to "Uma" — redundant, harmless, and
  the sheet shows exactly what is set.
- The text search reaches all tabs now, titles only, as the board's own
  divergence note states; the server's full-text `search` projection is not
  used by this page and this change does not start using it.

## 6. Testing

TDD per axis, mutation-checked in the suite's style (delete a check, watch
the case that owns it fail, restore from a scratchpad backup). Node 22 for
every gate.

- `filter/matches-filter.test.ts` — exclude per axis; the "absent list
  excludes nothing" rule; collaborators any-of.
- `filter/board-filter.test.ts` — agreement with `matchesFilter` over one
  ticket rendered as a card, include AND exclude.
- `filter/list-filter.test.ts` (new) — agreement with `matchesFilter` over
  one ticket rendered as a `ListRow`, every axis it answers; due bounds and
  field clauses at parity with `matchesFilter`'s own tests.
- `filter/id-axes.test.ts` (new) — the two base rules.
- `online/mappers.test.ts` — `toServerFilterSpec` refuses a non-empty
  exclude, names the key; an empty `exclude: {}` is not refused.
- `apps/web/test/board-search-scope.test.ts` — exclude chips per axis with
  their labels and one-half removal; `describeUnappliedListAxes`; the renamed
  gate.
- `apps/web/test/filter-cycle.test.ts` (new) — `choiceMode`, `nextMode`,
  `withCycledId` never leaves an id in both halves, collapses to `undefined`.
- `apps/web/test/filters-sheet.test.tsx` — a row cycles through three
  accessible names; the exclude state renders `data-mode="exclude"`; "Clear
  all" clears `exclude` (the one-list assertion extended); `aria-pressed`
  absent.
- `apps/web/test/board-narrowing.test.tsx` — List/Calendar/Timeline rows
  narrowed by include and by exclude; strip on each tab with its own count;
  the mirror note gone (13.517 flipped to assert the strip); parent picker
  unnarrowed.
- `Features.md` and `test-cases/13-deployment-dogfooding.md` in the same
  change set; new case ids continue from `13.538`.

## 7. Files

- `packages/app-core/src/view-types.ts` — `IdAxes`, `FilterSpec.exclude`.
- `packages/app-core/src/filter/id-axes.ts` (new), `matches-filter.ts`,
  `board-filter.ts`, `list-filter.ts` (new); `index.ts` exports.
- `packages/app-core/src/online/mappers.ts` — the refusal.
- `apps/web/src/board-search-scope.ts` — chips, list axes, renamed gate.
- `apps/web/src/filter-cycle.ts` (new), `apps/web/src/tri-state-choice.tsx`
  (new, the button).
- `apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx` — wiring, sheet.
- `packages/ui/src/ui.css` — `.gn-filters__choice[data-mode=…]`, the strip's
  exclude chip.
- Tests as in §6; `Features.md`; `test-cases/`.

## 8. Named, not built

- **Server-side negation and plural axes** — wire schema, `compile-filter.ts`,
  `toServerFilterSpec`. Worth doing only past the 2000-row cap.
- **Filter state in the URL** — ui-ux-pro-max's "URL should reflect current
  UI state". Today's include filter is not there either; a separate change.
- **Date and field controls in the sheet** — still none. `matchesListRow`
  answers both, so a future control narrows every tab without touching the
  predicates.
- **State options' source.** The sheet's State chips come from the board's
  rendered columns (`boardStateOptions`). The backlog/closed change set (its
  own spec, next) adds states the board does not show; that spec moves the
  source to the workflow definitions. Nothing here depends on which.
- **Wildcard-only workflows and `stateIds`** — unchanged.

## Amendments during execution (2026-09-17)

1. **§4's accessible name is set via `aria-label`, not a visually-hidden
   suffix span.** `TriStateChoice` builds its accessible name from a new
   `label: string` prop; `children` stays `ReactNode`, free to carry the
   person row's avatar beside the name. The brief's original mechanism — a
   visible label span plus a visually-hidden sibling span carrying the state
   suffix — measured RED on its own test: the accessible-name-from-content
   algorithm joins sibling text contributions with a synthetic space, so
   "Uma One" + ", included" computes to "Uma One , included", not the exact
   string §4 requires. `aria-label` is the only mechanism that yields the
   exact string, so the `.gn-visually-hidden` utility named in the original
   design was never shipped, and 13.551 does not assert it.
2. **§3's scope note names the tab it renders on.** "Not applied on the
   board/list/calendar/timeline: …" reads its noun from `TAB_NOUN`, a
   `Record` over the `view` union — TypeScript requires an entry for every
   member, so a fifth tab added later without a matching noun is a compile
   error rather than a silent fallback (13.556b).
3. **§2's wire refusal is reachable today, through `toServerPreferences`.**
   `toServerPreferences` maps every saved filter through `toServerFilterSpec`
   (`online/mappers.ts:1018`); a `SavedFilter` carrying a non-empty `exclude`
   throws `UnexpressibleFilterError` uncaught. No code path writes such a
   saved filter today — the project page mounts no saved-filter control — so
   this is not a live bug, but whoever wires a save-filter control onto a
   filter that can now exclude owes that control a catch/translate layer, so
   the person who triggers it sees a sentence about what their filter cannot
   express, not `UnexpressibleFilterError`'s developer-facing string.
