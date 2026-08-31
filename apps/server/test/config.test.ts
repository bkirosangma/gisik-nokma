import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from '../src/config.js';

const VALID_ENV = {
  DATABASE_URL: 'postgres://gisik:gisik@localhost:54329/gisik_nokma',
  BETTER_AUTH_URL: 'http://localhost:3000',
  // 34 characters, over better-auth's own 32-character floor, and obviously not
  // a key anything real is signed with.
  BETTER_AUTH_SECRET: 'test-secret-not-used-anywhere-real',
};

describe('loadConfig', () => {
  it('reads the required variables and applies defaults for the rest', () => {
    const config = loadConfig(VALID_ENV);
    expect(config).toEqual({
      databaseUrl: 'postgres://gisik:gisik@localhost:54329/gisik_nokma',
      port: 3000,
      host: '127.0.0.1',
      logLevel: 'info',
      betterAuthUrl: 'http://localhost:3000',
      betterAuthSecret: 'test-secret-not-used-anywhere-real',
    });
  });

  it('honours explicit PORT, HOST, LOG_LEVEL', () => {
    const config = loadConfig({ ...VALID_ENV, PORT: '8080', HOST: '0.0.0.0', LOG_LEVEL: 'debug' });
    expect(config.port).toBe(8080);
    expect(config.host).toBe('0.0.0.0');
    expect(config.logLevel).toBe('debug');
  });

  it('planted defect: a missing DATABASE_URL is refused with the variable named', () => {
    // Only DATABASE_URL removed, not an empty environment: `toThrowError(string)`
    // matches on substring, so `loadConfig({})` — which now names three missing
    // variables — would satisfy this assertion while proving less than it says.
    const { DATABASE_URL: _omitted, ...withoutDatabaseUrl } = VALID_ENV;
    expect(() => loadConfig(withoutDatabaseUrl)).toThrowError(ConfigError);
    expect(() => loadConfig(withoutDatabaseUrl)).toThrowError(
      'invalid server configuration — check: DATABASE_URL',
    );
  });

  it('planted defect: a missing BETTER_AUTH_URL is refused with the variable named', () => {
    const { BETTER_AUTH_URL: _omitted, ...withoutUrl } = VALID_ENV;
    expect(() => loadConfig(withoutUrl)).toThrowError(ConfigError);
    expect(() => loadConfig(withoutUrl)).toThrowError(
      'invalid server configuration — check: BETTER_AUTH_URL',
    );
  });

  /**
   * The one that matters most: the plan's own sketch defaulted this to
   * `'dev-only-secret-change-me'` in the production entrypoint, which would let a
   * deployment boot signing every session with a key printed in this repository.
   * Absent must stop the server.
   */
  it('planted defect: a missing BETTER_AUTH_SECRET is refused with the variable named', () => {
    const { BETTER_AUTH_SECRET: _omitted, ...withoutSecret } = VALID_ENV;
    expect(() => loadConfig(withoutSecret)).toThrowError(ConfigError);
    expect(() => loadConfig(withoutSecret)).toThrowError(
      'invalid server configuration — check: BETTER_AUTH_SECRET',
    );
  });

  /**
   * 31 characters — one short of better-auth's own threshold, below which the
   * library warns and starts anyway. Here it is refused instead, because a
   * warning in a log nobody reads is not a control.
   */
  it('planted defect: a BETTER_AUTH_SECRET under 32 characters is refused with the variable named', () => {
    const short = { ...VALID_ENV, BETTER_AUTH_SECRET: 'x'.repeat(31) };
    expect(() => loadConfig(short)).toThrowError(ConfigError);
    expect(() => loadConfig(short)).toThrowError(
      'invalid server configuration — check: BETTER_AUTH_SECRET',
    );
  });

  it('planted defect: a non-numeric PORT is refused with the variable named', () => {
    expect(() => loadConfig({ ...VALID_ENV, PORT: 'not-a-port' })).toThrowError(ConfigError);
    expect(() => loadConfig({ ...VALID_ENV, PORT: 'not-a-port' })).toThrowError(
      'invalid server configuration — check: PORT',
    );
  });

  it('planted defect: an empty HOST is refused with the variable named', () => {
    expect(() => loadConfig({ ...VALID_ENV, HOST: '' })).toThrowError(ConfigError);
    expect(() => loadConfig({ ...VALID_ENV, HOST: '' })).toThrowError(
      'invalid server configuration — check: HOST',
    );
  });

  it('planted defect: a LOG_LEVEL outside the enum is refused with the variable named', () => {
    expect(() => loadConfig({ ...VALID_ENV, LOG_LEVEL: 'verbose' })).toThrowError(ConfigError);
    expect(() => loadConfig({ ...VALID_ENV, LOG_LEVEL: 'verbose' })).toThrowError(
      'invalid server configuration — check: LOG_LEVEL',
    );
  });

  /**
   * `.env.example` tells an operator to copy it and adjust. This proves that
   * doing exactly that produces a server that starts.
   *
   * The gap it closes is specific and was real: `pnpm check:env` verifies every
   * variable code READS is documented, which is a presence check — it has no
   * opinion about the values. So `BETTER_AUTH_SECRET=change-me` sat in the file
   * as a documented, gate-approved, boot-failing value, nine characters against
   * a 32-character floor, and the operator following the instruction met
   * `ConfigError` with nothing saying length was the reason. Presence and
   * validity are different properties and now each has its own check.
   */
  it('the values documented in .env.example actually satisfy the schema', () => {
    const path = fileURLToPath(new URL('../../../.env.example', import.meta.url));
    const documented = parseEnvExample(readFileSync(path, 'utf8'));

    // Guard against the check going quiet: if the parser stops finding the live
    // variables, this test would pass on an empty object and prove nothing.
    for (const key of ['DATABASE_URL', 'PORT', 'HOST', 'LOG_LEVEL', 'BETTER_AUTH_URL', 'BETTER_AUTH_SECRET']) {
      expect(documented, `.env.example should document ${key}`).toHaveProperty(key);
    }

    expect(() => loadConfig(documented)).not.toThrow();
    expect(loadConfig(documented).betterAuthSecret.length).toBeGreaterThanOrEqual(32);
  });
});

/**
 * A deliberately small `.env.example` reader: `KEY=value`, `#` comments, and a
 * trailing `# …` note stripped off a value. It is not a dotenv implementation —
 * no quoting, no escapes, no multi-line values — because `.env.example` uses
 * none of those, and a parser that handled more would be untested surface.
 */
function parseEnvExample(text: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).split('#')[0]?.trim() ?? '';
    if (value !== '') env[key] = value;
  }
  return env;
}
