# Review — FUNCTIONALITY (executor 6, round 2): the engine and the wire

**Lane:** executor 6 (Opus 5) · **branch:** `exec6/review-functionality` · **base:** `origin/main`
**Started:** 2026-09-21 09:42:10 IST (T0 recorded by the controller: 09:41:50 IST; phase 1 closes 15:41:50 IST, phase 2 closes 18:41:50 IST)
**Every measurement in this report was taken at `a7b6292b78c50208e8055c9f8639b1e8dcf4caa0`**
(`Merge pull request #630 from bkirosangma/ctl/cycle36-rotation`) in
`/Users/kiro/my_projects/gisik-nokma-exec6`, with `node v22.22.2` in `PATH`, unless a finding says otherwise.

**This is review only.** No fix branch, no fix commit, no PR. Every mutation below was applied to a worktree file
and restored; the restore was verified by `cmp` against a pre-mutation copy, and the run count of every suite
verdict is stated next to its pass/fail count (a mutation that cannot parse runs zero tests and prints as a
survivor).

**Round-1 position.** `docs/lanes/review-functionality-exec3.md` (DeepSeek lane) is the landed round-1 report;
`docs/lanes/review-compiled-controller.md` ruled on it (7 accepted, 1 accepted-deferred, 0 rejected). Its own §2
names what it did not reach: *no line-by-line correctness review of `packages/rule-engine`, `packages/mcp-server`,
`packages/sync-client`, or `packages/domain`*; `mappers.ts` scanned, not read; the prototype comparison confined
to the `Visibility` roster. **Those are this report's targets.** Nothing in exec 3's §4–§6 is re-filed here unless
a measurement it lacks is added, and where that happens the finding says so.

---

## 0. THE ONE-LINE ANSWER

_(written last)_

---

## 1. ENUMERATION — my universe, measured before any finding

| area | what is in it | measured count |
|---|---|---|
| `apps/server/src/routes/` | the route modules the brief calls "19" | **19 files** |
| `apps/server/src/` (all) | projections (19 incl. registry/rebuild/index), reads (18), visibility (4), permissions (2), sync (8), stream (2), notifications (4), auto-close, ingest, ledger (2), attachments (9), auth (10), gates (4), http (4), ops (6), seed (12), tools (6), alerts, workspaces (2), db (2) | **144 non-test `.ts` files, 30,588 lines** |
| `apps/server/migrations/` | every migration | **32 files**, prefixes `1787841717635` → `1790000000000`, strictly ascending |
| `packages/domain/src/` | event vocabulary, state model, invariants | **41 files, 5,965 lines** |
| `packages/rule-engine/src/` | checks (11), rules (7), engine/evaluate/transition/contests/version-map | **28 files, 3,382 lines** |
| `packages/sync-client/src/` | engine, outbox, precheck, replica (3), storage (4), transport | **13 files, 3,944 lines** |
| `packages/mcp-server/src/` | the MCP surface: tools (3), session, device-login, token-cache, http-client | **12 files, 788 lines** |
| `packages/app-core/src/online/` | wire mappers + HTTP data source | **11 files, 4,399 lines** |
| `packages/app-core/src/replica/` | the offline data source | **1 file, 1,500 lines** |
| `scripts/` | the checkers | **9** `check-*.mjs` (+ `help-content.mjs`, `mint-apple-client-secret.mjs`, `restore.sh`) |
| `test-cases/` | every case id | **2,606 ids across 25 files** (the brief says 2,601; `node scripts/check-case-ids.mjs` → `2606 unique ids, highest 17.006`) |

**Route modules beyond `routes/`** (the brief's "19" is the directory, not the door set): `auth/routes.ts`,
`stream/routes.ts`, `sync/sync-routes.ts`, `sync/contests-route.ts`, `sync/reconcile-route.ts`, and `app.ts`
(`/healthz`). exec 3 §1 measured 54 registrations after widening; I inherit that number as *theirs* and re-measure
only where a finding needs it.

**Case ids in this concern**, per file, by the checker's own two regexes (`ID_LINE`, `ID_LINE_BT` from
`scripts/check-case-ids.mjs`), with the status split each file carries:

| file | ids | ✅ | ❌ | 🟡 | 🧪 | 🚫 | no marker |
|---|---|---|---|---|---|---|---|
| `03-foundation-ledger.md` | 130 | 126 | 0 | 0 | 2 | 2 | 0 |
| `04-workflow-engine.md` | 53 | 52 | 0 | 0 | 0 | 1 | 0 |
| `05-tickets-hierarchy.md` | 75 | 73 | 0 | 0 | 0 | 1 | 1 |
| `06-auth-visibility.md` | 144 | 111 | 20 | 2 | 0 | 11 | 0 |
| `07-api-realtime-search.md` | 263 | 241 | 11 | 2 | 0 | 2 | 7 |
| `12-offline-sync-apps.md` | 347 | 333 | 2 | 6 | 2 | 4 | 0 |
| `14-mcp-server.md` | 88 | 87 | 0 | 0 | 1 | 0 | 0 |
| `16-remaining-doors.md` | 99 | 97 | 0 | 1 | 0 | 1 | 0 |
| **core of this concern** | **1,199** | | | | | | |
| `11-calendar-notifications.md` (notifications half) | 174 | 170 | 1 | 0 | 0 | 0 | 3 |
| `13-plan11-seams-and-scheduler.md` | 95 | 71 | 10 | 4 | 8 | 2 | 0 |
| `13-deploy-and-ops.md` | 104 | 87 | 5 | 0 | 11 | 1 | 0 |

**1,199 core ids is not a number I can walk one by one in a six-hour phase.** §2 states the sample I took and how it
was chosen.

---

## 2. COVERAGE — what I reached, what I did not, and how the graph was used

_(written last; every subsection below is filled in as the work lands)_

### 2.1 Graph and semantic-search usage

### 2.2 Reached

### 2.3 Not reached — named rather than implied

---

## 3. THE FIVE PARTS, DECLARED ONCE

Every finding below gives **WHAT** · **WHY** · **WHAT WOULD HAVE BEEN BETTER** · **THE MEASUREMENT** (command +
the line I opened) · **SEVERITY** (Critical / Important / Minor). Where I could not measure, the finding says
**unverified** and why. Finding ids are `E6-<n>`.

---

## 4. FINDINGS

---

## 5. POSITIVE FINDINGS — claims I tried to falsify and could not

---

## 6. THE NINE EDGE CLASSES — walked per surface

---

## 7. THE PROTOTYPE, CLASSIFIED

---

## 8. COUNT OF FINDINGS BY SEVERITY — members named

---

## 9. NOTES FOR PHASE 2 (refutation candidates, not filed here)
