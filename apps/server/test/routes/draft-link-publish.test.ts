import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid } from '@gisik-nokma/domain';
import { DRAFT_PUBLISH_REFUSED_RULE } from '../../src/routes/drafts-publish.js';
import { DRAFT_LINK_REFILE_REFUSED_RULE } from '../../src/ingest/ingest-service.js';
import { verifyProjections } from '../../src/tools/verify-projections.js';
import { buildProjectionRegistry } from '../../src/projections/index.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { linkWorld } from '../helpers/draft-link-world.js';
import { buildReadTestApp, type ReadWorld } from '../helpers/read-app.js';
import { scan } from '../purge/scan.js';

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

const GONE = 'The link from a ticket you can no longer see to this draft could not be filed there: This ticket is not visible to you.';
const hide = (s: string) => w.send('owner', 'visibility.set', s, { ticketId: s, mode: 'explicit', userIds: [read.userIds.owner] });
const unhide = (s: string) => w.send('owner', 'visibility.set', s, { ticketId: s, mode: 'inherit' });
const purgedCount = async (id: string): Promise<number> =>
  (await db.pool.query(`SELECT 1 FROM purged_entities WHERE entity_kind = 'ticket' AND entity_id = $1`, [id])).rows.length;

describe('28.120 the re-file on a single publish', () => {
  it('files one plain link per incoming link on S in the publish transaction; CONTROL: S held no link event before', async () => {
    const [s, d] = [newUlid(), newUlid()];
    await w.published(s);
    await w.draft(d);
    await w.fromLink(d, s, 'blocks');
    await w.fromLink(d, s, 'relates');
    expect(await w.linkEventsOn(s)).toEqual([]); // CONTROL: nothing on the public stream while D is a draft

    const published = await w.send('member', 'ticket.published', d, { projectId: w.PROJECT() });
    expect(published).toMatchObject({ status: 'committed' });
    const events = await w.linkEventsOn(s);
    expect(events.map((e) => [e.type, e.payload, e.actor_id, e.origin])).toEqual([
      ['ticket.link_added', { kind: 'blocks', targetId: d }, read.userIds.member, 'web'],
      ['ticket.link_added', { kind: 'relates', targetId: d }, read.userIds.member, 'web'],
    ]);
    const publishSeq = (await db.pool.query(`SELECT workspace_seq::int AS seq FROM events WHERE type = 'ticket.published' AND entity_id = $1`, [d])).rows[0].seq;
    expect(events.map((e) => e.seq)).toEqual([publishSeq + 1, publishSeq + 2]);

    expect((await w.stateOf('member', d)).ticketState.links).toBeUndefined();
    expect((await w.stateOf('owner', s)).ticketState.links).toEqual([
      { kind: 'blocks', targetId: d }, { kind: 'relates', targetId: d },
    ]);
    expect((await w.linkRows(d)).map((r) => [r.source_id, r.target_id, r.kind])).toEqual([[s, d, 'blocks'], [s, d, 'relates']]);
    expect(await verifyProjections({ pool: db.pool, projections: buildProjectionRegistry() })).toEqual({ clean: true, diffs: [] });
  });
});

