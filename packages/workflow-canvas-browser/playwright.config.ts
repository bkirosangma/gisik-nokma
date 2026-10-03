import { defineConfig, devices } from '@playwright/test';

// Real-browser canvas cases (G-9). On the gate through this package's `test` script; `apps/web/e2e` stays off it.
export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  workers: 1,
  use: { baseURL: 'http://localhost:3190', ...devices['Desktop Chrome'] },
  webServer: { command: 'vite --config vite.config.ts', url: 'http://localhost:3190', reuseExistingServer: false, timeout: 60_000 },
});
