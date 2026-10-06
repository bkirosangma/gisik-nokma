import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SegmentedControl } from '../src/components/segmented-control.js';

/**
 * Case 27.684 (kg-walk-fixes-2 item 1): `keepSelectedInView` scrolls the TRACK, by the least amount, until the selected
 * option sits inside the track's scrollport inset by its `scroll-padding`. jsdom lays nothing out, so the geometry is
 * stubbed: the track is the port [100, 400] with 24px of scroll-padding a side (the inset port is [124, 376]), and each
 * option's box comes from `BOXES` by its label. The browser half (a real tap, the real fade) is 27.683.
 */
const BOXES: Record<string, [number, number]> = {};
const scrollTo = vi.fn();
let pad = { left: '24px', right: '24px' };
let reduced = false;

beforeEach(() => {
  scrollTo.mockClear();
  pad = { left: '24px', right: '24px' };
  reduced = false;
  Object.assign(BOXES, { Alpha: [124, 180], Beta: [182, 300], Gamma: [302, 420] });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const [left, right] = this.getAttribute('role') === 'tablist' ? [100, 400] : (BOXES[this.textContent ?? ''] ?? [0, 0]);
    return { left, right, top: 0, bottom: 44, width: right - left, height: 44, x: left, y: 0, toJSON: () => ({}) } as DOMRect;
  });
  (HTMLElement.prototype as unknown as { scrollTo: unknown }).scrollTo = scrollTo;
  const real = window.getComputedStyle;
  vi.spyOn(window, 'getComputedStyle').mockImplementation((element: Element, pseudo?: string | null) => {
    const style = real(element, pseudo);
    if (element.getAttribute('role') !== 'tablist') return style;
    return Object.assign(Object.create(style) as CSSStyleDeclaration, { scrollPaddingLeft: pad.left, scrollPaddingRight: pad.right });
  });
  window.matchMedia = ((query: string) => ({ matches: reduced && query.includes('reduce'), media: query })) as unknown as typeof window.matchMedia;
});
afterEach(() => {
  vi.restoreAllMocks();
  delete (HTMLElement.prototype as unknown as { scrollTo?: unknown }).scrollTo;
});

const OPTIONS = [
  { value: 'a', label: 'Alpha' },
  { value: 'b', label: 'Beta' },
  { value: 'c', label: 'Gamma' },
];
const mount = (value: string, keep = true) =>
  render(<SegmentedControl options={OPTIONS} value={value} onChange={() => {}} aria-label="View" fade keepSelectedInView={keep} />);

describe('27.684 SegmentedControl keepSelectedInView', () => {
  it('27.684 an option past the END scrolls the track (not the option) by exactly its overhang past the inset port', () => {
    const { getByRole, rerender } = mount('a');
    expect(scrollTo).not.toHaveBeenCalled(); // CONTROL, same it: Alpha [124, 180] is inside the inset port
    scrollTo.mockClear();
    // The track is already scrolled 30px (jsdom keeps scrollLeft at 0, so it is set on the element): the target is
    // relative to where the track is, not to its start.
    Object.defineProperty(getByRole('tablist'), 'scrollLeft', { value: 30, configurable: true });
    rerender(<SegmentedControl options={OPTIONS} value="c" onChange={() => {}} aria-label="View" fade keepSelectedInView />);
    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(scrollTo.mock.contexts[0]).toBe(getByRole('tablist'));
    // Gamma's right 420 against the inset end 376: 44px past it, from a scrollLeft of 30.
    expect(scrollTo).toHaveBeenCalledWith({ left: 74, behavior: 'smooth' });
  });

  it('27.684 an option before the START scrolls back by its overhang (negative), clear of the start inset', () => {
    BOXES['Alpha'] = [60, 120];
    mount('a');
    // Alpha's left 60 against the inset start 124: -64.
    expect(scrollTo).toHaveBeenCalledWith({ left: -64, behavior: 'smooth' });
  });

  it('27.684 an option inside the inset port does not scroll; the boundaries are inclusive (just inside: none; one px out: one px)', () => {
    BOXES['Beta'] = [124, 376];
    mount('b');
    expect(scrollTo).not.toHaveBeenCalled();
    BOXES['Beta'] = [124, 377];
    mount('b');
    expect(scrollTo).toHaveBeenLastCalledWith({ left: 1, behavior: 'smooth' });
    scrollTo.mockClear();
    BOXES['Beta'] = [123, 376];
    mount('b');
    expect(scrollTo).toHaveBeenLastCalledWith({ left: -1, behavior: 'smooth' });
  });

  it('27.684 the inset is the track\'s own scroll-padding (240px is ten times the fade, 2.4px a tenth); "auto" is none', () => {
    BOXES['Beta'] = [182, 300];
    pad = { left: '240px', right: '240px' };
    mount('b');
    // the inset port is [340, 160] (narrower than Beta): the start wins, 182 - 340.
    expect(scrollTo).toHaveBeenLastCalledWith({ left: -158, behavior: 'smooth' });
    scrollTo.mockClear();
    BOXES['Gamma'] = [302, 399];
    pad = { left: '2.4px', right: '2.4px' };
    mount('c');
    expect(scrollTo).toHaveBeenLastCalledWith({ left: expect.closeTo(1.4, 5), behavior: 'smooth' });
    scrollTo.mockClear();
    pad = { left: 'auto', right: 'auto' };
    mount('c'); // 399 <= 400: inside the bare port
    expect(scrollTo).not.toHaveBeenCalled();
    BOXES['Gamma'] = [302, 420];
    mount('c'); // 420 against the bare port's 400: "auto" is a zero inset, not a reason to stay put
    expect(scrollTo).toHaveBeenLastCalledWith({ left: 20, behavior: 'smooth' });
  });

  it('27.684 a reader who asked for less motion gets an instant scroll', () => {
    reduced = true;
    mount('c');
    expect(scrollTo).toHaveBeenCalledWith({ left: 44, behavior: 'auto' });
  });

  it('27.684 CONTROL: without the prop nothing scrolls, on mount or on a change; a value no option has scrolls nothing; and a track with no scrollTo (jsdom) is left alone', () => {
    const { rerender } = mount('c', false);
    rerender(<SegmentedControl options={OPTIONS} value="a" onChange={() => {}} aria-label="View" fade />);
    expect(scrollTo).not.toHaveBeenCalled();
    expect(() => mount('none-of-them')).not.toThrow();
    expect(scrollTo).not.toHaveBeenCalled();
    delete (HTMLElement.prototype as unknown as { scrollTo?: unknown }).scrollTo;
    expect(() => mount('c')).not.toThrow();
  });

  it('27.684 a track without `fade` keeps the selected option in view too (the ref is the track either way)', () => {
    render(<SegmentedControl options={OPTIONS} value="c" onChange={() => {}} aria-label="View" keepSelectedInView />);
    expect(scrollTo).toHaveBeenCalledWith({ left: 44, behavior: 'smooth' });
  });
});
