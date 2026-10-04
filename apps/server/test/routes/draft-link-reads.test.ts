import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GRAPH_GROUPS, newUlid, type Ulid } from '@gisik-nokma/domain';
import { describeEvent } from '@gisik-nokma/app-core';
import { mapHistory } from '@gisik-nokma/app-core/online';
import { readGraphRing } from '../../src/read/graph-neighbours.js';
import { runSnapshotPass } from '../../src/sync/snapshot-writer.js';
import { visibleEventsFor } from '../../src/visibility/visible-events-for.js';
import { verifyProjections } from '../../src/tools/verify-projections.js';
import { buildProjectionRegistry } from '../../src/projections/index.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { linkWorld } from '../helpers/draft-link-world.js';
import { buildReadTestApp, type ReadRole, type ReadWorld } from '../helpers/read-app.js';

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

describe('28.115 projection and rebuild', () => {
  it('keys a from-form row by its source, deletes exactly that row, survives the publish under the re-file and rebuilds clean; CONTROL: a plain row is keyed by the entity', async () => {
    const [s, s2, d] = [newUlid(), newUlid(), newUlid()].sort() as [Ulid, Ulid, Ulid]; // s < d: the removal leg below needs S's stream replayed first
    await w.published(s);
    await w.published(s2);
    await w.draft(d);
    expect(await w.fromLink(d, s)).toMatchObject({ status: 'committed' });
    expect(await w.fromLink(d, s, 'relates')).toMatchObject({ status: 'committed' });
    expect(await w.send('member', 'ticket.link_added', d, { kind: 'blocks', targetId: s2 })).toMatchObject({ status: 'committed' }); // CONTROL: plain, d is the source

    const member = read.userIds.member;
    expect((await w.linkRows(d)).map((r) => [r.source_id, r.target_id, r.kind, r.created_by])).toEqual([
      [s, d, 'blocks', member], [s, d, 'relates', member], [d, s2, 'blocks', member],
    ]);
    const before = await w.stateOf('member', d);
    expect(before.ticketState.links).toEqual([
      { kind: 'blocks', targetId: d, from: s }, { kind: 'relates', targetId: d, from: s }, { kind: 'blocks', targetId: s2 },
    ]);

    expect(await w.send('member', 'ticket.link_removed', d, { kind: 'relates', targetId: d, from: s })).toMatchObject({ status: 'committed' });
    expect((await w.linkRows(d)).map((r) => [r.source_id, r.target_id, r.kind])).toEqual([[s, d, 'blocks'], [d, s2, 'blocks']]);

    const plainSeq = (await w.linkRows(d)).find((r) => r.source_id === d)?.seq;
    expect(await w.send('member', 'ticket.published', d, { projectId: w.PROJECT() })).toMatchObject({ status: 'committed' });
    // the row survives and the re-file on S's stream takes it over: its seq and actor, one row per key
    const [refile] = await w.linkEventsOn(s);
    expect(refile?.payload).toEqual({ kind: 'blocks', targetId: d });
    expect((await w.linkRows(d)).map((r) => [r.source_id, r.target_id, r.kind, r.seq, r.created_by])).toEqual([
      [d, s2, 'blocks', plainSeq, member], [s, d, 'blocks', refile?.seq, member],
    ]);
    const after = await w.stateOf('member', d);
    expect(after.ticketState.links).toEqual([{ kind: 'blocks', targetId: s2 }]); // no `from` entry survives
    expect(await verifyProjections({ pool: db.pool, projections: buildProjectionRegistry() })).toEqual({ clean: true, diffs: [] });

    // Removed after the publish: the rebuild replays stream by stream (`readLedger`), S's first here, so D's from-form
    // add comes AFTER S's removal and must not bring the row back. Precondition pinned, or the leg passes either way.
    const order = await db.pool.query<{ entity_id: string }>(
      'SELECT DISTINCT entity_kind, entity_id FROM events WHERE entity_id = ANY($1) ORDER BY entity_kind, entity_id',
      [[s, d]],
    );
    expect(order.rows.map((r) => r.entity_id)).toEqual([s, d]);
    expect(await w.send('owner', 'ticket.link_removed', s, { kind: 'blocks', targetId: d })).toMatchObject({ status: 'committed' });
    expect((await w.linkRows(d)).map((r) => [r.source_id, r.target_id, r.kind])).toEqual([[d, s2, 'blocks']]);
    expect(await verifyProjections({ pool: db.pool, projections: buildProjectionRegistry() })).toEqual({ clean: true, diffs: [] });
  });
});