describe('28.121 the re-file inside an atomic set', () => {
  it('reads publish(D1), link(S, D1), publish(D2), link(S, D2) with consecutive keys', async () => {
    const [s, d1, d2] = [newUlid(), newUlid(), newUlid()];
    await w.published(s);
    await w.draft(d1);
    await w.draft(d2);
    await w.fromLink(d1, s, 'blocks');
    await w.fromLink(d2, s, 'relates');

    const res = await w.publishSet('member', [d1, d2]);
    expect(res.statusCode, res.body).toBe(200);
    const keys = (res.json() as { results: Array<{ key: string | null }> }).results.map((r) => w.keyNumber(r.key));
    expect(Number.isInteger(keys[0])).toBe(true); // [NaN, NaN] would pass the next line (NaN equals NaN under toEqual)
    expect(keys).toEqual([keys[0], keys[0]! + 1]);
    const { rows } = await db.pool.query<{ type: string; entity_id: string }>(
      `SELECT type, entity_id FROM events
        WHERE (type = 'ticket.published' AND entity_id = ANY($1)) OR (type = 'ticket.link_added' AND entity_id = $2)
        ORDER BY workspace_seq`,
      [[d1, d2], s],
    );
    expect(rows.map((r) => [r.type, r.entity_id])).toEqual([
      ['ticket.published', d1], ['ticket.link_added', s], ['ticket.published', d2], ['ticket.link_added', s],
    ]);
    expect((await w.linkEventsOn(s)).map((e) => e.payload)).toEqual([
      { kind: 'blocks', targetId: d1 }, { kind: 'relates', targetId: d2 },
    ]);
  });
});

describe('28.122 a publisher who can no longer see S', () => {
  it('is refused with nothing committed and no key burned, on both doors; CONTROL: once S is visible again the same publish succeeds', async () => {
    const [marker, s, d] = [newUlid(), newUlid(), newUlid()];
    await w.published(s);
    await w.draft(d);
    await w.fromLink(d, s);
    expect(await hide(s)).toMatchObject({ status: 'committed' });
    await w.published(marker); // the last number taken before the refused attempts
    const before = w.keyNumber((await w.stateOf('owner', marker)).key);
    expect(Number.isInteger(before)).toBe(true); // `toBe` is Object.is: NaN would equal NaN + 1's NaN below

    const single = await w.send('member', 'ticket.published', d, { projectId: w.PROJECT() });
    expect(single).toMatchObject({ status: 'refused', rule: DRAFT_LINK_REFILE_REFUSED_RULE, reason: GONE });
    expect(DRAFT_LINK_REFILE_REFUSED_RULE).toBe('draft.link-refile-refused'); // P20 2d: the id is user-visible (MCP's "refused by <rule>")
    const set = await w.publishSet('member', [d]);
    expect(set.statusCode, set.body).toBe(409);
    expect(set.json()).toEqual({
      rule: DRAFT_PUBLISH_REFUSED_RULE,
      ticketId: d,
      cause: { rule: DRAFT_LINK_REFILE_REFUSED_RULE, reason: GONE },
    });
    expect(await w.publishedRows([d])).toBe(0);
    expect(await w.stillDrafts([d])).toBe(1);
    expect(await w.linkEventsOn(s)).toEqual([]);
    const next = newUlid();
    await w.draft(next);
    expect(await w.send('member', 'ticket.published', next, { projectId: w.PROJECT() })).toMatchObject({ status: 'committed' });
    expect(w.keyNumber((await w.stateOf('owner', next)).key)).toBe(before + 1); // no number was burned

    expect(await unhide(s)).toMatchObject({ status: 'committed' });
    expect(await w.send('member', 'ticket.published', d, { projectId: w.PROJECT() })).toMatchObject({ status: 'committed' });
    expect((await w.linkEventsOn(s)).map((e) => e.payload)).toEqual([{ kind: 'blocks', targetId: d }]);

    // p11 N9 (28.122): a source the publisher CAN still see (trashed: `canSee` has no trash test) is named by its
    // title on the CLIENT door; the GONE phrase above is only for a source they cannot see.
    const [s3, d3] = [newUlid(), newUlid()];
    await w.published(s3);
    await w.draft(d3);
    await w.fromLink(d3, s3);
    expect(await w.send('owner', 'ticket.deleted', s3, {})).toMatchObject({ status: 'committed' });
    const named = await w.send('member', 'ticket.published', d3, { projectId: w.PROJECT() });
    expect(named).toMatchObject({ status: 'refused', rule: DRAFT_LINK_REFILE_REFUSED_RULE });
    expect(String(named['reason'])).toMatch(new RegExp(`^The link from "Real ${s3.slice(-4)}" to this draft could not be filed there: `));
    expect(await w.send('owner', 'ticket.restored', s3, {})).toMatchObject({ status: 'committed' });
    expect(await w.send('member', 'ticket.published', d3, { projectId: w.PROJECT() })).toMatchObject({ status: 'committed' }); // CONTROL
  });
});

