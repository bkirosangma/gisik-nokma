import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { fontStackOf } from '@gisik-nokma/ui/tokens';
import { measureTapTargets, readTapBaseline, recordTapBaseline } from './tap-targets.js';
import { UNAUTHED_ROUTES, VIEWPORTS, type ViewportName } from './viewports.js';
import {
  ACCESSIBLE_BASELINE_PATH,
  RATCHETED,
  readAccessibleBaseline,
  recordAccessibleBaseline,
  sweepAccessibleNames,
} from './accessible-names.js';
import {
  LABEL_FLOOR_PX,
  measureTypeScale,
  readTypeScaleBaseline,
  recordTypeScaleBaseline,
} from './type-scale.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ITEM 7 — RESPONSIVE, MEASURED IN A REAL VIEWPORT
 *
 * Case 13.255 — the signed-out surface holds its layout at 390, 768 and 1512,
 * and the three are measurably DIFFERENT. (13.254, the signed-in shell, lives
 * in `apps/web/e2e-stack/viewport.spec.ts`: it needs a real session, and the
 * overflow that motivated all of this was on the authenticated pages only.)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `playwright.viewport.config.ts`'s docblock carries the WHY (the
 * `resize_window`-reported-success-and-changed-nothing failure, and the port
 * question). This file carries the HOW, and one rule governs all of it:
 *
 *     EVERY NULL RESULT PRINTS ITS POPULATION.
 *
 * Requirements 5 and 6 of this task are all null-shaped — "no horizontal
 * overflow", "no tap target under 44px", "no body text under 16px", "no
 * contrast failure". Every single one of them is satisfied by a selector that
 * matched NOTHING. A sweep that examined zero elements and a sweep that
 * examined thirty-four and found them all sound produce the identical green
 * tick, and only one of them is evidence.
 *
 * So each sweep below (a) asserts a floor on how many elements it examined,
 * (b) returns the WORST measured value it found, not just a verdict, and
 * (c) logs `examined N, skipped M, worst = <value> on <selector>` into the run
 * output. The run output is the reading; the tick is not.
 */

/* ────────────────────────────────────────────────────────────────────────────
 * THE TOOK-EFFECT GATE
 * ──────────────────────────────────────────────────────────────────────────*/

type ViewportReading = {
  innerWidth: number;
  innerHeight: number;
  documentClientWidth: number;
  devicePixelRatio: number;
  matches40rem: boolean;
  matches60rem: boolean;
  theme: string;
  surface: string;
};

/**
 * The FIRST thing every test does, before it measures one number it will
 * report.
 *
 * Modelled on `apps/web/test/ist-today.test.ts:126-131`, which asserts
 * `process.env['TZ']` actually IS what the case needs rather than assuming the
 * environment took. Same move, different environment: assert the viewport
 * actually took before trusting anything laid out inside it.
 *
 * THREE independent witnesses, because the failure this guards against is
 * exactly a tool that reports success down one channel while another channel
 * disagrees:
 *
 *   1. `testInfo.project.use.viewport` — what Playwright was CONFIGURED with.
 *      Cross-checked against `VIEWPORTS`. Catches a project that lost its
 *      override and fell back to a device descriptor's own size, which would
 *      otherwise make every later assertion true of the wrong width.
 *   2. `window.innerWidth`, read INSIDE the page. Catches the recorded
 *      failure directly: 390 requested, 1512 reported.
 *   3. `matchMedia('(max-width: 40rem)')` / `(max-width: 60rem)`, also inside
 *      the page. This is the one that goes through the CSS engine rather than
 *      JS layout, so it is the witness that speaks for the cascade — the thing
 *      the responsive rules are actually written against. A viewport that
 *      somehow satisfied (2) without moving the cascade still fails here.
 */
async function assertViewportTookEffect(page: Page, testInfo: TestInfo): Promise<ViewportReading> {
  const name = testInfo.project.name as ViewportName;
  const expected = VIEWPORTS[name];
  expect(expected, `project "${name}" has no entry in VIEWPORTS`).toBeDefined();

  // Witness 1 — the configuration, not the page.
  const configured = testInfo.project.use.viewport;
  expect(
    configured,
    `project "${name}" configured no viewport at all; every width below would be a browser default`,
  ).toBeTruthy();
  expect(
    configured?.width,
    `project "${name}" is configured at ${String(configured?.width)}px but VIEWPORTS says ${expected.width}px — config and spec have drifted apart`,
  ).toBe(expected.width);

  // Witnesses 2 and 3 — the page.
  const reading = await page.evaluate(() => ({
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    documentClientWidth: document.documentElement.clientWidth,
    devicePixelRatio: window.devicePixelRatio,
    matches40rem: window.matchMedia('(max-width: 40rem)').matches,
    matches60rem: window.matchMedia('(max-width: 60rem)').matches,
    theme: document.documentElement.dataset['theme'] ?? '(unset — OS preference)',
    surface: getComputedStyle(document.documentElement).getPropertyValue('--gn-surface').trim(),
  }));

  expect(
    reading.innerWidth,
    `VIEWPORT DID NOT TAKE EFFECT. Requested ${expected.width}px; the page reports ` +
      `window.innerWidth=${reading.innerWidth}. This is the exact shape of the recorded ` +
      `resize_window failure — a success report over an unchanged page. Nothing measured ` +
      `after this line would mean anything.`,
  ).toBe(expected.width);

  expect(
    reading.matches40rem,
    `CASCADE DID NOT MOVE. At ${expected.width}px, (max-width: 40rem) must be ` +
      `${String(expected.narrow40rem)}; the page says ${String(reading.matches40rem)}. ` +
      `innerWidth agreed but the CSS engine did not — the responsive rules are keyed off ` +
      `this, not off innerWidth.`,
  ).toBe(expected.narrow40rem);

  expect(
    reading.matches60rem,
    `CASCADE DID NOT MOVE. At ${expected.width}px, (max-width: 60rem) must be ` +
      `${String(expected.narrow60rem)}; the page says ${String(reading.matches60rem)}.`,
  ).toBe(expected.narrow60rem);

  return reading;
}

/* ────────────────────────────────────────────────────────────────────────────
 * THE RESPONSIVE SIGNATURE — what the breakpoints actually DO
 * ──────────────────────────────────────────────────────────────────────────*/

type Signature = {
  shellPaddingLeft: number | null;
  shellContentWidth: number | null;
  titleFontSize: number | null;
  helpH2FontSize: number | null;
  notFoundActionsDirection: string | null;
  proseBlockWidth: number | null;
};

/**
 * The values the two real breakpoints move. Every number here was traced to a
 * declaration first — none of them is a guess about what "responsive" ought to
 * look like:
 *
 *   `.gn-shell` padding-left
 *     20px (`1.25rem`) — apps/web/app/globals.css:15
 *     12px (`0.75rem`) — apps/web/app/globals.css:17-19, under (max-width: 60rem)
 *     Present on ALL five covered routes (grepped: help, privacy, terms,
 *     sign-in and not-found all render `<main className="gn-shell ...">`), so
 *     this is the one discriminator that works everywhere.
 *
 *   `.gn-legal__title` / `.gn-notfound__title` font-size
 *     34px   (`34px`)    — apps/web/app/globals.css:1913-1923 (Step 2c-2,
 *                          2026-09-18 — the refreshed export's heading scale,
 *                          replacing `1.6rem`. Was 25.6px before this change.)
 *     21.6px (`1.35rem`) — apps/web/app/globals.css:2241, under (max-width: 40rem)
 *                          — UNCHANGED by that port, deliberately: the export is
 *                          a desktop mockup and says nothing about 390px, so
 *                          the product's own downscale stands.
 *
 *   `.gn-notfound__actions` flex-direction
 *     row    — apps/web/app/globals.css:116-121
 *     column — apps/web/app/globals.css:221, under (max-width: 40rem)
 *
 *   `.gn-help__h2` font-size
 *     22px   (`1.375rem`) — packages/ui/src/ui.css, `.gn-help__h2`
 *     18.4px (`1.15rem`)  — packages/ui/src/ui.css, under (max-width: 40rem)
 *
 *     REPLACES `.gn-help__tabs` flex-direction (row/column at the same
 *     breakpoint), which was this route's discriminator until 2026-09-15.
 *     `.gn-help__tabs` no longer exists — the document switch became the
 *     shared `SegmentedControl` — and because `read()` returns `null` for an
 *     absent selector and the assertion below is guarded by `!== null`,
 *     leaving the old selector here would have turned a firing check into a
 *     silently SKIPPED one. That is the failure this file is least able to
 *     notice, so the discriminator moved to the OTHER declaration already in
 *     the same `(max-width: 40rem)` block.
 *
 * `null` means the selector is absent on this route, which is expected and
 * fine — `/sign-in` has no title and no tabs. What is NOT fine is every field
 * coming back null, so the caller asserts that at least the shell was found.
 */
async function measureSignature(page: Page): Promise<Signature> {
  return page.evaluate(() => {
    const px = (v: string): number => Number.parseFloat(v);
    const read = <T,>(sel: string, f: (el: Element, cs: CSSStyleDeclaration) => T): T | null => {
      const el = document.querySelector(sel);
      if (el === null) return null;
      return f(el, getComputedStyle(el));
    };
    return {
      shellPaddingLeft: read('.gn-shell', (_el, cs) => px(cs.paddingLeft)),
      shellContentWidth: read('.gn-shell', (el) => Math.round(el.getBoundingClientRect().width)),
      titleFontSize: read('.gn-legal__title, .gn-notfound__title', (_el, cs) => px(cs.fontSize)),
      helpH2FontSize: read('.gn-help__h2', (_el, cs) => px(cs.fontSize)),
      notFoundActionsDirection: read('.gn-notfound__actions', (_el, cs) => cs.flexDirection),
      proseBlockWidth: read('.gn-legal__section, .gn-help__doc, .gn-notfound__lead', (el) =>
        Math.round(el.getBoundingClientRect().width),
      ),
    };
  });
}

/* ────────────────────────────────────────────────────────────────────────────
 * THE SWEEPS — each one reports its population
 * ──────────────────────────────────────────────────────────────────────────*/

type Overflow = {
  scrollWidth: number;
  clientWidth: number;
  bodyScrollWidth: number;
  offenders: { selector: string; right: number; width: number }[];
  examined: number;
};

async function measureOverflow(page: Page): Promise<Overflow> {
  return page.evaluate(() => {
    const doc = document.documentElement;
    const limit = doc.clientWidth;
    const offenders: { selector: string; right: number; width: number }[] = [];
    const all = Array.from(document.body.querySelectorAll<HTMLElement>('*'));
    let examined = 0;
    for (const el of all) {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      // A box that scrolls its own overflow is doing the right thing — the help
      // table is explicitly built this way (`.gn-help__table-scroll` sets
      // `overflow-x: auto`, packages/ui/src/ui.css:1306). Its CHILDREN may
      // legitimately exceed it; only escape from the PAGE is a defect.
      let clipped = false;
      for (let p: HTMLElement | null = el; p !== null; p = p.parentElement) {
        const ps = getComputedStyle(p);
        if (ps.overflowX === 'auto' || ps.overflowX === 'scroll' || ps.overflowX === 'hidden') {
          if (p !== el) clipped = true;
          break;
        }
      }
      if (clipped) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      examined += 1;
      if (r.right > limit + 1) {
        const id = el.id !== '' ? `#${el.id}` : '';
        const cls = typeof el.className === 'string' && el.className !== ''
          ? `.${el.className.trim().split(/\s+/).join('.')}`
          : '';
        offenders.push({
          selector: `${el.tagName.toLowerCase()}${id}${cls}`,
          right: Math.round(r.right),
          width: Math.round(r.width),
        });
      }
    }
    return {
      scrollWidth: doc.scrollWidth,
      clientWidth: doc.clientWidth,
      bodyScrollWidth: document.body.scrollWidth,
      offenders: offenders.slice(0, 10),
      examined,
    };
  });
}

type BodyText = {
  /** Selector matches before filtering — see the note on TapTargets.rawMatches. */
  rawMatches: number;
  examined: number;
  skipped: number;
  offenders: { selector: string; fontSizePx: number; text: string }[];
  smallest: { selector: string; fontSizePx: number; text: string } | null;
};

