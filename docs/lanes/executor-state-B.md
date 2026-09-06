# Lane B — executor state (Plan 10 T13–T15 · closure 5 · closure 5b · T18 · **the sync-surface fixes**)

**This file is Lane B's restart surface, and nobody else's.** `executor-state.md` is Lane A's — never
edit it. A Lane B session relaunched from `dispatch-executor-serial.md` + the Lane B override recovers
only what is written here.

> **Shas in narrative prose below are facts about when they were written.** Verify with
> `git branch --contains <sha>` — **empty output means orphaned**. `git cat-file` passes on reflog-only
> commits and will lie to you. Every block below this one is HISTORY. The LIVE ANCHORS table
> immediately below is the only part measured at this HEAD.

---

## ▶ LIVE — the SYNC-SURFACE SOURCE PR (12.328 · 12.327 · 12.13 · 12.16), started 14:2x IST 2026-09-06

**T18 IS DONE AND MERGED. Plan 10 is 18/18, COMPLETE.** Everything under the next heading is history.
This lane is now on a small source PR turning four ❌/🟡 cases from the T18 round into fixes with
excluding fixtures.

| anchor | value | how verified |
|---|---|---|
| branch | `exec/43-sync-surface-fixes`, cut from `origin/main` | `git checkout -b … origin/main` |
| base at cut (SUPERSEDED — rebased onto `c5dfdcd`, #196) | **`8d6b756`** (#193, lock v3.3 + `REPO=`) — NOT `8373ae5`: `origin/main` moved twice between the fetch and the cut (#194 `f2ab4b2` promoting T18, then #193), and the branch was reset onto the newer tip **before** any commit rather than rebased after | `git rev-parse origin/main` twice, the second after a re-fetch; `git merge-base --is-ancestor 8373ae5 origin/main` → YES |
| T18's final head | **`c2d2e3b`** — **squash-merged as `8373ae5` (#188)**, then promoted by **`f2ab4b2` (#194)**. `git branch -a --contains c2d2e3b` names only the stale local `exec/33-plan10-t18`; **it is NOT reachable from `main` or from `origin/*`** — a squash merge orphans its inputs, so every sha in the T18 narrative below is unreliable exactly as the banner warns. Positive control for the same command: `--contains 8373ae5` names `main`, four branches and `origin/main` | `git branch -a --contains`, both directions |
| toolchain | node **v22.22.2**; `pnpm install --frozen-lockfile` **`INSTALL_EXIT=0`** · `pnpm rebuild better-sqlite3` **`REBUILD_EXIT=0`** · `pnpm turbo run build --force --concurrency=1` **`BUILD_EXIT=0`** | one shell invocation, each `$?` on its own line |
| `check-case-ids` (repo-wide) | **`CHECK_CASE_IDS_EXIT=0`** — bare 1010 + bold 469 + marker-first 40 = **sum 1519 == union 1519**, highest `13.168`, 10 files. **A SEPARATE CI step, NOT part of `pnpm check:env`; its own line in every report** | `node scripts/check-case-ids.mjs` |
| **§12 max, recounted** | **`12.328`** — line-head shape only. **`12.360` is in the file and is NOT a case**: it is the header's next-free-block pointer, and so are `12.329/12.339/12.340/12.359`. A whole-file `grep -oE '12\.[0-9]+'` returns `12.360` as the max and is wrong | line-head extraction, with a positive control that the same shape still finds `12.1` |
| **my new §12 block** | **`12.360–12.379`**, allocated with this override; next free block `12.380` **on request**. Verified free as CASE ids (`^- \*{0,2}12\.3[67][0-9]` → empty). D holds `12.340–12.359`; A holds `12.320–12.339`, used through `12.328`. **My old block `12.290–12.319` is EXHAUSTED** | grep, stated either way |
| §12 style | **bare is canonical** (ruled 13:43 on my request; T18 normalised all 19 bold heads, zero renumbered). Census at this HEAD: **bare 318 · bold 0 · marker-first 0; sum 318 == union 318** | §12-scoped, three styles, per-style counts printed as the control |
| `Features.md` §12 bullets | **87** | see the extractor note below — the obvious range is wrong |
| position | override item 1 of 4 not yet started; the docs refresh is this commit | — |

### ▶ POSITION AT 14:47 — all four items COMMITTED and MUTATION-MEASURED; gate in flight; PR not yet opened

| anchor | value | how verified |
|---|---|---|
| branch · HEAD | `exec/43-sync-surface-fixes` — **SEE THE REVIEW-ROUND BLOCK BELOW for the live head; the sha in this row was true at 14:47 and the branch has been rebased and extended twice since.** A restart reads the LAST block in this file, not this table | `git rev-parse HEAD` |
| base | **`8d6b756`** (#193) — REACHABLE, `git branch --contains` names `main` | not `git cat-file` |
| tree | clean; every mutation restored and verified BY READING plus an empty `git diff` | stated either way |
| dist | `app-core`, `sync-client` and `domain` REBUILT after their mutations — no mutated `dist` left for Lane D's rebase | `grep` for the mutant marker in `dist/` after each restore |
| `check-case-ids` | **`EXIT=0`**, 1524 unique, union == sum, +5 (12.360–12.364). **Its own step, NOT part of `check:env`** | `node scripts/check-case-ids.mjs` |
| §12 | max **`12.364`**; Lane B's block `12.360–12.379` used through `12.364`; header's next-free bumped to `12.380` | recounted at this sha, line-head shape |
| full gate | **IN FLIGHT** — lock acquired 14:40:36 pid 62853, after waiting out Lane C's holder. **Do not read `/tmp/laneB-gate.log` until the wrapper prints `GATE_EXIT=`** (see the trap below) | — |
| PR | **NOT OPENED YET.** Head is therefore NOT frozen | — |

**What landed, one commit each, each with its mutation measured after the commit:**

| item | case | mutation | measured |
|---|---|---|---|
| 1 | **12.328 ✅** (was ❌) — four production ping/pong sites deleted; owner-rule docblocks at both `webSocketFactory` defaults; **12.360 ✅** and **12.361 🚫** minted | restore the pong arm in `stream.ts` (BOTH halves — a send arm alone is unreachable once `parseFrame` answers null) | **1 failed / 26 passed, 12.360 alone**, `expected […(2)] to deeply equal [Array(1)]` |
| 1 | same, sync-client half | restore the pong arm in `http-transport.ts` | **1 failed / 28 passed, 12.167 alone**, `expected ['subscribe','pong'] to deeply equal ['subscribe']` |
| 2 | **12.327 ✅** (was ❌) — the literal replaced by `parseEvent`'s own answer; `outbox.ts`'s standing measurement repriced; **12.362 ✅** minted | change all five `'malformed-envelope'` sites in `parse-event.ts` | **12.362 alone within `sync-route.test.ts` (1/16)**; repo-wide over every file that mentions the code: domain **6 failed / 28**, other four server files **0 / 40**, sync-client **0 / 29** |
| 3 | **12.13 ✅** (was 🟡) — **12.363 ✅** minted | delete `'attachment.added'` from `BOOTSTRAP_BACKFILL_TYPES` | **1 failed / 103 passed over `test/sync/` + `test/dual-client/` (15 files) — 12.363 alone** |
| 4 | **12.16 ✅** (was 🟡) — **12.364 ✅** minted | `env.workspaceSeq` → `0` in `insertEnvelope` | **3 failed / 85 passed across sync-client (8 files, 88 tests)** — 12.364 plus 12.305/12.313 through `ticketHeadSeq`'s aggregate |

### THREE THINGS THIS BRANCH PAID FOR — all three are method, not content

1. **`git checkout HEAD -- <path>` restored two files that carried UNCOMMITTED work, and destroyed it.**
   Item 2's whole source change vanished mid-measurement. Commit-then-mutate is not a style rule: the
   restore *is* `git checkout HEAD`, so **a file holding uncommitted work cannot be a mutation site.**
2. **A STALE LOG AT A PATH I CHOSE READ AS MY OWN RESULT.** `/tmp/laneB-gate.log` still held a complete,
   green run from an earlier Lane B session — `GATE_EXIT=0`, 30/30 — and it was read and nearly reported
   while my gate was still waiting on Lane C's lock. It was caught only because the per-package numbers
   were LOWER than main's last gate on a branch that only adds tests (sync-client 7 files/64 tests, where
   a direct run of the same package gives 8/88). **The log path is not the run.** Read `GATE_EXIT=` from
   the WRAPPER's own stdout, and check the log carries this run's `LOCK ACQUIRED` timestamp.
3. **A carried finding aged out of true inside the catalogue that quoted it forward.** 12.16 said the
   constant-0 mutation "leaves the whole suite green". True when Plan 10 Task 9 recorded it; false since
   closure 5b landed the pull door — *my own change*, and I did not notice then either. Re-measured
   rather than repeated.

### CARRIED, WITH OWNERS — not fixed here

- **12.361 🚫** — the owner rule at both `webSocketFactory` defaults is a docblock and no test can hold it:
  the failing case needs a `ws` dependency no client package has. *Owner if a client shell ever adopts
  `ws`: whoever adds that dependency.* The 12.328(b) grep is the tripwire, and it is a human one.
- **`outbox.ts`'s `SyncEventResult` move** — still open, eight files, and **now zero fixture cost**.
- **Lane D** (`exec/40-socket-cut-fixture`) holds `apps/server/test/dual-client/socket-cut.test.ts` only;
  file lists exchanged in both directions, no import of mine changes signature except `parseFrame`'s
  return type (app-core, which D does not import). Whoever lands second rebases.


### CORRECTION TO THE 14:47 BLOCK ABOVE — the freshness check I prescribed does not work

I wrote *"check the log carries this run's `LOCK ACQUIRED` timestamp"*. **It does not.** `LOCK ACQUIRED`
is printed by the wrapper to ITS OWN STDOUT and never reaches the logfile — `grep -c "LOCK ACQUIRED
pid=62853" /tmp/laneB-gate.log` returns **0** on a run that genuinely acquired that lock. A freshness
check that cannot fire is the same defect as the stale log it was written to catch, committed in the
paragraph describing that defect. **The check that works: read `GATE_EXIT=` from the WRAPPER's stdout
(the background task's output file), never from a logfile path you chose** — and if you must judge a
logfile, compare its per-package composition against a number you can re-derive right now.

### THE REBASE PAST #196, and the re-gate it owed

Lane D's socket-cutting fixture landed as `c5dfdcd`. **Three conflicts, all in `test-cases/12`'s header**
(the block table and the MAXIMUM line), none in source — resolved keeping BOTH lanes: Lane D's
`12.340–12.359` *used through 12.343*, and Lane B's `12.360–12.379` *used through 12.364*. The header's
counters were resolved to their FINAL values once rather than replayed per intermediate commit, then
**recounted at the rebased sha**: max `12.364`, Lane D's four ids all present, `check-case-ids`
**`EXIT=0`, 1536 unique, union == sum**.

**The re-gate was genuinely owed and is not a formality**: the branch-vs-base diff carries SOURCE
(`stream.ts`, `http-transport.ts`, `outbox.ts`), and D's new fixture drives the very transport whose
ping/pong arm this branch deleted. **⚠️ THE INTERACTION CHECK I RAN HERE WAS THE WRONG GREP, and the review caught it.** I grepped
`socket-cut.test.ts` for `ping|pong` — which finds nothing and **could not have found anything** — and
wrote "measured, not assumed". The grep that mattered was 12.328's own clause (a), `webSocketFactory`
over `packages` AND `apps`, and re-running it at the rebased head returns **FOUR** test files, not
three: `socket-cut.test.ts:379` injects a **real `ws` socket** into `createHttpTransport`. That
falsified four shipped sentences at once — 12.328(a)'s enumeration, `stream.ts`'s "three sites … are
test fakes", both OWNER-RULE docblocks' absolute *never inject a raw `ws` socket* (which the repo now
violates, so a maintainer obeying it would delete Lane D's day-old fixture), and 12.361's "no test can
hold this". **A check aimed at the wrong term is not a weaker check; it is no check** — and the term I
aimed at was the one I had just been thinking about, which is how it happened. All four corrected in
the review round below.

**A worktree trap, paid for here:** `[ -d .git/rebase-merge ]` is ALWAYS false in a git worktree, because
`.git` is a FILE pointing at the real gitdir. A resolve-and-continue loop guarded on it reported
"REBASE DONE" immediately, with conflict markers still on disk and a rebase still in progress. Use
`git rev-parse --git-path rebase-merge`.

### FULL GATE AT THE REBASED HEAD — GREEN

`GATE_EXIT=0` · **`Tasks: 30 successful, 30 total`** · **`0 cached, 30 total`** · 2m11.689s ·
**node `v22.22.2`** · `PNPM=9.15.0` · **`CHECK_ENV_EXIT=0`** · `Unsupported engine` **0** ·
**no orphaned vitest workers**. Lock acquired pid 88476, released clean.
**`check-case-ids` is a SEPARATE step and is not in that run: `CHECK_CASE_IDS_EXIT=0`, 1536 unique,
union == sum.**

**3612 passed / 283 files** (+5 skipped, server): domain 464/27 · ui 37/4 · editor 178/15 ·
rule-engine 282/12 · **sync-client 88/8** · app-core 1102/68 · web 138/18 · mobile 20/3 · desktop 5/2 ·
**server 1298/126**.

**The branch's own test delta is +3, and it decomposes** — stated because a delta that does not
decompose is a number nobody can check: **sync-client +1** (12.364), **server +2** (12.362, 12.363),
**app-core +0** — 12.360 REPLACED the deleted `answers ping with pong` test one-for-one, which is why
app-core's 1102 is unchanged rather than +1. 12.361 is 🚫 and has no test by construction.
**The gate log names files, not tests**: each of the four new cases was confirmed to EXECUTE by name
under `--reporter=verbose` in a targeted run, never inferred from a green total. That distinction was
paid for on this branch — a first run of 12.363 reported `11 skipped` behind a failed suite.

### THE FOUR ITEMS, and the shape each has to have

One PR, each item its own commit, **commit then mutate**, mutation confirmed present before the run,
predicted vs measured, restore with `git checkout HEAD -- <path>` **verified by READING the file, never
by shell `diff`** (which has returned a false "identical" on this machine).

1. **12.328 — delete the dead TEXT ping/pong protocol.** Ruled 13:44: **no runtime measurement; the four
   production sites are deletable on SOURCE evidence.** Lane A's three grep shapes **re-run at
   `8d6b756`, not adopted**, all three reproducing: (a) `webSocketFactory` is injected by **three test
   files only** (`sync-engine.test.ts:879`, `online-data-source.test.ts:556`, `stream.test.ts:80` and
   `:426`); the production hits are the two default-application lines (`app-core/src/online/stream.ts:235`,
   `sync-client/src/net/http-transport.ts:126`) plus **one pass-through** at
   `online-data-source.ts:403`, which forwards a caller's option and injects nothing — that reading is the
   load-bearing half of "no production site injects one"; (b) **only `apps/server` depends on `ws`**
   (`ws@^8.18.0`, `@types/ws@^8.5.0`); no client package does, enumerated package.json by package.json
   with the name printed beside each; (c) the four production ping/pong sites are `stream.ts:35` (the
   `PingFrame` type), `:93` (the parse arm), `:282-283` (the send) and `http-transport.ts:201-202` (the
   send), with two test arms agreeing (`stream.test.ts:354-355`, `sync-engine.test.ts:928-932`). The
   server's `socket.ping()` at `stream/routes.ts:319` and `socket.on('pong')` at `:290` are **`ws`
   protocol control frames**, a different mechanism the platform WebSocket answers below JavaScript.
   **Deleting `PingFrame` narrows an EXPORTED signature**: `parseFrame` returns
   `ServerStreamFrame | PingFrame | null` (`stream.ts:83`) and becomes `ServerStreamFrame | null`. Lane D
   was told this in writing before I started. **The residual is an OWNER-RULE docblock at BOTH
   default-application lines** — never inject a raw `ws` socket into `webSocketFactory`, because the seam
   is injected and a Node shell that did would reopen this — citing 12.328. The case flips ❌ → ✅ **only**
   for "no production site speaks the protocol"; **the owner-rule half is 🚫 with its reason**, because a
   docblock is not a check.
2. **12.327 — `'bad-envelope'`, a code no server emits.** The fixture is at
   `packages/sync-client/test/sync-engine.test.ts:**625**` — **NOT `:547`**, which the ❌ text and the
   controller record both name; `:547` today is inside 12.169's docblock. The file is the durable half of
   that reference and `outbox.ts` says so in its own words, having watched the number move twice while it
   was being written. The real union is `SyncInvalidCode = IngestErrorCode | 'actor-mismatch' |
   'reserved-type'` (`sync-service.ts:29`) over `IngestErrorCode = EnvelopeErrorCode |
   'duplicate-event-id'` (`ingest-result.ts:3`); the envelope arm is `'malformed-envelope'`
   (`parse-event.ts:7`).
   **⚠️ THE PART THAT IS NOT IN THE OVERRIDE, AND IT CHANGES THE CHANGE SET.**
   `packages/sync-client/src/outbox/outbox.ts:36-62` uses this exact fixture as a **standing
   measurement**: *"ONE sync-client test constructs an `invalid` result, and narrowing `code` would redden
   it"*, priced at *"one fixture edit (pick a real code)"* and evidenced with `tsc` exit 2 and the literal
   `TS2322: Type '"bad-envelope"' is not assignable to type 'IngestErrorCode'`. **Correcting the fixture
   PAYS that cost**, so the bullet becomes false the moment I touch the test, and the docblock is part of
   this commit rather than a follow-up. The docblock's conclusion — *the blocker is scope, not difficulty*
   — survives; only the price changes. It never says "keep this string"; it prices changing it. This is
   the same pointer-defect class the #188 review round charged me for three times.
   **Which direction the witness constrains, stated because "reddens alone" has two readings:** the
   property that actually broke is **fixture drift**, not server drift. Mutating the server's
   `'malformed-envelope'` reddens siblings, so "alone" is unavailable in that direction and I will not
   loosen an assertion to buy it — if I run it, I report the measured sibling count. The witness reads the
   server's real answer at runtime and compares the client's literal to it, so that **mutating the
   client's literal** reddens the new case alone, which is the direction that catches the next drift.
3. **12.13 — `attachment.added` is a live member of `BOOTSTRAP_BACKFILL_TYPES`** (`sync-routes.ts:59`) and
   deleting it leaves the whole server suite green. A bootstrap that must carry an `attachment.added` for
   a held ticket, asserting it arrived. Server src + server test, so the dist trap below does not apply.
4. **12.16 — a constant 0 written into `workspace_seq` leaves the suite green.** The mutation site is
   `packages/sync-client/src/replica/replica.ts:269` (`env.workspaceSeq` in the INSERT parameter list);
   the read-back is `:216` (`workspaceSeq: Number(row.workspace_seq)`). **The witness must assert on the
   `:216` read path against the envelope's own value — copied, never computed (P36/P37.2) — and NOT
   through `ticketHeadSeq`,** because `:689` is `SELECT MAX(workspace_seq)` and a constant 0 collapses it
   too: a red arriving through headSeq cannot tell "the row stored the wrong seq" from "headSeq
   collapsed", which is a mutation that does not identify its own site.
   **IMPORT STYLE DECIDES WHETHER THIS MUTATION IS VISIBLE AT ALL — the highest silent-failure risk of the
   four.** A case in `packages/sync-client/test/` importing `../src/*.js` sees the mutation; a case in
   `apps/server/test/dual-client/` importing `@gisik-nokma/sync-client` **by package name resolves through
   `./dist`** and shows a green run over unmutated code. It goes in the sync-client package. Rebuild after
   restoring, or the next agent inherits a mutated `dist` — Lane D rebases onto this branch.

### CARRIED FROM THE #188 REVIEW ROUND — the lesson, not the diff

**The reviewer's headline was a clean negative: ZERO downgrades.** No ✅ whose stated property was
unasserted anywhere, all seven 🟡s confirmed. What it found instead was the one costume that block was
uniquely exposed to: **36 of T18's 44 lines carry no assertion of their own, so the POINTER is the
deliverable**, and a `→ landed 12.NNN` naming an id that proves less than the line claims is a defect
even when the line is true. **Eleven pointer defects. Three were flatly mine:**

- **12.319 cited `12.228`** for the storage-conformance run. `12.228` is the `vi.fn()` fixture and imports
  the suite zero times — a reader following that pointer would have concluded the one-storage-interface
  claim rests on a mock. It is **`12.229`**.
- **12.319 said "the header said"** of an arithmetic correction **it never made**: the count line still
  read "the storage conformance suite's four" at the moment the prose claimed it had been fixed. Narrated,
  not done — the same species as the three live falsehoods that branch removed, committed *inside* the
  change set that removed them.
- **12.31 cited a blank line** (`:275` for an assertion at `:274`).

**Eight were under-cited. The worst is 12.23**, which pointed five clauses at "12.156+" where the range is
`12.156` alone: reconnect, flush-order and transport-failure are `12.161`, `12.159`, `12.160`, so **four of
five clauses would have survived broken with the cited range green**. `12.21`'s middle clause named no id
at all; `12.8` pointed "exactly one contest" at the retried COMMITTED case, which contains no contest
assertion (it is `12.105`). All eight were verified as they were applied; every one held.

**Two (A) unfreezes were granted and both were spent**: one docs-only fix commit for the review round
(head `3090c8b`), then a second when §12 gained an 87th bullet under Lane B — #187's fixture-mirror
inventory — that the banner's enumeration did not admit.

**The banner reshape, and the sentence that makes it safe.** §12's banner enumerating what is "still
absent" had been one short **three times**: the app shells, Task 3's stream cursor, and then A's
fixture-mirror inventory, which went stale **under** me — #187 landed the bullet while the banner sat on
an unmerged branch, so the banner's own same-change-set rule had nothing to bite on. Naming the inventory
would have fixed today and failed tomorrow (D's socket-cut fixture and this very PR both add §12 bullets).
So the enumeration now names **CATEGORIES**, carrying the rule that makes that safe: *every bullet added
under a category rather than a Plan 10 task names itself and its PR in its own text, and a reader
reconciles the section by reading its bullets rather than trusting a list at the top to have kept pace.*
Same move `test-cases/12`'s header made for ids: **the fix for a value that goes stale is not a better
value, it is removing the reader's need to trust it.**

### THE TWO MEASUREMENT NOTES THAT WILL BITE THE NEXT SESSION — both re-fired TODAY, in this file's own prep

- **A broken extractor's zero reads exactly like a clean result.** T18's dangling-reference matcher
  `landed \*\*?12\.` **requires** the literal asterisk and so could not match `**landed 12.156**`; it
  reported zero references and was nearly believed. Only the count going *down* after adding references
  exposed it. **A control downstream of a broken extractor validates the comparator, not the extraction.**
  It fired again forty minutes later: `grep -oE '12\.[0-9]+'` over the whole `test-cases/12` returns
  `12.360` as the maximum id, which is not a case at all — it is the header's next-free-block pointer.
- **A denominator carried from a sha becomes a false property of the file.** "86 bullets" measured at
  `2f18f3f` read as data loss at `e33c429` until it was re-measured at four shas. **And the obvious
  extractor for it is wrong here:** `Features.md`'s sections are NOT in numeric order — §12 is at line
  1005 and **§10 is at 1627**, so `awk '/^## 12\./,/^## 13\./'` swallows §10 and §11 and returns **115**.
  The correct shape stops at the next `^## ` *whatever its number* and returns **87**, with §13 as the
  positive control that the shape still finds bullets at all.

---

## ✅ (HISTORY — squash-merged as `8373ae5`, #188; promoted by `f2ab4b2`, #194) Plan 10 **T18** (`Features.md` §12 + `test-cases/12` final shape), started 13:2x IST 2026-09-06

Closure 5b merged as **`2f18f3f`** (#161). T13 (#117), T14+T15 (#126), closure 5 (#139) and closure 5b are
**all on `main`** — none of them is re-implemented here.

| anchor | value | how verified |
|---|---|---|
| branch | `exec/33-plan10-t18`, cut from `origin/main` | `git checkout -b … origin/main` |
| merge-base / HEAD at cut | **`2f18f3f`** | `git rev-parse HEAD`; **`git branch --contains 2f18f3f` → `exec/33-plan10-t18`, `main` = REACHABLE, not orphaned** |
| toolchain | node **v22.22.2**, `pnpm install --frozen-lockfile` + `pnpm rebuild better-sqlite3` + `pnpm turbo run build --force --concurrency=1` → **`BUILD_EXIT=0`** | one shell invocation, `$?` on its own line |
| `check-case-ids` (repo-wide) | **`EXIT=0`** — bare 865 + bold 492 + marker-first 40 = **sum 1397 == union 1397**, zero duplicates, highest `13.100`, 10 files | `node scripts/check-case-ids.mjs`; **a SEPARATE step, NOT part of `pnpm check:env`** |
| **§12 max, recounted** | **`12.322`** — bare 244 + bold 23 + marker-first 0 = **sum 267 == union 267**, zero duplicates | §12-scoped, three styles, per-style counts printed as the control |
| ruling | **Door A**, controller 13:2x: proceed now, do not wait for A or D | `SendMessage` reply |
| **PR** | **#188 OPEN**, `exec/33-plan10-t18` → main, head **`73613da`**, **REBASED past #187 onto `e33c429`**. **NOT clear to merge while the opus review is outstanding** | `gh pr view 188` |
| **rebase past #187** | base `2f18f3f` → **`e33c429`**; ONE conflict hunk, the 12.250–12.328 block. Resolved by keeping HEAD's side (it carries A's new entries) and normalising all 19 bold heads to bare, per the controller's ruling (i) with Lane A informed BEFORE the rebase | `git rebase origin/main`, markers 0 after |
| **§12 recount at `73613da`** | **bare 318 · bold 0 · marker-first 0; sum 318 == union 318**, zero duplicates, **max `12.328`**, 19 headings. `check-case-ids` repo-wide **`EXIT=0`**, 1449 unique | recounted at the sha reported, not carried |
| **re-gate owed?** | **NO.** `git diff --name-only origin/main...HEAD` = **`Features.md`, `docs/lanes/executor-state-B.md`, `test-cases/12`** — **zero non-docs**, with a positive control that the filter finds a non-docs path. The three non-docs files in the `a018f7d..73613da` diff are **#187's own** (`--diff-filter=AM` at `e33c429` names them) | stated either way, per the order |
| **full gate at `4d2d398`** | **`GATE_EXIT=0` · 30/30 · 0 cached · 1m47.837s · node v22.22.2 · `CHECK_ENV_EXIT=0` · `CHECK_CASE_IDS_EXIT=0`.** Lock v3.2 acquired 13:39:58 pid 74149, **released clean**; **0 orphans** | ONE backgrounded invocation, `$?` on its own line |
| tests at that sha | **3470 passed / 272 files** (+5 skipped). domain 464 · ui 37 · editor 178 · rule-engine 282 · sync-client 87 · app-core 1102 · web 138 · mobile 20 · desktop 5 · server 1157 | **recounted from the log by `awk`** |
| §12 census after | **bare 312 · bold 0 · marker-first 0; sum 312 == union 312**, zero duplicates, max **`12.322`**, 19 headings | §12-scoped, three styles |

**What T18 delivered:** the reserved block `12.1–12.44` written from tests rather than from the plan text
(35 ✅ · 7 🟡 · 2 🧪 · 0 ❌); `12.319` spent on the two `sync-client` guard suites, **exhausting Lane B's
block**; §12 normalised to bare (23 bold heads, no id renumbered); `Features.md` §12's banner rewritten so
its "still absent" list is EMPTY; and three live falsehoods removed, two of them Lane B's own.

**36 of the 44 are cross-references, not new coverage** — verified **zero dangling**, 33 distinct refs all
resolving, with a positive control that a planted bad reference IS detected. Eight ids add coverage:
`12.1`, `12.2`, `12.3`, `12.5`, `12.15`, `12.40`, `12.41`, `12.42`.

**Downgraded from the plan's pre-written ✅ (each names the conjunct with no witness):** `12.5`
("identically" — one runner), `12.6` ("exactly like ingest" — both cross-door comparisons compare a
refusal), `12.13` (attachments — `attachment.added` deletable with the server suite still green), `12.16`
(`workspace_seq`), `12.24` (the user-visible label), `12.33` (**the plan is wrong, not the test** — the
per-event purge walk was struck by 6.101/6.104), `12.38` (component wiring).

⚠️ **OPEN AT THIS WRITING: Lane A began writing §12 after the Door A ruling** — `exec/39-fixture-witnesses`
at `137d48a` adds **12.323–12.328 in BOLD**. T18's header is true at merge and stale the moment A lands;
the controller has been asked to **broadcast that bare is canonical in §12**. `git log 2f18f3f..origin/main
-- test-cases/12 Features.md` is **still empty**, so the merge condition holds.

### The §12 header on `main` is FALSE, and T18 is what fixes it

`test-cases/12`'s header says **"HIGHEST ID IN USE ON THIS BRANCH IS `12.318`"**. It is not: **`12.322` is
in use**, landed by Lane A's #176 (`2d2bc5c`) as bold-style line heads. The controller caught this against
my own measurement 2 and was right; I verified it rather than adopting it — `git log -S'12.322'` names
`2d2bc5c`, and the three lines sit two sections above the closure-5b block. **`12.319` is genuinely free**
(the recounted list runs `… 12.317 12.318 12.320 …`), so Lane B's block 12.290–12.319 is used through
12.318 exactly as the previous block claimed.

⚠️ **marker-first = 0 in §12 is a MEASUREMENT, not a dead matcher** — the same pattern returns **40** on
`test-cases/13`, watched firing before the zero was believed. This is the exact trap this file recorded on
2026-09-06 03:30 (*a zero from a matcher you have not seen fire is not a measurement*), and the rule now
costs one extra command instead of a false clean.

### `listPendingPulls` — the consumer enumeration owed from `fff3cbf`

Recorded here because the previous block asserted "the rig was the only miss" without ever committing the
enumeration that would let a reader check it. **Two independent sweeps, agreeing**, plus a positive control
from the same runs:

| file | lines | role |
|---|---|---|
| `packages/sync-client/src/replica/replica.ts` | 2 (`:128` declaration, `:959` impl) | **definition — not a consumer** |
| `packages/sync-client/src/engine/sync-engine.ts` | 1 (`:484`) | **real consumer**, destructures `{ id: ticketId, headSeq }` — updated by P37.2 |
| `apps/server/test/dual-client/rig.ts` | 4 (`:480` iteration + 3 docblock) | **the miss** — kept iterating the array as ids |
| `packages/sync-client/test/sync-engine.test.ts` | 13 | shape-aware (`.map((t) => t.id)`, `toEqual([{ id, headSeq }])`) |
| `packages/sync-client/test/ticket-bootstrap.test.ts` | 9 | shape-aware (`idsOwed(…)`, `.find((t) => t.id === …)?.headSeq`) |
| `apps/server/test/dual-client/grant-backfill.test.ts` | 4 | **shape-BLIND — every site is `toEqual([])`** |

**Six files, 33 lines; minus the definition file, FIVE consumer files.** Positive control from the same two
sweeps: `addPendingPulls` = **13 lines across 6 files** (both methods agreed on 13), so neither sweep was a
silent-empty. Method 1 `/usr/bin/grep -rn … | grep -v node_modules | grep -v dist`; method 2 `git grep -n`
(tracked files only, so `dist/` is excluded by construction rather than by a filter that can be wrong).

**The honest refinement to "the rig was the only miss":** it was the only site that *iterated the element
shape wrongly*, but `grant-backfill.test.ts` is the file where the failure *showed*, and it is itself
**shape-blind** — four `toEqual([])` assertions that pass against `string[]` and `{id,headSeq}[]` alike.
An empty-array assertion cannot witness an element-shape change. So of the five consumers, three were
shape-aware and updated, one was shape-aware and wrong (the rig), and one could never have caught it.
*That is why typecheck, not the suite, was the instrument that identified the site.*

### Position in T18

T18 is the **last task in Plan 10** (17/18 → 18/18). Its content is the **RESERVED block 12.1–12.44** —
the plan text (`docs/superpowers/plans/2026-08-20-10-offline-sync-apps.md:7471–7629`) pins those ids and
`test-cases/12`'s own header says the file "continues from 12.45 … those ids are RESERVED … when Task 18
lands, its 12.1–12.44 fill in above these." **12.1–12.44 is disjoint from Lane A's 12.320–12.339 and Lane
D's 12.340–12.359**, which is why the controller ruled Door A: no id can collide, and the three genuinely
shared surfaces (the header line, `Features.md` §12's banner and "still absent" list, and the statuses A or
D flip) are ordinary rebase conflicts for whoever lands second.

**Live at this writing:** Lane A `exec/39-fixture-witnesses` @ `4f7751f` — four commits, `git diff --stat
origin/main...` = **one file, `docs/lanes/executor-state.md`, docs-only**; it has minted nothing on top of
the 12.320–12.322 already on `main`. Lane D has **pushed no branch** (`git ls-remote --heads origin
'exec/40*'` empty). **12.290 stays 🟡, owner Lane D.**


### T18's measurements — what §12 actually needed, and three live falsehoods

**`Features.md` §12 needs the BANNER rewritten, not new bullets.** All 15 probed features from the plan's
22-bullet §12 block are already present (`outbox` 16 hits, `proj_contested` 9, `reopen` 12, `dual-client`
5, …). Exactly two are absent from §12 and **both are absent on purpose**: Tasks 1–2's shared vocabulary
(`formatIstInstant`, `IST_CLOCK_NOTE`, `istDayOf`/`istDayBounds`) is catalogued in **§3**, and the contest
*evaluators* (`contest.server-only` and kin) in **§4** — the sections that own the domain and the rule
engine, exactly as the §3 notes and the coordination doc's reservation table say. Measured with a positive
control: those four tokens read **0** inside §12 and **7 / 2 / 4 / 2** elsewhere in `Features.md`, while
`proj_contested` reads **9** inside §12, so the zeros are measurements rather than a search that cannot
fire.

**Three contradictions were LIVE when T18 measured, and two are Lane B's own:**
1. `test-cases/12` header: *"HIGHEST ID IN USE ON THIS BRANCH IS `12.318`"* — **`12.322`** has been on
   `main` since #176 (`2d2bc5c`). Not Lane B's.
2. `test-cases/12` header: *"Tasks 14–15 … are absent rather than missing"* — **both have sections**, at
   L1755 and L1827, landed by **Lane B's own #126**.
3. `Features.md` §12: *"Still absent … both app shells — Plan 10 Tasks 16–17"* — **both exist**, bulleted
   inside that same section, with catalogue sections at L1624 and L1686.

**§8 is the only thing genuinely absent from `Features.md`, and it is absent BY RULING** — the
coordination doc's table makes §8 Plan 6's, but that row was superseded 2026-09-02 (Plan 6 Task 16): every
Plan 6 feature had already landed in §3 under 3.x ids, and renumbering 112+ cross-referenced ids for a
cosmetic relocation would violate never-renumber. `ls test-cases/` confirms no `08-` bucket.

**The staleness count is TWENTY, not fourteen** — and `grep -c` says **1**, because it counts matching
LINES and the whole running parenthesis is one line. The real enumeration comes from `uniq -c`. A
measurement instrument answering a question nobody asked, in the middle of the paragraph about
measurement instruments.

### Style normalisation — safe, and it touches only Lane A's lines

§12 was **bare 244 / bold 23 / marker-first 0**. Canonical is **bare**. All 23 bold heads convert with the
strict `- **ID** rest` form and **zero** lines need a manual look. Verified the conversion renumbers
nothing by two independent instruments **with a positive control that the comparator can detect a
difference**: id sets identical at 267 before and after, same md5, and deliberately dropping one id makes
the comparator report a difference. ⚠️ **All 23 bold lines are Lane A's** (12.240–12.259, 12.320–12.322),
so this is the one part of T18 that can conflict with a live lane — the controller is asked to broadcast
that **bare is canonical in §12** so A and D do not land new bold heads and drift the census back.

⚠️ **marker-first = 0 is a MEASUREMENT** — the same pattern returns **40** on `test-cases/13`, watched
firing before the zero was believed.

### A standing brief claim is now FALSE — recorded, not acted on

The executor brief's *"TWO KNOWN GAPS"* §2 says *"Zero of 48 test files vary `TZ`"*. **Measured at
`2f18f3f`: 17 of 272 test files vary it.** The counterexample is inside T18's own range —
`packages/app-core/test/contests.test.tsx:97` is case **12.194**, *"renders the IST day under a non-IST
TZ, and the TZ actually took effect"*, and it carries its own control that the TZ took effect plus a
docblock on the `process.env.TZ = original` restore bug that assigns the STRING `"undefined"` when TZ was
unset. The gap was real when written and has been closed by work since; the brief was not updated. **The
rule it states — vary `TZ` explicitly on any clock-sensitive assertion — still stands and is now
followed in 17 files.**

### Uncatalogued surfaces T18 owns, measured

- `packages/sync-client/test/barrel.test.ts` (**4** tests) and `test/storage.test.ts` (**4**: three from
  `storageConformanceTests` plus `migrateLocal`) are catalogued in **no** `test-cases/` file — only named
  in §12's prose as an owed item. Control: `outbox` returns 47 hits in `test-cases/`, so the search fires.
  The header's *"the storage conformance suite's four"* mis-attributes: the suite has **three**, and the
  fourth is `migrateLocal`. Two of barrel's four are self-controls (*"actually walked the graph — the
  guard is not passing by reading nothing"*, *"the walker finds the forbidden imports where they really
  live"*) — the antidote to this series' signature defect, and uncatalogued.
- `apps/server/test/sync/stream-seq.test.ts` holds **four** green assertions with **no case id anywhere**.
  **`12.15` is the reserved id for exactly this**, and the header already names *"Owner: Plan 10 Task 18."*
- **Found by a verifier, recorded with an owner, NOT fixed here:** `attachment.added` is a live member of
  `BOOTSTRAP_BACKFILL_TYPES` (`apps/server/src/sync/sync-routes.ts:59`) **with no server-side test
  witness — deleting it from that constant leaves the whole server suite green.** Owner: Plan 10 Task 6 /
  bootstrap.

---

## ✅ (HISTORY) POSITION AT 13:11 IST — #161 IS GREEN AND RE-REPORTED. WAITING ON THE CONTROLLER'S MERGE.

**Everything the 12:35 override asked for is done.** The block below this one is that override's position
and is now HISTORY; this block is the live state.

| anchor | value | how verified |
|---|---|---|
| HEAD | **`bdc93d7`**, pushed; tree clean | `git rev-parse HEAD`, `git status --porcelain` empty |
| rebased onto | **`origin/main` = `d92dd41`** (moved three times during the session: `5fca89e` → `3e6d606` → `81a7e44` → `d92dd41`); 48 commits replayed, ahead 48 | `git rev-list --count origin/main..HEAD` |
| **full gate** | **`EXIT=0` · `Tasks: 30 successful, 30 total` · `Cached: 0 cached, 30 total` · 2m5.386s · node **v22.22.2** · zero `Unsupported engine` · no orphaned workers.** Lock v3.2, acquired 13:08:54, released clean | ONE backgrounded invocation, `$?` on its own line |
| tests | **3470 passed / 272 files** (+5 skipped). ui 37 · domain 464 · editor 178 · rule-engine 282 · sync-client 87 · app-core 1102 · server 1157 · web 138 · desktop 5 · mobile 20 | **recounted from the log by `awk`**, not summed by hand |
| `check:env` | **`CHECK_ENV_EXIT=0`**, on its own line, SEPARATE from the turbo graph | in the gate script |
| `check-case-ids` | **`CHECK_CASE_IDS_EXIT=0`** — bare 865 + bold 492 + marker-first 40 = **sum 1397 == union 1397**, zero duplicates, highest `13.100`, 10 files. **A SEPARATE STEP**: the controller corrected the override at 12:5x — `pnpm check:env` runs `check-env-example.mjs` ALONE, and `check-case-ids.mjs` is its own job in `ci.yml`. "check:env 0" says nothing about case ids | `node scripts/check-case-ids.mjs` |
| §12 ids | **12.317 and 12.318 used; 12.319 is this lane's last.** The block 12.340–12.359 offered by the override was **NOT claimed** — two ids were enough — so it is still free for whoever asks next | — |

### What the gate caught that nothing else had — the one finding of this round

The FIRST gate at `20c1844` was **RED**: 3 failed in `apps/server/test/dual-client/grant-backfill.test.ts`
(12.275, 12.276, 12.316). Ruling **P37.2** changed `listPendingPulls` from `string[]` to
`{ id, headSeq }[]`, and the dual-client rig's **hand-mirrored** copy of `drainPendingPulls` kept iterating
it as ids. The whole object then travelled as a ticket id into `bootstrapTicket` **and** into
`clearPendingPull`, whose filter is `t.id !== ticketId` — an object never equals a string, **so nothing was
ever cleared and the second drain re-pulled every id**. The diff said it: the received array held the same
id TWICE. Not a wrong id, a duplicate one.

**`typecheck` catches it** — re-introducing the single line alone gives `EXIT=2`, two `TS2345` at
`rig.ts` 481/482. So it was statically catchable all along and nothing had run it: this file's own previous
block records that **no green full gate existed after P37.2/P37.3**, and this is what was sitting in that
gap. In the red gate turbo stopped at `server#test` with 20 of 30 tasks done, so `server#typecheck` never
reported either — a failing test can hide a type error behind it.

Fixed at **`bdc93d7`**; `grant-backfill.test.ts` 4 passed (4), server typecheck 6/6 exit 0. **The controller
found the identical defect independently in CI at `20c1844` and messaged it while the fix was already
committed** — two parties, same root cause, which is the peer-review property this topology exists for.
*The rig's docblock argues its mirror is FORCED rather than chosen, and that argument is still right. This
is the cost it carries: a forced mirror drifts, silently, until something runs it.*

### The fixtures, and the derivation that decided their shape

12.317 and 12.318 are P37.3's excluding pair. Reviewed by an opus reviewer that read the RUNS; it confirmed
discrimination from the failure shapes and independently swept for other `applyServerItem` doors
(`outbox.ts:334` is the only one and carries a rebuilt envelope, never an instruction). Two Minor findings,
both false sentences in the file, both fixed at `84514aa`. **Measured, all four matching prediction:**
never-drop → **12.317 ALONE**; always-drop → **12.318 ALONE**; never-below → **9** (12.310 surviving);
always-pull → **12.305 + 12.313**.

⚠️ **The race 12.318 models is NOT socket-reachable today** — `applyChain` is strictly serial and every
`drainPendingPulls` call site is on it, so keyed and unconditional drop are behaviourally identical through
`onItem` alone and a socket-driven fixture would have passed a guard that does nothing. 12.318 writes
through `replica.applyServerItem` from inside `pullImpl`, the public-API writer `replica.ts` documents.

### Honest limits — what is NOT verified

- **12.290 stays 🟡.** Nothing here can cut a socket; Lane D takes that fixture after #161 merges.
- The negative-existence half of the unreachability claim is scoped to `packages/sync-client` as it stands.
  A shell outside the package holding the `Replica` can reach it — which is exactly what 12.318 models.
- ⚠️ **`locked-test.sh` and `gate.sh` in the reference copy hard-code `REPO=/…/lane5-plan11`.** Repointed in
  this lane's scratchpad copies. **The first mutation sweep's `CHECK_ENV_EXIT=0` was therefore a fact about
  Lane E's tree**; the gate figures above are from the repointed script and are this tree's.
- **Recorded with an owner, not fixed:** a pull abandoned by `withTimeout` that later rejects with
  `TicketPullNotFound` is an unhandled rejection nobody catches. Owner Plan 6 / sync-client.
- §12's header contradicted itself after the rebase — it said both "next free 12.340" and "The next free
  block is `12.320`" (Lane A's, landed). Reconciled at `20c1844`.

---

## ⏸ POSITION AT THE 12:35 RELAUNCH — READ THIS FIRST

**PR #161 is OPEN, CONFLICTING, and HELD at `632ad04`.** It is NOT clear to merge. `CONFLICTING` is the
owed rebase, **not** a new defect. The previous session halted at the 10:32 limit with a full fix round
ahead of it; nothing was lost — its tree was clean and its head is on `origin/exec/29-closure5b-reach`.

| anchor | value | how verified |
|---|---|---|
| branch | `exec/29-closure5b-reach` | `git status --porcelain --branch` |
| HEAD | **`632ad04`** — equals `origin/exec/29-closure5b-reach`; tree clean except an **untracked `gate.log`** (never `git add -A`; it rode into two of Lane A's commits that way) | `git rev-parse HEAD origin/…` |
| merge-base | **`b4e2f14`** | `git merge-base HEAD origin/main` |
| rebase owed | onto **`origin/main` = `3e6d606`** (supersedes the override's `5fca89e`, which is code-identical to `2d2bc5c`; `3e6d606` is one docs commit on Lane A's `executor-state.md` and does **not** touch this lane's files). Since `b4e2f14`: #154, #167, #169, #173, **#176**, docs | `git rev-parse origin/main`, `git show --name-only 3e6d606` |
| conflicts expected | four files, all also changed by **#176**: `apps/server/test/integration/client-contract.test.ts`, `packages/app-core/src/online/stream.ts`, `Features.md`, `test-cases/12-offline-sync-apps.md`. **KEEP BOTH SIDES** — #176 added `LIST_PAGE_CAP`/`mapListPage`/`ListPage` and ids 12.256–12.259, 12.320–12.322, 7.220. Never drop a landed id | controller's measurement, 12:31 |
| node | v22.22.2 (`source ~/.nvm/nvm.sh && nvm use 22`) — the machine default is v24 and gives a FALSE RED of ~14 better-sqlite3 failures | `node -v` |
| last full gate | **still RED at `f814db3`** on one app-core fixture, since FIXED (`ticketIds` → `tickets`); **no green full gate exists after P37.2/P37.3.** The gate owed below is the first one that will | — |
| §12 ids | this lane holds **12.290–12.319**; used through **12.316**, so **12.317 and 12.318 are the P37.3 pair** and 12.319 is the last. Next block if needed: **12.340–12.359, allocated 12:35** — add it to `test-cases/12`'s header in the same PR. Never mint above 12.359 without asking | `grep -o '12\.[0-9]\{3\}'`, sorted |
| case-id control | at `632ad04`: `CHECK_EXIT=0` · bare 856 + bold 468 + marker-first 8 = **sum 1332 == union 1332**, zero duplicates, highest `13.100`, 10 files | `node scripts/check-case-ids.mjs` |
| import style | `sync-engine.test.ts` imports `../src/replica/replica.js` and `../src/engine/sync-engine.js` — **relative, so a `src` mutation IS visible under bare vitest** (a by-package-name import would have resolved through a stale `dist` and returned a well-formed zero) | `sed -n '1,15p'` of the test file |

### ✅ MEASURED 12:49 IST at `bc45bba` — all four match prediction, and the pair DISCRIMINATES

One locked quiet window (lock free on entry, zero live vitest pools). Denominator is the whole
`sync-client` package, 8 files / 87 tests. Baseline `87 passed (87)` **before and after** every mutation;
every restore left `dirty-src-files=0`; every edit was grep-confirmed PRESENT before its run.

| mutation | site | predicted | MEASURED |
|---|---|---|---|
| never drop (the `TicketPullNotFound` arm's drop deleted) | `sync-engine.ts` | 12.317 alone | **12.317 ALONE**, `1 failed \| 86 passed` |
| always drop (the `headSeq` guard deleted) | `replica.ts` | 12.318 alone | **12.318 ALONE**, `1 failed \| 86 passed` |
| never below (`< headSeq` neutered to `false`) | `replica.ts` | **7 at derivation, 9 at this tree** | **9** — 12.305, 12.306, 12.308, 12.309, 12.311, 12.312, 12.313, 12.317, 12.318; **12.310 SURVIVES** as predicted |
| always pull (`<` → `<=`) | `replica.ts` | 12.305 + 12.313 | **12.305 + 12.313**, `2 failed \| 85 passed` |

Items 1 and 2 of the outstanding list below are therefore DONE. **Do not re-run them.** What remains is the
rebase, the gate and the report.

⚠️ **The lock reference script `locked-test.sh` hard-codes `CWD=/…/lane5-plan11` (Lane E's root)** — the
README says the paths inside are per-worktree and it means it. The sweep was unaffected because the
mutation script used absolute paths to THIS worktree, verified after the run by both trees being clean.
**But the `CHECK_ENV_EXIT=0` that wrapper prints is a fact about Lane E's tree, not this one**, and must not
be reported as this lane's. Run `pnpm check:env` from this root, on its own line, in the gate.

### WHAT IS OUTSTANDING, in order

1. **P37.3's two excluding fixtures, ids 12.317 and 12.318** — both directions, each alone.
   **(i)** the revoked-project sequence: after ONE 404 the id is gone and **no request is issued on any
   later catch-up** (mutate the drop away → red: a request per catch-up, for ever). Drive **two** later
   catch-ups, not one — "no request on any later catch-up" is a claim about the steady state, and a single
   catch-up cannot distinguish it from one-shot suppression.
   **(ii)** the RACE: a second notice for the same id arriving between the pull's issue and its 404 → the
   id stays pending and the next catch-up pulls it (mutate the drop to UNCONDITIONAL → red).
   Say at the case that "may not see" and "never existed" stay indistinguishable to the device, and that
   this is why the drop is keyed to the notice's `workspaceSeq` rather than to the status code.
   **Discrimination is FOUR runs, not two** — each fixture must redden under its own mutation *and survive
   the other*, or (ii) is measuring (i) twice.
2. **Two handed-over `headSeq` mutations, derived but NOT run**, on `replica.ts`'s
   `if ((await localHeadSeq(storage, id)) < headSeq)`. **The predictions were derived BEFORE 12.317/12.318
   existed and both new fixtures route their initial entry through that same filter**, so report three
   numbers — predicted-at-derivation, predicted-at-this-tree, measured — or a correct measurement reads as
   a finding: **never below** → predicted 7 at derivation (12.305, 12.306, 12.308, 12.309, 12.311, 12.312,
   12.313; only 12.310 survives), **9 at this tree** once the new pair lands; **always pull** (the `<=`
   off-by-one) → **12.305 and 12.313**, unchanged at either tree, because an unheld id is `0 < h` and
   `0 <= h` alike. **Run them in a QUIET WINDOW under the lock with nothing else touching the tree** — see
   the contamination record. Restore with `git checkout HEAD -- <path>`, verify by READING the region.
3. Rebase onto `3e6d606`, `pnpm install --frozen-lockfile`, `pnpm rebuild better-sqlite3`, rebuild,
   recount §12, **full gate under lock v3.2**, push, re-report the head to the controller and HOLD.

### ⚠️ THE RACE IN (ii) IS NOT REACHABLE THROUGH THE SOCKET, AND THE FIXTURE MUST SAY SO

Derived at this tree, before writing: `applyChain` is **strictly serial**, and every `drainPendingPulls`
call site — `applyOne`'s `reach-granted` arm, `recoverByPull`, `onCaughtUp` — is on that chain. A second
notice arriving over the socket is queued *behind* the link that is holding the in-flight pull, so it
cannot write between the pull's issue and its 404. `withTimeout`'s abandonment cannot deliver a late 404
to the `catch` either: `Promise.race` has already settled, so that rejection is unhandled and never
reaches `dropPendingPullIfUnchanged`. **Through the socket path, keyed and unconditional drop are
behaviourally identical** — N2 has not written at drop time and re-adds the id afterwards either way — so
the unconditional mutation SURVIVES any fixture driven purely through `onItem`.
The honest second writer is the one `replica.ts`'s own docblock names: *"the set is public API and a shell
may add to it too."* Fixture (ii) therefore writes through `replica.addPendingPulls` from inside
`pullImpl`, and the case states that the interleaving is not socket-reachable today, that this models the
documented public-API writer, and that the keying becomes socket-load-bearing only if the drain ever runs
off-chain. Without that sentence a reader concludes the socket path is what is being pinned.

**Recorded, not fixed, owner Plan 6/sync-client:** a pull abandoned by `withTimeout` that later rejects
with `TicketPullNotFound` produces an **unhandled rejection** nobody catches — `Promise.race` has settled
and `net/http-transport.ts` calls bare `fetch` with no `AbortSignal`. Outside these two fixtures' scope.

## LIVE ANCHORS — measured 2026-09-06 after the #139 merge and the closure-5b relaunch. RE-VERIFY BEFORE TRUSTING.

| anchor | value | how verified |
|---|---|---|
| branch | `exec/29-closure5b-reach` | `git branch --show-current` |
| cut from | originally `origin/main` = `1b72900` (#139); **REBASED ONTO `c8268e1`** (Lane A's closure 4, #141) — rebase exit 0, 4 commits replayed | `git rebase origin/main` |
| HEAD | **`8e45ef7`** at this writing (closure 5b commits 1–8) | `git rev-parse HEAD` |
| tree | clean | `git status --porcelain` |
| node | v22.22.2 | `node -v` after `source ~/.nvm/nvm.sh && nvm use 22` |
| build | after the rebase: `pnpm install --frozen-lockfile` + `pnpm turbo run build --concurrency=1` → **exit 0** | one invocation |
| typecheck | **`pnpm turbo run typecheck --concurrency=1` → exit 0, 16/16** at every commit boundary | direct runs, not the gate |
| §12 recount | at `8e45ef7`: **plain 217 + bold 10 = 227 = union, zero duplicates, max `12.291`** — union equals the SUM, which is the signal that no id style is being missed | the union-vs-sum control below |
| gate | **`GATE_EXIT=0` at `29d963c`** (re-run at the PR head after the controller-ruling commits; identical composition to the `ed455ae` run) · `Tasks: 30 successful, 30 total` · `Cached: 0 cached, 30 total` · node **v22.22.2** (the script printed it; note turbo's own error lines resolve pnpm from `v24.11.1`'s bin — report both) · `pg_isready` accepting · lock **v3.2**, acquired and released clean. **3385 tests / 263 files**, enumerated: domain 464 · ui 37 · rule-engine 282 · editor 178 · sync-client 80 · app-core 1093 · server 1090 · desktop 5 · web 136 · mobile 20. *It took THREE runs: run 1 red on app-core's published-union completeness case (missing fixture); run 2 red on that case again for the missing `parseFrame` branch, then on `apps/server`'s cross-package `CLIENT_STREAM_TYPES` pin — both union consumers no type error could find.* **MUST BE RE-RUN at the final sha** — this lane's own #139 record says a gate carried across intervening docs commits is not a gate. | one backgrounded invocation under the lock |

**§12 ids: this lane holds 12.290–12.319. 12.290 (the wedge, ❌) and 12.291 (the cap) were consumed by
#139 — MINT FROM 12.292.** Ask the controller before 12.320. Use the union-vs-sum control (below); the
one-style grep cannot see a collision against a bold-style id.

---

## POSITION — closure 5b, and the commit plan it is being built to

| # | commit | state |
|---|---|---|
| 1 | reconcile extraction — `reconcileHeldIds`, one implementation, two callers | **DONE** |
| 2 | **(d)(i)** replica per-ticket door + durable pending-pull store (12.292–12.298) | **DONE**, 4 mutations |
| 3 | **(d)(ii)+(iii)** `bootstrapTicket` exported; the per-ticket route (12.299–12.301, 12.303) | **DONE** |
| 3b | provenance regression the closure-4 rebase exposed (12.302) | **DONE**, 1 mutation |
| 4 | **(d)** the NOTICE — domain frame, both `SyncItem` mirrors, hub, transport, `grant-backfill.ts`, `visible-events-for.ts` | **DONE** |
| 5 | **(d)** the engine — drain in `applyOne`, leftover drain + reconcile in `onCaughtUp`, pull timeout, single-flight latch | **DONE** |
| 6 | **(a)** 12.283 `readerReachNoticeFor` + its own test file | **DONE**, scope mutation now kills |
| 7 | **(b)** 12.288 + 12.305–12.308 — schedule, drain, timeout | **DONE**, 8 mutations |
| 8 | **(c)** 6.102's guest side — 12.304, an APPLICATION, no escalation | **DONE** |
| 9 | 12.275–12.282, 12.289, 12.291 rewritten for the notice shape | **DONE**, 5 mutations |
| 10 | catalogue — `Features.md` §12 + `test-cases/12` (12.292–12.308, 12.283 and 12.288 flipped) | **DONE** |
| 11 | rebase onto `b4e2f14` (#150) · full gate · PR | **DONE — PR #161 OPEN at `89b29ca`, MERGE HELD** |
| 11b | Fable branch review | **IN FLIGHT.** The PR body and the controller both say merge waits on its outcome |
| 12 | **T18** — still HELD, after 5b merges, re-measured against `origin/main` at the moment it starts | |

### MUTATIONS RUN — every result is the measurement, not the intent

| mutation | result |
|---|---|
| `GRANT_BACKFILL_TRIGGERS` → `[]` | **9 failed \| 3 passed** — all seven visibility cases plus 12.275 and 12.276. *Agent-predicted "all seven"; measured nine, because two dual-client cases ride the same mechanism.* |
| `grantNoticeFor`'s own `canSee` → permits | **12.280 ALONE**, `1 failed \| 11 passed` |
| the walk cap removed | **12.291 ALONE**, `1 failed \| 11 passed` |
| the notice yielded AFTER its trigger | **4 failed** — 12.277, 12.278, 12.281, 12.282 |
| `readerReachNoticeFor` ignores the project scope | **SURVIVED at first** — an unconstrained path, not a dead mutation (edit confirmed absent-then-present either side). Fixture fixed; now **reddens the project case ALONE** |
| per-ticket door advances the cursor | **12.293 ALONE** |
| pending set in-memory | 12.295 + 12.297 (both depend on the store) |
| `revokeScope` stops clearing the pending key | **12.297 ALONE** |
| the door ignores its `definitions` | **12.298 ALONE** |
| the door drops the provenance argument | **12.302 ALONE** |
| `onCaughtUp` scheduling neutralised | 12.288 + 12.307 — *no honest 12.307 leaves 12.288 alone; a discriminating second mutation (skip the purge) reddens 12.288 + 12.287* |
| drop `await drainPendingPulls` from `applyOne` | 12.305, 12.306, 12.308 |
| drop the holdings filter in the `reach-granted` arm | **12.305 ALONE** |
| rethrow inside the drain's catch | 12.306 + 12.308 |
| `true \|\|` the interval guard / once-per-process | **12.307 ALONE**, in opposite directions |
| drop `withTimeout` | **12.308 ALONE** — as a 7 ms assertion, not a runner timeout |

### ⚠️ (a) MUST COME AFTER (d), AND IT IS NOT THE ORDER THE OVERRIDE WRITES

The override says (a) uses *"the same backfill shape as `grant-backfill.ts`, keyed on the viewer"*. That
sentence was written while `grant-backfill.ts` was PUSH-shaped, and (d) deletes that shape. A
`membership.granted` at a higher role, or a `project.member_added` onto a project full of project-mode
tickets, admits **far more** than one inheriting subtree — so (a) built on the current shape would
reintroduce P37.1's wedge at larger scale, **in the same PR that fixes it**. (a) is therefore built as a
viewer-keyed NOTICE, after (d) exists to be keyed. *Not a ruling ask: it follows from the override's own
(d). Recorded so a restart does not "correct" the order back.*

---

## WHAT THE CLOSURE-5b PRE-FLIGHT ESTABLISHED — four verifications, 2026-09-06, read from source

**These cost ~343K subagent tokens to establish. A restart should read them before re-measuring.**
Two of the four changed the design rather than confirming it.

### 1. The wedge fix's load-bearing chain — SPLIT: four links hold, the fifth was overclaimed, and a SECOND door reaches the residual

Links **ESTABLISHED**: an instruction-shaped notice cannot move either cursor (`hub.ts:253` advances
`sub.cursor` only inside the ENVELOPE arm at `:248`; the instruction arm `:216-247` never touches it) ·
a cut-short socket sends no `caught-up` (`hub.ts:206-209` closes and detaches, `:163-164` sets
`sub.ended`, and the caught-up send is guarded at `:268` by `!sub.ended`) · the client's ONLY production
cursor write is `sync-engine.ts:388` inside the `onCaughtUp` link · reconnect resubscribes at the
persisted cursor (`sync-engine.ts:401-411` → `replica.getCursor`) · the trigger is strictly above
`afterSeq` so it is re-yielded (`visible-events-for.ts:373`), and `backfilled` is per-DRAIN
(`:399`), so the notice is regenerated with it.

**THE RESIDUAL IS UNREACHABLE VIA `applyChain` — but only under THREE OBLIGATIONS on code not yet
written**, and the reason is not promise adoption, it is that the caught-up link reads its guard INSIDE
the link (`sync-engine.ts:385-392`), so a pull that throws retroactively cancels an already-queued
cursor write:
- **(a) the pull must be `await`ed inside `applyOne`, NEVER in an item listener.** `sync-engine.ts:363-369`
  calls listeners synchronously and swallows their throws; a pull there is outside the chain and
  `setCursor` runs first.
- **(b) it must be all-or-nothing across the notice's ids** — a swallowed per-id failure lets `setCursor`
  run with ids unpulled. *(See the pending-pull store below: this obligation and the anti-brick policy
  are in direct tension, and the store is how both are satisfied.)*
- **(c) the per-ticket applier must NEVER write `cursor:<workspaceId>`.** `loadBootstrap`
  (`replica.ts:607`) does, unconditionally — a `loadBootstrap`-shaped applier would advance the
  WORKSPACE cursor from inside a one-ticket pull.

**⚠️ AND A DOOR THE CHAIN NEVER TOUCHES REACHES THE RESIDUAL ANYWAY.**
`packages/sync-client/src/net/http-transport.ts:169-245` is an **if/return ladder with no `else` and no
`default`** — it ends at `:245` with no trailing branch. A frame type a client build does not know is
**dropped silently**, while the trigger event that follows it is accepted (`:189`) and the `caught-up`
behind it still advances the cursor past the trigger (`:243` → `sync-engine.ts:388`), after which
`needsBootstrap` (`sync-engine.ts:463`, `getCursor !== 0`) will never re-bootstrap over it. **Version
skew — server ahead of client — is a normal deployment state, not an exotic interleaving.** The same
door drops a notice whose `workspaceId` is absent or mismatched (`:205`). *Client and server ship
together here, so this is not live for THIS change set; it is the reason convergence must not depend on
notice re-delivery alone, and it is recorded with an owner rather than fixed inside closure 5b.*

**Link 5 as stated is FALSE and the weaker form is what holds.** The slow-consumer bound reads the
socket's currently-unflushed backlog BEFORE the send (`hub.ts:206`, `DEFAULT_MAX_BUFFERED_BYTES = 1_000_000`
at `:75`), so an arbitrarily large single frame is admitted whenever the backlog is clear — the bound is
not on the size of the re-delivered unit. What is true, and sufficient: **the notice is strictly smaller
than today's burst.** Also: `GRANT_BACKFILL_MAX_TICKETS` is **per trigger**, and `backfilled` dedupes
only within one drain, so N triggers in one drain produce up to N notices.

### 2. A stall is a ONE-WAY LATCH, so the anti-brick policy is mandatory — and the candidate policy was incomplete

`stalled` has exactly three touches (`sync-engine.ts:268` declare, `:336` set inside `stall`, `:472`
cleared inside `start`). **Nothing else clears it.** Mobile never calls `start()` again; desktop calls it
only on an OS `online` event; the UI renders the state as plain *"Offline"*. So a transient failure at
either new call site would BRICK the client until process restart, where before (d) it merely lost a
backfill.

The candidate policy — *swallow, leave the id unheld, let the next event's bootstrap-before-apply catch
it* — is right in direction and **incomplete on two counts**:
- **Non-convergence.** Nothing re-drives a swallowed id. → **the durable pending-pull store.**
- **Hung-request silence.** `http-transport.ts:124` is a bare `fetch` with **no `AbortSignal` anywhere in
  the file**, and `applyChain` is strictly serial. Without a per-pull timeout, (d) trades today's LOUD
  terminal brick for a SILENT one: status stuck at `live`, `stalled` false, `settled()` never resolving,
  nothing surfaced. **A timeout is a prerequisite of (d), not a polish item**, and the same timeout is
  required on (b)'s reconcile call.

### 3. THE DESIGN DECISION THIS FORCED — a DURABLE pending-pull set, not a re-delivery bet

Obligation 1(b) (all-or-nothing, or the cursor advances with ids unpulled) and finding 2 (never stall on
a transient failure) pull in opposite directions. Both are satisfied by making the unpulled ids
**durable client state** rather than something re-derived from a re-delivered notice:

- a failed or timed-out pull records its id under a `meta` key on the replica (key/value, no migration —
  `meta` is where `cursor:` and `me` already live);
- the cursor is then free to advance, so **nothing bricks**;
- every catch-up drains the pending set before it does anything else, so **it converges**;
- it survives process restart, which a re-delivered notice does not;
- and convergence stops depending on the notice arriving twice — which matters precisely because
  finding 1's transport ladder can drop it silently.

*The excluding fixture writes itself: fail a pull, assert the id is still pending after a fresh replica
is opened over the same storage, and that the next catch-up pulls it. Mutate the persistence to be
in-memory → red.*

### 4. The per-ticket route MUST carry definitions — and the LATEST one is not enough

**ESTABLISHED, hazard REAL.** The full bootstrap ships every `workflow.defined` / `ticket-type.defined`
in the workspace inside the same `REPEATABLE READ` cut as `streamSeq` (`sync-routes.ts:77-83`, `:193-224`),
and over the live stream definitions are class `'definition'` and yielded **unconditionally to everyone**
(`visible-events-for.ts:212-215`, `:519-533`) — which is exactly how the push path avoids the hazard
today: a ticket's workflow necessarily has a lower `workspace_seq` than any event depending on it, and
single ordered delivery means the definition lands first.

**A per-ticket HTTP pull breaks that invariant** — it is a separate request with no analogue of
"read the stream position first, ship the definitions for that same cut". Reached with an empty
`definitions`, `latestByWorkflow` is empty, `foldSnapshotForward` **silently no-ops**
(`replica.ts:479-482`: `if (latest === undefined || …) return state;`) and the failure surfaces one step
later in `refoldTicket`'s replay against `buildLocalDeps` (`local-deps.ts:49-62`).

Exact throws a client would see: `applyTicketEvent: workflow "<id>" vanished — replay integrity is
broken` (`ticket-state.ts:153-157`, the realistic 5b case: an existing ticket newly made visible whose
tail carries a `ticket.transitioned`), or `unknown ticket type "<id>"` / `workflow "<id>" is not defined`
(`:108-117`) for a tail beginning at `ticket.created`.

**Minimum fix: the FULL VERSION CHAIN of every workflow/ticket-type the pulled ticket's snapshot and tail
reference — not just the latest.** `foldTicketToWorkflowVersion` / `workflowVersionsOf` need every
intermediate version to walk a stale snapshot forward, and a gap throws *version chain has a hole*
(`ticket-state.ts:311-313`). Shipping only the latest is not "cheaper but safe".

### 5. The cap and case 12.291 change MEANING under the notice shape

12.291's assertion counts `ticketsTouched` — a Set built from `entity.id` across delivered **LedgerEvents**
(`apps/server/test/visibility/grant-backfill.test.ts:318-333`). Under the notice shape there is no
per-candidate history stream to filter, so **that assertion mechanism ceases to exist** and must be
rewritten against the notice's id list. The constant's UNIT (per-ticket-count) survives; its
JUSTIFICATION does not.

**And `grant-backfill.ts`'s own docblock paragraph becomes FALSE**: *"Truncation is SILENT on the wire,
and there is nowhere honest to put a notice: … inventing a wire member … would be a protocol nobody
agreed and a fourth `SyncItem` arm."* P37.1 agreed exactly that protocol, so the paragraph must be
rewritten rather than left to contradict the code beneath it.

**The real cost site moved and the cap does not sit on it.** The walk is still N `proj_visibility`
queries; the notice is N ids (trivial at any N); but the CLIENT now makes up to N HTTP pulls — a cost
dimension that did not exist when P37.1 was ruled and that 200 was never chosen to bound.

**12.290 (the wedge) may flip to ✅ but MUST NOT be flipped on this analysis** — it is a prediction until
a slow-consumer close mid-pull is followed by measured convergence.

---

## ⚠️ THE FINDING A REVIEWER SHOULD AIM AT FIRST — the grant half does not close 12.274 alone

**Found by the agent rewriting 12.275, and it would otherwise have shipped as a green test.**

The client's notice filter is *"do I hold this ticket"* (`applyInstruction`'s `reach-granted` arm asks
`getTicket(id) === null`). **A device can hold a STALE PARTIAL copy** — a narrowing purges nothing,
because the per-event walk was struck on 6.101 and 6.104 is the disclosed residual, both deliberate. So
in 12.274's own script the re-widening's notice names a ticket the client "holds", nothing is fetched,
and the divergence survives wearing closure 5's clothes. **A straight port of the old case would have
been green and false.**

**What actually closes it is BOTH halves of closure 5, in the order `onCaughtUp` runs them:** `reconcile`
purges the stale copy first, and only then does a notice find a ticket the device does not hold. The
narrow half is not an independent feature shipping alongside the grant half — it is a PRECONDITION of the
grant half converging. Now written into `grant-backfill.ts` rather than left to be rediscovered.

**The residual, disclosed rather than escalated** (it is the same family as 6.104, and P37.1 already
accepted "what a truncated client loses is history it did not have a moment ago"): `reconcile` is bounded
by `RECONCILE_MIN_INTERVAL_MS`, so a narrow-and-re-widen inside that window of the last automatic
reconcile leaves the stale partial copy with no repair — the notice is spent, and the next reconcile will
not purge a ticket the device may now legitimately see. **12.274's defect at reduced width: bounded in
time where it used to be permanent and unconditional.** *Owner: unassigned.*

**Both obvious repairs are worse and are named in the source so nobody spends the round.** Dropping the
holdings filter closes this and reopens the amplifier the filter exists to bound (`check-permission.ts`
does not refuse a no-op `visibility.set`). Moving the filter from record-time to drain-time does not help
either: the drain that matters runs inside `applyOne`, ahead of the trigger, which is where the refold
hazard requires it — and that is before any reconcile in the same catch-up.

## FOUR THINGS CLOSURE 5b LEARNED THE HARD WAY — all four will recur

1. **`git add -A` WITH SUBAGENTS RUNNING COMMITS THEIR WORK-IN-PROGRESS UNDER YOUR MESSAGE.** Two
   commits on this branch (`6edf5db`, `f307299`) carry hunks of test files an agent was mid-rewrite on,
   under messages describing something else entirely. Nothing was lost and nothing was corrupted, but on
   a branch where the commit message IS the record, a commit that misdescribes itself is a defect.
   **Stage explicit paths whenever an agent is writing.** The history was not rewritten to fix it —
   rebasing under running writers trades a cosmetic problem for a real one — so a later commit says what
   happened instead.

2. **`grep -c "it("` IS NOT A CASE COUNT, and the wrong number was load-bearing before it was caught.**
   It counts every occurrence of that substring. `reconcile-route.test.ts` was recorded as having
   "eight cases"; it has THREE. That figure was the arithmetic in the argument for extracting
   `reconcileHeldIds` instead of pointing the rig at `inject()` — an inflated coverage count made the
   existing HTTP tests look like more of a reason than they were. The conclusion survived the
   correction; the number did not, and it had already reached two source docblocks and this file.
   **What caught it was the RUNNER's own line** (`Tests 10 passed`), not any review. Count `it` blocks
   with `grep -nE "^\s*it\("`, or better, read the runner's number.

3. **THE COMPILER IS THE ENUMERATOR — except for the ONE it could not see, which was the dangerous one.**
   Adding a fourth arm to `SyncItem` / `ServerStreamFrame` located **SEVEN** consumers. Six were compile
   errors: `http-transport`'s `TS2344` exhaustiveness assertion, `replica.applyInstruction`'s `TS2366`
   no-default switch, `app-core`'s `replica-data-source` (`TS2339`), two test helpers (`TS2322`,
   `TS2339`), and `hub.ts` — whose `if/else` read *"purge, otherwise scope-revoked"*, so a new
   instruction would have been handled AS A REVOCATION, which detaches the subscription and tells the
   replica to empty itself; what saved it was an accident of field names, and it is a `switch` with no
   `default` now.
   **The seventh was `packages/app-core/src/online/stream.ts`'s `parseFrame`, and it returned `null`.**
   It is a SECOND, INDEPENDENT reader of this wire — the other is sync-client's transport — linked to the
   published union by nothing but `serverStreamFrameSchema` and one case that walks its option list.
   Without the branch the notice was silently dropped there while the trigger behind it was accepted:
   the exact failure `parseFrame`'s own closing comment warns about, one line below where it happened.
   **What caught it was a RUNTIME COMPLETENESS GUARD in the full gate, not the typechecker and not a
   review** — and it reddened twice in the right order, first for a missing fixture and then for the
   missing branch. *A typecheck is not a sweep for a WIRE union; only a case that walks the published
   schema is.*

4. **GATE ENVIRONMENT: the gate script printed `v22.22.2`, and turbo's own error line named
   `/Users/kiro/.nvm/versions/node/v24.11.1/bin/pnpm`.** The failure it reported was real and
   Node-independent, so nothing was lost this time — but the drift is exactly the one this machine's
   record warns about, where a native binding turns it into a false green instead. **Report the Node the
   script printed AND note that turbo's task spawn resolves pnpm from elsewhere.**

5. **THE PERMISSION HOOK BLOCKS THE WHOLE COMPOUND COMMAND, not just the offending clause.** A
   `python3 <<EOF … EOF` edit followed by `… | head` in ONE Bash call ran NEITHER: the edit silently did
   not happen, the next run reported the same failure, and it read exactly like the edit having no
   effect. **Verify an edit landed (`grep -c`) before concluding anything from the run after it.**

6. **THE COMPILER IS THE ENUMERATOR FOR INTERFACES TOO.**
   Adding a fourth arm to `SyncItem` / `ServerStreamFrame` located **five** consumers — the transport's
   `TS2344` exhaustiveness assertion, `replica.applyInstruction`'s `TS2366` no-default switch,
   `app-core`'s `replica-data-source` (`TS2339`), and two test helpers — plus `hub.ts`, which was the
   dangerous one: its `if/else` read *"purge, otherwise scope-revoked"*, so a new instruction would have
   been handled AS A REVOCATION, which detaches the subscription and tells the replica to empty itself.
   What saved it was an accident of field names. It is a `switch` with no `default` now.
   Adding a fifth method to `SyncTransport` located **seven** implementors, five needing changes —
   including `packages/app-core/test/replica/replica-data-source.test.ts:486`, the inline literal with no
   type annotation that #139 already recorded as invisible to any textual search.

4. **GATE LOCK v3.1** (controller, 2026-09-06). The directory form is superseded: it had an empty-pid
   window in which a live holder was indistinguishable from a corpse, and two lanes measured a live
   holder being robbed. v3 is an `O_EXCL` FILE written in one atomic step; **v3.1 fixes one defective
   line in v3** — its idle check used `pgrep -fl 'gate.sh|locked-test.sh' | grep -vc`, which counts
   LINES, and a Claude session's argv is its whole multi-line brief, so once any brief quoted a script
   name the count could never reach zero. Same class as `pgrep -f vitest`, one turn later. This lane's
   working copy of the v3.1 script is in the session scratchpad and has been exercised once
   (acquire → drain → run → clean release).

## WHAT CLOSURE 5b DID NOT CLOSE — recorded with owners, not fixed

- **12.290 stays 🟡.** The wedge's mechanism is gone, but the ruling's flip condition — a slow-consumer
  close MID-PULL followed by convergence on reconnect — is unmeasurable here: the dual-client rig has no
  socket by construction (`openStream` throws, deliberately) and the engine's tests use a fake transport
  with no buffer bound. Measured link by link, never end to end. *Owner of the remaining measurement:
  unassigned — it needs a harness that can cut a socket mid-drain, which no lane has built.*
- ~~**The stale-partial-copy window.**~~ **CLOSED in the fix round by closure 5c's minimal form, and the
  original entry here was WRONG.** It said `RECONCILE_MIN_INTERVAL_MS` bounded the window. It does not:
  `hub.ts` sends `caught-up` once per SUBSCRIPTION (`caughtUpSent`), so the automatic reconcile is once
  per RECONNECT and a narrow-and-re-widen with no reconnect between them never reconciles at all — on a
  stable socket the "bounded" residual was the FULL defect. Found by the branch review. The client's
  `reach-granted` handler now reconciles the ids the notice NAMED before deciding what to pull.
- **The subtree walk has no workspace predicate** — inherited from `reResolveSubtree`, whose own children
  query has none. Not a disclosure (`canSee` resolves each candidate's own workspace). *Owner: whoever
  refuses or legalises a cross-workspace `parent_id`.*
- **`http-transport.ts`'s frame ladder** ends with no `else`/`default`; an unrecognised frame is dropped
  silently. Not live (client and server ship together). *Owner: unassigned.*
- **`SyncTransport` takes no `AbortSignal`**, so the engine's pull timeout bounds the WAIT and cannot
  cancel the request. *Owner: unassigned — a signature change to a type with seven implementors.*
- **The per-ticket route re-sends all workspace definitions per pull.** Small while definitions are
  configuration. *Owner: unassigned — a client-side definition cache closes it without changing the
  route's contract.*
- **`foldSnapshotForward` tolerates a version-down fold silently** (a snapshot naming v2 folded under a
  local v1). Reachable through `loadBootstrap` too; not introduced here. *Owner: unassigned.*
- **The 200 cap now bounds a cost dimension it was not chosen for** — the client's pull fan-out. *That
  200 is the right number for it is NOT established.* *Owner: unassigned.*

## T18's PRECONDITION, measured 2026-09-06 rather than assumed — READ BEFORE STARTING IT

**T18 cannot be complete while what it catalogues is still moving**, and at this writing §12 is.
Measured against `origin/main`: Lane A has used **12.240–12.249** of its allocated block
**12.240–12.259** — ten ids still free, so Lane A may write more §12 cases. Lane B's own block is
12.290–12.319, of which 12.290–12.308 are in use after closure 5b.

**So when T18 starts: re-measure §12 against `origin/main` AT THAT MOMENT with the union-vs-sum
control** (per-style counts printed as the positive control; `union < sum` is the machine-readable
signal a style is being missed). If Lane A's remaining §12 writes have not landed, **tell the
controller and HOLD** rather than cataloguing a moving target — the controller decides whether T18
waits or closes with Lane A's items named as "landing under Lane A". That instruction is the override's,
not this lane's invention.

*Also outstanding for §12's scope notes at T18, per the controller's 2026-09-06 ruling: "a typecheck is
NOT a sweep for a wire union" goes in beside closure 3's "the compiler is the enumerator for
interfaces" — the fourth arm's EIGHT consumers, six type errors (including `hub.ts`'s `if/else` that
would have handled a notice AS a revocation) and two silent readers caught only by source-text cases.*

## THE CASE-ID CONTROL — copy this, do not write your own

`test-cases/12` carries ids in three styles across the repo (`- 12.274 🚫`, `- **12.240** ✅`,
`- 🧪 **13.1 —`). The one-style grep every lane reaches for **reported "zero duplicates" through a
collision it structurally could not see.** Extract from the LINE HEAD only, print per-style counts as the
positive control, and compare the union against their SUM — `union < sum` is the machine-readable signal
that a style is being missed. `scripts/check-case-ids.mjs` (blocking, in `check-env`) implements this
with a fixture asserting known counts, so the script's own blindness is a test failure.

```
grep -oE '^- (\*\*)?12\.[0-9]+' test-cases/12-offline-sync-apps.md | sed -E 's/^- (\*\*)?//' | sort -t. -k2 -n
```

---

## CROSS-LANE — Lane A, closure 4 (#141), and the four files we share

**Agreed with Lane A 2026-09-06, both directions confirmed in writing: LANE A LANDS FIRST, THIS LANE
REBASES.** #141 was `CONFLICTING/DIRTY` against `1b72900` and has to rebase past closure 5 regardless.

| file | Lane A's region | this lane's region |
|---|---|---|
| `packages/sync-client/src/replica/replica.ts` | the bootstrap type (~36), `writeSnapshot` (~247), `readSnapshotProvenance`/`getSnapshotProvenance`, **and one line inside `loadBootstrap` (~675, the `provenance` argument on the `writeSnapshot` call)** | a NEW exported per-ticket door + impl; `loadBootstrap`'s body otherwise untouched |
| `apps/server/src/sync/sync-routes.ts` | the bootstrap payload type and its return | export `bootstrapTicket`; register the per-ticket route |
| `packages/sync-client/src/index.ts` | appends `SnapshotProvenanceBlock`, `SnapshotClaim` | append-vs-append |
| `test-cases/12-offline-sync-apps.md` | 12.240–12.245 | 12.292+ |

**Lane A's confirmation, load-bearing for (d)(iii):** the provenance block lands ON the snapshot object
inside `BootstrapTicket` as `provenance?: SnapshotProvenance | null` — **OPTIONAL, not required-nullable**
(*"nullable describes the VALUE while additive describes the CONSTRUCTOR"*; a required nullable field
still forces every constructor to change, and it broke this lane's rig for one commit). It is populated
inside `bootstrapTicket` itself, **so exporting that function unchanged gets the block for free — which
is a second reason to export rather than reimplement.** On the client, `writeSnapshot` stores it in a
SIBLING TABLE and **deliberately does not delete the block when it has none**: absent means "nothing new
to say", never "forget what you knew" — so a per-ticket apply path passes the block through or passes
nothing, and never an explicit constructed `null`.

**Lane A's rebase warning, taken:** after rebasing past a merge that adds a package or changes exports,
`pnpm install` AND rebuild the dists before running app-core or sync-client tests. Imports by package
name resolve through `./dist`; a stale dist gives `X is not a function` and reads as a real regression.
Lane A lost a diagnosis to exactly that today (seventeen failures, `createSyncEngine is not a function`).

---

## DEVIATION TAKEN ON COMMIT 1 — extraction instead of `inject()`, and why

The override asked for the rig to call the real reconcile route through `inject()`. **Measured, and it
costs more than it buys.** The route reads `request.currentUserId`, which `makeRequireSession` fills from
better-auth's session — so the rig's three seeded users (`USER_A`/`USER_B`/`USER_ADMIN`, fixed ULIDs,
**96 references across `scenarios.test.ts`**) would have to become real auth users signed in through
`signInWithPhone`, whose ids better-auth mints and the rig cannot choose. And the HTTP shell those users
would exercise — bearer session, the 403 membership gate, the body schema and its `MAX_BATCH_SIZE` bound
— **already has cases of its own in `test/sync/reconcile-route.test.ts` (12.284-12.286).**

What no existing case could cover is the rig holding a SECOND COPY of the rule, which is the hazard
#139's review actually named. `reconcileHeldIds` is that loop, extracted; the route and the rig are its
only two callers; there is one implementation to drift. Both files state what the call does NOT reach, so
*"calls the real route"* is not read as more than it is. **The same shape is what (d)(ii) prescribes for
`bootstrapTicket`** — one function, route and rig as its two callers — so this is the branch's pattern
rather than a one-off.

---

**⚠️ THIS LANE'S §12 BLOCK (12.260–12.289) IS EXHAUSTED. The controller ALLOCATED 12.290–12.319 to
this lane on 2026-09-06** (next free 12.320, on request only). Do not mint from the header's maximum.

**⚠️ AND THE RECOUNT ITSELF WAS WRONG-METHOD — read this before running the control.** `test-cases/12`
carries ids in TWO styles: `- 12.274 🚫 …` and `- **12.240** ✅ …` (Lane A's closure-2b cases).
`grep -o '^- 12\.[0-9]*'` — the pattern a lane naturally writes, and the one this lane used — matches
215 and **silently misses 4**. The true figure at this sha is **221 ids (217 plain + 4 bold), max 12.291, zero duplicates, nothing above this lane's 12.319**.
The number being wrong is the smaller half: **the control exists to catch a BLOCK COLLISION and in that
form it cannot see one against a bold-style id**, so two lanes could both recount, both read "zero
duplicates", and both be wrong — the exact double-mint this file has paid for twice. Use, and print both
per-style counts beside the total as the positive control:
```
grep -oE '^- (\*\*)?12\.[0-9]+' test-cases/12-offline-sync-apps.md | sed -E 's/^- (\*\*)?//' | sort -t. -k2 -n
```
Now written into `test-cases/12`'s own header so the next lane copies a working control rather than
writing its own. *Reported to the controller as a method finding, not as a defect in this branch.*

**A third silent-empty mode fired during the same rebase check, and it is already on this machine's
record:** `git show <sha> -- <file> | grep "^+"` returned **0 matches** on a diff that visibly contains
added lines — the markers come back INDENTED (`  +- **12.240**`). Closure 2b's survival across the
rebase was therefore verified against the FILE (`grep -- "\*\*12.240\*\*"`, four for four), never
against a diff.

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

## ✅ RESOLVED (2026-09-06 ~01:50): the Docker blocker below is CLEARED — kept for its lessons

`pg_isready` accepting; `/dev/vda1` 58.4G with **12.8 G available (77%)**; build cache 12.60 GB → 442 MB;
images essentially untouched (39.79 → 39.35 GB, 29 → 28); all four containers up, **including the
owner's `mongo`, `redis` and `postgres:15.3`**; zero `gisik_test_*` remaining. Lane E cleared its own
build cache — 92% of which was its own image builds, zero entries active — and the owner independently
authorised exactly that least-destructive option when this lane put the three choices to them. The
36.8 GB of unused images stays the owner's call and is no longer urgent.

**Two lessons kept because they will recur:**
1. **`docker ps` said "Up 43 hours" throughout.** The container was up and the database was not. Never
   read database liveness off `docker ps`; use `pg_isready`.
2. **`createTestDatabase` drops its database in `drop()`, and a killed run never calls it** — which is
   how 39 accumulated. A sweep belongs at the START of a gate, because the end is the part that does
   not happen when it matters. Now Lane E's `sweep-test-dbs.sh`, dropping only idle ones (zero backends).

### The original blocker, as measured

**No lane could run `apps/server` tests or a full gate until disk was freed inside Docker.** Measured:

- `docker exec gisik-nokma-exec-postgres-1 df -h /var/lib/postgresql/data` → `/dev/vda1 58.4G 56.1G **0 available** 100%`.
- **The host Mac is fine** — 77 GB free on `/System/Volumes/Data`. This is Docker's own VM disk.
- Postgres cannot exit recovery: `PANIC: could not write to file "pg_logical/replorigin_checkpoint.tmp":
  No space left on device` → `checkpointer process ... terminated by signal 6` → `all server processes
  terminated; reinitializing` → repeat. `pg_isready` answers **no response**.
- **`docker ps` still says "Up 43 hours".** The container is up; the database is not. Do not read
  liveness off `docker ps` here.

**Where the space went, and it is not this project:** `docker system df` → Images 39.79 GB (36.83 GB
reclaimable), Build Cache 12.60 GB (12.60 GB reclaimable, **0 active**), Local Volumes 2.31 GB (1.44 GB
reclaimable). The 39 orphaned `gisik_test_*` databases totalled **331 MB** — real litter, under 1% of
the problem.

**What this lane did and did not do.** It dropped the 39 orphaned test databases (all idle, zero active
connections, checked before dropping). Those DROPs reached the WAL, and the checkpoint after them
PANICked — but the volume was already at 100% and `CREATE DATABASE` was already failing before any of
it, which is how the problem was found. Any write would have hit the same wall. **It did NOT run
`docker system prune` or `docker builder prune`**: that is destructive and machine-wide, and this
daemon also hosts `mongo`, `redis` and a `postgres:15.3` belonging to the owner's other projects. It
needs the owner's authorization and was surfaced to them.

**Recovery order when authorized:** `docker builder prune -f` (12.6 GB, nothing active) → if still
short, prune unused images → restart the gisik postgres container → `pg_isready` → re-run the rig.

**Standing fix worth making afterwards:** `createTestDatabase` drops its database in `drop()`, and a
killed or crashed run never calls it — which is exactly how 39 accumulated. A gate should sweep idle
`gisik_test_*` databases at the START of a run, because the end is the part that does not happen when
it matters.

## T14 — WHAT IS BUILT, AND THE THREE MUTATIONS THAT MEASURE IT

`apps/server/test/dual-client/rig.ts` (472 lines) and `rig.test.ts` (4 cases), plus **both**
`@gisik-nokma/sync-client` **and** `@gisik-nokma/app-core` as `apps/server` devDependencies. Self-test
**4 passed** under the lock at `0cbdc82`.

The implementer's own least-sure claim **HELD**: full `TicketState` equality between the replica's
reducer fold and the server's `rowToTicketState` row mapping. That is the property Task 15 leans on,
now measured rather than assumed.

| mutation | result |
|---|---|
| `ingestInteractive` swapped from `ingestClientBatch` back to `ingestBatch` | gated-door case red ALONE, `1 failed \| 2 passed` |
| `BOOTSTRAP_BACKFILL_TYPES` → the plan's four-entry literal | **ALL THREE CASES STAYED GREEN.** The edit was confirmed present before the run, so an unconstrained path — not a mutation that never fired. |
| the same, after adding the `visibility.set` case | that case red ALONE, `1 failed \| 3 passed`; `4 passed` on restore |

**The middle row is the finding.** The backfill correction was right and nothing tested it. A dropped
`visibility.set` would leave the replica holding a different AUDIENCE for a ticket than the server does,
and every Task 15 scenario asserting who can see what would have been asserting it against a bootstrap
the server never sends. The new case commits a `visibility.set`, runs the snapshot pass so the claim
sits BELOW the snapshot line — the only position where the backfill is load-bearing — then requires a
fresh client to still hold it. Its control (`not.toContain('ticket.created')`) proves the snapshot
actually covered the ticket, so "below the line" is a fact about the run rather than an assumption.

**Twenty-one departures from the plan's rig text**, of which two were errors in THIS FILE's own
correction table: `me.projectIds` needs `[...eff.projects.keys()]` (`EffectiveRole.projects` is a `Map`,
so the plan's spread yields `[key, value]` tuples — the shape matched, the value did not), and
workflow/ticket-type ENTITY ids must be ULIDs too, not only users and the workspace.

## T14 FABLE REVIEW — no Critical; three Important, all FIXED; and what it means for T15

**No Critical.** The reviewer compared every assembly the rig shares with the server — bootstrap,
both ingest doors, the sync-down cursor, the parked transport — and found no silent divergence. It
verified the load-bearing claim independently: *"flush hands back the in-flight promise"* is TRUE
(`sync-engine.ts`: `if (flushing !== null) return flushing`), so no claim is lost, double-sent, or
stranded by the gate.

### The three Important findings, and why each was a real hole

- **I1 — `goOnline()` could resolve "successfully" with a claim still queued and never sent.**
  `flush` answers a `transport.sync` THROW with `outbox.recordFailure` and returns normally: the row
  stays `'queued'`, `next_attempt_at` moves out, `lastApplyFailure()` stays null and **`failedItems`
  stays EMPTY** — `recordFailure` deliberately does not mark `'failed'`, or every retryable claim
  would strand forever. A Task 15 scenario would then assert one contest, see zero, and blame the
  product; the reason sat in `outbox.last_error`, which nothing read. **Fixed:** `goOnline` now
  reads `queuedCount` after the flush and throws carrying each row's `last_error`. In this harness
  there is no network — `transport.sync` calls `processBatch` in-process — so a still-queued claim is
  never transient and the backoff that would excuse it in the product excuses nothing here.
- **I2 — S3, S4 and any revocation scenario were INEXPRESSIBLE.** `ADMIN_ONLY_TYPES` refuses
  `workflow.defined`, `ticket-type.defined`, `project.created` and `ticket.workflow_rebound` from
  every non-admin, and both users were `'member'`. An author hitting that reaches for the ungated
  internal door and silently stops testing the product. **Fixed:** `USER_ADMIN`, seeded `'owner'` and
  project-admin. Pinned by a case that asserts the MEMBER is refused and the owner commits, so it
  proves the gate is live rather than absent.
- **I3 — S6 (same batch twice) was INEXPRESSIBLE.** `engine.flush()` drains only what is queued and
  the rows are gone after the first flush; the plan's S6 built its own `createSyncService({pool,
  ingest})`, which does not compile (`serverAppend` is required) and would have been a SECOND
  instance, hiding any per-instance duplicate-suppression bug. **Fixed:** `Harness.sync(userId,
  events)` → the same `syncService.processBatch` the route delegates to.

### Minor — recorded, and the third is a PRODUCT defect, not the rig's

- **M1** `engine.settled()` deadlocks while a claim is parked on the offline gate (it awaits
  `flushing`). Scenarios must not use it; documented at the engine field.
- **M2** `goOnline` flushes then catches up; the product catches up, then flushes inside
  `onCaughtUp`. Measured benign for the S1/S2 shapes (the reducer only throws on unknown
  type/workflow/state or an uncreated ticket, which an assign/field/transition gap cannot produce),
  but **T15 should `syncDown()` before `goOnline()`** where it cares about the intermediate state.
- **M3 — PRODUCT DEFECT. OWNER: Lane A, closure 4. Owner ruling: P36 (2026-09-06).** P36 widens the
  BOOTSTRAP payload ADDITIVELY — the snapshot carries the recorded `(actorId, serverTime, seq)`
  provenance of the state claim, copied by the snapshot writer from the ledger row at that seq. The
  preferred shape is a **sibling block on the snapshot row, NOT a widening of
  `TicketState.transitions[]`** — deliberately, so **this rig's full-`TicketState` equality across the
  fold stays untouched**. If Lane A measures that it must widen `TicketState` after all, the controller
  says it will warn this lane before it lands; until then, 12.260's exact equality assertion is safe and
  must NOT be pre-emptively weakened. T15's ❌ case for the DataSource door stands as written and cites
  P36 as its owner ruling.
  *Original wording, kept because it is what was measured:* After `snapshotPass()`, a fresh client's
  `ds.query.getTicket` throws `ReplicaGapError`: `replica-data-source.ts` requires a
  `ticket.created`/`ticket.transitioned` in local `events` for `stateProvenance`, and a
  snapshot-bounded bootstrap ships neither below the line. `replica.getTicket` works; only the
  DataSource door refuses. **The snapshot-bounded bootstrap and the DataSource's provenance rule
  contradict each other.** Recorded, not fixed — it is not the rig's bug, but it will surface as one
  in any scenario that snapshots before creating a client.
- **M4** after a workspace-wide `scope-revoked` the cursor row is gone, so later `syncDown()`s
  re-scan from 0 and re-yield it (idempotent; the engine delivers nothing further).
- **M5** the roster seed is projection-only, so no `membership.granted` / `project.created` rows
  exist in the ledger. Nothing in the replica reads them; cursors are just smaller.

### T15 PITFALLS THE REVIEW MEASURED — read these before writing scenarios

1. **S1's `ticket.field_set {fieldId:'notes'}` is refused LOCALLY** (`field.unknown`) — the seeded
   types have `fields: []`. Use a built-in (`title`, `description`, `dueDate`, `startDate`) or seed a
   field.
2. **S4's expected `purge` on `visibility.set` DOES NOT EXIST in the product** — the per-event walk
   was struck (cases 6.101/6.104). Measured: B keeps the ticket, B's cursor lags, and re-widening
   re-delivers the full history. **The rig reproduces the server correctly; S4's script must change.**
3. `ticket.transitioned`'s payload key is **`to`**, not the plan's `toStateId` — the same error T13
   already paid for.
4. The plan's T15 text repeats T14's API errors: `ingestInteractive` takes `(userId, events)`;
   `ds.query.getTicket` takes `(workspaceId, ticketId)`; **`listEntityEvents` is on the REPLICA, not
   `ds.query`**; `'usr_a'`/`'usr_b'`/`'task'` must be the rig's exported ULIDs; and `seedTicket` takes
   `(pool, args)` with **no `visibility` field at all** (`setVisibilityEnv` is separate).

### The reviewer's own least-sure claim, carried rather than absorbed

M2's "benign for the six scenarios" rests on the S1 and S2 shapes only; S5 was not run. **Not
checked at all:** S3–S6 end to end, the stall path where `lastApplyFailure` is non-null, the
no-progress guard, `bootstrapFor` under a concurrent writer, the JSON round trip, and `contests()`
ordering with two contests in one batch.

## T15 — THE SIXTEEN CORRECTIONS, and the one that is a PLAN DEFECT

Verified against source before dispatch. The plan's T15 block repeats every T14 API error and adds more.

**Rig API:** `ingestInteractive(userId, events)` is two-arg · admin-only claims (`workflow.defined` and
kin) need `USER_ADMIN`, not a member · use the rig's exported ULIDs, never `'usr_a'`/`'wf_h'`/`'task'` ·
`ticket.transitioned`'s key is **`to`**, not `toStateId` · **`ds.query.getTicket` returns `TicketRead` =
`{ticket, title, stateProvenance, parent, rollup}` — it has NO `confirmed`, NO `contests`, NO `pending`,
and the plan reads all three off it** (use `replica.getTicket`, `getTicketWithPending`, `listContests`) ·
`listEntityEvents` is on the REPLICA · `ds.query.search` REFUSES on the replica, use
`searchOfflineCopy` → `{offlineCopy, hits}` · `seedTicket(pool, args)` is ONE options object with **no
`visibility` field at all** · S6 must use `h.sync(userId, events)`.

**Correct as the plan has them, do NOT "fix":** `myWork(workspaceId, userId)` and
`listContests(workspaceId, filter)` both exist on `ReplicaOnlyQuery` with those exact signatures.

**⚠️ S4's CENTRAL PREMISE IS FALSE, and this is a PLAN defect, not a lane one.** S4 expects a `purge`
on `visibility.set`. **There is no such purge in the product** — the per-event visibility walk was
struck (coordination cases 6.101/6.104). Measured on this rig: after a narrowing `visibility.set`,
client B KEEPS the ticket, B's cursor merely lags the head, and re-widening later re-delivers the full
history. **The rig reproduces the server correctly; the SCENARIO is wrong.** The conservative default
taken: write S4 against what the product actually does, assert that exactly, and say in a docblock which
half of the plan's S4 was false and which half (the offline edit contesting) still holds. **Bending the
rig to make the plan's S4 pass would be a harness excusing the server from existing** — this series'
signature failure. Raised with the controller; not blocking.

**Rig behaviours a scenario must work with:** `goOnline()` THROWS if any claim remains queued after the
flush · `goOnline()` flushes then catches up, the INVERSE of the product, so call `syncDown()` first
where the intermediate state matters (measured benign for S1/S2, **not measured for S5**) · do not
`snapshotPass()` then create a client and call `ds.query.getTicket` (product defect M3) ·
`engine.settled()` deadlocks while offline.

## ✅ CLOSURE 5 — BUILT. What it is, and the four mutations that measure it

**Two commits**, catalogue in the same change set. Ruling P37's constraints were followed, not
redesigned around; where a constraint's wording turned out narrower than the gap, the extra is
RECORDED with an owner rather than built.

### The grant half — `apps/server/src/visibility/grant-backfill.ts` (new), wired into `visibleEventsFor`

A visibility-changing event on a ticket the reader may see NOW hands back that ticket's pre-cursor
history — and every INHERITING DESCENDANT's. Triggers: `visibility.set` and `ticket.reparented`.

**The safety argument is an asymmetry, not a check, and it is the thing to re-read before touching this.**
No before-image is consulted or reconstructed (6.82/6.94 hold, and the per-event purge walk stays struck).
A NARROWING is invisible to the viewer it narrowed away, so `visibleEventsFor`'s own `canSee` never
yields it to them and it never becomes their trigger. **A widening self-selects; a narrowing
self-excludes.** That is why a trigger this coarse is legal.

**The subtree walk is `reResolveSubtree`'s own traversal, read-only** — the projection restores the
resolution invariant over exactly the set whose audience the event changed, so "whose row did it change"
and "whose history is owed" are one question asked the same way. It reads `parent_id`/`own_mode`
(structure), never re-derives the RULE; `canSee` still decides every audience question. `visited` guards
a `parent_id` cycle for case 6.58's reason.

### The narrow half — `apps/server/src/sync/reconcile-route.ts` (new) + `SyncTransport`/`SyncEngine`

`POST /v1/sync/reconcile`: the CLIENT names the ids it holds, the server answers only about those, in the
`{kind:'restricted', id}` register. **Existence is never consulted** — a handler that omitted ids it had
no row for would make presence-vs-absence the oracle, which is "lost vs never-had" closed in the content
and reopened in the SHAPE. `canSee` already answers unknown and invisible identically and says so; this
door is the second reader depending on that sentence.

**`SyncTransport` grew a fourth method** (P17's class). Controller approved with an enumeration rule.

### THE FOUR MUTATIONS — results, which are the measurement, not the intent

| mutation | result |
|---|---|
| `GRANT_BACKFILL_TRIGGERS` → `[]` | `5 failed \| 1 passed`. **Not "alone", and it should not be** — emptying it removes the mechanism. The SURVIVOR (12.277) is the finding: exclusion is the caller's `canSee`, not this list. |
| `grantBackfillFor`'s own `canSee` → permits | `1 failed \| 5 passed` — **12.280 ALONE.** Edit confirmed present before the run, so: killed guard, not a mutation that never fired. |
| reconcile route enumerates `proj_visibility` | `2 failed \| 10 passed` — 12.285 + 12.286. **12.284 stayed GREEN, which is why 12.285 exists.** |
| engine drops `chunk.includes(item.id)` | `1 failed \| 63 passed` — **12.287 ALONE.** |

### ⚠️ THE BRANCH REVIEW — 8 raised, 6 SURVIVED refutation. ONE IS OPEN AND ESCALATED.

Fable reviewer + one Fable refuter per finding, each briefed to default to refuted. Two were refuted
(a `canSee` timing side-channel that is pre-existing and reachable at a door with a weaker gate; a
comment enumerating "both consumers" that is complete for what it names).

**✅ RULED — P37.1 (2026-09-06). (2)+(1) landed in #139; the real fix is closure 5b item (d).**

**The backfill is an ATOMIC, NON-PROGRESSING BURST.** Before this branch every envelope the hub sent
advanced a cursor, so a drain cut short resumed where it stopped. A backfill inverts that by
construction: **every backfilled envelope is `≤ afterSeq`, so none moves any cursor**, and the only one
that does — the trigger — is yielded AFTER the whole subtree's history. `hub.ts`'s `send` closes the
socket 1013 `slow-consumer` above 1 MB buffered and `detach`es; no `caught-up` is sent, so the engine
(which persists its cursor ONLY in `onCaughtUp`) never advances, and app-core's `lastSeq = Math.max(…)`
cannot move on envelopes below its own `afterSeq`. **The client reconnects at the same cursor, is handed
the identical burst, and is closed again — permanently and silently.** `needsBootstrap` refuses to
re-bootstrap over a local baseline, so there is no client-side escape. Second half, independent of the
wedge: **a cost amplifier the docblock's "bounded to once per subscriber per trigger" does not bound** —
`readEntityEvents` runs with the default `afterSeq = 0`, and `check-permission.ts` does not refuse a
`visibility.set` that sets the mode a ticket already has, so one member can re-issue it and make the
server re-walk and re-stream a whole subtree to every subscriber, per commit.

**THE CHEAP FIX IS UNSAFE AND A RESTART MUST NOT REACH FOR IT.** Yielding the trigger FIRST (so the
cursor advances before the burst) breaks `ticket.reparented`: it IS folded, so a client that never held
the ticket replays a transition with no `ticket.created` and `applyTicketEvent` throws — the engine's
terminal stall, a worse failure than the one it fixes, and it looks like a one-line win.

**What landed under P37.1:** `GRANT_BACKFILL_MAX_TICKETS = 200`, breadth-first so the trigger ticket and
the shallowest descendants survive, plus case **12.290** (❌, the wedge, mechanism and the unsafe
one-line repair both spelled out, owner 5b) and case **12.291** (✅, the cap, over-cap fixture, EXACTLY
the cap rather than at-most). Measured: `12.291` reddens **ALONE** when the cap is removed
(`1 failed | 6 passed`).

**What the cap does NOT bound, and the case says so:** a single ticket with a very long history. One
ticket over the wire is one ticket whatever its event count, so the reachable burst is narrowed, not
closed.

**CLOSURE 5b GAINED ITEM (d) — the real fix, and it is a DESIGN, not just an owner.** Make the grant
side PULL-shaped and client-presented, the same principle as the narrow half: the hub pushes a bounded
NOTICE (the trigger plus the ids it newly admits — not history), and the client, which already knows its
own holdings, pulls each ticket it does not hold through the per-ticket bootstrap door BEFORE applying
the trigger, persisting each as it lands. *(If no server route exists for that door yet, it is 5b(d)'s
first artefact — the rig's `bootstrapTicket` restates it.)* Consequences, each to be MEASURED: a
cut-short session resumes by pulling what it lacks (no wedge, no per-subscriber server state); a
repeated no-op `visibility.set` costs a client that already holds the subtree nothing, so the amplifier
is bounded by holdings rather than by trust in `check-permission`; and the refold hazard closes as
"bootstrap-before-apply on any event for an entity not held", which is the rule a replica needs for
`ReplicaGapError` anyway. Excluding fixtures carry over: a viewer not in the new audience gets no notice
(mutate → red); the notice never names an id outside the viewer's audience (mutate to enumerate → red).
**12.290 flips ❌ → ✅ only when a slow-consumer close MID-PULL is followed by convergence on reconnect.**
If the notice must carry more than ids and the trigger, ESCALATE.

**FIVE MINORS, ALL FIXED (commit `aa50e04`).** The one to read: **12.277's positive control was
VACUOUS** — `JSON.stringify(forInsider).toContain(ticket)` passed because the *narrowing event itself*
carries the ticket id in `entity.id` and `payload.ticketId`, so it would have passed against an empty
`grantBackfillFor`. A check passing for a reason unrelated to the property it names, **in the very case
written to demonstrate that discipline.** Now asserted by the pre-cursor event's **id**. Also: an
`audienceDependents` docblock claiming a rowless ticket "yields the empty set" (it yields itself, and
the "saves the work" clause was false too); a wrong case citation (12.281 → **12.283**); a 12.287
comment calling a fresh ULID "a ticket the device holds"; and **"end to end" on 12.289 in three places**
— the rig restates the route's rule rather than calling it, so no case runs client and real route
together.

### TWO LESSONS THAT COST A ROUND EACH — both will recur

1. **`git checkout HEAD -- <path>` DOES NOT RESTORE AN UNTRACKED FILE.** It fails with *"pathspec did not
   match any file(s) known to git"* — one line, easy to skim past in a background log. The first run of
   the `canSee` mutation therefore executed with the TRIGGER mutation still applied, and its result was
   confounded and discarded. **This lane's own state file predicted this exact failure** (T13's section:
   "`git checkout --` does NOT restore these files — they were untracked when the mutations ran") and it
   happened anyway, because the prediction was about T13's files and the reflex did not transfer.
   **The fix is to COMMIT BEFORE MUTATING, not to remember.** Both later mutation rounds did, and both
   restored clean and were verified by READING the file back.
2. **A grep for an interface's name does NOT enumerate its implementors.**
   `grep -rn 'SyncTransport|createHttpTransport' --include='*.ts' --include='*.tsx' apps packages` found
   FOUR. `pnpm turbo run typecheck` found a FIFTH: an inline object literal at
   `packages/app-core/test/replica/replica-data-source.test.ts:486` with no `: SyncTransport` annotation,
   structurally typed by inference, invisible to any textual search for the type name. **The compiler is
   the enumerator; the grep is a hint.** Reported to the controller, which had asked for exactly this
   enumeration — the rule it gave was right and the tool the rule implies is not.

### WHAT CLOSURE 5 DID NOT CLOSE — recorded with owners, not fixed

- **Case 12.283** — visibility that widens because the READER's reach grew (`membership.granted`,
  `project.member_added`) rather than the ticket's. Identical pre-cursor gap; P37 scopes closure 5 to
  "the visibility event itself". Named in `GRANT_BACKFILL_TRIGGERS`' own docblock so the module's
  existence cannot be read as covering it. *Owner: WS catch-up/purge protocol, no task.*
- **Case 12.288** — nothing calls `reconcile` on a schedule. When a device should reconcile is a product
  decision with a cost (one request per 100 tickets held) and no plan states it. *Owner: unassigned.*
  Sibling: the engine presents `replica.listTickets`, so a ticket held only as unfolded events with no
  local `tickets` row is not presented.
- **Case 6.102's GUEST side** — the same reconcile primitive, unmeasured for a guest.

### LANE A's HEADS-UP, carried because it expires this lane's assertions

After closure 4 lands, a snapshot row carries a provenance block and the invalidation pass CARRIES IT
FORWARD rather than recomputing. It is ADDITIVE (P36 constraint b), but **an exact `toEqual` on a
snapshot row or a bootstrap body will redden, and that is a real expiry rather than a defect.** Lane A
confirmed it prefers a SIBLING block over widening `TicketState.transitions[]`, so 12.260's full
`TicketState` equality is safe. Lane A also confirmed it adds/wraps/constructs NO `SyncTransport`.

## ⚠️ THE FOUR THINGS A RESTART MUST KNOW BEFORE TOUCHING T14

1. **The T14 plan text's rig code block is a DRAFT and ELEVEN of its details are wrong.** The verified
   correction list is in the section "T14 — WHAT THE PLAN TEXT GETS WRONG" below. Do not implement from
   the plan verbatim; the two that matter most are a security bypass and a fabricated bootstrap.
2. **§12 case ids are ALLOCATED now, not discovered** (cross-lane, 2026-09-06). This lane keeps
   **≤ 12.223**; Lane D holds 12.224–12.227, Lane C 12.228–12.239, Lane A 12.240+. The header's
   NEXT-FREE sentence reads **12.240** deliberately. **Do not mint from 12.224.**
3. **The gate lock protocol changed.** Acquire + pid + trap + drain-wait + run must be ONE backgrounded
   invocation. **`rm -rf` is refused by this machine's permission layer** — use `rm -f <file>` plus
   `rmdir <dir>`. Foreground `sleep` is refused too, which is why it must be backgrounded.
4. **PR #117 is not merged and has been rebased twice.** Never assume a merge from a report; check
   `gh pr view 117 --json state,mergedAt`. A `gh pr merge | tail -1` once hid its own exit code and was
   reported as merged when GitHub had refused it.

## T14 — WHAT THE PLAN TEXT GETS WRONG, verified against the tree at `a23d686`

Plan lines 5897–6202. Every item below was read from source, not inferred.

| # | plan says | truth |
|---|---|---|
| 1 | `createReplicaDataSource`, `ReplicaDataSource`, `LocalIngestResult` from `@gisik-nokma/sync-client` | They are in **`@gisik-nokma/app-core`** (Ruling P30). app-core→sync-client is the only dependency edge that exists. **`apps/server` needs BOTH packages as devDeps**, not the one the plan and the lane brief name. |
| 2 | `IngestResult` from `ingest-service.js` | Not exported there — import from `@gisik-nokma/domain`. |
| 3 | `listVisibleTickets` from `visibility/can-see.js` | It is in **`visibility/visible-tickets.ts`**, `(db: Queryable, userId, workspaceId)`. |
| 4 | `ingestInteractive` uses `ingest.ingestBatch` | **SECURITY.** `ingestBatch` passes `door = null`, so `checkPermission` NEVER runs (`ingest-service.ts:437-442`); its docblock says *"An HTTP route must never call this"*. Every real online door uses `ingestClientBatch(events, userId)`. Using the internal door for the "online user stand-in" would let Task 15 assert permission outcomes the product does not have. `ingestBatch` **is** right for the SEED. |
| 5 | `ds.query.getTicket(ticketId)` | Takes **two** args: `(workspaceId, ticketId)`. |
| 6 | `ds.query.listEntityEvents(...)` | **Does not exist on `ds.query`.** It is `replica.listEntityEvents(ticketId)`. |
| 7 | `seedMember(pool, workspaceId, userId)` | `role` is a **required 4th** positional arg. |
| 8 | `'usr_a'`, `'ws_harness'` | Must be **ULIDs**. `membershipGrantedPayload` requires `ulidString` inside the projection's `apply()`, and `submittedEventSchema.workspaceId` is `ulidString` at `parseEvent`, which the real ingest door calls. |
| 9 | a hardcoded 4-entry `BACKFILL` list | The server's `BOOTSTRAP_BACKFILL_TYPES` (`apps/server/src/sync/sync-routes.ts`) has **five** — it also carries `'visibility.set'`. Import it. A hand-copied list has the harness proving replicas against a bootstrap **the server never sends**, which is this series' signature failure wearing a new costume. |
| 10 | `createReplica(...)` used synchronously | It is **async**; `createOutbox` and `createSyncEngine` are not. |
| 11 | `export type Harness` omits `projTicket` | Its own interface block and implementation both include it. Include it. |

**Verified CORRECT and not to be "fixed":** `createIngestService`, `buildProjectionRegistry`,
`getTicketStateFromDb`, `createSyncService`, `visibleEventsFor`, `readStreamSeq`, `runSnapshotPass`,
`readEntityEvents`, `rowToEnvelope`, `readLatestSnapshot`, `resolveEffectiveRole`, `createTestDatabase`,
`createBetterSqliteStorage` from the `/testing` subpath, `processBatch(userId, rawEvents)`,
`{ kind: 'restrict-to', assignee: true }`, `getCursor`/`setCursor` taking a workspaceId, and
`loadBootstrap`'s shape. `apps/server/vitest.config.ts` includes `test/**/*.test.ts` recursively and CI
runs `apps/server` with Postgres on 54329 — **a new `test/dual-client/` suite needs ZERO config change**,
and the CI file's own comment already says the dual-client job is absent by design pending this task.

## OPEN RULINGS FROM THIS LANE

**R-B1 — RULED (P34, 2026-09-06). Kept for its reasoning.** Of the three annotations, none was Task
13's and none stays unassigned: the offline union list and the `ListRow.pending` renderer went to
**Lane A as closure 2b**; the third was SPLIT — its surface half shipped here (`syncErrorNotice`,
cases 12.216–12.219), its POLICY half stays in `createSyncEngine`, unassigned, and went to the owner as
a task-wanting question. The split was this lane's pushback on the ruling's own wording and was
accepted: a label asserting *"will not reconnect"* for a code the engine reconnects on would be a view
deciding on the engine's behalf.

**Original R-B1: three in-code annotations name "Plan 10 Task 13" as the owner of work that
Task 13's own Files block does not reach.**

1. `packages/app-core/src/replica/replica-data-source.ts:353` — `OFFLINE_BORN_ABSENCE`, owner
   *"Plan 10 Task 13 — an offline list that unions `getTickets` with `listTicketSummaries`"*.
2. `Features.md` §12 on `ListRow.pending` — *"the field exists and nothing renders it until Task 13"*.
3. `packages/sync-client/src/engine/sync-engine.ts:181` — a per-`StreamErrorCode` retry policy, deferred
   to *"whoever owns the client's error surface — Plan 10 Task 13 is the first task with a place to show it"*.

T13's five files are the banner, the view-model, the reopen pair, the skew badge and the status bar.
There is no ticket list, no `ListRow` renderer and no error surface among them. Those annotations named
the next task touching app-core UX **by number, not by content**.

**Conservative default taken, and it is reversible:** all three are RECORDED with owner *"unassigned —
plausibly Tasks 16/17, the first code that actually draws a list"* in both `Features.md` §12 and
`test-cases/12-offline-sync-apps.md`'s "Carried, with owners — Task 13" section, and **none is built**.
Building any would be inventing a surface no plan specifies. Raised with the controller 2026-09-06; if
it rules the other way, the cost is lowest before T14's harness lands.

## WHAT T13 SHIPPED, AND THE FOUR DEVIATIONS FROM THE PLAN TEXT

Commit `0b1b515`. Five source files under `packages/app-core/src/{contests,offline,history,sync}/`,
four test files, `src/index.ts` exports appended at the tail (append-vs-append with Lane A's closure 3),
three style blocks appended to `packages/ui/src/ui.css`, `Features.md` §12 extended, and
`test-cases/12-offline-sync-apps.md` cases **12.189–12.215** with its HIGHEST-ID header, its running
parenthesis and its scope enumeration all rewritten in the same change set.

**Each deviation exists because the plan's own prescribed test could not have caught the thing it named.**

1. **The wire field is `to`, not `toStateId`.** `ticketTransitionedPayloadSchema`
   (`packages/domain/src/workflow.ts:138`) names the destination `to`; `cause` is its declared optional
   sibling, exactly `{ kind: 'reopened-for-child', childTicketId }` — so the plan was right about
   `cause` and wrong about the destination. The schema is NOT `.strict()`, so `toStateId` is stripped
   rather than named and the parse then fails on the missing required `to`. The plan's test asserted
   `toStateId` with `toMatchObject` against an envelope the function had just built — green for any
   spelling. Case **12.190** parses through `domainRegistry` and carries the plan's spelling as a
   negative control in the same test.
2. **`nonTerminalStates` ships as declared but is documented as NOT the reopen picker.**
   `reopenStateOptions(def, currentStateId)` (`flows/guarded-child-event.ts:106`) already answers
   "what may this parent be reopened into", composing `transitionOptions`; it is what the ONLINE dialog
   is fed from. `nonTerminalStates` cannot filter by reachability — it never receives the current state.
   Case **12.191** pins the divergence on the plan's own fixture (two states versus none).
3. **A queued resolution is not an accepted one.** The replica's `ingest` THROWS `OfflineAcceptError`;
   `resolveContest` deliberately does not catch it. Case **12.195**.
4. **The components' classes bound to nothing.** `ui.css` had no `gn-contest-banner`,
   `gn-clock-skew-badge` or `gn-sync-status-bar` selector at all (measured, `gn-inbox` as the positive
   control on the same file). Rules added; case **12.199** ties them by set equality in both directions.

**Six mutations run, each failing at its own site and nowhere else** — `to:`→`toStateId:` (12.189 +
12.190, 2 failed / 3 passed); `formatClockSkew` gate reordered (12.213 + 12.214, 2 / 6); Redo rewired to
`onResolve` (12.203 alone, 1 / 12); domain `getUTCHours`→`getHours` rebuilt (12.194 naming its own zone,
*"21 Aug 2026, 17:00 IST"* — label right, hour the device's); a class rename and a CSS-rule deletion
(both directions of 12.199). **Every restore was verified by reading the file, never by a shell `diff`.**
`git checkout --` does NOT restore these files — they were untracked when the mutations ran, and the
command fails with *"pathspec did not match any file(s) known to git"*, which is easy to skim past.

## THE OTHER LANES' NAMES FOR THINGS

Lane D asked for `syncStatusLabel`, `resolveContest`, `buildReopenPair` from `@gisik-nokma/app-core`.
All three are exported under exactly those names, plus `ContestBanner`, `ClockSkewBadge`,
`formatClockSkew`, `SyncStatusBar`, `nonTerminalStates` and the types `ContestLike` / `IngestFn` /
`ResolveContestInput`. Told Lane D three things it needs before rebasing: the `to`/`toStateId`
correction, that `resolveContest` propagates `OfflineAcceptError` rather than swallowing it, and that
its reopen picker must use `reopenStateOptions`, not `nonTerminalStates`.

## ⛔ THE GATE LOCK DOES NOT HOLD IN THIS HARNESS — measured, reported, affects every lane

**Each Bash tool call is a fresh, short-lived shell.** `echo $$ > /tmp/gisik-gate.lock/pid` therefore
records a pid that exits seconds later, and every peer's stale-check is then CORRECT to fire —
`kill -0 <dead pid>` fails, `rm -rf`, lock reclaimed within one 15-second poll. **The lock releases
itself almost immediately after every acquisition.**

Traced here: `mkdir` succeeded, pid written, `ls -la` confirmed the pid file; minutes later the
backgrounded gate's own `echo $$ > .../pid` failed with *"no such file or directory"* because a peer had
already removed the directory, and `ls` showed it gone while this lane's gate was still running. Two
independent vitest pools (pids 98373 and 99418, nine workers each) were live at that moment, with
**~66 MB free** (`vm_stat` Pages free 4119 x 16KB) and **1983.50M of 3072.00M swap used**.

**The trap that makes it worse:** the brief's one-liner is DENIED as a foreground command — foreground
`sleep` is blocked by this harness, so the `until … sleep 15; done` loop cannot run in the foreground at
all. The natural repair is to split acquire and run across two tool calls, and **that split is exactly
what breaks the lock.**

**THE RULE: acquire + write pid + trap + run gate MUST be ONE backgrounded Bash invocation.**
Backgrounded is the only form where the `sleep` is permitted AND `$$` is a pid that outlives the gate.
Never split it.

**Reaping:** `pgrep -f vitest` matches all five lane sessions (their command lines embed a brief
containing the word) plus any peer's live run — never kill its output. The only correct reap, per the
controller's 2026-09-06 correction:
`ps -eo pid=,ppid=,comm=,args= | awk '$3 ~ /node$/ && $2 == 1 && index($0, "vitest") > 0 {print $1}'`
Read the list before killing anything; expect it empty. Checked after every run this session: empty.

## KNOWN HAZARDS CARRIED INTO T13's IMPLEMENTATION — BOTH NOW RESOLVED

- **RESOLVED:** `cause` IS declared, exactly as the plan assumed — but the destination field is `to`,
  not `toStateId`. See deviation 1 above. Original note follows.
  **`cause: { kind: 'reopened-for-child', childTicketId }` on a `ticket.transitioned` payload was
  UNVERIFIED against the real payload schema.** If that schema is `.strict()` and declares no `cause`,
  the plan's `buildReopenPair` builds an event the real door refuses — and the plan's own unit test
  (`toMatchObject` on a freshly built envelope) **cannot catch it**, because nothing in that test passes
  the event through a schema. This surfaces later, in T15's S5. Being verified now; if the field is
  absent, it is **recorded with a named owner, not fixed by widening the domain schema**.
- **RESOLVED: it compiles.** `IngestResult` is a discriminated union whose every arm satisfies the
  shape; app-core `typecheck` is **0 errors against a 0-error baseline recorded at `1e372e3` before any
  edit**. Note the baseline mattered: a probe run before the dependency dists were built reported ~90
  errors that were entirely stale-dist artefact. Original note follows.
  **`IngestResult[]` → `Array<{status: string; eventId: string|null} & Record<string, unknown>>`
  assignability was UNVERIFIED.** Turns on implicit index signatures (type aliases get them, interfaces
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



## ▶ LIVE — `exec/46-reach-granted-wire` (case 12.365), re-tasked after the 17:20 reset

**#202 is MERGED as `cd0844c`** and the controller's forced gate at the merged main (the #196+#203+#202
combination nothing else covered) was green: 30/30, 3639 tests / 284 files. Its delta against my own
`338a996` gate reconciles exactly — **+27 tests, +1 file, all in `apps/server`**, the file being Lane C's
`sweep-orphans.test.ts`. Nothing from #202 is re-done here.

| anchor | value | how verified |
|---|---|---|
| branch · base | `exec/46-reach-granted-wire` from **`5e3a9d5`** — REACHABLE (`git branch -r --contains` names `origin/main`) and equal to `origin/main` at the cut | `git rev-parse`, both sides compared |
| toolchain | node **v22.22.2**; `INSTALL_EXIT=0` · `REBUILD_EXIT=0` · `BUILD_EXIT=0` | one shell invocation, each `$?` on its own line |
| id | **12.365**, bare, from Lane B's block `12.360–12.379` (used through `12.365`; next free block `12.380` on request) | header updated, recounted |
| `check-case-ids` | **`EXIT=0`**, 1555 unique, union == sum | its own step, NOT part of `check:env` |

### THE CARRIED ITEM WAS HALF RIGHT, AND THE HALF IS THE POINT

It read *"the transport's `reach-granted` WIRE branch has no witness … `parseFrame`/transport"*. Measured
at this head rather than adopted:

- **`app-core`'s `parseFrame` is ALREADY witnessed, deeply.** `stream.test.ts`'s `SCHEMA_FIXTURES` loop
  asserts `parseFrame(JSON.stringify(frame))` **equals** the frame, so both `{id, headSeq}` pairs survive
  by deep equality, and a seventh union member would land there as a missing fixture.
- **`http-transport.ts`'s branch was the unwitnessed one**, and it is the only branch in that switch
  reading fields out of a nested array. Every `reach-granted` in `sync-engine.test.ts` arrived PRE-PARSED
  as `{kind:…}` through `script.handlers.onItem` — the engine's door, not the wire's.

Positive control for that sweep: `caught-up`, three hits in the same file. **A carried item is a fact
about the tree that produced it; this one was mine, from this morning, and it was still wrong by half.**

### WHAT 12.365 ASSERTS, AND THE TWO CLAUSES THAT ARE NOT DECORATION

The whole item by value — `kind` translated from `type`, the workspace taken from the SUBSCRIPTION rather
than echoed from the frame, both pairs with their own numbers. Ids and `headSeq`s are **distinct and
non-sequential**, because equal values (or values equal to their array index) would let a transposition or
an index-for-value substitution pass, and `headSeq` feeds the comparison deciding whether a ticket is
pulled at all. Then: **a junk element is dropped while the good id beside it travels** (the arm filters
rather than refusing whole, and the site argues why), and **a notice for another workspace is refused** —
without which the case cannot tell *extracted correctly* from *extracted regardless of address*.

**Mutations, both named by the case and both run**, over the whole sync-client suite (8 files, 89 tests):
constant-for-`headSeq` → **1 failed / 88 passed, 12.365 alone**; rename `headSeq` → `seq` → **1 failed /
88 passed, 12.365 alone**. Confirmed present before each run; restored by `git checkout HEAD --` verified
by READING plus an empty `git diff`; `dist` rebuilt after, checked for both mutant markers.

**12.167 keeps "five of six" rather than being folded up to six** — what it drives is five, the sixth is a
different case against a different door, and the split says more than one number would. The owner line
12.167 carried is discharged.

---
## ▶ REVIEW ROUND — opus reviewer, three CRITICAL, five IMPORTANT, five MINOR; all verified and all fixed

The reviewer also caught that **`rtk`-proxied `git` handed it a stale log and diff** (pre-rebase shas)
and re-read everything through `/usr/bin/git`. Worth carrying: the proxy's staleness is a known
silent-wrong-answer mode on this machine and it reached a *reviewer*, the party least able to notice.

**Three Critical, every one confirmed by me directly with `/usr/bin/grep` before acting on it:**

1. **`Features.md:1384` still ended `` `ping` is answered with `pong`. ``** — the transport bullet, 1,351
   lines below the app-core bullet I did correct. My own check read the first 1,500 characters of that
   bullet and stopped short of the sentence. **A one-line diff to a file this size is not evidence the
   file is consistent.**
2. **`test-cases/03-foundation-ledger.md:39`, case 3.33 ✅**, still claimed *"answers `ping` with `pong`
   without delivering it"* — and its cited witness is `stream.test.ts`, the very arm 12.360 replaced with
   the OPPOSITE assertion. A ✅ naming behaviour its own witness contradicts. `test-cases/12` was updated
   in the change set; `test-cases/03` was never looked at.
3. **12.328's ✅ rested on 12.361's 🚫, whose stated reason was refuted by a file the rebase pulled in.**
   See the corrected interaction-check note above. The deletion itself survives — `ws` surfaces protocol
   pings on `socket.on('ping')`, which `WebSocketLike` does not expose — but the enumeration, the
   absolute prohibition and 12.361's "no test can hold this" were all false, and 12.361's reason is now
   SCOPE with the buildable assertion named.

**Five Important, all fixed:** `outbox.ts`'s `apps/server` count was 2 by the bullet and **3** by the
bullet's own stated command (`rig.ts` — a type import and a return-type annotation, both code uses), so
the total is **9 files, not 8** — and my change set **re-signed the wrong number in the very bullet that
congratulates itself for catching that class**. `replica.test.ts`'s recount excluded 12.127 and summed
to 22 against its own measured 23: the extractor required a SINGLE quote after `it(`, and 12.127's title
carries an apostrophe. **12.360's shipped mutation text said "restore the pong arm"; it takes BOTH arms**
— the parse arm too, since `parseFrame` now answers `null` and the send arm alone is unreachable and does
not typecheck. I measured it with both and then wrote the docblock as one, so the docblock would have
sent the next maintainer to a mutation that never runs. **12.167's title re-affirmed "all five server
frames" over a SIX-member union** (`reach-granted` since closure 5b), and the transport's `reach-granted`
wire branch has no witness — a pre-existing gap, but re-signing "five" in a line I rewrote is the same
defect as `outbox.ts`'s count. And this file's own position table was stale on the commit that shipped it.

**The through-line, and it is one thing:** every Critical and three of the five Importants are a NUMBER
OR SENTENCE I RE-SIGNED WITHOUT RE-DERIVING — an enumeration measured before a rebase, a count carried
into a bullet I was editing, a title I rewrote and left, a mutation I ran one way and described another.
The branch's own commit messages argue this exact point four times. **Editing a line does not verify it;
it re-signs it.**

**Two the reviewer flagged its own uncertainty on, and my resolution:** its `ws` `on('ping')` reading is
reasoned rather than measured — I have not run the recorder it proposed, so 12.361 keeps the residual and
the docblocks now state the mechanism as the reason rather than asserting a prohibition. And it asked
whether I3 was a mis-run or a mis-description: it is a **mis-description** — the handoff at 14:47 already
said "BOTH halves", so the measurement was sound and only the shipped wording understated it.
