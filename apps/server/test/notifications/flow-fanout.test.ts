import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeEnvelope, newUlid, SYSTEM_ACTOR_FLOW, type EventEnvelope, type Notification } from '@gisik-nokma/domain';
import { notificationHeadline } from '@gisik-nokma/app-core';
import { runFlowSweep } from '../../src/flow/sweep.js';
import { createNotificationFanout, type CanSeeFn } from '../../src/notifications/fanout.js';
import { listNotifications } from '../../src/notifications/store.js';
import { createInAppTransport } from '../../src/notifications/transport.js';
import { registerDaemonListeners } from '../../src/ops/daemon-listeners.js';
import { addTicket, lead, realIngest, seedFlowWorld, step } from '../flow/flow-world.js';
import { resetEntitySeqs } from '../helpers/apply.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';

/**
 * wtg2 T18 (spec NT-1, NT-2, NT-4; owner ruling O2): the two flow notifications. `flow-ready` tells a target's assignee
 * that a `led-to` promotion put it in To do; `flow-reopened` tells a moved ticket's assignee that a Decision's choice
 * (`reopened-by-flow`) sent it back. The harness is `fanout.test.ts`'s (a `visible` set behind `canSeeTicket`, rows read
 * both raw and through the inbox's strict read), with VALID ULIDs: `flowCauseSchema` parses every id in a cause.
 *
 * Visibility is decided ONCE, at delivery (`fanout.ts`'s second ruling): a recipient who cannot see the source or the
 * Decision gets those members as NULL, and the inbox renders the row from what was stored. The privacy legs therefore
 * assert the stored payload AND the headline `notificationHeadline` makes of it, with the visible twin as the control.
 */

let db: TestDatabase;
beforeAll(async () => {
  db = await createTestDatabase();
});
afterAll(async () => {
  await db.drop();
});

const WS = '01J9GWS0000000000000000000';
const WS2 = '01J9GWS2000000000000000000';
const PROJECT = '01J9GPRJ000000000000000000';
const PERSON = '01J9GPRS000000000000000000';
const ASSIGNEE = '01J9GASN000000000000000000';
const OTHER = '01J9GTHR000000000000000000';
const SRC = '01J9GSRC000000000000000000';
const T1 = '01J9GTK1000000000000000000';
const T2 = '01J9GTK2000000000000000000';
const T3 = '01J9GTK3000000000000000000';
const DEC = '01J9GDEC000000000000000000';
/** A moved ticket and its source / Decision in the SECOND workspace (entity ids are global, so they are their own). */
const W2T = '01J9GW2T000000000000000000';
const W2S = '01J9GW2S000000000000000000';

const visible = new Set<string>();
const canSeeTicket: CanSeeFn = async (_db, userId, ticketId) => visible.has(`${userId}:${ticketId}`);
let logs: string[] = [];

function fanout() {
  return createNotificationFanout({
    pool: db.pool,
    transports: [createInAppTransport(db.pool)],
    canSeeTicket,
    now: () => new Date('2026-10-06T05:00:00.000Z'),
    log: (message) => logs.push(message),
  });
}

/**
 * `fanout.test.ts`'s INSERT plus the type (a Decision is `decision`) and the Drafts T2 columns: a non-null
 * `draftAuthorId` makes `rowToTicketState` build `TicketState.draft`, which is ABSENT on every other ticket.
 */
async function seedTicket(
  ticketId: string,
  assigneeId: string | null,
  title: string,
  typeId = 'task',
  draftAuthorId: string | null = null,
  workspaceId = WS,
): Promise<void> {
  await db.pool.query(
    `INSERT INTO proj_tickets (ticket_id, workspace_id, project_id, type_id, parent_id, workflow_id,
       workflow_version, state_id, state_category, assignee_id, collaborator_ids, fields, transitions,
       draft_author_id, draft_at)
     VALUES ($1, $2, $3, $6, NULL, 'wf-basic', 1, 'doing', 'active', $4, '[]'::jsonb, $5, '[]'::jsonb,
       $7::text, CASE WHEN $7::text IS NULL THEN NULL ELSE now() END)`,
    [
      ticketId,
      workspaceId,
      PROJECT,
      assigneeId,
      JSON.stringify({
        title: { value: title, actorId: PERSON, clientTime: '2026-10-01T10:00:00.000Z', serverTime: '2026-10-01T10:00:01.000Z' },
      }),
      typeId,
      draftAuthorId,
    ],
  );
}

