# Landed 2026-09-08 — implementation plan, not yet executed

**Filename `2026-09-08-hig-per-screen.md`, date-only** — the same convention `2026-09-07-mcp-server.md`
adopted and documented: the `2026-08-20-NN-` series is closed, and dated plans are now visible to
`check:tasks` because that plan's Task 11 extended `scripts/check-task-ledger.mjs` to recognise them.
**Ledger rows for these tasks must be added to `docs/lanes/task-ledger.tsv` when each merges** (the
`#323` precedent) — until a row exists, `check:tasks` reports nothing about the task.

**Authorship and verification.** Written by the controller (Fable 5.1, owner-directed) after the palette
(#353), the border sweep (#354) and the reconciliation audit (#355) all landed. Every selector, prop
name, file path and line range below was read from the tree at `77b2ee8`, not recalled: `Button`
(`packages/ui/src/components/button.tsx`, variants `'primary' | 'ghost' | 'danger'`), `Chip`
(`chip.tsx`, tone union of eight), `ShellRefusal` (`apps/web/src/shell-refusal.tsx:34`,
`role="status"`, class `gn-shell__refusal`), `ExpiredSessionNotice` (`expired-session.tsx:92`, class
`gn-shell__expired`), the 31 `TOKEN_ROLES` and `cssVariableName` (`tokens.ts:375`), `.gn-view-tabs`
(`globals.css:58-73`), the sign-in markup (`sign-in/page.tsx:100-220`), the Members three-state gate
(`members/page.tsx:76-107`), and the one-way ratchet rule (`e2e-viewport/type-scale.ts:286-294`).

---

# HIG Per-Screen Adoption Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the HIG visual language (already landed at the token and border layers) to every web
screen, **without removing any working feature and without letting a delegated restyle drop an
accessible name** — and design the failure states the prototypes never drew.

**Architecture:** Task 0 builds the gate that makes delegation safe (a one-way baseline of accessible
names and roles per route). Task 1 builds the four shared pieces every screen reuses (segmented control,
filled field, tinted refusal panels, page header). Tasks 2–10 then go screen by screen in **pairs**: an
**(a) surface** task that is pure transcription of CSS and markup given in full here — sonnet — and a
**(b) states** task that designs the loading / empty / signed-out / expired / refusal states the audit
found missing — opus, because those states are the product's honesty semantics. The spec for each screen
is its section of the audit, which travels with this plan.

**Tech Stack:** Next.js (`apps/web`), React, `packages/ui` CSS (`ui.css` + `globals.css`, both under the
colour-literal gate), design tokens in `packages/ui/src/tokens.ts` emitted as `--gn-*` CSS variables,
Playwright (`e2e-viewport` signed-out, `e2e-stack` signed-in), vitest.

**Spec:** `docs/hig-reconciliation-audit.md` (per-screen S/I/D/C findings, line-cited) +
`docs/hig-adoption-brief.md` §8 (the palette mapping) + `design-system/prototypes/*.dc.html` (the visual
reference) + the rulings recorded in `docs/lanes/controller-state.md` (R1(c); control affordance; copy).

## Global Constraints

Every task's requirements implicitly include all of these. Exact values, copied from the tree.

- **No colour literal anywhere but `packages/ui/src/tokens.ts`.** `packages/ui/test/token-discipline.test.ts` sweeps `CLIENT_SOURCE_ROOTS`, which include `packages/ui/src/ui.css` and `apps/web/app/globals.css`. Every colour in every CSS block below is a `var(--gn-…)`. **A hex value in a task's CSS is a plan bug — stop and report it.**
- **The only CSS variables that exist are the 31 `TOKEN_ROLES` kebab-cased under `--gn-`** (`cssVariableName`, `tokens.ts:375`): `--gn-surface --gn-surface-raised --gn-surface-sunken --gn-surface-overlay --gn-text --gn-text-muted --gn-text-inverted --gn-border --gn-border-strong --gn-fill-primary --gn-fill-secondary --gn-fill-tertiary --gn-fill-quaternary --gn-focus-ring --gn-shadow --gn-accent --gn-accent-text --gn-danger --gn-danger-text --gn-warning --gn-warning-text --gn-success --gn-success-text --gn-category-open --gn-category-active --gn-category-terminal --gn-blocked --gn-pending --gn-restricted --gn-contested --gn-custom-marker`. A var not in this list resolves to nothing and `tokens.test.ts` catches undeclared ones.
- **Do not edit `tokens.ts` in any task of this plan.** The palette is settled (#353/#354). `success` stays `green700 #1e7a34` — Apple's green fails `successText` at 4.40 vs 4.5.
- **R1(c): no `border` on containers or controls; separation is fill and spacing.** The one exception, ruled on #354: **an empty text field has no label to identify it, so `input`, `select` and `textarea` keep `border: 1px solid var(--gn-border)`**. Nothing else gets a border.
- **Control affordance: a non-primary control is fill + accent-coloured 600-weight label, no boundary** (ruling, `controller-state.md`). Do not add a boundary to a button to "make it visible".
- **Copy rule (owner, 2026-09-08, verbatim): "reject anything that loses information or an aria-label; keep shipped wording where it's merely different; adopt the additions."** In practice: every audit **C** row that is a replacement → keep the shipped text; every **C** row that is an addition (helper text, subtitle, footer) → adopt it; anything that drops an interpolated value, a role, an `aria-label` or an accessible name → reject, and it is a plan bug if a task asks for it.
- **The audit's D column is binding: keep and restyle, never delete.** A prototype omitting a feature is not an instruction to remove it. Task 0's gate makes the accessible half of this mechanical; the rest is the (b) tasks' job.
- **Ratchets are one-way.** `apps/web/e2e-viewport/{tap-target,type-scale}-baseline.json`, `apps/web/e2e-stack/{tap-target,type-scale}-baseline.json`, `apps/web/e2e-stack/non-text-contrast-roster.json`, and Task 0's new baselines: *"a count that may fall and never rise … A branch that made a number WORSE must not be able to re-baseline over it. A falling number needs the key deleted from the file first; setting `UPDATE_TYPE_SCALE_BASELINE=1` will not lower one."* (`type-scale.ts:286-294`). If a restyle raises a number, the restyle is wrong, not the baseline.
- **Every case id appears literally in a test name.** `pnpm check:citations` is an exact-count ratchet per file; a new ✅ case without a citing test reddens it.
- **Case-id block for this plan: `13.285`–`13.320`**, allocated to it by the controller. Per-task ranges are assigned below; take them in order, never derive from the file's maximum. Update the `next free BLOCK` pointer at the foot of `test-cases/13-deployment-dogfooding.md` to `13.321` in the LAST task to merge.
- **Gate, verbatim, under Node 22:** `source ~/.nvm/nvm.sh && nvm use 22 && pnpm rebuild better-sqlite3 && pnpm turbo run build test typecheck --force --concurrency=1 > /tmp/gate.log 2>&1; echo "GATE_EXIT=$?"` — `--force` because a cached pass has replayed green here before; **never pipe a test run into `head`** (it orphans the worker pool; `CLAUDE.md`). Then `pnpm check:citations`, `pnpm check:tasks`, `node scripts/check-case-ids.mjs`.
- **Mutation-witness every guard.** A test that stays green with the code it protects removed is the defect this repo catalogues most. Every task ends with a mutation step; the mutation must go RED naming the site, then be reverted **from a commit made before the mutation** (`git checkout -- <file>` has destroyed uncommitted fixes here twice).
- **`Features.md` and the owning `test-cases/` file change in the same commit as the code.** Never a follow-up.
- **Model per task follows the coordination doc's table** (`2026-08-20-00-series-coordination.md:596-620`): *"the tier follows the failure cost of the task, not its size."* Transcription implementers (this plan carries the code) → **sonnet / medium**. Core-semantics implementers (view-models carrying honesty semantics — the (b) tasks) → **opus / high**. Per-task reviewers → **opus / high**. **Fable is not dispatched** (owner ruling 2026-08-31, "Fable out entirely").
- **Mobile (`apps/mobile`, React Native) is NOT restyled by this plan.** CSS tokens do not transfer. Task 11 records the deferral durably with an owner — an unrecorded deferral is defect class 4 from Plan 1.

---

## File Structure

| File | Responsibility | Created / modified by |
|---|---|---|
| `apps/web/e2e-viewport/accessible-names.ts` | Helper: sweep a page for `aria-label`, `role`, `aria-selected`, `aria-describedby`; read/record a one-way baseline | Task 0 |
| `apps/web/e2e-viewport/accessible-names-baseline.json` | Signed-out baseline, keyed `viewport|route` | Task 0 |
| `apps/web/e2e-stack/accessible-names-baseline.json` | Signed-in baseline | Task 0 |
| `apps/web/e2e-viewport/responsive.spec.ts` | + one test block (13.285–13.286) | Task 0 |
| `apps/web/e2e-stack/viewport.spec.ts` | + one test block (13.287) | Task 0 |
| `packages/ui/src/components/segmented-control.tsx` | New `SegmentedControl` — the HIG method/view picker | Task 1 |
| `packages/ui/src/index.ts` | export it | Task 1 |
| `packages/ui/src/ui.css` | `.gn-segmented*`, `.gn-field*`, `.gn-button--ghost` (the missing rule), `.gn-refusal*` retint, `.gn-page-header*` | Task 1 |
| `apps/web/app/globals.css` | `.gn-shell__refusal`, `.gn-shell__expired` retint; `.gn-view-tabs` retired | Task 1, Task 5a |
| `packages/ui/test/components.test.tsx` | SegmentedControl unit cases (13.288–13.290) | Task 1 |
| `apps/web/app/sign-in/page.tsx` | Exemplar restyle | Task 2 |
| one `apps/web/app/**/page.tsx` (+ its `packages/app-core` view) per screen | (a) surface / (b) states | Tasks 3–10 |
| `Features.md` §2 / §6 / §14, `test-cases/13-deployment-dogfooding.md` | Same-commit catalogue updates | every task |
| `docs/lanes/task-ledger.tsv` | One `done` row per merged task | controller, at merge |

---

### Task 0: The accessible-name gate — make the copy rule and the D-rule enforceable before any screen is touched

**Model: opus / high.** This is a new instrument; a wrong instrument certifies every later task falsely.

**Why first.** The owner's rule protects **46 `aria-label` and 140 `role` attributes across 53 files, plus 8 `aria-selected` and 1 `aria-describedby`** (measured by the executor at `07c6cc0`). **No check asserts any of them exist.** A delegated restyle can drop any one and the full gate stays 33/33. This task turns *"reject anything that loses an aria-label"* from an instruction a smaller model must remember into a gate that reddens.

**Files:**
- Create: `apps/web/e2e-viewport/accessible-names.ts`
- Create: `apps/web/e2e-viewport/accessible-names-baseline.json`
- Create: `apps/web/e2e-stack/accessible-names-baseline.json`
- Modify: `apps/web/e2e-viewport/responsive.spec.ts` (append one `test(...)` block after the 4b label-floor block)
- Modify: `apps/web/e2e-stack/viewport.spec.ts` (append one `test(...)` block)
- Modify: `test-cases/13-deployment-dogfooding.md` (cases 13.285–13.287), `Features.md` §2

**Case ids:** `13.285` (signed-out ratchet), `13.286` (selector control), `13.287` (signed-in ratchet).

**Interfaces:**
- Produces: `sweepAccessibleNames(page: Page): Promise<AccessibleNameCounts>`; `readAccessibleBaseline(path: string): Record<string, AccessibleNameCounts>`; `recordAccessibleBaseline(path: string, key: string, counts: AccessibleNameCounts): void` — writes ABSENT keys only, mirroring `type-scale.ts`. Later tasks do not call these; they are consumed by the two spec files only. Every later task's PR must leave both baselines' numbers **equal or higher**.

- [ ] **Step 1: Write the helper**

```ts
// apps/web/e2e-viewport/accessible-names.ts
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Page } from '@playwright/test';

/**
 * The population the owner's copy rule protects and nothing else watched:
 * "reject anything that loses information or an aria-label" (2026-09-08).
 *
 * Counts, not names. A restyle that swaps one accessible name for another of
 * equal count is not this gate's business — that is the copy rule, reviewed by
 * a person. A restyle that DROPS one is, and a count that fell is the whole
 * signal. Same one-way shape as the tap-target and type-scale baselines.
 */
export type AccessibleNameCounts = {
  ariaLabel: number;
  role: number;
  ariaSelected: number;
  ariaDescribedby: number;
  /** Every element the sweep examined — the selector control. */
  rawMatches: number;
};

export const ACCESSIBLE_BASELINE_PATH = fileURLToPath(
  new URL('./accessible-names-baseline.json', import.meta.url),
);

export async function sweepAccessibleNames(page: Page): Promise<AccessibleNameCounts> {
  return page.evaluate(() => {
    const all = Array.from(document.querySelectorAll('*'));
    const count = (attr: string) => all.filter((el) => el.hasAttribute(attr)).length;
    return {
      ariaLabel: count('aria-label'),
      role: count('role'),
      ariaSelected: count('aria-selected'),
      ariaDescribedby: count('aria-describedby'),
      rawMatches: all.length,
    };
  });
}

export function readAccessibleBaseline(
  path: string = ACCESSIBLE_BASELINE_PATH,
): Record<string, AccessibleNameCounts> {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as Record<string, AccessibleNameCounts>;
  } catch {
    return {};
  }
}

/**
 * Writes ABSENT keys only. A branch that lowered a count must not be able to
 * re-baseline over it; lowering needs the key deleted from the file first, on
 * purpose, in a commit that says why. Copied from `recordTypeScaleBaseline`'s
 * contract, which cost two wasted runs to relearn on the tap-target pass.
 */
export function recordAccessibleBaseline(
  path: string,
  key: string,
  counts: AccessibleNameCounts,
): void {
  const current = readAccessibleBaseline(path);
  if (key in current) return;
  current[key] = counts;
  writeFileSync(path, JSON.stringify(current, null, 2) + '\n');
}

/** The four counts that may fall and never rise. `rawMatches` is the control, not ratcheted. */
export const RATCHETED: ReadonlyArray<keyof AccessibleNameCounts> = [
  'ariaLabel',
  'role',
  'ariaSelected',
  'ariaDescribedby',
];
```

- [ ] **Step 2: Write the failing signed-out test**

Append to `apps/web/e2e-viewport/responsive.spec.ts`, inside the existing per-route loop, directly after the 4b label-floor block:

```ts
    /* ── 4c. ACCESSIBLE NAMES AND ROLES, ratcheted one-way. ──────────────
     * Cases 13.285 (ratchet) and 13.286 (control).
     * The population the owner's copy rule protects. No test asserted any
     * accessible name existed before this; a restyle could drop every one
     * and the gate stayed 33/33.
     * ──────────────────────────────────────────────────────────────────*/
    const names = await sweepAccessibleNames(page);

    // 13.286 — the selector control, HARD, before the ratchet. `*` on a rendered
    // document cannot honestly examine zero elements.
    expect(
      names.rawMatches,
      `13.286: the accessible-name sweep examined NOTHING on ${route.path}. A sweep over ` +
        `\`*\` that saw zero elements reports zero losses and looks identical to a clean page.`,
    ).toBeGreaterThan(0);

    const key = `${viewport.name}|${route.path}`;
    const baseline = readAccessibleBaseline()[key];
    if (baseline === undefined) {
      if (process.env.UPDATE_ACCESSIBLE_BASELINE === '1') {
        recordAccessibleBaseline(ACCESSIBLE_BASELINE_PATH, key, names);
      }
      test.info().annotations.push({ type: 'baseline', description: `${key}: recorded, not asserted` });
    } else {
      for (const attr of RATCHETED) {
        // 13.285 — a count may fall and never rise. Lowering is a deliberate,
        // commit-message-carrying deletion of the key, never a re-run.
        expect(
          names[attr],
          `13.285: ${route.path} at ${viewport.name} LOST ${attr}: baseline ${baseline[attr]}, ` +
            `now ${names[attr]}. Something that identified an element to assistive tech is gone. ` +
            `If this is intended, delete the key from accessible-names-baseline.json in a commit ` +
            `that says which element and why.`,
        ).toBeGreaterThanOrEqual(baseline[attr]);
      }
    }
```

Add to that file's imports:

```ts
import {
  ACCESSIBLE_BASELINE_PATH,
  RATCHETED,
  readAccessibleBaseline,
  recordAccessibleBaseline,
  sweepAccessibleNames,
} from './accessible-names.js';
```

- [ ] **Step 3: Run it to verify the control fails against nothing and the ratchet records**

Run: `cd apps/web && UPDATE_ACCESSIBLE_BASELINE=1 pnpm test:e2e:viewport > /tmp/a11y-record.log 2>&1; echo "EXIT=$?"; tail -5 /tmp/a11y-record.log`
Expected: `EXIT=0`, every route annotated `recorded, not asserted`, and `apps/web/e2e-viewport/accessible-names-baseline.json` now exists with one key per `viewport|route` and non-zero `rawMatches` on every key.

Verify the file has real numbers, not zeros:
Run: `node -e "const b=require('./apps/web/e2e-viewport/accessible-names-baseline.json');for(const[k,v]of Object.entries(b))console.log(k,JSON.stringify(v))"`
Expected: `phone-390|/sign-in` shows `role` ≥ 3 (tablist + 2 tabs) and `ariaSelected` ≥ 2.

- [ ] **Step 4: Run again WITHOUT the env var to verify the ratchet now asserts and passes**

Run: `cd apps/web && pnpm test:e2e:viewport > /tmp/a11y.log 2>&1; echo "EXIT=$?"`
Expected: `EXIT=0`, no `recorded` annotations.

- [ ] **Step 5: MUTATION — remove one `aria-selected` from sign-in; the gate must go RED naming the route**

In `apps/web/app/sign-in/page.tsx` line 104, change `aria-selected={method === 'phone'}` to nothing (delete the attribute on the Phone tab only). **Do not commit.**
Run: `cd apps/web && pnpm test:e2e:viewport > /tmp/a11y-mut.log 2>&1; echo "EXIT=$?"; grep -m1 "13.285" /tmp/a11y-mut.log`
Expected: `EXIT=1`, and the grep prints a line containing `LOST ariaSelected: baseline 2, now 1` for `/sign-in`.
Revert: `git checkout -- apps/web/app/sign-in/page.tsx` (this file has no uncommitted changes of yours at this point; if it does, `git stash` first).

- [ ] **Step 6: Signed-in twin in the stack suite**

Create `apps/web/e2e-stack/accessible-names-baseline.json` (empty `{}`), and append to `apps/web/e2e-stack/viewport.spec.ts` the same block as Step 2 with two substitutions: the case id in both messages is **`13.287`**, and the baseline path is `fileURLToPath(new URL('./accessible-names-baseline.json', import.meta.url))` passed explicitly to `readAccessibleBaseline(...)` and `recordAccessibleBaseline(...)`. Import the helper from `../e2e-viewport/accessible-names.js`.

Run: `cd apps/web && UPDATE_ACCESSIBLE_BASELINE=1 pnpm test:e2e:stack > /tmp/a11y-stack.log 2>&1; echo "EXIT=$?"` then again without the env var.
Expected: both `EXIT=0`; the stack baseline has one key per signed-in route the suite visits.

- [ ] **Step 7: Catalogue + Features, same commit**

`test-cases/13-deployment-dogfooding.md`, after 13.284:

```markdown
- **13.285** ✅ Accessible names and roles on the signed-out surface are a one-way ratchet: `aria-label`, `role`, `aria-selected`, `aria-describedby` counts per `viewport|route` may rise and never fall. Lowering one is a deliberate key deletion in a commit that names the element. Mutation-witnessed: dropping `aria-selected` from one sign-in tab reddens it naming `/sign-in`. — (`apps/web/e2e-viewport/responsive.spec.ts`)
- **13.286** ✅ The accessible-name sweep's selector control: `*` on a rendered document must examine more than zero elements, asserted HARD before the ratchet, so a sweep that stopped matching cannot report "nothing lost". — (`apps/web/e2e-viewport/responsive.spec.ts`)
- **13.287** ✅ The signed-in twin of 13.285, over the stack suite's routes. — (`apps/web/e2e-stack/viewport.spec.ts`)
```

`Features.md` §2, add a bullet: `⚙️ **Accessible-name ratchet** — the counts of \`aria-label\` / \`role\` / \`aria-selected\` / \`aria-describedby\` per route are baselined one-way, so a restyle that drops one goes red. Built because the HIG adoption is delegated and a rule enforced by attention does not survive a delegation. Cases 13.285–13.287. \`apps/web/e2e-viewport/accessible-names.ts\``

- [ ] **Step 8: Gate + commit**

Run the gate line from Global Constraints, then `pnpm check:citations` and `node scripts/check-case-ids.mjs`.
Expected: `GATE_EXIT=0`, `Tasks: 33 successful, 33 total`, `Cached: 0`, citations ratchet holds, ids `1799`.

```bash
git add apps/web/e2e-viewport/accessible-names.ts apps/web/e2e-viewport/accessible-names-baseline.json apps/web/e2e-viewport/responsive.spec.ts apps/web/e2e-stack/accessible-names-baseline.json apps/web/e2e-stack/viewport.spec.ts test-cases/13-deployment-dogfooding.md Features.md
git commit -m "A gate for accessible names, so a delegated restyle cannot drop one and stay green"
```

---

### Task 1: The four shared pieces every screen reuses

**Model: sonnet / medium.** Every line of CSS and TSX is given below; this is transcription. (The `.gn-refusal` retint is a design decision, but it was ruled — tinted fill replaces the last semantic borders — and the values are here.)

**Files:**
- Create: `packages/ui/src/components/segmented-control.tsx`
- Modify: `packages/ui/src/index.ts` (one export line)
- Modify: `packages/ui/src/ui.css` (append `.gn-segmented*`, `.gn-field*`, `.gn-page-header*`; add the missing `.gn-button--ghost` rule; replace `.gn-refusal--preview` / `.gn-refusal--server` at lines 355-356)
- Modify: `apps/web/app/globals.css` (retint `.gn-shell__refusal`, `.gn-shell__expired`)
- Modify: `packages/ui/test/components.test.tsx` (three cases)
- Modify: `test-cases/13-deployment-dogfooding.md` (13.288–13.291), `Features.md` §2

**Case ids:** `13.288` (SegmentedControl keeps tablist/tab/aria-selected), `13.289` (ghost button has fill and no border), `13.290` (refusal panels have no border), `13.291` (field keeps its border — the empty-field exception).

**Interfaces — Produces (Tasks 2 and 5a consume these exact names):**

```ts
export type SegmentedOption<T extends string> = { value: T; label: string };
export type SegmentedControlProps<T extends string> = {
  options: ReadonlyArray<SegmentedOption<T>>;
  value: T;
  onChange: (value: T) => void;
  /** Required. Names the choice for assistive tech — "Sign-in method", "Board view". */
  'aria-label': string;
};
export function SegmentedControl<T extends string>(props: SegmentedControlProps<T>): JSX.Element;
```

CSS classes produced: `.gn-segmented`, `.gn-segmented__item`, `.gn-segmented__item--on`, `.gn-field`, `.gn-field__label`, `.gn-field__input`, `.gn-page-header`, `.gn-page-header__icon`, `.gn-page-header__title`, `.gn-page-header__tagline`.

- [ ] **Step 1: Write the failing component tests**

Append to `packages/ui/test/components.test.tsx`:

```tsx
import { SegmentedControl } from '../src/components/segmented-control.js';

describe('SegmentedControl (13.288)', () => {
  it('13.288 renders role=tablist with one role=tab per option and aria-selected on exactly the chosen one', async () => {
    const onChange = vi.fn();
    render(
      <SegmentedControl
        aria-label="Sign-in method"
        value="email"
        onChange={onChange}
        options={[
          { value: 'phone', label: 'Phone' },
          { value: 'email', label: 'Email link' },
        ]}
      />,
    );
    const list = screen.getByRole('tablist', { name: 'Sign-in method' });
    const tabs = within(list).getAllByRole('tab');
    expect(tabs).toHaveLength(2);
    expect(tabs[0]).toHaveAttribute('aria-selected', 'false');
    expect(tabs[1]).toHaveAttribute('aria-selected', 'true');
    expect(tabs[1]).toHaveClass('gn-segmented__item--on');
    expect(tabs[0]).not.toHaveClass('gn-segmented__item--on');
    await userEvent.click(tabs[0]);
    expect(onChange).toHaveBeenCalledWith('phone');
  });
});
```

**Imports — the file has `render, screen` from RTL, `userEvent` from `@testing-library/user-event` (named import, per its own comment), and `vi` from vitest. It does NOT import `within`.** Change the RTL import at line 1 to `import { render, screen, within } from '@testing-library/react';`. The block above already uses `userEvent.click` (the file's convention) and an `async` callback; do not introduce `fireEvent`.

- [ ] **Step 2: Run to verify it fails**

Run: `cd packages/ui && pnpm vitest run test/components.test.tsx > /tmp/seg.log 2>&1; echo "EXIT=$?"; grep -m1 "Cannot find module\|13.288" /tmp/seg.log`
Expected: `EXIT=1`, module not found.

- [ ] **Step 3: Write the component**

```tsx
// packages/ui/src/components/segmented-control.tsx
export type SegmentedOption<T extends string> = { value: T; label: string };

export type SegmentedControlProps<T extends string> = {
  options: ReadonlyArray<SegmentedOption<T>>;
  value: T;
  onChange: (value: T) => void;
  /** Names the choice for assistive tech. Required, so it cannot be forgotten. */
  'aria-label': string;
};

/**
 * HIG's method / view picker. Replaces the bordered `.gn-view-tabs` buttons
 * with a fill track and a raised selected segment, keeping the exact roles the
 * old markup carried — `tablist`, `tab`, `aria-selected` — so the accessible-name
 * ratchet (13.285/13.287) sees no loss.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  'aria-label': ariaLabel,
}: SegmentedControlProps<T>) {
  return (
    <div role="tablist" aria-label={ariaLabel} className="gn-segmented">
      {options.map((option) => {
        const on = option.value === value;
        return (
          <button
            key={option.value}
            role="tab"
            type="button"
            aria-selected={on}
            className={on ? 'gn-segmented__item gn-segmented__item--on' : 'gn-segmented__item'}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
```

Add to `packages/ui/src/index.ts`: `export { SegmentedControl } from './components/segmented-control.js'; export type { SegmentedOption, SegmentedControlProps } from './components/segmented-control.js';`

- [ ] **Step 4: Run to verify it passes**

Run: `cd packages/ui && pnpm vitest run test/components.test.tsx > /tmp/seg.log 2>&1; echo "EXIT=$?"`
Expected: `EXIT=0`.

- [ ] **Step 5: The CSS — append to `packages/ui/src/ui.css`**

```css
/* ── Segmented control (HIG method/view picker). Fill track, raised segment.
   Replaces `.gn-view-tabs`. No border anywhere (R1(c)). ───────────────── */
.gn-segmented {
  display: flex;
  gap: 2px;
  padding: 2px;
  border-radius: 9px;
  background: var(--gn-fill-tertiary);
}
.gn-segmented__item {
  flex: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 2.5rem;
  border: none;
  border-radius: 7px;
  background: transparent;
  color: var(--gn-text);
  font: inherit;
  font-size: 0.95rem;
  font-weight: 500;
  cursor: pointer;
}
.gn-segmented__item--on {
  background: var(--gn-surface-raised);
  font-weight: 600;
  box-shadow: 0 3px 8px var(--gn-shadow);
}
.gn-segmented__item:focus-visible {
  outline: 2px solid var(--gn-focus-ring);
  outline-offset: 2px;
}

/* ── Field: label above a filled input. The input KEEPS its border — an empty
   field has no label inside it to do the identifying (13.284's argument does
   not transfer; ruled on PR 354 — written without the hash so the colour
   scanner never has to decide whether a PR number is a hex value). ─────── */
.gn-field {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}
.gn-field__label {
  font-size: 0.8rem;
  color: var(--gn-text-muted);
}
.gn-field__input {
  min-height: 2.75rem;
  padding: 0 0.85rem;
  border: 1px solid var(--gn-border);
  border-radius: 8px;
  background: var(--gn-fill-quaternary);
  color: var(--gn-text);
  font: inherit;
  font-size: 1rem;
}
.gn-field__input::placeholder {
  color: var(--gn-text-muted);
}
.gn-field__input:focus-visible {
  outline: 2px solid var(--gn-focus-ring);
  outline-offset: 1px;
}

/* ── The ghost button, which had NO rule at all (the 2.49:1 border was the
   only affordance). Fill + accent 600 label, no boundary — the ruling. ──── */
.gn-button--ghost {
  background: var(--gn-fill-tertiary);
  border-color: transparent;
  color: var(--gn-accent);
  font-weight: 600;
}

/* ── Page header: icon tile, title, tagline. Opt-in per screen. ─────────── */
.gn-page-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  text-align: center;
}
.gn-page-header__icon {
  width: 3.5rem;
  height: 3.5rem;
  border-radius: 14px;
  background: var(--gn-accent);
  color: var(--gn-accent-text);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 0.4rem;
}
.gn-page-header__title {
  margin: 0;
  font-size: 2.1rem;
  line-height: 1.2;
  font-weight: 700;
  letter-spacing: -0.02em;
}
.gn-page-header__tagline {
  margin: 0;
  color: var(--gn-text-muted);
}
```

Then **replace** lines 355-356 of `ui.css` (the two bordered refusal variants) with:

```css
/* Tinted fills, not borders (R1(c)). A refusal must be unmistakable: the fill
   carries the tone, the text carries the reason. `--gn-fill-secondary` is the
   16% grey; tone comes from the left rule, which is a fill, not a border. */
.gn-refusal--preview { background: var(--gn-fill-secondary); box-shadow: inset 4px 0 0 var(--gn-warning); color: var(--gn-text); }
.gn-refusal--server  { background: var(--gn-fill-secondary); box-shadow: inset 4px 0 0 var(--gn-danger);  color: var(--gn-text); }
```

And in `apps/web/app/globals.css`: **neither shell panel has a border today, and `.gn-shell__expired` has NO rule at all** (the class is emitted by `expired-session.tsx:94` and styled by nothing — verified). So this is an ADD, not a replace. Change line 151 to:

```css
.gn-shell__refusal { margin: 0; padding: 0.75rem 0.9rem; border-radius: 0.4rem; color: var(--gn-text-muted); background: var(--gn-fill-secondary); box-shadow: inset 4px 0 0 var(--gn-danger); }
```

and add directly after line 152 (`.gn-shell__refusal-what`):

```css
.gn-shell__expired { margin: 0; padding: 0.75rem 0.9rem; border-radius: 0.4rem; color: var(--gn-text); background: var(--gn-fill-secondary); box-shadow: inset 4px 0 0 var(--gn-warning); }
```

- [ ] **Step 6: Write the three CSS cases**

Append to `packages/ui/test/components.test.tsx`. These read the stylesheet as text, the same way `token-discipline.test.ts` does, because jsdom does not compute cascaded styles:

```tsx
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const UI_CSS = readFileSync(fileURLToPath(new URL('../src/ui.css', import.meta.url)), 'utf8');
const rule = (selector: string) => {
  const m = UI_CSS.match(new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{([^}]*)\\}'));
  if (!m) throw new Error(`no rule for ${selector}`);
  return m[1];
};

describe('R1(c) at the component layer', () => {
  it('13.289 the ghost button has a fill and no boundary', () => {
    const body = rule('.gn-button--ghost');
    expect(body).toMatch(/background:\s*var\(--gn-fill-tertiary\)/);
    expect(body).toMatch(/border-color:\s*transparent/);
    expect(body).not.toMatch(/border:\s*1px/);
  });
  it('13.290 refusal panels carry tone as an inset fill, never a border', () => {
    for (const s of ['.gn-refusal--preview', '.gn-refusal--server']) {
      const body = rule(s);
      expect(body, s).toMatch(/box-shadow:\s*inset 4px 0 0 var\(--gn-(warning|danger)\)/);
      expect(body, s).not.toMatch(/\bborder:/);
    }
  });
  it('13.291 the field input KEEPS its border — an empty field has no label to identify it', () => {
    expect(rule('.gn-field__input')).toMatch(/border:\s*1px solid var\(--gn-border\)/);
  });
});
```

- [ ] **Step 7: Run all four cases**

Run: `cd packages/ui && pnpm vitest run test/components.test.tsx > /tmp/seg.log 2>&1; echo "EXIT=$?"`
Expected: `EXIT=0`, 4 new tests green.

- [ ] **Step 8: MUTATION — put the border back on the ghost button**

In `ui.css`, change `.gn-button--ghost`'s `border-color: transparent;` to `border: 1px solid var(--gn-border-strong);`. Do not commit.
Run the same command. Expected: `EXIT=1`, failure names `13.289`. Revert with `git checkout -- packages/ui/src/ui.css` **only after confirming `git status` shows that file as the sole modification** — otherwise `git stash` first.

- [ ] **Step 9: Catalogue + Features, same commit**

`test-cases/13-deployment-dogfooding.md`:

```markdown
- **13.288** ✅ `SegmentedControl` renders `role=tablist` (named by a required `aria-label`), one `role=tab` per option, `aria-selected` true on exactly the chosen one, and calls `onChange` with the clicked value — the exact roles `.gn-view-tabs` carried, so replacing it registers no loss on 13.285. — (`packages/ui/test/components.test.tsx`)
- **13.289** ✅ `.gn-button--ghost`, which previously had NO rule (its 2.49:1 border was its only affordance), is fill `--gn-fill-tertiary` + accent 600 label with `border-color: transparent`. Mutation-witnessed: restoring a border reddens it by name. — (`packages/ui/test/components.test.tsx`)
- **13.290** ✅ `.gn-refusal--preview` / `--server` carry tone as `inset 4px 0 0` box-shadow fills, and declare no `border`. The honesty panels are the last thing that should look decorative. — (`packages/ui/test/components.test.tsx`)
- **13.291** ✅ `.gn-field__input` keeps `border: 1px solid var(--gn-border)` — the one R1(c) exception, because an empty field has no label to identify it. — (`packages/ui/test/components.test.tsx`)
```

`Features.md` §2: add `✅ **Segmented control, filled field, tinted refusal panels, page header** — the four shared HIG pieces (\`SegmentedControl\` in \`packages/ui/src/components/segmented-control.tsx\`; \`.gn-field*\`, \`.gn-page-header*\`, retinted \`.gn-refusal*\` in \`ui.css\`). The ghost button gets the rule it never had. Cases 13.288–13.291.`

- [ ] **Step 10: Gate + commit**

Run the gate. Expected `GATE_EXIT=0`, 33/33, `Cached: 0`; `pnpm check:citations` holds; ids `1803`.

```bash
git add packages/ui/src/components/segmented-control.tsx packages/ui/src/index.ts packages/ui/src/ui.css apps/web/app/globals.css packages/ui/test/components.test.tsx test-cases/13-deployment-dogfooding.md Features.md
git commit -m "The four shared HIG pieces, and the ghost button gets the rule it never had"
```

---

### Task 2: Sign-in — the exemplar, against the owner's reference image

**Model: sonnet / medium.** The full JSX diff is below; keep every method; adopt the two additions the copy rule allows.

**Spec:** audit `### SignIn` (`docs/hig-reconciliation-audit.md:109-137`) + `design-system/prototypes/SignIn.dc.html` + the owner's screenshot (the target: icon tile, centred title, tagline, segmented control, filled field, helper text, Terms/Privacy footer).

**What the audit rules, applied:**
- **D (keep, restyle):** Phone OTP (default tab), Email link, Continue with Google, Sign in with a passkey, the `role="alert"` error paragraph, `?next=`, the post-send copy `Check your inbox — the link signs you in.` — **all stay.**
- **I (do not build):** the Password tab. `emailAndPassword: { enabled: false } // the spec forbids passwords` (`auth.ts:84`).
- **C, by the rule:** helper text *"We'll email you a link that signs you in. It expires in 15 minutes."* is an **addition → adopt**, shown only on the Email method, above the send button. The tagline *"The keeper of memory"* and the Terms/Privacy footer are additions → adopt (both routes exist: `/terms`, `/privacy`). **The shipped `Check your inbox — the link signs you in.` stays verbatim** (it is a replacement candidate, so keep shipped).
- **S:** segmented control, filled field, page header, card without border.

**Files:**
- Modify: `apps/web/app/sign-in/page.tsx` lines 96-220
- Modify: `apps/web/app/globals.css` (add `.gn-sign-in*` layout rules)
- Modify: `apps/web/e2e-viewport/responsive.spec.ts` (one assertion block), `test-cases/13-deployment-dogfooding.md` (13.292–13.294), `Features.md` §6

**Case ids:** `13.292` (all four methods reachable), `13.293` (helper text present on Email only), `13.294` (no Password tab exists).

- [ ] **Step 1: Write the failing e2e assertions**

Append inside the `/sign-in` route's iteration in `responsive.spec.ts` (the file already loops routes; add a `if (route.path === '/sign-in') { … }` block after 4c):

```ts
    if (route.path === '/sign-in') {
      // 13.292 — every shipped method survives the restyle. The prototype drew
      // two and the product ships four; the audit's D column is binding.
      const list = page.getByRole('tablist', { name: 'Sign-in method' });
      await expect(list.getByRole('tab', { name: 'Phone' })).toBeVisible();
      await expect(list.getByRole('tab', { name: 'Email link' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Sign in with a passkey' })).toBeVisible();

      // 13.294 — the prototype's Password tab does not exist and must never appear.
      // auth.ts:84 sets emailAndPassword { enabled: false } with "the spec forbids passwords".
      await expect(list.getByRole('tab', { name: 'Password' })).toHaveCount(0);

      // 13.293 — the adopted helper text is on the Email method only.
      await list.getByRole('tab', { name: 'Email link' }).click();
      await expect(
        page.getByText("We'll email you a link that signs you in. It expires in 15 minutes."),
      ).toBeVisible();
      await list.getByRole('tab', { name: 'Phone' }).click();
      await expect(
        page.getByText("We'll email you a link that signs you in. It expires in 15 minutes."),
      ).toHaveCount(0);
    }
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/web && pnpm test:e2e:viewport > /tmp/si.log 2>&1; echo "EXIT=$?"; grep -m1 "Sign-in method" /tmp/si.log`
Expected: `EXIT=1` — no tablist named `Sign-in method` (the old markup has no `aria-label`).

- [ ] **Step 3: The page**

**The page's real structure (read at `77b2ee8`, lines 96-101 and 221-222):** `<main className="gn-shell">` → `<h1 className="gn-page-title">Gisik Nokma</h1>` → `<Card className="gn-sign-in">` → the `.gn-view-tabs` tablist → the two method branches → `.gn-sign-in__alternatives` → the `role="alert"` paragraph → `</Card>` → `</main>`. **`Card` is already the card** (`.gn-card` is borderless after #354; `.gn-sign-in` at `globals.css:118` gives it `max-width: 26rem; margin: 3rem auto`). Do not add a second wrapper.

**Three edits, and everything else stays byte-for-byte.**

(1) Replace line 98 — the `<h1 className="gn-page-title">Gisik Nokma</h1>` — with the header block below. It sits **outside** the `Card`, as in the reference image.

(2) Replace lines 100-118 — the `<div role="tablist" className="gn-view-tabs">…</div>` — with the `SegmentedControl` below. `method` is `useState<Method>('phone')` and `type Method = 'phone' | 'email'` is at line 8, so `onChange={setMethod}` typechecks with `T = Method`.

(3) After line 221's `</Card>`, before `</main>`, add the legal footer below.

```tsx
      <header className="gn-page-header">
        <div className="gn-page-header__icon" aria-hidden="true">
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H10l2 2.5h6.5A1.5 1.5 0 0 1 20 8v10.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5Z" />
            <path d="M8 13h8" /><path d="M8 16.5h5" />
          </svg>
        </div>
        <h1 className="gn-page-header__title">Gisik Nokma</h1>
        <p className="gn-page-header__tagline">The keeper of memory</p>
      </header>
```

Then, as the first child inside the existing `<Card className="gn-sign-in">`, in place of the old tablist:

```tsx
        <SegmentedControl
          aria-label="Sign-in method"
          value={method}
          onChange={setMethod}
          options={[
            { value: 'phone', label: 'Phone' },
            { value: 'email', label: 'Email link' },
          ]}
        />
```

(`method` is already `useState<'phone' | 'email'>` in this file; `setMethod` is its setter. Import: `import { Button, SegmentedControl } from '@gisik-nokma/ui';` — `Button` is already imported from there; add `SegmentedControl` to the same line.)

Replace each bare `<label>…<input …/></label>` in lines 121-127, 143-146 and 165-172 with the field pattern. Phone, verbatim:

```tsx
            <label className="gn-field">
              <span className="gn-field__label">Phone number</span>
              <input
                className="gn-field__input"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="+91…"
              />
            </label>
```

One-time code: same shape with label text `One-time code`, `value={code}`, `onChange={(event) => setCode(event.target.value)}`, no placeholder. Email: label text `Email`, `type="email"`, `value={email}`, `onChange={(event) => setEmail(event.target.value)}`.

Inside the email branch, directly **before** the `{emailSent ? (` ternary, add the adopted helper text:

```tsx
            <p className="gn-sign-in__hint">
              We&rsquo;ll email you a link that signs you in. It expires in 15 minutes.
            </p>
```

After line 221's `</Card>` and before `</main>`, add the footer (the `Card` closes itself; there is no `</div>` to add):

```tsx
      <p className="gn-sign-in__legal">
        By continuing you agree to the <Link href="/terms">Terms</Link> and{' '}
        <Link href="/privacy">Privacy notice</Link>.
      </p>
```

(`Link` from `next/link` — add the import if the file lacks it.) **Everything between — both method branches, the Google and passkey `Button`s, the `role="alert"` error `<p>` — stays byte-for-byte.**

- [ ] **Step 4: The layout CSS — append to `apps/web/app/globals.css`**

**`.gn-sign-in` already exists at `globals.css:118`** (`max-width: 26rem; margin: 3rem auto; display: flex; flex-direction: column; …`), and `.gn-sign-in__method` at `:119`, `.gn-sign-in__method label` at `:120`, `.gn-sign-in__method label input` at `:130` (with `border: 1px solid var(--gn-border-strong)` and the 2.75rem tap-target fix). **Modify, do not redeclare:**

- Line 118: append `padding: 1.5rem; border-radius: 16px; gap: 1rem;` inside the existing `.gn-sign-in { … }` (it is the `Card`'s extra class, so this rounds and pads the card itself).
- **Delete** the `.gn-sign-in__method label { … }` rule (line 120) and the whole `.gn-sign-in__method label input { … }` rule (line 130 through its closing brace, including the comment block above it about the `340x21` measurement — that fix now lives in `.gn-field__input`'s `min-height: 2.75rem`). `.gn-field*` from Task 1 replaces both; leaving them creates two rules fighting over the same `<input>`.
- Append:

```css
.gn-sign-in__alternatives { display: flex; flex-direction: column; gap: 0.5rem; }
.gn-sign-in__hint,
.gn-sign-in__legal { margin: 0; text-align: center; font-size: 0.8rem; color: var(--gn-text-muted); }
```

**The tap-target ratchet is the check on the deletion:** `phone-390|/sign-in` is `0` in `e2e-viewport/tap-target-baseline.json`. If deleting the old `label input` rule loses the 2.75rem floor, that key rises and the suite reddens — that is the ratchet working, and the fix is `.gn-field__input`, never the baseline.

- [ ] **Step 5: Run the e2e and the accessible-name ratchet together**

Run: `cd apps/web && pnpm test:e2e:viewport > /tmp/si.log 2>&1; echo "EXIT=$?"; grep -cE "13\.29[234]" /tmp/si.log`
Expected: `EXIT=0`. **The 13.285 ratchet must also be green** — the tablist gained an `aria-label` (count rises, allowed) and lost nothing. If 13.285 reddens, a role or `aria-selected` was dropped in the transcription; find it, do not re-baseline.

- [ ] **Step 6: Look at it**

Run: `cd apps/web && pnpm exec playwright screenshot --viewport-size=390,844 http://localhost:3001/sign-in /tmp/signin-390.png` (dev stack must be up: `docker compose -f docker-compose.dev.yml up -d`; rebuild web first with `docker compose -f docker-compose.dev.yml build web && docker compose -f docker-compose.dev.yml up -d web`). Open `/tmp/signin-390.png` and compare against the owner's reference: icon tile, centred title, tagline, a two-segment control with the selected segment raised white, filled input, blue primary, two fill-and-accent alternatives, helper text, footer. **A count going green is not this step; looking is.**

- [ ] **Step 7: MUTATION — delete the passkey `Button`**

Remove the `Sign in with a passkey` `<Button>` block. Run the e2e. Expected: `EXIT=1`, **two** failures — `13.292` (button not visible) **and** `13.285` (`role` count fell on `/sign-in`). Both must fire; if only one does, the other guard is inert. Revert from the pre-mutation commit.

- [ ] **Step 8: Catalogue + Features, same commit**

`test-cases/13-deployment-dogfooding.md`:

```markdown
- **13.292** ✅ The sign-in restyle keeps all four shipped methods — Phone (default), Email link, Continue with Google, Sign in with a passkey — where the prototype drew two. Mutation-witnessed: removing the passkey button reddens this AND 13.285. — (`apps/web/e2e-viewport/responsive.spec.ts`)
- **13.293** ✅ The adopted helper text ("It expires in 15 minutes") renders on the Email method only, not on Phone. — (`apps/web/e2e-viewport/responsive.spec.ts`)
- **13.294** ✅ No `Password` tab exists on sign-in; `auth.ts:84` forbids the method. — (`apps/web/e2e-viewport/responsive.spec.ts`)
```

`Features.md` §6 (auth): extend the sign-in bullet: `HIG surface (2026-09-08): page header with icon tile and tagline, \`SegmentedControl\` for the method, filled fields, fill-and-accent alternatives, helper text on the email method, Terms/Privacy footer. All four methods retained; no password method (forbidden, \`auth.ts:84\`). Cases 13.292–13.294.`

- [ ] **Step 9: Gate + commit**

Run the gate; `GATE_EXIT=0`, `Cached: 0`; citations hold; ids `1806`. Also `pnpm test:e2e:stack` must stay 6/6 (the stack suite signs in through this page).

```bash
git add apps/web/app/sign-in/page.tsx apps/web/app/globals.css apps/web/e2e-viewport/responsive.spec.ts test-cases/13-deployment-dogfooding.md Features.md
git commit -m "Sign-in on the HIG surface, with all four methods and no password tab"
```

---

## Tasks 3–8: the per-screen pairs

**The shape is identical for every pair, so it is stated once here and each task below fills in only what differs.** Read this block before any (a) or (b) task.

**(a) surface — sonnet / medium.** Transcribe: replace bordered containers with `--gn-surface-raised` + radius, buttons stay `Button` (variants unchanged), tabs become `SegmentedControl` with a named `aria-label`, bare `<label><input>` become `.gn-field`, `ShellRefusal` / `ExpiredSessionNotice` / `role="alert"` paragraphs are **kept as-is** (Task 1 already restyled their classes). **Touch no state, no handler, no conditional.** The (a) task's test is the accessible-name ratchet + the screen's existing tests staying green + the viewport ratchets not rising.

**(b) states — opus / high.** The audit's **D** rows for that screen are the spec, copied into the task verbatim so the implementer needs no other file. Every state the prototype omitted is designed in the new language — **using the existing components** (`ShellRefusal`, `ExpiredSessionNotice`, `Chip` with its `tone`, the `role="alert"` refusal paragraph) **never a replacement**. The (b) task's deliverable is one Playwright or vitest case per named state, each citing its id, each **reddening when that state's branch is deleted** (the mutation step).

**Every (a) task must merge before its (b) task starts**, and Task 0 + Task 1 before any of them.

---

### Task 3a: Members — surface

**Model: sonnet / medium.** Files: `apps/web/app/w/[workspaceId]/members/page.tsx` (markup only), `packages/ui/src/ui.css` (append). Case id: none new (existing members tests + 13.287 are the guard).

**Verified at `77b2ee8`: the page emits `gn-members`, `gn-members__row` (`page.tsx:183-185`) and `gn-members__not-admin` (`:200`), and NO CSS rule exists for any of them in either stylesheet** — the roster currently renders as an unstyled `<ul>`. So this is an ADD of three rules, not a border replacement.

- [ ] Append to `ui.css`:

```css
/* ── Members roster. Rows are raised surfaces; no borders (R1(c)). ────── */
.gn-members { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.5rem; }
.gn-members__row { display: flex; align-items: center; gap: 0.75rem; min-height: 2.75rem; padding: 0.6rem 1rem; border-radius: 12px; background: var(--gn-surface-raised); }
.gn-members__not-admin { margin: 0; color: var(--gn-text-muted); }
```

- [ ] In the invite form (`page.tsx` ~240-330), wrap each bare `<label>…<input/></label>` and `<label>…<select/></label>` in the `.gn-field` pattern from Task 2 Step 3 (`<label className="gn-field"><span className="gn-field__label">…</span><input className="gn-field__input" …/></label>`). `<select>` gets `className="gn-field__input"` too. Inputs and selects keep their borders (Global Constraints). Touch no handler, no state, no conditional.
- [ ] Run: `cd apps/web && pnpm test:e2e:stack > /tmp/m.log 2>&1; echo "EXIT=$?"` — Expected `EXIT=0`, 13.287 green, tap-target and type-scale stack baselines not risen. Run the gate.
- [ ] Commit: `git commit -m "Members: HIG surface, form fields and roster, nothing removed"`.

### Task 3b: Members — states

**Model: opus / high.** The audit's #2 danger: *"a permission control that is invisible in the mockup is a permission control someone deletes while matching the design."* Case ids: `13.295`, `13.296`, `13.297`.

**Spec — the D rows, verbatim from the audit (`:170-204`):**
1. The entire role-gated admin/member split: three-state `adminGate` (`'asking'` / `'admin'` / `'member'` with explanation text / `'failed'` with `ShellRefusal`) (`page.tsx:75-107, 192-215`).
2. The full mint-invitation FORM: address, channel (email/sms/whatsapp), role (admin/member/guest, no owner option), optional comma-separated project ids (hidden for guest role).
3. Per-pending-invite `invitedBy` attribution — `PendingInvite` carries `invitedBy` (`invites-admin.ts:24`) but the page does not render it.
4. The 'no link behind this one — withdraw it and invite again' dead-mint-residue message for a pending row with `expiresAt: null` (`page.tsx:372-374`), and the empty-pending state.
5. Roster loading/error states: 'Loading…' and `ShellRefusal` on `getMembers` failure (`page.tsx:178-190`).
6. `revokeRefusal` display on a failed Withdraw (`page.tsx:205-209`).

**Deliverable:** rows 1, 4, 5, 6 designed in the new language with the existing components; row 2 kept exactly (it is present today; confirm it survived 3a); row 3 is an **addition the audit found the data already supports** — render `invitedBy` on each pending row as `invited by {name}` in `--gn-text-muted`.

- [ ] Write three stack-suite cases: **13.295** signs in as the seeded guest (`accountant@e2e.gisik-nokma.local`, `helpers/sign-in.ts`), visits `/w/<id>/members`, asserts the `'member'` branch renders `.gn-members__not-admin` with non-empty text and **no** invite form. **13.296** as the owner, intercepts `**/v1/workspaces/*/members` to return 500 via `page.route`, asserts a `role="status"` element containing `cannot be shown yet` (`ShellRefusal`'s fixed text). **13.297** as the owner, asserts a pending row with `expiresAt: null` renders the dead-mint residue text verbatim: `no link behind this one — withdraw it and invite again`.
- [ ] Mutation: delete the `'member'` branch (`page.tsx:196-200`). 13.295 must go RED. Revert from the pre-mutation commit.
- [ ] Catalogue three ✅ cases citing the spec file; `Features.md` §6 members bullet gains `HIG surface; guest branch, roster refusal and dead-mint residue redesigned and pinned (13.295–13.297)`. Gate. Commit: `"Members: the role gate and the refusal states, designed and pinned"`.

### Task 4a / 4b: Workspaces + Invite

**4a sonnet.** Files: `apps/web/app/workspaces/page.tsx`, `apps/web/app/invite/[token]/page.tsx`, `ui.css`/`globals.css` rules for `.gn-workspaces*`, `.gn-invite*` (borders → surface-raised + radius 12px). Keep the ThemeToggle and the Inbox `UnreadBadge` in `app-nav.tsx` untouched (both are D rows). Gate; commit `"Workspaces and Invite: HIG surface"`.

**4b opus.** Case ids `13.298`–`13.300`. **Spec, verbatim D rows:** Workspaces — *Full loading/error/empty state machine: 'Loading…', `ShellRefusal` on data-fetch failure, `ExpiredSessionNotice` on 401, and the empty-state copy 'No workspaces yet.'*; *The inline 'New workspace' FOUNDING FORM: persistent Name field + 'Create workspace' submit + per-field server refusal display (`FoundingForm`, `page.tsx:108-154`)*; *Personalized header ' — {user.name}'*; *Per-workspace navigation into each project and into 'My Work'*. Invite — the D rows at audit `:205-236` (expired-token refusal, wrong-account notice, the role named in the body copy — **keep `You are invited to join {workspaceName} as {role}.` verbatim; the prototype's version drops the role and is rejected by the copy rule**).
- [ ] Cases: **13.298** `/workspaces` with `page.route` returning 401 renders `ExpiredSessionNotice` (`role="status"`, class `gn-shell__expired`); **13.299** with an empty list renders `No workspaces yet.` and the founding form's `Create workspace` button; **13.300** `/invite/<token>` body text matches `/You are invited to join .+ as (admin|member|guest)\./`.
- [ ] Mutation: delete the 401 branch → 13.298 RED. Catalogue, Features §6, gate, commit `"Workspaces and Invite: the states the prototype never drew"`.

### Task 5a / 5b: The project page — Board, Calendar, Timeline (one route, `view` param)

**5a sonnet.** File: `apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx` line ~505 `.gn-view-tabs` tablist → `SegmentedControl aria-label="Board view"` with four options `board | list | calendar | timeline` (the fourth is real: audit finding #4). `ui.css`: `.gn-board__column` (`border:` → `background: var(--gn-surface-sunken); border-radius: 10px`), `.gn-card` (already borderless after #354 — verify), `.gn-timeline*` (31 rules), `.gn-calendar*` (24 rules): every `border:` → fill or removed. **Retire `.gn-view-tabs` from `globals.css:58-73`** once no markup uses it (`grep -rn gn-view-tabs apps packages` must return only CSS). Gate; the stack `viewport.spec.ts` overflow test must stay green; commit `"Project views: segmented control and fill-separated columns"`.

**5b opus.** Case ids `13.301`–`13.304`. **Spec, verbatim D rows (audit `:` Board section):** *'Only tickets in progress' checkbox + its scope-note (`page.tsx:483-503`)*; *`AttentionStrip` ('What needs your attention', `page.tsx:459-463`)*; *'who · when' provenance-disclosure button on every card (`board.tsx:168-175`, click unfolds `formatStateProvenance`)*; *'reopened — live work added' cause chip (`board.tsx:159-163`, shown when `card.cause !== null` — **the product's founding reopen-rule feature**)*; *zero-groups empty state ('No tickets here yet — create one.' + conditional Create button, `board.tsx:70-81`)*. Plus Calendar and Timeline D rows at their audit sections.
- [ ] Cases: **13.301** the reopen cause chip renders for a seeded reopened card (seed has 26 tickets; find one with `cause !== null` via `SELECT` against the dev Postgres, or create one through the real door); **13.302** the provenance button unfolds text containing both an actor and a time; **13.303** an empty project renders `No tickets here yet — create one.`; **13.304** the `Only tickets in progress` checkbox exists and toggles the rendered count.
- [ ] Mutation: delete the `card.cause !== null` branch → 13.301 RED. Catalogue, `Features.md` §2/§3, gate, commit.

### Task 6a / 6b: TicketSheet (`packages/app-core/src/views/ticket-sheet.tsx`)

**6a sonnet.** `.gn-sheet*` (8), `.gn-ticket*` (19), `.gn-history*` (9): borders → fills. Commit `"Ticket sheet: HIG surface"`.
**6b opus.** Case ids `13.305`, `13.306`. Spec: the audit's TicketSheet D rows (`:` section) — the contested-claim resolution controls (redo/convert/discard, **not** the prototype's invented keep-mine/keep-theirs), the history list's provenance, the attachment status lines. Cases pin that the three real resolution actions render by their shipped labels and that the invented ones do not exist. Mutation: remove one real action → RED. Commit.

### Task 7a / 7b: My Work + Inbox

**7a sonnet.** `.gn-my*` (10), `.gn-inbox*` (15), `.gn-attention*` (6), `.gn-saved*` (14). Commit.
**7b opus.** Case ids `13.307`–`13.309`. **Spec, verbatim D rows (MyWork):** *Two of four real sections absent: 'My claims in transit' (with the pending 'claim in transit' Chip) and 'Shared with me'*; *Named empty-state sentences for every section ('Nothing assigned to you.', 'No claims in transit.', 'No contested claims.', 'Nothing has been shared with you.')*; *State provenance on the chip: `Chip tone={item.stateCategory} title={formatStateProvenance(...)}`*; *projectName-withheld fallback: when `item.projectName === null`, render `item.projectId` with title 'You have not been told this project's name.'*; *`ContestedCard`: `Chip` showing `contested.rule`, the verbatim `contested.reason` from the rule engine*. Cases: **13.307** all four section headings present; **13.308** all four empty-state sentences render verbatim on an empty account; **13.309** the withheld-name fallback renders the id with the exact title text. Mutation: delete `Shared with me` section → 13.307 RED. Commit.

### Task 8a / 8b: Settings — TicketTypes, TicketTypeEditor, Workflows, WorkflowBuilder

**8a sonnet.** `.gn-state*` (13), `.gn-transition*` (8), `.gn-table` (7), `.gn-dialog` (8), the editor canvas. Commit.
**8b opus.** Case ids `13.310`–`13.313`. **Copy-rule rejections that MUST hold (these are C rows the rule rejects because they lose information):** TicketTypeEditor's buttons stay interpolated — `` `Move them to "${incomingWorkflow.name}"…` `` / `` `Leave them on "${outgoingWorkflow.name}"` `` — never the prototype's hard-coded `Move them to Scheduled`; Workflows keeps the per-item `aria-label="Open <workflow name>"` (13.287 also guards this); WorkflowBuilder keeps its real `adviseWorkflowDef` message strings, never the prototype's invented issue text. Cases: **13.310** the move dialog's button text contains the incoming workflow's real name; **13.311** each workflow row's open control has an aria-label containing that row's name; **13.312** the issues panel text equals a string produced by `adviseWorkflowDef` (import and call it on the same def); **13.313** TicketTypes' rank label is the shipped `rank ${type.rank}` form. Mutation: hard-code the move button label → 13.310 RED. Commit.

---

### Task 9: The List view — the prototype that does not exist

**Model: opus / high.** Audit finding #4: `page.tsx:505` registers four views; `List` has no artboard. Design it in the language of `Board` (same card, same chips, same provenance button), as a single column. Case ids `13.314` (List renders the same tickets Board does, by count), `13.315` (List's rows carry the same `Chip tone` as their Board cards). No prototype = no I/C rows; the D rows are Board's. Mutation: drop the chip from the list row → 13.315 RED. `Features.md` §2: `List view designed without a prototype, from Board's vocabulary (13.314–13.315)`. Commit.

### Task 10: Help, Legal, NotFound, McpAuthorize, McpTokens

**Model: sonnet / medium** for the surface (`.gn-help*` is 38 rules, all container styling; Legal and NotFound are prose pages; the MCP pair is two forms). **Copy-rule application, decided here so sonnet does not have to:** Help keeps its shipped section names (the prototype's differ — replacements, rejected); its `Working offline` prose is **illustrative and not shipped — do not add it**; NotFound's four C rows are replacements → keep shipped; McpAuthorize keeps `Connect an assistant` and `Approve this assistant` (replacements → keep shipped); Legal's five C rows are replacements → keep shipped, and **the placeholder-count test for the legal pages (`[JURISDICTION]` etc., pre-launch item 2) must stay green** — a restyle that touches placeholder text reddens it and that is correct. Case ids `13.316` (Help section headings unchanged, asserted against a list of the shipped names), `13.317` (legal placeholders count unchanged — cite the existing test), `13.318` (McpAuthorize's two shipped strings present). Gate; **13.285 covers the accessible names on all five routes.** Commit.

### Task 11: Mobile — record the deferral durably, with an owner

**Model: sonnet / medium.** No code. `apps/mobile` is React Native; `--gn-*` CSS variables do not exist there. Defect class 4 from Plan 1 is *an unrecorded deferral*. Add to `docs/pre-launch-checklist.md` under "What was NOT measured": `**Mobile HIG adoption — DEFERRED 2026-09-08, owner: whoever next touches \`apps/mobile\` theming.** The three mobile prototypes (MobileBoard, MobileHelp, MobileTicket) were audited (\`docs/hig-reconciliation-audit.md\` §MobileBoard/§MobileHelp/§MobileTicket); their S rows are sound but the token layer does not transfer — \`colorOf()\` in \`apps/mobile\` reads \`themes\` directly, so the palette IS already Apple's after #353, and only spacing/radius/fill treatment remains. The I and D rows apply unchanged: no invented sync-status wording, keep the raw \`stateId\` display until a ruling.` Add `13.319` 🚫 with that one-line reason to the catalogue. Move the `next free BLOCK` pointer to `13.321`. Commit `"Mobile HIG adoption deferred, recorded with an owner"`.

---

## Execution order and merge cadence

`0 → 1 → 2 → {3a→3b} → {4a→4b} → {5a→5b} → 9 → {6a→6b} → {7a→7b} → {8a→8b} → 10 → 11`. Sign-in (2) goes early because the owner has a reference image for it; List (9) follows the project page it borrows from. Each task is its own PR, controller-merged, with the forced gate re-run at each new `main`. **Task 0 merges before anything else is dispatched** — it is the gate that makes sonnet dispatch safe, and its absence is the reason every earlier restyle in this repo has needed an opus reviewer to catch a dropped affordance.

## Self-review against the spec

- **Coverage:** every audit row with `✅ verified` mapping has a task (SignIn 2; Workspaces/Invite 4; Members 3; Board/Calendar/Timeline 5; TicketSheet 6; MyWork/Inbox 7; the four settings screens 8; Help/Legal/NotFound/MCP 10; Mobile 11). The two `UNMAPPED` rows (`Main`, `overflow-check`) have no product surface and get no task. List (no prototype) is Task 9.
- **Placeholders:** none — every CSS block names real vars from the 31-role list; every test cites a real selector, role, or shipped string read from the tree; the (b) tasks carry the audit's D rows verbatim as their spec and a concrete falsifiable case per state.
- **Type consistency:** `SegmentedControl`'s props (`options`, `value`, `onChange`, `'aria-label'`) are identical in Task 1's interface block, Task 1's implementation, Task 2's usage and Task 5a's usage. `AccessibleNameCounts` field names match between the helper, both spec blocks and `RATCHETED`. Case ids `13.285`–`13.319` are each used exactly once; `13.320` is reserved and unused.
