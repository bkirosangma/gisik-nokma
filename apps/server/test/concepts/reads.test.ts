/**
 * Knowledge Graph spec D §3.2 (D4) at READ time, KG-D Task 4: the concept routes (`routes/concepts.ts`) over
 * `read/concepts.ts`. Cases 27.465–27.472 and 27.482 (`test-cases/27-knowledge-graph.md` §27.D).
 *
 * The world is `seedNotesFixture` around seven people who signed in over the wire first (its `userIds`), so each
 * can call the API with a bearer; `outsider` signed in and belongs to no workspace. Concepts are seeded with
 * `applyCommitted` (the door is SL3's and is tested there):
 * - CP tags TP (created by the owner over MCP, tagged by `author` from the desktop app), linked `related` to CW and CE and
 *   `broader` to C0 (C0 is broader than CP);
 * - CW tags nWorkspace; CE tags TE (explicit `[guestListed]`); C0 tags nothing; CM tags nWorkspace AND TE (a MIXED
 *   concept: `memberIn` sees only nWorkspace, `guestListed` only TE, so `every` and `some` answer differently).
 * - CP < CW and CP < CE, minted as a sorted triple: a `related` row is written by the lower id (R1, the table's CHECK).
 * - CD is deleted, and CF lives in another workspace: neither may reach anyone here.
 *
 * Who reads what (Rule A, planner ruling 2026-10-04, report Q1): every member and admin reads every founded project,
 * so `memberOut` READS TP; the owner reads everything; guests read explicit lists only (`guestListed`: TE). Every
 * non-owner except `guestListed` loses TE. Cases that WRITE use their own ticket and concept, so a mutant that reds
 * one case cannot leave the shared concepts changed for the next.
 *
 * Every body below is a LITERAL, never the exported constant: a mutant that edits the constant moves an imported
 * expectation with it.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { newUlid, type LedgerEvent, type Ulid } from '@gisik-nokma/domain';
import { resolveEffectiveRole } from '../../src/permissions/effective-role.js';
import { hiddenItems, type ItemRef } from '../../src/read/item-visibility.js';
import { buildTestApp } from '../helpers/app.js';
import { applyCommitted, makeCommitted } from '../helpers/apply.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { seedProject, seedTicket } from '../helpers/seed.js';
import { NOTES_USERS, seedNotesFixture, type NotesFixture, type NotesUser } from '../helpers/notes-fixture.js';
import { signInWithPhone } from '../helpers/session.js';

type Who = NotesUser | 'outsider';
let db: TestDatabase;
let app: FastifyInstance;
let world: NotesFixture;
const tokens = {} as Record<Who, string>;
const ids = {} as Record<Who, string>;
let CP: string;
let CW: string;
let CE: string;
const C0 = newUlid();
const CM = newUlid();
const CD = newUlid();
const CF = newUlid();
const FW = newUlid(); // another workspace, holding CF and the foreign ticket FT and note FN
const FT = newUlid();
const FN = newUlid();

const NOT_FOUND = '{"error":"not_found"}';
const INVALID = { error: 'invalid_query' };

function cev(conceptId: string, type: string, payload: Record<string, unknown>, who: NotesUser = 'owner', origin: LedgerEvent['origin'] = 'web'): LedgerEvent {
  return makeCommitted({ workspaceId: world.WS, actorId: world.ids[who], entity: { kind: 'concept', id: conceptId }, type, payload, origin });
}
function tev(ticketId: string, type: string, payload: Record<string, unknown>): LedgerEvent {
  return makeCommitted({ workspaceId: world.WS, actorId: world.ids.owner, entity: { kind: 'ticket', id: ticketId }, type, payload });
}
const ticketCreated = (ticketId: string, title: string) =>
  tev(ticketId, 'ticket.created', { typeId: 'task', projectId: world.P, parentId: null, title });
const get = (who: Who, url: string) =>
  app.inject({ method: 'GET', url, headers: { authorization: `Bearer ${tokens[who]}` } });
const listIds = async (who: Who, query = ''): Promise<string[]> => {
  const res = await get(who, `/v1/workspaces/${world.WS}/concepts${query}`);
  expect(res.statusCode, `${who} ${res.body}`).toBe(200);
  return (res.json() as { concepts: Array<{ id: string }> }).concepts.map((c) => c.id).sort();
};
/** Status and body together, so a 404 is compared byte for byte. */
const answer = async (who: Who, url: string): Promise<{ status: number; body: string }> => {
  const res = await get(who, url);
  return { status: res.statusCode, body: res.body };
};
const sorted = (...xs: string[]) => [...xs].sort();

