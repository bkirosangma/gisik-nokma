# Lane B — executor state (Plan 10 T13 → T14 → T15 → T18)

**This file is Lane B's restart surface, and nobody else's.** `executor-state.md` is Lane A's — never
edit it. A Lane B session relaunched from `dispatch-executor-serial.md` + the Lane B override recovers
only what is written here.

> **Shas in narrative prose below are facts about when they were written.** Verify with
> `git branch --contains <sha>` — **empty output means orphaned**. `git cat-file` passes on reflog-only
> commits and will lie to you.

---

## LIVE ANCHORS — verified 2026-09-06, re-verify before trusting

| anchor | value | how verified |
|---|---|---|
| branch | `exec/20-plan10-t13-t15` | `git branch --show-current` |
| HEAD | `1e372e3` | `git rev-parse HEAD` |
| `origin/main` | `1e372e3` | `git rev-parse origin/main` after `git fetch origin main` |
| ahead of `origin/main` | **0** | `git rev-list --count origin/main..HEAD` |
| HEAD reachable? | **YES** — contained by `exec/20-plan10-t13-t15`, `main`, and three sibling lane branches | `git branch --contains 1e372e3 -a` |
| tree | clean | `git status --short` (empty) |
| node | v22.22.2 | `node -v` after `export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH"` |
| install | `pnpm install --frozen-lockfile` exit 0, `pnpm rebuild better-sqlite3` exit 0 | `/tmp/laneB-install.log` |
| domain+ui built | `pnpm turbo run build --filter=@gisik-nokma/domain --filter=@gisik-nokma/ui` → `2 successful, 2 total` | `/tmp/laneB-build.log` |

**Gate composition NOT yet recounted at this sha by this lane.** The controller's last recorded figure
(3181 tests / 24 tasks / 8 packages) is from `9a5275c`, two merges back. Recount before quoting it.

---

## POSITION IN THE LANE SEQUENCE

| # | task | state |
|---|---|---|
| 1 | **T13** — app-core contested-claim UX, offline reopen pair, skew badge, sync status bar | **IN PROGRESS** — pre-flight verification running, nothing written, nothing committed |
| 2 | T14 — dual-client harness rig (Fable author + reviewer) | not started |
| 3 | T15 — scenarios S1–S6 (Fable author + reviewer) | not started |
| 4 | T18 — `Features.md` §12 + `test-cases/12` final shape | **HELD** until Lanes C (T16) and D (T17) have MERGED to `main`. Poll `origin/main` for their merge commits. |

**Nothing is in flight with the controller. No PR is open. No ruling is pending from this lane.**

---

## WHAT THIS LANE HAS ESTABLISHED SO FAR — facts, with how each was measured

These are cheap to re-derive but were not free the first time. A restart should read them before
re-measuring.

1. **T13's Step 0 is moot.** `packages/app-core` exists richly (95 source files). The plan's own guard
   says skip Step 0 in that case. Confirmed by `find packages/app-core/src -type f`.

2. **Every domain symbol T13 consumes resolves**, verified by `grep -rn "export ..." packages/domain/src`
   and confirmed present in `packages/domain/src/index.ts`'s re-export list:
   `renderContestedClaimText` + `plainTextToDoc` (`events/contest-events.ts:104,113`),
   `clockSkewMs` / `hasGrossClockSkew` / `formatIstInstant` / `IST_CLOCK_NOTE`
   (`clock-skew.ts:76,83,51,21`), `newSubmittedEvent` (`submit.ts:9`), `Origin` (`envelope.ts`).

3. **`hasGrossClockSkew` returns `true` when the skew is unparseable** (`clock-skew.ts:84` —
   `skew === null || Math.abs(skew) >= GROSS_CLOCK_SKEW_MS`). This is why the plan's `formatClockSkew`
   ordering is correct: gate on `hasGrossClockSkew` FIRST, then re-read `clockSkewMs` and answer
   `'device clock claim unreadable'` on `null`. Inverting those two lines makes the unreadable case
   return `null` (no badge) — the exact silent-hiding the plan's third test exists to forbid.

4. **`GROSS_CLOCK_SKEW_MS = 600_000`** (10 min), and the comparison is `>=`. The plan's 11-minute case
   clears it; the 30-second case does not.

5. **`newSubmittedEvent` sets `clientTime` from `now().toISOString()`** and does NOT set `serverTime`
   or `seq` — `SubmittedEvent = Omit<EventEnvelope, 'serverTime' | 'seq'>` (`envelope.ts:164`).
   `renderContestedClaimText` prints `formatIstInstant(originalEvent.clientTime)`, which is where the
   banner's required `'IST'` substring comes from.

6. **`ContestedClaim` ALREADY EXISTS in app-core and is NOT the plan's `ContestLike`.**
   `view-types.ts:165` — `{ ticketId, title, rule, reason, claim: ClaimProvenance }`, the `MyWorkView`
   row. The plan's `ContestLike` is a different, locally-declared structural type
   (`{ contestedEventId, ticketId, claimantId, rule, reason, originalEvent, contestedAt, resolved,
   resolution }`). Two contest-shaped types in one package is a real confusion hazard; the new file
   must name the distinction in a docblock rather than leave it to be rediscovered.
   *(Measured with QUOTED grep globs plus a positive control — an earlier unquoted
   `--include=*.ts` was eaten by zsh and returned a silently-empty wrong answer.)*

