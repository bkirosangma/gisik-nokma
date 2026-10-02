import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearLiveQueryCache, liveQueryStoreKey, rememberLiveQuery, subscribeReloads } from '@gisik-nokma/app-core';
import { STALE_AFTER_MS, useFreshness } from '../src/freshness.js';

const hiddenOrShown = (state: 'hidden' | 'visible') =>
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });

describe('useFreshness — stale entries refetch on focus and on reconnect (spec D13; audit SM-15)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    clearLiveQueryCache();
    hiddenOrShown('visible');
  });
  afterEach(() => vi.useRealTimers());

  it('25.045 focus after 30 s reloads the workspace\'s hooks; focus after 5 s does not', () => {
    const reload = vi.fn();
    const stop = subscribeReloads('ws', reload);
    rememberLiveQuery(liveQueryStoreKey('ws', 'board:prj'), {}, Date.now());
    renderHook(() => useFreshness());
    vi.advanceTimersByTime(5_000);
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('focus'));
    });
    vi.runOnlyPendingTimers();
    expect(reload).not.toHaveBeenCalled(); // control: a young answer is left alone
    vi.advanceTimersByTime(STALE_AFTER_MS);
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });
    vi.runOnlyPendingTimers();
    expect(reload).toHaveBeenCalledTimes(1);
    stop();
  });

  it('25.045 the browser coming back online reloads a stale workspace; a hidden document, and a workspace whose answers are young, reload nothing', () => {
    const stale = vi.fn();
    const young = vi.fn();
    const stops = [subscribeReloads('stale-ws', stale), subscribeReloads('young-ws', young)];
    rememberLiveQuery(liveQueryStoreKey('stale-ws', 'board:prj'), {}, Date.now());
    vi.advanceTimersByTime(STALE_AFTER_MS + 1);
    rememberLiveQuery(liveQueryStoreKey('young-ws', 'board:prj'), {}, Date.now());
    const hook = renderHook(() => useFreshness());

    hiddenOrShown('hidden');
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    vi.runOnlyPendingTimers();
    expect(stale).not.toHaveBeenCalled(); // control: nobody is looking at the tab

    hiddenOrShown('visible');
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    vi.runOnlyPendingTimers();
    expect(stale).toHaveBeenCalledTimes(1);
    expect(young).not.toHaveBeenCalled();

    hook.unmount(); // the listeners go with the hook
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    vi.runOnlyPendingTimers();
    expect(stale).toHaveBeenCalledTimes(1);
    stops.forEach((stop) => stop());
  });
});
