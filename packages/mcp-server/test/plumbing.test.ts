import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { domainRegistry, parseEvent } from '@gisik-nokma/domain';
import { encodeMultipart, HttpError, type GisikClient } from '../src/http-client.js';
import { createSession } from '../src/session.js';
import { lazySession } from '../src/lazy-session.js';
import { writeCachedToken } from '../src/token-cache.js';
import { confirmOrPreview } from '../src/tools/preview.js';
import { ToolReply } from '../src/tools/reply.js';
import { registerToolDefinitions } from '../src/tools/register.js';
import { page, readOrNotFound } from '../src/tools/reads.js';
import type { ToolDefinition } from '../src/tools/read-tools.js';
import { envelopeFor } from '../src/tools/submit.js';
import { NO_TRANSFER } from './fixtures/fake-session.js';

/** MCP-everything T3. Cases 14.360, 14.362, 14.363, 14.365, 14.367, 14.368, 14.369. */
const dec = new TextDecoder();

function indexOf(haystack: Uint8Array, needle: Uint8Array): number {
  outer: for (let i = 0; i <= haystack.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) if (haystack[i + j] !== needle[j]) continue outer;
    return i;
  }
  return -1;
}

describe('14.360–14.369 plumbing', () => {
  it('14.360 fields first, the file byte-identical, header-breaking characters replaced', () => {
    const bytes = new Uint8Array([0x89, 0x50, 0xff, 0x00, 0x0d, 0x0a]);
    const body = encodeMultipart({ ticketId: 'T1' }, { name: 'a"b\r\nc.png', bytes }, 'BOUNDARY');
    const text = dec.decode(body);
    expect(text.indexOf('name="ticketId"')).toBeGreaterThan(-1);
    expect(text.indexOf('name="ticketId"')).toBeLessThan(text.indexOf('name="file"'));
    expect(text).toContain('filename="a_b__c.png"');
    const head = new TextEncoder().encode('Content-Type: application/octet-stream\r\n\r\n');
    const start = indexOf(body, head) + head.length;
    expect([...body.slice(start, start + bytes.length)]).toEqual([...bytes]);
    expect(dec.decode(encodeMultipart({}, { name: 'plain.png', bytes }, 'B'))).toContain('filename="plain.png"'); // control
  });

  it('14.362 only the exact name confirms; anything else is a preview and describes once', async () => {
    let described = 0;
    const describe = async () => ((described += 1), { sentence: 'Renames 12 ticket keys.', counts: { ticketKeys: 12 } });
    expect(await confirmOrPreview('Corner Shop', 'Corner Shop', describe)).toBeNull(); // control
    expect(described).toBe(0);
    for (const given of [undefined, 'corner shop', 'Corner Shop ']) {
      expect(await confirmOrPreview('Corner Shop', given, describe)).toEqual({
        preview: true,
        wouldChange: 'Renames 12 ticket keys.',
        counts: { ticketKeys: 12 },
        nothingChanged: true,
        confirm: 'confirm_name must be "Corner Shop"',
      });
    }
    expect(described).toBe(3);
  });

  it('14.363 a ToolReply image goes through the REAL registration loop as an image; a plain answer stays one JSON text block', async () => {
    const session = lazySession(async () => ({
      userId: () => 'u', get: async () => ({}), post: async () => ({}), postEvents: async () => ({}), ...NO_TRANSFER,
    }));
    const tools: ToolDefinition[] = [
      { name: 'picture', description: 'test', inputSchema: {}, handler: async () => new ToolReply([{ type: 'image', data: 'iVBORw0KGgo=', mimeType: 'image/png' }]) },
      { name: 'plain', description: 'test', inputSchema: {}, handler: async () => ({ ok: true }) },
    ];
    const server = new McpServer({ name: 't', version: '0' });
    registerToolDefinitions(server, session, tools);
    const client = new Client({ name: 'c', version: '0' });
    const [a, b] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(b), client.connect(a)]);
    expect((await client.callTool({ name: 'picture', arguments: {} })).content).toEqual([{ type: 'image', data: 'iVBORw0KGgo=', mimeType: 'image/png' }]);
    expect((await client.callTool({ name: 'plain', arguments: {} })).content).toEqual([{ type: 'text', text: JSON.stringify({ ok: true }, null, 2) }]); // control
  });

  it('14.368 page: offset cursor, default 50, cap 200, refuses a foreign cursor', () => {
    const items = Array.from({ length: 120 }, (_, i) => i);
    const first = page(items, undefined, undefined);
    const second = page(items, first.nextCursor ?? undefined, undefined);
    const third = page(items, second.nextCursor ?? undefined, undefined);
    expect([first.items.length, second.items.length, third.items.length, third.nextCursor]).toEqual([50, 50, 20, null]);
    expect(page(Array.from({ length: 500 }, (_, i) => i), undefined, 500).items).toHaveLength(200);
    expect(() => page(items, 'abc', 10)).toThrow('cursor is not one this tool gave out');
  });

  it('14.369 readOrNotFound maps only a 404', async () => {
    const s = (error: unknown) => ({ userId: () => 'u', get: async () => { throw error; }, post: async () => ({}), postEvents: async () => ({}), ...NO_TRANSFER });
    await expect(readOrNotFound(s(new HttpError(404, null)), '/x', 'ticket')).rejects.toThrow('ticket not found or not visible to you');
    await expect(readOrNotFound(s(new HttpError(500, null)), '/x', 'ticket')).rejects.toThrow('gisik-nokma answered 500');
    const okSession = { userId: () => 'u', get: async () => ({ a: 1 }), post: async () => ({}), postEvents: async () => ({}), ...NO_TRANSFER };
    expect(await readOrNotFound(okSession, '/x', 'ticket')).toEqual({ a: 1 }); // control
  });

  it('14.365 getBytes and postMultipart re-authenticate once on 401; 403 is thrown without a login', async () => {
    const config = {
      serverUrl: 'http://server',
      tokenPath: join(mkdtempSync(join(tmpdir(), 'gisik-t3-')), 'mcp-token'),
      pollIntervalMs: 1,
    };
    await writeCachedToken(config.tokenPath, { token: 'stale', userId: 'old' });
    const seen: string[] = [];
    let logins = 0;
    const client: GisikClient = {
      get: async () => ({}),
      getBytes: async (_path, token) => {
        seen.push(`bytes:${token}`);
        if (token === 'stale') throw new HttpError(401, null);
        return { bytes: new Uint8Array([1]), contentType: 'image/png', filename: null };
      },
      post: async (path) => {
        if (path === '/v1/mcp/device/code') {
          logins += 1;
          return { deviceCode: 'd', userCode: 'BCDF-GHJK', verificationUri: 'http://web/a', expiresInSec: 600, pollIntervalSec: 1 };
        }
        return { status: 'issued', token: 'fresh', userId: '01J0USER0000000000000000BB' };
      },
      postMultipart: async (_path, _fields, _file, token) => {
        seen.push(`multipart:${token}`);
        throw new HttpError(403, { error: 'forbidden' });
      },
    };
    const session = await createSession({ config, client, prompt: () => {}, sleep: async () => {}, now: () => 0 });
    await expect(session.getBytes('/v1/attachments/a')).resolves.toMatchObject({ contentType: 'image/png' });
    expect(seen).toEqual(['bytes:stale', 'bytes:fresh']);
    expect(logins).toBe(1);
    await expect(session.postMultipart('/v1/attachments', {}, { name: 'x', bytes: new Uint8Array() })).rejects.toMatchObject({ status: 403 });
    expect(seen.at(-1)).toBe('multipart:fresh');
    expect(logins).toBe(1); // a 403 is the answer, not a reason to log in again

    // The upload half: its own session (a stale token), so `postMultipart` itself is what meets the 401.
    const second = { ...config, tokenPath: join(mkdtempSync(join(tmpdir(), 'gisik-t3-')), 'mcp-token') };
    await writeCachedToken(second.tokenPath, { token: 'stale', userId: 'old' });
    const uploads: string[] = [];
    const uploader: GisikClient = {
      ...client,
      postMultipart: async (_path, _fields, _file, token) => {
        uploads.push(`multipart:${token}`);
        if (token === 'stale') throw new HttpError(401, null);
        return { attachmentId: 'a' };
      },
    };
    const before = logins;
    const uploadSession = await createSession({ config: second, client: uploader, prompt: () => {}, sleep: async () => {}, now: () => 0 });
    await expect(uploadSession.postMultipart('/v1/attachments', {}, { name: 'x', bytes: new Uint8Array() })).resolves.toEqual({ attachmentId: 'a' });
    expect(uploads).toEqual(['multipart:stale', 'multipart:fresh']);
    expect(logins).toBe(before + 1);
  });

  it('14.367 envelopeFor takes any domain entity kind', () => {
    const s = { userId: () => '01J0A5ER0000000000000000AA', get: async () => ({}), post: async () => ({}), postEvents: async () => ({}), ...NO_TRANSFER };
    const env = envelopeFor(s, '01J0WS000000000000000000AA', { kind: 'note', id: '01J0N0TE00000000000000000A' }, 'note.renamed', { title: 'x' });
    expect(parseEvent({ ...env, serverTime: '2026-10-02T10:00:00.000Z', seq: 1 }, domainRegistry).ok).toBe(true);
  });
});
