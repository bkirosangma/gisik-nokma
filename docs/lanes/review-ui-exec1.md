# REVIEW — EXECUTOR 1: UI (rendering layer + accessibility)

**Lane:** exec 1 · branch `exec1/review-ui`, cut from `origin/main = e4baa425966b331fdc1b189e3d1c86b667e30acc` · 2026-09-21
**Method:** enumerate → cover → state coverage including what was **not** reached. No fix branch, no fix commit, no PR.
**Prototype authority:** the staged export at `/Users/kiro/my_projects/gisik-nokma-lanes/prototype-2026-09-20/`.
Primary comparison file: **`Gisik Nokma - Desktop.dc.html`, sha256 `3d142d464a070b33…`**, cited by line. Bundle `Gisik Nokma Desktop.html` = `bf64cc446880281f…` (matches the `bf64cc446880` the owner's ruling names). **The repo's `design-system/interactive/desktop.dc.html` was NOT used as the comparison surface.**

---

## 0. THE ONE-LINE ANSWER

**A green gate is not evidence about this lane.** `pnpm turbo run build test typecheck` returned **33/33 successful, `Cached: 0`, `EXIT=0`, Node v22.22.2** at this tree (I ran it). In the same window, **no browser-based UI instrument has executed anywhere — CI or local — since 2026-09-06**, and the only suite that reaches the authenticated sheet holds **three deliberately-standing reds**, one of which was fixed eight hours later without its recorded artefact being regenerated.

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

**⛔ NOT REACHED — and this is the honest boundary, stated as a list:**
1. **No painted DOM anywhere. No browser ran, no screenshot was taken.** Every rendering claim below is a measurement of *source and stylesheets*. Section 5's last row says why a live run would have measured a different product. **A static claim is weaker than a painted one and I am not going to dress it up.**
2. Not reviewed file-by-file: `apps/web/app/*` route bodies (25 modules); the ~55 `apps/web/test/*` files; `packages/app-core/src/views/*` beyond `ticket-sheet`/`board`/`attachment-list`; `packages/editor`'s components beyond the class sweep; `apps/mobile`'s editor webview and both storage engines; `apps/desktop`'s Tauri config and storage; `apps/web/e2e/` (the mock-only suite). **`packages/ui` WAS read** — `button`, `card`, `chip`, `segmented-control`, `avatar`, `dialog`, `switch` in full; `sheet`/`toast`/`info-tip`/`table` grepped; `select/select.tsx` read for its structure, markup and sweep-visibility (it is built on React Aria — `useSelect`/`useComboBox`/`useListBox`/`useOption`/`HiddenSelect` — so its keyboard and role model comes from the library rather than from this repo, which is why P9's hand-rolled tabs stand out beside it). **Remaining largest hole: `apps/web/app/*`'s 25 route bodies.**
3. Prototype comparison performed for **two** surfaces only (the ticket-sheet breadcrumb, the board empty states). The other ~20 prototype files were not compared.
4. §16's 97 case ids were **not** each opened. `check:citations` was run (§7) and its limit is stated there.

---

## 3. INSTRUMENT FINDINGS

### I1 — **CRITICAL** — No browser-based UI instrument has executed anywhere since 2026-09-06, and the local gate structurally cannot run one

**WHAT.** `e2e` (the signed-in stack suite) and `viewport` (the signed-out suite) are the *only* instruments that measure tap targets, label-text floors, accessible names, non-text contrast and sideways overflow. Neither has run in ~15 days.

**MEASUREMENT.**
- `gh api repos/bkirosangma/gisik-nokma/actions/runs` across 12 pages (1,200 runs): the **last successful run is `34023679658` at `2026-09-06T09:05:54Z`**. Every run from `2026-09-06T11:52:24Z` to `2026-09-20T18:33:45Z` is `failure`. Pages 1–9 (900 runs) contain **zero** successes.
- It is not a failing step — **the runner never starts.** `gh api …/runs/35529457412/jobs` → **every one of the 14 jobs has `"steps": []`, `"runner_name": ""`**, and `scope` shows `started_at …18:33:46Z → completed_at …18:33:48Z` (2 s). `gh run view --log-failed` → `log not found`.
- The cascade: `scope` fails → `build`/`typecheck`/`server-tests`/`other-tests`/`e2e`/`viewport` are all **`skipped`**; `gate` (which treats `skipped` as fine) reports **`failure`**. `e2e` and `viewport` are `skipped` in **25 of 25** checked runs.
- The local substitute cannot cover it: **`test:e2e` appears `0` times in `turbo.json`** (control: `build`, `test`, `typecheck` all present), so `pnpm turbo run build test typecheck` cannot invoke either suite. Verified by running it — **33/33, `Cached: 0`, `EXIT=0`.**

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

