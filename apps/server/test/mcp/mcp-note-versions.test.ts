import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EMPTY_NOTE_DOC, newUlid } from '@gisik-nokma/domain';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { buildDoorWorld, callTool, type DoorWorld } from './helpers/door-matrix.js';
import { event, eventCount, grantRole, mustCommit, noteBody } from './helpers/sweep2.js';

/**
 * MCP sweep 2 T4, cases 14.610, 14.612, 14.613, 14.615, 14.616 (the package half is `note-version-tools.test.ts`).
 * Every restore is a `tools/call` on `POST /mcp`; the versions are written as the app writes them. Run LOCALLY.
 */
let db: TestDatabase;
beforeAll(async () => {
  db = await createTestDatabase();
});
afterAll(async () => {
  await db.drop();
});

const para = (text: string) => ({ type: 'doc', attrs: { schemaVersion: 2 }, content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] });
const cell = (type: string, text: string, attrs: Record<string, unknown> = {}) => ({
  type, attrs: { colspan: 1, rowspan: 1, colwidth: null, ...attrs }, content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
});
/** A document Markdown cannot carry whole: a cell spanning two columns (`packages/editor/test/markdown-doc/convert.test.ts` 26.003 reports it as `table.span`). */
const TABLE_SPAN = {
  type: 'doc', attrs: { schemaVersion: 2 },
  content: [{ type: 'table', content: [
    { type: 'tableRow', content: [cell('tableHeader', 'A'), cell('tableHeader', 'B')] },
    { type: 'tableRow', content: [cell('tableCell', '1'), cell('tableCell', '2', { colspan: 2 })] },
  ] }],
};
const NOT_YOURS = 'Only the note’s author, an admin who can read it, or the workspace owner can change it.'; // check-permission.ts, curly apostrophe

type Version = { eventId: string };
/** A workspace note by `who` with a born-empty first version, then one body_set per entry of `bodies`. Returns the note id and every version id, oldest first. */
async function noteWithVersions(w: DoorWorld, who: DoorWorld['owner'], title: string, bodies: unknown[]) {
  const made = await callTool(w.app, who.token, 'create_note', { workspaceId: w.workspaceId, title, scope: 'workspace' });
  expect(made.isError, made.text).toBe(false);
  const noteId = (made.json as { noteId: string }).noteId;
  for (const body of bodies) await mustCommit(w.app, who, [event(w.workspaceId, who, { kind: 'note', id: noteId }, 'note.body_set', { body })]);
  const history = await callTool(w.app, who.token, 'get_note_history', { noteId });
  return { noteId, ids: (history.json as { versions: Version[] }).versions.map((v) => v.eventId) };
}