beforeAll(async () => {
  db = await createTestDatabase();
  const built = buildTestApp(db);
  app = built.app;
  await app.ready();
  for (const [index, who] of [...NOTES_USERS, 'outsider' as const].entries()) {
    const user = await signInWithPhone(app, built.otp, `+911100046${String(500 + index)}`);
    ids[who] = user.userId;
    tokens[who] = user.token;
  }
  world = await seedNotesFixture(db.pool, Object.fromEntries(NOTES_USERS.map((who) => [who, ids[who]])) as Record<NotesUser, string>);
  [CP, CW, CE] = [newUlid(), newUlid(), newUlid()].sort() as [Ulid, Ulid, Ulid];
  await applyCommitted(db.pool, [
    cev(CP, 'concept.created', { name: 'Licences' }, 'owner', 'mcp'),
    cev(CP, 'concept.item_tagged', { itemKind: 'ticket', itemId: world.TP }, 'author', 'desktop'),
    cev(CW, 'concept.created', { name: 'Workspace notes' }),
    cev(CW, 'concept.item_tagged', { itemKind: 'note', itemId: world.NOTES.nWorkspace }),
    cev(CE, 'concept.created', { name: 'Invoices' }),
    cev(CE, 'concept.item_tagged', { itemKind: 'ticket', itemId: world.TE }),
    cev(C0, 'concept.created', { name: 'Empty' }),
    cev(CM, 'concept.created', { name: 'Mixed' }),
    cev(CM, 'concept.item_tagged', { itemKind: 'note', itemId: world.NOTES.nWorkspace }),
    cev(CM, 'concept.item_tagged', { itemKind: 'ticket', itemId: world.TE }),
    cev(CP, 'concept.linked', { otherId: CW, relation: 'related' }),
    cev(CP, 'concept.linked', { otherId: CE, relation: 'related' }),
    cev(CP, 'concept.linked', { otherId: C0, relation: 'broader' }),
    cev(CD, 'concept.created', { name: 'Gone' }),
    cev(CD, 'concept.deleted', {}),
    makeCommitted({ workspaceId: FW, actorId: world.ids.owner, entity: { kind: 'concept', id: CF }, type: 'concept.created', payload: { name: 'Elsewhere' } }),
    makeCommitted({ workspaceId: FW, actorId: world.ids.owner, entity: { kind: 'note', id: FN }, type: 'note.created', payload: { title: 'Elsewhere', homeProjectId: '', scope: { mode: 'workspace' } } }),
  ]);
  const FP = newUlid();
  await seedProject(db.pool, FW, FP);
  await seedTicket(db.pool, { workspaceId: FW, ticketId: FT, projectId: FP, title: 'Elsewhere' });
}, 120_000);
afterAll(async () => {
  await app.close();
  await db.drop();
});

