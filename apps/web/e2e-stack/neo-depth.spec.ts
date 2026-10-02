import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { readWorkspaceId, seededProjectHref } from './helpers/board.js';
import { OWNER_EMAIL, signIn } from './helpers/sign-in.js';

/**
 * Neo refresh T8 (cases 24.110–24.115): the rendered depth of the neo themes, read from the BUILT stack at :3001, plus the hig/minimal
 * regression. LOCAL — the stack is the primary checkout's `ctl rebuild`, never a worktree's.
 *
 * ## Why a layer parser and not the plan's `/inset 3px 3px 5px/` regexes
 *
 * Chrome serialises a computed `box-shadow` as `<colour> <x> <y> <blur> <spread> [inset]` — the colour FIRST and `inset` LAST
 * (`rgba(…) 3px 3px 5px 0px inset`). A regex that expects `inset 3px 3px 5px` can never match, so the plan's assertions would have
 * failed for the right product and passed for none. `layers()` splits the value into its layers and reads each field by name.
 *
 * ## Why every case has a control in the same `it()`
 *
 * Each assertion that "this has no X" is paired, in the same test, with the read that says X IS drawn where it should be (the
 * recess on the track next to the raised ghost; the pressed shadow next to the resting one), so a selector that matched nothing
 * or the wrong element fails loudly instead of passing vacuously.
 */

const THEMES = ['light', 'dark'] as const;
type Theme = (typeof THEMES)[number];

/** Where the screenshots go: outside the repo, so a re-run never dirties the tree. */
const SHOTS = resolve(process.cwd(), '../../../gisik-nokma-lanes/neo-refresh-verify/2026-10-02');
mkdirSync(SHOTS, { recursive: true });

// The producing tokens are `neoShadows(NEO_LIGHT | NEO_DARK)` in `packages/ui/src/tokens.ts`; a literal that differs from the computed
// value is a FINDING to report with both values, not a number to nudge.
const LINE = { light: 'rgb(137, 115, 98)', dark: 'rgb(125, 136, 168)' } satisfies Record<Theme, string>;
const ACCENT_PRESS = { light: 'rgb(38, 74, 119)', dark: 'rgb(95, 127, 171)' } satisfies Record<Theme, string>;
const WELL = { light: 'rgb(230, 220, 210)', dark: 'rgb(20, 26, 51)' } satisfies Record<Theme, string>;
const ACCENT = { light: 'rgb(51, 98, 159)', dark: 'rgb(127, 169, 228)' } satisfies Record<Theme, string>;
/** The warm white of the light-theme highlight (`shadowNeoHighlightLight`); a coloured fill must not carry it. */
const HIGHLIGHT_RGB = '255, 250, 244';
/** `halo.neo.card` in `tokens.ts` — `--gn-halo`, the clearance the board gap and the column-title padding both read (N7). */
const NEO_HALO = '14px';

interface Layer {
  readonly colour: string;
  readonly x: number;
  readonly y: number;
  readonly blur: number;
  readonly spread: number;
  readonly inset: boolean;
}

/** Splits at the top-level commas only: `rgba(1, 2, 3, 0.4)` holds commas of its own. */
function splitTopLevel(value: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < value.length; i += 1) {
    const ch = value[i];
    if (ch === '(') depth += 1;
    else if (ch === ')') depth -= 1;
    else if (ch === ',' && depth === 0) {
      parts.push(value.slice(start, i).trim());
      start = i + 1;
    }
  }
  parts.push(value.slice(start).trim());
  return parts;
}

