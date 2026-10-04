import { describe, expect, it } from 'vitest';
import { EMPTY_NOTE_DOC } from '@gisik-nokma/domain';
import { HttpError } from '../src/http-client.js';
import { noteTools } from '../src/tools/note-tools.js';
import { eventBatches, recordingSession } from './fixtures/recording-session.js';

const NOTE = 'N1';
const WS = 'W1';
const para = (text: string) => ({ type: 'doc', attrs: { schemaVersion: 2 }, content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] });
const OLD = para('old words');
const NOW = para('current words');
const versions = (...ids: string[]) => ({ versions: ids.map((eventId, i) => ({ eventId, authorId: 'U', recordedAt: '2026-10-01T00:00:00.000Z', seq: i + 1 })) });
const detail = (over: Record<string, unknown> = {}) => ({
  note: { noteId: NOTE, workspaceId: WS, homeProjectId: '', authorId: 'U', title: 'Cold room', scope: { mode: 'workspace' }, attachedTickets: [], deleted: false,
    createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-02T00:00:00.000Z', body: NOW, ...over },
});
const routes = (over: Record<string, unknown> = {}) => ({
  [`GET /v1/notes/${NOTE}`]: detail(),
  [`GET /v1/notes/${NOTE}/history`]: versions('V0', 'V1', 'V2'),
  [`GET /v1/notes/${NOTE}/history/V1`]: { body: OLD },
  ...over,
});
const restore = (session: ReturnType<typeof recordingSession>['session']) => {
  const found = noteTools(session).find((t) => t.name === 'restore_note_version');
  if (found === undefined) throw new Error('no restore_note_version');
  return found;
};

describe('restore_note_version (package)', () => {
  it('14.611 a versionId that is not a listed version of the note (a rename event\'s id, a stranger\'s) answers the uniform version sentence and writes nothing', async () => {
    const s = recordingSession({ routes: routes() });
    for (const versionId of ['RENAMED-EVENT', 'NOT-A-THING']) {
      await expect(restore(s.session).handler({ noteId: NOTE, versionId })).rejects.toThrow('note version not found or not visible to you');
    }
    expect(eventBatches(s.requests)).toEqual([]);
    expect(s.requests.some((r) => r.path.includes('/history/'))).toBe(false); // the body route is never asked for an unlisted id
    // The list route: a 404 is the uniform NOTE sentence, any other failure passes through unchanged.
    const noList = recordingSession({ routes: routes({ [`GET /v1/notes/${NOTE}/history`]: () => { throw new HttpError(404, null); } }) });
    await expect(restore(noList.session).handler({ noteId: NOTE, versionId: 'V1' })).rejects.toThrow(new Error('note not found or not visible to you'));
    const brokenList = recordingSession({ routes: routes({ [`GET /v1/notes/${NOTE}/history`]: () => { throw new HttpError(500, null); } }) });
    await expect(restore(brokenList.session).handler({ noteId: NOTE, versionId: 'V1' })).rejects.toThrow(/answered 500/);
    expect(eventBatches(noList.requests).concat(eventBatches(brokenList.requests))).toEqual([]);
    // CONTROL, same `it`: a listed version is restored.
    const out = await restore(s.session).handler({ noteId: NOTE, versionId: 'V1' });
    expect(out).toMatchObject({ noteId: NOTE, restoredFrom: 'V1', restored: true });
    expect(eventBatches(s.requests)).toHaveLength(1);
  });

  it('14.612 a listed version born without a body (the history-body route answers 404 for it) is restored as the empty document, not as an error', async () => {
    const s = recordingSession({ routes: routes() }); // V0 is listed; GET …/history/V0 has no route, so it is a 404
    const out = await restore(s.session).handler({ noteId: NOTE, versionId: 'V0' });
    expect(out).toMatchObject({ restored: true, restoredFrom: 'V0' });
    // `toEqual` on the body, never `toMatchObject`: EMPTY_NOTE_DOC's `content: [{ type: 'paragraph' }]` is a SUBSET of every
    // one-paragraph document (OLD and NOW included), so a subset match passes whatever body was sent.
    expect(eventBatches(s.requests)[0]![0]).toMatchObject({ type: 'note.body_set' });
    expect((eventBatches(s.requests)[0]![0]!['payload'] as { body: unknown }).body).toEqual(EMPTY_NOTE_DOC);
    // Only a 404 means "born without a body": a 500 from the body route is an error and writes nothing.
    const broken = recordingSession({ routes: routes({ [`GET /v1/notes/${NOTE}/history/V1`]: () => { throw new HttpError(500, null); } }) });
    await expect(restore(broken.session).handler({ noteId: NOTE, versionId: 'V1' })).rejects.toThrow(/answered 500/);
    expect(eventBatches(broken.requests)).toEqual([]);
    // CONTROL, same `it`: a version WITH a body sends that body, not the empty one.
    const t = recordingSession({ routes: routes() });
    await restore(t.session).handler({ noteId: NOTE, versionId: 'V1' });
    expect((eventBatches(t.requests)[0]![0]!['payload'] as { body: unknown }).body).toEqual(OLD);
  });

  it('14.613 a version whose body equals the current one writes nothing and says so, whatever the key order', async () => {
    // The same document with its keys in another order: deep equality, not a string compare.
    const reordered = { content: [{ content: [{ text: 'old words', type: 'text' }], type: 'paragraph' }], attrs: { schemaVersion: 2 }, type: 'doc' };
    const s = recordingSession({ routes: routes({ [`GET /v1/notes/${NOTE}`]: detail({ body: reordered }) }) });
    expect(await restore(s.session).handler({ noteId: NOTE, versionId: 'V1' })).toEqual({
      noteId: NOTE, restoredFrom: 'V1', restored: false, reason: 'already the current body',
    });
    expect(eventBatches(s.requests)).toEqual([]);
    // CONTROL, same `it`: a different current body is replaced.
    const t = recordingSession({ routes: routes() });
    expect(await restore(t.session).handler({ noteId: NOTE, versionId: 'V1' })).toMatchObject({ restored: true });
  });

  it('14.614 a deleted note is refused before any write, with a sentence that names restore_note', async () => {
    const s = recordingSession({ routes: routes({ [`GET /v1/notes/${NOTE}`]: detail({ deleted: true }) }) });
    await expect(restore(s.session).handler({ noteId: NOTE, versionId: 'V1' })).rejects.toThrow(new Error('This note is in Deleted items. Bring it back with restore_note first, then restore a version.')); // exact sentence (an Error argument compares the whole message)
    expect(eventBatches(s.requests)).toEqual([]);
    // CONTROL, same `it`: the same call on a live note writes.
    const t = recordingSession({ routes: routes() });
    await restore(t.session).handler({ noteId: NOTE, versionId: 'V1' });
    expect(eventBatches(t.requests)).toHaveLength(1);
  });

  it('14.616 a restore is exactly one note.body_set on the note\'s stream, origin mcp, actor the session user; the title, scope and filing are not touched', async () => {
    const s = recordingSession({ routes: routes() });
    await restore(s.session).handler({ noteId: NOTE, versionId: 'V1' });
    const batches = eventBatches(s.requests);
    expect(batches).toHaveLength(1);
    expect(batches[0]).toHaveLength(1);
    expect(batches[0]![0]).toMatchObject({
      type: 'note.body_set', workspaceId: WS, entity: { kind: 'note', id: NOTE }, origin: 'mcp', actorId: '01J0A5ER0000000000000000AA', payload: { body: OLD },
    });
    expect(Object.keys((batches[0]![0] as { payload: object }).payload)).toEqual(['body']);
    expect(s.requests.filter((r) => r.method !== 'GET' && r.method !== 'EVENTS')).toEqual([]); // no other write of any kind
  });
});
