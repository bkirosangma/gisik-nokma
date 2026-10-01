import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  EDGE_MAX_SPEED_PX,
  EDGE_ZONE_PX,
  createEdgeScroller,
  edgeSpeed,
  isOffscreen,
} from '../../src/views/board-motion.js';

/**
 * Optimistic board moves (owner, 2026-10-01), point 3 — the drag follows the card off-screen.
 * 20.135 edge auto-scroll starts in the zone and stops on leave/drop/dragend/unmount; 20.136 the speed
 * grows with proximity and is capped; 20.137 the rail scrolls sideways; 20.138 (the pure half) a landing
 * slot is "off-screen" only when it is outside the viewport or the rail. jsdom paints and scrolls nothing,
 * so `requestAnimationFrame` is a queue the test runs by hand and `window.scrollBy` is a spy. The real
 * wheel/auto-scroll feel is 20.145 (🧪).
 */

let frames: Array<FrameRequestCallback | null>;
let scrollBy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  frames = [];
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    frames.push(callback);
    return frames.length;
  });
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
    frames[id - 1] = null;
  });
  scrollBy = vi.fn();
  window.scrollBy = scrollBy as unknown as typeof window.scrollBy;
});
afterEach(() => vi.restoreAllMocks());

/** Run the frames queued so far (each may queue the next), `count` rounds. */
function runFrames(count = 1): void {
  for (let round = 0; round < count; round += 1) {
    const due = frames.splice(0, frames.length);
    for (const callback of due) callback?.(0);
  }
}

function dragOver(clientX: number, clientY: number, target: EventTarget = document): void {
  target.dispatchEvent(new MouseEvent('dragover', { bubbles: true, clientX, clientY }));
}

const verticalScrolled = () => scrollBy.mock.calls.map((call) => call[1] as number);

describe('20.136 the scroll speed grows with proximity to the edge and is capped', () => {
  it('20.136 zero at and beyond the zone, growing as the pointer nears the edge, capped at the maximum', () => {
    expect(edgeSpeed(EDGE_ZONE_PX)).toBe(0);
    expect(edgeSpeed(EDGE_ZONE_PX + 100)).toBe(0);
    const far = edgeSpeed(56);
    const near = edgeSpeed(16);
    expect(far).toBeGreaterThan(0);
    expect(near).toBeGreaterThan(far);
    // CAPPED — at the edge itself and beyond it (a pointer dragged past the window) the speed is the maximum.
    expect(edgeSpeed(0)).toBe(EDGE_MAX_SPEED_PX);
    expect(edgeSpeed(-200)).toBe(EDGE_MAX_SPEED_PX);
    expect(EDGE_ZONE_PX).toBe(64);
  });

  it('20.136 the frame loop scrolls faster nearer the edge — and never faster than the cap', () => {
    const scroller = createEdgeScroller();
    scroller.begin();
    dragOver(10, 56); // 56px from the top: inside the 64px zone, but barely
    runFrames();
    const slow = Math.abs(verticalScrolled().at(-1)!);
    dragOver(10, 8);
    runFrames();
    const fast = Math.abs(verticalScrolled().at(-1)!);
    expect(fast).toBeGreaterThan(slow);
    dragOver(10, -300);
    runFrames();
    expect(Math.abs(verticalScrolled().at(-1)!)).toBe(EDGE_MAX_SPEED_PX);
    scroller.end();
  });
});

