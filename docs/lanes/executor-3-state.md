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

The sibling parity task's own rule (`test-cases/16-remaining-doors.md:9-11`) is the one applied here:
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

<!-- filled at the freeze line -->

### § 4 — OPEN RULINGS AND RECORDED ABSENCES

- **No ruling is open.** Both structural divergences above are conservative defaults, recorded here in
  the same change set per the brief's standing instruction; neither blocks the styling work.
- **Nothing is deferred.**

### § 5 — THE SHAS IN THIS NARRATIVE ARE UNRELIABLE

This file's own prose cites shas measured at one moment. **Verify reachability, not resolvability**:
`git cat-file` and `git show` both pass on reflog-only commits and will lie to you;
`git branch --contains <sha>` returning empty means ORPHANED.
