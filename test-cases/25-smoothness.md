# §25 — Smoothness: loading, optimism and placeholders

**Opened 2026-10-02 by smoothness T1** (`docs/superpowers/plans/2026-10-02-smoothness.md`; spec `docs/superpowers/specs/2026-10-02-smoothness-design.md`, owner decisions D1–D13; audit `gisik-nokma-lanes/smoothness-2026-10-02/AUDIT.md`, findings SM-01–SM-16). Mirrors `Features.md` §22.

3-DIGIT PADDED `25.001`–`25.999`, blocks per task: T1 25.001–25.009 · T2 25.010–25.019 · T3 25.020–25.039 · T4 25.040–25.049 · T5 25.050–25.069 · T6 25.070–25.089 · T7 25.090–25.119 · T8 25.120–25.149 · T9 25.150–25.169 · T10 25.170–25.189 · T11 25.190–25.199 · T12 25.200–25.209 · T13 25.210–25.229 · T14 25.230–25.239.

## 25.1 Catalogue (T1)

- ❌ **25.001 — the bucket is registered in `test-cases/README.md` and the citations baseline, and `pnpm check:citations` passes with it empty (audit: none, the bucket's own registration).** Control: a case id cited by no test reddens the check.

## 25.2 Loading primitives (T2)

Amendment S-R1 (2026-10-02, spec "Amendment S-R1"): the skeleton fill is the new `surfacePlaceholder` role, and `Skeleton`'s shapes are the PARTS a screen's structural skeleton is built from. Tests: `packages/ui/test/{announce,use-wait,skeleton,skeleton-css,skeleton-role}.test.*`.

- ✅ **25.010 — a message reaches the ONE polite `role="status"` region; the same message twice is announced twice (cleared, then re-set across a frame); nothing is assertive; a second region renders nothing (audit SM-09: the silent loading arms).** Control: the second mount. Mutation: the clear removed → red.
- ✅ **25.011 — a read that resolves in 10 ms never shows a placeholder; one open at 150 ms does (audit SM-02).** Control: the same hook at 149 and 150 ms. Mutation: the 150 ms wait set to 0 → red.
- ✅ **25.012 — once shown, a placeholder stays for the 350 ms hold even when the read resolves 10 ms later (audit SM-02).** Mutation: the hold removed → red.
- ✅ **25.013 — `immediate`: a region that never had content shows its placeholder on the first render (audit SM-02).** Control: without the option the first render is bare.
- ✅ **25.014 — a `Skeleton` is `aria-hidden`, carries its shape class and size variables, repeats `rows` inside one wrapper; `line`, `block` and `circle` each render their own shape (the S-R1 parts) (audit SM-09).** Control: a single line has no wrapper. Mutation: the rows wrapper dropped → red.
- ✅ **25.015 — a `SkeletonRegion` is `aria-busy` and names what is loading once, visually hidden, with nothing focusable inside (audit SM-09).**
- ✅ **25.016 — `Pending` sets `aria-busy` at once and the dim class only after the wait; a busy `Button` is disabled, `aria-busy` and reads its busy label (audit SM-11, SM-03).** Control: the idle button. Mutation: busy stays enabled → red.
- ✅ **25.017 — the skeleton fill is `var(--gn-surface-placeholder)` (never the track, the well or the plain surface), the shape is radius tokens, and the pulse is one named keyframe on opacity only (audit SM-09).** Control: not `--gn-surface`. Mutation: fill from the track → red.
- ✅ **25.017b — every selector with an animation declaration in `ui.css` has a `prefers-reduced-motion: reduce` arm naming it (audit SM-14: the missing reduced-motion belt).** Control: a planted ungated animation is caught. Mutation: the reduced arm removed → red.
- ✅ **25.017c — `surfacePlaceholder` maps, in hig and minimal and both themes, to the primitive `surfaceTrack` uses and equals the value the 24.009 fixture recorded for the track, so their look does not change (S-R1 rule 3).** Control: in neo it is not the track. Mutation: hig light moved off the track primitive → red.
- ✅ **25.017d — in neo the role is a FLAT step one notch off `surface` toward the ink (light `#eae1d8`, dark `#2a314b`), never the well and never `surfaceTrack`/`surfaceWell`/`surfaceSunken`; no `CONTRAST_PAIRS` row names it (S-R1 rule 3).** Control: the well fails its own ordering. Mutation: neo light mapped to the well → red.
- ✅ **25.018 — reduced motion stops the pulse and leaves a static block (`opacity: 0.8`); the placeholder block names no style attribute (audit SM-14, SM-09).** Mutation: a `[data-style="neo"]` rule in the block, or the arm's `animation: none` removed → red.
- ✅ **25.019 — the placeholder block is appended after every earlier rule, and holds only `.gn-skeleton*`, `.gn-pending` and `.gn-skeleton-region` rules, so no earlier line range moves (audit SM-09).** Control: another family's selector fails the same pattern. Mutation: a `.gn-board-card` rule in the block → red.
