import { createRef } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReadingProgress } from '../src/reading/ReadingProgress.js';
import { ReadingTOC } from '../src/reading/ReadingTOC.js';
import { findScroller, readingProgress } from '../src/reading/scroller.js';

/**
 * 9.403–9.408 — KB-parity audit of the reading surface: which element scrolls.
 *
 * The source's `ReadingTOC`/`ReadingProgress` read and drive "the scroll
 * container" they are handed. gisik's note page scrolls the WINDOW and hands
 * them a `min-height` box, so the source's `scrollTop` reads 0 forever and its
 * `scrollTo` does nothing. Every case here is written against BOTH hosts, and
 * the window arm is the one the source would have failed.
 */

function rect(top: number, height: number): DOMRect {
  return { top, height, bottom: top + height, left: 0, right: 0, width: 0, x: 0, y: top, toJSON: () => ({}) };
}

afterEach(() => {
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

describe('9.403 findScroller', () => {
  it('9.403 picks the nearest overflow ancestor, and the window when none scrolls', () => {
    const outer = document.createElement('div');
    outer.style.overflowY = 'scroll';
    const inner = document.createElement('div');
    inner.style.overflowY = 'auto';
    const surface = document.createElement('div');
    outer.append(inner);
    inner.append(surface);
    document.body.append(outer);
    const found = findScroller(surface);
    expect(found.kind).toBe('element');
    expect(found.kind === 'element' && found.element).toBe(inner); // nearest, not outermost

    const plain = document.createElement('div');
    const child = document.createElement('div');
    plain.append(child);
    document.body.append(plain);
    expect(findScroller(child)).toEqual({ kind: 'window' });
    // `overflow: hidden` is not a scroller.
    plain.style.overflowY = 'hidden';
    expect(findScroller(child)).toEqual({ kind: 'window' });
  });
});

describe('9.404 readingProgress', () => {
  it('9.404 element scroller: scrollTop over the scrollable range; window: the surface top over its own range', () => {
    const el = document.createElement('div');
    Object.defineProperty(el, 'scrollHeight', { value: 1000 });
    Object.defineProperty(el, 'clientHeight', { value: 400 });
    el.scrollTop = 300;
    expect(readingProgress(el, { kind: 'element', element: el })).toBeCloseTo(0.5);
    el.scrollTop = 9999;
    expect(readingProgress(el, { kind: 'element', element: el })).toBe(1);

    vi.stubGlobal('innerHeight', 800);
    const surface = document.createElement('div');
    surface.getBoundingClientRect = () => rect(-500, 2000); // 500px above the top of a 2000px surface
    expect(readingProgress(surface, { kind: 'window' })).toBeCloseTo(500 / 1200);
    surface.getBoundingClientRect = () => rect(120, 2000); // not reached yet (a title above it)
    expect(readingProgress(surface, { kind: 'window' })).toBe(0);
    surface.getBoundingClientRect = () => rect(0, 700); // fits in the viewport
    expect(readingProgress(surface, { kind: 'window' })).toBe(0);
  });
});

describe('9.405 ReadingProgress on a window-scrolled page', () => {
  it('9.405 is a labelled progressbar that follows the window scroll and starts over on a new note', async () => {
    vi.stubGlobal('innerHeight', 800);
    const ref = createRef<HTMLDivElement>();
    let top = 0;
    const view = (key: string, progressRef: { current: HTMLElement | null } = ref) => (
      <div>
        <div
          ref={(node) => {
            (ref as { current: HTMLDivElement | null }).current = node;
            if (node !== null) node.getBoundingClientRect = () => rect(top, 2000);
          }}
        />
        <ReadingProgress scrollContainerRef={progressRef} resetKey={key} />
      </div>
    );
    const { rerender } = render(view('a'));
    const bar = screen.getByRole('progressbar', { name: 'Reading progress' });
    expect(bar.getAttribute('aria-valuemin')).toBe('0');
    expect(bar.getAttribute('aria-valuemax')).toBe('100');
    expect(bar.getAttribute('aria-valuenow')).toBe('0');

    top = -600; // half of the 1200px range
    fireEvent.scroll(window);
    await vi.waitFor(() => expect(bar.getAttribute('aria-valuenow')).toBe('50'));
    expect((bar.firstElementChild as HTMLElement).style.transform).toBe('scaleX(0.5)');

    // A different note: back to zero even though nothing scrolled.
    top = 0;
    rerender(view('b'));
    await vi.waitFor(() => expect(bar.getAttribute('aria-valuenow')).toBe('0'));

    // …and when the new note's surface is not there yet (still loading), the
    // bar must not keep the old note's position.
    top = -600;
    fireEvent.scroll(window);
    await vi.waitFor(() => expect(bar.getAttribute('aria-valuenow')).toBe('50'));
    rerender(view('c', { current: null }));
    await vi.waitFor(() => expect(bar.getAttribute('aria-valuenow')).toBe('0'));
  });
});

describe('9.406 ReadingProgress on a pane-scrolled page', () => {
  it('9.406 listens to the scrolling ancestor, and not to the window', async () => {
    const pane = document.createElement('div');
    pane.style.overflowY = 'auto';
    Object.defineProperty(pane, 'scrollHeight', { value: 1000 });
    Object.defineProperty(pane, 'clientHeight', { value: 500 });
    document.body.append(pane);
    const surface = document.createElement('div');
    pane.append(surface);
    const ref = { current: surface };
    render(<ReadingProgress scrollContainerRef={ref} />);
    const bar = screen.getByRole('progressbar');

    pane.scrollTop = 250;
    fireEvent.scroll(pane);
    await vi.waitFor(() => expect(bar.getAttribute('aria-valuenow')).toBe('50'));

    pane.scrollTop = 500;
    act(() => {
      fireEvent.scroll(window); // the window moving must not be read as the pane
    });
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(bar.getAttribute('aria-valuenow')).toBe('50');
  });
});

const THREE = [
  { id: 'one', level: 1 as const, text: 'One' },
  { id: 'two', level: 2 as const, text: 'Two' },
  { id: 'three', level: 3 as const, text: 'Three' },
];

function mountToc(withPane: boolean) {
  const host = document.createElement('div');
  if (withPane) host.style.overflowY = 'auto';
  document.body.append(host);
  const root = document.createElement('div');
  for (const heading of THREE) {
    const h = document.createElement('h2');
    h.id = heading.id;
    h.textContent = heading.text;
    root.append(h);
  }
  host.append(root);
  return { host, root, ref: { current: root } };
}

describe('9.407 ReadingTOC click', () => {
  it('9.407 scrolls the HEADING into view (whichever ancestor scrolls), smoothly unless motion is reduced', () => {
    const { root, ref } = mountToc(false);
    const scrollIntoView = vi.fn();
    const target = root.querySelector('#two') as HTMLElement;
    target.scrollIntoView = scrollIntoView;
    const rootScrollTo = vi.fn();
    root.scrollTo = rootScrollTo;
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    render(<ReadingTOC headings={THREE} scrollContainerRef={ref} />);
    const link = screen.getByRole('link', { name: 'Two' });
    expect(fireEvent.click(link)).toBe(false); // default prevented: we scroll, not the hash jump
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'start', behavior: 'smooth' });
    expect(rootScrollTo).not.toHaveBeenCalled(); // the source's no-op on a non-scrolling root
    expect(link.getAttribute('aria-current')).toBe('true');

    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    fireEvent.click(screen.getByRole('link', { name: 'Three' }));
    // (the second heading's own stub is not installed: the call above must not throw either)
    const three = root.querySelector('#three') as HTMLElement;
    three.scrollIntoView = scrollIntoView;
    fireEvent.click(screen.getByRole('link', { name: 'Three' }));
    expect(scrollIntoView).toHaveBeenLastCalledWith({ block: 'start', behavior: 'auto' });
  });
});

describe('9.408 ReadingTOC scrollspy root', () => {
  it('9.408 observes against the viewport when the window scrolls, and against the pane when a pane does', () => {
    const seen: Array<Element | Document | null | undefined> = [];
    class FakeObserver {
      constructor(_cb: unknown, options: IntersectionObserverInit) {
        seen.push(options.root);
      }
      observe() {}
      disconnect() {}
    }
    vi.stubGlobal('IntersectionObserver', FakeObserver);

    const windowHost = mountToc(false);
    render(<ReadingTOC headings={THREE} scrollContainerRef={windowHost.ref} />);
    expect(seen).toEqual([null]);

    document.body.innerHTML = '';
    seen.length = 0;
    const paneHost = mountToc(true);
    render(<ReadingTOC headings={THREE} scrollContainerRef={paneHost.ref} />);
    expect(seen).toEqual([paneHost.host]);
  });
});