/** What the `ticket.published` projection does to the row (Drafts 28.045). */
async function publishRow(ticketId: string): Promise<void> {
  await db.pool.query('UPDATE proj_tickets SET draft_author_id = NULL, draft_at = NULL WHERE ticket_id = $1', [ticketId]);
}

async function rowsFor(userId: string) {
  const result = await db.pool.query(
    'SELECT kind, workspace_id, dedupe_key, payload FROM notifications WHERE user_id = $1 ORDER BY id',
    [userId],
  );
  return result.rows as Array<{ kind: string; workspace_id: string; dedupe_key: string; payload: Record<string, unknown> }>;
}

/** The same rows through `listNotifications`, whose `parseNotification` holds each payload to its kind's strict schema. */
async function inboxFor(userId: string): Promise<Notification[]> {
  return (await listNotifications(db.pool, userId, { limit: 100 })).notifications;
}

async function totalNotificationRows(): Promise<number> {
  const total = await db.pool.query('SELECT count(*)::int AS n FROM notifications');
  return (total.rows[0] as { n: number }).n;
}

/** The inbox's own headline for a row (the flow kinds name no person, so the name function is never asked). */
const headline = (notification: Notification) => notificationHeadline(notification, () => 'Someone');

const cause = {
  led: (over: Record<string, unknown> = {}) => ({ kind: 'led-to', sourceTicketId: SRC, triggeredBy: PERSON, ...over }),
  reopened: (over: Record<string, unknown> = {}) => ({
    kind: 'reopened-by-flow', decisionTicketId: DEC, outcome: 'Redo', pass: 2, decidedBy: PERSON, decisionEventId: newUlid(), ...over,
  }),
  notTaken: () => ({ kind: 'branch-not-taken', decisionTicketId: DEC, outcome: 'Ship', pass: 1, decidedBy: PERSON, decisionEventId: newUlid() }),
};
const moved = (ticketId: string, to: string, c: unknown, actorId = SYSTEM_ACTOR_FLOW, workspaceId = WS): EventEnvelope =>
  makeEnvelope({ type: 'ticket.transitioned', entity: { kind: 'ticket', id: ticketId }, workspaceId, actorId, payload: { to, cause: c } });
const see = (...pairs: Array<[string, string]>) => pairs.forEach(([userId, ticketId]) => visible.add(`${userId}:${ticketId}`));

beforeEach(async () => {
  await db.pool.query('DELETE FROM notifications');
  await db.pool.query('DELETE FROM proj_tickets');
  visible.clear();
  logs = [];
});

