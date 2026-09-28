import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach } from 'vitest';
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
 * EVERY case starts with no remembered state.
 *
 * jsdom keeps ONE `localStorage` for a whole test file, so a case that writes
 * leaves its record behind for every case after it — and a case that inherited
 * the previous one's memory passes or fails on state its own body cannot see.
 * That is order-dependence, which shows up as a suite that goes red when an
 * unrelated test is renamed. `app-nav.test.tsx` recorded it for itself when
 * Round 25 gave the nav a memory; it lives here now because the surface has
 * grown past one file — the project page reads AND WRITES the remembered tab on
 * every tab click, and nine test files mount that page.
 *
 * **This is a TEST-ONLY reset and must not be mistaken for product behaviour.**
 * The product deliberately does NOT clear the remembered workspace or project
 * on sign-out — `use-last-workspace.ts` argues that at length: the record is
 * kept and simply not honoured, which also survives the case where sign-out
 * never runs at all. Nothing here changes that; it removes the previous CASE,
 * which the product has no equivalent of.
 *
 * ## ⛔ NOTHING HERE MAY IMPORT FROM `src/` — measured, and it cost an hour
 *
 * The first version of this block also cleared the remembered-state hooks'
 * module caches, by importing their `clear*Cache` functions from `../src/…`.
 * That SILENTLY DISABLED `vi.mock('../src/auth-client.js')` IN EVERY TEST FILE
 * THAT MOCKS IT.
 *
 * The mechanism: this file is a `setupFiles` entry, so it runs BEFORE the test
 * file's own module — and importing `use-workspace-name.ts` pulls in
 * `providers.tsx` and then `auth-client.ts` with it. The real module was
 * therefore instantiated and cached before any test file's hoisted `vi.mock`
 * could register a factory, so `useSessionStatus()` answered the REAL client's
 * initial `{ isPending: true }` — `{ kind: 'loading' }` — everywhere. Nothing
 * threw. Four cases in `project-calendar-timeline.test.tsx` simply stopped
 * writing anything, because a loading session has no user id to key a record
 * by, and the failures pointed at the page rather than at this file.
 *
 * Anything a case needs beyond `localStorage` — the module caches above all —
 * is cleared by that case's own file, next to the code that explains it. This
 * block stays dependency-free on purpose.
 */
beforeEach(() => {
  window.localStorage.clear();
});

/**
 * React 19 gates `act` behind this flag and warns on every call made without
 * it. Testing Library sets it around its own render and restores it after, so
 * a test body that awaits an effect-driven update outside `render` needs it
 * set here.
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * THE jsdom SHIMS PROSEMIRROR AND POPUP POSITIONING NEED — copied from
 * `packages/editor/test/setup.ts`, which carries the same block for the same
 * reason (its own docblock): jsdom implements none of
 * `getClientRects`/`getBoundingClientRect`/`scrollIntoView`, so ProseMirror's
 * `coordsAtPos` (reached from `commands.focus('end')`, case 13.1488) and
 * suggestion-popup positioning throw under test. Guarded with `if (!…)`
 * rather than assigned outright, so a future jsdom that implements one keeps
 * its own. `Element.prototype.scrollTo` is the ONE addition beyond the
 * editor package's set — `ReadingTOC.tsx`'s own click handler (case 13.1483)
 * calls `root.scrollTo(...)` on the scroll CONTAINER, a plain `scrollTo`,
 * not `scrollIntoView`.
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
if (!Element.prototype.scrollTo) Element.prototype.scrollTo = function () {};
if (!('ResizeObserver' in globalThis)) {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
}
