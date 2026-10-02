# §24 — The neo refresh (rulings N1–N10)

**Opened 2026-10-02 by the neo refresh plan** (`docs/superpowers/plans/2026-10-02-neo-refresh.md`; spec `docs/superpowers/specs/2026-10-02-neo-refresh-design.md`; the bench the owner ruled from: `gisik-nokma-lanes/neo-mockup-2026-10-02/index.html`). Mirrors `Features.md` §21. Ships as the release after prefix/groups/UX fixes (`release/neo-refresh`).

3-DIGIT PADDED `24.001`–`24.999`, blocks per task: T1 24.001–019 · T2 24.020–039 · T3 24.040–059 · T4 24.060–069 · T5 24.070–079 · T6 24.080–099 · T7 24.100–109 · T8 24.110–129 · T9 24.130–139. Every case names its ruling ("N5") and a control in the same `it`.

## 24.1 The token layer (T1)

*Task 1. Every case: `packages/ui/test/neo-refresh.test.ts`.*

- ✅ **24.001 — the neo shadow primitives are derived from the surface, one lamp per theme (spec §3.1; N5, N8, N9).** Control: the retired brown/white strings are in no stylesheet. Pinned in `neo-refresh.test.ts`; the ratio 1.52 composites on paper.
- ✅ **24.002 — hig and minimal are byte-identical before and after (spec §6–7).** Control: neo's `raised` did move. Snapshot `packages/ui/test/fixtures/hig-minimal-shadows.before.json`, taken BEFORE any token edit.
- ✅ **24.003 — the sized pairs (spec §3.3; N7).** Control: hig's `raised-lg` is its `raised`, minimal's is `none`.
- ✅ **24.004 — the inset family sized to the box (spec §3.3; N9, N1).** Control: hig's `recess` is `none`, its `lift-press` unchanged.
- ✅ **24.005 — the neo field role: one crisp line per theme at ≥ 3:1 (spec §3.3, §5; N10).** Control: hig and minimal have no field role.
- ✅ **24.006 — filled surfaces carry no highlight (spec §4; N8).** Control: hig keeps its `action` / `lift` values. The press shades are the fill × 0.75.
- ✅ **24.007 — surfaces: sunken = the well, dark raised = the page hex (N2, N4 = B).** Control: hig's sunken and dark raised did not move. Placeholder floor: neo light `textSubtle` is the new `neoTextSubtleLight` `#5b5b5f` (4.68 composited on the well; the shared `#5e5e62` read 4.47, caught by 18.306).
- ✅ **24.008 — every new role reaches the stylesheet under every style × theme (13.411 extended).** Control: the sixteen names are counted six times each. The stylesheet declares each role as often as `raised` (9 times: six style×theme blocks plus three default blocks), not the plan's six.

## 24.2 Press inversion and the filled-fill rule (T2)

- ❌ **24.020 — the primary is a filled surface: one dark fall, a longer one on hover, a self-coloured inset on press (N8).**
- ❌ **24.021 — the confirm button takes the danger roles: a self-coloured red inset on press (N8).**
- ❌ **24.022 — a disabled filled button paints no shadow ("no depth" = "not interactive", U7 extended).**
- ❌ **24.023 — the button focus ring sits 3px out, so the accent edge and the ring read as one ring with a gap (Review Focus 3).**
- ❌ **24.024 — the on-switch knob carries one dark fall and no highlight (N8).**
- ❌ **24.025 — cards, doors and board cards press into the surface (N1): every `:active` site reads `lift-press`, which neo renders inset.**
- ❌ **24.026 — the drag clone keeps its lift while the source card presses (Review Focus 4).**

## 24.3 The sunken family and the rim-less neo field (T3)

- ❌ **24.040 — a neo text field has no rim; its recess edge is the boundary (N10; hig/minimal keep the ring).**
- ❌ **24.041 — the control recesses read `recess`; wells keep `sunken` (N9).**
- ❌ **24.042 — the task checkbox takes the chip-sized inset and keeps its strong border.**
- ❌ **24.043 — hover lifts, press recesses: the help toggle no longer presses on hover.**
- ❌ **24.044 — a neo field inside a dark well still has a visible edge (Review Focus 2).**

## 24.4 Depth on ghost and icon buttons (T4)

- ❌ **24.060 — ghost buttons keep their border and gain the quiet depth, through the base rule only (N3, 13.340).**
- ❌ **24.061 — icon buttons (the sheet close, the row actions) take the same quiet depth (N3).**
- ❌ **24.065 — reduced motion removes the transition, never the shadow (Review Focus 5).**

## 24.5 Switch and checkbox neo arms (T5)

- ❌ **24.070 — the neo switch: a recessed off track on the well colour, a raised knob, the accent on-track kept (N6, FD2).**
- ❌ **24.071 — the neo column checkbox: a recessed box when off, a flat accent when on (N6).**

## 24.6 Halo clearance (T6)

- ❌ **24.080 — the halo tokens: offset + blur of each raised pair, per style (spec §3.4; N7).**
- ❌ **24.081 — the board clears the card halo: 14px in neo, 8px in hig, through one token (N7; rule 02 amended).**
- ❌ **24.082 — the listed crowding sites clear their neighbour's halo (N7).**
- ❌ **24.083 — large surfaces wear the large pair; floating panels the `near-lg`; the two generic drops are gone (N7).**

## 24.7 The dark-theme sweep (T7)

- ❌ **24.100 — neo dark as a set (N4 = B): same-hex extrusion, one lamp, every text tier readable on every ground a field or card paints.**

## 24.8 Browser verification, LOCAL (T8)

*Task 8. `apps/web/e2e-stack/neo-depth.spec.ts`; 🧪 where the assertion is a screenshot judgement.*

- ❌ **24.110 — neo-light and neo-dark: the sign-in field's boundary is the recess line, not a border; the primary carries one fall and presses into its own blue (N8, N10).**
- ❌ **24.111 — neo-light and neo-dark: the help segmented track and the current nav item are recesses; the ghost button is raised (N3, N9).**
- ❌ **24.112 — neo-light and neo-dark: board cards sit 14px apart and 14px under the column title (N7).**
- ❌ **24.113 — the primary focus ring sits 3px outside the accent edge (Review Focus 3).**
- ❌ **24.114 — hig and minimal regression: the sign-in card, field, primary and ghost render the pre-refresh shadows (spec §6–7).**
