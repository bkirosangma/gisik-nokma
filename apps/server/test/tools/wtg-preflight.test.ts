import { readFileSync } from 'node:fs';
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
async function claimRaw(workspaceId: string, fieldId: string): Promise<void> {
  await appendTestEvent(db.pool, testEnvelope({ workspaceId, actorId: ACTOR, entity: { kind: 'ticket', id: newUlid() }, type: 'ticket.field_set', payload: { fieldId, value: '3 hours' } }));
}
async function workflowRaw(workspaceId: string, workflowId: string, version: number, initialStateId: string): Promise<void> {
  const states = [{ id: 'todo', name: 'To do', category: 'open' }, { id: 'done', name: 'Done', category: 'terminal' }];
  await db.pool.query(
    `INSERT INTO proj_workflows (workspace_id, workflow_id, version, name, definition, defined_by, defined_at, published_workspace_seq)
     VALUES ($1, $2, $3, 'wf', $4, $5, now(), $3)`,
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
    await defineRaw(superseded, def('bug', { fields: [num('waitForAll')] }));
    const fixed = def('bug');
    await defineRaw(superseded, fixed);
    await projectRaw(superseded, fixed);
    await defineRaw(clean, def('task', { fields: [num('estimates'), num('Estimate'), num('rework')] }));
    await projectRaw(clean, def('task', { fields: [num('estimates'), num('Estimate'), num('rework')] }));
    await claimRaw(clean, 'Estimate'); // the claim source gets its own near miss, so a case-folding claims query is caught too

    const { shadows } = await wtgPreflight(db.pool);
    expect(shadows).toContainEqual({ source: 'ledger-definition', workspaceId: dirty, typeId: 'invoice', fieldId: 'estimate', eventId });
    expect(shadows).toContainEqual({ source: 'type-projection', workspaceId: dirty, typeId: 'invoice', fieldId: 'estimate' });
    expect(shadows).toContainEqual({ source: 'field-claim', workspaceId: dirty, fieldId: 'estimate', claims: 1 });
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
    const { decisionTypes } = await wtgPreflight(db.pool);
    expect(decisionTypes).toContainEqual({ workspaceId: a, name: 'Decision', rank: 3, workflowId: 'wf-a', taskWorkflowId: 'wf-a', rankMatchesSeed: true, sameWorkflowAsTask: true });
    expect(decisionTypes).toContainEqual({ workspaceId: b, name: 'decision', rank: 5, workflowId: 'wf-b2', taskWorkflowId: 'wf-b1', rankMatchesSeed: false, sameWorkflowAsTask: false });
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
    expect(formatWtgPreflight(clean)).toContain('shadowing custom fields: none');
    const warn = {
      ...clean,
      decisionTypes: [{ workspaceId: 'W2', name: 'Decision', rank: 5, workflowId: 'wf', taskWorkflowId: 'wf', rankMatchesSeed: false, sameWorkflowAsTask: true }],
      terminalInitialWorkflows: [{ workspaceId: 'W3', workflowId: 'wf-shipped', version: 2, initialStateId: 'shipped', boundTypes: 1 }],
    };
    expect(wtgPreflightExitCode(warn)).toBe(0); // both warning kinds present, still 0
    expect(formatWtgPreflight(warn)).toContain('W2');
    expect(formatWtgPreflight(warn)).toMatch(/W3 workflow wf-shipped v2/); // a terminal-initial finding is printed too
    const blocked = {
      ...clean,
      shadows: [
        { source: 'field-claim' as const, workspaceId: 'W1', fieldId: 'estimate', claims: 2 },
        { source: 'ledger-definition' as const, workspaceId: 'W4', typeId: 'invoice', fieldId: 'waitForAll', eventId: 'EV1' },
      ],
    };
    expect(wtgPreflightExitCode(blocked)).toBe(1);
    expect(formatWtgPreflight(blocked)).toMatch(/field-claim\s+W1.*estimate/);
    expect(formatWtgPreflight(blocked)).toMatch(/ledger-definition\s+W4 type invoice field waitForAll \(event EV1\)/); // the event id the owner needs
    await expect(inReadOnlyTransaction(db.pool, (tx) => tx.query(`INSERT INTO proj_workspaces (workspace_id) VALUES ('w-ro')`))).rejects.toThrow(/read-only transaction/);
    await db.pool.query(`INSERT INTO proj_workspaces (workspace_id) VALUES ($1)`, [newUlid()]); // control
    // The CLI's own wiring (planner ruling 2026-10-04, Q2): a spawned CLI cannot observe read-only-ness, so the
    // source is read. Control: the same pattern does not match the direct call a broken main() would make.
    const wiring = /inReadOnlyTransaction\(pool, wtgPreflight\)/;
    const cli = readFileSync(fileURLToPath(new URL('../../src/tools/wtg-preflight.ts', import.meta.url)), 'utf8');
    expect(cli.slice(cli.indexOf('async function main'))).toMatch(wiring);
    expect('const report = await wtgPreflight(pool);').not.toMatch(wiring); // control
  });
});
