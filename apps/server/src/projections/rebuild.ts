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
  try {
    await client.query('BEGIN');
    await projection.reset(client);
    const ledger = await readLedger(client);
    for (const event of ledger) {
      await projection.apply(event, client);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
