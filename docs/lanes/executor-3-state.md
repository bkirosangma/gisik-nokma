# executor 3 — state

**This file is executor 3's handoff. It is the only handoff this lane writes.** Executor 1's is
`docs/lanes/executor-state.md`, executor 2's is `docs/lanes/executor-2-state.md`; two writers on one
handoff conflict on every merge.

## ▲ TOP BLOCK — **THE VISIBILITY SECTION'S STYLING: THE GAP MEASURED FIRST, AND IT IS TOTAL.** (2026-09-21, executor 3)

### § 0 — WHERE TO FIND IT

- **Branch `exec3/visibility-styling`**, cut from **`origin/main = 534c450b`**. `git merge-base HEAD
  origin/main` equals `534c450b` exactly as of the handoff's own commit.
- ⚠ **THE WINDOW: this file adds itself to its own figures.** Every count below is measured at
  `534c450b`, the pre-change head — so a restart that measures one commit more than § 2 says is seeing
  **this file's own landing**, not a foreign push. `git log --oneline origin/main..HEAD` and match the
  subjects before concluding anything.
- **Toolchain for this lane:** `export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH"`; pnpm only;
  `vitest run`, never watch. **Never `docker compose`** (the dev stack is mounted from executor 1's
  worktree and is live under the owner), **never bind :3001** (executor 1) or **:3021** (executor 2) —
  **this lane uses :3031** for viewport work. `--concurrency=1` where the runner allows it, one subagent
  at a time, and **never pipe a run into `| head`** — `| tail -N` or a file.
- **This lane runs on the deepseek backend.** `/model` is never run; the brief's model/effort tiers are
  void here and a review step is never skipped because its named tier does not exist.

### § 1 — THE TASK, AND THE MEASUREMENT THAT PRECEDES IT

**Dispatch: controller, 2026-09-21 — the sheet's `Visibility` section, styled to the prototype's ROW.
Queue item 7.** Item 4a already served the mode (`#600` → `ffb9389a`): the mapper reads the
`ticketState` visibility key the wire always carried, and `VisibilityEditor`
(`packages/app-core/src/views/visibility-editor.tsx`) renders it. **Item 7 is that section's STYLING.
It is NOT the mode (done) and NOT the roster (cut).**

**⛔ THE RULING THAT BOUNDS IT — owner, verbatim: `visibility` — (a) BUILD, (b) KEEP THE RULING.**
**(b) KEEPS THE EXPLICIT AUDIENCE ROSTER CUT:** `apps/server/src/routes/tickets.ts:115-118` refuses to
serve `own_user_ids` / `resolved_user_ids` — *"an explicit audience ROSTER, a disclosure no plan
authorized"* (⚠ **the dispatch cites `:111-114`; the clause is at `:115`, opened and read at
`534c450b`** — a citation is a reading, and this one had rotted by four lines).
**Do not serve it, do not pass it, do not widen a SELECT to reach it.** The prototype DRAWS that roster
(a chip per viewer with a removable `×`, an *"Add someone who can see it…"* picker over
`viewerCandidates`, and a closing sentence about ticket-only access) — **and the product has no data
behind any of it under (b). The chips, the picker and the candidate list are NOT built.**

**⚠ MEASURED BEFORE BUILDING, and this is the whole of § 1.** Every queue row naming this item said
only *"the visibility section styling"*; nobody had measured what the section already matched. Measured
at `534c450b`:

- **THE STYLING GAP IS TOTAL. `gn-visibility*` has ZERO CSS RULES.**
  `git grep -nE '^\s*\.gn-visibility' -- '*.css'` → **0**, against a **positive control in the same
  sweep path** (`.gn-filters__body`) → **3** in `packages/ui/src/ui.css`. The only occurrence of the
  string anywhere in CSS is a **comment** at `packages/ui/src/ui.css:4810` that names
  `.gn-visibility__modes`/`.gn-visibility__people` **hypothetically** — *"the same reset … would need,
  had they not inherited a house rule already; this file has no such rule, so it is stated here"* — i.e.
  a rule written for a *different* class while assuming these would inherit one that does not exist.
  **The section therefore renders as raw user-agent chrome**, which is the identical defect class
  `test-cases/16-remaining-doors.md:15` records for `ticket-type-list__move` (case `16.83`): *"the class
  rendered as raw user-agent chrome for as long as it existed."*