describe('29.392 flow-ready reaches the target\'s assignee', () => {
  it('29.392 a led-to transition notifies the assignee once, keyed on the transition, under its workspace; a redelivery is one row; two promotions from one source are two rows', async () => {
    see([ASSIGNEE, T1], [ASSIGNEE, SRC]);
    await seedTicket(T1, ASSIGNEE, 'Write the copy');
    await seedTicket(SRC, null, 'Draft the brief');
    const env = moved(T1, 'todo', cause.led());
    await fanout().onCommitted(env);
    const payload = {
      ticketId: T1, ticketTitle: 'Write the copy', becauseTicketId: SRC, becauseTitle: 'Draft the brief', label: null,
      eventId: env.id, clientTime: env.clientTime, serverTime: env.serverTime,
    };
    expect(await rowsFor(ASSIGNEE)).toEqual([{ kind: 'flow-ready', workspace_id: WS, dedupe_key: `flow-ready:${env.id}`, payload }]);
    expect((await inboxFor(ASSIGNEE)).map((n) => [n.kind, n.payload])).toEqual([['flow-ready', payload]]);
    await fanout().onCommitted(env); // the redelivery
    expect(await rowsFor(ASSIGNEE)).toHaveLength(1);
    // A second promotion from the SAME source: its own row, keyed on its own move (the control on the dedupe key).
    see([ASSIGNEE, T2]);
    await seedTicket(T2, ASSIGNEE, 'Review the copy');
    const envT2 = moved(T2, 'todo', cause.led());
    await fanout().onCommitted(envT2);
    expect((await rowsFor(ASSIGNEE)).map((row) => row.dedupe_key).sort()).toEqual([`flow-ready:${env.id}`, `flow-ready:${envT2.id}`].sort());
    expect(logs).toEqual([]);
  });

  it('29.392 a labelled cause stores its label, and a move in a second workspace is filed there with that workspace\'s titles', async () => {
    see([ASSIGNEE, T1], [ASSIGNEE, SRC], [OTHER, W2T], [OTHER, W2S]);
    await seedTicket(T1, ASSIGNEE, 'Write the copy');
    await seedTicket(SRC, null, 'Draft the brief');
    const labelled = moved(T1, 'todo', cause.led({ label: 'Yes' }));
    await fanout().onCommitted(labelled);
    expect((await rowsFor(ASSIGNEE)).map((row) => row.payload['label'])).toEqual(['Yes']);
    await seedTicket(W2T, OTHER, 'Plan the launch', 'task', null, WS2);
    await seedTicket(W2S, null, 'Pick the date', 'task', null, WS2);
    const elsewhere = moved(W2T, 'todo', cause.led({ sourceTicketId: W2S }), SYSTEM_ACTOR_FLOW, WS2);
    await fanout().onCommitted(elsewhere);
    expect(await rowsFor(OTHER)).toEqual([{
      kind: 'flow-ready', workspace_id: WS2, dedupe_key: `flow-ready:${elsewhere.id}`,
      payload: {
        ticketId: W2T, ticketTitle: 'Plan the launch', becauseTicketId: W2S, becauseTitle: 'Pick the date', label: null,
        eventId: elsewhere.id, clientTime: elsewhere.clientTime, serverTime: elsewhere.serverTime,
      },
    }]);
  });

  it('29.392 the same promotion filed by the backup daemon\'s sweep notifies through the daemon\'s fan-out', async () => {
    resetEntitySeqs();
    const world = await createTestDatabase();
    try {
      await seedFlowWorld(world.pool);
      const target = await addTicket(world.pool, { assigneeId: ASSIGNEE });
      const source = await addTicket(world.pool, { start: 'focus', moves: ['doing'] });
      await lead(world.pool, source, target);
      await step(world.pool, source, 'ticket.transitioned', { to: 'done' }); // PERSON finishes it; nothing listens
      const ingest = realIngest(world.pool);
      const off = registerDaemonListeners(ingest, { pool: world.pool, transports: [createInAppTransport(world.pool)], canSeeTicket: async () => true });
      try {
        expect(await runFlowSweep({ pool: world.pool, ingest })).toMatchObject({ promoted: 1 });
        const inbox = async () => (await listNotifications(world.pool, ASSIGNEE, {})).notifications;
        await vi.waitFor(async () => expect((await inbox()).map((n) => n.kind)).toEqual(['flow-ready']), { timeout: 5000 });
        const { rows } = await world.pool.query<{ id: string }>(
          "SELECT id FROM events WHERE entity_kind = 'ticket' AND entity_id = $1 AND type = 'ticket.transitioned'", [target]);
        expect(rows).toHaveLength(1); // the promotion
        const [row] = await inbox();
        expect([row!.dedupeKey, row!.payload]).toEqual([
          `flow-ready:${rows[0]!.id}`,
          expect.objectContaining({ ticketId: target, becauseTicketId: source, label: null, eventId: rows[0]!.id }),
        ]);
      } finally {
        off();
      }
    } finally {
      await world.drop();
    }
  });
});

