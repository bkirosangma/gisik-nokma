/**
 * ONE origin for every viewport number in this suite.
 *
 * `playwright.viewport.config.ts` builds its `projects[]` from this table and
 * `responsive.spec.ts` reads the SAME table to decide what width the page is
 * supposed to report. That is not tidiness — it is the only reason the
 * took-effect assertion cannot rot into a tautology. If the expected width
 * lived in the spec as a literal and the project's width lived in the config as
 * another literal, the two could drift apart and the assertion would still be
 * green while measuring the wrong thing.
 *
 * The spec goes one step further and cross-checks this table against
 * `testInfo.project.use.viewport` — the width Playwright ACTUALLY configured —
 * so a project that silently lost its `viewport` override reddens rather than
 * quietly measuring a default.
 */

/**
 * The port. NOT 3001, and that is the whole point.
 *
 * `playwright.config.ts` and `playwright.stack.config.ts` both target 3001, and
 * the stack config's docblock spells out the hazard: a `webServer` with
 * `reuseExistingServer: true` on 3001 will ADOPT whatever is listening there and
 * report coverage of a thing it never started.
 *
 * That hazard is not hypothetical on this machine. Measured 2026-09-07, while
 * writing this file:
 *
 *     $ lsof -nP -iTCP:3001 -sTCP:LISTEN
 *     com.docke   805 kiro  220u  IPv6 ...  TCP *:3001 (LISTEN)
 *     $ docker ps
 *     gisik-nokma-dev-web-1   0.0.0.0:3001->3000/tcp   Up 23 minutes
 *
 * The compose web container held 3001. A viewport suite pointed at 3001 with
 * `reuseExistingServer: true` would have measured that container's build — a
 * different tree from the working copy — and called it a reading of this repo.
 *
 * So: a dedicated port, and `reuseExistingServer: false` in the config. False is
 * the load-bearing half. It means that if something IS already on 3021 the run
 * FAILS ("http://127.0.0.1:3021 is already used") instead of adopting a
 * stranger. A loud stop is the correct answer to an ambiguous port; a silent
 * adoption is the failure this whole file exists to refuse.
 */
export const VIEWPORT_PORT = 3021;
export const VIEWPORT_BASE_URL = `http://127.0.0.1:${VIEWPORT_PORT}`;

export type ViewportName = 'phone-320' | 'phone-390' | 'tablet-768' | 'desktop-1512';

export type ViewportSpec = {
  /** The CSS-pixel width Playwright is told to use AND the page must report. */
  readonly width: number;
  readonly height: number;
  /**
   * The `devices[...]` key whose descriptor is spread underneath (user agent,
   * `isMobile`, `hasTouch`, `deviceScaleFactor`). `null` for the desktop
   * project, which spreads `Desktop Chrome`.
   */
  readonly device: string;
  /** Does `(max-width: 40rem)` — 640px — match at this width? */
  readonly narrow40rem: boolean;
  /** Does `(max-width: 60rem)` — 960px — match at this width? */
  readonly narrow60rem: boolean;
};

/**
 * ## THE THREE WIDTHS, AND WHY THESE THREE
 *
 * They are chosen to sit on OPPOSITE SIDES of the two breakpoints this
 * stylesheet actually has. Grepped, not assumed:
 *
 *   * `apps/web/app/globals.css:17`   `@media (max-width: 60rem)`  → 960px
 *   * `apps/web/app/globals.css:218`  `@media (max-width: 40rem)`  → 640px
 *   * `packages/ui/src/ui.css:1311`   `@media (max-width: 40rem)`  → 640px
 *
 * (The brief guessed 40rem alone. There are two, and 60rem is the one that
 * moves the shell on every single route.)
 *
 *      width │ ≤40rem │ ≤60rem │ what that means on screen
 *     ───────┼────────┼────────┼──────────────────────────────────────────────
 *        390 │  yes   │  yes   │ shell padding 12px, help tabs stacked,
 *            │        │        │ 404 actions stacked, titles 21.6px
 *        768 │  no    │  yes   │ shell padding 12px, tabs in a row,
 *            │        │        │ 404 actions in a row, titles 34px
 *            │        │        │ (25.6px before Step 2c-2, 2026-09-18 — the
 *            │        │        │ export's heading scale; the 390 row's 21.6px
 *            │        │        │ is the product's own 40rem rule, untouched)
 *       1512 │  no    │  no    │ shell padding 20px, everything wide
 *
 * Every pair differs. 390↔768 is separated by the 40rem queries; 768↔1512 by
 * the 60rem query; 390↔1512 by both. A three-way signature with no two entries
 * alike is what lets the cross-width test assert INEQUALITY and mean it — a
 * suite whose widths all landed in the same band could assert nothing about
 * responsiveness at all, no matter how green it ran.
 *
 * ## ONE BROWSER ENGINE, DELIBERATELY
 *
 * All three projects are chromium. Two independent reasons, and the second is
 * the one that would survive a fixed toolchain:
 *
 * 1. WebKit is NOT RUNNABLE on this machine at this Playwright version.
 *    Measured 2026-09-07: `@playwright/test` is 1.62.1 and wants
 *    `webkit-2336`; `~/Library/Caches/ms-playwright/` holds `webkit-2272`.
 *    `webkit.launch()` fails with "Executable doesn't exist at
 *    .../webkit-2336/pw_run.sh". `chromium.launch()` succeeds (151.0.7922.34).
 *    The handoff note claiming "chromium+webkit binaries ARE present" is true
 *    of the directory listing and false of what runs.
 *
 * 2. Even with WebKit installed, mixing engines across the three projects would
 *    BREAK THE INSTRUMENT. The cross-width test's whole claim is "this layout
 *    difference is caused by the width". If 390 ran WebKit and 1512 ran
 *    chromium, a measured difference would be equally explainable by the engine,
 *    and the test would prove nothing it claims to prove. One engine is what
 *    makes width the only variable.
 *
 * What that costs, stated rather than hidden: iOS Safari's own quirks — the
 * 16px-or-it-zooms input rule that `packages/ui/src/ui.css:1251` is written
 * against, `-webkit-fill-available`, safe-area insets — are NOT exercised here.
 * A WebKit axis is worth adding once `pnpm exec playwright install webkit` has
 * been run; it is a second instrument, not a substitute for this one.
 */
