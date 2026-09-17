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

/**
 * The monospace face for one `Platform.OS`, ported from the desktop
 * prototype's `font-family: ui-monospace, Menlo, monospace`.
 *
 * React Native takes ONE family name, not a CSS stack with fallbacks, so the
 * fallback chain has to become a branch and the branch has to be taken here —
 * `Platform.select` would drag `react-native` into this module, and the
 * docblock at the top of this file records why it must not. The screen passes
 * `Platform.OS` in; this stays a pure function a node runner can call.
 *
 * `Menlo` is what `ui-monospace` resolves to on Apple platforms and what the
 * prototype names second for that reason. `monospace` is the generic Android
 * honours (Droid Sans Mono). It replaces `'Courier'`, which was neither: a
 * narrow, light typewriter face that iOS ships for compatibility and that no
 * part of this design ever asked for.
 *
 * WHY THERE IS NO `sansFamilyFor`. The prototype's body stack begins
 * `-apple-system` — a CSS keyword meaning "whatever this OS calls its system
 * font", with no meaning at all inside a `StyleSheet`. React Native ALREADY
 * paints unstyled text in that font when `fontFamily` is unset: San Francisco
 * on iOS, Roboto on Android. Writing the stack into a style object would not
 * port it, it would name six families the platform cannot find and fall back
 * silently. So the screen leaves body text's family unset, which is the port —
 * an absence that is correct, recorded here so it does not read as an omission.
 */
export function monoFamilyFor(os: string): string {
  return os === 'ios' ? 'Menlo' : 'monospace';
}

/** The palette for a device appearance. */
export function helpPaletteFor(scheme: string | null | undefined): ReturnType<typeof helpPalette> {
  return helpPalette(themeFor(scheme));
}
