import { describe, expect, it } from 'vitest';
import { ConfigError } from '../../src/config.js';
import { optionalDatabaseCaCert } from '../../src/ops/backup-env.js';

const PEM = '-----BEGIN CERTIFICATE-----\nMIIBfake\n-----END CERTIFICATE-----\n';

describe('13.1421 the backup worker reads DATABASE_CA_CERT the way the API server does', () => {
  it('13.1421 unset and blank are null; a PEM comes back verbatim; a non-PEM is refused naming the variable', () => {
    // App Platform resolves an unbound variable to '' — that is "no CA", not a
    // certificate, exactly as `requireDatabaseUrl` treats '' as "no URL".
    expect(optionalDatabaseCaCert({})).toBeNull();
    expect(optionalDatabaseCaCert({ DATABASE_CA_CERT: '' })).toBeNull();
    expect(optionalDatabaseCaCert({ DATABASE_CA_CERT: '   ' })).toBeNull();
    // Verbatim: `createPool` hands the string to Node TLS as `ssl.ca`; any
    // trimming or re-wrapping here would be a second PEM parser.
    expect(optionalDatabaseCaCert({ DATABASE_CA_CERT: PEM })).toBe(PEM);
    // The same refusal shape `loadConfig` uses (`pemCertificate` in config.ts),
    // so an operator meets one vocabulary across both entry points.
    expect(() => optionalDatabaseCaCert({ DATABASE_CA_CERT: 'not a certificate' })).toThrow(ConfigError);
    expect(() => optionalDatabaseCaCert({ DATABASE_CA_CERT: 'not a certificate' })).toThrow(
      /DATABASE_CA_CERT/,
    );
  });
});
