-- Up Migration

-- TWO TABLES, ONE MIGRATION, AND THEY ARE DIFFERENT KINDS OF THING.
--
-- `proj_invites` is a projection: every row is derived from `invite.sent` /
-- `invite.accepted` / `invite.revoked` and a rebuild reproduces it exactly.
--
-- `invite_tokens` is NOT a projection and is NEVER rebuildable, because the
-- thing it holds is deliberately not in the ledger. Anyone who can read a
-- workspace's history can read an event id and a payload; if the link's secret
-- were either of those, any member could accept an invitation addressed to
-- somebody else. So the secret is server-owned state, hashed at rest, sitting
-- beside better-auth's own token tables in exactly the same relationship to the
-- ledger that a session does: identity machinery is not workspace history.
--
-- The consequence a reader must not undo: `projInvites.tables` lists
-- `proj_invites` ALONE. `reset()` empties what that array names, and a rebuild
-- or a `verify-projections` run that also emptied `invite_tokens` would destroy
-- every live invitation link in the product with no way to reissue them — the
-- ledger cannot put them back. `tools/verify-projections.ts` builds a shadow
-- copy per listed table and runs projections with `search_path` set, so an
-- unlisted table's unqualified name resolves to the LIVE one; nothing in
-- `proj-invites.ts` may ever name `invite_tokens` for that reason too.
--
-- text/timestamptz/text[] only, no `json`: tools/verify-projections.ts diffs
-- with EXCEPT and needs an equality operator for every column it compares.
-- `text[]` (the `proj_visibility` idiom) rather than `jsonb` for `project_ids`,
-- because the thing being stored IS a list of ids and `text[]` says so.

CREATE TABLE proj_invites (
  invite_id        text PRIMARY KEY,
  workspace_id     text NOT NULL,
  address          text NOT NULL,
  channel          text NOT NULL CHECK (channel IN ('email', 'phone')),
  role             text NOT NULL CHECK (role IN ('admin', 'member', 'guest')),
  project_ids      text[] NOT NULL DEFAULT '{}',
  status           text NOT NULL CHECK (status IN ('pending', 'accepted', 'revoked')),
  invited_by       text NOT NULL,
  invited_at       timestamptz NOT NULL,
  accepted_user_id text,
  accepted_at      timestamptz
);

CREATE INDEX proj_invites_workspace_status_idx ON proj_invites (workspace_id, status);

COMMENT ON TABLE proj_invites IS 'Projection: one row per invitation, from invite.sent/accepted/revoked. Rebuildable from the ledger; never authored. Holds the CLAIM (who invited what address to what role) and never the secret that opens it — see invite_tokens.';
COMMENT ON COLUMN proj_invites.address IS 'The address the invitation names — a CLAIM about where to reach somebody, never an assertion about who they are. PII: sync-down withholds invite events from everyone but owners and admins (src/visibility/visible-events-for.ts), and the pending-invite read route applies the same rule.';
COMMENT ON COLUMN proj_invites.role IS 'admin|member|guest. `owner` is absent by omission and deliberately: an invitation cannot make somebody the owner of a workspace they have not yet entered.';
COMMENT ON COLUMN proj_invites.project_ids IS 'The projects the invitation promised, appended as project.member_added rows at acceptance. Always empty for a guest invite — the domain schema refuses the combination, because a guest reaches work through visibility.set explicit lists and a project association would promise something membership no longer means.';
COMMENT ON COLUMN proj_invites.status IS 'pending|accepted|revoked. What says the link still opens ANYTHING: the token row proves only that somebody holds it. It is NOT what makes a link single-use — a read cannot stop two people presenting the same token at once, and until 2026-09-01 three concurrent acceptances all passed this check and all committed. Single-use is the conditional DELETE on invite_tokens (see src/routes/invites.ts). A transition out of pending is terminal — the projection refuses to move an accepted or revoked invite, so the first terminal claim in ledger order is the one that stands.';
COMMENT ON COLUMN proj_invites.invited_at IS 'The RECEIVED instant (events.server_time) of the invite.sent claim, never a clock read at apply time — a projection that read a clock would not be a pure function of the ledger and every rebuild would disagree with live.';

-- The credential store. NOT a projection. Never in `projInvites.tables`.
--
-- `token_hash` is sha256 of a 32-byte random token, hex-encoded. The raw token
-- exists in exactly one place for exactly one moment: the body of the 201 that
-- minted it. It is not in the ledger, not in this table, and not recoverable
-- from either — a lost link is reissued, never looked up.
--
-- `expires_at` LIVES HERE AND NOT IN proj_invites, and that is forced rather
-- than chosen. A projection's contract (src/projections/registry.ts) is that
-- `apply` reads no clock, so a projection cannot compute "now + a fortnight"
-- and stay a pure function of the ledger — every rebuild would disagree with
-- live by exactly the time between them. Expiry is therefore a property of the
-- CREDENTIAL, which is server-owned state, and not of the CLAIM, which is
-- history.
--
-- NOT NULL, with no default and no nullable escape hatch. A nullable
-- `expires_at` checked as `IS NULL OR expires_at > now()` is the shape this
-- plan keeps catching: every row would be NULL, the second disjunct would never
-- execute, and the product would carry an expiry check that had never once
-- decided anything. Every token this product mints has a real expiry, so the
-- comparison is reachable on every row.

CREATE TABLE invite_tokens (
  invite_id  text PRIMARY KEY,
  token_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL
);

COMMENT ON TABLE invite_tokens IS 'Server-owned credential store for invitation links. NOT a projection and NOT rebuildable from the ledger — the token is deliberately absent from the ledger, which is the whole point. Excluded from projInvites.tables so that reset(), rebuildProjection() and verify-projections never touch it; emptying it would destroy every live invitation link with no way to reissue them.';
COMMENT ON COLUMN invite_tokens.token_hash IS 'sha256(token), hex. The raw token exists only in the 201 that minted it. Lookup is by hash, so nothing on the read path ever needs the plaintext at rest.';
COMMENT ON COLUMN invite_tokens.expires_at IS 'When this link stops opening anything. Set at mint to created_at + the INVITE_TOKEN_TTL constant in src/routes/invites.ts. The DURATION is a product decision the series has not taken and the constant records that; the MECHANISM is not optional, because an invitation link with no clock is a durable replayable credential that anyone who ever sees it — a forwarded email, a screenshot, a shared browser — can use forever.';

-- The row is DELETED at acceptance, and that deletion IS the guard that makes a
-- link single-use. It is one conditional statement --
--
--   DELETE FROM invite_tokens WHERE token_hash = $1 AND expires_at > now()
--     RETURNING invite_id
--
-- -- and one statement is one transaction, so at most one presentation of a
-- token can ever get a row back from it: concurrent presentations queue on the
-- row lock, re-evaluate once the winner commits, and match nothing.
--
-- This table is where that is POSSIBLE, and the reason is the same reason it is
-- not a projection: it is server-owned state, nothing else writes it, and the
-- route owns its transactions here outright. The route genuinely cannot enlist
-- in the LEDGER's transaction (ingest opens its own connection), and until
-- 2026-09-01 that true sentence was generalised into a false one -- that the
-- deletion could not be atomic at all, so ordering plus the status check
-- replaced atomicity. Measured under that arrangement: three parallel
-- acceptances of ONE token, three 200s and three admin memberships, in 24 of 25
-- trials. `proj_invites.status` closes the SEQUENTIAL window; only this DELETE
-- closes the concurrent one. See src/routes/invites.ts and case 6.129.

-- Down Migration

DROP TABLE invite_tokens;
DROP TABLE proj_invites;
