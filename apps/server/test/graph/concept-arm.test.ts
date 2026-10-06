/**
 * Knowledge Graph spec D §6 in the ring read (KG-D Task 6): `GET /v1/graph/neighbours?…&groups=concepts` draws the
 * concepts a reader may see (D4: every live item visible), with a `tag` edge to each item, and the model suggestions a
 * member may see, drawn as concepts with `suggested: true`. Cases 27.506, 27.507 and the server half of 27.513
 * (`test-cases/27-knowledge-graph.md` §27.D, under `<!-- D T6 -->`).
 *
 * The world is `seedNotesFixture` around seven people who signed in over the wire first, so each can call the route
 * with a bearer. Each gets a real name and address, because the names read never labels a synthetic phone address
 * (`routes/builder-reads.ts`), and a tag edge's `addedBy` is that label.
 *
 * Who reads what (Rule A, planner ruling 2026-10-04, report Q1; `visible-where.ts` the ticket and note audiences): the
 * owner reads everything; every member and admin reads every founded project, so `memberIn` AND `memberOut` read TP
 * and nWorkspace; no non-owner except `guestListed` reads TE (explicit `[guestListed]`). So the concept a non-guest
 * reader must lose is one holding TE (CWE), never one holding only TP.
 *
 * Concepts (seeded with `applyCommitted`; the door is SL3's and is tested there):
 * - CP {TP}: created with a summary, TP tagged by `author` over MCP (`origin: 'mcp'`, so the edge's origin cannot be a
 *   default `'web'`);
 * - CW {nWorkspace}: no summary; CWE {TE, nWorkspace}; CE {TE};
 * - CP2 {TP, TQ}, with TP blocks TQ (a `ticket.link_added`), so ring 1 of TP holds CP2 AND TQ, and the tag between them
 *   is an edge AMONG the ring;
 * - CD {TP}, deleted; CF in another workspace FW.
 *
 * Suggestions (27.507) are rows written straight into `sem_suggestions`, as the job writes them (its own tests are
 * `test/semantic/job.test.ts`), INSIDE the `it` that reads them and removed before it ends (`withSuggestions`): a row
 * holding TE would otherwise join 27.506's exact two-hop answer from TE. S1 {TP, nProject, nWorkspace} is read by every
 * non-guest (Rule A); S2 {TE, nProject, nWorkspace} hides ONE item (TE) of three from `memberOut`; SG {TE, nExplicit}
 * hides nothing from `guestListed`, so only the members-only rule can drop it; SF is another workspace's.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { newUlid, type GraphPathResponse, type GraphRingResponse, type LedgerEvent } from '@gisik-nokma/domain';
import { resolveEffectiveRole } from '../../src/permissions/effective-role.js';
import { hiddenItems, type ItemRef } from '../../src/read/item-visibility.js';
import { visibleSuggestions } from '../../src/read/suggestions.js';
import { readActorNames } from '../../src/routes/builder-reads.js';
import { itemHash, itemKey, parseItemKey, signatureOf } from '../../src/semantic/signature.js';
import { buildTestApp } from '../helpers/app.js';
import { applyCommitted, makeCommitted } from '../helpers/apply.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { NOTES_USERS, seedNotesFixture, type NotesFixture, type NotesUser } from '../helpers/notes-fixture.js';
import { signInWithPhone } from '../helpers/session.js';

let db: TestDatabase;
let app: FastifyInstance;
let world: NotesFixture;
const tokens = {} as Record<NotesUser, string>;
const ids = {} as Record<NotesUser, string>;
/** userId → the label the names read gives them (filled in `beforeAll`). */
let names: Map<string, string>;
const [CP, CW, CWE, CE, CP2, CD, CF] = [newUlid(), newUlid(), newUlid(), newUlid(), newUlid(), newUlid(), newUlid()];
const TQ = newUlid();
const FW = newUlid();

function cev(conceptId: string, type: string, payload: Record<string, unknown>, who: NotesUser = 'owner', origin: LedgerEvent['origin'] = 'web'): LedgerEvent {
  return makeCommitted({ workspaceId: world.WS, actorId: world.ids[who], entity: { kind: 'concept', id: conceptId }, type, payload, origin });
}
function tev(ticketId: string, type: string, payload: Record<string, unknown>): LedgerEvent {
  return makeCommitted({ workspaceId: world.WS, actorId: world.ids.owner, entity: { kind: 'ticket', id: ticketId }, type, payload });
}

