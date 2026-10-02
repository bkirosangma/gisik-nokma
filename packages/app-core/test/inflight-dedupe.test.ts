import { describe, expect, it } from 'vitest';
import type { DataSource } from '../src/data-source.js';
import { withInflightDedupe } from '../src/inflight-dedupe.js';
import { clearLiveQueryCache } from '../src/views/live-query-cache.js';

/** Smoothness T3 (spec §3.2, D8; audit SM-05). Cases 25.025 and 25.030. */
function gatedSource() {
  const handle = { calls: 0, release: () => {} };
  const gate = new Promise<void>((r) => {
    handle.release = r;
  });
  const source = {
    ingest: async () => [],
    subscribe: () => () => undefined,
    query: {
      getMembers: async (ws: string) => {
        handle.calls += 1;
        await gate;
        return [{ id: ws }];
      },
    },
  } as unknown as DataSource;
  return { source, handle };
}

describe('withInflightDedupe', () => {
  it('25.025 two identical reads in flight share one call; a different argument, or a read after settlement, is a new call', async () => {
    const { source, handle } = gatedSource();
    const deduped = withInflightDedupe(source);
    const p1 = deduped.query.getMembers('ws1');
    const p2 = deduped.query.getMembers('ws1');
    const p3 = deduped.query.getMembers('ws2');
    expect(handle.calls).toBe(2);
    handle.release();
    expect(await p1).toEqual(await p2);
    await p3;
    await deduped.query.getMembers('ws1');
    expect(handle.calls).toBe(3);
    // Control: the undecorated source makes a call per read.
    await Promise.all([source.query.getMembers('ws1'), source.query.getMembers('ws1')]);
    expect(handle.calls).toBe(5);
  });

  it('25.025 a failed read is not remembered: the next identical read asks again', async () => {
    let calls = 0;
    const source = {
      ingest: async () => [],
      subscribe: () => () => undefined,
      query: {
        getMembers: async () => {
          calls += 1;
          if (calls === 1) throw new Error('boom');
          return ['ok'];
        },
      },
    } as unknown as DataSource;
    const deduped = withInflightDedupe(source);
    await expect(deduped.query.getMembers('ws')).rejects.toThrow('boom');
    await expect(deduped.query.getMembers('ws')).resolves.toEqual(['ok']);
    expect(calls).toBe(2);
  });

  it('25.025 writes are untouched: ingest and subscribe are the source\'s own', async () => {
    const { source } = gatedSource();
    const deduped = withInflightDedupe(source);
    expect(await deduped.ingest([])).toEqual([]);
    expect(deduped.subscribe('ws', 0, () => undefined)).toBeTypeOf('function');
  });

  it('25.030 a read in flight when the cache is cleared is NOT shared with the next person\'s identical read (sign-out, then sign-in as someone else)', async () => {
    const { source, handle } = gatedSource();
    const deduped = withInflightDedupe(source);
    const firstPerson = deduped.query.getMembers('ws1');
    clearLiveQueryCache(); // sign-out
    const secondPerson = deduped.query.getMembers('ws1');
    expect(handle.calls).toBe(2); // two calls, not one shared promise
    handle.release();
    await Promise.all([firstPerson, secondPerson]);
    // Control: with no clear between them the same two reads share one call.
    const { source: s2, handle: h2 } = gatedSource();
    const d2 = withInflightDedupe(s2);
    void d2.query.getMembers('ws1');
    void d2.query.getMembers('ws1');
    expect(h2.calls).toBe(1);
    h2.release();
  });
});
