import { describe, expect, it } from 'vitest';
import { domainRegistry, parseEvent } from '@gisik-nokma/domain';
import { HttpError } from '../src/http-client.js';
import type { Session } from '../src/session.js';
import { noteTools } from '../src/tools/note-tools.js';
import { NO_TRANSFER } from './fixtures/fake-session.js';

const ulid = (tag: string) => `01J0${tag}`.padEnd(26, '0');
const ME = ulid('ME');
const OTHER = ulid('OTHER');
const WS = ulid('WS');
const N = ulid('N0TE');
const T = ulid('TKT');
const IMG = ulid('IMG');
const COMMITTED = { status: 'committed', eventId: 'e', seq: 1, serverTime: '2026-10-02T10:00:00.000Z' };

const para = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] });
const heading = (text: string) => ({ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text }] });
const NOTE_BODY = { type: 'doc', content: [heading('Risks'), para('The chiller may fail.'), heading('Owners'), para('Asha owns it.')] };
const note = (over: Record<string, unknown> = {}) => ({
  noteId: N, workspaceId: WS, homeProjectId: '', authorId: ME, title: 'Cold room', scope: { mode: 'private' }, attachedTickets: [],
  deleted: false, createdAt: '2026-10-02T09:00:00.000Z', updatedAt: '2026-10-02T09:00:00.000Z', body: NOTE_BODY, ...over,
});
const NOTE_ROUTES: Record<string, unknown> = { [`/v1/notes/${N}`]: { note: note() } };

/** A route matches its exact path (with or without a query string); anything else is a 404, as the server answers. */
function fake(routes: Record<string, unknown> = NOTE_ROUTES) {
  const batches: Array<Array<Record<string, unknown>>> = [];
  const asked: string[] = [];
  const session: Session = {
    userId: () => ME,
    get: async (path) => {
      asked.push(path);
      const hit = Object.keys(routes)
        .filter((k) => path === k || path.startsWith(`${k}?`))
        .sort((a, b) => b.length - a.length)[0];
      if (hit === undefined) throw new HttpError(404, { error: 'not_found' });
      return routes[hit];
    },
    post: async () => ({}),
    postEvents: async (events) => {
      batches.push(events as Array<Record<string, unknown>>);
      return { results: (events as unknown[]).map(() => COMMITTED) };
    },
    ...NO_TRANSFER,
  };
  return { session, batches, asked };
}
const tool = (name: string, s: Session) => {
  const t = noteTools(s).find((x) => x.name === name);
  if (t === undefined) throw new Error(name);
  return t;
};
const types = (batch: Array<Record<string, unknown>> | undefined) => (batch ?? []).map((e) => e['type']);