async function getRing(who: NotesUser, query: string): Promise<{ status: number; body: string }> {
  const res = await app.inject({ method: 'GET', url: `/v1/graph/neighbours?${query}`, headers: { authorization: `Bearer ${tokens[who]}` } });
  return { status: res.statusCode, body: res.body };
}
const query = (center: string, groups: string, hops = 1) =>
  new URLSearchParams({ center, hops: String(hops), ws: world.WS, groups }).toString();
async function ring(who: NotesUser, center: string, groups: string, hops = 1): Promise<GraphRingResponse> {
  const { status, body } = await getRing(who, query(center, groups, hops));
  expect(status, `${who} ${center} ${body}`).toBe(200);
  return JSON.parse(body) as GraphRingResponse;
}
const refs = (r: GraphRingResponse) => r.items.map((item) => item.ref);
const touching = (r: GraphRingResponse, ref: string) => r.edges.filter((edge) => edge.from === ref || edge.to === ref);

const [S1, S2, SG, SF, SR, SA] = [newUlid(), newUlid(), newUlid(), newUlid(), newUlid(), newUlid()];
const LABEL = 'licence · renewal';
type Cached = { signature: string; itemHashes: string[] };
/** A row as the job writes one: items in sorted key order, `itemHash` per key, `signatureOf` the keys. */
async function cache(id: string, items: ItemRef[], workspaceId = world.WS): Promise<Cached> {
  const keys = items.map((item) => itemKey(item.kind, item.id)).sort();
  const parsed = keys.map(parseItemKey);
  const row = { signature: signatureOf(keys), itemHashes: keys.map(itemHash) };
  await db.pool.query(
    `INSERT INTO sem_suggestions (id, workspace_id, signature, partition_key, item_kind, item_id, item_hashes, terms, label, score, computed_at)
     VALUES ($1, $2, $3, 'w', $4, $5, $6, $7, $8, 0.5, '2026-10-06T10:00:00Z')`,
    [id, workspaceId, row.signature, parsed.map((r) => r.kind), parsed.map((r) => r.id), row.itemHashes, ['licence', 'renewal'], LABEL],
  );
  return row;
}
/** Writes `rows`, runs `legs`, and removes every row before the `it` ends (each written exactly once). */
async function withSuggestions(rows: Record<string, { items: ItemRef[]; workspaceId?: string }>, legs: (cached: Record<string, Cached>) => Promise<void>): Promise<void> {
  const cached: Record<string, Cached> = {};
  try {
    for (const [id, row] of Object.entries(rows)) cached[id] = await cache(id, row.items, row.workspaceId);
    await legs(cached);
  } finally {
    const ids = Object.keys(rows);
    expect((await db.pool.query('DELETE FROM sem_suggestions WHERE id = ANY ($1::text[])', [ids])).rowCount, 'every row is removed before the it ends').toBe(ids.length);
  }
}
const ticket = (id: string): ItemRef => ({ kind: 'ticket', id });
const note = (id: string): ItemRef => ({ kind: 'note', id });

