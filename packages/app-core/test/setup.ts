import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { clearLiveQueryCache } from '../src/views/live-query-cache.js';

/**
 * Same wiring as packages/ui's setup, and for the same reason: Testing Library
 * auto-registers its cleanup only under Vitest's `globals: true`, which this
 * suite does not use. Without it every render leaks into the next test.
 */
afterEach(cleanup);

/**
 * The read cache is session state (smoothness T3, `live-query-cache.ts`): a key named by a view (`ticket:<id>`) would
 * serve one case's answer as the next case's first paint. Every case starts with the cache empty.
 */
afterEach(clearLiveQueryCache);

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
      // React Flow's own pan/zoom setup (@xyflow/system's XYPanZoom) reads
      // entry.contentRect.width/height off the FIRST callback invocation to
      // size its viewport — measured here: the plain `{ target }` this shim
      // used to hand back left contentRect undefined and threw inside
      // XYPanZoom before a single node ever reached the DOM. The width/height
      // below reuse the same 180/40 defaults this file's offsetWidth/
      // offsetHeight getters already establish, so a canvas host with no
      // explicit size still measures as non-zero.
      const htmlTarget = target as HTMLElement;
      const contentRect = {
        width: htmlTarget.offsetWidth ?? 180,
        height: htmlTarget.offsetHeight ?? 40,
        top: 0,
        left: 0,
        right: htmlTarget.offsetWidth ?? 180,
        bottom: htmlTarget.offsetHeight ?? 40,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      } as DOMRectReadOnly;
      this.callback(
        [{ target, contentRect } as ResizeObserverEntry],
        this as unknown as ResizeObserver,
      );
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

  /**
   * The extra jsdom gap Task 5's canvas exposed, beyond the two React Flow
   * shims above: @testing-library/user-event's realistic click (pointerdown →
   * mousedown → ... → click) constructs every MouseEvent with `view: null` —
   * measured in
   * @testing-library/user-event/dist/esm/event/createEvent.js's `initUIEvent`,
   * which always writes `view` as a non-configurable own accessor via
   * `Object.defineProperty`, so it cannot be patched afterward (redefining a
   * non-configurable accessor throws) and wrapping the dispatched event in a
   * Proxy does not help either — jsdom's dispatch reads the event through its
   * own internal implementation link, not through whatever object reference
   * was passed in, so a Proxy's overridden getter is never consulted.
   * @xyflow/system attaches real d3-drag/d3-zoom behaviour to the pane (pan)
   * and to draggable nodes; both unconditionally call `nodrag(event.view)` on
   * every qualifying mousedown, and `nodrag` immediately reads
   * `view.document`, which throws on null (not something
   * `panOnDrag`/`nodesDraggable` toggles avoid, since XYFlow's own mousedown
   * filter passes through for a left-click before nodrag is ever reached).
   *
   * WHAT THE THROW ACTUALLY COSTS — corrected after measurement. The first
   * version of this block, and Task 5's commit message, both said it "throws
   * before any test body observation" / "before a single test assertion
   * runs". That is FALSE, and the false version is worse than no comment,
   * because it makes the wrapper look like it is guarding clicks:
   *  - Delete the `if (typeof MouseEvent !== 'undefined')` block below and run
   *    app-core in full: every test still PASSES. jsdom's own dispatch catches
   *    the TypeError and logs it as an uncaught error; it never propagates
   *    into a test body, so no assertion is affected.
   *  - What it does do is abort d3-drag's mousedown handler partway, so the
   *    GESTURE never initialises and the drag silently no-ops. Measured with
   *    canvas.test.tsx's 'completes a node drag gesture' test: WITH this
   *    wrapper a user-event drag of a state node reaches `onNodeDragStop` ->
   *    `moveState` exactly once; WITHOUT it that count is 0 and the run
   *    reports "TypeError: Cannot read properties of null (reading
   *    'document')" at d3-drag/src/nodrag.js:5 inside `mousedowned`.
   * So the wrapper is load-bearing for GESTURES, not for clicks, and its
   * absence fails SILENTLY. That drag test is the only assertion in app-core
   * that reddens if this block is removed; keep them together.
   *
   * The only working intercept point left is `Object.defineProperty` itself:
   * this wraps it so that specifically an Event's `view` getter falls back to
   * `window` instead of null, at the moment user-event installs it — before
   * it becomes non-configurable. Scoped narrowly (property name `view`,
   * target must be an `Event` instance) to avoid touching unrelated code.
   * One side effect worth knowing: the descriptor it hands on is rewritten
   * `configurable: true`, so inside this test process an Event's `view` is
   * redefinable where user-event would have left it frozen.
   *
   * Task 6 (plan line 3127 — connecting, and the inspectors) inherits this
   * wrapper, but must NOT read it as "dragging works under jsdom". It does
   * not: measured here, the drag above completes with a ZERO delta, because
   * jsdom has no layout engine and every getBoundingClientRect is 0x0. A
   * gesture test must assert the observable effect the gesture is wired to
   * (the action firing), never a coordinate. Whether a CONNECT gesture
   * (mousedown on a Handle through to `onConnect`) completes under this
   * harness is NOT MEASURED here — Task 6 must establish it with a planted
   * defect, not assume it from this block.
   */
  /**
   * Task 6's connect-gesture measurement (plan line 3127, "OPEN FOR CONNECT"
   * in this file's own comment above): a real pointerdown-on-Handle ->
   * pointermove -> pointerup-on-Handle sequence, driven with the SAME
   * pointer() gesture the drag test above uses, does not merely no-op the
   * way the drag gesture does without the `view` wrapper — it throws an
   * UNCAUGHT exception that fails the whole vitest process (not just the
   * test), because @xyflow/system's connection hit-testing
   * (`isValidHandle`, called from its pointermove handler) calls
   * `document.elementFromPoint`, an API jsdom has never implemented.
   * Measured: delete this shim and run
   * `test/workflow-builder/canvas.test.tsx` — the connect-gesture test still
   * reports 12/12 passed (the crash lands after the test body's assertions
   * already ran), but the process exits 1 on "doc.elementFromPoint is not a
   * function", which fails `pnpm turbo run test` package-wide.
   *
   * The stub returns null unconditionally — "nothing is at this point" — the
   * honest answer here: every element's rect is 0x0 (no layout engine), so
   * there is no real position at which two distinct handles' rects could
   * ever both cover the same point the way a real browser's could. With this
   * shim in place, the SAME pointer sequence completes without throwing and
   * `onConnect` is measured never firing — that is Task 6's actual finding,
   * not a shim-induced one: connectionToTransition (the mapping layer
   * onConnect calls) is proven separately, without any gesture, in
   * flow-graph.test.ts.
   */
  if (typeof document !== 'undefined' && typeof document.elementFromPoint !== 'function') {
    document.elementFromPoint = () => null;
  }

  if (typeof MouseEvent !== 'undefined') {
    const originalDefineProperty = Object.defineProperty;
    Object.defineProperty = function (
      target: object,
      property: PropertyKey,
      descriptor: PropertyDescriptor,
    ) {
      if (
        property === 'view' &&
        typeof descriptor.get === 'function' &&
        typeof Event !== 'undefined' &&
        target instanceof Event
      ) {
        const originalGet = descriptor.get;
        descriptor = { ...descriptor, get: () => originalGet.call(target) ?? window, configurable: true };
      }
      return originalDefineProperty(target, property, descriptor);
    } as typeof Object.defineProperty;
  }
}

