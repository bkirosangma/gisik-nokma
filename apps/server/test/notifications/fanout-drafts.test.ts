import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid, type LedgerEvent } from '@gisik-nokma/domain';
import { createNotificationFanout } from '../../src/notifications/fanout.js';
import { createInAppTransport } from '../../src/notifications/transport.js';
import { buildProjectionRegistry } from '../../src/projections/index.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { testEnvelope } from '../helpers/envelope.js';
import { appendTestEvent } from '../helpers/ledger.js';
import { seedMember, seedProject, seedTicket } from '../helpers/seed.js';

/**
 * 28.094 — notices at publish (drafts spec R31). A draft is private to its author, so everything that would
 * notify somebody about it is silent while it is a draft (`canSee` is closed for everyone), and PUBLISH is the
 * moment the people it names are told: once, by the event that made the ticket real.
 */
let db: TestDatabase;
beforeAll(async () => {
  db = await createTestDatabase();
});
afterAll(async () => {
  await db.drop();
});

const fanout = () =>
  createNotificationFanout({
    pool: db.pool,
    transports: [createInAppTransport(db.pool)],
    now: () => new Date('2026-10-04T05:00:00.000Z'),
    log: () => {},
  });

/** Ledger row plus EVERY projection, the way ingest applies a committed event. */
async function commit(env: LedgerEvent): Promise<LedgerEvent> {
  await appendTestEvent(db.pool, env);
  const client = await db.pool.connect();
  try {
    for (const projection of buildProjectionRegistry().all()) await projection.apply(env, client);
  } finally {
    client.release();
  }
  return env;
}

const onTicket = (ws: string, type: string, ticketId: string, payload: unknown, actorId: string): LedgerEvent =>
  testEnvelope({ workspaceId: ws, entity: { kind: 'ticket', id: ticketId }, type, payload, actorId });

const mentionOf = (userId: string) => ({
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'please look, ' },
        { type: 'mention', attrs: { userId, label: 'Pat' } },
      ],
    },
  ],
});

async function rowsFor(userId: string): Promise<Array<{ kind: string; dedupe_key: string }>> {
  const { rows } = await db.pool.query<{ kind: string; dedupe_key: string }>(
    'SELECT kind, dedupe_key FROM notifications WHERE user_id = $1 ORDER BY id',
    [userId],
  );
  return rows;
}

/**
 * A workflow and the `task` type bound to it, published through every projection. A publish re-pins the ticket to
 * its type's CURRENT binding, so the real ticket projection must find both; `proj_workflows` belongs to one
 * workspace per workflow id, so each world publishes its own.
 */
async function defineTypes(ws: string, actorId: string): Promise<string> {
  const workflowId = `wf-drafts-${ws.slice(-8).toLowerCase()}`;
  await commit(
    testEnvelope({
      workspaceId: ws, entity: { kind: 'workflow', id: workflowId }, type: 'workflow.defined', actorId,
      payload: {
        id: workflowId, version: 1, name: 'Drafts flow', initialStateId: 'todo',
        states: [
          { id: 'todo', name: 'To do', category: 'open' },
          { id: 'done', name: 'Done', category: 'terminal' },
        ],
        transitions: [{ from: 'todo', to: 'done', rules: [] }],
      },
    }),
  );
  await commit(
    testEnvelope({
      workspaceId: ws, entity: { kind: 'ticket-type', id: newUlid() }, type: 'ticket-type.defined', actorId,
      payload: { id: 'task', name: 'Task', icon: 'check', rank: 3, workflowId, fields: [] },
    }),
  );
  return workflowId;
}

async function world() {
  const ws = newUlid();
  const project = newUlid();
  const [author, assignee, pat] = [newUlid(), newUlid(), newUlid()];
  await seedProject(db.pool, ws, project);
  for (const user of [author, assignee, pat]) await seedMember(db.pool, ws, user, 'member');
  const workflowId = await defineTypes(ws, author);
  return { ws, project, author, assignee, pat, workflowId };
}

