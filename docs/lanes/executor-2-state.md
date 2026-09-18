# Executor 2 — live state

**This file is executor 2's restart surface.** Executor 1's is `docs/lanes/executor-state.md` —
**never write that one.** Two writers on one file produce a conflict on every landing.

> **Warning about shas in narrative prose.** Every sha cited in any *narrative* document — the dispatch
> brief, the coordination doc, this file's prose — is a fact about the moment it was written. Verify an
> anchor with `git branch --contains` (empty output = orphaned; `git cat-file` passes on reflog-only
> commits and hands you pre-rebase content while looking like it worked).

> **Never pipe a test or build run into `head`.** It orphans the vitest fork pool at `ppid=1`, ~1 core
> each, growing — measured at 22.4 GB and a forced restart on 2026-09-04. Use `| tail -N` or
> `> /tmp/x.log 2>&1` then read the file. A machine-local `PreToolUse` hook refuses the piped form.

> **This session runs on the DeepSeek backend.** Every model alias resolves to `deepseek-flash[1m]`;
> the brief's model/effort tiers are void here, but no review step is skipped because of it.

> **TOOL HAZARD — `rtk git log` IGNORES its revision argument and logs HEAD instead**, intermittently,
> and both outputs are well-formed. **Use `/usr/bin/git` for every git command whose output is evidence.**

---

## ▲ TOP BLOCK — the members screen's styling, measured against the prototype (2026-09-18, later the same day)

**Position: the members-styling task is DONE and its PR is at the controller's merge.** Dispatches:
`CTL-DISPATCH-2026-09-18-members-styling.md` **plus its AMENDMENT 1** (the `.gn-field` deliverable, and
the id list). One branch, `exec2/members-styling`, **`--base main`**, cut from **`0e0dbff9`** — the tip
the controller's own dispatch named, with the amendment's `7735b6ef` superseded by `#471`'s merge minutes
later.

**FIRST ACTION ON A RESTART: `gh pr list --state open`.** If this branch's PR is open it is at the
controller's merge and nothing below needs redoing; if it has MERGED, this block is history and the
controller's next dispatch is the position.

### Anchors — verify these; do not trust the row

| | |
|---|---|
| branch | `exec2/members-styling` |
| cut from / base | **`0e0dbff9`** (`origin/main` after `#471` merged) |
| frozen head | **verify with `/usr/bin/git rev-parse HEAD`** — a block cannot name the commit that carries it |
| files | 7: `apps/web/app/w/[workspaceId]/members/page.tsx` · `apps/web/app/globals.css` · `apps/web/test/members-page.test.tsx` · **`apps/web/test/members-styling.test.ts` (new)** · `Features.md` · `test-cases/13-deployment-dogfooding.md` · this file |
| ids minted | **`13.886`–`13.889`** (`13.889` for AMENDMENT 2, minted post-freeze) — and the FIRST three attempted were `13.883`–`13.885`, which **COLLIDED** with executor 1's `exec/owner-demotion-guard` (it minted `13.883` at 16:54:10, six minutes before this branch did at 17:00:29). This branch yielded and renumbered. **The remedy is an allocation, not a number — ask the controller for a BLOCK**; a shared "next free" pointer collides every time both executors are dispatched from one. Detail in `test-cases/13`'s section for this change. |
| tree | clean; `docker compose` NOT run; :3001 and :3021 NOT bound |

### What shipped, and the measurement that came first

**The dispatch named five treatments it expected to be missing. Four are already the prototype's values
and the fifth is a wire absence** — so the change set is smaller than the dispatch's shape implied, and
the full prototype-versus-shipped table is in `test-cases/13`'s section for this change. What actually
shipped:

1. **THE ZEBRA — the one treatment the family really was missing.** It lives in the prototype's DATA
   (`memberRows`, `desktop.dc.html:3077`) and attaches at `:671`, which is why a port driven by reading
   the JSX never saw it. `.gn-members__row:nth-child(even)` now takes `--gn-fill-quaternary`, on the
   prototype's parity (`i` is 0-based → even 1-indexed rows) and NOT the odd parity the product's two
   other zebras use (`packages/ui/src/ui.css:1088`, `:2612`). **The inversion in those two families is
   recorded at the rule with a named owner and NOT harmonised here.**
2. **All FOUR invite fields now wear the product's `.gn-field` pattern** — the two native inputs
   (Address, Projects) with `.gn-field__input` as amendment 1 asked, and **Channel and Role with the
   LABEL half only, which AMENDMENT 2 ruled on 2026-09-18 (owner-approved)**: *"label it inside
   `.gn-field` … but pass no native-control class to it."* The sibling shape is
   `apps/web/app/w/[workspaceId]/page.tsx:812-821`; no handler, state or conditional moved. **The reason
   first recorded for leaving the two Selects bare was FALSE** and the review refuted it at the line — the
   shared component puts `gn-field__input` on its OWN trigger (`packages/ui/src/select/select.tsx:254`,
   `:231`, `:432`) — **which is also why 13.889 asserts the label half and NOT the absence of that
   class**: it is on every `Select` in the product either way, so an absence assertion would be red
   against correct code. The component is NOT restyled and **the role-change predicate is untouched** (a
   separate owner ruling this day, a different task).
3. Cases `13.886`–`13.889`, `Features.md` and `test-cases/13` updated in the same change set.

### Mutation witnesses, all against the real files, tree restored and sha256-verified

- zebra parity flipped `even`→`odd` → **4 failed / 37**, all 13.887.
- zebra fill swapped to `--gn-surface-sunken` → **2 failed / 37**, all 13.887.
- **a higher-specificity override appended** (`.gn-members tbody .gn-members__row:nth-child(even) { background: transparent; }`) → **2 failed / 37**, all 13.887. **This one was 0 failed before the fix round** — the blind spot the review measured, now closed by 13.887's exactly-one-rule count.
- `className="gn-field__input"` removed from the address input → **1 failed / 37**, 13.886 alone.
- **A2-M1: the `gn-field__label` class dropped from the Channel label → 1 failed / 38, 13.889 alone.**
- **A2-M2: the Channel `Select` converted BACK to a native `<select>` → 1 failed / 38, 13.889 alone.**
- the projects field un-wrapped back to the bare pair → **1 failed / 37**, 13.886 alone.
- `css` and `page.tsx` sha256 IDENTICAL before and after the whole sequence.

**FIX ROUND after the review** (`83e4830c` → the fix commit, one round, no argument): the id collision
renumbered; the false `Select` reason corrected in the case docblock and `Features.md`; "bare stack"
narrowed to the four genuinely rule-less elements; the page-container verdict corrected to
**reachable-and-not-reached** (`.gn-legal`, `globals.css:2088` applied as `gn-shell gn-legal` at
`privacy/page.tsx:176` — a route-scoped modifier beside the shared class, not a fork); four line-number
defects fixed (`ui.css:2611`→`:2612`, `page.tsx:55-57`→`:52-53`, `812-818`→`812-821`, and a
misattributed quotation credited to 13.284); and 13.887 strengthened with the cascade count.

**AMENDMENT 2 (owner-approved, 2026-09-18) arrived after both review rounds and is a POST-FREEZE change
to an open PR — a NEW HEAD, not a footnote.** It settles the question round 1 raised and this change had
left open: the two `Select` labels are wrapped in `.gn-field` + `.gn-field__label`, no class passed to
the component, case **`13.889`** minted (free on all three surfaces at the time; next free is now
`13.890`). Two mutation witnesses, both killing 13.889 ALONE. The PR body names which head carries what,
and the frozen-head check figures above belong to the PRE-amendment head.

**ROUND 3, scoped to the AMENDMENT 2 commit: no Critical, three findings of mine, all corrected.** The
"visible residue" paragraph was FALSE at the line — the 15px came from the PROTOTYPE, not this product's
cascade (`.gn-select__trigger` declares no `font-size`, `ui.css:1604-1612`; the `.gn-field__input` it also
wears declares `1.0625rem`, `:3866-3875` → 17px, aligned with the inputs). Case 13.889 left the `<label>`
TAG and the label-over-control ORDER to prose and the reviewer defeated both — `<div>` for `<label>`, and
the span moved after the control, each staying green while `.gn-field` is `flex-direction: column` so DOM
order IS visual order. Both are now asserted, and both defeats re-planted here kill 13.889 alone (1 failed
/ 38). A docblock reason was wrong too: a `button` IS labelable, and the label associates with the
`HiddenSelect`'s native `<select>`. **In the ruling's favour: passing `className` to a `Select` is a
`tsc` ERROR** (three planted sites redden `typecheck` while vitest stays green) — amendment 2 has the
compiler behind it.

**ROUND 2, a scoped re-review: no Critical, and both Important findings were in the FIX, not the original.**
(1) The cascade count it asked me to add could itself be defeated — a selector split across two lines, and
a `*`-prefixed selector, each left the suite green with the zebra dead. The helper is now a SELECTOR scan
that strips comment spans by context and matches across line breaks; both evasions redden 13.887 (2 failed
/ 37 each) and the false-red control — prose naming the selector inside a correct tree — stays 37/37 green.
(2) That helper's comment-guard premise was false (`globals.css` contains exactly ONE line naming the rule,
and prose there starts with bare text, so the guard would have reddened a CORRECT tree). (3) The superseded
block's id pointer had been corrupted by the blanket renumber and is restored, marked superseded, with the
live pointer `13.889` named. **Two lessons worth carrying: a blanket renumber corrupts historical prose —
and VITEST GREEN IS NOT TYPECHECK GREEN.** `tsc` (17/17) caught a `noUncheckedIndexedAccess` error in the
new helper that 37/37 passing tests did not; the gate ran it, not the test run.

**Instrument lesson, measured here and worth carrying:** the first attempt at the fourth mutation removed a
`<label>`'s opening tag and left its closing one, so the file failed to TRANSFORM — and the JSON reporter
showed that as **`total=7 passed=7 failed=0`**, the broken file simply absent from the assertion list.
**`failed=0` is not evidence unless the total equals the full suite's count.**

### Open items, with owners — none of them blocks the merge

