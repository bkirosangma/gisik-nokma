import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { domainRegistry, makeEnvelope, newUlid, type LedgerEvent, type SuggestionListResponse } from '@gisik-nokma/domain';
import { checkPermission } from '../../src/permissions/check-permission.js';
import { resolveEffectiveRole } from '../../src/permissions/effective-role.js';
import { hiddenItems, type ItemRef } from '../../src/read/item-visibility.js';
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
 * not read nWorkspace). Everything is seeded with `applyCommitted` before the one describe that writes through the
 * door (27.496, last): a door write takes the ledger's next seqs.
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
const [S2, S1] = [newUlid(), newUlid()].sort() as [string, string];
const S3 = newUlid();
const SF = newUlid(); // a suggestion of ANOTHER workspace
const FW = newUlid();
const TX = newUlid();

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
  it('27.493 memberIn may reject S1 and not S2 (as a made-up signature, or another workspace’s), nor S1 with S2’s hashes; the owner may reject S2; a guest is refused permission.concept', async () => {
    expect(await reject('memberIn', cached.S1.signature, cached.S1.itemHashes)).toBeNull();
    expect(await reject('memberIn', cached.S1.signature, [...cached.S1.itemHashes].reverse())).toBeNull(); // any order
    expect(await reject('memberIn', cached.S2.signature, cached.S2.itemHashes)).toEqual(UNKNOWN);
    expect(await reject('memberIn', 'f'.repeat(64), cached.S1.itemHashes)).toEqual(UNKNOWN);
    expect(await reject('memberIn', cached.S1.signature, cached.S2.itemHashes)).toEqual(UNKNOWN);
    expect(await reject('memberIn', cached.SF.signature, cached.SF.itemHashes)).toEqual(UNKNOWN); // another workspace's
    expect(await reject('owner', cached.S2.signature, cached.S2.itemHashes)).toBeNull();
    expect(await reject('guestListed', cached.S1.signature, cached.S1.itemHashes)).toEqual(GUEST);
  });
});

describe('27.495 concept.created { fromSuggestion } at the door', () => {
  it('27.495 a random id and another workspace’s suggestion are unknown; S1 is admitted for memberIn; S2 is unknown to memberIn and admitted for the owner', async () => {
    expect(await createFrom('memberIn', newUlid())).toEqual(UNKNOWN);
    expect(await createFrom('memberIn', SF)).toEqual(UNKNOWN);
    expect(await createFrom('memberIn', S1)).toBeNull();
    expect(await createFrom('memberIn', S2)).toEqual(UNKNOWN);
    expect(await createFrom('owner', S2)).toBeNull();
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
    const [TA, TB] = [newUlid(), newUlid()].sort() as [string, string];
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
