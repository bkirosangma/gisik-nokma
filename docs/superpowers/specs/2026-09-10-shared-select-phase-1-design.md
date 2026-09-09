# Shared neumorphic Select component — Phase 1 design spec

**Status:** approved by owner, ready for `writing-plans`.
**Date:** 2026-09-10

## Purpose

The owner wants the ticket-type editor's Workflow select and Field-type select restyled to match a
neumorphic dropdown reference (floating custom options panel, checkmark on the selected option) — not
achievable via CSS alone on a native `<select>`, since no mainstream browser lets you restyle the open
option panel.

The owner scoped this as **one shared `Select` component for `@gisik-nokma/ui`, used app-wide** — not a
one-off restyle of just these two selects. Given the size of that migration (16 native `<select>` render
sites across the app as of this writing, 62 `userEvent.selectOptions(...)` test calls across 11 files —
see Audit below), the work is split into two independently-specced phases:

- **Phase 1 (this spec):** build the shared component itself, and migrate exactly the two selects that
  triggered the request (Workflow, Field-type) as proof the pattern works end-to-end, including their
  tests.
- **Phase 2 (separate spec, not written yet):** roll out to the remaining sites.

## Audit (re-verified 2026-09-10, supersedes the 2026-09-09 count)

- **16 native `<select>` render sites** (was 15 at the original 2026-09-09 audit — a new one appeared in
  `apps/web/app/account/page.tsx`, part of currently-uncommitted work, not yet audited for migration):
  `ticket-type-editor-screen.tsx` (Workflow), `fields-editor.tsx` (Field type), `state-node.tsx`,
  `state-mapping-dialog.tsx`, `rule-editors/require-field-editor.tsx`,
  `rule-editors/require-different-user-editor.tsx`, `workflow-rebind-dialog.tsx`, `transition-dialog.tsx`,
  `new-ticket-dialog.tsx` (×2 — type and parent), `reopen-dialog.tsx`, `ticket-list.tsx` ("group by"),
  `members/page.tsx` (×2), `style-toggle.tsx`, `account/page.tsx` (new, unaudited).
- **62 `userEvent.selectOptions(...)` calls across 11 test files** — count re-verified exact against the
  current tree: `style-toggle.test.tsx` (2), `members-page.test.tsx` (1), `ticket-types.test.tsx` (18),
  `access.test.tsx` (2), `publish.test.tsx` (8), `canvas.test.tsx` (1), `rule-editors.test.tsx` (2),
  `reopen-flow.test.tsx` (5), `transition-dialog.test.tsx` (12), `ticket-sheet.test.tsx` (7),
  `ticket-list.test.tsx` (4).
- None of the 16 sites use the `multiple` attribute — multi-select has no current native-`<select>`
  consumer, but is still a first-class mode of the new component per the owner's requirement (see API
  below); Phase 1 proves it only via direct component tests, not a live call site.
- `selectOptions` only works on a real native `<select>` — once a site migrates, its test interactions
  must be rewritten to click-and-pick. There is no way to keep both the custom look and the old test
  helper at any migrated site.

## Non-goals (Phase 1)

- No migration of any site beyond the two named above. The other 14 (including `account/page.tsx`) are
  Phase 2's concern and are not touched here.
- No new icon library. The component's built-in glyphs (checkmark, chip ×, search icon) are hand-drawn
  inline SVGs local to `packages/ui`, matching this codebase's existing convention (`icons.tsx`,
  `theme-toggle.tsx`'s sun/moon icons) of not taking a dependency for a handful of small glyphs. A
  consumer's per-option `icon` is a `ReactNode`, so a consumer is free to source it from a library later
  without `packages/ui` itself depending on one.

## Architecture

New component in `packages/ui/src/select/` (a folder, not a single file — trigger, panel, option row,
chip, and search input are each a distinct concern), exported as `Select` from `packages/ui`'s public
entry point alongside the existing `Button` etc.

`packages/ui` currently has **zero runtime dependencies** (react/react-dom are peer deps only). This
component is the first to add one: `react-stately` + `react-aria`.