- **What ALREADY matches, and is therefore NOT rebuilt:** the section exists with an `aria-label`, a
  heading, and **eight distinct content states** (mode present; mode absent; restricted-with-no-roster;
  claim present/absent; editable; read-only; lockout warning; refusal). The **mode reaches the section**
  (item 4a, served). The **honest-absence sentences exist** and are the answer § 4 of the dispatch names.
  Nothing here is a functional gap.
- **The four surviving prototype parts, and their current state.** The prototype row is
  `design-system/interactive/desktop.dc.html`, resolved **by content** (the numbers move): the row is
  the `>Visibility</dt>` at **`:1207`**, its `<dd>` at `:1208`, the toggle button at **`:1209`**
  (`{{ visBtnStyle }}` / `{{ visDotStyle }}` / `{{ visLabel }}`, defined `:3781`–`:3786`), the note line
  at **`:1210`** (`{{ visNote }}`, defined `:3782`), the uppercase eyebrow *"Who can see it"* at
  **`:1213`**, the chips at `:1214`–`:1224`, the picker at `:1225`–`:1229`, the closing guest note at
  `:1230`, `</dl>` at `:1234`.

  | prototype part | current state in the product |
  |---|---|
  | toggle button + dot + label (`visBtnStyle`/`visDotStyle`) | **absent** — the standing audience is an unstyled `<p>`; **no dot** exists |
  | note line, 12px `--label2`, `text-wrap:pretty` (`visNote`) | **absent** — the owner note is an unstyled `<p>` |
  | uppercase eyebrow, 12px, `letter-spacing:0.6px` (`:1213`) | partly — a `<h3>` exists with the text, but carries **no** eyebrow treatment |
  | right-aligned column geometry (`rowValueB`) | **absent** |
  | chips / picker / candidates | **CUT by (b). Not built, and not to be built.** |

### § 2 — THE TWO STRUCTURAL DIVERGENCES, RECORDED RATHER THAN BUILT

The sibling parity task's own rule (`test-cases/16-remaining-doors.md:838`; ⚠ **this cited `:9-11`, which is
the id-pattern paragraph and not the rule — a reviewer opened both**) is the one applied here:
***styled differently* is a restyle; *structured differently* is a feature**, and a feature needs a
disclosure the dispatch does not name. Two divergences are therefore **recorded, not fixed** — the
conservative direction, because building them would be inventing scope:

1. **The prototype draws Visibility as a `<dt>/<dd>` ROW inside the sheet's `<dl>`** (between `Type` and
   `</dl>`, `:1207`–`:1234`). **The product mounts `VisibilityEditor` as a standalone `<section>` AFTER
   `</dl>`** — `packages/app-core/src/views/ticket-sheet.tsx:2293` closes the `<dl>` and the editor
   mounts at `:2335`. Moving it into the `<dl>` reshapes the sheet's markup. **NOT DONE.**
   The product's own `<dl>` rows already diverge from the prototype's row treatment:
   `.gn-ticket-sheet__field` is a `8rem 1fr` grid with a muted `dt` (`ui.css:1807`), **not** the
   prototype's `--fill4` background with `8px` end radii (`rowLabelB`/`rowValueB`, `:3755-3756`).
2. **The prototype's control is a BINARY toggle** (`toggleRestricted`); **the product's is a 4-mode
   radio group** over `workspace` / `project` / `explicit` / `inherit` (`VISIBILITY_MODES`). **A binary
   toggle cannot express four modes**, so replacing the radios would delete the ability to set three of
   them — a feature, not a restyle. **The radios stay.** ⚠ The consequence for the transcription is
   stated rather than glossed: the prototype's toggle is **styled as a pill with a dot**, and the
   product's equivalent *display* — the standing-audience line — takes that treatment; the product's
   *control* keeps the fieldset shape, styled to the house idiom.

### § 3 — WHAT SHIPPED

**Branch `exec3/visibility-styling`, cut from `origin/main = 534c450b`.**

