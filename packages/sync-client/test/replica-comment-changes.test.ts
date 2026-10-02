import { describe, expect, it } from 'vitest';
import { newUlid, plainTextToDoc, type LedgerEvent } from '@gisik-nokma/domain';
import { createBetterSqliteStorage } from '../src/storage/better-sqlite3.js';
import { LOCAL_SCHEMA_VERSION, LOCAL_TABLE_RULES, migrateLocal } from '../src/storage/schema.js';
import {
  OTHER,
  P,
  P_OTHER,
  TIME,
  WS,
  apply,
  bootstrap,
  commentOnNote,
  commentOnTicket,
  count,
  envelope,
  freshReplica,
  noteCreated,
  ticketCreated,
} from './purge-world.js';

/**
 * MCP-everything T4 (spec §6): the offline replica sees a comment's edits and deletions
 * (cases 26.090–26.093). The harness is `purge-world.ts`: a real replica over better-sqlite3.
 */

const edit = (kind: 'ticket' | 'note', id: string, commentId: string, text: string): LedgerEvent =>
  envelope({ kind, id }, 'comment.edited', { commentId, body: plainTextToDoc(text) });
const remove = (kind: 'ticket' | 'note', id: string, commentId: string): LedgerEvent =>
  envelope({ kind, id }, 'comment.deleted', { commentId });

