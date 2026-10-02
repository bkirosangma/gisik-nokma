import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

let pending = false;
vi.mock('next/link', async () => {
  const actual = await vi.importActual<typeof import('next/link')>('next/link');
  return { ...actual, useLinkStatus: () => ({ pending }) };
});
import { NavPending } from '../src/nav-pending.js';

describe('NavPending: a fixed-size, opacity-only hint from useLinkStatus (spec P10; audit SM-02)', () => {
  it('25.054 the wrapper carries data-pending from the link status and never changes its children', () => {
    pending = true;
    const on = render(<NavPending>Inbox</NavPending>).container.firstElementChild!;
    expect(on).toHaveAttribute('data-pending', 'true');
    expect(on.textContent).toBe('Inbox');
    // Control: not pending, same children.
    pending = false;
    const off = render(<NavPending>Inbox</NavPending>).container.firstElementChild!;
    expect(off).toHaveAttribute('data-pending', 'false');
    expect(off.textContent).toBe('Inbox');
    expect(off.className).toBe('gn-nav__pending');
  });
});
