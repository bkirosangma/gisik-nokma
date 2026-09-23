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

/**
 * THE jsdom SHIMS THE SUGGESTION POPUPS NEED (Plan 4 Task 5).
 *
 * `@tiptap/suggestion` positions its popup by asking the DOM for rectangles —
 * `coordsAtPos` walks to `Range#getClientRects`/`#getBoundingClientRect` — and
 * scrolls the active row into view. jsdom implements none of the three, so a
 * popup that opens under test throws before it can be asserted on. The mention
 * tests never needed these; the wiki-link ones cannot run without them.
 *
 * Each is guarded with `if (!…)` rather than assigned outright, so a future
 * jsdom that implements one keeps its own implementation. The shapes are the
 * ones these APIs must return — an empty `DOMRectList` and a zeroed `DOMRect` —
 * and the empty LIST is not an empty array: `DOMRectList` has an `item()`
 * method, and `Array.prototype.item` does not exist.
 */
const emptyRectList = (): DOMRectList =>
  Object.assign([], { item: () => null }) as unknown as DOMRectList;

const emptyRect = (): DOMRect =>
  ({
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    width: 0,
    height: 0,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  }) as DOMRect;

if (!Range.prototype.getClientRects) Range.prototype.getClientRects = emptyRectList;
if (!Element.prototype.getClientRects) Element.prototype.getClientRects = emptyRectList;
if (!Range.prototype.getBoundingClientRect) Range.prototype.getBoundingClientRect = emptyRect;
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = function () {};
if (!('ResizeObserver' in globalThis)) {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
}
