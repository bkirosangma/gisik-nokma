import type { Queryable } from '../db/queryable.js';
import { readStreamSeq } from '../sync/stream-seq.js';
import type { ReadableWorkspace } from './scope.js';

/**
 * The cut a response is consistent with (D-W4-23): each readable workspace's stream head. It is read BEFORE the scope is loaded, so an event
 * committed while the load runs has a `workspaceSeq` above the value returned and the client applies it; reading after would claim events the data
 * does not hold. `workspace_seq` is assigned under `lockWorkspace`, so nothing at or below a committed max is still in flight (`stream-seq.ts:13-19`).
 */
export async function readAsOf(db: Queryable, readable: readonly ReadableWorkspace[]): Promise<Record<string, number>> {
  const heads = await Promise.all(readable.map(async (r) => [r.workspaceId, await readStreamSeq(db, r.workspaceId)] as const));
  return Object.fromEntries(heads);
}
