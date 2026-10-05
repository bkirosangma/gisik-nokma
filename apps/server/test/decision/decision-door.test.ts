import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { evaluateEvent } from '@gisik-nokma/rule-engine';
import { newUlid } from '@gisik-nokma/domain';
import { createIngestService } from '../../src/ingest/ingest-service.js';
import { buildProjectionRegistry } from '../../src/projections/index.js';
import { applyCommitted, makeCommitted, resetEntitySeqs } from '../helpers/apply.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';

/**
 * wtg2 T6 (spec DC-5) through the REAL door: the engine, the projections and the `proj_tickets` row the server's engine
 * context reads (`links`, `outcome`), with no permissive stub. The world is `auto-close/sweep.test.ts`'s: a workflow with
 * `todo -> doing -> done` declared, a `decision` type, and a Decision in Doing with one `leads_to` branch labelled "Yes".
 */

const PROJECT = '01J9GPRJ000000000000000000';
const HUMAN = '01J9GHMN000000000000000000'; // a real ULID: the door validates the actor (no U in Crockford base32)
const WF = 'wf-dec';

let db: TestDatabase;

beforeEach(async () => {
  resetEntitySeqs();
  db = await createTestDatabase();
});

afterEach(async () => {
  await db.drop();
});

function realIngest() {
  return createIngestService({ pool: db.pool, evaluate: evaluateEvent, projections: buildProjectionRegistry() });
}

/** The workflow, the two types, a Task `next` and a Decision in Doing whose one branch leads to `next`. */
async function seedDecision(ws: string): Promise<string> {
  const decision = newUlid();
  const next = newUlid();
  const at = (kind: 'workflow' | 'ticket-type' | 'ticket', id: string, type: string, payload: unknown) =>
    makeCommitted({ workspaceId: ws, actorId: HUMAN, entity: { kind, id }, type, payload });
  await applyCommitted(db.pool, [
    at('workflow', WF, 'workflow.defined', {
      id: WF, version: 1, name: 'Decision flow', initialStateId: 'todo',
      states: [
        { id: 'todo', name: 'To do', category: 'open' },
        { id: 'doing', name: 'Doing', category: 'active' },
        { id: 'done', name: 'Done', category: 'terminal' },
      ],
      transitions: [{ from: 'todo', to: 'doing', rules: [] }, { from: 'doing', to: 'done', rules: [] }],
    }),
    at('ticket-type', 'task', 'ticket-type.defined', { id: 'task', name: 'Task', icon: 'check', rank: 1, workflowId: WF, fields: [] }),
    at('ticket-type', 'decision', 'ticket-type.defined', { id: 'decision', name: 'Decision', icon: 'diamond', rank: 1, workflowId: WF, fields: [] }),
    at('ticket', next, 'ticket.created', { typeId: 'task', projectId: PROJECT, parentId: null, title: 'Ship it', start: 'focus' }),
    at('ticket', decision, 'ticket.created', { typeId: 'decision', projectId: PROJECT, parentId: null, title: 'Go ahead?', start: 'focus' }),
    at('ticket', decision, 'ticket.link_added', { kind: 'leads_to', targetId: next, label: 'Yes' }),
    at('ticket', decision, 'ticket.transitioned', { to: 'doing' }),
  ]);
  return decision;
}

describe('29.140 DC-5 at the real ingest door', () => {
  it('29.140 the real door refuses finishing an outcome-less Decision, then accepts it after ticket.decided', async () => {
    const ws = newUlid();
    const D = await seedDecision(ws);
    const submit = (type: string, payload: unknown) =>
      ({ id: newUlid(), workspaceId: ws, entity: { kind: 'ticket', id: D }, type, version: 1, payload, actorId: HUMAN, origin: 'server', clientTime: '2026-10-03T09:00:00.000Z' });
    const [refused] = await realIngest().ingestBatch([submit('ticket.transitioned', { to: 'done' })]);
    expect(refused).toMatchObject({ status: 'refused', rule: 'decision.outcome-required', reason: 'Choose an outcome before finishing this decision.' });
    const [unknown] = await realIngest().ingestBatch([submit('ticket.decided', { outcome: 'No' })]);
    expect(unknown).toMatchObject({ status: 'refused', rule: 'decision.unknown-outcome', reason: '"No" is not one of this decision\'s outcomes: "Yes".' });
    const [decided] = await realIngest().ingestBatch([submit('ticket.decided', { outcome: 'Yes' })]);
    expect(decided).toMatchObject({ status: 'committed' });
    const [ok] = await realIngest().ingestBatch([submit('ticket.transitioned', { to: 'done' })]);
    expect(ok).toMatchObject({ status: 'committed' }); // control: the same move, now with an outcome, from the same row
  });
});
