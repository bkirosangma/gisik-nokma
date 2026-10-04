import { pathToFileURL } from 'node:url';
import type { Pool } from 'pg';
import { createPool } from '../db.js';
import type { Queryable } from '../db/queryable.js';
import { optionalDatabaseCaCert } from '../ops/backup-env.js';

/** The ids Part 2 adds to BUILTIN_FIELD_IDS. A literal on purpose: this tool must give the same answer before and after T4. T4's 29.153 asserts it is a subset of the domain list. */
export const NEW_BUILTIN_FIELD_IDS = ['estimate', 'waitForAll', 'reworkEstimate'] as const;
const DECISION_SEED_RANK = 3;

export type ShadowFinding =
  | { source: 'ledger-definition'; workspaceId: string; typeId: string; fieldId: string; eventId: string }
  | { source: 'type-projection'; workspaceId: string; typeId: string; fieldId: string }
  | { source: 'field-claim'; workspaceId: string; fieldId: string; claims: number };
export type ExistingDecisionType = { workspaceId: string; name: string; rank: number; workflowId: string; taskWorkflowId: string | null; rankMatchesSeed: boolean; sameWorkflowAsTask: boolean };
export type TerminalInitialWorkflow = { workspaceId: string; workflowId: string; version: number; initialStateId: string; boundTypes: number };
export type WtgPreflightReport = { database: string; workspaces: number; shadows: ShadowFinding[]; decisionTypes: ExistingDecisionType[]; terminalInitialWorkflows: TerminalInitialWorkflow[] };

export async function wtgPreflight(db: Queryable): Promise<WtgPreflightReport> {
  const ids = [...NEW_BUILTIN_FIELD_IDS];
  const context = await db.query<{ database: string; workspaces: string }>(
    `SELECT current_database() AS database,
            (SELECT count(DISTINCT workspace_id) FROM events WHERE type = 'workspace.created') AS workspaces`,
  );
  const ledger = await db.query<{ workspace_id: string; event_id: string; type_id: string; field_id: string }>(
    `SELECT e.workspace_id, e.id AS event_id, e.payload->>'id' AS type_id, f->>'id' AS field_id
       FROM events e
      CROSS JOIN LATERAL jsonb_array_elements(
            CASE WHEN jsonb_typeof(e.payload->'fields') = 'array' THEN e.payload->'fields' ELSE '[]'::jsonb END) AS f
      WHERE e.type = 'ticket-type.defined' AND f->>'id' = ANY($1::text[])
      ORDER BY e.workspace_id, e.workspace_seq, f->>'id'`,
    [ids],
  );
  const projected = await db.query<{ workspace_id: string; type_id: string; field_id: string }>(
    `SELECT t.workspace_id, t.type_id, f->>'id' AS field_id
       FROM proj_ticket_types t CROSS JOIN LATERAL jsonb_array_elements(t.fields) AS f
      WHERE f->>'id' = ANY($1::text[]) ORDER BY 1, 2, 3`,
    [ids],
  );
  const claims = await db.query<{ workspace_id: string; field_id: string; claims: string }>(
    `SELECT e.workspace_id, e.payload->>'fieldId' AS field_id, count(*) AS claims
       FROM events e WHERE e.type = 'ticket.field_set' AND e.payload->>'fieldId' = ANY($1::text[])
      GROUP BY 1, 2 ORDER BY 1, 2`,
    [ids],
  );
  const decisions = await db.query<{ workspace_id: string; name: string; rank: number; workflow_id: string; task_workflow_id: string | null }>(
    `SELECT t.workspace_id, t.name, t.rank, t.workflow_id,
            (SELECT k.workflow_id FROM proj_ticket_types k WHERE k.workspace_id = t.workspace_id AND k.type_id = 'task') AS task_workflow_id
       FROM proj_ticket_types t WHERE t.type_id = 'decision' ORDER BY t.workspace_id`,
  );
  const terminal = await db.query<{ workspace_id: string; workflow_id: string; version: number; initial_state_id: string; bound_types: string }>(
    `SELECT w.workspace_id, w.workflow_id, w.version, w.definition->>'initialStateId' AS initial_state_id,
            (SELECT count(*) FROM proj_ticket_types t WHERE t.workspace_id = w.workspace_id AND t.workflow_id = w.workflow_id) AS bound_types
       FROM proj_workflows w
      WHERE w.version = (SELECT max(v.version) FROM proj_workflows v WHERE v.workflow_id = w.workflow_id)
        AND EXISTS (SELECT 1 FROM jsonb_array_elements(w.definition->'states') s
                     WHERE s->>'id' = w.definition->>'initialStateId' AND s->>'category' = 'terminal')
      ORDER BY 1, 2`,
  );
  return {
    database: context.rows[0]?.database ?? '',
    workspaces: Number(context.rows[0]?.workspaces ?? 0),
    shadows: [
      ...ledger.rows.map((r): ShadowFinding => ({ source: 'ledger-definition', workspaceId: r.workspace_id, typeId: r.type_id, fieldId: r.field_id, eventId: r.event_id })),
      ...projected.rows.map((r): ShadowFinding => ({ source: 'type-projection', workspaceId: r.workspace_id, typeId: r.type_id, fieldId: r.field_id })),
      ...claims.rows.map((r): ShadowFinding => ({ source: 'field-claim', workspaceId: r.workspace_id, fieldId: r.field_id, claims: Number(r.claims) })),
    ],
    decisionTypes: decisions.rows.map((r) => ({
      workspaceId: r.workspace_id, name: r.name, rank: r.rank, workflowId: r.workflow_id, taskWorkflowId: r.task_workflow_id,
      rankMatchesSeed: r.rank === DECISION_SEED_RANK, sameWorkflowAsTask: r.workflow_id === r.task_workflow_id,
    })),
    terminalInitialWorkflows: terminal.rows.map((r) => ({
      workspaceId: r.workspace_id, workflowId: r.workflow_id, version: r.version, initialStateId: r.initial_state_id, boundTypes: Number(r.bound_types),
    })),
  };
}

