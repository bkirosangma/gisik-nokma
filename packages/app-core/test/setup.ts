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

/**
 * React Flow jsdom shims (Plan 8) — the official recipe from
 * reactflow.dev/learn/advanced-use/testing, adapted. Harmless for suites that
 * never render the canvas; needed once the workflow builder's React Flow
 * canvas (Task 6+) renders under jsdom, which has no layout engine.
 *
 * Guarded on `typeof HTMLElement`: this setup file runs for every test file
 * in the package, including ones that opt into `@vitest-environment node`
 * (no DOM globals at all) via a file-level pragma — those must not crash here.
 */
if (typeof HTMLElement !== 'undefined') {
  class ResizeObserverShim {
    private readonly callback: ResizeObserverCallback;
    constructor(callback: ResizeObserverCallback) {
      this.callback = callback;
    }
    observe(target: Element): void {
      this.callback([{ target } as ResizeObserverEntry], this as unknown as ResizeObserver);
    }
    unobserve(): void {}
    disconnect(): void {}
  }

  class DOMMatrixReadOnlyShim {
    readonly m22: number;
    constructor(transform?: string) {
      const scale = transform?.match(/scale\(([\d.]+)\)/)?.[1];
      this.m22 = scale === undefined ? 1 : Number.parseFloat(scale);
    }
  }

  globalThis.ResizeObserver = ResizeObserverShim as unknown as typeof ResizeObserver;
  (globalThis as Record<string, unknown>).DOMMatrixReadOnly = DOMMatrixReadOnlyShim;

  Object.defineProperties(HTMLElement.prototype, {
    offsetHeight: {
      get(this: HTMLElement) {
        return Number.parseFloat(this.style.height) || 40;
      },
    },
    offsetWidth: {
      get(this: HTMLElement) {
        return Number.parseFloat(this.style.width) || 180;
      },
    },
  });

  (SVGElement.prototype as unknown as { getBBox: () => DOMRect }).getBBox = () =>
    ({ x: 0, y: 0, width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0, toJSON: () => ({}) }) as DOMRect;
}
