import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BACKLOG_STATE_ID, newUlid } from '@gisik-nokma/domain';
import { PERMISSION_VISIBILITY_RULE, TICKET_NOT_VISIBLE_REASON } from '../../src/permissions/check-permission.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { buildReadTestApp, type ReadRole, type ReadWorld } from '../helpers/read-app.js';
import { SCENARIO_NOW } from '../helpers/read-scenario.js';

/**
 * Drafts T5, the publish door over `POST /v1/events` (28.092's door half, 28.093). The owner's ruling (2026-10-04)
 * is the bar: publish ENDS a draft, so it is probed as every person who is not the author, and each must get the
 * answer an id that does not exist gets, with nothing changed behind it (the row, the ledger, the inbox, and the
 * author's own read).
 */
let db: TestDatabase;
let read: ReadWorld;
beforeAll(async () => {
  db = await createTestDatabase();
  read = await buildReadTestApp(db);
}, 120_000);
afterAll(async () => {
  await read.app.close();
  await db.drop();
});

const WS = (): string => read.world.workspaceId;
const PROJECT = (): string => read.world.projectId;

/** The raw answer of the real door to one event. */
async function post(role: ReadRole, type: string, id: string, payload: unknown, kind = 'ticket') {
  return read.app.inject({
    method: 'POST',
    url: '/v1/events',
    headers: read.authOf(role),
    payload: {
      events: [{
        id: newUlid(), workspaceId: WS(), entity: { kind, id }, type, version: 1, payload,
        actorId: read.userIds[role], origin: 'web', clientTime: SCENARIO_NOW.toISOString(),
      }],
    },
  });
}
/** One event over the real door; the answer is the single result row. */
async function send(role: ReadRole, type: string, id: string, payload: unknown, kind = 'ticket'): Promise<Record<string, unknown>> {
  const res = await post(role, type, id, payload, kind);
  expect(res.statusCode, res.body).toBe(200);
  return (res.json() as { results: Array<Record<string, unknown>> }).results[0] ?? {};
}
const draft = (role: ReadRole, id: string, extra: Record<string, unknown> = {}) =>
  send(role, 'ticket.created', id, {
    typeId: 'task', projectId: PROJECT(), parentId: null, title: 'Quokka draft', start: 'backlog', draft: true, ...extra,
  });
const publish = (role: ReadRole, id: string, projectId: string = PROJECT()) =>
  send(role, 'ticket.published', id, { projectId });
const detail = (role: ReadRole, id: string) =>
  read.app.inject({ method: 'GET', url: `/v1/workspaces/${WS()}/tickets/${id}`, headers: read.authOf(role) });
type Detail = { key: string | null; ticketState: { draft?: unknown } };
const answer = (result: Record<string, unknown>) => ({ status: result['status'], rule: result['rule'], reason: result['reason'] });

/**
 * Nothing about the draft moved: its row still names its author and is not discarded, its stream holds no
 * publish or discard, nobody's inbox names it, and its author still opens it.
 */
async function expectUntouched(id: string, author: ReadRole): Promise<void> {
  const { rows: head } = await db.pool.query<{ draft_author_id: string | null; draft_discarded: boolean | null }>(
    'SELECT draft_author_id, draft_discarded FROM proj_tickets WHERE ticket_id = $1',
    [id],
  );
  expect(head).toEqual([{ draft_author_id: read.userIds[author], draft_discarded: null }]);
  const { rows: ends } = await db.pool.query(
    `SELECT 1 FROM events WHERE entity_id = $1 AND type IN ('ticket.published', 'ticket.discarded')`,
    [id],
  );
  expect(ends).toEqual([]);
  const { rows: notices } = await db.pool.query(`SELECT 1 FROM notifications WHERE payload->>'ticketId' = $1`, [id]);
  expect(notices).toEqual([]);
  expect((await detail(author, id)).statusCode).toBe(200);
}

/** Everyone who is not the author of a `member`'s draft, on and off its project (the read world's role axis). */
const OTHERS = ['owner', 'admin', 'projectLead', 'guest', 'outsider'] as const;

