import { defineConfig, devices } from '@playwright/test';

// Real-browser Knowledge Graph cases (spec C §8). On the gate through this package's `test` script; `apps/web/e2e` stays off it.
// Headless Chromium renders WebGL in SwiftShader (about 5 fps): every case waits for the camera to settle, never for a timer.
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
  use: { baseURL: 'http://localhost:3191' },
  webServer: { command: 'vite --config vite.config.ts', url: 'http://localhost:3191', reuseExistingServer: false, timeout: 60_000 },
});
