# Board Page Prototype Port Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port `/w/[workspaceId]/p/[projectId]` and its four views (board, list, calendar, timeline) to the desktop prototype's design, building the five affordances that today have no product mechanism behind them — search, Filters sheet, workflow picker, drag-and-drop, and per-card move arrows.

**Architecture:** Three subsystems land in one branch, in six phases. **Look** is CSS on view-scoped selectors plus two new token roles. **Narrowing** is a second, client-side layer that sits beside the existing server axis and never pretends to be it. **Writes** route every state move through `transitionOptions`, so the board can only offer edges the workflow declares.

**Tech Stack:** Next.js App Router (`apps/web`), React, TypeScript, pnpm + turbo monorepo, Vitest, CSS custom properties in `packages/ui/src/ui.css` with roles declared in `packages/ui/src/tokens.ts`.

**Spec:** `docs/superpowers/specs/2026-09-16-board-prototype-port-design.md` — read it before Task 1. This plan argues from it; where the two disagree, the spec wins and the plan is wrong.

## Global Constraints

- **Branch:** `owner/workspace-edits`. **Never commit or push to `main`** — check `git rev-parse --abbrev-ref HEAD` before every commit.
- **`reference/` is frozen.** Never edit anything under it.
- **Never pipe a test run into `head` or `grep -m N`.** Use `| tail -N`, or `> /tmp/run.log 2>&1` then read the file. After any run that returned suspiciously fast, reap ONLY orphans: `ps -eo pid=,ppid=,comm=,args= | awk '$3 ~ /node$/ && $2 == 1 && index($0, "vitest") > 0 {print $1}'`. **Never `pkill -f vitest`.**
- **`Features.md` and `test-cases/` are updated in the SAME commit as the code.** Never a follow-up. This is why there is no separate docs task — the spec's T7 is dissolved into every task below, because a standalone docs task *is* the follow-up the rule forbids.
- **Case IDs are never renumbered.** Mint new ones with the next free number, checked at the time (concurrent work may have claimed numbers since this plan was written):
  ```bash
  grep -oE "13\.[0-9]{3}" test-cases/13-deployment-dogfooding.md | sort -u -t. -k2 -n | tail -3
  ```
- **Shared surfaces are off-limits to this port.** View styling lands on `.gn-board-*`, `.gn-list-*`, `.gn-calendar-*`, `.gn-timeline-*`. Do **not** edit `.gn-card`, `.gn-chip`, `.gn-avatar`, `.gn-table`, `.gn-select`, or `.gn-button` — `apps/desktop/src/main.tsx:6` imports `ui.css`, so those ship product-wide. If a prototype metric seems reachable only through a shared rule, stop and report it rather than editing.
- **No colour literals in `ui.css`.** `packages/ui/test/token-discipline.test.ts` bans them; `packages/ui/test/tokens.test.ts:128` requires every `var(--gn-…)` to name a declared role.
- **Prototype reference:** `design-system/interactive/desktop.dc.html`. Frozen; read only.

### Prototype → product vocabulary

**This table is the spec's T0, already discharged.** T0 said no CSS is written before reading the prototype's hig / minimal / neo style blocks for the real values, because the markup gives the vocabulary and only those blocks give the values. Those blocks (`desktop.dc.html:13-79`) were read while this plan was written, and the mapping below is the result — so no task needs to repeat the read. What the blocks showed, and what the table therefore encodes: `neo` inverts `chipShadow`, `fieldShadow`, `trayShadow` and `segOnShadow` to `inset`, and raises `cardR` to 20px and `ctlR` to 14px; `minimal` flattens `cardShadow`, `chipBg`, `ctlBg` and `trayBg` to `none`/`transparent`. The product's roles already carry those per-style variants, which is why the table maps to a role and never to a literal.

The product does not reuse the prototype's role names. Translate with this table, not by inventing names:

| Prototype | Product CSS variable |
|---|---|
| `--cardBg` | `var(--gn-surface-raised)` |
| `--cardR` | `var(--gn-radius-card)` |
| `--cardShadow` | `var(--gn-shadow-raised)` |
| `--ctlBg`, `--chipBg`, `--segBg` | `var(--gn-fill-tertiary)` |
| `--ctlR` | `var(--gn-radius-control)` |
| `--chipShadow` | `var(--gn-shadow-sunken-compact)` |
| `--fieldBg`, `--fill4` | `var(--gn-fill-quaternary)` |
| `--fieldShadow`, `--trayShadow` | `var(--gn-shadow-sunken)` |
| `--trayBg` | `var(--gn-surface-sunken)` |
| `--segOnBg` | `var(--gn-surface-raised)` |
| `--segOnShadow` | `var(--gn-shadow-selected)` |
| `--label2` | `var(--gn-text-muted)` |
| `--label3` | `var(--gn-text-subtle)` |
| `--onColor` | `var(--gn-text-inverted)` |
| `--purple` | `var(--gn-custom-marker)` (already `violet600`/`violet300`) |
| `--overlay` | `var(--gn-surface-overlay)` |
| `--tintDanger` | **NOT PORTED** — fails 4.5:1 in all six style×theme combinations (3.229–4.291). The blocked chip keeps `<Chip tone="blocked">`, whose dot carries the tone at 3:1. See the spec's *Both tints were measured*. |
| `--tintPurple` | **NOT PORTED** — `customMarker` on neo paper is 4.807, so no wash fits. The calendar's custom-field event keeps `customMarker` text. Same spec section. |

### Divergences already decided — do not "fix" these

- **Tab height is 2.75rem, not the prototype's 40px.** `.gn-segmented__item` already exists and `ui.css:2424-2430` records why 40px was wrong: it fails the 44px tap-target floor (WCAG 2.5.5) and reddens `/sign-in` on all three viewports. The board reuses the component as-is.
- **`.gn-button` does not gain neo's raised `--ctlShadow`.** `ui.css:22-30` records this as an OPEN DECISION deliberately left to the repo owner, because it would change every button in the product and in `apps/desktop`. This port does not decide it. Board controls use `.gn-button` unchanged.
- **Search is client-side**, though `filterSpecSchema` has a `text` axis — `useBoard` takes no filter, so a wire search would narrow the list and leave the board unnarrowed.
- **The sync strip is not drawn.** `apps/web` has no `sync-client` dependency and no countable in-flight queue.

---

## File Structure

