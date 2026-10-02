# Task 13 — neo-token measurement report

Generated entirely by `design-system/tools/neo_tokens_probe.py` from `design-system/interactive/{desktop,mobile}.dc.html`'s `<style>` block. No number below is hand-typed (MASTER.md's rule) — re-run the script to reproduce every one. Source of truth for the shipping product remains `packages/ui/src/tokens.ts`; this file is Task 13's measurement, feeding Task 14's transcription. It resolves nothing and adopts nothing.

**Controls.** Positive: the script asserts a real, >1 contrast reading before writing anything (see the script's `__main__` guard) — printed at run time. Negative: extraction is scoped to the single `<style>...</style>` block per file and asserts that block contains no markup/script markers (`<x-dc>`, `text/x-dc`, `<body>`) — a generated bundle elsewhere in either file cannot leak into these numbers.

## The palette-delta finding — a decision for the controller, not resolved here

The desktop file's `:root` reads `--surface:#EFE7DF` (warm paper) where the shipped palette (`packages/ui/src/tokens.ts`, `#353`) is cool `paper #f2f2f7`. Measured for **every** style, **both** themes, against the shipped code (not just `tokens.json`):

### desktop

| style | theme | role | exported | shipped (tokens.ts) | Δ(R,G,B) |
|---|---|---|---|---|---|
| hig | light | surface | `#EFE7DF` | `#f2f2f7` | (-3,-11,-24) |
| hig | light | raised | `#FBF7F3` | `#ffffff` | (-4,-8,-12) |
| hig | light | sunken | `#E4D8CC` | `#e5e5ea` | (-1,-13,-30) |
| hig | light | accent | `#33629F` | `#0040dd` | (+51,+34,-62) |
| hig | dark | surface | `#141A2E` | `#000000` | (+20,+26,+46) |
| hig | dark | raised | `#20294A` | `#1c1c1e` | (+4,+13,+44) |
| hig | dark | sunken | `#2A3560` | `#2c2c2e` | (-2,+9,+50) |
| hig | dark | accent | `#7FA9E4` | `#409cff` | (+63,+13,-27) |
| minimal | light | surface | `#EFE7DF` | `#f2f2f7` | (-3,-11,-24) |
| minimal | light | raised | `#FBF7F3` | `#ffffff` | (-4,-8,-12) |
| minimal | light | sunken | `#E4D8CC` | `#e5e5ea` | (-1,-13,-30) |
| minimal | light | accent | `#33629F` | `#0040dd` | (+51,+34,-62) |
| minimal | dark | surface | `#141A2E` | `#000000` | (+20,+26,+46) |
| minimal | dark | raised | `#20294A` | `#1c1c1e` | (+4,+13,+44) |
| minimal | dark | sunken | `#2A3560` | `#2c2c2e` | (-2,+9,+50) |
| minimal | dark | accent | `#7FA9E4` | `#409cff` | (+63,+13,-27) |
| neo | light | surface | `#F1EAE3` | `#f2f2f7` | (-1,-8,-20) |
| neo | light | raised | `#F1EAE3` | `#ffffff` | (-14,-21,-28) |
| neo | light | sunken | `#F1EAE3` | `#e5e5ea` | (+12,+5,-7) |
| neo | light | accent | `#33629F` | `#0040dd` | (+51,+34,-62) |
| neo | dark | surface | `#1B2340` | `#000000` | (+27,+35,+64) |
| neo | dark | raised | `#1B2340` | `#1c1c1e` | (-1,+7,+34) |
| neo | dark | sunken | `#1B2340` | `#2c2c2e` | (-17,-9,+18) |
| neo | dark | accent | `#7FA9E4` | `#409cff` | (+63,+13,-27) |

### mobile

| style | theme | role | exported | shipped (tokens.ts) | Δ(R,G,B) |
|---|---|---|---|---|---|
| hig | light | surface | `#EFE7DF` | `#f2f2f7` | (-3,-11,-24) |
| hig | light | raised | `#FBF7F3` | `#ffffff` | (-4,-8,-12) |
| hig | light | sunken | `#E4D8CC` | `#e5e5ea` | (-1,-13,-30) |
| hig | light | accent | `#33629F` | `#0040dd` | (+51,+34,-62) |
| hig | dark | surface | `#141A2E` | `#000000` | (+20,+26,+46) |
| hig | dark | raised | `#20294A` | `#1c1c1e` | (+4,+13,+44) |
| hig | dark | sunken | `#2A3560` | `#2c2c2e` | (-2,+9,+50) |
| hig | dark | accent | `#7FA9E4` | `#409cff` | (+63,+13,-27) |
| minimal | light | surface | `#EFE7DF` | `#f2f2f7` | (-3,-11,-24) |
| minimal | light | raised | `#FBF7F3` | `#ffffff` | (-4,-8,-12) |
| minimal | light | sunken | `#E4D8CC` | `#e5e5ea` | (-1,-13,-30) |
| minimal | light | accent | `#33629F` | `#0040dd` | (+51,+34,-62) |
| minimal | dark | surface | `#141A2E` | `#000000` | (+20,+26,+46) |
| minimal | dark | raised | `#20294A` | `#1c1c1e` | (+4,+13,+44) |
| minimal | dark | sunken | `#2A3560` | `#2c2c2e` | (-2,+9,+50) |
| minimal | dark | accent | `#7FA9E4` | `#409cff` | (+63,+13,-27) |
| neo | light | surface | `#F1EAE3` | `#f2f2f7` | (-1,-8,-20) |
| neo | light | raised | `#F1EAE3` | `#ffffff` | (-14,-21,-28) |
| neo | light | sunken | `#F1EAE3` | `#e5e5ea` | (+12,+5,-7) |
| neo | light | accent | `#33629F` | `#0040dd` | (+51,+34,-62) |
| neo | dark | surface | `#1B2340` | `#000000` | (+27,+35,+64) |
| neo | dark | raised | `#1B2340` | `#1c1c1e` | (-1,+7,+34) |
| neo | dark | sunken | `#1B2340` | `#2c2c2e` | (-17,-9,+18) |
| neo | dark | accent | `#7FA9E4` | `#409cff` | (+63,+13,-27) |

**Every role in every style is offset from the shipped palette, in both themes — not only the light-mode warm-paper case the dispatch named as the visible instance.** The dark-theme delta is the larger one: shipped dark `surface` is pure black `#000000`; the export's `hig`/`minimal` dark surface is a navy `#141A2E` (Δ +20,+26,+46) and `neo` dark surface is `#1B2340` (Δ +27,+35,+64) — a full hue shift, not a brightness adjustment.

**`accent` also differs, in every style and both themes** — this contradicts the amendment's reading of the design session ("the accent palette is unchanged"). Measured (desktop/`hig`, the value every style shares): light `#33629F` vs shipped `#0040dd` (Δ +51,+34,-62); dark `#7FA9E4` vs shipped `#409cff` (Δ +63,+13,-27). This is present identically in `hig` and `minimal`, not only `neo` — so it is not a neo-specific decision, it is a property of the whole exported base.

**Verdict, stated and not resolved:** every style in this export is a **palette change** from the shipped code — surface, raised, sunken AND accent all move, in both themes, uniformly across all three styles (neo changes nothing about surface/accent beyond what hig/minimal already changed — neo's *additional* delta is confined to introducing shadow as the elevation signal and flattening surface/raised/sunken to one value). Whether this is adopted as the new palette, treated as this export's own drift from an unstated separate palette decision, or reconciled back to `#353`'s increased-contrast set is the controller's call.

## The tint layer — the variables T3 and T4 moved

Every `--tint*` variable the export declares, per style and theme, as authored (`var()` references and `color-mix()` resolved). **This section was added 2026-09-18**, with the refresh that moved T3 and T4: before it this report had no tint row of any kind, so a halving of all five base tints and `--tintAccent` becoming derived could not have appeared in this file's own diff — the movement the 2026-09-18 prototype-delta audit named as the largest in the base had no instrument behind it.

### desktop

| style | theme | `--tintAccent` | `--tintDanger` | `--tintWarning` | `--tintPink` | `--tintPurple` | `--tintSuccess` |
|---|---|---|---|---|---|---|---|
| hig | light | rgba(51,98,159,0.07) | rgba(185,51,39,0.07) | rgba(240,124,52,0.10) | rgba(176,58,98,0.07) | rgba(76,74,143,0.07) | rgba(44,115,85,0.07) |
| hig | dark | rgba(127,169,228,0.1) | rgba(247,144,134,0.10) | rgba(247,169,97,0.10) | rgba(244,154,183,0.10) | rgba(183,180,244,0.10) | rgba(123,211,170,0.10) |
| minimal | light | rgba(51,98,159,0.07) | rgba(185,51,39,0.07) | rgba(240,124,52,0.10) | rgba(176,58,98,0.07) | rgba(76,74,143,0.07) | rgba(44,115,85,0.07) |
| minimal | dark | rgba(127,169,228,0.1) | rgba(247,144,134,0.10) | rgba(247,169,97,0.10) | rgba(244,154,183,0.10) | rgba(183,180,244,0.10) | rgba(123,211,170,0.10) |
| neo | light | rgba(51,98,159,0.07) | rgba(158,42,32,0.07) | rgba(240,124,52,0.10) | rgba(176,58,98,0.07) | rgba(76,74,143,0.07) | rgba(44,115,85,0.07) |
| neo | dark | rgba(127,169,228,0.1) | rgba(247,144,134,0.10) | rgba(247,169,97,0.10) | rgba(244,154,183,0.10) | rgba(183,180,244,0.10) | rgba(123,211,170,0.10) |

### mobile

| style | theme | `--tintAccent` | `--tintDanger` | `--tintWarning` | `--tintPink` | `--tintPurple` | `--tintSuccess` |
|---|---|---|---|---|---|---|---|
| hig | light | rgba(51,98,159,0.07) | rgba(185,51,39,0.07) | rgba(240,124,52,0.10) | rgba(176,58,98,0.07) | rgba(76,74,143,0.07) | rgba(44,115,85,0.07) |
| hig | dark | rgba(127,169,228,0.1) | rgba(247,144,134,0.10) | rgba(247,169,97,0.10) | rgba(244,154,183,0.10) | rgba(183,180,244,0.10) | rgba(123,211,170,0.10) |
| minimal | light | rgba(51,98,159,0.07) | rgba(185,51,39,0.07) | rgba(240,124,52,0.10) | rgba(176,58,98,0.07) | rgba(76,74,143,0.07) | rgba(44,115,85,0.07) |
| minimal | dark | rgba(127,169,228,0.1) | rgba(247,144,134,0.10) | rgba(247,169,97,0.10) | rgba(244,154,183,0.10) | rgba(183,180,244,0.10) | rgba(123,211,170,0.10) |
| neo | light | rgba(51,98,159,0.07) | rgba(158,42,32,0.07) | rgba(240,124,52,0.10) | rgba(176,58,98,0.07) | rgba(76,74,143,0.07) | rgba(44,115,85,0.07) |
| neo | dark | rgba(127,169,228,0.1) | rgba(247,144,134,0.10) | rgba(247,169,97,0.10) | rgba(244,154,183,0.10) | rgba(183,180,244,0.10) | rgba(123,211,170,0.10) |

These are RESOLVED cascade values, not per-arm declarations: a style/theme that does not override a tint shows the value it inherits. The distinction is visible in the table rather than asserted — `neo`/light's `--tintDanger` reads `rgba(158,42,32,0.07)` where `hig`/`minimal`/light read `rgba(185,51,39,0.07)`, because the light-neo arm is the only one that declares it. `--tintAccent` is likewise derived, not stored: it tracks `--accent` through `color-mix`, so the light row reads `rgba(51,98,159,…)` — the NEW accent — and would have followed the accent anywhere it moved. No cell is empty, which is the expected result here and the reason this table cannot be used to prove a variable is undeclared; `allResolvedVars` carries the merge, not the arm.

## Rule (a) — sunken input, shadow-edge contrast (owner-accepted waiver, still measured)

Owner ruling: the neo empty input takes the pure sunken/no-border look even where the shadow edge measures below 3:1. Measured anyway, per the ruling.

### desktop

| style | theme | mechanism | worst ratio | ≥3:1 |
|---|---|---|---|---|
| hig | light | fill (`fieldBg` vs `surface`) — no shadow declared | 1.1 | FAIL |
| hig | dark | fill (`fieldBg` vs `surface`) — no shadow declared | 1.24 | FAIL |
| minimal | light | fill (`fieldBg` vs `surface`) — no shadow declared | 1.1 | FAIL |
| minimal | dark | fill (`fieldBg` vs `surface`) — no shadow declared | 1.24 | FAIL |
| neo | light | shadow edge (worst of 2 layers) | **1.18** | FAIL |
| neo | dark | shadow edge (worst of 2 layers) | **1.16** | FAIL |

### mobile

| style | theme | mechanism | worst ratio | ≥3:1 |
|---|---|---|---|---|
| hig | light | fill (`fieldBg` vs `surface`) — no shadow declared | 1.15 | FAIL |
| hig | dark | fill (`fieldBg` vs `surface`) — no shadow declared | 1.24 | FAIL |
| minimal | light | fill (`fieldBg` vs `surface`) — no shadow declared | 1.15 | FAIL |
| minimal | dark | fill (`fieldBg` vs `surface`) — no shadow declared | 1.24 | FAIL |
| neo | light | shadow edge (worst of 2 layers) | **1.18** | FAIL |
| neo | dark | shadow edge (worst of 2 layers) | **1.16** | FAIL |

`hig` and `minimal` declare `--fieldShadow: none` in both files — they have **no shadow to measure**; their own fill-only boundary (`fieldBg` vs `surface`) is reported instead and is itself below 3:1 in every case measured (**pre-existing, not introduced by this amendment** — reported as a gap, not in this task's scope to fix).

## Rule (b) — a control keeps a fill or accent-weight label; shadow is not credited

Measured as the control fill (`ctlBg`/`chipBg`) composited over `surface`, WCAG 1.4.11's 3:1. `minimal` sets both to `transparent` — no fill boundary exists at all in that style, independent of this amendment.

### desktop

| style | theme | ctlBg vs surface | ≥3:1 | chipBg vs surface | ≥3:1 |
|---|---|---|---|---|---|
| hig | light | 1.2 | FAIL | 1.2 | FAIL |
| hig | dark | 1.45 | FAIL | 1.45 | FAIL |
| minimal | light | — | FAIL | n/a (transparent) | n/a |
| minimal | dark | — | FAIL | n/a (transparent) | n/a |
| neo | light | 1.0 | FAIL | 1.0 | FAIL |
| neo | dark | 1.0 | FAIL | 1.0 | FAIL |

### mobile

| style | theme | ctlBg vs surface | ≥3:1 | chipBg vs surface | ≥3:1 |
|---|---|---|---|---|---|
| hig | light | 1.2 | FAIL | 1.2 | FAIL |
| hig | dark | 1.45 | FAIL | 1.45 | FAIL |
| minimal | light | — | FAIL | n/a (transparent) | n/a |
| minimal | dark | — | FAIL | n/a (transparent) | n/a |
| neo | light | 1.0 | FAIL | 1.0 | FAIL |
| neo | dark | 1.0 | FAIL | 1.0 | FAIL |

**Every style, every theme, both devices fail 3:1 for control/chip fill against `surface`** — including `hig`, which is not part of this amendment. This is a pre-existing property of the exported base's fill ladder (the `fill3`-weight fills this file uses for controls are subtle by design), not something the neo direction introduces or worsens. Reported because rule (b) asked for the number; not this task's to fix.

## Rule (c) — dark theme separates by fill (shadow does not count)

### desktop

| style | surface | raised | sunken | surface↔raised | raised↔sunken | surface↔sunken |
|---|---|---|---|---|---|---|
| hig | `#141A2E` | `#20294A` | `#2A3560` | 1.21 | 1.2 | 1.46 |
| minimal | `#141A2E` | `#20294A` | `#2A3560` | 1.21 | 1.2 | 1.46 |
| neo | `#1B2340` | `#1B2340` | `#1B2340` | 1.0 | 1.0 | 1.0 |

### mobile

| style | surface | raised | sunken | surface↔raised | raised↔sunken | surface↔sunken |
|---|---|---|---|---|---|---|
| hig | `#141A2E` | `#20294A` | `#2A3560` | 1.21 | 1.2 | 1.46 |
| minimal | `#141A2E` | `#20294A` | `#2A3560` | 1.21 | 1.2 | 1.46 |
| neo | `#1B2340` | `#1B2340` | `#1B2340` | 1.0 | 1.0 | 1.0 |

**`neo` dark fails this rule outright: surface, raised and sunken are the identical hex value in both files (`#1B2340`), so every pairwise ratio measures exactly 1.00 — no fill separation exists.** `hig` and `minimal` share the same three dark colours (minimal does not override them) and clear a real but modest separation (~1.2–1.46). Neo's dark corner block (`body[data-theme="dark"][data-style="neo"]`) currently repaints `surface`, `raised`, `sunken` and `cardBg` to the same colour and relies entirely on `cardShadow`'s two-tone shadow for elevation — which rule (c) explicitly does not credit. **This is a real gap for Task 14 to close, not a design decision for this task to make.**

## Text/surface pairs (CONTRAST_PAIRS-style arithmetic, 4.5:1)

### desktop

**hig**

| theme | pair | ratio | pass |
|---|---|---|---|
| light | label on surface | 11.42 | PASS |
| light | label on raised | 13.11 | PASS |
| light | label on sunken | 9.97 | PASS |
| light | label2 on surface | 6.11 | PASS |
| light | label2 on raised | 6.65 | PASS |
| light | label3 on surface | 2.99 | FAIL |
| light | accent on surface | 5.07 | PASS |
| light | accent on raised | 5.81 | PASS |
| light | onColor on accent | 5.81 | PASS |
| dark | label on surface | 14.4 | PASS |
| dark | label on raised | 11.86 | PASS |
| dark | label on sunken | 9.86 | PASS |
| dark | label2 on surface | 9.56 | PASS |
| dark | label2 on raised | 8.13 | PASS |
| dark | label3 on surface | 5.18 | PASS |
| dark | accent on surface | 7.15 | PASS |
| dark | accent on raised | 5.89 | PASS |
| dark | onColor on accent | 7.15 | PASS |

**minimal**

| theme | pair | ratio | pass |
|---|---|---|---|
| light | label on surface | 11.42 | PASS |
| light | label on raised | 13.11 | PASS |
| light | label on sunken | 9.97 | PASS |
| light | label2 on surface | 6.11 | PASS |
| light | label2 on raised | 6.65 | PASS |
| light | label3 on surface | 2.99 | FAIL |
| light | accent on surface | 5.07 | PASS |
| light | accent on raised | 5.81 | PASS |
| light | onColor on accent | 5.81 | PASS |
| dark | label on surface | 14.4 | PASS |
| dark | label on raised | 11.86 | PASS |
| dark | label on sunken | 9.86 | PASS |
| dark | label2 on surface | 9.56 | PASS |
| dark | label2 on raised | 8.13 | PASS |
| dark | label3 on surface | 5.18 | PASS |
| dark | accent on surface | 7.15 | PASS |
| dark | accent on raised | 5.89 | PASS |
| dark | onColor on accent | 7.15 | PASS |

**neo**

| theme | pair | ratio | pass |
|---|---|---|---|
| light | label on surface | 11.72 | PASS |
| light | label on raised | 11.72 | PASS |
| light | label on sunken | 11.72 | PASS |
| light | label2 on surface | 6.21 | PASS |
| light | label2 on raised | 6.21 | PASS |
| light | label3 on surface | 3.01 | FAIL |
| light | accent on surface | 5.2 | PASS |
| light | accent on raised | 5.2 | PASS |
| light | onColor on accent | 5.81 | PASS |
| dark | label on surface | 12.87 | PASS |
| dark | label on raised | 12.87 | PASS |
| dark | label on sunken | 12.87 | PASS |
| dark | label2 on surface | 8.71 | PASS |
| dark | label2 on raised | 8.71 | PASS |
| dark | label3 on surface | 4.89 | PASS |
| dark | accent on surface | 6.39 | PASS |
| dark | accent on raised | 6.39 | PASS |
| dark | onColor on accent | 7.15 | PASS |

### mobile

**hig**

| theme | pair | ratio | pass |
|---|---|---|---|
| light | label on surface | 11.42 | PASS |
| light | label on raised | 13.11 | PASS |
| light | label on sunken | 9.97 | PASS |
| light | label2 on surface | 6.11 | PASS |
| light | label2 on raised | 6.65 | PASS |
| light | label3 on surface | 2.99 | FAIL |
| light | accent on surface | 5.07 | PASS |
| light | accent on raised | 5.81 | PASS |
| light | onColor on accent | 5.81 | PASS |
| dark | label on surface | 14.4 | PASS |
| dark | label on raised | 11.86 | PASS |
| dark | label on sunken | 9.86 | PASS |
| dark | label2 on surface | 9.56 | PASS |
| dark | label2 on raised | 8.13 | PASS |
| dark | label3 on surface | 5.18 | PASS |
| dark | accent on surface | 7.15 | PASS |
| dark | accent on raised | 5.89 | PASS |
| dark | onColor on accent | 7.15 | PASS |

**minimal**

| theme | pair | ratio | pass |
|---|---|---|---|
| light | label on surface | 11.42 | PASS |
| light | label on raised | 13.11 | PASS |
| light | label on sunken | 9.97 | PASS |
| light | label2 on surface | 6.11 | PASS |
| light | label2 on raised | 6.65 | PASS |
| light | label3 on surface | 2.99 | FAIL |
| light | accent on surface | 5.07 | PASS |
| light | accent on raised | 5.81 | PASS |
| light | onColor on accent | 5.81 | PASS |
| dark | label on surface | 14.4 | PASS |
| dark | label on raised | 11.86 | PASS |
| dark | label on sunken | 9.86 | PASS |
| dark | label2 on surface | 9.56 | PASS |
| dark | label2 on raised | 8.13 | PASS |
| dark | label3 on surface | 5.18 | PASS |
| dark | accent on surface | 7.15 | PASS |
| dark | accent on raised | 5.89 | PASS |
| dark | onColor on accent | 7.15 | PASS |

**neo**

| theme | pair | ratio | pass |
|---|---|---|---|
| light | label on surface | 11.72 | PASS |
| light | label on raised | 11.72 | PASS |
| light | label on sunken | 11.72 | PASS |
| light | label2 on surface | 6.21 | PASS |
| light | label2 on raised | 6.21 | PASS |
| light | label3 on surface | 3.01 | FAIL |
| light | accent on surface | 5.2 | PASS |
| light | accent on raised | 5.2 | PASS |
| light | onColor on accent | 5.81 | PASS |
| dark | label on surface | 12.87 | PASS |
| dark | label on raised | 12.87 | PASS |
| dark | label on sunken | 12.87 | PASS |
| dark | label2 on surface | 8.71 | PASS |
| dark | label2 on raised | 8.71 | PASS |
| dark | label3 on surface | 4.89 | PASS |
| dark | accent on surface | 6.39 | PASS |
| dark | accent on raised | 6.39 | PASS |
| dark | onColor on accent | 7.15 | PASS |

**Failures worth naming:** `neo`/light fails `label3 on surface` (2.96) and `accent on surface` (4.19) — both below 4.5. `label3`/`accent` pass in `neo`/dark. `hig` and `minimal` pass every listed pair in both themes on both devices.

## What this instrument could not measure — gaps, not passes

- **`--fill2` is not declared anywhere in `mobile.dc.html`** (checked: zero occurrences). `desktop.dc.html` declares it in every block that touches the fill ladder. Any mobile markup relying on `var(--fill2)` resolves to nothing. Owner: whoever builds Task 14's mobile styling — not resolved here.
- **No dedicated `overlay` box-shadow variable exists in either file.** `--overlay` is a background scrim colour only. Reported as absent, not as a measured pass.
- **`mobile.dc.html`'s `<style>` block omits the `:focus-visible` outline rule** that `desktop.dc.html` has (`outline:2px solid var(--accent)`). Not this task's rule to measure against, noted because it is directly adjacent to what was measured.
- **This instrument reads only the `<style>` block's custom-property cascade** — it does not render the file in a browser, so it cannot see computed values from inline `style=` attributes on individual elements in the markup/script body, if any exist outside the token layer. The token layer is what Task 14 transcribes, so this is the intended scope, stated rather than assumed complete.


## Neo refresh (N1–N10) — contrast floors after T1–T7 (appended 2026-10-02, T7)

**This section is NOT generated by `design-system/tools/neo_tokens_probe.py`.** The probe reads only the `<style>` block of the owner's exported prototype (`design-system/interactive/{desktop,mobile}.dc.html`), which predates the refresh: re-running it on 2026-10-02 rewrote this file byte-identical, so it cannot produce a neo-refresh row. The numbers below were computed from the built `packages/ui/dist/tokens.js` (`colorOf('light'|'dark', role, 'neo')` and the `shadowNeoLine*` primitives) with the WCAG 2.x relative-luminance formula, and are asserted by cases 24.005, 24.044 and 24.100 in `packages/ui/test/neo-refresh.test.ts`. **A later run of the probe rewrites the whole file and drops this section**; re-append it if that happens.

Grounds (neo): light — `surface` = `surfaceRaised` `#f1eae3`, `surfaceSunken` = `surfaceTrack` `#e6dcd2` (the well, N2); dark — `surface` = `surfaceRaised` `#1b2340` (N4 = B), `surfaceSunken` = `surfaceTrack` `#141a33`. Spec: `docs/superpowers/specs/2026-10-02-neo-refresh-design.md` §5.

| Pair | neo-light | neo-dark | Floor |
|---|---|---|---|
| `text` on `surfaceSunken` | 10.33 | 14.30 | 4.5 |
| `textMuted` on `surfaceSunken` | 8.09 | 14.47 | 4.5 |
| `textSubtle` (placeholder) on `surfaceSunken` | 4.77 | 6.82 | 4.5 |
| `textAccent` on `surfaceSunken` | 5.68 | 8.88 | 4.5 |
| field line (`shadowNeoLine*`, `#897362` / `#7d88a8`) on the field fill (`surfaceSunken`) | 3.31 | 4.86 | 3.0 (WCAG 1.4.11, one edge) |
| field line on the page (`surface`) | 3.75 | 4.38 | — (reported) |
| `focusRing` (`blue600` / `blue300`) on `surface` | 5.20 | 6.39 | 3.0 |
| `accent` on `surfaceRaised` | 5.20 | 6.39 | 3.0 |
| `text` on `surfaceTrack` (segmented bar, nav bar) | 10.33 | 14.30 | 3.0 |

Dark highlight ladder over the page `#1b2340` (the lift that replaced the `#232c50` fill step, N4 = B), composited and measured against the page: 16 % (`#f2e9e129`, raised) **1.58**; 12 % (`#f2e9e11f`, compact) 1.40; 8 % (`#f2e9e114`, sunken) 1.24. Case 24.100 asserts the 16 % row is above 1.5.

Not changed and not re-measured here: `fieldRim` (hig/minimal) on their surfaces; the accent edge on the primary. Nothing in either theme uses the shadow pair as its only state cue; the one place a shadow is the boundary, the neo field, carries a crisp line layer whose ratio is the row above.
