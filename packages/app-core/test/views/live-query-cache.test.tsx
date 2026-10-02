import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ClientStreamFrame, DataSource } from '../../src/data-source.js';
import { useLiveQuery } from '../../src/views/use-live-query.js';
import {
  LIVE_QUERY_CACHE_MAX,
  LIVE_QUERY_CACHE_TTL_MS,
  clearLiveQueryCache,
  liveQueryAgeMs,
  liveQueryStoreKey,
  recallLiveQuery,
  rememberLiveQuery,
} from '../../src/views/live-query-cache.js';

/**
 * Smoothness T3: the read cache (spec S4, D1; audit SM-01) and the one reload wave
 * per workspace (D8; audit SM-05). Cases 25.020–25.024 and 25.027–25.029.
 *
 * Every key below is spelled the way the hook stores it, `ws\u0000<cacheKey>`
 * (`liveQueryStoreKey`): the workspace is part of the key, so two workspaces that
 * name a board the same way never share an answer, and T4's freshness sweep can
 * read the workspace back off a key.
 */

function drivable(): { source: DataSource; fire: (item: ClientStreamFrame) => void } {
  const cbs = new Set<(item: ClientStreamFrame) => void>();
  const source = {
    subscribe: (_ws: string, _after: number, next: (item: ClientStreamFrame) => void) => {
      cbs.add(next);
      return () => cbs.delete(next);
    },
  } as unknown as DataSource;
  return { source, fire: (item) => cbs.forEach((cb) => cb(item)) };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (cause: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const FRAME = { type: 'event', workspaceId: 'ws', envelope: {} as never } as ClientStreamFrame;
const NEVER = () => new Promise<never>(() => {});
const key = (cacheKey: string, ws = 'ws') => liveQueryStoreKey(ws, cacheKey);

describe('useLiveQuery with a cacheKey: stale-while-revalidate (spec S4, D1; audit SM-01)', () => {
  beforeEach(() => clearLiveQueryCache());
  afterEach(() => clearLiveQueryCache());

  it('25.020 a number as the fifth argument still means debounceMs, and an `initial` seed still serves (18.461): no cache without a cacheKey', async () => {
    const { source } = drivable();
    const first = renderHook(() => useLiveQuery(source, 'ws', 'prj', async () => 'answer', 50));
    await waitFor(() => expect(first.result.current.data).toBe('answer'));
    first.unmount();
    // Control: a hook with no cacheKey wrote nothing, so the remount starts from null.
    const second = renderHook(() => useLiveQuery(source, 'ws', 'prj', NEVER, 50));
    expect(second.result.current.data).toBeNull();
    // The legacy sixth argument is still the 18.461 seed.
    const seeded = renderHook(() => useLiveQuery(source, 'ws', 'prj', NEVER, 50, { key: 'prj', data: 'seed' }));
    expect(seeded.result.current.data).toBe('seed');
  });

  it('25.021 a remount serves the last answer on its FIRST render and still asks again', async () => {
    const { source } = drivable();
    let asked = 0;
    const load = async () => {
      asked += 1;
      return { rows: ['a'] };
    };
    const first = renderHook(() => useLiveQuery(source, 'ws', 'prj', load, { cacheKey: 'list:prj' }));
    await waitFor(() => expect(first.result.current.data).toEqual({ rows: ['a'] }));
    first.unmount();

    const open = deferred<{ rows: string[] }>();
    const second = renderHook(() => useLiveQuery(source, 'ws', 'prj', () => open.promise, { cacheKey: 'list:prj' }));
    expect(second.result.current.data).toEqual({ rows: ['a'] }); // first render, no await
    expect(second.result.current.settled).toBe(false);
    act(() => open.resolve({ rows: ['a', 'b'] }));
    await waitFor(() => expect(second.result.current.data).toEqual({ rows: ['a', 'b'] }));
    expect(second.result.current.settled).toBe(true);
    expect(asked).toBe(1);
    // The fresh answer replaced the stale one in the cache too.
    expect(recallLiveQuery(key('list:prj'))).toEqual({ rows: ['a', 'b'] });
    // Control: without a cacheKey the remount starts from null.
    const bare = renderHook(() => useLiveQuery(source, 'ws', 'prj', NEVER));
    expect(bare.result.current.data).toBeNull();
  });

  it('25.021 the same cacheKey in another workspace is another question: its answer is not served', async () => {
    const { source } = drivable();
    rememberLiveQuery(key('board:prj', 'ws-a'), { groups: ['A'] });
    const other = renderHook(() => useLiveQuery(source, 'ws-b', 'prj', NEVER, { cacheKey: 'board:prj' }));
    expect(other.result.current.data).toBeNull();
    // Control: the workspace the answer was stored under serves it.
    const same = renderHook(() => useLiveQuery(source, 'ws-a', 'prj', NEVER, { cacheKey: 'board:prj' }));
    expect(same.result.current.data).toEqual({ groups: ['A'] });
  });

  it('25.022 a key change serves the NEW key\'s cached answer, never the old key\'s, and null when it has none', () => {
    const { source } = drivable();
    rememberLiveQuery(key('board:A'), { groups: ['A'] });
    rememberLiveQuery(key('board:B'), { groups: ['B'] });
    const hook = renderHook(
      ({ id }) => useLiveQuery(source, 'ws', id, NEVER, { cacheKey: `board:${id}` }),
      { initialProps: { id: 'A' } },
    );
    expect(hook.result.current.data).toEqual({ groups: ['A'] });
    hook.rerender({ id: 'B' });
    expect(hook.result.current.data).toEqual({ groups: ['B'] });
    hook.rerender({ id: 'C' });
    expect(hook.result.current.data).toBeNull();
  });

  it('25.023 the cache evicts by age and by size, and clears whole', () => {
    rememberLiveQuery('k', 1, 0);
    expect(liveQueryAgeMs('k', 5)).toBe(5);
    expect(recallLiveQuery('k', LIVE_QUERY_CACHE_TTL_MS)).toBe(1);
    expect(recallLiveQuery('k', LIVE_QUERY_CACHE_TTL_MS + 1)).toBeUndefined();
    expect(liveQueryAgeMs('k')).toBeNull(); // the expired entry is gone, not just hidden
    for (let i = 0; i < LIVE_QUERY_CACHE_MAX + 1; i += 1) rememberLiveQuery(`n${i}`, i);
    expect(recallLiveQuery('n0')).toBeUndefined();
    expect(recallLiveQuery(`n${LIVE_QUERY_CACHE_MAX}`)).toBe(LIVE_QUERY_CACHE_MAX);
    clearLiveQueryCache();
    expect(recallLiveQuery(`n${LIVE_QUERY_CACHE_MAX}`)).toBeUndefined();
  });

  it('25.023 a recall counts as use: the entry a reader keeps touching outlives the one nobody asks for', () => {
    for (let i = 0; i < LIVE_QUERY_CACHE_MAX; i += 1) rememberLiveQuery(`n${i}`, i);
    expect(recallLiveQuery('n0')).toBe(0); // touched: now the most recent
    rememberLiveQuery('extra', 1);
    expect(recallLiveQuery('n0')).toBe(0);
    expect(recallLiveQuery('n1')).toBeUndefined(); // the oldest untouched one went
  });

  it('25.024 one stream frame reloads every hook on the workspace ONCE each, from one timer', async () => {
    const d = drivable();
    const counts = { a: 0, b: 0 };
    const a = renderHook(() => useLiveQuery(d.source, 'ws', 'a', async () => { counts.a += 1; return counts.a; }, 50));
    const b = renderHook(() => useLiveQuery(d.source, 'ws', 'b', async () => { counts.b += 1; return counts.b; }, 50));
    await waitFor(() => expect(a.result.current.data).toBe(1));
    await waitFor(() => expect(b.result.current.data).toBe(1));
    act(() => { d.fire(FRAME); d.fire(FRAME); });
    await waitFor(() => expect(a.result.current.data).toBe(2));
    await waitFor(() => expect(b.result.current.data).toBe(2));
    await new Promise((r) => setTimeout(r, 120));
    expect(counts).toEqual({ a: 2, b: 2 }); // two frames: one wave, not two per hook
  });

  it('25.024 a frame on another workspace reloads nothing here, and an unmounted hook is not reloaded', async () => {
    const d = drivable();
    const counts = { a: 0, b: 0 };
    const a = renderHook(() => useLiveQuery(d.source, 'ws', 'a', async () => { counts.a += 1; return counts.a; }, 20));
    const b = renderHook(() => useLiveQuery(d.source, 'ws', 'b', async () => { counts.b += 1; return counts.b; }, 20));
    await waitFor(() => expect(counts).toEqual({ a: 1, b: 1 }));
    b.unmount();
    act(() => d.fire(FRAME));
    await waitFor(() => expect(counts.a).toBe(2));
    await new Promise((r) => setTimeout(r, 60));
    expect(counts).toEqual({ a: 2, b: 1 });
    a.unmount();
  });

  it('25.027 a refused read evicts its entry and withdraws the stale answer it was serving: no board painted over its own refusal, and the next mount does not resurrect it', async () => {
    const { source } = drivable();
    rememberLiveQuery(key('board:prj'), { groups: ['was readable'] });
    const refused = renderHook(() =>
      useLiveQuery(source, 'ws', 'prj', () => Promise.reject(new Error('HTTP 404 for /v1/projects/prj/board')), { cacheKey: 'board:prj' }),
    );
    expect(refused.result.current.data).toEqual({ groups: ['was readable'] }); // stale, served at once
    await waitFor(() => expect(refused.result.current.error).toMatch(/HTTP 404/));
    expect(refused.result.current.data).toBeNull(); // a view that checks `data` first cannot draw the board over the refusal
    expect(recallLiveQuery(key('board:prj'))).toBeUndefined();
    refused.unmount();
    const next = renderHook(() => useLiveQuery(source, 'ws', 'prj', NEVER, { cacheKey: 'board:prj' }));
    expect(next.result.current.data).toBeNull();
  });

  it('25.027 a reload that fails AFTER the key had a real answer keeps that answer (F6 unchanged), but still evicts the cache entry', async () => {
    const d = drivable();
    let calls = 0;
    const hook = renderHook(() =>
      useLiveQuery(d.source, 'ws', 'prj', async () => {
        calls += 1;
        if (calls === 1) return { groups: ['answer'] };
        throw new Error('HTTP 503 for /v1/projects/prj/board');
      }, { cacheKey: 'board:prj', debounceMs: 20 }),
    );
    await waitFor(() => expect(hook.result.current.data).toEqual({ groups: ['answer'] }));
    act(() => d.fire(FRAME));
    await waitFor(() => expect(hook.result.current.error).toMatch(/HTTP 503/));
    expect(hook.result.current.data).toEqual({ groups: ['answer'] });
    expect(recallLiveQuery(key('board:prj'))).toBeUndefined();
  });

  it('25.028 sign-out empties the cache: a fresh mount after clearLiveQueryCache serves null, never the first person\'s board', async () => {
    const { source } = drivable();
    const first = renderHook(() => useLiveQuery(source, 'ws', 'prj', async () => ({ groups: ['kiro'] }), { cacheKey: 'board:prj' }));
    await waitFor(() => expect(first.result.current.data).toEqual({ groups: ['kiro'] }));
    first.unmount();
    // Control: before the clear, the same mount serves the cached board.
    const before = renderHook(() => useLiveQuery(source, 'ws', 'prj', NEVER, { cacheKey: 'board:prj' }));
    expect(before.result.current.data).toEqual({ groups: ['kiro'] });
    before.unmount();
    clearLiveQueryCache(); // what the sign-out, the 401 redirects and the user change call
    const second = renderHook(() => useLiveQuery(source, 'ws', 'prj', NEVER, { cacheKey: 'board:prj' }));
    expect(second.result.current.data).toBeNull();
  });

  it('25.029 a read that was in flight when the cache was cleared does not write its answer back: the first person\'s board never lands in the second person\'s cache', async () => {
    const { source } = drivable();
    const slow = deferred<{ groups: string[] }>();
    const hook = renderHook(() => useLiveQuery(source, 'ws', 'prj', () => slow.promise, { cacheKey: 'board:prj' }));
    clearLiveQueryCache(); // sign-out while the first person's read is still on the wire
    await act(async () => slow.resolve({ groups: ['kiro'] }));
    await waitFor(() => expect(hook.result.current.settled).toBe(true));
    expect(recallLiveQuery(key('board:prj'))).toBeUndefined();
    hook.unmount();
    // Control: a read issued AFTER the clear writes as usual.
    const after = renderHook(() => useLiveQuery(source, 'ws', 'prj', async () => ({ groups: ['second'] }), { cacheKey: 'board:prj' }));
    await waitFor(() => expect(after.result.current.data).toEqual({ groups: ['second'] }));
    expect(recallLiveQuery(key('board:prj'))).toEqual({ groups: ['second'] });
  });
});
