-- Up Migration
-- Hosted MCP (spec 2026-09-30-remote-mcp-server-design.md, plan Task 1): five tables.
-- Additive: existing mcp_tokens rows become kind='local', expires_at NULL,
-- connection_id NULL — exactly the device-flow behaviour they have today.

CREATE TABLE oauth_clients (
  client_id       text PRIMARY KEY,
  client_name     text NOT NULL,
  redirect_uris   text[] NOT NULL,
  created_at      timestamptz NOT NULL
);

CREATE TABLE oauth_pending_authorizations (
  request_id      text PRIMARY KEY,
  client_id       text NOT NULL REFERENCES oauth_clients (client_id) ON DELETE CASCADE,
  redirect_uri    text NOT NULL,
  state           text,
  code_challenge  text NOT NULL,
  created_at      timestamptz NOT NULL,
  expires_at      timestamptz NOT NULL
);

CREATE TABLE oauth_codes (
  code_hash       text PRIMARY KEY,
  client_id       text NOT NULL REFERENCES oauth_clients (client_id) ON DELETE CASCADE,
  user_id         text NOT NULL,
  redirect_uri    text NOT NULL,
  code_challenge  text NOT NULL,
  created_at      timestamptz NOT NULL,
  expires_at      timestamptz NOT NULL
);

CREATE TABLE oauth_connections (
  id              text PRIMARY KEY,
  user_id         text NOT NULL,
  client_id       text NOT NULL REFERENCES oauth_clients (client_id) ON DELETE CASCADE,
  created_at      timestamptz NOT NULL,
  last_used       timestamptz,
  idle_expires_at timestamptz NOT NULL
);
CREATE INDEX oauth_connections_user_id_idx ON oauth_connections (user_id);

CREATE TABLE oauth_refresh_tokens (
  token_hash      text PRIMARY KEY,
  connection_id   text NOT NULL REFERENCES oauth_connections (id) ON DELETE CASCADE,
  created_at      timestamptz NOT NULL,
  used_at         timestamptz
);

ALTER TABLE mcp_tokens
  ADD COLUMN kind text NOT NULL DEFAULT 'local' CHECK (kind IN ('local', 'hosted')),
  ADD COLUMN expires_at timestamptz,
  ADD COLUMN connection_id text REFERENCES oauth_connections (id) ON DELETE CASCADE;
CREATE INDEX mcp_tokens_connection_id_idx ON mcp_tokens (connection_id);

COMMENT ON TABLE oauth_connections IS 'One row per consent a person gave a hosted MCP client — the refresh FAMILY. Deleting it deletes its access (mcp_tokens) and refresh tokens. Server-owned, never a projection.';

-- Down Migration
ALTER TABLE mcp_tokens DROP COLUMN connection_id, DROP COLUMN expires_at, DROP COLUMN kind;
DROP TABLE oauth_refresh_tokens;
DROP TABLE oauth_connections;
DROP TABLE oauth_codes;
DROP TABLE oauth_pending_authorizations;
DROP TABLE oauth_clients;
