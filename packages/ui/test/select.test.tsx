import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CheckIcon, RemoveIcon, SearchIcon } from '../src/select/select-icons.js';

describe('select icon glyphs', () => {
  it('render as aria-hidden inline SVGs with at least one path or circle', () => {
    for (const Icon of [CheckIcon, RemoveIcon, SearchIcon]) {
      const { container } = render(<Icon />);
      const svg = container.querySelector('svg');
      expect(svg).not.toBeNull();
      expect(svg).toHaveAttribute('aria-hidden', 'true');
      expect(svg?.querySelectorAll('path, circle, line').length ?? 0).toBeGreaterThan(0);
    }
  });
});