export const VIEWPORTS: Readonly<Record<ViewportName, ViewportSpec>> = {
  /**
   * **320 — WCAG 2.2 §1.4.10 *Reflow*'s own number, added 2026-09-21 (P27).**
   * Before this entry the narrowest width this product was
   * ever measured at was **390px**, 70px above the criterion, and `320`
   * appeared nowhere in either suite. The entry costs one object literal and
   * puts the criterion's own number under every per-viewport sweep — tap
   * targets, label text, accessible names, contrast — because
   * `playwright.viewport.config.ts:184` builds its projects by MAPPING this
   * record, so a fourth entry IS a fourth Playwright project.
   *
   * ⚠ **The three per-width BASELINES for this width do not exist yet, and
   * that is stated here rather than discovered by the first person to run the
   * suite.** `tap-target-baseline.json`, `accessible-names-baseline.json` and
   * the type-scale baseline are keyed `<viewport>|<route>`, and all three
   * REFUSE a missing key rather than seeding it (`responsive.spec.ts`'s own
   * "the suite refuses to invent one"). So the first run of the viewport suite
   * on this branch will report a missing baseline for each of the five routes
   * at `phone-320` and stop — loudly, in the safe direction, with no invented
   * number committed. **Owner: whoever next runs `test:e2e:viewport` against a
   * live stack; record with `UPDATE_*_BASELINE=1` and commit the file.** This
   * lane could not: the suite is Playwright, it needs its own `next dev`, and
   * this lane runs in push-only mode with no stack of its own.
   *
   * `iPhone SE` and not `iPhone 5`: Playwright ships no `iPhone 5` descriptor
   * (checked against `@playwright/test`'s own `devices`), and the descriptor
   * only contributes the non-viewport mobile characteristics anyway — the
   * config pins `viewport` AFTER the spread, so the 320×568 below is what is
   * actually used.
   */
  'phone-320': {
    width: 320,
    height: 568,
    device: 'iPhone SE',
    narrow40rem: true,
    narrow60rem: true,
  },
  'phone-390': {
    width: 390,
    height: 844,
    device: 'iPhone 13',
    narrow40rem: true,
    narrow60rem: true,
  },
  'tablet-768': {
    width: 768,
    height: 1024,
    device: 'iPad Mini',
    narrow40rem: false,
    narrow60rem: true,
  },
  'desktop-1512': {
    width: 1512,
    height: 982,
    device: 'Desktop Chrome',
    narrow40rem: false,
    narrow60rem: false,
  },
};

export const VIEWPORT_NAMES = Object.keys(VIEWPORTS) as readonly ViewportName[];

/**
 * The routes this suite can honestly reach.
 *
 * Reachability was MEASURED, not inferred, against the running app:
 *
 *     /                     200 (Home, spec E; was 307 → /workspaces)
 *     /help                 200
 *     /privacy              200
 *     /terms                200
 *     /sign-in              200
 *     /this-does-not-exist  404
 *
 * `/` answers 200 and renders Home's frame (the nav and an h1) since Knowledge Graph spec E; the workspace read behind it
 * needs the API, so it stays out of `UNAUTHED_ROUTES` and is covered by 27.629 (no redirect; the brand's Tab + Enter).
 *
 * 13.352 (Task 15, neo restyle) — `/privacy` and `/terms` are both swept by
 * every check this file drives (accessible-names, tap-target, type-scale),
 * and neither `apps/web/app/privacy/page.tsx` nor `apps/web/app/terms/page.tsx`
 * was touched by that task. ⚠ **This used to add that
 * `apps/web/src/back-button.tsx` was untouched too, "so the Back control's
 * presence and accessible name on both routes is unaffected" — and that file
 * does not exist.** It was removed in Step 2c-2 (`17c8345c`, "the dead component
 * the port orphaned"), so the two routes carry no Back control to be affected
 * and the premise holds by construction rather than by that file's absence from
 * a diff. The pages are reached from the sign-in card's legal line, which is why
 * the legal bar's `Sign in` link points at the same route a Back control did.
 */
export const UNAUTHED_ROUTES = [
  { path: '/help', label: 'help' },
  { path: '/privacy', label: 'privacy' },
  { path: '/terms', label: 'terms' },
  { path: '/sign-in', label: 'sign-in' },
  { path: '/no-such-page-e2e-viewport-probe', label: '404' },
] as const;
