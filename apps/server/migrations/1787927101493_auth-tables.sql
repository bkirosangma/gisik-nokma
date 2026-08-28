-- Up Migration

-- better-auth's vendor schema, transcribed from the generator of the version
-- this server actually imports (better-auth 1.7.2, plus @better-auth/passkey
-- 1.7.2 for the passkey table) via `pnpm --filter @gisik-nokma/server run
-- auth:schema`. Re-run that after every better-auth upgrade and diff: a drifted
-- vendor schema fails at runtime, not at migrate time.
--
-- These five tables are the ONE deliberate exception to the snake_case
-- standard. They are library-owned identity infrastructure managed by
-- better-auth's own migrator, which addresses its columns by the camelCase
-- names below; renaming them to "email_verified" or "user_id" breaks every
-- query the library makes. The exception stops at this file — nothing else in
-- the schema quotes an identifier.

CREATE TABLE "user" (
  "id"                  text PRIMARY KEY,
  "name"                text NOT NULL,
  "email"               text NOT NULL UNIQUE,
  "emailVerified"       boolean NOT NULL,
  "image"               text,
  "createdAt"           timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"           timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "phoneNumber"         text UNIQUE,
  "phoneNumberVerified" boolean
);

COMMENT ON TABLE "user" IS 'better-auth vendor table. Server-owned identity infrastructure, NOT an event and NOT a projection: auth state is not workspace history, so no row here is ever derived from or written to the ledger. Who is inside which workspace with which role is the separate, attributed story in events.';
COMMENT ON COLUMN "user"."email" IS 'Always present, because a phone-only sign-up is given a synthetic address at phone.gisik-nokma.invalid (src/auth/auth.ts, signUpOnVerification.getTempEmail) — the library requires an email and the invalid TLD guarantees nothing can be delivered to it.';

CREATE TABLE "session" (
  "id"        text PRIMARY KEY,
  "expiresAt" timestamptz NOT NULL,
  "token"     text NOT NULL UNIQUE,
  "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamptz NOT NULL,
  "ipAddress" text,
  "userAgent" text,
  "userId"    text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE
);

COMMENT ON TABLE "session" IS 'better-auth vendor table: live sessions for web cookies and for the bearer tokens the mobile and desktop apps carry. Deleting a user cascades their sessions away; nothing in the ledger changes, because signing out is not something a workspace remembers.';

CREATE TABLE "account" (
  "id"                     text PRIMARY KEY,
  "issuer"                 text NOT NULL,
  "accountId"              text NOT NULL,
  "providerId"             text NOT NULL,
  "userId"                 text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  "accessToken"            text,
  "refreshToken"           text,
  "idToken"                text,
  "accessTokenExpiresAt"   timestamptz,
  "refreshTokenExpiresAt"  timestamptz,
  "scope"                  text,
  "password"               text,
  "createdAt"              timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"              timestamptz NOT NULL
);

COMMENT ON TABLE "account" IS 'better-auth vendor table: the link between a user and an external identity provider (Google here). The "password" column is vendor schema and stays empty — the spec forbids passwords, and src/auth/auth.ts sets emailAndPassword.enabled to false.';
COMMENT ON COLUMN "account"."issuer" IS 'Added by better-auth 1.7 and REQUIRED (NOT NULL). It is absent from @better-auth/cli 1.4.21''s generated schema, which is why this migration is transcribed from the installed library instead — an account link would fail at runtime against a 1.4-shaped table.';

CREATE TABLE "verification" (
  "id"         text PRIMARY KEY,
  "identifier" text NOT NULL,
  "value"      text NOT NULL,
  "expiresAt"  timestamptz NOT NULL,
  "createdAt"  timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE "verification" IS 'better-auth vendor table: short-lived challenges — phone OTPs and magic-link tokens — keyed by identifier and expired by expiresAt. The transport that delivers them is injected (src/auth/otp-sender.ts, src/auth/magic-link-sender.ts); what is stored is the library''s business.';

CREATE TABLE "passkey" (
  "id"           text PRIMARY KEY,
  "name"         text,
  "publicKey"    text NOT NULL,
  "userId"       text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  "credentialID" text NOT NULL,
  "counter"      integer NOT NULL,
  "deviceType"   text NOT NULL,
  "backedUp"     boolean NOT NULL,
  "transports"   text,
  "createdAt"    timestamptz,
  "aaguid"       text
);

COMMENT ON TABLE "passkey" IS 'Vendor table owned by @better-auth/passkey, which in 1.7 is a separate package from better-auth — the plugin no longer ships under better-auth/plugins/passkey. WebAuthn credentials only; no secret of the user''s ever reaches this row, which holds a public key and a replay counter.';

CREATE INDEX "session_userId_idx" ON "session" ("userId");
CREATE INDEX "account_userId_idx" ON "account" ("userId");
CREATE INDEX "verification_identifier_idx" ON "verification" ("identifier");
CREATE INDEX "passkey_userId_idx" ON "passkey" ("userId");
CREATE INDEX "passkey_credentialID_idx" ON "passkey" ("credentialID");
-- One external identity maps to at most one account row: the library relies on
-- this to make provider linking idempotent rather than duplicating on re-login.
CREATE UNIQUE INDEX "account_issuer_accountId_uidx" ON "account" ("issuer", "accountId");

-- Down Migration

DROP TABLE "passkey";
DROP TABLE "verification";
DROP TABLE "account";
DROP TABLE "session";
DROP TABLE "user";
