import { describe, expect, it } from 'vitest';
import { domainRegistry, parseEvent } from '@gisik-nokma/domain';
import { HttpError } from '../src/http-client.js';
import type { Session } from '../src/session.js';
import { attachmentTools, MAX_BASE64_CHARS, MCP_ATTACHMENT_MAX_BYTES } from '../src/tools/attachment-tools.js';
import { ToolReply } from '../src/tools/reply.js';

/** MCP-everything T8 (plan Task 8): `list_attachments`, `get_attachment`, `add_attachment`. Cases 14.430–14.436. */
const ulid = (tag: string) => `01J0${tag}`.padEnd(26, '0');
const WS = ulid('WS');
const T = ulid('TKT');
const N = ulid('N0TE');
const A = ulid('ATT');
const A2 = ulid('ATU');
const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const COMMITTED = { results: [{ status: 'committed', eventId: 'e', seq: 1, serverTime: '2026-10-02T10:00:00.000Z' }] };
const NOTE_BODY = { type: 'doc', attrs: { schemaVersion: 2 }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'keep me' }] }] };
const TICKET_PATH = `/v1/workspaces/${WS}/tickets/${T}/attachments`;

type Download = { bytes: Uint8Array; contentType: string; filename: string | null };
function fake(sniffed = 'image/png', over: { routes?: Record<string, unknown>; download?: Download } = {}) {
  const uploads: Array<{ path: string; fields: Record<string, string>; name: string; size: number }> = [];
  const sent: Array<Record<string, unknown>> = [];
  const gets: string[] = [];
  const routes: Record<string, unknown> = {
    [`/v1/notes/${N}`]: { note: { noteId: N, workspaceId: WS, title: 'N', body: { ...NOTE_BODY, content: [...NOTE_BODY.content, { type: 'image', attrs: { attachmentId: A2, wrap: 'block' } }] } } },
    [TICKET_PATH]: { attachments: [] },
    ...over.routes,
  };
  const session: Session = {
    userId: () => ulid('ME'),
    get: async (path) => {
      gets.push(path);
      if (!(path in routes)) throw new HttpError(404, { error: 'not-found' });
      return routes[path];
    },
    post: async () => ({}),
    postEvents: async (events) => {
      sent.push(...(events as Array<Record<string, unknown>>));
      return COMMITTED;
    },
    getBytes: async () => over.download ?? { bytes: Buffer.from(PNG_B64, 'base64'), contentType: 'image/png', filename: 'dot.png' },
    postMultipart: async (path, fields, file) => {
      uploads.push({ path, fields, name: file.name, size: file.bytes.length });
      return { attachmentId: A, url: `/v1/attachments/${A}`, mime: sniffed, filename: file.name, size: file.bytes.length, sha256: 'a'.repeat(64) };
    },
  };
  return { session, uploads, sent, gets };
}
const tool = (name: string, s: Session) => {
  const found = attachmentTools(s).find((t) => t.name === name);
  if (found === undefined) throw new Error(`no tool named ${name}`);
  return found;
};
const parses = (envelope: Record<string, unknown> | undefined) => parseEvent({ ...envelope, serverTime: '2026-10-02T10:00:00.000Z', seq: 1 }, domainRegistry).ok;

describe('14.430 add_attachment to a ticket', () => {
  it('14.430 uploads the bytes (ticketId field), then records attachment.added from the SERVER answer', async () => {
    const f = fake('image/png');
    await tool('add_attachment', f.session).handler({ workspaceId: WS, ticketId: T, file: { name: 'shot.jpg', base64: PNG_B64 } });
    expect(f.uploads).toEqual([{ path: '/v1/attachments', fields: { ticketId: T }, name: 'shot.jpg', size: 70 }]);
    expect(f.sent).toHaveLength(1);
    // `.jpg` by name, but the server sniffed a PNG: the event carries what the server said.
    expect(f.sent[0]).toMatchObject({
      type: 'attachment.added', entity: { kind: 'ticket', id: T }, origin: 'mcp', workspaceId: WS,
      payload: { kind: 'upload', attachmentId: A, filename: 'shot.jpg', mime: 'image/png', size: 70, sha256: 'a'.repeat(64) },
    });
    expect(parses(f.sent[0])).toBe(true); // CONTROL: the envelope is one the server would accept
  });
});