/**
 * 16px is not an arbitrary round number here — it is this repo's own stated
 * floor, already enforced once by hand:
 *
 *     apps/web/app/globals.css:154-157
 *     "1rem, not the 0.95rem this first shipped with. Measured in a real
 *      browser at 15.2px, which is under the 16px floor for body text on a
 *      phone — and this paragraph is the one telling a locked-out reader who
 *      can help them, so it is exactly the wrong text to shrink."
 *
 * That fix was applied to `.gn-notfound__aside` and to nothing else. This sweep
 * is what makes the rule hold for every body-copy element on every covered
 * route instead of the one that happened to be noticed.
 *
 * Population: block-level text carriers with their OWN direct text — `p`, `li`,
 * `dd`, `dt`, `td`, `figcaption`, `label`. Headings are excluded (they are the
 * signature's business and are larger by construction); `code`/`kbd` are
 * excluded because `packages/ui/src/ui.css:1303` deliberately sets them to
 * `0.92em` as a typographic contrast, which is a different question from body
 * legibility.
 */
async function measureBodyText(page: Page): Promise<BodyText> {
  return page.evaluate(() => {
    const SELECTOR = 'p, li, dd, dt, td, figcaption, label';
    const describe = (el: Element): string => {
      const cls =
        typeof el.className === 'string' && el.className !== ''
          ? `.${el.className.trim().split(/\s+/).join('.')}`
          : '';
      return `${el.tagName.toLowerCase()}${cls}`;
    };
    const offenders: { selector: string; fontSizePx: number; text: string }[] = [];
    const all: { selector: string; fontSizePx: number; text: string }[] = [];
    let skipped = 0;

    const matched = Array.from(document.querySelectorAll(SELECTOR));
    for (const el of matched) {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      const directText = Array.from(el.childNodes)
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => (n.textContent ?? '').trim())
        .join(' ')
        .trim();
      if (
        cs.display === 'none' ||
        cs.visibility === 'hidden' ||
        r.width === 0 ||
        r.height === 0 ||
        directText === ''
      ) {
        skipped += 1;
        continue;
      }
      if (el.closest('code, kbd, pre') !== null) {
        skipped += 1;
        continue;
      }
      const entry = {
        selector: describe(el),
        fontSizePx: Number.parseFloat(cs.fontSize),
        text: directText.slice(0, 40),
      };
      all.push(entry);
      if (entry.fontSizePx < 16) offenders.push(entry);
    }

    const smallest =
      all.length === 0 ? null : all.reduce((a, b) => (a.fontSizePx <= b.fontSizePx ? a : b));
    return { rawMatches: matched.length, examined: all.length, skipped, offenders, smallest };
  });
}

type Contrast = {
  /** Elements carrying their own text, before filtering — see TapTargets.rawMatches. */
  rawMatches: number;
  examined: number;
  skipped: number;
  fellBackToCanvas: number;
  offenders: {
    selector: string;
    ratio: number;
    required: number;
    fg: string;
    bg: string;
    text: string;
  }[];
  worst: { selector: string; ratio: number; required: number; fg: string; bg: string } | null;
};

/**
 * Contrast from the LIVE DOM, and DELIBERATELY NOT the same maths as
 * `packages/ui/test/tokens.test.ts`.
 *
 * That file's helper says so in its own docblock at line 24 — "#rrggbbaa —
 * alpha ignored" — and for its job that is correct: it reads token PRIMITIVES,
 * which are the colours as declared. But the whole point of measuring from a
 * live page is to catch what static token analysis cannot, and the two biggest
 * things it cannot see are exactly the two ignored here:
 *
 *   1. **Alpha.** A translucent foreground over a backdrop paints a colour that
 *      appears in no token file. Ignoring alpha would make this sweep a slower
 *      copy of the one that already exists.
 *   2. **What the backdrop actually IS.** `CONTRAST_PAIRS`
 *      (`packages/ui/src/tokens.ts:167`) is a SELF-DECLARED list — it checks the
 *      pairs somebody wrote down. This walks up from each text node until it
 *      finds a painted background, so it checks the pairs that actually
 *      CO-OCCUR, including ones nobody declared.
 *
 * The compositing is per the standard alpha-over formula, accumulated from the
 * bottom of the stack up. When the walk reaches `<html>` with everything still
 * transparent, it falls back to the browser canvas (opaque white under the
 * light scheme this suite runs in) — and COUNTS that fallback, because a
 * fallback is an assumption and an uncounted assumption is how a sweep starts
 * measuring its own default.
 *
 * Thresholds are WCAG 1.4.3: 3.0 for large text (>=24px, or >=18.66px at
 * weight >=700), 4.5 otherwise.
 */
async function measureContrast(page: Page): Promise<Contrast> {
  return page.evaluate(() => {
    type RGBA = { r: number; g: number; b: number; a: number };

    const parse = (s: string): RGBA | null => {
      const m = /rgba?\(([^)]+)\)/.exec(s);
      const inner = m?.[1];
      if (inner === undefined) return null;
      const parts = inner
        .split(/[\s,/]+/)
        .filter((p) => p !== '')
        .map(Number);
      const r = parts[0];
      const g = parts[1];
      const b = parts[2];
      const a = parts.length > 3 ? parts[3] : 1;
      if (r === undefined || g === undefined || b === undefined || a === undefined) return null;
      if (![r, g, b, a].every((n) => Number.isFinite(n))) return null;
      return { r, g, b, a };
    };

    const over = (fg: RGBA, bg: RGBA): RGBA => ({
      r: fg.r * fg.a + bg.r * (1 - fg.a),
      g: fg.g * fg.a + bg.g * (1 - fg.a),
      b: fg.b * fg.a + bg.b * (1 - fg.a),
      a: 1,
    });

    const lum = ({ r, g, b }: RGBA): number => {
      const f = (c: number): number => {
        const v = c / 255;
        return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
      };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };

    const ratio = (x: RGBA, y: RGBA): number => {
      const a = lum(x);
      const b = lum(y);
      return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    };

    const CANVAS: RGBA = { r: 255, g: 255, b: 255, a: 1 };

    /** Walk ancestors collecting painted backgrounds until one is opaque. */
    const backdropOf = (el: Element): { colour: RGBA; fellBack: boolean } => {
      const stack: RGBA[] = [];
      let opaqueFound = false;
      for (let p: Element | null = el; p !== null; p = p.parentElement) {
        const bg = parse(getComputedStyle(p).backgroundColor);
        if (bg !== null && bg.a > 0) {
          stack.push(bg);
          if (bg.a >= 1) {
            opaqueFound = true;
            break;
          }
        }
      }
      let acc = CANVAS;
      for (let i = stack.length - 1; i >= 0; i -= 1) {
        const layer = stack[i];
        if (layer !== undefined) acc = over(layer, acc);
      }
      return { colour: acc, fellBack: !opaqueFound };
    };

    const describe = (el: Element): string => {
      const cls =
        typeof el.className === 'string' && el.className !== ''
          ? `.${el.className.trim().split(/\s+/).join('.')}`
          : '';
      return `${el.tagName.toLowerCase()}${cls}`;
    };

    const offenders: Contrast['offenders'] = [];
    const measured: NonNullable<Contrast['worst']>[] = [];
    let skipped = 0;
    let fellBackToCanvas = 0;
    let rawMatches = 0;

    for (const el of Array.from(document.body.querySelectorAll('*'))) {
      const directText = Array.from(el.childNodes)
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => (n.textContent ?? '').trim())
        .join(' ')
        .trim();
      if (directText === '') continue;
      rawMatches += 1;

      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      if (cs.display === 'none' || cs.visibility === 'hidden' || r.width === 0 || r.height === 0) {
        skipped += 1;
        continue;
      }
      if (Number.parseFloat(cs.opacity) === 0) {
        skipped += 1;
        continue;
      }

      const fgRaw = parse(cs.color);
      if (fgRaw === null) {
        skipped += 1;
        continue;
      }
      const back = backdropOf(el);
      if (back.fellBack) fellBackToCanvas += 1;
      const fg = over(fgRaw, back.colour);
      const value = ratio(fg, back.colour);

      const size = Number.parseFloat(cs.fontSize);
      const weight = Number.parseInt(cs.fontWeight, 10);
      const isLarge = size >= 24 || (size >= 18.66 && Number.isFinite(weight) && weight >= 700);
      const required = isLarge ? 3.0 : 4.5;

      const fmt = (c: RGBA): string =>
        `rgb(${Math.round(c.r)},${Math.round(c.g)},${Math.round(c.b)})`;
      const entry = {
        selector: describe(el),
        ratio: Math.round(value * 100) / 100,
        required,
        fg: fmt(fg),
        bg: fmt(back.colour),
      };
      measured.push(entry);
      if (value < required) offenders.push({ ...entry, text: directText.slice(0, 40) });
    }

    const worst =
      measured.length === 0
        ? null
        : measured.reduce((a, b) => (a.ratio - a.required <= b.ratio - b.required ? a : b));

    return {
      rawMatches,
      examined: measured.length,
      skipped,
      fellBackToCanvas,
      offenders: offenders.slice(0, 12),
      worst,
    };
  });
}

/* ────────────────────────────────────────────────────────────────────────────
 * THE TAP-TARGET RATCHET'S STORE
 *
 * A plain committed JSON file rather than a snapshot fixture, because it is read
 * by a human deciding whether a design pass is worth scheduling. Written only
 * when a key is ABSENT — an existing key is never rewritten from a run, so the
 * ratchet cannot quietly re-baseline itself upward on the branch that made
 * things worse. Falling numbers are re-recorded by deleting the file.
 * ──────────────────────────────────────────────────────────────────────────*/

/* ────────────────────────────────────────────────────────────────────────────
 * THE TESTS
 * ──────────────────────────────────────────────────────────────────────────*/

