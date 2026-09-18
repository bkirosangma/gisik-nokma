# Shared neumorphic Select component — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a shared, accessible `Select` component for `@gisik-nokma/ui` (single-select, searchable, and multi-select-with-chips) and migrate exactly two existing native `<select>` call sites onto it — the ticket-type editor's Workflow select and Field-type select — as end-to-end proof of the pattern.

**Architecture:** `react-aria`/`react-stately` (scoped packages) supply state, keyboard, focus, and positioning correctness; every pixel of markup and CSS is our own, styled through the existing hig/minimal/neo token system. Built incrementally: non-searchable single-select first (proven against the simpler Field-type site), then searchable (proven against Workflow), then the multi-select/chip surface the owner asked for but no current site consumes.

**Tech Stack:** TypeScript, React 19, `@react-aria/*` + `@react-stately/*` (new dependency, see Global Constraints), Vitest + Testing Library, pnpm workspaces, Turbo.

**Spec:** `docs/superpowers/specs/2026-09-10-shared-select-phase-1-design.md`

## Global Constraints

- **Package manager is pnpm 9.15.0** (`packageManager` field in root `package.json`); run workspace-scoped commands as `pnpm --filter @gisik-nokma/ui <script>` / `pnpm --filter @gisik-nokma/app-core <script>`, not bare `npm`/`yarn`.
- **Never pipe a test/build run into `head` or `grep -m N`.** This has orphaned vitest workers and crashed the machine before (see project `CLAUDE.md`). Use `| tail -N`, or redirect to a file and read that file, or an unbounded `grep`.
- **New dependency, scoped packages only** — not the `react-aria`/`react-stately` umbrella meta-packages (see Task 1 for the reasoning). Exact pinned versions are given in Task 1; do not use version ranges wider than what's specified without re-checking `npm view`.
- **Phase 1 touches exactly two call sites** — `ticket-type-editor-screen.tsx`'s Workflow select and `fields-editor.tsx`'s Field-type select. Do not touch any of the other 13 native `<select>` sites catalogued in the spec's audit; that is Phase 2's scope.
- **New test-case entries go in `test-cases/10-workflow-builder.md`**, starting at **10.77** (verify this is still the next free number before writing — `grep -n "^- 10\." test-cases/10-workflow-builder.md | tail -5`). **Never touch `test-cases/13-deployment-dogfooding.md`'s case-ID block-allocation system** — that file is controller-allocated for the separate Plan-series lane pipeline, which has Task 12 in flight on this repo right now; writing case IDs there without going through that protocol risks colliding with a parallel session's own allocation.
- **`Features.md` and the new test-case entries are part of this plan's own change set**, not a follow-up — per workspace convention, a PR that touches source and leaves `Features.md`/`test-cases/` stale is incomplete.
- Every task that changes `packages/ui` or `packages/app-core` ends with `pnpm --filter <package> test` and `pnpm --filter <package> typecheck` both passing before commit.

---

## File structure

```
packages/ui/
  package.json                          MODIFY — new dependencies (Task 1)
  src/
    select/
      select-icons.tsx                  CREATE (Task 2) — checkmark, ×, search glyphs
      select.tsx                        CREATE (Task 3), MODIFY (Tasks 6, 8, 9) — public Select component
    index.ts                            MODIFY (Task 3) — export Select
    ui.css                              MODIFY (Tasks 4, 6, 8) — trigger/panel/option-row/chip styling
  test/
    select.test.tsx                     CREATE (Task 3), MODIFY (Tasks 6, 8, 9)
    components.test.tsx                 MODIFY (Task 4) — CSS regression assertions

packages/app-core/
  src/workflow-builder/ticket-types/
    fields-editor.tsx                   MODIFY (Task 5) — migrate Field-type select
    ticket-type-editor-screen.tsx       MODIFY (Task 7) — migrate Workflow select
  test/ticket-types/
    ticket-types.test.tsx               MODIFY (Tasks 5, 7) — rewrite selectOptions(...) call sites

apps/web/e2e-stack/
  non-text-contrast-roster.json         MODIFY (Task 4) — sanctionedWaivers entry for neo panel shadow

Features.md                             MODIFY (Task 11)
test-cases/10-workflow-builder.md       MODIFY (Task 11) — cases 10.77+
```

---

### Task 1: Add `react-aria`/`react-stately` dependencies to `packages/ui`

**Files:**
- Modify: `packages/ui/package.json`

**Interfaces:**
- Produces: nine new `dependencies` entries available to every subsequent task in `packages/ui`.

`packages/ui` has had zero runtime dependencies until now (react/react-dom are peer deps only). Use the **scoped** packages, not the `react-aria`/`react-stately` umbrella meta-packages — the umbrella packages bundle every hook for every component (menus, tables, calendars, etc.) into a package that has never carried a dependency at all; the scoped packages pull in only what Select actually uses. This matches this codebase's documented dependency conservatism (`packages/app-core/src/workflow-builder/ticket-types/icons.tsx`'s docblock argues against adding `lucide-react` for 16 small glyphs on the same grounds).

- [ ] **Step 1: Add the dependencies**

Edit `packages/ui/package.json`'s `"dependencies"` (create the key if absent — currently there is none):

```json
"dependencies": {
  "@react-aria/button": "^3.15.1",
  "@react-aria/combobox": "^3.16.1",
  "@react-aria/focus": "^3.22.1",
  "@react-aria/listbox": "^3.16.1",
  "@react-aria/overlays": "^3.32.1",
  "@react-aria/select": "^3.18.1",
  "@react-stately/combobox": "^3.14.1",
  "@react-stately/list": "^3.14.1",
  "@react-stately/select": "^3.10.1"
}
```

