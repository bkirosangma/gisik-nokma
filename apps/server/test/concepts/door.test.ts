/**
 * Knowledge Graph spec D §3.3 (KG-D Task 3): the concept door, `checkConceptPermission`, driven through
 * `checkPermission` — the ONE gate the ingest service applies at the client door — as
 * `test/permissions/check-note-permission.test.ts:1-56` drives the note pass, so the chain's order is part of
 * what is asserted. Cases 27.447–27.451 and 27.453 (`test-cases/27-knowledge-graph.md` §27.4).
 *
 * The world (`seedNotesFixture`, seen through D4):
 * - CP tags TP (project P): `memberIn`, `author` and the owner see it.
 * - CW tags nWorkspace (workspace-scoped): every member sees it.
 * - CE tags TE (explicit `[guestListed]`, `notes-fixture.ts:202`): the owner and `guestListed` see it; `memberOut`
 *   and the admin do not.
 * - CQ is empty, so everyone sees it. CP < CQ < CW, minted as a sorted triple (two `newUlid()` calls in one
 *   millisecond are not guaranteed to ascend): 27.450's link legs depend on the order.
 * - CD is deleted; CX lives in a second workspace W2 (`test/purge/world.ts` `seedWorkspace`), as do TW2 and nW2.
 *
 * Every sentence below is a LITERAL, never the exported constant: a mutant that edits the constant moves an
 * imported expectation with it.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CONCEPT_EVENT_TYPES, makeEnvelope, newUlid, type ConceptEventType, type LedgerEvent, type Ulid } from '@gisik-nokma/domain';
import { checkPermission } from '../../src/permissions/check-permission.js';
import { checkPurged } from '../../src/purge/check-purged.js';
import { applyCommitted, makeCommitted } from '../helpers/apply.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { seedNotesFixture, type NotesFixture, type NotesUser } from '../helpers/notes-fixture.js';
import { noteCreated, projectCreated, seedWorkspace, ticketCreated } from '../purge/world.js';

let db: TestDatabase;
let world: NotesFixture;
let CP: string;
let CQ: string;
let CW: string;
const CE = newUlid();
const CD = newUlid();
const CX = newUlid();
const TT = newUlid(); // a trashed ticket in P
const nDel = newUlid(); // a deleted note
let TW2: string;
let nW2: string;

const UNKNOWN = { refused: true, rule: 'concept.unknown', reason: 'That concept does not exist or you cannot see it.' };
const ITEM_UNKNOWN = { refused: true, rule: 'concept.item-unknown', reason: 'That ticket or note does not exist or you cannot see it.' };
const GUEST = { refused: true, rule: 'permission.concept', reason: 'Guests can read concepts but cannot change them.' };

function cev(conceptId: string, type: string, payload: Record<string, unknown>, who: NotesUser = 'owner'): LedgerEvent {
  return makeCommitted({ workspaceId: world.WS, actorId: world.ids[who], entity: { kind: 'concept', id: conceptId }, type, payload });
}

beforeAll(async () => {
  db = await createTestDatabase();
  world = await seedNotesFixture(db.pool);
  [CP, CQ, CW] = [newUlid(), newUlid(), newUlid()].sort() as [Ulid, Ulid, Ulid];
  const ws = { workspaceId: world.WS, actorId: world.ids.owner };
  await applyCommitted(db.pool, [
    cev(CP, 'concept.created', { name: 'Licences' }),
    cev(CP, 'concept.item_tagged', { itemKind: 'ticket', itemId: world.TP }),
    cev(CW, 'concept.created', { name: 'Workspace notes' }),
    cev(CW, 'concept.item_tagged', { itemKind: 'note', itemId: world.NOTES.nWorkspace }),
    cev(CE, 'concept.created', { name: 'Invoices' }),
    cev(CE, 'concept.item_tagged', { itemKind: 'ticket', itemId: world.TE }),
    cev(CQ, 'concept.created', { name: 'Empty' }),
    cev(CD, 'concept.created', { name: 'Gone' }),
    cev(CD, 'concept.deleted', {}),
    makeCommitted({ ...ws, entity: { kind: 'ticket', id: TT }, type: 'ticket.created', payload: { typeId: 'task', projectId: world.P, parentId: null, title: 'Trashed' } }),
    makeCommitted({ ...ws, entity: { kind: 'ticket', id: TT }, type: 'ticket.deleted', payload: {} }),
    makeCommitted({ ...ws, actorId: world.ids.author, entity: { kind: 'note', id: nDel }, type: 'note.created', payload: { title: 'Deleted', homeProjectId: world.P, scope: { mode: 'workspace' } } }),
    makeCommitted({ ...ws, actorId: world.ids.author, entity: { kind: 'note', id: nDel }, type: 'note.deleted', payload: {} }),
  ]);
  // The second workspace: its own owner, project, ticket, workspace note and concept.
  const w2 = await seedWorkspace(db.pool);
  const P2 = newUlid();
  TW2 = newUlid();
  nW2 = newUlid();
  await applyCommitted(db.pool, [
    projectCreated(w2, P2, 'Elsewhere', 'EW'),
    ticketCreated(w2, TW2, P2, 'Another workspace'),
    noteCreated(w2, nW2, { title: 'Another workspace', homeProjectId: P2, scope: { mode: 'workspace' } }),
    makeCommitted({ workspaceId: w2.WS, actorId: w2.OWNER, entity: { kind: 'concept', id: CX }, type: 'concept.created', payload: { name: 'Theirs' } }),
  ]);
}, 60_000);

afterAll(async () => {
  await db.drop();
});

/** One envelope per (event, concept, actor), put through the real gate. */
async function permits(type: string, payload: unknown, conceptId: string, who: NotesUser) {
  const env = makeEnvelope({
    type,
    payload,
    entity: { kind: 'concept', id: conceptId },
    workspaceId: world.WS,
    actorId: world.ids[who],
    origin: 'web',
  });
  return checkPermission(env, { db: db.pool, sessionUserId: world.ids[who] });
}

