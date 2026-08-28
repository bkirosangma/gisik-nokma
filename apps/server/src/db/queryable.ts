import type { Pool, PoolClient } from 'pg';

/**
 * Anything the visibility, permission and read-path code can query.
 *
 * Passing the handle explicitly (DIP) keeps every such function testable
 * against a plain `Pool` and usable inside a transaction via `PoolClient` —
 * the same function reads the world the ingest transaction is about to judge
 * against, and the same function answers a read route outside any transaction.
 *
 * This lives beside `../db.ts` (which owns `createPool`) rather than inside it
 * because the specifier `src/db/queryable.js` is a cross-plan contract: Plan 7's
 * server tasks were written against this path. Recorded in the series
 * coordination document under "Plan 4 execution consequences".
 *
 * Deliberately NOT retro-fitted onto `Projection.apply`, whose parameter is a
 * `PoolClient` by design — a projection may only ever write inside the ingest
 * transaction (`src/projections/registry.ts`).
 */
export type Queryable = Pool | PoolClient;
