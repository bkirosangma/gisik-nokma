> ⚠ **ROTATED 2026-09-21 by the controller (owner: *"do the rotation, one docs PR"*).** This file holds the **live TOP BLOCK only**. Every earlier block is in **`docs/lanes/executor-2-state-history.md`**, byte-for-byte, newest first — including one older block that was labelled `▲ TOP BLOCK` rather than `▼`; it was moved unedited. **The rule from now on: when you write a new top block, move the block it supersedes to the TOP of the history file (directly under its header) in the same commit.** The file was 569,226 bytes.

## ▲ TOP BLOCK — **THE SEEDS ARE PARSED, AND THE SPLIT IS WHAT KEEPS A RECORD A RECORD.** (2026-09-21, executor 2)

### § 0 — WHERE TO FIND IT

- **Branch `exec2/markdown-editing`**, **folded TWICE**: onto `b05889b6` (cycles 31–32) and onto **`39198c01`** (21
  commits: executor 1's sheet/breadcrumb work and executor 3's §17). `git merge-base HEAD origin/main` equals
  `39198c01` exactly — **this head IS the landing tree**, and nothing is behind.
- **SIX commits**, by SUBJECT rather than by count — a count is a reading that expires the moment this file lands:
  1. `afdb5af6` — `markdownLinks: true`, with the census, the escape asymmetry and four cases moved.
  2. `9460bffc` — the seeds parsed, the prose/record split, the losslessness proof.
  3. `0e8ba776` — fold of `b05889b6` (one conflict: the id-block table, where MY side was stale and lost).
  4. `a690e982` — fold of `619d92bf` (docs-only, `controller-state.md`).
  5. `ffda1d24` — the independent review's seven findings, all fixed.
  6. `d3012f3b` — fold of `39198c01` (one conflict: `16-remaining-doors.md`, two lanes appending at the end).
  ⚠ **Anything on `origin/main..HEAD` that is not one of these subjects is a foreign push.** `git rev-list
  --oneline origin/main..HEAD`, not `git log` — the log simplifies merges away and under-reports this branch.
- **The PR is opened at this head**; this file lands with it, so it cannot carry its own PR number.

### § 1 — WHAT SHIPPED, AND THE THING THAT WAS MEASURED BEFORE IT WAS FIXED

**Owner's ruling 2026-09-20, verbatim *"both"***, reversed two written decisions that each cited spec §2 —
`markdownLinks` and the seeds' literal rendering. **Both records are superseded IN PLACE, never deleted**: the option
in `packages/editor/src/schema/extensions.ts`, the seed decision in `apps/server/src/seed/doc-text.ts`, whose
original docblock is quoted **byte-identically** inside the new one (verified line by line against `a1252bcc`, the
true pre-change revision — ⚠ **`HEAD~2` is NOT it, it already carries the new text**).
**`plainTextDoc`'s name now under-describes it** and the docblock says so; the accurate spelling is `markdownToDoc`.

**The defect was measured first**: 23 dev rows, ALL literal-text docs, ZERO marks. Counted in ONE unit (text nodes,
each stored node being one line): **111** nodes hold a `**` PAIR, **135** hold **any** `*` at all (bold's included),
**24** hold an italic run with no bold pair; code in **34**; two `[text](url)`; **32** heading lines, **15** bullets,
**17** numbered; and a markdown **TABLE** in `ops:duns`, **8** pipe lines — the one refused construct the corpus
really holds.

⚠ **THE SPLIT IS BY CONSTRUCTION, NOT BY INSPECTION.** `errandDescriptionParts` marks the record's body and its
quoted ask `markdown` and the `— tracker record —` block `literal`; `seedDescriptionDoc` renders each with its own
renderer. **No RECORD line starts with a block marker (172 of them, zero** — 64 PROSE lines do, which is what the
parser is FOR), so on real data alone a whole-string parse would look identical; the witness therefore uses a record
note that LOOKS like a list, with the reverse behaviour through the markdown renderer as a control in the same `it()`.

### § 1b — THE REVIEW PASS, AND WHAT IT COST

**One independent reviewer at `a690e982`.** It confirmed the oracle is independent and can fail, the census
reproduces exactly, the paired-delimiter precondition holds, there is **no production caller** of the removed
accessor and no cross-package breakage, and the dev-rows mechanism is real (23/23 description ids already in the
ledger). **It found SEVEN defects, every one a claim in a comment the code did not support — all seven fixed:**

1. the refusal list said **tables** are absent from the corpus; **8 pipe lines in `ops:duns`** — corrected, and the
   behaviour is now a CASE;
2. the oracle was said to catch a mark consumed without a mark; **a dropped BOLD MARK leaves it green** — narrowed,
   and the census is named as the net for mark loss;
3. "no line of the shipped **corpus**" → **64 prose lines do**; scoped to RECORD lines at both sites;
4. a present-tense equality with the stored rows that is **false of the current build** (0 of 23 docs); the TEXT is
   23/23 and the comment now separates them;
5. the census **mixed two units in one sentence** (111 pair-nodes vs 135 any-star-nodes); one unit now;
6. `seed-dev.test.ts`'s docblock described the **fixture goal deleted mid-write**; rewritten;
7. `?? descriptions[0]!` **degraded its own assertion**; fallback removed.

⚠ **AND IT REFUTED ONE OF MINE ABOUT MY OWN TEST**: the control was claimed to run "in the same invocation" and was
a sibling `it()` — the guarded case reddened while the control stayed green, so it gated nothing. **Merged into the
same `it()`.**
⚠ **AND IT CAUGHT THE DISPATCH PROMPT'S OWN CONTROL BEING WRONG** (`HEAD~2` was already the new revision, so the
"verbatim" comparison was the quote against itself, reporting identical).

