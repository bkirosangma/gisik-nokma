import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { domainRegistry, makeEnvelope, newUlid, type GraphRingResponse, type LedgerEvent, type SuggestionListResponse, type Ulid } from '@gisik-nokma/domain';
import { checkPermission } from '../../src/permissions/check-permission.js';
import { resolveEffectiveRole } from '../../src/permissions/effective-role.js';
import { hiddenItems, type ItemRef } from '../../src/read/item-visibility.js';
import { openSuggestionIds } from '../../src/read/suggestions.js';
import { itemHash, itemKey, parseItemKey, signatureOf } from '../../src/semantic/signature.js';
import { visibleEventsFor, type SyncItem } from '../../src/visibility/visible-events-for.js';
import { buildTestApp } from '../helpers/app.js';
import { applyCommitted, makeCommitted } from '../helpers/apply.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { NOTES_USERS, seedNotesFixture, type NotesFixture, type NotesUser } from '../helpers/notes-fixture.js';
import { signInWithPhone } from '../helpers/session.js';

/**
 * Knowledge Graph spec D §4.1–§4.3 (KG-D Task 5): the suggestions read, the rejection door, `fromSuggestion` at the
 * door and the census, cases 27.492–27.497 (`test-cases/27-knowledge-graph.md` §27.D; 27.497's History sentence is
 * `packages/app-core/test/concept-history-copy.test.ts`).
 *
 * The world is `seedNotesFixture` around seven signed-in people, and the suggestions are rows written straight into
 * `sem_suggestions` (the job's own tests are `job.test.ts`). Who sees what on the ref (Rule A, planner ruling
 * 2026-10-04, report Q1): every member is on every founded project (`effective-role.ts:5-19`), so S1 = {TP, nProject,
 * nWorkspace} is read by every non-guest, `memberOut` included. S2 = {nWorkspace, nExplicit, TE} is read by the owner
 * alone (TE and nExplicit are explicit `[guestListed]`, nExplicit's author arm admits `author`, and `guestListed` does
 * not read nWorkspace). S4 = {TE, nWorkspace, nProject} hides exactly ONE item (TE) from `memberIn`; the two door cases
 * write it and remove it inside their own `it` (`withS4`), so no other case's exact list holds it. Everything is seeded
 * with `applyCommitted` before the describes that write through the door (27.496, then 27.550–27.551, last): a door
 * write takes the ledger's next seqs.
 *
 * 27.550–27.551 (task kg-sl6-suggested-arm, planner 12:42): a RESOLVED suggestion (rejected, or a concept made from it
 * that is live, or merged into a live one: planner 14:14) is gone from the list and the door before the job's next run
 * drops its row (`openSuggestionIds`). Their rows hold two more project tickets, R1 and R2 (every non-guest reads them,
 * as TP), and live only inside their own `it`.
 */
type Who = NotesUser | 'outsider';
let db: TestDatabase;
let app: FastifyInstance;
let world: NotesFixture;
const tokens = {} as Record<Who, string>;
const ids = {} as Record<Who, string>;
const NOT_FOUND = '{"error":"not_found"}';
const UNKNOWN = { refused: true, rule: 'suggestion.unknown', reason: 'That suggestion does not exist or you cannot see it.' };
const GUEST = { refused: true, rule: 'permission.concept', reason: 'Guests can read concepts but cannot change them.' };
// S2's id sorts BEFORE S1's and its score is lower, so "highest score first" and "id order" disagree.
const [S2, S1] = [newUlid(), newUlid()].sort() as [Ulid, Ulid];
const S3 = newUlid();
const S4 = newUlid(); // ONE item hidden from memberIn; written and removed inside a door `it` (`withS4`)
const SF = newUlid(); // a suggestion of ANOTHER workspace
const FW = newUlid();
const TX = newUlid();
const [R1, R2] = [newUlid(), newUlid()]; // 27.550–27.551's items (project tickets, read by every non-guest)

type Cached = { id: string; signature: string; itemHashes: string[]; keys: string[] };
const cached = {} as Record<'S1' | 'S2' | 'S3' | 'SF', Cached>;

