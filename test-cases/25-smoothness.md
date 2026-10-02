# §25 — Smoothness: loading, optimism and placeholders

**Opened 2026-10-02 by smoothness T1** (`docs/superpowers/plans/2026-10-02-smoothness.md`; spec `docs/superpowers/specs/2026-10-02-smoothness-design.md`, owner decisions D1–D13; audit `gisik-nokma-lanes/smoothness-2026-10-02/AUDIT.md`, findings SM-01–SM-16). Mirrors `Features.md` §22.

3-DIGIT PADDED `25.001`–`25.999`, blocks per task: T1 25.001–25.009 · T2 25.010–25.019 · T3 25.020–25.039 · T4 25.040–25.049 · T5 25.050–25.069 · T6 25.070–25.089 · T7 25.090–25.119 · T8 25.120–25.149 · T9 25.150–25.169 · T10 25.170–25.189 · T11 25.190–25.199 · T12 25.200–25.209 · T13 25.210–25.229 · T14 25.230–25.239.

## 25.1 Catalogue (T1)

- ❌ **25.001 — the bucket is registered in `test-cases/README.md` and the citations baseline, and `pnpm check:citations` passes with it empty (audit: none, the bucket's own registration).** Control: a case id cited by no test reddens the check.

## 25.36 Notification switches align at the row's end (G-4)

Owner 2026-10-02: "The switches are not aligned." Settings → Notifications is `/account`'s Notifications card; on a phone a two-line label dropped its switch below the text at the left while one-line rows kept it at the right. Block 25.360–25.369.

- ✅ **25.360 — a notification row is one line of layout: `.gn-account__notification-row` sets `flex-wrap: nowrap` and `justify-content: space-between` AFTER the shared four-selector base rule that wraps;** control (same `it`): the session, workspace and passkey rows still wrap and no rule narrows them to `nowrap`, and the base keeps `align-items: center`. Mutation: drop `flex-wrap: nowrap` → red. `apps/web/test/notification-switch-align.test.ts`.
- ✅ **25.361 — the label takes the column and wraps inside it, the switch is `flex: none`:** `.gn-account__notification-row .gn-switch__label` is `flex: 1 1 auto`, the shared label carries `min-width: 0`, `.gn-switch` is `flex: none`; control: the shared `.gn-switch__label` has no `flex` and `.gn-switch-row` no `justify-content` or `flex-wrap`, so Settings → Workspace's switch (control beside its own label) is unchanged. Mutation: drop the label's `flex` → red. `apps/web/test/notification-switch-align.test.ts`.
- 🧪 **25.362 — browser frame (the worktree on a lane port, signed in, `/account`) at 390, 360 and 430, neo dark/light and hig light: every row's switch right edge is the row's right edge (±1px), whatever the label's line count, and the switch is centred on its row.** Before: right edges 346 and 95 at 390 (spread 251px), 316 and 95 at 360, 386 and 95 at 430. After: spread 0.0 in all four frames, centre offset 0.0. Evidence in the DONE message of `task/smoothness-g4-g5-phone-fixes`.
