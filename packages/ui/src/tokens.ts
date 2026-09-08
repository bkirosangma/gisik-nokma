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
 *   that still fails**: `successText` on `success` measures **4.40 against
 *   4.5**, missing by 0.10. The incumbent measures **5.40** and sits within a
 *   hair of Apple's hue, so the cheapest correct answer was to not move it.
 *   Verified both ways here rather than taken on trust.
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
  ink: '#000000',
  inkMuted: '#3c3c43',
  /** Untouched — the border story is atomic and lands with its sweep. */
  line: '#d9d6cf',
  lineStrong: '#a8a49a',
  blue600: '#0040dd',
  blue300: '#409cff',
  navy900: '#101625',
  red600: '#d70015',
  red300: '#ff6961',
  redInk: '#300a06',
  amber700: '#b25000',
  amber300: '#ffb340',
  amberInk: '#241a00',
  /** KEPT over Apple's `#248A3D`, which fails `successText` at 4.40 vs 4.5. */
  green700: '#1e7a34',
  green300: '#30db5b',
  greenInk: '#05230e',
  violet600: '#8944ab',
  violet300: '#da8fff',
  magenta600: '#d30f45',
  magenta300: '#ff6482',
  fog: '#ffffff',
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
  /** `neo` light: rule (c) (dark-only fill separation) leaves light alone — the export's neo surface, raised and sunken are one hex, relying on shadow for elevation. */
  neoPaper: '#ede4db',
  /** `neo` dark surface — the export's own value, unlike raised/sunken below. */
  neoNavy: '#1b2340',
  /**
   * **DERIVED, not measured — ruling item 3(b).** The export's `neo` dark
   * raised and sunken are the SAME hex as surface (separation 1.00, rule (c)
   * fails outright). The ruling requires deriving steps giving at least
   * `hig`/`minimal` dark's own separation (surface↔raised 1.214,
   * surface↔sunken 1.460, measured against `#141a2e`/`#20294a`/`#2a3560`).
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
   * margin. `accent` on `neoNavyRaised` measures 4.528.
   */
  neoNavyRaised: '#29314c',
  neoNavySunken: '#3b425b',

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
} as const;

export type PrimitiveName = keyof typeof primitives;

