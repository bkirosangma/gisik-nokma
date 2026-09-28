import { describe, expect, it } from 'vitest';
import { newUlid } from '@gisik-nokma/domain';
import { createBetterSqliteStorage } from '../src/storage/better-sqlite3.js';
import { LOCAL_TABLE_RULES, migrateLocal } from '../src/storage/schema.js';
import { createOutbox } from '../src/outbox/outbox.js';
import {
  ME,
  OTHER,
  P,
  P_OTHER,
  WS,
  apply,
  claim,
  commentOnNote,
  commentOnTicket,
  contestOn,
  count,
  docWith,
  freshReplica,
  noteCreated,
  queue,
  ticketCreated,
} from './purge-world.js';

/**
 * Trash series Plan 3, Task 3 (deviations D2, D3) — the device's half of spec
 * §5.7: "deletes every local row and local event for the erasure set (it
 * recomputes the set locally from its own tables)". Every case drives the real
 * replica over better-sqlite3.
 */

describe('19.167 a ticket erase takes the local subtree and every contest', () => {
  it("19.167 removes T, its child and every contest on T — the device's own stub included; the sibling keeps everything", async () => {
    const { storage, replica } = await freshReplica();
    const [T, C, S] = [newUlid(), newUlid(), newUlid()];
    await apply(replica, [
      ticketCreated(T),
      ticketCreated(C, P, T),
      ticketCreated(S),
      commentOnTicket(T, docWith({ type: 'text', text: 'about the lease' })),
      contestOn(T, ME),
      contestOn(T, OTHER),
      contestOn(S, ME),
    ]);
    for (const id of [T, S]) {
      await storage.run("INSERT INTO snapshots (entity_kind, entity_id, seq, state) VALUES ('ticket', ?, 1, '{}')", [id]);
      await storage.run(
        "INSERT INTO snapshot_provenance (entity_kind, entity_id, state_claim, assigned_claim) VALUES ('ticket', ?, '{}', NULL)",
        [id],
      );
    }

    const { erased } = await replica.eraseEntities([{ kind: 'ticket', id: T }]);

    expect(erased).toEqual(expect.arrayContaining([{ kind: 'ticket', id: T }, { kind: 'ticket', id: C }]));
    for (const id of [T, C]) {
      expect(await replica.getTicket(id)).toBeNull();
      expect(await count(storage, 'SELECT count(*) AS n FROM events WHERE entity_id = ?', [id])).toBe(0);
    }
    expect(await count(storage, 'SELECT count(*) AS n FROM snapshots WHERE entity_id = ?', [T])).toBe(0);
    expect(await count(storage, 'SELECT count(*) AS n FROM snapshot_provenance WHERE entity_id = ?', [T])).toBe(0);
    expect(await count(storage, 'SELECT count(*) AS n FROM contests WHERE ticket_id = ?', [T])).toBe(0);
    // CONTROL
    expect((await replica.getTicket(S))?.contests.map((c) => c.claimantId)).toEqual([ME]);
    expect(await count(storage, 'SELECT count(*) AS n FROM snapshots WHERE entity_id = ?', [S])).toBe(1);
    expect(await count(storage, 'SELECT count(*) AS n FROM snapshot_provenance WHERE entity_id = ?', [S])).toBe(1);
  });
});

describe('19.168 an erased ticket\'s queued claims become notices', () => {
  it('19.168 records a content-free notice, leaves no failed row, and keeps the other ticket\'s claim queued', async () => {
    const { storage, replica } = await freshReplica();
    const outbox = createOutbox({ storage, replica });
    const [T, S] = [newUlid(), newUlid()];
    await apply(replica, [ticketCreated(T), ticketCreated(S)]);
    const edit = claim({ kind: 'ticket', id: T }, 'ticket.field_set', { fieldId: 'title', value: 'SECRET offline title' });
    const keep = claim({ kind: 'ticket', id: S }, 'ticket.field_set', { fieldId: 'title', value: 'Kept' });
    await queue(storage, edit);
    await queue(storage, keep);

    await replica.eraseEntities([{ kind: 'ticket', id: T }]);

    expect(await outbox.notices(WS)).toEqual([
      {
        noticeId: edit.id,
        workspaceId: WS,
        kind: 'purged',
        entityKind: 'ticket',
        entityId: T,
        eventType: 'ticket.field_set',
        recordedAt: expect.any(String),
      },
    ]);
    expect(await outbox.failedItems(WS)).toEqual([]);
    expect(JSON.stringify(await storage.all('SELECT * FROM sync_notices'))).not.toContain('SECRET');
    // CONTROL
    expect(await outbox.queuedCount(WS)).toBe(1);
    const due = await outbox.nextBatch(10, () => new Date('2100-01-01T00:00:00.000Z'));
    expect(due.map((item) => item.eventId)).toEqual([keep.id]);
  });
});

describe('19.169 a note erase', () => {
  it('19.169 removes the note, its events and comments, and turns its claim into a notice; the other note is untouched', async () => {
    const { storage, replica } = await freshReplica();
    const outbox = createOutbox({ storage, replica });
    const [N, M] = [newUlid(), newUlid()];
    await apply(replica, [noteCreated(N, ''), commentOnNote(N, 'first'), noteCreated(M, ''), commentOnNote(M, 'second')]);
    await queue(storage, claim({ kind: 'note', id: N }, 'note.renamed', { title: 'Offline rename' }));

    await replica.eraseEntities([{ kind: 'note', id: N }]);

    expect(await replica.getNote(N)).toBeNull();
    expect(await replica.listNoteComments(N)).toEqual([]);
    expect(await count(storage, 'SELECT count(*) AS n FROM events WHERE entity_id = ?', [N])).toBe(0);
    expect((await outbox.notices(WS)).map((notice) => notice.entityId)).toEqual([N]);
    // CONTROL
    expect(await replica.getNote(M)).not.toBeNull();
    expect(await replica.listNoteComments(M)).toHaveLength(1);
  });
});

