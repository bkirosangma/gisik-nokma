# Smoothness (asynchronous loading, optimistic writes, placeholders): implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. In this repo, execution is by the orchestrator's lanes (controller → dispatcher → lanes → reviewer → gate). **Owner (2026-10-02 ~13:50): D1–D13 + D2b ACCEPTED as recommended; runs alongside the neo refresh, AFTER `release/prefix-groups-ux` has merged to `main`. Not dispatched before that.**

**Goal:** Every screen on web, desktop and mobile paints a same-shape placeholder instead of a sentence or a blank, renders from memory on a return visit, shows a write the moment it is made and rolls it back honestly on refusal, and carries only the code the route needs.

**Architecture:** One loading primitive set in `packages/ui` (`Skeleton`, `Pending`, `useWait`, `Button busy`) used by web and desktop; a session-scoped read cache and request dedupe inside `packages/app-core`'s `useLiveQuery`/`DataSource` seam so every view gets stale-while-revalidate without changing its code; route shells (`loading.tsx`) and link pending hints in `apps/web`; optimistic overlays on the sheet, the create flow and the remaining board actions, reusing `board-move-state`'s pending/drop pattern; route-level code splitting; two server fixes (batched rollup, compression). No new data model, no token or surface change.

**Tech stack:** TypeScript monorepo; React 19 (`useTransition`, `useDeferredValue`, `memo`), Next 15.5 (`loading.tsx`, `useLinkStatus`, `next/dynamic`), Fastify 5 (`@fastify/compress`), vitest (jsdom + the CSS-rule helpers `readUiCss`/`ruleExactly`/`valueOf` in `packages/ui/test/helpers/css-rules.ts`, `readGlobalsCss` in `style-patterns.ts`), Playwright for the viewport capture, Node 22.

**Spec:** `gisik-nokma-lanes/smoothness-2026-10-02/2026-10-02-smoothness-design.md` (rules S1–S10, decisions D1–D13, §3.2–3.3 per screen). Evidence: `AUDIT.md` (SM-01–SM-16). Research: `RESEARCH.md` (P1–P15). The spec and plan are copied into `docs/superpowers/specs/` and `docs/superpowers/plans/` by Task 1.

## Preconditions
- **P1: cut `release/smoothness` from `main` after `release/prefix-groups-ux` has merged.** Every line cited below is from `release/prefix-groups-ux` at `4f86b959`; a lane re-greps each cited line before editing (the symbol or selector is the anchor, the line a hint).
- **P2: the neo refresh runs in parallel on `release/neo-refresh`** and owns `packages/ui/src/tokens.ts`, `packages/ui/src/ui.css` lines 96–99, 1168–1178, 7176–7180, 7252–7258, 8097–8153, `apps/web/app/globals.css:169` and `2942–2945`, and `packages/ui/src/index.ts`. Tasks below mark **Parallel-safe: yes/no** against those files; every `ui.css`/`globals.css` edit here is an APPEND after the last rule or a touch outside those ranges, and `tokens.ts` is never edited. `packages/ui/src/index.ts` gains export lines only (T2); the merge is trivial but it is named.
- **P3: the owner's rulings D1–D13 — ACCEPTED as recommended (owner, 2026-10-02 ~13:50: "Accept").** The tasks are written against those recommendations; a different ruling on D2/D2b changes T7's scope, on D5 changes T5, on D7 drops the compression half of T11, on D11 narrows T13.
- **P4: the dev stack is free** for T14's capture (it is paced and read-only, but it must not run beside another capture).

