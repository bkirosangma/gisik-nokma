import { createHash, randomBytes } from 'node:crypto';
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
