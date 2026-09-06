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
 * OFF THE GATE, STRUCTURALLY. `turbo` enumerates the `test` script of every
 * workspace package and CI's only execution step is `pnpm turbo run build test
 * typecheck`. This suite is reached by `test:e2e:stack`, a script name turbo
 * defines no task for, so it is unreachable from `turbo run test` by the shape
 * of the graph rather than by a comment asking nobody to add it. Measured at
 * this commit: `turbo run test --dry=json` lists 16 tasks, 10 of them `#test`,
 * before and after this file. (An earlier pre-flight recorded "8 tasks" — that
 * figure was true when written and packages have been added since. Recount; do
 * not carry it.)
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