describe('26.090–26.093 the replica sees comment edits and deletions', () => {
  it('26.090 schema v4 has comment_changes, ruled `erase`; a version-3 database migrates with its rows intact', async () => {
    const { storage } = await freshReplica();
    expect(LOCAL_SCHEMA_VERSION).toBe(4);
    expect(
      (await storage.all("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'comment_changes'", [])).length,
    ).toBe(1);
    expect(LOCAL_TABLE_RULES['comment_changes']?.rule).toBe('erase');

    // CONTROL: a version-3 database (no comment_changes, a note comment in it) gains the table by
    // CREATE TABLE IF NOT EXISTS and keeps its rows.
    const v3 = createBetterSqliteStorage();
    await migrateLocal(v3);
    await v3.run('DROP TABLE comment_changes', []);
    await v3.run("UPDATE meta SET value = '3' WHERE key = 'schema_version'", []);
    await v3.run(
      "INSERT INTO note_comments (comment_id, workspace_id, note_id, author_id, body, recorded_at, workspace_seq) VALUES ('c1', 'w', 'n', 'a', 'null', 't', 1)",
      [],
    );
    await migrateLocal(v3);
    expect((await v3.all("SELECT name FROM sqlite_master WHERE name = 'comment_changes'", [])).length).toBe(1);
    expect(await count(v3, 'SELECT count(*) AS n FROM note_comments')).toBe(1);
    expect((await v3.all("SELECT value FROM meta WHERE key = 'schema_version'", []))[0]?.['value']).toBe('4');
  });

  it('26.091 a note comment: edited, then deleted; a sibling is unchanged', async () => {
    const { replica } = await freshReplica();
    const N = newUlid();
    const first = commentOnNote(N, 'walrus first');
    const sibling = commentOnNote(N, 'sibling stays');
    await apply(replica, [noteCreated(N, ''), first, sibling]);
    await replica.applyServerItem(edit('note', N, first.id, 'narwhal second'));
    let rows = await replica.listNoteComments(N);
    expect(rows.find((r) => r.commentId === first.id)).toMatchObject({
      body: plainTextToDoc('narwhal second'),
      deletedAt: null,
      editedAt: TIME,
    });
    await replica.applyServerItem(remove('note', N, first.id));
    rows = await replica.listNoteComments(N);
    expect(rows.find((r) => r.commentId === first.id)).toMatchObject({ body: null, deletedAt: TIME, authorId: OTHER });
    // CONTROL: the sibling is untouched.
    expect(rows.find((r) => r.commentId === sibling.id)).toMatchObject({
      body: plainTextToDoc('sibling stays'),
      editedAt: null,
      deletedAt: null,
    });
  });

  it('26.091 a full-history reload does not bring the old text back', async () => {
    const { replica } = await freshReplica();
    const N = newUlid();
    const first = commentOnNote(N, 'walrus first');
    const create = noteCreated(N, '');
    const edited = edit('note', N, first.id, 'narwhal second');
    await apply(replica, [create, first, edited]);
    await replica.loadNoteEvents([create, first]); // at-least-once: the old comment.added comes round again
    expect((await replica.listNoteComments(N))[0]?.body).toEqual(plainTextToDoc('narwhal second'));
  });

  it('26.092 offline search follows edits and deletions', async () => {
    const { replica } = await freshReplica();
    const T = newUlid();
    const first = commentOnTicket(T, plainTextToDoc('walrusword'));
    const sibling = commentOnTicket(T, plainTextToDoc('penguinword'));
    await apply(replica, [ticketCreated(T), first, sibling]);
    const found = async (word: string) => (await replica.searchLocal(WS, word)).map((h) => h.ticketId);
    expect(await found('walrusword')).toEqual([T]); // CONTROL: before the edit the old word finds it
    await replica.applyServerItem(edit('ticket', T, first.id, 'narwhalword'));
    expect(await found('walrusword')).toEqual([]);
    expect(await found('narwhalword')).toEqual([T]);
    await replica.applyServerItem(remove('ticket', T, first.id));
    expect(await found('narwhalword')).toEqual([]);
    expect(await found('walrusword')).toEqual([]);
    expect(await found('penguinword')).toEqual([T]); // the sibling's word still does
  });

  it('26.092 a ticket that arrives by bootstrap with its edit and delete is searched the same way', async () => {
    const { replica } = await freshReplica();
    const T = newUlid();
    const first = commentOnTicket(T, plainTextToDoc('walrusword'));
    const gone = commentOnTicket(T, plainTextToDoc('sealword'));
    await replica.loadTicketBootstrap({
      workspaceId: WS,
      definitions: [],
      ticket: {
        ticketId: T,
        snapshot: null,
        events: [ticketCreated(T), first, gone, edit('ticket', T, first.id, 'narwhalword'), remove('ticket', T, gone.id)],
      },
    });
    const found = async (word: string) => (await replica.searchLocal(WS, word)).map((h) => h.ticketId);
    expect(await found('narwhalword')).toEqual([T]);
    expect(await found('walrusword')).toEqual([]);
    expect(await found('sealword')).toEqual([]);
  });

  it('26.093 redelivery is a no-op; a purge erases the rows; another entity keeps its rows', async () => {
    const { replica, storage } = await freshReplica();
    const [N, M] = [newUlid(), newUlid()];
    const c = commentOnNote(N, 'x');
    const other = commentOnNote(M, 'z');
    await apply(replica, [noteCreated(N, ''), noteCreated(M, ''), c, other]);
    const e = edit('note', N, c.id, 'y');
    expect((await replica.applyServerItem(e)).applied).toBe(true);
    expect((await replica.applyServerItem(e)).applied).toBe(false);
    await replica.applyServerItem(edit('note', M, other.id, 'w'));
    expect(await count(storage, 'SELECT count(*) AS n FROM comment_changes WHERE entity_id = ?', [N])).toBe(1);
    await replica.purgeEntity(N);
    expect(await count(storage, 'SELECT count(*) AS n FROM comment_changes WHERE entity_id = ?', [N])).toBe(0);
    expect(await count(storage, 'SELECT count(*) AS n FROM comment_changes WHERE entity_id = ?', [M])).toBe(1); // CONTROL
    await replica.eraseEntities([{ kind: 'note', id: M }]);
    expect(await count(storage, 'SELECT count(*) AS n FROM comment_changes')).toBe(0);
  });

  it('26.093 a scope revoke erases the workspace’s rows', async () => {
    const { replica, storage } = await freshReplica();
    const N = newUlid();
    const c = commentOnNote(N, 'x');
    await apply(replica, [noteCreated(N, ''), c, edit('note', N, c.id, 'y')]);
    expect(await count(storage, 'SELECT count(*) AS n FROM comment_changes')).toBe(1); // CONTROL
    await replica.revokeScope({ kind: 'scope-revoked', workspaceId: WS });
    expect(await count(storage, 'SELECT count(*) AS n FROM comment_changes')).toBe(0);
  });

  it('26.091 loadNoteEvents (a note’s whole history) carries the edit and the delete', async () => {
    const { replica } = await freshReplica();
    const N = newUlid();
    const kept = commentOnNote(N, 'walrus kept');
    const gone = commentOnNote(N, 'seal gone');
    const sibling = commentOnNote(N, 'sibling stays');
    await replica.loadNoteEvents([
      noteCreated(N, ''),
      kept,
      gone,
      sibling,
      edit('note', N, kept.id, 'narwhal kept'),
      remove('note', N, gone.id),
    ]);
    const rows = await replica.listNoteComments(N);
    expect(rows.find((r) => r.commentId === kept.id)).toMatchObject({
      body: plainTextToDoc('narwhal kept'),
      editedAt: TIME,
      deletedAt: null,
    });
    expect(rows.find((r) => r.commentId === gone.id)).toMatchObject({ body: null, deletedAt: TIME });
    // CONTROL: the sibling, in the same load, is as written.
    expect(rows.find((r) => r.commentId === sibling.id)).toMatchObject({
      body: plainTextToDoc('sibling stays'),
      editedAt: null,
      deletedAt: null,
    });
  });

  it('26.092 loadBootstrap (a device’s first sync) searches the edited word, not the original or the deleted one', async () => {
    const { replica } = await freshReplica();
    const T = newUlid();
    const first = commentOnTicket(T, plainTextToDoc('walrusword'));
    const gone = commentOnTicket(T, plainTextToDoc('sealword'));
    const sibling = commentOnTicket(T, plainTextToDoc('penguinword'));
    await replica.loadBootstrap({
      ...bootstrap(),
      tickets: [
        {
          ticketId: T,
          snapshot: null,
          events: [ticketCreated(T), first, gone, sibling, edit('ticket', T, first.id, 'narwhalword'), remove('ticket', T, gone.id)],
        },
      ],
    });
    const found = async (word: string) => (await replica.searchLocal(WS, word)).map((h) => h.ticketId);
    expect(await found('penguinword')).toEqual([T]); // CONTROL: an unchanged comment in the same bootstrap is found
    expect(await found('narwhalword')).toEqual([T]);
    expect(await found('walrusword')).toEqual([]);
    expect(await found('sealword')).toEqual([]);
  });

  it('26.093 a single-ticket erase and a project revoke erase the ticket’s rows; another ticket and project keep theirs', async () => {
    const rowsOf = (storage: Awaited<ReturnType<typeof freshReplica>>['storage'], id: string) =>
      count(storage, 'SELECT count(*) AS n FROM comment_changes WHERE entity_id = ?', [id]);
    const world = async () => {
      const w = await freshReplica();
      const [A, B, C] = [newUlid(), newUlid(), newUlid()];
      const comments = [A, B, C].map((id) => commentOnTicket(id, plainTextToDoc('word')));
      await apply(w.replica, [ticketCreated(A, P), ticketCreated(B, P), ticketCreated(C, P_OTHER), ...comments]);
      for (const [i, id] of [A, B, C].entries()) await w.replica.applyServerItem(edit('ticket', id, comments[i]!.id, 'edited'));
      return { ...w, A, B, C };
    };

    // single-ticket erase
    const one = await world();
    expect(await rowsOf(one.storage, one.A)).toBe(1); // CONTROL: the row exists before
    await one.replica.eraseEntities([{ kind: 'ticket', id: one.A }]);
    expect(await rowsOf(one.storage, one.A)).toBe(0);
    expect(await rowsOf(one.storage, one.B)).toBe(1); // CONTROL: another ticket's row survives

    // project revoke
    const proj = await world();
    expect(await rowsOf(proj.storage, proj.A)).toBe(1); // CONTROL
    await proj.replica.revokeScope({ kind: 'scope-revoked', workspaceId: WS, projectId: P });
    expect(await rowsOf(proj.storage, proj.A)).toBe(0);
    expect(await rowsOf(proj.storage, proj.B)).toBe(0);
    expect(await rowsOf(proj.storage, proj.C)).toBe(1); // CONTROL: a ticket in another project keeps its row
  });
});
