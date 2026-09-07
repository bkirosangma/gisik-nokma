import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { DataSource } from '../../src/data-source.js';
import { useLiveQuery } from '../../src/views/use-live-query.js';

/**
 * The measurement case 12.321 asked for and nobody had taken.
 *
 * The row frames the gap as refetch AMPLIFICATION — N requests where there was one
 * — and treats it as a performance question. The hook's own docblock is more
 * precise, and worse: *"overlapping reloads still resolve last-one-wins"*. Last to
 * RESOLVE, not last to be ISSUED. That is a correctness question, and it is what
 * these cases measure.
 */
/**
 * ONE stable instance, hoisted out of the render callback. Built inside it, a fresh
 * object every render changes the effects' `source` dep every render, which reloads
 * forever and settles nothing — the first draft did exactly that, and BOTH cases
 * failed identically, including the control. A control that fails with the case is
 * saying the harness is broken, not the subject.
 */
const SOURCE = { subscribe: () => () => undefined } as unknown as DataSource;

/** A load whose settlement each call is handed back to the test to control. */
function controllableLoad(): {
  load: () => Promise<string>;
  settle: (index: number, value: string) => void;
  calls: () => number;
} {
  const resolvers: Array<(value: string) => void> = [];
  return {
    load: () =>
      new Promise<string>((resolve) => {
        resolvers.push(resolve);
      }),
    settle: (index, value) => resolvers[index]!(value),
    calls: () => resolvers.length,
  };
}

describe('useLiveQuery — overlapping reloads for the SAME key', () => {
  /**
   * 12.381 — an OLDER in-flight load that resolves LAST must not overwrite a newer
   * one. The hook guards the key (an answer to a different question is dropped) but
   * not the ORDER, so two loads for the same key race and whichever the network
   * happens to answer second wins.
   *
   * This is reachable rather than theoretical: the row records `getTickets` walking
   * ten paginated round trips through a recursive `epicAncestors` CTE, and the
   * refetch debounce is 200ms. A walk slower than the debounce is exactly the
   * condition that overlaps two loads, and the slower of the two is the one more
   * likely to be the older.
   *
   * The failure is not a flicker. Nothing re-renders until the next stream event,
   * so the view keeps serving the stale answer for as long as the workspace is
   * quiet — which is precisely when nobody is watching it change.
   */
  it('keeps the NEWER answer when an older load resolves after it', async () => {
    const { load, settle, calls } = controllableLoad();
    const { result } = renderHook(() =>
      useLiveQuery(SOURCE, 'ws_1', 'project_1', load),
    );

    // Two loads in flight for the same key: the mount's, and an explicit reload.
    await waitFor(() => expect(calls()).toBe(1));
    act(() => {
      result.current.reload();
    });
    await waitFor(() => expect(calls()).toBe(2));

    // The NEWER one answers first...
    await act(async () => {
      settle(1, 'fresh');
    });
    expect(result.current.data).toBe('fresh');

    // ...and the OLDER one answers second. It describes a moment that has passed.
    await act(async () => {
      settle(0, 'stale');
    });
    expect(result.current.data).toBe('fresh');
  });

  /**
   * 12.381 — the positive control, one field apart. Without it, "the newer answer
   * survives" would also hold for a hook that had stopped applying results at all,
   * or that never issued the second load. In-order resolution must still land.
   */
  it('applies the newer answer when the loads resolve in order', async () => {
    const { load, settle, calls } = controllableLoad();
    const { result } = renderHook(() =>
      useLiveQuery(SOURCE, 'ws_1', 'project_1', load),
    );

    await waitFor(() => expect(calls()).toBe(1));
    await act(async () => {
      settle(0, 'first');
    });
    expect(result.current.data).toBe('first');

    act(() => {
      result.current.reload();
    });
    await waitFor(() => expect(calls()).toBe(2));
    await act(async () => {
      settle(1, 'second');
    });
    expect(result.current.data).toBe('second');
  });
});