| File | Responsibility |
|---|---|
| `packages/ui/src/tokens.ts` | **Modify** — declare `tintDanger`, `tintPurple` |
| `packages/ui/test/tokens.test.ts` | **Modify** — composited contrast for both, with anti-vacuous controls |
| `packages/ui/src/ui.css` | **Modify** — all board/list/calendar/timeline rules |
| `packages/app-core/src/filter/board-filter.ts` | **Create** — `BoardFilterSpec` + `matchesBoardCard`, pure |
| `packages/app-core/test/filter/board-filter.test.ts` | **Create** — agreement + compile-time negative |
| `packages/app-core/src/views/board.tsx` | **Modify** — empty states, picker, arrows, drop targets |
| `packages/app-core/src/views/board-moves.ts` | **Create** — `nextMove`/`previousMove` over declared edges, pure |
| `packages/app-core/test/views/board-moves.test.ts` | **Create** — the four gate outcomes |
| `apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx` | **Modify** — chrome, search, filters sheet, counts |
| `Features.md`, `test-cases/11-*.md`, `test-cases/13-*.md` | **Modify** — in every task that changes behaviour |

---

# Phase 1 — Tokens

### Task 1: Declare `tintDanger` and `tintPurple` — ~~STRUCK 2026-09-16~~