describe('27.465 the list is D4 for every user', () => {
  it('27.465 GET /v1/workspaces/WS/concepts agrees with hiddenItems for all seven users; control: not constant, and the mixed concept is listed for neither one-item reader', async () => {
    const { rows } = await db.pool.query<{ concept_id: string }>('SELECT concept_id FROM proj_concepts WHERE workspace_id = $1 AND deleted = FALSE', [world.WS]);
    const answers = new Map<NotesUser, string[]>();
    for (const who of NOTES_USERS) {
      const uid = world.ids[who];
      const eff = await resolveEffectiveRole(db.pool, uid, world.WS);
      const expected: string[] = [];
      for (const { concept_id: conceptId } of rows) {
        const items = (
          await db.pool.query<{ item_kind: 'ticket' | 'note'; item_id: string }>('SELECT item_kind, item_id FROM proj_concept_items WHERE concept_id = $1', [conceptId])
        ).rows.map((r): ItemRef => ({ kind: r.item_kind, id: r.item_id }));
        // Every item in this world is live, so "empty" is "no items" here.
        const sees = items.length === 0 ? eff.workspaceRole !== 'guest' : (await hiddenItems(db.pool, eff, uid, world.WS, items)).length === 0;
        if (sees) expected.push(conceptId);
      }
      const got = await listIds(who);
      expect(got, who).toEqual(expected.sort());
      answers.set(who, got);
    }
    // The table, written out: the agreement above would also hold for an oracle that drifted with the code.
    expect(answers.get('owner')).toEqual(sorted(CP, CW, CE, C0, CM));
    for (const who of ['admin', 'memberIn', 'memberOut', 'author'] as const) expect(answers.get(who), who).toEqual(sorted(CP, CW, C0));
    expect(answers.get('guestListed')).toEqual([CE]);
    expect(answers.get('guestUnlisted')).toEqual([]);
    // Controls: the answer is not constant, and CM (one visible item each) is listed for neither.
    expect(new Set([...answers.values()].map((a) => a.join(','))).size).toBeGreaterThan(1);
    expect(answers.get('memberIn')).not.toContain(CM);
    expect(answers.get('guestListed')).not.toContain(CM);
    // A non-member gets the one 404.
    expect(await answer('outsider', `/v1/workspaces/${world.WS}/concepts`)).toEqual({ status: 404, body: NOT_FOUND });
    // Each row carries its live item count, its creator and its origin.
    const owner = (await get('owner', `/v1/workspaces/${world.WS}/concepts`)).json() as { workspaceId: string; concepts: Array<Record<string, unknown>> };
    expect(owner.workspaceId).toBe(world.WS);
    expect(owner.concepts.find((c) => c['id'] === CP)).toEqual({ id: CP, name: 'Licences', summary: '', itemCount: 1, createdBy: world.ids.owner, origin: 'mcp' });
    expect(owner.concepts.find((c) => c['id'] === CM)?.['itemCount']).toBe(2);
    expect(owner.concepts.map((c) => c['name'])).toEqual(['Empty', 'Invoices', 'Licences', 'Mixed', 'Workspace notes']);
  });
});

describe('27.466 an empty concept is for members and above', () => {
  it('27.466 an empty concept is listed for memberOut and neither guest; control: one tagged ticket makes it follow that ticket', async () => {
    const C66 = newUlid();
    await applyCommitted(db.pool, [cev(C66, 'concept.created', { name: 'Empty too' })]);
    expect(await listIds('memberOut')).toContain(C66);
    expect(await listIds('guestListed')).not.toContain(C66);
    expect(await listIds('guestUnlisted')).not.toContain(C66);
    // Control: TE (explicit [guestListed]) tagged in, the concept now has TE's audience, not the empty rule's.
    await applyCommitted(db.pool, [cev(C66, 'concept.item_tagged', { itemKind: 'ticket', itemId: world.TE })]);
    expect(await listIds('guestListed')).toContain(C66);
    expect(await listIds('memberOut')).not.toContain(C66);
  });
});

describe('27.467 one concept', () => {
  it('27.467 GET /v1/concepts/CP: items labelled key + title, creator and origin, links only to concepts the reader sees; a hidden one is the unknown 404', async () => {
    const res = await get('memberIn', `/v1/concepts/${CP}`);
    expect(res.statusCode, res.body).toBe(200);
    const view = res.json() as Record<string, unknown>;
    const tagRow = (await db.pool.query<{ tagged_at: Date }>('SELECT tagged_at FROM proj_concept_items WHERE concept_id = $1', [CP])).rows[0];
    expect(view['items']).toEqual([
      { kind: 'ticket', id: world.TP, label: 'CCRE-1 Renew the trade licence', taggedBy: world.ids.author, taggedAt: tagRow?.tagged_at.toISOString(), origin: 'desktop' },
    ]);
    expect(view).toMatchObject({ id: CP, name: 'Licences', summary: '', itemCount: 1, createdBy: world.ids.owner, origin: 'mcp', workspaceId: world.WS, fromSuggestion: null });
    // CE is linked too, and memberIn cannot see TE: the link is dropped, not redacted. C0 is broader than CP.
    expect(view['links']).toEqual([
      { otherId: C0, otherName: 'Empty', relation: 'broader', direction: 'broader' },
      { otherId: CW, otherName: 'Workspace notes', relation: 'related', direction: 'related' },
    ]);
    const owner = (await get('owner', `/v1/concepts/${CP}`)).json() as { links: Array<{ otherId: string }> };
    expect(owner.links.map((l) => l.otherId).sort()).toEqual(sorted(C0, CW, CE));
    // From the broader end, CP is narrower.
    const c0 = (await get('memberIn', `/v1/concepts/${C0}`)).json() as { links: unknown[]; items: unknown[] };
    expect(c0.links).toEqual([{ otherId: CP, otherName: 'Licences', relation: 'broader', direction: 'narrower' }]);
    expect(c0.items).toEqual([]);
    // Hidden = unknown, byte for byte: guestUnlisted, a random id, and a non-member.
    const random = await answer('memberIn', `/v1/concepts/${newUlid()}`);
    expect(random).toEqual({ status: 404, body: NOT_FOUND });
    expect(await answer('guestUnlisted', `/v1/concepts/${CP}`)).toEqual(random);
    expect(await answer('outsider', `/v1/concepts/${CP}`)).toEqual(random);
    expect(await answer('outsider', `/v1/concepts/${C0}`)).toEqual(random); // empty, so only the membership gate stands
    expect(await answer('owner', `/v1/concepts/${CD}`)).toEqual(random); // deleted
    expect(await answer('owner', `/v1/concepts/${CF}`)).toEqual(random); // another workspace
    // Control, same it: memberOut reads TP on the ref (Rule A), so reads CP.
    expect((await get('memberOut', `/v1/concepts/${CP}`)).statusCode).toBe(200);
  });
});

