import { defineConfig, devices } from '@playwright/test';
import { VIEWPORT_BASE_URL, VIEWPORT_PORT, VIEWPORTS } from './e2e-viewport/viewports.js';

/**
 * The RESPONSIVE suite — pre-launch item 7. A third config, deliberately, and
 * the third one is the one that has to explain itself hardest.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THE FAILURE THIS SUITE EXISTS TO MAKE IMPOSSIBLE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Item 7's wording is "actually check in a real viewport, not just visually
 * inspect the code", and it is worded that way because of a specific, recorded
 * event. The browser-automation tool's `resize_window` REPORTED SUCCESS at
 * 390x844 while the page went on reporting `innerWidth: 1512`, and the
 * screenshot that came back was byte-identical to the desktop one. Twice, on two
 * different days.
 *
 * That is a checker that cannot fail. It had a green channel and no red one.
 * The whole design below is aimed at that single shape, from two directions,
 * because either one alone still lets a version of it through:
 *
 *   1. **Did the width take effect?** Every test's FIRST act — before it
 *      measures one thing it will report — is to read `window.innerWidth`
 *      INSIDE the page and assert it equals the width this project configured,
 *      and to assert `matchMedia('(max-width: 40rem)')` and
 *      `(max-width: 60rem)` return the booleans that width implies. Two
 *      witnesses down two different paths: JS layout, and the CSS cascade. A
 *      resize that reported success and changed nothing fails both.
 *
 *      The discipline is borrowed, not invented. `apps/web/test/ist-today.ts`'s
 *      sibling block at `test/ist-today.test.ts:126-131` asserts
 *      `process.env['TZ']` IS what the case needs before trusting a date — it
 *      checks the environment took, rather than assuming it. (The brief cited
 *      `apps/web/test/contests.test.tsx:97` for this; no such file exists. The
 *      ist-today lines are the real precedent.)
 *
 *   2. **Did the width CHANGE anything?** Requirement 1 can be satisfied by a
 *      page that reports 390 and lays out exactly as it does at 1512 — a
 *      stylesheet whose media queries were deleted would pass every per-project
 *      assertion in this suite. So `responsive.spec.ts` also opens 390, 768 and
 *      1512 in ONE test body, on one browser, and asserts the measurements
 *      DIFFER. Per-project equality lives in separate runs and nothing ever
 *      compares them; the cross-width test is the only place the comparison
 *      actually happens.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * HOW THIS AVOIDS THE PORT-3001 COLLISION THE OTHER TWO CONFIGS DOCUMENT
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `playwright.stack.config.ts`'s docblock states the hazard precisely: a
 * `webServer` on 3001 with `reuseExistingServer: true` either COLLIDES with the
 * compose web container published there, or ADOPTS whatever is listening and
 * "reports deployment coverage of a deployment it never touched". Its answer was
 * to have no `webServer` at all and refuse the run in `global-setup.ts` unless
 * what is listening is the stack.
 *
 * This suite cannot borrow that answer — it needs a server it controls, built
 * from the working tree, because it is measuring THIS tree's stylesheets. So it
 * takes the other exit:
 *
 *   * **A port of its own, 3021.** Neither existing config mentions it.
 *   * **`reuseExistingServer: false`.** This is the half that does the work. It
 *     means an occupied 3021 is a LOUD FAILURE ("http://127.0.0.1:3021 is
 *     already used"), never a silent adoption. The stack config's nightmare is
 *     precisely a suite that quietly measures a stranger; `false` converts that
 *     outcome into a stopped run.
 *   * **`127.0.0.1`, not `localhost`.** `localhost` resolves to both `::1` and
 *     `127.0.0.1`; the container on 3001 was bound to IPv6. Naming the literal
 *     address removes one way for "the thing I connected to" and "the thing I
 *     started" to differ.
 *
 * The hazard is live, not theoretical. Measured while writing this file
 * (2026-09-07): `gisik-nokma-dev-web-1` was `Up 23 minutes` publishing
 * `0.0.0.0:3001->3000/tcp`, and `GET localhost:3001/help` answered 200. A
 * viewport suite written against 3001 that day would have measured a container
 * image, not the checkout. Nothing holds 3021.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ON THE GATE? NO — AND FOR THE SAME TWO INDEPENDENT REASONS AS THE SMOKE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Following `playwright.config.ts`'s pattern rather than inventing a new one:
 *
 *   * `apps/web/package.json`'s `test` script is `vitest run`, and
 *     `vitest.config.ts` includes `test/**` only — nothing under
 *     `e2e-viewport/` is collected by the gate's runner.
 *   * This config is reached only by an explicit `-c playwright.viewport.config.ts`,
 *     a spelling no turbo task defines.
 *
 * Two reasons, deliberately, so that editing one away does not put a browser
 * download on CI's critical path by accident.
 *
 * `typecheck` is a different question and the answer there is YES: this config
 * and `e2e-viewport/**` are added to `tsconfig.e2e.json`, which
 * `apps/web`'s `typecheck` script runs. Same precedent, same reason the stack
 * config gives for its own inclusion — "these files should not rot".
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * PROJECTS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Built by mapping `VIEWPORTS` (`e2e-viewport/viewports.ts`) rather than typed
 * out here, so the width a project is configured with and the width the spec
 * expects are literally the same expression. See that file for why these three
 * widths, and why all three are chromium.
 *
 * `devices[...]` is spread for the mobile characteristics that are NOT the
 * viewport — `isMobile`, `hasTouch`, `deviceScaleFactor`, the user agent. The
 * viewport itself is then overridden, because the stock descriptors are the
 * wrong sizes for this job: `iPhone 13` ships 390x664 (a short-page height that
 * would exaggerate vertical overflow) and `Desktop Chrome` ships 1280x720,
 * which is on the WRONG SIDE of nothing — 1280 is already past the 60rem
 * breakpoint, but 1512 is the actual laptop width item 7 was raised against.
 *
 * `isMobile: true` matters more than it looks: it turns on meta-viewport
 * processing, so a page with no `<meta name="viewport">` would report
 * `innerWidth: 980` rather than 390 and every took-effect assertion would
 * redden. Checked before trusting it — `app/layout.tsx` exports `metadata` and
 * no `viewport`, but Next 15 injects a default, and the served HTML on every
 * covered route carries
 * `<meta name="viewport" content="width=device-width, initial-scale=1"/>`.
 * Verified by curl, not by reading the Next docs.
 */
