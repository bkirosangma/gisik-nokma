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
});
