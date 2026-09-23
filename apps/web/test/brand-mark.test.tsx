import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BrandMark } from '../src/brand-mark.js';

/**
 * 13.1471 — `BrandMark`, ONE origin for the glyph (owner request 2026-09-23:
 * "make it the favico[n]" and "put it on the nav bar"). Extracted verbatim from
 * `app/sign-in/page.tsx`'s `.gn-page-header__icon` tile — the folder outline plus
 * ITS TWO CROSSBARS, three `<path>` elements in total, not one. The favicon
 * (13.1473) and the nav brand tile (13.1474–13.1475) both render this component
 * rather than a second copy of the markup, so the three cannot drift apart.
 */
describe('BrandMark', () => {
  it('13.1471 renders the sign-in glyph unchanged: three paths, aria-hidden, unfocusable', () => {
    const { container } = render(<BrandMark size={30} />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute('width')).toBe('30');
    expect(svg?.getAttribute('height')).toBe('30');
    expect(svg?.getAttribute('viewBox')).toBe('0 0 24 24');
    expect(svg?.getAttribute('fill')).toBe('none');
    expect(svg?.getAttribute('stroke')).toBe('currentColor');
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
    expect(svg?.getAttribute('focusable')).toBe('false');

    // The array, not the count alone: two empty results would still pass a bare
    // length check. Ordered, so a mutation that reorders the crossbars reddens.
    const paths = [...(svg?.querySelectorAll('path') ?? [])].map((path) => path.getAttribute('d'));
    expect(paths).toHaveLength(3);
    expect(paths).toEqual([
      'M4 5.5A1.5 1.5 0 0 1 5.5 4H10l2 2.5h6.5A1.5 1.5 0 0 1 20 8v10.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5Z',
      'M8 13h8',
      'M8 16.5h5',
    ]);
  });

  it('13.1471b sizes the tile from the `size` prop, not a fixed literal', () => {
    const { container } = render(<BrandMark size={18} />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('width')).toBe('18');
    expect(svg?.getAttribute('height')).toBe('18');
  });
});
