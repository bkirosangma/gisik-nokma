# Styling system refresh — the rules everywhere. Plan B of 2: every other screen. Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Every task touches a screen, so it ALSO invokes `ui-ux-pro-max` beside its workflow skill (workspace `CLAUDE.md`, "UI/UX Design"). The decisions are pinned below. The skill is a second opinion on spacing, focus and contrast.

**Read Plan A first:** `docs/superpowers/plans/2026-09-29-styling-system-refresh.md`. It holds:
- the **Design source** (the owner-approved mockup, the twelve rules verbatim, the owner's rulings);
- the **Global Constraints**, which this plan inherits WORD FOR WORD, with the branch name changed (below);
- the per-style table;
- the token translation;
- deviations D1–D27 (D21 retired, D25–D27 added 2026-09-29; D6, D11 and D27 owner-confirmed the evening of 2026-09-29).

This plan adds the inventory and one task per screen.

> **Amended 2026-09-29 (owner kanban rulings).** The owner ruled "hover = shadow only" for cards (Plan A, the note at its top). **P-LIFT is now shadow only**, and because P-LIFT is shared, this restyles every Plan B screen that uses it, not only the board.
> - The door cards (B13's workspace card, project card and the home's section cards) answer hover with `lift-near` above their neighbours and press with `lift-press`. Nothing scales.
> - With no transform and no filter on a door card, the `:not(:has(.gn-dialog__scrim))` guard and the reduced-motion arms have nothing left to protect. They are removed (Plan A D21, retired). B1's `expectReducedMotionFor` helper loses its only consumer and is not written.
> - Primary buttons keep their 1.04/0.98 hover and press (Plan A Task 3). Cases 20.321, 20.322, 20.593 and 20.595 are rewritten in place, so no ids are added.
>
> **Owner rulings, 2026-09-29 evening.** B-D1 is confirmed: mobile is a separate plan, which the owner will schedule. Plan A's D6 is confirmed too (borders on quiet BUTTONS only, so this plan's P-QUIET edge is right). So is D11 (quieter priority).

**Depends on:** Plan A Tasks 1–4. Those are the tokens, the shared `Button` (P-PRIMARY, P-QUIET), `Card` (P-RAISED) and `Dialog`, plus the test helpers `packages/ui/test/helpers/css-rules.ts` and `contrast.ts`. Plan B Task B1 may start once Plan A Task 4 has merged into the release branch. Plan B's screen tasks are independent of one another, and they may run in any order after B1.

**Goal:** Apply the twelve rules to every screen and shared view that Plan A did not, so the product reads as one system:
- one loud element per screen;
- the 8-pt grid;
- three text tiers and one accent;
- depth lit from above, with recessed tracks and raised items;
- accessible 3:1 edges and 44/48px targets;
- motion of 100–300ms, off under reduced motion.

**Architecture:**
- **Tokens and shared components stay as Plan A left them.** No new colour roles, unless a task names one with its contrast pair.
- **Every change is a CSS edit in place, in `packages/ui/src/ui.css` or `apps/web/app/globals.css`, expressed through the named patterns below.** No markup changes.
- **Each task opens with an audit table:** every rule on that screen that breaks a rule today, found by a comment-blind scan of both stylesheets on `origin/release/trash` at `8b11d76e`. Each row names its `file:line`, what it does today, and the pattern it becomes.
- **The tests.** Each task pins its rows through ONE roster helper (`packages/ui/test/helpers/style-patterns.ts`, Task B1). The row list in the test is the table in the plan.

**Tech Stack:** as Plan A.

**Spec:** Plan A's Design source section.

## Global Constraints (deltas from Plan A)

Plan A's Global Constraints apply in full: the next-release base branch, re-verifying citations on your base, Node 22, build before suites, the suite command, the RED → control → commit → mutation cycle, the case-id rules, `Features.md` per task, editing CSS in place, colour discipline, motion, the style axis, and never `AskUserQuestion`. Only these differ:
- **Branch:** `task/styling-b-<slug>` per task (or one `task/styling-b-screens` if the controller runs B in one lane), cut from `origin/release/<date>` AFTER Plan A has merged into it. PR `--base release/<date>`, never `main`.
- **Case ids:** this plan owns **`20.201`–`20.600`** in `test-cases/20-styling-system.md` (Plan A opened the bucket and allocated the block). Each task owns a block of ten ids, which its header states (B1 `20.201`–`20.210`, B2 `20.211`–`20.220`, … B20 `20.391`–`20.400`). Unused ids in a task's ten are reserved to that task and never reused. The browser block is `20.591`–`20.600`.
- **Suite log names:** `/tmp/styling-b-<slug>-<pkg>.log`. Lane-unique, because parallel lanes share `/tmp` (memory: shared-tmp-path-collides-between-lanes).
- **Existing CSS-pin cases.** A screen task WILL redden ✅ cases that pinned the old declarations. Each task names the ones measured before writing. After implementing, it runs the full suites of `packages/ui`, `packages/app-core` and `apps/web`, and any OTHER red CSS-pin case is amended in place, the Plan A way:
  - keep its id and ✅;
  - change the assertion to the new property;
  - append "Amended 2026-09-29 by 20.NNN (styling refresh Plan B): …" to its prose;
  - list it in the commit body.

  A red that is NOT a CSS pin (a DOM, behaviour or copy test) means the task changed something it must not. Stop and report it.

## Pattern table (full declarations)

Plan A defines P-PRIMARY and P-QUIET (the shared `Button`), P-RAISED (`.gn-card`), and the first uses of P-TRACK, P-WELL, P-GHOST and P-LIFT. This plan applies them by name. Each is written out here in full, and a task row that says "P-X" means exactly these declarations:

| Pattern | Set these declarations | And |
|---|---|---|
| **P-QUIET** (a raw element that is not a `Button`) | `min-height: 2.75rem; padding: 0 1rem; border: 1px solid var(--gn-border); border-radius: 999px; background: transparent; color: var(--gn-text-muted); font-weight: 600; transition: background-color var(--gn-motion-feedback) ease-out;` | `:hover:not(:disabled) { background: var(--gn-fill-quaternary); }`. Keep the rule's existing `:focus-visible` ring |
| **P-GHOST** (a control inside a dense surface: a row, a card, a column header, a toolbar inside a panel) | `min-height: 2.75rem; border: none; border-radius: 999px; background: transparent; color: var(--gn-text-subtle); transition: background-color var(--gn-motion-feedback) ease-out, color var(--gn-motion-feedback) ease-out;`. Icon-only: add `min-width: 2.75rem`. Text: `padding: 0 0.75rem` | `:hover:not(:disabled), :focus-visible { background: var(--gn-fill-tertiary); color: var(--gn-text-muted); }` and `:focus-visible { outline: 2px solid var(--gn-focus-ring); outline-offset: 0; }` |
| **P-TRACK** (a container that holds raised items on the page ground) | `background: var(--gn-surface-track); box-shadow: var(--gn-shadow-track); border-radius: var(--gn-radius-track); padding: 0.5rem;` | the raised items inside get `border-radius: var(--gn-radius-card)` (= track − 8) |
| **P-WELL** (a recessed group or notice INSIDE a raised panel) | `background: var(--gn-surface-well); box-shadow: var(--gn-shadow-track); border-radius: var(--gn-radius-card);` | rows inside it take `border-radius: calc(var(--gn-radius-card) - 0.5rem)` when the well pads by 8 |
| **P-RAISED** (a static panel) | `background: var(--gn-surface-raised); box-shadow: var(--gn-shadow-lift); border-radius: var(--gn-radius-card);` | no hover |
| **P-ROW** (one item of a list of items on the page ground) | P-RAISED's three declarations | rows 8px apart (`gap: 0.5rem` on the list) |
| **P-LIFT** (an interactive raised item: a card that IS a door). **Amended 2026-09-29: shadow only** | P-RAISED, plus on the container: `transition: box-shadow var(--gn-motion-lift) var(--gn-motion-ease-out);` | `<container>:has(<door>:hover) { box-shadow: var(--gn-shadow-lift-near); position: relative; z-index: 1; }`, and `<container>:has(<door>:active) { box-shadow: var(--gn-shadow-lift-press); transition-duration: var(--gn-motion-feedback); }`. There is **no transform and no filter**, so there is no reduced-motion arm and no `:has(.gn-dialog__scrim)` guard (Plan A D21, retired). **Never** key it on `.gn-card` alone. **Never** add a transform or a filter to a door card: either one makes the card the containing block of the Delete dialog it opens, which is the hazard D21 recorded |
| **P-FLOAT** (a panel floating above the page: menu, popover, select list, tooltip panel, popup) | `background: var(--gn-surface-raised); box-shadow: var(--gn-shadow-lift-near); border-radius: var(--gn-radius-card);` | — |
| **P-HOVER** (a row or link that answered hover with the 1.14:1 sunken fill) | `:hover` → `background: var(--gn-fill-quaternary);` | — |
| **P-TIERS** | page titles in `--gn-text`; secondary copy in `--gn-text-muted`; eyebrows, counts, timestamps and meta in `--gn-text-subtle`; the accent only on the screen's one primary action and on links | — |

**What a pattern does NOT touch:** layout (`display`, grid, widths), type sizes unless the task says so, and anything that carries STATE:
- a `:disabled` fill;
- the dashed state markers `--gn-border` still paints (Features.md `:32`: "the state-bearing dashed markers");
- a refusal's tone edge.

The audit tables mark those rows **kept**, with the reason.

## Inventory — every screen, and who owns it

`git ls-tree -r --name-only origin/release/trash | grep -E '^apps/web/app/.*page\.tsx$'` lists **25 routes**. The project route renders **5 tabs**: Backlog, Board, List, Calendar and Timeline. On top of those sit **7 shared overlay/chrome surfaces**: dialogs, sheets, menus, popovers/select lists, toasts, the app shell, and empty states. **Screens in scope: 25 routes + 4 further project tabs + 7 shared surfaces = 36 surfaces**, owned as follows. The Board tab and the ticket sheet are Plan A's.

