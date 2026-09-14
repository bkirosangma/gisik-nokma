# Shared Select rollout — Phase 2 Wave A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the 3 native `<select>` sites in `apps/web` (Invite Channel, Invite Role, Style) onto the existing shared `Select` component from `@gisik-nokma/ui`, matching Phase 1's proven pattern exactly — no changes to `Select` itself.

**Architecture:** Each site swaps its `<select><option>...</option></select>` markup for `<Select options={...} value={...} onChange={...} aria-label="..." />`, wrapped in the same `<label><span>Text</span><Select .../></label>` pattern Phase 1's two call sites already established (no `label` prop on `Select` itself — see Phase 1 spec's Public API section). All 3 sites are non-searchable, fixed 3-option enums with no "unset" state (each site's local state is always a valid enum member from mount), so none of them exercise the spec's `string` → `string | null` migration note — confirmed per-site in Task 1/2 below rather than assumed.

**Tech Stack:** React 19, `@gisik-nokma/ui`'s `Select` (already built, already exported), Vitest + Testing Library + `userEvent`.

**Spec:** `docs/superpowers/specs/2026-09-14-shared-select-phase-2-design.md` (Phase 2 design spec — read this for the full 13-site audit, wave grouping, and per-site `searchable` classification this plan argues from). Phase 1's spec (`docs/superpowers/specs/2026-09-10-shared-select-phase-1-design.md`) and plan (`docs/superpowers/plans/2026-09-10-shared-select-phase-1.md`) are the source of the component and its established call-site conventions — read their Public API and Task 5 (Field-type migration, the closest analog: non-searchable, small fixed enum) sections if anything here is ambiguous.

## Global Constraints

- **Package manager is pnpm 9.15.0**; run workspace-scoped commands as `pnpm --filter @gisik-nokma/web <script>` (apps/web's real package name — confirmed via `apps/web/package.json`), not bare `npm`/`yarn`.
- **Never pipe a test/build run into `head` or `grep -m N`.** Use `| tail -N`, or redirect to a file and read that file, or an unbounded `grep`. This has orphaned vitest workers and crashed the machine before (see project `CLAUDE.md`).
- **No new dependency.** `Select` already exists in `@gisik-nokma/ui`, which `apps/web` already depends on (it already imports `Button`/`Card` from the same package). This wave only changes consumers.
- **This wave touches exactly 3 selects across 2 files** — `apps/web/app/w/[workspaceId]/members/page.tsx` (Channel, Role) and `apps/web/src/style-toggle.tsx` (Style). Do not touch any Wave B or Wave C site (see the Phase 2 spec's audit table) — those get their own plans later.
- **This branch (`owner/workspace-edits`) carries substantial unrelated in-flight foreign work from another owner session.** Every task stages by exact path only — never `git add -A`/`git add .` — and runs `git status` immediately before every commit to confirm only the intended files are staged.
- **`test-cases/13-deployment-dogfooding.md` is controller-allocated for a separate, parallel Plan-series lane pipeline.** Task 2 touches 3 case IDs that already live in this file (13.344–13.346) — edit only their existing prose (the same kind of retitle they already went through once, for the SegmentedControl→native-`<select>` change), never allocate a new case ID in this file, and re-read the surrounding section immediately before editing in case a parallel session has moved these cases since this plan was written.
- **A pre-existing, out-of-scope documentation gap, disclosed here so it isn't mistaken for something this plan broke:** `members-page.test.tsx`'s own docblock claims "Cases 3.129–3.136," and the tests cite `3.131`/`3.132`/`3.133` inline, but none of those IDs currently exist in `test-cases/03-foundation-ledger.md` — confirmed via grep before writing this plan. `pnpm check:citations` failing on these pre-existing, uncited IDs is expected and not this wave's to fix (same shape of gap Phase 1's own Task 11 disclosed for a different file). Do not attempt to backfill the full 3.129–3.136 range — that's a different, larger task than migrating 2 selects.
- Every task ends with `pnpm --filter @gisik-nokma/web test` and `pnpm --filter @gisik-nokma/web typecheck` both passing before commit.

---

### Task 1: Migrate `members/page.tsx`'s Channel and Role selects

**Files:**
- Modify: `apps/web/app/w/[workspaceId]/members/page.tsx:5` (import), `:286-295` (Channel select), `:297-303` (Role select)
- Test: `apps/web/test/members-page.test.tsx:1` (import), `:143-148` (role-options enumeration), `:174` (selectOptions call)

**Interfaces:**
- Consumes: `Select` from `@gisik-nokma/ui` (already exported: `export { Select, type SelectOption, type SelectProps } from './select/select.js';` in `packages/ui/src/index.ts`).
- Produces: nothing new for later tasks — this is a leaf consumer change.

- [ ] **Step 1: Read the current file for exact context**

Confirm the current shape before editing (line numbers can drift):

```bash
sed -n '280,305p' "apps/web/app/w/[workspaceId]/members/page.tsx"
```

Expect to see (this is what you're replacing):

```tsx
      <label htmlFor="gn-invite-channel">Channel</label>
      <select
        id="gn-invite-channel"
        value={channel}
        onChange={(event) => setChannel(event.target.value)}
      >
        <option value="email">email</option>
        <option value="sms">sms</option>
        <option value="whatsapp">whatsapp</option>
      </select>

      <label htmlFor="gn-invite-role">Role</label>
      <select id="gn-invite-role" value={role} onChange={(event) => setRole(event.target.value)}>
        {/* No `owner`. The door refuses it and a picker offering it would lie. */}
        <option value="admin">admin</option>
        <option value="member">member</option>
        <option value="guest">guest</option>
      </select>
```

- [ ] **Step 2: Confirm no CSS depends on the dropped element ids**

Already checked before writing this plan (`grep -rn "gn-invite-channel\|gn-invite-role" apps/web/app/globals.css packages/ui/src/ui.css` — zero matches), but re-run it yourself before deleting the `id`/`htmlFor` pairing, since this checkout has foreign in-flight CSS changes that could have added a new dependency since this plan was written:

```bash
grep -rn "gn-invite-channel\|gn-invite-role" apps/web/app/globals.css packages/ui/src/ui.css
```

Expected: no matches. If you find one, stop and report — do not silently drop styling that's actually in use.

- [ ] **Step 3: Update the failing tests first**

In `apps/web/test/members-page.test.tsx`, add `within` to the existing `@testing-library/react` import:

```tsx
import { render, screen, waitFor, within } from '@testing-library/react';
```

Replace the Role-options enumeration test (currently reads native `<select>.options`, which won't exist post-migration):

```tsx
// BEFORE (currently at line ~143-148):
  it('offers admin, member and guest — and never owner', async () => {
    mount({ listPending: async () => [] });
    const role = await screen.findByLabelText('Role');
    expect(
      [...(role as HTMLSelectElement).options].map((option) => option.value),
    ).toEqual(['admin', 'member', 'guest']);
  });
```

```tsx
// AFTER:
  it('offers admin, member and guest — and never owner', async () => {
    const user = userEvent.setup();
    mount({ listPending: async () => [] });
    await user.click(await screen.findByRole('button', { name: /Role/ }));
    const listbox = await screen.findByRole('listbox');
    expect(within(listbox).getAllByRole('option').map((option) => option.textContent)).toEqual([
      'admin',
      'member',
      'guest',
    ]);
  });
```

Replace the `selectOptions` call in the guest-projects test (currently at line ~174):

```tsx
// BEFORE:
    await user.selectOptions(screen.getByLabelText('Role'), 'guest');
```

```tsx
// AFTER:
    await user.click(screen.getByRole('button', { name: /Role/ }));
    await user.click(within(await screen.findByRole('listbox')).getByRole('option', { name: 'guest' }));
```

- [ ] **Step 4: Run the tests and confirm they fail for the right reason**

```bash
export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH"
cd /Users/kiro/my_projects/gisik-nokma
pnpm --filter @gisik-nokma/web exec vitest run members-page.test.tsx > /tmp/wave-a-task1-red.log 2>&1
tail -60 /tmp/wave-a-task1-red.log
```

Expected: both rewritten tests FAIL — the app still renders native `<select>` elements, so `screen.getByRole('button', { name: /Role/ })` won't find anything (there's no button yet, only a `combobox`/`select` role element). This is the correct RED: the tests already describe the post-migration behavior, the code hasn't changed yet.

- [ ] **Step 5: Migrate the component**

In `apps/web/app/w/[workspaceId]/members/page.tsx`, add the import (alongside the existing `Button, Card` import on line 5):

```tsx
import { Button, Card, Select } from '@gisik-nokma/ui';
```

Replace the Channel and Role `<select>` blocks (the exact region shown in Step 1) with:

```tsx
      <label className="gn-invite-channel">
        <span>Channel</span>
        <Select
          options={[
            { value: 'email', label: 'email' },
            { value: 'sms', label: 'sms' },
            { value: 'whatsapp', label: 'whatsapp' },
          ]}
          value={channel}
          onChange={setChannel}
          aria-label="Channel"
        />
      </label>

      <label className="gn-invite-role">
        <span>Role</span>
        {/* No `owner`. The door refuses it and a picker offering it would lie. */}
        <Select
          options={[
            { value: 'admin', label: 'admin' },
            { value: 'member', label: 'member' },
            { value: 'guest', label: 'guest' },
          ]}
          value={role}
          onChange={setRole}
          aria-label="Role"
        />
      </label>
```

`setChannel`/`setRole` are the existing `useState` setters (`const [channel, setChannel] = useState('email')` at line 239, `const [role, setRole] = useState('member')` at line 240) — `Select`'s `onChange` for a single-select is `(value: string) => void`, the exact same shape as the native `<select>`'s setter was already being called with (`(event) => setChannel(event.target.value)` collapses to just `setChannel` once there's no event to unwrap), so no other state-management change is needed.

- [ ] **Step 6: Run the tests and confirm they pass**

```bash
pnpm --filter @gisik-nokma/web exec vitest run members-page.test.tsx > /tmp/wave-a-task1-green.log 2>&1
tail -60 /tmp/wave-a-task1-green.log
```

Expected: all tests in the file pass, including the two rewritten ones and every pre-existing test that touches the mint form (e.g. `3.133`'s guest/projects test, which depends on the Role select still working correctly end-to-end).

- [ ] **Step 7: Full package test + typecheck**

```bash
pnpm --filter @gisik-nokma/web test > /tmp/wave-a-task1-full-test.log 2>&1
tail -30 /tmp/wave-a-task1-full-test.log
pnpm --filter @gisik-nokma/web typecheck > /tmp/wave-a-task1-typecheck.log 2>&1
tail -30 /tmp/wave-a-task1-typecheck.log
```

Expected: full `apps/web` suite green, typecheck clean. If `pnpm check:citations` is part of the typecheck/test pipeline and flags the pre-existing `3.131`/`3.132`/`3.133` gap described in Global Constraints, that is expected and not a regression this task introduced — confirm by checking that the flagged ids were already uncited before your change (they were, per this plan's own pre-dispatch grep) rather than assuming your change is the cause.

- [ ] **Step 8: `git status` and commit**

```bash
git status --short
```

Confirm only these two files show as modified:
- `apps/web/app/w/[workspaceId]/members/page.tsx`
- `apps/web/test/members-page.test.tsx`

If anything else appears modified, stop and investigate before staging — this checkout carries unrelated foreign work that must never be swept into this commit.

```bash
git add "apps/web/app/w/[workspaceId]/members/page.tsx" apps/web/test/members-page.test.tsx
git commit -m "$(cat <<'EOF'
Migrate members page's Channel and Role selects to the shared Select

Phase 2 Wave A, site 1/3. Both are fixed 3-option enums with no
unset state — a direct swap of the existing controlled value/onChange
pattern, no state-shape change. Role's option-enumeration and
guest-select tests rewritten to click-and-pick.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Migrate `style-toggle.tsx`'s Style select

**Files:**
- Modify: `apps/web/src/style-toggle.tsx` (whole file is 67 lines — read it in full before editing, its docblock has load-bearing context)
- Test: `apps/web/test/style-toggle.test.tsx` (whole file, 57 lines)
- Modify: `apps/web/e2e-stack/viewport.spec.ts` (comment block ~line 585-600 — extend, do not delete, the existing SegmentedControl→`<select>` migration history)
- Modify: `test-cases/13-deployment-dogfooding.md` (cases 13.344–13.346 — prose only, no new case ID; see Global Constraints)
- Modify: `Features.md` (whichever existing bullet describes the Style control — same change set per workspace convention)

**Interfaces:**
- Consumes: `Select`, `type SelectOption` from `@gisik-nokma/ui` (same as Task 1); `type StyleName` from `@gisik-nokma/ui` (already imported in this file).
- Produces: nothing later tasks depend on.

**Why this site is riskier than its 3-option-enum shape suggests:** this same control has already changed identity twice (SegmentedControl → native `<select>`, moved off `AppNav` onto `/account`) with a documented accessible-role impact each time. This is a third identity change (native `<select>` → the shared `Select`'s own react-aria combobox/listbox role semantics). Three other files carry that history and need checking — this task's steps cover all of them; do not skip Step 2's investigation and jump straight to the code change.

- [ ] **Step 1: Read the current file and test in full**

```bash
cat apps/web/src/style-toggle.tsx
cat apps/web/test/style-toggle.test.tsx
```

Current `style-toggle.tsx` (67 lines):

```tsx
'use client';

import { useEffect, useState } from 'react';
import type { StyleName } from '@gisik-nokma/ui';

const OPTIONS: ReadonlyArray<{ value: StyleName; label: string }> = [
  { value: 'hig', label: 'HIG' },
  { value: 'minimal', label: 'Minimal' },
  { value: 'neo', label: 'Neu' },
];

function isStyleName(value: string): value is StyleName {
  return value === 'hig' || value === 'minimal' || value === 'neo';
}

/**
 * Style is a runtime axis parallel to theme, but with no "system" state:
 * `neo` is the default (case 13.345), not the absence of a choice — every
 * value, `hig` included, is only ever reached by an explicit stored pick.
 * `layout.tsx`'s `styleInitScript` applies the same default before first
 * paint; this component's initial state matches it on mount so the first
 * render agrees with what already painted, the same discipline `ThemeToggle`
 * follows for its own pre-paint script.
 *
 * Moved off `AppNav` onto `/account` (owner request) and rendered as a
 * `<select>`, not `SegmentedControl` — the same `<label htmlFor>` + `<select>`
 * pair `members/page.tsx` already uses for its invite form, rather than a new
 * control convention for one field. Living on a settled preferences page
 * rather than the persistent nav is what makes a dropdown the right shape
 * here: it no longer needs to announce all three options at a glance on
 * every screen, only let a visiting reader change one.
 */
export function StyleToggle() {
  const [style, setStyle] = useState<StyleName>('neo');

  useEffect(() => {
    const stored = localStorage.getItem('gn-style');
    if (stored === 'hig' || stored === 'minimal' || stored === 'neo') setStyle(stored);
  }, []);

  const apply = (next: StyleName) => {
    setStyle(next);
    document.documentElement.dataset['style'] = next;
    localStorage.setItem('gn-style', next);
  };

  return (
    <p>
      <label htmlFor="gn-style">Style</label>{' '}
      <select
        id="gn-style"
        value={style}
        onChange={(event) => {
          const { value } = event.target;
          if (isStyleName(value)) apply(value);
        }}
      >
        {OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </p>
  );
}
```

- [ ] **Step 2: Investigate the 3 cross-file references before writing any code**

**2a. `apps/web/e2e-stack/accessible-names-baseline.json`:**

```bash
cat apps/web/e2e-stack/accessible-names-baseline.json
```

Confirm it reads `{}` (fully empty — no recorded baseline for any route right now, from an unrelated in-flight session's reset). This means your migration cannot break a currently-passing baseline check — there is nothing there to break. Do not attempt to populate or fix this file; re-recording it is the responsibility of whoever is tracking that separate gap. Just confirm it's still empty (if it's not, something changed since this plan was written — stop and report rather than guessing what a non-empty baseline now expects).

**2b. `apps/web/e2e-stack/viewport.spec.ts`'s migration-history comment:**

```bash
grep -n "StyleToggle" -B3 -A15 apps/web/e2e-stack/viewport.spec.ts
```

Read the full comment block (around line 585-600). It documents the SegmentedControl→`<select>` conversion's exact accessible-role impact (lost `role=tablist`, three `role=tab`, `aria-label="Style"` on the old container, three `aria-selected`). Your migration is a further change in that same lineage: native `<select>` (`role="combobox"` implicitly, or explicitly per jsdom/Testing Library's mapping) → the shared `Select`'s own role shape (non-searchable single-select renders `role="button"` for its trigger — confirmed in Phase 1's own `select.test.tsx`, e.g. `screen.getByRole('button', { name: /Fruit/ })`). Append a dated continuation to the existing comment (do not delete the prior entries — this is a running history) noting: the trigger's role changes from `combobox`/native-select semantics to `button`; clicking it opens a portal-rendered `listbox` with 3 `option` role elements (matching `Select`'s general shape, same as every other migrated site); no `aria-selected` triad exists in this shape (selection is conveyed via a checkmark + the trigger's own visible label text, not `aria-selected` on sibling elements). Determine whether any live assertion in this spec file's own test bodies (not just the comment) currently depends on the old `role=combobox` shape — if so, update it to match; if the comment is purely historical documentation with no live assertion tied to it, say so explicitly in your commit message rather than leaving it ambiguous.

**2c. `apps/web/test/project-calendar-timeline.test.tsx`:**

```bash
grep -n "StyleToggle" -B3 -A5 apps/web/test/project-calendar-timeline.test.tsx
```

Confirm this is prose-only (a comment noting the reference is already stale as of the `AppNav`→`/account` move, per a grep run before this plan was written) with no live assertion depending on `StyleToggle`'s current shape. If that holds, no code change needed here — note it as "checked, no action needed" in your report. If you find a live assertion instead, treat it the same way as 2b.

**2d. `packages/ui/src/tokens.ts`:**

```bash
grep -n "StyleToggle" -B3 -A3 packages/ui/src/tokens.ts
```

Confirm this is a documentation comment only (mentioning `StyleToggle` alongside `ThemeToggle` as callers of `document.documentElement`'s dataset, not an actual type/value coupling). If confirmed, no change needed — this file is outside `apps/web` and outside this task's file list regardless.

- [ ] **Step 3: Update the failing tests first**

Rewrite `apps/web/test/style-toggle.test.tsx` in full:

```tsx
import { render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { StyleToggle } from '../src/style-toggle.js';

beforeEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset['style'];
});

async function pickStyle(user: ReturnType<typeof userEvent.setup>, label: string) {
  await user.click(screen.getByRole('button', { name: /Style/ }));
  const listbox = await screen.findByRole('listbox');
  await user.click(within(listbox).getByRole('option', { name: label }));
}

describe('StyleToggle — neo is the default, not the absence of a choice', () => {
  /**
   * 13.344 (retitled again: the shared `Select` component, not a plain
   * `<select>`, since Phase 2 Wave A migrated this control onto it — the
   * `<select>` itself was already a retitle from `SegmentedControl` when the
   * owner moved this off `AppNav` onto `/account`) — one labelled control
   * with all three styles as options, and `data-style` set on the theme
   * element when a choice is made. Mutation: drop the field's label → RED.
   */
  it('renders one labelled control with all three styles, and sets data-style on change', async () => {
    const user = userEvent.setup();
    render(<StyleToggle />);
    const trigger = screen.getByRole('button', { name: /Style/ });
    expect(trigger).toHaveTextContent('Neu');

    await user.click(trigger);
    const listbox = await screen.findByRole('listbox');
    const options = within(listbox).getAllByRole('option').map((option) => option.textContent);
    expect(options).toEqual(['HIG', 'Minimal', 'Neu']);

    await user.click(within(listbox).getByRole('option', { name: 'HIG' }));
    expect(document.documentElement.dataset['style']).toBe('hig');
    expect(screen.getByRole('button', { name: /Style/ })).toHaveTextContent('HIG');
  });

  /**
   * 13.345 — with nothing stored, the applied `data-style` is `neo`. Mutation:
   * default the component's initial state to `hig` → RED.
   */
  it('defaults to neo when nothing is stored', () => {
    render(<StyleToggle />);
    expect(screen.getByRole('button', { name: /Style/ })).toHaveTextContent('Neu');
  });

  /**
   * 13.346 — the stored style survives a reload, asserted the same way
   * `ThemeToggle`'s persistence is: a stored value restores on mount rather
   * than the component starting from its own default and drifting from what
   * `layout.tsx`'s pre-paint script already applied. Mutation: stop writing
   * `localStorage` in `apply` → RED (the second render never sees the choice).
   */
  it('a stored choice is restored on mount', async () => {
    localStorage.setItem('gn-style', 'minimal');
    render(<StyleToggle />);
    expect(await screen.findByRole('button', { name: /Style/ })).toHaveTextContent('Minimal');
  });

  it('persists an explicit choice for the next mount to restore', async () => {
    const user = userEvent.setup();
    render(<StyleToggle />);
    await pickStyle(user, 'Minimal');
    expect(localStorage.getItem('gn-style')).toBe('minimal');
  });
});
```

- [ ] **Step 4: Run the tests and confirm they fail for the right reason**

```bash
pnpm --filter @gisik-nokma/web exec vitest run style-toggle.test.tsx > /tmp/wave-a-task2-red.log 2>&1
tail -60 /tmp/wave-a-task2-red.log
```

Expected: all 4 tests FAIL — `screen.getByRole('button', { name: /Style/ })` finds nothing yet, since the component still renders a native `<select>`.

- [ ] **Step 5: Migrate the component**

Replace `apps/web/src/style-toggle.tsx` in full:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { Select, type StyleName } from '@gisik-nokma/ui';

const OPTIONS: ReadonlyArray<{ value: StyleName; label: string }> = [
  { value: 'hig', label: 'HIG' },
  { value: 'minimal', label: 'Minimal' },
  { value: 'neo', label: 'Neu' },
];

function isStyleName(value: string): value is StyleName {
  return value === 'hig' || value === 'minimal' || value === 'neo';
}

/**
 * Style is a runtime axis parallel to theme, but with no "system" state:
 * `neo` is the default (case 13.345), not the absence of a choice — every
 * value, `hig` included, is only ever reached by an explicit stored pick.
 * `layout.tsx`'s `styleInitScript` applies the same default before first
 * paint; this component's initial state matches it on mount so the first
 * render agrees with what already painted, the same discipline `ThemeToggle`
 * follows for its own pre-paint script.
 *
 * Moved off `AppNav` onto `/account` (owner request), first rendered as a
 * plain `<select>` (the same `<label htmlFor>` + `<select>` pair
 * `members/page.tsx` used for its invite form at the time), then migrated
 * onto the shared `Select` component in Phase 2 Wave A alongside that same
 * invite form — both control families now share one component rather than
 * two independent native-`<select>` conventions.
 */
export function StyleToggle() {
  const [style, setStyle] = useState<StyleName>('neo');

  useEffect(() => {
    const stored = localStorage.getItem('gn-style');
    if (stored === 'hig' || stored === 'minimal' || stored === 'neo') setStyle(stored);
  }, []);

  const apply = (next: StyleName) => {
    setStyle(next);
    document.documentElement.dataset['style'] = next;
    localStorage.setItem('gn-style', next);
  };

  return (
    <p>
      <label>
        <span>Style</span>{' '}
        <Select
          options={OPTIONS}
          value={style}
          onChange={(value) => {
            if (isStyleName(value)) apply(value);
          }}
          aria-label="Style"
        />
      </label>
    </p>
  );
}
```

- [ ] **Step 6: Run the tests and confirm they pass**

```bash
pnpm --filter @gisik-nokma/web exec vitest run style-toggle.test.tsx > /tmp/wave-a-task2-green.log 2>&1
tail -60 /tmp/wave-a-task2-green.log
```

Expected: all 4 tests pass.

- [ ] **Step 7: Update `viewport.spec.ts`'s comment (and any live assertion) per Step 2b's findings**

Apply whatever Step 2b's investigation determined — a dated continuation of the existing comment at minimum, plus any test-body change if a live assertion depended on the old role shape.

- [ ] **Step 8: Update the 3 existing test-case entries in `test-cases/13-deployment-dogfooding.md`**

```bash
grep -n "13\.34[4-6]" test-cases/13-deployment-dogfooding.md
```

Re-read the surrounding section fully (not just the 3 matched lines) to confirm no parallel session has moved or renumbered these since this plan was written, per the Global Constraints warning. Update only the prose of 13.344, 13.345, and 13.346 to describe the new `Select`-based shape (mirroring the retitle their current prose already shows for the SegmentedControl→`<select>` change) — do not add, remove, or renumber any case ID in this file.

- [ ] **Step 9: Update `Features.md`**

Find the existing bullet describing the Style control (search for "StyleToggle" or "Style select"):

```bash
grep -n "StyleToggle\|Style select" Features.md
```

Update it to reflect the shared-`Select` migration, in the same change set, per this workspace's standing convention.

- [ ] **Step 10: Full package test + typecheck**

```bash
pnpm --filter @gisik-nokma/web test > /tmp/wave-a-task2-full-test.log 2>&1
tail -30 /tmp/wave-a-task2-full-test.log
pnpm --filter @gisik-nokma/web typecheck > /tmp/wave-a-task2-typecheck.log 2>&1
tail -30 /tmp/wave-a-task2-typecheck.log
```

- [ ] **Step 11: `git status` and commit**

```bash
git status --short
```

Confirm exactly these files show as modified (no more, no less):
- `apps/web/src/style-toggle.tsx`
- `apps/web/test/style-toggle.test.tsx`
- `apps/web/e2e-stack/viewport.spec.ts`
- `test-cases/13-deployment-dogfooding.md`
- `Features.md`

```bash
git add apps/web/src/style-toggle.tsx apps/web/test/style-toggle.test.tsx apps/web/e2e-stack/viewport.spec.ts test-cases/13-deployment-dogfooding.md Features.md
git commit -m "$(cat <<'EOF'
Migrate the Style select to the shared Select component

Phase 2 Wave A, site 2/3 (final site in this wave). Third identity
change for this control (SegmentedControl -> native <select> ->
shared Select) -- migration history extended, not replaced, in
viewport.spec.ts's comment and test-cases 13.344-13.346's prose.
No new case ID allocated in test-cases/13, per this plan's own
carried-forward constraint from Phase 1.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Wave A completion

After both tasks are committed and reviewed clean, Wave A is done. Per the Phase 2 spec's sequencing, Wave B's plan (the 5 `packages/app-core` workflow-builder UI sites, including the React-Flow-canvas-embedded `state-node.tsx` select) is written next, informed by whatever this wave's execution surfaced — do not draft Wave B's tasks here.
