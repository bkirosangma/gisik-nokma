# 13. Owner requests, backlog and closed — test cases

Part of bucket 13 (`Features.md` §13) — one part-file of the catalogue split performed 2026-09-19.
Index and id-block allocation: [`13-deployment-dogfooding.md`](./13-deployment-dogfooding.md).
Case ids are unchanged and are never renumbered by the split.

## The whole card opens the ticket (owner request, 2026-09-17)

Before this, only the title button on a board card opened the ticket sheet; the owner asked for a click
anywhere on `.gn-board-card` to open it, "but take care that dragging the ticket does not open it". The
listener lives on the `<li class="gn-board__card-slot">` wrapper — extracted into `BoardCardSlot`
(`board.tsx`) so it can hold a ref — never on `Card` (`packages/ui`, documented "never itself
interactive") and never as a `role="button"` (the card already contains buttons). The title stays a real
`<button>`: the keyboard path and the accessible name are unchanged. Two bail-outs, both proven by
deletion below: a click whose target sits inside a control or inside the `TransitionDialog` subtree
(`CARD_CLICK_BAIL_SELECTOR`) is that thing's click, and a click that follows `dragstart` is the tail of a
drag. The flag clears on the NEXT `mousedown`, not on `dragend` (which precedes any stray click the same
gesture could produce) and not on a timer. Suite: `packages/app-core/test/views/board-card-click.test.tsx`
(6 cases), `packages/ui/test/components.test.tsx` (`13.523`). All under Node v22.23.2.

- **13.518** ✅ A click on the card body itself (`.gn-board-card`, no `moves` wired — the read-only path)
  calls `onOpenTicket` exactly once with that ticket's id.
- **13.519** ✅ A click on the title button still opens the ticket EXACTLY ONCE. The button's own `onClick`
  opens it and the click then bubbles into the slot's listener; the `closest()` bail is what stops a
  second open. Mutation M2 (bail deleted) → this case fails with 2 calls.
- **13.520a** ✅ A click on the provenance toggle unfolds it (`aria-expanded="true"`) and does NOT open the
  ticket. M2 → fails.
- **13.520b** ✅ A click on a live `›` arrow submits the move (`onMoved` called) and does NOT open the
  ticket. M2 → fails.
- **13.521** ✅ THE GUARD THE REQUEST IS ABOUT. `mousedown` → `dragstart` (real `DataTransfer` stand-in,
  the same one `board-drag-drop.test.tsx` documents) → `click`: swallowed, zero calls. Then a fresh
  `mousedown` → `click`: opens once — the positive control for the first half. Mutation M1 (the
  `draggedRef` check deleted) → first half fails; mutation M3 (the `mousedown` reset deleted) → second
  half fails with `expected 1, got 0`. Native drag-and-drop withholds `click` after a completed drag in
  every browser this product targets, so in the field this is belt-and-braces; in jsdom, which drags
  nothing, it is the only observable proof.
- **13.522** ✅ THE HAZARD THAT ONLY EXISTS BECAUSE THE DIALOG RENDERS INSIDE THE CARD: `MoveArrows`
  mounts `TransitionDialog` under the card and `Dialog` (`packages/ui`) does not portal; its scrim closes
  the dialog on click WITHOUT stopping propagation. Reached through a REAL arrow click on a workflow
  whose `todo → doing` edge requires a comment (`WF_GATED`), then a click on `dialog-scrim`: the dialog
  closes and `onOpenTicket` is NOT called. M2 → fails (the sheet would open as the dialog closed).
- **13.523** ✅ CSS binding, `packages/ui/test/components.test.tsx`: the bare `.gn-board__card-slot` rule
  sets `cursor: pointer` (a card that can be opened but not dragged — the read-only path — looks
  clickable) AND `.gn-board__card-slot[draggable="true"]` still sets `cursor: grab` (`13.513`'s own
  assertion, repeated here because the new bare rule sits immediately above it and loses on
  specificity by design). Watched fail RED with `no rule for .gn-board__card-slot` before the rule
  existed.

Mutation results, `board-card-click.test.tsx`, each run against a scratchpad backup and restored
byte-identical (`cmp`): M1 kills `13.521` only; M2 kills `13.519`, `13.520a`, `13.520b`, `13.522` and
nothing else; M3 kills `13.521` only. `13.518` survives all three, as it should — it is the positive
case none of the guards touch. Full `app-core` suite 1281/1281, `ui` 311/311, `apps/web`
`board-narrowing` + `filters-sheet` 34/34, `app-core` typecheck clean, Node v22.23.2.

Known limit, named rather than hidden: selecting text inside a card body by mouse-drag on the READ-ONLY
board (where the slot is not `draggable`, so no `dragstart` fires) ends in a `click` and opens the ticket.
The title is a button and the meta chips are short, so there is little to select; no guard was added for
it because jsdom has no honest way to fail such a case.

Citations displaced by this change set, re-pointed against the current tip (Ruling 30's own method —
opened the file, never added an offset): `BoardCardSlot` and its docblock land ABOVE `BoardCardView`, so
`<Card className={card.pending …}>` moved `board.tsx:650` → `:719` (`Features.md`, this file's Task 6
narrative, the port plan `:751`); the bare `.gn-board__card-slot` rule and its comment add five lines to
`ui.css`, so `.gn-timeline__weeks` moved `ui.css:1934-1937` → `:1939-1942` (this file, the Ruling 21
narrative). Every other `ui.css` citation past `:514` was checked against HEAD and found ALREADY stale
before this change (e.g. `ui.css:1321` cited as "sets `font-size: 1rem`" points at `cursor: pointer;`);
left untouched — not this change's drift, and a blind `+5` would have moved wrong numbers to different
wrong numbers. `scripts/check-case-citations.mjs` reports `13.401`/`13.476`/`13.477`/`15.26` uncited —
all four already uncited at HEAD (`git grep` on the tests at HEAD finds none), pre-existing on this
branch and not touched here; the six new cases are each cited by id in their test file.

## Move arrows: one declared target moves, several ask (owner request, 2026-09-17)

Owner's words: "The next button: this needs care, as the ticket may be able to move to different columns.
If multiple paths exist for the column, on clicking next, it should open up a modal to select which. Also
this modal will be used if any comments/attachments required rules are there on the workflow." Rulings
taken in the brainstorm: `›` offers forward targets only, `‹` backward only (symmetric); a single target
that carries a rule opens the dialog ALREADY AIMED at it. Task 13 shipped the arrows on `arrowTarget` —
the NEAREST declared target — so `WF_ERRAND`'s `doing` (forward: `waiting`, then `done`) silently took
`waiting` and `done` was unreachable by arrow at all. Now `arrowTargets` (the same walk, kept in full;
the singular is defined as its head) drives each arrow: one entry → `attemptMove`, unchanged; several →
`TransitionDialog` as a picker over exactly those (`offerStateIds`), aimed when one (`initialToStateId`).
`MoveArrows` mounts the dialog only while its `dialog` state is non-null — a fresh mount per open.
Suites: `board-arrows.test.ts`, `transition-dialog.test.tsx`, `board-moves-ui.test.tsx`,
`board-drag-drop.test.tsx`. Every case watched RED first (the plural "is not a function", the picker
labels absent, the dialog on "Choose a state" with three options). Node v22.23.2 throughout.

- **13.524** ✅ `arrowTargets(WF_ERRAND, order, 'doing', 'next')` is `['waiting', 'done']` — nearest
  first — and `arrowTarget(...)` equals its head, asserted as `toBe(arrowTargets(...)[0])` so a second walk
  that disagreed would fail here by name.
- **13.525** ✅ Backward from `done`: `['doing', 'todo']` — `waiting` between them is NOT declared from
  `done` and is skipped (`13.494`'s skip, in list form); the wildcard `* → todo` is included, after the
  nearer exact edge.
- **13.526** ✅ `[]` wherever the singular answered `null`: nothing declared that way (`todo` previous,
  `done` next) and a column the def does not know.
- **13.527** ✅ `TransitionDialog` with `offerStateIds: ['waiting', 'done']` from `doing` offers EXACTLY
  `Waiting on counterparty, Done` in declaration order; `To do` (declared via the wildcard, but not
  offered) is absent. Mutation M4 (the filter replaced by `() => true`) → fails.
- **13.528** ✅ `initialToStateId: 'done'` opens with the trigger reading `Done` (not "Choose a state"),
  the comment box already on screen, Move disabled until it is filled; filling and pressing Move hands
  back `{ toStateId: 'done', comment: 'shipped', fieldValues: {} }`. M5 (`useState('')`) → fails.
- **13.528b** ✅ The control: neither prop → placeholder and all three options, exactly as before.
- **13.529** ✅ THROUGH THE BOARD. Card in `doing`; `›` is enabled and named "Move to next state —
  Waiting on counterparty or Done"; the click opens the dialog on "Choose a state"; the select lists
  exactly `[Waiting on counterparty, Done]` and NOT `To do`; picking the rules-free one and pressing Move
  ingests ONE `ticket.transitioned` with the shipped `{ to: 'waiting' }` and calls `onMoved`. M4 → fails
  (`To do` appears); M6 (several targets take the nearest, Task 13's behaviour restored) → fails (no dialog,
  a direct submit instead).
- **13.530** ✅ `‹` MIRRORED — on a def built so the negative can fail. From `WF_ERRAND`'s `done` every
  declared target is backward, so "offers only the backward ones" passed under M4 in the first draft of
  this case (measured; a check that could not fail). Rebuilt on `WF_ERRAND` + `waiting → done`, card in
  `waiting`: `‹` reads "Move to previous state — Doing or To do", the picker offers `Doing`/`To do` and
  NOT `Done`, which `transitionOptions` does declare from `waiting`. M4 → fails; M6 → fails.
- **13.531** ✅ ONE gated forward target (`todo → doing` with `require-comment`, `13.501`'s idiom): the
  arrow keeps its plain name "Move to Doing"; the dialog opens with the trigger reading `Doing` and the
  comment box visible with NO pick; typing and Move ingests `{ to: 'doing', comment: { text } }`. M5 →
  fails. `13.501`'s docblock, which said the dialog was NOT pre-aimed, is corrected; its re-pick of "Doing"
  is kept deliberately — it now proves the select is live over a one-entry offer, not a dead control.
- **13.532** ✅ A cancelled pick does not survive into the next open: pick `Done`, Cancel, click `›`
  again → "Choose a state". Before, the dialog stayed mounted while closed and its `toStateId` state
  survived. M6 → fails (the second `›` never opens a dialog).
- **13.533** ✅ (in `13.509`'s own case) A DROP on the gated `doing` column opens the dialog aimed at
  `doing`, comment box on screen — "what the gesture meant" for the drop path. M5 → fails.
- **13.534** ✅ THE FLAKE MADE DETERMINISTIC. While gating this work on a machine at load average 11.5,
  `13.507`, `13.514` and `13.515` each failed once, in separate runs, with one signature: the drop did
  NOTHING — no `onMoved`, no notice of any kind in the DOM dump, the case dying at `waitFor`'s 1000 ms
  (1070/1068/1025 ms measured against ~20 ms for a pass). Mechanism: `settled()` returns when the arrows
  are IN THE DOM (a MutationObserver microtask), while the drop registry was filled by a PASSIVE effect
  React schedules as a later macrotask for a render a promise resolution triggered; under load the drop
  could look before the effect ran, and `13.511` documents that a drop with nothing registered is silent.
  This case fires the drop from INSIDE a MutationObserver callback of its own — the same microtask slot,
  never later — and failed 3/3 RED under `useEffect` (`expected [] to have a length of 1`), then passed
  3/3 under `useLayoutEffect`, which registers synchronously inside the commit that paints the card
  `draggable="true"`. Ruling 15 from the other side: an affordance the DOM shows is live the instant it
  is shown. Nothing else about the registration changed. The commit message's "React 19.2.8, no SSR
  warning" is from React 19's own changelog (the `useLayoutEffect`-on-the-server warning was removed),
  NOT measured here — vitest/jsdom is not SSR; the stronger reason no warning could fire is structural:
  `MoveArrows` mounts only after `useLiveQuery` resolves the workflow read, which never happens during a
  prerender.

Mutations (scratchpad backups, restored byte-identical by `cmp`): M4 kills `13.527`, `13.529`, `13.530`;
M5 kills `13.528`, `13.531`, `13.533`; M6 kills `13.529`, `13.530`, `13.532`. Gate after the last edit:
`app-core` 1292/1292 twice in a row, `ui` 311/311, `apps/web` 364/364 (the whole suite), both typechecks
clean, Node v22.23.2.

Citations displaced and re-pointed against the tip: `TransitionDialogProps` gained two documented props
(+21 lines) and the component two lines of destructuring and two of filtering, so `transition-dialog.tsx:158`
→ `:183` and `:232` → `:257` (Task 12 narrative, above), `:286-289` → `:311-314` (Task 13 narrative and
`board.tsx`'s own `submitFromDialog` docblock). `board-moves.ts:67`'s wrapped `transition-dialog.tsx: 241-248`
(the restrict-to notice) was ALREADY stale at HEAD — that notice sat at `:271` before this change — and is
left alone for the same reason as the `ui.css` ones above.

Named, not absorbed: the board path still passes `ticketFields={{}}` / `moveOutcome(…, {})`, so
`require-field` is always treated as unmet there (`MoveArrows`'s own docblock, "the conservative reading of
an honest absence"). `BoardCard` carries no field claims; fixing it needs data the board does not have.

## The whole card opens the ticket — the portal the first pass missed (review, 2026-09-17)

Advisor review of the two change sets above raised what the six cases in `board-card-click.test.tsx`
could not see: `Select` (`packages/ui`) portals its dropdown panel to `document.body`. React synthetic
events bubble through the REACT tree, so a click inside that panel reaches `BoardCardSlot`'s `onClick`;
`closest()` walks the DOM, where the panel's ancestors are itself and `body`, and can match nothing in
`CARD_CLICK_BAIL_SELECTOR`. And `13.529` had just made that dropdown the primary path for a multi-target
move. Measured before designing anything, in three cases (same file):

- **13.535** ✅ THE FACT: with the picker's dropdown open, `listbox.closest('.gn-board__card-slot')` is
  `null`. Established rather than assumed; the next two rest on it.
- **13.536** ✅ An OPTION click does NOT open the ticket — and not because of anything in
  `BoardCardSlot`: react-aria's `usePress` (behind `useOption`) stops the synthetic `click`, so it never
  arrives. Named as the positive control it is. Deleting the `contains` guard leaves it green; deleting
  `closest()` fails it at the `›` ARROW click on the way in, never at the option.
- **13.537** ✅ THE CLICK THAT DOES ARRIVE: `.gn-select__panel` carries `0.25rem` of padding (`ui.css`),
  plain DOM with no press handling. A click there — the dropdown's edge, its scrollbar gutter — bubbles up
  through the portal to the slot. First run: GREEN with no new guard, which meant something else was
  bailing; found by reading the React tree, then PROVED by mutation: `Dialog`'s own
  `<section role="dialog" onClick={stopPropagation}>` (`packages/ui/src/components/dialog.tsx`) sits on
  the portal's React-parent chain and swallows the click on its way up. With that one line mutated to a
  no-op, `13.537` fails (`onOpenTicket` called) and `13.536` still passes (react-aria). That line exists
  for the scrim's sake, in another package; a card's click guard should not be correct only by courtesy
  of it. Guard added — `if (!event.currentTarget.contains(event.target as Node)) return;` ahead of the
  existing `closest()` bail — under the Dialog mutation as its RED: mutated Dialog + guard → 9/9 green;
  Dialog restored → 9/9 green; Dialog restored + guard deleted (M7) → 9/9 green, DOCUMENTED as expected:
  the guard's falsifier is the combined mutation, because two independent mechanisms now cover the same
  click. It names no library internals and catches any future portal from inside the card, whether or not
  a `Dialog` happens to sit above it in the React tree.

M1/M2/M3 re-run after the guard landed: M1 kills `13.521`; M2 kills `13.519`, `13.520a`, `13.520b`,
`13.522`, `13.536`, `13.537` (the last two at the arrow click on the way in); M3 kills `13.521` —
`contains` subsumed none of them, since every one of those targets is DOM-contained.

## Filters: exclude mode, reaching every tab (owner request, 2026-09-17)

The exclude-mode design (`docs/superpowers/specs/2026-09-17-filter-exclude-all-tabs-design.md`)
extends filter semantics to every tab by adding an `exclude` half to `FilterSpec`, eliminating the
need for per-tab filter variants. These eleven tasks build that capability from the vocabulary up.

- **13.538** ✅ `filter/id-axes.ts` — the two base rules (`narrowsTo`/`excludedBy`) and their any-of forms,
  plus `claimedDueDay`/`claimText` moved here unchanged; and `FilterSpec.exclude` typed as the same
  `IdAxes` the include half spreads in (a `@ts-expect-error` proves `text` has no exclude form).
- **13.539** ✅ `matchesFilter` honours `exclude` on all six id axes, after the include half; empty
  exclude lists exclude nothing; unassigned work survives an assignee exclusion; include+exclude on one
  axis = must match an include and none of the excludes. Mutation (the `typeIds` exclude line deleted)
  kills the type case and the composition case.
- **13.540** ✅ `BoardFilterSpec.exclude` is `BoardIdAxes` — `exclude.collaboratorIds` is a compile error
  (it would silently WIDEN the board: `excludedBy(list, [])` is never out).
- **13.541** ✅ `13.433`'s agreement corpus extended with eight exclude cases and a rejection control;
  mutation (the `stateIds` exclude line deleted) kills the `excluded state` case.
- **13.542** ✅ `matchesListRow` agrees with `matchesFilter` over one ticket rendered as a `ListRow` on 28
  cases spanning every axis it serves — the five id axes, text, both due bounds (inclusive; undated
  excluded), field clauses (string, number-as-text, mismatch, unknown) and the exclude half — with a
  rejection control. Mutations: `dueAfter` line → its case fails; `projectIds` exclude line → its case fails.
- **13.543** ✅ `ListFilterSpec` rejects `collaboratorIds` in both halves at compile time.
- **13.544** ✅ `toServerFilterSpec` throws `UnexpressibleFilterError('exclude', …)` naming the axes on any
  non-empty exclude; an empty object or empty lists pass through unrefused.
- **13.545** ✅ `withIdAxis` (`apps/web/src/filter-edits.ts`) — the one writer of either half of one axis:
  empty list → `undefined`, an exclude half with no defined axis → `undefined`; pure.
- **13.546** ✅ `buildFilterChips` (renamed from `buildBoardFilterChips`) emits `exclude.<axis>` chips
  labelled "Not assignee/type/state/category/project: …" directly after each axis's include chip, with
  `mode`; an exclude chip's × clears only that half (the include half survives, and vice versa); the last
  exclude axis removed collapses `exclude`; empty lists earn no chip. Mutation (clearExclude clearing the
  whole half) kills the only-that-axis case.
- **13.547** ✅ `describeUnappliedBoardAxes` names collaborator for `exclude.collaboratorIds` (once);
  `describeUnappliedListAxes` names collaborator only — due dates and fields are answered by the list.
- **13.548** ✅ `choiceMode` reads a value's half (include wins if both); `nextMode` cycles off → include →
  exclude → off.
- **13.549** ✅ `withCycledId` moves a value between halves through `withIdAxis`, collapses what empties,
  repairs a both-halves shape, and over a full three-click cycle never leaves a value in both halves;
  works on the `StateCategory`-typed axis. Mutation (exclude-half removal skipped) kills the repair case.
- **13.550** ✅ `TriStateChoice` — accessible names "X" / "X, included" / "X, excluded" via `aria-label`
  built from a required `label: string` prop (the brief's verbatim code used a visually-hidden sibling
  span instead; measured RED — the accname algorithm joins sibling contributions with a synthetic space,
  producing "Uma One , included", not the exact string). Fix round 1 (2026-09-17) split `label` out of
  `children`: `children` is optional `ReactNode`, defaulting to `label`, free to carry a person row's
  avatar beside the name — proven by a case rendering an `aria-hidden` avatar span plus a name span as
  children and confirming all three exact names still hold. `data-mode` as the only hook, SVG glyphs
  `aria-hidden`, no `aria-pressed`, `onCycle` on click, variant class accepted.
- **13.551** ✅ CSS binding: include = accent ground + accent text; exclude strikes the label and never
  names `--gn-danger`; the row variant keeps 2.75rem. (Fix round 1 dropped the `.gn-visually-hidden` case
  and rule — the naming mechanism it served was replaced by `aria-label` before this task shipped, leaving
  it an unconsumed utility; removed as YAGNI rather than left as a rule nothing calls.)
- **13.552** ✅ Through the real sheet, a person row's accessible name walks "Uma One" → "Uma One, included"
  → "Uma One, excluded" → "Uma One", `data-mode` following, no `aria-pressed`.
- **13.553** ✅ Excluding an assignee drops that card from the board under "1 of 2 shown" with a
  "Not assignee: Uma One" chip (and no include chip); the chip's × restores both cards and the strip goes.
  Mutation (`boardFilter.exclude` forced `undefined`) kills this, 13.554 AND 13.555 — the last only because
  its own `1 of 2 shown` precondition reads the narrowed board, not because it independently exercises
  Clear-all-clears-exclude — while 13.552 stays green (the name cycles regardless of board wiring).
- **13.554** ✅ A type chip excludes (bug card gone, "Not type: Bug"); a category chip reaches the excluded
  state and empties the one-column board honestly ("0 of 2 shown").
- **13.555** ✅ "Clear all" clears an exclusion through the real button, without closing the sheet;
  `13.460` extended: `FILTERS_SHEET_CLEARABLE_AXES` names `exclude` and `clearFilterAxes` resets it.
- **13.556a** ✅ (Task 9 fix round 1, coordinator Important finding) An EXCLUDED collaborator — the one
  axis `boardFilter.exclude` cannot carry at all — is disclosed ONLY by the scope note
  (`describeUnappliedBoardAxes` → `collaboratorsSet` reading `filter.exclude?.collaboratorIds`), never by
  a chip in either direction, and narrows nothing (both cards stay, "2 of 2 shown"). Two clicks (off →
  included → excluded) show the note naming "collaborator"; a third (excluded → off) clears it. Mutation
  (`filter.exclude` dropped from `boardUnappliedAxes`'s deps in `page.tsx`) kills the THIRD click's
  assertion specifically — that transition is the one where `filter.collaboratorIds` itself does not
  change (`undefined` on both sides), so it cannot ride along on a co-occurring change to a still-watched
  dependency the way the first two clicks do; the stale note ("Not applied on the board: collaborator.")
  survives instead of clearing.
- `13.447`/`13.448`/`13.451`/`13.452`/`13.460` updated for the control change (checkbox → button;
  `aria-pressed` → `data-mode`).
- **13.556** ✅ `listNarrowingWord`: undefined / "tickets in progress" / "your filters" / both joined.
- **13.556b** ✅ (controller ruling, Task 10 fix round 1, 2026-09-17) The scope note names its OWN tab, not
  always "the board": on the List tab, an excluded collaborator (`ListFilterSpec`'s one unanswerable axis,
  same as the board's) narrows nothing and earns no chip, and `board-scope-note` reads "Not applied on the
  list: collaborator." — both list rows stay on screen, the strip itself still renders. Mutation (hard-coding
  `tabNoun` to `'board'`) kills it — the note then reads "the board" while sitting on the List tab.
- **13.557** ✅ The search box narrows the List tab: the non-matching row drops, the strip shows the LIST's
  own count ("1 of 2 shown", never the board's 3), the text chip is there, the old mirror note's testid
  is absent, and `TicketList`'s summary reads "narrowed to your filters". Mutation (`rows={list.rows}`)
  kills it via its row-absence assertion; the same mutation also killed 13.517 and 13.560, which assert
  row absence too.
- **13.558** ✅ The Timeline draws from the narrowed rows at TICKET LEVEL; the Calendar shows the same
  count ("1 of 2 shown" on each; no mirror note). The strip's own count is `listNarrowing`'s alone and
  cannot distinguish a correct `dateInputs` from a stale one, so the real proof is a title check on the
  Timeline tab (left active after the loop): a due-only fixture ticket lands in `TimelineView`'s own
  `sideList` ("Undated or partially dated"), which renders `entry.title` regardless of a missing
  `startDate` — Calendar's own due-only marker does not render the ticket's title at all, so Timeline is
  the tab that can prove this at ticket level (Calendar's own assertion stays at the count level). The
  fixture needs `fields.dueDate`/`fields.title` as real `FieldClaim`s (`fieldClaim()`), not the top-level
  `ListRow.dueDate` convenience field alone — `dateClaimOf`/`titleOf` read `row.fields` verbatim and never
  look at it. Mutation (`dateInputs` from `list.rows`) kills it.
- **13.559** ✅ Clearing the term restores the row and removes the strip on the List tab.
- `13.517` FLIPPED 2026-09-17 (see its own bullet above): an assignee picked in the sheet now NARROWS the
  list (the row assigned to someone else drops) and discloses through the strip; the note it asserted is
  gone along with the mechanism it disclosed.
- **13.560** ✅ An EXCLUDED assignee drops the row assigned to them on the List tab, "Not assignee" chip shown.
- **13.561** ✅ The create dialog's parent picker still offers a ticket the filter dropped — `parentCandidates`
  reads the unnarrowed rows. Passes unchanged before this task's implementation lands (`parentCandidates`
  already read unnarrowed `list.rows`) — a regression guard against a future narrowing reaching it, not a
  TDD RED/GREEN case for this task's own code.
- `13.439`/`13.444` retired (their subject — the mirror note — no longer exists); their numbers stay unused.

**Task 11 — final gate, catalogue checks, citation sweep, spec amendments (2026-09-17).** Node
`v22.23.2` for every command below (`source ~/.nvm/nvm.sh && nvm use 22`, printed once per shell and
re-confirmed before each run).

*Gate (all EXIT 0):* `packages/app-core` — `pnpm exec vitest run`: **1353 passed (1353)**;
`pnpm run typecheck`: clean. `packages/ui` — `pnpm exec vitest run`: **314 passed (314)**.
`apps/web` — `pnpm exec vitest run`: **405 passed (405)**; `pnpm run typecheck`: clean. `apps/server`
— `pnpm run typecheck` (`tsconfig.typecheck.json`): clean.

*Catalogue checks:* `node scripts/check-case-ids.mjs` — real sweep 2106 sum / 2103 union across 12
files; the only duplicates are `13.387` (three citations) and `13.413` (two), the known baseline,
unchanged by this plan. `node scripts/check-case-citations.mjs` — 1997 checked ✅ ids across 12
files, 1976 cited, 21 uncited; this file's own count is 444 cited / 3 uncited / 447 total, and the
three uncited ids are exactly `13.401`, `13.476`, `13.477` — the pre-existing baseline, and every
✅ id this plan minted (`13.538`–`13.561`, `13.556a`, `13.556b`) is cited. The ratchet also reports
regressions in `03-foundation-ledger.md` (1), `10-workflow-builder.md` (15),
`11-calendar-notifications.md` (1) and `15-in-app-help.md` (1) — pre-existing, in files this plan
never touched, left as found per the dispatch brief.

*Mutation summary, one line per task, read from each task's own catalogue entry:*

- **Task 1** (`13.538`) — type-level only: an `@ts-expect-error` on `exclude.text` and `BoardIdAxes`'s
  `Pick` stand in for a mutation; no runtime mutation is cited.
- **Task 2** (`13.539`) — deleting the `typeIds` exclude line kills the type case and the
  include+exclude composition case.
- **Task 3** (`13.540`–`13.541`) — `13.540` is compile-time (`exclude.collaboratorIds` on
  `BoardFilterSpec` is a type error, no runtime mutation); deleting the `stateIds` exclude line kills
  `13.541`'s excluded-state case.
- **Task 4** (`13.542`–`13.543`) — deleting the `dueAfter` line fails `13.542`'s due-bound case;
  deleting the `projectIds` exclude line fails `13.542`'s project-exclude case; `13.543` is
  compile-time (no runtime mutation).
- **Task 5** (`13.544`) — no mutation cited; the refusal is asserted directly against the exact axes
  named in the thrown error.
- **Task 6** (`13.545`–`13.547`) — mutating `clearExclude` to clear the whole half instead of one axis
  kills `13.546`'s only-that-axis case; `13.545`/`13.547` cite no mutation.
- **Task 7** (`13.548`–`13.549`) — skipping the exclude-half removal in the repair step kills
  `13.549`'s repair case; `13.548` cites no mutation.
- **Task 8** (`13.550`–`13.551`) — no mutation cited; verified instead against the brief's own
  rejected mechanism (the visually-hidden sibling span), which measured RED with the exact wrong
  string before the `aria-label` fix.
- **Task 9** (`13.552`–`13.555`, `13.556a`) — forcing `boardFilter.exclude` to `undefined` kills
  `13.553`, `13.554` **and** `13.555` (the last only because its own "1 of 2 shown" precondition reads
  the narrowed board, not because it independently exercises Clear-all); dropping `filter.exclude`
  from `boardUnappliedAxes`'s dependency list in `page.tsx` kills `13.556a`'s THIRD-click assertion
  specifically (the transition where `filter.collaboratorIds` itself does not change).
- **Task 10** (`13.556`, `13.556b`, `13.557`–`13.561`, `13.517` flipped) — hard-coding `tabNoun` to
  `'board'` kills `13.556b` (the note then names the board while rendered on the List tab); reverting
  `dateInputs`/the tab's rows source back to `rows={list.rows}` (unnarrowed) kills `13.557` via its
  row-absence assertion, and the SAME mutation also kills `13.517` and `13.560`; sourcing
  `dateInputs` from `list.rows` instead of the narrowed rows kills `13.558`. `13.556` and `13.559`
  cite no mutation; `13.561` is an explicit regression guard, not a TDD case, and was green
  unmodified.

*Citation sweep (`git diff --stat 5c8d1bd6..HEAD`'s seven touched basenames, grepped per the brief's
exact command against `Features.md`, `test-cases/`, `docs/superpowers/specs/`,
`packages/*/src`, `apps/web/src`, `apps/web/app`):*

- **Re-pointed** (correct at `5c8d1bd6`, displaced by this plan, fixed by direct read at HEAD, never
  by offset arithmetic): `page.tsx`'s own docblock citing `mappers.ts:838-853` → `:855-870`, and the
  adjacent self-citation of its own `:180-184` → `:187-191` (both shifted by the Task 5 exclude-refusal
  block inserted above them); the 2026-09-17 spec's own `mappers.ts:836-859` → `:837-876` and
  `view-types.ts:159-200` (`ListRow`) → `:180-221` (shifted by the same refusal block and by `IdAxes`
  being declared above `ListRow`, respectively); the 2026-09-16 board-prototype-port spec's
  `view-types.ts:142-153` (the old single-block `FilterSpec`) → `:148-155` (the new standalone
  `IdAxes`, the type that actually carries the "plural" claim being made) and its
  `matches-filter.ts:25-56` → `:35-97` (the exclude checks appended to the function body).
- **`board-filter.ts`** — zero citations of this basename exist anywhere in the searched tree; nothing
  to check.
- **`ui.css`** — this plan's only edit is a pure append after line 3612 (the new
  `.gn-filters__choice[data-mode=…]` rules); every existing citation of `ui.css` in the searched tree
  targets a line at or below 2596, so none are displaced by this plan. Left unchanged.
- **Already-stale before this plan, left alone (not this plan's doing):** `page.tsx:1063` in this
  file's own Task-4-era Finding (`13.467`'s note) already pointed at unrelated tab-button code at
  `5c8d1bd6`, not the `<Board boardNarrowing.view>` handoff it describes; `mappers.ts:508` (cited
  twice from `data-source-gateway.ts`) and `mappers.ts:906` (`builder-wiring.tsx`) were already
  pointing at unrelated docblocks pre-plan; `view-types.ts:157`/`:180`/`:220` (`07-api-realtime-search.md`)
  and `:183`/`:165` (`index.ts`, `contest-view-model.ts`) were already wrong pre-plan; `page.tsx:129`
  and its four sibling line numbers in `12-offline-sync-apps.md` were already wrong pre-plan. None of
  these sit in a file this plan touched for its own reasons, and re-pointing them was out of this
  task's scope.
- **Historical narrative, left as written:** the earlier "Finding 2 — 34 stale line-number citations
  swept" paragraph above (2026-09-16, `board-prototype-port`) names `page.tsx:342` and
  `board-search-scope.ts:59` as citations it fixed at the time; and this file's own 2026-09-02
  planted-defect note names `mappers.ts:818`/`:822` and `view-types.ts:238`/`:239`. Both are frozen
  records of a past verification, not live claims about current code shape, so re-pointing their
  numbers to today's tip would misrepresent what those past events actually found — left as written,
  per the same reasoning `03-foundation-ledger.md`'s other pre-existing issues are left alone.

*Prose citations of pre-Task-6 names, re-pointed to the current names* (`board-search-scope.ts`,
`filters-sheet.test.tsx`, `board-narrowing.test.tsx`, `Features.md`): `buildBoardFilterChips` →
`buildFilterChips` and `shouldRenderBoardNarrowingStrip` → `shouldRenderNarrowingStrip`, each marked
"(renamed 2026-09-17)" where the surrounding sentence is itself historical (`board-narrowing.test.tsx:613`'s
workflow-picker docblock; `filters-sheet.test.tsx:502`'s Ruling 13 paragraph;
`board-search-scope.test.ts:93`/`:174`'s section headers), and left as a plain current-name swap where
the sentence is a live "see also" pointer (`filters-sheet.test.tsx:245`). The `describe(...)` titles at
`board-search-scope.test.ts:106`/`:185` are untouched — `13.442`/`13.443` are cited by those titles
verbatim, and the catalogue names them historically. `Features.md` (lines 75, 83, 85) had seven mentions
of the two pre-Task-6 names, all seven re-pointed, and every one of the seven carries the full
"(renamed 2026-09-17; was `...`)" annotation — none of them is a bare, unannotated swap, including the
two inside the live `- ✅` workflow-picker bullet at line 85. Commit `e282fa96`'s own message describes
two of those seven as plain renames with no annotation; that description is wrong — all seven carry the
annotation — and this paragraph, not the commit message, is the record. **Final review fix wave
(2026-09-17) correction: this paragraph itself previously undercounted — a seventh, bare mention (the
`13.443` gate-expression sentence on line 75, quoting `13.443`'s own unrenamed describe title) survived
the round this paragraph describes, contradicting its own "none of them is a bare, unannotated swap."
Now annotated, and the count above is the corrected seven, not the original six.** `apps/web/src/filter-edits.ts:7`'s
citation of "the `toggledArray` convention" (deleted in Task 9) is rephrased to name it as the collapse convention
`page.tsx`'s former `toggledArray` set, deleted 2026-09-17, with `withIdAxis` as its successor.

*Spec amendments* (`docs/superpowers/specs/2026-09-17-filter-exclude-all-tabs-design.md`, new
"Amendments during execution" section): (1) §4's accessible name is set via `aria-label` from a new
`label: string` prop, not a visually-hidden suffix span — the sibling-span mechanism measured
"Uma One , included" (a synthetic space between sibling contributions), so `.gn-visually-hidden` was
never shipped and `13.551` does not assert it; (2) §3's scope note names its own tab via `TAB_NOUN`, a
`Record` over the `view` union, so a fifth tab is a compile error rather than a silent `'board'`
fallback (`13.556b`); (3) §2's wire refusal is reachable today through `toServerPreferences`
(`online/mappers.ts:1018`, which maps every saved filter through `toServerFilterSpec`) for a saved
filter carrying `exclude` — no code path writes one yet, since the project page mounts no saved-filter
control, but whoever wires one owes it a catch/translate layer so the person sees a sentence about
what their filter cannot express, not `UnexpressibleFilterError`'s developer-facing string.
`toServerPreferences` builds a WHOLE-DOCUMENT PUT — one `.map()` over every `SavedFilter` feeds a
single request body that also carries `listColumns` and `grouping` for every project — so an uncaught
throw here fails the entire preferences save, not just the one filter; the follow-on catch/translate
layer must scope the failure to the one filter.

*Spec §8, named but not built, unchanged by this task:* server-side negation and plural axes on the
wire (worth doing only past the 2000-row cap); filter state in the URL (a separate change — today's
include-only filter isn't there either); date and field controls in the Filters sheet
(`matchesListRow` already answers both axes, so a future control narrows every tab without touching
the predicates); and State options' source moving from the board's rendered columns to the workflow
definitions, deferred to the backlog/closed change set's own spec.

## Backlog and closed (owner request, 2026-09-17)

*Owner's words (brainstorm, 2026-09-17): "lets have another status for tickets (this status is default
in all workflows) - backlog. have a separate tab for backlogs. so that board is only populated by
tickets which need to be in focus. another status on the other side should be closed. closed tickets
are also not shown on the board." Then: "backlog by default. and lets actually have closed be a flag
instead of a status. but you can only close a ticket in a terminal state. so that we can see the final
state of the ticket easily, and maybe even filter to see things." Then: "explicit reopen." Spec:
`docs/superpowers/specs/2026-09-17-backlog-and-closed-design.md`. Every task below is TDD with mutation.*

- **13.562** ✅ `statesWithBacklog` appends the one universal Backlog state (category open) after the
  declared states; `universalTransitions` declares Start (`backlog → initialStateId`) and Send-to-backlog
  from every declared NON-terminal state, no rules, and never from a terminal one; `transitionsWithBacklog`
  is the declared edges followed by the universal ones with declared rules intact; `stateCategoryOf(def,
  'backlog')` reads `'open'`; both helpers are pure — the def is never mutated. Mutation (dropping the
  `state.category !== 'terminal'` filter in `universalTransitions`) kills the "no edge from done"
  assertion — (`packages/domain/test/backlog.test.ts`)
- **13.563** ✅ `foldStateIdForward('backlog', …)` folds forward across a version that dropped a declared
  state, with no mapping required — the exemption is for backlog alone; a dropped DECLARED state with no
  mapping still refuses. Mutation (dropping the early-return in `foldStateIdForward`) kills the backlog
  case only — (`packages/domain/test/backlog.test.ts`)
- **13.564** ✅ `validateWorkflowDef` refuses `backlog` as a reserved id — as a declared state and as a
  transition endpoint even when no state declares it — with the message "`backlog` is reserved — every
  workflow has it without declaring it."; a clean def carries no such issue —
  (`packages/domain/test/validate-workflow.test.ts`)
- **13.565** ✅ `ticket.created`'s `start` decides where a ticket is born: `'backlog'` lands it in the
  universal state (category open, `closed` null); `'focus'` and an absent `start` (a v1 event) both land
  it at the workflow's own initial state — absence must mean focus, not a new default, or an additive
  field would rewrite what every event before it meant. Mutation (`p.start === 'backlog'` →
  `p.start !== 'focus'`) kills the "no start → focus" case, and only that case —
  (`packages/domain/test/ticket-state.test.ts`)
- **13.566** ✅ `ticket.closed` records `{ actorId, at }` from the envelope into `TicketState.closed`;
  `ticket.reopened` clears it back to `null`; neither ever touches `stateId`. `TICKET_EVENT_TYPES` names
  both, so every replay reader that iterates it folds them —
  (`packages/domain/test/ticket-state.test.ts`)
- **13.567** ✅ `ticketCreatedPayload` accepts `start: 'backlog' | 'focus'` and its absence, refuses any
  other value; `ticketClosedPayload` and `ticketReopenedPayload` are `z.object({}).strict()` — an empty
  claim accepted, an extra key refused; both event types are registered on the ticket entity at version 1
  — (`packages/domain/test/ticket-events.test.ts`)
- **13.568** ✅ `checkTicketClosed` accepts closing a ticket sitting in a terminal state and refuses two
  ways: a non-terminal state names it (`close-requires-terminal`, `A ticket can only be closed from a
  terminal state; "Doing" is not one.`), and a second close on an already-closed ticket refuses
  `already-closed`; both are reachable through `evaluateEvent`. *Fix round 1 (review, Important 1):* a
  misfiled entity kind is REFUSED `malformed-payload` naming the kind, not silently accepted — the shape
  every sibling check already has (`transition.ts`, `workflow-rebind.ts`, `fields.ts`). Mutation (reverting
  the split guard to its original `env.type !== … || env.entity.kind !== 'ticket') return ACCEPT`) kills
  the misfiled-kind case only, and only that case — (`packages/rule-engine/test/close.test.ts`)
- **13.569** ✅ `checkTicketReopened` accepts reopening a closed ticket and refuses `not-closed` on one that
  is not, reachable through `evaluateEvent`. *Fix round 1 (review, Important 1):* a misfiled entity kind is
  refused `malformed-payload` naming the kind, not silently accepted, mirroring 13.568's mutation —
  (`packages/rule-engine/test/close.test.ts`)
- **13.570** ✅ A closed ticket's `ticket.transitioned` is refused `closed-ticket` ("This ticket is closed —
  reopen it first.") before any edge is looked at — proven not merely against a legal destination but
  against `move('nowhere')`, a destination that is not even a real state, which still answers
  `closed-ticket` rather than `unknown-state` (fix round 1, review, Minor 3: the earlier case proved the
  closed check beats one legal move, not that it runs before the workflow is consulted at all); after a
  `ticket.reopened` the same move is judged by the workflow again —
  (`packages/rule-engine/test/close.test.ts`)
- **13.571** ✅ The universal edges are legal through the real engine without being declared: Start
  (`backlog → initialStateId`) is accepted and a non-initial destination from backlog is still
  `illegal-transition`; Send-to-backlog is accepted from a non-terminal state and refused
  `illegal-transition` from a terminal one; the parent-terminal invariant counts a backlog child as open;
  and — controller ruling extending this task's brief — a declared wildcard edge (`from: '*'`) never
  resolves FROM backlog under `WF` (every state reachable via `* →` edges): `move('done')` from backlog is
  refused `illegal-transition` and only `move('todo')`, backlog's Start edge, is accepted. Mutation
  (reverting `statesWithBacklog(latest)` to `latest.states` for `toState`) kills the Send-to-backlog case
  with `unknown-state`; a second mutation (dropping the backlog-only branch in `transition.ts`'s edge
  resolution) kills the wildcard-from-backlog case by wrongly accepting `move('done')` —
  (`packages/rule-engine/test/transition-backlog.test.ts`)
- **13.572** ✅ `proj_tickets.closed_at` / `closed_by` (backlog/closed spec §3.1, 2026-09-17): a created
  ticket has both NULL; a `ticket.closed` fills both from the event (`closed_by` the actor, `closed_at`
  the event's server time); a `ticket.reopened` clears both back to NULL — proven through a real
  `ticket.created` → two `ticket.transitioned` → `ticket.closed` → `ticket.reopened` sequence, one
  `applyCommitted` per step, reading the row after each. `rowToTicketState` maps the pair to
  `TicketState.closed` and null to null. Mutation (`rowToTicketState` returning `closed: null`
  unconditionally) kills the second case only, and only that case. Reconciled against the brief's
  "three server test literals" needing `closed: null`: they were the shared `expectedCard()` factory
  plus one inline `ticketState` literal, both in `real-door-round-trip.test.ts` — two edits covered
  them (no third was found, and `apps/server` typecheck agrees) —
  (`apps/server/test/projections/tickets-closed.test.ts`)
- **13.573** ✅ A card `assembleTicketCards` produces from a closed row carries `closed: { actorId, at }`;
  from an open row `closed: null` — both assertions in the same call, so a reader that answered `null`
  unconditionally cannot pass the closed half (backlog/closed spec §3.1/§3.3, 2026-09-17) —
  (`apps/server/test/read/ticket-cards.test.ts`)
- **13.574** ✅ The board excludes a backlog ticket AND a closed one — bound conjuncts in `readBoard`'s
  own WHERE (`t.state_id <> BACKLOG_STATE_ID`, `t.closed_at IS NULL`), not a filter over the assembled
  cards — so no column is ever `stateId: 'backlog'` and neither ticket is placed by any bucketing pass,
  straggler included; a third, done-but-NOT-closed ticket is the positive control that the exclusion is
  about `closed_at`, not about every terminal card. RED was a wrong straggler column
  (`['todo','doing','waiting','done','backlog']`), not a missing assertion. Mutation (removing `AND
  t.closed_at IS NULL`) reddens only the closed half, leaving the backlog exclusion intact — proving the
  two conjuncts are independently load-bearing (backlog/closed spec §3.2, 2026-09-17) —
  (`apps/server/test/routes/board.test.ts`)
- **13.575** ✅ Unlike the board, the list CARRIES both a backlog and a closed ticket: the backlog row's
  `stateName`/`stateCategory` resolve through `statesWithBacklog(def)` (`read/list-cards.ts`, previously
  `def.states.find`, which throws "has no state 'backlog'" for a ticket that is not malformed at all —
  RED was exactly that throw, a 500, before either filter term was even exercised) and its `closed` field
  is `null`; the closed row's `closed` is `{ actorId, at }`. `filter: { closed: true }` answers only the
  closed row; `filter: { closed: false }` answers only the backlog row, which is the positive control that
  the narrowing is about the flag and not an empty project (backlog/closed spec §3.2/§3.3, 2026-09-17) —
  (`apps/server/test/routes/list.test.ts`)
- **13.575b** ✅ Fix round 2: `groupBy=status`'s own label lookup (`groupCards`'s `case 'status'`,
  distinct from 13.575's per-row `stateName`) resolves through `statesWithBacklog(def)`, not
  `def.states`, so a backlog group's `label` is `Backlog` rather than the bare id `backlog` its
  `?? stateId` fallback used to fall through to. RED was exactly that: `expected 'backlog' to be
  'Backlog'`. The same fix was applied to `attention.ts`'s `stateNameOf` and
  `notifications/sweep.ts`'s stale-ticket state-name read, both UNREACHABLE with a backlog row today
  (recorded honestly rather than claimed covered: `attention.ts`'s blocked bucket can never key on
  `backlog` because no validated definition ever declares it, and `sweep.ts`'s own query filters
  `state_category = 'active'`, which backlog's `'open'` category never satisfies) and neither gained a
  test for that reason (backlog/closed spec §1.4/§3.2, 2026-09-17) — (`apps/server/test/routes/list.test.ts`)
- **13.576** ✅ `GET /v1/me/work`: a closed ticket assigned to the caller is in no group (`t.closed_at IS
  NULL` bound beside the assignee clause AND beside `sharedWithMeRows`'s audience clause); a backlog
  ticket assigned to them is in `open`, exactly where `bucketFor`'s existing switch already sends every
  other open-category ticket — no new branch, no change to its "refuses a fourth value" contract.
  DISCOVERED beyond the brief's named edits: `stateNamesFor`'s `def.states.find` throws "has no state
  'backlog'" for the same reason 13.575's did, and RED was that throw (a 500) reached simply by seeding a
  backlog ticket assigned to the caller — fixed the same way, `statesWithBacklog(def).find` —
  (backlog/closed spec §1.4/§3.2, 2026-09-17) — (`apps/server/test/routes/my-work.test.ts`)
- **13.577** ✅ `GET /v1/workspaces/:id/attention`: a closed ticket produces no item in any bucket, proven
  against the one bucket that does not already exclude it by CATEGORY — `blocked` reads its flag "whatever
  the category" (this route's own docblock), so the fixture is a workflow whose TERMINAL state is ALSO
  flagged blocked; a ticket that reaches it and stays open is the positive control, still warning in the
  same run as the one that reaches it and is closed. RED was the closed ticket's id present in the blocked
  bucket (backlog/closed spec §3.2, 2026-09-17) — (`apps/server/test/routes/attention.test.ts`)
- **13.578** ✅ `compileFilterSpec`: `{ closed: true }` compiles to `t.closed_at IS NOT NULL`, `{ closed:
  false }` to `t.closed_at IS NULL`, absent to no clause — a plain conjunct over `t`, binding no parameter
  and reaching no other table, so it is added to (not exempted from) "every clause that reaches another
  table correlates on t.workspace_id"'s own enumeration as a non-reaching term, keeping that test's
  "enumerates every term" claim true (backlog/closed spec §3.2, 2026-09-17) —
  (`apps/server/test/read/compile-filter.test.ts`)
- **13.579** ✅ `filterSpecSchema.closed` accepts a boolean and refuses a string; the NUL-slot count test's
  own docblock is corrected from "the other four slots" to "the other five", naming `closed` beside
  `blocked` as the boolean that needs no NUL guard (backlog/closed spec §3.2, 2026-09-17) —
  (`packages/domain/test/filter-spec.test.ts`)
- **13.580** ✅ The client vocabulary carries `closed`: `mapListPage` reads the wire card's `closed` onto
  `ListRow.closed` unchanged, present and null; `toServerFilterSpec`/`toClientFilterSpec` carry the term
  through unchanged (no plural/singular disagreement to refuse over, unlike the id axes); `toClientFilterSpec`
  reads it as a REQUIRED boolean (`asBoolean`), refusing a `'true'` string rather than silently coercing it
  (backlog/closed spec §1.2/§3.2/§4, 2026-09-17) — (`packages/app-core/test/online/mappers.test.ts`)
- **13.581** ✅ `matchesFilter`/`matchesListRow` honour `closed` (backlog/closed spec §4, 2026-09-17): `true`
  closed only, `false` not closed, absent all — a single boolean, not an id axis, so it has no
  include/exclude halves; a legacy `TicketState` fixture with no `closed` key at all (`TicketState.closed?`
  predates the flag on 441 fixtures) counts as not closed, same as an explicit `null`. `ListFilterSpec`'s
  `Pick` names `closed`; `BoardFilterSpec`'s does not — a `BoardCard` carries no `closed` field, so the axis
  is a compile error there rather than a silent no-op —
  (`packages/app-core/test/filter/matches-filter.test.ts`, `packages/app-core/test/filter/list-filter.test.ts`)
- **13.582** ✅ `transitionOptions` offers the universal Backlog edges like declared ones (backlog/closed
  spec §4, 2026-09-17), read off `statesWithBacklog`/`transitionsWithBacklog` — the SAME helpers the engine
  itself resolves edges over — rather than a second, driftable copy of the universal set: Start is the ONLY
  option from backlog (controller ruling, Task 6, extending the brief: a declared wildcard edge means "from
  any AUTHORED state" and backlog is universal rather than authored, so a wildcard edge never resolves FROM
  it), and Send to backlog is appended LAST from every declared non-terminal state, never offered from a
  terminal one. The site-identifying assertion adds `{ from: '*', to: 'done' }` to `WF_ERRAND` and proves
  `transitionOptions(def, 'backlog')` is still exactly `[{ toStateId: 'todo', name: 'To do', rules: [] }]` —
  the wildcard edge never resolves from backlog even though backlog would otherwise match `'*'` like any
  other state. Mutation (dropping the `fromStateId === BACKLOG_STATE_ID` branch) kills exactly that one
  assertion and no other: under plain `WF_ERRAND` the Start edge and the (harmless) wildcard-to-`todo`
  resolution agree, so only a def whose wildcard reaches a DIFFERENT target than Start can tell the two
  implementations apart. Ripples into every other caller of `transitionOptions` over a non-terminal
  `fromStateId` — `moveOutcome`'s `available` lists, `MoveRefusalNotice`/`refusalCopy`'s rendered
  alternatives, and `reopenStateOptions` (`flows/guarded-child-event.ts`) all now include `backlog` as a
  genuine non-terminal destination, and the existing tests naming those lists were updated in place rather
  than left to rot green over a wrong assertion —
  (`packages/app-core/test/views/transition-dialog.test.tsx`, `packages/app-core/test/views/board-moves.test.ts`,
  `packages/app-core/test/views/board-moves-ui.test.tsx`, `packages/app-core/test/flows/guarded-child-event.test.ts`)
- **13.583** ✅ `precheckEvent` mirrors `checks/close.ts` for `ticket.closed`/`ticket.reopened`
  (backlog/closed spec §2, 2026-09-17), hand-rolled rather than routed through the shared engine like
  `precheckParentTerminal` — but UNLIKE that function, these two can answer `passed`: `evaluate.ts` is a
  flat switch with exactly one check per event type, and neither `checkTicketClosed` nor
  `checkTicketReopened` reads a ticket-type definition, so gate 4 does not apply. A `ticket.closed` for a
  `doing` ticket previews `close-requires-terminal` naming "Doing"; the SAME refusal for a ticket sitting in
  `backlog` names "Backlog" rather than the bare id — proving the state name is resolved over
  `statesWithBacklog`, which `def.states` alone does not declare — and an already-closed ticket previews
  `already-closed`. A transition on a closed ticket previews `closed-ticket`, decided with NO workflow
  definition cached at all, mirroring the engine's own order (`transition.ts:72`, ahead of `getWorkflowDef`
  at `:76`): the refusal reads only the flag this client already holds. A `ticket.reopened` on a ticket that
  is not closed previews `not-closed`; on a closed ticket it passes. The transition branch's own
  `acceptRestsOnUnseenChildren` (`precheck.ts:426/437`) and `needsMembership` (`precheck.ts:461/468-473`) now resolve states/edges over
  `statesWithBacklog`/`transitionsWithBacklog`, with the same backlog-only Start rule `transitionOptions`
  takes — a destination or a ticket sitting in backlog is not the raw-`def` miss it used to be —
  (`packages/app-core/test/precheck.test.ts`)
- **13.584** ✅ `ticket.closed`/`ticket.reopened` fold through the SAME shared reducer (`applyTicketEvent`)
  every other ticket event does, and `start: 'backlog'` folds to the universal state — both landed on
  `TICKET_EVENT_TYPES`/`FOLDING_TICKET_TYPES` before this task (Task 1) and are confirmed here rather than
  re-derived: a ticket created with `start: 'backlog'` is served at `stateId: 'backlog'` by the replica's
  `getTicket` AND by `getTickets` (whose row also carries `closed: null`, and whose `stateName` now reads
  "Backlog" via `stateNameFrom`'s own `statesWithBacklog` fix); after `ticket.closed` both doors report
  `closed: { actorId, at }`. `getBoard` gains the SAME two bound conjuncts the server's `readBoard` applies
  (case 13.574) — `stateId !== BACKLOG_STATE_ID`, `(closed ?? null) === null` — proven against both a
  closed ticket and a confirmed backlog-born one, straggler path included (without the fix a backlog ticket
  has no row in any published definition's `states` and falls into the straggler path as a stray column
  literally named `backlog`). `getTickets` deliberately does NOT gain the same exclusion: 13.575 already
  settled that the LIST carries a backlog and a closed ticket alongside every other row, narrowable by the
  `closed` filter term rather than dropped outright, so the replica's `getTickets` matches the server's LIST
  behaviour while its `getBoard` now matches the server's BOARD behaviour (backlog/closed spec §1.3/§3.2,
  2026-09-17) — (`packages/app-core/test/replica/replica-data-source.test.ts`)
- **13.585** ✅ `TicketSheet` shows **Close** (not **Reopen**) on a terminal, not-closed ticket (backlog/closed
  spec §5.3, 2026-09-17): `state.stateCategory === 'terminal' && closed === null` gates the button, and
  clicking it ingests exactly one `ticket.closed` with `payload {}` through the same `make`/`ingest` idiom
  `submitTransition` uses for a move — the envelope alone carries actor and time (spec §1.2). A `committed`
  answer clears any refusal and reloads BOTH live reads this sheet holds (`read.reload()` AND
  `history.reload()`, mirroring `submitTransition`'s own committed branch, since closing writes a ledger
  line too) — proven here by asserting `getTicket` is asked a second time, off the same `read.reload()`
  every other transition in this file refreshes through — (`packages/app-core/test/views/ticket-sheet.test.tsx`)
- **13.586** ✅ A closed ticket shows the header badge — `Closed by <name> on <date>`, the name resolved
  through the SAME `actorLabel`/roster join every other claim in this sheet uses, the date through the one
  IST formatter (`formatDate`) — shows **Reopen** (not **Close**), disables **Move…**
  (`disabled={closed !== null}`), and shows the sentence "Closed — reopen it first" beside it as a
  `<span className="gn-sheet__closed-note">` — TEXT, never a `title=` tooltip (spec §5.3). Clicking Reopen
  ingests exactly one `ticket.reopened` with `payload {}`. The badge reuses `Chip` tone `terminal`
  (`packages/ui/src/components/chip.tsx`) rather than a bespoke swatch. The fixture's `closed.at` is
  `19:00 UTC` — a DISCRIMINATING instant (same technique as the history-tab battery's `18:30 UTC` → `17
  Aug`): it crosses midnight under `+05:30` to `21 Aug`, one day past its own UTC date, so the assertion
  can tell `formatDate`/`formatIstInstant` apart from a same-day UTC slice that would print the wrong date
  identically to the right one on a non-discriminating instant — (`packages/app-core/test/views/ticket-sheet.test.tsx`)
- **13.1182** ✅ **`disabled` is the whole double-submit guard, and the inert `if (submitting) return` is
  gone (ruling E2-31, 2026-09-21).** `submitTicketEvent` carried that line at its top, documented as
  guarding *"a second click landing on the same render pass as the first, before React has re-rendered
  the `disabled` attribute onto the DOM"* — which it **cannot** do, because `submitting` is RENDER STATE:
  two calls in one render pass both close over the same pre-commit `false`. The line is removed rather
  than kept as belt-and-braces, because a guard whose stated purpose is unreachable is indistinguishable
  from a working one to every future reader. **This case pins what actually holds:** with the first Close's
  ingest HELD PENDING, a second click posts nothing, and the control is `disabled` after the first —
  **deleting `disabled={submitting}` reddens it** (`Tests 1 failed | 115 skipped`). **And the inertness is
  MEASURED rather than argued, which is the point of the second mutation:** re-adding the removed line
  with `disabled` still gone leaves this case red **identically** (`Tests 1 failed | 115 skipped`) — the
  render-state guard demonstrably cannot do the job it claimed, so the finding's other remedy (a
  `submittingRef` mirroring `submitTitle`) was declined: the precedent it cites
  (`TicketEditorSlot.tsx`, *"two `comment.added` events for one comment"*) reached its handler from TWO
  sources — a Save button and a blur/Enter commit, where the `disabled` landing on the field is what fired
  the second — and Close/Reopen has one source and no blur-commit, so that fix here would install a second
  guard that also cannot fire. The id is from **B13's allocated §13 block (13.1177–13.1186)**. —
  (`packages/app-core/test/views/ticket-sheet.test.tsx`)
- **13.587** ✅ A non-terminal ticket shows neither **Close** nor **Reopen** — the two buttons' gates
  (`stateCategory === 'terminal' && closed === null`, and `closed !== null`) both read false for an active
  or open ticket, so this sheet offers no closing affordance at all outside a terminal state
  (backlog/closed spec §5.3, 2026-09-17). Mutation (dropping `state.stateCategory === 'terminal' &&` from
  the Close gate, `cp`/`sha256sum` restore): kills exactly this case (**Close** now renders on the
  non-terminal fixture) and no other in the file — 13.585/13.586/13.588 stay green — proving the negative
  assertion is not vacuous — (`packages/app-core/test/views/ticket-sheet.test.tsx`)
- **13.588** ✅ A refused `ticket.closed` (answered `refused` with rule `close-requires-terminal`, the
  rule-engine id from spec §2's table) renders its rule and reason VERBATIM in the sheet's refusal slot —
  carried without paraphrase, the same invariant `submitTransition`'s own refusal handling holds. The slot
  is a NEW render block beside the action row rather than `TransitionDialog`'s own `serverRefusal` copy:
  `Dialog` (`packages/ui/src/components/dialog.tsx:15`) returns `null` whenever `open` is false, so that
  copy is unreachable while the Move dialog is closed — exactly when Close/Reopen fire. The new block is
  gated on `!moveOpen` so the two never both render: the Move dialog's own `onClose` already clears
  `serverRefusal` when it closes, and `submitTransition` never sets it while `moveOpen` is false —
  (`packages/app-core/test/views/ticket-sheet.test.tsx`)
- **13.588a** ✅ Ruling 32 (fix round 1, 2026-09-17) — the double-submit latch. Close/Reopen mirror
  `board.tsx`'s `MoveArrows.submitting` (`:956`, `finally`-reset per `:1029-1035`'s own docblock): both
  buttons carry `disabled={submitting}` for the lifetime of their own ingest, re-enabled once it settles
  regardless of outcome. Proven with a DEFERRED ingest (a promise the test resolves by hand): Close is
  enabled before the click, disabled while the promise is pending, a second click in that window queues
  no second `ingest` call, and resolving the promise re-enables it. `Move…` is deliberately untouched — it
  opens a dialog with its own submit path. Mutation (dropping the `finally` reset, `cp`/`sha256sum`
  restore): kills exactly this case (Close never re-enables) and no other —
  (`packages/app-core/test/views/ticket-sheet.test.tsx`)
- **13.588b** ✅ Ruling 33 (fix round 2, 2026-09-17) — a REJECTED `ingest` is a transport failure, never
  a refusal, and gets its OWN slot: `transportError`, rendered as `<p role="alert"
  className="gn-refusal gn-refusal--transport">`, gated on `!moveOpen` identically to `serverRefusal`'s
  own copy. Fix round 1 had folded a rejected `ingest` into `serverRefusal` under a synthetic
  `ingest-rejected` rule name — caught in review as the exact defect Ruling 27 removed from `board.tsx`
  (case 13.504, "never claims to be the server's own verdict"): a dropped connection is not an
  adjudication, however the sentence is worded. Proven with a fake data source whose `ingest` throws
  (`socket hung up`): clicking **Close** shows the amber transport notice with the message carried
  verbatim (`We could not reach the server for this change — socket hung up`), the text "Refused by the
  server" is absent from the document, and **Close** re-enables once the rejection settles — the
  `finally` reset does not care which branch ran. `results[0]` (not `results.find(...)`) is THE result,
  since exactly one event is ingested; a `result === undefined` (the door answering nothing) shares the
  same `transportError` slot with the message "The server did not answer this change." Mutation (moving
  `setSubmitting(false)` out of the `finally` to after the committed reload only, `cp`/`sha256sum`
  restore): kills exactly this case (Close stays disabled forever after a rejection) and no other —
  (`packages/app-core/test/views/ticket-sheet.test.tsx`)
- **13.588c** ✅ Ruling 34 (fix round 3, 2026-09-17) — the `results[0] === undefined` ("silence")
  branch clears `serverRefusal` too, the same pairing the `catch` branch already carries (13.588b): a
  wording gap in Ruling 33 itself left this one branch setting `transportError` without clearing
  `serverRefusal`, so a REFUSED click followed by a SILENT one rendered BOTH notices at once — the
  earlier "Refused by the server — …" describing an answer that no longer holds. Proven by sequencing
  two different answers through the fake data source's ordinary per-call closure (no test-helper change
  needed): `refused` (rule `close-requires-terminal`) on the first `ingest`, an empty `[]` on the second.
  First click shows the server notice with the reason; second click shows ONLY the transport notice
  ("The server did not answer this change.") — the server notice's class (`gn-refusal--server`) and its
  reason text are both confirmed ABSENT, not merely joined by the new one — and Close re-enables.
  Mutation (dropping the new `setServerRefusal(null)`, `cp`/`sha256sum` restore): kills exactly this case
  on the "server notice gone" assertion and no other —
  (`packages/app-core/test/views/ticket-sheet.test.tsx`)
- **13.589** ✅ A card in `done` (`WF_ERRAND`'s only terminal state — verified against `helpers/seed.ts`,
  not assumed) renders a **Close** button beside the two arrows: `aria-label` `` `Close ${card.title}` ``,
  `disabled={submitting}` sharing the arrows' own latch. Clicking it ingests exactly one `ticket.closed`
  with the empty payload spec §1.2 gives the envelope-only event (actor/origin carried the identical way
  `submitDirect`'s own `{to}` transition already is), then calls `moves.onMoved()` — the SAME
  `board.reload()` `submitDirect`'s `committed` branch calls; the server's own `getBoard` excludes closed
  tickets (spec §3.2), so the reload, not a local delete, is what removes the card, and this case asserts
  the ingest and the call rather than a disappearance `useBoard`'s own live-query hook would have to fake.
  A card in `doing` (non-terminal, `stateCategory: 'active'`) renders no Close button at all — `MoveArrows`
  derives the gate itself from `stateCategoryOf(workflow, fromStateId)` (Ruling 35, coordinator,
  2026-09-17 — correcting this task's own brief, which had proposed threading a second `column.category`
  prop down instead) rather than reading a second, driftable copy of a fact this component can derive with
  no new data. A click on Close never opens the ticket sheet — the same `CARD_CLICK_BAIL_SELECTOR` bail
  every arrow button already gets (`board-card-click.test.tsx`'s own "a click on a move arrow does NOT
  open the ticket" proves the mechanism) — proven here PAIRED with a positive control in the same test (a
  click on the card's own title button DOES call `onOpenTicket`), so the negative discriminates a real
  bail from a button that merely does nothing. Mutation (forcing the terminal gate permanently true —
  `{true || category === 'terminal' ? ...}` — `cp`/`sha256sum` restore): kills exactly the `doing`-negative
  case and no other (`PASS (4) FAIL (1)`) —
  (`packages/app-core/test/views/board-close.test.tsx`)
- **13.590** ✅ A refused `ticket.closed` (rule `close-requires-terminal`, mirroring `ticket-sheet.tsx`'s
  own `13.588` fixture verbatim) renders through the board's existing server-refusal notice —
  `role="alert"`, `.gn-refusal--server`, the rule and reason carried VERBATIM, the same invariant every
  other refusal on this board holds. A REJECTED `ingest` (a transport failure, never a server answer)
  renders instead through `.gn-refusal--transport` with `closeCard`'s own "this close" wording ("We could
  not reach the server for this close — …"), the words "Refused by the server" absent from the document —
  mirroring case `13.504`'s two-branch shape and Ruling 27's split exactly, `closeCard` sharing
  `submitDirect`'s identical `serverRefusal`/`transportError` channels rather than inventing its own. Both
  branches leave **Close** and `‹` (a live, two-target picker from `done` — `arrowTargets` finds both
  `doing` and `todo` declared backward from the last column, so the label reads "Move to previous state —
  Doing or To do", never a bare "Move to Doing") re-enabled once the answer settles, proving the shared
  `submitting` latch resets in `closeCard`'s own `finally` exactly as it already does in `submitDirect`'s.
  `›` stays disabled throughout BOTH branches — structural (no forward edge is declared from `done` at
  all), never a stuck latch — and is asserted as such rather than left for a reader to wonder whether the
  latch missed it —
  (`packages/app-core/test/views/board-close.test.tsx`)
- **13.590a** ✅ Ruling 36 (coordinator, 2026-09-17; found reviewing Task 8's `closeCard`, whose docblock
  claimed to mirror `submitDirect` "almost exactly" while `submitDirect`'s own `result === undefined`
  branch had never carried the Ruling-34 pairing `closeCard` already did) — `submitDirect`'s silence
  branch now clears `serverRefusal` alongside `transportError`, proven by sequencing a `refused` answer on
  the first arrow click and an empty `[]` on the second (the exact `13.588c` technique, over the fake data
  source's own per-call closure): after the second click only the amber `.gn-refusal--transport` notice
  reads, `.gn-refusal--server` is gone from the document, and the arrow re-enables. **Measured, not
  assumed, and the measurement corrects the ruling's own predicted mutation**: `submitDirect` has exactly
  one call site, inside `attemptMove`, which already runs its own unconditional `setServerRefusal(null)`
  synchronously before every arrow/drop attempt — a wrapper `closeCard` has no equivalent of, since
  nothing wraps its `onClick`. Reverting ONLY the new line this ruling adds leaves this case GREEN
  (`PASS (15) FAIL (0)`, the whole file unchanged); reverting ONLY `attemptMove`'s own pre-existing clear,
  with the new line left in place, is ALSO green, for the identical reason in reverse. The case only
  reddens when BOTH are absent at once (`PASS (14) FAIL (1)`, this case alone) — so the new line is real,
  correct, and brings `submitDirect` into textual and behavioural agreement with `closeCard`, but is
  REDUNDANT defense-in-depth on the arrows specifically today, not the closing of a live, reachable gap
  the way the identical-looking line is for `closeCard`/`closeOrReopen`. Kept for that agreement and as a
  second line of defence if `attemptMove` ever stops clearing on its own; `cp`/`sha256sum` restore
  performed after each of the three mutations above —
  (`packages/app-core/test/views/board-moves-ui.test.tsx`)
- **13.591** ✅ **REWRITTEN 2026-09-23** (owner ruling lifting spec §5.4's parent condition) — the birth
  state is now ONE control asking the inverse question: the shared `Switch`, always present and always
  answerable. `NewTicketDraft.start` stays REQUIRED (never optional here, even though the wire's
  `ticketCreatedPayload.start` is optional and an absent value means focus for events written before the
  field existed — a rule about legacy compatibility, not about what a client built after the field exists
  is allowed to leave out). The former text, kept here because the case ids below still name it: the
  dialog **states** "Starts in the backlog" under the title field UNCONDITIONALLY, and an in-focus parent
  (`parentCandidates` carrying `inFocus: boolean`, a claim the CALLER computed) revealed a CHECKED-BY-
  DEFAULT **"Start in focus"** checkbox whose visibility (`startCheckboxVisible`) and the draft's `start`
  both read the same `chosenParent`/`noUsableParent` values once, so a checkbox could never be on screen
  while the payload claimed `'backlog'`, or absent while a `'focus'` claim left unexplained.
  **`startCheckboxVisible` and `parentCandidates[].inFocus` are now deleted, not merely disabled** — the
  parent has no bearing on where a ticket is born. `13.591a` (the question + the SHARED `Switch`, ON, and
  the old sentence absent), `13.591b` (no parent → switch ON → `start: 'backlog'`), `13.591c` (an
  in-focus parent is no longer a precondition: OFF under it → `'focus'`), `13.591d` (OFF then back ON →
  `'backlog'`, so the control is answerable BOTH ways), `13.591e` (a BACKLOG parent no longer hides it) —
  (`packages/app-core/test/views/new-ticket-dialog.test.tsx`)
- **13.591f** ✅ **REWRITTEN 2026-09-23** — the birth-state control's INDIFFERENCE to the parent, at the ONE
  site that hands it real row data. The former subject was `page.tsx`'s own `inFocus` derivation
  (`row.stateId !== BACKLOG_STATE_ID && row.closed === null`), which nothing in `packages/app-core` could
  witness because every case there passes `inFocus` in as a literal; the ruling deleted the formula and
  the field with it, so that claim is no longer made anywhere. The fixture is deliberately UNCHANGED —
  a BACKLOG row, a plain ACTIVE row, and a CLOSED terminal row, told apart by the same two facts — and
  what is asserted at each pick is that the switch is PRESENT and ENABLED; the CLOSED row is the one that
  matters, because §5.4 forbade a focus birth under a closed parent OUTRIGHT. **The load-bearing assertion
  reads the INGESTED PAYLOAD**: the switch is turned OFF under the closed parent and `ticket.created` must
  carry `start: 'focus'` — so a dialog that painted an always-enabled switch and still sent `'backlog'`
  fails here rather than passing on the screen alone. Control arms in the same `it`: the switch is ON
  before it is flipped, so the case cannot pass against a control that was never ON. —
  (`apps/web/test/project-create-gate.test.tsx`)
- **13.592** ✅ `CreateTicketFlow.create` never leaves `start` off the `ticket.created` payload it builds
  (backlog/closed spec §1.3), whatever the draft's own value: a create with no parent sends
  `payload.start: 'backlog'`, and the birth-state switch turned OFF sends `payload.start: 'focus'` —
  proving the value travels from the DRAFT rather than a hardcoded constant. **`13.592b` was rewritten
  2026-09-23**: it used to reach `'focus'` by choosing an in-focus parent with the checkbox left checked,
  and the parent no longer moves `start` at all, so it now flips the dialog's own switch — the honest way
  to reach a value the draft is supposed to be the source of, and it asserts the switch was ON before the
  flip so it cannot pass against a control that was never ON. The load-bearing assertion is
  `Object.keys(payload)` containing `'start'`, not a value comparison: a
  mutated `create()` that drops the `start:` line from its payload object literal produces a payload with
  NO `start` key at all, and `toEqual`/`toBe`-style value checks treat a missing key the same as one
  holding `undefined` — they would not catch that mutation; only reading the key set does. Mutation
  (dropping the `start: draft.start,` line from `create-ticket-flow.tsx`'s payload literal,
  `cp`/`sha256sum` restore): kills EXACTLY the two 13.592 cases (`PASS (16) FAIL (2)` of the file's 18)
  and no other case in the file —
  (`packages/app-core/test/views/reopen-flow.test.tsx`)
- **13.593** ✅ Ruling 37 — creating under a CLOSED terminal parent submits `ticket.reopened` for the
  parent FIRST, then the reopening transition, then the child, and the first two travel in ONE
  `source.ingest` batch call rather than two round trips (the owner decision: the person is asked once).
  Split across two files (Ruling 38): `flows/guarded-child-event.test.ts` pins the UNIT behaviour — with
  `ReopenPlan.parentClosed: true` the FIRST `ingest` call carries exactly `[ticket.reopened,
  ticket.transitioned]` in that order, both on the parent, and the child rides only the SECOND call; a
  committed outcome's `parentResult` names the TRANSITION's own result (the LAST element of the batch),
  never the reopen's; a refusal of EITHER event in that batch — the reopen itself, or the transition after
  a committed reopen — yields `parent-refused` and the child is never sent. **Fix round 1 (Ruling 39,
  coordinator, 2026-09-17): `parent-refused` now carries `parentReopened: boolean`** — `true` exactly
  when the reopen (batch index 0) committed before the transition (index 1) was refused, `false` for a
  refusal AT index 0 or a plan with no reopen at all — pinned by extending 13.593b (refused at index 0 →
  `false`) and 13.593c (refused at index 1, reopen committed → `true`) in place, plus T13.3d
  (`parentClosed: false` → `false`). With `parentClosed: false` the batch stays the single-element array
  T13.3a–g already pinned, unchanged. `views/reopen-flow.test.tsx`
  proves the same shape end to end: a CLOSED `PARENT_READ` (`ticket.closed` set) drives the reopen offer
  through the dialog, and the confirm click's recorded `source.ingested` batches show the same
  `[reopened, transitioned]` pair ahead of the child, exactly as the unit test pins. `CreateTicketFlow`
  reads `parentClosed` off `parentRead.ticket.closed ?? null` — never `!== null` alone, which would
  misread an unflagged legacy ticket (441 fixtures predate the flag) as closed —
  (`packages/app-core/test/flows/guarded-child-event.test.ts`, `packages/app-core/test/views/reopen-flow.test.tsx`)
- **13.593d** ✅ Ruling 37's own silence clause — "if the array is shorter than the batch, throw
  `UnansweredClaimError` naming the unanswered event" — pinned directly, since 13.593a–c all exercise
  FULL-length results arrays and T13.2f exercises `submitChildEvent`, not `reopenAndProceed`. A batch of
  two (`[ticket.reopened, ticket.transitioned]`, `parentClosed: true`) answered with only ONE result (the
  reopen commits; the transition gets nothing back) throws `UnansweredClaimError` whose `.sent` is the
  TRANSITION — the event actually left unanswered, not `batch[0]` (the reopen, which DID answer) —
  discriminating a correct implementation from one that always blames the first element —
  (`packages/app-core/test/flows/guarded-child-event.test.ts`)
- **13.593e** ✅ Fix round 1, Ruling 39 (coordinator, 2026-09-17; review Finding 1) — retrying with a
  DIFFERENT target after a closed parent's reopen half already committed no longer resends
  `ticket.reopened`. Confirmed against the REAL server, not a fake's assumption: `IngestService`
  (`apps/server/src/ingest/ingest-service.ts`) commits each batch event independently, in its own
  transaction, so `[reopened, transition→A]` can commit the reopen while a rule on that specific edge
  (`restrict-to`, say) refuses transition→A — reachable, not hypothetical, and exactly what a stale
  `ReopenPrompt.parentClosed: true` would have resent into a `not-closed` refusal on the next attempt,
  MASKING whatever transition→B actually answers. `CreateTicketFlow.acceptReopen` now flips
  `reopenPrompt.parentClosed` to `false` (`outcome.parentReopened`) before the parent's own refusal
  renders, so a retry's plan builds `[transition]` alone. Proven end to end: first "Reopen and proceed"
  gets `[committed, refused]` (reopen commits, transition→Doing refused); the dialog stays open exactly
  as the ordinary (non-closed) shape already does; picking "To do" and confirming again sends a SECOND
  parent batch of exactly ONE event, `ticket.transitioned` — no `ticket.reopened` — which then commits,
  followed by the (retried) child. Mutation (dropping the `setReopenPrompt` update in `acceptReopen`,
  `cp`/`sha256sum` restore): kills exactly this case, on the "exactly one event" assertion (`PASS (18)
  FAIL (1)`, the retry batch resending both events) —
  (`packages/app-core/test/views/reopen-flow.test.tsx`)
- **13.593f** ✅ Final whole-branch review, fix wave A, Ruling 50 (2026-09-17; review Finding 3) — the
  OTHER order of failure from 13.593e's: the batch's `ticket.reopened` HALF is the one refused, at index
  0, with `not-closed` — someone else reopened the parent a second before the person confirmed.
  `reopenAndProceed` reports `parentReopened: false` for an index-0 refusal (13.593b), so 13.593e's own
  fix condition does not fire here on its own; without this ruling, `acceptReopen` would leave
  `reopenPrompt.parentClosed` at `true`, and a retry with a different target would rebuild
  `[ticket.reopened, transition]` again, refuse `not-closed` a second time, and mask whatever the new
  transition would have answered — Ruling 39's exact masking, reached from the other side. Fix: also flip
  `parentClosed` to `false` when `outcome.refusal.rule === REFUSAL_RULES.notClosed` — the server saying
  "this parent is not closed" is the same fact `parentReopened` conveys, learned from a different
  sentence. Proven end to end: the first "Reopen and proceed" is refused `not-closed` at index 0 (the
  reopen itself); the dialog stays open with the refusal rendered; picking "To do" and confirming again
  sends a SECOND parent batch of exactly ONE event, `ticket.transitioned` — no `ticket.reopened` — which
  then commits, followed by the (retried) child. Mutation (dropping the new `|| outcome.refusal.rule ===
  REFUSAL_RULES.notClosed` arm, `cp`/`sha256sum` restore): kills exactly this case, on the "exactly one
  event" assertion (`PASS (19) FAIL (1)` of the file's 20) —
  (`packages/app-core/test/views/reopen-flow.test.tsx`)
- **13.591g** ✅ **INVERTED 2026-09-23** (owner ruling lifting §5.4; supersedes Ruling 40) — the case now
  pins that CHOOSING A PARENT CHANGES NOTHING about the birth state. Ruling 40's text, kept because the
  ruling it records is what this case's new form removes: *"checked by default" (spec §5.4) is a promise
  PER CHOSEN PARENT, not a one-time initial value for the whole dialog session — unticking "Start in
  focus" for one in-focus parent, then switching to a DIFFERENT in-focus parent, renders the new parent's
  checkbox CHECKED, and the Parent picker's own `onChange` resets `startInFocus` to `true` on every
  selection.* **That reset is DELETED, and deleting it is a fix rather than a tidy-up:** it existed to
  serve a control that TRACKED the parent, and the switch does not — it answers a question about the
  ticket and the person's answer is REMEMBERED across sessions, so a surviving reset would silently
  overwrite the very answer the dialog was just asked not to forget. Turn the switch OFF, pick in-focus
  parent A, then pick a DIFFERENT in-focus parent B: it stays OFF, and the draft leaves `start: 'focus'`
  under B. The id is kept deliberately — ids are never renumbered, and this is the same question (*what
  does a parent change about the birth state?*) answered by the rule that replaced §5.4. —
  (`packages/app-core/test/views/new-ticket-dialog.test.tsx`)
- **13.594** ✅ Task 10 (backlog/closed spec §5.4, 2026-09-17) — the Backlog tab. A FIFTH tab, `Backlog`,
  joins the project page's segmented rail FIRST — ahead of `Board`, since a ticket sits in the backlog
  BEFORE the board in its lifecycle (spec §1.3) — while `view`'s own default stays `'board'`: the rail's
  ORDER and the page's DEFAULT SELECTION are independent facts, and this task changes only the first
  (pinned by asserting `aria-selected` still opens on `Board`, not `Backlog`). `backlogNarrowing`
  (`page.tsx`) is `listNarrowing.rows` (the shell's own exclude-mode-filtered set) further cut to rows
  whose `stateId` is the universal `BACKLOG_STATE_ID`; `total` counts backlog rows in the UNFILTERED
  `list.rows`, never in `listNarrowing.rows`, for the same "a count computed after a filter has run
  is a count of the filter, not of the project" reason `listNarrowing`'s own docblock gives. Clicking the
  Backlog tab shows ONLY backlog-state rows; the List tab is UNCHANGED (spec §5.5: "the List shows
  everything") and keeps showing both a project's backlog and focused tickets, same `TicketList`, same
  narrowing word (see 13.595 below) —
  (`apps/web/test/backlog-tab.test.tsx`)
- **13.595** ✅ Task 10, Ruling 41/42 (coordinator, backlog-and-closed-core dispatch, 2026-09-17) — the
  per-row **Start** button and the target it resolves. **Ruling 41 struck the brief's "a gated initial
  edge still asks" branch**: spec §1.2 says the universal Start edge (`backlog → def.initialStateId`)
  "carries no rules, ever", and `universalTransitions` (`packages/domain/src/workflow.ts:71`) builds it
  with `rules: []` — `moveOutcome` could only ever answer `direct`, so no page-level `TransitionDialog`
  and no `MoveArrows` extraction exist for it (the brief's own "choose the smaller diff and say which" is
  resolved as neither). `BacklogStartButton` (`apps/web/src/backlog-start-button.tsx`) submits
  `ticket.transitioned { to: toStateId }` straight through `dataSource.ingest`, mirroring `board.tsx`'s
  `submitDirect` idiom (`submitting` latch reset in a `finally`, a `committed` answer calling the page's
  `list.reload()`, a real refusal rendered as `role="alert" className="gn-refusal gn-refusal--server"`
  reading `Refused by the server — <rule>: <reason>`, a silent `results[0] === undefined` or a rejected
  `ingest` rendered as `gn-refusal--transport`, never the word "Refused"). Proven end to end: Start
  ingests `ticket.transitioned` with `to` equal to the fixture workflow's `initialStateId` (the exact
  payload captured and asserted, not merely "an event fired"), and the row leaves the Backlog tab once a
  CALL-COUNT-DRIVEN `getTickets` stub answers, on its second read, that the ticket's state moved — a
  fixed answer could not have falsified `list.reload()` firing. A refused Start renders the reason and
  re-enables the button; the transport wording never appears for a refusal. **Ruling 42's target
  resolution**: `ListRow` carries no `workflowId` (`view-types.ts:187-231` — `typeId`/`stateId` only), so
  `startTargetFor(row, types, defs)` (`apps/web/src/backlog-start.ts`) joins `row.typeId` through the
  workspace's own `TicketTypeDef[]` to a `workflowId`, then reads that `WorkflowDef`'s `initialStateId`
  from a `Map` the page fetches ONE `getWorkflowDef` per DISTINCT workflow among the backlog rows on
  screen (never one per row) — unit-tested directly (known type+def → the initial state; unknown type →
  null; known type, def not yet arrived → null); a `null` target disables Start rather than submitting
  `{to: null}`. **Addition beyond Ruling 42's literal prop list**: `BacklogStartButton` also takes
  `currentUserId`, undeclared in the ruling's `{row, toStateId, dataSource, workspaceId, onStarted}` —
  `makeSubmittedFactory` needs an `actorId` and nothing else in that list supplies one; the page gates the
  whole `rowAction` capability on `session.kind === 'signed-in'` (mirroring `board.tsx`'s own `moves`
  gate, case 3.144's "the write door is never offered an empty actor"), so it is never `''` when a click
  can reach it. Mutation (submitting `to: row.stateId` instead of `toStateId`, `cp`/`sha256sum` restore):
  kills exactly this case's ingest-payload assertion (`PASS (3) FAIL (1)` of the file's 4) and no other —
  (`apps/web/test/backlog-tab.test.tsx`, `apps/web/test/backlog-start.test.ts`)
- **13.596** ✅ Task 10 — the Backlog tab's empty copy, `Nothing in the backlog — new tickets land here.`,
  passed to `TicketList`'s new `emptyCopy?` prop. **`emptyCopy` defaults to ABSENCE, not a new sentence**:
  before this task `TicketList` rendered NOTHING beneath its controls bar for a zero-row set (`groupRows([],
  DEFAULT_GROUPING, labels)` answers `[]` for every grouping but `flat`, and `sections.map` over `[]`
  iterates nothing; `flat` itself answers one section holding zero rows, an empty table with no message
  either) — measured by reading the component, not assumed. A component-owned default sentence was
  considered and refused: `rows.length === 0` means "the project truly holds none" on one tab and "a
  filter hid all of them" on another (`listNarrowing`'s own docblock; Ruling 19's `isNarrowed` one layer
  up in `board.tsx`), and `TicketList` cannot tell the two apart — only a caller holding the narrowing
  context can. So the List tab passes nothing and keeps its pre-Task-10 silence (pinned directly); only
  the Backlog tab passes a sentence true of itself —
  (`packages/app-core/test/views/ticket-list.test.tsx`, `apps/web/test/backlog-tab.test.tsx`)
- **13.597** ✅ Task 10 — `TicketList`'s two new Backlog-tab-facing seams, neither exclusive to the Backlog
  tab. `rowAction?: (row: ListRow) => ReactNode` renders once per row in a trailing `<td>` (a matching
  empty `<th>` in the header row), threaded to BOTH `ListTable` mounts (the "Recently assigned" pin and
  every grouped section) — absent, no trailing column renders at all, byte-identical to before this task
  (pinned directly). A second `<Chip tone="neutral">Closed</Chip>` renders BESIDE the existing state chip
  (`ListCell`'s `'status'` case, `:411-416` pre-task) when `row.closed !== null` — beside, never replacing,
  since `closed` and `stateId` are independent facts (spec §1.2: a closed ticket keeps the state it was
  closed FROM). Both fixture rows in the pinning case carry `assignee: null` deliberately: a row assigned
  to `currentUserId` legitimately renders TWICE (this component's own invariant 1 — "exactly once ACROSS
  THE SECTIONS", not "exactly once on the page"), which would double-count `rowAction` and double-render
  the Closed chip, passing either assertion by accident —
  (`packages/app-core/test/views/ticket-list.test.tsx`)
- **13.598** ✅ Task 11 (spec §5.5, Ruling 45) — the Closed axis's own cycle. `closedMode(filter):
  ChoiceMode`/`withCycledClosed(filter): FilterSpec` (`filter-cycle.ts`) read/write `filter.closed`
  directly (`undefined → 'off'`, `true → 'include'`, `false → 'exclude'`) rather than through
  `withIdAxis`'s per-axis list machinery — `closed` is a single boolean, not an `IdAxes` member, so there
  is no list to add or remove a value from. The cycle itself reuses `nextMode` UNCHANGED: off → include →
  exclude → off, the same three states every other control in the Filters sheet already drives, which is
  why `TriStateChoice` needs no new prop shape to render it. **Ruling 44/45 replaces the brief's own
  names** (`closedMode(filter): 'all' | 'only' | 'hidden'`, `nextClosedMode`, `withClosedMode`) with this
  `ChoiceMode`-shaped pair — a second three-word vocabulary alongside `ChoiceMode` would be two spellings
  of the one cycle the control renders. `off` DELETES the `closed` key (verified via `'closed' in filter`
  being `false`, not merely `toEqual({})`, since `toEqual` cannot distinguish a deleted key from one
  written `undefined`) rather than writing `closed: undefined` the way `withIdAxis`'s own collapse rule
  does for an emptied id-axis list —
  (`apps/web/test/filter-cycle.test.ts`)
- **13.599** ✅ Task 11 (spec §5.5, Ruling 44) — the Closed axis's own chip in `buildFilterChips`
  (`board-search-scope.ts`): `spec.closed === true` → `Closed: only` (mode `include`); `spec.closed ===
  false` → `Closed: hidden` (mode `exclude`); unset → no chip. ONE chip, never two — unlike every axis
  `buildFilterChips` already covers, `closed` is a single boolean with no include/exclude halves that
  could both be set at once, so this is an `if`/`else if`, not two independent `has()` checks. Joins the
  chip list directly after the category chips, before `projectIds` — pinned by asserting the exact key
  order on a spec that sets all three. `spec`'s own parameter type widens `BoardFilterSpec` with an
  optional `closed` rather than `closed` joining `BoardFilterSpec` itself: a `BoardCard` cannot answer it
  at all (no field for it, unlike the four axes `describeUnappliedBoardAxes` already discloses as merely
  board-blind), so `page.tsx`'s own Board-tab call into this function (bare `boardFilter`) never sets it
  and this branch never fires there — see 13.600/13.601 for the List/Calendar/Timeline call that does.
  `onRemove` clears it back to unset via the same `clear({ axis: undefined })` idiom every include-half
  chip in this file already uses —
  (`apps/web/test/board-search-scope.test.ts`)
- **13.600** ✅ Task 11 (spec §5.5, Ruling 44/45) — the Closed control in the Filters sheet, and Backlog
  joining the State chips. ONE `TriStateChoice`, not a person row or a chip list (`closed` has no
  per-value set the way Assignee/Type/State/Category each do), placed in its own fieldset directly after
  State: cycles with the accessible names `Closed` / `Closed, included` / `Closed, excluded`, the SAME
  `TriStateChoice`/`ChoiceMode` contract 13.552 already proved for a person row, now driven by
  `closedMode`/`withCycledClosed` instead of `choiceMode`/`withCycledId`. On the List tab, "Closed only"
  narrows to exactly the closed row under a `Closed: only` chip; "Not closed" (the next click) hides it
  under a `Closed: hidden` chip — `listFilterSpec.closed = filter.closed` (`page.tsx`) is what reaches
  `matchesListRow`'s own `closed` clause for real, not merely a control that renders. **Ruling 45 — no
  second def fetch**: the State section's options are the board's own column states (already read for the
  board's moves) PLUS the universal `{ id: BACKLOG_STATE_ID, name: BACKLOG_STATE.name }` from
  `@gisik-nokma/domain`, appended LAST in `boardStateNames` (mirroring `statesWithBacklog`'s own "always
  last" rule) — `Backlog` appears exactly once among the State chips, never duplicated with a real column,
  because the id is RESERVED and `validateWorkflowDef` refuses any definition that declares it. The
  brief's own "via `getWorkflowDef`" is dropped: nothing here fetches a definition `page.tsx` was not
  already holding —
  (`apps/web/test/filters-sheet.test.tsx`)
- **13.601** ✅ Task 11 (spec §5.5, Ruling 44) — Calendar and Timeline hide closed tickets by default.
  **The coexistence problem Ruling 44 exists to solve**: the spec's own mapping (`closed: undefined | true
  | false`, the two date tabs passing `closed: false` when unset) has no fourth state, so "All" could
  never show a closed ticket on those tabs and the mandated `Closed: hidden` chip could never be removed.
  **The fix**: a page-level `const [showClosedOnDates, setShowClosedOnDates] = useState(false)`; the
  effective clause Calendar/Timeline's own `datesNarrowing` (`page.tsx`) applies is `filter.closed ??
  (showClosedOnDates ? undefined : false)` — an EXPLICIT `filter.closed` (either value) always wins;
  only while it is unset does `showClosedOnDates` decide anything. `datesNarrowing` is a FURTHER cut of
  `listNarrowing.rows` (not a fork of it), and `dateInputs` reads `datesNarrowing.rows`, not
  `listNarrowing.rows`, from this task on. Proven: a closed ticket with a due date is absent from both the
  Calendar's own count (`1 of 2 shown`, not `2 of 2`) and the Timeline's own ticket-level rendering (its
  "Undated or partially dated" side list, 13.558's own discriminator — the title is genuinely gone, not
  merely uncounted) while the default is in force; the strip carries a `Closed: hidden` chip (key
  `closed-default`, distinct from the EXPLICIT control's own `closed` chip so the two can never collide)
  whenever `filter.closed === undefined && !showClosedOnDates`, gated to the calendar/timeline tabs only;
  its `onRemove` calls only `setShowClosedOnDates(true)` — never touches `filter` — and removing it
  restores the ticket. **AMENDED per Ruling 44's own text** ("removing the `Closed: hidden` chip shows the
  closed ticket on the Calendar; the List tab is unaffected; the Timeline likewise"): the List tab is
  proven unaffected directly — `listFilterSpec.closed` carries only the explicit control
  (`page.tsx`'s own `listFilterSpec`), so the closed row is visible there throughout, regardless of
  `showClosedOnDates`. An explicit `Closed only` set on the Calendar overrides the default in the other
  direction, surviving to show only the closed ticket (same `1 of 2 shown` shape, opposite surviving
  ticket, one `closed` chip and no `closed-default` chip). The strip's gate counts the mandated default
  chip (`chipCount: chips.length` on these tabs, not the Board-only `activeFilterChips.length`) because,
  unlike the workflow picker's own chip, it is not always covered by `shown !== total` on its own — a
  project with zero closed tickets today would otherwise compute the chip and never render it. Mutation
  (`filter.closed ?? (...)` → `filter.closed` on `datesNarrowing`'s own clause, `cp`/`cmp` restore): kills
  exactly this case's three assertions and no other (`PASS (17) FAIL (3)` of the file's 20) —
  (`apps/web/test/board-narrowing.test.tsx`)
- **13.602** ✅ Task 11 fix round 2 (Ruling 46, review Finding 1) — `describeUnappliedBoardAxes` gains a
  FOURTH board-blind axis, `closed`, for a reason distinct from the original three: `matchesBoardCard`
  does not merely lack a field to compare `closed` against, the board EXCLUDES closed tickets from every
  column entirely (spec §3.2), before a card can ever reach it. That asymmetry is why only
  `filter.closed === true` ("Closed only") is disclosed — `false` ("Not closed") is already vacuously
  true of the board by construction, so naming it would describe a real axis doing nothing, the opposite
  of this function's own purpose. **The gap this closes**: `buildFilterChips` grew a `closed` branch in
  this same task (13.599), making `closed` chip-representable and therefore filter-settable — but
  `boardFilter` never carries it (Board is "unchanged" per spec §5.2), so an explicit "Closed only" was
  silently unenforced on the Board tab: ordinary cards kept showing, with no chip (correct — a chip would
  lie) and, before this fix, no disclosure either. Pushed LAST, after `custom field` (the three original
  axes were already ordered before this one existed) — pinned by a case that sets both `dueBefore` and
  `closed: true` and asserts `['due date', 'closed']` exactly. Mutation (dropping the new
  `if (filter.closed === true) axes.push('closed')`, `cp`/`cmp` restore): kills exactly the "names closed"
  and "joins last" assertions and no other (`PASS (34) FAIL (2)` of the file's 36). **The page-level
  sibling question (Ruling 46 point 2)**: `board-narrowing.test.tsx` has no page-level sibling of 13.440
  (a real-UI Board-tab unapplied-axis disclosure) — its one `board-scope-note` reference (13.556b) is
  List-tab-specific, proving the note names "the list", not "the board". The actual sibling is
  `filters-sheet.test.tsx`'s 13.451 ("the deferred Task 4 test: collaborator is unapplied on the board"),
  which drives the real Filters-sheet UI and asserts `note.toHaveTextContent(/not applied on the board/i)`
  for the collaborator axis — the same render template (`page.tsx`'s `Not applied on the {tabNoun}:
  {unapplied.join(', ')}.`) would read `Not applied on the board: closed.` for an explicit Closed-only
  filter with no other unapplied axis, but no new assertion was added there: Ruling 46 point 2 scoped the
  "add one assertion" instruction to `board-narrowing.test.tsx` conditionally, and that file has no such
  sibling to add it to —
  (`apps/web/test/board-search-scope.test.ts`)

## Task 12 — closing paragraph: final gate, catalogue checks, citation sweep

**Gate (Node v22.23.2, all six packages, whole-suite `vitest run` plus
`typecheck`):**

| Package | Tests | Typecheck |
|---|---|---|
| `packages/domain` | PASS 486 / FAIL 0 | EXIT=0 |
| `packages/rule-engine` | PASS 298 / FAIL 0 | EXIT=0 |
| `packages/app-core` | PASS 1418 / FAIL 0 | EXIT=0 |
| `packages/ui` (incl. token-discipline scan) | PASS 315 / FAIL 0 | EXIT=0 |
| `apps/web` | PASS 430 / FAIL 0 | EXIT=0 |
| `apps/server` (Postgres) | PASS 1531 / FAIL 0 / SKIP 5 | EXIT=0 |

`node scripts/check-case-ids.mjs`: EXIT=1 (expected -- the only two duplicates are the pre-existing, explicitly-allowed `13.387`/`13.413`; "check-case-ids: real sweep -- bare 1136, bold 977, marker-first 43, sum 2156, union 2153, 12 files scanned").
`node scripts/check-case-citations.mjs`: EXIT=1 overall, but file 13's own uncited set is exactly `13.401`/`13.476`/`13.477` as required -- "13-deployment-dogfooding.md: 485 cited / 3 uncited / 488 total". The script's 5 ratchet violations are ALL pre-existing at `3222b908` (verified in a disposable worktree at that commit, identical output) and touch files this plan never opened (`03-foundation-ledger.md`, `10-workflow-builder.md`, `11-calendar-notifications.md`, `15-in-app-help.md`); not this task's doing and out of its scope.

**Per-task mutation summary** (one line per task, quoting each task's own
report, `.superpowers/sdd/2026-09-17-backlog-and-closed-core/task-N-report.md`):

- **Task 1** — two mutations, each killing exactly one predicted case:
  dropping the terminal-state filter from `universalTransitions`'s
  Send-to-backlog computation kills 13.562 alone ("no edge from `done`");
  removing `foldStateIdForward`'s backlog early-return kills 13.563 alone.
- **Task 2** — mutating `p.start === 'backlog'` to `p.start !== 'focus'`
  kills 13.565 alone (plus one knock-on assertion sharing the same cause);
  "the mutation is caught exactly where the additive-field rule's own guard
  lives, and only there among tests that don't happen to also omit `start`."
- **Task 3** — three mutations against the brief's own predictions, plus one
  in the fix round: deleting the closed check kills 13.570 alone; reverting
  `toState` to `latest.states` kills both 13.571 Send-to-backlog cases;
  collapsing the backlog-only ternary back to a plain wildcard lookup kills
  "the new wildcard case `13.571 … a wildcard edge does not apply from
  backlog — only Start does`" alone; reverting `checkTicketClosed`'s split
  guard (fix round) kills 13.568 alone, "every other case, including the
  unrelated `13.569`/`13.570` cases, stayed green."
- **Task 4** — the `rowToTicketState`-to-unconditional-`closed:null`
  mutation kills "exactly 13.572's second case."
- **Task 5** — removing `AND t.closed_at IS NULL` from `readBoard` reddens
  13.574 alone; removing the `closed` clause from `compile-filter.ts`
  reddens 13.578 (plus the pre-existing axis-enumeration test, expected
  fallout); fix round 2's three `def.states.find ?? stateId` →
  `statesWithBacklog` fixes are pinned by the new case 13.575b (RED/GREEN).
- **Task 6** — three mutations: reverting `transitionOptions`'s general
  loop to `def.transitions`/`def.states` "killed 9 tests, including the
  named 13.582 case"; removing the `fromStateId === BACKLOG_STATE_ID`
  special case "killed exactly one test — the wildcard-to-`done`-never-
  resolves-from-backlog assertion — and *not* the plain 'from backlog:
  exactly the Start edge' case," as predicted, since only a definition
  whose wildcard reaches a target different from Start can discriminate the
  two implementations; dropping the `closed` clause in `matchesListRow`
  "killed 3 tests."
- **Task 7** — five mutations across three fix rounds, each killing exactly
  one case: removing `disabled={closed !== null}` from Move… kills 13.586
  alone; reverting the non-terminal check on Close's render guard kills
  13.587 alone; removing the `finally` block (submitting never resets)
  kills 13.588a alone; moving `setSubmitting(false)` to the committed
  branch only kills 13.588b alone; dropping the new
  `setServerRefusal(null)` on the silence branch kills 13.588c alone, "on
  the 'server notice gone' assertion."
- **Task 8** — the Close-renders-regardless-of-category mutation "killed
  exactly `renders no Close button on a non-terminal column` and nothing
  else"; the ruling's predicted `submitDirect` silence-clear mutation was
  MEASURED, not assumed, to be redundant on the arrow path (the call
  site's own unconditional clear already covers it) — recorded honestly in
  13.590a's catalogue entry rather than claimed as a live discriminator.
- **Task 9** — dropping `start: draft.start` from the create payload kills
  exactly the two 13.592 cases; dropping the `setReopenPrompt` update on
  retry kills "exactly 13.593e, on the 'exactly one event' assertion (the
  retry resent both)"; dropping the reset on parent-selection change kills
  "exactly 13.591g."
- **Task 10** — mutating the ingest payload from `toStateId` to
  `row.stateId` kills "the ONE failure is 13.595's ingest-payload
  assertion; no other case moved" (`PASS (3) FAIL (1)` of `backlog-tab.test.tsx`'s 4).
- **Task 11** — the `datesNarrowing` closed-clause mutation "killed exactly
  the three 13.601 assertions"; dropping
  `names.set(BACKLOG_STATE_ID, BACKLOG_STATE.name)` from `boardStateNames`
  "killed exactly the Backlog-chip case in 13.600"; dropping the new
  `axes.push('closed')` line "kills exactly 13.602's two closed-sensitive
  assertions, nothing else."

**Citation sweep** (Ruling 30's method — open the file at `3222b908` and at
HEAD, never by offset — over every source file the diff
`git diff --numstat 3222b908..HEAD -- '*.ts' '*.tsx' '*.css' '*.sql'`
(excluding `.superpowers/`) shows this plan grew, 87 files;
every `test-cases/*.md` file grepped, not only this one):

- 115 candidate citations found across
  `03-foundation-ledger.md`, `05-tickets-hierarchy.md`,
  `06-auth-visibility.md`, `07-api-realtime-search.md`,
  `12-offline-sync-apps.md`, `13-deployment-dogfooding.md` (including this
  section's own citations) and `14-mcp-server.md`. Two of the 87 files this
  plan grew (`page.tsx`, `precheck.ts`) account for most candidates; most of
  the 87 (every pure-insertion file among `view-types.ts`, `ticket-events.ts`,
  `filter-spec.ts`, `read-models.ts`, `entity-state.ts`, `matches-filter.ts`,
  `evaluate.ts`, `refusal-rules.ts`, `compile-filter.ts`, and every file this
  plan itself created new — `close.ts`, `backlog-start.ts`,
  `backlog-start-button.tsx`, `filter-cycle.ts`) drew zero pre-existing
  citations from outside this plan's own section.
- **12 re-pointed**, verified correct at `3222b908` and at the fixed line by
  direct read (never by offset arithmetic): `06-auth-visibility.md:248`
  `precheck.ts:154-157`→`:180-183`; `07-api-realtime-search.md:511,520`
  `precheck.ts:268`→`:294` (both occurrences); `07-api-realtime-search.md:527`
  `ticket-state.ts:56-63`→`:59-66`; `05-tickets-hierarchy.md:54,60`
  `ticket-state.ts:94`→`:99` and `:211`→`:221`; `12-offline-sync-apps.md:2395`
  `list.ts:143`→`:144`, `:103-112`→`:104-113`, `:205`→`:206`;
  `12-offline-sync-apps.md:140` `sync-routes.ts:59`→`:71`;
  `12-offline-sync-apps.md:1432` `ticket-sheet.tsx:276`→`:299`;
  `12-offline-sync-apps.md:152` `precheck.test.ts:165–180`→`:173–188`;
  `12-offline-sync-apps.md:1618` `workflow.ts:138`→`:184`;
  `12-offline-sync-apps.md:127` `harness.ts:567–577`→`:571–581`; plus, within
  this section's OWN prose (never checked against `3222b908` — it postdates
  it — checked directly against HEAD instead): `precheck.ts:425/437`→`:426/437`
  and `:460/467-473`→`:461/468-473` (13.583's paragraph), and
  `view-types.ts:188-220`→`:187-231` (Ruling 42's paragraph).
- **Already-stale before this plan, left alone (not this plan's doing):**
  the majority of the DATA-GAP citations `07-api-realtime-search.md`'s
  §7.187–7.196 make into `view-types.ts`/`board.tsx` — these predate even
  the `board-prototype-port`/`filter-exclude-all-tabs` plans and no longer
  point at the content their own sentences quote, unrelated to anything
  this plan touched; `03-foundation-ledger.md:85`'s `workflow.ts:144`
  (points at an unrelated `cause` field, not the `to` spelling it cites);
  `ui.css:1321` (cited twice in `13-deployment-dogfooding.md`, already
  found stale by the `board-prototype-port` plan's own sweep, "found
  ALREADY stale before this change").
- **Historical narrative, left as written, per the precedent this file's
  own prior sweep set** (`13-deployment-dogfooding.md`'s "Historical
  narrative, left as written" bullet, itself pre-existing at `3222b908`):
  every citation embedded in a dated, closed retrospective section —
  `03-foundation-ledger.md`'s "Planted defect"/"RECONCILED 2026-09-02"
  notes; the `board-prototype-port` plan's own dated sections ("Task 3"
  through "Ruling 29", 2026-09-16, lines 4157–5673) and its own "Final
  whole-branch review, fix wave" and "Finding 2 — 34 stale line-number
  citations swept" paragraphs; the `filter-exclude-all-tabs` plan's own
  "citation sweep" closing paragraph (lines 6097–6165) and its "Prose
  citations of pre-Task-6 names" paragraph — left untouched even where this
  plan's own edits shifted the line numbers those paragraphs quote, because
  re-pointing a number a retrospective reports AS ITS OWN FINDING would
  misrepresent what that past investigation actually found, exactly the
  reasoning the prior sweep itself recorded. A borderline case decided the
  same way: `07-api-realtime-search.md:527`'s "METHOD NOTE" records that
  `sync-routes.ts:32` once read "ten of them" — Task 2 of this plan changed
  that line's own wording to "twelve of them" (the line NUMBER is
  unaffected, 32 both before and after), so the note's quoted fragment is
  now stale prose, left as written since the note is itself a permanent
  lesson inside a still-tracked case (7.259), not a live claim about the
  docblock's current wording.

**§9's named-not-built additions** (this plan's own follow-ons, found
during execution — full list and file:line in the spec's "Follow-ons named
during execution" appendix, cross-referenced from §9): `check-case-citations.mjs`
letter-suffix support; `submitFromDialog`'s empty-results-as-committed gap;
the refused (not redirected) rebind into backlog; the parked fixture-suite
entries for the four new refusals; the untested signed-out `moves`/`rowAction`
gates; the sheet's `submitTransition` rejected-ingest path; the board strip's
untested-end-to-end "Not applied on the board: closed." sentence; and
13.588a's committed-path-only mutation witness.

**Suffixed-id hand check** (`scripts/check-case-citations.mjs` folds a
letter-suffixed id into its base id before computing the uncited set, so it
cannot see a suffixed case with no citation of its own — Task 12's own
follow-on above): every `13\.[0-9]+[a-z]` id in this file —
`13.520a`/`13.520b`/`13.528b`/`13.556a`/`13.556b`/`13.575b`/`13.588a`/`13.588b`/
`13.588c`/`13.590a`/`13.591a`–`g`/`13.593a`–`f` (`13.591b`–`e` appear only as
the range "13.591a–e" in prose, not as individual tokens; checked directly
against test files regardless) — appears in at least one file under
`packages/*/test` or `apps/*/test`. None missing; no fix needed. (13.593f
itself post-dates this Task 12 sweep — added by the final whole-branch
review's fix wave A, Ruling 50 — and is included here because leaving the
range at "a–e" would misstate this file's own current contents the moment
it was read.)

**Second-wave plan**: `docs/superpowers/plans/2026-09-17-backlog-and-closed-second-wave.md`
does not exist yet — §8 (ranking, auto-close, bulk close) is designed and
approved in the spec but has no plan document as of this task.

## Final whole-branch review, fix wave A (2026-09-17)

Range `3222b908..5181af11` (31 commits) reviewed at HEAD `5181af11`; full
findings in `.superpowers/sdd/2026-09-17-backlog-and-closed-core/final-review.md`
(git-ignored, not in this repo's history). This entry covers Rulings 49 and
50 — the client-side BLOCKER and one should-fix, from Findings 1 and 3.
13.593f (Ruling 50) is filed above, beside the 13.593 series it extends,
rather than down here; 13.603 (Ruling 49) has no series of its own and
stands alone below.

- **13.603** ✅ Ruling 49, Finding 1 — THE BLOCKER (2026-09-17) — `mapTicketState`
  (`packages/app-core/src/online/mappers.ts`) enumerated every `TicketState`
  field by hand and never read `record['closed']`, so `mapTicketRead` — the
  sole producer of `TicketRead.ticket` for the shipped web shell
  (`createOnlineDataSource`'s `getTicket` → `mapTicketRead` → `mapTicketState`,
  wrapped in `withCacheFeed` for the `ClientStateCache` too) — silently
  discarded the flag. Every reader spells `state.closed ?? null`, so the
  wrong answer (`undefined`) was indistinguishable from the right one
  (`null`) for a ticket that had never been closed, which is exactly why the
  sheet's badge/Reopen/Move-disabled, `precheck.ts`'s `closed-ticket`/
  `already-closed` gates, and `create-ticket-flow.tsx`'s `parentClosed` were
  all dead in production while every one of their OWN tests stayed green —
  each seeds a fake `DataSource` or `ticketStateSeed` directly and none
  crosses this mapper; found only because the review read the producer
  every scoped task's tests bypassed. Fix: one line,
  `closed: mapClosed(record['closed'], \`${path}.closed\`)`, reusing the
  helper `mapListRow` already calls for the identical wire shape (13.580).
  `mapClosed` throws on an absent key rather than defaulting, so
  `mappers.test.ts`'s shared `ticketReadBody` fixture now states its
  `ticketState.closed` explicitly (defaulting to `null`, so every
  pre-existing call site keeps exercising the "never closed" arm
  unchanged) instead of relying on this mapper's old silence. Proven THREE
  ways in this case: a wire `ticketState.closed` of `{actorId, at}`
  round-trips onto `TicketRead.ticket.closed` unchanged; `null` maps to
  `null`; and an ABSENT `closed` key is REFUSED (`MappingError`), not
  defaulted — pinned separately because a mutant reading
  `record['closed'] === undefined ? null : mapClosed(record['closed'], …)`
  satisfies the first two assertions (still validating a PRESENT claim
  through `mapClosed`) while silently reintroducing this exact defect for
  any body omitting the key outright (planted and confirmed: reddens ONLY
  the third assertion, `PASS (62) FAIL (1)` of 63, `cp`/`sha256sum`
  restore). Mutation (dropping the new `closed:` line entirely instead,
  same restore method): reddens BOTH `it`s this case is split across
  (`PASS (61) FAIL (2)` of the file's 63) —
  (`packages/app-core/test/online/mappers.test.ts`)

**Second commit of this wave — Rulings 53(iv) and 54, and the spec/`Features.md`
nits (Findings 5's docblock, 7, 6 and 9):**

- **Ruling 53(iv), Finding 5's docblock (no new case — a comment-only
  correction).** `ticket-sheet.tsx`'s Close/Reopen comment claimed "`closed`
  never survives a fold that also changes `stateId` … so a closed ticket
  stays terminal" — false: a rebind or republish fold CAN move a closed
  ticket's `stateId` into a non-terminal state (`foldTicketToWorkflowVersion`
  spreads `...state`; neither `ticket.closed`/`ticket.reopened` touches
  `stateId`). Rewritten to the true, smaller claim: the two buttons never
  both show because their render conditions are mutually exclusive on
  `closed` alone, not because closed implies terminal forever — that
  invariant is the rule engine's to hold (fix wave B, Ruling 53, at the
  rebind check and the republish validator). No behaviour change, no test.
- **13.604** ✅ Ruling 54, Finding 7 (2026-09-17) — the four close/reopen
  refusal REASON strings (`close-requires-terminal`, `already-closed`,
  `not-closed`, `closed-ticket`) are typed out twice, once in
  `checks/close.ts`/`transition.ts`, once in `precheck.ts`, and 13.583's own
  cases check `precheckEvent`'s copy against a literal THIS FILE wrote,
  never against the engine's — the RULE ID is already one shared constant
  (`REFUSAL_RULES`, imported from `@gisik-nokma/rule-engine` on both sides),
  but the reason TEXT has no shared source. **Option taken**: rather than
  export new reason constants from the rule engine (the ruling's
  alternative, and the larger of the two changes), this case drives each of
  the four refusals through the engine's own already-exported entry point,
  `evaluateEvent` (dispatching to `checkTicketClosed`/`checkTicketReopened`/
  `evaluateTicketTransitioned`, none of which is itself exported for a test
  to call standalone), and through `precheckEvent`, over the identical
  ticket/event pair, and asserts `reason` byte-identical — proving the
  agreement rather than assuming it, with zero changes to
  `packages/rule-engine`. **Verified as load-bearing, not merely
  non-vacuous, by two planted drifts** (`cp`/`sha256sum` restore both times):
  drifting `precheck.ts`'s own `already-closed` text reddens BOTH this case
  and 13.583 (both hardcode/derive the same string); drifting the ENGINE's
  `checks/close.ts` text instead — the gap this case exists to close —
  reddens ONLY 13.604 (`PASS (36) FAIL (1)` of the file's 37); 13.583 stays
  green throughout, because it never reads the engine's own answer —
  (`packages/app-core/test/precheck.test.ts`)

**Spec nits swept in the same wave** (Findings 6 and 9,
`docs/superpowers/specs/2026-09-17-backlog-and-closed-design.md`): §1.2 and
§6 both said the replica backfill list (`sync-routes.ts`'s
`BOOTSTRAP_BACKFILL_TYPES`) "gains" or is "gained" by the two closed-flag
event types — Amendment 5 already says the opposite (unchanged, on purpose:
neither event carries content beyond the fold a replica needs backfilled
verbatim) — a sixth body sentence the Amendments appendix's "five
rewritten" count had missed; both sentences now carry the
"(amended 2026-09-17, see Amendments — Ruling 5)" marker the other five
do, and the appendix's own count is corrected to six. §3.1's migration
filename, `1789000000000_proj-tickets-closed.sql`, never matched the
shipped file, `1789100000000_proj-tickets-closed.sql`
(`apps/server/migrations/`) — corrected at its one occurrence.
**`Features.md` checked, nothing to change**: no bullet claims the closed
flag reaches the sheet specifically "online" (as opposed to through the
replica, or as a data-source-agnostic fact) — the "Close / Reopen from the
ticket sheet" bullet describes `TicketSheet` reading `state.closed ?? null`
"off the read it already holds," true of either data source and never
false at the mapper layer 13.603 fixes, so it needed no hedge and needs no
un-hedge now.

**Final whole-branch review, fix wave B (2026-09-17) — Findings 2, 4 and 5
(the engine/server/validator half; the client half shipped in fix wave A).**

- **13.605** ✅ Ruling 52(b), Finding 2 (2026-09-17) — `checkTicketWorkflowRebound`
  (`packages/rule-engine/src/checks/workflow-rebind.ts:106`) refused
  `toStateId: 'backlog'` unconditionally, because `target.states` never
  contains backlog (universal, never declared — spec §1.1) — for a ticket
  ALREADY parked as much as for one that was not, which is what made the
  bulk migration route (13.606) a dead end for any type holding a parked
  ticket. Fix: accept `toStateId === 'backlog'` iff the ticket's CURRENT
  `stateId` is also `'backlog'` — parked-to-parked, never a declared state
  mapped INTO backlog. Two cases pin both halves: a ticket already parked
  (folded onto `stateId: 'backlog'` by a prior `ticket.transitioned {to:
  'backlog'}`, the universal Send-to-backlog edge) rebinding onto
  `wf-ops`'s backlog commits; a ticket on `wf-basic`'s own `todo` (not
  parked) rebinding onto the identical `toStateId: 'backlog'` still refuses
  `ticket.rebound-unknown-state`, proving Amendment 3 stands for the case it
  was written for and this is a narrow carve-out, not a general loosening —
  (`packages/rule-engine/test/workflow-rebind.test.ts`)
- **13.606** ✅ Ruling 52(a), Finding 2 (2026-09-17) — the bulk rebind route's
  occupied-state check (`apps/server/src/routes/builder-reads.ts`) filtered
  `unmapped` states with `!stateMap.has(stateId)` alone, so a `backlog` row
  — a state the dialog's own `stateMap` is built from `fromWorkflow.states`
  only and therefore can NEVER name — was an unconditional
  `migration.unmapped-state` for any type holding one, with no map the
  caller could ever have sent to answer it. Fix: the occupied-state check
  now skips `BACKLOG_STATE_ID`, and the emit loop sends `toStateId:
  BACKLOG_STATE_ID` for a parked row regardless of what (if anything)
  `stateMap` names for it. Own workflow pair, type and two tickets seeded
  (one on a declared state, one parked via `ticket.transitioned {to:
  'backlog'}`) in the 7.88/7.89 shape: a COMPLETE map of the source
  workflow's own declared states does not refuse `migration.unmapped-state`,
  both tickets commit (`count: 2`), and `proj_tickets` shows the parked
  ticket on the NEW workflow with `state_id = 'backlog'` while the other
  lands on its mapped declared state —
  (`apps/server/test/routes/builder-reads.test.ts`)
- **13.607** ✅ Ruling 51, Finding 4 (2026-09-17) — MCP's `create_ticket`
  (`packages/mcp-server/src/tools/write-tools.ts`) sent no `start` at all, so
  the domain's additive-field rule read that silence as focus and an
  assistant-created ticket landed on the board instead of the backlog every
  other creation path defaults to (spec §1.3/§5.4, amended to name MCP as a
  second creation path). Fix: the tool's input schema gains an optional
  `start: 'backlog' | 'focus'`, and the payload always sends `start: a.start
  ?? 'backlog'` — an explicit key either way, never an absent one, mirroring
  the discipline `parentId` (13.593a's neighbour, 14.71) already gets. Two
  assertions in one case: the argument's absence still emits `start:
  'backlog'` as an OWN property (`Object.hasOwn`, not merely
  `!== undefined`); naming `'focus'` gets exactly that back, unchanged. Dev
  seeds under `apps/server/src/seed/*` are unaffected — deliberately: they
  populate boards on purpose and are not a production creation path —
  (`packages/mcp-server/test/write-tools.test.ts`)
- **13.608** ✅ Ruling 53(i), Finding 5 (2026-09-17) — `checkTicketWorkflowRebound`
  never read `ticket.closed` at all, so a closed ticket in a terminal state
  could be rebound onto an ACTIVE (or open) state of the target workflow
  with nothing to stop it — `close-requires-terminal`'s own invariant,
  breached through the one door that never asked. Fix: when the ticket is
  closed and the target state's category (`stateCategoryOf`, backlog-aware)
  is not `terminal`, refuse `REFUSAL_RULES.closedTicket` with the reason
  "This ticket is closed; a migration may only move it to a terminal
  state." Two cases, reusing `WF_OPS_V2` (already declared for the
  "latest, not pinned" case) rather than a new fixture, since it carries an
  active state (`triage`) and a terminal one (`shipped`) at the same
  version: a closed ticket (moved to `done`, then `ticket.closed`) mapped to
  `triage` refuses with the reason verbatim; mapped to `shipped` (a
  DIFFERENT terminal state) commits, and a second context that also folds
  the accepted rebind confirms — via `getEntityState`, not assumed from the
  accept alone — the ticket lands on `shipped`/`terminal` still carrying its
  `closed` claim —
  (`packages/rule-engine/test/workflow-rebind.test.ts`)
- **13.609** ✅ Ruling 53(ii), Finding 5 (2026-09-17) — the bulk rebind route
  had no gate at all for a closed row: the SELECT never read `closed_at`, so
  a closed ticket's own occupied state could be mapped onto a non-terminal
  target and commit, landing `closed_at IS NOT NULL` beside an active
  `state_category` — the same invariant breach as 13.608, reached through
  the route instead of a single event. Fix: the SELECT gains `closed_at`,
  and BEFORE any event is built, a closed row (`closed_at IS NOT NULL`)
  whose mapped target's category is not terminal refuses the whole request
  with `migration.closed-to-non-terminal`, naming the count and the
  non-terminal state(s), following `migration.unmapped-state`'s own
  refusal shape. Own workflow pair, type and two tickets seeded (one open,
  one moved to `done` then closed): mapping the closed ticket's `done` onto
  a declared ACTIVE target refuses with the reason verbatim and appends
  NOTHING (ledger unchanged, `proj_tickets` unmoved); the identical batch
  with `done` mapped onto a DIFFERENT terminal state instead commits
  (`count: 2`) and the ticket lands there still closed —
  (`apps/server/test/routes/builder-reads.test.ts`)
- **13.610** ✅ Ruling 53(iii), Finding 5 (2026-09-17) — `workflow.defined`'s
  republish check validated a `stateMapping`'s target only for EXISTING
  (`unknownTargetState`) and DROPPED-not-current (`stillExists`), never for
  CATEGORY — so a dropped TERMINAL state could be remapped to a non-terminal
  survivor, and `foldTicketToWorkflowVersion` (which spreads `...state`)
  would carry a closed ticket's `closed` claim onto that non-terminal
  `stateId` with no event in its history ever having touched it. Fix: for
  each `stateMapping` entry, when the OLD state's category (in `latest`) is
  `terminal` and the TARGET's category (in `payload.states`) is not, refuse
  `REFUSAL_RULES.workflowStateMapping` with the reason "The stateMapping
  sends terminal state "<old>" to "<target>", which is not terminal; closed
  tickets must stay in a terminal state, so a dropped terminal state may
  only map to another terminal state." New fixture `wf_two_terminal` (two
  terminal states in v1, `done`/`archived`) so v2 can drop one and still
  satisfy `validateWorkflowDef`'s own "no terminal state" gate on the
  survivor — needed for this case to reach the stateMapping category check
  at all rather than refusing `workflow-structure` first: `done` (terminal,
  dropped) mapped to `doing` (active, survives) refuses, naming both
  states; mapped to `archived` (the OTHER terminal survivor) accepts —
  (`packages/rule-engine/test/engine.test.ts`)

**Final fix wave, round 2 (2026-09-17) — opus re-review findings N1 and N2.**

- **13.611** ✅ Ruling 56(a), Finding N1 of the opus re-review (2026-09-17) —
  closed ⇒ terminal's FOURTH door: 53(iii)'s loop only walks
  `stateMapping`, owed for a DROPPED state, but a state that KEEPS its id
  owes no mapping at all — and `foldTicketToWorkflowVersion`
  (`ticket-state.ts:359`) recomputes a ticket's `stateCategory` from the
  new definition regardless, so an author flipping a SURVIVING terminal
  state's category to active or open (the builder's category select
  carries no published-state lock, only a permission gate,
  `state-node.tsx:41-42`) reaches the identical `closed_at IS NOT NULL`
  beside a non-terminal `state_category` that (iii) exists to forbid, with
  `validateWorkflowDef` seeing nothing wrong (some OTHER state is still
  terminal). Fix: a second loop over `payload.states`, refusing
  `REFUSAL_RULES.workflowStateMapping` (the SAME id as 53(iii) — chosen
  because `workflowStructure` refusals come only from
  `validateWorkflowDef(payload)` alone, which never sees `latest` and so
  could never name a "before" to compare against, while this check is
  inherently a two-version comparison over the identical invariant) when a
  state present in both `latest.states` and `payload.states` has category
  `terminal` in `latest` and something else in `payload`. New fixture
  `wf_two_terminal`'s `done` KEPT but demoted terminal → active (no drop,
  no mapping) refuses with the reason verbatim; kept and unchanged
  accepts — the positive control proving the gate reads categories, not
  merely "did anything change" —
  (`packages/rule-engine/test/engine.test.ts`)
- **13.612** ✅ Ruling 56(b), Finding N2 of the opus re-review (2026-09-17) —
  the bulk rebind route's `stateMap` accepted a caller-supplied `backlog`
  KEY and silently overrode it (`toStateIdFor` always answers
  `BACKLOG_STATE_ID` for a parked row regardless of what the map names for
  it, Ruling 52(a)) — the unrefused mirror of naming `backlog` as a VALUE,
  which `migration.unknown-target-state` already catches. The dialog can
  never send such a key (`stateMap` is built from `fromWorkflow.states`
  only), but a hand-built request can. Fix: a new rule
  `migration.backlog-not-mappable`, checked right after `stateMap` is
  built — before any workspace lookup, since the question needs nothing
  but the caller's own body — with the reason "\"backlog\" cannot be a key
  in the map: parked tickets carry across as parked automatically and need
  no entry." A request naming `backlog` as a key refuses with that reason
  verbatim and appends nothing —
  (`apps/server/test/routes/builder-reads.test.ts`)

**Block 13.650–13.653 — hot-reload dev mode for the compose `server`, 2026-09-18.** All four are `🧪`:
the property under test is that a CONTAINER, started by compose, picks up HOST edits — there is no test
runner on either side of a Docker Desktop bind mount, and a unit test of the compose file would assert
YAML rather than prove the reload. Numbers below were measured once, on this machine, at the head of
this change's PR; they are readings, not guarantees. (The branch's high-water mark was **13.612**;
`13.632`/`13.999` are this file's documented truncation traps, not free ids.)

**These four were minted as 13.613–13.616 and RE-MINTED here on the controller's ruling of 2026-09-18.**
Renumbering is otherwise forbidden in this catalogue; it is done once, for this block, because the four
ids were not free when they were taken. `docs/superpowers/plans/2026-09-17-backlog-and-closed-second-wave.md`
— on the branch since `5039209c`, which is BEHIND this change — reserves `13.613–13.649` for its twelve
tasks and names `13.613`/`13.614`/`13.615`/`13.616` in its own test names. That plan was written when
this file's high-water mark was 13.612, so "the next free id here" and "the next reserved id there"
pointed at the same four numbers, and only this file was consulted. Nothing was red: the plan's ids are
not in the catalogue yet, so no duplicate id existed to trip `check-case-ids`. It is fixed now rather
than left because the second wave would otherwise mint twelve tasks on top of these rows, and a plan's
reservation is a reservation. The allocation note at the top of this file now carries the rule.

> ## ⛔ SUPERSEDED 2026-09-19 — the eight cases below describe HOT-RELOAD MODE, which no shipped command
> ## reaches any more. **Kept, not deleted, not renumbered, and no id freed.**
>
> The owner removed hot reload: *"no more hot reloads. rebuilt once they hit the main, is fine. that means
> the servers are to be run from the main folder instead of from the executor's branch."* `pnpm dev:stack`
> now composes **`docker-compose.dev.yml` alone**, so the stack serves BUILT images from
> `/Users/kiro/my_projects/gisik-nokma`, and `docker-compose.hot.yml` is kept without being composed by
> anything. The replacement case is **`13.946`**, at the foot of this block.
>
> **Read the rows below as the record of a mode, not as cases that can run.** They are kept because their
> measurements are facts about this machine's Docker Desktop mount and about compose's own behaviour —
> each cost real time to take and each is cited by the live documents: the rename-over save shape that
> never crosses the mount and permanently kills a `tsx watch`; `node --watch --import tsx` measured failing
> even on an in-container write; busybox `kill -0` succeeding on an exited-but-unreaped child; compose v2
> shell-word-splitting a string-form `command`. `docker-compose.hot.yml`'s own header is retained for the
> same reason, and the runbook's hot half now sits under a `RETIRED` banner pointing here.

> **A note on this block's ids, since it is the one place in this file where a renumber ever happened:**
> the four original ids (`13.613`–`13.616`) collided with a plan's reservation and were re-minted as
> `13.650`–`13.653` by controller ruling on 2026-09-18. That is history and is **not** a licence to
> renumber now — the supersession above renumbers nothing.

- 🧪 **13.650 — the hot `server` comes up from the worktree and serves the BRANCH's source, not a
  baked image.** `docker compose --env-file .env -f docker-compose.dev.yml -f docker-compose.hot.yml
  up -d --build server` run from the executor's worktree: cold build **94 s**, container healthy
  **~24 s** after start, `curl -s localhost:3000/v1/auth/methods` → `{"google":true,"apple":false,
  "phone":false}` — which proves the OAuth pair reached the container but NOT that `--env-file` is
  what put it there, and the causal half was measured and refuted: with the flag omitted, compose
  auto-loads `.env` from the project directory and `GOOGLE_CLIENT_ID` still renders its full 72
  characters (control: `env | grep -c GOOGLE_CLIENT_ID` → 0 in the shell). The flag's real effect is
  turning a MISSING `.env` into a hard stop rather than a silent empty substitution. Then the check
  that the 2026-09-09 incident was: `docker exec gisik-nokma-dev-server-1 grep -c closed_at
  /repo/apps/server/src/read/ticket-cards.ts` → **4**, with the same-file control `collaborator_ids` →
  **3**. Read through the mount, so it is the branch's source rather than a compiled-in value — against
  the stale image it was **0** (control 2, i.e. a valid measurement), and the owner's Backlog tab was
  failing at exactly that. Cost, two readings at two moments rather than the flattering one:
  **1.602 GiB / 7.667 GiB, 2.30 % CPU** immediately after W1, while the seven `tsc --watch` processes
  were still emitting their initial `dist`, and **1.194 GiB, 2.24 % CPU** once settled. The second is
  the steady state. Mounts: the override declares **ten**, and the container reports **eleven** — the
  extra is the base file's own `./reference:/app/reference:ro` surviving the merge, as designed, and
  inert because `/app` does not exist in the dev stage. The mount that matters for `seed:cc` is
  `/repo/reference`, which this override declares itself. All eleven resolve under the worktree
  (`docker inspect --format '{{range .Mounts}}{{.Source}}{{"\n"}}{{end}}'`).
  (`docker-compose.hot.yml`, `apps/server/Dockerfile`)
- 🧪 **13.651 — a server-source edit is live in seconds, with no rebuild and no `restart`.** A
  `console.log("HOT-WITNESS-SERVER")` added at the top of `apps/server/src/index.ts` appeared in
  `docker logs` and a `[tsx] change in ./src/index.ts` restart line followed in **1.93 s** —
  re-measured after the container command gained the watcher supervisor; it was **1.62 s** before
  that, and the supervisor costs nothing on the reload path (`restarts=0` on the container across
  every edit here). **The
  measurement carries a negative half that matters more than the positive one:** the same edit written
  as a RENAME-OVER (`mv` a temp file onto the path — the atomic-save shape) produced **NO inotify event
  in the container at all** and never reloaded, measured with a timestamped `fs.watch` on the same file
  (in-place append → one event at 3887 ms; rename-over → zero events). So host→container events cross
  the Docker Desktop mount for in-place writes and NOT for rename-over, and a save that uses the latter
  is missed silently rather than slowly. Recorded rather than papered over with polling: the dispatch's
  condition for enabling `CHOKIDAR_USEPOLLING` is that inotify events provably do not cross, and this
  measurement shows they do, partially. **The same case carries a second negative: the watcher
  SUPERVISOR was tried and does not work.** A dead package watcher is invisible from outside — the
  container stays up, `/healthz` answers, `docker ps` says healthy — so a `kill -0` poll over the two
  backgrounded jobs was written and shipped to a running container. It was then measured: `pkill` on
  the tsc processes left the container healthy and `restarts=0`, and the supervisor never fired. Two
  independent reasons, both measured — busybox `ash` has no `wait -n` (a job exiting 7 reported status
  0), and `kill -0` on an exited-but-unreaped background child still succeeds, so the liveness test
  never turns false. The guard was **removed rather than left in place**, because a guard that cannot
  fire is worse than none: it is trusted. The failure is documented as an operator check instead, with
  a count — `ps -o args= | grep -c "typescript/bin/tsc"` → **7**, one per package; the near-miss
  pattern `tsconfig.json --watch` matches **9** because the container's own command line and the
  `pnpm -r` parent both contain it. (`docker-compose.hot.yml`, `docs/runbook.md`)

  **AMENDED 2026-09-18 (Step 1b) — the save shape of the tool that does the editing, the watcher change it
  forced, and a correction to the count at the end of this case.** The in-place measurement above was true
  and incomplete. `tsx watch` is still what runs; what changed is that it now POLLS, and both halves of that
  sentence are measured:
  **the assistant's Edit tool writes by RENAME-OVER, not in place** — the host inode changes on every edit,
  measured three times across two files (`apps/web/app/sign-in/page.tsx` `204060486 → 204060616 → 204060679`,
  `apps/server/src/index.ts` `204014631 → 204061084`), which makes the rename-over shape this case calls an
  occasional "atomic save" the shape EVERY assistant-written server edit has. **And that shape does not
  merely get missed — it kills the watch.** After one such write to `src/index.ts`, neither a true in-place
  write (inode preserved, measured) nor a `touch` produced a `[tsx]` line in 15–20 s, while the same in-place
  write on a freshly restarted container produced `[tsx] change in ./src/index.ts Restarting...` in **0.5 s**.
  In between, the API served stale code with `/healthz` answering 200 and the correct file on the mount.
  **Door one was measured and is closed:** `node --watch --import tsx src/index.ts` — Node's watch mode
  watches each loaded module's parent DIRECTORY rather than the inode, so it should be indifferent to the
  save shape — did not restart on a host rename-over, a host in-place write, or a write made INSIDE the
  container. The last of those crosses no mount at all, so it is the watcher not seeing its own entry point,
  not virtiofs losing events. **Door two ships:** `CHOKIDAR_USEPOLLING=true` with `CHOKIDAR_INTERVAL=1000`.
  Witnessed in ONE container, not restarted between the halves — an Edit-tool write (rename-over, inode
  verified changed) restarts it in **1.6 s** and its marker is served; a true in-place write AFTER that
  restarts it again in **1.6 s**, so the watch survived the rename; and a `packages/domain/src` edit reached
  `dist` and restarted the server **2.6 s** end to end. Cost, settled `docker stats` with the variable
  overridden back to empty in the same session: CPU **6.05–6.47 %** with polling on versus **2.39–3.73 %**
  off, memory ~1.24 GiB versus ~1.22 GiB.
  **The correction:** the two operator counts at the end of this case cannot be produced by the commands as
  written. Measured on a container with all seven watchers alive — unbracketed
  `ps -o args= | grep -c "typescript/bin/tsc"` prints **9** and unbracketed `"tsconfig.json --watch"` prints
  **11**, because the `sh -c` line and the `grep` process match themselves. Bracketing the first character
  (`"[t]ypescript/bin/tsc"` → **7**, `"[t]sconfig.json --watch"` → **9**) reproduces the numbers this case
  claims. The runbook's copy of the check is corrected in the same change set.
  (`docker-compose.hot.yml`, `docs/runbook.md`)
- 🧪 **13.652 — a PACKAGE-source edit reaches the server through `dist`, which is the witness for the
  watcher SHAPE.** `export const HOT_WITNESS = "domain-hot";` appended to
  `packages/domain/src/index.ts`, plus `console.log(HOT_WITNESS)` in the server entry importing it from
  `@gisik-nokma/domain` (by package name, so it resolves through `./dist`): the marker appeared in
  **3.74 s** (re-measured with the supervisor; **3.92 s** before it), with `HOT_WITNESS` counted **1**
  in `/repo/packages/domain/dist/index.js` and the log
  showing both restarts — `change in ./src/index.ts` and `change in
  ./../../packages/domain/dist/index.js`. Total watchers on a settle: seven `tsc -p tsconfig.json
  --watch` (one per package), `tsx watch`, and the server process.
  **AMENDED 2026-09-18 (Step 2 Part 0) — the package watchers' OWN save shape.** The `tsc --watch` loops
  behind this case watched each FILE: `tsc`'s default strategy is `UseFsEvents`, which in the 5.9.3
  bundle is `fsWatch(fileName, File, …)` — a watch on the inode, so it carries the same blindness this
  case records for `tsx watch`. Both hot services now set
  **`TSC_WATCHFILE=UseFsEventsOnParentDirectory`** (case 5 of the same bundle), which watches the parent
  DIRECTORY rather than the file. Witnessed in BOTH containers with no restart between the halves: a
  rename-over Edit of a marker reached both `dist` copies in **~1 s** (host write `1789679099`, compile
  line `2:35:00`); an in-place append of a STATEMENT marker that followed reached both in **~1 s**
  (host inode `204132254` before **and** after, so provably not a rename; write `1789679122`, compile
  line `2:35:22`); and the revert put both back to zero. Settled `docker stats` for the pair: `server`
  **3.99–6.69 %** CPU / 1.266 GiB, `web` **1.55–1.69 %** / 1.332 GiB, beside this file's chokidar
  figure for the server's own watcher.
  **Two instruments lied before these numbers were trusted, and both are recorded because both read as
  a watcher verdict.** (a) *A marker the emitter does not carry measures nothing.* A marker comment
  placed before an elided declaration (`export type { PrefsOrigin }` — a type-only re-export, absent
  from the JS output) is dropped with it, and a bare `//` comment appended at EOF is dropped too, while
  a STATEMENT marker at that same EOF position is emitted; both silent shapes read as `0 in dist`.
  (b) *A poll timed from the operator's own tool call measures the OPERATOR* — the write is often
  already compiled before the loop's first iteration, so it reports `0 s` and measures nothing, and a
  broken marker's `0 in dist` then gets read as a watcher failure. The instrument that actually
  measures is the compile line in `docker logs --since …` against the host file's mtime. **This case's
  own amendment was first written the other way round** — a "the directory door fails the in-place
  half" conclusion drawn entirely from instrument (a) — and is corrected here rather than deleted,
  because the false reading was confident enough to have shipped.
  (`docker-compose.hot.yml`)
- 🧪 **13.653 — the un-hot path is intact and a no-`--build` `up` neither rebuilds nor replaces the
  container.** `docker compose … up -d server` with **no** `--build`: container id
  `df98f7588bf5…` identical before and after, and zero build/export/name lines in the output. And the
  plain path still reads what it read before: `docker compose --env-file .env -f docker-compose.dev.yml
  config --services` lists all six services including `server` and `web`; `git diff
  origin/owner/workspace-edits -- docker-compose.dev.yml apps/web/` is **empty**; and `docker build -f
  apps/server/Dockerfile .` with no target still produces an image whose `CMD` is
  `["node","dist/index.js"]` — the check that the new `dev` stage did not become the default build,
  which it would have if it had been appended after `runtime` instead of placed before it.
  (`docker-compose.hot.yml`, `apps/server/Dockerfile`, `package.json`)

**Block 13.654–13.657 — hot-reload dev mode for the compose `web`, 2026-09-18.** All four are `🧪`, for the
reason the block above gives: the property under test is that a CONTAINER, started by compose, picks up HOST
edits, and there is no test runner on either side of a Docker Desktop bind mount. Numbers were measured once,
on this machine, at the head of this change's PR — readings, not guarantees.

- 🧪 **13.654 — the hot `web` comes up from the worktree, serves the BRANCH's source, and proxies to the hot
  server.** Cold image build **68 s**. `up -d web` (no `--build`) → `curl :3001/` answers **307** (the sign-in
  redirect) **40 s** later, and `curl :3001/v1/auth/methods` returns
  `{"google":true,"apple":false,"phone":false}` in **139 ms** — the load-bearing half, because with
  `SERVER_ORIGIN` unset or wrong the same proxied path returns **500 after a 30-second hang** while the app
  itself still serves. All **11** mounts resolve under the executor's worktree (4 under `apps/web/`, 7 package
  `src` trees, none of them `node_modules`, `dist` or `.next`), and the `server` container was **not**
  recreated by that command (same id, `Up 19 minutes` at the reading).
  **The :3001 handover, as it happened.** The listener was pid **26954**, `ucomm=node`, executable
  `/Users/kiro/.nvm/versions/node/v22.22.2/bin/node`, thread titled `next-server (v15.5.25)`; its parent
  26946's argv was `.../next/dist/bin/next dev -p 3001`, grandparent `pnpm --filter @gisik-nokma/web dev`,
  cwd the owner's primary checkout. The whole tree was stopped, not just the socket holder, because
  `next dev` respawns its server child. 3001 was free **1 s** later, and the first 307 came **107 s** after the
  kill. **A second, unplanned recovery is part of this case:** at ~01:35 the Docker engine restarted on its own
  (every container `Exited`, the `dev` ones 137), and `up -d server web` brought both back with the **same
  container ids** in **7 s**, `google:true` included.
  (`docker-compose.hot.yml`, `apps/web/Dockerfile`, `package.json`)
- 🧪 **13.655 — a web-source edit is live in seconds, in BOTH save shapes, with the executor's own tool.** A
  `data-hot-witness` marker added to `apps/web/app/sign-in/page.tsx` via the Edit tool was served by
  `curl :3001/sign-in` (and gone again after the revert), restarting the compile in **1.2 s / 1.5 s / 1.5 s**;
  a **rename-over** (`mv` a modified copy onto the path) compiled in **1.6 s**; and a **true in-place write**
  (host inode verified UNCHANGED, `204060733 → 204060733`) compiled in **2.6 s** and was served within 4 s.
  That last one was measured on a SECOND pass, and the correction matters: the first pass labelled the three
  Edit-tool timings "in-place edits", and **they were not** — the Edit tool writes by rename-over (host inode
  changed on every edit: `204060486 → 204060616 → 204060679`), so the entire first pass was the rename-over
  shape, which is what the case four sentences later says. The numbers were right and the label was wrong, and
  a reader would have taken "both shapes" as licence not to care which one a save uses. The rename-over half
  is the load-bearing one either way: it is the shape 13.651 records the SERVER's watcher permanently losing
  its watch over, and Next's webpack watcher takes it without complaint.
  **One outlier is recorded rather than smoothed: 59.4 s** between a write and its compile; it landed, but a
  30-second wait reads it as lost, which is how the first pass mis-read it. **The instrument matters:** the
  Edit tool's round-trip precedes any curl poll, so a curl-based stopwatch starts ~17 s late; the write's own
  mtime against the compile line is the measurement.
  **A claim in this case was retracted, and the retraction is the more useful half.** The first version said
  `docker logs` WITHOUT `--since` under-reports (6 lines against 9). It does not: that reading compared a
  **summarised** result against a pass-through one — this machine's Bash hook routes commands through `rtk`,
  which can replace a bare `docker logs` output with its own summary, and the tell was a trailing
  `[warn] 0 warnings (0 unique)` / `[info] 0 info messages` footer that is rtk's and not the container's.
  As a control, bare and `rtk proxy` agree exactly (**658 lines each**). The surviving rule is the inverse one:
  a suspiciously short log read is evidence about the READER, not about the container.
  (`docker-compose.hot.yml`, `docs/runbook.md`)
- 🧪 **13.656 — a PACKAGE edit reaches the web through `dist`, and the package watcher can silently stop.**
  `packages/ui/src/tokens.ts`: `blue600` `#33629f` → `#abcdef`. The web container's own
  `packages/ui/dist/tokens.js` gained the new hex, and the SERVED HTML carried it **4 times** with the old hex
  at **0** — `themeStylesheet()` reads the palette through `dist`, so a token edit is visible on :3001 without
  a rebuild. Compile **6.7 s** after the write (20:19:21 → 20:19:27.7). **The revert is the finding:** the
  in-place write that put the old hex back was **not** seen by the web container's `tsc --watch` — 80 s later
  `dist` was still stale and the served page still `#abcdef`, and a `touch` did not wake it either. Only
  restarting the container restored it (307 again in **10 s**, palette back on the first poll). So the
  package watchers share the server's failure class even though Next's own watcher does not, and the reliable
  recovery is a restart rather than a save-shape change. Cost of the settled pair, one reading with polling
  on: `server` **8.03 %** CPU / 1.686 GiB, `web` **1.80 %** CPU / 2.685 GiB — the web holds its own `dist`
  and `.next`, which is why its memory is the larger of the two.
  **AMENDED 2026-09-18 (Step 2 Part 0).** The web container's package watcher is the one this case caught
  going stale (the 80 s revert above). Its cause is now named rather than inferred: the default
  `UseFsEvents` strategy watches the file's INODE, so a rename-over save — the shape the assistant's own
  Edit tool writes — leaves it watching a file that no longer exists at that path. Both hot services now
  carry `TSC_WATCHFILE=UseFsEventsOnParentDirectory`; the `web` half was witnessed in the same run as
  13.652's amendment, one write reaching both containers' `dist` copies in ~1 s, in both save shapes,
  with the inode checked to have survived the in-place half. **So the remedy this case records — restart
  the container — is no longer the remedy for a LOST watch**; a `restart web` is still what a dependency
  or `package.json` change needs. Cost of the settled pair after the change is in 13.652.
  (`docker-compose.hot.yml`)
- 🧪 **13.657 — the un-hot path is intact, a no-`--build` `up` neither rebuilds nor replaces, and the prod
  stages are unchanged — proven by CHECKSUM, not by reading a diff.** `docker compose … up -d server web`
  with no `--build`: exit 0, **zero** build/export/name lines, and `web`'s container id `daac60fe23a7`
  identical before and after. `docker-compose.dev.yml` is byte-identical to the base
  (sha256 `4af45990c8cd57052562fb794f64c5bbc84ce3b930ab592a2a5d68f0b4bf4a38` on both sides, and that is the
  proof — the `git diff` for it prints nothing at all, which is also what a typo'd command prints);
  `apps/web/Dockerfile` is **67 added / 0 deleted**, and its `runtime` stage extracted from the first
  `FROM … AS runtime` hashes identically to the base's (`c66cc6f9f59f…`). And the un-targeted build is still
  the production one: `docker build -f apps/web/Dockerfile .` with no target produces an image whose
  `CMD` is `["node","apps/web/server.js"]` with `WORKDIR=/app` (digest `34e65c7a…`) — the check that the new
  `dev` stage did not become the default, which it would have if it had been appended after `runtime`. **One
  caveat on the instrument:** the FIRST attempt at that build was killed by the engine restart above, and the
  background wrapper reported `exit code 0` while its own log said `EXIT=1` — the log is the reading.
  (`docker-compose.hot.yml`, `apps/web/Dockerfile`, `package.json`)

- ✅ **13.946 — the dev stack serves the BUILT image, and the rebuild rule keeps it equal to `main`.**
  This replaces the hot-mode block above, which no shipped command can reach any more. Five assertions,
  each the property the retirement turns on. **(1) BOTH stack scripts** — `dev:stack` AND
  `dev:stack:rebuild` — compose **`docker-compose.dev.yml` alone**, asserted on the scripts' own text:
  the whole change is that the hot override stops being reachable by the command a reader types by
  reflex, and a script that silently still composed it would leave every other instrument green while the
  stack served somebody's worktree. **The first version of this case checked only `dev:stack` — a review
  caught that `dev:stack:rebuild` is the script the runbook actually tells a reader to type, so the
  unguarded one was the load-bearing one.** **(2)** `dev:stack:rebuild` carries **`--build`** — a
  post-merge script that merely re-upped an existing image IS the stale-serving shape the rule exists to
  close, and it would read as success. **(3)** neither `server` nor `web` bind-mounts anything under
  `apps/` or `packages/`. **(4)** neither names a **build `target:`** — the invariant this change made
  load-bearing, since with `target: dev` gone from the compose path the LAST stage is what every shipped
  build produces, and no test asserted it before (a review found that gap). **(5)** the runbook names the
  post-merge command **and the exact directory** — pinned as the whole line
  `cd /Users/kiro/my_projects/gisik-nokma && pnpm dev:stack:rebuild`, because the first version asserted
  the bare path and **that is a PREFIX of `…/gisik-nokma-exec2`**: a runbook edited to `cd
  …/gisik-nokma-exec2 && …`, the exact coupling this change removes, would have passed.
  **The control that makes (3) trustworthy, and it runs in the same case:** the SAME predicate is run
  over `docker-compose.hot.yml`, which is full of exactly those mounts. **Measured: 20 mounts (9 on
  `server`, 11 on `web`), of which an apps-only variant of the predicate would still find 6** — so the
  threshold is **15**, above the degraded value, and the case additionally requires that both the
  `apps/` and the `packages/` alternatives matched. A bare `> 5` sat one below a live degraded count and
  would have kept the control green while assertion (3) went blind to 14 of the 20 mounts.
  (`apps/server/test/deploy/compose-dev-contract.test.ts`)
  **The price of the rebuild, measured rather than estimated, because the next reader's first question is
  "how expensive is this?":** `docker compose --env-file .env -f docker-compose.dev.yml build web`, run
  from `/Users/kiro/my_projects/gisik-nokma` on 2026-09-19, took **841 s — 14 minutes 1 second** — exit 0,
  on a **10-core** machine whose load average was **11.94 / 18.56 / 16.87** before it started and
  **8.54 / 8.10 / 10.78** after. **The long step is inside the image's own `turbo run build` + Next's
  trace collection,** not the layer export: the RUN step's last output landed at `304 s`, and the CLI then
  printed nothing for **301.3 s — five minutes and one second —** before exporting. **A watcher of that
  silence will read a working build as hung** — during this run I sampled it and saw a byte-identical log,
  and concluded it had stalled; it had finished normally. **So: per-merge rebuilds are minutes, not
  seconds. And the owner accepted the trade BEFORE this number existed** — the caution on record was the
  *shape* of the risk (*"a full `next build` in Docker is a multi-minute, multi-core operation"*), not a
  measurement, so the trade was made on a prediction. **The number now exists, and it is the owner's to
  re-weigh rather than mine to defend.**
  **One caveat the rebuild rule must carry, found while measuring:** the main folder's **branch label is
  not the check**. Measured 2026-09-19 it was labelled `owner/workspace-edits` — a branch retired and
  deleted from origin — while its HEAD was **exactly `origin/main`** (`rev-list --left-right --count
  origin/main...HEAD` → `0 0`, `git diff origin/main` empty). A build from *behind* `main` bakes older
  code and looks fresh; a build from a *feature branch* reinstates by hand the coupling the owner removed.
  The runbook now says to compare the SHA.
  `docker-compose.dev.yml`, `package.json`, `docs/runbook.md`, `docker-compose.hot.yml` (retired; kept)

**Block 13.658 — the interactive prototype refresh, 2026-09-18.** 🧪, for the block's usual reason: the
property under test is that an UNPACK is faithful, and there is no test runner on either side of it. The
proof is a comparison, so the case is written as one.

- 🧪 **13.658 — the owner's 2026-09-18 export unpacks deterministically and the unpacked page renders what
  the bundle renders.** `design-system/tools/unpack-bundle.mjs` reads the self-extracting "Bundled Page"
  (`__bundler/manifest` `:371`, `ext_resources` `:375`, `page_order` `:379`, `template` `:383` of the
  565,271-byte snapshot, sha256 `bf64cc44…`) and writes `interactive/desktop.dc.html` (320,109 B, sha256
  `2cda054b…`) plus the runtime `interactive/support.js` (69,150 B, sha256 `8fe7df74…`), which the repo has
  never contained — **so the committed prototype was previously un-runnable and is now runnable**. It
  prints every file it wrote with its byte count and hash, and refuses a bundle whose three required blocks
  are absent. **The faithfulness witness is a CONTROL, not an assertion:** the bundle is itself
  self-extracting, so it renders the same page from its own inline payload, and the two were loaded side
  by side (`python3 -m http.server 8777` for the unpack, `:8788` for the bundle — never 3001/3021). Both
  produced `#dc-root` with **identical visible text** ("Gisik Nokma The keeper of memory Phone Email link
  …", 213 chars) and **zero** surviving `{{ }}` placeholders; the rendered DOM dumps differ by exactly one
  attribute, the runtime's own `data-sc-name`, derived from the page's filename (`desktop` vs
  `2026-09-18-gisik-nokma-desktop-1.bundle`). Everything else is byte-identical. The List screen was then
  reached through the prototype's own sign-in flow and screenshotted
  (`refs/2026-09-18-desktop-unpacked-list.png`): controls row, the `epic · 4 tickets` group band,
  hierarchy rows, status pills, due-date sentences and `N of M done` all match the owner's screenshot.
  **Two instruments lied inside this case.** (a) The first version asserted `customElements.get('x-dc')`
  is defined and `querySelector('x-dc')` is non-null — **both are FALSE on success**: the runtime finds the
  raw tag, injects `x-dc{display:none}`, and REPLACES it with `<div id="dc-root">`, so that check could
  never have passed. (b) A shell `diff` reported the two DOM dumps **"identical"** while they differed by
  32 bytes — the same false-"identical" this repo has recorded before; `cmp` and a raw byte comparison in
  Node found the difference immediately. **And one real difference from the bundle is recorded rather than
  smoothed:** the unpacked page emits 5 console errors + 2 warnings the bundle does not — parse-time
  failures on `{{ n.iconPath }}`-style bindings inside inline `<svg><path d=…>` — because the bundle keeps
  its template inert inside a `<script>` while the committed form is the template as live HTML. The final
  DOM is unaffected (the dumps match), so this is parse-time noise inherent to committing the template as
  a page, not a loss of fidelity; it is named here because the dispatch's bar was "zero console errors"
  and the measurement is 7.
  (`design-system/tools/unpack-bundle.mjs`, `design-system/interactive/PROVENANCE.md`,
  `design-system/interactive/desktop.dc.html`, `design-system/interactive/support.js`,
  `design-system/MASTER.md`)

**The mobile entry is written too, and it took a flag to say so.** `ext_resources` names TWO entries
under one id (`./Gisik%20Nokma%20-%20Mobile.dc.html`), so the tool holds rather than picking: with no
flag it prints both and writes neither, which is how this refresh was first filed. `--mobile-entry 1`
now NAMES one, and the refresh wrote `interactive/mobile.dc.html` (227,232 B, sha256 `7316062b5bb3…`)
from entry #1 — the one that inlines the Google mark as `<svg>`, consistent with the same change the
2026-09-18 desktop template made to its own `isSignIn`. Entry #2 (226,533 B, sha256 `14ca5b8d89ab…`)
is not written; the two differ only at line 153, and which export is NEWER is still not derivable from
the bundle (`page_order` is empty, no timestamps), so the choice is recorded as a choice rather than a
determination. Both halves of the flag are witnessed: no flag → nothing written; `--mobile-entry 3` →
exit 1, *"this bundle has 2 mobile entries"*.


**Block 13.659–13.671 — the List tab restyled to the desktop prototype, 2026-09-18.** ✅ for the thirteen
cases below, which live in `packages/app-core/test/views/ticket-list.test.tsx` and
`packages/app-core/test/views/ticket-list-css-binding.test.tsx`, and are green at the tip
(the package suite reads `1454 passed`, exit 0). **The block carries one scope statement rather than one
doubt:** this package vitest config loads no stylesheet, so every assertion is about the MARKUP a restyle
renders — which classes exist, which state each control reports, which sentence each cell composes — and
never about a colour, a radius or a pixel; a case here that claimed to measure a shadow would be measuring
jsdom. **The claim that used to sit here — that the visual half was held by `packages/ui/test/components.test.tsx`
and `apps/web/e2e-viewport/` — was FALSE and is retracted: neither suite names a single `.gn-list__*`
selector (every `it` in the ui file names another block; the viewport sweeps never open this tab, because
the project page defaults to the board).** It was a load-bearing falsehood: it sat above
`.gn-list__columns-tray[hidden] { display: none }`, which could have been deleted with every suite green
while the tray stopped closing in a browser. What holds the declarations this restyle depends on is now
`packages/app-core/test/views/ticket-list-css-binding.test.tsx` (13.671). **The residual gap is named, not
papered over:** nothing measures the COMPUTED result for this tab in a browser — no viewport sweep, no
screenshot diff — so a declaration that is present and then overridden, or a token that resolves to the
wrong colour, is invisible to every suite in this repo. **Citations name the
2026-09-18 prototype (`design-system/interactive/desktop.dc.html`, 4,050 lines, 320,109 B, sha256
`2cda054b…`), whose `isListView` block is `:405-479`** — the same file 13.658 unpacks, and the reason
these numbers are not 13.658-era numbers: the 2026-09-18 refresh moved every line (the offset is not
constant: 176→180, 477→481, 1827→1905, 2584→2779), so every citation here was re-measured against the new
file rather than shifted by a delta.

- ✅ **13.659 — `Group by` keeps its accessible name and exactly its six keys.** ⚠ **It said FIVE until
  2026-09-22, and the correction is not a number-shuffle: the priority built-in added `priority` to the
  union (spec 2026-09-22), so six is now the CORRECT count and the old "no sixth key" negative became
  "no SEVENTH" — the same sentence, one place along.** A count whose meaning moves with the product is
  the reason this entry states the enumeration rather than only the number. The chip tray and the
  picker are the two things a restyle silently rewrites, so the picker is asserted twice over: the
  `aria-label` attribute verbatim (`Group by`) and the panel offering
  `epic/status/assignee/type/priority/flat` and **no seventh key** — the negative half is the one a
  `toEqual` over the legal names cannot make, because it is the half that catches a key no view serves
  (`workflow`) riding along. Measured and recorded, not "fixed": the COMPUTED
  accessible name is `epic Group by`, since React Aria composes `aria-labelledby` from the value and the
  label and that wins over the explicit `aria-label`. Pre-existing, and the constraint pins the attribute.
  (`packages/app-core/src/views/ticket-list.tsx`)

- ✅ **13.660 — the tray renders six chips, each with its own accessible name and checked state.**
  `Status/Assignee/Due date/Type/Progress/Priority` as six real checkboxes — **five until 2026-09-22,
  when the Priority column landed (spec 2026-09-22)** — checked exactly where the preferences
  say, so "six chips" is a count of CONTROLS and not of decorated spans. The CONTROL arm asserts both
  answers in one run — including that the chips are MOUNTED while the tray is closed, which is what the
  `hidden` attribute (rather than a `{open ? … : null}` conditional) buys and what an existing case in
  this file depends on. A `hidden` subtree is out of the accessible tree, so the closed-tray arm reads the
  DOM directly and says so.

- ✅ **13.661 — the Columns toggle opens and closes the tray it names.** `aria-expanded` false → true →
  false across a click, with the tray’s `hidden` attribute flipping in step — the state the old
  `<details>`/`<summary>` disclosure reported structurally and that a plain button has to state itself.

- ✅ **13.662 — the group header band names its group and counts its own rows.** Each of the four axes
  renders its own word (`epic`, `state`, `assignee`, `type`) beside its own section title and a count of
  that section’s own rows; the singular (`state · 1 ticket`) and the flat case (no band at all — there is
  no group to name) are cases in their own right, because a band that renders under `flat` would be naming
  nothing. Counts were MEASURED, not inferred from the fixture list: `assignee · 3 tickets` (not 4) and
  `type · 3 tickets` (not 4), the assigned row and the epic row being the two that move. **A fifth arm is
  the one that makes the count FALSIFIABLE:** every other arm renders a section whose rows and whose
  visible nodes are the SAME set, so `nodes.length` (the post-`visibleNodes` list) passes them all —
  measured: swapping the two in `ticket-list.tsx` compiled and left the whole suite green. The collapsed
  arm collapses a parent under `epic` grouping and asserts the band still reads `epic · 2 rows` while
  the table shows one row; it is the only fixture arrangement where the two numbers differ (`status` puts
  the parent and child in different sections so they never nest, and `flat` has no band), and the same
  mutation now reddens exactly that case with `epic · 1 row`. **A DECLARED DIVERGENCE rides with it:**
  the prototype counts a group’s CHILDREN (`const n = g.items.length`, `:2920`, held separately from
  `g.epic` at `:2904`), so for the same two rendered rows it prints `1 ticket` where this prints
  `2 rows` — because here the epic IS a row (`list-model.ts`, `nestRows`) and the band answers for its
  section the way the summary answers for the project. An earlier revision of this bullet cited a
  prototype expression that does not exist; the measured behaviour is what is recorded now.
  **The unit word settles WHICH membership is being counted (F7, 2026-09-21):** the divergence above put
  the same words on two different numbers, so a reader of either build could not tell which one the
  sentence meant. The epic axis now says ROWS and the other three keep saying TICKETS. The finding's own
  example also carried a parenthesised child count (`epic · 4 rows (3 tickets)`); that half was written
  and DISCARDED, because `section.rows.length - 1` is not reliably "the children" — the `No epic` bucket
  holds an epic row AND a ticket with no epic, so the subtraction would print a number that counts
  nothing.

- ✅ **13.663 — the title cell indents by depth, from the row’s own numbers.** `16 + depth*22`:
  epic 16px, child 38px, grandchild 60px, three distinct values, scoped to the List region because an
  assigned row also renders in the *Recently assigned* pin at depth 0. A second arm holds the leaf case:
  the left edge is set by DEPTH and not by `hasChildren`, so a leaf reserves the caret’s column rather
  than sliding 22px left of its siblings.

- ✅ **13.664 — the status pill renders the state’s name and its category dot.** `Doing` inside a chip
  carrying the active category’s own modifier and a real `.gn-chip__dot`, and `Done` under terminal’s
  — with the dot asserted present in one case and the modifier asserted ABSENT in the other, so the two
  arms cannot both pass on the same markup.

- ✅ **13.665 — a due date is rendered as a claim, with its claimant.** `30 Aug 2026 — Kiro’s claim` —
  the date plus who asserted it, which is the fact the column is about. (The prototype’s relative
  labels — `Overdue by N days`, `Due today`, `Due tomorrow`, `Due <weekday>` — are NOT reproduced: they
  need a clock, no view in `app-core` reads one, `TicketList` has no `today` prop, and the prototype
  itself pins `new Date("2026-09-08T00:00:00Z")`. Filed rather than faked.)

- ✅ **13.666 — a closed ticket’s due cell reads its closure, still attributed.** `Closed 17 Sep 2026 —
  Kiro’s claim`, plus the negative that the bare due date does NOT also appear: the swap is a
  replacement, not an addition. The closure travels as its own claim (`ListRow.closed`), which is what
  makes the prototype’s `"Closed " + (t.closed || nice)` exact here instead of a formatting accident.

- ✅ **13.667 — an unclaimed due date is named, never blank.** `No date claimed`, and no dash — a dash
  beside an attributed-claims column reads as "we looked and found nothing", which is a claim about the
  record this view cannot make.

- ✅ **13.668 — progress reads `N of M done`, and its absence is a dash.** `3 of 8 done` and
  `4 of 8 done · 2 restricted` (the restricted count stays in the denominator and is NAMED rather than
  silently dropped), and a row with no rollup rendering `—` — asserted together with the absence of
  `/done/`, so the empty arm cannot pass on a `0 of 0 done` that would be a claim about nothing.

- ✅ **13.669 — the controls row, tray and table render under all three styles.** `hig`, `minimal` and
  `neo` each render the controls row, the tray, the summary, the band and the table, and then their
  `innerHTML` strings are compared with exactly one mask (`react-aria-*` → `ID`). The narrow mask is what
  makes the equality a proof: React Aria’s `useId` tokens advance per React root, so the raw strings
  differ on that alone and a broader normalisation would have hidden a real difference. No file in
  `packages/app-core/src` reads `data-style`; the style is carried by CSS alone, and this case is the
  product-side half of that claim.

- ✅ **13.670 — the title’s weight is a fact about the row, not about the class.** epic 600, a child 400,
  an unparented non-epic 500 — three distinct values, so a class-level weight cannot satisfy the case.
  The prototype computes it per row (`isEpicT(t) ? "600" : depth ? "400" : "500"`), which is why it
  renders as an inline style rather than in `.gn-list__open`.

- ✅ **13.671 — the List’s classes, the attributes its selectors key on, and the four declarations this
  restyle turns on, read out of `ui.css` rather than assumed.** Declared in
  `packages/app-core/test/views/ticket-list-css-binding.test.tsx`, which exists because the block
  docblock above used to claim the visual half was "held by `packages/ui/test/components.test.tsx` and
  `apps/web/e2e-viewport/`" — **measured, that was false: neither suite names a single `.gn-list__*`
  selector.** The false claim sat above `.gn-list__columns-tray[hidden] { display: none }`, a rule that
  could have been deleted with every suite in the repo green while the tray stopped closing in a browser,
  since the component closes the tray with the `hidden` ATTRIBUTE and `display: flex` outranks the UA
  sheet. Five arms, each a pair of facts rather than one: (a) the class SET EQUALITY in both directions,
  with the five known-inert hooks NAMED (`__empty`, `__narrowing`, `__pinned`, `__section`,
  `__section-name`) so a new class with no rule cannot hide; (b) `display: flex` beside `[hidden] display:
  none`, read as one shape so a missing rule reads as `null` rather than as an absent assertion, plus the
  rendered `hidden` attribute the selector needs; (c) the spacer and the caret at the same width
  (`1.375rem`, the prototype’s 22px — a relative assertion with an absolute one beside it); (d) the
  transparent real checkbox beside the `:focus-visible` ring on the box that follows it, plus the
  focusability and sibling order that make the rule paintable at all; (e) every `[attribute]` in a
  `.gn-list*` selector checked against the attributes the component writes. **Four mutation witnesses:**
  renaming the `[hidden]` selector reddens (a)+(b), changing the spacer width reddens (c), renaming the
  focus rule reddens (a)+(d), and renaming a class in `ticket-list.tsx` reddens (a) — with `ui.css`
  restored to its pre-mutation SHA-256 after each. **The residual gap is named, not papered over:** this
  is declaration-level, so nothing here measures a COMPUTED result for this tab in a browser — there is no
  viewport sweep, no screenshot diff, and a declaration that is present and then overridden is invisible
  to every suite in the repo.

(`packages/app-core/src/views/ticket-list.tsx`, `packages/app-core/test/views/ticket-list.test.tsx`,
`packages/app-core/test/views/ticket-list-css-binding.test.tsx`, `packages/ui/src/ui.css`, `Features.md`)

### The token layer — Step 2c-1 (2026-09-18)

The 2026-09-18 export refresh moved five things in its `<style>` block (T1–T5,
`docs/design/prototype-delta-2026-09-18.md`). Three reach this product, three
deliberately do not, and each has a case — because "we chose not to port that"
is a decision that decays silently if nothing asserts it. All seven are
declared in `packages/ui/test/tokens.test.ts`.

- ✅ **13.675 — T1: the light accent carries the refreshed export's hex, and every role resolving through it followed.** `blue600` moved to the refreshed export's hex; `accent`, `focusRing` and `categoryActive` all resolve straight at it in light, and the derived `textAccent` was re-measured after the move rather than assumed to still pass (its own start point moved — the value did not need to). The DARK arm is asserted UNCHANGED: the export's `--accentDark` is untouched by this refresh, so a change there would be drift rather than a port. (`packages/ui/src/tokens.ts`, `packages/ui/test/tokens.test.ts`)

- ✅ **13.676 — T2 is NOT ported: `--gn-accent` is emitted per style × theme and no bare `--accent` alias exists.** The export moved its `--accent` alias out of `:root` onto the bare `body` rule. This product needs no such indirection — `declarationsFor` emits an accent for each of the six style×theme arms — so there is nothing to port, and the case exists to stop a future reader adding an alias because the export has one. The guard rests on `--gn-accent` NOT containing the substring `--accent`; that relationship is asserted rather than assumed, with a positive control (`--gn-accent-text:` must be found) so the two negative assertions cannot pass on a broken needle. (`packages/ui/src/tokens.ts`, `packages/ui/test/tokens.test.ts`)

- ✅ **13.677 — T3: the warning tint halves in both themes, and it is the product's only tint role.** Light `0.20 → 0.10`, dark `0.141 → 0.10`, hue unchanged in both — asserted by slicing the hex, so a hue change cannot hide behind a matching alpha. Alpha `0x1a` is this file's round-half-up convention, the same arithmetic that produced the old `0.141 → 0x24`. **The export moved five tints; this product has one role for them**, so the mapping T3's dispatch asks for is four documented absences and one movement — the other four are declined at `ui.css` ("no `--gn-tint-purple` role exists or is added here"). (`packages/ui/src/tokens.ts`, `packages/ui/test/tokens.test.ts`)

- ✅ **13.678 — T4 is NOT ported: no `tintAccent` role exists, and inventing one would leave a value nothing renders.** The export turned `--tintAccent` from a stored literal into a derived `color-mix`. This product has no such role and no consumer for one, so the port is a refusal rather than an absence — asserted both ways (`TOKEN_ROLES` names none; the emitted stylesheet contains no `--gn-tint-accent`), with the tint role that DOES exist as the positive control. (`packages/ui/src/tokens.ts`, `packages/ui/test/tokens.test.ts`)

- ✅ **13.679 — T5: neo light moves to the refreshed surface and gains five semantic colours no other style takes.** `neoPaper` moved to the refreshed export's surface (all three surface roles, one hex), plus `danger`/`warning`/`success`/`contested`/`restricted` — and `customMarker`, which follows `restricted` because it is documented as sharing that primitive. The mapping is by MEANING, not variable name: the export's `--pink` is this product's `contested`, its `--purple` is `restricted`. The case asserts the style is the ONLY axis these move on — `hig`/`minimal` must not have followed, or a neo-specific port would have become a product-wide palette change wearing its name — and that the dark-neo arm is untouched. (`packages/ui/src/tokens.ts`, `packages/ui/test/tokens.test.ts`)

- ✅ **13.680 — the export's new light-neo SELECTOR is not ported, and the light-neo set is reachable with NO `data-theme` attribute.** The export moved its light-neo block to `body[data-theme="light"][data-style="neo"]`, which matches only when the theme is exactly `light`. This product treats light as the ABSENCE of the attribute, so adopting the selector verbatim would have dropped the entire light-neo token set for every user who has never chosen a theme — the default state. The case is a NEGATIVE one in the strict sense: it asserts the compound selector is absent AND that the bare `[data-style="neo"]` arm is emitted carrying `--gn-surface: #f1eae3`, so the values are reachable with no theme attribute at all. Both dark paths (explicit attribute, and OS preference when unchosen) are asserted still present. (`packages/ui/src/tokens.ts`, `packages/ui/test/tokens.test.ts`)

- ✅ **13.681 — every contrast floor clears on the re-derived palette, and the roster was not weakened to reach them.** All `CONTRAST_PAIRS` rows across 3 styles × 2 themes, plus two things a bare pass/fail loop cannot state: the roster's SIZE is unchanged at 33 (a floor removed is a guarantee removed, and it would show here first), and no `minimum` sits below 3. The five roles T5 added are GROUNDS that no `CONTRAST_PAIRS` row names, so their obligation is measured here instead of left unstated — `dangerText`/`warningText`/`successText` on their own colours at 4.5, and `restricted`/`customMarker` against the surface at the 4.5 they actually need. **`contested` is the exception and is recorded rather than blessed:** it has no `*Text` role, but it IS read text today — `.gn-sync-status-bar__failed` sets `color: var(--gn-contested)` on `background: var(--gn-surface)` (`ui.css:2602`, consumed at `sync-status-bar.tsx:85`, 13.6px normal weight, so AA wants 4.5 and not the 3 its `CONTRAST_PAIRS` row declares) — and in `hig`/`minimal` light it measures **4.3746, below 4.5**. PRE-EXISTING and untouched by this change; `neo` light is 6.02, so T5 incidentally fixed it in the one style it touched. The case pins the failing value so a green 3:1 cannot absorb it. Its siblings go with it, measured and equally unblessed: `warning` on surface 4.2485 and `danger` on surface 4.4013 in `hig`/`minimal` light, pairs that **no `CONTRAST_PAIRS` row names at all**. Owner: whoever next touches the sync status bar or the `contested`/`warning`/`danger` roles. (`packages/ui/src/tokens.ts`, `packages/ui/test/tokens.test.ts`, `Features.md`)

---


## The ticket key — `<workspace prefix><project prefix>-<number>` (owner request, 2026-09-20)

The owner's spec, verbatim: *"prefix will be decided at the creation of the workspace and project. i can
enter up to 3 letters for the workspace and during project creation up to 3 letters for it. for example
for convenience corner if i choose CC and then for the project Shop Operations i choose SO, the key will
look something like CCSO-xxxx where the xx are the counter per project."*

**The dispatch prescribed a counter allocated at append plus a migration backfilling the rows that
predate it. Both halves are foreclosed by this codebase, measured before anything was built:**

- **`events` refuses UPDATE and DELETE.** `1787841717635_events-and-snapshots.sql` installs
  `events_append_only` as a `BEFORE UPDATE OR DELETE` trigger that RAISES, so no migration can put a
  prefix or a number into a founding event.
- **A projection column must be reproducible from the ledger.** `tools/verify-projections.ts` diffs every
  `proj_` table against a rebuilt shadow with `EXCEPT` in *both* directions, so a backfilled value the
  replay cannot reproduce is a verifier failure — and it would be right.
- **There is no `created_at` on `proj_tickets`** to order a ticket backfill by. The dispatch said the
  controller could not confirm one; it could not, because it does not exist.

So the key is composed from three **ledger** facts and stored in none of them: a prefix a person entered
(riding `workspace.created` / `project.created`), a prefix **derived** from the name when nobody entered
one, and the ticket's **position among its project's creations ordered by `workspace_seq`**. The
derivation is what gives the rows that predate the field a stable half, and it reproduces the three rows
the owner named by hand — `Convenience Corner`→`CC`, `Shop operations`→`SO`, `gggg`→`GG` — so no install
needs a data step.

`read/ticket-numbers.ts`, `packages/domain/src/prefix.ts`, `apps/server/src/read/visible-projects.ts`,
`apps/server/src/workspaces/workspace-name.ts`, `packages/domain/src/events/membership.ts`,
`apps/server/migrations/1789900000000_proj-projects-prefix.sql`,
`apps/server/src/permissions/check-permission.ts`.

**`13.988`–`13.999` are left UNUSED deliberately.** The highest `13.*` id at `origin/main` when this
block was minted was `13.987`, and a second executor is minting into the same numbering line; this task
takes a BLOCK starting at `13.1000` rather than the next free tip, so the two writers cannot collide.

**What is NOT wired, and it is the display half.** The key composes, is served and is enforced; **no
screen renders it yet**, and `Features.md` carries the marker as `⚙️` rather than `✅` for that reason.
The enumeration lives in `Features.md` §6 ("Where the key is shown") with an owner named per site.

### The rule, and the refusals

- **13.1019** ✅ `derivePrefix` takes the initials of the first two words — the owner's own workspace and
  project.
- **13.1020** ✅ It takes the first two letters when the name is ONE word (`gggg`→`GG`). Both halves are
  needed: a rule that got one right alone would pass a single-example test. **This bullet exists on its
  own line for a measured reason** — `check-case-ids` matches an id only at the START of a bullet, so the
  first version of this pair, written as one sentence, left `13.1020` invisible to the guard while the
  suite counted it. (The count moved by 25 for 27 minted ids; `13.1026` was the other one, and it had no
  bullet at all.)
- **13.1021** ✅ A name with no letters at all (`42`, `!!!`) falls back to the stated constant `XX`, and
  the result is a legal prefix. An empty string here would compose `SO-1` — a key with no workspace half.
- **13.1022** ✅ A lower-case prefix is REFUSED, not upper-cased, for `displayName`'s own reason: the
  ledger stores the claim as it was made. The forms upper-case as the owner types; the door does not.
- **13.1023** ✅ A derivation collision is broken deterministically, in the order given — `Shop operations`
  and `Service orders` both derive `SO`, so the second moves to `SO2`.
- **13.1024** ✅ An ENTERED prefix outranks a derived one **regardless of order**: the resolver runs two
  passes, claiming every stored prefix before handing out any derived one. A single pass would give `SO`
  to the project that merely derives it and push the project that ASKED for it to `SO2`.
- **13.1025** ✅ `ticketKey('CC','SO',1183)` is `CCSO-1183`, and the function takes no project context —
  the owner ruled the bare key "is enough", so there is nothing for a caller to forget to pass.
- **13.1000** ✅ `workspace.created` takes an optional `prefix`, and an absent one parses unchanged — the
  compatibility half, because every workspace in the ledger was founded before the field existed.
- **13.1001** ✅ A prefix that is not one to three capitals is refused by name, and a lower-case one is
  refused rather than rewritten.
- **13.1002** ✅ `project.created` takes an optional `prefix`, absent-unchanged, and the key is genuinely
  absent rather than present-and-undefined (`'prefix' in …` is false; the positive control is true).
- **13.1003** ✅ `description` and `prefix` coexist, and a bad prefix is refused at its own path.

### The number

- **13.1004** ✅ A project's tickets are numbered by their position in the ledger, and the key they compose
  reads `CCSO-3` for the third.
- **13.1005** ✅ The counter is per PROJECT: a second project in the same workspace starts at 1. Without
  this, a workspace-wide counter and a per-project one are the same function on a one-project fixture.
- **13.1006** ✅ THE CASE THAT DISTINGUISHES A WINDOW FROM A COUNTER. Asking for the THIRD ticket alone
  answers 3, not 1 — the id filter is applied AFTER the window. A query that fed the ids into the window
  would renumber every survivor, and would agree with the correct one on every full-list read.
- **13.1007** ✅ A ticket with no `ticket.created` answers `null` rather than inventing a number.

### The halves, resolved

- **13.1008** ✅ A prefix that was ENTERED is used verbatim.
- **13.1009** ✅ A project with no entered prefix derives one from its name — and the stored prefix beside
  it in the SAME call is untouched, so a resolver that derived for everything fails here.
- **13.1010** ✅ The answer does not depend on WHO is asking: the resolution runs over the whole workspace
  before the role filter, so two owners read identical prefixes including a deduplicated one.
- **13.1011** ✅ A founding claim with no `prefix` key derives from the name — the owner's own
  `Convenience Corner` → `CC`.
- **13.1012** ✅ A stored workspace prefix wins, and a RENAME moves the name and never the prefix. This is
  also the case that would break a fold reading the prefix off the LATEST event, since
  `workspace.renamed` carries no prefix at all.
- **13.1013** ✅ A workspace with no naming event answers `null` for both halves.

### The door

- **13.1014** ✅ A project founded under a prefix another project ENTERED is refused with
  `project.prefix-taken`, naming the value.
- **13.1015** ✅ **A prefix another project DERIVES is refused too** — and this is the case a
  stored-column check fails. `Shop operations` enters nothing, so the column is NULL and a column-only
  check finds nothing to collide with; the read still answers `SO` for it, so accepting the new project
  would hand `SO` to the newcomer and silently move the older project to `SO2`. The case carries its own
  control: the same workspace, the same shape, a prefix nobody derives, is admitted.
- **13.1016** ✅ A free prefix is admitted, and the same prefix in a DIFFERENT workspace is admitted too —
  pins the residual scope the owner accepted rather than leaving it to be discovered.
- **13.1017** ✅ A project that enters NOTHING is never refused, however its name derives. Refusing would
  make the prefix mandatory in fact while the schema keeps it optional in form.
- **13.1018** ✅ A MEMBER is told they may not found a project (`permission.role`), not which prefixes are
  taken — the same enumeration bound `checkProjectExists` documents.

### The number under real contention

- **13.1026** ✅ **N creations in flight at once take N DISTINCT numbers, and they are 1..N.** Eight
  `ticket.created` submissions go through the REAL `ingestBatch` — all eight before any is awaited — and
  the numbers are read back out of the ledger. A `for … await` loop would have serialised them and passed
  against an implementation with no lock at all, so the concurrency is the fixture rather than a comment.
  The keys are asserted per ticket and never against a fixture order: WHICH ticket gets 1 is decided by
  the race, so pinning the first one would assert something about the scheduler. Mutation M6 is this
  case's witness — removing `lockWorkspace` from `commitOne` reddens it with a real
  `events_workspace_seq_unique` violation.

### Mutation witness

Every mutation below was applied to a tree with the change already COMMITTED, the test file run, and the
file restored with `/usr/bin/git checkout --`; **each restore was then confirmed by comparing the file's
SHA-256 with the value taken before the mutation** — never by a shell `diff`, which has returned a false
"identical" in this repo. The two survivors are listed with their reasons, and neither is a mutation that
failed to run: one of them refused to run at first and the refusal is recorded below.

- **M1 — the door check reads the stored column instead of the derived set.** `checkProjectPrefixUnique`'s
  input replaced with `new Set(rows.map(r => r.prefix).filter(p => p !== null))`.
  **REDDENS 13.1015. 13.1014 passes.** The runner's own counts: `1 failed | 4 passed (5)` — the one
  failure is 13.1015, so the control case is genuinely green. This is the mutation that separates the
  check that works from the check that looks like it works.
  ⚠ *The first sweep reported 13.1014 as ALSO RED and it was WRONG:* the file's `describe` is named
  `13.1014-13.1018`, so a substring match on `13.1014` hit the describe line. Measured again by the
  runner's failure COUNT, not by a regex.
- **M2 — the resolver collapses to one pass.** The pre-claim of every stored prefix deleted.
  **REDDENS 13.1024 only. 13.1023 passes.**
- **M3 — the id filter moves inside the window** (`entity_id = ANY($2)` added to the subquery).
  **REDDENS 13.1006** — the named case — **and 13.1007 as well**, which is a real over-broad effect rather
  than a matcher artifact: the mutated SQL references `$2` on the whole-workspace path, where it is unbound.
  Recorded rather than trimmed, because a mutation that reddens more than its own case is telling you
  something about the query.
- **M4 — SURVIVED. The projection writes the DERIVED prefix into the column** (`payload.prefix ??
  derivePrefix(payload.name)`) instead of NULL. **Nothing reddens: not the reads, not the door, and not
  `tools/verify-projections`.** The reason is worth keeping: the derivation is a PURE FUNCTION, so the
  live row and the rebuilt shadow compute the SAME value and `EXCEPT` has nothing to report. **The
  verifier constrains a column to be REPRODUCIBLE, never to be ATTRIBUTED** — it catches a value the
  ledger cannot reproduce, and this value it can. The mutation is not harmless (it turns a derived prefix
  into a stored one, which changes which claim wins in `resolveProjectPrefixes`' two passes), but it is
  unconstrained, and that is the honest report: a survivor with an explanation.
  ⚠ *This mutation did NOT run the first time either — it referenced `derivePrefix` without importing it,
  so the file did not compile and the run failed with no test named. The import was added before the
  result above was recorded.*
- **M5 — `ticketKey` drops the workspace half.** **REDDENS 13.1025** and the sibling bare-key case in the
  same `describe`; 13.1019 passes.
- **M6 — the workspace lock is removed from `commitOne`.** **REDDENS 13.1026, live.** Eight concurrent
  creations then read the same `max(workspace_seq)` and the second INSERT fails on
  `duplicate key value violates unique constraint "events_workspace_seq_unique"` at
  `ledger/event-store.ts:59`, through `commitOne` `ingest-service.ts:338`. This is the concurrency
  property witnessed by a REAL scheduled race rather than asserted in prose: the lock is what makes the
  numbers unique, and the constraint is the backstop that turns a lost lock into a loud failure instead
  of two tickets sharing a key.

### The review round, and what it found that my own tests could not

An independent reviewer ran at `6afa490e`'s parent and found four Important defects and two Minor ones.
**Three of the four Important defects were in the AUTHOR'S OWN reasoning**, and the pattern is worth
naming: each was a case that PASSED while the property it was named for was false.

- **13.1027 — a rename moved the DERIVED prefix.** `workspaceIdentityFromLedger` derived from the LAST
  naming event's name, so renaming `Convenience Corner` to `Corner Emporium` moved `CC` to `CE` and
  rewrote every ticket key in the workspace under readers who had quoted them — the exact thing this
  module's docblock says a key may not do. **Reachable on EVERY workspace in the ledger**, since no
  workspace carries a stored prefix and every one of them therefore took the derived branch. 13.1012 is
  the case written for this property and it PASSED, because its fixture stores `XY` and so never enters
  the derived branch at all: *a case named for a property, exercising the other branch.* The fix reads the
  FOUNDING name, which is immutable for the same reason the prefix is — `events` refuses UPDATE. Mutation:
  reverting to `derivePrefix(named)` reddens 13.1027 and nothing else (1 failed / 10 passed).
- **13.1028 — a project's OWN `project.created`, re-delivered, was refused** with `project.prefix-taken`
  instead of the ledger's `duplicate-event-id`, because `projectPrefixesInWorkspace` resolves the project
  the event names and its row already exists. The gate runs before `insertEvent`, so the idempotent path
  was unreachable for any prefixed project — on `POST /v1/events` and on `POST /v1/sync`, where a retry is
  how a client recovers from a lost response. No case here could have seen it: **every other case uses a
  FRESH project id.** The reader now returns a Map keyed by project id, because "is this value held by
  somebody ELSE" is the question the gate actually has and a Set cannot ask it. The case carries its own
  control — a DIFFERENT project asking for the same prefix is still refused.
- **13.1029 — the suffix loop produced illegal prefixes.** Found independently by the author and the
  reviewer. Measured: twelve same-base projects gave `S10`, a hundred gave `100` (a digit where a letter
  belongs), a thousand gave `S1000`, four characters where the maximum is three. The docblock claimed a
  "next free single letter" fallback the code never had. Unreachable at product scale; **the claim is what
  made it worth fixing.**
- **13.1030 — the ENTRY half was unreachable.** The spec says the prefix is *entered at creation*, and
  neither founding form had a box: `FoundingGateway` posted `{ name }` only and `foundingSeeds` built
  `project.created` with no prefix. Both forms now carry an optional `Prefix` input.
- **13.1031** ✅ The **new-project form** authors the prefix: typing `so` produces
  `project.created` with `prefix: 'SO'` — upper-cased at the keyboard, because `prefixSchema`
  REFUSES lower case rather than normalising it. A second submission with the box left untouched sends
  NO `prefix` key at all.
- **13.1032** ✅ The **new-workspace form** passes the prefix through `foundWorkspace(name, prefix)`,
  upper-cased the same way.
- **13.1033** ✅ An **untouched** prefix box passes `undefined` and never `''` — asserted on the argument
  reaching the gateway, since `''` would arrive at the door as a present-but-wrong value rather than as
  "nobody entered one".

  ⚠ **These four bullets exist as four LINES for a measured reason.** They were written as one bullet
  reading `13.1030–13.1033`, and `check-case-ids` matches an id only at the START of a bullet — so the
  count moved by 4 for 7 minted ids, and this is the SECOND time in this change set that spelling cost a
  count. Both times the tell was the same: **the delta was smaller than what was added.**

**The lesson these share, and it is the one already recorded on this machine: a check's NAME is not its
instrument.** 13.1012 was named for rename-immutability and exercised the stored branch; the docblock named
a fallback the loop did not have; the gate was named `checkProjectPrefixUnique` and asked a subtly different
question. All three read as green.

## An epic is a row in the List and nowhere else (owner, 2026-09-20)

Block `13.1034`–`13.1049` is this executor's for this work; `13.1047`–`13.1049` are reserved and
deliberately unused. **`13.1046` was minted on the controller's instruction (2026-09-20)** — see that case
for why the count of empty-state residuals is four and not the three the dispatch assumed. Suite: `packages/app-core/test/calendar/calendar-model.test.ts`,
`packages/app-core/test/timeline/timeline-model.test.ts`,
`apps/web/test/epics-not-rows.test.tsx`. All under Node v22.22.2.

The owner, twice and in this order: *"epics should never show up in the board, timeline and calendar
views. they can only be in the list views"*, then *"it shouldnt show up in the backlog either. only in
the list view."* The controller put the one question the ruling leaves open to the owner rather than
letting a lane guess — the Backlog and the List are the SAME component (`<TicketList>`) and the Backlog's
sections are headed BY THE EPIC, so does removing the row also remove the header? — and the answer was
***"Row only."*** **The epic is VISIBLE AS A NAME and ABSENT AS A TICKET**, in the Backlog's section
headers and (for the same reason, through the same mechanism) in the Timeline's lane headings.

The exclusion is PER VIEW and the shared read is untouched: `list.rows` stays unnarrowed, so the parent
picker still offers every ticket and `labels.epicTitle` still resolves a surviving child's epic. In the
two models it sits INSIDE `visible` — `byId` is built from the complete input set before `visible`
narrows, which is what keeps the Timeline's lanes named, and joining `visible` makes a removed epic count
as a narrowing, which keeps `CALENDAR_ALL_HIDDEN_COPY` gated off.

- **13.1034** ✅ `buildCalendarModel` with `hideEpicRows` drops the rank-1 ticket's bar and markers and
  keeps its child's; the CONTROL arm asserts the epic draws with the option absent, from the same fixture
  and one word different. A second arm proves it reads the view's own rank-1 predicate: a type id the
  built-in default does not name survives, and the same ticket goes once the shell says that type is the
  epic.
- **13.1035** ✅ A hidden epic counts as a NARROWING, so a grid emptied only by this rule reaches
  `CALENDAR_EMPTY_MONTH_COPY` and never the exhaustive `CALENDAR_ALL_HIDDEN_COPY`. The CONTROL moves one
  date — the epic's claim off this grid — and the same fixture then DOES reach the exhaustive sentence,
  which is what proves the epic is what was holding it off.
- **13.1036** ✅ `buildTimelineModel` with `hideEpicRows` drops a fully dated epic's own bar AND KEEPS the
  lane it names: the child's row survives under a heading titled with the epic's own title. Asserting the
  TITLE rather than merely that a group exists is deliberate — a lane falling back to `NO_EPIC_TITLE` is
  still one group, and is exactly the drawn absence this case forbids.
- **13.1037** ✅ A HALF-dated epic leaves the side list too — the view, not one of its two outputs — while
  a TRULY undated epic is still neither a row nor missing work.
- **13.1038** ✅ The Board draws no epic card, and BOTH counts move with it: the column's badge and the
  `N of M` strip. `1 of 2 shown` is asserted absent by NAME, because it is exactly what an implementation
  that drops the card and keeps the count prints.
- **13.1039** ✅ The Backlog draws no epic ROW, still heads its section with the epic's NAME, and still
  draws the child. The header half holds under the EPIC grouping, which is the default; a stored
  status/assignee/type/flat grouping has no epic header at all, as it did not before.
- **13.1040** ✅ The List still draws the epic as a row — the ruling's other half, and the control that
  makes 13.1039 a measurement rather than an assumption about a testid.
- **13.1041** ✅ On the page, the Calendar omits the epic's entry and keeps its child's; the child is
  asserted FIRST so the negative is about the epic and not about a month that drew nothing.
- **13.1042** ✅ On the page, the Timeline omits the epic's row and keeps its lane heading, asserted by
  ROLE (`h3`) so a row carrying the same string cannot satisfy it.
**ALL FOUR ARE NOW CLOSED (owner ruling applied 2026-09-20).** The ruling's shape is *"name this cause, and
say where the epic lives"*, and — on the controller's reading (b) — **each sentence takes the new wording
ONLY when an epic is the reason the view is empty**, keeping its own sentence otherwise. The second half is
not decoration: an all-epic view and a genuinely empty one are the **same state** at all three literal sites,
so one sentence for both would be false of one of them. **Every case below therefore carries a CONTROL arm.**

- **13.1043** ✅ CLOSED — an all-epic Board says *"No tickets in this view — epics appear in the List."*
  (`EMPTY_BOARD_EPICS_COPY`); **a genuinely empty project keeps `EMPTY_BOARD_COPY`, unchanged.** The
  distinction arrives as a PROP, because the component cannot derive it: the epic is dropped before `total`
  increments and `isNarrowed` is deliberately false here, so both cases reach the banner identically.
  `apps/web/test/epics-not-rows.test.tsx`.
- **13.1044** ✅ CLOSED — the all-epic Backlog says *"Nothing in the backlog — epics appear in the List."*; an
  empty backlog keeps the original. Chosen by the **page**, not by `TicketList`, which sees only the
  surviving rows; `backlogNarrowing` is the one place both sets exist.
- **13.1045** ✅ CLOSED — the calendar's and the timeline's cause-lists **gain the cause** rather than being
  replaced: *"…your filter, closed jobs being hidden, a field you switched off in the legend, or an epic,
  which is drawn in the List and not here."* Amended in place because both sentences already name a SET of
  narrowings and their clause is **conditional** — which is what lets a fourth cause ride along without
  claiming this month has one. Witnessed by `claim-labels.test.ts` 11.1 (the exact sentence) plus the model
  suites. The same treatment reaches the two shipped help documents (see below).
- **13.1046** ✅ CLOSED — a board COLUMN whose only ticket is an epic says *"No tickets in this column —
  epics appear in the List."* (`EMPTY_COLUMN_EPICS_COPY`); a genuinely empty column keeps
  `EMPTY_COLUMN_COPY`. ⚠ **Stricter than the board's gate on purpose**: the column takes the new sentence
  only when NOTHING ELSE was removed from it, because a column can also be emptied by the card filter, which
  this view cannot disclose — and *"an epic is why this is empty"* would be a half-truth there.
  ⚠ **Minted on the controller's instruction** after this executor measured the site and asked rather than
  assuming §6's "delta ZERO" covered the whole set — `#602` minted nothing for it.
- **13.1115** ✅ **THE BACKLOG SITE'S THIRD ARM, closed by E5-40 (2026-09-21).** `13.1044`'s two arms
  answer "is an epic why this is empty?"; this one answers a question neither can, because the
  **"Only tickets in progress"** switch writes `stateCategories: ['active']` into the **server** read and a
  backlog ticket's category is `open` — so the toggle strips every backlog row before any screen-level fold
  sees it, and both `shown` and `total` read 0. **A backlog emptied by the toggle and one that is genuinely
  empty are the same state inside `backlogNarrowing`**, which is why the choice is made at the render site,
  where `activeOnly` is known: *"The backlog is hidden while “Only tickets in progress” is on."* — true
  whether or not anything sat behind the toggle. The page had carried this as `RECORDED, NOT FIXED`.
  **Both arms are asserted**, and the stub APPLIES the filter rather than ignoring it — a `getTickets` that
  returned every row would render the backlog correctly and the defect could not appear at all.
  — (`apps/web/test/backlog-tab.test.tsx`)
  **And the scope note now names the Backlog**, which it had left out of its list of narrowed surfaces
  ("the list, calendar and timeline" over three tabs of five), together with `docs/manual.md`, which quotes
  the note verbatim and gains the Backlog's own paragraph. — (`apps/web/test/page-refusals.test.tsx`)
- **The shipped help moves too, and it is easy to miss.** `docs/faq.md` and `docs/manual.md` carry the
  calendar's cause-list **as prose**, and the manual additionally quotes the Board's and the Backlog's empty
  sentences. `scripts/help-content.mjs` generates both into `content.generated.ts`, which `check:help` gates.
  ⚠ **`docs/manual.md` also carried a justification the ruling had already falsified** — *"the product
  genuinely cannot tell 'there is no work here' from 'none of it is visible to you'"* — corrected in the same
  change set; the board **can** tell, which is why these cases exist at all.

⚠ **THE MUTATION BATTERY IS THE EVIDENCE, AND IT FOUND THREE THINGS.** Eight mutations, one per view plus
one that isolates each fold's count term; each reddens its OWN view's cases and no other's. **M3 survived
its first run** — the Backlog's rows dropped while its `total` still counted epics — which is why 13.1039
asserts the strip; a case that never reads the count cannot see a wrong one. **M6 and M7 also reported as
survivors and were not**: they mutate `packages/app-core`, which `apps/web` imports BY PACKAGE NAME
through `./dist`, so the web suite was reading a stale artifact and the mutation never ran. The battery now
greps the DIST — not the source — and a mutation that never ran is indistinguishable from a killed one
from the outside.

## A preferences failure is not a LIST failure — cases `13.1116`–`13.1107` (E5-42, 2026-09-21)

**The defect.** `useTicketList` returned `error: list.error ?? preferences.error`, folding the
preferences hook's error — set on a failed `getPreferences` AND on a failed `putPreferences` — into the
SAME field the ticket read uses. Every refusing tab arm keys on that field FIRST, before it looks at
`rows`: Backlog, List, Calendar and Timeline each render `ShellRefusal what="…" message={list.error}` over
rows that had loaded perfectly. `setPrefs` is what the List's own column chooser calls, so the person's
own click — *show me the Assignee column* — could produce *"The ticket list cannot be shown yet. HTTP …
for /v1/me/preferences"*. The Board was the negative control, and is why this was four tabs of five
rather than five.

**The fix.** The two failures have different causes and different remedies, so they are different fields:
`error` is now `list.error` alone, and `prefsError` carries the preferences half. It renders BESIDE the
column chooser — *"Your column choice was not saved — {the server's own words}"* — because that is where
the person who needs the sentence is standing.

- **13.1116** ✅ The preferences error is its own field: with `getPreferences` rejecting and
  `getTickets` answering, the rows are intact, the list reports NO failure, and the preferences failure
  reaches `prefsError`. **Both halves are asserted in one case** — the control arm makes the ticket
  read fail and asserts it still reaches `error`, without which the case would pass on a hook that had
  simply stopped reporting errors at all. — (`packages/app-core/test/views/ticket-list.test.tsx`)
- **13.1107** ✅ The sentence, where a person meets it: beside the column chooser, over rows that are
  still drawn, with the list's own summary still a claim about the project. Asserted on the PAIR,
  because a screen that replaced the list with the preference failure would pass an assertion on the
  sentence alone — which is the defect E5-42 reports. — (`packages/app-core/test/views/ticket-list.test.tsx`)

**One place in the page already knew this and said so.** `parentsUnavailable` dodged the fold by keying
on `rows === null` as well, and its docblock recorded that a preferences 500 was not a parent-candidate
failure — witnessed at `3.158`. That comment was the only record of the fold's blast radius, and the four
tab arms beside it did not share its guard. The fold is gone now, so the guard is no longer the only
place in the file that knows the difference; its own note is kept and extended rather than deleted.

## Names, not ids — the assignee roster join (owner request, 2026-09-22)

The owner, with two screenshots: *"In the list tab, for the assignee, it's showing the id instead of the
name. Also in the ticket details, it shows the id. Everywhere for id, show the Name; if name is
empty/blank, show the email."*

Two independent causes, so two sets of cases. **This one is the envelope:** the List tab printed a ULID
because the list BODY named no workspace, so the client had no id to fetch a roster with and mapped
every row against a literal empty roster. The board body has named its workspace all along; this is the
list route catching up, and it fixes every row-level provenance tooltip and the calendar with it, since
they read the same rows. The nameless-member fallback (name → email → id) is the section below.

- **13.1287** ✅ The list body names the workspace it was read for. Asserted with a control in the same
  case: a read of a DIFFERENT project in the SAME workspace answers the same `workspaceId` while the two
  `projectId`s differ — so the field is the workspace the request was authorised against and not a copy
  of the project id beside it. The field is REQUIRED on `ListResponse` (`string`, first field, mirroring
  `BoardResponse.workspaceId`), which is what makes the typecheck find every fixture that constructs a
  body rather than letting `undefined` reach a mapper that would degrade silently. — (`apps/server/test/routes/list.test.ts`)

The client half. `getTickets` now fetches the roster through `listWorkspaceId(raw)` and passes it to
`mapListPage` for every page of the walk — the same join `getBoard` has always made, off the body
instead of off a parameter.

- **13.1288** ✅ A named member's row carries their NAME as the assignee AND as the provenance actor —
  both doors into the one roster map are asserted in a single case, because a join wired to only one of
  them would satisfy the other. **The control is in the same case and in the same walk:** a row assigned
  to somebody the roster does not cover keeps the id, so a mapper that printed the first member's name
  for every row cannot pass. The roster is fetched from the id the BODY named — the test's `WORKSPACE`
  appears nowhere else, so a join pointed at a constant, at the project id, or at nothing fails. —
  (`packages/app-core/test/online/online-data-source.test.ts`)
- **13.1289** ✅ A REFUSED roster does not take the list down with it: the members route answers 404 (the
  shipped answer to a caller who may not read the roster, `door(..., 'no-guests')`), the walk still
  resolves, and names stay ids. **The case asserts the join was ATTEMPTED**, without which it would be
  green on a source that never fetched a roster at all — which is the defect it guards. —
  (`packages/app-core/test/online/online-data-source.test.ts`)
- **13.1290** ✅ A two-page walk fetches the roster exactly ONCE. The row assertions alone would pass on
  a join evaluated inside the per-page mapping; the walk would merely be slower, and a membership revoked
  between pages would name one person two ways inside a single view. Counted on the roster calls, with
  the ticket-page count asserted beside it so "once" cannot be satisfied by a walk that stopped early. —
  (`packages/app-core/test/online/online-data-source.test.ts`)

The other half of the owner's sentence — *"if name is empty/blank, show the email"*. That rule existed
as two PRIVATE copies (`memberLabel` in the members page, `pickerLabel` in the visibility editor) with
the same order spelled twice, free to drift; everything else read `member.name` raw or went through
`actorLabel`, which has no email step at all.

- **13.1291** ✅ ONE `memberLabel`, and the four arms of its order in one `describe`: a named member is
  named by their name; a BLANK name falls to the email; a blank name AND blank address falls to the id;
  and a member with no name and no `email` KEY also falls to the id. The first arm is the control — a
  function returning the id for everybody would pass the other three. The third and fourth arms are
  different shapes of input reaching the same floor (blank versus absent), which is the distinction the
  server's own withholding draws. — (`packages/app-core/test/member-label.test.ts`)

`memberLabel` is now what the roster JOIN's value is built with (`rosterByActorId`), which is the step
that makes the board, the list and the ticket read correct without any of them knowing an address exists.
The join used to hold the raw `displayName`, so a blank-named member joined to `''` — an empty name on
screen, decided by which surface you were looking at, since only the pickers had a fallback.

- **13.1292** ✅ A blank-named member with a real address is named by the ADDRESS through the board, the
  list AND the ticket read — asserted on all three in one case, because a join changed in one mapper's
  path and not another's is exactly the half-witnessed contract this series is named for. Both doors into
  the one map are asserted where a surface has two (the assignee and the state claim's actor), and the
  NAMED member is the control on the same roster and the same surfaces. **The roster is built the way the
  source builds it — a members BODY through `mapActors` carrying `displayName: ''`** — because a fixture
  handing `rosterByActorId` a literal map, or driven against an empty roster, would read back the id and
  the email branch would never run: green for the wrong reason. —
  (`packages/app-core/test/online/mappers.test.ts`)
- **13.1293** ✅ `actorLabel`'s order is UNTOUCHED by the email step: the reserved system actor still wins
  even against a label that a join could produce — an address included, which is the shape this change
  made reachable — and `actorLabel`'s own floor is still the id. **This is the invariant half and it is
  green before and after the change by design**: the email step lives in the join, not in `actorLabel`,
  which is handed a claim's `{actorId, actorName}` and has no roster to reach for. Recorded as a case
  rather than left as a comment because a future joining change is what would break it. —
  (`packages/app-core/test/online/mappers.test.ts`)

**Every surface that holds a roster member in hand.** The rule is one function now, but a rule is only
one rule where it is CALLED: each of these sites held a member and read `.name` (or `actorLabel(id,
name)`) past it, so each could render a blank or a ULID for the population the owner named. Each case
below asserts BOTH populations at once — a named member as the control, and the nameless pair (with an
address, and with neither) — because one member cannot tell the two steps apart, and an implementation
that skipped to the id would pass an assertion written against either alone.

- **13.1294** ✅ The ticket sheet's TWO pickers: the Assignee dropdown offers a nameless member by their
  ADDRESS and a member with neither by their id, in one option list that asserts the whole sequence; and
  the `@`mention list both NAMES and FINDS them the same way — typing `account` reaches the address
  member and does **not** reach the id member, which is what makes the assertion about the address rather
  than about loose matching. The two halves are separate assertions on purpose: a label fixed without the
  filter matched against it leaves a member listed and unfindable. —
  (`packages/app-core/test/views/ticket-sheet.test.tsx`)
- **13.1295** ✅ The board filter's person rows (Assignee and Collaborators) in `apps/web`, the same way:
  a button exists is findable by its accessible name, so the case queries by ROLE AND NAME — the shape
  E5-4 established here — and asserts both members in BOTH groups. —
  (`apps/web/test/filters-sheet.test.tsx`)
- **13.1296** ✅ The phone's `@`mention list (`queryWorkspaceMembers`): the nameless-with-address member
  is found by typing their address, the member with neither by their id, and the named member is
  untouched. The phone resolved `displayName` verbatim on BOTH sides — the label it returned and the
  string it matched against — which is the same defect E5-4 closed on the web sheet's `queryUsers`. —
  (`apps/mobile/src/screens/mention-query.test.ts`)

  **AND THE VISIBILITY EDITOR'S VIEWER CHIPS**, the one surface the first sweep of this rule missed
  (controller addendum, 2026-09-22): `visibility-editor.tsx`'s own `nameOf` read `.name` off the roster
  row it already held (`members.find`), so a nameless member's chip under "Who can see it" — and the
  same member inside the `Only: …` sentence — printed the ULID, while the picker one section up had
  offered them by email since E4-6. Fixed in the shape the ticket sheet's `nameOf` takes: resolve the
  found row through `memberLabel`, and keep `actorLabel(userId, null)` for an id the roster does not
  cover (the id floor, and the system-actor step). One `it` asserts the nameless member's chip is the
  ADDRESS and that the ULID appears nowhere, with the NAMED member as the control in the same audience
  and a chip count so the label change cannot have moved the number of chips drawn. —
  (`packages/app-core/test/views/visibility-editor.test.tsx`)

## The project card's actions strip is the button's size (owner request, 2026-09-22)

**The owner measured it, one screenshot, no theory.** On the workspace home the project card's Archive
button container `div.gn-project-card__actions` measures **362.66 × 44** while the button inside it is
about **186** wide: *"it has this wide empty space there, which gets in the way of clicking the card.
Make the container size be the same as the button size."*

**The empty space is a hole in the card's click target, and that is what makes it a defect rather than a
tidiness complaint.** `.gn-project-card` is a column flex container, so its default
`align-items: stretch` widens every child to the card's inner width — and this strip is the ONE child
also raised above the door's stretched `::after` (`position: relative; z-index: 1`, added so the
transparent overlay would stop covering Archive/Restore). The two together mean the strip's whole box
sits OVER the door, not under it: the pointer between the button and the card's right edge hits the
strip, so the card neither lights nor navigates there. Every non-button pixel of the strip is a dead
zone, and the card's clickable area is a rectangle with a 176px hole in it.

**The fix is one declaration, and it names the mechanism rather than working around it.** `align-self:
flex-start` on `.gn-project-card__actions` makes the strip shrink-to-fit — exactly its content (the one
button, or several plus the `gap`) at the card's left edge, still pinned to the bottom by
`margin-top: auto`, still wrapping via `flex-wrap` if its content ever exceeds the card width. A
`width: fit-content` would also work and was rejected for that reason: it fights the parent's `stretch`
instead of stating what it wants. `pointer-events: none` was rejected too — it would leave the strip
misreporting its own box to devtools and to anyone reading the CSS, and the owner asked for the
container to change size.

- **13.1297** ✅ The strip declares `align-self: flex-start`, and **the lift survived it**. The control
  arm is asserted in the SAME case, not a sibling `it`: it requires the rule to still declare
  `position: relative` and `z-index: 1`, because the shrink is only a fix while the strip also stays
  above the door — a "fix" that bought the width by dropping the lift would put the overlay back over
  Archive/Restore and eat the click on exactly the pixels this change rescues. A separate case would let
  that variant report green on the arm that matters. Read as SOURCE, not rendered, for 13.408's reason:
  these component tests never load the real stylesheet into jsdom, so no render here could observe a
  flex stretch, and the claim is a single declaration. The selector is ANCHORED (`^`) because three
  further rules in `globals.css` begin `.gn-project-card__actions ` — an unanchored match finds one of
  those on a later line first, the first-match landmine `3.974` records. — (`apps/web/test/workspace-home.test.tsx`)

## The workspace and the project are clickable from the breadcrumb (owner request, 2026-09-22)

**One screenshot of the ticket sheet's own bar — `Convenience Corner › Shop operations › CCSO-2 Open
questions › CCSO-12` — and one sentence:** *"the workspace and the project should also be clickable from
the breadcrumb."* The parent crumb was already a control (accent ink, opens that ticket's sheet); the two
crumbs above it were plain text.

**They are LINKS and not buttons, and that is the design rather than an implementation detail.** An
ancestor crumb is a `<button>` because opening one needs a SERVER LOOKUP first — a parent may sit in
another project, so `page.tsx` asks `ticketLocation.locate` before it can push anything. The workspace and
the project are LOCATIONS the host already knows: `/w/<workspaceId>` and
`/w/<workspaceId>/p/<projectId>`. A known address is an `<a href>`, and that is what buys middle-click,
open-in-new-tab and copy-link-address — none of which a callback can give. `packages/app-core` renders the
bare anchor because it is framework-neutral and cannot import Next's `Link` (it already renders bare
anchors for attachments); the HOST decides whether a click becomes an in-app navigation.

**The component is told the address and the router separately, and both are optional.** `workspaceHref` /
`projectHref` are where the crumbs go; `onNavigate` is the host's client-side router. A plain left click is
prevented and routed in-app; a modified click (`metaKey`/`ctrlKey`/`shiftKey`/`altKey`), a non-primary
button, or an event something above has already prevented is left entirely to the browser. **With no href
the crumb is the plain span it has always been** — the same degradation the callback-less ancestor crumb
makes, because *"a control that cannot be honoured"* is not drawn and the NAME is still owed to the
reader. The nav's whole-or-nothing gate on the two names is untouched: an href does not make a name.

**No `aria-label` is added**, deliberately: a link's accessible name is its own text, and inventing one
would move the accessible-names ratchet for a control that already has a name.

- **13.1317** ✅ With `workspaceHref`/`projectHref` passed, both crumbs are found by ROLE AND NAME
  (`within(nav).getByRole('link', { name })`), carry the exact hrefs, wear the `--link` modifier and sit
  under `sheet-crumb-workspace` / `sheet-crumb-project`; **the ticket's own crumb is still NOT a link**
  (there is nowhere further to go from here). **The control is in the same case**: mounted WITHOUT the two
  hrefs, the nav holds no link at all and the two testids are plain `SPAN`s carrying the same names — a
  caller that cannot route still gets the names. Asserted in one case because the property is a
  CONDITIONAL: two sibling `it`s would let an unconditional-link version report green on the positive arm.
  — (`packages/app-core/test/views/ticket-sheet.test.tsx`)
- **13.1318** ✅ A plain left click on the project link calls `onNavigate` ONCE with that crumb's href —
  asserted on the ARGUMENT, because a handler bound to the workspace href for both crumbs would satisfy
  "the handler ran" — and the default is **prevented**. **Three controls in the same case**: a `metaKey`
  click and a `button: 1` click each leave `onNavigate` uncalled AND the default unconsumed (routing
  without consuming navigates twice; consuming without routing does nothing), and with hrefs but NO
  `onNavigate` a click is not prevented at all, so the anchor navigates natively. `defaultPrevented` is
  read off a real `MouseEvent` dispatched at the anchor, through a listener on `document` — an ancestor of
  the container React delegates to, so it runs AFTER the component's handler and reads its decision rather
  than making one (that listener then prevents the default itself, purely to keep jsdom from logging a
  navigation it cannot perform). — (`packages/app-core/test/views/ticket-sheet.test.tsx`)
- **13.1319** ✅ `a.gn-ticket-sheet__crumb--link` declares `color: var(--gn-text-accent)` and
  `text-decoration: none`. **The `text-decoration` is the declaration that would actually be missed**: the
  product's global link rule (`apps/web/app/globals.css:73`) sets `color` and nothing else, so an unset
  `text-decoration` leaves the UA's underline standing — and a missing `color` would be invisible on the
  web surface for exactly that reason, which is why the arm is read from the STYLESHEET. **The control is
  the button arm's body, in the same `it`**: its `color`, `border` and `cursor` are unchanged and the
  location body carries no `cursor` and no `button` — because the plausible wrong move is to widen the
  existing rule into `button.…, a.…`, which would drop the button's resets onto an anchor and leave
  `ticket-sheet-crumb-css-binding.test.tsx`'s exact-string pin reading a prefix of a longer selector.
  — (`packages/app-core/test/views/ticket-sheet-crumb-css-binding.test.tsx`)
- **13.1320** ✅ **AT THE CALL SITE**, which is the half no component test can hold: the sheet accepts
  `workspaceHref`/`projectHref`/`onNavigate` all along, and a page that never passes them is this
  repository's signature failure in its client-side form (*a mocked contract is the thing that excuses the
  server from existing*) — the same shape as `uploadEvidence`, which the sheet had accepted since it was
  written while this very mount never passed it. The REAL page is rendered, a REAL ticket opened, and the
  bar read: both crumbs are links named after the served workspace and project, with hrefs
  `/w/<workspaceId>` and `/w/<workspaceId>/p/<projectId>`. Clicking the PROJECT crumb calls the mocked
  `router.push` with `/w/<workspaceId>/p/<projectId>` — the sheet-closing path `closeTicket` pushes — and
  with **`{ scroll: false }`**, because that is the page the reader is already on and Next 15's
  `router.push` scrolls to the top by default (the owner's report; the sibling lane fixing
  `openTicket`/`closeTicket` measured it in the running app: `scrollY` 600 → 0 on a default push, 600 → 600
  with the option). **Two controls in the same `it`**: clicking the WORKSPACE crumb calls
  `push('/w/<workspaceId>', { scroll: true })` — it leaves for a different page, where the default is
  wanted, so the option cannot be hard-coded — and the PARENT crumb is still a `button`, because it is the
  one crumb in this bar that cannot be an address: opening it needs a server lookup first. The fixture
  carries a parent for exactly that arm. — (`apps/web/test/sheet-crumb-links.test.tsx`)
## Opening or closing the ticket sheet does not scroll the page (owner request, 2026-09-22)

**The owner measured it in the running app, twice over:** *"currently, opening a ticket, in the board
and on the list, the page gets scrolled to the top. it should not scroll."*

**The cause was measured, not theorised.** The ticket sheet is not a route — it is a `?ticket=` query
parameter on the project page the reader is already standing on — and every door into it was a
`router.push(url)` with **no options** (`apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx`).
`router.push`'s `options.scroll` defaults to `true`, which scrolls the window to the top on every
navigation, including one that only adds or removes `?ticket=` on the page under the reader. In the dev
stack at `3fcd94ff`, on the List tab with the document scrolled to `scrollY` 600: a click on a row →
`0`, sheet open; Close → `0` again. In the same run `window.next.router.push(sameUrl, { scroll: false })`
held `600` on both, and a control default push returned to `0`.

**Three doors, and only two of them get the blanket.** `openTicket` (every tab's row and card — board,
list, backlog, calendar, timeline all land here) and `closeTicket` both stay on this page, so both push
`{ scroll: false }`. `openParentTicket` is the third and genuinely different: a parent may live in
ANOTHER project, and then the reader really is leaving the page and the top of the new one is where
they belong — so its options are the EXPRESSION `{ scroll: location.projectId !== projectId }`.

**jsdom has no layout and does not scroll**, so no render can witness a `scrollY`; the thing that was
wrong is the SHAPE OF THE ARGUMENT LIST, and that is what these cases assert. In every one of them the
positive control is `toHaveBeenCalledWith(url, { scroll: … })` rather than `toHaveBeenCalled()` or
`expect.anything()` for the options — either of those passes on the shipped one-argument call and would
report a fix that is not there. All three were run RED first against the unchanged page: `push` was
called exactly once, with the correct URL, and with **one** argument.

- **13.1322** ✅ The List tab's row door (`button.gn-list__open`, the title button) pushes
  `/w/<ws>/p/<project>?ticket=<ticket>` with `{ scroll: false }`, and pushes EXACTLY ONCE.
- **13.1323** ✅ The sheet's own Close control (`aria-label` `Close sheet`) pushes the bare
  `/w/<ws>/p/<project>` with `{ scroll: false }`. The case mounts with `ticket=` in the query so the
  sheet is really open — the same fixture shape `13.1180` uses.
- **13.1324** ✅ The parent crumb (`sheet-crumb-parent`) pushes
  `/w/<ws>/p/<project>?ticket=<parent>` with `{ scroll: false }` when the stubbed `ticketLocation.locate`
  places the parent in THIS project, and `/w/<ws>/p/<other>?ticket=<parent>` with `{ scroll: true }` when
  it places it in ANOTHER. **Both arms are in the SAME case, not sibling `it`s**: a blanket
  `{ scroll: false }` on `openParentTicket` passes the first arm, and a sibling case would let that
  variant report green on the arm that matters. — (`apps/web/test/sheet-no-scroll.test.tsx`)

---

## The bulk close arms the selection (owner request, 2026-09-22) — ids `13.1327`–`13.1336`

**The owner's two sentences, one screenshot, and the design they settled on.** *"move the close button to
the right. and it should be named bulk close."* and *"The select checkbox should not always appear. it
should appear once bulk close button is clicked. once clicked, the text should change to confirm close
(N), where N is the number of tickets selected. but the button should be disabled. with a small red x on
the right to cancel the bulk close action. once tickets are selected, and if the tickets are eligible for
the bulk close, only then should the confirm close button be enabled."*

**What that changes, in one line each.** The checkbox column stops being a permanent feature of the List
and becomes the state of an ARMED MODE: a signed-in viewer sees the row checkboxes only between pressing
`Bulk close` and either cancelling or completing a close. The action's label follows the mode —
`Bulk close` when idle, `Confirm close (N)` while armed — the confirm control is disabled until the
selection is eligible (`canBulkClose`, unchanged: every selected row terminal and not closed), and a ✕
with `aria-label` `Cancel bulk close` sits to its right.

**What did NOT change, and is the reason the existing cases only gained steps.** `canBulkClose` itself,
the snapshot taken at confirm-click time, the swap guard around an open dialog, the refusal display on a
partial close, and the clear-through-`reloadListClearingSelection` are all untouched. 13.648, 13.649,
13.794 and 13.795 keep their ids, their substance and their negative arms; what they gained is the
arming click before their checkboxes exist, and a rename of the control they press.

**The arming click CLEARS the selection before setting the mode** (`setSelectedIds(new Set())` then
`setBulkArmed(true)`), which is what makes 13.1332's re-arm read `Confirm close (0)` a fact about the
set rather than about the checkboxes having been hidden — the two are indistinguishable on screen, and
only one of them is the behaviour.

**A completed bulk close ends the mode; cancelling the DIALOG does not.** `reloadListClearingSelection`
now also clears `bulkArmed`, so the run that completes a close takes the checkboxes away with it. The
dialog's own `onClose` still does not reload and still does not clear — that asymmetry is old (the
wrapper's docblock records it), and the request gives it a second visible half.

**The button's position is now pinned, and it was not before.** 13.647 pinned only "after the summary
sentence"; mutation 7 in `13-second-wave-board-actions.md` moved the slot to the END of the controls row
and **all 71 cases stayed green**, recorded there as a deliberate freedom because spec §8.3 says only "in
the list's control row". *"move the close button to the right"* spends that freedom, and it is spent in
two halves that need each other: **13.1327** reads the DOM and **13.1328** reads `ui.css`.

- **13.1327** ✅ `controls` renders inside `.gn-list__controls-end`, and that wrapper is the row's LAST
  element child. The case measures "last" against a row that has something else in it — the
  `ControlledList` fixture's default prefs draw the origin note — so the assertion is not trivially true
  of a row with a single child. Its control arm, in the same `it`: with no `controls` prop there is no
  `.gn-list__controls-end` element at all. — (`packages/app-core/test/views/ticket-list.test.tsx`)
- **13.1328** ✅ `.gn-list__controls-end` declares `margin-left: auto`, read out of `ui.css` by the
  css-binding file's own `declarationsFor`. **Both halves in one shape**: the row's own rule is read in
  the same case and must read as `display: flex` with NO `margin-left: auto` — the two selectors are one
  string extending the other, and a reader that answered with the row's body would satisfy any assertion
  loose enough to be written about "a rule exists". — (`packages/app-core/test/views/ticket-list-css-binding.test.tsx`)

**Mutation witnesses, both run against this lane's tree and both restored (verified by sha256 of the
mutated file before and after).**

- **`margin-left: auto` dropped from `.gn-list__controls-end`** → **13.1328 red and nothing else**
  (1 failed / 89 passed across the two files). This is the declaration half on its own: the DOM is
  untouched and 13.1327 stays green, which is why the two cases are not one case.
- **The slot moved back to immediately after the summary, wrapper dropped** (the inverse of mutation 7
  above) → **13.1327 red, and 13.671's CSS-side direction red with it** (2 failed / 88 passed):
  `.gn-list__controls-end` becomes a styled class nothing renders, which is exactly the defect that
  direction exists to find. **13.647 passes under it**, measured rather than assumed — the proof that
  the END was a freedom until this request spent it.

### The armed mode — ids `13.1329`–`13.1333`

**The checkbox column is the STATE of the mode, not a feature of the List.** `selection` is spread into
`TicketList` only while `bulkArmed`, so its presence and its absence are the same switch, and every case
below reads the mode through the COLUMN **and** through the LABEL — either alone passes on a page that
did only one of the two (boxes with a `Bulk close` label, or a `Confirm close (N)` label over a table
with nothing to tick).

**Every checkbox read is scoped to `{ name: /^Select / }`, and that is a measurement.** An unfiltered
`queryAllByRole('checkbox')` on this page is never empty: the page's own "active only" `Switch` is a real
`<input class="gn-switch" type="checkbox">`. An earlier draft asserted the unfiltered query was empty and
cited `ticket-list.test.tsx`'s 13.647 control arm as precedent — **and that precedent is about the
COMPONENT, not the page**: `TicketList` alone has no `Switch`, so its unfiltered query is empty and
always was. A probe that rendered the List unarmed found exactly one `gn-switch` input.

- **13.1329** ✅ Before arming: the rows are on screen (the positive control), `Bulk close` is **enabled**,
  there is no row-select checkbox at all, and neither `Confirm close (…)` nor `Cancel bulk close` exists.
  — (`apps/web/test/list-bulk-close.test.tsx`)
- **13.1330** ✅ The arming click draws the column and changes the label: one `Select <title>` box per row,
  in the rows' own order (asserted against the fixture's three titles rather than `> 0`, so a column that
  drew one box per SECTION is red rather than merely non-empty), `Confirm close (0)` **disabled**,
  `Cancel bulk close` present, and `Bulk close` gone — one control, two labels. — (`apps/web/test/list-bulk-close.test.tsx`)
- **13.1331** ✅ The gate's two terms, either alone passing on a control enabled too often: ONE eligible
  row enables `Confirm close (1)`; adding the CLOSED terminal row gives `Confirm close (2)` **disabled**
  (control, same `it`); unticking returns it to enabled; and a `Doing` row is terminal's negative. The
  label keeps counting the ticked rows while disabled. — (`apps/web/test/list-bulk-close.test.tsx`)
- **13.1332** ✅ `Cancel bulk close` with two rows ticked returns the action to `Bulk close`, takes the
  checkboxes with it, and re-arming reads **`Confirm close (0)`** — the selection was CLEARED, not hidden.
  The re-arm is the only thing that can tell those apart: with the column gone, the two look identical.
  — (`apps/web/test/list-bulk-close.test.tsx`)
- **13.1333** ✅ A COMPLETED close ends the mode — dialog gone, checkboxes gone, `Bulk close` back — and
  the CONTROL ARM IS FIRST in the same `it`, because an assertion placed above a control masks it: the
  DIALOG's own `Cancel`, on the same armed selection, leaves the mode armed with `Confirm close (2)` and
  both boxes still ticked. A page that disarmed on either act would be red on the other.
  — (`apps/web/test/list-bulk-close.test.tsx`)

**Mutation witnesses (Task 2), each run against this lane's tree and restored — the page's sha256 was
checked before and after every one.** All three are reported as they landed, including the ones that
reddened more than the case they were aimed at: a mutation's blast radius is a measurement, and the
structural neighbours it takes with it are the expected shape for a change to a shared expression.

- **(a) `selection` spread regardless of `bulkArmed`** → **5 failed / 5 passed**: 13.1329 (the case it was
  aimed at — the column exists before the arming click), plus 13.648 case 2, 13.794, 13.1332 and 13.1333,
  every one of which asserts the column's ABSENCE after a disarm. 13.1330/13.1331 stay green under it,
  which is the honest characterisation of the mutation: it removes the arming's only visible effect, not
  the label or the gate.
- **(b) Confirm's `disabled` reads `listSelectedRows.length === 0` instead of `canBulkClose`** →
  **2 failed / 8 passed**: 13.1331 (the case aimed at) and 13.648 case 1. Both are the gate's cases, and
  nothing else reads eligibility — which is what makes 13.1331's two negatives load-bearing rather than
  decorative.
- **(c) `setBulkArmed(false)` dropped from `reloadListClearingSelection`** → **3 failed / 7 passed**:
  13.1333 (the case aimed at — the completion stops ending the mode), and 13.648 case 2 and 13.794, the
  two other cases that read the post-reload state. 13.1332 stays green, and should: it drives the ✕,
  which disarms directly and never goes through the wrapper.

---

## The ticket key column, left of the title (owner request, 2026-09-22)

**The owner's third item, from the List tab screenshot:** *"on the left of the title, add the ticket
key column."* The key is the `CCSO-12`-style identifier PR #681 put on every card that morning.

**The wire already carried it and the client's row type did not.** `TicketCard.key` is
`string | null` on the domain type, `ListCard = TicketCard & { … }`, and the board's mapper has read it
since #681. The List's `ListRow` had no `key` at all and `mapListRow` never looked — the same
one-mapper-at-a-time gap `13.703` records for `rank`, and the same remedy: the field is REQUIRED on
`ListRow`, because a required field on a view type is what makes the typecheck find every fixture that
constructs one. **It found twelve sites, one per file, ten of them under `apps/web/test` and two under
`packages/app-core/test`** (`helpers/seed.ts`'s `listRowSeed`, plus `filter/list-filter.test.ts`) — a
count taken from `git diff` over the fixture files, not from memory, because a fixture the field did not
reach would be a `ListRow` built without one.

**Three states, and the third is a refusal.** A key crosses. `null` is the server's own word for "the
ledger holds no prefix" and must arrive as `null` — read with `toBeNull` and not `toBeFalsy`, since
`undefined` is exactly what a forgotten field looks like. An ABSENT key is a body the server does not
send, refused by name so that a mapper which dropped the field cannot pass for a prefix-less
workspace. `13.1280` pins the same three arms on the board card, deliberately: the same two states
cross the same wire.

**The replica answers `null` for every row, because it cannot compose one.** A key's number is derived
from the ledger's order and the device holds no prefix — the same under-claim the replica's board cards
already make (`replica-data-source.ts`), where locally re-deriving the number would be a second
implementation of a server read, and a key naming a different ticket from the server's would be worse
than no key.

**The column is FIXED, like Title.** No `ListColumnId`, not in `AVAILABLE_COLUMNS`, never persisted —
so no stored `columns` array can omit it and the tray offers no chip for it. It renders `—` for a null
key: never a blank cell (which reads as "this cell did not render") and never `row.ticketId` (an
internal ULID where a person expects the workspace's own identifier).

- **13.1337** ✅ `mapListPage` carries a card's `key` onto the row (`'CCSO-7'` → `'CCSO-7'`); `null` on
  the wire arrives as `null` — the positive control, in the same `it`, differing in that one key — and a
  body WITHOUT the field is refused with a `MappingError` naming `.key`. —
  (`packages/app-core/test/online/mappers.test.ts`)
- **13.1338** ✅ A list row read from the replica has `key === null`, read with `toBeNull` so an absent
  field reddens, with `typeRank` off the same object as the control. —
  (`packages/app-core/test/replica/replica-data-source.test.ts`)
- **13.1339** ✅ The table's header row has `Key` IMMEDIATELY before `Title` (asserted as adjacency, so
  the optional checkbox column may come and go), and a row with `key: 'CCSO-7'` renders `CCSO-7` in
  `.gn-list__key` while a row with `key: null` renders `—` — not the id and not empty, both named. —
  (`packages/app-core/test/views/ticket-list.test.tsx`)
- **13.1340** ✅ The Key column renders whatever the chooser stored — mounted with `prefs.columns`
  stored as `[]`, the header row is exactly `Key, Title` — and the Columns tray offers no Key chip
  while still drawing its six. — (`packages/app-core/test/views/ticket-list.test.tsx`)
- **13.1341** ✅ `.gn-list__key` declares `color: var(--gn-text-muted)`, `white-space: nowrap` and
  `font-variant-numeric: tabular-nums`, with no literal colour, and the component really draws that
  class. — (`packages/app-core/test/views/ticket-list-css-binding.test.tsx`)

**Two pre-existing cases were about a whole `<tr>` and had to name a cell.** `13.667` searched the row
for `—` to prove an unclaimed date is NAMED rather than dashed, and `13.668` searched the row for the
progress dash; the Key column's own `—` for a null key put a second dash in every row, so both now read
the cell they are about through `cellUnder(row, 'Due date' | 'Progress')`, located by HEADER. That is
the same repair `3.52`'s zone battery needed, where the new leading column shifted every index by one
and a case comparing a row's TITLE against a date failed for a reason with nothing to do with the
clock. Neither was a defect; both had stopped addressing their own cell. `13.647`'s "a column narrower"
control was a hard-coded `1` and is now measured against the selection arm in the same case, so the next
fixed column does not expire it.

## Group by on one line, as a raised pill with its own chevron (owner request, 2026-09-22)

**The owner sent two screenshots and one instruction:** *"group by is currently 2 line. make it one line.
and have the dropdown button be a raised style instead. (this could be an alternative option on the
component we built. and the down arrow is important.)"* The second screenshot is the target — `Group by`
on one line, then a raised pill reading `epic` with a `⌄` at its right edge.

**Why "Group / by" wrapped, measured rather than guessed.** `.gn-list__control` is an `inline-flex` row
holding a bare `<span>` and the shared Select. The trigger is `width: 100%` (`.gn-select__trigger`), so
inside that row it took the width and the label — the only shrinkable item — wrapped. The two-line
symptom is therefore ONE layout fact with two halves, and both are asserted: the label is taken out of
the shrink (`flex: none`) and held on one line (`white-space: nowrap`), and the trigger is made
content-sized (`width: auto`) so it stops claiming the row.

**The raised coat is a `Select` option, not a List-scoped rule.** The owner's own parenthesis asked for
"an alternative option on the component we built", and that is what `SelectProps.appearance` is —
`'sunken'` (the default, and every call site that omits it) or `'raised'`. Scoping it to the List with a
descendant selector would have been the smaller diff and the worse one: it is the exact shape
`.gn-list__control .gn-select__trigger` already demonstrates, and `rule()` in the ui suite resolves a
selector by FIRST match in file order, so a caller-side rule containing the shared class becomes the body
every later case reads for it (measured — see `13.1344`).

**⚠ TWO THINGS THE PLAN PINNED THAT MEASUREMENT REFUTED, both recorded because both would have shipped
a green check over a wrong fact.**

The first: the plan's control for `13.1344` was to assert that `rule('.gn-select__trigger')` still
declares `justify-content: space-between`. **It does not, and never did.** `rule()` is
`UI_CSS.match(...)` with no line anchor, and the first place in `ui.css` where the literal
`.gn-select__trigger {` appears is not the base rule (`:3032`) — it is the List-scoped
`.gn-list__control .gn-select__trigger` (`:1419`), whose body is `padding` / `font-size` /
`font-weight`. So the planned control would have failed against a tree where nothing was wrong. The case
now asserts what that reader ACTUALLY returns (pinning the trap so a change in what it resolves to goes
red) and reaches the base rule by a line-anchored scan instead.

The second: the plan's raised rule was `.gn-select__trigger--raised` at `(0,1,0)`, placed in the trigger's
own block. Measured, that **loses to `[data-style="neo"] .gn-field__input`** — `(0,2,0)`, and the trigger
wears `gn-field__input` in both appearances because that class carries the 44px `min-height` floor. Under
`neo`, the shipped default, that override repaints the control sunken and swaps the raised shadow for the
sunken one, so the owner's raised pill would have rendered PRESSED with every case green. The rule
therefore takes the field class into its own selector to reach `(0,2,0)`, and sits AFTER the override it
beats, because at equal specificity source order is the only thing that decides. `13.1344` asserts that
ordering, with comments stripped first — the override's selector text is named in prose earlier in the
stylesheet, and an `indexOf` over the raw file finds the COMMENT.

- **13.1342** ✅ A single non‑searchable `Select` renders EXACTLY ONE `.gn-select__chevron` inside its
  trigger, wrapping an `svg[aria-hidden="true"]`. Control, in the same `it`: the trigger's accessible
  name is asserted VERBATIM as `Banana Fruit` (value, then `aria-label`), because decoration is only
  decoration if it adds no name — a `toContain` would pass while the chevron silently appended anything
  that was not text. Two further arms in the same `it`: the searchable trigger and the multi-select
  trigger render no chevron at all, without which "on the single trigger" and "on every trigger" are the
  same passing test. — (`packages/ui/test/select.test.tsx`)
- **13.1343** ✅ `appearance="raised"` adds `gn-select__trigger--raised`, and the modifier is ADDITIVE —
  the trigger still carries `gn-select__trigger` and `gn-field__input`, which is where the tap floor
  comes from. Two control arms in the same `it`: the default (prop omitted) adds nothing, and
  `appearance="sunken"` adds nothing either — a `'sunken'` that behaved like `'raised'` would be a prop
  whose value is ignored, which the omitted-prop arm cannot see. — (`packages/ui/test/select.test.tsx`)
- **13.1344** ✅ `.gn-select__trigger--raised` declares `background: var(--gn-surface-raised)`,
  `box-shadow: var(--gn-shadow-raised)` and `border-color: transparent`. Controls in the same `it`: what
  the unanchored reader returns for the bare name (asserted as the measurement above, and asserted not to
  be the raised rule); the BASE rule, reached by a line-anchored scan, still declaring
  `justify-content: space-between` and `width: 100%` — the layout the raised coat rides on rather than
  replaces; the raised rule's source position AFTER `[data-style="neo"] .gn-field__input`, which is the
  tie-break the coat depends on, measured on comment-stripped text; and `globals.css`, which
  `apps/web/app/layout.tsx` imports after `ui.css` and which would win at equal specificity, not
  re-declaring the class. — (`packages/ui/test/components.test.tsx`)
- **13.1345** ✅ The `Group by` text is a `gn-list__control-label` span whose `textContent` is exactly
  `Group by`, and the grouping control's own trigger carries `gn-select__trigger--raised` AND
  `gn-field__input` (the raised coat is additive — the field class is where the 44px floor comes from).
  Controls in the same `it`: the label and the trigger are SIBLINGS in one `.gn-list__control` — the
  class must be on the element holding the words, and on the label rather than the trigger or the row —
  and the row contains EXACTLY ONE raised trigger, so the raise belongs to this control rather than
  having become the component's default (that default is owned by `13.1343`). — (`packages/app-core/test/views/ticket-list.test.tsx`)
- **13.1346** ✅ `.gn-list__control-label` declares `white-space: nowrap` AND `flex: none`, and
  `.gn-list__control .gn-select__trigger` declares `width: auto`. **Neither half is asserted alone**:
  `nowrap` on a label that is still the shrinkable item overflows instead of wrapping, and a
  content-sized trigger still lets a wrapping label break — the owner's `Group` / `by` is reachable with
  either one missing. Control: the shared base rule still declares `width: 100%`, so the scoped `auto` is
  an OVERRIDE of a declaration that exists rather than one that appeared from nowhere — an override of a
  deleted declaration reads identically to one that works. Control 2: the two readers returned two
  different bodies, which is the line-anchoring (`declarationsFor`) doing the job it exists for.
  **jsdom has no layout engine**, so this case asserts the declarations and NOT a line box — the paint is
  the controller's measurement, not a number invented here. — (`packages/app-core/test/views/ticket-list-css-binding.test.tsx`)
- **13.1381** ✅ **THE SCOPE NOTE IS A STANDING ROW, NOT A CHILD OF THE CONTROLS ROW.** The owner
  toggled *Only tickets in progress* on the live project page (two screenshots, Board tab, ~1000 CSS px)
  and the ENTIRE controls row — search, workflow picker, switch, Filters, New ticket — dropped out from
  beside the title and onto its own line. The note was the cause and it was the LAST child of
  `.gn-project__header`, a `flex-wrap: wrap` row: **a wrapping flex container's max-content contribution
  to its parent is all its children on ONE line**, so the ~770 px sentence pushed that row's intrinsic
  width to ~1400 px against ~625 px without it, and `.gn-project__head` (`flex-wrap: wrap;
  justify-content: space-between`) wrapped the whole row rather than shrinking the note. The docblock
  that stood over the old span described the INNER wrap ("it takes its own line rather than pushing the
  switch away") and missed the OUTER one — it was false and is replaced, not patched. The case asserts
  the note is a direct child of the `.gn-project` column and the `nextElementSibling` of
  `.gn-project__head`, before the `Project view` tablist; that it is PRESENT and EMPTY with the switch
  off and carries the sentence once clicked; and that it is the SAME node across the toggle, so the row
  is reserved rather than unmounted and remounted. **Controls, all in the same `it`:** the controls row
  does not contain the note **in either state** — asserted twice, because with the switch off there was
  nothing to find in the old defect, so a single on-state arm would pass whenever the switch was off and
  a regression that restored the span would go unseen; and the count of the column's direct children is
  identical before and after the click, which is what tells "reserved" from "inserted" and is the arm a
  note written as `activeOnly ? <p…/> : null` — the obvious way to write the pinned markup — fails.
  Red before the change on the note's absence when off. (Post-commit mutation: restoring
  `activeOnly ? <p…/> : null` reddens it.) — (`apps/web/test/project-page-head.test.tsx`)
- **13.1382** ✅ **THE RESERVED BAND IS ITS OWN RULE, PLACED AFTER THE SHARED NOTE RULE.**
  `.gn-project__scope-row` declares `min-height: 1.125rem` — one line of the note's OWN `line-height`,
  so the band is the same height in both switch states — and `margin: 0`, because `<p>` carries UA
  margins and `.gn-project` already spaces its children with `gap: 0.875rem`. Asserted as its own
  SINGLE-SELECTOR rule (a grouped selector would put the band on every class it named) and as declared
  AFTER `.gn-project__scope-note` — the order another suite's witness depends on, since
  `packages/ui/test/components.test.tsx` resolves a rule with an UNANCHORED `UI_CSS.match` (`:548-549`),
  so a selector NAMING the note placed above `ui.css:5948` matches first and becomes the body its cases
  read. (`ruleFor`, the shared `test/helpers/css-rule-scan.ts` this case also reads through, is a
  first-match LINE scan and is safe only because its callers ANCHOR their patterns — the anchoring
  protects it, not the helper.) **Control, same `it`:** the
  `.gn-project__scope-note` rule is byte-identical to what it was — its whole declaration list pinned,
  not just the two declarations this change adds elsewhere — because the one-line way to reserve a band
  is a `min-height` on that rule itself, which would satisfy every assertion above while changing the
  treatment of a class the BOARD tab also renders (`board-scope-note`). Both position reads and the
  single-selector read run on COMMENT-STRIPPED text: `ui.css:5799` carries prose naming
  `.gn-project__scope-note`, so a raw sweep can find a comment and report its position as the rule's.
  (Post-commit mutation: dropping `min-height` from the new rule reddens it.) —
  (`apps/web/test/project-page-head.test.tsx`)
- **13.1383** 🧪 **THE PAINT: THE CONTROLS ROW NEVER MOVES; THE RAIL MOVES ONLY WHERE THE SENTENCE WRAPS.**
  ⚠ This opening asserted "nothing moves … at **1000 px and 1280 px** … the note row is **18 px** tall in
  both states" before anyone measured it, and the measurement below falsifies the 1000 px half. It is
  rewritten rather than left standing with a correction bolted underneath, because the first sentence is
  what a reader takes away. What is true at BOTH widths: `.gn-project__header`'s bounding rect is
  IDENTICAL with the switch off and on. What is true only at 1280 px: the rail's `top` is identical too
  and the note row is 18 px in both states. jsdom applies no layout, so this half
  cannot be a jsdom case — `13.1381` asserts the DOM structure that makes the paint possible and
  `13.1382` the declarations that reserve the band; this one is the measurement, taken by the controller
  in the rebuilt dev stack (`ctl rebuild`), which records the numbers here. **Recipe:** sign in on
  :3001, open a project, read `document.querySelector('.gn-project__header').getBoundingClientRect()`
  and the rail's `getBoundingClientRect().top` with the switch off; click *Only tickets in progress*;
  read both again. The two pairs must be equal at each width. A viewport narrow enough to wrap the
  sentence onto two lines is OUT of scope by the owner's ruling — the rail shifts by one line there and
  that is accepted. — (controller measurement; no test file)

  **MEASURED 2026-09-23** by the controller on the dev stack rebuilt from `release/2026-09-23`
  `91a82eefaff4`, Chrome, signed in on :3001, each width read after a full reload and driven switch OFF →
  ON. **The case PASSES at 1280 px and FAILS at 1000 px**, and the failure is a defect in this section's
  own PROSE, not in the change:

  | width | note width | header rect (off → on) | railTop off → on | note height off → on | verdict |
  |---|---|---|---|---|---|
  | 1280 px | 1240 | `[136.09, 575.65, 684.35, 44]` → identical | `248.59` → `248.59` | 18 → 18 | ✅ nothing moves |
  | 1000 px | 960 | `[136.09, 295.65, 684.35, 44]` → identical | `248.59` → **`266.59`** | 18 → **36** | ❌ rail moves 18 px |

  **The header never moves at either width** — the owner's actual complaint (the note dropping the whole
  controls row out from beside the title) is fixed, and that is what `13.1381`'s structure buys.

  What is wrong is the claim, carried in this case's first sentence, in `page.tsx`'s docblock and in the
  brief, that **1000 px holds a single line**. It does not: the note spans the `.gn-project` column, which
  is **960 px** wide at a 1000 px viewport and **1240 px** at 1280 px — the content column is a fixed
  width that CENTRES (`header.left` moves 295.65 → 575.65 while `header.width` stays 684.35), but the note
  is not inside that column, so its own width tracks the viewport. The sentence needs somewhere between
  960 and 1240 px. At 960 it wraps, the row becomes 36 px, and the single reserved line no longer covers
  it, so the rail drops by exactly one line.
  So 1000 px is a "viewport narrow enough to wrap" — the very case the original text called out of scope
  while naming it as a width that holds.

  **RULED 2026-09-23 (owner): the 18 px rail shift at ~1000 px is ACCEPTED.** The alternatives — reserving
  two lines, or shortening the sentence — were offered and not taken. So the row reserves ONE line, and at
  viewports where the sentence wraps the rail drops by exactly one line when the switch comes on. That is
  the shipped behaviour, not an outstanding defect, and a future reader finding the 1000 px numbers above
  should not "fix" them.

  **STAYS 🧪 and is deliberately NOT flipped to ✅.** The acceptance settles the product question, not the
  evidence question: this is a hand-run controller measurement with no test file, and `check-case-citations`
  demands a citing test for a ✅. jsdom applies no layout, so the only instrument that could witness it is a
  browser. `13.1381` (DOM structure) and `13.1382` (the declarations) are the automated halves and are ✅.

## The New ticket form — the backlog question, its memory, and the two fields (owner request 2026-09-23)

*Block `13.1351`–`13.1380`, allocated to `task/new-ticket-form-fields` against `release/2026-09-23`
`fd114852` — the FIRST task branch cut off a release branch rather than `main` (see
`13-hig-per-screen.md`'s block table). The case file is this one, and a wide block was reserved on
purpose: the assignee and description asks reach the domain payload, the reducer, the projections and the
permission rules, not only the dialog.*

- **13.1351** ✅ The dialog asks **"Starts in the backlog?"** with the SHARED `Switch`, and it opens ON.
  Three things asserted together because a lookalike satisfies any one of them alone: the control carries
  `gn-switch` and sits inside a `gn-switch-row` label (so it IS `packages/ui/src/components/switch.tsx`
  rather than a second on/off control for the product to keep in step); it is CHECKED, which is the
  ruling's default and, because ON means BACKLOG, is also the draft's first assertion in 13.591b; and its
  accessible name is the question itself — `Switch`'s `children` ARE the name, with no `aria-label` to
  drift from the words on screen. —
  (`packages/app-core/test/views/new-ticket-dialog.test.tsx`)
- **13.1352** ✅ The switch is present and **ENABLED for every parent** — §5.4's condition is lifted.
  Three arms in one `it`, and all three are needed: with NO parent chosen (the state the owner was
  looking at, where the old checkbox was absent and the sentence dangled), under an IN-FOCUS parent (the
  only parent that ever revealed the old control), and under a BACKLOG parent (which hid it outright).
  Dropping the middle or last arm leaves the case passing against a switch enabled only where the
  checkbox used to appear. —
  (`packages/app-core/test/views/new-ticket-dialog.test.tsx`)
- **13.1353** ✅ Turning it OFF with NO parent chosen sends `start: 'focus'` — a ticket may be born in
  focus without a parent. **Its CONTROL is a separate `it` in the same block** and that is deliberate: the
  pair pins the POLARITY, which is the one thing a rename could silently reverse. The switch means BACKLOG
  when ON and the checkbox it replaced meant FOCUS when checked, so a control wired straight to the old
  `startInFocus` sense would pass the ON-direction case while sending the opposite of what the OFF one
  asserts. Both are red together or the direction is not being tested. —
  (`packages/app-core/test/views/new-ticket-dialog.test.tsx`)
- **13.1354** ✅ The thing the switch replaced is **GONE** — the old unconditional sentence *and* the
  `"Start in focus"` checkbox. The `?` is the whole difference in text and `getByText` matches normalised
  text EXACTLY, so asserting the old string absent and the new question present cannot both be satisfied
  by one node; a dialog that kept the `<p>` and added a switch beside it is exactly the pair the owner
  asked to have replaced. A second control for the same fact is refused too: a leftover checkbox could
  disagree with the switch, since the draft reads the switch alone. Final arm: exactly ONE `checkbox` role
  remains, so "the old one is gone" cannot be satisfied by a dialog that lost the switch as well. —
  (`packages/app-core/test/views/new-ticket-dialog.test.tsx`)
- **13.1355** ✅ The answer is **REMEMBERED for the user**: turning the switch OFF survives a close and a
  reopen, and the stored record is `{userId, start}` read back and compared WHOLE — a record that kept the
  answer without the user would still satisfy the reopen assertion while being precisely the leak the
  key's shape exists to prevent. The reopen is the REAL path rather than a fresh mount: the flow mounts
  this dialog for its whole life and only toggles `open`, so the seed has to survive `open: false → true`
  on a SURVIVING instance — which a component seeding only in `useState`'s initialiser would fail. —
  (`packages/app-core/test/views/new-ticket-dialog.test.tsx`)
- **13.1356** ✅ A record written for **ANOTHER user is not honoured**, and its CONTROL — in the same `it`,
  and the reason the case can be trusted — reads the SAME BYTES for the user the record names and finds
  them honoured, turning the switch OFF. Without that arm, "the other user's record was refused" is
  indistinguishable from a reader that failed for an unrelated reason: a typo in the key, an unparsed
  shape. Both halves are needed because they fail independently. —
  (`packages/app-core/test/views/new-ticket-dialog.test.tsx`)
- **13.1357** ✅ **Blocked site data** still renders the dialog, at the default (backlog ON), and the switch
  still toggles. The stub replaces `window.localStorage` itself rather than one method, because a browser
  with site data blocked throws on the ACCESSOR — and the toggle arm is what proves the WRITE is guarded
  as well as the read, since the write is the half that throws here. `configurable: true` plus a `finally`
  restore, because leaving a throwing stub in place would poison every later case in the file. —
  (`packages/app-core/test/views/new-ticket-dialog.test.tsx`)

*The rest of block `13.1351`–`13.1380`: the description and the assignee. **`13.1360` and `13.1361` are
UNUSED** — the payload-shape cases and the engine's field-kind parity were folded into `13.1358`/
`13.1359` and into `13.1364` rather than split out, and ids are never renumbered, so they stay empty.*

- **13.1358** ✅ A ticket's BIRTH description is a CLAIM on head state, attributed to the creator and the
  creation clocks — or there is NO `description` key at all. The two halves are one case because they are
  one decision: the reducer spreads the claim in only when the member is present, so
  `Object.keys(state.fields)` is the assertion, not a value. A `claim(null, env)` for the absent member
  would answer *"has anybody described this?"* YES for every ticket nobody described, and name the person
  who filed it as the one who set an empty description — `ticket-sheet.tsx` reads that key's PRESENCE
  (`descriptionClaim === undefined`) to choose between "no description yet" and "set by X on DATE".
  Controls in the same case: the title and priority claims are written beside it (so the absence is one
  key and not a fold that wrote nothing), the value is the DOCUMENT and not a projection of it, and a v1
  `ticket.created` carrying neither new member still folds. Payload half: `description` is optional, is
  held to the SAME `z.record` shape `ticketFieldSetPayload` demands of the field_set door — a string
  REDDENS rather than reaching head state as a value the edit door would then refuse to replace — and an
  explicit `null` is REFUSED, because at birth absent is the one spelling of none. —
  (`packages/domain/test/ticket-state.test.ts`, `packages/domain/test/ticket-events.test.ts`)
- **13.1359** ✅ A ticket's BIRTH ASSIGNEE lands on `state.assigneeId`; absent or explicit `null` leaves
  it `null`, which is what every pre-existing `ticket.created` meant (the reducer hard-coded `null` there
  before the member existed). The CONTROL pinning `null`-equals-absent is deliberate: the client OMITS
  the member rather than sending `null`, and a future schema that refused `null` would have to change
  that case on purpose rather than drift. `assigneeId` is `z.string().min(1).nullable()`, so an
  EMPTY-STRING assignee — a named person who is nobody — is refused at the door, exactly as
  `ticketAssignedPayload` refuses it. Payload round-trips are asserted through `parseEvent`, which
  compares the PARSED payload to what was submitted, so a member the schema stripped would redden rather
  than vanish. —
  (`packages/domain/test/ticket-state.test.ts`, `packages/domain/test/ticket-events.test.ts`)
- **13.1362** ✅ **THE BIRTH ASSIGNEE IS HELD TO THE SAME NAMED-PERSON RULE `ticket.assigned` IS** — a
  `ticket.created` naming somebody with no role in the workspace is refused
  `permission.role` / *"That person is not in this workspace."*, asserted as the WHOLE refusal object
  because this module reports `permission.role` from four places and the actor here really is on the
  project, so nothing else could have fired. **PLANTED DEFECT — measured before the fix:** the identical
  name arriving on a `ticket.created` was `committed` while `ticket.assigned` refused it, because the
  E6-17 lookup ran AFTER `canSee` and `ticket.created` returns before that block (there is no ticket to
  see yet). The lookup is now ONE function called from both branches; writing it a second time inside
  the `ticket.created` branch would have been two spellings of one rule, free to drift. The read side
  would have served the typo as an assignee NAME (`roster.get(id) ?? id`), matched it in the list's
  `assigneeId` filter, and made a `groupBy=assignee` column for it. —
  (`apps/server/test/permissions/check-visibility-permission.test.ts`)
- **13.1363** ✅ CONTROL for `13.1362`, in the same `describe` and its own `it` so the refusal cannot pass
  against a build that refuses every birth assignee: a REAL member is admitted, and BOTH spellings of
  nobody are admitted too (`null`, and the member omitted entirely) — without those two arms the fix
  would have made the dialog's default, Unassigned, unsubmittable. —
  (`apps/server/test/permissions/check-visibility-permission.test.ts`)
- **13.1364** ✅ A ticket's BIRTH description reaches `proj_search.description`, **and reaches `tsv`** —
  the second half is what an exact-column assertion cannot show, since a value written to the right place
  but never indexed would satisfy the first. **Measured before the fix:** the `ticket.created` branch
  inserted `(ticket_id, workspace_id, project_id, title)` and nothing else, so a description composed at
  creation lived in head state and the sheet while the search column kept the table's own default — the
  person found the ticket by its title and not by the words they had just typed. The extraction is the
  `ticket.field_set` branch's own `docToPlainText` call, so the two doors cannot disagree about what a
  description is as search text. Controls: the title still matches (the row exists and is indexed at
  all), and a ticket born with NO description gets `''` rather than the string `'undefined'` or `'null'`
  indexed instead. **In its own FILE rather than in `search.test.ts`**, whose docblock makes case order
  part of its fixture and two of whose read-only cases assert the table's exact row count — a case that
  ADDS rows would have forced edits to assertions belonging to cases about something else. —
  (`apps/server/test/projections/search-birth-description.test.ts`)
- **13.1365** ✅ The create dialog mounts the description composer from its `editorSlot` prop as a
  `'description'` composer — empty (`doc: null`), editable, scoped to the caller's workspace, carrying a
  REAL ULID for a ticket that does not exist yet, and with NO `submit` wired (there is nowhere to submit
  to; Create is the one act). All renders are required to agree on the SCOPE, because a slot whose mode
  or workspace changed between renders is a composer re-mounting under the person mid-typing. A document
  the slot reports travels in the draft as `description`, **under the id the slot was scoped to** — the
  scoping invariant, without which a dialog that showed the composer one id and created the ticket under
  another would satisfy every other assertion here. The composer test doubles as the seam's proof: it
  drives a FAKE slot, because what belongs to app-core is the contract and what belongs to
  `packages/editor` is that package's own suite. Second half, in `packages/editor`: `onChange` carries
  the document as it is typed and NOT before anything is typed (`TicketEditor` wires it to ProseMirror's
  `onUpdate`), so a host can read "never reported" as "no description"; and it is the DOCUMENT, not a
  plain-text projection, because the field_set door refuses a string. —
  (`packages/app-core/test/views/new-ticket-dialog.test.tsx`,
  `packages/editor/test/ticket-editor-slot.test.tsx`)
- **13.1365b** ✅ `submitSlot: 'none'` omits the slot's own submit control and KEEPS THE FOOTER, which
  also carries the hint sentence — asserted on the footer rather than by counting children, since the
  hint is a sibling the button's removal must not take with it. The composer is still editable, so "no
  button" cannot be satisfied by a slot that rendered nothing. **Control in the SAME `it`** (a control in
  a sibling case proves nothing about this one): the same mount WITHOUT the prop still draws the button,
  so the case cannot pass against a component that lost its submit control for every mount. The prop is
  seam-only on `TicketEditorSlotProps`, the `editorRef` precedent — it is a fact about mounting THAT
  component, and the shared contract cannot carry it. —
  (`packages/editor/test/ticket-editor-slot.test.tsx`)
- **13.1366** ✅ An EMPTY description is OMITTED from the draft — the KEY is absent, not a document that
  renders to nothing. The key set is the assertion, because `description: undefined` satisfies a
  `toEqual` against an absent key. The decision is `docToPlainText(...).length === 0`, the domain's one
  total projection, so an untouched composer (which reports nothing at all) and one emptied back to
  nothing take the SAME arm. CONTROL in the same describe: with no `editorSlot` at all the dialog still
  works and sends no description — without it, "an empty document is omitted" passes against a dialog
  that omitted descriptions entirely. —
  (`packages/app-core/test/views/new-ticket-dialog.test.tsx`)
- **13.1367** ✅ The Assignee picker offers **"Unassigned" plus the caller's roster**, and omitting it is
  the default: `null` travels, not absent and not `''`, because `ticketCreatedPayload.assigneeId` is
  nullable and `TicketState.assigneeId` is `string | null`, so `null` is the one spelling of nobody the
  whole chain agrees on. "Unassigned" is an OPTION and not the absence of one — a picker with no way back
  to it cannot un-assign. A chosen person travels as their id, asserted after reading the trigger back so
  the label the person sees and the value the payload carries are both pinned. —
  (`packages/app-core/test/views/new-ticket-dialog.test.tsx`)
- **13.1368** ✅ An UNREAD roster is STATED, and the draft carries `assigneeId: null` rather than a wrong
  one — the discipline `parentCandidatesUnavailable` established one field over: an empty picker asserts
  *nobody in this workspace can be assigned*, which is a claim made from a read that never answered, and
  inside a modal the sentence that would correct it is on the page behind. The caller's own reason
  travels VERBATIM and unparaphrased, so a person can tell a refusal from a read still in flight.
  Enforced at the SUBMIT site as well as by hiding the picker, because the prop can arrive after a
  selection has been made and hiding a control does not clear the state behind it (3.157's own
  invariant). —
  (`packages/app-core/test/views/new-ticket-dialog.test.tsx`)
- **13.1369** ✅ **CREATING A TICKET OPENS IT** — measured before anything was written, because the
  wiring was already present end to end and the ask read as a missing feature only because NOTHING
  PINNED IT: an unpinned path is one refactor away from being a missing one, and the two are
  indistinguishable by looking at the app. The case runs the ROUTED page (not the sheet mounted
  directly): a real create through the real dialog reaches `router.push`, and the id it pushes is read
  back off the `ticket.created` envelope that was actually ingested — so the URL cannot name a ticket
  other than the one the ledger received, which a shape check could not tell. Then the sheet is opened
  from that param and its title is read off `gn-ticket-sheet__title-input`, the sheet's own title
  CONTROL; `getByText` would FAIL against a perfectly open sheet, measured, and that is recorded because
  it is the mistake this case's first draft made. CONTROL, in its own `it`: with no `?ticket=` param no
  sheet renders, asserted after the page has certainly loaded, so the arm above is not reading a page
  that always shows one. **⚠ THIS WITNESSES THE CLIENT HALF ONLY.** `getTicket` is stubbed, so "the sheet
  answered" means "the sheet renders when its read answers" — it says NOTHING about whether a read
  against a live server, issued moments after the create, sees the row. That is the question the owner's
  separately-reported live-update defect asks, and this case must not be read as evidence about it
  either way. —
  (`apps/web/test/new-ticket-opens-sheet.test.tsx`)
- **13.1370** ✅ A person chosen BEFORE the roster was withheld does not reach the draft — 3.157's
  defect, one field over. The transition is the thing: the picker works, a person is chosen, and THEN
  the read fails, so React state survives while the control that set it stops rendering. **This needed
  its OWN case, measured rather than tidy:** `13.1368` sets `assigneeCandidatesUnavailable` from the
  FIRST render, so its picker is never usable and `assigneeId` is still `UNASSIGNED` at Create — it
  exercises the `UNASSIGNED` arm and nothing else. **Mutation (dropping the
  `assigneeCandidatesUnavailable !== undefined` term from the submit boundary) left all 39 cases in the
  file GREEN**, i.e. the submit-site check was covered by no test at all while looking covered; with
  this case it reddens exactly here and nowhere else. Asserted on the DRAFT and not the screen, because
  the sentence was already correct and the payload was what contradicted it. Control in the same `it`:
  the picker is opened and used first, since a case that started withheld could never build the state
  this defect needs. —
  (`packages/app-core/test/views/new-ticket-dialog.test.tsx`)

## Two defects the owner found in the release branch before it shipped (2026-09-23)

Ids `13.1384`–`13.1385`, minted from the §13 tip (`13.1383`). Both were found by the owner USING the
app, not by any suite, and both are recorded here with what the suites failed to ask.

- **13.1384** ✅ **A TICKET ASSIGNED AT BIRTH READS BACK.** The New ticket dialog's Assignee picker names
  the person inside `ticket.created` and appends no `ticket.assigned`. `assignedProvenanceFor` queried
  `type = 'ticket.assigned'` alone, so a birth-assigned ticket had an `assignee_id` in `proj_tickets` and
  no claim behind it — which `assembleListCards` and `readTicket` are both built to read as "the
  projection and the ledger disagree" and to THROW on. Measured live: **HTTP 500** on
  `GET /v1/projects/:id/tickets` (taking out the List, Calendar, Timeline and Backlog tabs of the whole
  project) and on `GET /v1/workspaces/:ws/tickets/:id` (taking out the sheet). One such ticket broke the
  project for everyone who could see it.
  The fix is a PREDICATE where the exclusion was: a `ticket.created` joins the candidates only when its
  payload names somebody, so a birth with no assignee still contributes nothing and the original
  argument — never attribute "nobody is assigned" to the creator — is preserved rather than traded away.
  **Why nothing caught it:** `seedTicket`'s `assigneeId` writes the separate `ticket.assigned`, so the
  fixture could only build the shape that already worked. `birthAssigneeId` builds the other one and
  exists for this case. **Post-fix mutation:** reverting the predicate to `type = 'ticket.assigned'`
  reddens this case and leaves the other 14 in the file green.
  **Known gap, named rather than papered over:** the LIST door is not directly asserted — this seeded
  world answers 404 on that route before reaching the provenance check, so an arm there would pass with
  the fix reverted. Both doors resolve through the same `assignedProvenanceFor`. A direct list-door case
  needs `seedWorkflowDef` and is owed. — (`apps/server/test/routes/tickets-read.test.ts`)
- **13.1385** 🧪 **THE PROJECT HEADER DOES NOT FLICKER WHEN THE SCOPE SWITCH IS TOGGLED.** Owner:
  *"the project header still has a flicker during transition."* Measured by sampling
  `getBoundingClientRect()` on every animation frame across the toggle: the header went
  `684.4×44.0` → **`797.2×55.2`** → `684.4×44.0` over three frames, ~40 ms, while the rail and the note
  row did not move at all. The child that changed was the last one: `gn-button--primary@116×44` — the
  New ticket button — replaced by `gn-new-ticket__gate@229×23`, its "Preparing the New ticket form…"
  fallback, and back.
  Cause: the gate tested `list.rows === null`, `rows` is nulled on every query-KEY change, and the list's
  key carries the filter. So a re-read retracted the button. Not a CSS transition — there are none on
  these rules. **Pre-existing**: the identical condition is on `main`, so neither the reserved scope row
  nor the New-ticket work introduced it.
  Fix: `LiveQueryResult.hasAnswered` — a LIFETIME flag the key-change effect deliberately does not reset
  — surfaced as `TicketListState.rowsHaveAnswered`, and the gate asks that instead. An error counts as an
  answer, so a failing read cannot hold the control hostage forever.
  🧪 because the defect is a transient LAYOUT state and jsdom applies no layout; the acceptance is the
  frame-by-frame measurement above, re-taken on the rebuilt stack. **An automated arm is owed** and is
  writable in jsdom — render, toggle the switch, assert the New ticket button is still in the document —
  which would have caught this without a browser. — (controller measurement; no test file yet)

## Opening a ticket from My Work opens the sheet THERE (owner request, 2026-09-23)

Owner: *"opening a ticket from my work should open the sheet on the my work page, not redirect to the
project page."* Ids `13.1391`–`13.1401`, from this branch's block (`task/my-work-sheet-in-place`,
allocated in `13-hig-per-screen.md`).

Until this change every title button on `/w/:ws/my-work` pushed
`/w/:ws/p/:projectId?ticket=…` and the reader arrived on the project page — a board they had not asked
for — with the sheet open over it. The page now mounts its own `TicketSheet`, driven by a `?ticket=`
param **on its own route**, and the click keeps the reader where they were.

**Three decisions the change had to make, recorded because they are visible in the assertions below:**

1. **The open ticket lives in the URL, not in component state.** A param survives a reload and is
   shareable as a link; `useState` is neither. `13.1392` is the arm that only a param can pass — it
   loads the page with the param already set and asserts the sheet is there, which a state-based
   version fails on its first render.
2. **`MyWork`'s `onOpenTicket` signature is unchanged.** The view still takes one
   `(ticketId: string) => void` and knows nothing about what opening means; what changed is what the
   PAGE does with the id.
3. **The sheet's project-scoped props come from the OPEN TICKET.** My Work spans projects, so there is
   no page-level project to read: the project is recovered from the rows the page already holds
   (`assigned`/`inTransit`/`shared`, and every `AttentionItem` — the strip is mounted here) or, for a
   ticket no section carries, asked of `TicketLocator` — the same one-shot gateway the inbox uses.
   **A ticket the server will not place says so and mounts nothing**; it is not redirected somewhere
   plausible, and no fallback project is guessed.

- **13.1391** ✅ **A CLICK ON A MY WORK ROW OPENS THE SHEET ON THE MY WORK PAGE.** One push, to
  `/w/:ws/my-work?ticket=<id>` with `{ scroll: false }` — asserted as `toHaveBeenCalledTimes(1)` plus a
  negative on any `/p/` path, because the defect is a SECOND push to the project page — and the sheet is
  then in the document with the clicked ticket's title, with My Work's own heading still on screen.
  **Post-commit mutation (measured):** pushing the OPEN TICKET's project path instead of this page's —
  i.e. the old redirect — reddens this case, `13.1163`, `13.1397` and `3.162`: every arm in the tree
  that asserts where a click GOES. —
  (`apps/web/test/my-work-sheet-in-place.test.tsx`)
- **13.1392** ✅ **THE PARAM IS THE STATE: a page loaded on `?ticket=` mounts the sheet with NO
  navigation at all.** A reload — or a link somebody sent — reaches the same sheet, and the page pushes
  nothing on mount (a page that pushed would fight the back button).
  **Post-commit mutation (measured):** gating the sheet on a click-time `useRef` — which is what
  `useState` would have given you, since the sheet then requires a click and a reload opens nothing —
  reddens `13.1392`, `13.1395`, `13.1396`, `13.1397` and `13.1400` (5 of 13), and leaves `13.1391` and
  `13.1393` green. —
  (`apps/web/test/my-work-sheet-in-place.test.tsx`)
- **13.1393** ✅ **CONTROL for `13.1391`: with no `?ticket=` param the page renders NO sheet at all.**
  Its own case rather than an arm, because "the sheet opened" would otherwise also be satisfied by a page
  that mounts a sheet unconditionally — a different bug from the one the owner reported, and one that
  would delete the page's subject.
  **Post-commit mutation (measured):** defaulting the id when the param is absent
  (`?? myWork.data?.assigned[0]?.ticketId`) reddens EXACTLY here — one case of the thirteen. (The
  mutation the first draft of this entry named, *dropping the `openTicketId !== null` term*, does NOT
  redden it: the sheet is also gated on a resolved project, which is `null` without an id, so that
  mutation is a check that cannot fail and was replaced.) —
  (`apps/web/test/my-work-sheet-in-place.test.tsx`)
- **13.1394** ✅ **THE SHEET IS TOLD THE OPEN TICKET'S PROJECT, not the page's first row.** Two rows in
  two projects, the second one clicked: the project crumb is an ADDRESS, so the assertion is the href
  (`/w/:ws/p/<the open ticket's project>`) *and* the absence of the other row's project — a resolver
  that fell through to the first list passes the href check while failing the absence. **Mutation:**
  resolving the project from the first row of the first section — the wrong-project answer this case
  names — reddens here, `13.1397`, `13.1398` and `3.162`: one wrong resolver is wrong from four
  directions, which is why the assertion is the href AND the other project's absence. —
  (`apps/web/test/my-work-sheet-in-place.test.tsx`)
- **13.1395** ✅ **CLOSING THE SHEET IS THE PARAM'S REMOVAL, and it stays on My Work**: one push, to
  `/w/:ws/my-work` with no param and `{ scroll: false }` — not to the project page, which is where a
  close would have to go if the sheet were living somewhere else. **Mutation:** making `onClose` a no-op
  reddens here. —
  (`apps/web/test/my-work-sheet-in-place.test.tsx`)
- **13.1396** ✅ **THE OPEN TICKET'S FILES ARE KEYED PER TICKET.** Swapping `?ticket=` in place — which
  on this page happens without leaving the page, because the sheet's parent chip does exactly that —
  re-asks `getTicketAttachments` per id, draws the second ticket's file and **not** the first's. The
  measured half is the read count (`[<first>, <second>]`), because a DOM that happened to lose the old
  entry could also be an accident of timing. **Mutation:** keying the read on a constant
  (`'attachments'` instead of `` `${id}:attachments` ``) reddens here. —
  (`apps/web/test/my-work-sheet-in-place.test.tsx`)
- **13.1397** ✅ **THE SHEET'S `Subtask of {parent}` CHIP OPENS THE PARENT HERE.** The chip is a BUTTON
  only because this mount passes `onOpenTicket` — with none, the sheet renders the plain pill — so "the
  chip is a control" is itself the assertion that the prop is wired, and the parent, which is in no
  section of this page's view, is then placed by the locator with its crumb carrying the located
  project. **Mutation:** dropping `onOpenTicket` from the mount reddens here. —
  (`apps/web/test/my-work-sheet-in-place.test.tsx`)
- **13.1398** ✅ **THE ATTENTION STRIP'S ROWS OPEN HERE TOO, WITHOUT ASKING THE SERVER.** The strip is
  mounted on this page and shares its `openTicket`, and its rows carry a `projectId`, so a click is
  placed from data already in hand. The assertion is the locator NEVER being asked — with a locator
  fixture that answers `null`, a resolver that had to ask would open nothing. **Mutation:** removing the
  attention-row lookup reddens here. —
  (`apps/web/test/my-work-sheet-in-place.test.tsx`)
- **13.1399** ✅ **AN ENDED SESSION MOUNTS NO SHEET.** With both reads answering 401 and `?ticket=` set,
  the page draws the expired-session notice, mounts no dialog, and **asks nobody where the ticket is** —
  the page's own `!expired` term, which is new code on this mount and would otherwise fire a locate at a
  server that answers 401, painting an error about the wrong thing over the message that matters.
  **Post-commit mutation (measured):** dropping the `expired` term at BOTH sites — the effect's guard
  and the mount gate — reddens exactly here. —
  (`apps/web/test/my-work-sheet-in-place.test.tsx`)
- **13.1400** ✅ **A DELETION MADE FROM MY WORK LEAVES THE VIEW.** The sheet's footer Delete is driven
  for real (two presses since E2-35), the `ticket.deleted` is committed, and then BOTH of the page's
  reads are re-asked — the correction must not depend on the workspace stream, which is the defect the
  project page's own handler records. **Mutation:** emptying `onDeleted` reddens here. —
  (`apps/web/test/my-work-sheet-in-place.test.tsx`)
- **13.1401** ❌ **OWED: a deletion made from My Work offers no toast and no Undo.** The project page's
  deletion narration is a one-slot toast plus a durable-undo strip built on that page's own state
  (`p/[projectId]/page.tsx:540`), and this task explicitly excludes extracting that machinery; an Undo
  offered by a page that does not hold the ticket's project is a control the page could not honour. So
  the row leaves the view and nothing is promised — which is honest but is a capability gap on a new
  surface, recorded rather than left to be discovered. —
  (no test file; the gap is the absence of one)

## The board's workflow group is a disclosure (owner request, 2026-09-23) — ids `13.1406`–`13.1420`

Owner: *"in the board, the workflow is collapsible. if the workflow has no tickets in it, it is shown
collapsed by default."* Cases live in `packages/app-core/test/views/board-workflow-collapse.test.tsx`;
the control's CSS is pinned by `13.1418` in that same file, which reads `packages/ui/src/ui.css`.

**⚠ THE REQUEST'S PREMISE WAS FALSE, AND THAT IS THE FIRST THING THIS SECTION RECORDS.** The sentence
above reads as though the group were already collapsible and only its default needed changing. Measured
at the commit the branch is cut from (`45091f08`), it was neither: `board.tsx` rendered a bare
`<h2 class="gn-board__workflow">`, only where a board had MORE THAN ONE workflow group, and the columns
below it always rendered. So this block bought a new control, a new default AND a new store — not a
default change.

**TWO OWNER RULINGS ARRIVED MID-FLIGHT AND BOTH MOVED THE WORK.** They are recorded here because the
cases answer to them rather than to the original brief:

1. **Single workflow → UNCOLLAPSED, including when empty.** *"A lone workflow group starts expanded,
   including when it is empty… The group is still collapsible — the control exists and the person may
   collapse it by hand. Only the DEFAULT is pinned here."* Whether a lone workflow grew a heading was
   left to the implementer **provided it ended up with something to click**, so the heading's old
   `groups.length > 1` gate is GONE and every group is named and collapsible (`13.1412`, `13.1420`).
2. **The choice PERSISTS — first as a server preference, then corrected to `localStorage`.**
   *"by persist i didnt mean to database/server. only on the local storage, clientside."* The first
   reading sent the work at `ProjectViewPrefs` and the server-owned `.strict()` document; that was
   backed out unstarted, and `packages/app-core/src/preferences/workflow-collapse.ts` is the store,
   following `new-ticket-start.ts`'s shape (keyed by user, `''` reads and writes nothing, `try`/`catch`
   around the accessor AND the parse, a default that survives every failure).
3. **A collapsed group that stops being empty AUTO-EXPANDS, and that expansion persists** (`13.1415`),
   while a collapse a PERSON made is never undone by it (`13.1416`).

**THE STORED SHAPE, AND WHY IT IS NOT THE OBVIOUS ONE.** The record holds ONLY the groups a person
chose — `{userId, projects: {<projectId>: {"<workflowId>@<version>": boolean}}}`, `true` expanded,
`false` collapsed. A group with NO entry has no choice recorded and its state is derived from the group
itself. That absence is the whole reason the auto-expand rule is safe: it fires only for a group that is
collapsed *by the default* (absent) and never for one collapsed *deliberately* (`false`), which is the
distinction the owner asked to be answered explicitly rather than papered over. Keying is by user (a
shared laptop must not inherit the previous person's collapse) AND by project (two projects can hold the
same workflow at the same version, so a user-only key would share one collapsed set between two boards).

- **13.1406** ✅ **EVERY GROUP HEADING IS A DISCLOSURE BUTTON CARRYING `aria-expanded`.** The tag is
  asserted, not only the attribute: a `div` with a click handler would carry `aria-expanded` and still
  not be a control. The button lives INSIDE the `<h2>` (the WAI-ARIA disclosure pattern), which is why
  `heading-outline.test.ts` still counts exactly one heading of this family in the file.
- **13.1407** ✅ **AN EMPTY GROUP STARTS COLLAPSED** — its rail carries `hidden` and its columns are gone
  from the accessibility tree. The control arm is the sibling non-empty group, read through the SAME
  `queryByRole('region', …)` in the same case, so a query that simply never matched cannot read as a pass.
- **13.1408** ✅ **A NON-EMPTY GROUP STARTS EXPANDED**, both groups of a two-workflow board, both
  directions of the same query — so "everything is visible" cannot be satisfied by a `hidden` attribute
  that is never written at all.
- **13.1409** ✅ **COLLAPSED HIDES THE COLUMNS, NOT MERELY THE CARDS.** The per-column `Add a ticket`
  count goes 3 → 1 across the collapse, and the survivor is asserted to live in the SIBLING's rail. The
  load-bearing probe is a button ROLE query: this environment measures `getAllByText` as still finding
  text inside a `hidden` subtree, so a case counting `EMPTY_COLUMN_COPY` would pass over a collapsed
  group (recorded at the assertion itself rather than left as an unwritten trap).
- **13.1410** ✅ **A PERSON CAN COLLAPSE A NON-EMPTY GROUP**, and its card goes with it: `listitem` count
  2 → 1, with the surviving column and the sibling rail asserted untouched.
- **13.1411** ✅ **THE DISCLOSURE IS KEYBOARD-REACHABLE AND -OPERABLE.** Tabbing reaches it (a bounded
  loop stopping on success, so the button is not pinned to a tab index) and Enter then Space each flip it.
- **13.1412** ✅ **A LONE WORKFLOW GETS A HEADING AND A WORKING TOGGLE** — the widened half of the
  ruling. The heading did not render at all for one group before this branch.
- **13.1413** ✅ **A LONE EMPTY WORKFLOW STILL SHOWS SOMETHING TO ACT ON** (two arms). The trap the
  ruling names: an empty group collapsed by default on a single-workflow board would hide the columns,
  their `Add a ticket` and the board's own sentence — every door off the page. The second arm holds the
  other half of the ruling apart from the first: the person MAY collapse it by hand, and then the
  heading and the sentence are what remain, by their own choice.
- **13.1414** ✅ **THE CHOICE IS REMEMBERED, PER USER AND PER PROJECT** (four arms). Survives a real
  unmount/remount with the record read back WHOLE (the user id is what the key's shape is for); another
  user's record is refused *with the control that the same bytes DO answer for the user they name*;
  another project's record is refused the same way; and a record this build does not recognise — a
  `"yes"` for a boolean — answers the default, while a signed-out board (`''`, the shell's sentinel)
  writes nothing at all.
- **13.1415** ✅ **A GROUP NOBODY COLLAPSED REVEALS NEW WORK** (two arms). A card arriving in an
  empty-default collapsed group opens it AND writes the expansion through, so a reload cannot put the new
  work back behind a heading. **The second arm counts WRITES** — the owner named this hazard by name
  (*"the board re-reads on every stream frame — a naive effect here is a write storm"*) — asserting that
  mounting writes nothing, the one transition writes once, and four re-reads of the same board (the same
  object twice, then a fresh but EQUAL one twice) write nothing more. ⚠ The instrument is
  `vi.spyOn(Storage.prototype, 'setItem')`: the instance-level forms record **0** calls while the write
  succeeds, so a case built on either would report "no write storm" over any number of writes.
- **13.1416** ✅ **A COLLAPSE THE PERSON MADE IS NOT UNDONE BY AN ARRIVAL** (two arms, the second added
  after a mutation round — see below). The group stays collapsed and the STORE IS UNCHANGED, asserted by
  comparing the whole record before and after, so the refusal to reopen is a refusal to WRITE rather than
  a write the render ignored. **The second arm is the one that actually reaches the stored shape's
  distinction:** collapse a group by hand, move its last ticket OUT — the group is now collapsed by the
  DEFAULT as well, which arms the auto-expand rule's transition guard — then move a ticket back IN. Both
  of the rule's other terms point at reopening it, so only the `false` the shape remembers keeps it shut.
  A board reaches that sequence in ordinary use; the first arm alone could not see the term at all.
- **13.1417** ✅ **THE CARET IS DRAWN, NEVER TYPED.** Each toggle's `textContent` is exactly the workflow
  name and no `▸`/`▾` appears anywhere on the board, so the accessible name cannot pick up a direction
  glyph — the defect `.gn-list__columns-caret`'s own rule exists to avoid.
- **13.1418** ✅ **THE ATTRIBUTES THE STYLESHEET KEYS ON ARE THE ONES THE COMPONENT WRITES.** Reads
  `[aria-expanded]` and `[hidden]` out of the `.gn-board__workflow*`/`.gn-board__rail*` rules (comments
  stripped first) and requires the rendered board to write both — the two halves `13.671` gave the List's
  tray. It also carries the extractor's own positive control, and it is the reason
  `.gn-board__rail[hidden]` exists in `ui.css`: the rail is `display: flex`, so without that rule the
  attribute would be decorative and the group visibly open.
- **13.1419** ✅ **THE HOOK-OWNING PATH COLLAPSES WITH THE SAME RULES.** With `moves` wired,
  `BoardGroupWithMoves` forwards the state one level down to `BoardGroupSection`; a prop added on the
  plain path and forgotten on this one would leave the two boards disagreeing with every read-only case
  above still green.
- **13.1420** ✅ **A LONE GROUP RESTS EXPANDED EVEN WHEN EMPTY.** The default, asserted separately from
  `13.1412`'s control (which proves the toggle exists and works, so this cannot pass by virtue of a board
  that never collapsed anything) — and with its own control in the same case: the identical fixture with
  a SECOND group added IS collapsed by the empty-group rule.

**Mutation witnesses — MEASURED, not predicted.** Each was applied to the committed tree, run against
`board-workflow-collapse.test.tsx`, and restored from the commit afterwards (`19–20` tests in the file, so
the "passed" column is what stayed green). ⚠ **An earlier draft of this block carried PREDICTIONS written
before the runs, and two of them were WRONG** — they are corrected here rather than quietly dropped,
because a mutation table nobody re-measured is the "a check that cannot fail" shape one level up:

| mutation | reddened |
|---|---|
| `defaultCollapsed`'s `groups.length > 1` term dropped | `13.1413`, `13.1420` (3 failed) |
| `groupIsEmpty` → `return false` | `13.1406`, `13.1407`, `13.1409`, `13.1414`, `13.1415`, `13.1419`, `13.1420` (11 failed) |
| the rail's `hidden` attribute never written | `13.1407`, `13.1409`, `13.1410`, `13.1411`, `13.1412`, `13.1413`, `13.1414`, `13.1415`, `13.1416`, `13.1418`, `13.1419`, `13.1420` (14 failed) |
| `aria-expanded` pinned to `true` | `13.1406`, `13.1410`, `13.1411`, `13.1416` (4 failed) |
| the auto-expand effect's `previous` guard dropped | `13.1414`, `13.1415`, `13.1416` (6 failed) |
| the toggle's write-through removed | `13.1414`, `13.1416` (2 failed) |
| `readWorkflowCollapse` ignores the stored user id | `13.1414` (1 failed) |
| the caret typed into the button's text node | `13.1417` (1 failed) |
| the toggle's `type="button"` changed | `13.1406` (1 failed) |
| the toggle's `aria-controls` removed | `13.1406` (1 failed) |
| `.gn-board__rail[hidden]` deleted from `ui.css` | `13.1418` (1 failed) |
| the caret's `content` glyphs replaced with `none` | `13.1418` (1 failed) |

**Three more mutations, run after the checkpoint, one of which found a real defect in a case:**

| mutation | reddened |
|---|---|
| `defaultCollapsed`'s `groupIsEmpty` term dropped (every group on a multi-workflow board collapsed) | `13.1406`, `13.1407`, `13.1408`, `13.1410`, `13.1411`, `13.1414`, `13.1415`, `13.1416`, `13.1418`, `13.1419` (10 failed) |
| the rail's `id` made to disagree with its `aria-controls` | `13.1406` (1 failed) |
| the auto-expand effect's `Object.hasOwn(groupChoices, key)` term removed | `13.1416` (1 failed) — **but only after the case was strengthened; see below** |

**⚠ THE LAST MUTATION SURVIVED FIRST TIME, AND THAT IS THE ROUND'S REAL FINDING.** Dropping the
`Object.hasOwn(groupChoices, key)` term — the term that stops the auto-expand rule undoing a person's own
collapse — left the whole file **20/20 GREEN**. `13.1416` as written could not see it, and the reason is
structural rather than incidental: its fixture never lets the group become EMPTY, so the group never
becomes *collapsed by the default* either, the rule's `previous` transition guard alone keeps it shut, and
the term the case was supposed to witness is **never reached**. The case was asserting the right property
about a scenario in which the property is not load-bearing — a control that cannot fail, one level up from
the kind this file already guards against.

The fix is a second arm on `13.1416` and the only sequence where the term decides anything — a sequence an
ordinary board reaches: **collapse a group by hand → move its last ticket out (it is now ALSO collapsed by
the default, so the guard is armed) → move a ticket back in.** Both of the rule's other terms point at
reopening it; the stored `false` is the only thing that stops it. Re-run against the strengthened case:
**1 failed / 20 passed, `13.1416` — KILLED.**

**EVERY CASE IN THE BLOCK NOW HAS AT LEAST ONE KILLER, measured rather than intended**: `13.1406` (four
mutations), `13.1407` (three), `13.1408` (one, from the `groupIsEmpty`-term mutation — it is the control arm
of `13.1407` and true both before and after the feature, so it needs a mutation that INVERTS the default
rather than removes it), `13.1409` (three), `13.1410` (three), `13.1411` (three), `13.1412` (one),
`13.1413` (one), `13.1414` (five), `13.1415` (four), `13.1416` (five), `13.1417` (one), `13.1418` (three),
`13.1419` (two), `13.1420` (two).

**`13.1408` HAD no killer in the first twelve and now has one, which is why the second table carries a
third row.** It is the control arm of `13.1407` and is true both before and after the feature, so no
mutation that REMOVES the default can redden it — only one that INVERTS it for a group that is not empty,
which is what `default-ignores-emptiness` does. Recorded rather than passed over, because "this case is
true either way" is exactly the shape a reviewer should expect to find a witness for, not to be told about.

**One case elsewhere was AMENDED, and the amendment is a behaviour change rather than a repair.**
`apps/web/test/board-narrowing.test.tsx` `13.469` asserted that a one-workflow board renders NO level-2
heading, using that absence as a cross-confirmation that its fixture carries one workflow. The heading
now renders for a lone workflow by design, so the witness was replaced with a stronger one — exactly ONE
group heading, naming that workflow — rather than deleted; the fact the line exists for is unchanged.

## 13.1451–13.1466 — board card badges: priority icon + tint, parent-key badge, epic chip (owner request, 2026-09-23)

Block `13.1451`–`13.1470` (`13-hig-per-screen.md`'s allocation table has the row). `BoardTicketCard`
(`packages/domain/src/read-models.ts`) gains `parent`/`epic`, each `null` unless BOTH visible and
composable — no existence leak, the same rule `ListCard.epicId` already applies one ancestor further up,
widened here to the immediate parent too. The server derives both from ONE recursive walk
(`apps/server/src/read/ancestry.ts`'s `boardAncestryFor`, sharing `epicAncestors`' own `ancestryCte` —
`epicAncestors` itself MOVED here verbatim from `routes/list.ts`, behaviour unchanged, pinned by its own
case below); the offline replica mirrors it with a DELETED-safe walk of its own
(`replica-data-source.ts`'s `boardHierarchyOf`) since `confirmedById`'s `byId` deliberately keeps a
deleted ticket reachable for the LIST's own reasons. The priority badge draws a hand-drawn 24×24 glyph per
level (fire/leaf/snowflake, `packages/ui/src/icons/priority-icons.tsx`) and the card's own surface is
tinted by it — a scoped, owner-authorised reopening of the standing refusal against a general
danger/success wash on record at `.gn-visibility__standing-mode` (`ui.css`), new roles named for this
feature only. Supersedes `13.1237`–`13.1238` (only P1 took the tone) and `13.1281` (the keys row was
conditional on key/due alone) in place — same ids, `packages/app-core/test/views/board.test.tsx`.

- **13.1451** ✅ Every priority level renders its own icon (an `<svg>` as the badge's first child,
  `aria-hidden`) and its own `--p1`/`--p2`/`--p3` modifier class, never another level's — and each of the
  four icon components is a real 24×24 `currentColor` `aria-hidden` SVG with a `size` override. —
  (`packages/app-core/test/views/board.test.tsx`, `packages/ui/test/priority-icons.test.tsx`)
- **13.1452** ✅ The CARD itself (not only the badge) carries `gn-board-card--p1`/`--p2`/`--p3`, each
  level distinct — the card's OWN tint modifier, separate from the badge's. —
  (`packages/app-core/test/views/board.test.tsx`)
- **13.1453** ✅ For all three priorities, all three styles and both themes: the priority ink, the card's
  `text`/`textMuted`, and the move-arrows' ghost button (`textAccent` on `fillTertiary`, itself composited
  over the SAME wash) all clear WCAG AA 4.5:1 on `over(tint, surfaceRaised)` — with the anti-vacuous
  control that the wash actually changes the ground. — (`packages/ui/test/tokens.test.ts`)
- **13.1454**–**13.1455** ✅ The parent-key badge is the meta-line's first child (left of the card's own
  key) and clicking it — `getByRole('button', {name: 'Open parent OPS-12'})` — calls `onOpenTicket` with
  the PARENT's id exactly once. — (`packages/app-core/test/views/board-card-click.test.tsx`)
- **13.1456**–**13.1457** ✅ The epic chip is the card's first element child (above the title) and
  clicking it opens the EPIC once; a card with `epic: null` renders no chip at all and the title button
  is the card's first child instead. — (`packages/app-core/test/views/board-card-click.test.tsx`)
- **13.1458**–**13.1459** ✅ When the immediate parent IS the epic, no parent badge renders and the epic
  chip alone names it; the control — a grandchild whose parent and epic differ — renders BOTH. —
  (`packages/app-core/test/views/board-card-click.test.tsx`)
- **13.1460** ✅ `boardAncestryFor` returns the SAME ticket as both `parent` and `epic` for a direct
  child of the epic, and two DIFFERENT tickets for a grandchild; `epicAncestors` (moved, unchanged) still
  finds the epic by name and title; `keysForAncestors` composes the derived `CCRE-<n>` key and
  de-duplicates one ancestor shared by two cards to one lookup; the live HTTP response carries both
  fields, keyed, for a real seeded hierarchy, and the epic's own card (a root, and its own nearest
  ancestor-or-self) gets `parent: null` with `epic` naming itself. —
  (`apps/server/test/read/ancestry.test.ts`, `apps/server/test/routes/board.test.ts`)
- **13.1461** ✅ CORRECTED (controller mutation, 2026-09-23 — the first version PASSED with `AND
  ${visible}` deleted from `ancestryCte`'s recursive term, because its child had no `visibility.set` of
  its own and so INHERITED its hidden parent's audience, making the anchor exclude the row before the
  recursive step ever ran). Rebuilt on `list.test.ts`'s own 7.80 shape: a child under an explicit-owner-
  only parent, given its OWN `visibility.set` naming owner AND member — so the member CAN see the child
  (asserted FIRST via the independent `canSee` oracle, not `boardAncestryFor` itself) but gets `parent:
  null`, because the walk climbs into the parent and the parent is where it is stopped. CONTROL — the
  owner, who may see the parent too, gets it named. Re-run against the controller's exact mutation:
  RED (both this case and 13.1463 failed); restored from the committed tree, GREEN again. —
  (`apps/server/test/read/ancestry.test.ts`)
- **13.1462** ✅ A soft-deleted immediate parent is not named, even to the OWNER who could otherwise see
  it — `LIVE_TICKET_WHERE` on the recursive term stops the walk exactly as an invisible link does; killed
  by a planted mutation dropping that conjunct (measured: 1 failed, restored to green). —
  (`apps/server/test/read/ancestry.test.ts`)
- **13.1463** ✅ CORRECTED, the SAME defect and the SAME fix shape as 13.1461. Builds the real three-level
  case: an epic (root) → a hidden middle ticket (explicit: owner only, child of the epic) → a visible
  grandchild (its OWN `visibility.set` naming owner and member, child of the hidden middle ticket). The
  member CAN see the grandchild (independent `canSee` control, first) but gets `epic: null`, because the
  walk must climb THROUGH the hidden middle ticket to reach the epic and is stopped there. CONTROL — the
  owner, who may see every hop, gets the real epic. Re-run against the controller's exact mutation: RED;
  restored, GREEN. —
  (`apps/server/test/read/ancestry.test.ts`)
- **13.1464** ✅ `mapBoardCard` carries a real `parent`/`epic` object whole (key included, and a `key:
  null` on a real object survives); a MISSING `parent`/`epic` key throws `MappingError` naming the path,
  and a `parent` object missing its own `ticketId` throws naming the nested path — an absent field is not
  this shape's spelling of `null`. — (`packages/app-core/test/online/mappers.test.ts`)
- **13.1465** ✅ Offline: a direct child of the epic gets the epic as BOTH `parent` and `epic` (key
  `null` on both, honestly — the replica cannot compose one); a grandchild's `parent`/`epic` differ, with
  the epic's TITLE still resolving from the local ledger; a root ticket gets `null` for both. —
  (`packages/app-core/test/replica/replica-data-source.test.ts`)
- **13.1466** ✅ Offline, DELETED-safe: a soft-deleted immediate parent is not named even though the
  replica still holds the ticket, and an epic reachable only by walking THROUGH a deleted hop is not
  named either — both killed by a planted mutation dropping the offline `isLive` check (measured: 2
  failed, restored to green). — (`packages/app-core/test/replica/replica-data-source.test.ts`)

`13.1467`–`13.1470` are unspent, held for a future round on this feature rather than borrowed elsewhere.

**Regression, measured rather than assumed:** the full `apps/server` suite (1919 passed, 7 skipped), the
full `packages/app-core` suite (2038 passed, including the pre-existing board suites — `board.test.tsx`,
`board-workflow-collapse.test.tsx` (the `13.1409` collapse block), `board-filter.test.ts`), the full
`packages/ui` suite (455 passed) and the full `apps/web` suite (838 passed) were each run green AFTER this
block, under Node v22.23.2.