⚠ **The fix round is a NEW HEAD (`ffda1d24`), not a footnote**: the review ran at `a690e982` and the frozen head is
`d3012f3b`. Every fix is traceable to a numbered finding and none adds production behaviour, so no re-review was run
— **and that judgement is stated here so it can be overruled.**

### § 2 — ANCHORS, RECOUNTED AT THIS TREE (not carried forward)

| anchor | value |
|---|---|
| `git merge-base HEAD origin/main` | **`39198c01` — equal to `origin/main`** (folded twice: `b05889b6`, then `39198c01`) |
| ahead / behind | **6 / 0** — nothing behind, so this head IS the landing tree |
| tree | clean at this head |
| `check-case-ids` | **2601 → 2606 = EXACTLY +5**, measured against a `git archive` of `origin/main` **at this head** (`bold` 1177 → 1182, the style used). ⚠ **An earlier reading of +1 was taken BEFORE the fold**: five added minus four (`16.72`–`16.75`) not yet merged. **A delta is a fact about a commit.** |
| `check:citations` | rc 0 |
| `check:{help,tasks,migrations,runbook,env}` | rc 0 each |
| `pnpm turbo run build typecheck` | **22/22**, re-run after the second fold |
| **suites** | **server `test/seed` + `test/integration` 191/191** · **editor 188/188** — both re-run AFTER the fold, not carried forward |
| **the battery** | **7 mutations, 7 killed**, every run asserting its test count (103): M1 no-op parse 11, M2 record parsed 2, M3 bold rule off 11, M4 heading text lost 2, M5 href dropped 2, M6 `markdownLinks` off 4 (editor), **M7 bold mark dropped 9 — and NOT the losslessness case**, which is finding 2 pinned. ⚠ Restores **by copy from a sha256-verified snapshot, never `git checkout -- <file>`** |
| ⚠ the forced gate | **NOT run — it is the controller's.** |

### § 3 — THE EXISTING 23 DEV ROWS: MEASURED, DECIDED, **NOT** CORRECTED

They are the old shape and **re-seeding does not fix them** — the seed's ids are deterministic and
`existingSeedEventIds` skips what is present, which `13.83`/`13.84` already pin. They are reproducible dev-seed
data, so the remedy is **a database seeded fresh**, not a corrective ingest that would mint ids the seed can never
reproduce. ⛔ **Not performed here: 54330 is a live stack another lane is using.** **Owner: whoever next rebuilds
the dev stack.** The real-door case (`16.79`) is what proves a fresh seed produces the parsed shape.

### § 4 — WHAT IS NOT COVERED, NAMED RATHER THAN IMPLIED

- **The parser's vocabulary is closed at what the measured corpus holds** — a future `_italic_`, `~~strike~~` or
  fenced block renders LITERALLY. Note the TABLE is not in that list: it occurs, and it is a case.
- **Nothing writes markdown back**; the parse is a one-way reader and markdown is NOT the stored format.
- **The tilde code fence fires but is typed by no standing case.** Probed (2/2, `codeBlock` both ways); adding it to
  `escape-suggestion.test.ts` belongs to that harness's trigger-coverage owner.
- ⚠ **The escape asymmetry is recorded, not fixed** (`9.95`): a typed link offers no escape suggestion where a typed
  bold mark does. Cause NOT established.

### Rules that bind this branch
- **Never `docker compose`** (any subcommand) and **never bind `:3001`** — peers' live stacks are there. Viewport
  work would use `:3021`.
- **`| tail` or a file, never `| head`.** Test runs at `--maxWorkers=1`. **Do not run the forced gate.**
- **Do not edit `task-ledger.tsv`** — the controller flips rows after each merge.
- `Features.md` and `test-cases/` change in the **same commit** as the code.
- **Never `AskUserQuestion`** in this topology. A question for the owner is a file plus a one-line pointer, then a
  hold.

---


