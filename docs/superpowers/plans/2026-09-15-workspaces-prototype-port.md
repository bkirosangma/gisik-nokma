# `/workspaces` Prototype Port Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/workspaces` visually match the desktop prototype — card sizes, styling and section ordering — while keeping the built product's chip semantics and withholding rules.

**Architecture:** One new token role (`tintWarning`) for the invitation banner's wash; five shared-component metric fixes in `packages/ui/src/ui.css`; page-local layout in `apps/web/app/globals.css`; and two pure helpers in `apps/web/src/workspace-viewer.ts` that turn served data into the card's two new sentences. The card's block-plus-margins layout becomes one flex column, and its per-project `<ul>` collapses to a single truncated line.

**Tech Stack:** Next.js App Router (client page), React 18, vitest + Testing Library, CSS custom properties generated from `packages/ui/src/tokens.ts`, Playwright for the viewport E2E sweep.

**Spec:** `docs/superpowers/specs/2026-09-15-workspaces-prototype-port-design.md`

**Reference:** `design-system/interactive/desktop.dc.html:176-230` (markup), `:12-79` (token values)

## Global Constraints

- **Never commit or push to `main`.** Work stays on `owner/workspace-edits`. Check the branch before every commit.
- **`reference/` is frozen.** Nothing under it is edited.
- **Never pipe a test or build run into `head` or `grep -m N`.** It orphans vitest workers at ppid=1. Use `| tail -N`, or `> /tmp/run.log 2>&1` then read the file. Never `pkill -f vitest`; never kill `pgrep -f vitest` output.
- **`Features.md` and `test-cases/` stay in sync in the same change set**, never a follow-up. Never renumber an existing case ID.
- **No colour literal may appear in `packages/ui/src/ui.css`** — `packages/ui/test/token-discipline.test.ts` scans it. Every `var(--gn-…)` there must name a role in `TOKEN_ROLES` (`packages/ui/test/tokens.test.ts:119`).
- **`primitives` is asserted hex-only.** Translucent values are 8-digit hex (`#rrggbbaa`), never `rgba()`.
- **No `CONTRAST_PAIRS` row may name an alpha primitive** (`tokens.ts:228`) — `relativeLuminance` ignores alpha, so such a row computes a false green. Alpha fills are verified by a bespoke composite check instead.
- **Withholding**: `null` count means *withheld* and is never rendered as `0`. `viewerOf(role).countsWithheld` is the single gate; no second source may decide it.
- **One interpolation per sentence.** React renders each JSX interpolation as its own text node, so a sentence assembled from several is split in the accessibility tree and in every `getByText`. Helpers return one complete string.
- The owner's dev server holds port 3001. Do not bind it.

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `packages/ui/src/tokens.ts` | `tintWarmWarning` / `tintNavyWarning` primitives + `tintWarning` role | 1 |
| `packages/ui/test/tokens.test.ts` | composite contrast check for the new role | 1 |
| `apps/web/src/workspace-viewer.ts` | `projectLine()` and `projectCountLine()` — served data → one sentence | 2 |
| `apps/web/test/workspace-viewer.test.ts` | truncation and pluralisation rules | 2 |
| `packages/ui/src/ui.css` | chip fill + metrics, avatar variant, field input, button padding | 3 |
| `packages/ui/src/components/avatar.tsx` | `'workspace'` added to the size union | 3 |
| `apps/web/app/globals.css` | page shell, title, grid, card, banner, founding metrics | 4, 5, 8, 9 |
| `apps/web/app/workspaces/page.tsx` | meta line, sentence move, project line, banner icon | 4, 6, 7, 8 |
| `Features.md`, `test-cases/` | catalogue sync | 10 |

---

### Task 0: Record the viewport E2E baseline

The viewport sweep is **already red**. Without a recorded baseline, a new `/workspaces` offender gets filed under the known pre-existing failures and never surfaces. This task produces the file every later verification compares against.

**Files:**
- Create: `.superpowers/sdd/2026-09-15-workspaces-prototype-port/viewport-baseline.log`

**Interfaces:**
- Produces: a baseline log naming each currently-failing spec and its offending selector. Task 10 diffs against it.

- [ ] **Step 1: Run the viewport sweep and capture it**

```bash
cd /Users/kiro/my_projects/gisik-nokma/apps/web
pnpm exec playwright test e2e-stack/viewport.spec.ts > .superpowers/sdd/2026-09-15-workspaces-prototype-port/viewport-baseline.log 2>&1; echo "EXIT=$?"
```

Note the `; echo "EXIT=$?"` — a count or a tail can look identical whether the run failed or errored out before starting. The exit status is the thing that distinguishes them.

- [ ] **Step 2: Read the baseline and write down the offenders**

```bash
tail -60 .superpowers/sdd/2026-09-15-workspaces-prototype-port/viewport-baseline.log
grep -c "✘\|failed" .superpowers/sdd/2026-09-15-workspaces-prototype-port/viewport-baseline.log
```

**If any current failure names `/workspaces`, stop and report it** — it changes what "no regression" means for this plan.

- [ ] **Step 3: Record the baseline in the plan's working notes**

Append the failing spec names and counts to the task's report. No commit — this is a measurement, not a change.

---

### Task 1: The `tintWarning` token role

The prototype's invitation banner is filled with `--tintWarning`, which has no counterpart in the built system. It is translucent, so it is an alpha primitive: 8-digit hex, no `CONTRAST_PAIRS` row, verified by a composite check.

**Prototype values** (`desktop.dc.html:20` light, `:40` dark — neo overrides neither, so all three styles share them per theme):

| Theme | Prototype | 8-digit hex |
|---|---|---|
| light | `rgba(240,124,52,0.20)` | `#f07c3433` (0.20 × 255 = 51 = `0x33`) |
| dark | `rgba(247,169,97,0.14)` | `#f7a96124` (0.14 × 255 ≈ 36 = `0x24`) |

The rounding matches the existing conversions: `fillWarmHig3: '#273a631c'` is `rgba(39,58,99,0.11)` at `0.11 × 255 = 28 = 0x1c`.

**Files:**
- Modify: `packages/ui/src/tokens.ts` (primitives block near `fillNavyNeo4:'#b098841a'` at :268; `TOKEN_ROLES` after `'fillQuaternary'`; each style/theme role→primitive map)
- Modify: `packages/ui/test/tokens.test.ts` (new describe block, after the `textAccent` block ending near :449)

**Interfaces:**
- Produces: the role `tintWarning`, reachable in CSS as `var(--gn-tint-warning)` (`cssVariableName` at `tokens.ts:969` lower-cases and hyphenates each capital). Task 8 consumes it.

- [ ] **Step 1: Write the failing composite test**

Add to `packages/ui/test/tokens.test.ts`. The `over()` helper is copied from the existing check at `:421-427` rather than hoisted — that file already declares it locally, and following the local habit keeps this diff to one block.