**Why a dependency here:** this is no longer "restyle a native select" — it is an accessible combobox with
three interaction modes (plain select, searchable/filterable, multi-select-with-chips), each needing
correct keyboard navigation, focus management, portal-based positioning with viewport-aware flipping, and
screen-reader semantics. Hand-rolling that correctly, across three modes, on the first attempt, is a large
and easy-to-get-subtly-wrong surface — the kind of problem this codebase has already chosen not to
re-solve from scratch elsewhere (`packages/app-core` depends on `@xyflow/react` for the workflow canvas
for the same reason: a hard, well-solved problem).

**Why `react-aria`/`react-stately` specifically, over Radix or a hand-rolled + `floating-ui`-only
approach:** they are hooks-only with zero default markup or styling — nothing to override, so the
existing hig/minimal/neo token-driven styling applies cleanly with no fight against a component library's
own DOM/class conventions. Multi-select-with-chips (a tag list of selections plus a combobox to add more)
is a documented pattern in react-aria's own examples, not a novel composition being improvised on top of
generic primitives.

Hooks used: `useComboBoxState`/`useSelectState`/`useListState` (`react-stately`) for state;
`useComboBox` (searchable variant), `useSelect` (non-searchable variant), `useListBox`/`useOption`,
`useOverlayPosition` (portal + viewport-aware flip positioning) (`react-aria`).

## Public API

```ts
export type SelectOption = {
  value: string;
  label: string;
  icon?: ReactNode;
  description?: string;
};

// discriminated on `multiple` — TypeScript narrows value/onChange accordingly
export type SelectProps =
  | {
      multiple?: false;
      options: SelectOption[];
      value: string | null;
      onChange: (value: string) => void;
      searchable?: boolean;
      placeholder?: string;
      disabled?: boolean;
      'aria-label'?: string;
    }
  | {
      multiple: true;
      options: SelectOption[];
      value: string[];
      onChange: (value: string[]) => void;
      searchable?: boolean;
      maxSelected?: number;
      placeholder?: string;
      disabled?: boolean;
      'aria-label'?: string;
    };

export function Select(props: SelectProps): JSX.Element;
```

No `label` prop — every existing call site renders its own visible label externally
(`<label><span className="gn-field__label">Workflow</span><Select aria-label="Workflow" .../></label>`)
and passes `aria-label` for the accessible name. `Select` follows that same convention rather than
rendering a label itself, so migrated sites keep their existing wrapper markup unchanged.

## Data flow

Fully controlled, matching the shape every current call site already uses
(`value={def.workflowId} onChange={...}`) — the component owns no source-of-truth state for `value`, only
ephemeral UI state (open/closed, search text, focused option) via `react-stately`. Migrating a site is
close to a drop-in swap of the existing controlled pattern.

## Behavior details settled during brainstorming

- **Search box placement:** when `searchable`, the trigger itself becomes the typeable field (shows the
  selected label when closed, clears to a filter box when opened) — this is what `useComboBox` models
  directly. Not a separate search box bolted inside the panel with a static button trigger.
- **Unmatched single-select value:** if `value` doesn't match any option, the trigger shows `placeholder`
  text instead of throwing — mirrors the disabled-hidden-placeholder-option trick already used in
  `ticket-type-editor-screen.tsx`.
- **Unmatched multi-select values:** any entries in `value` that don't match a known option are silently
  dropped from the rendered chips (not shown, not an error).
- **Max-selection behavior:** hitting `maxSelected` shows a small inline message (e.g. "max 5 selected")
  near the control. Remaining unselected options stay visually enabled and clickable — clicking one beyond
  the cap is a no-op (message only), not a disabled/unpickable state, and does not bump the oldest
  selection to make room.
- **Chip removal:** each chip has an inline × to remove it by click; additionally, Backspace removes the
  last chip when the filter text is empty (standard tag-combobox affordance — flagged during design as an
  addition beyond what was explicitly requested, not objected to).

## Visual integration

- Panel is portal-rendered (via `useOverlayPosition`, escaping ancestor `overflow` — several Phase-2 sites
  are `*-dialog.tsx` components rendered inside `.gn-sheet__body { overflow-y: auto }`, which would clip
  an inline-absolute panel; settling the positioning strategy now avoids retrofitting every consumer
  later).