/** A row as the job writes one: items in sorted key order, `itemHash` per key, `signatureOf` the keys. */
async function cache(id: string, items: ItemRef[], score: number, partitionKey: string, workspaceId = world.WS): Promise<Cached> {
  const keys = items.map((item) => itemKey(item.kind, item.id)).sort();
  const refs = keys.map(parseItemKey);
  const row = { id, signature: signatureOf(keys), itemHashes: keys.map(itemHash), keys };
  await db.pool.query(
    `INSERT INTO sem_suggestions (id, workspace_id, signature, partition_key, item_kind, item_id, item_hashes, terms, label, score, computed_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, '2026-10-05T10:00:00Z')`,
    [id, workspaceId, row.signature, partitionKey, refs.map((r) => r.kind), refs.map((r) => r.id), row.itemHashes, ['licence', 'renewal'], 'licence · renewal', score],
  );
  return row;
}
const get = (who: Who, url: string) => app.inject({ method: 'GET', url, headers: { authorization: `Bearer ${tokens[who]}` } });
async function listIds(who: Who): Promise<string[]> {
  const res = await get(who, `/v1/workspaces/${world.WS}/suggestions`);
  expect(res.statusCode, `${who} ${res.body}`).toBe(200);
  return (res.json() as SuggestionListResponse).suggestions.map((s) => s.id);
}
function tev(ticketId: string, type: string, payload: Record<string, unknown>): LedgerEvent {
  return makeCommitted({ workspaceId: world.WS, actorId: world.ids.owner, entity: { kind: 'ticket', id: ticketId }, type, payload });
}
/** An envelope through the real gate, as `test/concepts/door.test.ts` puts one. */
function gate(who: NotesUser, entity: { kind: 'workspace' | 'concept'; id: string }, type: string, payload: unknown) {
  const env = makeEnvelope({ type, payload, entity, workspaceId: world.WS, actorId: world.ids[who], origin: 'web' });
  return checkPermission(env, { db: db.pool, sessionUserId: world.ids[who] });
}
const reject = (who: NotesUser, signature: string, itemHashes: string[]) =>
  gate(who, { kind: 'workspace', id: world.WS }, 'workspace.concept_suggestion_rejected', { signature, itemHashes });
const createFrom = (who: NotesUser, fromSuggestion: string) =>
  gate(who, { kind: 'concept', id: newUlid() }, 'concept.created', { name: 'From a suggestion', fromSuggestion });
/**
 * S4 = {TE, nWorkspace, nProject}: `memberIn` reads both notes (Rule A) and not TE, so S4 hides EXACTLY one item from
 * it, which no other row does (S2 hides two). The row lives only inside the calling `it`: the other cases' lists are
 * exact, and S4's items are the equal-scores case's first set (a signature is unique per workspace). The control runs
 * before any leg, so a leg can never quietly test a row that hides two.
 */
async function withS4(legs: (row: Cached) => Promise<void>): Promise<void> {
  const row = await cache(S4, [{ kind: 'ticket', id: world.TE }, { kind: 'note', id: world.NOTES.nWorkspace }, { kind: 'note', id: world.NOTES.nProject }], 0.2, 'i:mixed');
  try {
    const eff = await resolveEffectiveRole(db.pool, world.ids.memberIn, world.WS);
    const hidden = await hiddenItems(db.pool, eff, world.ids.memberIn, world.WS, row.keys.map(parseItemKey));
    expect(hidden, 'control: S4 hides exactly one item (TE) from memberIn').toEqual([{ kind: 'ticket', id: world.TE }]);
    await legs(row);
  } finally {
    expect((await db.pool.query('DELETE FROM sem_suggestions WHERE id = $1', [S4])).rowCount, 'S4 is removed before the it ends').toBe(1);
  }
}

beforeAll(async () => {
  db = await createTestDatabase();
  const built = buildTestApp(db);
  app = built.app;
  await app.ready();
  for (const [index, who] of [...NOTES_USERS, 'outsider' as const].entries()) {
    const user = await signInWithPhone(app, built.otp, `+911100047${String(500 + index)}`);
    ids[who] = user.userId;
    tokens[who] = user.token;
  }
  world = await seedNotesFixture(db.pool, Object.fromEntries(NOTES_USERS.map((who) => [who, ids[who]])) as Record<NotesUser, string>);
  const { TP, TE, NOTES } = world;
  cached.S1 = await cache(S1, [{ kind: 'ticket', id: TP }, { kind: 'note', id: NOTES.nProject }, { kind: 'note', id: NOTES.nWorkspace }], 0.9, `p:${world.P}`);
  cached.S2 = await cache(S2, [{ kind: 'note', id: NOTES.nWorkspace }, { kind: 'note', id: NOTES.nExplicit }, { kind: 'ticket', id: TE }], 0.5, 'i:mixed');
  cached.SF = await cache(SF, [{ kind: 'ticket', id: newUlid() }, { kind: 'ticket', id: newUlid() }, { kind: 'ticket', id: newUlid() }], 0.7, 'w', FW);
  await applyCommitted(db.pool, [
    tev(R1, 'ticket.created', { typeId: 'task', projectId: world.P, parentId: null, title: 'Collect the licence' }),
    tev(R2, 'ticket.created', { typeId: 'task', projectId: world.P, parentId: null, title: 'Frame the licence' }),
  ]);
}, 120_000);
afterAll(async () => {
  await app.close();
  await db.drop();
});