for (const route of UNAUTHED_ROUTES) {
  test(`${route.label} (${route.path})`, async ({ page }, testInfo) => {
    const name = testInfo.project.name as ViewportName;
    const spec = VIEWPORTS[name];

    /* THIS SUITE IS NOT HERMETIC UNLESS THIS STUB IS HERE, and the comment three
     * hundred lines down that says "this suite's dev server has no API behind
     * it" was FALSE — measured, not suspected.
     *
     * `next.config.ts` rewrites `/v1/*` to the API origin, so the dev server
     * this suite starts on its own port happily proxies to WHATEVER is listening
     * on the API port — in practice the developer's compose stack. On
     * 2026-09-08 that stack had just been given real Google credentials, and
     * `/sign-in` rendered `Continue with Google` in this suite as a result.
     *
     * That is not a cosmetic difference: it lands in the ACCESSIBLE-NAMES
     * BASELINE, which is recorded from whatever the sweep sees. The `/sign-in`
     * baseline was `ariaLabel: 1` before this round (the segmented control) and
     * measured `ariaLabel: 1` after it (the Google button) — **the same number
     * for an entirely different reason, which is exactly what hid it.** Recorded
     * that way, the ratchet fails with "LOST ariaLabel" on any machine where the
     * stack is down, and in CI, where there is no stack at all. Measured both
     * ways against this tree: API reachable → 1, request aborted → 0.
     *
     * So the answer is fixed here, before the first navigation, at the state a
     * deployment has configured NOTHING. Only `/sign-in` fetches it; the other
     * routes are unaffected. Route-specific cases override it further down with
     * their own `page.route`, which is why this one is registered first. */
    await page.route('**/v1/auth/methods', (apiRoute) =>
      apiRoute.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ google: false, apple: false, phone: false }),
      }),
    );

    const response = await page.goto(route.path, { waitUntil: 'networkidle' });
    // The 404 route legitimately answers 404; everything else must be 200.
    expect(response?.status(), `${route.path} responded unexpectedly`).toBe(
      route.label === '404' ? 404 : 200,
    );

    // ── GATE. Hard, and first. Nothing below is evidence until this passes.
    const reading = await assertViewportTookEffect(page, testInfo);

    /* ────────────────────────────────────────────────────────────────────────
     * MEASURE EVERYTHING AND PRINT EVERYTHING **BEFORE** ASSERTING ANYTHING.
     *
     * This ordering is not cosmetic — it is a correction to a defect the first
     * run of this file exposed in the file itself. The sweeps were originally
     * interleaved with their assertions, and on `/privacy`, `/terms` and the
     * 404 a hard population floor threw partway down the test. Playwright stops
     * the test body at a hard `expect`, so the contrast and body-text sweeps
     * for those three routes NEVER RAN and their readings were absent from the
     * output — a suite whose stated rule is "every null result prints its
     * population" had silently printed no population at all for three of five
     * routes.
     *
     * A checker that suppresses its own evidence when one check fails is the
     * same class of fault as a checker that cannot fail: in both cases the
     * output stops describing the thing measured. So: gather, log, then judge.
     * ──────────────────────────────────────────────────────────────────────*/
    const sig = await measureSignature(page);
    const overflow = await measureOverflow(page);
    const taps = await measureTapTargets(page);
    const body = await measureBodyText(page);
    const typeScale = await measureTypeScale(page);
    const contrast = await measureContrast(page);

    const tag = `[${name}] ${route.path}`;
    /* eslint-disable no-console */
    console.log(
      `${tag} — took effect: innerWidth=${reading.innerWidth} ` +
        `docClientWidth=${reading.documentClientWidth} dpr=${reading.devicePixelRatio} ` +
        `(max-width:40rem)=${String(reading.matches40rem)} ` +
        `(max-width:60rem)=${String(reading.matches60rem)} ` +
        `theme=${reading.theme} --gn-surface=${reading.surface}`,
    );
    console.log(`${tag} — signature: ${JSON.stringify(sig)}`);
    console.log(
      `${tag} — overflow: examined ${overflow.examined} boxes, ` +
        `documentElement scrollWidth=${overflow.scrollWidth} clientWidth=${overflow.clientWidth}, ` +
        `body scrollWidth=${overflow.bodyScrollWidth}, offenders=${overflow.offenders.length}`,
    );
    console.log(
      `${tag} — tap targets: selector matched ${taps.rawMatches}, examined ${taps.examined.length}, ` +
        `inline-in-prose exempt ${taps.inlineExempt.length}, invisible skipped ${taps.invisibleSkipped}, ` +
        `smallest examined = ${
          taps.smallestExamined === null
            ? 'n/a'
            : `${taps.smallestExamined.w}x${taps.smallestExamined.h} (${taps.smallestExamined.selector})`
        }, offenders=${taps.offenders.length}`,
    );
    /**
     * The SPLIT's own reading, printed whether or not it fires — the same rule
     * the rest of this block follows. A run where `denseMembers` is 0 on a page
     * that renders the attention strip or the help sidebar is the split quietly
     * not applying, which is precisely what `brokenEntries` names; and a run
     * where `rescued` is 0 has the split doing nothing observable, which is a
     * fact a reader should be able to see rather than infer from a green tick.
     */
    console.log(
      `${tag} — tap-target floors: in-list classified ${taps.denseMembers} (24px floor), ` +
        `standalone judged ${taps.examined.length - taps.denseMembers} (44px floor), ` +
        `rescued from the flat 44 by the split=${taps.denseAccepted.length}, ` +
        `stale entries=${JSON.stringify(taps.brokenEntries)}`,
    );
    console.log(
      `${tag} — body text: selector matched ${body.rawMatches}, examined ${body.examined}, ` +
        `skipped ${body.skipped}, smallest = ${
          body.smallest === null
            ? 'n/a'
            : `${body.smallest.fontSizePx}px on ${body.smallest.selector}`
        }, under-16px=${body.offenders.length}`,
    );
    console.log(
      `${tag} — label text: selector matched ${typeScale.rawMatches}, ` +
        `examined ${typeScale.examined.length}, body-owned ${typeScale.bodyOwned.length}, ` +
        `skipped ${typeScale.skipped}, smallest = ${
          typeScale.smallest === null
            ? 'n/a'
            : `${typeScale.smallest.fontSizePx}px on ${typeScale.smallest.selector}`
        }, under-${LABEL_FLOOR_PX}px=${typeScale.offenders.length}`,
    );
    /**
     * The whole distribution, not just the verdict. A ratchet reports one
     * number, and one number cannot distinguish "this page has no small text"
     * from "this page has a cliff of text sitting one pixel above the floor" —
     * which is what the tap-target pass found twice, both times only after
     * forcing the threshold to print everything instead of re-reading the
     * smallest. Printing the histogram every run means the next person starts
     * from the shape of the page rather than from a single count.
     */
    console.log(
      `${tag} — label-text sizes: ${JSON.stringify(
        Object.fromEntries(
          Object.entries(
            typeScale.examined.reduce<Record<string, number>>((acc, s) => {
              const bucket = `${s.fontSizePx}px`;
              acc[bucket] = (acc[bucket] ?? 0) + 1;
              return acc;
            }, {}),
          ).sort(([a], [b]) => Number.parseFloat(a) - Number.parseFloat(b)),
        ),
      )}`,
    );
    console.log(
      `${tag} — contrast: text-bearing elements ${contrast.rawMatches}, measured ${contrast.examined}, ` +
        `skipped ${contrast.skipped}, canvas-fallback backdrops ${contrast.fellBackToCanvas}, ` +
        `worst = ${
          contrast.worst === null
            ? 'n/a'
            : `${contrast.worst.ratio}:1 (needs ${contrast.worst.required}) on ${contrast.worst.selector} ` +
              `${contrast.worst.fg} on ${contrast.worst.bg}`
        }, failures=${contrast.offenders.length}`,
    );
    /* eslint-enable no-console */

    /* ────────────────────────────────────────────────────────────────────────
     * POPULATION FLOORS — the anti-vacuity guards.
     *
     * Every floor below is on `rawMatches` (what the SELECTOR found), never on
     * the filtered `examined` count, and the first run is why. `/privacy`'s
     * only control is a single inline link to `/terms`; the 404 has exactly
     * two. A floor on `examined` reddened those as "the selector broke" when
     * the true reading was "this page really does have one link" — a false red
     * that would have been silenced by lowering the number, which is exactly
     * how a floor stops catching anything. `rawMatches` can only be zero if the
     * selector genuinely stopped matching, which is the one thing a floor can
     * honestly detect.
     *
     * Soft, so that all five judgements below report in one run rather than the
     * first one hiding the other four.
     * ──────────────────────────────────────────────────────────────────────*/
    expect
      .soft(
        overflow.examined,
        `POPULATION: the overflow sweep examined ${overflow.examined} boxes on ${route.path}. ` +
          `A "no overflow" verdict over an empty page is not a reading.`,
      )
      .toBeGreaterThan(5);
    expect
      .soft(
        taps.rawMatches,
        `POPULATION: the tap-target selector matched ${taps.rawMatches} nodes on ${route.path}. ` +
          `Zero means the selector broke — every covered route renders at least one link.`,
      )
      .toBeGreaterThan(0);
    expect
      .soft(
        body.rawMatches,
        `POPULATION: the body-text selector matched ${body.rawMatches} nodes on ${route.path}.`,
      )
      .toBeGreaterThan(0);
    expect
      .soft(
        contrast.rawMatches,
        `POPULATION: ${contrast.rawMatches} text-bearing elements on ${route.path}. ` +
          `A clean contrast report over an empty population is the null result this ` +
          `suite exists to refuse.`,
      )
      .toBeGreaterThan(3);

    /* ── 1. THE SIGNATURE: the breakpoints did what the CSS says they do. ──*/
    expect(
      sig.shellPaddingLeft,
      `.gn-shell was not found on ${route.path}. Every covered route renders it ` +
        `(grepped), so a null here means the page did not render, not that the rule is absent.`,
    ).not.toBeNull();

    // globals.css:15 vs globals.css:17-19 — the only discriminator present on
    // all five routes, and the one that separates 768 from 1512.
    expect
      .soft(
        sig.shellPaddingLeft,
        `.gn-shell padding-left at ${spec.width}px: (max-width:60rem)=${String(spec.narrow60rem)} ` +
          `implies ${spec.narrow60rem ? 12 : 20}px (globals.css:15 / :17-19)`,
      )
      .toBe(spec.narrow60rem ? 12 : 20);

    if (sig.titleFontSize !== null) {
      // globals.css (34px, the export's scale) vs the (max-width: 40rem)
      // override (1.35rem). The WIDE value moved 25.6 → 34 in Step 2c-2
      // (2026-09-18): the base rule took the refreshed export's heading scale,
      // and the phone override deliberately did NOT follow it — the export is a
      // desktop mockup and says nothing about a 390px viewport, so the
      // product's own downscale stands. That is also why this discriminator
      // still exists at all: had the phone rule been dropped with it, the title
      // would have been 34px at every width and this field could no longer tell
      // 768 from 1512.
      expect
        .soft(
          sig.titleFontSize,
          `title font-size at ${spec.width}px: (max-width:40rem)=${String(spec.narrow40rem)} ` +
            `implies ${spec.narrow40rem ? 21.6 : 34}px (globals.css 34px / its 40rem override)`,
        )
        .toBeCloseTo(spec.narrow40rem ? 21.6 : 34, 1);
    }
    if (sig.helpH2FontSize !== null) {
      // ui.css `.gn-help__h2` (1.375rem) vs its (max-width: 40rem) override (1.15rem)
      expect
        .soft(
          sig.helpH2FontSize,
          `.gn-help__h2 font-size at ${spec.width}px: (max-width:40rem)=${String(spec.narrow40rem)} ` +
            `implies ${spec.narrow40rem ? 18.4 : 22}px (ui.css .gn-help__h2 / its 40rem override)`,
        )
        .toBeCloseTo(spec.narrow40rem ? 18.4 : 22, 1);
    }
    if (sig.notFoundActionsDirection !== null) {
      // globals.css:116-121 (row) vs globals.css:221 (column)
      expect
        .soft(
          sig.notFoundActionsDirection,
          `.gn-notfound__actions flex-direction (globals.css:116-121 / :221)`,
        )
        .toBe(spec.narrow40rem ? 'column' : 'row');
    }

    /* ── 2. NO HORIZONTAL OVERFLOW. ───────────────────────────────────────*/
    expect
      .soft(
        overflow.offenders,
        `elements escaping the viewport at ${spec.width}px: ${JSON.stringify(overflow.offenders)}`,
      )
      .toEqual([]);
    expect
      .soft(
        overflow.scrollWidth,
        `documentElement.scrollWidth ${overflow.scrollWidth} > clientWidth ${overflow.clientWidth} + 1 ` +
          `— the page scrolls sideways at ${spec.width}px`,
      )
      .toBeLessThanOrEqual(overflow.clientWidth + 1);

    /* ── 3. TAP TARGETS — TWO FLOORS, ONE RATCHET. ───────────────────────*/
    /**
     * The floor is 24px for an in-list control and 44px for a standalone one.
     * `e2e-viewport/tap-targets.ts`'s `DENSE_IN_LIST` docblock carries the owner
     * ruling, the membership rule, and the three structural predicates that were
     * tried against this product's real markup and rejected. This block carries
     * the RATCHET's history and its numbers.
     *
     * It started as `.toEqual([])` and reddened 15 of 21 cases, and the shape of
     * the assertion has been decided by three things about the reading rather
     * than by its truth:
     *
     * 1. **It failed IDENTICALLY at 390, 768 and 1512.** A number that does not
     *    move with the viewport is not a responsive finding, and item 7 is the
     *    responsive item. It is a type-and-spacing decision that happens to be
     *    visible here.
     * 2. **The offenders are wide and shallow, not small targets.** The narrowest
     *    on `/help` measures 114px across and 24px tall; the sidebar rows are
     *    `348x33` and the disclosures `366x36`. Raising them to 44 is a design
     *    pass over `packages/ui`, with product-wide blast radius.
     * 3. **The pre-launch checklist records this as an OWNER decision**, with the
     *    numbers. Asserting a hard floor here would have this suite block every
     *    branch on a decision deliberately deferred to a person.
     *
     * ⚠ MEASURED AT `99f2a780`, BEFORE THE SPLIT — and this is why it was urgent.
     * The three `/help` routes read **25 / 23 / 25** against recorded baselines of
     * **10 / 16 / 16**. The sweep had been red on `main` for as long as the topic
     * sidebar has existed, and nobody saw it, **because this suite is on no gate**:
     * `pnpm turbo run build test typecheck` defines no task that reaches it, and
     * `.github/workflows/ci.yml` runs `test:e2e:stack` only — `viewport` does not
     * appear in that file at all. A ratchet with no runner is a note, not a check.
     * (Wiring this suite to a gate is NOT this change's to make; it is recorded in
     * the PR body as a finding with its own owner.)
     *
     * Every one of those 25 offenders was an in-list control the CSS had ALREADY
     * given the 24px floor — at 390px: 5 `button.gn-help__group-toggle` at 36px,
     * 10 `a.gn-help__nav-link` at 33px, 10 `a.gn-help__pager-link` at 24px. The
     * ratchet was recording, as debt, a decision the product had already taken;
     * the four rules that say so are quoted in `tap-targets.ts`.
     *
     * So it still ratchets — the count may FALL and may not RISE — and **13.992**:
     * after the split these three routes measure **0**. The baselines were re-recorded DOWN
     * to that reading, which is the only direction the guard below blesses: a rise
     * fails before it can be recorded, so observation can only ever lower the
     * ceiling. **No floor is hand-lowered anywhere in this change.** The floor for
     * a standalone control is still 44, and the reason to believe it is
     * `apps/web/test/tap-target-density.test.ts` plus the mutation recorded in the
     * PR body, not this sentence.
     *
     * Same ratchet pattern as `check:citations`.
     *
     * The baseline file is committed, and a MISSING entry FAILS rather than
     * seeding itself (see the guard below). To re-baseline after a genuine
     * improvement, delete it and run once — it is rewritten from observation,
     * which is only ever safe in the falling direction because a RISE fails
     * before it can be recorded.
     */
    const tapKey = `${name}|${route.path}`;
    const tapBaseline = readTapBaseline();
    const allowed = tapBaseline[tapKey];
    if (allowed === undefined) {
      /**
       * A MISSING BASELINE FAILS. It must not silently record.
       *
       * The first version of this recorded whatever it saw and asserted
       * nothing, which an adversarial review caught immediately: a fresh clone
       * or a CI checkout without the file would seed the baseline from the
       * current breakage and report full green with ZERO enforcement, on every
       * first run. That is a check that cannot fail — the exact class this repo
       * keeps a catalogue of — and it is worse than no check, because it prints
       * a tick.
       *
       * Recording is now an explicit act: `UPDATE_TAP_BASELINE=1`. The file is
       * committed, so the normal path never takes this branch.
       */
      if (process.env['UPDATE_TAP_BASELINE'] === '1') {
        recordTapBaseline(tapKey, taps.offenders.length);
      } else {
        expect(
          allowed,
          `no tap-target baseline for "${tapKey}" in e2e-viewport/tap-target-baseline.json, and this ` +
            `suite refuses to invent one: seeding from the current run would record whatever is ` +
            `broken today and report green. Observed ${taps.offenders.length} offenders. If this is a ` +
            `genuinely new route, re-run once with UPDATE_TAP_BASELINE=1 and COMMIT the file.`,
        ).toBeDefined();
      }
    } else {
      expect
        .soft(
          taps.offenders.length,
          `interactive targets below their own floor at ${spec.width}px rose above the recorded ` +
            `baseline ${allowed} for ${tapKey}. The floor is 24px for a control that ` +
            `apps/web/e2e-viewport/tap-targets.ts's DENSE_IN_LIST classifies as in-list ` +
            `(WCAG 2.5.8) and 44px for every other control (WCAG 2.5.5 — the same number as the ` +
            `"44px — the minimum touch target" comment on packages/ui/src/ui.css's ` +
            `.gn-help__search-input rule, cited by SELECTOR because the line number moved the last ` +
            `time it was cited here). Each offender below carries the floor it missed. This is a ` +
            `RATCHET — the count may fall, never rise. ` +
            `Offenders: ${JSON.stringify(taps.offenders)}`,
        )
        .toBeLessThanOrEqual(allowed);
    }

    /**
     * THE STALE-ENTRY GUARD — the other half of a table that classifies by
     * selector, and the half that is invisible without it.
     *
     * A `DENSE_IN_LIST` control that gets renamed goes on being judged at 44,
     * which reddens LOUDLY and is the safe direction. Its ENTRY, though, dies
     * silently: the table still reads as though it were doing work, and the next
     * person to add a dense control copies a selector that matches nothing. This
     * is the only place the two can be told apart, because `measureTapTargets` is
     * the only thing that knows which containers actually rendered.
     */
    expect
      .soft(
        taps.brokenEntries,
        `a DENSE_IN_LIST entry's container rendered on ${route.path} but its control selector ` +
          `matched nothing inside it — the entry has stopped classifying anything, so the control ` +
          `it names is being judged against the 44px floor again. Fix the selector in ` +
          `apps/web/e2e-viewport/tap-targets.ts, or remove the entry.`,
      )
      .toEqual([]);

    /* ── 4. BODY TEXT >= 16px, phone viewport only. ───────────────────────*/
    if (spec.width <= 640) {
      expect
        .soft(
          body.offenders,
          `body copy under 16px at ${spec.width}px. The floor is this repo's own — ` +
            `globals.css:154-157 raised .gn-notfound__aside from 0.95rem for exactly this ` +
            `reason ("15.2px, which is under the 16px floor for body text on a phone"). ` +
            `Offenders: ${JSON.stringify(body.offenders)}`,
        )
        .toEqual([]);
    }

    /* ── 4b. LABEL TEXT >= 12px, ratcheted. ───────────────────────────────
     *
     * Case 13.264 — label text on the signed-out surface holds the 12px floor.
     *
     * The population section 4 cannot see. `measureBodyText` sweeps `p, li, dd,
     * dt, td, figcaption, label`; every element the pre-launch checklist named
     * as small — `gn-board-card__provenance` at 12.5px, the chips at 12.8px —
     * is a `span` or a `div`, and so was measured by hand once and never again.
     *
     * A RATCHET, not a hard floor, and for the third of the three reasons the
     * tap-target block above gives: the checklist records these labels as an
     * OWNER decision about the design, already ruled on ("take it", 2026-09-08,
     * scoped to the sub-scale strays). A hard floor here would have this suite
     * block every branch on a design question that belongs to a person.
     *
     * `LABEL_FLOOR_PX` carries the derivation, and the one thing worth
     * repeating here is what it is NOT: no WCAG success criterion sets a
     * minimum font size. 12px is the bottom rung of this product's own scale.
     * ──────────────────────────────────────────────────────────────────────*/

    /**
     * The selector control, asserted HARD and before the ratchet.
     *
     * A sweep whose selector stopped matching reports zero offenders and reads
     * as the best possible result. `div` is in the population, so on any
     * rendered page this cannot legitimately be 0 — which makes it a control
     * that can actually fail rather than a decorative one.
     */
    expect(
      typeScale.rawMatches,
      `the label-text selector matched NOTHING on ${route.path}. A sweep that examined no ` +
        `elements reports zero offenders and looks identical to a clean page. The population ` +
        `includes \`div\`, so a rendered document cannot honestly produce 0 here.`,
    ).toBeGreaterThan(0);

    /**
     * The disjointness claim, MEASURED rather than asserted in prose.
     *
     * `type-scale.ts` justifies existing alongside `measureBodyText` on the
     * grounds that the two populations do not overlap. That is a claim about
     * two selectors that live in two files and are free to drift apart. If
     * either grows into the other's territory, elements land in `bodyOwned`
     * and this names them — instead of the two sweeps quietly double-counting
     * and reporting numbers that no longer add up to anything.
     */
    expect
      .soft(
        typeScale.bodyOwned,
        `elements matched BOTH the label-text selector and the body-text selector on ` +
          `${route.path}. The two sweeps are justified by their populations being disjoint; ` +
          `an overlap means one of the selectors was widened and the counts have stopped ` +
          `being separable. Overlapping: ${JSON.stringify(typeScale.bodyOwned)}`,
      )
      .toEqual([]);

    /* Case 13.266 — every control renders in the PRODUCT's font, not the
       browser's. The signed-out half of the guard for the owner-ruled
       2026-09-08 `font: inherit` fix. See the sibling
       assertion in `e2e-stack/viewport.spec.ts` for why this is a font-FAMILY
       reading and not a second floor: the defect it guards sat ABOVE the 12px
       floor, so no size ratchet could ever have reddened on it.

       This surface is where the ruling's own count came from being a floor
       rather than a total: `/sign-in`'s two method tabs WERE unclassed
       `<button role="tab">` inside `.gn-view-tabs`, which set `min-height` and
       `padding-inline` and no font, and the signed-in enumeration of 26 could
       not see them. **Past tense as of the HIG sign-in restyle** — they are
       `.gn-segmented__item` now and carry their own `font: inherit`, so this
       check stays green here for a different reason than the one that
       originally made it necessary. The provenance is kept because it is why
       the check exists; it is no longer a description of this route. */
    expect
      .soft(
        typeScale.uaFont,
        `text on ${route.path} at ${name} is painted in the BROWSER's font, not the product's — ` +
          `a control where no rule sets \`font\`. \`button { font: inherit }\` in ` +
          `apps/web/app/globals.css exists to prevent exactly this, and no font-SIZE floor can ` +
          `see it because the UA default sits above the floor. ` +
          `Offending: ${JSON.stringify(typeScale.uaFont)}`,
      )
      .toEqual([]);

    /* Case 15.31 — and `body` itself is painting in the ORIGIN's stack.
       The check above is an EQUALITY against `body`, so it says nothing about
       what `body` resolved to. Since the 2026-09-15 font port that value is
       `var(--gn-font-sans)`: if the variable ever stops being emitted or is
       renamed, the declaration is invalid at computed-value time, `body` drops
       to the UA serif, every inheriting element drops with it, and `uaFont`
       goes EMPTY — green, with the product's typeface gone everywhere. This is
       the assertion that can tell those two apart.

       It compares against `fontStackOf('sans')`'s FIRST family rather than the
       whole string: the expectation comes from the one origin in `tokens.ts`
       and not a literal copy, while staying immune to the quote and whitespace
       normalisation `getComputedStyle` applies to a stack. `-apple-system` is
       in no browser default, so a fallback cannot satisfy it by accident. */
    const expectedFirstFamily = fontStackOf('sans').split(',')[0]?.trim() ?? '';
    expect
      .soft(
        typeScale.bodyFamily,
        `body on ${route.path} at ${name} is not painting in the product's stack — it computed to ` +
          `"${typeScale.bodyFamily}", which does not name "${expectedFirstFamily}". ` +
          `The likeliest cause is that \`--gn-font-sans\` did not resolve, which ALSO empties the ` +
          `uaFont list above and would otherwise read as a pass.`,
      )
      .toContain(expectedFirstFamily);

    const typeKey = `${name}|${route.path}`;
    const typeBaseline = readTypeScaleBaseline();
    const typeAllowed = typeBaseline[typeKey];
    if (typeAllowed === undefined) {
      // A missing baseline FAILS rather than seeding itself — same reasoning as
      // the tap-target guard above, which an adversarial review forced.
      if (process.env['UPDATE_TYPE_SCALE_BASELINE'] === '1') {
        recordTypeScaleBaseline(typeKey, typeScale.offenders.length);
      } else {
        expect(
          typeAllowed,
          `no type-scale baseline for "${typeKey}" in e2e-viewport/type-scale-baseline.json, and ` +
            `this suite refuses to invent one: seeding from the current run would record whatever ` +
            `is broken today and report green. Observed ${typeScale.offenders.length} offenders. ` +
            `If this is a genuinely new route, re-run once with UPDATE_TYPE_SCALE_BASELINE=1 and ` +
            `COMMIT the file.`,
        ).toBeDefined();
      }
    } else {
      expect
        .soft(
          typeScale.offenders.length,
          `label text under ${LABEL_FLOOR_PX}px at ${spec.width}px rose above the recorded ` +
            `baseline ${typeAllowed} for ${typeKey}. This is a RATCHET — the count may fall, ` +
            `never rise. The floor is this product's own bottom rung (0.75rem, x17 in ui.css), ` +
            `NOT a WCAG criterion; none sets a minimum font size. ` +
            `Offenders: ${JSON.stringify(typeScale.offenders)}`,
        )
        .toBeLessThanOrEqual(typeAllowed);
    }

    /* ── 4c. ACCESSIBLE NAMES AND ROLES, ratcheted one-way. ──────────────
     * Cases 13.285 (ratchet) and 13.286 (control).
     * The population the owner's copy rule protects. No test asserted any
     * accessible name existed before this; a restyle could drop every one
     * and the gate stayed 33/33.
     * ──────────────────────────────────────────────────────────────────*/
    const names = await sweepAccessibleNames(page);

    // 13.286 — the selector control, HARD, before the ratchet. `*` on a rendered
    // document cannot honestly examine zero elements.
    expect(
      names.rawMatches,
      `13.286: the accessible-name sweep examined NOTHING on ${route.path}. A sweep over ` +
        `\`*\` that saw zero elements reports zero losses and looks identical to a clean page.`,
    ).toBeGreaterThan(0);

    const accessibleKey = `${name}|${route.path}`;
    const accessibleBaseline = readAccessibleBaseline()[accessibleKey];
    if (accessibleBaseline === undefined) {
      if (process.env['UPDATE_ACCESSIBLE_BASELINE'] === '1') {
        recordAccessibleBaseline(ACCESSIBLE_BASELINE_PATH, accessibleKey, names);
      }
      test
        .info()
        .annotations.push({ type: 'baseline', description: `${accessibleKey}: recorded, not asserted` });
    } else {
      // 13.350 (Task 15, neo restyle) — this ratchet, run over EVERY route in
      // this suite including /sign-in, is what proves the accessible-name
      // floor did not fall under the restyle: baselines are unchanged and
      // this loop stayed green through Task 15's commits.
      for (const attr of RATCHETED) {
        // 13.285 — a count may fall and never rise. Lowering is a deliberate,
        // commit-message-carrying deletion of the key, never a re-run.
        expect(
          names[attr],
          `13.285: ${route.path} at ${name} LOST ${attr}: baseline ${accessibleBaseline[attr]}, ` +
            `now ${names[attr]}. Something that identified an element to assistive tech is gone. ` +
            `If this is intended, delete the key from accessible-names-baseline.json in a commit ` +
            `that says which element and why.`,
        ).toBeGreaterThanOrEqual(accessibleBaseline[attr]);
      }
    }

    if (route.path === '/sign-in') {
      /* 13.292 — AMENDED, and the amendment is a finding rather than a
       * relaxation.
       *
       * This case asserted that all four shipped methods render as controls,
       * and TWO OF THE FOUR COULD NOT WORK. `Continue with Google` rendered
       * unconditionally while `GOOGLE_CLIENT_ID` was unset (the owner found it
       * by pressing it); `Sign in with a passkey` could not work for any user
       * anywhere, because no passkey REGISTRATION flow exists in app code.
       * **Asserting their presence is what kept them on screen** — the case was
       * doing its job and its job was wrong.
       *
       * The property is now *exactly the methods that can work are offered*.
       * Phone and email need no provider and stay unconditional. The social pair
       * is gated on `GET /v1/auth/methods`, and this suite's dev server has no
       * credentials, so the honest expectation here is ZERO social buttons — the
       * dev stack's real state, asserted rather than worked around.
       *
       * **The passkey half of that history ENDED with the account/help-screens
       * plan's Task 8**, which built registration on `/account` — so the button
       * is back, it is asserted VISIBLE below (not absent), and it is
       * deliberately grouped with the social-absence assertions only because they
       * share one page load, not because passkey is gated the same way: a
       * passkey needs no provider and no server capability check, so unlike
       * Google/Apple it does not disappear when `/v1/auth/methods` answers all
       * false. **The final whole-branch review found this case still asserted
       * `toHaveCount(0)` for the passkey button** — the identical defect already
       * found and fixed once in `apps/web/e2e/smoke.spec.ts` (see that file's own
       * docblock for the same fix, applied here), just in a sibling directory
       * that audit's grep scope could not reach.
       *
       * The both-directions half of this property lives in
       * `apps/web/test/sign-in.test.tsx` (13.326), where the server's answer can
       * be driven to `true`. A viewport suite cannot set the server's env, so
       * asserting only the empty direction HERE would be a check that cannot
       * distinguish "gated correctly" from "the row was deleted" — which is why
       * the positive control below asserts the row's own container is absent for
       * the same reason the buttons are, and why 13.326 exists at all.
       */
      /* 13.292, EXTENDED TO PHONE (round 2c) — and the sentence above that said
       * "Phone and email need no provider and stay unconditional" was the next
       * one to go false. Phone needed a provider all along: `selectOtpSender()`
       * returns a `NullOtpSender` that refuses every code with 501, so the tab
       * the screen OPENED ON was the third dead control on this page. Email
       * link is the one genuinely unconditional method, and it is what this
       * suite sees — because the stub registered before the first navigation
       * fixes the answer at "nothing configured". It used to say this suite's
       * dev server "answers no `/v1/auth/methods` at all", which was false: it
       * proxies to whatever is on the API port. See that stub for the
       * measurement. */
      await expect(page.getByLabel('Email')).toBeVisible();
      await expect(page.getByRole('tablist', { name: 'Sign-in method' })).toHaveCount(0);

      /* BOTH HALVES DRIVE THE ANSWER, and the negative one has to — MEASURED,
       * not suspected.
       *
       * This half used to rely on the suite's own server, and it was a check
       * that COULD NOT FAIL.
       *
       * ~~"This suite runs `next dev` with no API behind it, so
       * `/v1/auth/methods` never resolves, the page's availability state stays
       * `null`, and NOTHING renders whatever the gate does."~~ **STRUCK
       * 2026-09-08, and struck rather than deleted because it was relied on.**
       * `next.config.ts` rewrites `/v1/*` to the API origin, so this suite's own
       * dev server PROXIES to whatever is listening on the API port — the
       * developer's compose stack, in practice. The request resolves, and on
       * 2026-09-08, once the owner configured Google, it resolved to
       * `google: true` and this page rendered a real social button. The state is
       * now pinned by a `page.route` registered before the first navigation; see
       * that stub for the measurement.
       *
       * The rest of this paragraph stands and is why the block exists: a
       * mutation that dropped the provider check and rendered the row on any
       * answer left all three viewports GREEN — run, seen, recorded.
       *
       * With the empty answer supplied, the page HAS an answer, the gate is the
       * only thing between it and the DOM, and that same mutation reddens. */
      await page.route('**/v1/auth/methods', (route) =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ google: false, apple: false, phone: false }),
        }),
      );
      await page.reload({ waitUntil: 'networkidle' });

      /* 13.334 — WITH THE SERVER SAYING PHONE CANNOT WORK, THE PAGE OFFERS
       * NEITHER THE TAB NOR THE FORM, at every viewport this suite runs.
       *
       * The Email field is asserted FIRST and it is what makes the zero counts
       * below mean anything: a positive, awaited signal that the answer arrived
       * and the page re-rendered against it. Without it a blank document
       * satisfies every `toHaveCount(0)` here — exactly the failure the block
       * below was written to fix, reintroduced by asserting only absences.
       *
       * Mutation witnessed: rendering the control unconditionally (dropping
       * `phoneAvailable ?` in `sign-in/page.tsx`) reddens this at all three
       * viewports. */
      await expect(page.getByLabel('Email')).toBeVisible();
      await expect(page.getByRole('tablist', { name: 'Sign-in method' })).toHaveCount(0);
      await expect(page.getByRole('tab', { name: 'Phone' })).toHaveCount(0);
      await expect(page.getByLabel('Phone number')).toHaveCount(0);

      await expect(page.getByRole('button', { name: 'Continue with Google' })).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Continue with Apple' })).toHaveCount(0);
      /* Final whole-branch review (C1) — THE SAME TRAP AS 13.292's OWN HISTORY,
       * sprung a second time in this file: this line read
       * `…'Sign in with a passkey' }).toHaveCount(0)` until the account/
       * help-screens plan's Task 8 put the button back (registration now exists
       * on `/account`), which made this assertion flatly false the moment that
       * commit landed — this suite is not in the turbo gate, so nothing reddened
       * for it. `apps/web/e2e/smoke.spec.ts` hit the identical defect and was
       * already fixed; this file just sat outside that fix's grep scope
       * (`apps/web/e2e/`, not `apps/web/e2e-viewport/`). The assertion below is
       * the sharpest one this block can make: with the server answering
       * `{google:false, apple:false, phone:false}`, every method GATED on that
       * answer (Google, Apple, the social marks row) is asserted absent above,
       * and the passkey button surviving that same all-refused answer is the
       * whole property — a passkey needs no provider and no server capability
       * check, so it is deliberately NOT gated on `/v1/auth/methods`. */
      await expect(page.getByRole('button', { name: 'Sign in with a passkey' })).toBeVisible();
      await expect(page.locator('.gn-sign-in__marks')).toHaveCount(0);
      await page.unroute('**/v1/auth/methods');

      /* 13.335 — AND WITH A DEPLOYMENT THAT CAN DELIVER, THE TAB IS BACK AND
       * PHONE IS THE DEFAULT.
       *
       * This is the half that stops 13.334 being satisfied by deleting phone
       * sign-in altogether. `page.route` supplies the answer the real dev server
       * cannot, the same instrument the social half needed and for the same
       * reason: a suite with no API behind it cannot tell "gated correctly"
       * from "gone".
       *
       * The Phone FORM is asserted, not just the tab — a selected tab sitting
       * over the email form is a state this page could reach if `method` were
       * stored rather than derived, and it is the exact bug the derivation makes
       * unreachable.
       *
       * Mutation witnessed: forcing `method` to `'email'` reddens this and
       * leaves 13.334 green. */
      await page.route('**/v1/auth/methods', (route) =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ google: false, apple: false, phone: true }),
        }),
      );
      await page.reload({ waitUntil: 'networkidle' });
      const list = page.getByRole('tablist', { name: 'Sign-in method' });
      await expect(list.getByRole('tab', { name: 'Phone' })).toBeVisible();
      await expect(list.getByRole('tab', { name: 'Email link' })).toBeVisible();
      await expect(page.getByLabel('Phone number')).toBeVisible();
      /* THE `phone: true` STUB STAYS ACTIVE FROM HERE TO THE END OF THIS TEST,
       * and removing it is what hung the first run of this file.
       *
       * `unroute` followed by `reload({ waitUntil: 'networkidle' })` leaves
       * `/v1/auth/methods` unanswered — this suite has no API behind it — so
       * networkidle never arrives and the test sits until it times out. It also
       * put the page back on the email-only rendering, which every assertion
       * below needs tabs for. Each route in this suite is its own test, so the
       * stub cannot leak sideways. */

      /* The token the email field keeps for Task 12, asserted as a fact about
       * the DOM. The conditional-mediation REQUEST is deferred (it spends the
       * shared `auth:` budget on a flow no user can complete — see
       * `app/sign-in/page.tsx`), but this half costs nothing and must already be
       * in place when Task 12 switches mediation on alongside registration. */
      await list.getByRole('tab', { name: 'Email link' }).click();
      await expect(page.locator('input[type="email"]')).toHaveAttribute(
        'autocomplete',
        'username webauthn',
      );
      await list.getByRole('tab', { name: 'Phone' }).click();
      // Phone is the DEFAULT where phone can work, and this case's own name says
      // so — added because review found the claim unasserted.
      //
      // The mutation this comment used to name no longer exists: there is no
      // `useState<Method>('phone')` to flip, because `method` is now DERIVED
      // (`phoneAvailable ? (chosen ?? 'phone') : 'email'`). The equivalent
      // mutation is forcing that expression to `'email'`, and it reddens 13.335
      // above as well as this line. The old note is kept in spirit because its
      // lesson stands: the previous version of this property was caught only by
      // an unnamed vitest case that typed into "Phone number" without clicking
      // the tab — it held the default by accident, and a property held by
      // accident is one nobody can find when it breaks.
      await expect(list.getByRole('tab', { name: 'Phone' })).toHaveAttribute(
        'aria-selected',
        'true',
      );

      // 13.294 — the prototype's Password tab does not exist and must never appear.
      // auth.ts:84 sets emailAndPassword { enabled: false } with "the spec forbids passwords".
      await expect(list.getByRole('tab', { name: 'Password' })).toHaveCount(0);

      /* 13.321 — the sheet is centred in the viewport, both halves.
       *
       * MEASURED FROM THE LIVE BOX, not from the computed style. Asserting
       * `justify-content === 'center'` would pass on a page where the rule
       * applies to a container that is not full height, which is precisely the
       * bug the owner reported: `.gn-sign-in` was already `margin: 3rem auto`
       * and therefore already horizontally centred — what was wrong was the
       * VERTICAL axis, and no declaration on its own tells you which axis a
       * reader sees.
       *
       * TWO INDEPENDENT PROPERTIES, because either alone passes on a broken
       * page. A full-height container with the content at the top satisfies the
       * height check; a shrink-to-fit container satisfies the symmetry check
       * trivially, since its own padding is all the space there is.
       *
       * The tolerance is 2px for sub-pixel layout rounding, not for slack: at
       * every one of the three viewports the sign-in content is well under half
       * the viewport height (~565px of 844/1024/982), so a genuinely centred
       * sheet lands within a pixel and a top-aligned one is out by hundreds.
       */
      const centring = await page.evaluate(() => {
        const main = document.querySelector('main.gn-shell--centred');
        if (main === null) return null;
        const box = main.getBoundingClientRect();
        const children = Array.from(main.children).map((child) =>
          child.getBoundingClientRect(),
        );
        if (children.length === 0) return null;
        return {
          mainHeight: box.height,
          viewportHeight: window.innerHeight,
          childCount: children.length,
          spaceAbove: Math.min(...children.map((c) => c.top)) - box.top,
          spaceBelow: box.bottom - Math.max(...children.map((c) => c.bottom)),
        };
      });
      if (centring === null) {
        throw new Error(
          '13.321: /sign-in has no `main.gn-shell--centred` with children. The centring ' +
            'modifier is what the owner asked for; without it this case measures nothing ' +
            'and would otherwise report a symmetric zero.',
        );
      }
      expect(
        centring.mainHeight,
        `13.321: the sign-in main is ${centring.mainHeight}px tall in a ` +
          `${centring.viewportHeight}px viewport, so there is nothing to centre WITHIN. ` +
          'The `min-height: 100dvh` half of the rule is gone.',
      ).toBeGreaterThanOrEqual(centring.viewportHeight - 1);
      expect(
        Math.abs(centring.spaceAbove - centring.spaceBelow),
        `13.321: the sheet sits ${Math.round(centring.spaceAbove)}px from the top and ` +
          `${Math.round(centring.spaceBelow)}px from the bottom of a full-height main ` +
          `(${centring.childCount} children). It is anchored, not centred.`,
      ).toBeLessThanOrEqual(2);

      // 13.293 — the adopted helper text is on the Email method only.
      await list.getByRole('tab', { name: 'Email link' }).click();
      await expect(
        page.getByText("We’ll email you a link that signs you in. It expires in 15 minutes."),
      ).toBeVisible();
      await list.getByRole('tab', { name: 'Phone' }).click();
      await expect(
        page.getByText("We’ll email you a link that signs you in. It expires in 15 minutes."),
      ).toHaveCount(0);

      /* 13.292, the POSITIVE direction — the server's answer DRIVEN rather than
       * its environment set, per the controller's ruling of 2026-09-08.
       *
       * Everything above ran against this suite's own dev server, which has no
       * credentials, so it proves only that nothing renders when nothing is
       * configured. That half alone cannot tell *gated correctly* from *the row
       * was deleted*. `page.route` fulfils `/v1/auth/methods` with
       * `google: true`, and the reload is what makes the page ask again — the
       * availability request fires once, on mount.
       *
       * `toHaveCount(1)` rather than `toBeVisible`: two controls sharing an
       * accessible name would satisfy visibility and would be a real defect.
       */
      await page.route('**/v1/auth/methods', (route) =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ google: true, apple: false }),
        }),
      );
      await page.reload({ waitUntil: 'networkidle' });
      const googleMark = page.getByRole('button', { name: 'Continue with Google' });
      await expect(googleMark).toHaveCount(1);
      await expect(googleMark).toBeVisible();
      // Icon-only: the accessible name comes from `aria-label`, not from text.
      // A button that had kept its words would satisfy the locator above.
      await expect(googleMark).toHaveText('');
      // Apple stays off because the SAME answer said so, which is what makes
      // this a test of the gate rather than of the fetch.
      await expect(page.getByRole('button', { name: 'Continue with Apple' })).toHaveCount(0);
      await page.unroute('**/v1/auth/methods');
    }

    /* ── 5. COMPUTED CONTRAST FROM THE LIVE DOM. ──────────────────────────*/
    expect
      .soft(
        contrast.offenders,
        `live-DOM contrast failures at ${spec.width}px (composited over the real painted ` +
          `backdrop, unlike packages/ui/test/tokens.test.ts which ignores alpha by design): ` +
          `${JSON.stringify(contrast.offenders)}`,
      )
      .toEqual([]);
  });
}