### P1 — **IMPORTANT** — Six interactive controls are styled by no rule at all, so they paint as raw user-agent chrome

**WHAT.** Eight source sites, six distinct controls, where **no class on the element matches any selector block** in the product's three stylesheets.

| element | site |
|---|---|
| `gn-board__empty-create` (`<button>`) | `packages/app-core/src/views/board.tsx:494` |
| `gn-attachment__link` (`<a>` ×2) | `packages/app-core/src/views/attachment-list.tsx:93`, `:105` |
| `add-rule-menu__trigger` (`<button>`) | `packages/app-core/src/workflow-builder/ui/rule-editors/add-rule-menu.tsx:38` |
| `attachment-item__name` (`<a>` ×2) | `packages/editor/src/components/AttachmentListItem.tsx:106`, `:128` |
| `evidence-picker__cancel` (`<button>`) | `packages/editor/src/components/EvidencePicker.tsx:149` |
| `editor-slot__submit` (`<button>`) | `packages/editor/src/components/TicketEditorSlot.tsx:216` |

**MEASUREMENT.** Extracted all **702 selector blocks** from `ui.css` (comments stripped), plus `globals.css` and `editor.css`; for each static `className` literal on a `<button|input|select|textarea|summary|a>`, required that **at least one** of its class tokens matches a selector block. Nine results; `nodrag` (`state-node.tsx:47`) is React Flow's own marker and is excluded as not ours. **Positive control, same extractor, same path: `.gn-board-card__move` → 4 blocks; `.ticket-type-list__move` → 3 blocks.** The load-bearing fact: **`apps/web/app/globals.css:84` sets `button { font: inherit }` — font only**, with no `border`, `background` or `padding` reset, so an unstyled `<button>` keeps the UA's `outset` border and grey fill. The `<a>` elements are painted by the global `a { color: var(--gn-text-accent) }` (`globals.css:39`) and keep the UA underline; their **class** has no rule.

**WHY IT IS WRONG.** This is not a judgement call — the identical defect on **one** class (`.ticket-type-list__move`) was treated as a real defect on 2026-09-20, given a dedicated commit (`981aa92b`), a new case (`16.83`), and a six-way mutation witness, on the stated ground that *"the screenshot shows grey OS buttons in a neumorphic page."* These six have the same cause and no rule. `gn-board__empty-create` is the **first-run** call to action on an empty board; three of the others are in the editor's upload/cancel/submit path.

**WHAT WOULD HAVE BEEN BETTER.** One shared bare-control reset — `border:none; background:transparent; padding:0; font:inherit; color:inherit` — applied as a class (the shape `button.gn-ticket-sheet__crumb--link` already uses at `ui.css:672`), or per-class rules for the six. The `.gn-*` convention in `ui.css` already exists for exactly this; these six simply never joined it.

**⚠ NOT MEASURED, AND THIS ONE MATTERS.** These are **static and stylesheet** measurements. I did **not** confirm the painted result in a browser, for the reason in I2 (`:3001` serves a baked image predating `main`). The `ticket-type-list__move` precedent was confirmed in Chromium (`border: 2px outset`, `background: rgba(239,239,239,0.3)`); **I am asserting the same cause from the same kind of evidence and not the same kind of confirmation.** Treat as *measured, unconfirmed at paint*.

---

### P2 — **IMPORTANT** — The board's whole-board empty state has no prototype counterpart, and is the one board empty state with no styling

**WHAT.** `board.tsx:528` renders `<div className="gn-board gn-board--empty">`; `:490` renders `gn-board__empty-copy`; `:494` renders `gn-board__empty-create`. **All three have zero selector blocks.**