describe('27.470 the list by item', () => {
  it('27.470 ?item=ticket:TP lists exactly CP; a reader who cannot see the item gets the absent item 404; a bad kind or a repeated item is a 400', async () => {
    expect(await listIds('memberIn', `?item=ticket:${world.TP}`)).toEqual([CP]);
    expect(await listIds('memberOut', `?item=ticket:${world.TP}`)).toEqual([CP]);
    expect(await listIds('owner', `?item=note:${world.NOTES.nWorkspace}`)).toEqual(sorted(CW, CM));
    const absent = await answer('guestListed', `/v1/workspaces/${world.WS}/concepts?item=ticket:${newUlid()}`);
    expect(absent).toEqual({ status: 404, body: NOT_FOUND });
    expect(await answer('guestListed', `/v1/workspaces/${world.WS}/concepts?item=ticket:${world.TP}`)).toEqual(absent);
    const bad = await get('memberIn', `/v1/workspaces/${world.WS}/concepts?item=widget:x`);
    expect([bad.statusCode, bad.json()]).toEqual([400, INVALID]);
    const twice = await get('memberIn', `/v1/workspaces/${world.WS}/concepts?item=ticket:${world.TP}&item=ticket:${world.TP}`);
    expect([twice.statusCode, twice.json()]).toEqual([400, INVALID]);
    // The kind is the whole prefix and the id is not empty.
    for (const ref of [`xticket:${world.TP}`, 'ticket:']) {
      const res = await get('memberIn', `/v1/workspaces/${world.WS}/concepts?item=${ref}`);
      expect([ref, res.statusCode, res.json()]).toEqual([ref, 400, INVALID]);
    }
    // An item of ANOTHER workspace is an absent item here, even for the owner (it may not be told the id exists).
    expect(await answer('owner', `/v1/workspaces/${world.WS}/concepts?item=ticket:${FT}`)).toEqual(absent);
    expect(await answer('owner', `/v1/workspaces/${world.WS}/concepts?item=note:${FN}`)).toEqual(absent);
    // Control: the foreign ticket and note are live where they live.
    const foreign = await db.pool.query('SELECT (SELECT count(*)::int FROM proj_tickets WHERE ticket_id = $1 AND workspace_id = $3) AS t, (SELECT count(*)::int FROM proj_notes WHERE note_id = $2 AND workspace_id = $3 AND deleted = FALSE) AS n', [FT, FN, FW]);
    expect(foreign.rows).toEqual([{ t: 1, n: 1 }]);
  });
});

describe('27.472 the audience preview', () => {
  it('27.472 adding TE to CW narrows 5 → 1 of 7; control: adding what CW already holds changes nothing', async () => {
    const res = await get('owner', `/v1/workspaces/${world.WS}/concepts/audience?conceptId=${CW}&add=ticket:${world.TE}`);
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json()).toEqual({ conceptId: CW, members: 7, before: 5, after: 1 });
    const same = await get('owner', `/v1/workspaces/${world.WS}/concepts/audience?conceptId=${CW}&add=note:${world.NOTES.nWorkspace}`);
    expect(same.json()).toEqual({ conceptId: CW, members: 7, before: 5, after: 5 });
    // No concept: before is the empty rule (the five non-guests), after the item's own audience.
    const fresh = await get('admin', `/v1/workspaces/${world.WS}/concepts/audience?add=ticket:${world.TP}&add=note:${world.NOTES.nWorkspace}`);
    expect(fresh.json()).toEqual({ conceptId: null, members: 7, before: 5, after: 5 });
  });
});

