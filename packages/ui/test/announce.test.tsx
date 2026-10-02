import { act, render, renderHook, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AnnounceRegion, useAnnounce } from '../src/announce.js';

describe('the one polite region (spec §5, S6)', () => {
  it('25.010 a message reaches the single role="status" region politely; the same message twice is announced twice; nothing is assertive', async () => {
    render(<AnnounceRegion />);
    const region = screen.getByRole('status');
    expect(region).toHaveAttribute('aria-live', 'polite');
    expect(region).toHaveAttribute('aria-atomic', 'true');
    expect(region.className).toContain('gn-visually-hidden');
    const { result } = renderHook(() => useAnnounce());
    act(() => result.current('Saved'));
    await act(async () => { await new Promise((r) => requestAnimationFrame(r)); });
    expect(region).toHaveTextContent('Saved');
    act(() => result.current('Saved'));
    expect(region).toHaveTextContent(''); // cleared at once, so a screen reader sees a change when it is set again
    await act(async () => { await new Promise((r) => requestAnimationFrame(r)); });
    expect(region).toHaveTextContent('Saved'); // re-set across a frame, so AT re-reads it
    expect(document.querySelectorAll('[aria-live="assertive"], [role="alert"]')).toHaveLength(0);
    // Control: two regions never mount; a second AnnounceRegion renders nothing.
    render(<AnnounceRegion />);
    expect(screen.getAllByRole('status')).toHaveLength(1);
  });
});