**MEASUREMENT.** Selector extraction over `ui.css` for the `gn-board__empty` family returns **no selector blocks at all** — the only two hits in the file are *comments* (`ui.css:835`, `:4980`). `/usr/bin/git log -S'gn-board__empty-create' -- packages/ui/src/ui.css` → a single commit, `b1dda062`, and the extraction shows it added a mention, not a rule. **Contrast measured the same way: the product's per-column sibling *is* styled** — `.gn-board__column-empty` (`ui.css:846`), `-icon` (`:869`), `-copy` (`:885`).

**PROTOTYPE.** `Gisik Nokma - Desktop.dc.html` (sha `3d142d46…`), `:390-396`, draws a **per-column** empty state and styles its button inline with `border:none;padding:0 16px;border-radius:var(--ctlR);background:var(--ctlBg);box-shadow:var(--ctlShadow);color:var(--accent);min-height:44px;font-size:15px;font-weight:600`. Its `:590-591` draws a **per-group** empty ("Nothing here."). **There is no whole-board empty state in the prototype in any arm.**

**CLASSIFICATION.** The per-column state **MATCHES** (product `ui.css:846-885` mirrors it). The whole-board banner is a product **addition** and **DIVERGES WITH NO RULING FOUND** — `grep` of the coordination doc for `crumb`/board-empty rulings and of §16 found no ruling for it; `EMPTY_BOARD_COPY` (`board.tsx:184`) is stated in code with no ruling cited.

**WHY IT IS WRONG.** An addition is not a defect — the banner is arguably better than the prototype's silence. The defect is that the addition was never **styled**, so the first-run surface a person meets on a brand-new project is a sentence in inherited text and a UA button, in a page whose per-column sibling is fully styled and whose prototype draws the equivalent control with explicit resets. Two states answering the same question, one dressed and one not.

**WHAT WOULD HAVE BEEN BETTER.** Style the three classes from the prototype's shared control constant (the same constant `981aa92b` reused for `.ticket-type-list__move` — fill-tertiary + text-accent + control radius, no border), and record the whole-board banner as a deliberate addition in `Features.md` with its rationale, so a later reader does not "correct" it back toward a prototype that has no such state.

---

### P8 — **IMPORTANT** — `Dialog` and `Sheet` both declare `aria-modal="true"`, and nothing in the product implements containment

**WHAT.** Both modal components tell assistive tech that the rest of the document is inert. Neither moves focus into the dialog, traps it, or restores it on close — and no focus trap or `inert` attribute exists anywhere in the product.

**MEASUREMENT.**
- `packages/ui/src/components/dialog.tsx:18-24`: `role="dialog" aria-modal="true"` on the `<section>`. Its only effect is an Escape keydown listener (`:6-13`). No focus call, no `tabIndex`, no trap.
- `packages/ui/src/components/sheet.tsx:102-104`: the same three attributes, same shape; the ticket sheet renders this component.
- **Nothing anywhere implements containment:** `grep -rn "inert\|focus-trap\|focusTrap\|trapFocus"` over `packages apps` (excluding `node_modules`/`dist`/tests) returns **only prose uses of the word "inert"** — zero hits on the HTML attribute or a trap helper. **Positive control in the same command: `Escape` handlers are found in both `dialog.tsx:9` and `sheet.tsx:58`**, so the greps traverse the right tree.
- **No caller supplies it either:** the four `<Dialog>` sites (`transition-dialog.tsx:382`, `bulk-close-dialog.tsx:242`, `new-ticket-dialog.tsx:126`, `reopen-dialog.tsx:64`) were checked for focus management; the only `useRef` among them is `bulk-close-dialog.tsx:161`'s `attemptRef`, a retry counter.

**WHY IT IS WRONG.** `aria-modal="true"` is a stronger claim than `role="dialog"` — it asserts that content outside the dialog is unavailable. A screen-reader user is told the background is gone, then Tab moves focus into it: the dialog's own boundary is described as a wall that is not there. The product already has the good example next door: `InfoTip` documents *"No focus trap and no `role="menu"`"* and explains why each omission is correct **for a non-modal popover** (`info-tip.tsx:43-47`). These two components make the modal claim without the modal work.

