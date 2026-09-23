-- Up Migration

-- An attachment's owner may be a TICKET or a NOTE (notes series, Plan 1 of 6,
-- spec §4.4).
--
-- NUMBERS ABOVE 1790100000000, the highest applied migration, because a
-- migration numbered below an applied one can never run — and
-- `pnpm check:migrations` refuses the ordering before a database ever sees it.
--
-- ## Why a nullable `note_id` beside a nullable `ticket_id`, and not a `kind`
-- ## column
--
-- Spec §4.4 offers both shapes and tells the implementer to read the table
-- first. Read: `ticket_id` was `text NOT NULL` and every reader filters on it
-- by name (`listTicketAttachments`, `listAttachmentsByIds`), so a `kind` column
-- would require every one of those reads to carry a SECOND predicate — and a
-- reader that forgot it would return a NOTE-owned row to a ticket read, over a
-- `ticket_id` that would then have to hold a note id or be null anyway. The
-- nullable pair states the same fact in the column that is already indexed.
--
-- ## The CHECK is the whole point
--
-- `(ticket_id IS NULL) <> (note_id IS NULL)` is XOR, spelled as an inequality
-- of two booleans. It refuses BOTH failures at once: a row owned by neither
-- (which no door could ever serve, since every authorisation question starts
-- from an owner) and a row owned by both (which would make "who may download
-- this" depend on which branch a handler happened to read first). Expressing it
-- as a CHECK rather than as application code means a future writer that invents
-- a third owner path is refused by Postgres rather than by review.
--
-- The old schema's implicit constraint — exactly one owner, and it is a ticket
-- — is preserved for every existing row: `note_id` defaults NULL, so
-- `(ticket_id IS NULL) <> (note_id IS NULL)` holds for all of them by
-- construction.
--
-- ## What this does NOT do
--
-- It does not add an index on `note_id`. Nothing reads attachments by note yet
-- — a note's files arrive in Plan 4 of the series with the editor port, and an
-- index nothing queries is a write cost with no reader. When that read lands it
-- adds its own index in its own migration, numbered with the indexes that
-- exist.

ALTER TABLE attachments ALTER COLUMN ticket_id DROP NOT NULL;

ALTER TABLE attachments ADD COLUMN note_id text NULL;

ALTER TABLE attachments ADD CONSTRAINT attachments_one_owner_check
  CHECK ((ticket_id IS NULL) <> (note_id IS NULL));

COMMENT ON COLUMN attachments.note_id IS 'The note this file was uploaded into, when its owner is a NOTE. NULL for every ticket-owned row — see the migration, and the attachments_one_owner_check that makes "both null" and "both set" unrepresentable rather than merely unlikely.';
COMMENT ON COLUMN attachments.ticket_id IS 'The ticket this file was uploaded into, when its owner is a TICKET. NULLABLE since the notes series (1790110000000) — a note-owned row has this NULL and note_id set, and attachments_one_owner_check refuses a row that sets neither or both.';

-- Down Migration

ALTER TABLE attachments DROP CONSTRAINT attachments_one_owner_check;
DELETE FROM attachments WHERE ticket_id IS NULL;
ALTER TABLE attachments DROP COLUMN note_id;
ALTER TABLE attachments ALTER COLUMN ticket_id SET NOT NULL;
