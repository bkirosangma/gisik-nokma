import pg from 'pg';
import type { Pool } from 'pg';
import { IST_TIME_ZONE } from '@gisik-nokma/domain';

// Postgres int8 (OID 20) arrives as a string by default. Sequence numbers stay
// far below Number.MAX_SAFE_INTEGER (2^53), so parse to number once, globally.
// Every pool in app and tests must come through createPool so this holds.
pg.types.setTypeParser(20, (value) => Number.parseInt(value, 10));

/**
 * Every query parameter that makes `pg` build an `ssl` config out of the
 * connection string — read off pg-connection-string 2.14.0's own source
 * (node_modules/.pnpm/pg-connection-string@2.14.0/…/index.js:69-84), not
 * guessed: `ssl` and `sslnegotiation` set it to a boolean, the other four set
 * it to an object. Any ONE of the six is enough.
 */
const SSL_URL_PARAMETERS = ['ssl', 'sslmode', 'sslnegotiation', 'sslcert', 'sslkey', 'sslrootcert'];

/**
 * Does the connection string actually carry one of the six? Checked against the
 * raw text BEFORE any URL parsing, because not every string `pg` accepts is one
 * `new URL()` accepts: a bare socket path like `/var/run/postgresql` is a valid
 * connection string (pg reads it as the host) and `new URL()` throws
 * `TypeError: Invalid URL` on it. Anchoring on `?`/`&` rather than a bare
 * substring keeps a path such as `/var/run/pgssl` from being dragged into the
 * parser it would fail.
 */
const SSL_PARAMETER_PRESENT = new RegExp(`[?&](?:${SSL_URL_PARAMETERS.join('|')})=`);

/**
 * Drop the six ssl query parameters from a connection string, leaving every
 * other byte of identity — user, password, host, port, database, and the
 * surviving query parameters — as it was.
 *
 * `URLSearchParams` re-serializes what survives, turning `%20` into `+`. That
 * is safe rather than merely tolerable, and it is asserted in the tests: the
 * same parser that reads the query string decodes `+` back to a space and
 * keeps a literal plus as `%2B`, so the DECODED value pg ends up with is
 * unchanged. The assertion is on the decoded value for exactly that reason —
 * comparing URL text would fail on a difference that does not exist.
 *
 * A string that carries one of the six and CANNOT be parsed raises rather than
 * passing through. Passing it through would be the quiet option and the wrong
 * one: it would hand the URL's own ssl config back to the driver and discard
 * the CA — the exact defect this function exists to close, restored under a
 * different name. The error says which variable and which URL, so it is a
 * boot-time sentence rather than an opaque `TypeError` from a stack frame in
 * this file.
 */
function withoutSslParameters(databaseUrl: string): string {
  if (!SSL_PARAMETER_PRESENT.test(databaseUrl)) return databaseUrl;

  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    throw new Error(
      'DATABASE_URL carries an ssl query parameter but is not a parseable URL, so the ' +
        'DATABASE_CA_CERT certificate cannot be applied to it. Either give DATABASE_URL in ' +
        'URL form (postgres://user:password@host:port/database) or clear DATABASE_CA_CERT.',
    );
  }

  let stripped = false;
  for (const name of SSL_URL_PARAMETERS) {
    if (url.searchParams.has(name)) {
      url.searchParams.delete(name);
      stripped = true;
    }
  }
  return stripped ? url.toString() : databaseUrl;
}

/**
 * Every connection runs with session timezone Asia/Kolkata (owner decision:
 * time is Asia/Kolkata), so a timestamptz rendered by an ad-hoc query reads the
 * same clock the product shows — one time story, not two. This does not change
 * any stored instant: timestamptz is absolute, and the session zone only
 * decides which offset Postgres prints it in.
 *
 * `options` is sent as the Postgres startup parameter, so the zone is set
 * before the first query rather than by a query that could race with one.
 *
 * ## `tls`, the second parameter (Plan 11 Task 1)
 *
 * Managed Postgres presents a CA the system trust store does not carry, so the
 * certificate has to come from configuration (`DATABASE_CA_CERT`). It is a
 * SECOND parameter rather than a widening of the first because the first is a
 * connection string; and it is named `tls`, not `options`, because `options`
 * is already taken here by a Postgres startup parameter that means something
 * entirely different — two `options` in one function would invite exactly the
 * edit that replaces the timezone with an `ssl` block.
 *
 * ## Which `ssl` wins — MEASURED, and the reverse of what this docblock used to say
 *
 * `pg` builds its connection parameters with
 *
 *     config = Object.assign({}, config, parse(config.connectionString))
 *
 * (pg 8.23.0, lib/connection-parameters.js:60). The connection string is
 * applied ON TOP of the caller's object, so the precedence runs URL-over-
 * caller, not caller-over-URL:
 *
 *   - If the URL carries ANY of the six `SSL_URL_PARAMETERS` above, `parse()`
 *     produces an `ssl` key and it REPLACES the caller's wholesale. Passing
 *     `ssl: { ca }` alongside `?sslmode=require` — the exact shape of a managed
 *     Postgres URL, DigitalOcean's included — silently yields `ssl: {}` and the
 *     CA never reaches the driver. Measured, not reasoned: with the CA passed,
 *     `new pg.Client(pool.options).connectionParameters.ssl` was `{}`.
 *   - If the URL carries none of the six, `parse()` leaves `ssl` absent and the
 *     caller's object survives untouched.
 *   - If NEITHER supplies one, `this.ssl = readSSLConfigFromEnvironment()`
 *     (same file, :85) — the process environment's `PGSSLMODE`/`PGSSLROOTCERT`
 *     decide, and with those unset the result is `false`. So leaving `ssl`
 *     unset does not mean "the connection string decides"; it means "the
 *     environment decides, defaulting to no TLS". A local run is unchanged
 *     either way, which is why the no-CA path below is left exactly as it was.
 *
 * So when a CA IS configured, the six parameters are stripped from the URL
 * before the pool is built. That is the only way the caller's `ssl` survives
 * without reimplementing pg's own sslmode-to-object mapping here — and
 * pg-connection-string, which owns that mapping, is not a dependency of this
 * package and does not resolve from it under pnpm's isolated node_modules.
 *
 * What that trades away, stated rather than buried: a `?sslmode=no-verify` or
 * `?sslmode=disable` sitting beside a non-empty `DATABASE_CA_CERT` loses to the
 * CA, and the connection becomes verified TLS. That configuration is self-
 * contradictory — it supplies a trust anchor and then asks for no trust — and
 * it is resolved in the direction that cannot downgrade a deployment. The
 * reverse choice (URL wins) is what this function did before, and its failure
 * mode was the one this whole parameter exists to prevent: an opaque TLS error
 * on the first query, against a CA that was configured and discarded.
 *
 * With NO CA the connection string is passed through byte-identical and `ssl`
 * is left unset, so every other call site — tests, dev tooling, local runs —
 * behaves exactly as it did before this parameter existed.
 */
export function createPool(databaseUrl: string, tls: { caCert?: string | null } = {}): Pool {
  const caCert = tls.caCert ?? null;
  if (caCert === null) {
    return new pg.Pool({
      connectionString: databaseUrl,
      max: 10,
      options: `-c timezone=${IST_TIME_ZONE}`,
    });
  }
  return new pg.Pool({
    connectionString: withoutSslParameters(databaseUrl),
    max: 10,
    options: `-c timezone=${IST_TIME_ZONE}`,
    ssl: { ca: caCert },
  });
}