describe('27.492 the suggestions read is D4 per reader', () => {
  it('27.492 memberIn and memberOut get S1 and not S2, every non-guest agrees with hiddenItems, highest score first; a guest and an outsider get the 404; control: the owner gets S1 and S2', async () => {
    expect(await listIds('owner')).toEqual([S1, S2]); // the control, in score order (S2's id sorts first)
    expect(await listIds('memberIn')).toEqual([S1]);
    expect(await listIds('memberOut')).toEqual([S1]); // Rule A
    for (const who of ['guestListed', 'guestUnlisted', 'outsider'] as Who[]) {
      const res = await get(who, `/v1/workspaces/${world.WS}/suggestions`);
      expect({ status: res.statusCode, body: res.body }, who).toEqual({ status: 404, body: NOT_FOUND });
    }
    // The agreement, for every non-guest: a row is served exactly when hiddenItems answers none of its items.
    const rows = [cached.S1, cached.S2];
    const answers = new Set<string>();
    for (const who of NOTES_USERS.filter((w) => !w.startsWith('guest'))) {
      const eff = await resolveEffectiveRole(db.pool, world.ids[who], world.WS);
      const expected: string[] = [];
      for (const row of rows) {
        if ((await hiddenItems(db.pool, eff, world.ids[who], world.WS, row.keys.map(parseItemKey))).length === 0) expected.push(row.id);
      }
      const served = await listIds(who);
      expect(served, who).toEqual(expected);
      answers.add(served.join(','));
    }
    expect(answers.size, 'the answer is not the same for everyone').toBeGreaterThan(1);
    // One whole view: the items labelled as a concept's are, in the row's key order.
    const res = await get('memberIn', `/v1/workspaces/${world.WS}/suggestions`);
    expect(res.json()).toEqual({
      workspaceId: world.WS,
      suggestions: [
        {
          id: S1,
          label: 'licence · renewal',
          terms: ['licence', 'renewal'],
          score: 0.9,
          computedAt: '2026-10-05T10:00:00.000Z',
          signature: cached.S1.signature,
          itemHashes: cached.S1.itemHashes,
          items: cached.S1.keys.map((key) => {
            const ref = parseItemKey(key);
            const label = ref.id === world.TP ? 'CCRE-1 Renew the trade licence' : ref.id === world.NOTES.nProject ? 'Project' : 'Workspace';
            return { ...ref, label };
          }),
        },
      ],
    });
  });
});

describe('27.493 the rejection door', () => {
  it('27.493 memberIn may reject S1 and not S2 (as a made-up signature, or another workspace’s), nor S1 with S2’s hashes, nor S4, which hides ONE item from memberIn; the owner may reject S2 and S4; a guest is refused permission.concept', async () => {
    expect(await reject('memberIn', cached.S1.signature, cached.S1.itemHashes)).toBeNull();
    expect(await reject('memberIn', cached.S1.signature, [...cached.S1.itemHashes].reverse())).toBeNull(); // any order
    expect(await reject('memberIn', cached.S2.signature, cached.S2.itemHashes)).toEqual(UNKNOWN);
    expect(await reject('memberIn', 'f'.repeat(64), cached.S1.itemHashes)).toEqual(UNKNOWN);
    expect(await reject('memberIn', cached.S1.signature, cached.S2.itemHashes)).toEqual(UNKNOWN);
    expect(await reject('memberIn', cached.SF.signature, cached.SF.itemHashes)).toEqual(UNKNOWN); // another workspace's
    expect(await reject('owner', cached.S2.signature, cached.S2.itemHashes)).toBeNull();
    expect(await reject('guestListed', cached.S1.signature, cached.S1.itemHashes)).toEqual(GUEST);
    await withS4(async (s4) => {
      expect(await reject('memberIn', s4.signature, s4.itemHashes)).toEqual(UNKNOWN); // one hidden item is enough
      expect(await reject('owner', s4.signature, s4.itemHashes)).toBeNull();
    });
  });
});

