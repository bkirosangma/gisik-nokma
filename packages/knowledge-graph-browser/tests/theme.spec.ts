import { expect, test } from '@playwright/test';
import { openAdapter, still, takePageErrors } from './helpers.js';

/*
 * The theme on the REAL adapter, with the app's REAL `themeStylesheet()` injected and no `color-scheme` anywhere: `dark` is
 * read from the painted card fill (planner ruling 2026-10-04 22:25, superseding plan T5 step 1's `color-scheme` read).
 */

// an uncaught page error fails every case: a throw inside a rAF callback kills the camera driver and shows nothing else (27.285)
test.afterEach(() => expect(takePageErrors()).toEqual([]));

test('27.267 trap 3: a card\'s second line is the light attachment, a data-style flip that stays light re-rasterises every second line, and data-theme="dark" reads as dark and switches it to the dark one; control: an item without a second line has none and is not re-rasterised', async ({ page }) => {
  await openAdapter(page);
  const light = await page.evaluate(() => ({ dark: window.__kg.readPalette().dark, sub: window.__kg.probe!.nodeDisplay('ticket:t133')!.attachment, none: window.__kg.probe!.nodeDisplay('ticket:t131')!.attachment }));
  expect(light).toEqual({ dark: false, sub: 'subL', none: null });
  // a data-style flip that stays light keeps the attachment NAME `subL` (the cache is keyed node:name), so only the
  // dropped entries make each second line re-rasterise in the new ink
  const n0 = await page.evaluate(() => window.__kg.probe!.invalidated().length); // the log is cumulative
  await page.evaluate(() => document.documentElement.setAttribute('data-style', 'minimal'));
  await still(page);
  const styled = await page.evaluate((n0) => {
    const k = window.__kg, p = k.probe!, nodes = k.scene().nodes;
    return {
      dark: k.readPalette().dark,
      sub: p.nodeDisplay('ticket:t133')!.attachment,
      fresh: p.invalidated().slice(n0),
      subbed: nodes.filter((n) => n.sub !== null).map((n) => n.ref),
      bare: nodes.filter((n) => n.sub === null).map((n) => n.ref),
    };
  }, n0);
  expect({ dark: styled.dark, sub: styled.sub }).toEqual({ dark: false, sub: 'subL' }); // still light, the same name
  expect(styled.subbed.length).toBeGreaterThan(0);
  for (const ref of styled.subbed) expect(styled.fresh).toContain(ref);
  expect(styled.bare).toContain('ticket:t131');
  expect(styled.fresh.filter((ref) => styled.bare.includes(ref))).toEqual([]); // control: no second line, nothing dropped
  await page.evaluate(() => document.documentElement.removeAttribute('data-style'));
  await still(page);
  await page.evaluate(() => window.__kg.setTheme('dark'));
  await still(page);
  const dark = await page.evaluate(() => ({ dark: window.__kg.readPalette().dark, sub: window.__kg.probe!.nodeDisplay('ticket:t133')!.attachment, none: window.__kg.probe!.nodeDisplay('ticket:t131')!.attachment }));
  expect(dark).toEqual({ dark: true, sub: 'subD', none: null }); // ruling leg (1): data-theme=dark → dark, and the name leaves subL
});

test('27.287 Review Focus 3: an OS theme flip with no data-theme redraws icons and cards in the dark palette; control: flipping back restores the first icon exactly, and data-theme="light" under an OS dark reads as light', async ({ page }) => {
  await openAdapter(page);
  const read = () =>
    page.evaluate(() => {
      const k = window.__kg, p = k.probe!, pal = k.readPalette();
      return { dark: pal.dark, sunken: pal.surfaceSunken, raised: pal.surfaceRaised, image: p.nodeDisplay('person:pA')!.image, backdrop: p.nodeDisplay('ticket:t133')!.backdropColor };
    });
  const light = await read();
  expect(await page.evaluate(() => document.documentElement.hasAttribute('data-theme'))).toBe(false);
  expect(light.dark).toBe(false); // ruling leg (4): the default light reads as light
  expect(light.backdrop).toBe(light.raised);
  await page.emulateMedia({ colorScheme: 'dark' });
  await still(page);
  const dark = await read();
  expect(dark.dark).toBe(true); // ruling leg (2): no data-theme + OS dark → dark
  expect(dark.raised).not.toBe(light.raised); // the tokens did flip
  expect(dark.image).not.toBe(light.image);
  expect(decodeURIComponent(dark.image.slice(dark.image.indexOf(',') + 1))).toContain(dark.sunken);
  expect(dark.backdrop).toBe(dark.raised);
  // ruling leg (3): data-theme=light under the OS dark reads as light (what makes leg 2 non-vacuous)
  await page.evaluate(() => window.__kg.setTheme('light'));
  await still(page);
  expect((await read()).dark).toBe(false);
  await page.evaluate(() => window.__kg.setTheme(null));
  await page.emulateMedia({ colorScheme: 'light' });
  await still(page);
  expect((await read()).image).toBe(light.image); // control: the cache is keyed by palette
});