## Global constraints
- **The catalogue:** a new bucket `test-cases/25-smoothness.md` (3-digit `25.001`…) and Features **`## 22. Smoothness: loading, optimism and placeholders`**. Register the bucket in `test-cases/README.md` and `scripts/fixtures/check-case-citations-baseline.json` (`"25-smoothness.md": 0`). Every case line cites its audit id ("(audit SM-03)"). Bucket 24 / Features §21 belong to the neo refresh; never touch them.
- **Tests:** RED first, a control in the same `it`, a named mutation per case, case ids in test names. CSS cases use `readUiCss`/`ruleExactly`/`valueOf` (`packages/ui/test/helpers/css-rules.ts`) and `readGlobalsCss` (`style-patterns.ts`). Optimism cases use a deferred ingest (the shape of `packages/app-core/test/views/board-optimistic-moves.test.tsx`).
- **Tokens, never literals:** every colour in CSS is a `var(--gn-…)`; the placeholder fill is `var(--gn-surface-track)`; durations are `var(--gn-motion-*)` or the one new keyframe's own literal (1600ms, named in the spec). The only literal colour this release adds is in `apps/desktop/index.html` (outside the scanner's roots, `colour-scan.ts:24-32`), stated in T13.
- **Style-neutral:** no new rule names a `[data-style=…]` attribute (T2's case 25.013 polices the skeleton block).
- **No layout shift from a swap (S1):** every skeleton site states the content's box it copies, and T14 measures it.
- **Loading sentences are retired, not multiplied:** after this release `grep -rn ">Loading…<" apps/web packages/app-core/src` must return zero product sites (case 25.019 pins it; the audit's list in SM-09 is the worklist).
- **Runs:** Node 22; `pnpm -r --filter './packages/*' build` before suites; never pipe into `head`; lanes run only their affected test files + typecheck + `pnpm check:citations`; whole suites are the gate's job. Quote which run you are reporting.
- **UI work:** lanes read `frontend-design`'s SKILL.md before touching CSS (`ui-ux-pro-max` is disabled).

## Corrections to the spec (FD)
- **FD1, the wait numbers:** `WAIT_BEFORE_MS = 150` and `WAIT_HOLD_MS = 350` live in `packages/ui/src/use-wait.ts` as exported constants (one place, testable with fake timers), not as CSS variables; CSS needs no delay. Spec §4.3's "two CSS variables" is superseded by this line.
- **FD2, `useLinkStatus`:** Next is locked at 15.5.25 (`pnpm-lock.yaml:4882`), so the hook is available; `package.json`'s `^15.1.6` range stays.
- **FD3, the project page's Suspense fallback IS the server HTML:** `useSearchParams()` makes the page client-rendered below its boundary (`page.tsx:128-131`), so the fallback in `page.tsx:133-137` is what the server sends and what `loading.tsx` shows during the RSC hop. One component, `ProjectPageSkeleton`, serves both (T5/T6); case 23.040 (the fallback's class) keeps holding because the skeleton's `<main>` keeps `gn-shell gn-shell--wide`.
- **FD4, 13.1056:** `apps/web/test/loading-status.test.tsx` pins exactly five `<p role="status">Loading…</p>` arms in the project page. T6 amends it deliberately to pin zero bare arms and five skeleton sites, naming 13.1056 in the new case line.
- **FD5, `getMyWorkspaces` and the session:** the shared read (T4) is keyed by the signed-in user's id, so a user switch never serves another person's rows; it is cleared with the live-query cache on sign-out and 401.
- **FD6, the created ticket's key:** `TicketCard.key` is the server's; the ghost card renders `key: '…'` from a `pendingCreate` overlay and is replaced by the read that carries the real key. The overlay lives beside `applyPendingMoves` (`board-move-state.ts`) as `applyPendingCreates`.
- **FD7, roster memo and the docblock:** `online-data-source.ts:134-150` says "NOT cached across calls, deliberately". The 1,000 ms burst memo (T3) changes "per read" to "per second"; the docblock is rewritten in the same commit (prose-is-a-claim).
- **FD8, the Create gate's sweep:** `loading-status.test.tsx` also counts the create region's three `role="status"` arms (`page.tsx:2169, 2193, 2265`); the "Preparing…" arm becomes a busy button (T6), so that count drops to two, amended in the same test.

## Review focus
1. **A refused optimistic edit on the sheet while a second edit is pending:** the first field returns to the server's value with its refusal under it, the second keeps its overlay until its own answer (T7, case 25.096).
2. **A workspace switch after sign-out and sign-in as someone else on the same device:** no cached board, list or workspaces row from the first person is ever painted (T3/T4, cases 25.028, 25.044).
3. **A route whose read resolves in 10 ms:** no skeleton flashes (nothing before 150 ms), and a route whose read resolves at 160 ms shows the skeleton for the full 350 ms hold (T2, cases 25.011, 25.012).
4. **A board of 300 cards with the search box typed into quickly:** keystrokes paint before the filter applies, and the filtered board is correct when typing stops (T12, case 25.203).
5. **A phone at 390 px, first frame of any route:** the bottom bar is present and the corner's Notes/Inbox are not, before any effect runs (T8, case 25.141).

## Seam map (verified 2026-10-02 against `release/prefix-groups-ux` `4f86b959`)
The lines each task needs are inlined in its **Files** block; the audit (`AUDIT.md` §1) holds the full map.

## File structure (by task)
| Task | Area | Main files | Parallel-safe with neo |
|---|---|---|---|
| T1 | Catalogue and docs | `test-cases/25-smoothness.md`, `Features.md` §22, `test-cases/README.md`, baseline json, spec/plan into `docs/superpowers/` | yes |
| T2 | Loading primitives | `packages/ui/src/components/skeleton.tsx`, `pending.tsx`, `src/use-wait.ts`, `components/button.tsx`, `ui.css` (append), `src/index.ts` (+3 export lines) | yes (index.ts: additive) |
| T3 | Read cache, dedupe, coalescing | `packages/app-core/src/views/live-query-cache.ts`, `reload-scheduler.ts`, `use-live-query.ts`, `src/inflight-dedupe.ts`, `online/online-data-source.ts:134-160`, `src/index.ts` | yes |
| T4 | One workspaces read; last user id; freshness | `apps/web/src/use-my-workspaces.ts`, `use-workspace-name.ts`, `use-workspace-projects.ts`, `use-project-name.ts`, `providers.tsx:300-315`, `use-last-project.ts`, `inbox-nav-link.tsx:98-128`, `src/freshness.ts` | yes |
| T5 | Route shells and link hints | `apps/web/src/skeletons/*.tsx`, `app/**/loading.tsx`, `app-nav.tsx`, `last-project-nav.tsx`, `bottom-bar.tsx`, `globals.css` (append) | yes |
| T6 | Project page | `app/w/[workspaceId]/p/[projectId]/page.tsx`, `src/use-last-project.ts`, `test/loading-status.test.tsx` | yes |
| T7 | Optimistic writes | `views/ticket-sheet.tsx`, `views/optimistic-ticket.ts`, `views/board-move-state.ts`, `views/board.tsx`, `views/create-ticket-flow.tsx`, `src/backlog-start-button.tsx`, the two rename sites | yes |
| T8 | Secondary screens and the shell | `workspaces/page.tsx`, `w/[workspaceId]/page.tsx`, `members/page.tsx`, `inbox/page.tsx`, `my-work/page.tsx`, `settings/page.tsx`, `account/page.tsx`, `sign-in/page.tsx`, `invite/[token]/page.tsx`, `phone-switcher.tsx`, `app-nav.tsx`, `use-tablet-bar.ts`, `bottom-bar.tsx`, `globals.css` (append) | yes |
| T9 | Notes | `src/notes/notes-page.tsx`, `note-document.tsx`, `note-comments.tsx`, `workspace-notes-section.tsx`, `use-note-autosave.ts`, `globals.css:4520` | yes |
| T10 | Bundles | `packages/app-core/package.json`, `src/data.ts`, `apps/web/src/providers.tsx:5-13`, `src/editor-slot.tsx`, `help/page.tsx`, the two workflow routes, `apps/web/test/import-graph.test.ts` | yes |
| T11 | Server | `apps/server/src/visibility/rollup.ts`, `read/ticket-cards.ts:158-166`, `app.ts:770`, `package.json` | yes |
| T12 | Board render cost | `views/board.tsx:1345-1356, 1845`, `ui.css:1287, 1601`, `page.tsx:2407-2410` | yes (lines outside neo's ranges) |
| T13 | Desktop and mobile | `apps/desktop/index.html`, `src/app.tsx`, `apps/mobile/src/screens/board-screen.tsx`, `ticket-screen.tsx`, `editor/editor-web-view.tsx` | yes |
| T14 | Capture, ratchet, re-audit | `gisik-nokma-lanes/smoothness-2026-10-02/capture-perf.mjs`, `apps/web/e2e-stack/smoothness.spec.ts`, `smoothness-baseline.json` | yes |

**Case blocks:** T1 25.001–009 · T2 25.010–019 · T3 25.020–039 · T4 25.040–049 · T5 25.050–069 · T6 25.070–089 · T7 25.090–119 · T8 25.120–149 · T9 25.150–169 · T10 25.170–189 · T11 25.190–199 · T12 25.200–209 · T13 25.210–229 · T14 25.230–239.

**Order:** T1 → T2, T3, T4, T11 (independent; in parallel) → T5 (needs T2) → T6, T7, T8, T9 (need T2+T3+T4; parallel, distinct files) → T10, T12, T13 (parallel) → T14 last.

---

### Task 1: Catalogue and docs land first

> **Note (2026-10-02, reviewer A's T1 note N2): the `?` bullets were not used.** The Interfaces line below says the Features section holds "one line per task, each `?` until its task flips it". The branch instead carries one marker comment in `Features.md` §22 (`<!-- smoothness bullets: append below, one per task, in task order, each when its task lands -->`), and each task adds its own bullet, written ✅ or ⚙️, in its own change set. Reason: the workspace rule "never leave a `?` you introduced". The plan text and the branch differ here on purpose.

**Files:**
- Create: `test-cases/25-smoothness.md`
- Modify: `Features.md` (append `## 22. Smoothness: loading, optimism and placeholders` after §21 if the neo bucket has landed, else after §20; the section number is 22 either way), `test-cases/README.md` (the bucket list), `scripts/fixtures/check-case-citations-baseline.json` (add `"25-smoothness.md": 0`)
- Create: `docs/superpowers/specs/2026-10-02-smoothness-design.md`, `docs/superpowers/plans/2026-10-02-smoothness.md` (verbatim copies of the lane files)

**Interfaces, produces:** the bucket header with the case blocks above; the Features section header with one line per task, each `?` until its task flips it.

- [ ] **Step 1: The bucket file**

```markdown
# §25 — Smoothness: loading, optimism and placeholders

**Opened 2026-10-02 by smoothness T1** (`docs/superpowers/plans/2026-10-02-smoothness.md`; spec `docs/superpowers/specs/2026-10-02-smoothness-design.md`, owner decisions D1–D13; audit `gisik-nokma-lanes/smoothness-2026-10-02/AUDIT.md`, findings SM-01–SM-16). Mirrors `Features.md` §22.

3-DIGIT PADDED `25.001`–`25.999`, blocks per task: T1 25.001–25.009 · T2 25.010–25.019 · T3 25.020–25.039 · T4 25.040–25.049 · T5 25.050–25.069 · T6 25.070–25.089 · T7 25.090–25.119 · T8 25.120–25.149 · T9 25.150–25.169 · T10 25.170–25.189 · T11 25.190–25.199 · T12 25.200–25.209 · T13 25.210–25.229 · T14 25.230–25.239.

## 25.1 Catalogue (T1)

- ❌ **25.001 — the bucket is registered in `test-cases/README.md` and the citations baseline, and `pnpm check:citations` passes with it empty.** Control: a case id cited by no test reddens the check.
```

- [ ] **Step 2: Run the catalogue check**

Run: `cd <worktree> && node scripts/check-case-citations.mjs`
Expected: PASS (the bucket is registered with zero cited cases).

- [ ] **Step 3: Commit**

```bash
git add test-cases/25-smoothness.md test-cases/README.md scripts/fixtures/check-case-citations-baseline.json Features.md docs/superpowers/specs/2026-10-02-smoothness-design.md docs/superpowers/plans/2026-10-02-smoothness.md
git commit -m "Smoothness T1: bucket 25, Features §22, spec and plan land"
```

---

### Task 2: Loading primitives in `packages/ui` (`Skeleton`, `Pending`, `useWait`, `Button busy`)

> **Amendment S-R1 (2026-10-02): T2 also adds the `surfacePlaceholder` token role and builds `Skeleton` as the PARTS of structural skeletons.** Owner ruling 2026-10-02 ~21:00: *"can the skeleton take at least the shape of what the actual element would look like?"*, then **"Yes, structural skeletons."** Spec `docs/superpowers/specs/2026-10-02-smoothness-design.md` § "Amendment S-R1" (rules 1–5). The task body below is NOT rewritten; where it says a generic shape, a `card`, or `var(--gn-surface-track)`, this note wins.
> - **Role.** A new `surfacePlaceholder` role in `packages/ui/src/tokens.ts`, used by the skeleton fill in place of `var(--gn-surface-track)` (the body's Fill line and every case that asserts `--gn-surface-track` change to `--gn-surface-placeholder`). Decoration only, so no `CONTRAST_PAIRS` row.
> - **hig and minimal (light and dark)** map it to the SAME primitive `surfaceTrack` maps to today, so their look does not change and guard 24.009 (hig/minimal byte-identical) stays green. T2 asserts that equality per theme as a case.
> - **neo (light and dark)** maps it to a FLAT surface step, one notch off `surface` toward ink, **never the well** (`neoWellLight` / `neoWellDark`) and never a field look. T2 picks the step and quotes its hex in DONE; a case asserts the neo value is not the well primitive.
> - **The token report** (`docs/neo-token-report.md`) gains the role, per the amendment.
> - **Parts.** `line`, `block` and `circle` stay as the PARTS; `card` stays only as a fallback for a region with no real component. T2 does not build any screen's skeleton. T5–T9 and T13 each build theirs from the real component's container plus these parts.
> - **Unchanged:** motion, copy, accessibility, budgets, `WAIT_BEFORE_MS` / `WAIT_HOLD_MS`, and §4.3's style-neutral test (no skeleton rule names a style attribute).
> - **Resolves** the OPEN item at the end of "Re-anchored citations" (S94 vs neo's `surfaceTrack` well).

**Parallel-safe with neo: yes** (CSS appended after `ui.css`'s last rule, line 8904 at `4f86b959`; `index.ts` gains three export lines; `tokens.ts` untouched).

**Files:**
- Create: `packages/ui/src/components/skeleton.tsx`, `packages/ui/src/components/pending.tsx`, `packages/ui/src/use-wait.ts`
- Modify: `packages/ui/src/components/button.tsx:10-15`, `packages/ui/src/ui.css` (append), `packages/ui/src/index.ts` (after line 45, `useScrollEdges`)
- Test: `packages/ui/test/skeleton.test.tsx`, `packages/ui/test/use-wait.test.tsx`, `packages/ui/test/skeleton-css.test.ts`

**Interfaces, produces:**
- `Skeleton({ shape?: 'line' | 'block' | 'circle' | 'card'; width?: string; height?: string; rows?: number; className?: string })` → `<span class="gn-skeleton gn-skeleton--<shape>" aria-hidden="true" style="--gn-skeleton-w; --gn-skeleton-h">`, `rows > 1` wrapped in `<span class="gn-skeleton__rows">`.
- `SkeletonRegion({ label: string; children; className?; as?: 'div' | 'section' | 'li' })` → the element with `aria-busy="true"` and one `<span class="gn-visually-hidden">{label}</span>`.
- `useWait(pending: boolean, options?: { immediate?: boolean }): boolean` with `WAIT_BEFORE_MS = 150`, `WAIT_HOLD_MS = 350`.
- `Pending({ pending: boolean; label?: string; children; className? })` → a `<div>` with `aria-busy` while pending and class `gn-pending` once the wait has elapsed.
- `Button` gains `busy?: boolean; busyLabel?: string`: `disabled`, `aria-busy="true"`, and `busyLabel` (or the children) as content while busy.
- `AnnounceRegion()` → the ONE polite live region (`<div role="status" class="gn-visually-hidden" aria-live="polite" aria-atomic="true">`) mounted once by the shell (T5 puts it in `apps/web/app/layout.tsx` beside `RouteAnnouncer`; the desktop in `main.tsx`); `useAnnounce(): (message: string) => void` writes to it through a module-level store (spec §5, S6). Writing the same message twice re-announces (the store clears and re-sets on the next frame).

- [ ] **Step 1: Failing tests** (`packages/ui/test/use-wait.test.tsx`)

```tsx
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WAIT_BEFORE_MS, WAIT_HOLD_MS, useWait } from '../src/use-wait.js';

describe('useWait — nothing before 150 ms, then held 350 ms (spec S2, D4)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('25.011 a read that resolves in 10 ms never shows a placeholder; one that resolves at 160 ms does', () => {
    const fast = renderHook(({ pending }) => useWait(pending), { initialProps: { pending: true } });
    act(() => vi.advanceTimersByTime(10));
    fast.rerender({ pending: false });
    act(() => vi.advanceTimersByTime(WAIT_HOLD_MS + 1));
    expect(fast.result.current).toBe(false);

    // Control: the same hook, with the read still open at 149 and at 150 ms.
    const slow = renderHook(({ pending }) => useWait(pending), { initialProps: { pending: true } });
    act(() => vi.advanceTimersByTime(WAIT_BEFORE_MS - 1));
    expect(slow.result.current).toBe(false);
    act(() => vi.advanceTimersByTime(1));
    expect(slow.result.current).toBe(true);
  });

  it('25.012 once shown, the placeholder stays for the hold even when the read resolves 10 ms later', () => {
    const hook = renderHook(({ pending }) => useWait(pending), { initialProps: { pending: true } });
    act(() => vi.advanceTimersByTime(WAIT_BEFORE_MS + 10));
    expect(hook.result.current).toBe(true);
    hook.rerender({ pending: false });
    act(() => vi.advanceTimersByTime(WAIT_HOLD_MS - 11));
    expect(hook.result.current).toBe(true);
    act(() => vi.advanceTimersByTime(1));
    expect(hook.result.current).toBe(false);
  });

  it('25.013 immediate: a region that never had content shows its placeholder on the first render', () => {
    const hook = renderHook(() => useWait(true, { immediate: true }));
    expect(hook.result.current).toBe(true);
    // Control: without the option the first render is bare.
    const plain = renderHook(() => useWait(true));
    expect(plain.result.current).toBe(false);
  });
});
```

(`packages/ui/test/skeleton.test.tsx`)

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Skeleton, SkeletonRegion } from '../src/components/skeleton.js';
import { Pending } from '../src/components/pending.js';
import { Button } from '../src/components/button.js';

describe('Skeleton, SkeletonRegion, Pending, Button busy (spec §4.1, S6)', () => {
  it('25.014 a skeleton is aria-hidden, carries its shape class and its size variables, and rows repeat inside one wrapper', () => {
    const { container } = render(<Skeleton shape="card" width="12rem" height="5.5rem" rows={3} />);
    const blocks = container.querySelectorAll('.gn-skeleton.gn-skeleton--card[aria-hidden="true"]');
    expect(blocks).toHaveLength(3);
    expect((blocks[0] as HTMLElement).style.getPropertyValue('--gn-skeleton-w')).toBe('12rem');
    expect((blocks[0] as HTMLElement).style.getPropertyValue('--gn-skeleton-h')).toBe('5.5rem');
    expect(container.querySelectorAll('.gn-skeleton__rows')).toHaveLength(1);
    // Control: a single line has no rows wrapper and defaults to the line shape.
    const one = render(<Skeleton />).container;
    expect(one.querySelector('.gn-skeleton__rows')).toBeNull();
    expect(one.querySelector('.gn-skeleton--line')).not.toBeNull();
  });

  it('25.015 a SkeletonRegion is aria-busy and names what is loading ONCE, visually hidden', () => {
    render(
      <SkeletonRegion label="Loading the board">
        <Skeleton rows={4} />
      </SkeletonRegion>,
    );
    const region = screen.getByText('Loading the board').parentElement!;
    expect(region).toHaveAttribute('aria-busy', 'true');
    expect(region.querySelectorAll('.gn-visually-hidden')).toHaveLength(1);
    expect(region.querySelectorAll('[tabindex], a, button, input')).toHaveLength(0);
  });

  it('25.016 Pending sets aria-busy at once and the dim class only after the wait; a busy Button is disabled, aria-busy and reads its busy label', () => {
    const { container, rerender } = render(<Pending pending label="Saving the title"><span>field</span></Pending>);
    const wrap = container.firstElementChild as HTMLElement;
    expect(wrap).toHaveAttribute('aria-busy', 'true');
    expect(wrap.classList.contains('gn-pending')).toBe(false);
    rerender(<Pending pending={false}><span>field</span></Pending>);
    expect(wrap).not.toHaveAttribute('aria-busy');

    render(<Button busy busyLabel="Creating…">Create ticket</Button>);
    const busy = screen.getByRole('button', { name: 'Creating…' });
    expect(busy).toBeDisabled();
    expect(busy).toHaveAttribute('aria-busy', 'true');
    // Control: not busy → the children, enabled, no aria-busy.
    render(<Button busyLabel="Creating…">Create ticket</Button>);
    const idle = screen.getByRole('button', { name: 'Create ticket' });
    expect(idle).toBeEnabled();
    expect(idle).not.toHaveAttribute('aria-busy');
  });
});
```

(`packages/ui/test/skeleton-css.test.ts`)

```ts
import { describe, expect, it } from 'vitest';
import { parseRules, readUiCss, ruleExactly, valueOf } from './helpers/css-rules.js';

const css = readUiCss();

describe('the placeholder block in ui.css (spec §4.2, §4.3)', () => {
  it('25.017 the skeleton fill is the track role, the shape is radius tokens, and the pulse is one named keyframe on opacity only', () => {
    const base = ruleExactly(css, '.gn-skeleton');
    expect(valueOf(base, 'background')).toBe('var(--gn-surface-track)');
    expect(valueOf(base, 'border-radius')).toBe('var(--gn-radius-control)');
    expect(valueOf(base, 'box-shadow')).toBeNull();
    expect(valueOf(base, 'animation')).toBe('gnPulse 1600ms var(--gn-motion-ease-out) infinite');
    expect(valueOf(ruleExactly(css, '.gn-skeleton--card'), 'border-radius')).toBe('var(--gn-radius-card)');
    const pulse = css.match(/@keyframes gnPulse\s*\{([\s\S]*?)\}\s*\}/)?.[1] ?? '';
    expect(pulse).toMatch(/opacity/);
    expect(pulse).not.toMatch(/transform|background|width|height/);
    // Control: the mutation "fill from surface" fails this line.
    expect(valueOf(base, 'background')).not.toBe('var(--gn-surface)');
  });

  it('25.018 reduced motion stops the pulse and leaves a static block; the block names no style attribute', () => {
    const reduced = ruleExactly(css, '.gn-skeleton', '@media (prefers-reduced-motion: reduce)');
    expect(valueOf(reduced, 'animation')).toBe('none');
    expect(valueOf(reduced, 'opacity')).toBe('0.8');
    const block = css.slice(css.indexOf('LOADING PLACEHOLDERS'));
    expect(block).not.toMatch(/\[data-style=/);
    expect(parseRules(block).filter((r) => r.selectors.some((s) => s.startsWith('.gn-skeleton')))).not.toHaveLength(0);
  });

  it('25.019 the block is appended after every earlier rule, so the neo refresh\'s line ranges do not move', () => {
    const marker = css.indexOf('LOADING PLACEHOLDERS');
    expect(marker).toBeGreaterThan(0);
    const rulesAfter = parseRules(css.slice(marker)).map((r) => r.selectors.join(','));
    for (const sel of rulesAfter) expect(sel).toMatch(/^(\.gn-skeleton|\.gn-pending|\.gn-skeleton__rows|\.gn-skeleton-region)/);
  });
});
```

(`packages/ui/test/announce.test.tsx`)

```tsx
import { act, render, renderHook, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AnnounceRegion, useAnnounce } from '../src/announce.js';

describe('the one polite region (spec §5, S6)', () => {
  it('25.010 a message reaches the single role="status" region politely; the same message twice is announced twice; nothing is assertive', async () => {
    render(<AnnounceRegion />);
    const region = screen.getByRole('status');
    expect(region).toHaveAttribute('aria-live', 'polite');
    expect(region).toHaveAttribute('aria-atomic', 'true');
    expect(region.className).toContain('gn-visually-hidden');
    const { result } = renderHook(() => useAnnounce());
    act(() => result.current('Saved'));
    expect(region).toHaveTextContent('Saved');
    act(() => result.current('Saved'));
    await act(async () => { await new Promise((r) => requestAnimationFrame(r)); });
    expect(region).toHaveTextContent('Saved'); // cleared and re-set across a frame, so AT re-reads it
    expect(document.querySelectorAll('[aria-live="assertive"], [role="alert"]')).toHaveLength(0);
    // Control: two regions never mount; a second AnnounceRegion renders nothing.
    render(<AnnounceRegion />);
    expect(screen.getAllByRole('status')).toHaveLength(1);
  });
});
```

Add to `skeleton-css.test.ts`:

```ts
  it('25.017b every selector with an animation declaration in ui.css has a prefers-reduced-motion: reduce arm naming it', () => {
    const rules = parseRules(css);
    const animated = rules.filter((r) => r.atRule === null && /(^|;|\s)animation\s*:/.test(r.body)).flatMap((r) => r.selectors);
    const reduced = new Set(rules.filter((r) => r.atRule === '@media (prefers-reduced-motion: reduce)').flatMap((r) => r.selectors));
    const ungated = animated.filter((s) => !reduced.has(s));
    expect(ungated, ungated.join('\n')).toEqual([]);
    // Control: a planted ungated animation in a copy of the sheet is caught.
    const planted = parseRules(`${css}\n.gn-planted { animation: gnPulse 1s infinite; }`);
    const plantedAnimated = planted.filter((r) => r.atRule === null && /animation\s*:/.test(r.body)).flatMap((r) => r.selectors);
    expect(plantedAnimated.filter((s) => !reduced.has(s))).toEqual(['.gn-planted']);
  });
```

- [ ] **Step 2: Run them to see RED**

Run: `cd <worktree>/packages/ui && pnpm exec vitest run test/use-wait.test.tsx test/skeleton.test.tsx test/skeleton-css.test.ts 2>&1 | tail -20`
Expected: FAIL — modules not found; `ruleExactly` throws "found 0".

- [ ] **Step 3: Implement `use-wait.ts`**

```ts
import { useEffect, useRef, useState } from 'react';

/** Spec S2 / D4: nothing before this many ms of waiting… */
export const WAIT_BEFORE_MS = 150;
/** …and once a placeholder is shown it stays at least this long, so a 160 ms read never flashes it for 10 ms. */
export const WAIT_HOLD_MS = 350;

/**
 * Whether a placeholder should be ON SCREEN for a `pending` region. Pure timing: the caller
 * decides what to draw. `immediate` is for a region that has never had content (a route's first
 * paint), where an empty page for 150 ms is worse than a wireframe for 150 ms.
 */
export function useWait(pending: boolean, options: { immediate?: boolean } = {}): boolean {
  const immediate = options.immediate === true;
  const [shown, setShown] = useState(pending && immediate);
  const shownAt = useRef<number | null>(pending && immediate ? Date.now() : null);

  useEffect(() => {
    if (pending) {
      if (shownAt.current !== null) return undefined;
      if (immediate) {
        shownAt.current = Date.now();
        setShown(true);
        return undefined;
      }
      const timer = setTimeout(() => {
        shownAt.current = Date.now();
        setShown(true);
      }, WAIT_BEFORE_MS);
      return () => clearTimeout(timer);
    }
    if (shownAt.current === null) {
      setShown(false);
      return undefined;
    }
    const rest = Math.max(0, WAIT_HOLD_MS - (Date.now() - shownAt.current));
    const timer = setTimeout(() => {
      shownAt.current = null;
      setShown(false);
    }, rest);
    return () => clearTimeout(timer);
  }, [pending, immediate]);

  return shown;
}
```

- [ ] **Step 4: Implement `skeleton.tsx`, `pending.tsx`, the `Button` props**

```tsx
// packages/ui/src/components/skeleton.tsx
import type { CSSProperties, ReactNode } from 'react';

export type SkeletonShape = 'line' | 'block' | 'circle' | 'card';
export type SkeletonProps = { shape?: SkeletonShape; width?: string; height?: string; rows?: number; className?: string };

/** A wireframe of content whose answer is unknown (spec S1, S3). Decoration only: aria-hidden, never focusable. */
export function Skeleton({ shape = 'line', width, height, rows = 1, className }: SkeletonProps) {
  const style: CSSProperties = {};
  if (width !== undefined) (style as Record<string, string>)['--gn-skeleton-w'] = width;
  if (height !== undefined) (style as Record<string, string>)['--gn-skeleton-h'] = height;
  const classes = ['gn-skeleton', `gn-skeleton--${shape}`, className].filter(Boolean).join(' ');
  const one = (key: number) => <span key={key} className={classes} style={style} aria-hidden="true" />;
  if (rows <= 1) return one(0);
  return <span className="gn-skeleton__rows">{Array.from({ length: rows }, (_, index) => one(index))}</span>;
}

export type SkeletonRegionProps = { label: string; children: ReactNode; className?: string; as?: 'div' | 'section' | 'li' };

/** The region a set of skeletons stands in: busy, named once for assistive tech (spec §5). */
export function SkeletonRegion({ label, children, className, as: Tag = 'div' }: SkeletonRegionProps) {
  return (
    <Tag className={['gn-skeleton-region', className].filter(Boolean).join(' ')} aria-busy="true">
      <span className="gn-visually-hidden">{label}</span>
      {children}
    </Tag>
  );
}
```

```tsx
// packages/ui/src/components/pending.tsx
import type { ReactNode } from 'react';
import { useWait } from '../use-wait.js';

export type PendingProps = { pending: boolean; label?: string; children: ReactNode; className?: string };

/** Content that is being written: busy at once, dimmed only after the wait (spec S6). Children stay in the tab order. */
export function Pending({ pending, label, children, className }: PendingProps) {
  const dim = useWait(pending);
  return (
    <div className={[className, dim ? 'gn-pending' : null].filter(Boolean).join(' ')} aria-busy={pending ? 'true' : undefined}>
      {children}
      {pending && label !== undefined ? <span className="gn-visually-hidden">{label}</span> : null}
    </div>
  );
}
```

```tsx
// packages/ui/src/components/button.tsx — replace lines 10-15
export type ButtonProps = ComponentPropsWithRef<'button'> & { variant?: ButtonVariant; busy?: boolean; busyLabel?: string };

export function Button({ variant = 'ghost', className, type, busy = false, busyLabel, disabled, children, ...rest }: ButtonProps) {
  const classes = ['gn-button', `gn-button--${variant}`, className].filter(Boolean).join(' ');
  return (
    <button {...rest} type={type ?? 'button'} className={classes} disabled={disabled || busy} aria-busy={busy ? 'true' : undefined}>
      {busy && busyLabel !== undefined ? busyLabel : children}
    </button>
  );
}
```

Append to `packages/ui/src/index.ts` after the `useScrollEdges` line:

```ts
export { Skeleton, SkeletonRegion, type SkeletonProps, type SkeletonRegionProps, type SkeletonShape } from './components/skeleton.js';
export { Pending, type PendingProps } from './components/pending.js';
export { useWait, WAIT_BEFORE_MS, WAIT_HOLD_MS } from './use-wait.js';
```

```tsx
// packages/ui/src/announce.tsx
'use client';
import { useCallback, useEffect, useState } from 'react';

const listeners = new Set<(message: string) => void>();
let mounted = false;

/** The shell's ONE polite live region (spec §5). Mounted once; a second mount renders nothing. */
export function AnnounceRegion() {
  const [message, setMessage] = useState('');
  const [owner] = useState(() => { if (mounted) return false; mounted = true; return true; });
  useEffect(() => {
    if (!owner) return undefined;
    const listener = (next: string) => {
      setMessage('');
      requestAnimationFrame(() => setMessage(next));
    };
    listeners.add(listener);
    return () => { listeners.delete(listener); mounted = false; };
  }, [owner]);
  if (!owner) return null;
  return <div role="status" aria-live="polite" aria-atomic="true" className="gn-visually-hidden">{message}</div>;
}

export function useAnnounce(): (message: string) => void {
  return useCallback((message: string) => { for (const l of listeners) l(message); }, []);
}
```

Add to the `index.ts` export lines: `export { AnnounceRegion, useAnnounce } from './announce.js';`.

- [ ] **Step 5: Append the CSS block to `ui.css`** (after the last rule; the marker string is load-bearing for 25.018/25.019)

```css
/* ── LOADING PLACEHOLDERS (smoothness release, 2026-10-02; spec §4) ──────────
   Appended after every earlier rule ON PURPOSE: the neo refresh edits ranges
   above this line in parallel, and a block inserted earlier would move them.
   The keyframe lives beside its ONE consumer (the header's rule for keyframes).
   Fill is the quiet track, no depth in any style: U7's "no depth means not
   interactive" is exactly what a placeholder is. */
.gn-skeleton {
  display: block;
  background: var(--gn-surface-track);
  border-radius: var(--gn-radius-control);
  width: var(--gn-skeleton-w, 60%);
  height: var(--gn-skeleton-h, 1em);
  animation: gnPulse 1600ms var(--gn-motion-ease-out) infinite;
}
.gn-skeleton--block { border-radius: var(--gn-radius-card); width: var(--gn-skeleton-w, 100%); height: var(--gn-skeleton-h, 4rem); }
.gn-skeleton--circle { border-radius: 50%; width: var(--gn-skeleton-w, 2rem); height: var(--gn-skeleton-h, 2rem); }
.gn-skeleton--card { border-radius: var(--gn-radius-card); width: var(--gn-skeleton-w, 100%); height: var(--gn-skeleton-h, 5.5rem); }
.gn-skeleton__rows { display: flex; flex-direction: column; gap: var(--gn-space-2); }
.gn-skeleton-region { display: block; }
.gn-pending > * { opacity: var(--gn-disabled-opacity); }
@keyframes gnPulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}
@media (prefers-reduced-motion: reduce) {
  .gn-skeleton { animation: none; opacity: 0.8; }
}
```

- [ ] **Step 6: Run the three files, then the package's whole suite** (`components.test.tsx` renders `Button` and must stay green)

Run: `cd <worktree>/packages/ui && pnpm build && pnpm exec vitest run 2>&1 | tail -15 && pnpm typecheck`
Expected: PASS; the token-discipline scan finds no literal (the block has none).

- [ ] **Step 7: Catalogue and commit**

`test-cases/25-smoothness.md` §25.2 cases 25.010–25.019 flip ❌ → ✅ (25.010 unused); Features §22 bullet "⚙️ **Loading primitives** (smoothness T2; cases 25.011–25.019; `packages/ui/src/components/skeleton.tsx`, `pending.tsx`, `use-wait.ts`, `button.tsx`, the placeholder block in `ui.css`) — `Skeleton`/`SkeletonRegion`, `Pending`, `useWait` (150 ms before, 350 ms hold), `Button busy`".

```bash
git add packages/ui/src/components/skeleton.tsx packages/ui/src/components/pending.tsx packages/ui/src/use-wait.ts packages/ui/src/announce.tsx packages/ui/src/components/button.tsx packages/ui/src/ui.css packages/ui/src/index.ts packages/ui/test/use-wait.test.tsx packages/ui/test/skeleton.test.tsx packages/ui/test/skeleton-css.test.ts packages/ui/test/announce.test.tsx test-cases/25-smoothness.md Features.md
git commit -m "Smoothness T2: Skeleton, Pending, useWait, AnnounceRegion and Button busy in packages/ui (cases 25.010-25.019)"
```

---

### Task 3: The read cache, in-flight dedupe and one reload wave per workspace (`packages/app-core`)

**Parallel-safe with neo: yes.**

**Files:**
- Create: `packages/app-core/src/views/live-query-cache.ts`, `packages/app-core/src/views/reload-scheduler.ts`, `packages/app-core/src/inflight-dedupe.ts`
- Modify: `packages/app-core/src/views/use-live-query.ts:77-91` (signature and state init), `:160-186` (key effect, subscription), `packages/app-core/src/online/online-data-source.ts:134-160` (`workspaceRoster` + docblock), `packages/app-core/src/index.ts` (export the three)
- Test: `packages/app-core/test/views/live-query-cache.test.tsx`, `packages/app-core/test/inflight-dedupe.test.ts`, `packages/app-core/test/online/roster-burst.test.ts`

**Interfaces, produces:**
- `recallLiveQuery<T>(key: string, now?: number): T | undefined`, `rememberLiveQuery<T>(key, data, now?)`, `liveQueryAgeMs(key, now?): number | null`, `clearLiveQueryCache(): void`, `LIVE_QUERY_CACHE_TTL_MS = 600_000`, `LIVE_QUERY_CACHE_MAX = 200`.
- `useLiveQuery<T>(source, workspaceId, queryKey, load, options?: number | LiveQueryOptions<T>, initial?)` where `LiveQueryOptions<T> = { debounceMs?: number; initial?: { key: string; data: T }; cacheKey?: string }`; a number keeps meaning `debounceMs` (every existing caller unchanged). With `cacheKey`, the first render and every key change serve the cached answer (`settled` false until the fresh read lands); a resolved load writes it.
- `scheduleReload(workspaceId: string, reload: () => void, debounceMs: number): void` and `subscribeReloads(workspaceId, reload): () => void` — one timer per workspace, every registered hook reloaded by it.
- `withInflightDedupe(source: DataSource): DataSource` — identical `query.*` calls while one is in flight share its promise.
- `ROSTER_BURST_MS = 1000` in `online-data-source.ts`.

- [ ] **Step 1: Failing tests** (`packages/app-core/test/views/live-query-cache.test.tsx`)

```tsx
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ClientStreamFrame, DataSource } from '../../src/data-source.js';
import { useLiveQuery } from '../../src/views/use-live-query.js';
import {
  LIVE_QUERY_CACHE_MAX,
  clearLiveQueryCache,
  recallLiveQuery,
  rememberLiveQuery,
} from '../../src/views/live-query-cache.js';

function drivable(): { source: DataSource; fire: (item: ClientStreamFrame) => void; subscribed: number } {
  const cbs = new Set<(item: ClientStreamFrame) => void>();
  const handle = { subscribed: 0 } as { subscribed: number };
  const source = {
    subscribe: (_ws: string, _after: number, next: (item: ClientStreamFrame) => void) => {
      handle.subscribed += 1;
      cbs.add(next);
      return () => cbs.delete(next);
    },
  } as unknown as DataSource;
  return { source, fire: (item) => cbs.forEach((cb) => cb(item)), get subscribed() { return handle.subscribed; } };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

describe('useLiveQuery with a cacheKey — stale-while-revalidate (spec S4, D1; audit SM-01)', () => {
  beforeEach(() => clearLiveQueryCache());
  afterEach(() => clearLiveQueryCache());

  it('25.021 a remount serves the last answer on its FIRST render and still asks again', async () => {
    const { source } = drivable();
    let asked = 0;
    const load = async () => { asked += 1; return { rows: ['a'] }; };
    const first = renderHook(() => useLiveQuery(source, 'ws', 'prj', load, { cacheKey: 'list:prj' }));
    await waitFor(() => expect(first.result.current.data).toEqual({ rows: ['a'] }));
    first.unmount();

    const open = deferred<{ rows: string[] }>();
    const second = renderHook(() => useLiveQuery(source, 'ws', 'prj', () => open.promise, { cacheKey: 'list:prj' }));
    expect(second.result.current.data).toEqual({ rows: ['a'] }); // first render, no await
    expect(second.result.current.settled).toBe(false);
    act(() => open.resolve({ rows: ['a', 'b'] }));
    await waitFor(() => expect(second.result.current.data).toEqual({ rows: ['a', 'b'] }));
    expect(second.result.current.settled).toBe(true);
    expect(asked).toBe(1);
    // Control: without a cacheKey the remount starts from null.
    const bare = renderHook(() => useLiveQuery(source, 'ws', 'prj', () => new Promise<never>(() => {})));
    expect(bare.result.current.data).toBeNull();
  });

  it('25.022 a key change serves the NEW key\'s cached answer, never the old key\'s, and null when it has none', async () => {
    const { source } = drivable();
    rememberLiveQuery('board:A', { groups: ['A'] });
    rememberLiveQuery('board:B', { groups: ['B'] });
    const hook = renderHook(
      ({ id }) => useLiveQuery(source, 'ws', id, () => new Promise<never>(() => {}), { cacheKey: `board:${id}` }),
      { initialProps: { id: 'A' } },
    );
    expect(hook.result.current.data).toEqual({ groups: ['A'] });
    hook.rerender({ id: 'B' });
    expect(hook.result.current.data).toEqual({ groups: ['B'] });
    hook.rerender({ id: 'C' });
    expect(hook.result.current.data).toBeNull();
  });

  it('25.023 the cache evicts by age and by size, and clears whole', () => {
    rememberLiveQuery('k', 1, 0);
    expect(recallLiveQuery('k', 600_000)).toBe(1);
    expect(recallLiveQuery('k', 600_001)).toBeUndefined();
    for (let i = 0; i < LIVE_QUERY_CACHE_MAX + 1; i += 1) rememberLiveQuery(`n${i}`, i);
    expect(recallLiveQuery('n0')).toBeUndefined();
    expect(recallLiveQuery(`n${LIVE_QUERY_CACHE_MAX}`)).toBe(LIVE_QUERY_CACHE_MAX);
    clearLiveQueryCache();
    expect(recallLiveQuery(`n${LIVE_QUERY_CACHE_MAX}`)).toBeUndefined();
  });

  it('25.024 one stream frame reloads every hook on the workspace ONCE each, from one timer', async () => {
    const d = drivable();
    const counts = { a: 0, b: 0 };
    const a = renderHook(() => useLiveQuery(d.source, 'ws', 'a', async () => { counts.a += 1; return counts.a; }, 50));
    const b = renderHook(() => useLiveQuery(d.source, 'ws', 'b', async () => { counts.b += 1; return counts.b; }, 50));
    await waitFor(() => expect(a.result.current.data).toBe(1));
    await waitFor(() => expect(b.result.current.data).toBe(1));
    act(() => { d.fire({ type: 'event', workspaceId: 'ws', envelope: {} as never } as ClientStreamFrame); d.fire({ type: 'event', workspaceId: 'ws', envelope: {} as never } as ClientStreamFrame); });
    await waitFor(() => expect(a.result.current.data).toBe(2));
    await waitFor(() => expect(b.result.current.data).toBe(2));
    await new Promise((r) => setTimeout(r, 120));
    expect(counts).toEqual({ a: 2, b: 2 }); // two frames → one wave, not two per hook
  });
});
```

Also in `live-query-cache.test.tsx` (review focus 2):

```tsx
  it('25.028 sign-out empties the cache: a fresh mount after clearLiveQueryCache serves null, never the first person\'s board', async () => {
    const { source } = drivable();
    const first = renderHook(() => useLiveQuery(source, 'ws', 'prj', async () => ({ groups: ['kiro'] }), { cacheKey: 'board:prj' }));
    await waitFor(() => expect(first.result.current.data).toEqual({ groups: ['kiro'] }));
    first.unmount();
    clearLiveQueryCache(); // what AccountMenu's sign-out and the 401 redirect call (T3 Step 6)
    const second = renderHook(() => useLiveQuery(source, 'ws', 'prj', () => new Promise<never>(() => {}), { cacheKey: 'board:prj' }));
    expect(second.result.current.data).toBeNull();
    // Control: without the clear, the same mount serves the cached board.
    rememberLiveQuery('ws\u0000board:prj', { groups: ['kiro'] });
    const third = renderHook(() => useLiveQuery(source, 'ws', 'prj', () => new Promise<never>(() => {}), { cacheKey: 'board:prj' }));
    expect(third.result.current.data).toEqual({ groups: ['kiro'] });
  });
```

(Keys in this file are spelled with the `ws\u0000` prefix T4 introduces; 25.022's `rememberLiveQuery` calls use it too.)

(`packages/app-core/test/inflight-dedupe.test.ts`)

```ts
import { describe, expect, it } from 'vitest';
import type { DataSource } from '../src/data-source.js';
import { withInflightDedupe } from '../src/inflight-dedupe.js';

describe('withInflightDedupe (spec §3.2; audit SM-05)', () => {
  it('25.025 two identical reads in flight share one call; a different argument, or a read after settlement, is a new call', async () => {
    let calls = 0;
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const source = {
      ingest: async () => [],
      subscribe: () => () => undefined,
      query: { getMembers: async (ws: string) => { calls += 1; await gate; return [{ id: ws }]; } },
    } as unknown as DataSource;
    const deduped = withInflightDedupe(source);
    const p1 = deduped.query.getMembers('ws1');
    const p2 = deduped.query.getMembers('ws1');
    const p3 = deduped.query.getMembers('ws2');
    expect(calls).toBe(2);
    release();
    expect(await p1).toEqual(await p2);
    await p3;
    await deduped.query.getMembers('ws1');
    expect(calls).toBe(3);
    // Control: the undecorated source makes a call per read.
    await Promise.all([source.query.getMembers('ws1'), source.query.getMembers('ws1')]);
    expect(calls).toBe(5);
  });
});
```

(`packages/app-core/test/online/roster-burst.test.ts`: build the online source with a counting `fetch` the way `packages/app-core/test/online/online-data-source.test.ts` does — reuse its fixture builder — then)

```ts
it('25.026 two board reads inside one second join the roster ONCE; a read a second later joins again', async () => {
  const { source, hits } = fixture(); // counts GET /v1/workspaces/:ws/members
  await Promise.all([source.query.getBoard('prj'), source.query.getBoard('prj')]);
  expect(hits('/members')).toBe(1);
  vi.advanceTimersByTime(ROSTER_BURST_MS + 1);
  await source.query.getBoard('prj');
  expect(hits('/members')).toBe(2);
});
```

- [ ] **Step 2: Run to see RED**

Run: `cd <worktree>/packages/app-core && pnpm exec vitest run test/views/live-query-cache.test.tsx test/inflight-dedupe.test.ts test/online/roster-burst.test.ts 2>&1 | tail -20`
Expected: FAIL — modules not found; 25.024 sees four loads.

- [ ] **Step 3: Implement the cache and the scheduler**

```ts
// packages/app-core/src/views/live-query-cache.ts
export const LIVE_QUERY_CACHE_TTL_MS = 10 * 60_000;
export const LIVE_QUERY_CACHE_MAX = 200;

type Entry = { data: unknown; at: number };
const entries = new Map<string, Entry>();

/** The last answer for `key`, if younger than the TTL. Insertion order is recency: a hit is re-inserted. */
export function recallLiveQuery<T>(key: string, now: number = Date.now()): T | undefined {
  const entry = entries.get(key);
  if (entry === undefined) return undefined;
  if (now - entry.at > LIVE_QUERY_CACHE_TTL_MS) {
    entries.delete(key);
    return undefined;
  }
  entries.delete(key);
  entries.set(key, entry);
  return entry.data as T;
}

export function rememberLiveQuery<T>(key: string, data: T, now: number = Date.now()): void {
  entries.delete(key);
  entries.set(key, { data, at: now });
  while (entries.size > LIVE_QUERY_CACHE_MAX) {
    const oldest = entries.keys().next().value;
    if (oldest === undefined) break;
    entries.delete(oldest);
  }
}

export function liveQueryAgeMs(key: string, now: number = Date.now()): number | null {
  const entry = entries.get(key);
  return entry === undefined ? null : now - entry.at;
}

/** Sign-out and the 401 redirect call this: a cache is per person, never per device. */
export function clearLiveQueryCache(): void {
  entries.clear();
}
```

```ts
// packages/app-core/src/views/reload-scheduler.ts
type Room = { reloads: Set<() => void>; timer: ReturnType<typeof setTimeout> | null };
const rooms = new Map<string, Room>();

function roomOf(workspaceId: string): Room {
  let room = rooms.get(workspaceId);
  if (room === undefined) {
    room = { reloads: new Set(), timer: null };
    rooms.set(workspaceId, room);
  }
  return room;
}

/** Register a hook's reload for the workspace's wave. Returns the unsubscribe. */
export function subscribeReloads(workspaceId: string, reload: () => void): () => void {
  const room = roomOf(workspaceId);
  room.reloads.add(reload);
  return () => {
    room.reloads.delete(reload);
    if (room.reloads.size === 0) {
      if (room.timer !== null) clearTimeout(room.timer);
      rooms.delete(workspaceId);
    }
  };
}

/** A frame arrived: ONE timer per workspace, restarted by every frame, fires every registered reload once. */
export function scheduleReload(workspaceId: string, debounceMs: number): void {
  const room = roomOf(workspaceId);
  if (room.timer !== null) clearTimeout(room.timer);
  room.timer = setTimeout(() => {
    room.timer = null;
    for (const reload of room.reloads) reload();
  }, debounceMs);
}
```

- [ ] **Step 4: Thread them through `useLiveQuery`**

Replace the signature (`use-live-query.ts:84-91`) and the state init (`:90`):

```ts
export type LiveQueryOptions<T> = { debounceMs?: number; initial?: { key: string; data: T }; cacheKey?: string };

export function useLiveQuery<T>(
  source: DataSource,
  workspaceId: string,
  queryKey: string,
  load: () => Promise<T>,
  options: number | LiveQueryOptions<T> = 200,
  legacyInitial?: { key: string; data: T },
): LiveQueryResult<T> {
  const opts: LiveQueryOptions<T> = typeof options === 'number' ? { debounceMs: options, initial: legacyInitial } : options;
  const debounceMs = opts.debounceMs ?? 200;
  const initial = opts.initial;
  const cacheKey = opts.cacheKey;
  const cacheKeyRef = useRef(cacheKey);
  cacheKeyRef.current = cacheKey;
  const [data, setData] = useState<T | null>(() => (cacheKey === undefined ? null : (recallLiveQuery<T>(cacheKey) ?? null)));
```

In `reload`'s resolve branch (where `setData(value)` runs for the current load) add, before `setData`: `if (cacheKeyRef.current !== undefined) rememberLiveQuery(cacheKeyRef.current, value);`.

Replace the key effect (`:160-166`):

```ts
  useEffect(() => {
    // A new question clears the old answer before it asks — unless the cache holds THIS
    // question's last answer, which is served stale and replaced when the read lands (S4).
    setData(cacheKey === undefined ? null : (recallLiveQuery<T>(cacheKey) ?? null));
    setError(null);
    setSettled(false);
    reload();
  }, [source, workspaceId, queryKey, cacheKey, reload]);
```

Replace the subscription effect (`:169-186`) so the timer is the workspace's, not the hook's:

```ts
  useEffect(() => {
    const unregister = subscribeReloads(workspaceId, reload);
    const unsubscribe = source.subscribe(workspaceId, 0, (item) => {
      if (item.type !== 'event' && item.type !== 'purge' && item.type !== 'refresh') return;
      scheduleReload(workspaceId, debounceMs);
    });
    return () => {
      unsubscribe();
      unregister();
    };
  }, [source, workspaceId, debounceMs, reload]);
```

- [ ] **Step 5: `withInflightDedupe` and the roster burst**

```ts
// packages/app-core/src/inflight-dedupe.ts
import type { DataSource, DataSourceQuery } from './data-source.js';

/** Identical reads in flight share one promise. Keyed by method + JSON args; writes are untouched. */
export function withInflightDedupe(source: DataSource): DataSource {
  const inflight = new Map<string, Promise<unknown>>();
  const query = {} as Record<string, (...args: unknown[]) => Promise<unknown>>;
  for (const [name, fn] of Object.entries(source.query) as Array<[string, (...args: unknown[]) => Promise<unknown>]>) {
    query[name] = (...args: unknown[]) => {
      const key = `${name}\u0000${JSON.stringify(args)}`;
      const hit = inflight.get(key);
      if (hit !== undefined) return hit;
      const promise = fn.apply(source.query, args).finally(() => inflight.delete(key));
      inflight.set(key, promise);
      return promise;
    };
  }
  return { ingest: (events) => source.ingest(events), query: query as unknown as DataSourceQuery, subscribe: (ws, after, cb) => source.subscribe(ws, after, cb) };
}
```

In `online-data-source.ts`, above `workspaceRoster` (`:150`):

```ts
  /** One roster join per workspace per second (FD7): "fresh per read" became "fresh per burst". */
  export const ROSTER_BURST_MS = 1000;
  const rosterBurst = new Map<string, { at: number; promise: Promise<Map<string, string>> }>();
  async function workspaceRoster(workspaceId: string): Promise<Map<string, string>> {
    const now = Date.now();
    const hit = rosterBurst.get(workspaceId);
    if (hit !== undefined && now - hit.at < ROSTER_BURST_MS) return hit.promise;
    const promise = (async () => {
      const [raw, names] = await Promise.all([http.get(`/v1/workspaces/${workspaceId}/members`), actorNames(workspaceId)]);
      return withActorNames(raw === null ? new Map() : rosterByActorId(mapActors(raw)), names);
    })();
    rosterBurst.set(workspaceId, { at: now, promise });
    return promise;
  }
```

Rewrite the docblock at `:134-150`: "fetched at most once per second per workspace; a membership revoked mid-second is named for under a second". Export `ROSTER_BURST_MS` from the module (move `export const` to module scope, not inside the factory). Export the three new modules from `packages/app-core/src/index.ts`.

- [ ] **Step 6: Compose the dedupe in the web shell** (`apps/web/src/providers.tsx:140`): `withSignInOnExpiredWrite(withInflightDedupe(withCacheFeed(online, cache)), …)`; call `clearLiveQueryCache()` inside `withSignInOnExpiredWrite`'s redirect callback and in `AccountMenu`'s sign-out success path (`apps/web/src/account-menu.tsx`, grep `signOut`).

- [ ] **Step 7: Run the suites**

Run: `cd <worktree>/packages/app-core && pnpm build && pnpm exec vitest run 2>&1 | tail -15 && pnpm typecheck && cd ../../apps/web && pnpm exec vitest run test/app-nav.test.tsx test/page-refusals.test.tsx 2>&1 | tail -8`
Expected: PASS, including the existing `use-live-query.test.tsx` (12.321, 18.092) and 18.461's `initial` cases.

- [ ] **Step 8: Catalogue and commit**

Cases 25.021–25.026 ✅; Features §22 bullet "⚙️ **A read cache, in-flight dedupe and one reload wave** (smoothness T3; audit SM-01, SM-05; cases 25.021–25.026; `packages/app-core/src/views/live-query-cache.ts`, `reload-scheduler.ts`, `use-live-query.ts`, `inflight-dedupe.ts`, `online/online-data-source.ts`)".

```bash
git add packages/app-core/src/views/live-query-cache.ts packages/app-core/src/views/reload-scheduler.ts packages/app-core/src/views/use-live-query.ts packages/app-core/src/inflight-dedupe.ts packages/app-core/src/online/online-data-source.ts packages/app-core/src/index.ts packages/app-core/test/views/live-query-cache.test.tsx packages/app-core/test/inflight-dedupe.test.ts packages/app-core/test/online/roster-burst.test.ts apps/web/src/providers.tsx apps/web/src/account-menu.tsx test-cases/25-smoothness.md Features.md
git commit -m "Smoothness T3: live-query cache (SWR), in-flight dedupe, one reload wave per workspace (cases 25.021-25.026)"
```

---

### Task 4: One workspaces read on the web, the last user id, and freshness

**Parallel-safe with neo: yes.**

**Files:**
- Create: `apps/web/src/use-my-workspaces.ts`, `apps/web/src/last-user-id.ts`, `apps/web/src/freshness.ts`
- Modify: `apps/web/src/use-workspace-name.ts:70-116` (`useWorkspaceLookup` reads the shared hook; `nameCache` and `clearWorkspaceNameCache` stay for the tests that import them), `apps/web/src/use-workspace-projects.ts:111-160`, `apps/web/src/use-project-name.ts:41-70`, `apps/web/src/providers.tsx:300-315` (`resolveSession` writes/clears the last user id), `apps/web/src/inbox-nav-link.tsx:98-128` (`useInboxUnread` pauses while hidden), `apps/web/src/providers.tsx` (mount `useFreshness()` once inside `Providers`)
- Test: `apps/web/test/use-my-workspaces.test.tsx`, `apps/web/test/last-user-id.test.ts`, `apps/web/test/freshness.test.tsx`, `apps/web/test/inbox-nav-link.test.tsx` (one new case)

**Interfaces, produces:**
- `useMyWorkspaces(): { rows: WorkspaceRef[] | null; error: string | null; reload: () => void }` — one module-level `{ userId, promise, rows }`; the first caller for a user starts the read, every later caller shares it; `clearMyWorkspacesCache()`.
- `readLastUserId(): string | null`, `rememberLastUserId(id: string | null): void` (`localStorage['gn-last-user-id']`).
- `useFreshness(dataSource)`: on `visibilitychange` → visible, `focus`, and the stream's reconnect (`refresh` frames already exist; a `caught-up` after a gap counts), every cache entry older than `STALE_AFTER_MS = 30_000` is reloaded through `scheduleReload(workspaceId, 0)`.

- [ ] **Step 1: Failing tests** (`apps/web/test/use-my-workspaces.test.tsx`)

```tsx
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { Providers } from '../src/providers.js';
import { stubServices } from './helpers/stub-services.js';
import { clearMyWorkspacesCache, useMyWorkspaces } from '../src/use-my-workspaces.js';

let mockUser: { id: string; name: string } | null = { id: 'u_kiro', name: 'Kiro' };
vi.mock('../src/auth-client.js', () => ({
  authClient: { useSession: () => ({ data: mockUser === null ? null : { user: mockUser }, isPending: false }), signOut: async () => ({ data: {}, error: null }) },
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => '/workspaces', useParams: () => ({}), useSearchParams: () => new URLSearchParams() }));

describe('useMyWorkspaces — ONE read per person per page (audit SM-05; spec §3.2)', () => {
  beforeEach(() => { clearMyWorkspacesCache(); mockUser = { id: 'u_kiro', name: 'Kiro' }; });

  it('25.041 three consumers mounted together make one getMyWorkspaces call and all see the rows', async () => {
    const getMyWorkspaces = vi.fn(async () => [{ id: 'ws1', name: 'Shop', prefix: 'SH', role: 'owner', archived: false, memberCount: 1 }]);
    const services = stubServices({ getMyWorkspaces }, { notifications: { unreadCount: async () => 0 } });
    const wrapper = ({ children }: { children: ReactNode }) => <Providers services={services}>{children}</Providers>;
    const a = renderHook(() => useMyWorkspaces(), { wrapper });
    const b = renderHook(() => useMyWorkspaces(), { wrapper });
    const c = renderHook(() => useMyWorkspaces(), { wrapper });
    await waitFor(() => expect(c.result.current.rows?.[0]?.name).toBe('Shop'));
    expect(a.result.current.rows).toBe(b.result.current.rows);
    expect(getMyWorkspaces).toHaveBeenCalledTimes(1);
  });

  it('25.044 another person signing in on the same device never sees the first person\'s rows', async () => {
    const first = vi.fn(async () => [{ id: 'ws1', name: 'Kiro only', prefix: 'K', role: 'owner', archived: false, memberCount: 1 }]);
    const services = stubServices({ getMyWorkspaces: first }, { notifications: { unreadCount: async () => 0 } });
    const wrapper = ({ children }: { children: ReactNode }) => <Providers services={services}>{children}</Providers>;
    const a = renderHook(() => useMyWorkspaces(), { wrapper });
    await waitFor(() => expect(a.result.current.rows?.[0]?.name).toBe('Kiro only'));
    a.unmount();
    mockUser = { id: 'u_other', name: 'Other' };
    const second = vi.fn(async () => []);
    const services2 = stubServices({ getMyWorkspaces: second }, { notifications: { unreadCount: async () => 0 } });
    const wrapper2 = ({ children }: { children: ReactNode }) => <Providers services={services2}>{children}</Providers>;
    const b = renderHook(() => useMyWorkspaces(), { wrapper: wrapper2 });
    expect(b.result.current.rows).toBeNull(); // first render: nothing from u_kiro
    await waitFor(() => expect(b.result.current.rows).toEqual([]));
    expect(second).toHaveBeenCalledTimes(1);
  });
});
```

(`apps/web/test/last-user-id.test.ts`)

```ts
import { describe, expect, it } from 'vitest';
import { readLastUserId, rememberLastUserId } from '../src/last-user-id.js';
import { readProjectTab, rememberProjectTab } from '../src/use-last-project.js';

describe('the last user id lets the remembered tab answer before the session does (spec D9; audit SM-02)', () => {
  it('25.042 a tab remembered for u_kiro is readable through the stored id, and NOT after the id is cleared', () => {
    rememberLastUserId('u_kiro');
    rememberProjectTab('prj', 'list', 'u_kiro');
    expect(readProjectTab('prj', readLastUserId())).toBe('list');
    rememberLastUserId(null);
    expect(readLastUserId()).toBeNull();
    expect(readProjectTab('prj', readLastUserId())).toBeNull();
  });
});
```

(`apps/web/test/freshness.test.tsx`)

```tsx
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearLiveQueryCache, rememberLiveQuery, subscribeReloads } from '@gisik-nokma/app-core';
import { STALE_AFTER_MS, useFreshness } from '../src/freshness.js';

describe('useFreshness — stale entries refetch on focus and on reconnect (spec D13; audit SM-15)', () => {
  beforeEach(() => { vi.useFakeTimers(); clearLiveQueryCache(); });
  afterEach(() => vi.useRealTimers());

  it('25.045 focus after 30 s reloads the workspace\'s hooks; focus after 5 s does not', () => {
    const reload = vi.fn();
    const stop = subscribeReloads('ws', reload);
    rememberLiveQuery('ws\u0000board:prj', {}, Date.now());
    renderHook(() => useFreshness());
    vi.advanceTimersByTime(5_000);
    act(() => { document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('focus')); });
    vi.runOnlyPendingTimers();
    expect(reload).not.toHaveBeenCalled();
    vi.advanceTimersByTime(STALE_AFTER_MS);
    act(() => { window.dispatchEvent(new Event('focus')); });
    vi.runOnlyPendingTimers();
    expect(reload).toHaveBeenCalledTimes(1);
    stop();
  });
});
```

Add to `apps/web/test/inbox-nav-link.test.tsx`:

```tsx
it('25.046 the badge does not poll while the document is hidden, and polls again when it is shown', async () => {
  vi.useFakeTimers();
  const unreadCount = vi.fn(async () => 2);
  render(<Providers services={stubServices({}, { notifications: { unreadCount } })}><InboxNavLink active={false} /></Providers>);
  await act(async () => { await Promise.resolve(); });
  expect(unreadCount).toHaveBeenCalledTimes(1);
  Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
  await act(async () => { vi.advanceTimersByTime(REFRESH_MS * 2); });
  expect(unreadCount).toHaveBeenCalledTimes(1);
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  await act(async () => { document.dispatchEvent(new Event('visibilitychange')); await Promise.resolve(); });
  expect(unreadCount).toHaveBeenCalledTimes(2);
  vi.useRealTimers();
});
```

- [ ] **Step 2: RED**

Run: `cd <worktree>/apps/web && pnpm exec vitest run test/use-my-workspaces.test.tsx test/last-user-id.test.ts test/freshness.test.tsx test/inbox-nav-link.test.tsx 2>&1 | tail -20`
Expected: FAIL — modules missing; 25.046 sees three calls.

- [ ] **Step 3: Implement**

```ts
// apps/web/src/last-user-id.ts
const KEY = 'gn-last-user-id';
export function readLastUserId(): string | null {
  try { return window.localStorage.getItem(KEY); } catch { return null; }
}
export function rememberLastUserId(id: string | null): void {
  try { if (id === null) window.localStorage.removeItem(KEY); else window.localStorage.setItem(KEY, id); } catch { /* storage refused: the session still answers */ }
}
```

In `providers.tsx` `resolveSession` (`:300-315`): after `lastKnownUser = {...}` add `rememberLastUserId(user.id);`; in the signed-out arm (`lastKnownUser = null;`) add `rememberLastUserId(null);` (guarded by `typeof window !== 'undefined'`).

```ts
// apps/web/src/use-my-workspaces.ts
'use client';
import { useCallback, useEffect, useState } from 'react';
import type { WorkspaceRef } from '@gisik-nokma/app-core';
import { useAppServices, useSessionStatus } from './providers.js';

type Shared = { userId: string; promise: Promise<WorkspaceRef[]>; rows: WorkspaceRef[] | null; error: string | null; listeners: Set<() => void> };
let shared: Shared | null = null;

export function clearMyWorkspacesCache(): void { shared = null; }

function start(userId: string, read: () => Promise<WorkspaceRef[]>): Shared {
  const entry: Shared = { userId, promise: read(), rows: null, error: null, listeners: new Set() };
  entry.promise.then(
    (rows) => { if (shared === entry) { entry.rows = rows; entry.error = null; entry.listeners.forEach((l) => l()); } },
    (cause: unknown) => { if (shared === entry) { entry.error = cause instanceof Error ? cause.message : String(cause); entry.listeners.forEach((l) => l()); } },
  );
  shared = entry;
  return entry;
}

/** The ONE `getMyWorkspaces` read per signed-in person per page; every nav hook and page reads it (FD5). */
export function useMyWorkspaces(): { rows: WorkspaceRef[] | null; error: string | null; reload: () => void } {
  const { dataSource } = useAppServices();
  const session = useSessionStatus();
  const userId = session.kind === 'signed-in' ? session.user.id : null;
  const [, bump] = useState(0);
  const read = useCallback(() => dataSource.query.getMyWorkspaces(), [dataSource]);

  useEffect(() => {
    if (userId === null) return undefined;
    const entry = shared !== null && shared.userId === userId ? shared : start(userId, read);
    const listener = () => bump((n) => n + 1);
    entry.listeners.add(listener);
    if (entry.rows !== null || entry.error !== null) listener();
    return () => { entry.listeners.delete(listener); };
  }, [userId, read]);

  const current = userId !== null && shared !== null && shared.userId === userId ? shared : null;
  const reload = useCallback(() => { if (userId !== null) { start(userId, read); bump((n) => n + 1); } }, [userId, read]);
  return { rows: current?.rows ?? null, error: current?.error ?? null, reload };
}
```

`useWorkspaceLookup` (`use-workspace-name.ts:70-116`) becomes: `const { rows } = useMyWorkspaces(); const found = rows?.find((r) => r.id === workspaceId)?.name ?? null;` keeping the `nameCache` write/evict on a resolved `rows` and the `others` filter; `useWorkspaceProjects` and `useProjectName` read `rows` the same way. `clearMyWorkspacesCache()` is called beside `clearLiveQueryCache()` (T3 Step 6).

```ts
// apps/web/src/freshness.ts
'use client';
import { useEffect } from 'react';
import { liveQueryAgeMs, scheduleReload } from '@gisik-nokma/app-core';
export const STALE_AFTER_MS = 30_000;
/** Spec D13: every workspace with a stale cached answer gets one reload wave on focus/visible/reconnect. */
export function useFreshness(): void {
  useEffect(() => {
    const wake = () => {
      if (document.visibilityState === 'hidden') return;
      for (const workspaceId of staleWorkspaces(Date.now())) scheduleReload(workspaceId, 0);
    };
    window.addEventListener('focus', wake);
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('online', wake);
    return () => { window.removeEventListener('focus', wake); document.removeEventListener('visibilitychange', wake); window.removeEventListener('online', wake); };
  }, []);
}
```

`staleWorkspaces(now)` is a new export of `live-query-cache.ts` (T3's file; add it here): it returns the distinct `workspaceId` prefix of every key older than `STALE_AFTER_MS`, which requires cache keys to carry the workspace: `useLiveQuery` stores under `` `${workspaceId}\u0000${cacheKey}` `` (amend T3's `recallLiveQuery`/`rememberLiveQuery` call sites in the hook to prefix, and 25.045's key spells that prefix). Mount `useFreshness()` in `Providers`' body. In `useInboxUnread` (`inbox-nav-link.tsx:104-127`): the interval callback returns early when `document.visibilityState === 'hidden'`, and a `visibilitychange` listener calls `refresh()` when it becomes visible.

- [ ] **Step 4: GREEN, then the nav suites**

Run: `cd <worktree>/apps/web && pnpm exec vitest run test/use-my-workspaces.test.tsx test/last-user-id.test.ts test/freshness.test.tsx test/inbox-nav-link.test.tsx test/app-nav.test.tsx test/last-project-nav.test.tsx test/nav-hover-menu.test.tsx 2>&1 | tail -15 && pnpm typecheck`
Expected: PASS (the nav cases 23.254–23.257 keep holding through the shared read).

- [ ] **Step 5: Catalogue and commit**

Cases 25.041, 25.042, 25.044, 25.045, 25.046 ✅; Features §22 bullet "⚙️ **One workspaces read, the last user id, freshness on focus** (smoothness T4; audit SM-05, SM-08, SM-15; `apps/web/src/use-my-workspaces.ts`, `last-user-id.ts`, `freshness.ts`, `inbox-nav-link.ts`)".

```bash
git add apps/web/src/use-my-workspaces.ts apps/web/src/last-user-id.ts apps/web/src/freshness.ts apps/web/src/use-workspace-name.ts apps/web/src/use-workspace-projects.ts apps/web/src/use-project-name.ts apps/web/src/providers.tsx apps/web/src/inbox-nav-link.tsx packages/app-core/src/views/live-query-cache.ts packages/app-core/src/views/use-live-query.ts apps/web/test/use-my-workspaces.test.tsx apps/web/test/last-user-id.test.ts apps/web/test/freshness.test.tsx apps/web/test/inbox-nav-link.test.tsx test-cases/25-smoothness.md Features.md
git commit -m "Smoothness T4: one workspaces read, gn-last-user-id, refetch on focus, badge pauses hidden (cases 25.041-25.046)"
```

---

### Task 5: Route shells (`loading.tsx`), the nav skeleton and link pending hints

> **Amendment S-R1 (2026-10-02): structural skeletons.** Owner ruling 2026-10-02 ~21:00: *"can the skeleton take at least the shape of what the actual element would look like?"*, then **"Yes, structural skeletons."** Spec `docs/superpowers/specs/2026-10-02-smoothness-design.md` § "Amendment S-R1" (rules 1–5). The task body below is NOT rewritten; where it says a generic shape, a `card`, or `var(--gn-surface-track)`, this note wins. For this task: the route shells' skeletons and the nav skeleton (`AppNavSkeleton`) render the real shell and nav container classes, with parts for the labels and links. **Tests** assert (a) the skeleton uses the component's own container class and (b) no skeleton fill is the well (`neoWellLight` / `neoWellDark`; the role is `surfacePlaceholder`, from T2). The skeleton copies the content's box by being that box (S1); it names no container style of its own, and §4.3's style-neutral test stands.

**Parallel-safe with neo: yes** (`globals.css` appended after its last rule, line 5657 at `4f86b959`).

**Files:**
- Create: `apps/web/src/skeletons/app-nav-skeleton.tsx`, `apps/web/src/skeletons/page-shells.tsx` (`ListPageShell`, `FormPageShell`, `ProjectPageSkeleton`, `NotesPageShell`), `apps/web/src/nav-pending.tsx`
- Create: `apps/web/app/workspaces/loading.tsx`, `app/w/[workspaceId]/loading.tsx`, `app/w/[workspaceId]/p/[projectId]/loading.tsx`, `app/w/[workspaceId]/my-work/loading.tsx`, `app/w/[workspaceId]/members/loading.tsx`, `app/w/[workspaceId]/settings/loading.tsx` (covers its children), `app/inbox/loading.tsx`, `app/notes/loading.tsx`, `app/notes/[noteId]/loading.tsx`, `app/account/loading.tsx`, `app/settings/loading.tsx`
- Modify: `apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx:133-137` (the fallback becomes `<ProjectPageSkeleton />`), `app/settings/page.tsx:163`, `app/notes/[noteId]/page.tsx:27`, `app/notes/page.tsx` (its boundary), `app/sign-in/page.tsx:22` (a centred `FormPageShell`), `apps/web/src/app-nav.tsx` (each `<Link>` wraps its label in `<NavPending>`), `apps/web/src/last-project-nav.tsx`, `apps/web/src/bottom-bar.tsx` (the four slot links), `apps/web/app/globals.css` (append)
- Test: `apps/web/test/route-shells.test.tsx`, `apps/web/test/nav-pending.test.tsx`, `apps/web/test/shell-css.test.ts`

**Interfaces, produces:**
- `AppNavSkeleton()` → `<nav class="gn-nav gn-nav--skeleton" aria-busy="true">` with the brand mark and three `Skeleton line`s in the row, no links.
- `ProjectPageSkeleton({ tab?: ProjectTab })` → `<main class="gn-shell gn-shell--wide gn-shell--skeleton" aria-busy="true">` with `AppNavSkeleton`, a breadcrumb line (`height 1rem, width 14rem`), a title line (`height var(--gn-title-page-size)`, width 18rem), five tab blocks (`2.25rem × 5rem`), a toolbar line, then: `board` → `.gn-board__rail` with three `.gn-board__column`s each holding three `Skeleton card`; `list`/`backlog` → eight `Skeleton block` rows of `3rem`; `calendar` → a `block` of `32rem`; `timeline` → six rows of `2.5rem`.
- `ListPageShell({ title: string; rows?: number })`, `FormPageShell({ title })`, `NotesPageShell()` (tree column + document column).
- `NavPending({ children })` → `<span class="gn-nav__pending" data-pending={pending}>` from `useLinkStatus()`.

- [ ] **Step 1: Failing tests** (`apps/web/test/route-shells.test.tsx`)

```tsx
import { render } from '@testing-library/react';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ProjectPageSkeleton, ListPageShell } from '../src/skeletons/page-shells.js';
import ProjectLoading from '../app/w/[workspaceId]/p/[projectId]/loading.js';

const APP = join(__dirname, '..', 'app');
const ROUTES_WITH_SHELLS = ['workspaces', 'w/[workspaceId]', 'w/[workspaceId]/p/[projectId]', 'w/[workspaceId]/my-work', 'w/[workspaceId]/members', 'w/[workspaceId]/settings', 'inbox', 'notes', 'notes/[noteId]', 'account', 'settings'];

describe('route shells (spec D5, S1; audit SM-02)', () => {
  it('25.051 every signed-in route segment has a loading.tsx; the sign-in and legal routes do not', () => {
    for (const route of ROUTES_WITH_SHELLS) expect(existsSync(join(APP, route, 'loading.tsx')), route).toBe(true);
    for (const route of ['sign-in', 'privacy', 'terms', 'invite/[token]']) expect(existsSync(join(APP, route, 'loading.tsx')), route).toBe(false);
  });

  it('25.052 the project shell keeps the fallback\'s classes (23.040), is busy, has no link or button, and draws the remembered tab\'s shape', () => {
    const { container } = render(<ProjectPageSkeleton tab="list" />);
    const main = container.querySelector('main')!;
    expect(main.className).toContain('gn-shell gn-shell--wide');
    expect(main).toHaveAttribute('aria-busy', 'true');
    expect(main.querySelectorAll('a, button, input')).toHaveLength(0);
    expect(main.querySelectorAll('.gn-skeleton--block')).toHaveLength(8);
    // Control: the board tab draws three columns of three cards and no rows.
    const board = render(<ProjectPageSkeleton tab="board" />).container;
    expect(board.querySelectorAll('.gn-board__column')).toHaveLength(3);
    expect(board.querySelectorAll('.gn-skeleton--card')).toHaveLength(9);
    expect(board.querySelectorAll('.gn-skeleton--block')).toHaveLength(0);
  });

  it('25.053 loading.tsx for the project route renders the SAME shell component as the page\'s Suspense fallback', () => {
    const fromRoute = render(<ProjectLoading />).container.innerHTML;
    const fromShell = render(<ProjectPageSkeleton />).container.innerHTML;
    expect(fromRoute).toBe(fromShell);
    const list = render(<ListPageShell title="Members" rows={5} />).container;
    expect(list.querySelector('nav.gn-nav--skeleton')).not.toBeNull();
    expect(list.querySelectorAll('.gn-skeleton--block')).toHaveLength(5);
  });
});
```

(`apps/web/test/nav-pending.test.tsx`)

```tsx
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
let pending = false;
vi.mock('next/link', async () => {
  const actual = await vi.importActual<typeof import('next/link')>('next/link');
  return { ...actual, useLinkStatus: () => ({ pending }) };
});
import { NavPending } from '../src/nav-pending.js';

describe('NavPending — a fixed-size, opacity-only hint from useLinkStatus (spec P10; audit SM-02)', () => {
  it('25.054 the wrapper carries data-pending from the link status and never changes its children', () => {
    pending = true;
    const on = render(<NavPending>Inbox</NavPending>).container.firstElementChild!;
    expect(on).toHaveAttribute('data-pending', 'true');
    expect(on.textContent).toBe('Inbox');
    pending = false;
    const off = render(<NavPending>Inbox</NavPending>).container.firstElementChild!;
    expect(off).toHaveAttribute('data-pending', 'false');
  });
});
```

(`apps/web/test/shell-css.test.ts`)

```ts
import { describe, expect, it } from 'vitest';
import { ruleExactly, valueOf } from '../../../packages/ui/test/helpers/css-rules.js';
import { readGlobalsCss } from '../../../packages/ui/test/helpers/style-patterns.js';
const css = readGlobalsCss();
describe('shell CSS for placeholders (spec S1, P10)', () => {
  it('25.055 the nav reserves its height; the pending hint animates opacity only after a 100ms delay; reduced motion keeps it static', () => {
    expect(valueOf(ruleExactly(css, '.gn-nav--skeleton'), 'min-height')).toBe('var(--gn-nav-height)');
    const hint = ruleExactly(css, '.gn-nav__pending[data-pending="true"]');
    expect(valueOf(hint, 'animation')).toBe('gnPulse 1600ms var(--gn-motion-ease-out) 100ms infinite');
    expect(valueOf(hint, 'transform')).toBeNull();
    expect(valueOf(ruleExactly(css, '.gn-nav__pending[data-pending="true"]', '@media (prefers-reduced-motion: reduce)'), 'animation')).toBe('none');
  });
});
```

- [ ] **Step 2: RED**

Run: `cd <worktree>/apps/web && pnpm exec vitest run test/route-shells.test.tsx test/nav-pending.test.tsx test/shell-css.test.ts 2>&1 | tail -20`
Expected: FAIL — files missing.

- [ ] **Step 3: Implement the shells**

```tsx
// apps/web/src/skeletons/app-nav-skeleton.tsx
import { Skeleton } from '@gisik-nokma/ui';
import { NavBrand } from '../nav-brand.js';
export function AppNavSkeleton() {
  return (
    <nav className="gn-nav gn-nav--skeleton" aria-busy="true" aria-label="Navigation, loading">
      <div className="gn-nav__inner">
        <NavBrand />
        <Skeleton width="6rem" height="1rem" />
        <Skeleton width="8rem" height="1rem" />
        <span className="gn-nav__corner"><Skeleton shape="circle" width="2rem" height="2rem" /></span>
      </div>
    </nav>
  );
}
```

```tsx
// apps/web/src/skeletons/page-shells.tsx
import { Skeleton, SkeletonRegion } from '@gisik-nokma/ui';
import type { ProjectTab } from '@gisik-nokma/app-core';
import { AppNavSkeleton } from './app-nav-skeleton.js';

export function ProjectPageSkeleton({ tab = 'board' }: { tab?: ProjectTab }) {
  return (
    <main className="gn-shell gn-shell--wide gn-shell--skeleton" aria-busy="true">
      <AppNavSkeleton />
      <SkeletonRegion label="Loading the project">
        <Skeleton width="14rem" height="1rem" />
        <Skeleton className="gn-project__title-skeleton" width="18rem" height="var(--gn-title-page-size)" />
        <div className="gn-project__tabs-skeleton">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} shape="block" width="5rem" height="2.25rem" />)}</div>
        <Skeleton width="100%" height="2.75rem" />
        {tab === 'board' ? (
          <div className="gn-board__rail">{[0, 1, 2].map((c) => (
            <section key={c} className="gn-board__column"><Skeleton width="7rem" height="1rem" /><Skeleton shape="card" rows={3} /></section>
          ))}</div>
        ) : tab === 'calendar' ? (
          <Skeleton shape="block" height="32rem" />
        ) : tab === 'timeline' ? (
          <Skeleton shape="block" height="2.5rem" rows={6} />
        ) : (
          <Skeleton shape="block" height="3rem" rows={8} />
        )}
      </SkeletonRegion>
    </main>
  );
}

