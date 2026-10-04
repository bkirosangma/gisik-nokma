import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid, type Ulid } from '@gisik-nokma/domain';
import { PERMISSION_VISIBILITY_RULE, TICKET_NOT_VISIBLE_REASON } from '../../src/permissions/check-permission.js';
import { READ_NOT_FOUND_BODY } from '../../src/read/membership.js';
import { DRAFT_PUBLISH_REFUSED_RULE, MAX_PUBLISH_SET } from '../../src/routes/drafts-publish.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { buildReadTestApp, type ReadRole, type ReadWorld } from '../helpers/read-app.js';
import { SCENARIO_NOW } from '../helpers/read-scenario.js';

/**
 * Drafts T5b, the set door `POST /v1/workspaces/:workspaceId/drafts/publish` (28.098, 28.103). The owner's ruling
 * (2026-10-04) is the bar: this is the door through which a SET of drafts becomes visible, so it is probed as every
 * person who is not the author, a refused set publishes NOTHING, and the answer to an id the caller cannot open is
 * the answer a one-id set gives (planner ruling on the T5b AMEND Q1: no existence oracle in the refused index).
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

/** One event through `POST /v1/events`, filed by `role` in `workspaceId` (the read world's workspace by default). */
async function sendIn(
  role: ReadRole,
  workspaceId: string,
  entity: { kind: string; id: string },
  type: string,
  payload: unknown,
): Promise<Record<string, unknown>> {
  const res = await read.app.inject({
    method: 'POST',
    url: '/v1/events',
    headers: read.authOf(role),
    payload: {
      events: [{
        id: newUlid(), workspaceId, entity, type, version: 1, payload,
        actorId: read.userIds[role], origin: 'web', clientTime: SCENARIO_NOW.toISOString(),
      }],
    },
  });
  expect(res.statusCode, res.body).toBe(200);
  return (res.json() as { results: Array<Record<string, unknown>> }).results[0] ?? {};
}
const send = (role: ReadRole, type: string, id: string, payload: unknown) =>
  sendIn(role, WS(), { kind: 'ticket', id }, type, payload);
/** A draft born through the door, by `member` unless another author is named. */
async function draft(id: string, extra: Record<string, unknown> = {}, author: ReadRole = 'member'): Promise<void> {
  expect(
    await send(author, 'ticket.created', id, {
      typeId: 'task', projectId: PROJECT(), parentId: null, title: `Quokka ${id.slice(-4)}`, start: 'backlog', draft: true, ...extra,
    }),
  ).toMatchObject({ status: 'committed' });
}
async function published(id: string, extra: Record<string, unknown> = {}): Promise<void> {
  expect(
    await send('member', 'ticket.created', id, { typeId: 'task', projectId: PROJECT(), parentId: null, title: `Real ${id.slice(-4)}`, ...extra }),
  ).toMatchObject({ status: 'committed' });
}
const publishSet = (role: ReadRole, ticketIds: unknown, body: Record<string, unknown> = {}, workspaceId: string = WS()) =>
  read.app.inject({
    method: 'POST',
    url: `/v1/workspaces/${workspaceId}/drafts/publish`,
    headers: read.authOf(role),
    payload: { ticketIds, ...body },
  });
const detail = (role: ReadRole, id: string) =>
  read.app.inject({ method: 'GET', url: `/v1/workspaces/${WS()}/tickets/${id}`, headers: read.authOf(role) });
const keyNumber = (key: string | null): number => Number(/-(\d+)$/.exec(key ?? '')?.[1]);
type SetResult = { results: Array<{ ticketId: string; key: string | null }> };
type SetRefusal = { rule: string; ticketId: string; cause: { rule: string; reason: string } };
const publishedRows = async (ticketIds: string[]): Promise<number> =>
  (await db.pool.query(`SELECT 1 FROM events WHERE type = 'ticket.published' AND entity_id = ANY($1)`, [ticketIds])).rows.length;
const stillDrafts = async (ticketIds: string[]): Promise<number> =>
  (await db.pool.query('SELECT 1 FROM proj_tickets WHERE ticket_id = ANY($1) AND draft_author_id IS NOT NULL', [ticketIds])).rows.length;

/**
 * A ticket the OWNER can open in a SECOND workspace the owner founds: the cell that separates "this id has no row
 * in this workspace" from "the caller cannot open this id" (the neighbour's ticket fails both).
 */
