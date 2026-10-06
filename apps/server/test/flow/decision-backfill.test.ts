import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { evaluateEvent } from '@gisik-nokma/rule-engine';
import {
  builtinTicketTypeDefs, DECISION_TYPE_ID, newUlid, SYSTEM_ACTOR_FLOW, ticketTypeDefSchema, type TicketTypeDef,
} from '@gisik-nokma/domain';
import {
  backfillDecisionType, DECISION_BACKFILL_BOOT_DELAY_MS, decisionBackfillIntervalMs, findDecisionBackfillCandidates, firstThenEvery,
} from '../../src/flow/decision-backfill.js';
import { createIngestService } from '../../src/ingest/ingest-service.js';
import { buildProjectionRegistry } from '../../src/projections/index.js';
import { applyCommitted, makeCommitted, resetEntitySeqs } from '../helpers/apply.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';

const HUMAN = '01J9GUKR000000000000000000';
let db: TestDatabase;
beforeEach(async () => { resetEntitySeqs(); db = await createTestDatabase(); });
afterEach(async () => { await db.drop(); });

const door = () => createIngestService({ pool: db.pool, evaluate: evaluateEvent, projections: buildProjectionRegistry() });
const workflowEvent = (workspaceId: string, id: string) => makeCommitted({
  workspaceId, actorId: HUMAN, entity: { kind: 'workflow', id }, type: 'workflow.defined',
  payload: { id, version: 1, name: 'Flow', initialStateId: 'todo',
    states: [{ id: 'todo', name: 'To do', category: 'open' }, { id: 'done', name: 'Done', category: 'terminal' }],
    transitions: [{ from: 'todo', to: 'done', rules: [] }] },
});
const typeEvent = (workspaceId: string, def: TicketTypeDef) => makeCommitted({
  workspaceId, actorId: HUMAN, entity: { kind: 'ticket-type', id: newUlid() }, type: 'ticket-type.defined', payload: def,
});
const lifecycle = (workspaceId: string, type: 'workspace.deleted' | 'workspace.undeleted' | 'workspace.archived' | 'purge.marked') => makeCommitted({
  workspaceId, actorId: HUMAN, entity: { kind: 'workspace', id: workspaceId }, type, payload: {},
});

/** A workspace founded BEFORE the Decision seed: four types, `task` bound to `taskWf` (default: the main workflow). */
async function seedLegacy(workspaceId: string, opts: { taskWf?: string; withoutTask?: boolean } = {}): Promise<{ mainWf: string; taskWf: string }> {
  const mainWf = `wf-main-${workspaceId}`;
  const taskWf = opts.taskWf ?? mainWf;
  const defs = builtinTicketTypeDefs(mainWf)
    .filter((d) => d.id !== DECISION_TYPE_ID && !(opts.withoutTask === true && d.id === 'task'))
    .map((d) => (d.id === 'task' ? { ...d, workflowId: taskWf } : d));
  await applyCommitted(db.pool, [
    ...[...new Set([mainWf, taskWf])].map((id) => workflowEvent(workspaceId, id)),
    ...defs.map((d) => typeEvent(workspaceId, d)),
  ]);
  return { mainWf, taskWf };
}
const decisionRows = async (workspaceId: string) => (await db.pool.query<{ workflow_id: string; rank: number; icon: string; name: string; fields: unknown; defined_by: string }>(
  `SELECT workflow_id, rank, icon, name, fields, defined_by FROM proj_ticket_types WHERE workspace_id = $1 AND type_id = $2`, [workspaceId, DECISION_TYPE_ID])).rows;
const decisionEvents = async (workspaceId: string) => (await db.pool.query<{ actor_id: string; origin: string; payload: unknown }>(
  `SELECT actor_id, origin, payload FROM events WHERE workspace_id = $1 AND type = 'ticket-type.defined' AND payload->>'id' = $2 ORDER BY workspace_seq`, [workspaceId, DECISION_TYPE_ID])).rows;

