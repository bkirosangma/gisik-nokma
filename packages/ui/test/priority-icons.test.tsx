import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FireIcon, FlagIcon, LeafIcon, SnowflakeIcon } from '../src/icons/priority-icons.js';

/**
 * 13.1451 — the board card's four glyphs (owner request, 2026-09-23), the
 * same shape `select.test.tsx`'s "select icon glyphs" describe already pins
 * for this package's other inline icons: `aria-hidden`, a real 24×24
 * viewBox, `currentColor` so each glyph obeys the ink of whatever colour
 * role it sits in, and at least one drawn path.
 */
describe('13.1451 the four board icons render as aria-hidden 24×24 currentColor SVGs', () => {
  it('every icon carries the shared contract', () => {
    for (const Icon of [FireIcon, LeafIcon, SnowflakeIcon, FlagIcon]) {
      const { container } = render(<Icon />);
      const svg = container.querySelector('svg');
      expect(svg).not.toBeNull();
      expect(svg).toHaveAttribute('aria-hidden', 'true');
      expect(svg).toHaveAttribute('viewBox', '0 0 24 24');
      expect(svg).toHaveAttribute('stroke', 'currentColor');
      expect(svg?.querySelectorAll('path').length ?? 0).toBeGreaterThan(0);
    }
  });

  it('accepts a size override, the same `size` prop every other icon in this package takes', () => {
    const { container } = render(<FireIcon size={20} />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('width', '20');
    expect(svg).toHaveAttribute('height', '20');
  });
});
