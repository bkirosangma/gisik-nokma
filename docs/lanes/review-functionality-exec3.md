# Review — FUNCTIONALITY (executor 3): the engine and the wire

**Lane:** executor 3 · **branch:** `exec3/review-functionality` · **base:** `origin/main`
**Every measurement in this report was taken at `e4baa425966b331fdc1b189e3d1c86b667e30acc`**
(`Merge pull request #623 from bkirosangma/exec2/markdown-editing`), in
`/Users/kiro/my_projects/gisik-nokma-exec3`, with `node v22.22.2` in `PATH`.

> **⚠ AND `origin/main` HAS SINCE MOVED TO `33f1438616792331e8f0d5727cf49ea70bbebdb2` — VERIFIED,
> NOT ASSUMED, TO CHANGE NOTHING I MEASURED.** The two commits main gained are `#624` (*"Cycle 34:
> the queue is empty, all eight items merged, and the three-reviewer exercise is running"*) and its
> merge, and **the only file they change is `docs/lanes/controller-state.md`**
> (`git diff --name-only e4baa425 33f14386` → 1 path). `e4baa425` is an ancestor of `33f14386`. **Not
> one file any finding below cites was touched**, so every finding transfers to current `main`
> unchanged. Recorded here because a reader who fetches and sees a different sha should not have to
> re-derive that.

**This is review only.** No fix branch, no fix commit, no PR. Every mutation below was applied to a
worktree file and restored with `git checkout -- <path>` **verified by `cmp` against a copy taken before
the mutation**, never by `git diff` alone. Every restore printed `RESTORED identical`. Final
`git status --porcelain` on this branch is empty apart from this report.

---

## 0. THE ONE-LINE ANSWER

**I found no Critical defect in the engine or the wire.** The three Important findings are all *claims
about the code* rather than the code: one stale open-gap declaration (F1), one recorded measurement whose
stated warrant is false (F2), and my own lane's prototype citations, which name an artifact the owner has
ruled is not the prototype and are off by one against the one that is (F3). The two Medium findings are
**confirmations of gaps the project already records and owns** (F4, F5) — reported because I reproduced
them independently, not because they are news.

**And one dispatched premise is stale and should not be acted on.** The dispatch says *"eleven sites carry
[the soft-delete predicate] and ten were UNCONSTRAINED."* At `e4baa425` **every one of the 18 sites is
constrained.** Measured: §5.1.

---

## 1. ENUMERATION — my universe, before any finding

| area | what is in it | count |
|---|---|---|
| `apps/server/src/routes/` | the route modules | **19 files**, 47 registrations |
| `apps/server/src/` (rest) | projections (19), reads (18), visibility (4), permissions (2), sync (8), stream (2), notifications (4), auto-close, ingest, ledger, attachments, auth, gates, http, ops, seed, tools, alerts | 30,588 lines of `.ts` |
| `apps/server/migrations/` | every migration | **32 files** |
| `packages/domain/src/` | event vocabulary, state model, invariants | 38 files |
| `packages/rule-engine/src/` | checks, transitions, hierarchies, guards | 28 files |
| `packages/sync-client/src/` | engine, outbox, replica, storage, transport | 13 files |
| `packages/mcp-server/src/` | the MCP surface | 13 files |
| `packages/app-core/src/online/` | the wire mappers and the HTTP data source | 11 files (2,457-line `mappers.ts`) |
| `packages/app-core/src/replica/` | the offline data source | 1 file, 1,500 lines |
| `scripts/` | the checkers | **9** `check-*.mjs` |

**Pattern note, because the pattern is the whole risk.** My first door sweep was
`grep -E 'app\.(get|post|…)' apps/server/src/routes/*.ts` and returned **47 registrations**. That
universe was **wrong**: widening the pattern to all of `apps/server/src` found **7 further
registrations** in `sync/sync-routes.ts` (3), `sync/contests-route.ts`, `sync/reconcile-route.ts`,
`stream/routes.ts` and `app.ts:743` (`/healthz`). *A sweep is only as complete as its pattern* — this one
was caught by widening it, not by reading it.

---

## 2. COVERAGE — what I reached, and what I did not

**Reached, systematically:** the soft-delete rule (all 18 sites, by mutation); the migration set (all 32,
by pattern sweep + the live dev database); the route door set (all 54 registrations, guards by identity);
all 9 checkers (read + run); my own lane's §17 group (cases `17.001`–`17.006` and the header) against the
ruled prototype export.

**Suites run at `e4baa425`:**

| run | result |
|---|---|
| `apps/server` full suite (baseline) | **166 files, 1727 passed, 5 skipped, 0 failed** (3 m 15 s) |
| `apps/server` with `LIVE_TICKET_WHERE → 'TRUE'` | **5 files failed, 19 tests failed** (1726 passed) |
| 4 individual longhand-site mutations | **each killed** (§5.1) |
| `apps/server` with `my-work.ts:364` guard removed | **1727 passed, 0 failed** — SURVIVOR (§5.4) |
| `packages/app-core` replica suite, replica `:996` mutated | **27 passed, 0 failed** — SURVIVOR |
| `packages/app-core` replica suite, replica `:1029` mutated | **27 passed, 0 failed** — SURVIVOR |
| `apps/server` `test/dual-client`, replica `:996` mutated | 21 passed, 0 failed — **INVALID, see F2** |
| all 8 CI-wired checkers | **green** (§6) |

**NOT reached — named rather than implied:**

- **No line-by-line correctness review** of `packages/rule-engine` internals, `packages/mcp-server`
  internals, `packages/sync-client` internals, or `packages/domain`. I read them only where a finding
  path led. **I have no findings in those three packages, and that is not the same as saying they are
  clean** — it means I did not look hard enough there to say.
- **`packages/app-core/src/online/mappers.ts` (2,457 lines)** was scanned for defaulting operators
  (`??`, `||`) and spot-read; that scan found the *opposite* of the failure shape (§7.1). It was not
  reviewed line by line.
- **`apps/web`, `packages/ui`, `packages/editor`** — outside this lane's universe; not opened.
- **No browser or pixel measurement whatsoever.** Every assertion I ran is jsdom, stylesheet text, SQL or
  a TypeScript type. **No case in this report observes a painted pixel**, and none of my findings rests
  on one.
- **The prototype comparison is narrow, and honestly so.** The prototype is a UI artifact; my lane is the
  engine and the wire. The one place a ruling about the prototype meets the wire in my area is the
  `Visibility` roster (§7.2), and that is where I compared. **I did not compare the prototype's screens
  to the product's engine behaviour** because the prototype draws no engine.
- **`apps/server`'s suite was run on this machine only, never in CI, and never under a fresh `dist`
  rebuild.** For `apps/server` itself that is safe (its tests import `../src/*.js` relatively). It is
  **not** safe for anything reaching `@gisik-nokma/app-core` by package name — that is F2.

---

## 3. THE FIVE PARTS, DECLARED ONCE

Every finding below gives **WHAT** is wrong · **WHY** it is wrong · **WHAT WOULD HAVE BEEN BETTER** ·
**THE MEASUREMENT** it rests on · **A SEVERITY**. Where I could not measure, the finding says
**unverified** and says why. Nothing below is a fix, and nothing below has been fixed.

---

## 4. FINDINGS — IMPORTANT

### F1 — IMPORTANT — An open-gap section still declares a closed security-relevant leak, with both supporting numbers stale and a named owner pointing at finished work

**WHAT.** `apps/server/test/read/soft-delete-background-paths.test.ts:118` heads a section
`### ⛔ WHAT NEITHER ARM COVERS, NAMED RATHER THAN LEFT AS AN ABSENCE`, whose `:120` reads *"FOUR
surfaces, every one of them MEASURED as a survivor"*. Its subsection (a) at `:123` is titled *"A
soft-deleted ticket's ATTACHMENTS are served by THREE doors, and the third serves the BYTES"*, asserts at
`:142-144`:

> ⚠ **The grep, with its control: `routes/attachments.ts` contains the word `deleted` ZERO times, while
> the same grep finds it 6 times in `routes/tickets.ts` — an absence at the file, not a missed line.**

and closes at `:146` with *"**Named owner: whoever next picks up the attachment surface.**"*

**WHY it is wrong.** The leak is **closed**, in three places with three witnesses:

1. **The guard exists.** `apps/server/src/routes/attachments.ts:10` imports `ticketIsLive`, and calls it
   at `:388` (the upload door) and `:545` (the download door — the one that serves the bytes).
2. **The numbers are both false.** Measured `grep -c "deleted"` at `e4baa425`:
   `routes/attachments.ts` → **5**, not ZERO. `routes/tickets.ts` → **13**, not 6.
3. **The cases exist, are green, and are constrained.** Cases `16.97` (list door), `16.98` (upload door)
   and `16.99` (download door) live in `apps/server/test/integration/soft-deleted-attachments.test.ts`
   and pass in the baseline run. My `LIVE_TICKET_WHERE → 'TRUE'` mutation reddens **three of them**
   (`16.97`, `16.98`, `16.99`) — so they do not merely pass, they hold the guard.

**The correction exists next door and not here.** `apps/server/src/routes/tickets.ts:885` carries
`**⚠ CORRECTED 2026-09-21, ON THE FOLD.**`, naming this exact leak as closed by executor 1's `#610`. The
commit that wrote it — `6a69f5df`, *"Fold origin/main: the guard I hand-rolled shipped as a shared helper,
and **four claims the merge made false**"* — corrected claims in `apps/server/src/routes/tickets.ts` and
`apps/server/test/integration/soft-delete-client-surface.test.ts` and **did not touch this file**
(`git show --name-only 6a69f5df` = 2 files; `grep -c soft-delete-background-paths` = 0). Its own message
says the sweep *"was run over the whole tree by CONTENT"* — and the sentence three lines below the line it
edited went on saying `ZERO times`.

**WHAT WOULD HAVE BEEN BETTER.** The correction should have landed in the file that **owns the
enumeration**. Concretely: replace (a)'s body with the supersession marker the catalogue already carries
(`test-cases/16-remaining-doors.md:923` handles it correctly — *"STATUS CHANGED 2026-09-20: (a) is FIXED
— cases `16.96`–`16.99`"*) and point the reader at those cases, rather than leaving a live gap with a
named owner. **The cheap detector for the class: a "known gap" paragraph should be greppable by the
number it is built on.** Both of (a)'s numbers (`ZERO`, `6`) are stale *and* the sentence that would have
been checked by a content sweep — `attachment surface` — appears in exactly **one** source file, which is
the one nobody swept.

**SEVERITY: Important.** Not Critical — the product is correct and tested; no behaviour is wrong. But a
stale known gap is **pre-authorised work that no longer needs doing**, and this is the artifact a
reviewer or the next lane reads to decide what to do with the attachment surface. I read it before
measuring and believed it.

**MEASUREMENT.**
```
grep -c "deleted" apps/server/src/routes/attachments.ts   → 5     (claim: ZERO)
grep -c "deleted" apps/server/src/routes/tickets.ts       → 13    (claim: 6)
git show --name-only 6a69f5df | grep -c soft-delete-background-paths → 0
grep -rn "attachment surface" --include=*.ts apps packages → 1 file (soft-delete-background-paths.test.ts:146) + 1 acknowledgement (routes/tickets.ts:888)
```
Control on the same path: `grep -rn "WHAT NEITHER ARM COVERS" --include=*.ts apps` → 1 hit, the section
heading itself. The sweep was not silent.

---

### F2 — IMPORTANT — A recorded survivor measurement's stated warrant is false: the second witness read a stale `dist`

**WHAT.** `apps/server/test/read/soft-delete-background-paths.test.ts:179` justifies the trustworthiness
of the (c) survivor measurement in these words:

> BOTH MEASURED SURVIVORS — remove each conjunct in turn and app-core's replica suite reads 27 passed / 0
> failed while `apps/server`'s `test/dual-client` reads 21 passed / 0 failed; **and the mutation reached
> the artifact, checked rather than assumed: that test imports `../../src/replica/replica-data-source.js`,
> not the package name, so nothing resolved through a stale `dist`.**

**WHY it is wrong.** The relative-path import it names belongs to the **app-core** half, not the
`dual-client` half:

- `packages/app-core/test/replica/replica-data-source.test.ts:30` imports
  `'../../src/replica/replica-data-source.js'` — **relative**, so that half is valid.
- `apps/server/test/dual-client/rig.ts:32` imports **`'@gisik-nokma/app-core'`** — the package name.
- **No file under `apps/server/test` imports `packages/app-core/src` by a relative path at all.**
  `grep -rnE "^\s*import .*from '[^']*packages/app-core" apps/server/test/` → **0 hits** (the relative-path
  mentions in that tree are docblock prose, not import statements).
- `packages/app-core/dist/replica/replica-data-source.js` was **stale** when I ran it: mtime
  `2026-09-20 23:31:09`, against my `src` edit at `00:32:01`. Its built copy still carries both gates
  (`dist/.../replica-data-source.js:696` and `:728`).

So the `21 passed / 0 failed` reading is **not evidence for the mutation**: nothing rebuilt `dist`, and
the suite resolves through `dist`.

**⚠ AND THE PRONOUN IS AMBIGUOUS, SO THE FINDING IS STATED TO SURVIVE BOTH READINGS.** *"that test"*
could be read as the app-core replica suite rather than `dual-client`. Under **either** reading the
`dual-client` half is unwarranted: if *"that test"* is `dual-client`, the reason given is simply false of
it (it imports the package name); if *"that test"* is the app-core suite, then the sentence warrants only
the 27/0 half and the 21/0 half is published **with no stated warrant at all**. The finding does not
depend on which was meant — which is why I did not resolve the pronoun before reporting it.

**WHAT WOULD HAVE BEEN BETTER.** Either (i) run `pnpm turbo run build` before the `dual-client` half and
say so, or (ii) cite the app-core half alone — it is the half that is valid and it is sufficient. The
sentence as written names the wrong test for the property it claims, and it is the **only** reason a
reader is told to trust the number.

**AND THE GAP ITSELF SURVIVES, on one witness.** I reproduced both gates with a valid instrument: the
app-core replica suite reads **27 passed / 0 failed** with `:996` mutated to `if (false) continue;` and
again with `:1029` mutated to `true,`. So (c) is real — it is F5 below. The finding here is narrower and
is about the **record**: a measurement whose published warrant does not hold.

**SEVERITY: Important.** It is the "a mutation that never ran is indistinguishable from a killed one /
never-ran" class, in the direction that *condemns a check*. It happens to reach the right conclusion for
one of its two halves — but the stated reason is false, and the next lane that trusts the sentence will
trust a 21/0 reading that measured nothing.

**MEASUREMENT.** As above: the two import lines read directly; `dist` mtime vs `src` mtime via `stat -f`;
the `grep -rnE` over `apps/server/test` returning 0 with a positive control on the same command
(`grep -rn "from '@gisik-nokma/app-core'" apps/server/test/` → 3 files).

---

### F3 — IMPORTANT — **My own lane's §17 group** cites an artifact the owner has ruled is not the prototype, and every citation in it is off by one against the artifact that is

**WHAT.** `test-cases/17-open-work.md` (shipped in `#619`, `6029e1cf`) cites the prototype by line number
into **`design-system/interactive/desktop.dc.html`** — the header at `:87-90`, and cases `17.001`–`17.004`
and `17.006` throughout: `:1213`, `:1210`, `:1214`–`:1224`, `:1216`, `:1224`, `:1225`–`:1229`, `:1230`,
`:3755`, `:3756`, `:3786`.

**WHY it is wrong.** The owner ruled — verbatim, recorded in the common brief — *"all prototype should be
from this zip file"*, staged read-only at
`/Users/kiro/my_projects/gisik-nokma-lanes/prototype-2026-09-20/`. The repo's copy is a **different
file**, and it is **not merely different, it is broken**:

| | repo copy | staged export (ruled) |
|---|---|---|
| sha256 (first 16) | `2cda054b4320ebb6` | `3d142d464a070b33` |
| line count | 4,050 | 4,049 |
| `viewBox` occurrences | **0** | **23** |
| `sc-camel-view-box` occurrences | **24** | **0** |
| `sc-camel-on-click` | 161 | 0 |

`viewBox` is case-sensitive in SVG, so **the repo copy's icons carry no coordinate system at all** — any
visual comparison made against it is a comparison against a broken rendering. (This corroborates and
quantifies the common brief's statement; the brief did not give the counts.)

And the offset is uniform, measured at both ends of the file:
`rowValueB` repo `:3756` = staged `:3755`; `visBtnStyle` repo `:3786` = staged `:3785`; the "Who can see"
eyebrow repo `:1213` = staged `:1212`; `Add someone who can see it…` repo `:1225` = staged `:1224`.
**Every cited line in my group is +1 against the ruled export.**

**⚠ AND THE SUBSTANCE SURVIVES — this is the important half of the finding, and I checked it rather than
assuming either way.** Case `17.002`'s measurement reproduces **identically in both files**: 13 lines
carry `letter-spacing:0.6px`; of those, **12 are `13px/18px` and exactly 1 is `12px/16px`** — in the repo
copy *and* in the staged export; the one instance is repo `:1213` / staged `:1212`. So the comparisons my
lane made are **visually and structurally valid**; the camelCasing pass renamed attributes in place. The
defect is in the **citation**, not in the finding it supports.

**WHAT WOULD HAVE BEEN BETTER.** Cite the staged export by **file name and sha** — as the common brief
requires — and shift the numbers by −1, or state the copy used and the offset explicitly. The general
form: **a prototype citation should name the artifact it was measured in, because two files in this
repository both call themselves the prototype and only one of them is.**

**SEVERITY: Important.** It is pervasive (one header plus five case bodies in shipped work), it is against
a standing owner ruling about which artifact the prototype *is*, and it makes every one of my own
citations un-followable against the ruled file without a manual shift. It is **not** Critical: no product
behaviour depends on it and I verified the underlying measurements transfer.

**MEASUREMENT.** `shasum -a 256` on both files; `grep -o 'viewBox' | wc -l` and the same for
`sc-camel-view-box` on both; `wc -l` on both; the four paired line reads via `sed -n`. Control: the same
`grep` run for `letter-spacing:0.6px` on **both** files returned 13/12/1 on each — so the counts are a
property of the prototype, not of one copy.

---

## 5. FINDINGS — MEDIUM (both are **confirmations of recorded, owned gaps**, not news)

### F4 — MEDIUM — `routes/my-work.ts:364`, the contested-claim title gate, is a confirmed open gap

**WHAT.** `apps/server/src/routes/my-work.ts:363-366` gates a contested claim's title on
`row.deleted_at === null && (await canSee(db, viewerId, row.ticket_id))`. Nothing in the server suite
constrains the `deleted_at` half.

**MEASUREMENT — reproduced independently at `e4baa425`.** With the conjunct removed (line 364 rewritten
to `(await canSee(db, viewerId, row.ticket_id))`), the **full `apps/server` suite reads 1727 passed /
0 failed / 5 skipped — byte-identical to the baseline.** Compare §5.1: this is the *only* soft-delete site
in the server that survives.

**The positive control, in the same tree.** That this is a survivor and not a mutation that never ran is
established by the same file: `my-work.ts:141` and `:252` are both killed by the full-constant mutation,
which reddens `soft-delete-client-surface.test.ts` — a suite that drives `my-work`'s routes. So the test
command **can** fail on this subsystem, and an edit to **this very file** reaches the compiled artifact.

**WHY it is wrong (the gap, not the code).** The code is right; the **coverage** is absent. The rule "a
deleted ticket is in no view" has one surface — the contested strip's title — where no fixture holds a
deleted ticket, so the conjunct is executed-but-unconstrained.

**WHAT WOULD HAVE BEEN BETTER.** A contested-claim fixture whose ticket is then soft-deleted, asserting
the title is `null` while a live contested sibling's title is not. The project names this itself at
`test-cases/16-remaining-doors.md` (16.90(b)) with the owner *"whoever next picks up the contested-claim
surface"*. **This finding adds nothing new except an independent reproduction; it is reported because the
brief asked me to verify the record, and the record holds.**

**SEVERITY: Medium.** It is a real unwitnessed application of a rule the product treats as load-bearing,
on a surface a user can read. It is not Critical: the code is correct today.

---

### F5 — MEDIUM — The replica's two TypeScript gates are confirmed open gaps, and the table's citations for them have rotted

**WHAT.** `packages/app-core/src/replica/replica-data-source.ts` applies the delete rule twice in
TypeScript — `:996` (`if ((state.deleted ?? null) !== null) continue;`, the ticket enumeration) and
`:1029` (`(state.deleted ?? null) === null,` the board filter conjunct).

**MEASUREMENT — reproduced independently at `e4baa425`, with a valid instrument.** Mutating `:996` to
`if (false) continue;` → app-core replica suite **27 passed / 0 failed**. Mutating `:1029` to `true,` →
**27 passed / 0 failed**. The instrument is valid because that suite imports the module under test by
**relative path** (`test/replica/replica-data-source.test.ts:30`), so nothing resolved through `dist`.

**AND THE CITATIONS HAVE ROTTED.** The enumeration cites `:947` and `:980`. At this sha,
`replica-data-source.ts:947` is `getMyWork: () => Promise.reject(new ReplicaGapError(…))` and `:980` is
`const stateNameOf = stateNameFrom(defs);` — **both lines resolve, and neither is the delete gate.** The
real lines are `:996` and `:1029` (+49). This is the failure the same docblock warns about one paragraph
earlier, applied to its own citations.

**WHAT WOULD HAVE BEEN BETTER.** Cite by content — *"the `if ((state.deleted ?? null) !== null) continue;`
in the ticket enumeration"* — which is what the file says it does for the neighbouring I2 note and does
not do here. And cover the two gates with a deleted-ticket fixture in the replica suite.

**SEVERITY: Medium.** Same shape as F4: the code is correct, the coverage is absent, and the project
already owns it (16.90(c), owner *"whoever next picks up Plan 10's replica reads"*). The added part is the
citation rot, which is Low on its own.

---

## 6. FINDINGS — LOW

### F6 — LOW — The soft-delete enumeration's own counts do not reproduce from the command printed beside them

**WHAT.** Two places state the same figure, both naming the command that produces it:

- `apps/server/src/read/visible-where.ts:155-156`: *"reviewer: 13 executable uses of the constant (8
  `` `${LIVE_TICKET_WHERE}` `` + 5 `LIVE_TICKET_WHERE,` across 9 files)"*
- `apps/server/test/read/soft-delete-background-paths.test.ts:45-46`: *"`git grep -n 'LIVE_TICKET_WHERE'
  -- apps/server/src` → **13 executable uses of the named constant**, across 9 files"* — and `:55`:
  *"**13 + 4 = 17 SQL statements carry the rule.**"*

**MEASURED at `e4baa425`:**

| | measured | claimed |
|---|---|---|
| `` ${LIVE_TICKET_WHERE} `` template splices | **9** | 8 |
| `LIVE_TICKET_WHERE,` array members | **5** | 5 |
| **executable uses** | **14** | 13 |
| files carrying an executable use | **10** | 9 |
| SQL statements carrying the rule (14 + 4 longhand) | **18** | 17 |

The difference is exactly one site: **`read/live-ticket.ts:58`**, whose `ticketIsLive` holds
`${LIVE_TICKET_WHERE}` inside a real `SELECT 1 … WHERE`. The table's *row set* excludes it deliberately —
the project classifies it as *"`LIVE_TICKET_WHERE` asked at a route … NOT a predicate inside the read's
SELECT"* (`soft-delete-client-surface.test.ts:519`) — but the sentence counting **"executable uses of the
constant"** does not say so, and a reader who runs the published command gets 14/10.

**WHAT WOULD HAVE BEEN BETTER.** One clause: *"13 view-site uses … plus `read/live-ticket.ts`'s
`ticketIsLive`, which asks the same constant at a route."* Then the command and the caption agree.

**SEVERITY: Low.** Documentation only. But it is the exact class the paragraph it sits in exists to
document — *"a bare number here was a claim about a universe nobody had pinned"* — recursed one level.
Note the numbers were **measured before I found the site gap**, i.e. my own count would have been 13 under
the table's implicit unit; the finding is that **the unit is unpinned**, not that the arithmetic is
careless.

**MEASUREMENT.**
```
grep -rn '\${LIVE_TICKET_WHERE}' apps/server/src   → 10 lines, 9 executable
                                                     (1 is a docblock mention: visible-where.ts:155)
grep -rn 'LIVE_TICKET_WHERE,' apps/server/src      → 5 array members (after removing 10 import lines)
grep -rniE "deleted_at[[:space:]]+is[[:space:]]+(not[[:space:]]+)?null" apps/server/src
                                                   → 4 longhand + the constant's own definition
```
Each site's context was read individually to confirm it is executable SQL and not a comment; the 9
template sites are at `auto-close/sweep.ts:197`, `workspace-counts.ts:112`, `:226`, `live-ticket.ts:58`,
`builder-reads.ts:362`, `:438`, `board.ts:115`, `notifications/sweep.ts:187`, `:265`.

---

### F7 — LOW — **My own lane's §17 block table** has one row and no rule for a lane with no allocation

**WHAT.** `test-cases/17-open-work.md:28` is the whole allocation table: **one row**, `exec 3` →
`17.001`–`17.020`. `:30` says *"THIS TABLE IS THE ALLOCATION, AND IT EXPIRES"* and `:33` gives the only
escape hatch: *"**When your block is empty, STOP AND ASK.** Do not mint from the tip and do not borrow a
neighbour's."*

**WHY it is wrong.** The rule covers *your block is empty*. It does not cover **you have no block**. A
third lane arriving at §17 finds no row, and the stated rule does not fire on that state — the nearest
instruction is the negation of a case it is not in. **And that lane is not hypothetical:**
`test-cases/16-remaining-doors.md:16-17` records exec 1's block and exec 2's block as **"FULLY SPENT"**,
and says exec 2's *"must be reallocated by the controller before the next mint"*. So both other lanes
will arrive at §17 unallocated.

**WHAT WOULD HAVE BEEN BETTER.** Two rows (or `— not allocated —` rows for exec 1 and exec 2), plus one
sentence: *"a lane with no row here must STOP AND ASK; silence is not a licence."* §17 is the section my
lane opened, so this is my defect to name.

**SEVERITY: Low.** It is a governance hole, not a collision — the `check-case-ids` ratchet reports the
count moving, so a stray mint is visible after the fact. But the hole is the one that made §13 go red
twice, and it costs two table rows to close.

**MEASUREMENT.** `grep -n "exec 3.*17.001\|THIS TABLE IS THE ALLOCATION\|When your block is empty"
test-cases/17-open-work.md` → 3 hits, `:28`, `:30`, `:33`. The table's row count is 1 — read directly.

---

### F8 — LOW / observation — `check:db-tz` is the only one of the nine checkers with no automated invocation

**WHAT.** `scripts/check-db-timezone.mjs` is wired to `package.json` as `check:db-tz` and appears
**nowhere in `.github/workflows/ci.yml`**. The other eight are all invoked by CI:
`check-env-example` (`ci.yml:167`), `check-skipif-coverage` (`:168`), `check-case-ids` (`:169`),
`check-runbook-commands` (`:203`), `check-case-citations` (`:231`), `check-help` (`:255`),
`check-task-ledger` (`:267`), `check-migration-order` (`:316`), `check-no-silent-skips` (`:449`).

**WHY it matters, stated narrowly.** Its own docblock argues it tests a property nothing else can: a
client that connects with **no startup options and no `SET TIME ZONE`**, so only the *database's own*
configured default can produce a pass — what an operator's bare `psql` session gets. The other timezone
tests pin the pool's ability to *override*, not the database's default. So the property is real, unique,
and unwatched. **But CI has no provisioned database to point it at**, so not wiring it may be deliberate;
I could not determine that from the tree, and I am not calling it a defect. **It is recorded because a
check that only runs when a human remembers is how the viewport suite's own CI comment describes the
failure it was written to fix.**

**AND I TRIED TO FALSIFY THE OTHER EIGHT AND COULD NOT — recorded so the next lane does not spend here.**
Four carry an **internal self-test** — a planted-defect fixture the script itself runs before its real
sweep: `check-case-citations.mjs:288` (consumed at `:361`), `check-case-ids.mjs:195` (consumed at `:221`),
`check-migration-order.mjs:396` (reported at `:428`), `check-runbook-commands.mjs:202`. The other four
**refuse an empty universe by design**, with the reasoning in the failure text —
`check-env-example.mjs:180-188` (*"A gate that finds nothing cannot fail, and a check that cannot fail is
not evidence"*), `check-task-ledger.mjs:290-293`, `check-skipif-coverage.mjs:28-31`,
`check-no-silent-skips.mjs:55-60`.

⚠ **Two of those four cites were docblocks on my first pass** (`check-case-citations.mjs:279` and
`check-migration-order.mjs:58` are comments *about* the self-test, not the self-test). I repointed them at
the lines that run, by grepping for where the planted array is consumed. **A citation that lands in the
paragraph describing a mechanism is not a citation of the mechanism** — the same shape as F1's stale
sweep, at a smaller scale.

**SEVERITY: Low / observation.**

**MEASUREMENT.** Each script read at the cited lines; all nine run at `e4baa425` (§7.4). The CI claims
come from `grep -n "node scripts/\|run: pnpm check" .github/workflows/ci.yml`.

> **A NOTE ON MY OWN FIRST READING HERE.** I initially concluded *"six of the nine have no self-test"* from
> a `grep -rl <name> --include=*.test.ts` sweep. That sweep's universe was *the script's filename inside a
> test file*, which is **not** the same question as *does the script self-test*. Opening
> `check-case-ids.mjs` showed a `selfTestFailures` array at `:195` — **a self-test that never names
> itself**. I withdrew the finding. Recorded because the sweep was well-formed, returned a
> plausible number, and was still answering a different question.

---

## 7. POSITIVE FINDINGS — and one stale DISPATCHED premise

### 7.1 ⛔ THE DISPATCHED PREMISE IS STALE: at `e4baa425` every soft-delete site is constrained

The dispatch states: *"eleven sites carry it and ten were UNCONSTRAINED — mutating each to `AND TRUE` left
the whole server and app-core suites green, while `AND FALSE` reddened them."* **That was true when it was
measured and it is not true now.** Measured at `e4baa425`:

| mutation | result |
|---|---|
| `LIVE_TICKET_WHERE = 'TRUE'` (removes the filter at **all 14** constant sites at once) | **5 files failed, 19 tests failed** — `soft-delete-client-surface` (3), `soft-deleted-attachments` (4), `ticket-comments` (1), `soft-delete-background-paths` (5), `soft-delete.test` (6) |
| `visibility/rollup.ts:263` → `AND TRUE` (longhand) | **killed**, 2 cases (`soft-delete-client-surface.test.ts`, `soft-delete.test.ts:339`) |
| `routes/builder-reads.ts:504` → `AND TRUE` (longhand, alias `k`) | **killed**, 1 case (`readTicketCounts counts live tickets only…`) |
| `projections/rollups.ts:221` → `AND TRUE` (longhand) | **killed**, 1 case (`proj_rollups` rollup for a parent that keeps a row) |
| `projections/rollups.ts:320` → `AND TRUE)` `` ` ``, (longhand, the stale-row DELETE) | **killed**, 1 case (same) |

All five restores printed `RESTORED identical` against pre-mutation copies. **The two longhand projection
sites — which the enumeration itself flags as "MUTUALLY MASKING" and says survived the whole suite until
Arm 1's second parent fixture existed — are both killed today.** The claim holds.

**Why this matters more than a normal positive finding:** sent at a lane as a live target, this premise
produces work on a solved problem. It belongs in the same class as F1 — *a stale reading is
pre-authorised work*.

**A CAVEAT ON MY OWN TWO INVALID RUNS, recorded because the failure mode is the one this repo keeps
meeting.** My first `rollups.ts:320` mutation replaced the line with `AND TRUE)` and **dropped the
trailing backtick-and-comma that closes the SQL template** — so the file did not parse, vitest collected
only **732** of 1,732 tests, and the run printed 13 failures that had nothing to do with the property.
I caught it because the summary count was wrong, then added a **backtick-count control** to every
subsequent mutation (`tr -cd '`' | wc -c` before and after; all subsequent runs printed `BALANCED`).
**A `failed`-only verdict would have scored that mutation as killed.** The second invalid run was a
**backgrounded** mutation whose log came back **0 bytes**; it had died silently, and I re-ran it in the
foreground rather than accept an empty log as a result.

### 7.2 THE PROTOTYPE COMPARISON, CLASSIFIED (my lane's only meeting point with it)

| prototype element | classification |
|---|---|
| The `Visibility` roster: a chip per viewer with a removable `×`, an *"Add someone who can see it…"* `<select>` over `viewerCandidates` | **DIVERGES AND THE DIVERGENCE IS RULED.** `apps/server/src/routes/tickets.ts:115-118` refuses to serve `own_user_ids` / `resolved_user_ids` — *"an explicit audience ROSTER, a disclosure no plan authorized"* — and the section is *not built*. Case `17.006` holds the absence as a **negative assertion with a positive control** (the same walk must find exactly `MEMBERS.length` names inside the editable people picker). **The divergence still serves the ruling.** |
| The control is a **binary toggle**; the product's is a **4-mode radio group** | **DIVERGES WITH NO RULING FOUND — and it is recorded rather than fixed.** Named in `test-cases/17-open-work.md` and `docs/lanes/executor-3-state.md §2`, owner the controller. |
| The row is a `<dt>/<dd>` pair **inside** the sheet's `<dl>`; the product mounts a standalone `<section>` **after** `</dl>` | **DIVERGES WITH NO RULING FOUND — recorded, owner the controller.** Same citations. |
| The row's `12px/16px` secondary scale where the neighbouring eyebrow constant is `13px/18px` | **MATCHES** — and case `17.002` exists precisely so a later "harmonise the two" edit reddens. Verified reproducing in **both** prototype copies (§F3). |

**No category-3 divergence is unrecorded in my area** — the two structural ones are named with an owner,
which is the honest form even though neither has a ruling.

### 7.3 Every door is guarded, and the guards are uniform

Widened sweep (see §1): **54 registrations** across `apps/server/src` — 53 as
`app.(get|post|put|patch|delete)`, plus **one** as `instance.get` inside `stream/routes.ts`'s encapsulated
plugin (`:265`), which is registered that way deliberately and pinned by case `7.155`.

**Guarded: 49 of the 54, and every one of them is `requireSession`** — 43 in `routes/`, 5 in `sync/`, and
the stream route's `preHandler: [requireSession, requireConnectionBudget]` at `stream/routes.ts:267`,
which adds a connection budget on top rather than substituting for the session. **No route uses a weaker
guard.** The **5** unguarded registrations are all public by design, each read at its own line:

| door | why it is public |
|---|---|
| `app.ts:743` `GET /healthz` | liveness — registered with no options object at all |
| `routes/auth-methods.ts:95` `GET /v1/auth/methods` | the sign-in page must learn what is enabled before a session exists — the brief's own dev-stack check curls it unauthenticated |
| `routes/invites.ts:399` `GET /v1/invites/:token` | the token *is* the credential |
| `routes/mcp-device.ts:64` `POST /v1/mcp/device/code` | RFC 8628 device-code issue — options carry a `schema` and nothing else |
| `routes/mcp-device.ts:160` `POST /v1/mcp/device/token` | RFC 8628 poll — same |

⚠ **AND MY FIRST ATTEMPT AT THIS SET WAS WRONG, IN A WAY WORTH RECORDING.** An `awk` heuristic that
scanned the 14 lines *after* each registration reported **9** unguarded doors. Four of them
(`attachments.ts:302`, `:532`, `mcp-tokens.ts:72`, `my-invitations.ts:184`, `workspaces.ts:177`) carry
`{ preHandler: requireSession }` **on the registration line itself** — the heuristic starts looking on the
next line and so cannot see the inline form, and it **over-reports**. It also missed
`auth-methods.ts:95` entirely. **A pattern that misses the inline form is as wrong in the loud direction
as in the quiet one**; the 5 doors above were each confirmed by reading the registration and its options,
not by the heuristic.

**This is a clean result and I could not falsify it.**

### 7.4 All eight CI-wired checkers green at `e4baa425`

```
check-env-example        EXIT=0
check-task-ledger        EXIT=0
check-case-citations     EXIT=0   ok (ratchet holds exactly on every file)
check-case-ids           EXIT=0   ok (2606 unique ids, highest 17.006)
check-skipif-coverage    EXIT=0   ok (418 test files scanned, every .skipIf( usage is under apps/server/test/)
check-migration-order    EXIT=0   ok (no migration is new against origin/main; nothing to order)
check-runbook-commands   EXIT=0   ok (all 33 references resolve, 21 distinct)
check-help               EXIT=0   ok (2 documents, 29 sections, 231 entries, generated copy matches source)
```

⚠ **The common brief says `test-cases/` holds "2601 ids across 25 files". Measured here: 2606 unique ids,
highest `17.006`.** The brief's own rule applies to the brief — *its arithmetic is advisory*. I report the
number I measured, from the tree's own copy of the script.

⚠ **And my first attempt at this table printed `[0]` for all eight** because of a zsh word-splitting bug
(`$cmd` unquoted does not split in zsh), so every command failed with *"no such file or directory"* and
every exit code read 0. **A verdict that could not fail, produced by my own harness, on the exact command
whose subject is checks that cannot fail.** Re-run with `"$@"` and a correct `$?` capture.

### 7.5 The mappers refuse to default — the "client asserts a success the server declined" shape is being resisted

`packages/app-core/src/online/mappers.ts` (2,457 lines) was scanned for `??` / `||` defaulting and
spot-read. It contains **explicit refusals** at the points where the failure shape would live:
`:467` (*"through as absent instead of being defaulted — a `?? ''` would convert…"*), `:584`
(*"`cards ?? []` rendered a body that lost…"*), `:1314` (*"**There is no `?? 0` on this path and there
must not be**"*), `:1538`, `:1703`. The remaining `??` uses are roster lookups and optional-key reads with
one answer for `undefined` and `null`, not silent substitutions.

**This is a scan, not a line-by-line review** — see the coverage boundary in §2. Recorded because the
brief names this product's most expensive recurring shape, and in the file most likely to carry it, the
discipline is present and argued at the line.

### 7.6 Migrations: the ordering rule holds, and one live instance is untested — but the risk is low, measured

**Numbering.** All **32** files sort strictly ascending by numeric prefix (checked as a sorted list against
itself). `check:migrations` is green.

**The live dev stack is behind — and this is staleness, not breakage.** `docker ps` (read-only) shows
`gisik-nokma-dev-server-1` created **2026-09-20 20:26 IST**; the primary checkout it builds from is at
`main` `6db8b6b8` (**#605**, 19:42 IST) while `origin/main` is `e4baa425` (**#623**). Measured against the
dev database at **port 54330** (read-only):

```
pgmigrations rows in the dev DB : 31
migration files in the repo     : 32
missing                         : 1790000000000_proj-ticket-comments.sql
proj_ticket_comments in dev DB  : ABSENT
```

`#623` merged at **2026-09-20T18:33:42Z = 00:03 IST on 09-21** — *after* the container was built. So the
container cannot contain the comments code and nothing is 500ing. **The 18-merge staleness is the
finding's context, not its subject.**

**The subject is the unwitnessed property: no migration in this tree is ever applied to a database that
already holds data.** The only two `runner()` calls in the entire repository are
`apps/server/test/helpers/db.ts:40` (`direction: 'up'`, on a database created moments earlier by
`createTestDatabase`) and `apps/server/test/projections/tickets-rank.test.ts:230` (`direction: 'down'` —
and that one *also* takes a fresh database first). So all 32 `up` migrations, and 31 of 32 `down`
migrations, have only ever run against an **empty** database. `check:migrations` cannot see this by
construction — its own docblock says so: *"The gate proves the repo; it cannot prove a database that has
already run something."*

**⚠ AND I MEASURED THE RISK RATHER THAN ASSERTING IT.** Sweeping all 32 migrations for patterns that can
fail on populated data: **zero** backfills (`UPDATE`/`INSERT … SELECT`) anywhere; **one**
`ADD COLUMN … NOT NULL`, and it carries a `DEFAULT false`
(`1788700000000_proj-projects-archived.sql:20`); two `ADD CONSTRAINT … CHECK` on populated tables
(`attachment-sha256`, `proj-invites-declined`) — **both already applied and succeeded on the dev DB**; the
remaining `DROP TABLE`/`DROP COLUMN` lines are all in `-- Down Migration` halves. **And the one migration
that has never run incrementally is a pure `CREATE TABLE` + `CREATE INDEX`.** So the risk *here* is low,
and I am saying so rather than inflating a real-but-small instrument gap.

**What would have been better.** A CI job that applies the migration set twice — once to an empty
database, once onto a snapshot seeded with rows — or, cheaper, a recorded statement that the property is
unwitnessed. The consequence if it ever bites is in the checker's own docblock: *"its entrypoint aborts on
a failed migration"*, i.e. a bad incremental migration takes the stack down on restart.

**SEVERITY: Low / observation**, on the measurement above.

---

## 8. THE NINE EDGE CLASSES — walked, and honestly bounded

**For every surface in my concern, what happens.** My concern is the engine and the wire, so the
"viewport" and "first-run" columns are thin by construction — I say so rather than inventing.

| edge | the engine/wire answer | status |
|---|---|---|
| **EMPTY** | `AttachmentList` returns `null` on empty — *"must not promise there are none"* — and case `16.97`'s second half keeps the empty list at `200` with a live ticket holding no files, specifically so the new guard cannot be folded into it. `readTicketCounts` keeps a LEFT JOIN so a type with no tickets reports `0` and not an absent row (`builder-reads.ts:498-504`, tested). | **MEASURED, covered** |
| **ERROR** | `404` with a single shared `NOT_FOUND_BODY` for invisible, nonexistent and tombstoned tickets alike — the indistinguishability is asserted in `16.97`/`16.98`/`16.99` against a GHOST ticket, on the raw payload *and* every header but `date`. | **MEASURED, covered** |
| **PERMISSION-REFUSED** | §7.3: 54 registrations, **49** carrying `requireSession`, **5** public by design, and no route uses a weaker guard. | **MEASURED, clean** |
| **OFFLINE / REPLICA-DEGRADED** | The replica applies the same delete rule twice in TypeScript — **both unwitnessed** (F5). Its gap surfaces (`getMyWork`, `getMembers`, `search`, …) reject with a named `ReplicaGapError` rather than answering empty, which is the right shape. | **GAP — F5** |
| **SOFT-DELETED** | §7.1 — **all 18 SQL sites are constrained** (mutation-killed). The gaps are the **three TypeScript applications** of the same rule, which no SQL sweep can reach: `my-work.ts:364` (**F4**) and the replica's two gates (**F5**). | **GAP — F4, F5** |
| **CONCURRENT / INTERLEAVED** | `projections/rollups.ts` rows 16/17 are the interleaving shape (a recompute and a stale-row DELETE that mask each other on a single-child parent); both are killed at this sha. | **MEASURED, covered** |
| **NARROW VIEWPORT** | **Not my surface.** No route or read in my universe observes a viewport. The one relevant boundary is recorded in `test-cases/17-open-work.md`: the viewport suite never opens a ticket sheet, so the ratchets cannot see the `Visibility` section either way. | **NOT REACHED — stated** |
| **FIRST-RUN** | `GET /v1/auth/methods` is public precisely so a first-run sign-in page can learn what is enabled; the seed and bootstrap paths are outside what I reviewed line-by-line. | **PARTIAL** |
| **THE SERVER REFUSES WHILE THE CLIENT BELIEVES** | §7.5 — the mappers refuse to default, and the replica's gaps reject rather than answer. This is this product's most expensive shape and it is being resisted **at the lines where I looked**; I did not review all 2,457 lines. | **PARTIAL — one scan, not a line review** |

---

## 9. MY OWN WORK IS IN SCOPE — what I reviewed of it, and what I found

**What my lane shipped (`#619`, `6029e1cf`):** the sheet's `Visibility` section styled to the prototype's
row; `packages/app-core/src/views/visibility-editor.tsx`; `packages/ui/src/ui.css`; six cases
`17.001`–`17.006`; the §17 header in `test-cases/17-open-work.md`.

**Findings against it:** **F3** (prototype citations — Important) and **F7** (the §17 block table —
Low). Both are in this report's main body rather than in an appendix, because they are mine.

**What I checked and found sound:**

- **`17.002`'s measurement reproduces exactly, in both prototype copies** (§F3) — 13 lines at
  `letter-spacing:0.6px`, 12 at `13px/18px`, exactly 1 at `12px/16px`. I ran it against the **ruled**
  export, which the case does not cite, and it is true there too.
- **The group's mutation witnesses name their own sites.** The case text records that deleting the rule
  makes `rule()` **throw** rather than answer empty, so the case reddens by naming its own site — which is
  the property the brief demands of a kept mutation.
- **The §17 header's account of the id guard matches the guard.** It lists four blind spellings —
  markdown table row, `##` heading, a backticked id inside the bold, and two ids in one sentence — and
  `scripts/check-case-ids.mjs` handles the backticked spelling with a **second regex** precisely so it is
  *not* blind (`ID_LINE_BOLD_BACKTICK`, `:162`), and its self-test at `:209`/`:218` covers the
  prose-citation leak. **The header's list is accurate**, and it warns in the right place: *"after adding
  cases, confirm the `check-case-ids` count moved by EXACTLY the number you added."* Measured now:
  **2606 ids, highest `17.006`** — consistent with six minted ids in §17.
- **The `Visibility` section's two structural divergences are recorded with a named owner** rather than
  silently built or silently omitted, and case `17.006` holds the roster-cut as a **negative assertion
  with a positive control** — the control being the same walk with its predicate flipped. That is the
  right shape: an absence assertion without a control is indistinguishable from a scan that finds nothing.

**One thing I could NOT verify about my own work:** whether `17.004`'s claim that the dot "contributes
zero characters" is honoured by the prototype's own rendering — the prototype draws the dot, and the
prototype's rendering is broken in the repo copy (§F3), so this is **unverified** and I am leaving it
unverified rather than asserting it either way.

---

## 10. COUNT OF FINDINGS BY SEVERITY — with the members named

| severity | count | members |
|---|---|---|
| **Critical** | **0** | — |
| **Important** | **3** | F1 (stale open-gap declaration in the delete-rule enumeration) · F2 (false warrant on the (c) survivor measurement) · F3 (my own lane's prototype citations) |
| **Medium** | **2** | F4 (`my-work.ts:364` survivor, reproduced) · F5 (replica `:996`/`:1029` survivors, reproduced, citations rotted) |
| **Low** | **3** | F6 (unreproducible 13/9 count) · F7 (my own §17 block table) · F8 (`check:db-tz` unwired) |
| **Observation, not a defect** | **1** | §7.6 (migrations never applied incrementally; risk measured low) |
| **Total findings** | **8** | plus 6 positive/clean results (§7.1–§7.5) |

**A count is only evidence once its members are named — hence the table.** And a note on the two Mediums:
they are **not new defects**. They are independent reproductions of gaps the project already records and
owns. I report them because the brief asked me to verify the record, and because *"I reproduced it myself
with a valid instrument"* is worth more than *"the document says so"* — particularly for F5, where the
document's own supporting instrument turned out to be invalid (F2).

---

## 11. WHAT I AM LEAST SURE OF

Stated so a reader with limited budget knows where to aim it.

1. **Whether `check:db-tz`'s absence from CI is deliberate** (F8). Its subject requires a provisioned
   database, which CI may not have; I could not determine intent from the tree and did not guess.
2. **Whether F6's `13` was *wrong when written* or *went stale*.** The paragraph it lives in is
   explicitly about counts expiring, so the charitable reading is that a site was added afterwards. **The
   finding does not depend on which** — the sentence is unreproducible from its own command at this sha —
   and I am flagging the uncertainty rather than picking.
3. **The severity of F3.** I called it Important because it is pervasive, in shipped work, and against an
   owner ruling about which artifact the prototype *is*. A reader who weights only product behaviour
   would call it Low. **I measured that the underlying comparisons transfer, which is why I did not call
   it Critical.**
4. **Everything in `packages/rule-engine`, `packages/mcp-server`, `packages/sync-client` and
   `packages/domain`.** I have zero findings there, and as §2 says, that is a statement about where I
   looked and not about the code. **If budget is available, that is where the unspent coverage is.**

---

## 12. FIVE PARTS — completeness check on this report itself

- **ENUMERATION** — §1, with the pattern that produced it and the widening that corrected it.
- **COVERAGE, including what I did not reach** — §2, and §8's edge table separating `MEASURED, covered`
  from `PARTIAL` and `NOT REACHED`.
- **EVERY FINDING CARRIES FIVE PARTS** — §4/§5/§6; each states WHAT, WHY, WHAT WOULD HAVE BEEN BETTER,
  the MEASUREMENT, and a SEVERITY. Two claims are explicitly marked **unverified** (§9 last paragraph; and
  F8's record of the withdrawn self-test finding).
- **A COUNT OF FINDINGS BY SEVERITY, WITH MEMBERS NAMED** — §10.
- **MY OWN WORK IN SCOPE** — §9, and F3/F7 are mine.

*No fix was made. No branch for a fix exists. `git status --porcelain` on `exec3/review-functionality` is
empty apart from this file.*
