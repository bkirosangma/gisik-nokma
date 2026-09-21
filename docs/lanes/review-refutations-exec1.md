# Refutations — executor 1 (UI), round 2 phase 2

**Opened:** 2026-09-21 15:05:44 IST, on the Claude API (Opus) — the lane was relaunched at the phase-1 boundary; the report `docs/lanes/review-ui-exec1.md` is the phase-1 submission at `2cfffc7a` plus `P35` (committed after the freeze at `a07a7fc2`, labelled phase-2 / half points in its heading and in §8). **Branch:** `exec1/review-ui-r2`. **Phase 2 closes 17:05:23 IST.**

**Rule I hold myself to (rules §3):** a refutation names the target id and the FALSIFYING MEASUREMENT — a line I opened or a reproduction I ran. A rejected refutation costs me the target's points, so a finding I checked and found holding is recorded here as a check, not filed as a refutation.

**Instrument.** Source at `a07a7fc2`, whose product code is byte-identical to the tree the Opus lanes painted: `git diff --stat a7b6292b HEAD -- apps packages` → **0 lines**. Prototype: the staged export `/Users/kiro/my_projects/gisik-nokma-lanes/prototype-2026-09-20/Gisik Nokma - Desktop.dc.html`, sha256 re-measured at opening → `3d142d464a070b33…`. **Paint, from 15:23 IST:** the `:3041` listener (pid 99771) is exec 4's `next dev` with `cwd /Users/kiro/my_projects/gisik-nokma-exec4/apps/web` (measured with `lsof`); its product code is the byte-identical tree above, so I drove it from a fresh isolated context in the Chrome DevTools MCP — signed out for `/privacy`, then signed in by the door exec 4 records (`:3001`'s magic-link form as `kiro@e2e.gisik-nokma.local`, the Mailpit link, the host-scoped `localhost` cookie). Nothing was written except the session row sign-in makes; the persisted project-view preference was returned to *Board* after the Timeline/List/Calendar reads.

## Branch heads read

| lane | branch | head at first read (15:06) | head at last read |
|---|---|---|---|
| exec 2 (UX, r2) | `exec2/review-ux-r2` | `778a6439` | `f282f3e1` |
| exec 3 (functionality, r2) | `exec3/review-functionality-r2` | `f8b5e929` | `fd5a4e68` |
| exec 4 (UI, Opus — my opponent) | `exec4/review-ui` | `ccd60196` | `674decb2` |
| exec 5 (UX, Opus) | `exec5/review-ux` | `1641161d` | `d4329120` |
| exec 6 (functionality, Opus) | `exec6/review-functionality` | `737294ae` | `213a25ad` |

## 0. Refutations filed

**None at 15:33 IST.** Every finding of exec 4's that I could reach at source held, and every painted number of theirs I re-painted reproduced, `E4-7`'s to the decimal (§1a) — the table in §1 names the line I opened for each. Two of them (`E4-1`, `E4-30`) are about code I wrote, and both are right; §3 says so plainly. This section is revisited against each lane's later pushes until 17:05.

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

### 1a. Exec 4's painted numbers, RE-PAINTED by me (15:23–15:32 IST, 1200 px, light, same tree)