describe('29.393 who flow-ready addresses, and what a hidden source leaves out', () => {
  it('29.393 nobody for an unassigned target or one with no projection row; control: the assigned target notifies', async () => {
    see([ASSIGNEE, T1], [ASSIGNEE, SRC], [ASSIGNEE, T2]);
    await seedTicket(T1, null, 'Write the copy');
    await seedTicket(SRC, null, 'Draft the brief');
    await fanout().onCommitted(moved(T1, 'todo', cause.led()));
    await fanout().onCommitted(moved(T3, 'todo', cause.led())); // T3 has no row at all
    expect(await totalNotificationRows()).toBe(0);
    expect(logs).toEqual([]);
    await seedTicket(T2, ASSIGNEE, 'Review the copy');
    await fanout().onCommitted(moved(T2, 'todo', cause.led()));
    expect((await rowsFor(ASSIGNEE)).map((row) => row.payload['ticketId'])).toEqual([T2]);
  });

  it('29.393 nobody for the person whose finish triggered it; control: the same move triggered by someone else notifies', async () => {
    see([ASSIGNEE, T1], [ASSIGNEE, SRC]);
    await seedTicket(T1, ASSIGNEE, 'Write the copy');
    await seedTicket(SRC, null, 'Draft the brief');
    await fanout().onCommitted(moved(T1, 'todo', cause.led({ triggeredBy: ASSIGNEE })));
    expect(await rowsFor(ASSIGNEE)).toEqual([]);
    await fanout().onCommitted(moved(T1, 'todo', cause.led({ triggeredBy: PERSON })));
    expect(await rowsFor(ASSIGNEE)).toHaveLength(1);
  });

  it('29.393 nobody, and no log line, for an assignee who cannot see the target; control: once they can, it notifies', async () => {
    see([ASSIGNEE, SRC]);
    await seedTicket(T1, ASSIGNEE, 'Write the copy');
    await seedTicket(SRC, null, 'Draft the brief');
    await fanout().onCommitted(moved(T1, 'todo', cause.led()));
    expect(await rowsFor(ASSIGNEE)).toEqual([]);
    expect(logs).toEqual([]);
    see([ASSIGNEE, T1]);
    await fanout().onCommitted(moved(T1, 'todo', cause.led()));
    expect(await rowsFor(ASSIGNEE)).toHaveLength(1);
  });

  it('29.393 a recipient who sees the started ticket but not the Decision that led to it learns neither its title nor its branch, in the payload or the headline; control: one who sees both reads the whole sentence', async () => {
    see([ASSIGNEE, T1], [OTHER, T2], [OTHER, DEC]);
    await seedTicket(T1, ASSIGNEE, 'Write the copy');
    await seedTicket(T2, OTHER, 'Review the copy');
    await seedTicket(DEC, null, 'Ship or redo', 'decision');
    const hidden = moved(T1, 'todo', cause.led({ sourceTicketId: DEC, label: 'Yes' }));
    await fanout().onCommitted(hidden);
    const rows = await rowsFor(ASSIGNEE);
    expect(rows.map((row) => row.payload)).toEqual([{
      ticketId: T1, ticketTitle: 'Write the copy', becauseTicketId: null, becauseTitle: null, label: null,
      eventId: hidden.id, clientTime: hidden.clientTime, serverTime: hidden.serverTime,
    }]);
    for (const secret of ['Ship or redo', 'Yes', DEC]) expect(JSON.stringify(rows)).not.toContain(secret);
    const [mine] = await inboxFor(ASSIGNEE);
    expect(headline(mine!)).toBe("Ready to start: a step you can't see was closed");
    // CONTROL, same it(): the twin move for someone who can see the Decision
    await fanout().onCommitted(moved(T2, 'todo', cause.led({ sourceTicketId: DEC, label: 'Yes' })));
    const [theirs] = await inboxFor(OTHER);
    expect(theirs!.payload).toMatchObject({ becauseTicketId: DEC, becauseTitle: 'Ship or redo', label: 'Yes' });
    expect(headline(theirs!)).toBe('Ready to start: Ship or redo chose Yes');
  });
});