- Panel styled as a "raised" surface; under `neo`, `box-shadow: var(--gn-shadow-raised)` on the panel,
  matching the shadow-only-depth pattern already applied to `.ticket-type-list__row`/`.fields-editor__row`.
- Selected-option row shows a trailing checkmark (new inline SVG, local to `packages/ui` — not reused from
  app-core's `icons.tsx`; dependencies flow app-core → ui, never the reverse).
- Active/focused option row uses the existing fill-hierarchy hover/active tokens already used for other
  interactive rows.
- Chips: label text + inline × button, same stroke-icon visual language as the checkmark/search glyphs.

## Testing

- New `packages/ui/test/select.test.tsx`: open/select/close by click and by keyboard (Enter/Space open,
  arrows navigate, Enter select, Escape close-without-selecting); searchable filtering; multi-select chip
  add/remove (click × and Backspace); max-selection inline message with non-disabled remaining options;
  a neo-style shadow regression check on the panel; disabled state.
- Migrate exactly these 2 call sites:
  1. `ticket-type-editor-screen.tsx` — Workflow select → `searchable={true}` (workflow lists can grow with
     the workspace).
  2. `fields-editor.tsx` — Field-type select → `searchable={false}` (fixed 5-item enum).
- Rewrite the subset of `packages/app-core/test/ticket-types/ticket-types.test.tsx`'s `selectOptions(...)`
  calls that target these two selects to click-and-pick interactions. (Exact count of affected calls
  within the file's 18 is for the implementation plan to enumerate.)

## Accessibility review (ui-ux-pro-max consultation + token-system verification, 2026-09-10)

Checked against the actual token system and its existing verification machinery (`CONTRAST_PAIRS` in
`packages/ui/test/tokens.test.ts`, the e2e non-text-contrast tool and its `sanctionedWaivers` roster),
not just generic guidelines:

- **Checkmark icon**: `currentColor`, inheriting the selected row's already-verified text color — no new
  contrast pair needed.
- **Active/focused row (keyboard nav)**: reuse the existing `focusRing` token rather than inventing a new
  active-state color. It is already tested at `{ fg: 'focusRing', bg: 'surface', minimum: 3 }` in
  `CONTRAST_PAIRS` and clears with margin in every style/theme — reusing it inherits that verification
  instead of needing a new one.
- **Chip × remove button**: reuse `grayAccessible`/`grayAccessibleDark` — tokens this file already minted
  specifically for "the 3:1 a chip dot owes" (see the `grayAccessible` docblock) — rather than a new
  color. Touch target: WCAG 2.2 SC 2.5.8 (AA) requires 24×24px minimum, not the 44×44px mobile-HIG figure
  a generic checklist reaches for — this app is desktop pointer/keyboard-first, so ≥24×24px hit area with
  adequate spacing between adjacent chips is the real bar.
- **"Max selected" inert-but-not-disabled options** (new finding, not previously covered): the inline
  message must be exposed via an `aria-live="polite"` region (or equivalent), or a screen-reader user gets
  no explanation at all for why an option stops responding — worse than a plain `disabled` state for that
  population. This is now a Phase-1 implementation requirement, not an optional polish item.
- **Neo panel shadow-only elevation**: matches the exact pattern already fixed for
  `.ticket-type-list__row`/`.fields-editor__row`. The project's automated non-text-contrast tool cannot
  measure `box-shadow` boundaries (confirmed by the existing `sanctionedWaivers` entry for
  `[data-style="neo"] .gn-field__input`) — so the panel's neo elevation needs the same treatment: a new
  `sanctionedWaivers` entry in `non-text-contrast-roster.json` plus manual/visual verification, not an
  automated pass.

## Open questions for the implementation plan (not blocking this spec)

- Exact keyboard type-ahead timing/buffer (react-aria's default behavior is expected to be sufficient;
  confirm during implementation rather than specifying here).
- Whether `description` (secondary text per option) needs its own truncation/wrapping rule for very long
  values — no current option in the 2 Phase-1 sites has one, so there's no real content to design against
  yet.
- Phase 2 scope and sequencing (which of the remaining 14 sites first, how `account/page.tsx`'s new site
  gets folded into that audit) — a separate spec, out of scope here.
