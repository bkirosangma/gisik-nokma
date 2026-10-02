# §25 — Smoothness: loading, optimism and placeholders

**Opened 2026-10-02 by smoothness T1** (`docs/superpowers/plans/2026-10-02-smoothness.md`; spec `docs/superpowers/specs/2026-10-02-smoothness-design.md`, owner decisions D1–D13; audit `gisik-nokma-lanes/smoothness-2026-10-02/AUDIT.md`, findings SM-01–SM-16). Mirrors `Features.md` §22.

3-DIGIT PADDED `25.001`–`25.999`, blocks per task: T1 25.001–25.009 · T2 25.010–25.019 · T3 25.020–25.039 · T4 25.040–25.049 · T5 25.050–25.069 · T6 25.070–25.089 · T7 25.090–25.119 · T8 25.120–25.149 · G-2 25.320–25.339 · T9 25.150–25.169 · T10 25.170–25.189 · T11 25.190–25.199 · T12 25.200–25.209 · T13 25.210–25.229 · T14 25.230–25.239.

## 25.1 Catalogue (T1)

- ❌ **25.001 — the bucket is registered in `test-cases/README.md` and the citations baseline, and `pnpm check:citations` passes with it empty (audit: none, the bucket's own registration).** Control: a case id cited by no test reddens the check.

## 25.G2 Neo shadows are not cut off by their containers (G-2)

Owner, 2026-10-02: *"many examples in both desktop and mobile, where due to containers, the lights and shadows are getting cut off in the UI."* (Settings → Groups, node "Animal Husbandry", cut along the top and left.) Block 25.320–25.339. The rendered result is judged by the detector; the token and the rules by unit cases.

- ✅ **25.320 — on every screen (workspace home, board, list, Settings → Groups, Settings general, notes list, one note, ticket sheet, My work), at 1440 and 390, in neo light and dark, no element with a box-shadow has any side of its painted rect cut by a clipping ancestor (selector, screen, viewport, theme and clipped px per side are listed; the allow-list is printed and empty).** Control: a flush fixture is reported cut and its padded twin is not, in the same test. Mutation: removing the Groups tree's reach padding reddens it on `div.gn-groups__box "Animal Husbandry"` (L14 T14 B14). `apps/web/e2e-stack/neo-shadow-clip.spec.ts`.
- ✅ **25.321 — `--gn-shadow-reach` is derived from the shadow table, not typed in: neo's value equals the largest outer layer (`max(|x|,|y|) + blur + spread`) of every in-container role, both themes, read back from the emitted CSS.** Control: the floating roles reach further (so excluding them does work), a layer's blur, offset or spread changes the reach, an inset layer adds nothing. `packages/ui/test/shadow-reach.test.ts`.
- ✅ **25.322 — the token is emitted for neo only (the three neo blocks); no hig or minimal block mentions it (24.002 byte-identity holds).** Control: the minimal blocks exist and are found. `packages/ui/test/shadow-reach.test.ts`.
- ✅ **25.323 — the board rail, the Groups tree, the notes tree and the phone chip row pad by the reach and cancel it with the equal negative margin (the rail also sets `scroll-padding-inline`), so nothing around them moves.** Control: the unscoped rules still scroll and keep the rail's own foot. `packages/ui/test/shadow-reach.test.ts`.
- ✅ **25.324 — the toolbar, the notes bar and the phone column picker above a padded scroller are positioned (with a stacking level where the scroller is itself a stacking context), so the reach strip takes none of their clicks.** Control: the notes tree really is positioned above 60rem. `packages/ui/test/shadow-reach.test.ts`.
- ✅ **25.325 — the composer slot keeps its corner clip and makes the room inside it: the toolbar strip and the footer sit one card halo from the slot edge.** Control: no rule restyles the slot itself. `packages/ui/test/shadow-reach.test.ts`.
- ✅ **25.326 — every rule that reads `--gn-shadow-reach` sits under `[data-style="neo"]`.** Control: the predicate flags a planted unscoped reader. `packages/ui/test/shadow-reach.test.ts`.
- ✅ **25.327 — on the same screens no interactive element loses a click to a negative-margin scroller's reach strip (probed at four edge points, skipping points the element's own clipping ancestors hide).** Control: a planted button under a negative-margin scroller is reported covered. `apps/web/e2e-stack/neo-shadow-clip.spec.ts`.