| target | their number | my paint | verdict |
|---|---|---|---|
| `E4-1` | two link crumbs *Open questions* on `CCSO-6` | `nav[aria-label="Ticket location"] .gn-ticket-sheet__crumb` → `SPAN Convenience Corner · SPAN Shop operations · BUTTON Open questions (sheet-crumb-epic) · BUTTON Open questions (sheet-crumb-parent) · SPAN CCSO-6` | **reproduces** |
| `E4-2` | close 24×21 | `button.gn-sheet__close` **23.6×21.2** | **reproduces** |
| `E4-3` | 24 × 66×21, `inline-block` | 24 cards, 24 `button.gn-board-card__provenance`, every one **66.2×21.3**, `display: inline-block` | **reproduces** |
| `E4-4` | two nameless `textbox`es | `[contenteditable=true]` × 2, both `role=textbox`, `aria-label` null, `aria-labelledby` null | **reproduces** |
| `E4-5` | `h1` → one `button` child, `aria-label="Rename Convenience Corner"`, 316×41 | `h1.gn-page-title` has **1** child node, `button.gn-workspace-home__rename-trigger` `aria-label="Rename Convenience Corner"`, **316.5×41** | **reproduces** |
| `E4-9` | two `<main>` | `document.querySelectorAll('main').length` → **2** on the builder; `input.workflow-builder-screen__name` **403** px wide at 1200 (its intrinsic width — the 415 layout viewport at 390 was not re-emulated) | **reproduces** (the 390 half not re-painted) |
| `E4-14` | 8×13 | `button.gn-project__filter-chip-remove` **8.1×13**, `padding 0`, `font-size 13px`, `line-height 13px`, `aria-label="Remove filter — Closed: hidden"` | **reproduces** |
| `E4-15` | `2px outset`, three buttons | `button.gn-timeline__nav` × 3: **81.9×33.6 / 66.7×33.6 / 73.7×33.6**, each `border: 2px outset rgb(0,0,0)`, `background rgb(241,234,227)`; `button.gn-timeline__bar` → `0px none` | **reproduces** (and is my `P35`) |
| `E4-24` | board `H1` → `H3` | headings on the board: `H1 Shop operations · H3 Simple kanban · H3 Errand with waits`; on the List view `H1 · H3 Recently assigned · H3 Open questions … · H3 No epic … · H3 Registrations …` | **reproduces** |
| `E4-25` | 232×39 | `nav.gn-settings__sidebar a` × 3, each **232×39.2**, `padding 8px 11.2px`, `display block` | **reproduces** |
| `E4-27` | *Publish* 84×36 with a 1-px border and 6-px radius | `button.publish-controls__publish` **83.7×36.4**, `border: 1px solid rgb(51,98,159)`, `radius 6px` | **reproduces** |
| `E4-28` | calendar: no roles, day cells are `div`s, dates in `title` | `.gn-calendar [role]` → **0**; first `.gn-calendar__day` is a `DIV` with text `31` and no `aria-label`; an item `<button>` carries `title="starts 18 Aug — Kiro's claim · needed by 5 Oct — Kiro's claim"` and no `aria-label` | **reproduces** |
| `E4-35` | *All* 31 wide | `/inbox` tabs: **All 30.6×44**, Unread 63.7×44, Mentions 77.5×44, each `padding: 1px 6px`; tablist `aria-label="Filter notifications"` | **reproduces** |
| `E4-7` | at 390: `grid-template-columns: 128px 224.094px`, editor 224×3195, `dd` `x 178.6 → 402.7` past a sheet ending at 390, title 162×28, *Full screen* 114×44, close 24×21, five crumbs one per line | `emulate 390x844x2,mobile,touch`, sheet open on `CCSO-6` (15:35 IST): `innerWidth` 390, sheet `l 23.4 → r 390` (366.6 wide), field `grid-template-columns: 128px 224.094px`, `dd` **`l 178.6 → r 402.7`** (224.1 wide, 3411 tall), editor **224.1×3195.5**, toolbar `r 402.7`, title **162×28**, full **113.8×44**, close **23.6×21.2**, crumb tops `14 / 38 / 62 / 86 / 110` (five lines); `.gn-sheet__body.scrollWidth` 379 against a 366.6 box | **reproduces to the decimal** |
| `E4-11` | `.gn-nav` 390×310 at 390 | same emulation: `.gn-nav` **390×309.6** | **reproduces** |
| `E4-10` | four class-less gallery buttons | not re-painted: `/settings/workflows/new` not visited; source holds (§1) | — |
| §4 row *calendar nav 31×36* | 31×36, border none | `.gn-calendar__nav` × 2: **30.8×36**, `border: 0px none` | reproduces |

**Not opened at source or paint** (no reason to doubt them; time went to the paints above): `E4-16`, `E4-20`, `E4-22`, `E4-26`, `E4-29`. **Thirty-two of thirty-six checked at source or at paint; thirty-two hold.** (`E4-7` and `E4-11` were not opened at source; their painted numbers reproduce.) Where a check found a slip, it is in a mechanism or count sentence, never in the measured claim, and I do not file a refutation on a slip — rules §3 prices a rejected refutation at the target's points, and a judge who opens the line will find the finding standing.

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

## 4. Where this lane would DEFEND — the expected attack on each exposed finding, answered in advance

Defence paragraphs are dated and sit under the finding in `review-ui-exec1.md`; this is the index.

