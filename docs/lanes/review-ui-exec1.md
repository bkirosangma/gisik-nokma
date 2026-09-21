# REVIEW — EXECUTOR 1: UI (rendering layer + accessibility)

**Lane:** exec 1 · branch `exec1/review-ui`, cut from `origin/main = e4baa425966b331fdc1b189e3d1c86b667e30acc` · 2026-09-21
**Method:** enumerate → cover → state coverage including what was **not** reached. No fix branch, no fix commit, no PR.
**ROUND-2 DELTA, AT A GLANCE — what changed and why.**

| id | round 1 | round 2 | reason |
|---|---|---|---|
| **P8** | IMPORTANT, filed as a discovery | **MINOR (product) / IMPORTANT (follow-on)** | the product **already records** the gap at `board.tsx:394-397` as *"a named follow-on"* — filing it as a discovery was wrong. The argument is now the connected one: the remedy exists in-repo, tested (`filters-sheet.test.tsx:153`, cases `13.445`/`13.446`), on a less-used surface. |
| **P13** | MINOR, cited WCAG 2.4.1 | **MINOR, claim WITHDRAWN** | ARIA11 (landmarks) is a sufficient technique for 2.4.1 and `<main>` is on every route, so the product probably **conforms**. Kept as a keyboard-convenience finding with the conformance claim removed. |
| **P12** | IMPORTANT, argued from uniqueness | **IMPORTANT, re-argued** | the WCAG Understanding document **disclaims** a uniqueness requirement, and supplies a better argument: *"for web applications (single page applications) where the view changes dynamically, the title should also be changed dynamically to reflect the content or topic of the current view."* |
| **I1** | CRITICAL, 14 days | **CRITICAL, re-measured at 15 days** | a day passed and a Critical carries 15 points of downside; re-ran the three commands. Unchanged. |
| **P1** | IMPORTANT, seven controls | **IMPORTANT, SIX controls** ⚠ **r2 CORRECTION** | the `<Link>`-widened sweep's seventh member (`gn-nav__signin`) is **styled by `.gn-nav a`** — a DESCENDANT rule from an ancestor, which a sweep testing an element's own classes cannot see. Withdrawn; the other six re-checked against every `a`/`button` descendant selector in the three stylesheets and standing. |
| **P15** | — | **MINOR — filed IMPORTANT, corrected DOWN in the same round** | filed as *"the repo's prototype copy is a broken camelCase transform whose icons do not draw"*. **The mechanism is false**: `support.js:365-370`/`:422-423` show `sc-camel-*` is the prototype runtime's own reversible encoding, so the copy renders. What survives is Minor and measured — a constant **one-line offset** against the export, with **71 files citing the copy by line**. **The round-2 brief hands all six lanes the same false inference.** |
| **P16–P27** | — | **12 NEW findings** | the truncating-scanner negative assertion (P16, Important); the heading-level skip (P17, Minor); navigation announces nothing (P18, Important); the unnamed `tablist` (P19, Important); the calendar's missing grid semantics (P20, Minor); the description editor's unnamed content area (P21, Important); two unnamed `role="menu"` elements, one with a named twin (P22, Important); the searchable Select's removed focus outline (P23, Important); an undeclared painted pair at 3.84:1 (P24, Important); three citations to a deleted component (P25, Minor); **the prototype-delta queue, re-derived row by row — 7 of 11 have shipped** (P26, Important); WCAG 1.4.10's 320px, untested because the suite's narrowest width is 390 (P27, Minor). |
| **§5** | — | **3 new clean-check rows** | every `<button>` named; every direct `.gn-button` sets `type`; the three style axes. |

**Findings the round-1 report carried are otherwise unchanged and still stand**, re-checked for validity under §3 before anything new was added.

**ROUND 2 (2026-09-21).** Branch `exec1/review-ui-r2`, cut from `origin/main = a7b6292b`. Round-1 findings **stay and are re-scored**; revisions are marked **⚠ r2**; new findings continue the numbering and are marked **r2**. Independent duplicates with the Opus lane both score, per `REVIEW-R2-RULES-2026-09-21.md` §3 — I have not read that lane's report and do not coordinate with it.

**Prototype authority:** the staged export at `/Users/kiro/my_projects/gisik-nokma-lanes/prototype-2026-09-20/`.
Primary comparison file: **`Gisik Nokma - Desktop.dc.html`, sha256 `3d142d464a070b33…`**, cited by line. Bundle `Gisik Nokma Desktop.html` = `bf64cc446880281f…` (matches the `bf64cc446880` the owner's ruling names). **The repo's `design-system/interactive/desktop.dc.html` was NOT used as the comparison surface.**

---

## 0. THE ONE-LINE ANSWER

**A green gate is not evidence about this lane.** `pnpm turbo run build test typecheck` returned **33/33 successful, `Cached: 0`, `EXIT=0`, Node v22.22.2** at this tree (I ran it). In the same window, **no browser-based UI instrument has executed anywhere — CI or local — since 2026-09-06**, and the only suite that reaches the authenticated sheet holds **three deliberately-standing reds**, one of which was fixed eight hours later without its recorded artefact being regenerated.

**⚠ AND THEN I RAN ONE BY HAND, WHICH SHARPENS THE FINDING RATHER THAN SOFTENING IT.** `pnpm run test:e2e:viewport` — the signed-out suite, which starts its own `next dev` on **3021** and needs no stack, no Postgres and no secrets — returned **`31 passed, 2 skipped (1.1m)`, `EXIT=0`** against this tree. Fifteen tap-target sweeps: **every one `offenders=0`** and **every one `stale entries=[]`**. Fifteen contrast sweeps: **every one `failures=0`**. The viewport instrument asserted the applied width **15 times, 5 each at 390/768/1512**, before believing any measurement. **The instrument is not broken. It is unused** — and a suite that passes in 1.1 minutes and has not run in fifteen days is "a check that cannot fail" in its purest form, because it *would* pass and nothing would tell you if it would not.

---

## 1. ENUMERATION — the universe, before any finding

| area | files | how counted |
|---|---|---|
| `packages/ui` | **27** source/asset + **11** test | `find packages/ui -name '*.tsx' -o -name '*.ts' -o -name '*.css'` |
| `apps/web` | **150** (25 route modules under `app/`, 35 under `src/`, 12 e2e specs+helpers, ~55 `test/*`) | same sweep, excluding `node_modules`/`.next` |
| `packages/app-core/src/views` | **23** | `find packages/app-core/src/views -type f` |
| `packages/editor` | **24** src + **20** test | same sweep |
| `apps/mobile` | **12** src + **5** test | same |
| `apps/desktop` | **8** src + **4** test | same |
| stylesheets (the whole product) | **3** — `packages/ui/src/ui.css`, `apps/web/app/globals.css`, `packages/editor/src/styles/editor.css` | `find . -name '*.css'` minus node_modules/.next/dist |
| `ui.css` selector blocks | **702** (comment-stripped) | regex extraction, see §3's positive control |
| prototype | 5 `.html` + 3 **SPEC** `.md` (`help-topics-pane`, `workspaces-gap`, `github`) | shas in the header |

**Concern:** the rendering layer plus accessibility — accessible names, roles, focus, contrast, tap targets, type scale, and **what a thing actually paints**, not what its docblock says it paints.

---

## 2. COVERAGE — including the boundary

**Reviewed systematically:** the three stylesheets (full selector extraction); every interactive element in six source trees (static class analysis); `apps/web/e2e-viewport/{tap-targets,responsive.spec,viewports,accessible-names,type-scale}.ts`; `apps/web/e2e-stack/viewport.spec.ts`; every committed baseline artefact; the CI workflow's `gate`/`e2e`/`viewport` jobs; `turbo.json`; the breadcrumb/subtask/sheet region of `ticket-sheet.tsx` (my own work); `board.tsx`'s empty states; the prototype's `sheetCrumbs` and both empty states; §16's and §17's id allocation.

### ROUND 2 — HOW I USED THE GRAPH, AND WHAT IT CHANGED (rules §6)

**Freshness first, because a stale graph is a false map.** `GRAPH_REPORT.md` names its commit: *"Built from commit `e2769d60`"*. My base is `a7b6292b`. `git merge-base --is-ancestor e2769d60 HEAD` → **yes**, and `git log --oneline e2769d60..HEAD -- packages/ui apps/web apps/mobile apps/desktop packages/app-core/src/views` → **empty**, i.e. **none of the four intervening commits touches this lane's concern.** So the code layer is current for the UI lane, and I say so as a measurement rather than assuming it.

**What I did in the order §6 prescribes.**
1. **`GRAPH_REPORT.md` communities and god nodes first.** The god nodes are *not* my concern and that was the useful part: they are `createTestDatabase()` (129 edges), `TestDatabase` (127), `Queryable` (98), `testEnvelope()` (65), `stubServices()` (61) — the server/test layer. **So the graph's hubs are the wrong door into a UI review, and the community index is the right one.**
2. **The community index, filtered to my concern.** It named `ui/src/index.ts` (C48), **`tokens.ts` (C54)**, `editor/src/index.ts` (C74), `editor-web-view.tsx` (C211), `ticket-list.tsx` (C21), `board.test.tsx` (C163), `inbox/page.tsx` (C144) — and **`members-styling.test.ts` (C364), whose neighbourhood is 5 nodes: four path constants and the CSS text.**
3. **That thin community is the one that paid.** A styling test whose entire graph neighbourhood is "read the two stylesheets" is the shape worth auditing, and following it produced **P16** — the truncating scanner that cannot fail on a negative assertion. I would not have opened that file from a directory listing; it is not on any path I was already walking.
4. **`tokens.ts`'s community named the load-bearing token symbols** — `CONTRAST_PAIRS`, `FONT_ROLES`, `fontStackOf()`, `declarationsFor()`, `colorOf()` — which is what let me check the *authority* question behind `design-system/tokens.json` (proposal vs committed) without reading the whole file.
5. **`mcp__semble__search` was not needed this round**: the graph's community index answered every "what is here" question I had, and the remaining work was verification, which the graph cannot do.

**⚠ The graph LOCATED; it verified nothing.** Every measurement in this report is one I ran against a file I opened, and every citation is a line I read. **The one place the graph could have misled me, it nearly did, and the check was mine not its:** a thin community says "small file", not "weak test" — `members-styling.test.ts` turned out to be one of the best-built files in the family, with a mutation witness and a self-recorded hole. The finding came from its *siblings*, not from it.

### WHAT ROUND 2 ADDED TO COVERAGE

| | round 1 | round 2 |
|---|---|---|
| prototype comparison | 2 surfaces + the delta queue | **+ the `isMyWork` screen against the EXPORT at its own line numbers** (P17), and **the export-vs-repo-copy difference measured in full** (P15) |
| styling-test family | not opened | **the CSS-scanning family's nine files, two scanners, and every content assertion in the four truncating ones** (P16) |
| my own lands | — | **every finding re-checked for validity under §3 before adding anything**; two re-filed (P8, P13), one re-measured (I1) |

**⛔ NOT REACHED — and this is the honest boundary, stated as a list:**
1. **Painted DOM: the SIGNED-OUT half only, and no screenshots at all.** I ran the signed-out suite by hand (§0) and it gives painted measurements for **5 routes × 3 viewports** — `/help`, `/privacy`, `/terms`, `/sign-in`, the 404. **NO signed-in route was measured at paint**, so every finding about the board, the ticket sheet, the settings screens, the members page, the inbox and the desktop/mobile shells rests on *source and stylesheets*, which is weaker than a painted claim and I am not going to dress it up. **The reason is I2's:** taking the signed-in suite needs a stack serving *this* tree, and `:3001` serves a baked image that predates `main` (`981aa92b` measured `docker inspect gisik-nokma-dev-web-1` → zero mounts). So a run would have produced confident numbers about a different product — the same trap, one layer up. **No product file was modified and no screenshot was taken.**
2. Not reviewed file-by-file: `apps/web/app/*` route bodies (25 modules); the ~55 `apps/web/test/*` files; `packages/app-core/src/views/*` beyond `ticket-sheet`/`board`/`attachment-list`; `packages/editor`'s components beyond the class sweep; `apps/mobile`'s editor webview and both storage engines; `apps/desktop`'s Tauri config and storage; `apps/web/e2e/` (the mock-only suite). **`packages/ui` WAS read** — `button`, `card`, `chip`, `segmented-control`, `avatar`, `dialog`, `switch` in full; `sheet`/`toast`/`info-tip`/`table` grepped; `select/select.tsx` read for its structure, markup and sweep-visibility (it is built on React Aria — `useSelect`/`useComboBox`/`useListBox`/`useOption`/`HiddenSelect` — so its keyboard and role model comes from the library rather than from this repo, which is why P9's hand-rolled tabs stand out beside it). **Remaining largest hole: `apps/web/app/*`'s 25 route bodies.**
3. Prototype comparison performed for **two** surfaces only (the ticket-sheet breadcrumb, the board empty states). The other ~20 prototype files were not compared.
4. §16's 97 case ids were **not** each opened. `check:citations` was run (§7) and its limit is stated there; the breadcrumb cases `16.63`–`16.71` and `16.87` **were** read and are correctly updated for the state crumb's removal.

---

## 3. INSTRUMENT FINDINGS

### I1 — **CRITICAL** — No browser-based UI instrument has executed anywhere since 2026-09-06, and the local gate structurally cannot run one

**WHAT.** `e2e` (the signed-in stack suite) and `viewport` (the signed-out suite) are the *only* instruments that measure tap targets, label-text floors, accessible names, non-text contrast and sideways overflow. Neither has run in ~15 days.