describe('27.495 concept.created { fromSuggestion } at the door', () => {
  it('27.495 a random id and another workspace’s suggestion are unknown; S1 is admitted for memberIn; S2, and S4 (ONE item hidden), are unknown to memberIn and admitted for the owner', async () => {
    expect(await createFrom('memberIn', newUlid())).toEqual(UNKNOWN);
    expect(await createFrom('memberIn', SF)).toEqual(UNKNOWN);
    expect(await createFrom('memberIn', S1)).toBeNull();
    expect(await createFrom('memberIn', S2)).toEqual(UNKNOWN);
    expect(await createFrom('owner', S2)).toBeNull();
    await withS4(async () => {
      expect(await createFrom('memberIn', S4)).toEqual(UNKNOWN); // one hidden item is enough
      expect(await createFrom('owner', S4)).toBeNull();
    });
    // Control: without `fromSuggestion` the same create is admitted.
    expect(await gate('memberIn', { kind: 'concept', id: newUlid() }, 'concept.created', { name: 'Plain' })).toBeNull();
  });
});

describe('27.497 the workspace.concept_* census', () => {
  it('27.497 exactly one workspace.concept_* type, and a guest is refused it by the door; control: workspace.renamed by a guest is refused by its own rule', async () => {
    const types = domainRegistry
      .registrations()
      .map((r) => r.type)
      .filter((type) => type.startsWith('workspace.concept_'));
    expect(types).toEqual(['workspace.concept_suggestion_rejected']);
    for (const type of types) {
      expect(await gate('guestListed', { kind: 'workspace', id: world.WS }, type, { signature: cached.S1.signature, itemHashes: cached.S1.itemHashes }), type).toEqual(GUEST);
    }
    expect(await gate('guestListed', { kind: 'workspace', id: world.WS }, 'workspace.renamed', { name: 'Mine' })).toMatchObject({ refused: true, rule: 'permission.role' });
  });
});

describe('27.494 a reader who sees a ticket only as its assignee (Review Focus 2)', () => {
  it('27.494 memberOut is served S3 through the assignee arm although its partition names only the owner, and not after a reassignment; control: memberIn never', async () => {
    await applyCommitted(db.pool, [
      tev(TX, 'ticket.created', { typeId: 'task', projectId: world.P, parentId: null, title: 'Lock the cash drawer' }),
      tev(TX, 'visibility.set', { ticketId: TX, mode: 'explicit', userIds: [world.ids.owner] }),
      tev(TX, 'ticket.assigned', { assigneeId: world.ids.memberOut }),
    ]);
    cached.S3 = await cache(S3, [{ kind: 'ticket', id: TX }, { kind: 'note', id: world.NOTES.nWorkspace }, { kind: 'note', id: world.NOTES.nProject }], 0.1, `e:${world.ids.owner}`);
    expect(await listIds('memberOut')).toEqual([S1, S3]);
    expect(await listIds('memberIn')).toEqual([S1]);
    await applyCommitted(db.pool, [tev(TX, 'ticket.assigned', { assigneeId: world.ids.owner })]);
    expect(await listIds('memberOut')).toEqual([S1]);
    expect(await listIds('memberIn')).toEqual([S1]);
    expect(await listIds('owner')).toEqual([S1, S2, S3]);
  });
});