describe('14.431 add_attachment to a note', () => {
  it('14.431 images only: a non-image name is refused before upload, a sniffed non-image after; an image is appended by ONE note.body_set', async () => {
    const f = fake('image/png');
    await expect(tool('add_attachment', f.session).handler({ workspaceId: WS, noteId: N, file: { name: 'report.pdf', base64: PNG_B64 } })).rejects.toThrow(/A note holds images/);
    expect(f.uploads).toEqual([]);
    // CONTROL: the image case.
    await tool('add_attachment', f.session).handler({ workspaceId: WS, noteId: N, file: { name: 'dot.png', base64: PNG_B64 } });
    expect(f.uploads).toEqual([{ path: '/v1/attachments', fields: { noteId: N }, name: 'dot.png', size: 70 }]);
    expect(f.sent).toHaveLength(1);
    const body = (f.sent[0]!['payload'] as { body: { content: unknown[] } }).body;
    expect(f.sent[0]).toMatchObject({ type: 'note.body_set', entity: { kind: 'note', id: N }, origin: 'mcp', workspaceId: WS });
    // every existing node kept, the new image last
    expect(body.content).toEqual([
      NOTE_BODY.content[0],
      { type: 'image', attrs: { attachmentId: A2, wrap: 'block' } },
      { type: 'image', attrs: { attachmentId: A, wrap: 'block', alt: 'dot.png' } },
    ]);
    expect(parses(f.sent[0])).toBe(true);
    // A `.png` that the server sniffs as a PDF is refused AFTER the upload, and no body is written.
    const pdf = fake('application/pdf');
    await expect(tool('add_attachment', pdf.session).handler({ workspaceId: WS, noteId: N, file: { name: 'sneaky.png', base64: PNG_B64 } })).rejects.toThrow(/A note holds images/);
    expect(pdf.uploads).toHaveLength(1);
    expect(pdf.sent).toEqual([]);
  });
});

describe('14.432 the 10 MB limit', () => {
  it('14.432 over-long base64 is refused before decoding, 10,485,761 bytes after decoding; exactly 10,485,760 uploads', async () => {
    const f = fake();
    const call = (base64: string) => tool('add_attachment', f.session).handler({ workspaceId: WS, ticketId: T, file: { name: 'big.bin', base64 } });
    expect(MAX_BASE64_CHARS).toBe(13_981_016);
    expect(MCP_ATTACHMENT_MAX_BYTES).toBe(10_485_760);
    await expect(call('A'.repeat(MAX_BASE64_CHARS + 4))).rejects.toThrow(/10 MB/);
    // 10,485,761 bytes encode to the SAME 13,981,016 characters as the limit: only the decoded size can refuse it.
    const plusOne = Buffer.alloc(MCP_ATTACHMENT_MAX_BYTES + 1).toString('base64');
    expect(plusOne.length).toBe(MAX_BASE64_CHARS);
    await expect(call(plusOne)).rejects.toThrow(/10 MB/);
    expect(f.uploads).toEqual([]);
    // CONTROL: exactly the limit.
    await call(Buffer.alloc(MCP_ATTACHMENT_MAX_BYTES).toString('base64'));
    expect(f.uploads[0]?.size).toBe(MCP_ATTACHMENT_MAX_BYTES);
  });
});