(Versions are the latest published as of 2026-09-10; re-check with `npm view <package> version` if this task runs much later and pin whatever is then-current — don't let the lockfile resolve something untested.)

- [ ] **Step 2: Install**

Run: `pnpm install`
Expected: lockfile updates with no version conflicts; exits 0.

- [ ] **Step 3: Verify the package still builds and typechecks with the new (as yet unused) dependencies**

Run: `pnpm --filter @gisik-nokma/ui typecheck > /tmp/select-task1-typecheck.log 2>&1; tail -30 /tmp/select-task1-typecheck.log`
Expected: passes exactly as it did before this change (no code uses the new packages yet, so this only proves the install didn't break anything).

- [ ] **Step 4: Commit**

```bash
git add packages/ui/package.json pnpm-lock.yaml
git commit -m "Add react-aria/react-stately scoped packages to packages/ui

First runtime dependency this package has ever taken — needed for
correct keyboard/focus/positioning behavior in the new Select
component (see docs/superpowers/specs/2026-09-10-shared-select-phase-1-design.md).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Select icon glyphs (checkmark, remove ×, search)

**Files:**
- Create: `packages/ui/src/select/select-icons.tsx`
- Test: `packages/ui/test/select.test.tsx` (new file, this task starts it)

**Interfaces:**
- Produces: `CheckIcon`, `RemoveIcon`, `SearchIcon` — each `(props: { size?: number }) => JSX.Element`, `currentColor` stroke, `aria-hidden="true"`.
- Consumes: nothing new.

No icon library — hand-drawn inline SVG stroke paths, matching the existing convention in `packages/app-core/src/workflow-builder/ticket-types/icons.tsx` (which explicitly rejected `lucide-react` for a comparable job) and `apps/web/src/theme-toggle.tsx`'s sun/moon icons. These are local to `packages/ui`, not imported from `icons.tsx` — dependencies in this codebase only flow `app-core` → `ui`, never the reverse.

- [ ] **Step 1: Write the failing test**

```tsx
// packages/ui/test/select.test.tsx
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CheckIcon, RemoveIcon, SearchIcon } from '../src/select/select-icons.js';

describe('select icon glyphs', () => {
  it('render as aria-hidden inline SVGs with at least one path or circle', () => {
    for (const Icon of [CheckIcon, RemoveIcon, SearchIcon]) {
      const { container } = render(<Icon />);
      const svg = container.querySelector('svg');
      expect(svg).not.toBeNull();
      expect(svg).toHaveAttribute('aria-hidden', 'true');
      expect(svg?.querySelectorAll('path, circle, line').length ?? 0).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @gisik-nokma/ui test -- select.test.tsx > /tmp/select-task2-red.log 2>&1; tail -30 /tmp/select-task2-red.log`
Expected: FAIL — `Cannot find module '../src/select/select-icons.js'`.

- [ ] **Step 3: Write the implementation**

```tsx
// packages/ui/src/select/select-icons.tsx
export function CheckIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

export function RemoveIcon({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 6 6 18" />
      <path d="M6 6l12 12" />
    </svg>
  );
}

export function SearchIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @gisik-nokma/ui test -- select.test.tsx > /tmp/select-task2-green.log 2>&1; tail -30 /tmp/select-task2-green.log`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/select/select-icons.tsx packages/ui/test/select.test.tsx
git commit -m "Add Select's checkmark/remove/search glyphs as inline SVGs

No icon library — matches icons.tsx/theme-toggle.tsx precedent.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Non-searchable single-select core (`useSelect`)

**Files:**
- Create: `packages/ui/src/select/select.tsx`
- Modify: `packages/ui/src/index.ts` — export `Select`, `SelectOption`, `SelectProps`
- Modify: `packages/ui/test/select.test.tsx`

**Interfaces:**
- Produces:
  ```ts
  export type SelectOption = { value: string; label: string };
  export type SelectProps = {
    options: SelectOption[];
    value: string | null;
    onChange: (value: string) => void;
    placeholder?: string;
    disabled?: boolean;
    'aria-label'?: string;
  };
  export function Select(props: SelectProps): JSX.Element;
  ```
  (This is deliberately the *narrowest* slice of the spec's full API — no `searchable`, no `multiple`. Widened in Tasks 6, 8, 9.)
- Consumes: `CheckIcon` from `./select-icons.js` (Task 2).

This is the `useSelect` path only: trigger is a real `<button>`, opening a portal-rendered listbox. No styling yet beyond what's needed for the tests to query real elements — visual polish is Task 4.

- [ ] **Step 1: Write the failing tests**

```tsx
// packages/ui/test/select.test.tsx — add below the icon describe block
import { userEvent } from '@testing-library/user-event';
import { screen } from '@testing-library/react';
import { Select, type SelectOption } from '../src/select/select.js';

const FRUIT: SelectOption[] = [
  { value: 'apple', label: 'Apple' },
  { value: 'banana', label: 'Banana' },
  { value: 'cherry', label: 'Cherry' },
];

describe('Select — non-searchable single-select', () => {
  it('shows the placeholder when value is null, opens on click, and selects on click', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <Select options={FRUIT} value={null} onChange={onChange} placeholder="Pick a fruit" aria-label="Fruit" />,
    );
    const trigger = screen.getByRole('button', { name: 'Fruit' });
    expect(trigger).toHaveTextContent('Pick a fruit');
    await user.click(trigger);
    const option = await screen.findByRole('option', { name: 'Banana' });
    await user.click(option);
    expect(onChange).toHaveBeenCalledWith('banana');
  });

  it('shows the placeholder rather than throwing when value matches no option', () => {
    render(<Select options={FRUIT} value="durian" onChange={vi.fn()} placeholder="Pick a fruit" aria-label="Fruit" />);
    expect(screen.getByRole('button', { name: 'Fruit' })).toHaveTextContent('Pick a fruit');
  });

  it('shows a checkmark on the currently selected option when open', async () => {
    const user = userEvent.setup();
    render(<Select options={FRUIT} value="banana" onChange={vi.fn()} aria-label="Fruit" />);
    await user.click(screen.getByRole('button', { name: 'Fruit' }));
    const selected = await screen.findByRole('option', { name: 'Banana' });
    expect(selected).toHaveAttribute('aria-selected', 'true');
    expect(selected.querySelector('svg')).not.toBeNull();
  });

  it('opens with the keyboard (Enter), navigates with ArrowDown, and selects with Enter', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Select options={FRUIT} value={null} onChange={onChange} aria-label="Fruit" />);
    const trigger = screen.getByRole('button', { name: 'Fruit' });
    trigger.focus();
    await user.keyboard('{Enter}');
    await screen.findByRole('listbox');
    await user.keyboard('{ArrowDown}{ArrowDown}{Enter}');
    expect(onChange).toHaveBeenCalledWith('banana');
  });

  it('closes on Escape without selecting', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Select options={FRUIT} value={null} onChange={onChange} aria-label="Fruit" />);
    await user.click(screen.getByRole('button', { name: 'Fruit' }));
    await screen.findByRole('listbox');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('is disabled when disabled is true', () => {
    render(<Select options={FRUIT} value={null} onChange={vi.fn()} disabled aria-label="Fruit" />);
    expect(screen.getByRole('button', { name: 'Fruit' })).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @gisik-nokma/ui test -- select.test.tsx > /tmp/select-task3-red.log 2>&1; tail -40 /tmp/select-task3-red.log`
Expected: FAIL — `Cannot find module '../src/select/select.js'`.

- [ ] **Step 3: Write the implementation**

```tsx
// packages/ui/src/select/select.tsx
import { useRef } from 'react';
import { useButton } from '@react-aria/button';
import { useListBox, useOption } from '@react-aria/listbox';
import { DismissButton, useOverlay, useOverlayPosition } from '@react-aria/overlays';
import { useSelect, HiddenSelect } from '@react-aria/select';
import { Item } from '@react-stately/collections';
import { useSelectState } from '@react-stately/select';
import { CheckIcon } from './select-icons.js';

export type SelectOption = { value: string; label: string };

export type SelectProps = {
  options: SelectOption[];
  value: string | null;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  'aria-label'?: string;
};

export function Select(props: SelectProps) {
  const { options, value, onChange, placeholder = 'Select…', disabled = false } = props;

  const state = useSelectState<SelectOption>({
    items: options,
    children: (item) => <Item key={item.value}>{item.label}</Item>,
    selectedKey: value,
    onSelectionChange: (key) => onChange(String(key)),
    isDisabled: disabled,
  });

  const triggerRef = useRef<HTMLButtonElement>(null);
  const { triggerProps, valueProps, menuProps } = useSelect(
    { 'aria-label': props['aria-label'], isDisabled: disabled },
    state,
    triggerRef,
  );
  const { buttonProps } = useButton(triggerProps, triggerRef);

  const overlayRef = useRef<HTMLDivElement>(null);
  const { overlayProps, placement } = useOverlayPosition({
    targetRef: triggerRef,
    overlayRef,
    placement: 'bottom start',
    isOpen: state.isOpen,
    onClose: state.close,
  });
  const { overlayProps: dismissOverlayProps } = useOverlay(
    { isOpen: state.isOpen, onClose: state.close, shouldCloseOnBlur: true, isDismissable: true },
    overlayRef,
  );

  const selected = options.find((option) => option.value === value) ?? null;

  return (
    <>
      <HiddenSelect state={state} triggerRef={triggerRef} label={props['aria-label']} name={props['aria-label']} />
      <button {...buttonProps} ref={triggerRef} className="gn-select__trigger gn-field__input">
        <span {...valueProps}>{selected ? selected.label : placeholder}</span>
      </button>
      {state.isOpen ? (
        <div
          {...overlayProps}
          {...dismissOverlayProps}
          ref={overlayRef}
          className="gn-select__panel"
          data-placement={placement}
        >
          <DismissButton onDismiss={state.close} />
          <SelectListBox {...menuProps} state={state} />
          <DismissButton onDismiss={state.close} />
        </div>
      ) : null}
    </>
  );
}

function SelectListBox(props: { state: ReturnType<typeof useSelectState<SelectOption>> } & Record<string, unknown>) {
  const { state, ...rest } = props;
  const ref = useRef<HTMLUListElement>(null);
  const { listBoxProps } = useListBox({ ...rest, autoFocus: state.focusStrategy ?? true }, state, ref);
  return (
    <ul {...listBoxProps} ref={ref} className="gn-select__list">
      {[...state.collection].map((item) => (
        <SelectOptionRow key={item.key} item={item} state={state} />
      ))}
    </ul>
  );
}

function SelectOptionRow({
  item,
  state,
}: {
  item: { key: string | number; rendered: React.ReactNode };
  state: ReturnType<typeof useSelectState<SelectOption>>;
}) {
  const ref = useRef<HTMLLIElement>(null);
  const isSelected = state.selectedKey === item.key;
  const { optionProps, isFocused } = useOption({ key: item.key }, state, ref);
  return (
    <li {...optionProps} ref={ref} className="gn-select__option" data-focused={isFocused || undefined}>
      <span className="gn-select__option-label">{item.rendered}</span>
      {isSelected ? <CheckIcon /> : null}
    </li>
  );
}
```

- [ ] **Step 4: Export from the package entry point**

```ts
// packages/ui/src/index.ts — add near the other component exports
export { Select, type SelectOption, type SelectProps } from './select/select.js';
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @gisik-nokma/ui test -- select.test.tsx > /tmp/select-task3-green.log 2>&1; tail -60 /tmp/select-task3-green.log`
Expected: PASS. If a specific hook call errors on prop shape, that's expected first-pass friction with a hooks API this detailed — fix the call to match what the installed `@react-aria`/`@react-stately` versions actually expect (check `node_modules/@react-aria/select/dist/*.d.ts` for the exact `useSelect` signature if the error is a type mismatch) rather than working around it by skipping the hook.

- [ ] **Step 6: Typecheck**

Run: `pnpm --filter @gisik-nokma/ui typecheck > /tmp/select-task3-typecheck.log 2>&1; tail -40 /tmp/select-task3-typecheck.log`
Expected: passes.

- [ ] **Step 7: Commit**

```bash
git add packages/ui/src/select/select.tsx packages/ui/src/index.ts packages/ui/test/select.test.tsx
git commit -m "Add non-searchable single-select core to the shared Select component

useSelect-based: button trigger, portal-rendered listbox panel,
checkmark on the selected option, keyboard nav, Escape-to-close.
Unstyled beyond what the tests need — visual integration is next.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Style the trigger/panel/option row across hig/minimal/neo

**Files:**
- Modify: `packages/ui/src/ui.css`
- Modify: `packages/ui/test/components.test.tsx`
- Modify: `apps/web/e2e-stack/non-text-contrast-roster.json`

**Interfaces:**
- Consumes: `.gn-select__trigger`, `.gn-select__panel`, `.gn-select__list`, `.gn-select__option` class names from Task 3.
- Produces: visual treatment other tasks build on (Task 6 adds input-trigger-specific rules, Task 8 adds chip rules).

Per the spec's accessibility addendum: the trigger reuses `.gn-field__input` (already applied via the `className` in Task 3) so it inherits the already-tested box styling — no new box-contrast test needed for the trigger itself, only for the parts genuinely new here (panel elevation, option rows, checkmark, focus outline).

- [ ] **Step 1: Write the failing CSS regression tests**

Follow `components.test.tsx`'s existing `rule(selector)` helper (regex-extracts a CSS rule's body from the loaded stylesheet text — not computed style, since jsdom never loads `ui.css` as a real stylesheet). Pick selectors that can't shadow an earlier rule's first-match lookup (see the `.fields-editor__type` docblock in `ui.css` for why that matters).

```tsx
// packages/ui/test/components.test.tsx — add to the existing describe block
describe('Select panel/option styling', () => {
  it('the neo panel gets shadow-only elevation, matching the row-shadow precedent', () => {
    expect(rule('\\[data-style="neo"\\] \\.gn-select__panel')).toMatch(/box-shadow:\s*var\(--gn-shadow-raised\)/);
  });

  it('the active/focused option row uses a focus-ring outline, not a background-fill misuse of focusRing', () => {
    expect(rule('\\.gn-select__option\\[data-focused\\]')).toMatch(/outline:\s*2px solid var\(--gn-focus-ring\)/);
  });

  it('the option row background is the shared surface token, not a bespoke color', () => {
    expect(rule('\\.gn-select__panel')).toMatch(/background:\s*var\(--gn-surface(-raised)?\)/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @gisik-nokma/ui test -- components.test.tsx > /tmp/select-task4-red.log 2>&1; tail -40 /tmp/select-task4-red.log`
Expected: FAIL — `no rule for ...` (the selectors don't exist in `ui.css` yet).

- [ ] **Step 3: Add the CSS**

Append to `packages/ui/src/ui.css` (near the `.fields-editor`/`.icon-picker` block, which already establishes the same token conventions this reuses):

```css
.gn-select__trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  width: 100%;
  text-align: left;
  cursor: pointer;
}
.gn-select__trigger:disabled { cursor: not-allowed; }

.gn-select__panel {
  position: absolute;
  z-index: 30;
  min-width: 12rem;
  max-height: 16rem;
  overflow-y: auto;
  margin: 0;
  padding: 0.25rem;
  border-radius: var(--gn-radius-control);
  background: var(--gn-surface-raised);
  box-shadow: var(--gn-shadow-raised);
}
[data-style="neo"] .gn-select__panel {
  /* Same gap as .ticket-type-list__row/.fields-editor__row: neo gives
     surface/surfaceRaised/surfaceSunken no colour of its own, so without
     this the panel is indistinguishable from the page behind it. */
  box-shadow: var(--gn-shadow-raised);
}

.gn-select__list { list-style: none; margin: 0; padding: 0; }

.gn-select__option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.4rem 0.6rem;
  border-radius: var(--gn-radius-control);
  cursor: pointer;
}
.gn-select__option[data-focused] {
  /* Reuses the exact pattern already established at
     .icon-picker__choice:focus-visible — focusRing verified as a 2px
     OUTLINE (CONTRAST_PAIRS: { fg: 'focusRing', bg: 'surface', minimum: 3 }),
     not as a background fill. */
  outline: 2px solid var(--gn-focus-ring);
  outline-offset: -2px;
  background: var(--gn-fill-3);
}
.gn-select__option-label { flex: 1; }
```

(`--gn-fill-3` here stands in for whichever of the existing alpha fill-hierarchy variables this style/theme already uses for row hover — confirm the exact variable name other hover states use, e.g. `grep -n "fill-hig-3\|fill-neo-3\|:hover" packages/ui/src/ui.css`, and use that same one rather than inventing a new hover treatment.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @gisik-nokma/ui test -- components.test.tsx > /tmp/select-task4-green.log 2>&1; tail -40 /tmp/select-task4-green.log`
Expected: PASS.

- [ ] **Step 5: Add the sanctioned-waiver roster entry**

The automated non-text-contrast tool composites `border` colors, not `box-shadow` — it structurally cannot measure the neo panel's shadow-only elevation, exactly like the existing `[data-style="neo"] .gn-field__input` entry. Add a matching entry to `apps/web/e2e-stack/non-text-contrast-roster.json`'s `sanctionedWaivers` array (follow that existing entry's exact shape — `selector`, `sanctioned: true`, `ratioLight`/`ratioDark` from a manual check, `border: "none — raised box-shadow only, not compositable by this instrument"`). This route isn't currently in the tool's tracked route list (see Task 10), so this entry documents the exception in advance rather than reacting to a future false-fail.

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src/ui.css packages/ui/test/components.test.tsx apps/web/e2e-stack/non-text-contrast-roster.json
git commit -m "Style the Select trigger/panel/option row across hig/minimal/neo

Panel elevation reuses --gn-shadow-raised (neo shadow-only-depth
pattern already used by .ticket-type-list__row/.fields-editor__row).
Focused-option outline reuses --gn-focus-ring exactly as
.icon-picker__choice:focus-visible does. Adds a sanctionedWaivers
roster entry for the shadow-only panel boundary the automated
non-text-contrast tool can't measure.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: Migrate the Field-type select (`fields-editor.tsx`)

**Files:**
- Modify: `packages/app-core/src/workflow-builder/ticket-types/fields-editor.tsx`
- Modify: `packages/app-core/test/ticket-types/ticket-types.test.tsx`

**Interfaces:**
- Consumes: `Select`, `SelectOption` from `@gisik-nokma/ui` (Task 3/4).

First real call site — the simpler of the two (fixed 5-item enum, non-searchable). This is Phase 1's proof that the component works end-to-end against a real, already-tested screen.

- [ ] **Step 1: Update the component**

In `packages/app-core/src/workflow-builder/ticket-types/fields-editor.tsx`, replace the native `<select>` (current lines ~43–57):

```tsx
// before
<select
  className="gn-field__input fields-editor__type"
  aria-label="Field type"
  disabled={props.disabled === true}
  value={field.type}
  onChange={(changeEvent) => updateField(index, { type: changeEvent.target.value as CustomFieldDef['type'] })}
>
  {FIELD_TYPES.map((fieldType) => (
    <option key={fieldType} value={fieldType}>
      {fieldType}
    </option>
  ))}
</select>
```

```tsx
// after
<Select
  options={FIELD_TYPES.map((fieldType) => ({ value: fieldType, label: fieldType }))}
  value={field.type}
  onChange={(next) => updateField(index, { type: next as CustomFieldDef['type'] })}
  disabled={props.disabled === true}
  aria-label="Field type"
/>
```

Add the import: `import { Select } from '@gisik-nokma/ui';` (alongside the existing `Button` import at the top of the file). Keep the `fields-editor__type` class off the trigger for now — sizing is handled in Task 5's Step 3 below if the flex-basis rule needs to move to the new element.

- [ ] **Step 2: Check whether `.fields-editor__type`'s sizing rule needs to move**

`packages/ui/src/ui.css` currently has `.fields-editor__type { flex: 0 1 9rem; }` targeting the old `<select>`. Since the new `Select`'s trigger is a `<button className="gn-select__trigger gn-field__input">` with no `fields-editor__type` class, either add that class to the `Select`'s trigger (if `Select` exposes a `className` passthrough — it doesn't yet per Task 3's API) or apply the sizing at the call site by wrapping: `<div className="fields-editor__type"><Select .../></div>`. Use the wrapper `<div>` — it's the smaller change and doesn't widen `Select`'s public API for a single call site's layout need.

- [ ] **Step 3: Rewrite the two `selectOptions` call sites in `ticket-types.test.tsx`**

Both are inside `within(row).getByRole('combobox', { name: 'Field type' })` — the trigger is now a `<button>`, not a `<select>`, so the query role changes too. Add a small local test helper at the top of the describe block that's about to use it (keeps the two rewritten call sites one line each, matching the file's existing terseness):

```tsx
// packages/app-core/test/ticket-types/ticket-types.test.tsx — near the top, after imports
async function pickFromSelect(user: ReturnType<typeof userEvent.setup>, trigger: HTMLElement, optionName: string) {
  await user.click(trigger);
  await user.click(await screen.findByRole('option', { name: optionName }));
}
```

Line 159 (inside "builds and submits ticket-type.defined from the filled form"):
```tsx
// before
await user.selectOptions(within(row).getByRole('combobox', { name: 'Field type' }), 'number');
// after
await pickFromSelect(user, within(row).getByRole('button', { name: 'Field type' }), 'number');
```

Line 191 (inside "surfaces the schema refusal for a select field without options and blocks saving"):
```tsx
// before
await user.selectOptions(within(row).getByRole('combobox', { name: 'Field type' }), 'select');
// after
await pickFromSelect(user, within(row).getByRole('button', { name: 'Field type' }), 'select');
```

- [ ] **Step 4: Update the class assertion at line 276**

```tsx
// before
expect(screen.getByRole('combobox', { name: 'Field type' })).toHaveClass('gn-field__input');
// after
expect(screen.getByRole('button', { name: 'Field type' })).toHaveClass('gn-field__input');
```

This still proves the trigger carries the shared field-input class — same assertion, updated role, per the Task 4 design decision that `Select`'s trigger reuses `.gn-field__input` rather than diverging onto its own box-styling contract.

- [ ] **Step 5: Confirm the role query actually resolves to the visible trigger, not react-aria's hidden native fallback**

`useSelect`'s `HiddenSelect` renders a visually-hidden native `<select>` alongside the visible button (for mobile native-picker support). Run the suite and check: if `getByRole('button', { name: 'Field type' })` or `getByRole('option', ...)` throws "multiple elements found" or resolves to the wrong element, use `screen.debug()` or `import { logRoles } from '@testing-library/dom'; logRoles(container)` to see exactly what role/name the hidden element exposes in jsdom, then scope the query more tightly (e.g. `within(row).getByRole('button', { name: 'Field type' })` already scopes to the row, which should be sufficient — but verify rather than assume).

- [ ] **Step 6: Run the test file**

Run: `pnpm --filter @gisik-nokma/app-core test -- ticket-types.test.tsx > /tmp/select-task5.log 2>&1; tail -80 /tmp/select-task5.log`
Expected: all tests in the file PASS (this file also covers Workflow-select interactions, which are unchanged until Task 7 — they should still pass against the still-native Workflow `<select>`).

- [ ] **Step 7: Typecheck app-core**

Run: `pnpm --filter @gisik-nokma/app-core typecheck > /tmp/select-task5-typecheck.log 2>&1; tail -40 /tmp/select-task5-typecheck.log`
Expected: passes.

- [ ] **Step 8: Commit**

```bash
git add packages/app-core/src/workflow-builder/ticket-types/fields-editor.tsx packages/app-core/test/ticket-types/ticket-types.test.tsx
git commit -m "Migrate the Field-type select to the shared Select component

First real call site for the new Select — non-searchable, fixed
5-item enum. Rewrites its two selectOptions test interactions to
click-and-pick and updates the shared-class assertion's role query.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: Extend `Select` with the searchable variant (`useComboBox`)

**Files:**
- Modify: `packages/ui/src/select/select.tsx`
- Modify: `packages/ui/src/ui.css`
- Modify: `packages/ui/test/select.test.tsx`

**Interfaces:**
- Produces (widened):
  ```ts
  export type SelectProps = {
    options: SelectOption[];
    value: string | null;
    onChange: (value: string) => void;
    searchable?: boolean;
    placeholder?: string;
    disabled?: boolean;
    'aria-label'?: string;
  };
  ```
- Consumes: `SearchIcon` from `./select-icons.js` (Task 2).

Per the spec: when `searchable`, the trigger itself becomes the typeable field (`role="combobox"`, shows the selected label when closed, clears to a filter box when opened) — `useComboBox`, not a separate search box bolted onto the non-searchable trigger.

- [ ] **Step 1: Write the failing tests**

```tsx
describe('Select — searchable', () => {
  it('renders the trigger as a combobox input showing the selected label', () => {
    render(<Select options={FRUIT} value="banana" onChange={vi.fn()} searchable aria-label="Fruit" />);
    expect(screen.getByRole('combobox', { name: 'Fruit' })).toHaveValue('Banana');
  });

  it('typing filters the option list', async () => {
    const user = userEvent.setup();
    render(<Select options={FRUIT} value={null} onChange={vi.fn()} searchable aria-label="Fruit" />);
    const input = screen.getByRole('combobox', { name: 'Fruit' });
    await user.click(input);
    await user.type(input, 'cher');
    const listbox = await screen.findByRole('listbox');
    expect(within(listbox).getByRole('option', { name: 'Cherry' })).toBeInTheDocument();
    expect(within(listbox).queryByRole('option', { name: 'Apple' })).not.toBeInTheDocument();
  });

  it('selecting an option calls onChange and closes the panel', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Select options={FRUIT} value={null} onChange={onChange} searchable aria-label="Fruit" />);
    const input = screen.getByRole('combobox', { name: 'Fruit' });
    await user.click(input);
    await user.click(await screen.findByRole('option', { name: 'Apple' }));
    expect(onChange).toHaveBeenCalledWith('apple');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @gisik-nokma/ui test -- select.test.tsx > /tmp/select-task6-red.log 2>&1; tail -40 /tmp/select-task6-red.log`
Expected: FAIL — `searchable` isn't a recognized prop yet / trigger isn't a combobox role.

- [ ] **Step 3: Implement the searchable branch**

Widen `SelectProps` with `searchable?: boolean`, and inside `Select`, branch: when `searchable` is true, use `useComboBoxState`/`useComboBox` (from `@react-stately/combobox` / `@react-aria/combobox`) instead of `useSelectState`/`useSelect`, rendering an `<input>` (via `inputProps`) as the trigger instead of a `<button>`. The listbox panel, option rows, and `useOverlayPosition` wiring are shared between both branches — factor the panel/list/option rendering (already written in Task 3) into a shared internal component both branches call, rather than duplicating it.

```tsx
// packages/ui/src/select/select.tsx — sketch of the added branch;
// merge with Task 3's implementation rather than replacing it wholesale
import { useComboBox } from '@react-aria/combobox';
import { useComboBoxState } from '@react-stately/combobox';
import { SearchIcon } from './select-icons.js';

// inside Select(props), after destructuring `searchable = false`:
if (searchable) {
  const comboState = useComboBoxState<SelectOption>({
    items: options,
    children: (item) => <Item key={item.value}>{item.label}</Item>,
    selectedKey: value,
    onSelectionChange: (key) => key !== null && onChange(String(key)),
    isDisabled: disabled,
  });
  const inputRef = useRef<HTMLInputElement>(null);
  const listBoxRef = useRef<HTMLUListElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const { inputProps, listBoxProps } = useComboBox(
    { 'aria-label': props['aria-label'], isDisabled: disabled, inputRef, listBoxRef, popoverRef: overlayRef },
    comboState,
  );
  const { overlayProps } = useOverlayPosition({
    targetRef: inputRef,
    overlayRef,
    placement: 'bottom start',
    isOpen: comboState.isOpen,
    onClose: comboState.close,
  });

  return (
    <>
      <div className="gn-select__trigger gn-select__trigger--searchable gn-field__input">
        <SearchIcon />
        <input {...inputProps} ref={inputRef} placeholder={placeholder} />
      </div>
      {comboState.isOpen ? (
        <div {...overlayProps} ref={overlayRef} className="gn-select__panel">
          <ul {...listBoxProps} ref={listBoxRef} className="gn-select__list">
            {[...comboState.collection].map((item) => (
              <SelectOptionRow key={item.key} item={item} state={comboState} />
            ))}
          </ul>
        </div>
      ) : null}
    </>
  );
}
// ...else fall through to the Task 3 useSelect implementation
```

`SelectOptionRow` needs its `state` parameter type widened to accept either `useSelectState` or `useComboBoxState`'s return type (both expose `selectedKey`/`collection` compatibly) — use a shared narrower type (`{ selectedKey: React.Key | null; collection: Iterable<{ key: React.Key; rendered: React.ReactNode }> }`) rather than a union of the two concrete hook return types, so the row component doesn't need to know which mode it's rendering under.

- [ ] **Step 4: Add the searchable trigger's CSS**

```css
.gn-select__trigger--searchable {
  cursor: text;
}
.gn-select__trigger--searchable input {
  border: none;
  background: transparent;
  flex: 1;
  font: inherit;
  color: inherit;
}
.gn-select__trigger--searchable input:focus { outline: none; }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @gisik-nokma/ui test -- select.test.tsx > /tmp/select-task6-green.log 2>&1; tail -60 /tmp/select-task6-green.log`
Expected: PASS, and all of Task 3's non-searchable tests still PASS (regression check).

- [ ] **Step 6: Typecheck**

Run: `pnpm --filter @gisik-nokma/ui typecheck > /tmp/select-task6-typecheck.log 2>&1; tail -40 /tmp/select-task6-typecheck.log`
Expected: passes.

- [ ] **Step 7: Commit**

```bash
git add packages/ui/src/select/select.tsx packages/ui/src/ui.css packages/ui/test/select.test.tsx
git commit -m "Add the searchable variant to Select (useComboBox)

Trigger itself becomes the typeable filter input when searchable is
set, per the spec — not a separate search box inside the panel.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 7: Migrate the Workflow select (`ticket-type-editor-screen.tsx`)

**Files:**
- Modify: `packages/app-core/src/workflow-builder/ticket-types/ticket-type-editor-screen.tsx`
- Modify: `packages/app-core/test/ticket-types/ticket-types.test.tsx`

**Interfaces:**
- Consumes: `Select`, `SelectOption` from `@gisik-nokma/ui` (searchable mode, Task 6).

- [ ] **Step 1: Update the component**

Replace the native `<select>` at `ticket-type-editor-screen.tsx:357–364`:

```tsx
// before
<select
  className="gn-field__input"
  aria-label="Workflow"
  disabled={!canAuthor}
  value={def.workflowId}
  onChange={(changeEvent) => setDef((current) => ({ ...current, workflowId: changeEvent.target.value }))}
>
  <option value="" disabled hidden></option>
  {context.workflows.map((workflow) => (
    <option key={workflow.id} value={workflow.id}>
      {workflow.name}
    </option>
  ))}
</select>
```

```tsx
// after
<Select
  options={context.workflows.map((workflow) => ({ value: workflow.id, label: workflow.name }))}
  value={def.workflowId || null}
  onChange={(workflowId) => setDef((current) => ({ ...current, workflowId }))}
  disabled={!canAuthor}
  searchable
  aria-label="Workflow"
/>
```

Add the import (or extend the existing one from Task 5's sibling file): `import { Select } from '@gisik-nokma/ui';`.

- [ ] **Step 2: Rewrite the `rebind()` test helper (lines 286–294)**

This single edit fixes all 8 tests that call `rebind()`:

```tsx
// before
async function rebind(seed: FakeGatewaySeed = {}) {
  const user = userEvent.setup();
  const rendered = renderEditor(task, { ...bothWorkflows, ...seed });
  await user.selectOptions(
    await screen.findByRole('combobox', { name: 'Workflow' }),
    errandPublished.id,
  );
  return { user, ...rendered };
}
```

```tsx
// after
async function rebind(seed: FakeGatewaySeed = {}) {
  const user = userEvent.setup();
  const rendered = renderEditor(task, { ...bothWorkflows, ...seed });
  const workflowSelect = await screen.findByRole('combobox', { name: 'Workflow' });
  await user.click(workflowSelect);
  await user.click(await screen.findByRole('option', { name: errandPublished.name }));
  return { user, ...rendered };
}
```

(The role stays `'combobox'` — Workflow is `searchable`, so its trigger is a real `useComboBox` input, not a button. Only the interaction changes, not the query.)

- [ ] **Step 3: Rewrite the standalone (non-`rebind()`) Workflow interactions**

Lines 153, 188 — direct `selectOptions` calls choosing `kanbanPublished.id` (the already-selected default in `renderEditor`'s fake gateway, i.e. these two are re-confirming the same selection, not changing it — since the combobox already shows `kanbanPublished.name`, clicking it open and picking the same option is the equivalent action):

```tsx
// before (both occurrences, lines 153 and 188)
await user.selectOptions(screen.getByRole('combobox', { name: 'Workflow' }), kanbanPublished.id);
// after
await user.click(screen.getByRole('combobox', { name: 'Workflow' }));
await user.click(await screen.findByRole('option', { name: kanbanPublished.name }));
```

Lines 336/338 (test: "the notice appears only when the binding actually changed") — picks `errandPublished` then back to `kanbanPublished`:
```tsx
// before
await user.selectOptions(screen.getByRole('combobox', { name: 'Workflow' }), errandPublished.id);
// ...
await user.selectOptions(screen.getByRole('combobox', { name: 'Workflow' }), kanbanPublished.id);
// after
await user.click(screen.getByRole('combobox', { name: 'Workflow' }));
await user.click(await screen.findByRole('option', { name: errandPublished.name }));
// ...
await user.click(screen.getByRole('combobox', { name: 'Workflow' }));
await user.click(await screen.findByRole('option', { name: kanbanPublished.name }));
```

Lines 431/436 (test: "the move gate follows the SAVED binding") — same shape, `errandPublished` then `approvalPublished`:
```tsx
await user.click(combobox);
await user.click(await screen.findByRole('option', { name: errandPublished.name }));
// ...
await user.click(combobox);
await user.click(await screen.findByRole('option', { name: approvalPublished.name }));
```
(`combobox` is already the variable name bound at the original line 430's `const combobox = await screen.findByRole('combobox', { name: 'Workflow' });` — keep that line as-is, only the two `selectOptions` calls that follow it change shape.)

Lines 463/473 (test: "a mapping dialog in flight keeps the workflow it was opened for") — `combobox` is bound once at the original line 462 (`const combobox = await screen.findByRole('combobox', { name: 'Workflow' });`, unchanged):
```tsx
// before
await user.selectOptions(combobox, errandPublished.id);
// ...
await user.selectOptions(combobox, approvalPublished.id);
// after
await user.click(combobox);
await user.click(await screen.findByRole('option', { name: errandPublished.name }));
// ...
await user.click(combobox);
await user.click(await screen.findByRole('option', { name: approvalPublished.name }));
```

Lines 496/511 (test: "the completed move names the workflow it actually moved to") — same shape, `combobox` bound at the original line 495:
```tsx
// before
await user.selectOptions(combobox, errandPublished.id);
// ...
await user.selectOptions(combobox, approvalPublished.id);
// after
await user.click(combobox);
await user.click(await screen.findByRole('option', { name: errandPublished.name }));
// ...
await user.click(combobox);
await user.click(await screen.findByRole('option', { name: approvalPublished.name }));
```

- [ ] **Step 4: Update the class assertion at line 263**

```tsx
// before
expect(screen.getByRole('combobox', { name: 'Workflow' })).toHaveClass('gn-field__input');
// after — role query is unchanged (Workflow stays a combobox), only worth
// re-confirming it still passes now that the element is Select's own
// searchable trigger rather than a native <select>
expect(screen.getByRole('combobox', { name: 'Workflow' })).toHaveClass('gn-field__input');
```

No code change needed here beyond re-running it — flagged explicitly so it isn't missed as "nothing to do here" during review.

- [ ] **Step 5: Run the full test file**

Run: `pnpm --filter @gisik-nokma/app-core test -- ticket-types.test.tsx > /tmp/select-task7.log 2>&1; tail -100 /tmp/select-task7.log`
Expected: all tests PASS, including the 5 `state-mapping-dialog` "Send them to" `selectOptions` calls (lines 390, 471, 501, 522, 552) which are **untouched** — that dialog's combobox stays a native `<select>` in Phase 1.

- [ ] **Step 6: Typecheck**

Run: `pnpm --filter @gisik-nokma/app-core typecheck > /tmp/select-task7-typecheck.log 2>&1; tail -40 /tmp/select-task7-typecheck.log`
Expected: passes.

- [ ] **Step 7: Commit**

```bash
git add packages/app-core/src/workflow-builder/ticket-types/ticket-type-editor-screen.tsx packages/app-core/test/ticket-types/ticket-types.test.tsx
git commit -m "Migrate the Workflow select to the shared Select component

Searchable mode. Rewrites the rebind() helper (covers 8 tests) plus
the standalone Workflow selectOptions calls to click-and-pick; the
role query is unchanged since a searchable trigger is still a
combobox. The state-mapping dialog's own selects are untouched —
out of Phase 1 scope.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 8: Multi-select with chips, ×-removal, and `maxSelected`

**Files:**
- Modify: `packages/ui/src/select/select.tsx`
- Modify: `packages/ui/src/ui.css`
- Modify: `packages/ui/test/select.test.tsx`

**Interfaces:**
- Produces (widened to the spec's full discriminated union):
  ```ts
  export type SelectProps =
    | { multiple?: false; options: SelectOption[]; value: string | null;
        onChange: (value: string) => void; searchable?: boolean;
        placeholder?: string; disabled?: boolean; 'aria-label'?: string }
    | { multiple: true; options: SelectOption[]; value: string[];
        onChange: (value: string[]) => void; searchable?: boolean;
        maxSelected?: number; placeholder?: string; disabled?: boolean; 'aria-label'?: string };
  ```
- Consumes: `RemoveIcon` from `./select-icons.js` (Task 2).

No live call site consumes this in Phase 1 (none of the 15 audited native `<select>` sites use `multiple`) — proven entirely through direct component tests, per the spec.

- [ ] **Step 1: Write the failing tests**

```tsx
describe('Select — multiple', () => {
  it('renders selected values as chips with a remove button each', () => {
    render(<Select multiple options={FRUIT} value={['apple', 'banana']} onChange={vi.fn()} aria-label="Fruit" />);
    expect(screen.getByText('Apple')).toBeInTheDocument();
    expect(screen.getByText('Banana')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^Remove /ig })).toHaveLength(2);
  });

  it('clicking a chip’s × removes it from value', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Select multiple options={FRUIT} value={['apple', 'banana']} onChange={onChange} aria-label="Fruit" />);
    await user.click(screen.getByRole('button', { name: 'Remove Apple' }));
    expect(onChange).toHaveBeenCalledWith(['banana']);
  });

  it('Backspace removes the last chip when the filter text is empty', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Select multiple searchable options={FRUIT} value={['apple', 'banana']} onChange={onChange} aria-label="Fruit" />);
    const input = screen.getByRole('combobox', { name: 'Fruit' });
    await user.click(input);
    await user.keyboard('{Backspace}');
    expect(onChange).toHaveBeenCalledWith(['apple']);
  });

  it('selecting an option adds it to value without removing existing selections', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Select multiple options={FRUIT} value={['apple']} onChange={onChange} aria-label="Fruit" />);
    await user.click(screen.getByRole('button', { name: /Fruit/ }));
    await user.click(await screen.findByRole('option', { name: 'Cherry' }));
    expect(onChange).toHaveBeenCalledWith(['apple', 'cherry']);
  });

  it('stale values not present in options are silently dropped from the chip list', () => {
    render(<Select multiple options={FRUIT} value={['apple', 'durian']} onChange={vi.fn()} aria-label="Fruit" />);
    expect(screen.getByText('Apple')).toBeInTheDocument();
    expect(screen.queryByText('durian')).not.toBeInTheDocument();
  });

  it('hitting maxSelected shows an aria-live message and further picks are no-ops, not disabled', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <Select multiple options={FRUIT} value={['apple', 'banana']} onChange={onChange} maxSelected={2} aria-label="Fruit" />,
    );
    await user.click(screen.getByRole('button', { name: /Fruit/ }));
    const cherry = await screen.findByRole('option', { name: 'Cherry' });
    expect(cherry).not.toHaveAttribute('aria-disabled', 'true');
    await user.click(cherry);
    expect(onChange).not.toHaveBeenCalled();
    const message = await screen.findByText('Max 2 selected');
    expect(message.closest('[aria-live]')).toHaveAttribute('aria-live', 'polite');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @gisik-nokma/ui test -- select.test.tsx > /tmp/select-task8-red.log 2>&1; tail -40 /tmp/select-task8-red.log`
Expected: FAIL — `multiple` prop not handled.

- [ ] **Step 3: Implement**

Widen `SelectProps` to the discriminated union above. Add a multi-select branch: internal selection state is a `Set<string>` derived from `value`; `useListState` (from `@react-stately/list`) with `selectionMode="multiple"` backs the listbox so option rows can show `aria-selected` for every chosen item, not just one. The trigger renders chips (own small internal component, not the existing `Chip` from `packages/ui/src/components/chip.tsx` — that component always renders a status dot and has no remove affordance; multi-select's chips are a different job, a removable tag, not a tone indicator) plus either the placeholder/empty state or (if `searchable`) the filter input alongside the chips.

```tsx
// packages/ui/src/select/select.tsx — sketch, merge with existing branches
import { RemoveIcon } from './select-icons.js';

function SelectChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="gn-select__chip">
      {label}
      <button type="button" className="gn-select__chip-remove" aria-label={`Remove ${label}`} onClick={onRemove}>
        <RemoveIcon />
      </button>
    </span>
  );
}

// inside Select(props), when props.multiple is true:
const selectedSet = new Set(props.value);
const selectedOptions = props.options.filter((option) => selectedSet.has(option.value));
const atMax = props.maxSelected !== undefined && selectedSet.size >= props.maxSelected;
const [maxMessage, setMaxMessage] = useState<string | null>(null);

function toggle(optionValue: string) {
  if (selectedSet.has(optionValue)) {
    props.onChange(props.value.filter((v) => v !== optionValue));
    return;
  }
  if (atMax) {
    setMaxMessage(`Max ${props.maxSelected} selected`);
    return;
  }
  props.onChange([...props.value, optionValue]);
}

function removeLast() {
  if (props.value.length === 0) return;
  props.onChange(props.value.slice(0, -1));
}
```

Render the chips inside the trigger (before the input, if `searchable`), and render `maxMessage` in a `<span aria-live="polite">{maxMessage}</span>` sibling of the trigger, clearing it (`setMaxMessage(null)`) on the next successful selection or on blur — pick whichever the tests above actually require and no more (they only assert the message appears; clearing behavior isn't under test here, so implement the simplest correct clear — on the next open of the panel — rather than inventing an untested timeout).

Wire `onKeyDown` on the searchable variant's `<input>` to call `removeLast()` on `Backspace` only when `inputProps`'s current value is empty (react-aria's `useComboBoxState` exposes the current input text via `state.inputValue`).

**The open panel itself** reuses `SelectListBox`/`SelectOptionRow` from Task 3/6 — it is not a third, separate rendering path. Two changes make those shared components multi-select-aware:

1. Whichever state hook backs the panel (`useSelectState`/`useComboBoxState`) is constructed with `selectionMode: 'multiple'` and `selectedKeys: selectedSet` instead of `selectedKey: value` when `props.multiple` is true, and `onSelectionChange` becomes `(keys) => props.onChange([...keys].map(String))` instead of the single-key callback.
2. `SelectOptionRow`'s `isSelected` check changes from an equality test to a set-membership test that works for both modes:
   ```tsx
   const isSelected =
     'selectedKeys' in state ? state.selectedKeys.has(item.key) : state.selectedKey === item.key;
   ```
   Clicking an option in multi-select mode does **not** close the panel (react-aria's multi-select-mode listbox already keeps it open by default when `selectionMode` is `'multiple'`) — that's what lets a user pick several options in one open/close cycle, matching the chips-inside-the-box interaction described in the spec.

- [ ] **Step 4: Add chip CSS**

```css
.gn-select__chip {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.15rem 0.4rem;
  border-radius: 999px;
  background: var(--gn-surface);
  font-size: 0.85em;
}
.gn-select__chip-remove {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.5rem;
  height: 1.5rem;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--gn-border);
  cursor: pointer;
}
```

(Per the spec's accessibility addendum: chips render on `--gn-surface` — the same background as the trigger box — so the remove icon's `color: var(--gn-border)` stays covered by the already-verified `{ fg: 'border', bg: 'surface', minimum: 3 }` `CONTRAST_PAIRS` row rather than needing a new one. `1.5rem` = 24px, the WCAG 2.2 SC 2.5.8 minimum for this desktop-first app.)

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @gisik-nokma/ui test -- select.test.tsx > /tmp/select-task8-green.log 2>&1; tail -80 /tmp/select-task8-green.log`
Expected: PASS, all prior tests still PASS.