describe('restore_note_version through the hosted door', () => {
  it('14.610 the stored document comes back exactly, including what Markdown cannot carry; the update_note route through Markdown loses it', async () => {
    const w = await buildDoorWorld(db, '2610');
    const { noteId, ids } = await noteWithVersions(w, w.owner, 'Lossy', [TABLE_SPAN, para('later')]);
    expect(ids).toHaveLength(3);
    // The precondition that makes the control mean something: Markdown reports the span as lost.
    const asMarkdown = await callTool(w.app, w.owner.token, 'get_note_history', { noteId, versionId: ids[1] });
    expect((asMarkdown.json as { lossy: string[] }).lossy).toEqual(['table.span']);
    const done = await callTool(w.app, w.owner.token, 'restore_note_version', { noteId, versionId: ids[1] });
    expect(done.isError, done.text).toBe(false);
    expect(done.json).toMatchObject({ noteId, restoredFrom: ids[1], restored: true });
    expect(await noteBody(db, noteId)).toEqual(TABLE_SPAN);
    // CONTROL, same `it`: put the later body back, then write that version's MARKDOWN with update_note: the span is gone.
    await callTool(w.app, w.owner.token, 'restore_note_version', { noteId, versionId: ids[2] });
    expect(await noteBody(db, noteId)).toEqual(para('later')); // the starting point of the control
    const lossy = await callTool(w.app, w.owner.token, 'update_note', { noteId, markdown: (asMarkdown.json as { markdown: string }).markdown });
    expect(lossy.isError, lossy.text).toBe(false);
    // `not.toEqual(TABLE_SPAN)` alone held already at `para('later')`, so it passed with update_note a no-op. The Markdown
    // write must have LANDED (the body is a table now) and lost the span (no cell spans two columns).
    const viaMarkdown = JSON.stringify(await noteBody(db, noteId));
    expect(viaMarkdown).toContain('"type":"table"');
    expect(viaMarkdown).not.toContain('"colspan":2');
  });

  it('14.612 a version born without a body is listed, its body route answers 404, and the restore writes the empty document', async () => {
    const w = await buildDoorWorld(db, '2612');
    const { noteId, ids } = await noteWithVersions(w, w.owner, 'Born empty', [para('first words')]);
    const direct = await callTool(w.app, w.owner.token, 'get_note_history', { noteId, versionId: ids[0] });
    expect(direct.isError).toBe(true); // the history-body route is a 404 for it (`read/notes.ts:369`)
    const done = await callTool(w.app, w.owner.token, 'restore_note_version', { noteId, versionId: ids[0] });
    expect(done.isError, done.text).toBe(false);
    expect(await noteBody(db, noteId)).toEqual(EMPTY_NOTE_DOC);
    // CONTROL, same `it`: the version with a body restores that body.
    await callTool(w.app, w.owner.token, 'restore_note_version', { noteId, versionId: ids[1] });
    expect(await noteBody(db, noteId)).toEqual(para('first words'));
  });

  it('14.613 restoring the current body writes nothing (the stored jsonb key order agrees); an older body is written and adds one event', async () => {
    const w = await buildDoorWorld(db, '2613');
    // The keys are deliberately NOT in jsonb's canonical order.
    const current = { content: [{ content: [{ text: 'same words', type: 'text' }], type: 'paragraph' }], attrs: { schemaVersion: 2 }, type: 'doc' };
    const { noteId, ids } = await noteWithVersions(w, w.owner, 'Same', [current]);
    const before = await eventCount(db, noteId);
    const same = await callTool(w.app, w.owner.token, 'restore_note_version', { noteId, versionId: ids[1] });
    expect(same.json).toEqual({ noteId, restoredFrom: ids[1], restored: false, reason: 'already the current body' });
    expect(await eventCount(db, noteId)).toBe(before);
    const older = await callTool(w.app, w.owner.token, 'restore_note_version', { noteId, versionId: ids[0] });
    expect(older.json).toMatchObject({ restored: true });
    expect(await eventCount(db, noteId)).toBe(before + 1); // CONTROL: exactly one event (14.616, live)
  });

  it('14.615 the role matrix: the author, an admin who can read it and the owner restore; a plain member who is not the author is refused in the gate\'s own words and nothing is written', async () => {
    const w = await buildDoorWorld(db, '2615');
    const ownerNote = await noteWithVersions(w, w.owner, 'Owner note', [para('A'), para('B')]);
    const memberNote = await noteWithVersions(w, w.member, 'Member note', [para('X'), para('Y')]);
    const as = (who: DoorWorld['owner'], n: { noteId: string; ids: string[] }, version: number) =>
      callTool(w.app, who.token, 'restore_note_version', { noteId: n.noteId, versionId: n.ids[version] });
    const refused = await as(w.member, ownerNote, 1);
    expect(refused.isError).toBe(true);
    expect(refused.text).toBe(`refused by permission.note: ${NOT_YOURS}`); // verbatim, with no "event 0" prefix
    expect(await noteBody(db, ownerNote.noteId)).toEqual(para('B')); // nothing written
    // CONTROL, same `it`: the author restores their own note.
    expect((await as(w.member, memberNote, 1)).isError).toBe(false);
    expect(await noteBody(db, memberNote.noteId)).toEqual(para('X'));
    // An admin who can read it.
    await grantRole(w.app, w.owner, w.workspaceId, w.member.userId, 'admin');
    expect((await as(w.member, ownerNote, 1)).isError).toBe(false);
    expect(await noteBody(db, ownerNote.noteId)).toEqual(para('A'));
    // The owner, on a note the member wrote.
    expect((await as(w.owner, memberNote, 2)).isError).toBe(false);
    expect(await noteBody(db, memberNote.noteId)).toEqual(para('Y'));
    // A stranger and an unknown note get the uniform sentence.
    const stranger = await callTool(w.app, w.stranger.token, 'restore_note_version', { noteId: ownerNote.noteId, versionId: ownerNote.ids[1] });
    expect(stranger.text).toBe('note not found or not visible to you');
    // The comment above names an unknown note too: assert it (the owner, a note id nobody minted).
    const unknown = await callTool(w.app, w.owner.token, 'restore_note_version', { noteId: newUlid(), versionId: ownerNote.ids[1] });
    expect(unknown.text).toBe('note not found or not visible to you');
  });
});
