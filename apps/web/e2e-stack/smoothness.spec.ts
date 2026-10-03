import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { openSeededBoard, readWorkspaceId, seededProjectHref } from './helpers/board.js';
import { OWNER_EMAIL, signIn } from './helpers/sign-in.js';

/**
 * Smoothness T14 (cases 25.231, 25.232; spec §6, §7): the CLS / request-count ratchet, read from the deployed stack.
 *
 * ## What 25.231 measures, per `${viewport}|${route}`
 *
 *   - **a skeleton first**: an `[aria-busy="true"]` region existed at some point between the document starting and the
 *     route settling (a MutationObserver installed before the first script, so a 40 ms skeleton is seen as surely as a 4 s one),
 *     and none is left when the route settles;
 *   - **CLS** (`layout-shift` entries without recent input) over the whole load, and `swapShiftCls`, the part of it inside the
 *     window that opens 100 ms before the LAST busy region clears: the skeleton-to-content swap itself (spec S1, "no layout
 *     shift from a swap");
 *   - **requests**: every `/v1/` request from the navigation until the settle, and the DUPLICATES among them (the same path and
 *     query asked twice; the baseline audit counted `/v1/me/workspaces` eight times on one board load). The count of duplicates is a
 *     ratcheted number too: at the tip of release/smoothness the board still asks its roster, members and workflow reads a second time
 *     in a later wave, so "no duplicate" cannot be an absolute bar yet; it can only never get worse;
 *   - **LCP** against the spec §6 desktop/tablet/phone budget (unthrottled here, so a generous bar, not the throttled one).
 *
 * Each route is loaded SAMPLES times, cold (3 to check, 5 to record). A run is judged on the MEDIAN of each number (one load's CLS can jump with where a
 * second wave lands, and a ratchet that fails on one outlier is noise); a recording stores the WORST of its (more) samples, so a later median
 * can exceed the stored number only if the route got worse. The raw samples are printed per key.
 *
 * The ratchet is `smoothness-baseline.json`, keyed `${viewport}|${route with ids as <id>}`, with `{ cls, requests, duplicates,
 * swapShiftCls }`. A run compares each median to its key and fails when CLS exceeds `max(baseline, 0.01)`, when the request count or the
 * duplicate count exceeds the baseline, or when the swap shift exceeds `max(baseline, 0.01)`. A key with no row is recorded, never failed. `SMOOTHNESS_RECORD=1`
 * rewrites the file from this run (the way `tap-target-baseline.json` is recorded): the diff is the ratchet moving, and a reviewer
 * reads it in that direction.
 *
 * ONE signed-in session, ONE paced process (1.5 s between page loads), a 429 on any response ends the run red: a rate limit is a
 * failure to read, never something to retry in a loop. READ-ONLY, except 25.232, which renames one ticket and puts the title back.
 *
 * Run: `cd apps/web && pnpm exec playwright test -c playwright.stack.config.ts e2e-stack/smoothness.spec.ts`
 * (`SMOOTHNESS_RECORD=1` in front to record). The stack must be the one built from the tip under test.
 */

const BASELINE = fileURLToPath(new URL('./smoothness-baseline.json', import.meta.url));
const RECORD = process.env['SMOOTHNESS_RECORD'] === '1';
const PACE_MS = 1500;
const SWAP_BUDGET = 0.01;

interface Row {
  cls: number;
  requests: number;
  duplicates: number;
  swapShiftCls: number;
}

// A recording takes more loads than a check: several numbers on this stack are two-valued from load to load (a route's CLS is 0 in one
// load and 0.6 in the next, depending on which side of a second wave a swap lands), and the stored ceiling must contain both values.
const SAMPLES = Number(process.env['SMOOTHNESS_SAMPLES'] ?? (RECORD ? '5' : '3'));
const median = (xs: number[]): number => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0;
const worst = (xs: number[]): number => Math.max(...xs);

const VIEWPORTS = [
  { key: '390', width: 390, height: 844, lcpMs: 2500 },
  { key: '768', width: 768, height: 1024, lcpMs: 2000 },
  { key: '1440', width: 1440, height: 900, lcpMs: 1500 },
] as const;

