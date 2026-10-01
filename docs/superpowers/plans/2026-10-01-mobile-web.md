# The web app on phones — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **This is UI work: every lane also invokes `ui-ux-pro-max`** (workspace rule) and follows the styling refresh's rules (one loud element, 8pt spacing, three text tiers + one accent, ≥44px targets, light-from-above depth).

**Goal:** Every screen of the web app works and looks intentional at phone width (≤40rem), with a slim top bar, a customizable bottom bar, a one-column board with a Move sheet, a full-screen ticket sheet and bottom-sheet dialogs — plus a "Move to…" menu on desktop cards.

**Architecture:** A phone layer on top of the shipped desktop/tablet shell, switched by the EXISTING 40rem phone breakpoint (CSS-first, no second component tree): `AppNav` gains a phone top-bar switcher and a `BottomBar` (per-device, per-user store copied from `workflow-collapse.ts`); the board's rail becomes a scroll-snap one-column view with a phone-only picker; card moves reuse the SAME `TransitionDialog` picker the arrows already open; the shared `Dialog`/`Sheet` get phone arms in `ui.css`; each remaining screen gets its phone rules in one task per screen group, policed by a route inventory guard.

**Tech Stack:** Next.js 15 (app router), React, TypeScript, vitest + Testing Library (jsdom), the house CSS (`packages/ui/src/ui.css`, `apps/web/app/globals.css`) and its CSS-rule test helpers, chrome-devtools MCP for browser 🧪.

**Spec:** `docs/superpowers/specs/2026-10-01-mobile-web-design.md` (owner-approved 2026-10-01; decisions P1–P8). The plan wins where the FD corrections below differ.

## Global Constraints

- **Branch:** every task branch is cut from `origin/release/mobile`; PR `--base release/mobile`. Never `release/2026-10-01`, never `main`. (`release/mobile` is a second live release branch by the owner's word.)
- **Phone breakpoint:** `@media (max-width: 40rem)` (640px) — the existing phone arm (FD1). Tablet stays the existing `60rem`/`70rem` arms. Desktop above is unchanged.
- **Widths (P8):** Android 360, 412 (Galaxy Z Flip 7); iPhone 375, 390, 393, 402, 420, 430, 440; iPhone Duo folded ~466 (phone layout); iPhone Duo unfolded ~890×626 (TABLET layout). Duo figures are third-party estimates — re-measure before release.
- **Targets ≥44px; no horizontal page overflow** (`document.documentElement.scrollWidth <= innerWidth`) except deliberate scrollers (board rail at tablet, calendar grid, timeline, workflow canvas, code blocks).
- **Never colour alone** for the current destination / column / gated move.
- **Storage:** the bottom bar is per device AND per user, every storage access wrapped (the `workflow-collapse.ts` shape); never the server (P4).
- **No new move rule:** every destination list comes from `transitionOptions` / `arrowTargets` / `moveOutcome` — the ones the arrows and drop use.
- **Tests:** RED first; a control in the same `it`; a named mutation per case; Features.md (new `## 18. The web app on phones`) + `test-cases/21-mobile-web.md` in the same change set; case ids cited in test names.
- **Never pipe a test run into `head`.** Build before suites; Node 22.

## Review Focus

1. **A desktop/tablet regression.** Every phone rule lives inside the 40rem arm; the existing desktop and tablet nav tests (`apps/web/test/app-nav.test.tsx`, `nav-one-line.test.ts`, `nav-phone-disclosure.test.ts`) must stay green unmodified except where a case is deliberately amended and says so. Task 2 owns a "no top-level rule changed" control.
2. **A remembered workspace that no longer resolves.** The bar must not offer workspace-scoped slots when the remembered workspace's name never resolves (the nav's own rule, `app-nav.tsx` Round 25). Task 3, case 21.027.
3. **The on-screen keyboard.** Typing in a ticket comment or a form at 390px must never have the bottom bar covering the field. Task 3, case 21.031 (visualViewport) + Task 13 🧪.
4. **A card with no legal move / a branching workflow on a phone.** The Move sheet must list both branches of a two-way state and be disabled with the reason when there is none. Task 4, cases 21.046–21.048.
5. **The iPhone Duo unfolded (~890px) hitting a phone rule by accident** — the phone arm is width-based at 40rem, so 890 must get the tablet layout. Task 13, case 21.231.

---

## Corrections to the spec (FD — read on `origin/release/mobile` = `afe0507e`)

