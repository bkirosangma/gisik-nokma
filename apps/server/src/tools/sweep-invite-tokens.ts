import { pathToFileURL } from 'node:url';
import { createPool } from '../db.js';
import type { Queryable } from '../db/queryable.js';

/**
 * ONE predicate, named once, used by the dry run AND by the deletion.
 *
 * The two callers below interpolate this same string, and that is the point
 * rather than a tidiness: a `SELECT` and a `DELETE` carrying two separately
 * maintained `WHERE` clauses is a dry run that is free to drift from the thing
 * it claims to preview, and the drift is invisible — both statements keep
 * working, they just stop describing each other. An operator who reads a dry
 * run and then runs it live is trusting that these are the same sentence, so
 * they are the same sentence.
 *
 * It is written with UNQUALIFIED column names and the target table spelled out
 * in the correlated subquery (`invite_tokens.invite_id`), because that is the
 * one shape that parses identically in `SELECT ... FROM invite_tokens WHERE …`
 * and in `DELETE FROM invite_tokens WHERE … RETURNING …`. A `FROM`-leading
 * fragment or an alias would parse in one and not the other, and the fragment
 * would have to be split — which is the drift it exists to prevent.
 *
 * ## What it selects, and what it deliberately does not
 *
 * **Lapsed.** `expires_at <= now()`, compared inside Postgres where both sides
 * are absolute instants — the same comparison `openableInvite` and
 * `consumeInviteToken` make, in the same direction, so no row that still opens
 * anything can match. The boundary is the complement of theirs: they admit
 * `expires_at > now()`, this collects everything else, and no instant belongs
 * to both or to neither.
 *
 * **Revoked, whatever its expiry.** This is the half case 6.131 actually names
 * and it is not the expiry rule under another name. A revocation can land at
 * any moment before natural expiry and NOTHING touches the token row when it
 * does — acceptance deletes its own row (`consumeInviteToken`), and a dead link
 * being presented does not collect it either, because `openableInvite` refuses
 * on status BEFORE the consume statement is reached. So an expiry-only sweep
 * would leave a withdrawn workspace's credential sitting in the table, hashed
 * at rest, for the rest of its fortnight.
 *
 * `proj_invites` is an ordinary projection and is read directly here. That is
 * fine and is NOT the pattern ruling P22 governs: P22 is about
 * `proj_memberships`, whose project-scope rows survive a revocation, so a
 * direct read of THAT table reports a stranger as a member. `proj_invites` has
 * no such surviving-row shape — `status` is the invitation's whole state — and
 * `openableInvite` reads it directly for the same reason.
 *
 * **`'accepted'` is absent, deliberately.** Acceptance already deletes its own
 * token row atomically, in the statement that makes a link single-use, so an
 * accepted invitation has no row for this sweep to find. Adding the status
 * would be a branch no fixture can reach — a condition that never decides
 * anything, which is the shape this plan keeps catching.
 *
 * ## The outer parentheses are load-bearing, not formatting
 *
 * The fragment's top level is an `OR`, and `AND` binds tighter than `OR` in
 * Postgres as everywhere else. Unwrapped, it is correct only for as long as it
 * is the ENTIRE `WHERE` clause — and the first plausible next requirement,
 * sweeping one workspace, appends `AND workspace_id = $1` and gets
 * `expires_at <= now() OR (EXISTS(…) AND workspace_id = $1)`: every lapsed
 * token in EVERY workspace deleted, by a statement that still parses and still
 * runs. The parens make the module's own claim — one predicate, the same
 * sentence in both statements — survive being composed with anything, which is
 * the only form in which "safe in both callers" means something.
 */
const SWEEPABLE_INVITE_TOKENS = `
  (
    expires_at <= now()
    OR EXISTS (
         SELECT 1 FROM proj_invites i
          WHERE i.invite_id = invite_tokens.invite_id
            AND i.status = 'revoked'
       )
  )
`;

