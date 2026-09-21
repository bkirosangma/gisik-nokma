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
- **13.591** ✅ New tickets are born in the backlog, with one exception (backlog/closed spec §5.4,
  2026-09-17) — `NewTicketDialog` states "Starts in the backlog" under the title field, UNCONDITIONALLY.
  `NewTicketDraft` gains a REQUIRED `start: 'backlog' | 'focus'` (never optional here, even though the
  wire's `ticketCreatedPayload.start` is optional and an absent value means focus for events written
  before the field existed — a rule about legacy compatibility, not about what a client built after the
  field exists is allowed to leave out). With NO parent chosen, no checkbox renders and the draft leaves
  with `start: 'backlog'`. Choosing an IN-FOCUS parent (`parentCandidates` now carry `inFocus: boolean`
  beside `id`/`title`, a claim the CALLER computes — this component derives nothing from a candidate's own
  state) renders a **"Start in focus"** checkbox, CHECKED BY DEFAULT, and the draft leaves with
  `start: 'focus'`; unticking it flips the SAME draft to `'backlog'` without touching the chosen parent.
  Choosing a BACKLOG parent (`inFocus: false`) renders no checkbox at all and the draft stays `'backlog'`
  — the checkbox's visibility (`startCheckboxVisible`) and the draft's `start` both read the SAME
  `chosenParent`/`noUsableParent` values computed once, so a checkbox can never be on screen while the
  payload it claims to set is about to leave as `'backlog'` anyway, or absent while a `'focus'` claim
  leaves with nothing on screen to explain it —
  (`packages/app-core/test/views/new-ticket-dialog.test.tsx`)
- **13.591f** ✅ The `inFocus` derivation itself, at its ONE real-data call site (`page.tsx`'s
  `inFocus: row.stateId !== BACKLOG_STATE_ID && row.closed === null`) — nothing in `packages/app-core`
  can witness this, since every case there PASSES `inFocus` in as a literal fixture value; a wrong `!==`
  or a dropped `row.closed === null` half would ship with 13.591a–e and every other gate reporting green.
  Three list rows differing only in the two facts the formula reads: a BACKLOG row (`stateId: 'backlog'`,
  never closed), a plain ACTIVE row (neither backlog nor closed), and a CLOSED terminal row (not backlog,
  but closed). Only the ACTIVE row's pick renders the "Start in focus" checkbox; the BACKLOG and CLOSED
  picks both render none. Mutation 1 (`row.closed === null` → `row.closed !== null`, `cp`/`sha256sum`
  restore): kills exactly this case, on the CLOSED-row assertion (`PASS (9) FAIL (1)`). Mutation 2
  (`row.stateId !== BACKLOG_STATE_ID` → `===`, same restore method): kills exactly this case again, on the
  BACKLOG-row assertion — the two mutations redden the SAME case at two DIFFERENT assertions, proving both
  halves of the formula are load-bearing and neither alone would catch the other's defect —
  (`apps/web/test/project-create-gate.test.tsx`)
- **13.592** ✅ `CreateTicketFlow.create` never leaves `start` off the `ticket.created` payload it builds
  (backlog/closed spec §1.3), whatever the draft's own value: a create with no parent sends
  `payload.start: 'backlog'`, and choosing an in-focus parent with the checkbox left checked sends
  `payload.start: 'focus'` — proving the value travels from the DRAFT rather than a hardcoded constant.
  The load-bearing assertion is `Object.keys(payload)` containing `'start'`, not a value comparison: a
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
- **13.591g** ✅ Fix round 1, Ruling 40 (coordinator, 2026-09-17; review Finding 3) — "checked by default"
  (spec §5.4) is a promise PER CHOSEN PARENT, not a one-time initial value for the whole dialog session.
  Unticking "Start in focus" for one in-focus parent, then switching to a DIFFERENT in-focus parent,
  renders the new parent's checkbox CHECKED (not inheriting the previous parent's untick) — the Parent
  picker's own `onChange` now resets `startInFocus` to `true` on every selection. Mutation (dropping that
  reset, `cp`/`sha256sum` restore): kills exactly this case, on the "checkbox B is checked" assertion
  (`PASS (11) FAIL (1)`). Named `g` rather than the coordinator's literal `13.591a` — that id already
  covers this file's own "states the note unconditionally" case, a different, already-cited behaviour;
  continuing the block's own lettering avoids one checkmark covering two unrelated assertions —
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

- ✅ **13.659 — `Group by` keeps its accessible name and exactly its five keys.** The chip tray and the
  picker are the two things a restyle silently rewrites, so the picker is asserted twice over: the
  `aria-label` attribute verbatim (`Group by`) and the panel offering `epic/status/assignee/type/flat`
  and **no sixth key** — the negative half is the one a `toEqual` over five names cannot make, because it
  is the half that catches a key quietly grown to six. Measured and recorded, not "fixed": the COMPUTED
  accessible name is `epic Group by`, since React Aria composes `aria-labelledby` from the value and the
  label and that wins over the explicit `aria-label`. Pre-existing, and the constraint pins the attribute.
  (`packages/app-core/src/views/ticket-list.tsx`)

- ✅ **13.660 — the tray renders five chips, each with its own accessible name and checked state.**
  `Status/Assignee/Due date/Type/Progress` as five real checkboxes, checked exactly where the preferences
  say, so "five chips" is a count of CONTROLS and not of decorated spans. The CONTROL arm asserts both
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
  arm collapses a parent under `epic` grouping and asserts the band still reads `epic · 2 tickets` while
  the table shows one row; it is the only fixture arrangement where the two numbers differ (`status` puts
  the parent and child in different sections so they never nest, and `flat` has no band), and the same
  mutation now reddens exactly that case with `epic · 1 ticket`. **A DECLARED DIVERGENCE rides with it:**
  the prototype counts a group’s CHILDREN (`const n = g.items.length`, `:2920`, held separately from
  `g.epic` at `:2904`), so for the same two rendered rows it prints `1 ticket` where this prints
  `2 tickets` — because here the epic IS a row (`list-model.ts`, `nestRows`) and the band answers for its
  section the way the summary answers for the project. An earlier revision of this bullet cited a
  prototype expression that does not exist; the measured behaviour is what is recorded now.

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