describe('29.394 flow-reopened reaches each moved ticket\'s assignee', () => {
  it('29.394 one row per moved ticket, keyed on its transition, with the Decision, outcome, pass and destination; a second moved ticket of one assignee is its own row', async () => {
    see([ASSIGNEE, T1], [ASSIGNEE, DEC], [OTHER, T2], [OTHER, DEC]);
    await seedTicket(T1, ASSIGNEE, 'Write the copy');
    await seedTicket(T2, OTHER, 'Review the copy');
    await seedTicket(DEC, null, 'Ship or redo', 'decision');
    const decisionEventId = newUlid();
    const a = moved(T1, 'todo', cause.reopened({ decisionEventId }));
    const b = moved(T2, 'backlog', cause.reopened({ decisionEventId }));
    await fanout().onCommitted(a);
    await fanout().onCommitted(b);
    const decision = { decisionTicketId: DEC, decisionTitle: 'Ship or redo', outcome: 'Redo', pass: 2 };
    expect(await rowsFor(ASSIGNEE)).toEqual([{
      kind: 'flow-reopened', workspace_id: WS, dedupe_key: `flow-reopened:${a.id}`,
      payload: { ticketId: T1, ticketTitle: 'Write the copy', ...decision, toBacklog: false, eventId: a.id, clientTime: a.clientTime, serverTime: a.serverTime },
    }]);
    expect(await rowsFor(OTHER)).toEqual([{
      kind: 'flow-reopened', workspace_id: WS, dedupe_key: `flow-reopened:${b.id}`,
      payload: { ticketId: T2, ticketTitle: 'Review the copy', ...decision, toBacklog: true, eventId: b.id, clientTime: b.clientTime, serverTime: b.serverTime },
    }]);
    expect((await inboxFor(OTHER)).map((n) => n.kind)).toEqual(['flow-reopened']);
    // The same Decision event moves a SECOND ticket of ASSIGNEE, on a later pass: its own key, its own pass.
    see([ASSIGNEE, T3]);
    await seedTicket(T3, ASSIGNEE, 'Check the copy');
    const c = moved(T3, 'todo', cause.reopened({ decisionEventId, pass: 3 }));
    await fanout().onCommitted(c);
    const mine = await rowsFor(ASSIGNEE);
    expect(mine.map((row) => row.dedupe_key).sort()).toEqual([`flow-reopened:${a.id}`, `flow-reopened:${c.id}`].sort());
    expect(mine.map((row) => [row.payload['ticketId'], row.payload['pass']])).toEqual([[T1, 2], [T3, 3]]);
    expect(logs).toEqual([]);
  });

  it('29.394 a move in a second workspace is filed there with that workspace\'s titles', async () => {
    see([OTHER, W2T], [OTHER, W2S]);
    await seedTicket(W2T, OTHER, 'Plan the launch', 'task', null, WS2);
    await seedTicket(W2S, null, 'Launch or wait', 'decision', null, WS2);
    const elsewhere = moved(W2T, 'todo', cause.reopened({ decisionTicketId: W2S }), SYSTEM_ACTOR_FLOW, WS2);
    await fanout().onCommitted(elsewhere);
    expect((await rowsFor(OTHER)).map((row) => [row.workspace_id, row.payload['ticketTitle'], row.payload['decisionTitle']]))
      .toEqual([[WS2, 'Plan the launch', 'Launch or wait']]);
  });
});

