/**
 * The one colour origin for every Gisik Nokma client (coordination amendment 11).
 * The base made this discipline literal: its viewer "holds no data and no colour
 * of its own" — every colour came from design-system/tokens.json as roles
 * resolved from primitives (reference/convenience-corner-tracker/README.md).
 * This file carries that forward: primitives are the palette, roles are the
 * meaning, and no colour literal is legal anywhere else in any client package
 * (enforced by test/token-discipline.test.ts).
 */

export type ThemeName = 'light' | 'dark';

/**
 * The style axis, added Task 14 (2026-09-09) beside `ThemeName`. `hig` is the
 * unmarked base — every selector below reaches it through bare `:root`, the
 * same way `light` is the unmarked theme, so `hig` needs no `[data-style]`
 * selector of its own. `minimal` and `neo` are runtime overrides, parallel to
 * `[data-theme="dark"]`.
 */
export type StyleName = 'hig' | 'minimal' | 'neo';

/**
 * ## Apple HIG increased-contrast, adopted 2026-09-08 (`docs/hig-adoption-brief.md` §8)
 *
 * Every hex below that changed is a real Apple **increased-contrast** system
 * colour — the accessible variants Apple ships beside the stock palette — not
 * the stock ones. That distinction is the whole reason this landed at all: the
 * brief measured Apple's STOCK palette against this file's own declared pairs
 * and **15 of 27 failed**. Adopting the pretty numbers would have meant either
 * a red gate or lowered minimums.
 *
 * ### Four values are deliberately NOT Apple's, and each is a decision
 *
 * * **`green700` `#1e7a34` is KEPT** (owner ruling, 2026-09-08). Apple's
 *   increased-contrast green `#248A3D` is the **single pair in the whole roster
 *   that still fails**: on the shipped `onColorWarmLight` `#fbf7f3` ground it
 *   measures **4.1233 against 4.5** (missing by 0.3767); the incumbent
 *   measures **5.0662** and sits within a hair of Apple's hue, so not moving it
 *   stays cheapest. 4.40 / 5.40 were the pure-white figures. Verified both ways.
 * * **`line` / `lineStrong` / `seam` / `seamStrong` are UNTOUCHED**, and that is
 *   a sequencing decision, not an oversight. Ruling R1 dropped borders in favour
 *   of fill, which means the `border` role must be remapped to a grey that
 *   clears 3:1 **and** the declarations that paint it must be removed. Those two
 *   are one atomic change and they land TOGETHER in the border sweep. Remapping
 *   here alone would give every card, chip, table cell and column on `main` a
 *   heavy dark rule that no gate would object to — a *darker* border fails
 *   nothing — and leave it there between two PRs, while the product is being
 *   tested by hand. The measurement that sweep starts from, taken here:
 *   `border` on `surface` is **1.34** light and **1.49** dark against the 3:1
 *   WCAG 1.4.11 holds a non-text UI component to.
 * * **`navy900`, `redInk`, `amberInk`, `greenInk` are untouched.** §8 says
 *   nothing about the text that sits ON a status colour in dark theme; all four
 *   were re-measured against the new backgrounds and clear their minimums
 *   (`accentText` on `accent` = 6.38 dark), so changing them would be churn
 *   wearing the word "consistency".
 * * **`inkMuted` and `fogMuted` are SOLID, where §8 gives an alpha.** The brief
 *   flags its own `textMuted` row as *"a reconstruction, not a citation"* —
 *   Apple's `secondaryLabel` is an alpha over the background and the 80% figure
 *   is the brief author's, explicitly marked not-to-be-quoted-as-Apple's. A
 *   composite would bake that unverified number into the palette and would
 *   differ per background besides. These are the solid base colours instead,
 *   which is a value Apple does publish, and they clear 4.5 on all three
 *   backgrounds with margin (light 8.71–10.94, dark 11.77–14.37).
 *
 * ### One role stopped sharing a primitive
 *
 * `textMuted` and `categoryOpen` both resolved to `inkMuted` before this. §8
 * gives them different values, and they cannot be reunited: `textMuted` is read,
 * so it owes 4.5 on `surface`, `surfaceRaised` AND `surfaceSunken`, while
 * `categoryOpen` reaches the screen as a chip dot's background and owes 3.
 * Apple's accessible grey `#6C6C70` is right for the dot and **fails the text
 * job at 4.16 on `surfaceSunken`** — so `grayAccessible` exists rather than one
 * grey being asked to do both and quietly losing.
 */