const ticket = (itemId: string) => ({ itemKind: 'ticket', itemId });
const note = (itemId: string) => ({ itemKind: 'note', itemId });

describe('27.447 a guest can read concepts but not change them', () => {
  it('27.447 every type, on a concept the guest sees, is refused permission.concept; control: memberIn may create', async () => {
    const table: Record<ConceptEventType, Record<string, unknown>> = {
      'concept.created': { name: 'Guest concept' },
      'concept.renamed': { name: 'Renamed' },
      'concept.described': { summary: 'x' },
      'concept.item_tagged': ticket(world.TE),
      'concept.item_untagged': ticket(world.TE),
      'concept.linked': { otherId: CQ, relation: 'related' },
      'concept.unlinked': { otherId: CQ, relation: 'related' },
      'concept.merged': { intoId: CQ },
      'concept.deleted': {},
    };
    expect(Object.keys(table).sort()).toEqual([...CONCEPT_EVENT_TYPES].sort());
    for (const type of CONCEPT_EVENT_TYPES) {
      expect(await permits(type, table[type], CE, 'guestListed'), type).toEqual(GUEST);
    }
    expect(await permits('concept.created', { name: 'Mine' }, newUlid(), 'memberIn')).toBeNull();
  });
});

describe('27.448 an item the actor cannot see cannot be tagged', () => {
  it('27.448 hidden, trashed, deleted, never minted or another workspace’s: concept.item-unknown; controls: the owner tags TE and a live note', async () => {
    // TE is explicit [guestListed]: hidden from memberOut, who sees CW (a workspace note).
    expect(await permits('concept.item_tagged', ticket(world.TE), CW, 'memberOut')).toEqual(ITEM_UNKNOWN);
    expect(await permits('concept.item_tagged', ticket(world.TE), CW, 'owner')).toBeNull();
    expect(await permits('concept.item_tagged', note(world.NOTES.nProject), CW, 'owner')).toBeNull();
    // The owner reads every live item, so each refusal below is about the item, not the reader.
    expect(await permits('concept.item_tagged', ticket(TT), CW, 'owner')).toEqual(ITEM_UNKNOWN);
    expect(await permits('concept.item_tagged', note(nDel), CW, 'owner')).toEqual(ITEM_UNKNOWN);
    expect(await permits('concept.item_tagged', ticket(newUlid()), CW, 'owner')).toEqual(ITEM_UNKNOWN);
    expect(await permits('concept.item_tagged', note(newUlid()), CW, 'owner')).toEqual(ITEM_UNKNOWN);
    expect(await permits('concept.item_tagged', ticket(TW2), CW, 'owner')).toEqual(ITEM_UNKNOWN);
    expect(await permits('concept.item_tagged', note(nW2), CW, 'owner')).toEqual(ITEM_UNKNOWN);
  });
});