**⚠ CORRECTED — THIS SENTENCE READ: *"`origin/main` has NOT moved since, so this head IS the landing
tree and no fold was needed (`behind=0`, `merge-base == origin/main`)."* IT WAS TRUE WHEN WRITTEN AND
FALSE BY THE TIME THE REVIEWER READ IT, AND THE REVIEWER CAUGHT IT RATHER THAN THE AUTHOR.** Measured:
at `a959289d`'s commit time (`23:15:12`) the sentence held; `origin/main` moved to `52a04b8c` at
`23:16:55` — **103 seconds later** — and to `fef20170` at `23:25:37`, i.e. **7 behind**. A peer lane had
already folded main for this exact reason. **(The direction this fails in is the one nothing audits: the
`git log --oneline origin/main..HEAD` check § 0 prescribes prints only this lane's own commits and is
structurally BLIND to being BEHIND.)** The fold is done below and the head-state figures below are
recounted after it.

The commits, **by SUBJECT rather than by count** — a count is a reading that expires the moment this file
lands:

1. **`0baad90b` — this handoff**, opened with the gap measured before anything was built.
2. **`a959289d` — the styling**, its cases, and the catalogue. Eight files: `packages/ui/src/ui.css`,
   `packages/ui/test/components.test.tsx`, `packages/app-core/src/views/visibility-editor.tsx`,
   `packages/app-core/test/views/visibility-editor.test.tsx`, `test-cases/17-open-work.md` (NEW — §17
   opened), `test-cases/16-remaining-doors.md`, `Features.md`, and
   `scripts/fixtures/check-case-citations-baseline.json`.

**The change, in one paragraph.** `.gn-visibility*` gained the CSS rules it never had: the prototype row's
right-aligned value column, its uppercase eyebrow and notes at **the row's own 12px**, and the control
block's own `align-self:flex-start` opt-out. The standing audience became the prototype's dot-and-pill,
with the dot toned by the **MODE** and never the roster. One wrapper element was added around the control
block to carry the geometry; the dot span is the only other markup change.

**The mutation battery — EIGHT mutations, all eight killed AT THEIR OWN SITE, all restored, and the run
count asserted on every one.** M1 delete the section rule → `17.001`; M2 `0.75rem`→`0.8125rem` the
"harmonise" edit → `17.002` alone; M3 drop the left opt-out → `17.003` alone; M4 swap the dot's default
tone → `17.004`; M5 delete the restricted modifier → `17.004`; M6 append a duplicate rule at EOF →
`17.005` alone; M7 re-key the dot onto `userIds` → `17.004` alone; M8 add a `<select>` the ruling cut →
`17.006` alone. (M1 also reddens `17.005`, which is expected and explained: deleting the rule leaves the
declared-exactly-once check with nothing to count.)

⚠ **TWO DEFECTS WERE FOUND IN THE BATTERY HARNESS ITSELF, BOTH BEFORE IT WAS TRUSTED, AND BOTH ARE THE
SAME CLASS THIS FILE WARNS ABOUT.**

- **The runner's summary has THREE shapes, not two.** Under a name filter vitest prints
  `Tests  1 failed | 42 skipped (43)` — not `failed | passed`. The first parser knew only the two
  unfiltered shapes, so it called a genuine kill *unproven*. **It failed SAFE** (refusing to score a kill
  it could not read, rather than printing SURVIVOR), which is the right direction, but it was still a
  parser bug.
- **The first site-extraction was a check that could not fail.** It ran `findall(17\.\d{3})` over the
  whole FAIL line — and vitest's FAIL line carries the DESCRIBE TITLE, which here is `(17.001–17.005)`.
  So **every** mutation reported `killed=['17.001','17.005']` as an artifact of the title, and the
  "killed at its own site" assertion was satisfiable by the title for two of the six cases regardless of
  what actually failed. Fixed by reading the id from the test-name segment only — the same discipline
  this repo's own guards use, an id counted where it is a DECLARATION and not anywhere it appears.

