import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { colorOf } from '@gisik-nokma/ui/tokens';
import { helpPalette, helpPaletteFor, monoFamilyFor, themeFor } from './help-theme.js';

/**
 * The phone's help screen follows the device's appearance (owner-assigned,
 * 2026-09-08). Cases 12.394–12.396.
 *
 * The palette is a sibling `.ts` precisely so these run: importing the `.tsx`
 * would drag `react-native` into this node runner, which is the rule
 * `vitest.config.ts` already states. What is NOT drivable here is whether iOS or
 * Android actually reports dark — that is `app.json`'s `userInterfaceStyle`, and
 * 12.396 asserts the declaration rather than a rendered result, which is the
 * honest limit of this gate.
 */
describe('12.394 what a device appearance means', () => {
  it('maps dark to dark and EVERYTHING ELSE to light, null included', () => {
    expect(themeFor('dark')).toBe('dark');
    expect(themeFor('light')).toBe('light');
    // `useColorScheme()` answers null when the platform has no opinion. Light is
    // the behaviour this screen already had, so null must not become dark and
    // must not throw.
    expect(themeFor(null)).toBe('light');
    expect(themeFor(undefined)).toBe('light');
    // An unrecognised future platform string must not silently darken a screen
    // nobody asked to darken.
    expect(themeFor('high-contrast')).toBe('light');
  });
});

describe('12.395 the two palettes are actually different', () => {
  it('resolves the same roles to each theme’s OWN values, so dark is not light twice', () => {
    const light = helpPalette('light');
    const dark = helpPalette('dark');

    // The assertion that matters. Until 2026-09-08 every colour on this screen
    // came from `colorOf('light', role)`, so a "dark" palette would have been
    // byte-identical to the light one — and a case that only checked `themeFor`
    // would still have passed.
    for (const role of Object.keys(light) as (keyof typeof light)[]) {
      expect(dark[role], `${role} is the same in both themes`).not.toBe(light[role]);
    }

    // And each is its own theme's token, not merely different from the other.
    expect(light.surface).toBe(colorOf('light', 'surface'));
    expect(dark.surface).toBe(colorOf('dark', 'surface'));
    expect(dark.text).toBe(colorOf('dark', 'text'));

    // The screen-facing entry point agrees with the two above.
    expect(helpPaletteFor('dark')).toEqual(dark);
    expect(helpPaletteFor(null)).toEqual(light);
  });
});

describe('12.396 the native shell is told to follow the system', () => {
  it('app.json declares userInterfaceStyle automatic', () => {
    const appJson = JSON.parse(
      readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'app.json'), 'utf8'),
    ) as { expo: { userInterfaceStyle?: string } };
    // Without this the OS never reports dark, `useColorScheme()` answers light
    // forever, and the screen is a themed screen that can never BE dark — which
    // reads exactly like a themed screen that works.
    expect(appJson.expo.userInterfaceStyle).toBe('automatic');
  });
});

/**
 * 12.397 — the phone's inline code renders in the design's monospace face.
 * Numbered in THIS file's own series and not with the `/help` font cases it
 * landed beside: `test-cases/` mirrors the feature sections, and the mobile
 * help screen's cases are 12.394–12.396 here.
 *
 * The screen imports this rather than calling `Platform.select` inline so the
 * branch is reachable from a node runner at all; asserting `Platform.OS`
 * directly would need the `react-native` module this config keeps out. What
 * that leaves unproven is the same honest limit 12.396 states: the wiring
 * (`fontFamily: monoFamilyFor(Platform.OS)`) is asserted against the source
 * below, not against a rendered glyph.
 */
describe('12.397 the mobile monospace face', () => {
  it('is Menlo on iOS and the generic monospace elsewhere, never Courier', () => {
    expect(monoFamilyFor('ios')).toBe('Menlo');
    expect(monoFamilyFor('android')).toBe('monospace');
    // An unknown platform gets the generic, not a crash and not an Apple-only
    // face — `Platform.OS` also answers 'web', 'windows' and 'macos'.
    expect(monoFamilyFor('web')).toBe('monospace');
    for (const os of ['ios', 'android', 'web']) {
      expect(monoFamilyFor(os), 'Courier was the old value; nothing should return it').not.toBe(
        'Courier',
      );
    }
  });

  it('is what the screen actually sets on its code style', () => {
    const screen = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), 'help-screen.tsx'),
      'utf8',
    );
    // The `.tsx` is untested at this layer by design, so the wiring is checked
    // as text. Without this, `monoFamilyFor` could be correct and unused and
    // both cases above would still pass.
    expect(screen).toContain('fontFamily: monoFamilyFor(Platform.OS)');
    expect(screen).not.toContain("fontFamily: 'Courier'");
  });
});