describe('29.395 who flow-reopened addresses, and what a hidden Decision leaves out', () => {
  it('29.395 a Decision\'s own reset tells nobody, its assignee included (NT-4); control: a ticket it moves tells its assignee', async () => {
    see([ASSIGNEE, DEC], [ASSIGNEE, T1]);
    await seedTicket(DEC, ASSIGNEE, 'Ship or redo', 'decision');
    await seedTicket(T1, ASSIGNEE, 'Write the copy');
    await fanout().onCommitted(moved(DEC, 'todo', cause.reopened()));
    expect(await totalNotificationRows()).toBe(0);
    await fanout().onCommitted(moved(T1, 'todo', cause.reopened()));
    expect((await rowsFor(ASSIGNEE)).map((row) => row.payload['ticketId'])).toEqual([T1]);
  });

  it('29.395 nobody for the person who made the choice; control: the same move chosen by someone else notifies', async () => {
    see([ASSIGNEE, T1], [ASSIGNEE, DEC]);
    await seedTicket(T1, ASSIGNEE, 'Write the copy');
    await seedTicket(DEC, null, 'Ship or redo', 'decision');
    await fanout().onCommitted(moved(T1, 'todo', cause.reopened({ decidedBy: ASSIGNEE })));
    expect(await rowsFor(ASSIGNEE)).toEqual([]);
    await fanout().onCommitted(moved(T1, 'todo', cause.reopened({ decidedBy: PERSON })));
    expect(await rowsFor(ASSIGNEE)).toHaveLength(1);
  });

  it('29.395 nobody for an unassigned ticket, one with no projection row, or an assignee who cannot see it (no log line); control: once they can, it notifies', async () => {
    see([ASSIGNEE, T1], [ASSIGNEE, DEC], [ASSIGNEE, T3]);
    await seedTicket(T1, null, 'Write the copy');
    await seedTicket(T2, ASSIGNEE, 'Review the copy');
    await seedTicket(DEC, null, 'Ship or redo', 'decision');
    await fanout().onCommitted(moved(T1, 'todo', cause.reopened()));
    await fanout().onCommitted(moved(T3, 'todo', cause.reopened())); // T3 has no row at all
    await fanout().onCommitted(moved(T2, 'todo', cause.reopened())); // ASSIGNEE cannot see T2
    expect(await totalNotificationRows()).toBe(0);
    expect(logs).toEqual([]);
    see([ASSIGNEE, T2]);
    await fanout().onCommitted(moved(T2, 'todo', cause.reopened()));
    expect((await rowsFor(ASSIGNEE)).map((row) => row.payload['ticketId'])).toEqual([T2]);
  });

  it('29.395 a recipient who sees the moved ticket but not the Decision learns neither its title nor its outcome, in the payload or the headline; control: one who sees both reads the whole sentence', async () => {
    see([ASSIGNEE, T1], [OTHER, T2], [OTHER, DEC]);
    await seedTicket(T1, ASSIGNEE, 'Write the copy');
    await seedTicket(T2, OTHER, 'Review the copy');
    await seedTicket(DEC, null, 'Ship or redo', 'decision');
    const hidden = moved(T1, 'todo', cause.reopened());
    await fanout().onCommitted(hidden);
    const rows = await rowsFor(ASSIGNEE);
    expect(rows.map((row) => row.payload)).toEqual([{
      ticketId: T1, ticketTitle: 'Write the copy', decisionTicketId: null, decisionTitle: null, outcome: null, pass: 2, toBacklog: false,
      eventId: hidden.id, clientTime: hidden.clientTime, serverTime: hidden.serverTime,
    }]);
    for (const secret of ['Ship or redo', 'Redo', DEC]) expect(JSON.stringify(rows)).not.toContain(secret);
    const [mine] = await inboxFor(ASSIGNEE);
    expect(headline(mine!)).toBe("Reopened by the flow: a decision you can't see (pass 2)");
    // CONTROL, same it(): the twin move for someone who can see the Decision
    await fanout().onCommitted(moved(T2, 'todo', cause.reopened()));
    const [theirs] = await inboxFor(OTHER);
    expect(theirs!.payload).toMatchObject({ decisionTicketId: DEC, decisionTitle: 'Ship or redo', outcome: 'Redo' });
    expect(headline(theirs!)).toBe('Reopened by the flow: Ship or redo chose Redo (pass 2)');
  });
});

