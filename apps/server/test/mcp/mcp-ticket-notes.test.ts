import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid } from '@gisik-nokma/domain';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { buildDoorWorld, callTool } from './helpers/door-matrix.js';
import { event, mustCommit } from './helpers/sweep2.js';

/**
 * MCP sweep 2 T3, cases 14.607 and 14.608 (the package cases 14.605, 14.606 and 14.609 are
 * `packages/mcp-server/test/get-ticket-notes.test.ts`). Every call is a `tools/call` on `POST /mcp`. Run LOCALLY.
 */
let db: TestDatabase;
beforeAll(async () => {
  db = await createTestDatabase();
});
afterAll(async () => {
  await db.drop();
});

type Notes = { notes: Array<{ noteId: string; title: string }>; notesTotal: number };

describe('get_ticket notes through the hosted door', () => {
  it('14.607 the notes are the ones THIS caller may read: the author sees a private note and the member does not, nor a count of it; a stranger gets the uniform sentence', async () => {
    const w = await buildDoorWorld(db, '2607');
    // A third note every member can read but that is NOT attached: without it, "the ticket's notes" and "every note I can
    // read" are the same two notes, and a tool that read the workspace's list would pass.
    const looseNoteId = newUlid();
    await mustCommit(w.app, w.owner, [
      event(w.workspaceId, w.owner, { kind: 'note', id: looseNoteId }, 'note.created', { title: 'Loose matrix note', homeProjectId: '', scope: { mode: 'workspace' } }),
    ]);
    for (const noteId of [w.privateNoteId, w.workspaceNoteId]) {
      const attached = await callTool(w.app, w.owner.token, 'link_note', { noteId, ticketId: w.ticketId, action: 'attach' });
      expect(attached.isError, attached.text).toBe(false);
    }
    const ask = (token: string) => callTool(w.app, token, 'get_ticket', { workspaceId: w.workspaceId, ticketId: w.ticketId });
    const ownerRead = await ask(w.owner.token);
    const owner = ownerRead.json as Notes;
    expect(owner.notes.map((n) => n.noteId).sort()).toEqual([w.privateNoteId, w.workspaceNoteId].sort());
    expect(owner.notesTotal).toBe(2); // CONTROL, same `it`: the author sees both
    expect(ownerRead.text).not.toContain(looseNoteId); // only ATTACHED notes, not every note the caller can read
    const memberRead = await ask(w.member.token);
    const member = memberRead.json as Notes;
    expect(member.notes.map((n) => n.noteId)).toEqual([w.workspaceNoteId]);
    expect(member.notesTotal).toBe(1); // no "1 hidden", no count of the note the member cannot read
    expect(memberRead.text).not.toContain(w.privateNoteId);
    expect(memberRead.text).not.toContain('Private matrix note');
    expect(memberRead.text).not.toContain(looseNoteId);
    const stranger = await ask(w.stranger.token);
    expect(stranger.isError).toBe(true);
    expect(stranger.text).toBe('ticket not found or not visible to you');
  });

  it('14.608 a deleted note is absent from the ticket and is back after restore_note', async () => {
    const w = await buildDoorWorld(db, '2608');
    const attached = await callTool(w.app, w.owner.token, 'link_note', { noteId: w.workspaceNoteId, ticketId: w.ticketId, action: 'attach' });
    expect(attached.isError, attached.text).toBe(false);
    const read = async () => (await callTool(w.app, w.owner.token, 'get_ticket', { workspaceId: w.workspaceId, ticketId: w.ticketId })).json as Notes;
    expect((await read()).notesTotal).toBe(1);
    const removed = await callTool(w.app, w.owner.token, 'delete_note', { noteId: w.workspaceNoteId, confirm_name: 'Matrix note' });
    expect(removed.isError, removed.text).toBe(false);
    expect(await read()).toMatchObject({ notes: [], notesTotal: 0 });
    const back = await callTool(w.app, w.owner.token, 'restore_note', { noteId: w.workspaceNoteId });
    expect(back.isError, back.text).toBe(false);
    const again = await read();
    expect(again.notes.map((n) => n.noteId)).toEqual([w.workspaceNoteId]);
    expect(again.notes[0]!.title).toBe('Matrix note');
  });
});
