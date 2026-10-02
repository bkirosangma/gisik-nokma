import { describe, expect, it } from 'vitest';
import { domainRegistry, parseEvent } from '@gisik-nokma/domain';
import { HttpError } from '../src/http-client.js';
import type { Session } from '../src/session.js';
import { commentTools } from '../src/tools/comment-tools.js';
import { writeTools } from '../src/tools/write-tools.js';
import { NO_TRANSFER } from './fixtures/fake-session.js';

const ulid = (tag: string) => `01J0${tag}`.padEnd(26, '0');
const ME = ulid('ME');
const ASHA = ulid('ASHA');
const WS = ulid('WS');
const T = ulid('TKT');
const N = ulid('N0TE');
const C = ulid('CMNT');
const COMMITTED = { results: [{ status: 'committed', eventId: 'e', seq: 1, serverTime: '2026-10-02T10:00:00.000Z' }] };

function fake(routes: Record<string, unknown> = {}) {
  const sent: Array<Record<string, unknown>> = [];
  const asked: string[] = [];
  const session: Session = {
    userId: () => ME,
    get: async (path) => {
      asked.push(path);
      for (const [prefix, body] of Object.entries(routes)) if (path.startsWith(prefix)) return body;
      if (path.endsWith('/members')) return { members: [{ userId: ASHA, displayName: 'Asha Marak', role: 'member' }] };
      if (path.startsWith('/v1/search')) return { hits: [{ card: { ticketId: ulid('T40'), projectId: ulid('P'), key: 'CCSO-40', title: 'Not it' } }, { card: { ticketId: T, projectId: ulid('P'), key: 'CCSO-4', title: 'Chiller' } }], notes: [] };
      if (path.endsWith('/notes')) return { notes: [{ noteId: N, title: 'Cold room' }, { noteId: ulid('D1'), title: 'Twice' }, { noteId: ulid('D2'), title: 'Twice' }] };
      return {};
    },
    post: async () => ({}),
    postEvents: async (events) => {
      sent.push(...(events as Array<Record<string, unknown>>));
      return COMMITTED;
    },
    ...NO_TRANSFER,
  };
  return { session, sent, asked };
}
const tool = (name: string, s: Session) => {
  const t = [...writeTools(s), ...commentTools(s)].find((x) => x.name === name);
  if (t === undefined) throw new Error(name);
  return t;
};
type Node = { type: string; attrs?: Record<string, unknown>; content?: Node[] };
const blocks = (e: Record<string, unknown> | undefined) => ((e?.['payload'] as { body: { content: Node[] } }).body.content ?? []);