type LinksBody = { links: Array<{ kind: string; direction: string; ticket: { id: string; key: string | null; title: string } }> };
const shape = (b: LinksBody) => {
  expect(Object.keys(b)).toEqual(['links']); // a not-found or error body fails HERE, as an assertion
  return b.links.map((l) => [l.kind, l.direction, l.ticket.id]);
};

describe('28.117 the links read on a draft', () => {
  it('shows the author both directions, hides it from everyone else byte-identically, and keeps draft ends off a published sheet; CONTROL: after publish both sheets list it', async () => {
    const [s, s2, d, d2] = [newUlid(), newUlid(), newUlid(), newUlid()];
    await w.published(s);
    await w.published(s2);
    await w.draft(d);
    await w.draft(d2);
    await w.fromLink(d, s, 'blocks');
    await w.send('member', 'ticket.link_added', d, { kind: 'relates', targetId: s2 });
    await w.send('member', 'ticket.link_added', d, { kind: 'relates', targetId: d2 });

    const mine = (await w.links('member', d)).json() as LinksBody;
    expect(shape(mine).sort()).toEqual([['blocks', 'in', s], ['relates', 'out', d2], ['relates', 'out', s2]].sort());
    expect(mine.links.find((l) => l.ticket.id === d2)?.ticket.key).toBeNull(); // a draft has no key
    expect(mine.links.find((l) => l.ticket.id === s)?.ticket.key).toMatch(/-\d+$/);
    expect(Object.keys(mine)).toEqual(['links']);

    const unknown = await w.links('owner', newUlid());
    expect(unknown.statusCode).toBe(404);
    for (const role of ['owner', 'admin', 'projectLead', 'guest'] as const) {
      const res = await w.links(role, d);
      expect(res.statusCode, role).toBe(404);
      expect(res.json(), role).toEqual(unknown.json()); // byte-identical to an id that never existed
    }

    // the published sheets never list the draft end, for the owner or for the author
    for (const role of ['owner', 'member'] as const) {
      expect(((await w.links(role, s)).json() as LinksBody).links, role).toEqual([]);
      expect(((await w.links(role, s2)).json() as LinksBody).links, role).toEqual([]);
    }

    // p11 N10 (28.117): a TRASHED source drops off the draft's own sheet; restored, it is back
    const withoutS = [['relates', 'out', d2], ['relates', 'out', s2]].sort();
    expect(await w.send('owner', 'ticket.deleted', s, {})).toMatchObject({ status: 'committed' });
    expect(shape((await w.links('member', d)).json() as LinksBody).sort()).toEqual(withoutS);
    expect(await w.send('owner', 'ticket.restored', s, {})).toMatchObject({ status: 'committed' });
    // p11 N11 (28.117): a source HIDDEN from the author drops off the draft's own sheet; unhidden, it is back
    await w.send('owner', 'visibility.set', s, { ticketId: s, mode: 'explicit', userIds: [read.userIds.owner] });
    expect(shape((await w.links('member', d)).json() as LinksBody).sort()).toEqual(withoutS);
    await w.send('owner', 'visibility.set', s, { ticketId: s, mode: 'inherit' });
    expect(shape((await w.links('member', d)).json() as LinksBody).sort()).toEqual([['blocks', 'in', s], ...withoutS].sort()); // CONTROL

    expect(await w.send('member', 'ticket.published', d, { projectId: w.PROJECT() })).toMatchObject({ status: 'committed' });
    expect(shape((await w.links('owner', s)).json() as LinksBody)).toEqual([['blocks', 'out', d]]); // CONTROL
    expect(shape((await w.links('owner', d)).json() as LinksBody).sort()).toEqual([['blocks', 'in', s], ['relates', 'out', s2]].sort());
  });

  // Planner ruling 17:19, legs (2) and (3): the rows exist (R42), so the owner's "no trace" rule is kept by every
  // READER of them. The KG ring has no own-draft allowance, so the author's ring read of S shows no D either.
  it('keeps every draft end off the graph ring and off T\'s sheet for everyone; CONTROL: a published twin edge on the same centre is returned', async () => {
    const [s, s2, t, d] = [newUlid(), newUlid(), newUlid(), newUlid()];
    await w.published(s);
    await w.published(s2);
    await w.published(t);
    await w.draft(d);
    expect(await w.fromLink(d, s, 'blocks')).toMatchObject({ status: 'committed' }); // S blocks D, filed on D's stream
    expect(await w.send('member', 'ticket.link_added', d, { kind: 'relates', targetId: t })).toMatchObject({ status: 'committed' }); // plain, on D's stream
    expect(await w.send('owner', 'ticket.link_added', s2, { kind: 'relates', targetId: s })).toMatchObject({ status: 'committed' }); // the twins
    expect(await w.send('owner', 'ticket.link_added', s2, { kind: 'blocks', targetId: t })).toMatchObject({ status: 'committed' });
    expect(await w.linkRows(d)).toHaveLength(2); // the rows are there: only the readers can hide them

    const ring = (viewer: string, centre: string) =>
      readGraphRing(db.pool, viewer, {
        center: { kind: 'ticket', id: centre }, hops: 1, workspaceIds: [w.WS()], projectIds: [], groups: new Set(GRAPH_GROUPS), offset: 0,
      });
    const { owner, admin, member } = read.userIds;
    for (const [name, viewer, centre] of [['owner S', owner, s], ['owner T', owner, t], ['admin S', admin, s], ['admin T', admin, t], ['author S', member, s]] as const) {
      const r = await ring(viewer, centre);
      expect(r?.items.map((i) => i.id), name).toContain(s2); // CONTROL: the read returns a published edge
      expect(r?.edges.filter((e) => ['blocks', 'relates'].includes(e.kind) && (e.from.endsWith(s2) || e.to.endsWith(s2))), name).toHaveLength(1);
      expect(JSON.stringify(r), name).not.toContain(d);
    }
    for (const role of ['owner', 'admin', 'member'] as const) {
      const sheet = (await w.links(role, t)).json() as LinksBody;
      expect(shape(sheet), role).toEqual([['blocks', 'in', s2]]); // CONTROL in the same read
      expect(JSON.stringify(sheet), role).not.toContain(d);
    }
  });
});

