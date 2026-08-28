import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';

/**
 * Same wiring as packages/ui's setup, and for the same reason: Testing Library
 * auto-registers its cleanup only under Vitest's `globals: true`, which this
 * suite does not use. Without it every render leaks into the next test.
 */
afterEach(cleanup);