describe('27.492 equal scores', () => {
  it('27.492 two rows with one score come in id order, so the MCP offset cursor pages a stable list; control: the scores above and below keep their places', async () => {
    // Item sets unlike S1–S3's (a signature is unique per workspace); TE makes both the owner's alone.
    const owned: ItemRef[] = [{ kind: 'ticket', id: world.TE }, { kind: 'note', id: world.NOTES.nProject }];
    const sets: ItemRef[][] = [[...owned, { kind: 'note', id: world.NOTES.nWorkspace }], [...owned, { kind: 'note', id: world.NOTES.nExplicit }]];
    const sig = (items: ItemRef[]) => signatureOf(items.map((item) => itemKey(item.kind, item.id)).sort());
    const [lowSig, highSig] = [...sets].sort((a, b) => (sig(a) < sig(b) ? -1 : 1)) as [ItemRef[], ItemRef[]];
    // Without the tie-break the two come in heap order or (through the unique index) signature order. Both are made
    // the REVERSE of id order: the higher id TB gets the lower signature and is written first.
    const [TA, TB] = [newUlid(), newUlid()].sort() as [Ulid, Ulid];
    await cache(TB, lowSig, 0.3, 'i:mixed');
    await cache(TA, highSig, 0.3, 'i:mixed');
    const unsorted = await db.pool.query<{ id: string }>('SELECT id FROM sem_suggestions WHERE workspace_id = $1 AND score = $2::real', [world.WS, 0.3]);
    expect(unsorted.rows.map((row) => row.id), 'control: unsorted, TB comes first').toEqual([TB, TA]);
    expect(await listIds('owner')).toEqual([S1, S2, TA, TB, S3]);
  });
});

// LAST: it writes through the door, which takes the ledger's next seqs.
describe('27.496 a rejection reaches the workspace stream as hashes only', () => {
  it('27.496 through the events route it lands in proj_concept_rejections and memberIn’s stream carries exactly { signature, itemHashes }; control: no concept event streams', async () => {
    const CP = newUlid();
    await applyCommitted(db.pool, [
      makeCommitted({ workspaceId: world.WS, actorId: world.ids.owner, entity: { kind: 'concept', id: CP }, type: 'concept.created', payload: { name: 'Licences' } }),
      makeCommitted({ workspaceId: world.WS, actorId: world.ids.owner, entity: { kind: 'concept', id: CP }, type: 'concept.item_tagged', payload: { itemKind: 'ticket', itemId: world.TP } }),
    ]);
    const raw = await db.pool.query<{ n: number }>(`SELECT count(*)::int AS n FROM events WHERE workspace_id = $1 AND entity_kind = 'concept'`, [world.WS]);
    expect(raw.rows[0]?.n).toBeGreaterThanOrEqual(2); // a "no concept event streams" over a stream with none cannot fail

    const res = await app.inject({
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
            entity: { kind: 'workspace', id: world.WS },
            type: 'workspace.concept_suggestion_rejected',
            payload: { signature: cached.S1.signature, itemHashes: cached.S1.itemHashes },
            actorId: ids.memberIn,
          },
        ],
      },
    });
    expect((res.json() as { results: Array<Record<string, unknown>> }).results[0]).toMatchObject({ status: 'committed' });
    const landed = await db.pool.query('SELECT signature, item_hashes, rejected_by, origin FROM proj_concept_rejections WHERE workspace_id = $1', [world.WS]);
    expect(landed.rows).toEqual([{ signature: cached.S1.signature, item_hashes: cached.S1.itemHashes, rejected_by: world.ids.memberIn, origin: 'web' }]);

    const items: SyncItem[] = [];
    for await (const item of visibleEventsFor(db.pool, world.ids.memberIn, world.WS, 0)) items.push(item);
    const events = items.filter((item): item is LedgerEvent => !('kind' in item));
    const rejections = events.filter((event) => event.type === 'workspace.concept_suggestion_rejected');
    expect(rejections.map((event) => event.payload)).toEqual([{ signature: cached.S1.signature, itemHashes: cached.S1.itemHashes }]);
    const text = JSON.stringify(rejections[0]?.payload);
    for (const key of cached.S1.keys) expect(text).not.toContain(parseItemKey(key).id);
    expect(events.filter((event) => event.entity.kind === 'concept')).toEqual([]);
  });
});

