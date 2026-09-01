-- Up Migration

-- Per-user, per-workspace VIEW PREFERENCES (Plan 5 Task 13, coordination
-- amendment 14).
--
-- NOT a projection, and deliberately not named `proj_`: nothing derives this
-- table from the ledger and nothing rebuilds it. It is the only AUTHORED table
-- the read surface owns, and `tools/verify-projections.ts` must never see it —
-- that tool diffs each registered projection's declared tables against a shadow
-- rebuild, and a table with no events behind it would rebuild to nothing.
--
-- Why rows and not ledger events. Everything else this product stores is an
-- attributed claim about the work. Preferences are not about the work: they
-- ARRANGE it. Which columns a person shows, how they group a list, what they
-- named a saved query — none of it says anything about a ticket that could
-- later be true or false, so there is nothing to attribute and nothing a
-- replica needs to replay. Recording them as claims would put non-facts in the
-- ledger and force every reader of it to know which entries were history and
-- which were furniture. The exception is STATED rather than smuggled, and
-- `test/routes/preferences.test.ts` (7.31) makes it falsifiable: a PUT appends
-- zero events.
--
-- The key is `(user_id, workspace_id)`. Per-workspace and not per-user, because
-- a person's columns and groupings are about the projects in front of them and
-- those differ between tenancies; per-user and not per-workspace, because a
-- preference is one person's arrangement and nobody else's business. There is
-- exactly one writer per key — the person themselves, through
-- `PUT /v1/me/preferences`, whose identity comes from the session — so a
-- full-replace upsert is last-writer-wins between that one person's own
-- devices, which is the semantics the document has anyway.
--
-- `doc` is `jsonb` and not a column per preference: the document is the client's
-- to arrange (`packages/domain/src/preferences.ts` is its whole shape) and
-- normalising it here would mean a migration every time a client learns to
-- remember one more thing. The validation that keeps it honest is the zod schema
-- at the door, on the way IN and on the way OUT.
--
-- `jsonb` and not `json`: jsonb has an equality operator, normalises whitespace
-- and key order, and REFUSES U+0000 (SQLSTATE 22P05) — which the door refuses
-- first, so that refusal is a 400 a caller can read rather than a 500.
--
-- No foreign keys, matching every projection table here: a workspace is a
-- ledger fact rather than a row this schema can point at, and the door's
-- `requireMember` is what decides whether a workspace is real for this caller.
-- The consequence is stated rather than hidden: a row survives the revocation of
-- the membership that made it reachable, unreachable behind the door's 404 and
-- collected by nothing. Preferences are not events, so no purge tombstone
-- reaches them.

CREATE TABLE user_preferences (
  user_id      text        NOT NULL,
  workspace_id text        NOT NULL,
  doc          jsonb       NOT NULL,
  updated_at   timestamptz NOT NULL
);

ALTER TABLE user_preferences
  ADD CONSTRAINT user_preferences_pk PRIMARY KEY (user_id, workspace_id);

COMMENT ON TABLE user_preferences IS 'AUTHORED per-user view preferences, one row per (user, workspace). NOT a projection: nothing derives it from the ledger and nothing rebuilds it. Preferences arrange truth rather than claim it (coordination amendment 14), which is why they are rows and not events.';

COMMENT ON COLUMN user_preferences.user_id IS 'The person whose arrangement this is. Written only from the SESSION — no request parameter names it, and the route test sends every spelling of one to prove it.';
COMMENT ON COLUMN user_preferences.workspace_id IS 'The tenancy the arrangement applies to. Half of the key: the same person holds a different document in each workspace they belong to.';
COMMENT ON COLUMN user_preferences.doc IS 'The whole PreferencesDoc (packages/domain/src/preferences.ts), replaced wholesale by PUT. Validated by zod on the way in AND on the way out, so a document this table cannot describe is a refusal rather than a silently different answer.';
COMMENT ON COLUMN user_preferences.updated_at IS 'When the row was last replaced, from Postgres now(). On no response and read by nothing — kept for operators, so a stale-preferences question has an answer without an event to ask.';

-- Down Migration

DROP TABLE user_preferences;
