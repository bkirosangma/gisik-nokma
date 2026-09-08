import { expect, test, type Page, type TestInfo } from '@playwright/test';
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
  helpTabsDirection: string | null;
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
 *     25.6px (`1.6rem`)  — apps/web/app/globals.css:69-74
 *     21.6px (`1.35rem`) — apps/web/app/globals.css:219-220, under (max-width: 40rem)
 *
 *   `.gn-notfound__actions` flex-direction
 *     row    — apps/web/app/globals.css:116-121
 *     column — apps/web/app/globals.css:221, under (max-width: 40rem)
 *
 *   `.gn-help__tabs` flex-direction
 *     row    — packages/ui/src/ui.css:1277
 *     column — packages/ui/src/ui.css:1311-1312, under (max-width: 40rem)
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
      helpTabsDirection: read('.gn-help__tabs', (_el, cs) => cs.flexDirection),
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
      // globals.css:73 (1.6rem) vs globals.css:219-220 (1.35rem)
      expect
        .soft(
          sig.titleFontSize,
          `title font-size at ${spec.width}px: (max-width:40rem)=${String(spec.narrow40rem)} ` +
            `implies ${spec.narrow40rem ? 21.6 : 25.6}px (globals.css:73 / :219-220)`,
        )
        .toBeCloseTo(spec.narrow40rem ? 21.6 : 25.6, 1);
    }
    if (sig.helpTabsDirection !== null) {
      // ui.css:1277 (row) vs ui.css:1311-1312 (column)
      expect
        .soft(sig.helpTabsDirection, `.gn-help__tabs flex-direction (ui.css:1277 / :1311-1312)`)
        .toBe(spec.narrow40rem ? 'column' : 'row');
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

    /* ── 3. TAP TARGETS >= 44x44 — A RATCHET, NOT A FLOOR. ────────────────*/
    /**
     * This started as `.toEqual([])` and reddened 15 of 21 cases. The reading is
     * real — every table-of-contents link on `/help` is 23px tall, 10 of them at
     * 390px and 16 at the wider widths, plus 6 on `/sign-in` — but three things
     * about it decide the shape of the assertion rather than its truth:
     *
     * 1. **It fails IDENTICALLY at 390, 768 and 1512.** A number that does not
     *    move with the viewport is not a responsive finding, and item 7 is the
     *    responsive item. It is a type-and-spacing decision that happens to be
     *    visible here.
     * 2. **Most offenders miss by one to three pixels** (21–23px against WCAG
     *    2.5.8's 24, or against 2.5.5's 44), and they are wide — `312x23` table
     *    -of-contents links, not small targets. Raising them is a design pass
     *    over `packages/ui`, with product-wide blast radius.
     * 3. **The pre-launch checklist already records this as an OWNER decision**,
     *    with the numbers, alongside the non-text-contrast finding. Asserting a
     *    hard floor here would have this suite block every branch on a decision
     *    that has been deliberately deferred to a person.
     *
     * So it ratchets: the count may FALL and may not RISE. The measurement stays
     * in code with its real numbers, a new sub-44px control reddens immediately,
     * and the standing debt does not hold the gate hostage. Same pattern as
     * `check:citations`, which this repo already runs as an exact ratchet.
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
          `interactive targets under 44x44 at ${spec.width}px rose above the recorded baseline ` +
            `${allowed} for ${tapKey} (WCAG 2.5.5; the repo's own min-height: 2.75rem at ` +
            `ui.css:1250 is the same number). This is a RATCHET — the count may fall, never rise. ` +
            `Offenders: ${JSON.stringify(taps.offenders)}`,
        )
        .toBeLessThanOrEqual(allowed);
    }

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
       * that COULD NOT FAIL. This suite runs `next dev` with no API behind it,
       * so `/v1/auth/methods` never resolves, the page's availability state
       * stays `null`, and NOTHING renders whatever the gate does. A mutation
       * that dropped the provider check and rendered the row on any answer left
       * all three viewports GREEN — run, seen, and the reason this block exists.
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
      await expect(page.getByRole('button', { name: 'Sign in with a passkey' })).toHaveCount(0);
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
      `globals.css:219-220 did not apply.`,
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
