import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createOnlineDataSource, type FetchLike } from '@gisik-nokma/app-core/online';
import {
  membershipId,
  newUlid,
  type AttentionResponse,
  type LedgerEvent,
  type SubmittedEvent,
} from '@gisik-nokma/domain';
import { getWorkspaceSettings } from '../../src/projections/workspace-settings.js';
import { requireMember } from '../../src/read/membership.js';
import { readAttention } from '../../src/routes/attention.js';
import { applyCommitted, makeCommitted } from '../helpers/apply.js';
import { buildTestApp } from '../helpers/app.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { SCENARIO_NOW } from '../helpers/read-scenario.js';
import { signInWithPhone } from '../helpers/session.js';

/**
 * Cases 30.003–30.010 and 30.059–30.061 (my-work-global T1, Step 3 and Step 4b).
 * The `?show=` filter on `GET /v1/workspaces/:ws/attention` and on
 * `GET /v1/contests` — the two reads the attention strip is assembled from.
 *
 * ## The rig
 *
 * The viewer V is an `admin` of W1 and a plain `member` of W2. In W1, V is a
 * project admin of P1 (an explicit roster row with `projectAdmin: true`) and
 * not of P2. U owns both workspaces and creates everything V did not.
 *
 * Every ticket is moved into a `blocked`-flagged state, so each one qualifies
 * for exactly one bucket (blocked) and a ticket's presence in `items` is the
 * filter's answer, not the clock's: the app's clock is pinned to
 * `SCENARIO_NOW`, a couple of hours after every state entry here, so nothing is
 * stale and nothing carries a due date.
 *
 * | id  | ws | project | created by | assigned to | visibility              |
 * |-----|----|---------|------------|-------------|-------------------------|
 * | tc  | W1 | P2      | V          | —           | default                 |
 * | ta  | W1 | P2      | U          | V           | default                 |
 * | tb  | W1 | P2      | V          | V           | default                 |
 * | tp  | W1 | P1      | U          | —           | default                 |
 * | tw  | W1 | P2      | U          | —           | default                 |
 * | th  | W1 | P1      | U          | —           | explicit [U] (hidden)   |
 * | tn  | W2 | P3      | U          | —           | default                 |
 * | tv  | W2 | P3      | V          | —           | default                 |
 * | tvh | W2 | P3      | V          | —           | explicit [U] (hidden)   |
 *
 * `th` and `tvh` are what "visibility bounds every arm" is measured against: V
 * cannot see either, through ANY member of `show`. Since rule A
 * (`effective-role.ts`'s `RULE_A_ROLES`) a member is on every live project, so
 * a hidden ticket has to be hidden by an explicit audience (plan AMEND 16:26,
 * 30.009).
 *
 * The world is built through `applyCommitted` (the whole projection registry),
 * not `seedTicket`: `seedTicket`'s head row is a hand-written INSERT that writes
 * no `created_by`, so the `created` arm would come back empty because of the
 * fixture rather than the code.
 *
 * Ticket ids are hand-built so they sort in Postgres as they sort here, and the
 * attention route returns a bucket in `ORDER BY t.ticket_id`: every list below
 * is asserted in that order, unsorted, so a ticket served twice is visible.
 *
 * The last block is the CLIENT's leg of case 30.027 (my-work-global T3): the
 * online data source's `getAttention`, over `app.inject`, against these two
 * routes and this rig, so the `show` it joins by hand and the contest rows'
 * `workspaceId` it reads strictly meet the real server, not a fixture.
 */

let db: TestDatabase;
let app: FastifyInstance;
let tokenV = '';
let tokenU = '';
let V = '';
let U = '';

const W1 = newUlid();
const W2 = newUlid();
const P1 = newUlid();
const P2 = newUlid();
const P3 = newUlid();

/** A hand-built ticket id ordered by `index` (one Crockford digit, 1–9). */
function ticketId(index: number): string {
  return `0MWGSH${'0'.repeat(19)}${index}`;
}
const tc = ticketId(1);
const ta = ticketId(2);
const tb = ticketId(3);
const tp = ticketId(4);
const tw = ticketId(5);
const th = ticketId(6);
const tn = ticketId(7);
const tv = ticketId(8);
const tvh = ticketId(9);

const INVALID_QUERY = { error: 'invalid_query' };