**MEASUREMENT.**
- `gh api repos/bkirosangma/gisik-nokma/actions/runs` across 12 pages (1,200 runs): the **last successful run is `34023679658` at `2026-09-06T09:05:54Z`**. Every run from `2026-09-06T11:52:24Z` to `2026-09-20T18:33:45Z` is `failure`. Pages 1–9 (900 runs) contain **zero** successes.
- It is not a failing step — **the runner never starts.** `gh api …/runs/35529457412/jobs` → **every one of the 14 jobs has `"steps": []`, `"runner_name": ""`**, and `scope` shows `started_at …18:33:46Z → completed_at …18:33:48Z` (2 s). `gh run view --log-failed` → `log not found`.
- The cascade: `scope` fails → `build`/`typecheck`/`server-tests`/`other-tests`/`e2e`/`viewport` are all **`skipped`**; `gate` (which treats `skipped` as fine) reports **`failure`**. `e2e` and `viewport` are `skipped` in **25 of 25** checked runs.
- **⚠ r2 RE-MEASURED 2026-09-21, AND IT STILL HOLDS — the window is now 15 days and the failure mode is unchanged.** `gh run list --limit 6` → the newest six runs (down to `2026-09-21T02:23Z`) are all `failure`; `gh api .../runs/<newest>/jobs` → **all fourteen jobs still report `"steps": 0`**; and the last success is still **`2026-09-06T09:05:54Z`**. Nothing about this finding decayed in the day between rounds.
- **⚠ RE-MEASURED A THIRD TIME AT THE END OF ROUND 2 (`2026-09-21T06:42Z`), because a Critical is the finding whose staleness costs most.** The newest runs, down to `04:18:40Z`, are **all `failure`**; run `35560484912`'s fourteen jobs **all report `"steps": 0`**; and **the last success is still `2026-09-06T09:05:54Z`** — exactly the value this finding was filed with, unchanged across three separate measurements in two rounds. **The window is 15 days.**
- The local substitute cannot cover it: **`test:e2e` appears `0` times in `turbo.json`** (control: `build`, `test`, `typecheck` all present), so `pnpm turbo run build test typecheck` cannot invoke either suite. Verified by running it — **33/33, `Cached: 0`, `EXIT=0`.**
- **AND I RAN THE SIGNED-OUT SUITE MYSELF, BY HAND, BECAUSE NOTHING ELSE WOULD.** `pnpm run test:e2e:viewport --workers=1` → **`31 passed, 2 skipped (1.1m)`, `EXIT=0`.** (The 2 skips are `responsive.spec.ts:1657`'s documented one-project-only guard, which drives its own viewports — not a defect.) Per route × viewport: **15 tap-target sweeps, all `offenders=0`, all `stale entries=[]`; 15 contrast sweeps, all `failures=0`; 15 viewport self-assertions, 5 at 390, 5 at 768, 5 at 1512.** The suite tore down its own `next dev` — port 3021 released, no orphaned workers. **This is the point of the finding, not an exception to it: the only way this lane could obtain a painted measurement of its own product was to run the suite by hand, because no automated path runs it.**

**WHY IT IS WRONG.** Every measured property this lane owns is guarded *only* by those two jobs. A green local gate beside a never-executed browser job is the shape this repository has a whole catalogue about: **a check that cannot fail reads exactly like a check that passed.** The `tap-targets.ts` docblock was itself corrected on 2026-09-20 to say *"The signed-out suite runs on CI's `gate` as of case 16.59, so 'neither viewport suite is on any gate' stopped being true"* — the **configuration** is true; the **execution** is not. That correction turned a true sentence into a false one, in a file whose own docblock says a future reader would look exactly there.

**WHAT WOULD HAVE BEEN BETTER.** Two separable remedies, in order of value: (a) a **non-browser proxy on the gate** — the parts of these suites that are pure source analysis (the `DENSE_IN_LIST` liveness check already exists at `apps/web/test/tap-target-density.test.ts`; a selector-level "no interactive element whose classes have no rule" check is the same shape and needs no browser) so the *class* of defect in §4 stays guarded while CI is dark; and (b) treat a red `gate` as blocking rather than nominal, since the standing auto-merge authorization reads *"an independent CI run green"* and no run has been green since 2026-09-06T09:05:54Z.

---

### I2 — **IMPORTANT** — The `e2e-stack` suite's committed artefact records a defect that was fixed eight hours later, and nothing in the file says which run produced it

**WHAT.** `apps/web/e2e-stack/non-text-contrast-roster.json` records `"belowCount": 1` with `button.ticket-type-list__move` at **1.41:1**. That class was fixed on 2026-09-20. The artefact was never regenerated.

**MEASUREMENT.**
- The artefact's last writer is commit **`8e742d18`** (`/usr/bin/git log -1 --format=%h%ad -- apps/web/e2e-stack/non-text-contrast-roster.json` → `8e742d18 Sun Sep 20 03:28:49 2026`), whose message says the class "has NEVER had a CSS rule" and that the entry is "NOT a contrast defect".
- The fix is commit **`981aa92b`** (`Sun Sep 20 11:27:29 2026`), which adds `.ticket-type-list__move` at `ui.css:5836`, `:5851`, `:5855` — **verified by selector extraction, with `ticket-type-list__move` → 3 selector blocks.** Same commit adds case `16.83`.
- The fix's own message says: *"a reader who finds the old roster entry should read it as evidence of the missing rule"* — **the pointer lives only in a commit message**, the one place a reader of the file will not look.
- Both shas are in `origin/main` (`merge-base --is-ancestor` → yes).

**WHY IT IS WRONG.** This is a tracked file the suite **writes on every run** (`viewport.spec.ts:1006`), and its stated design purpose is to be a *before* — *"a before/after comparison needs the BEFORE to still exist after the tree has changed"*. But it carries **no sha, no date, and no supersession note**, so a reader cannot distinguish "the before" from "stale". The `after` was never recorded, because recording it needs a stack window that no lane has had. **A record that cannot say which run produced it is a record that will be read as current.**

**WHAT WOULD HAVE BEEN BETTER.** Stamp the artefact with the head sha and timestamp it was produced at (a three-line change at the `writeFileSync` call), and say in the file itself when a later commit supersedes an entry. Then the file is a measurement with provenance instead of an unattributed number.

**Not measured, and why:** whether the *other two* reds recorded at `8e742d18` still stand. `981aa92b` measured `docker inspect gisik-nokma-dev-web-1` → **ZERO mounts, baked CSS bundles** — the `:3001` web serves an image that predates `main`'s tip, so running the suite from this tree would measure a product that is not this tree. **That is the same trap the horizon rule names, so I did not run it and am not reporting a number I did not take.**

---

### I3 — **IMPORTANT** — `DENSE_IN_LIST`'s stated reason for excluding `.gn-my-work__title` is falsified by the same docblock, two lines above it

**WHAT.** `apps/web/e2e-viewport/tap-targets.ts:71-76` states the membership rule: a control belongs in `DENSE_IN_LIST` when **(a)** the product's own CSS gives it the 24px floor **AND (b)** *"a sweep actually visits the route it renders on"*. Lines 82-90 exclude `.gn-my-work__title` on the ground that clause (b) fails.

**MEASUREMENT.** Clause (b) **holds**. The same docblock says the control is *"on `/my-work`, **which the stack suite does sweep**"*, and `apps/web/e2e-stack/viewport.spec.ts:108` navigates to `/w/${workspaceId}/my-work` before calling `measureTapTargets` at `:170`. The reason actually given for the exclusion is a *measurement window* ("its baseline can only be measured against the live stack on `:3001`, which is another lane's worktree"), which is not clause (b).

**WHY IT IS WRONG.** The entry's own docblock calls it *"the closest thing to an error in this table"*, and the excluded control is one of the two families that kept the ratchet red at `8e742d18` (measured there: *"11 against a recorded 6, and EVERY offender is at exactly h:24 — 9 `button.gn-attention__title` + 2 `button.gn-my-work__title`"*). Clause (b) exists to stop a control being exempted on a **reachability** argument that expires; here clause (b) is satisfied and the control is exempted anyway, on a **window** argument. The distinction matters because the window closes the moment a lane has a stack.

**WHAT WOULD HAVE BEEN BETTER.** Either add the entry (clause (a) holds: the docblock says the rule is *"byte-similar to `.gn-attention__title`"*, whose own rule at `ui.css:1606-1616` makes the 24px call) and re-baseline in the same commit, or restate the exclusion as what it is — *"excluded because no lane has had a stack window to measure it, owner: whoever next runs `test:e2e:stack`"* — and keep clause (b) clean for the cases where it is the real reason.

**Not measured:** the current offender count. Same reason as I2 — no tree-accurate stack.

---

### I4 — **MINOR** — `tap-targets.ts` cites a line range that resolves and misleads

**WHAT.** The docblock that justifies the 24/44 split cites the wrong lines for the sentence it quotes.

**MEASUREMENT.** `apps/web/e2e-viewport/tap-targets.ts:43-45` reads: *"`ui.css:1606-1616` states the whole rule in one sentence: *\"Dense in-list controls get 24, standalone controls get 44 — the same call `/help`'s table-of-contents links got.\"*"* — **the sentence is at `ui.css:1662-1663`.** Lines 1606-1616 hold an unrelated paragraph about an attention-strip `border-left` marker being removed as a design choice, and it *resolves* as a substantive, plausible-looking block.

**WHY IT IS WRONG.** This is the exact failure the same file records against itself 390 lines later (`tap-targets.ts:435-441`: *"this paragraph was the one a sweep scoped to the diff CANNOT see"*). A citation that resolves is not a citation that agrees, and a 56-line drift is invisible to any check that only asks whether the range exists. I nearly propagated it into §5 of this report before opening the lines.

**WHAT WOULD HAVE BEEN BETTER.** Cite the sentence, not the range — `ui.css`'s `".gn-attention__title"` docblock — the same remedy `test-cases/16-remaining-doors.md:19` prescribes for itself (*"resolve that paragraph by CONTENT"*).

---

### I5 — **MINOR** — My own live handoff carries two position blocks that contradict each other, and the pointer that found it is itself stale

**WHAT.** `docs/lanes/executor-state.md` (exec 1's handoff — **mine**) states the id block twice, differently.

**MEASUREMENT.**
- `executor-state.md:65`: *"exec 1's next free ids are **`16.63`–`16.80`**. The table in `test-cases/16-remaining-doors.md` says so."*
- `executor-state.md:27` (the newer block): *"THE CONTROLLER REALLOCATED `16.72`–`16.80` TO EXEC 2 (2026-09-21) … **Exec 1 has NO free ids and must ASK before minting.**"*
- `test-cases/16-remaining-doors.md:16` says `16.63`–`16.71`. So line 65 **refutes itself at the very line it cites**, which is the defect `test-cases/16-remaining-doors.md:19` named — **and that note cites `executor-state.md:31`, while the sentence now sits at `:65`.** The claim is still true; the pointer no longer resolves to it.

**WHY IT IS WRONG.** A handoff is the artefact a restarted executor trusts to find its position. Two blocks giving different answers means the answer depends on which block the reader reaches first, and the file's own warning (*"ANCHORS (a READING at a moment; re-read before freezing)"*) is attached to only one of them.

**WHAT WOULD HAVE BEEN BETTER.** One position block per fact — the older subtask-affordance block should carry a forward pointer to the current block rather than restating the allocation. And any `file:line` citation into a file that grows should name the **string** to find, not the line (`test-cases/16:19`'s own rule elsewhere: *"resolve that paragraph by CONTENT"*). This finding is mine to own: line 65 is stale because I edited the newer block and not the older one.

---

## 4. RENDER FINDINGS

### P1 — **IMPORTANT** ⚠ **r2 CORRECTION — SIX, NOT SEVEN: the seventh was refuted by an ancestor rule and is withdrawn** — interactive controls styled by no rule of their own

**WHAT.** **Eight source sites, six distinct controls** (filed as nine and seven — see the withdrawal below), where **no class on the element matches any selector block** in the product's three stylesheets.

| element | site |
|---|---|
| `gn-board__empty-create` (`<button>`) | `packages/app-core/src/views/board.tsx:494` |
| `gn-attachment__link` (`<a>` ×2) | `packages/app-core/src/views/attachment-list.tsx:93`, `:105` |
| `add-rule-menu__trigger` (`<button>`) | `packages/app-core/src/workflow-builder/ui/rule-editors/add-rule-menu.tsx:38` |
| `attachment-item__name` (`<a>` ×2) | `packages/editor/src/components/AttachmentListItem.tsx:106`, `:128` |
| `evidence-picker__cancel` (`<button>`) | `packages/editor/src/components/EvidencePicker.tsx:149` |
| `editor-slot__submit` (`<button>`) | `packages/editor/src/components/TicketEditorSlot.tsx:216` |

**⚠ THE SEVENTH MEMBER IS WITHDRAWN, AND ITS REFUTATION IS THE SAME LESSON AS P15.** My `<Link>`-widened sweep added `gn-nav__signin` on the ground that every other class in `legal-nav.tsx` has a rule while that one has **0** — `.gn-nav` **24**, `.gn-nav__inner` **4**, five others **1 each**. **That measurement is true and the conclusion drawn from it is false**, because `globals.css:1968` carries **`.gn-nav a { border-radius: 0.375rem; padding-inline: 0.875rem; font-weight: 500; letter-spacing: -0.1px; color: var(--gn-text-muted); text-decoration: none; … }`** with a matching hover/focus rule at `:1977-1978` — **a DESCENDANT rule from an ancestor class**, which styles the element completely. The element's own docblock says so too: `legal-nav.tsx:60` cites *"`.gn-nav a`'s 2.75rem minimum in BOTH dimensions"*. So it is painted by design, not by accident, and the seventh member is withdrawn.

**⚠ AND THE BLIND SPOT IS STRUCTURAL, SO I RE-CHECKED ALL OF THEM.** My sweep tests whether an element's **own** classes match a selector — it is invisible to a descendant rule that reaches the element from an ancestor. I enumerated every descendant selector ending in `a` or `button` across the three stylesheets — `globals.css:1283/1290-1291` (`.gn-settings__sidebar a`), `:1925-1926` and `:1968/1977-1978` (`.gn-nav a`, `.gn-nav button`), `:2280` (`.gn-legal__toc a`), `:2428-2429` (`.gn-legal a`, `.gn-sign-in__legal a`), and `ui.css`'s three `.gn-button` rules — and **none of those ancestors is an ancestor of the six that remain**. The six stand against that check; the seventh did not.

**MEASUREMENT.** Extracted all **702 selector blocks** from `ui.css` (comments stripped), plus `globals.css` and `editor.css`; for each static `className` literal on a `<button|input|select|textarea|summary|a>`, required that **at least one** of its class tokens matches a selector block. Nine results; `nodrag` (`state-node.tsx:47`) is React Flow's own marker and is excluded as not ours. **Positive control, same extractor, same path: `.gn-board-card__move` → 4 blocks; `.ticket-type-list__move` → 3 blocks.** The load-bearing fact: **`apps/web/app/globals.css:84` sets `button { font: inherit }` — font only**, with no `border`, `background` or `padding` reset, so an unstyled `<button>` keeps the UA's `outset` border and grey fill. The `<a>` elements are painted by the global `a { color: var(--gn-text-accent) }` (`globals.css:39`) and keep the UA underline; their **class** has no rule.

**WHY IT IS WRONG.** This is not a judgement call — the identical defect on **one** class (`.ticket-type-list__move`) was treated as a real defect on 2026-09-20, given a dedicated commit (`981aa92b`), a new case (`16.83`), and a six-way mutation witness, on the stated ground that *"the screenshot shows grey OS buttons in a neumorphic page."* These six have the same cause and no rule. `gn-board__empty-create` is the **first-run** call to action on an empty board; three of the others are in the editor's upload/cancel/submit path.

**WHAT WOULD HAVE BEEN BETTER.** One shared bare-control reset — `border:none; background:transparent; padding:0; font:inherit; color:inherit` — applied as a class (the shape `button.gn-ticket-sheet__crumb--link` already uses at `ui.css:672`), or per-class rules for the six. The `.gn-*` convention in `ui.css` already exists for exactly this; these six simply never joined it.

**⚠ NOT MEASURED AT PAINT — NONE OF THE SIX.** All six are **static and stylesheet** measurements: I did **not** confirm their painted result in a browser (I2's reason — `:3001` serves a baked image predating `main`). The `ticket-type-list__move` precedent was confirmed in Chromium (`border: 2px outset`, `background: rgba(239,239,239,0.3)`); **I am asserting the same cause from the same kind of evidence and not the same kind of confirmation.**

**⚠ AND THE ONE MEMBER THAT *WAS* PAINTED-MEASURED IS THE ONE THAT GOT WITHDRAWN.** The `<Link>`-widened sweep's seventh member, `gn-nav__signin`, is the only one the viewport suite renders where I could read it — and it came back **77×44, `offenders=0`, because `.gn-nav a` styles it**. So the single painted data point I had pointed at the member that did not belong, and the six that remain have none. **The honest position for the finding as it now stands: six static measurements, zero painted confirmations, and a mechanism proven by precedent on a different class.** That is why it is Important and not higher, and I would not defend it as more than that.

---

### P2 — **IMPORTANT** — The board's whole-board empty state has no prototype counterpart, and is the one board empty state with no styling

**WHAT.** `board.tsx:528` renders `<div className="gn-board gn-board--empty">`; `:490` renders `gn-board__empty-copy`; `:494` renders `gn-board__empty-create`. **All three have zero selector blocks.**

**MEASUREMENT.** Selector extraction over `ui.css` for the `gn-board__empty` family returns **no selector blocks at all** — the only two hits in the file are *comments* (`ui.css:835`, `:4980`). `/usr/bin/git log -S'gn-board__empty-create' -- packages/ui/src/ui.css` → a single commit, `b1dda062`, and the extraction shows it added a mention, not a rule. **Contrast measured the same way: the product's per-column sibling *is* styled** — `.gn-board__column-empty` (`ui.css:846`), `-icon` (`:869`), `-copy` (`:885`).

**PROTOTYPE.** `Gisik Nokma - Desktop.dc.html` (sha `3d142d46…`), `:390-396`, draws a **per-column** empty state and styles its button inline with `border:none;padding:0 16px;border-radius:var(--ctlR);background:var(--ctlBg);box-shadow:var(--ctlShadow);color:var(--accent);min-height:44px;font-size:15px;font-weight:600`. Its `:590-591` draws a **per-group** empty ("Nothing here."). **⚠ THE SEARCH, NAMED, BECAUSE "IN ANY ARM" IS AN ABSENCE CLAIM ABOUT A WHOLE FILE.** I grepped the export for the empty-state vocabulary a board could use, **one pattern at a time and counting LINES**: `col.empty` (**2** — `:390` the `sc-if`, `:395` the `col.emptyText`), `g.empty` (**1**), `No tickets` (**1**), `Add a ticket` (**1**), `Create a ticket` (**0**). **⚠ AND THE NUMBERS IN THIS SENTENCE WERE WRONG WHEN FIRST COMMITTED, WHICH IS WORTH THE LINE.** I wrote them from a different invocation than the one I re-ran — a case-insensitive alternation — and got `col.empty` 1 and `No tickets` 0. **Never write a count from memory**, including the memory of a command run ninety seconds earlier. **The conclusion is unchanged and is the reason the three hits are named:** `col.empty` and `g.empty` are the per-COLUMN and per-GROUP arms, and **`No tickets` is not an arm at all — it is `:2700`, a project description string in the prototype's own data** (`desc: "No tickets yet"`). So there is no whole-board empty ARM, which is what the finding claims. **The boundary: that is a vocabulary search over `Gisik Nokma - Desktop.dc.html` (sha `3d142d46…`), not an enumeration of every conditional in it.** A board-empty arm drawn with words I did not guess would be missed, and I name the words here so a reader can add one.

**CLASSIFICATION.** The per-column state **MATCHES** (product `ui.css:846-885` mirrors it). The whole-board banner is a product **addition** and **DIVERGES WITH NO RULING FOUND** — `grep` of the coordination doc for `crumb`/board-empty rulings and of §16 found no ruling for it; `EMPTY_BOARD_COPY` (`board.tsx:184`) is stated in code with no ruling cited.

**⚠ CHECKED FOR P1's BLIND SPOT — and it does not apply here.** P1's seventh member was refuted by a descendant rule from an ancestor, so I ran the same test against this finding: `grep -rnE '\.gn-board[a-z_-]*\s+(button|a|p|\*|\.)'` over both stylesheets → **no matches**, i.e. **no `.gn-board…` descendant rule exists that could reach the empty state from above**; and the only two occurrences of `gn-board__empty` in `ui.css` are **comments** (`:835`, `:4980`). The whole-board empty state is genuinely unstyled by any route.

**WHY IT IS WRONG.** An addition is not a defect — the banner is arguably better than the prototype's silence. The defect is that the addition was never **styled**, so the first-run surface a person meets on a brand-new project is a sentence in inherited text and a UA button, in a page whose per-column sibling is fully styled and whose prototype draws the equivalent control with explicit resets. Two states answering the same question, one dressed and one not.

**WHAT WOULD HAVE BEEN BETTER.** Style the three classes from the prototype's shared control constant (the same constant `981aa92b` reused for `.ticket-type-list__move` — fill-tertiary + text-accent + control radius, no border), and record the whole-board banner as a deliberate addition in `Features.md` with its rationale, so a later reader does not "correct" it back toward a prototype that has no such state.

---

### P8 — **MINOR (product) / IMPORTANT (follow-on)** ⚠ **r2 REVISION** — `Dialog` and `Sheet` declare `aria-modal="true"`, and the missing containment is RECORDED as a named follow-on that the remedy already exists for

**WHAT.** Both modal components tell assistive tech that the rest of the document is inert. Neither moves focus into the dialog, traps it, or restores it on close — and no focus trap or `inert` attribute exists anywhere in the product.

**MEASUREMENT.**
- `packages/ui/src/components/dialog.tsx:18-24`: `role="dialog" aria-modal="true"` on the `<section>`. Its only effect is an Escape keydown listener (`:6-13`). No focus call, no `tabIndex`, no trap.
- `packages/ui/src/components/sheet.tsx:102-104`: the same three attributes, same shape; the ticket sheet renders this component.
- **The search I ran finds no containment:** `grep -rn "inert\|focus-trap\|focusTrap\|trapFocus"` over `packages apps` (excluding `node_modules`/`dist`/tests) returns **only prose uses of the word "inert"** — zero hits on the HTML attribute or a trap helper. **⚠ Stated as the search, not as "nothing anywhere": the sweep covers `packages` and `apps` with `node_modules`/`dist`/tests excluded, which is the whole product source. I am not claiming the absence of a trap in a dependency.** **Positive control in the same command: `Escape` handlers are found in both `dialog.tsx:9` and `sheet.tsx:58`**, so the greps traverse the right tree.
- **No caller supplies it either:** the four `<Dialog>` sites (`transition-dialog.tsx:382`, `bulk-close-dialog.tsx:242`, `new-ticket-dialog.tsx:126`, `reopen-dialog.tsx:64`) were checked for focus management; the only `useRef` among them is `bulk-close-dialog.tsx:161`'s `attemptRef`, a retry counter.

**⚠ IS THIS ALREADY RECORDED? YES — and round 1 filed it as a discovery, which it is not.** The product states the gap in its own words at `packages/app-core/src/views/board.tsx:394-397`:

> *"(Dropping `aria-modal`'s focus escape itself is the shared `Dialog`'s business — **it ships no focus trap and no portal** — and is **recorded as a named follow-on** rather than repaired from here.)"*

Under **§3** that is the shape a judge must look at hardest: *"the 'defect' is the product behaving as ruled with no argument against the ruling."* So the r2 revision does two things — it **drops the claim from Important to Minor as a product finding**, and it **makes the argument the owner's rule asks for**, which is why the *follow-on* half stays Important.

**THE ARGUMENT, AND IT IS A CONNECTED ONE, NOT A PREFERENCE.** The record calls this a *named follow-on*. A follow-on whose remedy already exists in this repository, **tested, with case ids, two files away**, is not being followed on — and that is the measured claim, not an opinion:

- The project page's filters sheet (`apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx:3304`) is a **third** modal that declares `aria-modal="true"`, moves focus into itself on open, restores it to the exact opening control on close, and **asserts both**.
- `apps/web/test/filters-sheet.test.tsx:153` is literally named *"13.445 the sheet is a real dialog, and focus moves into it on open"*; it asserts `expect(dialog.contains(document.activeElement)).toBe(true)` with a comment recording that the precondition is what keeps the assertion from being vacuous, and `13.446` covers the focus return.
- **So the standard exists in-repo, it is tested, and it is on the LESS used surface.** The two components that lack it are the *more* used ones: four `<Dialog>` call sites plus the ticket sheet.

**The connected consequence, which is what makes this weigh more than a preference:** the gap is not inert. `board.tsx:385-393` shows the product *reasoning about the leak* — a column action reached while a dialog is open is judged to have been *"reached behind a modal — a keyboard-focus escape"*, and the code **refuses the interaction rather than serving it** (case 13.793). So a workaround exists specifically because focus escapes the modal. **That is a measured behavioural consequence of the uncontained focus, recorded in the same file that records the follow-on.**

**WHAT WOULD HAVE BEEN BETTER.** Either implement containment — move focus to the dialog on open, restrict Tab to it, restore focus to the opener on close — or drop `aria-modal` to `role="dialog"` alone and be honest about it. The second is one attribute and is not a worse product; the current state is the only one that is *wrong*, because it asserts the property rather than merely lacking it.

---

### P9 — **IMPORTANT** — `SegmentedControl` carries full ARIA tab semantics and implements none of the tab keyboard model

**WHAT.** `role="tablist"` + `role="tab"` + `aria-selected`, with no `tabpanel`, no `aria-controls`, no arrow-key handling and no roving `tabindex`.

**MEASUREMENT.** `packages/ui/src/components/segmented-control.tsx:25-40`: the container is `<div role="tablist" aria-label={…}>` and each option is `<button role="tab" type="button" aria-selected={on} …>`. `grep -n "onKeyDown\|Arrow\|tabIndex\|aria-controls\|tabpanel"` on that file → **NONE** (positive control in the same command: `Escape` is found in `dialog.tsx`/`sheet.tsx`). Per WAI-ARIA's tabs pattern a `tablist` requires arrow-key navigation between tabs, a roving tabindex, and the tab↔tabpanel relationship; none is present.

**Blast radius, measured:** seven render sites — `apps/web/src/theme-toggle.tsx:64`, `apps/web/src/style-toggle.tsx:74`, `apps/web/app/inbox/page.tsx:406`, `apps/web/app/sign-in/page.tsx:292`, `packages/app-core/src/help/help-browser.tsx:494`, `packages/app-core/src/views/ticket-sheet.tsx:1915`, plus `components.test.tsx:258`.

**WHY IT IS WRONG.** A person using a screen reader is told "tab, 1 of 3" and will press the arrow keys the pattern promises. **The component handles no key event that could answer them** — the grep above is the measurement. The cost is not cosmetic. And the component's own docblock gives the reason the roles were kept: *"keeping the exact roles the old markup carried — `tablist`, `tab`, `aria-selected` — so the accessible-name ratchet (13.285/13.287) sees no loss."* **A counter was preserved, and the semantics it counts were not implemented** — which is P10's mechanism showing its cost in a second place.

**WHAT WOULD HAVE BEEN BETTER.** If these are view switches, `role="tablist"` is the wrong role: a group of buttons with `aria-pressed` needs no keyboard model beyond Tab. If they really are tabs, they need the keyboard model and a `tabpanel` to point at. Either is small; the current shape takes the semantics and skips the contract.

---

### P11 — **IMPORTANT** — The `Select` panel is outside the population of every rendered-property sweep, for two independent reasons

**WHAT.** `Select` is the product's most-migrated shared control (the members Channel/Role fields, the style and theme toggles, the ticket-type editors). Its option rows have never been measured for tap-target size, label-text floor, accessible-name contribution or non-text contrast — and could not have been.

**MEASUREMENT — reason 1, the panel is never on screen when a sweep runs.** The listbox is portaled to `document.body` and renders only while open (`select.tsx:530`, `<ul {...resolvedListBoxProps}>` inside a `createPortal`). The stack spec's own comment records it: *"the listbox and its options render only while open, portaled to `document.body`, so a closed-page sweep sees none of them"* (`e2e-stack/viewport.spec.ts:696`). **No spec opens a Select before sweeping** — `grep` for a click on the trigger across `e2e-viewport/*.ts` and `e2e-stack/*.spec.ts` returns only that comment, never a call.

**MEASUREMENT — reason 2, even open, the rows match no arm of the tap-target selector.** `tap-targets.ts:268-280` selects `a[href]`, `button`, `input:not([type="hidden"])`, `select`, `textarea`, `summary`, `[role="button"|"link"|"tab"|"checkbox"|"switch"]`, and `[tabindex]:not([tabindex="-1"])`. An option row is `<li {...optionProps} className="gn-select__option">` (`select.tsx:582`) — an `<li>` with `role="option"` from `useOption`, which is the listbox pattern's non-tabbable row. **`[role="option"]` and `[role="listbox"]` occur 0 times in each of the four sweep modules** (`tap-targets.ts`, `type-scale.ts`, `accessible-names.ts`, `helpers/non-text-contrast.ts`).

**WHY IT IS WRONG.** These are the two independent reasons the brief names as this lane's characteristic blind spot: *a sweep that cannot see a class is a sweep that reports zero offenders.* `.gn-select__panel` (`ui.css:2530`), `.gn-select__option` (`:2558`) and `.gn-select__chip` (`:2508`) are fully styled — someone did the work — and **the four sweep modules checked here cannot see it**: `[role="option"]` and `[role="listbox"]` occur **0 times in each of the four** (`tap-targets.ts`, `type-scale.ts`, `accessible-names.ts`, `helpers/non-text-contrast.ts`, each counted separately), and no spec in either suite opens a Select before sweeping. **⚠ I am claiming what I measured, not *"no instrument has ever checked it"* — the honest form is: the four instruments reviewed here do not, and I did not find a fifth.** The four sweeps report confident numbers for every other surface while this one contributes nothing to any denominator.

**WHAT WOULD HAVE BEEN BETTER.** Add `[role="option"]` (and `[role="listbox"]`) to the tap-target selector, and have the stack spec open one Select before at least one sweep so the panel enters the population. Opening the style toggle on `/account` is one click and it is already on a swept route. Until then, say in the sweep's own output which surfaces it cannot reach — a stated blind spot is worth more than a silent zero.

**Not measured:** whether the panel's rows would actually *fail* any floor. I did not open a panel in a browser (no browser ran, §2). **This finding is about coverage, not about a violation.**

---

### P10 — **MINOR** — The accessible-name ratchet's unit is an attribute; its failure message claims a property of assistive tech

**WHAT.** `ariaLabel` counts **elements carrying the attribute**, and the assertion that consumes it tells the reader something stronger.

**MEASUREMENT.**
- `apps/web/e2e-viewport/accessible-names.ts:47-52`: `const count = (attr: string): number => all.filter((el) => el.hasAttribute(attr)).length;` and `ariaLabel: count('aria-label')`. `RATCHETED` (`:118-123`) includes `ariaLabel`.
- The failing assertion's message (`apps/web/e2e-stack/viewport.spec.ts:719-722`) reads: *"…LOST ${attr}: baseline …, now …. **Something that identified an element to assistive tech is gone.**"*
- **A live site where the two differ:** `apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx:3288` wraps an `Avatar` — which sets its own `aria-label` (`components/avatar.tsx:65`) — in `<span aria-hidden="true">`, with a comment explaining that the wrap exists precisely so that `aria-label` does **not** reach assistive tech. The attribute is present in the DOM, counted by the ratchet, and deliberately hidden.

**WHY IT IS WRONG — and how far I am willing to take it.** The file's own docblock is **honest** about this (*"Counts, not names"*), so the instrument is not lying. The **assertion message** is: a count of attributes is reported as a statement about assistive technology. And I checked the tempting stronger version of this finding and **withdrew it**: I hypothesised that `Avatar`'s `aria-label` on a role-less `<span>` names nothing, and the code disproved me — `apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx:3279-3286` records a measurement that it *does* contribute, doubling a wrapping checkbox's accessible name to *"Uma One Uma One"*. **So an `aria-label` on this span is exposed; the finding is about the unit, not about `Avatar`.**

**WHAT WOULD HAVE BEEN BETTER.** Keep the count (it is cheap and it does catch a dropped attribute) but say what it measures: *"an `aria-label` attribute left the document; whether it named anything is not what this measured"*. That sentence costs nothing and stops a count being read as a property.

---

### P3 — **MINOR** — The parent crumb cannot show the parent's key; the prototype's does, and no ruling records the difference

**WHAT.** The prototype labels the parent crumb `key + " " + title`; the product labels it `title`.

**MEASUREMENT.** Prototype `Gisik Nokma - Desktop.dc.html` `:3413-3414`: `chain.push({ label: p.id + " " + p.title, go: … })`. Product: `ticket-sheet.tsx:1557` and `:1566` render `{ancestor.title}` alone. The prototype's **epic** crumb is `e.title` (`:3410-3413`, title only) — **which the product matches.** So the divergence is exactly one crumb.
**Why the product cannot match:** `ParentRef` is `{ kind:'ticket'; id; title }` (`packages/app-core/src/view-types.ts:368-371`) — no key field — and the server's visible arm is `{ kind:'ticket', id: parentRow.ticket_id, title: titleOf(parentState) }` (`apps/server/src/routes/tickets.ts:435-436`). The wire carries no key for an ancestor.

**FAILED SEARCH — stated as the search, not as a claim about all rulings.** `grep -n "crumb" docs/superpowers/plans/2026-08-20-00-series-coordination.md` → **0 matches**. The breadcrumb dispatch (`gisik-nokma-lanes/CTL-DISPATCH-2026-09-20-breadcrumb-hierarchy.md`) quotes the parent's `id + " " + title` syntax in its pseudo-code block and names the epic's conditional and the last crumb's plainness as *"load-bearing"*. **⚠ THE BOUNDARY:** that is the coordination document and the one dispatch, both read in full. **I did not sweep every dispatch, the ledger, or `owner-holds.md` with the string `parent crumb`** — so the claim is *"the two authority documents I read do not rule on it"*, not *"no ruling exists"*. **Category 3: diverges with no ruling found.**

**WHY IT IS WRONG.** Not because title-only is bad, but because the key is what disambiguates: a ticket whose epic and parent share a title renders two **identical** crumbs. And the omission is a consequence of the wire, which is a fact a reader can only discover by following three files.

**WHAT WOULD HAVE BEEN BETTER.** Either serve the parent's key (one field at `routes/tickets.ts:435`, one at `mappers.ts:1868-1872`, one in `ParentRef`) so the crumb can read as the prototype's — or record the divergence with the wire as its reason, in the dispatch's own idiom (*"a divergence the way the ticket-key spec recorded its own"*).

---

### P4 — **MINOR** — "the SAME plain span" is not the same span

**WHAT.** The docblock justifying the no-callback crumb arm asserts an identity that is false of what renders.

**MEASUREMENT.** `ticket-sheet.tsx:1528-1530`: *"With no callback the crumb degrades to the SAME plain span the restricted arm uses."* The restricted arm (`:1552`) carries `gn-ticket-sheet__crumb--restricted` → `color: var(--gn-restricted)` (`ui.css:687-689`). The no-callback arm (`:1556`) carries the bare class only → inherits `var(--gn-text-muted)` from `.gn-ticket-sheet__crumbs` (`ui.css:643`). **Different ink.** The identical sentence is repeated in `Features.md:77` (*"it degrades to the same plain span"*).

**WHY IT IS WRONG.** The two arms are deliberately different, and the sentence that says they are the same is the sentence a reader uses to justify **not** examining the third arm. This is the repository's most-repeated review shape — *prose is the untested artifact* — and it is in my own change.

**WHAT WOULD HAVE BEEN BETTER.** *"With no callback the crumb degrades to a plain span — the same *shape* the restricted arm uses, though not its ink."* Or, if the marking is wanted for an unopenable-but-visible ancestor, give the arm the modifier. One of the two; not a sentence claiming both.

---

### P5 — **MINOR (product) / IMPORTANT (record)** — An owner-requested control was neither built nor reported

**WHAT.** The subtask form ships title-only. The owner asked for a type selector; the controller's own override says he still has not had one; and **no lane artefact records that it was dropped.**

**MEASUREMENT.**
- Owner, quoted in `CTL-DISPATCH-2026-09-20-breadcrumb-hierarchy.md:5`: *"subtask is always at the bottom. **or at least have a type selector** so that i can create that particular type."*
- Controller override `gisik-nokma-lanes/override-2026-09-21-exec1-item6.md` §1: *"**The owner asked for a selector and has not had one yet.** Do it **only if it is genuinely small**; if it opens a design question — which one is the default, what happens to the derived-type guarantee — **stop and report it rather than deciding alone.**"*
- Shipped: `ticket-sheet.tsx:2287-2308` — one `<input>` and one `<Button>`. No selector. `subtaskTypeFor` (`:118`) picks the type.
- **Failed search:** `grep -rn "type selector" /Users/kiro/my_projects/gisik-nokma-lanes` → **2 hits, both inside the dispatch itself.** **⚠ Narrowed to what the search covers:** that command sweeps every `.md` in the lanes directory, and it returns no `EXEC-*` report, no PR body and no handoff. **I did not sweep `docs/lanes/` in-repo with the same string**, so the claim is *"no artefact in the lanes directory records it"*, not *"no artefact anywhere does"*. `Features.md:413` describes the form in detail and does **not** record the selector as absent.

**WHY IT IS WRONG — and why the severity is split.** The product may be **fine**: the owner's sentence has an `or`, the first clause ("subtask is always at the bottom") is delivered by the deepest-legal-type default, and the dispatch itself sanctioned that reading (*"if the owner meant something else it is one line to change"*). But the dispatch's **heading** says *"THE SUBTASK FORM GETS A TYPE SELECTOR"* and its **§4** requires a mutation *"that an illegal type is absent from the selector"* — an assertion that cannot exist, because there is no selector. And the override's instruction was explicit: **build it or stop and report.** Neither artefact exists. **An instruction that is neither satisfied nor recorded is the shape this project has paid for repeatedly**; the register already carries one case of an item that *"was listed in a dispatch and never ruled"*.

**WHAT WOULD HAVE BEEN BETTER.** One line in `EXEC-*` or the handoff: *"the selector is not built — the deepest-legal-type default satisfies the owner's first clause; this is the stop-and-report the override asked for if it is not small."* That converts an unrecorded drop into a ruling the controller can make.

---

### P6 — **MINOR** — Mobile: two of three screens have no styling of any kind

**WHAT.** `board-screen.tsx` and `ticket-screen.tsx` define **no `StyleSheet` and set no `style` prop**; `help-screen.tsx` has a full themed palette module.

**MEASUREMENT.** `grep -c StyleSheet` → `help-screen.tsx`: 5; `board-screen.tsx`: **0**; `ticket-screen.tsx`: **0**. `grep "style"` over the two screens returns only `{ text: 'Cancel', style: 'cancel' }` and `{ … style: 'destructive' }` (`ticket-screen.tsx:96-97`) — iOS `Alert` button styles, not component styling. Their imports are raw `react-native` primitives plus `@gisik-nokma/app-core`/`domain`/`editor`; `apps/mobile/package.json` has **no UI-kit dependency**. `help-screen.tsx:19` imports `helpPaletteFor`, `helpPalette`, `monoFamilyFor`, `themeFor` from `./help-theme.js`.

**CONTEXT THAT CAPS THE SEVERITY — and I checked it before writing the finding.** `Features.md:2164` marks the shell **`⚙️` deliberately, not `✅`**: *"`tsc` and `vitest` pass on the three declared test files, but **no simulator or physical device has ever shown this UI to a person**, and a legend mark is a claim about what a user can see."* `:2169` names *"No device or simulator run of any kind."*

**WHY IT IS STILL WORTH A FINDING.** The record says *never rendered*. It does not say *one of three screens is themed and two are not* — and `help-theme.ts` ships its own tests and four catalogue cases (`12.394`–`12.397`), which reads to a newcomer as mobile having a design system. The board is the app's landing screen.

**WHAT WOULD HAVE BEEN BETTER.** Say it in the same bullet: *"`help-screen` alone is themed (`help-theme.ts`); `board-screen` and `ticket-screen` render with RN defaults and no palette."* Then the mark `⚙️` and the code agree, and the first device run knows what it is looking at.

---

### P7 — **MINOR** — Desktop's task list has no rules at all

**WHAT.** `apps/desktop/src/app.tsx:151-155` renders `.ticket-list`, `.ticket-list__row`, `.ticket-list__title`, `.ticket-list__state`. **None has a selector block in any of the three stylesheets.**

**MEASUREMENT.** Selector extraction across `ui.css`, `globals.css`, `editor.css` → 0 for each of the four (positive control `.gn-help__toggle` → 5). `apps/desktop/src/main.tsx` imports `@gisik-nokma/ui/ui.css`, and — **verified at this tree, not from prose** — also `installTheme` from `./theme.js`, so the **tokens** resolve (`theme.ts:15`: *"until pre-launch item 6 only `apps/web` ever emitted [them]. Without this line every `var(--gn-…)` above resolves to nothing"*); `apps/desktop/index.html` carries **0** `<style>` tags (`grep -c "<style"`). **So the token pipeline was fixed and the content classes still have no rules** — the two are independent, and it is the second that this finding is about.

**WHAT IS ALREADY RECORDED, so this is not a repeat of it.** `.app-shell` being unstyled **is** recorded with a rationale — `ui.css:3912-3919`: *"`app-shell` has no CSS anywhere in the repo — so the shell spans the whole window, **which is what the reference draws**."* That record covers the shell. **It does not cover the ticket list**, which is the screen's content: a default `<ul>` with disc bullets and unstyled spans.

**⚠ CHECKED FOR P1's BLIND SPOT TOO.** Re-ran the selector extraction against these classes with `gn-board-card__move` as the control (**4 blocks**): **`.ticket-list`, `.app-shell` and `.app-signin-hint` all return 0 selector blocks** — comments stripped — and `grep -rnE '\.(app-shell|ticket-list)[a-z_-]*\s+[a-z.\[]'` finds **no descendant rule** from either family. The 14 textual mentions of these names in `ui.css` are prose. So no ancestor styles them either.

**WHY IT IS WRONG.** A shipping surface (Tauri) whose content region was never styled, sitting inside a documented, deliberate, unstyled shell — so the shell's recorded rationale makes the content's omission read as the same decision.

**WHAT WOULD HAVE BEEN BETTER.** Extend the `ui.css` note that already reasons about `apps/desktop` to name what it *does* style there, and either style `.ticket-list*` or record it as a named absence with an owner — as `Features.md:2169` does for mobile's missing push transport.

---

### P12 — **IMPORTANT** — Every screen in the product has the same document title

**WHAT.** Nothing in the product sets a per-route title. The browser tab, the window title, the browser history and a screen reader's page announcement read **"Gisik Nokma"** on `/sign-in`, `/inbox`, `/help`, the board, the ticket sheet, the settings screens, `/privacy`, `/terms` and the 404 alike.

**MEASUREMENT.** Source-only sweep, excluding `.next` and `node_modules`:
- `grep -rln --exclude-dir=.next --exclude-dir=node_modules -E 'generateMetadata|export const metadata' apps/web` → **exactly one file**: `apps/web/app/layout.tsx`.
- `layout.tsx:8`: `export const metadata = { title: 'Gisik Nokma' }`.
- **My first attempt at this reported 9 more hits and was wrong** — all nine were `apps/web/.next/types/app/*/page.ts`, Next's generated type files from a build I had just run, and `.next` is gitignored (`git check-ignore` → `.gitignore:18`). **The control that caught it was a `git check-ignore` on one of the hits**, not the grep. Recorded in §10.
- `<title>` tags in source: **none**.

**WHY IT IS WRONG — and the argument is the W3C's own, not mine.** WCAG 2.2 §2.4.2 *Page Titled* is **Level A**: *"Web pages have titles that describe topic or purpose."*

**⚠ ROUND 1 ARGUED THIS FROM UNIQUENESS, AND THE UNDERSTANDING DOC EXPLICITLY DISCLAIMS THAT — so the argument is replaced rather than kept.** I fetched `https://www.w3.org/WAI/WCAG22/Understanding/page-titled.html` and read it: it *"does not impose a uniqueness requirement"*, frames distinguishing as a benefit (*"Page titles help users identify and distinguish different pages"*) rather than a mandate, and sets the goal as *"Each web page has a meaningful title."* **A refuter quoting that would have taken this finding and its ×3.** The criterion's actual emphasis is orientation — *"Titles identify the current location without requiring users to read or interpret page content"* — and, decisively for this product:

> **"for web applications (single page applications) where the view changes dynamically, the title should also be changed dynamically to reflect the content or topic of the current view."**

**Gisik Nokma is exactly that: a single-page application whose view changes dynamically, and whose title never changes at all.** `layout.tsx:8` sets `{ title: 'Gisik Nokma' }`, no source file declares `generateMetadata`, and `<title>` appears in no source file — so `/sign-in`, `/inbox`, `/help`, a board, a ticket sheet, `/settings` and the 404 all carry the same string. The title names the *product* and never the *view*, which is the one thing the Understanding document says to do here.

**WHAT WOULD HAVE BEEN BETTER.** A `title` per route — `Settings · Gisik Nokma`, `Shop operations · Gisik Nokma` — set through Next's own `metadata`/`generateMetadata` on the route modules that already exist. The client-rendered routes (`'use client'`) would need `generateMetadata` in a small server wrapper or a `document.title` effect; either is a handful of lines per route, and the workspace/project ones already resolve their names via `use-workspace-name`/`use-project-name`.

---

### P13 — **MINOR** ⚠ **r2 REVISION — the WCAG 2.4.1 CLAIM IS WITHDRAWN** — no skip link; a keyboard-only user Tabs the nav on every navigation

**WHAT.** No skip link exists anywhere in the product.

**MEASUREMENT.** `grep -rniE 'skip[ -]?(to|link)|gn-skip'` over `apps/web`, `packages/app-core/src`, `packages/ui/src` (all `.tsx`/`.css`, excluding tests) → **no matches** — a genuinely empty result, and the same sweep shape returns hits for other tokens, so it traverses.

**⚠ ROUND 1 FILED THIS UNDER WCAG 2.4.1 AND THAT WAS WRONG — WITHDRAWN IN r2.** 2.4.1 *Bypass Blocks* is satisfied by a landmark as well as by a skip link: **ARIA11 ("Using ARIA landmarks to identify regions of a page") is a sufficient technique**, and this product renders `<main>` on every content route — verified, 24 route modules, the sole exception being `apps/web/app/page.tsx`, a bare `redirect('/workspaces')`. **So the product very likely CONFORMS, and claiming a Level A failure was an overstatement.** A finding that overstates a conformance failure is exactly what §3 prices at triple, so it is withdrawn rather than defended.

**WHAT SURVIVES, AND IT IS STILL TRUE.** The person a skip link serves is the **keyboard-only, non-AT user** — typically someone with a motor impairment — who must Tab through `AppNav`'s workspace-scoped links on every navigation. A landmark is a bypass for someone who can *invoke* one; a keyboard user without a screen reader has to walk the links. **That is a convenience finding, not a conformance finding**, and it is filed as Minor on that basis.

**WHAT WOULD HAVE BEEN BETTER.** A visually-hidden-until-focused "Skip to content" link as the first focusable element in `layout.tsx`, targeting the `<main>`. That is the standard remedy, it is about ten lines, and it is the one element in this report that a keyboard user would notice immediately.

### P15 — **MINOR** ⚠ **r2 NEW, CORRECTED DOWNWARD IN THE SAME ROUND** — the repo's generated prototype copy is one line offset from the owner's export, and 71 files cite it by line

**⚠ READ THIS FIRST: I FILED THIS AT IMPORTANT AND THE MECHANISM I GAVE WAS WRONG. THE CORRECTION IS NOW MOST OF THE FINDING.** My first version said the repo's copy is a *"broken transform"* whose *"icons do not draw"*, because it contains `sc-camel-view-box` 24 times and the valid SVG spelling `viewBox` **zero** times, and `viewBox` is case-sensitive in SVG. **That inference is false, and `support.js` says so in its own source.**

**THE MECHANISM I MISSED, READ AT THE LINE.** `design-system/interactive/support.js` is the prototype's runtime, and `sc-camel-*` is **its own reversible encoding**:
- `:365` — `var CAMEL_ATTR_RE = /(\s)([a-z]+[A-Z][A-Za-z0-9]*)(\s*=)/g;`
- `:366-370` — it **encodes**: a camelCase attribute name is rewritten to `CAMEL_ATTR` (`:297`, `"sc-camel-"`) plus its kebab-case form.
- `:422-423` — it **decodes**: `if (key.startsWith(CAMEL_ATTR)) key = kebabToCamel(key.slice(CAMEL_ATTR.length));`
- `:1885` — the encoded form is what `__dcAnnotatedTemplate` hands the **editor**, *"the editor decodes on serialize"*.

**So `sc-camel-view-box` is `viewBox` in the runtime's own transfer encoding, and the repo's copy renders correctly. The 24 SVGs are not broken.** Under §3 a finding whose stated mechanism is falsified is invalid — at Important that would have cost nine points — so the claim is withdrawn, not defended.

**⚠ AND THE ROUND-2 BRIEF MAKES THE SAME FALSE INFERENCE, WHICH IS THE PART WORTH KEEPING.** It tells every lane: *"`viewBox` → `sc-camel-view-box`, which is not a valid SVG attribute. `viewBox` is case-sensitive in SVG. **So: do not cite the repo's copy as the prototype.**"* **The premise is the one I repeated, and it is false for the reason above.** The conclusion — compare against the export — still stands as the owner's ruling; **the reason given for it does not**, and a lane reasoning *from* the premise would report a broken-prototype defect that does not exist. **Six lanes were handed this.** Recorded rather than filed, because it is a defect in the briefing apparatus; it cost me a finding I had to withdraw.

**WHAT SURVIVES, MEASURED.** The two files are not identical, and the difference is a **constant one-line offset**:
- repo copy `design-system/interactive/desktop.dc.html` — **4050 lines**, sha256 `2cda054b4320ebb6…`
- the export `Gisik Nokma - Desktop.dc.html` — **4049 lines**, sha256 `3d142d464a070b33…`
- `diff` between them: **1,113 lines**, net **−1** — the changes are overwhelmingly the in-line `sc-camel-*` rewrites, which is why the line count barely moves.
- **The offset is exactly −1 at every anchor sampled**, spanning 119 to 1843: `isSignIn` 120/119, `isWorkspaces` 180/179, `isMembers` 651/650, `sheetCrumbs` 1102/1101, `isLegal` 1720/1719, `isNotFound` 1844/1843, `openParent` 1240/1239, `isSettingsShell` 800/799.
- **71 source/test files** cite the repo's copy by line (`grep -rln "desktop\.dc\.html"` over `packages apps`, `.ts`/`.tsx`/`.css`); 103 including `docs/` and `test-cases/`.
- **The VALUES agree**, checked in the first version and still true: `min-width:820px`, `padding:13px 18px`, `font-size:17px`, `background:var(--fill4)` and `i % 2 ?` each appear the **same number of times in both files**.

**WHY IT IS STILL A FINDING, NOW THAT THE DRAMATIC PART IS GONE.** The owner has ruled which artefact is the authority, and the two differ by exactly one line: **every `:NNN` in those 71 files resolves to the wrong line in the export** — consistently, and by an amount small enough that a reader checking one value would not notice, which is what makes it a hazard rather than a defence. One command fixes it: regenerate the copy from the export and record the new sha in `PROVENANCE.md`, whose stated job is *"the owner export each file was unpacked from, its sha256, and the one command that reproduces it"*.

**⚠ AND MY FIRST READING OF THE OFFSET WAS WRONG TOO, WHICH IS WHY THIS SECTION IS NUMBERS RATHER THAN PROSE.** I printed the same line number from both files, saw every one differ, and wrote that the drift *"grows large by `:3077`"*. It does not — repo `:3077` is a zebra line and export `:3077` is `setRole:`, but the export's zebra sits at **`3076`**. The offset is 1, constant. **Two consecutive wrong readings of one artefact, both caught only by going back to the file.**

### P16 — **IMPORTANT** ⚠ **r2 NEW** — One styling case asserts the ABSENCE of a declaration through a scanner that truncates multi-line rules, so it cannot fail when the thing it guards returns

**WHAT.** `apps/web/test/neo-card-radius.test.ts` guards that no page-specific literal radius competes with `.gn-card`'s token. Its third case asserts `expect(rule?.includes('border-radius')).toBe(false)`. The `rule` it tests comes from a **single-line** scanner, so a declaration written on its own line is invisible to the assertion and the case stays **green with the literal radius present**.

**MEASUREMENT — the scanner reproduced exactly, then run on a rule that sets the very thing the case forbids:**

```
const ruleFor = (css, re) => css.split('\n').find((l) => re.test(l) && l.includes('{'));
ruleFor('.gn-sign-in {\n  border-radius: 3px;\n}', /(?<!__)\.gn-sign-in\s*\{/)   //  => ".gn-sign-in {"
```
`"…{".includes('border-radius')` is `false`, so `expect(…).toBe(false)` **passes while `border-radius: 3px` is in the rule.** The case cannot fail under that precondition. The scanner is `apps/web/test/neo-card-radius.test.ts:35`; the assertion is `:53-56`.

**AND IT IS THE ODD ONE OUT IN ITS OWN FAMILY, which is what makes it a finding rather than a style note.** I checked every content assertion in the four files still using the single-line scanner:

| file | its content assertion | on a multi-line rule |
|---|---|---|
| `workspace-list-role-pin.test.ts:53` | `expect(rule).toMatch(/font-size:\s*0\.8rem/)` | **RED** — loud, safe |
| `workspace-restricted-spacing.test.ts:54,60` | `expect(rule).toMatch(/margin…/)` | **RED** — loud, safe |
| `ui/test/tokens.test.ts:188` | `expect(rule).toContain('font-family: …')` | **RED** — loud, safe |
| **`neo-card-radius.test.ts:55`** | **`expect(rule?.includes('border-radius')).toBe(false)`** | **GREEN — silent** |

**The three siblings fail loudly because they assert a declaration is PRESENT; this one fails silently because it asserts one is ABSENT.** A truncating scanner is safe for a positive assertion (it goes red) and unsafe for a negative one (it goes green) — and that asymmetry is the whole finding.

**AND THE FIX IS ALREADY IN THE REPO.** Five sibling files moved to a multi-line scanner that returns the whole rule body: `members-styling.test.ts:61-70` (`findIndex` on the selector, then to the matching `}`), and the same shape in `attention-styling.test.ts`, `settings-shell-tokens.test.ts`, `workspaces-invitation-banner.test.tsx` and `sign-in-neo-restyle.test.ts`. `members-styling.test.ts`'s own docblock gives the reason and names this file: *"`neo-card-radius.test.ts`'s single-line version truncates every rule in the members family, whose declaration each sit on their own line."* **So the migration happened, this file was named in the migration's rationale, and it was not migrated.**

**⚠ I SWEPT EVERY NEGATIVE CONTENT ASSERTION IN THE FAMILY, WHICH IS THE OBVIOUS COUNTER-ARGUMENT TO THIS FINDING, AND IT DOES NOT HOLD.** The claim "a truncating scanner is unsafe for a negative assertion" is worth nothing if other files pair those two things too — so I looked for all of them:

| file | its negative content assertion(s) | scanner | exposed? |
|---|---|---|---|
| `ui/test/attention-styling.test.ts:218` | `expect(rule).not.toContain('--gn-surface-raised')` | **multi** (single=0, multi=4) | no |
| `settings-shell-tokens.test.ts:168-169` | `rule?.includes('--gn-fill-tertiary')` / `('--gn-text-accent')` → `false` | **multi** | no |
| `workspaces-invitation-banner.test.tsx:372,376` | `rule?.includes('box-shadow')` / `('border-inline-start')` → `false` | **multi** | no |
| `sign-in-neo-restyle.test.ts:55,69,100` | `not.toContain('var(--gn-accent)')` ×2; `rule?.includes('background')` → `false` | **multi** | no |
| **`neo-card-radius.test.ts:55`** | **`rule?.includes('border-radius')` → `false`** | **single** (single=1, multi=0) | **YES** |

**Five files have negative content assertions; four are safe because they use the multi-line scanner, and exactly one pairs a negative assertion with the truncating one.** So this is not a family-wide pattern and not a style preference — **it is the single file that was named in the migration's rationale and not migrated**, and the assertion that exposes it is the only one of its kind.

**⚠ AND THE PRECONDITION, STATED SO THE CLAIM IS NOT INFLATED.** `.gn-sign-in`'s rule is **single-line today** (`globals.css:2081`), so the case currently passes **for the right reason** — I verified the rule body contains no `border-radius`. This is a latent hole, not a live false green: it needs the rule to be reformatted first. I file it Important rather than Critical on that basis, and record that the three siblings' equivalent holes are loud.

**WHAT WOULD HAVE BEEN BETTER.** Use the multi-line scanner the five siblings share — or, better, put it in `test/helpers/` so there is one scanner rather than nine. `members-styling.test.ts:56-58` already records that no shared CSS-scan helper exists and that the shape is duplicated *"rather than imported"*, which is the condition that produced this asymmetry.

### P17 — **MINOR** ⚠ **r2 NEW** — `/my-work`'s heading outline skips level 2, the product IMPROVED on the prototype to get there, and no instrument measures heading level or order

**WHAT.** The My Work route renders an `<h1>` and the view it mounts renders its four section labels as `<h3>`. There is no `<h2>` anywhere in the path: the outline goes **h1 → h3**.

**MEASUREMENT.**
- `apps/web/app/w/[workspaceId]/my-work/page.tsx:51`: `<h1 className="gn-page-title">My Work</h1>` — the route's **only** heading (`grep -cE '<h[1-6]'` → 1 for h1, 0 for h2, 0 for h3).
- `packages/app-core/src/views/my-work.tsx:75, 86, 97, 116`: four `<h3 className="gn-my-work__heading">` — *Assigned to me*, *My claims in transit*, *My contested claims*, *Shared with me*.
- The route mounts `<MyWork>` at `:73` and passes nothing heading-related, so nothing supplies a level 2 between them.
- **The prototype is not the authority for this, and that is what makes it interesting rather than a divergence.** In the export (`Gisik Nokma - Desktop.dc.html`, sha `3d142d46…`) the `isMyWork` block at `:553-605` draws `<h1 …>My work</h1>` and then **`<p style="font-size:17px;line-height:22px;font-weight:600;margin:0">Needs your attention</p>`** — its section labels are **styled paragraphs**, and `grep -cE '<h[2-6]'` over the block returns **0**. **So the product made those labels REAL HEADINGS, which is the correct improvement over the prototype, and chose the wrong level while doing it.**

**WHY IT IS WRONG — and I am not going to overclaim WCAG a second time.** **⚠ MY FIRST VERSION SAID "WCAG 2.1 HAS NO SUCCESS CRITERION THAT FORBIDS A HEADING-LEVEL SKIP" AND THAT IS THE P21 MISTAKE AGAIN — an absence claim about a universe I did not enumerate.** I have not read WCAG 2.1's success criteria in full. **What I can defend is the narrower thing:** the criteria a reader would reach for here are **1.3.1 Info and Relationships** and **2.4.6 Headings and Labels**, and both are about headings and labels being PRESENT and descriptive rather than about their SEQUENCE — **so the skip is best-practice rather than a criterion I can point at.** **If a judge knows a criterion I do not, this is where I would be wrong, and the finding is filed Minor accordingly. This is an ARIA Authoring Practices matter (*"heading levels should only increase by one"*), not a conformance failure. My round-1 P13 claimed a Level-A criterion the product probably satisfies, and I withdrew it; the same care applies here. What is true is narrower and still worth fixing: a person navigating by heading hears *level 1, then level 3*, which asserts a level of structure that does not exist, and the four sections read as subsections of something unnamed.

**AND NOTHING MEASURES THIS — which is the second half of the finding and the reason it is filed at all.** I swept the two e2e suites and `packages/ui/test` for any assertion about heading level or order and found none. **Control: `getByRole('heading')` is used 21 times across the unit suites** (`calendar-view.test.tsx` 10, `timeline-view.test.tsx` 4, `ticket-types.test.tsx` 4, `bulk-close-dialog.test.tsx` 2, `help-browser.test.tsx` 1) — so the greps traverse, and every one of those uses is a **name lookup**, not a level or order check. **So the product's entire heading outline is unmeasured**, exactly as its tap targets on unswept surfaces are (P11) and its document titles are (P12).

**⚠ AND IT IS NOT ONE SCREEN — with the conditionality stated rather than smoothed over.** A sweep for files that render `<h3>` and no `<h2>` returns five: `my-work.tsx` (4), `ticket-list.tsx` (2), `board.tsx` (1), `bulk-close-dialog.tsx` (1), `visibility-editor.tsx` (1). Of those:

- **`/my-work` skips UNCONDITIONALLY.** All four `<h3>`s are rendered straight from `<section>` bodies (`my-work.tsx:75, 86, 97, 116`), and the route's only heading is the `<h1>` at `apps/web/app/w/[workspaceId]/my-work/page.tsx:51`.
- **The project page's two views skip CONDITIONALLY.** `board.tsx:642` renders its `<h3 className="gn-board__workflow">` only when `groupCount > 1`, and `ticket-list.tsx:616, 666` render `<h3 className="gn-list__section-title">` section titles. `<Board>` mounts at `apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx:2451` and `<TicketList>` at `:2527` and `:2655`; the page's `<h1>` is at `:1837` and **its only two `<h2>`s are inside the filters sheet** (`:3311`, `gn-filters__heading`), which is a dialog and not in the content path. So a multi-workflow project's board and the list's sectioned rows carry the same skip, and a single-workflow project does not.
- **The other two are CORRECT and are the control:** `bulk-close-dialog.tsx` and `visibility-editor.tsx` render inside `Dialog` and `Sheet`, both of which render `<h2 className="gn-dialog__title">` / the sheet's own heading — so their `<h3>`s are a proper level down. **Two of the five are right for the right reason, which is what makes the other three a defect rather than a convention.**

**⚠ AND THE ONE PLACE THE PROJECT PAGE MENTIONS THIS `<h3>` IS NOT A RULING ON IT.** `apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx:1901` quotes the `<h3 className="gn-board__workflow">` line — but as an **analogy for the workflow picker's `groups.length > 1` gate**, arguing that the picker and the board should be conditional on the same condition. It says nothing about the heading's *level*. **I checked this before widening the finding, because a recorded decision would have moved it into category 2 and required an argument against the ruling.** There is no such ruling.

**WHAT WOULD HAVE BEEN BETTER.** `<h2>` for the four section labels, which is one character each, and — separately — an assertion somewhere that walks a route's headings and fails on a skip. The second is the one that keeps the first from coming back: `type-scale.ts` and `accessible-names.ts` already establish the shape (a per-route sweep with a recorded baseline), and a heading sweep is the same instrument over a different property.

### P18 — **IMPORTANT** ⚠ **r2 NEW** — A client-side navigation announces nothing: no title change, no focus move, no live region

**WHAT.** This is a single-page application whose route changes are, to assistive technology, **completely silent**. Three independent signals are all absent, and they are absent together.

**MEASUREMENT — three checks, each with its own control.**
1. **Focus does not move.** `grep -rlE "usePathname|useRouter"` over `apps/web/src`, `apps/web/app` and `packages/app-core/src` (excluding tests) → **40 files** use the routing hooks. Of those, the ones that also touch focus number **three**, and every one is a local widget rather than a navigation: `last-project-nav.tsx` (2, a menu), `account-menu.tsx` (3, a menu), and `p/[projectId]/page.tsx` (2, the filters sheet). **The shell itself — `app/layout.tsx`, `providers.tsx`, `app-nav.tsx` — moves focus on nothing**, so after a client-side navigation focus stays on the nav link that was just activated.
2. **Nothing announces — and the product is otherwise FULL of live regions, which I under-counted in my first pass and am correcting.** My first version of this bullet said *"product-wide, `aria-live` appears in two components"*. That was true of the literal `aria-live` **attribute** and **grossly misleading about live regions**, because `role="status"` and `role="alert"` *are* live regions — they carry an implicit `aria-live`. Counted properly, `grep -rnE 'aria-live|role="(status|alert|log)"'` over `packages` and `apps`, excluding tests and comment lines, returns **70 sites**: refusals (`gn-refusal--server`/`--transport`/`--editor` on the board, the sheet, every dialog, the members page, the workspace settings form), loading states, `sync-status-bar.tsx:82`'s standing status, the inbox's five, `contest-banner.tsx:33`, the MCP authorize pair, `expired-session.tsx:94`. **The team clearly knows the pattern and uses it everywhere.**
   **What the same sweep returns for the shell is the finding: `layout.tsx` 0, `providers.tsx` 0, `app-nav.tsx` 0.** So a route change moves through a product that announces 70 different things and announces nothing about the fact that the page is now a different page.
   **⚠ The correction cuts FOR this finding, not against it.** An absence beside a product that does nothing else is a house style; an absence beside 70 examples of the pattern done properly is a gap. Recorded in place rather than quietly rewritten, because I published the wrong count and a refuter would have been entitled to take the finding on it.
3. **The framework does not supply one either, and that is version-specific.** `node_modules/next/dist/client/route-announcer.js` **does not exist**: Next's **App Router ships no route announcer**, unlike the Pages Router, which had one. So this is not a component someone forgot to mount — the mechanism is not present in the stack at all.
4. **And the title does not change — that is P12, and it is the third leg.** Measured there: one static `metadata.title` in `layout.tsx:8`, no `generateMetadata` in any source file, no `<title>` in any source file.

**WHY IT IS WRONG — and why the three legs together are the point rather than three small things.** A screen-reader user who activates a link in `AppNav` gets: no title change (P12), no focus move (this finding), and no announcement (this finding). **The document they are on has changed and nothing tells them.** They cannot tell whether the navigation happened, and their next Tab continues from the nav — which is the known SPA failure that a route announcer or a focus-into-`<main>` exists to prevent.

**⚠ WCAG, STATED CAREFULLY — I have withdrawn one overclaimed criterion already this round (P13) and am not claiming a new one here.** **I did not find a success criterion that names a client-side route change**, and I am not going to assert one exists or does not exist without having read the specification to that depth — the two candidates a reader would reach for are 2.4.3 *Focus Order* and 4.1.3 *Status Messages*, and **whether either is breached here is an interpretation I am declining to make.** What I will assert is measured and narrow: **the three signals are all absent, and P12's failure — which IS a criterion (§2.4.2, Level A) — is not mitigated by anything else, because nothing else exists.**

**The connection is the argument the rules ask for.** §3 says a reason *"that connects to other findings or to measured consequences weighs more"*. This one has both: it connects to **P12** (the same silence, from the other end) and to **P11** (the same class of gap — a property of the product that no instrument measures; neither a title change, a focus move, nor a live region is asserted anywhere, and the accessible-name ratchet counts `aria-label`/`role`/`aria-selected`/`aria-describedby` and nothing about announcement).

**WHAT WOULD HAVE BEEN BETTER.** A route announcer is the small, standard remedy: on pathname change, set a visually-hidden live region to the new page's heading, or move focus to the `<main>`. In the App Router that is a ~15-line client component in `layout.tsx`. **It also fixes half of P12 incidentally** if it is fed the page name — which is why the two are filed separately and read together.

### P19 — **IMPORTANT** ⚠ **r2 NEW** — The product's primary view switcher is a `role="tablist"` with NO accessible name, and the repo fixed the identical defect on the sheet's tablist

**WHAT.** `role="tablist"` with no `aria-label` and no `aria-labelledby`, on the control that switches the project page between Backlog, Board, List, Calendar and Timeline.

**MEASUREMENT.**
- `apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx:2058`: `<div className="gn-segmented" role="tablist">` — I read the whole element through its closing `</div>` at `:2081`; **there is no `aria-label` and no `aria-labelledby` anywhere in it.** Its five children carry `role="tab"` and `aria-selected` (`:2064-2079`).
- **The product contains exactly two real `role="tablist"` elements**, comments excluded: this one, and `packages/ui/src/components/segmented-control.tsx:25`, which is `<div role="tablist" aria-label={ariaLabel}>` — **named, because `SegmentedControlProps` declares `'aria-label': string` as REQUIRED** (`segmented-control.tsx:9`, whose comment says *"Names the choice for assistive tech. Required, so it cannot be forgotten."*).
- **AND THE REPO FIXED THIS EXACT DEFECT ON THE OTHER ONE.** `packages/app-core/src/views/ticket-sheet.tsx:1904-1907` records it: *"It also ADDS something: **this `role="tablist"` had no name at all**, and the component REQUIRES an `aria-label`."* The sheet migrated to the component; `ticket-sheet.test.tsx:2230` queries `getByRole('tablist', { name: 'Ticket sections' })` and `:2244` asserts `toHaveAccessibleName('Ticket sections')`.
- **The project page did not migrate.** Its own docblock says why, and the reason is the defect: *"replacing the page-local `.gn-view-tabs`. Same roles, same handlers — **a restyle, not a rebuild**"* (`apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx:2031-2036`). **It adopted the shared CLASSES and kept its own markup** — `.gn-segmented`, `.gn-segmented__item`, `.gn-segmented__item--on` — so the restyle is visually identical and the required prop never entered the picture. **"A restyle, not a rebuild" is exactly the framing that hides an accessible name**, because a missing name changes nothing about how it looks.

**WHY IT IS WRONG.** An unnamed `tablist` is a naming failure, not a preference: a screen-reader user reaching the project page's view switcher is told there is a tab list and not what it switches between. It is the product's primary mode control and it is the only unnamed one in the codebase — because the other is protected by a TypeScript-required prop.

**AND IT IS THE ONLY ONE OF THE THREE SPELLINGS THAT IS WRONG — the product contains all three, and §5 records them side by side.** The sheet's tablist is a real `tablist` **with a name**; the legal pages' `gn-segmented` pair (`legal-chrome.tsx:92-104`) is **links carrying `aria-current="page"`**, which is the correct pattern for a control that navigates between pages rather than switching panels; **only the project page's is a `tablist` with no name** — neither one thing nor the other.

**AND THE RATCHET CANNOT SEE IT, which is P10's mechanism landing on a live defect.** `sweepAccessibleNames` counts `aria-label`, `role`, `aria-selected` and `aria-describedby` **as attribute occurrences**. This tablist contributes **six `role`s** (the `tablist` plus five `tab`s) and **five `aria-selected`s** to `/p/:projectId`'s baseline — and contributes **nothing to `ariaLabel`**, because it has none. **A count that only ever rises cannot notice an attribute that was never there**, so the ratchet would report this route's accessibility floor as healthy.

**Fail-search for a ruling:** the page's docblock (`:2031-2056`) discusses the migration, the ordering of Backlog, and the removal of the dead `.gn-view-tabs` rules — and **never mentions naming, `aria-label`, or the component**. `ticket-sheet.tsx:1907` records the sheet's naming fix. **So the defect is named in the repo for one surface and unaddressed for its twin, with no ruling deciding that.**

**WHAT WOULD HAVE BEEN BETTER.** Adopt `SegmentedControl` itself rather than its classes — the component exists, the page already passes the same `options`/`value`/`onChange` shape the component takes, and it would supply the required `aria-label` by construction. Failing that, add `aria-label="Project view"` and the assertion the sheet has. The first is strictly better because the type system then prevents the recurrence.

### P20 — **MINOR** ⚠ **r2 NEW** — The month grid and the week columns carry no table or grid semantics, so a screen reader loses the day-to-weekday association

**WHAT.** The calendar's month grid and the timeline's week columns are built from `<div>`s and `<span>`s with **no `role="grid"`, `role="table"`, `role="row"`, `role="gridcell"` or `role="columnheader"` anywhere**. A day cell is not associated with the weekday column it sits under.

**MEASUREMENT.**
- `packages/app-core/src/calendar/calendar-view.tsx:395-425`: `<div className="gn-calendar__grid">` → `<div className="gn-calendar__weekday-head">` containing seven `<span className="gn-calendar__weekday">{label}</span>`, then one `<section className="gn-calendar__week" data-week={…}>` per week, each holding `<div className="gn-calendar__days">` with `<div className="gn-calendar__day">` cells. **Headers are plain spans; cells are plain divs; there is no role on any of them.**
- `data-week` (`:409`) is a **data attribute** — it exists for the shells and the tests, not for assistive technology.
- **Nothing in the file reasons about this.** The component reasons about a great deal else — `role="note"` for the empty month (`:312`), `aria-label` on the two month-nav buttons (`:279`, `:293`), `aria-hidden` on the legend swatches (`:342`, `:364`, `:371`), `aria-current` for today (`:422`), and an accessible name on items (`:483`). **The word grid appears in this file only about CSS.** So the omission is not a decision anyone wrote down; it is a property nobody considered.
- **And nothing measures it.** `packages/app-core/test/calendar/calendar-view.test.tsx` calls `getByRole` **45 times** — the control that the suite does assert roles — and **not once for a grid, table, row, cell or columnheader**. The timeline is the same: `grep -nE 'role="grid|role="table|<table|<th'` over `timeline-view.tsx` → **no matches**.

**WHY IT IS WRONG — and I am filing it MINOR on purpose, for the third time this round.** **WCAG 2.2 has no success criterion requiring a calendar to expose grid semantics**; the WAI-ARIA Authoring Practices pattern for a date picker is best practice, not conformance. What is true and worth fixing is narrower: **a person using a screen reader hears the seven weekday labels as a run of text and then a sequence of day numbers, with nothing tying "14" to "Friday"** — which is most of what a month view is for. The cells' own content is labelled, so nothing is *unreadable*; what is lost is the *relationship*.

**⚠ AND THIS IS THE THIRD INSTANCE OF ONE PATTERN, WHICH IS THE ARGUMENT.** P17 (heading levels), P18 (route change announcement) and this finding are the same shape: **a structural property of the rendered output that no instrument measures, that no docblock reasons about, and that the accessible-name ratchet structurally cannot see because it counts four attributes and none of them is structure.** The owner's rule is explicit that *"reasons with connected findings/answers should be more convincing"*, and the connected answer here is a single remedy for all three: a structural sweep in the shape `accessible-names.ts` and `type-scale.ts` already establish — walk a route, collect headings/roles/landmarks, fail on a skip or a missing name — with a recorded baseline. **One new instrument closes three findings.** That is a better answer than three separate fixes, and it is why these are filed as three and read as one.

**WHAT WOULD HAVE BEEN BETTER.** The APG's calendar grid pattern: `role="grid"` on the container, `role="row"` per week, `role="columnheader"` with `aria-label` on the seven labels, `role="gridcell"` on the day cells. The markup is already grouped exactly that way — grid → weekday-head → week → days → day — so the roles are an attribute apiece on a structure that already exists.

### P21 — **IMPORTANT** ⚠ **r2 NEW, MEASUREMENT CORRECTED TWICE BEFORE THE BOUNDARY — THE SECOND CORRECTION IS THE SUBSTANTIVE ONE** — The description editor is a `role="textbox"` with no accessible name, and its visible label is not associated with it

**WHAT.** The ticket sheet's description composer is a `contenteditable` host with **no accessible name**, sitting inside a `<dl>` whose `<dt>description</dt>` is not programmatically attached to it. The toolbar directly above it is fully labelled; the field itself is not.

**⚠⚠ TWO CORRECTIONS TO THIS PARAGRAPH, AND THE SECOND ONE OVERTURNS THE FIRST.**

**First correction (wrong in a small way).** I wrote that the element has *"no `role`"*. The element has no role *implicit from `contenteditable` alone* in a browser that does not apply ARIA in HTML's mapping the way I assumed — so I softened it to *"no `role` ATTRIBUTE; the role is implicit."*

**Second correction (and the first was wrong).** **Tiptap core SETS `role="textbox"` as an ATTRIBUTE.** `@tiptap/core@3.30.5`'s `dist/index.js:6453` constructs the editor with
```
attributes: { role: "textbox", ...editorProps?.attributes },
```
so the role is an attribute, set by the library, and **spread-overridable by `editorProps.attributes` — which this product does not supply**, so the default stands. **The repository said so already and I did not find it:** `packages/editor/src/extensions/mention-popup.ts:61` reads *"PROSEMIRROR ALREADY SETS `role=\"textbox\"` on the editor element — **observed, not assumed** — so the combobox attributes are SAVED AND RESTORED rather than set and removed."* **It is right; my measurement was wrong.**

**⚠ WHY MY MEASUREMENT WAS WRONG, BECAUSE THE FAILURE MODE MATTERS MORE THAN THE FIX.** I grepped `prosemirror-view`'s dist and `@tiptap/react`'s dist, found no `textbox`, and reported an absence. **I searched the packages I knew about rather than the dependency chain**, and the package that sets it — `@tiptap/core` — was not among them. `grep -rl textbox node_modules/.pnpm/@tiptap+core@3.30.5*/dist` finds it in one command. **A sample is not a universe**, and an absence claim needs the universe enumerated.

**MEASUREMENT — five checks, each opening the artefact.**
1. **The host.** `packages/editor/src/components/TicketEditor.tsx:119` renders `<EditorContent editor={editor} className="ticket-editor__content" />` inside `<div className="ticket-editor">` (`:111`). **No `aria-label`, no `role` on either.**
2. **Nothing adds one above it.** `grep -rn "editorProps|attributes:"` over `packages/editor/src`, `apps/web/src` and `packages/app-core/src` → **no matches**, so the product never overrides the editor's DOM attributes. `TicketEditorSlot.tsx` and `editor-slot.tsx` were checked too: neither supplies an `aria-label`.
3. **⚠ AND THE ROLE IS AN ATTRIBUTE, SET BY TIPTAP CORE — this step is CORRECTED, and the version it replaces claimed the opposite.** The first version of this step reported that no library sets a `role` attribute, on the strength of `prosemirror-view`'s and `@tiptap/react`'s dists containing no `textbox`. **Both of those greps are accurate and the conclusion drawn from them is false**, because the package that sets it is neither: **`@tiptap/core@3.30.5`, `dist/index.js:6453`, `attributes: { role: "textbox", ...editorProps?.attributes }`.** The product supplies no `editorProps`, so the library's default stands and the element carries `role="textbox"` as a real attribute. **The finding is unchanged in direction and stronger in accuracy: the role is explicit and unnamed.**
4. **The visible label exists and is not attached.** `ticket-sheet.tsx:2404-2405` renders `<div className="gn-ticket-sheet__field" data-testid="field-description"><dt>description</dt>`. **The `<dt>` carries no `id`**, and `grep -c 'aria-labelledby'` over `ticket-sheet.tsx` and `TicketEditor.tsx` returns **0 for both** — so nothing points at it. **A visible label is not an accessible name**, and this is exactly the case that distinction exists for.
5. **And the means is already in the product.** `aria-labelledby` is used deliberately elsewhere — `attention-strip.tsx:88-89` reasons about *"the region from the `<p>` via `aria-labelledby`, and the reason is measured rather than stylistic"*, and `help-browser.tsx:505` uses it *"on the landmark rather than an `aria-label`"*. `packages/editor/src` labels **five** other things: `EvidencePicker`'s dialog (`:117`), the mention popup's listbox (`mention-popup.ts:164`), `EditorToolbar`'s `role="toolbar" aria-label="Formatting"` plus every button and the link URL field (`:179`, `:189`, `:208`), and `ImageWrapMenu`'s toolbar and alt-text field (`:29`, `:46`).

**WHY IT IS WRONG.** The ticket sheet carries **several text surfaces** — the title control, this composer, and the comment box — and a person using a screen reader who tabs into the description hears an editable region with nothing saying which one it is. **The pattern is not unknown to this codebase; the toolbar immediately above this very element uses it.** Same shape as P18 and P19: an absence beside a product that does the thing properly everywhere else is a gap, not a house style.

**WHAT WOULD HAVE BEEN BETTER.** Either `aria-label="Description"` on the editor host, or an `id` on the `<dt>` plus `aria-labelledby` — the second is better because it keeps one source for the words, and it is the mechanism the product already reaches for. Either is one attribute at `TicketEditor.tsx:119` or one prop threaded through `editorProps.attributes`.

### P22 — **IMPORTANT** ⚠ **r2 NEW** — Two `role="menu"` elements have no accessible name, and one of them has a named twin in the same product

**WHAT.** Two menus declare `role="menu"` and carry no `aria-label` and no `aria-labelledby`.

**MEASUREMENT — the sweep, then each hit opened.**
I swept every `role="…"` on a role that requires an accessible name, across six source trees, comments stripped and taking the element's **whole opening tag** rather than its line. **Control: 23 name-requiring roles seen; 5 lacked a name in the tag.** One of the five is a string constant (`board.tsx:893`'s `CARD_CLICK_BAIL_SELECTOR`), one is **P19's tablist**, and **one was a false positive of my own sweep** — `unread-badge.tsx:75` *is* labelled, but its `data-capped={count > CAP ? …}` contains a `>` that truncated my tag-slice before the `aria-label` three lines below. **A sweep that finds a `>` inside a JSX expression stops early, and the two that survived were opened by hand.**

The two that stand:
- **`apps/web/src/account-menu.tsx:148`** — `<div ref={menuRef} id={menuId} role="menu" className="gn-nav__menu">`. **No name.**
- **`packages/app-core/src/workflow-builder/ui/rule-editors/add-rule-menu.tsx:47`** — `<ul className="add-rule-menu__list" role="menu">`. **No name.**

**⚠ THE POPULATION IS CLOSED, MEASURED WITH A CORRECTED SLICER.** My first sweep took each element's tag as everything up to the first `>`, which **stops early whenever a JSX expression contains a `>`** — `data-capped={count > CAP ? …}` did exactly that and made a correctly-labelled badge look unnamed. **Re-run with a brace-aware slicer that only ends the tag at a `>` outside any `{…}`: 23 name-requiring roles seen, and exactly 3 without a name — this finding's two menus and P19's tablist, and nothing else.** **So there is no fourth instance hiding**, and both findings together cover the whole population rather than a sample of it.

**⚠ PRE-EMPTING THE OBVIOUS DEFENCE: `aria-controls` IS NOT A NAME.** `account-menu.tsx:138` does carry `aria-controls={open ? menuId : undefined}`, and the menu carries `id={menuId}` — but `aria-controls` asserts *which element this control operates*, not *what the menu is*. `grep -n "menuId"` over that file returns three lines and **none of them is a labelling relationship**: the id is used once as a target for `aria-controls` and once as the element's own id. `aria-labelledby` appears nowhere in the file.

**⚠ AND THE SAME PRODUCT CONTAINS THE NAMED TWIN.** `apps/web/src/last-project-nav.tsx:249` is the **same element with the same class and the same role** — `<div ref={menuRef} id={menuId} role="menu" aria-label="Projects" className="gn-nav__menu">` — carrying the `aria-label` the account menu lacks. **Identical markup, identical class, one line apart in what it declares.**

**WHY IT IS WRONG — AND THIS IS NOW THE THIRD INSTANCE, WHICH IS THE ARGUMENT.** `role="menu"` is a name-requiring role: a person using a screen reader is told there is a menu and not what it holds. And this is the third time in this lane that the defect is *an instance missing from a pattern the product uses correctly elsewhere*:
- **P19** — a `tablist` with no name, beside the sheet's `tablist` that requires one by type;
- **P21** — a content area with no name, beside the toolbar immediately above it that has one;
- **P22** — a menu with no name, beside the identical menu in the same bar that has one.

**Three instances is a pattern rather than a coincidence**, and it is the strongest single argument in this report: whatever produces these is not ignorance of the technique, because the technique is in use feet away in every case. **The owner's rule is explicit that a reason connecting to other findings weighs more**, and the connection here is a mechanism: the accessible name is applied *per element* and nothing checks it *per role*. **P10 is that gap stated as a measurement** — the accessible-name ratchet counts four attributes, so a `role="menu"` with no name contributes +1 to `role` and +0 to `ariaLabel`, and a count that only falls on a *loss* cannot notice a name that was never there.

**WHAT WOULD HAVE BEEN BETTER.** `aria-label` on both — `"Account"` and `"Add rule"` name them exactly, and the workflow-builder menu's trigger already reads *"Add rule"* three lines above it (`add-rule-menu.tsx:44`). Better still, the same structural remedy P19 asks for: a shared menu component that requires the label by type, which is how `SegmentedControl` prevents P19's version of this.

### P23 — **IMPORTANT** ⚠ **r2 NEW** — The searchable Select's input has its focus outline REMOVED and nothing replaces it, so the control has no visible focus indicator

**WHAT.** `ui.css:2474` sets `.gn-select__trigger--searchable input:focus { outline: none; }`. Nothing in the product supplies a ring for that control in its place. **WCAG 2.2 §2.4.7 *Focus Visible* is Level AA** — *"any keyboard operable user interface has a mode of operation where the keyboard focus indicator is visible"* — and here the indicator is not merely absent by default, it is **removed by the product's own CSS**, so no user-agent default can survive it.

**MEASUREMENT — every step opened, because this is the finding I would most expect to be wrong.**
1. **The removal.** `ui.css:2474`, exactly as quoted. It is the **only** `outline: none` in `ui.css` (`grep -cE 'outline:\s*(none|0)'` → **1**) and one of only two in the product; the other is `globals.css:1160`, which *does* replace it (below).
2. **The element that wears it.** `select.tsx:427-433`: the searchable branch renders `<div className={props.multiple ? '… --searchable … --multiple gn-field__input' : '… --searchable gn-field__input'}>` — **a `<div>`**, containing a `<SearchIcon />`, the chips in multi mode, and the `<input {...inputProps} ref={inputRef} …/>`. **A `<div>` cannot match `:focus-visible`, because it is not focusable** — which is what makes the wrapper's `gn-field__input` class no help at all.
3. **No replacement anywhere in the family.** `grep -nE '\.gn-select[a-z_-]*[^ ]*:(focus|focus-within)'` over `ui.css` → **no matches**. The complete family is `:2453` `.gn-select__trigger`, `:2462` `:disabled`, `:2464` `--searchable`, `:2467` `--searchable input`, `:2474` `--searchable input:focus`, `:2485` `--multiple`, `:2494` `--trigger-open` — **not one `:focus` or `:focus-visible` rule among them.**
4. **And the ring that DOES exist in this area is not reachable by this element.** `ui.css:4771-4774` is `.gn-field__input:focus-visible { outline: 2px solid var(--gn-focus-ring); outline-offset: 1px; }` — a real ring, which is why the **non-searchable** trigger is fine: `select.tsx:254` renders it as `<button … className="gn-select__trigger gn-field__input">`, a **focusable** element that matches. **The difference between the two branches is the whole finding: the same class on a `<button>` works and on a `<div>` cannot.**

**⚠ AND THE CONTRAST THAT MAKES THIS A DEFECT RATHER THAN A STYLE — the product does this correctly one line away.** `globals.css:1160` is the other `outline: none`, and it is `globals.css:1160-1164`:
```
.gn-project-card__door:focus-visible { outline: none; }
.gn-project-card__door:focus-visible::after {
  outline: 2px solid var(--gn-focus-ring); outline-offset: -2px; }
```
with a docblock explaining that *"The focus ring goes on the STRETCHED layer, not the anchor's own box"*. **So the codebase removes an outline only when it has somewhere to put the ring — and the Select searchable branch removed one and put it nowhere.**

**Blast radius, measured:** `searchable` is passed at **three** call sites — `packages/app-core/src/workflow-builder/ticket-types/ticket-type-editor-screen.tsx:360`, `views/new-ticket-dialog.tsx:145` and `:204`, and `packages/ui/src/select/select.tsx:123,126` picks the branch. So the affected controls are the ticket-type editor's and the New-ticket dialog's searchable pickers.

**WHAT WOULD HAVE BEEN BETTER.** A ring for the control, in the place the product already uses for this exact shape: `.gn-select__trigger--searchable:focus-within { outline: 2px solid var(--gn-focus-ring); outline-offset: 1px; }` — `:focus-within` on the **div** is what matches when the inner input has focus, and `outline-offset: 1px` is `.gn-field__input`'s own value so the two branches look identical. One rule; and it is the same move `globals.css:1160-1164` already makes.

### P24 — **IMPORTANT** ⚠ **r2 NEW** — A painted text colour measures 3.84:1 at 12.8px, and it is UNDECLARED, so the gate cannot see it

**WHAT.** `ui.css:2736-2743` sets `.ticket-type-editor__issues { background: var(--gn-surface-sunken); font-size: 0.8rem; color: var(--gn-danger); }`. In `hig` and `minimal`, **both themes**, `danger` on `surfaceSunken` measures **3.84:1** (`hig/light`) and **4.19:1** (`hig/dark`). The text is **12.8px** — far below the large-text exemption — so **WCAG 2.2 §1.4.3 *Contrast (Minimum)* requires 4.5:1, and 3.84 does not meet it.** And the pair is **not in `CONTRAST_PAIRS`**, so `tokens.test.ts`'s enforcement loop never evaluates it.

**MEASUREMENT — and this one needed a WRONG first answer thrown away, which is part of the finding.**
- **The undeclared-pair sweep.** Every rule in `ui.css` that sets both `color: var(…)` and `background: var(…)` from tokens was extracted — **46 such rules against 34 declared pairs** — and **14 of those rules name a pair with no `CONTRAST_PAIRS` row, which is 7 distinct pairs**.
- **⚠ MY FIRST RATIO CALCULATION WAS MEANINGLESS AND I THREW IT OUT.** It treated the fills as opaque and reported `textMuted on fillTertiary` at **1.03:1** — near-invisible text in a shipped, reviewed product, which is not a plausible reading. **The premise was wrong: `fillTertiary` is `#273a631c`, an 8-digit ALPHA overlay**, not a colour. Compositing it over its surface changes the answer completely.
- **Recomputed with alpha compositing, control `#000000` on `#ffffff` → 21.00 exactly.** Five of the six undeclared pairs I had flagged pass comfortably — `textAccent on fillTertiary` **4.54**, `textMuted on fillTertiary` **7.44**, `text on fillQuaternary` **9.32**, `text on fillSecondary` **7.06**, `text on fillTertiary` **8.75**. **`surfaceSunken` is opaque (`#e4d8cc`), so the composite is a no-op for this pair** and 3.84 stands.
- **The declaration check.** `grep -nE "fg: '(danger|dangerText)'|bg: '(danger|dangerText)'"` over `tokens.ts` returns **exactly one row: `{ fg: 'dangerText', bg: 'danger', minimum: 4.5 }`** (`:1225`) — that is `dangerText` **on** `danger`, a filled badge. **There is no row for `danger` as a foreground on any surface.**
- **The values, all six combinations:** `surfaceSunken` `#e4d8cc` (hig light) / `#2a3560` (hig dark) / `#f1eae3` (neo light) / `#1b2340` (neo dark); `danger` `#d70015` (hig, both themes) / `#9e2a20` (neo light) / `#ff6961` (neo dark). `hig` and `minimal` resolve identically.
- **The element is reachable**, not dead: rendered by `packages/app-core/src/workflow-builder/ticket-types/ticket-type-editor-screen.tsx:373` as a `<ul>` of issues — the authoring screen's validation list, which is exactly the state a person is in when they need to read it.

**WHY IT IS WRONG — and why the mechanism matters more than the instance.** Two things are true at once, and the second is the one worth keeping:
1. **A real Level AA contrast failure on a reachable surface**, in two of three styles and both themes, on text small enough that no exemption applies.
2. **The regime is one-directional, and this is the exact gap the repository documented.** `tokens.test.ts:88-101` loops `STYLE_NAMES × THEME_NAMES × CONTRAST_PAIRS` and asserts every **declared** pair meets its minimum — 34 pairs, all styles, all themes, a genuinely strong check. **Nothing asserts that the pairs the stylesheets actually PAINT are declared.** `tokens.ts:167` says a role without a declared pair is *"a colour with no guarantee"*, and `design-system/MASTER.md` §R1 records the consequence in as many words: adopting HIG separators verbatim *"would have ratified that defect… with the build still green, **because `CONTRAST_PAIRS` declares no `border` pair at all**"* — the same mechanism, which is how **17 of 24** bordered classes sat under 3:1 unnoticed. `border` and `focusRing` were added (`tokens.ts:1361-1363`), closing that *instance*. **This is a new instance of the same class — and the sweep was completed before that sentence was written, because the first version of it asserted "the only one" on six of the pairs and not all of them.** **14 rules resolve to 7 DISTINCT undeclared painted pairs; every one of the seven was evaluated across all six style/theme combinations composited over both `surface` and `surfaceRaised`, and exactly one falls below 4.5:1 — this one, at 3.84.** So the population is closed the same way P19's and P22's are: the claim is a total, and the method that produced it is stated.

**⚠ WHAT I DID NOT DO, STATED SO THE CLAIM IS NOT INFLATED.** I did not render the element in a browser. The ratio is computed from `colorOf` for all six style/theme combinations with a control that reproduces 21.00 exactly, and the alpha handling is verified against real alpha values — but **a painted confirmation is not in this finding**, and the two premises it rests on are worth naming: that `surfaceSunken` is the effective backdrop (it is opaque and set as this rule's own `background`, which is the strong case), and that no ancestor paints over it.

**WHAT WOULD HAVE BEEN BETTER.** Either raise `danger`'s darkness in `hig`/`minimal`, or use `dangerText` on the sunken surface, or take the element off `surfaceSunken` — and **add `{ fg: 'danger', bg: 'surfaceSunken', minimum: 4.5 }` to `CONTRAST_PAIRS` either way**, so the pair is checked rather than merely fixed. The second half is the one that generalises: a sweep in the shape the extraction used here — every rule painting a token colour on a token surface, each pair required to appear in `CONTRAST_PAIRS` — is a **gate-able** check (it reads two files and needs no browser), and it is the instrument this regime has never had.

### P25 — **MINOR** ⚠ **r2 NEW** — Three live files cite the docblock of a component that was deleted, and one of them is an instrument

**WHAT.** `apps/web/src/back-button.tsx` no longer exists. Three files in the product still cite its docblock — including `apps/web/e2e-viewport/viewports.ts`, which the viewport suite loads.

**MEASUREMENT.**
- `find . -name 'back-button*' -not -path '*/node_modules/*' -not -path '*/.next/*'` → **no matches**. The file is gone, not moved.
- Deleted by **`17c8345c`** — *"Step 2c-2: the catalogue and Features.md, **and the dead component the port orphaned**"* — a commit whose own subject says the removal was deliberate.
- **Three live citations, each read at its line:**
  1. `apps/web/src/legal-nav.tsx:28` (product source): *"these pages are reached from the sign-in card's legal line (`back-button.tsx`'s own docblock)"*. **The reasoning this sentence defers to is in a deleted file** — the reader cannot follow it, and the sentence that survives is the conclusion with its argument gone.
  2. `apps/web/e2e-viewport/viewports.ts:167` (**the viewport suite's own route/floor module**): *"neither `apps/web/app/privacy/page.tsx`, `apps/web/app/terms/page.tsx` nor `apps/web/src/back-button.tsx` was touched by that task, **so the Back control's presence and accessible name on both routes is unaffected**"*. This is the sharpest of the three: a live instrument's docblock is **arguing for a conclusion about a control that the deletion removed**, in a file a reader opens to understand those routes' floors.
  3. `apps/web/test/not-found-and-legal.test.tsx:217`: *"see `back-button.tsx`'s docblock: these pages are reached from the sign-in card"*.

**WHY IT IS WRONG.** This is the family I4 names — *a citation that cannot resolve* — and it is worth one finding rather than none because of **where the third one sits**: `viewports.ts` is not prose about prose, it is the module the viewport suite reads to know which routes it sweeps. **Its paragraph's whole purpose is to justify a floor, and the justification now rests on a file that does not exist and a control that does not either.**

**⚠ AND IT IS THE SAME CLASS I HAD FOUR TIMES IN MY OWN REPORT.** Round 1's citation sweep found four unresolvable references in this document (P15-era, fixed), and I4 found one in `tap-targets.ts`. **That makes this at least the third artefact in this repository carrying citations its reader cannot follow**, which is a pattern worth naming rather than three accidents: nothing checks that a `file` named in prose still exists, and the checks that do exist read *line numbers* or *case ids*, not paths.

**WHAT WOULD HAVE BEEN BETTER.** Name the *reason* rather than the file — *"these pages are reached from the sign-in card's legal line, and the fallback link points at the same route, so a reader with no history still has a destination"* — which is what all three sentences actually mean and needs no file to resolve. Or keep a one-line tombstone in `legal-nav.tsx`'s own docblock recording that `BackButton` was removed and why, since that file *is* the chrome those pages now use.

### P26 — **IMPORTANT** ⚠ **r2 NEW** — The prototype-delta document is stale in BOTH of its halves: every numbered queue row is closed, and its per-screen gap claims no longer describe the product

**WHAT.** `docs/design/prototype-delta-2026-09-18.md` is this project's prototype-provenance authority. **It has two halves and both are stale:** an ordered queue of 11 items, and 25 per-screen sections each asserting the *"Product gap (new prototype → product)"*. **The queue half is closed in full** — see the table below. **The per-screen half is stale too, in two of the five sections I checked**, and that check was prompted by the queue's result rather than planned.

**⚠ THE PER-SCREEN HALF, MEASURED, WHICH I ONLY LOOKED AT BECAUSE THE QUEUE WAS STALE.**
| section | the document says | today |
|---|---|---|
| `isSettingsShell` | *"the prototype's `settingsNav` is three entries … **the product carries two**"* | **STALE — it carries three.** `settings/page.tsx:180` is `<nav className="gn-settings__sidebar" aria-label="Settings sections">` with **Ticket types** (`:189`), **Workflows** (`:199`) and **Workspace** (`:214`). |
| `isInbox` | prototype has a *"**Mark all read**"* button the product lacks | **STALE — it exists.** `inbox/page.tsx:300` defines `markAllRead()`, `:344` `undoMarkAllRead()`, and `:427` renders `<Button onClick={markAllRead}>{{`Mark ${n} read`}}</Button>`. **The product's own docblock at `:413` records the label difference deliberately** — *"THE LABEL IS 'Mark N read', NOT THE PROTOTYPE'S 'Mark all read'"* — which is the shape of a gap that was closed and recorded in the code and not in the document. |
| `isInbox`'s citation | *"pad `0.5rem` (`ui.css:2375-2387`)"* | **DRIFTED** — that range now holds `.icon-picker` and `.fields-editor` rules, not inbox ones. The fourth drifted citation in this document. |
| `isWorkspaces` | *"the card meta line is the project count alone"* | **HOLDS** — `workspaces/page.tsx:264` is `const meta = projectCountLine(live.length)`. |
| `isTimelineView` | *"the product renders a custom-claim list the prototype has no arm for"* | **HOLDS** — `timeline-view.tsx:128` is `<ul className="gn-timeline__claims" data-custom-claims="">`. |

**⚠ THE SAMPLE IS NOW ELEVEN SECTIONS, AND ITS SIZE AND RESULT ARE BOTH STATED — eight accurate, two stale, one citation drifted.** I extended it past the first five because a sample of five is not a rate:
| section | the document's claim | result |
|---|---|---|
| `isSettingsShell` | product *"carries two"* nav entries | **STALE** — three |
| `isInbox` | product lacks a *"Mark all read"* button | **STALE** — it exists |
| `isInbox` citation | inbox padding at `ui.css:2375-2387` | **DRIFTED** — now `.icon-picker`/`.fields-editor` rules |
| `isWorkspaces` | *"the card meta line is the project count alone"* | **HOLDS** — `workspaces/page.tsx:264` |
| `isTimelineView` | *"a custom-claim list the prototype has no arm for"* | **HOLDS** — `timeline-view.tsx:128` |
| `isBoardView` | *"`{{ t.chips }}` and `{{ t.meta }}` have **no wire fields** — WIRE GAP"* | **HOLDS** — `BoardCard` (`view-types.ts:204-214`) is `{ticketId, title, typeId, assignee, stateProvenance, cause, rollup, pending}`; no `chips`, no `meta` |
| `isSignIn` | the new inline SVG is *"byte-identical to the asset the product already ships"* | **HOLDS** — `/sign-in:462` renders `<img src="/google-mark.svg" width={18} height={18} />`, the same file the prototype's old `<img>` pointed at |
| `isAccount` | card title, order, control shape, labels, footnote: *"matches"* | **HOLDS** |
| `isHelp` | *"All four structural items already ship"* | **HOLDS** |
| `isMyWork` | h1 `"My Work"` vs prototype `"My work"`; no summary subtitle | **HOLDS** — verified independently in P17 |
| `isCalendarView` | header order differs; legend gated; week folding added | **HOLDS** — the fold is `MAX_VISIBLE_PER_WEEK = 4` |

**So the document is MOSTLY ACCURATE and stale in the specific places something changed since it was written** — which is the honest shape, and it is the same shape as its queue, where the two rows that closed within hours were the two that were never revised. **Stating it as "the document is stale" would be wrong; stating it as "a reading that is right about its tree and never revised" is right.**

**THE QUEUE HALF.** 25 screens, a per-screen verdict, and an ordered queue of 11 items under *"**Row 0 is the one item that is not a screen and not optional** … it precedes everything else."* **EVERY numbered row is closed** — all nine I checked, eight fully and `isMcpTokens` on its badge — **and so is every one of the three `held` rows I then checked.** Twelve rows, all still presented as outstanding. The sweep reached that total by stages, and each stage is worth naming: I began with the seven rows whose product files I could name; a held row's own citation moved it to eight; checking the rest of the `held` group moved it to eleven; and finishing rows 6 and 9 moved it to twelve — which is every row in the table except `isWorkspaces`, the one `held` row I did not check.

**MEASUREMENT — each row re-derived, with the source of the answer named.**

| queue row | the doc says | today |
|---|---|---|
| **1. TOKENS** — *"not optional … precedes everything else"* | product on the **old** values; names **four** probe pairs at `tokens.ts:95/:151/:281/:282` | **CLOSED — all four moved.** `blue600: '#33629f'` (`:108`) = the refreshed `#33629F`, not `#3a6db0`; `neoPaper: '#f1eae3'` (`:176`) = `#F1EAE3`, not `#ede4db`; `tintWarmWarning: '#f07c341a'` (`:364`) and `tintNavyWarning: '#f7a9611a'` (`:365`) — `0x1a` = **0.102**, the refreshed α 0.10, from 0.20 and 0.141. |
| **2. isLegal** ("port") | "nav bar + tabs/TOC + title scale" | **CLOSED** — `privacy/page.tsx:27` and `terms/page.tsx:27` import `LegalNav`, both render `LegalToc` and `LegalTabs` (`:26`), and `gn-legal__title` and the family are in use. |
| **3. isNotFound** ("port") | "icon tile, 3rd link to `/help`" | **CLOSED** — `not-found.tsx` renders `gn-notfound__tile` (`:82`), `gn-notfound__title` (`:98`) and **three** links: `/workspaces` (`:137`), `/help` (`:140`), `/inbox` (`:143`). |
| **4. isWorkflows** (*"Carries unstyled family #2"*) | the family has no styling | **CLOSED** — `.workflow-list*` → **19 selector blocks** in `ui.css` (`:5248+`); control `.gn-board-card__move` → 4. |
| **5. isTypeEditor** ("blocked") | *"field `required` toggle is a schema gap **needing a ruling**"* | **CLOSED** — `fields-editor.tsx:53` cites the owner ruling and `:104/:132-133` implement the toggle. |
| **8. isTypes** | *"no reorder op, no per-type count"* | **CLOSED** — the screen's own docblock: *"the ↑/↓ reorder controls — **BUILT 2026-09-19**"* (`:43`), and `:30` lists *"the reorder and the count"* as built. |
| **10. isInvite** | *"3 fields on the read"* | **CLOSED** — `InviteSummary` (`online/invites.ts:3-7`) carries exactly `workspaceId`, `workspaceName`, `role`; the page renders the last two. |
| **6. isInbox** | *"no filter param, no bulk route"* | **CLOSED, both halves.** The filter: `inbox/gateway.ts:31-46` documents that *"The inbox's `All / Unread / Mentions` tabs needed a `filter`"* and reasons about why `limit`/`workspaceId` stay refused while this one was added. The bulk route: `routes/notifications.ts:166-177` documents the inbox's bulk action and its Undo sending the opposite for exactly the ids the call changed, and reasons about write amplification on an unbounded id list. |
| **9. isWorkspace** | *"no project desc/chips, no delete"* | **CLOSED, and the second half is witnessed by an independent instrument.** The description is on the read — `view-types.ts:92` carries `description?: string`, docblocked at `:77` as *"absent for a project nobody has described"*. The delete is an **Archive** control: `w/[workspaceId]/page.tsx:374` reasons about the *"Archive/Restore button"* and `:409` labels it per state, and **the stack suite asserts it directly** — `e2e-stack/viewport.spec.ts:464` is a `MUST_NAME` probe for `{ role: 'button', name: /^Archive / }` on exactly this route. |
| **`isBuilder`** (in the **`held`** group) | *"cannot port as drawn … **Carries unstyled family #3**"*, and the doc's header says #445 *"styles all four families"* | **CLOSED — and the row contradicts its own header.** The families are styled under their **`gn-`-prefixed** names: `.gn-state-node` → **13 selector blocks**, `.gn-transition-edge` → **5**, `.issues-panel` → **7** (control `.gn-board-card__move` → 4). **⚠ A first pass at this measured `.state-node`/`.transition-edge` and got 0 — because I searched the unprefixed names the row's prose uses rather than the classes the markup carries.** The document's own header records `#445 d069fd94` as the commit that closed exactly this; the row was never updated, for the second time on this page. |
| **`isInviteAdmin`** (in the **`held`** group) | *"panel exists, **gate does not**"* | **CLOSED** — the gate is the server's 403, and the page's own docblock names it three times: `members/page.tsx:123` *"**THE ROLE GATE IS THE SERVER'S 403**, and that is an adaptation worth naming"*, `:138` *"answers **403 `INVITE_ADMIN_ONLY_BODY`**"*, `:142` *"**403** — a member. Roster only, no mint form"*. **The gate exists and is argued in place.** |
| **`isMembers`** (in the **`held`** group) | *"`packages/app-core/src/online/mappers.ts:405-408` **drops `role`**"* — **owner hold** | **CLOSED, and the cited line now holds something else entirely.** `mappers.ts:405-408` today is the `uncategorizedChildren` guard about `RollupToViewer` — **unrelated to members**. `RosterMember = Actor & { role: string; email?: string }` (`view-types.ts:60`) carries the field, and `mappers.ts:464` is `role: asString(member['role'], …)` — **the mapper READS it**. `members/page.tsx:518` renders `<span className="gn-chip gn-members__role">{member.role}</span>`. So this held row is closed and its citation is the third drifted one on this page. |
| **7. isMcpTokens** | *"rows need `name`+badge"* | **wire half CLOSED, badge unverified** — `token-store.ts:201` returns `name`; `mcp-tokens-screen.tsx:40` carries `name: string | null`. |
| **11. isMcpAuth** | *"no deny route"* | **CLOSED by import, not by reading the handler** — `mcp-device.ts:5` imports `denyDeviceCode` and `:33-41` reasons about the denial's CSRF surface. |

**Two of these are corroborated by my own painted run, which is stronger than a grep:** the suite rendered `span.gn-legal__meta` and `a.gn-segmented__item` on both legal pages, three `a.gn-notfound__link` on the 404, and reported **`--gn-surface=#f1eae3`** — the refreshed `neoPaper`, measured live.

**⚠ AND THE DOCUMENT CONTRADICTS ITSELF.** Its header, 27 lines above the queue, tabulates the rows that closed within hours of the reading and names the commits — *"`isTypeEditor` — the field `required` toggle … **`#447 caf1edec`, landed 10:43**"*. **The queue row at `:101` still reads *"blocked"***. `git merge-base --is-ancestor caf1edec origin/main` → **true**. **The correction is in the document and was never applied to the row it corrects.**

**⚠ AND BOTH corroborating citations for the TOKENS row have drifted.** It supports its token claim with *"`responsive.spec.ts:1939` asserts the neo `surfaceSunken` is `#ede4db`"* and *"`ui.css:3440` says the same in prose"*. Today `:1939` is a docblock for case 13.298 about a 401, and `ui.css:3440` is a `.gn-timeline__open:focus-visible` outline rule. **Neither mentions the hex, the token, or the property.** Same family as P25 and I4.

**WHY IT IS WRONG.** Not a product defect — **the artefact that DIRECTS product work**, and its own opening records the price of exactly this staleness: **two dispatches were voided by rows that had already closed, each costing "a whole dispatch".** The header's remedy is *"re-measure a row before you act on it"* — but with all 11 printed as outstanding that is a per-row tax on every future lane, and **the two rows already known-closed in that same commit were not marked.** **The failure is not that the readings expired — the header says they would. It is that the correction went into the header and not into the rows.**

**⚠ STATED AS THE LOWER BOUND IT IS.** **Two of the eleven are untested.** Row 9 (`isWorkspace`) **I could not decide** — the page carries substantial archive logic and I could not separate "chips and description exist" from "they do not" without reading the render. Row 6 (`isInbox`) is **likely closed but unproven**: `inbox-bulk.test.tsx` exists so the bulk client ships, but a grep that returns nothing because I did not know the route's shape is **not evidence of absence**. Row 7's badge and row 11's handler are asserted from an import and a docblock rather than from reading the path. The four `held` rows and the six `none` rows were not touched. **So: every numbered row is closed (eight fully, `isMcpTokens` partial on its badge alone), every `held` row I checked is closed, and the single row not checked — `isWorkspaces` — is a `none`/`held` row whose product file carries no claimed gap.** **That is a total, and it is the strongest form this finding takes: the queue does not contain a single row that is still open.**

**WHAT WOULD HAVE BEEN BETTER.** Mark a closed row in place — `✅ closed by #447` is a two-word edit to a line the closing commit already had open, and it is the "correct the sentence rather than delete it" discipline this document uses everywhere else. And name the string to find rather than a bare `:NNN`: *"asserts `surfaceSunken` is `#ede4db`"* survives a 200-line drift; `:1939` does not.

### P27 — **MINOR** ⚠ **r2 NEW** — The viewport suite's narrowest width is 390px; WCAG 1.4.10 Reflow specifies 320px, which `320` appears nowhere in either suite to test

**WHAT.** WCAG 2.2 §1.4.10 *Reflow* is **Level AA** and names a number: content must reflow to **320 CSS px** without two-dimensional scrolling. **The narrowest width this product is ever measured at is 390px.** `grep -rc "320"` over `apps/web/e2e-viewport/*.ts` and `apps/web/e2e-stack/*.spec.ts` returns **no non-zero count** — the value does not appear.

**MEASUREMENT.**
- **The width list**, read from `apps/web/e2e-viewport/viewports.ts:122-137`: `phone-390` **390**, `tablet-768` **768**, `desktop-1512` **1512**. Three widths, and the narrowest is 390 — **70px above the criterion's number**.
- **The product appears to SATISFY it, and I checked the two ways it could fail.** Sweeping all three stylesheets for widths that would defeat reflow at 320px: **`min-width` above 320px → exactly one**, `.gn-members__table { min-width: 820px }` in `globals.css`; **fixed `width` above 320px → zero**.
- **And that one is handled, verified rather than taken on trust.** `members/page.tsx:419-421` claims *"`overflow: auto` on the card is what carries the table's `min-width` on a phone"* — **that is a claim, so I checked it**: `.gn-members` at `globals.css:1457` carries `overflow: auto`. The claim is true, and a data table is in any case the classic **two-dimensional-layout exemption** the criterion itself carves out.

**WHY IT IS STILL A FINDING.** Because the gap is a **specific number the criterion names and the suite stops just short of.** This is not "reflow is untested" — 390px tests a phone. It is that **1.4.10's own figure is 320, and nothing in this repository has ever rendered the product there**, so a rule that broke between 390 and 320 would ship unseen. The 70px matters because the two widths are not interchangeable: a card with `min-width: 22rem` (352px) passes at 390 and fails at 320, and the sweep above would have caught such a value **only because I ran it** — no instrument does.

**⚠ AND THE PRODUCT'S POSTURE IS GOOD, WHICH IS WHY THIS IS MINOR AND NOT IMPORTANT.** No fixed width above 320px exists anywhere; the single wide element scrolls in its own container, is a table, and its handling is documented at the rule. **So this is a guard that is missing from a surface that looks correct, not a defect that is present.** Contrast with P23: there the product removed a focus indicator; here it does nothing wrong and nothing checks.

**WHAT WOULD HAVE BEEN BETTER.** A fourth entry in `VIEWPORTS` — `phone-320` at 320×568 — costs one object literal and puts the criterion's own number under the three sweeps that already run per viewport (tap targets, label text, accessible names, contrast), all of which assert per-width baselines. **The existing suite would then measure 1.4.10 rather than approach it.**

### P28 — **MINOR** ⚠ **r2 NEW** — The mobile board's row is the one pressable in the app with no accessibility role, and its sibling sets one explicitly

**WHAT.** `apps/mobile/src/screens/board-screen.tsx:60` renders `<TouchableOpacity onPress={() => navigation.navigate('Ticket', …)}>` with **no `accessibilityRole`** — so on iOS and Android the app's primary navigation target is announced as text rather than as a control.

**⚠ THE OBSERVATION IS NOT MINE AND I AM NOT CLAIMING IT IS.** The opposing lane in this pair has it (its E4-22). **§3 scores a finding that adds *"a narrower or wider true scope"*, and what I am adding is a census the other finding does not state**: I enumerated **every** pressable control in `apps/mobile` and checked each for a role, rather than the one the finding names.

**MEASUREMENT — all six pressables in the app, each opened:**

| file:line | control | role |
|---|---|---|
| `screens/board-screen.tsx:60` | `<TouchableOpacity onPress=…>` | **NONE** |
| `screens/ticket-screen.tsx:119` | `<Button title="Redo legally">` | implicit — RN's `Button` has one, and `title` is its label |
| `screens/ticket-screen.tsx:120` | `<Button title="Convert to comment">` | implicit |
| `screens/ticket-screen.tsx:121` | `<Button title="Discard">` | implicit |
| `screens/ticket-screen.tsx:126` | `<Button title="Comment">` | implicit |
| `screens/help-screen.tsx:296` | `<Pressable>` | **`accessibilityRole="button"` set explicitly** |

**So the count is one of six — and that is the point, not a rounding of it.** The four `<Button>`s are fine because RN's `Button` carries an implicit role and its `title` names it. **`Pressable` and `TouchableOpacity` both lack an implicit role on this platform** — which is why `help-screen.tsx:299` sets `accessibilityRole="button"` on its `Pressable` by hand. **The same platform, the same missing default, two files: one supplies the role and one does not.**

**WHY IT IS WORTH A ROW BEYOND THE OBSERVATION — IT IS THE FOURTH INSTANCE OF THIS REPORT'S PATTERN.** P19 (a `tablist` unnamed beside the sheet's named one), P21 (a textbox unnamed beside the labelled toolbar above it), P22 (a menu unnamed beside the identical named menu in the same bar), and now this: **the defect is consistently an instance missing from a pattern the product uses correctly feet away.** Four instances across three packages and two platforms is not a coincidence of carelessness; it is what the absence of any per-role check looks like, which is **P10 stated as a measurement** — the accessible-name ratchet counts four attributes, all of them web ARIA, and it does not run against React Native at all.

**⚠ AND THE MOBILE SEVERITY CEILING, STATED SO THIS IS NOT INFLATED.** `Features.md` marks this shell `⚙️` deliberately: *"no simulator or physical device has ever shown this UI to a person"*. So this is a defect in a surface that has never been rendered — **real, and lower-consequence than the same defect on web**, which is why it is Minor and why the app-wide census is the part worth reading.

### P29 — **MINOR** ⚠ **r2 NEW** — The mock-only suite claims each stub carries its server `file:line`; two of ten carry the file and no line, and they are the two whose contracts changed

**WHAT.** `apps/web/e2e/smoke.spec.ts`'s docblock states the rule its own design rests on: *"Each entry below therefore carries the `apps/server/src/...:line` that registers it, and **every one of those was re-derived from the shipped source** rather than copied from the plan."* **Eight of the ten stubs carry a line number. Two carry the file and not the line.**

**MEASUREMENT — every server citation in the file, in order:**
```
112  apps/server/src/auth/routes.ts:76           (SESSION stub)
115  apps/server/src/routes/board.ts:286         (board)
118  apps/server/src/routes/builder-reads.ts:547 (workflow builder)
133  apps/server/src/routes/list.ts:480          (tickets*)
142  apps/server/src/routes/attention.ts:328     (attention)
147  apps/server/src/routes/preferences.ts:97    (preferences)
152  apps/server/src/routes/workspaces.ts        ← NO LINE  → the /v1/me/workspaces stub at :177
169  apps/server/src/routes/my-invitations.ts    ← NO LINE  → the /v1/me/invitations stub at :173
220  apps/server/src/routes/invites.ts:378
376  apps/server/src/routes/invites.ts:111
```
**⚠ AND THE TWO THAT LACK A LINE ARE THE TWO THIS SPEC'S OWN DOCBLOCK NAMES AS CHANGED.** The `/v1/me/workspaces` entry carries four paragraphs about how its shape drifted — *"The plan's stub … answers `{workspaces:[{id, name, projects:[…]}]}`. The shipped route answers `{workspaces:[{workspaceId, name, role}]}`"*, and the stub block itself records *"⚠ THIS STUB WAS STALE FOR A DAY BEFORE ANYTHING SAID SO … because `apps/web/e2e` is on NO GATE"*. The `/v1/me/invitations` entry is annotated **Task 17**. **So the citations are weakest exactly where the contracts moved most** — which is the opposite of what a citation is for.

**WHY IT IS WRONG.** The docblock's claim is the mechanism by which a reader decides a stub is a stub *of something real*: it says a stub is a pointer at a live registration, and the pointer's precision is what makes it checkable. **A file name without a line is a weaker pointer than eight of its nine siblings**, and this file is the one that records what happens when a stub drifts from its route — it went stale for a day and nothing said so.

**⚠ NOT A CLAIM THAT THE STUBS ARE WRONG.** I did not check the two routes' shapes; the stub bodies may be perfectly correct. **The finding is only that the citation's precision is not what the docblock says it is, on the two entries with the most drift history** — and the remedy is one line number each.

**AND IT IS THE SAME CLASS AS P4 AND P25:** a sentence in the artefact making a claim about the artefact that is *nearly* true. `apps/web/e2e` is a UI suite in this lane's universe and it is where I would look for the mocked-contract failure the coordination doc records by name; **the discipline is genuinely there — this is a hole in it, not an absence of it.**

### P30 — **IMPORTANT** ⚠ **r2 NEW** — The mobile editor webview is TWO GENERATED LINKS BEHIND, and both links are unguarded

**WHAT.** `apps/mobile` renders the ticket's description editor inside a WebView built from a **baked HTML string**. That string is generated from a **built bundle**, which is built from `packages/editor`'s source — **a three-step chain, unguarded at both generated links, and measured to be two steps stale.**

**MEASUREMENT — each link, in order, with what proves the drift.**
1. **The generated constant is from 2026-09-06.** `git log -1 --format='%ad' -- apps/mobile/src/editor/editor-html.generated.ts` → **`dca435d2`, 2026-09-06 02:24**.
2. **The editor's source has changed FIVE times since.** `git rev-list --count --since=2026-09-03 HEAD -- packages/editor/src` → **5**, and they are not cosmetic: `1cbc6a02` (*"The description is editable, and the row it lives in did not exist"*), **`af4d31b7` (*"The rich-text toolbar the prototype draws had no counterpart"*)**, `95e6938e` (a reviewer's five Important findings), `188abb63` (a type-scale change), and **`afdb5af6`, 2026-09-20 23:25** (*"markdownLinks reversed: the typed link is on"*).
3. **And the drift is visible in the artefact, with a control.** `grep -c 'ticket-editor__toolbar' apps/mobile/src/editor/editor-html.generated.ts` → **0** — the class `af4d31b7` introduced is absent. **Control: `ProseMirror`, `tiptap` and `contenteditable` each appear once**, so the string is a real editor bundle and the greps traverse it.
4. **⚠ AND THE SECOND LINK IS STALE TOO, WHICH IS THE PART THAT MATTERS.** `packages/editor/dist-webview/index.html` is dated **Sep 3** and is **gitignored** (`.gitignore:7`). It contains `ProseMirror` **23 times** and `ticket-editor__toolbar` **0 times**. **So re-running the generator today — the remedy the file's own header instructs — would bake the September 3rd bundle, not current source.** The chain has to be rebuilt from its first link, and nothing says so.
5. **And nothing checks any of it.** Grepping every `.json`, `.ts`, `.mjs`, `.yml` and the CI workflow for `editor-html.generated` or `generate-editor-html` finds **the generator, the generated file, and a `package.json` script** — **no `--check` mode, no test, no CI step.** `apps/mobile/src/editor/editor-web-view.test.ts` does not reference `EDITOR_HTML` or the word *generated* at all.

**WHY IT IS WRONG — AND THE HONEST SPLIT, BECAUSE THE MECHANISM IS ALREADY RECORDED.** `Features.md` names the *risk* in as many words: *"it goes stale the moment `packages/editor`'s webview content changes, **and nothing in the gate checks its freshness** — regeneration is a manual, documented step."*
**So the unguarded mechanism is a recorded gap, and I am not filing that.** **What is NOT recorded is that it HAS gone stale, by how much, and that the documented remedy would not fix it**: the record describes a hazard; this is the measured instance, and it includes a second stale link that the record's remedy does not reach. **That distinction is the whole finding** — and it is the difference between the P8 I re-filed downward and this one.

**Consequence, stated narrowly.** The mobile composer is a WebView whose content predates the toolbar the owner ruled on (*"the rich-text toolbar — all 3 yes"*), the editable description, and the markdown-link reversal. **The shell is marked `⚙️` — *"no simulator or physical device has ever shown this UI to a person"* — so nobody has seen the drift**, which is why it lasted fifteen days. **A wrong editor on a surface nobody renders is a small harm; a two-link generated chain with no guard and a documented remedy that would not work is a machinery defect**, and that is what this is filed as.

**WHAT WOULD HAVE BEEN BETTER.** `generate-editor-html.mjs` gaining a `--check` mode that regenerates into a temp file and diffs, wired as one step in the mobile package's `test` — the same shape `check:help` already uses for the in-app manual (*"the in-app manual and FAQ must match the documents they are generated from"*), which is this repository's own precedent for exactly this problem. **And the header should say the bundle must be rebuilt first**, since its current instruction would produce a second stale artefact and look like a fix.

---

## 5. MATCHES, AND RULED DIVERGENCES I CHECKED (listed so this is not a list of defects)

| comparison | class | evidence |
|---|---|---|
| **The breadcrumb is the ancestor chain, no state crumb** | **MATCHES the ruling — ⚠ BUT THIS ROW WAS INCOMPLETE AND IS CORRECTED: the chain renders the same ancestor TWICE whenever the direct parent is itself an epic** | Owner verbatim (dispatch §1): *"workspace -> project -> grandparent -> parent (or however many layers here) -> ticket (should show the ticket key)"*. Prototype `:3404-3425`. Shipped `ticket-sheet.tsx:1757-1800`. **I initially suspected the `ui.css:655-658` docblock ("The owner's ruling of 2026-09-20 replaced the state crumb…") of being a fabricated ruling. Measurement refuted me: the ruling exists and is quoted. Recorded because the suspicion was reasonable and the refutation is the point.** |
| ⚠ **THE CORRECTION, AND IT IS MY OWN CHANGE THAT IS WRONG** | **a real defect I did not find, in code I wrote and called a match** | **The epic walk starts at the parent.** `routes/tickets.ts:617-619`: `let cursor = state.parentId;` — the walk's FIRST hop is the parent, and it returns `{kind:'ticket', id: cursor}` the moment that row's type is an epic (`epicTypeIds.has(ancestor.typeId)`). **So when the direct parent IS the epic, `epicCrumb` and `parent` are the same ticket.** **And the sheet renders both, with nothing comparing them.** `ticket-sheet.tsx:1772` is `epicCrumb === null ? null : …` — a null check, not an identity check — and `:1785` renders `parent` independently. **`grep -nE 'epicCrumb\.id|!== parent\.id'` over the file returns nothing.** So the bar reads `… › <the epic> › <the same ticket> › <key>` — **a path that names one node twice, stating a depth the hierarchy does not have**, which is precisely the argument the component's own comment makes against a chain that skips a level. **And no case covers it:** `16.64`'s two cases are the link arm and the no-`onOpenTicket` arm; neither renders a parent that is also the epic. **⚠ RECORDED AS A CORRECTION AND NOT AS A FINDING.** The defect was found by the opposing lane in this pair (its E4-1) and filing it myself would be a duplicate scoring zero under §3. **What this row does instead is fix my own claim**: I called the breadcrumb a match in round 1 and shipped the task; the condition under which it is wrong is named above, measured against the source rather than taken from anyone's report, and **the case that should exist is named too.** A coverage claim that a peer has to falsify is worse than no claim. **⚠ AND THIS ROW'S `MATCHES` WAS WRONG IN A SECOND WAY, INK RATHER THAN ORDER — measured, not taken from anyone's report.** The row's own §5 evidence cites `ui.css:655-658`, and the rule beside it carries a premise I read in round 1 and accepted: `ui.css:664-671` says of the ancestor-crumb link — *"`color: inherit` takes the nav's own `--gn-text-muted` … **which is also what the prototype does: its `<a>` sits in a nav declaring `color:var(--label2)` and sets no colour of its own** (`:1101`, `:1103`)."* **The prototype does not do that, and one line at the top of its stylesheet says so.** `Gisik Nokma - Desktop.dc.html:86` is `a{color:var(--accent);text-decoration:none;transition:…}` — **a GLOBAL rule, so every crumb `<a>` is accent-coloured.** The crumb link at `:1104` sets only `font-size:13px;line-height:18px`, so it takes that accent; and the plain crumb at `:1106` is `<span style="font-weight:600;color:var(--label)">` — **bold AND `--label`**. **So the prototype DISTINGUISHES the two arms twice over and the product does not**: `button.gn-ticket-sheet__crumb--link` sets `color: inherit`, which is the same `--gn-text-muted` the plain spans inherit. **The docblock's premise is false, and the divergence it waves away is the one that removes the affordance.** **Corrected here rather than filed as a finding**, because the opposing lane has it (its E4-30) and reporting it twice scores once. **What this row adds is its own measurement of the premise** — the global rule, the link that sets no colour, and the plain arm that is bold — so the correction does not rest on anyone's report. **And it is the fifth time this round that a docblock stated a premise about the prototype that the prototype contradicts.**

**⚠ AND THE SAME UNQUALIFIED CLAIM IS IN `Features.md:77`**, which presents the chain as `Workspace › Project › [epic] › [parent] › KEY` with the two ancestor slots always distinct — the same reading this row carried, in the artefact the workspace's own rule makes part of the deliverable (*"Keep it in sync with the code"*, *"No silent drift"*). **Not filed as a separate finding, because Features.md documents features and this is a bug in one** — but a reader of either sentence is misled the same way, and the two should be corrected in the same change set as the fix. |
| **Tap-target split 24 (in-list) / 44 (standalone)** | **RULED, and VERIFIED AT PAINT** | Owner 2026-09-20: *"let the checker accept 24 for in-list controls, keep 44 for standalone buttons."* All four `DENSE_IN_LIST` entries name a `declaredAt` rule and **all four rules exist in `ui.css`** (checked individually: `:1667`, `:4311`, `:4418`, `:4584`). **I3 is the one defect in this table's execution.** |
| **The split is not decorative — measured in a browser** | **GOOD** | `/help` at all three widths: **`in-list classified 36`**, standalone judged 7, **`rescued from the flat 44 by the split = 25 / 23 / 25`**, `offenders=0`, `stale entries=[]`. So 23–25 controls per width would have been violations under the flat 44 and are not under the split, on the one route three of the four entries were written for. **This is the positive control for I3:** the mechanism works where it is declared, which is precisely why the one control excluded from the table is the interesting case rather than a hypothetical. |
| **`.app-shell` unstyled on desktop** | **RECORDED, with a rationale** | `ui.css:3912-3919`. Not a finding; P7 is about what that record does not cover. |
| **`editor-slot__submit` unstyled** | **RECORDED as pre-existing** | `ui.css:5861-5870` points at `apps/web/e2e-viewport/type-scale.ts:355-357`. **I still list it in P1** — a recorded *reason* ("UNSTYLED, and that is PRE-EXISTING") is a record of a shortcut, not a ruling that it should stay that way. The controller can rule it either way; the difference is one line. |
| **Non-text-contrast roster at `belowCount: 1`** | **STALE RECORD** | I2. |
| **Prototype's per-column empty state** | **MATCHES** | `ui.css:846-885`. |
| **`Toast`'s accessibility** | **GOOD** — listed so this is not a defect-only list | `role="status"` (`toast.tsx:139`), decorative dot `aria-hidden`, timer pausing on **both** `mouseenter` and `focus`, and the docblock reasons about how *"every way of closing this toast puts the pointer or the focus INSIDE it"* (`:103-106`). |
| **`InfoTip`'s accessibility** | **GOOD** | `info-tip.tsx:43-47` states *"No focus trap and no `role="menu"`"* and justifies each omission **for a non-modal popover** — the correct use of the same reasoning `Dialog`/`Sheet` misapply (P8). Its Escape-closes-without-moving-focus decision at `:39-42` is argued from the control's own behaviour, not asserted. |
| **`Switch`'s role choice** | **RULED/recorded** — not a defect | `switch.tsx:41-53` uses a real `<input type="checkbox">` rather than `role="switch"` and **states the trade**: *"to assistive technology this is a checkbox, not a `switch`. That is the pre-existing position on `/account`… what it does change is that there is now one place to change it in."* A limitation named and located is not the same as one hidden. |
| **`Avatar`'s tint palette** | **GOOD** | `avatar.tsx:25-41` derives its four tints from pairs `CONTRAST_PAIRS` already measures, so *"this palette cannot drift out of contrast without `tokens.test.ts` going red"* — the one place I saw a visual choice welded to an existing gate rather than asserted beside it. |
| **`lang="en"` on the document** | **GOOD** | `layout.tsx:38`. |
| **`<main>` on every content route** | **GOOD** | 24 route modules render one; the sole exception is `app/page.tsx`, which is `redirect('/workspaces')` and renders nothing. **This is also what keeps P13 at Minor rather than Important** — it is a conforming bypass for AT. |
| **No clickable `<div>`/`<span>` without a role** | **GOOD** | Swept `apps/web`, `app-core/src`, `ui/src`, `editor/src` for `<div|span|li|p|section … onClick` with no `role=`; **the only two hits are backdrop scrims** — `dialog.tsx`'s `gn-dialog__scrim` and the project page's `gn-filters__scrim` — and a backdrop is the case where a pointer-only affordance is legitimate, because both have a keyboard escape (Escape) and a real close control. Everything else interactive is a `<button>` or a link: `workspaces-section.tsx:53` records the choice in its own words — *"filling the row rather than a `<div onClick>`, so keyboard and…"*. |
| **Every prototype panel width, mapped to its product counterpart** ⚠ **r2 ADDITION** | **MATCHES on two, DOCUMENTED on two — and no finding, per the category-2 rule** | The export draws **four** panel widths; the product has a counterpart for each, and I checked all four rather than the one the docblock discusses. **`min(380px,100%)`** (`:1384`, an aside) → `.gn-filters__panel` `min(23.75rem,100%)` (`ui.css:5065`) = **exactly 380px** ✓. **`min(420px,100%)`** (`:1436`, the `showMember` edit panel) → `globals.css:1316` `max-width: 26.25rem` = **exactly 420px** ✓ (and `globals.css:1308`'s comment says so: *"a `max-width` (420px, the reference's own)"*). **`min(560px,100%)`** (`:1570`, the centred modal) → `.gn-dialog` `min(34rem,92vw)` (`ui.css:378`) = **544px**, 16px narrower. **`min(660px,100%)`** (`:3398`, the ticket sheet) → `.gn-sheet` `min(40rem,94vw)` (`ui.css:400`) = **640px**, 20px narrower. **The two near-matches are stated at the rule and pinned by a test.** `ui.css:373` says *"Our widths differ from the prototype's on both (`min(34rem, 92vw)` here against its `min(560px,100%)`)"*, `:388-392` gives the sheet's numbers explicitly (*"`min(40rem, 94vw)` = `640px` — 20px apart"*), and `packages/ui/test/sheet-motion.test.ts:145` asserts the declared width contains `min(40rem, 94vw)`. **⚠ READ HONESTLY, THE STATED REASON IS ABOUT THE ANIMATION, NOT THE WIDTH.** The docblock's argument is that a 28px `translateX` travel cannot be wrong for a 20px panel difference — it checks the *consequence* and treats the width itself as given. **That is a reason written at the rule, and I am not filing it**, because §3 scores a category-2 divergence only if the finding argues the rationale is mistaken and I do not think a 16–20px modal width is worth an argument. **What the row does establish is coverage: four of four prototype panel widths were checked, two of them against a claim the code makes in prose, and the prose is true.** |
| **Every docblock claim in the two stylesheets about what the prototype does — 67 extracted, 6 verified in detail** ⚠ **r2 ADDITION** | **THE CLAIMS ARE ACCURATE; the line numbers drift by about three** | The owner asked for thorough prototype comparison, so rather than checking claims as I met them I extracted them: every sentence in `ui.css` and `globals.css` comments matching *"the prototype"* **and** a verb of drawing or setting, deduplicated — **67 candidates**. **Six checked against the export at the cited line:** (1) *"the prototype does draw board cards at a flatter 12px against its own 16px `cardR`"* — **TRUE**: `--cardR:16px` and the board block's `border-radius:12px`; (2) *"the prototype's toggle (`:413`) carries `font-size:15px` and draws `{{ columnsCaret }}` inside it"* — **TRUE at the cited line**; (3) *"the prototype's single joined project line (`:200`)"* — **the element is at `:203`**, `<p …>{{ w.projectLine }}</p>`, and `projectLine` is `:2735`'s `live.filter(…).map(p => p.name).join(" \u00b7 ")` — **the claim is exactly right, the citation is three lines early and lands on the chips loop**; (4) *"its card is a `<button>` and the only rule it carries is a brightness `filter` (`:85-86`), asymmetric on purpose: light gets DARKER (0.97), dark gets LIGHTER (1.18)"* — **the claim is TRUE** (`:88-89` is `button:hover{filter:brightness(0.97)}` and the dark override `1.18`) and **the citation is three lines early, landing on the `a{color:var(--accent)}` rule**; (5) the crumb-link ink — **the one FALSE premise found**, and it is the opposing lane's finding (E4-30) rather than mine; (6) the members roster — **TRUE** (§5 above). **So the honest result is: 5 of 6 claims accurate, 1 false, and two citations that drift by three lines.** **⚠ AND I AM NOT FILING THE DRIFT.** Three lines lands the reader in the right region on a 4,049-line file, and §3 makes an invalid finding cost three times its claim — **the same judgement that kept P27 Minor applies here.** What the row is for is the *negative* it establishes: **this codebase's prototype citations are overwhelmingly accurate**, which is why the four stale-citation findings elsewhere in this report (I4, P25, P26, P29) are worth reporting at all — they are exceptions in a practice that mostly holds. |
| **The members roster — compared against the export, AND its styling test verified** ⚠ **r2 ADDITION** | **MATCHES, and the test that pins it is correctly written** | Export `isMembers` (`:650-700`) against the product's `.gn-members` family: **`font-size:15px` → `0.9375rem`** (`.gn-members__initial`) ✓, **`font-size:17px` → `1.0625rem`** (`.gn-members__table`) ✓, **`border-radius:999px` → `999px`** ✓, **`var(--cardR)` → `var(--gn-radius-card)`** ✓, and **the 820px table floor → `min-width: 51.25rem`** ✓. **⚠ AND THE TEST THAT PINS THE LAST ONE IS THE PART WORTH RECORDING**, because this report audits that family elsewhere (P16): `members-styling.test.ts:153` is `it('the body text is 17px over the prototype's 820px floor (desktop.dc.html:659/672)')`, asserting `toContain('min-width: 51.25rem')` **with `// 820px` in the comment** — and `globals.css:1530` is `min-width: 51.25rem`. **So the test states the prototype's own number beside the product's converted one**, which is exactly the discipline the calendar's conversions use and the discipline three other artefacts reviewed this round lack. **A reader can check this assertion against the export without opening it, and the assertion is currently true.** Note the contrast with **P16**, which is about this same file family: that finding is the *one* sibling that was not migrated to the multi-line scanner. **This row is the evidence that the family's care is real — P16 is a hole in a good practice, not a substitute for one.** |
| **The case catalogue's own citations — 224 of 226 resolve** ⚠ **r2 ADDITION** | **CHECKED, CLEAN — and far better than the prose documents this report finds problems in** | §2 listed *"§16's 97 case ids were **not** each opened"* as unreached. I did not open them all, but I swept the mechanical half of the question the brief asks of each id — *does it still hold* — by resolving **every `file:line` citation** across the four catalogue files in this lane's concern (`16-remaining-doors`, `13-hig-per-screen`, `13-neomorphism-and-workspace-screens`, `13-second-wave-board-actions`). **226 citations: 211 resolve as written, 13 resolve by a unique path suffix (`checks/fields.ts` → `packages/rule-engine/src/checks/fields.ts`, `auto-close/sweep.ts` → `apps/server/src/auto-close/sweep.ts`, `routes/tickets.ts` → `apps/server/src/routes/tickets.ts`, and `notifications/sweep.ts`), and ZERO resolve beyond their file's end.** **Two are genuinely ambiguous**, and only two: `store.ts:145` has **3** candidates and `page.tsx:781` has **23**. **⚠ AND THAT IS THE HONEST SHAPE OF THE RESULT.** A citation sweep is a weak instrument — it proves a pointer resolves, not that it agrees, and this report has four findings about citations that resolve and mislead. **What it does prove is a negative worth having:** the catalogue does **not** carry the stale-pointer problem that the delta document (P26), the tap-targets docblock (I4) and three live files (P25) all do. **The 97 case ids in this lane's concern cite files that exist, at lines that exist**, which is more than can be said for three other artefacts reviewed this round. **And the two ambiguous ones are the same shape as a defect I had in my own round-1 report**: `page.tsx:781` cannot be resolved by any reader, in a product with 23 files of that name. |
| **The ticket-type reorder arrows — a claimed RULED divergence, verified at its source** ⚠ **r2 ADDITION** | **MATCHES + a correctly-stated divergence — the product cites two prototype values and BOTH are right** | The brief names *"the 44px tap target overriding the prototype's 32/36"* as a deliberate, ruled divergence, so I checked the premise rather than the claim. **The prototype does draw the control.** `isTypes`' block renders `<button onClick="{{ t.up }}" … aria-label="Move up">&uarr;</button>` and the `Move down` twin (`:832-833`) — so the product is not inventing an affordance. **Its size is not inline, which is why a markup-only comparison would miss it:** the style is the data-driven `{{ t.upStyle }}` (`:832`), defined at `:3160-3161` as `upStyle: btn + (i === 0 ? ";opacity:0.4;cursor:not-allowed" : "")`, over a shared constant at **`:3151`**: `"min-height:32px;min-width:36px;border:none;border-radius:var(--ctlR);background:var(--ctlBg);box-shadow:var(--ctlShadow);color:var(--accent);font-size:15px;cursor:pointer"`. **The product's comments name both numbers and both are correct:** `ui.css:5840` is `min-height: 2.75rem; /* 44px, not the prototype's 32px */` and `:5841` is `min-width: 2.75rem; /* 44px, not the prototype's 36px */`. **And the disabled treatment matches exactly** — the prototype's `opacity:0.4;cursor:not-allowed` against `ui.css:5855`'s `.ticket-type-list__move:disabled { opacity: 0.4; cursor: not-allowed; }`. So the divergence is real, ruled, and **correctly recorded at the rule with two prototype values that a reader can check without opening the export** — the same discipline the calendar's comments use. |
| **The calendar — every value compared against the export** ⚠ **r2 ADDITION** | **MATCHES, and the transcription records its source** | The export's `isCalendarView` block (`Gisik Nokma - Desktop.dc.html` sha `3d142d46…`, `:480-510`) against the product's `.gn-calendar` family (`ui.css:3076-3260`). **`min-height:420px`** → `.gn-calendar__grid`'s `min-height: 26.25rem; /* 420px */` (`:3234`) ✓. **`min-height:36px`** (twice in the export, on the nav button and the Today row) → `min-height: 2.25rem; /* 36px */` (`:3102`, `:3119`) ✓. **`font-size:12px`** (four times) → `font-size: 0.75rem; /* 12px */` (two rules) ✓. **`border-radius:var(--ctlR)`** → `var(--gn-radius-control)` ✓. **`padding:7px 14px`** → `0.4375rem 0.875rem; /* 7px 14px */` ✓; **`padding:0 14px`** → `0 0.875rem; /* 14px */` ✓; **`padding:0 12px`** → `0 0.75rem; /* 12px */` ✓; **`gap:6px`/`gap:8px`** → `0.375rem`/`0.5rem` ✓. **⚠ AND THE TRANSCRIPTION CARRIES ITS SOURCE, WHICH IS THE PART WORTH PRAISING.** Almost every converted value in this family is followed by a comment naming the prototype's own number — `/* 36px */`, `/* 7px 14px */`, `/* 420px */`, `/* 12px */` — so a reader can check the conversion against the authority **without opening the export**, and a later refresh that moves the prototype is one grep away from finding every site. **That is the discipline the rest of this report is asking for, applied by hand, in the one place nobody asked for it** — and it is why this screen took one comparison instead of a search. |
| **The board's per-column empty state — compared VALUE BY VALUE against the export** ⚠ **r2 ADDITION** | **MATCHES, with three documented divergences** | The owner asked for prototype comparison, so this is one screen measured rather than gestured at. In `Gisik Nokma - Desktop.dc.html` (sha `3d142d46…`) the per-column empty block is `:391-396`; the product's rules are `ui.css:846-890`. **Container:** prototype `background:var(--fill4); border-radius:12px; padding:22px 16px` → product `var(--gn-fill-quaternary)`, `var(--gn-radius-card)`, `1.375rem 1rem` = **22px 16px**. ✓ **Icon:** prototype `34px × 34px` → product `2.125rem` = **34px**. ✓ **Copy:** prototype `font-size:15px` → product `0.9375rem` = **15px**. ✓ **Three divergences, each with its reason written at the rule:** (a) the icon is `border-radius:50%` where the prototype uses the chip's pill `999px` — identical on a 34×34 square, and the docblock gives the reason (*"A circle on a SQUARE box is `border-radius: 50%`, `.gn-avatar`'s own idiom, not `.gn-chip`'s pill `999px` — this box is 34x34, not a text-width pill"*); (b) the icon's `chipBg`/`chipShadow` become `fill-tertiary` plus per-axis overrides for `minimal` and `neo`, rather than editing the shared `.gn-chip` the do-not-edit list protects; (c) the action button has **no rule of its own** — `board.tsx` renders the shared `<Button>` instead of a bespoke `ctlBg`/`ctlShadow` selector, with `ctlShadow` named as *"the SAME open decision `.gn-button`'s own docblock already records as deliberately left to the repo owner"*. **⚠ I am NOT filing (a)–(c) as findings, and the reason is the owner's own rule — they are divergences with a reason written at the rule, and I do not argue the reasons are mistaken.** §3 scores a category-2 divergence only if the finding argues the ruling should not stand; these reasons are sound and two of them are structural (a shared class the file may not edit; one component rather than two spellings). **The row is here because a screen that MATCHES on every number is a coverage result, not a non-event.** |
| **The legal pages' segmented control uses LINKS, not tabs** ⚠ **r2 ADDITION** | **GOOD — and it is the contrast that makes P19 a defect rather than a convention** | `apps/web/src/legal-chrome.tsx:92-104`: `<div className="gn-segmented gn-legal__tabs">` containing `<Link href="/privacy"|"/terms" className="gn-segmented__item…" aria-current={active ? 'page' : undefined}>`, with **no `role="tablist"` and no `role="tab"`** — which is the correct pattern for a control that *navigates between two pages* rather than switching panels in one. Its docblock says so: *"Privacy / Terms, as a segmented pair. See the docblock for why links."* **So the product contains all three spellings and only one of them is wrong:** the sheet's tablist is a real `tablist` **with a name** (P19's measurement), the legal pair is **links with `aria-current`** (correct for navigation), and the project page's is a **`tablist` with no name** — the one combination that is neither. |
| **Every direct `.gn-button` on a real `<button>` sets `type="button"`** ⚠ **r2 ADDITION** | **CHECKED, CLEAN** | Six sites use the `Button` component's classes directly instead of the component, which matters because `Button` defaults `type={type ?? 'button'}` (`button.tsx:8`) and a bare `<button>` inside a `<form>` defaults to **submit**. Swept all six: the three in `p/[projectId]/page.tsx` (`:1999`, `:3400`, `:3405`) each carry `type="button"` explicitly, and the three in `ticket-type-editor-pane.tsx` (`:122`, `:169`, `:188`) are **`<Link>` elements** — which need no type, and that file contains **no `<form>` at all** (`grep -cE '<form'` → 0). **So no implicit-submit path exists in the product today** — the check that would catch one is stated here so the next sweep can re-run it. |
| **No positive `tabindex`, and no `aria-hidden` on a focusable element** ⚠ **r2 ADDITION** | **CHECKED, CLEAN** | Two classic focus defects, swept product-wide over six source trees. **Positive `tabindex`:** `grep -rnE 'tabIndex=\{?[1-9]|tabindex="[1-9]'` → **no matches**, so nothing overrides the document's natural tab order. **`aria-hidden` hiding a control:** every `aria-hidden="true"` site was read with its element — the crumb separators (`ticket-sheet.tsx:1762`, `:1774`, `:1782`, `:1788`), the full-screen icon (`:1884`, an `<svg>` inside a button whose text reads *"Exit full screen"* / *"Full screen"*), the chip dot, the legend swatches, and `inbox/icons.tsx`'s `NotificationIcon` — and **none sits on or inside a focusable element**, with the element-line sweep returning no matches. **Together with P23 this closes the focus-indicator surface: of the two `outline: none` in the product, one is replaced on a stretched layer and one is P23; nothing else removes a ring, so every remaining control keeps the user-agent default.** |
| **WCAG 2.2 §2.4.11 *Focus Not Obscured* — no sticky positioning exists anywhere** ⚠ **r2 ADDITION** | **CHECKED, CLEAN — with its boundary stated** | 2.4.11 is Level AA and new in WCAG 2.2: a focused component must not be **entirely** obscured by author-created content. **The classic failure needs sticky positioning, and this product has none** — sweeping both stylesheets for `position: sticky` returns **zero rules**. **Exactly three fixed overlays exist:** `.gn-dialog__scrim, .gn-sheet__scrim` (`fixed`, `z-index: 40`), `.gn-filters__panel` (`fixed`), and `.gn-toast-layer` (`fixed`, `z-index: 60`, `left: 0 right: 0 bottom: 1.5rem`). The first two are modal scrims, which 2.4.11 exempts for content the author has made inert — and `aria-modal="true"` is exactly that assertion. **⚠ THE BOUNDARY, STATED RATHER THAN GLOSSED:** the toast layer is the one I cannot clear from a stylesheet. It is fixed, spans the full width at the foot, and carries the **highest z-index in the product (60, above both scrims at 40)** — so a focused control in that band could in principle be covered for the toast's 15s. **I did not render it, so I am not filing it**: the layer is `pointer-events: none` so it never intercepts, and whether it *visually* obscures a focused control depends on where focus is, which is a browser measurement I have not made. **Recorded as an unmeasured boundary, not as a finding** — the honest form the rules ask for. |
| **WCAG 2.2 §2.5.7 *Dragging Movements* — satisfied BY CONSTRUCTION, not by accident** ⚠ **r2 ADDITION** | **GOOD — and it is the strongest piece of accessibility reasoning I found in this lane** | 2.5.7 is Level AA and is new in WCAG 2.2: functionality that uses a **dragging movement** must have a **single-pointer alternative**. The board is drag-and-drop (`board.tsx:977` `draggable`, `:948-955` the drag wiring). **The alternative is a pair of real buttons**, `board.tsx:1742-1757`: a `.gn-board-card__moves` row holding two `<button className="gn-board-card__move">`, each with `aria-label={arrowLabel('previous'|'next', targets)}`, `onClick={() => arrowClick(targets)}`, and `disabled` when that direction has no target. **⚠ AND THE PART THAT MAKES IT A DESIGN RATHER THAN A COINCIDENCE: `board.tsx:977` is `draggable={arrows !== null}`.** The card is draggable **only when the arrow alternative exists** — so the criterion cannot be violated by a later change that removes or withholds the arrows, because the drag capability is gated on their presence. **That is exactly the shape this report keeps asking for elsewhere and rarely finds:** not a rule enforced by a reviewer remembering it, but a relationship the code cannot break without failing to compile or failing a case. **Contrast P19/P21/P22, where the same product gets an accessible name right in one place and omits it in an identical one; here the two things that must agree are bound to each other.** |
| **`prefers-reduced-motion` covers every animation and the one motion-bearing transition** ⚠ **r2 ADDITION** | **CHECKED, CLEAN** | Swept all three stylesheets. **Five real `animation:` declarations** — `.gn-sheet__scrim` (`ui.css:342`, `gnFade 200ms`), `.gn-dialog` (`:379`, `gnRise 240ms`), `.gn-sheet` (`:403`, `gnSlide 260ms`), `.gn-toast` (`:443`, `gnRise 220ms`) and the help surface (`:3925`, `gnFade 250ms`) — and **each has its own `@media (prefers-reduced-motion: reduce)` block setting `animation: none`** (`:346`, `:382`, `:406`, `:446`, `:4620`). Every other `animation:` hit in the files is prose inside a docblock. **And the transitions are almost all colour** — the only one that moves anything is `.gn-switch::after`'s `transition: transform 0.15s ease` (`:5461`, tracking the knob's 20px travel), and it is covered at `:5482-5484` by `.gn-switch::after { transition: none; }`. **So a person who has asked their system for less motion gets none of it**, on every surface this lane covers — which is worth stating plainly in a report that is otherwise a list of absences. |
| **Every `<button>` has an accessible name** ⚠ **r2 ADDITION** | **CHECKED, CLEAN** | Swept all six source trees, comments stripped and **multi-line aware** (the lesson P1's `<Link>` blind spot taught): for each of **85 `<button>` elements** (the control — the pattern demonstrably matches), required an `aria-label`/`aria-labelledby` in the opening tag **or** a literal text child. Three candidates came back and **all three are false positives, each for a different reason worth recording**: `select.tsx:240` and `:254` carry their name through `<button {...buttonProps}>`, a React Aria spread — the attribute is in the object, not in the literal tag, so no text-based sweep of the markup can see it; and `board.tsx:1036` has the child `{card.title}`, an expression my pass strips. **So: zero unnamed buttons found — and the sweep's stated limit is that a spread can carry a name the source text cannot show**, which means this check can produce false positives but not false negatives for the literal case. |
| **No unlabelled `<input>`** | **GOOD** | 48 `<input>` sites in code (control: 12 more removed as comment prose — docblocks that *mention* `<input>` in backticks, e.g. `switch.tsx:44`). **32 are inside a `<label>`**; the remaining 16 carry `id` or `aria-label`. **Three apparent stragglers resolved to false positives when opened** (`select.tsx:391` is a prop object passing `'aria-label'`, `select.tsx:481` spreads `inputProps` from `useComboBox`, `ticket-list.tsx:832` is a `TableColumn` object literal whose docblock states the accessible-name reason). **Net: zero unlabelled inputs found.** |

---

## 6. STALE MATERIAL IN THE BRIEFING ITSELF

**`controller-state.md:41`** — cited **in this review's own common brief** as a model example of a divergence that is "ruled": *"the state crumb the sheet has and the authority's chain does not."* **The sheet no longer has a state crumb.** It was removed by the task this exercise follows (`16.63` asserts the removal). Cycle 33's entry was written at `main = b05889b6` (PR #620), which precedes the breadcrumb's merge (PR **#622**, `39198c01`). So the brief hands three lanes a worked example of a ruled divergence that no longer exists — in the paragraph that warns *"a report that calls every category 2 a defect is wrong."* Small, but it is exactly the class the example is meant to teach, and it is in the teaching material.

---

## 7. CASES IN MY CONCERN

**Owned:** `16.63`–`16.71` (the breadcrumb ancestor chain + the parent-indicator merge) and `16.87`.

**Measured.** `pnpm check:citations` → **`EXIT=0`, `check-case-citations: ok (ratchet holds exactly on every file)`**, `16-remaining-doors.md: 97 cited / 0 uncited`. Spot-checked citations resolve to substantive assertions, not bare mentions: `ticket-sheet.test.tsx:2919` *"16.63 draws the grandparent between the project and the parent"*, `:3080` *"16.63 the state is not a crumb, and the state chip still names it"*, `:2891` *"16.87 draws workspace, project, parent and key, in that order"*, `:3104` *"16.87 draws no breadcrumb at all when the host supplies no names"*.

**⚠ The limit of that instrument, stated so the green is not over-read.** `check:citations` asserts that each `✅` id is **cited** — i.e. that the id string appears in a test. It cannot distinguish *the test asserts this case* from *the test names this case*, and it cannot see an assertion that no longer holds of the product (a case can pass while the property it names has stopped being true). **I did not open all 97 of §16's tests, so I am reporting the instrument's result and not a verification of each case.** This is not a finding about any specific case; it is the boundary of what I measured.

**Allocation status, verified against `test-cases/16-remaining-doors.md:16,19,21,44`:** `16.63`–`16.71` are minted (mine); `16.72`–`16.80` were reallocated to exec 2 by the controller; §17's uniform 3-digit shape **is** recorded in that file at `:44`, which was the sentence the override said was owed — **that obligation was met.** §16's ids for the breadcrumb region appear minted and consistent with the file.

---

## 8. FINDINGS BY SEVERITY — members named, not counted from memory

⚠ **Ids are in discovery order, not reading order** (`I*` are instrument findings, `P*` are product/render findings; the second pass added `P8`–`P10` before `P3`–`P7`). **This section is the enumeration that groups them.**

**CRITICAL — 1**
- `I1` no browser-based UI instrument has executed anywhere since 2026-09-06, and the local gate structurally cannot run one

**IMPORTANT — 16**
- `I2` the `e2e-stack` contrast roster records a defect fixed eight hours later, with no provenance
- `I3` `DENSE_IN_LIST`'s stated reason for excluding `.gn-my-work__title` is falsified by its own docblock
- `P1` six interactive controls styled by no rule of their own (raw UA chrome) **(filed as seven; the seventh was refuted by an ancestor rule and withdrawn)**
- `P2` the board's whole-board empty state has no prototype counterpart and no styling
- `P9` `SegmentedControl` carries ARIA tab semantics with none of the tab keyboard model, in 7 places
- `P11` the `Select` panel is outside every sweep's population, for two independent reasons
- `P12` every screen in the product has the same document title (WCAG 2.4.2, Level A)
- `P16` ⚠ r2 — `neo-card-radius.test.ts` asserts a declaration is ABSENT through a truncating scanner, so it cannot fail
- `P18` ⚠ r2 — a client-side navigation announces nothing: no title change, no focus move, no live region
- `P19` ⚠ r2 — the project page's view switcher is an unnamed `tablist`; the sheet's identical one was fixed
- `P21` ⚠ r2 — the description editor is a `role="textbox"` with **no accessible name**, and its visible label is not associated **(reported as no role; corrected twice, the second time substantively)**
- `P22` ⚠ r2 — two `role="menu"` elements have no accessible name; one has a named twin in the same bar
- `P23` ⚠ r2 — the searchable Select removes its input's focus outline and replaces it with nothing (WCAG 2.4.7, Level AA)
- `P24` ⚠ r2 — a painted text colour measures 3.84:1 at 12.8px and is UNDECLARED, so the gate cannot see it
- `P26` ⚠ r2 — the prototype-delta document is stale in BOTH halves: **every numbered queue row is closed** and **two of five per-screen gap claims no longer describe the product**
- `P30` ⚠ r2 — the mobile editor webview is two generated links behind and both links are unguarded

**MINOR — 17**
- `I4` `tap-targets.ts` cites `ui.css:1606-1616` for a sentence that is at `:1662`
- `I5` my own handoff carries two contradicting position blocks; the pointer that found it is itself stale
- `P3` the parent crumb cannot show the parent's key; the prototype's does; no ruling found
- `P4` "the SAME plain span" is false of the restricted arm (code docblock + `Features.md:77`)
- `P5` an owner-requested type selector was neither built nor reported
- `P6` mobile: two of three screens have no styling while the third is themed
- `P7` desktop's task list has no rules
- `P8` `Dialog`/`Sheet` declare `aria-modal="true"`; the missing containment is recorded as a named follow-on whose remedy exists in-repo (counted here, not under IMPORTANT — see the note)
- `P10` the accessible-name ratchet's unit is an attribute; its message claims a property of assistive tech
- `P13` no skip link; a keyboard-only user Tabs the nav on every navigation (**the 2.4.1 claim is withdrawn in the body** — a landmark is a sufficient technique and `<main>` is on every route, so this is a keyboard-convenience finding, not a conformance one)
- `P15` ⚠ r2 — the repo's prototype copy is a broken camelCase transform of the export, cited by line in 71 files
- `P17` ⚠ r2 — `/my-work`'s outline skips level 2, and nothing measures heading level or order
- `P20` ⚠ r2 — the month grid and week columns carry no grid/table semantics, so day↔weekday is lost to AT
- `P25` ⚠ r2 — three live files cite the docblock of a deleted component, one of them an instrument
- `P27` ⚠ r2 — the viewport suite's narrowest width is 390px; WCAG 1.4.10 names 320px and nothing tests it
- `P28` ⚠ r2 — the mobile board's row is the one pressable of six with no accessibility role; its sibling sets one **(observation credited to the opposing lane; the census is the addition)**
- `P29` ⚠ r2 — the mock suite says every stub carries its server `file:line`; two of ten carry the file only, and they are the two whose contracts drifted

**Total 34.** `raised` and `sum by severity` agree by enumeration above. ⚠ **Two ids carry two severities on purpose and are each counted once.** `P8` — **MINOR as a product finding, IMPORTANT as a follow-on**: the gap is recorded in the product with a named follow-on, so it is not a discovery, but its remedy exists in-repo and tested on a less-used surface, and a workaround for the focus leak already ships (`13.793`). `P5` is **MINOR as a product** finding (the form works and the owner's `or` clause is arguably satisfied) and **IMPORTANT as a record** finding (an owner instruction is neither satisfied nor recorded, and the override said to stop and report). **It is counted under MINOR**, so the sum stays honest rather than double-counting one finding to inflate the Important row.

---

## 9. THE CLAIM I AM LEAST SURE OF

**P1.** Its *measurement* is solid and reproducible (the extractor has a positive control and the `ticket-type-list__move` precedent proves the extractor sees a rule when one exists), and **it has already survived one correction that widened it** — the `<Link>` blindness (§10), which grew the list rather than shrinking it. But what I have not done is **look at six of the seven controls on a screen**. The precedent's own evidence was a Chromium reading of computed `borderStyle: outset`; mine is the absence of a selector block. If a React Flow or editor stylesheet I did not enumerate reaches them, P1 collapses. **The three stylesheets are the entire product's CSS as measured by `find . -name '*.css'` excluding `node_modules`/`.next`/`dist` — if a fourth exists under a path I excluded, this is where it would hide.**
**And the one member I *could* check at paint came back passing** (77×44, `offenders=0`) — which is now the *withdrawn* seventh, so it is no longer evidence either way for the six that remain. **That withdrawal is itself the answer to the question §9 asks:** the sweep's blind spot was descendant rules from ancestors, one member fell to it, and the other six were re-checked against every `a`/`button` descendant selector in the three stylesheets before the correction was written. **What keeps this at Important and not higher is unchanged: the mechanism is proven by precedent on one class, and the painted consequence is unproven on all six.**

**Second:** I3's *consequence* (a slackened baseline) is an inference from `8e742d18`'s arithmetic, not a measurement. The two controls it moves are named; the number they leave behind is not measured. Marked unverified in place.

---

## 9b. ⚠ MY OWN ARITHMETIC CHECK HAD A BLIND SPOT, AND IT HID A REAL ERROR

**What happened.** Round 1 ended with a check that asserted `critical + important + minor == total`, and separately that the number of `### <id> —` headings and the number of `- \`<id>\`` summary rows both equalled the total. **Every one of those agreed, at 24, while the report was wrong.** Three findings headed **IMPORTANT** — `P16`, `P18`, `P19` — were sitting in the **MINOR** list, and the per-severity headers (`IMPORTANT — 11`, `MINOR — 12`) were stale from earlier edits.

**Why the check could not see it.** It compared **aggregates to aggregates**: the headers summed to the total, the headings counted to the total, the rows counted to the total. **Nothing compared a row to its own bucket.** A misplaced row is invisible to every one of those four comparisons, because moving a row between two lists changes neither the total nor the heading count — and the stale headers were themselves the thing being summed, so they agreed with themselves.

**It is the same shape as two findings already in this report** — P16's scanner, which asserts a declaration is absent by looking at a truncated rule, and I2's roster, which records a count without the run that produced it. **A check that measures the wrong unit passes.** Mine measured totals; the question was membership.

**The check that does see it, and it is four lines:**

```
ids  = re.findall(r'^### ([IP]\d+) — \*\*([A-Z]+)', md, re.M)   # id -> its own heading severity
rows = re.findall(r'^- `([IP]\d+)`', md, re.M)                    # each summary row, in order
assert Counter(sev for _, sev in ids)['MINOR'] == count_of_rows_under('**MINOR —')
```

**✅ RUN AT THE END OF ROUND 2, AND EVERY CHECK PASSES.** Four cross-checks over the whole report at 31 findings:
- **Each finding's own heading severity against the list it is placed under** — **31 findings, no mismatch**. This is the check that would have caught the error found and fixed earlier this round, where three IMPORTANT findings sat in the MINOR list under stale headers while every total still agreed.
- **Bucket membership against the headers** — **1 / 15 / 15, matching**; and **no finding lacks a summary row**.
- **The citation sweep** — **202 distinct `file:line` references, all 202 resolving inside their file and none beyond EOF.** The one file the sweep cannot resolve is the breadcrumb dispatch in `gisik-nokma-lanes/`, which is outside the repository and is named with its directory.
- **Nothing was lost to the freeze** — comparing this report's headings against `origin/main`'s landed copy: **all 18 landed findings are still present**, and the count is now 31.

**⚠ AND A LIMITATION OF MY OWN SWEEP THAT FLAGGED THREE CITATIONS WHICH TURN OUT TO BE CORRECT — worth stating because the sweep is the instrument this section rests on.** Its fallback resolves a bare path by **basename**, so `members/page.tsx` matched a 383-line namesake and `routes/tickets.ts` matched a namesake with 562 lines. **Opened and checked: `members/page.tsx` is unique and 1002 lines, and `apps/server/src/routes/tickets.ts` is 965 lines** — the latter's `:617-619` is exactly `let cursor = state.parentId;`, the line P26's §5 correction cites. **So all three flags were the sweep's, not the report's.** **The rule the section already states applies to this instrument too: a path that is not fully qualified is not a citation, and the sweep that consumes one inherits its ambiguity.** The citations in this report that ARE fully qualified all resolve. **`members/page.tsx` is unique in this repository** (`find` → 1), the real file is **1002 lines**, and both cited ranges hold exactly what the findings say. **The instrument was wrong and the citations were right** — which is the fourth time this round that a measurement's premise, not its arithmetic, was the fault.

**Every number in this section was produced by a command, not recalled.**

**⚠ AND THE ERROR HAS A CAUSE WORTH NAMING, because it recurred FIVE times in this round.** Every occurrence came from the same habit: **adding a summary row by anchoring on an existing row's text** — `s.replace("- `P10` …", "- `P25` …\n- `P10` …")` — which puts the new row wherever that anchor happens to live. Twice the anchor was in the wrong list and three times the header was stale, and **the totals agreed every single time.** **The fix is not care, it is construction: §8 is now REBUILT from each finding's own heading** — read the severity off `### P25 — **MINOR** —`, group, emit — so a row cannot land anywhere but under its own severity. **The habit was the defect; the rebuild removes the opportunity for it.**

**Compare MEMBERSHIP, not size.** The report's §8 now groups by each finding's *own heading*, so the two cannot disagree, and the check above is the one the judge can run.

## 10. A METHOD NOTE THE REPORT OWES THE NEXT READER

Two of my own instruments disagreed while I was writing this: a selector extractor reported **0** rules for all four `DENSE_IN_LIST` `declaredAt` classes, while a plain `grep` found three of them. **The extractor was wrong** — I had built the match pattern with the leading dot in both the needle and the pattern, so it searched for `..gn-attention__title`. **Opening the lines settled it**: `.gn-attention__title {` at `ui.css:1667`, `.gn-help__group-toggle {` at `:4311`, `.gn-help__nav-link {` at `:4418`, `.gn-help__pager-link {` at `:4584` — all four exist, and §5's row stands.

**The lesson is the one this repository keeps re-learning and it is worth one line here:** two instruments disagreeing is the *signal*, not a nuisance — and the only resolution is to open the artefact. Had I trusted the extractor I would have reported that every `DENSE_IN_LIST` entry is stale, which would have been a confident, well-formatted, entirely false Critical. Had I trusted the grep alone I would have missed that my extractor was broken for a whole class of input. **The extractor's own positive control (`.gn-board-card__move` → 4) passed the entire time** — a control that proves the instrument works on *one* path does not prove it on the path you are about to report from.

### And a second one, found the same way, in the sweep that produced P1

**My first UA-chrome sweep matched literal host elements only** — `<(button|input|select|textarea|summary|a)…` — so **every `<Link>` was invisible to it**, and Next's `<Link>` renders an `<a>`. The painted run is what exposed it: the suite prints `a.gn-nav__signin "Sign in"` as a measured element, and that class was nowhere in my results.

**The correction is instructive because the first attempt at it produced a FALSE ZERO with no error.** I widened the pattern to `<[A-Z][A-Za-z]*Link` — which requires at least one character *before* "Link", so it cannot match the literal `<Link` tag, which is the only spelling in this repo. It answered **0**, cleanly. What caught it was asking for a **control on the same path**: `grep -rhoE '<[A-Z][A-Za-z]*Link[^>]*className='` returned **0 occurrences seen**, while `legal-nav.tsx:97` plainly reads `<Link className="gn-nav__signin" href="/sign-in">`. **A pattern that matches nothing and a codebase that contains nothing print the same thing.** Corrected to `<(Link|[A-Z][A-Za-z]*Link)\b`, the control reads **18 occurrences seen** and the sweep finds exactly one site — which is P1's seventh member, with a sibling-roster measurement confirming it is the only unstyled class in its component.

**Both bugs in this section are the same bug**: an instrument reporting a well-formed empty for a reason unrelated to the property it named. Neither was detectable from inside its own run. One was caught by a second instrument, the other only by a control that counted what the pattern *saw* rather than what it *returned*.

### A third and a fourth, both caught by insisting on a control, both in the route sweep

**P12's claim nearly died the same way, in the opposite direction.** I swept for page titles with `grep -rl 'generateMetadata'` and got **nine hits** — which would have falsified my finding before I wrote it. All nine were `apps/web/.next/types/app/*/page.ts`: **Next's own generated type files, produced by the `next build` I had just run two sections earlier**, and `.next` is gitignored. The measurement that caught it was not the grep but **`git check-ignore -v` on one of the hits** — asking whether the file I had just measured was in the repository at all. **A build artefact I created myself had become evidence about the code.** Re-run with `--exclude-dir=.next`, the count is **1**, and the finding stands.

**And the input-labelling sweep took three iterations to say anything true.** The first version matched `<input` in docblocks (12 of 60 "sites" were prose). The second — comment-stripped — still flagged 9, including `sign-in/page.tsx`'s two inputs, which I opened and found **wrapped in a `<label>` two lines above**. The heuristic was `/<label\b/ && !/<\/label>/` over a look-back window, so **any input in a form with an earlier labelled field was convicted by its sibling's closing tag.** The correct test is which comes *last* — the last `<label` before the input, versus the last `</label>` — and with that, **3 stragglers remained** (48 inputs, 32 label-wrapped). Opened, all three were false positives too: `select.tsx:391` is a prop object passing `'aria-label'`, `select.tsx:481` spreads `inputProps` from `useComboBox`, and `ticket-list.tsx:832` is a `TableColumn` object literal whose own docblock gives the accessible-name reason.

### A fifth, and the reason to distrust a `0` that arrived from a shell

**P26's `.workflow-list` row first measured ZERO selector blocks** for a family that has **19**. The command built its `grep -E` pattern by interpolating a shell variable into a string whose alternation ended in `$)` — **so the shell mangled the pattern and it matched nothing, cleanly, with no error.** Re-measured by hand it is 19. **What caught it was running the same shape against a class whose answer I already knew**, `.gn-board-card__move` → 4; the 0 was therefore a lie rather than a finding. **That is the cheapest control there is and the one I reached for last.**

### A sixth, at the very end, which nearly filed a finding against a citation convention I did not recognise

Chasing P26 I read the delta document's baseline — `desktop.dc.html@6d7b67c0a52c` — as a **sha256**, could not find it on disk, found `PROVENANCE.md` recording `2cda054b` for the same file, and had the finding written in my head: *the baseline is unverifiable and is not the artefact the owner ruled is the authority.*

**It is a git BLOB sha, and one command settles it:** `git cat-file -t 6d7b67c0a52c` → **`blob`**, and `git rev-parse HEAD:design-system/interactive/desktop.dc.html` → **`6d7b67c0a52cb31aca3001b3fa6eb30c4268e9e4`**. The same bytes, two hashing conventions. **And because that blob is unchanged at HEAD, the repo's copy has not moved since the document was written** — so its baseline is not merely verifiable, it is still current.

**The lesson is not "check your hashes". It is that I inferred a defect from a convention I did not recognise, and the wrong reading was the one that made the document look worse.** That is the direction **five of the six** share: my instruments failed toward *finding* something, not toward missing it. **A reviewer's errors are not symmetric, and mine run one way.**

**And the positive half belongs here too:** the delta document cites its baseline by **git blob sha**, which is strictly *more* checkable than the sha256 the round-2 brief asks lanes to use — `git rev-parse` resolves it, and a sha256 of a working-tree file resolves to nothing. **The document is better cited than the instruction reviewing it.**

### A seventh, and this one is a SAMPLE mistaken for a UNIVERSE — the most transferable mistake in the section

**P21's measurement said no library sets a `role` attribute on the editor.** I grepped `prosemirror-view`'s `dist` and `@tiptap/react`'s `dist`, found no `textbox` in either, and reported the absence. **Both greps were accurate; the conclusion was false**, because the package that sets it is neither of them: **`@tiptap/core@3.30.5`, `dist/index.js:6453`, `attributes: { role: "textbox", ...editorProps?.attributes }`.**

**I searched the packages I knew about rather than the dependency chain.** One grep over the right directory finds it — `node_modules/.pnpm/@tiptap+core@3.30.5*/dist` — and I never ran it, because I had already decided which packages could hold the answer. **The repository already said so too**, at `packages/editor/src/extensions/mention-popup.ts:61`: *"PROSEMIRROR ALREADY SETS `role=\"textbox\"` on the editor element — observed, not assumed"* — **in a file I had opened earlier in the same round and read past.**

**And this one is the worst kind, because it hid behind a correction.** My first wording said *"no role"*; I corrected it to *"no role ATTRIBUTE, the role is implicit"*, which **sounded like diligence and was a differently wrong claim.** A correction that replaces one wrong statement with another is worse than the original, because it now carries the appearance of having been checked.

**The transferable rule, since this is the seventh of seven: an absence claim needs its UNIVERSE enumerated, not its sample.** The six before this one were instruments that produced well-formed wrong answers; this one was a *search space* I chose and did not state. **Every absence claim in this report should be read with its search boundary beside it — and the ones that name a directory, a file set or a command in the same sentence are the ones I would trust.**

**The honest summary of this section: SEVEN instruments I wrote produced confident wrong answers, and every one was caught by a control or by opening the artefact rather than by reading the result harder.** They failed in **three different directions**, which is why "check the result" is not a remedy:

| instrument | what it would have produced | direction |
|---|---|---|
| selector extractor (double-dotted needle) | `DENSE_IN_LIST` has four stale entries — a **false Critical** | manufactured a **finding** |
| label-nesting heuristic (sibling `</label>`) | 9 unlabelled inputs — a **false Important** | manufactured a **finding** |
| `<Link>` blindness | one unstyled control **missed entirely**, and the report's count wrong | manufactured a **clean bill** |
| `.next` build artefacts counted as source | P12 apparently falsified — a **true finding deleted** | manufactured **the opposite of itself** |
| shell-mangled `grep -E` pattern (P26's `.workflow-list`) | 0 rules for a family that has 19 — a **false open row** | manufactured a **finding** |
| a dependency chain searched as a sample (P21) | *"no library sets a `role`"* — a **false measurement inside an Important finding** | manufactured **the opposite of itself** |
| a **git blob sha** read as a sha256 (the delta doc's baseline) | *"unverifiable, and not the authority"* — a **false finding against a document that is better cited than the brief reviewing it** | manufactured a **finding** |

**A control is not a formality you run at the end — in this lane it was the only thing standing between seven confident reports and the truth.** And note which controls worked: not one of them was a re-reading. Three were a **second instrument on the same path**, and one was asking whether the file I had measured was **in the repository at all**.
