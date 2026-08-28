import { defineConfig } from 'vitest/config';

export default defineConfig({
  esbuild: { jsx: 'automatic' },
  test: {
    include: ['test/**/*.test.{ts,tsx}'],
    environment: 'jsdom',
    // NO `setupFiles` YET, DELIBERATELY — and the first `.tsx` test in this
    // package has to add one. `@testing-library/jest-dom` and
    // `user-event` are already devDependencies (carried to match
    // packages/ui and packages/app-core), but a devDependency does not wire
    // anything: without a setup file the jest-dom matchers are never
    // registered, so `expect(x).toBeInTheDocument()` fails as "not a
    // function" rather than as a missing element — a confusing failure that
    // looks like a broken test rather than a missing import. Testing
    // Library's auto-cleanup is unregistered for the same reason, which
    // leaks each render into the next test.
    //
    // Copy `packages/ui/test/setup.ts` — it imports
    // '@testing-library/jest-dom/vitest' and wires `afterEach(cleanup)` by
    // hand, and its comment explains why the hand-wiring is required when a
    // suite imports its hooks explicitly instead of running `globals: true`.
    // Task 1 renders no React, so adding the file here now would be a setup
    // step with nothing to set up.
  },
});
