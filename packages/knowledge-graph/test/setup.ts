import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';

/**
 * Testing Library auto-registers its cleanup only when a global `afterEach`
 * exists, which Vitest provides only under `globals: true`. This suite imports
 * its hooks explicitly, so the unmount has to be wired by hand — without it,
 * every render leaks into the next test and `getByRole` starts finding the
 * previous test's DOM (observed: "Found multiple elements with the role
 * 'button' and name 'Plain'").
 */
afterEach(cleanup);