/**
 * `/` — a redirect assertion and nothing more.
 *
 * `app/page.tsx` is four lines whose entire body is `redirect('/workspaces')`.
 * Measured: `GET /` answers 307 with `Location: /workspaces`. `/workspaces` is
 * one of the thirteen routes that need an authed stack, so this test asserts
 * where `/` GOES and stops. Measuring `/workspaces`'s unauthenticated layout and
 * filing the numbers under `/` would be reporting coverage this suite does not
 * have.
 */
test('/ redirects to /workspaces and renders no layout of its own', async ({ page }, testInfo) => {
  const response = await page.goto('/', { waitUntil: 'domcontentloaded' });
  expect(response, 'no response for /').toBeTruthy();
  expect(new URL(page.url()).pathname).toBe('/workspaces');
  // The viewport gate still runs — a redirect measured at the wrong width would
  // be just as untrustworthy, and this proves the gate is reachable on a route
  // that renders no `.gn-shell` of its own.
  await assertViewportTookEffect(page, testInfo);
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE CROSS-WIDTH TEST — the only place a COMPARISON actually happens
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Everything above asserts per-project equalities, and those live in SEPARATE
 * RUNS. Nothing in a per-project assertion can tell you that 390 and 1512 laid
 * out differently — it can only tell you each matched its own expectation, and
 * a stylesheet with every media query deleted would still satisfy... well, no,
 * it would fail. But that is the point worth being precise about: the equalities
 * are only discriminating because the expected values were traced to real
 * declarations. If a future edit moved a breakpoint and someone updated the
 * expectations to match, the suite would stay green while having stopped
 * measuring responsiveness.
 *
 * This test cannot be repaired that way. It opens all three widths in ONE body,
 * on ONE browser, and asserts the readings DIFFER. It does not care what the
 * values are. A page that reports the right innerWidth and lays out identically
 * anyway — the precise shape of the recorded `resize_window` failure — fails
 * here and passes everything else.
 *
 * It runs in one project only (a `test.skip` guard) because it drives its own
 * contexts and would otherwise repeat itself three times.
 */
test('layouts at 390, 768 and 1512 are measurably DIFFERENT, not just each self-consistent', async ({
  browser,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'desktop-1512',
    'drives its own contexts; runs once, from one project',
  );

  /**
   * One reading at one width, from a context this test creates itself.
   *
   * The took-effect gate is re-applied per context, and it has to be: these
   * contexts are NOT the project's, so a project-level assertion says nothing
   * about them. A cross-width test whose three contexts all silently came up
   * 1280px wide would compare three identical readings and — being an
   * INEQUALITY test — fail loudly rather than pass. That is the right
   * direction, but the message would blame the stylesheet for a viewport fault,
   * so the width is asserted here to name the real cause.
   */
  const readAt = async (name: ViewportName): Promise<{ inner: number; sig: Signature }> => {
    const spec = VIEWPORTS[name];
    const context = await browser.newContext({
      viewport: { width: spec.width, height: spec.height },
    });
    try {
      const page = await context.newPage();
      // The 404 carries BOTH discriminators — `.gn-shell` (60rem) and
      // `.gn-notfound__*` (40rem) — so one route separates all three widths.
      await page.goto('/no-such-page-e2e-viewport-probe', { waitUntil: 'networkidle' });
      const inner = await page.evaluate(() => window.innerWidth);
      expect(
        inner,
        `cross-width test: context configured at ${spec.width}px reports innerWidth=${inner}. ` +
          `The comparison below would compare two identical widths and call them different widths.`,
      ).toBe(spec.width);
      return { inner, sig: await measureSignature(page) };
    } finally {
      await context.close();
    }
  };

  const phone = await readAt('phone-390');
  const tablet = await readAt('tablet-768');
  const desktop = await readAt('desktop-1512');

  // eslint-disable-next-line no-console
  console.log(
    `[cross-width] readings: ${JSON.stringify({ phone, tablet, desktop }, null, 2)}`,
  );

  // 60rem separates {390, 768} from {1512}: shell padding.
  expect(
    phone.sig.shellPaddingLeft,
    `.gn-shell padding-left is IDENTICAL at 390px and 1512px ` +
      `(${String(phone.sig.shellPaddingLeft)}px both). The (max-width: 60rem) query at ` +
      `globals.css:17 did not apply. This is what "the viewport reported success and ` +
      `changed nothing" looks like from the layout side.`,
  ).not.toBe(desktop.sig.shellPaddingLeft);
  expect(tablet.sig.shellPaddingLeft).not.toBe(desktop.sig.shellPaddingLeft);
  expect(
    tablet.sig.shellPaddingLeft,
    '768 and 390 are both inside (max-width: 60rem) and must agree on shell padding',
  ).toBe(phone.sig.shellPaddingLeft);

  // 40rem separates {390} from {768, 1512}: title size and stacked actions.
  expect(
    phone.sig.titleFontSize,
    `.gn-notfound__title font-size is IDENTICAL at 390px and 768px ` +
      `(${String(phone.sig.titleFontSize)}px both). The (max-width: 40rem) query at ` +
      `globals.css:2241 did not apply.`,
  ).not.toBe(tablet.sig.titleFontSize);
  expect(
    phone.sig.notFoundActionsDirection,
    `.gn-notfound__actions flex-direction is IDENTICAL at 390px and 768px ` +
      `("${String(phone.sig.notFoundActionsDirection)}" both). globals.css:221 did not apply.`,
  ).not.toBe(tablet.sig.notFoundActionsDirection);
  expect(
    tablet.sig.titleFontSize,
    '768 and 1512 are both outside (max-width: 40rem) and must agree on title size',
  ).toBe(desktop.sig.titleFontSize);

  // And the content box itself must widen. This one is engine-level rather than
  // media-query-level: it would catch a fixed-width layout that ignored the
  // viewport entirely even if every media query still fired.
  expect(
    phone.sig.shellContentWidth,
    `.gn-shell rendered at the SAME WIDTH at 390px and 1512px ` +
      `(${String(phone.sig.shellContentWidth)}px both) — the layout is not fluid at all.`,
  ).not.toBe(desktop.sig.shellContentWidth);
  expect(desktop.sig.shellContentWidth ?? 0).toBeGreaterThan(phone.sig.shellContentWidth ?? 0);
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TWO ROUTES THAT NEED THEIR ANSWER SUPPLIED — /workspaces and /invite/<token>
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Each is its OWN top-level block rather than a row in `UNAUTHED_ROUTES`, and
 * that is a decision rather than a convenience. The loop at :548 drags the
 * tap-target, type-scale and accessible-name SWEEPS across every route it
 * names, and those sweeps write ratcheted baselines; `/invite/<token>` would
 * additionally render its DEAD-LINK branch in all of them, so the baseline
 * would record a page nobody ships.
 *
 * Both stubs are registered BEFORE THE FIRST NAVIGATION, and neither block
 * reloads or unroutes. Both halves of that are load-bearing:
 *
 *  - `next.config.ts` rewrites `/v1/*` to the API origin, so an UNSTUBBED read
 *    proxies to whatever compose stack the developer happens to be running and
 *    the case silently measures that machine. That is exactly how a live Google
 *    credential reached the accessible-names baseline on 2026-09-08.
 *  - `unroute` followed by `reload({ waitUntil: 'networkidle' })` leaves the
 *    request unanswered and networkidle never arrives — the recorded stall.
 *    Each test owns its own page, so a stub registered here cannot leak
 *    sideways and never needs removing.
 */

/**
 * 13.299 — `/workspaces` WITH THE ROSTER ANSWERING AN EMPTY LIST.
 *
 * THE POSITIVE CONTROL IS THE EMPTY-STATE SENTENCE, AND IT MUST STAY FIRST.
 * `<FoundingForm />` renders OUTSIDE all four branches of this page — loading,
 * expired, refusal and list alike, deliberately, so that a person who cannot be
 * told which workspaces they are in can still found one. "Create workspace" is
 * therefore visible on a page that never received an answer at all, and
 * asserting it first would establish nothing about the stub. The empty-state
 * sentence is the ONLY thing on this screen gated on `[]`, which is what makes
 * it the control. Reordering these two assertions destroys that.
 *
 * THE `<h1>` IS DELIBERATELY NOT ASSERTED. It renders
 * `Workspaces — {user.name}` from a better-auth session request that
 * `next.config.ts` proxies to the same stack, so its text is whichever
 * developer happens to be signed in on the machine running the suite. Pinning
 * it would re-commit the 2026-09-08 defect in a new place.
 *
 * PREDICTED RED under two mutations — PREDICTED, **not witnessed**: this suite
 * needs a running dev server and starting one is the orchestrator's job, so
 * nothing below has been executed by its author. Deleting the
 * `workspaces.length === 0` arm reddens the first assertion; deleting
 * `<FoundingForm />` reddens the second. The orchestrator runs both.
 *
 * 13.349 (Task 15, neo restyle) — this test, 13.298 and 13.300 are UNCHANGED
 * and still green: the three-state machine they pin (loading / refusal /
 * empty, and the 401 settle on `/sign-in`) survives a CSS-only restyle whose
 * only markup edit on this page is additive (13.357's role label, inside the
 * populated-list branch none of these three states reach).
 */
test('13.299 — /workspaces with an EMPTY roster renders the empty state and the founding form', async ({
  page,
}, testInfo) => {
  // THE BODY IS `{ workspaces: [] }`, NOT `[]`, and the difference is the whole
  // case. `mapWorkspaceRefs` calls `asRecord(raw, 'workspaces')` FIRST
  // (`packages/app-core/src/online/mappers.ts:1035`), so a bare array throws a
  // MappingError before it can ever mean "no workspaces" — and the page renders
  // `ShellRefusal` for that, not the empty state.
  //
  // Written as `[]` first and MEASURED: 3 viewports RED, "element(s) not found"
  // for the empty-state sentence, because what actually rendered was the refusal
  // panel. This case was authored PREDICTED-not-witnessed and the prediction was
  // wrong — which is the argument for running one of these before believing it.
  // Note WHICH WAY it failed: the stub drove the ERROR branch while claiming to
  // test the EMPTY branch, and only the positive control's specificity caught
  // it. A looser assertion — "the founding form is present", say — would have
  // passed on the refusal screen and printed a green tick over the wrong page.
  await page.route('**/v1/me/workspaces', (apiRoute) =>
    apiRoute.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ workspaces: [] }),
    }),
  );
  // Task 17's banner reads this from `/workspaces` too, and an UNSTUBBED read
  // proxies to whatever compose stack the developer is running — the defect
  // this block's own comment names, and how a live Google credential reached
  // the accessible-names baseline on 2026-09-08. `{invitations: []}` is the
  // common case and the one whose layout this suite should be measuring: the
  // banner renders NOTHING for it, so the baselines stay about the page that
  // ships rather than about a failure line.
  await page.route('**/v1/me/invitations', (apiRoute) =>
    apiRoute.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ invitations: [] }),
    }),
  );

  const response = await page.goto('/workspaces', { waitUntil: 'networkidle' });
  expect(response?.status(), '/workspaces responded unexpectedly').toBe(200);
  // Where the page ENDED UP, not where it was sent. A 401 on this read
  // redirects to `/sign-in` (`useSignInOnExpiredSession`), and every assertion
  // below would then be describing a different page while still passing or
  // failing for reasons of its own.
  expect(new URL(page.url()).pathname).toBe('/workspaces');
  await assertViewportTookEffect(page, testInfo);

  // ── POSITIVE CONTROL. Awaited, and gated on the stubbed `[]`.
  await expect(
    page.getByText('No workspaces yet. Ask an admin for an invite link — or create your own.'),
  ).toBeVisible();
  // `toHaveCount(1)` rather than `toBeVisible`: two submits sharing this
  // accessible name would satisfy visibility and would be a real defect.
  await expect(page.getByRole('button', { name: 'Create workspace' })).toHaveCount(1);
  // Only meaningful AFTER the positive above, and worth having: it separates
  // "answered `[]`" from "never answered", the latter being this page's normal
  // resting state against a server that refuses the read.
  await expect(page.getByText('Loading…')).toHaveCount(0);
});

