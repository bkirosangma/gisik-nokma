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

  it('25.025 writes are the source\'s own: ingest answers through, subscribe returns the source\'s unsubscribe, and a write under `query` (putPreferences) is never shared', async () => {
    let puts = 0;
    const source = {
      ingest: async () => [],
      subscribe: () => () => undefined,
      query: { putPreferences: async () => { puts += 1; } },
    } as unknown as DataSource;
    const deduped = withInflightDedupe(source);
    expect(await deduped.ingest([])).toEqual([]);
    expect(deduped.subscribe('ws', 0, () => undefined)).toBeTypeOf('function');
    await Promise.all([deduped.query.putPreferences('ws', {} as never), deduped.query.putPreferences('ws', {} as never)]);
    expect(puts).toBe(2);
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

  /** The two ways a read can be overtaken while it is in flight: a write, and a stream frame. */
  function overtaken(): { deduped: DataSource; calls: () => number; fire: (type: string) => void; release: () => void } {
    const cbs: Array<(item: unknown) => void> = [];
    const handle = { calls: 0, release: () => {} };
    const gate = new Promise<void>((r) => {
      handle.release = r;
    });
    const source = {
      ingest: async () => [],
      subscribe: (_ws: string, _after: number, cb: (item: unknown) => void) => {
        cbs.push(cb);
        return () => undefined;
      },
      query: {
        getMembers: async () => {
          handle.calls += 1;
          await gate;
          return [];
        },
        putPreferences: async () => undefined,
      },
    } as unknown as DataSource;
    const deduped = withInflightDedupe(source);
    deduped.subscribe('ws', 0, () => undefined);
    return { deduped, calls: () => handle.calls, fire: (type) => cbs.forEach((cb) => cb({ type })), release: handle.release };
  }

  it('25.032 a read issued after a write, while another was in flight, does not join it: it would be handed the pre-write answer', async () => {
    const t = overtaken();
    void t.deduped.query.getMembers('ws');
    await t.deduped.ingest([]);
    void t.deduped.query.getMembers('ws');
    expect(t.calls()).toBe(2);
    t.release();
  });

  it('25.032 the same holds for a write under `query` (putPreferences)', async () => {
    const t = overtaken();
    void t.deduped.query.getMembers('ws');
    await t.deduped.query.putPreferences('ws', {} as never);
    void t.deduped.query.getMembers('ws');
    expect(t.calls()).toBe(2);
    t.release();
  });

  it('25.032 a second reload wave after a second stream frame does not join the first wave\'s reads; a frame that is not a change (caught-up) does not split them', () => {
    const t = overtaken();
    void t.deduped.query.getMembers('ws');
    t.fire('caught-up');
    void t.deduped.query.getMembers('ws');
    expect(t.calls()).toBe(1); // control: nothing changed, one shared call
    for (const type of ['event', 'purge', 'refresh']) {
      const before = t.calls();
      t.fire(type);
      void t.deduped.query.getMembers('ws');
      expect(t.calls()).toBe(before + 1);
    }
    t.release();
  });

  it('25.032 a write that is still being submitted splits too: a read issued while it is on the wire does not join one from before it', async () => {
    const t = overtaken();
    void t.deduped.query.getMembers('ws');
    const writing = t.deduped.ingest([]); // submitted, not yet settled
    void t.deduped.query.getMembers('ws');
    expect(t.calls()).toBe(2);
    await writing;
    t.release();
  });

  it('25.032 a read issued WHILE a write was on the wire is not joined by one issued after it settled: the first may have been answered before the commit', async () => {
    const t = overtaken();
    const writing = t.deduped.ingest([]);
    void t.deduped.query.getMembers('ws'); // during the write
    await writing;
    void t.deduped.query.getMembers('ws'); // after it settled
    expect(t.calls()).toBe(2);
    t.release();
  });
});
