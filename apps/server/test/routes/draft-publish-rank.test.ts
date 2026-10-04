import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { compareByRank, newUlid, planTailRank, type RankAssignment } from '@gisik-nokma/domain';
import { door } from '../helpers/door.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { buildReadTestApp, type ReadRole, type ReadWorld } from '../helpers/read-app.js';

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

/** A project of its own, so its Backlog is exactly what the test makes. Every owner, admin and member is on a founded project. */
async function project(): Promise<string> {
  const id = newUlid();
  expect(await door(read, 'owner', 'project', id, 'project.created', { name: `Rank ${id.slice(-6)}` })).toMatchObject({ status: 'committed' });
  return id;
}
async function backlog(projectId: string, role: ReadRole = 'member'): Promise<string> {
  const id = newUlid();
  expect(
    await door(read, role, 'ticket', id, 'ticket.created', { typeId: 'task', projectId, parentId: null, title: `Row ${id.slice(-6)}`, start: 'backlog' }),
  ).toMatchObject({ status: 'committed' });
  return id;
}
async function draft(projectId: string, role: ReadRole = 'member'): Promise<string> {
  const id = newUlid();
  expect(
    await door(read, role, 'ticket', id, 'ticket.created', { typeId: 'task', projectId, parentId: null, title: `Draft ${id.slice(-6)}`, start: 'backlog', draft: true }),
  ).toMatchObject({ status: 'committed' });
  return id;
}
const rank = async (id: string, key: string) => expect(await door(read, 'member', 'ticket', id, 'ticket.ranked', { rank: key })).toMatchObject({ status: 'committed' });

async function rowsOf(projectId: string): Promise<Array<{ ticketId: string; rank: string | null }>> {
  const { rows } = await db.pool.query<{ ticket_id: string; rank: string | null }>(
    `SELECT ticket_id, rank FROM proj_tickets
      WHERE project_id = $1 AND state_id = 'backlog' AND deleted_at IS NULL AND draft_author_id IS NULL`,
    [projectId],
  );
  return rows.map((row) => ({ ticketId: row.ticket_id, rank: row.rank }));
}
const drawn = async (projectId: string): Promise<string[]> => (await rowsOf(projectId)).sort(compareByRank).map((row) => row.ticketId);
const publishSet = (role: ReadRole, ticketIds: string[]) =>
  read.app.inject({ method: 'POST', url: `/v1/workspaces/${WS()}/drafts/publish`, headers: read.authOf(role), payload: { ticketIds } });
const head = async (): Promise<number> =>
  Number((await db.pool.query<{ head: string }>('SELECT COALESCE(MAX(workspace_seq), 0) AS head FROM events WHERE workspace_id = $1', [WS()])).rows[0]?.head);
const writtenSince = async (seq: number): Promise<Array<{ type: string; entity_id: string }>> =>
  (
    await db.pool.query<{ type: string; entity_id: string }>(
      `SELECT type, entity_id FROM events WHERE workspace_id = $1 AND workspace_seq > $2 AND type IN ('ticket.published', 'ticket.ranked') ORDER BY workspace_seq`,
      [WS(), seq],
    )
  ).rows;

describe('28.187 rank on publish, single (R64)', () => {
  it('lands the ticket last and keeps the unranked rows in their old order; CONTROL: the tail key alone draws above them', async () => {
    const p = await project();
    const [r1, r2, u1, u2] = [await backlog(p), await backlog(p), await backlog(p), await backlog(p)];
    await rank(r1, 'g');
    await rank(r2, 'p');
    const d = await draft(p);
    const before = await drawn(p);
    expect(before.slice(0, 2)).toEqual([r1, r2]);

    expect(await door(read, 'member', 'ticket', d, 'ticket.published', { projectId: p })).toMatchObject({ status: 'committed' });
    const rows = await rowsOf(p);
    const plan = planTailRank(rows, [d]);
    expect(plan.backfill.map((a) => a.ticketId)).toEqual(before.filter((id) => id === u1 || id === u2));
    expect(plan.tail.map((a) => a.ticketId)).toEqual([d]);

    const draws = (assignments: RankAssignment[]): string[] => {
      const keys = new Map(assignments.map((a) => [a.ticketId, a.rank]));
      return rows.map((row) => ({ ...row, rank: keys.get(row.ticketId) ?? row.rank })).sort(compareByRank).map((row) => row.ticketId);
    };
    expect(draws(plan.tail).indexOf(d)).toBeLessThan(draws(plan.tail).indexOf(u1)); // CONTROL: no backfill, d above the unranked rows

    for (const assignment of [...plan.backfill, ...plan.tail]) {
      expect(await door(read, 'member', 'ticket', assignment.ticketId, 'ticket.ranked', { rank: assignment.rank })).toMatchObject({ status: 'committed' });
    }
    expect(await drawn(p)).toEqual([...before, d]);
  });
});

