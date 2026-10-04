import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid } from '@gisik-nokma/domain';
import {
  NEW_BUILTIN_FIELD_IDS,
  formatWtgPreflight,
  inReadOnlyTransaction,
  wtgPreflight,
  wtgPreflightExitCode,
  type WtgPreflightReport,
} from '../../src/tools/wtg-preflight.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { testEnvelope } from '../helpers/envelope.js';
import { appendTestEvent } from '../helpers/ledger.js';

const ACTOR = '01J9GUKR000000000000000000';
let db: TestDatabase;
beforeAll(async () => { db = await createTestDatabase(); });
afterAll(async () => { await db.drop(); });

type FieldDef = { id: string; name: string; type: string };
type Def = { id: string; name: string; icon: string; rank: number; workflowId: string; fields: FieldDef[] };
const def = (id: string, over: Partial<Def> = {}): Def =>
  ({ id, name: id, icon: 'check', rank: 3, workflowId: 'wf', fields: [], ...over });
const num = (id: string): FieldDef => ({ id, name: id, type: 'number' });

// RAW writes on purpose (see "Why the fixture writes RAW rows").
async function defineRaw(workspaceId: string, d: Def): Promise<string> {
  const event = testEnvelope({ workspaceId, actorId: ACTOR, entity: { kind: 'ticket-type', id: newUlid() }, type: 'ticket-type.defined', payload: d });
  await appendTestEvent(db.pool, event);
  return event.id;
}
async function projectRaw(workspaceId: string, d: Def): Promise<void> {
  await db.pool.query(
    `INSERT INTO proj_ticket_types (workspace_id, type_id, name, icon, rank, workflow_id, fields, defined_by, defined_at, defined_workspace_seq)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now(), 1)`,
    [workspaceId, d.id, d.name, d.icon, d.rank, d.workflowId, JSON.stringify(d.fields), ACTOR],
  );
}
async function claimRaw(workspaceId: string, fieldId: string, pool = db.pool): Promise<void> {
  await appendTestEvent(pool, testEnvelope({ workspaceId, actorId: ACTOR, entity: { kind: 'ticket', id: newUlid() }, type: 'ticket.field_set', payload: { fieldId, value: '3 hours' } }));
}
async function workspaceCreatedRaw(workspaceId: string): Promise<void> {
  await appendTestEvent(db.pool, testEnvelope({ workspaceId, actorId: ACTOR, entity: { kind: 'workspace', id: workspaceId }, type: 'workspace.created', payload: { name: 'W' } }));
}
async function workflowRaw(workspaceId: string, workflowId: string, version: number, initialStateId: string): Promise<void> {
  const states = [{ id: 'todo', name: 'To do', category: 'open' }, { id: 'done', name: 'Done', category: 'terminal' }];
  await db.pool.query(
    `INSERT INTO proj_workflows (workspace_id, workflow_id, version, name, definition, defined_by, defined_at, published_workspace_seq)
     VALUES ($1, $2, $3::integer, 'wf', $4, $5, now(), $3::integer)`,
    [workspaceId, workflowId, version, JSON.stringify({ id: workflowId, version, name: 'wf', initialStateId, states, transitions: [] }), ACTOR],
  );
}