describe('27.449 hidden, absent and deleted concepts get one refusal', () => {
  it('27.449 concept.unknown for a hidden, a never-created, a deleted and another workspace’s concept, and for a hidden link or merge target; controls admit', async () => {
    const rename = { name: 'Renamed' };
    expect(await permits('concept.renamed', rename, CE, 'memberOut')).toEqual(UNKNOWN);
    expect(await permits('concept.renamed', rename, newUlid(), 'memberOut')).toEqual(UNKNOWN);
    expect(await permits('concept.renamed', rename, CD, 'memberOut')).toEqual(UNKNOWN);
    expect(await permits('concept.renamed', rename, CD, 'owner')).toEqual(UNKNOWN);
    expect(await permits('concept.renamed', rename, CX, 'owner')).toEqual(UNKNOWN);
    // The admin is not in TE's explicit list (the `false` cell `notes-fixture.ts:28-35` keeps).
    expect(await permits('concept.renamed', rename, CE, 'admin')).toEqual(UNKNOWN);
    // Controls: CE itself is renamable, so the refusal is about the reader; memberIn renames CP.
    expect(await permits('concept.renamed', rename, CE, 'owner')).toBeNull();
    expect(await permits('concept.renamed', rename, CP, 'memberIn')).toBeNull();

    // The OTHER concept of a link or a merge is asked too (`broader`, and the empty CQ merged: neither depends on how
    // CE's id sorts nor on what CE holds).
    expect(await permits('concept.linked', { otherId: CE, relation: 'broader' }, CW, 'memberOut')).toEqual(UNKNOWN);
    expect(await permits('concept.linked', { otherId: CE, relation: 'broader' }, CW, 'owner')).toBeNull();
    expect(await permits('concept.merged', { intoId: CE }, CQ, 'memberOut')).toEqual(UNKNOWN);
    expect(await permits('concept.merged', { intoId: CE }, CQ, 'owner')).toBeNull();
    // Before the related-stream rule (27.459): a related link to an unknown LOWER id is unknown, not "post it there".
    expect(await permits('concept.linked', { otherId: '00000000000000000000000000', relation: 'related' }, CW, 'memberIn')).toEqual(UNKNOWN);
  });
});

