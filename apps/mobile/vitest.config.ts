import { defineConfig } from 'vitest/config';

/**
 * Node environment, module-seam tests only. RN rendering is not exercised
 * here (no simulator in this gate) — .tsx components stay thin and untested
 * at this layer by design; their pure logic lives in sibling .ts modules.
 */
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