**WHAT WOULD HAVE BEEN BETTER.** Either implement containment — move focus to the dialog on open, restrict Tab to it, restore focus to the opener on close — or drop `aria-modal` to `role="dialog"` alone and be honest about it. The second is one attribute and is not a worse product; the current state is the only one that is *wrong*, because it asserts the property rather than merely lacking it.

---

### P9 — **IMPORTANT** — `SegmentedControl` carries full ARIA tab semantics and implements none of the tab keyboard model

**WHAT.** `role="tablist"` + `role="tab"` + `aria-selected`, with no `tabpanel`, no `aria-controls`, no arrow-key handling and no roving `tabindex`.

**MEASUREMENT.** `packages/ui/src/components/segmented-control.tsx:25-40`: the container is `<div role="tablist" aria-label={…}>` and each option is `<button role="tab" type="button" aria-selected={on} …>`. `grep -n "onKeyDown\|Arrow\|tabIndex\|aria-controls\|tabpanel"` on that file → **NONE** (positive control in the same command: `Escape` is found in `dialog.tsx`/`sheet.tsx`). Per WAI-ARIA's tabs pattern a `tablist` requires arrow-key navigation between tabs, a roving tabindex, and the tab↔tabpanel relationship; none is present.

**Blast radius, measured:** seven render sites — `apps/web/src/theme-toggle.tsx:64`, `apps/web/src/style-toggle.tsx:74`, `apps/web/app/inbox/page.tsx:406`, `apps/web/app/sign-in/page.tsx:292`, `packages/app-core/src/help/help-browser.tsx:494`, `packages/app-core/src/views/ticket-sheet.tsx:1915`, plus `components.test.tsx:258`.

**WHY IT IS WRONG.** A person using a screen reader is told "tab, 1 of 3" and will press the arrow keys the pattern promises. Nothing happens. The cost is not cosmetic. And the component's own docblock gives the reason the roles were kept: *"keeping the exact roles the old markup carried — `tablist`, `tab`, `aria-selected` — so the accessible-name ratchet (13.285/13.287) sees no loss."* **A counter was preserved, and the semantics it counts were not implemented** — which is P10's mechanism showing its cost in a second place.

**WHAT WOULD HAVE BEEN BETTER.** If these are view switches, `role="tablist"` is the wrong role: a group of buttons with `aria-pressed` needs no keyboard model beyond Tab. If they really are tabs, they need the keyboard model and a `tabpanel` to point at. Either is small; the current shape takes the semantics and skips the contract.

---

### P11 — **IMPORTANT** — The `Select` panel is outside the population of every rendered-property sweep, for two independent reasons

**WHAT.** `Select` is the product's most-migrated shared control (the members Channel/Role fields, the style and theme toggles, the ticket-type editors). Its option rows have never been measured for tap-target size, label-text floor, accessible-name contribution or non-text contrast — and could not have been.

**MEASUREMENT — reason 1, the panel is never on screen when a sweep runs.** The listbox is portaled to `document.body` and renders only while open (`select.tsx:530`, `<ul {...resolvedListBoxProps}>` inside a `createPortal`). The stack spec's own comment records it: *"the listbox and its options render only while open, portaled to `document.body`, so a closed-page sweep sees none of them"* (`e2e-stack/viewport.spec.ts:696`). **No spec opens a Select before sweeping** — `grep` for a click on the trigger across `e2e-viewport/*.ts` and `e2e-stack/*.spec.ts` returns only that comment, never a call.

**MEASUREMENT — reason 2, even open, the rows match no arm of the tap-target selector.** `tap-targets.ts:268-280` selects `a[href]`, `button`, `input:not([type="hidden"])`, `select`, `textarea`, `summary`, `[role="button"|"link"|"tab"|"checkbox"|"switch"]`, and `[tabindex]:not([tabindex="-1"])`. An option row is `<li {...optionProps} className="gn-select__option">` (`select.tsx:582`) — an `<li>` with `role="option"` from `useOption`, which is the listbox pattern's non-tabbable row. **`[role="option"]` and `[role="listbox"]` occur 0 times in each of the four sweep modules** (`tap-targets.ts`, `type-scale.ts`, `accessible-names.ts`, `helpers/non-text-contrast.ts`).