describe('14.433 / 14.434 arguments and refusals', () => {
  it('14.433 malformed base64 names the field; file is required (no link argument)', async () => {
    const f = fake();
    const add = (file: unknown, extra: Record<string, unknown> = {}) => tool('add_attachment', f.session).handler({ workspaceId: WS, ticketId: T, file, ...extra });
    for (const bad of ['not base64!', 'abc=d', 'A']) {
      await expect(add({ name: 'x', base64: bad }), bad).rejects.toThrow('file.base64 is not valid base64');
    }
    await expect(tool('add_attachment', f.session).handler({ workspaceId: WS, ticketId: T })).rejects.toThrow(/file/);
    await expect(tool('add_attachment', f.session).handler({ workspaceId: WS, ticketId: T, link: 'https://example.in' })).rejects.toThrow(/file/);
    expect(f.uploads).toEqual([]);
    await add({ name: 'x.png', base64: PNG_B64 }); // CONTROL: valid base64 passes
    expect(f.uploads).toHaveLength(1);
  });

  it('14.433 exactly one of ticketId / noteId', async () => {
    const f = fake();
    await expect(tool('add_attachment', f.session).handler({ workspaceId: WS, file: { name: 'x.png', base64: PNG_B64 } })).rejects.toThrow('exactly one of ticketId or noteId');
    await expect(tool('add_attachment', f.session).handler({ workspaceId: WS, ticketId: T, noteId: N, file: { name: 'x.png', base64: PNG_B64 } })).rejects.toThrow('exactly one of ticketId or noteId');
    expect(f.uploads).toEqual([]);
  });

  it('14.434 an upload refusal comes back in the server\'s words', async () => {
    const f = fake();
    const file = { name: 'x.png', base64: PNG_B64 };
    const fail = (status: number, body: unknown): Session => ({ ...f.session, postMultipart: async () => { throw new HttpError(status, body); } });
    await expect(tool('add_attachment', fail(413, { error: 'payload-too-large', reason: 'This request has too many parts.' })).handler({ workspaceId: WS, ticketId: T, file }))
      .rejects.toThrow('payload-too-large: This request has too many parts.');
    await expect(tool('add_attachment', fail(415, { error: 'unsupported-media-type', reason: 'That file type is not allowed.' })).handler({ workspaceId: WS, ticketId: T, file }))
      .rejects.toThrow('unsupported-media-type: That file type is not allowed.');
    await expect(tool('add_attachment', fail(403, { error: 'forbidden', reason: 'Only the note’s author can add files to it.' })).handler({ workspaceId: WS, noteId: N, file }))
      .rejects.toThrow('forbidden: Only the note’s author can add files to it.');
    await expect(tool('add_attachment', fail(404, { error: 'not-found' })).handler({ workspaceId: WS, ticketId: T, file })).rejects.toThrow('ticket not found or not visible to you');
    await expect(tool('add_attachment', fail(404, { error: 'not-found' })).handler({ workspaceId: WS, noteId: N, file })).rejects.toThrow('note not found or not visible to you');
    // A failure that is not the server's words is not dressed up: and nothing was recorded.
    await expect(tool('add_attachment', fail(500, null)).handler({ workspaceId: WS, ticketId: T, file })).rejects.toThrow('gisik-nokma answered 500');
    expect(f.sent).toEqual([]);
    await tool('add_attachment', f.session).handler({ workspaceId: WS, ticketId: T, file }); // CONTROL: the 201 path
    expect(f.sent).toHaveLength(1);
  });

  it('14.434 the product refusing attachment.added after the upload is passed verbatim', async () => {
    const f = fake();
    const refusing: Session = { ...f.session, postEvents: async () => ({ results: [{ status: 'refused', eventId: 'e', rule: 'permission.role', reason: 'A ticket that is archived takes no files.' }] }) };
    await expect(tool('add_attachment', refusing).handler({ workspaceId: WS, ticketId: T, file: { name: 'x.png', base64: PNG_B64 } }))
      .rejects.toThrow('refused by permission.role: A ticket that is archived takes no files.');
  });
});

