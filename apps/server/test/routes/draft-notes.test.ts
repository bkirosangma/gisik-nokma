import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid } from '@gisik-nokma/domain';
import { NOTE_PERMISSION_RULE } from '../../src/permissions/check-permission.js';
import { buildProjectionRegistry } from '../../src/projections/index.js';
import { purgeItem, type PurgeGate } from '../../src/purge/purge-item.js';
import { visibleEventsFor, type ReachGrantedInstruction, type SyncItem } from '../../src/visibility/visible-events-for.js';
import { door } from '../helpers/door.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { buildReadTestApp, type ReadRole, type ReadWorld } from '../helpers/read-app.js';
import { recordingStore } from '../purge/world.js';

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
const PROJECT = (): string => read.world.projectId;
const NOTE_TICKET_REASON = 'You cannot see the ticket this note would be attached to.';
type EventView = { type: string; entity_id: string; workspace_seq: number };

async function draft(id: string, title = `Quokka ${id.slice(-6)}`): Promise<void> {
  expect(
    await door(read, 'member', 'ticket', id, 'ticket.created', { typeId: 'task', projectId: PROJECT(), parentId: null, title, start: 'backlog', draft: true }),
  ).toMatchObject({ status: 'committed' });
}
async function published(id: string): Promise<void> {
  expect(
    await door(read, 'owner', 'ticket', id, 'ticket.created', { typeId: 'task', projectId: PROJECT(), parentId: null, title: `Real ${id.slice(-6)}` }),
  ).toMatchObject({ status: 'committed' });
}
async function note(role: ReadRole, scope: Record<string, unknown> = { mode: 'workspace' }): Promise<string> {
  const id = newUlid();
  expect(
    await door(read, role, 'note', id, 'note.created', { title: `Minutes ${id.slice(-6)}`, homeProjectId: PROJECT(), scope }),
  ).toMatchObject({ status: 'committed' });
  return id;
}
const attach = (role: ReadRole, noteId: string, ticketId: string) => door(read, role, 'note', noteId, 'note.attached', { ticketId });
const head = async (): Promise<number> =>
  Number((await db.pool.query<{ head: string }>('SELECT COALESCE(MAX(workspace_seq), 0) AS head FROM events WHERE workspace_id = $1', [WS()])).rows[0]?.head);

/** The note's event types as each of the four read surfaces serves them to `role`. */
async function surfaces(role: ReadRole, noteId: string, ticketId: string) {
  const stream: string[] = [];
  for await (const item of visibleEventsFor(db.pool, read.userIds[role], WS(), 0)) {
    if (!('kind' in item) && item.entity.kind === 'note' && item.entity.id === noteId) stream.push(item.type);
  }
  const events = await read.app.inject({ method: 'GET', url: `/v1/notes/${noteId}/events`, headers: read.authOf(role) });
  const boot = await read.app.inject({ method: 'GET', url: `/v1/sync/bootstrap?workspaceId=${WS()}`, headers: read.authOf(role) });
  const listed = await read.app.inject({ method: 'GET', url: `/v1/workspaces/${WS()}/tickets/${ticketId}/notes`, headers: read.authOf(role) });
  // The note's own detail: its `attachedTickets` must not name the draft to another reader (no trace until publish),
  // and names it to its author (planner ruling 2026-10-04, T9-Q2).
  const detail = await read.app.inject({ method: 'GET', url: `/v1/notes/${noteId}`, headers: read.authOf(role) });
  return {
    stream,
    events: (events.json() as { events: EventView[] }).events.map((e) => e.type),
    bootstrap: (boot.json() as { notes: { events: EventView[] } }).notes.events.filter((e) => e.entity_id === noteId).map((e) => e.type),
    listed: (listed.json() as { notes: Array<{ noteId: string }> }).notes.map((n) => n.noteId),
    attached: (detail.json() as { note: { attachedTickets: Array<{ ticketId: string }> } }).note.attachedTickets.map((t) => t.ticketId),
  };
}

