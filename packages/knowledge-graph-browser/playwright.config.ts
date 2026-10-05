import { defineConfig, devices } from '@playwright/test';

// Real-browser Knowledge Graph cases (spec C §8). On the gate through this package's `test` script; `apps/web/e2e` stays off it.
// Headless Chromium renders WebGL in SwiftShader (about 5 fps): every case waits for the camera to settle, never for a timer.
// The port is KG_PW_PORT, else 3191 (27.360/27.361): `reuseExistingServer: false` makes a second run on a held port fail, so `ctl gate` and `ctl run-tests`
// each pick their own (scripts/ctl/README.md, "Playwright ports"). `--strictPort` makes vite fail loud rather than drift to another port the url never probes.
const port = Number(process.env.KG_PW_PORT) || 3191;
export default defineConfig({
  testDir: './tests',
  timeout: 120_000,
  workers: 1,
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] } },
    },
  ],
  use: { baseURL: `http://localhost:${port}` },
  webServer: { command: `vite --config vite.config.ts --port ${port} --strictPort`, url: `http://localhost:${port}`, reuseExistingServer: false, timeout: 60_000 },
});