```ts
/**
 * `tintWarning` — the invitation banner's wash (2026-09-15).
 *
 * It is ALPHA, so no `CONTRAST_PAIRS` row may name it (`tokens.ts:228`):
 * `relativeLuminance` ignores alpha, and a declared pair would measure the
 * tint's own colour against a background it is actually blended INTO. The
 * obligation is against the COMPOSITE, which is what this block measures —
 * the same shape as the `fillTertiary` accent-on-filled check above.
 *
 * The banner sits at page level, so its ground is `surface` and only
 * `surface`. If it is ever nested inside a card, this check is measuring the
 * wrong ground and must gain the `surfaceRaised` composite too.
 */
describe('tintWarning composites legibly on every surface it can reach', () => {
  /** `src` over `dst` — the compositing `relativeLuminance` deliberately lacks. */
  const over = (src: string, dst: string): string => {
    const hex = (h: string, i: number): number => Number.parseInt(h.slice(i, i + 2), 16);
    const alpha = src.length === 9 ? hex(src, 7) / 255 : 1;
    const channel = (i: number): number =>
      Math.round(hex(src, i) * alpha + hex(dst, i) * (1 - alpha));
    return `#${[1, 3, 5].map((i) => channel(i).toString(16).padStart(2, '0')).join('')}`;
  };

  for (const style of STYLE_NAMES) {
    for (const theme of THEME_NAMES) {
      it(`${style}/${theme}: the banner's heading and body clear 4.5 on the composite`, () => {
        const surface = colorOf(theme, 'surface', style);
        const washed = over(colorOf(theme, 'tintWarning', style), surface);

        // THE ANTI-VACUOUS CONTROL, and it is not decoration: a fully
        // transparent tint composites to `surface` itself, and both
        // assertions below would then pass by measuring text on a bare
        // surface — which already passes. Without this line the check
        // cannot fail for the reason it exists.
        expect(washed, `${style}/${theme}: the tint composites to nothing`).not.toBe(surface);

        expect(
          contrastRatio(colorOf(theme, 'text', style), washed),
          `${style}/${theme}: the banner heading no longer clears 4.5 on the wash`,
        ).toBeGreaterThanOrEqual(4.5);
        expect(
          contrastRatio(colorOf(theme, 'textMuted', style), washed),
          `${style}/${theme}: the banner body no longer clears 4.5 on the wash`,
        ).toBeGreaterThanOrEqual(4.5);
      });
    }
  }
});
```

- [ ] **Step 2: Run it and verify it fails for the right reason**

```bash
cd /Users/kiro/my_projects/gisik-nokma/packages/ui
pnpm exec vitest run test/tokens.test.ts > /tmp/t1.log 2>&1; echo "EXIT=$?"; tail -40 /tmp/t1.log
```

Expected: FAIL — `tintWarning` is not a known role, so `colorOf` rejects it (a type error at compile, or a thrown lookup at run time). **Not** a contrast failure. If it fails with a contrast number instead, the role already exists and this task's premise is wrong.

- [ ] **Step 3: Add the two primitives**

In `packages/ui/src/tokens.ts`, after `fillNavyNeo4: '#b098841a',` (:268):

```ts
  /**
   * The invitation banner's warning wash — the prototype's `--tintWarning`
   * (`desktop.dc.html:20` light, `:40` dark). Eight-digit hex, not `rgba()`,
   * because `primitives` is asserted hex-only.
   *
   * **ALPHA, so no `CONTRAST_PAIRS` row may name it** — see the fill
   * hierarchy's docblock above for why that would be a false green. It is
   * measured where it is real, composited over `surface`, in
   * `test/tokens.test.ts`.
   *
   * All three styles share one value per theme: the prototype's `neo` block
   * (`desktop.dc.html:53-67`) overrides many tokens and this is not one of them.
   */
  tintWarmWarning: '#f07c3433',
  tintNavyWarning: '#f7a96124',
```

- [ ] **Step 4: Declare the role**

In `TOKEN_ROLES`, immediately after `'fillQuaternary',`:

```ts
  /**
   * A tinted WASH, not a fill step: the invitation banner's ground. It is
   * translucent so it reads as a coloured veil over whatever surface it sits
   * on, which is exactly why its contrast obligation is against the
   * composite rather than against itself.
   */
  'tintWarning',
```

- [ ] **Step 5: Map the role in every style/theme table**

Each style's light and dark role→primitive map gets a `tintWarning` entry alongside `fillQuaternary` (the light `hig` map is near `:588`; find each by searching for `fillQuaternary:`). Light maps take `'tintWarmWarning'`, dark maps take `'tintNavyWarning'`:

```ts
  tintWarning: 'tintWarmWarning',   // in each LIGHT map
  tintWarning: 'tintNavyWarning',   // in each DARK map
