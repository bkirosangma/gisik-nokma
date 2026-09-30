# §20 — Styling system

**Opened 2026-09-29 by Plan A of the styling refresh** (`docs/superpowers/plans/2026-09-29-styling-system-refresh.md`;
Plan B: `docs/superpowers/plans/2026-09-29-styling-system-refresh-b-screens.md`). Mirrors `Features.md` §17.
The design source is the plan's own "Design source" section (the owner-approved mockup, the twelve rules, the
owner's rulings); there is no separate spec.

## THE ID SHAPE

§20 is uniformly 3-digit padded: `20.001`–`20.999`, following §17–§19's ruling. Blocks are allocated per plan
in the table below. Take from your block, never from the tip.

| Plan | Block |
|---|---|
| A Foundation, board, sheet | `20.001`–`20.150` |
| B Every other screen | `20.201`–`20.600` |

**Write cases as `- ✅ **20.001 — …**` id LINES.** The guard (`scripts/check-case-ids.mjs`) counts id LINES and
nothing else; four spellings are invisible to it (a markdown **table row**, a **`##` heading**, a **backticked**
id inside the bold, and **two ids in one sentence**). After adding cases, confirm the count moved by EXACTLY
the number you added.

## 20.1 Tokens — grounds and edges

- ✅ **20.001 — `surfaceTrack` is the recessed-track ground: `#e8ded4` light / `#10152a` dark under hig and minimal, the neo surface under neo, and `text`/`textMuted`/`textSubtle` are declared pairs on it that clear 4.5 in every style × theme;** control: `surfaceSunken` measures below 1.5 against `surface` in hig light (1.14 — the flat fill that "vanishes"), and so does the track itself (1.08), which is why the track is identified by its `track` shadow (20.012), not its fill. Mutation: delete the three `surfaceTrack` rows from `CONTRAST_PAIRS`.
- ✅ **20.002 — `surfaceWell` is the well ground inside a raised panel: `#f3ece5` / `#1a213b` under hig and minimal, the neo surface under neo, with the same three text pairs at 4.5;** control: the well differs from `surfaceRaised` in hig light. Mutation: map `themes.dark.surfaceWell` to `navyRaised`.
- ✅ **20.003 — `accentEdge` is the primary button's edge: `#2d5488` light / `#bcd4f7` dark in every style, ≥ 3:1 on `surface` and `surfaceRaised` in every style × theme, and `accentText` on it (the hovered primary's fill) ≥ 4.5;** control: `accent` itself also clears 3 on `surface` (the fill is visible), so the edge is a second signal rather than the only one. Mutation: map `themes.dark.accentEdge` to `navySunken`.
- ✅ **20.004 — the accessible edge is the `border` role: declared ≥ 3:1 on `surfaceRaised` and `surfaceWell` (as well as `surface`), and no role in any style × theme resolves to `lineStrong`;** control: `lineStrong` on `warmPaper` measures below 3 (2.03) — the finding the mockup surfaced, pinned as a measurement of a primitive nothing uses. Mutation: remap `themes.light.border` to `lineStrong`.

## 20.2 Tokens — depth, radius, spacing, motion

- ✅ **20.011 — a shadow layer can carry a SPREAD, rendered as a fourth length (`0px 8px 16px -8px`), and every pre-existing layer renders byte-identically;** control: `sunken-compact` under neo still renders exactly `inset 2px 2px 4px #b098848c, inset -2px -2px 4px #fffffff2` (the value `tokens.test.ts:282-284` pins). Mutation: drop the spread term from `shadowLayerCss`.
- ✅ **20.012 — hig's nine new shadow roles are the mockup's values exactly, light and dark (lit edge + falling shadow; the near lift a 3-layer spread; press shallower; the track inset lit from above; the action shadows tinted by the accent in light), plus `lift-drag` — the dragged card, a 4-layer fall that reaches further than `lift-near` (40px down, 64px blur) built only from primitives the mockup roles already declare — and minimal renders `none` for all nine;** control: every new hig role is a different string from `raised`, and `lift-drag` differs from `lift-near`. Mutation: swap hig light `lift-near` and `lift-press`.
- ✅ **20.013 — neo expresses the same nine roles in its OWN dual-shadow language: `lift` = `raised`, `track` = `sunken`, `sheet` = `overlay`, `action-press` = `selected`, `action-near` = `raised`, `lift-near` is a LARGER raised pair than `lift` and `lift-drag` a larger one still (14/14/32), while `lift-press` and `action` are smaller;** control: no neo value contains a hig shadow primitive. Mutation: set neo light `lift` to hig's light `lift` layers.
- ✅ **20.014 — `radius.track` is the card radius plus the track's 8px padding in every style (hig/minimal 24px, neo 28px), so rule 05 (inner = outer − padding) holds per style;** control: `radius.card` is unchanged (16/16/20). Mutation: set neo's track to `24px`.
- ✅ **20.015 — the spacing steps (8/16/24) and the motion constants (100/200/220/300ms, `cubic-bezier(0.2, 0.8, 0.2, 1)`) are emitted exactly once, under the bare `:root`, and the stylesheet still opens with the font block;** control: no motion duration exceeds 300ms or falls below 100ms (rules 06). Mutation: emit them from `declarationsFor` instead (the count becomes 10 — one per style × theme block, nine, plus the bare `:root` block; measured).

## 20.3 The shared Button

- ✅ **20.021 — the primary Button is 48px tall with 24px side padding, a 17px semibold label, a pill radius, a 10px gap for its one icon, the accent fill and a 1px `accentEdge` edge on the `action` shadow (rules 01, 02, 03, 05);** control: the base Button — every quiet control — keeps the 44px floor. Mutation: set `.gn-button--primary`'s `min-height` to `2.75rem`.
- ✅ **20.022 — the primary Button comes toward the user on hover (`scale(1.04)`, `action-near`, the `accentEdge` fill) and is pushed back on press (`scale(0.98)`, `action-press`, in the 100ms feedback time), growing from `50% 60%`;** control: the resting primary declares no transform. Mutation: change the hover `scale(1.04)` to `scale(1)`.
- ✅ **20.023 — under `prefers-reduced-motion: reduce` the Button has no transition and the primary and danger hover/press transforms are `none`, written with the SAME selectors as the rules they cancel so the cancellation wins on source order;** control: outside the media arm the base transition names only `--gn-motion-*` durations. Mutation: drop `.gn-button--primary:hover:not(:disabled)` from the reduced-motion group.
- ✅ **20.024 — the ghost Button (every quiet control) is transparent with a 1px `border` edge — the accessible grey, ≥ 3:1 (20.004) — a `textMuted` 600 label and a soft `fillQuaternary` fill on hover;** control: the base rule paints no border, so a primary or danger never inherits the grey edge. Mutation: set the ghost's `border` to `none`.
- ✅ **20.025 — the danger Button shares the primary's geometry (48px, 24px, 17px) and its lift pair, on the NEUTRAL `lift` shadows rather than the accent-tinted `action` ones;** control: danger's resting shadow differs from primary's. Mutation: set `.gn-button--danger`'s `min-height` to `2.75rem`.
- ✅ **20.026 — motion discipline: no rule in `ui.css` declares `will-change` (a permanent containing block — the hazard recorded in D21, retired for the card hover but still true of `will-change`), and every Button transition names `--gn-motion-*` durations with the `--gn-motion-ease-out` curve;** control: the scan reads a stylesheet that does declare transitions. Mutation: add `will-change: transform;` to `.gn-button--primary`.
