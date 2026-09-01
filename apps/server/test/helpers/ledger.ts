import type { LedgerEvent } from '@gisik-nokma/domain';
import type { Pool } from 'pg';
import { insertEvent } from '../../src/ledger/event-store.js';

/**
 * Append one committed event to the ledger, for tests that need history to
 * already exist without driving the whole ingest pipeline.
 *
 * ## It wraps `insertEvent` rather than restating the INSERT
 *
 * The plan text spelled the thirteen-column `INSERT INTO events` out again here.
 * `src/ledger/event-store.ts` already owns that statement, and a second copy is
 * a fixture that can disagree with the product: a column added to the ledger
 * would leave this helper writing an older shape, and every test built on it
 * would go on passing against history the server itself could not have written.
 * So the real function is called, and the only thing this helper adds is the
 * connection checkout — `insertEvent` takes a `PoolClient` because the product
 * only ever appends inside the ingest transaction, and a test holds a `Pool`.
 *
 * That also settles the plan's `new Date(env.clientTime)` note: `insertEvent`
 * hands pg the envelope's ISO-8601 `Z` strings, both clocks land in
 * `timestamptz` columns (owner decision 2026-08-20, "time is Asia/Kolkata"), and
 * readback is the INSTANT, not the label the submitting device attached. A
 * fixture converting to `Date` first would be writing the column differently
 * from the product, which is the drift this helper exists to avoid.
 *
 * `workspaceSeq` is NOT NULL and unique per workspace: `testEnvelope` mints a
 * globally climbing one, so events appended here never collide.
 *
 * `LedgerEvent` is imported from `@gisik-nokma/domain`, where it is defined —
 * the plan text imported it from `../../src/ledger/event-store`, which only
 * imports the type without re-exporting it, so that import does not compile.
 */
export async function appendTestEvent(pool: Pool, env: LedgerEvent): Promise<void> {
  const client = await pool.connect();
  try {
    await insertEvent(client, env);
  } finally {
    client.release();
  }
}