**WHY IT IS WRONG.** These are the two independent reasons the brief names as this lane's characteristic blind spot: *a sweep that cannot see a class is a sweep that reports zero offenders.* `.gn-select__panel` (`ui.css:2530`), `.gn-select__option` (`:2558`) and `.gn-select__chip` (`:2508`) are fully styled — someone did the work — and **no instrument has ever checked that the work holds**. The four sweeps report confident numbers for every other surface while this one contributes nothing to any denominator.

**WHAT WOULD HAVE BEEN BETTER.** Add `[role="option"]` (and `[role="listbox"]`) to the tap-target selector, and have the stack spec open one Select before at least one sweep so the panel enters the population. Opening the style toggle on `/account` is one click and it is already on a swept route. Until then, say in the sweep's own output which surfaces it cannot reach — a stated blind spot is worth more than a silent zero.

**Not measured:** whether the panel's rows would actually *fail* any floor. I did not open a panel in a browser (no browser ran, §2). **This finding is about coverage, not about a violation.**

---

### P10 — **MINOR** — The accessible-name ratchet's unit is an attribute; its failure message claims a property of assistive tech

**WHAT.** `ariaLabel` counts **elements carrying the attribute**, and the assertion that consumes it tells the reader something stronger.

**MEASUREMENT.**
- `apps/web/e2e-viewport/accessible-names.ts:47-52`: `const count = (attr: string): number => all.filter((el) => el.hasAttribute(attr)).length;` and `ariaLabel: count('aria-label')`. `RATCHETED` (`:118-123`) includes `ariaLabel`.
- The failing assertion's message (`apps/web/e2e-stack/viewport.spec.ts:719-722`) reads: *"…LOST ${attr}: baseline …, now …. **Something that identified an element to assistive tech is gone.**"*
- **A live site where the two differ:** `apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx:3288` wraps an `Avatar` — which sets its own `aria-label` (`components/avatar.tsx:65`) — in `<span aria-hidden="true">`, with a comment explaining that the wrap exists precisely so that `aria-label` does **not** reach assistive tech. The attribute is present in the DOM, counted by the ratchet, and deliberately hidden.

**WHY IT IS WRONG — and how far I am willing to take it.** The file's own docblock is **honest** about this (*"Counts, not names"*), so the instrument is not lying. The **assertion message** is: a count of attributes is reported as a statement about assistive technology. And I checked the tempting stronger version of this finding and **withdrew it**: I hypothesised that `Avatar`'s `aria-label` on a role-less `<span>` names nothing, and the code disproved me — `page.tsx:3279-3286` records a measurement that it *does* contribute, doubling a wrapping checkbox's accessible name to *"Uma One Uma One"*. **So an `aria-label` on this span is exposed; the finding is about the unit, not about `Avatar`.**

**WHAT WOULD HAVE BEEN BETTER.** Keep the count (it is cheap and it does catch a dropped attribute) but say what it measures: *"an `aria-label` attribute left the document; whether it named anything is not what this measured"*. That sentence costs nothing and stops a count being read as a property.

---

### P3 — **MINOR** — The parent crumb cannot show the parent's key; the prototype's does, and no ruling records the difference

**WHAT.** The prototype labels the parent crumb `key + " " + title`; the product labels it `title`.

**MEASUREMENT.** Prototype `Gisik Nokma - Desktop.dc.html` `:3413-3414`: `chain.push({ label: p.id + " " + p.title, go: … })`. Product: `ticket-sheet.tsx:1557` and `:1566` render `{ancestor.title}` alone. The prototype's **epic** crumb is `e.title` (`:3410-3413`, title only) — **which the product matches.** So the divergence is exactly one crumb.
**Why the product cannot match:** `ParentRef` is `{ kind:'ticket'; id; title }` (`packages/app-core/src/view-types.ts:368-371`) — no key field — and the server's visible arm is `{ kind:'ticket', id: parentRow.ticket_id, title: titleOf(parentState) }` (`apps/server/src/routes/tickets.ts:435-436`). The wire carries no key for an ancestor.

