import pg from 'pg';
import type { Pool } from 'pg';
import { IST_TIME_ZONE } from '@gisik-nokma/domain';

// Postgres int8 (OID 20) arrives as a string by default. Sequence numbers stay
// far below Number.MAX_SAFE_INTEGER (2^53), so parse to number once, globally.
// Every pool in app and tests must come through createPool so this holds.
pg.types.setTypeParser(20, (value) => Number.parseInt(value, 10));

/**
 * Every connection runs with session timezone Asia/Kolkata (owner decision:
 * time is Asia/Kolkata), so a timestamptz rendered by an ad-hoc query reads the
 * same clock the product shows — one time story, not two. This does not change
 * any stored instant: timestamptz is absolute, and the session zone only
 * decides which offset Postgres prints it in.
 *
 * `options` is sent as the Postgres startup parameter, so the zone is set
 * before the first query rather than by a query that could race with one.
 */
export function createPool(databaseUrl: string): Pool {
  return new pg.Pool({
    connectionString: databaseUrl,
    max: 10,
    options: `-c timezone=${IST_TIME_ZONE}`,
  });
}