```

- [ ] **Step 6: Run the test to verify it passes**

```bash
cd /Users/kiro/my_projects/gisik-nokma/packages/ui
pnpm exec vitest run test/tokens.test.ts > /tmp/t1b.log 2>&1; echo "EXIT=$?"; tail -40 /tmp/t1b.log
```

Expected: PASS, all six combinations.

**If any combination is red on contrast**, do not weaken the minimum and do not switch the text role silently. Nudge the tint's ALPHA in the same hue — the documented precedent is `fillNavyHig3` (`tokens.ts:251-265`), whose alpha went 0.16→0.13 to restore 4.558, with the before and after numbers written into the docblock. Record both numbers the same way, then re-run.

- [ ] **Step 7: Run the whole `packages/ui` suite**

```bash
cd /Users/kiro/my_projects/gisik-nokma/packages/ui
pnpm exec vitest run > /tmp/t1c.log 2>&1; echo "EXIT=$?"; tail -30 /tmp/t1c.log
```

Expected: PASS. The role-count and stylesheet-shape cases also read `TOKEN_ROLES`, so this catches a map left un-updated in Step 5.

- [ ] **Step 8: Commit**

```bash
cd /Users/kiro/my_projects/gisik-nokma
git rev-parse --abbrev-ref HEAD   # must NOT be main
git add packages/ui/src/tokens.ts packages/ui/test/tokens.test.ts
git commit -m "Add tintWarning, measured on the composite because alpha cannot be paired"
```

---

### Task 2: The card's two new sentences

Both are pure functions over served data, so they get tested without a DOM. They live beside `restrictedLine` in `apps/web/src/workspace-viewer.ts` — the module extracted precisely so the card and the workspace home cannot drift apart.

**Files:**
- Modify: `apps/web/src/workspace-viewer.ts`
- Test: `apps/web/test/workspace-viewer.test.ts` (create if absent; otherwise append a describe block)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `projectCountLine(liveCount: number): string | null`
  - `projectLine(names: readonly string[], countsWithheld: boolean): string | null`
  - `PROJECT_LINE_CAP: number` (= 3)

  Task 6 consumes `projectCountLine`; Task 7 consumes `projectLine`.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest';
import { PROJECT_LINE_CAP, projectCountLine, projectLine } from '../src/workspace-viewer.js';

describe('projectCountLine — the card meta line', () => {
  it('says "1 project" in the singular, which a plural-only implementation cannot', () => {
    expect(projectCountLine(1)).toBe('1 project');
  });

  it('pluralises above one', () => {
    expect(projectCountLine(4)).toBe('4 projects');
  });

  // Zero renders NOTHING, the same rule `restrictedLine` keeps: a card with no
  // live projects must not announce "0 projects".
  it('renders nothing at zero', () => {
    expect(projectCountLine(0)).toBeNull();
  });
});

describe('projectLine — names joined, then truncated', () => {
  const four = ['Delivery', 'Site readiness', 'Winter stock', 'Payroll'];

  it('joins every name when there are no more than the cap', () => {
    expect(projectLine(['Delivery', 'Site readiness'], false)).toBe('Delivery · Site readiness');
  });

  it('joins exactly the cap without a suffix — the boundary a cap-off-by-one gets wrong', () => {
    expect(projectLine(four.slice(0, PROJECT_LINE_CAP), false)).toBe(
      'Delivery · Site readiness · Winter stock',
    );
  });

  it('truncates past the cap and COUNTS the remainder', () => {
    expect(projectLine(four, false)).toBe('Delivery · Site readiness · Winter stock · +1 more');
  });

  /**
   * 13.380 is named "a guest card shows one 'Restricted' chip and no number
   * anywhere", so the suffix cannot carry a count when counts are withheld.
   * The names themselves still render — a guest sees the projects handed to
   * them by name; it is the NUMBERS that are withheld.
   */
  it('drops the number from the suffix when counts are withheld', () => {
    expect(projectLine(four, true)).toBe('Delivery · Site readiness · Winter stock · and more');
  });

  it('is unaffected by withholding when nothing is truncated', () => {
    expect(projectLine(['Delivery'], true)).toBe('Delivery');
  });

  it('renders nothing when no project can be named', () => {
    expect(projectLine([], false)).toBeNull();
    expect(projectLine([], true)).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd /Users/kiro/my_projects/gisik-nokma/apps/web
pnpm exec vitest run test/workspace-viewer.test.ts > /tmp/t2.log 2>&1; echo "EXIT=$?"; tail -30 /tmp/t2.log
```

Expected: FAIL — `projectCountLine` / `projectLine` are not exported.

- [ ] **Step 3: Implement both helpers**

Append to `apps/web/src/workspace-viewer.ts`:

```ts
/**
 * *"2 projects"* — the card's meta line, and the count is `live.length` ALONE.
 *
 * The tempting sum is `live.length + nameRestrictedProjectCount`, and it is
 * wrong. `apps/server/src/read/workspace-counts.ts:259-265` states that the
 * restricted count **is never split by `archived` and cannot be** — a project
 * whose name is withheld has no `archived` flag as far as this caller is
 * concerned, because that flag is served only alongside the name it rides
 * with. Adding an archived-UNKNOWN count to an archived-EXCLUDED one produces
 * a number that counts nothing. The restricted projects keep their own
 * sentence (`restrictedLine` above), which is why that sentence exists apart
 * from this one.
 *
 * Zero renders NOTHING, the same rule `restrictedLine` keeps.
 */
export function projectCountLine(liveCount: number): string | null {
  if (liveCount <= 0) return null;
  return `${liveCount} ${liveCount === 1 ? 'project' : 'projects'}`;
}

/**
 * How many project names the card prints before it stops naming them.
 *
 * A COUNT, deliberately, and not a CSS line-clamp. A clamp truncates whatever
 * overflows — including the "+N more" suffix itself, which would hide the very
 * number the suffix exists to give. Three names is what the prototype's
 * ~280px card fits on two lines at 15px.
 */
export const PROJECT_LINE_CAP = 3;

/**
 * *"Delivery · Site readiness · Winter stock · +1 more"* — the prototype's
 * single project line, truncated.
 *
 * `names` is the LIVE, NAMED projects: archived ones never reach this card,
 * and name-restricted ones are absent from the served array by construction.
 * An empty list renders nothing rather than an empty line, and the
 * name-restricted sentence covers the case where that emptiness is the point.
 *
 * ## The suffix has two forms, and the reason is a test's name
 *
 * `test/workspaces-cards.test.tsx`'s 13.380 is *"a guest card shows one
 * 'Restricted' chip and **no number anywhere**"*. A guest still sees the
 * project names — their set is exactly the errands handed to them by name —
 * so the line renders; but "+1 more" is a number, so a withheld viewer gets
 * "and more" instead. Both forms read `countsWithheld`, which the caller took
 * from `viewerOf(role)`: there is no second read of the role here.
 *
 * ONE interpolation, not several — React renders each as its own text node,
 * and a sentence split across nodes is split in the accessibility tree and in
 * every `getByText` that looks for it.
 */
export function projectLine(
  names: readonly string[],
  countsWithheld: boolean,
): string | null {
  if (names.length === 0) return null;
  const shown = names.slice(0, PROJECT_LINE_CAP).join(' · ');
  const hidden = names.length - PROJECT_LINE_CAP;
  if (hidden <= 0) return shown;
  return `${shown} · ${countsWithheld ? 'and more' : `+${hidden} more`}`;
}
```

- [ ] **Step 4: Run to verify it passes**

```bash
cd /Users/kiro/my_projects/gisik-nokma/apps/web
pnpm exec vitest run test/workspace-viewer.test.ts > /tmp/t2b.log 2>&1; echo "EXIT=$?"; tail -30 /tmp/t2b.log
```

Expected: PASS, 9 cases.

- [ ] **Step 5: Commit**

```bash
cd /Users/kiro/my_projects/gisik-nokma
git add apps/web/src/workspace-viewer.ts apps/web/test/workspace-viewer.test.ts
git commit -m "The card's project line, truncated — and why the count is live.length alone"
```

---

### Task 3: Shared `ui.css` metrics

These ship to the desktop app too (`apps/desktop/src/main.tsx:6` imports `@gisik-nokma/ui/ui.css`). Neither desktop nor mobile renders a workspace card, so nothing there changes shape — but each edit is justified as a component improvement rather than a page preference.

**Prototype values** (`desktop.dc.html:24` hig, `:50` minimal, `:58-61` neo light, `:71-73` neo dark):

| Token | hig | minimal | neo |
|---|---|---|---|
| `--chipPad` | `4px 10px` | `4px 0` | `5px 12px` |
| `--chipBg` | `fill3` | `transparent` | surface + inset shadow |

