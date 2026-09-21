import {
  createHttpTransport,
  createOutbox,
  createReplica,
  createSyncEngine,
  type SyncEngine,
  type SyncStorage,
} from '@gisik-nokma/sync-client';
import { createReplicaDataSource, type ReplicaDataSource } from '@gisik-nokma/app-core';

/**
 * E2-48: `App`'s init IIFE built the whole replica stack (storage → replica →
 * outbox/transport/engine → data source) with no `catch` — the sibling of
 * `E2-43` on desktop, same architecture
 * (`createReplica → createOutbox → createSyncEngine → createReplicaDataSource`,
 * then `setDs`), differing only in the storage adapter. Split out so the
 * failure is a plain return value instead of an unhandled rejection.
 */
export type ReplicaInitResult =
  | { ok: true; dataSource: ReplicaDataSource; engine: SyncEngine }
  | { ok: false; error: string };

export type ReplicaInitDeps = {
  createStorage: () => Promise<SyncStorage>;
  createReplicaFn: typeof createReplica;
  createOutboxFn: typeof createOutbox;
  createHttpTransportFn: typeof createHttpTransport;
  createSyncEngineFn: typeof createSyncEngine;
  createReplicaDataSourceFn: typeof createReplicaDataSource;
};

export async function initReplica(
  opts: { apiBase: string; token: string; workspaceId: string },
  deps: ReplicaInitDeps,
): Promise<ReplicaInitResult> {
  try {
    const storage = await deps.createStorage();
    const replica = await deps.createReplicaFn({ storage });
    const outbox = deps.createOutboxFn({ storage, replica });
    const transport = deps.createHttpTransportFn({ baseUrl: opts.apiBase, token: opts.token });
    const engine = deps.createSyncEngineFn({ replica, outbox, transport });
    const dataSource = deps.createReplicaDataSourceFn({
      workspaceId: opts.workspaceId,
      replica,
      outbox,
      engine,
      storage,
    });
    return { ok: true, dataSource, engine };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'could not open the local replica' };
  }
}
