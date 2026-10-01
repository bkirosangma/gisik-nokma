import { fireEvent, render } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SegmentedControl } from '../src/components/segmented-control.js';
import { useScrollEdges } from '../src/use-scroll-edges.js';

/**
 * UX fixes Task 6, case 23.092 (audit SYS-14, BRD-07, ENT-13, SET-25, WF-10, PV-04): `useScrollEdges` sets
 * `data-at-start` / `data-at-end` on a scroller so `.gn-scroll-fade` can mask the edge that has more content past it.
 * jsdom lays nothing out, so the three metrics the hook reads are stubbed on `HTMLElement.prototype`.
 */
const DIMS = { scrollWidth: 0, clientWidth: 0, scrollLeft: 0, scrollHeight: 0, clientHeight: 0, scrollTop: 0 };
const saved = new Map<string, PropertyDescriptor | undefined>();

beforeEach(() => {
  for (const key of Object.keys(DIMS) as Array<keyof typeof DIMS>) {
    saved.set(key, Object.getOwnPropertyDescriptor(HTMLElement.prototype, key));
    DIMS[key] = 0;
    Object.defineProperty(HTMLElement.prototype, key, {
      configurable: true,
      get: () => DIMS[key],
      set: (value: number) => {
        DIMS[key] = value;
      },
    });
  }
});
afterEach(() => {
  for (const [key, descriptor] of saved) {
    if (descriptor === undefined) delete (HTMLElement.prototype as unknown as Record<string, unknown>)[key];
    else Object.defineProperty(HTMLElement.prototype, key, descriptor);
  }
  saved.clear();
});

function Scroller(props: { axis?: 'x' | 'y'; ownRef?: React.MutableRefObject<HTMLDivElement | null> }) {
  const ref = useScrollEdges<HTMLDivElement>(props.axis, props.ownRef);
  return <div ref={ref} data-testid="scroller" className="gn-scroll-fade" />;
}

describe('23.092 useScrollEdges', () => {
  it('23.092 content overflowing to the right sets data-at-end="false" and data-at-start="true"', () => {
    Object.assign(DIMS, { scrollWidth: 500, clientWidth: 200, scrollLeft: 0 });
    const { getByTestId } = render(<Scroller />);
    const el = getByTestId('scroller');
    expect(el.getAttribute('data-at-end')).toBe('false');
    expect(el.getAttribute('data-at-start')).toBe('true');
    // Scrolling away from the start hides the start edge too; scrolled to the end, only the end edge clears.
    DIMS.scrollLeft = 100;
    fireEvent.scroll(el);
    expect(el.getAttribute('data-at-start')).toBe('false');
    expect(el.getAttribute('data-at-end')).toBe('false');
    // CONTROL — at the far end there is nothing more to the right: no fade at the end.
    DIMS.scrollLeft = 300;
    fireEvent.scroll(el);
    expect(el.getAttribute('data-at-end')).toBe('true');
    expect(el.getAttribute('data-at-start')).toBe('false');
  });

  it('23.092 a scroller whose content fits has no edge to fade, and the vertical axis reads scrollTop and the heights', () => {
    Object.assign(DIMS, { scrollWidth: 200, clientWidth: 200 });
    const fits = render(<Scroller />);
    expect(fits.getByTestId('scroller').getAttribute('data-at-start')).toBe('true');
    expect(fits.getByTestId('scroller').getAttribute('data-at-end')).toBe('true');
    fits.unmount();

    // The width fits but the height does not: the x-axis hook still says "nothing to fade", the y-axis hook fades the bottom.
    Object.assign(DIMS, { scrollWidth: 200, clientWidth: 200, scrollHeight: 900, clientHeight: 300, scrollTop: 0 });
    const x = render(<Scroller axis="x" />);
    expect(x.getByTestId('scroller').getAttribute('data-at-end')).toBe('true');
    x.unmount();
    const y = render(<Scroller axis="y" />);
    expect(y.getByTestId('scroller').getAttribute('data-at-end')).toBe('false');
    expect(y.getByTestId('scroller').getAttribute('data-at-start')).toBe('true');
  });

  it('23.092 the hook leaves the caller its own ref (the board rail already holds one)', () => {
    Object.assign(DIMS, { scrollWidth: 500, clientWidth: 200 });
    const own = createRef<HTMLDivElement>() as React.MutableRefObject<HTMLDivElement | null>;
    const { getByTestId, unmount } = render(<Scroller ownRef={own} />);
    expect(own.current).toBe(getByTestId('scroller'));
    unmount();
    expect(own.current).toBeNull();
  });
});

describe('23.092 SegmentedControl fade', () => {
  const options = [
    { value: 'a', label: 'Alpha' },
    { value: 'b', label: 'Beta' },
  ];

  it('23.092 `fade` puts the utility on the track and drives its edges', () => {
    Object.assign(DIMS, { scrollWidth: 500, clientWidth: 200 });
    const { getByRole } = render(<SegmentedControl options={options} value="a" onChange={() => {}} aria-label="View" fade />);
    const track = getByRole('tablist');
    expect(track.className).toContain('gn-scroll-fade');
    expect(track.getAttribute('data-at-end')).toBe('false');
  });

  it('23.092 CONTROL: without `fade` the track is the control it always was', () => {
    Object.assign(DIMS, { scrollWidth: 500, clientWidth: 200 });
    const { getByRole } = render(<SegmentedControl options={options} value="a" onChange={() => {}} aria-label="View" />);
    const track = getByRole('tablist');
    expect(track.className).not.toContain('gn-scroll-fade');
    expect(track.getAttribute('data-at-end')).toBeNull();
  });
});
