import { redactInviteToken } from '../routes/invites.js';

/**
 * Query parameters whose VALUE is a credential: a magic-link verify token, an
 * OAuth authorization code and its `state`, and the three OAuth token kinds.
 * Matched on the decoded key, case-insensitively, and on the WHOLE key —
 * `mytoken` and `tokens` are not `token`.
 */
const CREDENTIAL_PARAMS: ReadonlySet<string> = new Set([
  'token',
  'code',
  'state',
  'access_token',
  'refresh_token',
  'id_token',
]);

function isCredentialKey(rawKey: string): boolean {
  let key = rawKey;
  try {
    key = decodeURIComponent(rawKey);
  } catch {
    // A malformed escape is compared as written: it cannot decode to a credential name by luck.
  }
  return CREDENTIAL_PARAMS.has(key.toLowerCase());
}

/**
 * The URL as it may be written to a log line or posted to an alert channel.
 *
 * `redactInviteToken` covers the invite token, which lives in the PATH
 * (`GET /v1/invites/:token`). This adds the QUERY half: a sign-in link is
 * `GET /api/auth/magic-link/verify?token=…`, and Fastify's default request line
 * carries `req.url` verbatim — the production log held one in plain text on
 * 2026-09-29. Only the value is replaced; the key, the route and every other
 * parameter survive, so the operator still sees which call was made.
 *
 * Every place the server logs or alerts with `request.url` goes through this
 * (`app.ts`: the `req` serializer and the 5xx alert context).
 */
export function redactRequestUrl(url: string): string {
  const pathRedacted = redactInviteToken(url);
  const queryStart = pathRedacted.indexOf('?');
  if (queryStart === -1) return pathRedacted;
  const fragmentStart = pathRedacted.indexOf('#', queryStart);
  const queryEnd = fragmentStart === -1 ? pathRedacted.length : fragmentStart;
  const query = pathRedacted
    .slice(queryStart + 1, queryEnd)
    .split('&')
    .map((pair) => {
      const equals = pair.indexOf('=');
      if (equals === -1) return pair;
      return isCredentialKey(pair.slice(0, equals)) ? `${pair.slice(0, equals)}=[redacted]` : pair;
    })
    .join('&');
  return `${pathRedacted.slice(0, queryStart + 1)}${query}${pathRedacted.slice(queryEnd)}`;
}