export const primitives = {
  white: '#ffffff',
  inkMuted: '#3c3c43',
  /** Untouched — the border story is atomic and lands with its sweep. */
  line: '#d9d6cf',
  lineStrong: '#a8a49a',
  /**
   * **RETIRED, Round 2d (2026-09-09) — owner ruling #386's accent, replaced
   * by the neo prototype's own `#3A6DB0`/`#7FA9E4`.** The old values
   * (`#0040DD`/`#409CFF`) are recorded here rather than deleted from history:
   * they were dark/saturated enough that `accent` doubled as safe TEXT on
   * every surface (6.02–7.09 light, 4.18–6.10 dark) with no separate role
   * needed. The new hexes do not clear that bar as text (4.19–4.30 on light
   * surfaces) — which is why `textAccent` (a new role, see `TOKEN_ROLES`)
   * exists as of this change instead of `accent` continuing to serve both
   * jobs. `focusRing` and `categoryActive` share this primitive and are
   * re-verified at their own (3:1, non-text) minimum against the new hue in
   * `packages/ui/test/tokens.test.ts` — both clear it with margin (light
   * 3.75–4.93, dark 4.11–7.15 across every surface any style ships).
   *
   * **MOVED 2026-09-18 (Step 2c-1), T1 of the prototype-delta audit:** the
   * 2026-09-18 export (`@6d7b67c0a52c`) changed `--accentPick` from `#3A6DB0`
   * to `#33629F`, and the product was still on the old hex — it had adopted the
   * PREVIOUS export's value. Re-derived rather than re-typed: `focusRing`,
   * `accent` and `categoryActive` all resolve through this primitive in LIGHT
   * theme, and `textAccentLight` is derived from it, so this one line moves
   * four roles and re-clears their floors. The new hue is DARKER, which moves
   * every one of those floors the favourable way — measured, `accent` on the
   * light `surface` goes 4.30 → 5.07 and on `surfaceRaised` 4.93 → 5.81 (see
   * `docs/neo-token-report.md`, regenerated with the tint layer this change
   * added). The dark accent `blue300` is NOT changed: the export's
   * `--accentDark` is untouched by this refresh.
   */
  blue600: '#33629f',
  blue300: '#7fa9e4',
  navy900: '#101625',
  red600: '#d70015',
  red300: '#ff6961',
  redInk: '#300a06',
  amber700: '#b25000',
  amber300: '#ffb340',
  amberInk: '#241a00',
  /** KEPT over Apple's `#248A3D`, which fails `successText` at 4.1233 vs 4.5 on `#fbf7f3`. */
  green700: '#1e7a34',
  green300: '#30db5b',
  greenInk: '#05230e',
  violet600: '#8944ab',
  violet300: '#da8fff',
  magenta600: '#d30f45',
  magenta300: '#ff6482',
  fogMuted: '#ebebf5',
  /** Untouched — see `line`. */
  seam: '#3a3833',
  seamStrong: '#57544c',
  scrimLight: '#1c1b1866',
  scrimDark: '#000000a6',
  /**
   * Apple's accessible grey, for the STATUS-DOT job only. Split out of
   * `inkMuted` because it fails the text minimum on `surfaceSunken` (4.16 vs
   * 4.5) while being exactly right at the 3:1 a chip dot owes.
   */
  grayAccessible: '#6c6c70',
  grayAccessibleDark: '#98989d',

  /**
   * ## The neo-round palette (owner ruling #386, 2026-09-09)
   *
   * Every value below was extracted programmatically by Task 13's probe
   * (`design-system/tools/neo_tokens_probe.py`) from the owner's exported
   * prototype (`design-system/interactive/{desktop,mobile}.dc.html`) —
   * `design-system/neo-tokens.json` is the record. **The ruling adopted this
   * palette for `surface`/`surfaceRaised`/`surfaceSunken`/`surfaceOverlay`/the
   * fill ladder/radii/shadows in EVERY style, including `hig`** — the shipped
   * cool palette is replaced (its `paper`/`sand`/`coal*` primitives are now
   * unused and removed), not kept as a `hig`-only holdout. `hig` and `minimal`
   * share one set (they render
   * identically except for shadow and non-text-boundary treatment); `neo`
   * has its own, distinguished below.
   *
   * Every hex is LOWERCASE — `primitives` is asserted against
   * `/^#[0-9a-f]{6}([0-9a-f]{2})?$/`, and the export's own casing is upper.
   */
  warmPaper: '#efe7df',
  warmRaised: '#fbf7f3',
  warmSunken: '#e4d8cc',
  navyBase: '#141a2e',
  navyRaised: '#20294a',
  navySunken: '#2a3560',
  /**
   * `neo` light: rule (c) (dark-only fill separation) leaves light alone — the
   * export's neo surface, raised and sunken are one hex, relying on shadow for
   * elevation.
   *
   * **MOVED 2026-09-18 (Step 2c-1), T5:** `#EDE4DB` → `#F1EAE3`, the refreshed
   * export's one-hex neo light surface. Every role that resolves to it
   * (`surface`, `surfaceRaised`, `surfaceSunken` in `neo`/light) moved with it,
   * and the neo light shadow-edge reading in `docs/neo-token-report.md` shifted
   * 1.24 → 1.18 as a consequence — a softer edge, reported rather than silent.
   * The neo-DARK surface `neoNavy` below is untouched: the refresh did not move
   * the dark-neo arm.
   */
  neoPaper: '#f1eae3',
  /**
   * ## The five `neo`-LIGHT semantic colours (T5, 2026-09-18)
   *
   * The refreshed export's light-neo arm declares semantic colours the base
   * `:root` does not: `--danger:#9E2A20`, `--warning:#8C4708`,
   * `--pink:#9A3054`, `--success:#25644A`, `--purple:#413F7C`. Until this
   * change the product's light-neo inherited the `:root` values, so every
   * danger/warning/success/contested/restricted surface in `neo` light was
   * drawn in a hue the export had already replaced.
   *
   * **These are primitives rather than role literals because `primitives` is
   * the palette and roles are the meaning** — the same reason every other hex
   * here lives at this level. They are named `neoLight*` rather than reusing
   * `red600`/`amber700`/`green700`/`magenta600`/`violet600` because they are
   * NOT those colours: the export deliberately darkens and desaturates each one
   * for a surface it also made lighter, and collapsing them back onto the
   * shared primitives would silently move `hig` and `minimal` too.
   *
   * Two of the five are named for the export's variable, not the product's
   * role, and the mapping is the interesting part — see
   * `STYLE_COLOR_OVERRIDES` below, which is where the pairing is declared:
   * the export's `--pink` is the product's `contested` (the contested chip
   * draws `var(--pink)`/`var(--tintPink)`) and its `--purple` is the product's
   * `restricted` (`var(--purple)`/`var(--tintPurple)` on the Restricted chip).
   * The export's `--tintDanger`/`--tintPink`/`--tintPurple`/`--tintSuccess`
   * washes are NOT ported: this product has no tint role for them, a refusal
   * already recorded at `ui.css:2088` and in `Features.md`.
   */
  neoLightDanger: '#9e2a20',
  neoLightWarning: '#8c4708',
  neoLightSuccess: '#25644a',
  neoLightContested: '#9a3054',
  neoLightRestricted: '#413f7c',
  /** `neo` dark surface — the export's own value, matching `neoPaper`'s light-mode role: ONE hex for surface/raised/sunken, depth from shadow alone. */
  neoNavy: '#1b2340',
  /**
   * **REVERTED to `neoNavy` (owner, 2026-09-10: "revert to prototype's
   * exact dark hex and fix the accent colour ratio instead" — in response
   * to the dark+neo input box reading visibly lighter/flatter than the
   * prototype's own screenshot).** These were previously stepped lighter
   * (see the retained derivation below) under owner ruling #386 to satisfy
   * a "dark surfaces must separate by fill" requirement (rule (c)) while
   * keeping the BARE `accent` role legible as TEXT against them at 4.5:1 —
   * a real constraint at the time the derivation below was written.
   *
   * **That constraint stopped binding the SAME DAY it was written, before
   * anyone next touched this file.** The Round 2d change (also
   * 2026-09-09) split `accent` into two roles — `accent` (a fill only, no
   * text guarantee) and `textAccent` (the role actually derived to read as
   * text; see `textAccentDark`'s own docblock, which independently accounts
   * for `neoNavySunken`) — so "does bare `accent` clear 4.5 as text against
   * `surfaceRaised`" is a question `CONTRAST_PAIRS` no longer asks: it
   * names `textAccent`, never `accent`, on `surface`/`surfaceRaised`. The
   * derivation below solved a problem that had already stopped existing by
   * the time this value was next revisited — it was never wrong, its
   * premise just went stale.
   *
   * **Verified empirically before reverting, not assumed:** with both
   * values set to `neoNavy`, every declared `CONTRAST_PAIRS` row for
   * `neo`/dark still passes — with MORE margin than before, because a
   * darker background only helps light-coloured foregrounds (`text`,
   * `textMuted`, `textAccent`, `accentText`) read more clearly, never less.
   * `tokens.test.ts`'s rule (c) separation test ("13.341") now exempts
   * `neo` from the dark-separation floor entirely, the same way it always
   * exempted `neo` in LIGHT (see `neoPaper`'s own comment above) — this
   * style's whole visual language is shadow-only depth, and holding dark
   * to a fill-separation floor light was never held to was the
   * inconsistency, not a rule `neo` needed to keep.
   *
   * The original derivation is kept below as the historical record of a
   * real, carefully-measured trade-off — it just no longer governs this
   * value.
   *
   * ---
   *
   * **DERIVED, not measured — ruling item 3(b) [SUPERSEDED, see above].**
   * The export's `neo` dark raised and sunken are the SAME hex as surface
   * (separation 1.00, rule (c) fails outright). The ruling requires
   * deriving steps giving at least `hig`/`minimal` dark's own separation
   * (surface↔raised 1.214, surface↔sunken 1.460, measured against
   * `#141a2e`/`#20294a`/`#2a3560`).
   *
   * **`surfaceRaised` falls narrowly short of that floor (1.204 vs 1.214,
   * −0.8%) and this is deliberate, not an error.** Lightening `neoNavy`
   * (`#1b2340`) far enough to hit 1.214 pushes its luminance past what keeps
   * `accent` (`#409cff`, kept SHIPPED by ruling item 2) at ≥4.5 against it —
   * a declared `CONTRAST_PAIRS` row (`accent` on `surfaceRaised`). The two
   * requirements are mathematically incompatible for this base/accent pair:
   * the luminance window `raised` would need occupies is empty by about
   * 0.00002 (an accent-side ceiling of L≈0.03242 against a separation-side
   * floor of L≈0.03262), independent of which hue is chosen — not a
   * near-miss to be nudged away, a genuine collision between the amendment's
   * two rulings. Recorded here rather than escalated because the accessible
   * value is the one already gated by a passing test (`CONTRAST_PAIRS` is
   * the harder, tested invariant across the whole project); the separation
   * shortfall is 99.2% of the target and both raised↔sunken (1.292 vs
   * 1.202) and surface↔sunken (1.555 vs 1.460) clear their floors with
   * margin. `accent` on `neoNavyRaised` measures 4.528. **This `accent`
   * pairing is itself retired — see above — which is exactly what makes
   * the collision moot rather than merely tolerated.**
   */
  neoNavyRaised: '#1b2340',
  neoNavySunken: '#1b2340',

  /**
   * The four-step FILL hierarchy R1(c) separates by. Eight-digit hex, not
   * `rgba()`, matching `scrimLight`'s precedent — `primitives` is asserted
   * hex-only. **These are ALPHA, and no `CONTRAST_PAIRS` row may name them**:
   * `relativeLuminance` ignores alpha by documented design, so a declared
   * pair on any of these would compute the fill's own colour against a
   * background it is actually blended INTO — a false green. They are
   * measured where they are real: the rendered sweep in
   * `apps/web/e2e-stack/helpers/non-text-contrast.ts` (which composites),
   * and `fillTertiary`'s own accent-on-filled check in `tokens.test.ts`.
   *
   * `hig`/`minimal`/`neo` share fill1/fill2 in LIGHT theme — same export
   * value both places.
   */
  fillWarmShared1: '#273a6333',
  fillWarmShared2: '#273a6326',
  /** `hig`/`minimal` light fill3/fill4 — untouched export values (no accessibility gate needs a nudge here; see fillNavyHig3 below for the theme that does). */
  fillWarmHig3: '#273a631c',
  fillWarmHig4: '#273a630f',
  /** `neo` light fill3/fill4 — a warmer (surface-toned) primitive than hig/minimal's, per the export. */
  fillWarmNeo3: '#b0988429',
  fillWarmNeo4: '#b098841a',

  /** `hig`/`minimal`/`neo` share fill1/fill2 in DARK theme. */
  fillNavyShared1: '#d8ccc142',
  fillNavyShared2: '#d8ccc136',
  /**
   * **NUDGED, not the export value — a regression Task 13's report never
   * measured.** `packages/ui/test/tokens.test.ts`'s existing case ("identifies
   * a non-primary control by its label, not its fill") composites
   * `fillTertiary` over `surface` and requires `accent` on the result ≥4.5 —
   * separate from the declared `CONTRAST_PAIRS` roster, so Task 13's sweep
   * never saw it. The export's dark fill3 (`rgba(216,204,193,0.16)`) composited
   * over the adopted navy surface (`#141a2e`) measures **4.222**, below 4.5 —
   * a genuine drop from the shipped palette's 5.944, because the adopted dark
   * surface is lighter than the shipped pure black. Nudged alpha
   * 0.16→0.13 (same hue, same rule the ruling uses elsewhere: "the nearest
   * value in the same hue") restores it to **4.558**. `fillNavyHig4` is
   * untouched — no gate composites it.
   */
  fillNavyHig3: '#d8ccc121',
  fillNavyHig4: '#d8ccc11a',
  /** `neo` dark fill4 — the export's own value, a different hue than hig/minimal's (surface-toned, not warm-white). No gate composites fill4, so it is untouched. */
  fillNavyNeo4: '#b098841a',

  /**
   * The invitation banner's warning wash — the prototype's `--tintWarning`
   * (`desktop.dc.html:20` light, `:40` dark). Eight-digit hex, not `rgba()`,
   * because `primitives` is asserted hex-only.
   *
   * **ALPHA, so no `CONTRAST_PAIRS` row may name it** — see the fill
   * hierarchy's docblock above for why that would be a false green. It is
   * measured where it is real, composited over `surface`, in
   * `test/tokens.test.ts`.
   *
   * All three styles share one value per theme: the prototype's `neo` block
   * (`desktop.dc.html:53-67`) overrides many tokens and this is not one of them.
   *
   * **HALVED 2026-09-18 (Step 2c-1), T3 — and this is the WHOLE of T3's product
   * footprint.** The export halved all five of its base tints in light and set
   * all five to one value in dark (`0.07/0.10/0.07/0.07/0.07` light, `0.10`
   * dark). The other four (`--tintDanger`, `--tintPink`, `--tintPurple`,
   * `--tintSuccess`) have **no product role to move**: `tintWarning` is the only
   * tint role this product has. **It has THREE consumers since 2026-09-18**: the
   * invitations banner (`.gn-invitations`), the attention strip (`.gn-attention`)
   * and the ticket-type editor's divergence notice
   * (`.ticket-type-editor__divergence`). **All three sit at page level on
   * `--gn-surface`, re-established per consumer rather than inherited** — the
   * full measurement for the third is recorded at its own consumer, in `ui.css`.
   * The export's
   * four unported washes are not an oversight here — the product declined a
   * purple wash on measurement (`ui.css:2088`: "no `--gn-tint-purple` role
   * exists or is added here", and `Features.md` records it as a declared
   * divergence). The audit's claim that these washes reach "chips, pills,
   * banners" was true of the EXPORT and false of the product; the product's
   * chips draw the fill ladder, not tints.
   *
   * Light `0.20 → 0.10`, dark `0.141 → 0.10`. Hue unchanged in both. Alpha
   * 0.10 is `0x1a`: the file's convention is round-half-up of `alpha * 255`,
   * the same arithmetic that produced the old `0.141 → 0x24` and `0.115 → 0x1d`.
   * The light theme's ratio IMPROVES (a lighter wash under dark warning text),
   * which is why no floor moved.
   */
  tintWarmWarning: '#f07c341a',
  tintNavyWarning: '#f7a9611a',

  /**
   * **NUDGED — the same regression as `fillNavyHig3`, worse here** because
   * `neo`'s dark surface (`#1b2340`) is lighter still: the export's own value
   * (`rgba(176,152,132,0.16)`) composited over it measures **4.191**. Nudged
   * alpha 0.16→0.115, same hue, restores **4.569**.
   */
  fillNavyNeo3: '#b098841d',

  overlayWarmHig: '#273a6357',
  overlayNavyHig: '#0a0e1a9e',
  overlayWarmNeo: '#b0988473',
  overlayNavyNeo: '#00000099',

  /**
   * Shadow LAYER COLOURS only — never a full `box-shadow` value, which is
   * geometry (unitless numbers, not a colour the token-discipline scanner
   * polices) plus one of these. `neo`'s raised and sunken treatments use
   * different alpha colours even within one theme (see `themeStylesheet`'s
   * `shadows` table), so each layer gets its own named primitive rather than
   * one shared "shadow" colour standing in for all four.
   */
  shadowHigLight: '#273a6329',
  shadowHigDark: '#060a16a8',
  shadowNeoRaisedDarkLight: '#b098848c',
  shadowNeoHighlightLight: '#fffffff2',
  shadowNeoSunkenDarkLight: '#b0988499',
  shadowNeoRaisedDarkDark: '#060a169e',
  shadowNeoRaisedHighlightDark: '#f2e9e112',
  shadowNeoSunkenDarkDark: '#00000099',
  shadowNeoSunkenHighlightDark: '#ffffff0d',
  /**
   * The ONE new primitive the `sunken-compact` shadow role needed (owner
   * round-3 correction, 2026-09-16: "too much shadow for a small badge").
   * `--chipShadow` (`design-system/interactive/desktop.dc.html:59` light,
   * `:71` dark) is the prototype's own smaller/2px-4px inset step, distinct
   * from `--fieldShadow`/`--trayShadow`'s 4px/9px. Three of its four layer
   * colours are BYTE-IDENTICAL to primitives this file already has —
   * `shadowNeoRaisedDarkLight` (`rgba(176,152,132,0.55)`, light layer 1),
   * `shadowNeoHighlightLight` (`rgba(255,255,255,0.95)`, light layer 2) and
   * `shadowNeoSunkenHighlightDark` (`rgba(255,255,255,0.05)`, dark layer 2)
   * — verified arithmetically, not eyeballed, so those three are reused as
   * `SHADOWS.neo.*.'sunken-compact'` entries below rather than duplicated
   * under a new name. Only the dark theme's FIRST layer has no match:
   * `rgba(0,0,0,0.55)` is a different alpha than `shadowNeoSunkenDarkDark`'s
   * `rgba(0,0,0,0.6)` (the field/tray dark shadow), so it needed its own
   * primitive. `0.55 × 255 = 140.25` → round `140` = `0x8c`.
   */
  shadowNeoSunkenCompactDarkDark: '#0000008c',

  /**
   * ## Round 2d additions (2026-09-09) — the sign-in neo alignment
   *
   * `brandOrange` is the export's one fixed hue (`--brand:#EE7733`, see the
   * `brand` role's docblock in `TOKEN_ROLES` for why it is pairless).
   */
  brandOrange: '#ee7733',

  /**
   * **DERIVED, not the export's own value — same discipline as
   * `neoNavyRaised` above.** `textAccent` (see `TOKEN_ROLES`) needs a colour
   * that is legible as READ TEXT — 4.5:1 — against every background it
   * actually renders on, in its own theme. The export's own accent hexes
   * as originally adopted (`#3A6DB0`/`#7FA9E4`, now `blue600`/`blue300`) did
   * NOT clear that bar as text at the time this was derived — see `blue600`'s
   * docblock for where T1 later moved the light one, and the re-verification
   * note below — and they were only ever measured as a FILL.
   *
   * **Re-verified 2026-09-18 (Step 2c-1, T1), when `blue600` moved to
   * `#33629f`.** The derivation below started from the PREVIOUS light accent
   * and produced `#325d97`, which is darker than either, so the result still
   * clears every background it was derived against. Re-measured after the
   * accent moved rather than assumed: **5.45** on `warmPaper`, **6.26** on
   * `warmRaised`, **4.76** on `warmSunken`, **5.60** in `neo` light. The start
   * point moved; the answer did not need to. Recorded because a derivation
   * whose premise changes and whose output is never re-checked is how a derived
   * value quietly becomes an inherited one.
   *
   * Derivation method (a throwaway script mirroring
   * `packages/ui/test/tokens.test.ts`'s own `contrastRatio`/
   * `relativeLuminance`/compositing (`over`) helpers, calibrated against this
   * file's own `neoNavyRaised` docblock number — `#409cff` on `#29314c`
   * reproduces the documented 4.528 exactly): starting from `#3A6DB0`, step
   * DARKER in the same hue/saturation (HSL) until the WORST of six light
   * backgrounds clears 4.5.
   *
   * Four are the declared `CONTRAST_PAIRS` rows' own backgrounds plus one
   * free extra: `warmPaper`/`warmRaised` (`hig`/`minimal`), `neoPaper` (`neo`
   * — one hex for all three surface roles), and `warmSunken`, included even
   * though no `CONTRAST_PAIRS` row names `surfaceSunken` because it is what
   * `.gn-help__result-title` (converted to `textAccent` by this same change)
   * renders on. **The fifth and sixth are the binding ones, and they are not
   * a surface at all**: `.gn-button--ghost`'s label (also converted here) sits
   * on `fillTertiary` COMPOSITED over `surface` — a translucent, blue-tinted
   * fill that reads measurably DARKER than the bare surface underneath it
   * (`fillWarmHig3` over `warmPaper` composites to `#D9D4D1`, `fillWarmNeo3`
   * over `neoPaper` to `#E7DDD4`). Deriving against the four surfaces alone
   * (an earlier pass here landed on `#33619C`) passed every declared row and
   * then FAILED at 4.29 against exactly this composite — caught by
   * `test/tokens.test.ts`'s own 13.284 case, which is why the composite is
   * folded into this derivation rather than left for that test to surface.
   *
   * **The two `neo` figures below moved on 2026-09-18 with T5, and the pair is
   * kept visible so the move is legible: `neoPaper` `#EDE4DB` → `#F1EAE3`
   * lightened the ground, so `neoPaper` goes 5.311 → **5.596** and the `neo`
   * ghost composite 4.755 → **4.984**, the composite hex `#E3D8CD` →
   * `#E7DDD4`.** Both still clear 4.5, and re-measured rather than assumed.
   * The BINDING constraint is untouched by the move, which is the point: it is
   * the `hig`/`minimal` composite, and T5 does not reach `hig`/`minimal`.**
   *
   * **STEPPED AGAIN 2026-09-21, `#325D97` → `#2D5488` (round-2 finding E4-31),
   * and this is the SEVENTH ground the derivation above did not have.** A ghost
   * button does not only sit on `surface`: on `/account` and `/mcp/tokens` it
   * sits on `surfaceSunken`, so the value that has to clear 4.5 is `fillTertiary`
   * composited over `warmSunken` (`#CFC7C0`), not over `warmPaper`. Measured:
   * **3.997**, below 4.5 — and `13.360` did not measure that triple, so nothing
   * in this file's own test surfaced it. The step is the same procedure as the
   * first derivation (darker in the same hue until the WORST ground clears); the
   * margin is deliberately a little larger than the old binding 4.539 because
   * this is now the tightest constraint in the table.
   *
   * **Re-measured at `#2D5488`:** `warmPaper` 6.276, `warmRaised` 7.202,
   * `warmSunken` 5.481, `neoPaper` 6.441, the `hig`/`minimal`
   * ghost-over-`surface` composite 5.224, the `neo` ghost-over-`surface`
   * composite 5.737, and the two NEW ones — `hig`/`minimal` ghost over
   * `warmSunken` **4.601** (the binding constraint) and `neo` ghost over
   * `neoPaper` 5.173. All eight ≥4.5. **`neo` needs no separate number for the
   * third composite and the reason is worth stating:** `neo`'s light override
   * maps `surfaceSunken` to `neoPaper` itself (`STYLE_COLOR_OVERRIDES` below),
   * so its sunken composite IS its `surface` composite. A first pass here
   * measured it against `#E7DDD4` as if it were a different ground and reported
   * a second, spurious failure at 4.494; the override is what makes that reading
   * wrong.
   *
   * The old numbers, kept so the move is legible: at `#325D97` the six were
   * `warmPaper` 5.453, `warmRaised` 6.258, `warmSunken` 4.762, `neoPaper`
   * 5.596, the `hig`/`minimal` composite 4.539 (then the binding constraint),
   * the `neo` composite 4.984.
   */
  textAccentLight: '#2d5488',

  /**
   * **DERIVED, dark half of `textAccentLight` above — and the direction is
   * NOT symmetric with the retired-hex history.** `#7FA9E4` (`blue300`) is
   * already LIGHTER than the retired `#409CFF`, so it happens to clear 4.5
   * against `navyBase`/`navyRaised`/`neoNavy`/`neoNavyRaised` unaided
   * (5.31–7.83) — a nudge-free result that looks like "dark needs no step".
   * **That reading is wrong once `surfaceSunken` is included**: `#7FA9E4` on
   * `neoNavySunken` (`#3B425B`) measures **4.110**, below 4.5 (and
   * `navySunken` alone is fine at 4.896 — the neo sunken hex is the one that
   * fails). So this value IS stepped, LIGHTER in the same hue, from
   * `#7FA9E4` (L≈0.6961) to `#8BB1E6` (L≈0.7241), until `neoNavySunken`
   * clears too.
   *
   * **STEPPED LIGHTER AGAIN 2026-09-21, `#8BB1E6` → `#97BDF2`, for the same
   * seventh ground `textAccentLight` gained (E4-31).** The note above reads
   * *"the dark composites land LIGHTER than their own bare surfaces, the
   * opposite of the light-theme case; no further step was needed"* — **that
   * sentence is true of the ghost-over-`surface` composite and false of
   * ghost-over-`surfaceSunken`**, which is the one a sunken row paints.
   * `fillNavyHig3` over `navySunken` composites to `#41496D`, and `#8BB1E6`
   * measures **3.973** on it — below 4.5, in both `hig` and `minimal` dark,
   * and measured by nothing. Stepped lighter in the same hue until that ground
   * clears, exactly as the first derivation stepped for `neoNavySunken`.
   *
   * Measured at `#97BDF2`: `navyBase` 9.0+, `navyRaised`, `navySunken`,
   * `neoNavy`, `neoNavyRaised`, `neoNavySunken` all higher, and the binding
   * constraint is now `hig`/`minimal` ghost over `navySunken` at **4.535**.
   * All grounds ≥4.5. The two ghost-over-`surface` composites
   * (see `textAccentLight`'s docblock for why they matter) clear with room to
   * spare. `neo` dark maps `surfaceSunken` to `neoNavy` itself, so its sunken
   * composite is its `surface` composite — the same override that removes the
   * spurious third ground on the light side.
   */
  textAccentDark: '#97bdf2',

  /**
   * ## The THIRD dim step — `textSubtle` (2026-09-15, the Help restyle)
   *
   * **DERIVED, not the export's own value**, the same way `textAccentLight`
   * is. The owner's Help prototype runs a three-level text hierarchy where
   * this repo had two: `--label` (full), `--label2` (78% alpha) and
   * `--label3` (52% alpha). `--label3` carries the eyebrows, the group
   * counts and the pager's label — small uppercase text, which is the
   * hardest kind to read dim.
   *
   * **The export's own `--label3` cannot be adopted literally, and the
   * reason is arithmetic rather than preference.** Composited over the four
   * light surfaces this product ships it measures **3.00** (`warmPaper`),
   * **3.10** (`warmRaised`), **2.87** (`warmSunken`) and **2.96**
   * (`neoPaper`) — not merely under the 4.5 read text owes, but under the
   * 3.0 a purely decorative non-text mark would owe, on two of the four. A
   * `CONTRAST_PAIRS` row at `minimum: 3` would have been red the moment it
   * was written; there is no honest minimum to declare for that value.
   *
   * **What IS ported is the STEP, not the hex** — and the step is what the
   * design actually encodes. This palette sits higher than the export's
   * throughout: `textMuted` (`inkMuted`) measures **8.94** on `surface`
   * where the export's `--label2` composite measures 6.13. A third level
   * derived at the export's own ratio would land below AA; a third level
   * derived at this palette's baseline keeps the reference's *proportional*
   * two-step hierarchy (full → muted → subtle) and stays readable.
   *
   * These are the DIMMEST greys on Apple's own neutral hue (R=G, B=R+4
   * light / R+5 dark, matching `grayAccessible`'s family) that clear 4.5 on
   * every surface in their theme. The binding constraint — the number a
   * future palette edit will break first — is `surfaceSunken` in both:
   *
   *   light  `#5e5e62`  surface 5.28 · raised 6.06 · **sunken 4.61** · neo 5.14
   *   dark   `#a0a0a5`  surface 6.63 · raised 5.46 · **sunken 4.54** · neo 5.93
   *
   * One step dimmer fails outright in each (`#606064` → 4.47, `#9e9ea3` →
   * 4.43), so there is no margin to give back here.
   *
   * **`grayAccessible` is NOT the ready-made answer**, and its own docblock
   * above says why before this role existed: it is the status-DOT grey,
   * split out of `inkMuted` precisely because it fails text at 4.16 on
   * `surfaceSunken` (measured again here: 4.27 / 4.90 / **3.73** / 4.16).
   * Reaching for it would have reintroduced the exact collision that split
   * created.
   *
   * No `STYLE_COLOR_OVERRIDES` entry is needed: `neo` varies only surfaces
   * and the fill ladder, never a text role, so all three styles resolve
   * this through `themes` — which is why `neoPaper`/`neoNavy` are measured
   * above rather than assumed.
   */
  textSubtleLight: '#5e5e62',
  textSubtleDark: '#a0a0a5',

  /**
   * ## Owner round 4 — the prototype's text is not pure (2026-09-16)
   *
   * The owner: *"seems the text color in the prototype is not really white.
   * follow that."* Ruled PRODUCT-WIDE, not page-scoped (`apps/desktop/src/main.tsx`
   * imports this same stylesheet, so both shells move together). `ink`
   * (`#000000`) and `white` (`#ffffff`) are the WCAG MAXIMUM-contrast case;
   * within the CSS custom-property token block cited below, the prototype
   * never uses either for text —
   * `design-system/interactive/desktop.dc.html:12-48`.
   *
   * **Scoped precisely (coordinator review F3, 2026-09-16): this claim covers
   * that token block only, not the whole prototype file.** `#fff` IS used for
   * text elsewhere, inline, outside the token system: `color:#fff` on the
   * workspace/avatar monogram style strings at `desktop.dc.html:2461`, `:2547`
   * and `:3323`. Those paint over a per-workspace/per-avatar background colour
   * chosen from a fixed palette, not one of THIS file's surface roles, so
   * they are not themselves evidence against this change — but the sentence
   * above is false if read as a claim about the whole file, so it says
   * "within the token block" rather than "the prototype", full stop.
   *
   * ADDED rather than mutating `ink`/`white` in place: other roles may still
   * reference those two primitives for non-text purposes, and editing a
   * primitive in place makes that blast radius invisible. After this change,
   * `ink`, `white`, `fog` and `navy900` were referenced by NO role in `themes`
   * or `STYLE_COLOR_OVERRIDES` (verified: `themes.light`/`themes.dark` were
   * their only referents, and every one of those nine lines is repointed
   * below). All four were kept rather than deleted at the time, pending an
   * owner decision on whether they still earned their place.
   *
   * **That decision arrived, owner round 5 (2026-09-16): "delete `ink` and
   * `fog`."** Checked before deleting, not assumed: neither has a referent
   * anywhere in `packages/ui/src`, `packages/ui/test`, `apps/`, or elsewhere
   * in the repo, so both were removed from `primitives` outright.
   *
   * `white` and `navy900` were kept, per the instruction — but a repo-wide
   * check found **no live referent for them either.** The two lines
   * sometimes cited as pinning them (`packages/ui/test/tokens.test.ts`
   * `:757`–`:758`) are inside a comment describing what an assertion USED TO
   * read before it was corrected (see that file's `'13.360 accentText…'`
   * case) — the live assertions there pin `onColorWarmLight`/`onColorWarmDark`
   * now, not `white`/`navy900`. So as of this change `white` and `navy900`
   * are in the same referent-free state `ink`/`fog` were in — they are kept
   * anyway because deleting them was not asked for here, not because a
   * referent was found. See the owner round-5 report.
   *
   * `labelWarmLight`/`labelWarmDark` are the export's `--label`
   * (`desktop.dc.html:16` light, `:36` dark) — the `text` role in both
   * themes.
   *
   * `onColorWarmLight`/`onColorWarmDark` are the export's `--onColor`
   * (`:18` light, `:38` dark) — every role that paints text ON a filled
   * background: `accentText` (both themes), `dangerText`/`warningText`/
   * `successText` in LIGHT theme only (their dark values — `redInk`/
   * `amberInk`/`greenInk` — were already non-pure and are untouched), and
   * `textInverted` in BOTH themes. `ui.css:2596-2599`'s own comment already
   * ties `textInverted`'s semantic to the export's `--onColor` ("the same
   * semantic the export's own `--onColor` carries"), which is the
   * justification for reusing this pair here rather than deriving a third.
   *
   * Every `CONTRAST_PAIRS` row naming one of these roles was re-measured
   * before and after this change (`packages/ui/test/tokens.test.ts`'s
   * declared-pairs suite, run across all three styles) and every one stays
   * clear of its minimum — tightest is `warningText` on `warning` (light) at
   * 4.876 against its 4.5 floor. See the owner round-4 report for the full
   * before/after table.
   */
  labelWarmLight: '#202b49',
  labelWarmDark: '#f2e9e1',
  onColorWarmLight: '#fbf7f3',
  onColorWarmDark: '#141a2e',

  /**
   * ## The styling refresh's grounds (Plan A Task 1, 2026-09-29)
   *
   * Transcribed from the owner-approved mockup (`Main.dc.html:130`, `:143`;
   * `Sheet.dc.html:111`, `:120`). The TRACK is the recessed ground that HOLDS
   * raised items on the page (a board column); the WELL is the recessed ground
   * INSIDE a raised panel (the sheet's field group). Both measure below 1.5:1
   * against the ground around them (1.08 / 1.10), on purpose: they are
   * identified by the `track` shadow (Task 2), not by fill — rule 04, "light
   * from above". Under neo both roles resolve to the neo surface, as every neo
   * ground does (depth is shadow-only there, `STYLE_COLOR_OVERRIDES` below).
   */
  trackWarm: '#e8ded4',
  trackNavy: '#10152a',
  wellWarm: '#f3ece5',
  wellNavy: '#1a213b',
  /**
   * The primary button's DARK edge (`Main.dc.html:132`, `accentEdge`). The
   * light edge is `textAccentLight` (`#2d5488`, above) byte-for-byte, so it is
   * reused rather than duplicated. 11.42:1 on `navyBase`, 9.41:1 on `navyRaised`.
   */
  accentEdgeDark: '#bcd4f7',
  /**
   * ## The styling refresh's depth (Plan A Task 2, 2026-09-29) — hig only
   *
   * Every value is the owner-approved mockup's own rgba, converted to 8-digit
   * hex (alpha × 255, rounded): `Main.dc.html:133-140` (dark) and `:146-153`
   * (light), `Sheet.dc.html:118`/`:127` (the sheet). Names start `shadow`, so
   * case 13.338's sweep (`tokens.test.ts:229`) sees every one. neo reuses its
   * OWN primitives above (`shadowNeo*`) and minimal draws none.
   */
  shadowLitLight: '#ffffffe6',
  shadowLitNearLight: '#ffffffff',
  shadowFallLight1: '#273a631f',
  shadowFallLight2: '#273a6338',
  shadowFallNearLight1: '#273a6314',
  shadowFallNearLight2: '#273a632e',
  shadowFallNearLight3: '#273a6347',
  shadowFallPressLight1: '#273a6324',
  shadowFallPressLight2: '#273a6333',
  shadowTrackLight: '#b0988459',
  shadowTrackLitLight: '#ffffff99',
  shadowActionLitLight: '#ffffff47',
  shadowActionFallLight: '#273a6340',
  shadowActionGlowLight: '#33629f73',
  shadowActionLitNearLight: '#ffffff66',
  shadowActionGlowNearLight: '#33629f80',
  shadowActionPressLight: '#1016254d',
  shadowSheetLight: '#273a6359',
  shadowLitDark: '#f2e9e112',
  shadowLitNearDark: '#f2e9e11f',
  shadowFallDark1: '#00000080',
  shadowFallDark2: '#00000099',
  shadowFallNearDark1: '#00000059',
  shadowFallNearDark2: '#0000008c',
  shadowTrackDark: '#00000073',
  shadowTrackLitDark: '#ffffff0a',
  shadowActionLitDark: '#ffffff73',
  shadowActionLitNearDark: '#ffffff8c',
  shadowActionFallNearDark: '#000000a6',
  shadowActionPressDark: '#141a2e73',
  shadowActionPressFallDark: '#00000066',
  shadowSheetLitDark: '#f2e9e114',
} as const;

