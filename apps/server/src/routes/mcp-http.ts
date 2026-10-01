import type { FastifyInstance } from 'fastify';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { registerTools } from '@gisik-nokma/mcp-server';
import type { Queryable } from '../db/queryable.js';
import { hashCredential, resolveMcpToken } from '../mcp/token-store.js';
import { hostedSession } from '../mcp/in-process-fetch.js';

/**
 * The hosted MCP endpoint (remote-MCP plan Task 7, cases 14.260–14.269).
 * Registered ONLY when `MCP_PUBLIC_URL` is set (`app.ts`).
 *
 * STATELESS Streamable HTTP (plan FD9): every POST builds a fresh `McpServer` and
 * transport, answers with a JSON body, and tears both down. There is no session
 * id to look up, so no second instance, restart or deploy can strand a client,
 * and no per-connection state exists to go stale when a person is removed from a
 * workspace (14.266) — the tools call the API's own routes as the caller on
 * every request.
 *
 * The transport is the web-standard one, driven with a web `Request` built from
 * the Fastify one, rather than the Node one behind `reply.hijack()`: hijacking
 * would step outside Fastify's hooks (the rate limiter, the request log) for the
 * one route where they matter most.
 */
export function registerMcpHttpRoute(
  app: FastifyInstance,
  deps: { pool: Queryable; publicUrl: string; allowedOrigins: string[]; now?: () => Date },
): void {
  const now = deps.now ?? (() => new Date());
  const publicUrl = deps.publicUrl.replace(/\/$/, '');
  const challenge = `Bearer resource_metadata="${publicUrl}/.well-known/oauth-protected-resource/mcp"`;

  // Stateless: there is no server-to-client stream to open (GET) and no session to
  // end (DELETE). 405 is what the spec asks such a server to answer.
  for (const method of ['GET', 'DELETE'] as const) {
    app.route({
      method,
      url: '/mcp',
      handler: async (_request, reply) => reply.code(405).header('allow', 'POST').send({ error: 'method_not_allowed' }),
    });
  }

  app.post('/mcp', async (request, reply) => {
    // DNS-rebinding defence (spec §6): a browser page on another origin must not be
    // able to drive this door. An ABSENT Origin is a server-to-server connector,
    // which is how Claude and ChatGPT call — so it is admitted. Checked before auth.
    const origin = request.headers.origin;
    if (origin !== undefined && !deps.allowedOrigins.includes(origin)) {
      return reply.code(403).send({ error: 'forbidden_origin' });
    }

    const header = request.headers.authorization;
    const raw = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : null;
    // Hosted tokens ONLY (14.261): a leaked local token must not be pasteable into a
    // remote client. The kind is read before the resolution stamps `last_used`.
    const kind =
      raw === null
        ? null
        : ((await deps.pool.query<{ kind: string }>(`SELECT kind FROM mcp_tokens WHERE token_hash = $1`, [hashCredential(raw)]))
            .rows[0]?.kind ?? null);
    const userId = raw !== null && kind === 'hosted' ? await resolveMcpToken(deps.pool, raw, now()) : null;
    if (raw === null || userId === null) {
      // One answer for every refusal — missing, forged, expired, wrong kind — so the
      // response is no oracle for which of them it was.
      return reply.code(401).header('www-authenticate', challenge).send({ error: 'invalid_token' });
    }

    const xff = request.headers['x-forwarded-for'];
    const server = new McpServer({ name: 'gisik-nokma', version: '0.1.0' });
    registerTools(server, hostedSession(app, { ip: request.ip, xff: typeof xff === 'string' ? xff : undefined }, raw, userId), {
      onCall: (event) => request.log.info({ ...event, userId }, 'mcp tool call'),
    });
    const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    try {
      await server.connect(transport);
      const webRequest = new Request(`${publicUrl}/mcp`, {
        method: 'POST',
        headers: Object.entries(request.headers).flatMap(([k, v]) => (typeof v === 'string' ? [[k, v] as [string, string]] : [])),
        body: JSON.stringify(request.body),
      });
      const response = await transport.handleRequest(webRequest, { parsedBody: request.body });
      reply.code(response.status);
      response.headers.forEach((value, key) => {
        reply.header(key, value);
      });
      const text = await response.text();
      return reply.send(text === '' ? undefined : text);
    } finally {
      await transport.close();
      await server.close();
    }
  });
}
