import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';

/**
 * Same wiring as packages/ui's setup, and for the same reason: Testing Library
 * auto-registers its cleanup only under Vitest's `globals: true`, which this
 * suite does not use. Without it every render leaks into the next test.
 */
afterEach(cleanup);

/**
 * React 19 gates `act` behind this flag and warns on every call made without
 * it. Testing Library sets it around its OWN render and restores the previous
 * value afterwards, which covers suites that only ever render — but a view
 * suite that drives a hook directly (fake timers, an event frame pushed
 * through the fake `DataSource`) calls `act` from `react` in the test body,
 * where the flag has already been restored to unset. Setting it once here is
 * the wiring React documents; without it those calls warn and, more to the
 * point, React declines to flush the update they were written to flush.
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
