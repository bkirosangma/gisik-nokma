import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { hostedSession } from '../../src/mcp/in-process-fetch.js';

/** MCP sweep 2 T2, case 14.600 (hosted half): the in-process fetch carries PUT. */
describe('the hosted door carries PUT', () => {
  it('14.600 hostedSession.put reaches a PUT route with the caller\'s bearer token and body; post still posts; every verb of Session is present', async () => {
    const app = Fastify();
    app.put('/v1/echo', async (request) => ({ method: request.method, auth: request.headers.authorization, body: request.body }));
    app.post('/v1/echo', async (request) => ({ method: request.method, body: request.body }));
    await app.ready();
    const session = hostedSession(app, { ip: '203.0.113.5', xff: undefined }, 'access-token', 'USER');
    await session.ready();
    expect(await session.put('/v1/echo', { a: 1 })).toEqual({ method: 'PUT', auth: 'Bearer access-token', body: { a: 1 } });
    expect(await session.post('/v1/echo', { a: 2 })).toEqual({ method: 'POST', body: { a: 2 } }); // CONTROL
    for (const verb of ['userId', 'get', 'post', 'put', 'postEvents', 'getBytes', 'postMultipart'] as const) {
      expect(typeof session[verb], verb).toBe('function');
    }
    await app.close();
  });
});
