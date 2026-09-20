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
 *      `apps/web/test/contests.test.tsx:97` for this. **That correction was
 *      itself wrong, and is corrected here rather than edited away.** The PATH
 *      is wrong — nothing named `contests` exists under `apps/web` — but the
 *      file is real in another package:
 *      `packages/app-core/test/contests.test.tsx:101` is case 12.194,
 *      *"renders the IST day under a non-IST TZ, and the TZ actually took
 *      effect"*. It does precisely what the brief claimed, and it is the
 *      STRONGER precedent of the two: it probes first, asserting that the same
 *      instant reads a different hour under `UTC` than under
 *      `America/Los_Angeles`, so a green cannot come from `TZ` being ignored by
 *      the worker — then renders under three zones including
 *      `Pacific/Kiritimati`.
 *
 *      The earlier note searched the cited path, found nothing, and concluded
 *      the citation was invented. **A wrong path is not a missing file**, and
 *      the overcorrection was the more damaging of the two errors: a stale
 *      citation merely misdirects, while "no such file exists" sitting in a
 *      docblock teaches every later reader that a real and better precedent is
 *      fiction. Both files are precedents; `ist-today` is the closer sibling
 *      for asserting an env knob took, 12.194 the closer one for asserting a
 *      RENDERED day under a hostile zone.)
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
 * ON THE GATE? **YES** — SINCE 2026-09-20. IT WAS "NO", AND IT COST FIVE DAYS.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The previous version of this block is kept, because it was not wrong about
 * the mechanics and the reversal has to be readable at the rule rather than
 * discovered as a regression:
 *
 *   * `apps/web/package.json`'s `test` script is `vitest run`, and
 *     `vitest.config.ts` includes `test/**` only — nothing under
 *     `e2e-viewport/` is collected by the gate's runner. **Still true.**
 *   * This config is reached only by an explicit `-c playwright.viewport.config.ts`,
 *     a spelling no turbo task defines. **Still true.**
 *
 * Two independent reasons were given for staying off the gate, "so that editing
 * one away does not put a browser download on CI's critical path by accident".
 * The first is a statement about `vitest`, not about CI, and the second was
 * answered by naming the suite in `.github/workflows/ci.yml` — which is what
 * the `viewport` job now does. **What the two reasons actually bought was a
 * suite that ran only when a human remembered it.**
 *
 * The bill, measured rather than argued. The `/help` tap-target ratchet read
 * **25 / 23 / 25** offenders at 390 / 768 / 1512 against baselines of
 * **10 / 16 / 16**: red on `main`, for as long as the topic sidebar has
 * existed, invisible for exactly as long as nothing ran this file. `viewport`
 * occurred **0 times** in `ci.yml` while the same grep found `e2e` nine times.
 * **A ratchet with no runner is a note, not a check.**
 *
 * ⚠ SO IT RUNS ON CI'S `gate` AND NOT IN TURBO, AND THE SPLIT IS DELIBERATE.
 * A turbo task's verdict can be REPLAYED FROM CACHE, and a check that can go
 * green without running is the precise failure `turbo.json`'s own
 * `@gisik-nokma/ui#test` note records (`#270` reached `main` because a cached
 * task replayed a green log over a real violation). A browser suite is the
 * worst possible candidate for a replayable verdict. It also needs a chromium
 * binary `pnpm install` does not fetch and a `next dev` it owns. `pnpm
 * test:e2e:viewport` at the repo root is the local entry point; the CI job
 * `viewport` is the gate.
 *
 * `typecheck` was always a YES and still is: this config and `e2e-viewport/**`
 * are in `tsconfig.e2e.json`, which `apps/web`'s `typecheck` script runs —
 * "these files should not rot". Types were never the gap. **The gap was a
 * runner for the assertions.**
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
