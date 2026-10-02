import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { buildDoorWorld, runDoorMatrix } from './helpers/door-matrix.js';

/**
 * MCP-everything T8, cases 14.435 (hosted control), 14.437 and 14.438 (the package cases 14.430–14.436 are
 * `packages/mcp-server/test/attachment-tools.test.ts`). Every call is a `tools/call` on `POST /mcp` — the door
 * an assistant uses — against the real app, the real upload route and the real database. Run LOCALLY.
 */
let db: TestDatabase;
beforeAll(async () => {
  db = await createTestDatabase();
});
afterAll(async () => {
  await db.drop();
});

/** The 70-byte 1×1 PNG. */
const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const LIMIT = 10 * 1024 * 1024;

type Content = Array<{ type: string; text?: string; data?: string; mimeType?: string }>;
/** `tools/call` keeping EVERY content block (the shared `callTool` reads only the first text block). */
async function rawCall(app: FastifyInstance, token: string, name: string, args: Record<string, unknown>) {
  const res = await app.inject({
    method: 'POST', url: '/mcp',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'mcp-protocol-version': '2025-06-18', authorization: `Bearer ${token}` },
    payload: { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } },
  });
  expect(res.statusCode, res.body.slice(0, 200)).toBe(200);
  const result = res.json().result as { isError?: boolean; content: Content };
  return { isError: result.isError === true, content: result.content, text: result.content.find((c) => c.type === 'text')?.text ?? '' };
}

/** A real PNG padded with zero bytes to `size`: the sniffer reads the signature, so the type stays image/png. */
function paddedPng(size: number): Buffer {
  const png = Buffer.from(PNG_B64, 'base64');
  return Buffer.concat([png, Buffer.alloc(size - png.length)]);
}

describe('MCP attachments through the hosted door', () => {
  it('14.435 a PNG attached through /mcp comes back as an image block with the same bytes; a stranger is told it is not found', async () => {
    const w = await buildDoorWorld(db, '2435');
    const call = (token: string, name: string, args: Record<string, unknown>) => rawCall(w.app, token, name, args);
    const made = await call(w.owner.token, 'create_ticket', { workspaceId: w.workspaceId, projectId: w.projectId, typeId: 'task', title: 'Photo ticket' });
    expect(made.isError, made.text).toBe(false);
    const ticketId = (JSON.parse(made.text) as { ticketId: string }).ticketId;

    const added = await call(w.owner.token, 'add_attachment', { workspaceId: w.workspaceId, ticketId, file: { name: 'dot.png', base64: PNG_B64 } });
    expect(added.isError, added.text).toBe(false);
    expect(JSON.parse(added.text)).toMatchObject({ status: 'committed' }); // the answer is the commit of attachment.added

    const listed = await call(w.owner.token, 'list_attachments', { workspaceId: w.workspaceId, ticketId });
    const files = (JSON.parse(listed.text) as { attachments: Array<{ attachmentId: string; filename: string; mime: string; size: number }> }).attachments;
    expect(files).toEqual([expect.objectContaining({ filename: 'dot.png', mime: 'image/png', size: 70 })]);
    const row = files[0]!;

    const got = await call(w.owner.token, 'get_attachment', { attachmentId: row.attachmentId });
    expect(got.isError, got.text).toBe(false);
    const image = got.content.find((c) => c.type === 'image');
    expect(image?.mimeType).toBe('image/png');
    // CONTROL: the bytes that come back are the bytes that went in, not a re-encoding.
    expect(Buffer.from(image!.data!, 'base64').equals(Buffer.from(PNG_B64, 'base64'))).toBe(true);
    // The product serves an image `inline`, with no filename in the download's headers, so the name comes from list_attachments.
    expect(JSON.parse(got.text)).toMatchObject({ filename: null, mime: 'image/png', size: 70 });

    const seen = await call(w.stranger.token, 'get_attachment', { attachmentId: row.attachmentId });
    expect(seen.isError).toBe(true);
    expect(seen.text).toBe('attachment not found or not visible to you');

    const ledger = await db.pool.query<{ origin: string; actor_id: string }>(
      `SELECT origin, actor_id FROM events WHERE workspace_id = $1 AND type = 'attachment.added'`, [w.workspaceId]);
    expect(ledger.rows).toEqual([{ origin: 'mcp', actor_id: w.owner.userId }]);
  });

  it('14.437 every attachment tool: stranger, forbidden member, allowed caller', async () => {
    const w = await buildDoorWorld(db, '2437');
    const ticketArgs = (x: typeof w) => ({ workspaceId: x.workspaceId, ticketId: x.ticketId });
    const NOTE_NOT_FOUND = 'note not found or not visible to you';
    await runDoorMatrix(w, [
      { tool: 'list_attachments', args: ticketArgs, stranger: 'ticket not found or not visible to you', allowed: { caller: 'member' } },
      { tool: 'add_attachment', args: (x) => ({ ...ticketArgs(x), file: { name: 'matrix.png', base64: PNG_B64 } }), stranger: 'ticket not found or not visible to you',
        allowed: { caller: 'member', eventType: 'attachment.added' } },
      // a private note: neither the stranger nor the member can see it, so both are told "not found" (never "forbidden"); its author can
      { tool: 'list_attachments', args: (x) => ({ workspaceId: x.workspaceId, noteId: x.privateNoteId }), stranger: NOTE_NOT_FOUND,
        forbidden: { text: NOTE_NOT_FOUND }, allowed: { caller: 'owner' } },
    ]);
  });

  it('14.438 exactly 10 MB goes through /mcp and is stored; one byte more is refused naming 10 MB and stores nothing', async () => {
    const w = await buildDoorWorld(db, '2438');
    const call = (name: string, args: Record<string, unknown>) => rawCall(w.app, w.owner.token, name, args);
    const stored = async () =>
      (await db.pool.query<{ n: number }>('SELECT count(*)::int AS n FROM attachments WHERE workspace_id = $1', [w.workspaceId])).rows[0]!.n;

    const atLimit = await call('add_attachment', { workspaceId: w.workspaceId, ticketId: w.ticketId, file: { name: 'big.png', base64: paddedPng(LIMIT).toString('base64') } });
    expect(atLimit.isError, atLimit.text.slice(0, 300)).toBe(false);
    expect(JSON.parse(atLimit.text)).toMatchObject({ status: 'committed' });
    const row = await db.pool.query<{ size: string; mime: string }>('SELECT size, mime FROM attachments WHERE workspace_id = $1', [w.workspaceId]);
    expect(row.rows.map((r) => [Number(r.size), r.mime])).toEqual([[LIMIT, 'image/png']]); // the whole 10 MB reached the store, sniffed as a PNG

    const over = await call('add_attachment', { workspaceId: w.workspaceId, ticketId: w.ticketId, file: { name: 'big2.png', base64: paddedPng(LIMIT + 1).toString('base64') } });
    expect(over.isError).toBe(true);
    expect(over.text).toMatch(/10 MB/);
    expect(await stored()).toBe(1); // nothing was stored for the refused one
  });
});
