import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { NOT_A_MEMBER_REASON, PERMISSION_ROLE_RULE } from '../../src/permissions/check-permission.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { buildDoorWorld, callTool, runDoorMatrix } from './helpers/door-matrix.js';

/**
 * MCP-everything T7, cases 14.404 and 14.408 (the package cases 14.400–14.403 and 14.405–14.407 are
 * `packages/mcp-server/test/note-tools.test.ts`). Every call is a `tools/call` on `POST /mcp` — the door an
 * assistant uses — against the real app and database. Run LOCALLY.
 */
let db: TestDatabase;
beforeAll(async () => {
  db = await createTestDatabase();
});
afterAll(async () => {
  await db.drop();
});

describe('MCP notes through the hosted door', () => {
  it('14.404 a mention in a note body notifies a reader, and writes nothing for a member who cannot read a private note', async () => {
    const w = await buildDoorWorld(db, '2404');
    const mention = `@[${w.memberName}](user:${w.member.userId})`;
    const mentions = async () =>
      (await db.pool.query<{ n: number }>(`SELECT count(*)::int AS n FROM notifications WHERE user_id = $1 AND kind = 'mention'`, [w.member.userId])).rows[0]!.n;

    const priv = await callTool(w.app, w.owner.token, 'create_note', { workspaceId: w.workspaceId, title: 'Private with a mention', scope: 'private', markdown: `ask ${mention}` });
    expect(priv.isError, priv.text).toBe(false);
    const shared = await callTool(w.app, w.owner.token, 'create_note', { workspaceId: w.workspaceId, title: 'Shared with a mention', scope: 'workspace', markdown: `ask ${mention}` });
    expect(shared.isError, shared.text).toBe(false);
    // CONTROL first: the reader's row. The fan-out runs after the commit, so wait for it.
    await vi.waitFor(async () => expect(await mentions()).toBe(1), { timeout: 5000, interval: 50 });
    // The private note's fan-out ran before the shared one's (events commit in order), so nothing more may arrive for it.
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(await mentions(), 'the private note must notify nobody who cannot read it').toBe(1);
    const row = await db.pool.query<{ payload: { noteId?: string } }>(`SELECT payload FROM notifications WHERE user_id = $1 AND kind = 'mention'`, [w.member.userId]);
    expect(JSON.stringify(row.rows[0]?.payload)).toContain((shared.json as { noteId: string }).noteId);
  });

  it('14.408 every note tool: stranger, forbidden member, allowed caller', async () => {
    const w = await buildDoorWorld(db, '2408');
    const NOT_MEMBER = `refused by ${PERMISSION_ROLE_RULE}: ${NOT_A_MEMBER_REASON}`;
    // check-permission.ts's sentence (not exported), copied with its curly apostrophe.
    const NOT_YOURS = 'Only the note’s author, an admin who can read it, or the workspace owner can change it.';
    const NOTE_GONE = 'note not found or not visible to you';
    await runDoorMatrix(w, [
      { tool: 'list_notes', args: (x) => ({ workspaceId: x.workspaceId }), stranger: { json: { notes: [], nextCursor: null } }, allowed: { caller: 'member' } },
      { tool: 'get_note', args: (x) => ({ noteId: x.privateNoteId }), stranger: NOTE_GONE, forbidden: { text: NOTE_GONE }, allowed: { caller: 'owner' } },
      { tool: 'create_note', args: (x) => ({ workspaceId: x.workspaceId, title: 'Member note' }), stranger: NOT_MEMBER, allowed: { caller: 'member', eventType: 'note.created' } },
      { tool: 'update_note', args: (x) => ({ noteId: x.workspaceNoteId, title: 'Matrix note B' }), stranger: NOTE_GONE,
        forbidden: { text: `event 0 refused by permission.note: ${NOT_YOURS}` }, allowed: { caller: 'owner', eventType: 'note.renamed' } },
      { tool: 'link_note', args: (x) => ({ noteId: x.workspaceNoteId, ticketId: x.ticketId, action: 'attach' }), stranger: NOTE_GONE, allowed: { caller: 'member', eventType: 'note.attached' } },
      { tool: 'delete_note', args: (x) => ({ noteId: x.workspaceNoteId, confirm_name: 'Matrix note B' }), stranger: NOTE_GONE,
        forbidden: { text: `refused by permission.note: ${NOT_YOURS}` }, allowed: { caller: 'owner', eventType: 'note.deleted' } },
      { tool: 'restore_note', args: (x) => ({ noteId: x.workspaceNoteId }), stranger: NOTE_GONE, allowed: { caller: 'owner', eventType: 'note.restored' } },
      { tool: 'get_note_history', args: (x) => ({ noteId: x.privateNoteId }), stranger: NOTE_GONE, forbidden: { text: NOTE_GONE }, allowed: { caller: 'owner' } },
    ]);
  });
});
