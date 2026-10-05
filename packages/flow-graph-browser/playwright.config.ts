import { defineConfig, devices } from '@playwright/test';

// Real-browser stress cases for the time and flow surfaces (Workflow and Timeline graphs, Part 1). On the gate through this
// package's `test` script. Headless Chromium composites in software, so a headless number is a floor and never the bar:
// the bars (spec §13) are read from `FG_HEADED=1` runs and from the real phone (`stress.html?auto=1`, see the README).
// `tests/` also holds behaviour specs (`timeline.spec.ts`, Part 1 T10: layout, zoom anchor, drag, touch, keys, the mounted
// band, the claims callout). They make no frame-rate claim, so a headless run is a pass for them.
// The port is FG_PW_PORT, else 3192 (13.2290/13.2291): `reuseExistingServer: false` makes a second run on a held port fail, so `ctl gate` and `ctl run-tests`
// each pick their own (scripts/ctl/README.md, "Playwright ports"). `--strictPort` makes vite fail loud rather than drift to another port the url never probes (13.2292).
const port = Number(process.env['FG_PW_PORT']) || 3192;
export default defineConfig({
  testDir: './tests',
  timeout: 120_000,
  workers: 1,
  // Playwright empties its outputDir at the start of every run; the stress records live beside it, in test-results/stress.jsonl.
  outputDir: 'test-results/pw',
  projects: [{ name: 'desktop', use: { ...devices['Desktop Chrome'], headless: process.env['FG_HEADED'] !== '1' } }],
  use: { baseURL: `http://localhost:${port}` },
  webServer: { command: `vite --config vite.config.ts --port ${port} --strictPort`, url: `http://localhost:${port}/stress.html`, reuseExistingServer: false, timeout: 60_000 },
});