/** One event through `POST /v1/events` (the real door, then the commit), as `test/concepts/reads.test.ts` posts one. */
async function submit(who: NotesUser, entity: { kind: 'workspace' | 'concept'; id: string }, type: string, payload: unknown): Promise<Record<string, unknown>> {
  const res = await app.inject({
    method: 'POST',
    url: '/v1/events',
    headers: { authorization: `Bearer ${tokens[who]}` },
    payload: { events: [{ id: newUlid(), version: 1, origin: 'web', clientTime: new Date().toISOString(), workspaceId: world.WS, entity, type, payload, actorId: ids[who] }] },
  });
  return (res.json() as { results: Array<Record<string, unknown>> }).results[0]!;
}
const COMMITTED = { status: 'committed' };
const REFUSED = { status: 'refused', rule: UNKNOWN.rule, reason: UNKNOWN.reason };
/** Writes `rows` (id → items, score), runs `legs`, and removes every row before the `it` ends. */
async function withRows(rows: Array<[string, ItemRef[], number]>, legs: (byId: Record<string, Cached>) => Promise<void>): Promise<void> {
  const byId: Record<string, Cached> = {};
  try {
    for (const [id, items, score] of rows) byId[id] = await cache(id, items, score, `p:${world.P}`);
    await legs(byId);
  } finally {
    const removed = await db.pool.query('DELETE FROM sem_suggestions WHERE id = ANY ($1::text[])', [rows.map(([id]) => id)]);
    expect(removed.rowCount, 'every row is removed before the it ends').toBe(rows.length);
  }
}
/** The ids of the suggestions `memberIn`'s ring centred on `center` draws (`GET /v1/graph/neighbours`, 27.507's arm). */
async function drawnFrom(center: string): Promise<string[]> {
  const res = await get('memberIn', `/v1/graph/neighbours?${new URLSearchParams({ center, hops: '1', ws: world.WS, groups: 'concepts' }).toString()}`);
  expect(res.statusCode, res.body).toBe(200);
  return (res.json() as GraphRingResponse).items.filter((item) => item.suggested).map((item) => item.id);
}
/** A route answer without its `eventId`, which differs per event: what is left must be byte-equal. */
const sansEventId = (result: Record<string, unknown>): string => JSON.stringify({ ...result, eventId: undefined });

