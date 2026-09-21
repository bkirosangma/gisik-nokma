# Refutations — executor 1 (UI), round 2 phase 2

**Opened:** 2026-09-21 15:05:44 IST, on the Claude API (Opus) — the lane was relaunched at the phase-1 boundary; the report `docs/lanes/review-ui-exec1.md` is the phase-1 submission at `2cfffc7a` plus `P35` (committed after the freeze at `a07a7fc2`, labelled phase-2 / half points in its heading and in §8). **Branch:** `exec1/review-ui-r2`. **Phase 2 closes 17:05:23 IST.**

**Rule I hold myself to (rules §3):** a refutation names the target id and the FALSIFYING MEASUREMENT — a line I opened or a reproduction I ran. A rejected refutation costs me the target's points, so a finding I checked and found holding is recorded here as a check, not filed as a refutation.

**Instrument.** Source at `a07a7fc2`, whose product code is byte-identical to the tree the Opus lanes painted: `git diff --stat a7b6292b HEAD -- apps packages` → **0 lines**. Prototype: the staged export `/Users/kiro/my_projects/gisik-nokma-lanes/prototype-2026-09-20/Gisik Nokma - Desktop.dc.html`, sha256 re-measured at opening → `3d142d464a070b33…`. No browser paint of my own in phase 2 (the `:3041` listener, pid 99771, is exec 4's `next dev` with `cwd /Users/kiro/my_projects/gisik-nokma-exec4/apps/web` — measured with `lsof`, not used).

## Branch heads read

| lane | branch | head at first read (15:06) | head at last read |
|---|---|---|---|
| exec 2 (UX, r2) | `exec2/review-ux-r2` | `778a6439` | `f282f3e1` |
| exec 3 (functionality, r2) | `exec3/review-functionality-r2` | `f8b5e929` | `fd5a4e68` |
| exec 4 (UI, Opus — my opponent) | `exec4/review-ui` | `ccd60196` | `674decb2` |
| exec 5 (UX, Opus) | `exec5/review-ux` | `1641161d` | `d4329120` |
| exec 6 (functionality, Opus) | `exec6/review-functionality` | `737294ae` | `213a25ad` |

## 0. Refutations filed

**None at 15:18 IST.** Every finding of exec 4's that I could reach at source held — the table in §1 names the line I opened for each. Two of them (`E4-1`, `E4-30`) are about code I wrote, and both are right; §3 says so plainly. This section is revisited against each lane's later pushes until 17:05.

## 1. Exec 4's findings, checked at source — the line I opened, and the verdict

The opponent's report is painted (`:3041`); I cannot re-paint, so each check below is the SOURCE half of the finding — whether the cited line says what the finding says it says. A painted number I could not reproduce is marked *paint not re-measured* and is not disputed on that ground.

| target | what I opened | verdict |
|---|---|---|
| `E4-1` (doubled crumb when the parent is the epic) | `apps/server/src/routes/tickets.ts:617-665`: `let cursor = state.parentId;` and the walk returns `{kind:'ticket', id: cursor}` on the first epic-typed row — so `epic.id === parent.id` whenever the parent is the epic. `ticket-sheet.tsx:1534` `const epicCrumb = ticketRead.epic;`, `:1772` `epicCrumb === null ? null : …`, `:1785` `parent === null ? null : …` — two null-checks, no identity check. | **holds** — and my own report's §5 already records it as a correction of a MATCH row I wrote in round 1 |
| `E4-2` (close glyph has no size rule) | `ui.css:719-728`: `.gn-dialog__close, .gn-sheet__close { font; font-size: 1.2rem; line-height: 1; border: none; background: none; color; cursor }` — no `min-height`/`min-width`/`padding`. `grep -n 'gn-sheet__close' ui.css` → the rule and two unrelated `closed-*` classes; no `[data-style]` override. | **holds** (paint 24×21 not re-measured) |
| `E4-3` (board card `who · when` button, 21 px, undeclared) | `ui.css:990-998`: no size property. `board.tsx:1053-1060`: a `<button className="gn-board-card__provenance" aria-expanded …>` with its own `onClick`. `grep -n provenance apps/web/e2e-viewport/tap-targets.ts` → **0**. `DENSE_IN_LIST` (`:140-184`) holds four entries: `.gn-attention__title`, `.gn-help__nav-link`, `.gn-help__group-toggle`, `.gn-help__pager-link`. | **holds** |
| `E4-4` (two nameless `textbox`es; `<dt>description</dt>`) | `ticket-sheet.tsx:2405` is literally `<dt>description</dt>`. The nameless editor is my `P21`, filed concurrently; exec 4 adds the comment composer and the `<dt>`. | **holds** |
| `E4-5` (`<h1>` whose only child is `aria-label="Rename …"`) | `apps/web/app/w/[workspaceId]/page.tsx:742-762` — the docblock says the accessible name *"still carries the WORKSPACE (`Rename {name}`)"*; name-from-content of the `h1` takes the descendant's `aria-label`, which is what exec 4's verbose a11y snapshot shows. | **holds** |
| `E4-6` / `E4-18` (ULID in the visibility picker; blank Assignee option) | `visibility-editor.tsx:404-411` `{actorLabel(member.id, member.name)}`; `ticket-sheet.tsx:1672` `label: member.name` verbatim. | **holds** (both) |
| `E4-8` (editor toolbar outlines; argument against the recorded reason) | `apps/web/app/layout.tsx:3-4` imports `ui.css` then `editor.css`, so a `var(--gn-…)` in `editor.css` WOULD resolve in the web host. **One number differs and it is not load-bearing:** `grep -c 'var(--gn-fill-tertiary)' ui.css` → **22** and `var(--gn-shadow-raised)` → **14** at this tree (the finding says 14 and 19); `grep -c` counts lines, and the counts sit in the BETTER section. | **holds as a category-2 argument; the judge weighs it** |
| `E4-9` (two `<main>`s; 415-px builder at 390) | `workflow-builder-screen.tsx:131` `<main className="workflow-builder-screen__canvas">`; the outer `<main className="gn-shell">` is at **`apps/web/app/w/[workspaceId]/settings/workflows/[workflowId]/page.tsx:57`** — the finding attributes it to `apps/web/app/layout.tsx`, which contains no `<main` (`grep -n '<main' apps/web/app/layout.tsx` → 0). The count of two is the finding; the attribution is a slip in the mechanism sentence. | **holds** (attribution note only; not a refutation) |
| `E4-10` (four class-less gallery buttons) | `template-gallery.tsx:13-19`, `:23-25`: `<button type="button" aria-label=… onClick=…>` and `<button type="button" onClick=…>` — no `className`. Outside `P1`'s population by construction (P1 keyed on `className` literals). | **holds** |
| `E4-11` (310-px nav at 390) | `globals.css:1801` `.gn-nav__links { display: flex; flex-wrap: wrap; … }`; the docblock `:1765-1777` records *"measured at 190px … three rows"* and *"a media query would only trade one wrong value for another"* — a reason, not a ruling. My own grep for a ruling (`hamburger|nav…wrap|collapse…nav|bottom tab|tab bar` over `docs`, `Features.md`, `test-cases`) → the pre-launch checklist's 10-px-overflow fix (`:205-210`) and the HIG audit's `apps/mobile` rows only. | **holds as category 3** (paint not re-measured) |
| `E4-12` (signed-in tap population = one route; text contrast = zero) | `grep -n 'measureTapTargets(' apps/web/e2e-stack/*.spec.ts` → **one**, `viewport.spec.ts:170`; `tap-target-baseline.json` → one key `stack-phone-390\|/my-work`; `measureContrast` is `async function` (unexported) at `e2e-viewport/responsive.spec.ts:456`; `grep -i contrast e2e-stack/` minus non-text → two comments. Sibling of my `P34`. | **holds** |
| `E4-13` (bare `<input>` as the New-ticket Title) | `new-ticket-dialog.tsx:127-130`: `<label className="gn-new-ticket__field">Title<input value=… onChange=… /></label>` — no class on the input; no descendant `input` rule under `gn-new-ticket` or `gn-dialog` in the three stylesheets (enumerated every selector ending in a bare `input`: `.gn-list__column-option input[type='checkbox']`, `.gn-list__select input[type='checkbox']`, `.gn-select__trigger--searchable input(:focus)` only). | **holds** |
| `E4-14` (8×13 chip remove) | `ui.css:4981-4990`: `border: none; background: none; padding: 0; margin: 0; font: inherit; line-height: 1; color; cursor` — no size. | **holds** (paint not re-measured) |
| `E4-15` (timeline nav keeps the UA bevel) | `ui.css:3427-3434` — no `border`; `timeline-view.tsx:234-262` three `<button type="button" className="gn-timeline__nav">`. **This is my `P35`'s control** — see §3. | **holds** |
| `E4-17` (Select strands focus on `<body>`) | `select.tsx`: `useOverlay({ isOpen, onClose: state.close, shouldCloseOnBlur: true, isDismissable })` at `:187-188`; `grep -n 'focus(\|FocusScope\|restoreFocus' select.tsx` → **0** — nothing returns focus to the trigger. | **holds** (the key-driven paint is theirs) |
| `E4-19` (history headline is the raw slug) | `history-list.tsx:45` `<span className="gn-history__type">{event.type}</span>`. | **holds** |
| `E4-21` (searchable Select: outline suppressed, nothing replaces it) | same rule my `P23` cites, `ui.css:2474`; independent concurrent duplicates. | **holds** |
| `E4-23` (404 ticket paints `Loading…` for ever) | `ticket-sheet.tsx:618-631`: `read.error !== null` → refusal; **`read.data === null` → `Loading…`**; `http.ts:92-97` 404-as-`null` on GET; `online-data-source.ts:271-274`. | **holds** |
| `E4-30` (link crumbs painted in the non-link ink; the docblock's prototype claim is false) | Export `:86` `a{color:var(--accent);text-decoration:none;…}` — a global rule; `:1104` the crumb `<a … style="font-size:13px;line-height:18px">` sets no colour; `grep` for any other `a` rule (`nav a`, `.x a`, `a:link`) in the export → **only `:86`**. And the export's data model (`:3403-3425`) makes the workspace and project crumbs links too (`go` set), so its crumb bar is accent links with a plain, bold current crumb. **The docblock at `ui.css:668-671` is mine and its premise is false.** | **holds** — see §3 |
| `E4-31` (ghost on sunken 3.99:1) | arithmetic re-done from the finding's own colours with the WCAG 2.x formula: `rgba(39,58,99,0.11)` over `rgb(228,216,204)` → `rgb(207,199,192)`, luminance 0.579; text `rgb(50,93,151)` luminance 0.107; ratio **3.996** (the finding writes 3.99 — rounding of the unrounded composite); dark `rgb(139,177,230)` on `rgb(65,73,109)` → **3.97** by my arithmetic against their 4.00. Both under 4.5 either way. The composite colours themselves are their paint. | **holds** (arithmetic reproduces to the second decimal) |
| `E4-32` (`warning` on `surfaceSunken`) | `ui.css:2274` `background: var(--gn-surface-sunken)`, `:2279` `color: var(--gn-warning)`; `grep -n "fg: 'warning'" tokens.ts` → **0**. Arithmetic from their colours: `rgb(178,80,0)` on `rgb(228,216,204)` → **3.71**. | **holds** |
| `E4-33` (`Workspaces — `, `Account menu for `) | `workspaces/page.tsx:51` `` Workspaces{user !== null ? ` — ${user.name}` : ''} ``; `account-menu.tsx:142` `` aria-label={`Account menu for ${user.name}`} ``; `avatar.tsx:17-19` returns `'?'` for an empty name. | **holds** |
| `E4-34` (`Edit <type>` for a guest) | `ticket-type-list-screen.tsx:386-391` `` aria-label={`Edit ${type.name}`} `` with no `canAuthor` branch. | **holds** |
| `E4-35` (`.gn-segmented__item` has no horizontal padding) | `ui.css:4648-4662` — `flex: 1; display: inline-flex; … min-height: 2.75rem; …` and no `padding`/`min-width`. | **holds** (the 31-px paint is theirs) |
| `E4-36` (results count is a plain `<p>`; no-match is `role="status"`) | `help-browser.tsx:207` `<p className="gn-help__results-count">`; `:672` `<p className="gn-help__none" role="status">`. | **holds** |

**Not opened** (no time in the phase for a source check, and no reason to doubt them): `E4-7`, `E4-16`, `E4-20`, `E4-22`, `E4-24`, `E4-25`, `E4-26`, `E4-27`, `E4-28`, `E4-29`. **Twenty-six of thirty-six checked; twenty-six hold.** Where a check found a slip, it is in a mechanism or count sentence, never in the measured claim, and I do not file a refutation on a slip — rules §3 prices a rejected refutation at the target's points, and a judge who opens the line will find the finding standing.

## 2. Findings of other lanes on surfaces I built — checked because I know what they were meant to do

| target | what I opened | verdict |
|---|---|---|
| `E5-9` (exec 5 — a refused Delete answers in the slot under the tab bar, not beside the footer) | `ticket-sheet.tsx:1202-1206` `deleteTicket = () => submitTicketEvent('ticket.deleted', …)`; the refusal path sets `serverRefusal` (`:743`, `:781`, `:836`) and the ONLY render of it is `:1961-1965`, above the tabs; the footer `:2612-2621` has no slot of its own. | **holds** — the delete footer is my change and it has no local refusal slot |
| `E5-22` (exec 5 — "Add subtask" never names the type it will file) | `ticket-sheet.tsx:118-131` `subtaskTypeFor`: `task` whenever legal, else the shallowest legal type; `subtaskType.name` is not rendered in the form. | **holds** |
| `E5-3` (exec 5 — the doubled crumb) | same lines as `E4-1`. | **holds** |

## 3. Notes that are not refutations

- **`E4-15` and my `P35` are the same control.** `E4-15` was pushed in phase 1, painted (`border: 2px outset`); `P35` was written in my previous session (DeepSeek backend) before the freeze and committed after it at half points. The judge decides whether P35 is an independent duplicate; what P35 adds is the sweep-blindness mechanism (a missing PROPERTY inside an existing rule is invisible to a "has a rule" sweep) and the five-property export comparison. If the judge scores it as a copy, the ledger's 0 is correct and I do not contest it.
- **`E4-30` corrects a docblock I wrote** (`ui.css:668-671`, *"which is also what the prototype does: its `<a>` sits in a nav declaring `color:var(--label2)` and sets no colour of its own"*). Measured at the export: the `<a>` sets no colour of its own **and is painted by the global `a{color:var(--accent)}` at `:86`**, so the sentence's conclusion is false. The docblock cited `:1101`/`:1103` — the `<nav>` and the wrapper — and never opened `:86`. That is the *"prose is the untested artifact"* shape, in my own prose.
- **`E4-1` is the finding I said would be the most valuable one about my own change**, and the opposing lane filed it. My report's §5 records the correction and does not claim the finding.
- **`E4-9`'s outer-`main` attribution** (`layout.tsx`) is inaccurate — the outer `<main className="gn-shell">` is the route page's own (`…/workflows/[workflowId]/page.tsx:57`), as it is on every route (`settings/page.tsx:170`, `inbox/page.tsx:385`, …). The painted count of two is what the finding rests on and it is right.
- **Exec 4's note on my `P2`'s WHY sentence** (*"a sentence in inherited text and a UA button"* describes `gn-board__empty-create`, which `apps/web` never renders because `onCreateTicket` is never passed — `board.tsx:493`, `grep -rn onCreateTicket apps/web/app apps/web/src` → 0) is **correct**, and a dated Defence under `P2` in my report now says so: P2's WHAT (three classes, zero selector blocks) stands; its first-run consequence in `apps/web` is the sentence alone, and the UA button is the consequence for any host that passes the callback.

## Log

- 15:05:44 IST — `git status`: `P35` uncommitted from the previous session; verified its cited lines (`ui.css:3427-3434` no `border`; `globals.css:84` font-only; `timeline-view.tsx:234-262` three buttons), labelled it phase-2 / half points, added its §8 row, membership check `1/18/20 = 39`, pushed as `a07a7fc2`.
- 15:06 — read `origin/exec4/review-ui:docs/lanes/review-refutations-exec4.md` (`ccd60196`): no refutation of mine; painted corroborations of `P18`, `P19`, `P24`; a note on `P2`'s WHY sentence.
- 15:07–15:19 — exec 4's report read in full; the §1 checks above.
- 15:15 — heads re-read; exec 4 at `674decb2` adds a painted corroboration of `P22`. No lane has filed a refutation of an exec-1 finding as of this line.
