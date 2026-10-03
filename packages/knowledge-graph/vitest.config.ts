import { defineConfig } from 'vitest/config';

export default defineConfig({
  esbuild: { jsx: 'automatic' },
  test: {
    // HK-7 (13.1733): one budget for every package, as apps/server's 30_000 already was; parallel runs stay.
    testTimeout: 20_000,
    hookTimeout: 30_000,
    include: ['test/**/*.test.{ts,tsx}'],
    environment: 'jsdom',
    setupFiles: ['test/setup.ts'],
  },
});
