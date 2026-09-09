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
- **Case-id block for this plan: `13.285`–`13.320`**, allocated to it by the controller. Per-task ranges are assigned below; take them in order, never derive from the file's maximum. ~~Update the `next free BLOCK` pointer at the foot of `test-cases/13-deployment-dogfooding.md` to `13.321` in the LAST task to merge.~~ **CORRECTED 2026-09-08 ~22:4x (controller, on the executor's finding in #374): `13.321` is a LIVE case (round 2b) — never a literal here. The last task to merge sets the pointer to one past the highest ALLOCATED block AS MEASURED at that time (2b `13.321`–`13.326`, Task 12 `13.327`–`13.333`, 2c `13.334`–`13.336`; the pointer is `13.337` as of this correction, and later rounds may move it again).**
- **Gate, verbatim, under Node 22:** `source ~/.nvm/nvm.sh && nvm use 22 && pnpm rebuild better-sqlite3 && pnpm turbo run build test typecheck --force --concurrency=1 > /tmp/gate.log 2>&1; echo "GATE_EXIT=$?"` — `--force` because a cached pass has replayed green here before; **never pipe a test run into `head`** (it orphans the worker pool; `CLAUDE.md`). Then `pnpm check:citations`, `pnpm check:tasks`, `node scripts/check-case-ids.mjs`.
- **Mutation-witness every guard.** A test that stays green with the code it protects removed is the defect this repo catalogues most. Every task ends with a mutation step; the mutation must go RED naming the site, then be reverted **from a commit made before the mutation** (`git checkout -- <file>` has destroyed uncommitted fixes here twice).
- **`Features.md` and the owning `test-cases/` file change in the same commit as the code.** Never a follow-up.
- **Model per task follows the coordination doc's table** (`2026-08-20-00-series-coordination.md:596-620`): *"the tier follows the failure cost of the task, not its size."* Transcription implementers (this plan carries the code) → **sonnet / medium**. Core-semantics implementers (view-models carrying honesty semantics — the (b) tasks) → **opus / high**. Per-task reviewers → **opus / high**. **Fable is not dispatched** (owner ruling 2026-08-31, "Fable out entirely").
- **Mobile (`apps/mobile`, React Native) is NOT restyled by this plan.** CSS tokens do not transfer. Task 11 records the deferral durably with an owner — an unrecorded deferral is defect class 4 from Plan 1.
- **Locating the `Features.md` bullet — by path, never by section number or title.** This plan's first draft pointed sign-in at "§6 (auth)"; the bullet is in **§3**, and the file's sections are not even in numeric order (§10 and §11 follow §12; there is no §8 heading). Three tasks in a row hit a wrong pointer before this rule replaced them. **Procedure:** `grep -n '<the screen's page.tsx path or component name>' Features.md` — e.g. `grep -n 'sign-in/page.tsx' Features.md`, `grep -n 'MembersPage\|members/page.tsx' Features.md` — and **extend the bullet that cites that path, in place.** If no bullet cites it, add the new bullet directly after the nearest bullet citing the same route family. A keyword grep is not enough: `board` first hits §1 Reference base, which describes the upstream tracker, not this product's board. **Never choose a section by reading its title.**

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
| `Features.md` (locate each bullet per Global Constraints), `test-cases/13-deployment-dogfooding.md` | Same-commit catalogue updates | every task |
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
- Modify: `test-cases/13-deployment-dogfooding.md` (cases 13.285–13.287), `Features.md` (locate per Global Constraints)

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

`Features.md` (locate per Global Constraints; new bullet goes beside the nearest one citing `apps/web/e2e-viewport`), add a bullet: `⚙️ **Accessible-name ratchet** — the counts of \`aria-label\` / \`role\` / \`aria-selected\` / \`aria-describedby\` per route are baselined one-way, so a restyle that drops one goes red. Built because the HIG adoption is delegated and a rule enforced by attention does not survive a delegation. Cases 13.285–13.287. \`apps/web/e2e-viewport/accessible-names.ts\``

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
- Modify: `test-cases/13-deployment-dogfooding.md` (13.288–13.291), `Features.md` (locate per Global Constraints)

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

`Features.md` (locate per Global Constraints; new bullet goes beside the nearest one citing `packages/ui`): add `✅ **Segmented control, filled field, tinted refusal panels, page header** — the four shared HIG pieces (\`SegmentedControl\` in \`packages/ui/src/components/segmented-control.tsx\`; \`.gn-field*\`, \`.gn-page-header*\`, retinted \`.gn-refusal*\` in \`ui.css\`). The ghost button gets the rule it never had. Cases 13.288–13.291.`

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
- Modify: `apps/web/e2e-viewport/responsive.spec.ts` (one assertion block), `test-cases/13-deployment-dogfooding.md` (13.292–13.294), `Features.md` (locate the sign-in bullet per Global Constraints — §3, not §6)

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

`Features.md` (locate the sign-in bullet per Global Constraints — it is in §3, not §6): extend it: `HIG surface (2026-09-08): page header with icon tile and tagline, \`SegmentedControl\` for the method, filled fields, fill-and-accent alternatives, helper text on the email method, Terms/Privacy footer. All four methods retained; no password method (forbidden, \`auth.ts:84\`). Cases 13.292–13.294.`

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
- [ ] Catalogue three ✅ cases citing the spec file; `Features.md` (locate the members bullet per Global Constraints) gains `HIG surface; guest branch, roster refusal and dead-mint residue redesigned and pinned (13.295–13.297)`. Gate. Commit: `"Members: the role gate and the refusal states, designed and pinned"`.

### Task 4a / 4b: Workspaces + Invite

**4a sonnet.** Files: `apps/web/app/workspaces/page.tsx`, `apps/web/app/invite/[token]/page.tsx`, `ui.css`/`globals.css` rules for `.gn-workspaces*`, `.gn-invite*` (borders → surface-raised + radius 12px). Keep the ThemeToggle and the Inbox `UnreadBadge` in `app-nav.tsx` untouched (both are D rows). Gate; commit `"Workspaces and Invite: HIG surface"`.

