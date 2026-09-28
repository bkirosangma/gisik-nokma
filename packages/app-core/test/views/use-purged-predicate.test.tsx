import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { PurgedRef } from '@gisik-nokma/domain';
import { usePurgedPredicate } from '../../src/views/use-purged-predicate.js';

const chip = (ticketId: string) => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'ticketRef', attrs: { ticketId, projectId: 'p', key: 'K-1', title: 't' } }] }],
});

describe('19.190 usePurgedPredicate', () => {
  it('19.190 waits for loaded, asks once per id per session, is ready in the same render without chips, and fails open then retries', async () => {
    const purgedAmong = vi.fn(async (ids: readonly string[]): Promise<PurgedRef[]> =>
      ids.filter((id) => id === 'gone').map((id) => ({ kind: 'ticket', id })),
    );
    const query = { purgedAmong };
    const docs = [chip('gone'), chip('live')];

    // Not loaded yet: never ready, even with nothing to ask about.
    const pending = renderHook(({ loaded }) => usePurgedPredicate(query, [], loaded), { initialProps: { loaded: false } });
    expect(pending.result.current.ready).toBe(false);
    pending.rerender({ loaded: true });
    expect(pending.result.current.ready).toBe(true);
    pending.unmount();

    const first = renderHook(() => usePurgedPredicate(query, docs));
    expect(first.result.current.ready).toBe(false);
    await waitFor(() => expect(first.result.current.ready).toBe(true));
    expect(first.result.current.isPurged('ticket', 'gone')).toBe(true);
    // CONTROL
    expect(first.result.current.isPurged('ticket', 'live')).toBe(false);
    first.unmount();

    const second = renderHook(() => usePurgedPredicate(query, docs));
    expect(second.result.current.ready).toBe(true);
    expect(second.result.current.isPurged('ticket', 'gone')).toBe(true);
    expect(purgedAmong).toHaveBeenCalledTimes(1);

    const plain = renderHook(() => usePurgedPredicate(query, [{ type: 'doc', content: [] }]));
    expect(plain.result.current.ready).toBe(true);
    expect(purgedAmong).toHaveBeenCalledTimes(1);

    const failing = { purgedAmong: vi.fn(async (): Promise<PurgedRef[]> => Promise.reject(new Error('offline'))) };
    const down = renderHook(() => usePurgedPredicate(failing, [chip('x')]));
    await waitFor(() => expect(down.result.current.ready).toBe(true));
    expect(down.result.current.isPurged('ticket', 'x')).toBe(false);
    down.unmount();
    const again = renderHook(() => usePurgedPredicate(failing, [chip('x')]));
    await waitFor(() => expect(failing.purgedAmong).toHaveBeenCalledTimes(2));
    again.unmount();
  });
});