describe('14.435 get_attachment', () => {
  it('14.435 an image answers an image block plus its name, mime and size', async () => {
    const out = await tool('get_attachment', fake().session).handler({ attachmentId: A });
    expect(out).toBeInstanceOf(ToolReply);
    const content = (out as ToolReply).content;
    expect(content[0]).toMatchObject({ type: 'text' });
    expect(JSON.parse((content[0] as { text: string }).text)).toEqual({ attachmentId: A, filename: 'dot.png', mime: 'image/png', size: 70 });
    expect(content[1]).toEqual({ type: 'image', data: PNG_B64, mimeType: 'image/png' });
  });

  it('14.435 text answers its text; anything else its metadata and "open it in the app"; over 10 MB metadata only; an unseen id is not found', async () => {
    const dl = (contentType: string, bytes: Uint8Array, filename = 'f'): Download => ({ bytes, contentType, filename });
    const get = (download: Download) => tool('get_attachment', fake('image/png', { download }).session).handler({ attachmentId: A });
    expect(await get(dl('text/plain', Buffer.from('café notes'), 'n.txt'))).toEqual({ attachmentId: A, filename: 'n.txt', mime: 'text/plain', size: 11, text: 'café notes' });
    expect(await get(dl('application/pdf', Buffer.from('%PDF-1.4'), 'r.pdf'))).toMatchObject({ mime: 'application/pdf', size: 8, note: expect.stringContaining('open it in the app') });
    const big = await get(dl('image/png', new Uint8Array(MCP_ATTACHMENT_MAX_BYTES + 1), 'big.png'));
    expect(big).not.toBeInstanceOf(ToolReply);
    expect(big).toMatchObject({ size: MCP_ATTACHMENT_MAX_BYTES + 1, note: expect.stringContaining('10 MB') });
    expect(big).not.toHaveProperty('text');
    const hidden: Session = { ...fake().session, getBytes: async () => { throw new HttpError(404, { error: 'not-found' }); } };
    await expect(tool('get_attachment', hidden).handler({ attachmentId: A })).rejects.toThrow('attachment not found or not visible to you');
  });
});

describe('14.436 list_attachments', () => {
  it('14.436 a ticket lists its files (control: an empty ticket answers []); a note lists the images its body embeds; both page', async () => {
    const empty = fake();
    expect(await tool('list_attachments', empty.session).handler({ workspaceId: WS, ticketId: T })).toEqual({ attachments: [], nextCursor: null });
    expect(empty.gets).toEqual([TICKET_PATH]);

    const rows = [A, A2, ulid('ATV')].map((attachmentId) => ({ attachmentId, filename: `${attachmentId}.png`, mime: 'image/png', size: 1, sha256: 'a'.repeat(64) }));
    const full = fake('image/png', { routes: { [TICKET_PATH]: { attachments: rows } } });
    const first = (await tool('list_attachments', full.session).handler({ workspaceId: WS, ticketId: T, limit: 2 })) as { attachments: unknown[]; nextCursor: string | null };
    expect(first.attachments).toEqual(rows.slice(0, 2));
    expect(first.nextCursor).toBe('2');
    expect(await tool('list_attachments', full.session).handler({ workspaceId: WS, ticketId: T, limit: 2, cursor: '2' })).toEqual({ attachments: rows.slice(2), nextCursor: null });

    const note = fake();
    const out = (await tool('list_attachments', note.session).handler({ workspaceId: WS, noteId: N })) as { images: unknown[]; nextCursor: string | null; note: string };
    expect(note.gets).toEqual([`/v1/notes/${N}`]); // the note route, never the ticket one
    expect(out.images).toEqual([{ attachmentId: A2 }]);
    expect(out.note).toContain("A note's files are the images in its body");
    const pagedNote = (await tool('list_attachments', note.session).handler({ workspaceId: WS, noteId: N, limit: 1 })) as { nextCursor: string | null };
    expect(pagedNote.nextCursor).toBeNull();

    // an unseen ticket / note: one sentence, not "answered 404"
    const gone: Session = { ...empty.session, get: async () => { throw new HttpError(404, { error: 'not-found' }); } };
    await expect(tool('list_attachments', gone).handler({ workspaceId: WS, ticketId: T })).rejects.toThrow('ticket not found or not visible to you');
    await expect(tool('list_attachments', gone).handler({ workspaceId: WS, noteId: N })).rejects.toThrow('note not found or not visible to you');
  });
});
