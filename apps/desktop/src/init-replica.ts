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
 * E2-43: `App`'s init IIFE built the whole replica stack (storage → replica →
 * outbox → transport → engine → data source) inside an unawaited async IIFE
 * with no `catch`, and the render gated on `ds === null` forever — so a
 * rejection in any of the four awaits left the shell on "Opening local
 * replica…" with nothing on screen and the rejection unhandled. Split out so
 * the failure is a plain return value instead of an unhandled rejection; the
 * real factories are the defaults, and a test injects a failing one.
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