/**
 * THE DOOR RUNS ON EVERY EVENT A CASE BUILDS (case 18.431).
 *
 * `makeSubmittedFactory` mints through `newSubmittedEvent`, so wrapping THAT
 * one function puts the real payload schema — the one the server's `parseEvent` runs at
 * ingest, looked up in the real `domainRegistry` — in front of every claim any view
 * in this suite makes. A payload that the registry would refuse (the scope
 * editor once built `{ scope: { mode } }` where the schema wants `{ mode }`)
 * now throws where the event is BUILT, in whichever case builds it.
 *
 * Why here and not in each view's test: those tests hand the view a stub
 * `ingest` and assert `toEqual` on what arrived, so the assertion and the code
 * are two copies of the same wrong guess and agree with each other. Only the
 * schema is the contract, and only this hook runs it without a test having to
 * remember to.
 *
 * A case that builds an event ON PURPOSE to be refused sets
 * `globalThis.__gnAllowRefusedPayloads = true` (cleared after each case); a
 * file made of such cases calls `vi.unmock('@gisik-nokma/domain')`.
 *
 * Id-format issues (`must be a ULID`) are ignored: the fixtures here name
 * entities `'ws-1'`, and the question this hook answers is the payload's SHAPE.
 * The flag is cleared by the `afterEach` below so it cannot leak to the next case.
 */
const ALLOW_REFUSED = '__gnAllowRefusedPayloads';
const allowRefusedPayloads = (): boolean => (globalThis as Record<string, unknown>)[ALLOW_REFUSED] === true;
afterEach(() => {
  delete (globalThis as Record<string, unknown>)[ALLOW_REFUSED];
});

vi.mock('@gisik-nokma/domain', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@gisik-nokma/domain')>();
  return {
    ...actual,
    newSubmittedEvent: (input: Parameters<typeof actual.newSubmittedEvent>[0]) => {
      const event = actual.newSubmittedEvent(input);
      // Only the PAYLOAD is judged: the envelope's ids are fixtures here
      // (`'ws-1'` is not a ULID) and the door's envelope check is not the
      // question. A type nobody registered is left alone for the same reason.
      const registration = actual.domainRegistry.get(event.type, event.version);
      const parsed = registration?.payloadSchema.safeParse(event.payload);
      const issues = parsed?.success === false ? parsed.error.issues.filter((i) => i.message !== 'must be a ULID') : [];
      if (parsed !== undefined && !parsed.success && issues.length > 0 && !allowRefusedPayloads()) {
        const issue = issues[0];
        throw new Error(
          `the door would refuse ${event.type}: invalid-payload at ${issue?.path.join('.') || '(root)'}: ${issue?.message ?? 'invalid'}`,
        );
      }
      return event;
    },
  };
});
