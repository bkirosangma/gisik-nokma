/**
 * The viewer's own person node (planner ruling 2026-10-06, KG release blocker P2-3), cases 27.690–27.693
 * (`test-cases/27-knowledge-graph.md`, under `<!-- KG-C T6 -->`): Home's "Start from: Me" asks the ring read
 * (`src/read/graph-neighbours.ts`) for `person:<own id>`, and a viewer no names read names was answered 404. The person
 * arm of `resolve` now falls back to the viewer's own label (`readOwnName`, `src/routes/builder-reads.ts`), for the
 * viewer's own node and no other.
 *
 * ## Who is named, in this world
 *
 * Every read-world role signs in by PHONE. The owner, the member and the guest are given a real name and address
 * (`beforeAll`), as the walk's people had. The guest is on no ticket as an assignee or an actor, so
 * `readActorNamesForGuest` names the owner (an actor on every seeded ticket) and NOT the guest: the fallback is what
 * draws them (asserted in 27.690). The admin and the project lead stay phone users, whom no names read labels (FD3).
 *
 * ## The guest's items
 *
 * GT1 (a ticket) and GN1 (a note) are listed for the guest and mention her: the two items her ring may hold. H1–H5 also
 * mention her and she cannot open any of them: H1 a ticket she is not listed on, H2 such a ticket's COMMENT, H3 a
 * workspace note, H4 a ticket listed for her and then deleted, H5 a ticket of a workspace she is not in, listed for her.
 * Links and references are written straight into the migrated tables, as `./neighbours.test.ts` does (its header).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { graphRef, newUlid, type GraphRingResponse, type LedgerEvent } from '@gisik-nokma/domain';
import { readActorNames, readActorNamesForGuest } from '../../src/routes/builder-reads.js';
import { READ_NOT_FOUND_BODY, requireMember } from '../../src/read/membership.js';
import { applyCommitted, makeCommitted } from '../helpers/apply.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { buildReadTestApp, type ReadRole, type ReadWorld } from '../helpers/read-app.js';

let db: TestDatabase;
let read: ReadWorld;
const NAMES = { owner: 'Kiro Sangma', member: 'Mira Marak', guest: 'Gita Guest' } as const;
/** The read world's phone users' names: `auth.ts`'s `getTempName` is the phone itself (`helpers/read-app.ts` PHONES). */
const PHONE_NAMES = { admin: '+911111111107', projectLead: '+911111111108' } as const;
const NOT_FOUND = '{"error":"not_found"}';
const ids = { GT1: '', GN1: '', H1: '', H2: '', H3: '', H4: '', H5: '', PX: '' };

const w = () => read.world;
const ws = () => read.world.workspaceId;
const P = (id: string) => graphRef('person', id);
const T = (id: string) => graphRef('ticket', id);
const N = (id: string) => graphRef('note', id);

async function reference(workspaceId: string, source: { kind: 'ticket' | 'comment' | 'note'; id: string; parentKind: 'ticket' | 'note'; parentId: string }, personId: string): Promise<void> {
  // columns: B's migration, apps/server/migrations/1791500000000_proj-references.sql:15-29
  await db.pool.query(
    `INSERT INTO proj_references (workspace_id, source_kind, source_id, source_parent_kind, source_parent_id, target_kind, target_id, ordinal, snippet, updated_by, updated_at, seq)
     VALUES ($1, $2, $3, $4, $5, 'person', $6, 0, 'ask [[@her]]', $7, '2026-10-01T06:00:00Z', 1)`,
    [workspaceId, source.kind, source.id, source.parentKind, source.parentId, personId, w().owner],
  );
}
const mentionFromTicket = (id: string, personId: string, workspaceId = ws()) => reference(workspaceId, { kind: 'ticket', id, parentKind: 'ticket', parentId: id }, personId);

