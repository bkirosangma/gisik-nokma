import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WAIT_BEFORE_MS, WAIT_HOLD_MS, useWait } from '../src/use-wait.js';

describe('useWait — nothing before 150 ms, then held 350 ms (spec S2, D4)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('25.011 a read that resolves in 10 ms never shows a placeholder; one that resolves at 160 ms does', () => {
    const fast = renderHook(({ pending }) => useWait(pending), { initialProps: { pending: true } });
    act(() => vi.advanceTimersByTime(10));
    fast.rerender({ pending: false });
    act(() => vi.advanceTimersByTime(WAIT_HOLD_MS + 1));
    expect(fast.result.current).toBe(false);

    // Control: the same hook, with the read still open at 149 and at 150 ms.
    const slow = renderHook(({ pending }) => useWait(pending), { initialProps: { pending: true } });
    act(() => vi.advanceTimersByTime(WAIT_BEFORE_MS - 1));
    expect(slow.result.current).toBe(false);
    act(() => vi.advanceTimersByTime(1));
    expect(slow.result.current).toBe(true);
  });

  it('25.012 once shown, the placeholder stays for the hold even when the read resolves 10 ms later', () => {
    const hook = renderHook(({ pending }) => useWait(pending), { initialProps: { pending: true } });
    act(() => vi.advanceTimersByTime(WAIT_BEFORE_MS + 10));
    expect(hook.result.current).toBe(true);
    hook.rerender({ pending: false });
    act(() => vi.advanceTimersByTime(WAIT_HOLD_MS - 11));
    expect(hook.result.current).toBe(true);
    act(() => vi.advanceTimersByTime(1));
    expect(hook.result.current).toBe(false);
  });

  it('25.013 immediate: a region that never had content shows its placeholder on the first render', () => {
    const hook = renderHook(() => useWait(true, { immediate: true }));
    expect(hook.result.current).toBe(true);
    // Control: without the option the first render is bare.
    const plain = renderHook(() => useWait(true));
    expect(plain.result.current).toBe(false);
  });
});