- **FD1 — The phone breakpoint is the existing 40rem (640px), not 600px.** The shell's phone rules already live at `@media (max-width: 40rem)` (`apps/web/app/globals.css:2193-2201`, the wordmark hide; `:272`, `:1208`, `:3001`, `:4887`). A second, 600px breakpoint would split the phone layer in two. 40rem still covers every P8 phone (largest: iPhone Duo folded ~466).
- **FD2 — The broken sentence is the nav's scope note**, `app-nav.tsx:460-464` (`showScopeNote && user !== null` → `.gn-nav__scope`, `globals.css:2461`). At ≤40rem it is hidden and the switcher (Task 2) carries "Choose a workspace ▾". Above 40rem it is unchanged (case 13.391 keeps its subject).
- **FD3 — The bars live inside `AppNav`.** `AppNav` renders on every signed-in app page (25 of 26 routes import it or render it via `apps/web/src/notes/notes-page.tsx:204`); it does NOT render on `/sign-in`, `/invite/[token]`, `/privacy`, `/terms`, `/mcp/connect`, `/mcp/authorize`, `/` — single-purpose or signed-out pages that correctly get no bottom bar.
- **FD4 — Project views are not URLs.** The tab is remembered per project in `localStorage` (`gn-project-tabs`, `apps/web/src/use-last-project.ts:80-106`, `rememberProjectTab` `:296`). A bar slot for Board/List/Calendar/Timeline/Backlog therefore = `rememberProjectTab(lastProjectId, tab, userId)` then navigate to `/w/<ws>/p/<lastProjectId>`; with no remembered project it navigates to the workspace home (its project grid).
- **FD5 — Workspace-scoped slots follow the nav's rule** "the bar does not offer a link that cannot resolve" (`app-nav.tsx` Rounds 22–25): Board, List, Calendar, Timeline, Backlog, My work, Members render only when a workspace is effective (routed, or remembered with its name resolved). With none, the bar shows only the chosen GLOBAL slots (Notes, Inbox) + More; empty slots are not padded.
- **FD6 — The desktop arrows already handle a branch.** When a direction has several declared targets, the arrow opens `TransitionDialog` as a PICKER (owner request 2026-09-17; `board.tsx` `MoveArrows` docblock "One target moves; several ask"; `arrowTargets` `board-arrows.ts:79-91`). The spec's P7 premise ("the arrows reach only the nearest legal column") is wrong. P7 still adds value — ONE list across BOTH directions — and is built by opening that SAME dialog with `offerStateIds` = every non-backlog target.
- **FD7 — Backlog is excluded from the board's Move list.** "Backlog is never a board column" (`board.tsx` `refusalCopy` ~2245); the sheet keeps its own "Move to Backlog".
- **FD8 — One column at a time is CSS scroll-snap over the existing rail** (`.gn-board__rail`, `.gn-board__column`), plus a phone-only `SegmentedControl` picker synced to the scroll position. Column collapse is NOT applied at ≤40rem (every column full width; the collapse toggle hidden; the collapse memory untouched).
- **FD9 — `env(safe-area-inset-*)` is 0 on iOS today.** `apps/web/app/layout.tsx` exports `metadata` (`:10`) but no `viewport`, so there is no `viewport-fit=cover`. Task 1 adds `export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', interactiveWidget: 'resizes-content' }` (Next 15 supports both: `next/dist/lib/metadata/types/extra-types.d.ts:52-53`).
- **FD10 — The ticket sheet already has a full-screen state** (`sheetFull`, `packages/app-core/src/views/ticket-sheet.tsx:717`, toggle `:3139-3174`) and `.gn-sheet--full` (`ui.css:528`). At ≤40rem CSS forces the full form and hides the toggle; a header "Move…" shortcut calls the SAME handler as the state row's `Move…` (`:3521-3537`).
- **FD11 — Dialogs become bottom sheets in CSS only**: phone arms on `.gn-dialog__scrim` / `.gn-dialog` (`ui.css:382`, `:410`). The prototype draws the bottom-sheet form (`reference/…/mobile.dc.html:1208`, frozen — cited, not edited).
- **FD12 — Browser widths use chrome-devtools `emulate`** (viewport W×H, DPR 3, mobile + touch); `resize_page` bottoms out near 500px (memory `browser-measurement`).
- **FD13 — No touch drag-and-drop.** At ≤40rem the ‹ › arrows are hidden and the Move button shown; `draggable` stays (desktop unaffected).

**No owner decision is needed.** FD6 is information for the owner: their branching concern is already met on desktop by the picker; P7 still ships as one cross-direction list.

## File Structure

| Path | Responsibility |
|---|---|
| `packages/ui/test/helpers/style-patterns.ts` | + `PHONE_OWNERS` (route → task) beside `SCREEN_OWNERS` |
| `packages/ui/test/phone-inventory.test.ts` (new) | the route inventory guard for the phone pass |
| `apps/web/app/layout.tsx` | + `viewport` export (FD9) |
| `apps/web/src/app-nav.tsx` | phone top-bar switcher; renders `<BottomBar>`; scope note hidden ≤40rem |
| `apps/web/src/phone-switcher.tsx` (new) | the workspace/project switcher button + its sheet |
| `apps/web/src/bottom-bar.tsx` (new) | the bar, More sheet, Edit bottom bar sheet |
| `packages/app-core/src/preferences/bottom-bar.ts` (new) | per-device per-user store (the `workflow-collapse.ts` shape) |
| `apps/web/src/use-keyboard-open.ts` (new) | `visualViewport`-based keyboard flag |
| `packages/app-core/src/views/board.tsx` | phone column picker; Move button / Move-to menu in `MoveArrows` |
| `packages/app-core/src/views/board-phone-picker.tsx` (new) | the picker synced to the rail's scroll |
| `packages/app-core/src/views/ticket-sheet.tsx` | phone header Move… shortcut |
| `packages/ui/src/ui.css` | phone arms: dialogs, sheet, board rail/columns, bottom bar tokens |
| `apps/web/app/globals.css` | phone arms per screen |
| `Features.md` (§18), `test-cases/21-mobile-web.md` (new) | catalogue |

**Case blocks:** `test-cases/21-mobile-web.md` is a new file; ids allocated by task: T1 21.001–21.009 · T2 21.010–21.019 · T3 21.020–21.039 · T4 21.040–21.059 · T5 21.060–21.069 · T6 21.070–21.089 · T7 21.090–21.109 · T8 21.110–21.129 · T9 21.130–21.149 · T10 21.150–21.169 · T11 21.170–21.189 · T12 21.190–21.209 · T13 21.210–21.249. Unused ids in a block stay free for that task's follow-ups.

---

### Task 1: The phone foundation — inventory guard, viewport, phone tokens

**Files:** Modify `packages/ui/test/helpers/style-patterns.ts`; Create `packages/ui/test/phone-inventory.test.ts`; Modify `apps/web/app/layout.tsx`; Modify `packages/ui/src/ui.css` (tokens); Create `test-cases/21-mobile-web.md`; Modify `Features.md`, `scripts/fixtures/check-case-citations-baseline.json` if a new file needs a ceiling entry.

**Interfaces:** Produces `PHONE_OWNERS: Record<string, string>` (every `page.tsx` → `T7`…`T12`, the project page → `T4, T6, T8`); CSS custom properties `--gn-phone-bar-height: 3.5rem` and `--gn-phone-top-height: 3.25rem` emitted in `ui.css` `:root`.

Cases (`## 21.1 Foundation`):
```markdown
- ❌ **21.001 — every one of the 26 routes has a phone owner and none is stale;** control: a planted route and a planted owner are both reported. Mutation: delete the `/notes/page.tsx` row.
- ❌ **21.002 — the root layout exports a viewport with `viewportFit: 'cover'` and `interactiveWidget: 'resizes-content'`;** control: `width: 'device-width'` and `initialScale: 1` are kept. Mutation: drop `viewportFit`.
- ❌ **21.003 — `--gn-phone-bar-height` (3.5rem) and `--gn-phone-top-height` (3.25rem) are declared once under `:root`;** control: no phone rule hard-codes `3.5rem` for the bar. Mutation: change the token to 3rem.
```

