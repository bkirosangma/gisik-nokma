import { createHash, randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { mintCode } from '../../src/mcp/oauth-store.js';
import type { TestDatabase } from './db.js';
import { buildTestApp, type BuildTestAppOverrides } from './app.js';

/** The hosted door's issuer in tests — what `MCP_PUBLIC_URL` would be in production. */
export const PUBLIC_URL = 'https://api.test';

/** A test app with the hosted MCP door switched ON. */
export function buildOAuthApp(db: TestDatabase, overrides: BuildTestAppOverrides = {}) {
  return buildTestApp(db, { ...overrides, mcpPublicUrl: PUBLIC_URL });
}

/** A PKCE S256 pair: the verifier a client keeps, the challenge it sends. */
export function pkcePair() {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

/** A registered redirect the hosted tests' clients use (ChatGPT's callback shape). */
export const CALLBACK = 'https://chatgpt.com/connector_platform_oauth_redirect';

export type Consent = { clientId: string; verifier: string; code: string };

/**
 * A consent, as far as the token endpoint can tell: a registered client and a
 * minted code bound to (client, redirect, challenge). The code is minted through
 * the store rather than through /oauth/authorize + the decision route so a test
 * of what comes AFTER consent does not depend on the consent screen; that half
 * has its own tests.
 */
export async function consent(
  app: FastifyInstance,
  pool: Pool,
  userId: string,
  opts: { clientId?: string; redirectUris?: string[] } = {},
): Promise<Consent> {
  const clientId =
    opts.clientId ??
    ((
      await app.inject({
        method: 'POST',
        url: '/oauth/register',
        payload: { client_name: 'ChatGPT', redirect_uris: opts.redirectUris ?? [CALLBACK] },
      })
    ).json().client_id as string);
  const { verifier, challenge } = pkcePair();
  const code = await mintCode(pool, { clientId, userId, redirectUri: CALLBACK, codeChallenge: challenge }, new Date());
  return { clientId, verifier, code };
}

/** A HOSTED access token for `userId`: consent, then the real code exchange. */
export async function hostedToken(app: FastifyInstance, pool: Pool, userId: string): Promise<string> {
  const c = await consent(app, pool, userId);
  const res = await app.inject({
    method: 'POST',
    url: '/oauth/token',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    payload: new URLSearchParams({
      grant_type: 'authorization_code',
      code: c.code,
      code_verifier: c.verifier,
      client_id: c.clientId,
      redirect_uri: CALLBACK,
    }).toString(),
  });
  if (res.statusCode !== 200) throw new Error(`token exchange answered ${res.statusCode}: ${res.body}`);
  return res.json().access_token as string;
}