export type PrimitiveName = keyof typeof primitives;

export const TOKEN_ROLES = [
  'surface',
  'surfaceRaised',
  'surfaceSunken',
  'surfaceOverlay',
  /**
   * The recessed TRACK and WELL grounds — styling refresh Plan A Task 1. A
   * track holds raised items on the page ground (board columns); a well is a
   * recessed group inside a raised panel (the sheet's fields). Text on both is
   * a declared pair at 4.5 (see `CONTRAST_PAIRS`).
   */
  'surfaceTrack',
  'surfaceWell',
  'text',
  'textMuted',
  /**
   * The third dim step, below `textMuted`. Eyebrows, group counts, the
   * pager's `Next` label — the text that says where you are rather than
   * what is there. See `primitives.textSubtleLight` for the derivation and
   * for why the reference's own alpha could not be taken literally.
   *
   * It is a TEXT role and carries the full 4.5 guarantee on all three
   * surfaces; "subtle" names the visual weight, not a relaxed minimum.
   */
  'textSubtle',
  'textInverted',
  /**
   * ## `textAccent` vs `accentText` — Round 2d (2026-09-09), and the two names
   * are deliberately this close because the roles are exact opposites.
   *
   * `textAccent` is IN THIS FAMILY (`text`/`textMuted`/`textInverted`) on
   * purpose: it means **accent-hued text drawn ON a surface or raised
   * background** — a link, a ghost button's label, a search-result title.
   * The pixel is text; the surface underneath is neutral.
   *
   * `accentText` (below, unchanged) means the OPPOSITE composition: **the
   * colour drawn ON TOP of an accent-FILLED background** — a primary button's
   * label, a filled chip. The pixel is text; the surface underneath is
   * itself accent-coloured.
   *
   * They cannot share a value. `accent` (`blue600`/`blue300`) is legible
   * enough as a FILL — `accentText` (`onColorWarmLight`/`onColorWarmDark` as
   * of owner round 4, 2026-09-16; originally `white`/`navy900`) only has to
   * clear 4.5 against that one saturated colour, and it clears with margin
   * (4.93 light / 7.15 dark, re-measured against the round-4 hexes — down
   * from 5.26/7.48 against the original `white`/`navy900` pair, still well
   * clear). `accent` as
   * TEXT is a different, harder problem: it has to clear 4.5 against every
   * *neutral* surface/raised background the product ships (`warmPaper`,
   * `warmRaised`, `neoPaper` in light; `navyBase`, `navyRaised`, `neoNavy`,
   * `neoNavyRaised` in dark), which is precisely the guarantee the renamed
   * `CONTRAST_PAIRS` rows below exist to state. The Round 2d accent hexes
   * (`#3A6DB0`/`#7FA9E4`, adopted from the owner's neo prototype) measure
   * 4.19–4.30 as TEXT on light surfaces — below 4.5 — while clearing 5.26 as
   * a FILL against the then-white `accentText` (4.93 on today's warm ground). **T1 (2026-09-18) moved the light hex to `#33629f`, which now
   * clears 4.5 on the plain (5.07) and raised (5.81) light surfaces but still
   * FAILS `surfaceSunken` (4.42)** — so the split below is kept with a narrower
   * reason rather than retired: a fill colour that clears two backgrounds and
   * fails the third is still not one to rely on for text. One role asked to do
   * both jobs would have to pick the WORSE
   * number for the job it isn't doing, which is why `accent` keeps its own
   * (duller, fill-safe) hex and `textAccent` gets its own, separately
   * derived one (`textAccentLight`/`textAccentDark` in `primitives`, below).
   *
   * A reader confusing these two names is the expected failure mode, hence
   * this docblock living at the point of declaration rather than only in a
   * PR description.
   */
  'textAccent',
  'border',
  'borderStrong',
  /**
   * The four fill steps, added with the border sweep (2026-09-08). Ruling
   * R1(c) separates by fill and spacing instead of by hairline, which needs
   * the fills to be roles rather than literals — no colour literal is legal
   * outside this file.
   */
  'fillPrimary',
  'fillSecondary',
  'fillTertiary',
  'fillQuaternary',
  /**
   * A tinted WASH, not a fill step: the invitation banner's ground. It is
   * translucent so it reads as a coloured veil over whatever surface it sits
   * on, which is exactly why its contrast obligation is against the
   * composite rather than against itself.
   */
  'tintWarning',
  'focusRing',
  'shadow',
  /**
   * ## `brand` — Round 2d (2026-09-09), the one role with no theme variant.
   *
   * The owner's neo prototype declares exactly one fixed hue anywhere in its
   * token file (`design-system/interactive/{desktop,mobile}.dc.html`):
   * `--brand:#EE7733`, used ONLY for the sign-in icon tile's fill. Every
   * other colour in that file has a light AND a dark value; this one does
   * not, in either export, so `themes.light.brand` and `themes.dark.brand`
   * both point at the same primitive (`brandOrange`) rather than one of them
   * being a guess at a value the source never states.
   *
   * **This role is PAIRLESS by design, and the number that justifies it is
   * recorded here rather than discovered by a reviewer.** The obvious pair —
   * `{ fg: 'textInverted', bg: 'brand', minimum: 3 }`, matching the tile's
   * actual composition (`.gn-page-header__icon`'s glyph stroke on its own
   * fill) — MEASURES **2.69 in light theme** (`onColorWarmLight` on
   * `#EE7733`, as of owner round 4, 2026-09-16 — originally `white` at 2.87
   * before `textInverted` moved off the pure primitive), below even the 3:1 a
   * non-text UI component owes under WCAG 1.4.11. Dark clears easily
   * (`onColorWarmDark` on `#EE7733` = 6.02; originally `ink` at 7.32); light
   * does not, and no same-hue nudge fixes it without abandoning the owner's
   * exact orange.
   *
   * The tile is exempt rather than failing, for the same reason WCAG 1.4.11
   * itself carves out: the icon is `aria-hidden="true"` (`sign-in/page.tsx`)
   * and purely decorative — the `<h1>Gisik Nokma</h1>` beside it carries the
   * only information the header conveys, and 1.4.11 binds contrast for a
   * graphical object "required to identify... or convey information", which
   * a hidden glyph beside its own text label is not. The export ships the
   * identical trade-off (`--onColor:#FBF7F3` cream on `--brand:#EE7733` in
   * ITS light theme measures the same low ratio), so this is not a
   * regression introduced here — it is the owner's own design, measured and
   * left unfixed on purpose rather than silently uncounted. See
   * `packages/ui/test/tokens.test.ts`'s `'brand — Round 2d (2026-09-09)'`
   * suite for the pinned arithmetic.
   */
  'brand',
  'accent',
  'accentText',
  /**
   * The primary button's EDGE (rule 03: "edge ≥ 3:1") and its hover fill.
   * Declared ≥ 3 on `surface`/`surfaceRaised`, and `accentText` on it ≥ 4.5,
   * because the hovered primary paints its fill with this role.
   */
  'accentEdge',
  'danger',
  'dangerText',
  'warning',
  'warningText',
  'success',
  'successText',
  'categoryOpen',
  'categoryActive',
  'categoryTerminal',
  'blocked',
  'pending',
  'restricted',
  'contested',
  /**
   * A claim on a workspace-DEFINED date field, as against the two built-ins.
   *
   * Added by Plan 9 Task 9, the first surface that renders a calendar colour.
   * The plan asked for six colour names (`todayRing`, `pendingHatch`,
   * `barActive`, `barTerminal`, `marker`, `customMarker`); five of them are
   * existing roles wearing new words — the today ring and a bar are `accent`,
   * an in-transit claim is `pending`, and a built-in marker's glyph is
   * `accent` too — and a role invented for each would have been six ways to
   * say four things. This one is not: "a day someone's own field claimed" is a
   * meaning the roster did not carry, and it is the ONE distinction the
   * calendar's legend exists to make visible.
   *
   * It shares `restricted`'s primitives deliberately, the way `blocked` shares
   * `danger`'s and `pending` shares `warning`'s: roles are meanings, primitives
   * are the palette, and the two never appear in one another's surfaces (a
   * visibility chip's dot, a calendar marker's glyph). A future palette edit
   * that wants them apart moves this line, not every call site.
   */
  'customMarker',
] as const;