> **DO NOT IMPLEMENT THIS TASK.** It was dispatched, and its implementer correctly
> refused to write a test it had measured as failing. Both roles are withdrawn:
> `danger` on `tintDanger` fails 4.5:1 in all six style×theme combinations
> (3.229–4.291), and `customMarker` on neo paper has 4.807 — no purple wash fits
> above 4.5 at any alpha the out-of-month ground survives. The spec section *Both
> tints were measured and NEITHER can ship* holds the tables and the rejected
> alternatives. T6 keeps `<Chip tone="blocked">`; T10 keeps `customMarker` text.
>
> Four findings from that dispatch are worth keeping, all verified: the four hex
> values in Step 4 were byte-accurate against the prototype; `Warm`=light and
> `Navy`=dark holds; `13.430`/`13.431` were free (and the sweep's raw maximum is a
> false hit — the file's own pointer prose matches the ID pattern); and Step 5's
> "add these to every style's map" was a phantom instruction — `colorOf` falls
> through `themes[theme]` for all three styles, so one entry per theme suffices.
> Anyone adding a shared-value role later should read those four lines first.

The original text follows, kept for the record.

Only two roles are missing. `customMarker` (→ `violet600`/`violet300`) already exists with a `CONTRAST_PAIRS` row and is the calendar pill's purple text — do not add a purple text role.

**Files:**
- Modify: `packages/ui/src/tokens.ts`
- Test: `packages/ui/test/tokens.test.ts`

**Interfaces:**
- Produces: CSS variables `--gn-tint-danger` and `--gn-tint-purple`, consumed by Task 6 (blocked column chip) and Task 10 (calendar custom-field pill).

**The rule that makes this task subtle:** these are ALPHA. `tokens.ts:226` and `:273` — **no `CONTRAST_PAIRS` row may name them.** `relativeLuminance` ignores alpha by documented design, so a declared pair computes the tint's own colour against a background it is actually blended INTO: a false green. The obligation is discharged in `tokens.test.ts` against the composite instead.

- [ ] **Step 1: Confirm the family naming and which map is which theme**

`Warm` = light theme, `Navy` = dark theme (not the style family). Verify before writing:

```bash
grep -n "tintWarmWarning\|tintNavyWarning" packages/ui/src/tokens.ts
sed -n '704,712p;741,749p' packages/ui/src/tokens.ts
```

Expected: `tintWarmWarning` is `#f07c3433` (the prototype's LIGHT `--tintWarning`, `desktop.dc.html:20`) and appears in the map that also says `shadow: 'scrimLight'`. If that does not hold, stop — the rest of this task has the themes backwards.

- [ ] **Step 2: Write the failing composited test**

Add to `packages/ui/test/tokens.test.ts`. The `over()` compositor currently lives inside the `tintWarning` describe at `:622`. Lift it to module scope (just above that describe) so all three blocks share one definition, and delete the inner copy:

```ts
/** `src` over `dst` — the compositing `relativeLuminance` deliberately lacks. */
const over = (src: string, dst: string): string => {
  const hex = (h: string, i: number): number => Number.parseInt(h.slice(i, i + 2), 16);
  const alpha = src.length === 9 ? hex(src, 7) / 255 : 1;
  const channel = (i: number): number =>
    Math.round(hex(src, i) * alpha + hex(dst, i) * (1 - alpha));
  return `#${[1, 3, 5].map((i) => channel(i).toString(16).padStart(2, '0')).join('')}`;
};
```

Then append the two new blocks:

```ts
/**
 * `tintDanger` — the blocked column chip's ground (board metrics,
 * `desktop.dc.html:354-399`). ALPHA, so no `CONTRAST_PAIRS` row may name it
 * (`tokens.ts:226`); the obligation is against the COMPOSITE.
 *
 * Its ground is the column TRAY, not the page: the chip sits inside a column
 * whose background is `surfaceSunken`. `tintWarning`'s block measures against
 * `surface` because its banner is at page level and its docblock says so
 * (`:616-618`). Copying that ground here would measure a surface this chip
 * never touches.
 */
describe('tintDanger composites legibly on the column tray', () => {
  for (const style of STYLE_NAMES) {
    for (const theme of THEME_NAMES) {
      it(`${style}/${theme}: the blocked chip's label clears 4.5 on the composite`, () => {
        const tray = colorOf(theme, 'surfaceSunken', style);
        const washed = over(colorOf(theme, 'tintDanger', style), tray);

        // ANTI-VACUOUS CONTROL: a fully transparent tint composites to the tray
        // itself, and the assertion below would then measure `danger` on a bare
        // tray — which already passes. Without this the check cannot fail for
        // the reason it exists.
        expect(washed, `${style}/${theme}: the tint composites to nothing`).not.toBe(tray);

        expect(
          contrastRatio(colorOf(theme, 'danger', style), washed),
          `${style}/${theme}: the blocked chip's label no longer clears 4.5 on the wash`,
        ).toBeGreaterThanOrEqual(4.5);
      });
    }
  }
});

/**
 * `tintPurple` — the calendar's custom-field event pill. ALPHA, same rule.
 *
 * TWO grounds, not one: a day cell is `surfaceRaised` in-month and
 * `fillQuaternary` out-of-month (calendar metrics). `fillQuaternary` is ITSELF
 * alpha, so the out-of-month ground is a double composite — the fill over
 * `surface` first, then the tint over that. Measuring against the raw fill
 * would measure a colour no pixel ever shows.
 */
describe('tintPurple composites legibly on both day-cell grounds', () => {
  for (const style of STYLE_NAMES) {
    for (const theme of THEME_NAMES) {
      it(`${style}/${theme}: the custom-field pill clears 4.5 in and out of month`, () => {
        const surface = colorOf(theme, 'surface', style);
        const inMonth = colorOf(theme, 'surfaceRaised', style);
        const outMonth = over(colorOf(theme, 'fillQuaternary', style), surface);

        const washedIn = over(colorOf(theme, 'tintPurple', style), inMonth);
        const washedOut = over(colorOf(theme, 'tintPurple', style), outMonth);

        expect(washedIn, `${style}/${theme}: the tint composites to nothing in-month`).not.toBe(inMonth);
        expect(washedOut, `${style}/${theme}: the tint composites to nothing out-of-month`).not.toBe(outMonth);

        expect(
          contrastRatio(colorOf(theme, 'customMarker', style), washedIn),
          `${style}/${theme}: the pill's label no longer clears 4.5 in-month`,
        ).toBeGreaterThanOrEqual(4.5);
        expect(
          contrastRatio(colorOf(theme, 'customMarker', style), washedOut),
          `${style}/${theme}: the pill's label no longer clears 4.5 out-of-month`,
        ).toBeGreaterThanOrEqual(4.5);
      });
    }
  }
});
```

- [ ] **Step 3: Run the test to verify it fails for the right reason**

```bash
cd packages/ui && pnpm exec vitest run test/tokens.test.ts 2>&1 | tail -30
```

Expected: FAIL. The message must name an unknown role (`tintDanger` / `tintPurple` is not a declared role), **not** a contrast number. A contrast failure here would mean the roles already exist and this task is duplicating something.

- [ ] **Step 4: Declare the primitives**

In `packages/ui/src/tokens.ts`, beside `tintWarmWarning`/`tintNavyWarning` (`:281-282`), add — converting the prototype's `rgba()` to the eight-digit hex `primitives` is asserted to use:

```ts
  /**
   * The blocked column chip's wash — the prototype's `--tintDanger`
   * (`desktop.dc.html:20` light, `:40` dark). Eight-digit hex because
   * `primitives` is asserted hex-only.
   *
   * **ALPHA, so no `CONTRAST_PAIRS` row may name it** — see the fill hierarchy
   * docblock above. Measured composited over `surfaceSunken` (the column tray,
   * which is where this chip actually sits) in `test/tokens.test.ts`.
   *
   * All three styles share one value per theme: the prototype's `neo` block
   * (`desktop.dc.html:53-67`) overrides many tokens and this is not one of them.
   */
  tintWarmDanger: '#b9332721',
  tintNavyDanger: '#f7908624',

  /**
   * The calendar custom-field pill's wash — the prototype's `--tintPurple`
   * (`desktop.dc.html:21` light, `:41` dark). Same ALPHA rule; measured over
   * BOTH day-cell grounds, the out-of-month one a double composite.
   */
  tintWarmPurple: '#4c4a8f21',
  tintNavyPurple: '#b7b4f424',
```

The alpha bytes: `0.13 × 255 = 33.15 → 33 = 0x21`; `0.14 × 255 = 35.7 → 36 = 0x24`.

- [ ] **Step 5: Declare the roles and map them**

Add `'tintDanger',` and `'tintPurple',` to the role list beside `'tintWarning',` (`:606`), each with a one-line docblock in the surrounding style. Then in the light map (the one containing `shadow: 'scrimLight'`, near `:708`):

```ts
    tintDanger: 'tintWarmDanger',
    tintPurple: 'tintWarmPurple',
```

and in the dark map (containing `shadow: 'scrimDark'`, near `:745`):

```ts
    tintDanger: 'tintNavyDanger',
    tintPurple: 'tintNavyPurple',
```

Add these to **every** style's map, not only `hig` — `STYLE_NAMES` iterates all three and a missing entry fails as an undefined colour.

- [ ] **Step 6: Run the tests to verify they pass**

```bash
cd packages/ui && pnpm exec vitest run 2>&1 | tail -20
cd packages/ui && pnpm exec tsc -p tsconfig.typecheck.json 2>&1 | tail -20
```

Expected: PASS, including the pre-existing `tintWarning` block (which now uses the lifted `over`).

- [ ] **Step 7: Witness the anti-vacuous controls**

A control that cannot fail is worse than none. Prove both fire:

```bash
# Temporarily set tintWarmDanger to fully transparent, e.g. '#b9332700'
cd packages/ui && pnpm exec vitest run test/tokens.test.ts 2>&1 | tail -20
```

Expected: FAIL with "the tint composites to nothing". Repeat for `tintWarmPurple` (expect the in-month message). **Revert both edits** — `git diff` must show only the intended changes before committing. Do not use `git checkout --` to revert if anything else is uncommitted.

- [ ] **Step 8: Update Features.md and test-cases, then commit**

Add the two roles to `Features.md` under the design-tokens section (`⚙️` internal subsystem). Mint two cases in `test-cases/13-deployment-dogfooding.md` at the next free numbers (check first, per Global Constraints), one per tint, describing the composited obligation and its ground. Status `✅` — the tests land in this commit.

```bash
git rev-parse --abbrev-ref HEAD   # must be owner/workspace-edits
git add packages/ui Features.md test-cases/13-deployment-dogfooding.md
git commit -m "Declare tintDanger and tintPurple, measured on the grounds they sit on"
```

---

# Phase 2 — Page chrome

### Task 2: Breadcrumb, title, header control row, tab rail

**Files:**
- Modify: `apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx`
- Modify: `packages/ui/src/ui.css`
- Test: `apps/web/test/project-create-gate.test.tsx`, `apps/web/test/page-refusals.test.tsx`

**Interfaces:**
- Produces: `.gn-project__header` containing the search input (Task 4 wires it), the workflow `<select>` (Task 8), the Filters button (Task 5) and New ticket. The tab rail becomes `.gn-segmented`.

**Metrics** (spec, Page chrome `:314-352`): page padding `0 32px 24px`, column, `gap:14px`; header row top margin `24px`; breadcrumb `13px/18px` `text-muted`; title `34px/41px` `700` `-0.4px`; summary line `15px/20px` `text-muted`.

- [ ] **Step 1: Read the existing page structure**

```bash
sed -n '1,60p' "apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx"
grep -n "role=\"tablist\"\|role=\"tab\"\|aria-selected\|view ===" "apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx"
```

This is a **restyle of existing controls, not a rebuild**. The tabs keep `role="tablist"` / `role="tab"` / `aria-selected`.

- [ ] **Step 2: Run the two affected tests first, to record green**

```bash
cd apps/web && pnpm exec vitest run test/project-create-gate.test.tsx test/page-refusals.test.tsx 2>&1 | tail -20
```

Expected: PASS. Record the counts; Step 6 compares against them.

- [ ] **Step 3: Add the chrome CSS**

Append to `packages/ui/src/ui.css`. Every value from the table above; `rem` at 16px base:

```css
.gn-project { display: flex; flex-direction: column; gap: 0.875rem; padding: 0 2rem 1.5rem; }
.gn-project__header { display: flex; flex-wrap: wrap; align-items: center; gap: 0.75rem; margin-top: 1.5rem; }
.gn-project__breadcrumb { font-size: 0.8125rem; line-height: 1.125rem; color: var(--gn-text-muted); }
.gn-project__title { font-size: 2.125rem; line-height: 2.5625rem; font-weight: 700; letter-spacing: -0.025rem; margin: 0; }
.gn-project__summary { font-size: 0.9375rem; line-height: 1.25rem; color: var(--gn-text-muted); }
```

- [ ] **Step 4: Apply the classes and swap the tab rail to `.gn-segmented`**

Replace the tab rail's markup with the existing component's classes — `.gn-segmented` on the `role="tablist"` element, `.gn-segmented__item` on each `role="tab"`, and `.gn-segmented__item--on` on the one whose `aria-selected` is `true`. Do **not** add a `min-height` override; see Divergences.

- [ ] **Step 5: Run the CSS-binding and page tests**

```bash
cd packages/ui && pnpm exec vitest run 2>&1 | tail -20
cd apps/web && pnpm exec vitest run 2>&1 | tail -20
```

Expected: PASS. `tokens.test.ts:128` proves every new `var(--gn-…)` names a declared role.

- [ ] **Step 6: Verify the refusal arms still read identically**

`page-refusals.test.tsx` covers all four refusal arms. They must be unchanged — this task restyles chrome, and a refusal that changed wording here would be a silent product change.

- [ ] **Step 7: Update docs and commit**

Update the `Features.md` bullet for the project page's chrome. Mint a case in `test-cases/13-*.md` for the segmented tab rail on the board page.

```bash
git rev-parse --abbrev-ref HEAD
git add -A && git commit -m "Restyle the project page chrome to the prototype"
```

---

# Phase 3 — Narrowing

### Task 3: `BoardFilterSpec` and its predicate

The spec originally proposed a `boardCardToFilterState` adapter. **It must not be built** — see the spec's narrowing section. `matchesFilter` fails *closed* on every axis a `BoardCard` cannot supply, so a synthesized `TicketState` empties the board instead of degrading.

**Files:**
- Create: `packages/app-core/src/filter/board-filter.ts`
- Create: `packages/app-core/test/filter/board-filter.test.ts`
- Modify: `packages/app-core/src/index.ts` (export)

**Interfaces:**
- Produces:
  ```ts
  export type BoardFilterSpec = Pick<FilterSpec,
    'text' | 'assigneeIds' | 'typeIds' | 'stateIds' | 'stateCategories' | 'projectIds'>;
  export function matchesBoardCard(
    card: BoardCard, column: BoardColumn, projectId: string, spec: BoardFilterSpec,
  ): boolean;
  ```
  Consumed by Task 4 (the count) and Task 6 (which cards render).

- [ ] **Step 1: Write the failing agreement test**

Create `packages/app-core/test/filter/board-filter.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { TicketState } from '@gisik-nokma/domain';
import { matchesFilter } from '../../src/filter/matches-filter.js';
import { matchesBoardCard, type BoardFilterSpec } from '../../src/filter/board-filter.js';
import type { BoardCard, BoardColumn } from '../../src/view-types.js';

const card: BoardCard = {
  ticketId: 't1', title: 'Ship the board', typeId: 'task',
  assignee: { id: 'u1', name: 'Ada' },
  // ClaimProvenance is an OBJECT (`view-types.ts:85-90`), not a string.
  stateProvenance: { actorId: 'u1', actorName: 'Ada', clientTime: '', serverTime: '' },
  cause: null, rollup: null, pending: false,
};
const column: BoardColumn = {
  stateId: 's-doing', name: 'Doing', category: 'active', blocked: false, cards: [card],
};

/** The same ticket as the list sees it — every field the board's view-model dropped. */
const equivalent: TicketState = {
  kind: 'ticket', id: 't1', workspaceId: 'w1', projectId: 'p1', typeId: 'task',
  parentId: null, workflowId: 'wf1', workflowVersion: 1,
  stateId: 's-doing', stateCategory: 'active',
  assigneeId: 'u1', collaboratorIds: [],
  fields: { title: { value: 'Ship the board', actorId: 'u1', clientTime: '', serverTime: '' } },
  transitions: [],
};

describe('the board predicate agrees with matchesFilter on every axis it serves', () => {
  const cases: Array<[string, BoardFilterSpec]> = [
    ['empty spec', {}],
    ['matching assignee', { assigneeIds: ['u1'] }],
    ['non-matching assignee', { assigneeIds: ['u2'] }],
    ['matching type', { typeIds: ['task'] }],
    ['non-matching type', { typeIds: ['bug'] }],
    ['matching state', { stateIds: ['s-doing'] }],
    ['non-matching state', { stateIds: ['s-done'] }],
    ['matching category', { stateCategories: ['active'] }],
    ['non-matching category', { stateCategories: ['terminal'] }],
    ['matching project', { projectIds: ['p1'] }],
    ['non-matching project', { projectIds: ['p2'] }],
    ['matching text', { text: 'board' }],
    ['non-matching text', { text: 'zzz' }],
  ];

  for (const [name, spec] of cases) {
    it(`${name}: both sides decide alike`, () => {
      expect(matchesBoardCard(card, column, 'p1', spec)).toBe(matchesFilter(equivalent, spec));
    });
  }

  // THE CONTROL: agreement alone would pass if both sides answered `true` to
  // everything. At least one case must actually reject.
  it('the corpus contains a rejection, so agreement is not vacuous', () => {
    const anyRejected = cases.some(([, spec]) => !matchesBoardCard(card, column, 'p1', spec));
    expect(anyRejected, 'every case matched — the agreement proves nothing').toBe(true);
  });
});

describe('axes the board cannot evaluate are unrepresentable', () => {
  it('rejects collaboratorIds at compile time', () => {
    // @ts-expect-error `collaboratorIds` is not in BoardFilterSpec: a BoardCard
    // carries no collaborators, and matchesFilter fails CLOSED on that axis, so
    // allowing it here would empty the board rather than narrow it.
    const spec: BoardFilterSpec = { collaboratorIds: ['u9'] };
    expect(spec).toBeDefined();
  });

  it('rejects dueBefore at compile time', () => {
    // @ts-expect-error same reason: no claimed dates reach a BoardCard.
    const spec: BoardFilterSpec = { dueBefore: '2026-01-01' };
    expect(spec).toBeDefined();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd packages/app-core && pnpm exec vitest run test/filter/board-filter.test.ts 2>&1 | tail -20
```

Expected: FAIL — cannot resolve `../../src/filter/board-filter.js`.

- [ ] **Step 3: Write the predicate**

Create `packages/app-core/src/filter/board-filter.ts`:

```ts
import type { BoardCard, BoardColumn, FilterSpec } from '../view-types.js';

/**
 * The axes a BOARD can answer, derived from `FilterSpec` with `Pick` so it
 * cannot drift into a second vocabulary — the fork `matches-filter.ts`'s
 * docblock forbids.
 *
 * The four that are absent are absent on purpose. A `BoardCard`
 * (`view-types.ts:106-116`) carries no collaborators, no claimed dates and no
 * custom fields, and `matchesFilter` fails CLOSED on each: `collaboratorIds`
 * runs `some()` over `[]`, `dueBefore`/`dueAfter` get `null` from
 * `claimedDueDay`, and a `fields` clause compares `null` to the wanted value.
 * A synthesized state would therefore not narrow the board — it would EMPTY
 * it, while the list showed matches. Making them unrepresentable turns that
 * into a compile error instead of a wrong answer on screen.
 */
export type BoardFilterSpec = Pick<
  FilterSpec,
  'text' | 'assigneeIds' | 'typeIds' | 'stateIds' | 'stateCategories' | 'projectIds'
>;

/**
 * Semantics are `matchesFilter`'s, axis for axis — an empty or absent list
 * does not narrow, and `text` matches TITLES only (the same divergence
 * `matches-filter.ts:48-54` states: full text is the server's projection).
 * `board-filter.test.ts` asserts the agreement rather than trusting this note.
 */
export function matchesBoardCard(
  card: BoardCard,
  column: BoardColumn,
  projectId: string,
  spec: BoardFilterSpec,
): boolean {
  if (spec.assigneeIds !== undefined && spec.assigneeIds.length > 0) {
    if (card.assignee === null || !spec.assigneeIds.includes(card.assignee.id)) return false;
  }
  if (spec.typeIds !== undefined && spec.typeIds.length > 0 && !spec.typeIds.includes(card.typeId)) {
    return false;
  }
  if (spec.stateIds !== undefined && spec.stateIds.length > 0 && !spec.stateIds.includes(column.stateId)) {
    return false;
  }
  if (
    spec.stateCategories !== undefined &&
    spec.stateCategories.length > 0 &&
    !spec.stateCategories.includes(column.category)
  ) {
    return false;
  }
  if (spec.projectIds !== undefined && spec.projectIds.length > 0 && !spec.projectIds.includes(projectId)) {
    return false;
  }
  if (spec.text !== undefined && spec.text.trim() !== '') {
    if (!card.title.toLowerCase().includes(spec.text.trim().toLowerCase())) return false;
  }
  return true;
}
```

- [ ] **Step 4: Export it and run the tests**

Add to `packages/app-core/src/index.ts` beside the other filter exports, then:

```bash
cd packages/app-core && pnpm exec vitest run test/filter/board-filter.test.ts 2>&1 | tail -20
cd packages/app-core && pnpm exec tsc -p tsconfig.typecheck.json 2>&1 | tail -20
```

Expected: PASS. `tsc` must be clean — a `@ts-expect-error` on a line that has no error is itself an error, which is what makes the compile-time negative real.

- [ ] **Step 5: Witness the compile-time negative**

```bash
# Temporarily widen the type: change Pick<...> to FilterSpec
cd packages/app-core && pnpm exec tsc -p tsconfig.typecheck.json 2>&1 | tail -20
```

Expected: FAIL — "Unused '@ts-expect-error' directive" on both negatives. That proves the narrowing is what rejects them, not a typo. **Revert.**

- [ ] **Step 6: Update docs and commit**

Add `BoardFilterSpec` / `matchesBoardCard` to `Features.md` (`⚙️`). Mint cases in `test-cases/13-*.md` for the agreement and for the compile-time rejection.

```bash
git rev-parse --abbrev-ref HEAD
git add -A && git commit -m "Give the board a filter vocabulary it can actually answer"
```

---

### Task 4: Search box, active-filter chips, the `N of M shown` count, and the scope note

**Files:**
- Modify: `apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx`
- Modify: `packages/ui/src/ui.css`

**Interfaces:**
- Consumes: `matchesBoardCard`, `BoardFilterSpec` (Task 3).
- Produces: page-level `filter` state shared by every tab; the `.gn-project__narrowing` strip.

**The disclosure invariant (spec):** no mechanism that removes cards from view may render without **both** the `N of M shown` count and a removable chip naming what is hidden. This task builds both halves together; Task 8's picker reuses them rather than inventing its own.

- [ ] **Step 1: Add the narrowing strip CSS**

```css
.gn-project__narrowing {
  display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem;
  background: var(--gn-fill-quaternary);
  border-radius: var(--gn-radius-control);
  padding: 0.5rem 0.75rem;
}
.gn-project__count { font-size: 0.8125rem; line-height: 1.125rem; color: var(--gn-text-muted); }
.gn-project__scope-note { font-size: 0.8125rem; line-height: 1.125rem; color: var(--gn-text-muted); }
.gn-project__search {
  min-height: 2.75rem; min-width: 12.5rem; padding: 0 0.875rem;
  border: none; border-radius: var(--gn-radius-control);
  background: var(--gn-fill-quaternary); box-shadow: var(--gn-shadow-sunken);
  color: var(--gn-text); font: inherit; font-size: 1.0625rem;
}
```

- [ ] **Step 2: Hold the filter at page level**

One `BoardFilterSpec`-shaped state above the tabs, so switching tabs does not reset it. The **list, calendar and timeline** may take the full `FilterSpec` (they have real `TicketState`); only the board path narrows to `BoardFilterSpec`.

- [ ] **Step 3: Render the count honestly**

`N of M shown`. When the existing server narrowing ("Only tickets in progress") is active, `M` is **itself** narrowed — say so rather than printing a bare `M`, which would assert the project holds `M` tickets when it holds more.

- [ ] **Step 4: Render the scope note on the board tab**

When an active filter carries an axis outside `BoardFilterSpec` (collaborator, due date, a custom field), the board tab states that it is not applied there. This sits **beside** the count, never inside it: the count reports cards the board filtered, the note reports axes it never evaluated. Merging them would put a number on a filter that never ran.

- [ ] **Step 5: Write the tests for the count and the scope note**

Mount the page with the same harness `apps/web/test/list-prefs-wiring.test.tsx` uses — copy its `render` + `DataSource` stub setup verbatim rather than inventing one.

```tsx
it('reads N of M shown when a client filter narrows the board', async () => {
  renderProjectPage({ cards: threeCards });          // harness from list-prefs-wiring
  await userEvent.type(screen.getByRole('searchbox'), 'board');

  expect(screen.getByText(/1 of 3 shown/)).toBeInTheDocument();
});

it('does not present M as the project total while the server narrowing is on', async () => {
  renderProjectPage({ cards: threeCards, activeOnly: true });
  await userEvent.type(screen.getByRole('searchbox'), 'board');

  // The bare phrasing would assert the project holds three tickets when the
  // server already withheld the terminal ones. It must say M is itself narrowed.
  expect(screen.queryByText(/1 of 3 shown$/)).not.toBeInTheDocument();
  expect(screen.getByText(/in progress/i)).toBeInTheDocument();
});

it('names the axes the board could not evaluate, beside the count and not inside it', async () => {
  renderProjectPage({ cards: threeCards });
  await openFiltersAndPickCollaborator('u9');       // helper added in Task 5

  const note = screen.getByText(/not applied on the board/i);
  expect(note).toHaveTextContent(/collaborator/i);
  // The count reports cards the board filtered; the note reports an axis it
  // never ran. Merging them would put a number on a filter that did not run.
  expect(screen.getByText(/3 of 3 shown/)).toBeInTheDocument();
});
```

The third test depends on Task 5's sheet. If Task 5 has not landed yet, write the first two now and add the third in Task 5's commit — do not stub the helper.

- [ ] **Step 6: Run and commit**

```bash
cd apps/web && pnpm exec vitest run 2>&1 | tail -20
git rev-parse --abbrev-ref HEAD
git add -A && git commit -m "Narrow the board client-side, and say what the narrowing did"
```

Update `Features.md` and mint cases for the count, the chips, and the scope note.

---

### Task 5: The Filters sheet

**Files:**
- Modify: `apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx`
- Modify: `packages/ui/src/ui.css`

**Metrics** (spec, Filters sheet `:1367-1417`): scrim `inset:0` `overlay`; panel `width:min(380px,100%)`, full height, `cardBg`, radius `cardR 0 0 cardR`, `box-shadow:-12px 0 40px var(--shadow)`; header `padding 20px 24px 12px`, h2 `22px/28px 600`; section label `13px/18px` `label2` uppercase `0.6px` `600`; person row `min-height:44px; padding:0 14px; 17px` inside `fieldBg + fieldShadow; radius 12px`; category chip `radius 999px; padding 8px 12px; 13px`, selected `accent` ground + `onColor`; footer `padding 16px 24px; fill4`, right-aligned, `gap 10px`.

- [ ] **Step 1: Add the sheet CSS**

```css
.gn-filters__scrim { position: fixed; inset: 0; background: var(--gn-surface-overlay); }
.gn-filters__panel {
  position: fixed; inset-block: 0; inset-inline-end: 0;
  width: min(23.75rem, 100%);
  background: var(--gn-surface-raised);
  border-radius: var(--gn-radius-card) 0 0 var(--gn-radius-card);
  box-shadow: -0.75rem 0 2.5rem var(--gn-shadow);
  display: flex; flex-direction: column;
}
.gn-filters__header { padding: 1.25rem 1.5rem 0.75rem; }
.gn-filters__heading { font-size: 1.375rem; line-height: 1.75rem; font-weight: 600; margin: 0; }
.gn-filters__section-label {
  font-size: 0.8125rem; line-height: 1.125rem; font-weight: 600;
  color: var(--gn-text-muted); text-transform: uppercase; letter-spacing: 0.0375rem;
}
.gn-filters__footer {
  padding: 1rem 1.5rem; background: var(--gn-fill-quaternary);
  display: flex; justify-content: flex-end; gap: 0.625rem;
}
```

- [ ] **Step 2: Build the sheet as a dialog**

`role="dialog"`, `aria-modal="true"`, labelled by the heading. Escape closes; focus moves in on open and returns to the Filters button on close.

- [ ] **Step 3: Wire every control to the page-level filter**

**An inert Filters button is a button that lies** — control and behaviour land in this commit together. Axes outside `BoardFilterSpec` stay available (the list, calendar and timeline serve them); the board's scope note from Task 4 covers them.

- [ ] **Step 4: Run, document, commit**

```bash
cd apps/web && pnpm exec vitest run 2>&1 | tail -20
git rev-parse --abbrev-ref HEAD
git add -A && git commit -m "Build the Filters sheet, wired on the commit it appears"
```

---

# Phase 4 — Board view

### Task 6: Columns as trays, cards, and the blocked chip

**Files:**
- Modify: `packages/ui/src/ui.css`
- Modify: `packages/app-core/src/views/board.tsx`

**Metrics** (spec, Board `:354-399`). **`.gn-card` is not touched** — the board card's 14px padding lands on `.gn-board-card`, which has no rule of its own today and wins on specificity as `.gn-card.gn-board-card`.

- [ ] **Step 1: Add the column and card CSS**

```css
.gn-board__rail { display: flex; gap: 0.875rem; align-items: flex-start; overflow-x: auto; padding-bottom: 0.5rem; }
.gn-board__column {
  background: var(--gn-surface-sunken); box-shadow: var(--gn-shadow-sunken);
  border-radius: var(--gn-radius-card); padding: 0.75rem;
  min-width: 18rem; flex: 0 0 18rem;
  display: flex; flex-direction: column; gap: 0.625rem;
}
.gn-board__column-title { font-size: 1.0625rem; line-height: 1.375rem; font-weight: 600; }
.gn-board__column-count { font-size: 0.8125rem; line-height: 1.125rem; color: var(--gn-text-muted); }
.gn-board-card { padding: 0.875rem; border-radius: 0.75rem; cursor: grab; }
.gn-board-card--pending { outline: 2px dashed var(--gn-warning); outline-offset: 2px; }
/* NO blocked-chip rule. `board.tsx:398` already renders
   `<Chip tone={column.blocked ? 'blocked' : column.category}>`, and `.gn-chip`
   carries the tone as a coloured DOT with a readable label. The prototype's
   tinted-ground-plus-same-hue-text version fails 4.5:1 in all six style×theme
   combinations — see the spec's "Both tints were measured". Do not add one. */
```

- [ ] **Step 2: Apply the classes**

The rail wraps the columns; `.gn-board-card` is already on the `<Card>` at `board.tsx:639`.

- [ ] **Step 3: Check the provenance class against the viewport specs**

`gn-board-card__provenance` has consumers outside app-core:

```bash
grep -rn "gn-board-card__provenance" apps/web/e2e-stack apps/web/e2e-viewport apps/web/app/globals.css
```

Any change to it must be checked against all four. If this task does not change it, say so in the commit message.

- [ ] **Step 4: Run and commit**

```bash
cd packages/ui && pnpm exec vitest run 2>&1 | tail -20
cd packages/app-core && pnpm exec vitest run 2>&1 | tail -20
git rev-parse --abbrev-ref HEAD
git add -A && git commit -m "Draw board columns as trays and cards as the prototype's cards"
```

---

### Task 7: Per-column empty state and the R6 whole-board sentence

**Ruling R6:** the pinned sentence appears above a rail that **still renders**, gated on zero *cards* rather than zero *groups*.

**Files:**
- Modify: `packages/app-core/src/views/board.tsx`
- Test: `packages/app-core/test/views/board.test.tsx`

- [ ] **Step 1: Write the failing test for the case no existing assertion can witness**

```tsx
it('says something, and still shows the columns, when a workflow is attached but nothing is in it', () => {
  const board = {
    projectId: 'p1',
    groups: [{
      workflowId: 'wf1', workflowVersion: 1, workflowName: 'Default',
      columns: [
        { stateId: 's1', name: 'To do', category: 'open', blocked: false, cards: [] },
        { stateId: 's2', name: 'Doing', category: 'active', blocked: false, cards: [] },
      ],
    }],
  };
  render(<Board board={board} onCreateTicket={() => {}} />);

  // The sentence: today this case renders NOTHING, because the branch is
  // gated on `groups.length === 0` and there is one group.
  expect(screen.getByText(EMPTY_BOARD_COPY)).toBeInTheDocument();
  // And the rail survives — it is the one place the workflow's states show.
  expect(screen.getByText('To do')).toBeInTheDocument();
  expect(screen.getByText('Doing')).toBeInTheDocument();
});
```

Match the file's existing render idiom and `Board` props exactly.

- [ ] **Step 2: Run it to verify it fails**

```bash
cd packages/app-core && pnpm exec vitest run test/views/board.test.tsx 2>&1 | tail -20
```

Expected: FAIL on `getByText(EMPTY_BOARD_COPY)` — the sentence is absent. If it fails on "To do" instead, the render idiom is wrong, not the product.

- [ ] **Step 3: Extend the condition**

In `board.tsx`, compute the total and widen the gate. `groups.length === 0` implies `totalCards === 0`, so this is a strict superset — the zero-groups case keeps rendering `gn-board--empty` with **no** rail, because there are no columns to draw:

```tsx
const totalCards = board.groups.reduce(
  (n, group) => n + group.columns.reduce((m, column) => m + column.cards.length, 0), 0,
);
```

Render the sentence and its create button whenever `totalCards === 0`, and the rail whenever `board.groups.length > 0`. `EMPTY_BOARD_COPY`'s text does not change.

- [ ] **Step 4: Add the per-column empty card**

The prototype's per-column empty state (`fill4; radius 12px; padding 22px 16px`, centred, `gap 8px`, a 34px `chipBg` icon circle, `15px/20px` `label2` copy, and a `min-height:44px` action). This is a different granularity from the pinned sentence and both may show at once.

- [ ] **Step 5: Run the whole board suite**

```bash
cd packages/app-core && pnpm exec vitest run test/views/board.test.tsx 2>&1 | tail -20
```

Expected: PASS, **including the pre-existing zero-groups assertion on `EMPTY_BOARD_COPY`**, unmodified. If that one needed editing, the change was not a superset and the implementation is wrong.

- [ ] **Step 6: Witness the new test**

Revert the condition to `board.groups.length === 0` and confirm the new test alone goes red while the old one stays green. That is the proof the new case is what the new test measures. **Revert.**

- [ ] **Step 7: Update docs and commit**

Record R6 in `Features.md`'s board bullet. Mint a case in `test-cases/13-*.md` for the columns-but-no-cards board.

```bash
git rev-parse --abbrev-ref HEAD
git add -A && git commit -m "R6: an empty board keeps its sentence when it keeps its columns"
```

---

### Task 8: The workflow picker, defaulting to All workflows

**Ruling R3:** `All workflows` is an option and it is the **default**, so today's "every card shown exactly once" guarantee survives as the resting state.

**Files:**
- Modify: `apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx`

- [ ] **Step 1: Add the picker**

A `<select>` in the header row (`.gn-button`-adjacent styling per the chrome metrics), whose first option is `All workflows` and whose remaining options are `board.groups` by `workflowName`.

- [ ] **Step 2: Satisfy the disclosure invariant — do not invent a second one**

When a specific workflow is picked, reuse Task 4's count and chip. `board.tsx:204-208` holds that a rearrangement which drops a card "is a filter wearing a grouping's name". The picker **is** a filter, is labelled as one, and discloses through the same mechanism the client filter uses.

- [ ] **Step 3: Write the tests**

```tsx
it('defaults to All workflows, so every group renders and no card is dropped', () => {
  renderProjectPage({ groups: [defaultWorkflow, bugWorkflow] });   // 2 + 3 cards

  expect(screen.getByRole('combobox', { name: /workflow/i })).toHaveValue('all');
  expect(screen.getByText('Default')).toBeInTheDocument();
  expect(screen.getByText('Bug triage')).toBeInTheDocument();
  expect(screen.getAllByRole('article')).toHaveLength(5);
});

it('discloses through the same count and chip the client filter uses', async () => {
  renderProjectPage({ groups: [defaultWorkflow, bugWorkflow] });
  await userEvent.selectOptions(screen.getByRole('combobox', { name: /workflow/i }), 'wf-bug');

  // board.tsx:204-208 — a rearrangement that drops a card is a filter wearing a
  // grouping's name. This one is labelled as a filter and says what it hid.
  expect(screen.getByText(/3 of 5 shown/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /remove.*Bug triage/i })).toBeInTheDocument();
});

it('restores every group when the chip is removed', async () => {
  renderProjectPage({ groups: [defaultWorkflow, bugWorkflow] });
  await userEvent.selectOptions(screen.getByRole('combobox', { name: /workflow/i }), 'wf-bug');
  await userEvent.click(screen.getByRole('button', { name: /remove.*Bug triage/i }));

  expect(screen.getAllByRole('article')).toHaveLength(5);
});
```

Match `renderProjectPage` and the card role to whatever the board actually renders — if cards are not `role="article"`, use the query the existing `board.test.tsx` uses rather than adding a role to satisfy a test.

- [ ] **Step 4: Run, document, commit**

```bash
cd apps/web && pnpm exec vitest run 2>&1 | tail -20
git rev-parse --abbrev-ref HEAD
git add -A && git commit -m "Add the workflow picker, defaulted to All workflows (R3)"
```

---

# Phase 5 — List, Calendar, Timeline

### Task 9: List restyle

Metrics: spec, List `:401-475`. Container `cardBg + cardShadow; radius cardR; overflow:auto`; table `min-width:820px`; header cell `13px/18px 600 label2 trayBg; padding 11px 16px; nowrap`; group header row `padding 11px 16px; trayBg + trayShadow`; zebra odd rows `fill4`; title cell `padding:12px 16px 12px calc(16px + depth*22px); min-width:260px`; data cell `padding 12px 16px; 15px; nowrap`; column toggle `min-height:36px; padding:0 12px; radius 999px; cardBg + cardShadow; 13px` with an 18px tick box.

- [ ] **Step 1: Restyle on `.gn-list-*` selectors only.** `.gn-table` and `.gn-select` are shared surfaces — do not edit them.
- [ ] **Step 2: Keep the Group-by / Columns wiring untouched.** `apps/web/test/list-prefs-wiring.test.tsx` proves it; this is a restyle.
- [ ] **Step 3:** `cd apps/web && pnpm exec vitest run 2>&1 | tail -20` — expect PASS.
- [ ] **Step 4:** Update `Features.md`, mint a case, commit.

### Task 10: Calendar restyle and the R4 legend merge

**Ruling R4:** the prototype's legend-card treatment, the product's *working* per-field toggle. The checkboxes, field names and counts at `calendar-view.tsx:290-306` stay — "so a switched-off field still says how much it is hiding" — and `Due date` / `In transit` join as read-only rows.

- [ ] **Step 1: Restyle per the Calendar metrics**, with ONE exception: the custom-field event keeps today's `.gn-calendar__item--custom` treatment — `color: var(--gn-custom-marker)` (`ui.css:1222`) — and does **not** become a tinted pill. `customMarker` on neo's paper measures 4.807, so no purple wash leaves it above 4.5; the spec's *Both tints were measured* has the sweep. The accent-ground pill for ordinary events is unaffected and is ported as specified.
- [ ] **Step 2: Merge the legend.** Keep the `<fieldset aria-label="Claimed date fields">` and every checkbox.
- [ ] **Step 3: Prove the toggle still toggles.** `packages/app-core/test/calendar/calendar-view.test.tsx` — a legend that became decorative would be a silent loss of function.
- [ ] **Step 4:** Run, document (`test-cases/11-calendar-notifications.md`), commit.

### Task 11: Timeline restyle

Metrics: spec, Timeline `:506-538`. Header grid `230px repeat(8,minmax(0,1fr))`, `trayBg + trayShadow`; row `min-height:42px` with `fill4` zebra; bar `margin 5px 3px; padding 3px 9px; 12px/16px; accent ground; onColor; radius 6px`, radius `0` on a clipped side; undrawn footer `padding 12px 14px; trayBg + trayShadow`, copy `12px/16px label2`.

- [ ] **Step 1: Keep the undrawn list's per-reason modifier classes.** They are asserted at `timeline-view.test.tsx:396-441`.
- [ ] **Step 2: Check the CSS-binding gate.** `packages/app-core/test/inbox/inbox-css-binding.test.tsx` references `gn-timeline__bar`.
- [ ] **Step 3:** Run, document, commit.

---

# Phase 6 — Board writes

### Task 12: The transition gate, as a pure function

**Files:**
- Create: `packages/app-core/src/views/board-moves.ts`
- Create: `packages/app-core/test/views/board-moves.test.ts`

**Interfaces:**
- Consumes: `transitionOptions(def, fromStateId)` (`views/transition-dialog.tsx:41-61`), which returns only edges the workflow **declares**, resolving exact-before-wildcard as `rule-engine/src/transition.ts:91-93` does.
- Produces:
  ```ts
  export type MoveOutcome =
    | { kind: 'refused'; available: string[] }
    | { kind: 'direct'; toStateId: string }
    | { kind: 'needs-dialog'; toStateId: string };
  export function moveOutcome(def: WorkflowDef, fromStateId: string, toStateId: string): MoveOutcome;
  ```

**The consequence to state plainly:** arrows follow **declared edges**, not column order. The next arrow offers the next *declared* target, which may not be the next column.

- [ ] **Step 1: Write the failing tests for all three outcomes**

```ts
it('refuses an undeclared target, and names what is available', () => {
  const out = moveOutcome(def, 's-todo', 's-done');
  expect(out).toEqual({ kind: 'refused', available: ['s-doing'] });
});
it('submits directly when the declared edge carries no rules', () => {
  expect(moveOutcome(def, 's-todo', 's-doing')).toEqual({ kind: 'direct', toStateId: 's-doing' });
});
it('opens the dialog when the declared edge carries rules', () => {
  expect(moveOutcome(def, 's-doing', 's-blocked')).toEqual({ kind: 'needs-dialog', toStateId: 's-blocked' });
});
```

Build `def` from the fixture idiom already in `packages/app-core/test/views/`.

- [ ] **Step 2: Run to verify failure.** `cd packages/app-core && pnpm exec vitest run test/views/board-moves.test.ts 2>&1 | tail -20`
- [ ] **Step 3: Implement** over `transitionOptions` — never "set column = X".
- [ ] **Step 4: Run to verify pass**, plus `tsc`.
- [ ] **Step 5:** Document and commit.

### Task 13: Move arrows — refusal **and** its positive control

- [ ] **Step 1: Build the refusal path first.** It is the one a wrong target hits: an inline message naming the available moves, from `moveOutcome`'s `available`.
- [ ] **Step 2: Build the positive control in the SAME commit** — a move on a declared, rules-free edge that actually transitions the ticket. A refusal that fires on everything is indistinguishable from a refusal that works; only the successful move tells them apart.
- [ ] **Step 3: Test both**, and assert the refusal *names* the available moves rather than merely appearing.
- [ ] **Step 4: Style** per the board metrics: `min-height:32px; min-width:36px`, `ctlBg + ctlShadow`, accent, `15px/600`; unavailable is `opacity:0.4; cursor:not-allowed`.
- [ ] **Step 5:** Run, document, commit.

### Task 14: Drag and drop

- [ ] **Step 1: Route the drop through `moveOutcome`.** Same four outcomes, same refusal copy — a drop and an arrow that disagreed would be two products.
- [ ] **Step 2: Keep a keyboard path.** The arrows are it; drag-and-drop is an addition, never the only way to move a ticket.
- [ ] **Step 3: Test** a drop on a declared rules-free edge (succeeds) and on an undeclared one (refuses, naming alternatives).
- [ ] **Step 4:** Run the full suite, update `Features.md` and `test-cases/`, commit.

---

## Final verification

- [ ] `pnpm turbo run test 2>&1 | tail -40` — full suite green. **Never pipe to `head`.**
- [ ] `pnpm turbo run typecheck 2>&1 | tail -20` — clean.
- [ ] Reap orphaned vitest workers only (Global Constraints), never `pkill -f vitest`.
- [ ] `git diff origin/main...HEAD --stat` — every changed file is one this plan names.
- [ ] Confirm `.gn-card`, `.gn-chip`, `.gn-avatar`, `.gn-table`, `.gn-select`, `.gn-button` are untouched: `git diff origin/main...HEAD -- packages/ui/src/ui.css | grep -E "^[-+]\.gn-(card|chip|avatar|table|select|button) "` — expect no output.
- [ ] Confirm the sync strip was not drawn and the named absence still reads true.
- [ ] `Features.md` and `test-cases/` describe reality; no `?` markers introduced by this work remain.
