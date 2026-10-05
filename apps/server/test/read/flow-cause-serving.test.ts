import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid, SYSTEM_ACTOR_FLOW } from '@gisik-nokma/domain';
import { servedCause, stateProvenanceFor } from '../../src/read/state-provenance.js';
import { applyCommitted, makeCommitted } from '../helpers/apply.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';

/**
 * wtg2 T8 (spec FL-1, case 29.207): a flow cause on the transition that claims a ticket's state names a Decision or a
 * source ticket, and a person, that the viewer may not see; state provenance serves it as `{ kind }` only. The head (one
 * workflow, one type) is `draft-provenance.test.ts`'s.
 */

let db: TestDatabase;

const WS = newUlid();
const PRJ = newUlid();
const WF = newUlid();
const TYPE_ID = 'flow-cause-task';
const D = newUlid();
const PERSON = newUlid();

beforeAll(async () => {
  db = await createTestDatabase();
  await applyCommitted(db.pool, [
    makeCommitted({
      workspaceId: WS,
      actorId: newUlid(),
      entity: { kind: 'workflow', id: WF },
      type: 'workflow.defined',
      payload: {
        id: WF,
        version: 1,
        name: 'Flow-cause flow',
        initialStateId: 'todo',
        states: [
          { id: 'todo', name: 'To do', category: 'open' },
          { id: 'doing', name: 'Doing', category: 'active' },
          { id: 'done', name: 'Done', category: 'terminal' },
        ],
        transitions: [
          { from: 'todo', to: 'doing', rules: [] },
          { from: 'doing', to: 'done', rules: [] },
        ],
      },
    }),
    makeCommitted({
      workspaceId: WS,
      actorId: newUlid(),
      entity: { kind: 'ticket-type', id: TYPE_ID },
      type: 'ticket-type.defined',
      payload: { id: TYPE_ID, name: 'Flow-cause task', icon: 'check', rank: 3, workflowId: WF, fields: [] },
    }),
  ]);
}, 60_000);

afterAll(async () => {
  await db.drop();
});

describe('29.207 a flow cause is served as its kind only', () => {
  it('29.207 state provenance serves a branch-not-taken cause as { kind } with no Decision or person id; control: reopened-for-child is served whole', async () => {
    const [passed, reopened, child, author] = [newUlid(), newUlid(), newUlid(), newUlid()];
    const notTaken = { kind: 'branch-not-taken', decisionTicketId: D, outcome: 'No', pass: 1, decidedBy: PERSON, decisionEventId: newUlid() };
    const created = (id: string) =>
      makeCommitted({ workspaceId: WS, actorId: author, entity: { kind: 'ticket', id }, type: 'ticket.created',
        payload: { typeId: TYPE_ID, projectId: PRJ, parentId: null, title: 't' } });
    await applyCommitted(db.pool, [
      created(passed),
      created(reopened),
      makeCommitted({ workspaceId: WS, actorId: SYSTEM_ACTOR_FLOW, entity: { kind: 'ticket', id: passed }, type: 'ticket.transitioned',
        payload: { to: 'done', cause: notTaken } }),
      makeCommitted({ workspaceId: WS, actorId: author, entity: { kind: 'ticket', id: reopened }, type: 'ticket.transitioned',
        payload: { to: 'doing', cause: { kind: 'reopened-for-child', childTicketId: child } } }),
    ]);
    const provenance = await stateProvenanceFor(db.pool, [passed, reopened]);
    expect(provenance.get(passed)).toMatchObject({ actorId: SYSTEM_ACTOR_FLOW, cause: { kind: 'branch-not-taken' } });
    expect(provenance.get(passed)?.cause).toEqual({ kind: 'branch-not-taken' });
    const served = JSON.stringify(provenance.get(passed));
    expect(served).not.toContain(D);
    expect(served).not.toContain(PERSON);
    // Control: the old cause is served whole, child and all.
    expect(provenance.get(reopened)?.cause).toEqual({ kind: 'reopened-for-child', childTicketId: child });
    // The helper on its own, for each flow kind (the detail route's close cause will need the same answer).
    expect(servedCause({ kind: 'led-to', sourceTicketId: D, triggeredBy: PERSON })).toEqual({ kind: 'led-to' });
    expect(servedCause({ ...notTaken, kind: 'reopened-by-flow' })).toEqual({ kind: 'reopened-by-flow' });
  });
});
