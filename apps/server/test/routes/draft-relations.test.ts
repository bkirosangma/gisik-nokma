import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid } from '@gisik-nokma/domain';
import { DRAFT_LINK_REFILE_REFUSED_RULE } from '../../src/ingest/ingest-service.js';
import { LINK_TARGET_NOT_VISIBLE_REASON, PERMISSION_VISIBILITY_RULE } from '../../src/permissions/check-permission.js';
import { verifyProjections } from '../../src/tools/verify-projections.js';
import { buildProjectionRegistry } from '../../src/projections/index.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { linkWorld } from '../helpers/draft-link-world.js';
import { buildReadTestApp, type ReadRole, type ReadWorld } from '../helpers/read-app.js';

/**
 * 28.128 (server half) and 28.129 (drafts T6 Step 5a, spec R3, R4, R32, R35, owner ruling O1): a published ticket
 * shows no parent or child, link or count from a draft until it is published, and a discard leaves none.
 */
let db: TestDatabase;
let read: ReadWorld;
let w: ReturnType<typeof linkWorld>;
beforeAll(async () => {
  db = await createTestDatabase();
  read = await buildReadTestApp(db);
  w = linkWorld(read, db);
}, 120_000);
afterAll(async () => {
  await read.app.close();
  await db.drop();
});

const committed = { status: 'committed' };
/** A published epic (P) and a published task under it (C), both the owner's. */
async function family(p: string, c: string): Promise<void> {
  expect(await w.send('owner', 'ticket.created', p, { typeId: 'epic', projectId: w.PROJECT(), parentId: null, title: `Real ${p.slice(-4)}` })).toMatchObject(committed);
  expect(await w.send('owner', 'ticket.created', c, { typeId: 'task', projectId: w.PROJECT(), parentId: p, title: `Real ${c.slice(-4)}` })).toMatchObject(committed);
}
/** The member's draft EPIC (a task cannot hold a task: the read world's ranks are epic 1, task 3). */
const draftEpic = async (d: string): Promise<void> => {
  expect(
    await w.send('member', 'ticket.created', d, {
      typeId: 'epic', projectId: w.PROJECT(), parentId: null, title: `Quokka ${d.slice(-4)}`, start: 'backlog', draft: true,
    }),
  ).toMatchObject(committed);
};
const hold = (d: string, c: string) => w.send('member', 'ticket.reparented', d, { newParentId: d, childId: c });
const publish = (d: string) => w.send('member', 'ticket.published', d, { projectId: w.PROJECT() });

/** Everything a reader or a rebuild could see of these tickets: streams, head rows, rollups, links, detail bodies. */
async function footprint(ids: string[]) {
  const q = async (sql: string) => (await db.pool.query(sql, [ids])).rows;
  const bodies: Record<string, unknown> = {};
  for (const role of ['owner', 'member'] as ReadRole[]) {
    for (const id of ids) bodies[`${role}:${id}`] = (await w.detail(role, id)).json();
  }
  return {
    events: await q('SELECT id, entity_id, type, payload FROM events WHERE entity_id = ANY($1) ORDER BY workspace_seq'),
    tickets: await q('SELECT * FROM proj_tickets WHERE ticket_id = ANY($1) ORDER BY ticket_id'),
    rollups: await q('SELECT * FROM proj_rollups WHERE parent_ticket_id = ANY($1) ORDER BY parent_ticket_id'),
    links: await q('SELECT * FROM proj_ticket_links WHERE source_id = ANY($1) OR target_id = ANY($1) ORDER BY seq'),
    bodies,
  };
}