describe('29.396 what makes no notification', () => {
  it('29.396 a not-taken transition or close, a decision, the paired reopen, a person\'s move and the old reopened-for-child cause notify nobody; control: the same ticket\'s led-to move does', async () => {
    see([ASSIGNEE, T1], [ASSIGNEE, SRC], [ASSIGNEE, DEC]);
    await seedTicket(T1, ASSIGNEE, 'Write the copy');
    await seedTicket(SRC, null, 'Draft the brief');
    await seedTicket(DEC, ASSIGNEE, 'Ship or redo', 'decision');
    const on = (ticketId: string, type: string, payload: Record<string, unknown>, actorId = SYSTEM_ACTOR_FLOW) =>
      fanout().onCommitted(makeEnvelope({ type, entity: { kind: 'ticket', id: ticketId }, workspaceId: WS, actorId, payload }));
    await fanout().onCommitted(moved(T1, 'done', cause.notTaken()));
    await on(T1, 'ticket.closed', { cause: cause.notTaken() });
    await on(DEC, 'ticket.decided', { outcome: 'Redo' }, PERSON);
    await on(T1, 'ticket.reopened', { cause: cause.reopened() });
    await on(T1, 'ticket.reopened', { cause: cause.led() });
    await on(T1, 'ticket.closed', { cause: cause.reopened() });
    await on(T1, 'ticket.transitioned', { to: 'doing' }, PERSON);
    await on(T1, 'ticket.transitioned', { to: 'todo', cause: { kind: 'reopened-for-child', childTicketId: T2 } }, PERSON);
    expect(await totalNotificationRows()).toBe(0);
    expect(logs).toEqual([]);
    await fanout().onCommitted(moved(T1, 'todo', cause.led()));
    expect((await rowsFor(ASSIGNEE)).map((row) => row.kind)).toEqual(['flow-ready']);
  });

  it('29.396 a draft flow notifies nobody, its author included; once published the same moves notify', async () => {
    see([ASSIGNEE, T1], [ASSIGNEE, SRC], [ASSIGNEE, DEC]);
    await seedTicket(T1, ASSIGNEE, 'Write the copy', 'task', ASSIGNEE); // the assignee's OWN draft
    await seedTicket(SRC, null, 'Draft the brief', 'task', ASSIGNEE);
    await seedTicket(DEC, null, 'Ship or redo', 'decision', ASSIGNEE);
    const both = async (ticketId: string) => {
      await fanout().onCommitted(moved(ticketId, 'todo', cause.led()));
      await fanout().onCommitted(moved(ticketId, 'backlog', cause.reopened()));
    };
    await both(T1);
    expect(await totalNotificationRows()).toBe(0);
    // The moved ticket is published, its source and Decision are still drafts.
    await publishRow(T1);
    await both(T1);
    expect(await totalNotificationRows()).toBe(0);
    // Source and Decision published, the moved ticket a draft: only the moved-ticket guard stops these.
    await publishRow(SRC);
    await publishRow(DEC);
    see([ASSIGNEE, T2]);
    await seedTicket(T2, ASSIGNEE, 'Review the copy', 'task', ASSIGNEE);
    await both(T2);
    expect(await totalNotificationRows()).toBe(0);
    expect(logs).toEqual([]);
    // CONTROL: every member published, the same two moves notify
    await both(T1);
    expect((await rowsFor(ASSIGNEE)).map((row) => row.kind).sort()).toEqual(['flow-ready', 'flow-reopened']);
  });
});
