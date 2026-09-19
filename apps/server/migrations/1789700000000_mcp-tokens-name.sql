-- Up Migration

-- Door D (2026-09-19): a person can NAME a token, so a list of them is readable.
--
-- NUMBERS ABOVE 1789600000000, the highest applied migration — a migration
-- numbered below an applied one can never run, and `pnpm check:migrations`
-- refuses the ordering before a database sees it.
--
-- ## Why this is a column and not a second credential flow
--
-- The prototype's row leads with a BOLD NAME — `Claude Desktop — Anjali`,
-- `CI — ticket sync` — and its second line is the token's own prefix and
-- creation date (`gnmcp_live_9f2c…f130 · created today`). A name is therefore
-- something a person SETS ABOUT A TOKEN THEY ALREADY HOLD, not something the
-- token is issued with. The issue-time flow that would have carried it is ruled
-- out, and this column is the whole of the replacement: the row is written once
-- at approval and named afterwards.
--
-- ## NULL, not `NOT NULL DEFAULT ''`, and the reasoning is door A's
--
-- Two states are real and only one of them is a claim. `''` would say "this
-- token is called nothing" — a fact about the token — while NULL is the ABSENCE
-- of a name, which is what a token nobody has named actually has. Every token
-- minted before this column existed is unnamed in exactly that sense, so a
-- backfill would have to invent a claim to avoid NULL, and there is none to
-- invent. It is the same withheld-vs-empty distinction `proj_projects
-- .description` draws, and `ProjectRef.ticketCount` before it.
--
-- ## text, and unbounded at the database
--
-- The 60-character bound is the ROUTE's, stated there with its reason, not the
-- column's. A database constraint would be a second copy of that rule in a
-- place nobody reads when they change it — and the one thing a column-level
-- bound would buy, protection from a future writer, is bought better by there
-- being only one writer.

ALTER TABLE mcp_tokens ADD COLUMN name text NULL;

COMMENT ON COLUMN mcp_tokens.name IS 'What the person calls this token (door D, 2026-09-19), set AFTER issue by the token''s own owner and NULL for a token nobody has named. NULL is the ABSENCE of a name rather than the claim "this token is called nothing" — the same withheld-vs-empty distinction `proj_projects.description` and `ProjectRef.ticketCount` draw. Deliberately unbounded here: the length rule is the route''s, stated once, and a column constraint would be a second copy that nobody reads when the rule changes.';

-- Down Migration

ALTER TABLE mcp_tokens DROP COLUMN name;