describe('27.450 the state rules', () => {
  it('27.450 already tagged, not tagged, self-link, self-merge, link exists, link unknown; each with its control', async () => {
    expect(await permits('concept.item_tagged', ticket(world.TP), CP, 'memberIn')).toEqual({
      refused: true,
      rule: 'concept.already-tagged',
      reason: 'That item is already in this concept.',
    });
    expect(await permits('concept.item_tagged', ticket(world.TP), CW, 'memberIn')).toBeNull();

    const notTagged = { refused: true, rule: 'concept.not-tagged', reason: 'That item is not in this concept.' };
    expect(await permits('concept.item_untagged', note(world.NOTES.nProject), CP, 'memberIn')).toEqual(notTagged);
    expect(await permits('concept.item_untagged', note(world.TP), CP, 'memberIn')).toEqual(notTagged); // TP's id, the other kind
    expect(await permits('concept.item_untagged', ticket(world.TE), CP, 'memberIn')).toEqual(notTagged); // a ticket, another id
    expect(await permits('concept.item_untagged', ticket(world.TP), CP, 'memberIn')).toBeNull();

    expect(await permits('concept.linked', { otherId: CP, relation: 'related' }, CP, 'memberIn')).toEqual({
      refused: true,
      rule: 'concept.self',
      reason: 'A concept cannot be linked to itself.',
    });
    expect(await permits('concept.linked', { otherId: CW, relation: 'related' }, CP, 'memberIn')).toBeNull();
    expect(await permits('concept.merged', { intoId: CP }, CP, 'memberIn')).toEqual({
      refused: true,
      rule: 'concept.self',
      reason: 'A concept cannot be merged into itself.',
    });
    // CP holds TP, which CW lacks: the merge waits for CW's tag (27.463). CQ holds nothing, so it may merge.
    expect(await permits('concept.merged', { intoId: CW }, CP, 'memberIn')).toEqual({
      refused: true,
      rule: 'concept.merge-incomplete',
      reason: 'One item in this concept is not yet in the concept it merges into. Add it there first.',
    });
    expect(await permits('concept.merged', { intoId: CW }, CQ, 'memberIn')).toBeNull();

    // related CP–CW, written from CP (the lower id), stored (CP, CW).
    await applyCommitted(db.pool, [cev(CP, 'concept.linked', { otherId: CW, relation: 'related' })]);
    expect(await permits('concept.linked', { otherId: CW, relation: 'related' }, CP, 'memberIn')).toEqual({
      refused: true,
      rule: 'concept.link-exists',
      reason: 'These concepts are already linked that way.',
    });
    // R1: a related link is posted and removed on the LOWER id only, whether or not it exists (27.459).
    const relatedStream = { refused: true, rule: 'concept.related-stream', reason: 'A related link is posted on the concept with the lower id.' };
    expect(await permits('concept.linked', { otherId: CP, relation: 'related' }, CW, 'memberIn')).toEqual(relatedStream);
    expect(await permits('concept.unlinked', { otherId: CP, relation: 'related' }, CW, 'memberIn')).toEqual(relatedStream);
    expect(await permits('concept.linked', { otherId: CP, relation: 'broader' }, CW, 'memberIn')).toBeNull();
    // The same relation sharing ONE end with the stored row is still a new link (CP < CQ < CW).
    expect(await permits('concept.linked', { otherId: CW, relation: 'related' }, CQ, 'memberIn')).toBeNull();
    expect(await permits('concept.linked', { otherId: CQ, relation: 'related' }, CP, 'memberIn')).toBeNull();

    expect(await permits('concept.unlinked', { otherId: CW, relation: 'broader' }, CP, 'memberIn')).toEqual({
      refused: true,
      rule: 'concept.link-unknown',
      reason: 'These concepts are not linked that way.',
    });
    expect(await permits('concept.unlinked', { otherId: CW, relation: 'related' }, CP, 'memberIn')).toBeNull();
  });
});

describe('27.451 D2: any member who sees a concept may remove from it', () => {
  it('27.451 author (not the creator) untags TP from CP and deletes CW; control: memberOut deleting CE is concept.unknown', async () => {
    const creator = await db.pool.query<{ created_by: string }>('SELECT created_by FROM proj_concepts WHERE concept_id = $1', [CP]);
    expect(creator.rows).toEqual([{ created_by: world.ids.owner }]);
    expect(await permits('concept.item_untagged', ticket(world.TP), CP, 'author')).toBeNull();
    expect(await permits('concept.deleted', {}, CW, 'author')).toBeNull();
    expect(await permits('concept.deleted', {}, CE, 'memberOut')).toEqual(UNKNOWN);
  });
});

describe('27.453 the door refuses a tag naming a purged item', () => {
  it('27.453 checkPurged refuses item_tagged/untagged naming a purged ticket or note; control: a live note passes', async () => {
    // A hand-inserted registry row (the shape `migrations/1790600000000_purge-engine.sql:7-13` declares), not the purge
    // driver: what is under test is the door's reading of the payload, and 27.452 drives the real purge.
    const goneTicket = newUlid();
    const goneNote = newUlid();
    await db.pool.query(
      `INSERT INTO purged_entities (entity_kind, entity_id, workspace_id, purged_at) VALUES ('ticket', $1, $3, now()), ('note', $2, $3, now())`,
      [goneTicket, goneNote, world.WS],
    );
    const env = (type: string, payload: unknown) =>
      makeEnvelope({ workspaceId: world.WS, entity: { kind: 'concept', id: CP }, type, payload, actorId: world.ids.owner });
    for (const type of ['concept.item_tagged', 'concept.item_untagged']) {
      expect(await checkPurged(db.pool, env(type, ticket(goneTicket))), type).toMatchObject({ refused: true, rule: 'purge.erased' });
      expect(await checkPurged(db.pool, env(type, note(goneNote))), type).toMatchObject({ refused: true, rule: 'purge.erased' });
      expect(await checkPurged(db.pool, env(type, note(world.NOTES.nProject))), type).toBeNull();
    }
  });
});
