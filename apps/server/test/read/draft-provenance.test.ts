import { afterAll, beforeAll, expect, it } from 'vitest';
import { newUlid } from '@gisik-nokma/domain';
import { stateProvenanceFor } from '../../src/read/state-provenance.js';
import { buildLedgerDeps } from '../../src/sync/ledger-deps.js';
import { foldTicketHead } from '../../src/sync/snapshot-writer.js';
import { applyCommitted, makeCommitted } from '../helpers/apply.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';

/**
 * Drafts T3, C7 (spec §7.2): a draft-born ticket is "in Backlog since" its PUBLISH, not its drafting, in the
 * state-provenance read and in the snapshot fold's state claim alike (28.065). The head (one workflow, one
 * type) is `tickets-closed.test.ts`'s.
 */

let db: TestDatabase;

const WS = newUlid();
const PRJ = newUlid();
const WF = newUlid();
const TYPE_ID = 'draft-prov-task';

beforeAll(async () => {
  db = await createTestDatabase();

  // One workflow, one type, shared by both cases below — neither mutates the
  // other's ticket, so declaration order does not matter.
  await applyCommitted(db.pool, [
    makeCommitted({
      workspaceId: WS,
      actorId: newUlid(),
      entity: { kind: 'workflow', id: WF },
      type: 'workflow.defined',
      payload: {
        id: WF,
        version: 1,
        name: 'Draft-provenance flow',
        initialStateId: 'todo',
        states: [
          { id: 'todo', name: 'To do', category: 'open' },
          { id: 'doing', name: 'Doing', category: 'active' },
          { id: 'done', name: 'Done', category: 'terminal' },
        ],
        transitions: [
          { from: '*', to: 'todo', rules: [] },
          { from: '*', to: 'doing', rules: [] },
          { from: '*', to: 'done', rules: [] },
        ],
      },
    }),
    makeCommitted({
      workspaceId: WS,
      actorId: newUlid(),
      entity: { kind: 'ticket-type', id: TYPE_ID },
      type: 'ticket-type.defined',
      payload: { id: TYPE_ID, name: 'Draft-provenance task', icon: 'check', rank: 3, workflowId: WF, fields: [] },
    }),
  ]);
}, 60_000);

afterAll(async () => {
  await db.drop();
});

const T0 = '2026-08-02T09:00:00.000Z';
const T1 = '2026-08-10T09:00:00.000Z';
it('28.065 a draft-born ticket is in Backlog since its publish; control: a plain ticket keeps its creation instant', async () => {
  const [drafted, plain, author] = [newUlid(), newUlid(), newUlid()];
  const at = (clientTime: string) => ({ clientTime, serverTime: clientTime });
  await applyCommitted(db.pool, [
    makeCommitted({ workspaceId: WS, actorId: author, entity: { kind: 'ticket', id: drafted }, type: 'ticket.created',
      payload: { typeId: TYPE_ID, projectId: PRJ, parentId: null, title: 'd', start: 'backlog', draft: true }, ...at(T0) }),
    makeCommitted({ workspaceId: WS, actorId: author, entity: { kind: 'ticket', id: plain }, type: 'ticket.created',
      payload: { typeId: TYPE_ID, projectId: PRJ, parentId: null, title: 'p' }, ...at(T0) }),
    makeCommitted({ workspaceId: WS, actorId: author, entity: { kind: 'ticket', id: drafted }, type: 'ticket.published',
      payload: { projectId: PRJ }, ...at(T1) }),
  ]);
  const provenance = await stateProvenanceFor(db.pool, [drafted, plain]);
  expect(provenance.get(drafted)).toMatchObject({ actorId: author, serverTime: T1 });
  expect(provenance.get(plain)).toMatchObject({ actorId: author, serverTime: T0 });
  const client = await db.pool.connect();
  try {
    const head = await foldTicketHead(client, drafted, await buildLedgerDeps(client, WS));
    expect(head?.provenance?.state.serverTime).toBe(T1);
  } finally {
    client.release();
  }
});