export type TokenRole = (typeof TOKEN_ROLES)[number];

/**
 * The `hig`-style role→primitive mapping, doubling as the `minimal` mapping
 * (identical for every colour role — the two styles diverge only in
 * `radii`/`shadows` below). `neo`'s divergent roles are layered on top by
 * `styleColorOverrides`; `colorOf` resolves style before falling back here.
 */
export const themes: Record<ThemeName, Record<TokenRole, PrimitiveName>> = {
  light: {
    surface: 'warmPaper',
    surfaceRaised: 'warmRaised',
    surfaceSunken: 'warmSunken',
    surfaceOverlay: 'overlayWarmHig',
    surfaceTrack: 'trackWarm',
    surfaceWell: 'wellWarm',
    text: 'labelWarmLight',
    textMuted: 'inkMuted',
    textSubtle: 'textSubtleLight',
    textInverted: 'onColorWarmLight',
    textAccent: 'textAccentLight',
    border: 'grayAccessible',
    borderStrong: 'grayAccessible',
    fillPrimary: 'fillWarmShared1',
    fillSecondary: 'fillWarmShared2',
    fillTertiary: 'fillWarmHig3',
    fillQuaternary: 'fillWarmHig4',
    tintWarning: 'tintWarmWarning',
    focusRing: 'blue600',
    shadow: 'scrimLight',
    brand: 'brandOrange',
    accent: 'blue600',
    accentText: 'onColorWarmLight',
    accentEdge: 'textAccentLight',
    danger: 'red600',
    dangerText: 'onColorWarmLight',
    warning: 'amber700',
    warningText: 'onColorWarmLight',
    success: 'green700',
    successText: 'onColorWarmLight',
    categoryOpen: 'grayAccessible',
    categoryActive: 'blue600',
    categoryTerminal: 'green700',
    blocked: 'red600',
    pending: 'amber700',
    restricted: 'violet600',
    contested: 'magenta600',
    customMarker: 'violet600',
  },
  dark: {
    surface: 'navyBase',
    surfaceRaised: 'navyRaised',
    surfaceSunken: 'navySunken',
    surfaceOverlay: 'overlayNavyHig',
    surfaceTrack: 'trackNavy',
    surfaceWell: 'wellNavy',
    text: 'labelWarmDark',
    textMuted: 'fogMuted',
    textSubtle: 'textSubtleDark',
    textInverted: 'onColorWarmDark',
    textAccent: 'textAccentDark',
    border: 'grayAccessibleDark',
    borderStrong: 'grayAccessibleDark',
    fillPrimary: 'fillNavyShared1',
    fillSecondary: 'fillNavyShared2',
    fillTertiary: 'fillNavyHig3',
    fillQuaternary: 'fillNavyHig4',
    tintWarning: 'tintNavyWarning',
    focusRing: 'blue300',
    shadow: 'scrimDark',
    brand: 'brandOrange',
    accent: 'blue300',
    accentText: 'onColorWarmDark',
    accentEdge: 'accentEdgeDark',
    danger: 'red300',
    dangerText: 'redInk',
    warning: 'amber300',
    warningText: 'amberInk',
    success: 'green300',
    successText: 'greenInk',
    categoryOpen: 'grayAccessibleDark',
    categoryActive: 'blue300',
    categoryTerminal: 'green300',
    blocked: 'red300',
    pending: 'amber300',
    restricted: 'violet300',
    contested: 'magenta300',
    customMarker: 'violet300',
  },
};

