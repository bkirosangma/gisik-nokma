import { pathToFileURL } from 'node:url';
import type { Pool } from 'pg';
import { createPool } from '../db.js';

/**
 * The note search pre-flight (Plan 3 of 6, spec §7.1).
 *
 * ## What question this answers, and what it is not
 *
 * It answers "may this database run `1790200000000_note-search.sql`" — asked
 * about a database the migration has NOT been applied to. That is why the
 * central facts are `pg_available_extensions` (what CAN be installed) and
 * `pg_available_extension_versions.trusted`, and NOT `pg_extension`: on a
 * database where the migration already ran, a tool reading `pg_extension`
 * answers "yes" no matter what the image provides, which is the one answer
 * nobody needs. Case 18.124 pins that difference with an available-but-
 * uninstalled control.
 *
 * ## Why `trusted` decides the verdict and `rolcreatedb` does not
 *
 * `CREATE EXTENSION` needs a superuser unless the extension is TRUSTED — a
 * property of the extension, not of the role, and `trusted` is often the
 * difference between a managed database that works and one that does not.
 * `rolcreatedb` sounds like it would matter and does not: it governs
 * `CREATE DATABASE`. It is reported anyway, because it is what the spec's
 * query selects and an operator comparing this output against the plan should
 * see the same two flags.
 *
 * ## What Task 2 adds
 *
 * RSS before and after a warm-up embedding (case 18.129). It belongs in this
 * report and not in a second tool: "can this database do it" and "can this
 * process hold the model" are the same question asked of the two halves of the
 * deployment.
 */

/** The extensions the note search migration creates, in the order it creates them. */
export const REQUIRED_EXTENSIONS = ['pg_trgm', 'vector'] as const;

export type ExtensionReport = {
  name: string;
  /** A row in `pg_available_extensions`: the extension is INSTALLABLE here. */
  available: boolean;
  /** What `CREATE EXTENSION` would install. Null when unavailable. */
  defaultVersion: string | null;
  /** What is actually installed in the connected database, or null. */
  installedVersion: string | null;
  /** Whether `CREATE EXTENSION` may be run by a non-superuser on the default version. */
  trusted: boolean;
};

export type PreflightReport = {
  database: string;
  serverVersion: string;
  extensions: ExtensionReport[];
  /** Requested names that are not installable here. */
  missing: string[];
  role: { name: string; superuser: boolean; createDatabase: boolean } | null;
  /** Whether `REQUIRED_EXTENSIONS` can all be created by the connected role. */
  canCreateExtensions: boolean;
  /** Present only when the caller asked for the embedding warm-up. */
  embedding?: EmbeddingMeasurement;
};

/**
 * The process's resident set, in MiB.
 *
 * RSS rather than heap: the 130 MB token table is a typed array over a Buffer,
 * which is outside V8's heap accounting, and a measurement that could not see it
 * would report a delta near zero for the one thing it was asked about.
 */
export function rssMb(): number {
  return Math.round((process.memoryUsage().rss / (1024 * 1024)) * 10) / 10;
}

export type EmbeddingMeasurement = { beforeMb: number; afterMb: number; deltaMb: number } | { error: string };

/**
 * RSS before and after a warm-up embedding (case 18.129).
 *
 * The failure is REPORTED rather than thrown: this tool's primary question is
 * the extensions, asked of a managed database where the model is irrelevant,
 * and an operator whose checkout has no model files must still get that answer.
 * The line is printed either way, so a broken embedding cannot pass unnoticed —
 * it just cannot take the extension verdict down with it.
 */
