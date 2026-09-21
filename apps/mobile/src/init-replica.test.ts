import { describe, expect, it, vi } from 'vitest';
import { initReplica, type ReplicaInitDeps } from './init-replica.js';

/**
 * 12.404 — E2-48: a rejection in the init pipeline resolves to
 * `{ok:false, error}` instead of an unhandled rejection, so `App` can render
 * a failure instead of leaving the board silently empty forever — the
 * sibling of E2-43 on desktop.
 */
describe('initReplica', () => {
  const opts = { apiBase: 'http://api', token: 't', workspaceId: 'ws1' };

  function workingDeps(overrides: Partial<ReplicaInitDeps> = {}): ReplicaInitDeps {
    return {
      createStorage: vi.fn(async () => ({}) as never),
      createReplicaFn: vi.fn(async () => ({}) as never),
      createOutboxFn: vi.fn(() => ({}) as never),
      createHttpTransportFn: vi.fn(() => ({}) as never),
      createSyncEngineFn: vi.fn(() => ({}) as never),
      createReplicaDataSourceFn: vi.fn(() => ({}) as never),
      ...overrides,
    };
  }

  it('resolves ok with the data source and engine on success', async () => {
    const dataSource = { name: 'ds' } as never;
    const engine = { name: 'engine' } as never;
    const deps = workingDeps({
      createReplicaDataSourceFn: vi.fn(() => dataSource),
      createSyncEngineFn: vi.fn(() => engine),
    });
    const result = await initReplica(opts, deps);
    expect(result).toEqual({ ok: true, dataSource, engine });
  });

  it('12.404 — reports the failure instead of rejecting when storage fails to open', async () => {
    const deps = workingDeps({
      createStorage: vi.fn(async () => {
        throw new Error('op-sqlite could not open the database');
      }),
    });
    const result = await initReplica(opts, deps);
    expect(result).toEqual({ ok: false, error: 'op-sqlite could not open the database' });
  });

  it('12.405 — reports the failure instead of rejecting when the replica fails to build', async () => {
    const deps = workingDeps({
      createReplicaFn: vi.fn(async () => {
        throw new Error('bootstrap replay failed');
      }),
    });
    const result = await initReplica(opts, deps);
    expect(result).toEqual({ ok: false, error: 'bootstrap replay failed' });
  });
});
