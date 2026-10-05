import { describe, expect, it } from 'vitest';
import { newSubmittedEvent, newUlid, type EventEnvelope, type LedgerEvent } from '@gisik-nokma/domain';
import { createBetterSqliteStorage } from '../src/storage/better-sqlite3.js';
import type { SyncStorage } from '../src/storage/storage.js';
import { createReplica, type BootstrapResponse, type Replica } from '../src/replica/replica.js';

/**
 * wtg2 T5 (29.358): the replica folds `ticket.decided` through the shared reducer, so a Decision's outcome and passes
 * reach the confirmed state the app reads. The world is `replica.test.ts`'s (its `envelope`, `workflowDefined`,
 * `typeDefined`, `created`, `bootstrapOf` and `seededReplica`), copied rather than imported because that file exports
 * nothing.
 */

const WS = newUlid();
const PROJECT = newUlid();
const TICKET = newUlid();
const OTHER_TICKET = newUlid();
const USER_A = newUlid();
const USER_B = newUlid();
const WF = newUlid();
const TYPE = newUlid();

const SERVER_TIME = '2026-08-20T00:00:00.000Z';
const CLIENT_TIME = '2026-08-19T23:59:00.000Z';

const stateOf = (id: string, name: string, category: string) => ({ id, name, category });

const wfV1 = {
  id: WF,
  version: 1,
  name: 'Basic',
  initialStateId: 'todo',
  states: [stateOf('todo', 'To do', 'open'), stateOf('doing', 'Doing', 'active'), stateOf('done', 'Done', 'terminal')],
  transitions: [
    { from: '*', to: 'doing', rules: [] },
    { from: '*', to: 'done', rules: [] },
    { from: '*', to: 'todo', rules: [] },
  ],
};

const ticketTypeDef = { id: TYPE, name: 'Decision', icon: 'diamond', rank: 3, workflowId: WF, fields: [] };

let seqCounter = 0;
let streamCounter = 0;

function envelope(
  entity: EventEnvelope['entity'],
  type: string,
  payload: unknown,
  opts: { seq?: number; actorId?: string; serverTime?: string; clientTime?: string } = {},
): LedgerEvent {
  seqCounter += 1;
  streamCounter += 1;
  return {
    ...newSubmittedEvent({
      workspaceId: WS,
      entity,
      type,
      payload,
      actorId: opts.actorId ?? USER_A,
      origin: 'server',
      now: () => new Date(opts.clientTime ?? CLIENT_TIME),
    }),
    serverTime: opts.serverTime ?? SERVER_TIME,
    seq: opts.seq ?? seqCounter,
    workspaceSeq: streamCounter,
  };
}

const workflowDefined = (def: unknown, seq: number): LedgerEvent =>
  envelope({ kind: 'workflow', id: WF }, 'workflow.defined', def, { seq });

const typeDefined = (seq = 1): LedgerEvent =>
  envelope({ kind: 'ticket-type', id: TYPE }, 'ticket-type.defined', ticketTypeDef, { seq });

const created = (ticketId: string, title: string, projectId = PROJECT, seq?: number): LedgerEvent =>
  envelope({ kind: 'ticket', id: ticketId }, 'ticket.created', { typeId: TYPE, projectId, parentId: null, title }, { seq });

function bootstrapOf(overrides: Partial<BootstrapResponse> = {}): BootstrapResponse {
  return {
    workspaceId: WS,
    me: { userId: USER_A, workspaceRole: 'member', projectIds: [PROJECT] },
    streamSeq: 0,
    definitions: [workflowDefined(wfV1, 1), typeDefined(1)],
    tickets: [],
    ...overrides,
  };
}

async function seededReplica(storage: SyncStorage = createBetterSqliteStorage()): Promise<Replica> {
  seqCounter = 0;
  const replica = await createReplica({ storage });
  await replica.loadBootstrap(bootstrapOf());
  seqCounter = 0;
  return replica;
}

describe('29.358 the replica folds ticket.decided', () => {
  it('29.358 the replica folds ticket.decided into the confirmed state', async () => {
    const replica = await seededReplica();
    await replica.applyServerItem(created(TICKET, 'Go ahead?'));
    await replica.applyServerItem(created(OTHER_TICKET, 'Never decided'));
    await replica.applyServerItem(envelope({ kind: 'ticket', id: TICKET }, 'ticket.decided', { outcome: 'Yes' }, { actorId: USER_B }));
    const confirmed = (await replica.getTicket(TICKET))?.confirmed;
    expect(confirmed?.outcome).toBe('Yes');
    expect(confirmed?.passes).toMatchObject([{ pass: 1, outcome: 'Yes', by: USER_B, revisions: [] }]);
    // control: a REAL undecided ticket (an absent one would make `?? {}` pass whatever the replica does)
    const other = (await replica.getTicket(OTHER_TICKET))?.confirmed;
    expect(other?.id).toBe(OTHER_TICKET);
    expect(['outcome', 'passes'].filter((k) => k in other!)).toEqual([]);
  });
});
