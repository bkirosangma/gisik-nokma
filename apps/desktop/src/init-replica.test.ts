import { describe, expect, it, vi } from 'vitest';
import { initReplica, type ReplicaInitDeps } from './init-replica.js';

/**
 * 12.402 — E2-43: a rejection in the init pipeline (any of the four awaits)
 * resolves to `{ok:false, error}` instead of an unhandled rejection, so
 * `App` can render a failure instead of "Opening local replica…" forever.
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

  it('12.402 — reports the failure instead of rejecting when storage fails to open', async () => {
    const deps = workingDeps({
      createStorage: vi.fn(async () => {
        throw new Error('could not open the database file');
      }),
    });
    const result = await initReplica(opts, deps);
    expect(result).toEqual({ ok: false, error: 'could not open the database file' });
  });

  it('12.403 — reports the failure instead of rejecting when the replica fails to build', async () => {
    const deps = workingDeps({
      createReplicaFn: vi.fn(async () => {
        throw new Error('bootstrap replay failed');
      }),
    });
    const result = await initReplica(opts, deps);
    expect(result).toEqual({ ok: false, error: 'bootstrap replay failed' });
  });
});
