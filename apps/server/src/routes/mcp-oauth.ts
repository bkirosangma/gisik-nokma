import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import type { Pool, PoolClient } from 'pg';
import type { Queryable } from '../db/queryable.js';
import {
  connectionForToken,
  createConnection,
  issueTokens,
  registerClient,
  revokeConnection,
  sweepStaleClients,
  takeCode,
  useRefreshToken,
} from '../mcp/oauth-store.js';
import { verifyPkceS256 } from '../mcp/pkce.js';

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
  // The token and revoke endpoints take `application/x-www-form-urlencoded` — what
  // OAuth clients send (RFC 6749 §4.1.3) — so the parser lives in a scope of its
  // own and does not change how any other route in the app reads a body.
  app.register(async (scope) => {
    scope.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string' }, (_request, body, done) => {
      done(null, Object.fromEntries(new URLSearchParams(body as string)));
    });

    const tokenBody = (t: { accessToken: string; refreshToken: string; expiresIn: 3600 }) => ({
      access_token: t.accessToken,
      token_type: 'Bearer',
      expires_in: t.expiresIn,
      refresh_token: t.refreshToken,
      scope: OAUTH_SCOPE,
    });

    scope.post('/oauth/token', async (request, reply) => {
      reply.header('cache-control', 'no-store');
      const b = (request.body ?? {}) as Record<string, string | undefined>;
      const bad = (error: string) => reply.code(400).send({ error });
      const at = now();
      if (b.grant_type === 'authorization_code') {
        if (!b.code || !b.code_verifier || !b.client_id || !b.redirect_uri) return bad('invalid_request');
        // Burnt whatever happens next (14.241): a wrong verifier does not leave the
        // code standing for a second guess.
        const row = await takeCode(deps.pool, b.code, at);
        if (
          row === null ||
          row.clientId !== b.client_id ||
          row.redirectUri !== b.redirect_uri ||
          !verifyPkceS256(b.code_verifier, row.codeChallenge)
        ) {
          return bad('invalid_grant');
        }
        const { connectionId } = await createConnection(deps.pool, { userId: row.userId, clientId: row.clientId }, at);
        return tokenBody(await issueTokens(deps.pool, connectionId, row.userId, at));
      }
      if (b.grant_type === 'refresh_token') {
        if (!b.refresh_token) return bad('invalid_request');
        // One transaction for "use the old token, mint the new pair". A racing
        // second refresh with the same token blocks on the first's row lock, sees
        // it used, and revokes the family AFTER the winner committed — so exactly
        // one caller sees 200 and the connection is gone afterwards (14.246), rather
        // than the loser's delete landing between the winner's steps.
        // `AppDeps.pool` is a `Pool` in production; a `PoolClient` has `release` and
        // is never handed to this route, but the type admits it.
        if ('release' in deps.pool) throw new Error('the OAuth token route needs a Pool, not a checked-out client');
        const client: PoolClient = await (deps.pool as Pool).connect();
        let issued: ReturnType<typeof tokenBody> | null = null;
        try {
          await client.query('BEGIN');
          const used = await useRefreshToken(client, b.refresh_token, at);
          if (used.status === 'ok') issued = tokenBody(await issueTokens(client, used.connectionId, used.userId, at));
          await client.query('COMMIT');
        } catch (err) {
          await client.query('ROLLBACK').catch(() => undefined);
          throw err;
        } finally {
          client.release();
        }
        return issued ?? bad('invalid_grant');
      }
      return bad('unsupported_grant_type');
    });

    // RFC 7009: the answer is 200 whether or not the token was known, so this is
    // not an oracle for which tokens exist. An access OR a refresh token names its
    // connection; deleting the connection kills both kinds at once.
    scope.post('/oauth/revoke', async (request, reply) => {
      const token = ((request.body ?? {}) as Record<string, string | undefined>).token;
      if (token) {
        const connectionId = await connectionForToken(deps.pool, token);
        if (connectionId !== null) await revokeConnection(deps.pool, connectionId, null);
      }
      return reply.code(200).send({});
    });
  });
}