/**
 * `neo`'s divergence from the `themes` map above — the roles the ruling
 * actually varies by style. `minimal` needs no entry: its colours are
 * byte-identical to `hig`'s (it differs only in `radii`/`shadows`).
 *
 * **The count in this sentence used to read "the 8 roles", and it was wrong.**
 * The light arm declared 6, the dark arm 6 — so the sentence was false on its
 * face, in the one place a reader would check the claim. Corrected 2026-09-18
 * rather than left, because this change adds five more and a wrong count now
 * would be wrong by eleven.
 *
 * **T5 (2026-09-18): the light arm gains the five semantic colours the
 * refreshed export's light-neo block declares.** The mapping is by MEANING,
 * not by variable name — the export names two of them after hues (`--pink`,
 * `--purple`) where this product names roles:
 *
 * | export variable | `TokenRole` | why |
 * |---|---|---|
 * | `--danger`  | `danger`        | name match |
 * | `--warning` | `warning`       | name match |
 * | `--success` | `success`       | name match |
 * | `--pink`    | `contested`     | the export's contested chip draws `var(--pink)`/`var(--tintPink)` |
 * | `--purple`  | `restricted` **and** `customMarker` | the export's Restricted chip draws `var(--purple)`; `customMarker` shares `restricted`'s primitive deliberately (see its own docblock), so it must follow or the stated sharing becomes false |
 *
 * `customMarker` is the one entry here that is a CONSEQUENCE rather than a
 * port: it moves because it is documented as sharing `restricted`'s primitive,
 * and moving one without the other would break that in `neo` light only.
 */
const STYLE_COLOR_OVERRIDES: Partial<Record<StyleName, Record<ThemeName, Partial<Record<TokenRole, PrimitiveName>>>>> = {
  neo: {
    light: {
      surface: 'neoPaper',
      surfaceRaised: 'neoPaper',
      surfaceSunken: 'neoPaper',
      surfaceOverlay: 'overlayWarmNeo',
      surfaceTrack: 'neoPaper',
      surfaceWell: 'neoPaper',
      fillTertiary: 'fillWarmNeo3',
      fillQuaternary: 'fillWarmNeo4',
      danger: 'neoLightDanger',
      warning: 'neoLightWarning',
      success: 'neoLightSuccess',
      contested: 'neoLightContested',
      restricted: 'neoLightRestricted',
      customMarker: 'neoLightRestricted',
    },
    dark: {
      surface: 'neoNavy',
      surfaceRaised: 'neoNavyRaised',
      surfaceSunken: 'neoNavySunken',
      surfaceOverlay: 'overlayNavyNeo',
      surfaceTrack: 'neoNavy',
      surfaceWell: 'neoNavy',
      fillTertiary: 'fillNavyNeo3',
      fillQuaternary: 'fillNavyNeo4',
    },
  },
};

/** `radius.card` / `radius.control` → `--gn-radius-card` / `--gn-radius-control`. Not a colour, so plain CSS length strings, no primitive/discipline concerns. */
export type RadiusRole = 'card' | 'control' | 'track';

/** `track` (styling refresh, 2026-09-29) = card + 8: a track pads its cards by 8px, and rule 05 says inner radius = outer − padding (16 = 24 − 8; neo 20 = 28 − 8). */
/** `hig` and `minimal` share the shipped radii; `neo`'s are the export's own, larger values. */
export const radii: Record<StyleName, Record<RadiusRole, string>> = {
  hig: { card: '16px', control: '8px', track: '24px' },
  minimal: { card: '16px', control: '8px', track: '24px' },
  neo: { card: '20px', control: '14px', track: '28px' },
};

export function radiusOf(style: StyleName, role: RadiusRole): string {
  return radii[style][role];
}

/** `radius-card` → `--gn-radius-card`. */
export function radiusVariableName(role: RadiusRole): string {
  return `--gn-radius-${role}`;
}

/** `font.sans` / `font.mono` → `--gn-font-sans` / `--gn-font-mono`. Not a colour, so plain CSS font-stack strings, no primitive/discipline concerns — the same standing radii and shadows have in this file. */
export type FontRole = 'sans' | 'mono';

/**
 * The typefaces, transcribed from the desktop prototype's own `body` rule
 * (`-apple-system,BlinkMacSystemFont,"SF Pro Text","Helvetica Neue",system-ui,sans-serif`)
 * and from the `font-family:ui-monospace,Menlo,monospace` it writes inline
 * wherever it sets code.
 *
 * WHY THEY LIVE HERE AND NOT IN A STYLESHEET. Before this, `apps/web` named a
 * stack in `globals.css` and nothing else in the product named one at all:
 * `ui.css` carried zero `font-family` declarations, so `apps/desktop` — which
 * loads `ui.css` and nothing else — painted every glyph in the browser's
 * default serif. That is the SAME defect class as the undefined-tokens one
 * `apps/desktop/src/theme.ts` documents, and it has the same cure: one origin,
 * emitted as custom properties, installed by whatever each shell already
 * installs. A second copy of the stack in a second stylesheet would be a
 * literal free to drift, which is the thing this file exists to prevent.
 *
 * INVARIANT ACROSS BOTH AXES, deliberately. Style (`hig`/`minimal`/`neo`) and
 * theme (`light`/`dark`) change colour, elevation and corner radius; none of
 * the three prototypes sets a different typeface, so a per-style font map
 * would be three identical rows inviting an accidental divergence. If a style
 * ever earns its own face, this becomes `Record<StyleName, …>` and
 * `declarationsFor` is where it goes — see `themeStylesheet` for why it is
 * emitted apart from that function today.
 */
export const fontStacks: Record<FontRole, string> = {
  sans: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", system-ui, sans-serif',
  mono: 'ui-monospace, Menlo, monospace',
};

export function fontStackOf(role: FontRole): string {
  return fontStacks[role];
}

/** `sans` → `--gn-font-sans`. */
export function fontVariableName(role: FontRole): string {
  return `--gn-font-${role}`;
}

/**
 * The 8-pt grid and the motion constants (styling refresh Plan A Task 2,
 * rules "02 Spacing — 24 around, 16 between groups, 8 between lines" and
 * "06 Motion — feedback in 100ms, done in 300; 150–300ms, ease-out"). Neither
 * varies by style or theme, so — like the fonts — they are emitted ONCE under
 * the bare `:root` (`themeStylesheet`'s first block), never per style×theme.
 */
export const spacing = { 1: '0.5rem', 2: '1rem', 3: '1.5rem' } as const;
export type SpaceStep = keyof typeof spacing;
export function spaceVariableName(step: SpaceStep): string {
  return `--gn-space-${step}`;
}

export const motion = {
  feedback: '100ms',
  move: '200ms',
  lift: '220ms',
  done: '300ms',
  'ease-out': 'cubic-bezier(0.2, 0.8, 0.2, 1)',
} as const;
export type MotionKey = keyof typeof motion;
export function motionVariableName(key: MotionKey): string {
  return `--gn-motion-${key}`;
}

/**
 * `sunken-compact` — added owner round 3 (2026-09-16), a SMALLER inset step
 * alongside `sunken`, not a replacement for it. Named for what it IS (a
 * compact-geometry sunken shadow — 2px/2px/4px vs `sunken`'s 4px/4px/9px),
 * not for the one component (`.gn-chip`) that consumes it today — a role
 * named `chip` would already be wrong the moment a second small element
 * needed the same treatment. See `shadowNeoSunkenCompactDarkDark`'s docblock
 * in `primitives` for which layer colours are reused vs new.
 *
 * The hyphen is deliberate, not stylistic: `shadowVariableName` interpolates
 * a `ShadowRole` directly into `--gn-shadow-${role}` with no camelCase→kebab
 * conversion (unlike `cssVariableName`, which TOKEN_ROLES needs because it
 * has camelCase members). A camelCase role here would emit
 * `--gn-shadow-sunkenCompact`, which `tokens.test.ts`'s own var-harvesting
 * regex (`/var\((--gn-[a-z0-9-]*)\)/g`) cannot match — the check would pass
 * by finding nothing, since there is no REVERSE assertion that every
 * declared var is actually referenced (only a `>10` count and one spot-check).
 *
 * **Precisely stated (coordinator review F6, 2026-09-16): this alone does
 * NOT break the browser.** A camelCase CSS custom-property name is valid and
 * renders correctly — `themeStylesheet()` would emit `--gn-shadow-
 * sunkenCompact` and, had `ui.css` referenced that exact spelling, it would
 * have worked. The real failure needs a SECOND condition: `ui.css` spelling
 * the reference in kebab-case (as every other `--gn-*` var in that file is,
 * by convention) while the emitter spells it camelCase — a mismatch the
 * scanner's regex then hides rather than catches. It is that combination,
 * not the hyphen's absence alone, that would have left the chip's
 * `box-shadow` resolving to nothing.
 *
 * ## `selected` — added owner round 5 (2026-09-16)
 *
 * The gap `sunken-compact`'s own docblock (and `SHADOW_ROLES`' emission-list
 * docblock below) flagged and deliberately left alone:
 * `[data-style="neo"] .gn-segmented__item--on` was approximated with the
 * existing `sunken` role (`inset 4px 4px 9px`), but the prototype's own
 * `--segOnShadow` (`design-system/interactive/desktop.dc.html:29` hig light,
 * `:43` hig dark, `:51` minimal, `:65` neo light, `:77` neo dark) is not
 * another step on the sunken scale at all — verified by reading each line
 * individually rather than assumed from the neo arm alone:
 *
 *   hig light   `0 3px 8px rgba(39,58,99,.16), 0 3px 1px rgba(39,58,99,.06)` — RAISED (drop), two layers
 *   hig dark    `0 3px 8px rgba(6,10,22,.66)` — RAISED, ONE layer only (no second layer in the export)
 *   minimal     `none`
 *   neo light   `inset 3px 3px 6px rgba(176,152,132,.55), inset -3px -3px 6px rgba(255,255,255,.95)` — INSET
 *   neo dark    `inset 3px 3px 6px rgba(0,0,0,.55), inset -3px -3px 6px rgba(255,255,255,.05)` — INSET
 *
 * Raised under one style, absent under another, inset under a third — a name
 * like `sunken-something` would be actively wrong. Named instead for the
 * STATE it expresses (the chosen item in a group), not the component
 * (`segmented`) and not a scale position (`sunken`/`raised`), the same
 * naming discipline `sunken-compact` already established: `selected` reads
 * naturally as a role any future single-choice control (tabs, a radio-styled
 * list row) could reuse, where `segmentedOn` or `segOn` would not.
 *
 * Every one of the six layer colours across these five style×theme
 * combinations turned out to be byte-identical to a primitive this file
 * already had (verified by rgba→hex arithmetic — alpha byte =
 * round(alpha × 255) — not eyeballed): `shadowHigLight`/`shadowHigDark`
 * (hig's own two shadow primitives), `shadowNeoRaisedDarkLight`/
 * `shadowNeoHighlightLight` (neo light, the same pair `raised` and
 * `sunken-compact` already use), and `shadowNeoSunkenCompactDarkDark`/
 * `shadowNeoSunkenHighlightDark` (neo dark, the same pair `sunken-compact`
 * already uses). No new primitive was needed for this role.
 *
 * **One reused primitive crosses categories, and that is worth flagging
 * explicitly.** hig light's second layer (`rgba(39,58,99,0.06)`,
 * alpha byte round(0.06×255)=15=`0x0f`) is byte-identical to
 * `fillWarmHig4` (`#273a630f`) — a FILL primitive, not one of the
 * `shadowHig*`/`shadowNeo*` family every other shadow layer in this file
 * draws from. Reused rather than duplicated under a new name, per this
 * file's own anti-duplication precedent (`sunken-compact`'s docblock:
 * "reused... rather than duplicated under a new name"), but note for a
 * future reader: (1) `fillWarmHig4` is also `hig`/`minimal` light's
 * `fillQuaternary` — a future *fill*-side accessibility nudge to that role
 * (the same kind `fillNavyHig3`/`fillNavyNeo3` already received) would
 * silently move this shadow layer's colour too, since both read the same
 * primitive; (2) case 13.338 (`packages/ui/test/tokens.test.ts`) enumerates
 * shadow layer colours by `name.startsWith('shadow')`, so this one layer's
 * colour falls outside that sweep — harmless today (no `CONTRAST_PAIRS` row
 * names `fillQuaternary`, so 13.338's actual guarantee is unaffected), but
 * the sweep no longer covers every shadow layer by construction.
 */