export function wtgPreflightExitCode(report: WtgPreflightReport): 0 | 1 {
  return report.shadows.length > 0 ? 1 : 0;
}

export function formatWtgPreflight(report: WtgPreflightReport): string {
  const lines = [`wtg-preflight: database ${report.database} (${report.workspaces} workspaces)`];
  lines.push(report.shadows.length === 0 ? '  shadowing custom fields: none' : `  shadowing custom fields: ${report.shadows.length} (BLOCKS wtg2 T4)`);
  for (const s of report.shadows) {
    lines.push(s.source === 'field-claim'
      ? `    ${s.source.padEnd(18)} ${s.workspaceId} field ${s.fieldId} (${s.claims} claims)`
      : `    ${s.source.padEnd(18)} ${s.workspaceId} type ${s.typeId} field ${s.fieldId}${s.source === 'ledger-definition' ? ` (event ${s.eventId})` : ''}`);
  }
  lines.push(report.decisionTypes.length === 0 ? "  existing 'decision' types: none" : `  existing 'decision' types: ${report.decisionTypes.length} (T7 adopts them)`);
  for (const d of report.decisionTypes) {
    lines.push(`    ${d.workspaceId} "${d.name}" rank ${d.rank}${d.rankMatchesSeed ? '' : ' (NOT 3: no edit after T5)'} workflow ${d.workflowId}${d.sameWorkflowAsTask ? '' : ` (task uses ${d.taskWorkflowId ?? 'none'})`}`);
  }
  lines.push(report.terminalInitialWorkflows.length === 0 ? '  workflows with a terminal initial state: none' : `  workflows with a terminal initial state: ${report.terminalInitialWorkflows.length} (promotion skips them)`);
  for (const w of report.terminalInitialWorkflows) lines.push(`    ${w.workspaceId} workflow ${w.workflowId} v${w.version} initial "${w.initialStateId}" (${w.boundTypes} bound types)`);
  return lines.join('\n');
}

/** Everything the CLI reads runs inside BEGIN READ ONLY: this tool is pointed at PROD by the owner. */
export async function inReadOnlyTransaction<T>(pool: Pool, fn: (db: Queryable) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN READ ONLY');
    try { return await fn(client); } finally { await client.query('ROLLBACK'); }
  } finally {
    client.release();
  }
}

async function main(): Promise<void> {
  const databaseUrl = process.env['DATABASE_URL'];
  if (!databaseUrl) { console.error('DATABASE_URL is required'); process.exit(2); }
  const pool = createPool(databaseUrl, { caCert: optionalDatabaseCaCert(process.env) });
  console.log(JSON.stringify({ msg: 'database pool', tls: pool.options.ssl ? 'ca' : 'none' }));
  try {
    const report = await inReadOnlyTransaction(pool, wtgPreflight);
    console.log(formatWtgPreflight(report));
    process.exitCode = wtgPreflightExitCode(report);
  } finally {
    await pool.end();
  }
}

const executedDirectly = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (executedDirectly) main().catch((error: unknown) => { console.error(error); process.exit(1); });