describe('28.186 a note linked to a draft is the author\'s alone (R66, Q16)', () => {
  it('withholds note.attached from the stream, the events route, the bootstrap tail and the ticket\'s notes list; delivers it to the author; delivers everything after the publish; CONTROL: a published ticket\'s attach is delivered', async () => {
    const [d, p] = [newUlid(), newUlid()];
    await draft(d);
    await published(p);
    const [n, np] = [await note('member'), await note('member')];
    expect(await attach('member', n, d)).toMatchObject({ status: 'committed' });
    expect(await attach('member', np, p)).toMatchObject({ status: 'committed' });

    const full = { stream: ['note.created', 'note.attached'], events: ['note.created', 'note.attached'], bootstrap: ['note.created', 'note.attached'] };
    const author = await surfaces('member', n, d);
    expect({ stream: author.stream, events: author.events, bootstrap: author.bootstrap }).toEqual(full);
    expect(author.listed).toEqual([n]);
    // The author's own view includes their draft (planner ruling 2026-10-04, T9-Q2): `GET /v1/notes/:id` lists it
    // for the author, and the loop below shows the same read lists nothing for the owner and the admin.
    expect(author.attached).toEqual([d]);

    for (const role of ['owner', 'admin'] as const) {
      const seen = await surfaces(role, n, d);
      expect(seen, role).toEqual({ stream: ['note.created'], events: ['note.created'], bootstrap: ['note.created'], listed: [], attached: [] });
    }
    const control = await surfaces('owner', np, p);
    expect({ stream: control.stream, events: control.events, bootstrap: control.bootstrap }).toEqual(full);
    expect(control.listed).toEqual([np]);
    expect(control.attached).toEqual([p]); // CONTROL: the detail does name an attached ticket the reader can see

    expect(await door(read, 'member', 'ticket', d, 'ticket.published', { projectId: PROJECT() })).toMatchObject({ status: 'committed' });
    for (const role of ['owner', 'admin'] as const) {
      const seen = await surfaces(role, n, d);
      expect(seen, role).toEqual({ ...full, listed: [n], attached: [d] });
    }
  });

  // Planner ruling 2026-10-04 (T9-Q1, the owner's no-trace ruling): what was withheld stays withheld after a discard.
  it('28.186 after a discard\'s erasure the attach stays withheld from the stream, the events route and the bootstrap, for every reader and the author; CONTROL: a live and two trash-purged published tickets\' attaches are delivered to the same readers', async () => {
    // d: a draft, discarded and erased. p: a live published ticket. q: born published, then purged. r: born a draft,
    // published, then purged (its redacted creation still says `draft: true`; only its publish row tells it apart).
    const [d, p, q, r] = [newUlid(), newUlid(), newUlid(), newUlid()];
    await draft(d);
    await published(p);
    await published(q);
    await draft(r);
    expect(await door(read, 'member', 'ticket', r, 'ticket.published', { projectId: PROJECT() })).toMatchObject({ status: 'committed' });
    const [n, np, nq, nr] = [await note('member'), await note('member'), await note('member'), await note('member')];
    for (const [noteId, ticketId] of [[n, d], [np, p], [nq, q], [nr, r]] as const) {
      expect(await attach('member', noteId, ticketId)).toMatchObject({ status: 'committed' });
    }
    expect(await door(read, 'member', 'ticket', d, 'ticket.discarded', {})).toMatchObject({ status: 'committed' });
    // The erasure is the app's own: the test app wires `discardDraft` as the `ticket.discarded` listener exactly as
    // `src/index.ts` does (drafts T5), so the leg waits for it (T5's 28.100 pattern) instead of erasing a second time.
    const purged = async (id: string): Promise<number> =>
      (await db.pool.query(`SELECT 1 FROM purged_entities WHERE entity_kind = 'ticket' AND entity_id = $1`, [id])).rows.length;
    await expect.poll(() => purged(d), { timeout: 10_000 }).toBe(1);
    const deps = () => ({ projections: buildProjectionRegistry(), store: recordingStore(), now: new Date() });
    // The trash purge, with its 15-day gate replaced by one that always passes (the gate is not under test here).
    const due: PurgeGate = async () => ({ ok: true, markedBy: read.userIds.owner, markedAt: new Date().toISOString() });
    for (const id of [q, r]) expect(await purgeItem(db.pool, { kind: 'ticket', id }, deps(), due)).toMatchObject({ status: 'purged' });

    // The world is the one under test, not an empty one: none of the three erased ids has a row, every attach is
    // still in its note's ledger (the erasure keeps the notes and their events, 28.185), and the ledger remains are
    // the ones the predicate reads (`migrations/1791600000000_drafts.sql:54-60`).
    for (const id of [d, q, r]) expect((await db.pool.query('SELECT 1 FROM proj_tickets WHERE ticket_id = $1', [id])).rowCount, id).toBe(0);
    for (const noteId of [n, nq, nr]) {
      expect(
        (await db.pool.query(`SELECT 1 FROM events WHERE entity_kind = 'note' AND entity_id = $1 AND type = 'note.attached'`, [noteId])).rowCount,
      ).toBe(1);
    }
    // Only the two types the predicate reads: `purgeItem` also appends a content-free `purge.completed` on the
    // ticket's id (`purge/purge-item.ts:164-165`), which neither discard nor purge tells apart.
    const remains = async (id: string) =>
      (await db.pool.query<{ type: string; draft: string | null }>(
        `SELECT type, payload ->> 'draft' AS draft FROM events
          WHERE entity_kind = 'ticket' AND entity_id = $1 AND type IN ('ticket.created', 'ticket.published') ORDER BY seq`, [id],
      )).rows;
    expect(await remains(d)).toEqual([{ type: 'ticket.created', draft: 'true' }]);
    expect(await remains(q)).toEqual([{ type: 'ticket.created', draft: null }]);
    expect(await remains(r)).toEqual([{ type: 'ticket.created', draft: 'true' }, { type: 'ticket.published', draft: null }]);

    const full = { stream: ['note.created', 'note.attached'], events: ['note.created', 'note.attached'], bootstrap: ['note.created', 'note.attached'] };
    const bare = { stream: ['note.created'], events: ['note.created'], bootstrap: ['note.created'] };
    const three = (s: { stream: string[]; events: string[]; bootstrap: string[] }) => ({ stream: s.stream, events: s.events, bootstrap: s.bootstrap });
    for (const role of ['owner', 'admin', 'member'] as const) {
      // CONTROLS first, same reader: a live published ticket's attach, and the attaches of the two purged published
      // tickets, are delivered. So the filter neither drops every attach nor every row-less one.
      expect(three(await surfaces(role, np, p)), `${role} live`).toEqual(full);
      expect(three(await surfaces(role, nq, q)), `${role} purged, born published`).toEqual(full);
      expect(three(await surfaces(role, nr, r)), `${role} purged, born a draft and published`).toEqual(full);
      expect(three(await surfaces(role, n, d)), `${role} erased draft`).toEqual(bare);
    }
  });
});