describe('28.128 a published child under a draft parent (owner ruling O1)', () => {
  it('holds C on D only, leaves C and its parent untouched for every reader, and moves C under D on publish', async () => {
    const [p, c, d] = [newUlid(), newUlid(), newUlid()];
    await family(p, c);
    await draftEpic(d);
    const before = await footprint([p, c]); // BEFORE the draft-side filing: a later snapshot would hold the leak

    // p11 N17 (28.128): the childId form folds into D's pendingChildren and leaves C's parent and D's own alone
    expect(await hold(d, c)).toMatchObject(committed);
    const dState = (await w.stateOf('member', d)).ticketState as Record<string, unknown>;
    expect(dState['pendingChildren']).toEqual([c]); // the positive half: the author's D lists C under it
    expect(dState['parentId'] ?? null).toBeNull(); // D was born with parentId: null
    expect(await footprint([p, c])).toEqual(before);
    expect((await db.pool.query('SELECT parent_id FROM proj_tickets WHERE ticket_id = $1', [c])).rows[0].parent_id).toBe(p);

    expect(await publish(d)).toMatchObject(committed);
    const publishSeq = (await db.pool.query(`SELECT workspace_seq::int AS seq FROM events WHERE type = 'ticket.published' AND entity_id = $1`, [d])).rows[0].seq;
    const { rows: moved } = await db.pool.query(
      `SELECT type, payload, actor_id, origin, workspace_seq::int AS seq FROM events WHERE entity_id = $1 AND workspace_seq > $2 ORDER BY workspace_seq`,
      [c, publishSeq - 1],
    );
    expect(moved).toEqual([
      { type: 'ticket.reparented', payload: { newParentId: d }, actor_id: read.userIds.member, origin: 'web', seq: publishSeq + 1 },
    ]);
    expect((await db.pool.query('SELECT parent_id FROM proj_tickets WHERE ticket_id = $1', [c])).rows[0].parent_id).toBe(d);
    expect('pendingChildren' in (await w.stateOf('member', d)).ticketState).toBe(false);
    expect(await verifyProjections({ pool: db.pool, projections: buildProjectionRegistry() })).toEqual({ clean: true, diffs: [] });
  });

  it('refuses the publish naming C when C cannot be moved, with nothing committed; CONTROL: once C can move, the same publish succeeds', async () => {
    const [p, c, d] = [newUlid(), newUlid(), newUlid()];
    await family(p, c);
    await draftEpic(d);
    expect(await hold(d, c)).toMatchObject(committed);

    // p11 N15 (28.128): C is trashed and the publisher still sees it (canSee has no trash test): named by title
    expect(await w.send('owner', 'ticket.deleted', c, {})).toMatchObject(committed);
    expect(await publish(d)).toMatchObject({
      status: 'refused',
      rule: DRAFT_LINK_REFILE_REFUSED_RULE,
      reason: `The ticket "Real ${c.slice(-4)}" could not be moved under this draft: This ticket is deleted; restore it first.`,
    });
    expect(await w.publishedRows([d])).toBe(0);
    expect(await w.stillDrafts([d])).toBe(1);
    expect(await w.send('owner', 'ticket.restored', c, {})).toMatchObject(committed);

    // C hidden from the publisher: no longer reparentable by them, and not named
    expect(await w.send('owner', 'visibility.set', c, { ticketId: c, mode: 'explicit', userIds: [read.userIds.owner] })).toMatchObject(committed);
    expect(await publish(d)).toMatchObject({
      status: 'refused',
      rule: DRAFT_LINK_REFILE_REFUSED_RULE,
      reason: 'A ticket you can no longer see could not be moved under this draft: This ticket is not visible to you.',
    });
    expect((await db.pool.query(`SELECT 1 FROM events WHERE entity_id = $1 AND type = 'ticket.reparented'`, [c])).rows).toHaveLength(0);
    expect(await w.send('owner', 'visibility.set', c, { ticketId: c, mode: 'inherit' })).toMatchObject(committed);

    expect(await publish(d)).toMatchObject(committed); // CONTROL
    expect((await db.pool.query('SELECT parent_id FROM proj_tickets WHERE ticket_id = $1', [c])).rows[0].parent_id).toBe(d);
  });
  it('refuses holding a child the author cannot open at the gate, in a link\'s words; the author\'s own draft passes the gate and the engine refuses it', async () => {
    const [p, c, d, mine, theirs] = [newUlid(), newUlid(), newUlid(), newUlid(), newUlid()];
    await family(p, c);
    await draftEpic(d);
    await draftEpic(mine);
    expect(
      await w.send('owner', 'ticket.created', theirs, {
        typeId: 'task', projectId: w.PROJECT(), parentId: null, title: `Owner draft ${theirs.slice(-4)}`, start: 'backlog', draft: true,
      }),
    ).toMatchObject(committed);
    const notVisible = { status: 'refused', rule: PERMISSION_VISIBILITY_RULE, reason: LINK_TARGET_NOT_VISIBLE_REASON };
    expect(LINK_TARGET_NOT_VISIBLE_REASON).toBe('The other ticket does not exist in this workspace, or you cannot see it.');

    // C hidden from the author: the engine reads every ticket and would hold it, so only the gate refuses this
    expect(await w.send('owner', 'visibility.set', c, { ticketId: c, mode: 'explicit', userIds: [read.userIds.owner] })).toMatchObject(committed);
    expect(await hold(d, c)).toMatchObject(notVisible);
    // another person's draft reads exactly like a ticket that does not exist
    expect(await hold(d, theirs)).toMatchObject(notVisible);
    // the author's own draft is openable (canOpen, not canSee): the gate lets it through and the engine says no
    expect(await hold(d, mine)).toMatchObject({
      status: 'refused', rule: 'hierarchy.unknown-parent', reason: 'The chosen parent ticket does not exist in this workspace.',
    });
    expect((await w.stateOf('member', d)).ticketState).not.toHaveProperty('pendingChildren');

    // CONTROL: C visible again, the same hold is committed
    expect(await w.send('owner', 'visibility.set', c, { ticketId: c, mode: 'inherit' })).toMatchObject(committed);
    expect(await hold(d, c)).toMatchObject(committed);
    expect(((await w.stateOf('member', d)).ticketState as Record<string, unknown>)['pendingChildren']).toEqual([c]);
  });
});