describe('29.147 shadow detector', () => {
  it('29.147 reports ledger, projection and claim shadows; superseded counts in the ledger only; near misses are clean', async () => {
    const dirty = newUlid(); const superseded = newUlid(); const clean = newUlid();
    const bad = def('invoice', { fields: [num('estimate'), num('amount')] });
    const eventId = await defineRaw(dirty, bad);
    await projectRaw(dirty, bad);
    await claimRaw(dirty, 'estimate');
    await claimRaw(dirty, 'estimate'); // two claims on one field: the count is a count, not a flag
    await defineRaw(superseded, def('bug', { fields: [num('waitForAll')] }));
    const fixed = def('bug');
    await defineRaw(superseded, fixed);
    await projectRaw(superseded, fixed);
    await defineRaw(clean, def('task', { fields: [num('estimates'), num('Estimate'), num('rework')] }));
    await projectRaw(clean, def('task', { fields: [num('estimates'), num('Estimate'), num('rework')] }));
    await claimRaw(clean, 'Estimate'); // the claim source gets its own near miss, so a case-folding claims query is caught too
    // A non-claim event whose payload happens to carry a fieldId is not a claim; a ticket-type.defined whose fields is not an array (a legacy
    // payload) must not make the ledger query throw.
    await appendTestEvent(db.pool, testEnvelope({ workspaceId: clean, actorId: ACTOR, entity: { kind: 'ticket', id: newUlid() }, type: 'ticket.reopened', payload: { fieldId: 'estimate' } }));
    await defineRaw(clean, { ...def('legacy'), fields: 'none' as never });
    // A fields array with an `estimate` entry on an event that is not a type definition is not a definition either.
    await appendTestEvent(db.pool, testEnvelope({ workspaceId: clean, actorId: ACTOR, entity: { kind: 'ticket', id: newUlid() }, type: 'ticket.created', payload: { fields: [num('estimate')] } }));
    await workspaceCreatedRaw(dirty);
    await workspaceCreatedRaw(clean);

    const { shadows, database, workspaces } = await wtgPreflight(db.pool);
    expect(workspaces).toBe(2); // counted from workspace.created events: the two planted above
    expect(database).toBe(((await db.pool.query<{ d: string }>('SELECT current_database() AS d')).rows[0] as { d: string }).d);
    expect(shadows).toContainEqual({ source: 'ledger-definition', workspaceId: dirty, typeId: 'invoice', fieldId: 'estimate', eventId });
    expect(shadows).toContainEqual({ source: 'type-projection', workspaceId: dirty, typeId: 'invoice', fieldId: 'estimate' });
    expect(shadows).toContainEqual({ source: 'field-claim', workspaceId: dirty, fieldId: 'estimate', claims: 2 });
    expect(shadows).toContainEqual(expect.objectContaining({ source: 'ledger-definition', workspaceId: superseded, typeId: 'bug', fieldId: 'waitForAll' }));
    expect(shadows.filter((s) => s.source === 'type-projection' && s.workspaceId === superseded)).toEqual([]);
    // control, same it(): nothing else is reported
    expect(shadows.some((s) => s.workspaceId === clean)).toBe(false);
    expect(shadows.some((s) => s.fieldId === 'amount')).toBe(false);
    expect([...NEW_BUILTIN_FIELD_IDS]).toEqual(['estimate', 'waitForAll', 'reworkEstimate']);
  });
});

describe('29.148 existing decision types', () => {
  it('29.148 reports rank, workflow and the task workflow per workspace; a workspace without one is absent', async () => {
    const a = newUlid(); const b = newUlid(); const c = newUlid();
    await projectRaw(a, def('task', { workflowId: 'wf-a' }));
    await projectRaw(a, def('decision', { name: 'Decision', rank: 3, workflowId: 'wf-a' })); // name differs from the id, so `name` is read from the name column
    await projectRaw(b, def('task', { workflowId: 'wf-b1' }));
    await projectRaw(b, def('decision', { rank: 5, workflowId: 'wf-b2' }));
    await projectRaw(c, def('task'));
    const d2 = newUlid();
    await projectRaw(d2, def('decision', { rank: 2, workflowId: 'wf-d2' })); // no task type: taskWorkflowId is null; rank 2 is below the seed, not equal to it
    const { decisionTypes } = await wtgPreflight(db.pool);
    expect(decisionTypes).toContainEqual({ workspaceId: a, name: 'Decision', rank: 3, workflowId: 'wf-a', taskWorkflowId: 'wf-a', rankMatchesSeed: true, sameWorkflowAsTask: true });
    expect(decisionTypes).toContainEqual({ workspaceId: b, name: 'decision', rank: 5, workflowId: 'wf-b2', taskWorkflowId: 'wf-b1', rankMatchesSeed: false, sameWorkflowAsTask: false });
    expect(decisionTypes).toContainEqual({ workspaceId: d2, name: 'decision', rank: 2, workflowId: 'wf-d2', taskWorkflowId: null, rankMatchesSeed: false, sameWorkflowAsTask: false });
    expect(decisionTypes.some((d) => d.workspaceId === c)).toBe(false);
  });
});

