import type { Pool } from 'pg';
import { readLedger } from '../ledger/event-store.js';
import type { ProjectionRegistry } from './registry.js';

/**
 * Rebuilds ONE projection's LIVE tables from the ledger inside a single
 * transaction: reset, then apply every event in canonical replay order.
 * This truncates live projection tables — an offline/operational action,
 * never a request-path one. The verifier CLI never calls this against live;
 * it rebuilds into a shadow schema instead.
 */
export async function rebuildProjection(
  name: string,
  deps: { pool: Pool; projections: ProjectionRegistry },
): Promise<void> {
  const projection = deps.projections.get(name);
  if (projection === undefined) {
    throw new Error(`unknown projection: ${name}`);
  }
  const client = await deps.pool.connect();
  let rollbackFailure: Error | undefined;
  try {
    await client.query('BEGIN');
    await projection.reset(client);
    const ledger = await readLedger(client);
    for (const event of ledger) {
      await projection.apply(event, client);
    }
    await client.query('COMMIT');
  } catch (error) {
    // Guarded so a ROLLBACK that itself throws — the dead-connection case,
    // where the original error matters most — cannot replace it.
    await client.query('ROLLBACK').catch((failure: unknown) => {
      rollbackFailure = failure instanceof Error ? failure : new Error(String(failure));
    });
    throw error;
  } finally {
    // Release with the error to destroy a connection still inside an aborted
    // transaction rather than handing it to the next borrower.
    client.release(rollbackFailure);
  }
}