| finding | the sentence a refuter would quote | the answer, and where it is |
|---|---|---|
| `I1` (Critical) | *"no browser-based UI instrument has executed ANYWHERE"* — but I ran one by hand and exec 4 painted 33 findings | the claim is about the instruments and any gate; both hand runs are the finding's consequence. Narrowed under I1 (15:22) to *no AUTOMATED browser instrument since 2026-09-06*, and re-measured a fourth time at `09:51Z`: fourteen jobs `steps: 0`, `e2e`/`viewport` skipped, last success `34023679658` |
| `P1` (Important) | *"six static measurements, zero painted"*; *"a fourth stylesheet would collapse it"*; *"the `<a>` members are styled by a global rule like the withdrawn seventh"* | three of six now painted by me (`2px outset rgb(0,0,0)`, `rgb(239,239,239)`) with a styled control beside them as the instrument's control; the fourth stylesheet exists (React Flow, `workflow-canvas.tsx:10`), was enumerated (108 blocks) and reaches none; `globals.css:39` is colour-only where `.gn-nav a` was a designed rule — all three under P1 |
| `P2` (Important) | *"the UA button in the WHY is never rendered"* | conceded and narrowed under P2: the WHAT (three classes, zero blocks) is unchanged; the web host's consequence is the sentence alone |
| `P24` (Important) | *"computed, not painted"* | exec 4 painted 3.84:1 in `hig`/`minimal`, attributed under P24 |
| `P31` (Important) | *"bullet 3 names a tree reading with no instrument"* | both bars painted by me on four routes (`/privacy`, `/settings`, `/w/<id>`, `/settings/workflows`), under P31 |
| `P9` (Important) | *"the keyboard claim is a grep"* | painted by me with real CDP key events: every tab `tabIndex` 0, `ArrowRight` moves nothing, `Tab` lands on the next tab; the seven-site count re-run and equal — under P9 |
| `P18`, `P19`, `P21`, `P22`, `P8`, `P12`, `P13`, `P34`, `P35` | *"not painted"* | now painted — by exec 4 (P18, P22) or by me (P19, P21, P8, P12, P13, P34, P35), each dated under the finding |
| `P11` (Important) | *"the rows match no arm of the tap-target selector"* — but the focused option has `tabindex="0"` | conceded and narrowed by me under P11 before anyone filed it: one row per open listbox matches the `[tabindex]` arm (React Aria's roving tabindex); the population claim rests on reason 1 (portaled, open-only, never opened by a spec), which is intact and painted |
| `P16` (Important) | *"the scanner is as the case describes"* | the finding reproduces the scanner and runs it on a rule that sets the forbidden declaration; the case stays green — the measurement is in the finding, not asserted |
| `P34` (Important) | *"the views are reachable, so the ratchet covers them"* | the ratchet visits ROUTES and the views are TABS; `measureTapTargets` has one call on `/my-work` (re-opened this phase, `viewport.spec.ts:170`), and exec 4's `E4-12` measures the same population |
| `P35`, `P36` (Minor, half) | *"duplicates of `E4-15` / `E4-24`"* | P35 overlaps `E4-15` and says so (§3); P36 is a different defect from `E4-24` (a REPEATED level, not a skipped one), painted on two routes with a control route |

## Log

- 15:05:44 IST — `git status`: `P35` uncommitted from the previous session; verified its cited lines (`ui.css:3427-3434` no `border`; `globals.css:84` font-only; `timeline-view.tsx:234-262` three buttons), labelled it phase-2 / half points, added its §8 row, membership check `1/18/20 = 39`, pushed as `a07a7fc2`.
- 15:06 — read `origin/exec4/review-ui:docs/lanes/review-refutations-exec4.md` (`ccd60196`): no refutation of mine; painted corroborations of `P18`, `P19`, `P24`; a note on `P2`'s WHY sentence.
- 15:07–15:19 — exec 4's report read in full; the §1 checks above.
- 15:15 — heads re-read; exec 4 at `674decb2` adds a painted corroboration of `P22`. No lane has filed a refutation of an exec-1 finding as of this line.
- 15:22 — I1 narrowed and re-measured; P1's fourth-stylesheet condition closed.
- 15:23–15:32 — `:3041` driven by me: `/privacy` signed out (P31's legal pair, P12, P13), then signed in (P1 ×3, P35, P21, P19, P8; §1a's re-paints of exec 4; P36 found and filed at half points).
- 15:33 — heads re-read (`exec4` `872758a3`: two mechanism slips I noted corrected in its report, dated; `exec6` `2ee7cc03`: `R6-3 → E2-28`; `exec2` `d370d830`; `exec3` `c5524156`; `exec5` `858d824c`). No lane has filed a refutation of an exec-1 finding as of this line.
- 15:35 — `E4-7` and `E4-11` re-painted at 390×844 (mobile emulation); both reproduce. Emulation reset.
- 15:39 — P9 painted with real key events (holds); P34 corroborated at paint; P1's third defence paragraph restated in the finding's unit (two controls of six, four not reached); P26's queue rows 1–5 and I2's two commits re-opened, as filed. Heads: `exec4` `872758a3`, `exec2` `d370d830`, `exec3` `c5524156`, `exec5` `858d824c`, `exec6` `2ee7cc03` — no refutation of an exec-1 finding.
- 15:45 — paints continued (P17, P20, P23, P8's Dialog half, P32's ten arrows, P3); **P11's reason 2 found overstated by one row by my own paint and narrowed under the finding**. Heads: `exec2` `9fdfa40f`, `exec3` `18c8ce2d`, `exec4` `872758a3`, `exec5` `d3234320`, `exec6` `2ee7cc03` — no refutation of an exec-1 finding.