describe('14.400–14.407 note tools', () => {
  it('14.400 list_notes passes its filters and pages the answer; no filters, no query string', async () => {
    const notes = Array.from({ length: 120 }, (_, i) => ({ noteId: `n${i}`, title: `Note ${i}` }));
    const f = fake({ [`/v1/workspaces/${WS}/notes`]: { notes } });
    const first = (await tool('list_notes', f.session).handler({ workspaceId: WS })) as { notes: unknown[]; nextCursor: string | null };
    expect(f.asked).toEqual([`/v1/workspaces/${WS}/notes`]); // control: no filters → no query string
    const second = (await tool('list_notes', f.session).handler({ workspaceId: WS, cursor: first.nextCursor })) as typeof first;
    const third = (await tool('list_notes', f.session).handler({ workspaceId: WS, cursor: second.nextCursor })) as typeof first;
    expect([first.notes.length, second.notes.length, third.notes.length]).toEqual([50, 50, 20]);
    expect([first.nextCursor, second.nextCursor, third.nextCursor]).toEqual(['50', '100', null]);
    await tool('list_notes', f.session).handler({ workspaceId: WS, projectId: '', authorId: 'me', scope: 'workspace', include: ['deleted'] });
    expect(f.asked.at(-1)).toBe(`/v1/workspaces/${WS}/notes?home=&author=${ME}&scope=workspace&deleted=1`);
    await tool('list_notes', f.session).handler({ workspaceId: WS, authorId: OTHER });
    expect(f.asked.at(-1)).toBe(`/v1/workspaces/${WS}/notes?author=${OTHER}`);
  });

  it('14.401 get_note answers Markdown, lossy and images — never the raw body; an empty body is ""; unknown is not-found', async () => {
    const withImage = { type: 'doc', content: [heading('Plan'), { type: 'image', attrs: { attachmentId: IMG, wrap: 'block', alt: '' } }] };
    const f = fake({ [`/v1/notes/${N}`]: { note: note({ body: withImage }) } });
    const got = (await tool('get_note', f.session).handler({ noteId: N })) as Record<string, unknown>;
    expect(got).not.toHaveProperty('body');
    expect(got['markdown']).toContain('## Plan');
    expect(got['lossy']).toEqual([]);
    expect(got['images']).toEqual([IMG]);
    expect(got).toMatchObject({ noteId: N, title: 'Cold room', attachedTickets: [], deleted: false });
    const empty = fake({ [`/v1/notes/${N}`]: { note: note({ body: null }) } });
    expect(await tool('get_note', empty.session).handler({ noteId: N })).toMatchObject({ markdown: '', images: [] }); // control
    await expect(tool('get_note', fake({}).session).handler({ noteId: N })).rejects.toThrow('note not found or not visible to you');
  });

  it('27.168 get_note answers linkedFrom from the note’s own workspace', async () => {
    const f = fake({ ...NOTE_ROUTES, [`/v1/workspaces/${WS}/references`]: { total: 1, nextCursor: null, items: [{ sourceKind: 'ticket', sourceId: T, authorId: ME, snippet: 'per [[Cold room]]', updatedAt: '2026-10-03T10:00:00.000Z', parent: { kind: 'ticket', ticketId: T, projectId: 'P', key: 'CCSO-2', title: 'Fridge', stateCategory: 'active' } }] } });
    const got = (await tool('get_note', f.session).handler({ noteId: N })) as { linkedFrom: unknown };
    expect(got.linkedFrom).toEqual({ total: 1, items: [{ sourceKind: 'ticket', sourceId: T, title: 'CCSO-2 Fridge', snippet: 'per [[Cold room]]' }] });
    expect(f.asked).toEqual([`/v1/notes/${N}`, `/v1/workspaces/${WS}/references?target=note%3A${N}`]);
  });

  it('27.171 the get_note description says what linkedFrom holds', () => {
    expect(tool('get_note', fake().session).description).toContain(
      'linkedFrom lists the first 20 tickets, notes and comments you can see that reference this note, with the sentence each sits in (the reference marked [[…]]); total counts only those.',
    );
  });

  it('14.402 create_note emits ONE note.created; scope private, inherit when attached, explicit needs people', async () => {
    const f = fake();
    const made = (await tool('create_note', f.session).handler({ workspaceId: WS, title: 'Plain' })) as { noteId: string };
    expect(made.noteId).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(f.batches).toHaveLength(1);
    expect(f.batches[0]).toHaveLength(1);
    const e = f.batches[0]![0]!;
    expect(e).toMatchObject({
      type: 'note.created', entity: { kind: 'note', id: made.noteId }, origin: 'mcp', actorId: ME,
      payload: { title: 'Plain', homeProjectId: '', scope: { mode: 'private' } },
    });
    expect(parseEvent({ ...e, serverTime: '2026-10-02T10:00:00.000Z', seq: 1 }, domainRegistry).ok).toBe(true); // control: a valid envelope
    await tool('create_note', f.session).handler({ workspaceId: WS, title: 'On a ticket', attachTicketId: T, projectId: 'p1', markdown: '## Hi' });
    expect(f.batches[1]![0]!['payload']).toMatchObject({ scope: { mode: 'inherit' }, attachTicketId: T, homeProjectId: 'p1' });
    expect((f.batches[1]![0]!['payload'] as { body: { content: Array<{ type: string }> } }).body.content[0]?.type).toBe('heading');
    await expect(tool('create_note', f.session).handler({ workspaceId: WS, title: 'X', scope: 'explicit' })).rejects.toThrow(/needs explicitUserIds/);
    await tool('create_note', f.session).handler({ workspaceId: WS, title: 'Few', scope: 'explicit', explicitUserIds: [OTHER] });
    expect(f.batches[2]![0]!['payload']).toMatchObject({ scope: { mode: 'explicit', userIds: [OTHER] } });
  });

  it('14.403 update_note sends one batch of exactly the implied events; section edits splice', async () => {
    const f = fake();
    await tool('update_note', f.session).handler({ noteId: N, title: 'Cold room 2', markdown: 'new risk', mode: 'replace_section', section: 'Risks' });
    expect(f.batches).toHaveLength(1);
    expect(types(f.batches[0])).toEqual(['note.renamed', 'note.body_set']);
    const content = (f.batches[0]![1]!['payload'] as { body: { content: Array<{ type: string }> } }).body.content;
    expect(JSON.stringify(content[0])).toBe(JSON.stringify(NOTE_BODY.content[0])); // the Risks heading, byte-identical
    expect(JSON.stringify(content.at(-1))).toBe(JSON.stringify(NOTE_BODY.content.at(-1))); // Owners' paragraph
    await expect(tool('update_note', f.session).handler({ noteId: N })).rejects.toThrow('update_note needs at least one of title, markdown, scope or projectId');
    await expect(tool('update_note', f.session).handler({ noteId: N, markdown: 'x', mode: 'replace_section', section: 'Nope' })).rejects.toThrow(
      'section "Nope" not found; the headings are: "Risks", "Owners"',
    );
    await expect(tool('update_note', f.session).handler({ noteId: N, markdown: 'x', mode: 'replace_section' })).rejects.toThrow(/needs `section`/);
    expect(f.batches).toHaveLength(1); // nothing sent for a no-op or a missing section
    await tool('update_note', f.session).handler({ noteId: N, title: 'Only a title' }); // control
    expect(types(f.batches[1])).toEqual(['note.renamed']);
    await tool('update_note', f.session).handler({ noteId: N, scope: 'workspace', projectId: 'p9' });
    expect(types(f.batches[2])).toEqual(['note.scope_set', 'note.moved']);
    expect(f.batches[2]![1]!['payload']).toEqual({ homeProjectId: 'p9' });
    await tool('update_note', f.session).handler({ noteId: N, markdown: 'tail', mode: 'append' });
    const appended = (f.batches[3]![0]!['payload'] as { body: { content: unknown[] } }).body.content;
    expect(appended.slice(0, 4)).toEqual(NOTE_BODY.content);
    expect(appended).toHaveLength(5);
  });

  it('14.403 a replace names what the old body had that Markdown dropped; a Markdown-clean body drops nothing', async () => {
    const clean = (await tool('update_note', fake().session).handler({ noteId: N, markdown: 'fresh' })) as Record<string, unknown>;
    expect(clean).not.toHaveProperty('dropped'); // control
    const withUnknown = { type: 'doc', content: [para('keep'), { type: 'image', attrs: { attachmentId: IMG, wrap: 'left', alt: '' } }] };
    const f = fake({ [`/v1/notes/${N}`]: { note: note({ body: withUnknown }) } });
    const answer = (await tool('update_note', f.session).handler({ noteId: N, markdown: 'fresh' })) as { dropped?: string[]; note?: string };
    expect(answer.dropped?.length ?? 0).toBeGreaterThan(0);
    expect(answer.note).toBe('The old body had these, which Markdown cannot carry; they are gone.');
  });

  it('14.405 link_note attaches and detaches; a refusal comes back verbatim', async () => {
    const f = fake();
    await tool('link_note', f.session).handler({ noteId: N, ticketId: T, action: 'attach' });
    await tool('link_note', f.session).handler({ noteId: N, ticketId: T, action: 'detach' });
    expect(f.batches.flat().map((e) => [e['type'], e['payload']])).toEqual([['note.attached', { ticketId: T }], ['note.detached', { ticketId: T }]]);
    const refusing = fake();
    refusing.session.postEvents = async () => ({ results: [{ status: 'refused', eventId: 'e', rule: 'permission.note', reason: 'You cannot see that ticket.' }] });
    await expect(tool('link_note', refusing.session).handler({ noteId: N, ticketId: T, action: 'attach' })).rejects.toThrow('refused by permission.note: You cannot see that ticket.');
  });

  it('14.406 delete_note previews without the exact title; restore needs none', async () => {
    const f = fake();
    const preview = await tool('delete_note', f.session).handler({ noteId: N, confirm_name: 'cold room' });
    expect(preview).toMatchObject({ preview: true, nothingChanged: true, confirm: 'confirm_name must be "Cold room"' });
    expect((preview as { wouldChange: string }).wouldChange).toBe('Moves the note "Cold room" to Deleted items; it can be restored for 15 days.');
    expect(f.batches).toEqual([]);
    await tool('delete_note', f.session).handler({ noteId: N }); // no name at all is a preview too
    expect(f.batches).toEqual([]);
    await tool('delete_note', f.session).handler({ noteId: N, confirm_name: 'Cold room' });
    await tool('restore_note', f.session).handler({ noteId: N });
    expect(f.batches.flat().map((e) => e['type'])).toEqual(['note.deleted', 'note.restored']);
    expect(f.batches[0]![0]!['payload']).toEqual({});
  });

  it('14.407 get_note_history lists versions; a version id answers Markdown; an unknown one is not-found', async () => {
    const V = ulid('VERSION');
    const versions = [{ eventId: V, authorId: ME, recordedAt: '2026-10-02T09:30:00.000Z' }];
    const f = fake({
      [`/v1/notes/${N}/history/${V}`]: { body: NOTE_BODY },
      [`/v1/notes/${N}/history`]: { versions },
    });
    expect(await tool('get_note_history', f.session).handler({ noteId: N })).toEqual({ versions });
    const one = (await tool('get_note_history', f.session).handler({ noteId: N, versionId: V })) as Record<string, unknown>;
    expect(one).not.toHaveProperty('body');
    expect(one).toMatchObject({ versionId: V, lossy: [] });
    expect(one['markdown']).toContain('## Risks');
    await expect(tool('get_note_history', f.session).handler({ noteId: N, versionId: ulid('NOPE') })).rejects.toThrow('note version not found or not visible to you');
    await expect(tool('get_note_history', fake({}).session).handler({ noteId: N })).rejects.toThrow('note not found or not visible to you');
  });
});