beforeAll(async () => {
  db = await createTestDatabase();
  const built = buildTestApp(db);
  app = built.app;
  await app.ready();
  for (const [index, who] of NOTES_USERS.entries()) {
    const user = await signInWithPhone(app, built.otp, `+911100050${String(500 + index)}`);
    ids[who] = user.userId;
    tokens[who] = user.token;
    await db.pool.query('UPDATE "user" SET name = $1, email = $2 WHERE id = $3', [`Person ${who}`, `${who}@kg-d-t6.test`, user.userId]);
  }
  world = await seedNotesFixture(db.pool, ids);
  const { nWorkspace } = world.NOTES;
  await applyCommitted(db.pool, [
    cev(CP, 'concept.created', { name: 'Licences', summary: 'Trade and shop licences' }),
    cev(CP, 'concept.item_tagged', { itemKind: 'ticket', itemId: world.TP }, 'author', 'mcp'),
    cev(CW, 'concept.created', { name: 'Workspace notes' }),
    cev(CW, 'concept.item_tagged', { itemKind: 'note', itemId: nWorkspace }),
    cev(CWE, 'concept.created', { name: 'Mixed audience' }),
    cev(CWE, 'concept.item_tagged', { itemKind: 'ticket', itemId: world.TE }),
    cev(CWE, 'concept.item_tagged', { itemKind: 'note', itemId: nWorkspace }),
    cev(CE, 'concept.created', { name: 'Invoices' }),
    cev(CE, 'concept.item_tagged', { itemKind: 'ticket', itemId: world.TE }),
    tev(TQ, 'ticket.created', { typeId: 'task', projectId: world.P, parentId: null, title: 'Renew the shop licence' }),
    tev(world.TP, 'ticket.link_added', { kind: 'blocks', targetId: TQ }),
    cev(CP2, 'concept.created', { name: 'Renewals' }),
    cev(CP2, 'concept.item_tagged', { itemKind: 'ticket', itemId: world.TP }),
    cev(CP2, 'concept.item_tagged', { itemKind: 'ticket', itemId: TQ }),
    cev(CD, 'concept.created', { name: 'Gone' }),
    cev(CD, 'concept.item_tagged', { itemKind: 'ticket', itemId: world.TP }),
    cev(CD, 'concept.deleted', {}),
    makeCommitted({ workspaceId: FW, actorId: world.ids.owner, entity: { kind: 'concept', id: CF }, type: 'concept.created', payload: { name: 'Elsewhere' } }),
  ]);
  names = new Map((await readActorNames(db.pool, world.WS)).map((row) => [row.userId, row.displayName]));
  // The haystack holds its subject: the tagger is labelled, so a null `addedBy` below is the read's doing.
  expect(names.get(ids.author)).toBe('Person author');
}, 120_000);
afterAll(async () => {
  await app.close();
  await db.drop();
});

describe('27.506 the ring read draws the concepts a reader may see (D4)', () => {
  it('27.506 memberIn gets CP and its tag edge (tagger, origin mcp); memberOut never gets CWE (it holds TE); controls: the owner gets CWE, memberOut gets CP from TP, no concept without the group', async () => {
    const mine = await ring('memberIn', `ticket:${world.TP}`, 'concepts');
    expect(mine.items.find((item) => item.ref === `concept:${CP}`)).toEqual({
      ref: `concept:${CP}`, kind: 'concept', id: CP, workspaceId: world.WS, projectId: null,
      label: 'Licences', title: 'Trade and shop licences', category: null, hop: 1, out: false, suggested: false,
    });
    const tag = mine.edges.find((edge) => edge.id === `tag|concept:${CP}|ticket:${world.TP}`);
    expect(tag).toMatchObject({ kind: 'tag', from: `concept:${CP}`, to: `ticket:${world.TP}`, snippet: null, addedBy: 'Person author', origin: 'mcp', suggested: false });
    expect(tag?.addedAt).toMatch(/^\d{4}-\d\d-\d\dT/);
    // A deleted concept is never drawn, nor its tag: `concept.deleted` keeps CD's `proj_concept_items` row for TP, so only the read leaves it out.
    expect(refs(mine)).not.toContain(`concept:${CD}`);
    expect(touching(mine, `concept:${CD}`)).toEqual([]);

    // CW has no summary: its title is null, not ''.
    const outsideTp = await ring('memberOut', `note:${world.NOTES.nWorkspace}`, 'concepts');
    expect(outsideTp.items.find((item) => item.ref === `concept:${CW}`)).toMatchObject({ kind: 'concept', label: 'Workspace notes', title: null, suggested: false }); // precondition: the ring is not empty
    expect(refs(outsideTp)).not.toContain(`concept:${CWE}`);
    expect(touching(outsideTp, `concept:${CWE}`)).toEqual([]);
    // Control: the owner, who reads TE, gets CWE from the same centre, so its absence above is D4, not the walk.
    expect(refs(await ring('owner', `note:${world.NOTES.nWorkspace}`, 'concepts'))).toEqual(expect.arrayContaining([`concept:${CW}`, `concept:${CWE}`]));
    // Rule A control: memberOut reads TP, so CP reaches them from TP.
    expect(refs(await ring('memberOut', `ticket:${world.TP}`, 'concepts'))).toContain(`concept:${CP}`);

    // Control: with no `concepts` group there is no concept at all (and the ring is not empty: TQ, by `blocks`).
    const blocks = await ring('memberIn', `ticket:${world.TP}`, 'blocks');
    expect(refs(blocks)).toContain(`ticket:${TQ}`);
    expect(blocks.items.filter((item) => item.kind === 'concept')).toEqual([]);
    expect(blocks.edges.filter((edge) => edge.kind === 'tag')).toEqual([]);
  });

  it('27.506 a concept is walked THROUGH to its other items, and a tag between two items of one ring is returned among them', async () => {
    // TE → CE, CWE (ring 1) → nWorkspace (ring 2, through CWE): the walk reads a concept's items from the concept.
    const two = await ring('owner', `ticket:${world.TE}`, 'concepts', 2);
    expect(refs(two)).toEqual([`note:${world.NOTES.nWorkspace}`]);
    expect(two.edges.map((edge) => edge.id)).toEqual([`tag|concept:${CWE}|note:${world.NOTES.nWorkspace}`]);

    // TP's ring 1 with blocks and concepts holds CP2 AND TQ; CP2 → TQ joins two items of the same ring.
    const among = await ring('memberIn', `ticket:${world.TP}`, 'blocks,concepts');
    expect(refs(among)).toEqual(expect.arrayContaining([`concept:${CP}`, `concept:${CP2}`, `ticket:${TQ}`]));
    expect(among.edges.map((edge) => edge.id)).toEqual(expect.arrayContaining([
      `blocks|ticket:${world.TP}|ticket:${TQ}`, `tag|concept:${CP2}|ticket:${world.TP}`, `tag|concept:${CP2}|ticket:${TQ}`,
    ]));
  });

  it('27.506 a concept is a centre too: its items are ring 1; a hidden concept and one of another workspace are the 404 an unknown id gets', async () => {
    const centred = await ring('memberIn', `concept:${CP}`, 'concepts');
    expect(refs(centred)).toEqual([`ticket:${world.TP}`]);
    const unknown = await getRing('memberOut', query(`concept:${newUlid()}`, 'concepts'));
    expect(unknown).toEqual({ status: 404, body: '{"error":"not_found"}' });
    expect(await getRing('memberOut', query(`concept:${CWE}`, 'concepts'))).toEqual(unknown);
    expect(await getRing('memberIn', query(`concept:${CF}`, 'concepts'))).toEqual(unknown);
    // Control: the owner may centre on CWE.
    expect(refs(await ring('owner', `concept:${CWE}`, 'concepts')).sort()).toEqual([`note:${world.NOTES.nWorkspace}`, `ticket:${world.TE}`].sort());
  });
});

