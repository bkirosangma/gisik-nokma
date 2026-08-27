import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from '../src/config.js';

const VALID_ENV = {
  DATABASE_URL: 'postgres://gisik:gisik@localhost:54329/gisik_nokma',
};

describe('loadConfig', () => {
  it('reads DATABASE_URL and applies defaults for the rest', () => {
    const config = loadConfig(VALID_ENV);
    expect(config).toEqual({
      databaseUrl: 'postgres://gisik:gisik@localhost:54329/gisik_nokma',
      port: 3000,
      host: '127.0.0.1',
      logLevel: 'info',
    });
  });

  it('honours explicit PORT, HOST, LOG_LEVEL', () => {
    const config = loadConfig({ ...VALID_ENV, PORT: '8080', HOST: '0.0.0.0', LOG_LEVEL: 'debug' });
    expect(config.port).toBe(8080);
    expect(config.host).toBe('0.0.0.0');
    expect(config.logLevel).toBe('debug');
  });

  it('planted defect: a missing DATABASE_URL is refused with the variable named', () => {
    expect(() => loadConfig({})).toThrowError(ConfigError);
    expect(() => loadConfig({})).toThrowError(/DATABASE_URL/);
  });

  it('planted defect: a non-numeric PORT is refused with the variable named', () => {
    expect(() => loadConfig({ ...VALID_ENV, PORT: 'not-a-port' })).toThrowError(ConfigError);
    expect(() => loadConfig({ ...VALID_ENV, PORT: 'not-a-port' })).toThrowError(/PORT/);
  });
});