export async function measureEmbeddingRss(warmUp: () => Promise<unknown>): Promise<EmbeddingMeasurement> {
  const beforeMb = rssMb();
  try {
    await warmUp();
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
  const afterMb = rssMb();
  return { beforeMb, afterMb, deltaMb: Math.round((afterMb - beforeMb) * 10) / 10 };
}

type ExtensionRow = {
  name: string;
  default_version: string | null;
  installed_version: string | null;
  trusted: boolean | null;
};

type RoleRow = { rolname: string; rolsuper: boolean; rolcreatedb: boolean };

/**
 * `extensions` is a parameter rather than a constant because the report is also
 * the operator's view of what a target database HAS: reading a name that is not
 * required is how 18.124's two controls are expressed, and how a runbook asks
 * "and is `postgis` going to be in the way".
 */
export async function searchPreflight(
  pool: Pool,
  options: { extensions?: readonly string[]; measureEmbedding?: () => Promise<unknown> } = {},
): Promise<PreflightReport> {
  const requested = options.extensions ?? REQUIRED_EXTENSIONS;

  const context = await pool.query<{ database: string; server_version: string }>(
    `SELECT current_database() AS database, current_setting('server_version') AS server_version`,
  );

  /**
   * The LEFT JOIN is on the DEFAULT version, so `trusted` describes the version
   * `CREATE EXTENSION` would actually install. `pg_available_extension_versions`
   * holds one row per version and a name with several would otherwise contribute
   * whichever row the planner returned first.
   */
  const extensionRows = await pool.query<ExtensionRow>(
    `SELECT a.name, a.default_version, a.installed_version, v.trusted
       FROM pg_available_extensions a
       LEFT JOIN pg_available_extension_versions v
              ON v.name = a.name AND v.version = a.default_version
      WHERE a.name = ANY($1::text[])
      ORDER BY a.name`,
    [[...requested]],
  );
  const found = new Map(extensionRows.rows.map((row) => [row.name, row]));

  const extensions: ExtensionReport[] = requested.map((name) => {
    const row = found.get(name);
    return {
      name,
      available: row !== undefined,
      defaultVersion: row?.default_version ?? null,
      installedVersion: row?.installed_version ?? null,
      trusted: row?.trusted ?? false,
    };
  });

  const roleRows = await pool.query<RoleRow>(
    `SELECT rolname, rolsuper, rolcreatedb FROM pg_roles WHERE rolname = current_user`,
  );
  const roleRow = roleRows.rows[0];
  const role = roleRow
    ? { name: roleRow.rolname, superuser: roleRow.rolsuper, createDatabase: roleRow.rolcreatedb }
    : null;

  /**
   * Computed over `REQUIRED_EXTENSIONS` and not over `requested`: it is the
   * verdict for the migration, and a caller asking a side question about some
   * other extension must not be able to change it. An extension that is not
   * available contributes `false` rather than being skipped — what cannot be
   * installed certainly cannot be created.
   */
  const required = extensions.filter((entry) =>
    (REQUIRED_EXTENSIONS as readonly string[]).includes(entry.name),
  );
  const canCreateExtensions =
    role !== null && (role.superuser || required.every((entry) => entry.available && entry.trusted));

  const report: PreflightReport = {
    database: context.rows[0]?.database ?? '',
    serverVersion: context.rows[0]?.server_version ?? '',
    extensions,
    missing: extensions.filter((entry) => !entry.available).map((entry) => entry.name),
    role,
    canCreateExtensions,
  };
  if (options.measureEmbedding) report.embedding = await measureEmbeddingRss(options.measureEmbedding);
  return report;
}

export function formatPreflight(report: PreflightReport): string {
  const lines = [
    `search-preflight: database ${report.database} (PostgreSQL ${report.serverVersion})`,
    `  role: ${report.role ? `${report.role.name} (superuser=${String(report.role.superuser)}, createdb=${String(report.role.createDatabase)})` : 'UNKNOWN — pg_roles has no row for current_user'}`,
    `  may create the required extensions: ${report.canCreateExtensions ? 'yes' : 'NO'}`,
  ];
  for (const entry of report.extensions) {
    const installed = entry.installedVersion === null ? 'not installed' : `installed ${entry.installedVersion}`;
    lines.push(
      `  ${entry.name}: ${entry.available ? `available ${String(entry.defaultVersion)}` : 'NOT AVAILABLE'}` +
        `${entry.available ? `, trusted=${String(entry.trusted)}` : ''}, ${installed}`,
    );
  }
  if (report.missing.length > 0) {
    lines.push(`  MISSING: ${report.missing.join(', ')}`);
  }
  if (report.embedding) {
    lines.push(
      'error' in report.embedding
        ? `  embedding: FAILED — ${report.embedding.error}`
        : `  embedding: RSS ${String(report.embedding.beforeMb)} MB → ${String(report.embedding.afterMb)} MB (Δ ${String(report.embedding.deltaMb)} MB)`,
    );
  }
  return lines.join('\n');
}

/**
 * `DATABASE_URL` directly, NOT `loadConfig`, for the reason
 * `tools/verify-projections.ts` documents at length: this tool is pointed at a
 * TARGET database — possibly a managed one — by an operator, and demanding
 * `BETTER_AUTH_SECRET` and `WEB_ORIGIN` to read an extension catalogue would
 * make the one invocation the plan requires (against the managed database,
 * before the migration) impossible.
 */
async function main(): Promise<void> {
  const databaseUrl = process.env['DATABASE_URL'];
  if (!databaseUrl) {
    console.error('DATABASE_URL is required');
    process.exit(2);
  }
  const pool = createPool(databaseUrl);
  try {
    // Imported HERE rather than at the top of the file so that `searchPreflight`
    // — the surface 18.124 drives — carries no dependency on the embedding
    // module, and so a caller that only wants the extension verdict does not
    // pay for a 130 MB model's parser to be loaded.
    const { embedQuery } = await import('../search/embedding.js');
    const report = await searchPreflight(pool, { measureEmbedding: () => embedQuery('warm-up') });
    console.log(formatPreflight(report));
    process.exitCode = report.missing.length === 0 && report.canCreateExtensions ? 0 : 1;
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