describe('28.118 the detail read', () => {
  it('serves the author\'s draft its entries, filters by the other end, and shows a published sheet nothing; CONTROL: publish moves the link to S', async () => {
    const [s, d] = [newUlid(), newUlid()];
    await w.published(s);
    await w.draft(d);
    await w.fromLink(d, s);
    expect((await w.stateOf('member', d)).ticketState.links).toEqual([{ kind: 'blocks', targetId: d, from: s }]);
    for (const role of ['owner', 'member'] as const) {
      expect((await w.stateOf(role, s)).ticketState.links, role).toBeUndefined();
      expect('links' in (await w.stateOf(role, s)).ticketState, role).toBe(false);
    }
    expect((await w.detail('owner', d)).statusCode).toBe(404);

    // the author loses sight of S: the from entry is dropped from THEIR read of the draft
    await w.send('owner', 'visibility.set', s, { ticketId: s, mode: 'explicit', userIds: [read.userIds.owner] });
    expect((await w.stateOf('member', d)).ticketState.links).toBeUndefined();
    await w.send('owner', 'visibility.set', s, { ticketId: s, mode: 'inherit' });
    expect((await w.stateOf('member', d)).ticketState.links).toEqual([{ kind: 'blocks', targetId: d, from: s }]); // CONTROL

    expect(await w.send('member', 'ticket.published', d, { projectId: w.PROJECT() })).toMatchObject({ status: 'committed' });
    expect((await w.stateOf('member', d)).ticketState.links).toBeUndefined();
    expect((await w.stateOf('owner', s)).ticketState.links).toEqual([{ kind: 'blocks', targetId: d }]);
  });
});

