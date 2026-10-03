import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { parseBaseline, ratchetFailures, recordRow, sameFixture, serialiseBaseline, SWAP_BUDGET, type Baseline, type Fixture, type Row } from './helpers/smoothness-baseline.js';
import { openSeededBoard, readWorkspaceId, seededProjectHref } from './helpers/board.js';
import { OWNER_EMAIL, signIn } from './helpers/sign-in.js';

/**
 * Smoothness T14 (cases 25.231, 25.232, 25.235, 25.236, 25.237; spec §6, §7; 25.253 is smoothness-2 G1's forced-order cell): the CLS / request-count ratchet, read from the deployed stack.
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
 * Each route is loaded SAMPLES times, cold (3 to check, 5 to record). A run is judged on the BEST load of each number (several numbers on this stack are two-valued or
 * drift a few percent from load to load: My work 390 is CLS 0 in one load and 0.635 in the next, and a ratchet judged on a median failed its own
 * unmutated control on a different key in each of three runs), so a regression has to hold in EVERY load to fail; the price is that a
 * regression which shows in only some loads is not seen. A recording stores the WORST of its (more) samples, so the best load of a later
 * run can exceed the stored number only if the route got worse. LCP is still the median. The raw samples are printed per key.
 *
 * The ratchet is `smoothness-baseline.json`, keyed `${viewport}|${route with ids as <id>}`, with `{ cls, requests, duplicates,
 * swapShiftCls }`, plus a `_fixture` row. A run compares each best load to its key and fails when CLS exceeds `max(baseline, 0.01)`, when the
 * request count or the duplicate count exceeds the baseline, or when the swap shift exceeds `max(baseline, 0.01)`.
 *
 * - **A key with no row FAILS** (25.235; the precedent is `viewport.spec.ts`: a missing baseline fails rather than seeding itself).
 *   Without this a deleted row, or a route whose key stopped matching the `<id>` pattern, asserts nothing and the run is green.
 * - **Like with like (`_fixture`).** The rows were measured on a data set (`{ notes, deletedNotes, tickets, workflows, members }`,
 *   counted through `/v1` with the signed-in session), and a page's CLS depends on the rows it renders. When the run's fixture is not
 *   the json's, the four per-key comparisons are NOT made: the test annotates (`smoothness-fixture-mismatch`, both fixtures, and the
 *   instruction to re-record) and the data-independent asserts still run (busy seen, busy left, LCP, 429, viewport width, a key with
 *   no row). A json with no `_fixture` fails. NOTE for CI: the release gate runs this spec on a fresh, seed-only stack, so its fixture
 *   differs from the dev stack's the ratchet was recorded on; it annotates there, it does not ratchet. A baseline recorded on the seed
 *   would ratchet there.
 * - **A recording only lowers (25.236).** `SMOOTHNESS_RECORD=1` stores, per field, `min(stored, this run's worst of five)` and takes the run
 *   for keys with no row; it refuses a stack whose fixture differs from the stored one. `SMOOTHNESS_RECORD=raise` overwrites every row and
 *   the fixture: the explicit act for new data or for accepting a worse number, whose diff a reviewer reads in that direction. (This
 *   is stricter than `tap-target-baseline.json`, which also never overwrites but has no data to drift.) Flake, measured: a key with two values
 *   (My work 390: CLS 0 or 0.635, about half the loads each) is stored as 0 by a five-sample recording that lands all low (0.5^5 = 3% a key;
 *   it happened to the second recording on 2026-10-03), and the best of three loads then reads 0.635 only when all three are high (about 12%).
 *   A recording from two runs (the per-field worst of both, a `raise` by hand) cuts the first number; `raise` or a deleted row repairs a row.
 *
 * ONE paced process (1.5 s between page loads). A run makes TWO UI sign-ins (one per test) and `global-setup.ts` sends two magic links of its
 * own; `helpers/sign-in.ts` does not pace them. A 429 on any response seen by a test's page ends that test red (both tests listen; the
 * `/v1` fixture reads are checked too): a rate limit is a failure to read, never something to retry in a loop. READ-ONLY, except
 * 25.232, which renames one ticket and puts the title back.
 *
 * Run: `cd apps/web && pnpm exec playwright test -c playwright.stack.config.ts e2e-stack/smoothness.spec.ts`
 * (`SMOOTHNESS_RECORD=1` in front to record). The stack must be the one built from the tip under test.
 */