**Files:**
- Modify: `packages/ui/src/ui.css` (`.gn-chip` at :75, `.gn-chip__dot` at :85, `.gn-avatar--*`, `.gn-field__input`, `.gn-button`)
- Modify: `packages/ui/src/components/avatar.tsx:9`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `.gn-avatar--workspace` and the `'workspace'` member of `AvatarProps['size']`. Task 6 consumes both.

- [ ] **Step 1: Add `'workspace'` to the avatar size union**

`packages/ui/src/components/avatar.tsx:9`:

```ts
export type AvatarProps = {
  name: string;
  /** `workspace` is the 44px rounded SQUARE the workspace card uses — see `.gn-avatar--workspace` in `ui.css` for why a non-circular avatar already belongs in this set. */
  size?: 'small' | 'medium' | 'large' | 'workspace';
  tint?: string;
};
```

- [ ] **Step 2: Add the avatar variant to `ui.css`**

Beside the other `.gn-avatar--*` rules:

```css
/* The workspace card's monogram: 44px, rounded square, per the prototype
   (`desktop.dc.html:2547`). `--large` (3.5rem, 0.875rem radius) is the
   precedent that a non-circular avatar already belongs in this set, so this
   adds a size rather than an exception. The prototype's per-workspace brand
   hexes are deliberately NOT adopted — a monogram is read text and owes
   4.5:1, which is what the four contrast-paired tints guarantee. */
.gn-avatar--workspace {
  width: 2.75rem;
  height: 2.75rem;
  border-radius: 0.6875rem;
  font-size: 1.0625rem;
}
```

- [ ] **Step 3: Fix the chip fill and metrics**

Replace the `.gn-chip` and `.gn-chip__dot` rules at `ui.css:75-89`:

```css
/* `fill-tertiary`, NOT `surface-raised`. A chip's background was the same
   role as the card it sits on, which made every chip on every card
   invisible — a real defect, found while porting the workspace card, and
   fixed here rather than overridden per page. Metrics follow the prototype
   (`desktop.dc.html:362` for 13px/18px and the 9px dot; `:24` for hig's
   4px/10px pad). */
.gn-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  border-radius: 999px;
  padding: 0.25rem 0.625rem;
  font-size: 0.8125rem;
  line-height: 1.125rem;
  background: var(--gn-fill-tertiary);
  color: var(--gn-text);
}

.gn-chip__dot {
  width: 0.5625rem;
  height: 0.5625rem;
  border-radius: 50%;
  background: var(--gn-text-muted);
}

/* The prototype gives the chip a different pad per style
   (`desktop.dc.html:50` minimal, `:58` neo). Written as style-scoped rules
   rather than a custom property: `tokens.test.ts:119` requires every
   `var(--gn-…)` in this file to name a declared role, and while its regex
   happens not to match the fallback form `var(--gn-chip-pad, …)`, passing a
   check by a regex subtlety is not passing it. Direct rules are also how
   this file already does per-style overrides. */
[data-style='minimal'] .gn-chip { padding: 0.25rem 0; }
[data-style='neo'] .gn-chip { padding: 0.3125rem 0.75rem; }
```

The tone modifiers at `ui.css:91-97` are left exactly as they are — they colour only the dot, and ruling 1(a) keeps the chips untinted.

- [ ] **Step 4: Fix the field input and the button**

```css
/* The prototype's field has no hairline — it is a recessed shape made of
   shadow (`desktop.dc.html:61` neo, `:26` hig). The 1px border it replaces
   was drawing a second edge on top of that shape under neo. */
.gn-field__input {
  min-height: 2.75rem;
  padding: 0 0.875rem;
  border: none;
  border-radius: var(--gn-radius-control);
  background: var(--gn-fill-quaternary);
  color: var(--gn-text);
  font: inherit;
  font-size: 1.0625rem;
}

.gn-button {
  /* …existing declarations unchanged… */
  padding: 0 1.125rem;
}

/* The field's own column spacing and label size, also from the prototype
   (`desktop.dc.html:223`/`:225`). These live HERE, in the shared stylesheet,
   because `.gn-field` and `.gn-field__label` are declared here at :2408-2416
   — never in a page stylesheet, where a duplicate would win by load order
   and silently diverge from the shared rule. */
.gn-field {
  display: flex;
  flex-direction: column;
  gap: 0.4375rem;
}

.gn-field__label {
  font-size: 0.8125rem;
  line-height: 1.125rem;
  color: var(--gn-text-muted);
}
```

Reconcile with the existing neo sunken-field rule rather than duplicating it: if that rule already sets the inset shadow, leave it; if it also sets a border, remove the border there.

- [ ] **Step 5: Run the `packages/ui` suite**

```bash
cd /Users/kiro/my_projects/gisik-nokma/packages/ui
pnpm exec vitest run > /tmp/t3.log 2>&1; echo "EXIT=$?"; tail -40 /tmp/t3.log
```

Expected: PASS. `token-discipline.test.ts` confirms no colour literal entered; `tokens.test.ts:119` confirms every `var(--gn-…)` names a declared role.

- [ ] **Step 6: Run the web suite for fallout**

```bash
cd /Users/kiro/my_projects/gisik-nokma/apps/web
pnpm exec vitest run > /tmp/t3b.log 2>&1; echo "EXIT=$?"; tail -40 /tmp/t3b.log
```

Expected: PASS. `sign-in`, `/w/[workspaceId]` and `app-nav` all use these components; any red here is a real regression, not a test to update.

- [ ] **Step 7: Commit**

```bash
cd /Users/kiro/my_projects/gisik-nokma
git add packages/ui/src/ui.css packages/ui/src/components/avatar.tsx
git commit -m "Chips were invisible on cards — both were surface-raised"
```

---

### Task 4: Page shell, title and the summary line

**Files:**
- Modify: `apps/web/app/globals.css` (`.gn-page-title`)
- Modify: `apps/web/app/workspaces/page.tsx`
- Test: `apps/web/test/workspaces-cards.test.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: `.gn-workspaces` (the page-local container) and `.gn-workspaces__summary`. Task 5 nests the grid inside the first.

- [ ] **Step 1: Write the failing test for the summary's absence**

The interesting case is not that the summary renders — it is that it does **not** render on a failed read, where a naive implementation prints "0 workspaces you belong to."

```tsx
it('prints no summary when the workspaces read refused — a count of nothing counted', async () => {
  mountRefusing('The ledger is unavailable.');
  await screen.findByText(/ledger is unavailable/i);
  expect(screen.queryByText(/workspaces? you belong to/i)).toBeNull();
});