function blockedWorkflow(workflowId: string): Record<string, unknown> {
  return {
    id: workflowId,
    version: 1,
    name: 'Errands',
    initialStateId: 'todo',
    states: [
      { id: 'todo', name: 'To do', category: 'open' },
      { id: 'doing', name: 'Doing', category: 'active' },
      { id: 'waiting', name: 'Waiting', category: 'active', blocked: true },
      { id: 'done', name: 'Done', category: 'terminal' },
    ],
    transitions: [
      { from: '*', to: 'todo', rules: [] },
      { from: '*', to: 'doing', rules: [] },
      { from: '*', to: 'waiting', rules: [] },
      { from: '*', to: 'done', rules: [] },
    ],
  };
}

function ev(
  workspaceId: string,
  actorId: string,
  entity: LedgerEvent['entity'],
  type: string,
  payload: Record<string, unknown>,
): LedgerEvent {
  return makeCommitted({ workspaceId, actorId, entity, type, payload });
}

/** The founding sequence of one workspace: U owns it, V holds `vRole`, one workflow and one type. */
function founding(workspaceId: string, vRole: 'admin' | 'member', suffix: string): LedgerEvent[] {
  const workflowId = `wf-mwg-show-${suffix}`;
  const typeId = `mwg-show-task-${suffix}`;
  return [
    ev(workspaceId, U, { kind: 'workspace', id: workspaceId }, 'workspace.created', { name: `Show ${suffix}` }),
    ev(workspaceId, U, { kind: 'membership', id: membershipId(workspaceId, U) }, 'membership.granted', { userId: U, role: 'owner' }),
    ev(workspaceId, U, { kind: 'membership', id: membershipId(workspaceId, V) }, 'membership.granted', { userId: V, role: vRole }),
    ev(workspaceId, U, { kind: 'workflow', id: workflowId }, 'workflow.defined', blockedWorkflow(workflowId)),
    ev(workspaceId, U, { kind: 'ticket-type', id: typeId }, 'ticket-type.defined', {
      id: typeId,
      name: 'Task',
      icon: 'check',
      rank: 1,
      workflowId,
      fields: [],
    }),
  ];
}

/** A ticket created by `creator`, optionally assigned to V or hidden to [U], then moved into the blocked state. */
function ticket(
  workspaceId: string,
  suffix: string,
  id: string,
  projectId: string,
  creator: string,
  opts: { assignToV?: boolean; hiddenToU?: boolean } = {},
): LedgerEvent[] {
  const entity = { kind: 'ticket', id } as const;
  return [
    ev(workspaceId, creator, entity, 'ticket.created', {
      typeId: `mwg-show-task-${suffix}`,
      projectId,
      parentId: null,
      title: `Ticket ${id}`,
    }),
    ...(opts.assignToV === true ? [ev(workspaceId, creator, entity, 'ticket.assigned', { assigneeId: V })] : []),
    ...(opts.hiddenToU === true
      ? [ev(workspaceId, U, entity, 'visibility.set', { ticketId: id, mode: 'explicit', userIds: [U] })]
      : []),
    ev(workspaceId, creator, entity, 'ticket.transitioned', { to: 'waiting' }),
  ];
}

/** A contest on `id`, filed the way the server files one: the refused claim embedded whole. */
function contest(workspaceId: string, id: string): LedgerEvent {
  const original: SubmittedEvent = {
    id: newUlid(),
    workspaceId,
    entity: { kind: 'ticket', id },
    type: 'ticket.transitioned',
    version: 1,
    payload: { to: 'done' },
    actorId: V,
    origin: 'mobile',
    clientTime: '2026-08-20T09:00:00.000Z',
  };
  return ev(workspaceId, newUlid(), { kind: 'ticket', id }, 'claim.contested', {
    originalEvent: original,
    rule: 'require-field',
    reason: 'A due date is required before this move.',
  });
}