beforeAll(async () => {
  db = await createTestDatabase();
  read = await buildReadTestApp(db);
  for (const role of ['owner', 'member', 'guest'] as const) {
    await db.pool.query('UPDATE "user" SET name = $1, email = $2 WHERE id = $3', [NAMES[role], `${role}@kg-self.test`, read.userIds[role]]);
  }
  for (const key of Object.keys(ids) as (keyof typeof ids)[]) ids[key] = newUlid();
  const base = { workspaceId: ws(), actorId: w().owner };
  const created = (id: string, title: string) =>
    makeCommitted({ ...base, entity: { kind: 'ticket', id }, type: 'ticket.created', payload: { typeId: 'task', projectId: w().projectId, parentId: null, title } });
  const listed = (id: string, userIds: string[], on = base) =>
    makeCommitted({ ...on, entity: { kind: 'ticket', id }, type: 'visibility.set', payload: { ticketId: id, mode: 'explicit', userIds } });
  const noted = (id: string, title: string, scope: object) =>
    makeCommitted({ ...base, entity: { kind: 'note', id }, type: 'note.created', payload: { title, homeProjectId: w().projectId, scope } });
  const events: LedgerEvent[] = [
    created(ids.GT1, 'Listed for the guest'),
    listed(ids.GT1, [w().guest]),
    noted(ids.GN1, 'A note listed for the guest', { mode: 'explicit', userIds: [w().guest] }),
    created(ids.H1, 'Not listed for the guest'),
    created(ids.H2, 'Its comment mentions the guest'),
    noted(ids.H3, 'A workspace note', { mode: 'workspace' }),
    created(ids.H4, 'Listed for the guest, then deleted'),
    listed(ids.H4, [w().guest]),
    makeCommitted({ ...base, entity: { kind: 'ticket', id: ids.H4 }, type: 'ticket.deleted', payload: {} }),
    created(ids.PX, 'Mentions the phone admin'),
  ];
  await applyCommitted(db.pool, events);
  // H5 is the neighbour workspace's own ticket, listed for the guest there, a workspace the guest is not in.
  ids.H5 = read.neighbour.ticketId;
  await applyCommitted(db.pool, [listed(ids.H5, [w().guest], { workspaceId: read.neighbour.workspaceId, actorId: read.userIds.neighbour })]);

  await mentionFromTicket(ids.GT1, w().guest);
  await reference(ws(), { kind: 'note', id: ids.GN1, parentKind: 'note', parentId: ids.GN1 }, w().guest);
  await mentionFromTicket(ids.H1, w().guest);
  await reference(ws(), { kind: 'comment', id: newUlid(), parentKind: 'ticket', parentId: ids.H2 }, w().guest);
  await reference(ws(), { kind: 'note', id: ids.H3, parentKind: 'note', parentId: ids.H3 }, w().guest);
  await mentionFromTicket(ids.H4, w().guest);
  await mentionFromTicket(ids.H5, w().guest, read.neighbour.workspaceId);
  await mentionFromTicket(ids.PX, read.userIds.admin);
  // A link the GUEST added, between two tickets she can open (27.692's addedBy leg).
  // columns: A's migration, apps/server/migrations/1791700000000_proj-ticket-links.sql:7-16
  await db.pool.query(
    `INSERT INTO proj_ticket_links (workspace_id, source_id, target_id, kind, created_by, created_at, origin, seq) VALUES ($1, $2, $3, 'relates', $4, '2026-10-01T05:00:00Z', 'web', 1)`,
    [ws(), ids.GT1, w().guestTaskId, w().guest],
  );
}, 600_000);
afterAll(async () => {
  await read.app.close();
  await db.drop();
});

type Answer = { status: number; body: GraphRingResponse; raw: string; type: string | undefined };
async function get(role: ReadRole, url: string): Promise<Answer> {
  const res = await read.app.inject({ method: 'GET', url, headers: read.authOf(role) });
  return { status: res.statusCode, body: res.json(), raw: res.body, type: res.headers['content-type'] as string | undefined };
}
function ring(role: ReadRole, center: string, hops = '1', groups: string | undefined = 'people', workspaces = ws()): Promise<Answer> {
  const q = new URLSearchParams({ center, hops, ws: workspaces, ...(groups === undefined ? {} : { groups }) });
  return get(role, `/v1/graph/neighbours?${q}`);
}
const refsOf = (r: GraphRingResponse) => r.items.map((item) => item.ref).sort();
/** The person centre as the ring read draws it: a person belongs to no workspace or project. */
const personCentre = (id: string, label: string) => ({ ref: P(id), kind: 'person', id, workspaceId: null, projectId: null, label, title: null, category: null, suggested: false, hop: 0, out: false });