it('summarises the list once it has one', async () => {
  mountWith([workspace({ id: 'ws1', memberCount: 1 }), workspace({ id: 'ws2', memberCount: 1 })]);
  expect(await screen.findByText('2 workspaces you belong to')).toBeInTheDocument();
});
```

Use whatever refusal helper the file already has for the `ShellRefusal` branch; if it has none, seed the error state the same way the existing refusal case does.

- [ ] **Step 2: Run to verify it fails**

```bash
cd /Users/kiro/my_projects/gisik-nokma/apps/web
pnpm exec vitest run test/workspaces-cards.test.tsx > /tmp/t4.log 2>&1; echo "EXIT=$?"; tail -30 /tmp/t4.log
```

Expected: FAIL on the second case — no summary element exists yet. The first case passes trivially for now, which is exactly why it is paired with the second.

- [ ] **Step 3: Add the page-local container and title rules**

In `apps/web/app/globals.css`:

```css
/* The prototype caps this screen at 1180px (`desktop.dc.html:178`), not at
   `.gn-shell`'s 80rem. The cap is PER-SCREEN in the prototype — the
   workspace home uses 1100px — so it lives here rather than widening or
   narrowing every route that shares the shell. `.gn-workspace-founding`
   existing apart from `.gn-project-founding` is the same precedent. */
.gn-workspaces {
  max-width: 73.75rem;
  margin: 0 auto;
  padding: 1.625rem 1.5rem 2.5rem;
}

.gn-workspaces__summary {
  margin: 0;
  font-size: 1.0625rem;
  line-height: 1.375rem;
  color: var(--gn-text-muted);
}

/* The font-size change is GLOBAL and meant to be: this rule declared no
   font-size at all and fell through to the UA's `2em` on all thirteen pages
   that use it, and 34px is the prototype's page-title size across screens.
   Keep its EXISTING `margin` declaration exactly as it is. */
.gn-page-title {
  font-size: 2.125rem;
  line-height: 2.5625rem;
  font-weight: 700;
  letter-spacing: -0.025em;
}

/* The margin reset is SCOPED, because `.gn-page-title` is shared by thirteen
   pages (`/account`, `/inbox`, `/settings`, `/invite/[token]`, every `/w/*`
   screen…) and zeroing it globally would collapse the heading spacing on all
   of them. Only this page hands its spacing to a flex column. */
.gn-workspaces__head .gn-page-title {
  margin: 0;
}

.gn-workspaces__head {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
```

- [ ] **Step 4: Render the head in the page**

Wrap the title and summary, and gate the summary on a non-null list:

```tsx
<div className="gn-workspaces__head">
  <h1 className="gn-page-title">
    Workspaces{user !== null ? ` — ${user.name}` : ''}
  </h1>
  {/* Gated on `workspaces !== null`, not on `.length`: a REFUSED read is
      also `null` here, and a summary rendered through it would print "0
      workspaces you belong to." — a number nobody counted, about a list
      nobody managed to read. ONE interpolation, so the sentence is one
      text node. */}
  {workspaces !== null ? (
    <p className="gn-workspaces__summary">
      {`${workspaces.length} ${workspaces.length === 1 ? 'workspace' : 'workspaces'} you belong to`}
    </p>
  ) : null}
</div>
```

Add `className="gn-workspaces"` to the content wrapper inside `<main className="gn-shell">`.

- [ ] **Step 5: Run to verify it passes**

```bash
cd /Users/kiro/my_projects/gisik-nokma/apps/web
pnpm exec vitest run test/workspaces-cards.test.tsx > /tmp/t4b.log 2>&1; echo "EXIT=$?"; tail -30 /tmp/t4b.log
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
cd /Users/kiro/my_projects/gisik-nokma
git add apps/web/app/globals.css apps/web/app/workspaces/page.tsx apps/web/test/workspaces-cards.test.tsx
git commit -m "The page title had no font-size, and the summary must not count a refusal"
```

---

### Task 5: Grid and card container geometry

**Files:**
- Modify: `apps/web/app/globals.css` (`.gn-workspace-list`, `.gn-workspace-card__door`, card padding)
- Test: `packages/ui/test/neo-card-radius.test.ts` (verified, not changed)

**Interfaces:**
- Consumes: `.gn-workspaces` from Task 4.
- Produces: the flex-column card whose children Tasks 6–7 fill. The three per-child top margins are gone, so those tasks must not re-add them.

- [ ] **Step 1: Rewrite the grid and card rules**

```css
/* `auto-fit`, not `auto-fill`: `auto-fill` keeps empty tracks, so three
   workspaces render at their 280px minimum with dead space to the right of
   them. `auto-fit` collapses the empty tracks and lets the real cards
   stretch. Prototype: `desktop.dc.html:184`. */
.gn-workspace-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(17.5rem, 1fr));
  gap: 1.125rem;
  margin-top: 1.625rem;
  padding: 0;
  list-style: none;
}

/* The card is ONE flex column at 12px, replacing a block with three
   per-child top margins (`__chips` 0.6rem, `__projects` 0.7rem,
   `__restricted` 0.55rem — all three deleted with this change). The padding
   lives on the DOOR, not on a `.gn-workspace-list .gn-card` rule:
   `packages/ui/test/neo-card-radius.test.ts:41` asserts that selector does
   not exist, and it was deleted in Task 15 for reasons that still hold. */
.gn-workspace-card__door {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  color: var(--gn-text);
  text-decoration: none;
  border-radius: var(--gn-radius-card);
  /* `margin: -0.75rem` is the exact negative of `.gn-card`'s own `0.75rem`
     padding. It pulls the door out to the card's edge so the hover fill and
     the focus ring cover the whole card rather than a box inset within it.
     THAT pairing is coupled: if `.gn-card`'s padding ever changes, this
     margin must change with it.

     The door's own `padding: 1.25rem` is NOT part of that pairing. It is the
     prototype's 20px card padding, which the door supplies precisely BECAUSE
     the line above has just cancelled the card's own. Do not "correct" the
     margin to `-1.25rem` to match it — that would inset the card twice. */
  margin: -0.75rem;
  padding: 1.25rem;
}

/* PRESERVED VERBATIM from the rule this replaces (`globals.css:183-184`).
   The block above rewrites `.gn-workspace-card__door`, and dropping these
   two would cost the card its hover affordance and — far worse — its
   visible focus ring, which no styling ratchet in this repo would catch. */
