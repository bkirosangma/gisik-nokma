### Task 1: Identity foundation — better-auth, sender interfaces, vendor schema

**Files:**
- Create: `apps/server/src/db/queryable.ts`
- Create: `apps/server/src/auth/otp-sender.ts`
- Create: `apps/server/src/auth/magic-link-sender.ts`
- Create: `apps/server/src/auth/auth.ts`
- Create: `apps/server/src/auth/auth-dev.ts`
- Create: `apps/server/migrations/<ts>_auth-tables.cjs` (node-pg-migrate generates the timestamp prefix)
- Create: `apps/server/test/helpers/db.ts`
- Test: `apps/server/test/auth/otp-sender.test.ts`

**Interfaces:**
- Consumes: Plan 1's `apps/server` package (Fastify 5, `pg`, node-pg-migrate already configured).
- Produces: `OtpSender { send(phoneE164: string, code: string): Promise<void> }` and `LogOtpSender` (captures into `.sent`, logs); `MagicLinkSender { send(email: string, url: string): Promise<void> }` and `LogMagicLinkSender`; `createAuth(deps: AuthDeps)` returning the better-auth instance (`type Auth = ReturnType<typeof createAuth>`); `type Queryable = Pool | PoolClient`; test helpers `testPool()`, `migrateTestDb()`, `truncateAll(pool)`.

- [ ] **Step 1: Install dependencies**

Run (from `apps/server/`):
```bash
pnpm add better-auth
pnpm add -D @better-auth/cli
```
Expected: lockfile updated; note the exact better-auth version — it goes into the PR description for the Open-questions review.

- [ ] **Step 2: Write the Queryable type**

```ts
// apps/server/src/db/queryable.ts
import type { Pool, PoolClient } from 'pg';

/**
 * Anything the projections and visibility code can query. Passing the
 * handle explicitly (DIP) keeps every function testable against a plain
 * Pool and usable inside a transaction via PoolClient.
 */
export type Queryable = Pool | PoolClient;
```

- [ ] **Step 3: Write the failing test for the OTP sender**

```ts
// apps/server/test/auth/otp-sender.test.ts
import { describe, expect, it } from 'vitest';
import { LogOtpSender } from '../../src/auth/otp-sender';
import { LogMagicLinkSender } from '../../src/auth/magic-link-sender';

describe('LogOtpSender', () => {
  it('captures the code and logs it instead of sending SMS', async () => {
    const lines: string[] = [];
    const sender = new LogOtpSender((msg) => lines.push(msg));
    await sender.send('+919000000001', '482913');
    expect(sender.sent).toEqual([{ phoneE164: '+919000000001', code: '482913' }]);
    expect(lines[0]).toContain('+919000000001');
    expect(lines[0]).toContain('482913');
  });
});

describe('LogMagicLinkSender', () => {
  it('captures the link and logs it instead of sending email', async () => {
    const lines: string[] = [];
    const sender = new LogMagicLinkSender((msg) => lines.push(msg));
    await sender.send('kiro@example.com', 'http://localhost:3000/api/auth/magic-link/verify?token=abc');
    expect(sender.sent).toEqual([
      { email: 'kiro@example.com', url: 'http://localhost:3000/api/auth/magic-link/verify?token=abc' },
    ]);
    expect(lines[0]).toContain('kiro@example.com');
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run (from `apps/server/`): `pnpm vitest run test/auth/otp-sender.test.ts`
Expected: FAIL — cannot resolve `../../src/auth/otp-sender`.

- [ ] **Step 5: Implement the sender interfaces**

```ts
// apps/server/src/auth/otp-sender.ts

/** Delivery of one-time codes, abstracted so the transport is swappable. */
export interface OtpSender {
  send(phoneE164: string, code: string): Promise<void>;
}

/**
 * Development implementation: logs the code and records it for tests.
 * Production delivery runs through a DLT-registered SMS provider behind
 * this same interface — a deployment concern, deliberately NOT
 * implemented in this plan (spec §6 names the errand).
 */
export class LogOtpSender implements OtpSender {
  public readonly sent: Array<{ phoneE164: string; code: string }> = [];

  constructor(private readonly log: (message: string) => void = console.info) {}

  async send(phoneE164: string, code: string): Promise<void> {
    this.sent.push({ phoneE164, code });
    this.log(`[dev-otp] OTP for ${phoneE164}: ${code}`);
  }
}
```

```ts
// apps/server/src/auth/magic-link-sender.ts