export const TOKEN_ROLES = [
  'surface',
  'surfaceRaised',
  'surfaceSunken',
  'surfaceOverlay',
  'text',
  'textMuted',
  'textInverted',
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
  'focusRing',
  'shadow',
  'accent',
  'accentText',
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
    text: 'ink',
    textMuted: 'inkMuted',
    textInverted: 'white',
    border: 'grayAccessible',
    borderStrong: 'grayAccessible',
    fillPrimary: 'fillWarmShared1',
    fillSecondary: 'fillWarmShared2',
    fillTertiary: 'fillWarmHig3',
    fillQuaternary: 'fillWarmHig4',
    focusRing: 'blue600',
    shadow: 'scrimLight',
    accent: 'blue600',
    accentText: 'white',
    danger: 'red600',
    dangerText: 'white',
    warning: 'amber700',
    warningText: 'white',
    success: 'green700',
    successText: 'white',
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
    text: 'fog',
    textMuted: 'fogMuted',
    textInverted: 'ink',
    border: 'grayAccessibleDark',
    borderStrong: 'grayAccessibleDark',
    fillPrimary: 'fillNavyShared1',
    fillSecondary: 'fillNavyShared2',
    fillTertiary: 'fillNavyHig3',
    fillQuaternary: 'fillNavyHig4',
    focusRing: 'blue300',
    shadow: 'scrimDark',
    accent: 'blue300',
    accentText: 'navy900',
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
 * `neo`'s divergence from the `themes` map above — only the 8 roles the
 * ruling actually varies by style. `minimal` needs no entry: its colours are
 * byte-identical to `hig`'s (it differs only in `radii`/`shadows`).
 */
const STYLE_COLOR_OVERRIDES: Partial<Record<StyleName, Record<ThemeName, Partial<Record<TokenRole, PrimitiveName>>>>> = {
  neo: {
    light: {
      surface: 'neoPaper',
      surfaceRaised: 'neoPaper',
      surfaceSunken: 'neoPaper',
      surfaceOverlay: 'overlayWarmNeo',
      fillTertiary: 'fillWarmNeo3',
      fillQuaternary: 'fillWarmNeo4',
    },
    dark: {
      surface: 'neoNavy',
      surfaceRaised: 'neoNavyRaised',
      surfaceSunken: 'neoNavySunken',
      surfaceOverlay: 'overlayNavyNeo',
      fillTertiary: 'fillNavyNeo3',
      fillQuaternary: 'fillNavyNeo4',
    },
  },
};

/** `radius.card` / `radius.control` → `--gn-radius-card` / `--gn-radius-control`. Not a colour, so plain CSS length strings, no primitive/discipline concerns. */
export type RadiusRole = 'card' | 'control';

/** `hig` and `minimal` share the shipped radii; `neo`'s are the export's own, larger values. */
export const radii: Record<StyleName, Record<RadiusRole, string>> = {
  hig: { card: '16px', control: '8px' },
  minimal: { card: '16px', control: '8px' },
  neo: { card: '20px', control: '14px' },
};

export function radiusOf(style: StyleName, role: RadiusRole): string {
  return radii[style][role];
}

/** `radius-card` → `--gn-radius-card`. */
export function radiusVariableName(role: RadiusRole): string {
  return `--gn-radius-${role}`;
}

export type ShadowRole = 'raised' | 'sunken' | 'overlay';

/** One `box-shadow` layer: geometry as plain numbers (not colour, outside the discipline scanner's remit) plus one alpha-colour primitive. */
type ShadowLayer = {
  x: number;
  y: number;
  blur: number;
  colour: PrimitiveName;
  inset?: boolean;
};

/**
 * Every style×theme's raised/sunken elevation, transcribed from the export
 * (`design-system/neo-tokens.json`). `overlay` is DERIVED, not measured —
 * ruling item 6: neither exported file defines a dedicated overlay shadow,
 * so it reuses that style×theme's `raised` treatment (a sheet or modal
 * floating above the scrim reads as "raised" the same way a card does).
 * `minimal` has no shadow in either theme — its cards/fields are flat by
 * design (rule (b) keeps its controls identifiable by fill/label instead).
 */
const SHADOWS: Record<StyleName, Record<ThemeName, Record<ShadowRole, readonly ShadowLayer[]>>> = {
  hig: {
    light: {
      raised: [{ x: 0, y: 1, blur: 3, colour: 'shadowHigLight' }],
      sunken: [],
      overlay: [{ x: 0, y: 1, blur: 3, colour: 'shadowHigLight' }],
    },
    dark: {
      raised: [{ x: 0, y: 1, blur: 3, colour: 'shadowHigDark' }],
      sunken: [],
      overlay: [{ x: 0, y: 1, blur: 3, colour: 'shadowHigDark' }],
    },
  },
  minimal: {
    light: { raised: [], sunken: [], overlay: [] },
    dark: { raised: [], sunken: [], overlay: [] },
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
    },
  },
};

function shadowLayerCss(layer: ShadowLayer): string {
  return `${layer.inset ? 'inset ' : ''}${layer.x}px ${layer.y}px ${layer.blur}px ${primitives[layer.colour]}`;
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
   */
  { fg: 'text', bg: 'surfaceSunken', minimum: 4.5 },
  { fg: 'textMuted', bg: 'surfaceRaised', minimum: 4.5 },
  // Added 2026-09-08 with `/mcp/tokens`, whose rows put muted secondary text
  // on a sunken row. CONTRAST_PAIRS is SELF-DECLARED enforcement — a pair
  // nobody lists is a pair nobody checks — so a new fg-on-bg combination
  // shipping without its row here is the gap, not a formality.
  { fg: 'textMuted', bg: 'surfaceSunken', minimum: 4.5 },
  { fg: 'accent', bg: 'surface', minimum: 4.5 },
  { fg: 'accent', bg: 'surfaceRaised', minimum: 4.5 },
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

const RADIUS_ROLES: readonly RadiusRole[] = ['card', 'control'];
const SHADOW_ROLES: readonly ShadowRole[] = ['raised', 'sunken', 'overlay'];

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
