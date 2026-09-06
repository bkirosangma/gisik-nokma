import { getMigrations } from 'better-auth/db/migration';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createAuth } from '../../src/auth/auth.js';
import { LogMagicLinkSender } from '../../src/auth/magic-link-sender.js';
import { LogOtpSender } from '../../src/auth/otp-sender.js';
import { buildProjectionRegistry } from '../../src/projections/index.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';

/** Long enough that better-auth does not warn, and obviously not a credential. */
const TEST_SECRET = 'test-secret-not-used-anywhere-real';

const VENDOR_TABLES = ['user', 'session', 'account', 'verification', 'passkey'] as const;

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase();
});

afterAll(async () => {
  await db.drop();
});

function authForTestDb(): ReturnType<typeof createAuth> {
  return createAuth({
    pool: db.pool,
    otpSender: new LogOtpSender(() => {}),
    magicLinkSender: new LogMagicLinkSender(() => {}),
    baseUrl: 'http://localhost:3000',
    secret: TEST_SECRET,
    // The browser's origin, so better-auth trusts the product's own client.
    webOrigin: 'http://localhost:3001',
  });
}

describe('better-auth vendor schema', () => {
  it('the migration creates all five identity tables', async () => {
    const result = await db.pool.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`,
    );
    const names = result.rows.map((row) => row.table_name);
    for (const table of VENDOR_TABLES) expect(names).toContain(table);
  });

  it('columns keep the library camelCase spelling — the one exception to the snake_case standard', async () => {
    const result = await db.pool.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'user'`,
    );
    const columns = result.rows.map((row) => row.column_name);
    expect(columns).toContain('emailVerified');
    expect(columns).toContain('phoneNumberVerified');
    expect(columns).not.toContain('email_verified');
  });

  /**
   * The check that makes the vendor schema honest, and the one that survives a
   * better-auth upgrade. `getMigrations` reads the live database through the
   * library's own adapter and reports what it would still have to do.
   *
   * It reports in TWO channels, and asserting on only one of them is how a
   * drift check comes to look green while the schema is wrong:
   *
   *  - **Presence** — a missing table, column or index lands in `toBeCreated`,
   *    `toBeAdded` or `toBeAddedIndexes`. This is how the omission a
   *    version-skewed generator produces (@better-auth/cli 1.4.21 emits no
   *    `account."issuer"` and no `account_issuer_accountId_uidx`) would have
   *    surfaced here rather than on the first Google sign-in.
   *  - **Shape** — a column that EXISTS but has the wrong type, or is nullable
   *    where the schema declares the field required, reaches neither of those
   *    arrays. It is only ever a `logger.warn`
   *    (`better-auth/dist/db/get-migration.mjs`, the `column.isNullable` and
   *    `matchType` branches). Asserting on the arrays alone therefore passes
   *    happily on `"emailVerified" boolean NULL` or `"counter" text NOT NULL`.
   *
   * So the planner is handed a capturing logger and the warnings are asserted
   * empty too. Both channels, or the name of this test would be a lie.
   */
  it('the installed better-auth finds nothing left to create and warns about nothing — no drift in presence or in shape', async () => {
    const warnings: string[] = [];
    const plan = await getMigrations(
      {
        ...authForTestDb().options,
        logger: {
          disabled: false,
          level: 'debug',
          log: (level, message) => {
            if (level === 'warn' || level === 'error') warnings.push(`${level}: ${message}`);
          },
        },
      },
      { throwOnUnsafe: false },
    );
    expect(plan.toBeCreated.map((entry) => entry.table)).toEqual([]);
    expect(
      plan.toBeAdded.map((entry) => `${entry.table}.${Object.keys(entry.fields).join('+')}`),
    ).toEqual([]);
    expect(plan.toBeAddedIndexes.map((entry) => entry.name)).toEqual([]);
    expect(warnings).toEqual([]);
  });

  /**
   * The identity boundary, guarded where it is drawn: auth state is server-owned
   * infrastructure, not workspace history. A projection declaring one of these
   * tables would both derive identity from the ledger and hand the projection
   * verifier a vendor table to shadow-copy and rebuild.
   */
  it('no projection claims a vendor table — identity is never derived from the ledger', () => {
    const claimed = buildProjectionRegistry()
      .all()
      .flatMap((projection) => projection.tables);
    for (const table of VENDOR_TABLES) expect(claimed).not.toContain(table);
  });
});
