-- Up Migration

-- NEITHER table is a projection and NEITHER is rebuildable, for exactly the
-- reason invite_tokens is not (see 1787961600000_proj-invites.sql): what they
-- hold is deliberately absent from the ledger. Anyone who can read a
-- workspace's history can read an event id and a payload; a credential that
-- was either of those would be readable by every member. So these sit beside
-- better-auth's own tables in the same relationship to the ledger that a
-- session has: identity machinery is not workspace history.
--
-- The consequence a reader must not undo: neither name may EVER appear in a
-- projection's `tables` array. `reset()` empties what that array names, and
-- verify-projections builds a shadow schema per listed table with `search_path`
-- set — so an unlisted table's unqualified name resolves to the LIVE one. A
-- rebuild that emptied mcp_tokens would sign every MCP client out with no way
-- to put them back, and the ledger could not.

CREATE TABLE mcp_device_codes (
  device_code_hash text NOT NULL PRIMARY KEY,
  user_code        text NOT NULL UNIQUE,
  approved_user_id text,
  created_at       timestamptz NOT NULL,
  expires_at       timestamptz NOT NULL
);

CREATE INDEX mcp_device_codes_expires_at_idx ON mcp_device_codes (expires_at);

COMMENT ON TABLE mcp_device_codes IS 'In-flight device-authorization grants for the MCP server. Server-owned, never a projection, never rebuildable. A row lives at most DEVICE_CODE_TTL_SEC and is DELETED at exchange — that deletion is what makes a device code single-use.';
COMMENT ON COLUMN mcp_device_codes.device_code_hash IS 'sha256(deviceCode), hex. The raw device code exists only in the response that minted it and in the client''s memory; it is never stored, never logged, and never displayed to the person approving.';
COMMENT ON COLUMN mcp_device_codes.user_code IS 'The short code a PERSON reads and types, stored in the clear on purpose: it is a lookup key the approver types, not a bearer credential — holding it grants nothing without an authenticated session to approve with, and the row it names is gone within ten minutes.';
COMMENT ON COLUMN mcp_device_codes.approved_user_id IS 'NULL until a signed-in person approves. Once set, the next exchange mints that person''s token. A grant is approved by exactly one user and can never be re-pointed.';

CREATE TABLE mcp_tokens (
  token_hash text NOT NULL PRIMARY KEY,
  user_id    text NOT NULL,
  created_at timestamptz NOT NULL,
  last_used  timestamptz
);

CREATE INDEX mcp_tokens_user_id_idx ON mcp_tokens (user_id);

COMMENT ON TABLE mcp_tokens IS 'Personal access tokens for the MCP server — a SIBLING credential to a better-auth session, not a session: no cookie, no browser semantics, no CSRF surface, and resolved only after better-auth has answered null (see src/auth/require-session.ts). Server-owned, never a projection.';
COMMENT ON COLUMN mcp_tokens.token_hash IS 'sha256(token), hex. A plain hash rather than a password KDF, and that is correct HERE for the same reason it is correct for invite_tokens: the input is 32 bytes from randomBytes — 256 bits of uniform entropy, not a human-chosen secret — so there is no dictionary to stretch against.';
COMMENT ON COLUMN mcp_tokens.last_used IS 'NULL until first use. Written on every successful resolution so a person can see whether a token they meant to revoke is still being used. It is an observation, never an authorisation input — no code path reads it to decide anything.';

-- Deliberately NO expires_at, and this is a decision rather than an omission.
-- An invitation link is a credential handed to somebody who is not yet a user,
-- so a clock on it bounds an unknown; an MCP token is minted by the account
-- holder, for their own machine, from an interactive approval they performed.
-- Expiring it would sign the assistant out mid-task on a timer nobody chose,
-- and the re-auth path (401 -> device flow) already exists for the case that
-- matters: a REVOKED token, which is a DELETE here and takes effect at once.
-- If the owner wants a TTL, it is one column and one WHERE clause -- see the
-- plan's Open question 4.

-- Down Migration

DROP TABLE mcp_tokens;
DROP TABLE mcp_device_codes;