beforeAll(async () => {
  db = await createTestDatabase();
  const built = buildTestApp(db, { now: () => SCENARIO_NOW });
  app = built.app;
  await app.ready();
  const viewer = await signInWithPhone(app, built.otp, '+913000000001');
  const other = await signInWithPhone(app, built.otp, '+913000000002');
  V = viewer.userId;
  U = other.userId;
  tokenV = viewer.token;
  tokenU = other.token;

  await applyCommitted(db.pool, [
    ...founding(W1, 'admin', 'w1'),
    ev(W1, U, { kind: 'project', id: P1 }, 'project.created', { name: 'Registrations' }),
    ev(W1, U, { kind: 'project', id: P2 }, 'project.created', { name: 'Accounts' }),
    ev(W1, U, { kind: 'project', id: P1 }, 'project.member_added', { userId: V, projectAdmin: true }),
    // A threshold somebody CHOSE, so 30.010's `settings` is a claim and not the defaults.
    ev(W1, U, { kind: 'workspace', id: W1 }, 'workspace.settings_set', { staleDays: 9, dueSoonDays: 4 }),
    ...founding(W2, 'member', 'w2'),
    ev(W2, U, { kind: 'project', id: P3 }, 'project.created', { name: 'Payroll' }),
    ...ticket(W1, 'w1', tc, P2, V),
    ...ticket(W1, 'w1', ta, P2, U, { assignToV: true }),
    ...ticket(W1, 'w1', tb, P2, V, { assignToV: true }),
    ...ticket(W1, 'w1', tp, P1, U),
    ...ticket(W1, 'w1', tw, P2, U),
    ...ticket(W1, 'w1', th, P1, U, { hiddenToU: true }),
    ...ticket(W2, 'w2', tn, P3, U),
    ...ticket(W2, 'w2', tv, P3, V),
    ...ticket(W2, 'w2', tvh, P3, V, { hiddenToU: true }),
    contest(W1, tc),
    contest(W1, ta),
    contest(W1, tp),
    contest(W1, tw),
    contest(W1, th),
  ]);
}, 120_000);

afterAll(async () => {
  await app.close();
  await db.drop();
});

async function attention(
  token: string,
  workspaceId: string,
  query = '',
): Promise<{ status: number; body: AttentionResponse & Record<string, unknown> }> {
  const response = await app.inject({
    method: 'GET',
    url: `/v1/workspaces/${workspaceId}/attention${query}`,
    headers: { authorization: `Bearer ${token}` },
  });
  return { status: response.statusCode, body: response.json() };
}

/** The ticket ids of a 200's items, in response order — or the status and body when it is not a 200. */
async function itemIds(token: string, workspaceId: string, query = ''): Promise<string[]> {
  const { status, body } = await attention(token, workspaceId, query);
  expect({ status, query }).toEqual({ status: 200, query });
  return body.items.map((item) => item.card.ticketId);
}

async function contestTicketIds(token: string, workspaceId: string, query = ''): Promise<string[]> {
  const response = await app.inject({
    method: 'GET',
    url: `/v1/contests?workspaceId=${workspaceId}${query}`,
    headers: { authorization: `Bearer ${token}` },
  });
  expect({ status: response.statusCode, query }).toEqual({ status: 200, query });
  return (response.json() as { contests: Array<{ ticketId: string }> }).contests.map((c) => c.ticketId);
}

describe('30.003 no show: today’s all-visible answer', () => {
  it('30.003 the per-workspace route with no show serves every visible blocked ticket, and only the blocked bucket', async () => {
    const { status, body } = await attention(tokenV, W1);
    expect(status).toBe(200);
    expect(body.items.map((item) => [item.kind, item.card.ticketId])).toEqual([
      ['blocked', tc],
      ['blocked', ta],
      ['blocked', tb],
      ['blocked', tp],
      ['blocked', tw],
    ]);
  });
});

describe('30.004 show=created,assigned: the union, each ticket once', () => {
  it('30.004 exactly tc, ta and tb, with tb (created by V AND assigned to V) served ONCE', async () => {
    expect(await itemIds(tokenV, W1, '?show=created,assigned')).toEqual([tc, ta, tb]);
    // The other order spells the same set.
    expect(await itemIds(tokenV, W1, '?show=assigned,created')).toEqual([tc, ta, tb]);
  });
});

describe('30.005 each person arm alone', () => {
  it('30.005 show=created is tc and tb; show=assigned is ta and tb; a repeated member collapses', async () => {
    expect(await itemIds(tokenV, W1, '?show=created')).toEqual([tc, tb]);
    expect(await itemIds(tokenV, W1, '?show=assigned')).toEqual([ta, tb]);
    expect(await itemIds(tokenV, W1, '?show=created,created')).toEqual([tc, tb]);
  });
});

