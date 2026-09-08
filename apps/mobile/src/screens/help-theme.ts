import { colorOf, type ThemeName } from '@gisik-nokma/ui/tokens';

/**
 * The theme-dependent half of the help screen, kept out of the `.tsx` on
 * purpose.
 *
 * `apps/mobile/vitest.config.ts` runs in a node environment and states the rule
 * this file follows: *".tsx components stay thin and untested at this layer by
 * design; their pure logic lives in sibling .ts modules."* Importing the screen
 * itself would drag `react-native` into a node runner, which is why the first
 * attempt at these cases failed to parse. So the palette lives here, with no
 * React and no react-native import, and the screen builds its `StyleSheet` from
 * it.
 *
 * What this buys beyond testability: the set of roles the screen uses is now
 * written down in one place, so "which colours does the phone's help screen
 * depend on" has an answer that is not "read 90 lines of StyleSheet".
 */

/** The theme a `useColorScheme()` answer means. `null` — no opinion — is light. */
export function themeFor(scheme: string | null | undefined): ThemeName {
  return scheme === 'dark' ? 'dark' : 'light';
}

/** Every colour role the help screen draws with, resolved for one theme. */
export function helpPalette(theme: ThemeName): {
  surface: string;
  surfaceRaised: string;
  surfaceSunken: string;
  border: string;
  borderStrong: string;
  text: string;
  textMuted: string;
  accent: string;
  warning: string;
} {
  return {
    surface: colorOf(theme, 'surface'),
    surfaceRaised: colorOf(theme, 'surfaceRaised'),
    surfaceSunken: colorOf(theme, 'surfaceSunken'),
    border: colorOf(theme, 'border'),
    borderStrong: colorOf(theme, 'borderStrong'),
    text: colorOf(theme, 'text'),
    textMuted: colorOf(theme, 'textMuted'),
    accent: colorOf(theme, 'accent'),
    warning: colorOf(theme, 'warning'),
  };
}

/** The palette for a device appearance. */
export function helpPaletteFor(scheme: string | null | undefined): ReturnType<typeof helpPalette> {
  return helpPalette(themeFor(scheme));
}
