# Shared neumorphic Select component — Phase 2 design spec

**Status:** approved by owner, ready for `writing-plans`.
**Date:** 2026-09-14

## Purpose

Phase 1 (spec: `docs/superpowers/specs/2026-09-10-shared-select-phase-1-design.md`, plan:
`docs/superpowers/plans/2026-09-10-shared-select-phase-1.md`) built the shared `Select` component
in `packages/ui/src/select/` and migrated exactly two call sites (the ticket-type editor's Workflow
and Field-type selects) as proof the pattern works end-to-end. It is complete: built, reviewed,
live-QA'd across all six style×theme combinations, with zero open Critical/Important findings.

Phase 2 is the rollout: migrate every remaining native `<select>` in the app onto the same
component. **No new component work is in scope** — `Select`'s public API, behavior, and visual
integration are already built and are not being changed here. This spec is about *which sites*,
*in what order*, and the handful of per-site decisions (searchable or not; how each site's
"unset" sentinel maps onto the component's `value: T | null` contract) that Phase 1's two sites
didn't already settle by precedent.

## Audit (fresh, 2026-09-14 — supersedes Phase 1 spec's audit, which is now stale)

Phase 1's spec counted 15 native `<select>` sites (16 counting a since-corrected false positive).
That count no longer holds: unrelated UI work landed on this branch since Phase 1's audit,
converting `StyleToggle` from a `SegmentedControl` to a native `<select>` and moving it onto
`/account`. A fresh `grep -rn "<select"` across `apps/` and `packages/` (excluding `reference/`,
tests, and `Select`'s own source/comments) finds **13 real sites**, none using the `multiple`
attribute:

| # | Site | File |
|---|---|---|
| 1 | Invite Channel | `apps/web/app/w/[workspaceId]/members/page.tsx` |
| 2 | Invite Role | `apps/web/app/w/[workspaceId]/members/page.tsx` |
| 3 | Style select | `apps/web/src/style-toggle.tsx` |
| 4 | State Category | `packages/app-core/src/workflow-builder/ui/state-node.tsx` |
| 5 | Target state (per dropped state) | `packages/app-core/src/workflow-builder/ui/state-mapping-dialog.tsx` |
| 6 | Field choice | `packages/app-core/src/workflow-builder/ui/rule-editors/require-field-editor.tsx` |
| 7 | Target user/state | `packages/app-core/src/workflow-builder/ui/rule-editors/require-different-user-editor.tsx` |
| 8 | Target state (rebind) | `packages/app-core/src/workflow-builder/ticket-types/workflow-rebind-dialog.tsx` |
| 9 | Transition target state | `packages/app-core/src/views/transition-dialog.tsx` |
| 10 | Ticket Type | `packages/app-core/src/views/new-ticket-dialog.tsx` |
| 11 | Parent ticket | `packages/app-core/src/views/new-ticket-dialog.tsx` |
| 12 | Reopen target state | `packages/app-core/src/views/reopen-dialog.tsx` |
| 13 | List Grouping | `packages/app-core/src/views/ticket-list.tsx` |

`account/page.tsx` remains a false positive for the same reason Phase 1 noted (it only renders
`<StyleToggle />`, site #3 above). `ticket-list.tsx`'s "Columns" picker is a checkbox group, not a
`<select>` — correctly excluded.

**Remaining `userEvent.selectOptions(...)` test-interaction surface, counted fresh (not reconciled
against Phase 1's old 62-call figure, which mixed in the now-migrated sites):**

| Test file | Calls | Likely site(s) |
|---|---|---|
| `apps/web/test/style-toggle.test.tsx` | 2 | Style select |
| `apps/web/test/members-page.test.tsx` | 1 | Channel and/or Role |
| `packages/app-core/test/ticket-types/ticket-types.test.tsx` | 5 | Workflow-rebind-dialog — confirmed via `grep -n selectOptions -B6`: all 5 target `getByRole('combobox', { name: `Send them to — ${state.name}` })`, workflow-rebind-dialog's own accessible-name pattern; not the already-migrated Workflow/Field-type selects |
| `packages/app-core/test/workflow-builder/access.test.tsx` | 1 | one of the Wave B sites |
| `packages/app-core/test/workflow-builder/publish.test.tsx` | 8 | Wave B sites (canvas/rule-editor flows) |
| `packages/app-core/test/workflow-builder/canvas.test.tsx` | 1 | State Category |
| `packages/app-core/test/workflow-builder/rule-editors.test.tsx` | 2 | Field choice / Target user-state |
| `packages/app-core/test/views/reopen-flow.test.tsx` | 5 | Reopen target state |
| `packages/app-core/test/views/transition-dialog.test.tsx` | 12 | Transition target state |
| `packages/app-core/test/views/ticket-sheet.test.tsx` | 7 | Ticket Type / Parent ticket |
| `packages/app-core/test/views/ticket-list.test.tsx` | 4 | List Grouping |

Exact per-call attribution to a specific site is left for each wave's implementation plan to
enumerate precisely (matching Phase 1's own spec's practice) — the counts above are a grounded
starting point, not a final assignment.

## Non-goals (Phase 2)

- No changes to `Select`'s public API, visual design, or token usage — Phase 1 already settled
  all of that; Phase 2 sites consume the component exactly as it stands.
- No multi-select rollout — none of the 13 sites use `multiple`, so Phase 2 exercises only the
  single-select mode (searchable and non-searchable), same as Phase 1's two sites.
- No new icon or dependency work.

## Wave grouping and sequencing

Split into 3 waves by package, each independently planned (its own `writing-plans` document) and
executed via `subagent-driven-development` through to a clean final review before the next wave
starts — matching Phase 1's own per-task review discipline, just applied at wave granularity too.

- **Wave A — `apps/web`** (3 sites): Invite Channel, Invite Role, Style select.
- **Wave B — `packages/app-core` workflow-builder UI** (5 sites): State Category, Target state
  (state-mapping-dialog), Field choice, Target user/state, Target state (rebind).
- **Wave C — `packages/app-core` views** (5 sites): Transition target state, Ticket Type, Parent
  ticket, Reopen target state, List Grouping.

## Per-site classification

All 13 sites are single-select. `searchable` follows Phase 1's own precedent (fixed small enum →
non-searchable; user-created/potentially-large set → searchable), settled during brainstorming:

| Site | `searchable` | Why |
|---|---|---|
| Invite Channel | No | Fixed 3-value enum (email/sms/whatsapp) |
| Invite Role | No | Fixed 3-value enum (admin/member/guest) |
| Style select | No | Fixed 3-value enum (hig/minimal/neo) |
| State Category | No | Fixed 3-value enum (open/active/terminal) |
| Target state ×5 (state-mapping-dialog, require-different-user-editor, workflow-rebind-dialog, transition-dialog, reopen-dialog) | No | Workflow states are user-created but small in practice — owner's explicit ruling: treat as a small enum by default; reclassify a specific site later only if a real workflow shows this assumption wrong |
| Field choice | No | Bound to a fixed, small field-type enum |
| List Grouping | No | Fixed small enum of view modes |
| Ticket Type | **Yes** | User-created; owner's explicit ruling to treat like Phase 1's Workflow select (searchable) rather than like the workflow-state pickers, even though today's observed counts (5-6 per workspace) are small |
| Parent ticket | **Yes** | Any existing ticket in the project is a candidate — genuinely unbounded in an active project |

(The "Target state" row covers 5 of the 13 sites — state-mapping-dialog, require-different-user-editor,
workflow-rebind-dialog, transition-dialog, and reopen-dialog all pick from "states in a workflow" and
share the same non-searchable ruling.)

## Wave B's one new architectural consideration: canvas-embedded select

`state-node.tsx`'s select renders inside a React Flow (`@xyflow/react`) canvas node — a
zoomable/pannable diagram surface, a context none of Phase 1's or Phase 2's other 12 sites have.
Two things already work in Select's favor: the panel is portal-rendered to `document.body` (so the
canvas's CSS transform doesn't distort it — `useOverlayPosition` reads real viewport coordinates via
`getBoundingClientRect()`), and the panel already closes on outside click, which means panning the
canvas (which requires a click-drag on the canvas background) closes the panel first, before any
visual detachment could happen.

**Ruling (owner-approved):** on a canvas zoom (mouse wheel, no click involved — the one interaction
that wouldn't trigger the existing outside-click close), close the panel rather than attempting to
track and reposition it live. This needs a wheel-event listener scoped to while the panel is open
on this one site — no change to `Select` itself, and no new positioning/tracking logic. Wave B's
plan should wire this at the call site (or via a small wrapper), not inside `packages/ui`.

## Value/placeholder migration pattern

Several sites use `<option value="" disabled hidden></option>` as an "unset" sentinel paired with a
plain `string` local state type. `Select`'s contract is `value: string | null` + `placeholder`
(already proven at Phase 1's Field-type select, which has the identical shape). Each site migrating
off this pattern changes its local state type from `string` (with `''` meaning unset) to
`string | null`, and drops the placeholder `<option>` in favor of the `placeholder` prop. This is a
mechanical, already-proven mapping — not a new design decision — but each wave's plan should call
it out explicitly per site since it's a real (if small) type change at each call site's state
management, not purely a rendering swap.

## Testing

Each wave's plan follows Phase 1's TDD pattern:

- Rewrite that wave's sites' `userEvent.selectOptions(...)` test calls to click-and-pick
  interactions (see the counted table above for a starting point; exact attribution per site is
  the plan's job to pin down).
- Add new test-case entries to the matching `test-cases/*.md` file(s) for each migrated site,
  `Features.md` updated in the same change set — same convention Phase 1 followed exactly.
- Wave B additionally needs a test for the canvas-zoom-closes-panel behavior on `state-node.tsx`.
- No new tests are needed against `packages/ui/select.test.tsx` itself — Phase 2 doesn't change the
  component, only its consumers.

## Open questions for the implementation plans (not blocking this spec)

- Exact per-call attribution of the `userEvent.selectOptions(...)` counts in the table above to
  specific sites — each wave's plan enumerates its own wave's exactly, rather than this spec
  guessing further.
- Whether `require-field-editor.tsx`/`require-different-user-editor.tsx`/`state-mapping-dialog.tsx`/
  `workflow-rebind-dialog.tsx`'s repeated-instance rendering (one select per array item) needs any
  new key-stability or focus-management care beyond what Phase 1's Field-type select (the same
  shape) already proved — expected to be a non-issue, confirm during implementation rather than
  speculating here.
- Whether Wave B's canvas-zoom-closes-panel wheel listener should live in `state-node.tsx` directly
  or as a small reusable hook if a similar need turns up at another canvas-embedded control later —
  a YAGNI call for Wave B's implementer to make once the actual code is in front of them; do not
  build a generic abstraction speculatively for a problem with exactly one instance today.
