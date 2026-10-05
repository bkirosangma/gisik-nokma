import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { evaluateEvent } from '@gisik-nokma/rule-engine';
import {
  builtinTicketTypeDefs, DECISION_TYPE_ID, newUlid, SYSTEM_ACTOR_FLOW, ticketTypeDefSchema, type TicketTypeDef,
} from '@gisik-nokma/domain';
import {
  backfillDecisionType, decisionBackfillIntervalMs, findDecisionBackfillCandidates, firstThenEvery,
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
const lifecycle = (workspaceId: string, type: 'workspace.deleted' | 'purge.marked') => makeCommitted({
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
    await backfillDecisionType({ pool: db.pool, ingest: door() });
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
  });
});