/**
 * 13.300 — `/invite/<token>` NAMES THE WORKSPACE **AND THE ROLE**.
 *
 * The role is the whole point of the regex. The prototype's version of this
 * sentence drops it, and the copy rule rejects that: a person accepting an
 * invitation is being told what they will be able to do, and "you are invited
 * to join Rongram Range" alone does not say. `(admin|member|guest)` is the
 * shipped `InviteSummary['role']` union
 * (`packages/app-core/src/online/invites.ts`), so the alternation is the type,
 * not a guess.
 *
 * MATCHED ON THE CONTAINER, not on one element, because the sentence is not in
 * one element: `You are invited to join <strong>{workspaceName}</strong> as
 * {role}.` splits it across three text nodes and a `<strong>`. The container is
 * the single `.gn-invite` Card (`Card` forwards `className` onto its root,
 * `packages/ui/src/components/card.tsx:7`) rather than `main`, so `.+` never
 * has to reach across a paragraph boundary.
 *
 * NO SESSION IS STUBBED, and none is needed: `GET /v1/invites/:token` requires
 * no session by the server's own design — the token IS the credential — and the
 * invitation sentence renders above the three-way session branch, so it is on
 * screen for a signed-in, signed-out or still-loading viewer alike. Only the
 * accept affordance below it differs, and this case asserts nothing about that.
 *
 * THE STUBBED BODY MUST SURVIVE `createHttpInviteGateway`, which validates:
 * a non-string `workspaceId`/`workspaceName` or an unrecognised `role` is
 * mapped to `null` and the page then renders its DEAD-LINK branch — a red that
 * would read exactly like a copy regression. Hence the last assertion, which
 * says the dead branch is not what was measured.
 *
 * PREDICTED RED under dropping ` as {invite.role}` from the sentence —
 * PREDICTED, **not witnessed**, for the same reason as 13.299. Stated because
 * it is not obvious: removing the `<strong>` does NOT redden the regex (it
 * reddens only the `strong` assertion), so the two assertions guard different
 * things and neither subsumes the other.
 */