describe('28.105 events and History hide a link to a draft', () => {
  it('carry nothing of D while the link is on D\'s stream, and carry the plain link after publish; CONTROL: the count did not move when the link was filed', async () => {
    const [s, d] = [newUlid(), newUlid()];
    await w.published(s);
    await w.draft(d);
    const eventsOf = async (role: 'owner' | 'member') => (await w.get(role, `/tickets/${s}/events`)).body;
    const historyOf = async (role: 'owner' | 'member') =>
      (await read.app.inject({ method: 'GET', url: `/v1/tickets/${s}/history`, headers: read.authOf(role) })).json() as { events: Array<{ type: string; payload: unknown }> };
    const countBefore = (await historyOf('owner')).events.length;

    await w.fromLink(d, s);
    for (const role of ['owner', 'member'] as const) {
      const events = await eventsOf(role);
      expect(events, role).not.toContain(d);
      expect(events, role).not.toContain('ticket.link_added');
      const history = await historyOf(role);
      expect(history.events.length, role).toBe(countBefore); // CONTROL
      expect(JSON.stringify(history), role).not.toContain(d);
    }

    expect(await w.send('member', 'ticket.published', d, { projectId: w.PROJECT() })).toMatchObject({ status: 'committed' });
    const shown = await eventsOf('owner');
    expect(shown).toContain('ticket.link_added');
    expect(shown).toContain(d);
    const key = (await w.stateOf('owner', d)).key;
    expect(key).toMatch(/-\d+$/); // else `{ key: null }` would equal a linkTarget that lost its key
    const line = (await historyOf('owner')).events.find((e) => e.type === 'ticket.link_added') as { linkTarget?: { key: string | null } } | undefined;
    expect(line?.linkTarget).toEqual({ key });
  });
});

type BootTicket = { ticketId: string; snapshot: { seq: number; state: { links?: unknown } } | null; events: Array<{ type: string; payload: unknown }> };
/** Both bootstrap doors' entry for one ticket, as `role` is served it (`undefined` when the door does not list it). */
async function bootEntries(role: ReadRole, id: string): Promise<Array<[string, BootTicket | undefined]>> {
  const get = (url: string) => read.app.inject({ method: 'GET', url, headers: read.authOf(role) });
  const workspace = ((await get(`/v1/sync/bootstrap?workspaceId=${w.WS()}`)).json() as { tickets: BootTicket[] }).tickets.find((t) => t.ticketId === id);
  const one = await get(`/v1/sync/bootstrap/ticket?workspaceId=${w.WS()}&ticketId=${id}`);
  return [['workspace', workspace], ['per-ticket', one.statusCode === 200 ? (one.json() as { ticket: BootTicket }).ticket : undefined]];
}
/** Every stream item on `id` that `role`'s devices are served from the start. */
async function streamOn(role: ReadRole, id: string): Promise<unknown[]> {
  const out: unknown[] = [];
  for await (const item of visibleEventsFor(db.pool, read.userIds[role], w.WS(), 0)) {
    if ('entity' in item && item.entity.id === id) out.push(item);
  }
  return out;
}
const hideFromAllButOwner = (id: string) => w.send('owner', 'visibility.set', id, { ticketId: id, mode: 'explicit', userIds: [read.userIds.owner] });

