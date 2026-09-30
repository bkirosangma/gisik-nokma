-- Up Migration
-- Devices and passkeys plan (2026-09-30). Additive: three NULLable columns and
-- one index; old code neither reads nor writes them.
ALTER TABLE "session" ADD COLUMN "deviceId" text;
ALTER TABLE "session" ADD COLUMN "lastSeenAt" timestamptz;
ALTER TABLE "passkey" ADD COLUMN "lastUsedAt" timestamptz;
CREATE INDEX IF NOT EXISTS session_user_device_idx ON "session" ("userId", "deviceId");
COMMENT ON COLUMN "session"."deviceId" IS 'The gn_device cookie value this session was created under (32 random bytes, base64url). Groups sessions by browser; carries no authority; never returned raw to a client or logged — clients see sha256 key + 4-char tag.';
COMMENT ON COLUMN "session"."lastSeenAt" IS 'Last authenticated request on this session, stamped by requireSession at most once per 5 minutes. An observation, never an authorisation input.';
COMMENT ON COLUMN "passkey"."lastUsedAt" IS 'Last successful sign-in with this passkey (stamped after /passkey/verify-authentication). An observation, never an authorisation input.';

-- Down Migration
DROP INDEX IF EXISTS session_user_device_idx;
ALTER TABLE "passkey" DROP COLUMN IF EXISTS "lastUsedAt";
ALTER TABLE "session" DROP COLUMN IF EXISTS "lastSeenAt";
ALTER TABLE "session" DROP COLUMN IF EXISTS "deviceId";