export function ListPageShell({ title, rows = 6, wide = false }: { title: string; rows?: number; wide?: boolean }) {
  return (
    <main className={wide ? 'gn-shell gn-shell--wide gn-shell--skeleton' : 'gn-shell gn-shell--skeleton'} aria-busy="true">
      <AppNavSkeleton />
      <SkeletonRegion label={`Loading ${title}`}>
        <Skeleton width="12rem" height="var(--gn-title-page-size)" />
        <Skeleton width="60%" height="1rem" />
        <Skeleton shape="block" height="3rem" rows={rows} />
      </SkeletonRegion>
    </main>
  );
}

export function FormPageShell({ title, centred = false }: { title: string; centred?: boolean }) {
  return (
    <main className={centred ? 'gn-shell gn-shell--centred gn-shell--skeleton' : 'gn-shell gn-shell--skeleton'} aria-busy="true">
      {centred ? null : <AppNavSkeleton />}
      <SkeletonRegion label={`Loading ${title}`}>
        <Skeleton width="12rem" height="var(--gn-title-page-size)" />
        <Skeleton shape="block" height="18rem" />
      </SkeletonRegion>
    </main>
  );
}

export function NotesPageShell() {
  return (
    <main className="gn-shell gn-shell--wide gn-notes-page gn-shell--skeleton" aria-busy="true">
      <AppNavSkeleton />
      <SkeletonRegion label="Loading your notes" className="gn-notes__layout-skeleton">
        <div className="gn-notes__tree-skeleton"><Skeleton height="1.25rem" rows={8} /></div>
        <div className="gn-notes__document-skeleton"><Skeleton width="60%" height="var(--gn-title-page-size)" /><Skeleton shape="block" height="40dvh" /></div>
      </SkeletonRegion>
    </main>
  );
}
```

Each `loading.tsx` is three lines, e.g. `app/w/[workspaceId]/members/loading.tsx`:

```tsx
import { ListPageShell } from '../../../../src/skeletons/page-shells.js';
export default function MembersLoading() { return <ListPageShell title="Members" rows={5} />; }
```

The project route's: `export default function ProjectLoading() { return <ProjectPageSkeleton />; }` (no tab: `loading.tsx` cannot read storage on the server; the page's own fallback passes the remembered tab in T6). `app/sign-in/page.tsx:22`'s fallback becomes `<FormPageShell title="Sign in" centred />`.

```tsx
// apps/web/src/nav-pending.tsx
'use client';
import { useLinkStatus } from 'next/link';
import type { ReactNode } from 'react';
export function NavPending({ children }: { children: ReactNode }) {
  const { pending } = useLinkStatus();
  return <span className="gn-nav__pending" data-pending={pending ? 'true' : 'false'}>{children}</span>;
}
```

Mount the polite region once: in `apps/web/app/layout.tsx:83-85` add `<AnnounceRegion />` as `RouteAnnouncer`'s sibling (inside `<body>`, outside `Providers`, for the same reason the announcer is: every route, including the ones with no shell); `apps/desktop/src/main.tsx` renders it beside `<App />`. Case 25.056: `layout.tsx`'s source carries exactly one `<AnnounceRegion` and it sits before `<Providers>` (the sweep shape of `skip-link.test.tsx` 13.1055).

Wrap each nav link's label: in `app-nav.tsx` every `<Link …>{label}</Link>` becomes `<Link …><NavPending>{label}</NavPending></Link>` (grep `<Link` in `app-nav.tsx`, `last-project-nav.tsx`, `bottom-bar.tsx`; `NotesNavLink`/`InboxNavLink` likewise).

- [ ] **Step 4: Append to `globals.css`** (after the last rule)

```css
/* ── ROUTE SHELLS AND THE PENDING LINK HINT (smoothness release, spec D5/S1) — appended; see ui.css's placeholder block for why. */
.gn-nav--skeleton { min-height: var(--gn-nav-height); }
.gn-shell--skeleton .gn-skeleton-region { display: flex; flex-direction: column; gap: var(--gn-space-2); }
.gn-project__tabs-skeleton { display: flex; gap: var(--gn-space-2); }
.gn-nav__pending { display: inline-block; }
.gn-nav__pending[data-pending="true"] { animation: gnPulse 1600ms var(--gn-motion-ease-out) 100ms infinite; }
@media (prefers-reduced-motion: reduce) {
  .gn-nav__pending[data-pending="true"] { animation: none; opacity: 0.8; }
}
```

`--gn-nav-height` must already exist (grep `gn-nav-height` in `globals.css`; the phone bar's `--gn-phone-bar-height` is at `:2517`). If the desktop bar has no height variable, measure the rendered `.gn-nav` (one line, `3.5rem` at `4f86b959`'s padding) and declare `--gn-nav-height: 3.5rem` on `:root` in the same appended block; the test's expected value is `var(--gn-nav-height)` either way.

- [ ] **Step 5: GREEN + the sweeps that police routes**

Run: `cd <worktree>/apps/web && pnpm exec vitest run test/route-shells.test.tsx test/nav-pending.test.tsx test/shell-css.test.ts test/skip-link.test.tsx test/app-nav.test.tsx test/bottom-bar.test.tsx 2>&1 | tail -15 && pnpm typecheck && pnpm build > /private/tmp/claude-501/smooth-t5-build.log 2>&1; tail -30 /private/tmp/claude-501/smooth-t5-build.log`
Expected: PASS; `next build` lists the routes unchanged (`loading.tsx` adds no route).

- [ ] **Step 6: Catalogue and commit**

Cases 25.051–25.055 ✅; Features §22 bullet "✅ **Route shells: every signed-in route paints its own wireframe during the hop, and the clicked link says it is working** (smoothness T5; audit SM-02; `apps/web/src/skeletons/*`, `app/**/loading.tsx`, `nav-pending.tsx`)".

```bash
git add apps/web/src/skeletons apps/web/src/nav-pending.tsx apps/web/app apps/web/src/app-nav.tsx apps/web/src/last-project-nav.tsx apps/web/src/bottom-bar.tsx apps/web/src/notes-nav-link.tsx apps/web/src/inbox-nav-link.tsx apps/web/test/route-shells.test.tsx apps/web/test/nav-pending.test.tsx apps/web/test/shell-css.test.ts test-cases/25-smoothness.md Features.md
git commit -m "Smoothness T5: loading.tsx shells, AppNavSkeleton, NavPending (cases 25.051-25.055)"
```

---

### Task 6: The project page — skeleton arms, the tab before first paint, transitions, the Create button

> **Amendment S-R1 (2026-10-02): structural skeletons.** Owner ruling 2026-10-02 ~21:00: *"can the skeleton take at least the shape of what the actual element would look like?"*, then **"Yes, structural skeletons."** Spec `docs/superpowers/specs/2026-10-02-smoothness-design.md` § "Amendment S-R1" (rules 1–5). The task body below is NOT rewritten; where it says a generic shape, a `card`, or `var(--gn-surface-track)`, this note wins. For this task: `ProjectPageSkeleton` and the project page's loading arms render the board card (`.gn-board-card`), the list row and the ticket-sheet header's own containers, with parts for the key, title, state, due, chips and avatar. **Tests** assert (a) the skeleton uses the component's own container class and (b) no skeleton fill is the well (`neoWellLight` / `neoWellDark`; the role is `surfacePlaceholder`, from T2). The skeleton copies the content's box by being that box (S1); it names no container style of its own, and §4.3's style-neutral test stands.

**Parallel-safe with neo: yes.**

**Files:**
- Modify: `apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx`: `:133-137` (fallback → `<ProjectPageSkeleton tab={…} />`), `:322` and `:350` (tab seed), `:379-388` (seed effect), `:451-458` (filter in a transition), `:2176-2186` (the Create gate), `:2295-2360` (header names reserve width), the five arms `:3089, 3127, 3262, 3411, 3592`, the `setViewState` call site (tab switch in a transition); `packages/app-core/src/views/board.tsx:3051-3061` (`useBoard` passes `cacheKey`), `views/ticket-list.tsx:1411-1413` (`cacheKey`), the page's `getMembers`/types/workflow-def hooks (`page.tsx:1299, 1321, 1488, 1878`) gain `cacheKey`s
- Test: `apps/web/test/loading-status.test.tsx` (amend 13.1056, FD4/FD8), `apps/web/test/project-page-smoothness.test.tsx`

**Interfaces, consumes:** T2 (`Skeleton`, `Button busy`), T3 (`cacheKey`), T4 (`readLastUserId`), T5 (`ProjectPageSkeleton`).

- [ ] **Step 1: Amend 13.1056 and write the new cases**

In `loading-status.test.tsx`, the sweep becomes: `expect(arms).toHaveLength(0)` for bare `Loading…` arms, plus `expect(source.match(/<ProjectTabSkeleton\b/g) ?? []).toHaveLength(5)` and the create region's `role="status"` count `2` (the signed-out and the types-fallback arms); the `it` name becomes `'13.1056 / 25.071 the five tab arms are skeletons and no Loading… sentence remains'`.

(`apps/web/test/project-page-smoothness.test.tsx`; mount through `Providers` + `stubServices` the way `project-calendar-timeline.test.tsx` does, with `getBoard`/`getTickets`/`getMembers`/`getTicketTypes` stubs from `packages/app-core/test/helpers/seed.ts` shapes)

```tsx
it('25.072 the remembered List tab is the FIRST thing rendered — the Board arm never paints', async () => {
  rememberLastUserId('u_kiro');
  rememberProjectTab('prj', 'list', 'u_kiro');
  const seen: string[] = [];
  const observer = new MutationObserver(() => { const tab = document.querySelector('[role="tab"][aria-selected="true"]'); if (tab) seen.push(tab.textContent ?? ''); });
  observer.observe(document.body, { subtree: true, childList: true, attributes: true });
  render(<Providers services={services}><ProjectPage /></Providers>);
  await screen.findByRole('tab', { name: 'List', selected: true });
  observer.disconnect();
  expect(seen.filter((t) => t === 'Board')).toHaveLength(0);
  // Control: with no remembered tab the first selected tab is Board.
  window.localStorage.clear();
  cleanup();
  render(<Providers services={services}><ProjectPage /></Providers>);
  await screen.findByRole('tab', { name: 'Board', selected: true });
});