describe('29.143 the Decision backfill', () => {
  it('29.143 binds the type to the TASK type\'s workflow, filed by the flow actor at the server origin; the other types keep theirs', async () => {
    const ws = newUlid();
    const { mainWf, taskWf } = await seedLegacy(ws, { taskWf: `wf-task-${ws}` });
    expect(taskWf).not.toBe(mainWf); // the premise: "first workflow" and "task's workflow" differ
    const report = await backfillDecisionType({ pool: db.pool, ingest: door() });
    expect(report).toEqual({ candidates: 1, defined: 1, refused: 0, alreadyHad: 0 });
    expect(await decisionRows(ws)).toEqual([{ workflow_id: taskWf, rank: 3, icon: 'diamond', name: 'Decision', fields: [], defined_by: SYSTEM_ACTOR_FLOW }]);
    const [event, ...rest] = await decisionEvents(ws);
    expect(rest).toEqual([]);
    expect(event).toMatchObject({ actor_id: SYSTEM_ACTOR_FLOW, origin: 'server' });
    expect(ticketTypeDefSchema.parse(event!.payload)).toEqual(builtinTicketTypeDefs(taskWf).find((d) => d.id === DECISION_TYPE_ID));
    const epic = await db.pool.query<{ workflow_id: string }>(`SELECT workflow_id FROM proj_ticket_types WHERE workspace_id = $1 AND type_id = 'epic'`, [ws]);
    expect(epic.rows[0]?.workflow_id).toBe(mainWf); // control: a sibling is untouched
  });

  it('29.143 a second run adds nothing', async () => {
    const ws = newUlid();
    await seedLegacy(ws);
    await backfillDecisionType({ pool: db.pool, ingest: door(), now: () => new Date('2026-10-01T06:30:00.000Z') });
    // The injected clock is the definition's claimed instant (the sweep's convention), not the wall clock.
    const stamped = await db.pool.query<{ client_time: Date }>(`SELECT client_time FROM events WHERE workspace_id = $1 AND payload->>'id' = $2`, [ws, DECISION_TYPE_ID]);
    expect(stamped.rows.map((row) => row.client_time.toISOString())).toEqual(['2026-10-01T06:30:00.000Z']);
    const again = await backfillDecisionType({ pool: db.pool, ingest: door() });
    expect(again).toEqual({ candidates: 0, defined: 0, refused: 0, alreadyHad: 1 });
    expect(await decisionEvents(ws)).toHaveLength(1);
  });

  it('29.143 adopts an existing decision type, and skips trashed, purge-marked and task-less workspaces', async () => {
    const [live, custom, trashed, marked, taskless] = [newUlid(), newUlid(), newUlid(), newUlid(), newUlid()];
    await seedLegacy(live);
    const { mainWf } = await seedLegacy(custom);
    const theirs: TicketTypeDef = { id: DECISION_TYPE_ID, name: 'Choices', icon: 'flag', rank: 5, workflowId: mainWf, fields: [] };
    await applyCommitted(db.pool, [typeEvent(custom, theirs)]);
    await seedLegacy(trashed);
    await applyCommitted(db.pool, [lifecycle(trashed, 'workspace.deleted')]);
    await seedLegacy(marked);
    await applyCommitted(db.pool, [lifecycle(marked, 'purge.marked')]);
    await seedLegacy(taskless, { withoutTask: true });

    expect((await findDecisionBackfillCandidates(db.pool)).map((c) => c.workspaceId)).toEqual([live]); // dry-run view
    const report = await backfillDecisionType({ pool: db.pool, ingest: door() });
    expect(report).toEqual({ candidates: 1, defined: 1, refused: 0, alreadyHad: 1 });
    expect(await decisionRows(live)).toEqual([expect.objectContaining({ workflow_id: `wf-main-${live}`, defined_by: SYSTEM_ACTOR_FLOW })]); // control: the live one did get it
    expect(await decisionRows(custom)).toEqual([expect.objectContaining({ name: 'Choices', rank: 5, icon: 'flag' })]);
    expect(await decisionEvents(custom)).toHaveLength(1); // only their own
    for (const skipped of [trashed, marked, taskless]) expect(await decisionRows(skipped)).toEqual([]);
  });

  it('29.143 counts a refused and an invalid answer in refused and logs each, instead of throwing', async () => {
    const ws = newUlid();
    await seedLegacy(ws);
    const log = vi.fn();
    const refusing = { ingestBatch: async (events: unknown[]) => events.map((e) => ({ status: 'refused' as const, eventId: (e as { id: string }).id, rule: 'test.rule', reason: 'nope' })) };
    const invalid = { ingestBatch: async (events: unknown[]) => events.map(() => ({ status: 'invalid' as const, eventId: null, code: 'invalid-payload' as const, message: 'bad' })) };
    expect(await backfillDecisionType({ pool: db.pool, ingest: refusing as never, log })).toEqual({ candidates: 1, defined: 0, refused: 1, alreadyHad: 0 });
    expect(await backfillDecisionType({ pool: db.pool, ingest: invalid as never, log })).toEqual({ candidates: 1, defined: 0, refused: 1, alreadyHad: 0 });
    expect(log).toHaveBeenCalledTimes(2);
    expect(String(log.mock.calls[0]?.[0])).toContain('test.rule');
    expect(String(log.mock.calls[0]?.[0])).toContain(ws); // the line names the workspace the refusal belongs to
    expect(String(log.mock.calls[1]?.[0])).toContain('INVALID');
    expect(String(log.mock.calls[1]?.[0])).toContain(ws);
  });

  it('29.143 the interval reader and the boot-then-repeat delay', () => {
    expect(decisionBackfillIntervalMs({})).toBe(86_400_000);
    expect(decisionBackfillIntervalMs({ DECISION_BACKFILL_INTERVAL_MS: '  ' })).toBe(86_400_000); // empty means unset
    expect(decisionBackfillIntervalMs({ DECISION_BACKFILL_INTERVAL_MS: '300' })).toBe(300);
    const next = firstThenEvery(86_400_000, 30_000);
    expect([next(), next(), next()]).toEqual([30_000, 86_400_000, 86_400_000]);
    const quick = firstThenEvery(300, 30_000);
    expect([quick(), quick()]).toEqual([300, 300]); // never later than the interval
    expect(() => firstThenEvery(0, 30_000)()).toThrow('DECISION_BACKFILL_INTERVAL_MS');
    expect(DECISION_BACKFILL_BOOT_DELAY_MS).toBe(30_000); // the boot delay the daemon arms with (spec: "30 s after boot")
  });

  it('29.143 hands the door 100 definitions a batch, in workspace order, each answer logged against its own workspace; control: exactly 100 candidates is one batch', async () => {
    // Candidate rows straight into the projection, inserted in DESCENDING id order so heap order is not the answer.
    const seedTaskRows = (prefix: string, n: number) => db.pool.query(
      `INSERT INTO proj_ticket_types (workspace_id, type_id, name, icon, rank, workflow_id, fields, defined_by, defined_at, defined_workspace_seq)
       SELECT $1 || lpad(i::text, 3, '0'), 'task', 'Task', 'check', 3, 'wf-' || $1 || i, '[]'::jsonb, $2, now(), 1
         FROM generate_series($3::int, 1, -1) AS i`, [prefix, HUMAN, n]);
    // Every definition refused, its rule naming the workflow it carried: a line pairs the workspace the loop names with the
    // workflow the event was built from, so an answer mapped to the wrong candidate reads as a mismatched pair.
    const run = async () => {
      const sizes: number[] = [];
      const log = vi.fn();
      const refusing = {
        ingestBatch: async (events: Array<{ id: string; payload: { workflowId: string } }>) => {
          sizes.push(events.length);
          return events.map((e) => ({ status: 'refused' as const, eventId: e.id, rule: `r-${e.payload.workflowId}`, reason: 'nope' }));
        },
      };
      const report = await backfillDecisionType({ pool: db.pool, ingest: refusing as never, log });
      return { report, sizes, logged: log.mock.calls.map((call) => String(call[0])) };
    };
    const lineFor = (prefix: string, i: number) => `decision backfill refused for workspace ${prefix}${String(i).padStart(3, '0')}: r-wf-${prefix}${i}: nope`;
    await seedTaskRows('a-', 100);
    const exactly = await run();
    expect(exactly.sizes).toEqual([100]);
    expect(exactly.report).toEqual({ candidates: 100, defined: 0, refused: 100, alreadyHad: 0 });
    await seedTaskRows('b-', 1);
    const over = await run();
    expect(over.sizes).toEqual([100, 1]);
    expect(over.report).toEqual({ candidates: 101, defined: 0, refused: 101, alreadyHad: 0 });
    expect(over.logged).toEqual([...Array.from({ length: 100 }, (_, k) => lineFor('a-', k + 1)), lineFor('b-', 1)]);
  });

  it('29.143 the spawned CLI: --dry-run lists the candidates and writes nothing, a run defines and exits 0, a refusal exits 1 naming the workspace, no DATABASE_URL exits 2, and importing the module runs nothing', async () => {
    // A process, not an import of main: the entry guard, the DATABASE_URL read and the exit code only exist when it runs as a CLI.
    const serverDir = join(dirname(fileURLToPath(import.meta.url)), '../..');
    const spawnTsx = (args: string[], env: NodeJS.ProcessEnv) => spawnSync('pnpm', ['exec', 'tsx', ...args], { cwd: serverDir, encoding: 'utf8', env, timeout: 90_000 });
    const cli = (...flags: string[]) => spawnTsx(['src/tools/backfill-decision-type.ts', ...flags], { ...process.env, DATABASE_URL: db.url, DATABASE_CA_CERT: '' });
    const line = (stdout: string, msg: string): Record<string, unknown> | undefined => stdout.split('\n').flatMap((l) => {
      try { return [JSON.parse(l) as Record<string, unknown>]; } catch { return []; }
    }).find((entry) => entry['msg'] === msg);
    const ws = newUlid();
    await seedLegacy(ws);

    const dry = cli('--dry-run');
    expect(dry.status, dry.stderr).toBe(0);
    expect(line(dry.stdout, 'decision backfill dry run')).toEqual({ msg: 'decision backfill dry run', candidates: [{ workspaceId: ws, workflowId: `wf-main-${ws}` }] });
    expect(line(dry.stdout, 'decision backfill complete')).toBeUndefined();
    expect(await decisionEvents(ws)).toEqual([]); // the dry run wrote nothing
    expect(dry.stdout).toContain('"msg":"database pool","tls":"none"'); // control for the CA leg below
    // DATABASE_CA_CERT reaches the pool (the 2026-09-23 production defect was a pool built without it). The test
    // database speaks no TLS, so this run fails after the announcement; what it announces is the point.
    const withCa = spawnTsx(['src/tools/backfill-decision-type.ts', '--dry-run'],
      { ...process.env, DATABASE_URL: db.url, DATABASE_CA_CERT: '-----BEGIN CERTIFICATE-----\nMIIBfake\n-----END CERTIFICATE-----\n' });
    expect(withCa.stdout).toContain('"msg":"database pool","tls":"ca"');

    // Import safety: loading the module must not run main(). `tsx -e` has no `argv[1]`, and a script FILE has one that is not the
    // CLI's, so the entry guard is read in both its halves; DATABASE_URL is set, so a main() that ran would write the definition.
    const imported = spawnTsx(['-e', "import('./src/tools/backfill-decision-type.ts').then(() => console.log('imported-only'))"], { ...process.env, DATABASE_URL: db.url });
    expect(imported.status, imported.stderr).toBe(0);
    expect(imported.stdout.trim()).toBe('imported-only');
    const scratch = mkdtempSync(join(tmpdir(), 'decision-backfill-import-'));
    try {
      const entry = join(scratch, 'import-only.mts');
      writeFileSync(entry, `await import(${JSON.stringify(pathToFileURL(join(serverDir, 'src/tools/backfill-decision-type.ts')).href)});\nconsole.log('imported-only');\n`);
      const viaFile = spawnTsx([entry], { ...process.env, DATABASE_URL: db.url });
      expect(viaFile.status, viaFile.stderr).toBe(0);
      expect(viaFile.stdout.trim()).toBe('imported-only');
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
    expect(await decisionEvents(ws)).toEqual([]); // control for both imports: the run below, same database, does write

    const run = cli();
    expect(run.status, run.stderr).toBe(0);
    expect(line(run.stdout, 'decision backfill complete')).toEqual({ msg: 'decision backfill complete', candidates: 1, defined: 1, refused: 0, alreadyHad: 0 });
    expect(await decisionRows(ws)).toEqual([expect.objectContaining({ workflow_id: `wf-main-${ws}`, defined_by: SYSTEM_ACTOR_FLOW })]);

    // A real refusal from the real door: a workspace the purge has erased (`purged_entities`) is refused `purged` by
    // `checkPurged`, while no lifecycle row excludes it from the candidates.
    const gone = newUlid();
    await seedLegacy(gone);
    await db.pool.query(`INSERT INTO purged_entities (entity_kind, entity_id, workspace_id, purged_at) VALUES ('workspace', $1, $1, now())`, [gone]);
    const refused = cli();
    expect(refused.status).toBe(1);
    expect(line(refused.stdout, 'decision backfill complete')).toEqual({ msg: 'decision backfill complete', candidates: 1, defined: 0, refused: 1, alreadyHad: 1 });
    expect(refused.stderr).toContain(`decision backfill refused for workspace ${gone}`);
    expect(await decisionRows(gone)).toEqual([]);

    const env = { ...process.env };
    delete env['DATABASE_URL'];
    const unset = spawnTsx(['src/tools/backfill-decision-type.ts'], env);
    expect(unset.status).toBe(2);
    expect(unset.stderr).toContain('DATABASE_URL is required');
  }, 120_000);

  it('29.143 one run defines every candidate in ITS OWN workspace, bound to ITS OWN task workflow; control: each holds exactly one definition', async () => {
    // Two candidates through the REAL door in one batch: every other case hands the door one candidate (or a stub that
    // never reads the envelope's workspace), so an envelope filed in the wrong tenant would pass them all.
    const pair = [newUlid(), newUlid()];
    for (const ws of pair) await seedLegacy(ws, { taskWf: `wf-task-${ws}` });
    expect(await backfillDecisionType({ pool: db.pool, ingest: door() })).toEqual({ candidates: 2, defined: 2, refused: 0, alreadyHad: 0 });
    for (const ws of pair) {
      expect(await decisionRows(ws), ws).toEqual([expect.objectContaining({ workflow_id: `wf-task-${ws}`, defined_by: SYSTEM_ACTOR_FLOW })]);
      expect(await decisionEvents(ws), ws).toHaveLength(1);
    }
  });

  it('29.143 a live workspace that HAS a lifecycle row (archived; deleted then undeleted) is still a candidate; control: a trashed one beside them is not', async () => {
    const [archived, back, trashed] = [newUlid(), newUlid(), newUlid()];
    for (const ws of [archived, back, trashed]) await seedLegacy(ws);
    await applyCommitted(db.pool, [
      lifecycle(archived, 'workspace.archived'),
      lifecycle(back, 'workspace.deleted'), lifecycle(back, 'workspace.undeleted'),
      lifecycle(trashed, 'workspace.deleted'),
    ]);
    // The premise: all three hold a proj_workspaces row, so "has a row" is not what excludes the trashed one.
    const rows = await db.pool.query<{ workspace_id: string }>(`SELECT workspace_id FROM proj_workspaces WHERE workspace_id = ANY($1)`, [[archived, back, trashed]]);
    expect(rows.rows.map((row) => row.workspace_id).sort()).toEqual([archived, back, trashed].sort());
    expect((await findDecisionBackfillCandidates(db.pool)).map((c) => c.workspaceId).sort()).toEqual([archived, back].sort());
    expect(await backfillDecisionType({ pool: db.pool, ingest: door() })).toEqual({ candidates: 2, defined: 2, refused: 0, alreadyHad: 0 });
    for (const ws of [archived, back]) expect(await decisionRows(ws), ws).toEqual([expect.objectContaining({ workflow_id: `wf-main-${ws}`, defined_by: SYSTEM_ACTOR_FLOW })]);
    expect(await decisionRows(trashed)).toEqual([]);
  });
});
