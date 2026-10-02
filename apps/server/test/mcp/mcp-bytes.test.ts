import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid } from '@gisik-nokma/domain';
import type { FastifyInstance } from 'fastify';
import { hostedSession } from '../../src/mcp/in-process-fetch.js';
import { buildOAuthApp, hostedToken } from '../helpers/oauth.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { signInWithPhone } from '../helpers/session.js';

/** MCP-everything T3. Cases 14.361 and 14.364. */
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
let db: TestDatabase;
beforeAll(async () => {
  db = await createTestDatabase();
});
afterAll(async () => {
  await db.drop();
});

describe('14.361 / 14.364 bytes through the hosted door', () => {
  it('14.361 upload and download through the in-process session are byte-identical', async () => {
    const { app, otp } = buildOAuthApp(db);
    await app.ready();
    const user = await signInWithPhone(app, otp, '+911100002361');
    const auth = { authorization: `Bearer ${user.token}` };
    const ws = (await app.inject({ method: 'POST', url: '/v1/workspaces', headers: auth, payload: { name: 'Bytes' } })).json<{ workspaceId: string }>().workspaceId;
    const project = newUlid();
    const ticket = newUlid();
    const event = (entity: { kind: string; id: string }, type: string, payload: unknown) => ({
      id: newUlid(), workspaceId: ws, entity, type, version: 1, payload, actorId: user.userId, origin: 'web', clientTime: new Date().toISOString(),
    });
    await app.inject({ method: 'POST', url: '/v1/events', headers: auth, payload: { events: [
      event({ kind: 'project', id: project }, 'project.created', { name: 'B' }),
      event({ kind: 'project', id: project }, 'project.member_added', { userId: user.userId, projectAdmin: true }),
      event({ kind: 'ticket', id: ticket }, 'ticket.created', { typeId: 'task', projectId: project, parentId: null, title: 'Has a file' }),
    ] } });
    const token = await hostedToken(app as FastifyInstance, db.pool, user.userId);
    const session = hostedSession(app as FastifyInstance, { ip: '127.0.0.1', xff: undefined }, token, user.userId);
    await session.ready();
    const uploaded = (await session.postMultipart('/v1/attachments', { ticketId: ticket }, { name: 'dot.png', bytes: new Uint8Array(PNG) })) as { attachmentId: string; mime: string; size: number };
    expect(uploaded).toMatchObject({ mime: 'image/png', size: PNG.length });
    const back = await session.getBytes(`/v1/attachments/${uploaded.attachmentId}`);
    expect(Buffer.from(back.bytes).equals(PNG)).toBe(true);
    expect(back.contentType).toBe('image/png');
    expect(await session.get('/v1/me/workspaces')).toMatchObject({ workspaces: [{ workspaceId: ws }] }); // control: JSON still works
    await app.close();
  });

  it('14.364 /mcp takes a 12 MB body and refuses one over 16 MiB', async () => {
    const { app, otp } = buildOAuthApp(db);
    await app.ready();
    const user = await signInWithPhone(app, otp, '+911100002364');
    const token = await hostedToken(app as FastifyInstance, db.pool, user.userId);
    const call = (size: number) =>
      app.inject({
        method: 'POST', url: '/mcp',
        headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'mcp-protocol-version': '2025-06-18', authorization: `Bearer ${token}` },
        payload: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_workspaces', arguments: { pad: 'x'.repeat(size) } } }),
      });
    expect((await call(10)).statusCode).toBe(200); // control
    expect((await call(12_000_000)).statusCode).not.toBe(413);
    expect((await call(17 * 1024 * 1024)).statusCode).toBe(413);
    await app.close();
  });
});
