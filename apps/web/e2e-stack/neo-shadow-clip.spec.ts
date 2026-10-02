import { writeFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { readWorkspaceId, seededProjectHref } from './helpers/board.js';
import { OWNER_EMAIL, signIn } from './helpers/sign-in.js';

/**
 * Smoothness G-2 (cases 25.320–25.339): no neo raised shadow is cut off by a container, read from the BUILT stack at :3001.
 * LOCAL — the stack is the primary checkout's `ctl rebuild`, never a worktree's.
 *
 * ## What it measures
 *
 * Owner, 2026-10-02: "many examples in both desktop and mobile, where due to containers, the lights and shadows are getting cut off
 * in the UI." A neo raised shadow reaches past its element (the halo is 14 px on a card, 23 px on a large surface). A container with
 * `overflow: hidden | auto | scroll | clip` paints nothing outside its padding box, so a raised child that sits flush against that
 * edge loses the part of its shadow that would have crossed it: a straight cut along the top and the left (the dark half falls
 * bottom-right, the light half top-left).
 *
 * For EVERY element with a non-`none` box-shadow the detector computes the PAINTED rect of the non-inset layers (the element's border
 * box grown on each side by `spread + blur ∓ offset`), walks the element's ancestors, and for each one whose computed `overflow-x`
 * or `overflow-y` is not `visible` takes the padding-box clip rect (grown by `overflow-clip-margin` when the overflow is `clip`).
 * A side is CLIPPED when the element's own edge on that side is inside the clip rect and the painted rect crosses it.
 *
 * - **Containing blocks are honoured**: an absolutely positioned element is clipped only by the ancestors from its containing block up
 *   (a `position: fixed` one by none), the way the browser paints it. `html` and `body` are never clippers: the viewport's edge is
 *   the screen, not a container.
 * - **Inset layers are skipped**: they paint inside the border box and cannot cross a container's edge.
 * - **A side whose element edge is already outside the clip rect is skipped**: that element is scrolled partly out of view, which is a
 *   scroll position, not a missing margin.
 *
 * ## Why every case has a control in the same `it()`
 *
 * The detector is only evidence if it can fail. Each run first PLANTS two fixtures into the page it is about to sweep — a flush
 * `overflow: hidden` box that must be reported, and the same box with a padded parent that must NOT — and asserts both, so a detector
 * that matched nothing (or everything) fails loudly instead of passing vacuously. Each screen must also have a non-empty shadow
 * population for the same reason.
 *
 * ## Running against a worktree
 *
 * The stack serves the primary checkout's built image, so a CSS change in a worktree is invisible to it. `NEO_CLIP_ORIGIN` points the
 * SCREENS at a lane-port `next dev` of the worktree (`SERVER_ORIGIN=http://localhost:3000 next dev -p <port>`); sign-in still happens
 * on :3001 and its host-scoped `localhost` cookie reaches the lane port (memory: browser-measurement).
 */

const THEMES = ['light', 'dark'] as const;
type Theme = (typeof THEMES)[number];

const VIEWPORTS = [
  { key: 'desktop-1440', width: 1440, height: 900 },
  { key: 'phone-390', width: 390, height: 844 },
] as const;

/** Where the screens are read; empty = the stack's own origin (`baseURL`). */
const ORIGIN = process.env['NEO_CLIP_ORIGIN'] ?? '';

/** A clip below this is sub-pixel rounding, not a cut. */
const TOLERANCE_PX = 0.5;

/**
 * Deliberate clips: each entry names the element AND the clipper, and says why the cut is the design. Printed on every run so an
 * entry cannot hide. Empty means every cut is a defect.
 */
const ALLOW: readonly { readonly element: RegExp; readonly clipper: RegExp; readonly reason: string }[] = [];

interface Layer {
  readonly x: number;
  readonly y: number;
  readonly blur: number;
  readonly spread: number;
  readonly inset: boolean;
  readonly alpha: number;
}

interface Sides {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

interface Clipper {
  readonly sel: string;
  readonly clip: Sides;
  /** Per side: the scroller has MORE content beyond that edge at this scroll position, so a cut there is the scroll, not a missing margin. */
  readonly more: { readonly left: boolean; readonly top: boolean; readonly right: boolean; readonly bottom: boolean };
}

interface Shadowed {
  readonly id: string;
  readonly sel: string;
  readonly text: string;
  readonly box: Sides;
  readonly boxShadow: string;
  readonly clippers: Clipper[];
}

interface Finding {
  readonly id: string;
  readonly element: string;
  readonly clipper: string;
  readonly text: string;
  readonly clipped: Sides;
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

/** A computed `box-shadow` as layers (Chrome: `<colour> <x> <y> <blur> <spread> [inset]`). */
function layers(value: string): Layer[] {
  if (value.trim() === 'none') return [];
  return splitTopLevel(value).map((raw) => {
    const colour = /rgba?\([^)]*\)/.exec(raw)?.[0];
    if (colour === undefined) throw new Error(`no colour in the box-shadow layer "${raw}" (whole value: ${value})`);
    const lengths = [...raw.replace(colour, '').matchAll(/-?\d+(?:\.\d+)?(?=px)/g)].map((m) => Number(m[0]));
    if (lengths.length < 2) throw new Error(`fewer than two lengths in the box-shadow layer "${raw}" (whole value: ${value})`);
    const parts = /\(([^)]*)\)/.exec(colour)![1]!.split(',');
    return {
      x: lengths[0]!,
      y: lengths[1]!,
      blur: lengths[2] ?? 0,
      spread: lengths[3] ?? 0,
      inset: /\binset\b/.test(raw),
      alpha: parts.length > 3 ? Number(parts[3]) : 1,
    };
  });
}

/** How far the painted shadow reaches past the border box on each side: `spread + blur ∓ offset`, the largest over the outer layers. */
function reachOf(boxShadow: string): Sides {
  let left = 0;
  let top = 0;
  let right = 0;
  let bottom = 0;
  for (const l of layers(boxShadow)) {
    if (l.inset || l.alpha === 0) continue;
    left = Math.max(left, l.spread + l.blur - l.x);
    right = Math.max(right, l.spread + l.blur + l.x);
    top = Math.max(top, l.spread + l.blur - l.y);
    bottom = Math.max(bottom, l.spread + l.blur + l.y);
  }
  return { left, top, right, bottom };
}

/** Everything the page knows: each shadowed element, its box, and the clip rects of the ancestors that clip it. */
async function sweep(page: Page): Promise<Shadowed[]> {
  return page.evaluate(() => {
    const describe = (el: Element): string => {
      const classes = [...el.classList].slice(0, 3).map((c) => `.${c}`).join('');
      return `${el.tagName.toLowerCase()}${classes}`;
    };
    const sides = (l: number, t: number, r: number, b: number) => ({ left: l, top: t, right: r, bottom: b });
    const out: Shadowed[] = [];
    for (const el of document.querySelectorAll('*')) {
      const cs = getComputedStyle(el);
      if (cs.boxShadow === 'none' || cs.display === 'none' || cs.visibility === 'hidden') continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const clippers: Clipper[] = [];
      // Which ancestors paint-clip this element: all of them in normal flow; from the containing block up when absolute; none when fixed.
      let needBlock = cs.position === 'absolute';
      if (cs.position !== 'fixed') {
        for (let p = el.parentElement; p !== null && p !== document.body && p !== document.documentElement; p = p.parentElement) {
          const pcs = getComputedStyle(p);
          const isBlock = pcs.position !== 'static' || pcs.transform !== 'none' || pcs.filter !== 'none';
          if (needBlock && !isBlock) continue;
          if (isBlock) needBlock = false;
          const clipsX = pcs.overflowX !== 'visible';
          const clipsY = pcs.overflowY !== 'visible';
          if ((clipsX || clipsY) && (p.clientWidth > 0 || p.clientHeight > 0)) {
            const pr = p.getBoundingClientRect();
            const l = pr.left + p.clientLeft;
            const t = pr.top + p.clientTop;
            const margin = /(-?\d+(?:\.\d+)?)px/.exec(pcs.getPropertyValue('overflow-clip-margin'));
            const mx = pcs.overflowX === 'clip' && margin !== null ? Number(margin[1]) : 0;
            const my = pcs.overflowY === 'clip' && margin !== null ? Number(margin[1]) : 0;
            const inf = Number.POSITIVE_INFINITY;
            clippers.push({
              sel: describe(p),
              more: {
                left: clipsX && p.scrollLeft > 1,
                top: clipsY && p.scrollTop > 1,
                right: clipsX && p.scrollLeft + p.clientWidth < p.scrollWidth - 1,
                bottom: clipsY && p.scrollTop + p.clientHeight < p.scrollHeight - 1,
              },
              clip: sides(
                clipsX ? l - mx : -inf,
                clipsY ? t - my : -inf,
                clipsX ? l + p.clientWidth + mx : inf,
                clipsY ? t + p.clientHeight + my : inf,
              ),
            });
          }
          if (pcs.position === 'absolute') needBlock = true;
          if (pcs.position === 'fixed') break;
        }
      }
      out.push({
        id: el.id,
        sel: describe(el),
        text: (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 40),
        box: sides(r.left, r.top, r.right, r.bottom),
        boxShadow: cs.boxShadow,
        clippers,
      });
    }
    return out;
  });
}

/** The cuts in a sweep: per element and clipper, how many px of painted shadow fall outside on each side. */
function findCuts(population: readonly Shadowed[]): Finding[] {
  const found: Finding[] = [];
  for (const item of population) {
    const reach = reachOf(item.boxShadow);
    for (const c of item.clippers) {
      // A side counts only where the element's own edge is inside the clip rect (otherwise it is scrolled out, not under-padded) and
      // the scroller has nothing more beyond that edge (a card cut by the edge of a row that continues is the scroll, not a margin).
      const left = !c.more.left && item.box.left >= c.clip.left - TOLERANCE_PX ? Math.max(0, c.clip.left - (item.box.left - reach.left)) : 0;
      const top = !c.more.top && item.box.top >= c.clip.top - TOLERANCE_PX ? Math.max(0, c.clip.top - (item.box.top - reach.top)) : 0;
      const right = !c.more.right && item.box.right <= c.clip.right + TOLERANCE_PX ? Math.max(0, item.box.right + reach.right - c.clip.right) : 0;
      const bottom = !c.more.bottom && item.box.bottom <= c.clip.bottom + TOLERANCE_PX ? Math.max(0, item.box.bottom + reach.bottom - c.clip.bottom) : 0;
      if (Math.max(left, top, right, bottom) > TOLERANCE_PX) {
        found.push({ id: item.id, element: item.sel, clipper: c.sel, text: item.text, clipped: { left, top, right, bottom } });
      }
    }
  }
  return found;
}

const fmt = (n: number): string => (n > TOLERANCE_PX ? `${Math.round(n * 10) / 10}` : '-');
const sidesText = (s: Sides): string => `L${fmt(s.left)} T${fmt(s.top)} R${fmt(s.right)} B${fmt(s.bottom)}`;

async function applyNeo(page: Page, theme: Theme): Promise<void> {
  await page.evaluate((t) => {
    document.documentElement.dataset['style'] = 'neo';
    document.documentElement.dataset['theme'] = t;
  }, theme);
  // Neo animates its shadows; read the settled value, not a frame of the transition.
  await page.waitForTimeout(350);
}

/** Two fixtures planted into the live page: the detector must flag the flush one and clear the padded one. */
async function plantControls(page: Page): Promise<void> {
  await page.evaluate(() => {
    const shadow = '4px 4px 10px 0px rgba(0, 0, 0, 0.5), -4px -4px 10px 0px rgba(255, 255, 255, 0.5)';
    const host = document.createElement('div');
    host.id = 'neo-clip-control';
    host.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;';
    host.innerHTML =
      `<div style="position:absolute;left:40px;top:40px;width:120px;height:80px;overflow:hidden">` +
      `<div id="neo-clip-flush" style="width:120px;height:80px;box-shadow:${shadow}"></div></div>` +
      `<div style="position:absolute;left:240px;top:40px;width:120px;height:80px;overflow:hidden;padding:14px">` +
      `<div id="neo-clip-padded" style="width:92px;height:52px;box-shadow:${shadow}"></div></div>`;
    document.body.append(host);
  });
}

async function unplantControls(page: Page): Promise<void> {
  await page.evaluate(() => document.getElementById('neo-clip-control')?.remove());
}

/**
 * The Groups tree is the owner's own screenshot (nodes cut along the top and left), and the seeded workspace has no groups: without
 * nodes the sweep would measure an empty tree and pass. Files one root and one child through the tree's own buttons when none exists.
 */
async function ensureGroupNodes(page: Page): Promise<void> {
  const boxes = page.locator('.gn-groups__box');
  await page.waitForTimeout(800);
  if ((await boxes.count()) === 0) {
    await page.getByRole('button', { name: 'Add group' }).click();
    await page.locator('.gn-groups__input').fill('Animal Husbandry');
    await page.locator('.gn-groups__input').press('Enter');
    await expect(boxes.first(), 'the root group was not filed').toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: 'Add a group under Animal Husbandry' }).click();
    await page.locator('.gn-groups__input').fill('Dairy');
    await page.locator('.gn-groups__input').press('Enter');
    await expect(boxes.nth(1), 'the child group was not filed').toBeVisible({ timeout: 15_000 });
  }
  expect(await boxes.count(), 'control: the tree carries group nodes, so the sweep is not of an empty tree').toBeGreaterThan(0);
}