/** Delivery of sign-in links, abstracted so the transport is swappable. */
export interface MagicLinkSender {
  send(email: string, url: string): Promise<void>;
}

/**
 * Development implementation: logs the link and records it for tests.
 * The production email provider is a deployment concern, deliberately
 * NOT implemented in this plan.
 */
export class LogMagicLinkSender implements MagicLinkSender {
  public readonly sent: Array<{ email: string; url: string }> = [];

  constructor(private readonly log: (message: string) => void = console.info) {}

  async send(email: string, url: string): Promise<void> {
    this.sent.push({ email, url });
    this.log(`[dev-magic-link] link for ${email}: ${url}`);
  }
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run (from `apps/server/`): `pnpm vitest run test/auth/otp-sender.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 7: Write the better-auth instance factory**

```ts
// apps/server/src/auth/auth.ts
import { betterAuth } from 'better-auth';
import { bearer, magicLink, phoneNumber } from 'better-auth/plugins';
import { passkey } from 'better-auth/plugins/passkey';
import type { Pool } from 'pg';
import type { MagicLinkSender } from './magic-link-sender';
import type { OtpSender } from './otp-sender';

export interface AuthDeps {
  pool: Pool;
  otpSender: OtpSender;
  magicLinkSender: MagicLinkSender;
  baseUrl: string; // e.g. http://localhost:3000
  secret: string; // BETTER_AUTH_SECRET
}

export function createAuth(deps: AuthDeps) {
  return betterAuth({
    database: deps.pool,
    baseURL: deps.baseUrl,
    secret: deps.secret,
    emailAndPassword: { enabled: false }, // the spec forbids passwords
    socialProviders: {
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID ?? '',
        clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
      },
    },
    plugins: [
      phoneNumber({
        sendOTP: async ({ phoneNumber: phone, code }) => {
          await deps.otpSender.send(phone, code);
        },
        signUpOnVerification: {
          getTempEmail: (phone) => `${phone.replace(/[^0-9]/g, '')}@phone.gisik-nokma.invalid`,
          getTempName: (phone) => phone,
        },
      }),
      magicLink({
        sendMagicLink: async ({ email, url }) => {
          await deps.magicLinkSender.send(email, url);
        },
      }),
      passkey({
        rpID: new URL(deps.baseUrl).hostname,
        rpName: 'Gisik Nokma',
      }),
      bearer(), // token sessions for the mobile/desktop apps
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
```

Note: option names above follow better-auth 1.x. If the pinned version's plugin option names differ (its docs are versioned), keep the wiring — `OtpSender` behind `sendOTP`, `MagicLinkSender` behind `sendMagicLink`, no passwords, Google + passkey + bearer enabled — and adapt the option spelling.

- [ ] **Step 8: Write the dev instance (for the schema CLI and local runs)**

```ts
// apps/server/src/auth/auth-dev.ts
import { Pool } from 'pg';
import { createAuth } from './auth';
import { LogMagicLinkSender } from './magic-link-sender';
import { LogOtpSender } from './otp-sender';

/**
 * Concrete instance for `npx @better-auth/cli generate` and local dev.
 * Never imported by production assembly — that wires real deps.
 */
export const auth = createAuth({
  pool: new Pool({
    connectionString:
      process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/gisik_nokma_dev',
  }),
  otpSender: new LogOtpSender(),
  magicLinkSender: new LogMagicLinkSender(),
  baseUrl: process.env.BETTER_AUTH_URL ?? 'http://localhost:3000',
  secret: process.env.BETTER_AUTH_SECRET ?? 'dev-only-secret-change-me',
});
```

- [ ] **Step 9: Create the vendor-schema migration**

Run (from `apps/server/`): `pnpm exec node-pg-migrate create auth-tables`
Then replace the generated file's content:

```js
// apps/server/migrations/<ts>_auth-tables.cjs
/**
 * better-auth vendor schema. These tables are library-owned identity
 * infrastructure — NOT events, NOT projections. Column names keep the
 * library's camelCase (vendor exception to the snake_case standard).
 */
exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE "user" (
      "id" text PRIMARY KEY,
      "name" text NOT NULL,
      "email" text UNIQUE,
      "emailVerified" boolean NOT NULL DEFAULT false,
      "image" text,
      "phoneNumber" text UNIQUE,
      "phoneNumberVerified" boolean,
      "createdAt" timestamptz NOT NULL DEFAULT now(),
      "updatedAt" timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE "session" (
      "id" text PRIMARY KEY,
      "userId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
      "token" text NOT NULL UNIQUE,
      "expiresAt" timestamptz NOT NULL,
      "ipAddress" text,
      "userAgent" text,
      "createdAt" timestamptz NOT NULL DEFAULT now(),
      "updatedAt" timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE "account" (
      "id" text PRIMARY KEY,
      "userId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
      "accountId" text NOT NULL,
      "providerId" text NOT NULL,
      "accessToken" text,
      "refreshToken" text,
      "idToken" text,
      "accessTokenExpiresAt" timestamptz,
      "refreshTokenExpiresAt" timestamptz,
      "scope" text,
      "password" text,
      "createdAt" timestamptz NOT NULL DEFAULT now(),
      "updatedAt" timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE "verification" (
      "id" text PRIMARY KEY,
      "identifier" text NOT NULL,
      "value" text NOT NULL,
      "expiresAt" timestamptz NOT NULL,
      "createdAt" timestamptz NOT NULL DEFAULT now(),
      "updatedAt" timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE "passkey" (
      "id" text PRIMARY KEY,
      "userId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
      "name" text,
      "publicKey" text NOT NULL,
      "credentialID" text NOT NULL,
      "counter" integer NOT NULL,
      "deviceType" text NOT NULL,
      "backedUp" boolean NOT NULL,
      "transports" text,
      "createdAt" timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX "session_userId_idx" ON "session"("userId");
    CREATE INDEX "account_userId_idx" ON "account"("userId");
    CREATE INDEX "verification_identifier_idx" ON "verification"("identifier");
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE "passkey";
    DROP TABLE "verification";
    DROP TABLE "account";
    DROP TABLE "session";
    DROP TABLE "user";
  `);
};
```

- [ ] **Step 10: Reconcile the migration against the library's own generator**

Run (from `apps/server/`): `pnpm exec @better-auth/cli generate --config src/auth/auth-dev.ts`
Compare the SQL it prints with the migration from Step 9. If the installed version's schema differs (extra columns, changed types), the library wins: update the migration to match, exactly. Do not skip this — a drifted vendor schema fails at runtime, not at migrate time.

- [ ] **Step 11: Write the test DB helper**

```ts
// apps/server/test/helpers/db.ts
import { execFileSync } from 'node:child_process';
import { Pool } from 'pg';

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/gisik_nokma_test';

/** Bring the test database to the latest migration. Call once per suite. */
export function migrateTestDb(): void {
  execFileSync('pnpm', ['exec', 'node-pg-migrate', 'up'], {
    cwd: process.cwd(), // vitest runs from apps/server
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    stdio: 'inherit',
  });
}

export function testPool(): Pool {
  return new Pool({ connectionString: TEST_DATABASE_URL });
}

/** Empty every table except node-pg-migrate's ledger of applied migrations. */
export async function truncateAll(pool: Pool): Promise<void> {
  await pool.query(`
    DO $$
    DECLARE t text;
    BEGIN
      FOR t IN SELECT tablename FROM pg_tables
               WHERE schemaname = 'public' AND tablename <> 'pgmigrations'
      LOOP EXECUTE format('TRUNCATE TABLE %I CASCADE', t); END LOOP;
    END $$;
  `);
}
```

(If Plan 1 already ships a test-db helper in `apps/server/test/helpers/`, add `truncateAll` and `TEST_DATABASE_URL` to it instead of creating a second one, and use its names everywhere this plan says `testPool`/`migrateTestDb`.)

- [ ] **Step 12: Verify migrations apply cleanly**

Run (from `apps/server/`):
```bash
createdb gisik_nokma_test 2>/dev/null || true
DATABASE_URL=postgres://postgres:postgres@localhost:5432/gisik_nokma_test pnpm exec node-pg-migrate up
```
Expected: all migrations (Plan 1's and `auth-tables`) apply without error; `psql` shows the five quoted tables.

- [ ] **Step 13: Run the whole server test suite to prove nothing broke**

Run (from `apps/server/`): `pnpm vitest run`
Expected: PASS — Plan 1–3 suites untouched, plus the 2 new sender tests.

- [ ] **Step 14: Commit**

```bash
git add apps/server/src/db/queryable.ts apps/server/src/auth apps/server/migrations apps/server/test/helpers/db.ts apps/server/test/auth/otp-sender.test.ts apps/server/package.json pnpm-lock.yaml
git commit -m "Identity is infrastructure: better-auth owns users and sessions in server tables, while membership stays workspace history in the ledger. OTP and magic-link delivery sit behind senders whose dev implementations log instead of sending."
```

---