| Route or surface | Stylesheet prefixes | Loud element (rule 01) | Owner |
|---|---|---|---|
| `apps/web/app/page.tsx` (5 lines, a redirect) | — | — (renders nothing) | B1 (inventory only) |
| `apps/web/app/sign-in/page.tsx` | `gn-sign-in`, `gn-page-header`, `gn-field` | **Send magic link** / **Send code** / **Verify and sign in**: one per step (`:420`, `:335`, `:357`) | B19 |
| `apps/web/app/invite/[token]/page.tsx` | `gn-invite` | **Join {workspace}** (`:191`); **Try again** only in the error state (`:137`) | B19 |
| `apps/web/app/mcp/authorize/page.tsx`, `apps/web/app/mcp/tokens/page.tsx` | `gn-mcp-authorize`, `gn-mcp-tokens` | the consent's Allow / the tokens list (named in B19) | B19 |
| `apps/web/app/workspaces/page.tsx` | `gn-workspaces`, `gn-workspace-card`, `gn-invitations`, `gn-card-menu` | **Create workspace** (`:853`). **Accept** (`:726`) is per invitation: a second primary, handled in B14 | B14 |
| `apps/web/app/w/[workspaceId]/page.tsx` (workspace home) | `gn-workspace-home`, `gn-project-card`, `gn-project-founding` | **Create project** (`:1253`). **Save name** (`:907`) shows only while renaming | B13 |
| `apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx` (project chrome + 5 tabs) | `gn-project`, `gn-filters`, `gn-segmented`, `gn-list`, `gn-calendar`, `gn-timeline`, `gn-saved-filters`, `gn-contest-banner`, `gn-sync-*` | **New ticket** (`create-ticket-flow.tsx:488`) on every tab | B5 chrome; B6 Backlog+List; Board = Plan A; B7 Calendar; B8 Timeline |
| `apps/web/app/w/[workspaceId]/my-work/page.tsx` | `gn-my-work`, `gn-attention` | the page title (no primary action) | B10 |
| `apps/web/app/w/[workspaceId]/members/page.tsx` | `gn-members`, `gn-invite-mint`, `gn-invite-pending`, `gn-table` | **Send invitation** (`:956`) | B12 |
| `apps/web/app/w/[workspaceId]/settings/workflows/**` (4 routes), `…/settings/ticket-types/**` (3 routes) | `workflow-*`, `ticket-type-*`, `state-*`, `transition-*`, `inspector-panel`, `advisories-panel`, `publish-controls`, `fields-editor`, `icon-picker`, `read-only-banner` | **New workflow** / **New type** on the lists; **Publish** / **Save ticket type** in the editors | B16 |
| `apps/web/app/settings/page.tsx` | `gn-settings`, `gn-workspace-list`, `gn-workspace-settings` | **Save** (`workspace-settings-form.tsx:439`) | B15 |
| `apps/web/app/account/page.tsx` (incl. Deleted items, passkeys, sessions, notifications) | `gn-account`, `gn-deleted-items` | **Save name** (`profile-section.tsx:79`) | B17 |
| `apps/web/app/inbox/page.tsx` | `gn-inbox` | the page title (no primary action) | B18 |
| `apps/web/app/notes/page.tsx`, `apps/web/app/notes/[noteId]/page.tsx` | `gn-notes`, `gn-note-*`, `ticket-editor`, `gn-comment`, `reading-progress`, `gn-toc-launcher` | the notes list: its create control (**Create** in `create-note-dialog.tsx:196` is the dialog's); the note page: the note's title | B11 |
| `apps/web/app/help/page.tsx`, `privacy/page.tsx`, `terms/page.tsx`, not-found | `gn-help`, `gn-legal`, `gn-notfound` | the page title | B20 |
| Shared: dialogs (incl. the 5 app-core primaries: bulk close, new ticket, reopen, transition, visibility), menus, popovers, select lists, info tips, editor popups, toasts | `gn-dialog`, `gn-select`, `gn-popover`, `gn-infotip`, `gn-toast`, `gn-card-menu`, `gn-nav__menu`, `mention-popup`… | the dialog's own primary | B3 |
| Shared: fields and the segmented control | `gn-field`, `gn-segmented`, `gn-switch` | — | B2 |
| Shared: the app shell and navigation | `gn-shell`, `gn-nav`, `gn-page-title`, `gn-theme-toggle`, `gn-skip` | — (supports every page's own loud element) | B4 |
| Shared: empty states (board, column, and every other screen's empty copy) | `gn-board--empty`, `gn-board__column-empty*`, `*-empty` | the empty state's one action, which is quiet whenever a primary exists elsewhere on the screen | B9 |

**The desktop and mobile shells:**
- **`apps/desktop`** imports `@gisik-nokma/ui/ui.css` (`apps/desktop/src/main.tsx:6`) and installs `themeStylesheet()` (`apps/desktop/src/theme.ts`, via `installTheme`). It renders app-core's `HelpBrowser` and `SyncNotices` (`apps/desktop/src/app.tsx:9-16`).
  - **So it receives AUTOMATICALLY every token (Plan A Tasks 1–2) and every `ui.css` change**: the Button, Card and Dialog, and B2, B3, B5–B11 and B16–B18 where their rules live in `ui.css`.
  - It receives **nothing** from `apps/web/app/globals.css`: the nav, the account, workspaces, members, sign-in, MCP and notes-page rules live there.
- **`apps/mobile`** is React Native. It calls `colorOf` with no style argument (`tokens.ts:1520-1526`) and cannot consume CSS at all.
  - **It receives none of this plan.** It receives none of the new shadow, radius, spacing or motion roles either, since those are CSS-only.
  - This is a recorded gap (B-D1), exactly as the style axis was (`tokens.ts:1520-1526`: "mobile has no style axis — Task 11 records the deferral").

## Recorded deviations (Plan B)

- **B-D1 — `apps/mobile` is out of scope.** Its screens (`apps/mobile/src/screens/board-screen.tsx`, `ticket-screen.tsx`, `help-screen.tsx`) would need a React Native port of the rules. That is a follow-up plan. **CONFIRMED by the owner 2026-09-29 (evening): mobile is a separate plan, which the owner will schedule.** Nothing in this plan targets `apps/mobile`.
- **B-D2 — Text fields are not pills.** Rule 05 ("radius = height ÷ 2") is a BUTTON rule, and a multi-line field cannot be a pill. Fields keep the control radius and gain only depth (B2).
- **B-D3 — `neo` keeps its own pressed-in selected tab and its sunken field.** `[data-style="neo"] .gn-segmented__item--on` and `[data-style="neo"] .gn-field__input` are neo's character (10.80, 13.339). The rules reach them through the tokens they already name.
- **B-D4 — Second primaries.** Where a screen shows two primaries at once (the workspaces page: **Create workspace** plus one **Accept** per invitation), the per-row one becomes P-QUIET, and its task says so and amends any case that pinned it.
- **B-D5 — State fills are kept.** A `:disabled` sunken fill, a state-bearing dashed `--gn-border` edge and a refusal's tone edge carry state, not structure. They are marked **kept** in their task's table.
- **B-D6 — Primary buttons that fail layout at 48px** (browser case 20.097) are fixed in the owning task by the container, never by shrinking the button. Each task's browser case re-measures its primaries.

## Review Focus

1. **A second primary appears on a screen.** Condition: a workspace with pending invitations, where **Create workspace** plus N × **Accept** are all primaries today. Expected: one loud element. Owner: B14, case 20.332.
2. **A hovered door card traps its own dialog.** Condition: the workspace or project card's overflow menu opens **Delete…** (`DeleteDialog`) inside the card while it is hovered. The existing `filter: brightness(0.97)` hover (`globals.css:526-527`) already creates a containing block for fixed descendants. Expected: the dialog stays centred in the viewport. That now holds because B13 deletes the filter and adds no transform (amended 2026-09-29, P-LIFT shadow only). Owners: B13, case 20.322 (no door-card rule transforms or filters); browser case 20.593.
3. **Floating panels in dark theme.** Expected: menus, popovers and select lists on `lift-near` stay distinguishable from the page in hig dark, where the shadow is black on navy. Owner: B3, case 20.222 (the panel's ground differs from the page ground in every style × theme; neo excepted by design, where the shadow carries it).
4. **Neo pressed-in controls are not flattened.** Expected: `[data-style="neo"]` rules that pinned sunken selected states keep them (10.80, 13.339). Owner: B2, case 20.213's control.
5. **No P-LIFT moves** (amended 2026-09-29; this was "reduced motion on every P-LIFT"). Expected: this plan adds no hover scale anywhere, so reduced motion has nothing to cancel on a door card. Owner: B13, case 20.322's scan.

---

## File map

| File | Responsibility |
|---|---|
| `packages/ui/test/helpers/style-patterns.ts` (new, B1) | `PATTERNS`, `expectPattern`, `readGlobalsCss`, `SCREEN_OWNERS`, `unownedRoutes` |
| `packages/ui/test/styling-inventory.test.ts` (new, B1) | every `page.tsx` has an owner |
| `packages/ui/test/styling-b<N>-<slug>.test.ts` (new, one per task) | that task's roster |
| `packages/ui/src/ui.css`, `apps/web/app/globals.css` | the rules each task's table names, edited in place |
| `test-cases/20-styling-system.md` | `## 20.21`–`## 20.40` sections, one per task (B1 → 20.21 … B20 → 20.40), then `## 20.59 Browser — Plan B` |
| `Features.md` §17 | one bullet per task; sub-bullets under the screen's own bullet where one exists |

---

### Task B1: The inventory guard and the roster helper

**Files:**
- Create: `packages/ui/test/helpers/style-patterns.ts`, `packages/ui/test/styling-inventory.test.ts`.
- Modify: `test-cases/20-styling-system.md` (new `## 20.21 Plan B — inventory and roster`), `Features.md` §17.

**Interfaces:**
- Consumes: Plan A's `helpers/css-rules.ts` (`readUiCss`, `ruleExactly`, `rulesNaming`, `parseRules`, `valueOf`).
- Produces (every later task imports these):
  - `readGlobalsCss(): string`;
  - `PATTERNS` (the Pattern table as data);
  - `type RosterRow = { sheet: 'ui' | 'globals'; selectors: string | readonly string[]; pattern?: PatternName; declarations?: Record<string, string>; atRule?: string }`;
  - `expectRow(row)`;
  - `flatBoundaryOffenders(css, prefixes, kept)`;
  - `SCREEN_OWNERS`, `listPageRoutes()`, `unownedRoutes(found, owners)`.

Cases (ids `20.201`–`20.210`). The guard moves by **3**:

```markdown
- ❌ **20.201 — every `page.tsx` under `apps/web/app` has a named styling owner (a Plan A or Plan B task), so a route added later without one fails this test rather than shipping unstyled;** control: a planted extra route is reported by `unownedRoutes`, and a planted owner with no route is reported as stale. Mutation: delete `apps/web/app/inbox/page.tsx`'s entry from `SCREEN_OWNERS`.
- ❌ **20.202 — the roster helper reads a pattern exactly: a planted rule carrying every P-TRACK declaration passes, and the same rule missing one declaration fails naming that property;** control: `expectRow` throws on a selector list that matches no rule. Mutation: make `expectRow` skip the `box-shadow` key.
- ❌ **20.203 — the flat-boundary scanner finds a `surface-sunken` background and the retired `fill-tertiary` + `text-accent` control constant among rules naming a prefix, ignores comments, and honours the kept list;** control: a rule under an unrelated prefix is not reported. Mutation: drop the `text-accent` half of the constant check.
```

- [ ] **Step 1: Write the cases.** +3.

- [ ] **Step 2: Write the helper** `packages/ui/test/helpers/style-patterns.ts`:

```ts
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { expect } from 'vitest';
import { REPO_ROOT } from './colour-scan.js';
import { parseRules, readUiCss, ruleExactly, valueOf } from './css-rules.js';

/**
 * Styling refresh Plan B, Task B1. The Pattern table of
 * `docs/superpowers/plans/2026-09-29-styling-system-refresh-b-screens.md`, as
 * data, and the three checks every screen task runs. `globals.css` is read by
 * this package's tests already (`components.test.tsx:544-547`), so turbo's
 * inputs already cover it.
 */
export const GLOBALS_CSS_PATH = join(REPO_ROOT, 'apps/web/app/globals.css');
export function readGlobalsCss(): string {
  return readFileSync(GLOBALS_CSS_PATH, 'utf8');
}

const RAISED = {
  background: 'var(--gn-surface-raised)',
  'box-shadow': 'var(--gn-shadow-lift)',
  'border-radius': 'var(--gn-radius-card)',
} as const;

export const PATTERNS = {
  'P-QUIET': {
    'min-height': '2.75rem',
    border: '1px solid var(--gn-border)',
    'border-radius': '999px',
    background: 'transparent',
    color: 'var(--gn-text-muted)',
  },
  'P-GHOST': {
    'min-height': '2.75rem',
    border: 'none',
    'border-radius': '999px',
    background: 'transparent',
    color: 'var(--gn-text-subtle)',
  },
  'P-TRACK': {
    background: 'var(--gn-surface-track)',
    'box-shadow': 'var(--gn-shadow-track)',
    'border-radius': 'var(--gn-radius-track)',
    padding: '0.5rem',
  },
  'P-WELL': {
    background: 'var(--gn-surface-well)',
    'box-shadow': 'var(--gn-shadow-track)',
    'border-radius': 'var(--gn-radius-card)',
  },
  'P-RAISED': RAISED,
  'P-ROW': RAISED,
  'P-FLOAT': {
    background: 'var(--gn-surface-raised)',
    'box-shadow': 'var(--gn-shadow-lift-near)',
    'border-radius': 'var(--gn-radius-card)',
  },
  'P-HOVER': { background: 'var(--gn-fill-quaternary)' },
} as const satisfies Record<string, Record<string, string>>;
export type PatternName = keyof typeof PATTERNS;

export type RosterRow = {
  sheet: 'ui' | 'globals';
  selectors: string | readonly string[];
  pattern?: PatternName;
  /** Declarations beyond (or instead of) the pattern's — a row the plan's table spells out. */
  declarations?: Record<string, string>;
  atRule?: string;
};

export function cssOf(sheet: 'ui' | 'globals'): string {
  return sheet === 'ui' ? readUiCss() : readGlobalsCss();
}

export function expectRow(row: RosterRow, css: string = cssOf(row.sheet)): void {
  const body = ruleExactly(css, row.selectors, row.atRule ?? null);
  const expected = { ...(row.pattern === undefined ? {} : PATTERNS[row.pattern]), ...(row.declarations ?? {}) };
  if (Object.keys(expected).length === 0) throw new Error(`row ${String(row.selectors)} expects nothing`);
  for (const [property, value] of Object.entries(expected)) {
    expect(valueOf(body, property), `${String(row.selectors)} (${row.pattern ?? 'custom'}): ${property}`).toBe(value);
  }
}

/**
 * The flat fills rule 03/04 retire as a BOUNDARY: a `surface-sunken`
 * background (1.14:1 on the paper, Plan A 20.001) and the retired control
 * constant (`fill-tertiary` fill + `text-accent` label, 1.09–1.15:1). Returns
 * the selector lists of offending rules that name any of `prefixes`, minus the
 * `kept` lists (state fills, neo's own character — each task's table).
 */
export function flatBoundaryOffenders(css: string, prefixes: readonly string[], kept: readonly string[]): string[] {
  return parseRules(css)
    .filter((rule) => rule.selectors.some((selector) => prefixes.some((prefix) => selector.includes(prefix))))
    .filter((rule) => {
      const sunken = valueOf(rule.body, 'background') === 'var(--gn-surface-sunken)';
      const constant =
        valueOf(rule.body, 'background') === 'var(--gn-fill-tertiary)' &&
        valueOf(rule.body, 'color') === 'var(--gn-text-accent)';
      return sunken || constant;
    })
    .map((rule) => rule.selectors.join(', '))
    .filter((list) => !kept.includes(list));
}

/** Every route file, repo-relative. */
export function listPageRoutes(root: string = join(REPO_ROOT, 'apps/web/app')): string[] {
  const found: string[] = [];
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (name === 'page.tsx') found.push(relative(REPO_ROOT, path));
    }
  };
  walk(root);
  return found.sort();
}

export function unownedRoutes(found: readonly string[], owners: Record<string, string>): { unowned: string[]; stale: string[] } {
  return {
    unowned: found.filter((route) => !(route in owners)),
    stale: Object.keys(owners).filter((route) => !found.includes(route)),
  };
}

/** The Inventory table of the plan, route → owning task. */
export const SCREEN_OWNERS: Record<string, string> = {
  'apps/web/app/page.tsx': 'B1',
  'apps/web/app/sign-in/page.tsx': 'B19',
  'apps/web/app/invite/[token]/page.tsx': 'B19',
  'apps/web/app/mcp/authorize/page.tsx': 'B19',
  'apps/web/app/mcp/tokens/page.tsx': 'B19',
  'apps/web/app/workspaces/page.tsx': 'B14',
  'apps/web/app/w/[workspaceId]/page.tsx': 'B13',
  'apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx': 'A5-A7, B5-B8',
  'apps/web/app/w/[workspaceId]/my-work/page.tsx': 'B10',
  'apps/web/app/w/[workspaceId]/members/page.tsx': 'B12',
  'apps/web/app/w/[workspaceId]/settings/workflows/page.tsx': 'B16',
  'apps/web/app/w/[workspaceId]/settings/workflows/new/page.tsx': 'B16',
  'apps/web/app/w/[workspaceId]/settings/workflows/[workflowId]/page.tsx': 'B16',
  'apps/web/app/w/[workspaceId]/settings/workflows/[workflowId]/history/page.tsx': 'B16',
  'apps/web/app/w/[workspaceId]/settings/ticket-types/page.tsx': 'B16',
  'apps/web/app/w/[workspaceId]/settings/ticket-types/new/page.tsx': 'B16',
  'apps/web/app/w/[workspaceId]/settings/ticket-types/[typeId]/page.tsx': 'B16',
  'apps/web/app/settings/page.tsx': 'B15',
  'apps/web/app/account/page.tsx': 'B17',
  'apps/web/app/inbox/page.tsx': 'B18',
  'apps/web/app/notes/page.tsx': 'B11',
  'apps/web/app/notes/[noteId]/page.tsx': 'B11',
  'apps/web/app/help/page.tsx': 'B20',
  'apps/web/app/privacy/page.tsx': 'B20',
  'apps/web/app/terms/page.tsx': 'B20',
};
```

- [ ] **Step 3: Write the failing test** `packages/ui/test/styling-inventory.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  SCREEN_OWNERS,
  expectRow,
  flatBoundaryOffenders,
  listPageRoutes,
  unownedRoutes,
} from './helpers/style-patterns.js';

/** Styling refresh Plan B, Task B1 — cases 20.201–20.203 (§20.21). */
describe('20.201 every route has a styling owner', () => {
  it('20.201 the live tree has 25 routes, all owned, none stale', () => {
    const routes = listPageRoutes();
    expect(routes).toHaveLength(25);
    expect(unownedRoutes(routes, SCREEN_OWNERS)).toEqual({ unowned: [], stale: [] });
    // CONTROL — a planted route and a planted owner are both reported.
    const planted = unownedRoutes([...routes, 'apps/web/app/zz/page.tsx'], { ...SCREEN_OWNERS, 'apps/web/app/gone/page.tsx': 'B0' });
    expect(planted).toEqual({ unowned: ['apps/web/app/zz/page.tsx'], stale: ['apps/web/app/gone/page.tsx'] });
  });
});

describe('20.202 the roster helper reads a pattern exactly', () => {
  const full =
    '.gn-zz { background: var(--gn-surface-track); box-shadow: var(--gn-shadow-track); border-radius: var(--gn-radius-track); padding: 0.5rem; }';
  it('20.202 a full P-TRACK passes; one missing declaration fails naming it', () => {
    expect(() => expectRow({ sheet: 'ui', selectors: '.gn-zz', pattern: 'P-TRACK' }, full)).not.toThrow();
    expect(() =>
      expectRow({ sheet: 'ui', selectors: '.gn-zz', pattern: 'P-TRACK' }, full.replace('box-shadow: var(--gn-shadow-track); ', '')),
    ).toThrow(/box-shadow/);
    // CONTROL — a selector list that matches nothing throws.
    expect(() => expectRow({ sheet: 'ui', selectors: '.gn-nope', pattern: 'P-TRACK' }, full)).toThrow(/found 0/);
  });
});

describe('20.203 the flat-boundary scanner', () => {
  it('20.203 finds sunken fills and the retired constant, ignores comments, honours kept', () => {
    const css = [
      '/* .gn-aa__x { background: var(--gn-surface-sunken); } */',
      '.gn-aa__row { background: var(--gn-surface-sunken); }',
      '.gn-aa__btn { background: var(--gn-fill-tertiary); color: var(--gn-text-accent); }',
      '.gn-aa__chip { background: var(--gn-fill-tertiary); color: var(--gn-text); }',
      '.gn-aa__row:disabled { background: var(--gn-surface-sunken); }',
      '.gn-bb { background: var(--gn-surface-sunken); }',
    ].join('\n');
    expect(flatBoundaryOffenders(css, ['.gn-aa'], ['.gn-aa__row:disabled'])).toEqual(['.gn-aa__row', '.gn-aa__btn']);
    // CONTROL — another prefix is not this screen's business.
    expect(flatBoundaryOffenders(css, ['.gn-aa'], [])).not.toContain('.gn-bb');
  });
});
```

- [ ] **Step 4: Run to see it fail** (the helper module does not exist yet if you wrote the test first; or write both and run): build, then `cd packages/ui && pnpm exec vitest run --no-file-parallelism test/styling-inventory.test.ts > /tmp/styling-b-b1-ui.log 2>&1; tail -20 /tmp/styling-b-b1-ui.log`. Write the test before the helper so its first run is a real RED (module not found), then write the helper.
- [ ] **Step 5: Run to see it pass.** If `listPageRoutes()` does not return 25, the tree has moved since `8b11d76e`. Add or remove the owner rows so they match the TREE, name the change in the commit body, and put any new route in a Plan B task's table before you continue.
- [ ] **Step 6: Catalogue.** Flip 20.201–20.203. Append to §17: `- ⚙️ **The styling inventory guard** (styling refresh Plan B Task B1; \`packages/ui/test/helpers/style-patterns.ts\`) — every route under \`apps/web/app\` has a named styling owner, so a new screen cannot ship outside the rules unnoticed; the Plan B pattern table as data, and the flat-boundary scanner every screen task runs. Cases 20.201–20.203.`
- [ ] **Step 7: Commit** `Styling B/B1: inventory guard + roster helper (20.201-20.203)`. Then mutate, show red, restore.

---

### How every screen task below runs

Each of Tasks B2–B20 has the same seven steps. The task body gives each step's content, and nothing here stands in for it.
1. **Write the cases.** The guard moves by the number the task states.
2. **Write the failing test**, `packages/ui/test/styling-b<N>-<slug>.test.ts`, with the code the task gives.
3. **Run it and see it fail:** build, then `cd packages/ui && pnpm exec vitest run --no-file-parallelism test/styling-b<N>-<slug>.test.ts > /tmp/styling-b-<slug>-ui.log 2>&1; tail -20 /tmp/styling-b-<slug>-ui.log`. Every roster row fails on its first changed property, and the flat-boundary case lists the audited offenders.
4. **Implement** each audit row, in place, exactly as its "Becomes" cell says. Where the cell names a pattern, set that pattern's full declarations from the Pattern table, and remove the declarations the row lists as removed. Keep the rule's comment, and append one sentence: `Styling refresh Plan B (Task B<N>): <pattern> — <which rule it answers>.`
5. **Run it and see it pass.** Then build and run the FULL `packages/ui`, `packages/app-core` and `apps/web` suites. Every file the task lists under "Tests that name these selectors" must be read. Any CSS pin that went red is amended in place, per the Global Constraints.
6. **Catalogue.** Flip the cases, amend the pinned cases you touched, and append the task's `Features.md` bullet to §17.
7. **Commit** `Styling B/B<N>: <screen> (<ids>)`. Then mutate, show red, restore.

The shared test shape (each task's file is this, with its own `ROWS`, `PREFIXES` and `KEPT`):

```ts
import { describe, expect, it } from 'vitest';
import { parseRules } from './helpers/css-rules.js';
import { cssOf, expectRow, flatBoundaryOffenders, type RosterRow } from './helpers/style-patterns.js';

function stillDeclared(list: string): boolean {
  return (['ui', 'globals'] as const).some((sheet) =>
    parseRules(cssOf(sheet)).some((rule) => rule.selectors.join(', ') === list),
  );
}
```

---

### Task B2: Shared fields and the segmented control

Ids `20.211`–`20.220`, section `## 20.22`. The guard moves by **2**. **Loud element:** none. These are shared controls, and they support every screen's own loud element.

**Audit** (`ui.css` on `8b11d76e`):

| Rule | Today | Becomes |
|---|---|---|
| `.gn-field__input` `:5925` | fill `fill-quaternary`, 1px `border` edge, no depth | add `box-shadow: var(--gn-shadow-track);` (recessed, rule 04). Keep the edge (13.291) and the control radius (B-D2) |
| `.gn-segmented` `:5787` | no ground, 2px padding, control radius | `background: var(--gn-surface-track); box-shadow: var(--gn-shadow-track); border-radius: 999px; padding: 0.25rem;` (a recessed track for its tabs) |
| `.gn-segmented__item` `:5800` | control radius, `text` | `border-radius: 999px; color: var(--gn-text-muted);` (tier 2 at rest) |
| `.gn-segmented__item--on` `:5830` | `surface-raised` + `shadow-selected` | `box-shadow: var(--gn-shadow-lift); color: var(--gn-text);` (raised on the track, lit edge) |
| `.gn-ticket-sheet__attach-file` `:2655` (the sheet's **Attach file**, which Plan A Task 7 did not reach) | the retired constant + `raised` | **P-QUIET**: remove its `box-shadow` |
| `.gn-visibility__viewer` `:2903` (a viewer chip in the shared visibility editor) | `fill-tertiary` chip + `raised` shadow | `box-shadow: none;` (a chip is not raised; its fill stays) |

**Kept:**
- `.gn-field__input:disabled` (`:5979`, state);
- `[data-style="neo"] .gn-field__input` (`:5993`, neo's sunken field, B-D3 / 13.339);
- `[data-style="neo"] .gn-segmented__item--on` (`:5866`, neo's pressed tab, B-D3).
- `.gn-visibility__standing-mode` (`:2827`), the standing-line pill that 17.004 pins as the prototype's control.

**Tests that name these selectors** (read them after the change): `packages/ui/test/components.test.tsx` (13.291, 13.339, 3.974, 13.288, 13.1153, 17.004), `packages/app-core/test/views/ticket-sheet.test.tsx` (Attach file), `visibility-editor.test.tsx`, `field-placeholder-contrast.test.ts`, `select.test.tsx`, `apps/web/test/placeholder-hides-on-focus.test.ts`, `project-page-head.test.tsx`, `backlog-tab.test.tsx`, `project-calendar-timeline.test.tsx`, `not-found-and-legal.test.tsx`, and `apps/web/e2e-stack/non-text-contrast-roster.json` (the field edge stays, so its roster should not move).

```markdown
- ❌ **20.211 — shared fields sit recessed (the `track` inset, keeping their accessible edge); the segmented control is a recessed pill track whose items are pills — text2 at rest, the selected one raised on the `lift` shadow in `text`; the sheet's Attach file is a quiet outlined control; a visibility viewer chip is not raised;** control: every audited rule keeps what the table says it keeps (the field's 1px `border`). Mutation: remove `box-shadow` from `.gn-field__input`.
- ❌ **20.212 — no shared-field or segmented rule paints a flat boundary, and the three kept rules (the disabled field, neo's sunken field, neo's pressed tab) are still declared unchanged;** control: `stillDeclared` finds all three. Mutation: delete `[data-style="neo"] .gn-segmented__item--on`.
```

```ts
const ROWS: RosterRow[] = [
  { sheet: 'ui', selectors: '.gn-field__input', declarations: { 'box-shadow': 'var(--gn-shadow-track)', border: '1px solid var(--gn-border)' } },
  {
    sheet: 'ui',
    selectors: '.gn-segmented',
    declarations: { background: 'var(--gn-surface-track)', 'box-shadow': 'var(--gn-shadow-track)', 'border-radius': '999px', padding: '0.25rem' },
  },
  { sheet: 'ui', selectors: '.gn-segmented__item', declarations: { 'border-radius': '999px', color: 'var(--gn-text-muted)' } },
  { sheet: 'ui', selectors: '.gn-segmented__item--on', declarations: { 'box-shadow': 'var(--gn-shadow-lift)', color: 'var(--gn-text)' } },
  { sheet: 'ui', selectors: '.gn-ticket-sheet__attach-file', pattern: 'P-QUIET' },
  { sheet: 'ui', selectors: '.gn-visibility__viewer', declarations: { 'box-shadow': 'none', background: 'var(--gn-fill-tertiary)' } },
];
const PREFIXES = ['.gn-field', '.gn-segmented', '.gn-ticket-sheet__attach-file', '.gn-visibility'];
const KEPT = ['.gn-field__input:disabled', '[data-style="neo"] .gn-field__input', '[data-style="neo"] .gn-segmented__item--on'];

describe('20.211 shared fields are recessed; the segmented control is a pill track', () => {
  it('20.211 every audited rule takes its row', () => {
    for (const row of ROWS) expectRow(row);
  });
});
describe('20.212 no flat boundary on shared fields/segmented; kept rules intact', () => {
  it('20.212 offenders are none; the kept rules are still declared', () => {
    expect(flatBoundaryOffenders(cssOf('ui'), PREFIXES, KEPT)).toEqual([]);
    for (const kept of KEPT) expect(stillDeclared(kept), kept).toBe(true);
  });
});
```

`Features.md` bullet: `- ✅ **Shared fields and tabs follow the rules** (styling refresh Plan B Task B2; \`ui.css\` \`.gn-field__input\`, \`.gn-segmented*\`) — text fields sit recessed with their accessible edge (neo keeps its sunken field); the segmented control is a recessed pill track with pill tabs, text2 at rest and the selected tab raised on the lit-edge shadow (neo keeps its pressed tab). Cases 20.211–20.212.`

---

### Task B3: Floating surfaces — menus, popovers, select lists, info tips, editor popups, the TOC launcher

Ids `20.221`–`20.230`, section `## 20.23`. The guard moves by **2**. **Loud element:** none of its own. A dialog's loud element is its primary (Plan A Task 3). The five app-core dialog primaries (`bulk-close-dialog.tsx:274`, `new-ticket-dialog.tsx:1288`, `reopen-dialog.tsx:130`, `transition-dialog.tsx:583`, `visibility-editor.tsx:638`) are measured in 20.593.

**Audit:**

| Rule | Today | Becomes |
|---|---|---|
| `ui.css:3515` `.gn-select__panel` | raised, control radius | **P-FLOAT** |
| `ui.css:3527` `[data-style="neo"] .gn-select__panel` | restates `box-shadow: var(--gn-shadow-raised)` | **deleted**: P-FLOAT's `lift-near` already resolves per style (neo = its own larger raised pair) |
| `ui.css:3548` `.gn-popover` | raised, control radius | **P-FLOAT** |
| `ui.css:6931` `.gn-infotip__panel` | raised + 1px `border` edge | **P-FLOAT**, keeping its `border: 1px solid var(--gn-border)` (13.901: "keeps a boundary where the shadow cannot") |
| `globals.css:1908` `.mention-popup, .wikilink-popup, .ticketref-popup` | raised, control radius | **P-FLOAT** |
| `globals.css:2143` `.gn-nav__menu` | raised | **P-FLOAT** |
| `globals.css:4296` `.gn-card-menu__list` | raised, control radius | **P-FLOAT** |
| `globals.css:3362` `.gn-toc-launcher__panel` | raised | **P-FLOAT** |
| `globals.css:4072` `.wikilink-preview` | raised, no radius | **P-FLOAT** |
| `globals.css:4143` `.table-toolbar` | raised, no radius | **P-FLOAT** |
| `globals.css:3340` `.gn-toc-launcher__button` | a floating 44px round button, `raised` | `box-shadow: var(--gn-shadow-lift-near);` (it floats above the page) |
| `globals.css:4268` `.gn-delete-dialog__actions .gn-button` | `min-height: 2.75rem; padding-inline: 1rem;` at (0,2,0), which out-ranks the danger variant and holds the delete confirm at 44px | **deleted**, so the variants size themselves (Plan A Task 3's compound-selector table) |

**Kept:** `globals.css:4281` `.gn-card-menu__trigger` and its hover (`:4293`). It is already P-GHOST's shape: 44×44, borderless, transparent, 999px.

**Tests that name these selectors:** `apps/web/test/trash-css.test.tsx` (trash Plan 4's CSS test; `git grep` finds no test that pins `.gn-delete-dialog__actions`, so deleting it should redden nothing), `apps/web/test/notes-css.test.tsx`, `suggestion-popup-styling.test.ts`, `editor-skin-coverage.test.ts`, `trash-css.test.tsx`, `tap-target-density.test.ts`, `packages/editor/test/editor-css-binding.test.ts`, `mention.test.ts`, `wiki-link.test.ts`, `table-floating-toolbar.test.tsx`, `packages/ui/test/components.test.tsx` ("the neo panel gets shadow-only elevation", `:929-931`, pins the neo select panel: amend it to read `lift-near` from the base rule), and `tokens.test.ts` (13.901).

```markdown
- ❌ **20.221 — every floating panel rests on `lift-near` with the card radius on the raised ground, and neo reaches its own floating shadow through the token with no `[data-style]` fork;** control: the info tip keeps its 1px `border` edge. Mutation: restore `box-shadow: var(--gn-shadow-raised)` on `.gn-popover`.
- ❌ **20.222 — a floating panel's ground (`surfaceRaised`) differs from the page (`surface`) in hig and minimal, both themes, so a menu stays distinguishable where minimal draws no shadow;** control: under neo the two are the same hex by design (depth is shadow-only). Mutation: none (a token fact, witnessed by a planted equal-ground palette in the test's control).
```

```ts
import { colorOf } from '../src/tokens.js';

const FLOAT = [
  ['ui', '.gn-select__panel'],
  ['ui', '.gn-popover'],
  ['ui', '.gn-infotip__panel'],
  ['globals', ['.mention-popup', '.wikilink-popup', '.ticketref-popup']],
  ['globals', '.gn-nav__menu'],
  ['globals', '.gn-card-menu__list'],
  ['globals', '.gn-toc-launcher__panel'],
  ['globals', '.wikilink-preview'],
  ['globals', '.table-toolbar'],
] as const;
const ROWS: RosterRow[] = [
  ...FLOAT.map(([sheet, selectors]) => ({ sheet, selectors, pattern: 'P-FLOAT' as const })),
  { sheet: 'ui', selectors: '.gn-infotip__panel', declarations: { border: '1px solid var(--gn-border)' } },
  { sheet: 'globals', selectors: '.gn-toc-launcher__button', declarations: { 'box-shadow': 'var(--gn-shadow-lift-near)' } },
];

describe('20.221 floating panels float near', () => {
  it('20.221 every row, no neo fork of the select panel, no size override on the delete dialog buttons', () => {
    for (const row of ROWS) expectRow(row);
    expect(stillDeclared('[data-style="neo"] .gn-select__panel')).toBe(false);
    expect(stillDeclared('.gn-delete-dialog__actions .gn-button')).toBe(false);
  });
});
describe('20.222 the floating ground differs from the page where no shadow carries it', () => {
  it('20.222 hig and minimal, both themes; neo equal by design', () => {
    for (const style of ['hig', 'minimal'] as const) {
      for (const theme of ['light', 'dark'] as const) {
        expect(colorOf(theme, 'surfaceRaised', style)).not.toBe(colorOf(theme, 'surface', style));
      }
    }
    // CONTROL — neo: same hex, the shadow is the boundary.
    expect(colorOf('light', 'surfaceRaised', 'neo')).toBe(colorOf('light', 'surface', 'neo'));
  });
});
```

(20.222 carries no mutation of its own because it pins a token fact. Say so in the commit body. It is a guard against a future palette edit that would make a minimal menu vanish.)

`Features.md` bullet: `- ✅ **Floating surfaces follow the rules** (styling refresh Plan B Task B3) — every menu, popover, select list, info tip, editor popup and the TOC launcher floats on the near-lift shadow with the card radius; neo gets its own floating depth through the token, with its separate select-panel fork removed. Cases 20.221–20.222.`

---

### Task B4: The app shell and navigation

Ids `20.231`–`20.240`, section `## 20.24`. The guard moves by **2**. **Loud element:** none. The shell supports each page's own. The nav's CURRENT item is raised, not accented (rule 03: the accent is saved for the action). This follows the mockup's nav (`Main.dc.html:35`): the current item is raised with a lit edge, the rest are text2.

**Audit** (`globals.css`):

| Rule | Today | Becomes |
|---|---|---|
| `:1818` `.gn-nav` | `box-shadow: var(--gn-shadow-raised)` on the sticky bar | `box-shadow: var(--gn-shadow-lift);` |
| `:2264` `.gn-nav a, .gn-nav__more-toggle` | radius 0.375rem, `transition: background .15s ease, color .15s ease` | `border-radius: 0.75rem; transition: background-color var(--gn-motion-feedback) ease-out, color var(--gn-motion-feedback) ease-out;` (colour stays `text-muted`) |
| `:2294` `.gn-nav a[aria-current='page'], .gn-nav button[aria-current='page']` | the retired constant: `fill-tertiary` + `text-accent`, 700 | `background: var(--gn-surface-raised); box-shadow: var(--gn-shadow-lift); color: var(--gn-text); font-weight: 600; border-radius: 0.75rem;` |
| `:2326` `.gn-theme-toggle` | `box-shadow: var(--gn-shadow-raised)` | `box-shadow: var(--gn-shadow-lift);` |
| `:40` `.gn-skip` | raised | `box-shadow: var(--gn-shadow-lift-near);` (it floats when focused) |
| `:2190` `.gn-nav__menu .gn-nav__menu-item--signout` | `border-top: 1px solid var(--gn-border)` (a 4.27:1 rule as a separator) | `border-top: 1px solid var(--gn-fill-secondary);` (decorative hairline, Plan A D18) |

**Kept:** `:2315` `[data-style="neo"] .gn-nav a[aria-current='page']`, neo's pressed-in current item (B-D3).

**Tests that name these selectors:** `apps/web/test/app-nav.test.tsx`, `nav-phone-disclosure.test.ts`, `mcp-tokens-page.test.tsx`, `skip-link.test.tsx`.

```markdown
- ❌ **20.231 — the navigation's current item is raised (the `lift` shadow on the raised ground, `text` at 600) instead of accent-coloured, its links transition in the feedback time with a 12px radius, the bar and the theme toggle rest on `lift`, the skip link floats near, and the account menu's sign-out separator is a decorative hairline;** control: the non-current links keep `text-muted`. Mutation: restore `color: var(--gn-text-accent)` on the current item.
- ❌ **20.232 — no shell rule paints a flat boundary or the retired accent constant, and neo's pressed current item is still declared;** control: `stillDeclared` finds the neo rule. Mutation: restore `background: var(--gn-fill-tertiary); color: var(--gn-text-accent)` on the current item.
```

```ts
const CURRENT = [".gn-nav a[aria-current='page']", ".gn-nav button[aria-current='page']"];
const ROWS: RosterRow[] = [
  { sheet: 'globals', selectors: '.gn-nav', declarations: { 'box-shadow': 'var(--gn-shadow-lift)' } },
  {
    sheet: 'globals',
    selectors: ['.gn-nav a', '.gn-nav__more-toggle'],
    declarations: {
      'border-radius': '0.75rem',
      transition: 'background-color var(--gn-motion-feedback) ease-out, color var(--gn-motion-feedback) ease-out',
      color: 'var(--gn-text-muted)',
    },
  },
  {
    sheet: 'globals',
    selectors: CURRENT,
    declarations: {
      background: 'var(--gn-surface-raised)',
      'box-shadow': 'var(--gn-shadow-lift)',
      color: 'var(--gn-text)',
      'font-weight': '600',
      'border-radius': '0.75rem',
    },
  },
  { sheet: 'globals', selectors: '.gn-theme-toggle', declarations: { 'box-shadow': 'var(--gn-shadow-lift)' } },
  { sheet: 'globals', selectors: '.gn-skip', declarations: { 'box-shadow': 'var(--gn-shadow-lift-near)' } },
  {
    sheet: 'globals',
    selectors: '.gn-nav__menu .gn-nav__menu-item--signout',
    declarations: { 'border-top': '1px solid var(--gn-fill-secondary)' },
  },
];
const KEPT = ["[data-style=\"neo\"] .gn-nav a[aria-current='page']"];

describe('20.231 the shell follows the rules', () => {
  it('20.231 every row', () => {
    for (const row of ROWS) expectRow(row);
  });
});
describe('20.232 no flat boundary in the shell', () => {
  it('20.232 none; neo current kept', () => {
    expect(flatBoundaryOffenders(cssOf('globals'), ['.gn-nav', '.gn-theme-toggle', '.gn-skip'], KEPT)).toEqual([]);
    for (const kept of KEPT) expect(stillDeclared(kept), kept).toBe(true);
  });
});
```

`Features.md` bullet: `- ✅ **The app shell follows the rules** (styling refresh Plan B Task B4; \`globals.css\` \`.gn-nav*\`) — the current nav item is raised on the lit-edge shadow in text1 instead of accent-coloured (the accent is saved for each page's action), links answer in the feedback time, the bar rests on the lift shadow, the skip link floats near and the account menu's separator is a hairline. Cases 20.231–20.232.`

---

### Task B5: The project page's chrome (header, search, tabs rail, filters, banners)

Ids `20.241`–`20.250`, section `## 20.25`. The guard moves by **2**. **Loud element:** **New ticket** (`create-ticket-flow.tsx:488`, P-PRIMARY since Plan A Task 3). Filters is P-QUIET (Plan A). The tab rail is B2's segmented control.

**Audit** (`ui.css`):

| Rule | Today | Becomes |
|---|---|---|
| `:6163` `.gn-project__header` | `gap: 0.75rem` | `gap: 1rem` (16 between groups, rule 02) |
| `:4899` `.gn-contest-banner` | `surface-sunken`, radius 6px, a 1px `contested` edge | **P-WELL**, keeping `border: 1px solid var(--gn-contested)` (a state edge, B-D5) |
| `:4860` `.gn-saved-filters__name` (the rename field) | `surface-sunken`, radius 4px | `background: var(--gn-fill-quaternary); box-shadow: var(--gn-shadow-track); border-radius: var(--gn-radius-control);` (a field: B2's treatment) |
| `:4999` `.gn-sync-notices__dismiss` | transparent, 1px `border`, `text`, radius 6px | **P-QUIET** |

**Kept:** `:6331` `.gn-project__filter-chip-remove`, at the 24px in-list floor (13.1140).

**Tests that name these selectors:** `apps/web/test/project-page-head.test.tsx`, `packages/app-core/test/sync-ux-css-binding.test.tsx`, `preferences/saved-filters-css-binding.test.tsx`.

```markdown
- ❌ **20.241 — the project header's groups are 16px apart; the contested-claim banner is a recessed well keeping its contested edge; the saved-filter rename field is recessed like every field; the sync notice's Dismiss is a quiet outlined control;** control: the filter chip's remove control keeps its 24px in-list floor. Mutation: restore `border-radius: 6px` on `.gn-sync-notices__dismiss`.
- ❌ **20.242 — no project-chrome rule (`gn-project`, `gn-filters`, `gn-saved-filters`, `gn-contest-banner`, `gn-sync-`) paints a flat boundary or the retired constant;** control: the scan reads more than 40 rules under those prefixes. Mutation: restore `background: var(--gn-surface-sunken)` on `.gn-contest-banner`.
```

```ts
const ROWS: RosterRow[] = [
  { sheet: 'ui', selectors: '.gn-project__header', declarations: { gap: '1rem' } },
  { sheet: 'ui', selectors: '.gn-contest-banner', pattern: 'P-WELL', declarations: { border: '1px solid var(--gn-contested)' } },
  {
    sheet: 'ui',
    selectors: '.gn-saved-filters__name',
    declarations: { background: 'var(--gn-fill-quaternary)', 'box-shadow': 'var(--gn-shadow-track)', 'border-radius': 'var(--gn-radius-control)' },
  },
  { sheet: 'ui', selectors: '.gn-sync-notices__dismiss', pattern: 'P-QUIET' },
];
const PREFIXES = ['.gn-project', '.gn-filters', '.gn-saved-filters', '.gn-contest-banner', '.gn-sync-'];

describe('20.241 the project chrome follows the rules', () => {
  it('20.241 every row; the chip remove keeps its in-list floor', () => {
    for (const row of ROWS) expectRow(row);
    expectRow({ sheet: 'ui', selectors: '.gn-project__filter-chip-remove', declarations: { 'min-height': '1.5rem' } });
  });
});
describe('20.242 no flat boundary in the project chrome', () => {
  it('20.242 none', () => {
    const css = cssOf('ui');
    expect(parseRules(css).filter((rule) => rule.selectors.some((s) => PREFIXES.some((p) => s.includes(p)))).length).toBeGreaterThan(40);
    expect(flatBoundaryOffenders(css, PREFIXES, [])).toEqual([]);
  });
});
```

`Features.md` bullet: `- ✅ **The project page's chrome follows the rules** (styling refresh Plan B Task B5) — New ticket is the page's one loud element; header groups sit 16px apart; the contested-claim banner is a recessed well with its state edge; the saved-filter rename field is recessed like every field; the sync notice's Dismiss is a quiet outlined control. Cases 20.241–20.242.`

---

### Task B6: The List and Backlog tabs

Ids `20.251`–`20.260`, section `## 20.26`. The guard moves by **3**. **Loud element:** **New ticket** (the project header). The list's own controls are quiet (the toolbar) or ghost (inside rows).

**Audit** (`ui.css`):

| Rule | Today | Becomes |
|---|---|---|
| `:881` `.gn-table__row--clickable:hover` | `surface-sunken` | **P-HOVER** |
| `:1511` group `.gn-row-action, .gn-list__bulk-close` (after Plan A split the board out) | the retired constant | **split in two**: `.gn-row-action` → **P-GHOST** (text, `padding: 0 0.75rem`); `.gn-list__bulk-close` → **P-QUIET**. The `:focus-visible` and `:disabled` groups keep both names |
| `:1705` `.gn-list__columns-toggle` | 36px, borderless | **P-QUIET** |
| `:1773` `.gn-list__column-option` | 36px raised pill | `min-height: 2.75rem; box-shadow: var(--gn-shadow-lift);` |
| `:1865` `.gn-list__section-title` | `surface-sunken` + sunken shadow band | `background: var(--gn-surface-track); box-shadow: var(--gn-shadow-track); border-radius: var(--gn-radius-card);` |
| `:2002` `.gn-list__table-wrap` | raised | **P-RAISED** |
| `:2031` `.gn-list__table-header` | `surface-sunken` | `background: var(--gn-surface-well);` (a recessed header band inside the raised table) |

**Kept:**
- `:1929` `.gn-list__collapse`, at the 24px in-list floor;
- `:2112` `.gn-list__tail-drop`, the drop indicator's `border` edge (state);
- the `:nth-child(odd)` zebra (`fill-quaternary`, not a boundary).

**Tests that name these selectors:** `packages/app-core/test/views/ticket-list-css-binding.test.tsx` (it pins the columns toggle, the column option and bulk close; expect amendments), `ticket-list.test.tsx`, `heading-outline.test.ts`, `apps/web/test/list-bulk-close.test.tsx`, `backlog-tab.test.tsx`.

```markdown
- ❌ **20.251 — the List's rows answer hover with a soft fill, its row actions are ghost controls, its bulk close and column toggle are quiet outlined 44px controls, its column options are raised 44px pills, its section titles are recessed bands, and its table is a raised panel with a recessed header band;** control: the collapse caret keeps its 24px in-list floor. Mutation: restore `min-height: 2.25rem` on `.gn-list__columns-toggle`.
- ❌ **20.252 — no List/Backlog rule (`gn-list`, `gn-table`, `gn-row-action`) paints a flat boundary or the retired constant;** control: the tail-drop indicator keeps its `border` state edge. Mutation: restore `background: var(--gn-surface-sunken)` on the clickable-row hover.
- ❌ **20.253 — the bulk close is QUIET (edged) and a row action is GHOST (edgeless): a standalone toolbar control carries an edge, a control inside a row does not;** control: both keep 44px. Mutation: give `.gn-row-action` `border: 1px solid var(--gn-border)`.
```

```ts
const ROWS: RosterRow[] = [
  { sheet: 'ui', selectors: '.gn-table__row--clickable:hover', pattern: 'P-HOVER' },
  { sheet: 'ui', selectors: '.gn-row-action', pattern: 'P-GHOST' },
  { sheet: 'ui', selectors: '.gn-list__bulk-close', pattern: 'P-QUIET' },
  { sheet: 'ui', selectors: '.gn-list__columns-toggle', pattern: 'P-QUIET' },
  { sheet: 'ui', selectors: '.gn-list__column-option', declarations: { 'min-height': '2.75rem', 'box-shadow': 'var(--gn-shadow-lift)' } },
  {
    sheet: 'ui',
    selectors: '.gn-list__section-title',
    declarations: { background: 'var(--gn-surface-track)', 'box-shadow': 'var(--gn-shadow-track)', 'border-radius': 'var(--gn-radius-card)' },
  },
  { sheet: 'ui', selectors: '.gn-list__table-wrap', pattern: 'P-RAISED' },
  { sheet: 'ui', selectors: '.gn-list__table-header', declarations: { background: 'var(--gn-surface-well)' } },
];

describe('20.251 the List follows the rules', () => {
  it('20.251 every row; the collapse caret keeps its in-list floor', () => {
    for (const row of ROWS) expectRow(row);
    expectRow({ sheet: 'ui', selectors: '.gn-list__collapse', declarations: { 'min-height': '1.5rem' } });
  });
});
describe('20.252 no flat boundary on the List', () => {
  it('20.252 none; the tail-drop state edge kept', () => {
    expect(flatBoundaryOffenders(cssOf('ui'), ['.gn-list', '.gn-table', '.gn-row-action'], [])).toEqual([]);
    expectRow({ sheet: 'ui', selectors: '.gn-list__tail-drop', declarations: { 'border-top': '2px solid var(--gn-border)' } });
  });
});
describe('20.253 quiet in the toolbar, ghost in the row', () => {
  it('20.253 the bulk close has the edge; the row action does not', () => {
    expectRow({ sheet: 'ui', selectors: '.gn-list__bulk-close', declarations: { border: '1px solid var(--gn-border)' } });
    expectRow({ sheet: 'ui', selectors: '.gn-row-action', declarations: { border: 'none', 'min-height': '2.75rem' } });
  });
});
```

`Features.md` bullet: `- ✅ **The List and Backlog tabs follow the rules** (styling refresh Plan B Task B6) — a raised table with a recessed header band and recessed section titles; rows answer hover with a soft fill; row actions are ghost controls and the toolbar's bulk close and column chooser are quiet outlined 44px controls. Cases 20.251–20.253.` Under the List's own bullet (`Features.md:70`), append a `  - ✅` sub-bullet naming 20.251–20.253.

---

### Task B7: The Calendar tab

Ids `20.261`–`20.270`, section `## 20.27`. The guard moves by **2**. **Loud element:** **New ticket** (the header). The calendar's navigation is quiet.

**Audit** (`ui.css`):

| Rule | Today | Becomes |
|---|---|---|
| `:4160` `.gn-calendar__nav` | the retired constant, 36px | **P-QUIET** |
| `:4177` `.gn-calendar__today` | 36px, borderless, `text-accent` | **P-QUIET** |
| `:4225` `.gn-calendar__legend` | raised, control radius | **P-RAISED** |
| `:4288` `.gn-calendar__grid` | `surface-sunken` + sunken shadow; its 1px gap draws the day lines | `background: var(--gn-surface-track); box-shadow: var(--gn-shadow-track); border-radius: var(--gn-radius-track);`. Keep `gap: 1px; padding: 1px`: the track shows through as the grid lines (day cells on the raised ground against the track measure 1.19:1 in hig light, against 1.23 today, so the lines read as they did) |
| `:4303` `.gn-calendar__weekday-head` | `surface-sunken` | `background: transparent;` (the weekday names sit on the track, `textSubtle` on `surfaceTrack` is a declared 4.5 pair) |

**Kept:** `:4442` `.gn-calendar__item--unplaceable`, a state-bearing dashed edge.

**Tests that name these selectors:** `packages/ui/test/components.test.tsx` (13.1147: the calendar nav "takes the calendar nav's own values"; amend to P-QUIET), `in-transit.test.ts` (11.214: the grid's items background), `packages/app-core/test/calendar/calendar-view.test.tsx`.

```markdown
- ❌ **20.261 — the calendar's navigation and Today are quiet outlined 44px controls, its legend a raised panel, its grid a recessed track whose 1px gaps still draw the day lines, and its weekday row sits on the track without a fill of its own;** control: the grid keeps `gap: 1px`. Mutation: restore `min-height: 2.25rem` on `.gn-calendar__nav`.
- ❌ **20.262 — no calendar rule paints a flat boundary or the retired constant;** control: the unplaceable item keeps its state edge. Mutation: restore `background: var(--gn-surface-sunken)` on `.gn-calendar__weekday-head`.
```

```ts
const ROWS: RosterRow[] = [
  { sheet: 'ui', selectors: '.gn-calendar__nav', pattern: 'P-QUIET' },
  { sheet: 'ui', selectors: '.gn-calendar__today', pattern: 'P-QUIET' },
  { sheet: 'ui', selectors: '.gn-calendar__legend', pattern: 'P-RAISED' },
  {
    sheet: 'ui',
    selectors: '.gn-calendar__grid',
    declarations: {
      background: 'var(--gn-surface-track)',
      'box-shadow': 'var(--gn-shadow-track)',
      'border-radius': 'var(--gn-radius-track)',
      gap: '1px',
    },
  },
  { sheet: 'ui', selectors: '.gn-calendar__weekday-head', declarations: { background: 'transparent' } },
];

describe('20.261 the Calendar follows the rules', () => {
  it('20.261 every row', () => {
    for (const row of ROWS) expectRow(row);
  });
});
describe('20.262 no flat boundary on the Calendar', () => {
  it('20.262 none; the unplaceable state edge kept', () => {
    expect(flatBoundaryOffenders(cssOf('ui'), ['.gn-calendar'], [])).toEqual([]);
    expect(stillDeclared('.gn-calendar__item--unplaceable')).toBe(true);
  });
});
```

`Features.md` bullet: `- ✅ **The Calendar tab follows the rules** (styling refresh Plan B Task B7) — quiet outlined navigation, a raised legend, the month grid a recessed track whose gaps still draw the day lines. Cases 20.261–20.262.`

---

### Task B8: The Timeline tab

Ids `20.271`–`20.280`, section `## 20.28`. The guard moves by **2**. **Loud element:** **New ticket**.

**Audit** (`ui.css`):

| Rule | Today | Becomes |
|---|---|---|
| `:4505` `.gn-timeline__nav` | the retired constant, 36px | **P-QUIET** |
| `:4567` `.gn-timeline__weeks` | `surface-sunken` + sunken shadow | `background: var(--gn-surface-track); box-shadow: var(--gn-shadow-track);` |
| `:4659` `.gn-timeline__side` | `surface-sunken` + sunken shadow | `background: var(--gn-surface-track); box-shadow: var(--gn-shadow-track);` |

**Kept:** `:4637`–`:4638` (the clipped-bar edges) and `:4679` (the side-entry markers). All three are state-bearing `border` edges.

**Tests that name these selectors:** `packages/ui/test/components.test.tsx` (13.1147's timeline arm), `packages/app-core/test/timeline/timeline-view.test.tsx`, `views/ticket-list-css-binding.test.tsx`.

```markdown
- ❌ **20.271 — the timeline's navigation is a quiet outlined 44px control and its weeks band and side panel are recessed tracks;** control: the clipped-bar state edges are still declared. Mutation: restore `min-height: 2.25rem` on `.gn-timeline__nav`.
- ❌ **20.272 — no timeline rule paints a flat boundary or the retired constant;** control: the scan reads more than 20 timeline rules. Mutation: restore `background: var(--gn-surface-sunken)` on `.gn-timeline__side`.
```

```ts
const ROWS: RosterRow[] = [
  { sheet: 'ui', selectors: '.gn-timeline__nav', pattern: 'P-QUIET' },
  { sheet: 'ui', selectors: '.gn-timeline__weeks', declarations: { background: 'var(--gn-surface-track)', 'box-shadow': 'var(--gn-shadow-track)' } },
  { sheet: 'ui', selectors: '.gn-timeline__side', declarations: { background: 'var(--gn-surface-track)', 'box-shadow': 'var(--gn-shadow-track)' } },
];

describe('20.271 the Timeline follows the rules', () => {
  it('20.271 every row; state edges kept', () => {
    for (const row of ROWS) expectRow(row);
    expect(stillDeclared('.gn-timeline__bar[data-clipped-start]')).toBe(true);
  });
});
describe('20.272 no flat boundary on the Timeline', () => {
  it('20.272 none', () => {
    const css = cssOf('ui');
    expect(parseRules(css).filter((rule) => rule.selectors.some((s) => s.includes('.gn-timeline'))).length).toBeGreaterThan(20);
    expect(flatBoundaryOffenders(css, ['.gn-timeline'], [])).toEqual([]);
  });
});
```

`Features.md` bullet: `- ✅ **The Timeline tab follows the rules** (styling refresh Plan B Task B8) — quiet outlined navigation; the weeks band and side panel are recessed tracks; the clipped-bar and marker state edges are unchanged. Cases 20.271–20.272.`

---

### Task B9: Empty states

Ids `20.281`–`20.290`, section `## 20.29`. The guard moves by **2**. **Loud element:** on a board with no tickets, **New ticket** in the header stays the one loud element. So the empty state's own **Create a ticket** action is QUIET. A second primary would break rule 01.

**Audit** (`ui.css`):

| Rule | Today | Becomes |
|---|---|---|
| `:1093` `.gn-board--empty` | `fill-quaternary`, card radius | `background: var(--gn-surface-track); box-shadow: var(--gn-shadow-track); border-radius: var(--gn-radius-track);` (the board's own ground, as its columns) |
| `:1115` `.gn-board__empty-create` | the retired constant | **P-QUIET** (keep its `font-size: 0.9375rem`) |
| `:1015` `.gn-board__column-empty` | `fill-quaternary` inside the column track | `background: transparent;` (the track shows through; the copy and the icon disc carry it) |

**Kept:** `:1038` `.gn-board__column-empty-icon`, its `fill-tertiary` disc and neo's `sunken-compact` (not a boundary job).

**Other screens' empty states** belong to their own screen's task: `.gn-help__none` is B20, and the notes states are B11.

**Tests that name these selectors:** `packages/ui/test/components.test.tsx` (13.1144, `:1805-1866`: its container and action arms pin the old fill and constant; amend both, and its reset-order arm `:1837-1850` still holds), `bare-control-coverage.test.ts` (13.1143: the empty-create reset), `packages/app-core/test/views/board.test.tsx` (the column-empty DOM).

```markdown
- ❌ **20.281 — an empty board is its own recessed track (the board's ground), its create action is a quiet outlined control because New ticket is already the screen's one loud element, and an empty column lets its track show through;** control: the empty column's icon disc keeps its fill. Mutation: restore the retired constant on `.gn-board__empty-create`.
- ❌ **20.282 — no board-empty rule paints a flat boundary or the retired constant, and 13.1144's reset-before-rule order still holds;** control: the P1 grouped reset still precedes the styled rule. Mutation: plant `background: var(--gn-surface-sunken)` into `.gn-board__column-empty`.
```

```ts
const ROWS: RosterRow[] = [
  {
    sheet: 'ui',
    selectors: '.gn-board--empty',
    declarations: { background: 'var(--gn-surface-track)', 'box-shadow': 'var(--gn-shadow-track)', 'border-radius': 'var(--gn-radius-track)' },
  },
  { sheet: 'ui', selectors: '.gn-board__empty-create', pattern: 'P-QUIET', declarations: { 'font-size': '0.9375rem' } },
  { sheet: 'ui', selectors: '.gn-board__column-empty', declarations: { background: 'transparent' } },
];

describe('20.281 empty states follow the rules', () => {
  it('20.281 every row; the icon disc keeps its fill', () => {
    for (const row of ROWS) expectRow(row);
    expectRow({ sheet: 'ui', selectors: '.gn-board__column-empty-icon', declarations: { background: 'var(--gn-fill-tertiary)' } });
  });
});
describe('20.282 no flat boundary in the empty states', () => {
  it('20.282 none; the reset still precedes the rule', () => {
    expect(flatBoundaryOffenders(cssOf('ui'), ['.gn-board--empty', '.gn-board__empty', '.gn-board__column-empty'], [])).toEqual([]);
    const css = cssOf('ui');
    expect(css.indexOf('.gn-board__empty-create,\n.add-rule-menu__trigger {')).toBeLessThan(css.indexOf('.gn-board__empty-create {'));
  });
});
```

`Features.md` bullet: `- ✅ **Empty states follow the rules** (styling refresh Plan B Task B9) — an empty board is a recessed track like its columns; its create action is quiet because the header's New ticket is already the one loud element; an empty column shows its track. Cases 20.281–20.282.`

---

### Task B10: My work

Ids `20.291`–`20.300`, section `## 20.30`. The guard moves by **2**. **Loud element:** the page title. The page has no primary action, and its rows are doors into tickets.

**Audit:** the scan finds NO flat boundary and no retired constant under `gn-my-work`/`gn-attention`. What reaches this screen is:
- the shared layers: Card (Plan A Task 4), Button (Plan A Task 3), chips;
- the shell (B4).

**Kept:** `ui.css:2249` `.gn-my-work__title` and `:2198`/`:2213` `.gn-attention__item`/`__title`. All three sit at the 24px dense-in-list floor, which `DENSE_IN_LIST` records (`apps/web/e2e-viewport/tap-targets.ts`), and the rows are the doors.

This task is an AUDIT task. It changes no CSS unless the browser case (20.595) finds something. Its cases pin that the audit holds: a later edit that reintroduces a flat boundary here goes red.

```markdown
- ❌ **20.291 — My work paints no flat boundary and no retired control constant under `gn-my-work`/`gn-attention`, so it inherits the refresh through the shared layers alone;** control: the scan reads at least 15 rules under those prefixes. Mutation: plant `background: var(--gn-surface-sunken)` into `.gn-my-work__title`.
- ❌ **20.292 — My work's row titles keep their declared 24px in-list floor (they are the doors, and `DENSE_IN_LIST` names them);** control: the attention title keeps the same floor. Mutation: set `.gn-my-work__title`'s `min-height` to `1rem`.
```

```ts
describe('20.291 My work inherits the refresh', () => {
  it('20.291 no flat boundary', () => {
    const css = cssOf('ui');
    const prefixes = ['.gn-my-work', '.gn-attention'];
    expect(parseRules(css).filter((rule) => rule.selectors.some((s) => prefixes.some((p) => s.includes(p)))).length).toBeGreaterThanOrEqual(15);
    expect(flatBoundaryOffenders(css, prefixes, [])).toEqual([]);
  });
});
describe('20.292 the rows keep their in-list floor', () => {
  it('20.292 1.5rem on both titles', () => {
    expectRow({ sheet: 'ui', selectors: '.gn-my-work__title', declarations: { 'min-height': '1.5rem' } });
    expectRow({ sheet: 'ui', selectors: '.gn-attention__title', declarations: { 'min-height': '1.5rem' } });
  });
});
```

`Features.md` bullet: `- ⚙️ **My work, audited** (styling refresh Plan B Task B10) — no flat boundary or retired control constant; the page inherits the refresh through the shared Card, Button and shell, and its row titles keep the 24px in-list floor. Cases 20.291–20.292.`

---

### Task B11: Notes — the list, a note's page, the editor chrome, comments

Ids `20.301`–`20.310`, section `## 20.31`. The guard moves by **2**. **Loud element:**
- on the notes list, its create control;
- in the create dialog, **Create** (`apps/web/src/notes/create-note-dialog.tsx:196`, P-PRIMARY);
- on a note's page, the note's title;
- **Keep** (`draft-restore-banner.tsx:34`) is the banner's one action, and it stays primary.

**Audit:**

| Rule | Today | Becomes |
|---|---|---|
| `globals.css:3501` `.gn-notes__deleted` | `border-top: 1px solid var(--gn-border)` as a separator | `border-top: 1px solid var(--gn-fill-secondary);` (decorative hairline, Plan A D18) |
| `ui.css:7353` `.gn-comment__code` | `surface-sunken` code block inside a raised comment | `background: var(--gn-surface-well);` (a recessed well; `text` on it is a declared pair) |

**Kept:**
- `globals.css:3414` `.gn-notes__filter` and `:3540` `.gn-notes__input` (fields with their edge);
- the editor content's `blockquote`/`hr`/table-cell edges (`globals.css:3919`, `:3930`, `:4113`) and `.gn-comment__rule`/`__quote` (`ui.css:7344`, `:7347`): document content, not controls.

**Tests that name these selectors:** `apps/web/test/notes-css.test.tsx`, `editor-skin-coverage.test.ts`, `note-document.test.tsx`, `packages/editor/test/editor-css-binding.test.ts`.

```markdown
- ❌ **20.301 — the notes page's deleted-notes separator is a decorative hairline and a comment's code block sits in a recessed well;** control: the notes filter and input keep their 1px `border` edge. Mutation: restore `background: var(--gn-surface-sunken)` on `.gn-comment__code`.
- ❌ **20.302 — no notes, comment or editor-chrome rule paints a flat boundary or the retired constant;** control: the scan reads more than 60 rules under `gn-notes`. Mutation: plant `background: var(--gn-surface-sunken)` into `.gn-notes__deleted`.
```

```ts
const ROWS: RosterRow[] = [
  { sheet: 'globals', selectors: '.gn-notes__deleted', declarations: { 'border-top': '1px solid var(--gn-fill-secondary)' } },
  { sheet: 'ui', selectors: '.gn-comment__code', declarations: { background: 'var(--gn-surface-well)' } },
];

describe('20.301 Notes follow the rules', () => {
  it('20.301 every row; fields keep their edge', () => {
    for (const row of ROWS) expectRow(row);
    expectRow({ sheet: 'globals', selectors: '.gn-notes__input', declarations: { border: '1px solid var(--gn-border)' } });
  });
});
describe('20.302 no flat boundary in Notes', () => {
  it('20.302 none', () => {
    const globals = cssOf('globals');
    expect(parseRules(globals).filter((rule) => rule.selectors.some((s) => s.includes('.gn-notes'))).length).toBeGreaterThan(60);
    expect(flatBoundaryOffenders(globals, ['.gn-notes', '.gn-note-', '.ticket-editor', '.gn-comment'], [])).toEqual([]);
    expect(flatBoundaryOffenders(cssOf('ui'), ['.gn-comment', '.gn-note-'], [])).toEqual([]);
  });
});
```

`Features.md` bullet: `- ✅ **Notes follow the rules** (styling refresh Plan B Task B11) — the create dialog's Create and the draft banner's Keep are the loud elements (shared primary); the deleted-notes separator is a hairline; code in comments sits in a recessed well. Cases 20.301–20.302.`

---

### Task B12: Members and invitations

Ids `20.311`–`20.320`, section `## 20.32`. The guard moves by **2**. **Loud element:** **Send invitation** (`apps/web/app/w/[workspaceId]/members/page.tsx:956`, P-PRIMARY).

**Audit** (`globals.css`):

| Rule | Today | Becomes |
|---|---|---|
| `:1555` `.gn-members` | raised | **P-RAISED** |
| `:1631` `.gn-members__th` | `surface-sunken` | `background: var(--gn-surface-well);` (a recessed header band inside the raised table) |

**Kept:** `:1672` `.gn-members__row:nth-child(even)`, a `fill-quaternary` zebra (not a boundary).

**Tests that name these selectors:** `apps/web/test/members-styling.test.ts` (it pins the header fill; amend it), `members-page.test.tsx`.

```markdown
- ❌ **20.311 — the members table is a raised panel with a recessed header band; Send invitation is the screen's one loud element (the shared primary);** control: the zebra rows keep their `fill-quaternary`. Mutation: restore `background: var(--gn-surface-sunken)` on `.gn-members__th`.
- ❌ **20.312 — no members or invite rule paints a flat boundary or the retired constant;** control: the scan reads more than 15 member rules. Mutation: plant the retired constant into `.gn-members`.
```

```ts
const ROWS: RosterRow[] = [
  { sheet: 'globals', selectors: '.gn-members', pattern: 'P-RAISED' },
  { sheet: 'globals', selectors: '.gn-members__th', declarations: { background: 'var(--gn-surface-well)' } },
];

describe('20.311 Members follow the rules', () => {
  it('20.311 every row; the zebra is kept', () => {
    for (const row of ROWS) expectRow(row);
    expectRow({ sheet: 'globals', selectors: '.gn-members__row:nth-child(even)', declarations: { background: 'var(--gn-fill-quaternary)' } });
  });
});
describe('20.312 no flat boundary on Members', () => {
  it('20.312 none', () => {
    const css = cssOf('globals');
    expect(parseRules(css).filter((rule) => rule.selectors.some((s) => s.includes('.gn-members'))).length).toBeGreaterThan(15);
    expect(flatBoundaryOffenders(css, ['.gn-members', '.gn-invite-mint', '.gn-invite-pending'], [])).toEqual([]);
  });
});
```

`Features.md` bullet: `- ✅ **Members follows the rules** (styling refresh Plan B Task B12) — Send invitation is the screen's one loud element; the table is a raised panel with a recessed header band. Cases 20.311–20.312.`

---

### Task B13: The workspace home — and the one hover vocabulary for every door card (amended 2026-09-29: shadow only)

Ids `20.321`–`20.330`, section `## 20.33`. The guard moves by **3**. **Loud element:** **Create project** (`apps/web/app/w/[workspaceId]/page.tsx:1253`, P-PRIMARY). **Save name** (`:907`) renders only while the name is being edited, and it is the loud element of that moment.

**The hover vocabulary changes product-wide here.** Round 21 (owner: "also lighten the setting cards") gave every card-shaped door ONE hover: `filter: brightness(0.97)` in light and `1.18` in dark (`globals.css:526-537`, `:1107-1111`). The owner's 2026-09-29 rulings replace it with P-LIFT, which after the kanban ruling of the same day is **shadow only**: hover deepens the card's shadow and nothing scales. It is still ONE vocabulary, for the workspace card, the project card and the home's section cards together. The workspace card's own rules are B14's, but the shared hover rule is here.

⚠ `filter` ALSO creates a containing block for `position: fixed` descendants. The project and workspace cards hold an overflow menu that opens `DeleteDialog` INSIDE the card (trash Plan 4 D5), so today's brightness hover already contains that dialog while the card is hovered. Deleting the filter fixes it. The shadow-only P-LIFT adds no transform, so no guard is needed (Plan A D21, retired). 20.322 pins that no door-card rule transforms or filters.

**Audit** (`globals.css`):

| Rule | Today | Becomes |
|---|---|---|
| `:526-527` `.gn-card:has(> .gn-workspace-card__door:hover), .gn-card:has(> .gn-project-card__door:hover)` | `filter: brightness(0.97)` | **P-LIFT hover**. The selectors stay as they are, and the filter becomes `box-shadow: var(--gn-shadow-lift-near); z-index: 1;` |
| `:528-537` the two dark-theme brightness rules for the same selectors | `filter: brightness(1.18)` | **deleted**. The lift needs no per-theme arm: `lift-near` is per theme through the token |
| new, directly after | — | the `:active` pair: `.gn-card:has(> .gn-workspace-card__door:active), .gn-card:has(> .gn-project-card__door:active) { box-shadow: var(--gn-shadow-lift-press); transition-duration: var(--gn-motion-feedback); }` |
| `:443` `.gn-workspace-card` and `:1167` `.gn-project-card` | no transition | both gain `transition: box-shadow var(--gn-motion-lift) var(--gn-motion-ease-out);`. `.gn-workspace-card` also gains `position: relative;` (`.gn-project-card` already has it) |
| `:1079` `.gn-workspace-home__link` (the section cards) | raised | **P-RAISED**, plus the same transition |
| `:1107-1111` `.gn-workspace-home__link:hover` and its two dark arms | brightness | `.gn-workspace-home__link:hover { box-shadow: var(--gn-shadow-lift-near); position: relative; z-index: 1; }` and `.gn-workspace-home__link:active { box-shadow: var(--gn-shadow-lift-press); transition-duration: var(--gn-motion-feedback); }`. The two dark arms are deleted |
| `:1295`, `:1296-1298`, `:1300-1302` `.gn-project-card__actions .gn-button:hover:not(:disabled)` and its two dark arms | a brightness filter on the card's Archive button | **deleted**: the ghost Button's own hover fill (Plan A Task 3) answers it, as one hover vocabulary |
| `:1431` `.gn-project-founding` | raised | **P-RAISED** |

No reduced-motion arm (amended 2026-09-29). None of these rules moves anything, and a shadow change is not motion.

**Tests that name these selectors:** `apps/web/test/workspace-home.test.tsx`, `founding.test.tsx`, `workspace-restricted-spacing.test.ts`, `account-page.test.tsx`, `neo-card-radius.test.ts` (13.355/P16: the three card classes declare no radius; this task adds none to them), and whichever case pins the Round-21 brightness pair. Find it with `git grep -n "brightness(0.97)" -- '*/test/*'` and amend it to the lift.

```markdown
- ❌ **20.321 — every card-shaped door (workspace card, project card, the home's section cards) answers hover with the deeper `lift-near` shadow above its neighbours and press with `lift-press` in the feedback time — SHADOW ONLY, no scale (owner ruling 2026-09-29) — one vocabulary replacing Round 21's brightness pair, with no per-theme arm, each card's transition naming `box-shadow` alone;** control: no rule anywhere in `globals.css` still declares `filter: brightness(` on a card door. Mutation: restore `filter: brightness(0.97)` on the door hover rule.
- ❌ **20.322 — no door-card rule transforms or filters anything (every rule whose selector names `.gn-workspace-card`, `.gn-project-card`, either card's `__door`, or `.gn-workspace-home__link` declares neither `transform` nor `filter`, other than `none`), so the Delete dialog their overflow menu opens is never inside a containing block, and no guard or reduced-motion arm is needed (Plan A D21, retired);** control: the scan covers at least the six hover/press/rest rules this task writes. Mutation: put `transform: scale(1.025)` back on the project card's hover rule.
- ❌ **20.323 — the workspace home's section cards and the project-founding panel rest on the raised `lift` shadow;** control: `.gn-project-card` keeps `position: relative` (its door's `::after` hit area depends on it). Mutation: restore `box-shadow: var(--gn-shadow-raised)` on `.gn-project-founding`.
```

```ts
import { parseRules, valueOf } from './helpers/css-rules.js';

// Shadow only (owner ruling 2026-09-29): no scale, no guard, no reduced-motion arm.
const HOVER = [
  '.gn-card:has(> .gn-workspace-card__door:hover)',
  '.gn-card:has(> .gn-project-card__door:hover)',
];
const PRESS = [
  '.gn-card:has(> .gn-workspace-card__door:active)',
  '.gn-card:has(> .gn-project-card__door:active)',
];

describe('20.321 one hover vocabulary: the shadow', () => {
  it('20.321 doors deepen their shadow and settle on press; no brightness remains', () => {
    expectRow({ sheet: 'globals', selectors: HOVER, declarations: { 'box-shadow': 'var(--gn-shadow-lift-near)', 'z-index': '1' } });
    expectRow({ sheet: 'globals', selectors: PRESS, declarations: { 'box-shadow': 'var(--gn-shadow-lift-press)', 'transition-duration': 'var(--gn-motion-feedback)' } });
    expectRow({ sheet: 'globals', selectors: '.gn-workspace-home__link:hover', declarations: { 'box-shadow': 'var(--gn-shadow-lift-near)', 'z-index': '1' } });
    expectRow({ sheet: 'globals', selectors: '.gn-workspace-home__link:active', declarations: { 'box-shadow': 'var(--gn-shadow-lift-press)' } });
    for (const selectors of [['.gn-workspace-card'], ['.gn-project-card'], ['.gn-workspace-home__link']]) {
      expectRow({
        sheet: 'globals',
        selectors,
        declarations: { transition: 'box-shadow var(--gn-motion-lift) var(--gn-motion-ease-out)' },
      });
    }
    // CONTROL — no brightness filter survives ANYWHERE in globals.css: the three
    // families that used one (the two door cards, the section cards, the project
    // card's action button) were the only ones on `8b11d76e`.
    for (const rule of parseRules(cssOf('globals'))) {
      expect(valueOf(rule.body, 'filter') ?? '', rule.selectors.join(', ')).not.toMatch(/brightness\(/);
    }
  });
});
describe('20.322 no door card transforms or filters', () => {
  it('20.322 every door-card rule declares neither transform nor filter', () => {
    let scanned = 0;
    for (const rule of parseRules(cssOf('globals'))) {
      if (!rule.selectors.some((s) => /\.gn-workspace-card(__door)?\b|\.gn-project-card(__door)?\b|\.gn-workspace-home__link\b/.test(s))) continue;
      scanned += 1;
      for (const property of ['transform', 'filter']) {
        const value = valueOf(rule.body, property);
        expect(value === null || value === 'none', `${rule.selectors.join(', ')}: ${property}`).toBe(true);
      }
    }
    // CONTROL — the scan reaches the rules this task writes, the door hover/press rules
    // included (their selectors name `__door`, which the pattern above admits on purpose).
    expect(scanned).toBeGreaterThanOrEqual(6);
  });
});
describe('20.323 raised panels on the home', () => {
  it('20.323 section cards and the founding panel on lift; the project card stays positioned', () => {
    expectRow({ sheet: 'globals', selectors: '.gn-workspace-home__link', pattern: 'P-RAISED' });
    expectRow({ sheet: 'globals', selectors: '.gn-project-founding', pattern: 'P-RAISED' });
    expectRow({ sheet: 'globals', selectors: '.gn-project-card', declarations: { position: 'relative' } });
  });
});
```

(Merge the imports into the shared shape's import lines.)

`Features.md` bullet: `- ✅ **One hover vocabulary for every door card: the shadow deepens** (styling refresh Plan B Task B13; \`globals.css\`) — the workspace card, the project card and the workspace home's section cards answer hover with the near shadow above their neighbours and settle it on press — shadow only, nothing scales (owner ruling 2026-09-29) — replacing Round 21's brightness pair with no per-theme arm; with no filter or transform left, a card's own Delete dialog is never trapped in a containing block. Create project is the home's one loud element. Cases 20.321–20.323.` Under the workspace-home bullet (`Features.md:213`), append a `  - ✅` sub-bullet naming 20.321–20.323.

---

### Task B14: The workspaces list and invitations

Ids `20.331`–`20.340`, section `## 20.34`. The guard moves by **2**. **Loud element:** **Create workspace** (`apps/web/app/workspaces/page.tsx:853`). **Accept** (`:726`) renders once PER pending invitation, so with two invitations the page shows three primaries. Rule 01 wants one. **Accept becomes a ghost-variant `Button` (P-QUIET)**: one change at `:726`, `variant="primary"` → the default. B-D4.

This is the one JSX edit in Plan B. It is a variant change, not a structural one.

**Audit:** the scan finds no flat boundary under `gn-workspaces`/`gn-workspace-card`/`gn-invitations`/`gn-card-menu`. The door hover is B13's.

**Tests that name these selectors:** `apps/web/test/workspaces-invitation-banner.test.tsx` (13.378 presses Accept by NAME, which is unchanged), `workspaces-cards.test.tsx` (13.390 pins the owner card's buttons by name, not variant), `workspaces-archive-delete.test.tsx`, `trash-css.test.tsx`.

```markdown
- ❌ **20.331 — the workspaces page has ONE primary: Create workspace; each invitation's Accept is a quiet outlined control, so N pending invitations do not make N+1 loud elements;** control: Accept is still a `button` named "Accept" (its behaviour and name are unchanged). Mutation: restore `variant="primary"` on Accept.
- ❌ **20.332 — no workspaces-list rule paints a flat boundary or the retired constant;** control: the scan reads more than 20 rules. Mutation: plant `background: var(--gn-surface-sunken)` into `.gn-workspace-card__door`.
```

The 20.331 test is a DOM test in `apps/web`. Add it to `apps/web/test/workspaces-invitation-banner.test.tsx`, which already mocks the router and session and holds the two pending-invitation fixtures (`WAITING`, `UNNAMED`) and the `mount(invitations)` helper (`:94-141`). Add it as a new `describe` at the end of the file:

```tsx
describe('20.331 one loud element on /workspaces', () => {
  it('20.331 Create workspace is the only primary; each invitation\'s Accept is quiet', async () => {
    mount([WAITING, UNNAMED]);
    const banner = await screen.findByRole('region', { name: '2 invitations are waiting' });
    const accepts = [
      within(banner).getByRole('button', { name: 'Accept the invitation to Convenience Corner' }),
      within(banner).getByRole('button', {
        name: 'Accept the invitation to a workspace that has not been named yet',
      }),
    ];
    for (const button of accepts) {
      expect(button).toHaveClass('gn-button--ghost');
      expect(button).not.toHaveClass('gn-button--primary');
    }
    // CONTROL — the page's one primary is the founding form's Create workspace
    // (`workspaces/page.tsx:851-858`, rendered unconditionally at `:269`).
    const primaries = [...document.querySelectorAll('.gn-button--primary')];
    expect(primaries).toHaveLength(1);
    expect(primaries[0]).toHaveTextContent('Create workspace');
  });
});
```

The accessible names are the ones 13.378 already presses (`:202`, `:211`), so no copy is invented here.

```ts
describe('20.332 no flat boundary on /workspaces', () => {
  it('20.332 none', () => {
    const css = cssOf('globals');
    const prefixes = ['.gn-workspaces', '.gn-workspace-card', '.gn-invitations', '.gn-card-menu'];
    expect(parseRules(css).filter((rule) => rule.selectors.some((s) => prefixes.some((p) => s.includes(p)))).length).toBeGreaterThan(20);
    expect(flatBoundaryOffenders(css, prefixes, [])).toEqual([]);
  });
});
```

`Features.md` bullet: `- ✅ **The workspaces page has one loud element** (styling refresh Plan B Task B14) — Create workspace is the only primary; each invitation's Accept is a quiet outlined control (a variant change only), so pending invitations no longer multiply the loud elements; the cards deepen their shadow on hover, shadow only (B13). Cases 20.331–20.332.` Under the workspace card bullet (`Features.md:199`), append a `  - ✅` sub-bullet.

---

### Task B15: Settings and the workspace settings form

Ids `20.341`–`20.350`, section `## 20.35`. The guard moves by **2**. **Loud element:** **Save** (`apps/web/src/workspace-settings-form.tsx:439`).

**Audit** (`globals.css`):

| Rule | Today | Becomes |
|---|---|---|
| `:1366` `.gn-settings__sidebar` | raised | **P-RAISED** |
| `:3164` `.gn-workspace-settings__actions` | `border-top: 1px solid var(--gn-border)` as a separator | `border-top: 1px solid var(--gn-fill-secondary);` (decorative hairline) |

**Tests that name these selectors:** `apps/web/test/settings-shell-tokens.test.ts`, `settings-page.test.tsx`.

```markdown
- ❌ **20.341 — the settings sidebar is a raised panel and the workspace settings form's action row is separated by a decorative hairline; Save is the screen's one loud element;** control: the form's fields keep their accessible edge (B2). Mutation: restore `border-top: 1px solid var(--gn-border)` on the actions row.
- ❌ **20.342 — no settings rule paints a flat boundary or the retired constant;** control: the scan reads the settings and workspace-settings rules. Mutation: plant `background: var(--gn-surface-sunken)` into `.gn-settings__sidebar`.
```

```ts
const ROWS: RosterRow[] = [
  { sheet: 'globals', selectors: '.gn-settings__sidebar', pattern: 'P-RAISED' },
  { sheet: 'globals', selectors: '.gn-workspace-settings__actions', declarations: { 'border-top': '1px solid var(--gn-fill-secondary)' } },
];
describe('20.341 Settings follows the rules', () => {
  it('20.341 every row; fields keep their edge', () => {
    for (const row of ROWS) expectRow(row);
    expectRow({ sheet: 'ui', selectors: '.gn-field__input', declarations: { border: '1px solid var(--gn-border)' } });
  });
});
describe('20.342 no flat boundary in Settings', () => {
  it('20.342 none', () => {
    const css = cssOf('globals');
    const prefixes = ['.gn-settings', '.gn-workspace-settings', '.gn-workspace-list'];
    expect(parseRules(css).filter((rule) => rule.selectors.some((s) => prefixes.some((p) => s.includes(p)))).length).toBeGreaterThan(15);
    expect(flatBoundaryOffenders(css, prefixes, [])).toEqual([]);
  });
});
```

`Features.md` bullet: `- ✅ **Settings follows the rules** (styling refresh Plan B Task B15) — a raised sidebar; the form's action row is separated by a hairline, not a heavy edge; Save is the one loud element. Cases 20.341–20.342.`

---

### Task B16: The workflow builder and ticket types

Ids `20.351`–`20.360`, section `## 20.36`. The guard moves by **2**. **Loud elements:**
- on each list screen: **New workflow** (`workflow-list-screen.tsx:214`) and **New type** (`ticket-type-list-screen.tsx:385`);
- in the editors: **Publish** (`publish-controls.tsx:225`) and **Save ticket type** (`ticket-type-editor-screen.tsx:195`).

All four are already P-PRIMARY. Their `className`s (`workflow-list__new`, `ticket-type-list__new`, `publish-controls__publish`) set layout only: `publish-controls__publish` is `align-self: flex-start`, `ui.css:3244`.

**Audit** (`ui.css`):

| Rule | Today | Becomes |
|---|---|---|
| `:3625` `.ticket-type-list__row` | `surface-sunken`, radius 8px (a list row on the page) | **P-ROW** (raised on `lift`, card radius). The neo override `:3683` stays: neo's pressed row (B-D3, 10.80) |
| `:3335` `.fields-editor__row` | `surface-sunken`, control radius (a row inside the editor panel) | `background: var(--gn-surface-well);`. The neo override `:3347` stays |
| `:7226` `.ticket-type-list__move` | the retired constant, 44×44, control radius | **P-GHOST** icon (`min-width: 2.75rem` kept) |
| `:3193` `.advisories-panel` | `surface-sunken`, a dashed `warning` left edge, radius 6px | `background: var(--gn-surface-well); border-radius: var(--gn-radius-card);`. Keep `border-left: 3px dashed var(--gn-warning)` (state) |
| `:3768` `.ticket-type-editor__issues` | `surface-sunken` + `danger` left edge | `background: var(--gn-surface-well);`. Keep the edge |
| `:3783` `.ticket-type-editor__refused, .ticket-type-editor__invalid` | the same | `background: var(--gn-surface-well);`. Keep the edge |
| `:3825` `.ticket-type-editor__divergence-refused` | the same | `background: var(--gn-surface-well);`. Keep the edge |
| `:3863` `.read-only-banner` | `surface-sunken`, radius 8px | **P-WELL** |
| `:4043` `.workflow-builder-screen__canvas` | raised | **P-RAISED** |
| `:4064` `.state-inspector, .transition-inspector` | raised | **P-RAISED** |
| `:4090` `.inspector-panel__hint` | raised | **P-RAISED** |

**Kept:**
- the disabled fills `:3294`, `:3330`, `:3821`, `:3859` and `:4019` (state, B-D5);
- `:3719` `[data-style="neo"] .ticket-type-list__badge` and `:4024` `[data-style="neo"] .workflow-builder-screen__name` (B-D3);
- `:6666` `.workflow-list__state`, a state chip whose category bar case 13.920 measures against that exact ground (`tokens.test.ts:1622-1700`);
- the node and inspector-rule `border` edges `:3102`, `:3128`, `:4002` and `:4079` (graph structure and state).

**Pinned cases this task amends** (measured):
- **10.80** (`components.test.tsx:663`): its base arm pins `background: var(--gn-surface-sunken)` on both rows. Amend it to the new base (`surface-raised` for the type row, `surface-well` for the field row), and keep its neo arm unchanged.
- **16.83** (`:727`): it pins the retired constant on `.ticket-type-list__move`. Amend it to P-GHOST, keeping its 44px and no-style-fork arms.
- **13.1146** (`tokens.test.ts:2314-2345`, "the advisories title inherits a declared ink … the panel it inherits from is a DECLARED pair on sunken"): amend its ground to `surfaceWell`, where `textMuted` is declared by Plan A 20.002.
- **13.894** (`tokens.test.ts:1755-1940`, the even-row stripe): re-read it. The stripe must still differ from the row it sits on, and the row is now raised.

**Other tests that name these selectors:** `packages/app-core/test/ticket-types/ticket-types.test.tsx`, `workflow-builder/builder-css-binding.test.tsx`, `access.test.tsx`, `validation.test.tsx`, `screens.test.tsx`, `apps/web/test/builder-route.test.tsx`, `authoring-routes.test.tsx`, `apps/web/e2e-stack/builder-canvas.spec.ts`, `non-text-contrast-roster.json` (the move control).

```markdown
- ❌ **20.351 — the builder's lists are raised rows, its panels raised, its notices recessed wells keeping their state edges, and the ticket-type reorder control a ghost icon;** control: every kept neo override and disabled fill is still declared. Mutation: restore the retired constant on `.ticket-type-list__move`.
- ❌ **20.352 — no builder or ticket-type rule paints a flat boundary or the retired constant outside the kept list;** control: the kept list is non-empty and every entry still exists. Mutation: restore `background: var(--gn-surface-sunken)` on `.read-only-banner`.
```

```ts
const ROWS: RosterRow[] = [
  { sheet: 'ui', selectors: '.ticket-type-list__row', pattern: 'P-ROW' },
  { sheet: 'ui', selectors: '.fields-editor__row', declarations: { background: 'var(--gn-surface-well)' } },
  { sheet: 'ui', selectors: '.ticket-type-list__move', pattern: 'P-GHOST', declarations: { 'min-width': '2.75rem' } },
  {
    sheet: 'ui',
    selectors: '.advisories-panel',
    declarations: { background: 'var(--gn-surface-well)', 'border-radius': 'var(--gn-radius-card)', 'border-left': '3px dashed var(--gn-warning)' },
  },
  { sheet: 'ui', selectors: '.ticket-type-editor__issues', declarations: { background: 'var(--gn-surface-well)', 'border-left': '3px solid var(--gn-danger)' } },
  { sheet: 'ui', selectors: ['.ticket-type-editor__refused', '.ticket-type-editor__invalid'], declarations: { background: 'var(--gn-surface-well)' } },
  { sheet: 'ui', selectors: '.ticket-type-editor__divergence-refused', declarations: { background: 'var(--gn-surface-well)' } },
  { sheet: 'ui', selectors: '.read-only-banner', pattern: 'P-WELL' },
  { sheet: 'ui', selectors: '.workflow-builder-screen__canvas', pattern: 'P-RAISED' },
  { sheet: 'ui', selectors: ['.state-inspector', '.transition-inspector'], pattern: 'P-RAISED' },
  { sheet: 'ui', selectors: '.inspector-panel__hint', pattern: 'P-RAISED' },
];
const KEPT = [
  '.state-mapping-dialog__confirm:disabled',
  '.icon-picker__choice:disabled',
  '.ticket-type-editor__divergence-move:disabled',
  '.workflow-rebind-dialog__confirm:disabled',
  '.workflow-builder-screen__name:disabled',
  '[data-style="neo"] .ticket-type-list__badge',
  '[data-style="neo"] .workflow-builder-screen__name',
  '[data-style="neo"] .ticket-type-list__row',
  '[data-style="neo"] .fields-editor__row',
  '.workflow-list__state',
];
const PREFIXES = [
  '.ticket-type',
  '.fields-editor',
  '.advisories-panel',
  '.read-only-banner',
  '.workflow-',
  '.state-',
  '.transition-inspector',
  '.inspector-panel',
  '.icon-picker',
  '.publish-controls',
];

describe('20.351 the builder follows the rules', () => {
  it('20.351 every row; kept rules intact', () => {
    for (const row of ROWS) expectRow(row);
    for (const kept of KEPT) expect(stillDeclared(kept), kept).toBe(true);
  });
});
describe('20.352 no flat boundary in the builder', () => {
  it('20.352 none outside the kept list', () => {
    expect(flatBoundaryOffenders(cssOf('ui'), PREFIXES, KEPT)).toEqual([]);
  });
});
```

(The neo row overrides are in `KEPT` because they may restate `surface-sunken`: neo's pressed row is its character. If `flatBoundaryOffenders` reports a selector not in this table, it is a row the audit missed. Classify it by the Pattern table, add it to `ROWS` or `KEPT` with a line in the commit body, and never widen `PREFIXES` to hide it.)

`Features.md` bullet: `- ✅ **The workflow builder and ticket types follow the rules** (styling refresh Plan B Task B16) — list rows are raised items (neo keeps its pressed rows), panels and inspectors raised, notices recessed wells that keep their state edges, the reorder control a ghost icon; New workflow / New type / Publish / Save ticket type are the loud elements. Cases 20.351–20.352.` Under `Features.md` §10's ticket-type list bullet (`:2700`), append a `  - ✅` sub-bullet.

---

### Task B17: Account (profile, passkeys, sessions, notifications, Deleted items)

Ids `20.361`–`20.370`, section `## 20.37`. The guard moves by **2**. **Loud element:** **Save name** (`apps/web/src/account/profile-section.tsx:79`). The passkeys section's add action (`packages/app-core/src/account/passkeys-section.tsx:147`) is a SECOND primary on the same page, so it becomes P-QUIET (a variant change, B-D4, the same shape as B14).

**Audit** (`globals.css`):

| Rule | Today | Becomes |
|---|---|---|
| `:753` `.gn-account__section` | raised | **P-RAISED** |
| `passkeys-section.tsx:147` | `variant="primary"` | the default variant (quiet) |

**Kept:** `:4365` `.gn-deleted-items__actions .gn-button` (`min-height: 2.75rem`, the row actions' 44px floor; they are quiet buttons).

**Tests that name these selectors:** `apps/web/test/account-page.test.tsx`, `packages/app-core/test/account/deleted-items-section.test.tsx`, `passkeys-section.test.tsx` (its existing cases press the section's buttons by name; the variant is not pinned there today).

```markdown
- ❌ **20.361 — the Account page's sections are raised panels and it has ONE primary, Save name; the passkeys section's add action is quiet;** control: the Deleted items row actions keep their 44px floor. Mutation: restore `variant="primary"` in `passkeys-section.tsx`.
- ❌ **20.362 — no account or Deleted-items rule paints a flat boundary or the retired constant;** control: the scan reads more than 30 account rules. Mutation: plant `background: var(--gn-surface-sunken)` into `.gn-account__section`.
```

```ts
describe('20.361 Account follows the rules', () => {
  it('20.361 raised sections; the Deleted items row actions keep 44px', () => {
    expectRow({ sheet: 'globals', selectors: '.gn-account__section', pattern: 'P-RAISED' });
    expectRow({ sheet: 'globals', selectors: '.gn-deleted-items__actions .gn-button', declarations: { 'min-height': '2.75rem' } });
  });
});
describe('20.362 no flat boundary on Account', () => {
  it('20.362 none', () => {
    const css = cssOf('globals');
    expect(parseRules(css).filter((rule) => rule.selectors.some((s) => s.includes('.gn-account'))).length).toBeGreaterThan(30);
    expect(flatBoundaryOffenders(css, ['.gn-account', '.gn-deleted-items'], [])).toEqual([]);
  });
});
```

20.361's one-primary arm is a DOM test. Add it to `packages/app-core/test/account/passkeys-section.test.tsx`, which already renders the section (`:16`):

```tsx
describe('20.361 the passkeys add action is quiet — Account has one primary', () => {
  it('20.361 Add a passkey is a ghost Button, not a primary', () => {
    render(<PasskeysSection passkeys={[]} onAdd={vi.fn()} onRemove={vi.fn()} />);
    const add = screen.getByRole('button', { name: 'Add a passkey' });
    expect(add).toHaveClass('gn-button--ghost');
    // CONTROL — still a Button, still named for its action.
    expect(add).toHaveClass('gn-button');
    expect(add).not.toHaveClass('gn-button--primary');
  });
});
```

`Features.md` bullet: `- ✅ **Account follows the rules** (styling refresh Plan B Task B17) — raised sections; Save name is the one loud element and the passkeys add action is quiet. Cases 20.361–20.362.`

---

### Task B18: Inbox

Ids `20.371`–`20.380`, section `## 20.38`. The guard moves by **2**. **Loud element:** the page title. The inbox has no primary action, and its rows are doors.

**Audit** (`ui.css`):

| Rule | Today | Becomes |
|---|---|---|
| `:4721` `.gn-inbox__row` | 8px padding, no minimum height | add `min-height: 2.75rem;` (each row is a door: rule 01's 44) |
| `:4787` `.gn-inbox__more` | transparent, radius 4px, no edge | **P-QUIET** |

**Kept:** `:4780` `.gn-inbox__dot` and `:4798` `.gn-inbox__badge`, the unread signal in `accent`. It is the one place the accent marks state rather than the action. Recorded for the owner, not changed.

**Tests that name these selectors:** `packages/app-core/test/inbox/inbox-css-binding.test.tsx`, `inbox-view.test.tsx`, `preferences/saved-filters-css-binding.test.tsx`.

```markdown
- ❌ **20.371 — every inbox row is a 44px door and "Load more" is a quiet outlined control;** control: the unread dot keeps the accent. Mutation: remove `min-height` from `.gn-inbox__row`.
- ❌ **20.372 — no inbox rule paints a flat boundary or the retired constant;** control: the scan reads more than 10 inbox rules. Mutation: plant `background: var(--gn-surface-sunken)` into `.gn-inbox__row`.
```

```ts
describe('20.371 Inbox follows the rules', () => {
  it('20.371 44px rows; quiet more', () => {
    expectRow({ sheet: 'ui', selectors: '.gn-inbox__row', declarations: { 'min-height': '2.75rem' } });
    expectRow({ sheet: 'ui', selectors: '.gn-inbox__more', pattern: 'P-QUIET' });
    expectRow({ sheet: 'ui', selectors: '.gn-inbox__dot', declarations: { background: 'var(--gn-accent)' } });
  });
});
describe('20.372 no flat boundary in the Inbox', () => {
  it('20.372 none', () => {
    const css = cssOf('ui');
    expect(parseRules(css).filter((rule) => rule.selectors.some((s) => s.includes('.gn-inbox'))).length).toBeGreaterThan(10);
    expect(flatBoundaryOffenders(css, ['.gn-inbox'], [])).toEqual([]);
  });
});
```

`Features.md` bullet: `- ✅ **Inbox follows the rules** (styling refresh Plan B Task B18) — every row is a 44px door and Load more is quiet; the unread dot keeps the accent (recorded as the one state use of it). Cases 20.371–20.372.`

---

### Task B19: The auth surfaces — sign-in, invite accept, MCP authorize, MCP tokens

Ids `20.381`–`20.390`, section `## 20.39`. The guard moves by **2**. **Loud elements:**
- sign-in: exactly one primary per step (`sign-in/page.tsx:420` **Send magic link**, `:335` **Send code**, `:357` **Verify and sign in**). Verify in 20.592 that no two render at once.
- invite: **Join {workspace}** (`invite/[token]/page.tsx:191`). **Try again** (`:137`) renders only in the error state, where Join does not.
- MCP authorize: its approve control;
- MCP tokens: the page title.

**Audit** (`globals.css`):

| Rule | Today | Becomes |
|---|---|---|
| `:2905` `.gn-mcp-authorize__consent` | `surface-sunken` + `accent` left edge, radius 0.4rem | `background: var(--gn-surface-well); border-radius: var(--gn-radius-card);`. Keep the edge |
| `:2991` `.gn-mcp-authorize__refusal` | `surface-sunken` + `danger` left edge | `background: var(--gn-surface-well); border-radius: var(--gn-radius-card);`. Keep the edge |
| `:3028` `.gn-mcp-tokens__row` | `surface-sunken`, radius 0.4rem (one token per row) | **P-ROW** |
| `:3081` `.gn-mcp-tokens__refusal` | `surface-sunken` | **P-WELL** |

**Kept:**
- `:2930` `.gn-mcp-authorize__input`, a field with its `border-strong` edge;
- `:2437` `[data-style="neo"] .gn-sign-in__mark`, neo's raised brand tile (B-D3; neo's `lift` equals its `raised`, so nothing would change).

**Tests that name these selectors:** `apps/web/test/mcp-authorize.test.tsx`, `mcp-tokens-page.test.tsx`, `sign-in-neo-restyle.test.ts`, `sign-in.test.tsx`, `invite-page.test.tsx`.

```markdown
- ❌ **20.381 — the MCP consent and refusal notices are recessed wells keeping their tone edges, each MCP token is a raised row, and its refusal a well;** control: the authorize input keeps its `border-strong` edge. Mutation: restore `background: var(--gn-surface-sunken)` on `.gn-mcp-tokens__row`.
- ❌ **20.382 — no sign-in, invite or MCP rule paints a flat boundary or the retired constant;** control: neo's sign-in mark is still declared. Mutation: plant `background: var(--gn-surface-sunken)` into `.gn-mcp-authorize__consent`.
```

```ts
const ROWS: RosterRow[] = [
  {
    sheet: 'globals',
    selectors: '.gn-mcp-authorize__consent',
    declarations: { background: 'var(--gn-surface-well)', 'border-radius': 'var(--gn-radius-card)', 'border-left': '3px solid var(--gn-accent)' },
  },
  {
    sheet: 'globals',
    selectors: '.gn-mcp-authorize__refusal',
    declarations: { background: 'var(--gn-surface-well)', 'border-radius': 'var(--gn-radius-card)', 'border-left': '3px solid var(--gn-danger)' },
  },
  { sheet: 'globals', selectors: '.gn-mcp-tokens__row', pattern: 'P-ROW' },
  { sheet: 'globals', selectors: '.gn-mcp-tokens__refusal', pattern: 'P-WELL' },
];
describe('20.381 the auth surfaces follow the rules', () => {
  it('20.381 every row; the authorize input keeps its edge', () => {
    for (const row of ROWS) expectRow(row);
    expectRow({ sheet: 'globals', selectors: '.gn-mcp-authorize__input', declarations: { border: '1px solid var(--gn-border-strong)' } });
  });
});
describe('20.382 no flat boundary on the auth surfaces', () => {
  it('20.382 none; the neo mark kept', () => {
    const kept = ['[data-style="neo"] .gn-sign-in__mark'];
    expect(flatBoundaryOffenders(cssOf('globals'), ['.gn-sign-in', '.gn-invite', '.gn-mcp-authorize', '.gn-mcp-tokens'], kept)).toEqual([]);
    expect(stillDeclared(kept[0] ?? '')).toBe(true);
  });
});
```

`Features.md` bullet: `- ✅ **Sign-in, invite and MCP screens follow the rules** (styling refresh Plan B Task B19) — one primary per step; MCP notices are recessed wells with their tone edges and each token a raised row. Cases 20.381–20.382.`

---

### Task B20: Help, the legal pages and not-found

Ids `20.391`–`20.400`, section `## 20.40`. The guard moves by **2**. **Loud element:** the page title on each. These are reading screens. Not-found's recovery links are quiet, and none of them is primary.

**Audit:**

| Rule | Today | Becomes |
|---|---|---|
| `ui.css:5234` `.gn-help__results` | `surface-sunken` + sunken shadow | `background: var(--gn-surface-track); box-shadow: var(--gn-shadow-track);` (a recessed results tray on the page) |
| `ui.css:5272` `.gn-help__none` | the same | the same |
| `ui.css:5693` `.gn-help__quote` | the same | `background: var(--gn-surface-well); box-shadow: var(--gn-shadow-track);` |
| `ui.css:5709` `.gn-help__code` | `surface-sunken` inline code | `background: var(--gn-surface-well);` |
| `ui.css:5754` `.gn-help__table th` | `surface-sunken` | `background: var(--gn-surface-well);` |
| `ui.css:5483` `.gn-help__group-toggle:hover`, `:5580` `.gn-help__nav-link:hover` | `surface-sunken` | **P-HOVER** |
| `globals.css:2834` `.gn-legal__flag` | `surface-sunken` + `warning` edge | `background: var(--gn-surface-well); border-radius: var(--gn-radius-card);`. Keep the edge |
| `globals.css:2852` `.gn-legal__draft` | `surface-sunken` | **P-WELL** |
| `globals.css:2697` `.gn-notfound__why` | `surface-sunken` | **P-WELL** |
| `globals.css:2731` `.gn-notfound__link` | raised ground, `border-strong` edge, `text-accent`, radius 0.4rem | **P-QUIET** (remove its `background: var(--gn-surface-raised)`) |
| `globals.css:2744` `.gn-notfound__link:hover` | `surface-sunken` + accent edge | **P-HOVER**. Remove `border-color` |
| `globals.css:2660` `.gn-notfound__tile` | raised | `box-shadow: var(--gn-shadow-lift);` |

**Kept:**
- `ui.css:5202` `[data-style="neo"] .gn-help__search-input` (B-D3);
- `ui.css:5192` `.gn-help__search-input`, a field with its edge;
- `:5257` `.gn-help__result-title` and `:5736` `.gn-help__pager-link`, at the 24px in-list floor (`DENSE_IN_LIST`);
- `:5463` `.gn-help__group-toggle`, at 36px, which `tap-targets.ts` names;
- `globals.css:2887` `.gn-notfound__link`'s reduced-motion arm.

**Tests that name these selectors:** `packages/app-core/test/help/help-browser.test.tsx`, `apps/web/test/not-found-and-legal.test.tsx`, `sign-in-neo-restyle.test.ts` (the not-found link), `tap-target-density.test.ts`, `apps/web/e2e-viewport/responsive.spec.ts`, `tap-targets.ts`, `type-scale.ts`, and `packages/ui/test/tokens.test.ts` (15.29: the mono stack on `.gn-help__code`, unchanged).

```markdown
- ❌ **20.391 — Help's results and empty tray are recessed tracks, its quotes, inline code and table headers recessed wells, its hovers a soft fill; the legal flag and draft notes and not-found's explanation are wells; not-found's recovery links are quiet outlined controls and its tile rests on `lift`;** control: the help search field keeps its edge and neo override. Mutation: restore `color: var(--gn-text-accent)` on `.gn-notfound__link`.
- ❌ **20.392 — no help, legal or not-found rule paints a flat boundary or the retired constant;** control: the scan reads more than 60 help rules. Mutation: restore `background: var(--gn-surface-sunken)` on `.gn-help__table th`.
```

```ts
const ROWS: RosterRow[] = [
  { sheet: 'ui', selectors: '.gn-help__results', declarations: { background: 'var(--gn-surface-track)', 'box-shadow': 'var(--gn-shadow-track)' } },
  { sheet: 'ui', selectors: '.gn-help__none', declarations: { background: 'var(--gn-surface-track)', 'box-shadow': 'var(--gn-shadow-track)' } },
  { sheet: 'ui', selectors: '.gn-help__quote', declarations: { background: 'var(--gn-surface-well)', 'box-shadow': 'var(--gn-shadow-track)' } },
  { sheet: 'ui', selectors: '.gn-help__code', declarations: { background: 'var(--gn-surface-well)' } },
  { sheet: 'ui', selectors: '.gn-help__table th', declarations: { background: 'var(--gn-surface-well)' } },
  { sheet: 'ui', selectors: '.gn-help__group-toggle:hover', pattern: 'P-HOVER' },
  { sheet: 'ui', selectors: '.gn-help__nav-link:hover', pattern: 'P-HOVER' },
  {
    sheet: 'globals',
    selectors: '.gn-legal__flag',
    declarations: { background: 'var(--gn-surface-well)', 'border-radius': 'var(--gn-radius-card)', 'border-left': '3px solid var(--gn-warning)' },
  },
  { sheet: 'globals', selectors: '.gn-legal__draft', pattern: 'P-WELL' },
  { sheet: 'globals', selectors: '.gn-notfound__why', pattern: 'P-WELL' },
  { sheet: 'globals', selectors: '.gn-notfound__link', pattern: 'P-QUIET' },
  { sheet: 'globals', selectors: '.gn-notfound__link:hover', pattern: 'P-HOVER' },
  { sheet: 'globals', selectors: '.gn-notfound__tile', declarations: { 'box-shadow': 'var(--gn-shadow-lift)' } },
];
const KEPT = ['[data-style="neo"] .gn-help__search-input'];

describe('20.391 help, legal and not-found follow the rules', () => {
  it('20.391 every row; the search field keeps its edge', () => {
    for (const row of ROWS) expectRow(row);
    expectRow({ sheet: 'ui', selectors: '.gn-help__search-input', declarations: { border: '1px solid var(--gn-border)' } });
    expect(stillDeclared(KEPT[0] ?? '')).toBe(true);
  });
});
describe('20.392 no flat boundary on the reading screens', () => {
  it('20.392 none', () => {
    const ui = cssOf('ui');
    expect(parseRules(ui).filter((rule) => rule.selectors.some((s) => s.includes('.gn-help'))).length).toBeGreaterThan(60);
    expect(flatBoundaryOffenders(ui, ['.gn-help'], KEPT)).toEqual([]);
    expect(flatBoundaryOffenders(cssOf('globals'), ['.gn-legal', '.gn-notfound'], [])).toEqual([]);
  });
});
```

`Features.md` bullet: `- ✅ **Help, legal and not-found follow the rules** (styling refresh Plan B Task B20) — recessed trays and wells instead of the flat sunken fill, soft-fill hovers, quiet outlined recovery links; each page's title is its loud element. Cases 20.391–20.392.` `apps/desktop` receives the Help half through `ui.css`.

---

### Task B21: Browser check B (🧪) — every Plan B screen on the dev stack

Ids `20.591`–`20.600`, section `## 20.59 Browser — Plan B`. The guard moves by **6**. No code. The **controller or planner** runs these on the dev stack built from the release branch after Plan B merges, flips them, and attaches the evidence: a screenshot per step, the runner's name, and the stack's commit. The lane writes them and does not run them.

```markdown
- 🧪 **20.591 — every one of the 36 surfaces in the Inventory renders under hig, neo and minimal in light and dark with no flat sunken boundary left, raised items with a lit top edge (hig), recessed tracks and wells, and no horizontal overflow at 390px and 1280px;** control: the board (Plan A 20.096) is the reference. Evidence: one screenshot per surface per style×theme (a contact sheet is fine).
- 🧪 **20.592 — ONE loud element per screen: on each route count the visible `.gn-button--primary` elements (`document.querySelectorAll('.gn-button--primary')` filtered by `offsetParent !== null`); every screen reads 1, or 0 where the Inventory names the page title as its loud element;** control: /workspaces with two pending invitations reads 1 (B14). Evidence: a table, route → count.
- 🧪 **20.593 — dialogs opened from door cards stay centred: hover a workspace card and open its overflow menu → Delete…; the dialog's panel centre is within 2px of the viewport centre and the card's computed `transform` and `filter` are `none` while it is open; the same for a project card; and each of the five app-core dialog primaries (bulk close, new ticket, reopen, transition, visibility) is 48px tall and inside its action row;** control: closing the dialog and hovering again deepens the card's box-shadow while its `transform` stays `none` (shadow only, amended 2026-09-29).
- 🧪 **20.594 — every interactive control on every route is at least 44×44, except the rules this plan KEPT at the 24px in-list floor (listed per task);** Steps: on each route run `[...document.querySelectorAll('button, a[href], [role="tab"], input, select, textarea')].filter((el) => el.offsetParent !== null).map((el) => [el.className, el.getBoundingClientRect().height]).filter(([, h]) => h < 44)` and compare the result with the kept lists. Evidence: the per-route output.
- 🧪 **20.595 — reduced motion (DevTools → Rendering → `prefers-reduced-motion: reduce`): hovering any primary button computes `transform: none`; door cards (workspace, project, section card) and the board's cards compute `transform: none` with or without emulation, because they never scale (shadow only, amended 2026-09-29);** control: turning emulation off restores the primary button's scale, while the door cards' `transform` stays `none`.
- 🧪 **20.596 — the desktop shell (`apps/desktop`, `pnpm --filter desktop dev`) shows the refreshed shared layer: Help (app-core `HelpBrowser`) has recessed result trays and wells, and any Button it renders follows Plan A; nothing from `globals.css` is expected there (B-D1 records mobile);** control: the web Help page matches it. Evidence: two screenshots.
```

- [ ] **Step 1: Write the cases.** +6.
- [ ] **Step 2: Commit** `Styling B/B21: browser cases 20.591-20.596 (🧪, run by the controller)`.

---

## Wrap-up (after the last Plan B task)

- [ ] **Whole-repo run, in order, on Node 22,** with every summary line and `NODE=`: build; typecheck; `packages/ui`, `packages/app-core`, `apps/web` and `apps/desktop` suites; `pnpm check:citations`, `pnpm check:help`, `node scripts/check-case-ids.mjs`.
- [ ] **Orphan check** exactly as Plan A.
- [ ] **Re-read the catalogue.** Read §17's Plan B bullets and every sub-bullet against the code.
  - The id count moves by **49**:

    | Task | Cases |
    |---|---|
    | B1 | 3 |
    | B2, B3, B4, B5 | 2 each |
    | B6 | 3 |
    | B7–B12 | 2 each |
    | B13 | 3 |
    | B14–B20 | 2 each |
    | B21 | 6 |

  - Each task's unused ids stay reserved to it.
- [ ] **The amended cases, listed in the PR body with their new sentences.** The ones measured here:
  - 10.80, 16.83, 13.1146 and 13.894 (B16);
  - 13.1144 (B9);
  - 13.1147 (B7, B8);
  - the neo select-panel case (B3);
  - 13.901 (B3);
  - the members header pin (B12);
  - the Round-21 brightness pin (B13);
  - plus every other CSS pin a task's suite run turned red.
- [ ] **PR body** (`bash scripts/ctl/ctl pr open <branch> --repo <worktree> --base release/<date> --title "Styling refresh Plan B: every screen" --body FILE`): the deviations B-D1–B-D6 in one line each, the two variant changes (B14 Accept, B17 passkeys add), each mutation's red summary line, the 🧪 cases for the controller, and which local run each summary line comes from.