test('13.300 — /invite/<token> body says "You are invited to join <workspace> as <role>."', async ({
  page,
}, testInfo) => {
  const token = 'e2e-viewport-invite-13300';
  await page.route('**/v1/invites/*', (apiRoute) =>
    apiRoute.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        workspaceId: 'ws-13300',
        workspaceName: 'Rongram Range',
        role: 'admin',
      }),
    }),
  );

  const response = await page.goto(`/invite/${token}`, { waitUntil: 'networkidle' });
  expect(response?.status(), `/invite/${token} responded unexpectedly`).toBe(200);
  // The route SEGMENT is half of a contract the server already shipped:
  // `POST /v1/workspaces/:id/invites` mints `${WEB_ORIGIN}/invite/${token}`.
  // Asserting the path stayed put is a free partial guard on the rename this
  // page's own docblock says nothing would notice.
  expect(new URL(page.url()).pathname).toBe(`/invite/${token}`);
  await assertViewportTookEffect(page, testInfo);

  // ── POSITIVE CONTROL. Awaited, and it can only pass once the stubbed summary
  // has arrived and been rendered: the card holds "Checking the invitation…"
  // until then.
  const card = page.locator('.gn-invite');
  await expect(card).toHaveText(/You are invited to join .+ as (admin|member|guest)\./);
  // The name is in the `<strong>`, which the regex above cannot see.
  await expect(card.locator('strong')).toHaveText('Rongram Range');
  // Not the dead-link branch — see the block comment.
  await expect(page.locator('.gn-invite__dead')).toHaveCount(0);
});