- [ ] **Step 1: Failing tests.** `packages/ui/test/phone-inventory.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { PHONE_OWNERS, listPageRoutes, unownedRoutes } from './helpers/style-patterns.js';
import { parseRules, readUiCss, ruleExactly, valueOf } from './helpers/css-rules.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('21.001 every route has a phone owner', () => {
  it('21.001 26 routes, all owned, none stale', () => {
    const routes = listPageRoutes();
    expect(routes).toHaveLength(26);
    expect(unownedRoutes(routes, PHONE_OWNERS)).toEqual({ unowned: [], stale: [] });
    const planted = unownedRoutes([...routes, 'apps/web/app/zz/page.tsx'], { ...PHONE_OWNERS, 'apps/web/app/gone/page.tsx': 'T0' });
    expect(planted).toEqual({ unowned: ['apps/web/app/zz/page.tsx'], stale: ['apps/web/app/gone/page.tsx'] });
  });
});

describe('21.002 the viewport opts into the safe area', () => {
  it('21.002 viewportFit cover + interactiveWidget resizes-content', () => {
    const layout = readFileSync(join(__dirname, '../../../apps/web/app/layout.tsx'), 'utf8');
    expect(layout).toMatch(/export const viewport\b/);
    expect(layout).toMatch(/viewportFit:\s*'cover'/);
    expect(layout).toMatch(/interactiveWidget:\s*'resizes-content'/);
    expect(layout).toMatch(/width:\s*'device-width'/); // control
    expect(layout).toMatch(/initialScale:\s*1/);
  });
});

describe('21.003 phone tokens', () => {
  it('21.003 bar and top heights declared once', () => {
    const css = readUiCss();
    const root = ruleExactly(css, ':root');
    expect(valueOf(root, '--gn-phone-bar-height')).toBe('3.5rem');
    expect(valueOf(root, '--gn-phone-top-height')).toBe('3.25rem');
    // CONTROL — no phone rule hard-codes the bar height.
    const phone = parseRules(css).filter((r) => r.atRule === '@media (max-width: 40rem)');
    for (const rule of phone) expect(rule.body).not.toMatch(/height:\s*3\.5rem/);
  });
});
```
(If `ui.css` has no single `:root` rule, add the two tokens to the existing bare `:root` block Task 2 of the styling refresh created for `--gn-space-*`; the test then reads that exact block — say which in the PR.)
- [ ] **Step 2: Run to see RED** — `pnpm --filter @gisik-nokma/ui exec vitest run --no-file-parallelism test/phone-inventory.test.ts > /tmp/m1.log 2>&1; tail -25 /tmp/m1.log`. Expected: three FAIL (`PHONE_OWNERS` undefined).
- [ ] **Step 3: Implement.** Add `PHONE_OWNERS` (all 26 routes — the inventory table below), the `viewport` export, the two tokens.

| Route | Owner |
|---|---|
| `/page.tsx`, `/sign-in`, `/invite/[token]`, `/mcp/connect`, `/mcp/authorize` | T12 |
| `/workspaces`, `/w/[workspaceId]`, `/w/[workspaceId]/members`, `/inbox` | T7 |
| `/w/[workspaceId]/p/[projectId]` | T4, T6, T8 |
| `/notes`, `/notes/[noteId]`, `/w/[workspaceId]/my-work` | T9 |
| `/account`, `/settings`, `/mcp/tokens`, `/help`, `/privacy`, `/terms` | T10 |
| `/w/[workspaceId]/settings/workflows`, `…/new`, `…/[workflowId]`, `…/[workflowId]/history`, `/w/[workspaceId]/settings/ticket-types`, `…/new`, `…/[typeId]` | T11 |

- [ ] **Step 4: GREEN**, then the whole `packages/ui` and `apps/web` suites.
- [ ] **Step 5: Catalogue** — create `test-cases/21-mobile-web.md` (header + §21.1 with 21.001–21.003 ✅), Features §18 opening bullet ("⚙️ **Phone foundation** — 40rem phone arm, viewport-fit cover, phone tokens, route inventory; Plan Task 1"). Commit `Mobile T1: phone foundation — inventory guard, viewport-fit cover, phone tokens (21.001-21.003)`.

---

### Task 2: The phone top bar — the switcher replaces the scope note

**Files:** Create `apps/web/src/phone-switcher.tsx`; Modify `apps/web/src/app-nav.tsx` (render it; add `gn-nav__scope--wide`); Modify `apps/web/app/globals.css` (40rem arm: hide `.gn-nav__links`, `.gn-nav__scope`; show `.gn-phone-switcher`; one-line page titles); Test `apps/web/test/phone-top-bar.test.tsx`.

**Interfaces:** Consumes `useLastWorkspace`, `useWorkspaceName`, `useLastProject`, `useWorkspaceProjects` (existing). Produces `<PhoneSwitcher workspaceId projectId userId />` → a `<button class="gn-phone-switcher" aria-haspopup="dialog">` labelled "<Project> — <Workspace>" or "Choose a workspace"; opening it shows a `Sheet` listing workspaces and that workspace's projects.

Cases (`## 21.2 Phone top bar`):
```markdown
- ❌ **21.010 — with no workspace chosen the switcher reads "Choose a workspace" and opens a sheet listing the person's workspaces;** control: the desktop scope-note sentence still renders in the DOM (case 13.391's subject). Mutation: render the scope note's text in the switcher.
- ❌ **21.011 — with a routed workspace and project, the switcher reads "<project> — <workspace>" and its sheet lists that workspace's projects with the current one marked (`aria-current`);** control: an archived project is not listed. Mutation: list archived projects.
- ❌ **21.012 — at ≤40rem `.gn-nav__links` and `.gn-nav__scope` are `display: none` and `.gn-phone-switcher` is shown; above 40rem `.gn-phone-switcher` is `display: none`;** control: no TOP-LEVEL `.gn-nav*` rule changed (the desktop/tablet bar is byte-identical outside the 40rem arm). Mutation: move the `.gn-nav__scope` hide out of the media arm.
- ❌ **21.013 — at ≤40rem `.gn-page-title` is one line (`white-space: nowrap; overflow: hidden; text-overflow: ellipsis`) at the h2 size, and keeps its full text for assistive tech (`title` attribute not required — the element's text is whole);** control: above 40rem the title rule is unchanged. Mutation: drop `text-overflow`.
- 🧪 **21.014 — `/workspaces` at 412px (the owner's Flip 7 screenshot): the top bar is one row ≤ `--gn-phone-top-height`, no wrapped sentence, the title one line, the "New workspace" form visible without scrolling on an 860px-tall viewport.**
```