describe('30.006 show=ws-admin widens only where the viewer holds the role', () => {
  it('30.006 on W1 (V is admin) every visible ticket, the hidden one still absent; on W2 (V is member) a 400', async () => {
    expect(await itemIds(tokenV, W1, '?show=ws-admin')).toEqual([tc, ta, tb, tp, tw]);
    // CONTROL: the owner, who may see `th`, IS served it through the same arm,
    // so its absence above is visibility bounding the arm, not the arm missing it.
    expect(await itemIds(tokenU, W1, '?show=ws-admin')).toEqual([tc, ta, tb, tp, tw, th]);

    const refused = await attention(tokenV, W2, '?show=ws-admin');
    expect({ status: refused.status, body: refused.body }).toEqual({ status: 400, body: INVALID_QUERY });
    // CONTROL, same workspace: V's own arms answer there.
    expect(await itemIds(tokenV, W2, '?show=created')).toEqual([tv]);
  });
});

describe('30.007 show=project-admin covers the projects the viewer administers', () => {
  it('30.007 on W1 only tp (P1), not tw (P2) and not the hidden th; refused where V administers nothing, and for an owner with no roster row', async () => {
    expect(await itemIds(tokenV, W1, '?show=project-admin')).toEqual([tp]);

    const memberOnly = await attention(tokenV, W2, '?show=project-admin');
    expect({ status: memberOnly.status, body: memberOnly.body }).toEqual({ status: 400, body: INVALID_QUERY });
    // An owner's implicit rule-A projects carry `projectAdmin: false`: the
    // workspace role is `ws-admin`'s arm, never this one.
    const owner = await attention(tokenU, W1, '?show=project-admin');
    expect({ status: owner.status, body: owner.body }).toEqual({ status: 400, body: INVALID_QUERY });

    // `readAttention` is exported, so a caller that skips the route's parse can
    // hand it `project-admin` for a viewer who administers nothing: the arm is
    // then `FALSE` — nothing — never the whole workspace.
    const effW2 = await requireMember(db.pool, V, W2);
    const direct = await readAttention(db.pool, effW2!, V, W2, SCENARIO_NOW, new Set(['project-admin']));
    expect(direct.items).toEqual([]);
    // CONTROL, same call shape: the same viewer's `created` arm there is not empty.
    const control = await readAttention(db.pool, effW2!, V, W2, SCENARIO_NOW, new Set(['created']));
    expect(control.items.map((item) => item.card.ticketId)).toEqual([tv]);
  });
});

describe('30.008 a malformed show is refused', () => {
  it('30.008 empty, unknown, trailing-comma and repeated show are each a 400 invalid_query', async () => {
    for (const query of ['?show=', '?show=bogus', '?show=created,', '?show=created&show=assigned', '?show=Created']) {
      const refused = await attention(tokenV, W1, query);
      expect({ query, status: refused.status, body: refused.body }).toEqual({ query, status: 400, body: INVALID_QUERY });
    }
    // CONTROL, same `it`: a well-formed show on the same workspace answers.
    expect(await itemIds(tokenV, W1, '?show=created')).toEqual([tc, tb]);
  });
});

describe('30.009 visibility bounds the created arm', () => {
  it('30.009 a W2 ticket V created but cannot see (explicit [U]) is absent from show=created; the visible one V created is served', async () => {
    const ids = await itemIds(tokenV, W2, '?show=created');
    // CONTROL, same `it`: tv, also created by V, is there.
    expect(ids).toContain(tv);
    expect(ids).not.toContain(tvh);
    expect(ids).toEqual([tv]);
    // CONTROL: tvh DOES qualify for the strip — the owner, who may see it, is
    // served it — so its absence above is visibility, not the bucket.
    expect(await itemIds(tokenU, W2, '?show=ws-admin')).toEqual([tn, tv, tvh]);
  });
});

describe('30.010 the no-show body still carries the workspace settings', () => {
  it('30.010 settings is the claimed WorkspaceSettings on the no-show answer (the online client reads it from here), with the all-visible items beside it', async () => {
    const expected = JSON.parse(JSON.stringify(await getWorkspaceSettings(db.pool, W1))) as Record<string, unknown>;
    expect(expected).toMatchObject({ staleDays: 9, dueSoonDays: 4 });
    const plain = await attention(tokenV, W1);
    expect(plain.body.settings).toEqual(expected);
    expect(plain.body.items.map((item) => item.card.ticketId)).toEqual([tc, ta, tb, tp, tw]);
    // A filtered answer carries the same settings: the filter narrows items only.
    const filtered = await attention(tokenV, W1, '?show=created');
    expect(filtered.body.settings).toEqual(expected);
  });
});