describe('27.482 the audience read refuses what the caller may not ask about', () => {
  it('27.482 a guest, a hidden or absent item, a hidden concept and a non-member get the one 404; malformed queries a 400; control: a visible item is answered', async () => {
    const url = (query: string) => `/v1/workspaces/${world.WS}/concepts/audience?${query}`;
    // Control first: the admin asking about TP is answered.
    expect((await get('admin', url(`add=ticket:${world.TP}`))).statusCode).toBe(200);
    const absent = await answer('admin', url(`add=ticket:${newUlid()}`));
    expect(absent).toEqual({ status: 404, body: NOT_FOUND });
    expect(await answer('admin', url(`add=ticket:${world.TE}`))).toEqual(absent); // TE is hidden from the admin
    expect(await answer('admin', url(`add=ticket:${world.TP}&add=ticket:${world.TE}`))).toEqual(absent); // one hidden of two
    expect(await answer('admin', url(`conceptId=${CE}&add=ticket:${world.TP}`))).toEqual(absent); // CE is hidden from the admin
    expect(await answer('admin', url(`conceptId=${newUlid()}&add=ticket:${world.TP}`))).toEqual(absent);
    expect(await answer('owner', url(`conceptId=${CD}&add=ticket:${world.TP}`))).toEqual(absent); // deleted
    expect(await answer('owner', url(`conceptId=${CF}&add=ticket:${world.TP}`))).toEqual(absent); // another workspace
    expect(await answer('guestListed', url(`add=ticket:${world.TE}`))).toEqual(absent); // a guest sees TE but not the roster
    expect(await answer('outsider', url(`add=ticket:${world.TP}`))).toEqual(absent);
    for (const query of ['', `add=widget:${world.TP}`, `conceptId=${CW}`, `conceptId=${CW}&conceptId=${CP}&add=ticket:${world.TP}`, `conceptId=&add=ticket:${world.TP}`]) {
      const res = await get('admin', url(query));
      expect([res.statusCode, res.json()], query).toEqual([400, INVALID]);
    }
  });
});

describe('27.471 history', () => {
  it('27.471 the tag and untag of an item the reader cannot see go out with itemId blank; the rest whole; control: the owner sees the id', async () => {
    const C71 = newUlid();
    await applyCommitted(db.pool, [
      cev(C71, 'concept.created', { name: 'History' }),
      cev(C71, 'concept.item_tagged', { itemKind: 'note', itemId: world.NOTES.nWorkspace }),
      cev(C71, 'concept.item_tagged', { itemKind: 'ticket', itemId: world.TE }),
      cev(C71, 'concept.item_untagged', { itemKind: 'ticket', itemId: world.TE }),
    ]);
    type H = { conceptId: string; events: Array<{ type: string; payload: Record<string, unknown> }> };
    const res = await get('memberIn', `/v1/concepts/${C71}/history`);
    expect(res.statusCode, res.body).toBe(200);
    const mine = res.json() as H;
    expect(mine.conceptId).toBe(C71);
    expect(mine.events.map((e) => [e.type, e.payload])).toEqual([
      ['concept.created', { name: 'History' }],
      ['concept.item_tagged', { itemKind: 'note', itemId: world.NOTES.nWorkspace }],
      ['concept.item_tagged', { itemKind: 'ticket', itemId: '' }],
      ['concept.item_untagged', { itemKind: 'ticket', itemId: '' }],
    ]);
    const owner = (await get('owner', `/v1/concepts/${C71}/history`)).json() as H;
    expect(owner.events.slice(2).map((e) => e.payload)).toEqual([
      { itemKind: 'ticket', itemId: world.TE },
      { itemKind: 'ticket', itemId: world.TE },
    ]);
    // Paged as a ticket's history is, and refused as the concept is.
    const page = (await get('owner', `/v1/concepts/${C71}/history?afterSeq=1&limit=2`)).json() as H;
    expect(page.events.map((e) => e.type)).toEqual(['concept.item_tagged', 'concept.item_tagged']);
    // A page holding only the tag, or only the untag, still blanks it: each type names the item on its own.
    expect(((await get('memberIn', `/v1/concepts/${C71}/history?afterSeq=2&limit=1`)).json() as H).events.map((e) => [e.type, e.payload])).toEqual([
      ['concept.item_tagged', { itemKind: 'ticket', itemId: '' }],
    ]);
    expect(((await get('memberIn', `/v1/concepts/${C71}/history?afterSeq=3&limit=1`)).json() as H).events.map((e) => [e.type, e.payload])).toEqual([
      ['concept.item_untagged', { itemKind: 'ticket', itemId: '' }],
    ]);
    const badPage = await get('owner', `/v1/concepts/${C71}/history?limit=0`);
    expect([badPage.statusCode, badPage.json()]).toEqual([400, { error: 'afterSeq must be a whole number from 0, and limit a whole number from 1' }]);
    const random = await answer('memberIn', `/v1/concepts/${newUlid()}/history`);
    expect(random).toEqual({ status: 404, body: NOT_FOUND });
    expect(await answer('guestUnlisted', `/v1/concepts/${C71}/history`)).toEqual(random);
    expect(await answer('outsider', `/v1/concepts/${C71}/history`)).toEqual(random);
    expect(await answer('outsider', `/v1/concepts/${C0}/history`)).toEqual(random); // empty: the membership gate alone
    expect(await answer('owner', `/v1/concepts/${CD}/history`)).toEqual(random); // deleted
  });
});

