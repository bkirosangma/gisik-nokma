import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import type { Queryable } from '../db/queryable.js';
import { registerClient, sweepStaleClients } from '../mcp/oauth-store.js';

/** The one scope: "act as me". Present in metadata because clients expect a scope. */
export const OAUTH_SCOPE = 'gisik:act';

const CLIENT_NAME_MAX = 60;

/**
 * A redirect URI a client may register: `https://…`, or a loopback `http://` for
 * a desktop client (`127.0.0.1` / `localhost`, any port). No fragment (RFC 6749
 * §3.1.2) and no userinfo (`https://u:p@host` is how a phishing host is dressed).
 * A query string is fine — ChatGPT's callback carries one.
 */
export function isAllowedRedirect(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.hash !== '' || u.username !== '' || u.password !== '') return false;
  if (raw.includes('#')) return false;
  if (u.protocol === 'https:') return true;
  return u.protocol === 'http:' && (u.hostname === '127.0.0.1' || u.hostname === 'localhost');
}

/**
 * The hosted MCP door's OAuth 2.1 authorization server (remote-MCP plan, spec
 * `2026-09-30-remote-mcp-server-design.md` §5). Registered ONLY when
 * `MCP_PUBLIC_URL` is set (`app.ts`). This task: the two metadata documents and
 * RFC 7591 public-client registration; authorize / decision / token / revoke are
 * added to this same function by later tasks.
 */
export function registerMcpOAuthRoutes(
  app: FastifyInstance,
  deps: { pool: Queryable; webOrigin: string; publicUrl: string; now?: () => Date },
  _requireSession: preHandlerHookHandler,
): void {
  const now = deps.now ?? (() => new Date());
  const issuer = deps.publicUrl.replace(/\/$/, '');
  const asMetadata = {
    issuer,
    authorization_endpoint: `${issuer}/oauth/authorize`,
    token_endpoint: `${issuer}/oauth/token`,
    registration_endpoint: `${issuer}/oauth/register`,
    revocation_endpoint: `${issuer}/oauth/revoke`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
    scopes_supported: [OAUTH_SCOPE],
  };
  const prMetadata = {
    resource: `${issuer}/mcp`,
    authorization_servers: [issuer],
    scopes_supported: [OAUTH_SCOPE],
    bearer_methods_supported: ['header'],
  };
  app.get('/.well-known/oauth-authorization-server', async () => asMetadata);
  // RFC 9728 §3.1 appends the resource's own path, so a client that resolves
  // `<origin>/mcp` looks at the suffixed one; the root is served too.
  app.get('/.well-known/oauth-protected-resource', async () => prMetadata);
  app.get('/.well-known/oauth-protected-resource/mcp', async () => prMetadata);

  app.post('/oauth/register', async (request, reply) => {
    const body = (request.body ?? {}) as { client_name?: unknown; redirect_uris?: unknown };
    const given = Array.isArray(body.redirect_uris) ? (body.redirect_uris as unknown[]) : [];
    const uris = given.filter((u): u is string => typeof u === 'string');
    if (uris.length === 0 || uris.length !== given.length || !uris.every(isAllowedRedirect)) {
      return reply.code(400).send({ error: 'invalid_redirect_uri' });
    }
    // The name is self-reported, so it is a label and never an identity: the
    // consent page always shows the redirect host beside it.
    const name =
      typeof body.client_name === 'string' && body.client_name.trim() !== ''
        ? body.client_name.trim().slice(0, CLIENT_NAME_MAX)
        : new URL(uris[0]!).host;
    const at = now();
    await sweepStaleClients(deps.pool, at);
    const { clientId } = await registerClient(deps.pool, { clientName: name, redirectUris: uris }, at);
    return reply.code(201).send({
      client_id: clientId,
      client_name: name,
      redirect_uris: uris,
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
    });
  });
}