describe('28.119 the bootstrap and the doors that serve a stored link (KG->WG sync 4: K3, planner Q-B)', () => {
  it('withholds from the author\'s bootstrap of D every end they can no longer see, in the snapshot and the tail; CONTROL: before, D carries both, and the owner is served T', async () => {
    const [s, t, d] = [newUlid(), newUlid(), newUlid()];
    await w.published(s);
    await w.published(t);
    await w.draft(d);
    expect(await w.fromLink(d, s)).toMatchObject({ status: 'committed' }); // S blocks D, filed on D's stream
    expect(await w.send('member', 'ticket.link_added', d, { kind: 'relates', targetId: t })).toMatchObject({ status: 'committed' }); // D relates T
    await runSnapshotPass(db.pool, { minEvents: 1 });
    // one more of each AFTER the snapshot, so the tail names S and T too
    expect(await w.fromLink(d, s, 'relates')).toMatchObject({ status: 'committed' });
    expect(await w.send('member', 'ticket.link_added', d, { kind: 'blocks', targetId: t })).toMatchObject({ status: 'committed' });
    const tailLinks = (b: BootTicket) => b.events.filter((e) => e.type === 'ticket.link_added').map((e) => e.payload);

    for (const [door, entry] of await bootEntries('member', d)) {
      expect(entry?.snapshot, door).not.toBeNull(); // precondition: D's first two links are in a snapshot
      expect(entry!.snapshot!.state.links, door).toEqual([{ kind: 'blocks', targetId: d, from: s }, { kind: 'relates', targetId: t }]); // CONTROL
      expect(tailLinks(entry!), door).toEqual([{ kind: 'relates', targetId: d, from: s }, { kind: 'blocks', targetId: t }]); // CONTROL
    }

    for (const x of [s, t]) expect(await hideFromAllButOwner(x)).toMatchObject({ status: 'committed' });
    for (const [door, entry] of await bootEntries('member', d)) {
      expect(entry, door).toBeDefined(); // the author still opens D
      expect(entry!.snapshot!.state, door).not.toHaveProperty('links');
      // the from-form keeps its direction and loses its id (planner ruling 2026-10-04 21:08, 28.196); the plain link keeps TL4b's shape
      expect(tailLinks(entry!), door).toEqual([{ kind: 'relates', targetId: null, from: null }, { kind: 'blocks', targetId: null }]);
      expect(JSON.stringify(entry), door).not.toContain(s);
      expect(JSON.stringify(entry), door).not.toContain(t);
    }
    // CONTROL: the owner, who still sees T, is served T's own entry, and never D
    const ownerT = (await bootEntries('owner', t)).map(([, e]) => e?.ticketId);
    expect(ownerT).toEqual([t, t]);
    expect((await bootEntries('owner', d)).map(([, e]) => e)).toEqual([undefined, undefined]);
  });

  it('publishes D1 alone while it links D2: no other viewer is served a D2 id on /events, the detail, either bootstrap or the stream; CONTROL: the author is served D2 on each', async () => {
    const [d1, d2] = [newUlid(), newUlid()];
    await w.draft(d1);
    await w.draft(d2);
    // a link between two drafts: plain, on the SOURCE draft's stream
    expect(await w.send('member', 'ticket.link_added', d1, { kind: 'blocks', targetId: d2 })).toMatchObject({ status: 'committed' });
    expect(await w.send('member', 'ticket.published', d1, { projectId: w.PROJECT() })).toMatchObject({ status: 'committed' });

    type Served = { events: string; link: unknown; links: unknown; boot: string; stream: string };
    const servedTo = async (role: ReadRole): Promise<Served> => {
      const events = (await w.get(role, `/tickets/${d1}/events`)).json() as { events: Array<{ type: string; payload: unknown }> };
      const boot = await bootEntries(role, d1);
      for (const [door, entry] of boot) expect(entry?.ticketId, `${role} ${door}`).toBe(d1); // precondition: D1 is published, every door lists it
      return {
        events: JSON.stringify(events),
        link: events.events.find((e) => e.type === 'ticket.link_added')?.payload,
        links: (await w.stateOf(role, d1)).ticketState.links,
        boot: JSON.stringify(boot),
        stream: JSON.stringify(await streamOn(role, d1)),
      };
    };

    const author = await servedTo('member'); // CONTROL: the author's own openable draft is served in full
    expect(author.link).toEqual({ kind: 'blocks', targetId: d2 });
    expect(author.links).toEqual([{ kind: 'blocks', targetId: d2 }]);
    expect(author.boot).toContain(d2);
    expect(author.stream).toContain(d2);

    for (const role of ['owner', 'admin', 'projectLead'] as const) {
      const other = await servedTo(role);
      expect(other.link, role).toEqual({ kind: 'blocks', targetId: null });
      expect(other.links, role).toBeUndefined();
      for (const body of [other.events, other.boot, other.stream]) expect(body, role).not.toContain(d2);
    }
  });
});