describe('27.483 trash (Review Focus 3, at read time)', () => {
  it('27.483 a trashed ticket and a deleted note leave the items, the count and the D4 check, so the concept is empty; a restore brings the ticket back', async () => {
    const TT = newUlid();
    const nT = newUlid();
    const C83 = newUlid();
    await applyCommitted(db.pool, [
      ticketCreated(TT, 'Return the crates'),
      tev(TT, 'visibility.set', { ticketId: TT, mode: 'explicit', userIds: [world.ids.guestListed] }),
      makeCommitted({ workspaceId: world.WS, actorId: world.ids.author, entity: { kind: 'note', id: nT }, type: 'note.created', payload: { title: 'Crate count', homeProjectId: world.P, scope: { mode: 'explicit', userIds: [world.ids.guestListed] } } }),
      cev(C83, 'concept.created', { name: 'Crates' }),
      cev(C83, 'concept.item_tagged', { itemKind: 'ticket', itemId: TT }),
      cev(C83, 'concept.item_tagged', { itemKind: 'note', itemId: nT }),
    ]);
    const owned = async () => {
      const list = (await get('owner', `/v1/workspaces/${world.WS}/concepts`)).json() as { concepts: Array<{ id: string; itemCount: number }> };
      const view = (await get('owner', `/v1/concepts/${C83}`)).json() as { itemCount: number; items: Array<{ id: string }> };
      return { listed: list.concepts.find((c) => c.id === C83)?.itemCount, count: view.itemCount, items: view.items.map((i) => i.id) };
    };
    // Both live: the concept has their audience (guestListed in, memberOut out).
    expect(await owned()).toEqual({ listed: 2, count: 2, items: [TT, nT] });
    expect(await listIds('guestListed')).toContain(C83);
    expect(await listIds('memberOut')).not.toContain(C83);
    await applyCommitted(db.pool, [
      tev(TT, 'ticket.deleted', {}),
      makeCommitted({ workspaceId: world.WS, actorId: world.ids.author, entity: { kind: 'note', id: nT }, type: 'note.deleted', payload: {} }),
    ]);
    // Neither counts now: the concept is EMPTY, so the empty rule decides (members in, guests out).
    expect(await owned()).toEqual({ listed: 0, count: 0, items: [] });
    expect(await listIds('guestListed')).not.toContain(C83);
    expect(await listIds('memberOut')).toContain(C83);
    // The preview asks the same question: C83 counts as empty now (the five non-guests), not as two hidden-from-no-one items.
    expect((await get('owner', `/v1/workspaces/${world.WS}/concepts/audience?conceptId=${C83}&add=note:${world.NOTES.nWorkspace}`)).json()).toEqual({
      conceptId: C83, members: 7, before: 5, after: 5,
    });
    // A trashed item is the absent item's 404 on `?item=`, even for the owner.
    expect(await answer('owner', `/v1/workspaces/${world.WS}/concepts?item=ticket:${TT}`)).toEqual(
      await answer('owner', `/v1/workspaces/${world.WS}/concepts?item=ticket:${newUlid()}`),
    );
    // The tag was kept, so a restore brings the ticket back into the items and the check.
    await applyCommitted(db.pool, [tev(TT, 'ticket.restored', {})]);
    expect(await owned()).toEqual({ listed: 1, count: 1, items: [TT] });
    expect(await listIds('guestListed')).toContain(C83);
    expect(await listIds('memberOut')).not.toContain(C83);
  });
});

