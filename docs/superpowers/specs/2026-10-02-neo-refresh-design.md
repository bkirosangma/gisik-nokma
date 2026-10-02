# The neo refresh: design

**Status:** owner-approved decisions N1–N10 (2026-10-02, ~12:00–12:10). Ships as **the next release**, `release/neo-refresh`, cut in parallel from `release/prefix-groups-ux` at `4f86b959` (owner, 2026-10-02 ~12:30); `main` is merged in once that release lands. Scope is the `neo` style only; `hig` and `minimal` are untouched except where a rule is shared by construction (§7 names each one).

**Sources:**
- the audit: `gisik-nokma-lanes/NEO-AUDIT-2026-10-02.md` (findings 1–10, §11 rulings log);
- the specimen bench the owner ruled from: `gisik-nokma-lanes/neo-mockup-2026-10-02/index.html` (published v6 at https://claude.ai/artifact/MDeNmMV1N2u8FBvRhFxKLt; BEFORE = release tokens at `5ec8e997`, AFTER = this spec);
- the earlier research: `gisik-nokma-lanes/audit-2026-10-01/NEO-RESEARCH.md`;
- the rulings it supersedes in part: `docs/superpowers/specs/2026-10-02-ux-fixes-design.md` U5 and U8 (see N2, N4, N10).

Every colour ratio below is WCAG relative luminance on the composited layer (alpha over its ground, no blur: the best case; a blurred edge is fainter). Line numbers are `origin/release/prefix-groups-ux` at `b61d6e5e`.

## 1. The problem

The owner's words: *"the highlights and shadows in the neumorphic style do not feel very neumorphic."* Ten findings explain why; each is one paragraph here and a section in the audit.

1. **Pressed shadow on a lighter fill.** After U8 the wells went to `#e6dcd2`/`#141a33` but `surfaceSunken` stayed at the page hex (`tokens.ts:1047`, `1064`), so a selected segment or a field inside a tray is 1.13 / 1.11 *lighter* than its track while wearing an inset: the fill says raised, the shadow says pressed.
2. **Press never inverts.** `lift-press` is an outset 4/4/10 (`tokens.ts:1513`, `1589`); a pressed card, door or board card only gets a smaller lift. Only the primary's `action-press` inverts.
3. **Quiet controls are flat.** `.gn-button--ghost` (`ui.css:7252`), the switch (`:8097–8153`), the column-option checkbox (`:2394`), icon buttons (`:959`, `:2022`): no pair at all.
4. **Dark neo is an elevation idiom, not extrusion.** Raised `#232c50` on `#1b2340` (1.14) does the lifting; the 12% highlight (1.40) is a halo on a box that is already another colour; the sunken highlight is 5% white (1.16), invisible.
5. **Shadow colours are not derived from the surface.** The light fall is a saturated brown `#b09884` (composites `#cdbdaf`, browner than paper × 0.85 `#cdc7c1`) and reads as a stain inside fields; dark uses three fall colours and two highlights across its roles.
6. **The light highlight is pure white at 95%**: a cold halo at every raised corner.
7. **The halo washes neighbouring text.** The 7/16 pair reaches ~23px (34px on hover) past every raised element regardless of its size; a later sibling's highlight paints OVER an earlier sibling's text. Real sites: workspace grid gap 18px (`globals.css:266–270`), board cards 8px apart under an 8px-padded column title (`ui.css:1208–1212`, `1287`), section title 12px above its card (`globals.css:793–798`), the page heading 20px under the raised nav (`globals.css:169`, `2078`), a field label 7px over a raised select trigger (`ui.css:7075–7101`, `7240`).
8. **The highlight layer sits on coloured fills.** The primary and the confirm wear the paper pair over an accent/danger fill (`ui.css:108–122`, `130–142`); pressed paints an inset white ring inside the blue; the outer highlight is fog on the paper; the 1px accent edge plus the 2px focus ring at 1px offset (`:96`) is a double ring.
9. **Insets too spread for the box.** `sunken` inset 4/4/9 inside a 44px field or track (`tokens.ts:1479`, `1550`) covers most of the box and reads as a cushion.
10. **The rim beats the recess.** With a faint inset, the uniform 1px rim (U5) is the strongest edge and a neo field reads as an outlined flat box; the dark fall cannot exceed 1.18 on `#141a33`, so depth there must come from a crisp lip.

## 2. Owner rulings (N1–N10, 2026-10-02)

| # | Ruling — the planner's recommendation, accepted by the owner ("go with your recommendations, write the plan", 2026-10-02 ~12:10); N10 is the owner's own words | Supersedes |
|---|---|---|
| N1 | **"yes: press inverts to an inset. It is a shadow change, so the 09-29 'nothing moves' ruling still holds."** | — (2026-09-29 "nothing moves" stays: no transform on cards) |
| N2 | **"yes: surfaceSunken becomes the well colour (#e6dcd2 / #141a33)."** | U8's "surfaceSunken (the field ground) is unchanged" |
| N3 | **"yes: depth on ghost and icon buttons; the border is kept."** | D6 "borders on buttons" is kept, depth added |
| N4 | **"B: dark raised surfaces use the page hex #1b2340 with the 16% highlight."** | U8's raised step `#232c50` |
| N5 | **"yes: light shadow #a89c91; warm highlight #fffaf4 at 70% (50% compact)."** | the export's `#b09884` / `#ffffff` |
| N6 | **"yes: neo arms for the switch and checkbox."** | — |
| N7 | **"yes: 14px board clearance (card gap and column-title padding), plus the halo-clearance rule everywhere. Styling-refresh rule 02's '8px between cards' changes to 14px."** | styling refresh rule 02 (board cards) |
| N8 | **"8 and 9 are straight fixes."** (no highlight on coloured fills; insets sized to the box) | — |
| N9 | (same ruling as N8, second half: the inset family) | — |
| N10 | **"I want to go with B in neumorphic. maybe it can be shown in the other styles if it is required."** (~12:00) — no field rim in neo; **HIG and minimal keep the rim.** | U5 for `neo` only |

## 3. The token layer (`packages/ui/src/tokens.ts`)

### 3.1 Shadow-layer primitives (all `shadow*`, 8-digit alpha hex — the sweep in `tokens.test.ts:285` requires it)

| Primitive | neo-light | neo-dark | Composited on its ground → ratio |
|---|---|---|---|
| `shadowNeoDark{Light,Dark}` — the fall, every raised role | `#a89c918c` | `#0000008c` | light `#c9bfb6` on paper 1.52; dark `#0c101d` on navy 1.23 |
| `shadowNeoDarkSunken{Light,Dark}` — wells | `#a89c9199` | `#0000008c` | 1.58 / 1.23 |
| `shadowNeoBand{Light,Dark}` — the control recess band | `#a89c91cc` | `#000000bf` | `#b4a99e` on `#e6dcd2` 1.71; `#05070d` on `#141a33` 1.18 (the cap) |
| `shadowNeoHighlight{Light,Dark}` — raised-lg, raised | `#fffaf4b3` (70%) | `#f2e9e129` (16%) | `#fbf5ef` 1.10; `#3e435a` 1.58 |
| `shadowNeoHighlightCompact{Light,Dark}` — raised-compact | `#fffaf480` (50%) | `#f2e9e11f` (12%) | — |
| `shadowNeoHighlightSunken{Light,Dark}` — wells, chips | `#fffaf480` (50%) | `#f2e9e114` (8%) | 1.09; 1.26 |
| `shadowNeoLip{Light,Dark}` — the control recess lip | `#fffaf4cc` (80%) | `#f2e9e159` (35%) | `#faf4ed` 1.24; `#616270` 2.85 |
| `shadowNeoLine{Light,Dark}` — the field's crisp boundary | `#897362ff` | `#7d88a8ff` | light **3.31** on `#e6dcd2` (3.75 on paper); dark **4.86** on `#141a33`, **3.85** vs the page card |
| `shadowNeoAccentPress{Light,Dark}` — primary press | `#264a77ff` (= `blue600` × 0.75) | `#5f7fabff` (= `blue300` × 0.75) | — |
| `shadowNeoDangerPress{Light,Dark}` — confirm press | `#772018ff` (= `neoLightDanger` × 0.75) | `#bf4f49ff` (= `red300` × 0.75) | — |

Retired (unmapped, docblocks kept): `shadowNeoRaisedDarkLight`, `shadowNeoHighlightLight`, `shadowNeoSunkenDarkLight`, `shadowNeoRaisedDarkDark`, `shadowNeoRaisedHighlightDark`, `shadowNeoSunkenDarkDark`, `shadowNeoSunkenHighlightDark`, `shadowNeoSunkenCompactDarkDark` (`tokens.ts:375–399`); `neoNavyRaised` (`:230`) and `neoFieldRim*` stay as primitives (`fieldRim` keeps resolving for every style; only neo's CSS stops reading it).

### 3.2 Surfaces (`STYLE_COLOR_OVERRIDES.neo`, `tokens.ts:1042–1074`)

| Role | neo-light | neo-dark | Change |
|---|---|---|---|
| `surface` | `#f1eae3` | `#1b2340` | — |
| `surfaceRaised` | `#f1eae3` | **`#1b2340`** (`neoNavy`) | N4 = B (was `#232c50`) |
| `surfaceSunken` | **`#e6dcd2`** (`neoWellLight`) | **`#141a33`** (`neoWellDark`) | N2 (was the page hex) |
| `surfaceTrack`, `surfaceWell` | `#e6dcd2` | `#141a33` | — |
| `fieldRim` | `#897362` | `#6f7997` | mapping kept; neo CSS no longer reads it (N10) |

### 3.3 Shadow roles (`ShadowRole`, `SHADOWS.neo`, `tokens.ts:1295–1309`, `1473–1621`; `SHADOW_ROLES` `:1880`)

Geometry is `x y blur` in px; `D` = the fall primitive, `H` = highlight, `B`/`L` = band/lip, `N` = line. Both themes share geometry.

| Role | neo value | Used by | hig / minimal |
|---|---|---|---|
| `raised-lg` (new) | `7 7 16 D, -7 -7 16 H` | sheet, dialog, section panels, nav bar, menus, popovers, toast | hig = its `raised`; minimal none |
| `near-lg` (new) | `10 10 24 D, -10 -10 24 H` | dialog, popovers, menus at rest; large hover | hig = `lift-near`; minimal none |
| `raised` | **`4 4 10 D, -4 -4 10 H`** | cards, door cards, board cards, column-option pills | unchanged |
| `near` (new) | `6 6 14 D, -6 -6 14 H` | card hover | hig = `lift-near`; minimal none |
| `raised-compact` (new) | `2 2 4 D, -2 -2 4 Hc` | ghost/icon buttons at rest, switch knob (off), chips that are raised | hig = `lift`; minimal none |
| `lift` / `lift-near` / `lift-press` | = `raised` / `near` / **`recess`** | cards and doors (rest / hover / press) | unchanged |
| `lift-drag` | `14 14 32 D, -14 -14 32 H` | drag clone | unchanged |
| `overlay`, `sheet` | = `raised-lg` | | unchanged |
| `sunken`, `track` | **`inset 3 3 6 Ds, inset -3 -3 5 Hs`** | wells, board columns, trays, segmented track ground | unchanged |
| `recess` (new) | **`inset 3 3 5 B, inset -1 -1 1 L`** | segmented track, switch track, current nav item, pressed segment (`selected`), card press | hig = `sunken` (none); minimal none |
| `selected`, `action-press` | = `recess` | | hig unchanged |
| `field` (new) | light **`inset 1 1 0 N, inset 3 3 5 B, inset -1 -1 1 L`**; dark **`inset 3 3 5 B, inset -1 -1 0 N`** | every neo text field, search, textarea, select trigger | hig/minimal none (they keep the rim) |
| `sunken-compact` | **`inset 1 1 3 Ds, inset -1 -1 2 Hs`** | chips, badges, workflow-list state, task checkbox, column-option box | unchanged (none) |
| `quiet` / `quiet-near` / `quiet-press` (new) | = `raised-compact` / `raised` / `recess` | ghost buttons, icon buttons | hig/minimal none (ghost stays flat there) |
| `action` / `action-near` | hig-only semantics kept; neo = `raised-compact` / `raised` | (no neo consumer after this release) | unchanged |
| `action-filled` (new) | **`3 4 10 D`** (one layer, no highlight) | primary at rest | hig = its `action`; minimal none |
| `action-filled-near` (new) | **`5 6 14 D`** | primary hover | hig = `action-near` |
| `action-filled-press` (new) | **`inset 2 2 5 AccentPress`** | primary press | hig = `action-press` |
| `danger` / `danger-near` / `danger-press` (new) | = `action-filled` / `action-filled-near` / **`inset 2 2 5 DangerPress`** | the confirm button | hig = `lift` / `lift-near` / `lift-press` (its current values) |
| `knob-on` (new) | **`1 2 4 D`** | the switch knob on the accent track | hig/minimal none |

Justification for the sizes: offset ≈ 5–7% of the element's short side, blur ≈ 2.3× offset (the release's own ratio); a 240px card → 4/10, a 44px control → 2/4 raised or 3/5 inset, a 28px chip → 1/3. The recess lip is 1px with 1px blur so the floor stays flat; dark needs a stronger lip and light a stronger band because each theme's other edge is at its physical cap.

### 3.4 Halo clearance (new length tokens, emitted per style like the radii)

| Token | neo | hig | minimal | Rule |
|---|---|---|---|---|
| `--gn-halo-lg` | `23px` | `8px` | `0px` | offset + blur of `raised-lg` |
| `--gn-halo` | `14px` | `8px` | `0px` | offset + blur of `raised` |
| `--gn-halo-compact` | `6px` | `3px` | `0px` | offset + blur of `raised-compact` |

**The rule:** readable text outside a raised element sits at least that element's halo away from its edge. Hover halos (34 / 20) are transient and tolerated. Where a layout cannot open up (a dense list, the phone rail) the fallback is `position: relative; z-index: 1` on the text — never clipping the highlight. The concrete changes under N7: board card gap and column-title bottom padding 8px → `var(--gn-halo)` (14px in neo, 8px in hig); `.gn-account__section` gap 12px → 14px; `.gn-shell__main` margin-top 20px → 24px; the workspace grid (18px) and settings gap (20px) already clear the 14px card halo and do not change.

### 3.5 Other values

| Token / rule | Value |
|---|---|
| button `outline-offset` (`ui.css:96–99`) | 1px → **3px** (shared: all styles; the field already uses 3px, U9) |
| field `outline-offset` | 3px (unchanged) |
| `radii.neo` | 20 / 14 / 28 (unchanged) |
| `motion` | unchanged; `box-shadow` transitions added to the segmented item, nav links, the switch knob and ghost buttons (`--gn-motion-move`), with `transition: none` under reduced motion |

## 4. Rules

- **No highlight on a coloured fill (N8).** The highlight layer exists only where the fill is the paper/navy. The primary, the confirm, the on-switch track and its knob, a checked box and any filled chip carry one dark fall and press into a darker shade of their own colour. The switch's accent track stays flat (it is a value, not a surface).
- **Press inverts (N1).** Cards, doors, board cards, ghost/icon buttons and the primary/confirm press to an inset; nothing transforms on cards (2026-09-29 stands; the primary keeps its own `scale(0.98)` from the styling refresh).
- **A pressed fill is never lighter than its ground (N2).** `surfaceSunken` = the well colour; the selected segment paints `surfaceTrack`.
- **The neo field boundary is its recess edge (N10).** One crisp 1px line ≥ 3:1 per theme (dark line top-left in light; light lip bottom-right in dark), one-sided as WCAG 1.4.11's partial-edge example allows; the uniform rim stays in hig and minimal.
- **Insets scale with the box (N9), raised pairs scale with the element (N7).**

## 5. Contrast floors kept (computed)

| Pair | neo-light | neo-dark | Floor |
|---|---|---|---|
| `text` on `surfaceSunken` (= well) | 12.74 | 14.30 | 4.5 |
| `textMuted` on `surfaceSunken` | 8.09 | ≥ 6.8 | 4.5 |
| `textSubtle` (placeholder) on `surfaceSunken` | 4.77 | 6.82 | 4.5 (neo contexts, `field-placeholder-contrast.test.ts`) |
| `textAccent` on `surfaceSunken` | ≥ 4.58 | 7.10 | 4.5 |
| field line / lip on the field fill | 3.31 | 4.86 (3.85 vs the card) | 3.0 (1.4.11, one edge) |
| `fieldRim` (hig/minimal) on their surfaces | unchanged | unchanged | 3.0 |
| focus ring (`blue600` / `blue300`) on the page | 5.20 | 6.39 | 3.0 |
| `accent` on the dark raised (now `#1b2340`) | — | 5.33 (`textAccent` ≥ 4.5 already a declared pair on `surface`) | 4.5 / 3 |
| segmented bar `text` on `surfaceTrack`; nav bar | 12.74 | 14.30 | 3.0 |
| the accent edge on the primary; accent fill as the state cue | unchanged | unchanged | 3.0 |

Nothing on either theme uses the shadow pair as its only state cue. The one place a *shadow* is the boundary — the neo field — carries a crisp line layer whose ratio is computed and asserted like a border.

## 6. What does NOT change

- hig and minimal: every shadow role string, every surface, the field rim, the ghost button (flat) — byte-identical (`tokens.test.ts` 13.347 / 20.012 keep passing; the plan adds a before/after snapshot of every hig/minimal role).
- The accent for the action (U1), the selected-segment bar (U6), flat disabled fields (U7), the 3px field focus offset (U9), the well/track colours (U8 second half), the cream ground (U4), the radii, the 44px targets, the drag lift (`lift-drag`), the sheet's slide and the dialog's rise.
- The nav indicator bar, notice bars (`inset 4px 0 0`), the refusal panel.
- No new React API; no data model; no copy (grep of `docs/manual.md` for the style names finds nothing).

## 7. Style scoping

Neo only, through the token layer: every CSS consumer keeps reading a `--gn-shadow-*` variable, and hig/minimal get the SAME values they have today for every role, old or new (§3.3's last column). Shared rules that must move for all three styles, each named: (1) `.gn-button:focus-visible { outline-offset: 3px }` (`ui.css:96`); (2) the board gaps read `var(--gn-halo)` (8px in hig and minimal, so their layout is unchanged); (3) `.gn-button--primary` reads `--gn-shadow-action-filled*` and `.gn-button--danger` reads `--gn-shadow-danger*` — same rendered values in hig (mapped from its `action*` / `lift*`); (4) `.gn-switch:checked::after` and the ghost/icon buttons read new roles that render `none` in hig/minimal. Case 13.340 (no `[data-style]` block may touch `.gn-button`) is honoured: buttons change through tokens only.

## 8. Open risks

1. **`#0000008c` on `#141a33` composites at 1.18** — the dark band cannot get darker; the dark field's depth leans on the 35% lip and the crisp `#7d88a8` line. If the owner finds the dark recess still faint at 1×, the next lever is the fill: `neoWellDark` `#141a33` → `#10152b` (text floors hold; re-measure).
2. **`field-placeholder-contrast.test.ts` composites `fill-quaternary` over `surfaceRaised`.** With N4 the dark raised is `#1b2340`; the neo field's own ground is `surfaceSunken` `#141a33`. The test must composite over the field's ground, or `neoTextSubtleDark` (4.62 on the old composite) is re-measured on the new one (6.82 on the well: clears).
3. **13.340 + ghost depth:** depth reaches ghost buttons only through the base rule reading `--gn-shadow-quiet`; a lane that reaches for a `[data-style="neo"] .gn-button--ghost` block reddens 13.340 and must not land.
4. **Board density (N7):** 14px gaps lengthen columns by ~6px per card; the phone rail's visible-column clamp (23.120) is re-measured.
5. **`viewport.spec.ts:1093–1113` asserts the neo field's `borderStyle` is `solid`** — with a transparent border it still is, but the sweep's "ring ≥ 3:1" claim becomes false; the assertion moves to the line layer's colour in the computed `box-shadow`.
6. **The 1.18 cap and the roster:** the persisted `non-text-contrast-roster.json` keeps the sanctioned neo-field entry; after N10 the entry's note must say the boundary is the line layer, or the roster lies.