- [ ] **Step 1: Failing test** `apps/web/test/phone-top-bar.test.tsx` (render `AppNav` under the existing test providers as `app-nav.test.tsx` does; seed `localStorage` for the remembered workspace; mock `getMyWorkspaces`). Key assertions:
```tsx
it('21.010 Choose a workspace + sheet lists workspaces; scope note still in DOM', async () => {
  renderNav({ route: '/workspaces', workspaces: [{ workspaceId: 'w1', name: 'Convenience Corner' }] });
  const button = await screen.findByRole('button', { name: 'Choose a workspace' });
  await user.click(button);
  expect(await screen.findByRole('link', { name: 'Convenience Corner' })).toBeTruthy();
  // CONTROL — 13.391's subject still renders for desktop.
  expect(screen.getByText(/No workspace selected — pick one/)).toBeTruthy();
});
it('21.011 project — workspace label, current marked, archived hidden', async () => {
  renderNav({ route: '/w/w1/p/p1', projects: [{ id: 'p1', name: 'Shop operations' }, { id: 'p2', name: 'Old', archived: true }] });
  expect(await screen.findByRole('button', { name: 'Shop operations — Convenience Corner' })).toBeTruthy();
  await user.click(screen.getByRole('button', { name: 'Shop operations — Convenience Corner' }));
  expect(screen.getByRole('link', { name: 'Shop operations' }).getAttribute('aria-current')).toBe('page');
  expect(screen.queryByRole('link', { name: 'Old' })).toBeNull();
});
```
and the CSS cases with `readGlobalsCss()` + `ruleExactly(css, '.gn-nav__scope', '@media (max-width: 40rem)')` etc.; the 21.012 control snapshots every top-level `.gn-nav*` rule body from `origin/release/mobile`'s `globals.css` into a fixture string committed with the test and compares.
- [ ] **Step 2: RED.** **Step 3: Implement** — the switcher (a `Button` variant `ghost`, label as above, chevron icon, ≥44px), its `Sheet` (workspaces list → that workspace's non-archived projects), the 40rem arm. **Step 4: GREEN** + `apps/web` suite (all existing nav tests unchanged). **Step 5: Catalogue** (§21.2, Features bullet ✅ "Phone top bar"). Commit.

---

### Task 3: The customizable bottom bar, More, and Edit bottom bar

**Files:** Create `packages/app-core/src/preferences/bottom-bar.ts`; Create `apps/web/src/bottom-bar.tsx`, `apps/web/src/use-keyboard-open.ts`; Modify `apps/web/src/app-nav.tsx` (render `<BottomBar>`); Modify `apps/web/app/globals.css` (bar, More sheet, Edit sheet — phone arm only); Tests `packages/app-core/test/preferences/bottom-bar.test.ts`, `apps/web/test/bottom-bar.test.tsx`.

**Interfaces:**
```ts
export type BarDestination = 'board' | 'my-work' | 'notes' | 'inbox' | 'list' | 'calendar' | 'timeline' | 'backlog' | 'members';
export const BOTTOM_BAR_KEY = 'gn-bottom-bar';
export const DEFAULT_BAR: readonly BarDestination[] = ['board', 'my-work', 'notes', 'inbox'];
export const MAX_SLOTS = 4;
export function readBottomBar(userId: string): BarDestination[];           // DEFAULT_BAR on any failure / unknown values dropped
export function rememberBottomBar(userId: string, slots: readonly BarDestination[]): void; // ≤4, deduped, wrapped
export function resetBottomBar(userId: string): void;
```
`<BottomBar workspaceId projectId userId pathname />` renders `<nav aria-label="Phone">` with the visible slots + a More button; More opens a `Sheet` listing the non-slotted destinations + Settings, Account, Help and "Edit bottom bar"; Edit opens a sheet with "In the bar" (reorder by drag handle AND by ↑/↓ buttons for keyboard/touch, "−"), "Available" ("+"), "Reset to default".

Cases (`## 21.3 Bottom bar`):
```markdown
- ❌ **21.020 — the store reads DEFAULT_BAR when nothing is saved, when storage throws, and when the saved value is malformed;** control: a valid saved value is returned as saved. Mutation: return `[]` on a throw.
- ❌ **21.021 — the store is keyed by user: a value saved for user A is not read for user B;** control: A reads its own. Mutation: drop the user key.
- ❌ **21.022 — `rememberBottomBar` keeps at most 4, drops duplicates and unknown destinations;** control: 3 valid slots save as 3. Mutation: allow 5.
- ❌ **21.023 — the bar renders the 4 slots in order + More LAST, each a ≥44px link/button with an accessible name, the current one `aria-current="page"` AND an indicator element (not colour alone);** control: More is always present even when 4 slots are full. Mutation: render More first.
- ❌ **21.024 — Board/List/Calendar/Timeline/Backlog slots call `rememberProjectTab(lastProject, tab, user)` then navigate to `/w/<ws>/p/<lastProject>` (FD4); with no remembered project they go to `/w/<ws>`;** control: My work goes to `/w/<ws>/my-work`. Mutation: navigate without writing the tab.
- ❌ **21.025 — Edit bottom bar: "−" removes, "+" adds (disabled at 4), ↑/↓ reorder, Reset restores DEFAULT_BAR; every change persists via the store;** control: More is not offered as a removable slot. Mutation: let "+" add a fifth.
- ❌ **21.026 — More lists exactly the destinations not in the bar, plus Settings, Account, Help and "Edit bottom bar";** control: a slotted destination is not repeated in More. Mutation: list all destinations.
- ❌ **21.027 — with no effective workspace (none routed; remembered but name unresolved), workspace-scoped slots are not rendered; the bar shows the chosen global slots (Notes, Inbox) + More, not padded (FD5);** control: once the name resolves, they render. Mutation: render scoped slots on a remembered id alone.
- ❌ **21.028 — CSS: at ≤40rem `.gn-bottom-bar` is `position: fixed; bottom: 0`, height `calc(var(--gn-phone-bar-height) + env(safe-area-inset-bottom))`, `padding-bottom: env(safe-area-inset-bottom)`, and `.gn-shell` gets `padding-bottom` of the same calc so no content hides behind it; above 40rem `.gn-bottom-bar` is `display: none`;** control: the desktop shell padding is unchanged. Mutation: drop the shell padding.
- ❌ **21.031 — `useKeyboardOpen` is true when `visualViewport.height < 0.75 × window.innerHeight` and the bar gets `data-keyboard="open"` → `display: none`;** control: false with no `visualViewport` (older browsers). Mutation: invert the comparison.
```

- [ ] **Step 1: Failing tests.** Store (`bottom-bar.test.ts`):
```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BOTTOM_BAR_KEY, DEFAULT_BAR, readBottomBar, rememberBottomBar, resetBottomBar } from '../../src/preferences/bottom-bar.js';
beforeEach(() => localStorage.clear());
describe('21.020 defaults on failure', () => {
  it('21.020 nothing saved, throwing storage, malformed value → DEFAULT_BAR; a valid value reads back', () => {
    expect(readBottomBar('u1')).toEqual([...DEFAULT_BAR]);
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(readBottomBar('u1')).toEqual([...DEFAULT_BAR]);
    spy.mockRestore();
    localStorage.setItem(BOTTOM_BAR_KEY, '{not json');
    expect(readBottomBar('u1')).toEqual([...DEFAULT_BAR]);
    rememberBottomBar('u1', ['calendar', 'inbox']);
    expect(readBottomBar('u1')).toEqual(['calendar', 'inbox']); // control
  });
});
describe('21.021 keyed by user', () => {
  it('21.021 A does not leak to B', () => {
    rememberBottomBar('a', ['notes']);
    expect(readBottomBar('b')).toEqual([...DEFAULT_BAR]);
    expect(readBottomBar('a')).toEqual(['notes']);
  });
});
describe('21.022 at most 4, deduped, known only', () => {
  it('21.022', () => {
    rememberBottomBar('u', ['board', 'board', 'notes', 'zz' as never, 'inbox', 'list', 'calendar']);
    expect(readBottomBar('u')).toEqual(['board', 'notes', 'inbox', 'list']);
    rememberBottomBar('u', ['board', 'notes', 'inbox']);
    expect(readBottomBar('u')).toHaveLength(3);
    resetBottomBar('u');
    expect(readBottomBar('u')).toEqual([...DEFAULT_BAR]);
  });
});
```
Component tests (`bottom-bar.test.tsx`) render `<BottomBar>` with a mocked router (`next/navigation`) and assert 21.023–21.027 and 21.031 (stub `window.visualViewport = { height: 300, addEventListener: vi.fn(), removeEventListener: vi.fn() }` with `innerHeight = 800`); the CSS case 21.028 reads `globals.css` with `ruleExactly(css, '.gn-bottom-bar', '@media (max-width: 40rem)')`.
- [ ] **Step 2: RED. Step 3: Implement** (copy the `workflow-collapse.ts` docblock's three load-bearing rules: keyed by user, every access wrapped, defaults carried out). **Step 4: GREEN** + `apps/web` + `app-core` suites. **Step 5: Catalogue** (§21.3, Features ✅ "Customizable bottom bar"). Commit.

---

### Task 4: The board on a phone — one column at a time, and the Move sheet

**Files:** Create `packages/app-core/src/views/board-phone-picker.tsx`; Modify `packages/app-core/src/views/board.tsx` (`BoardGroupSection` renders the picker; `MoveArrows` gains the Move trigger); Modify `packages/ui/src/ui.css` (40rem arm: rail scroll-snap, columns 100%, collapse not applied, arrows hidden, Move shown); Test `packages/app-core/test/views/board-phone.test.tsx`, `packages/ui/test/board-phone-css.test.ts`.

**Interfaces:** `BoardPhonePicker({ columns: {stateId, name, count}[], railRef, activeStateId, onPick })` — a `SegmentedControl` (`aria-label="Column"`) of "<name> <count>" options; `onPick(stateId)` → `section.scrollIntoView({ inline: 'start', block: 'nearest', behavior })` inside the rail (never the page); a scroll listener on the rail (rAF-throttled) sets `activeStateId` to the column whose left edge is nearest the rail's `scrollLeft`. `MoveArrows` gains a third button, `.gn-board-card__move`, label "Move" (phone) — see Task 5 for the desktop label — that opens the EXISTING `TransitionDialog` with `offerStateIds = allBoardTargets(def, fromStateId)`:
```ts
/** Every legal destination the BOARD offers from `fromStateId`: transitionOptions minus Backlog (FD7), in declaration order. */
export function allBoardTargets(def: WorkflowDef, fromStateId: string): string[];
```
(in `board-arrows.ts`, beside `arrowTargets`, reading `transitionOptions` — no second rule).

Cases (`## 21.4 Board on a phone`):
```markdown
- ❌ **21.040 — at ≤40rem `.gn-board__rail` is `scroll-snap-type: x mandatory; overflow-x: auto`, `.gn-board__column` is `flex: 0 0 100%; scroll-snap-align: start`, and the column-collapse is not applied (the collapse toggle and `.gn-board__column-strip`, `ui.css:1127`, are `display: none`; every column renders expanded);** control: above 40rem the 18rem lane (plan D13) is unchanged. Mutation: drop `scroll-snap-align`.
- ❌ **21.041 — the picker lists every column of the group, collapsed ones included, as "<name> <count>";** control: a group with one column still renders the picker (one option). Mutation: skip collapsed columns.
- ❌ **21.042 — picking a column scrolls the RAIL to it (`scrollIntoView` with `inline: 'start'`) and marks it selected; reduced motion → `behavior: 'auto'`;** control: `window.scrollY` is untouched. Mutation: scroll the window.
- ❌ **21.043 — scrolling the rail updates the selected option to the column nearest the rail's left edge;** control: a sub-pixel scroll does not change it. Mutation: never update on scroll.
- ❌ **21.044 — `allBoardTargets` returns `transitionOptions` targets minus Backlog, in declaration order;** control: a state whose only exits are Backlog returns `[]`. Mutation: include Backlog.
- ❌ **21.045 — the Move button opens `TransitionDialog` with `offerStateIds` = `allBoardTargets` (both directions);** control: the ‹ › arrows still open with their directional lists. Mutation: pass `arrowTargets('next')`.
- ❌ **21.046 — a two-way branch (`WF_ERRAND` `doing` → `waiting` | `done`) lists both in the Move sheet;** control: a single-target state lists one, preselected. Mutation: offer the nearest only.
- ❌ **21.047 — a gated destination is marked "needs a comment" (or the rule's own label) in the sheet;** control: an ungated one carries no mark. Mutation: drop the mark.
- ❌ **21.048 — with no legal destination the Move button is `disabled` and its accessible description is the board's `refusalCopy`;** control: an enabled Move has no such description. Mutation: hide the button instead of disabling it.
- ❌ **21.049 — a Move submits through the SAME optimistic path as the arrows (the card lands in the target at once — `board-move-state.ts` overlay);** control: a refusal glides it back with the refusal text. Mutation: submit without `beginPending`.
- ❌ **21.050 — CSS: at ≤40rem the ‹ › arrows are `display: none` and `.gn-board-card__move` is shown at ≥44px; above 40rem the Move button follows Task 5.** Mutation: show the arrows on phones.
```

- [ ] **Step 1: Failing tests** — `board-phone.test.tsx` renders `Board` with the `WF_ERRAND` fixture (`packages/app-core/test/helpers/`, as `cache.test.ts:6` imports it) — confirm `waiting`'s declared exits first and adjust the 21.044 control fixture if `waiting` has a non-backlog exit, mocks `Element.prototype.scrollIntoView`, and asserts 21.041–21.049; `allBoardTargets` unit test in `board-arrows.test.ts` (21.044):
```ts
it('21.044 every board target minus Backlog, declaration order', () => {
  expect(allBoardTargets(WF_ERRAND, 'doing')).toEqual(['waiting', 'done']);
  expect(allBoardTargets(WF_ERRAND, 'doing')).not.toContain('backlog');
  // CONTROL — a fixture built in this test whose `parked` state's only exit is Send to Backlog.
  const onlyBacklog = { ...WF_ERRAND, transitions: WF_ERRAND.transitions.filter((t) => t.from !== 'waiting') };
  expect(allBoardTargets(onlyBacklog, 'waiting')).toEqual([]);
});
```
CSS cases with `readUiCss()` + `ruleExactly(css, '.gn-board__column', '@media (max-width: 40rem)')`.
- [ ] **Step 2: RED. Step 3: Implement.** **Step 4: GREEN** + the whole board suite (`packages/app-core/test/views/board-*.test.tsx` unchanged). **Step 5: Catalogue** (§21.4; Features ✅ "Board on a phone"). Commit.

---

### Task 5: "Move to…" on desktop cards

**Files:** Modify `packages/app-core/src/views/board.tsx` (the Move trigger's desktop label/placement); `packages/ui/src/ui.css`; Test `packages/app-core/test/views/board-move-to.test.tsx`.

**Interfaces:** the same `.gn-board-card__move` button from Task 4, visible above 40rem as a ghost "Move to…" beside the arrows (accessible name "Move to another state" at every width; the phone text "Move" and the desktop text "Move to…" are two `aria-hidden` spans swapped by CSS).

Cases (`## 21.5 Desktop Move to…`):
```markdown
- ❌ **21.060 — above 40rem each card's footer carries a ghost "Move to…" (P-GHOST) after the ‹ › arrows, ≥44px;** control: the arrows keep their existing behaviour (directional lists, picker on several). Mutation: render it before the arrows.
- ❌ **21.061 — it opens the same dialog with `allBoardTargets` (both directions);** control: a terminal card's Close button is unaffected. Mutation: offer one direction.
- ❌ **21.062 — the button's accessible name is "Move to another state" at every width; the visible text is "Move" at ≤40rem and "Move to…" above;** control: both text spans are `aria-hidden`. Mutation: give the spans no `aria-hidden` (double announcement).
```
- [ ] Steps 1–5 as above (RED → implement → GREEN + board suite → catalogue §21.5, Features ✅ "Move to… on desktop cards" → commit). Also amend the styling refresh's footer case(s) that count a terminal card's buttons (20.052: "exactly title, who·when, the two arrows and Close") — **append** "Amended 2026-10-01 by 21.060 (mobile plan): the footer gains Move to…" and update its assertion in the same commit.

---

### Task 6: The ticket sheet full screen, and dialogs as bottom sheets

**Files:** Modify `packages/ui/src/ui.css` (40rem arms on `.gn-sheet`, `.gn-sheet__scrim`, `.gn-dialog`, `.gn-dialog__scrim`); Modify `packages/app-core/src/views/ticket-sheet.tsx` (phone header Move… shortcut); Tests `packages/ui/test/phone-overlays.test.ts`, `packages/app-core/test/views/ticket-sheet-phone.test.tsx`.

Cases (`## 21.6 Sheet and dialogs on a phone`):
```markdown
- ❌ **21.070 — at ≤40rem `.gn-sheet` is `width: 100%; border-radius: 0; box-shadow: none` (the `.gn-sheet--full` form) and the Full-screen toggle (`aria-label` "Full screen") is `display: none`;** control: above 40rem the sheet keeps `min(40rem, 94vw)` and its toggle. Mutation: keep the radius on phones.
- ❌ **21.071 — the sheet's header is `position: sticky; top: 0` at ≤40rem and carries a "Move…" shortcut that calls the SAME handler as the state row's Move… (one dialog opens);** control: the state row's Move… still works. Mutation: wire the shortcut to a second handler.
- ❌ **21.072 — at ≤40rem `.gn-dialog__scrim` aligns `flex-end`, `.gn-dialog` is `width: 100%`, rounded only on top (`var(--gn-radius-track) var(--gn-radius-track) 0 0`), `max-height: 90dvh`, `padding-bottom: max(1rem, env(safe-area-inset-bottom))`;** control: above 40rem the centred `min(34rem, 92vw)` dialog is unchanged. Mutation: keep `align-items: center`.
- ❌ **21.073 — the bottom-sheet dialog rises from the bottom (`gnRise`) and has no animation under reduced motion;** control: the desktop rise is unchanged. Mutation: drop the reduced-motion arm.
- 🧪 **21.074 — at 360px the transition dialog, the delete dialog, the reopen dialog and the remove-member dialog are fully visible with their actions within the bottom 30% of the screen.**
```
- [ ] Steps 1–5 (CSS cases via `readUiCss` + `ruleExactly(…, '@media (max-width: 40rem)')`; the shortcut via Testing Library: click header "Move…", assert one `role="dialog"` named like the state row's dialog). Commit.

---

### Task 7: Workspaces, workspace home, Members, Inbox

**Files:** `apps/web/app/globals.css` (40rem arms for `.gn-workspaces*`, `.gn-project-card*`/home sections, `.gn-members*` incl. the members table → stacked rows and the invite form, `.gn-inbox*`); Test `apps/web/test/phone-screens-a.test.ts`.

Cases (`## 21.7`):
```markdown
- ❌ **21.090 — `/workspaces`: workspace cards single column, the New workspace form full width;** control: tablet keeps two columns. Mutation: keep the grid on phones.
- ❌ **21.091 — workspace home: project cards and section cards single column; the new-project form full width;** control: the door card hover rule (B13) unchanged. Mutation: keep multi-column.
- ❌ **21.092 — Members: the table becomes stacked rows (name + email line, role select full width, Remove from workspace under it); the pending list rows wrap (P1 of 2026-09-30 kept); the invite form fields full width;** control: desktop table unchanged. Mutation: keep `display: table` on phones.
- ❌ **21.093 — Inbox: rows ≥44px, the unread dot and badge kept, "Load more" full width;** control: desktop unchanged. Mutation: shrink rows below 44px.
- 🧪 **21.094 — each of the four at every P8 phone width: no horizontal overflow, nothing clipped.**
```
- [ ] Steps 1–5 (`readGlobalsCss` + `ruleExactly`, one `it` per case with its desktop control). Commit.

---

### Task 8: The project page's other views — List, Backlog, Calendar, Timeline

**Files:** `apps/web/app/globals.css` / `packages/ui/src/ui.css` (the owning sheets per the B5–B8 rows); Test `apps/web/test/phone-project-views.test.ts`.

Cases (`## 21.8`):
```markdown
- ❌ **21.110 — the project header: the view tabs scroll horizontally inside their own track (deliberate scroller, `overflow-x: auto`, `scroll-snap`), search and Filters wrap to their own row, New ticket stays the one primary at full width;** control: desktop header unchanged. Mutation: wrap the tabs instead of scrolling.
- ❌ **21.111 — List / Backlog: the table becomes stacked rows (title line, then key · state · assignee · due as meta), the bulk-close bar full width;** control: desktop columns unchanged. Mutation: keep table layout.
- ❌ **21.112 — Calendar: the month grid is a deliberate horizontal scroller with 3rem minimum day cells; the toolbar wraps;** control: the page itself does not overflow. Mutation: shrink cells to fit (unreadable).
- ❌ **21.113 — Timeline: the weeks band scrolls horizontally inside its track; the page does not;** control: desktop unchanged. Mutation: let the page scroll.
- 🧪 **21.114 — the four views at 360 / 412 / 440: no page overflow; scrollers scroll.**
```
- [ ] Steps 1–5. Commit.

---

### Task 9: Notes, a note's page, My work

**Files:** `apps/web/app/globals.css` (`.gn-notes*` — the tree panel already toggles below 60rem; the editor toolbar wraps; `.gn-my-work*`); Test `apps/web/test/phone-screens-b.test.ts`.

Cases (`## 21.9`):
```markdown
- ❌ **21.130 — Notes at ≤40rem: the tree is the existing toggle panel (below 60rem) opened from the header; the document fills the width; the editor toolbar wraps to two rows max, every control ≥44px target;** control: the split scroll (above 60rem, #828/#830) unchanged. Mutation: re-enable the split scroll on phones.
- ❌ **21.131 — a note's page: title one line, Delete/History/Copy behind a "⋯" overflow at ≤40rem;** control: desktop shows them inline. Mutation: show them inline on phones.
- ❌ **21.132 — My work: sections single column, rows ≥44px, the attention strip wraps;** control: desktop unchanged. Mutation: keep multi-column.
- 🧪 **21.133 — typing a note at 390 with the keyboard up: the bottom bar is hidden (21.031) and the caret line stays visible.**
```
- [ ] Steps 1–5. Commit.

---

### Task 10: Account, Settings, MCP tokens, Help, Privacy, Terms

**Files:** `apps/web/app/globals.css`; Test `apps/web/test/phone-screens-c.test.ts`.

Cases (`## 21.10`):
```markdown
- ❌ **21.150 — Account: sections single column; devices rows stack (label + tag, activity, sign-out under); passkeys and Connected assistants rows stack; the Copy URL field wraps;** control: desktop unchanged. Mutation: keep side-by-side rows.
- ❌ **21.151 — Settings: the sidebar becomes a top `Select` (or a horizontally scrolling segmented track) above the content; Save full width;** control: desktop sidebar unchanged. Mutation: keep the sidebar column.
- ❌ **21.152 — `/mcp/tokens`: rows stack; Disconnect under the label;** control: desktop unchanged.
- ❌ **21.153 — Help, Privacy, Terms: reading width 100% with 1rem gutters, headings wrap, code/long words never overflow (`overflow-wrap: anywhere` on prose);** control: desktop measure unchanged. Mutation: drop `overflow-wrap`.
- 🧪 **21.154 — the six at every P8 phone width: no horizontal overflow.**
```
- [ ] Steps 1–5. Commit.

---

### Task 11: The workflow editor (and history, list, new) and ticket types

**Files:** `apps/web/app/globals.css` / `ui.css` (`.workflow-builder-screen*`, builder panels, ticket-types screens); Test `apps/web/test/phone-builder.test.ts`.

Cases (`## 21.11`):
```markdown
- ❌ **21.170 — the builder at ≤40rem: the canvas fills the screen and pans (deliberate scroller); the States / Transitions panels (W1) open as a bottom sheet from a "Panels" button; System rules / Issues inside the same sheet;** control: above 64rem the left column + its own scroll (W1d) unchanged. Mutation: render the left column beside the canvas on phones.
- ❌ **21.171 — the builder header (name, publish controls) wraps; Publish stays the one primary;** control: desktop header unchanged.
- ❌ **21.172 — workflow list / history / new (template doors) single column; the four template doors stack (B16/#820 kept);** control: desktop grid unchanged. Mutation: keep the grid.
- ❌ **21.173 — ticket types list / new / edit: form fields full width; the ↑/↓ reorder targets ≥44px (W1b technique);** control: desktop unchanged.
- 🧪 **21.174 — open a workflow at 390: pan the canvas, open Panels, expand a transition, add a rule, close.**
```
- [ ] Steps 1–5. Commit.

---

### Task 12: Sign-in, invite accept, MCP connect/authorize, the root page

**Files:** `apps/web/app/globals.css`; Test `apps/web/test/phone-auth.test.ts`.

Cases (`## 21.12`):
```markdown
- ❌ **21.190 — sign-in: the card fills the width with 1rem gutters; magic-link, passkey and Google buttons full width ≥48px; no bottom bar (signed out, FD3);** control: desktop centred card unchanged. Mutation: render the bottom bar.
- ❌ **21.191 — invite accept and `/mcp/connect` / `/mcp/authorize`: the card centred (C1 kept) and full width at ≤40rem; Allow/Join the one primary, full width;** control: desktop centring unchanged. Mutation: left-align on phones.
- ❌ **21.192 — the root page (redirect/landing) renders nothing that overflows at 360;** control: its redirect still fires.
- 🧪 **21.193 — sign in on a real phone (owner's Flip 7) with a magic link; accept an invite; open /mcp/connect from Claude on a phone.**
```
- [ ] Steps 1–5. Commit.

---

### Task 13: Browser pass 🧪 — every P8 width × style × theme

**Files:** `test-cases/21-mobile-web.md` (evidence on the 🧪 cases), `docs/lanes/` report (or the controller's lanes folder) — no product code unless a defect is found (then a fix commit with its own case).

**How:** chrome-devtools `emulate` with `viewport: { width, height, deviceScaleFactor: 3, isMobile: true, hasTouch: true }` (FD12) on the dev stack built from the release-branch tip (`ctl rebuild`); for each route in `PHONE_OWNERS` × widths {360, 375, 390, 393, 402, 412, 420, 430, 440, 466} × styles {hig, minimal, neo} × themes {light, dark} (sample: every route at 360 + 412 + 440 in all six style×theme pairs; the rest of the widths in hig dark), run in the page:
```js
() => ({ overflow: document.documentElement.scrollWidth - innerWidth,
         smallTargets: [...document.querySelectorAll('a,button,input,select,[role=tab]')]
           .filter(e => { const r = e.getBoundingClientRect(); return r.width && r.height && (r.width < 44 || r.height < 44) && getComputedStyle(e).visibility !== 'hidden'; })
           .map(e => e.getAttribute('aria-label') || e.textContent.trim().slice(0, 30)),
         bar: (() => { const b = document.querySelector('.gn-bottom-bar'); return b ? getComputedStyle(b).display : null; })() })
```
(small targets need their hit-slop accounted for — record, then check each with `elementFromPoint` at 44px.)

Cases (`## 21.13`):
```markdown
- 🧪 **21.210 — every route × the sampled widths/styles/themes: `overflow` = 0 (outside deliberate scrollers), no unaccounted small target, the bottom bar shown on signed-in pages.**
- 🧪 **21.211 — the owner's screenshot reproduced at 412×915 (Flip 7): fixed.**
- 🧪 **21.212 — the board at 390: swipe between columns, the picker follows; Move a card through a two-way branch; a gated move opens the comment step; a refusal glides back.**
- 🧪 **21.213 — the bottom bar: edit, reorder, reset; reload keeps the choice; another user on the same device sees the default.**
- 🧪 **21.230 — the iPhone Duo folded (~466): the phone layout, nothing stretched (cards ≤ the content width, no oversized gaps).**
- 🧪 **21.231 — the iPhone Duo unfolded (~890×626): the TABLET layout (no bottom bar, the tablet nav), no overflow.**
- 🧪 **21.232 — safe area: with `env(safe-area-inset-bottom)` emulated (devtools device with a home indicator), the bar sits above it.**
```
- [ ] **Step 1:** rebuild the dev stack from the tip; run the matrix; record evidence on each 🧪 case (values, not screenshots, where the tool refuses scratchpad paths). **Step 2:** any failure → a fix commit with its own case in the owning task's block. **Step 3:** note that the Duo widths are estimates — re-measure on a device or Apple's simulator before the release; list the owner's real-device check (Flip 7, an iPhone if available) as the release step.

---

## Self-review

1. **Spec coverage:** P1 → Tasks 1–12 (every route owned, 21.001); P2 → T2, T3; P3 → T3 (21.023–21.026); P4 → T3 (21.020–21.021); P5 → T4 (21.040–21.043); P6 → T4 (21.044–21.050); P7 → T5 (FD6 corrects its premise); P8 → T13 (+ Duo 21.230/21.231); §3.1 shell → T2/T3; §3.3 sheet/dialogs → T6; §3.4 every other screen → T7–T12; §4 testing → per task + T13.
2. **Placeholders:** none — every task names files, cases with control + mutation, and test code or the exact helper + selector to read.
3. **Type consistency:** `BarDestination`, `DEFAULT_BAR`, `MAX_SLOTS`, `readBottomBar`/`rememberBottomBar`/`resetBottomBar` (T3); `allBoardTargets(def, fromStateId)` (T4, used by T5); `.gn-board-card__move` (T4/T5); `--gn-phone-bar-height` / `--gn-phone-top-height` (T1, read by T3).
4. **Review Focus:** desktop regression → 21.012 control + the unchanged nav suites; unresolved remembered workspace → 21.027; keyboard → 21.031 + 21.133; branching/no-move → 21.046–21.048; Duo unfolded → 21.231.
