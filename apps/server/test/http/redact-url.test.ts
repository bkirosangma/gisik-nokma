import { Writable } from 'node:stream';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { redactRequestUrl } from '../../src/http/redact-url.js';
import { buildTestApp } from '../helpers/app.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';

/**
 * **A sign-in credential never reaches the request log or an alert.**
 *
 * Seen in the production log on 2026-09-29: `GET /api/auth/magic-link/verify?token=…`
 * was written verbatim, while invite tokens were already `[redacted]` — the
 * serializer only knew the `/v1/invites/<token>` PATH segment. `TESTMARKER-not-a-token`
 * stands in for every credential here; no real-looking token is used anywhere.
 */
const MARKER = 'TESTMARKER-not-a-token';

describe('redactRequestUrl — the pure function (case 6.220)', () => {
  it('6.220 replaces the VALUE of every credential-carrying query parameter and keeps the rest', () => {
    // The magic-link verify URL from the production log.
    expect(redactRequestUrl(`/api/auth/magic-link/verify?token=${MARKER}`)).toBe(
      '/api/auth/magic-link/verify?token=[redacted]',
    );
    // An OAuth callback: code AND state.
    expect(redactRequestUrl(`/api/auth/callback/google?code=${MARKER}&state=${MARKER}-2&scope=email`)).toBe(
      '/api/auth/callback/google?code=[redacted]&state=[redacted]&scope=email',
    );
    // The other names in the ruling, each on its own.
    for (const key of ['token', 'code', 'state', 'access_token', 'refresh_token', 'id_token']) {
      expect(redactRequestUrl(`/x?a=1&${key}=${MARKER}&b=2`)).toBe(`/x?a=1&${key}=[redacted]&b=2`);
    }
    // A later parameter and a fragment survive.
    expect(redactRequestUrl(`/api/auth/magic-link/verify?token=${MARKER}&callbackURL=%2Fw%2F1#top`)).toBe(
      '/api/auth/magic-link/verify?token=[redacted]&callbackURL=%2Fw%2F1#top',
    );
    // The invite PATH redaction is kept, and composes with a query.
    expect(redactRequestUrl(`/v1/invites/${MARKER}?token=${MARKER}`)).toBe('/v1/invites/[redacted]?token=[redacted]');
  });

  it('6.220 leaves an ordinary URL verbatim and does not mangle look-alikes', () => {
    // Control: a serializer that blanked every query would pass the test above.
    expect(redactRequestUrl('/v1/workspaces/W/invites')).toBe('/v1/workspaces/W/invites');
    expect(redactRequestUrl('/v1/events?since=12&limit=5')).toBe('/v1/events?since=12&limit=5');
    // `token` inside a path segment, and as a substring of another key or value, is not a parameter named token.
    expect(redactRequestUrl('/v1/token/abc')).toBe('/v1/token/abc');
    expect(redactRequestUrl('/x?mytoken=1&tokens=2&x_token=3')).toBe('/x?mytoken=1&tokens=2&x_token=3');
    expect(redactRequestUrl('/x?note=token=1&q=code')).toBe('/x?note=token=1&q=code');
    // A percent-encoded key is still the key.
    expect(redactRequestUrl(`/x?%74oken=${MARKER}`)).toBe('/x?%74oken=[redacted]');
    // A repeated parameter is redacted every time; a valueless key is left alone.
    expect(redactRequestUrl(`/x?token=${MARKER}&token=${MARKER}&code`)).toBe('/x?token=[redacted]&token=[redacted]&code');
  });
});

describe('the credential is not in an emitted log line (case 6.221)', () => {
  let db: TestDatabase;

  beforeAll(async () => {
    db = await createTestDatabase();
  });
  afterAll(async () => {
    await db.drop();
  });

  it('6.221 a real logger writing a real line records the verify route and not the token', async () => {
    const lines: string[] = [];
    const stream = new Writable({
      write(chunk, _encoding, callback) {
        lines.push(String(chunk));
        callback();
      },
    });
    const logged = buildTestApp(db, { logStream: stream });
    await logged.app.ready();
    try {
      await logged.app.inject({
        method: 'GET',
        url: `/api/auth/magic-link/verify?token=${MARKER}&callbackURL=%2Fw%2F1`,
      });
      const written = lines.join('');
      // The instrument works: this request was logged, with its route and its non-secret parameter.
      expect(written).toContain('incoming request');
      expect(written).toContain('/api/auth/magic-link/verify?token=[redacted]');
      expect(written).toContain('callbackURL=%2Fw%2F1');
      // The whole point — in the request line AND in the completed line.
      expect(written).not.toContain(MARKER);
    } finally {
      await logged.app.close();
    }
  });
});
