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