const BASELINE = fileURLToPath(new URL('./smoothness-baseline.json', import.meta.url));
// '1' lowers and adds rows only; 'raise' is the explicit act that may overwrite a row (and the only way to re-baseline on new data).
const RAISE = process.env['SMOOTHNESS_RECORD'] === 'raise';
const RECORD = process.env['SMOOTHNESS_RECORD'] === '1' || RAISE;
const PACE_MS = 1500;

// A recording takes more loads than a check: several numbers on this stack are two-valued from load to load (a route's CLS is 0 in one
// load and 0.6 in the next, depending on which side of a second wave a swap lands), and the stored ceiling must contain both values.
const SAMPLES = Number(process.env['SMOOTHNESS_SAMPLES'] ?? (RECORD ? '5' : '3'));
const median = (xs: number[]): number => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0;
const worst = (xs: number[]): number => Math.max(...xs);
const best = (xs: number[]): number => Math.min(...xs);

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

function readBaseline(): Baseline {
  return parseBaseline(readFileSync(BASELINE, 'utf8'));
}

/** What the signed-in session can count on this stack right now, read through `/v1` (not through a page, so the request log is untouched). */
async function readFixture(page: Page, ws: string): Promise<Fixture> {
  const count = async (path: string, field: string): Promise<number> => {
    const res = await page.request.get(path);
    expect(res.status(), `${path}: a 429 is STOP, never a retry loop`).not.toBe(429);
    expect(res.ok(), `${path} answered ${res.status()}`).toBe(true);
    const list = ((await res.json()) as Record<string, unknown>)[field];
    expect(Array.isArray(list), `${path} has no "${field}" array`).toBe(true);
    return (list as unknown[]).length;
  };
  const base = `/v1/workspaces/${ws}`;
  return {
    notes: await count(`${base}/notes`, 'notes'),
    deletedNotes: await count(`${base}/notes?deleted=1`, 'notes'),
    tickets: await count(`${base}/tickets`, 'tickets'),
    workflows: await count(`${base}/workflows`, 'workflows'),
    members: await count(`${base}/members`, 'members'),
  };
}

