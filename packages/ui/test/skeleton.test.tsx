import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Skeleton, SkeletonRegion } from '../src/components/skeleton.js';
import { Pending } from '../src/components/pending.js';
import { Button } from '../src/components/button.js';
import { WAIT_BEFORE_MS, WAIT_HOLD_MS } from '../src/use-wait.js';

describe('Skeleton, SkeletonRegion, Pending, Button busy (spec §4.1, S6; amendment S-R1: the shapes are the PARTS)', () => {
  afterEach(() => vi.useRealTimers());

  it('25.014 a skeleton is aria-hidden, carries its shape class and its size variables, and rows repeat inside one wrapper', () => {
    const { container } = render(<Skeleton shape="card" width="12rem" height="5.5rem" rows={3} />);
    const blocks = container.querySelectorAll('.gn-skeleton.gn-skeleton--card[aria-hidden="true"]');
    expect(blocks).toHaveLength(3);
    expect((blocks[0] as HTMLElement).style.getPropertyValue('--gn-skeleton-w')).toBe('12rem');
    expect((blocks[0] as HTMLElement).style.getPropertyValue('--gn-skeleton-h')).toBe('5.5rem');
    expect(container.querySelectorAll('.gn-skeleton__rows')).toHaveLength(1);
    // Control: a single line has no rows wrapper and defaults to the line shape.
    const one = render(<Skeleton />).container;
    expect(one.querySelector('.gn-skeleton__rows')).toBeNull();
    expect(one.querySelector('.gn-skeleton--line')).not.toBeNull();
    // S-R1 parts: line, block and circle each render their own shape class.
    const parts = render(<><Skeleton shape="line" /><Skeleton shape="block" /><Skeleton shape="circle" /></>).container;
    for (const shape of ['line', 'block', 'circle']) expect(parts.querySelectorAll(`.gn-skeleton--${shape}`), shape).toHaveLength(1);
  });

  it('25.015 a SkeletonRegion is aria-busy and names what is loading ONCE, visually hidden', () => {
    render(
      <SkeletonRegion label="Loading the board">
        <Skeleton rows={4} />
      </SkeletonRegion>,
    );
    const region = screen.getByText('Loading the board').parentElement!;
    expect(region).toHaveAttribute('aria-busy', 'true');
    expect(region.querySelectorAll('.gn-visually-hidden')).toHaveLength(1);
    expect(region.querySelectorAll('[tabindex], a, button, input')).toHaveLength(0);
  });

  it('25.016 Pending sets aria-busy at once, dims (gn-pending) only after the wait and keeps the dim for the hold, and holds its label visually hidden while pending; a busy Button is disabled, aria-busy and reads its busy label', () => {
    vi.useFakeTimers();
    const { container, rerender } = render(<Pending pending label="Saving the title"><span>field</span></Pending>);
    const wrap = container.firstElementChild as HTMLElement;
    expect(wrap).toHaveAttribute('aria-busy', 'true');
    // Control: at t=0 the region is busy but not dimmed (the dim is the wait's job, not the busy's).
    expect(wrap.classList.contains('gn-pending')).toBe(false);
    const hidden = wrap.querySelectorAll('.gn-visually-hidden');
    expect(hidden).toHaveLength(1);
    expect(hidden[0]).toHaveTextContent('Saving the title');

    act(() => vi.advanceTimersByTime(WAIT_BEFORE_MS - 1));
    expect(wrap.classList.contains('gn-pending')).toBe(false);
    act(() => vi.advanceTimersByTime(1));
    expect(wrap.classList.contains('gn-pending')).toBe(true);

    // Resolved: no longer busy, the label is gone, but the dim stays until the hold ends.
    rerender(<Pending pending={false} label="Saving the title"><span>field</span></Pending>);
    expect(wrap).not.toHaveAttribute('aria-busy');
    expect(wrap.querySelectorAll('.gn-visually-hidden')).toHaveLength(0);
    act(() => vi.advanceTimersByTime(WAIT_HOLD_MS - 1));
    expect(wrap.classList.contains('gn-pending')).toBe(true);
    act(() => vi.advanceTimersByTime(1));
    expect(wrap.classList.contains('gn-pending')).toBe(false);

    // Control: a Pending with no label adds no hidden text while pending.
    const bare = render(<Pending pending><span>field</span></Pending>);
    expect(bare.container.firstElementChild).toHaveAttribute('aria-busy', 'true');
    expect(bare.container.querySelectorAll('.gn-visually-hidden')).toHaveLength(0);
    vi.useRealTimers();

    render(<Button busy busyLabel="Creating…">Create ticket</Button>);
    const busy = screen.getByRole('button', { name: 'Creating…' });
    expect(busy).toBeDisabled();
    expect(busy).toHaveAttribute('aria-busy', 'true');
    // Control: not busy → the children, enabled, no aria-busy.
    render(<Button busyLabel="Creating…">Create ticket</Button>);
    const idle = screen.getByRole('button', { name: 'Create ticket' });
    expect(idle).toBeEnabled();
    expect(idle).not.toHaveAttribute('aria-busy');
  });
});