- [ ] **Step 6: Typecheck**

Run: `pnpm --filter @gisik-nokma/ui typecheck > /tmp/select-task8-typecheck.log 2>&1; tail -40 /tmp/select-task8-typecheck.log`
Expected: passes.

- [ ] **Step 7: Commit**

```bash
git add packages/ui/src/select/select.tsx packages/ui/src/ui.css packages/ui/test/select.test.tsx
git commit -m "Add multi-select mode to Select: chips, ×-removal, maxSelected

Chips are a distinct internal component, not the existing Chip
(which always renders a status dot with no remove affordance — a
different job). maxSelected shows an aria-live message rather than
disabling remaining options, per the owner's explicit choice. No live
call site yet — proven via direct component tests, per the spec.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 9: Per-option icon and description

**Files:**
- Modify: `packages/ui/src/select/select.tsx`
- Modify: `packages/ui/src/ui.css`
- Modify: `packages/ui/test/select.test.tsx`

**Interfaces:**
- Produces (final `SelectOption` shape, matching the spec exactly):
  ```ts
  export type SelectOption = { value: string; label: string; icon?: ReactNode; description?: string };
  ```

- [ ] **Step 1: Write the failing tests**

```tsx
const WITH_ICONS: SelectOption[] = [
  { value: 'apple', label: 'Apple', icon: <span data-testid="apple-icon" />, description: 'A crisp fruit' },
  { value: 'banana', label: 'Banana' },
];