describe('28.191 the note attach gate, G11 (R66)', () => {
  it('lets the author attach and detach; refuses the owner and an admin as for an unknown ticket; refuses note.created naming a draft; CONTROL: the owner attaches to a published ticket', async () => {
    const [d, p, ghost] = [newUlid(), newUlid(), newUlid()];
    await draft(d);
    await published(p);
    const mine = await note('member');
    const owners = await note('owner');

    const refusal = { status: 'refused', rule: NOTE_PERMISSION_RULE, reason: NOTE_TICKET_REASON };
    expect(await attach('owner', owners, d)).toMatchObject(refusal);
    expect(await attach('admin', mine, d)).toMatchObject(refusal);
    expect(await attach('owner', owners, ghost)).toEqual(await attach('owner', owners, d)); // no oracle: a draft id and an unknown id say the same
    expect(await attach('member', mine, d)).toMatchObject({ status: 'committed' });
    expect(await door(read, 'owner', 'note', mine, 'note.detached', { ticketId: d })).toMatchObject(refusal);
    expect(await door(read, 'member', 'note', mine, 'note.detached', { ticketId: d })).toMatchObject({ status: 'committed' });
    expect(
      await door(read, 'member', 'note', newUlid(), 'note.created', {
        title: 'Born on a draft', homeProjectId: PROJECT(), scope: { mode: 'workspace' }, attachTicketId: d,
      }),
    ).toMatchObject(refusal);
    expect(await attach('owner', owners, p)).toMatchObject({ status: 'committed' });
  });
});

