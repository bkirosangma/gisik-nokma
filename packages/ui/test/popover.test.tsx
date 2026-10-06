import { useRef, useState } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { Popover } from '../src/components/popover.js';

function Host() {
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button ref={ref} type="button" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        Trigger
      </button>
      <p>outside</p>
      <Popover triggerRef={ref} open={open} onClose={() => setOpen(false)} aria-label="Choices">
        <label><input type="radio" name="x" /> One</label>
        <button type="button">Apply</button>
      </Popover>
    </div>
  );
}
afterEach(cleanup);

describe('Popover', () => {
  it('13.1267 opens as a named dialog portalled to body, moves focus inside, and Escape closes it and returns focus to the trigger', async () => {
    const user = userEvent.setup();
    render(<Host />);
    expect(screen.queryByRole('dialog')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Trigger' }));
    const dialog = screen.getByRole('dialog', { name: 'Choices' });
    expect(dialog.parentElement).toBe(document.body);
    expect(dialog.contains(document.activeElement)).toBe(true);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    // `FocusScope` restores inside a `requestAnimationFrame` (see `select.tsx`'s
    // `SelectPanel` docblock and `select.test.tsx`'s E4-17 cases), so the settle is async.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Trigger' })).toHaveFocus());
  });

  it('13.1268 an outside click closes it; a click INSIDE does not (the control)', async () => {
    const user = userEvent.setup();
    render(<Host />);
    await user.click(screen.getByRole('button', { name: 'Trigger' }));
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByText('outside'));
    fireEvent.mouseUp(screen.getByText('outside'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

/*
 * 18.256a — the browser case 18.256's failure, without a browser. jsdom has no layout, so this
 * models the three inputs react-aria's `useOverlayPosition` reads — the viewport, the trigger's
 * rect, and the overlay's offset size — plus the ResizeObserver delivery a browser makes after
 * layout: only to an observer one of whose elements changed size (an element's first delivery is
 * its first non-zero size). The numbers are 18.256's own, from its CI trace at 1280x720: the
 * trigger centred at y≈420 in the sheet body, the popover opened at `top: 448px` with
 * `max-height: 260px`, and grown to 293 px by the people list.
 */
const VIEWPORT = { width: 1280, height: 720 };
const TRIGGER_RECT = { top: 398, left: 1080, width: 120, height: 44 };
const POPOVER_WIDTH = 320;
// `.gn-popover`'s `padding: 0.75rem`, top and bottom.
const POPOVER_PADDING = 12;

// The popover's content height: its padding plus every `data-row-height` row it holds.
function contentHeight(popover: HTMLElement): number {
  let height = 2 * POPOVER_PADDING;
  popover.querySelectorAll<HTMLElement>('[data-row-height]').forEach((row) => {
    height += Number(row.dataset.rowHeight);
  });
  return height;
}

// Its box: the content, capped by a pixel `max-height` (react-aria's own cap). `.gn-popover` sets
// no `overflow`, so content past the cap spills out of the box, as it does in the browser.
function boxHeight(popover: HTMLElement): number {
  const cap = /^(\d+(?:\.\d+)?)px$/.exec(popover.style.maxHeight);
  return Math.min(contentHeight(popover), cap ? Number(cap[1]) : Number.POSITIVE_INFINITY);
}

function installLayout() {
  const restores: Array<() => void> = [];
  const define = (target: object, key: string, descriptor: PropertyDescriptor) => {
    const own = Object.getOwnPropertyDescriptor(target, key);
    Object.defineProperty(target, key, { configurable: true, ...descriptor });
    restores.push(() => {
      if (own) Object.defineProperty(target, key, own);
      else delete (target as Record<string, unknown>)[key];
    });
  };
  const placed = new Map<Element, { top: number; left: number; width: number; height: number }>();
  const isPopover = (el: HTMLElement) => el.classList.contains('gn-popover');

  define(window, 'visualViewport', {
    value: {
      ...VIEWPORT,
      scale: 1,
      offsetTop: 0,
      offsetLeft: 0,
      pageTop: 0,
      pageLeft: 0,
      addEventListener() {},
      removeEventListener() {},
    },
  });
  define(document.documentElement, 'clientWidth', { get: () => VIEWPORT.width });
  define(document.documentElement, 'clientHeight', { get: () => VIEWPORT.height });
  define(HTMLElement.prototype, 'offsetWidth', {
    get(this: HTMLElement) {
      return isPopover(this) ? POPOVER_WIDTH : (placed.get(this)?.width ?? 0);
    },
  });
  define(HTMLElement.prototype, 'offsetHeight', {
    get(this: HTMLElement) {
      return isPopover(this) ? boxHeight(this) : (placed.get(this)?.height ?? 0);
    },
  });
  const jsdomRect = Element.prototype.getBoundingClientRect;
  define(HTMLElement.prototype, 'getBoundingClientRect', {
    value(this: HTMLElement) {
      const rect = placed.get(this);
      if (!rect) return jsdomRect.call(this);
      const { top, left, width, height } = rect;
      return { top, left, width, height, x: left, y: top, right: left + width, bottom: top + height, toJSON() {} };
    },
  });

  type Observation = { callback: ResizeObserverCallback; sizes: Map<Element, string>; observer: ResizeObserver };
  const observations: Observation[] = [];
  class LayoutResizeObserver {
    private readonly observation: Observation;
    constructor(callback: ResizeObserverCallback) {
      this.observation = { callback, sizes: new Map(), observer: this as unknown as ResizeObserver };
      observations.push(this.observation);
    }
    observe(el: Element) {
      this.observation.sizes.set(el, '0x0');
    }
    unobserve(el: Element) {
      this.observation.sizes.delete(el);
    }
    disconnect() {
      this.observation.sizes.clear();
    }
  }
  define(window, 'ResizeObserver', { value: LayoutResizeObserver, writable: true });

  const sizeOf = (el: Element) => `${(el as HTMLElement).offsetWidth}x${(el as HTMLElement).offsetHeight}`;
  return {
    place(el: Element, rect: { top: number; left: number; width: number; height: number }) {
      placed.set(el, rect);
    },
    // One frame's ResizeObserver delivery, repeated while a callback's own work changes a size
    // again — as a browser does, up to a bound.
    deliver() {
      for (let pass = 0; pass < 8; pass += 1) {
        let delivered = false;
        for (const observation of observations) {
          const changed = [...observation.sizes].filter(([el, last]) => sizeOf(el) !== last).map(([el]) => el);
          if (changed.length === 0) continue;
          for (const el of changed) observation.sizes.set(el, sizeOf(el));
          delivered = true;
          act(() => {
            observation.callback(
              changed.map((target) => ({ target }) as ResizeObserverEntry),
              observation.observer,
            );
          });
        }
        if (!delivered) return;
      }
      throw new Error('ResizeObserver delivery never settled');
    },
    restore() {
      for (const restore of restores.reverse()) restore();
    },
  };
}

// The visibility menu's shape: the modes, then — only once "Only the people I name" is picked —
// the people list, then Apply. The list is the CONTENT's own state, so the Popover itself does
// not re-render when it appears: only a resize can tell it the content grew.
function VisibilityShapedContent() {
  const [explicit, setExplicit] = useState(false);
  return (
    <>
      <fieldset data-row-height="160">
        <label>
          <input type="radio" name="mode" onChange={() => setExplicit(false)} /> Everyone on the project
        </label>
        <label>
          <input type="radio" name="mode" onChange={() => setExplicit(true)} /> Only the people I name
        </label>
      </fieldset>
      {explicit ? (
        <ul data-row-height="61">
          <li>kiro</li>
          <li>accountant</li>
        </ul>
      ) : null}
      <button type="button" data-row-height="48">
        Apply
      </button>
    </>
  );
}

function GrowingHost() {
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button ref={ref} type="button" onClick={() => setOpen((v) => !v)}>
        Trigger
      </button>
      <Popover triggerRef={ref} open={open} onClose={() => setOpen(false)} aria-label="Change who can see this">
        <VisibilityShapedContent />
      </Popover>
    </div>
  );
}

// Where the popover is, as react-aria leaves it: compared by value, because its direct style writes
// reorder the `style` attribute without moving anything.
function placementOf(popover: HTMLElement) {
  const { position, top, bottom, left, maxHeight } = popover.style;
  return { placement: popover.dataset.placement, position, top, bottom, left, maxHeight };
}

// The bottom edge of the popover's last row (Apply) in the viewport: the box's top, wherever
// react-aria anchored it, plus the content (which spills past a capped box) less the padding.
function actionsBottom(popover: HTMLElement): number {
  const top =
    popover.style.top !== ''
      ? Number.parseFloat(popover.style.top)
      : VIEWPORT.height - Number.parseFloat(popover.style.bottom) - boxHeight(popover);
  return top + contentHeight(popover) - POPOVER_PADDING;
}

describe('Popover — content that grows after it opens', () => {
  it('18.256a re-positions when the content outgrows the space below: it flips above the trigger and its actions stay inside the viewport; its first frame is already placed, on open and on reopen', async () => {
    const layout = installLayout();
    try {
      const user = userEvent.setup();
      render(<GrowingHost />);
      layout.place(screen.getByRole('button', { name: 'Trigger' }), TRIGGER_RECT);
      layout.deliver();

      await user.click(screen.getByRole('button', { name: 'Trigger' }));
      const popover = screen.getByRole('dialog', { name: 'Change who can see this' });
      // The control: 232 px fits the 260 px below the trigger, so it opens there — 18.256's trace.
      const below = { placement: 'bottom', position: 'absolute', top: '448px', bottom: '', left: '880px', maxHeight: '260px' };
      // The first frame: the opening commit itself places it (react-aria's layout effect, which runs
      // before the browser paints), BEFORE any ResizeObserver delivery or animation frame — no first
      // frame at the unpositioned `position: fixed; top: 0; left: 0`.
      expect(placementOf(popover)).toEqual(below);
      layout.deliver();
      // The first measurement after layout leaves it where it was painted.
      expect(placementOf(popover)).toEqual(below);
      expect(actionsBottom(popover)).toBeLessThanOrEqual(VIEWPORT.height);

      await user.click(screen.getByRole('radio', { name: 'Only the people I name' }));
      layout.deliver();
      // 293 px no longer fits the 260 px below; the 380 px above does. Left below, Apply's bottom
      // sat at 448 + 293 - 12 = 729, past the 720 px fold, and the scroll that reached it closed
      // the popover (react-aria's close-on-scroll).
      expect(popover).toHaveAttribute('data-placement', 'top');
      // Its bottom edge 6 px above the trigger: 720 - 328 = 392 = 398 - 6.
      expect(popover.style.bottom).toBe('328px');
      expect(actionsBottom(popover)).toBeLessThanOrEqual(VIEWPORT.height);

      // Reopened after the flip, its content is short again (the list closed with it): the first
      // frame is already at the NEW spot below the trigger, not the old one above it.
      await user.keyboard('{Escape}');
      expect(screen.queryByRole('dialog')).toBeNull();
      await user.click(screen.getByRole('button', { name: 'Trigger' }));
      const reopened = screen.getByRole('dialog', { name: 'Change who can see this' });
      expect(placementOf(reopened)).toEqual(below);
      layout.deliver();
      expect(placementOf(reopened)).toEqual(below);
    } finally {
      layout.restore();
    }
  });
});