- **THE INVITATION HALF OF THIS SCREEN HAS NO CSS FAMILY AT ALL.** `.gn-invite-mint*` and
  `.gn-invite-pending*` appear in `globals.css` exactly once (`__url`'s `font-family`), swept repo-wide
  with a control that reaches `.gn-members` in the same run; the e2e-stack contrast roster agrees from a
  real browser (`input`/`select` on `/members` wearing Chrome's UA border). **A family to PORT, not a
  treatment to align — recorded, not fixed, because the amendment bounds the pass.** Owner: the controller,
  for the next task on this screen.
- **The contrast roster's `/members` entries are stale as of this change** (the wrapped fields are no
  longer UA-default controls). The sweep needs the hot stack, which is executor 1's — **the file was NOT
  hand-edited**, since a hand-edited generated record is partial. Owner: whoever next runs that sweep.
- **Citation drift, measured:** the dispatch cites the prototype's `isMembers` block at `:647-783`; it
  reads `:651-798` at this revision. `docs/design/prototype-delta-2026-09-18.md:524-542` still describes
  the `<ul>` roster this screen has not had since `#443` and asserts the family is unstyled throughout.
  Owner: the next change to that document.
- **The members page's own container padding is REACHABLE and not reached.** The first verdict said "not
  alignable without forking a shared class or restructuring"; the review refuted half of it with an
  in-tree precedent — `.gn-legal` (`apps/web/app/globals.css:2088-2090`) carries its own paddings and is
  applied as `<main className="gn-shell gn-legal">` (`apps/web/app/privacy/page.tsx:176`, and
  `terms/page.tsx:183`), i.e. a route-scoped modifier BESIDE the shared class rather than a fork of it.
  So the prototype's `padding:0 32px 24px` is one rule away as `0 2rem 1.5rem`. **Not taken**, because the
  other half of that row (flex, `gap:20px`) needs the children inside one container — the restructure the
  dispatch forbids — and half a treatment is a treatment neither document draws. On the report to the
  controller.
- **The `Select` labels question** above — asked of the controller in the report, not assumed.

---

## ▼ SUPERSEDED TOP BLOCK — the attention strip leaves the project page (2026-09-18). `#471` MERGED as `0e0dbff9`; nothing below needs redoing.

**Position: THE PHASE IS CLOSED. `#471` is rebased, green, pushed, and at the controller's merge. Do NOT
start anything else** — the dispatch says `members-styling` is queued behind an amendment and will be
dispatched by the controller.

Dispatches: `CTL-DISPATCH-2026-09-18-attention-project-page.md` **plus its AMENDMENT 1**, then
**`CTL-DISPATCH-2026-09-18-exec2-rebase-471.md`** (the rulings and the rebase). One PR, `--base main`,
branch **`exec2/attention-leaves-project-page`**.

**Both items are RULED, and neither needs anything further from this session:**
- **The ratchet — HOLD, do not hand-lower the floor.** My instinct was right and the reviewer was wrong.
  The baseline is untouched; the derivation stands with its named owner. **This does not block `#471`** — a
  known-red spec with a named owner is an accepted state.
- **Part 2 — deferred to its own task, my recommendation accepted.** The heading question went to the owner;
  its answer belongs in that task's brief. **Do not add Part 2 to `#471`.**

**FIRST ACTION ON A RESTART: `gh pr list --state open`.** If a PR for this branch exists it is at the
controller's merge and nothing below needs redoing. Then verify the anchors — do not trust the rows.

### Anchors — verify these; do not trust the row

| | |
|---|---|
| branch | `exec2/attention-leaves-project-page` |
| cut from | **`438b956c`** = `origin/main` after `#466` merged — the amendment's sha |
| base | `origin/main` **`cb1f3d16`** — rebased onto it after `#469` merged into the same catalogue file |
| sha mapping | `0da73557`→`8576752f` · `4205f172`→`50db2300` · `bb7ba7f7`→`606ba48d` · `e1917421`→**`1dc041e9`** · then the handoff commit on top. **The pre-rebase shas are ORPHANED from `main`'s history and will still `cat-file` clean.** |
| reviewed heads | round 1 reviewed `4205f172` (= `50db2300`) · round 2 reviewed `bb7ba7f7` (= `606ba48d`) |
| frozen head | **verify with `/usr/bin/git rev-parse HEAD`** — a block cannot name the commit that carries it |
| files | 11: `apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx` · `apps/web/test/page-refusals.test.tsx` · `apps/web/test/board-narrowing.test.tsx` · `apps/web/test/backlog-tab.test.tsx` · `apps/web/test/filters-sheet.test.tsx` · `apps/web/test/list-bulk-close.test.tsx` · `apps/web/test/project-calendar-timeline.test.tsx` · `apps/web/e2e-stack/non-text-contrast-roster.json` · `test-cases/13-deployment-dogfooding.md` · `Features.md` · this file |
| ids minted | **`13.881`, `13.882`** — recounted at my tip BY MARKER; next free overall WAS `13.883` **at that time**. **STALE AND SUPERSEDED**: the blanket renumber of the next task corrected this historical number by mistake, and it is restored because a superseded pointer is history while the position lives in the top block. This branch now holds `13.886`–`13.888`, and the LIVE next free is **`13.889`**. |
| tree | clean |

### What shipped

**Part 1 — the removal.** Five sites leave `apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx`:
the `AttentionStrip` / `useAttention` imports, the `useAttention` call, `attention.error` out of the
expired-session list (**now three reads, not four** — the comment beside the notice said four and was
corrected), and the whole render block. Three prose regions were corrected with them, because they
described code that no longer exists. `AttentionStrip`, `useAttention`, `attention-strip.tsx` and
`/my-work`'s mount are all untouched.

**Cases.** `13.881` — the project page renders no strip **and never makes the read** (`getAttention`
is stubbed to ANSWER, so a page that still called it fails). Its control is the board refusal, because
both assertions are absences. `13.882` — `/my-work` still renders the strip.

**Mutation-witnessed, both at the change-set head, each killing exactly ONE case:**
- re-add the `useAttention` call alone (no render) → the ABSENCE stays **green**, only the spy at
  `page-refusals.test.tsx:268` reddens. That is 13.881's docblock claim, measured.
- remove My Work's strip render → only `13.882` reddens (1 failed / 13 passed).
- Both files restored by `cp` with matching sha256 (`8dc7e7b9…`, `c818d396…`) and `git diff` empty.

**Two stale records corrected beside the change**, neither of them mine to skip: `board-narrowing.test.tsx`'s
docblock explained a strip that no longer mounts on that page (its inert `getAttention` overrides were
left, deliberately — the helper shape is shared with fixtures that DO still mount the strip), and the
`3.141` project-page case read *"one notice stands in for all four"* over five stubs of which the page
makes three — `getAttention` dead by this change, `getPreferences` **already** dead before it.

### ★ PART 2 IS HELD — this is the stop-and-ask, and it needs the controller

The dispatch asked for the strip's styling to be checked against `desktop.dc.html:561-575`. It was
checked; the delta is **structural, not CSS** — a tinted card, a visible *"Needs your attention"* heading
with a warning icon, title-first rows, and the whole row as the click target. Taking the CSS-only rows
(gap, row padding, the alert colour) alone would produce a treatment neither document draws.
**Four of the deltas meet a record**, all cited in `test-cases/13`: the tint fill deletes the left border
the controller **ruled to keep earlier the same day** (`hig-per-screen/7a`,`8a`); the heading's string
differs from the shipped accessible name, which the copy rule says to FLAG not change;
`docs/design/prototype-delta-2026-09-18.md:583-586` already gives `isMyWork` the port verdict `none`;
and `--gn-tint-warning` is an alpha role with a documented single consumer (`tokens.ts`, the invitations
banner — which is nonetheless a real precedent for exactly this conversion).

**The full delta table, the recommendation, and a correction owed to the prototype-delta document are in
`test-cases/13`'s section for this change.** Nothing in the change set presupposes the answer.

### Reviews — two rounds, both discharged, both recorded in the PR body

**Round 1, one reviewer, at `4205f172`.** Its one job was to confirm nothing else on the project page
depended on the removed slice; it could not falsify that, and it independently reproduced **both**
mutations in its own disposable clone with the same kill sets. No Critical, no Important code defect.
Five findings, all fixed in `bb7ba7f7`: the `examined: 9` roster header, a wrong catalogue citation
(`:106` → `:122`/`:169`), the undeclared handoff file, now-inert `getAttention` stubs across five
`ProjectPage`-only fixtures, and — its sharpest — **my own claim that `.gn-project` "opens straight into
the tab arms", which I asserted without reading what followed it.** It opens into the narrowing control
and `gn-list-filter` (`page.tsx:1464`).

**Round 2, scoped re-review, at `bb7ba7f7`** (the stub sweep went one file beyond round 1's finding).
It confirmed the deletions are inert — four independent lines of attack, all failing to falsify, plus the
structural proof that the read is never made and the `page-refusals.test.tsx:268` spy — and it verified
each corrected prose claim against the line it cites. **It also caught a real error of mine: the count.**
`board-narrowing`'s docblock said "eleven" stubs were swept; the true number is **18** (7 + 1 + 1 + 1 + 8),
which is what you get when you sweep four files and forget the fifth — *a count that was not the number of
the thing it counted*, the exact defect class the fix round was correcting. Corrected with the per-file
breakdown, measured on the diff itself with the added side as the control. Its second finding (a "seven
lines" count in the ratchet chain) was really a **unit disagreement**: the same range gave 7, 9 and 12
depending on whether context lines are counted, so **the number was removed from the chain entirely** and
the enumeration left as the claim.

**Round 1's Important finding was NOT fixed, deliberately** — see the ratchet section above. The reviewer
proposed hand-correcting the floor; this held, because lowering a floor is the direction that hides a
loss. The disagreement is stated in the PR body and in `test-cases/13`, and it is the controller's call.

### The rebase onto `cb1f3d16` — pure union replay, and what proves it

`#469` wrote a 126-line section for case **`13.732`** to `test-cases/13` — the same file this branch
appends to — so the head conflicted there; `Features.md` auto-merged. **One hunk, resolved as a UNION with
both sections kept** (mine after #469's, in landing order), and no part of it needed a decision rather than
a union. The old `13.733`-style question does not arise: their ids are in `13.700`–`13.759`, mine are
`13.881`/`13.882` — no collision at all.

**The evidence a restart should re-derive rather than trust:** `diff main's test-cases/13 → the resolved
file` gives **0 lines removed** — not merely zero carrying #469's markers, ZERO at all — against **123
added**, and the arithmetic closes exactly (10,972 + 123 − 0 = 11,095). Nine of the eleven files are
**byte-identical** across the replay, verified by sha256 of each blob at the old and the new head, so **no
source file changed** and this is not a fix round. `Features.md` shows 2 removed / 2 added, and both
removals are the pre-edit text of the two bullets this change rewrites — a one-bullet-per-line file makes
any edit read as a replacement. **The id instruments corroborate both sides surviving:** `check-case-ids`
2345 → **2346** and file 13 655 → **656** checked cases, exactly one each, which is #469's `13.732`.

### What a restart must NOT redo

- **Do not re-run the mutations.** Both are recorded above with their kill sets.
- **Do not re-run the full web suite to "check"** — it was 48 files / 520 tests / exit 0 at `0da73557`;
  re-run only if a file changes.
- **Do not hand-edit the roster again.** It is done and explained; the next sweep run overwrites it.
- **Do not fold Part 2 into this PR.** It is held on purpose; the controller's ruling decides it.
- **Do not run `docker compose` or bind :3001**, and do not run the forced gate — the controller's.

### Gate evidence at `0da73557` (quoted raw, all zeros)

`check:env` 0 · `check:tasks` 0 · `check:runbook` 0 · `check:citations` 0 · `check:help` 0 ·
`check:db-tz` **0** with `DATABASE_URL=postgres://gisik:gisik@localhost:54329/gisik_nokma`, printing
`database timezone: Asia/Kolkata` · `scripts/check-case-ids.mjs` 0 (*"2345 unique ids, highest 15.34"*).
`pnpm turbo run typecheck` **0** — 17/17 tasks, 16 cache hits, `web` re-ran. Full web suite **exit 0**,
48 files / 520 tests. **The forced gate was NOT run**; `docker compose` was NOT run and :3001 was not bound.

---

## ▼ PREVIOUS BLOCK — the nav's last-open project item, and the global tab memory (2026-09-18)

**Position: THE CHANGE SET IS COMPLETE, THE REVIEWER ROUND AND ITS FIX ROUND ARE BOTH DISCHARGED, and the
PR is opening against `main` with the reviewer recorded in its body.** Dispatch:
`CTL-DISPATCH-2026-09-18-exec2-nav-last-project.md`. One PR, `--base main`, branch
**`exec2/nav-last-project`**.

**FIRST ACTION ON A RESTART: `gh pr list --state open`.** If a PR for this branch exists, the task is at the
controller's merge and nothing below needs redoing. Then verify the anchors — do not trust the rows.

### Anchors — verify these; do not trust the row

| | |
|---|---|
| branch | `exec2/nav-last-project` |
| cut from | **`94866264`** = the base the dispatch named; **REBASED onto `c2daa5b5`** on 2026-09-18 |
| frozen head | **`verify with `/usr/bin/git rev-parse HEAD`** — a block cannot name the commit that carries it; whatever is here is one MORE than the last commit below |
| commits | **`32ee34af`** (change set) · **`34dceb49`** (FIX ROUND) · **`50fd122e`** (handoff) · **`2c256a6a`** (re-review corrections) · the REBASE commit — old shas `53f2cadb` / `aac83da3` / `b00a643b` / `9e4e51b2` are ORPHANED and will still `cat-file` clean |
| reviewed head | **`53f2cadb`** by the one reviewer, against the named brief (storage-keying and the fallback) |
| `origin/main` | **`c2daa5b5`** after the rebase — `origin/main` IS an ancestor of HEAD, so the branch is LINEAR and 0 behind |
| ahead / behind | **recount, do not quote** — `git rev-list --left-right --count origin/main...HEAD` |
| **conflict** | **NONE now** — resolved by the rebase below. The earlier "do NOT rebase" note is SUPERSEDED: it was written when main's only new file was `task-ledger.tsv`, and exec 1's `#465` then wrote to `test-cases/13` as well. |
| tree | clean |
| files | 18 against `94866264` |
| failures on render | none known |

### What shipped

`apps/web/src/last-project-nav.tsx` (NEW) — the item and its dropdown, mounted by `app-nav.tsx:269`
immediately right of the workspace name. · `apps/web/src/use-last-project.ts` (NEW) — `gn-last-project`
keyed by user AND workspace, plus the `projectId → tab` map keyed by user. ·
`apps/web/src/use-workspace-projects.ts` (NEW) — the served project LIST, cache keyed by user AND
workspace. · `apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx` — seeds `view` from the tab map in an
effect and writes on every `setView`; `view`'s union moved here as `ProjectTab`. · `apps/web/test/setup.ts`
— clears `localStorage` before every case, and **imports nothing from `src/`** (see the hazard below). ·
`Features.md`, `test-cases/13` — Round 27 paragraph and cases **13.850–13.880**.

**`task-ledger.tsv` untouched** — not a plan-file task, so it has no ledger row and none was added.

### THE REBASE — 2026-09-18 — a UNION, with the equivalence claim stated precisely

Dispatch `CTL-DISPATCH-2026-09-18-exec2-rebase-466.md`. `#466` conflicted on
`test-cases/13-deployment-dogfooding.md` because exec 1's `#465` merged at 15:48 and appended its Task 8
section at the same place mine went. Rebased onto **`c2daa5b5`**; the branch is now linear on main
(`origin/main` is an ancestor of HEAD, 0 behind / 4 ahead).

**SHA MAPPING — old → new.** The four old shas are orphaned; `git cat-file` still resolves them and will
hand back pre-rebase content, which is exactly why this table is here rather than a reassurance:

| old | new | subject |
|---|---|---|
| `53f2cadb` | **`32ee34af`** | the change set |
| `aac83da3` | **`34dceb49`** | fix round |
| `b00a643b` | **`50fd122e`** | handoff |
| `9e4e51b2` | **`2c256a6a`** | re-review corrections |

**THE EQUIVALENCE CLAIM, SCOPED TO THE REBASE AND NOT TO THE HEAD MOVE.** The previous claim in this file
was "bytes identical", and a reader could apply it to the whole head move — which is FALSE, because the
new head also contains main's work. Precisely, three checkable statements:

1. **Every file this branch changes EXCEPT the two main also touched is BYTE-IDENTICAL across the rebase.**
   Verified file-by-file with `git diff --quiet 9e4e51b2 2c256a6a -- <path>`: **17 of 17 identical** — all
   16 `apps/web` files and `docs/lanes/executor-2-state.md`.
2. **For the shared file, the rebase removed NOTHING from either side.** Old→new shows additions only
   (the peer's section and its `13.203` correction) with **0 deletions of my content**; and against main
   it is **375 / 0** — my section added, nothing of theirs removed. The peer's marker count is **13 on main
   and 13 here**.
3. **`Features.md` auto-merged by PURE INSERTION**, verified rather than assumed: the one changed line
   differs by a single `insert` opcode at offset 19187, with main's version a **prefix** of the merged one.
   The peer's Task 8 text survives intact and mine is appended. An auto-merge on a shared line is exactly
   where a side gets dropped silently, so it was checked by opcode rather than by eye.

**NO SOURCE FILE CHANGED, so this is NOT a fix round and no scoped re-review was dispatched.** The
resolution touched two documentation files; statement 1 is the evidence, file-by-file, rather than an
argument from the conflict's shape.

**The resolution was a verbatim union, and CONTAINMENT WAS PROVEN rather than chosen.** The sides were
main's `# Second wave, Task 8 …` (129 lines) and mine `## The nav's last-open project item …` (264). The
resolver used here asserts that ONE side contains the other before taking it and REFUSES otherwise — the
generic "take theirs" shape is what discarded a peer's 99-line section earlier today. It was used again on
the second conflict, where my earlier resolution's tail was a strict prefix of the fix round's. Result:
`10343 common + 129 + 264 + the one blank line my section originally carried = 10737`.

### Checks at the rebased head — SEVEN, all raw 0

`check:citations`: `test-cases/13` **653 cited / 0 uncited** (was 648 — **+5, exactly the peer's five
cases**). `check-case-ids`: **2343 unique ids** (was 2338 — **+5**, the same parity), self-test passed. Web
package **519/519** across 48 files; `tsc --noEmit` exit 0. **Next free id, recounted BY CASE MARKER at this
tip: `13.881`** — 178 `13.xxx` markers, max `13.880`, no gaps inside `13.850`–`13.880`.

### Cases 13.850–13.880 — and `13.880` is ONE ID OUTSIDE the dispatch's block

The block is `13.850`–`13.879` (30 ids); the work needed 31. `13.880` was **measured free at this tip
before it was used** (boundary-anchored, with the instrument's own positive control finding `13.878` and
`13.879` in the files that carry them), no id was taken from any other block, no existing case was
renumbered, and `13.850`–`13.879` are used contiguously with none spare — so the overrun was avoidable
only by dropping coverage of a fix the reviewer required. **Next free in this block: none; `13.881` and up
are unclaimed by me.** Recounted at the frozen head **by case MARKER only**: `test-cases/13` went
`612 → 648` cited and the id union `2335 → 2338`, both deltas exactly `+3` for the three fix-round cases,
which is a consistency check on the instrument rather than a coincidence.

### THE REVIEW ROUND — 1 Critical, 1 Important, 3 Minor; ALL FIVE CLOSED AND THREE REPRODUCED FIRST

The reviewer's brief was the storage-keying and the fallback, and it found real defects in both. **Three
were reproduced by a failing case BEFORE the fix**, and those red runs are quoted in the PR body:

- **C1 → 13.878.** The projects cache was keyed by workspace id alone, copying `useWorkspaceName`'s key
  onto a list that is not the same for everyone — `apps/server/src/read/visible-projects.ts:51-74` returns
  `visible.filter((project) => eff.projects.has(project.projectId))` for every non-owner. Reproduced as
  `expected [ { name: 'Alice Only', …(4) } ] to be null`.
- **I1 → 13.879.** The nav read storage before the page wrote it. Its mechanism is a claim about React, and
  **I measured it rather than taking the reviewer's reading**: a throwaway probe logged
  `["child","parent"]`, so passive effects do commit child-first.
- **M2 → 13.880.** The tab seed re-ran on loading → signed-in. Reproduced as `expected 'Calendar' to be
  'List'`.
- **M3 → prose, corrected.** The docblock justified the user+workspace key by a cross-workspace id
  COLLISION. That arm is **impossible** — `proj_projects.project_id` is the PRIMARY KEY and the migration's
  own comment says an entity id is a ULID belonging to exactly one workspace. Neither the reviewer nor I
  could construct it. The keying stands; the reason is replaced with three that survive inspection.
- **M4 → 13.872 strengthened.** Its first assertion could not fail: the fixture wrote the bytes it checked.

### THE SCOPED RE-REVIEW — 0 Critical, 0 Important, 4 Minor, ALL FOUR PROSE OR CITATIONS

A second reviewer ran over `53f2cadb..aac83da3` ONLY (the fix round), because the first pass could not have
seen it. It **could not construct a failing sequence for any of the five fixes** — it attacked the cache
keying, the nav's new route read, the tab-seed guard, the four repaired mocks and the global
`localStorage.clear()`, and confirmed each. Its four findings were all text:

1. **13.853's catalogue rationale still asserted the collision arm the fix round had just proved
   impossible** — the file's docblock was corrected and the BULLET was not, so within one diff the
   catalogue both cited and contradicted the corrected file. That is the same "a fix is a change like any
   other" failure, one layer out.
2. **13.864's TEST citation was carried forward unmeasured** while the source half of the same line was
   rewritten — a fix moved the `it(` and the citation did not follow.
3. **13.874's source citation was semantically wrong and had been from the start**: it said "the seed" and
   pointed at `tabUserId`, one line above the effect.
4. **A sentence THIS BRANCH wrote about `use-workspace-name.ts` over-claimed** — it licensed that file's
   cache keying as "right", when what is viewer-independent is the VALUE and the cache is never dropped on
   a user change. Replaced with the true claim plus the residual named, owned by whoever next touches that
   file. It is a first-frame window on a value both people may see, which is NOT the defect this branch
   fixed.

It also caught a **false sentence in `project-calendar-timeline.test.tsx`** — this branch's own prose said
`test/setup.ts` "clears storage and the module caches before every case", and it clears storage only
(because it must import nothing from `src/`). Corrected, with the distinction spelled out, since that is
the one sentence that would stop a reader asking whether a first frame can come from a previous case.

### Mutations — the change set's SIX, then the fix round's FOUR, each re-run

**The change set's six are recorded with MEASURED kill sets, and the prediction was wrong in three
places** — M2 reddens three cases where two were predicted, M4 reddens one where two were predicted
(`13.857`'s guard is a DIFFERENT site), and M5 was absent from the prediction entirely. The catalogue
carries the measured sets.

**The fix round's four each remove exactly what one fix added, and each kills exactly one case:** the
cache keyed by workspace alone → **13.878** · the nav not reading the route → **13.879** · the chosen-here
guard removed → **13.880** · the trigger's `onClick` removed → **13.872**. That last one is the point of
the M4 repair: **before it, the same mutation SURVIVED.** All ten restored to the backup's sha exactly.

### ★ THE HAZARD THAT COST THE MOST, AND IT WAS MINE — in `test/setup.ts`

Clearing the remembered-state module caches from `test/setup.ts` required importing from `src/`, and a
`setupFiles` entry **runs before the test file's own module** — so `providers.tsx` and then
`auth-client.ts` were instantiated before any test file's hoisted `vi.mock` could register a factory.
`useSessionStatus()` answered the REAL client's `{ isPending: true }` — `{ kind: 'loading' }` — **in every
test file that mocks that module**. Nothing threw. Four cases simply stopped writing anything, because a
loading session has no user id to key a record by, and every failure pointed at the page.

**The rule, for whoever edits that file next: `test/setup.ts` imports NOTHING from `src/`.** It clears
`localStorage` alone; module caches are cleared by each case's own file. The reasoning is in the file's
own docblock because the failure is invisible from a green run.

**And its sequel, which the fix round then found:** adding `useParams` to the nav took **all fourteen
cases in `test/settings-page.test.tsx` down at once in 43 ms** — an import-time throw, because that file's
`next/navigation` mock is PARTIAL. A mock is a module, not a subset. Four files were missing `useParams`;
only one rendered the nav, so three were latent, and all four are repaired.

### Two more defects found and fixed inside this work, both recorded

1. **`--concurrency=1` is a jest flag.** The dispatch names it as the machine-load guard; vitest 3.2.7
   rejects it before collecting a single test (`CACError: Unknown option`). `--maxWorkers=1` is the
   equivalent and every run here used it.
2. **`cacheKey`'s first spelling used a NUL byte**, which made `grep` report its own file as BINARY and
   refuse to search it — a source file the repo's own inspection tools silently skip. It is
   `JSON.stringify([userId, workspaceId])` now.

### Known limitation, recorded rather than closed

**A tab clicked during the session-read window is not REMEMBERED.** 13.880 stops the resolving session from
reverting the choice, but the click's write is still dropped — `rememberProjectTab` takes a `userId` and
there is not one yet, and inventing a key would be worse. The choice stands for the page and is lost on the
next visit; the window is one network round trip. **Owner: whoever next touches the session gating on the
project page.** Two candidate repairs are named in the catalogue.

### Checks — SEVEN, all raw 0 at the fix-round tree

`check:env` · `check:tasks` · `check:db-tz` (needs
`DATABASE_URL=postgres://gisik:gisik@localhost:54329/gisik_nokma` → `database timezone: Asia/Kolkata`) ·
`check:runbook` · `check:citations` (`test-cases/13`: **648 cited / 0 uncited**, a per-file ceiling of 0) ·
`check:help` · `check-case-ids` (**2338 unique ids, no duplicates**, self-test passed). **The forced gate
is the controller's and I did not run it.** Suites: web package **519/519** across 48 files; `tsc --noEmit`
exit 0 for `@gisik-nokma/web` (both tsconfigs). **No other package is touched** — nothing imports
`apps/web`.

### Citation discipline, and the instrument that had to be fixed first

Every `path:line` in the new catalogue section was re-measured **at the tree that carries it** — and the
first read-back instrument was WRONG in a way worth recording: its pattern matched only the full
`path:line` form and **silently skipped the 15 BARE `:NNN` citations**, printing a clean sheet over them.
Rebuilt to resolve bare tokens against the preceding full path in the same line, it found **17 drifted
citations** — every one introduced by this fix round, because a fix moves the lines below it.

**And it had a SECOND gap, which the scoped re-review found by reading rather than by measuring:** its
"is this line structural" test allowed `/**`, so a citation that had drifted onto a DOCBLOCK OPENER
printed as clean. Widened to reject any line starting with `*`, `/`, `)`, `}`, `>`, `|` or nothing, it
immediately flagged the two the reviewer had named. **Two independent instruments, two independent holes,
both found by a party who did not write them — and both would have printed a green sheet.**

**The lesson for the next restart, because it cost three rounds here: measure citations LAST.** Every one
of the three correction rounds moved the lines that the previous round's citations pointed at. A fix is a
change like any other, and the citation sweep has to be the final act before the freeze, not an
intermediate one. All 73 distinct tokens now land on content lines at this tree, verified by the widened
instrument.

## ▼ PREVIOUS BLOCK — membership Task 2: the roster's role control, with `Owner` omitted (2026-09-18)

**Position: the change set is COMPLETE, the review round and its scoped re-review have both returned and
are fully discharged, and the PR is opening against `main` with the reviewer recorded in its body.**
Dispatch: `CTL-DISPATCH-2026-09-18-exec2-membership-t2.md`. Plan of record:
`docs/superpowers/plans/2026-09-18-membership-role-guard.md` Task 2. One PR, `--base main`, branch
**`exec2/membership-t2-role-control`**.

**FIRST ACTION ON A RESTART: `gh pr list --state open`.** If a PR for this branch exists, the task is at
the controller's merge and nothing below needs redoing. Then verify the anchors — do not trust the rows.

### Anchors — verify these; do not trust the row

| | |
|---|---|
| branch | `exec2/membership-t2-role-control` |
| base | **`dda4c342`** = the `#457` merge I cut from. **`origin/main` has since moved to `36ec6ae3`** (`#458`, `ctl/ledger-wave2` — `docs/lanes/task-ledger.tsv` ONLY, 4 lines), so the branch is **2 behind and 0 conflicted**. **Do NOT rebase**: rebasing moves the head after the reviewer's pass and the only thing gained is a tidier graph. The controller's merge brings the ledger row with it. |
| commits | `19a5c3c9` (the change set) · `b3eb8b80` (ruling recorded + 4 stale citations) · `fdc1e09f` (handoff) · **`526c9fbf` (FIX ROUND 1)** · **`ec4df6ec` (FIX ROUND 2 — every citation re-measured at this tip)** · `56095a02` (a double-prefixed citation my own sweep wrote) |
| reviewed head | **`19a5c3c9`** by the full reviewer; **`526c9fbf`** by the scoped re-review |
| frozen head | **`verify with `/usr/bin/git rev-parse HEAD`** — a block cannot name the commit that carries it; whatever is here is one MORE than the last commit below |
| ahead / behind | recount, do not quote |
| tree | clean |
| bare `:NNN` below | Every bare `:NNN` citation in THIS block refers to `apps/web/app/w/[workspaceId]/members/page.tsx`, and every line number here was re-measured **at the tree that carries this file** — not at an earlier commit. That distinction is the whole of the scoped re-review's first finding: fix round 1 wrote citations measured at the reviewed head into a commit whose own insertions moved every line below them, so a reader verifying them landed on prose. **If you edit any file on this branch, re-measure these before committing.** |

### THE REVIEW ROUND — no Critical, two Important, five Minor; ALL SEVEN ADDRESSED at `526c9fbf`

The reviewer's sharpest finding was against a claim I had labelled **"measured"**: the follow-on paragraph's
sweep had been **truncated by my own `sed -n '1,20p'`**, which cut `apps/mobile` off the end. Three
construction sites, not two; the definition cited was an import line. Re-run untruncated. The other
Important: the engine docblock still carried the trigger this change refuted — corrected **in
`packages/rule-engine/src/checks/membership.ts`**, the one place the fix reached outside the reviewed diff
(a comment), and the reason a scoped re-review was dispatched rather than assumed unnecessary. Minors:
overstated refusal reachability, a **backwards** `aria-hidden` claim in the test docblock, a false "block
untouched" sentence, a citation to an explanation rather than an assertion, and two overclaims in
`19a5c3c9`'s own commit message (recorded in the catalogue, since a message cannot be edited without moving
the reviewed shas).

**THE SCOPED RE-REVIEW** confirmed the comment-only claim by reading the hunks and then found the one thing
fix round 1 had done to itself: **a fix is a change like any other, and every citation round 1 wrote had
been measured at the reviewed head rather than at its own tip** — `526c9fbf` added 17 lines to `page.tsx`
that moved every line below them, so a reader verifying the new reachability claim landed on prose. It also
found the corrected claim surviving **verbatim** in `Features.md:331` and the 13.827 test docblock, and
"THREE places" counting a universe that silently excluded the package defining the function. **Fix round 2
(`ec4df6ec`) addresses all of it**, and a read-back instrument (`/tmp/citecheck.py` in that session; every
citation in the added lines with its target line printed) was written because eyeballing had failed twice.
**No third review was run**: fix round 2 is prose and line numbers only, the reviewer had already named the
defect and the criterion, and the instrument now checks it mechanically.

### What shipped

`apps/web/app/w/[workspaceId]/members/page.tsx` — the Role cell's second arm: a shared `Select` for an
admin, on rows whose role the control can state (`:447`, predicate `:537`, options `:518`), a `changeRole`
that submits `membership.granted` through the ordinary ingest door (`:309`, entity id `:320`), a
`loadMembers` callback so a commit re-reads the roster (`:173`), and a refusal alert under the table
(`:473`). The file docblock's role-control passage is **CORRECTED, not deleted** (`:58-107`). ·
`apps/web/test/members-page.test.tsx` — cases **13.824–13.828**, plus 13.761 re-pointed and 3.132/3.133
scoped to the mint form. · `Features.md` (the members bullet's ABSENT list corrected, the role control
added, and the shared-`Select` bullet's call-site list gained its fourth `apps/web` site) · `test-cases/13`
(a new section, five ✅ cases, the mutations, and the follow-on correction).

**`task-ledger.tsv` untouched** — the controller flips `membership-role-guard` 2.

### ★ FIVE PLAN-TEXT AND TEST-TEXT DEFECTS — measured, not assumed

1. **The plan's Step 1 test code queries a `combobox` that does not exist.** The shared `Select`'s trigger
   is a **`button`** (`packages/ui/src/select/select.tsx:254`).
2. **Its sample cases name a control on `Kiro`'s row, and the fixture makes Kiro the OWNER** — the one row
   this design leaves chipless.
3. **Its expected labels are capitalised; the shipped ones are lowercase**, matching the mint form on the
   same page (`page.tsx:688-690`) and 13.761's rule that the row prints the wire's own token.
4. **EVERY name query had to be a REGEX, and that is a measurement.** The trigger's accessible name is
   `<its value> <the caller's aria-label>` — `member Role for Anselma Marak` — because react-aria sets
   `aria-labelledby` and the algorithm concatenates it. Exact-string queries return 0 against a correct
   control; `/^Role for /` **can never match**, so 13.826's absence arm was unanchored for that reason. A
   self-inflicted check-that-cannot-fail, caught before the PR. **Recorded, not fixed, owner: whoever next
   touches `packages/ui/src/select/select.tsx`.**
5. **Four of my OWN citations were stale and are fixed at `b3eb8b80`**: the mint form's options moved to
   `:669-671` (I had left `:472-481`), and the owner-refusal sentence is `check-permission.ts:389`, not
   `:373` — the line I had cited is a docblock about renaming workspaces.

### Mutations — six, each sha256-confirmed to change the file and restored to the backup's sha exactly

M1 viewer half dropped → **13.826 only** · M2 `owner` added to the options → **13.824, 13.828, 13.761** ·
M3 representability predicate always-true → **13.828, 13.761, and NOT 13.824** (this is the one that
separates the option LIST from the GATE) · M4 entity id → bare user id → **13.825 only** · M5 refusal
swallowed → **13.827 only** · M6 reload on every answer → **13.827 only, by its `rosterReads` half**.

### THE RULING — closed, do not reopen

The owner-row narrowing was taken as a **conservative default** and filed as
`gisik-nokma-lanes/EXEC2-2026-09-18-owner-row-editability.md`; **the controller confirmed it 2026-09-18
("I am not reopening your PR for it")**. Owner rows keep the chip. Recorded in all four places that had
said "not a ruling" — those sentences were true only until the answer came back.

### ★ THE FOLLOW-ON TASK 1 ASSIGNED TO THIS TASK — its stated reason is WRONG, corrected not repeated

Task 1's section ends: *"It goes live with the roster's role control… **Owner: that task.**"* Checked
rather than inherited: **`apps/web`'s ingest is the ONLINE door**, whose engine context implements
`countWorkspaceOwners`, so the guard answers and **nothing throws from this control**. The replica's outbox
is reached only through `createReplicaDataSource` — `apps/desktop/src/app.tsx:56` and the dual-client
harness, **not `apps/web`** (measured). Corrected trigger: it goes live when a REPLICA-BACKED client gains
a members roster. The finding (`outbox.ts:315` calls `evaluateEvent` with no `try`/`catch`) is narrower
than its first record and no less real.

### THE PROSE-ONLY PARTITION — the reviewer ran while two edits landed

The reviewer was dispatched against **`19a5c3c9`** and the tree moved under it. Measured with
`git diff -U0 -- <the two code files>` and every changed line matching `^[+-]\s*(\*|//|$)`: **`b3eb8b80`
changes ONLY comment lines in the code files**; the rest is `Features.md` and `test-cases/13`, which are
prose by construction. No executable line moved, so the reviewed logic is intact.

### Verification at `b3eb8b80` — recounted, not quoted

**Re-run at `526c9fbf` after the fix round:** rule-engine **331/331** · members-page **28/28** · `tsc`
exit **0** on rule-engine and web · **all seven checks raw 0**.
**At `b3eb8b80`: web 487/487** (whole package, `--maxWorkers=1`) · **members-page 28/28** · **app-core 1544/1544** ·
**`tsc --noEmit` on apps/web exit 0** · **SEVEN checks raw 0**: `check:env`, `check:tasks`,
`check:db-tz` (needs `DATABASE_URL=postgres://gisik:gisik@localhost:54329/gisik_nokma`, prints
`database timezone: Asia/Kolkata`), `check:runbook`, `check:citations` (2161 checked, 0 uncited;
test-cases/13 is 612 cited / 0 uncited — a per-file ceiling of 0, so the five new ids being inside that
count is the proof they are cited), `check:help`, and `scripts/check-case-ids.mjs` (2302 unique ids, no
duplicates). **The dispatch says "six checks"; it is seven now** — `check-case-ids` was added after that
sentence was written.

### What a restart must NOT redo

- **Do not re-run the mutations.** Six are recorded above and in `test-cases/13` with their kill sets.
- **Do not re-derive the accessible-name behaviour.** The measurement is in the test docblock; the
  conclusion is that every name query in this file is a regex and 13.826's absence arm is unanchored.
- **Do not rebase onto `36ec6ae3`.** See the anchors row.
- **Do not re-open the owner-row question.** Ruled, and recorded in four places.
- **Do not "fix" the plan's Step 1 sample code in place.** The plan is the controller's document; the
  defects are recorded here and in `test-cases/13` instead.
- **Do not re-run the review round.** It returned no Critical; its two Importants and five Minors are all
  addressed at `526c9fbf`, each verified at source, and the corrections name themselves in place. A scoped
  re-review of that fix is the last outstanding step before the PR.
- **If you re-run a sweep for any claim in this block, do NOT truncate it.** The one Important finding here
  exists because the author's own `sed -n '1,20p'` cut an app off the end of a sweep and the sentence still
  said "measured". Count the universe first.

## ▼ PREVIOUS BLOCK — membership Task 1: the last-owner guard, in both layers (2026-09-18)

**Position: the change set is COMPLETE, the review round is CLOSED and fully discharged, and the PR is
opening against `main` with the reviewer recorded in its body.** Dispatch:
`CTL-DISPATCH-2026-09-18-exec2-membership-t1.md`. Plan of record:
`docs/superpowers/plans/2026-09-18-membership-role-guard.md` (Task 1). One PR, `--base main`, branch
**`exec2/membership-t1-last-owner`**.

**CHECK `gh pr list --state open` BEFORE ACTING ON THE POSITION LINE ABOVE.** The Task 11 block this one
replaced said "the PR is open awaiting the controller's merge" and PR **#454 had already merged** at
`06b0e29d`. That is the third consecutive block in this file to be stale in the conservative direction —
the direction nobody audits. One command settles it.

### Anchors — verify these; do not trust the row

| | |
|---|---|
| branch | `exec2/membership-t1-last-owner` |
| base | **`61a105dd`** = `origin/main` = the `#456` merge (the controller's plan fix) |
| reviewed head | **`a6877594`** — the commit the reviewer ran against |
| frozen head | **verify with `/usr/bin/git rev-parse HEAD`.** A block cannot name the commit carrying it. At the last count it was **`763b762f`** after the rebase onto `61a105dd`, and the handoff commit carrying this line is one MORE than whatever is here |
| ahead / behind | **5 / 0** at `763b762f`, before the handoff commit — **recount, do not quote** |
| the two rebases | `a6877594` → `a5a824c3` (onto `b71bc0d3`, resolving ONE conflict in `test-cases/13` where Task 6 appended a section) → `763b762f` (onto `61a105dd`, clean) |
| **what moved under the review** | **`/usr/bin/git diff a6877594 HEAD -- <the six reviewed code files>` touches ONLY `membership.ts`, and every changed line is a ` * ` comment** — 29 insertions / 3 deletions, verified line by line. No executable line moved, so the reviewed logic is intact; the review round's other edits are prose and tests |
| PR | opens from this branch, `--base main`, reviewer recorded in the body BEFORE it opens |

### What shipped

`packages/rule-engine/src/checks/membership.ts` (NEW — `checkMembershipGranted`, `checkMembershipRevoked`,
`ownersOrThrow`, `isCurrentlyOwner`) · `packages/rule-engine/src/engine.ts` (the OPTIONAL
`countWorkspaceOwners`) · `packages/rule-engine/src/refusal-rules.ts` (two ids) ·
`packages/rule-engine/src/evaluate.ts` (two dispatch arms — **these two types passed through untouched
until now, which is exactly what let the hole live**) · `packages/rule-engine/src/checks/context-helpers.ts`
(a `getMembershipState` narrowing helper, mirroring `getTicketState`) ·
`apps/server/src/engine-context.ts` (the `SELECT` over `proj_memberships`) ·
`apps/server/src/permissions/check-permission.ts` (the actor half) · tests
`packages/rule-engine/test/membership.test.ts` (NEW, 16), `packages/rule-engine/test/engine.test.ts`
(the exhaustive `REFUSAL_RULES` equality gained two rows — it REDDENED when the ids were added, which is
that check working as designed), `apps/server/test/permissions/check-role-permission.test.ts` (4 pure +
2 real-door) · `Features.md` (two bullets) · `test-cases/13`.
**`task-ledger.tsv` untouched** — the rows exist (`membership-role-guard` 1 and 2, both `todo`) and the
controller flips them.

### ★ FOUR PLAN-TEXT DEFECTS — measured, not assumed; do not re-litigate them

1. **The plan's Step 1 test code cannot pass.** It uses `userId: 'u1'`, and `membershipGrantedPayload`'s
   `userId` is `ulidString`. **Measured**: `membershipGrantedPayload.safeParse({userId:'u1',...})` fails
   with `userId: must be a ULID`. A test transcribed faithfully would be red **for a reason unrelated to
   this guard**, and the tempting repair — loosen the assertion — deletes the witness. Real ULIDs
   throughout; case 13.822 pins the `'u1'` shape as a `malformed-payload` so it cannot return.
2. **The plan's Step 5 code block omits the `env.entity.kind` guard its own prose requires** ("type guard,
   **kind guard**, `safeParse`…"). `evaluate.ts`'s docblock makes it mandatory — the fixture suite and the
   offline replica enter through `evaluateEvent` and never pass through ingest's door. Added, and
   mutation-proven (removing it reddens exactly the misfiled-kind case).
3. **The plan's Step 3 declares `REFUSAL_RULES.grantOwnerRequiresOwner` under "Produces" while its Step 7
   emits the generic `permission.role`.** The two cannot both hold. **The id is emitted** via `refuseWith`,
   because a rule name nothing emits is a matching key that can never match and **all twenty ids already in
   `REFUSAL_RULES` are emitted somewhere (measured 20/20)**, so a twenty-first with no emitter would be the
   catalogue's only dead entry. Filed as `EXEC2-RULING-2026-09-18-grant-owner-rule-id.md` with **both
   readings priced**; **RULED 2026-09-18 by the controller: carry on with `refuseWith` and the new id.**
   **CLOSED — do not reopen. The controller then FIXED THE PLAN rather than leaving the conflict
   standing**: Step 7 now reads `refuseWith(REFUSAL_RULES.grantOwnerRequiresOwner, …)` (PR #456,
   `fff365bd`), so **the plan and this code agree** — a sentence in the first draft of the handoff saying
   they still disagreed was true only until that commit.
4. **The plan's Step 7 line `return refuse(WORKSPACE_OWNER_GRANT_REASON)` is correct only against
   `check-permission.ts`'s LOCAL one-argument `refuse`** (`:213`, which injects `PERMISSION_ROLE_RULE`),
   not the rule-engine's two-argument one. A first cut of this work used the two-arg form, which would not
   compile. Recorded because the plan's line looks wrong and is not.

### ★ THE REVIEW ROUND — no Critical, the escalation closed, and TWO of my own records measured FALSE

One reviewer over `a6877594`. **It could not perform the escalation**, and it independently confirmed the
count's agreement with `resolveEffectiveRole`, `excludingUserId` at both call sites, and that no case stays
green under the mutation it claims to pin. What it found is mostly **my prose claiming more than the runs
witnessed** — this repo's signature defect — plus one real consequence of the throw.

1. **[Important] The throw is reachable as a crash on the offline replica, and my docblock claimed that
   door ENFORCES the guard. It does not.** Chain, each link read: `local-context.ts:217` serves the actor's
   own membership **with a role**; no in-memory context implements `countWorkspaceOwners`; and
   `outbox.ts:315` calls `evaluateEvent` with **no try/catch**, so the throw escapes `enqueue` — which
   contracts to return an `IngestResult` and whose docblock claims its verdict is *"identical to the answer
   the server will give on the same facts"*. For this guard the server **refuses** and the replica
   **throws**. **Latent today** (no shipped client emits these events; measured, zero hits). **Named
   follow-on on the roster's role control**, recorded in `test-cases/13`, NOT fixed here — the replica
   genuinely holds one row, so the repair is where a throwing evaluation is caught, not a counter invented
   in a context that cannot answer. **The docblock is corrected**; it previously said placing the guard in
   the engine meant the replica enforced it.
2. **[Important] My recorded mutation #3 was invalid evidence, and the record asserted otherwise.**
   `test-cases/13` said the "corrected" re-run — clause deleted whole, *"valid SQL, `$2` still bound"* —
   killed the case. **Measured false:** that deletion removes the query's ONLY `$2`, leaving one placeholder
   against a two-element parameter array, and the case reddened with
   `bind message supplies 2 parameters, but prepared statement "" requires 1` — **the identical failure
   class the same paragraph calls "not a kill"**. So there were **two** invalid attempts, not one, and the
   second was recorded as the good one. **The kill that counts keeps both placeholders**
   (`AND ($2::text IS NULL OR $2::text IS NOT NULL)`), verified by reading the mutated line back, with a
   true `AssertionError` and no bind or syntax error. Recorded in full in `test-cases/13`, because the
   lesson is that **all three attempts exit 1** and the two wrong ones look *better*.
3. **[Minor]** `test-cases/13` cited `membership.ts:63` as "(the throw)"; `:69` is the throw, `:63` the
   helper's signature. Corrected.
4. **[Minor]** Mutation #1's numbers were right and their description was not: the five reds **include
   13.822's THROWS arm**, so "kills refusals and nothing else" is false, and of the eleven green only
   **eight** are accept arms (three are `malformed-payload` refusals). Corrected.
5. **[Minor]** The world-half `Features.md` bullet sat under §5 (*Tickets, hierarchy & rollups*) though a
   membership guard is not a ticket feature; **moved into §6 beside its actor half** so the guard reads as
   one feature. Its *"cannot have one through the shared fixture suite"* also named the wrong reason —
   corrected to: the harness DOES serve a roster with roles but has no `countWorkspaceOwners`, so a fixture
   case would **THROW** rather than exercise the rule. "Cannot" was a claim about the harness's current
   shape stated as an impossibility.

**The pattern worth carrying: every finding was a sentence stronger than the measurement under it, and the
reviewer found them by RUNNING the thing rather than reading it.** Two were in records I had written to
document exactly this defect class.

### Bypasses I ruled OUT by measurement, so a restart need not redo them

- **Invite acceptance does not bypass the actor half.** `apps/server/src/invites/acceptance.ts:166` does
  push a `membership.granted`, and through the INTERNAL door, so the permission gate does not see it — but
  `inviteSentPayload.role` is `z.enum(['admin','member','guest'])`
  (`packages/domain/src/events/invites.ts:61`), a hand-written enum whose docblock says reusing
  `workspaceRoleSchema` "would admit `owner`". No invite can confer ownership. **The engine half still runs
  on that path**, which is a reason to have it in the engine rather than only in the gate.
- **The founding grant is unaffected.** `bootstrap-workspace` appends `membership.granted {role:'owner'}`
  for a founder who holds no membership yet, so `isCurrentlyOwner` is false and the guard accepts — which
  the passing founding-sequence tests confirm rather than my reasoning.
- **A batch cannot empty the workspace** — see the section above; now a pinned assertion.
- **The count and `resolveEffectiveRole` cannot disagree on who is an owner.** `effective-role.ts` sets
  `workspaceRole` from the `scope_kind === 'workspace'` row and null otherwise, so `workspaceRole === 'owner'`
  holds for exactly the rows `countWorkspaceOwners` counts — one predicate, two spellings.

### Case ids — measured, not taken

**Cases `13.820`–`13.823`**, the plan's block `13.820`–`13.849`; the rest stays free for Task 2.
Measured **by case MARKER** at this tip: the highest section-13 marker is **`13.795`**, the whole
`13.820`–`13.849` band is **free including any letter-suffixed variant**, and the controls behaved
(`13.793`/`13.794`/`13.795` taken; `13.796`, `13.818`, `13.819`, `13.850`, `13.900` absent). **A first
measurement sorted the suffix with `parseFloat` and printed `13.99` as the highest — the suffix is a CASE
NUMBER, not a decimal, so that ordering was wrong; the per-id lookup above is the one that counts.**
`check:case-ids` is green and the union is 2297 after the rebase.

### Verification at the rebased head

`packages/rule-engine` **331/331** · `apps/server` **151 files, 1547 passed, 5 skipped, 0 failed** ·
typecheck **8/8** (`rule-engine`, `server`, `domain`) · **six checks raw 0** (`check:env`, `check:tasks`,
`check:runbook`, `check:citations`, `check:help`, and `check:db-tz` **with the documented**
`DATABASE_URL=postgres://gisik:gisik@localhost:54329/gisik_nokma`, printing `database timezone:
Asia/Kolkata`). **The forced gate was NOT run** — the controller runs it. **`docker compose` was NOT run**
and **:3001 was not bound**, per the two-executor override.

**A `/dev/tcp` probe reported port 54329 CLOSED when it was open** (`lsof` and `nc` both said OPEN;
`gisik-nokma-exec-postgres-1`, up 11h). Recorded because a false "the database is down" is exactly the
shape that sends the next session hunting for a problem that does not exist.

### Mutations — each applied to a byte backup, confirmed to CHANGE the file, run, restored by `cp` with matching sha256

1. **`isCurrentlyOwner` returns false** → reddens **5**: 13.820 and 13.821's refusal arms plus both
   `evaluateEvent` reachability arms, with all **11 accept arms green**. The asymmetry is the evidence —
   the mutation kills refusals and nothing else, so it names its own site.
2. **The stub's count ignores `excludingUserId`** → reddens the same 4 refusal arms, accepts green.
3. **The server's SQL drops the `excludingUserId` clause** → reddens **exactly one case, the real-door
   sole-owner refusal, 46 green.** This is the mutation that justifies the database suite: no stub and no
   pure test can see it.
   **★ A FIRST ATTEMPT AT THIS MUTATION WAS INVALID EVIDENCE AND LOOKED LIKE A KILL.** The perl
   substitution dropped `$2` from the string and produced `AND (::text IS NOT NULL)` — a SQL **syntax
   error**. The case reddened, but it would have reddened identically for a missing bind parameter, a
   mistyped column, or an absent table. Re-run with the clause deleted whole (valid SQL, `$2` still
   bound), it killed the same single case. **The two attempts are indistinguishable from the exit code
   alone**, and the invalid one is the more convincing-looking.
4. **The owner-grant clause replaced with `if (false)`** → reddens the pure case AND the real-door case,
   so neither half is decorative.
5. **The kind guard removed** → reddens exactly the misfiled-kind case.

### ★ The gap my OWN second pass found, after the first commit — batching

**A batch of two events is judged one at a time, and the context reads through the ingest TRANSACTION's
own client, so the count for the second event sees the first's effect.** Measured on a scratch test
before it was written into the suite, because the alternative — one submission demoting both owners —
would have reached zero owners while every per-event assertion stayed green:

```
BATCH: [{"status":"committed"},{"status":"refused","rule":"last-owner"}]   OWNERS: 1
```

The case is now an assertion inside 13.820's real-door `it`, with a **stable ADMIN actor** rather than an
owner on purpose: an owner demoting himself is refused on the second event by the ROLE gate (he is no
longer an admin by then), so an owner-actor version would pass **while the count was blind**. **That is
the assertion that pins the property; the per-event arm above it does not.**

**The assertion caught my own error while I was writing it** — the first cut demoted `owner` (a plain
member by then) and `second` (one of two owners), both committed, and the failure read
`[committed, committed]`. `grantMember` MINTS its target, so "put the first owner back" was a third
person. Recorded because the case is only load-bearing if a reader can see what its targets really are.

### What a restart must NOT redo

- **Do not re-implement the plan's Step 1 test code as written** — see defect 1. It cannot pass.
- **The guard has no end-to-end fixture and CANNOT have one through the shared fixture suite.**
  `buildMemoryContext` answers `null` for every membership (so `wasOwner` is always false there) and the
  fixture harness, which does serve roles, is reached only through fixture JSON, none of which carries a
  `membership.granted` candidate. Its witnesses are the two test files above. Recorded in `Features.md` as
  a hedge rather than left to be inferred.
- **The real-door tests MUST use `ingestClientBatch`, not `ingestBatch`.** `ingestBatch` is the internal
  append path and runs **no permission gate** — the first cut of the database block used it and the
  self-promotion case came back `committed`. `last-owner` would have hidden the same error, because the
  engine runs on both doors. This is pinned as a comment in the block.
- **Do not "fix" the `grantOwnerRequiresOwner` decision before the controller rules on it** — see defect 3.

---

## ▼ PREVIOUS BLOCK — second wave Task 11: List row checkboxes and `Close selected (N)` (2026-09-18)

**Position: the change set is COMPLETE, the review round is CLOSED and fully discharged, and the PR is
open awaiting the controller's merge.** Dispatch:
`CTL-DISPATCH-2026-09-18-exec2-secondwave-t11.md`. One PR, `--base main`, branch
**`exec2/secondwave-t11-list-selection`**, cut from `origin/main` = `43885e26` (which is also the `#452`
merge — Task 10's).

**CHECK `gh pr list --state open` BEFORE ACTING ON THE POSITION LINE ABOVE.** The Task 10 block this one
replaced said "the PR is open awaiting the controller's merge" and PR #452 had already merged at
`43885e26`; the block BELOW it says the same thing about Task 9's PR #449, which merged at `08bdd791`.
Both were stale in the conservative direction, which is the direction nobody audits. A restart surface
that says "open" about a merged PR is this lane's most-repeated failure; the check is one command.

### Anchors — verify these; do not trust the row

| | |
|---|---|
| branch | `exec2/secondwave-t11-list-selection` |
| base | **`43885e26`** = `origin/main` at cut time = the `#452` merge (Task 10) |
| reviewed head | **`8f6dde42`** — the commit the reviewer actually ran against |
| frozen head | **`fa7bb609`** as this was written — **verify with `/usr/bin/git rev-parse HEAD`**, because a block cannot name the commit carrying it, and the handoff commit that carries this line is one MORE than whatever is here |
| ahead | **3** at `fa7bb609`, before the handoff commit; recount, do not quote |
| three commits, and the split is the review's boundary | `8f6dde42` change · `907327cc` handoff + two docblock corrections (written BEFORE the review returned — it is not part of the reviewed diff) · `fa7bb609` everything the review produced |
| behind | **recount.** `main` moves without telling you, and this lane merges into it |
| PR | opens from this branch, `--base main`, reviewer recorded in the body BEFORE it opens |

### What shipped

`packages/app-core/src/views/ticket-list.tsx` (the `selection` and `controls` props + the leading
checkbox column in `ListTable`) · `apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx` (the List arm:
`selectedIds`, `pendingClose`, `canBulkClose`, `reloadListClearingSelection`, the opener's swap guard,
the one `BulkCloseDialog` mount) · `packages/ui/src/ui.css` (`.gn-list__select`; `.gn-list__bulk-close`
as a FOURTH selector in the existing `.gn-board-card__close`/`.gn-row-action`/`.gn-board__column-action`
rule body, not a copy) · tests `packages/app-core/test/views/ticket-list.test.tsx`,
`apps/web/test/list-bulk-close.test.tsx` (new), `packages/app-core/test/views/ticket-list-css-binding.test.tsx`
(the 13.671 maximal fixture gained a FIFTH render) · `Features.md` · `test-cases/13`.
**`task-ledger.tsv` untouched. `packages/app-core/src/index.ts` untouched** — `BulkCloseDialog` and
`BulkCloseTicket` were already exported by Task 9.

### ★ THE CORRECTION THIS TASK CARRIES — the same gap as Task 10, on the second surface

The plan wires `onClosed` → `list.reload()` with the selection cleared on reload. §8.3's Board bullet is
ONE sentence carrying both halves — *"Per-ticket refusals … **stay listed**; the rest close and the board
reloads"* — and the List bullet inherits it through "same dialog, same batch". `onClosed` fires on a
PARTIAL close too, so an `open` derived from the selection unmounts the dialog in the same tick its
`Could not close` rows are written.

**The fix is the Board's, stated for this consumer: `pendingClose` is the click-time SNAPSHOT and the
dialog's own open flag at once**, `onClosed` reloads UNCONDITIONALLY, and the snapshot is released only on
a COMPLETE close. **13.794 is the witness; the mutation that reinstates the plan's literal reading
reddens 13.794 and nothing else.** The same review-found path Task 10 closed is closed here too
(`setPendingClose((current) => current ?? snapshot)`), with 13.795 as its witness. 13.795's CONTROL half
(dismiss, press again, see the CURRENT selection) shows the element is LIVE and the selection really did
change — **it does not show the refused click arrived**, which is the sharper claim an earlier draft made
and the review corrected: a third click cannot separate the guard from a handler that swallows clicks only
while `pendingClose !== null`, and no assertion can, because a correctly refused click is a no-op.

### Case ids — measured, not taken

**Cases 13.647–13.649** (the plan's own ids, from its `13.613`–`13.649` reservation) **and 13.794–13.795**
(this lane's block `13.760`–`13.819`, continuing it). Measured with the sanctioned extractor before
minting: the highest case MARKER in `test-cases/` at this tip was `13.793`, and `13.647`/`13.648`/`13.649`
were free. **Positive control in the same run**: `13.640` resolved as taken, and `13.644`–`13.646`
resolved as absent — confirming the controller's correction of its own earlier claim. **The next free id
in this lane's block is `13.796`.**

### ★ THE REVIEW ROUND — no Critical, no behaviour defect, five overclaims and a citation drift

One reviewer over `8f6dde42`. It tried to break the load-bearing claim — that the selection and the
dialog cannot disagree — across four named scenarios (a partial whose `closedIds.length` equals the
snapshot's; a second confirm that could flip the equality; a swap with no `open` transition; a stale
snapshot reaching the batch) and could not, and it re-derived the release condition from the dialog's own
partition of `pending` rather than taking this change set's word for it. What it found instead is this
repo's most-recorded defect class: **prose claiming more than anything witnesses.** All five are fixed in
`fa7bb609` and each is recorded there with the measurement that established it.

1. **The clearing wrapper's caller claim** (the source was already corrected in `907327cc`, written before
   the review returned; **`Features.md` was not** — it repeated it, and is now corrected). One caller, not
   "the page's own reload sites".
2. **Seven `page.tsx` citations off by exactly ten lines** — shifted by `907327cc`'s docblock fix, and
   invisible to `check:case-citations`, which enforces only that a case id is NAMED under a test
   directory and never a `path:line`. Re-measured and read back, all sixteen, including the bare `:NNN`
   forms. **A read-back that matches only the full `path:line` shape skips half the set silently — this
   round's own first read-back did exactly that.**
3. A false line distance in `ui.css` ("two hundred lines below" — nearer twenty), re-cited by selector.
4. A quotation attributed to `BulkCloseDialog`'s docblock that is the PLAN's wording.
5. **"The plan's own text produces [the unmount]"** — corrected in the source docblock, the catalogue and
   `Features.md`. The plan names neither a snapshot nor an `open` expression: it does not produce the
   unmount, it fails to forbid it. Both literal readings fall short of §8.3, which is the honest form.
6. 13.795's control half proves the click is LIVE, not that the refused click ARRIVED — corrected in the
   test docblock and the catalogue.
7. "The label keeps the FULL selection count" — the count is over VISIBLE rows; corrected.

**Verification at `fa7bb609`:** app-core **1536/0** · ui **325/0** · web **475/0**; the whole workspace's
**22 build+typecheck tasks 0**; **seven checks raw 0** (`check:db-tz` with the documented
`postgres://gisik:gisik@localhost:54329/gisik_nokma` prints `database timezone: Asia/Kolkata`). **The
forced gate was NOT run** — the controller runs it.

### What a restart must NOT redo

- The plan's Task 11 text is **not** to be implemented literally — see the correction above. If a
  dispatch ever quotes it again, the correction wins.
- **Do not re-litigate the review round's five findings.** Each is fixed at `fa7bb609` with the
  measurement that established it, and three of them exist because a first draft stated a property more
  strongly than the case beside it witnesses. A future edit that restores the stronger wording restores
  the defect.
- `packages/app-core/test/views/ticket-list-css-binding.test.tsx` (13.671) is a bidirectional
  class↔CSS equality. It REDDENED when this task's two classes were added and was extended, which is
  the check working as designed: a new class in either package must be reflected in that fixture.

---

## ▼ PREVIOUS BLOCK — second wave Task 10: `Close all (N)` on a terminal board column (2026-09-18)

> **CORRECTED 2026-09-18 when Task 11 opened this file.** The Position line below said *"the PR is open
> awaiting the controller's merge"*. **IT WAS ALREADY MERGED — PR #452, merge commit `43885e26`, which
> was `origin/main` when Task 11 cut its branch.** The line is kept rather than rewritten so the shape of
> the failure stays readable; the Task 11 block above opens with the check that settles it
> (`gh pr list --state open`).

**Position (as written, and stale): the change set is COMPLETE, the review round is CLOSED and fully discharged, and the PR
is open awaiting the controller's merge.** Dispatch:
`CTL-DISPATCH-2026-09-18-exec2-secondwave-t10.md`. One PR, `--base main`, branch
**`exec2/secondwave-t10-board-closeall`**, cut from `origin/main` = `8aff8843`.

**Three commits, and the split is the review round's boundary:** `25f385be` is the change, `e12dd4fb`
is the handoff (committed WHILE the reviewer was running — it is not part of the reviewed diff), and
`f68d20d4` is everything the review produced. **The reviewer read `25f385be` and nothing else**, so a
reader asking "was what I am looking at reviewed?" must read the PR body's review section, which
states what moved after it and gives the one command that proves the reviewed content survived.

**THE FIRST THING THIS SESSION FOUND, and the reason it re-read rather than trusted: the previous
top block (Task 9) said "the PR is open awaiting the controller's merge". IT WAS ALREADY MERGED —
PR #449, merge commit `08bdd791`.** The handoff's own Position line had expired. Verified, not
assumed: `gh pr list --state all` shows #449 MERGED, and `81473e5f` (the Task 9 branch tip) is an
ancestor of `origin/main` by `git merge-base --is-ancestor`. **A restart surface that says "open"
about a merged PR is the "restart surface goes stale" mode, and it failed in the conservative
direction — the direction nobody audits.** Check `gh pr list --state open` before acting on any
Position line here.

### Anchors — verify these; do not trust the row

| | |
|---|---|
| branch | `exec2/secondwave-t10-board-closeall` |
| base | **`8aff8843`** = `origin/main` = the `#450` merge (executor 1's Task 5) |
| reviewed head | **`25f385be`** — the commit the reviewer actually ran against |
| frozen head | **`f68d20d4`** — the review round's tip; **verify with `/usr/bin/git rev-parse HEAD`**, since a block cannot name the commit carrying it |
| `origin/main` | `8aff8843` at the last count — **recount; main moves without telling you** |
| ahead | **3** at `f68d20d4`; **4** once this handoff's own commit lands |
| behind | 0 |
| tree | clean before the handoff edit |
| HEAD | **verify with `/usr/bin/git rev-parse HEAD`.** A block cannot contain the commit carrying it |
| PR | opens from this branch, `--base main`, reviewer recorded in the body BEFORE it opens |

### What shipped

`packages/app-core/src/views/board.tsx` (the column header action, the board-owned `bulkClose` state,
the one dialog mount) + `packages/ui/src/ui.css` (`.gn-board__column-action`, a third selector in the
EXISTING `.gn-board-card__close`/`.gn-row-action` rule body, not a copy) +
`packages/app-core/test/views/board-close.test.tsx` (a fourth `describe` in that file, as the plan
directs) + `Features.md` + `test-cases/13`. **`task-ledger.tsv` untouched. `packages/app-core/src/index.ts`
untouched** — `BulkCloseDialog` was already exported by Task 9.

### ★ THE CORRECTION THIS TASK CARRIES — read this before Task 11

**The plan's text wires `onClosed` → `moves.onMoved()` and says nothing about dismissal. The task's
dispatch then said to clear the board's `bulkClose` state in `onClosed`. BOTH TAKEN LITERALLY MEAN AN
UNCONDITIONAL CLEAR — AND THAT SILENTLY DELETES HALF OF SPEC §8.3's Board bullet.**

That bullet is ONE sentence carrying both halves:

> *"Per-ticket refusals … **stay listed**; the rest close and the board reloads."*

`onClosed` fires on a PARTIAL close too (the dialog calls it whenever at least one ticket committed),
so an unconditional `setBulkClose(null)` unmounts the dialog and destroys the `Could not close` rows
the same sentence requires it to keep on screen.

**The clear is CONDITIONAL — `closedIds.length === tickets.length` — and the reload is
UNCONDITIONAL**, because "the rest close and the board reloads" holds on both outcomes. Full success →
the dialog leaves (the defect the dispatch was written to fix). Partial → the board still reloads and
the dialog stays with the refusal listed. **Case 13.792 is the witness, and the mutation that
reinstates the dispatch's literal reading reddens 13.792 and nothing else** — so the conditional is
proven load-bearing, not decorative.

**What Task 11 must still do — restated, because the controller is carrying it into that dispatch:**
it must SNAPSHOT its tickets at click time AND keep its own open flag. Its plan text wires `onClosed` →
`list.reload()` with the selection cleared on reload — the same unconditional-clears-it defect, and
there it destroys the `Could not close` rows the moment a PARTIAL close reports. The dialog's own
docblock already says Task 11 must not rely on `list.reload()` alone; **13.792 is now the precedent
that shows what the failing shape looks like and how to witness it.**

### Case ids — and a dispatch claim that is WRONG

**Cases 13.789–13.793**, from THIS lane's block `13.760`–`13.819`. Recount at this tip: the highest
catalogue marker in file 13 is now `13.793`; before this task it was `13.788`. **The next free id
inside the block is `13.794`.** (`13.793` was minted in the review round, for the swap guard — a case
the plan does not name, because the defect it holds was not visible until someone read the shared
dialog's own precondition.)

**The dispatch says "`13.644`–`13.646` are taken". THEY ARE NOT.** A marker sweep over `test-cases/`
and a repo-wide sweep over quoted `*.ts`/`*.tsx`/`*.md` globs both find those three ids **only inside
the plan file itself**, never as a catalogue marker and never in a test. The block allocation is what
binds regardless, so the ids above are this lane's — but the stated reason is false and is recorded
rather than repeated. (**Quote the globs**: an unquoted `--include=*.ts` is silently eaten by zsh and
returns a well-formed empty answer, which is the recorded silent-empty mode.)

### ★ THE REVIEW ROUND — one Important, five Minor, four citation defects, and a fix that was NOT the obvious one

One reviewer over `25f385be`. It **confirmed** the conditional clear (against the spec text, line by
line), the three-term gate, the accessible name and the CSS, and **refuted part of my citation set** —
correctly. No Critical.

1. **IMPORTANT — an open dialog's tickets could be swapped under it.** `BulkCloseDialog`'s docblock
   states that a parent swapping `tickets` while the dialog stays OPEN is not covered by its reset,
   and declares that this "cannot arise" for its two named consumers. **That was false for this one.**
   `open` is `bulkClose !== null`, so a second column's tickets written into a non-null `bulkClose`
   swapped the list with no `open` transition, leaving the previous opening's `closedIds`/`failures`
   describing a list they were not about — a FULL success that does not clear, with a `Could not close`
   row naming the other column's ticket. Fixed by refusing the swap (`board.tsx:307`). **★ The obvious
   fix was MEASURED AND REJECTED: a `key`/remount does reset that stale state and is WORSE**, because
   the attempt token lives on the INSTANCE, nothing bumps a destroyed instance's token, and an
   in-flight answer then passes its own check and calls the old closure's `onClosed` — precisely the
   defect 13.787 exists to prevent. Closing through `null` first does not work either: two `setState`
   calls batch into one render. **Reachability is a KEYBOARD path** — `Dialog` ships no focus trap and
   no portal, recorded as a named follow-on on the SHARED component, not repaired here. Case 13.793.
2. **The citation for 13.792 was parked under 13.790, and 13.792 had none of its own.** Root cause,
   recorded because it is reusable: my insertion anchor was **line-wrapped in the target text**, so the
   `count == 1` guard passed for the wrong reason — the guard proves the instrument works, not that the
   measurement is aimed right. Fixed, and every citation re-measured after the source edits.
3. **Two citations off by one/two** (`:256` named the declaration where the snapshot is `:257`; `:427`
   named the `open` prop). Fixed.
4. **WCAG 2.5.3 (Label in Name): `Close all (2)` is not a substring of `Close all 2 in Done`.** The plan
   mandates that exact string, and the shipped `backlog-rank-controls.tsx:291` breaks containment
   identically — so it is a plan-text defect and a house pattern, not a slip. **RECORDED with a named
   owner** (fix both controls together), not fixed here.
5. **`Features.md` carried two prescriptions for one handler** — the ⚙️ bullet's unqualified "clear …
   in `onClosed`" versus the ✅ bullet that refutes it. Corrected in the ⚙️ bullet, with a pointer.
6. **A straggler column can offer `Close all (N)` for a write the engine refuses** — the header gate
   reads `column.category`, which for a state no published def names falls back to the recorded
   `proj_tickets.state_category`. **RECORDED with a named owner**, not fixed: the header `Chip` already
   displays that same field, so the control asserts nothing the surface does not, and the honest fix
   would move the action out of the deliberately hook-free `BoardGroupSection`.

### Verification at `f68d20d4`

Suites: **app-core 1533/0 · ui 325/0 · web 470/0**. Typechecks **0** (ui, app-core, **apps/web**).
Builds **0** (ui, app-core). **Seven checks raw 0** (`check:env`, `check:tasks`, `check:db-tz` — with
the documented `postgres://gisik:gisik@localhost:54329/gisik_nokma` it prints `database timezone:
Asia/Kolkata` — `check:runbook`, `check:citations`, `check:help`, `check:case-ids`).
**Four mutations killed**, each restored from a byte copy verified by sha256 (not `git checkout`,
which errors on an untracked path) and each guarded by a replacement count of exactly 1:

1. **The plan's own** (render the button regardless of category) → reddens **13.789**'s non-terminal
   negative **and 13.790**.
2. **The `cards.length > 0` term dropped** → reddens **13.790 and nothing else**.
3. **`bulkClose` cleared UNCONDITIONALLY** (the dispatch's literal reading) → reddens **13.792** and
   **13.793** (whose partial-close setup cannot reach its own subject without a surviving dialog).
   This is the control for the correction above.
4. **The swap guard removed** → reddens **13.793 and nothing else**. This one exists only because the
   review found the path; the mutation proves the GUARD, not the prose, holds the invariant.

### The traps that cost time here, so the next lane does not pay again

- **`rtk` swallows vitest output AND the summary line.** `| tail -3` on a redirected run gives
  `PASS (9) FAIL (0)` at best; on a failure it gives `... +4 more failures` and the detail lives in
  `~/Library/Application Support/rtk/tee/<ts>_vitest_run.log`, which is **a JSON blob, not text**.
  Parse it (`python3` + `json.loads` on the first `{…}`) or re-run the file with
  `--reporter=json --outputFile=/tmp/x.json`, which bypasses rtk's stdout filtering entirely. **The
  JSON-reporter route is the one that works and it is what the mutation round used.**
- **A missing destructuring is not a type error.** `BoardGroupWithMoves` gained `bulkCloseFor` in its
  PROP TYPE but not in its destructuring; `tsc` was clean and all nine tests failed at RUNTIME with
  `ReferenceError: bulkCloseFor is not defined`. **A prop type and a destructured binding are two
  edits, and the compiler only checks the first.**
- **`cd` inside a subshell is relative to the subshell's own cwd.** A `for p in …; do (cd $p && …)`
  loop that changes directory inside the loop body fails on the second iteration with
  `no such file or directory`. It failed LOUDLY here — but this is the family of wrong-directory
  enumeration the brief's six silent-empty modes describe, so use absolute paths.
- **Measure citations LAST.** Every `path:line` in the catalogue is a reading of a tree that your next
  edit moves. The eight citations in this task's block were measured, then every one was OPENED and
  read back before commit.

### Recorded, not fixed (out of scope, named owners)

- The dialog's `tickets` array is snapshotted at CLICK time, so a board reload during an open leaves
  the dialog describing the pre-reload column. Deliberate (the alternative rewrites a dialog someone
  is reading), and the same class the dialog's own docblock names as the consumer's to state rather
  than guard. Owner: whoever next changes how a bulk surface opens the dialog.
- `apps/web` passes the board no `bulkClose`-related prop and needs none — the button and the dialog
  are both internal to `Board`. When the page gains a keyboard shortcut for bulk close (spec §9's
  follow-on list), that is where it lands.

---

## ▼ PREVIOUS BLOCK — second wave Task 9: `BulkCloseDialog` (2026-09-18) — **MERGED, PR #449**

> **This block's Position line was stale when a fresh session read it: it said "the PR is open
> awaiting the controller's merge" and PR #449 had ALREADY MERGED** at `08bdd791`, verified by
> `git merge-base --is-ancestor 81473e5f origin/main`. Kept below for its findings, not for its
> position.

**Position (as written): the change set is COMPLETE, the review round is CLOSED, its one Critical is FIXED and
witnessed, and the PR is open awaiting the controller's merge.** Dispatch:
`CTL-DISPATCH-2026-09-18-exec2-secondwave-t9.md`. One PR, `--base main`, branch
`exec2/secondwave-t9-bulkclose`. Reassigned to executor 2 because the owner asked for two executors and
this lane's own queue was empty; the controller checked file-disjointness against executor 1's Task 5
before dispatching, and **no file overlapped** — still true at this sha.

**Two commits, and the split is the review round's boundary:** `ef6da16b` is the change, `e7f9ce5a` is
everything the independent review produced. The **reviewer ran against `ef6da16b`**, so a reader asking
"was what I am looking at reviewed?" must read the PR body's review section, which states what moved after
it and gives the one command that proves the reviewed content survived.

### Anchors — verify these; do not trust the row

| | |
|---|---|
| branch | `exec2/secondwave-t9-bulkclose` |
| base | **`5910742e`** = `origin/main` = the `#447` merge (this lane's `isTypeEditor`) |
| `origin/main` | `5910742e` at the last count — **recount; main moves without telling you** |
| merge-base | `5910742e` |
| ahead | **2** commits at `e7f9ce5a`; **3** once this handoff's own commit lands (it carries this block, so it cannot be named here) |
| behind | 0 |
| tree | clean (`git status --porcelain` empty) |
| HEAD | **verify with `/usr/bin/git rev-parse HEAD`.** A block cannot contain the commit carrying it, so `e7f9ce5a` names the TIP'S PARENT, never the tip |
| PR | opened from this branch, `--base main`; reviewer pass recorded in the body BEFORE it opened |

### What shipped

`packages/app-core/src/views/bulk-close-dialog.tsx` (new) + its export in `packages/app-core/src/index.ts`
+ `packages/ui/src/components/dialog.tsx` (R4) + `packages/ui/test/components.test.tsx` (13.643),
`Features.md` and `test-cases/13-deployment-dogfooding.md` in the same commits. **The produced prop shape
is unchanged from the plan's `Interfaces:` block** — Tasks 10 and 11 consume it as written.

Cases: **13.640–13.643** (the plan's own ids, from its `13.613`–`13.649` reservation — verified free with
the sanctioned recount before minting) and **13.787–13.788**, minted in the review round from THIS lane's
block `13.760`–`13.819`. **The next free id inside that block is `13.789`** (before this task it was
`13.787`, and note that `13.787` appeared in the catalogue only as PROSE saying it was free — a marker
sweep that counts a mention is how a free id reads as taken, and the reverse).

### ★ THE REVIEW ROUND — one Critical, two surviving mutations, four wrong causes

One reviewer, deepseek tier, over `ef6da16b`. It could not falsify the ONE-call assertion or the R4 blast
radius (it re-ran both), and it earned its keep on the rest:

1. **CRITICAL — a dismissed attempt's answer landed on the NEXT opening.** Cancel/Escape/scrim/`×` stay
   live during a submit (deliberately), and the plan's own consumer mounts this dialog once and toggles
   `open`, so the instance survives a dismissal and the in-flight closure wrote a phantom `Could not
   close` (the PREVIOUS batch's refusal) plus an `onClosed` for tickets nobody had just asked to close
   into an opening it knew nothing about. **Fixed by an attempt token** every post-`await` write is gated
   on — including the `finally`, because an ungated reset would release a LIVE attempt's latch. Witness:
   **13.787**, which was RED first (`expected "spy" to not be called at all`, with the stale `['a','c']`).
2. **A FRESH MOUNT DOES NOT COVER IT** — the single most portable lesson here. The house mechanism for a
   reopened dialog starting clean is a fresh mount (case `13.532`, `board.tsx`'s `MoveArrows`); it fixes
   stale STATE across opens and **cannot fix a late PROP CALLBACK**, because the old closure still holds
   the old `onClosed`. This lane's docblock had cited `13.532` as a *ruling* (it is a case id) and named
   the consumers' close-and-reopen as the reason no guard was needed — **inverted**, since
   close-and-reopen is the TRIGGER.
3. **Two mutations SURVIVED round 1's suite** — deleting the holed half of the silence guard, and making
   `onClosed` fire unconditionally, both left 7/7 green. Both were **unwitnessed decisions**, not
   unconstrained paths; both now have witnesses (the holed arm, and 13.788 for the all-refused outcome)
   and both mutations now redden their own site. Round 2 also mutated the fix itself (the token made
   inert), reddening 13.787 and nothing else.
4. **Four wrong causes corrected** — including `dialog.tsx`'s own comment, which claimed spec §5.3's
   ticket-sheet Close was the first collision with `Dialog`'s dismiss. Measured false: `TicketSheet`
   renders `Sheet`, not `Dialog`, and Ruling 31 fixed that collision by renaming **Sheet's** dismiss.
   **Every `path:line` citation in the catalogue block was re-measured after the edits shifted them** —
   eleven of them had gone stale, and a stale citation is this project's own recorded defect class.

### Verification at `e7f9ce5a`

Suites: **domain 506/0 · ui 325/0 · app-core 1502/0 · web 459/0**. Typechecks **0** (ui, app-core, web).
Builds **0** (ui, app-core). **Seven checks raw 0** (`check:env`, `check:tasks`, `check:db-tz` — which
needs `DATABASE_URL`; with the documented `postgres://gisik:gisik@localhost:54329/gisik_nokma` it prints
`database timezone: Asia/Kolkata` — `check:runbook`, `check:citations`, `check:help`, `check-case-ids`).
**Ten mutations killed** (six + four), each reddening its own site and each restored from a byte copy
verified by sha256 — **not** `git checkout`, which ERRORS on an untracked path and would have left a
mutated tree behind.

### The traps that cost time here, so the next lane does not pay again

- **`rtk` swallows vitest output.** A redirected run can come back as three lines with the detail in
  `~/Library/Application Support/rtk/tee/<ts>_vitest_run.log` — the summary line names the path. Read that
  file, or the failure detail is invisible while the exit code still looks right.
- **A mutation anchor that is not unique is refused, not half-applied** — the attempt-token gate appears at
  TWO sites (happy path and `catch`), and the harness reported `replacement count 2 (expected 1)`. **Guard
  every mutation with a replacement count of exactly 1**; a mutation applied to one of two sites reads as
  a survivor and condemns a test that is fine.
- **`--concurrency` is not a vitest flag** (`--no-file-parallelism` is), and the failure looks like a
  harness problem rather than a bad argument.
- **Quoting the previous handoff's suite figures is not measuring them.** This lane's first commit quoted
  `domain 506` from the block above before running it; it happened to be correct, and it was verified
  afterwards — but a quoted number that happens to hold is indistinguishable from one that does not until
  someone runs it.
- **The `PreToolUse` hook refuses any test command containing `head`**, even when the `head` reads a FILE
  rather than the pipe. Use `grep ... | tail -N`.

### What Tasks 10 and 11 must do — read this before starting either

The dialog **never dismisses itself**; `onClose` fires from Cancel, Escape and the scrim only, matching
`NewTicketDialog` and `TransitionDialog`. So the consumer owns the dismissal, and the partial outcome is
what makes it delicate:

- **Task 10** must clear its own `bulkClose` state inside `onClosed` (or after it). `moves.onMoved()`
  alone reloads the board and leaves the dialog mounted and empty.
- **Task 11** must **snapshot the tickets at click time and keep its own open flag**. Its plan text wires
  `onClosed` → `list.reload()` with the selection cleared on reload — which sets `open` false and unmounts
  the dialog the moment a PARTIAL close reports, destroying the `Could not close` rows spec §8.3 requires
  it to keep on screen.

### Recorded, not fixed (out of scope, named owners)

- A results array of the right LENGTH carrying the WRONG tickets' answers is undetectable here; the core's
  own reader has the same limitation (`flows/guarded-child-event.ts:294-296`), so it belongs with that
  contract. Owner: whoever next touches the ingest contract.
- An `OfflineAcceptError` (thrown AFTER every event is enqueued, `replica-data-source.ts:1192`) renders as
  a transport failure and invites a retry that queues N more — identical in `board.tsx`'s `closeCard` and
  `ticket-sheet.tsx`'s `closeOrReopen`, and the sentence is the plan's. Owner: the offline-accept follow-on.
- `packages/app-core/test/views/ticket-sheet.test.tsx:820` still says `Sheet`'s dismiss carries
  `aria-label="Close"`; it says `Close sheet`. Owner: whoever next opens that file.

---

## ▼ PREVIOUS BLOCK — `isTypeEditor`: fields gain `required` (2026-09-18)

**Position: the change set is COMPLETE, the review round is CLOSED, the branch is
REBASED onto `main`, and PR #447 is open and awaiting the controller's merge.**
Dispatch: `CTL-DISPATCH-2026-09-18-exec2-typerequired`, then
`CTL-EXEC2-2026-09-18-rebase-447`. Owner ruling behind it: decision-list item 1,
**"1 - yes"** (2026-09-18). One PR, `--base main`, branch `exec2/type-required`.

**The review round returned: NO Critical, NO Important, six Minor — and four of
the six were defects in THIS CHANGE'S OWN DOCUMENTATION rather than in its code.**
All six are fixed or recorded, and two new cases came out of it (13.786, the
ingest-door witness, which the reviewer correctly identified as the case worth
spending and which `parseEvent`'s existing `roundTrips` assertion made nearly
free). Details in § "The review round" below.

### Anchors — verify these; do not trust the row

| | |
|---|---|
| branch | `exec2/type-required` |
| base | **`488bfb2d`** = `origin/main` = the `#446` merge (executor 1's second-wave Task 4, the row drag) |
| `origin/main` | `488bfb2d` at the last count — **recount; main moves without telling you** |
| merge-base | `488bfb2d` |
| ahead | **6** commits (`origin/main..HEAD`) |
| behind | 0 |
| tree | clean (`git status --porcelain` empty) |
| HEAD | **verify with `/usr/bin/git rev-parse HEAD`.** A block cannot contain the commit that carries it, so any number here names an ANCESTOR, never the tip |
| PR | **#447**, `--base main`; reviewer pass recorded in the body BEFORE it opened |

### ⛔ THE PRE-REBASE SHAS ARE ORPHANED. DO NOT CITE THEM.

`5212a2f7` (the frozen head PR #447 first opened at), `d56fca85` (the commit the
reviewer actually ran against), `be237c73`, `27427836`, `51d78f93` and
`e292c2e2` were all orphaned by the rebase onto `488bfb2d`. **`git cat-file`
still resolves every one of them — it passes on reflog-only commits — and
`git branch --contains` returns nothing.** That asymmetry is why this warning is
here rather than left to a reader to discover. `5212a2f7` survives only as the
local safety ref `backup/exec2-type-required-preRebase-5212a2f7`, which is NOT
pushed and must not be relied on by anyone else.

### § 0 — THE REBASE (2026-09-18), AND WHAT IT COST

Executor 1's Task 4 (#446) merged to `main` as `488bfb2d` while this change was
open, so PR #447 went CONFLICTING. **One file conflicted:
`test-cases/13-deployment-dogfooding.md`, both sides appending at EOF** — the
same shape, and the same file, as this lane's previous rebase. `Features.md` and
`packages/ui/src/ui.css` auto-merged.

**Resolved by union, and the audit is the part worth keeping.** Every line the
PEER added to the catalogue (200 of them, `d069fd94..488bfb2d`) is present in the
final tree — **0 absent** — and every line THIS change added (188) is present
too — **0 absent**. The positive control is what makes that a measurement rather
than a probe that cannot fire: the same probe run against a tree without the
resolution reports **178 of the peer's 200 absent**.

**And the control earned its keep twice in one sitting.** The first run of the
preservation command returned `0` — for BOTH the measurement and its control,
which is impossible if the probe works. Cause: **zsh does not word-split an
unquoted `$PATHS`**, so the whole variable was passed as ONE pathspec matching
nothing. Both zeros were vacuous. Re-run with the paths spelled out, the
measurement is `0` and its control is `22`. **A control that does not fire when
it should have is the same defect as one that fires when it should not** — and
this is the zsh trap this project has recorded before, caught here only because
the control was run in the same invocation as the measurement.

**What survived the rebase, stated as a command a reader can run.** Over the
source and test files the reviewed commit touches — the three merged files
(`Features.md`, `ui.css`, `test-cases/13-…`) excluded on purpose, since they
differ from the reviewed version by exactly the peer's content — expect **EMPTY**:

```
git diff d56fca85 caf1edec -- \
  packages/domain/src/ticket-types.ts \
  packages/domain/test/ticket-types.test.ts \
  packages/app-core/src/workflow-builder/ticket-types/fields-editor.tsx \
  packages/app-core/test/ticket-types/ticket-types.test.tsx \
  packages/app-core/test/workflow-builder/access.test.tsx \
  packages/app-core/test/online/online-data-source.test.ts
```

Positive control: the same command with
`backup/exec2-type-required-preRebase-5212a2f7` in place of `caf1edec` returns
**22 lines**, so an empty result is a measurement rather than a probe that cannot
fire. `caf1edec` is the rebased equivalent of the reviewed `d56fca85` — commit 1
of 6 on this branch.

### Verification at the REBASED head

Suites: **domain 506/0 · ui 324/0 · app-core 1492/0 · web 459/0 · server 1538/0**.
(ui and app-core are HIGHER than pre-rebase because main's Task 4 tests arrived
with the rebase.) Typechecks **11 of 12, exit 0**. Six checks plus
`check-case-ids.mjs` all raw **0**.

### ★ THE MEASUREMENT THAT DECIDED THE SHAPE — read this before re-scoping

**Nothing enforces a type-level `required` field today, and that is structural,
not budgetary.** The engine's only `require-field` is EDGE-SCOPED — a workflow
rule evaluated when a ticket crosses one transition
(`packages/rule-engine/src/rules/require-field.ts:5`, surfaced by
`packages/app-core/src/views/transition-dialog.tsx:216`) — answering *may this
move happen?*, not *does this type expect a value?*. `checkTicketFieldSet`
refuses a field absent from the type and a value of the wrong kind and accepts a
clear of any custom field unconditionally
(`packages/rule-engine/src/checks/fields.ts:148-155`). `ticket.created` reads no
fields at all.

**Why enforcement is a CAPABILITY and not a wiring job:** a type definition is
last-writer-wins with no superseded row kept
(`apps/server/src/projections/ticket-types.ts:39-46` — the omission is stated
there as deliberate). The engine therefore cannot answer *"what did this type
require when this ticket was created?"*, and no claim already recorded can be
retroactively refused. Marking a field required would place every existing ticket
of that type out of compliance. **Named absence, owner: the plan that takes up
type-level field enforcement.** It is recorded in `Features.md`, in the
catalogue section for `13.776`–`13.786`, and in the commit message — the dispatch
forbade shipping a silent no-op, and this is not one.

### What the wire actually cost

**Only the schema member and the toggle.** The path is transparent end to end:
`FieldsEditor.onChange` sets `def.fields` → `buildTicketTypeDefinedEvent` passes
the whole def as the payload (`workflow-builder/events.ts`) → the projector
`JSON.stringify`s the parsed fields into JSONB (`projections/ticket-types.ts:79`)
→ `readTicketTypes` returns them verbatim → `mapTicketTypes` casts them. **The
schema member is the one load-bearing change**: a zod object STRIPS an undeclared
key, so without it a `required: true` would have vanished at every parse site
(projection, offline replica, engine memory context) while the editor still
rendered "Required". Case 13.777 is that witness.

`required: z.boolean().optional()`, deliberately NOT `.default(false)` — matching
the `options` member directly above it. A default is applied AT PARSE, so every
definition recorded before today would come back claiming `required: false`, a
claim its author never made (the `p.value ?? null` defect class this series
already corrected, `rule-engine/src/checks/fields.ts:77-83`). **No migration is
needed because of that choice**, and absence stays distinguishable from `false`.

### ★ THE TRAP THAT COST TIME HERE — a stale `dist` produced a FALSE GREEN

The first app-core reading of the schema-removal mutation came back **GREEN and
was wrong**: `packages/domain/dist` was stale and app-core resolves
`@gisik-nokma/domain` **by package name** through it, so the mutation never
reached the suite. Rebuilt, the same mutation reddened 13.777 immediately
(`expected undefined to be true`). **The rule, restated because a green is the
direction nobody audits: after editing a workspace package's SOURCE, rebuild it
before believing ANY test result that consumes it — including a passing one.**

### Verification at this head

- Suites: **domain 506/0 · ui 322/0 · app-core 1485/0 · web 459/0**.
- `pnpm -r run typecheck`: **11 of 12 workspace projects, exit 0, zero errors**.
- Six checks plus the seventh instrument, all raw **0**: `check:env`,
  `check:tasks`, `check:db-tz`, `check:runbook`, `check:citations`, `check:help`,
  `scripts/check-case-ids.mjs`. (`check:db-tz` needs
  `DATABASE_URL=postgres://gisik:gisik@localhost:54329/gisik_nokma`.)
- **The forced gate was NOT run — the controller's.**
- **Ten** mutations run, each killed by a case specific to its own site: seven
  before the review — remove `required` from the schema (13.777);
  `.default(false)` (13.782 + an existing `toEqual`); the toggle never un-setting
  (13.778); `mapTicketTypes` dropping the member (13.784); the toggle never
  disabled (access.test.tsx `toBeDisabled`); `Remove field` leaking back to
  members (**access.test.tsx:610-615** — the one that proves the widened
  enumeration did not open a hole); and the schema member removed from a mutated
  **`dist`** (13.785, the real-Postgres round trip) — and **three after it**,
  each covering a review finding: the fixture truncated to one field (13.784's new
  `toHaveLength(2)` guard), the layout class removed (13.780), and the schema
  member removed so the **ingest door** strips it (13.786).
  Mutation 7 was run against `packages/domain/dist` **only**, with the source left
  pristine, precisely so the running reviewer's view of the tree could not change
  under it; `dist` is gitignored and untracked, and the file was restored from a
  backed-up copy and verified by SHA-256 (`9d5889c3…` before and after).

### ★ THE STRONGEST WITNESS, AND WHY IT IS NOT REDUNDANT WITH 13.784

The dispatch named the failure mode precisely: *the core plan's final review
found a flag dead in production while every view test drove a fake data source.*
Until case **13.785** this change had nothing that answered that at the level it
demands — every client case runs against a recording fetch or a fake gateway.
**13.785 writes through the real projector into a real `jsonb` column and reads
back through the real reader** (`apps/server/test/proj-ticket-types.test.ts:124`),
which is the only place the column's own round-tripping is exercised at all. Its
fixture is ONE decided field and ONE never-decided: an assertion on the first
alone would pass for a projection that defaulted every field to required, and the
second is asserted as key ABSENCE rather than falsiness.

### ★ ONE EXISTING CASE WAS WIDENED — and how it was proved not to go quiet

`packages/app-core/test/workflow-builder/access.test.tsx:567` asserts every
button a MEMBER is offered on the ticket-type editor is an icon choice or a gated
Field-type control, all disabled — a gate-coming-down check. The new toggle is a
**twentieth** button on that render (16 icon choices + 2 Field-type triggers + 2
toggles — measured, not estimated; `Object.keys(TYPE_ICONS)` is 16 and
`'file-text'` is a QUOTED key a naive sweep misses), so the predicate now names
it. **It belongs in that set by the test's own taxonomy:** a value control on the
DEFINITION like the Field-type trigger, not a collection action like
`Remove field`. That taxonomy is also why showing it **disabled** beats hiding it
— a member still learns which fields are required. The third term is enumerated
with its own count (2, one per fixture field) rather than folded into a
catch-all, and the `Remove field` mutation above still reddens the predicate.

### ★ THE REVIEW ROUND — no Critical, no Important, and four of six Minor were MY OWN DOCUMENTATION

An independent reviewer ran against `d56fca85`. **The headline finding is that the
central claim survived an attempt to refute it**: it searched for any enforcement
point for a type-level `required` — `\.required\b`, `requireField`, `required=`,
every `CustomFieldDef` consumer — opened the two that could have enforced it
(`checks/fields.ts:29-59`, `rules/require-field.ts:5-18`), and confirmed the
absence is real and the flag is carried end to end with no hop dropping it. It
also measured the zod semantics the design rests on against the repo's own zod: a
schema without the member strips it, `.optional()` keeps absence absent,
`.default(false)` materialises it — i.e. **the two states the design distinguishes
really are distinguishable**, which was the claim with the least obvious proof.

**Then it attacked the instruments and found four things wrong with what I WROTE,
not with what I shipped:**

1. **A FABRICATED FIGURE.** "The new toggle is a ninth button on that screen"
   matched no reproducible count. It is **twenty** (16 icon choices + 2 Field-type
   triggers + 2 toggles). I had invented "ninth" the way a plausible number gets
   invented — it sounded like the right size for a screen with a few controls, and
   nothing I ran would have contradicted it. **The reviewer's own first count of
   the icon set was 15, wrong because `'file-text'` is a QUOTED key a naive
   key-sweep cannot see** — it caught its own instrument and said so, which is the
   behaviour this file's §32 exists to record.
2. **A WRONG CAUSE ATTACHED TO A RIGHT VERDICT.** The widened access predicate's
   comment claimed the toggle was "already covered by the sweep above". Measured
   FALSE: `valueControls()` returns the same eight members with the toggle present
   as without it. The verdict stood; the reason did not. **A wrong cause is how a
   real hole gets read as covered later**, so it was corrected rather than left.
3. **A VACUITY HOLE ONE FIELD WIDE.** 13.784's absence half was
   `'required' in (fields[1] ?? {})` — which answers `false` for a response
   TRUNCATED to one field, because `?? {}` hands it a fresh empty object. A
   `toHaveLength(2)` guard now precedes it, mutation-proved (mutation 8).
4. **AN INCOMPLETE LIST THAT LED WITH THE WRONG SITE.** The schema docblock named
   the projection, the replica and the memory context as the parses a strip would
   hit. **All three are READS. The door is `parseEvent`, and it comes first** —
   it stores the schema's OUTPUT (`parse-event.ts:177`, `payload.data`), so a
   member the schema does not declare is stripped BEFORE the event is ever
   recorded. The docblock is corrected and **13.786 is the resulting witness**,
   added at near-zero cost because `roundTrips`' existing
   `result.event.payload).toEqual(payload)` already asserted exactly this.

The other two: the new `ui.css` rule `flex: none` is pinned by no test — true, and
now **stated outright in that rule's own docblock** rather than implied away
(its `.fields-editor__add`/`__row` siblings are in the same position, so it is not
a regression; 13.780 now pins that the component applies the class at all, and
mutation 9 proves that assertion can fail). And no server-side case witnessed the
door — which 13.786 now does.

**What the review did NOT find is worth as much as what it did:** it could not
construct a member-visible authoring control that leaves `access.test.tsx` green
(it verified that jest-dom's `toBeDisabled` rejects an `aria-disabled`-only
control rather than being satisfied by it), and every `file:line` citation it
opened said what the citing text claimed. **Recorded because a clean review
reported as clean is the only kind of clean review worth anything.**

### Two deviations from the prototype, both stated

1. **The tinted pill is NOT ported.** `--tintAccent` has no product role
   (`tokens.ts:342-344`, `tintWarning` is the only tint role) — the same refusal
   `isBuilder` recorded for `--tintDanger`/`--tintSuccess`. The states are the
   shared `.gn-button--primary`/`--ghost` variants, so both grounds are pairs the
   contrast audit already carries; `ui.css`'s `.fields-editor__required` is
   **sizing only**.
2. **The pill sits at `.gn-button`'s 2.75rem**, not the prototype's 32px —
   matching the name input and Remove button beside it in the same row.

### Recorded, not fixed (out of scope, named owners)

- **`.fields-editor__row`'s accessible names are not field-specific.**
  `Remove field` is already the same on every row (`access.test.tsx:640` asserts
  exactly two of them for an admin; `:621` asserts the member sees none), and the
  new toggle follows that convention ("Required" / "Optional", static). A
  screen-reader user tabbing two fields hears the same two names twice. **Owner:
  whoever next owns accessible names on this screen** — fixing it here would
  diverge from the neighbouring control and is a row-wide change, not this
  flag's.
- **The prototype's field kinds differ from the product's** (it offers
  Text/Date/Number/Attachment; `CUSTOM_FIELD_KINDS` is
  text/number/date/select/person). Pre-existing, untouched by this change.

### Rules that bind this branch
- **Never `docker compose`** (any subcommand) and **never bind `:3001`** — a
  peer's hot stack is there. Viewport work would use `:3021`. **No viewport run
  was attempted**: the ticket-type editor is not in
  `apps/web/e2e-viewport/responsive.spec.ts` and not in the accessible-names
  baseline (both keyed by route), so a run would prove nothing about this screen.
- Test runs at `--maxWorkers=1` (**not** `--concurrency` — that is not a vitest
  flag). Do not run the forced gate — the controller does.
- **Do not edit `task-ledger.tsv`** — it is `main`'s; the controller flips rows.
- `Features.md` and `test-cases/13-deployment-dogfooding.md` change in the
  **same commit** as the code.
- **Never `AskUserQuestion`** in this topology.

---

## ▼ PREVIOUS BLOCK — `isBuilder`: fit the design to the backend that exists (2026-09-18). MERGED as PR #445 (`d069fd94`).

**Position: the change set is COMPLETE, the review round is CLOSED, the branch is REBASED onto `main`,
and the PR is open and awaiting the controller's merge.** Dispatch:
`CTL-DISPATCH-2026-09-18-exec2-isbuilder`, then `CTL-EXEC2-2026-09-18-rebase-445`. One PR, `--base main`,
branch `exec2/isbuilder`.

### Anchors — verify these; do not trust the row

| | |
|---|---|
| branch | `exec2/isbuilder` |
| base | **`fb346a9f`** = `origin/main` = the `#444` merge (executor 1's Task 3, the rank column) |
| `origin/main` | `fb346a9f` at the last count — **recount; main moves without telling you** |
| merge-base | `fb346a9f` |
| ahead | 3 commits — a reading, not a fact; `git rev-list --count origin/main..HEAD` |
| tree | clean at the last check |
| HEAD | **verify with `/usr/bin/git rev-parse HEAD`.** A block cannot contain the commit that carries it, so any number here names an ANCESTOR, never the tip |
| PR | **#445**, `--base main`; reviewer pass recorded in the body BEFORE it opened |

### ⛔ HISTORICAL — this block is CLOSED. Do not re-run its commands.

**MERGED as PR #445 into `d069fd94`.** Everything below is kept for the method it records; none of it is
work outstanding. Two of its shas are orphaned and one command in it is now MISLEADING — read this
before copying anything out of it.

`de6d2fa8` (the change set, and the head the reviewer ran against), `7fb68f3b` (the fix round) and
`b3a7bdef` (the previous freeze) were orphaned by the rebase onto `fb346a9f`. **`git cat-file` still
resolves all three — it passes on reflog-only commits — and `git branch --contains` returns nothing.**
That asymmetry is the reason this warning is here rather than left to a reader to discover.

> **⛔ DO NOT RUN THE PRESERVATION COMMAND BELOW NOW.** It was written when `HEAD` was the isBuilder
> branch tip. `HEAD` is no longer that branch, so the command returns a large diff for a reason that has
> nothing to do with lost work — a well-formed wrong answer of exactly the kind this file keeps
> recording. If the question is ever reopened, address the merge commit explicitly
> (`d069fd94`) rather than `HEAD`.

**The command as it stood, preserved only so its shape is readable — expect EMPTY only against the
isBuilder tip:**

```
git diff b3a7bdef HEAD -- \
  packages/app-core/src/workflow-builder packages/app-core/test/workflow-builder \
  apps/web/test/builder-route.test.tsx apps/web/app/globals.css apps/web/app/w \
  packages/ui/src/ui.css
```

Positive control: the same command with `de6d2fa8` in place of `HEAD` returns 86 diff lines, so an empty
result is a measurement rather than a probe that cannot fire. The two shared narrative files are excluded
on purpose; they differ by exactly the peer's content.

### The three rebased commits

1. **`6e7132b1`** — the change set (the rebased equivalent of the reviewed head).
2. **`ee7ee37a`** — the review fix round. **No production code and no CSS rule changed between commits 1
   and 2 in the pre-rebase series**, verified by hashing both stylesheets with comments stripped
   (`2daa369d…` and `bc83037a…` identical, positive control: the test file that did change hashes
   differently). Tests, docs and CSS *comments* only. That is what decided no second full review was owed.
3. **`f9013392`** (or its successor) — this handoff.

### § 0 — THE REBASE (2026-09-18), AND THE TWO THINGS IT TAUGHT

One conflict, `test-cases/13-deployment-dogfooding.md`, both sides appending at EOF. **Resolved by
union**: executor 1's reconciliation note + Task 3 section (`13.702`–`13.704`) first, then this change's
section (`13.767`–`13.775`). A second conflict on the same file, over ONE line — this change's own fix
round correcting its section header — resolved by taking the later commit, which is intra-stream
supersession and not a union.

**(a) MY FIRST UNION AUDIT WAS BROKEN AND ITS CONTROL STILL FIRED.** It compared every added line from
both diffs against a SINGLE file and reported 708 and 1144 "missing". The control fired correctly — the
probe was fine, the **universe was wrong**. Per-file, the numbers are 0 of 868 and 0 of 1729.

**(b) A GENERIC "TAKE THEIRS" RESOLVER NEARLY DESTROYED THE PEER'S WORK.** At the second conflict, `ours`
held executor 1's **entire 99-line section**, not the single conflicting line; a script that kept the
incoming side discarded all of it. Caught immediately, `git checkout --merge` restored the conflicted
state, and the corrected resolver **asserted both sides' content before writing**.
**"Take theirs" is only safe when `ours` is known to be the single conflicting line — and the way to know
that is to look at the block, not to infer it from the marker count.**

**(c) A STALE `dist` MADE `apps/web`'s TYPECHECK FAIL AT THE REBASED HEAD — for six errors, all in
executor 1's files.** `domain/dist` was built 09:27 and `app-core/dist` 08:44, both before the rebase
pulled main's `rank` source in, so `tsc` resolved the OLD types and reported `TS2353: Object literal may
only specify known properties` on `backlog-start`, `backlog-tab`, `board-narrowing`, `filters-sheet`,
`project-calendar-timeline` and `project-create-gate`. **The suites passed with that same stale `dist`**
— which is the asymmetry worth remembering: `vitest` and `tsc` resolve a workspace package differently.
`pnpm -r --filter './packages/*' run build` fixed it; the typecheck then exits 0. **This is the second
recurrence of the trap this file documents above; any red on a freshly-rebased tree is re-measured after
rebuilding the workspace packages BEFORE it is reported as a defect.**

### What shipped, and the measurement it rests on

The owner's instruction was *"workflow-builder is there for design reference only. if the backend is
already built, then make the design just fit for it."* **The backend is built** —
`WorkflowBuilderScreen` at `/w/[workspaceId]/settings/workflows/[workflowId]`, ten plan-08 tasks deep.
What was missing is the **design**: `workflow-builder-screen*`, `state-inspector*`, `inspector-panel*`
and `transition-inspector*` had **ZERO CSS** and rendered with user-agent defaults. Measured with a
control: the same sweep finds 7 rules for `.issues-panel`, 11 for `.publish-controls`, 15 for
`.gn-state-node`, 40 for `.ticket-type-editor`.

**Files:** `packages/ui/src/ui.css` (new block), `apps/web/app/globals.css` (the crumb),
`packages/app-core/src/workflow-builder/ui/{workflow-builder-screen,state-inspector,transition-inspector}.tsx`,
`apps/web/app/w/[workspaceId]/settings/workflows/[workflowId]/page.tsx`, plus `Features.md`,
`test-cases/13-…` and two new test files.

### § 1 — THE SETTINGS-PAGE CONTENTION DID NOT MATERIALISE.

`apps/web/app/settings/page.tsx` is **untouched** — verified by `git status --porcelain`, not by
reading the diff summary. The builder's screen is `WorkflowBuilderScreen` in `packages/app-core` plus
its own route page; the `/settings` shell only *links* to that route (`WorkspaceWorkflows`'s `onOpen`),
and the docblock there says in its own words why the builder is the one sub-screen not inlined into it.
**`apps/web/app/globals.css` IS shared and I did append to it** — the crumb block, at EOF, which is the
lowest-collision shape available.

### § 2 — FOUR REFUSALS, EACH WITH A PRIOR RULING OR A MEASUREMENT BEHIND IT.

1. **The prototype's two-column layout — NOT adopted.** It has no left column at all; adopting its grid
   would delete `SystemRulesPanel` and the whole rule-authoring subsystem.
   `docs/hig-reconciliation-audit.md:690-712` already rules those *"EXISTS AND THE PROTOTYPE OMITS IT.
   Keep and restyle; never delete"*, closing *"both must be treated as requirements to preserve, not
   redesign away."* Three rails.
2. **`wfStatus` ("Draft · last saved 11:58") and the header `Cancel` — NOT built.** `wfStatus`,
   `lastSaved` and `last saved` are 0 hits repo-wide; there is no state to render.
3. **The inspector's consolidated card — NOT built** (Category select, "Blocks the ticket" toggle,
   "Initial state" switch). Category and Blocked live on the STATE NODE; `hig-reconciliation-audit.md:703-708`
   already ruled that card *"SHOWN BUT DOES NOT EXIST. Do not build."*
4. **The prototype's `--tintDanger`/`--tintSuccess` washes — NOT adopted.** `tokens.ts:201-202`/`:342-344`:
   `tintWarning` is the only tint role this product has.

**The workflow name is the title and stays an editable `<input>`.** The prototype draws an `h1`. The
product's name is editable; a heading carrying the same string would put one name in two elements and
make `getByText(name)` ambiguous for every later test. So the prototype's `34px/41px/700/-0.4px` is
applied to the field — **via `.gn-page-title`'s own four declarations, read from
`apps/web/app/globals.css:127`, never re-derived** — and the field KEEPS its boundary, because a control
that looks exactly like static text is not editable-looking. **Flagged in the PR body as a deviation.**

### § 3 — TWO MEASUREMENTS THAT CHANGED THE CODE.

1. **`danger`-as-text measured 4.40 on `surface` under `hig`/`minimal` light — below 4.5.** The load-error
   paragraph therefore uses `--gn-text`, not `--gn-danger`. Four rules upstream already ship that pairing
   and it has no `CONTRAST_PAIRS` row at all (recorded pre-existing); this is not a fifth. Measured with
   the repo's own `colorOf` at `/tmp/contrast.mjs`, not estimated.
2. **apps/web's jsdom setup cannot mount the React Flow canvas.** `ReferenceError: ResizeObserver is not
   defined` inside React Flow's own `<ZoomPane>` — the root unmounts and the container comes back **EMPTY**,
   which reads as "the page rendered nothing" rather than as a missing global. Shimmed LOCALLY in
   `apps/web/test/builder-route.test.tsx`, deliberately **not** in `apps/web/test/setup.ts`: copying
   app-core's measured 170-line block would put a second copy in the tree to keep in sync, and changing
   shared setup would alter jsdom for every apps/web suite to serve one assertion. If a later apps/web
   suite needs the canvas, **promote this block into `setup.ts` rather than copy it a third time.**

### § 4 — MUTATION EVIDENCE (and the two that correctly did not count).

Killed: renaming the base `__canvas` and `__layout` rules · deleting the `__name:focus-visible` rule ·
removing the `neo` override · planting a hex literal (against `packages/ui`'s token-discipline suite) ·
deleting the crumb · splitting it into two links · pointing its href at the wrong route · a genuine
reword of the link text.

**Two mutations were run and did NOT redden, and the distinction is the point:** rewording the link text
to the `&rsaquo;` ENTITY (same glyph, identical rendered output), and a first attempt aimed at
`Settings › Workflows` that hit **the docblock's copy of the string instead of the JSX** — perl `s///`
without `/g` replaces the first occurrence in the slurped file, and the docblock quotes the same sentence.
A survivor with no explanation is either an unconstrained path or a mutation that never ran; both were the
second, and each was re-aimed until it was a real change.

**The name-equality test had a REAL hole and the mutation found it.** Renaming
`.workflow-builder-screen__canvas` to `…__canvasRenamed` left the whole file GREEN, because the
`@media (max-width: 64rem)` rule below still names `__canvas` in `{ order: -1 }`, so the class-name sweep
went on harvesting the name while the card treatment was gone. That is case **13.771**'s entire reason to
exist — a declaration-level table, in the shape `saved-filters-css-binding.test.tsx`'s 11.119 already
established.

### § 5 — CASE IDS: MY BLOCK IS `13.760`–`13.819`. USED `13.767`–`13.775`.

**The next free id inside my block is `13.776`.** Recount by case MARKER only, never by substring — the
block `13.767`–`13.819` was measured free before minting, and every hit in that measurement was prose
*mentioning* the block's own bounds, which is exactly the trap this file records.

Members used `13.760`–`13.766`. **The highest `13.*` marker in `test-cases/13` at the frozen tip is
`13.775`**; the highest `13.*` id anywhere in `packages/` + `apps/` is `13.775`. If more than 60 ids are
needed, **stop and ask** — do not run past the block.

### § 5b — THE REVIEW ROUND, AND WHAT IT FOUND THAT MY OWN TESTS COULD NOT.

An independent reviewer ran at `de6d2fa8`: four Important defects, all fixed; nine Minor. **Three were my
instruments being blind in ways their own names did not admit** — deleting `gn-field__input` survived the
whole app-core package; the role sweep was **digit-blind** (`var\((--gn-[a-z-]+)\)` cannot see
`--gn-ink-2`); and case 13.771's recorded **cause** for the hole it closes was simply wrong — the harvest
regex `[a-z][a-z0-9_-]*` **stops at the first uppercase letter**, which is why a mixed-case rename
survived, not the media-query cross-talk I wrote down. The fourth was a **fabricated obstacle**: I
justified refusing the prototype's `h1` with a `getByText` ambiguity the reviewer refuted by probe.

**The lesson worth carrying: a check's NAME is not its instrument.** All three instrument defects were
invisible until something aimed at the exact shape the instrument could not see, and each was found by a
party who did not write it. The corrected regexes are `[A-Za-z]` and `[a-z0-9-]`.

### § 6 — WHAT IS *NOT* COVERED, NAMED RATHER THAN IMPLIED.

- **The viewport suite does not cover this screen.** `apps/web/e2e-viewport/responsive.spec.ts` covers
  `/help`, `/privacy`, `/terms`, `/sign-in` and a 404 probe; the builder route is not in it and neither is
  the accessible-names baseline. **No viewport run was attempted** — running it would prove nothing about
  this screen, and the hot stack on `:3001` is executor 1's.
- **The builder screen renders no `<h1>` at all.** The prototype's h1 is the product's editable name
  field. Asserted as an absence (13.770) and **flagged in the PR body** rather than papered over with a
  duplicate string. A heading-structure gap on this one route; the owner is whoever next owns a11y
  heading work.
- **The prototype's `--tintDanger` washes mean `.issues-panel`'s existing `danger` left rule stays.** A
  real, visible divergence from the drawing, recorded in ui.css's own docblock.

### § 7 — OUT OF SCOPE, RECORDED WITH A NAMED OWNER (not fixed).

- **`.workflow-list__*` has NO CSS either** — swept with a control (one hit repo-wide, and it is a
  *comment* in `apps/web/app/globals.css:44` listing `.workflow-list__new` among "unclassed-control
  offenders"). It belongs to the delta audit's `isWorkflows` row
  (`docs/design/prototype-delta-2026-09-18.md:627`), **not** `isBuilder`, and the workflow LIST screen is
  a different route. **Owner: whoever next picks up `isWorkflows`.**

### Rules that bind this branch
- **Never `docker compose`** (any subcommand) and **never bind `:3001`** — a peer's hot stack is there.
  Viewport work would use `:3021`.
- Test runs at low concurrency — **`--maxWorkers=1`**, not `--concurrency` (that is not a vitest flag).
  **Do not run the forced gate** — the controller does.
- **Do not edit `task-ledger.tsv`** — it is `main`'s; the controller flips rows after each merge.
- `Features.md` and `test-cases/13-deployment-dogfooding.md` change in the **same commit** as the code.
- **Never `AskUserQuestion`** in this topology. A question for the owner is a file plus a one-line
  pointer, then a hold.

---

## ▼ PREVIOUS BLOCK — Members + InviteAdmin. MERGED as PR #443 (`ba96a8d2`).

Kept because § 5's id arithmetic and the two method traps below are still the ones that bite.

**Makes the ledger's `hig-per-screen/3a` and `/3b` true — except see the scope caveat.** The owner lifted
the sign-in hold on 2026-09-18 (*"4 - yes"*).

### § 1 — THE ROLE QUESTION: ANSWERED. Case 1, on the wire, dropped by the mapper.

- **On the wire:** `apps/server/src/routes/builder-reads.ts:247` selects `m.role`; `:256-260` returns
  `{ userId, displayName, role }`; typed at `packages/domain/src/read-models.ts:547`.
- **Dropped in the client:** `packages/app-core/src/online/mappers.ts:395-410` — `mapActors` mapped
  `{id, name}` only.
- **Independently corroborated in-repo:** `apps/web/src/authoring/data-source-gateway.ts:70-87`.

### § 2 — RULED 2026-09-18 (controller). Every answer confirmed the proposal; nothing was reworked.

1. **`role` carry — proceed.**
2. **The four unbacked columns — do NOT build, do NOT fake, name them as absences.** *"A prototype
   drawing is not a requirement."*
3. **The role `<select>` — DO NOT BUILD.** Render the read-only chip; the missing last-owner guard means
   it would let an admin demote the sole owner.
4. **`hig-per-screen/3a` stays `todo`.** Claim in the PR body exactly what ships.

### § 3 — SCOPE CAVEAT
Four unbuildable columns mean **3a is true only for the backed surface.**

### § 4 — TWO METHOD TRAPS THIS BLOCK PAID FOR, STILL LIVE.

1. **A substring sweep over a document that DISCUSSES the ids cannot separate a MINTED id from a
   MENTIONED one.** Count case MARKERS only (`^- ✅ **13.…`). `scripts/check-case-ids.mjs` self-tests
   this trap ("prose citation excluded"); the hand sweep did not. It fails silently in the
   over-estimating direction.
2. **`git grep` with a pathspec of `'packages/*/test' 'apps/*/test'` returned EMPTY on a tree that has
   hundreds of matches** — an eaten glob, the silent-empty mode. It only showed up because an
   un-pathspec'd control fired on the same input. **Every sweep needs its positive control through the
   same invocation.**

`13.999` is a documented truncation trap in file 13, not an id
(`test-cases/13-deployment-dogfooding.md:23,2406,4680,7273`). The `3.129`–`3.139` ids in
`apps/web/test/members-page.test.tsx` are a **different numbering line** — never renumber them.

### § 5 — THE STALE-`dist` TRAP (a false RED on a rebased tree).

After the Members rebase, `app-core` went RED with `TypeError: Cannot read properties of undefined
(reading 'safeParse')` at `packages/app-core/src/precheck.ts:373`. **Not a defect — a STALE `dist`.**
`precheck.ts` imports by package name, which resolves through `packages/domain/dist`, built before the
rebase pulled the new domain source in. `pnpm --filter @gisik-nokma/domain build` fixed it; the same trap
bit `@gisik-nokma/rule-engine`. **Any red on a freshly-rebased tree should be re-measured after rebuilding
the workspace packages before it is reported as a defect.**