export type ShadowRole =
  | 'raised'
  | 'sunken'
  | 'overlay'
  | 'sunken-compact'
  | 'selected'
  | 'lift'
  | 'lift-near'
  | 'lift-press'
  | 'lift-drag'
  | 'track'
  | 'action'
  | 'action-near'
  | 'action-press'
  | 'sheet';

/** One `box-shadow` layer: geometry as plain numbers (not colour, outside the discipline scanner's remit) plus one alpha-colour primitive. */
type ShadowLayer = {
  x: number;
  y: number;
  blur: number;
  /** Optional fourth length (styling refresh Task 2): a negative spread keeps a long, soft fall from widening past the card. */
  spread?: number;
  colour: PrimitiveName;
  inset?: boolean;
};

/**
 * Every style×theme's raised/sunken/sunken-compact elevation, transcribed
 * from the export (`design-system/neo-tokens.json` for raised/sunken,
 * `design-system/interactive/desktop.dc.html`'s `--chipShadow` for
 * sunken-compact — see that role's own docblock above). `overlay` is
 * DERIVED, not measured — ruling item 6: neither exported file defines a
 * dedicated overlay shadow, so it reuses that style×theme's `raised`
 * treatment (a sheet or modal floating above the scrim reads as "raised" the
 * same way a card does). `minimal` has no shadow in either theme — its
 * cards/fields are flat by design (rule (b) keeps its controls identifiable
 * by fill/label instead). `hig` and `minimal` are both `[]` for
 * `sunken-compact`, exactly as they are for `sunken` — the prototype's `hig`
 * (`minimal` inherits) gives `--chipShadow:none` (`desktop.dc.html:24`).
 *
 * `selected` (owner round 5, 2026-09-16) is transcribed from the export's
 * `--segOnShadow` — see `ShadowRole`'s own docblock above for the per-line
 * citations and the primitive-reuse arithmetic. Unlike every other role
 * here, `hig`'s two themes are NOT symmetric: light carries two layers,
 * dark only one — the export's dark block simply never declares a second
 * `--segOnShadow` layer, so this is not an omission.
 */
const SHADOWS: Record<StyleName, Record<ThemeName, Record<ShadowRole, readonly ShadowLayer[]>>> = {
  hig: {
    light: {
      raised: [{ x: 0, y: 1, blur: 3, colour: 'shadowHigLight' }],
      sunken: [],
      overlay: [{ x: 0, y: 1, blur: 3, colour: 'shadowHigLight' }],
      'sunken-compact': [],
      /** `--segOnShadow` hig light (`desktop.dc.html:29`) — both layers reused, see `ShadowRole`'s docblock. */
      selected: [
        { x: 0, y: 3, blur: 8, colour: 'shadowHigLight' },
        { x: 0, y: 3, blur: 1, colour: 'fillWarmHig4' },
      ],
      /** Styling refresh (Plan A Task 2) — `Main.dc.html:146` `lift`. */
      lift: [
        { x: 0, y: 1, blur: 0, colour: 'shadowLitLight', inset: true },
        { x: 0, y: 1, blur: 2, colour: 'shadowFallLight1' },
        { x: 0, y: 8, blur: 16, spread: -8, colour: 'shadowFallLight2' },
      ],
      /** `:148` `near` — the lift TOWARD the user: brighter lit edge, 3-layer spreading fall. */
      'lift-near': [
        { x: 0, y: 1, blur: 0, colour: 'shadowLitNearLight', inset: true },
        { x: 0, y: 2, blur: 4, colour: 'shadowFallNearLight1' },
        { x: 0, y: 12, blur: 24, spread: -6, colour: 'shadowFallNearLight2' },
        { x: 0, y: 28, blur: 48, spread: -16, colour: 'shadowFallNearLight3' },
      ],
      /** `:149` `press`. */
      'lift-press': [
        { x: 0, y: 1, blur: 0, colour: 'shadowLitLight', inset: true },
        { x: 0, y: 1, blur: 2, colour: 'shadowFallPressLight1' },
        { x: 0, y: 4, blur: 8, spread: -4, colour: 'shadowFallPressLight2' },
      ],
      /**
       * Added 2026-09-29 (owner kanban rulings; Task 5A). The DRAGGED card is
       * lifted furthest toward the user: `lift-near`'s lit edge, with a fall that
       * reaches further and softer (40px down, 64px blur). The mockup draws no
       * drag state, so this reuses the mockup's own primitives and adds none.
       */
      'lift-drag': [
        { x: 0, y: 1, blur: 0, colour: 'shadowLitNearLight', inset: true },
        { x: 0, y: 4, blur: 8, colour: 'shadowFallLight1' },
        { x: 0, y: 20, blur: 32, spread: -8, colour: 'shadowFallLight2' },
        { x: 0, y: 40, blur: 64, spread: -20, colour: 'shadowFallNearLight3' },
      ],
      /** `:150` `recess` — the track, lit from above (dark top inset, light bottom lip). */
      track: [
        { x: 0, y: 2, blur: 4, colour: 'shadowTrackLight', inset: true },
        { x: 0, y: -1, blur: 0, colour: 'shadowTrackLitLight', inset: true },
      ],
      /** `:153` `btnShadow`. */
      action: [
        { x: 0, y: 1, blur: 0, colour: 'shadowActionLitLight', inset: true },
        { x: 0, y: 1, blur: 2, colour: 'shadowActionFallLight' },
        { x: 0, y: 8, blur: 16, spread: -6, colour: 'shadowActionGlowLight' },
      ],
      /** `:151` `btnNear`. */
      'action-near': [
        { x: 0, y: 1, blur: 0, colour: 'shadowActionLitNearLight', inset: true },
        { x: 0, y: 2, blur: 4, colour: 'shadowFallPressLight2' },
        { x: 0, y: 10, blur: 20, spread: -6, colour: 'shadowActionGlowLight' },
        { x: 0, y: 20, blur: 36, spread: -14, colour: 'shadowActionGlowNearLight' },
      ],
      /** `:152` `btnPress` — pushed back into its track. */
      'action-press': [
        { x: 0, y: 2, blur: 4, colour: 'shadowActionPressLight', inset: true },
        { x: 0, y: 1, blur: 1, colour: 'shadowFallPressLight2' },
      ],
      /** `Sheet.dc.html:127` `sheetShadow` — lit inner left edge, shadow falls to the left. */
      sheet: [
        { x: 1, y: 0, blur: 0, colour: 'shadowLitLight', inset: true },
        { x: -24, y: 0, blur: 48, spread: -16, colour: 'shadowSheetLight' },
      ],
    },
    dark: {
      raised: [{ x: 0, y: 1, blur: 3, colour: 'shadowHigDark' }],
      sunken: [],
      overlay: [{ x: 0, y: 1, blur: 3, colour: 'shadowHigDark' }],
      'sunken-compact': [],
      /** `--segOnShadow` hig dark (`desktop.dc.html:43`) — ONE layer only, not two; see the docblock above. */
      selected: [{ x: 0, y: 3, blur: 8, colour: 'shadowHigDark' }],
      lift: [
        { x: 0, y: 1, blur: 0, colour: 'shadowLitDark', inset: true },
        { x: 0, y: 1, blur: 2, colour: 'shadowFallDark1' },
        { x: 0, y: 8, blur: 16, spread: -8, colour: 'shadowFallDark2' },
      ],
      'lift-near': [
        { x: 0, y: 1, blur: 0, colour: 'shadowLitNearDark', inset: true },
        { x: 0, y: 2, blur: 4, colour: 'shadowFallNearDark1' },
        { x: 0, y: 12, blur: 24, spread: -6, colour: 'shadowFallNearDark2' },
        { x: 0, y: 28, blur: 48, spread: -16, colour: 'shadowFallDark2' },
      ],
      'lift-press': [
        { x: 0, y: 1, blur: 0, colour: 'shadowLitDark', inset: true },
        { x: 0, y: 1, blur: 2, colour: 'shadowFallNearDark2' },
        { x: 0, y: 4, blur: 8, spread: -4, colour: 'shadowFallDark1' },
      ],
      'lift-drag': [
        { x: 0, y: 1, blur: 0, colour: 'shadowLitNearDark', inset: true },
        { x: 0, y: 4, blur: 8, colour: 'shadowFallNearDark1' },
        { x: 0, y: 20, blur: 32, spread: -8, colour: 'shadowFallNearDark2' },
        { x: 0, y: 40, blur: 64, spread: -20, colour: 'shadowFallDark2' },
      ],
      track: [
        { x: 0, y: 2, blur: 4, colour: 'shadowTrackDark', inset: true },
        { x: 0, y: -1, blur: 0, colour: 'shadowTrackLitDark', inset: true },
      ],
      action: [
        { x: 0, y: 1, blur: 0, colour: 'shadowActionLitDark', inset: true },
        { x: 0, y: 1, blur: 2, colour: 'shadowFallDark1' },
        { x: 0, y: 8, blur: 16, spread: -6, colour: 'shadowFallNearDark2' },
      ],
      'action-near': [
        { x: 0, y: 1, blur: 0, colour: 'shadowActionLitNearDark', inset: true },
        { x: 0, y: 2, blur: 4, colour: 'shadowTrackDark' },
        { x: 0, y: 10, blur: 20, spread: -6, colour: 'shadowFallDark2' },
        { x: 0, y: 20, blur: 36, spread: -14, colour: 'shadowActionFallNearDark' },
      ],
      'action-press': [
        { x: 0, y: 2, blur: 4, colour: 'shadowActionPressDark', inset: true },
        { x: 0, y: 1, blur: 1, colour: 'shadowActionPressFallDark' },
      ],
      sheet: [
        { x: 1, y: 0, blur: 0, colour: 'shadowSheetLitDark', inset: true },
        { x: -24, y: 0, blur: 48, spread: -16, colour: 'shadowFallDark2' },
      ],
    },
  },
  minimal: {
    light: { raised: [], sunken: [], overlay: [], 'sunken-compact': [], selected: [], lift: [], 'lift-near': [], 'lift-press': [], 'lift-drag': [], track: [], action: [], 'action-near': [], 'action-press': [], sheet: [] },
    dark: { raised: [], sunken: [], overlay: [], 'sunken-compact': [], selected: [], lift: [], 'lift-near': [], 'lift-press': [], 'lift-drag': [], track: [], action: [], 'action-near': [], 'action-press': [], sheet: [] },
  },
  neo: {
    light: {
      raised: [
        { x: 7, y: 7, blur: 16, colour: 'shadowNeoRaisedDarkLight' },
        { x: -7, y: -7, blur: 16, colour: 'shadowNeoHighlightLight' },
      ],
      sunken: [
        { x: 4, y: 4, blur: 9, colour: 'shadowNeoSunkenDarkLight', inset: true },
        { x: -4, y: -4, blur: 9, colour: 'shadowNeoHighlightLight', inset: true },
      ],
      overlay: [
        { x: 7, y: 7, blur: 16, colour: 'shadowNeoRaisedDarkLight' },
        { x: -7, y: -7, blur: 16, colour: 'shadowNeoHighlightLight' },
      ],
      /** `--chipShadow` light (`desktop.dc.html:59`) — both layers reused, see docblock above. */
      'sunken-compact': [
        { x: 2, y: 2, blur: 4, colour: 'shadowNeoRaisedDarkLight', inset: true },
        { x: -2, y: -2, blur: 4, colour: 'shadowNeoHighlightLight', inset: true },
      ],
      /**
       * `--segOnShadow` neo light (`desktop.dc.html:65`) — same colour pair as
       * `raised`/`sunken-compact` (`shadowNeoRaisedDarkLight`/
       * `shadowNeoHighlightLight`), a THIRD geometry (3px/3px/6px, inset) —
       * see `ShadowRole`'s own docblock for why no existing role could be
       * reused for this one.
       */
      selected: [
        { x: 3, y: 3, blur: 6, colour: 'shadowNeoRaisedDarkLight', inset: true },
        { x: -3, y: -3, blur: 6, colour: 'shadowNeoHighlightLight', inset: true },
      ],
      /** Styling refresh — neo's own language: the card at rest IS `raised`. */
      lift: [
        { x: 7, y: 7, blur: 16, colour: 'shadowNeoRaisedDarkLight' },
        { x: -7, y: -7, blur: 16, colour: 'shadowNeoHighlightLight' },
      ],
      /** Toward the user: the same pair, thrown further. */
      'lift-near': [
        { x: 10, y: 10, blur: 24, colour: 'shadowNeoRaisedDarkLight' },
        { x: -10, y: -10, blur: 24, colour: 'shadowNeoHighlightLight' },
      ],
      'lift-press': [
        { x: 4, y: 4, blur: 10, colour: 'shadowNeoRaisedDarkLight' },
        { x: -4, y: -4, blur: 10, colour: 'shadowNeoHighlightLight' },
      ],
      /** Dragged (2026-09-29, Task 5A): the raised pair thrown further still. */
      'lift-drag': [
        { x: 14, y: 14, blur: 32, colour: 'shadowNeoRaisedDarkLight' },
        { x: -14, y: -14, blur: 32, colour: 'shadowNeoHighlightLight' },
      ],
      /** The track IS neo's `sunken` tray. */
      track: [
        { x: 4, y: 4, blur: 9, colour: 'shadowNeoSunkenDarkLight', inset: true },
        { x: -4, y: -4, blur: 9, colour: 'shadowNeoHighlightLight', inset: true },
      ],
      action: [
        { x: 4, y: 4, blur: 10, colour: 'shadowNeoRaisedDarkLight' },
        { x: -4, y: -4, blur: 10, colour: 'shadowNeoHighlightLight' },
      ],
      'action-near': [
        { x: 7, y: 7, blur: 16, colour: 'shadowNeoRaisedDarkLight' },
        { x: -7, y: -7, blur: 16, colour: 'shadowNeoHighlightLight' },
      ],
      /** Pushed in: neo's own `selected` inset. */
      'action-press': [
        { x: 3, y: 3, blur: 6, colour: 'shadowNeoRaisedDarkLight', inset: true },
        { x: -3, y: -3, blur: 6, colour: 'shadowNeoHighlightLight', inset: true },
      ],
      sheet: [
        { x: 7, y: 7, blur: 16, colour: 'shadowNeoRaisedDarkLight' },
        { x: -7, y: -7, blur: 16, colour: 'shadowNeoHighlightLight' },
      ],
    },
    dark: {
      raised: [
        { x: 7, y: 7, blur: 16, colour: 'shadowNeoRaisedDarkDark' },
        { x: -7, y: -7, blur: 16, colour: 'shadowNeoRaisedHighlightDark' },
      ],
      sunken: [
        { x: 4, y: 4, blur: 9, colour: 'shadowNeoSunkenDarkDark', inset: true },
        { x: -4, y: -4, blur: 9, colour: 'shadowNeoSunkenHighlightDark', inset: true },
      ],
      overlay: [
        { x: 7, y: 7, blur: 16, colour: 'shadowNeoRaisedDarkDark' },
        { x: -7, y: -7, blur: 16, colour: 'shadowNeoRaisedHighlightDark' },
      ],
      /**
       * `--chipShadow` dark (`desktop.dc.html:71`) — layer 2 reused
       * (`shadowNeoSunkenHighlightDark`, byte-identical to `--chipShadow`'s
       * `rgba(255,255,255,0.05)`); layer 1 is the one genuinely new colour
       * (`shadowNeoSunkenCompactDarkDark`, `rgba(0,0,0,0.55)` — different
       * alpha than `sunken`'s own dark layer 1, `rgba(0,0,0,0.6)`).
       */
      'sunken-compact': [
        { x: 2, y: 2, blur: 4, colour: 'shadowNeoSunkenCompactDarkDark', inset: true },
        { x: -2, y: -2, blur: 4, colour: 'shadowNeoSunkenHighlightDark', inset: true },
      ],
      /**
       * `--segOnShadow` neo dark (`desktop.dc.html:77`) — same colour pair as
       * `sunken-compact` (`shadowNeoSunkenCompactDarkDark`/
       * `shadowNeoSunkenHighlightDark`), the 3px/3px/6px geometry instead of
       * `sunken-compact`'s 2px/2px/4px.
       */
      selected: [
        { x: 3, y: 3, blur: 6, colour: 'shadowNeoSunkenCompactDarkDark', inset: true },
        { x: -3, y: -3, blur: 6, colour: 'shadowNeoSunkenHighlightDark', inset: true },
      ],
      /** Styling refresh — neo's own language: the card at rest IS `raised`. */
      lift: [
        { x: 7, y: 7, blur: 16, colour: 'shadowNeoRaisedDarkDark' },
        { x: -7, y: -7, blur: 16, colour: 'shadowNeoRaisedHighlightDark' },
      ],
      /** Toward the user: the same pair, thrown further. */
      'lift-near': [
        { x: 10, y: 10, blur: 24, colour: 'shadowNeoRaisedDarkDark' },
        { x: -10, y: -10, blur: 24, colour: 'shadowNeoRaisedHighlightDark' },
      ],
      'lift-press': [
        { x: 4, y: 4, blur: 10, colour: 'shadowNeoRaisedDarkDark' },
        { x: -4, y: -4, blur: 10, colour: 'shadowNeoRaisedHighlightDark' },
      ],
      /** Dragged (2026-09-29, Task 5A): the raised pair thrown further still. */
      'lift-drag': [
        { x: 14, y: 14, blur: 32, colour: 'shadowNeoRaisedDarkDark' },
        { x: -14, y: -14, blur: 32, colour: 'shadowNeoRaisedHighlightDark' },
      ],
      /** The track IS neo's `sunken` tray. */
      track: [
        { x: 4, y: 4, blur: 9, colour: 'shadowNeoSunkenDarkDark', inset: true },
        { x: -4, y: -4, blur: 9, colour: 'shadowNeoSunkenHighlightDark', inset: true },
      ],
      action: [
        { x: 4, y: 4, blur: 10, colour: 'shadowNeoRaisedDarkDark' },
        { x: -4, y: -4, blur: 10, colour: 'shadowNeoRaisedHighlightDark' },
      ],
      'action-near': [
        { x: 7, y: 7, blur: 16, colour: 'shadowNeoRaisedDarkDark' },
        { x: -7, y: -7, blur: 16, colour: 'shadowNeoRaisedHighlightDark' },
      ],
      /** Pushed in: neo's own `selected` inset. */
      'action-press': [
        { x: 3, y: 3, blur: 6, colour: 'shadowNeoSunkenCompactDarkDark', inset: true },
        { x: -3, y: -3, blur: 6, colour: 'shadowNeoSunkenHighlightDark', inset: true },
      ],
      sheet: [
        { x: 7, y: 7, blur: 16, colour: 'shadowNeoRaisedDarkDark' },
        { x: -7, y: -7, blur: 16, colour: 'shadowNeoRaisedHighlightDark' },
      ],
    },
  },
};