describe('28.094 notices at publish', () => {
  it('drafting is silent; the same events on a published twin notify (control); publish tells the assignee and the mentioned person once, and not the publisher', async () => {
    const w = await world();
    const draft = newUlid();
    const twin = newUlid();
    await seedTicket(db.pool, { workspaceId: w.ws, projectId: w.project, ticketId: draft, workflowId: w.workflowId, draftBy: w.author, birthAssigneeId: w.assignee });
    await seedTicket(db.pool, { workspaceId: w.ws, projectId: w.project, ticketId: twin, workflowId: w.workflowId, createdBy: w.author, birthAssigneeId: w.assignee });
    const fan = fanout();
    const describeBoth = (id: string) => [
      onTicket(w.ws, 'ticket.assigned', id, { assigneeId: w.assignee }, w.author),
      onTicket(w.ws, 'ticket.field_set', id, { fieldId: 'description', value: mentionOf(w.pat) }, w.author),
    ];

    // CONTROL first: on the published twin both events notify (the harness delivers, and the fan-out is live)
    for (const env of describeBoth(twin)) await fan.onCommitted(await commit(env));
    expect((await rowsFor(w.assignee)).map((r) => r.kind)).toEqual(['assignment']);
    expect((await rowsFor(w.pat)).map((r) => r.kind)).toEqual(['mention']);

    // the draft: the same two events, the same people, nobody told
    const [assignDraft, describeDraft] = describeBoth(draft) as [LedgerEvent, LedgerEvent];
    await fan.onCommitted(await commit(assignDraft));
    await fan.onCommitted(await commit(describeDraft));
    expect((await rowsFor(w.assignee)).length).toBe(1); // still only the twin's
    expect((await rowsFor(w.pat)).length).toBe(1);

    // publish
    const published = await commit(onTicket(w.ws, 'ticket.published', draft, { projectId: w.project }, w.author));
    await fan.onCommitted(published);
    const assignment = (await rowsFor(w.assignee)).filter((r) => r.dedupe_key === `assignment:${published.id}`);
    const mention = (await rowsFor(w.pat)).filter((r) => r.dedupe_key === `mention:${published.id}:${w.pat}`);
    expect(assignment).toHaveLength(1);
    expect(mention).toHaveLength(1);
    expect(await rowsFor(w.author)).toEqual([]); // the publisher is told nothing about their own act

    // redelivery adds nothing
    await fan.onCommitted(published);
    expect((await rowsFor(w.assignee)).length).toBe(2);
    expect((await rowsFor(w.pat)).length).toBe(2);
  });

  it('a publisher who assigned the draft to themselves, or mentioned themselves, is told nothing; a draft with no assignee and no mention notifies nobody', async () => {
    const w = await world();
    const own = newUlid();
    const bare = newUlid();
    await seedTicket(db.pool, { workspaceId: w.ws, projectId: w.project, ticketId: own, workflowId: w.workflowId, draftBy: w.author, birthAssigneeId: w.author });
    await seedTicket(db.pool, { workspaceId: w.ws, projectId: w.project, ticketId: bare, workflowId: w.workflowId, draftBy: w.author });
    await commit(onTicket(w.ws, 'ticket.field_set', own, { fieldId: 'description', value: mentionOf(w.author) }, w.author));
    const fan = fanout();
    await fan.onCommitted(await commit(onTicket(w.ws, 'ticket.published', own, { projectId: w.project }, w.author)));
    await fan.onCommitted(await commit(onTicket(w.ws, 'ticket.published', bare, { projectId: w.project }, w.author)));
    for (const user of [w.author, w.assignee, w.pat]) expect(await rowsFor(user), user).toEqual([]);
    // CONTROL in the same world: a draft assigned to someone else does tell them at publish, so the silence above
    // is the self and empty guards, not a fan-out that tells nobody
    const theirs = newUlid();
    await seedTicket(db.pool, { workspaceId: w.ws, projectId: w.project, ticketId: theirs, workflowId: w.workflowId, draftBy: w.author, birthAssigneeId: w.assignee });
    const published = await commit(onTicket(w.ws, 'ticket.published', theirs, { projectId: w.project }, w.author));
    await fan.onCommitted(published);
    expect(await rowsFor(w.assignee)).toEqual([{ kind: 'assignment', dedupe_key: `assignment:${published.id}` }]);
  });
});