/** A computed `box-shadow` as layers; `none` is no layers. */
function layers(value: string): Layer[] {
  if (value.trim() === 'none') return [];
  return splitTopLevel(value).map((raw) => {
    const colour = /rgba?\([^)]*\)/.exec(raw)?.[0];
    if (colour === undefined) throw new Error(`no colour in the box-shadow layer "${raw}" (whole value: ${value})`);
    const inset = /\binset\b/.test(raw);
    const lengths = [...raw.replace(colour, '').matchAll(/-?\d+(?:\.\d+)?(?=px)/g)].map((m) => Number(m[0]));
    if (lengths.length < 2) throw new Error(`fewer than two lengths in the box-shadow layer "${raw}" (whole value: ${value})`);
    return { colour, x: lengths[0]!, y: lengths[1]!, blur: lengths[2] ?? 0, spread: lengths[3] ?? 0, inset };
  });
}

/** `rgba(255, 250, 244, 0.7)` and `rgb(255, 250, 244)` are the same RGB; a highlight is named by its channels, not its alpha. */
function channels(colour: string): string {
  return /\(([^)]*)\)/.exec(colour)![1]!.split(',').slice(0, 3).map((c) => c.trim()).join(', ');
}

const hasLayer = (all: readonly Layer[], want: Partial<Layer>): boolean =>
  all.some((l) => (Object.keys(want) as (keyof Layer)[]).every((k) => l[k] === want[k]));

/** The recess band: `inset 3px 3px 5px` in the control's own band colour (`neoShadows`: `recess`). */
const hasRecessBand = (all: readonly Layer[]): boolean => hasLayer(all, { inset: true, x: 3, y: 3, blur: 5 });

async function applyStyle(page: Page, style: 'hig' | 'minimal' | 'neo', theme: Theme): Promise<void> {
  await page.evaluate(
    ([s, t]) => {
      document.documentElement.dataset['style'] = s;
      document.documentElement.dataset['theme'] = t;
    },
    [style, theme] as const,
  );
}

const boxShadow = (loc: Locator): Promise<string> => loc.evaluate((el) => getComputedStyle(el).boxShadow);

/** `/help` is one 47,000px page of manual text: its frame is the viewport, the nav and the segmented track, not the whole document. */
async function shot(page: Page, name: string, fullPage = true): Promise<void> {
  await page.screenshot({ path: resolve(SHOTS, `${name}.png`), fullPage });
}

async function openSeededBoardPage(page: Page): Promise<void> {
  await signIn(page, OWNER_EMAIL);
  await page.goto('/workspaces');
  const workspaceId = await readWorkspaceId(page);
  await page.goto(await seededProjectHref(page, workspaceId), { waitUntil: 'networkidle' });
}

