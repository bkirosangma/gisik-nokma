import { pathToFileURL } from 'node:url';
import type { Pool, PoolClient } from 'pg';
import { loadConfig } from '../config.js';
import { createPool } from '../db.js';
import { readLedger } from '../ledger/event-store.js';
import { buildProjectionRegistry } from '../projections/index.js';
import type { ProjectionRegistry } from '../projections/registry.js';

const SHADOW_SCHEMA = 'verify_shadow';

export type TableDiff = {
  table: string;
  missingFromLive: number; // rows the ledger derives that live lacks
  extraInLive: number;     // rows live holds that the ledger does not derive
  samples: string[];       // up to 5 differing rows per direction, labelled
};

export type VerifyReport = {
  clean: boolean;
  diffs: TableDiff[]; // drifted tables only
};

/**
 * The rebuild-and-diff discipline (spec §3): re-derive every registered
 * projection from the ledger into a shadow schema, then diff shadow against
 * live in both directions. Live tables are never written. The shadow schema
 * is always dropped, drift or not. Fixed schema name: two concurrent verifies
 * on one database collide — acceptable for an operational CLI.
 *
 * Trick: with search_path set to (verify_shadow, public), each projection's
 * unqualified table names resolve to its shadow copies, while 'events' — which
 * has no shadow copy — still resolves to public.events. Projections replay
 * unchanged, into the shadow.
 */
export async function verifyProjections(deps: {
  pool: Pool;
  projections: ProjectionRegistry;
}): Promise<VerifyReport> {
  const client = await deps.pool.connect();
  try {
    await client.query(`DROP SCHEMA IF EXISTS ${SHADOW_SCHEMA} CASCADE`);
    await client.query(`CREATE SCHEMA ${SHADOW_SCHEMA}`);
    const projections = deps.projections.all();
    for (const projection of projections) {
      for (const table of projection.tables) {
        await client.query(`CREATE TABLE ${SHADOW_SCHEMA}.${table} (LIKE public.${table} INCLUDING ALL)`);
      }
    }

    await client.query(`SET search_path TO ${SHADOW_SCHEMA}, public`);
    const ledger = await readLedger(client);
    for (const projection of projections) {
      await projection.reset(client);
      for (const event of ledger) {
        await projection.apply(event, client);
      }
    }
    await client.query('RESET search_path');

    const diffs: TableDiff[] = [];
    for (const projection of projections) {
      for (const table of projection.tables) {
        const diff = await diffTable(client, table);
        if (diff.missingFromLive > 0 || diff.extraInLive > 0) {
          diffs.push(diff);
        }
      }
    }
    return { clean: diffs.length === 0, diffs };
  } finally {
    await client.query('RESET search_path').catch(() => {});
    await client.query(`DROP SCHEMA IF EXISTS ${SHADOW_SCHEMA} CASCADE`).catch(() => {});
    client.release();
  }
}

async function diffTable(client: PoolClient, table: string): Promise<TableDiff> {
  const missing = await client.query<{ row: string }>(
    `SELECT row_to_json(d)::text AS row
     FROM (SELECT * FROM ${SHADOW_SCHEMA}.${table} EXCEPT SELECT * FROM public.${table}) d`,
  );
  const extra = await client.query<{ row: string }>(
    `SELECT row_to_json(d)::text AS row
     FROM (SELECT * FROM public.${table} EXCEPT SELECT * FROM ${SHADOW_SCHEMA}.${table}) d`,
  );
  const samples = [
    ...missing.rows.slice(0, 5).map((entry) => `missing from live: ${entry.row}`),
    ...extra.rows.slice(0, 5).map((entry) => `extra in live: ${entry.row}`),
  ];
  return { table, missingFromLive: missing.rows.length, extraInLive: extra.rows.length, samples };
}

export function formatReport(report: VerifyReport): string {
  if (report.clean) {
    return 'verify-projections: clean — every projection matches its rebuild from the ledger';
  }
  const lines = ['verify-projections: DRIFT DETECTED'];
  for (const diff of report.diffs) {
    lines.push(`  ${diff.table}: ${diff.missingFromLive} row(s) missing from live, ${diff.extraInLive} extra in live`);
    for (const sample of diff.samples) {
      lines.push(`    ${sample}`);
    }
  }
  return lines.join('\n');
}

async function main(): Promise<void> {
  const config = loadConfig(process.env);
  const pool = createPool(config.databaseUrl);
  try {
    const report = await verifyProjections({ pool, projections: buildProjectionRegistry() });
    console.log(formatReport(report));
    process.exitCode = report.clean ? 0 : 1;
  } finally {
    await pool.end();
  }
}

const executedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (executedDirectly) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