describe('28.188 rank on publish, a set (R64)', () => {
  it('writes the publishes, then per project the backfill and the set in the given order; each project draws the set last; one backfill per unranked row', async () => {
    const [pa, pb] = [await project(), await project()];
    const [ra, ua, ub] = [await backlog(pa), await backlog(pa), await backlog(pb)];
    await rank(ra, 'g');
    // Sorted DESCENDING into (a1, a2), so the given order [a1, …, a2] is not the ULID order (`newUlid` is not monotonic
    // inside a millisecond): a tail that sorted its ids would place a2 first.
    const [a2, a1] = [await draft(pa), await draft(pa)].sort() as [string, string];
    const b1 = await draft(pb);
    const [beforeA, beforeB, mark] = [await drawn(pa), await drawn(pb), await head()];

    const res = await publishSet('member', [a1, b1, a2]);
    expect(res.statusCode, res.body).toBe(200);
    const written = await writtenSince(mark);
    expect(written.map((w) => w.type)).toEqual([...Array(3).fill('ticket.published'), ...Array(5).fill('ticket.ranked')]);
    expect(written.slice(0, 3).map((w) => w.entity_id)).toEqual([a1, b1, a2]);
    // ONE backfill of `ua`, not one per ticket of the project: the exact list holds `ua` once (a separate
    // `toHaveLength(1)` on it could not fail while this line passes, so it is not repeated).
    expect(written.slice(3).map((w) => w.entity_id)).toEqual([ua, a1, a2, ub, b1]);

    expect(await drawn(pa)).toEqual([...beforeA, a1, a2]);
    expect(await drawn(pb)).toEqual([...beforeB, b1]);
  });

  it('a refused set writes no rank and leaves the unranked row unranked; CONTROL: the set minus the refused id then publishes and ranks', async () => {
    const p = await project();
    const [u, live] = [await backlog(p), await backlog(p)];
    const [d2, d1] = [await draft(p), await draft(p)].sort() as [string, string]; // d1 > d2 as strings: the given [d1, d2] is not the ULID order
    const mark = await head();

    const refused = await publishSet('member', [d1, d2, live]);
    expect(refused.statusCode, refused.body).toBe(409);
    expect(refused.json()).toMatchObject({ rule: 'draft.publish-refused', ticketId: live, cause: { rule: 'draft.not-a-draft' } });
    expect(await writtenSince(mark)).toEqual([]);
    expect((await rowsOf(p)).find((row) => row.ticketId === u)?.rank).toBeNull();

    const ok = await publishSet('member', [d1, d2]);
    expect(ok.statusCode, ok.body).toBe(200);
    // CONTROL for the `toEqual([])` above: the same query over the same mark does see a committed set's rows.
    expect((await writtenSince(mark)).map((w) => w.type)).toEqual(['ticket.published', 'ticket.published', 'ticket.ranked', 'ticket.ranked', 'ticket.ranked', 'ticket.ranked']);
    expect((await rowsOf(p)).find((row) => row.ticketId === u)?.rank).not.toBeNull();
    expect((await drawn(p)).slice(-2)).toEqual([d1, d2]);
  });
});

describe('28.189 rows the publisher cannot see (R65, Q15)', () => {
  it('leaves a hidden row unranked and the publish succeeds; the owner\'s publish ranks it', async () => {
    const p = await project();
    const [seen, hidden] = [await backlog(p), await backlog(p, 'owner')];
    expect(
      await door(read, 'owner', 'ticket', hidden, 'visibility.set', { ticketId: hidden, mode: 'explicit', userIds: [read.userIds.owner] }),
    ).toMatchObject({ status: 'committed' });
    // Rows the backfill must not touch, whoever publishes: one outside the Backlog (`rank-requires-backlog` would refuse
    // its `ticket.ranked`) and a soft-deleted Backlog row (the engine would accept a rank on it).
    const todo = newUlid();
    expect(
      await door(read, 'member', 'ticket', todo, 'ticket.created', { typeId: 'task', projectId: p, parentId: null, title: `Todo ${todo.slice(-6)}` }),
    ).toMatchObject({ status: 'committed' });
    const gone = await backlog(p);
    expect(await door(read, 'owner', 'ticket', gone, 'ticket.deleted', {})).toMatchObject({ status: 'committed' });
    const rankOf = async (id: string): Promise<string | null | undefined> =>
      (await db.pool.query<{ rank: string | null }>('SELECT rank FROM proj_tickets WHERE ticket_id = $1', [id])).rows[0]?.rank;
    const d = await draft(p);

    const res = await publishSet('member', [d]);
    expect(res.statusCode, res.body).toBe(200);
    expect([await rankOf(todo), await rankOf(gone)]).toEqual([null, null]);
    const rows = await rowsOf(p);
    expect(rows.find((row) => row.ticketId === hidden)?.rank).toBeNull();
    expect(rows.find((row) => row.ticketId === seen)?.rank).not.toBeNull();
    expect(await drawn(p)).toEqual([seen, d, hidden]); // the hidden row draws below the new ticket, as a drag leaves it (Q15)

    const od = await draft(p, 'owner');
    expect((await publishSet('owner', [od])).statusCode).toBe(200);
    expect((await rowsOf(p)).find((row) => row.ticketId === hidden)?.rank).not.toBeNull(); // CONTROL: the owner sees it, so it is ranked
    expect([await rankOf(todo), await rankOf(gone)]).toEqual([null, null]); // the owner's backfill skips them too
    expect((await drawn(p)).slice(-1)).toEqual([od]);
  });
});