.gn-workspace-card__door:hover { background: var(--gn-surface-sunken); }
.gn-workspace-card__door:focus-visible {
  outline: 2px solid var(--gn-focus-ring);
  outline-offset: 2px;
}
```

- [ ] **Step 2: Delete the three superseded margin rules**

Remove the `margin` declarations from `.gn-workspace-card__chips`, `.gn-workspace-card__projects` and `.gn-workspace-card__restricted`. The flex gap now owns that spacing; leaving them makes every gap 12px + the old margin.

- [ ] **Step 3: Confirm the forbidden selector stayed absent**

```bash
cd /Users/kiro/my_projects/gisik-nokma
grep -n "gn-workspace-list .gn-card" apps/web/app/globals.css packages/ui/src/ui.css; echo "EXIT=$?"
```

Expected: no matches, `EXIT=1`. A match means Step 1 was implemented the forbidden way.

- [ ] **Step 4: Run both suites**

```bash
cd /Users/kiro/my_projects/gisik-nokma/packages/ui
pnpm exec vitest run test/neo-card-radius.test.ts > /tmp/t5.log 2>&1; echo "EXIT=$?"; tail -20 /tmp/t5.log
cd /Users/kiro/my_projects/gisik-nokma/apps/web
pnpm exec vitest run > /tmp/t5b.log 2>&1; echo "EXIT=$?"; tail -30 /tmp/t5b.log
```

Expected: PASS both.

- [ ] **Step 5: Commit**

```bash
cd /Users/kiro/my_projects/gisik-nokma
git add apps/web/app/globals.css
git commit -m "auto-fit over auto-fill, and the card becomes one flex column"
```

---

### Task 6: The card head — meta line, avatar, and the sentence that moves

**Files:**
- Modify: `apps/web/app/workspaces/page.tsx:251-264`
- Modify: `apps/web/app/globals.css`
- Test: `apps/web/test/workspaces-cards.test.tsx` (13.379, 13.380)

**Interfaces:**
- Consumes: `projectCountLine` (Task 2), `.gn-avatar--workspace` and `size="workspace"` (Task 3).
- Produces: `.gn-workspace-card__meta`. Task 7 places the project line below the chips.

- [ ] **Step 1: Update the failing tests**

In 13.379, the head now carries a project count and the role sentence has moved below the chips. The chips are **unchanged** — ruling 1(a). Replace the head assertions with:

```tsx
// The meta line: `live.length` alone. Two live projects here (p3 is
// archived), so a sum that folded in `nameRestrictedProjectCount` (2) would
// print "4 projects" and redden.
expect(within(card).getByText('2 projects')).toBeInTheDocument();

// The chip set is UNCHANGED by the prototype port — the built labels stay.
expect(within(card).getByText('5 members')).toBeInTheDocument();
expect(within(card).getByText('14 active')).toBeInTheDocument();
expect(within(card).getByText('6 blocked')).toBeInTheDocument();
expect(within(card).getByText('1 archived')).toBeInTheDocument();
```

In 13.380, add the guest's negative control for the meta line:

```tsx
// 13.380's own name is "no number anywhere", and the meta line is a number.
expect(within(card).queryByText(/\d+ projects?$/)).toBeNull();
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd /Users/kiro/my_projects/gisik-nokma/apps/web
pnpm exec vitest run test/workspaces-cards.test.tsx > /tmp/t6.log 2>&1; echo "EXIT=$?"; tail -40 /tmp/t6.log
```

Expected: FAIL — no element carries "2 projects".

- [ ] **Step 3: Rewrite the card head**

`apps/web/app/workspaces/page.tsx`, replacing the `__head` block at :251-264:

```tsx
<div className="gn-workspace-card__head">
  {/* The tint key is the workspace ID, not its name: two workspaces
      called the same thing must still be told apart, and a rename must
      not change a colour a person has learned. */}
  <Avatar name={workspace.name} tint={workspace.id} size="workspace" />
  <div className="gn-workspace-card__titles">
    <h2>{workspace.name}</h2>
    {/* The prototype's meta line. It carries the PROJECT count only:
        the members chip below already says the member count, and the
        prototype's "5 members · 2 projects" would say it twice on one
        card. Gated on `countsWithheld` because 13.380 is named "no
        number anywhere" — a guest sees names, never counts. */}
    {!viewer.countsWithheld && meta !== null ? (
      <p className="gn-workspace-card__meta">{meta}</p>
    ) : null}
  </div>
</div>
```

Move the role sentence out of `__titles` to sit directly after `<ChipRow …/>`:

```tsx
<ChipRow workspace={workspace} viewer={viewer} archivedCount={archived.length} />

{/* 13.357's role label, now a SENTENCE and now BELOW the chips, which is
    where the prototype puts it (`desktop.dc.html:205`). The raw enum was a
    database value on a card; `viewerOf` is the one place it becomes
    English, and the same object gates every number above. */}
<p className="gn-workspace-list__role">{viewer.sentence}</p>
```

Import `projectCountLine` alongside the existing `restrictedLine` import, and bind the sentence once beside the other derived values at the top of `WorkspaceCard` (it is called in both the condition and the body, so a bare double call would be flagged):

```tsx
const meta = projectCountLine(live.length);
```

- [ ] **Step 4: Add the head and type rules**

```css
.gn-workspace-card__head {
  display: flex;
  align-items: center;      /* was flex-start — the prototype centres on the 44px monogram */
  gap: 0.875rem;
  flex-wrap: nowrap;
}

.gn-workspace-card__titles {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
  min-width: 0;             /* lets a long name ellipsise instead of pushing the monogram */
}

.gn-workspace-card__titles h2 {
  margin: 0;
  font-size: 1.25rem;
  line-height: 1.5625rem;
  font-weight: 600;
  overflow-wrap: anywhere;
}

.gn-workspace-card__meta {
  margin: 0;
  font-size: 0.8125rem;
  line-height: 1.125rem;
  color: var(--gn-text-muted);
}

.gn-workspace-list__role {
  margin: 0;                /* the flex column owns the spacing now */
  font-size: 0.9375rem;
  line-height: 1.25rem;
  color: var(--gn-text-muted);
}