for (const theme of THEMES) {
  test(`24.110 neo-${theme}: the sign-in field's boundary is the recess line, not a border; the primary carries one fall and presses into its own blue`, async ({ page }) => {
    await page.goto('/sign-in', { waitUntil: 'networkidle' });
    await applyStyle(page, 'neo', theme);

    const field = page.locator('.gn-field__input').first();
    await expect(field).toBeVisible();
    const fieldStyle = await field.evaluate((el) => {
      const c = getComputedStyle(el);
      return { borderStyle: c.borderStyle, borderColor: c.borderColor, boxShadow: c.boxShadow };
    });
    expect(fieldStyle.borderStyle, 'control: the box keeps its 1px border, so the field keeps its size').toBe('solid');
    expect(fieldStyle.borderColor, 'the border is transparent: no ring').toBe('rgba(0, 0, 0, 0)');
    const fieldLayers = layers(fieldStyle.boxShadow);
    expect(fieldLayers.map((l) => l.colour), `the field's line layer (${LINE[theme]}) is in its shadow`).toContain(LINE[theme]);

    const primary = page.locator('.gn-button--primary').first();
    await expect(primary).toBeVisible();
    const rest = layers(await boxShadow(primary));
    expect(rest.length, 'one layer at rest').toBe(1);
    expect(rest[0]!.inset, 'the one fall is a fall, not an inset').toBe(false);
    expect(
      rest.map((l) => channels(l.colour)),
      'no highlight on a coloured fill',
    ).not.toContain(HIGHLIGHT_RGB);

    await primary.hover();
    await page.mouse.down();
    // The press shadow arrives through the button's box-shadow transition: poll until it settles rather than read the first frame.
    await expect
      .poll(async () => layers(await boxShadow(primary)).filter((l) => l.inset).map((l) => l.colour), {
        message: 'the pressed primary carries an inset in its own accent-press blue',
      })
      .toContain(ACCENT_PRESS[theme]);
    const pressed = layers(await boxShadow(primary));
    await page.mouse.up();
    expect(pressed.length, 'control: pressing CHANGED the shadow, from one fall to one inset').toBe(1);
    expect(pressed[0]!.inset).toBe(true);
    await shot(page, `sign-in-neo-${theme}`);
  });

  test(`24.111 neo-${theme}: the help segmented track and the current nav item are recesses; the ghost button is raised`, async ({ page }) => {
    await page.goto('/help', { waitUntil: 'networkidle' });
    await applyStyle(page, 'neo', theme);

    const track = layers(await boxShadow(page.locator('.gn-segmented').first()));
    expect(hasRecessBand(track), `the track paints the recess band (inset 3px 3px 5px); got ${JSON.stringify(track)}`).toBe(true);
    const current = layers(await boxShadow(page.locator(".gn-nav a[aria-current='page']").first()));
    expect(hasRecessBand(current), `the current nav item paints the recess band; got ${JSON.stringify(current)}`).toBe(true);
    await shot(page, `help-neo-${theme}`, false);

    // The ghost button is not on /help (signed out there is no `gn-button--ghost`): the sign-in passkey control is the one that is.
    await page.goto('/sign-in', { waitUntil: 'networkidle' });
    await applyStyle(page, 'neo', theme);
    const ghost = layers(await boxShadow(page.locator('.gn-button--ghost').first()));
    expect(ghost.length, `a raised pair, not a recess; got ${JSON.stringify(ghost)}`).toBe(2);
    expect(
      ghost.some((l) => l.inset),
      'control: the ghost is raised, so no layer is an inset — the track above is the recess',
    ).toBe(false);
    expect(hasLayer(ghost, { x: 2, y: 2, blur: 4 }) && hasLayer(ghost, { x: -2, y: -2, blur: 4 }), 'raised-compact: 2px 2px 4px and its mirror').toBe(true);
    await shot(page, `sign-in-ghost-neo-${theme}`);
  });

  test(`24.112 neo-${theme}: board cards sit 14px apart and 14px under the column title (N7)`, async ({ page }) => {
    await openSeededBoardPage(page);
    await applyStyle(page, 'neo', theme);

    const halo = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--gn-halo').trim());
    expect(halo, 'control: --gn-halo resolves to the neo card halo, so the two reads below are the neo ones').toBe(NEO_HALO);
    const gap = await page.locator('.gn-board__cards').first().evaluate((el) => getComputedStyle(el).gap);
    expect(gap).toBe(NEO_HALO);
    const pad = await page.locator('.gn-board__column-header').first().evaluate((el) => getComputedStyle(el).paddingBottom);
    expect(pad).toBe(NEO_HALO);
    await shot(page, `board-neo-${theme}`);
  });

  test(`24.115 neo-${theme}: the switch cascade — off paints the well recess, on paints the accent with the knob-on fall (FIX 1 item 4)`, async ({ page }) => {
    await openSeededBoardPage(page);
    await applyStyle(page, 'neo', theme);

    const sw = page.locator('input.gn-switch').first();
    await expect(sw).toBeVisible();
    const read = () =>
      sw.evaluate((el) => {
        const c = getComputedStyle(el);
        return { bg: c.backgroundColor, track: c.boxShadow, knob: getComputedStyle(el, '::after').boxShadow, checked: (el as HTMLInputElement).checked };
      });
    const first = await read();
    if (first.checked) await sw.click();
    // The base `background` transition still runs, so poll the settled value.
    await expect.poll(async () => (await read()).bg, { message: 'off paints the well' }).toBe(WELL[theme]);
    const off = await read();
    expect(off.checked).toBe(false);
    expect(hasRecessBand(layers(off.track)), `off: the track is the recess; got ${off.track}`).toBe(true);
    expect(layers(off.knob).length, 'off: the knob is raised-compact, a pair').toBe(2);

    await sw.click();
    await expect.poll(async () => (await read()).bg, { message: 'on paints the accent, not the well' }).toBe(ACCENT[theme]);
    const on = await read();
    expect(on.checked).toBe(true);
    expect(on.track, 'on: the accent track carries no shadow').toBe('none');
    const knobOn = layers(on.knob);
    expect(knobOn.length, 'on: knob-on is one fall').toBe(1);
    expect(knobOn.map((l) => channels(l.colour)), 'on: no highlight on the knob fall').not.toContain(HIGHLIGHT_RGB);
    await shot(page, `switch-on-neo-${theme}`);
    if (!first.checked) await sw.click(); // leave the setting as found
  });
}