function shadowLayerCss(layer: ShadowLayer): string {
  const spread = layer.spread === undefined ? '' : ` ${layer.spread}px`;
  return `${layer.inset ? 'inset ' : ''}${layer.x}px ${layer.y}px ${layer.blur}px${spread} ${primitives[layer.colour]}`;
}

/** The CSS `box-shadow` value for one style×theme×role — `'none'` when that combination has no layers. */
export function shadowValueOf(style: StyleName, theme: ThemeName, role: ShadowRole): string {
  const layers = SHADOWS[style][theme][role];
  return layers.length === 0 ? 'none' : layers.map(shadowLayerCss).join(', ');
}

/** `shadow-raised` → `--gn-shadow-raised`. */
export function shadowVariableName(role: ShadowRole): string {
  return `--gn-shadow-${role}`;
}

/**
 * Contrast guarantees the origin declares about itself. The tokens test
 * verifies each pair at its minimum in BOTH themes — a palette edit that
 * breaks readability fails the build, it does not ship.
 */
export const CONTRAST_PAIRS: ReadonlyArray<{ fg: TokenRole; bg: TokenRole; minimum: number }> = [
  { fg: 'text', bg: 'surface', minimum: 4.5 },
  { fg: 'text', bg: 'surfaceRaised', minimum: 4.5 },
  { fg: 'textMuted', bg: 'surface', minimum: 4.5 },
  { fg: 'accentText', bg: 'accent', minimum: 4.5 },
  { fg: 'dangerText', bg: 'danger', minimum: 4.5 },
  { fg: 'warningText', bg: 'warning', minimum: 4.5 },
  { fg: 'successText', bg: 'success', minimum: 4.5 },
  /**
   * The calendar renders a custom date claim's LABEL in this role, not just a
   * glyph, so it is held to the text minimum rather than the 3:1 a decorative
   * mark would earn. Measured on this palette: 5.22 in light, 7.86 in dark. A
   * role added without a pair here would be a colour with no guarantee — the
   * one thing this file exists to make impossible.
   */
  { fg: 'customMarker', bg: 'surface', minimum: 4.5 },

  /**
   * ## THE GAP THIS BLOCK CLOSES (pre-launch item 6, 2026-09-07)
   *
   * The eight pairs above were the whole declared set, and the docblock over
   * this array says a role without a pair here "would be a colour with no
   * guarantee — the one thing this file exists to make impossible". It was not
   * impossible: nothing checks that a pair which actually CO-OCCURS on screen
   * has been declared. Eighteen did not. Every one of them was measured and
   * every one PASSES today — this is a missing guarantee, not a live defect —
   * but an undeclared pair is exactly the one a future palette edit breaks in
   * silence, which is the failure this array was built to prevent.
   *
   * WHY THE MINIMUMS DIFFER, since a uniform 4.5 would be the tidier-wrong
   * answer. The status roles reach the screen as `.gn-chip__dot`'s BACKGROUND
   * (`ui.css:50-56`) — a non-text UI component, which WCAG 1.4.11 holds to 3:1,
   * not the 4.5 body text earns. They are pinned at 3 rather than relaxed to it:
   * all seven measure above 5.0 in both themes, so the looser minimum costs no
   * real margin, and stating 3 keeps the number honest about what the pixel is.
   * The four text pairs stay at 4.5 because they are read, not merely seen:
   * `a { color: var(--gn-accent) }` (globals.css:13), the help table header on
   * `surfaceSunken` (ui.css:1309), and the mobile help screen's muted/accent
   * lines on a raised card (help-screen.tsx:96-97).
   *
   * Smallest margin in the set is `accent on surface` at 5.33 against 4.5.
   *
   * **RENAMED, Round 2d (2026-09-09) — `accent` → `textAccent` on both rows
   * below.** The sentence above describes the state BEFORE this change and is
   * kept rather than rewritten, because the citation (`a { color:
   * var(--gn-accent) }`, ui.css:1309) is exactly what moved: that selector now
   * reads `var(--gn-text-accent)` (see `apps/web/app/globals.css:13`), and the
   * new `textAccent` role — not `accent` — is what these two rows guarantee.
   * `accent` itself no longer carries a text-contrast guarantee at all: the
   * owner's neo-round accent hexes (`#3A6DB0`/`#7FA9E4`) were only ever
   * measured as a FILL (5.26 vs the then-white `accentText`, 4.93 today), and measure 4.19–4.30 as
   * TEXT on these same backgrounds — below what these rows require. **T1
   * (2026-09-18) later moved the light hex to `#33629f`, which clears these two
   * backgrounds (5.07 / 5.81) while still failing `surfaceSunken` (4.42), so
   * the sentence above remains true about the rows it names and the guarantee
   * stays with `textAccent` regardless — see `blue600`'s docblock.** Asking one
   * role to clear both jobs would have meant keeping the worse of the two
   * numbers on the fill; splitting the role is what let `accent` become the
   * owner's own, duller-as-text hue while `textAccent` gets its own, darker
   * (light) / lighter (dark) derived value (`primitives.textAccentLight`/
   * `textAccentDark` — see their docblocks for the exact derivation). **The
   * smallest margin in the RENAMED set moved on 2026-09-18 (T5) and the
   * sentence that used to name `neo` here is superseded rather than edited
   * away:** T5 lightened `neoPaper`, so `textAccent` on `neo`'s
   * `surface`/`surfaceRaised` went **5.311 → 5.596** — which makes it no
   * longer the smallest. The smallest is now `hig`/`minimal`'s own
   * `warmPaper` at **5.453**, with `warmRaised` at 6.26. (The
   * primitive's own binding constraint is tighter still — 4.539, against
   * `.gn-button--ghost`'s fillTertiary-composited background — but that pair
   * is not one of these two declared rows; see `textAccentLight`'s docblock.)
   */
  { fg: 'text', bg: 'surfaceSunken', minimum: 4.5 },
  { fg: 'textMuted', bg: 'surfaceRaised', minimum: 4.5 },
  // Added 2026-09-08 with `/mcp/tokens`, whose rows put muted secondary text
  // on a sunken row. CONTRAST_PAIRS is SELF-DECLARED enforcement — a pair
  // nobody lists is a pair nobody checks — so a new fg-on-bg combination
  // shipping without its row here is the gap, not a formality.
  { fg: 'textMuted', bg: 'surfaceSunken', minimum: 4.5 },
  { fg: 'textAccent', bg: 'surface', minimum: 4.5 },
  { fg: 'textAccent', bg: 'surfaceRaised', minimum: 4.5 },
  /**
   * Added 2026-09-15 with `textSubtle`, and all THREE rows rather than the
   * one `/help` currently needs. On that screen the role only ever lands on
   * the ambient `surface` (eyebrows, group counts, the pager label) — but
   * the role is global the moment it exists, and this array's own "GAP THIS
   * BLOCK CLOSES" note is explicit that the undeclared co-occurring pair is
   * the one a future edit breaks in silence. The derivation clears all
   * three by construction (see `primitives.textSubtleLight`), so stating
   * them costs nothing and the two unstated ones would have been free
   * exposure.
   *
   * 4.5 and not 3: this is read text, not a decorative mark. Smallest
   * margin in the set is `surfaceSunken` — 4.61 light, 4.54 dark.
   */
  { fg: 'textSubtle', bg: 'surface', minimum: 4.5 },
  { fg: 'textSubtle', bg: 'surfaceRaised', minimum: 4.5 },
  { fg: 'textSubtle', bg: 'surfaceSunken', minimum: 4.5 },
  { fg: 'categoryOpen', bg: 'surface', minimum: 3 },
  { fg: 'categoryActive', bg: 'surface', minimum: 3 },
  { fg: 'categoryTerminal', bg: 'surface', minimum: 3 },
  { fg: 'blocked', bg: 'surface', minimum: 3 },
  { fg: 'pending', bg: 'surface', minimum: 3 },
  { fg: 'restricted', bg: 'surface', minimum: 3 },
  { fg: 'contested', bg: 'surface', minimum: 3 },
  { fg: 'categoryOpen', bg: 'surfaceRaised', minimum: 3 },
  { fg: 'categoryActive', bg: 'surfaceRaised', minimum: 3 },
  { fg: 'categoryTerminal', bg: 'surfaceRaised', minimum: 3 },
  { fg: 'blocked', bg: 'surfaceRaised', minimum: 3 },
  { fg: 'pending', bg: 'surfaceRaised', minimum: 3 },
  { fg: 'restricted', bg: 'surfaceRaised', minimum: 3 },
  { fg: 'contested', bg: 'surfaceRaised', minimum: 3 },
  /**
   * Added with the border sweep, and ONLY with it — `docs/hig-adoption-brief.md`
   * §7: *"Whichever wins, a `border`-on-`surface` pair should be ADDED to
   * `CONTRAST_PAIRS`, because the current gap is how this got to 17/24
   * unnoticed."*
   *
   * **These could not land in the palette PR and the reason is worth keeping.**
   * Against the pre-sweep primitives they measured **1.34** light and **1.49**
   * dark — so declaring them alone is a red gate, while remapping alone would
   * have put a heavy dark rule on every card, chip, table cell and column,
   * which **no gate would object to, because a *darker* border fails nothing.**
   * Enforcement and remedy had to be one commit; this is it.
   *
   * What `border` still paints after the sweep is the point of the remap: not
   * structure — structure now separates by fill and spacing — but **state**.
   * The dashed markers for an unplaceable calendar item, a clipped timeline bar
   * and a drive-reference attachment are exactly the "components and STATES"
   * WCAG 1.4.11 names, so they are the borders that most needed to clear 3:1
   * and were the least likely to be noticed failing.
   *
   * `focusRing` is here for a different reason: it is never text and never
   * decorative, it is the only thing a keyboard user has to locate themselves
   * with, and it was undeclared.
   */
  { fg: 'border', bg: 'surface', minimum: 3 },
  { fg: 'borderStrong', bg: 'surface', minimum: 3 },
  { fg: 'focusRing', bg: 'surface', minimum: 3 },
  /**
   * Styling refresh Plan A Task 1 (2026-09-29). The two recessed grounds carry
   * the three text tiers (rule 03), the primary's edge clears the non-text 3:1
   * on the grounds a button sits on (rule 03, "edge ≥ 3:1"), the hovered
   * primary's label clears 4.5 on its hover fill, and the quiet controls'
   * accessible edge (`border`) is declared on the raised and well grounds it
   * now also sits on — it was only ever declared on `surface`.
   */
  { fg: 'text', bg: 'surfaceTrack', minimum: 4.5 },
  { fg: 'textMuted', bg: 'surfaceTrack', minimum: 4.5 },
  { fg: 'textSubtle', bg: 'surfaceTrack', minimum: 4.5 },
  { fg: 'text', bg: 'surfaceWell', minimum: 4.5 },
  { fg: 'textMuted', bg: 'surfaceWell', minimum: 4.5 },
  { fg: 'textSubtle', bg: 'surfaceWell', minimum: 4.5 },
  { fg: 'accentEdge', bg: 'surface', minimum: 3 },
  { fg: 'accentEdge', bg: 'surfaceRaised', minimum: 3 },
  { fg: 'accentText', bg: 'accentEdge', minimum: 4.5 },
  { fg: 'border', bg: 'surfaceRaised', minimum: 3 },
  { fg: 'border', bg: 'surfaceWell', minimum: 3 },
];