describe('Select — option icon and description', () => {
  it('renders an option’s icon and description when provided', async () => {
    const user = userEvent.setup();
    render(<Select options={WITH_ICONS} value={null} onChange={vi.fn()} aria-label="Fruit" />);
    await user.click(screen.getByRole('button', { name: 'Fruit' }));
    const apple = await screen.findByRole('option', { name: /Apple/ });
    expect(within(apple).getByTestId('apple-icon')).toBeInTheDocument();
    expect(within(apple).getByText('A crisp fruit')).toBeInTheDocument();
  });

  it('an option with neither icon nor description renders without error', async () => {
    const user = userEvent.setup();
    render(<Select options={WITH_ICONS} value={null} onChange={vi.fn()} aria-label="Fruit" />);
    await user.click(screen.getByRole('button', { name: 'Fruit' }));
    expect(await screen.findByRole('option', { name: 'Banana' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @gisik-nokma/ui test -- select.test.tsx > /tmp/select-task9-red.log 2>&1; tail -40 /tmp/select-task9-red.log`
Expected: FAIL — icon/description not rendered.

- [ ] **Step 3: Implement**

Widen `SelectOption` with `icon?: ReactNode; description?: string`, and update `SelectOptionRow`'s rendering (shared by every mode, since it was factored into one component in Task 6):

```tsx
<li {...optionProps} ref={ref} className="gn-select__option" data-focused={isFocused || undefined}>
  {item.value.icon ? <span className="gn-select__option-icon">{item.value.icon}</span> : null}
  <span className="gn-select__option-text">
    <span className="gn-select__option-label">{item.rendered}</span>
    {item.value.description ? <span className="gn-select__option-description">{item.value.description}</span> : null}
  </span>
  {isSelected ? <CheckIcon /> : null}
</li>
```

(`item.value` here is the original `SelectOption` object react-aria's collection keeps alongside `item.rendered` — confirm the exact accessor by checking the `Node<T>` type react-aria's collection API returns for the installed version; if it's not `.value`, it's `.props` or the item itself depending on version, per `node_modules/@react-stately/collections/dist/*.d.ts`.)

- [ ] **Step 4: CSS for icon/description layout**

```css
.gn-select__option-icon { flex: none; display: flex; }
.gn-select__option-text { display: flex; flex-direction: column; flex: 1; }
.gn-select__option-description { font-size: 0.85em; color: var(--gn-text-muted); }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @gisik-nokma/ui test -- select.test.tsx > /tmp/select-task9-green.log 2>&1; tail -100 /tmp/select-task9-green.log`
Expected: PASS — this is the full `select.test.tsx` suite now; confirm every describe block from Tasks 2–9 is green together, not just the new one.

- [ ] **Step 6: Typecheck**

Run: `pnpm --filter @gisik-nokma/ui typecheck > /tmp/select-task9-typecheck.log 2>&1; tail -40 /tmp/select-task9-typecheck.log`
Expected: passes.

- [ ] **Step 7: Commit**

```bash
git add packages/ui/src/select/select.tsx packages/ui/src/ui.css packages/ui/test/select.test.tsx
git commit -m "Add per-option icon and description support to Select

Completes the SelectOption shape from the spec. No current option in
either Phase-1 call site uses this yet — it's here because the owner
asked for the capability now, matching the component's public
contract, and Phase 2 sites may need it.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 10: Live verification against the dev stack

**Files:** none (verification only).

The automated accessible-name ratchet (`apps/web/e2e-stack/viewport.spec.ts`'s `MUST_NAME`/route list) and the non-text-contrast roster's tracked routes do **not** currently include the ticket-type editor screen (`/w/:workspaceId/settings/ticket-types/:typeId` or the inlined `/settings?tab=ticket-types&typeId=...`) — both tools' route lists cover `/settings/ticket-types` (the list screen, which shows rows, not the editor's selects) and five other routes, none of which render either migrated select. Confirmed by reading both route lists directly rather than assumed. So there is no baseline to re-record — but nothing automated watches this screen either, which is exactly why this task exists: manual verification, matching how the owner's own prior styling fixes on this screen were checked (live against the running dev server), per project practice.

- [ ] **Step 1: Start the dev stack**

Use whatever this repo's existing `run` workflow/skill or documented dev-stack boot sequence is (check `docs/superpowers/plans/2026-08-20-11-deployment-dogfooding.md` or the root `README`/`package.json` `dev` script if one exists) rather than guessing a command — this plan doesn't reproduce that sequence since it's unrelated to Select and already documented elsewhere.

- [ ] **Step 2: Open the ticket-type editor and exercise both migrated selects**

Navigate to a workspace's `/settings?tab=ticket-types&typeId=<some-type>` (or the standalone `/w/<id>/settings/ticket-types/<typeId>` route — both render the same underlying screen). For **each** of `hig`, `minimal`, `neo` × light/dark (the style/theme toggles already on `/account`):

- Workflow select: click to open, confirm the panel appears with visible elevation (especially neo — this is the shadow-only case), type to filter, confirm the checkmark shows on the current selection, select a different workflow, confirm it saves correctly (existing save flow, unchanged).
- Field-type select on a field row: click to open, confirm the panel and checkmark render correctly, select a type, confirm the row updates (e.g. picking `select` reveals the options textarea, matching existing behavior).
- Tab to each control with the keyboard only (no mouse) and confirm both open/navigate/select correctly, and that the focused-option outline (`--gn-focus-ring`) is visibly distinct from the row background in every style.

- [ ] **Step 3: Confirm the list screen is unaffected**

Visit `/settings/ticket-types` (the one route both automated tools *do* track) and confirm it renders unchanged — it doesn't contain either migrated select, so this should be a non-event; confirming it rather than assuming it is the cheap insurance against a shared-CSS-selector regression (e.g. a Select class name accidentally colliding with something the list screen also uses).

- [ ] **Step 4: Record what was checked**

No file changes from this task, but note in the eventual PR description (or this plan's own task-completion note, per whichever execution mode is chosen) which styles/themes were actually exercised and on which routes — "verified live" without naming what was checked is exactly the kind of unfalsifiable claim this project's own conventions warn against.

---

### Task 11: `Features.md`, `test-cases/10-workflow-builder.md`, and citation check

**Files:**
- Modify: `Features.md`
- Modify: `test-cases/10-workflow-builder.md`

- [ ] **Step 1: Re-confirm the next free case number**

Run: `grep -n "^- 10\.[0-9]*" test-cases/10-workflow-builder.md | tail -5`
Expected: highest is `10.76` (as of this plan's writing) — if a different session has since added more, start after whatever the real highest is instead of `10.77`.

- [ ] **Step 2: Add test cases**

Append to the "Ticket-type editor inlined on `/settings`" section of `test-cases/10-workflow-builder.md` (the section the two migrated selects both live under), using the same `- 10.NN ✅ <description> — <test file>("<test name>")` format as 10.71–10.76:

```markdown
- 10.77 ✅ The Field-type select renders as the shared neumorphic Select (button trigger, portal panel, checkmark on the current selection) instead of a native `<select>` — `select.test.tsx`, `ticket-types.test.tsx`
- 10.78 ✅ The Workflow select renders as the shared Select in searchable mode — trigger is a typeable combobox showing the current workflow's name, typing filters the list — `select.test.tsx`, `ticket-types.test.tsx`
- 10.79 ✅ Select's multi-select mode: selected options render as removable chips, hitting `maxSelected` shows an aria-live message rather than disabling remaining options — `select.test.tsx` (no live call site yet; proven at the component level, per the Phase 1 spec's decomposition)
```

- [ ] **Step 3: Update `Features.md`**

Add a sub-bullet under the existing ticket-type-management bullet (the one this session's earlier styling work already touched, near line 62-64 per the "Round 19e" note) noting the Workflow/Field-type selects now use the shared `Select` component; and a new bullet under the shared-component-set line (near line 33) introducing `Select` itself:

```markdown
- ⚙️ **Shared `Select` component** (`packages/ui/src/select/`) — neumorphic single-select, searchable
  combobox, and multi-select-with-chips, built on `@react-aria`/`@react-stately`. First runtime
  dependency `packages/ui` has taken on. Phase 1 migrates the ticket-type editor's Workflow and
  Field-type selects; the other 13 native `<select>` sites are Phase 2.
```

(Exact insertion point: read the current text around those two line numbers first — `Features.md` may have shifted since this plan was written, given it's one of the files already modified on this branch — and match the file's own bullet style rather than the snippet above verbatim.)

- [ ] **Step 4: Run the citation check**

Run: `pnpm check:citations > /tmp/select-task11-citations.log 2>&1; tail -40 /tmp/select-task11-citations.log`
Expected: passes (no duplicate case IDs, every citation resolves).

- [ ] **Step 5: Commit**

```bash
git add Features.md test-cases/10-workflow-builder.md
git commit -m "Document the shared Select component in Features.md and test-cases

Cases 10.77-10.79 cover the Field-type migration, the Workflow
searchable migration, and multi-select's component-level proof.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 12: Final full-suite verification

**Files:** none.

- [ ] **Step 1: Full typecheck**

Run: `pnpm typecheck > /tmp/select-final-typecheck.log 2>&1; tail -60 /tmp/select-final-typecheck.log`
Expected: passes across every package, not just `ui`/`app-core`.

- [ ] **Step 2: Full test suite**

Run: `pnpm test > /tmp/select-final-test.log 2>&1; tail -100 /tmp/select-final-test.log`
Expected: passes. (Not piped into `head` — read the tail of the log file, and if anything failed, open the full log file directly rather than re-running with a truncated pipe.)

- [ ] **Step 3: Build**

Run: `pnpm build > /tmp/select-final-build.log 2>&1; tail -60 /tmp/select-final-build.log`
Expected: passes — this is the step that would catch `packages/ui`'s new dependency failing to resolve in a real build (not just vitest's module resolution).

- [ ] **Step 4: Confirm scope**

Run: `git diff --stat origin/owner/workspace-edits...HEAD -- 'packages/app-core/src/**/*.tsx' | grep -v 'fields-editor\|ticket-type-editor-screen'`

Wait — this branch has substantial pre-existing uncommitted work unrelated to Select; scope this check to **this plan's own commits** instead: `git log --oneline` since Task 1's commit, and confirm the `packages/app-core/src` diff across all of them touches only `fields-editor.tsx` and `ticket-type-editor-screen.tsx` — no other of the 13 out-of-scope native `<select>` sites should appear in any commit this plan made.

Expected: clean — only the two named files, plus the `packages/ui`, test, and doc files this plan created/touched.