// After 27.496: these write through the door too.
describe('27.550–27.551 a resolved suggestion is gone from the list and the door before the job drops its row', () => {
  it('27.550 the list leaves out a rejected suggestion and one a live concept was made from, and lists it again once that concept is deleted; control: an open one is listed; an item the read cannot name is listed with an empty label', async () => {
    const [SC, SD, SZ] = [newUlid(), newUlid(), newUlid()];
    const absent = newUlid(); // a ticket id with no row: `hiddenItems` ignores it, and the labels read has nothing to say
    await withRows(
      [
        [SC, [{ kind: 'ticket', id: R1 }, { kind: 'ticket', id: R2 }, { kind: 'note', id: world.NOTES.nWorkspace }], 0.35],
        [SD, [{ kind: 'ticket', id: R1 }, { kind: 'note', id: world.NOTES.nProject }, { kind: 'note', id: world.NOTES.nWorkspace }], 0.34],
        [SZ, [{ kind: 'ticket', id: R1 }, { kind: 'ticket', id: R2 }, { kind: 'ticket', id: absent }], 0.33],
      ],
      async (rows) => {
        // Control: all three are open, so all three are listed (S1 was rejected in 27.496, which is why it is not).
        expect(await listIds('memberIn')).toEqual([SC, SD, SZ]);
        const zRes = await get('memberIn', `/v1/workspaces/${world.WS}/suggestions`);
        const z = (zRes.json() as SuggestionListResponse).suggestions.find((row) => row.id === SZ);
        expect(z?.items.find((item) => item.id === absent)).toEqual({ kind: 'ticket', id: absent, label: '' });

        expect(await submit('memberIn', { kind: 'workspace', id: world.WS }, 'workspace.concept_suggestion_rejected', { signature: rows[SC]!.signature, itemHashes: rows[SC]!.itemHashes })).toMatchObject(COMMITTED);
        expect(await listIds('memberIn')).toEqual([SD, SZ]);
        expect(await listIds('owner')).not.toContain(SC); // resolved for everyone, not only for the one who rejected it

        const CD = newUlid();
        expect(await submit('memberIn', { kind: 'concept', id: CD }, 'concept.created', { name: 'Licence frames', fromSuggestion: SD })).toMatchObject(COMMITTED);
        expect(await listIds('memberIn')).toEqual([SZ]);

        expect(await submit('memberIn', { kind: 'concept', id: CD }, 'concept.deleted', {})).toMatchObject(COMMITTED);
        expect(await listIds('memberIn'), 'a deleted concept gives its suggestion back, as the job would offer the group again').toEqual([SD, SZ]);
      },
    );
  });

  it('27.551 the door refuses a second accept of an accepted suggestion, and an accept or a rejection of a rejected one, with the sentence a made-up id gets; control: an open one is accepted once; a deleted concept makes it acceptable again', async () => {
    const [SA, SB] = [newUlid(), newUlid()];
    await withRows(
      [
        [SA, [{ kind: 'ticket', id: R1 }, { kind: 'ticket', id: R2 }, { kind: 'ticket', id: world.TP }], 0.32],
        [SB, [{ kind: 'ticket', id: R2 }, { kind: 'ticket', id: world.TP }, { kind: 'note', id: world.NOTES.nProject }], 0.31],
      ],
      async (rows) => {
        const madeUp = await createFrom('memberIn', newUlid());
        expect(madeUp).toEqual(UNKNOWN);

        // Accepted once, through the door and the commit; then no second time, for anyone, in the made-up id's words.
        expect(await createFrom('memberIn', SA), 'control: an open suggestion is admitted').toBeNull();
        const CA = newUlid();
        expect(await submit('memberIn', { kind: 'concept', id: CA }, 'concept.created', { name: 'Licence work', fromSuggestion: SA })).toMatchObject(COMMITTED);
        expect(await submit('memberIn', { kind: 'concept', id: newUlid() }, 'concept.created', { name: 'Licence work again', fromSuggestion: SA })).toEqual(expect.objectContaining(REFUSED));
        expect(await createFrom('memberIn', SA)).toEqual(madeUp);
        expect(await createFrom('owner', SA)).toEqual(madeUp);
        expect(await reject('memberIn', rows[SA]!.signature, rows[SA]!.itemHashes)).toEqual(madeUp);
        const made = await db.pool.query('SELECT concept_id FROM proj_concepts WHERE workspace_id = $1 AND from_suggestion = $2', [world.WS, SA]);
        expect(made.rows, 'one suggestion, one concept').toEqual([{ concept_id: CA }]);

        // Rejected: neither accepted nor rejected again.
        expect(await reject('memberIn', rows[SB]!.signature, rows[SB]!.itemHashes), 'control: an open suggestion may be rejected').toBeNull();
        expect(await submit('memberIn', { kind: 'workspace', id: world.WS }, 'workspace.concept_suggestion_rejected', { signature: rows[SB]!.signature, itemHashes: rows[SB]!.itemHashes })).toMatchObject(COMMITTED);
        expect(await createFrom('memberIn', SB)).toEqual(madeUp);
        expect(await reject('memberIn', rows[SB]!.signature, rows[SB]!.itemHashes)).toEqual(madeUp);

        // The concept made from SA is deleted: SA may be accepted again.
        expect(await submit('memberIn', { kind: 'concept', id: CA }, 'concept.deleted', {})).toMatchObject(COMMITTED);
        expect(await createFrom('memberIn', SA)).toBeNull();
      },
    );
  });

  it('27.550 27.551 a concept merged into a live one keeps its suggestion resolved in the list, the ring and the door, to the end of a two-step merge chain, and one concept names it; once the chain’s end is deleted it is listed, drawn and admitted again; control: an open one is listed throughout', async () => {
    const [SM, SN] = [newUlid(), newUlid()];
    const items: ItemRef[] = [{ kind: 'ticket', id: R1 }, { kind: 'ticket', id: world.TP }, { kind: 'note', id: world.NOTES.nWorkspace }];
    await withRows(
      [
        [SM, items, 0.3],
        [SN, [{ kind: 'ticket', id: R2 }, { kind: 'ticket', id: world.TP }, { kind: 'note', id: world.NOTES.nWorkspace }], 0.29],
      ],
      async () => {
        const concept = (id: string) => ({ kind: 'concept' as const, id });
        /** A concept made through the route and tagged with SM's items, as `resolve_suggestion accept` makes one. */
        async function make(id: string, payload: Record<string, unknown>): Promise<void> {
          expect(await submit('memberIn', concept(id), 'concept.created', payload), `create ${id}`).toMatchObject(COMMITTED);
          for (const item of items) {
            expect(await submit('memberIn', concept(id), 'concept.item_tagged', { itemKind: item.kind, itemId: item.id }), `tag ${item.id}`).toMatchObject(COMMITTED);
          }
        }
        const named = async () =>
          (await db.pool.query('SELECT concept_id, deleted, merged_into FROM proj_concepts WHERE workspace_id = $1 AND from_suggestion = $2', [world.WS, SM])).rows;
        const madeUp = sansEventId(await submit('memberIn', concept(newUlid()), 'concept.created', { name: 'Made up', fromSuggestion: newUlid() }));
        expect(JSON.parse(madeUp), 'control: the route refuses a made-up id').toEqual(REFUSED);

        // Control: both open, so both are listed, and SM is drawn from R1 (its only row).
        expect(await listIds('memberIn')).toEqual([SM, SN]);
        expect(await drawnFrom(`ticket:${R1}`)).toEqual([SM]);

        const [CM, D, E] = [newUlid(), newUlid(), newUlid()];
        await make(CM, { name: 'Merge desk', fromSuggestion: SM });
        await make(D, { name: 'Merge target' });
        expect(await submit('memberIn', concept(CM), 'concept.merged', { intoId: D })).toMatchObject(COMMITTED);
        expect(await named(), 'a merge stores CM deleted, merged into D').toEqual([{ concept_id: CM, deleted: true, merged_into: D }]);

        // Soft, so a broken walk reports every read it reaches (the list, the ring, the door), not only the first.
        async function resolved(why: string): Promise<void> {
          expect.soft(await listIds('memberIn'), `${why}: the list`).toEqual([SN]);
          expect.soft(await drawnFrom(`ticket:${R1}`), `${why}: the ring`).toEqual([]);
          const again = await submit('memberIn', concept(newUlid()), 'concept.created', { name: 'Merge desk again', fromSuggestion: SM });
          expect.soft(sansEventId(again), `${why}: a second accept gets the made-up id's answer`).toBe(madeUp);
          expect.soft(await createFrom('memberIn', SM), `${why}: the door`).toEqual(UNKNOWN);
          expect.soft(await named(), `${why}: one concept names SM`).toEqual([{ concept_id: CM, deleted: true, merged_into: D }]);
        }
        await resolved('CM merged into D, which is live');

        // Two steps: D merged into E, which is live.
        await make(E, { name: 'Merge end' });
        expect(await submit('memberIn', concept(D), 'concept.merged', { intoId: E })).toMatchObject(COMMITTED);
        await resolved('CM → D → E, E live');

        // The chain's end is deleted: nothing live holds the group, as the job would see it, so SM is back.
        expect(await submit('memberIn', concept(E), 'concept.deleted', {})).toMatchObject(COMMITTED);
        expect(await listIds('memberIn'), 'CM → D → E, E deleted').toEqual([SM, SN]);
        expect(await drawnFrom(`ticket:${R1}`)).toEqual([SM]);
        expect(await createFrom('memberIn', SM), 'admitted again').toBeNull();
      },
    );
  });

  it('27.550 the merge walk is bounded: a merge cycle, which no door admits, ends it and leaves the suggestion open; control: a live concept made from it resolves it in the same transaction', async () => {
    const SY = newUlid();
    await withRows([[SY, [{ kind: 'ticket', id: R2 }, { kind: 'note', id: world.NOTES.nProject }, { kind: 'note', id: world.NOTES.nWorkspace }], 0.28]], async () => {
      const [CX, CY] = [newUlid(), newUlid()];
      const client = await db.pool.connect();
      try {
        // Rolled back below, so the cycle never outlives this `it`; a walk that never ends fails in a second here
        // instead of holding the test database.
        await client.query('BEGIN');
        await client.query("SET LOCAL statement_timeout = '1s'");
        expect(await openSuggestionIds(client, world.WS, [SY]), 'control: no concept, so open').toEqual([SY]);
        await client.query(
          `INSERT INTO proj_concepts (concept_id, workspace_id, name, created_by, created_at, origin, from_suggestion) VALUES ($1, $2, 'Loop', $3, now(), 'web', $4)`,
          [CX, world.WS, world.ids.owner, SY],
        );
        expect(await openSuggestionIds(client, world.WS, [SY]), 'control: a live concept made from it resolves it').toEqual([]);
        // CX merged into CY and CY into CX, stored as `proj-concepts.ts` stores a merge: both deleted, nothing live.
        await client.query(
          `INSERT INTO proj_concepts (concept_id, workspace_id, name, created_by, created_at, origin, deleted, merged_into) VALUES ($1, $2, 'Loop back', $3, now(), 'web', TRUE, $4)`,
          [CY, world.WS, world.ids.owner, CX],
        );
        await client.query('UPDATE proj_concepts SET deleted = TRUE, merged_into = $2 WHERE concept_id = $1', [CX, CY]);
        await expect(openSuggestionIds(client, world.WS, [SY])).resolves.toEqual([SY]);
      } finally {
        await client.query('ROLLBACK');
        client.release();
      }
    });
  });
});