async function ownersTicketElsewhere(): Promise<string> {
  const founded = await read.app.inject({
    method: 'POST', url: '/v1/workspaces', headers: read.authOf('owner'), payload: { name: 'Elsewhere' },
  });
  expect(founded.statusCode, founded.body).toBe(201);
  const elsewhere = founded.json<{ workspaceId: string }>().workspaceId;
  const project = newUlid();
  const ticket = newUlid();
  expect(await sendIn('owner', elsewhere, { kind: 'project', id: project }, 'project.created', { name: 'Elsewhere' })).toMatchObject({ status: 'committed' });
  expect(
    await sendIn('owner', elsewhere, { kind: 'project', id: project }, 'project.member_added', { userId: read.userIds.owner, projectAdmin: true }),
  ).toMatchObject({ status: 'committed' });
  expect(
    await sendIn('owner', elsewhere, { kind: 'ticket', id: ticket }, 'ticket.created', { typeId: 'task', projectId: project, parentId: null, title: 'Elsewhere' }),
  ).toMatchObject({ status: 'committed' });
  return ticket;
}

describe('28.103 the atomic route', () => {
  it('publishes an epic, a task under it and a root task in the given order with consecutive keys and consecutive ledger rows; CONTROL: three published one by one are consecutive too', async () => {
    // Sorted so the GIVEN order [parent, child, loose] is provably not the ULID order (`newUlid` is not
    // monotonic inside one millisecond): a route that sorted the ids would publish `loose` first.
    const [loose, parent, child] = [newUlid(), newUlid(), newUlid()].sort() as [Ulid, Ulid, Ulid];
    await draft(parent, { typeId: 'epic' });
    await draft(child, { parentId: parent });
    await draft(loose);

    const res = await publishSet('member', [parent, child, loose]);
    expect(res.statusCode, res.body).toBe(200);
    const { results } = res.json() as SetResult;
    expect(results.map((r) => r.ticketId)).toEqual([parent, child, loose]);
    const numbers = results.map((r) => keyNumber(r.key));
    expect(numbers).toEqual([numbers[0], numbers[0]! + 1, numbers[0]! + 2]);
    expect(Number.isInteger(numbers[0])).toBe(true);
    for (const r of results) {
      const seen = await detail('owner', r.ticketId);
      expect(seen.statusCode).toBe(200);
      const body = seen.json() as { key: string | null; ticketState: { draft?: unknown } };
      expect(body.key).toBe(r.key);
      expect(body.ticketState.draft).toBeUndefined();
    }
    const { rows } = await db.pool.query<{ s: number; entity_id: string }>(
      `SELECT workspace_seq::int AS s, entity_id FROM events WHERE type = 'ticket.published' AND entity_id = ANY($1) ORDER BY workspace_seq`,
      [[parent, child, loose]],
    );
    expect(rows.map((r) => r.entity_id)).toEqual([parent, child, loose]); // the caller's order on the ledger
    expect(rows.map((r) => r.s)).toEqual([rows[0]!.s, rows[0]!.s + 1, rows[0]!.s + 2]);

    const singles = [newUlid(), newUlid(), newUlid()];
    for (const id of singles) await draft(id);
    const keys: number[] = [];
    for (const id of singles) {
      expect(await send('member', 'ticket.published', id, { projectId: PROJECT() })).toMatchObject({ status: 'committed' });
      keys.push(keyNumber(((await detail('owner', id)).json() as { key: string | null }).key));
    }
    // Anchored to the set's own numbers (NaN equals NaN under toEqual, so an unanchored triple passes on three null keys):
    // the set took exactly three numbers and the singles continue right after them.
    expect(keys).toEqual([numbers[0]! + 3, numbers[0]! + 4, numbers[0]! + 5]);
  });

  it('with the third draft\'s parent finished NOTHING commits: no row, still drafts, no notice, no key consumed; the set minus the third then publishes with the next two keys', async () => {
    const [d1, d2, d3, parent] = [newUlid(), newUlid(), newUlid(), newUlid()];
    await published(parent, { typeId: 'epic' }); // BEFORE the marker: the parent takes a number too, so it must not sit between `before` and the set
    const marker = newUlid();
    await published(marker);
    const before = keyNumber(((await detail('owner', marker)).json() as { key: string | null }).key);
    expect(Number.isInteger(before)).toBe(true);
    await draft(d1);
    await draft(d2);
    await draft(d3, { parentId: parent });
    expect(await send('member', 'ticket.assigned', d1, { assigneeId: read.userIds.owner })).toMatchObject({ status: 'committed' });
    expect(await send('member', 'ticket.transitioned', parent, { to: 'done' })).toMatchObject({ status: 'committed' });

    const refused = await publishSet('member', [d1, d2, d3]);
    expect(refused.statusCode, refused.body).toBe(409);
    expect(refused.json()).toEqual({
      rule: DRAFT_PUBLISH_REFUSED_RULE,
      ticketId: d3,
      cause: { rule: 'hierarchy.parent-terminal', reason: expect.stringContaining('is finished (Done)') },
    });
    expect(await publishedRows([d1, d2, d3])).toBe(0);
    expect(await stillDrafts([d1, d2, d3])).toBe(3);
    const assignments = async (): Promise<number> =>
      (
        await db.pool.query(
          `SELECT 1 FROM notifications WHERE user_id = $1 AND kind = 'assignment' AND payload->>'ticketId' = $2`,
          [read.userIds.owner, d1],
        )
      ).rows.length;
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(await assignments()).toBe(0); // on its own: the rolled-back set sent no notice

    const ok = await publishSet('member', [d1, d2]);
    expect(ok.statusCode, ok.body).toBe(200);
    expect((ok.json() as SetResult).results.map((r) => keyNumber(r.key))).toEqual([before + 1, before + 2]); // CONTROL: the refused attempt consumed no key
    await expect.poll(assignments, { timeout: 10_000 }).toBe(1);
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(await assignments()).toBe(1); // one notice for the one publish that committed, none for the rolled-back one
  });

  it('refuses a child listed before its unpublished parent and rolls back; the reverse order succeeds', async () => {
    // Sorted so `parent` < `child`: a route that sorted the ids would turn [child, parent] into the order that succeeds.
    const [parent, child] = [newUlid(), newUlid()].sort() as [Ulid, Ulid];
    await draft(parent, { typeId: 'epic' });
    await draft(child, { parentId: parent });

    const wrong = await publishSet('member', [child, parent]);
    expect(wrong.statusCode, wrong.body).toBe(409);
    expect(wrong.json()).toEqual({
      rule: DRAFT_PUBLISH_REFUSED_RULE,
      ticketId: child,
      cause: { rule: 'draft.parent-unpublished', reason: 'The parent is still a draft. Publish the parent first.' },
    });
    expect(await publishedRows([parent, child])).toBe(0);

    const right = await publishSet('member', [parent, child]);
    expect(right.statusCode, right.body).toBe(200);
    expect(await publishedRows([parent, child])).toBe(2);
  });
});