export type InviteTokenSweepReport = {
  dryRun: boolean;
  /** The invitations whose credential rows the predicate selects, in id order. */
  swept: string[];
  /** Rows actually removed: `swept.length` live, and 0 on a dry run. */
  deleted: number;
};

/**
 * Collect the credential rows that no longer open anything.
 *
 * Safe to run at any moment and safe to run twice, which is what lets it be
 * scheduled by something this task does not build — the second run of a pair
 * finds nothing, because the first left nothing the predicate matches.
 *
 * ## Why this is a sweep and not a deletion at the moment of revocation
 *
 * Revocation is an ordinary client event (`POST /v1/events`), applied by
 * `projInvites` inside the ingest transaction. A projection may not write
 * `invite_tokens` — the table is excluded from `projInvites.tables` precisely so
 * that `reset()`, `rebuildProjection` and `verify-projections` can never empty
 * it, and a projection that named it would be reintroducing the hazard that
 * exclusion exists to prevent. So the collection happens out here, where the
 * table's owner already lives.
 *
 * The deletion is by predicate rather than by the id list the dry run returns:
 * one statement decides and acts on the same committed snapshot, so a row that
 * lapses between the two is collected on this run rather than surviving until
 * the next, and a row a concurrent acceptance consumed in between is simply not
 * there to delete.
 */
export async function sweepInviteTokens(
  db: Queryable,
  options: { dryRun: boolean },
): Promise<InviteTokenSweepReport> {
  if (options.dryRun) {
    const { rows } = await db.query<{ invite_id: string }>(
      `SELECT invite_id FROM invite_tokens
        WHERE ${SWEEPABLE_INVITE_TOKENS}
        ORDER BY invite_id`,
    );
    return { dryRun: true, swept: rows.map((row) => row.invite_id), deleted: 0 };
  }

  const { rows } = await db.query<{ invite_id: string }>(
    `DELETE FROM invite_tokens
      WHERE ${SWEEPABLE_INVITE_TOKENS}
      RETURNING invite_id`,
  );
  const swept = rows.map((row) => row.invite_id).sort();
  return { dryRun: false, swept, deleted: swept.length };
}

export function formatInviteTokenSweepReport(report: InviteTokenSweepReport): string {
  const verb = report.dryRun ? 'would sweep' : 'swept';
  const head = `sweep-invite-tokens${report.dryRun ? ' (dry run)' : ''}: ${verb} ${report.swept.length} dead credential row(s)`;
  if (report.swept.length === 0) {
    return head;
  }
  return [head, ...report.swept.map((inviteId) => `  ${inviteId}`)].join('\n');
}

/**
 * One sweep, from a shell. Scheduling is somebody else's surface; this only has
 * to be safe to run at any moment and safe to run twice.
 *
 * `createPool` rather than a bare `new Pool`, as `src/db.ts` requires of every
 * pool in app and tests: it installs the global int8 parser and sends
 * `timezone=Asia/Kolkata`, so a scheduled run compares `expires_at` against the
 * same clock the product shows. `sweep-notifications.ts` beside this one
 * resolves its handle the same way.
 *
 * `--dry-run` is a plain `includes` check and not a parsed flag VALUE. The one
 * general parser in this repo (`cli-seed-convenience-corner.ts`'s `argValue`)
 * consumes a FOLLOWING FLAG as a value, and nothing here needs a value, so
 * there is no reason to reach for the shape that carries that bug.
 */
async function main(): Promise<void> {
  const databaseUrl = process.env['DATABASE_URL'];
  if (!databaseUrl) {
    console.error('DATABASE_URL is required');
    process.exit(2);
  }
  const dryRun = process.argv.includes('--dry-run');
  const pool = createPool(databaseUrl);
  try {
    console.log(formatInviteTokenSweepReport(await sweepInviteTokens(pool, { dryRun })));
  } finally {
    await pool.end();
  }
}

const executedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (executedDirectly) {
  main().catch((error: unknown) => {
    console.error('sweep-invite-tokens failed', error);
    process.exit(1);
  });
}