describe('28.194 publish announces and indexes the linked notes (R21, R66)', () => {
  it('names a workspace-scope note to the readers whose cursor passed the attach, before ticket.published, and not to a reader of nothing; the note is then found by the ticket\'s title; CONTROL: a publish with no linked note names none', async () => {
    const [d, bare] = [newUlid(), newUlid()];
    await draft(d, 'Wombatine grant request');
    await draft(bare);
    const shown = await note('member');
    const hidden = await note('member', { mode: 'explicit', userIds: [read.userIds.member] });
    expect(await attach('member', shown, d)).toMatchObject({ status: 'committed' });
    expect(await attach('member', hidden, d)).toMatchObject({ status: 'committed' });
    const cursor = await head();
    const attachSeq = async (noteId: string): Promise<number> =>
      Number(
        (await db.pool.query<{ s: string }>(
          `SELECT MAX(workspace_seq) AS s FROM events WHERE entity_id = $1 AND workspace_seq <= $2`,
          [noteId, cursor],
        )).rows[0]?.s,
      );
    const search = async (): Promise<string[]> =>
      (
        (await read.app.inject({ method: 'GET', url: `/v1/search?workspaceId=${WS()}&q=wombatine&kinds=note`, headers: read.authOf('owner') })).json() as {
          notes: Array<{ noteId: string }>;
        }
      ).notes.map((hit) => hit.noteId);
    expect(await search()).not.toContain(shown); // CONTROL: the draft's title is in no note's text yet

    expect(await door(read, 'member', 'ticket', bare, 'ticket.published', { projectId: PROJECT() })).toMatchObject({ status: 'committed' });
    expect(await door(read, 'member', 'ticket', d, 'ticket.published', { projectId: PROJECT() })).toMatchObject({ status: 'committed' });

    const noticesFor = async (role: ReadRole) => {
      const items: SyncItem[] = [];
      for await (const item of visibleEventsFor(db.pool, read.userIds[role], WS(), cursor)) items.push(item);
      const published = items.findIndex((item) => !('kind' in item) && item.type === 'ticket.published' && item.entity.id === d);
      const notices = items
        .map((item, index) => ({ item, index }))
        .filter((entry): entry is { item: ReachGrantedInstruction; index: number } => 'kind' in entry.item && entry.item.kind === 'reach-granted');
      return { published, notes: notices.flatMap((entry) => (entry.item.notes ?? []).map((n) => ({ ...n, index: entry.index }))) };
    };
    const owner = await noticesFor('owner');
    expect(owner.notes.map((n) => [n.id, n.headSeq]).sort()).toEqual(
      [[shown, await attachSeq(shown)], [hidden, await attachSeq(hidden)]].sort(),
    ); // the owner reads every note
    expect(owner.notes.every((n) => n.index < owner.published)).toBe(true);
    const admin = await noticesFor('admin');
    expect(admin.notes.map((n) => n.id)).toEqual([shown]); // the admin cannot read the explicit note, so it is not named to them

    await expect.poll(search, { timeout: 10_000 }).toContain(shown);
  });
});
