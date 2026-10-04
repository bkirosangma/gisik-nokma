import { afterAll, beforeAll, expect, it } from 'vitest';
import { newUlid } from '@gisik-nokma/domain';
import { runAutoCloseSweep } from '../../src/auto-close/sweep.js';
import { runNotificationSweep } from '../../src/notifications/sweep.js';
import { stateProvenanceFor } from '../../src/read/state-provenance.js';
import { buildLedgerDeps } from '../../src/sync/ledger-deps.js';
import { foldTicketHead } from '../../src/sync/snapshot-writer.js';
import { applyCommitted, makeCommitted } from '../helpers/apply.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';

/**
 * Drafts T3, C7 (spec §7.2): a draft-born ticket is "in its state since" its PUBLISH, not its drafting, in the
 * state-provenance read, in the snapshot fold's state claim, and in the entered-state reads of the stale
 * notification sweep and the auto-close sweep alike (28.065). The head (one workflow, one type) is
 * `tickets-closed.test.ts`'s.
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

/** 7 IST days after 2026-08-05: T0 is on the far side of a 7-day cut-off, T1 is not. */
const NOW = '2026-08-12T12:00:00.000Z';
it('28.065 the stale and auto-close sweeps read the same instant: a draft-born ticket published on day 10 is neither stale nor auto-closed; control: a never-drafted twin that entered on day 1 is both', async () => {
  // PLANTED, as the draft world plants its `doing` drafts: no door moves a draft out of Backlog (T5 refuses
  // `ticket.transitioned` on a draft), and Backlog is `open`, which neither sweep reads. So each draft is moved
  // into `doing` / `done` on day 1, BEFORE its publish, and the publish on day 10 is its last state-entering
  // event. Under a ledger the doors can write, these two reads cannot tell the publish apart until a draft can
  // leave Backlog; this pins them anyway.
  const author = newUlid();
  const [draftDoing, twinDoing, draftDone, twinDone] = [newUlid(), newUlid(), newUlid(), newUlid()];
  const at = (clientTime: string) => ({ clientTime, serverTime: clientTime });
  const ticket = { workspaceId: WS, actorId: author };
  const created = (id: string, draft: boolean) => makeCommitted({ ...ticket, entity: { kind: 'ticket', id }, type: 'ticket.created',
    payload: { typeId: TYPE_ID, projectId: PRJ, parentId: null, title: id.slice(-4), assigneeId: author, ...(draft ? { start: 'backlog', draft: true } : {}) }, ...at(T0) });
  const moved = (id: string, to: string) => makeCommitted({ ...ticket, entity: { kind: 'ticket', id }, type: 'ticket.transitioned',
    payload: { to }, ...at('2026-08-02T09:05:00.000Z') });
  const published = (id: string) => makeCommitted({ ...ticket, entity: { kind: 'ticket', id }, type: 'ticket.published',
    payload: { projectId: PRJ }, ...at(T1) });
  await applyCommitted(db.pool, [
    makeCommitted({ workspaceId: WS, actorId: author, entity: { kind: 'workspace', id: WS }, type: 'workspace.settings_set', payload: { autoCloseAfterDays: 7 } }),
    created(draftDoing, true), moved(draftDoing, 'doing'), published(draftDoing),
    created(twinDoing, false), moved(twinDoing, 'doing'),
    created(draftDone, true), moved(draftDone, 'done'), published(draftDone),
    created(twinDone, false), moved(twinDone, 'done'),
  ]);
  const mine = [draftDoing, twinDoing, draftDone, twinDone];
  // Each published draft sits, published, in the category its sweep reads, so a "not a candidate" below can only
  // come from the instant, never from the category or a leftover draft flag.
  const { rows } = await db.pool.query<{ ticket_id: string; state_category: string; draft_author_id: string | null }>(
    'SELECT ticket_id, state_category, draft_author_id FROM proj_tickets WHERE ticket_id = ANY($1::text[])', [mine],
  );
  expect(Object.fromEntries(rows.map((row) => [row.ticket_id, [row.state_category, row.draft_author_id]]))).toEqual({
    [draftDoing]: ['active', null], [twinDoing]: ['active', null], [draftDone]: ['terminal', null], [twinDone]: ['terminal', null],
  });

  const stale: string[] = [];
  await runNotificationSweep({
    pool: db.pool, canSeeTicket: async () => true, now: () => new Date(NOW), log: () => undefined,
    transports: [{
      name: 'record',
      deliver: async (_userId, notification) => {
        const { ticketId } = notification.payload as { ticketId: string };
        if (notification.kind === 'stale-ticket' && mine.includes(ticketId)) stale.push(ticketId);
      },
    }],
  });
  expect(stale).toEqual([twinDoing]);

  const closing: string[] = [];
  const ingest = {
    ingestBatch: async (events: Array<{ entity: { id: string } }>) => {
      for (const event of events) if (mine.includes(event.entity.id)) closing.push(event.entity.id);
      return events.map(() => ({ status: 'committed' }));
    },
  };
  await runAutoCloseSweep({ pool: db.pool, ingest: ingest as never, now: () => new Date(NOW), log: () => undefined });
  expect(closing).toEqual([twinDone]);
});
