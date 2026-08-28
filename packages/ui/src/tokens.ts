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

export const primitives = {
  white: '#ffffff',
  paper: '#f7f6f3',
  sand: '#edebe6',
  ink: '#1c1b18',
  inkMuted: '#5f5c55',
  line: '#d9d6cf',
  lineStrong: '#a8a49a',
  blue600: '#2a5fd0',
  blue300: '#7aa2ff',
  navy900: '#101625',
  red600: '#b3261e',
  red300: '#ff8a80',
  redInk: '#300a06',
  amber700: '#8a5a00',
  amber300: '#e0a94f',
  amberInk: '#241a00',
  green700: '#1e7a34',
  green300: '#62c07a',
  greenInk: '#05230e',
  violet600: '#6b5ca8',
  violet300: '#b3a6e3',
  magenta600: '#a8326e',
  magenta300: '#e88bb8',
  coal: '#1b1a17',
  coalRaised: '#242320',
  coalSunken: '#121110',
  fog: '#ece9e2',
  fogMuted: '#a7a399',
  seam: '#3a3833',
  seamStrong: '#57544c',
  scrimLight: '#1c1b1866',
  scrimDark: '#000000a6',
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
    categoryOpen: 'inkMuted',
    categoryActive: 'blue600',
    categoryTerminal: 'green700',
    blocked: 'red600',
    pending: 'amber700',
    restricted: 'violet600',
    contested: 'magenta600',
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
    categoryOpen: 'fogMuted',
    categoryActive: 'blue300',
    categoryTerminal: 'green300',
    blocked: 'red300',
    pending: 'amber300',
    restricted: 'violet300',
    contested: 'magenta300',
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