/**
 * 13.298 — A 401 ON `/workspaces` LEAVES THE REAL BROWSER SETTLED ON `/sign-in`.
 *
 * ## This case is not what the plan asked for, and the substitution is the point
 *
 * The plan (Task 4b) specified: *`/workspaces` with `page.route` returning 401
 * renders `ExpiredSessionNotice` (`role="status"`, class `gn-shell__expired`)*,
 * mutation *delete the 401 branch → 13.298 RED, **alone***. That case was
 * retired on a measurement, not an argument, and both halves of the retirement
 * matter to anyone tempted to write it again:
 *
 *  1. **It could not have gone red alone.** Deleting the `expired ?` arm from
 *     `app/workspaces/page.tsx` on a committed tree gives `EXIT=1`, 19 pass and
 *     ONE fail, and the failure is a PRE-EXISTING jsdom case —
 *     `apps/web/test/page-refusals.test.tsx:180`, *"Workspaces: a 401 is NOT a
 *     refusal — it sends the viewer to sign in"* — which already asserts
 *     `EXPIRED_SESSION_COPY`, the push, and the absence of the spinner. The
 *     branch was guarded before the plan was written.
 *  2. **It could not have been witnessed HERE at all.** `useSignInOnExpiredSession`
 *     calls `router.push('/sign-in')`, so in a real browser the notice is
 *     transient — the component's own docblock says "for the frame or two
 *     before the router moves". Delete the render arm and the push still fires:
 *     mutant and original both SETTLE on `/sign-in`, and no assertion on a
 *     settled page can separate them. In jsdom the router double never moves,
 *     which is exactly why the case above works and a Playwright twin would not.
 *
 * So the id is spent on the one claim in this area that nothing has ever
 * witnessed: **that the navigation actually happens.** Every existing case
 * asserts `push` was called ON A TEST DOUBLE (`page-refusals.test.tsx:180`
 * awaits `expect(push).toHaveBeenCalledWith('/sign-in')`). That the real
 * Next.js router then moves a real browser to a real page has been assumed by
 * three pages and proven by none. This case is the jsdom case's complement,
 * not its duplicate: that one owns *what is rendered in the interim*, this one
 * owns *where the browser ends up*.
 *
 * ## The mutation — WITNESSED, and it is NOT the pathname assertion that reddens
 *
 * Delete `if (expired) router.push('/sign-in');` from
 * `apps/web/src/expired-session.tsx`. RUN, not predicted: **RED on all three
 * viewports, and on this case alone** — 13.299 and 13.300 stayed green in the
 * same run, so the mutation is specific to what this case names.
 *
 * **An earlier draft of this paragraph said the `pathname` assertion below
 * fails "naming both the expected and the actual route". That is false and the
 * run proved it.** With the push gone the browser sits on `/workspaces`, so the
 * POSITIVE CONTROL at the top of the test — `getByLabel('Email')`, which exists
 * only on `/sign-in` — times out FIRST, and the pathname assertion is never
 * evaluated. What a reader actually sees is a timeout waiting for the Email
 * field. The long diagnostic below is therefore unreachable under THIS
 * mutation; it is kept because it covers a different failure the control cannot
 * see — arriving somewhere that is neither `/workspaces` nor `/sign-in`.
 *
 * Do NOT "fix" that by moving the pathname assertion above the control. Doing
 * so restores the message and destroys the control's own reason for existing,
 * which is the next paragraph. The order is correct; the old sentence was not.
 *
 * ## `?next=` is NOT carried, and that is recorded rather than asserted
 *
 * `useSignInOnExpiredSession` pushes the bare string `'/sign-in'` — no `next`
 * parameter, so an expired session loses the page the person was on and lands
 * them at the workspace list after re-authenticating. `/invite/[token]` DOES
 * carry `?next=` on its own sign-in link, so the product is inconsistent here.
 * That is a CANDIDATE, not a defect this case decides: pinning the current bare
 * form would make the improvement a test change, so the assertion is written to
 * accept either — it checks the PATHNAME only, and the query is left free
 * deliberately. Whoever adds `next=` should tighten this line in that change.
 *
 * ## Why `/v1/auth/methods` is stubbed when this case never looks at sign-in
 *
 * Because the redirect LANDS there and that page reads it. Unstubbed, the read
 * proxies through `next.config.ts` to whatever compose stack is running, which
 * is how a live Google credential reached a baseline on 2026-09-08. Nothing
 * below asserts on it; it is stubbed so this case cannot depend on the machine.
 */
