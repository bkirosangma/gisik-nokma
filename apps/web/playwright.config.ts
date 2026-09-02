import { defineConfig } from '@playwright/test';

/**
 * The smoke. It is **not on the gate** and it must not become so by accident:
 * `package.json`'s `test` script is `vitest run` and this suite runs under
 * `test:e2e`, because it needs a browser binary CI does not download
 * (`playwright@1.62.1` declares no install script, so `pnpm install` fetches
 * nothing). `vitest.config.ts` includes `test/**` only, so nothing under `e2e/`
 * is collected by the gate's runner either — two independent reasons, which is
 * deliberate: one of them being edited away should not silently put a browser
 * on CI's critical path.
 *
 * `webServer` starts THIS app and nothing else. There is no API server and no
 * database behind these cases: every server call is intercepted by `page.route`
 * in the spec, and every one of those stubs names the file and line of the
 * route it stands in for. That naming is the whole discipline here — the
 * coordination doc records how a missing route once hid behind this very smoke:
 * `GET /v1/me/workspaces` was served by no plan, this plan's navigation coded
 * against it, and the smoke MOCKED it, so the test that would have caught the
 * gap was the thing papering over it. A stub with no named owner is that
 * failure waiting to happen again.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  use: { baseURL: 'http://localhost:3001' },
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:3001',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