describe('19.170 a project erase recomputes the local subtree', () => {
  it("19.170 takes the project's tickets (children too) and homed notes; the other project's stay", async () => {
    const { replica } = await freshReplica();
    const [A, A1, Q1, NP, NQ] = [newUlid(), newUlid(), newUlid(), newUlid(), newUlid()];
    await apply(replica, [
      ticketCreated(A, P),
      ticketCreated(A1, P, A),
      ticketCreated(Q1, P_OTHER),
      noteCreated(NP, P),
      noteCreated(NQ, P_OTHER),
    ]);

    const { erased } = await replica.eraseEntities([{ kind: 'project', id: P }]);

    expect(erased).toEqual(
      expect.arrayContaining([
        { kind: 'project', id: P },
        { kind: 'ticket', id: A },
        { kind: 'ticket', id: A1 },
        { kind: 'note', id: NP },
      ]),
    );
    expect(await replica.getTicket(A)).toBeNull();
    expect(await replica.getTicket(A1)).toBeNull();
    expect(await replica.getNote(NP)).toBeNull();
    // CONTROL
    expect(await replica.getTicket(Q1)).not.toBeNull();
    expect(await replica.getNote(NQ)).not.toBeNull();
  });
});

describe('19.171 a workspace erase', () => {
  it('19.171 empties every workspace-scoped table, the definitions, the cursor and both pending-pull keys; the device identity stays', async () => {
    const { storage, replica } = await freshReplica();
    const outbox = createOutbox({ storage, replica });
    const [T, N] = [newUlid(), newUlid()];
    await apply(replica, [ticketCreated(T), noteCreated(N, ''), commentOnNote(N, 'hello'), contestOn(T, ME)]);
    await storage.run("INSERT INTO snapshots (entity_kind, entity_id, seq, state) VALUES ('ticket', ?, 1, '{}')", [T]);
    await queue(storage, claim({ kind: 'ticket', id: T }, 'ticket.field_set', { fieldId: 'title', value: 'x' }));
    await replica.setCursor(WS, 9);
    await replica.addPendingPulls(WS, [{ id: newUlid(), headSeq: 3 }]);
    await replica.addPendingPulls(WS, [{ id: newUlid(), headSeq: 3 }], 'note');

    await replica.eraseEntities([{ kind: 'workspace', id: WS }]);

    for (const table of ['events', 'tickets', 'notes', 'note_comments', 'contests', 'outbox', 'workflows', 'ticket_types', 'snapshots']) {
      expect(await count(storage, `SELECT count(*) AS n FROM ${table}`), table).toBe(0);
    }
    expect(await replica.getCursor(WS)).toBe(0);
    expect(await replica.listPendingPulls(WS)).toEqual([]);
    expect(await replica.listPendingPulls(WS, 'note')).toEqual([]);
    expect((await outbox.notices(WS)).map((notice) => notice.entityId)).toEqual([T]);
    expect(await replica.purgedAmong([WS])).toEqual([{ kind: 'workspace', id: WS }]);
    // CONTROL
    expect((await replica.getMe())?.userId).toBe(ME);
  });
});

describe('19.172 every local table has an erase rule', () => {
  it('19.172 LOCAL_TABLE_RULES names exactly the tables migrateLocal creates', async () => {
    const storage = createBetterSqliteStorage();
    await migrateLocal(storage);
    const tables = (
      await storage.all("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    ).map((row) => row['name'] as string);
    expect(Object.keys(LOCAL_TABLE_RULES).sort()).toEqual(tables);
    // CONTROL: the check can name a gap
    const withoutContests = Object.keys(LOCAL_TABLE_RULES).filter((name) => name !== 'contests');
    expect(tables.filter((table) => !withoutContests.includes(table))).toEqual(['contests']);
  });
});

describe('19.173 the registry and the Deleted-items cache', () => {
  it('19.173 purgedAmong answers only what was recorded; an erase strips the cache by item and by workspace', async () => {
    const { replica } = await freshReplica();
    const [T, S, stranger, otherWs, otherItem] = [newUlid(), newUlid(), newUlid(), newUlid(), newUlid()];
    await apply(replica, [ticketCreated(T), ticketCreated(S)]);
    await replica.cacheDeletedItems(
      {
        items: [
          { kind: 'ticket', id: T, workspaceId: WS },
          { kind: 'ticket', id: S, workspaceId: WS },
          { kind: 'project', id: otherItem, workspaceId: otherWs },
        ],
      },
      '2026-09-29T10:00:00.000Z',
    );

    await replica.eraseEntities([{ kind: 'ticket', id: T }]);

    expect(await replica.purgedAmong([T, S, stranger])).toEqual([{ kind: 'ticket', id: T }]);
    const afterTicket = await replica.readDeletedItemsCache();
    expect(afterTicket?.fetchedAt).toBe('2026-09-29T10:00:00.000Z');
    expect((afterTicket?.body as { items: Array<{ id: string }> }).items.map((item) => item.id)).toEqual([S, otherItem]);

    await replica.eraseEntities([{ kind: 'workspace', id: WS }]);
    const afterWorkspace = await replica.readDeletedItemsCache();
    // CONTROL: the other workspace's item is still cached
    expect((afterWorkspace?.body as { items: Array<{ id: string }> }).items.map((item) => item.id)).toEqual([otherItem]);
    expect(await replica.purgedAmong([stranger])).toEqual([]);
  });
});