**FAILED SEARCH.** `grep -n "crumb" docs/superpowers/plans/2026-08-20-00-series-coordination.md` → **0 matches**. The breadcrumb dispatch (`gisik-nokma-lanes/CTL-DISPATCH-2026-09-20-breadcrumb-hierarchy.md`) quotes the parent's `id + " " + title` syntax in its pseudo-code block and names the epic's conditional and the last crumb's plainness as *"load-bearing"*, but **never rules on the parent's label**. **Category 3: diverges with no ruling found.**

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
- **Failed search:** `grep -rn "type selector" /Users/kiro/my_projects/gisik-nokma-lanes` → **2 hits, both inside the dispatch itself.** Zero in any `EXEC-*` report, PR body, or handoff. `Features.md:413` describes the form in detail and does **not** record the selector as absent.

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

**WHY IT IS WRONG.** A shipping surface (Tauri) whose content region was never styled, sitting inside a documented, deliberate, unstyled shell — so the shell's recorded rationale makes the content's omission read as the same decision.

**WHAT WOULD HAVE BEEN BETTER.** Extend the `ui.css` note that already reasons about `apps/desktop` to name what it *does* style there, and either style `.ticket-list*` or record it as a named absence with an owner — as `Features.md:2169` does for mobile's missing push transport.

---

## 5. MATCHES, AND RULED DIVERGENCES I CHECKED (listed so this is not a list of defects)

| comparison | class | evidence |
|---|---|---|
| **The breadcrumb is the ancestor chain, no state crumb** | **MATCHES the owner's later ruling and the prototype** | Owner verbatim (dispatch §1): *"workspace -> project -> grandparent -> parent (or however many layers here) -> ticket (should show the ticket key)"*. Prototype `:3404-3425`. Shipped `ticket-sheet.tsx:1757-1800`. **I initially suspected the `ui.css:655-658` docblock ("The owner's ruling of 2026-09-20 replaced the state crumb…") of being a fabricated ruling. Measurement refuted me: the ruling exists and is quoted. Recorded because the suspicion was reasonable and the refutation is the point.** |
| **Tap-target split 24 (in-list) / 44 (standalone)** | **RULED** | Owner 2026-09-20: *"let the checker accept 24 for in-list controls, keep 44 for standalone buttons."* All four `DENSE_IN_LIST` entries name a `declaredAt` rule and **all four rules exist in `ui.css`** (checked individually). I3 is the one defect in this table's execution. |
| **`.app-shell` unstyled on desktop** | **RECORDED, with a rationale** | `ui.css:3912-3919`. Not a finding; P7 is about what that record does not cover. |
| **`editor-slot__submit` unstyled** | **RECORDED as pre-existing** | `ui.css:5861-5870` points at `apps/web/e2e-viewport/type-scale.ts:355-357`. **I still list it in P1** — a recorded *reason* ("UNSTYLED, and that is PRE-EXISTING") is a record of a shortcut, not a ruling that it should stay that way. The controller can rule it either way; the difference is one line. |
| **Non-text-contrast roster at `belowCount: 1`** | **STALE RECORD** | I2. |
| **Prototype's per-column empty state** | **MATCHES** | `ui.css:846-885`. |
| **`Toast`'s accessibility** | **GOOD** — listed so this is not a defect-only list | `role="status"` (`toast.tsx:139`), decorative dot `aria-hidden`, timer pausing on **both** `mouseenter` and `focus`, and the docblock reasons about how *"every way of closing this toast puts the pointer or the focus INSIDE it"* (`:103-106`). |
| **`InfoTip`'s accessibility** | **GOOD** | `info-tip.tsx:43-47` states *"No focus trap and no `role="menu"`"* and justifies each omission **for a non-modal popover** — the correct use of the same reasoning `Dialog`/`Sheet` misapply (P8). Its Escape-closes-without-moving-focus decision at `:39-42` is argued from the control's own behaviour, not asserted. |
| **`Switch`'s role choice** | **RULED/recorded** — not a defect | `switch.tsx:41-53` uses a real `<input type="checkbox">` rather than `role="switch"` and **states the trade**: *"to assistive technology this is a checkbox, not a `switch`. That is the pre-existing position on `/account`… what it does change is that there is now one place to change it in."* A limitation named and located is not the same as one hidden. |
| **`Avatar`'s tint palette** | **GOOD** | `avatar.tsx:25-41` derives its four tints from pairs `CONTRAST_PAIRS` already measures, so *"this palette cannot drift out of contrast without `tokens.test.ts` going red"* — the one place I saw a visual choice welded to an existing gate rather than asserted beside it. |

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