describe('28.092 publish through the door', () => {
  it('the author publishes; the owner, an admin, a project lead, a guest and an outsider are each answered as for an unknown ticket and change nothing; a wrong project and a second publish are refused', async () => {
    const id = newUlid();
    expect(await draft('member', id)).toMatchObject({ status: 'committed' });
    const unknown = { status: 'refused', rule: PERMISSION_VISIBILITY_RULE, reason: TICKET_NOT_VISIBLE_REASON };
    for (const role of OTHERS) {
      const theirs = await publish(role, id);
      expect(theirs, role).toMatchObject(unknown);
      // no oracle: the same words as an id that was never a ticket
      expect(answer(theirs), role).toEqual(answer(await publish(role, newUlid())));
    }
    // a person with no membership here, and the owner of another workspace: never a commit
    for (const role of ['stranger', 'neighbour'] as const) {
      const res = await post(role, 'ticket.published', id, { projectId: PROJECT() });
      expect(res.body, role).not.toContain('"committed"');
    }
    await expectUntouched(id, 'member');
    expect((await detail('owner', id)).statusCode).toBe(404); // still a draft: the refusals changed nothing
    expect(await publish('member', id, read.sibling.projectId)).toMatchObject({
      status: 'refused', rule: 'draft.project-mismatch', reason: "The project does not match this draft's project.",
    });

    expect(await publish('member', id)).toMatchObject({ status: 'committed' });
    const seen = await detail('owner', id);
    expect(seen.statusCode).toBe(200);
    const body = seen.json() as Detail;
    expect(body.key).not.toBeNull();
    expect(body.ticketState.draft).toBeUndefined();

    expect(await publish('member', id)).toMatchObject({
      status: 'refused', rule: 'draft.not-a-draft', reason: 'This ticket is not a draft.',
    });
  });

  it('another member ON the project cannot publish a project lead\'s draft (the unknown-ticket answer, nothing changed); its author can', async () => {
    const id = newUlid();
    expect(await draft('projectLead', id)).toMatchObject({ status: 'committed' });
    const theirs = await publish('member', id);
    expect(theirs).toMatchObject({ status: 'refused', rule: PERMISSION_VISIBILITY_RULE, reason: TICKET_NOT_VISIBLE_REASON });
    expect(answer(theirs)).toEqual(answer(await publish('member', newUlid())));
    await expectUntouched(id, 'projectLead');
    expect(await publish('projectLead', id)).toMatchObject({ status: 'committed' }); // CONTROL: the author
  });

  it('a child waits for its parent: a published ticket naming the draft parent is an unknown parent, the child draft cannot publish first, and both commit in order', async () => {
    const parent = newUlid();
    const child = newUlid();
    expect(await draft('member', parent, { typeId: 'epic' })).toMatchObject({ status: 'committed' });
    expect(await draft('member', child, { parentId: parent })).toMatchObject({ status: 'committed' }); // a draft under its author's own draft
    // R4 (owner ruling O1): an ordinary ticket naming the draft parent on its own stream is an unknown parent, in
    // the words a parent id that does not exist gets. The permission gate reads no ticket parent
    // (`check-permission.ts`), so the engine's `hierarchy.unknown-parent` is the door's answer.
    const underDraft = await send('member', 'ticket.created', newUlid(), {
      typeId: 'task', projectId: PROJECT(), parentId: parent, title: 'Real child',
    });
    const underGhost = await send('member', 'ticket.created', newUlid(), {
      typeId: 'task', projectId: PROJECT(), parentId: newUlid(), title: 'Real child',
    });
    expect(underDraft).toMatchObject({ status: 'refused', rule: 'hierarchy.unknown-parent' });
    expect(answer(underDraft)).toEqual(answer(underGhost)); // no draft-specific answer
    // R11: the child's publish
    expect(await publish('member', child)).toMatchObject({
      status: 'refused', rule: 'draft.parent-unpublished', reason: 'The parent is still a draft. Publish the parent first.',
    });

    expect(await publish('member', parent)).toMatchObject({ status: 'committed' });
    expect(await publish('member', child)).toMatchObject({ status: 'committed' }); // CONTROL: the same child, once the parent is real
    const { rows } = await db.pool.query<{ parent_id: string | null; draft_author_id: string | null }>(
      'SELECT parent_id, draft_author_id FROM proj_tickets WHERE ticket_id = $1',
      [child],
    );
    expect(rows).toEqual([{ parent_id: parent, draft_author_id: null }]);
    expect(((await detail('owner', child)).json() as Detail).key).not.toBeNull();
  });
});

describe('28.093 publish pins the type\'s CURRENT workflow', () => {
  it('lands a draft on the workflow its type points at now, in the Backlog; an earlier ticket of the type stays where it was', async () => {
    const typeId = 'quokka-task';
    // The entity id is a fresh ULID and the payload's `id` is the type key (the door refuses a non-ULID entity
    // id; `proj_ticket_types` folds by the payload key, last definition wins).
    const define = (workflowId: string) =>
      send('owner', 'ticket-type.defined', newUlid(), { id: typeId, name: 'Quokka task', icon: 'check', rank: 3, workflowId, fields: [] }, 'ticket-type');
    expect(await define(read.world.workflowId)).toMatchObject({ status: 'committed' });
    const plain = newUlid();
    const drafted = newUlid();
    expect(
      await send('member', 'ticket.created', plain, { typeId, projectId: PROJECT(), parentId: null, title: 'Plain' }),
    ).toMatchObject({ status: 'committed' });
    expect(await draft('member', drafted, { typeId })).toMatchObject({ status: 'committed' });

    expect(await define(read.sibling.secondWorkflowId)).toMatchObject({ status: 'committed' }); // the type is re-pointed
    expect(await publish('member', drafted)).toMatchObject({ status: 'committed' });

    const { rows } = await db.pool.query<{ ticket_id: string; workflow_id: string; state_id: string }>(
      'SELECT ticket_id, workflow_id, state_id FROM proj_tickets WHERE ticket_id = ANY($1)',
      [[plain, drafted]],
    );
    const byId = new Map(rows.map((r) => [r.ticket_id, r]));
    expect(byId.get(drafted)).toMatchObject({ workflow_id: read.sibling.secondWorkflowId, state_id: BACKLOG_STATE_ID });
    expect(byId.get(plain)?.workflow_id).toBe(read.world.workflowId); // CONTROL: pinned at its own creation
  });
});
