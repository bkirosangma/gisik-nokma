# Plan 6a Task 9 — review findings (`e82a579`, `exec/06a-client-core`)

**This task had never been reviewed.** It finished after Lane 4's stop order and was committed
deliberately, labelled in three places. This is its one review, run 2026-08-31 by the serial executor
under the cost ruling: **one opus reviewer**, no fan-out, in the lane4 worktree (one agent, one tree,
so the shared-tree concurrency hazard does not arise).

**Fix status: NOT YET APPLIED.** Four Important findings warrant a fix round under the ruling ("fix
round only on an Important or worse"). Recorded here first because they existed only in a session's
context, and a restart at this boundary would have lost them.

## F1 · Important · the TZ helper does not restore — it switches the worker to GMT

`packages/app-core/test/views/board.test.tsx:231,243`. `unfoldUnder` claims to be a scoped zone swap:
`const original = process.env.TZ` … `finally { process.env.TZ = original; }`.

When `TZ` is **unset** — the default on this machine and in CI — `original` is `undefined`, and
`process.env.TZ = undefined` in Node assigns the **string** `"undefined"`, which ICU resolves to GMT.
The finally block does not restore; it corrupts. Every app-core file scheduled after
`board.test.tsx` in that worker then runs under UTC instead of the machine's zone.

**Why this is the top finding.** The corruption happens *only* when `TZ` is unset. Run a sweep with
`TZ=…` set and `original` is a real string and restore works — so the damage is present in exactly
the runs nobody inspects and absent from the runs that would catch it. It re-creates, one level down,
the "environment is a fixture" defect this very helper exists to close.

Evidence: a probe printed `{ tz: 'undefined', renders: '… GMT+0000' }`; a **separate** file read
`tz: 'undefined'` too, in the gate's default configuration, 3 runs of 3. Both probes deleted. No
assertion flips today, hence Important rather than Critical.

Fix shape: `if (original === undefined) delete process.env.TZ; else process.env.TZ = original;`

## F2 · Important · `useBoard` never refetches when `projectId` changes

`packages/app-core/src/views/use-live-query.ts:39-51`. `reload` is `useCallback(…, [])` so it is
referentially stable, and the effect's deps are `[source, workspaceId, debounceMs, reload]` — none of
which move when `projectId` does. `loadRef.current` is updated and nothing calls it. **The Board
serves the previous project's data as current**, self-correcting only if an unrelated stream frame
happens to arrive.

**UNCONSTRAINED PATH, not a mutation that never ran** — the reviewer added a failing test rather than
mutating source, and the other 27 tests in that run were green. No existing test varies `projectId`.
Evidence: rendered `prj_A`, flushed, rerendered `prj_B`, flushed → `expected [ 'prj_A' ] to deeply
equal [ 'prj_A', 'prj_B' ]`.

## F3 · Important · the "no HTTP in views" guard admits any allowed *prefix*, and misses most import forms

`board.test.tsx:291,338`. `ALLOWED_IMPORTS = /^(react|@gisik-nokma\/(ui|domain|rule-engine)|\.\.?\/)/`
has no boundary, so `react-router-dom`, `reactive-http-transport`, `@gisik-nokma/uix-evil` and
`@gisik-nokma/domain-hax` are all ALLOWED.

**UNCONSTRAINED PATH**, and distinguished from mutation-never-ran by a sibling kill in the same file
and same run: a planted `fetch(` **was** caught while a planted
`import type { Something } from 'react-router-dom'` passed clean. That kill is the positive control
proving the scan read the mutated file.

Further gaps in the same guard, probed without mutating: `importsOf` only matches `from '…'`, so
`await import('https://evil/x.js')`, `require('axios')` and side-effect `import './x.js'` each return
`[]`; `networkTells` returns `[]` for `navigator.sendBeacon('/v1', d)` and for
`const f = globalThis.fetch; f(url)`; and `readdirSync(VIEWS_DIRECTORY)` is non-recursive, so a future
`src/views/<subdir>/` is scanned by nothing while `it('has views to scan at all')` stays green.

## F4 · Important · `Features.md` no longer merges with `main`

`git merge-tree --write-tree main HEAD` → `CONFLICT (content): Merge conflict in Features.md`.
`main`'s `6b2fc76` (Plan 3 Chain A) rewrote the **Local pre-check** bullet in §3 — the same lines T9
inserts its three new bullets beside. **`Features.md` is the only collision**: `packages/ui/src/ui.css`,
`packages/app-core/src/index.ts`, `test/setup.ts` and `src/views/` are untouched on `main`.
Owner: whoever folds this branch back — i.e. this executor, at the rebase.

## F5–F10 · Minor

- **F5** `docs/lanes/lane4-periphery-state.md:18` still says "gate 621" while line 37 says 658 — and
  `30e3db4` exists specifically to correct that number and fixed one of its two occurrences. The
  recorded "a replace that hit the first of two identical anchors" costume, in prose. Measured at
  HEAD: **658** (domain 230 · rule-engine 128 · server 143 · app-core 118 · ui 31 · sync-client 8).
  Line 18's "8 falsifiability proofs" against 11 `PLANTED DEFECT` labels is flagged ambiguous, not
  false. Owner: author of `30e3db4`.
- **F6** `use-live-query.ts:29-37` — overlapping reloads land out of order (no generation counter or
  abort; last resolver wins). On failure `setError` fires while `data` keeps its last successful
  value and `LiveQueryResult` exposes no staleness flag, so a consumer destructuring only `data`
  renders a cached snapshot as current with nothing saying so. Latent until a real transport lands.
- **F7** `board.tsx:97-101` — the reopen chip's text is a constant, not derived from `card.cause`, and
  drops `childTicketId`, so the card never says *which* child reopened it. Correct only while
  `TransitionCause` is a single-kind union. Features.md's "renders its `cause`" is generous: it
  renders the presence of one.
- **F8** `board.test.tsx:256-259` — `not.toContain('20 Aug')` is satisfied by `''`, which is what
  `unfoldUnder` returns if the selector or unfold click breaks. Siblings at `:248`/`:252` use `toBe`,
  and this test did fire against the M1 mutant, so it is structurally weak rather than vacuous.
- **F9** `board.tsx:89-95` — `BoardCard.title`/`.assignee` render as standing facts with no claimant,
  while `ListRow` carries `assignedProvenance`. The card's comment scopes the honesty contract to
  *state*, so this is the type's design. Owner: `view-types.ts` / T6, already on `main`.
- **F10** `use-live-query.ts:42` — `subscribe(workspaceId, 0, …)` hardcodes the resume cursor, so
  every mount replays the workspace from the start. Inert against the fake; a full replay per Board
  mount against Task 8's real socket. Owner: Plan 6 Task 8.

## Verified SOUND — the coverage, not just the failures

- **The commit's headline claim is real and its fix genuine.** Mutating `formatIstInstant` in
  `packages/domain/src/clock-skew.ts` to read the device day — rebuilt, confirmed present in
  `dist/clock-skew.js` — left the plain unfold test at `board.test.tsx:172` **green** under this
  machine's ambient zone. *That green is the "hidden on this machine" proof.* All three of T9's
  TZ-swapping tests killed it. Under ambient `TZ=Pacific/Kiritimati` the same mutant produced **14**
  failures instead of 6; the extra 8 are precisely the tests that pass here for a reason unrelated to
  the property they name.
- Tri-zone sweep (unset / Kiritimati / Niue): 18/18, 658, identical per-package counts, no assertion
  changing with the ambient zone.
- Grouping-is-not-a-filter is falsifiable (`slice(0,1)` killed exactly the two grouping tests).
- The rollup denominator is falsifiable, and correctly left the `restrictedCount: 0` cases green —
  the suite's own note about that blind spot is accurate.
- The `@ts-expect-error` guard is precisely targeted and live in the gate (`tsconfig.typecheck.json`
  includes `test`).
- `ui.css`: all five custom properties map to real `TOKEN_ROLES`; no colour literal; scanner green.
- No subscription leak in `useLiveQuery` (cleanup clears the timer and unsubscribes).
- No cross-lane collision in `ui.css`, `index.ts`, `test/setup.ts` or `src/views/`.
- Docs otherwise true: `main @ 3fb22d3 — 631, app-core 91` and `branch @ HEAD — 658, app-core 118`
  both confirmed by measurement; "T6 merged as `3fb22d3`" is accurate, and the pre-split `8209397` is
  correctly *not* an ancestor of `main`.

## Sweeps, each with a same-run positive control

| Sweep | Result | Positive control, same run |
|---|---|---|
| Full gate ×2 | 18/18, 658 | baselines |
| Tri-zone `turbo run test --force` | all 18/18, 658, no flips | vitest `Start at` shifted correctly: IST `15:53` → Kiritimati `00:23` (+8:30), Niue `23:23` (−16:30) — proves `TZ` reached the workers **through turbo** |
| M1 clock mutant, ambient IST | 6 fails | the 112 passes **including** `:172` staying green — the "machine hides it" half |
| M1 same mutant, ambient Kiritimati | 14 fails | the 8-test delta vs ambient IST is the hidden class |
| M3 `slice(0,1)` | killed only the 2 grouping tests | 116 unaffected passes, kill site named |
| M7 denominator shrink | killed 2 rollup + 1 board render | `restrictedCount: 0` cases correctly green |
| M5 scanner: `react-router-dom` survived | **survivor = unconstrained path** | the `fetch(` planted in the same file, same run, was caught |
| Marker grep | clean | `formatRollup` control hit 9 files |

## Least sure

**Which files F1 actually contaminates.** The leak reproduced 3/3 in the gate configuration, so its
existence is not in doubt — but which app-core files land in the same worker after `board.test.tsx`
depends on vitest's scheduling, so the victim set is nondeterministic run to run. The reviewer
verified the leak escapes the file; it did not enumerate a stable victim list, and none of the current
118 assertions is ambient-sensitive enough to flip either way.

## Tree restored

`git status --porcelain` empty (raw output via `rtk proxy`, since rtk's summariser renders empty as
`ok`); `git diff HEAD --stat` empty; line counts back to originals; marker grep clean **with a hitting
control term**; and `packages/domain/dist/clock-skew.js` rebuilt with zero mutant matches — `dist` is
gitignored, so porcelain alone would not have shown it. Final gate 18/18, 658, identical to baseline.
**No shell `diff` was used anywhere.**
