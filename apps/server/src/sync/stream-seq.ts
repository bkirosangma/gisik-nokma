import type { Pool, PoolClient } from 'pg';

/**
 * The workspace stream's high-water mark (coordination §18). Bootstrap hands it
 * to the client; the client hands it back as `subscribe.afterSeq`; `caught-up`
 * frames advance it. Opaque to clients — only "later than" has meaning, and only
 * WITHIN one workspace: `workspace_seq` is per-workspace, so a cursor taken from
 * one workspace is a lie in another. That is why the `WHERE workspace_id = $1`
 * below is load-bearing rather than a filter for tidiness.
 *
 * It is deliberately NOT the envelope's `seq`, which is per-entity and restarts
 * at 1 for every new entity: a workspace resumed by `seq > afterSeq` silently
 * skips every new entity's early events, and the client never learns it missed
 * them. `seq` keeps its own role (entity history, replay, snapshots).
 *
 * Reading `max()` here is safe as a HIGH-WATER READ — bootstrap answering "you
 * have everything up to N" — because ingest assigns `workspace_seq` under
 * `lockWorkspace` inside the appending transaction: nothing at or below a
 * committed max can still be in flight. It is NOT safe as an ASSIGNMENT
 * strategy; use `nextWorkspaceSeq` under `lockWorkspace` for that.
 *
 * Takes `PoolClient | Pool` (the shipped ledger convention) so an in-transaction
 * caller reads its own uncommitted appends without a second signature.
 */
export async function readStreamSeq(
  client: PoolClient | Pool,
  workspaceId: string,
): Promise<number> {
  const result = await client.query<{ stream_seq: number }>(
    'SELECT coalesce(max(workspace_seq), 0)::bigint AS stream_seq FROM events WHERE workspace_id = $1',
    [workspaceId],
  );
  const row = result.rows[0];
  if (row === undefined) {
    // An ungrouped aggregate always returns exactly one row, so this is
    // unreachable rather than a real fallback. It throws instead of returning 0
    // on purpose: a `?? 0` here would also swallow a missing COALESCE, and a
    // cursor that invents 0 tells a client it has everything when it has
    // nothing. The int8 comes back as a number because src/db.ts installs the
    // global OID-20 parser and every pool is built through createPool; a
    // `Number()` wrap would add nothing but would turn SQL NULL into a
    // convincing 0, which is exactly the failure this cursor must not have.
    throw new Error(`readStreamSeq: no row for workspace ${workspaceId}`);
  }
  return row.stream_seq;
}