/** Scrolls every scrollable box to its far end (`end`) or back to its start, so the leading and the trailing edge are each measured. */
async function scrollAll(page: Page, where: 'start' | 'end'): Promise<void> {
  await page.evaluate((w) => {
    for (const el of document.querySelectorAll('*')) {
      const cs = getComputedStyle(el);
      const scrolls = (v: string): boolean => v === 'auto' || v === 'scroll';
      if (!scrolls(cs.overflowX) && !scrolls(cs.overflowY)) continue;
      el.scrollTo(w === 'end' ? el.scrollWidth : 0, w === 'end' ? el.scrollHeight : 0);
    }
  }, where);
  await page.waitForTimeout(150);
}

/** The cuts on a screen at BOTH scroll extremes: the start measures the leading padding, the end the trailing padding. */
async function sweepScreen(page: Page, theme: Theme): Promise<{ population: Shadowed[]; cuts: Finding[] }> {
  await applyNeo(page, theme);
  await scrollAll(page, 'start');
  const population = await sweep(page);
  const cuts = findCuts(population);
  await scrollAll(page, 'end');
  cuts.push(...findCuts(await sweep(page)));
  await scrollAll(page, 'start');
  return { population, cuts };
}

for (const viewport of VIEWPORTS) {
  for (const theme of THEMES) {
    test(`25.320 ${viewport.key} neo-${theme}: no raised shadow is cut off by a container on any screen`, async ({ page }) => {
      test.setTimeout(300_000);
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await signIn(page, OWNER_EMAIL);
      await page.goto('/workspaces');
      const workspaceId = await readWorkspaceId(page);
      const boardPath = await seededProjectHref(page, workspaceId);

      const visit = async (path: string): Promise<void> => {
        await page.goto(`${ORIGIN}${path}`, { waitUntil: 'networkidle' });
      };
      const openView = async (label: string): Promise<void> => {
        const tab = page.getByRole('tab', { name: label, exact: true });
        await tab.click();
        await expect(tab, `the "${label}" view tab did not select`).toHaveAttribute('aria-selected', 'true');
        await page.waitForLoadState('networkidle');
      };

      interface Screen {
        readonly name: string;
        readonly reach: () => Promise<void>;
      }
      const screens: Screen[] = [
        { name: 'workspace home', reach: () => visit(`/w/${workspaceId}`) },
        {
          name: 'board',
          reach: async () => {
            await visit(boardPath);
            await openView('Board');
          },
        },
        {
          name: 'list',
          reach: async () => {
            await visit(boardPath);
            await openView('List');
          },
        },
        {
          name: 'settings groups',
          reach: async () => {
            await visit(`/settings?workspaceId=${workspaceId}&tab=groups`);
            await ensureGroupNodes(page);
          },
        },
        { name: 'settings general', reach: () => visit(`/settings?workspaceId=${workspaceId}&tab=workspace`) },
        { name: 'notes list', reach: () => visit('/notes') },
        {
          name: 'note',
          reach: async () => {
            await visit('/notes');
            const link = page.locator('a[href^="/notes/"]').first();
            await expect(link, 'no note exists on /notes to open').toBeVisible({ timeout: 15_000 });
            const href = await link.getAttribute('href');
            await visit(href!);
          },
        },
        {
          name: 'ticket sheet',
          reach: async () => {
            await visit(boardPath);
            await openView('Board');
            // A click before hydration does nothing (measured on a cold `next dev`); retry until the sheet is up.
            await expect(async () => {
              await page.locator('.gn-board-card__title').first().click();
              await expect(page.getByRole('dialog').first(), 'clicking a board card did not open the ticket sheet').toBeVisible({ timeout: 3000 });
            }).toPass({ timeout: 30_000 });
            await page.waitForTimeout(600);
          },
        },
        { name: 'my work', reach: () => visit(`/w/${workspaceId}/my-work`) },
      ];

      console.log(`[neo-shadow-clip] allow-list (${ALLOW.length}): ${ALLOW.map((a) => `${a.element}|${a.clipper}: ${a.reason}`).join(' ; ') || 'none'}`);

      const offenders: string[] = [];
      let controlsChecked = false;
      for (const screen of screens) {
        await screen.reach();
        if (!controlsChecked) {
          // The detector must be able to fail: plant a flush fixture and a padded twin, and read both back.
          await plantControls(page);
          await applyNeo(page, theme);
          const planted = findCuts(await sweep(page));
          const flush = planted.find((f) => f.id === 'neo-clip-flush');
          expect(flush, 'control: the flush fixture is reported as cut').toBeDefined();
          expect(flush!.clipped.left > 0 && flush!.clipped.top > 0, 'control: the flush fixture is cut on its top and left').toBe(true);
          expect(
            planted.some((f) => f.id === 'neo-clip-padded'),
            'control: the padded twin (14px of room) is not reported',
          ).toBe(false);
          await unplantControls(page);
          controlsChecked = true;
        }
        const { population, cuts } = await sweepScreen(page, theme);
        expect(population.length, `${screen.name}: no element with a box-shadow was found, so the sweep measured nothing`).toBeGreaterThan(0);
        const allowed = (f: Finding): boolean => ALLOW.some((a) => a.element.test(f.element) && a.clipper.test(f.clipper));
        const seen = new Set<string>();
        const real = cuts.filter((f) => !allowed(f)).filter((f) => {
          const key = `${f.element}|${f.clipper}|${f.text}|${sidesText(f.clipped)}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        console.log(`[neo-shadow-clip] ${viewport.key} neo-${theme} ${screen.name}: ${population.length} shadowed, ${real.length} cut`);
        for (const f of real) {
          offenders.push(`${f.element} "${f.text}" in ${f.clipper} | ${screen.name} | ${viewport.key} | neo-${theme} | clipped px ${sidesText(f.clipped)}`);
        }
        await page.waitForTimeout(400);
      }

      // De-duplicate the identical lines a list of 40 cards produces, keeping the count.
      const counted = new Map<string, number>();
      for (const line of offenders) counted.set(line, (counted.get(line) ?? 0) + 1);
      const report = [...counted].map(([line, n]) => `${n > 1 ? `x${n} ` : ''}${line}`);
      const dir = process.env['NEO_CLIP_REPORT_DIR'];
      if (dir !== undefined) writeFileSync(`${dir}/${viewport.key}-${theme}.txt`, `${report.join('\n')}\n`);
      expect(report, `shadows cut off by a container:\n${report.join('\n')}`).toEqual([]);
    });
  }
}
