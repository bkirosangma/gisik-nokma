import { defineConfig } from '@playwright/test';

/**
 * The DEPLOYED-STACK suite (Plan 11 Task 13) — a second config, deliberately.
 *
 * WHY NOT `playwright.config.ts`. That config runs the mock-only smoke and
 * carries `webServer: { command: 'pnpm dev', url: 'http://localhost:3001',
 * reuseExistingServer: true }`. Putting real-stack specs under it would mean one
 * of two failures, both silent: Playwright starts a local `next dev` that
 * COLLIDES with the compose web container already published on 3001, or
 * `reuseExistingServer` adopts whatever happens to be listening there — a stray
 * dev server with the whole stack down — and the suite reports deployment
 * coverage of a deployment it never touched. There is no `webServer` here; the
 * stack must already be up, and `global-setup.ts` refuses the run if what is
 * listening is not the stack.
 *
 * OFF THE LOCAL GATE, STRUCTURALLY — AND DELIBERATELY ON CI's.
 *
 * Two different things, and an earlier version of this docblock ran them
 * together into a blanket "off the gate" that was false in two of its three
 * senses. Precisely:
 *
 *   * `pnpm turbo run build test typecheck` — OFF it, for two independent
 *     reasons. This suite is reached by `test:e2e:stack`, a script name turbo
 *     defines no task for; and `vitest.config.ts` includes `test/**` only, so
 *     nothing under `e2e-stack/` is collected by the gate's runner either.
 *     Measured at this commit: `turbo run test --dry=json` lists 16 tasks, 10
 *     of them `#test`, zero matching e2e.
 *   * `turbo run typecheck` — ON it, benignly: `tsconfig.e2e.json` includes
 *     `e2e-stack/**` and `apps/web`'s typecheck runs it. That is wanted; these
 *     files should not rot.
 *   * CI's `gate` job — ON it. `ci.yml` lists `e2e` in `gate`'s `needs`, and
 *     that job runs this suite against a real compose stack. That is the POINT
 *     of Task 13, not an accident: the deployment is supposed to be verified
 *     before a merge. What must never happen is this suite joining the LOCAL
 *     gate, where no stack and no browser binary exist.
 *
 */
export default defineConfig({
  testDir: './e2e-stack',
  globalSetup: './e2e-stack/global-setup.ts',
  timeout: 90_000,
  // One worker: the specs share one seeded world and one test inbox, and the
  // inbox is purged per sign-in. Parallel workers would race for the link.
  workers: 1,
  retries: 0,
  reporter: process.env['CI'] === undefined ? 'list' : [['list'], ['github']],
  use: {
    baseURL: 'http://localhost:3001',
    trace: 'retain-on-failure',
  },
});