.gn-workspace-card__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}
```

- [ ] **Step 5: Run to verify it passes**

```bash
cd /Users/kiro/my_projects/gisik-nokma/apps/web
pnpm exec vitest run test/workspaces-cards.test.tsx > /tmp/t6b.log 2>&1; echo "EXIT=$?"; tail -40 /tmp/t6b.log
```

Expected: PASS, including 13.357 untouched — it asserts the sentence's text, not its position.

- [ ] **Step 6: Commit**

```bash
cd /Users/kiro/my_projects/gisik-nokma
git add apps/web/app/workspaces/page.tsx apps/web/app/globals.css apps/web/test/workspaces-cards.test.tsx
git commit -m "The card head gains a project count and loses the role sentence to the row below"
```

---

### Task 7: The project line replaces the per-project rows

This is ruling 1(b), and it is the task that loses something: per-project ticket counts and the `project-card-<id>` testids go with the rows. That detail remains one click away at `/w/<id>`.

**Files:**
- Modify: `apps/web/app/workspaces/page.tsx` (delete `ProjectRow`, replace the `<ul>`)
- Modify: `apps/web/app/globals.css`
- Test: `apps/web/test/workspaces-cards.test.tsx` (3.154, 13.379, 13.380)

**Interfaces:**
- Consumes: `projectLine` (Task 2), the flex column (Task 5).
- Produces: `.gn-workspace-card__projects` as a single `<p>`, not a `<ul>`.

- [ ] **Step 1: Update the tests**

Case 3.154 ("keys each project card by its own projectId") loses its subject on this page. **Do not delete the case** — the workspace home still renders project cards. Narrow it to that page, or if it only ever drove `/workspaces`, mark it 🚫 in `test-cases/` with the one-line reason "the workspaces card no longer renders per-project rows (2026-09-15 prototype port)" and delete the assertions here.

In 13.379, replace the per-project assertions:

```tsx
// The two live projects, joined into ONE line. `getByText` on the whole
// sentence is the assertion a multi-interpolation version fails.
expect(within(card).getByText('Shop operations · Deliveries')).toBeInTheDocument();
// The archived project is named nowhere — its only trace is the chip.
expect(within(card).queryByText(/Last winter/)).toBeNull();
expect(within(card).queryByTestId('project-card-p1')).toBeNull();
```

Add a truncation case at the card level, so the helper's rule is pinned where it renders too:

```tsx
it('names three projects and counts the rest, so a wide workspace does not grow the card', async () => {
  mountWith([
    workspace({
      id: 'ws1',
      memberCount: 3,
      projects: ['Delivery', 'Site readiness', 'Winter stock', 'Payroll'].map((name, i) =>
        project({ id: `p${i}`, name, ticketCount: 1, blockedCount: 0 }),
      ),
    }),
  ]);
  const card = await screen.findByTestId('workspace-card-ws1');
  expect(
    within(card).getByText('Delivery · Site readiness · Winter stock · +1 more'),
  ).toBeInTheDocument();
  // The meta line still counts ALL four, so the truncation never becomes
  // the card's answer to "how many projects are in here".
  expect(within(card).getByText('4 projects')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd /Users/kiro/my_projects/gisik-nokma/apps/web
pnpm exec vitest run test/workspaces-cards.test.tsx > /tmp/t7.log 2>&1; echo "EXIT=$?"; tail -40 /tmp/t7.log
```

Expected: FAIL — the joined line does not exist; the `<ul>` still renders rows.

- [ ] **Step 3: Replace the list with the line**

Delete the `ProjectRow` function and its docblock. Replace the `<ul>` block with:

```tsx
{/* The prototype's single project line (`desktop.dc.html:206`), replacing
    the per-project rows. The chevron is decorative — the whole card is
    already one link named by the workspace, so the arrow names nothing a
    screen reader has not already been told. */}
{projects !== null ? (
  <p className="gn-workspace-card__projects">
    {projects}
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m9 6 6 6-6 6" />
    </svg>
  </p>
) : null}
```

Import `projectLine`, and bind the sentence once beside `meta` at the top of `WorkspaceCard` — it is called in both the condition and the body:

```tsx
const projects = projectLine(live.map((p) => p.name), viewer.countsWithheld);
```

Remove the now-unused `ProjectRef` import if nothing else in the file uses it.

- [ ] **Step 4: Style the line**

```css
.gn-workspace-card__projects {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0;
  font-size: 0.9375rem;
  line-height: 1.25rem;
  color: var(--gn-text-muted);
}

/* The chevron takes its colour from `currentColor`'s dimmer sibling and
   never shrinks — `flex: none` keeps a long project line from squeezing it
   into a sliver. */
.gn-workspace-card__projects svg {
  flex: none;
  color: var(--gn-text-subtle);
}

.gn-workspace-card__restricted {
  margin: 0;
  font-size: 0.9375rem;
  line-height: 1.25rem;
  color: var(--gn-text-muted);
}
```

`stroke="currentColor"` plus a `color` on the element keeps the colour in CSS, where a token can reach it, rather than inlining `var(--gn-text-subtle)` in the JSX.

- [ ] **Step 5: Run to verify it passes**

```bash
cd /Users/kiro/my_projects/gisik-nokma/apps/web
pnpm exec vitest run > /tmp/t7b.log 2>&1; echo "EXIT=$?"; tail -40 /tmp/t7b.log
```

Expected: PASS, whole web suite.

- [ ] **Step 6: Commit**

```bash
cd /Users/kiro/my_projects/gisik-nokma
git add apps/web/app/workspaces/page.tsx apps/web/app/globals.css apps/web/test/workspaces-cards.test.tsx
git commit -m "Per-project rows become one truncated line, per the owner's ruling"
```

---

### Task 8: The invitation banner

**Files:**
- Modify: `apps/web/app/globals.css` (`.gn-invitations`)
- Modify: `apps/web/app/workspaces/page.tsx` (`InvitationBanner`)
- Test: `apps/web/test/workspaces-invitation-banner.test.tsx`

**Interfaces:**
- Consumes: `var(--gn-tint-warning)` (Task 1).

- [ ] **Step 1: Restyle the banner**

```css
/* The prototype fills this banner with a warning WASH and gives it neither
   a shadow nor an edge (`desktop.dc.html:212`). It previously borrowed the
   raised-card treatment plus an accent inline-start rule, which made an
   invitation look like a card you could open. */
.gn-invitations {
  display: flex;
  gap: 1rem;
  align-items: flex-start;
  margin-top: 2.125rem;
  padding: 1.25rem;
  background: var(--gn-tint-warning);
  border-radius: var(--gn-radius-card);
}

.gn-invitations__body {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.gn-invitations__icon {
  flex: none;
  color: var(--gn-warning);
}

.gn-invitations__heading {
  margin: 0;
  font-size: 1.0625rem;
  line-height: 1.375rem;
  font-weight: 600;
}

.gn-invitations__offer,
.gn-invitations__when {
  margin: 0;
  font-size: 0.9375rem;
  line-height: 1.25rem;
  color: var(--gn-text-muted);
}

.gn-invitations__actions {
  display: flex;
  gap: 0.75rem;
  margin-top: 0.625rem;
  flex-wrap: wrap;
}
```

- [ ] **Step 2: Add the icon and the body wrapper**

Inside the `<section className="gn-invitations">`, before the existing heading:

```tsx
{/* Decorative: the heading already says an invitation is waiting, so an
    accessible name here would be the same sentence read twice. */}
<svg
  className="gn-invitations__icon"
  width="22"
  height="22"
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  strokeWidth="1.8"
  strokeLinecap="round"
  strokeLinejoin="round"
  aria-hidden="true"
>
  <circle cx="12" cy="12" r="9" />
  <path d="M12 8v5" />
  <path d="M12 16h.01" />
</svg>
<div className="gn-invitations__body">
  {/* existing heading, list and actions move in here unchanged */}
</div>
```

`aria-labelledby`, the `null` render on an empty list, the `"Accept the invitation to {workspace}"` labels and the muted one-line failure (deliberately **not** a `ShellRefusal`) are all untouched.

- [ ] **Step 3: Run the banner tests**

```bash
cd /Users/kiro/my_projects/gisik-nokma/apps/web
pnpm exec vitest run test/workspaces-invitation-banner.test.tsx > /tmp/t8.log 2>&1; echo "EXIT=$?"; tail -30 /tmp/t8.log
```

Expected: PASS. If a case asserts the old raised-card treatment, update that assertion — but a case about the heading, the labels, or the empty-list behaviour going red is a regression, not a test to edit.

- [ ] **Step 4: Commit**

```bash
cd /Users/kiro/my_projects/gisik-nokma
git add apps/web/app/globals.css apps/web/app/workspaces/page.tsx apps/web/test/workspaces-invitation-banner.test.tsx
git commit -m "The invitation banner becomes a warning wash, not a card you could open"
```

---

### Task 9: The founding form

Only two numbers differ; the width cap and the column gap already match the prototype.

**Files:**
- Modify: `apps/web/app/globals.css`

- [ ] **Step 1: Update the two rules**

```css
.gn-workspace-founding {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin-top: 2.125rem;   /* was 1.1rem */
  max-width: 26.25rem;    /* already the prototype's 420px */
}

.gn-workspace-founding__heading {
  margin: 0;
  font-size: 1.25rem;     /* was 1.05rem */
  line-height: 1.5625rem;
  font-weight: 600;
}
```

`.gn-field` and `.gn-field__label` are **not** touched here — they are declared in the shared `packages/ui/src/ui.css:2408-2416` and Task 3 already updates them there. Re-declaring them in this page stylesheet would create a duplicate that wins by load order and then silently drifts from the shared rule.

The form stays a bare column with no surface and no shadow — `test/founding.test.tsx:85` (13.394) asserts exactly that, and the prototype agrees.

- [ ] **Step 2: Run the founding test**

```bash
cd /Users/kiro/my_projects/gisik-nokma/apps/web
pnpm exec vitest run test/founding.test.tsx > /tmp/t9.log 2>&1; echo "EXIT=$?"; tail -30 /tmp/t9.log
```

Expected: PASS, unchanged. `.gn-field` and `.gn-field__label` are shared, so also re-run `packages/ui` and the full web suite before committing.

- [ ] **Step 3: Commit**

```bash
cd /Users/kiro/my_projects/gisik-nokma
git add apps/web/app/globals.css
git commit -m "Founding form spacing and heading match the prototype"
```

---

### Task 10: Catalogue sync and final verification

**Files:**
- Modify: `Features.md`
- Modify: the owning file under `test-cases/`

- [ ] **Step 1: Update `Features.md`**

Edit the existing `/workspaces` bullets rather than adding tombstones. The card no longer lists projects individually; it names up to three and counts the rest. Note the new `tintWarning` role under the design-token subsystem (`⚙️`).

- [ ] **Step 2: Update `test-cases/`**

- Flip the status marker for every case this plan's tests now cover, in the same commit as those tests.
- Add new cases at the **next free numbers** in the owning section for: the project-line truncation (at the cap, over the cap, withheld suffix), the summary paragraph's absence on a refusal, and the `tintWarning` composite contrast.
- Mark 3.154 🚫 for this page with a one-line reason if Task 7 narrowed it, and **never renumber an existing ID.**

- [ ] **Step 3: Run every suite**

```bash
cd /Users/kiro/my_projects/gisik-nokma
pnpm exec turbo run test typecheck > /tmp/final.log 2>&1; echo "EXIT=$?"; tail -60 /tmp/final.log
```

Expected: PASS. If turbo replays a cached result, force the run — a cache scoped to the wrong package has previously replayed green over a real violation.

- [ ] **Step 4: Re-run the viewport sweep and diff against Task 0's baseline**

```bash
cd /Users/kiro/my_projects/gisik-nokma/apps/web
pnpm exec playwright test e2e-stack/viewport.spec.ts > /tmp/workspaces-port-after.log 2>&1; echo "EXIT=$?"
diff <(grep -o "✘.*" .superpowers/sdd/2026-09-15-workspaces-prototype-port/viewport-baseline.log | sort) \
     <(grep -o "✘.*" /tmp/workspaces-port-after.log | sort)
```

Expected: **no new failures**. The `/my-work` and `/w/{workspaceId}` offenders from the baseline are still there and are not this plan's to fix. Any line naming `/workspaces` is a regression this plan introduced — fix it rather than recording it.

- [ ] **Step 5: Check for orphaned vitest workers**

```bash
ps -eo pid=,ppid=,comm=,args= | awk '$3 ~ /node$/ && $2 == 1 && index($0, "vitest") > 0 {print $1}'
```

Expected: empty. Kill only PIDs this prints — never `pkill -f vitest`, which matches the Claude sessions themselves.

- [ ] **Step 6: Read the page live in all six combinations**

With the dev server on a port that is **not** 3001, open `/workspaces` and step through hig/minimal/neo × light/dark. Confirm: chips are visible against the card, the monogram is a 44px rounded square, the banner reads as a warning wash, and no card wraps its head onto two lines.

- [ ] **Step 7: Commit**

```bash
cd /Users/kiro/my_projects/gisik-nokma
git rev-parse --abbrev-ref HEAD   # must NOT be main
git add Features.md test-cases/
git commit -m "Sync the feature catalogue and test cases with the workspaces port"
```

---

## Self-Review

**Spec coverage.** Every section of the spec maps to a task: tokens → 1; shared `ui.css` (chip, avatar, field, button) → 3; page shell, title, summary → 4; grid and card → 5; card head and meta line → 6; project line and truncation → 7; banner → 8; founding form → 9; `Features.md` and `test-cases/` → 10; baseline and verification → 0 and 10. The spec's T0 (read the prototype's style blocks) was executed while writing this plan — its findings are the tables in Tasks 1 and 3, so no task re-does it.

**One spec correction this plan makes.** The spec said `tintWarning` would get a `CONTRAST_PAIRS` row. It cannot: `tokens.ts:228` forbids any row naming an alpha primitive, because `relativeLuminance` ignores alpha and such a row is a guaranteed false green. Task 1 uses a bespoke composite check instead, which is the same mechanism the spec's cited precedent (`fillTertiary`) actually uses. The spec's intent — measure against the composite, never the bare tint — is unchanged and is what Task 1 implements.

**Type consistency.** `projectCountLine(liveCount: number): string | null` and `projectLine(names: readonly string[], countsWithheld: boolean): string | null` are defined in Task 2 and consumed under those exact names in Tasks 6 and 7. `PROJECT_LINE_CAP` is exported in Task 2 and used in Task 2's own boundary test. `size="workspace"` is added to `AvatarProps` in Task 3 and passed in Task 6. `var(--gn-tint-warning)` is produced by Task 1's role `tintWarning` through `cssVariableName` and consumed in Task 8.

**Placeholder scan.** No TBDs. Two steps deliberately branch on a measurement rather than asserting an outcome — Task 1 Step 6 (if a composite misses 4.5, nudge the alpha in-hue per the `fillNavyHig3` precedent and record both numbers) and Task 7 Step 1 (whether 3.154 is narrowed or marked 🚫 depends on whether the workspace home shares it). Both name the decision rule and the precedent, so neither defers a choice to the implementer's taste.