describe('28.129 a discard leaves no trace on the other ticket', () => {
  it('leaves C, S, S2 and P exactly as before the drafts existed; CONTROL: before the discard the author\'s D lists C and both links', async () => {
    const [p, c, s, s2, d, x] = [newUlid(), newUlid(), newUlid(), newUlid(), newUlid(), newUlid()];
    await family(p, c);
    await w.published(s);
    await w.published(s2);
    const before = await footprint([p, c, s, s2]);

    await draftEpic(d);
    expect(await hold(d, c)).toMatchObject(committed);
    expect(await w.fromLink(d, s, 'blocks')).toMatchObject(committed);
    expect(await w.fromLink(d, s2, 'relates')).toMatchObject(committed);
    expect(
      await w.send('member', 'ticket.created', x, {
        typeId: 'task', projectId: w.PROJECT(), parentId: p, title: `Quokka ${x.slice(-4)}`, start: 'backlog', draft: true,
      }),
    ).toMatchObject(committed);
    const dState = (await w.stateOf('member', d)).ticketState as Record<string, unknown>;
    expect(dState['pendingChildren']).toEqual([c]); // CONTROL
    expect(dState['links']).toEqual([{ kind: 'blocks', targetId: d, from: s }, { kind: 'relates', targetId: d, from: s2 }]); // CONTROL

    for (const draft of [d, x]) expect(await w.send('member', 'ticket.discarded', draft, {})).toMatchObject(committed);
    const erased = async () => (await db.pool.query(`SELECT 1 FROM purged_entities WHERE entity_id = ANY($1)`, [[d, x]])).rows.length;
    await expect.poll(erased, { timeout: 10_000 }).toBe(2);

    expect(await footprint([p, c, s, s2])).toEqual(before);
    expect((await db.pool.query(`SELECT 1 FROM purged_entities WHERE entity_id = $1`, [c])).rows).toHaveLength(0); // C is not erased
    expect(await verifyProjections({ pool: db.pool, projections: buildProjectionRegistry() })).toEqual({ clean: true, diffs: [] });
  });
});