**IMPORTANT — 7**
- `I2` the `e2e-stack` contrast roster records a defect fixed eight hours later, with no provenance
- `I3` `DENSE_IN_LIST`'s stated reason for excluding `.gn-my-work__title` is falsified by its own docblock
- `P1` six interactive controls styled by no rule at all (raw UA chrome)
- `P2` the board's whole-board empty state has no prototype counterpart and no styling
- `P8` `Dialog` and `Sheet` declare `aria-modal="true"`; nothing implements containment
- `P9` `SegmentedControl` carries ARIA tab semantics with none of the tab keyboard model, in 7 places
- `P11` the `Select` panel is outside every sweep's population, for two independent reasons

**MINOR — 8**
- `I4` `tap-targets.ts` cites `ui.css:1606-1616` for a sentence that is at `:1662`
- `I5` my own handoff carries two contradicting position blocks; the pointer that found it is itself stale
- `P3` the parent crumb cannot show the parent's key; the prototype's does; no ruling found
- `P4` "the SAME plain span" is false of the restricted arm (code docblock + `Features.md:77`)
- `P5` an owner-requested type selector was neither built nor reported
- `P6` mobile: two of three screens have no styling while the third is themed
- `P7` desktop's task list has no rules
- `P10` the accessible-name ratchet's unit is an attribute; its message claims a property of assistive tech

**Total 16.** `raised` and `sum by severity` agree by enumeration above. ⚠ **One id carries two severities on purpose and is counted once:** `P5` is **MINOR as a product** finding (the form works and the owner's `or` clause is arguably satisfied) and **IMPORTANT as a record** finding (an owner instruction is neither satisfied nor recorded, and the override said to stop and report). **It is counted under MINOR**, so the sum stays honest rather than double-counting one finding to inflate the Important row.

---

## 9. THE CLAIM I AM LEAST SURE OF

**P1.** Its *measurement* is solid and reproducible (the extractor has a positive control and the `ticket-type-list__move` precedent proves the extractor sees a rule when one exists). What I have not done is **look at any of the six controls on a screen**. The precedent's own evidence was a Chromium reading of computed `borderStyle: outset`; mine is the absence of a selector block. If a React Flow or editor stylesheet I did not enumerate reaches them, P1 collapses to zero sites. **The three stylesheets are the entire product's CSS as measured by `find . -name '*.css'` excluding `node_modules`/`.next`/`dist` — if a fourth exists under a path I excluded, this is where it would hide.**

**Second:** I3's *consequence* (a slackened baseline) is an inference from `8e742d18`'s arithmetic, not a measurement. The two controls it moves are named; the number they leave behind is not measured. Marked unverified in place.

---

## 10. A METHOD NOTE THE REPORT OWES THE NEXT READER

Two of my own instruments disagreed while I was writing this: a selector extractor reported **0** rules for all four `DENSE_IN_LIST` `declaredAt` classes, while a plain `grep` found three of them. **The extractor was wrong** — I had built the match pattern with the leading dot in both the needle and the pattern, so it searched for `..gn-attention__title`. **Opening the lines settled it**: `.gn-attention__title {` at `ui.css:1667`, `.gn-help__group-toggle {` at `:4311`, `.gn-help__nav-link {` at `:4418`, `.gn-help__pager-link {` at `:4584` — all four exist, and §5's row stands.

**The lesson is the one this repository keeps re-learning and it is worth one line here:** two instruments disagreeing is the *signal*, not a nuisance — and the only resolution is to open the artefact. Had I trusted the extractor I would have reported that every `DENSE_IN_LIST` entry is stale, which would have been a confident, well-formatted, entirely false Critical. Had I trusted the grep alone I would have missed that my extractor was broken for a whole class of input. **The extractor's own positive control (`.gn-board-card__move` → 4) passed the entire time** — a control that proves the instrument works on *one* path does not prove it on the path you are about to report from.