/**
 * `style` defaults to `'hig'` deliberately, not because `hig` is more
 * correct but because `apps/mobile` calls this with two arguments (mobile
 * has no style axis — Task 11 records the deferral) and must keep compiling
 * and running unmodified. Its RENDERED colours change as a side effect of
 * the palette adoption below; that is a recorded gap, not fixed here.
 */
export function colorOf(theme: ThemeName, role: TokenRole, style: StyleName = 'hig'): string {
  const override = STYLE_COLOR_OVERRIDES[style]?.[theme]?.[role];
  return primitives[override ?? themes[theme][role]];
}

/** `surfaceRaised` → `--gn-surface-raised`. */
export function cssVariableName(role: TokenRole): string {
  return `--gn-${role.replace(/[A-Z]/g, (upper) => `-${upper.toLowerCase()}`)}`;
}

const RADIUS_ROLES: readonly RadiusRole[] = ['card', 'control', 'track'];
/**
 * EXPORTED (round 3 fix round 1, 2026-09-16) so `tokens.test.ts` can build its
 * own "every var(--gn-…) names a declared role" check directly from THIS
 * array, rather than keeping a second, hand-maintained copy in the test file.
 * Before this export, `SHADOW_ROLE_NAMES` (`tokens.test.ts`) and this array
 * were two unlinked lists with no test cross-checking them against each
 * other. The dangerous direction is specifically forgetting a role HERE
 * (this emission list) while still adding it everywhere else — `ShadowRole`,
 * `SHADOWS`, a real `ui.css` rule, AND the test file's own (then-separate)
 * `SHADOW_ROLE_NAMES`: `themeStylesheet()` would stop emitting the role's
 * declaration, but the test's "declared" set — built from ITS OWN list,
 * which still names the role — would still consider `ui.css`'s reference
 * legitimate. 13.337 (colours only) and 13.347 (pins `raised` alone) neither
 * one would notice either. Every existing check stays green while the var
 * resolves to nothing in the browser — the opposite direction (a role added
 * here and forgotten in the test's list) instead reds the "declared role"
 * check loudly, which is safe, just noisy. See case 13.411, which closes
 * this gap directly by asserting the stylesheet's actual emitted content.
 *
 * **`selected` added, owner round 5 (2026-09-16) — and 13.411 itself needed a
 * manual addition to keep covering it.** 13.411's own `EXPECTED_SHADOW_ROLES`
 * is a SEPARATE hardcoded literal in the test file, deliberately not derived
 * from this array (see that case's docblock) so it can detect a role
 * vanishing from here. The consequence, confirmed rather than assumed: as
 * originally written, 13.411 did NOT cover a newly added role — its literal
 * simply did not know `'selected'` existed, so a `'selected'` missing from
 * this array would have passed 13.411 silently. `EXPECTED_SHADOW_ROLES` was
 * updated to add `'selected'` in the same change that added it here, which
 * is what makes 13.411's coverage of this role real rather than assumed.
 */
export const SHADOW_ROLES: readonly ShadowRole[] = [
  'raised',
  'sunken',
  'overlay',
  'sunken-compact',
  'selected',
  'lift',
  'lift-near',
  'lift-press',
  'lift-drag',
  'track',
  'action',
  'action-near',
  'action-press',
  'sheet',
];
const FONT_ROLES: readonly FontRole[] = ['sans', 'mono'];

function declarationsFor(style: StyleName, theme: ThemeName): string {
  const colours = TOKEN_ROLES.map((role) => `${cssVariableName(role)}: ${colorOf(theme, role, style)};`);
  const radiusDecls = RADIUS_ROLES.map((role) => `${radiusVariableName(role)}: ${radiusOf(style, role)};`);
  const shadowDecls = SHADOW_ROLES.map((role) => `${shadowVariableName(role)}: ${shadowValueOf(style, theme, role)};`);
  return [...colours, ...radiusDecls, ...shadowDecls].join(' ');
}

/**
 * The stylesheet the shells inline. `hig`/light is the default (bare
 * `:root`, no attribute needed for either axis); `[data-theme="dark"]` and
 * `[data-style="minimal"|"neo"]` are independent runtime overrides, set on
 * `document.documentElement` by `ThemeToggle`/`StyleToggle` respectively —
 * never `<body>`. All four ship — switching either axis never reloads.
 *
 * ## Three movements in the 2026-09-18 refresh are deliberately NOT ported here
 *
 * Recorded at the emitter because this is where the mechanism lives and where
 * someone porting "the rest of T2–T5" would otherwise look.
 *
 * 1. **T5's SELECTOR — do not port this, ever.** The export moved its light-neo
 *    block from `body[data-style="neo"]` to
 *    `body[data-theme="light"][data-style="neo"]`, which matches only when
 *    `data-theme` is exactly `"light"`. **This product runs the opposite
 *    convention: light is the ABSENCE of the attribute.** The theme stamp sets
 *    `dataset.theme` only when a stored value is present
 *    (`apps/web/app/layout.tsx`), so the default user has no `data-theme` at
 *    all. Adopting the export's selector VERBATIM would therefore drop the
 *    entire light-neo token set for every user who has never chosen a theme —
 *    which is the default state. The export's intent (make the light-neo arm
 *    explicit) is already served here by the different, documented mechanism
 *    below: `[data-style="X"]` plus the `:not([data-theme="light"])` OS-dark
 *    arm. **The movement is in the selector, and only the selector: the VALUES
 *    it carries (the surface and the five semantic colours) ARE ported, above.**
 * 2. **T2 — `--accent` moved from `:root` onto `body`.** No product action.
 *    This file's `--gn-accent` is emitted per style AND theme by
 *    `declarationsFor`, so the alias relationship the export is expressing (one
 *    accent picked, every style sharing it) is already structural here rather
 *    than a `var()` indirection. There is nothing to move.
 * 3. **T4 — `--tintAccent` became DERIVED (`color-mix(in srgb, var(--accent)
 *    7%, transparent)`) instead of a stored literal.** No product action, and
 *    this one is a refusal rather than an absence: **this product has no
 *    `tintAccent` role at all**, and no consumer for one. The export's four
 *    other accent-family tint washes are likewise unported, for the reason
 *    already recorded at `ui.css:2088` (a purple wash fails contrast on every
 *    ground it would sit on). Inventing a role with no consumer would put a
 *    value in `TOKEN_ROLES` that nothing renders and no `CONTRAST_PAIRS` row
 *    can hold to a floor.
 *
 * **Emission order is load-bearing, not cosmetic.** `[data-style="X"]:not([data-theme="light"])`
 * (the OS-dark arm for a non-hig style) and `:root:not([data-theme="light"])`
 * (hig's own OS-dark arm) have IDENTICAL specificity (0,2,0) — attribute
 * selectors don't stack unless nesting adds one, and `:not()`'s specificity
 * is its argument's. A tie resolves by SOURCE ORDER, so every per-style
 * block must be emitted AFTER the base `hig` blocks, or a `neo` user on an
 * OS-dark device would see `hig`'s dark values win. `[data-style="X"][data-theme="dark"]`
 * (the explicit arm) has higher specificity than `hig`'s (0,1,0) either way,
 * so it needs no such care — but is still emitted last per style, matching
 * the existing explicit-then-media order this file already used for `hig`.
 */
export function themeStylesheet(): string {
  const blocks: string[] = [
    /* The typefaces, emitted ONCE and outside `declarationsFor`. They are the
       only design values in this file that vary with neither axis, so writing
       them into the per-style×theme function would repeat two identical
       declarations across all six blocks and quietly invite one of the six to
       drift. Emitted FIRST so that a future per-style face — added inside
       `declarationsFor`, where it would belong — lands later in source order
       and wins the tie against this base at equal specificity, which is the
       direction an override has to resolve. */
    `:root { ${FONT_ROLES.map((role) => `${fontVariableName(role)}: ${fontStackOf(role)};`).join(' ')} ${(
      Object.keys(spacing) as unknown as SpaceStep[]
    )
      .map((step) => `${spaceVariableName(step)}: ${spacing[step]};`)
      .join(' ')} ${(Object.keys(motion) as MotionKey[])
      .map((key) => `${motionVariableName(key)}: ${motion[key]};`)
      .join(' ')} }`,
    `:root { ${declarationsFor('hig', 'light')} }`,
    `[data-theme="dark"] { ${declarationsFor('hig', 'dark')} }`,
    `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { ${declarationsFor('hig', 'dark')} } }`,
  ];
  for (const style of ['minimal', 'neo'] as const) {
    blocks.push(`[data-style="${style}"] { ${declarationsFor(style, 'light')} }`);
    blocks.push(
      `@media (prefers-color-scheme: dark) { [data-style="${style}"]:not([data-theme="light"]) { ${declarationsFor(style, 'dark')} } }`,
    );
    blocks.push(`[data-style="${style}"][data-theme="dark"] { ${declarationsFor(style, 'dark')} }`);
  }
  return blocks.join('\n');
}