describe('27.469 the assignee arm (Review Focus 2)', () => {
  it('27.469 memberOut reads a concept through the assignee arm alone, and loses it on reassignment; control: memberIn never reads it', async () => {
    const TX = newUlid();
    const CX = newUlid();
    await applyCommitted(db.pool, [
      ticketCreated(TX, 'Lock the cash drawer'),
      tev(TX, 'visibility.set', { ticketId: TX, mode: 'explicit', userIds: [world.ids.owner] }),
      tev(TX, 'ticket.assigned', { assigneeId: world.ids.memberOut }),
      cev(CX, 'concept.created', { name: 'Cash' }),
      cev(CX, 'concept.item_tagged', { itemKind: 'ticket', itemId: TX }),
    ]);
    expect((await get('memberOut', `/v1/concepts/${CX}`)).statusCode).toBe(200);
    expect(await listIds('memberOut')).toContain(CX);
    expect((await get('memberIn', `/v1/concepts/${CX}`)).statusCode).toBe(404);
    await applyCommitted(db.pool, [tev(TX, 'ticket.assigned', { assigneeId: world.ids.owner })]);
    expect(await answer('memberOut', `/v1/concepts/${CX}`)).toEqual({ status: 404, body: NOT_FOUND });
    expect(await listIds('memberOut')).not.toContain(CX);
    expect((await get('memberIn', `/v1/concepts/${CX}`)).statusCode).toBe(404);
    expect((await get('owner', `/v1/concepts/${CX}`)).statusCode).toBe(200);
  });
});

describe('27.468 an audience that narrows after the tag (Review Focus 1)', () => {
  it('27.468 memberIn reads the concept, a visibility.set makes its ticket explicit [owner], and memberIn loses it at once in the list, the get and the door; control: the owner keeps it', async () => {
    const T68 = newUlid();
    const C68 = newUlid();
    await applyCommitted(db.pool, [
      ticketCreated(T68, 'Pay the electricity bill'),
      cev(C68, 'concept.created', { name: 'Bills' }),
      cev(C68, 'concept.item_tagged', { itemKind: 'ticket', itemId: T68 }),
    ]);
    // The precondition: a 404 after proves nothing if it was a 404 before.
    expect((await get('memberIn', `/v1/concepts/${C68}`)).statusCode).toBe(200);
    expect(await listIds('memberIn')).toContain(C68);
    await applyCommitted(db.pool, [tev(T68, 'visibility.set', { ticketId: T68, mode: 'explicit', userIds: [world.ids.owner] })]);
    // No other write in between: nothing may answer from a cache.
    expect(await answer('memberIn', `/v1/concepts/${C68}`)).toEqual({ status: 404, body: NOT_FOUND });
    expect(await listIds('memberIn')).not.toContain(C68);
    expect((await get('owner', `/v1/concepts/${C68}`)).statusCode).toBe(200);
    // The door agrees (last: a door write would move the ledger's seqs past `applyCommitted`'s).
    const rename = await app.inject({
      method: 'POST',
      url: '/v1/events',
      headers: { authorization: `Bearer ${tokens.memberIn}` },
      payload: {
        events: [
          {
            id: newUlid(),
            version: 1,
            origin: 'web',
            clientTime: new Date().toISOString(),
            workspaceId: world.WS,
            entity: { kind: 'concept', id: C68 },
            type: 'concept.renamed',
            payload: { name: 'Mine now' },
            actorId: world.ids.memberIn,
          },
        ],
      },
    });
    expect((rename.json() as { results: Array<Record<string, unknown>> }).results[0]).toMatchObject({
      status: 'refused',
      rule: 'concept.unknown',
      reason: 'That concept does not exist or you cannot see it.',
    });
  });
});
