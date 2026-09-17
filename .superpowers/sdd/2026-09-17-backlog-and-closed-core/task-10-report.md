# Task 10 report — Backlog tab, per-row Start, `TicketList` rowAction/emptyCopy/Closed chip

## Status: DONE

## Files touched

Modified:
- `packages/app-core/src/views/ticket-list.tsx` — `rowAction?`, `emptyCopy?` props on `TicketListProps`; threaded into both `ListTable` mounts (pinned + sections); `Closed` chip beside the state chip.
- `packages/ui/src/ui.css` — `.gn-row-action` alias of `.gn-board-card__close` (identical declarations, one rule body).
- `apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx` — `view` union gains `'backlog'`; tab rail gains `['backlog', 'Backlog']` FIRST; `TAB_NOUN.backlog`; the disclosure-strip `narrowing` ternary gets an explicit `backlog` branch (the docblock above it, which predicted exactly this hazard for a ternary vs. `TAB_NOUN`'s `Record`, is updated to say it materialized); `backlogNarrowing`, `backlogWorkflowIds`, `backlogWorkflowDefs`; the Backlog tab's render arm.
- `apps/web/test/project-calendar-timeline.test.tsx` — cases 11.160/13.430 updated for 5 tabs (Backlog first, Board still the default selection); every other case in the file addresses tabs by name and needed no change. **Not in the brief's file list** — required collateral: these two hard-coded the old 4-tab array by fixed position, and the task's own gate ("apps/web ... whole suite" green) cannot be met without fixing them; explained in both this report and inline docblocks.
- `test-cases/13-deployment-dogfooding.md` — cases 13.594–13.597 appended.
- `Features.md` — new bullet "Backlog tab with Start" inserted after Task 9's bullet (§3). No existing bullet claimed "four tabs" (checked; only the two test-file assertions above did), so nothing else needed updating.
- `packages/app-core/test/views/ticket-list.test.tsx` — `ControlledList` gains an optional `rowAction` passthrough; new describe blocks for 13.596/13.597.

Created:
- `apps/web/src/backlog-start.ts` — `startTargetFor(row, types, defs)` (Ruling 42).
- `apps/web/src/backlog-start-button.tsx` — `BacklogStartButton` (Ruling 41).
- `apps/web/test/backlog-start.test.ts` — unit tests for `startTargetFor` (13.595, unit half).
- `apps/web/test/backlog-tab.test.tsx` — 13.594/13.595/13.596 end-to-end.

## Decisions / deviations from the brief, and why

1. **Ruling 41 followed literally: no dialog, no `MoveArrows` extraction.** `BacklogStartButton` submits `ticket.transitioned {to}` directly through `dataSource.ingest`, mirroring `board.tsx`'s `submitDirect` idiom (latch in `finally`, refused/invalid → `gn-refusal--server`, silent/rejected → `gn-refusal--transport`, never the word "Refused" in the transport copy).
2. **`currentUserId` added to `BacklogStartButtonProps`, beyond Ruling 42's literal `{row, toStateId, dataSource, workspaceId, onStarted}` list.** `makeSubmittedFactory` needs an `actorId`; nothing else in that list supplies one. The whole `rowAction` capability is gated on `session.kind === 'signed-in'` in `page.tsx` (mirroring the board's own `moves` gate, case 3.144 — "the write door is never offered an empty actor"), so a signed-out or loading viewer sees no trailing column at all rather than a Start button with a blank actor.
3. **`startTargetFor` split into two steps**, not the ruling's one-liner (`defs.get(types.find(...)?.workflowId)?.initialStateId ?? null`) — that literal spelling does not typecheck under strict mode (`Map.get` takes `string`, not `string | undefined`). Same three outcomes, unit-tested.
4. **`emptyCopy` defaults to ABSENCE, not a sentence.** Measured (not assumed) that `TicketList` rendered nothing at all for a zero-row set before this task. A component-owned default sentence was considered and rejected: `rows.length === 0` is ambiguous between "the project has none" and "a filter hid them all" (the same ambiguity `listNarrowing`'s own docblock and Ruling 19's `isNarrowed` name), and only a caller holding narrowing context can tell them apart. So the List tab passes nothing (byte-identical to before); only the Backlog tab passes its sentence. Answering the brief's own question directly: **no existing empty copy existed to "keep" — the default is absence, which is what the List renders today.**
5. **`.gn-row-action` added as an alias of `.gn-board-card__close`**, one shared rule body (not a copy) — `.gn-board-card__close` names a component this button is not part of (a `TicketList` table row, not a board card).
6. **`project-calendar-timeline.test.tsx` updated** (see Files touched) — required to keep the whole apps/web suite green; not in the brief's file list but a direct, mechanical consequence of adding a tab.
7. **`Closed` chip is BESIDE the state chip, never replacing it** — `closed` and `stateId` are independent facts (spec §1.2: a ticket keeps the state it was closed from).
8. **RECORDED, NOT FIXED** (in `backlogNarrowing`'s own docblock): "Only tickets in progress" filters backlog rows (category `open`) out of `list.rows` entirely server-side, so with that toggle on the Backlog tab reads "Nothing in the backlog" even when the project holds plenty, and nothing on screen says the toggle is why. Out of this task's scope; named for whoever next touches that toggle.

## Verification (Node v22.23.2 throughout)

- `packages/app-core` ticket-list.test.tsx: RED confirmed first (3 failing / 40 passing against the old component), then GREEN (43/43) after implementation.
- `packages/app-core` full suite: **1418/1418 passed, 90 files.**
- `packages/app-core` typecheck: `tsc --noEmit` EXIT=0.
- `packages/app-core` build: EXIT=0 (dist rebuilt before touching apps/web).
- `packages/ui` full suite (touched `ui.css`): **315/315 passed, 5 files** — token-discipline scan included.
- `apps/web` typecheck: `tsc --noEmit` EXIT=0 (checked twice, before and after the final edits).
- `apps/web` production build (`next build`): succeeded, all 23 routes.
- `apps/web` full suite: **413/413 passed, 42 files** (checked twice: once mid-work, once after the mutation-test restore).
- Mutation: `apps/web/src/backlog-start-button.tsx` — `payload: { to: toStateId }` → `payload: { to: row.stateId }`. Backed up with `cp`, restored with `cp`, confirmed with `sha256sum` match. Result: `PASS (3) FAIL (1)` of `backlog-tab.test.tsx`'s 4 — the ONE failure is 13.595's ingest-payload assertion; no other case moved.
- `node scripts/check-case-ids.mjs`: EXIT=1, but the only duplicates are the pre-existing, explicitly-allowed `13.387`/`13.413` (dispatch-context.md) — neither is one of mine.
- `node scripts/check-case-citations.mjs`: EXIT=1; file 13's uncited set is **exactly `13.401`/`13.477`/`13.476`** (the pre-existing baseline-drift the task brief itself named, quoted verbatim above) — my four new ids (13.594–13.597) are all cited and add nothing to it. Other files' regressions (03, 10, 11, 15) predate this task and are untouched by it.

## Self-review (per the brief)

- List tab still shows backlog rows: yes (13.594 asserts both rows visible on List).
- Backlog tab shows only backlog rows: yes (13.594).
- Start never submits with a null target: double-guarded — `disabled={toStateId === null || submitting}` in the DOM, and `if (toStateId === null) return;` at the top of `start()`.
- The latch resets in `finally`: yes, unconditionally on `mountedRef.current`.
- The transport copy never says "Refused": confirmed by reading the two transport sentences ("The server did not answer this start.", "We could not reach the server for this start — …") and by 13.595's second test asserting `queryByText(/did not answer this start/)` is absent on the refusal path.