7. **T13 has NO dependency on Lane A's `getAttention` / `ContestedClaim.title` work.** T13's five files
   are pure-props components and pure functions; `ContestLike` is declared locally by the plan's own
   design ("app-core declares the minimal structural types it needs"). The replica source's refusal at
   `replica-data-source.ts:289` (`ContestedClaim.title` — "no title on the contests table") therefore
   does not block this task. **Recorded rather than built toward.**

8. **Ruling P17 does not bind T13.** P17 governs the `useLiveQuery(source, workspaceId, queryKey, load,
   debounceMs)` 5-arg form. None of T13's five files reads through `useLiveQuery` — they take props.
   The adaptation map flagged P17 as "directly load-bearing here"; that is true only *if* a live-reading
   view is added, and the plan text adds none. **This lane deliberately adds none.**

9. **Ruling P30 is not at risk from T13.** No T13 file touches `packages/app-core/src/data-source.ts`.
   The one place a widening could tempt someone is `IngestFn` — which the plan declares in T13's OWN
   new file (`contests/contest-view-model.ts`), never in `data-source.ts`.

10. **Test-case numbering, recounted at this sha rather than trusted:**
    `test-cases/12-offline-sync-apps.md:11` claims *"HIGHEST ID IN USE HERE IS `12.188`. THE NEXT FREE
    ID IS `12.189`."* Independent recount — `grep -o '^- 12\.[0-9]*' | sed | sort -n | tail` — returns
    **188**. The header agrees. **T13's cases start at 12.189**, and this lane must update that header
    line in the same change set (the line's own parenthesis records five separate occasions it went
    stale inside one change set).

11. **`Features.md` §12 must be extended in the same change set**, appending only within Plan 10's
    section. T18 owns §12's final shape — this lane must not restructure it now.

12. **THE TZ PREMISE, corrected.** The blanket "zero of 48 test files vary `TZ`" in the executor brief
    is a reading of an old tree. The adaptation map's own correction (measured at `32393be`) is that the
    repo has **228** test files and **14** assign `process.env.TZ`. The operative rule is narrower and
    better: **vary `TZ` where the value under test actually moves with it; where it does not, say so in
    a comment and do not add the case** (`apps/server/test/routes/board.test.ts:80-87` reasons exactly
    this way and is right to). Plan 10's own text pins a timezone on **zero** lines across 36
    clock-sensitive ones, so a task transcribing it inherits no discipline from the plan.

---

## OPEN RULINGS FROM THIS LANE

None yet.

## KNOWN HAZARDS CARRIED INTO T13's IMPLEMENTATION

- **`cause: { kind: 'reopened-for-child', childTicketId }` on a `ticket.transitioned` payload is
  UNVERIFIED against the real payload schema.** If that schema is `.strict()` and declares no `cause`,
  the plan's `buildReopenPair` builds an event the real door refuses — and the plan's own unit test
  (`toMatchObject` on a freshly built envelope) **cannot catch it**, because nothing in that test passes
  the event through a schema. This surfaces later, in T15's S5. Being verified now; if the field is
  absent, it is **recorded with a named owner, not fixed by widening the domain schema**.
- **`IngestResult[]` → `Array<{status: string; eventId: string|null} & Record<string, unknown>>`
  assignability is UNVERIFIED.** Turns on implicit index signatures (type aliases get them, interfaces
  do not). T13's tests all pass `vi.fn()`, so they cannot detect a failure here. Being probed with real
  `tsc`, not by reading types.

---

## MECHANICS FOR THIS LANE

- Toolchain: `export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH"` in every shell invocation.
- **app-core tests may run UNLOCKED** (`--maxWorkers=2`) — they include no `apps/server`.
- **Any run that includes `apps/server` takes the machine-wide gate lock** (T14/T15 will take it often):
  `until mkdir /tmp/gisik-gate.lock 2>/dev/null; do p=$(cat /tmp/gisik-gate.lock/pid 2>/dev/null); [ -n "$p" ] && ! kill -0 $p 2>/dev/null && rm -rf /tmp/gisik-gate.lock; sleep 15; done; echo $$ > /tmp/gisik-gate.lock/pid; trap 'rm -rf /tmp/gisik-gate.lock' EXIT`
- **Never pipe a test run into `head`** — it orphans the whole vitest worker pool at `ppid=1`. Redirect
  to a file and `head` the file. Reap `pgrep -f vitest` survivors after any suspiciously fast return.
- **Build `domain` before running app-core tests.** A fresh `pnpm install --frozen-lockfile` does not
  build, and `@gisik-nokma/domain` resolves through `./dist` — a bare `vitest` run would read a stale or
  missing dist and fail in a way that looks like a config problem.
- Collisions this lane must respect: `packages/app-core/src/index.ts` (Lane A's closure 3 also touches
  it — whoever lands second rebases) · `apps/server/package.json` at T14 (Lane E) · `Features.md` /
  `test-cases/12` (append only in Plan 10's section).
- Never edit `docs/lanes/task-ledger.tsv`. Never merge this lane's own PR. Never commit to `main`.