**4b opus.** Case ids `13.298`–`13.300`. **Spec, verbatim D rows:** Workspaces — *Full loading/error/empty state machine: 'Loading…', `ShellRefusal` on data-fetch failure, `ExpiredSessionNotice` on 401, and the empty-state copy 'No workspaces yet.'*; *The inline 'New workspace' FOUNDING FORM: persistent Name field + 'Create workspace' submit + per-field server refusal display (`FoundingForm`, `page.tsx:108-154`)*; *Personalized header ' — {user.name}'*; *Per-workspace navigation into each project and into 'My Work'*. Invite — the D rows at audit `:205-236` (expired-token refusal, wrong-account notice, the role named in the body copy — **keep `You are invited to join {workspaceName} as {role}.` verbatim; the prototype's version drops the role and is rejected by the copy rule**).
- [ ] Cases: ~~**13.298** `/workspaces` with `page.route` returning 401 renders `ExpiredSessionNotice` (`role="status"`, class `gn-shell__expired`)~~ — **see the correction below**; **13.299** with an empty list renders `No workspaces yet.` and the founding form's `Create workspace` button; **13.300** `/invite/<token>` body text matches `/You are invited to join .+ as (admin|member|guest)\./`.
- [ ] Mutation: ~~delete the 401 branch → 13.298 RED.~~ **See the correction below.** Catalogue, ~~Features §6~~ **the `Features.md` bullet located BY PATH per Global Constraints — `grep -n 'workspaces/page.tsx' Features.md`; this line's own "§6" is the exact defect that rule was written to stop, and it is struck rather than removed so the next reader sees the plan making the mistake its own constraints name**, gate, commit `"Workspaces and Invite: the states the prototype never drew"`.

**CORRECTED 2026-09-08 (executor measurement, controller ruling), during Task 4:** the two struck
clauses above were both wrong, and the first was wrong in the way this repo catalogues most — it
specified a check that cannot fail.

*13.298 as written was unsatisfiable and duplicative.* Measured on a committed tree at `29bc5da`:
deleting the `expired ? <ExpiredSessionNotice /> :` arm from `apps/web/app/workspaces/page.tsx` and
running the existing suites gives `EXIT=1`, **19 pass / 1 fail**, and the one failure is a
PRE-EXISTING case — `apps/web/test/page-refusals.test.tsx:180`, *"Workspaces: a 401 is NOT a refusal
— it sends the viewer to sign in"* — which already asserts `findByText(EXPIRED_SESSION_COPY)`, the
`push`, and the absence of the spinner. So "13.298 RED, **alone**" could never have been satisfied:
the branch was guarded before this plan was written.

*And it could not have been witnessed in a browser at all.* The plan says drive it with `page.route`,
i.e. Playwright. But `useSignInOnExpiredSession` calls `router.push('/sign-in')`, so a real browser
NAVIGATES AWAY — the notice exists only "for the frame or two before the router moves"
(`expired-session.tsx`'s own docblock). Deleting the render arm leaves the push intact, so mutated
and unmutated both settle on `/sign-in` and no assertion on a settled page can separate them. In
jsdom the router double never moves, which is precisely why the existing case works and a Playwright
twin would not. **A case whose mutation cannot redden it is not a guard, it is a decoration.**

**13.298 is therefore RE-POINTED, not returned**, at the one claim in this area nothing has ever
witnessed: *on `/workspaces`, a 401 from the API leaves the REAL browser settled on `/sign-in`.*
Every existing case asserts that `push` was called **on a test double**; no test has ever shown the
navigation happens. The mutation is deleting the `router.push` line — the browser then stays on
`/workspaces` — and the case cites `page-refusals.test.tsx:180` as the jsdom half it complements.

### Task 5a / 5b: The project page — Board, Calendar, Timeline (one route, `view` param)

**5a sonnet.** File: `apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx` line ~505 `.gn-view-tabs` tablist → `SegmentedControl aria-label="Board view"` with four options `board | list | calendar | timeline` (the fourth is real: audit finding #4). `ui.css`: `.gn-board__column` (`border:` → `background: var(--gn-surface-sunken); border-radius: 10px`), `.gn-card` (already borderless after #354 — verify), `.gn-timeline*` (31 rules), `.gn-calendar*` (24 rules): every `border:` → fill or removed. **Retire `.gn-view-tabs` from `globals.css:58-73`** once no markup uses it (`grep -rn gn-view-tabs apps packages` must return only CSS). Gate; the stack `viewport.spec.ts` overflow test must stay green; commit `"Project views: segmented control and fill-separated columns"`.

**5b opus.** Case ids `13.301`–`13.304`. **Spec, verbatim D rows (audit `:` Board section):** *'Only tickets in progress' checkbox + its scope-note (`page.tsx:483-503`)*; *`AttentionStrip` ('What needs your attention', `page.tsx:459-463`)*; *'who · when' provenance-disclosure button on every card (`board.tsx:168-175`, click unfolds `formatStateProvenance`)*; *'reopened — live work added' cause chip (`board.tsx:159-163`, shown when `card.cause !== null` — **the product's founding reopen-rule feature**)*; *zero-groups empty state ('No tickets here yet — create one.' + conditional Create button, `board.tsx:70-81`)*. Plus Calendar and Timeline D rows at their audit sections.
- [ ] Cases: **13.301** the reopen cause chip renders for a seeded reopened card (seed has 26 tickets; find one with `cause !== null` via `SELECT` against the dev Postgres, or create one through the real door); **13.302** the provenance button unfolds text containing both an actor and a time; **13.303** an empty project renders `No tickets here yet — create one.`; **13.304** the `Only tickets in progress` checkbox exists and toggles the rendered count.
- [ ] Mutation: delete the `card.cause !== null` branch → 13.301 RED. Catalogue, `Features.md` (locate the board bullet per Global Constraints), gate, commit.

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

**Model: opus / high.** Audit finding #4: `page.tsx:505` registers four views; `List` has no artboard. Design it in the language of `Board` (same card, same chips, same provenance button), as a single column. Case ids `13.314` (List renders the same tickets Board does, by count), `13.315` (List's rows carry the same `Chip tone` as their Board cards). No prototype = no I/C rows; the D rows are Board's. Mutation: drop the chip from the list row → 13.315 RED. `Features.md` (locate per Global Constraints): `List view designed without a prototype, from Board's vocabulary (13.314–13.315)`. Commit.

### Task 10: Help, Legal, NotFound, McpAuthorize, McpTokens

**Model: sonnet / medium** for the surface (`.gn-help*` is 38 rules, all container styling; Legal and NotFound are prose pages; the MCP pair is two forms). **Copy-rule application, decided here so sonnet does not have to:** Help keeps its shipped section names (the prototype's differ — replacements, rejected); its `Working offline` prose is **illustrative and not shipped — do not add it**; NotFound's four C rows are replacements → keep shipped; McpAuthorize keeps `Connect an assistant` and `Approve this assistant` (replacements → keep shipped); Legal's five C rows are replacements → keep shipped, and **the placeholder-count test for the legal pages (`[JURISDICTION]` etc., pre-launch item 2) must stay green** — a restyle that touches placeholder text reddens it and that is correct. Case ids `13.316` (Help section headings unchanged, asserted against a list of the shipped names), `13.317` (legal placeholders count unchanged — cite the existing test), `13.318` (McpAuthorize's two shipped strings present). Gate; **13.285 covers the accessible names on all five routes.** Commit.

### Task 11: Mobile — record the deferral durably, with an owner

**Model: sonnet / medium.** No code. `apps/mobile` is React Native; `--gn-*` CSS variables do not exist there. Defect class 4 from Plan 1 is *an unrecorded deferral*. Add to `docs/pre-launch-checklist.md` under "What was NOT measured": `**Mobile HIG adoption — DEFERRED 2026-09-08, owner: whoever next touches \`apps/mobile\` theming.** The three mobile prototypes (MobileBoard, MobileHelp, MobileTicket) were audited (\`docs/hig-reconciliation-audit.md\` §MobileBoard/§MobileHelp/§MobileTicket); their S rows are sound but the token layer does not transfer — \`colorOf()\` in \`apps/mobile\` reads \`themes\` directly, so the palette IS already Apple's after #353, and only spacing/radius/fill treatment remains. The I and D rows apply unchanged: no invented sync-status wording, keep the raw \`stateId\` display until a ruling.` Add `13.319` 🚫 with that one-line reason to the catalogue. ~~Move the `next free BLOCK` pointer to `13.321`.~~ **CORRECTED 2026-09-08 (controller): set it to one past the highest allocated block as measured then — `13.321` is a live case; see Global Constraints.** Commit `"Mobile HIG adoption deferred, recorded with an owner"`.

---

### Task 12: Passkey registration — the flow that makes "Sign in with a passkey" true

**Model: opus / high.** Auth-path feature; the sign-in side is the honesty case. **Owner-scoped
2026-09-08** after their live look found the passkey button was a dead end for every user: the product
shipped sign-in via passkey with **no way to register one** — the only `addPasskey` in the tree was inside
`@better-auth/passkey`'s own client bundle.

**Spec:** `@better-auth/passkey` 1.7.2 client, methods confirmed in the installed package:
`addPasskey`, `listUserPasskeys`, `deletePasskey`, `updatePasskey`; server plugin already wired with
`rpID = new URL(baseUrl).hostname` and `rpName: 'Gisik Nokma'` (`auth.ts:295-297`). **CORRECTED 2026-09-08 ~20:2x (controller), after #369:** Task 2b did NOT ship conditional UI. Its review
demonstrated that `signIn.passkey({ autoFill: true })` issues `GET /passkey/generate-authenticate-options` as its
first statement, charged to the shared `auth:` bucket (`RATE_LIMIT_AUTH_MAX`, 10/60s in production) — ten anonymous
page views then a real `POST /sign-in/magic-link` answered 429 (control at zero probes: 500, not 429) — so the request
was removed. **Passkey sign-in has NO entry point on `/sign-in` today: no button, no autofill offer**; the
`autocomplete="username webauthn"` token is present and inert. **This task restores the sign-in entry point
TOGETHER with registration**, under one constraint: **an anonymous `/sign-in` page load must charge the shared auth
bucket zero times.** Two doors, the implementer measures before choosing: (a) fire the conditional-mediation request
only on user intent (focus/interaction on the email field), never on mount; (b) take the passkey options endpoint
out of the shared `auth:` bucket into its own — a security-control change that goes to the owner first. Least
certain, carried from #369's review and NOT settled: whether DigitalOcean's ingress collapses every browser into
one client key the way the compose web container measurably does (`rate-limit.ts` records the collapse). It does not
change the constraint — it is the difference between one user self-429ing and every user sharing the budget.

**Files:**
- Create: `apps/web/app/account/page.tsx` — a signed-in account page whose first (and for now only)
  section is **Passkeys**. `/account` is the default; the owner may rename it. Reachable from `AppNav`
  beside `Sign out {user.name}` (`app-nav.tsx`), which keeps it inside the accessible-name ratchet's
  signed-in population.
- Create: `packages/app-core/src/account/passkeys.tsx` — the list + add + delete view, framework-free
  like its siblings under `packages/app-core/src/`.
- Modify: `apps/web/src/app-nav.tsx` (one link), `Features.md` (locate by path per Global Constraints —
  there is no account bullet yet; add beside the sign-in bullet), `test-cases/13-deployment-dogfooding.md`.
- Modify: `docs/manual.md` (`:17`, `:74`) and `docs/faq.md` (`:28`, `:32`) — both still tell a user to "Sign in
  with a passkey", which #369 made false on the shipped screen (the in-app Help renders exactly that line today).
  Make them true again in the same change set as the entry point, regenerate `packages/app-core/src/help/
  content.generated.ts` via `scripts/help-content.mjs`, `check:help` raw-green. Shipped copy: the owner's copy rule
  applies — restore the original wording rather than inventing new prose.

**Case ids:** `13.327`–`13.332` (a new block, allocated 2026-09-08; the plan's original block ends at
`13.320` and Task 2b holds `13.321`–`13.326`). **`13.333` is allocated to this task too** (the rate-limit property
below; controller, 2026-09-08 ~20:2x). Move the header pointer to `13.334`.

**Behaviour, each pinned by a case:**
- **13.327** — the Passkeys section lists the signed-in user's passkeys via `listUserPasskeys`, and an
  empty list renders the named empty state `You have no passkeys yet.` with the add control — never a
  blank region (the audit's happy-path finding applies here too).
- **13.328** — **Add a passkey** calls `addPasskey({ name })` with a user-supplied label (default: the
  browser/OS name), and the new row appears without a reload. Any refusal from the server or the
  authenticator is carried verbatim in a `role="alert"` paragraph — the product's rule, not
  "something went wrong".
- **13.329** — Delete asks nothing clever: one control per row, calls `deletePasskey({ id })`, the row
  goes. A server refusal is shown verbatim.
- **13.330** — **The end-to-end witness, and the only reason to believe the rest:** in the stack suite,
  attach a virtual authenticator over CDP (`WebAuthn.enable`, `WebAuthn.addVirtualAuthenticator` with
  `protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true,
  isUserVerified: true`), sign in by magic link, register a passkey on `/account`, sign out, and on
  `/sign-in` the conditional UI signs in **without** a magic link. Mutation: skip registration → the
  conditional sign-in must NOT succeed (RED). This is the case that proves Task 2b's sign-in change is
  honest rather than merely quiet.
- **13.331** — the accessible-name ratchet (13.287) rises, never falls, on `/account`: every row's
  delete control carries `aria-label="Delete passkey {name}"`.
- **13.332** — signed-out `/account` renders `ExpiredSessionNotice` / the sign-in redirect, never a
  blank page — the same treatment as every other signed-in route.
- **13.333** — **an anonymous `/sign-in` page load charges the shared auth bucket ZERO times.** Measured
  through the assembled app (the shape #369's review used): N anonymous loads of `/sign-in`, then one real
  `POST /sign-in/magic-link` from the same client key — it must NOT answer 429, and the server log must show no
  `generate-authenticate-options` request until the user acts. Mutation: fire the request on mount → RED. This is
  the property whose absence made 2b's first conditional-UI attempt a Critical; it is written here so the entry
  point cannot come back without it.

**Not in scope:** rename/edit of a passkey (`updatePasskey` exists; leave it unwired and say so in the
catalogue), and any cross-device / QR flow.

- [ ] Write 13.330 first (it is the red test that defines done), then 13.327–13.329, then the UI.
- [ ] Mutation for 13.328: drop the `role="alert"` on the refusal path → RED, and 13.331 must also fire.
- [ ] Gate, six checks raw, stack suite, catalogue + `Features.md` same commit. Commit:
  `"Passkeys can be registered, so signing in with one is no longer a dead end"`.

---

---

## AMENDMENT 2026-09-09 — the neomorphism direction, and the model floor

**Written by the controller (Fable 5.1) 2026-09-09 ~02:2x IST** from `docs/hig-second-audit.md` (#382) and three owner
rulings of ~01:5x–02:1x, verbatim: *"I want to make the platform in the neomorphism style"* → *"yes. yes. yes. and do the
restart yourself"* (neo for the whole product including a restyle of the two finished screens; the second audit now;
the owner exports the interactive prototype files) → *"make sure you coordinate and plan the work properly, assigning
them to the cheapest possible models for those tasks. The main work here is UI."* Every path and line below was read
from the tree at `e7a7f7c`, not recalled.

**What changes in the sequence:** three tasks go AHEAD of Task 12 and of everything from 3a onward — **Task 13**
measures the `neo` style from the exported files; **Task 14** lands the neo tokens and restyles the four shared pieces;
**Task 15** restyles the two finished screens. Every later (a) task then transcribes in neo, not HIG-flat. Nothing in
the Global Constraints changes except the two lifts named under Task 14.

**What neo is, as read from the design session (`controller-state.md`, the #379 entry):** raised cards, pills and
buttons carry diffuse drop shadows on the SAME paper colour as the page; inputs are sunken (inner shadow, no border in
the prototype); the accent palette is unchanged; the dark theme separates by slightly lighter fills, shadows nearly
invisible. **It is a surface treatment, not a rewrite:** the palette (#353), every (b) states task, Task 0's
accessible-name gate and the copy rule all carry over unchanged.

**Three rules, binding, not negotiable without the owner — each is already a repo rule:**
- **(a) OWNER RULING 2026-09-09: the empty input takes the PURE NEO look — sunken, no border** — even where the shadow
  edge measures below 3:1. The controller flagged the cost (13.284/13.291's own reason: an empty field then carries no
  ≥3:1 boundary to identify it) and the owner reaffirmed *"pure neo look."* So the border is dropped, **but the number
  is still taken and recorded, because accepting a deviation is not hiding it:** Task 13 measures the sunken field's
  shadow-edge contrast in both themes; Task 14 records it as an OWNER-ACCEPTED WAIVER — exempt the input boundary from
  the non-text sweep with a comment citing this ruling and the measured number, the shape `tokens.ts` already uses to
  exempt alpha primitives from `CONTRAST_PAIRS`. If that cannot be done without tripping the one-way non-text roster
  ratchet, escalate before shipping rather than lowering a ratchet.
- **(b) A CONTROL keeps a fill or an accent 600-weight label** (the post-#354 control-affordance ruling). A shadow is
  not a boundary WCAG 1.4.11 or the sweep credits.
- **(c) DARK theme separates by FILL, measured** — a shadow does not count toward separation there. Text pairs in
  `CONTRAST_PAIRS` (`packages/ui/src/tokens.ts:276`) are unchanged by this amendment.

**Model floor (owner, 2026-09-09) — applied on top of the coordination doc's table, "the tier follows the failure cost
of the task, not its size":**
- **The executor SESSION is relaunched per task on that task's tier** (the controller does this at the fixed point):
  sonnet for surface, transcription and measurement tasks; opus only for Task 12 (auth path).
- **(a)/surface tasks and Task 13:** sonnet / medium implementer; **haiku is acceptable for a pure CSS transcription
  commit when the plan carries the complete CSS and a mechanical gate exists** (`CONTRAST_PAIRS`, the accessible-name
  ratchet 13.285–13.287, the token-discipline scanner, the tap-target/type-scale ratchets, the non-text roster).
  Per-task reviewer: sonnet / medium.
- **(b) states tasks:** sonnet / medium implementer, **opus / high REVIEWER** — their point is a refusal state, and the
  standing rule escalates the reviewer wherever a task's point is a refusal or a disclosure. (Down from opus + opus.)
- **Task 12:** unchanged, opus / high. **Task 9:** re-scoped below to an (a) task, sonnet.
- A cheaper tier is not a licence to skip a gate, a control, a mutation, or a ruling. One subagent at a time.

**Case-id block for the amendment: `13.337`–`13.356`** (measured at `e7a7f7c`: highest §13 id in use is `13.336`).
Task 13 mints none; **Task 14 takes 13.337–13.347 (tokens + the style axis + the toggle + the shared pieces); Task 15
takes 13.348–13.356.** Task 14's PR writes this allocation into `test-cases/13-deployment-dogfooding.md`'s header and
moves the pointer to `13.357` (the first PR that mints from a block carries the header — the standing §12/§13 rule).
Recount the maximum against `origin/main` at rebase as the control, never mint from it.

### Task 13: Part B — measure the `neo` style from the exported prototype files

**Model: sonnet / medium.** Measurement with the repo's own instruments; no design decisions are taken here.

**Precondition MET 2026-09-09 — the owner exported the files (corrected dark mode).** Use the `(1)` copies:
`/Users/kiro/Downloads/Gisik Nokma - Desktop.dc (1).html` (292 KB) and `/Users/kiro/Downloads/Gisik Nokma - Mobile.dc (1).html`
(213 KB) — the owner replaced the first export to fix dark mode; the non-`(1)` files are stale, do not use them.
**Task 13's FIRST step: copy both into `design-system/interactive/` under space-free names
(`desktop.dc.html`, `mobile.dc.html`) and commit them.** Verify each is the interactive prototype before trusting it.

**The style system is a TWO-AXIS `[data-*]` cascade on `<body>`, read from the desktop file — this shapes Task 14:**
`:root{…}` is the base; `body[data-theme="dark"]` overrides for dark; `body[data-style="minimal"]` and
`body[data-style="neo"]` override for style; `body[data-theme="dark"][data-style="neo"]` is the neo-dark corner. So
STYLE is a runtime axis exactly parallel to THEME — which is what makes the owner's style switcher (below) a
token-layer change, not a per-screen one.

**Measure ALL THREE styles (hig=base, minimal, neo) × BOTH themes — it is only reading, and Task 14 needs every set.**
For each style×theme: the surface/raised/sunken/overlay values, the fill ladder, radii, and the `box-shadow`
raised/sunken/overlay treatments; run every resulting surface and text pair through `CONTRAST_PAIRS`'s arithmetic and
the sunken input's shadow edge through the 13.283 sweep instrument; report dark-theme fill separation per pair.
**A palette-delta finding is already visible and MUST be reported, not resolved by the executor:** the desktop file's
`:root` reads `--surface:#EFE7DF` (WARM paper) where the shipped palette (#353) and `tokens.json` are cool
(`paper #f2f2f7`). Neo — or the whole exported base — may be a PALETTE change, not only a surface treatment. **Measure
the delta for every style, write it in `docs/neo-token-report.md` as a decision for the controller; adopt nothing
silently and keep nothing silently.** Deliverable: one PASS/FAIL table per rule (a)(b)(c) per style, so Task 14
transcribes and never decides.

**Files:** Create `design-system/neo-tokens.json` — a proposal beside `tokens.json`, the same shape (`color`/`fill`
light AND dark, `radius`, plus the new `shadow` block: raised, sunken, overlay; every value with the prototype
selector it was read from). **`MASTER.md`'s rule holds: no number hand-authored — every measurement reproducible by a
probe script beside it** (`design-system/tools/`). Create `docs/neo-token-report.md`: each proposed surface pair
through `CONTRAST_PAIRS`'s own arithmetic; the sunken input's shadow edge against its surroundings through the 13.283
sweep's instrument (`apps/web/e2e-stack/viewport.spec.ts`), both themes; dark-theme fill separation per raised/sunken
pair. **Deliverable:** one table per rule (a)(b)(c) — PASSES / FAILS with the number — so Task 14 transcribes and
never decides. Anything below 3:1 is reported, not rounded, not "close".

**Not in scope:** any source, test, token or CSS change; no ledger status change; no case id.

- [ ] Extract from the exported files (light and dark, desktop and mobile variants where they differ); measure; write
  both files with the probe script; one PR, docs + `design-system/` only, frozen-head protocol.

### RULING — the neo-round palette (controller as ruling tier, 2026-09-09 ~03:1x IST; revocable by the owner in a word)

**Input:** Task 13's report (`docs/neo-token-report.md`, #385 → `777c5b1`): every style in the export moves surface,
raised, sunken AND the cascade's `--accent` default away from `packages/ui/src/tokens.ts`, in both themes; neo/dark's
surface, raised and sunken are one hex (`#1B2340`, separation 1.00); light `label3` on surface 2.96–2.99 and the
export's accent on surface 4.19–4.3 fail 4.5:1; the neo sunken input's shadow edge is 1.24 light / 1.16 dark.

1. **The exported palette IS the design and is ADOPTED for all three styles × both themes** — surface, raised, sunken,
   overlay, the fill ladder, radii and the shadow treatments, transcribed from `design-system/neo-tokens.json`. The
   owner's instruction is *"apply the new visuals from the design files"*; the amendment's "palette carries over" was
   the controller's reading from screenshots and is superseded by the measurement. The shipped cool palette (#353) is
   replaced for the `hig` style too — the export's `hig` is warm paper / navy dark. `success` stays `green700`.
2. **The ACCENT stays SHIPPED (`#0040DD` light / `#409CFF` dark) pending the owner's word.** The probe read the
   `<style>` cascade default (`--accent:#3A6DB0`); the design session's accent PICKER offers four accents with the
   shipped blue first and selected (the #379 screenshots), and the report's own gaps section says the instrument cannot
   see runtime/inline values. A cascade default is not the applied accent. Adopting `#3A6DB0` would also fail 4.19 on
   surface. **Owner question, one word: keep the blue accent?** Until answered, Task 14 keeps the shipped accent.
3. **The accessibility floor is kept by MINIMAL NUDGES recorded against the export value** — the #353 shape (Apple's
   stock colours failed 15 pairs; their accessible variants passed): (a) every `CONTRAST_PAIRS` row passes at the
   transcribed values — the test is the gate; a failing pair is nudged (the nearest value in the same hue), never
   deleted from the roster; `label3`/`textMuted` on surface reaches 4.5 in every light style (nudge darker); (b)
   **neo/dark gets derived `raised` and `sunken` steps** giving at least the export's own sibling-style separation
   (hig/minimal dark: surface↔raised 1.21, surface↔sunken 1.46), with neo's shadows kept on top — rule (c) as written;
   every nudge is a line in the token file's docblock: export value → shipped value → why.
4. **Rule (b) clarified:** the report's "`ctlBg`/`chipBg` vs surface below 3:1" rows are NOT rule-(b) failures. Rule
   (b) (post-#354) identifies a control by fill + accent 600-weight label, not by a 3:1 fill boundary; those rows are
   the accepted state in every style. No change.
5. **Rule (a):** waived by the owner; `1.24 light / 1.16 dark` go verbatim into 13.339's waiver comment.
6. **Gaps, with owners:** `--fill2` undeclared in `mobile.dc.html` and the missing `:focus-visible` rule there —
   mobile is deferred, Task 11's note carries both; no overlay shadow variable in either file — Task 14 derives
   `--gn-shadow-overlay` from the raised treatment and records it as derived, not measured.

### Task 14: The style axis (hig / minimal / neo) as a runtime toggle, neo default, and the four shared pieces

**Model: sonnet / medium** implementer, **sonnet / medium** reviewer; the instruments are the check. **Escalate to an
opus reviewer only if the token-axis change touches the visibility/refusal surface** (it should not — this is the token
layer and one nav control).

**What the owner asked, 2026-09-09, verbatim:** *"allow style change in the settings or somewhere (near light/dark mode
toggle)."* The exported prototype already structures style as `body[data-style="minimal"|"neo"]` over a `:root` base,
so this is a runtime axis parallel to theme, NOT per-screen work: the screens consume `--gn-*` variables and the
cascade swaps their values. **Ship all three styles the prototype defines (hig = the current shipped base, minimal,
neo), with NEO as the default applied value**, and a toggle beside the existing `ThemeToggle`. *(Controller's reading:
"allow style change … near the light/dark toggle" + a three-value prototype switch = a three-option runtime axis, neo
default. If the owner wanted neo-only with no switch, the toggle instruction contradicts that; proceeding on the
three-style reading, correctable before this task's PR opens.)*

**Two Global-Constraint lifts, scoped to THIS task only:** (1) `packages/ui/src/tokens.ts` gains a **StyleName axis**
(`'hig' | 'minimal' | 'neo'`) beside `ThemeName`, plus shadow and radius roles — **never a palette change to the
accent set**, `success` stays `green700`; shadow colours are ALPHA primitives and the existing rule holds that *no
`CONTRAST_PAIRS` row may name them* (`tokens.ts:120`). If Task 13's report shows the exported BASE palette differs from
shipped (the warm-paper delta), that is a **controller ruling before this task builds** — do not fold a palette change
into a token-axis task on your own. **The palette inputs are the RULING directly above this task: the export's palette adopted, the accent kept shipped pending the owner, the accessibility floor kept by recorded nudges, neo/dark raised/sunken derived.** `themeStylesheet()` (`:388`) emits base + each `[data-style]` override + the dark
combinations through `cssVariableName` (`:375`). (2) The "31 `TOKEN_ROLES`" figure in the Global Constraints is a fact
about `77b2ee8`; after this task it is whatever `TOKEN_ROLES` reads.

**The style toggle:** a `StyleToggle` component (sibling of `apps/web/src/theme-toggle.tsx`), mounted in
`apps/web/src/app-nav.tsx` beside `<ThemeToggle />` (`:26`), so it lands inside the accessible-name ratchet's
signed-in population. It sets `data-style` on the same element `ThemeToggle` sets `data-theme` on, persists the choice
the same way (whatever `theme-toggle.tsx` uses — read it, match it), and **defaults to `neo` when nothing is stored**.
Options carry real `aria-label`s. **Owner naming, 2026-09-09: *"there is neu | minimal | HIG styles"* — the toggle's visible labels are `HIG`, `Minimal`, `Neu`; the `data-style` VALUES stay the prototype's own (`hig`, `minimal`, `neo`) so the transcribed cascade selectors match byte-for-byte.** **Pure neo look for inputs applies under `data-style="neo"` per the owner ruling
above (rule (a)); under `hig`/`minimal` the field keeps whatever boundary that style defines.**

**Files:** `packages/ui/src/tokens.ts` (StyleName axis, roles, all style×theme sets, `themeStylesheet`),
`packages/ui/src/ui.css` (`.gn-segmented*` 4, `.gn-field*` 5, `.gn-button*` 8, `.gn-refusal*` 3, `.gn-page-header*` 4,
`.gn-card` 1, `.gn-chip*` 9, `.gn-sheet*` 8, `.gn-avatar*` 3 — counts at `e7a7f7c` — most rules become variable-driven
so the cascade does the styling), `apps/web/app/globals.css` (`.gn-shell__refusal` 3, `.gn-shell__expired` 1,
`.gn-card*` 7, `.gn-button*` 4), create `apps/web/src/style-toggle.tsx`, modify `apps/web/src/app-nav.tsx`,
`packages/ui/src/index.ts` (export), `packages/ui/test/components.test.tsx`, `apps/web/e2e-stack/accessible-names-baseline.json`
(the toggle raises the signed-in floor — one-way), `Features.md`, `test-cases/13-deployment-dogfooding.md`.

**Cases 13.337–13.347, each pinned by a test citing the id literally:**
- **13.337** each new token role has a value for every (style × theme) and appears in `themeStylesheet()`'s output as a
  `--gn-*` variable under the right `[data-style]`/`[data-theme]` selector. Mutation: drop one combination → RED naming it.
- **13.338** every shadow colour is an alpha primitive and no `CONTRAST_PAIRS` row names it (mutation: add a row → RED).
- **13.339** under `data-style="neo"` the empty input renders the sunken no-border treatment (owner ruling (a)); the
  measured shadow-edge contrast from Task 13's report is quoted in the case and its waiver comment. Under `hig`/`minimal`
  the field keeps its defined boundary. Mutation: the neo input grows a border → RED.
- **13.340** ghost/secondary buttons keep fill + accent label in every style — 13.289 stays green; mutation: remove the
  fill under neo → 13.289 RED, alone.
- **13.341** dark theme, per style: every raised/sunken surface pair separates by fill by at least Task 13's measured
  value; mutation: equalise the two fills → RED.
- **13.342** the accessible-name ratchet (13.285–13.287) does not FALL on any route, and RISES by exactly the style
  toggle on the signed-in nav; both viewport suites, no seeding variable set.
- **13.343** `apps/web/e2e-stack/non-text-contrast-roster.json` does not grow **except** the owner-accepted neo input
  waiver (13.339), which is added with its measured number and this ruling cited — no other sub-3:1 boundary appears.
- **13.344** the `StyleToggle` renders one control per style with an `aria-label`, sets `data-style` on the theme
  element, and `aria-pressed`/selected tracks the active style. Mutation: drop the `aria-label` → RED.
- **13.345** with nothing stored, the applied `data-style` is `neo` (the default); mutation: default to `hig` → RED.
- **13.346** the stored style survives a reload (persistence), asserted the same way `theme-toggle`'s persistence is;
  mutation: stop writing storage → RED.
- **13.347** switching style changes a witnessed rendered value (e.g. a card's computed `box-shadow` differs between
  `hig` and `neo`) — the positive control that the axis actually does something; mutation: make both styles emit the
  same value → RED.

- [ ] Build the axis and the toggle; restyle the pieces variable-driven; gate (verbatim, Node 22) + six checks raw;
  both viewport suites; mutation-witness 13.337, 13.339, 13.345, 13.347 (commit before mutating; restore with
  `git checkout HEAD -- <path>`); catalogue + `Features.md` same commit; one PR; frozen-head protocol.
  Commit: `"Style is a runtime axis now — hig, minimal, neo beside light and dark, neo the default"`.

### Task 15: The two finished screens restyled in neo — sign-in, workspaces, invite

**Model: sonnet / medium** implementer (haiku acceptable for a CSS-only commit), **sonnet / medium** reviewer.

**Files:** `apps/web/app/globals.css` (`.gn-sign-in*` 7 rules, `.gn-invite*` 5, `.gn-card*` 7 — read
`apps/web/app/workspaces/page.tsx` for the classes it renders; there are no `.gn-workspaces*` rules at `e7a7f7c`),
`apps/web/app/sign-in/page.tsx` and `apps/web/app/workspaces/page.tsx` only where markup must change (say why per
hunk), baselines only upward, `Features.md` (the sign-in bullet is in §3 — locate by `page.tsx` path), `test-cases/13`.

**Cases 13.348–13.354:**
- **13.348** `/sign-in` still renders every method the server offers and no control the server refuses (13.292's
  property) — unchanged by the restyle.
- **13.349** `/workspaces`' three-state machine (13.298–13.300: loading / refusal / empty, and the 401 settle on
  `/sign-in`) is unchanged — the restyle deletes no state.
- **13.350** accessible-name floors on `/sign-in`, `/workspaces` and `/invite/<token>`'s reachable states do not fall.
- **13.351** tap-target and type-scale ratchets do not fall on either route (both suites, no seeding variable).
- **13.352** the Back control on `/privacy` and `/terms` survives.
- **13.353** `apps/web/app/invite/[token]/page.tsx` markup is byte-identical unless a hunk is named in the PR body
  (the Task 4a precedent: the invite surface is CSS over existing markup).
- **13.354** the stack suite signs in through the restyled page and reaches `/workspaces` (6/6 as at #374).

- [ ] Restyle; gate + six checks; both suites; rebuild the dev images from the frozen head, run the stack suite
  against them, `docker image prune -f` (dangling only, never `-a`); hand the controller `http://localhost:3001/sign-in`
  and `/workspaces` for the owner's look; catalogue + `Features.md` same commit; one PR.

**Task 9, re-scoped by the audit:** the List view EXISTS (`docs/hig-second-audit.md` §1: header, Group by, Columns,
hierarchy, progress, claim-attributed dates all ship). Task 9 becomes an **(a) surface task — sonnet / medium** —
restyle `packages/app-core/src/views/ticket-list.tsx`'s markup and CSS in neo, keeping every D-row the audit names
(the `activeOnly` header swap, the `· N restricted` suffix, the persisted `listColumns`/`grouping` records). Its two
partials — the `workflow` axis on Group by and Columns, and `field:` columns unreachable from the picker — are
**product scope for the owner, not this plan's**. Its case ids stay as allocated to it.

### The additions — owner-decided 2026-09-09, folded into their owning screen tasks (NOT new numbered tasks)

The owner ruled *"apply the new visuals and certain additions"* and, on the audit's list, **"defer only 7" (mobile)**.
So every addition below is IN scope except mobile, each built as part of the screen task that owns its surface, after
the owner looks at Task 15. Feature additions beyond a restyle keep an **opus reviewer** where they carry a permission
or data semantic; the rest are sonnet, per the model floor.

| addition | owning task | model | the constraint (binding) |
|---|---|---|---|
| *"Subtask of…"* label on the visible-parent branch | **6b** | sonnet + sonnet | one label on `ticket-sheet.tsx:342`, matching the self-describing style of the other two branches; the audit's one-word gap |
| Full-screen ticket toggle | **6b** | sonnet + sonnet | `SheetProps` gains an optional presentation mode; state/tabs/edits survive the toggle; no new refusal path |
| Breadcrumbs | **6b** | sonnet + **opus review** | MUST degrade to the three-state parent display (`ticket-sheet.tsx:334-343`) — a restricted parent stays *"exists, but you can't see it"*, never a silent gap or a vanish; builds on `epicAncestorOf` (cycle-safe, answers null) |
| Board workflow picker | **5b** | sonnet + **opus review** | the SAFE form ONLY (owner-approved): the picker lists just the workflow groups the board ALREADY renders for this viewer, with counts of visible cards — **no full-workflow list (that is the `board.tsx:61-64` leak), no `getBoard` signature change.** A narrowing over what is already served, not a new server read |
| Week view on the calendar | **5b** | sonnet + sonnet | a second view mode beside month; no data the month view lacks |
| Workflow axis on List (Group by + Columns) | **9** | sonnet + sonnet | carry `workflowId`/`workflowName` onto `ListRow` first (the server's `ListCard` has it and drops it); then the axis and the column |
| Role labels on cards | **3 (Members) / 15 (Workspaces)** | sonnet | the ONE invented I-row with real backing data — the server carries the caller's role; only the display is missing. **The other seven I-rows (member counts, avatars, chips on workspace cards, the invitation banner, Help/Account nav) stay INVENTED** — no data exists for them and building them would invent data the product forbids. *(Controller's reading of "defer only 7": item 8's recommendation was "role labels only"; if the owner meant the full invented set, that is a data-model round beyond a restyle and gets its own scope.)*

**DEFERRED by the owner — mobile (audit #7):** the mobile calendar, and any mobile restyle/subtask surface.
`apps/mobile` is React Native; `--gn-*` CSS variables do not exist there. Task 11 records this deferral durably.
Every remaining I-row stays invented.

### The Workspaces page + a workspace home, built to the owner's detailed brief — owner 2026-09-09

The owner sent the reference image AND a seven-item implementation brief. **This SUPERSEDES the audit's "these I-rows
stay invented" for the workspaces page** — they are now real features. Feature + data work on the read/visibility
surface (the one that produced P19/P22/P23), so the server and admin-mutation parts are **opus / high**. **The product
cannot lie: every count is COMPUTED and VISIBILITY-SCOPED, never painted; a number the caller may not count is
WITHHELD (a "Restricted" chip), never printed as 0.** The guest card in the reference shows no counts — match that.

**PREMISE CORRECTION, measured at `2295e11` — item 1's "getMyWorkspaces REFUSES whole (mapWorkspaceRefs throws
ServingGapError)" is STALE and must not be acted on as written.** That was true in the Plan 5/6 era (the `mapWorkspaceRefs:
(_raw)=>never` refusal) and was FIXED by rulings P32/P38: today `GET /v1/me/workspaces` (`routes/workspaces.ts`)
SERVES `{workspaceId, name, role, projects}` — `proj_memberships` for role, `visibleProjects(pool, eff, workspace_id)`
for the visibility-scoped project list — and `mapWorkspaceRefs` maps it without throwing. **There is no refusal to
fix; the gap is the COUNTS and `archived`, which the route does not yet compute.** Extend the serving route; do not
hunt a throw that is not there.

**Already ships (verified `2295e11`), do NOT rebuild:** the served workspace list (name, role, visibility-scoped
projects), role labels (Task 15), the heading `Workspaces — {user.name}`, the `N workspaces you belong to.` subtitle,
the nav (Workspaces · My Work · Inbox+unread badge · Style · Theme · Sign out {name}), and the New-workspace create
form with an untrimmed name and door-worded refusals. `blocked` is a real countable state (`workflow.ts:13`).
**KEEP the four render branches (expired / refusal / loading / empty) and the founding form as they are.**

Case-id block for this cluster: **`13.366`–`13.389`** (2d holds 13.358–13.365 and carries the pointer to 13.366).

### Task 16: /v1/me/workspaces — real counts + archived, visibility-scoped (server-first)

**opus / high, opus reviewer.** EXTEND the already-serving route and `WorkspaceRef` (do not rewrite a refusal): add
**`memberCount`** per workspace (`proj_memberships`), and **per project `{ ticketCount, blockedCount, archived }`**
(`proj_tickets`; `blockedCount` = tickets whose current state has `blocked:true`; `archived` is a NEW column on
`proj_projects` + an `project.archived`/`project.restored` event pair — a migration and a projection change, escalate
if the event vocabulary needs an owner decision). **Withhold every count when the caller's role on that workspace is
guest — the field is ABSENT (not 0); the card shows "Restricted".** The guest's `projects` already come
visibility-scoped; add the restricted marker + visible count so the card can say *"1 project · name restricted"*
without ever carrying a name the guest may not see (P32/P38 — escalate before a new rule). `mapWorkspaceRefs` reads
the new fields. Cases 13.366–13.372, mutation-witnessed: a guest response carries no count and no restricted name
(mutate the gate to permit → RED, alone); a member's counts equal the DB aggregation; `blockedCount` counts
blocked-state tickets and nothing else; an archived project carries `archived:true`.

### Task 17: Caller-scoped pending invitations + Accept/Decline (server-first)

**opus / high, opus reviewer.** The existing invites routes are **admin-only and workspace-scoped**
(`POST /v1/workspaces/:id/invites`, admin listing) — measured. **Build a NEW caller-scoped read**: the invitations
addressed to the signed-in user's VERIFIED email that are still valid (not expired/accepted/declined), from
`proj_invites`. Offer **Accept** (the existing `/v1/invites/:token/accept` flow) AND **Decline** (a real state change —
the audit noted Decline exists nowhere; add the event/mutation). Client: the *"One invitation is waiting"* banner with
inviter, workspace, role and expiry. Cases 13.373–13.378: only genuine pending invites for THIS caller surface; an
invite for another email never appears (mutate the email scope → RED); Decline is witnessed as a state change and the
invite then vanishes; Accept joins the workspace. **Decline and Accept are real mutations — owner-approved features.**

### Task 18: The neo workspace card + Help/Account nav (+ the option-2 restricted count)

**opus / high, opus reviewer** — the owner ruled OPTION 2 (2026-09-09) for the restricted-project count, a new
derivation rule on the visibility surface. **First, server:** add to `WorkspaceRef`/`GET /v1/me/workspaces` a count of
the caller's **name-restricted-but-ticket-visible** projects (those they see ≥1 ticket in via `visibleTicketsWhere`
but whose NAME `visibleProjects` withholds), so the card renders *"N project · name restricted"* truthfully; **AMEND
the `mapWorkspaceRefs` docblock in the same change set** — its *"no 'and N more', because the COUNT would itself be the
disclosure"* rationale is replaced with option 2's (a count of projects the caller already holds a ticket in reveals a
NAME restriction, not an existence — the P32 distinction). Do NOT count projects the caller has no sight into (refused
option 3). Mutation-witness: the count equals that set; mutate to count all projects → RED. Task 16's shipped wire is
untouched — this field is additive. **Then the card (the CSS part is sonnet-simple within this opus task):** through the
style axis: monogram from the
workspace name (deterministic colour from its id, the `Avatar` primitive), the member count, **chips for active /
blocked ticket counts — the guest card shows a single "Restricted" chip instead of any number**, the role rendered as
a SENTENCE (*"You're an owner here."*, never the raw enum) with **every gated affordance derived from that one role
value, not a second source**, the per-project ticket counts, archived projects marked and hidden behind a toggle, and
*"1 project · name restricted"* rather than omitting a guest's unopenable project. Nav gains **Help** and **Account**
(Account is GLOBAL — profile, notification preferences, sessions/devices — NOT workspace settings; the nav entry lands
now pointing at `/account`, whose full content is Task 12+; a minimal `/account` stub ships here so the link is not
dead, or the link waits for Task 12 — the implementer measures whether `/account` exists and picks, saying which).
Cases 13.379–13.383: card renders from real data; the guest card shows "Restricted", no number; the role sentence and
its gated affordances read one source; the accessible-name floor rises and never falls; both viewport suites; the
roster does not grow.

### Task 19: The workspace home — a new route `app/w/[workspaceId]/page.tsx` (server + client)

**opus / high, opus reviewer** (admin-gated mutations + the permission surface). Today a workspace is reachable only
through a project link; this is its home. It lists the workspace's projects with counts, marks archived ones with
**archive/restore for admins** (Task 16's `archived` field + events), an **admin-gated new-project form**, and links to
**My Work, Members, Ticket types, Workflows and MCP tokens**. Every admin affordance is gated by the caller's resolved
role (P22's brand, one source); a non-admin sees the list and the links but not the mutations. Cases 13.384–13.389:
the route lists projects with counts; a non-admin gets no archive/restore/new-project control (mutate the gate →
RED, alone); archive hides a project from the default board list and restore returns it; the nav links resolve.

### Round 19b: the workspace screens against the owner's home reference — owner feedback 2026-09-09 ~16:1x IST

**sonnet, sonnet reviewer. No ledger row — a round on Tasks 18/19, as 2d was on Task 2. Block `13.390`–`13.399`; the
executor moves the §13 pointer to `13.400` in its PR.** The owner, verbatim: *"1. the workspace card should be clickable.
and on click it should lead into the workspace page which looks like this: [image] 2. From the same image, take note of
the navigation bar. 3. The create workspace card shouldnt be that big."* The image is the prototype's `workspace` screen
(neo, dark) — the spec, as the design session's `signin` screen was for 2d. All three premises measured true at
`b47f0253`. Spec and the four conservative-default rulings (Board renders only with a project in the route; no "0
archived · show"; "Open board" for archived projects — there is no read-only mode; no description line — there is no
field) are in `gisik-nokma-lanes/CTL-DISPATCH-2026-09-09-round19b-workspace-feedback.md` and
`docs/lanes/controller-state.md` (~16:2x). Deferred for the owner: the prototype's "Workspace" card (rename is a mutation
with no event) and per-restricted-project cards (a new visibility surface). Each default is the owner's to overrule.

**Sequence:** 2d (sign-in, in flight) → **16 → 17 → 18 → 19** → owner look at `/workspaces` and a workspace home → **19b** (the owner's feedback round, 2026-09-09) →
**12** (passkeys; expands `/account`) → 3a/3b → 5a/5b → 9 → 6a/6b → 7a/7b → 8a/8b → 10 → 11. Tasks 16, 17, 19 are opus
(relaunch the executor on `--model opus` for each); ~~18 is sonnet~~ **— and 18 is opus too, since the
owner's 2026-09-09 ruling made it a new derivation rule on the visibility surface. This sentence
contradicted Task 18's own heading (`opus / high, opus reviewer`) from the moment that heading was
amended; corrected in Task 18's PR, by the executor the contradiction was aimed at.**


## Execution order and merge cadence

~~`0 → 1 → 2 → {3a→3b} → {4a→4b} → {5a→5b} → 9 → {6a→6b} → {7a→7b} → {8a→8b} → 10 → 11`~~ **AMENDED 2026-09-09 (owner sequencing + the neo direction; Tasks 0, 1, 2, 4a, 4b are done): `13 → 14 → 15 → 12 → {3a→3b} → {5a→5b} → 9 → {6a→6b} → {7a→7b} → {8a→8b} → 10 → 11`** — Task 13 waits on the owner's export; the owner looks at sign-in and workspaces after Task 15, before Task 12. Sign-in (2) goes early because the owner has a reference image for it; List (9) follows the project page it borrows from. Each task is its own PR, controller-merged, with the forced gate re-run at each new `main`. **Task 0 merges before anything else is dispatched** — it is the gate that makes sonnet dispatch safe, and its absence is the reason every earlier restyle in this repo has needed an opus reviewer to catch a dropped affordance.

## Self-review against the spec

- **Coverage:** every audit row with `✅ verified` mapping has a task (SignIn 2; Workspaces/Invite 4; Members 3; Board/Calendar/Timeline 5; TicketSheet 6; MyWork/Inbox 7; the four settings screens 8; Help/Legal/NotFound/MCP 10; Mobile 11). The two `UNMAPPED` rows (`Main`, `overflow-check`) have no product surface and get no task. List (no prototype) is Task 9.
- **Placeholders:** none — every CSS block names real vars from the 31-role list; every test cites a real selector, role, or shipped string read from the tree; the (b) tasks carry the audit's D rows verbatim as their spec and a concrete falsifiable case per state.
- **Type consistency:** `SegmentedControl`'s props (`options`, `value`, `onChange`, `'aria-label'`) are identical in Task 1's interface block, Task 1's implementation, Task 2's usage and Task 5a's usage. `AccessibleNameCounts` field names match between the helper, both spec blocks and `RATCHETED`. Case ids `13.285`–`13.319` are each used exactly once; `13.320` is reserved and unused.