describe('29.149 terminal-initial workflows', () => {
  it('29.149 reports only the highest version, with its bound types', async () => {
    const ws = newUlid(); const open = newUlid(); const term = newUlid(); const fixed = newUlid(); const broke = newUlid();
    await workflowRaw(ws, open, 1, 'todo');
    await workflowRaw(ws, term, 1, 'done');
    await projectRaw(ws, def('chore', { workflowId: term }));
    await workflowRaw(ws, fixed, 1, 'done');
    await workflowRaw(ws, fixed, 2, 'todo');
    await workflowRaw(ws, broke, 1, 'todo');
    await workflowRaw(ws, broke, 2, 'done');
    const found = (await wtgPreflight(db.pool)).terminalInitialWorkflows.filter((w) => w.workspaceId === ws);
    expect(found).toContainEqual({ workspaceId: ws, workflowId: term, version: 1, initialStateId: 'done', boundTypes: 1 });
    expect(found).toContainEqual({ workspaceId: ws, workflowId: broke, version: 2, initialStateId: 'done', boundTypes: 0 });
    expect(found.map((w) => w.workflowId).sort()).toEqual([broke, term].sort());
  });
});

describe('29.151 report, exit code, read-only', () => {
  it('29.151 prints every finding, exits 1 only for shadows, and the CLI transaction cannot write', async () => {
    const clean: WtgPreflightReport = { database: 'x', workspaces: 3, shadows: [], decisionTypes: [], terminalInitialWorkflows: [] };
    expect(wtgPreflightExitCode(clean)).toBe(0);
    const cleanText = formatWtgPreflight(clean);
    expect(cleanText).toContain('wtg-preflight: database x (3 workspaces)');
    expect(cleanText).toContain('shadowing custom fields: none');
    expect(cleanText).toContain("existing 'decision' types: none");
    expect(cleanText).toContain('workflows with a terminal initial state: none');
    const warn = {
      ...clean,
      decisionTypes: [
        { workspaceId: 'W2', name: 'Decision', rank: 5, workflowId: 'wf', taskWorkflowId: 'wf', rankMatchesSeed: false, sameWorkflowAsTask: true },
        { workspaceId: 'W5', name: 'Decision', rank: 3, workflowId: 'wf2', taskWorkflowId: null, rankMatchesSeed: true, sameWorkflowAsTask: false },
      ],
      terminalInitialWorkflows: [{ workspaceId: 'W3', workflowId: 'wf-shipped', version: 2, initialStateId: 'shipped', boundTypes: 1 }],
    };
    expect(wtgPreflightExitCode(warn)).toBe(0); // both warning kinds present, still 0
    const warnText = formatWtgPreflight(warn);
    expect(warnText).toContain("existing 'decision' types: 2 (T7 adopts them)");
    expect(warnText).toContain('W2 "Decision" rank 5 (NOT 3: no edit after T5) workflow wf\n'); // a seed-rank-mismatch is flagged, a matching workflow is not annotated
    expect(warnText).toContain('W5 "Decision" rank 3 workflow wf2 (task uses none)'); // a matching rank is not flagged; a differing task workflow is
    expect(warnText).toContain('workflows with a terminal initial state: 1 (promotion skips them)');
    expect(warnText).toMatch(/W3 workflow wf-shipped v2 initial "shipped" \(1 bound types\)/); // a terminal-initial finding is printed too
    const blocked = {
      ...clean,
      shadows: [
        { source: 'field-claim' as const, workspaceId: 'W1', fieldId: 'estimate', claims: 2 },
        { source: 'ledger-definition' as const, workspaceId: 'W4', typeId: 'invoice', fieldId: 'waitForAll', eventId: 'EV1' },
      ],
    };
    expect(wtgPreflightExitCode(blocked)).toBe(1);
    expect(wtgPreflightExitCode({ ...clean, shadows: blocked.shadows.slice(0, 1) })).toBe(1); // one shadow is enough
    expect(formatWtgPreflight(blocked)).toContain('shadowing custom fields: 2 (BLOCKS wtg2 T4)');
    expect(formatWtgPreflight(blocked)).toMatch(/field-claim\s+W1 field estimate \(2 claims\)/);
    expect(formatWtgPreflight(blocked)).toMatch(/ledger-definition\s+W4 type invoice field waitForAll \(event EV1\)/); // the event id the owner needs
    await expect(inReadOnlyTransaction(db.pool, (tx) => tx.query(`INSERT INTO proj_workspaces (workspace_id) VALUES ('w-ro')`))).rejects.toThrow(/read-only transaction/);
    await db.pool.query(`INSERT INTO proj_workspaces (workspace_id) VALUES ($1)`, [newUlid()]); // control
    expect(db.pool.totalCount - db.pool.idleCount).toBe(0); // the read-only client went back to the pool
    // The CLI's own wiring (planner ruling 2026-10-04, Q2): a spawned CLI cannot observe read-only-ness, so the
    // source is read. Control: the same pattern does not match the direct call a broken main() would make.
    const wiring = /inReadOnlyTransaction\(pool, wtgPreflight\)/;
    const cli = readFileSync(fileURLToPath(new URL('../../src/tools/wtg-preflight.ts', import.meta.url)), 'utf8');
    expect(cli.slice(cli.indexOf('async function main'))).toMatch(wiring);
    expect('const report = await wtgPreflight(pool);').not.toMatch(wiring); // control
    // The exit code reaches the process: a CLI that printed a shadow and exited 0 would let the owner read "go".
    const exitWiring = /process\.exitCode = wtgPreflightExitCode\(report\)/;
    expect(cli.slice(cli.indexOf('async function main'))).toMatch(exitWiring);
    expect('process.exitCode = 0;').not.toMatch(exitWiring); // control
  });

  it('29.151 the spawned CLI prints the report, exits 1 for a shadow, 0 for a clean database and 2 without DATABASE_URL', async () => {
    // A process, not an import of main: the entry-point guard, the DATABASE_URL read and the exit code only exist when it runs as a CLI.
    const run = (env: NodeJS.ProcessEnv) =>
      spawnSync('pnpm', ['exec', 'tsx', 'src/tools/wtg-preflight.ts'], { cwd: join(dirname(fileURLToPath(import.meta.url)), '../..'), encoding: 'utf8', env, timeout: 90_000 });
    // Its own two databases, so this leg neither borrows another it()'s shadow nor leaves one behind.
    const shadowed = await createTestDatabase();
    const fresh = await createTestDatabase();
    try {
      await claimRaw(newUlid(), 'estimate', shadowed.pool); // exactly one finding: a claim
      const withShadow = run({ ...process.env, DATABASE_URL: shadowed.url });
      expect(withShadow.status).toBe(1);
      expect(withShadow.stdout).toMatch(/wtg-preflight: database gisik_test_\w+ \(\d+ workspaces\)/);
      expect(withShadow.stdout).toMatch(/shadowing custom fields: 1 \(BLOCKS wtg2 T4\)/);
      expect(withShadow.stdout).toMatch(/field-claim\s+\S+ field estimate \(1 claims\)/);
      const clean = run({ ...process.env, DATABASE_URL: fresh.url }); // control: the same CLI, a database with nothing to report
      expect(clean.status).toBe(0);
      expect(clean.stdout).toContain('shadowing custom fields: none');
    } finally {
      await shadowed.drop();
      await fresh.drop();
    }
    const env = { ...process.env };
    delete env['DATABASE_URL'];
    const missing = run(env);
    expect(missing.status).toBe(2);
    expect(missing.stderr).toContain('DATABASE_URL is required');
  }, 180_000);
});
