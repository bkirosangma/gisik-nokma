import { defineConfig } from 'vitest/config';

/**
 * Node environment, module-seam tests only. RN rendering is not exercised
 * here (no simulator in this gate) — .tsx components stay thin and untested
 * at this layer by design; their pure logic lives in sibling .ts modules.
 */
export default defineConfig({
  test: {
    // HK-7 (13.1733): one budget for every package, as apps/server's 30_000 already was; parallel runs stay.
    testTimeout: 20_000,
    hookTimeout: 30_000,
    // `scripts/` too: the build guard lives there because it must run from
    // package.json's `build` script, and a gate whose own cases cannot run is
    // the shape this repo has been burned by. (The backticks in this comment
    // were eaten by shell interpolation once already — hence this note.)
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
    environment: 'node',
  },
});