describe('28.188 a rank refused at commit (R64, decision 6)', () => {
  // The rank rows are read BEFORE the transaction, with the staleness a drag has. This world's ingest runs a hook right
  // before the atomic call, so the race a concurrent move makes (the unranked row leaves the Backlog between the read
  // and the commit) is held still.
  let db2: TestDatabase;
  let read2: ReadWorld;
  let beforeAtomic: (() => Promise<void>) | null = null;
  beforeAll(async () => {
    db2 = await createTestDatabase();
    read2 = await buildReadTestApp(db2, {
      observeIngest: (ingest) => {
        const atomic = ingest.ingestClientAtomic.bind(ingest);
        ingest.ingestClientAtomic = async (...args: Parameters<typeof atomic>) => {
          const hook = beforeAtomic;
          beforeAtomic = null;
          if (hook !== null) await hook();
          return atomic(...args);
        };
      },
    });
  }, 120_000);
  afterAll(async () => {
    await read2.app.close();
    await db2.drop();
  });

  it('rolls the publishes back and the 409 names the RANKED ticket with the engine\'s rule; CONTROL: the same set then publishes', async () => {
    const ws = read2.world.workspaceId;
    const send = (role: ReadRole, kind: 'project' | 'ticket', id: string, type: string, payload: unknown) => door(read2, role, kind, id, type, payload);
    const p = newUlid();
    expect(await send('owner', 'project', p, 'project.created', { name: `Race ${p.slice(-6)}` })).toMatchObject({ status: 'committed' });
    const [u, d] = [newUlid(), newUlid()];
    expect(await send('member', 'ticket', u, 'ticket.created', { typeId: 'task', projectId: p, parentId: null, title: 'Row u', start: 'backlog' })).toMatchObject({ status: 'committed' });
    expect(
      await send('member', 'ticket', d, 'ticket.created', { typeId: 'task', projectId: p, parentId: null, title: 'Draft d', start: 'backlog', draft: true }),
    ).toMatchObject({ status: 'committed' });
    const publish = () => read2.app.inject({ method: 'POST', url: `/v1/workspaces/${ws}/drafts/publish`, headers: read2.authOf('member'), payload: { ticketIds: [d] } });
    const head2 = async (id: string) =>
      (await db2.pool.query<{ draft_author_id: string | null; rank: string | null }>('SELECT draft_author_id, rank FROM proj_tickets WHERE ticket_id = $1', [id])).rows[0];

    beforeAtomic = async () => {
      expect(await send('member', 'ticket', u, 'ticket.transitioned', { to: 'todo' })).toMatchObject({ status: 'committed' });
    };
    const refused = await publish();
    expect(refused.statusCode, refused.body).toBe(409);
    // The set is [publish d, rank u (the backfill), rank d]: the refusal is at index 1, past the end of ticketIds.
    expect(refused.json()).toMatchObject({ rule: 'draft.publish-refused', ticketId: u, cause: { rule: 'rank-requires-backlog' } });
    expect(await head2(d)).toEqual({ draft_author_id: read2.userIds.member, rank: null }); // nothing published, nothing ranked

    const ok = await publish(); // CONTROL: u is out of the Backlog now, so it is not read and the set commits
    expect(ok.statusCode, ok.body).toBe(200);
    expect(await head2(d)).toMatchObject({ draft_author_id: null });
    expect((await head2(d))?.rank).not.toBeNull();
    expect((await head2(u))?.rank).toBeNull();
  });
});