describe('27.690–27.693 the viewer’s own person node (KG release blocker P2-3)', () => {
  it('27.690 a guest no names read names is drawn to herself: 200, her own name, and exactly the ticket and note she can open that mention her; controls: a person her list does not name is the same 404 byte for byte, and one it names keeps its label', async () => {
    const guest = w().guest;
    // Precondition: her own names read does not name her, so the fallback is what draws her (the walk's guest).
    const eff = await requireMember(db.pool, guest, ws());
    expect(eff?.workspaceRole).toBe('guest');
    const listedNames = await readActorNamesForGuest(db.pool, ws(), eff!, guest);
    expect(listedNames.map((n) => n.userId)).toEqual([w().owner]);

    const self = await ring('guest', P(guest));
    expect(self.status).toBe(200);
    expect(self.body.center).toEqual(personCentre(guest, 'Gita Guest'));
    expect(refsOf(self.body)).toEqual([T(ids.GT1), N(ids.GN1)].sort());
    // the oracle for "she can open": her own single-item reads answer each item, and refuse the hidden ones
    expect((await get('guest', `/v1/workspaces/${ws()}/tickets/${ids.GT1}`)).status).toBe(200);
    expect((await get('guest', `/v1/notes/${ids.GN1}`)).status).toBe(200);
    // the path read shares `resolve`: from her own node to her ticket
    const path = await get('guest', `/v1/graph/path?${new URLSearchParams({ from: P(guest), to: T(ids.GT1), groups: 'people' })}`);
    expect(path.status).toBe(200);

    // CONTROL: the member is on no ticket she can see. The same 404 as an unknown person, byte for byte (no oracle).
    const unknown = await ring('guest', P(newUlid()));
    expect({ status: unknown.status, raw: unknown.raw }).toEqual({ status: 404, raw: NOT_FOUND });
    expect(JSON.parse(unknown.raw)).toEqual(READ_NOT_FOUND_BODY);
    const other = await ring('guest', P(w().member));
    expect({ status: other.status, raw: other.raw, type: other.type }).toEqual({ status: 404, raw: unknown.raw, type: unknown.type });
    // the haystack holds the member: the owner draws her, linked (taskInEpic's assignee)
    expect((await ring('owner', P(w().member))).body.center.label).toBe('Mira Marak');
    // CONTROL: the person her list names (the owner) is drawn with the label every names read gives him
    expect((await ring('guest', P(w().owner))).body.center).toEqual(personCentre(w().owner, 'Kiro Sangma'));
  });

  it('27.691 the guest’s rings around herself never hold a ticket or note she cannot open (not listed, a comment on one, a workspace note, deleted, another workspace); control: the owner’s ring around her holds the first three, and her own reads refuse them', async () => {
    const guest = w().guest;
    const hidden = [T(ids.H1), T(ids.H2), N(ids.H3), T(ids.H4), T(ids.H5)];
    // the haystack holds its subjects: the owner sees H1–H3 linked to her (H4 is deleted for everyone; H5's workspace is not the owner's)
    const owner = await ring('owner', P(guest));
    expect(refsOf(owner.body)).toEqual([T(ids.GT1), N(ids.GN1), T(ids.H1), T(ids.H2), N(ids.H3)].sort());
    // H4 and H5 are linked to her in the raw table (the haystack for the two the owner cannot see either)
    const { rows } = await db.pool.query<{ id: string }>(`SELECT source_parent_id AS id FROM proj_references WHERE target_kind = 'person' AND target_id = $1`, [guest]);
    expect(rows.map((r) => r.id)).toEqual(expect.arrayContaining([ids.H4, ids.H5]));
    // and she cannot open H1–H3 herself
    expect((await get('guest', `/v1/workspaces/${ws()}/tickets/${ids.H1}`)).status).toBe(404);
    expect((await get('guest', `/v1/workspaces/${ws()}/tickets/${ids.H2}`)).status).toBe(404);
    expect((await get('guest', `/v1/notes/${ids.H3}`)).status).toBe(404);

    for (const groups of ['people', undefined]) {
      for (const hops of ['1', '2', '3']) {
        const answer = await ring('guest', P(guest), hops, groups);
        expect(answer.status).toBe(200);
        expect(refsOf(answer.body).filter((ref) => hidden.includes(ref))).toEqual([]);
        for (const id of [ids.H1, ids.H2, ids.H3, ids.H4, ids.H5]) expect(answer.raw).not.toContain(id);
      }
    }
    // the path read: her own node to a hidden ticket is the one 404
    const path = await get('guest', `/v1/graph/path?${new URLSearchParams({ from: P(guest), to: T(ids.H1), groups: 'people' })}`);
    expect({ status: path.status, raw: path.raw }).toEqual({ status: 404, raw: NOT_FOUND });
  });

  it('27.692 the owner and the member are drawn exactly as before: their own nodes, each other, and the guest, with the labels every names read gives, and the same rings', async () => {
    const actorNames = new Map((await readActorNames(db.pool, ws())).map((n) => [n.userId, n.displayName]));
    for (const [role, label] of [['owner', 'Kiro Sangma'], ['member', 'Mira Marak'], ['guest', 'Gita Guest']] as const) expect(actorNames.get(w()[role])).toBe(label);
    const ownerSelf = await ring('owner', P(w().owner));
    expect(ownerSelf.body.center).toEqual(personCentre(w().owner, 'Kiro Sangma'));
    expect(refsOf(ownerSelf.body)).toEqual([T(w().taskInEpicId)]);
    const memberSelf = await ring('member', P(w().member));
    expect(memberSelf.body.center).toEqual(personCentre(w().member, 'Mira Marak'));
    expect(refsOf(memberSelf.body)).toEqual([T(w().taskInEpicId)]);
    expect((await ring('member', P(w().owner))).body.center).toEqual(personCentre(w().owner, 'Kiro Sangma'));
    expect((await ring('owner', P(w().member))).body.center).toEqual(personCentre(w().member, 'Mira Marak'));
    // the member's ring around the guest: H1, H2 and H3, which the member can open; GT1 and GN1 are listed for the guest alone
    const memberOnGuest = await ring('member', P(w().guest));
    expect(memberOnGuest.body.center).toEqual(personCentre(w().guest, 'Gita Guest'));
    expect(refsOf(memberOnGuest.body)).toEqual([T(ids.H1), T(ids.H2), N(ids.H3)].sort());
    // An edge's author is still the names read's alone (planner, 14:46: addedBy deliberately unchanged): the link the
    // guest added reads no author to her, as before; control: the owner, whose read names her, reads her name.
    const linkId = `relates|${T(ids.GT1)}|${T(w().guestTaskId)}`;
    const edgeFor = async (role: ReadRole) => (await ring(role, T(ids.GT1), '1', 'relates')).body.edges.find((e) => e.id === linkId);
    expect((await edgeFor('owner'))?.addedBy).toBe('Gita Guest');
    expect(await edgeFor('guest')).toMatchObject({ id: linkId, addedBy: null });
  });

  it('27.693 a phone user no names read labels is drawn to themselves by their own name; control: FD3 still hides them from everyone else with the same 404, and a blank name with only a synthetic address is no label', async () => {
    const admin = read.userIds.admin;
    const self = await ring('admin', P(admin));
    expect(self.status).toBe(200);
    expect(self.body.center).toEqual(personCentre(admin, PHONE_NAMES.admin));
    expect(refsOf(self.body)).toEqual([T(ids.PX)]);
    // CONTROL: every other viewer gets the unknown person's 404 for them, byte for byte (FD3 unchanged)
    const unknown = await ring('owner', P(newUlid()));
    expect(unknown.raw).toBe(NOT_FOUND);
    for (const viewer of ['owner', 'member', 'guest', 'projectLead'] as const) {
      const other = await ring(viewer, P(admin));
      expect({ viewer, status: other.status, raw: other.raw, type: other.type }).toEqual({ viewer, status: 404, raw: unknown.raw, type: unknown.type });
    }
    // and a ring that reaches them leaves them out for anyone else: PX's ring as the owner holds no person
    expect(refsOf((await ring('owner', T(ids.PX))).body)).toEqual([]);
    expect(refsOf((await ring('admin', T(ids.PX))).body)).toEqual([P(admin)]);

    // a blank name falls to a REAL address (R3): the guest, emptied of her name, is labelled by her address
    await db.pool.query('UPDATE "user" SET name = $1 WHERE id = $2', ['', w().guest]);
    expect((await ring('guest', P(w().guest))).body.center).toEqual(personCentre(w().guest, 'guest@kg-self.test'));
    await db.pool.query('UPDATE "user" SET name = $1 WHERE id = $2', [NAMES.guest, w().guest]);
    // a blank name with only a synthetic address: never a label, so the project lead is not drawn, even to themselves
    const lead = read.userIds.projectLead;
    expect((await ring('projectLead', P(lead))).body.center).toEqual(personCentre(lead, PHONE_NAMES.projectLead));
    await db.pool.query('UPDATE "user" SET name = $1 WHERE id = $2', ['  ', lead]);
    const blank = await ring('projectLead', P(lead));
    expect({ status: blank.status, raw: blank.raw }).toEqual({ status: 404, raw: NOT_FOUND });
    await db.pool.query('UPDATE "user" SET name = $1 WHERE id = $2', [PHONE_NAMES.projectLead, lead]);
    expect((await ring('projectLead', P(lead))).body.center).toEqual(personCentre(lead, PHONE_NAMES.projectLead));
  });
});
