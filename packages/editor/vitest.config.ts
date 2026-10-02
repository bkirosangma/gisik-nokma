import { defineConfig } from 'vitest/config';

export default defineConfig({
  esbuild: { jsx: 'automatic' },
  test: {
    // HK-7 (13.1733): one budget for every package, as apps/server's 30_000 already was; parallel runs stay.
    testTimeout: 20_000,
    hookTimeout: 30_000,
    include: ['test/**/*.test.{ts,tsx}'],
    environment: 'jsdom',
    // Task 12 is the first task in this package to render React
    // (`ticket-editor.test.tsx`), which is what the setup file this config
    // pointed to as future work now exists to serve: `test/setup.ts` imports
    // '@testing-library/jest-dom/vitest' (registers the matchers) and wires
    // `afterEach(cleanup)` by hand (this suite imports its hooks explicitly
    // rather than running `globals: true`, so Testing Library's auto-cleanup
    // never fires on its own — every render would otherwise leak into the
    // next test).
    setupFiles: ['test/setup.ts'],
  },
});
