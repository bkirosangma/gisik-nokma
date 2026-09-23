import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ClientStreamFrame, DataSource } from '../../src/data-source.js';
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

/**
 * A source whose subscription the test DRIVES — one captured callback per
 * `subscribe`, so a case can hand the hook a frame and watch what it does.
 *
 * A separate fixture from `SOURCE` rather than a widening of it: `SOURCE` exists
 * to be inert, and a source that also fires frames would make the two cases
 * above depend on a callback they never use.
 */
function drivableSource(): { source: DataSource; fire: (item: ClientStreamFrame) => void } {
  let cb: ((item: ClientStreamFrame) => void) | null = null;
  const source = {
    subscribe: (_ws: string, _afterSeq: number, next: (item: ClientStreamFrame) => void) => {
      cb = next;
      return () => {
        cb = null;
      };
    },
  } as unknown as DataSource;
  return {
    source,
    fire: (item) => {
      if (cb === null) throw new Error('drivableSource: nothing subscribed yet');
      cb(item);
    },
  };
}

describe('useLiveQuery — which frames refetch', () => {
  /**
   * 18.092 — a `refresh` frame refetches, and `caught-up` still does not.
   *
   * `refresh` is CLIENT-ONLY: it is what the data source emits when a PULL
   * landed. A note reaches a device by pull, after the notice and after the
   * stream has gone quiet, so no `event` frame announces it and no `caught-up`
   * follows — a view showing that note would keep a stale answer until
   * something unrelated moved. The control below is the one that makes this a
   * statement about `refresh` rather than about "any frame refetches".
   */
  it('18.092 refetches on refresh, and still ignores caught-up (control)', async () => {
    const { load, calls } = controllableLoad();
    const { source, fire } = drivableSource();
    renderHook(() => useLiveQuery(source, 'ws_1', 'project_1', load));

    await waitFor(() => expect(calls()).toBe(1));

    // Control FIRST, and it is ordering rather than style: an assertion above a
    // control can mask it. `caught-up` means the cursor moved, not that this
    // key's data changed, and a hook that refetched on it would reload every
    // open view on every reconnect.
    await act(async () => {
      fire({ type: 'caught-up', workspaceId: 'ws_1', seq: 9 });
    });
    await new Promise((resolve) => setTimeout(resolve, 260));
    expect(calls()).toBe(1);

    await act(async () => {
      fire({ type: 'refresh', workspaceId: 'ws_1' });
    });
    // The hook debounces (`debounceMs`, 200 by default), so this waits longer
    // than that rather than for a render.
    await waitFor(() => expect(calls()).toBe(2), { timeout: 1000 });
  });
});

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