describe('20.135 edge auto-scroll starts in the zone and stops on leave / drop / dragend / unmount', () => {
  it('20.135 near the top the page scrolls UP, near the bottom DOWN; mid-window nothing moves', () => {
    const scroller = createEdgeScroller();
    scroller.begin();
    dragOver(300, 384); // the middle of a 768px window
    runFrames(3);
    expect(scrollBy).not.toHaveBeenCalled();

    dragOver(300, 20);
    runFrames();
    expect(verticalScrolled().at(-1)!).toBeLessThan(0);

    dragOver(300, window.innerHeight - 20);
    runFrames();
    expect(verticalScrolled().at(-1)!).toBeGreaterThan(0);
    scroller.end();
  });

  it('20.135 moving out of the zone stops the loop (CONTROL: it was running)', () => {
    const scroller = createEdgeScroller();
    scroller.begin();
    dragOver(300, 20);
    runFrames(2);
    const whileInZone = scrollBy.mock.calls.length;
    expect(whileInZone).toBeGreaterThanOrEqual(2); // CONTROL — the loop really was driving scrolls
    dragOver(300, 384);
    runFrames(5);
    expect(scrollBy.mock.calls.length).toBe(whileInZone);
    scroller.end();
  });

  it.each([
    ['drop', () => document.dispatchEvent(new Event('drop', { bubbles: true })), false],
    ['dragend', () => document.dispatchEvent(new Event('dragend', { bubbles: true })), false],
    // Leaving the window pauses it; the drag is not over, so coming back into the zone resumes it.
    ['the pointer leaving the window', () => document.dispatchEvent(new MouseEvent('dragleave', { bubbles: true, relatedTarget: null })), true],
    ['unmount (end)', null, false],
  ])('20.135 %s stops it', (_name, stop, resumes) => {
    const scroller = createEdgeScroller();
    scroller.begin();
    dragOver(300, 20);
    runFrames();
    const before = scrollBy.mock.calls.length;
    expect(before).toBeGreaterThan(0); // CONTROL — running
    if (stop === null) scroller.end();
    else stop();
    runFrames(5);
    expect(scrollBy.mock.calls.length).toBe(before);
    // A later dragover revives it only where the drag is still alive (the pointer merely left the window).
    dragOver(300, 20);
    runFrames(3);
    if (resumes) expect(scrollBy.mock.calls.length).toBeGreaterThan(before);
    else expect(scrollBy.mock.calls.length).toBe(before);
    scroller.end();
  });
});

describe('20.137 near the rail’s left/right edge the RAIL scrolls sideways', () => {
  function plantRail() {
    const rail = document.createElement('div');
    rail.className = 'gn-board__rail';
    const inner = document.createElement('div');
    rail.append(inner);
    document.body.append(rail);
    rail.getBoundingClientRect = () => ({ left: 100, right: 900, top: 0, bottom: 500, width: 800, height: 500, x: 100, y: 0, toJSON: () => ({}) }) as DOMRect;
    return { rail, inner };
  }

  it('20.137 within the zone of the right edge the rail scrolls right, of the left edge left; the middle does nothing', () => {
    const { rail, inner } = plantRail();
    const scroller = createEdgeScroller();
    scroller.begin();
    rail.scrollLeft = 200;
    dragOver(500, 300, inner);
    runFrames(2);
    expect(rail.scrollLeft).toBe(200);

    dragOver(890, 300, inner);
    runFrames();
    expect(rail.scrollLeft).toBeGreaterThan(200);

    const right = rail.scrollLeft;
    dragOver(110, 300, inner);
    runFrames();
    expect(rail.scrollLeft).toBeLessThan(right);
    // The page itself did not scroll sideways or vertically for a pointer mid-height.
    expect(scrollBy).not.toHaveBeenCalled();
    scroller.end();
    rail.remove();
  });
});

describe('20.138 a landing slot is off-screen only when it is outside the viewport or the rail', () => {
  const viewport = { width: 1000, height: 700 };
  const rect = (left: number, top: number, width = 280, height = 120) =>
    ({ left, top, width, height, right: left + width, bottom: top + height }) as DOMRect;

  it('20.138 fully inside → on-screen; below, above, left or right of the viewport → off-screen', () => {
    expect(isOffscreen(rect(100, 100), viewport)).toBe(false);
    expect(isOffscreen(rect(100, 650), viewport)).toBe(true); // bottom edge 770 > 700
    expect(isOffscreen(rect(100, -60), viewport)).toBe(true);
    expect(isOffscreen(rect(-40, 100), viewport)).toBe(true);
    expect(isOffscreen(rect(900, 100), viewport)).toBe(true);
  });

  it('20.138 inside the viewport but outside the rail’s own visible box → off-screen', () => {
    const railBox = rect(0, 0, 600, 700);
    expect(isOffscreen(rect(100, 100), viewport, railBox)).toBe(false);
    expect(isOffscreen(rect(500, 100), viewport, railBox)).toBe(true);
  });
});