test('24.113 the primary focus ring sits 3px outside the accent edge', async ({ page }) => {
  await page.goto('/sign-in', { waitUntil: 'networkidle' });
  await applyStyle(page, 'neo', 'light');
  const focused = page.locator('.gn-button--primary:focus-visible');
  // The Tab count to the primary depends on how many controls precede it, which moves with the page: walk until it is focused.
  for (let i = 0; i < 20 && (await focused.count()) === 0; i += 1) await page.keyboard.press('Tab');
  await expect(focused).toHaveCount(1);
  expect(await focused.evaluate((el) => getComputedStyle(el).outlineOffset)).toBe('3px');
  expect(await focused.evaluate((el) => getComputedStyle(el).outlineStyle), 'control: there IS a ring to be offset').not.toBe('none');
});

for (const style of ['hig', 'minimal'] as const) {
  test(`24.114 ${style} regression: the sign-in card, field, primary and ghost render the pre-refresh shadows`, async ({ page }) => {
    await page.goto('/sign-in', { waitUntil: 'networkidle' });
    await applyStyle(page, style, 'light');
    const read = async (sel: string) => layers(await boxShadow(page.locator(sel).first()));
    const fieldBorder = await page.locator('.gn-field__input').first().evaluate((el) => getComputedStyle(el).borderStyle);
    expect(fieldBorder).toBe('solid'); // the rim stays outside neo

    // The page LOADS in neo and `applyStyle` flips it, so the buttons' and cards' `box-shadow` transitions are still running from the
    // neo value for a moment (first run: the ghost read `1.33585px` offsets, a frame of the neo pair on its way to `none`). Poll until
    // the value stops changing, then assert it. Production, which predates the refresh, measures `none` for the ghost in hig and minimal.
    const settled = async (sel: string): Promise<Layer[]> => {
      let previous = '';
      await expect
        .poll(async () => {
          const now = await boxShadow(page.locator(sel).first());
          const stable = now === previous;
          previous = now;
          return stable;
        }, { message: `${sel}: box-shadow settles after the style flip` })
        .toBe(true);
      return read(sel);
    };
    const card = await settled('.gn-card');
    const ghost = await settled('.gn-button--ghost');
    expect(ghost, `${style}: the ghost draws no depth`).toEqual([]);
    if (style === 'hig') {
      // hig `lift`: a lit inset edge plus two falls, the first being shadowFallLight1 (#273a631f).
      expect(card.length, `hig: the three lift layers; got ${JSON.stringify(card)}`).toBe(3);
      expect(card.some((l) => l.inset && l.y === 1 && l.blur === 0), 'hig: the lit edge').toBe(true);
      expect(card.some((l) => !l.inset && l.x === 0 && l.y === 1 && l.blur === 2 && channels(l.colour) === '39, 58, 99'), 'hig: the 0 1 2 fall in #273a63').toBe(true);
    } else {
      expect(card, 'minimal: the card is flat').toEqual([]);
    }
    await shot(page, `sign-in-${style}`);
  });
}
