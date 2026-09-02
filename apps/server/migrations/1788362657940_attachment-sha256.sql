-- Up Migration

ALTER TABLE attachments ADD COLUMN sha256 text;

ALTER TABLE attachments
  ADD CONSTRAINT attachments_sha256_hex CHECK (sha256 IS NULL OR sha256 ~ '^[0-9a-f]{64}$');

COMMENT ON COLUMN attachments.sha256 IS 'Lowercase-hex SHA-256 of the stored bytes, computed server-side at upload. NULL means unknown — a row written before hashing existed — and is shown as unknown, never as verified.';

-- Down Migration

ALTER TABLE attachments DROP CONSTRAINT attachments_sha256_hex;
ALTER TABLE attachments DROP COLUMN sha256;