describe('28.124 a refused re-file rolls the whole set back', () => {
  it('leaves D1 a draft and names D2; the set minus D2 then publishes with D1\'s key unburned', async () => {
    const [s1, s2, d1, d2] = [newUlid(), newUlid(), newUlid(), newUlid()];
    await w.published(s1);
    await w.published(s2);
    await w.draft(d1);
    await w.draft(d2);
    await w.fromLink(d1, s1);
    await w.fromLink(d2, s2);
    await hide(s2);
    const marker = newUlid();
    await w.published(marker);
    const before = w.keyNumber((await w.stateOf('owner', marker)).key);
    expect(Number.isInteger(before)).toBe(true);

    const res = await w.publishSet('member', [d1, d2]);
    expect(res.statusCode, res.body).toBe(409);
    expect(res.json()).toMatchObject({ rule: DRAFT_PUBLISH_REFUSED_RULE, ticketId: d2, cause: { rule: DRAFT_LINK_REFILE_REFUSED_RULE } });
    expect(await w.publishedRows([d1, d2])).toBe(0);
    expect(await w.stillDrafts([d1, d2])).toBe(2);
    expect(await w.linkEventsOn(s1)).toEqual([]); // D1's re-file was rolled back with the set

    const ok = await w.publishSet('member', [d1]);
    expect(ok.statusCode, ok.body).toBe(200);
    expect(w.keyNumber((ok.json() as { results: Array<{ key: string | null }> }).results[0]?.key ?? null)).toBe(before + 1);
    expect((await w.linkEventsOn(s1)).map((e) => e.payload)).toEqual([{ kind: 'blocks', targetId: d1 }]);
  });
});

describe('28.102 a discard with an incoming draft-side link', () => {
  it('leaves S\'s stream and state untouched and no row naming the draft; CONTROL: the link existed before', async () => {
    const [s, d] = [newUlid(), newUlid()];
    await w.published(s);
    await w.draft(d);
    await w.fromLink(d, s);
    expect(await w.linkRows(d)).toHaveLength(1); // CONTROL
    const streamBefore = (await db.pool.query('SELECT id, type, payload FROM events WHERE entity_id = $1 ORDER BY seq', [s])).rows;
    // CONTROL: the link was filed on D's stream, NOT on S's (S holds its birth only). Without this leg a link filed
    // plain on S would be inside `streamBefore` too, and the byte-identity arm below would still pass.
    expect(streamBefore.map((e: { type: string }) => e.type)).toEqual(['ticket.created']);
    const stateBefore = (await w.stateOf('owner', s)).ticketState;
    expect(stateBefore.links).toBeUndefined();
    expect((await w.stateOf('member', d)).ticketState.links).toEqual([{ kind: 'blocks', targetId: d, from: s }]); // the from entry is on the draft

    expect(await w.send('member', 'ticket.discarded', d, {})).toMatchObject({ status: 'committed' });
    await expect.poll(() => purgedCount(d), { timeout: 10_000 }).toBe(1);

    expect(await w.linkRows(d)).toEqual([]);
    expect((await db.pool.query('SELECT id, type, payload FROM events WHERE entity_id = $1 ORDER BY seq', [s])).rows).toEqual(streamBefore);
    expect((await w.stateOf('owner', s)).ticketState).toEqual(stateBefore);
    expect(Object.keys(await scan(db.pool, [d])).filter((k) => k.startsWith('proj_ticket_links'))).toEqual([]);
    expect(await verifyProjections({ pool: db.pool, projections: buildProjectionRegistry() })).toEqual({ clean: true, diffs: [] });
  });
});