/** Installed before any page script: the busy timeline and the layout-shift / LCP entries from the document's first frame. */
function installProbe(): void {
  const w = window as unknown as {
    __gn: { busySeen: boolean; busyClearedAt: number; shifts: { t: number; v: number; src: string[] }[]; lcp: number };
  };
  w.__gn = { busySeen: false, busyClearedAt: 0, shifts: [], lcp: 0 };
  const probe = w.__gn;
  const tick = (): void => {
    const busy = document.querySelector('[aria-busy="true"]') !== null;
    if (busy) {
      probe.busySeen = true;
      probe.busyClearedAt = 0;
    } else if (probe.busySeen && probe.busyClearedAt === 0) {
      probe.busyClearedAt = performance.now();
    }
  };
  new MutationObserver(tick).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['aria-busy'] });
  document.addEventListener('DOMContentLoaded', tick);
  new PerformanceObserver((list) => {
    for (const e of list.getEntries() as (PerformanceEntry & { hadRecentInput?: boolean; value?: number })[]) {
      if (e.hadRecentInput) continue;
      const sources = ((e as unknown as { sources?: { node?: Element | null }[] }).sources ?? []).map((x) => {
        const n = x.node;
        return n instanceof Element ? `${n.tagName.toLowerCase()}${n.className && typeof n.className === 'string' ? `.${n.className.trim().split(/\s+/).slice(0, 2).join('.')}` : ''}` : '?';
      });
      probe.shifts.push({ t: e.startTime, v: e.value ?? 0, src: sources.slice(0, 3) });
    }
  }).observe({ type: 'layout-shift', buffered: true });
  new PerformanceObserver((list) => {
    const last = list.getEntries().at(-1);
    if (last !== undefined) probe.lcp = last.startTime;
  }).observe({ type: 'largest-contentful-paint', buffered: true });
}

interface Vitals {
  busySeen: boolean;
  busyLeft: number;
  cls: number;
  swapShiftCls: number;
  lcp: number;
  worst: string;
}

async function settleAndRead(page: Page): Promise<Vitals> {
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 15_000 });
  await page.waitForTimeout(1500); // a late shift (a second wave landing) still counts
  return page.evaluate(() => {
    const probe = (window as unknown as { __gn: { busySeen: boolean; busyClearedAt: number; shifts: { t: number; v: number; src: string[] }[]; lcp: number } }).__gn;
    const top = [...probe.shifts].sort((a, b) => b.v - a.v).slice(0, 2).map((x) => `${x.v.toFixed(3)}@${Math.round(x.t)}ms ${x.src.join('+')}`).join(' | ');
    const cls = probe.shifts.reduce((n, s) => n + s.v, 0);
    const from = probe.busyClearedAt - 100;
    const swap = probe.busyClearedAt === 0 ? 0 : probe.shifts.filter((s) => s.t >= from && s.t <= from + 600).reduce((n, s) => n + s.v, 0);
    return {
      busySeen: probe.busySeen,
      busyLeft: document.querySelectorAll('[aria-busy="true"]').length,
      cls: Math.round(cls * 10000) / 10000,
      swapShiftCls: Math.round(swap * 10000) / 10000,
      lcp: Math.round(probe.lcp),
      worst: top,
    };
  });
}

function readBaseline(): Record<string, Row> {
  return JSON.parse(readFileSync(BASELINE, 'utf8')) as Record<string, Row>;
}

