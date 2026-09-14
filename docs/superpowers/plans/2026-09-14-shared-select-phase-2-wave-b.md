# Shared Select rollout — Phase 2 Wave B Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the 5 native `<select>` sites in `packages/app-core`'s workflow-builder UI onto the existing shared `Select` component from `@gisik-nokma/ui` — no changes to `Select` itself.

**Architecture:** All 5 sites are non-searchable. Per Wave A's corrected, verified rule (see that plan's Architecture section and its final-review fix commit `56fa563f` for the full mechanism): non-searchable `Select` consumption must **never** be wrapped in an enclosing `<label>` (it mislabels `Select`'s internally-rendered hidden native `<select>`, breaking click-on-label-text) — use a `<span>Text</span>` + `<Select>` sibling pair instead, inside whatever non-`<label>` wrapping element the site's existing layout needs (a `<div>` carrying the original `<label>`'s CSS class where one exists, matching Wave A's own `<p>`→`<div>` lesson: never a `<p>`, since `Select`'s internal hidden-select `<div>` is illegal inside one). Two structural differences from Wave A that this wave's tasks handle individually: (1) 4 of these 5 sites currently use `<option value="" disabled hidden>` as an "unset" sentinel with a plain-`string` local value — these genuinely need the `string` → `string | null` migration Phase 1's spec describes (Wave A's 3 sites never needed this; Wave B's do); (2) one site (`state-node.tsx`) is embedded in a React Flow canvas node with its own click-handling and drag-prevention requirements layered on top of the Select migration itself.

**Tech Stack:** React 19, `@gisik-nokma/ui`'s `Select` (already built, already exported), Vitest + Testing Library + `userEvent`, `@xyflow/react` (React Flow, already a dependency — Task 1 only).

**Spec:** `docs/superpowers/specs/2026-09-14-shared-select-phase-2-design.md` (Phase 2 design spec). Wave A's plan (`docs/superpowers/plans/2026-09-14-shared-select-phase-2-wave-a.md`) and its SDD ledger (`.superpowers/sdd/2026-09-14-shared-select-phase-2-wave-a/progress.md`) are the source of the corrected `<label>`-avoidance rule and its full verified mechanism — read Wave A's Architecture section before starting if anything here about the `<label>` rule is unclear, rather than re-deriving it.

## Global Constraints

- **Package manager is pnpm 9.15.0**; run workspace-scoped commands as `pnpm --filter @gisik-nokma/app-core <script>` (this wave's package — different from Wave A's `@gisik-nokma/web`).
- **Never pipe a test/build run into `head` or `grep -m N`.** Use `| tail -N`, or redirect to a file and read that file, or an unbounded `grep`.
- **No new dependency.** `Select` already exists in `@gisik-nokma/ui`, which `packages/app-core` already depends on.
- **This wave touches exactly 5 selects across 5 files** — `state-node.tsx`, `state-mapping-dialog.tsx`, `rule-editors/require-field-editor.tsx`, `rule-editors/require-different-user-editor.tsx`, `ticket-types/workflow-rebind-dialog.tsx`. Do not touch any Wave C site (see the Phase 2 spec's audit table) — those get their own plan later.
- **Never wrap a non-searchable `Select` in an enclosing `<label>`.** Per Wave A's verified finding: `Select`'s non-searchable branch renders a hidden native `<select>` (react-aria's `HiddenSelect`) with its own internal `<label>`, positioned before the visible trigger `<button>` in DOM order — an enclosing `<label>` associates with that hidden element, not the visible one. All 5 sites in this wave are non-searchable, so this rule applies to all 5 without exception. Use `<span>Text</span>` + `<Select>` as plain siblings, inside a non-`<label>` element carrying any needed layout class.
- **Never wrap a `Select` (or anything containing one) in a `<p>`.** `Select`'s hidden `<div>` (from `HiddenSelect`) is illegal inside `<p>`'s phrasing-content-only model — this caused a real SSR hydration defect in Wave A. None of Wave B's 5 sites currently use `<p>` as the direct select-wrapper (checked per-site below), but keep this in mind if any task's own investigation finds otherwise.
- **This branch (`owner/workspace-edits`) carries substantial unrelated in-flight foreign work from another owner session.** Every task stages by exact path only — never `git add -A`/`git add .` — and runs `git status` immediately before every commit.
- **New test-case entries, if any, go in `test-cases/10-workflow-builder.md`** (verify the next free number before writing: `grep -n "^\s*\* [0-9]\+\.\|10\.\d\+ —" test-cases/10-workflow-builder.md | tail -5`) — unlike Wave A's Task 2, none of this wave's existing test coverage touches the restricted `test-cases/13-deployment-dogfooding.md` file, so that caution does not apply here.
- **`Features.md` updates, if the migration changes anything Features.md currently describes about these controls' rendering** — same change set, per workspace convention (check before assuming; several of these controls may not currently have dedicated Features.md prose worth updating).
- Every task ends with `pnpm --filter @gisik-nokma/app-core test` and `pnpm --filter @gisik-nokma/app-core typecheck` both passing before commit.

---

### Task 1: Migrate `state-node.tsx`'s Category select (React Flow canvas node)

**Files:**
- Modify: `packages/app-core/src/workflow-builder/ui/state-node.tsx`
- Test: `packages/app-core/test/workflow-builder/canvas.test.tsx:67-75` (case 10.2), `:243-249` (disabled-state case, no case number)
- Modify: `apps/web/e2e/workflow-builder.spec.ts:142` (Playwright assertion, breaks on migration — not a Vitest test, cannot be run by this task's own test loop; edit it correctly by reading the surrounding context, and note in your report that a human/CI run of the e2e suite is the only way to confirm it, since this task's environment likely can't run Playwright against a live dev server)

**Interfaces:**
- Consumes: `Select` from `@gisik-nokma/ui`.
- Produces: nothing later tasks depend on.

**Why this site is different from every other site in this wave:** the select lives inside a React Flow (`@xyflow/react`) canvas node, not a plain form. Two things the current native `<select>` relies on that `Select` cannot replicate the same way:
1. `className="nodrag ..."` on the `<select>` — React Flow's own convention for telling it "don't start a node-drag gesture from a mousedown inside this element." `SelectProps` has no `className` prop (confirmed: read `packages/ui/src/select/select.tsx`'s `SelectProps` type, lines ~16-33 — only `options`/`value`/`onChange`/`searchable`/`placeholder`/`disabled`/`'aria-label'`/`multiple`/`maxSelected` exist). You cannot put `nodrag` on `Select`'s own rendered trigger directly.
2. `onClick={(mouseEvent) => mouseEvent.stopPropagation()}` on the `<select>` — prevents a click from bubbling to the parent `<div onClick={() => store.actions.select(...)}>`, which would otherwise select the whole node in the canvas whenever you just meant to open the category picker. `Select` accepts no `onClick` prop either.

**The fix for both:** wrap `<span>Category</span>` and `<Select>` in a `<div>` (not `<label>` — see Global Constraints) carrying both the `nodrag` class and an `onClick` handler that stops propagation. React Flow's drag-suppression checks the DOM ancestor chain for the `nodrag` class (via `closest()`), not only the exact mousedown target, so putting it on a wrapping `<div>` rather than directly on `Select`'s own button should work — **but this is the one claim in this task you must verify empirically, not just trust**: after migrating, manually exercise (or write a test asserting) that clicking the Select's trigger does NOT also select/drag the node. The existing sibling control in this same file (`<input type="checkbox" className="nodrag" .../>`, a few lines below) puts `nodrag` directly on the interactive element rather than a wrapping ancestor — you're deliberately deviating from that exact sibling's pattern because `Select` gives you no other option; call this out explicitly in your report rather than let it look accidental.

- [ ] **Step 1: Read the current file for exact context**

```bash
cat packages/app-core/src/workflow-builder/ui/state-node.tsx
```

Current relevant region (lines 28-44):

```tsx
      <label className="gn-state-node__category">
        <span className="gn-state-node__category-label">Category</span>
        <select
          aria-label="Category"
          className="nodrag gn-state-node__category-picker"
          disabled={!canAuthor}
          value={data.category}
          onClick={(mouseEvent) => mouseEvent.stopPropagation()}
          onChange={(changeEvent) =>
            store.actions.setStateCategory(data.stateId, changeEvent.target.value as StateNodeData['category'])
          }
        >
          <option value="open">open</option>
          <option value="active">active</option>
          <option value="terminal">terminal</option>
        </select>
      </label>
```

- [ ] **Step 2: Confirm the CSS this migration must preserve**

```bash
grep -n "gn-state-node__category\b\|gn-state-node__category-label\|gn-state-node__category-picker" packages/ui/src/ui.css
```

Expected: `.gn-state-node__category { display: flex; flex-direction: column; gap: 0.1rem; margin-top: 0.4rem; font-size: 0.8rem; color: var(--gn-text-muted); }` is real and must move to the new wrapping `<div>`. `.gn-state-node__category-label` and `.gn-state-node__category-picker` have no rules (confirmed before writing this plan) — safe to drop both classes; the second one (`gn-state-node__category-picker`) was styling the native `<select>` directly and has nothing to migrate onto `Select`, which brings its own styling.

- [ ] **Step 3: Update the failing tests first**

In `packages/app-core/test/workflow-builder/canvas.test.tsx`, the case 10.2 test (lines ~67-75) currently:

```tsx
  it('changes a state category through the node picker', async () => {
    const user = userEvent.setup();
    const store = createDraftStore(draftFromTemplate(errand));
    renderCanvas(store);
    const picker = within(screen.getByTestId('state-node-done')).getByRole('combobox', { name: 'Category' });
    await user.selectOptions(picker, 'active');
    expect(store.getState().def.states.find((state) => state.id === 'done')?.category).toBe('active');
  });
```

Replace with:

```tsx
  it('changes a state category through the node picker', async () => {
    const user = userEvent.setup();
    const store = createDraftStore(draftFromTemplate(errand));
    renderCanvas(store);
    const node = screen.getByTestId('state-node-done');
    await user.click(within(node).getByRole('button', { name: /Category/ }));
    const listbox = await screen.findByRole('listbox');
    await user.click(within(listbox).getByRole('option', { name: 'active' }));
    expect(store.getState().def.states.find((state) => state.id === 'done')?.category).toBe('active');
  });
```

(`{ name: /Category/ }` uses a regex, not an exact string — `Select`'s non-searchable trigger has a concatenated accessible name, current value + `aria-label`, a documented property of the component. An exact-string match would fail once a value is selected.)

The disabled-state test (lines ~243-249) currently:

```tsx
    expect(
      within(screen.getByTestId('state-node-done')).getByRole('combobox', { name: 'Category' }),
    ).toBeDisabled();
```

Replace `'combobox'` with `'button'` and the exact name with a regex:

```tsx
    expect(
      within(screen.getByTestId('state-node-done')).getByRole('button', { name: /Category/ }),
    ).toBeDisabled();
```

**New test to add** (this wave's canvas-embedding-specific behavior, not covered by any existing case): assert that clicking the Select trigger does not also select the node. Add immediately after the rewritten case 10.2 test:

```tsx
  it('clicking the category picker does not also select the node', async () => {
    const user = userEvent.setup();
    const store = createDraftStore(draftFromTemplate(errand));
    renderCanvas(store);
    const node = screen.getByTestId('state-node-done');
    await user.click(within(node).getByRole('button', { name: /Category/ }));
    expect(store.getState().selection).toEqual({ kind: 'none' });
  });
```

(Confirmed before writing this plan: `draft-store.ts` initializes `selection: { kind: 'none' }` — both `createDraftStore`'s own initial state and the `select` action's later resets use this exact shape, never `null`. The point of the test is "the click that opened the picker did not ALSO fire `store.actions.select(...)` for this node," which would have set `selection: { kind: 'state', stateId: 'done' }` — `toEqual({ kind: 'none' })` asserts the negative directly rather than via `.not.toEqual(...)` against the positive shape, since "still at rest" is the actual claim being made.)

- [ ] **Step 4: Run the tests and confirm they fail for the right reason**

```bash
export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH"
cd /Users/kiro/my_projects/gisik-nokma
pnpm --filter @gisik-nokma/app-core exec vitest run canvas.test.tsx > /tmp/wave-b-task1-red.log 2>&1
tail -80 /tmp/wave-b-task1-red.log
```

Expected: the rewritten and new tests fail — the app still renders a native `<select>`, so `getByRole('button', { name: /Category/ })` finds nothing.

- [ ] **Step 5: Migrate the component**

Add the import (alongside the existing `@xyflow/react`/local imports):

```tsx
import { Select } from '@gisik-nokma/ui';
```

Replace the region from Step 1 with:

```tsx
      <div
        className="nodrag gn-state-node__category"
        onClick={(mouseEvent) => mouseEvent.stopPropagation()}
      >
        <span>Category</span>
        <Select
          options={[
            { value: 'open', label: 'open' },
            { value: 'active', label: 'active' },
            { value: 'terminal', label: 'terminal' },
          ]}
          value={data.category}
          onChange={(next) => store.actions.setStateCategory(data.stateId, next as StateNodeData['category'])}
          disabled={!canAuthor}
          aria-label="Category"
        />
      </div>
```

`data.category` is always a valid enum member (`open`/`active`/`terminal`) from mount — no "unset" state exists here, so this site does NOT need the `string` → `string | null` migration (unlike 4 of this wave's other sites).

- [ ] **Step 6: Run the tests and confirm they pass**

```bash
pnpm --filter @gisik-nokma/app-core exec vitest run canvas.test.tsx > /tmp/wave-b-task1-green.log 2>&1
tail -80 /tmp/wave-b-task1-green.log
```

Expected: all tests pass, including the new node-selection test — this is your empirical confirmation that a wrapping-`<div>` `nodrag` class actually suppresses React Flow's drag gesture the same way the sibling checkbox's direct-element `nodrag` class does. If this test fails in a way that suggests `nodrag` on a wrapper doesn't work (e.g. the node's `selected` state changes, or — check for this too — the node visually appears to have been dragged in a fuller integration test if one exists), do not force a workaround blindly: report it as a real blocker, since it would mean this migration needs a different mechanism entirely (e.g. checking whether `Select` could be extended with a `className` passthrough — that's a `packages/ui` change, out of this task's own scope, and would need a ruling).

- [ ] **Step 7: Fix the Playwright e2e assertion**

```bash
grep -n "Category\|combobox" apps/web/e2e/workflow-builder.spec.ts
sed -n '130,150p' apps/web/e2e/workflow-builder.spec.ts
```

Read enough surrounding context to understand what this assertion is checking (confirmed before writing this plan: line 142 reads `.getByRole('combobox', { name: 'Category' })`). Update it to `.getByRole('button', { name: 'Category' })` (Playwright's `getByRole` accepts an exact string or a regex the same way Testing Library does — check whether this specific assertion needs the same "accessible name is concatenated" treatment as the Vitest tests above; if the surrounding code immediately selects a specific value and then re-queries, it may need the same regex treatment). This file cannot be run by this task (it needs a live dev server and browser, which this task's environment likely doesn't have) — read the surrounding test carefully enough to make a well-reasoned edit, and say explicitly in your report that this specific file's correctness is NOT verified by this task's own test run and needs a real Playwright run (CI or a human) to confirm.

- [ ] **Step 8: Full package test + typecheck**

```bash
pnpm --filter @gisik-nokma/app-core test > /tmp/wave-b-task1-full-test.log 2>&1
tail -40 /tmp/wave-b-task1-full-test.log
pnpm --filter @gisik-nokma/app-core typecheck > /tmp/wave-b-task1-typecheck.log 2>&1
tail -40 /tmp/wave-b-task1-typecheck.log
```

This task also edits a file in `apps/web` (the Playwright spec, Step 7) — that package's Vitest suite won't exercise a `.spec.ts` file at all, but its typecheck will still parse it, so run that too:

```bash
pnpm --filter @gisik-nokma/web typecheck > /tmp/wave-b-task1-web-typecheck.log 2>&1
tail -40 /tmp/wave-b-task1-web-typecheck.log
```

- [ ] **Step 9: `git status` and commit**

```bash
git status --short
```

Confirm exactly these 3 files show as modified:
- `packages/app-core/src/workflow-builder/ui/state-node.tsx`
- `packages/app-core/test/workflow-builder/canvas.test.tsx`
- `apps/web/e2e/workflow-builder.spec.ts`

```bash
git add packages/app-core/src/workflow-builder/ui/state-node.tsx packages/app-core/test/workflow-builder/canvas.test.tsx apps/web/e2e/workflow-builder.spec.ts
git commit -m "$(cat <<'EOF'
Migrate the canvas state-node Category select to the shared Select

Phase 2 Wave B, site 1/5. Only canvas-embedded site in this wave:
Select has no className/onClick passthrough, so nodrag and
click-stopPropagation move from the native <select> onto a wrapping
<div> (verified empirically that a wrapping-element nodrag class
still suppresses React Flow's drag gesture, via a new test). Fixed
the corresponding Playwright e2e assertion (role changed
combobox->button) -- unverified by this task's own test run, needs
a real Playwright pass to confirm.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Migrate the rule-editor selects (`require-field-editor.tsx`, `require-different-user-editor.tsx`)

**Files:**
- Modify: `packages/app-core/src/workflow-builder/ui/rule-editors/require-field-editor.tsx`
- Modify: `packages/app-core/src/workflow-builder/ui/rule-editors/require-different-user-editor.tsx`
- Test: `packages/app-core/test/workflow-builder/rule-editors.test.tsx:112-130` (case 10.13), `:141-159` (case 10.14), `:161-175` (case 10.15), `:177-192` (case 10.16)

**Interfaces:**
- Consumes: `Select` from `@gisik-nokma/ui`.
- Produces: nothing later tasks depend on.

**Why these two are grouped:** same directory, same test file, nearly identical shape (a single non-searchable select per rendered instance, each instance authoring one rule), both genuinely small. Neither has any layout CSS on its wrapping `<label>` (confirmed before writing this plan — `grep -n "\.require-field-editor\|\.require-different-user-editor" packages/ui/src/ui.css` returns nothing), so dropping the `<label>` here needs no CSS migration, unlike this wave's other 3 sites.

**Both sites need the `string` → `string | null` migration.** Each currently computes `value={known ? X : ''}` and conditionally renders `<option value="" disabled hidden>` only when `!known`. `Select`'s single-select `value` is `string | null` with a `placeholder` shown whenever `value` doesn't match any option — this replaces the conditional placeholder `<option>` entirely; you don't need to conditionally decide whether to render a placeholder option, `Select` does that automatically whenever `value` is `null` or doesn't match any of `options`.

- [ ] **Step 1: Read both current files for exact context**

```bash
cat packages/app-core/src/workflow-builder/ui/rule-editors/require-field-editor.tsx
cat packages/app-core/src/workflow-builder/ui/rule-editors/require-different-user-editor.tsx
```

`require-field-editor.tsx`, current relevant region:

```tsx
      <label>
        <span>Field</span>
        <select
          aria-label="Field"
          value={known ? props.rule.field : ''}
          onChange={(changeEvent) =>
            store.actions.updateRule(props.transitionIndex, props.ruleIndex, {
              kind: 'require-field',
              field: changeEvent.target.value,
            })
          }
        >
          {known ? null : <option value="" disabled hidden></option>}
          {choices.map((choice) => (
            <option key={choice.id} value={choice.id}>
              {choice.source === 'Built-in' ? choice.name : `${choice.name} (${choice.source})`}
            </option>
          ))}
        </select>
      </label>
```

`require-different-user-editor.tsx`, current relevant region:

```tsx
      <label>
        <span>Earlier move</span>
        <select
          aria-label="Earlier move"
          value={known ? target : ''}
          onChange={(changeEvent) =>
            store.actions.updateRule(props.transitionIndex, props.ruleIndex, {
              kind: 'require-different-user',
              thanActorOf: { to: changeEvent.target.value },
            })
          }
        >
          {known ? null : <option value="" disabled hidden></option>}
          {targetIds.map((stateId) => (
            <option key={stateId} value={stateId}>
              {`the move to "${summaryCtx.stateName(stateId)}"`}
            </option>
          ))}
        </select>
      </label>
```

- [ ] **Step 2: Update the failing tests first**

In `packages/app-core/test/workflow-builder/rule-editors.test.tsx`, four tests need changes (cases 10.13-10.16, in two `describe` blocks). Read each one's exact current body first — shown below in full, not summarized — since a query change misapplied to the wrong line breaks a passing assertion.

**Case 10.13** (`describe('RequireFieldEditor', ...)`, the `'offers built-ins plus the bound types fields, and picks into the rule'` test):

```tsx
// BEFORE:
    const picker = screen.getByRole('combobox', { name: 'Field' });
    const optionLabels = within(picker)
      .getAllByRole('option')
      .map((option) => option.textContent);
    expect(optionLabels).toEqual(['Title', 'Description', 'Due date', 'Start date', 'Counterparty (Errand)']);
    await user.selectOptions(picker, 'counterparty');
```

```tsx
// AFTER:
    const picker = screen.getByRole('button', { name: /Field/ });
    await user.click(picker);
    const listbox = await screen.findByRole('listbox');
    const optionLabels = within(listbox)
      .getAllByRole('option')
      .map((option) => option.textContent);
    expect(optionLabels).toEqual(['Title', 'Description', 'Due date', 'Start date', 'Counterparty (Errand)']);
    await user.click(within(listbox).getByRole('option', { name: 'Counterparty (Errand)' }));
```

(A native `<select>`'s `<option>` children exist in the DOM even while closed, which is why the BEFORE code could read `picker`'s children directly; `Select`'s options only render once the panel is open, so the enumeration has to move after the click, scoped to the opened `listbox`.) Everything after this block in the same test (the `store.getState()...` assertion and the "absent half" warning-text check) is unchanged — leave it exactly as it is.

**Case 10.14** (`describe('RequireFieldEditor', ...)`, the `'warns when the rule names a field no bound type carries'` test):

```tsx
// BEFORE:
    expect(
      screen.getByText('This field is not on any ticket type bound to this workflow.'),
    ).toBeInTheDocument();
    // The placeholder option is what keeps the picker from *displaying* a field
    // the rule does not name. Without it the select falls back to its first
    // option and shows "Title" while the rule still requires 'ghost-field' —
    // the exact misrepresentation design decision 3 exists to prevent.
    expect(screen.getByRole('combobox', { name: 'Field' })).toHaveValue('');
```

```tsx
// AFTER:
    expect(
      screen.getByText('This field is not on any ticket type bound to this workflow.'),
    ).toBeInTheDocument();
    // The placeholder is what keeps the trigger from *displaying* a field the
    // rule does not name. Without Select falling back to its placeholder text
    // when `value` matches nothing, the trigger would show "Title" while the
    // rule still requires 'ghost-field' — the exact misrepresentation design
    // decision 3 exists to prevent.
    expect(screen.getByRole('button', { name: /Field/ })).toHaveTextContent('Select…');
```

(`toHaveValue('')` only works on a real form control like `<input>`/`<select>`; `Select`'s non-searchable trigger is a `<button>`, so the check becomes "does the trigger show the placeholder text" instead of "is its value empty." `'Select…'` is `Select`'s own default placeholder — confirmed by reading `packages/ui/src/select/select.tsx`'s `NonSearchableSelect`, `const { placeholder = 'Select…', ... } = props;` — this component doesn't pass an explicit `placeholder` prop, so the default applies. If you do pass an explicit placeholder in Step 4 below, come back and match this assertion to whatever you chose instead — don't leave `'Select…'` hardcoded here against a different literal placeholder.)

**Case 10.15** (`describe('RequireDifferentUserEditor', ...)`, the `'offers only states some transition points at, naming the move'` test):

```tsx
// BEFORE:
    const picker = screen.getByRole('combobox', { name: 'Earlier move' });
    const optionLabels = within(picker)
      .getAllByRole('option')
      .map((option) => option.textContent);
    expect(optionLabels).toEqual(['the move to "Doing"', 'the move to "To do"', 'the move to "Done"']);
    await user.selectOptions(picker, 'done');
```

```tsx
// AFTER:
    const picker = screen.getByRole('button', { name: /Earlier move/ });
    await user.click(picker);
    const listbox = await screen.findByRole('listbox');
    const optionLabels = within(listbox)
      .getAllByRole('option')
      .map((option) => option.textContent);
    expect(optionLabels).toEqual(['the move to "Doing"', 'the move to "To do"', 'the move to "Done"']);
    await user.click(within(listbox).getByRole('option', { name: 'the move to "Done"' }));
```

Everything after this block (the `store.getState()...` assertion and the vacuous-case absent-check) is unchanged.

**Case 10.16** (`'notes the vacuous case when the rule watches the start state'`): reads `screen.getByText(...)` only — never queries the trigger's role or value at all. **No change needed** for this test; confirm by reading it (it's a short, synchronous `it(...)`, no `userEvent` import used in its body) rather than skipping it on the assumption stated here.

- [ ] **Step 3: Run the tests and confirm they fail for the right reason**

```bash
pnpm --filter @gisik-nokma/app-core exec vitest run rule-editors.test.tsx > /tmp/wave-b-task2-red.log 2>&1
tail -100 /tmp/wave-b-task2-red.log
```

- [ ] **Step 4: Migrate both components**

`require-field-editor.tsx` — add `import { Select } from '@gisik-nokma/ui';`, replace the region from Step 1 with:

```tsx
      <span>Field</span>
      <Select
        options={choices.map((choice) => ({
          value: choice.id,
          label: choice.source === 'Built-in' ? choice.name : `${choice.name} (${choice.source})`,
        }))}
        value={known ? props.rule.field : null}
        onChange={(next) =>
          store.actions.updateRule(props.transitionIndex, props.ruleIndex, {
            kind: 'require-field',
            field: next,
          })
        }
        aria-label="Field"
      />
```

Note: `<span>Field</span>` and `<Select>` are now direct children of `<div className="require-field-editor">` (the enclosing `<label>` is gone entirely — there was no CSS class on it to preserve).

`require-different-user-editor.tsx` — same treatment:

```tsx
      <span>Earlier move</span>
      <Select
        options={targetIds.map((stateId) => ({
          value: stateId,
          label: `the move to "${summaryCtx.stateName(stateId)}"`,
        }))}
        value={known ? target : null}
        onChange={(next) =>
          store.actions.updateRule(props.transitionIndex, props.ruleIndex, {
            kind: 'require-different-user',
            thanActorOf: { to: next },
          })
        }
        aria-label="Earlier move"
      />
```

- [ ] **Step 5: Run the tests and confirm they pass**

```bash
pnpm --filter @gisik-nokma/app-core exec vitest run rule-editors.test.tsx > /tmp/wave-b-task2-green.log 2>&1
tail -100 /tmp/wave-b-task2-green.log
```

- [ ] **Step 6: Full package test + typecheck**

```bash
pnpm --filter @gisik-nokma/app-core test > /tmp/wave-b-task2-full-test.log 2>&1
tail -40 /tmp/wave-b-task2-full-test.log
pnpm --filter @gisik-nokma/app-core typecheck > /tmp/wave-b-task2-typecheck.log 2>&1
tail -40 /tmp/wave-b-task2-typecheck.log
```

- [ ] **Step 7: `git status` and commit**

```bash
git status --short
```

Confirm exactly these 3 files:
- `packages/app-core/src/workflow-builder/ui/rule-editors/require-field-editor.tsx`
- `packages/app-core/src/workflow-builder/ui/rule-editors/require-different-user-editor.tsx`
- `packages/app-core/test/workflow-builder/rule-editors.test.tsx`

```bash
git add packages/app-core/src/workflow-builder/ui/rule-editors/require-field-editor.tsx packages/app-core/src/workflow-builder/ui/rule-editors/require-different-user-editor.tsx packages/app-core/test/workflow-builder/rule-editors.test.tsx
git commit -m "$(cat <<'EOF'
Migrate the rule-editor selects to the shared Select

Phase 2 Wave B, sites 2-3/5. Both require-field-editor and
require-different-user-editor genuinely needed the string -> string|null
migration (an 'unknown value' sentinel via '' + a conditional hidden
option) -- Select's own value:null + automatic placeholder replaces
both mechanisms. Grouped: same directory, same test file, no CSS to
migrate on either (their wrapping <label> was unstyled).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Migrate `state-mapping-dialog.tsx`'s target-state select

**Files:**
- Modify: `packages/app-core/src/workflow-builder/ui/state-mapping-dialog.tsx`
- Test: `packages/app-core/test/workflow-builder/publish.test.tsx` (case 10.32 and its surrounding tests — 8 `selectOptions` calls, at approximately lines 279, 312, 361, 371, 379, 389, 392, 438; read the full file section around case 10.32, lines ~257-440, before editing rather than patching each call site blind)

**Interfaces:**
- Consumes: `Select` from `@gisik-nokma/ui`.
- Produces: nothing later tasks depend on.

**Shape:** this component renders one `<select>` per entry in `props.dropped` (a repeated-instance site, same pattern as Phase 1's Field-type select and this wave's Task 4). Needs the `string` → `string | null` migration: `value={mapping[state.id] ?? ''}` becomes `value={mapping[state.id] ?? null}`. The wrapping `<label className="state-mapping-dialog__target">` has real CSS (`display: flex; align-items: center; gap: 0.35rem; font-size: 0.8rem; margin-left: auto;` — confirmed before writing this plan) that must move to a replacement `<div>`.

- [ ] **Step 1: Read the current file for exact context**

```bash
cat packages/app-core/src/workflow-builder/ui/state-mapping-dialog.tsx
```

Current relevant region (inside the `props.dropped.map(...)`):

```tsx
            <label className="state-mapping-dialog__target">
              <span>Send them to</span>
              <select
                aria-label={`Send them to — ${state.name}`}
                value={mapping[state.id] ?? ''}
                onChange={(changeEvent) =>
                  setMapping((current) => ({ ...current, [state.id]: changeEvent.target.value }))
                }
              >
                <option value="" disabled hidden></option>
                {props.targetStates.map((target) => (
                  <option key={target.id} value={target.id}>
                    {target.name}
                  </option>
                ))}
              </select>
            </label>
```

- [ ] **Step 2: Update the failing tests first**

Read `packages/app-core/test/workflow-builder/publish.test.tsx` lines 257-440 in full before editing — this is case 10.32 and its neighbors, all exercising `StateMappingDialog` through `PublishControls`'s dialog flow. Every `selectOptions` call in this range follows the shape:

```tsx
// BEFORE (one of several, same shape):
    await user.selectOptions(within(row).getByRole('combobox', { name: 'Send them to — Review' }), 'todo');
```

Each becomes:

```tsx
// AFTER:
    await user.click(within(row).getByRole('button', { name: /Send them to — Review/ }));
    await user.click(within(await screen.findByRole('listbox')).getByRole('option', { name: 'todo' }));
```

Where `row` is however each individual test obtained its scoping element (several use `within(screen.getByTestId('mapping-row-...'))` directly instead of a `row` variable — match each call site's own existing scoping pattern, don't introduce a `row` variable that isn't already there). Apply this transformation to all ~8 call sites in this range — read each one's exact surrounding code first, since a couple of them are back-to-back sequential picks within the same test (e.g. picking two different rows' selects in one test to prove both entries land in the submitted mapping) and need each click-open-click-pick sequence done correctly in order, not collapsed.

- [ ] **Step 3: Run the tests and confirm they fail for the right reason**

```bash
pnpm --filter @gisik-nokma/app-core exec vitest run publish.test.tsx > /tmp/wave-b-task3-red.log 2>&1
tail -150 /tmp/wave-b-task3-red.log
```

- [ ] **Step 4: Migrate the component**

Add `import { Select } from '@gisik-nokma/ui';`, replace the region from Step 1 with:

```tsx
            <div className="state-mapping-dialog__target">
              <span>Send them to</span>
              <Select
                options={props.targetStates.map((target) => ({ value: target.id, label: target.name }))}
                value={mapping[state.id] ?? null}
                onChange={(next) => setMapping((current) => ({ ...current, [state.id]: next }))}
                aria-label={`Send them to — ${state.name}`}
              />
            </div>
```

- [ ] **Step 5: Run the tests and confirm they pass**

```bash
pnpm --filter @gisik-nokma/app-core exec vitest run publish.test.tsx > /tmp/wave-b-task3-green.log 2>&1
tail -150 /tmp/wave-b-task3-green.log
```

- [ ] **Step 6: Full package test + typecheck**

```bash
pnpm --filter @gisik-nokma/app-core test > /tmp/wave-b-task3-full-test.log 2>&1
tail -40 /tmp/wave-b-task3-full-test.log
pnpm --filter @gisik-nokma/app-core typecheck > /tmp/wave-b-task3-typecheck.log 2>&1
tail -40 /tmp/wave-b-task3-typecheck.log
```

- [ ] **Step 7: `git status` and commit**

```bash
git status --short
```

Confirm exactly these 2 files:
- `packages/app-core/src/workflow-builder/ui/state-mapping-dialog.tsx`
- `packages/app-core/test/workflow-builder/publish.test.tsx`

```bash
git add packages/app-core/src/workflow-builder/ui/state-mapping-dialog.tsx packages/app-core/test/workflow-builder/publish.test.tsx
git commit -m "$(cat <<'EOF'
Migrate the state-mapping dialog's target-state select to the shared Select

Phase 2 Wave B, site 4/5. Repeated-instance site (one Select per
dropped state) with a real CSS class (.state-mapping-dialog__target)
moved from the dropped <label> onto a replacement <div>. Needed the
string -> string|null migration.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Migrate `workflow-rebind-dialog.tsx`'s target-state select

**Files:**
- Modify: `packages/app-core/src/workflow-builder/ticket-types/workflow-rebind-dialog.tsx`
- Test: `packages/app-core/test/ticket-types/ticket-types.test.tsx` (5 `selectOptions` calls exercising this dialog, confirmed via `grep -n selectOptions -B6` before writing this plan — all target `getByRole('combobox', { name: 'Send them to — ${state.name}' })`, this dialog's own accessible-name pattern; different test file/package location than Task 3's site, in `test/ticket-types/`, not `test/workflow-builder/`)

**Interfaces:**
- Consumes: `Select` from `@gisik-nokma/ui`.
- Produces: nothing later tasks depend on.

**Shape:** structurally near-identical to Task 3's `state-mapping-dialog.tsx` (same repeated-instance pattern, same `''` sentinel needing the `string | null` migration, same real CSS class needing to move — `.workflow-rebind-dialog__target { display: flex; align-items: center; gap: 0.35rem; font-size: 0.8rem; margin-left: auto; }`, confirmed before writing this plan) — but kept as a separate task because it's a genuinely separate component (this file's own docblock explains why it isn't merged with `StateMappingDialog` — read it, it's load-bearing context, not filler) tested from a different file in a different package subdirectory.

- [ ] **Step 1: Read the current file for exact context**

```bash
cat packages/app-core/src/workflow-builder/ticket-types/workflow-rebind-dialog.tsx
```

Current relevant region (inside `props.fromWorkflow.states.map(...)`):

```tsx
            <label className="workflow-rebind-dialog__target">
              <span>Send them to</span>
              <select
                aria-label={`Send them to — ${state.name}`}
                value={stateMap[state.id] ?? ''}
                onChange={(changeEvent) =>
                  setStateMap((current) => ({ ...current, [state.id]: changeEvent.target.value }))
                }
              >
                <option value="" disabled hidden></option>
                {props.toWorkflow.states.map((target) => (
                  <option key={target.id} value={target.id}>
                    {target.name}
                  </option>
                ))}
              </select>
            </label>
```

- [ ] **Step 2: Update the failing tests first**

```bash
grep -n "selectOptions" -B8 packages/app-core/test/ticket-types/ticket-types.test.tsx
```

All 5 calls follow this shape (confirmed before writing this plan, one representative example — read each of the 5 in its own full surrounding test before editing, they are not all in the same test function):

```tsx
// BEFORE:
    for (const state of kanbanPublished.states) {
      await user.selectOptions(
        within(dialog).getByRole('combobox', { name: `Send them to — ${state.name}` }),
        'in-progress',
      );
```

Becomes:

```tsx
// AFTER:
    for (const state of kanbanPublished.states) {
      await user.click(within(dialog).getByRole('button', { name: new RegExp(`Send them to — ${state.name}`) }));
      await user.click(within(await screen.findByRole('listbox')).getByRole('option', { name: 'in-progress' }));
```

(`new RegExp(...)` rather than a literal `/.../ ` regex here because the state name is interpolated — a literal regex can't embed a template-string variable directly. If `state.name` could ever contain regex metacharacters this would need escaping, but check the actual fixture data used in these tests — workflow state names in this test file's fixtures are plain words, so this is safe as written; note in your report if you find otherwise.)

Each of the 5 call sites needs this same transformation — read each one's exact loop/context first (some may pick a different target value per state, not always `'in-progress'`).

- [ ] **Step 3: Run the tests and confirm they fail for the right reason**

```bash
pnpm --filter @gisik-nokma/app-core exec vitest run ticket-types.test.tsx > /tmp/wave-b-task4-red.log 2>&1
tail -150 /tmp/wave-b-task4-red.log
```

- [ ] **Step 4: Migrate the component**

Add `import { Select } from '@gisik-nokma/ui';`, replace the region from Step 1 with:

```tsx
            <div className="workflow-rebind-dialog__target">
              <span>Send them to</span>
              <Select
                options={props.toWorkflow.states.map((target) => ({ value: target.id, label: target.name }))}
                value={stateMap[state.id] ?? null}
                onChange={(next) => setStateMap((current) => ({ ...current, [state.id]: next }))}
                aria-label={`Send them to — ${state.name}`}
              />
            </div>
```

- [ ] **Step 5: Run the tests and confirm they pass**

```bash
pnpm --filter @gisik-nokma/app-core exec vitest run ticket-types.test.tsx > /tmp/wave-b-task4-green.log 2>&1
tail -150 /tmp/wave-b-task4-green.log
```

- [ ] **Step 6: Full package test + typecheck**

```bash
pnpm --filter @gisik-nokma/app-core test > /tmp/wave-b-task4-full-test.log 2>&1
tail -40 /tmp/wave-b-task4-full-test.log
pnpm --filter @gisik-nokma/app-core typecheck > /tmp/wave-b-task4-typecheck.log 2>&1
tail -40 /tmp/wave-b-task4-typecheck.log
```

- [ ] **Step 7: `git status` and commit**

```bash
git status --short
```

Confirm exactly these 2 files:
- `packages/app-core/src/workflow-builder/ticket-types/workflow-rebind-dialog.tsx`
- `packages/app-core/test/ticket-types/ticket-types.test.tsx`

```bash
git add packages/app-core/src/workflow-builder/ticket-types/workflow-rebind-dialog.tsx packages/app-core/test/ticket-types/ticket-types.test.tsx
git commit -m "$(cat <<'EOF'
Migrate the workflow-rebind dialog's target-state select to the shared Select

Phase 2 Wave B, site 5/5 (final site in this wave). Structurally
near-identical to state-mapping-dialog.tsx (Task 3) but a genuinely
separate component per its own docblock's design-decision-10
rationale, tested from a different file/package location
(test/ticket-types, not test/workflow-builder). Same CSS-class
migration and string->string|null treatment as Task 3.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Wave B completion

After all 4 tasks are committed and reviewed clean, Wave B is done. Wave C's plan (the 5 remaining `packages/app-core/src/views` sites, including the two searchable sites in `new-ticket-dialog.tsx`) is written next, informed by whatever this wave's execution surfaced — do not draft Wave C's tasks here.