it('25.073 the list arm shows the table skeleton while the walk is open, and a filter toggle keeps the rows on screen (no skeleton, no sentence)', async () => {
  const open = deferred<TicketListView>();
  let calls = 0;
  const getTickets = vi.fn(() => { calls += 1; return calls === 1 ? Promise.resolve({ projectId: 'prj', rows: [listRowSeed()] }) : open.promise; });
  render(<Providers services={stubServices({ ...reads, getTickets })}><ProjectPage /></Providers>);
  await userEvent.click(await screen.findByRole('tab', { name: 'List' }));
  await screen.findByText(listRowSeed().title);
  await userEvent.click(screen.getByRole('switch', { name: /Only tickets in progress/ }));
  expect(screen.queryByText('Loading…')).toBeNull();
  expect(document.querySelector('[data-testid="project-tab-skeleton"]')).toBeNull();
  expect(screen.getByText(listRowSeed().title)).toBeInTheDocument();
  act(() => open.resolve({ projectId: 'prj', rows: [] }));
});

it('25.074 the Create ticket control is a busy BUTTON while the list walk is open, never a sentence', async () => {
  const open = deferred<TicketListView>();
  render(<Providers services={stubServices({ ...reads, getTickets: () => open.promise })}><ProjectPage /></Providers>);
  const button = await screen.findByRole('button', { name: 'Create ticket' });
  expect(button).toHaveAttribute('aria-busy', 'true');
  expect(button).toBeDisabled();
  expect(screen.queryByText('Preparing the Create ticket form…')).toBeNull();
  act(() => open.resolve({ projectId: 'prj', rows: [] }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Create ticket' })).toBeEnabled());
});
```

- [ ] **Step 2: RED**

Run: `cd <worktree>/apps/web && pnpm exec vitest run test/loading-status.test.tsx test/project-page-smoothness.test.tsx 2>&1 | tail -20`
Expected: FAIL — five bare arms; the Board tab is seen first; the gate sentence renders.

- [ ] **Step 3: Implement**

The tab seed (`page.tsx:322, 350`):

```tsx
  const tabUserId = session.kind === 'signed-in' ? session.user.id : readLastUserId();
  const [view, setViewState] = useState<ProjectTab>(() => readProjectTab(projectId, tabUserId) ?? DEFAULT_PROJECT_TAB);
```

(`readLastUserId` is called inside the initializer only on the client: this component renders below the `useSearchParams` boundary, FD3.) The seed effect (`:379-388`) stays for the case where the session's id differs from the remembered one. The fallback: `<Suspense fallback={<ProjectPageSkeleton tab={readProjectTab(projectIdFromParams, readLastUserId()) ?? 'board'} />}>` — `ProjectPage` reads `useParams()` for the id (it already is a client component).

A tiny local component for the five arms, defined in `page.tsx`:

```tsx
function ProjectTabSkeleton({ tab }: { tab: ProjectTab }) {
  return (
    <SkeletonRegion label={`Loading the ${tab}`} className="gn-project__tab-skeleton">
      <div data-testid="project-tab-skeleton" />
      {tab === 'board' ? <div className="gn-board__rail">{[0, 1, 2].map((c) => <section key={c} className="gn-board__column"><Skeleton width="7rem" height="1rem" /><Skeleton shape="card" rows={3} /></section>)}</div>
        : tab === 'calendar' ? <Skeleton shape="block" height="32rem" />
        : tab === 'timeline' ? <Skeleton shape="block" height="2.5rem" rows={6} />
        : <Skeleton shape="block" height="3rem" rows={8} />}
    </SkeletonRegion>
  );
}
```

Each `<p role="status">Loading…</p>` arm becomes `<ProjectTabSkeleton tab="list" />` (etc.). The `rows !== null ? … : skeleton` condition stays; with T3's `cacheKey` the rows are non-null on a filter toggle because the list hook now serves the previous key's… no: a filter toggle is a NEW key with no cached answer. So the filter state goes through a transition and the arm reads `list.rowsHaveAnswered`:

```tsx
  const [isFiltering, startFiltering] = useTransition();
  const setActiveOnlyDeferred = (next: boolean) => startFiltering(() => setActiveOnly(next));
```

and the four list-driven arms render the skeleton only when `list.rows === null && !list.rowsHaveAnswered`; while `list.rows === null && list.rowsHaveAnswered` (a rekey) they render the previous rows, which `useTicketList` now keeps: in `ticket-list.tsx:1411-1413` pass `{ cacheKey: \`list:${projectId}:${filterKey}\` }` and return `rows: list.data?.rows ?? lastRowsRef.current` where `lastRowsRef` is updated whenever `list.data` is non-null. Tab switches: `setView` wraps `setViewState` in `startTransition` so a tab whose read is still open keeps the current tab on screen (S4).

`useBoard` (`board.tsx:3061`): `useLiveQuery(source, workspaceId, projectId, () => source.query.getBoard(projectId), { cacheKey: \`board:${projectId}\` })`. The page's members, types and workflow-def hooks get `cacheKey`s `members:<ws>`, `types:<ws>`, `wf:<id>@<version>`.

The Create gate (`:2176-2186`): the `loading`/`!rowsHaveAnswered` arm returns the real control with `busy`:

```tsx
    if (session.kind === 'loading' || (!list.rowsHaveAnswered && list.error === null)) {
      return <Button variant="primary" busy busyLabel="Create ticket" className="gn-new-ticket__trigger">Create ticket</Button>;
    }
```

(the busy label equals the idle label on purpose: the control is the same size in both states, S1; `aria-busy` says the rest). Header names (`:2295-2360`): where a name is `null`, render `<Skeleton width="8rem" height="1em" />` in its place instead of omitting the element.

- [ ] **Step 4: GREEN + the page's suites**

Run: `cd <worktree>/apps/web && pnpm exec vitest run test/loading-status.test.tsx test/project-page-smoothness.test.tsx test/project-calendar-timeline.test.tsx test/page-refusals.test.tsx 2>&1 | tail -15 && pnpm typecheck && cd ../../packages/app-core && pnpm exec vitest run test/views/board.test.tsx test/views/board-optimistic-moves.test.tsx 2>&1 | tail -8`
Expected: PASS; cases 13.856/13.874/13.876 (remembered tab) still green through the earlier seed.

- [ ] **Step 5: Catalogue and commit**

Cases 25.071–25.074 ✅ (25.071 names 13.1056 as amended); Features §22 bullet "✅ **The project page: the remembered tab from the first frame, skeleton arms, filters and tabs in a transition, a busy Create button** (smoothness T6; audit SM-01, SM-02, SM-09)".

```bash
git add "apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx" packages/app-core/src/views/board.tsx packages/app-core/src/views/ticket-list.tsx apps/web/test/loading-status.test.tsx apps/web/test/project-page-smoothness.test.tsx test-cases/25-smoothness.md Features.md
git commit -m "Smoothness T6: project page skeleton arms, tab before first paint, transitions, busy Create (cases 25.071-25.074)"
```

---

### Task 7: Optimistic writes — the sheet's fields, the ghost card, Close, Start, the renames

> **Amendment S-R1 (2026-10-02): structural skeletons.** Owner ruling 2026-10-02 ~21:00: *"can the skeleton take at least the shape of what the actual element would look like?"*, then **"Yes, structural skeletons."** Spec `docs/superpowers/specs/2026-10-02-smoothness-design.md` § "Amendment S-R1" (rules 1–5). The task body below is NOT rewritten; where it says a generic shape, a `card`, or `var(--gn-surface-track)`, this note wins. For this task: the ghost card (and any placeholder the optimistic writes show) renders `.gn-board-card`'s own container with parts inside; no invented container style. **Tests** assert (a) the skeleton uses the component's own container class and (b) no skeleton fill is the well (`neoWellLight` / `neoWellDark`; the role is `surfacePlaceholder`, from T2). The skeleton copies the content's box by being that box (S1); it names no container style of its own, and §4.3's style-neutral test stands.

**Parallel-safe with neo: yes.**

**Files:**
- Create: `packages/app-core/src/views/optimistic-ticket.ts`
- Modify: `packages/app-core/src/views/ticket-sheet.tsx:940-951` (reads), `:1277-1332` (state write), `:1884-1920` (title), the assignee/priority/dates write sites (grep `'ticket.field_set'` in the file), `:3186-3190` (`TitleField value`); `views/board-move-state.ts` (add `applyPendingCreates`, `PendingCreate`), `views/board.tsx:515` (apply creates), `:2676-2700` (Close through `beginPending`), `views/create-ticket-flow.tsx:374-392` (`onPending`/`onRefused` callbacks), `apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx:2258-2264` (wire them; `board.reload()` on the answer), `apps/web/src/backlog-start-button.tsx:89-102`, `apps/web/app/w/[workspaceId]/page.tsx:345-395` (rename overlay), `apps/web/src/project-title.tsx:160-176`
- Test: `packages/app-core/test/views/optimistic-ticket.test.ts`, `test/views/ticket-sheet-optimistic.test.tsx`, `test/views/board-ghost-create.test.tsx`, `apps/web/test/backlog-start-optimistic.test.tsx`, `apps/web/test/rename-optimistic.test.tsx`

**Interfaces, produces:**
- `type TicketOverlay = Partial<Pick<TicketState, 'stateId' | 'assigneeId' | 'priority' | 'startDate' | 'dueDate'>> & { title?: string }`; `applyOverlay(read: TicketRead, overlay: TicketOverlay): TicketRead`; `useOptimisticTicket(read: LiveQueryResult<TicketRead | null>)` → `{ ticket: TicketRead | null; begin(field: keyof TicketOverlay, value): void; settle(field): void; drop(field): void; pendingFields: ReadonlySet<string> }`. `settle` keeps the overlay until a read whose value equals it lands (then retires it); `drop` removes it at once (refusal).
- `PendingCreate = { ticketId: string; workflowId: string; stateId: string; title: string; typeId: string }`; `applyPendingCreates(view: BoardView, creates: readonly PendingCreate[]): BoardView` inserts a `BoardCard` with `key: '…'` at the end of the state's column (retired when the read shows the id).
- `CreateTicketFlow` props gain `onPending?: (create: PendingCreate) => void` and `onRefused?: (ticketId: string) => void`.

- [ ] **Step 1: Failing tests** (`optimistic-ticket.test.ts`)

```ts
import { describe, expect, it } from 'vitest';
import { applyOverlay } from '../../src/views/optimistic-ticket.js';
import { ticketStateSeed } from '../helpers/seed.js';

describe('applyOverlay (spec S5; audit SM-03)', () => {
  it('25.091 an overlay replaces exactly its fields and nothing else; an empty overlay returns the same object', () => {
    const read = { ticket: ticketStateSeed({ stateId: 'st_todo', title: 'Old' }) } as never;
    const next = applyOverlay(read, { stateId: 'st_doing' });
    expect(next.ticket.stateId).toBe('st_doing');
    expect(next.ticket.title).toBe('Old');
    expect(applyOverlay(read, {})).toBe(read);
  });
});
```

(`ticket-sheet-optimistic.test.tsx`; mount `TicketSheet` the way `ticket-sheet.test.tsx` does, with `createFakeDataSource` and a scripted ingest)

```tsx
it('25.092 a title commit shows the NEW title at once, keeps it while the write is open, and never flashes the old one after the answer', async () => {
  const open = deferred<IngestResult[]>();
  const reads: string[] = [];
  const ds = createFakeDataSource({ getTicket: async () => { const t = ticketStateSeed({ title: reads.length < 2 ? 'Old' : 'New' }); reads.push(t.title); return { ticket: t, ...rest }; } }, () => open.promise);
  render(<TicketSheet dataSource={ds} workspaceId={WS} ticketId={TICKET} currentUserId={CURRENT_USER} onClose={() => {}} />);
  const field = await screen.findByRole('textbox', { name: /Title/ });
  await userEvent.clear(field); await userEvent.type(field, 'New{Enter}');
  expect(field).toHaveValue('New');
  expect(field.closest('[aria-busy="true"]')).not.toBeNull();
  act(() => open.resolve([{ status: 'committed', seq: 9 } as IngestResult]));
  await waitFor(() => expect(field.closest('[aria-busy="true"]')).toBeNull());
  expect(field).toHaveValue('New');
  // Control: the old shape — the value tracked the read — would have shown 'Old' between the clear and the second read.
  expect(reads.filter((t) => t === 'Old').length).toBeGreaterThanOrEqual(1);
});

it('25.093 a refused state change returns the State row to the server\'s value and shows the refusal under it', async () => {
  const ds = createFakeDataSource({ ...reads }, () => [{ status: 'refused', rule: 'parent-terminal', reason: 'Close the subtasks first.' } as IngestResult]);
  render(<TicketSheet … />);
  await userEvent.click(await screen.findByRole('button', { name: /Move to/ }));
  await userEvent.click(screen.getByRole('menuitem', { name: 'Done' }));
  expect(screen.getByText(/State/).parentElement).toHaveTextContent('Done'); // optimistic, this frame
  await screen.findByText('Close the subtasks first.');
  expect(screen.getByText(/State/).parentElement).toHaveTextContent('To do');
});

it('25.096 a refused edit on one field does not drop a second field\'s open overlay', async () => {
  const title = deferred<IngestResult[]>();
  let n = 0;
  const ds = createFakeDataSource({ ...reads }, () => { n += 1; return n === 1 ? title.promise : [{ status: 'refused', rule: 'x', reason: 'No.' } as IngestResult]; });
  render(<TicketSheet … />);
  const field = await screen.findByRole('textbox', { name: /Title/ });
  await userEvent.clear(field); await userEvent.type(field, 'New{Enter}');
  await userEvent.selectOptions(screen.getByRole('combobox', { name: /Priority/ }), 'high');
  await screen.findByText('No.');
  expect(screen.getByRole('combobox', { name: /Priority/ })).toHaveValue('medium');
  expect(field).toHaveValue('New');
  act(() => title.resolve([{ status: 'committed', seq: 10 } as IngestResult]));
});
```

(`board-ghost-create.test.tsx`)

```tsx
it('25.094 the created ticket is on the board as a dimmed card with key "…" before the server answers; a committed answer gives it its key; a refusal removes it', async () => {
  const view: BoardView = { projectId: PROJECT, groups: [{ workflowId: WF_ERRAND.id, columns: [{ stateId: 'st_todo', name: 'To do', cards: [] }, { stateId: 'st_done', name: 'Done', cards: [] }] }] };
  const ghost = { ticketId: 't_new', workflowId: WF_ERRAND.id, stateId: 'st_todo', title: 'Buy milk', typeId: 'task' };
  const next = applyPendingCreates(view, [ghost]);
  expect(next.groups[0]!.columns[0]!.cards.map((c) => [c.ticketId, c.key, c.title])).toEqual([['t_new', '…', 'Buy milk']]);
  expect(applyPendingCreates(view, [])).toBe(view);
  const { rerender, container } = render(<Board board={{ view: next, pendingCreates: [ghost] } as never} onOpenTicket={() => {}} today="2026-10-02" currentUserId={CURRENT_USER} />);
  expect(container.querySelector('[data-ticket-id="t_new"]')).toHaveAttribute('aria-busy', 'true');
  const landed = { ...view, groups: [{ ...view.groups[0]!, columns: [{ ...view.groups[0]!.columns[0]!, cards: [boardCardSeed({ ticketId: 't_new', key: 'CC-7', title: 'Buy milk' })] }, view.groups[0]!.columns[1]!] }] };
  rerender(<Board board={{ view: landed, pendingCreates: [] } as never} … />);
  expect(container.querySelector('[data-ticket-id="t_new"]')).not.toHaveAttribute('aria-busy');
  expect(screen.getByText('CC-7')).toBeInTheDocument();
});
```

(`backlog-start-optimistic.test.tsx`: the row leaves the backlog on click and returns with the refusal when the ingest refuses; `rename-optimistic.test.tsx`: the workspace home's h1 shows the new name on Save and reverts to the old with the refusal.)

- [ ] **Step 2: RED**

Run: `cd <worktree>/packages/app-core && pnpm exec vitest run test/views/optimistic-ticket.test.ts test/views/ticket-sheet-optimistic.test.tsx test/views/board-ghost-create.test.tsx 2>&1 | tail -20`
Expected: FAIL.

- [ ] **Step 3: Implement the overlay**

```ts
// packages/app-core/src/views/optimistic-ticket.ts
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TicketState } from '@gisik-nokma/domain';
import type { TicketRead } from '../data-source.js';
import type { LiveQueryResult } from './use-live-query.js';

export type TicketOverlay = Partial<Pick<TicketState, 'stateId' | 'assigneeId' | 'priority' | 'startDate' | 'dueDate'>> & { title?: string };
type Field = keyof TicketOverlay;

export function applyOverlay(read: TicketRead, overlay: TicketOverlay): TicketRead {
  const fields = Object.keys(overlay) as Field[];
  if (fields.length === 0) return read;
  const ticket = { ...read.ticket } as TicketState & { title: string };
  for (const field of fields) (ticket as Record<string, unknown>)[field] = overlay[field];
  return { ...read, ticket };
}

/**
 * The sheet's writes, shown the moment they are made (spec S5). `begin` lays the value over the read;
 * `settle` keeps it until a read AGREES (so the committed value never flickers back to the old one while
 * the reload is in flight); `drop` removes it at once — the refusal arm. Fields are independent: one
 * refusal never drops another field's open overlay (review focus 1).
 */
export function useOptimisticTicket(read: LiveQueryResult<TicketRead | null>) {
  const [overlay, setOverlay] = useState<TicketOverlay>({});
  const [pending, setPending] = useState<ReadonlySet<Field>>(new Set());
  const settling = useRef(new Set<Field>());

  useEffect(() => {
    const current = read.data?.ticket as (TicketState & { title: string }) | undefined;
    if (current === undefined) return;
    const agreed = [...settling.current].filter((field) => (current as Record<string, unknown>)[field] === overlay[field]);
    if (agreed.length === 0) return;
    for (const field of agreed) settling.current.delete(field);
    setOverlay((o) => { const next = { ...o }; for (const field of agreed) delete next[field]; return next; });
  }, [read.data, overlay]);

  const begin = useCallback(<F extends Field>(field: F, value: TicketOverlay[F]) => {
    setOverlay((o) => ({ ...o, [field]: value }));
    setPending((p) => new Set(p).add(field));
  }, []);
  const settle = useCallback((field: Field) => {
    settling.current.add(field);
    setPending((p) => { const next = new Set(p); next.delete(field); return next; });
  }, []);
  const drop = useCallback((field: Field) => {
    settling.current.delete(field);
    setOverlay((o) => { const next = { ...o }; delete next[field]; return next; });
    setPending((p) => { const next = new Set(p); next.delete(field); return next; });
  }, []);

  const ticket = useMemo(() => (read.data === null ? null : applyOverlay(read.data, overlay)), [read.data, overlay]);
  return { ticket, begin, settle, drop, pendingFields: pending };
}
```

In `ticket-sheet.tsx`: after `read` (`:940`), `const optimistic = useOptimisticTicket(read);` and every later `read.data` use for display reads `optimistic.ticket` (`ticketRead`). `submitTitle` (`:1884-1920`): `optimistic.begin('title', next)` before the ingest; on `committed` → `optimistic.settle('title'); setTitleDraft(null); read.reload(); history.reload();`; on refusal/transport → `optimistic.drop('title')` and the existing refusal copy; `TitleField` (`:3186`) gets `value={titleDraft ?? ticketRead.title}` unchanged (now the overlay carries 'New') and is wrapped in `<Pending pending={optimistic.pendingFields.has('title')} label="Saving the title">`. The state write (`:1277-1332`): `optimistic.begin('stateId', submission.toStateId)` plus a `begin` per `fieldValues` entry that names an overlay field; `settle` on committed, `drop` on refused. Assignee, priority, dates: the same three lines at each `'ticket.field_set'` site. The `workflow` read (`:944-951`) keys on the board card's `workflowId` when the sheet is opened from a card (new optional prop `hint?: { workflowId; workflowVersion }`, passed by `page.tsx`'s `openTicket`), so it no longer waits for the ticket; both reads get `cacheKey`s (`ticket:<id>`, `wf:<id>@<v>`); `subtasks` reads `getTickets` with `cacheKey: list:<project>:{}` so it is served from the page's walk.

`board-move-state.ts`: add

```ts
export type PendingCreate = { ticketId: string; workflowId: string; stateId: string; title: string; typeId: string };
export function applyPendingCreates(view: BoardView, creates: readonly PendingCreate[]): BoardView {
  if (creates.length === 0) return view;
  let changed = false;
  const groups = view.groups.map((group) => {
    const mine = creates.filter((c) => c.workflowId === group.workflowId && !group.columns.some((col) => col.cards.some((card) => card.ticketId === c.ticketId)));
    if (mine.length === 0) return group;
    changed = true;
    return { ...group, columns: group.columns.map((column) => {
      const here = mine.filter((c) => c.stateId === column.stateId);
      return here.length === 0 ? column : { ...column, cards: [...column.cards, ...here.map((c) => ghostCard(c))] };
    }) };
  });
  return changed ? { ...view, groups } : view;
}
function ghostCard(c: PendingCreate): BoardCard { return { ...EMPTY_CARD, ticketId: c.ticketId, key: '…', title: c.title, typeId: c.typeId, pendingCreate: true }; }
```

(`EMPTY_CARD` is the `BoardCard` with every optional field absent; `BoardCard` gains `pendingCreate?: true` in `view-types.ts`, and `BoardCardSlot` renders `aria-busy="true"` + class `gn-board__card-slot--creating` when set.) `Board` (`board.tsx:515`): `applyPendingCreates(applyPendingMoves(realBoard.view, move.pending), realBoard.pendingCreates ?? [])`; the page holds `pendingCreates` state, `CreateTicketFlow`'s `onPending` adds, the committed answer calls `board.reload()` and the entry retires when the read contains the id; `onRefused` removes it and reopens the dialog with the draft. Close (`:2676-2700`): `beginPending({ ticketId, toStateId: terminal }, rect)` before the ingest, `dropPending` on refusal (the existing move machinery, so the card glides). Backlog Start: an `optimisticStarted: Set<string>` on the page filters the row out until `list.reload()` answers. Renames: the home and `ProjectTitle` hold `optimisticName` until the re-read carries it.

- [ ] **Step 4: GREEN + the sheet and board suites**

Run: `cd <worktree>/packages/app-core && pnpm build && pnpm exec vitest run test/views 2>&1 | tail -12 && pnpm typecheck && cd ../../apps/web && pnpm exec vitest run test/backlog-start-optimistic.test.tsx test/rename-optimistic.test.tsx test/project-page-smoothness.test.tsx 2>&1 | tail -8 && pnpm typecheck`
Expected: PASS, including E2-36's "both reads re-asked" cases (the reloads are kept).

- [ ] **Step 5: Catalogue and commit**

Cases 25.091–25.096 ✅ (plus 25.097 Close, 25.098 Start, 25.099 renames); Features §22 bullet "✅ **Every edit shows at once and rolls back honestly: the sheet's fields, the ghost card, Close, Start, renames** (smoothness T7; audit SM-03; owner D2/D2b)".

```bash
git add packages/app-core/src/views/optimistic-ticket.ts packages/app-core/src/views/ticket-sheet.tsx packages/app-core/src/views/board-move-state.ts packages/app-core/src/views/board.tsx packages/app-core/src/views/create-ticket-flow.tsx packages/app-core/src/view-types.ts "apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx" "apps/web/app/w/[workspaceId]/page.tsx" apps/web/src/backlog-start-button.tsx apps/web/src/project-title.tsx packages/app-core/test/views/optimistic-ticket.test.ts packages/app-core/test/views/ticket-sheet-optimistic.test.tsx packages/app-core/test/views/board-ghost-create.test.tsx apps/web/test/backlog-start-optimistic.test.tsx apps/web/test/rename-optimistic.test.tsx test-cases/25-smoothness.md Features.md
git commit -m "Smoothness T7: optimistic sheet fields, ghost create card, Close, Start, renames (cases 25.091-25.099)"
```

---

### Task 8: Secondary screens, the entry pages and the phone shell

> **Amendment S-R1 (2026-10-02): structural skeletons.** Owner ruling 2026-10-02 ~21:00: *"can the skeleton take at least the shape of what the actual element would look like?"*, then **"Yes, structural skeletons."** Spec `docs/superpowers/specs/2026-10-02-smoothness-design.md` § "Amendment S-R1" (rules 1–5). The task body below is NOT rewritten; where it says a generic shape, a `card`, or `var(--gn-surface-track)`, this note wins. For this task: each secondary screen's skeleton (workspace card, member row, inbox and my-work items, account and settings sections) renders that component's own container, with parts for its text, avatar and chips. **Tests** assert (a) the skeleton uses the component's own container class and (b) no skeleton fill is the well (`neoWellLight` / `neoWellDark`; the role is `surfacePlaceholder`, from T2). The skeleton copies the content's box by being that box (S1); it names no container style of its own, and §4.3's style-neutral test stands.

**Parallel-safe with neo: yes** (`globals.css` appended; `app-nav.tsx`, `use-tablet-bar.ts`, `bottom-bar.tsx` are not neo's).

**Files:**
- Modify: `apps/web/app/workspaces/page.tsx:156-162, 646-650`, `app/w/[workspaceId]/page.tsx:427-433, 1615-1623`, `app/w/[workspaceId]/members/page.tsx:491-499`, `app/inbox/page.tsx:542`, `app/w/[workspaceId]/my-work/page.tsx:334-350`, `app/settings/page.tsx:163, 297, 392`, `apps/web/src/authoring/builder-wiring.tsx:162` (`WiringNotReady`'s loading arm), `app/account/page.tsx:296-331`, `app/sign-in/page.tsx:200-202, 310-320, 334-345, 356-367, 420, 446, 471-499`, `app/invite/[token]/page.tsx:123, 191, 200`, `apps/web/src/phone-switcher.tsx:127-140, 172`, `apps/web/src/app-nav.tsx:528-555`, `apps/web/src/use-tablet-bar.ts:32-41`, `apps/web/src/bottom-bar.tsx:114-118`, `apps/web/src/inbox-nav-link.tsx` (one shared unread store), `apps/web/app/globals.css` (append), the workflow-builder screens' "Loading…" (`packages/app-core/src/workflow-builder/**` five sites) and `comments-thread.tsx:251`, `history-panel.tsx:121, 145`, `mcp-tokens-screen.tsx:358`
- Test: `apps/web/test/screen-skeletons.test.tsx`, `apps/web/test/sign-in-pending.test.tsx`, `apps/web/test/phone-shell-first-frame.test.tsx`, `apps/web/test/no-loading-sentences.test.ts`

**Interfaces, consumes:** T2, T4 (`useMyWorkspaces`), T5 (`AppNavSkeleton`, shells).

- [ ] **Step 1: Failing tests** (`no-loading-sentences.test.ts`)

```ts
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
describe('the loading sentence is retired (spec S7; audit SM-09)', () => {
  it('25.121 no product file renders a bare "Loading…" (tests and docblocks excluded)', () => {
    const out = execFileSync('git', ['grep', '-n', '-e', '>Loading…<', '-e', "'Loading…'", '-e', 'Loading groups…', '-e', 'Loading settings…', '-e', 'Loading this workflow…', '-e', 'Loading your workspaces…', '--', 'apps/web/app', 'apps/web/src', 'packages/app-core/src', ':!*.test.*'], { encoding: 'utf8', cwd: REPO_ROOT }).trim();
    const code = out.split('\n').filter(Boolean).filter((line) => !/^\S+:\d+:\s*(\*|\/\/|\/\*)/.test(line));
    expect(code, code.join('\n')).toEqual([]);
  });
});
```

(`screen-skeletons.test.tsx`: one `it` per screen, each mounting the page through `Providers` + `stubServices` with the read held open by a deferred promise; the assertions are the same four lines each, shown for Members)

```tsx
it('25.122 Members shows its skeleton (summary line + five rows) while the reads are open, with no sentence and no shift of the title', async () => {
  const members = deferred<RosterMember[]>();
  render(<Providers services={stubServices({ getMembers: () => members.promise, getMyWorkspaces: async () => [ws] }, { invitesAdmin: { listPending: async () => [] }, notifications: { unreadCount: async () => 0 } })}><MembersPage /></Providers>);
  const region = await screen.findByText('Loading members');
  expect(region.parentElement).toHaveAttribute('aria-busy', 'true');
  expect(document.querySelectorAll('.gn-skeleton--block')).toHaveLength(5);
  expect(screen.queryByText('Loading…')).toBeNull();
  const title = screen.getByRole('heading', { level: 1 });
  const before = title.compareDocumentPosition(region);
  act(() => members.resolve([member]));
  await screen.findByText(member.name);
  expect(document.querySelector('[aria-busy="true"]')).toBeNull();
  expect(title.compareDocumentPosition(screen.getByText(member.name))).toBe(before); // the heading did not move relative to the content
});
```

Screens and their skeleton shapes (each its own `it`, ids 25.122–25.131): Members (above); Workspaces 25.123 (three `card` blocks + the invitation band `Skeleton block 3rem` that collapses only on an answered-empty); Workspace home 25.124 (title line + three `card`s; the project dialog's group field renders a `line` until groups arrive); Inbox 25.125 (tabs + six `block` rows); My work 25.126 (the attention band `block 4rem` reserved + six rows); Settings 25.127 (rail + `block 18rem`, the three sentences gone); Account 25.128 (every card's skeleton in its final order from the first frame — assert the order of the `SkeletonRegion` labels equals the order of the rendered sections after all reads land); Phone switcher 25.129 (three `line` rows); the workflow-builder list/editor/history and the ticket-type list/editor 25.130 (rows / a form block); comments, note history, MCP tokens 25.131 (rows).

(`sign-in-pending.test.tsx`)

```tsx
it('25.132 the methods row reserves its height before /auth/methods answers, so the form never flips; every submit is a busy button while in flight', async () => {
  const methods = deferred<AuthMethods>();
  render(<SignInPage />); // with authClient and fetch mocked as sign-in.test.tsx does
  const slot = document.querySelector('.gn-sign-in__methods-slot')!;
  expect(slot.querySelector('.gn-skeleton')).not.toBeNull();
  const top = (await screen.findByRole('textbox', { name: /Email/ })).getBoundingClientRect().top;
  act(() => methods.resolve({ social: { phone: true, google: false }, passkeys: false }));
  await screen.findByRole('radio', { name: 'Phone' });
  expect(screen.getByRole('textbox', { name: /Phone/ }).getBoundingClientRect().top).toBe(top);
  const send = deferred<{ error: null }>();
  sendOtp.mockReturnValueOnce(send.promise);
  await userEvent.click(screen.getByRole('button', { name: 'Send code' }));
  const busy = screen.getByRole('button', { name: 'Sending…' });
  expect(busy).toBeDisabled();
  await userEvent.click(busy); // a second click sends nothing
  expect(sendOtp).toHaveBeenCalledTimes(1);
  act(() => send.resolve({ error: null }));
});
```

(`phone-shell-first-frame.test.tsx`)

```tsx
it('25.141 at ≤64rem the FIRST render of AppNav has the bottom bar and not the corner Notes/Inbox; above it the reverse — before any effect', () => {
  matchMediaAnswers('(max-width: 64rem)', true);
  const { container } = render(<Providers services={workspacesOf([ws])}><AppNav workspaceId={ws.id} /></Providers>);
  // No act flush beyond the mount: this is the hydration frame.
  expect(container.querySelector('.gn-bottom-bar')).not.toBeNull();
  expect(container.querySelector('.gn-nav__corner a[href="/inbox"]')).toBeNull();
  cleanup();
  matchMediaAnswers('(max-width: 64rem)', false);
  const wide = render(<Providers services={workspacesOf([ws])}><AppNav workspaceId={ws.id} /></Providers>).container;
  expect(wide.querySelector('.gn-bottom-bar')).toBeNull();
  expect(wide.querySelector('.gn-nav__corner a[href="/inbox"]')).not.toBeNull();
});

it('25.142 a customised bottom bar renders its remembered slots on the first client render, not after a swap', () => {
  rememberBottomBar('u_kiro', ['notes', 'inbox', 'my-work', 'members']);
  matchMediaAnswers('(max-width: 64rem)', true);
  const { container } = render(<Providers services={workspacesOf([ws])}><AppNav workspaceId={ws.id} /></Providers>);
  const labels = [...container.querySelectorAll('.gn-bottom-bar a')].map((a) => a.textContent);
  expect(labels[0]).toBe('Notes');
});

it('25.143 two badges on one page share ONE unread poll', async () => {
  const unreadCount = vi.fn(async () => 1);
  render(<Providers services={stubServices({}, { notifications: { unreadCount } })}><InboxNavLink active={false} /><InboxNavLink active={false} /></Providers>);
  await act(async () => { await Promise.resolve(); });
  expect(unreadCount).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: RED**

Run: `cd <worktree>/apps/web && pnpm exec vitest run test/no-loading-sentences.test.ts test/screen-skeletons.test.tsx test/sign-in-pending.test.tsx test/phone-shell-first-frame.test.tsx 2>&1 | tail -25`
Expected: FAIL — 20+ sentences found; no skeleton regions; the corner link renders first.

- [ ] **Step 3: Implement, screen by screen**

Members (`members/page.tsx:491-499`): the `members === null` arm renders `<SkeletonRegion label="Loading members"><Skeleton width="60%" height="1rem" /><Skeleton shape="block" height="3.5rem" rows={5} /></SkeletonRegion>` in the same slot the summary + table occupy; the pending-invites section renders `<Skeleton shape="block" height="3rem" />` until `pending !== null`. Workspaces (`:156-162`): `<SkeletonRegion label="Loading your workspaces"><Skeleton shape="card" rows={3} /></SkeletonRegion>`; the banner (`:646-650`) renders `<Skeleton shape="block" height="3rem" />` while `invitations === null` and nothing when `[]`. Workspace home (`:427-433`): the `<h1>Workspace</h1>` placeholder becomes `<Skeleton width="18rem" height="var(--gn-title-page-size)" />` in the h1's slot, then three `card`s; the dialog's group field (`:1615-1623`) renders `<Skeleton height="2.5rem" />` in its slot while groups are null. Inbox (`:542`), My work (`:334-350`: the strip's slot holds `<Skeleton shape="block" height="4rem" />` while `attention.data === null`), Settings (`:297, 392` and `WiringNotReady` at `builder-wiring.tsx:162`: `<SkeletonRegion label="Loading settings"><Skeleton shape="block" height="18rem" /></SkeletonRegion>`), Account (`:296-331`: every conditional `{x !== null ? <Section/> : null}` becomes `{x !== null ? <Section/> : <SectionSkeleton title="…" />}` where `SectionSkeleton` is a `Card` with a title line and a `block 6rem`), the phone switcher (`:172`: `<Skeleton height="1.25rem" rows={3} />`), the builder screens, comments, history, MCP tokens: `Skeleton` rows in the same slot.

Sign-in (`sign-in/page.tsx`): wrap the methods control's slot in `<div className="gn-sign-in__methods-slot">` that renders `<Skeleton height="2.5rem" />` while `methods === null`; the five buttons get `busy={sending} busyLabel="Sending…"` (code/magic link), `"Signing in…"` (verify, passkey, social) from a `sending: 'none' | 'otp' | 'verify' | 'magic' | 'passkey' | 'social'` state set before the call and cleared in `finally`. Invite (`:123, 191, 200`): one `FormPageShell`-shaped skeleton for both waits, `busy` on Join.

The phone shell: `use-tablet-bar.ts:32-41` becomes

```ts
export function useTabletBar(): boolean {
  return useSyncExternalStore(subscribeTabletBar, () => window.matchMedia(TABLET_BAR_QUERY).matches, () => false);
}
function subscribeTabletBar(onChange: () => void): () => void {
  if (typeof window.matchMedia !== 'function') return () => undefined;
  const query = window.matchMedia(TABLET_BAR_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}
```

(`useSyncExternalStore` with a server snapshot of `false` hydrates with the server markup and re-renders with the client snapshot before paint, which is the one React-sanctioned way to read `matchMedia` in the first client frame without a hydration error.) `useIsPhone` (`use-is-phone.ts:26-35`) takes the same shape. The corner's `!hasBottomBar` arm (`app-nav.tsx:528-533`) keeps its script gate and gains a CSS belt appended to `globals.css`: `@media (max-width: 64rem) { .gn-nav__corner > .gn-nav__notes-link, .gn-nav__corner > .gn-nav__inbox-link { display: none; } }` (the two links must carry those classes; grep their roots in `notes-nav-link.tsx`/`inbox-nav-link.tsx`). Bottom-bar slots (`bottom-bar.tsx:114-118`): `useState(() => (typeof window === 'undefined' ? [...DEFAULT_BAR] : readBottomBar(userId)))`; the bar is rendered only on the client already (it is behind `hasBottomBar`, which the store answers in the first client frame), so there is no server markup to mismatch. The unread store: `inbox-nav-link.tsx` keeps one module-level `{ count, listeners, timer }` started by the first `useInboxUnread` subscriber and stopped by the last (`useSyncExternalStore` again), so two badges are one poll.

- [ ] **Step 4: GREEN + every page suite that renders these screens**

Run: `cd <worktree>/apps/web && pnpm exec vitest run 2>&1 | tail -15 && pnpm typecheck && cd ../../packages/app-core && pnpm exec vitest run test/workflow-builder test/views/comments-thread.test.tsx 2>&1 | tail -8`
Expected: PASS; `nav-phone-disclosure.test.ts`, `bottom-bar.test.tsx` (21.020–21.032), `phone-switcher` cases and 23.050 keep holding (the bar's visibility rule did not change, only when it is first known).

- [ ] **Step 5: Catalogue and commit**

Cases 25.121–25.132, 25.141–25.143 ✅; Features §22 bullets "✅ **Every secondary screen paints its own wireframe; sections reserve their band; the entry pages' buttons say they are working** (smoothness T8; audit SM-09, SM-11)" and "✅ **The phone shell is right in the first frame** (smoothness T8; audit SM-08; `use-tablet-bar.ts`, `use-is-phone.ts`, `bottom-bar.tsx`, one unread store)".

```bash
git add apps/web/app apps/web/src packages/app-core/src/workflow-builder packages/app-core/src/views/comments-thread.tsx apps/web/test/no-loading-sentences.test.ts apps/web/test/screen-skeletons.test.tsx apps/web/test/sign-in-pending.test.tsx apps/web/test/phone-shell-first-frame.test.tsx test-cases/25-smoothness.md Features.md
git commit -m "Smoothness T8: screen skeletons, busy entry buttons, phone shell in the first frame (cases 25.121-25.143)"
```

---

### Task 9: Notes — cheap remount, parallel resolve, the editor's reserved band, a quiet keystroke

> **Amendment S-R1 (2026-10-02): structural skeletons.** Owner ruling 2026-10-02 ~21:00: *"can the skeleton take at least the shape of what the actual element would look like?"*, then **"Yes, structural skeletons."** Spec `docs/superpowers/specs/2026-10-02-smoothness-design.md` § "Amendment S-R1" (rules 1–5). The task body below is NOT rewritten; where it says a generic shape, a `card`, or `var(--gn-surface-track)`, this note wins. For this task: the notes list item and the editor's reserved band render the real notes-list item container and the editor slot's own box (`EditorSkeleton`'s toolbar line and block are parts inside it). **Tests** assert (a) the skeleton uses the component's own container class and (b) no skeleton fill is the well (`neoWellLight` / `neoWellDark`; the role is `surfacePlaceholder`, from T2). The skeleton copies the content's box by being that box (S1); it names no container style of its own, and §4.3's style-neutral test stands.

**Parallel-safe with neo: yes** (`globals.css:4520` is outside neo's lines).

**Files:**
- Modify: `apps/web/src/notes/notes-page.tsx:158-170` (the workspaces read through `useMyWorkspaces`), `:283-297, 326` (arms → skeletons; the signed-out sentence per NP-03), `apps/web/src/notes/note-document.tsx:155-200` (parallel `getNote`, one read), `:343, 366, 462` (`cacheKey`s), `:405-411, 702, 921` (reading meta deferred), `:896-910` (editor slot reserved), `apps/web/src/notes/note-comments.tsx:128` (composer on focus), `apps/web/src/notes/workspace-notes-section.tsx:122-139, 177, 188, 228-241` (memo + `searching`), `apps/web/src/notes/use-note-autosave.ts:187` (coalesced draft write), `apps/web/app/globals.css:4520` (the band is the skeleton's height too)
- Test: `apps/web/test/notes-smoothness.test.tsx`, `apps/web/test/notes-page.test.tsx` (NP-03 case)

- [ ] **Step 1: Failing tests** (`notes-smoothness.test.tsx`; mount `NotesPage` as `notes-page.test.tsx` does)

```tsx
it('25.151 opening a note asks every workspace in PARALLEL and reads the found note once', async () => {
  const order: string[] = [];
  const getNote = vi.fn(async (ws: string, id: string) => { order.push(`${ws}:start`); await tick(); order.push(`${ws}:end`); return ws === 'ws2' && id === 'n1' ? noteDetail() : null; });
  render(<Providers services={stubServices({ getMyWorkspaces: async () => [ws('ws1'), ws('ws2'), ws('ws3')], getNote, ...noteReads })}><NotesPage noteId="n1" /></Providers>);
  await screen.findByText(noteDetail().title);
  expect(order.indexOf('ws3:start')).toBeLessThan(order.indexOf('ws1:end'));
  expect(getNote.mock.calls.filter(([w, i]) => w === 'ws2' && i === 'n1')).toHaveLength(1);
});

it('25.152 a note switch keeps the tree on screen (served from the cache) and shows the document skeleton in the editor\'s band, which does not move the comments', async () => {
  const { rerender } = render(<Providers services={services}><NotesPage noteId="n1" /></Providers>);
  await screen.findByText(noteDetail().title);
  const commentsTop = screen.getByRole('heading', { name: /Comments/ }).getBoundingClientRect().top;
  const second = deferred<NoteDetail | null>();
  getNote.mockReturnValueOnce(second.promise);
  rerender(<Providers services={services}><NotesPage key="n2" noteId="n2" /></Providers>);
  expect(screen.getByRole('tree')).toBeInTheDocument(); // not "Loading…"
  expect(screen.getByText('Loading the note').parentElement).toHaveAttribute('aria-busy', 'true');
  expect(screen.getByRole('heading', { name: /Comments/ }).getBoundingClientRect().top).toBe(commentsTop);
  act(() => second.resolve(noteDetail({ id: 'n2' })));
});

it('25.153 the comment composer\'s editor mounts on focus, not on open; typing in the document does not re-render the tree', async () => {
  render(<Providers services={services}><NotesPage noteId="n1" /></Providers>);
  await screen.findByText(noteDetail().title);
  expect(document.querySelectorAll('.ProseMirror')).toHaveLength(1);
  await userEvent.click(screen.getByRole('button', { name: /Add a comment/ }));
  expect(document.querySelectorAll('.ProseMirror')).toHaveLength(2);
  const renders = treeRenderSpy(); // a React Profiler around WorkspaceNotesSection, exposed by the test harness
  await userEvent.type(document.querySelector('.ProseMirror')!, 'abc');
  expect(renders()).toBe(0);
});

it('25.154 the signed-out note URL says how to sign in instead of "Loading…" (audit NP-03)', async () => {
  mockUser = null;
  render(<Providers services={services}><NotesPage noteId="n1" /></Providers>);
  expect(await screen.findByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/sign-in?next=%2Fnotes%2Fn1');
  expect(screen.queryByText('Loading…')).toBeNull();
});
```

- [ ] **Step 2: RED**

Run: `cd <worktree>/apps/web && pnpm exec vitest run test/notes-smoothness.test.tsx 2>&1 | tail -15`
Expected: FAIL — sequential order; two editors on open; "Loading…" for the signed-out URL.

- [ ] **Step 3: Implement**

`note-document.tsx:159-168`:

```ts
    void (async () => {
      const hits = await Promise.all(workspacesRef.current.map(async (workspace) => ({ workspace, hit: await dataSource.query.getNote(workspace.id, noteId) })));
      if (cancelled) return;
      const found = hits.find(({ hit }) => hit !== null);
      if (found !== undefined && found.hit !== null) {
        setFound({ key: `note:${found.workspace.id}:${noteId}`, data: found.hit });
        setResolvedWorkspaceId(found.workspace.id);
        setSearched(true);
        return;
      }
      setResolvedWorkspaceId(null);
      setSearched(true);
    })();
```

and the second `getNote` at `:178-194` reads `useLiveQuery(..., { initial: found, cacheKey: found?.key })` so the resolve's answer is its seed and no second request fires. `notes-page.tsx:158-170`: `const { rows: workspaces, error: refusal } = useMyWorkspaces();` replacing the local effect; the arms at `:283-297`: `session.kind === 'loading'` → `<NotesPageShell />`'s inner region; `!signedIn` → the sign-in sentence (already there for `signed-out`, now also the default); `workspaces === null` → `<SkeletonRegion label="Loading your notes"><Skeleton height="1.25rem" rows={8} /></SkeletonRegion>`; the document arm (`:326`) → `<SkeletonRegion label="Loading the note" className="gn-notes__document-skeleton"><Skeleton width="60%" height="var(--gn-title-page-size)" /><Skeleton shape="block" height="var(--gn-notes-editor-min)" /></SkeletonRegion>`, and `globals.css:4520`'s `min-height: max(40dvh, …)` is lifted into `--gn-notes-editor-min` (declared in the appended block; the existing rule reads the variable) so the band and the skeleton are one number. `note-comments.tsx:128`: the composer renders a `Button` "Add a comment" until clicked/focused, then mounts `TicketEditorSlot`. `workspace-notes-section.tsx`: `export const WorkspaceNotesSection = memo(function WorkspaceNotesSection(...))` with the filter/sort in `useMemo` on `[notes, filter, query]`; `:188` reads `searching` and renders `<Skeleton height="1.25rem" rows={2} />` instead of the empty sentence. `note-document.tsx:921`: `onDraftChange` writes the draft to a ref and schedules `extractReadingMeta` through `startTransition` so the keystroke's own render is the editor's only. `use-note-autosave.ts:187`: the `localStorage` write moves inside the 2 s coalesce (one write per save, plus `beforeunload`).

- [ ] **Step 4: GREEN + the notes suites**

Run: `cd <worktree>/apps/web && pnpm exec vitest run test/notes-smoothness.test.tsx test/notes-page.test.tsx test/notes-css.test.tsx test/note-byline-phone.test.tsx 2>&1 | tail -12 && pnpm typecheck`
Expected: PASS; 18.488/18.489 (tree scroll across the remount) keep holding.

- [ ] **Step 5: Catalogue and commit**

Cases 25.151–25.154 ✅; Features §22 bullet "✅ **Notes: a note switch keeps the tree, resolves in parallel, reserves the editor's band, and a keystroke re-renders only the editor** (smoothness T9; audit SM-07, NP-03)".

```bash
git add apps/web/src/notes apps/web/app/globals.css apps/web/test/notes-smoothness.test.tsx apps/web/test/notes-page.test.tsx test-cases/25-smoothness.md Features.md
git commit -m "Smoothness T9: notes parallel resolve, cached tree, reserved editor band, quiet keystroke (cases 25.151-25.154)"
```

---

### Task 10: Bundles — a lean data subpath, the editor and canvas on demand, the manual on its route

**Parallel-safe with neo: yes.**

**Files:**
- Create: `packages/app-core/src/data.ts` (re-exports `data-source.ts`, `cache.ts`, `cache-feed.ts`, `inflight-dedupe.ts`, `session-expired.ts`, `submit.ts`, `precheck.ts`, `views/live-query-cache.ts`, `views/reload-scheduler.ts`, the preference/notification gateway types), `apps/web/src/editor-slot.tsx` (the dynamic `TicketEditorSlot` + `EditorSkeleton`), `apps/web/src/skeletons/editor-skeleton.tsx`
- Modify: `packages/app-core/package.json:8-17` (`"./data"` export; `"sideEffects": ["**/*.css"]`), `packages/editor/package.json` (`"sideEffects": ["**/*.css"]`), `apps/web/src/providers.tsx:5-13` (import from `@gisik-nokma/app-core/data`), `apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx:49-50`, `app/w/[workspaceId]/my-work/page.tsx:14`, `apps/web/src/new-ticket-description-slot.tsx`, the eight `src/notes/*` editor imports (all → `../editor-slot.js`), `app/help/page.tsx` (`next/dynamic` for `HelpBrowser` with `FormPageShell` as `loading`), `app/w/[workspaceId]/settings/workflows/[workflowId]/page.tsx:6` and `workflows/new/page.tsx` (`WorkflowBuilderScreen` via `next/dynamic`), `packages/app-core/src/help/help-browser.tsx:802` (`useDeferredValue(query)`)
- Test: `apps/web/test/import-graph.test.ts`, `packages/app-core/test/help/help-search-deferred.test.tsx`

**Interfaces, produces:** `@gisik-nokma/app-core/data`; `EditorSkeleton({ minHeight?: string })` → a `SkeletonRegion` with a toolbar line and a block of `minHeight` (default `12rem`, the slot's own min-height); `apps/web/src/editor-slot.tsx` exports `TicketEditorSlot` (dynamic, `ssr: false`, `loading: () => <EditorSkeleton />`) and `prefetchEditor()` (calls the same `import()`), which `page.tsx`'s `openTicket` and the notes page's mount call.

- [ ] **Step 1: Failing test** (`apps/web/test/import-graph.test.ts`)

```ts
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const WEB = resolve(__dirname, '..');
const PKGS = resolve(WEB, '../../packages');
const ALIASES: Record<string, string> = { '@gisik-nokma/app-core/data': join(PKGS, 'app-core/src/data.ts'), '@gisik-nokma/app-core/online': join(PKGS, 'app-core/src/online/index.ts'), '@gisik-nokma/app-core': join(PKGS, 'app-core/src/index.ts'), '@gisik-nokma/editor': join(PKGS, 'editor/src/index.ts'), '@gisik-nokma/ui': join(PKGS, 'ui/src/index.ts') };

/** Static imports only (`import … from`), following the repo's `.js` → `.ts(x)` convention; `import()` and type-only imports are not edges. */
function staticGraph(entry: string, seen = new Set<string>()): Set<string> {
  if (seen.has(entry)) return seen;
  seen.add(entry);
  const src = readFileSync(entry, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  for (const m of src.matchAll(/^import\s+(?!type\b)[^'"]*from\s+['"]([^'"]+)['"]/gm)) {
    const spec = m[1]!;
    let target: string | null = null;
    if (spec.startsWith('.')) target = resolve(dirname(entry), spec).replace(/\.js$/, '');
    else if (ALIASES[spec]) target = ALIASES[spec];
    else continue; // node_modules: recorded by name below
    for (const ext of ['', '.ts', '.tsx', '/index.ts']) { try { readFileSync(target + ext); staticGraph(target + ext, seen); break; } catch { /* next */ } }
  }
  for (const m of src.matchAll(/from\s+['"]((?:@tiptap|@xyflow|prosemirror)[^'"]*)['"]/g)) seen.add(`npm:${m[1]}`);
  return seen;
}

describe('route import graphs (spec D6, S9; audit SM-04)', () => {
  it('25.171 the root layout and the sign-in route reach neither the editor, the workflow canvas nor the help manual; the project page reaches the editor only through a dynamic import', () => {
    for (const entry of [join(WEB, 'app/layout.tsx'), join(WEB, 'app/sign-in/page.tsx')]) {
      const graph = [...staticGraph(entry)];
      expect(graph.filter((f) => f.includes('/editor/src/') || f.startsWith('npm:@tiptap')), entry).toEqual([]);
      expect(graph.filter((f) => f.includes('workflow-builder/') || f.startsWith('npm:@xyflow')), entry).toEqual([]);
      expect(graph.filter((f) => f.includes('help/content.generated')), entry).toEqual([]);
    }
    const project = [...staticGraph(join(WEB, 'app/w/[workspaceId]/p/[projectId]/page.tsx'))];
    expect(project.filter((f) => f.includes('/editor/src/'))).toEqual([]);
    // Control: the editor-slot module itself does reach the editor, dynamically.
    expect(readFileSync(join(WEB, 'src/editor-slot.tsx'), 'utf8')).toMatch(/import\('@gisik-nokma\/editor'\)/);
  });

  it('25.172 app-core and editor declare their side effects, so a bundler may drop what a route does not import', () => {
    for (const pkg of ['app-core', 'editor']) {
      const json = JSON.parse(readFileSync(join(PKGS, pkg, 'package.json'), 'utf8')) as { sideEffects?: unknown };
      expect(json.sideEffects, pkg).toEqual(['**/*.css']);
    }
  });
});
```

(`help-search-deferred.test.tsx`: typing three characters quickly into the help search renders the input's value synchronously while the results list lags at most one deferred render; assert via a Profiler that the results list rendered fewer times than keystrokes.)

- [ ] **Step 2: RED**

Run: `cd <worktree>/apps/web && pnpm exec vitest run test/import-graph.test.ts 2>&1 | tail -15`
Expected: FAIL — `layout.tsx` → `providers.tsx` → `@gisik-nokma/app-core` → `workflow-builder/index.ts` → `npm:@xyflow/react`, and `help/content.generated.ts`.

- [ ] **Step 3: Implement**

```ts
// packages/app-core/src/data.ts — the data layer without a single view. Imported by the web shell's Providers (FD: spec D6).
export * from './data-source.js';
export { createClientStateCache, type ClientStateCache } from './cache.js';
export { withCacheFeed } from './cache-feed.js';
export { withInflightDedupe } from './inflight-dedupe.js';
export { makeSubmittedFactory, type EnvelopeSeed, type MakeSubmitted } from './submit.js';
export { precheckEvent } from './precheck.js';
export * from './session-expired.js';
export { clearLiveQueryCache, liveQueryAgeMs, recallLiveQuery, rememberLiveQuery, staleWorkspaces } from './views/live-query-cache.js';
export { scheduleReload, subscribeReloads } from './views/reload-scheduler.js';
export type { NotificationPreferencesGateway, NotificationsGateway, UserPreferences, WorkflowAuthoringGateway } from './index.js';
```

(the last line is types only, so it adds no runtime edge; if `index.ts` re-exports those types from their own modules, point at those modules instead.) `package.json` exports gain `"./data": { "types": "./dist/data.d.ts", "default": "./dist/data.js" }` and `"sideEffects": ["**/*.css"]`. `providers.tsx:5-13` imports from `@gisik-nokma/app-core/data`; `bottom-bar.tsx:8-16` imports its two helpers from their modules' subpaths or moves them to `apps/web/src`.

```tsx
// apps/web/src/editor-slot.tsx
'use client';
import dynamic from 'next/dynamic';
import { EditorSkeleton } from './skeletons/editor-skeleton.js';
const load = () => import('@gisik-nokma/editor');
export const TicketEditorSlot = dynamic(() => load().then((m) => m.TicketEditorSlot), { ssr: false, loading: () => <EditorSkeleton /> });
export { uploadAttachmentHttp } from '@gisik-nokma/editor/upload'; // a new subpath that holds only the fetch helper, no Tiptap
/** Warm the editor chunk when a ticket or note is about to be shown (spec D6). */
export function prefetchEditor(): void { void load(); }
```

`uploadAttachmentHttp` must not drag Tiptap: give `packages/editor` an `./upload` export pointing at its upload module (grep `export function uploadAttachmentHttp` for the file). Every static `from '@gisik-nokma/editor'` in `apps/web` becomes `from '../editor-slot.js'` (relative depth per file). `help/page.tsx`: `const HelpBrowser = dynamic(() => import('@gisik-nokma/app-core/help').then((m) => m.HelpBrowser), { loading: () => <FormPageShell title="Help" /> })` with a `"./help"` subpath export; the two workflow routes import `WorkflowBuilderScreen` through `dynamic(() => import('@gisik-nokma/app-core/workflow-builder').then(m => m.WorkflowBuilderScreen), { ssr: false, loading: () => <FormPageShell title="Workflow" /> })` with a `"./workflow-builder"` subpath. `help-browser.tsx:802`: `const deferredQuery = useDeferredValue(query); const result = useMemo(() => searchHelp(HELP_CONTENT, deferredQuery), [deferredQuery]);`.

- [ ] **Step 4: GREEN, then the build table**

Run: `cd <worktree> && pnpm -r --filter './packages/*' build && cd apps/web && pnpm exec vitest run test/import-graph.test.ts test/app-nav.test.tsx test/project-page-smoothness.test.tsx test/notes-smoothness.test.tsx 2>&1 | tail -12 && pnpm typecheck && pnpm build > /private/tmp/claude-501/smooth-t10-build.log 2>&1; grep -A40 "Route (app)" /private/tmp/claude-501/smooth-t10-build.log`
Expected: PASS; the table shows `/sign-in` and `/workspaces` First Load JS well under the previous shared 471 KB gzip (target ≤ 120 KB and ≤ 300 KB gzip respectively; record the measured numbers in case 25.173 🧪 with the log path).

- [ ] **Step 5: Catalogue and commit**

Cases 25.171, 25.172 ✅, 25.173 🧪 (the build table quoted); Features §22 bullet "✅ **Code arrives when it is needed: the data layer alone on every route, the editor, canvas and manual on demand** (smoothness T10; audit SM-04, SM-16; owner D6)".

```bash
git add packages/app-core/package.json packages/app-core/src/data.ts packages/app-core/src/help/help-browser.tsx packages/editor/package.json packages/editor/src apps/web/src apps/web/app apps/web/test/import-graph.test.ts packages/app-core/test/help/help-search-deferred.test.tsx test-cases/25-smoothness.md Features.md
git commit -m "Smoothness T10: lean data subpath, dynamic editor/canvas/help, sideEffects (cases 25.171-25.173)"
```

---

### Task 11: Server — one rollup query per page, compressed responses

**Parallel-safe with neo: yes.**

**Files:**
- Modify: `apps/server/src/visibility/rollup.ts:222-325` (add `rollupsFor`; `rollupFor` delegates), `apps/server/src/read/ticket-cards.ts:146-175` (one batch call), `apps/server/src/app.ts:770-776` (register `@fastify/compress` beside cors), `apps/server/package.json` (`"@fastify/compress": "^8.0.0"`)
- Test: `apps/server/test/visibility/rollup.test.ts` (new cases), `apps/server/test/read/ticket-cards-batch.test.ts`, `apps/server/test/app.test.ts` (compression case)

**Interfaces, produces:** `rollupsFor(db: Queryable, viewerId: string, ticketIds: readonly string[]): Promise<Map<string, RollupView>>` (a parent with no children is absent from the map); `rollupFor` unchanged in signature.

- [ ] **Step 1: Failing tests** (append to `rollup.test.ts`, using its existing seeds)

```ts
describe('rollupsFor — one query for many parents (spec D7; audit SM-06)', () => {
  it('25.191 the batch equals the per-ticket answers for every parent, and a parent with no children is absent', async () => {
    const parents = [parentA, parentB, childless]; // seeded in beforeEach as the file already does for rollupFor
    const batch = await rollupsFor(db.pool, viewer, parents);
    for (const id of [parentA, parentB]) expect(batch.get(id)).toEqual(await rollupFor(db.pool, viewer, id));
    expect(batch.has(childless)).toBe(false);
    expect(await rollupFor(db.pool, viewer, childless)).toBeNull();
  });

  it('25.192 fifty parents cost at most four queries (children, roles per workspace, the arm set), not fifty', async () => {
    const ids = await seedParentsWithChildren(50);
    let queries = 0;
    const spy = { query: (...args: unknown[]) => { queries += 1; return (db.pool.query as (...a: unknown[]) => unknown)(...args); } } as unknown as Queryable;
    const batch = await rollupsFor(spy, viewer, ids);
    expect(batch.size).toBe(50);
    expect(queries).toBeLessThanOrEqual(4);
    // Control: the per-ticket path costs at least one query per parent.
    queries = 0;
    for (const id of ids) await rollupFor(spy, viewer, id);
    expect(queries).toBeGreaterThanOrEqual(50);
  });
});
```

(`app.test.ts`)

```ts
it('25.193 a JSON answer over 1 KB is gzip-encoded when the client accepts it, and plain when it does not', async () => {
  const app = buildTestApp(db).app;
  app.get('/__big', async () => ({ rows: Array.from({ length: 200 }, (_, i) => ({ i, text: 'x'.repeat(16) })) }));
  await app.ready();
  const gz = await app.inject({ url: '/__big', headers: { 'accept-encoding': 'gzip' } });
  expect(gz.headers['content-encoding']).toBe('gzip');
  const plain = await app.inject({ url: '/__big', headers: { 'accept-encoding': 'identity' } });
  expect(plain.headers['content-encoding']).toBeUndefined();
  expect(JSON.parse(plain.body).rows).toHaveLength(200);
});
```

- [ ] **Step 2: RED**

Run: `cd <worktree>/apps/server && pnpm exec vitest run test/visibility/rollup.test.ts test/app.test.ts 2>&1 | tail -15`
Expected: FAIL — `rollupsFor` is not exported; no `content-encoding`.

- [ ] **Step 3: Implement `rollupsFor`** (the body of `rollupFor` generalised; `rollupFor` becomes `return (await rollupsFor(db, viewerId, [ticketId])).get(ticketId) ?? null;`)

```ts
export async function rollupsFor(db: Queryable, viewerId: string, ticketIds: readonly string[]): Promise<Map<string, RollupView>> {
  const out = new Map<string, RollupView>();
  if (ticketIds.length === 0) return out;
  const { rows } = await db.query<ChildRow & { parent_id: string }>(
    `SELECT v.parent_id, v.ticket_id, v.workspace_id, v.project_id, v.resolved_mode, v.resolved_user_ids,
            t.state_category
     FROM proj_visibility v
     LEFT JOIN proj_tickets t ON t.ticket_id = v.ticket_id
     WHERE v.parent_id = ANY($1::text[])
       AND ((t.deleted_at IS NULL
             AND NOT EXISTS (SELECT 1 FROM proj_projects dp WHERE dp.project_id = t.project_id AND dp.deleted_at IS NOT NULL))
            OR t.ticket_id IS NULL)
     ORDER BY v.parent_id, v.ticket_id`,
    [[...ticketIds]],
  );
  if (rows.length === 0) return out;
  const roleByWorkspace = new Map<string, EffectiveRole>();
  for (const ws of new Set(rows.map((r) => r.workspace_id))) roleByWorkspace.set(ws, await resolveEffectiveRole(db, viewerId, ws));
  type Acc = { total: number; terminal: number; uncategorized: number; notAdmitted: number; candidates: string[] };
  const acc = new Map<string, Acc>();
  for (const child of rows) {
    const a = acc.get(child.parent_id) ?? { total: 0, terminal: 0, uncategorized: 0, notAdmitted: 0, candidates: [] };
    a.total += 1;
    if (child.state_category === null) a.uncategorized += 1;
    else if (child.state_category === 'terminal') a.terminal += 1;
    const eff = roleByWorkspace.get(child.workspace_id)!;
    const visible = canSeeResolved(eff, viewerId, { workspaceId: child.workspace_id, projectId: child.project_id, resolvedMode: child.resolved_mode, resolvedUserIds: child.resolved_user_ids });
    if (!visible) { a.notAdmitted += 1; if (eff.workspaceRole !== null) a.candidates.push(child.ticket_id); }
    acc.set(child.parent_id, a);
  }
  const armReach = await assigneeArmTickets(db, viewerId, [...acc.values()].flatMap((a) => a.candidates));
  for (const [parentId, a] of acc) {
    const reached = a.candidates.filter((id) => armReach.has(id)).length;
    out.set(parentId, { total: a.total, terminal: a.terminal, uncategorized: a.uncategorized, restrictedCount: a.notAdmitted - reached });
  }
  return out;
}
```

(`resolveEffectiveRole` is awaited per distinct workspace in a loop, which is at most one query per workspace on the page; the 25.192 bound of four assumes one workspace, which the board and list routes guarantee.) `ticket-cards.ts:158-166`: `const rollups = await rollupsFor(db, viewerId, rows.map((r) => r.ticket_id));` before the loop and `const rollupView = rollups.get(row.ticket_id) ?? null;` inside it; rewrite the docblock at `:140-144` (prose-is-a-claim: "the batch belongs INSIDE rollupFor" has happened). `app.ts:770`: `void app.register(compress, { encodings: ['br', 'gzip'], threshold: 1024 });` before cors, after `import compress from '@fastify/compress';`. If audit measurement 7 shows the edge already compresses `/v1`, skip the compress half and record it in the case line.

- [ ] **Step 4: GREEN + the read suites**

Run: `cd <worktree>/apps/server && pnpm exec vitest run test/visibility test/read test/app.test.ts test/integration/real-door-round-trip.test.ts 2>&1 | tail -12 && pnpm typecheck`
Expected: PASS; every existing `rollupFor` case holds through the delegation (needs the shared test Postgres on 54329).

- [ ] **Step 5: Catalogue and commit**

Cases 25.191–25.193 ✅; Features §22 bullet "⚙️ **One rollup query per page and compressed answers** (smoothness T11; audit SM-06; `apps/server/src/visibility/rollup.ts`, `read/ticket-cards.ts`, `app.ts`)".

```bash
git add apps/server/src/visibility/rollup.ts apps/server/src/read/ticket-cards.ts apps/server/src/app.ts apps/server/package.json pnpm-lock.yaml apps/server/test/visibility/rollup.test.ts apps/server/test/app.test.ts test-cases/25-smoothness.md Features.md
git commit -m "Smoothness T11: batched rollupsFor, @fastify/compress (cases 25.191-25.193)"
```

---

### Task 12: Board rendering cost — memoised cards, containment, deferred search

**Parallel-safe with neo: yes** (`ui.css:1287` and `:1601` are outside neo's ranges 1168–1178; a rule that already exists is EDITED in place, never re-declared, because `ruleExactly` refuses a selector declared twice).

**Files:**
- Modify: `packages/app-core/src/views/board.tsx:1345-1356` (stable per-card callbacks), `:1845-1853` (`BoardCardSlot` wrapped in `memo`), `packages/ui/src/ui.css:1287` (`.gn-board__cards` gains `contain: content`), `:1601` (`.gn-board__card-slot` gains `content-visibility: auto; contain-intrinsic-size: auto 5.5rem`), `apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx:683, 850, 1721, 2407-2410` (the narrowings read a deferred filter), `apps/web/src/providers.tsx:318-324` (`useSessionStatus` memoised per user)
- Test: `packages/app-core/test/views/board-render-cost.test.tsx`, `packages/ui/test/board-containment-css.test.ts`, `apps/web/test/search-deferred.test.tsx`

- [ ] **Step 1: Failing tests** (`board-render-cost.test.tsx`)

```tsx
import { Profiler, type ProfilerOnRenderCallback } from 'react';
it('25.201 opening a drag on one card re-renders at most that column\'s slots, not all 300', async () => {
  const columns = [0, 1, 2].map((c) => ({ stateId: `st_${c}`, name: `S${c}`, cards: Array.from({ length: 100 }, (_, i) => card(`t_${c}_${i}`)) }));
  const view: BoardView = { projectId: PROJECT, groups: [{ workflowId: WF_ERRAND.id, columns }] };
  const slotRenders = new Map<string, number>();
  const onRender: ProfilerOnRenderCallback = (id) => slotRenders.set(id, (slotRenders.get(id) ?? 0) + 1);
  render(<Profiler id="board" onRender={onRender}><Board board={{ view } as never} onOpenTicket={() => {}} today="2026-10-02" currentUserId={CURRENT_USER} moves={moveCapability()} /></Profiler>);
  const before = countSlotCommits(); // reads data-render-count stamped by a test-only effect in BoardCardSlot under NODE_ENV=test
  fireEvent.dragStart(screen.getByText('Ticket t_0_0').closest('li')!);
  const after = countSlotCommits();
  expect(after - before).toBeLessThanOrEqual(100);
  // Control: the first mount rendered every slot once.
  expect(before).toBe(300);
});
```

(`board-containment-css.test.ts`)

```ts
it('25.202 the card list is layout-contained and each slot skips off-screen rendering with a reserved size', () => {
  const css = readUiCss();
  expect(valueOf(ruleExactly(css, '.gn-board__cards'), 'contain')).toBe('content');
  const slot = ruleExactly(css, '.gn-board__card-slot');
  expect(valueOf(slot, 'content-visibility')).toBe('auto');
  expect(valueOf(slot, 'contain-intrinsic-size')).toBe('auto 5.5rem');
  // Control: the column itself (neo's range) is untouched.
  expect(valueOf(ruleExactly(css, '.gn-board__column'), 'contain')).toBeNull();
});
```

(`search-deferred.test.tsx`)

```tsx
it('25.203 typing three characters quickly updates the search field on every keystroke while the board narrows at most once per settled value', async () => {
  render(<Providers services={bigBoardServices(300)}><ProjectPage /></Providers>);
  const box = await screen.findByRole('searchbox');
  const narrowings = narrowingRenderSpy();
  await userEvent.type(box, 'abc', { delay: 1 });
  expect(box).toHaveValue('abc');
  await waitFor(() => expect(screen.getByText(/of 300 shown/)).toBeInTheDocument());
  expect(narrowings()).toBeLessThan(3);
});
```

- [ ] **Step 2: RED**

Run: `cd <worktree>/packages/app-core && pnpm exec vitest run test/views/board-render-cost.test.tsx 2>&1 | tail -10 && cd ../ui && pnpm exec vitest run test/board-containment-css.test.ts 2>&1 | tail -6`
Expected: FAIL — 300 slot commits on drag start; `contain` is null.

- [ ] **Step 3: Implement**

`board.tsx:1845`: `const BoardCardSlot = memo(function BoardCardSlot({ … }: BoardCardSlotProps) { … });` with the props object typed as an exported `BoardCardSlotProps`. `:1345-1356`: the per-card closures become stable: `onOpen` is replaced by passing `onOpenTicket` and letting the slot call `onOpenTicket(card.ticketId)`; `onDragBegin` becomes a column-level `useCallback((ticketId, height) => setDrag({ ticketId, fromStateId: column.stateId, height }), [column.stateId])` and the slot calls it with its id; `arrows(card, column.stateId)` is computed inside the slot from a stable `arrows` function and `stateId` prop (the function identity is already memoised at `:1086`). `ui.css:1287`: `.gn-board__cards { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.5rem; contain: content; }`; `:1601`: `.gn-board__card-slot { cursor: pointer; position: relative; scroll-margin: var(--gn-space-2); content-visibility: auto; contain-intrinsic-size: auto 5.5rem; }` — then run `board-card-flight.test.ts`/`board-drop-placeholder.test.ts`: the flight uses `getBoundingClientRect` on slots that may be `content-visibility: auto`-skipped; the flight effects already read rects after `scrollIntoView` (`board.tsx:1914, 1948`), and Chromium renders a slot the moment it is scrolled to, so the case 20.144 (🧪) is re-run in the browser by T14. `page.tsx:2407-2410`: `const deferredFilter = useDeferredValue(filter);` and the three memos (`:683, 850, 1721`) read `deferredFilter`; the chips keep `filter`. `providers.tsx:318-324`: `useMemo` the returned object on `[kind, user.id, user.name]`.

- [ ] **Step 4: GREEN + the board suites**

Run: `cd <worktree>/packages/ui && pnpm exec vitest run 2>&1 | tail -6 && cd ../app-core && pnpm exec vitest run test/views 2>&1 | tail -10 && pnpm typecheck && cd ../../apps/web && pnpm exec vitest run test/search-deferred.test.tsx test/project-page-smoothness.test.tsx 2>&1 | tail -8`
Expected: PASS, including 20.125–20.148 (moves), 20.160–20.179 (glides), 23.120–23.128 (phone board).

- [ ] **Step 5: Catalogue and commit**

Cases 25.201–25.203 ✅; Features §22 bullet "⚙️ **A board of hundreds of cards re-renders one column and skips what is off screen; search narrows in a deferred render** (smoothness T12; audit SM-10; owner D12)".

```bash
git add packages/app-core/src/views/board.tsx packages/ui/src/ui.css "apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx" apps/web/src/providers.tsx packages/app-core/test/views/board-render-cost.test.tsx packages/ui/test/board-containment-css.test.ts apps/web/test/search-deferred.test.tsx test-cases/25-smoothness.md Features.md
git commit -m "Smoothness T12: memoised card slots, containment, deferred search (cases 25.201-25.203)"
```

---

### Task 13: Desktop and mobile loading states

> **Amendment S-R1 (2026-10-02): structural skeletons.** Owner ruling 2026-10-02 ~21:00: *"can the skeleton take at least the shape of what the actual element would look like?"*, then **"Yes, structural skeletons."** Spec `docs/superpowers/specs/2026-10-02-smoothness-design.md` § "Amendment S-R1" (rules 1–5). The task body below is NOT rewritten; where it says a generic shape, a `card`, or `var(--gn-surface-track)`, this note wins. For this task: the desktop and mobile loading states render the same real component containers as their web counterparts, with parts inside. **Tests** assert (a) the skeleton uses the component's own container class and (b) no skeleton fill is the well (`neoWellLight` / `neoWellDark`; the role is `surfacePlaceholder`, from T2). The skeleton copies the content's box by being that box (S1); it names no container style of its own, and §4.3's style-neutral test stands.

**Parallel-safe with neo: yes.**

**Files:**
- Modify: `apps/desktop/index.html:1-12`, `apps/desktop/src/app.tsx:176-210`, `apps/mobile/src/screens/board-screen.tsx:45-92`, `apps/mobile/src/screens/ticket-screen.tsx:11, 44-46`, `apps/mobile/src/editor/editor-web-view.tsx:148-166`
- Create: `apps/mobile/src/components/skeleton.tsx` (an RN `View` with the track colour from `@gisik-nokma/ui/tokens`, `accessibilityState={{ busy: true }}`)
- Test: `apps/desktop/src/app.test.tsx` (new), `apps/desktop/index-html.test.ts` (new), `apps/mobile/src/screens/board-screen.test.tsx` (if the mobile package has a jest/vitest harness; else 🧪 with a device capture noted)

- [ ] **Step 1: Failing tests** (`apps/desktop/index-html.test.ts`)

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
describe('the desktop window is never white before React (spec §3.3; audit SM-12)', () => {
  it('25.211 index.html paints the stored theme\'s ground from the first byte and honours the OS dark preference when nothing is stored', () => {
    const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
    expect(html).toMatch(/<style[^>]*data-gn-ground[^>]*>[\s\S]*html\s*\{\s*background:\s*#f1eae3/);
    expect(html).toMatch(/prefers-color-scheme:\s*dark[\s\S]*html\s*\{\s*background:\s*#121a33/);
    expect(html).toMatch(/localStorage\.getItem\('gn-theme'\)/);
    expect(html).toMatch(/data-theme/);
  });
});
```

(`apps/desktop/src/app.test.tsx`)

```tsx
it('25.212 the window shows a skeleton list while the replica opens, and "No tickets yet" only after the first read answered empty', async () => {
  const open = deferred<ReplicaDataSource>();
  vi.mocked(createReplica).mockReturnValue(open.promise);
  render(<App />);
  expect(screen.getByText('Opening your local copy').parentElement).toHaveAttribute('aria-busy', 'true');
  expect(document.querySelectorAll('.gn-skeleton--block')).toHaveLength(6);
  expect(screen.queryByText('No tickets yet')).toBeNull();
  act(() => open.resolve(replicaWith([])));
  expect(await screen.findByText('No tickets yet')).toBeInTheDocument();
});

it('25.213 ten engine events inside 200 ms cause one list read, not ten', async () => {
  const ds = replicaWith([summary('t1')]);
  render(<App />); // with createReplica resolving ds at once
  await screen.findByText(summary('t1').title);
  const before = ds.query.listTicketSummaries.mock.calls.length;
  for (let i = 0; i < 10; i += 1) ds.emit({ type: 'event', workspaceId: WS, envelope: {} as never });
  await new Promise((r) => setTimeout(r, 250));
  expect(ds.query.listTicketSummaries.mock.calls.length - before).toBe(1);
});
```

- [ ] **Step 2: RED**

Run: `cd <worktree>/apps/desktop && pnpm exec vitest run 2>&1 | tail -12`
Expected: FAIL.

- [ ] **Step 3: Implement**

`apps/desktop/index.html` `<head>` gains, before the module script:

```html
    <style data-gn-ground>
      html { background: #f1eae3; }
      @media (prefers-color-scheme: dark) { html { background: #121a33; } }
      html[data-theme="light"] { background: #f1eae3; }
      html[data-theme="dark"] { background: #121a33; }
    </style>
    <script>try{var t=localStorage.getItem('gn-theme');if(t==='light'||t==='dark'){document.documentElement.dataset.theme=t;}}catch(e){}</script>
```

(the two hexes are `surface` for neo light and the page ground for neo dark at `4f86b959`; `index.html` is outside the colour scanner's roots, `colour-scan.ts:24-32`, and the file states in a comment that these mirror `tokens.ts` and must follow a change to those two roles). `app.tsx:176-210`: the `ds === null` arm becomes `<SkeletonRegion label="Opening your local copy"><Skeleton shape="block" height="3rem" rows={6} /></SkeletonRegion>`; `TicketList` holds `tickets: TicketSummary[] | null` starting `null`, renders the same skeleton while `null`, "No tickets yet" on `[]`; the subscription's `refresh` is debounced through a 200 ms timer (one `setTimeout` reset per event, the shape of `scheduleReload`).

Mobile: `board-screen.tsx:45-92` renders `<SkeletonList rows={6} />` (the new RN component) in the `FlatList`'s slot while `ds === null || tickets === null`, and `ListEmptyComponent={<Text>No tickets yet</Text>}` once a read answered; `ticket-screen.tsx:44-46`'s two "Opening…" become a title-line + block skeleton; `:11`'s static import of the editor HTML becomes `const [html, setHtml] = useState<string | null>(null); useEffect(() => { void import('../editor/editor-html.generated.js').then((m) => setHtml(m.EDITOR_HTML)); }, []);` with the skeleton in the editor's slot while `null`; `editor-web-view.tsx:152-166` gains `startInLoadingState renderLoading={() => <SkeletonBlock height={EDITOR_MIN_HEIGHT} />}` and a fixed `style={{ minHeight: EDITOR_MIN_HEIGHT }}` so the `ScrollView` reserves the band.

- [ ] **Step 4: GREEN**

Run: `cd <worktree>/apps/desktop && pnpm exec vitest run 2>&1 | tail -8 && pnpm typecheck && cd ../mobile && pnpm typecheck`
Expected: PASS; the mobile board/ticket cases are 🧪 (an Expo device capture, noted with the device and build) unless the package has a renderer harness.

- [ ] **Step 5: Catalogue and commit**

Cases 25.211–25.213 ✅, 25.214–25.216 (mobile board, ticket, webview) 🧪 or ✅; Features §12 (the apps) gains the two bullets under the existing desktop/mobile headings and §22 cross-references them.

```bash
git add apps/desktop/index.html apps/desktop/src apps/desktop/index-html.test.ts apps/mobile/src test-cases/25-smoothness.md Features.md
git commit -m "Smoothness T13: desktop ground before React, skeleton lists, debounced refresh; mobile board/ticket/webview placeholders (cases 25.211-25.216)"
```

---

### Task 14: The capture, the ratchet and the re-audit

**Parallel-safe with neo: yes.** Runs LAST, on the release tip, when the dev stack is free (P4).

**Files:**
- Create: `gisik-nokma-lanes/smoothness-2026-10-02/capture-perf.mjs` (derived from `audit-2026-10-01/capture.mjs`: one paced Playwright process, the same sign-in helper, a 429 check per response), `apps/web/e2e-stack/smoothness.spec.ts`, `apps/web/e2e-stack/smoothness-baseline.json`
- Test: the spec file itself

**Interfaces, produces:** `metrics.jsonl` rows `{ route, viewport, style, theme, lcpMs, cls, inpMs, requests, firstContentMs, swapShiftCls }` and a baseline keyed `${viewport}|${route}` with `{ cls, requests, swapShiftCls }` ratcheted downward the way `tap-target-baseline.json` is.

- [ ] **Step 1: Write the spec** (`smoothness.spec.ts`, shape of `viewport.spec.ts`)

```ts
import { expect, test } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { signIn } from './helpers/sign-in.js';
import { readWorkspaceId, seededProjectHref } from './helpers/board.js';

const BASELINE = fileURLToPath(new URL('./smoothness-baseline.json', import.meta.url));
type Row = { cls: number; requests: number; swapShiftCls: number };
const RATCHET = process.env['SMOOTHNESS_RECORD'] === '1';

async function vitals(page: import('@playwright/test').Page) {
  return page.evaluate(() => new Promise<{ cls: number; lcp: number }>((resolve) => {
    let cls = 0; let lcp = 0;
    new PerformanceObserver((l) => { for (const e of l.getEntries() as (PerformanceEntry & { hadRecentInput?: boolean; value?: number })[]) if (!e.hadRecentInput) cls += e.value ?? 0; }).observe({ type: 'layout-shift', buffered: true });
    new PerformanceObserver((l) => { const last = l.getEntries().at(-1); if (last) lcp = last.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true });
    setTimeout(() => resolve({ cls, lcp }), 1500);
  }));
}

test.describe('smoothness ratchet (spec §6, §7; cases 25.231-25.234)', () => {
  test('25.231 every route paints its skeleton first, swaps it with no layout shift above 0.01, and asks no duplicate URL', async ({ page }, info) => {
    const requests: string[] = [];
    page.on('request', (r) => { if (r.url().includes('/v1/')) requests.push(new URL(r.url()).pathname + new URL(r.url()).search); });
    page.on('response', (r) => expect(r.status(), r.url()).not.toBe(429));
    await signIn(page);
    const ws = await readWorkspaceId(page);
    const routes = ['/workspaces', `/w/${ws}`, await seededProjectHref(page), `/w/${ws}/my-work`, `/w/${ws}/members`, '/inbox', '/notes', '/account', '/settings'];
    const baseline = JSON.parse(readFileSync(BASELINE, 'utf8')) as Record<string, Row>;
    const next: Record<string, Row> = { ...baseline };
    for (const route of routes) {
      requests.length = 0;
      await page.goto(route, { waitUntil: 'commit' });
      const busy = page.locator('main[aria-busy="true"], [aria-busy="true"]').first();
      await expect(busy).toBeVisible({ timeout: 2000 });
      await expect(page.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 15000 });
      const { cls, lcp } = await vitals(page);
      const key = `${info.project.name}|${route.replace(/[0-9A-Z]{26}/g, '<id>')}`;
      const dupes = requests.filter((u, i) => requests.indexOf(u) !== i);
      expect(dupes, `${key} duplicate reads`).toEqual([]);
      const row: Row = { cls, requests: requests.length, swapShiftCls: cls };
      const prior = baseline[key];
      if (prior !== undefined && !RATCHET) {
        expect(cls, `${key} CLS`).toBeLessThanOrEqual(Math.max(prior.cls, 0.01));
        expect(requests.length, `${key} requests`).toBeLessThanOrEqual(prior.requests);
      }
      expect(lcp, `${key} LCP`).toBeLessThan(info.project.name.includes('390') ? 2500 : 1500);
      next[key] = prior === undefined || RATCHET ? row : { cls: Math.min(prior.cls, cls), requests: Math.min(prior.requests, requests.length), swapShiftCls: Math.min(prior.swapShiftCls, cls) };
    }
    if (RATCHET) writeFileSync(BASELINE, JSON.stringify(next, null, 2) + '\n');
  });

  test('25.232 a ticket state change on the board paints within one frame and the sheet never flickers the old title', async ({ page }) => {
    await signIn(page);
    await page.goto(await seededProjectHref(page));
    await page.locator('.gn-board__card-slot').first().click();
    const title = page.getByRole('textbox', { name: /Title/ });
    await title.fill('Renamed by 25.232');
    const t0 = Date.now();
    await title.press('Enter');
    await expect(title).toHaveValue('Renamed by 25.232');
    expect(Date.now() - t0).toBeLessThan(50);
    const values: string[] = [];
    for (let i = 0; i < 20; i += 1) { values.push(await title.inputValue()); await page.waitForTimeout(50); }
    expect(values.every((v) => v === 'Renamed by 25.232')).toBe(true);
  });
});
```

- [ ] **Step 2: Record the baseline on the release tip, then run the ratchet**

Run: `cd <worktree>/apps/web && SMOOTHNESS_RECORD=1 pnpm exec playwright test -c playwright.stack.config.ts e2e-stack/smoothness.spec.ts > /private/tmp/claude-501/smooth-t14-record.log 2>&1; tail -20 /private/tmp/claude-501/smooth-t14-record.log && pnpm exec playwright test -c playwright.stack.config.ts e2e-stack/smoothness.spec.ts > /private/tmp/claude-501/smooth-t14-run.log 2>&1; tail -20 /private/tmp/claude-501/smooth-t14-run.log`
Expected: the recording run writes one row per `viewport|route` (390, 768, 1440 from the stack config's projects); the second run passes against it with zero duplicates and zero 429s.

- [ ] **Step 3: The capture and the re-audit**

Run `node gisik-nokma-lanes/smoothness-2026-10-02/capture-perf.mjs --base http://localhost:3001 --out metrics.jsonl` (the audit's capture with the vitals evaluation above added per frame, three styles × two themes × three widths, paced 1.5 s per page) and compare against the AUDIT's "Measurements requested" list: every number in spec §6 is either met or recorded with its gap in `RE-AUDIT.md` beside the audit. A reviewer re-walks SM-01–SM-13 on the new frames and closes each with its after-screenshot; 20.144 (the move's feel) and 25.214–25.216 (mobile) are re-run by hand and quoted.

- [ ] **Step 4: Catalogue and commit**

Cases 25.231, 25.232 ✅, 25.233 (the capture) and 25.234 (the re-audit) 🧪 with the log paths; Features §22 bullet "⚙️ **A repeatable smoothness capture and a CLS/requests ratchet** (smoothness T14; `apps/web/e2e-stack/smoothness.spec.ts`, `smoothness-baseline.json`, `gisik-nokma-lanes/smoothness-2026-10-02/capture-perf.mjs`)". Every `?` left in §22 by earlier tasks is flipped here or removed.

```bash
git add apps/web/e2e-stack/smoothness.spec.ts apps/web/e2e-stack/smoothness-baseline.json test-cases/25-smoothness.md Features.md
git commit -m "Smoothness T14: the capture, the CLS/requests ratchet and the re-audit (cases 25.231-25.234)"
```

---

## Self-review (writing-plans §Self-Review, done 2026-10-02 against the spec)

**1. Spec coverage.** §3.1 S1 (T2, T5, T6, T8, T14 ratchet), S2 (T2 `useWait`), S3 (T8: skeletons only while `null`, empty states on `[]`), S4 (T3 cache, T6 transitions), S5 (T7), S6 (T2 `Pending`/`Button busy`, the polite region: **gap found and closed** — `useAnnounce()` and the root-layout `role="status"` region of spec §5 had no task; added to T2's scope as `packages/ui/src/announce.tsx` (`AnnounceRegion`, `useAnnounce`) with case 25.010 "one polite region mounted beside the route announcer receives 'Saved' and 'Couldn't save: <reason>'", mounted in `apps/web/app/layout.tsx` by T5 and fed by T7's settle/drop arms), S7 (T8's sweep 25.121), S8 (T2's keyframe arms; the per-rule sweep of spec §3.2 "a test sweeps every `animation:` declaration for a `reduce` arm" is case 25.019's sibling 25.018 — the sweep over the whole stylesheet is NOT written; it is added to T2 as case 25.017b: every selector with an `animation` declaration in `ui.css` has a rule under `@media (prefers-reduced-motion: reduce)` naming the same selector, with a control that plants an ungated one in a temp copy), S9 (T10), S10 (T14). §3.2: primitives T2; cache/dedupe/wave T3; one workspaces read T4; route transitions T5; nav stability T8; freshness T4; bundles T10; server T11. §3.3: project page T6/T7/T12; board writes T7; sheet T7; dialog T7; notes T9; secondary screens T8; settings/account T8; sign-in/invite T8; help T10; phone shell T8; desktop/mobile T13. §5 accessibility: T2 (aria-busy, hidden sentence, busy buttons), the region above, T5 (route announcer untouched). §6 budgets: T14. §7 verification: each task's Step 1 plus T14. §8 out of scope: no task touches tokens, IndexedDB, virtualization, hub rooms.

**2. Placeholder scan.** No "TBD"/"TODO"/"handle edge cases". Two steps describe code by reference rather than in full: T8 Step 3's per-screen skeleton edits (each is the same four-line swap shown for Members; the shapes are enumerated per screen in Step 1) and T7's assignee/priority/dates sites ("the same three lines" with the three lines shown for the title). Both name the exact file:line anchors and the exact code to repeat, which the no-placeholders rule allows when the code is shown once in the same task.

**3. Type consistency.** `useLiveQuery`'s fifth parameter is `number | LiveQueryOptions<T>` in T3 and every later call uses `{ cacheKey }` (T6, T7, T9); `scheduleReload(workspaceId, debounceMs)` is two-argument in T3 and T4 (`scheduleReload(workspaceId, 0)`); `staleWorkspaces` is declared in T4 inside T3's file and exported by T10's `data.ts`; `SkeletonRegion`'s `label` is a string everywhere; `Button`'s `busy`/`busyLabel` match T6 and T8; `PendingCreate` fields match between `applyPendingCreates` and the test; `rollupsFor` returns `Map<string, RollupView>` in T11's test and implementation; `useTabletBar` keeps returning `boolean`.

**4. Review focus → tests.** RF1 → 25.096 (T7). RF2 → 25.028 (T3: add to Step 1 — `clearLiveQueryCache()` on sign-out empties `recallLiveQuery` for every key; the test signs out through `AccountMenu`'s mocked `signOut` and asserts a fresh mount serves null) and 25.044 (T4). RF3 → 25.011, 25.012 (T2). RF4 → 25.203 (T12). RF5 → 25.141 (T8).

**Gaps fixed inline:** the polite announce region (added to T2/T5/T7), the reduced-motion sweep (added to T2 as 25.017b), RF2's sign-out case (added to T3 as 25.028).

## Execution handoff

Plan complete and saved beside the spec at `gisik-nokma-lanes/smoothness-2026-10-02/2026-10-02-smoothness.md`; T1 copies both into `docs/superpowers/`. Execution in this repo is by the orchestrator's lanes (controller → dispatcher → lanes → reviewer → gate) on `release/smoothness`, autonomous into the release branch per the standing authorization, never to `main`. **HELD until the owner rules on D1–D13.** For this plan the recommended shape is subagent-driven with the parallel groups in **Order** above: fourteen tasks whose interfaces (T2's primitives, T3's `cacheKey`, T4's shared read, T5's shells) are consumed by the six screen tasks, so a reviewer per task catches a drifted interface before four lanes build on it.


## Re-anchored citations (2026-10-02, after neo #931 + MCP #937)

*Appended by smoothness T1 (`task/smoothness-docs`). The plan body above is NOT rewritten: its line numbers are the ones it was verified at, `release/prefix-groups-ux` `4f86b959`. This section maps each one to where the same lines are now, at `release/smoothness` `f27485ec` (= `main`, which holds prefix/groups, neo #931 and MCP #937). **T2–T13 lanes read this map instead of re-deriving it, and still re-read a cited line before editing** (the symbol is the anchor, the line a hint).*

**How it was measured.** Every `path:line` cite in the plan and the spec was found (119 that name a file and a line, over 55 files, plus the continuation forms that follow one: `, 1321, 1488`, `` `:2176-2186` ``, found by hand). Each file was diffed `4f86b959..HEAD` with zero context, the cited lines were mapped through the hunks, and the mapped range was read back in the current file. 41 of the 55 cited files are unchanged since `4f86b959`, so their cites hold as written. The other 14 files carry the 96 rows below (69 distinct ranges; reviewer A counted 38 of the explicit ones, this table also lists the continuation cites and each cite once per plan line it appears on). Where lines moved without being edited the note says so; where a line was edited, or a range grew, the note says what it is now. Each cite keeps the plan line (`P<n>`) or spec line (`S<n>`) it appears on.

| Plan cite (plan line) | Current cite at `release/smoothness` | Note |
|---|---|---|
| `apps/web/app/globals.css:169` (P15) | `apps/web/app/globals.css:169-170` | EDITED by neo N7 (24.082): the rule is now `.gn-shell__main { margin-top: max(1.25rem, var(--gn-halo-lg)); … }` at line 170, with a 2-line N7 comment at 169. |
| `pnpm-lock.yaml:4882` (P31) | `pnpm-lock.yaml:4899` | unchanged lines, moved +17 |
| `page.tsx:128-131` (P32) | `apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx:130-133` | unchanged lines, moved +2 |
| `page.tsx:133-137` (P32) | `apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx:135-139` | unchanged lines, moved +2 |
| `page.tsx:2169` (P37) | `apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx:2181` | unchanged lines, moved +12 |
| `globals.css:4520` (P60) | `apps/web/app/globals.css:4536` | unchanged lines, moved +16 |
| `views/board.tsx:1345-1356` (P63) | `packages/app-core/src/views/board.tsx:1348-1359` | unchanged lines, moved +3 |
| `ui.css:1287` (P63) | `packages/ui/src/ui.css:1309` | EDITED by neo N7: `.gn-board__cards` is now `gap: var(--gn-halo)` (was `0.5rem`); same selector, one line, moved +22. |
| `page.tsx:2407-2410` (P63) | `apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx:2419-2422` | unchanged lines, moved +12 |
| `apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx:133-137` (P1158) | `apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx:135-139` | unchanged lines, moved +2 |
| `packages/app-core/src/views/board.tsx:3051-3061` (P1409) | `packages/app-core/src/views/board.tsx:3070-3080` | unchanged lines, moved +19 |
| `page.tsx:1299` (P1409) | `apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx:1311` | unchanged lines, moved +12 |
| `page.tsx:322` (P1471) | `apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx:326` | unchanged lines, moved +4 |
| `board.tsx:3061` (P1505) | `packages/app-core/src/views/board.tsx:3080` | unchanged lines, moved +19 |
| `packages/app-core/src/views/ticket-sheet.tsx:940-951` (P1539) | `packages/app-core/src/views/ticket-sheet.tsx:948-959` | unchanged lines, moved +8 |
| `views/board.tsx:515` (P1539) | `packages/app-core/src/views/board.tsx:515` | unchanged lines, moved 0 (same numbers) |
| `apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx:2258-2264` (P1539) | `apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx:2270-2276` | unchanged lines, moved +12 |
| `apps/web/src/project-title.tsx:160-176` (P1539) | `apps/web/src/project-title.tsx:160-177` | lines at the range start unchanged; **1 line ADDED inside it** (`className="gn-project__edit"`), range 17 → 18 lines (reviewer A's N1 relabel). |
| `board.tsx:515` (P1716) | `packages/app-core/src/views/board.tsx:515` | unchanged lines, moved 0 (same numbers) |
| `app/w/[workspaceId]/my-work/page.tsx:334-350` (P1739) | `apps/web/app/w/[workspaceId]/my-work/page.tsx:337-353` | unchanged lines, moved +3 |
| `apps/web/src/app-nav.tsx:528-555` (P1739) | `apps/web/src/app-nav.tsx:528-558` | **NOT unchanged: 2 lines REPLACED, the code changed meaning** (reviewer A's N1): F-6 (case 23.285), a failed session read now shows the bottom bar, so `{user !== null && hasBottomBar ? (` is `{(user !== null || session.kind === "error") && hasBottomBar ? (` and `userId={user.id}` is `userId={user?.id ?? ""}`, under a 3-line F-6 comment; range 28 → 31 lines. **T8 edits this region** (phone shell, P1739): read the condition as it is now. |
| `apps/web/src/bottom-bar.tsx:114-118` (P1739) | `apps/web/src/bottom-bar.tsx:114-121` | lines at the range start unchanged; **3 lines ADDED inside it** (F-6, 23.285: `const knownUser = userId === '' ? null : userId;` and its 2-line comment), range 5 → 8 lines. `userId=""` is a session that never loaded. **T8 edits this region** (reviewer A's N1). |
| `comments-thread.tsx:251` (P1739) | `packages/app-core/src/views/comments-thread.tsx:453` | unchanged lines, moved +202 |
| `use-is-phone.ts:26-35` (P1859) | `apps/web/src/use-is-phone.ts:29-38` | unchanged lines, moved +3 |
| `app-nav.tsx:528-533` (P1859) | `apps/web/src/app-nav.tsx:528-533` | unchanged lines, moved 0 (same numbers) |
| `bottom-bar.tsx:114-118` (P1859) | `apps/web/src/bottom-bar.tsx:114-121` | lines at the range start unchanged; **3 lines ADDED inside it** (F-6, 23.285: `const knownUser = userId === '' ? null : userId;` and its 2-line comment), range 5 → 8 lines. `userId=""` is a session that never loaded. **T8 edits this region** (reviewer A's N1). |
| `globals.css:4520` (P1879) | `apps/web/app/globals.css:4536` | unchanged lines, moved +16 |
| `apps/web/src/notes/note-document.tsx:155-200` (P1882) | `apps/web/src/notes/note-document.tsx:155-200` | unchanged lines, moved 0 (same numbers) |
| `apps/web/src/notes/note-comments.tsx:128` (P1882) | `apps/web/src/notes/note-comments.tsx:202` | unchanged lines, moved +74 |
| `apps/web/app/globals.css:4520` (P1882) | `apps/web/app/globals.css:4536` | unchanged lines, moved +16 |
| `note-document.tsx:159-168` (P1936) | `apps/web/src/notes/note-document.tsx:159-168` | unchanged lines, moved 0 (same numbers) |
| `globals.css:4520` (P1954) | `apps/web/app/globals.css:4536` | unchanged lines, moved +16 |
| `note-comments.tsx:128` (P1954) | `apps/web/src/notes/note-comments.tsx:202` | unchanged lines, moved +74 |
| `note-document.tsx:921` (P1954) | `apps/web/src/notes/note-document.tsx:923` | unchanged lines, moved +2 |
| `apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx:49-50` (P1978) | `apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx:49-50` | unchanged lines, moved 0 (same numbers) |
| `app/w/[workspaceId]/my-work/page.tsx:14` (P1978) | `apps/web/app/w/[workspaceId]/my-work/page.tsx:14` | unchanged lines, moved 0 (same numbers) |
| `bottom-bar.tsx:8-16` (P2057) | `apps/web/src/bottom-bar.tsx:8-16` | unchanged lines, moved 0 (same numbers) |
| `ui.css:1287` (P2208) | `packages/ui/src/ui.css:1309` | EDITED by neo N7: `.gn-board__cards` is now `gap: var(--gn-halo)` (was `0.5rem`); same selector, one line, moved +22. |
| `packages/app-core/src/views/board.tsx:1345-1356` (P2211) | `packages/app-core/src/views/board.tsx:1348-1359` | unchanged lines, moved +3 |
| `packages/ui/src/ui.css:1287` (P2211) | `packages/ui/src/ui.css:1309` | EDITED by neo N7: `.gn-board__cards` is now `gap: var(--gn-halo)` (was `0.5rem`); same selector, one line, moved +22. |
| `apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx:683` (P2211) | `apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx:695` | unchanged lines, moved +12 |
| `board.tsx:1845` (P2268) | `packages/app-core/src/views/board.tsx:1858` | unchanged lines, moved +13 |
| `ui.css:1287` (P2268) | `packages/ui/src/ui.css:1309` | EDITED by neo N7: `.gn-board__cards` is now `gap: var(--gn-halo)` (was `0.5rem`); same selector, one line, moved +22. The plan's literal rule text at P2268 (`gap: 0.5rem; contain: content;`) is stale: the live rule is `.gn-board__cards { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--gn-halo); }`; add `contain: content` to THAT rule and keep `gap: var(--gn-halo)` (neo N7 / 24.082). |
| `board.tsx:1914` (P2268) | `packages/app-core/src/views/board.tsx:1927` | unchanged lines, moved +13 |
| `page.tsx:2407-2410` (P2268) | `apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx:2419-2422` | unchanged lines, moved +12 |
| `page.tsx:2193` (P37) | `apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx:2205` | unchanged lines, moved +12 |
| `page.tsx:2265` (P37) | `apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx:2277` | unchanged lines, moved +12 |
| `board.tsx:1845` (P63) | `packages/app-core/src/views/board.tsx:1858` | unchanged lines, moved +13 |
| `ui.css:1601` (P63) | `packages/ui/src/ui.css:1623` | unchanged lines, moved +22 |
| `globals.css:2517` (P1386) | `apps/web/app/globals.css:2519` | unchanged lines, moved +2 |
| `page.tsx:322` (P1409) | `apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx:326` | unchanged lines, moved +4 |
| `page.tsx:350` (P1409) | `apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx:354` | unchanged lines, moved +4 |
| `page.tsx:379-388` (P1409) | `apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx:383-392` | unchanged lines, moved +4 |
| `page.tsx:451-458` (P1409) | `apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx:455-462` | unchanged lines, moved +4 |
| `page.tsx:2176-2186` (P1409) | `apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx:2188-2198` | unchanged lines, moved +12 |
| `page.tsx:2295-2360` (P1409) | `apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx:2307-2372` | unchanged lines, moved +12 |
| `page.tsx:3089` (P1409) | `apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx:3103` | unchanged lines, moved +14 |
| `page.tsx:3127` (P1409) | `apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx:3141` | unchanged lines, moved +14 |
| `page.tsx:3262` (P1409) | `apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx:3276` | unchanged lines, moved +14 |
| `page.tsx:3411` (P1409) | `apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx:3425` | unchanged lines, moved +14 |
| `page.tsx:3592` (P1409) | `apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx:3606` | unchanged lines, moved +14 |
| `page.tsx:1321` (P1409) | `apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx:1333` | unchanged lines, moved +12 |
| `page.tsx:1488` (P1409) | `apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx:1500` | unchanged lines, moved +12 |
| `page.tsx:1878` (P1409) | `apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx:1890` | unchanged lines, moved +12 |
| `page.tsx:350` (P1471) | `apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx:354` | unchanged lines, moved +4 |
| `page.tsx:379-388` (P1478) | `apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx:383-392` | unchanged lines, moved +4 |
| `page.tsx:2176-2186` (P1507) | `apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx:2188-2198` | unchanged lines, moved +12 |
| `page.tsx:2295-2360` (P1515) | `apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx:2307-2372` | unchanged lines, moved +12 |
| `ticket-sheet.tsx:1277-1332` (P1539) | `packages/app-core/src/views/ticket-sheet.tsx:1285-1340` | unchanged lines, moved +8 |
| `ticket-sheet.tsx:1884-1920` (P1539) | `packages/app-core/src/views/ticket-sheet.tsx:1948-1984` | unchanged lines, moved +64 |
| `ticket-sheet.tsx:3186-3190` (P1539) | `packages/app-core/src/views/ticket-sheet.tsx:3267-3271` | unchanged lines, moved +81 |
| `board.tsx:2676-2700` (P1539) | `packages/app-core/src/views/board.tsx:2690-2714` | unchanged lines, moved +14 |
| `ticket-sheet.tsx:940` (P1693) | `packages/app-core/src/views/ticket-sheet.tsx:948` | unchanged lines, moved +8 |
| `ticket-sheet.tsx:1884-1920` (P1693) | `packages/app-core/src/views/ticket-sheet.tsx:1948-1984` | unchanged lines, moved +64 |
| `ticket-sheet.tsx:3186` (P1693) | `packages/app-core/src/views/ticket-sheet.tsx:3267` | unchanged lines, moved +81 |
| `ticket-sheet.tsx:1277-1332` (P1693) | `packages/app-core/src/views/ticket-sheet.tsx:1285-1340` | unchanged lines, moved +8 |
| `ticket-sheet.tsx:944-951` (P1693) | `packages/app-core/src/views/ticket-sheet.tsx:952-959` | unchanged lines, moved +8 |
| `board.tsx:2676-2700` (P1716) | `packages/app-core/src/views/board.tsx:2690-2714` | unchanged lines, moved +14 |
| `note-document.tsx:343` (P1882) | `apps/web/src/notes/note-document.tsx:343` | unchanged lines, moved 0 (same numbers) |
| `note-document.tsx:366` (P1882) | `apps/web/src/notes/note-document.tsx:366` | unchanged lines, moved 0 (same numbers) |
| `note-document.tsx:462` (P1882) | `apps/web/src/notes/note-document.tsx:462` | unchanged lines, moved 0 (same numbers) |
| `note-document.tsx:405-411` (P1882) | `apps/web/src/notes/note-document.tsx:405-411` | unchanged lines, moved 0 (same numbers) |
| `note-document.tsx:702` (P1882) | `apps/web/src/notes/note-document.tsx:702` | unchanged lines, moved 0 (same numbers) |
| `note-document.tsx:921` (P1882) | `apps/web/src/notes/note-document.tsx:923` | unchanged lines, moved +2 |
| `note-document.tsx:896-910` (P1882) | `apps/web/src/notes/note-document.tsx:898-912` | unchanged lines, moved +2 |
| `note-document.tsx:178-194` (P1954) | `apps/web/src/notes/note-document.tsx:178-194` | unchanged lines, moved 0 (same numbers) |
| `ui.css:1601` (P2208) | `packages/ui/src/ui.css:1623` | unchanged lines, moved +22 |
| `ui.css:1601` (P2211) | `packages/ui/src/ui.css:1623` | unchanged lines, moved +22 |
| `board.tsx:1845-1853` (P2211) | `packages/app-core/src/views/board.tsx:1858-1866` | unchanged lines, moved +13 |
| `page.tsx:850` (P2211) | `apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx:862` | unchanged lines, moved +12 |
| `page.tsx:1721` (P2211) | `apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx:1733` | unchanged lines, moved +12 |
| `ui.css:1601` (P2268) | `packages/ui/src/ui.css:1623` | unchanged lines, moved +22 |
| `board.tsx:1086` (P2268) | `packages/app-core/src/views/board.tsx:1086` | unchanged lines, moved 0 (same numbers) |
| `board.tsx:1948` (P2268) | `packages/app-core/src/views/board.tsx:1961` | unchanged lines, moved +13 |
| `page.tsx:850` (P2268) | `apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx:862` | unchanged lines, moved +12 |
| `page.tsx:1721` (P2268) | `apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx:1733` | unchanged lines, moved +12 |

**The two append anchors.** Both T2 and T5 append to the END of a stylesheet, which still works; the numbers moved.

| Plan text | Now | Note |
|---|---|---|
| `packages/ui/src/ui.css` last rule, "line 8904 at `4f86b959`" (P112, spec S96) | `packages/ui/src/ui.css`, **9236** lines; the last rule ends at 9236 (`transform: translate(-50%, -50%);` then `}`) | append after it; the marker comment stays the anchor |
| `apps/web/app/globals.css` last rule, "line 5657 at `4f86b959`" (P1153) | `apps/web/app/globals.css`, **5686** lines; the last rule is the `.gn-workspace-settings__title, .gn-mcp-tokens__subtitle` phone arm closing at 5686 | append after it |

**MOOT by neo #931 (shipped; 2026-10-02).**

- **P2 (plan line 15) and spec lines 3, 36 and 93: "the neo refresh runs in parallel on `release/neo-refresh` and owns …"** is moot. Neo is on `main`. The line ranges it lists as neo-owned (`ui.css` 96–99, 1168–1178, 7176–7180, 7252–7258, 8097–8153, `globals.css:169` and 2942–2945) were neo's to edit and are now ordinary history: read the current text, do not trust those numbers.
- **The "Parallel-safe with neo" column of the File structure table (plan line 50) and each task's "**Parallel-safe with neo: yes/no**" line** (plan lines 112, 526, 914, 1153, 1406, 1535, 1736, 1879, 1974, 2091, 2208, 2288, 2377) are moot: there is no neo branch to collide with. The append-only rule for `ui.css` and `globals.css` stays as a convention (it keeps diffs small), not as a collision guard.
- **P1 (plan line 14), "cut `release/smoothness` from `main` after `release/prefix-groups-ux` has merged"**, is satisfied: `release/smoothness` is `f27485ec`.
- **Features and the catalogue.** §22 sits between §21 (neo) and §23 (MCP everything); bucket 25 sits between 24 (neo) and 26 (MCP). Neither is renumbered. Plan line 20 ("Bucket 24 / Features §21 belong to the neo refresh") is still true; add "bucket 26 / §23 belong to MCP everything".

**OPEN, for the planner before T2 (found while re-anchoring; not decided here).** Spec §4.3 (S94) says the skeleton fill is `var(--gn-surface-track)` and that "in neo this is the flat surface, which U7 defines as not interactive". After neo, `surfaceTrack` in the neo arms maps to the well step (`neoWellLight` / `neoWellDark`, `packages/ui/src/tokens.ts:1104`, `:1121`), the recess fill that the neo segmented track and nav use. The skeleton would paint in the recess colour. The spec anticipated a re-value ("the skeleton follows the token"), but the "flat, not interactive" rationale no longer holds. T2's fill cases (25.01x) need a ruling: keep `surfaceTrack`, or a flat role.

**RESOLVED (2026-10-02, owner, Amendment S-R1).** The skeleton fill is a new role, `surfacePlaceholder`: hig/minimal map to the same primitive as `surfaceTrack` (24.009 stays green), neo maps to a flat surface step and never the well. See the T2 note and the spec's "Amendment S-R1" section.

**Spec line numbers after S-R1 (2026-10-02).** The S-R1 fold added two pointer lines to the spec (after the `### 4.1` heading, 2 lines; after the `### 4.3` heading, 1 line) and appended the amendment at its end. Spec line cites (`S<n>`) therefore move +2 for lines after the §4.1 heading, +3 for lines after the §4.3 heading; lines 1–87 are as cited.