describe('30.059 contests take the same show', () => {
  it('30.059 show=created,assigned returns only the contests on tickets V created or is assigned to; with no show, every contest V may see', async () => {
    // CONTROL, same `it`: no show is today's answer (th's contest is hidden by canSee).
    expect(await contestTicketIds(tokenV, W1)).toEqual([tc, ta, tp, tw]);
    expect(await contestTicketIds(tokenV, W1, '&show=created,assigned')).toEqual([tc, ta]);
    expect(await contestTicketIds(tokenV, W1, '&show=assigned')).toEqual([ta]);
    expect(await contestTicketIds(tokenV, W1, '&show=ws-admin')).toEqual([tc, ta, tp, tw]);
  });
});

describe('30.060 contests refuse a role the viewer does not hold', () => {
  it('30.060 show=ws-admin on W2 (V is a member) is a 400 invalid_query, as on the attention route', async () => {
    for (const query of ['&show=ws-admin', '&show=bogus', '&show=created&show=assigned']) {
      const response = await app.inject({
        method: 'GET',
        url: `/v1/contests?workspaceId=${W2}${query}`,
        headers: { authorization: `Bearer ${tokenV}` },
      });
      expect({ query, status: response.statusCode, body: response.json() }).toEqual({
        query,
        status: 400,
        body: INVALID_QUERY,
      });
    }
    // CONTROL, same workspace: a show V may use answers.
    expect(await contestTicketIds(tokenV, W2, '&show=created')).toEqual([]);
  });
});

describe('30.061 contests on the projects the viewer administers', () => {
  it('30.061 show=project-admin returns only the contest on P1’s visible ticket', async () => {
    expect(await contestTicketIds(tokenV, W1, '&show=project-admin')).toEqual([tp]);
  });
});

describe('30.027 the online client against these two routes (my-work-global T3)', () => {
  /**
   * `createOnlineDataSource` over `app.inject`, shaped like
   * `list-narrowing-roundtrip.test.ts`'s `injectFetch`: only `status`, `ok` and
   * `json()`, with `ok` derived from the status the server set. GET only, the one
   * method `getAttention` sends; every URL it asks is recorded.
   */
  function clientAs(token: string, calls: string[]) {
    const fetchImpl = (async (input: string) => {
      calls.push(input);
      const res = await app.inject({ method: 'GET', url: input, headers: { authorization: `Bearer ${token}` } });
      return {
        ok: res.statusCode >= 200 && res.statusCode < 300,
        status: res.statusCode,
        json: async () => res.json() as unknown,
      } as Response;
    }) as FetchLike;
    return createOnlineDataSource({ baseUrl: '', fetchImpl });
  }

  it('30.027 getAttention(W1, [created, assigned]) maps the swept tc, ta, tb and the contests on tc and ta, each carrying W1; with no show, every contest V may see', async () => {
    const calls: string[] = [];
    const client = clientAs(tokenV, calls);
    // CONTROL, same `it`: no show is today's strip, so the contests on tp and tw
    // (neither created by nor assigned to V) are there; th's is hidden by `canSee`.
    const all = await client.query.getAttention(W1);
    expect(all.filter((item) => item.kind === 'contested').map((item) => item.ticketId)).toEqual([tc, ta, tp, tw]);

    const filtered = await client.query.getAttention(W1, ['created', 'assigned']);
    expect(filtered.map((item) => [item.kind, item.ticketId, item.workspaceId])).toEqual([
      ['blocked', tc, W1],
      ['blocked', ta, W1],
      ['blocked', tb, W1],
      ['contested', tc, W1],
      ['contested', ta, W1],
    ]);
    // ...asked with 30.026's spelling: a literal comma, on BOTH routes. (The server
    // also decodes `%2C`, so only this line tells the two spellings apart.)
    expect(calls).toContain(`/v1/workspaces/${W1}/attention?show=created,assigned`);
    expect(calls).toContain(`/v1/contests?workspaceId=${W1}&open=true&show=created,assigned`);
  });
});
