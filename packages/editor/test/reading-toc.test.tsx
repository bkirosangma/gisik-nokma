import { createRef } from 'react';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ReadingTOC } from '../src/reading/ReadingTOC.js';
import type { ReadingMeta } from '../src/reading/reading-meta.js';

/**
 * 9.290 — the reading rail's ONE visibility rule (spec §8.2).
 *
 * The source also gated on `window.innerWidth >= 1100`; the port moved that to
 * the page, because a breakpoint inside a component cannot be overridden by a
 * stylesheet and is a second, hidden definition of "there is room". So the
 * only rule left to pin is the heading count — and it is pinned in BOTH
 * directions in one case, because a component that always returned `null`
 * would satisfy the first arm alone.
 */
const THREE: ReadingMeta['headings'] = [
  { id: 'one', level: 1, text: 'One' },
  { id: 'two', level: 2, text: 'Two' },
  { id: 'three', level: 3, text: 'Three' },
];

function mount(headings: ReadingMeta['headings']) {
  const ref = createRef<HTMLDivElement>();
  return render(
    <div ref={ref}>
      <ReadingTOC headings={headings} scrollContainerRef={ref} />
    </div>,
  );
}

describe('9.290 ReadingTOC', () => {
  it('9.290 renders nothing under three headings, and one link per heading at three', () => {
    const two = mount(THREE.slice(0, 2));
    expect(two.container.querySelector('nav')).toBeNull();
    expect(two.container.textContent).toBe('');
    two.unmount();

    const three = mount(THREE);
    const nav = screen.getByRole('navigation', { name: 'On this page' });
    const links = within(nav).getAllByRole('link');
    expect(links.map((link) => link.textContent)).toEqual(['One', 'Two', 'Three']);
    // Each entry addresses the id `extractReadingMeta` stamped, which is the
    // only reason the two halves work together.
    expect(links.map((link) => link.getAttribute('href'))).toEqual(['#one', '#two', '#three']);
    three.unmount();
  });
});