test.describe('smoothness ratchet (spec §6, §7; cases 25.231-25.232)', () => {
  test('25.231 every route paints a skeleton first, swaps it with no layout shift above 0.01, and asks no duplicate URL', async ({ page }) => {
    test.setTimeout(60_000 + 27 * SAMPLES * 9_000);
    const baseline = readBaseline();
    const next: Record<string, Row> = { ...baseline };
    const requests: string[] = [];
    const limited: string[] = [];
    page.on('request', (r) => {
      const u = new URL(r.url());
      if (u.pathname.startsWith('/v1/')) requests.push(u.pathname + u.search);
    });
    page.on('response', (r) => {
      if (r.status() === 429) limited.push(r.url());
    });
    await page.addInitScript(installProbe);
    await signIn(page, OWNER_EMAIL);
    await page.goto('/workspaces', { waitUntil: 'networkidle' });
    const ws = await readWorkspaceId(page);
    const board = await seededProjectHref(page, ws);
    const routes = ['/workspaces', `/w/${ws}`, board, `/w/${ws}/my-work`, `/w/${ws}/members`, '/inbox', '/notes', '/account', '/settings'];

    for (const vp of VIEWPORTS) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      for (const route of routes) {
        const key = `${vp.key}|${route.replace(/[0-9A-Z]{26}/g, '<id>')}`;
        const samples: { v: Vitals; requests: string[]; dupes: string[] }[] = [];
        for (let i = 0; i < SAMPLES; i += 1) {
          await page.waitForTimeout(PACE_MS);
          requests.length = 0;
          await page.goto(route, { waitUntil: 'load' });
          // The instrument asserts itself first: a resize that reported success and measured the default width is a desktop number
          // with a phone's label (this repo's recorded failure, viewport.spec.ts).
          expect(await page.evaluate(() => window.innerWidth), `${vp.key} ${route}: the viewport did not apply`).toBe(vp.width);
          const v = await settleAndRead(page);
          expect(limited, `a 429 on ${route} (${vp.key}): STOP, back off, never retry in a loop`).toEqual([]);
          samples.push({ v, requests: [...requests], dupes: requests.filter((u, j) => requests.indexOf(u) !== j) });
        }
        const pick = (f: (xs: number[]) => number): Row => ({
          cls: f(samples.map((x) => x.v.cls)),
          requests: f(samples.map((x) => x.requests.length)),
          duplicates: f(samples.map((x) => x.dupes.length)),
          swapShiftCls: f(samples.map((x) => x.v.swapShiftCls)),
        });
        const row = pick(median); // what a run is judged on
        const ceiling = pick(worst); // what a recording stores: the worst of its samples, so a median can only exceed it if the route got worse
        const lcp = median(samples.map((x) => x.v.lcp));
        const prior = baseline[key];
        console.log(`[smoothness] ${key} cls=${JSON.stringify(samples.map((x) => x.v.cls))} swap=${JSON.stringify(samples.map((x) => x.v.swapShiftCls))} req=${JSON.stringify(samples.map((x) => x.requests.length))} dup=${JSON.stringify(samples.map((x) => x.dupes.length))} lcp=${JSON.stringify(samples.map((x) => x.v.lcp))} worst=${samples[0]?.v.worst ?? ''}`);

        expect.soft(samples.every((x) => x.v.busySeen), `${key}: no [aria-busy] region was painted in some load (a route with no placeholder)`).toBe(true);
        expect.soft(samples.every((x) => x.v.busyLeft === 0), `${key}: a busy region is left after the settle`).toBe(true);
        expect.soft(lcp, `${key} LCP`).toBeLessThan(vp.lcpMs);
        if (prior !== undefined && !RECORD) {
          const last = samples.at(-1);
          expect.soft(row.cls, `${key} CLS (baseline ${prior.cls}); worst shifts ${samples[0]?.v.worst ?? ''}`).toBeLessThanOrEqual(Math.max(prior.cls, SWAP_BUDGET));
          expect.soft(row.requests, `${key} requests (baseline ${prior.requests}): ${JSON.stringify(last?.requests)}`).toBeLessThanOrEqual(prior.requests);
          expect.soft(row.duplicates, `${key} duplicate reads (baseline ${prior.duplicates}): ${JSON.stringify(last?.dupes)}`).toBeLessThanOrEqual(prior.duplicates);
          expect.soft(row.swapShiftCls, `${key} skeleton-swap shift (baseline ${prior.swapShiftCls})`).toBeLessThanOrEqual(Math.max(prior.swapShiftCls, SWAP_BUDGET));
        }
        if (prior === undefined || RECORD) next[key] = ceiling;
      }
    }
    if (RECORD) writeFileSync(BASELINE, JSON.stringify(Object.fromEntries(Object.entries(next).sort(([a], [b]) => a.localeCompare(b))), null, 2) + '\n');
  });

  test('25.232 a title edit on the sheet shows at once and no frame ever paints the old title back', async ({ page }) => {
    test.setTimeout(120_000);
    await signIn(page, OWNER_EMAIL);
    await page.setViewportSize({ width: 1440, height: 900 });
    const { workspaceId, projectId } = await openSeededBoard(page);
    await expect(page.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 15_000 });
    await page.locator('.gn-board-card__title').first().click();
    const title = page.getByRole('textbox', { name: 'Ticket title' });
    await expect(title).toBeVisible({ timeout: 15_000 });
    const original = await title.inputValue();
    const renamed = `${original.replace(/ \(25\.232\)$/, '')} (25.232)`;
    try {
      await title.fill(renamed);
      // Every animation frame from here to a second after the Enter records the field's value and whether it is disabled.
      await page.evaluate(() => {
        const frames: { v: string; d: boolean }[] = [];
        (window as unknown as { __frames: typeof frames }).__frames = frames;
        const el = document.querySelector<HTMLTextAreaElement>('textarea[aria-label="Ticket title"]');
        const loop = (): void => {
          if (el !== null) frames.push({ v: el.value, d: el.disabled });
          requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
      });
      await title.press('Enter');
      await page.waitForTimeout(1500);
      const frames = await page.evaluate(() => (window as unknown as { __frames: { v: string; d: boolean }[] }).__frames);
      // Control: the recorder really ran for the whole second (a loop that never started would pass the assertions below).
      expect(frames.length, 'the frame recorder produced no frames').toBeGreaterThan(30);
      const wrong = frames.filter((f) => f.v !== renamed);
      expect(wrong.length, `${wrong.length} of ${frames.length} frames painted a title other than the edit; first: ${JSON.stringify(wrong[0])}`).toBe(0);
      // The write reached the server: a reload reads the new title back.
      await page.goto(`/w/${workspaceId}/p/${projectId}`, { waitUntil: 'networkidle' });
      await page.locator('.gn-board__card-slot', { hasText: renamed }).first().waitFor({ timeout: 15_000 });
    } finally {
      // Put the seeded title back (this spec's one write), whatever happened above.
      await page.goto(`/w/${workspaceId}/p/${projectId}`, { waitUntil: 'networkidle' });
      const card = page.locator('.gn-board__card-slot', { hasText: renamed }).first();
      if ((await card.count()) > 0) {
        await card.locator('.gn-board-card__title').click();
        const field = page.getByRole('textbox', { name: 'Ticket title' });
        await field.fill(original);
        await field.press('Enter');
        await page.waitForTimeout(800);
      }
    }
  });
});