test('13.298 — a 401 on /workspaces settles the REAL browser on /sign-in', async ({
  page,
}, testInfo) => {
  await page.route('**/v1/me/workspaces', (apiRoute) =>
    apiRoute.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'UNAUTHENTICATED' }),
    }),
  );
  // Same reason as 13.299's, and it matters MORE here: this case is about
  // where a 401 SETTLES, and an unstubbed invitations read against a live
  // stack could answer 200 and leave a banner on a page this case asserts has
  // become `/sign-in`.
  await page.route('**/v1/me/invitations', (apiRoute) =>
    apiRoute.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'UNAUTHENTICATED' }),
    }),
  );
  // The page the redirect lands on, pinned so this case measures the product
  // and not the developer's machine. See the block comment.
  await page.route('**/v1/auth/methods', (apiRoute) =>
    apiRoute.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ google: false, apple: false, phone: false }),
    }),
  );

  await page.goto('/workspaces', { waitUntil: 'networkidle' });
  await assertViewportTookEffect(page, testInfo);

  // ── POSITIVE CONTROL FIRST, and it is NOT the redirect. `/sign-in` renders
  // its Email field on every machine whether or not the 401 ever arrived, so
  // the arrival at sign-in cannot be its own evidence — a page that failed to
  // load at all would leave `pathname` at `/workspaces` and read as a clean
  // mutant kill for the wrong reason. The awaited field says the destination
  // actually RENDERED before the pathname below is believed.
  await expect(page.getByLabel('Email')).toBeVisible();

  // ── THE CLAIM. Pathname only — the query is deliberately unpinned, see the
  // `?next=` paragraph above.
  expect(
    new URL(page.url()).pathname,
    'a 401 from /v1/me/workspaces must move the browser to /sign-in. This is the ' +
      'half that page-refusals.test.tsx:180 CANNOT prove: it asserts router.push was ' +
      'called on a test double, and a double that records a call is not a browser ' +
      'that moved. If this fails while that case still passes, the push is firing ' +
      'and the navigation is not.',
  ).toBe('/sign-in');

  // And the interim notice is GONE once settled — the direct evidence that the
  // plan's original case was unwitnessable here, kept as an assertion so the
  // claim in the block comment above is measured rather than merely asserted.
  await expect(page.getByText('Your session has ended. Taking you to sign in…')).toHaveCount(0);
});

/**
 * 13.362 (Round 2d, 2026-09-09) — the derived segmented control, WITNESSED
 * live under `data-style="neo"`, the way Task 14's own 13.347 witnesses a
 * rendered value rather than trusting two numbers that only differ in memory.
 *
 * 13.401 (2026-09-15) is witnessed by the SAME test, at the track-background
 * read below. The owner removed `background: var(--gn-fill-tertiary)` from
 * `.gn-segmented`, and `trackBackground` is the direct measurement that the
 * track paints `rgba(0, 0, 0, 0)` — a claim the `--gn-surface-sunken` read
 * above does not make, since that token is what the SELECTED SEGMENT composes
 * against rather than what the track paints.
 *
 * ## Why this is a STANDALONE test, not another row in the `UNAUTHED_ROUTES` loop
 *
 * That loop's `/v1/auth/methods` stub is DELIBERATELY `phone:false` (see the
 * block comment above it) so the `/sign-in` accessible-names baseline stays
 * machine-independent — a signed-out ratchet the loop itself re-asserts on
 * every run. Rendering the segmented control (`role=tablist` plus two
 * `role=tab`s, `aria-selected` on each) inside that loop would ADD `role`/
 * `ariaSelected`/`ariaLabel` counts to the exact sweep that ratchet reads,
 * moving a baseline this task's own catalogue entry (13.363) claims is
 * unchanged. This test answers `phone:true` on its OWN page, outside that
 * loop, so it proves nothing about — and cannot regress — that ratchet.
 *
 * This suite passing (with this case among the rest) is half of 13.364,
 * "both viewport suites pass" — `../e2e-stack/viewport.spec.ts` is the other.
 *
 * ## Why this is real-browser Playwright, not a jsdom render
 *
 * `getComputedStyle(...).getPropertyValue('--gn-…')` returns the EMPTY STRING
 * in `@testing-library/react` + jsdom, because jsdom never parses or applies
 * the `<style>` tag `layout.tsx` inlines — there is no cascade to resolve a
 * custom property against. An assertion built on that would pass whether the
 * token pipeline wired anything correctly or not, which is exactly the
 * "check that cannot fail" shape this project's own incident catalogue
 * (`MEMORY.md`'s `checks-that-cannot-fail.md`) warns about. A real Chromium
 * page (this suite already boots one per viewport project) genuinely
 * resolves the cascade, so `2c`'s ruling stands unrelated to this: `phone`
 * here is STILL fully derived from the stubbed `/v1/auth/methods` response,
 * exactly as production derives it from the real one — this test only
 * changes what the STUB answers, not the page's own logic.
 */
test('13.362 — the segmented control, driven to phone:true, renders under neo\'s own tokens', async ({
  page,
}, testInfo) => {
  await page.route('**/v1/auth/methods', (apiRoute) =>
    apiRoute.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ google: false, apple: false, phone: true }),
    }),
  );

  await page.goto('/sign-in', { waitUntil: 'networkidle' });
  await assertViewportTookEffect(page, testInfo);

  // ── POSITIVE CONTROL FIRST. `layout.tsx`'s pre-paint script applies
  // `data-style="neo"` whenever nothing is stored (case 13.345) — this run
  // sets nothing, so this assertion should hold trivially, but it is the
  // fact every assertion below is CONDITIONED on: reading `neo`'s own token
  // values means nothing if the page silently rendered `hig`.
  const style = await page.evaluate(() => document.documentElement.dataset['style']);
  expect(style, 'this witness only means something if the page actually rendered under neo').toBe('neo');

  // ── The control actually rendered, driven by the stubbed answer — the same
  // property 3.84/13.348 already pin, re-asserted here because it is the
  // precondition for everything that follows.
  const tablist = page.getByRole('tablist', { name: 'Sign-in method' });
  await expect(tablist).toBeVisible();
  const phoneTab = page.getByRole('tab', { name: 'Phone' });
  const emailTab = page.getByRole('tab', { name: 'Email link' });
  await expect(phoneTab).toBeVisible();
  await expect(emailTab).toBeVisible();
  await expect(phoneTab).toHaveAttribute('aria-selected', 'true');
  await expect(emailTab).toHaveAttribute('aria-selected', 'false');

  // ── DECLARED value: the token pipeline resolved NEO's own values, not
  // hig/minimal's. Read from a root custom property, the same technique
  // `assertViewportTookEffect` already uses for `--gn-surface`.
  //
  // This reads `--gn-surface-sunken` and NOT `--gn-fill-tertiary` as of
  // 2026-09-15. `fillTertiary` was the segmented TRACK's background and the
  // owner has removed it ("the background also needs to be removed from the
  // tablist"), so asserting it here would have gone on passing while naming a
  // property this component no longer has — a check still green about a thing
  // that stopped existing. `surfaceSunken` is what the pressed segment's own
  // shadow composes against, so it is the token this control actually depends
  // on now.
  // The LIGHT arm's value: this project sets no `colorScheme`, so the run is
  // light and `#f1eae3` is `colorOf('light', 'surfaceSunken', 'neo')`. Written
  // as the literal the way the `fillTertiary` assertion it replaces was — and
  // worth naming, because the first draft asserted the DARK hex (`#141a2e`)
  // from memory and reddened on all three viewports. It is also exactly the
  // reference's own `--segOnBg` for neo light, which is the cross-check that
  // this is the right token rather than merely a passing one.
  //
  // 2026-09-18 (Step 2c-1, T5): this literal moved `#ede4db` -> `#f1eae3` with
  // `neoPaper`. The cross-check it rests on is what makes the move safe to
  // make here: the refreshed export's own `--segOnBg` for neo light is
  // `#F1EAE3` too, so the two are still byte-for-byte equal and the assertion
  // still names the same property. Had only one side moved, this would be a
  // real regression rather than a re-pin.
  const surfaceSunken = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--gn-surface-sunken').trim(),
  );
  expect(
    surfaceSunken,
    'the page should have resolved neo\'s own surfaceSunken, not hig/minimal\'s',
  ).toBe('#f1eae3');

  // ── And the track really carries no fill of its own, which is the owner's
  // change rather than an absence that was always there.
  const trackBackground = await tablist.evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(
    trackBackground,
    `the tablist track should paint no background of its own; got ${trackBackground}`,
  ).toBe('rgba(0, 0, 0, 0)');

  // ── RENDERED value, on the actual selected tab element, not just the root
  // custom property — the same "declared vs. witnessed" gap 13.347's own
  // docblock names.
  //
  // ═══════════════════════════════════════════════════════════════════════
  // OWNER ROUND 5 (2026-09-16, case 13.412) — A DEDICATED `selected` ROLE,
  // NOT `sunken` BORROWED FROM ANOTHER COMPONENT
  // ═══════════════════════════════════════════════════════════════════════
  //
  // The history: owner, 2026-09-15, "the active one had a sunken style... i
  // want it to follow that" — approximated at the time by pointing `neo` at
  // the existing `sunken` role (`inset 4px 4px 9px`), which is what this
  // test used to pin. The reference gives this control FIVE `--segOnShadow`
  // values split on the style axis (`design-system/interactive/desktop.dc.html`):
  // a drop shadow under `hig`, `none` under `minimal`, and `inset` pairs
  // under `neo` — and `neo`'s own geometry is `inset 3px 3px 6px`, which
  // `sunken`'s `4px 4px 9px` never actually matched. Owner round 5 replaced
  // the two-role approximation with a dedicated fifth `ShadowRole`,
  // `selected` (`tokens.ts`'s `SHADOWS` table), so the pinned offsets below
  // moved from `sunken`'s geometry to `selected`'s own.
  //
  // THIS CASE IS THE REASON THE ORIGINAL MISMATCH WAS CAUGHT AT ALL. The
  // 2026-09-15 change was committed (810d8470) with a note claiming nothing
  // in the suite read a computed style on this component; this test does,
  // and reddened on all three viewports. The claim was wrong and the run
  // said so before anything shipped further — which is the whole argument
  // for witnessing a rendered value rather than trusting the source.
  //
  // Still discriminating by SHAPE rather than by mere non-'none'-ness:
  // `hig`'s and `minimal`'s `selected` both resolve to values with no
  // `inset` / to `'none'` (`tokens.ts`'s `SHADOWS` table), so the `inset`
  // keyword plus these offsets can only appear under `neo`.
  // `.split(',').length >= 2` was tried in an earlier revision and is WRONG
  // for the same reason it always was: `getComputedStyle` renders each
  // layer's colour as `rgba(r, g, b, a)`, which itself contains commas, so
  // counting commas proves nothing about layer count. The offsets come from
  // `SHADOWS.neo.<theme>.selected`: `inset 3px 3px 6px` +
  // `inset -3px -3px 6px`, identical in both themes.
  const selectedTabShadow = await phoneTab.evaluate((el) => getComputedStyle(el).boxShadow);
  expect(selectedTabShadow, `rendered box-shadow: ${selectedTabShadow}`).toContain('inset');
  expect(selectedTabShadow, `rendered box-shadow: ${selectedTabShadow}`).toContain('3px 3px 6px');
  expect(selectedTabShadow, `rendered box-shadow: ${selectedTabShadow}`).toContain('-3px -3px 6px');
  // The old raised geometry, AND the old (approximated) sunken geometry this
  // case used to pin, must both be GONE — without these, a rule emitting any
  // of them alongside the real one would satisfy the lines above.
  expect(selectedTabShadow, `rendered box-shadow: ${selectedTabShadow}`).not.toContain('7px 7px 16px');
  expect(selectedTabShadow, `rendered box-shadow: ${selectedTabShadow}`).not.toContain('4px 4px 9px');
});
