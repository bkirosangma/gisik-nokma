import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';

/**
 * Same wiring as `packages/ui` and `packages/app-core`, and for the same
 * reason: Testing Library auto-registers its cleanup only under Vitest's
 * `globals: true`, which this suite does not use. Without it every render
 * leaks into the next test — observed here as "Found multiple elements with
 * the role 'button'" in `theme-toggle.test.tsx`, where the previous test's
 * toggle was still mounted and still carrying its own aria-label.
 */
afterEach(cleanup);

/**
 * React 19 gates `act` behind this flag and warns on every call made without
 * it. Testing Library sets it around its own render and restores it after, so
 * a test body that awaits an effect-driven update outside `render` needs it
 * set here.
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