export default defineConfig({
  testDir: './e2e-viewport',
  // Generous: a cold `next dev` compiles each route on its first request, and
  // the cross-width test drives three contexts through five routes in one body.
  timeout: 120_000,
  expect: { timeout: 10_000 },
  // Serial. The measurements are layout readings from one dev server; parallel
  // workers competing for the same first-compile would turn a slow compile into
  // a flaky timeout, and a flaky instrument is worth less than a slow one.
  workers: 1,
  retries: 0,
  fullyParallel: false,
  reporter: process.env['CI'] === undefined ? [['list']] : [['list'], ['github']],
  use: {
    baseURL: VIEWPORT_BASE_URL,
    trace: 'retain-on-failure',
  },
  projects: Object.entries(VIEWPORTS).map(([name, spec]) => ({
    name,
    use: {
      ...devices[spec.device],
      // Pinned AFTER the spread: the descriptor's own viewport must not win.
      viewport: { width: spec.width, height: spec.height },
      // Pinned after the spread for the reason in the docblock above: a device
      // descriptor may name webkit (iPhone 13 and iPad Mini both do), and a
      // cross-width comparison across two engines cannot attribute a difference
      // to the width. It is also the only engine that launches here.
      browserName: 'chromium' as const,
    },
  })),
  webServer: {
    // `pnpm dev` is hardcoded to `-p 3001` in package.json; invoking next
    // directly is what lets this suite own its port without editing that script
    // out from under the other two configs.
    command: `NEXT_TELEMETRY_DISABLED=1 pnpm exec next dev -p ${VIEWPORT_PORT}`,
    // A real page, not a bare port probe: the socket opens before Next has
    // compiled anything, and `/privacy` is the cheapest route to compile (a
    // static server component with no client bundle of its own).
    url: `${VIEWPORT_BASE_URL}/privacy`,
    // THE LOAD-BEARING LINE. See the docblock: `true` here is what would let
    // this suite silently measure the compose container, or any stray server.
    reuseExistingServer: false,
    timeout: 180_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