**Counts, recounted at the head rather than inherited:** `check-case-ids` **2588 unique, highest
`17.006`** — up from **2582**, i.e. **exactly the six added**. `check-case-citations` reports
`17-open-work.md: 6 cited / 0 uncited / 6 total`, and its baseline gained the entry the ratchet requires.

⚠ **A BRIEF-LEVEL GOTCHA WORTH CARRYING FORWARD: `--concurrency=1` IS A JEST FLAG, NOT A VITEST ONE.**
`vitest run --concurrency=1` exits with `CACError: Unknown option '--concurrency'` **before running a
single test**, while a wrapper can still report a non-zero exit — i.e. it is indistinguishable from a
red suite to anyone reading only the exit code. **The vitest spelling is `--no-file-parallelism`.** This
lane hit it on its first run.

⚠ **A SECOND GOTCHA: `rule()` THROWS on a GROUPED selector.** `packages/ui/test/components.test.tsx`'s
`rule()` matches `selector\s*\{`, and a grouped rule's first member is followed by a comma. That is the
safe direction (a throw, not a wrong answer), and `17.002` and `17.003` use a local `groupedRule` for the
two grouped rules (the note/absence sentences, and the two fieldsets). **A case rewritten to route around
the throw would silently stop asserting the thing it names.**

### § 3a — THE PRE-CHECK GATE IS RED UNDER LOAD, AND THE FOUR FAILURES ARE NOT THIS CHANGE'S

**`pnpm turbo run build test typecheck` at this head: 27 successful / 33 total, `GATE_EXIT=1`.** The red
is **NOT** this change, and that is measured rather than argued — **every failing file passes in isolation
on the SAME tree with the SAME dist:**

| failing task | gate | in isolation |
|---|---|---|
| `app-core` — `test/ticket-types/ticket-types.test.tsx` (case 13.926) | 1 failed, **45.1 s** | **51 passed / 51** |
| `app-core` — `test/workflow-builder/access.test.tsx` | 1 failed, **16.6 s** | **23 passed / 23** |
| `web` — `test/members-page.test.tsx` | 1 failed, **29.8 s** | **37 passed / 37** |
| `web` — `test/list-bulk-close.test.tsx` | 1 failed, **16.6 s** | **5 passed / 5** |
| `web:build` | exit **130** (cancelled) | — |

**The timings are the datum, not the verdicts:** the same files take **8 s** and **6 s** in isolation
against **16–45 s** inside the gate. **None of the four is a file this change touches**, and their subjects
(a ticket-type reorder, the builder's member access, the members page, a bulk close) are unrelated to
`ui.css` or the Visibility section.

⚠ **AND THE GATE NAMES A NODE THAT IS NOT THE ONE EXECUTING, WHICH IS WORTH CARRYING FORWARD.** Turbo's
failure line reads `/Users/kiro/.nvm/versions/node/v24.11.1/bin/pnpm run test exited (1)` — **Node v24**,
against the brief's v22.22.2. **It is not a runtime drift and the distinction was measured, not assumed:**
there is **no `pnpm` in the v22 bin at all** (the box has only a v24 corepack shim and a v18 one), so the
v24 path is the *launcher* shim while the *executing* Node is still v22.22.2 — `pnpm exec node -e
"process.version"` answers **v22.22.2** from both the root and `packages/app-core`. **A reader who sees
only the v24 path will conclude the gate ran off-toolchain; it did not.** (This is the shape the repo
already records for the gate: a result is not evidence unless it names its Node — and naming it is not
enough, the name has to be the one that EXECUTES.)

**The controller runs the forced gate at its own tree.** This pre-check is reported so the controller does
not receive a surprise, not as a claim about that gate.

### § 4 — OPEN RULINGS AND RECORDED ABSENCES

- **No ruling is open.** Both structural divergences above are conservative defaults, recorded here in
  the same change set per the brief's standing instruction; neither blocks the styling work.
- **Nothing is deferred.**

### § 5 — THE SHAS IN THIS NARRATIVE ARE UNRELIABLE

This file's own prose cites shas measured at one moment. **Verify reachability, not resolvability**:
`git cat-file` and `git show` both pass on reflog-only commits and will lie to you;
`git branch --contains <sha>` returning empty means ORPHANED.