describe('28.098 the set door\'s answers', () => {
  it('answers a non-member with the not-found body and malformed bodies, more than 200 ids among them, with 400; exactly 200 ids pass the schema and reach the walk (a 409, not a 400); CONTROL: a one-id set from the author succeeds', async () => {
    const mine = newUlid();
    await draft(mine);
    const stranger = await publishSet('stranger', [mine]);
    expect(stranger.statusCode).toBe(404);
    expect(stranger.json()).toEqual(READ_NOT_FOUND_BODY);

    // The cap is R48's literal. The two cap legs below size their bodies from the import, so without this pin a cap
    // moved x10 or /10 would move them with it.
    expect(MAX_PUBLISH_SET).toBe(200); // R48
    const dup = newUlid();
    for (const [name, body] of [
      ['no ids', { ticketIds: [] }],
      ['a repeated id', { ticketIds: [dup, dup] }],
      ['more than the cap', { ticketIds: Array.from({ length: MAX_PUBLISH_SET + 1 }, () => newUlid()) }],
      ['a non-ULID id', { ticketIds: ['not-a-ulid'] }],
      // `mine` (a real draft of the caller) in these two: with `additionalProperties: false` dropped the first
      // would PUBLISH it, so the `publishedRows` leg below can fail on its own (before, no body named `mine`).
      ['an unknown member', { ticketIds: [mine], extra: 1 }],
      ['origin server', { ticketIds: [mine], origin: 'server' }],
    ] as const) {
      const res = await read.app.inject({
        method: 'POST', url: `/v1/workspaces/${WS()}/drafts/publish`, headers: read.authOf('member'), payload: body,
      });
      expect(res.statusCode, name).toBe(400);
    }
    expect(await publishedRows([mine])).toBe(0);

    // CONTROL for 'more than the cap': exactly the cap passes the schema, so the walk answers it at index 0 (no id has
    // a row here) with a 409, not a 400. With `maxItems` one lower this is the 400.
    const atCap = Array.from({ length: MAX_PUBLISH_SET }, () => newUlid());
    const full = await publishSet('member', atCap);
    expect(full.statusCode, full.body).toBe(409);
    expect(full.json()).toEqual({
      rule: DRAFT_PUBLISH_REFUSED_RULE,
      ticketId: atCap[0],
      cause: { rule: PERMISSION_VISIBILITY_RULE, reason: TICKET_NOT_VISIBLE_REASON },
    });

    const ok = await publishSet('member', [mine]);
    expect(ok.statusCode, ok.body).toBe(200);
  });

  it('gives everyone who is not the author, an unknown id and another workspace\'s ticket one identical cause; a published ticket is draft.not-a-draft; the attempts changed nothing', async () => {
    const theirs = newUlid();
    const twin = newUlid();
    await draft(theirs);
    await published(twin);
    const elsewhere = await ownersTicketElsewhere();
    const cause = { rule: PERMISSION_VISIBILITY_RULE, reason: TICKET_NOT_VISIBLE_REASON };
    const refusalFor = async (role: ReadRole, id: string): Promise<SetRefusal> => {
      const res = await publishSet(role, [id]);
      expect(res.statusCode, `${role} ${id}`).toBe(409);
      return res.json() as SetRefusal;
    };
    for (const [role, id] of [
      ['owner', theirs],
      ['admin', theirs],
      ['projectLead', theirs],
      ['guest', theirs],
      ['outsider', theirs],
      ['owner', newUlid()],
      ['owner', read.neighbour.ticketId], // a ticket of a workspace the caller is not in
      ['owner', elsewhere], // a ticket of ANOTHER workspace the caller can open there: no row HERE is the answer
    ] as const) {
      expect(await refusalFor(role, id), `${role} ${id}`).toEqual({ rule: DRAFT_PUBLISH_REFUSED_RULE, ticketId: id, cause });
    }
    expect(await refusalFor('member', twin)).toEqual({
      rule: DRAFT_PUBLISH_REFUSED_RULE,
      ticketId: twin,
      cause: { rule: 'draft.not-a-draft', reason: 'This ticket is not a draft.' },
    });
    expect(await stillDrafts([theirs])).toBe(1);
    expect(await publishedRows([theirs])).toBe(0);
    expect((await publishSet('member', [theirs])).statusCode).toBe(200); // CONTROL: the author can still publish it
  });

  it('names the FIRST id the caller cannot open, as a one-id set would (no existence oracle), and a refused set commits nothing', async () => {
    const owners = newUlid();
    await draft(owners, {}, 'owner');
    const twin = newUlid();
    await published(twin);
    const unknown = newUlid();

    // The author of nothing in this set: another person's draft listed BEFORE an id that does not exist is named
    // first. A walk that refused only ids with no row would skip the draft (it has a row) and name `unknown`,
    // telling the caller that `owners` exists.
    const hidden = await publishSet('member', [owners, unknown]);
    expect(hidden.statusCode, hidden.body).toBe(409);
    expect(hidden.json()).toEqual({
      rule: DRAFT_PUBLISH_REFUSED_RULE,
      ticketId: owners,
      cause: { rule: PERMISSION_VISIBILITY_RULE, reason: TICKET_NOT_VISIBLE_REASON },
    });

    // The owner's own draft first, then an id the owner cannot publish: the set stops at index 1 and the draft
    // listed first is still a draft.
    for (const [second, rule] of [
      [unknown, PERMISSION_VISIBILITY_RULE],
      [twin, 'draft.not-a-draft'],
    ] as const) {
      const res = await publishSet('owner', [owners, second]);
      expect(res.statusCode, res.body).toBe(409);
      expect(res.json()).toMatchObject({ rule: DRAFT_PUBLISH_REFUSED_RULE, ticketId: second, cause: { rule } });
      expect(await publishedRows([owners])).toBe(0);
      expect(await stillDrafts([owners])).toBe(1);
    }
    expect((await publishSet('owner', [owners])).statusCode).toBe(200); // CONTROL: the owner publishes their own draft
  });

  it('records the door the caller names on the ledger row, and web by default', async () => {
    const [viaMcp, viaDefault] = [newUlid(), newUlid()];
    await draft(viaMcp);
    await draft(viaDefault);
    expect((await publishSet('member', [viaMcp], { origin: 'mcp' })).statusCode).toBe(200);
    expect((await publishSet('member', [viaDefault])).statusCode).toBe(200);
    const { rows } = await db.pool.query<{ entity_id: string; origin: string }>(
      `SELECT entity_id, origin FROM events WHERE type = 'ticket.published' AND entity_id = ANY($1)`,
      [[viaMcp, viaDefault]],
    );
    expect(new Map(rows.map((r) => [r.entity_id, r.origin]))).toEqual(new Map([[viaMcp, 'mcp'], [viaDefault, 'web']]));
  });
});