describe("28.196 a published draft's History reads its from-form links from its own side (D6 FIX 1)", () => {
  it("names S on D's line and reads it in, \"Linked: is blocked by <S key>\"; a viewer who sees D but not S is served {kind, targetId: null, from: null} and reads \"Linked: is blocked by a ticket you can't see\"; CONTROL: S's re-file reads \"Linked: blocks <D key>\", and the owner keeps S's key", async () => {
    const [s, d] = [newUlid(), newUlid()];
    await w.published(s);
    await w.draft(d);
    expect(await w.fromLink(d, s)).toMatchObject({ status: 'committed' }); // S blocks D, filed on D's stream
    expect(await w.send('member', 'ticket.published', d, { projectId: w.PROJECT() })).toMatchObject({ status: 'committed' });
    const [sKey, dKey] = [(await w.stateOf('owner', s)).key, (await w.stateOf('owner', d)).key];
    expect(sKey).toMatch(/-\d+$/); // precondition: both carry a real key, and the two differ,
    expect(dKey).toMatch(/-\d+$/);
    expect(sKey).not.toBe(dKey); // so a line naming D cannot pass for one naming S
    const linkLine = async (role: ReadRole, id: string) => {
      const res = await read.app.inject({ method: 'GET', url: `/v1/tickets/${id}/history`, headers: read.authOf(role) });
      expect(res.statusCode, `${role} ${id}`).toBe(200);
      const lines = mapHistory(res.json()).filter((e) => e.type === 'ticket.link_added');
      expect(lines, `${role} ${id}`).toHaveLength(1);
      return lines[0]!;
    };

    const ownerD = await linkLine('owner', d);
    expect(describeEvent(ownerD)).toBe(`Linked: is blocked by ${sKey}`);
    expect([ownerD.linkTarget, ownerD.linkDirection]).toEqual([{ key: sKey }, 'in']);
    expect(ownerD.payload).toEqual({ kind: 'blocks', targetId: d, from: s }); // the stored from-form, served whole to a viewer of S
    const ownerS = await linkLine('owner', s); // CONTROL: S's re-file, read out from S
    expect(describeEvent(ownerS)).toBe(`Linked: blocks ${dKey}`);
    expect([ownerS.linkTarget, ownerS.linkDirection]).toEqual([{ key: dKey }, 'out']);

    expect(await hideFromAllButOwner(s)).toMatchObject({ status: 'committed' });
    const hidden = await linkLine('member', d); // the member still sees the published D, and no longer S
    expect(describeEvent(hidden)).toBe("Linked: is blocked by a ticket you can't see");
    expect(hidden.payload).toEqual({ kind: 'blocks', targetId: null, from: null }); // the direction kept, S's id never served
    expect([hidden.linkTarget, hidden.linkDirection]).toEqual([null, 'in']);
    expect(JSON.stringify(hidden)).not.toContain(s);
    expect(describeEvent(await linkLine('owner', d))).toBe(`Linked: is blocked by ${sKey}`); // CONTROL: the owner still sees S
  });
});
