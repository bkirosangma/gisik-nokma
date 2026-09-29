# Styling system refresh — the rules everywhere. Plan A of 2: the foundation, the board, the ticket sheet. Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Every task here touches a screen, so it ALSO invokes `ui-ux-pro-max` beside its workflow skill (workspace `CLAUDE.md`, "UI/UX Design"). The design decisions that skill would make are already pinned below and applied through this repo's tokens and components. Treat the skill as a second opinion on spacing, focus and contrast, not as permission to restyle.

**Plan B** (every other screen, one task per screen, after an inventory) is `docs/superpowers/plans/2026-09-29-styling-system-refresh-b-screens.md`, on the same branch. **Plan B depends on this plan's Tasks 1–4** (tokens and shared components), and it consumes the names in this plan's Pattern table (below) verbatim.

> **Amended 2026-09-29 (owner kanban rulings).** After a kanban-UX video the owner ruled: *"yes, update the mockup and the styling plan"*, for three things.
> 1. **Hover is shadow only.** A card's hover changes its shadow (`lift-near`) and nothing else. There is no scale. Press settles onto `lift-press`, also with no scale. This supersedes the "lift comes toward the user" ruling FOR CARDS (Task 5, and Plan B's P-LIFT door cards). Primary and danger BUTTONS keep their 1.04 hover and 0.98 press (Task 3, unchanged).
> 2. **The full lift happens only while a card is DRAGGED.** The dragged card scales 1.03, takes a deeper spreading shadow (new role `lift-drag`, Task 2) and tilts 2.5°. It leaves behind a placeholder sized to the card, so nothing jumps. This is new **Task 5A**.
> 3. **Every column collapses to a narrow labelled strip with a count.** This is new **Task 5B**. The owner first named Done and Backlog, then ruled that evening: *"all columns are collapsible"* (D27, resolved). Backlog itself is not a board column, so it has no strip.
>
> D21 is retired (nothing on a card slot transforms any more). D13 is amended for the strip. D25–D27 are new. Cases 20.043–20.045 and 20.094 are rewritten. New cases are 20.101–20.105 (5A), 20.111–20.118 (5B) and 20.121–20.122 (browser).
>
> **Owner rulings, 2026-09-29 evening.**
> - **D27 resolved:** every column is collapsible, not only terminal ones. Task 5B has no category gate, and 20.117–20.118 were added.
> - **D11 confirmed:** quieter priority. Urgent stays red, the others are neutral, and the tints are retired.
> - **D6 confirmed:** borders go on quiet BUTTONS only.
> - **Plan B's B-D1 confirmed:** mobile is a separate plan, which the owner will schedule.
> - Soft WIP limits and swimlanes came from the same video. They are NOT in this plan and each needs its own short spec.
> - A pointer-based drag (a custom overlay rather than the browser's drag image) is also out of scope (D26).

## Design source

There is no separate spec. The owner-approved design is the mockup together with the rules and rulings below, and this section is the whole of it.

**The mockup (private canvas):** https://claude.ai/artifact/9dPaHHsD8oKjr2jtmWYYtu. Its three artboards were saved for this plan and read in full:
- **Board:** `…/scratchpad/design-read2/project/Main.dc.html`, 192 lines.
  - `:14-25`: the motion CSS.
  - `:64-122`: columns and cards.
  - `:129-155`: the light and dark values.
- **Primary button:** `…/scratchpad/design-read/project/Buttons.dc.html`, 120 lines.
  - `:13-19`: states and motion.
  - `:86-93`: the six states.
  - `:101-108`: the spec text.
- **Ticket sheet:** `…/scratchpad/design-read/project/Sheet.dc.html`, 155 lines.
  - `:26-101`: the panel.
  - `:110-128`: its values.

`…` is the planner's session scratchpad. The files are NOT in the repo. **Every value an executor needs is transcribed into this plan**, so the scratchpad is provenance, not a dependency.

**The rules** (owner-supplied, 2026-09-29, verbatim):
- Buttons:
  - **01 Size** — 48px tall, 24px side padding (under 44 thumbs miss it).
  - **02 Label** — 17px, semibold, sentence case, a verb plus an object.
  - **03 Contrast** — label ≥ 4.5:1, edge ≥ 3:1 (a flat grey fill at 1.6:1 vanishes).
  - **04 Depth** — light from above: lit edge, recessed track, shadow falls down.
  - **05 Detail** — radius = height ÷ 2, one icon, 10px from the label.
  - **06 Motion** — feedback in 100ms, done in 300 (hover, press, spinner, check).
- Layout:
  - **01 Hierarchy** — one loud element, the rest supports it.
  - **02 Spacing** — 8pt grid: 24 around, 16 between groups, 8 between lines.
  - **03 Color** — 3 text tiers, 1 accent saved for the action.
  - **04 Depth** — light from above, shadow falls down.
  - **05 Corners** — inner radius = outer radius − padding (16 = 24 − 8).
  - **06 Motion** — 150–300ms, ease-out, one purpose per move.

**Owner rulings on the mockup** (verbatim where quoted):
- **Every field stays.** The real card keeps EVERY field it shows today: epic chip, title, assignee, status chips, rollup progress, the keys row `[parent] key [priority] · due` with its late variant, "who · when", the move arrows, and Close on terminal columns. Owner: *"just confirming that it was only for the mockup, and that the actual one will still have those information"*.
- **The lift comes toward the user.** Owner: *"the lift seems to be 2d. vertically up. but make it seem more 3d. like the lifting is towards the user."*
  - ~~Cards scale 1.025 from origin 50% 60% on hover, press 1.01.~~ **Superseded for cards 2026-09-29 (owner kanban rulings):**
    - On HOVER a card takes the 3-layer spreading shadow with the brighter lit edge (`lift-near`), with no scale. Press is `lift-press`, with no scale. Timing is 220ms `cubic-bezier(.2,.8,.2,1)`.
    - The full toward-the-user lift happens only while the card is DRAGGED: scale 1.03, the deeper `lift-drag` shadow and a 2.5° tilt (Task 5A).
  - Primary buttons keep the hover lift at 1.04 hover / 0.98 press, 200ms. Owner: *"yes, apply the same lift to the buttons"*. The 2026-09-29 ruling leaves buttons as they are.
  - Every scale and tilt is off under `prefers-reduced-motion`. That means the buttons' scale and the drag image's scale and tilt. Shadows still change.
- **Drag placeholder** (owner, 2026-09-29): the dragged card leaves a placeholder the size of the card, so the column does not jump (Task 5A).
- **Collapsible columns** (owner, 2026-09-29). The owner first named Done and Backlog. The ruling that evening was *"all columns are collapsible"*. Every board column collapses to a narrow labelled strip with its count (Task 5B, D27 resolved).
- **No per-card tick.** Owner: *"the tick button shouldnt be there"*. Close stays a TEXT button, on terminal-column cards only, as today (`board.tsx:2374`, `category === 'terminal'`).
- **Parent separator.** Owner: *"if parent is present, separate with >"*. The keys row reads `GN-17 › GN-15`: the parent link, then an `aria-hidden` `›`, then the key.
- **Applies everywhere.** Owner, 2026-09-29, the scope change: *"hope the plan includes on applying this styling everywhere. consistency."* That is why there are two plans and why the primary `Button` changes product-wide.
- **Next release.** Owner ruling: the refresh ships in the NEXT release, not in `release/trash` (see Global Constraints).

**The planner's rules-application decisions, already owner-seen in the mockup** (implemented here):
- **Card.**
  - The TITLE is the single loud element: 15px/24px, weight 500, text1.
  - Three groups, 16 apart: (epic + title) / (people row + keys row) / footer. Lines within a group are 8 apart.
  - Epic chip: padding 4/8, radius 8, chip fill.
  - Status chip: plain text3 at 12px, no fill.
  - Parent key: underline only.
  - Priority: the shape icon always. Neutral ink (High text2, Normal text3). ONLY Urgent keeps its red.
  - A late due date is red and weight 600.
  - Footer: borderless ghost controls.
    - The move arrows are 44×44 targets, and "who · when" is 44px tall.
    - Hover and focus show a soft neutral fill plus the focus ring.
    - The hit area reaches into the card's padding, so the card does not grow.
- **Columns.** A recessed track: radius 24, padding 8, inset shadow with light from above. The card radius is 16 (= 24 − 8). The card is raised, with a lit top edge and a falling shadow.
- **Board header.** One loud primary: 48px, 24px padding, 17px semibold, radius 24, one icon 10px from the label, accent fill with a ≥ 3:1 edge. Filter and the other header controls are quiet and outlined with an ACCESSIBLE edge.
- **Token findings** the mockup surfaced. What the tree actually holds is measured in D4.
  - `lineStrong` borders measure 2.03:1 on the paper.
  - The flat sunken fill measures 1.14:1 against the paper.

**Goal:** Put the twelve rules into the shared layers so every screen inherits them:
- tokens: the track and well grounds, the accent edge, the lift/press/track/action/sheet shadows, the track radius, the 8-pt spacing steps and the motion constants;
- the shared `Button`: primary and danger at 48px with the toward-the-user lift, and a quiet outlined ghost with an accessible edge;
- `Card` and `Dialog` surfaces.

Then apply the rules to the two screens the mockup draws: the board and the ticket sheet.

**Architecture:**
- **Tokens first.** `packages/ui/src/tokens.ts` gains three colour roles, nine shadow roles (the mockup's eight plus Task 5A's `lift-drag`, and a `spread` term on a shadow layer), one radius role and two style-invariant families (`--gn-space-*`, `--gn-motion-*`). Every value is emitted by `themeStylesheet()`, so `apps/web` (inline stylesheet) and `apps/desktop` (`installTheme`, `apps/desktop/src/theme.ts`) both receive them.
- **Shared components next.** They are pure CSS edits in `packages/ui/src/ui.css`, IN PLACE: no appended overrides, because several existing tests read the FIRST rule for a selector.
- **Then the two screens.** `packages/app-core/src/views/board.tsx` gets exactly two markup changes: the `›` separator and a footer wrapper. The ticket sheet is CSS-only.
- **Tests.** Each new test reads the stylesheet through ONE new exact-selector reader (`packages/ui/test/helpers/css-rules.ts`), which Plan B reuses.

**Tech Stack:** TypeScript monorepo (pnpm + turbo). React 19. vitest + Testing Library + jsdom in `packages/ui` and `packages/app-core`. Plain CSS with `var(--gn-*)` custom properties (no preprocessor). The browser cases run on the dev stack (`ctl rebuild`, Chromium).

**Spec:** none. The Design source section above IS the spec: the mockup, the twelve rules and the owner's rulings.

**The series.**

| Plan | Scope | Depends on | Case block (`test-cases/20-styling-system.md`) |
|---|---|---|---|
| **A (this plan)** | tokens, shared `Button`/`Card`/`Dialog`, board, ticket sheet, browser check A | — | `20.001`–`20.150` |
| B (`…-refresh-b-screens.md`) | inventory, then every other screen, browser check B | A Tasks 1–4 | `20.201`–`20.600` |

## Global Constraints

- **Branch shape.** Owner ruling, 2026-09-29: this ships in the NEXT release.
  - **Base branch: the NEXT release branch, `release/<YYYY-MM-DD>`.** It is cut from `origin/main` only AFTER `release/trash` has merged to `main`. The controller names it at dispatch.
  - Do NOT cut it yourself. One release branch is live at a time (owner, 2026-09-28). If none exists when you start, stop and say so in your progress line.
  - Cut `task/styling-a-foundation` from `origin/release/<date>`. One commit per task.
  - Open the PR with `bash scripts/ctl/ctl pr open task/styling-a-foundation --repo <worktree> --base release/<date> --title T --body FILE`. Keep that command out of a compound chain.
  - Never use `--base main`. Never push to `main` or to the release branch.
  - CI does not run on a dev PR into a release branch. The verification is your LOCAL run: say which run you quote, and paste `NODE=` beside it.
- **Citations were read on `origin/release/trash` at `8b11d76e`.** That tree becomes `main` once it ships, so line numbers should still hold on your base, but re-verify each one before you edit.
  - Open the file, then trust the SYMBOL, not the number.
  - If a cited line has moved, edit by symbol and note the new line in your commit body.
  - If a cited SELECTOR or symbol no longer exists, stop and report it. Never re-create it.
- **Node 22 for every run.** `node --version` prints `v22.*` in the same shell.
- **Build before suites.** Run `pnpm turbo run build` at the repo root before any package's vitest run. `app-core` imports `@gisik-nokma/ui` from `dist/`, so a stale build turns a `packages/ui` change into a false RED downstream (memory: suites-before-build-false-red).
- **Run a suite as** `cd <package> && pnpm exec vitest run --no-file-parallelism <files> > /tmp/styling-a-<pkg>.log 2>&1; tail -20 /tmp/styling-a-<pkg>.log`.
  - **Never pipe a test run into `head`**, and never `grep -m`: it orphans the worker pool (repo `CLAUDE.md`).
  - Never trust `$?` of a chain. Read the summary line. A log with no summary line is a crash, not a pass.
- **Every case follows the same cycle:**
  1. RED first.
  2. A control in the same `it`.
  3. Commit.
  4. Apply the named mutation, show it red, and paste the red summary line.
  5. Restore with `git checkout -- <file>`.

  Commit BEFORE you mutate: `git checkout --` reverts to HEAD and silently destroys uncommitted work. Paste the RED and GREEN summary lines into the commit body.
- **Case ids.** This plan owns block **`20.001`–`20.150`** in the NEW bucket `test-cases/20-styling-system.md` (3-digit padded; Task 1 opens it). Its sections are `## 20.1`–`## 20.8`, one per task, in task order.
  - Write each case as a `- ❌ **20.0NN — …**` id LINE, one id per line. Never put an id in a table, a heading, backticks, or two ids in one sentence: `scripts/check-case-ids.mjs` cannot see those.
  - After adding a task's cases, run `node scripts/check-case-ids.mjs` and confirm the count moved by EXACTLY the number that task adds (each task states it).
  - Flip `❌`→`✅` in the commit that adds the citing test. Test names contain the id. `pnpm check:citations` stays green, and the `"20-styling-system.md": 0` baseline (Task 1 adds it) stays 0.
  - **Amending an existing case** edits its PROSE and keeps its id and its ✅. Append one sentence: "Amended 2026-09-29 by 20.0NN (styling refresh Plan A): …". Never renumber.
  - The amended cases are 13.289, 13.284, 13.681, 13.411 (test only), 13.464, 13.1141, 13.1148, 13.1452, 13.1453, 13.1467 and 16.84. Each owning task names its file and line.
- **`Features.md`:**
  - Task 1 opens `## 17. Styling system` at EOF, after `## 16. Archive, delete and purge` (`Features.md:3415`).
  - Each task appends its bullet(s) there in the same commit as its code.
  - A task that changes a feature described elsewhere ALSO appends a `  - ✅ …` / `  - ⚙️ …` sub-bullet under that existing bullet, and never rewrites the bullet itself. Those bullets are:
    - `:32` Design tokens;
    - `:43` Base UI components;
    - `:55` Board view;
    - `:182` board columns and cards.
- **Colour discipline.** Every colour is a `--gn-*` role. A value with no role gets a NEW role in `tokens.ts` (light + dark), plus a `CONTRAST_PAIRS` row where it is text or an edge.
  - Never paste a mockup hex into `ui.css`: `packages/ui/test/token-discipline.test.ts` scans for raw colours.
  - New shadow colours are 8-digit alpha primitives whose names start with `shadow` (`tokens.test.ts:229-253`, and case 13.338's sweep reads them by that prefix).
- **Edit CSS in place.** Change the existing rule for a selector. Never append a second rule for it later in the file.
  - `packages/ui/test/components.test.tsx:548` `rule()` reads the FIRST match. A duplicate appended at EOF would be invisible to it, and it would fork the cascade.
  - New selectors go directly beside the rule they extend.
- **Motion.** Every transition names a `--gn-motion-*` variable (Task 2). Durations are 100–300ms, the curve is `--gn-motion-ease-out`, and every `transform` has a `prefers-reduced-motion: reduce` arm that removes it.
  - No `will-change` anywhere (Review Focus 4).
- **Style axis.** No `[data-style]` block may touch `.gn-button` (case 13.340, `components.test.tsx:909-916`). A per-style difference in a button reaches it ONLY through a token.
- **Never `AskUserQuestion`.** A question goes into your progress line for the controller.

## How each style takes the rules

The shipped default style is **neo** (`apps/web/app/layout.tsx:35`, `styleInitScript`: anything unset becomes `neo`; case 13.345). The mockup draws the **hig** warm palette. So each rule below is expressed through tokens, and each style keeps its own character:

| Rule | hig | neo (the default) | minimal |
|---|---|---|---|
| Depth — lit edge + falling shadow | mockup values (`Main.dc.html:146-149`, `:133-136`) | its own dual shadow: `lift` = `raised`, `lift-near` = a larger raised pair, `lift-press` = a smaller one | **none**. Every minimal shadow is `[]`, and `tokens.test.ts:255-260` requires `none` for every shadow role. Recorded as **D3** |
| Recessed track / well | `track` inset (`Main.dc.html:150`, `:137`) on `surfaceTrack` | `track` = its existing `sunken` inset pair; the track ground is `neoPaper`/`neoNavy` | the track fill alone, 1.08:1 against the paper, with no shadow. D3 |
| Primary button depth | `action` shadows (`Buttons.dc.html:52`; `Main.dc.html:138-140`, `:151-153`) | `action` = a 4px raised pair, `action-near` = `raised`, `action-press` = `selected` | none. Fill + edge + label |
| Radius 24 / 16 | track 24, card 16 | track 28, card 20 (neo's card radius, `tokens.ts:1098`) — inner = outer − 8 still holds | track 24, card 16 |
| Accessible edge, 44/48 sizes, type, spacing, motion, 3 text tiers | all styles identically | all styles identically | all styles identically |

## Token translation (mockup value → house role)

Every mockup colour, and where it lands. "NEW" means Task 1 or Task 2 adds it.

| Mockup (`Main.dc.html:130-153`, `Sheet.dc.html:111-127`) | Light | Dark | House role |
|---|---|---|---|
| paper / raised / sunken | `#efe7df` / `#fbf7f3` / `#e4d8cc` | `#141a2e` / `#20294a` / `#2a3560` | `surface` / `surfaceRaised` / `surfaceSunken`. These are already the hig primitives `warmPaper`/`warmRaised`/`warmSunken` and `navyBase`/`navyRaised`/`navySunken` (`tokens.ts:157-162`) |
| track (board) | `#e8ded4` | `#10152a` | **NEW `surfaceTrack`** (`trackWarm`/`trackNavy`) |
| track (sheet well, on a raised panel) | `#f3ece5` | `#1a213b` | **NEW `surfaceWell`** (`wellWarm`/`wellNavy`) |
| chip | `#e4d8cc` | `#2a3560` | the house chip fill `fillTertiary` (see D19) |
| text1 / text2 / text3 | `#202b49` / `#3c3c43` / `#5e5e62` | `#f2e9e1` / `#ebebf5` / `#a0a0a5` | `text` / `textMuted` / `textSubtle`. These are exactly `labelWarm*`, `inkMuted`/`fogMuted` and `textSubtle*` (`tokens.ts:77`, `:125`, `:592-593`, `:662-663`) |
| edge (quiet controls) | `#6c6c70` | `#98989d` | `border`, which ALREADY resolves to `grayAccessible`/`grayAccessibleDark` (`tokens.ts:962-963`, `:1003-1004`). See D4 |
| accent | `#33629f` | `#97bdf2` | `accent` (`blue600`/`blue300`). The dark hex differs: D2 |
| accentEdge | `#2d5488` | `#bcd4f7` | **NEW `accentEdge`**. Light reuses `textAccentLight` (`tokens.ts:505`); dark is new primitive `accentEdgeDark` |
| onAccent | `#ffffff` | `#141a2e` | `accentText` (`onColorWarmLight` `#fbf7f3` / `onColorWarmDark`): 5.81:1 light, 7.15:1 dark (D2) |
| focus `#7fa9e4`, 3px, offset 2 | | | `focusRing`, the house 2px ring (D9) |
| p1 (Urgent) | `#d70015` | `#ff6961` | `danger` (`red600`/`red300`) |
| hair | `#d9d6cf` | `#2a3560` | none. The one hairline this plan draws (the sheet footer) uses the alpha fill `fillSecondary` (D18) |
| lift / near / press / recess / btnShadow / btnNear / btnPress / sheetShadow | see Task 2 | see Task 2 | **NEW shadow roles** `lift`, `lift-near`, `lift-press`, `track`, `action`, `action-near`, `action-press`, `sheet` |

## Pattern table — the declaration sets every screen reuses

Tasks 3–7 introduce these, and Plan B applies them by NAME. Each is written out in full wherever it is applied, because a plan's executor may read one task alone.

| Pattern | For | Declarations (after Task 2's tokens exist) |
|---|---|---|
| **P-PRIMARY** | the ONE loud action on a screen | the shared `Button variant="primary"` (Task 3). Never re-declared per screen |
| **P-QUIET** | a standalone secondary control (header, toolbar, form row) | the shared `Button` default/`ghost` (Task 3): `background: transparent; border: 1px solid var(--gn-border); color: var(--gn-text-muted); font-weight: 600; min-height: 2.75rem; padding: 0 1rem; border-radius: 999px;` with hover `background: var(--gn-fill-quaternary)` |
| **P-GHOST** | a control INSIDE a dense surface (card footer, table row, column header) | `min-height: 2.75rem; border: none; border-radius: 999px; background: transparent; color: var(--gn-text-subtle);`. Hover and `:focus-visible` get `background: var(--gn-fill-tertiary); color: var(--gn-text-muted);`, `:focus-visible` adds `outline: 2px solid var(--gn-focus-ring); outline-offset: 0;`, and there is a background-colour transition at `var(--gn-motion-feedback)` |
| **P-TRACK** | a container that HOLDS raised items on the page ground | `background: var(--gn-surface-track); box-shadow: var(--gn-shadow-track); border-radius: var(--gn-radius-track); padding: 0.5rem;` |
| **P-WELL** | a recessed group INSIDE a raised panel | `background: var(--gn-surface-well); box-shadow: var(--gn-shadow-track); border-radius: var(--gn-radius-card); padding: 0.5rem;`. Rows inside it take `border-radius: calc(var(--gn-radius-card) - 0.5rem)` |
| **P-RAISED** | a static panel | `.gn-card` (Task 4): `box-shadow: var(--gn-shadow-lift)`. No hover |
| **P-LIFT** | an interactive raised item | P-RAISED plus the Task 5 hover/press pair, keyed on the element that performs the action, never on `.gn-card`. **Amended 2026-09-29: shadow only.** Hover is `box-shadow: var(--gn-shadow-lift-near)` above its neighbours (`position: relative; z-index: 1`). Press is `box-shadow: var(--gn-shadow-lift-press)` in the feedback time. The transition is on `box-shadow` alone. There is NO transform, so no reduced-motion arm and no dialog guard are needed (D21 retired). Plan B's door cards take the same pair, so this restyles those screens too |

## Recorded deviations

- **D1 — No spec document.** The Design source section is the spec. Tests cite the rule or ruling they pin by its words.
- **D2 — Mockup hexes that differ from the house palette are NOT adopted.**
  - The dark accent `#97bdf2` is the house `textAccentDark`, not `accent`. The product keeps `blue300` `#7fa9e4` as its dark accent fill, because `accent` feeds `focusRing` and `categoryActive` too (`tokens.ts:969`, `:981`).
  - `onAccent` `#ffffff` becomes `accentText` `#fbf7f3`: 5.81:1 on `#33629f` against the mockup's 6.2:1, both clear of 4.5.
  - The dark accent EDGE `#bcd4f7` IS adopted, as new primitive `accentEdgeDark`: 11.42:1 on `navyBase`.
- **D3 — `minimal` takes no depth.** Its shadows are `[]` for every role, and `tokens.test.ts:255-260` asserts `none` for every role in `SHADOW_ROLES`, which grows by nine here (the eight mockup roles plus `lift-drag`, Task 5A's drag shadow).
  - In minimal the track and well are fill-only (1.08:1 and 1.10:1). They are identified by their contents, not their edge. Minimal is flat by design (`tokens.ts:1252-1253`).
  - Rules 01–03, 05 and 06 apply to minimal in full.
- **D4 — The two "token findings", measured against this tree.**
  - (a) `lineStrong` `#a8a49a` does measure 2.03:1 on `warmPaper`, but **no role resolves to it**. `git grep lineStrong` on `origin/release/trash` finds only its declaration (`tokens.ts:80`) and a comment (`:40`). The `border` role has resolved to `grayAccessible` since the border sweep (`tokens.ts:962`): 4.27:1 on paper, 4.90:1 on raised, 6.01:1 on dark paper.
    - So there is nothing to fix at the token level. The plan's job is to PUT the accessible edge on the quiet controls (Task 3).
    - Case 20.004 pins both facts: `lineStrong` fails 3:1, and no role maps to it.
  - (b) `surfaceSunken` on `surface` measures 1.14:1 (hig light). The board column moves off it onto the recessed track (Task 5). Plan B moves every other "sunken fill as a boundary" rule, listed there.
- **D5 — The primary `Button` changes product-wide (option (b)), because the owner asked for consistency.**
  - `git grep 'variant="primary"'` on `origin/release/trash`, excluding tests, finds **26 usages in 21 files** (Task 3 lists them).
  - Quiet and ghost controls stay 44px. Primary and danger go to 48px. An action row therefore mixes 48 and 44 heights, aligned on centre. Rule 01 names 48 for "buttons", but the mockup's own quiet controls are 44 (`Main.dc.html:54`, `Sheet.dc.html:97`), and the owner approved them.
  - Whether all 26 usages stay in layout at 48px/24px/17px is **not measured here**. There is no rendering run in a plan. Browser case 20.097 measures them, and any overflow is fixed in the owning Plan B screen task, never by excluding the usage.
- **D6 — The ghost `Button` gains an edge. This supersedes ruling R1(c) (2026-09-08) FOR BUTTONS.**
  - R1(c) removed every control border and identified controls by fill plus an accent label (13.289, 13.284). Rule 03 says a flat grey fill vanishes (1.09–1.15:1 measured, `ui.css:84-85`) and the edge must clear 3:1.
  - The ghost `Button` becomes transparent with a 1px `border` edge (4.27–6.01:1) in EVERY style, **neo included**, although neo's depth language is shadow-only. A shadow below 3:1 does not identify a control under WCAG 1.4.11, and 13.340 forbids a neo fork.
  - 13.289 and 13.284 are amended in place.
  - **CONFIRMED by the owner 2026-09-29 (evening): borders on quiet BUTTONS only.** R1(c)'s no-border rule stands for every other control (fields keep their own edge, 13.291). Only the ghost/quiet `Button` and Plan B's P-QUIET raw elements gain the 1px edge.
- **D7 — The ghost label moves off the accent.** Rule 03 says "1 accent saved for the action". The ghost label changes from `textAccent` to `textMuted` (text2), which clears 4.5 on every declared surface.
- **D8 — No working spinner and no done check.** Rule 06 names both, and the coordinator scoped them "where the component already has a pending state". `Button` has none (`packages/ui/src/components/button.tsx:12-15`). Hosts keep their current disabled-while-busy behaviour. A `busy` prop is a follow-up; Plan B lists the hosts that hold a busy flag.
- **D9 — The focus ring stays the house 2px** (`outline: 2px solid var(--gn-focus-ring)`), not the mockup's 3px/offset-2. Several ✅ cases pin 2px (e.g. `components.test.tsx:1226-1259`). The ring is a keyboard user's only locator, and 2px at 3:1+ already meets WCAG 2.4.13's minimum area.
- **D10 — "New ticket" keeps its label.** Rule 02 wants a verb plus an object, and the mockup reads "Create ticket". The label is pinned by tests that press it by name and by the help corpus (`pnpm check:help`), so changing it is a copy change and needs its own ruling. Follow-up for the owner. It also gains no icon (rule 05 says "one icon", which is a maximum).
- **D11 — Priority keeps its icons and loses its per-level tint. CONFIRMED by the owner 2026-09-29 (evening): quieter priority, with Urgent red, the others neutral and the tints retired.**
  - The planner's decision (already owner-seen in the mockup) makes P2/P3 ink neutral. The mockup draws no card tint on any card, Urgent included (`Main.dc.html:72`). The owner's 2026-09-23 request asked for the opposite: red fire P1, green leaf P2, frozen-blue snowflake P3, each card tinted by its priority (`board.tsx:1540-1547`).
  - This plan follows the approved mockup:
    - the icons (fire / leaf / snowflake) stay as "the shape";
    - P1 ink stays `danger`, P2 becomes `textMuted`, P3 becomes `textSubtle`;
    - the three card tints are deleted, and their four roles are retired (`priorityP1Tint`, `priorityP2Tint`, `priorityP3Tint`, `priorityP3`).
  - Cases 13.1452 and 13.1453 are amended in place.
  - The owner confirmed it on 2026-09-29 (evening). This supersedes the 2026-09-23 request. The rollback path, should it ever be wanted: revert Task 6 Step 5's items 2a (the tint rules), 2h (the priority ink) and 3 (the retired roles), and the 13.1453 rewrite in item 4.
- **D12 — The column name stays a category `Chip`.** The mockup draws plain 15px/600 text. Ruling 14 (`ui.css:962-974`) keeps the name inside the tone chip, because the chip's tone carries CATEGORY for every column.
- **D13 — Lanes keep their 18rem fixed width in a scrolling rail** (`ui.css:951-961`). The mockup's 5-column grid is a fixed 1440px artboard. **Amended 2026-09-29:** a COLLAPSED column (Task 5B; any column, D27 resolved) is a 3.5rem strip (`flex: 0 0 3.5rem`). That is the one exception to the 18rem lane, and an expanded column is still 18rem. With every column collapsed, the rail is a row of strips side by side (20.118).
- **D14 — Two markup changes in `board.tsx`, both layout-only.**
  - the `›` span (the owner's ruling);
  - a `gn-board-card__footer` wrapper around "who · when" and the move arrows, so they share one row that reaches into the card's padding.

  Nothing moves between parents except those two elements: the footer holds the provenance button and the `{arrows}` node exactly as they were.
- **D15 — A status chip on a card keeps its tone dot.** It loses its fill and becomes text3 at 12px, as the mockup draws it. The dot is the only non-text carrier of the chip's tone, and colour must never be the sole signal.
- **D16 — The sheet mockup's "Start work" primary and its comment composer footer are NOT built.** Each would be a behaviour change (a direct transition control; a new comment entry point outside the Comments tab).
  - The sheet has no primary action today: `Move…`, `Close` and `Reopen` are ghost `Button`s (`ticket-sheet.tsx:3321-3348`). Its loud element is therefore its TITLE (26/32, 700).
- **D17 — One `track` shadow for both the board track and the sheet well.** The sheet's recess differs by 0.05 alpha (`Sheet.dc.html:123` against `Main.dc.html:150`). Two roles 5% apart would be two names for one idea.
- **D18 — No hairline role.** The mockup's `hair` equals the unused `line` primitive. The sheet footer's rule (today `border-top: 1px solid var(--gn-border)`, `ui.css:2320`, which at 4.27:1 reads as a heavy rule) becomes the alpha `fillSecondary`. It is a decorative separator and owes no contrast.
- **D19 — The epic chip uses the house chip fill `fillTertiary`, not the mockup's `sunken` hex.** It is the fill every other chip-like control already takes (`.gn-chip`, `ui.css:164`).
- **D20 — Every button-shaped control is a pill (radius = height ÷ 2, rule 05).** That includes "who · when", which the mockup draws at radius 12 (`Main.dc.html:110`).
- **D21 — RETIRED 2026-09-29 (owner kanban rulings).** The deviation said the hover lift must not break the transition dialog.
  - The hazard was real. `MoveArrows` renders `TransitionDialog` INSIDE the card (`board.tsx:2422`). `Dialog` renders its `position: fixed` scrim in place, with no portal (`packages/ui/src/components/dialog.tsx:121-122`; `ui.css:335-342`). A transformed ancestor becomes the containing block for fixed descendants, so a scaled card would have pulled its own dialog into itself.
  - It no longer applies because hover and press are now shadow only (Task 5). Nothing on the slot transforms, and a `box-shadow` or a `z-index` creates no containing block, so the guard `:not(:has(.gn-dialog__scrim))` is removed rather than kept as a selector-spelling check.
  - The drag's scale and tilt live on a detached `setDragImage` clone (Task 5A). That clone holds no dialog and is never an ancestor of one.
  - Two things carry over:
    - The rule against `will-change` stays (20.026), because it creates a permanent containing block.
    - The dialog-centred check stays as browser case 20.094, now a regression check.
- **D23 — The spacing variables are emitted but not yet consumed.** Task 2 emits `--gn-space-1/2/3` (8/16/24), and every rule in both plans writes the literal `0.5rem`/`1rem`/`1.5rem`. The tests pin the literals, the way this stylesheet writes every other length. The variables exist so a runtime consumer (an inline style, `apps/desktop`) can read the grid. `tokens.ts`'s own emitter docblock argues against a value nothing renders, so a reviewer may ask to adopt `var(--gn-space-N)` in Tasks 5–7, or to drop the emission. Either is a small follow-up. It is recorded, not decided.
- **D24 — The plan is two files, although the split trigger never fired.** The coordinator's instruction was to split above ~6,000 lines. Plan A is 3.4k (2.9k before the 2026-09-29 amendment) and Plan B 1.6k. The planner split early, on an estimate that turned out wrong, and kept the split because Plan B's tasks are independent of each other and can run as a separate lane. Also, the coordinator asked for the inventory FIRST in Phase B, before the board and the sheet. Here the board and the sheet are Plan A's Tasks 5–7, because the brief carried them in full, and the inventory is Plan B's Task B1. Every other screen follows the inventory.
- **D22 — Out of this plan, into Plan B.** These belong to other screens' tasks:
  - the whole-board and per-column empty states (`ui.css:1015-1133`);
  - the List's `.gn-row-action`/`.gn-list__bulk-close`, which today share a rule with the board's Close (`ui.css:1511-1514`), a group this plan SPLITS;
  - fields, menus, popovers, toasts and the app shell.
- **D25 — The TARGET column gets a track highlight, not an inserted placeholder** (Task 5A, added 2026-09-29).
  - The owner asked for "a drag placeholder sized to the dragged card". The placeholder IS built, at the card's SOURCE slot: the slot stays in the DOM with its box unchanged and its contents hidden, so the source column does not jump.
  - In the column being dragged over there is NO inserted placeholder. A board drop changes a ticket's STATE (`onDropCard(event, column.stateId)`, `board.tsx:1076`). It does not reorder: the drop handler reads only a ticket id and a state id (`board.tsx:1305-1307`), and the card lands wherever the column's own order puts it. A placeholder at an index would claim a position the drop won't honour. Inserting one on `dragenter` would also cause the very layout jump the ruling removes.
  - Instead the column shows a 2px accent outline inside its edge while a card is over it. The accent is rule 03's "one accent, saved for the action", and this is the action.
- **D26 — Native HTML5 drag-and-drop stays, and the lift lives on a `setDragImage` clone** (Task 5A, added 2026-09-29).
  - The board drags natively (`draggable`/`onDragStart`, `board.tsx:1444-1452`). The browser drags a BITMAP snapshot of an element, so CSS on the source `<li>` does not follow the pointer.
  - The tilt, the scale and the `lift-drag` shadow are therefore painted on an off-screen clone handed to `event.dataTransfer.setDragImage` at `dragstart`, then removed.
  - The browser adds its own translucency to a drag image (Chromium and Safari both do), and no page can switch that off. Full fidelity is therefore witnessed in browser case 20.121, not claimed by a unit test.
  - An opaque lifted card that follows the pointer needs a pointer-events drag with a custom overlay. That is a different interaction model, touching every drag-drop case, so it is a SEPARATE plan and out of scope here.
- **D27 — RESOLVED 2026-09-29 (evening): EVERY board column is collapsible.** Owner: *"all columns are collapsible"*.
  - It was raised as a question. The owner had named "Done + Backlog", but Backlog is never a board column (spec §1.1). `packages/app-core/src/views/board.tsx:1700-1705` records it: "Backlog is never a board column (spec §1.1), so a card dropped there has no column to land in". Backlog is its own tab.
  - The ruling generalises the collapse. Task 5B offers it on every column of every category (open, active and terminal), with no `column.category` gate. Backlog stays off the board, so it has no strip, and spec §1.1 is unchanged.
  - Kept from the first draft: collapse defaults to expanded; the memory is per user and per project; a collapsed section is still the drop target; `Close all (N)` is hidden while collapsed.
  - The edge case is every column collapsed at once. The board is then a row of 3.5rem strips side by side, each still a drop target with its own Expand button, and the workflow group's heading stays visible. Collapsing columns never collapses the group, because the two memories are separate (20.118).
  - The mockup follows the ruling: every column carries the control.

## Review Focus

Most likely to bite first. Each item has its test in the owning task.

1. **A card that carries every field at once still fits and reads title-first.**
   - Condition: epic + parent (`›`) + progress + a status chip + a late due date + the provenance unfolded.
   - Expected: nothing overflows the 18rem lane, the title is the largest text, and the footer wraps below rather than squeezing the arrows.
   - Owners: Task 6 (20.053 pins the type scale) and browser case 20.093.
2. **Dark-theme contrast of the neutral priority ink and the ghost controls' hover state.**
   - Expected: P2/P3 ink and the footer's ink clear 4.5 on their real grounds, in every style × theme. That includes the hovered footer, where `textSubtle` measures only 4.03:1 over `fillTertiary` in hig dark.
   - Owner: Task 6, cases 20.057 and 20.059. 20.059's control pins the 4.03 that forces the ink to step up to `textMuted` on hover.
3. **Neo keeps its look.**
   - Expected: every new shadow role under neo is built from neo's own dual-shadow primitives and geometry, never the hig drop shadow.
   - Owners: Task 2, case 20.013; browser case 20.096 (screenshots per style × theme).
4. **The hover shadow does not clip or draw under its neighbour, and a dialog stays centred** (amended 2026-09-29: hover is shadow only).
   - Expected:
     - a hovered card's shadow draws ABOVE the next card (`z-index`);
     - NOTHING on the card or its slot transforms;
     - the rail leaves room for the falling shadow;
     - a transition dialog opened from a hovered card stays centred in the viewport.
   - Owners: Task 5, case 20.043 (no transform, z-index, rail bottom room); browser case 20.094.
5. **Reduced-motion users get no scale and no tilt** on primary or danger buttons, or on the drag image. Hover still changes the shadow.
   - Owners: Task 3, case 20.023; Task 5A, case 20.103 (the drag clone); browser case 20.095.
6. **A drag leaves nothing behind and breaks no existing drag case** (added 2026-09-29).
   - Expected:
     - the `setDragImage` clone is detached after the snapshot, and no second `ticket-card-*` test id exists during a drag;
     - the jsdom `DataTransfer` fakes, which have no `setDragImage` (`board-drag-drop.test.tsx:100-109`, `board-card-click.test.tsx:77-86`), still drag and drop;
     - the placeholder and every column highlight clear on `dragend`, including Esc and a refused drop.
   - Owners: Task 5A, cases 20.101, 20.102, 20.104 and 20.105.
7. **A collapsed Done column still takes a drop** (added 2026-09-29). Expected: dropping a card on the strip moves the ticket, and the strip's count goes up. Owner: Task 5B, case 20.114.

---

## File map

| File | Responsibility in this plan |
|---|---|
| `packages/ui/src/tokens.ts` | roles `surfaceTrack`, `surfaceWell`, `accentEdge`; 11 `CONTRAST_PAIRS` rows; `ShadowLayer.spread`; 9 shadow roles (incl. `lift-drag`, Task 5A); radius `track`; `spacing` + `motion` (emitted once); retire 4 priority roles (Task 6) |
| `packages/ui/src/ui.css` | `.gn-button` family, `.gn-card`, `.gn-dialog`, the board rules (`:883-1549`), the sheet rules (`:352-847`, `:2313-2536`) — edited in place |
| `packages/app-core/src/views/board.tsx` | `›` after the parent key (`:1628-1637`); `gn-board-card__footer` around provenance + arrows (`:1658-1666`); the drag image, source placeholder and target highlight (Task 5A); the column collapse, on every column (Task 5B) |
| `packages/app-core/src/views/board-drag-image.ts` (new, Task 5A) | `setCardDragImage(event, cardElement)`: the feature-guarded, detached, id-stripped clone |
| `packages/app-core/src/preferences/column-collapse.ts` (new, Task 5B) | which columns a person collapsed, per user and project, in `localStorage` (the `workflow-collapse.ts` shape) |
| `packages/ui/test/helpers/css-rules.ts` (new) | `parseRules`, `ruleExactly`, `rulesNaming`, `valueOf` — the exact-selector reader Plan B reuses |
| `packages/ui/test/helpers/contrast.ts` (new) | `contrastRatio`, `over` |
| `test-cases/20-styling-system.md` (new), `test-cases/README.md`, `scripts/fixtures/check-case-citations-baseline.json` | the bucket |
| `test-cases/13-hig-per-screen.md`, `13-board-prototype-port.md`, `13-owner-requests-and-backlog.md`, `16-remaining-doors.md` | amended cases |
| `Features.md` | `## 17. Styling system`; sub-bullets at `:32`, `:43`, `:55`, `:182` |

Tests (new unless stated):
- `packages/ui/test/styling-tokens.test.ts` (Tasks 1–2)
- `packages/ui/test/styling-buttons.test.ts` (Task 3)
- `packages/ui/test/styling-surfaces.test.ts` (Task 4)
- `packages/ui/test/styling-board.test.ts` (Tasks 5–6)
- `packages/app-core/test/views/board-styling.test.tsx` (Task 6)
- `packages/app-core/test/views/board-drag-lift.test.tsx` (Task 5A)
- `packages/app-core/test/preferences/column-collapse.test.ts` and `packages/app-core/test/views/board-column-collapse.test.tsx` (Task 5B)
- `packages/ui/test/styling-sheet.test.ts` (Task 7)
- existing, amended in place:
  - `packages/ui/test/tokens.test.ts`;
  - `packages/ui/test/components.test.tsx`;
  - `apps/web/test/tap-target-density.test.ts`.

---

### Task 1: Open the bucket; the track, well and accent-edge roles, with their contrast pairs

**Files:**
- Create: `test-cases/20-styling-system.md`, `packages/ui/test/helpers/css-rules.ts`, `packages/ui/test/helpers/contrast.ts`, `packages/ui/test/styling-tokens.test.ts`.
- Modify: `packages/ui/src/tokens.ts`:
  - `primitives` — insert before its closing `} as const;` at `:753`;
  - `TOKEN_ROLES` — after `'surfaceOverlay',` `:761` and after `'accentText',` `:877`;
  - `themes.light` — after `surfaceOverlay` `:956` and `accentText` `:973`;
  - `themes.dark` — after `:997` and `:1014`;
  - `STYLE_COLOR_OVERRIDES.neo` — light after `:1070`, dark after `:1084`;
  - `CONTRAST_PAIRS` — append before its closing `];`, after `{ fg: 'focusRing', bg: 'surface', minimum: 3 },`.
- Modify: `packages/ui/test/tokens.test.ts:1484` (13.681: `33` → `44`).
- Modify: `test-cases/README.md` (one bucket line), `scripts/fixtures/check-case-citations-baseline.json` (add `"20-styling-system.md": 0` after `"19-trash.md": 0` at `:28`, adding the comma), `test-cases/13-owner-requests-and-backlog.md:2003` (13.681 prose), `Features.md` (open `## 17`; sub-bullet under `:32`).

**Interfaces:**
- Produces:
  - `TokenRole` gains `'surfaceTrack' | 'surfaceWell' | 'accentEdge'`, emitted as `--gn-surface-track`, `--gn-surface-well` and `--gn-accent-edge` (`cssVariableName`, `tokens.ts:1533-1535`).
  - New primitives: `trackWarm`, `trackNavy`, `wellWarm`, `wellNavy`, `accentEdgeDark`.
  - `packages/ui/test/helpers/css-rules.ts` exports:
    - `readUiCss(): string`;
    - `parseRules(css): CssRule[]`;
    - `ruleExactly(css, selectors, atRule?): string`;
    - `rulesNaming(css, selector): CssRule[]`;
    - `valueOf(body, property): string | null`.
  - `packages/ui/test/helpers/contrast.ts` exports `contrastRatio(a, b): number` and `over(src, dst): string`.
- Consumes: nothing.

Cases (open `## 20.1 Tokens — grounds and edges`). The guard moves by **4**:

```markdown
- ❌ **20.001 — `surfaceTrack` is the recessed-track ground: `#e8ded4` light / `#10152a` dark under hig and minimal, the neo surface under neo, and `text`/`textMuted`/`textSubtle` are declared pairs on it that clear 4.5 in every style × theme;** control: `surfaceSunken` measures below 1.5 against `surface` in hig light (1.14 — the flat fill that "vanishes"), and so does the track itself (1.08), which is why the track is identified by its `track` shadow (20.012), not its fill. Mutation: delete the three `surfaceTrack` rows from `CONTRAST_PAIRS`.
- ❌ **20.002 — `surfaceWell` is the well ground inside a raised panel: `#f3ece5` / `#1a213b` under hig and minimal, the neo surface under neo, with the same three text pairs at 4.5;** control: the well differs from `surfaceRaised` in hig light. Mutation: map `themes.dark.surfaceWell` to `navyRaised`.
- ❌ **20.003 — `accentEdge` is the primary button's edge: `#2d5488` light / `#bcd4f7` dark in every style, ≥ 3:1 on `surface` and `surfaceRaised` in every style × theme, and `accentText` on it (the hovered primary's fill) ≥ 4.5;** control: `accent` itself also clears 3 on `surface` (the fill is visible), so the edge is a second signal rather than the only one. Mutation: map `themes.dark.accentEdge` to `navySunken`.
- ❌ **20.004 — the accessible edge is the `border` role: declared ≥ 3:1 on `surfaceRaised` and `surfaceWell` (as well as `surface`), and no role in any style × theme resolves to `lineStrong`;** control: `lineStrong` on `warmPaper` measures below 3 (2.03) — the finding the mockup surfaced, pinned as a measurement of a primitive nothing uses. Mutation: remap `themes.light.border` to `lineStrong`.
```

- [ ] **Step 1: Open the bucket.** Create `test-cases/20-styling-system.md`:

```markdown
# §20 — Styling system

**Opened 2026-09-29 by Plan A of the styling refresh** (`docs/superpowers/plans/2026-09-29-styling-system-refresh.md`;
Plan B: `docs/superpowers/plans/2026-09-29-styling-system-refresh-b-screens.md`). Mirrors `Features.md` §17.
The design source is the plan's own "Design source" section (the owner-approved mockup, the twelve rules, the
owner's rulings); there is no separate spec.

## THE ID SHAPE

§20 is uniformly 3-digit padded: `20.001`–`20.999`, following §17–§19's ruling. Blocks are allocated per plan
in the table below. Take from your block, never from the tip.

| Plan | Block |
|---|---|
| A Foundation, board, sheet | `20.001`–`20.150` |
| B Every other screen | `20.201`–`20.600` |

**Write cases as `- ❌ **20.001 — …**` id LINES.** The guard (`scripts/check-case-ids.mjs`) counts id LINES and
nothing else; four spellings are invisible to it (a markdown **table row**, a **`##` heading**, a **backticked**
id inside the bold, and **two ids in one sentence**). After adding cases, confirm the count moved by EXACTLY
the number you added.
```

Then append the four cases above under `## 20.1 Tokens — grounds and edges`.
  - Append to `test-cases/README.md`, after the `19-trash.md` paragraph: `` `20-styling-system.md` (`Features.md` §17 — the styling refresh, **opened by Plan A on 2026-09-29**; 3-DIGIT PADDED `20.001`–`20.999`, blocks per plan in the bucket file's own table). ``
  - Add `"20-styling-system.md": 0` to the citations baseline.
  - Run `node scripts/check-case-ids.mjs` before and after: +4.

- [ ] **Step 2: Write the two helpers.** `packages/ui/test/helpers/css-rules.ts`:

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from './colour-scan.js';

/**
 * The exact-selector CSS reader for the styling refresh (Plan A Task 1; Plan B
 * reuses it). `components.test.tsx`'s `rule()` returns the FIRST substring match,
 * so `rule('.gn-sheet')` lands on the `.gn-dialog,\n.gn-sheet` GROUP at
 * `ui.css:351-352` rather than the sheet's own rule at `:399`. This reader
 * compares the WHOLE selector list, so a group and a lone selector are
 * different rules. It also knows which at-rule a rule sits in, so a
 * `prefers-reduced-motion` arm is not confused with the base rule.
 *
 * Comments are BLANKED rather than removed, so a `}` in prose cannot close a
 * rule early and a selector discussed in a comment never answers for a
 * deleted rule.
 */
export type CssRule = { selectors: readonly string[]; body: string; atRule: string | null };

export const UI_CSS_PATH = join(REPO_ROOT, 'packages/ui/src/ui.css');

export function readUiCss(): string {
  return readFileSync(UI_CSS_PATH, 'utf8');
}

function blankComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' '));
}

export function parseRules(css: string): CssRule[] {
  const src = blankComments(css);
  const rules: CssRule[] = [];
  const atStack: string[] = [];
  let head = 0;
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (ch === '{') {
      const prelude = src.slice(head, i).trim();
      if (prelude.startsWith('@')) {
        atStack.push(prelude.replace(/\s+/g, ' '));
        head = i + 1;
        continue;
      }
      const close = src.indexOf('}', i);
      if (close === -1) throw new Error(`unclosed rule after "${prelude}"`);
      rules.push({
        selectors: prelude.split(',').map((part) => part.replace(/\s+/g, ' ').trim()),
        body: src.slice(i + 1, close),
        atRule: atStack.length > 0 ? (atStack[atStack.length - 1] ?? null) : null,
      });
      i = close;
      head = close + 1;
    } else if (ch === '}') {
      atStack.pop();
      head = i + 1;
    }
  }
  return rules;
}

/**
 * The ONE rule whose selector list is exactly `selectors`, in order, under
 * `atRule` (null = top level). Throws on zero AND on more than one: a
 * selector declared twice at the same level is the cascade fork these tests
 * exist to refuse.
 */
export function ruleExactly(
  css: string,
  selectors: string | readonly string[],
  atRule: string | null = null,
): string {
  const wanted = typeof selectors === 'string' ? [selectors] : [...selectors];
  const hits = parseRules(css).filter(
    (rule) =>
      rule.atRule === atRule &&
      rule.selectors.length === wanted.length &&
      rule.selectors.every((selector, index) => selector === wanted[index]),
  );
  if (hits.length !== 1) {
    throw new Error(`expected exactly one rule for "${wanted.join(', ')}" under ${atRule ?? 'top level'}, found ${hits.length}`);
  }
  const [only] = hits;
  if (only === undefined) throw new Error('unreachable');
  return only.body;
}

/** Every rule, at any level, whose selector list NAMES `selector` — for "nothing else declares X" scans. */
export function rulesNaming(css: string, selector: string): CssRule[] {
  return parseRules(css).filter((rule) => rule.selectors.includes(selector));
}

/** The value of the LAST declaration of `property` in `body` (whitespace-collapsed), or null. */
export function valueOf(body: string, property: string): string | null {
  const escaped = property.replace(/[-]/g, '\\-');
  const hits = [...body.matchAll(new RegExp(`(?:^|;|\\s)${escaped}\\s*:\\s*([^;]+);`, 'g'))];
  const last = hits[hits.length - 1];
  const value = last?.[1];
  return value === undefined ? null : value.replace(/\s+/g, ' ').trim();
}
```

`packages/ui/test/helpers/contrast.ts`:

```ts
/** WCAG 2.x contrast, and alpha compositing — the one copy the styling-refresh tests share. */
function channel(pair: string): number {
  const srgb = Number.parseInt(pair, 16) / 255;
  return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex: string): number {
  return 0.2126 * channel(hex.slice(1, 3)) + 0.7152 * channel(hex.slice(3, 5)) + 0.0722 * channel(hex.slice(5, 7));
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** `src` (#rrggbb or #rrggbbaa) composited over the opaque `dst`. */
export function over(src: string, dst: string): string {
  const byte = (hex: string, i: number): number => Number.parseInt(hex.slice(i, i + 2), 16);
  const alpha = src.length === 9 ? byte(src, 7) / 255 : 1;
  return `#${[1, 3, 5]
    .map((i) => Math.round(byte(src, i) * alpha + byte(dst, i) * (1 - alpha)).toString(16).padStart(2, '0'))
    .join('')}`;
}
```

- [ ] **Step 3: Write the failing test** `packages/ui/test/styling-tokens.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  CONTRAST_PAIRS,
  TOKEN_ROLES,
  colorOf,
  primitives,
  type StyleName,
  type ThemeName,
  type TokenRole,
} from '../src/tokens.js';
import { contrastRatio } from './helpers/contrast.js';
import { parseRules, ruleExactly, valueOf } from './helpers/css-rules.js';

/**
 * Styling refresh Plan A, Task 1 — cases 20.001–20.004 (`test-cases/20-styling-system.md`
 * §20.1). The grounds and the edge the twelve rules need, translated from the
 * owner-approved mockup (`Main.dc.html:130-153`, `Sheet.dc.html:111-127`) into roles.
 */
const STYLES: StyleName[] = ['hig', 'minimal', 'neo'];
const THEMES: ThemeName[] = ['light', 'dark'];

function declared(fg: TokenRole, bg: TokenRole, minimum: number): boolean {
  return CONTRAST_PAIRS.some((pair) => pair.fg === fg && pair.bg === bg && pair.minimum === minimum);
}

describe('the exact-selector reader is proven against planted input before it is trusted', () => {
  it('tells a group from a lone selector, and a media arm from the base rule', () => {
    const planted = [
      '/* .gn-x { color: red; } — a DELETED rule, in prose */',
      '.gn-a,',
      '.gn-x { padding: 1rem; }',
      '.gn-x { padding: 2rem; margin: 0; }',
      '@media (prefers-reduced-motion: reduce) {',
      '  .gn-x { transition: none; }',
      '}',
    ].join('\n');
    expect(valueOf(ruleExactly(planted, '.gn-x'), 'padding')).toBe('2rem');
    expect(valueOf(ruleExactly(planted, ['.gn-a', '.gn-x']), 'padding')).toBe('1rem');
    expect(valueOf(ruleExactly(planted, '.gn-x', '@media (prefers-reduced-motion: reduce)'), 'transition')).toBe('none');
    expect(parseRules(planted)).toHaveLength(3);
    expect(() => ruleExactly(`${planted}\n.gn-x { color: blue; }`, '.gn-x')).toThrow(/found 2/);
    expect(valueOf('min-height: 3rem; height: 1rem;', 'height')).toBe('1rem');
  });
});

describe('20.001 surfaceTrack — the recessed track ground', () => {
  it('20.001 pinned per style × theme, and the three text tiers are DECLARED pairs on it that clear 4.5', () => {
    for (const style of ['hig', 'minimal'] as const) {
      expect(colorOf('light', 'surfaceTrack', style)).toBe('#e8ded4');
      expect(colorOf('dark', 'surfaceTrack', style)).toBe('#10152a');
    }
    for (const theme of THEMES) {
      expect(colorOf(theme, 'surfaceTrack', 'neo')).toBe(colorOf(theme, 'surface', 'neo'));
    }
    for (const fg of ['text', 'textMuted', 'textSubtle'] as const) {
      expect(declared(fg, 'surfaceTrack', 4.5), `${fg} on surfaceTrack is not a declared pair`).toBe(true);
      for (const style of STYLES) {
        for (const theme of THEMES) {
          expect(
            contrastRatio(colorOf(theme, fg, style), colorOf(theme, 'surfaceTrack', style)),
            `${style}/${theme}: ${fg} on surfaceTrack`,
          ).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
    // CONTROL — the finding: a flat fill is not a boundary. The sunken fill and
    // the track itself both sit below 1.5:1 on the paper, so the track must be
    // carried by its shadow (20.012).
    expect(contrastRatio(colorOf('light', 'surfaceSunken'), colorOf('light', 'surface'))).toBeLessThan(1.5);
    expect(contrastRatio(colorOf('light', 'surfaceTrack'), colorOf('light', 'surface'))).toBeLessThan(1.5);
  });
});

describe('20.002 surfaceWell — the well inside a raised panel', () => {
  it('20.002 pinned per style × theme, with the three text tiers declared at 4.5', () => {
    for (const style of ['hig', 'minimal'] as const) {
      expect(colorOf('light', 'surfaceWell', style)).toBe('#f3ece5');
      expect(colorOf('dark', 'surfaceWell', style)).toBe('#1a213b');
    }
    for (const theme of THEMES) {
      expect(colorOf(theme, 'surfaceWell', 'neo')).toBe(colorOf(theme, 'surface', 'neo'));
    }
    for (const fg of ['text', 'textMuted', 'textSubtle'] as const) {
      expect(declared(fg, 'surfaceWell', 4.5), `${fg} on surfaceWell is not a declared pair`).toBe(true);
    }
    // CONTROL — a real second ground in hig, not the raised panel's own colour.
    expect(colorOf('light', 'surfaceWell')).not.toBe(colorOf('light', 'surfaceRaised'));
  });
});

describe('20.003 accentEdge — the primary button edge', () => {
  it('20.003 pinned, ≥ 3:1 on surface and surfaceRaised, and accentText on it ≥ 4.5', () => {
    for (const style of STYLES) {
      expect(colorOf('light', 'accentEdge', style)).toBe('#2d5488');
      expect(colorOf('dark', 'accentEdge', style)).toBe('#bcd4f7');
    }
    expect(declared('accentEdge', 'surface', 3)).toBe(true);
    expect(declared('accentEdge', 'surfaceRaised', 3)).toBe(true);
    expect(declared('accentText', 'accentEdge', 4.5)).toBe(true);
    for (const style of STYLES) {
      for (const theme of THEMES) {
        for (const bg of ['surface', 'surfaceRaised'] as const) {
          expect(
            contrastRatio(colorOf(theme, 'accentEdge', style), colorOf(theme, bg, style)),
            `${style}/${theme}: accentEdge on ${bg}`,
          ).toBeGreaterThanOrEqual(3);
          // CONTROL — the fill is itself visible; the edge is a second signal.
          expect(contrastRatio(colorOf(theme, 'accent', style), colorOf(theme, bg, style))).toBeGreaterThanOrEqual(3);
        }
        expect(
          contrastRatio(colorOf(theme, 'accentText', style), colorOf(theme, 'accentEdge', style)),
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});

describe('20.004 the accessible edge is `border`, and nothing uses lineStrong', () => {
  it('20.004 border is declared on raised and well grounds, and no role resolves to lineStrong', () => {
    expect(declared('border', 'surfaceRaised', 3)).toBe(true);
    expect(declared('border', 'surfaceWell', 3)).toBe(true);
    for (const style of STYLES) {
      for (const theme of THEMES) {
        for (const role of TOKEN_ROLES) {
          expect(colorOf(theme, role, style), `${style}/${theme}/${role} resolves to lineStrong`).not.toBe(
            primitives.lineStrong,
          );
        }
      }
    }
    // CONTROL — the mockup's finding, as a measurement: lineStrong fails the 3:1 edge rule.
    expect(contrastRatio(primitives.lineStrong, primitives.warmPaper)).toBeLessThan(3);
  });
});
```

(`primitives.warmPaper` exists at `tokens.ts:157`. `ruleExactly`/`parseRules`/`valueOf` are imported here for the reader's self-test; Tasks 2–7 use them against `ui.css`.)

- [ ] **Step 4: Run to see it fail.** Run `pnpm turbo run build`, then `cd packages/ui && pnpm exec vitest run --no-file-parallelism test/styling-tokens.test.ts > /tmp/styling-a-ui.log 2>&1; tail -20 /tmp/styling-a-ui.log`.
  - Expected: the reader's self-test PASSES; that is its control.
  - 20.001–20.003 FAIL, because `colorOf` returns `undefined` for an unknown role.
  - 20.004 FAILS on `declared('border', 'surfaceRaised', 3)`.
  - `pnpm --filter @gisik-nokma/ui typecheck` also fails on the unknown role names. That is expected RED.

- [ ] **Step 5: Implement.**
  1. In `primitives`, before `} as const;` (`tokens.ts:753`):

```ts
  /**
   * ## The styling refresh's grounds (Plan A Task 1, 2026-09-29)
   *
   * Transcribed from the owner-approved mockup (`Main.dc.html:130`, `:143`;
   * `Sheet.dc.html:111`, `:120`). The TRACK is the recessed ground that HOLDS
   * raised items on the page (a board column); the WELL is the recessed ground
   * INSIDE a raised panel (the sheet's field group). Both measure below 1.5:1
   * against the ground around them (1.08 / 1.10), on purpose: they are
   * identified by the `track` shadow (Task 2), not by fill — rule 04, "light
   * from above". Under neo both roles resolve to the neo surface, as every neo
   * ground does (depth is shadow-only there, `STYLE_COLOR_OVERRIDES` below).
   */
  trackWarm: '#e8ded4',
  trackNavy: '#10152a',
  wellWarm: '#f3ece5',
  wellNavy: '#1a213b',
  /**
   * The primary button's DARK edge (`Main.dc.html:132`, `accentEdge`). The
   * light edge is `textAccentLight` (`#2d5488`, above) byte-for-byte, so it is
   * reused rather than duplicated. 11.42:1 on `navyBase`, 9.41:1 on `navyRaised`.
   */
  accentEdgeDark: '#bcd4f7',
```

  2. In `TOKEN_ROLES`, after `'surfaceOverlay',`:

```ts
  /**
   * The recessed TRACK and WELL grounds — styling refresh Plan A Task 1. A
   * track holds raised items on the page ground (board columns); a well is a
   * recessed group inside a raised panel (the sheet's fields). Text on both is
   * a declared pair at 4.5 (see `CONTRAST_PAIRS`).
   */
  'surfaceTrack',
  'surfaceWell',
```

and after `'accentText',`:

```ts
  /**
   * The primary button's EDGE (rule 03: "edge ≥ 3:1") and its hover fill.
   * Declared ≥ 3 on `surface`/`surfaceRaised`, and `accentText` on it ≥ 4.5,
   * because the hovered primary paints its fill with this role.
   */
  'accentEdge',
```

  3. `themes.light`: add `surfaceTrack: 'trackWarm',` and `surfaceWell: 'wellWarm',` after `surfaceOverlay`, and `accentEdge: 'textAccentLight',` after `accentText`.
     `themes.dark`: add `surfaceTrack: 'trackNavy',` and `surfaceWell: 'wellNavy',`, and `accentEdge: 'accentEdgeDark',`.
  4. `STYLE_COLOR_OVERRIDES.neo.light`: add `surfaceTrack: 'neoPaper',` and `surfaceWell: 'neoPaper',` after `surfaceOverlay`. `.neo.dark`: add `surfaceTrack: 'neoNavy',` and `surfaceWell: 'neoNavy',`.
  5. Append to `CONTRAST_PAIRS`:

```ts
  /**
   * Styling refresh Plan A Task 1 (2026-09-29). The two recessed grounds carry
   * the three text tiers (rule 03), the primary's edge clears the non-text 3:1
   * on the grounds a button sits on (rule 03, "edge ≥ 3:1"), the hovered
   * primary's label clears 4.5 on its hover fill, and the quiet controls'
   * accessible edge (`border`) is declared on the raised and well grounds it
   * now also sits on — it was only ever declared on `surface`.
   */
  { fg: 'text', bg: 'surfaceTrack', minimum: 4.5 },
  { fg: 'textMuted', bg: 'surfaceTrack', minimum: 4.5 },
  { fg: 'textSubtle', bg: 'surfaceTrack', minimum: 4.5 },
  { fg: 'text', bg: 'surfaceWell', minimum: 4.5 },
  { fg: 'textMuted', bg: 'surfaceWell', minimum: 4.5 },
  { fg: 'textSubtle', bg: 'surfaceWell', minimum: 4.5 },
  { fg: 'accentEdge', bg: 'surface', minimum: 3 },
  { fg: 'accentEdge', bg: 'surfaceRaised', minimum: 3 },
  { fg: 'accentText', bg: 'accentEdge', minimum: 4.5 },
  { fg: 'border', bg: 'surfaceRaised', minimum: 3 },
  { fg: 'border', bg: 'surfaceWell', minimum: 3 },
```

  6. Amend 13.681 in `packages/ui/test/tokens.test.ts:1484`: `expect(CONTRAST_PAIRS.length).toBe(33);` → `expect(CONTRAST_PAIRS.length).toBe(44);`. Also change the comment above it (`:1481-1483`) to: `// The roster only GROWS: 33 until the styling refresh (Plan A Task 1, 2026-09-29) added 11 rows. A floor removed is a guarantee removed, and it would show here first.`

Measured on this palette before writing, so the minimums above are not guesses. The smallest margin in each family:
- `textSubtle` on `surfaceTrack`: 4.87 (hig light); on `surfaceWell`: 5.51 light and 6.09 dark;
- `accentEdge` on `surface`: 6.28 (hig light); in neo light, 6.44;
- `accentText` on `accentEdge`: 7.20 light, 11.42 dark;
- `border` on `surfaceRaised`: 4.39 (neo light).

- [ ] **Step 6: Run to see it pass** (same command). Then run the whole `packages/ui` suite: `cd packages/ui && pnpm exec vitest run --no-file-parallelism > /tmp/styling-a-ui.log 2>&1; tail -20 /tmp/styling-a-ui.log`.
  - `tokens.test.ts`'s declared-pairs loop (`:94-105`) now runs 11 × 6 more `it`s, and they must all pass.
  - The loop at `:199-212` sees the three new roles under every style × theme.
  - Run `pnpm --filter @gisik-nokma/ui typecheck` as well, and `cd apps/desktop && pnpm exec vitest run --no-file-parallelism src/theme.test.ts > /tmp/styling-a-desktop.log 2>&1; tail -20 /tmp/styling-a-desktop.log`. It asserts that `installTheme` emits `themeStylesheet()` whole (`theme.test.ts:103`).

- [ ] **Step 7: Catalogue.**
  - Flip 20.001–20.004 to ✅.
  - Amend 13.681 (`test-cases/13-owner-requests-and-backlog.md:2003`) by appending: "Amended 2026-09-29 by 20.001–20.004 (styling refresh Plan A): the roster is now 44 — eleven rows added for the track/well grounds, the primary's edge and the accessible edge on raised and well grounds; the size check still pins the exact count."
  - In `Features.md`, append at EOF:

```markdown

## 17. Styling system

The owner's twelve rules (2026-09-29), applied through the shared layers so every screen inherits them. Plan A: `docs/superpowers/plans/2026-09-29-styling-system-refresh.md`; Plan B: `…-refresh-b-screens.md`; cases `test-cases/20-styling-system.md`.

- ⚙️ **Recessed grounds and the accessible edge** (styling refresh Plan A Task 1; `packages/ui/src/tokens.ts`) — `surfaceTrack` (a track that holds raised items on the page — board columns) and `surfaceWell` (a recessed group inside a raised panel — the sheet's fields), both identified by their inset shadow rather than their fill (1.08/1.10:1, measured), with `text`/`textMuted`/`textSubtle` declared on each at 4.5; `accentEdge`, the primary button's ≥ 3:1 edge and hover fill; and `border` — already the accessible grey since the border sweep — now also declared on raised and well grounds. `lineStrong` (2.03:1) is resolved by no role, measured rather than assumed. `CONTRAST_PAIRS` 33 → 44. Cases 20.001–20.004.
```

  - Under `:32` (Design tokens), append: `  - ⚙️ **Styling refresh (2026-09-29):** three roles added (`surfaceTrack`, `surfaceWell`, `accentEdge`) and eleven contrast pairs (33 → 44); see §17. Cases 20.001–20.004.`

- [ ] **Step 8: Commit** `Styling A/Task 1: bucket §20; track, well and accent-edge roles + 11 contrast pairs (20.001-20.004)`. Then work through the mutations: mutate, show red, restore.

---

### Task 2: Depth, radius, spacing and motion tokens

**Files:**
- Modify: `packages/ui/src/tokens.ts`:
  - `ShadowLayer`, `:1236-1242`;
  - `ShadowRole`, `:1233`;
  - `SHADOWS`, `:1265-1358`;
  - `shadowLayerCss`, `:1360-1362`;
  - `SHADOW_ROLES`, `:1568`;
  - `RadiusRole`/`radii`, `:1092-1099`;
  - `RADIUS_ROLES`, `:1537`;
  - the first block of `themeStylesheet()`, `:1640`;
  - new primitives before `} as const;`.
- Modify: `packages/ui/test/tokens.test.ts`:
  - the declared set at `:135-141` (add `radiusVariableName('track')` and the space and motion names);
  - 13.411's `EXPECTED_SHADOW_ROLES` at `:364`.
- Modify: `packages/ui/test/styling-tokens.test.ts` (append), `test-cases/20-styling-system.md`, `Features.md`.

**Interfaces:**
- Consumes: Task 1's roles, and `helpers/css-rules.ts`.
- Produces:
  - `ShadowRole` gains `'lift' | 'lift-near' | 'lift-press' | 'lift-drag' | 'track' | 'action' | 'action-near' | 'action-press' | 'sheet'`. It is emitted as `--gn-shadow-lift` and so on. `lift-drag` was added 2026-09-29 (owner kanban rulings). It is the dragged card's shadow, deeper than `lift-near`, and Task 5A consumes it.
  - `ShadowLayer` gains `spread?: number`.
  - `RadiusRole` gains `'track'` (→ `--gn-radius-track`).
  - New exports:
    - `spacing` (`{ 1: '0.5rem', 2: '1rem', 3: '1.5rem' }`) and `spaceVariableName(step)` → `--gn-space-1..3`;
    - `motion` (`{ feedback: '100ms', move: '200ms', lift: '220ms', done: '300ms', 'ease-out': 'cubic-bezier(0.2, 0.8, 0.2, 1)' }`) and `motionVariableName(key)` → `--gn-motion-feedback`, `-move`, `-lift`, `-done`, `-ease-out`.

  All of these are emitted ONCE, under the bare `:root`, after the fonts.

Cases (`## 20.2 Tokens — depth, radius, spacing, motion`). The guard moves by **5**:

```markdown
- ❌ **20.011 — a shadow layer can carry a SPREAD, rendered as a fourth length (`0px 8px 16px -8px`), and every pre-existing layer renders byte-identically;** control: `sunken-compact` under neo still renders exactly `inset 2px 2px 4px #b098848c, inset -2px -2px 4px #fffffff2` (the value `tokens.test.ts:282-284` pins). Mutation: drop the spread term from `shadowLayerCss`.
- ❌ **20.012 — hig's nine new shadow roles are the mockup's values exactly, light and dark (lit edge + falling shadow; the near lift a 3-layer spread; press shallower; the track inset lit from above; the action shadows tinted by the accent in light), plus `lift-drag` — the dragged card, a 4-layer fall that reaches further than `lift-near` (40px down, 64px blur) built only from primitives the mockup roles already declare — and minimal renders `none` for all nine;** control: every new hig role is a different string from `raised`, and `lift-drag` differs from `lift-near`. Mutation: swap hig light `lift-near` and `lift-press`.
- ❌ **20.013 — neo expresses the same nine roles in its OWN dual-shadow language: `lift` = `raised`, `track` = `sunken`, `sheet` = `overlay`, `action-press` = `selected`, `action-near` = `raised`, `lift-near` is a LARGER raised pair than `lift` and `lift-drag` a larger one still (14/14/32), while `lift-press` and `action` are smaller;** control: no neo value contains a hig shadow primitive. Mutation: set neo light `lift` to hig's light `lift` layers.
- ❌ **20.014 — `radius.track` is the card radius plus the track's 8px padding in every style (hig/minimal 24px, neo 28px), so rule 05 (inner = outer − padding) holds per style;** control: `radius.card` is unchanged (16/16/20). Mutation: set neo's track to `24px`.
- ❌ **20.015 — the spacing steps (8/16/24) and the motion constants (100/200/220/300ms, `cubic-bezier(0.2, 0.8, 0.2, 1)`) are emitted exactly once, under the bare `:root`, and the stylesheet still opens with the font block;** control: no motion duration exceeds 300ms or falls below 100ms (rules 06). Mutation: emit them from `declarationsFor` instead (the count becomes 9 — one per style × theme block).
```

- [ ] **Step 1: Write the cases.** +5.

- [ ] **Step 2: Append the failing tests** to `packages/ui/test/styling-tokens.test.ts`:

```ts
import {
  SHADOW_ROLES,
  motion,
  motionVariableName,
  radiusOf,
  shadowValueOf,
  spaceVariableName,
  spacing,
  themeStylesheet,
} from '../src/tokens.js';

describe('20.011 a shadow layer can spread', () => {
  it('20.011 the spread renders as a fourth length, and the old layers render as before', () => {
    expect(shadowValueOf('hig', 'light', 'lift')).toContain('0px 8px 16px -8px');
    expect(shadowValueOf('neo', 'light', 'sunken-compact')).toBe(
      'inset 2px 2px 4px #b098848c, inset -2px -2px 4px #fffffff2',
    );
  });
});

const HIG_EXPECTED: Record<'light' | 'dark', Record<string, string>> = {
  light: {
    lift: 'inset 0px 1px 0px #ffffffe6, 0px 1px 2px #273a631f, 0px 8px 16px -8px #273a6338',
    'lift-near':
      'inset 0px 1px 0px #ffffffff, 0px 2px 4px #273a6314, 0px 12px 24px -6px #273a632e, 0px 28px 48px -16px #273a6347',
    'lift-press': 'inset 0px 1px 0px #ffffffe6, 0px 1px 2px #273a6324, 0px 4px 8px -4px #273a6333',
    // Added 2026-09-29 (owner kanban rulings, Task 5A): the dragged card.
    'lift-drag':
      'inset 0px 1px 0px #ffffffff, 0px 4px 8px #273a631f, 0px 20px 32px -8px #273a6338, 0px 40px 64px -20px #273a6347',
    track: 'inset 0px 2px 4px #b0988459, inset 0px -1px 0px #ffffff99',
    action: 'inset 0px 1px 0px #ffffff47, 0px 1px 2px #273a6340, 0px 8px 16px -6px #33629f73',
    'action-near':
      'inset 0px 1px 0px #ffffff66, 0px 2px 4px #273a6333, 0px 10px 20px -6px #33629f73, 0px 20px 36px -14px #33629f80',
    'action-press': 'inset 0px 2px 4px #1016254d, 0px 1px 1px #273a6333',
    sheet: 'inset 1px 0px 0px #ffffffe6, -24px 0px 48px -16px #273a6359',
  },
  dark: {
    lift: 'inset 0px 1px 0px #f2e9e112, 0px 1px 2px #00000080, 0px 8px 16px -8px #00000099',
    'lift-near':
      'inset 0px 1px 0px #f2e9e11f, 0px 2px 4px #00000059, 0px 12px 24px -6px #0000008c, 0px 28px 48px -16px #00000099',
    'lift-press': 'inset 0px 1px 0px #f2e9e112, 0px 1px 2px #0000008c, 0px 4px 8px -4px #00000080',
    'lift-drag':
      'inset 0px 1px 0px #f2e9e11f, 0px 4px 8px #00000059, 0px 20px 32px -8px #0000008c, 0px 40px 64px -20px #00000099',
    track: 'inset 0px 2px 4px #00000073, inset 0px -1px 0px #ffffff0a',
    action: 'inset 0px 1px 0px #ffffff73, 0px 1px 2px #00000080, 0px 8px 16px -6px #0000008c',
    'action-near':
      'inset 0px 1px 0px #ffffff8c, 0px 2px 4px #00000073, 0px 10px 20px -6px #00000099, 0px 20px 36px -14px #000000a6',
    'action-press': 'inset 0px 2px 4px #141a2e73, 0px 1px 1px #00000066',
    sheet: 'inset 1px 0px 0px #f2e9e114, -24px 0px 48px -16px #00000099',
  },
};
const NEW_ROLES = ['lift', 'lift-near', 'lift-press', 'lift-drag', 'track', 'action', 'action-near', 'action-press', 'sheet'] as const;

describe('20.012 hig takes the mockup, minimal takes none', () => {
  it('20.012 every new role, pinned exactly in both themes', () => {
    for (const theme of ['light', 'dark'] as const) {
      for (const role of NEW_ROLES) {
        expect(shadowValueOf('hig', theme, role), `hig/${theme}/${role}`).toBe(HIG_EXPECTED[theme][role]);
        expect(shadowValueOf('minimal', theme, role), `minimal/${theme}/${role}`).toBe('none');
        // CONTROL — a new role is a new value, not the old raised shadow renamed.
        expect(shadowValueOf('hig', theme, role)).not.toBe(shadowValueOf('hig', theme, 'raised'));
      }
      // CONTROL — the drag shadow is its own, deeper value, not the hover one renamed.
      expect(shadowValueOf('hig', theme, 'lift-drag')).not.toBe(shadowValueOf('hig', theme, 'lift-near'));
    }
    for (const role of NEW_ROLES) expect(SHADOW_ROLES).toContain(role);
  });
});

describe('20.013 neo speaks its own depth language', () => {
  it('20.013 reuses and scales neo’s dual shadows, never the hig drop shadow', () => {
    for (const theme of ['light', 'dark'] as const) {
      expect(shadowValueOf('neo', theme, 'lift')).toBe(shadowValueOf('neo', theme, 'raised'));
      expect(shadowValueOf('neo', theme, 'track')).toBe(shadowValueOf('neo', theme, 'sunken'));
      expect(shadowValueOf('neo', theme, 'sheet')).toBe(shadowValueOf('neo', theme, 'overlay'));
      expect(shadowValueOf('neo', theme, 'action-press')).toBe(shadowValueOf('neo', theme, 'selected'));
      expect(shadowValueOf('neo', theme, 'action-near')).toBe(shadowValueOf('neo', theme, 'raised'));
      expect(shadowValueOf('neo', theme, 'lift-near')).toMatch(/^10px 10px 24px /);
      expect(shadowValueOf('neo', theme, 'lift-drag')).toMatch(/^14px 14px 32px /);
      expect(shadowValueOf('neo', theme, 'lift-press')).toMatch(/^4px 4px 10px /);
      expect(shadowValueOf('neo', theme, 'action')).toMatch(/^4px 4px 10px /);
      // CONTROL — no hig primitive leaks into neo.
      for (const role of NEW_ROLES) {
        expect(shadowValueOf('neo', theme, role), `neo/${theme}/${role}`).not.toMatch(/#273a63|#33629f|#f2e9e11f/);
      }
    }
  });
});

describe('20.014 the track radius is the card radius plus the 8px padding', () => {
  it('20.014 per style', () => {
    for (const style of ['hig', 'minimal', 'neo'] as const) {
      const card = Number.parseFloat(radiusOf(style, 'card'));
      expect(Number.parseFloat(radiusOf(style, 'track')), style).toBe(card + 8);
    }
    // CONTROL — the card radius itself is unchanged.
    expect([radiusOf('hig', 'card'), radiusOf('minimal', 'card'), radiusOf('neo', 'card')]).toEqual(['16px', '16px', '20px']);
    expect(themeStylesheet()).toContain('--gn-radius-track: 28px;');
  });
});

describe('20.015 spacing and motion are emitted once, under the bare :root', () => {
  it('20.015 exact values, one declaration each, font block still first', () => {
    const stylesheet = themeStylesheet();
    expect(stylesheet.startsWith(':root { --gn-font-')).toBe(true);
    const firstBlock = stylesheet.split('\n')[0] ?? '';
    const expected: Array<[string, string]> = [
      [spaceVariableName(1), '0.5rem'],
      [spaceVariableName(2), '1rem'],
      [spaceVariableName(3), '1.5rem'],
      [motionVariableName('feedback'), '100ms'],
      [motionVariableName('move'), '200ms'],
      [motionVariableName('lift'), '220ms'],
      [motionVariableName('done'), '300ms'],
      [motionVariableName('ease-out'), 'cubic-bezier(0.2, 0.8, 0.2, 1)'],
    ];
    for (const [name, value] of expected) {
      const declaration = `${name}: ${value};`;
      expect(firstBlock, name).toContain(declaration);
      expect(stylesheet.split(declaration).length - 1, `${name} declared once`).toBe(1);
    }
    expect(spacing).toEqual({ 1: '0.5rem', 2: '1rem', 3: '1.5rem' });
    // CONTROL — rule 06: 150–300ms for a move, 100ms for feedback. Nothing outside 100–300.
    for (const key of ['feedback', 'move', 'lift', 'done'] as const) {
      const ms = Number.parseFloat(motion[key]);
      expect(ms).toBeGreaterThanOrEqual(100);
      expect(ms).toBeLessThanOrEqual(300);
    }
  });
});
```

(Merge the new names into the file's single `../src/tokens.js` import rather than adding a second import statement.)

- [ ] **Step 3: Run to see it fail** (the Task 1 command). Expected: the new imports do not exist, so the file fails to compile and every case in it is RED. Paste the summary line.

- [ ] **Step 4: Implement.**
  1. Primitives, before `} as const;`:

```ts
  /**
   * ## The styling refresh's depth (Plan A Task 2, 2026-09-29) — hig only
   *
   * Every value is the owner-approved mockup's own rgba, converted to 8-digit
   * hex (alpha × 255, rounded): `Main.dc.html:133-140` (dark) and `:146-153`
   * (light), `Sheet.dc.html:118`/`:127` (the sheet). Names start `shadow`, so
   * case 13.338's sweep (`tokens.test.ts:229`) sees every one. neo reuses its
   * OWN primitives above (`shadowNeo*`) and minimal draws none.
   */
  shadowLitLight: '#ffffffe6',
  shadowLitNearLight: '#ffffffff',
  shadowFallLight1: '#273a631f',
  shadowFallLight2: '#273a6338',
  shadowFallNearLight1: '#273a6314',
  shadowFallNearLight2: '#273a632e',
  shadowFallNearLight3: '#273a6347',
  shadowFallPressLight1: '#273a6324',
  shadowFallPressLight2: '#273a6333',
  shadowTrackLight: '#b0988459',
  shadowTrackLitLight: '#ffffff99',
  shadowActionLitLight: '#ffffff47',
  shadowActionFallLight: '#273a6340',
  shadowActionGlowLight: '#33629f73',
  shadowActionLitNearLight: '#ffffff66',
  shadowActionGlowNearLight: '#33629f80',
  shadowActionPressLight: '#1016254d',
  shadowSheetLight: '#273a6359',
  shadowLitDark: '#f2e9e112',
  shadowLitNearDark: '#f2e9e11f',
  shadowFallDark1: '#00000080',
  shadowFallDark2: '#00000099',
  shadowFallNearDark1: '#00000059',
  shadowFallNearDark2: '#0000008c',
  shadowTrackDark: '#00000073',
  shadowTrackLitDark: '#ffffff0a',
  shadowActionLitDark: '#ffffff73',
  shadowActionLitNearDark: '#ffffff8c',
  shadowActionFallNearDark: '#000000a6',
  shadowActionPressDark: '#141a2e73',
  shadowActionPressFallDark: '#00000066',
  shadowSheetLitDark: '#f2e9e114',
```

  2. `ShadowRole` (`:1233`):

```ts
export type ShadowRole =
  | 'raised'
  | 'sunken'
  | 'overlay'
  | 'sunken-compact'
  | 'selected'
  | 'lift'
  | 'lift-near'
  | 'lift-press'
  | 'lift-drag'
  | 'track'
  | 'action'
  | 'action-near'
  | 'action-press'
  | 'sheet';
```

  3. `ShadowLayer` gains `spread?: number;` after `blur: number;`, and `shadowLayerCss` becomes:

```ts
function shadowLayerCss(layer: ShadowLayer): string {
  const spread = layer.spread === undefined ? '' : ` ${layer.spread}px`;
  return `${layer.inset ? 'inset ' : ''}${layer.x}px ${layer.y}px ${layer.blur}px${spread} ${primitives[layer.colour]}`;
}
```

  4. In `SHADOWS`, add these keys to each style × theme object. Put them after `selected` in hig and neo, and inside minimal's one-line objects:
     - **hig.light:**

```ts
      /** Styling refresh (Plan A Task 2) — `Main.dc.html:146` `lift`. */
      lift: [
        { x: 0, y: 1, blur: 0, colour: 'shadowLitLight', inset: true },
        { x: 0, y: 1, blur: 2, colour: 'shadowFallLight1' },
        { x: 0, y: 8, blur: 16, spread: -8, colour: 'shadowFallLight2' },
      ],
      /** `:148` `near` — the lift TOWARD the user: brighter lit edge, 3-layer spreading fall. */
      'lift-near': [
        { x: 0, y: 1, blur: 0, colour: 'shadowLitNearLight', inset: true },
        { x: 0, y: 2, blur: 4, colour: 'shadowFallNearLight1' },
        { x: 0, y: 12, blur: 24, spread: -6, colour: 'shadowFallNearLight2' },
        { x: 0, y: 28, blur: 48, spread: -16, colour: 'shadowFallNearLight3' },
      ],
      /** `:149` `press`. */
      'lift-press': [
        { x: 0, y: 1, blur: 0, colour: 'shadowLitLight', inset: true },
        { x: 0, y: 1, blur: 2, colour: 'shadowFallPressLight1' },
        { x: 0, y: 4, blur: 8, spread: -4, colour: 'shadowFallPressLight2' },
      ],
      /**
       * Added 2026-09-29 (owner kanban rulings; Task 5A). The DRAGGED card is
       * lifted furthest toward the user: `lift-near`'s lit edge, with a fall that
       * reaches further and softer (40px down, 64px blur). The mockup draws no
       * drag state, so this reuses the mockup's own primitives and adds none.
       */
      'lift-drag': [
        { x: 0, y: 1, blur: 0, colour: 'shadowLitNearLight', inset: true },
        { x: 0, y: 4, blur: 8, colour: 'shadowFallLight1' },
        { x: 0, y: 20, blur: 32, spread: -8, colour: 'shadowFallLight2' },
        { x: 0, y: 40, blur: 64, spread: -20, colour: 'shadowFallNearLight3' },
      ],
      /** `:150` `recess` — the track, lit from above (dark top inset, light bottom lip). */
      track: [
        { x: 0, y: 2, blur: 4, colour: 'shadowTrackLight', inset: true },
        { x: 0, y: -1, blur: 0, colour: 'shadowTrackLitLight', inset: true },
      ],
      /** `:153` `btnShadow`. */
      action: [
        { x: 0, y: 1, blur: 0, colour: 'shadowActionLitLight', inset: true },
        { x: 0, y: 1, blur: 2, colour: 'shadowActionFallLight' },
        { x: 0, y: 8, blur: 16, spread: -6, colour: 'shadowActionGlowLight' },
      ],
      /** `:151` `btnNear`. */
      'action-near': [
        { x: 0, y: 1, blur: 0, colour: 'shadowActionLitNearLight', inset: true },
        { x: 0, y: 2, blur: 4, colour: 'shadowFallPressLight2' },
        { x: 0, y: 10, blur: 20, spread: -6, colour: 'shadowActionGlowLight' },
        { x: 0, y: 20, blur: 36, spread: -14, colour: 'shadowActionGlowNearLight' },
      ],
      /** `:152` `btnPress` — pushed back into its track. */
      'action-press': [
        { x: 0, y: 2, blur: 4, colour: 'shadowActionPressLight', inset: true },
        { x: 0, y: 1, blur: 1, colour: 'shadowFallPressLight2' },
      ],
      /** `Sheet.dc.html:127` `sheetShadow` — lit inner left edge, shadow falls to the left. */
      sheet: [
        { x: 1, y: 0, blur: 0, colour: 'shadowLitLight', inset: true },
        { x: -24, y: 0, blur: 48, spread: -16, colour: 'shadowSheetLight' },
      ],
```

     - **hig.dark:**

```ts
      lift: [
        { x: 0, y: 1, blur: 0, colour: 'shadowLitDark', inset: true },
        { x: 0, y: 1, blur: 2, colour: 'shadowFallDark1' },
        { x: 0, y: 8, blur: 16, spread: -8, colour: 'shadowFallDark2' },
      ],
      'lift-near': [
        { x: 0, y: 1, blur: 0, colour: 'shadowLitNearDark', inset: true },
        { x: 0, y: 2, blur: 4, colour: 'shadowFallNearDark1' },
        { x: 0, y: 12, blur: 24, spread: -6, colour: 'shadowFallNearDark2' },
        { x: 0, y: 28, blur: 48, spread: -16, colour: 'shadowFallDark2' },
      ],
      'lift-press': [
        { x: 0, y: 1, blur: 0, colour: 'shadowLitDark', inset: true },
        { x: 0, y: 1, blur: 2, colour: 'shadowFallNearDark2' },
        { x: 0, y: 4, blur: 8, spread: -4, colour: 'shadowFallDark1' },
      ],
      'lift-drag': [
        { x: 0, y: 1, blur: 0, colour: 'shadowLitNearDark', inset: true },
        { x: 0, y: 4, blur: 8, colour: 'shadowFallNearDark1' },
        { x: 0, y: 20, blur: 32, spread: -8, colour: 'shadowFallNearDark2' },
        { x: 0, y: 40, blur: 64, spread: -20, colour: 'shadowFallDark2' },
      ],
      track: [
        { x: 0, y: 2, blur: 4, colour: 'shadowTrackDark', inset: true },
        { x: 0, y: -1, blur: 0, colour: 'shadowTrackLitDark', inset: true },
      ],
      action: [
        { x: 0, y: 1, blur: 0, colour: 'shadowActionLitDark', inset: true },
        { x: 0, y: 1, blur: 2, colour: 'shadowFallDark1' },
        { x: 0, y: 8, blur: 16, spread: -6, colour: 'shadowFallNearDark2' },
      ],
      'action-near': [
        { x: 0, y: 1, blur: 0, colour: 'shadowActionLitNearDark', inset: true },
        { x: 0, y: 2, blur: 4, colour: 'shadowTrackDark' },
        { x: 0, y: 10, blur: 20, spread: -6, colour: 'shadowFallDark2' },
        { x: 0, y: 20, blur: 36, spread: -14, colour: 'shadowActionFallNearDark' },
      ],
      'action-press': [
        { x: 0, y: 2, blur: 4, colour: 'shadowActionPressDark', inset: true },
        { x: 0, y: 1, blur: 1, colour: 'shadowActionPressFallDark' },
      ],
      sheet: [
        { x: 1, y: 0, blur: 0, colour: 'shadowSheetLitDark', inset: true },
        { x: -24, y: 0, blur: 48, spread: -16, colour: 'shadowFallDark2' },
      ],
```

     - **minimal.light** and **minimal.dark**: add `lift: [], 'lift-near': [], 'lift-press': [], 'lift-drag': [], track: [], action: [], 'action-near': [], 'action-press': [], sheet: []` inside each one-line object.
     - **neo.light:**

```ts
      /** Styling refresh — neo's own language: the card at rest IS `raised`. */
      lift: [
        { x: 7, y: 7, blur: 16, colour: 'shadowNeoRaisedDarkLight' },
        { x: -7, y: -7, blur: 16, colour: 'shadowNeoHighlightLight' },
      ],
      /** Toward the user: the same pair, thrown further. */
      'lift-near': [
        { x: 10, y: 10, blur: 24, colour: 'shadowNeoRaisedDarkLight' },
        { x: -10, y: -10, blur: 24, colour: 'shadowNeoHighlightLight' },
      ],
      'lift-press': [
        { x: 4, y: 4, blur: 10, colour: 'shadowNeoRaisedDarkLight' },
        { x: -4, y: -4, blur: 10, colour: 'shadowNeoHighlightLight' },
      ],
      /** Dragged (2026-09-29, Task 5A): the raised pair thrown further still. */
      'lift-drag': [
        { x: 14, y: 14, blur: 32, colour: 'shadowNeoRaisedDarkLight' },
        { x: -14, y: -14, blur: 32, colour: 'shadowNeoHighlightLight' },
      ],
      /** The track IS neo's `sunken` tray. */
      track: [
        { x: 4, y: 4, blur: 9, colour: 'shadowNeoSunkenDarkLight', inset: true },
        { x: -4, y: -4, blur: 9, colour: 'shadowNeoHighlightLight', inset: true },
      ],
      action: [
        { x: 4, y: 4, blur: 10, colour: 'shadowNeoRaisedDarkLight' },
        { x: -4, y: -4, blur: 10, colour: 'shadowNeoHighlightLight' },
      ],
      'action-near': [
        { x: 7, y: 7, blur: 16, colour: 'shadowNeoRaisedDarkLight' },
        { x: -7, y: -7, blur: 16, colour: 'shadowNeoHighlightLight' },
      ],
      /** Pushed in: neo's own `selected` inset. */
      'action-press': [
        { x: 3, y: 3, blur: 6, colour: 'shadowNeoRaisedDarkLight', inset: true },
        { x: -3, y: -3, blur: 6, colour: 'shadowNeoHighlightLight', inset: true },
      ],
      sheet: [
        { x: 7, y: 7, blur: 16, colour: 'shadowNeoRaisedDarkLight' },
        { x: -7, y: -7, blur: 16, colour: 'shadowNeoHighlightLight' },
      ],
```

     - **neo.dark:** the same geometry with neo's dark primitives:
       - `shadowNeoRaisedDarkDark`/`shadowNeoRaisedHighlightDark` for `lift`, `lift-near`, `lift-press`, `lift-drag` (14/14/32), `action`, `action-near` and `sheet`;
       - `shadowNeoSunkenDarkDark`/`shadowNeoSunkenHighlightDark` (inset, 4/4/9) for `track`;
       - `shadowNeoSunkenCompactDarkDark`/`shadowNeoSunkenHighlightDark` (inset, 3/3/6) for `action-press`. That is exactly `SHADOWS.neo.dark.selected`, `tokens.ts:1352-1355`.
  5. `SHADOW_ROLES` (`:1568`):

```ts
export const SHADOW_ROLES: readonly ShadowRole[] = [
  'raised',
  'sunken',
  'overlay',
  'sunken-compact',
  'selected',
  'lift',
  'lift-near',
  'lift-press',
  'lift-drag',
  'track',
  'action',
  'action-near',
  'action-press',
  'sheet',
];
```

  6. Radius. `export type RadiusRole = 'card' | 'control' | 'track';`, and in `radii`:
     - `hig: { card: '16px', control: '8px', track: '24px' }`;
     - `minimal: { card: '16px', control: '8px', track: '24px' }`;
     - `neo: { card: '20px', control: '14px', track: '28px' }`.

     Then `const RADIUS_ROLES: readonly RadiusRole[] = ['card', 'control', 'track'];`. Above `radii`, add the docblock: `/** \`track\` (styling refresh, 2026-09-29) = card + 8: a track pads its cards by 8px, and rule 05 says inner radius = outer − padding (16 = 24 − 8; neo 20 = 28 − 8). */`
  7. Spacing and motion, after `fontVariableName` (`:1147-1149`):

```ts
/**
 * The 8-pt grid and the motion constants (styling refresh Plan A Task 2,
 * rules "02 Spacing — 24 around, 16 between groups, 8 between lines" and
 * "06 Motion — feedback in 100ms, done in 300; 150–300ms, ease-out"). Neither
 * varies by style or theme, so — like the fonts — they are emitted ONCE under
 * the bare `:root` (`themeStylesheet`'s first block), never per style×theme.
 */
export const spacing = { 1: '0.5rem', 2: '1rem', 3: '1.5rem' } as const;
export type SpaceStep = keyof typeof spacing;
export function spaceVariableName(step: SpaceStep): string {
  return `--gn-space-${step}`;
}

export const motion = {
  feedback: '100ms',
  move: '200ms',
  lift: '220ms',
  done: '300ms',
  'ease-out': 'cubic-bezier(0.2, 0.8, 0.2, 1)',
} as const;
export type MotionKey = keyof typeof motion;
export function motionVariableName(key: MotionKey): string {
  return `--gn-motion-${key}`;
}
```

  8. `themeStylesheet()`'s first block (`:1640`) becomes:

```ts
    `:root { ${FONT_ROLES.map((role) => `${fontVariableName(role)}: ${fontStackOf(role)};`).join(' ')} ${(
      Object.keys(spacing) as unknown as SpaceStep[]
    )
      .map((step) => `${spaceVariableName(step)}: ${spacing[step]};`)
      .join(' ')} ${(Object.keys(motion) as MotionKey[])
      .map((key) => `${motionVariableName(key)}: ${motion[key]};`)
      .join(' ')} }`,
```

(`Object.keys` returns strings, so `spacing[step]` indexes by `'1'`. That works at runtime because object keys ARE strings, but the `SpaceStep` cast keeps it typed.)

  9. `tokens.test.ts`:
     - Add `radiusVariableName('track'),` to the declared set at `:137-138`. After `...FONT_ROLE_NAMES.map(fontVariableName),` add `...([1, 2, 3] as const).map(spaceVariableName),` and `...(['feedback', 'move', 'lift', 'done', 'ease-out'] as const).map(motionVariableName),`. Import both functions.
     - In 13.411 (`:364`), extend the literal: `const EXPECTED_SHADOW_ROLES = ['raised', 'sunken', 'overlay', 'sunken-compact', 'selected', 'lift', 'lift-near', 'lift-press', 'lift-drag', 'track', 'action', 'action-near', 'action-press', 'sheet'] as const;`. Add one comment line: `// The nine styling-refresh roles added 2026-09-29 (Plan A Task 2, 20.012; lift-drag for Task 5A) — added HERE by hand, which is the point of this literal.`

- [ ] **Step 5: Run to see it pass**: the file, then all of `packages/ui`, then `pnpm --filter @gisik-nokma/ui typecheck` and the desktop theme test.
  - `tokens.test.ts:255-260` (minimal renders `none` for every `SHADOW_ROLES` entry) now covers the nine new roles, and it must pass.
  - `:229-253` (every `shadow*` primitive is 8-digit and names no contrast pair) must pass.

- [ ] **Step 6: Catalogue.** Flip 20.011–20.015. Append to §17:

```markdown
- ⚙️ **Depth, radius, spacing and motion tokens** (styling refresh Plan A Task 2; `packages/ui/src/tokens.ts`) — nine shadow roles (`lift`, `lift-near`, `lift-press`, `lift-drag`, `track`, `action`, `action-near`, `action-press`, `sheet`): hig takes the owner-approved mockup's values exactly (lit top edge, shadow falling down, a 3-layer spreading "near" shadow for a hovered card), plus `lift-drag`, a deeper 4-layer fall for a DRAGGED card built from the same primitives, neo expresses each in its own dual-shadow language (rest = `raised`, track = `sunken`, press = `selected`, the near lift a larger raised pair and the drag lift larger still), and minimal stays flat (`none`); a shadow layer can now carry a spread. `radius.track` = card + 8 per style (rule 05). `--gn-space-1/2/3` (8/16/24) and `--gn-motion-feedback/move/lift/done/ease-out` (100/200/220/300ms, `cubic-bezier(0.2, 0.8, 0.2, 1)`) are emitted once under the bare `:root`, so `apps/desktop` receives them through `installTheme` too. Cases 20.011–20.015.
```

- [ ] **Step 7: Commit** `Styling A/Task 2: depth/radius/spacing/motion tokens (20.011-20.015)`. Then mutate, show red, restore.

---

### Task 3: The shared `Button` — a 48px primary that lifts toward the user, a quiet outlined ghost, a matching danger

**Files:**
- Modify: `packages/ui/src/ui.css`:
  - `.gn-button`, `:61-113`: the rule AND its comment blocks `:52-60` and `:70-106`;
  - `.gn-button--primary` and `.gn-button--danger`, `:118-125`;
  - `.gn-button--ghost`, `:6046-6064` (its comment and rule).
- Create: `packages/ui/test/styling-buttons.test.ts`.
- Modify: `packages/ui/test/components.test.tsx:587-594` (13.289).
- Modify: `test-cases/13-hig-per-screen.md:591` (13.289) and `:156` (13.284) prose, `test-cases/20-styling-system.md`, `Features.md`.

**Interfaces:**
- Consumes: Task 1 (`--gn-accent-edge`); Task 2 (`--gn-shadow-action*`, `--gn-shadow-lift*`, `--gn-motion-*`).
- Produces: pattern **P-PRIMARY**, the `Button variant="primary"` rendering, and pattern **P-QUIET**, the `Button` ghost rendering. Plan B relies on both by name. `button.tsx` is NOT changed: it has no pending state (D8), and it already emits `gn-button gn-button--<variant>` (`button.tsx:12-13`).

**Every current primary usage** (D5). `git grep 'variant="primary"'` on `origin/release/trash`, tests excluded, finds 26 usages in 21 files. The Plan B task that owns each screen measures it at 48px in its browser case:

| Usage | Plan B owner |
|---|---|
| `apps/web/app/invite/[token]/page.tsx:137`, `:191` | Auth surfaces |
| `apps/web/app/sign-in/page.tsx:335`, `:357`, `:420` | Auth surfaces |
| `apps/web/app/w/[workspaceId]/members/page.tsx:956` | Members + invites |
| `apps/web/app/w/[workspaceId]/page.tsx:907`, `:1253` | Workspace home |
| `apps/web/app/workspaces/page.tsx:726`, `:853` | Workspaces list |
| `apps/web/src/account/profile-section.tsx:79`; `packages/app-core/src/account/passkeys-section.tsx:147` | Account |
| `apps/web/src/notes/create-note-dialog.tsx:196`, `draft-restore-banner.tsx:34`, `scope-editor.tsx:159` | Notes |
| `apps/web/src/workspace-settings-form.tsx:439` | Settings |
| `packages/app-core/src/views/create-ticket-flow.tsx:488` (the board header's **New ticket**) | **this plan, Task 5's browser check** |
| `packages/app-core/src/views/bulk-close-dialog.tsx:274`, `new-ticket-dialog.tsx:1288`, `reopen-dialog.tsx:130`, `transition-dialog.tsx:583`, `visibility-editor.tsx:638` | Dialogs and overlays |
| `packages/app-core/src/workflow-builder/ticket-types/ticket-type-editor-screen.tsx:195`, `ticket-type-list-screen.tsx:385`; `packages/app-core/src/workflow-builder/ui/publish-controls.tsx:225`, `workflow-list-screen.tsx:214` | Workflow builder + ticket types |

**Compound selectors that out-rank the variants.** A `.gn-button` rule scoped under another class has specificity (0,2,0), so it BEATS `.gn-button--primary` (0,1,0) and would silently hold a primary or danger at 44px. A comment-blind scan of both stylesheets finds these, plus two primary `className`s. Each has a Plan B owner, and none may be left to override the variant:

| Rule | What it overrides | Plan B owner and fix |
|---|---|---|
| `apps/web/app/globals.css:4268` `.gn-delete-dialog__actions .gn-button { min-height: 2.75rem; padding-inline: 1rem; }` | the **danger** confirm in `DeleteDialog`: it would stay 44px with 16px sides | B3: delete the rule, so the variants size themselves (Cancel is 44 through the base) |
| `globals.css:4365` `.gn-deleted-items__actions .gn-button { min-height: 2.75rem; }` | nothing today: Deleted items' row actions are quiet | B17: kept; the 20.592 count confirms no primary renders there |
| `globals.css:1295`, `:1296-1298`, `:1300-1302` `.gn-project-card__actions .gn-button:hover:not(:disabled)` (a brightness filter, light and two dark arms) | the ghost's own hover fill on the project card's Archive | B13: delete all three (one hover vocabulary) |
| `globals.css:1422` `.gn-workspace-founding__submit` and `ui.css:3244` `.publish-controls__publish` | layout only (`align-self: flex-start`) | none: they set no size |

Cases (`## 20.3 The shared Button`). The guard moves by **6**:

```markdown
- ❌ **20.021 — the primary Button is 48px tall with 24px side padding, a 17px semibold label, a pill radius, a 10px gap for its one icon, the accent fill and a 1px `accentEdge` edge on the `action` shadow (rules 01, 02, 03, 05);** control: the base Button — every quiet control — keeps the 44px floor. Mutation: set `.gn-button--primary`'s `min-height` to `2.75rem`.
- ❌ **20.022 — the primary Button comes toward the user on hover (`scale(1.04)`, `action-near`, the `accentEdge` fill) and is pushed back on press (`scale(0.98)`, `action-press`, in the 100ms feedback time), growing from `50% 60%`;** control: the resting primary declares no transform. Mutation: change the hover `scale(1.04)` to `scale(1)`.
- ❌ **20.023 — under `prefers-reduced-motion: reduce` the Button has no transition and the primary and danger hover/press transforms are `none`, written with the SAME selectors as the rules they cancel so the cancellation wins on source order;** control: outside the media arm the base transition names only `--gn-motion-*` durations. Mutation: drop `.gn-button--primary:hover:not(:disabled)` from the reduced-motion group.
- ❌ **20.024 — the ghost Button (every quiet control) is transparent with a 1px `border` edge — the accessible grey, ≥ 3:1 (20.004) — a `textMuted` 600 label and a soft `fillQuaternary` fill on hover;** control: the base rule paints no border, so a primary or danger never inherits the grey edge. Mutation: set the ghost's `border` to `none`.
- ❌ **20.025 — the danger Button shares the primary's geometry (48px, 24px, 17px) and its lift pair, on the NEUTRAL `lift` shadows rather than the accent-tinted `action` ones;** control: danger's resting shadow differs from primary's. Mutation: set `.gn-button--danger`'s `min-height` to `2.75rem`.
- ❌ **20.026 — motion discipline: no rule in `ui.css` declares `will-change` (a permanent containing block — the hazard recorded in D21, retired for the card hover but still true of `will-change`), and every Button transition names `--gn-motion-*` durations with the `--gn-motion-ease-out` curve;** control: the scan reads a stylesheet that does declare transitions. Mutation: add `will-change: transform;` to `.gn-button--primary`.
```

- [ ] **Step 1: Write the cases.** +6.

- [ ] **Step 2: Write the failing test** `packages/ui/test/styling-buttons.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseRules, readUiCss, ruleExactly, valueOf } from './helpers/css-rules.js';

/**
 * Styling refresh Plan A, Task 3 — cases 20.021–20.026 (§20.3). The owner's
 * button rules 01–06, the approved primary (`Buttons.dc.html:13-19`, `:52`)
 * and the quiet outlined control (`Main.dc.html:54`).
 */
const CSS = readUiCss();
const REDUCE = '@media (prefers-reduced-motion: reduce)';
const LIFT_SELECTORS = [
  '.gn-button--primary:hover:not(:disabled)',
  '.gn-button--primary:active:not(:disabled)',
  '.gn-button--danger:hover:not(:disabled)',
  '.gn-button--danger:active:not(:disabled)',
] as const;

describe('20.021 the primary Button — size, label, edge, radius', () => {
  it('20.021 48px, 24px sides, 17px semibold, pill, 10px icon gap, accent fill with its edge', () => {
    const primary = ruleExactly(CSS, '.gn-button--primary');
    const base = ruleExactly(CSS, '.gn-button');
    expect(valueOf(primary, 'min-height')).toBe('3rem');
    expect(valueOf(primary, 'padding')).toBe('0 1.5rem');
    expect(valueOf(primary, 'font-size')).toBe('1.0625rem');
    expect(valueOf(primary, 'border')).toBe('1px solid var(--gn-accent-edge)');
    expect(valueOf(primary, 'background')).toBe('var(--gn-accent)');
    expect(valueOf(primary, 'color')).toBe('var(--gn-accent-text)');
    expect(valueOf(primary, 'box-shadow')).toBe('var(--gn-shadow-action)');
    expect(valueOf(base, 'font-weight')).toBe('600');
    expect(valueOf(base, 'border-radius')).toBe('999px');
    expect(valueOf(base, 'gap')).toBe('0.625rem');
    // CONTROL — the quiet controls keep the 44px floor.
    expect(valueOf(base, 'min-height')).toBe('2.75rem');
  });
});

describe('20.022 the primary Button lifts toward the user', () => {
  it('20.022 hover 1.04 + near, press 0.98 + press in 100ms, from 50% 60%', () => {
    const hover = ruleExactly(CSS, '.gn-button--primary:hover:not(:disabled)');
    const press = ruleExactly(CSS, '.gn-button--primary:active:not(:disabled)');
    expect(valueOf(hover, 'transform')).toBe('scale(1.04)');
    expect(valueOf(hover, 'box-shadow')).toBe('var(--gn-shadow-action-near)');
    expect(valueOf(hover, 'background')).toBe('var(--gn-accent-edge)');
    expect(valueOf(press, 'transform')).toBe('scale(0.98)');
    expect(valueOf(press, 'box-shadow')).toBe('var(--gn-shadow-action-press)');
    expect(valueOf(press, 'transition-duration')).toBe('var(--gn-motion-feedback)');
    expect(valueOf(ruleExactly(CSS, '.gn-button'), 'transform-origin')).toBe('50% 60%');
    // CONTROL — at rest, no transform.
    expect(valueOf(ruleExactly(CSS, '.gn-button--primary'), 'transform')).toBeNull();
  });
});

describe('20.023 reduced motion turns the lift off', () => {
  it('20.023 no transition, and the four lift selectors cancel their transform with the same specificity', () => {
    expect(valueOf(ruleExactly(CSS, '.gn-button', REDUCE), 'transition')).toBe('none');
    expect(valueOf(ruleExactly(CSS, LIFT_SELECTORS, REDUCE), 'transform')).toBe('none');
    // CONTROL — outside the arm the transition is real and names the motion tokens.
    const transition = valueOf(ruleExactly(CSS, '.gn-button'), 'transition') ?? '';
    expect(transition).toContain('var(--gn-motion-feedback)');
    expect(transition).toContain('var(--gn-motion-move) var(--gn-motion-ease-out)');
  });
});

describe('20.024 the ghost Button is quiet and outlined with the accessible edge', () => {
  it('20.024 transparent, 1px border role, text2 label, soft hover fill', () => {
    const ghost = ruleExactly(CSS, '.gn-button--ghost');
    expect(valueOf(ghost, 'background')).toBe('transparent');
    expect(valueOf(ghost, 'border')).toBe('1px solid var(--gn-border)');
    expect(valueOf(ghost, 'color')).toBe('var(--gn-text-muted)');
    expect(valueOf(ghost, 'font-weight')).toBe('600');
    expect(valueOf(ruleExactly(CSS, '.gn-button--ghost:hover:not(:disabled)'), 'background')).toBe(
      'var(--gn-fill-quaternary)',
    );
    // CONTROL — the base paints no border.
    expect(valueOf(ruleExactly(CSS, '.gn-button'), 'border')).toBe('none');
  });
});

describe('20.025 the danger Button matches the primary geometry on neutral depth', () => {
  it('20.025 same size and lift, lift shadows not action shadows', () => {
    const danger = ruleExactly(CSS, '.gn-button--danger');
    const primary = ruleExactly(CSS, '.gn-button--primary');
    for (const property of ['min-height', 'padding', 'font-size']) {
      expect(valueOf(danger, property), property).toBe(valueOf(primary, property));
    }
    expect(valueOf(danger, 'box-shadow')).toBe('var(--gn-shadow-lift)');
    expect(valueOf(ruleExactly(CSS, '.gn-button--danger:hover:not(:disabled)'), 'transform')).toBe('scale(1.04)');
    expect(valueOf(ruleExactly(CSS, '.gn-button--danger:active:not(:disabled)'), 'transform')).toBe('scale(0.98)');
    // CONTROL — not the accent-tinted action shadow.
    expect(valueOf(danger, 'box-shadow')).not.toBe(valueOf(primary, 'box-shadow'));
  });
});

describe('20.026 motion discipline', () => {
  it('20.026 no will-change anywhere; Button transitions name the motion tokens', () => {
    const rules = parseRules(CSS);
    // CONTROL — the scan is reading a stylesheet that has transitions at all.
    expect(rules.filter((rule) => valueOf(rule.body, 'transition') !== null).length).toBeGreaterThan(5);
    for (const rule of rules) {
      expect(valueOf(rule.body, 'will-change'), rule.selectors.join(', ')).toBeNull();
    }
    const transition = valueOf(ruleExactly(CSS, '.gn-button'), 'transition') ?? '';
    expect(transition).not.toMatch(/\d+m?s/);
  });
});
```

- [ ] **Step 3: Run to see it fail.** Build, then `cd packages/ui && pnpm exec vitest run --no-file-parallelism test/styling-buttons.test.ts > /tmp/styling-a-ui.log 2>&1; tail -20 /tmp/styling-a-ui.log`.
  - 20.021–20.025 FAIL.
  - 20.026's `will-change` arm PASSES: there is none today, and that is its control. Its transition arm FAILS, because `ruleExactly` finds no transition.

- [ ] **Step 4: Implement.**
  1. Replace `.gn-button`'s comment and rule (`ui.css:52-113`, from the `/* \`min-height: 2.75rem\` = 44px` comment through the rule's closing brace) with:

```css
/* ── THE SHARED BUTTON — styling refresh Plan A Task 3 (2026-09-29) ─────────
   The owner's button rules (plan: `docs/superpowers/plans/2026-09-29-styling-
   system-refresh.md`, "Design source"): 01 Size 48/24 (primary), 02 Label 17px
   semibold, 03 label ≥ 4.5 and EDGE ≥ 3:1, 04 lit edge + falling shadow,
   05 radius = height ÷ 2 and one icon 10px from the label, 06 feedback in
   100ms, done in 300.

   This base rule is the QUIET control every variant starts from: 44px
   (`min-height: 2.75rem`, WCAG 2.5.5 — the floor this rule has carried since
   it was measured SIX pixels short at 390px), a pill (radius = height ÷ 2 at
   any height), a 10px gap so an icon child sits 10px from its label, and no
   border — the ghost modifier adds the accessible edge, the primary its accent
   edge, so neither inherits the other's.

   ⚠ R1(c) (2026-09-08) removed every control border and identified a control
   by its fill plus an accent label. Rule 03 supersedes it for BUTTONS: the fill
   measured 1.09–1.15:1 against every surface (this block recorded that number
   itself), i.e. it vanished. The ghost now carries a 1px `--gn-border` edge
   (4.27–6.01:1) and a `--gn-text-muted` label — the accent is "saved for the
   action" (layout rule 03). Cases 20.021–20.026; 13.289/13.284 amended.

   No `[data-style]` block may touch this family (13.340): per-style depth
   reaches a button only through `--gn-shadow-action*`/`--gn-shadow-lift*`. */
.gn-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.625rem;
  min-height: 2.75rem;
  font: inherit;
  font-weight: 600;
  border-radius: 999px;
  padding: 0 1rem;
  border: none;
  background: transparent;
  color: var(--gn-text-muted);
  text-decoration: none;
  cursor: pointer;
  transform-origin: 50% 60%;
  transition:
    background-color var(--gn-motion-feedback) ease-out,
    box-shadow var(--gn-motion-move) var(--gn-motion-ease-out),
    transform var(--gn-motion-move) var(--gn-motion-ease-out);
}
```

  2. Keep `.gn-button:focus-visible` (`:114-117`) unchanged: the house 2px ring (D9).
  3. Replace `.gn-button--primary` and `.gn-button--danger` (`:118-125`) with:

```css
/* The ONE loud element on a screen (layout rule 01). 48px / 24px / 17px
   (rules 01–02); the accent fill with an `accentEdge` edge ≥ 3:1 (rule 03);
   the `action` shadow — lit top edge, shadow falling down, tinted by the
   accent in hig light (rule 04, `Buttons.dc.html:52`). Hover comes TOWARD the
   user (owner: "make it seem more 3d … like the lifting is towards the
   user" — "yes, apply the same lift to the buttons"): grows 4% and its shadow
   spreads and falls further; press pushes it back past rest into its track,
   within the 100ms feedback time. */
.gn-button--primary {
  min-height: 3rem;
  padding: 0 1.5rem;
  border: 1px solid var(--gn-accent-edge);
  background: var(--gn-accent);
  color: var(--gn-accent-text);
  font-size: 1.0625rem;
  box-shadow: var(--gn-shadow-action);
}
.gn-button--primary:hover:not(:disabled) {
  background: var(--gn-accent-edge);
  box-shadow: var(--gn-shadow-action-near);
  transform: scale(1.04);
}
.gn-button--primary:active:not(:disabled) {
  box-shadow: var(--gn-shadow-action-press);
  transform: scale(0.98);
  transition-duration: var(--gn-motion-feedback);
}
/* A destructive confirm is its dialog's loud element, so it takes the
   primary's geometry and lift — on the NEUTRAL `lift` shadows, because the
   `action` shadow is tinted by the accent. */
.gn-button--danger {
  min-height: 3rem;
  padding: 0 1.5rem;
  background: var(--gn-danger);
  color: var(--gn-danger-text);
  font-size: 1.0625rem;
  box-shadow: var(--gn-shadow-lift);
}
.gn-button--danger:hover:not(:disabled) {
  box-shadow: var(--gn-shadow-lift-near);
  transform: scale(1.04);
}
.gn-button--danger:active:not(:disabled) {
  box-shadow: var(--gn-shadow-lift-press);
  transform: scale(0.98);
  transition-duration: var(--gn-motion-feedback);
}
/* Rule 06 and WCAG 2.3.3: no scale for a reduced-motion user. The four
   selectors are the SAME as the rules they cancel — `:not(:disabled)` adds a
   class's worth of specificity, so a bare `.gn-button--primary:hover` here
   would LOSE to them. Equal specificity, later source order, and the shadow
   change (which is not motion) still happens. */
@media (prefers-reduced-motion: reduce) {
  .gn-button { transition: none; }
  .gn-button--primary:hover:not(:disabled),
  .gn-button--primary:active:not(:disabled),
  .gn-button--danger:hover:not(:disabled),
  .gn-button--danger:active:not(:disabled) { transform: none; }
}
```

  4. Replace the `.gn-button--ghost` comment and rule (`:6046-6064`) with:

```css
/* ── The ghost button: every QUIET control (styling refresh Plan A Task 3).
   Transparent, a 1px edge in the accessible grey (`--gn-border`, ≥ 3:1 on
   every ground it sits on — `CONTRAST_PAIRS`), and the text2 label. The
   mockup's own quiet controls (`Main.dc.html:54` Filter, `Sheet.dc.html:97`
   Comment) are exactly this. Hover shows a soft neutral fill within the
   feedback time. Pattern P-QUIET in the plan. */
.gn-button--ghost {
  background: transparent;
  border: 1px solid var(--gn-border);
  color: var(--gn-text-muted);
  font-weight: 600;
}
.gn-button--ghost:hover:not(:disabled) { background: var(--gn-fill-quaternary); }
```

  5. Amend 13.289 in `components.test.tsx` (`:587-594`). Keep its id and `PAINTING_BORDER`, and replace the `it` with:

```ts
  it('13.289 a ghost button is transparent with the ACCESSIBLE edge, and the base rule paints none', () => {
    // Amended 2026-09-29 (styling refresh Plan A, 20.024): rule 03 ("edge ≥
    // 3:1 — a flat grey fill at 1.6:1 vanishes") supersedes R1(c) for buttons.
    // The property this case now holds: the edge is the accessible `border`
    // role and lives on the MODIFIER, so a primary/danger never inherits it.
    expect(rule('.gn-button--ghost')).toMatch(/background:\s*transparent/);
    expect(rule('.gn-button--ghost')).toMatch(/border:\s*1px solid var\(--gn-border\)/);
    expect(rule('.gn-button')).not.toMatch(PAINTING_BORDER);
  });
```

- [ ] **Step 5: Run to see it pass**: the file, then the whole `packages/ui` suite (13.289, 13.340 and 13.284's token block `tokens.test.ts:551-643` must be green). Then `pnpm turbo run build` and the `packages/app-core` and `apps/web` suites IN FULL, with the Global Constraints command.
  - The Button's rendered classes did not change, so no DOM test should move.
  - Any CSS-pin test that DOES go red names a rule this task changed. Amend it in place, keeping its id, and add its case to this task's commit body. Pre-measured candidates: none beyond 13.289. `git grep -n "gn-button" -- '*/test/*'` found only class-name assertions (`components.test.tsx:33`, `authoring-routes.test.tsx:434`, `builder-route.test.tsx:292`, `ticket-types.test.tsx:1150-1155`).

- [ ] **Step 6: Catalogue.**
  - Flip 20.021–20.026.
  - Amend 13.289 (`test-cases/13-hig-per-screen.md:591`) by appending: "Amended 2026-09-29 by 20.024 (styling refresh Plan A): rule 03 supersedes R1(c) for buttons — the ghost is now transparent with a 1px `--gn-border` edge (≥ 3:1) and a `textMuted` label; the case holds the new property, and still that the BASE rule paints no border."
  - Amend 13.284 (`:156`) by appending: "Amended 2026-09-29 by 20.024: the token measurement this case pins (the fill is < 3:1, the accent label ≥ 4.5) is unchanged and still true, and it is exactly why the ghost button now carries an edge instead of relying on its fill."
  - Append to §17:

```markdown
- ✅ **The shared `Button` follows the button rules** (styling refresh Plan A Task 3; `packages/ui/src/ui.css` `.gn-button*`) — the primary is 48px tall with 24px sides, a 17px semibold label, a pill radius, a 10px icon gap, the accent fill with a ≥ 3:1 `accentEdge` edge, resting on the `action` shadow; hover brings it TOWARD the user (`scale(1.04)`, the near shadow, 200ms ease-out) and press pushes it back (`scale(0.98)`, 100ms), all off under reduced motion. The danger button shares that geometry and lift on neutral shadows. The ghost — every quiet control — is transparent with a 1px accessible edge and a text2 label (supersedes R1(c) for buttons; 13.289/13.284 amended). Product-wide: 26 primary usages in 21 files (listed in the plan). No spinner/check yet — `Button` has no pending state (D8). Cases 20.021–20.026.
```

  - Under `:43` (Base UI components), append: `  - ✅ **Styling refresh (2026-09-29):** Button primary/danger 48px with the toward-the-user lift; ghost outlined with the accessible edge. See §17, cases 20.021–20.026.`

- [ ] **Step 7: Commit** `Styling A/Task 3: the shared Button — 48px primary lift, outlined quiet ghost (20.021-20.026)`. Then mutate, show red, restore.

---

### Task 4: Raised surfaces — `Card` rests on the lift shadow; `Dialog` floats on the near one

**Files:**
- Modify: `packages/ui/src/ui.css`:
  - `.gn-card`, `:207-212`;
  - `.gn-dialog`, `:376-380`: add two declarations.
- Create: `packages/ui/test/styling-surfaces.test.ts`.
- Modify: `test-cases/20-styling-system.md`, `Features.md`.

**Interfaces:**
- Consumes: Task 2 (`--gn-shadow-lift`, `--gn-shadow-lift-near`, `--gn-radius-track`).
- Produces: pattern **P-RAISED**. `Card` stays non-interactive (`card.tsx:5`: "Never itself interactive — cards hold buttons"), so no `.gn-card:hover` rule exists and P-LIFT is always keyed on an interactive element's own class (Task 5).

Cases (`## 20.4 Raised surfaces`). The guard moves by **2**:

```markdown
- ❌ **20.031 — every `Card` rests on the `lift` shadow (lit top edge, shadow falling down) instead of the one-layer `raised`, so every static panel in the product takes rule 04 at once — neo unchanged, since neo's `lift` IS its `raised` (20.013);** control: no rule anywhere names `.gn-card:hover` or `.gn-card:active` (a Card is never itself interactive, `card.tsx:5`). Mutation: restore `box-shadow: var(--gn-shadow-raised)` on `.gn-card`.
- ❌ **20.032 — a `Dialog` panel floats on the `lift-near` shadow with the `track` radius (24/28), since it sits above a scrim;** control: the sheet's own rule is untouched by this task (Task 7 owns it). Mutation: remove the `box-shadow` from `.gn-dialog`.
```

- [ ] **Step 1: Write the cases.** +2.

- [ ] **Step 2: Write the failing test** `packages/ui/test/styling-surfaces.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseRules, readUiCss, ruleExactly, valueOf } from './helpers/css-rules.js';

/** Styling refresh Plan A, Task 4 — cases 20.031–20.032 (§20.4). */
const CSS = readUiCss();

describe('20.031 Card rests on the lift shadow', () => {
  it('20.031 lift, and no hover/active rule on a non-interactive Card', () => {
    expect(valueOf(ruleExactly(CSS, '.gn-card'), 'box-shadow')).toBe('var(--gn-shadow-lift)');
    // CONTROL — a Card never lifts on its own (card.tsx:5).
    const interactive = parseRules(CSS).filter((rule) =>
      rule.selectors.some((selector) => /^\.gn-card:(hover|active)\b/.test(selector)),
    );
    expect(interactive).toEqual([]);
  });
});

describe('20.032 Dialog floats near', () => {
  it('20.032 lift-near shadow and track radius on the dialog panel', () => {
    const dialog = ruleExactly(CSS, '.gn-dialog');
    expect(valueOf(dialog, 'box-shadow')).toBe('var(--gn-shadow-lift-near)');
    expect(valueOf(dialog, 'border-radius')).toBe('var(--gn-radius-track)');
    // CONTROL — the sheet's lone rule does not carry this task's shadow.
    expect(valueOf(ruleExactly(CSS, '.gn-sheet'), 'box-shadow')).not.toBe('var(--gn-shadow-lift-near)');
  });
});
```

- [ ] **Step 3: Run to see it fail.** Both FAIL, because `.gn-card` names `raised` and `.gn-dialog` has no `box-shadow` of its own.

- [ ] **Step 4: Implement.**
  - `.gn-card` (`:207-212`): `box-shadow: var(--gn-shadow-raised);` → `box-shadow: var(--gn-shadow-lift);`. Add above it: `/* Rule 04 (styling refresh Plan A Task 4): every static panel rests on the lit-edge, falling \`lift\` shadow. neo's lift IS its raised pair; minimal draws none. A Card is never itself interactive (card.tsx), so hover lift is keyed on the interactive element's own class, never here (pattern P-LIFT). */`
  - `.gn-dialog` (`:376-380`): change `border-radius: var(--gn-radius-card);` to `border-radius: var(--gn-radius-track);`, and add `box-shadow: var(--gn-shadow-lift-near);`. It wins over the group `.gn-dialog, .gn-sheet`'s `overlay` (`:351-363`) because it comes later in the file at equal specificity.

- [ ] **Step 5: Run to see it pass.** Then the whole `packages/ui` suite, and the `apps/web` suite (`neo-card-radius.test.ts` must stay green: it pins that three card classes declare NO radius, and this task declares none on them).

- [ ] **Step 6: Catalogue.** Flip 20.031–20.032. Append to §17:

```markdown
- ⚙️ **Raised surfaces** (styling refresh Plan A Task 4; `ui.css` `.gn-card`, `.gn-dialog`) — every `Card` rests on the lit-edge, falling `lift` shadow (rule 04), product-wide in one declaration; a `Dialog` panel floats on `lift-near` with the 24/28px track radius. `Card` stays non-interactive, so nothing lifts on hover unless its own interactive class asks (pattern P-LIFT). Cases 20.031–20.032.
```

- [ ] **Step 7: Commit** `Styling A/Task 4: Card rests on lift; Dialog floats near (20.031-20.032)`. Then mutate, show red, restore.

---

### Task 5: The board — recessed column tracks, raised cards, and a hover that deepens the shadow

**Files:**
- Modify: `packages/ui/src/ui.css`:
  - `.gn-board__rail`, `:890`;
  - the `.gn-board__column` comment and rule, `:943-961`;
  - `.gn-board__column-header`, `:987-991`;
  - `.gn-board__count`, `:1000`;
  - `.gn-board__cards`, `:1001`;
  - `.gn-board-card`, `:1172`;
  - `.gn-board__card-slot`, `:1304` — new rules go directly after `:1305`.
- Create: `packages/ui/test/styling-board.test.ts`.
- Modify: `packages/ui/test/components.test.tsx:1152-1200` (13.464).
- Modify: `test-cases/13-board-prototype-port.md:371` (13.464), `test-cases/20-styling-system.md`, `Features.md`.

**Interfaces:**
- Consumes: Task 1 (`--gn-surface-track`, `--gn-text-subtle`), Task 2 (`--gn-shadow-track`, `--gn-shadow-lift*`, `--gn-radius-track`, `--gn-motion-*`), Task 4 (P-RAISED).
- Produces: pattern **P-TRACK** (the column) and pattern **P-LIFT** (keyed on `.gn-board__card-slot`, the element that opens the ticket, `board.tsx:1440-1462`). **Amended 2026-09-29 (owner kanban rulings):** P-LIFT is shadow only. Hover gives `lift-near` above the neighbours and press gives `lift-press`, with no transform. The scale and tilt belong to the DRAG (Task 5A). Task 6 relies on `.gn-board-card` being `display: flex; flex-direction: column; gap: 0.5rem`.

**The loud element on the board:** the **New ticket** primary in the project header (`create-ticket-flow.tsx:488`). It became P-PRIMARY in Task 3 with no board-specific CSS. **Filters** (`apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx:2524`, a raw `gn-button gn-button--ghost`) became P-QUIET the same way. The only other header controls are the search field and the workflow select, and those are Plan B's project-chrome task.

Cases (`## 20.5 Board — tracks and hover`). The guard moves by **6** (20.043–20.045 were rewritten in place on 2026-09-29, which adds no ids):

```markdown
- ❌ **20.041 — a board column is a recessed TRACK: the `surfaceTrack` ground, the `track` inset shadow lit from above, the `track` radius (24; neo 28), 8px padding and 8px between cards;** control: no board rule paints `surface-sunken` any more (the 1.14:1 flat fill, 20.001). Mutation: restore `background: var(--gn-surface-sunken)` on `.gn-board__column`.
- ❌ **20.042 — a board card is RAISED: 16px padding, a column flex with 8px between lines, the `lift` shadow, and no radius of its own, so it takes the card token (16; neo 20 = 28 − 8, rule 05);** control: 13.464's no-radius assertion still holds. Mutation: add `border-radius: 1rem;` to `.gn-board-card`.
- ❌ **20.043 — hovering a card changes its SHADOW ONLY (owner ruling 2026-09-29, "hover = shadow only"): the 3-layer `lift-near` shadow, above its neighbours (`z-index: 1` on its positioned slot), with the card's transition on `box-shadow` alone at 220ms ease-out, keyed on the slot that opens the ticket; the rail leaves 24px below the cards for the falling shadow;** control: NO rule anywhere in `ui.css` whose selector names `.gn-board-card` or `.gn-board__card-slot` declares a `transform` other than `none`, except the drag clone's (`.gn-board-drag-image > .gn-board-card`, Task 5A). Mutation: put `transform: scale(1.025)` back on the hover rule.
- ❌ **20.044 — pressing a card settles its shadow to `lift-press` within the 100ms feedback time, with no transform;** control: the press shadow is a different role from the hover shadow. Mutation: put `transform: scale(1.01)` back on the press rule.
- ❌ **20.045 — with no card transform left to cancel, the board declares NO reduced-motion arm for hover or press (a shadow change is not motion); the only reduced-motion rule on the board is the drag clone's (Task 5A, 20.103);** control: the card's transition names only `box-shadow`, so nothing it animates moves. Mutation: add `transform var(--gn-motion-lift) var(--gn-motion-ease-out)` back to the card's transition.
- ❌ **20.046 — the column header sits on the 8pt grid (8px padding, 8px gap), its count is `textSubtle` (the third tier), `Close all (N)` is pushed to the far edge, and columns are 16px apart;** control: the header no longer spreads its children with `space-between`. Mutation: restore `justify-content: space-between` on `.gn-board__column-header`.
```

- [ ] **Step 1: Write the cases.** +6.

- [ ] **Step 2: Write the failing test** `packages/ui/test/styling-board.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseRules, readUiCss, ruleExactly, rulesNaming, valueOf } from './helpers/css-rules.js';

/**
 * Styling refresh Plan A, Tasks 5–6 — cases 20.041–20.046 (§20.5) and
 * 20.051–20.059 (§20.6). The owner-approved board (`Main.dc.html:64-122`),
 * translated: columns are recessed tracks, cards are raised, the lift comes
 * toward the user (owner ruling, 2026-09-29) — and, amended the same day after
 * the kanban video, only while DRAGGED (Task 5A): hover and press change the
 * shadow and nothing else.
 */
const CSS = readUiCss();
const REDUCE = '@media (prefers-reduced-motion: reduce)';
const HOVER = '.gn-board__card-slot:hover > .gn-board-card';
const PRESS = '.gn-board__card-slot:active > .gn-board-card';
/** Task 5A's drag clone — the ONE place a board card may transform. */
const DRAG_CLONE = '.gn-board-drag-image > .gn-board-card';

describe('20.041 a board column is a recessed track', () => {
  it('20.041 track ground, track shadow, track radius, 8px padding, 8px between cards', () => {
    const column = ruleExactly(CSS, '.gn-board__column');
    expect(valueOf(column, 'background')).toBe('var(--gn-surface-track)');
    expect(valueOf(column, 'box-shadow')).toBe('var(--gn-shadow-track)');
    expect(valueOf(column, 'border-radius')).toBe('var(--gn-radius-track)');
    expect(valueOf(column, 'padding')).toBe('0.5rem');
    expect(valueOf(column, 'gap')).toBe('0.5rem');
    expect(valueOf(ruleExactly(CSS, '.gn-board__cards'), 'gap')).toBe('0.5rem');
    // CONTROL — nothing on the board paints the 1.14:1 flat fill any more.
    const boardRules = parseRules(CSS).filter((rule) => rule.selectors.some((s) => s.includes('.gn-board')));
    expect(boardRules.length).toBeGreaterThan(20);
    for (const rule of boardRules) {
      expect(rule.body, rule.selectors.join(', ')).not.toMatch(/var\(--gn-surface-sunken\)/);
    }
  });
});

describe('20.042 a board card is raised', () => {
  it('20.042 16px padding, flex column with 8px lines, lift shadow, no radius of its own', () => {
    const card = ruleExactly(CSS, '.gn-board-card');
    expect(valueOf(card, 'padding')).toBe('1rem');
    expect(valueOf(card, 'display')).toBe('flex');
    expect(valueOf(card, 'flex-direction')).toBe('column');
    expect(valueOf(card, 'gap')).toBe('0.5rem');
    expect(valueOf(card, 'box-shadow')).toBe('var(--gn-shadow-lift)');
    // CONTROL — 13.464: the radius is the card token's, never a literal here.
    expect(valueOf(card, 'border-radius')).toBeNull();
  });
});

describe('20.043 hover deepens the shadow and moves nothing', () => {
  it('20.043 near shadow, raised above neighbours, box-shadow-only transition, no transform', () => {
    const hover = ruleExactly(CSS, HOVER);
    expect(valueOf(hover, 'box-shadow')).toBe('var(--gn-shadow-lift-near)');
    expect(valueOf(hover, 'transform')).toBeNull();
    expect(valueOf(ruleExactly(CSS, '.gn-board__card-slot:hover'), 'z-index')).toBe('1');
    expect(valueOf(ruleExactly(CSS, '.gn-board__card-slot'), 'position')).toBe('relative');
    const card = ruleExactly(CSS, '.gn-board-card');
    expect(valueOf(card, 'transition')).toBe('box-shadow var(--gn-motion-lift) var(--gn-motion-ease-out)');
    expect(valueOf(card, 'transform-origin')).toBeNull();
    expect(valueOf(ruleExactly(CSS, '.gn-board__rail'), 'padding-bottom')).toBe('1.5rem');
    // CONTROL — no board card or slot transforms anywhere, except Task 5A's drag clone.
    let scanned = 0;
    for (const rule of parseRules(CSS)) {
      for (const selector of rule.selectors) {
        if (!/\.gn-board-card\b|\.gn-board__card-slot\b/.test(selector)) continue;
        scanned += 1;
        const transform = valueOf(rule.body, 'transform');
        if (transform === null || transform === 'none') continue;
        expect(selector, 'only the drag clone may transform a board card').toBe(DRAG_CLONE);
      }
    }
    expect(scanned).toBeGreaterThan(10);
  });
});

describe('20.044 pressing settles the shadow', () => {
  it('20.044 press shadow, feedback time, no transform', () => {
    const press = ruleExactly(CSS, PRESS);
    expect(valueOf(press, 'box-shadow')).toBe('var(--gn-shadow-lift-press)');
    expect(valueOf(press, 'transition-duration')).toBe('var(--gn-motion-feedback)');
    expect(valueOf(press, 'transform')).toBeNull();
    // CONTROL — press is its own role, not the hover shadow again.
    expect(valueOf(press, 'box-shadow')).not.toBe(valueOf(ruleExactly(CSS, HOVER), 'box-shadow'));
  });
});

describe('20.045 no hover motion to reduce', () => {
  it('20.045 the card animates only its shadow, so hover and press have no reduced-motion arm', () => {
    // The positive arm — RED before Step 4, and red again under the mutation.
    expect(valueOf(ruleExactly(CSS, '.gn-board-card'), 'transition')).toBe(
      'box-shadow var(--gn-motion-lift) var(--gn-motion-ease-out)',
    );
    // CONTROL — no reduced-motion rule names the hover or press selectors. (These two
    // arms pass before Step 4 as well, since no such rule exists yet; the arm above is
    // the one that can fail.)
    expect(() => ruleExactly(CSS, [HOVER, PRESS], REDUCE)).toThrow();
    expect(() => ruleExactly(CSS, HOVER, REDUCE)).toThrow();
  });
});

describe('20.046 the column header and the rail sit on the 8pt grid', () => {
  it('20.046 8px padding and gap, third-tier count, action to the far edge, 16px between columns', () => {
    const header = ruleExactly(CSS, '.gn-board__column-header');
    expect(valueOf(header, 'padding')).toBe('0.5rem');
    expect(valueOf(header, 'gap')).toBe('0.5rem');
    expect(valueOf(ruleExactly(CSS, '.gn-board__count'), 'color')).toBe('var(--gn-text-subtle)');
    expect(valueOf(ruleExactly(CSS, '.gn-board__column-header > .gn-board__column-action'), 'margin-left')).toBe('auto');
    expect(valueOf(ruleExactly(CSS, '.gn-board__rail'), 'gap')).toBe('1rem');
    // CONTROL — no more space-between spreading the chip, count and action.
    expect(valueOf(header, 'justify-content')).toBeNull();
    expect(rulesNaming(CSS, '.gn-board__column-header')).toHaveLength(1);
  });
});
```

- [ ] **Step 3: Run to see it fail.** Build, then `cd packages/ui && pnpm exec vitest run --no-file-parallelism test/styling-board.test.ts > /tmp/styling-a-ui.log 2>&1; tail -20 /tmp/styling-a-ui.log`.
  - All six FAIL.
  - 20.041's control FAILS too, because `.gn-board__column` paints `surface-sunken` today. That is the finding.

- [ ] **Step 4: Implement** (all in `packages/ui/src/ui.css`, in place).
  1. `.gn-board__rail` (`:890`) → `.gn-board__rail { display: flex; gap: 1rem; align-items: flex-start; overflow-x: auto; padding-bottom: 1.5rem; }`. Add one line to the comment above it: `Styling refresh (Plan A Task 5): 16px between columns (rule 02, "16 between groups"), and 24px below the cards so a lifted card's falling shadow (\`lift-near\`, 28px down) is not clipped by this box's \`overflow-x: auto\`, which clips vertically too.`
  2. Replace the `.gn-board__column` comment and rule (`:943-961`) with:

```css
/* A board column is a RECESSED TRACK (styling refresh Plan A Task 5; the
   owner-approved board, `Main.dc.html:66`): the `surfaceTrack` ground, the
   `track` inset lit from above (rule 04 — light from above, the recess catches
   it on its lower lip), radius 24 (neo 28), padding 8 — so the card inside,
   radius 16 (neo 20), obeys rule 05 (inner = outer − padding). Before this the
   column was `surface-sunken`, a flat fill measured at 1.14:1 on the paper
   (case 20.001): it vanished. 8px between cards (rule 02). The lane stays a
   fixed 18rem in a scrolling rail (plan D13). Pattern P-TRACK. */
.gn-board__column {
  background: var(--gn-surface-track);
  box-shadow: var(--gn-shadow-track);
  border-radius: var(--gn-radius-track);
  padding: 0.5rem;
  min-width: 18rem;
  flex: 0 0 18rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
```

  3. `.gn-board__column-header` (`:987-991`):

```css
.gn-board__column-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem;
}
/* `Close all (N)` to the far edge; the name chip and its count read left. */
.gn-board__column-header > .gn-board__column-action { margin-left: auto; }
```

  4. `.gn-board__count` (`:1000`): `color: var(--gn-text-muted)` → `color: var(--gn-text-subtle)` (the third tier; `textSubtle` on `surfaceTrack` is a declared 4.5 pair, 20.001).
  5. `.gn-board__cards` (`:1001`): `gap: 0.6rem` → `gap: 0.5rem`.
  6. `.gn-board-card` (`:1172`). Replace the one-liner with this, keeping the comment above it (`:1134-1171`) and appending to that comment: `Styling refresh (Plan A Task 5): 16px padding (the mockup's card, \`Main.dc.html:72\`), a flex column with 8px between lines — Task 6 adds 16 between groups — and the lit-edge \`lift\` shadow. Still NO radius here (13.464): the card token gives 16 (neo 20), which is the track's 24 (28) minus its 8px padding, rule 05.`

```css
.gn-board-card {
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  box-shadow: var(--gn-shadow-lift);
  /* Shadow only (owner ruling 2026-09-29): nothing on a resting, hovered or
     pressed card moves, so the transition names box-shadow alone. */
  transition: box-shadow var(--gn-motion-lift) var(--gn-motion-ease-out);
}
```

  7. `.gn-board__card-slot` (`:1304`) → `.gn-board__card-slot { cursor: pointer; position: relative; }`. Directly after `.gn-board__card-slot[draggable="true"] { cursor: grab; }` (`:1305`), add:

```css
/* THE HOVER DEEPENS THE SHADOW, AND ONLY THE SHADOW (owner rulings,
   2026-09-29). The first ruling lifted the card toward the user on hover
   (`scale(1.025)`); after the kanban-UX video the owner ruled "hover = shadow
   only" — the full lift (scale, deeper shadow, tilt) happens only while a card
   is DRAGGED, on the drag image (Task 5A). So on hover the shadow spreads,
   softens and falls further (`lift-near`, three layers) and press settles it
   (`lift-press`, within 100ms); nothing scales.

   Keyed on the SLOT — the element whose click opens the ticket — never on
   `.gn-card`, which is not interactive (pattern P-LIFT). The slot is
   positioned and raised a layer while hovered so the deeper shadow draws
   ABOVE the next card, not under it.

   No `:not(:has(.gn-dialog__scrim))` guard (plan D21, retired): a box-shadow
   and a z-index create no containing block, so the transition dialog
   `MoveArrows` renders inside this card stays viewport-fixed. Do NOT add a
   transform here without bringing that guard back. No `will-change` either
   (20.026). No reduced-motion arm: nothing here moves. */
.gn-board__card-slot:hover { z-index: 1; }
.gn-board__card-slot:hover > .gn-board-card { box-shadow: var(--gn-shadow-lift-near); }
.gn-board__card-slot:active > .gn-board-card {
  box-shadow: var(--gn-shadow-lift-press);
  transition-duration: var(--gn-motion-feedback);
}
```

  8. Amend 13.464 (`components.test.tsx:1152-1200`). The first `it`'s padding assertion `/padding:\s*0\.875rem/` becomes `/padding:\s*1rem/`. In the mutation witness, replace the `UI_CSS.replace(…)` arguments with `'.gn-board-card {\n  padding: 1rem;'` and `'.gn-board-card {\n  padding: 1rem;\n  border-radius: 0.75rem;'`. The rest of the witness is unchanged: it still proves a planted literal radius is caught. Add a comment line: `// Amended 2026-09-29 (styling refresh Plan A, 20.042): the rule is multi-line with 1rem padding; the property — no radius of its own — is unchanged.`

- [ ] **Step 5: Run to see it pass.** Then:
  - the whole `packages/ui` suite (13.464, 13.513, 13.523 and 13.1144 must stay green);
  - build;
  - the `packages/app-core` suite, since `board-workflow-collapse.test.tsx:760-787` reads the rail's `[hidden]` rule, which this task does not touch.

- [ ] **Step 6: Catalogue.**
  - Flip 20.041–20.046.
  - Amend 13.464 (`test-cases/13-board-prototype-port.md:371`) by appending: "Amended 2026-09-29 by 20.042 (styling refresh Plan A): the rule is now multi-line with 16px padding; it still declares no radius, and the witness plants one into the new text."
  - Append to §17:

```markdown
- ✅ **The board's columns are recessed tracks and a hovered card's shadow deepens** (styling refresh Plan A Task 5; `ui.css` `.gn-board__column`, `.gn-board-card`, `.gn-board__card-slot`) — each column is a track (the `surfaceTrack` ground, an inset shadow lit from above, radius 24 — neo 28 — and 8px padding), each card is raised on the lit-edge `lift` shadow with 16px padding and radius 16 (= 24 − 8; neo 20 = 28 − 8), columns 16px apart. Hovering a card changes its SHADOW ONLY (owner ruling 2026-09-29, "hover = shadow only"): a 3-layer spreading shadow above its neighbours, 220ms ease-out; press settles the shadow within 100ms. Nothing scales (the lift belongs to the drag, Task 5A), so a move dialog opened from the card stays viewport-centred with no guard. The header's **New ticket** is the board's one loud element (the shared primary). Cases 20.041–20.046.
```

  - Under `:182`, append: `  - ✅ **Styling refresh (2026-09-29):** columns are recessed tracks (no longer the 1.14:1 sunken fill), cards raised, with a hover that deepens the shadow and moves nothing. Cases 20.041–20.046.`

- [ ] **Step 7: Commit** `Styling A/Task 5: board tracks, raised cards, the shadow-only hover (20.041-20.046)`. Then mutate, show red, restore.

---

### Task 5A: The drag lift and the placeholder (added 2026-09-29, owner kanban rulings)

Owner, 2026-09-29: *"yes, update the mockup and the styling plan"*. The ruling:
- the full lift toward the user (scale ~1.03, a deeper spreading shadow and a 2–3° tilt) happens ONLY while a card is being dragged;
- a drag placeholder sized to the dragged card's height, so the layout does not jump.

Native HTML5 drag-and-drop stays (D26). The lift is painted on a `setDragImage` clone. The placeholder is the source slot itself, and the column being dragged over gets a highlight rather than an inserted placeholder (D25).

**Files:**
- Create: `packages/app-core/src/views/board-drag-image.ts`.
- Create: `packages/app-core/test/views/board-drag-lift.test.tsx`.
- Modify: `packages/app-core/src/views/board.tsx`:
  - `DRAG_TICKET_FORMAT`, `:361`: add a marker format beside it;
  - `BoardCardSlot`, `:1420-1475`: `onDragStart` (`:1445-1452`) and a new `onDragEnd`, plus the placeholder state;
  - the column `<section>` in `BoardGroupSection`, `:1058-1077`: `onDragEnter` and `onDragLeave` beside the existing `onDragOver`/`onDrop`, plus the highlight state.
- Modify: `packages/ui/src/ui.css`: new rules directly after Task 5's `.gn-board__card-slot:active > .gn-board-card` rule.
- Modify: `packages/ui/test/styling-board.test.ts` (append), `test-cases/20-styling-system.md` (new `## 20.10 Board — the drag lift and the placeholder`), `Features.md`.

**Interfaces:**
- Consumes: Task 2 (`--gn-shadow-lift-drag`, `--gn-shadow-track`, `--gn-surface-track`, `--gn-radius-card`); Task 5 (`.gn-board__card-slot` is `position: relative`).
- Produces:
  - `setCardDragImage(event: DragEvent<HTMLElement>, card: HTMLElement): void`;
  - `DRAG_CARD_MARKER = 'application/x-gisik-card'`, exported from `board.tsx` beside `DRAG_TICKET_FORMAT`;
  - the classes `.gn-board-drag-image`, `.gn-board__card-slot--placeholder` and `.gn-board__column--drop-target`.

**Why a marker format.** `DRAG_TICKET_FORMAT` is `'text/plain'` (`board.tsx:361`). Any text selection dragged across the page carries `text/plain` too. During `dragenter` a page can read a drag's `types` but not its data. So the highlight keys on a second, card-only type that `dragstart` sets with an empty value. The drop still reads the ticket id from `DRAG_TICKET_FORMAT`, exactly as today (`:1307`).

Cases (`## 20.10 Board — the drag lift and the placeholder`). The guard moves by **5**:

```markdown
- ❌ **20.101 — at `dragstart` a card hands the browser a LIFTED drag image: `setDragImage` is called once with a `.gn-board-drag-image` wrapper attached to `document.body`, `aria-hidden="true"` and `inert`, holding a deep clone of the card at the source card's measured width, with every `id` and `data-testid` stripped from the clone and all its descendants, the offsets being the pointer's offset inside the card plus the wrapper's padding (48px left, 24px top); the wrapper is removed on the next task (`setTimeout(…, 0)`), after the browser has taken its snapshot;** control: during the drag `getAllByTestId('ticket-card-<id>')` still has exactly ONE element. Mutation: skip the `data-testid` strip.
- ❌ **20.102 — the drag image is FEATURE-GUARDED: a `DataTransfer` with no `setDragImage` (the jsdom fakes at `board-drag-drop.test.tsx:100-109` and `board-card-click.test.tsx:77-86`) drags without throwing, attaches no wrapper, and still sets `DRAG_TICKET_FORMAT` and the marker, so the drop moves the ticket;** control: the existing drag-drop cases in `board-drag-drop.test.tsx` pass unchanged. Mutation: delete the `typeof event.dataTransfer.setDragImage === 'function'` guard (a TypeError on `dragstart`).
- ❌ **20.103 — the clone's card is tilted and lifted: `.gn-board-drag-image > .gn-board-card` declares `transform: rotate(2.5deg) scale(1.03)` and `box-shadow: var(--gn-shadow-lift-drag)`; the wrapper is `position: fixed` at `-10000px`/`-10000px` with padding `1.5rem 3rem 5.5rem`, so the 40px-down, 64px-blur fall is not clipped, and `pointer-events: none`; under `prefers-reduced-motion: reduce` the same selector's `transform` is `none` while the shadow stays;** control: this is the ONLY board rule with a transform other than `none` (20.043's scan). Mutation: delete the reduced-motion arm.
- ❌ **20.104 — the source slot becomes the PLACEHOLDER one animation frame after `dragstart` and stops being it on `dragend` (which fires on a drop, on Esc and on a refused drop): `gn-board__card-slot--placeholder` is absent synchronously after `dragstart`, present after the frame, absent after `dragend`; its card is `visibility: hidden` and the slot draws a recessed outline (`background: var(--gn-surface-track)`, `box-shadow: var(--gn-shadow-track)`, `border-radius: var(--gn-radius-card)`, `outline: 1px dashed var(--gn-border)`, `outline-offset: -1px`) without declaring any `height`, `padding`, `margin` or `border`, so its box stays the card's own size;** control: a `dragend` that arrives BEFORE the frame cancels it, so no placeholder class is left behind. Mutation: apply the class synchronously in `onDragStart` (the synchronous-absent assertion fails).
- ❌ **20.105 — the column being dragged over is HIGHLIGHTED, not given a placeholder: a `dragenter` whose `types` include `DRAG_CARD_MARKER` adds `gn-board__column--drop-target` (`outline: 2px solid var(--gn-accent); outline-offset: -2px`); entering a child card and then leaving the column once keeps it (an enter/leave depth counter, because `dragleave` fires when the pointer moves onto a child); the matching final `dragleave`, a `drop`, or a card's `dragend` anywhere on the board clears it; a drag without the marker (a text selection carrying only `text/plain`) never highlights; the column's card list gains no element;** control: the list's child count is the same before, during and after the highlight. Mutation: replace the counter with a boolean set on enter and cleared on any leave (the child-enter arm clears it).
```

- [ ] **Step 1: Write the cases.** +5.

- [ ] **Step 2: Write the failing tests.**
  - Append to `packages/ui/test/styling-board.test.ts`:

```ts
describe('20.103 the drag clone is tilted and lifted', () => {
  it('20.103 rotate + scale + lift-drag, padded off-screen wrapper, reduced motion drops the transform', () => {
    const clone = ruleExactly(CSS, DRAG_CLONE);
    expect(valueOf(clone, 'transform')).toBe('rotate(2.5deg) scale(1.03)');
    expect(valueOf(clone, 'box-shadow')).toBe('var(--gn-shadow-lift-drag)');
    const wrapper = ruleExactly(CSS, '.gn-board-drag-image');
    expect(valueOf(wrapper, 'position')).toBe('fixed');
    expect(valueOf(wrapper, 'top')).toBe('-10000px');
    expect(valueOf(wrapper, 'left')).toBe('-10000px');
    expect(valueOf(wrapper, 'padding')).toBe('1.5rem 3rem 5.5rem');
    expect(valueOf(wrapper, 'pointer-events')).toBe('none');
    const reduced = ruleExactly(CSS, DRAG_CLONE, REDUCE);
    expect(valueOf(reduced, 'transform')).toBe('none');
    // CONTROL — reduced motion keeps the shadow: it restates no box-shadow.
    expect(valueOf(reduced, 'box-shadow')).toBeNull();
  });
});

describe('20.104 the placeholder keeps the card box', () => {
  it('20.104 hidden card, recessed outline, no box-changing declaration', () => {
    const slot = ruleExactly(CSS, '.gn-board__card-slot--placeholder');
    expect(valueOf(slot, 'background')).toBe('var(--gn-surface-track)');
    expect(valueOf(slot, 'box-shadow')).toBe('var(--gn-shadow-track)');
    expect(valueOf(slot, 'border-radius')).toBe('var(--gn-radius-card)');
    expect(valueOf(slot, 'outline')).toBe('1px dashed var(--gn-border)');
    expect(valueOf(slot, 'outline-offset')).toBe('-1px');
    expect(valueOf(ruleExactly(CSS, '.gn-board__card-slot--placeholder > .gn-board-card'), 'visibility')).toBe('hidden');
    // CONTROL — nothing that changes the box.
    for (const property of ['height', 'min-height', 'padding', 'margin', 'border']) {
      expect(valueOf(slot, property), property).toBeNull();
    }
  });
});

describe('20.105 the drop target is an outline, inside the edge', () => {
  it('20.105 accent outline, negative offset', () => {
    const target = ruleExactly(CSS, '.gn-board__column--drop-target');
    expect(valueOf(target, 'outline')).toBe('2px solid var(--gn-accent)');
    expect(valueOf(target, 'outline-offset')).toBe('-2px');
  });
});
```

  - Create `packages/app-core/test/views/board-drag-lift.test.tsx`. Mount the board exactly as `board-drag-drop.test.tsx` does, and copy its seed and `renderBoard` helpers (`:1-130`). Two local fakes:

```ts
function liftingDataTransfer(types: string[] = []): DataTransfer & { setDragImage: ReturnType<typeof vi.fn> } {
  const store = new Map<string, string>();
  const setDragImage = vi.fn();
  return {
    setData: (format: string, data: string) => {
      store.set(format, data);
      if (!types.includes(format)) types.push(format);
    },
    getData: (format: string) => store.get(format) ?? '',
    effectAllowed: 'uninitialized',
    types,
    setDragImage,
  } as unknown as DataTransfer & { setDragImage: ReturnType<typeof vi.fn> };
}
```

  The cases:
    - **20.101:**
      - fire `dragStart` on the slot with `liftingDataTransfer()` and `clientX`/`clientY` 30/20 inside a card whose `getBoundingClientRect` is stubbed to `{ left: 10, top: 10, width: 288 }`;
      - `setDragImage` was called once with `(wrapper, 20 + 48, 10 + 24)`;
      - the wrapper is in `document.body`, has class `gn-board-drag-image`, `aria-hidden="true"` and the `inert` attribute, and its first child has class `gn-board-card` and `style.width === '288px'`;
      - `wrapper.querySelectorAll('[id], [data-testid]')` is empty;
      - the control: `getAllByTestId('ticket-card-<id>')` has length 1;
      - after `await new Promise((resolve) => setTimeout(resolve, 0))` the wrapper is no longer connected.
    - **20.102:** the existing `fakeDataTransfer()` shape (no `setDragImage`, copied verbatim). `dragStart` does not throw, `document.querySelector('.gn-board-drag-image')` is null, and `getData(DRAG_TICKET_FORMAT)` returns the ticket id. Then `drop` on another column calls the move with that id (the same assertion `board-drag-drop.test.tsx:134-150` makes).
    - **20.104:**
      - right after `dragStart` the slot lacks `gn-board__card-slot--placeholder`;
      - after `await new Promise((resolve) => requestAnimationFrame(() => resolve(null)))` it has it;
      - after `fireEvent.dragEnd(slot)` it lacks it;
      - the control: `dragStart` then an immediate `dragEnd`, then wait one frame, and the class is absent.
    - **20.105:**
      - with `liftingDataTransfer([DRAG_CARD_MARKER])`: `dragEnter` on column B adds `gn-board__column--drop-target`;
      - `dragEnter` on a card inside B, then `dragLeave` on B, keeps it;
      - a second `dragLeave` on B removes it;
      - enter again, then `drop`, removes it;
      - enter again, then `dragEnd` on the source slot, removes it;
      - with a `DataTransfer` whose `types` is `['text/plain']`, `dragEnter` adds nothing;
      - the control: `within(columnB).getByRole('list').children.length` is equal before, during and after.

- [ ] **Step 3: Run to see them fail.** Build `packages/ui`, then run `styling-board.test.ts` (20.103–20.105 RED: no rules yet) and `board-drag-lift.test.tsx` (20.101, 20.104 and 20.105 RED). 20.102 PASSES before implementation. It is the regression guard for the feature check, and its mutation is what proves it.

- [ ] **Step 4: Implement.**
  1. `packages/app-core/src/views/board-drag-image.ts`:

```ts
import type { DragEvent } from 'react';

/**
 * The dragged card's lifted image (styling refresh Plan A Task 5A; owner
 * ruling 2026-09-29: the full lift toward the user — scale, deeper shadow,
 * a 2–3° tilt — happens only while a card is DRAGGED).
 *
 * The board drags NATIVELY, and a native drag moves a bitmap the browser
 * snapshots at `dragstart`: CSS on the source `<li>` never follows the
 * pointer. So the lift is painted on a clone, handed to `setDragImage`, and
 * removed on the next task — after the snapshot, which the browser takes
 * synchronously once this handler returns. The browser adds its own
 * translucency to a drag image; no page can remove it (plan D26).
 *
 * The clone is `aria-hidden` and `inert`, and every `id`/`data-testid` in it is
 * stripped: for the one task it exists it must not be a second copy of the
 * card to assistive tech, to `getByTestId`, or to `document.getElementById`.
 *
 * FEATURE-GUARDED: jsdom's `DataTransfer` fakes carry no `setDragImage`
 * (`board-drag-drop.test.tsx:100-109`); the drag must still work without one.
 */
const PAD_LEFT = 48; // = the wrapper's 3rem inline padding
const PAD_TOP = 24; // = its 1.5rem top padding

export function setCardDragImage(event: DragEvent<HTMLElement>, card: HTMLElement): void {
  if (typeof event.dataTransfer.setDragImage !== 'function') return;
  const rect = card.getBoundingClientRect();
  const clone = card.cloneNode(true) as HTMLElement;
  clone.removeAttribute('id');
  clone.removeAttribute('data-testid');
  for (const element of clone.querySelectorAll('[id], [data-testid]')) {
    element.removeAttribute('id');
    element.removeAttribute('data-testid');
  }
  clone.style.width = `${rect.width}px`;
  const wrapper = document.createElement('div');
  wrapper.className = 'gn-board-drag-image';
  wrapper.setAttribute('aria-hidden', 'true');
  wrapper.setAttribute('inert', '');
  wrapper.append(clone);
  document.body.append(wrapper);
  event.dataTransfer.setDragImage(
    wrapper,
    event.clientX - rect.left + PAD_LEFT,
    event.clientY - rect.top + PAD_TOP,
  );
  setTimeout(() => wrapper.remove(), 0);
}
```

  2. `board.tsx`, directly after `DRAG_TICKET_FORMAT` (`:361`), add this, with a docblock giving the "Why a marker format" paragraph above:

```ts
export const DRAG_CARD_MARKER = 'application/x-gisik-card';
```

  3. `BoardCardSlot` (`:1420-1475`):
     - add `const [placeholder, setPlaceholder] = useState(false);` and `const frameRef = useRef<number | null>(null);` beside `draggedRef`;
     - `className={placeholder ? 'gn-board__card-slot gn-board__card-slot--placeholder' : 'gn-board__card-slot'}`;
     - `onDragStart`, after the existing three lines:

```ts
event.dataTransfer.setData(DRAG_CARD_MARKER, '');
const card = event.currentTarget.firstElementChild;
if (card instanceof HTMLElement) setCardDragImage(event, card);
// One frame later, NOT now: restyling the source synchronously would put the
// hidden card into the browser's snapshot (Chromium can cancel the drag).
frameRef.current = requestAnimationFrame(() => {
  frameRef.current = null;
  setPlaceholder(true);
});
```

     - a new `onDragEnd` (the same `arrows === null ? undefined : …` gate): `if (frameRef.current !== null) cancelAnimationFrame(frameRef.current); frameRef.current = null; setPlaceholder(false);`. Do NOT touch `draggedRef` here. It is cleared on the next `mousedown`, never on `dragend` (the docblock at `:1375-1382`).
  4. `BoardGroupSection`, the column `<section>` (`:1058-1077`):
     - add `const [dropTarget, setDropTarget] = useState<string | null>(null);` and `const depthRef = useRef(new Map<string, number>());` at the top of the component;
     - add `column.stateId === dropTarget ? ' gn-board__column--drop-target' : ''` to the section's class;
     - under the SAME `onDropCard === null ? undefined : …` gate as `onDragOver`, add these handlers (`isCardDrag` is `(event) => Array.from(event.dataTransfer.types ?? []).includes(DRAG_CARD_MARKER)`):
       - `onDragEnter`: if `isCardDrag(event)`, increment the column's depth and `setDropTarget(column.stateId)`;
       - `onDragLeave`: if `isCardDrag(event)`, decrement, and at 0 delete the entry and clear `dropTarget` when it is this column;
       - `onDrop`: first clear this column's depth and `dropTarget`, then call `onDropCard` as today.
     - on the rail's wrapper, add `onDragEnd={() => { depthRef.current.clear(); setDropTarget(null); }}`. A card's `dragend` bubbles here from the source slot, and that covers Esc and a drop outside every column.
  5. `ui.css`, directly after Task 5's `.gn-board__card-slot:active > .gn-board-card` rule:

```css
/* THE DRAG LIFT (owner ruling 2026-09-29: the full lift toward the user —
   scale 1.03, a deeper spreading shadow, a 2.5° tilt — happens ONLY while a
   card is dragged). Painted on the detached drag-image clone
   (`board-drag-image.ts`), because a native drag moves a browser snapshot and
   CSS on the source never follows the pointer (plan D26). The wrapper sits
   off-screen and pads the clone so the shadow's 40px/64px fall is inside the
   snapshot rather than clipped at the card's edge. The clone is never an
   ancestor of a dialog, so its transform needs no guard (D21, retired). */
.gn-board-drag-image {
  position: fixed;
  top: -10000px;
  left: -10000px;
  padding: 1.5rem 3rem 5.5rem;
  pointer-events: none;
}
.gn-board-drag-image > .gn-board-card {
  transform: rotate(2.5deg) scale(1.03);
  box-shadow: var(--gn-shadow-lift-drag);
}
@media (prefers-reduced-motion: reduce) {
  .gn-board-drag-image > .gn-board-card { transform: none; }
}
/* THE PLACEHOLDER (owner ruling 2026-09-29: "sized to the dragged card, no
   layout jump"). The source slot stays in place with its box untouched — no
   height, padding, margin or border here — its card hidden and a recessed,
   dashed outline drawn in the card's shape. The dashed `border` grey clears
   3:1, so the outline still reads where minimal draws no shadow. */
.gn-board__card-slot--placeholder {
  background: var(--gn-surface-track);
  box-shadow: var(--gn-shadow-track);
  border-radius: var(--gn-radius-card);
  outline: 1px dashed var(--gn-border);
  outline-offset: -1px;
}
.gn-board__card-slot--placeholder > .gn-board-card { visibility: hidden; }
/* THE DROP TARGET (plan D25): a board drop changes state, it does not
   reorder, so the column is outlined rather than given a placeholder at an
   index it would not honour. Inside the edge so the rail does not shift.
   The accent — rule 03's one accent, saved for the action; this is it. */
.gn-board__column--drop-target { outline: 2px solid var(--gn-accent); outline-offset: -2px; }
```

- [ ] **Step 5: Run to see them pass.** Then run the whole `packages/app-core` suite, which covers `board-drag-drop.test.tsx`, `board-card-click.test.tsx` (13.521 and the `draggedRef` cases) and `board-workflow-collapse.test.tsx`, and the whole `packages/ui` suite. Then build and typecheck.

- [ ] **Step 6: Catalogue.** Flip 20.101–20.105. Append to §17:

```markdown
- ✅ **A dragged card lifts toward you and leaves a placeholder** (styling refresh Plan A Task 5A; `packages/app-core/src/views/board-drag-image.ts`, `board.tsx` `BoardCardSlot` and the column section, `ui.css` `.gn-board-drag-image`, `.gn-board__card-slot--placeholder`, `.gn-board__column--drop-target`) — owner ruling 2026-09-29: the full lift happens only while dragging. The drag image is a detached clone of the card tilted 2.5°, scaled 1.03 and on the deeper `lift-drag` shadow (no tilt or scale under reduced motion; the browser adds its own translucency). The card's own slot stays put as a recessed dashed placeholder the size of the card, so nothing jumps, and the column under the pointer gains an accent outline (a drop changes state, it does not reorder, so no placeholder is inserted there). Feature-checked, so a browser without `setDragImage` still drags. Cases 20.101–20.105.
```

- [ ] **Step 7: Commit** `Styling A/Task 5A: the drag lift, the placeholder, the drop-target outline (20.101-20.105)`. Then mutate, show red, restore.

---

### Task 5B: Every column collapses to a labelled strip (added 2026-09-29, owner kanban rulings; generalised that evening)

Owner, 2026-09-29: single columns (Done and Backlog) collapse to a narrow labelled strip with a count. That evening the owner generalised it: *"all columns are collapsible"* (D27, resolved). So this task builds the collapse for EVERY board column, whatever its category. **Backlog is never a board column** (spec §1.1; `board.tsx:1700-1705`), so it has no strip. It is a behaviour change as well as a styling one, and it is remembered in `localStorage` on the pattern `preferences/workflow-collapse.ts` set. That precedent is the owner's own: *"only on the local storage, clientside"* (`workflow-collapse.ts:1-60`).

**Files:**
- Create: `packages/app-core/src/preferences/column-collapse.ts`.
- Create: `packages/app-core/test/preferences/column-collapse.test.ts` and `packages/app-core/test/views/board-column-collapse.test.tsx`.
- Modify: `packages/app-core/src/views/board.tsx`:
  - `Board`: a `columnChoices` state read with the `useHydrationLayoutEffect` that already reads `groupChoices` (`:505-545`);
  - `BoardGroupSection`'s column `<section>` (`:1058-1200`): the header toggle, the collapsed branch and the props that carry the choices down.
- Modify: `packages/ui/src/ui.css`: new rules after `.gn-board__column-header > .gn-board__column-action` (Task 5).
- Modify: `packages/ui/test/styling-board.test.ts` (append), `test-cases/20-styling-system.md` (new `## 20.11 Board — collapsible columns`), `Features.md`.

**Interfaces:**
- Consumes: Task 5 (P-TRACK column; `.gn-board__column-header`), the Pattern table's P-GHOST declarations (written out in full in Step 4, since Task 6, which first applies P-GHOST on the board, runs after this task), and Task 5A (the section's drag handlers stay on the section in both states).
- Produces:
  - `COLUMN_COLLAPSE_KEY = 'gn-board-column-collapse'`;
  - `type ColumnCollapseChoices = Record<string, boolean>`, where `false` means collapsed by a person, `true` means expanded by a person and an absent key means no choice (expanded);
  - `NO_COLUMN_CHOICES`;
  - `readColumnCollapse(userId, projectId)`;
  - `rememberColumnCollapse(userId, projectId, choices)`;
  - `columnCollapseKey(workflowId, stateId)` = `${workflowId}:${stateId}`. Keyed by workflow and not by version, so a new version of the same workflow keeps the person's choice for a state it still has.

**The shape, copied, not reinvented.** Every rule in `workflow-collapse.ts`'s docblock carries over:
- keyed by user AND project;
- another user's record is never honoured, on read or on write;
- every storage access is wrapped, so every failure answers the default;
- choices only, never resolved states;
- `''` or `undefined` means no session, so nothing is read and nothing is written.

The one difference is that there is no auto-expand rule here. The default is EXPANDED for every column, so nobody's board changes until they press the control.

**The markup.**
- **Expanded column (any category).** The header gains a 44×44 ghost icon button at the far edge. In a terminal column that shows `Close all (N)`, it sits right after that button: `<button type="button" className="gn-board__column-collapse" aria-expanded="true" aria-controls={cardsId} aria-label={`Collapse ${column.name}`}>`, with a chevron icon (`aria-hidden`). The `<ul className="gn-board__cards">` gains `id={cardsId}`, where `cardsId = `board-cards-${group.workflowId}-${column.stateId}``.
- **Collapsed column.** The SAME `<section>` stays, with the same `role`, `aria-label`, `data-testid` and the same `onDragOver`/`onDragEnter`/`onDragLeave`/`onDrop`, so it is still a drop target. It adds the class `gn-board__column--collapsed` and holds ONLY `<button type="button" className="gn-board__column-strip" aria-expanded="false" aria-label={`Expand ${column.name}, ${n} ${n === 1 ? 'ticket' : 'tickets'}`}>`. Inside it is the count (`gn-board__count`) and then the name, written vertically (`gn-board__column-strip-name`, `aria-hidden` because the button's name already says it). It has no `aria-controls`, because the list it would control is not rendered.
- **Collapsed hides everything else.** The header, the card list, `Close all (N)` (terminal columns), the per-column empty state and its `Add a ticket` (creatable columns) are all hidden. The owner asked for a strip. Everything returns on expand.
- **Focus follows the toggle.** Pressing Collapse moves focus to the strip's button, and pressing the strip moves focus to the Collapse button, because the pressed control unmounts. Use a ref and a layout effect keyed on the column's state.
- **Scope.** EVERY column gets the control, with no `column.category` test anywhere in this task (D27, resolved).
- **Every column collapsed at once.** This is a legitimate state and must leave a usable board.
  - The rail shows the strips side by side, each 3.5rem wide with the rail's 1rem gap between them.
  - Each strip is still a drop target, and each Expand button is reachable in tab order, left to right.
  - The workflow group's heading and its own collapse toggle stay, because group collapse (`workflow-collapse.ts`) and column collapse are independent memories. Collapsing every column never hides the group, and collapsing the group still hides the whole rail, strips included.
  - Nothing else on the board changes. The whole-board empty banner depends on tickets, not on columns.
  - A collapsed strip stretches to the rail's height (`align-self: stretch`, with a 12rem floor), so it is a tall drop target beside expanded columns and never a sliver when every column is collapsed.

Cases (`## 20.11 Board — collapsible columns`). The guard moves by **8** (6, plus 20.117–20.118 added for the evening ruling):

```markdown
- ❌ **20.111 — `column-collapse.ts` remembers a person's column choices per user AND project in `localStorage` under `gn-board-column-collapse`, choices only (an absent key is "nobody chose", not `false`), merging one project's write without touching another's, and answers `NO_COLUMN_CHOICES` for no session, a throwing accessor, unparseable text, a non-object document and another user's document — whose projects are also never carried into this user's write;** control: `workflow-collapse.ts`'s key is untouched by a column write (the two memories are separate documents). Mutation: drop the `storedUserId !== userId` check from the read.
- ❌ **20.112 — EVERY column carries the control (owner ruling 2026-09-29 evening, "all columns are collapsible"): each expanded column's header — open, active and terminal alike — holds a 44×44 ghost `Collapse <name>` button (`aria-expanded="true"`, `aria-controls` naming the column's card list, which exists); in a terminal column showing `Close all (N)` it comes right after that button, and in any other column it takes the far edge;** control: the number of `Collapse …` buttons equals the number of columns on the board. Mutation: re-add a `column.category === 'terminal'` gate (the open and active columns lose the control).
- ❌ **20.113 — collapsing keeps the SAME `<section>` (same role, name and test id) and renders in it only a `<button aria-expanded="false">` named `Expand <name>, <n> tickets` (`1 ticket` when there is one), with the count and the name visible; the card list, `Close all (N)`, the empty copy and `Add a ticket` are not rendered; focus moves to the strip, and expanding restores everything and moves focus to `Collapse <name>`;** control: a collapsed column with zero cards is named `Expand Done, 0 tickets`. Mutation: leave the count out of the strip's accessible name.
- ❌ **20.114 — a COLLAPSED column is still a drop target: dropping a card from another column on the strip moves the ticket to that state (the same `onDropCard` call an expanded column makes), the strip's count and name go up by one, and the column stays collapsed;** control: the same drop on the expanded column makes the identical `onDropCard(event, stateId)` call. Mutation: attach the drag handlers only in the expanded branch.
- ❌ **20.115 — the choice survives a remount for the same user and project, a fresh user and a board with no `currentUserId` see every column expanded, and pressing the toggle with no session changes the board for that session but writes nothing;** control: expanding a column a person collapsed writes `true`, not a deleted key, and a record with no choices removes the project's entry. Mutation: make the default collapsed.
- ❌ **20.116 — the collapsed column is a 3.5rem strip (`flex: 0 0 3.5rem; min-width: 3.5rem`, plan D13 amended) that stretches to the rail's height with a 12rem floor (`align-self: stretch; min-height: 12rem`, so it stays a real drop target), whose button fills it (`width: 100%`, `min-height: 2.75rem`, the P-GHOST ground and hover), with the name set vertically (`writing-mode: vertical-rl`) in the second text tier and the count in the third; the expanded header's collapse button is P-GHOST, icon-only, 44×44;** control: `.gn-board__column` itself still declares `flex: 0 0 18rem`. Mutation: remove `writing-mode` from the strip name.
- ❌ **20.117 — a NON-terminal column collapses exactly as Done does: collapsing an OPEN column (a creatable one, holding `Add a ticket` when empty) and an ACTIVE column each leaves the same `<section>` holding only `Expand <name>, <n> tickets`, hides that column's cards, empty copy and `Add a ticket`, still takes a drop, and is remembered under its own `columnCollapseKey(workflowId, stateId)`;** control: collapsing the open column leaves the active and terminal columns expanded, with their own `Collapse …` buttons. Mutation: key the memory on `stateId` alone, so a second workflow's column with the same state id collapses too (seed two groups sharing a state id).
- ❌ **20.118 — EVERY column collapsed at once still leaves a usable board: the rail holds one strip per column side by side (every section `gn-board__column--collapsed`, the rail's `gap` unchanged), each strip's Expand button is reachable by Tab in column order, a card dropped on any strip moves there, the workflow group's heading and its own collapse toggle are still rendered and the rail is NOT `hidden`, and expanding any one strip restores that column alone;** control: collapsing the workflow GROUP afterwards still hides the whole rail (`hidden`), strips included, and expanding the group shows the strips again, still collapsed (two independent memories). Mutation: have the board treat "every column collapsed" as a collapsed group (derive the group's default from its columns).
```

- [ ] **Step 1: Write the cases.** +6.

- [ ] **Step 2: Write the failing tests.**
  - `packages/app-core/test/preferences/column-collapse.test.ts`. Mirror the cases that pin `workflow-collapse.ts`, found with `git grep -n "WORKFLOW_COLLAPSE_KEY" -- packages/app-core/test`: the same arms, with the column module's names. 20.111's control writes a column choice and asserts `localStorage.getItem(WORKFLOW_COLLAPSE_KEY)` is unchanged.
  - `packages/app-core/test/views/board-column-collapse.test.tsx`. Seed a board whose workflow has an open, an active and a terminal state, with two cards in the terminal one and one in the active one. For 20.117's mutation, a second group has a workflow sharing the open state's id. Mount it as `board-workflow-collapse.test.tsx` does, with `currentUserId` and a project id.
    - **20.112:** `getAllByRole('button', { name: /^Collapse / })` has one entry per column, and each has `aria-expanded="true"` and an `aria-controls` that resolves to a `<ul>` in its own region. In Done, the Collapse button is the next element sibling of `Close all (2)`. The control compares that count with `getAllByRole('region').length` for the columns.
    - **20.113:** press Collapse. `within(getByTestId('board-column-<done>')).getAllByRole('button')` is exactly `[Expand Done, 2 tickets]` with `aria-expanded="false"`, and `document.activeElement` is that button. `queryByText('Close all (2)')` is null. Press it, and `document.activeElement` is `Collapse Done` and `Close all (2)` is back. The control: an empty Done.
    - **20.114:** collapse Done, then `dragStart` a card in the active column and `drop` on `board-column-<done>` (the `fakeDataTransfer` of `board-drag-drop.test.tsx:100-109`). The move is called with the Done state id. After the reload the strip is named `Expand Done, 3 tickets` and still has `aria-expanded="false"`.
    - **20.115:** collapse, unmount, remount with the same user, and the strip is shown. Remount as another user, and Collapse is shown. Mount with no `currentUserId`, press Collapse, and `localStorage.getItem(COLUMN_COLLAPSE_KEY)` is null.
    - **20.117:**
      - collapse the open column (empty, so it held `Add a ticket`), and its region holds only `Expand To do, 0 tickets` and `queryByRole('button', { name: 'Add a ticket' })` in it is null;
      - collapse the active column, and it holds `Expand Doing, 1 ticket`;
      - drop the Done card on the collapsed open column, and the move is called with the open state id;
      - the control: Done still has `Collapse Done`;
      - the mutation arm: the second group's same-id column is still expanded.
    - **20.118:**
      - collapse every column and assert each section has `gn-board__column--collapsed`;
      - `userEvent.tab()` from the group heading's toggle visits the strips' Expand buttons in column order;
      - a drop on the middle strip moves the ticket there;
      - the group heading's button is present and the rail's `hidden` is false;
      - expanding one strip leaves the others collapsed;
      - the control: press the group toggle and the rail is `hidden`; press it again and the strips are back, all still collapsed.
  - Append 20.116 to `packages/ui/test/styling-board.test.ts`:

```ts
describe('20.116 the collapsed column is a labelled 3.5rem strip', () => {
  it('20.116 strip width, full-size ghost button, vertical name, ghost collapse icon', () => {
    const collapsed = ruleExactly(CSS, '.gn-board__column--collapsed');
    expect(valueOf(collapsed, 'flex')).toBe('0 0 3.5rem');
    expect(valueOf(collapsed, 'min-width')).toBe('3.5rem');
    expect(valueOf(collapsed, 'align-self')).toBe('stretch');
    expect(valueOf(collapsed, 'min-height')).toBe('12rem');
    const strip = ruleExactly(CSS, '.gn-board__column-strip');
    expect(valueOf(strip, 'width')).toBe('100%');
    expect(valueOf(strip, 'min-height')).toBe('2.75rem');
    expect(valueOf(strip, 'background')).toBe('transparent');
    expect(valueOf(ruleExactly(CSS, ['.gn-board__column-strip:hover', '.gn-board__column-strip:focus-visible']), 'background')).toBe(
      'var(--gn-fill-tertiary)',
    );
    const name = ruleExactly(CSS, '.gn-board__column-strip-name');
    expect(valueOf(name, 'writing-mode')).toBe('vertical-rl');
    expect(valueOf(name, 'color')).toBe('var(--gn-text-muted)');
    const toggle = ruleExactly(CSS, '.gn-board__column-collapse');
    expect(valueOf(toggle, 'min-width')).toBe('2.75rem');
    expect(valueOf(toggle, 'min-height')).toBe('2.75rem');
    expect(valueOf(toggle, 'border')).toBe('none');
    expect(valueOf(toggle, 'margin-left')).toBe('auto');
    expect(valueOf(ruleExactly(CSS, '.gn-board__column-action + .gn-board__column-collapse'), 'margin-left')).toBe('0');
    // CONTROL — an expanded column is still the 18rem lane.
    expect(valueOf(ruleExactly(CSS, '.gn-board__column'), 'flex')).toBe('0 0 18rem');
  });
});
```

- [ ] **Step 3: Run to see them fail.** All eight are RED.

- [ ] **Step 4: Implement.**
  1. `column-collapse.ts`: copy `workflow-collapse.ts` (`:1-216`) and rename it. The module docblock points back at `workflow-collapse.ts` for the reasoning instead of restating it, and adds one paragraph for the difference: no auto-expand, the default is expanded, and the scope is every column (plan D27, resolved). Add `columnCollapseKey`.
  2. `board.tsx`:
     - in `Board`, add `const [columnChoices, setColumnChoices] = useState<ColumnCollapseChoices>(NO_COLUMN_CHOICES);` beside `groupChoices`, and read it inside the SAME `useHydrationLayoutEffect` (`:543-545`);
     - pass `columnChoices` and `onToggleColumn(workflowId, stateId, expanded)` to `BoardGroupSection`. The toggle builds the next choices, calls `setColumnChoices`, and calls `rememberColumnCollapse(currentUserId ?? '', board.projectId, next)`;
     - in the column map, `const collapsed = columnChoices[columnCollapseKey(group.workflowId, column.stateId)] === false;`. There is no category test (D27, resolved);
     - render the collapsed branch or the expanded one as **The markup** above says, keeping the section's attributes and handlers in ONE place outside the branch.
  3. `ui.css`, after `.gn-board__column-header > .gn-board__column-action`:

```css
/* COLLAPSIBLE COLUMNS (owner rulings 2026-09-29: "all columns are
   collapsible"; plan D27). The collapsed column is the same section, a 3.5rem
   strip (D13 amended), still a drop target; its one control fills it. It
   stretches to the rail's height with a 12rem floor, so beside expanded
   columns it is a full-height drop target and with EVERY column collapsed the
   board is a row of usable strips, not slivers (20.118). */
.gn-board__column--collapsed { flex: 0 0 3.5rem; min-width: 3.5rem; align-self: stretch; min-height: 12rem; }
.gn-board__column-strip {
  width: 100%;
  min-height: 2.75rem;
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0;
  border: none;
  border-radius: calc(var(--gn-radius-track) - 0.5rem);
  background: transparent;
  cursor: pointer;
  transition: background-color var(--gn-motion-feedback) ease-out;
}
.gn-board__column-strip:hover,
.gn-board__column-strip:focus-visible { background: var(--gn-fill-tertiary); }
.gn-board__column-strip:focus-visible { outline: 2px solid var(--gn-focus-ring); outline-offset: 0; }
.gn-board__column-strip-name {
  writing-mode: vertical-rl;
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--gn-text-muted);
}
/* The expanded header's collapse control — P-GHOST, icon-only, 44×44. */
.gn-board__column-collapse {
  min-width: 2.75rem;
  min-height: 2.75rem;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: var(--gn-text-subtle);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: background-color var(--gn-motion-feedback) ease-out, color var(--gn-motion-feedback) ease-out;
  margin-left: auto; /* far edge when there is no Close all (an empty Done) */
}
/* Close all already took the far edge (Task 5); the toggle sits right after it. */
.gn-board__column-action + .gn-board__column-collapse { margin-left: 0; }
.gn-board__column-collapse:hover,
.gn-board__column-collapse:focus-visible { background: var(--gn-fill-tertiary); color: var(--gn-text-muted); }
.gn-board__column-collapse:focus-visible { outline: 2px solid var(--gn-focus-ring); outline-offset: 0; }
```

  The strip's inner radius is the track's radius minus its 8px padding (rule 05). Its count reuses `.gn-board__count` (`textSubtle`, Task 5). `textMuted` over `fillTertiary` clears 4.5 in every style × theme (the measurement Task 6's 20.059 control records), and so does `textSubtle` on the track (20.001).

- [ ] **Step 5: Run to see them pass.** Then run the whole `packages/app-core` suite (the workflow-collapse and drag-drop suites must stay green) and the whole `packages/ui` suite, then build, typecheck and `pnpm check:help`. The two new accessible names are the only new strings.

- [ ] **Step 6: Catalogue.** Flip 20.111–20.118. Append to §17:

```markdown
- ✅ **Every board column collapses to a labelled strip** (styling refresh Plan A Task 5B; `packages/app-core/src/preferences/column-collapse.ts`, `board.tsx` column section, `ui.css` `.gn-board__column--collapsed`, `.gn-board__column-strip`, `.gn-board__column-collapse`) — owner rulings 2026-09-29 ("all columns are collapsible"). Every column, whatever its category, carries a 44×44 **Collapse <column>** control; collapsed, it is a 3.5rem strip at the rail's full height holding one button, **Expand <column>, N tickets**, with the name set vertically and the count, and it still takes drops. The column's cards, Close all (terminal columns) and Add a ticket (empty creatable columns) return on expand. With every column collapsed the board is a row of strips side by side; the workflow group's own collapse is separate. Remembered per user and per project in `localStorage` (the workflow-collapse shape), default expanded. Backlog is not a board column (spec §1.1), so it has no strip. Cases 20.111–20.118.
```

  Under the board bullet at `:182`, append: `  - ✅ **Collapsible columns (2026-09-29):** every column collapses to a labelled strip with its count, still a drop target, remembered locally. Cases 20.111–20.118.`

- [ ] **Step 7: Commit** `Styling A/Task 5B: every column collapses to a labelled strip (20.111-20.118)`. Then mutate, show red, restore.

---

### Task 6: The board card's content — one loud title, three groups, the keys row with `›`, a ghost footer, neutral priority ink

**Files:**
- Modify: `packages/app-core/src/views/board.tsx`:
  - the parent badge, `:1628-1637`: add the `›` span;
  - provenance + `{arrows}`, `:1658-1666`: wrap them in `gn-board-card__footer`.
- Modify: `packages/ui/src/ui.css`, in place:
  - delete the tint comment and rules `:1173-1194`;
  - `.gn-board-card__epic`, `:1210-1226`;
  - `.gn-board-card__parent-key`, `:1239-1253`;
  - `.gn-board-card__title`, `:1306-1315`;
  - `.gn-board-card__meta` and `__progress`, `:1316-1317`;
  - `.gn-board-card__due`, `:1336`;
  - `__meta-line`, `__key` and `__meta-sep`, `:1354-1365`;
  - the priority comment and rules, `:1366-1391`;
  - `.gn-board-card__provenance`, `:1392-1425`;
  - `__moves`, `__move` and their focus/disabled rules, `:1453-1477`;
  - the shared Close group and its focus/disabled groups, `:1511-1539`;
  - `.gn-board-card__notice`, `:1549`.
- Modify: `packages/ui/src/tokens.ts`. Retire:
  - the roles `priorityP1Tint`, `priorityP2Tint`, `priorityP3Tint` and `priorityP3`, with their `TOKEN_ROLES` docblock (`:911-940`);
  - their `themes` entries (`:988-991`, `:1029-1032`);
  - their primitives `priorityTintP1Light` … `priorityTintP3Dark` and `priorityInkP3Light`/`priorityInkP3Dark` (`:733-752`), with the docblock above them (from `:668`).
- Modify: `packages/ui/test/tokens.test.ts:677-755`: the 13.1453 block, rewritten in place.
- Modify: `packages/ui/test/components.test.tsx:1261-1271` (13.1467) and `apps/web/test/tap-target-density.test.ts:394-407` (13.1141).
- Create: `packages/app-core/test/views/board-styling.test.tsx`. Append to `packages/ui/test/styling-board.test.ts`.
- Modify: `test-cases/13-owner-requests-and-backlog.md:3803` (13.1452), `:3806` (13.1453) and `:3881` (13.1467); `test-cases/13-board-prototype-port.md:1786` (13.1141); `test-cases/20-styling-system.md`; `Features.md`.

**Interfaces:**
- Consumes: Task 5's `.gn-board-card` flex column.
- Produces:
  - `.gn-board-card__footer`, a `div` holding the provenance button and the `MoveArrows` node, in that order;
  - `.gn-board-card__parent-sep`, `<span aria-hidden="true">›</span>`, directly after the parent badge.
  - The pattern **P-GHOST** declarations, written out in full below; Plan B's dense-row tasks copy them verbatim.

**The owner's rulings this task carries:**
- every field stays;
- no tick (verified: `board.tsx` renders no check control; the terminal-only Close is at `:2374-2384`);
- `›` between the parent and the key.

The card's loud element is the TITLE.

Cases (`## 20.6 Board — the card's content`). The guard moves by **9**:

```markdown
- ❌ **20.051 — with a parent, the keys row reads parent `›` key: an `aria-hidden` `›` directly after the parent badge and before the key, so the accessible text is unchanged;** control: a card with no parent (and one whose parent IS its epic, 13.1458) draws no `›`. Mutation: delete the `›` span.
- ❌ **20.052 — a terminal card's buttons are exactly title, "who · when", the two move arrows and Close — no tick — and the footer holds "who · when" then the arrows;** control: the same card in a non-terminal column has no Close (four buttons). Mutation: render a `✓` button beside Close.
- ❌ **20.053 — the title is the one loud element: 15px/24px weight 500 in `text`, and every other text rule on the card is at most 13px;** control: the title's font-size is strictly larger than the epic's, the keys row's, the progress's, "who · when"'s and Close's. Mutation: set `.gn-board-card__meta-line` to `font-size: 0.9375rem`.
- ❌ **20.054 — three groups 16px apart and lines 8px apart: the people row and the footer each add 8px to the card's 8px gap, an EMPTY people row collapses and hands its 8px to the keys row, and the footer reaches 8px into the card's padding on three sides so the card does not grow;** control: the epic chip adds no margin of its own (the epic and title are one group). Mutation: delete the `:empty + meta-line` rule.
- ❌ **20.055 — the epic chip is a small filled chip: padding 4/8, radius 8, the house chip fill, text2 at 12px, 24px tall;** control: it keeps its `display: flex; width: fit-content` (13.1467). Mutation: set its `background` to `none`.
- ❌ **20.056 — a status chip on a card is plain third-tier text at 12px — no fill, no inset — while keeping its tone dot;** control: the shared `.gn-chip` rule keeps its fill everywhere else. Mutation: delete the `.gn-board-card__meta .gn-chip` rule.
- ❌ **20.057 — priority ink is neutral except Urgent: P1 `danger`, P2 `textMuted`, P3 `textSubtle`, each clearing 4.5 on the card ground in every style × theme; no card-level priority tint rule remains;** control: the priority badge still carries its icon's `currentColor` from one declaration per level. Mutation: restore `.gn-board-card__priority--p2 { color: var(--gn-success); }`.
- ❌ **20.058 — the keys row is 12px/16px third-tier text with 8px gaps; the key is 500 with tabular figures; the parent key is text2, underlined, borderless; a late due date is `danger` 600;** control: an on-time due date is `textSubtle` 400. Mutation: set `.gn-board-card__due--late`'s weight to 400.
- ❌ **20.059 — the footer's controls are borderless GHOST controls with ≥ 44px targets: "who · when" 44px tall, each arrow 44×44, Close and `Close all (N)` 44px tall; all pills; transparent at rest; on hover/focus a soft `fillTertiary` fill with the ink stepping up to `textMuted` and the 2px focus ring;** control: `textSubtle` over that fill in hig dark measures 4.03:1 (below 4.5), which is why the ink steps up, while `textMuted` clears 4.5 over it in every style × theme. Mutation: remove `color: var(--gn-text-muted)` from the hover rule.
```

- [ ] **Step 1: Write the cases.** +9.

- [ ] **Step 2: Write the failing markup test** `packages/app-core/test/views/board-styling.test.tsx`:

```tsx
import { render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { WorkflowDef } from '@gisik-nokma/domain';
import { Board, type BoardMoveCapability } from '../../src/views/board.js';
import type { BoardCard, BoardView } from '../../src/view-types.js';
import { createFakeDataSource } from '../helpers/fake-data-source.js';
import { WS, WF_ERRAND, boardCardSeed } from '../helpers/seed.js';

/**
 * Styling refresh Plan A, Task 6 — cases 20.051–20.052 (§20.6). The owner's
 * rulings on the mockup: "if parent is present, separate with >", "the tick
 * button shouldnt be there", and every field the card shows today stays.
 */
function boardWith(stateId: string, card: BoardCard): BoardView {
  const cardsFor = (column: string) => (column === stateId ? [card] : []);
  return {
    projectId: 'prj_1',
    groups: [
      {
        workflowId: 'wf-errand',
        workflowVersion: 1,
        workflowName: 'Errand',
        columns: [
          { stateId: 'todo', name: 'To do', category: 'open', blocked: false, creatable: true, cards: cardsFor('todo') },
          { stateId: 'doing', name: 'Doing', category: 'active', blocked: false, creatable: true, cards: cardsFor('doing') },
          { stateId: 'done', name: 'Done', category: 'terminal', blocked: false, creatable: false, cards: cardsFor('done') },
        ],
      },
    ],
  };
}

function moves(workflow: WorkflowDef = WF_ERRAND): BoardMoveCapability {
  return {
    dataSource: createFakeDataSource({ getWorkflowDef: async () => workflow }),
    workspaceId: WS,
    currentUserId: 'user_kiro',
    onMoved: vi.fn(),
  };
}

describe('20.051 the keys row separates the parent from the key with ›', () => {
  it('20.051 parent badge, then an aria-hidden ›, then the key; CONTROL: no parent, no ›', () => {
    const first = render(
      <Board
        board={boardWith('todo', boardCardSeed({ key: 'GN-15', parent: { ticketId: 'p_17', key: 'GN-17' } }))}
        onOpenTicket={() => {}}
      />,
    );
    const badge = screen.getByRole('button', { name: 'Open parent GN-17' });
    const sep = badge.nextElementSibling as HTMLElement;
    expect(sep).toHaveClass('gn-board-card__parent-sep');
    expect(sep).toHaveTextContent('›');
    expect(sep).toHaveAttribute('aria-hidden', 'true');
    expect(sep.nextElementSibling).toHaveTextContent('GN-15');
    expect(sep.nextElementSibling).toHaveClass('gn-board-card__key');
    first.unmount();

    render(<Board board={boardWith('todo', boardCardSeed({ key: 'GN-15' }))} onOpenTicket={() => {}} />);
    expect(document.querySelector('.gn-board-card__parent-sep')).toBeNull();
  });
});

describe('20.052 a terminal card has no tick, and its footer holds who·when then the arrows', () => {
  async function buttonsOf(stateId: string): Promise<string[]> {
    render(<Board board={boardWith(stateId, boardCardSeed())} onOpenTicket={() => {}} moves={moves()} />);
    await waitFor(() => expect(screen.getAllByRole('button', { name: /Move to/ }).length).toBeGreaterThan(0));
    const card = document.querySelector('.gn-board-card') as HTMLElement;
    return within(card)
      .getAllByRole('button')
      .map((button) => button.className);
  }

  it('20.052 title, provenance, previous, next, Close — in that order, nothing else', async () => {
    expect(await buttonsOf('done')).toEqual([
      'gn-board-card__title',
      'gn-board-card__provenance',
      'gn-board-card__move',
      'gn-board-card__move',
      'gn-board-card__close',
    ]);
    const footer = document.querySelector('.gn-board-card__footer') as HTMLElement;
    expect(footer.firstElementChild).toHaveClass('gn-board-card__provenance');
    expect(footer.querySelector('.gn-board-card__moves')).not.toBeNull();
    expect(document.querySelector('.gn-board-card')?.textContent).not.toMatch(/[✓✔]/);
  });

  it('20.052 CONTROL — a non-terminal card has no Close', async () => {
    expect(await buttonsOf('doing')).toEqual([
      'gn-board-card__title',
      'gn-board-card__provenance',
      'gn-board-card__move',
      'gn-board-card__move',
    ]);
  });
});
```

(`createFakeDataSource`'s first argument overrides reads, exactly as `board-close.test.tsx:62-70` uses it. If `WF_ERRAND` declares no `doing`→`todo` transition, the previous arrow still renders, disabled. `within(...).getAllByRole('button')` includes disabled buttons.)

- [ ] **Step 3: Append the failing CSS tests** to `packages/ui/test/styling-board.test.ts`:

```ts
import { CONTRAST_PAIRS, colorOf, type StyleName, type ThemeName } from '../src/tokens.js';
import { contrastRatio, over } from './helpers/contrast.js';

const STYLES: StyleName[] = ['hig', 'minimal', 'neo'];
const THEMES: ThemeName[] = ['light', 'dark'];
const rem = (value: string | null): number => Number.parseFloat(value ?? 'NaN');

describe('20.053 the title is the one loud element', () => {
  it('20.053 15/24 at 500 in text; everything else on the card is at most 13px', () => {
    const title = ruleExactly(CSS, '.gn-board-card__title');
    expect(valueOf(title, 'font-size')).toBe('0.9375rem');
    expect(valueOf(title, 'line-height')).toBe('1.5rem');
    expect(valueOf(title, 'font-weight')).toBe('500');
    expect(valueOf(title, 'color')).toBe('var(--gn-text)');
    const others = [
      '.gn-board-card__epic',
      '.gn-board-card__meta-line',
      '.gn-board-card__progress',
      '.gn-board-card__provenance',
      ['.gn-board-card__close', '.gn-board__column-action'],
    ] as const;
    for (const selector of others) {
      const size = rem(valueOf(ruleExactly(CSS, selector), 'font-size'));
      expect(size, String(selector)).toBeLessThanOrEqual(0.8125);
      // CONTROL — strictly smaller than the title.
      expect(size).toBeLessThan(rem(valueOf(title, 'font-size')));
    }
  });
});

describe('20.054 three groups 16 apart, lines 8 apart, the footer inside the padding', () => {
  it('20.054 margins that add to the 8px gap, the empty people row collapses', () => {
    expect(valueOf(ruleExactly(CSS, '.gn-board-card__meta'), 'margin-top')).toBe('0.5rem');
    expect(valueOf(ruleExactly(CSS, '.gn-board-card__meta:empty'), 'display')).toBe('none');
    expect(valueOf(ruleExactly(CSS, '.gn-board-card__meta:empty + .gn-board-card__meta-line'), 'margin-top')).toBe('0.5rem');
    const footer = ruleExactly(CSS, '.gn-board-card__footer');
    expect(valueOf(footer, 'margin')).toBe('0.5rem -0.5rem -0.5rem');
    expect(valueOf(footer, 'display')).toBe('flex');
    expect(valueOf(footer, 'flex-wrap')).toBe('wrap');
    // CONTROL — the epic and title are one group: the chip adds no margin.
    expect(valueOf(ruleExactly(CSS, '.gn-board-card__epic'), 'margin')).toBe('0');
  });
});

describe('20.055 the epic chip', () => {
  it('20.055 padding 4/8, radius 8, chip fill, text2 12px, 24px tall', () => {
    const epic = ruleExactly(CSS, '.gn-board-card__epic');
    expect(valueOf(epic, 'padding')).toBe('0.25rem 0.5rem');
    expect(valueOf(epic, 'border-radius')).toBe('0.5rem');
    expect(valueOf(epic, 'background')).toBe('var(--gn-fill-tertiary)');
    expect(valueOf(epic, 'color')).toBe('var(--gn-text-muted)');
    expect(valueOf(epic, 'font-size')).toBe('0.75rem');
    expect(valueOf(epic, 'min-height')).toBe('1.5rem');
    // CONTROL — 13.1467's block-level shape is kept.
    expect(valueOf(epic, 'display')).toBe('flex');
    expect(valueOf(epic, 'width')).toBe('fit-content');
  });
});

describe('20.056 a status chip on a card is plain third-tier text', () => {
  it('20.056 no fill, no inset, 12px textSubtle; the shared chip keeps its fill', () => {
    const chip = ruleExactly(CSS, '.gn-board-card__meta .gn-chip');
    expect(valueOf(chip, 'background')).toBe('transparent');
    expect(valueOf(chip, 'box-shadow')).toBe('none');
    expect(valueOf(chip, 'padding')).toBe('0');
    expect(valueOf(chip, 'font-size')).toBe('0.75rem');
    expect(valueOf(chip, 'color')).toBe('var(--gn-text-subtle)');
    // CONTROL — everywhere else a chip is still a filled pill.
    expect(valueOf(ruleExactly(CSS, '.gn-chip'), 'background')).toBe('var(--gn-fill-tertiary)');
  });
});

describe('20.057 priority ink is neutral except Urgent', () => {
  it('20.057 P1 danger, P2 text2, P3 text3 — each ≥ 4.5 on the card ground — and no card tint remains', () => {
    const ink = { p1: 'danger', p2: 'textMuted', p3: 'textSubtle' } as const;
    for (const [level, role] of Object.entries(ink)) {
      const cssVar = `var(--gn-${role.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)})`;
      expect(valueOf(ruleExactly(CSS, `.gn-board-card__priority--${level}`), 'color'), level).toBe(cssVar);
      for (const style of STYLES) {
        for (const theme of THEMES) {
          expect(
            contrastRatio(colorOf(theme, role, style), colorOf(theme, 'surfaceRaised', style)),
            `${level} ${style}/${theme}`,
          ).toBeGreaterThanOrEqual(4.5);
        }
      }
      expect(rulesNaming(CSS, `.gn-board-card--${level}`), `card tint for ${level}`).toEqual([]);
    }
    // CONTROL — the badge base rule still exists (the icon inherits currentColor from it).
    expect(valueOf(ruleExactly(CSS, '.gn-board-card__priority'), 'display')).toBe('inline-flex');
  });
});

describe('20.058 the keys row', () => {
  it('20.058 12/16 text3 with 8px gaps; key 500 tabular; parent text2 underlined; late danger 600', () => {
    const line = ruleExactly(CSS, '.gn-board-card__meta-line');
    expect(valueOf(line, 'font-size')).toBe('0.75rem');
    expect(valueOf(line, 'line-height')).toBe('1rem');
    expect(valueOf(line, 'color')).toBe('var(--gn-text-subtle)');
    expect(valueOf(line, 'gap')).toBe('0.5rem');
    const key = ruleExactly(CSS, '.gn-board-card__key');
    expect(valueOf(key, 'font-weight')).toBe('500');
    expect(valueOf(key, 'font-variant-numeric')).toBe('tabular-nums');
    const parent = ruleExactly(CSS, '.gn-board-card__parent-key');
    expect(valueOf(parent, 'color')).toBe('var(--gn-text-muted)');
    expect(valueOf(parent, 'text-decoration')).toBe('underline');
    expect(valueOf(parent, 'border')).toBe('none');
    expect(valueOf(ruleExactly(CSS, '.gn-board-card__parent-sep'), 'margin')).toBe('0 -0.25rem');
    const late = ruleExactly(CSS, '.gn-board-card__due--late');
    expect(valueOf(late, 'color')).toBe('var(--gn-danger)');
    expect(valueOf(late, 'font-weight')).toBe('600');
    // CONTROL — on time is third tier, regular weight.
    expect(valueOf(ruleExactly(CSS, '.gn-board-card__due'), 'color')).toBe('var(--gn-text-subtle)');
    expect(valueOf(ruleExactly(CSS, '.gn-board-card__due'), 'font-weight')).toBeNull();
  });
});

describe('20.059 the footer controls are ghost controls with real targets', () => {
  it('20.059 44px targets, pills, transparent, fill + ink step + ring on hover/focus', () => {
    const provenance = ruleExactly(CSS, '.gn-board-card__provenance');
    expect(valueOf(provenance, 'min-height')).toBe('2.75rem');
    const move = ruleExactly(CSS, '.gn-board-card__move');
    expect(valueOf(move, 'min-height')).toBe('2.75rem');
    expect(valueOf(move, 'min-width')).toBe('2.75rem');
    const close = ruleExactly(CSS, ['.gn-board-card__close', '.gn-board__column-action']);
    expect(valueOf(close, 'min-height')).toBe('2.75rem');
    for (const body of [provenance, move, close]) {
      expect(valueOf(body, 'border')).toBe('none');
      expect(valueOf(body, 'border-radius')).toBe('999px');
      expect(valueOf(body, 'background')).toBe('transparent');
    }
    const lit = ruleExactly(CSS, [
      '.gn-board-card__provenance:hover',
      '.gn-board-card__provenance:focus-visible',
      '.gn-board-card__move:hover:not(:disabled)',
      '.gn-board-card__move:focus-visible',
      '.gn-board-card__close:hover:not(:disabled)',
      '.gn-board-card__close:focus-visible',
      '.gn-board__column-action:hover:not(:disabled)',
      '.gn-board__column-action:focus-visible',
    ]);
    expect(valueOf(lit, 'background')).toBe('var(--gn-fill-tertiary)');
    expect(valueOf(lit, 'color')).toBe('var(--gn-text-muted)');
    const ring = ruleExactly(CSS, [
      '.gn-board-card__provenance:focus-visible',
      '.gn-board-card__move:focus-visible',
      '.gn-board-card__close:focus-visible',
      '.gn-board__column-action:focus-visible',
    ]);
    expect(valueOf(ring, 'outline')).toBe('2px solid var(--gn-focus-ring)');
    for (const style of STYLES) {
      for (const theme of THEMES) {
        const lifted = over(colorOf(theme, 'fillTertiary', style), colorOf(theme, 'surfaceRaised', style));
        expect(contrastRatio(colorOf(theme, 'textMuted', style), lifted), `${style}/${theme}`).toBeGreaterThanOrEqual(4.5);
      }
    }
    // CONTROL — why the ink steps up: textSubtle over the same fill fails 4.5 in hig dark.
    const higDark = over(colorOf('dark', 'fillTertiary', 'hig'), colorOf('dark', 'surfaceRaised', 'hig'));
    expect(contrastRatio(colorOf('dark', 'textSubtle', 'hig'), higDark)).toBeLessThan(4.5);
    expect(CONTRAST_PAIRS.length).toBe(44);
  });
});
```

(Merge the imports into the file's existing import lines.)

- [ ] **Step 4: Run to see both files fail.**
  - Build, then `cd packages/ui && pnpm exec vitest run --no-file-parallelism test/styling-board.test.ts > /tmp/styling-a-ui.log 2>&1; tail -20 /tmp/styling-a-ui.log`.
  - Then `cd packages/app-core && pnpm exec vitest run --no-file-parallelism test/views/board-styling.test.tsx > /tmp/styling-a-core.log 2>&1; tail -20 /tmp/styling-a-core.log`.
  - Expected: 20.051 FAILS (there is no `›`). 20.052's first arm FAILS (there is no footer; the button list already matches, which is the no-tick fact). 20.053–20.059 FAIL.

- [ ] **Step 5: Implement.**
  1. **Markup** (`board.tsx`). Replace the parent badge block (`:1628-1637`) with:

```tsx
        {showParentBadge ? (
          <>
            <button
              type="button"
              className="gn-board-card__parent-key"
              aria-label={`Open parent ${card.parent?.key}`}
              onClick={() => onOpenTicket((card.parent as NonNullable<BoardCardData['parent']>).ticketId)}
            >
              {card.parent?.key}
            </button>
            {/* Owner ruling (2026-09-29, styling refresh): "if parent is
                present, separate with >" — the `›` the sheet's breadcrumb
                already uses. `aria-hidden`: the badge's own name ("Open parent
                GN-17") already says what it is, and a spoken "›" is noise. */}
            <span className="gn-board-card__parent-sep" aria-hidden="true">
              ›
            </span>
          </>
        ) : null}
```

Then replace the provenance button and `{arrows}` (`:1658-1666`) with:

```tsx
      {/* The card's FOOTER (styling refresh Plan A Task 6): "who · when" and
          the move arrows share one row that reaches into the card's padding,
          so 44px targets do not grow the card. Layout only — both children
          are exactly what they were. */}
      <div className="gn-board-card__footer">
        <button
          type="button"
          className="gn-board-card__provenance"
          aria-expanded={unfolded}
          onClick={() => setUnfolded((value) => !value)}
        >
          {unfolded ? formatStateProvenance(stateName, card.stateProvenance) : 'who · when'}
        </button>
        {arrows}
      </div>
```

  2. **CSS** (`ui.css`, in place):
     - a. Delete the priority-tint comment and the three `.gn-board-card--p1/--p2/--p3` rules (`:1173-1194`). The modifier CLASSES stay on the card in `board.tsx:1580` as hooks (13.1452); they now paint nothing.
     - b. `.gn-board-card__epic` (`:1210-1226`): `margin: 0 0 0.3rem;` → `margin: 0;`; `padding: 0;` → `padding: 0.25rem 0.5rem;`; `border: none;` stays; `background: none;` → `background: var(--gn-fill-tertiary);`; add `border-radius: 0.5rem;` and `line-height: 1rem;`. Append to its comment: `Styling refresh (Plan A Task 6): a small filled chip — padding 4/8, radius 8, the house chip fill (plan D19) — and no margin, because the epic and the title are ONE group (8px apart via the card's gap).`
     - c. `.gn-board-card__parent-key` (`:1239-1253`): `font-size: 0.8rem;` → `font-size: 0.75rem;`; `color: var(--gn-text-accent);` → `color: var(--gn-text-muted);` (underline only, text2; the accent is saved for the action, rule 03).
     - d. `.gn-board-card__title` (`:1306-1315`): replace `font-weight: 600;` with `font-size: 0.9375rem;`, `line-height: 1.5rem;` and `font-weight: 500;`.
     - e. `.gn-board-card__meta` (`:1316`) → `.gn-board-card__meta { display: flex; align-items: center; gap: 0.5rem; margin-top: 0.5rem; flex-wrap: wrap; }`. `.gn-board-card__progress` (`:1317`) → `.gn-board-card__progress { color: var(--gn-text-muted); font-size: 0.75rem; font-weight: 600; }`. After them, add:

```css
/* Three groups, 16 apart (rule 02): the card's own gap is 8, so the people row
   and the footer each add 8 of margin. A card with no assignee, chips or
   rollup renders the people row EMPTY (React emits no children), and it must
   not leave an 8px hole — it collapses and hands its 8 to the keys row. */
.gn-board-card__meta:empty { display: none; }
.gn-board-card__meta:empty + .gn-board-card__meta-line { margin-top: 0.5rem; }
/* A status chip on a card is plain third-tier text (the mockup,
   `Main.dc.html:91`) — no fill, no inset — but it KEEPS its tone dot: the dot
   is the chip's only non-text carrier of its tone (plan D15). Same specificity
   as `[data-style="neo"] .gn-chip` (`:194`), declared later, so it wins. */
.gn-board-card__meta .gn-chip {
  background: transparent;
  box-shadow: none;
  padding: 0;
  font-size: 0.75rem;
  line-height: 1rem;
  color: var(--gn-text-subtle);
}
```

(`.gn-board-card__meta .gn-chip` is (0,2,0), the same as `[data-style="neo"] .gn-chip` (`ui.css:194`) and `[data-style="minimal"] .gn-chip` (`:180`). It is declared ~1100 lines later, so it wins on source order. Keep it BELOW `:194`.)

     - f. `.gn-board-card__due` (`:1336`) → `.gn-board-card__due { color: var(--gn-text-subtle); font-size: 0.75rem; }`. `__due--late` (`:1337`) is unchanged.
     - g. `.gn-board-card__meta-line` (`:1354-1363`): `gap: 0.375rem;` → `gap: 0.5rem;`; `margin: 0.25rem 0 0;` → `margin: 0;`; `font-size: 0.8rem;` → `font-size: 0.75rem;`; `line-height: 1.125rem;` → `line-height: 1rem;`; `color: var(--gn-text-muted);` → `color: var(--gn-text-subtle);`. Then:

```css
.gn-board-card__key { color: var(--gn-text-subtle); font-weight: 500; font-variant-numeric: tabular-nums; }
.gn-board-card__meta-sep { color: var(--gn-text-subtle); }
/* The owner's `›` between parent and key; pulled in by 4px on each side so the
   8px row gap does not leave it floating (`Main.dc.html:97`). */
.gn-board-card__parent-sep { margin: 0 -0.25rem; color: var(--gn-text-subtle); }
```

     - h. Replace the priority comment and rules (`:1366-1391`) with:

```css
/* THE PRIORITY BADGE — styling refresh Plan A Task 6 (2026-09-29). The icon
   is the SHAPE that tells the levels apart on every card (fire, leaf,
   snowflake — `packages/ui/src/icons/priority-icons.tsx`); the INK is neutral
   except Urgent (the planner's rules-application decision, owner-seen in the
   mockup): one accent saved for the action, one loud element per card (layout
   rules 01, 03). P1 `danger`, P2 text2, P3 text3 — each ≥ 4.5 on the card's
   ground in every style×theme (case 20.057). This SUPERSEDES the owner's
   2026-09-23 request (red fire / green leaf / blue snowflake on a card tinted
   by its priority): the tint rules and their four roles are retired (plan D11,
   confirmed by the owner 2026-09-29). The icon inherits this element's `color`
   through `currentColor`, so one declaration per level sets both. */
.gn-board-card__priority {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  color: var(--gn-text-subtle);
  font-size: 0.75rem;
  font-weight: 600;
}
.gn-board-card__priority--p1 { color: var(--gn-danger); }
.gn-board-card__priority--p2 { color: var(--gn-text-muted); }
.gn-board-card__priority--p3 { color: var(--gn-text-subtle); }
```

     - i. Before `.gn-board-card__provenance` (`:1392`), add:

```css
/* The card's FOOTER: "who · when" left, the arrows (and Close) right, one row.
   `margin: 0.5rem -0.5rem -0.5rem` — 8 of margin on top of the card's 8px gap
   makes the 16 between groups; the negative sides and bottom let the 44px
   targets reach 8px into the card's 16px padding, so the card does not grow
   (the mockup, `Main.dc.html:109`). Wraps when "who · when" unfolds into a
   long sentence, so the arrows drop to their own line rather than shrink. */
.gn-board-card__footer {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  margin: 0.5rem -0.5rem -0.5rem;
}
```

     - j. Replace `.gn-board-card__provenance`'s declarations (`:1392-1425`, keeping its comment) with the ones below. Append to its comment: `Styling refresh (Plan A Task 6): now a 44px ghost control in the footer — the 24px dense-in-list floor this comment argued for is superseded by the owner-approved card (\`Main.dc.html:110\`), and \`DENSE_IN_LIST\` keeps its entry (a 44px target passes a 24px floor).`

```css
.gn-board-card__provenance {
  display: inline-flex;
  align-items: center;
  flex: 1 1 auto;
  min-width: 0;
  min-height: 2.75rem;
  margin-right: auto;
  padding: 0 0.5rem;
  border: none;
  border-radius: 999px;
  background: transparent;
  font: inherit;
  font-size: 0.75rem;
  color: var(--gn-text-subtle);
  cursor: pointer;
  text-align: left;
  transition: background-color var(--gn-motion-feedback) ease-out, color var(--gn-motion-feedback) ease-out;
}
```

     - k. `.gn-board-card__moves` (`:1453`) → `.gn-board-card__moves { display: flex; align-items: center; justify-content: flex-end; flex-wrap: wrap; margin: 0; }`. Then replace `.gn-board-card__move` (`:1454-1468`, keep its comment `:1426-1452`) and its `:focus-visible` (`:1469-1472`) with:

```css
.gn-board-card__move {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 2.75rem; /* 44px — rule 01's floor ("under 44 thumbs miss it") */
  min-width: 2.75rem;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: var(--gn-text-subtle);
  font: inherit;
  font-size: 1.125rem;
  font-weight: 600;
  cursor: pointer;
  transition: background-color var(--gn-motion-feedback) ease-out, color var(--gn-motion-feedback) ease-out;
}
```

`.gn-board-card__move:disabled` (`:1477`) is unchanged.

     - l. Split the board out of the shared Close group (`:1511-1539`, plan D22). Remove `.gn-board-card__close,` and `.gn-board__column-action,` from the base group (`:1511-1514`), from the `:focus-visible` group (`:1529-1532`) and from the `:disabled` group (`:1536-1539`). The groups keep `.gn-row-action` and `.gn-list__bulk-close`, which Plan B's List task restyles. Directly after the `:disabled` group, add:

```css
/* The board's text actions — Close on a terminal card, `Close all (N)` in a
   terminal column's header — are GHOST controls like the card's other footer
   controls (the mockup, `Main.dc.html:115`): borderless, transparent, a 44px
   pill, text2 13px/600. Split out of the List's shared group 2026-09-29
   (styling refresh Plan A Task 6); the List keeps the old constant until
   Plan B restyles it. */
.gn-board-card__close,
.gn-board__column-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 2.75rem;
  padding: 0 0.75rem;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: var(--gn-text-muted);
  font: inherit;
  font-size: 0.8125rem;
  font-weight: 600;
  cursor: pointer;
  transition: background-color var(--gn-motion-feedback) ease-out;
}
/* Pattern P-GHOST's lit state for every footer control: a soft neutral fill
   within the feedback time, and the ink steps UP a tier — `textSubtle` over
   this fill measures 4.03:1 in hig dark (case 20.059), `textMuted` clears
   4.5 in every style×theme. */
.gn-board-card__provenance:hover,
.gn-board-card__provenance:focus-visible,
.gn-board-card__move:hover:not(:disabled),
.gn-board-card__move:focus-visible,
.gn-board-card__close:hover:not(:disabled),
.gn-board-card__close:focus-visible,
.gn-board__column-action:hover:not(:disabled),
.gn-board__column-action:focus-visible {
  background: var(--gn-fill-tertiary);
  color: var(--gn-text-muted);
}
.gn-board-card__provenance:focus-visible,
.gn-board-card__move:focus-visible,
.gn-board-card__close:focus-visible,
.gn-board__column-action:focus-visible {
  outline: 2px solid var(--gn-focus-ring);
  outline-offset: 0;
}
.gn-board-card__close:disabled,
.gn-board__column-action:disabled { opacity: 0.4; cursor: not-allowed; }
```

     - m. After `.gn-board-card__notice { display: contents; }` (`:1549`), add `.gn-board-card__notice > .gn-refusal { flex-basis: 100%; }`, with the comment: `/* A move refusal takes its own line under the arrows rather than squeezing beside them in the footer row. */`
  3. **Tokens.**
     - Delete from `TOKEN_ROLES` the four entries `'priorityP1Tint'`, `'priorityP2Tint'`, `'priorityP3Tint'` and `'priorityP3'`, with the docblock above them (`:911-939`).
     - Delete their four entries in each of `themes.light` and `themes.dark`.
     - Delete the primitives `priorityTintP1Light`, `priorityTintP1Dark`, `priorityTintP2Light`, `priorityTintP2Dark`, `priorityInkP3Light`, `priorityInkP3Dark`, `priorityTintP3Light` and `priorityTintP3Dark`, with the docblock above the first of them.
     - `git grep -n "priorityP[123]\|priority-p[123]\|priorityTint\|priorityInkP3" -- packages apps` must then print only the markup class names `gn-board-card--p1` etc. and `gn-board-card__priority--p*`.
  4. **13.1453** (`tokens.test.ts`, the `describe` beginning at `:697` and its docblock `:677-696`). Replace it with:

```ts
/**
 * 13.1453 — AMENDED 2026-09-29 by the styling refresh (Plan A Task 6, case
 * 20.057). The per-priority card tint (owner request 2026-09-23) is retired:
 * the owner-approved mockup draws no tint, and the ink is neutral except
 * Urgent. The property this case now holds is the one a reader needs: every
 * ink the priority badge draws clears 4.5 on the card's own ground, in every
 * style × theme — and the four tint/ink roles are gone, so nothing can paint
 * them by accident.
 */
describe('13.1453 the priority ink clears 4.5 on the card ground; the tint roles are retired', () => {
  const INKS: { label: string; ink: TokenRole }[] = [
    { label: 'P1', ink: 'danger' },
    { label: 'P2', ink: 'textMuted' },
    { label: 'P3', ink: 'textSubtle' },
  ];
  for (const { label, ink } of INKS) {
    for (const style of STYLE_NAMES) {
      for (const theme of THEME_NAMES) {
        it(`13.1453 ${label} ${style}/${theme}: ${ink} on surfaceRaised ≥ 4.5`, () => {
          expect(
            contrastRatio(colorOf(theme, ink, style), colorOf(theme, 'surfaceRaised', style)),
          ).toBeGreaterThanOrEqual(4.5);
        });
      }
    }
  }
  it('13.1453 the four priority tint/ink roles no longer exist', () => {
    for (const role of ['priorityP1Tint', 'priorityP2Tint', 'priorityP3Tint', 'priorityP3']) {
      expect((TOKEN_ROLES as readonly string[]).includes(role), role).toBe(false);
    }
  });
});
```

  5. **13.1467** (`components.test.tsx:1269-1270`). Replace `expect(body).toMatch(/margin:\s*0 0 0\.3rem\s*;/);` and its comment with:

```ts
    // The declarations unique to this rule — proof `rule()`'s first-match regex
    // landed on THIS rule. Amended 2026-09-29 (styling refresh, 20.055): the
    // chip is now padded 4/8 with radius 8 and no margin of its own.
    expect(body).toMatch(/padding:\s*0\.25rem 0\.5rem\s*;/);
    expect(body).toMatch(/border-radius:\s*0\.5rem\s*;/);
```

  6. **13.1141** (`apps/web/test/tap-target-density.test.ts:406`): `expect(m?.[1]).toMatch(/min-height:\s*1\.5rem/);` → `expect(m?.[1]).toMatch(/min-height:\s*2\.75rem/);`. Add a comment: `// Amended 2026-09-29 (styling refresh Plan A, 20.059): 44px, above the 24px in-list floor the table still declares.` Note that 13.1141's extractor (`:400-405`) regex-matches the FIRST `.gn-board-card__provenance {` after stripping comments, and that is still `:1392`'s rule.

- [ ] **Step 6: Run to see them pass.**
  - Build.
  - `packages/ui` in full (13.1451, 13.1452's CSS half, 13.1453, 13.1467, 13.513 and 13.523 green).
  - `packages/app-core` in full. `board.test.tsx` 13.1237/13.1238/13.1281/13.1452, `board-card-click.test.tsx` 13.1454–13.1458 and `board-close.test.tsx` 13.589 must stay green: the `›` sits after the badge, which is still the meta-line's first child, and 13.1281's cards carry no parent.
  - `apps/web` `tap-target-density.test.ts`.
  - `pnpm --filter @gisik-nokma/ui typecheck` and `pnpm --filter @gisik-nokma/app-core typecheck`.

- [ ] **Step 7: Catalogue.**
  - Flip 20.051–20.059.
  - Amend 13.1452 (`test-cases/13-owner-requests-and-backlog.md:3803`): "Amended 2026-09-29 by 20.057 (styling refresh Plan A): the modifier class stays on the card as a hook, but no rule paints a tint any more (the mockup draws none; plan D11)."
  - Amend 13.1453 (`:3806`): "Amended 2026-09-29 by 20.057: the tint is retired; the case now pins every priority ink (P1 danger, P2 textMuted, P3 textSubtle) at ≥ 4.5 on `surfaceRaised` in every style × theme, and that the four tint/ink roles are gone."
  - Amend 13.1467 (`:3881`): "Amended 2026-09-29 by 20.055: the first-match proof now reads the chip's new padding and radius; its margin is 0 (the epic and title are one group)."
  - Amend 13.1141 (`test-cases/13-board-prototype-port.md:1786`): "Amended 2026-09-29 by 20.059: the floor is now 44px (a ghost control in the card's footer); the `DENSE_IN_LIST` classification is kept, and a 44px target satisfies it."
  - Append to §17:

```markdown
- ✅ **The board card reads title-first** (styling refresh Plan A Task 6; `board.tsx` card, `ui.css` `.gn-board-card__*`) — every field stays (owner, 2026-09-29), in three groups 16px apart with lines 8px apart: (epic chip + title) / (people row + keys row) / footer. The title is the one loud element (15/24, 500). The epic is a small filled chip; a status chip is plain third-tier text that keeps its tone dot; the keys row is 12px third-tier text reading `parent › key priority · due` (the owner's `›`, `aria-hidden`), with the parent underlined in text2 and a late due date in red 600. Priority ink is neutral except Urgent — P1 red, P2 text2, P3 text3, each ≥ 4.5 — and the icon (fire/leaf/snowflake) carries the level; the per-priority card tint is retired (plan D11). The footer holds "who · when" and the move arrows (and Close on terminal columns — no tick) as borderless ghost controls with 44px targets that reach into the card's padding; hover/focus shows a soft fill, steps the ink up a tier and draws the focus ring. Cases 20.051–20.059.
```

  - Under `:55` (Board view), append: `  - ✅ **Styling refresh (2026-09-29):** the card's content follows the rules (title-first, three groups, `›` between parent and key, neutral priority ink, ghost footer, no tick). Cases 20.051–20.059.`

- [ ] **Step 8: Commit** `Styling A/Task 6: the board card — title-first, groups, › keys row, ghost footer, neutral priority (20.051-20.059)`. Then mutate, show red, restore.

---

### Task 7: The ticket sheet — a panel lit from its edge, 24 around, a loud title, the fields in a well

**Files:**
- Modify: `packages/ui/src/ui.css`, in place:
  - `.gn-sheet`, `:399-404`;
  - the `.gn-dialog__header, .gn-sheet__header` group, `:525-532`;
  - `.gn-sheet__full`, `:502-523`;
  - `.gn-sheet__title`, `:591-595`;
  - `.gn-ticket-sheet__title-input`, `:789-800`;
  - the `.gn-dialog__close, .gn-sheet__close` group, `:830-845`;
  - the `.gn-dialog__body, .gn-sheet__body` group, `:846-847`;
  - `.gn-ticket-sheet__footer`, `:2313-2321`;
  - `.gn-ticket-sheet__delete`, `:2348-2358`;
  - `.gn-ticket-sheet__fields`, `:2503`;
  - `.gn-ticket-sheet__field dt`, `:2526`;
  - `.gn-ticket-sheet__field--tinted dt/dd`, `:2528-2529`;
  - `.gn-ticket-sheet__caption`, `:2536`.
- Create: `packages/ui/test/styling-sheet.test.ts`.
- Modify: `packages/ui/test/components.test.tsx`: 13.1148 at `:1941-1945`, and 16.84's radius assertion (the `border-radius: var(--gn-radius-control)` line in the `it` at `:832`).
- Modify: `test-cases/13-board-prototype-port.md:1967` (13.1148), `test-cases/16-remaining-doors.md:572` (16.84), `test-cases/20-styling-system.md`, `Features.md`.

**Interfaces:**
- Consumes: Tasks 1–4 (`--gn-surface-well`, `--gn-shadow-track`, `--gn-shadow-sheet`, `--gn-radius-track`, P-QUIET).
- Produces: pattern **P-WELL** in use, and the sheet/dialog header, body and dismiss spacing every overlay inherits. The header, body and close rules are SHARED groups with `.gn-dialog`, so every dialog gets 24-around spacing and the ghost close too, deliberately.

**The loud element on the sheet: its TITLE** (D16). The sheet has no primary: `Move…`, `Close` and `Reopen` are ghost `Button`s (`ticket-sheet.tsx:3321-3348`), which became P-QUIET in Task 3. The mockup's "Start work" primary and its comment-composer footer are not built.

Cases (`## 20.7 The ticket sheet`). The guard moves by **7**:

```markdown
- ❌ **20.071 — the sheet panel docks with the track radius on its two left corners and the `sheet` shadow (a lit inner left edge, a shadow falling away to the left);** control: the full-screen variant still has no radius and no shadow. Mutation: remove `box-shadow` from `.gn-sheet`.
- ❌ **20.072 — sheet and dialog alike are 24 around: the header 24/24/16, the body 0/24/24, 8px between header items;** control: the body still scrolls (`overflow-y: auto`). Mutation: restore `padding: 1rem 1.1rem` on the body group.
- ❌ **20.073 — the overlay dismiss control is a ghost icon — a transparent 44px circle in text2, a `fillTertiary` fill and the focus ring on hover/focus — and Full screen is a quiet control with the accessible edge;** control: both keep 13.1148's 44px floor. Mutation: restore `background: var(--gn-fill-tertiary)` on the close group.
- ❌ **20.074 — the sheet's title is the loud element: 26px/32px at 700 with −0.01em tracking, on both the static title and the editable title input;** control: the dialog title keeps its own smaller step. Mutation: set `.gn-ticket-sheet__title-input` to `font-weight: 600`.
- ❌ **20.075 — the ticket's fields sit in a WELL: the `surfaceWell` ground, the `track` inset, the card radius, 8px padding, 24px below what precedes it; the striped rows inside take the card radius minus that padding (rule 05) in every style;** control: 16.116's stripe is still drawn (the `--tinted` rows keep their `fillQuaternary`). Mutation: set the tinted row radius back to `0.5rem`.
- ❌ **20.076 — section captions are sentence-case 15px/600 in `text` (no uppercase tracking), and field labels are 13px `textSubtle`, so values read as the second tier and labels the third;** control: the value column keeps the `text` colour it inherits. Mutation: restore `text-transform: uppercase` on the caption.
- ❌ **20.077 — the sheet footer is separated by a decorative `fillSecondary` hairline and 24px, and Delete is a pill that shows a soft fill on hover;** control: 16.84's Delete stays danger-ink on transparent with no border. Mutation: restore `border-radius: var(--gn-radius-control)` on Delete.
```

- [ ] **Step 1: Write the cases.** +7.

- [ ] **Step 2: Write the failing test** `packages/ui/test/styling-sheet.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { readUiCss, ruleExactly, valueOf } from './helpers/css-rules.js';

/**
 * Styling refresh Plan A, Task 7 — cases 20.071–20.077 (§20.7). The approved
 * sheet (`Sheet.dc.html:26-101`), translated; its "Start work" primary and its
 * comment footer are not built (plan D16) — the title is the loud element.
 */
const CSS = readUiCss();
const HEADER = ['.gn-dialog__header', '.gn-sheet__header'] as const;
const BODY = ['.gn-dialog__body', '.gn-sheet__body'] as const;
const CLOSE = ['.gn-dialog__close', '.gn-sheet__close'] as const;

describe('20.071 the sheet panel', () => {
  it('20.071 track radius on the left corners, the sheet shadow; full screen has neither', () => {
    const sheet = ruleExactly(CSS, '.gn-sheet');
    expect(valueOf(sheet, 'border-radius')).toBe('var(--gn-radius-track) 0 0 var(--gn-radius-track)');
    expect(valueOf(sheet, 'box-shadow')).toBe('var(--gn-shadow-sheet)');
    // CONTROL
    const full = ruleExactly(CSS, '.gn-sheet--full');
    expect(valueOf(full, 'border-radius')).toBe('0');
    expect(valueOf(full, 'box-shadow')).toBe('none');
  });
});

describe('20.072 24 around', () => {
  it('20.072 header 24/24/16 with 8px gaps, body 0/24/24', () => {
    expect(valueOf(ruleExactly(CSS, HEADER), 'padding')).toBe('1.5rem 1.5rem 1rem');
    expect(valueOf(ruleExactly(CSS, HEADER), 'gap')).toBe('0.5rem');
    expect(valueOf(ruleExactly(CSS, BODY), 'padding')).toBe('0 1.5rem 1.5rem');
    // CONTROL
    expect(valueOf(ruleExactly(CSS, BODY), 'overflow-y')).toBe('auto');
  });
});

describe('20.073 the dismiss control is a ghost icon; Full screen is quiet', () => {
  it('20.073 transparent 44px circle, lit fill + ring; Full screen outlined', () => {
    const close = ruleExactly(CSS, CLOSE);
    expect(valueOf(close, 'background')).toBe('transparent');
    expect(valueOf(close, 'color')).toBe('var(--gn-text-muted)');
    expect(valueOf(close, 'border-radius')).toBe('999px');
    const lit = ruleExactly(CSS, [
      '.gn-dialog__close:hover',
      '.gn-dialog__close:focus-visible',
      '.gn-sheet__close:hover',
      '.gn-sheet__close:focus-visible',
    ]);
    expect(valueOf(lit, 'background')).toBe('var(--gn-fill-tertiary)');
    expect(
      valueOf(ruleExactly(CSS, ['.gn-dialog__close:focus-visible', '.gn-sheet__close:focus-visible']), 'outline'),
    ).toBe('2px solid var(--gn-focus-ring)');
    const full = ruleExactly(CSS, '.gn-sheet__full');
    expect(valueOf(full, 'background')).toBe('transparent');
    expect(valueOf(full, 'border')).toBe('1px solid var(--gn-border)');
    expect(valueOf(full, 'box-shadow')).toBeNull();
    // CONTROL — 13.1148's floor
    expect(valueOf(close, 'min-height')).toBe('2.75rem');
    expect(valueOf(full, 'min-height')).toBe('2.75rem');
  });
});

describe('20.074 the title is loud', () => {
  it('20.074 26/32 at 700, tracked in, on both title elements', () => {
    for (const selector of ['.gn-sheet__title', '.gn-ticket-sheet__title-input']) {
      const body = ruleExactly(CSS, selector);
      expect(valueOf(body, 'font-size'), selector).toBe('1.625rem');
      expect(valueOf(body, 'line-height'), selector).toBe('2rem');
      expect(valueOf(body, 'font-weight'), selector).toBe('700');
      expect(valueOf(body, 'letter-spacing'), selector).toBe('-0.01em');
    }
    // CONTROL — the dialog title keeps its own step.
    expect(valueOf(ruleExactly(CSS, ['.gn-dialog__title', '.gn-sheet__title']), 'font-size')).toBe('1.05rem');
  });
});

describe('20.075 the fields sit in a well', () => {
  it('20.075 well ground, track inset, card radius, 8px padding; rows at card − 8', () => {
    const fields = ruleExactly(CSS, '.gn-ticket-sheet__fields');
    expect(valueOf(fields, 'background')).toBe('var(--gn-surface-well)');
    expect(valueOf(fields, 'box-shadow')).toBe('var(--gn-shadow-track)');
    expect(valueOf(fields, 'border-radius')).toBe('var(--gn-radius-card)');
    expect(valueOf(fields, 'padding')).toBe('0.5rem');
    expect(valueOf(fields, 'margin')).toBe('1.5rem 0 0');
    const inner = 'calc(var(--gn-radius-card) - 0.5rem)';
    expect(valueOf(ruleExactly(CSS, '.gn-ticket-sheet__field--tinted dt'), 'border-radius')).toBe(`${inner} 0 0 ${inner}`);
    expect(valueOf(ruleExactly(CSS, '.gn-ticket-sheet__field--tinted dd'), 'border-radius')).toBe(`0 ${inner} ${inner} 0`);
    // CONTROL — the stripe itself (16.116) is still painted.
    expect(valueOf(ruleExactly(CSS, '.gn-ticket-sheet__field--tinted dt'), 'background')).toBe('var(--gn-fill-quaternary)');
  });
});

describe('20.076 captions and labels', () => {
  it('20.076 sentence-case 15/600 captions in text; 13px text3 labels', () => {
    const caption = ruleExactly(CSS, '.gn-ticket-sheet__caption');
    expect(valueOf(caption, 'font-size')).toBe('0.9375rem');
    expect(valueOf(caption, 'font-weight')).toBe('600');
    expect(valueOf(caption, 'color')).toBe('var(--gn-text)');
    expect(valueOf(caption, 'text-transform')).toBe('none');
    expect(valueOf(caption, 'letter-spacing')).toBe('0');
    const label = ruleExactly(CSS, '.gn-ticket-sheet__field dt');
    expect(valueOf(label, 'font-size')).toBe('0.8125rem');
    expect(valueOf(label, 'color')).toBe('var(--gn-text-subtle)');
    // CONTROL — values set no colour of their own; they inherit `text`.
    expect(valueOf(ruleExactly(CSS, '.gn-ticket-sheet__field dd'), 'color')).toBeNull();
  });
});

describe('20.077 the footer and Delete', () => {
  it('20.077 decorative hairline + 24px; Delete a pill with a soft hover fill', () => {
    const footer = ruleExactly(CSS, '.gn-ticket-sheet__footer');
    expect(valueOf(footer, 'border-top')).toBe('1px solid var(--gn-fill-secondary)');
    expect(valueOf(footer, 'margin-top')).toBe('1.5rem');
    const del = ruleExactly(CSS, '.gn-ticket-sheet__delete');
    expect(valueOf(del, 'border-radius')).toBe('999px');
    expect(valueOf(ruleExactly(CSS, '.gn-ticket-sheet__delete:hover:not(:disabled)'), 'background')).toBe(
      'var(--gn-fill-quaternary)',
    );
    // CONTROL — 16.84's Delete: danger ink, transparent, borderless.
    expect(valueOf(del, 'color')).toBe('var(--gn-danger)');
    expect(valueOf(del, 'background')).toBe('transparent');
    expect(valueOf(del, 'border')).toBe('none');
  });
});
```

- [ ] **Step 3: Run to see it fail.** All seven FAIL. Check that `ruleExactly(CSS, ['.gn-dialog__title', '.gn-sheet__title'])` finds the group at `:541-545`. If it throws "found 0", the group's selector text differs: read `:541-544` and use its exact list.

- [ ] **Step 4: Implement** (`ui.css`, in place):
  1. `.gn-sheet` (`:399-404`): add `border-radius: var(--gn-radius-track) 0 0 var(--gn-radius-track);` and `box-shadow: var(--gn-shadow-sheet);`. They win over the `.gn-dialog, .gn-sheet` group's `overlay` (`:351-363`) on source order. `.gn-sheet--full` (`:489-495`) comes later still and keeps `border-radius: 0; box-shadow: none;`. Comment: `/* Styling refresh (Plan A Task 7): docked to the right edge, so only its LEFT corners round (track radius, 24/28); the \`sheet\` shadow lights its inner left edge and falls away to the left (\`Sheet.dc.html:26\`, \`:127\`). */`
  2. Header group (`:525-532`): `gap: 1rem;` → `gap: 0.5rem;`; `padding: 0.9rem 1.1rem;` → `padding: 1.5rem 1.5rem 1rem;`.
  3. Body group (`:846-847`) → `.gn-dialog__body,\n.gn-sheet__body { padding: 0 1.5rem 1.5rem; overflow-y: auto; }`.
  4. Close group (`:830-845`): `background: var(--gn-fill-tertiary);` → `background: transparent;`; add `transition: background-color var(--gn-motion-feedback) ease-out;`. Directly after the body group, add:

```css
/* The overlay dismiss control is a GHOST icon (pattern P-GHOST; the mockup's
   header icons, `Sheet.dc.html:30-35`): transparent at rest, a soft fill and
   the focus ring when pointed at or focused. */
.gn-dialog__close:hover,
.gn-dialog__close:focus-visible,
.gn-sheet__close:hover,
.gn-sheet__close:focus-visible { background: var(--gn-fill-tertiary); }
.gn-dialog__close:focus-visible,
.gn-sheet__close:focus-visible { outline: 2px solid var(--gn-focus-ring); outline-offset: 2px; }
```

  5. `.gn-sheet__full` (`:502-523`) becomes P-QUIET:
     - `border: none;` → `border: 1px solid var(--gn-border);`;
     - `background: var(--gn-fill-tertiary);` → `background: transparent;`;
     - `color: var(--gn-text-accent);` → `color: var(--gn-text-muted);`;
     - delete `box-shadow: var(--gn-shadow-raised);`.
  6. `.gn-sheet__title` (`:591-595`) and `.gn-ticket-sheet__title-input` (`:789-800`): `font-size: 1.375rem;` → `font-size: 1.625rem;`; `line-height: 1.75rem;` → `line-height: 2rem;`; `font-weight: 600;` → `font-weight: 700;`; add `letter-spacing: -0.01em;` (`Sheet.dc.html:40`).
  7. `.gn-ticket-sheet__fields` (`:2503`) → a multi-line rule:

```css
/* The fields sit in a WELL (pattern P-WELL; `Sheet.dc.html:53`): a recessed
   group inside the raised sheet, lit from above like the board's tracks. The
   striped rows inside it take the card radius minus this 8px padding
   (rule 05), so the stripes nest in every style (hig 8, neo 12). */
.gn-ticket-sheet__fields {
  margin: 1.5rem 0 0;
  padding: 0.5rem;
  border-radius: var(--gn-radius-card);
  background: var(--gn-surface-well);
  box-shadow: var(--gn-shadow-track);
}
```

  8. `.gn-ticket-sheet__field dt` (`:2526`): `color: var(--gn-text-muted); font-size: 0.9375rem;` → `color: var(--gn-text-subtle); font-size: 0.8125rem;`.
  9. `.gn-ticket-sheet__field--tinted dt` (`:2528`): `border-radius: 0.5rem 0 0 0.5rem;` → `border-radius: calc(var(--gn-radius-card) - 0.5rem) 0 0 calc(var(--gn-radius-card) - 0.5rem);`. `--tinted dd` (`:2529`): `border-radius: 0 0.5rem 0.5rem 0;` → `border-radius: 0 calc(var(--gn-radius-card) - 0.5rem) calc(var(--gn-radius-card) - 0.5rem) 0;`.
  10. `.gn-ticket-sheet__caption` (`:2536`) → `.gn-ticket-sheet__caption { margin: 0; font-size: 0.9375rem; line-height: 1.375rem; font-weight: 600; color: var(--gn-text); text-transform: none; letter-spacing: 0; }`.
  11. `.gn-ticket-sheet__footer` (`:2313-2321`): `margin-top: 1.2rem;` → `margin-top: 1.5rem;`; `border-top: 1px solid var(--gn-border);` → `border-top: 1px solid var(--gn-fill-secondary);`. Comment: `/* A decorative hairline (plan D18): the \`border\` grey is an EDGE for controls (4.27:1) and read as a heavy rule here. */`
  12. `.gn-ticket-sheet__delete` (`:2348-2358`): `border-radius: var(--gn-radius-control);` → `border-radius: 999px;`; add `transition: background-color var(--gn-motion-feedback) ease-out;`. After it, add `.gn-ticket-sheet__delete:hover:not(:disabled) { background: var(--gn-fill-quaternary); }`.
  13. Amend **13.1148** (`components.test.tsx:1941-1945`): `expect(body).toMatch(/background:\s*var\(--gn-fill-tertiary\)/);` → `expect(body).toMatch(/background:\s*transparent/);`. Rename the `it` to `'13.1148 it takes the circle, transparent at rest (the fill moved to hover — styling refresh 20.073)'`.
  14. Amend **16.84** (its `it` at `:832`): the line matching `border-radius:\s*var\(--gn-radius-control\)` becomes `expect(body).toMatch(/border-radius:\s*999px/);`, with the comment `// Amended 2026-09-29 (styling refresh, 20.077): a pill, rule 05.`

- [ ] **Step 5: Run to see it pass.** Then:
  - `packages/ui` in full, including 13.1142's phone media block, which is untouched (`components.test.tsx:1729-1790`);
  - build;
  - `packages/app-core` in full. `ticket-sheet.test.tsx` queries the footer, fields and body by class (`:2845-2873`, `:3146`, `:3745`); no class changed.

- [ ] **Step 6: Catalogue.**
  - Flip 20.071–20.077.
  - Amend 13.1148 (`test-cases/13-board-prototype-port.md:1967`): "Amended 2026-09-29 by 20.073 (styling refresh Plan A): the dismiss control is now a ghost icon — transparent at rest, the `fillTertiary` fill on hover/focus with the focus ring; its 44px floor and shared rule are unchanged."
  - Amend 16.84 (`test-cases/16-remaining-doors.md:572`): "Amended 2026-09-29 by 20.077: Delete is a pill (radius = height ÷ 2) with a soft hover fill; still danger ink on transparent, borderless, 44px."
  - Append to §17:

```markdown
- ✅ **The ticket sheet follows the rules** (styling refresh Plan A Task 7; `ui.css` `.gn-sheet*`, `.gn-ticket-sheet__*`) — the panel docks with rounded left corners (24/28) and a shadow lit at its inner edge and falling away to the left; header and body are 24 around (shared with every dialog); the title is the loud element (26/32, 700) — the sheet has no primary, and the mockup's "Start work" is not built (plan D16); the fields sit in a recessed well with their stripes nested at the card radius minus 8; captions are sentence-case 15/600, labels 13px third tier; the dismiss control is a ghost icon, Full screen a quiet outlined control; the footer is separated by a decorative hairline and Delete is a pill. Cases 20.071–20.077.
```

- [ ] **Step 7: Commit** `Styling A/Task 7: the ticket sheet — lit panel, 24 around, loud title, fields in a well (20.071-20.077)`. Then mutate, show red, restore.

---

### Task 8: Browser check A (🧪) — the board and the sheet on the dev stack, every style × theme

**Files:**
- Modify: `test-cases/20-styling-system.md` (new `## 20.8 Browser — Plan A`). No code, and no `Features.md` change.

This task writes the cases with their exact steps and marks them 🧪. The **controller or planner** runs them on the dev stack, built from the release branch after this plan merges (`ctl rebuild` is the controller's verb). The lane does NOT run the dev stack and does NOT flip these cases. The runner flips each one, with its evidence: a screenshot per step, the runner's name, and the stack's commit.

Measurements use Chromium DevTools. For "computed", read `getComputedStyle(el)` in the console. Run every case under `neo` (the default) unless it says otherwise.

Cases. The guard moves by **10** (8, plus 20.121–20.122 added 2026-09-29): `🧪` is a status marker (`test-cases/README.md:5`), and the guard reads a marker-then-bold-id line.

```markdown
- 🧪 **20.091 — the board's header has ONE loud element: New ticket computes `height: 48px`, `font-size: 17px`, `font-weight: 600`, `border-radius` ≥ 24px, a 1px edge; Filters is 44px tall with a 1px `rgb(…)` edge and a transparent background;** control: hovering New ticket computes `transform: matrix(1.04, 0, 0, 1.04, 0, 0)` and pressing it `matrix(0.98, …)`. Steps: open a project's Board; inspect both buttons; hover; press and hold. Mutation (optional): none — a browser case is witnessed.
- 🧪 **20.092 — a column is a recessed track and a card is raised: the column computes `border-radius: 24px` (neo 28px), `padding: 8px` and an `inset` box-shadow; a card computes `border-radius: 16px` (neo 20px), `padding: 16px`;** control: the gap between two cards measures 8px and between two columns 16px (compare `getBoundingClientRect()`s).
- 🧪 **20.093 — a card with EVERY field (epic chip, a parent — reads `GN-17 › GN-15` — assignee, progress, the `reopened — live work added` chip, a LATE due date in red, and "who · when" UNFOLDED) stays inside its 18rem lane with no horizontal overflow, the title's computed `font-size` (15px) is the largest on the card, the footer wraps so the arrows sit on their own line, and the `›` has `aria-hidden="true"` and sits between the parent badge and the key;** control: the same card with "who · when" folded keeps the arrows on the footer's first row. Steps: seed or pick a ticket with a parent that is not its epic, an epic, a sub-task rollup, a past due date; open the board; click "who · when".
- 🧪 **20.094 — hovering a card changes its SHADOW ONLY (owner ruling 2026-09-29): its computed `transform` stays `none`, its box-shadow becomes a 4-layer string (hig), its slot computes `z-index: 1`, and the deeper shadow draws OVER the card below; with the move dialog open from that card (press an arrow whose move needs a comment), the dialog is centred in the VIEWPORT (its panel's `getBoundingClientRect()` centre within 2px of `innerWidth/2`, `innerHeight/2`) — the regression check that D21's retirement is safe;** control: moving the pointer off the card returns the 3-layer resting shadow within 300ms, and the card's `getBoundingClientRect()` width is identical hovered and at rest. Steps: hover the top card of a column with at least two cards; then use `WF_ERRAND`-like "doing → done needs a comment" or any transition with a rule to open the dialog while hovering.
- 🧪 **20.095 — with reduced motion emulated (DevTools → Rendering → `prefers-reduced-motion: reduce`), hovering New ticket computes `transform: none` while its box-shadow still changes, and a card's drag image (20.121) is upright and unscaled;** control: turning emulation off restores the button's scale and the drag image's tilt.
- 🧪 **20.096 — every style × theme renders with its own character: hig light/dark (the mockup's lit edges and falling shadows), neo light/dark (dual neumorphic shadows, columns pressed in, cards raised — no hig drop shadow), minimal light/dark (flat: no shadows, the track visible only by its fill);** control: switching the style changes the card's computed `box-shadow` string. Evidence: six screenshots of the same board, same scroll position.
- 🧪 **20.097 — every primary Button in the product stays in layout at 48px/24px/17px, at 390px AND 1280px wide: for each of the 26 usages in Plan A Task 3's table, open its screen, measure the button's `getBoundingClientRect()` and its parent's, and record any button that overflows its row or forces horizontal scroll;** control: the board's New ticket (20.091) is in layout. Evidence: a table of 26 rows (usage, 390 result, 1280 result). Any overflow is fixed in the owning Plan B screen task, never by excluding the usage (D5).
- 🧪 **20.098 — the ticket sheet: the panel computes `border-top-left-radius: 24px` (neo 28px) and `border-top-right-radius: 0px`, the header `padding: 24px 24px 16px`, the title `font-size: 26px; font-weight: 700`, the fields group an `inset` box-shadow with 8px padding, the close button transparent at rest and filled on hover, and every `Move…`/`Close`/`Reopen` 44px tall with a 1px edge;** control: Full screen removes the radius and the shadow. Steps: open any ticket from the board; hover the ✕; press Full screen.
- 🧪 **20.121 — dragging a card (added 2026-09-29): the image under the pointer is the card tilted about 2.5° and slightly larger, with a deep shadow that is not clipped at the card's edge (the browser's own translucency is expected and recorded, D26); the source column does not move — every other card's `getBoundingClientRect().top` is identical before and during the drag (read in a `dragover` listener) — and the source slot shows a dashed recessed outline the size of the card; the column under the pointer shows an accent outline and nothing is inserted into it; Esc restores the card and clears every outline;** control: a drop onto another column moves the ticket exactly as before this plan. Evidence: a screen recording (GIF) per browser — Chromium and Safari — plus the before/during `top` values. Steps: open a Board with a column holding at least three cards; drag the middle card across two columns, pause over each, press Esc; drag again and drop.
- 🧪 **20.122 — columns collapse (added 2026-09-29; every column per the evening ruling): pressing Collapse Done leaves a 56px-wide strip (`getBoundingClientRect().width` = 56) at the rail's full height, reading the count and "Done" vertically; the neighbouring columns keep 288px; dragging a card onto the strip moves it there and the count goes up; a reload keeps the column collapsed; VoiceOver reads the strip as "Expand Done, N tickets, button, collapsed"; then collapsing EVERY column leaves a row of 56px strips side by side, each at least 192px tall, with the workflow heading still shown and no horizontal scroll at 1280px for a five-column workflow;** control: another browser profile (a different signed-in user) sees every column expanded. Steps: open a Board whose workflow has at least an open, an active and a terminal state; collapse Done; drag a card onto the strip; reload; turn VoiceOver on and focus the strip; collapse the rest.
```

- [ ] **Step 1: Write the cases** under `## 20.8 Browser — Plan A`. Guard: +10.
- [ ] **Step 2: Commit** `Styling A/Task 8: browser cases 20.091-20.098, 20.121-20.122 (🧪, run by the controller)`.

---

## Wrap-up (after Task 8)

- [ ] **Whole-repo run, in order, on Node 22.** Paste every summary line with `NODE=`:
  1. `pnpm turbo run build`;
  2. `pnpm turbo run typecheck`;
  3. each package's suite with the Global Constraints command: `packages/ui`, `packages/app-core`, `apps/web`, `apps/desktop`;
  4. `pnpm check:citations`, `pnpm check:help`, `node scripts/check-case-ids.mjs`.

  `check:help` should move by at most Task 5B's two new accessible names (`Collapse <column>` and `Expand <column>, N tickets`). Otherwise this plan changes no user-visible string. If it reports any other span, the change is in `board.tsx`, and the only other string added there is the `aria-hidden` `›`.
- [ ] **Orphan check.** After any run that returned suspiciously fast, reap ONLY orphaned workers with `ps -eo pid=,ppid=,comm=,args= | awk '$3 ~ /node$/ && $2 == 1 && index($0, "vitest") > 0 {print $1}'` (repo `CLAUDE.md`). Never `pkill -f vitest`.
- [ ] **Re-read the catalogue.**
  - Read `Features.md` §17's nine bullets and the five sub-bullets (`:32`, `:43`, `:55`, and two under `:182`) against the code.
  - Read every id line you flipped, and the eleven amended cases.
  - The id count moves by **60** in total (47, plus 13 added 2026-09-29):

    | Task | Cases |
    |---|---|
    | 1 | 4 |
    | 2 | 5 |
    | 3 | 6 |
    | 4 | 2 |
    | 5 | 6 |
    | 5A | 5 |
    | 5B | 8 |
    | 6 | 9 |
    | 7 | 7 |
    | 8 | 10 |

  - That uses `20.001`–`20.122` with gaps at 20.005–20.010, 20.016–20.020, 20.027–20.030, 20.033–20.040, 20.047–20.050, 20.060–20.070, 20.078–20.090, 20.099–20.100, 20.106–20.110, 20.119–20.120 and 20.123–20.150. Those gaps are reserved for this plan's own follow-ups and are never used by Plan B.
- [ ] **Merge forward before the PR:**
  1. Record the guard count.
  2. `git fetch origin && git merge origin/release/<date>`.
  3. Re-run build, typecheck, the four suites and the checks.
  4. Confirm the guard count is yours plus exactly the id lines the merge brought in.
- [ ] **PR body** (`bash scripts/ctl/ctl pr open task/styling-a-foundation --repo <worktree> --base release/<date> --title "Styling refresh Plan A: tokens, Button, surfaces, board, sheet" --body FILE`). It lists:
  - every deviation D1–D27, in one line each. D11 (priority tints retired), D6 (borders on quiet buttons only) and D27 (every column collapsible) are owner-confirmed rulings of 2026-09-29. Quote each one.
  - the eleven amended cases, each with its new sentence;
  - each mutation, with its red summary line;
  - that 20.091–20.098 and 20.121–20.122 are 🧪 and need the controller;
  - which local run each summary line comes from.

  CI does not run on this PR. The run you quote is the verification.