test.describe('smoothness ratchet (spec §6, §7; cases 25.231-25.232, 25.235-25.237)', () => {
  test('25.231 every route paints a skeleton first and holds its CLS, skeleton-swap shift, /v1 requests and duplicate URLs at or under the recorded baseline', async ({ page }) => {
    test.setTimeout(60_000 + 27 * SAMPLES * 9_000);
    const baseline = readBaseline();
    const next: Baseline = { fixture: baseline.fixture, rows: { ...baseline.rows } };
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
    const fixture = await readFixture(page, ws);
    console.log(`[smoothness] fixture ${JSON.stringify(fixture)}; baseline fixture ${JSON.stringify(baseline.fixture)}`);
    // A baseline with no fingerprint cannot say what data it was measured on: that FAILS (a recording writes one).
    if (!RECORD) expect(baseline.fixture, 'smoothness-baseline.json has no _fixture: re-record on this data with SMOOTHNESS_RECORD=raise and commit').toBeDefined();
    const sameData = sameFixture(baseline.fixture, fixture);
    // SMOOTHNESS_RECORD=1 compares nothing and only lowers, which is meaningless across data: re-baselining on new data is `raise`.
    if (RECORD && !RAISE) expect(sameData, `the stored _fixture ${JSON.stringify(baseline.fixture)} is not this stack's ${JSON.stringify(fixture)}: the rows belong to other data, re-baseline with SMOOTHNESS_RECORD=raise`).toBe(true);
    if (RAISE) next.fixture = fixture;
    if (!RECORD && !sameData) {
      test.info().annotations.push({
        type: 'smoothness-fixture-mismatch',
        description: `The baseline was recorded on ${JSON.stringify(baseline.fixture)}; this stack holds ${JSON.stringify(fixture)}. The per-key ratchet comparisons (CLS, requests, duplicates, swap shift) were NOT made. Re-record on this data: SMOOTHNESS_RECORD=raise (see .env.example) and commit smoothness-baseline.json.`,
      });
      console.log('[smoothness] FIXTURE MISMATCH: per-key comparisons skipped; re-record with SMOOTHNESS_RECORD=raise');
    }
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
        const row = pick(best); // what a run is judged on: the BEST load, so a regression must hold in every load
        const ceiling = pick(worst); // what a recording stores: the worst of its samples, so the best load of a later run can only exceed it if the route got worse
        const lcp = median(samples.map((x) => x.v.lcp));
        const prior = baseline.rows[key];
        console.log(`[smoothness] ${key} cls=${JSON.stringify(samples.map((x) => x.v.cls))} swap=${JSON.stringify(samples.map((x) => x.v.swapShiftCls))} req=${JSON.stringify(samples.map((x) => x.requests.length))} dup=${JSON.stringify(samples.map((x) => x.dupes.length))} lcp=${JSON.stringify(samples.map((x) => x.v.lcp))} worst=${samples[0]?.v.worst ?? ''}`);

        expect.soft(samples.every((x) => x.v.busySeen), `${key}: no [aria-busy] region was painted in some load (a route with no placeholder)`).toBe(true);
        expect.soft(samples.every((x) => x.v.busyLeft === 0), `${key}: a busy region is left after the settle`).toBe(true);
        expect.soft(lcp, `${key} LCP`).toBeLessThan(vp.lcpMs);
        if (!RECORD) {
          const last = samples.at(-1);
          const ctx = { worstShifts: samples[0]?.v.worst ?? '', lastRequests: JSON.stringify(last?.requests), lastDupes: JSON.stringify(last?.dupes) };
          expect.soft(ratchetFailures(key, prior, row, ctx, sameData), key).toEqual([]);
        }
        if (RECORD) next.rows[key] = recordRow(prior, ceiling, RAISE);
      }
    }
    if (RECORD) writeFileSync(BASELINE, serialiseBaseline(next));
  });

  test('25.232 a title edit on the sheet shows at once and no frame ever paints the old title back', async ({ page }) => {
    test.setTimeout(120_000);
    const limited: string[] = [];
    page.on('response', (r) => {
      if (r.status() === 429) limited.push(r.url());
    });
    await signIn(page, OWNER_EMAIL);
    await page.setViewportSize({ width: 1440, height: 900 });
    const { workspaceId, projectId } = await openSeededBoard(page);
    await expect(page.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 15_000 });
    await page.locator('.gn-board-card__title').first().click();
    const title = page.getByRole('textbox', { name: 'Ticket title' });
    await expect(title).toBeVisible({ timeout: 15_000 });
    const original = await title.inputValue();
    const renamed = `${original.replace(/ \(25\.232\)$/, '')} (25.232)`;
    // Control: the edit changes the title. A card that already ends " (25.232)" (an earlier run whose `finally` did not finish) would make
    // `fill` a no-op and every frame equal `renamed`: green with no edit.
    expect(renamed, 'the rename must change the title: the first card already carries the suffix, restore it by hand').not.toBe(original);
    try {
      await title.fill(renamed);
      // Every animation frame from here to a second after the Enter records the field's value and whether it is disabled.
      await page.evaluate(() => {
        const frames: { v: string; d: boolean }[] = [];
        (window as unknown as { __frames: typeof frames }).__frames = frames;
        const loop = (): void => {
          // Re-queried every frame: a remounted field must be read, not a detached node that keeps its last value.
          const el = document.querySelector<HTMLTextAreaElement>('textarea[aria-label="Ticket title"]');
          frames.push(el === null ? { v: '<no title field>', d: false } : { v: el.value, d: el.disabled });
          requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
      });
      await title.press('Enter');
      await page.waitForTimeout(1500);
      const frames = await page.evaluate(() => (window as unknown as { __frames: { v: string; d: boolean }[] }).__frames);
      // Control: the recorder really ran for the whole second (a loop that never started would pass the assertions below).
      expect(frames.length, 'the frame recorder produced no frames').toBeGreaterThan(30);
      expect(limited, 'a 429 during the edit: STOP, back off, never retry in a loop').toEqual([]);
      const wrong = frames.filter((f) => f.v !== renamed);
      expect(wrong.length, `${wrong.length} of ${frames.length} frames painted a title other than the edit; first: ${JSON.stringify(wrong[0])}`).toBe(0);
      // The write reached the server: a reload reads the new title back.
      await page.goto(`/w/${workspaceId}/p/${projectId}`, { waitUntil: 'networkidle' });
      await page.locator('.gn-board__card-slot', { hasText: renamed }).first().waitFor({ timeout: 15_000 });
      expect(limited, 'a 429 after the reload: STOP, back off, never retry in a loop').toEqual([]);
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

  test('25.253 My work at 390 with each of its two reads FORCED to answer last: no layout shift beyond 0.02 in either order (the ratchet judges the best of three loads, which hides a coin flip)', async ({ page }) => {
    test.setTimeout(120_000);
    const limited: string[] = [];
    page.on('response', (r) => {
      if (r.status() === 429) limited.push(r.url());
    });
    await page.addInitScript(installProbe);
    await signIn(page, OWNER_EMAIL);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/workspaces', { waitUntil: 'networkidle' });
    const ws = await readWorkspaceId(page);
    const DELAY_MS = 500;
    const strip = (path: string): boolean => /\/v1\/workspaces\/[^/]+\/(attention|contests)$/.test(path);
    const body = (path: string): boolean => /\/v1\/me\/work$/.test(path);
    const shifts: Record<string, number[]> = {};
    for (const slow of ['strip', 'body'] as const) {
      const late = slow === 'strip' ? strip : body;
      await page.route(
        (url) => strip(url.pathname) || body(url.pathname),
        async (route) => {
          if (late(new URL(route.request().url()).pathname)) await new Promise((done) => setTimeout(done, DELAY_MS));
          await route.continue();
        },
      );
      shifts[slow] = [];
      for (let i = 0; i < 3; i += 1) {
        await page.waitForTimeout(PACE_MS);
        await page.goto(`/w/${ws}/my-work`, { waitUntil: 'load' });
        expect(await page.evaluate(() => window.innerWidth), 'the viewport did not apply').toBe(390);
        const v = await settleAndRead(page);
        // The instrument asserts itself: the read meant to be last really ended last, by most of the delay.
        const ends = await page.evaluate(() => {
          const end = (re: RegExp): number => Math.max(0, ...performance.getEntriesByType('resource').filter((e) => re.test(new URL(e.name).pathname)).map((e) => e.responseEnd));
          return { strip: end(/\/v1\/workspaces\/[^/]+\/attention$/), body: end(/\/v1\/me\/work$/) };
        });
        const gap = slow === 'strip' ? ends.strip - ends.body : ends.body - ends.strip;
        expect(gap, `forced order ${slow} last: the two reads ended ${JSON.stringify(ends)}`).toBeGreaterThan(DELAY_MS * 0.6);
        shifts[slow]!.push(v.cls);
        console.log(`[smoothness] 390|my-work, ${slow} read last: cls=${v.cls} (strip ends ${Math.round(ends.strip)} ms, body ends ${Math.round(ends.body)} ms) ${v.worst}`);
      }
      await page.unrouteAll({ behavior: 'ignoreErrors' });
    }
    expect(limited, 'a 429: STOP, back off, never retry in a loop').toEqual([]);
    // The MAX over both orders, not the best: a swap that shifts in one order and not the other is the defect.
    expect(Math.max(...Object.values(shifts).flat()), JSON.stringify(shifts)).toBeLessThanOrEqual(0.02);
  });

  test('25.235 a key with no baseline row fails, and the other keys are compared as usual', () => {
    const row: Row = { cls: 0.2, requests: 10, duplicates: 2, swapShiftCls: 0.2 };
    const ctx = { worstShifts: '', lastRequests: '[]', lastDupes: '[]' };
    const rows: Record<string, Row> = { '390|/a': { ...row }, '390|/b': { ...row } };
    delete rows['390|/b'];
    const missing = ratchetFailures('390|/b', rows['390|/b'], row, ctx, true);
    expect(missing.length, 'the deleted row must fail the run').toBe(1);
    expect(missing[0], 'and name the key').toContain('390|/b');
    // The same on a run whose data is not the baseline's: the key set is not data.
    expect(ratchetFailures('390|/b', rows['390|/b'], row, ctx, false).length).toBe(1);
    // Control: the key that still has its row is compared. At the baseline it is green, over it on each of the four numbers it is red.
    expect(ratchetFailures('390|/a', rows['390|/a'], row, ctx, true)).toEqual([]);
    for (const over of [{ cls: 0.3 }, { requests: 11 }, { duplicates: 3 }, { swapShiftCls: 0.3 }]) {
      expect(ratchetFailures('390|/a', rows['390|/a'], { ...row, ...over }, ctx, true).length, `over: ${JSON.stringify(over)}`).toBe(1);
    }
  });

  test('25.236 a recording over an existing row can only lower it; raising is its own act', () => {
    const stored: Row = { cls: 0.2, requests: 10, duplicates: 2, swapShiftCls: 0.1 };
    const regressed: Row = { cls: 0.9, requests: 14, duplicates: 6, swapShiftCls: 0.5 };
    expect(recordRow(stored, regressed, false), 'a recording on a regressed tip must not raise any field').toEqual(stored);
    const lowered: Row = { cls: 0.05, requests: 8, duplicates: 0, swapShiftCls: 0.01 };
    expect(recordRow(stored, lowered, false), 'a better run lowers every field').toEqual(lowered);
    expect(recordRow(stored, { ...stored, cls: 0.3, requests: 9 }, false), 'fields are judged one by one').toEqual({ ...stored, requests: 9 });
    // Control: an absent key takes the run's worst, and the explicit act overwrites.
    expect(recordRow(undefined, regressed, false)).toEqual(regressed);
    expect(recordRow(stored, regressed, true)).toEqual(regressed);
  });

  test('25.237 a run is compared with the baseline only when its data is the baseline\'s', () => {
    const f: Fixture = { notes: 117, deletedNotes: 1, tickets: 364, workflows: 3, members: 3 };
    const row: Row = { cls: 0.2, requests: 10, duplicates: 2, swapShiftCls: 0.2 };
    const over: Row = { cls: 0.3, requests: 11, duplicates: 3, swapShiftCls: 0.3 };
    const ctx = { worstShifts: '', lastRequests: '[]', lastDupes: '[]' };
    // Control: the same data is the same fixture (a gate that always said "other data" would switch the ratchet off in silence).
    expect(sameFixture(f, { ...f }), 'identical fixtures must compare').toBe(true);
    expect(sameFixture(undefined, f), 'a json with no _fixture is never the same data').toBe(false);
    for (const field of ['notes', 'deletedNotes', 'tickets', 'workflows', 'members'] as const) {
      expect(sameFixture(f, { ...f, [field]: f[field] + 1 }), `one more ${field} is other data`).toBe(false);
      expect(sameFixture(f, { ...f, [field]: f[field] - 1 }), `one fewer ${field} is other data`).toBe(false);
    }
    // On other data a row that IS present and over its baseline on all four numbers is not compared; on the same data it is.
    expect(ratchetFailures('390|/a', row, over, ctx, false), 'other data: no per-key comparison').toEqual([]);
    expect(ratchetFailures('390|/a', row, over, ctx, true).length, 'control: the same row on the same data fails on all four').toBe(4);
  });
});