describe('27.507 the ring read draws model suggestions as concepts, for members who see every item', () => {
  const core = () => ({
    [S1]: { items: [ticket(world.TP), note(world.NOTES.nProject), note(world.NOTES.nWorkspace)] },
    [S2]: { items: [ticket(world.TE), note(world.NOTES.nProject), note(world.NOTES.nWorkspace)] },
    [SG]: { items: [ticket(world.TE), note(world.NOTES.nExplicit)] },
  });

  it('27.507 memberIn gets S1 and its tag edge with suggested: true (CP\'s false); memberOut never gets S2 (TE hidden); guestListed never gets SG although hiddenItems answers []; controls: the owner gets S2 and SG, memberOut gets S1', async () => {
    await withSuggestions(core(), async () => {
      const mine = await ring('memberIn', `ticket:${world.TP}`, 'concepts');
      expect(mine.items.find((item) => item.ref === `concept:${S1}`)).toEqual({
        ref: `concept:${S1}`, kind: 'concept', id: S1, workspaceId: world.WS, projectId: null,
        label: LABEL, title: null, category: null, hop: 1, out: false, suggested: true,
      });
      expect(mine.edges.find((edge) => edge.id === `tag|concept:${S1}|ticket:${world.TP}`)).toEqual({
        id: `tag|concept:${S1}|ticket:${world.TP}`, kind: 'tag', from: `concept:${S1}`, to: `ticket:${world.TP}`,
        snippet: null, addedBy: null, addedAt: null, origin: null, suggested: true,
      });
      // The same response draws a confirmed concept and its edge `suggested: false`, so no one hard-coded value passes both.
      expect(mine.items.find((item) => item.ref === `concept:${CP}`)?.suggested).toBe(false);
      expect(mine.edges.find((edge) => edge.id === `tag|concept:${CP}|ticket:${world.TP}`)?.suggested).toBe(false);

      // Every item visible: S2 holds TE, which memberOut cannot read (one item of three).
      const outside = await ring('memberOut', `note:${world.NOTES.nWorkspace}`, 'concepts');
      expect(refs(outside)).toContain(`concept:${S1}`); // Rule A, and the precondition that the arm runs for this reader at all
      expect(refs(outside)).not.toContain(`concept:${S2}`);
      expect(touching(outside, `concept:${S2}`)).toEqual([]);
      // Control: the owner, who reads TE, gets S2 from the same centre, so its absence above is the visibility rule, not the walk.
      expect(refs(await ring('owner', `note:${world.NOTES.nWorkspace}`, 'concepts'))).toEqual(expect.arrayContaining([`concept:${S1}`, `concept:${S2}`]));

      // Members only: guestListed reads both of SG's items, so only the guest rule can drop it.
      const guestEff = await resolveEffectiveRole(db.pool, ids.guestListed, world.WS);
      expect(await hiddenItems(db.pool, guestEff, ids.guestListed, world.WS, [ticket(world.TE), note(world.NOTES.nExplicit)])).toEqual([]);
      const guest = await ring('guestListed', `ticket:${world.TE}`, 'concepts');
      expect(refs(guest)).toContain(`concept:${CE}`); // precondition: the guest's ring is not empty for some other reason
      expect(refs(guest)).not.toContain(`concept:${SG}`);
      expect(touching(guest, `concept:${SG}`)).toEqual([]);
      // Control: the owner gets SG from the same centre.
      expect(refs(await ring('owner', `ticket:${world.TE}`, 'concepts'))).toEqual(expect.arrayContaining([`concept:${CE}`, `concept:${SG}`]));
    });
  });

  it('27.507 a suggestion is a centre too; S2 for memberOut, SG for the guest and another workspace\'s SF are the 404 an unknown id gets', async () => {
    await withSuggestions({ ...core(), [SF]: { items: [ticket(newUlid()), ticket(newUlid()), ticket(newUlid())], workspaceId: FW } }, async () => {
      const centred = await ring('memberIn', `concept:${S1}`, 'concepts');
      expect(refs(centred).sort()).toEqual([`note:${world.NOTES.nProject}`, `note:${world.NOTES.nWorkspace}`, `ticket:${world.TP}`].sort());
      expect(centred.center).toMatchObject({ ref: `concept:${S1}`, label: LABEL, suggested: true });
      expect(centred.edges.map((edge) => [edge.id, edge.suggested]).sort()).toEqual([
        [`tag|concept:${S1}|note:${world.NOTES.nProject}`, true],
        [`tag|concept:${S1}|note:${world.NOTES.nWorkspace}`, true],
        [`tag|concept:${S1}|ticket:${world.TP}`, true],
      ].sort());
      const unknown = await getRing('memberOut', query(`concept:${newUlid()}`, 'concepts'));
      expect(unknown).toEqual({ status: 404, body: '{"error":"not_found"}' });
      expect(await getRing('memberOut', query(`concept:${S2}`, 'concepts'))).toEqual(unknown);
      expect(await getRing('guestListed', query(`concept:${SG}`, 'concepts'))).toEqual(unknown);
      expect(await getRing('memberIn', query(`concept:${SF}`, 'concepts'))).toEqual(unknown);
      // Control: the owner may centre on S2.
      expect(refs(await ring('owner', `concept:${S2}`, 'concepts'))).toContain(`ticket:${world.TE}`);
      // The read the ring resolves through answers only the ids it is asked about (control: unasked, the owner's three).
      const ownerEff = await resolveEffectiveRole(db.pool, ids.owner, world.WS);
      expect((await visibleSuggestions(db.pool, ownerEff, ids.owner, world.WS)).map((row) => row.id).sort(), 'control').toEqual([S1, S2, SG].sort());
      expect((await visibleSuggestions(db.pool, ownerEff, ids.owner, world.WS, [S1])).map((row) => row.id)).toEqual([S1]);
    });
  });

  it('27.507 graph/path steps through a suggestion: TP to nWorkspace is exactly [TP, S1, nWorkspace], both edges suggested', async () => {
    await withSuggestions(core(), async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/v1/graph/path?${new URLSearchParams({ from: `ticket:${world.TP}`, to: `note:${world.NOTES.nWorkspace}`, groups: 'concepts' }).toString()}`,
        headers: { authorization: `Bearer ${tokens.memberIn}` },
      });
      expect(res.statusCode, res.body).toBe(200);
      const body = res.json() as GraphPathResponse;
      expect(body.paths.map((path) => path.refs)).toEqual([[`ticket:${world.TP}`, `concept:${S1}`, `note:${world.NOTES.nWorkspace}`]]);
      expect(body.paths[0]!.edges.map((edge) => [edge.id, edge.suggested])).toEqual([
        [`tag|concept:${S1}|ticket:${world.TP}`, true],
        [`tag|concept:${S1}|note:${world.NOTES.nWorkspace}`, true],
      ]);
    });
  });

  it('27.507 a rejected or confirmed suggestion is not drawn (its row waits for the job), and the confirmed concept reads suggested: false; another workspace\'s rejection or concept hides nothing; a deleted concept gives its suggestion back', async () => {
    const tpTq = [ticket(world.TP), ticket(TQ)];
    await withSuggestions({ [SR]: { items: [...tpTq, note(world.NOTES.nProject)] }, [SA]: { items: [...tpTq, note(world.NOTES.nWorkspace)] } }, async (cached) => {
      const drawn = async () => refs(await ring('memberIn', `ticket:${world.TP}`, 'concepts')).filter((ref) => ref === `concept:${SR}` || ref === `concept:${SA}`).sort();
      const both = [`concept:${SA}`, `concept:${SR}`].sort();
      expect(await drawn(), 'control: both are drawn before anything is resolved').toEqual(both);
      // A suggestion in the ring and TQ in the ring: their tag is returned AMONG the ring.
      const among = await ring('memberIn', `ticket:${world.TP}`, 'blocks,concepts');
      expect(among.edges.find((edge) => edge.id === `tag|concept:${SR}|ticket:${TQ}`)?.suggested).toBe(true);

      // The same signature rejected, and a concept made from SA, in ANOTHER workspace: neither hides anything here.
      const CA = newUlid(), CFA = newUlid();
      await applyCommitted(db.pool, [
        makeCommitted({ workspaceId: FW, actorId: world.ids.owner, entity: { kind: 'workspace', id: FW }, type: 'workspace.concept_suggestion_rejected', payload: cached[SR] }),
        makeCommitted({ workspaceId: FW, actorId: world.ids.owner, entity: { kind: 'concept', id: CFA }, type: 'concept.created', payload: { name: 'Elsewhere too', fromSuggestion: SA } }),
      ]);
      expect(await drawn(), 'another workspace resolves nothing here').toEqual(both);

      const unknown = await getRing('memberIn', query(`concept:${newUlid()}`, 'concepts'));
      await applyCommitted(db.pool, [
        makeCommitted({ workspaceId: world.WS, actorId: world.ids.memberIn, entity: { kind: 'workspace', id: world.WS }, type: 'workspace.concept_suggestion_rejected', payload: cached[SR] }),
      ]);
      expect(await drawn(), 'rejected: SR is gone, SA is not').toEqual([`concept:${SA}`]);
      expect(await getRing('memberIn', query(`concept:${SR}`, 'concepts'))).toEqual(unknown);

      await applyCommitted(db.pool, [
        cev(CA, 'concept.created', { name: 'Accepted', fromSuggestion: SA }, 'memberIn'),
        cev(CA, 'concept.item_tagged', { itemKind: 'ticket', itemId: world.TP }, 'memberIn'),
      ]);
      const confirmed = await ring('memberIn', `ticket:${world.TP}`, 'concepts');
      expect(refs(confirmed)).not.toContain(`concept:${SA}`);
      expect(confirmed.items.find((item) => item.ref === `concept:${CA}`)).toMatchObject({ label: 'Accepted', suggested: false });
      expect(confirmed.edges.find((edge) => edge.id === `tag|concept:${CA}|ticket:${world.TP}`)?.suggested).toBe(false);

      await applyCommitted(db.pool, [cev(CA, 'concept.deleted', {}, 'memberIn')]);
      expect(await drawn(), 'a deleted concept no longer resolves SA, as the job would offer its group again').toEqual([`concept:${SA}`]);
    });
  });
});

describe('27.513 the server has no semantic switch to hear (spec D §7 case 9, the server half)', () => {
  it('27.513 `semantic=off` changes nothing: the body is byte-equal, and it holds a concept item', async () => {
    const plain = await getRing('memberIn', query(`ticket:${world.TP}`, 'concepts'));
    expect(plain.status).toBe(200);
    // Precondition: the body holds a concept, so two empty rings cannot be "equal".
    expect((JSON.parse(plain.body) as GraphRingResponse).items.some((item) => item.kind === 'concept')).toBe(true);
    expect(await getRing('memberIn', `${query(`ticket:${world.TP}`, 'concepts')}&semantic=off`)).toEqual(plain);
  });
});