describe('14.380–14.388 comments in Markdown', () => {
  const BRIEF = "# Achri's Brief\n\n### 1. Where we are\n\n- responding to the cold-room ticket\n- waiting on the chiller part";

  it('14.380 add_comment stores a document; `text` is the same; both/neither refused', async () => {
    for (const key of ['markdown', 'text']) {
      const f = fake();
      await tool('add_comment', f.session).handler({ workspaceId: WS, ticketId: T, [key]: BRIEF });
      expect(blocks(f.sent[0]).map((b) => b.type), key).toEqual(['heading', 'heading', 'bulletList']);
      expect(parseEvent({ ...f.sent[0], serverTime: '2026-10-02T10:00:00.000Z', seq: 1 }, domainRegistry).ok).toBe(true);
    }
    const f = fake();
    await expect(tool('add_comment', f.session).handler({ workspaceId: WS, ticketId: T, markdown: 'a', text: 'b' })).rejects.toThrow(/exactly one of markdown or text/);
    await expect(tool('add_comment', f.session).handler({ workspaceId: WS, ticketId: T })).rejects.toThrow(/exactly one of markdown or text/);
    expect(f.sent).toEqual([]);
  });

  it('14.381 noteId files against the note; both or neither parent refused', async () => {
    const f = fake();
    await tool('add_comment', f.session).handler({ workspaceId: WS, noteId: N, markdown: 'hello' });
    expect(f.sent[0]).toMatchObject({ type: 'comment.added', entity: { kind: 'note', id: N }, origin: 'mcp', actorId: ME });
    await expect(tool('add_comment', f.session).handler({ workspaceId: WS, ticketId: T, noteId: N, markdown: 'x' })).rejects.toThrow('add_comment takes exactly one of ticketId or noteId');
  });

  it('14.382 / 14.384 mention, exact key and note title resolve; ambiguity refuses', async () => {
    const f = fake();
    await tool('add_comment', f.session).handler({ workspaceId: WS, ticketId: T, markdown: `@[Asha](user:${ASHA}) see [[CCSO-4]] and [[note:Cold room]] and @Asha` });
    const inline = blocks(f.sent[0])[0]?.content ?? [];
    expect(inline.filter((n) => n.type !== 'text')).toEqual([
      { type: 'mention', attrs: { userId: ASHA, label: 'Asha Marak' } },
      { type: 'ticketRef', attrs: { ticketId: T, projectId: ulid('P'), key: 'CCSO-4', title: 'Chiller' } },
      { type: 'wikiLink', attrs: { noteId: N, title: 'Cold room' } },
    ]);
    await expect(tool('add_comment', fake().session).handler({ workspaceId: WS, ticketId: T, markdown: '[[note:Twice]]' })).rejects.toThrow(
      'two or more notes are titled "Twice"; write [[note:<note id>]] instead',
    );
  });

  it('14.383 unknown tokens refuse before anything is sent', async () => {
    const f = fake();
    const stranger = ulid('STRNGR');
    await expect(
      tool('add_comment', f.session).handler({ workspaceId: WS, ticketId: T, markdown: `@[X](user:${stranger}) [[ZZ-9]] [[note:Nowhere]]` }),
    ).rejects.toThrow(`the Markdown was not stored: unknown mention @[X](user:${stranger}); unknown ticket [[ZZ-9]]; unknown note [[note:Nowhere]]`);
    expect(f.sent).toEqual([]);
  });

  it('14.385 list_comments answers Markdown, flags and lossy', async () => {
    const body = { type: 'doc', content: [{ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Hi' }] }] };
    const f = fake({
      [`/v1/workspaces/${WS}/tickets/${T}/comments`]: {
        comments: [
          { commentId: C, authorId: ASHA, body, recordedAt: '2026-10-02T09:00:00.000Z', editedAt: '2026-10-02T09:05:00.000Z', deletedAt: null, files: [] },
          { commentId: ulid('G0NE'), authorId: ASHA, body: null, recordedAt: '2026-10-02T09:01:00.000Z', editedAt: null, deletedAt: '2026-10-02T09:06:00.000Z', files: [] },
        ],
      },
    });
    const out = (await tool('list_comments', f.session).handler({ workspaceId: WS, ticketId: T })) as { comments: Array<Record<string, unknown>> };
    expect(out.comments).toEqual([
      { commentId: C, authorId: ASHA, recordedAt: '2026-10-02T09:00:00.000Z', editedAt: '2026-10-02T09:05:00.000Z', deleted: false, markdown: '## Hi', lossy: [], files: [] },
      { commentId: ulid('G0NE'), authorId: ASHA, recordedAt: '2026-10-02T09:01:00.000Z', editedAt: null, deleted: true, markdown: null, lossy: [], files: [] },
    ]);
    // The control above reads a TICKET; a NOTE's comments come from the note's own endpoint, and only from it.
    expect(f.asked).toEqual([`/v1/workspaces/${WS}/tickets/${T}/comments`]);
    const NOTE_COMMENT = ulid('NC');
    const g = fake({
      [`/v1/notes/${N}/comments`]: {
        comments: [{ commentId: NOTE_COMMENT, authorId: ASHA, body, recordedAt: '2026-10-02T09:02:00.000Z', editedAt: null, deletedAt: null, files: [] }],
      },
    });
    const onNote = (await tool('list_comments', g.session).handler({ workspaceId: WS, noteId: N })) as { comments: Array<Record<string, unknown>> };
    expect(g.asked).toEqual([`/v1/notes/${N}/comments`]);
    expect(onNote.comments).toEqual([
      { commentId: NOTE_COMMENT, authorId: ASHA, recordedAt: '2026-10-02T09:02:00.000Z', editedAt: null, deleted: false, markdown: '## Hi', lossy: [], files: [] },
    ]);
  });

  it('14.386 / 14.387 edit and delete emit one event each; refusals verbatim', async () => {
    const f = fake();
    await tool('edit_comment', f.session).handler({ workspaceId: WS, noteId: N, commentId: C, markdown: '**new**' });
    await tool('delete_comment', f.session).handler({ workspaceId: WS, ticketId: T, commentId: C });
    expect(f.sent.map((e) => [e['type'], (e['entity'] as { kind: string }).kind, (e['payload'] as { commentId: string }).commentId])).toEqual([
      ['comment.edited', 'note', C],
      ['comment.deleted', 'ticket', C],
    ]);
    const refused: Session = {
      ...f.session,
      postEvents: async () => ({ results: [{ status: 'refused', eventId: 'e', rule: 'permission.comment', reason: 'Only the person who wrote a comment can edit it.' }] }),
    };
    await expect(tool('edit_comment', refused).handler({ workspaceId: WS, ticketId: T, commentId: C, markdown: 'x' })).rejects.toThrow(
      'refused by permission.comment: Only the person who wrote a comment can edit it.',
    );
  });

  it('14.388 every comment tool teaches the syntax', () => {
    const s = fake().session;
    for (const name of ['add_comment', 'edit_comment']) expect(tool(name, s).description).toContain('@[Their Name](user:<userId>)');
    expect(tool('list_comments', s).description).toMatch(/Markdown/);
  });
});
