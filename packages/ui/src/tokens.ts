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
  paper: '#f2f2f7',
  sand: '#e5e5ea',
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
  coal: '#000000',
  coalRaised: '#1c1c1e',
  coalSunken: '#2c2c2e',
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

export const themes: Record<ThemeName, Record<TokenRole, PrimitiveName>> = {
  light: {
    surface: 'paper',
    surfaceRaised: 'white',
    surfaceSunken: 'sand',
    surfaceOverlay: 'scrimLight',
    text: 'ink',
    textMuted: 'inkMuted',
    textInverted: 'white',
    border: 'line',
    borderStrong: 'lineStrong',
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
    surface: 'coal',
    surfaceRaised: 'coalRaised',
    surfaceSunken: 'coalSunken',
    surfaceOverlay: 'scrimDark',
    text: 'fog',
    textMuted: 'fogMuted',
    textInverted: 'ink',
    border: 'seam',
    borderStrong: 'seamStrong',
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
];

export function colorOf(theme: ThemeName, role: TokenRole): string {
  return primitives[themes[theme][role]];
}

/** `surfaceRaised` → `--gn-surface-raised`. */
export function cssVariableName(role: TokenRole): string {
  return `--gn-${role.replace(/[A-Z]/g, (upper) => `-${upper.toLowerCase()}`)}`;
}

function declarationsFor(theme: ThemeName): string {
  return TOKEN_ROLES.map((role) => `${cssVariableName(role)}: ${colorOf(theme, role)};`).join(' ');
}

/**
 * The stylesheet the shells inline. Light is the default; dark applies via an
 * explicit `data-theme="dark"` on the root element, or via OS preference when
 * no explicit choice was made. Both themes ship — switching never reloads.
 */
export function themeStylesheet(): string {
  return [
    `:root { ${declarationsFor('light')} }`,
    `[data-theme="dark"] { ${declarationsFor('dark')} }`,
    `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { ${declarationsFor('dark')} } }`,
  ].join('\n');
}
