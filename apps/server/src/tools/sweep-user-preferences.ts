import { pathToFileURL } from 'node:url';
import { membershipId } from '@gisik-nokma/domain';
import { createPool } from '../db.js';
import type { Queryable } from '../db/queryable.js';
import { resolveEffectiveRole } from '../permissions/effective-role.js';

/**
 * How long a person's view preferences outlive their membership.
 *
 * ## The mechanism is not optional; the DURATION is a product decision
 *
 * `user_preferences` has no foreign keys — matching every projection table here,
 * because a workspace is a ledger fact rather than a row this schema can point
 * at — and preferences are not events, so the purge tombstones
 * `visibleEventsFor` emits on membership loss do not reach the table. The
 * migration says the consequence out loud rather than hiding it: "a row survives
 * the revocation of the membership that made it reachable, unreachable behind
 * the door's 404 and collected by nothing." Coordination finding 6c is the same
 * sentence with an owner attached: harmless for storage at this scale and NOT
 * harmless as a statement, because it is per-user data outliving the
 * relationship that justified it.
 *
 * Something has to decide when it stops being kept, and the two cases could not
 * be told apart from here — an owner who wants a re-admitted colleague's columns
 * waiting for them, and an owner who wants a departed person's data gone the
 * moment they leave. Keeping it forever is the branch that cannot be undone by
 * anybody's later decision, so a bound ships.
 *
 * **Thirty days is a default under uncertainty, not a decision the series has
 * taken.** It is one constant, in one place, so changing it is one line — and it
 * is deliberately not a parameter of the sweep, because a window the caller
 * passes is a window no test ever exercises at its real value. *Owner: the
 * product owner, to confirm or replace.*
 */
export const REVOKED_MEMBER_PREFERENCE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export type PreferenceRowRef = { userId: string; workspaceId: string };

export type UserPreferencesSweepReport = {
  dryRun: boolean;
  /** Every `(user, workspace)` pair holding a preferences row. */
  examined: number;
  /** Pairs whose user IS currently a member here. Never candidates at all. */
  currentMembers: number;
  /** Non-members whose revocation is recent enough that the row is still kept. */
  withinWindow: PreferenceRowRef[];
  /**
   * Non-members with NO `membership.revoked` anywhere in the ledger. RETAINED,
   * and named rather than silently skipped — see the docblock below.
   */
  noRevocationEvidence: PreferenceRowRef[];
  /** Non-members past the window: deleted on a live run. */
  swept: PreferenceRowRef[];
  /**
   * Rows actually removed: 0 on a dry run, and `swept.length` on a live run
   * EXCEPT when the DELETE's own membership guard refused one — see step 4
   * below. `deleted < swept.length` is the visible trace of a re-grant that
   * committed mid-sweep, and it is a report an operator can act on rather than
   * a discrepancy this function hides by counting its own intentions.
   */
  deleted: number;
};

/**
 * Collect the preferences of people who are no longer members and whose
 * departure is older than the retention window.
 *
 * ## `now` is a parameter, and that is what makes the window testable
 *
 * Nothing in here reads a clock. The window is the entire behaviour, and a
 * function that computed `Date.now()` internally could only be tested by
 * sleeping through thirty days or by rewriting the constant for the test — the
 * first is impossible and the second tests a different constant than the one
 * that ships. With `now` injected, ONE fixture is driven at two instants and the
 * two answers are the test. Only `main()` below reads a real clock.
 *
 * ## Step 1: current membership comes from `resolveEffectiveRole`, always
 *
 * Ruling P22, and it is binding rather than stylistic. `membership.revoked`
 * DELETES the workspace-scope `proj_memberships` row and leaves every
 * project-scope roster row standing — `proj-memberships.ts` explains why it must
 * — so a bare `SELECT ... FROM proj_memberships` reports a person who was put
 * out of the workspace as still being in it. That is the live
 * authorisation-shaped bug class this codebase has already caught once (case
 * 6.137), and here it would fail in the expensive direction: a surviving roster
 * row would make a departed person look current and their data would be kept
 * forever, which is the exact finding this tool exists to close.
 *
 * `workspaceRole === null` is the candidate set. It is a per-candidate call and
 * not a join, deliberately: `EffectiveRole` is branded so that
 * `resolveEffectiveRole` is the only thing that can produce one, and a join that
 * reproduced its rules in SQL would be a second answer to one question, free to
 * drift from the first.
 *
 * ## Step 2: the window's start comes from the LEDGER, because no column holds it
 *
 * There is no revocation timestamp to read. The projection row is GONE — that
 * is what revocation means here — so the only record of when it happened is the
 * `membership.revoked` event itself, and `events.server_time` is the received
 * instant the ledger assigned it.
 *
 * `max(server_time)` picks the LATEST revocation, and the re-grant case needs no
 * special handling in this query BY DESIGN: somebody revoked, re-admitted and
 * revoked again is measured from the second departure, and somebody revoked and
 * still a member today never reaches this query at all, because step 1 already
 * excluded them. Do not "fix" this into looking at grants — the membership
 * question is answered above, by the only function allowed to answer it.
 *
 * ## Step 3: no evidence is a REFUSAL to delete, and it is reported
 *
 * A non-member with no `membership.revoked` in the ledger has no window start,
 * so there is no window to be past. Deleting on a guess is unrecoverable and
 * keeping the row costs a few hundred bytes, so the sweep fails closed — the
 * same discipline `invite_tokens.expires_at` gets by being NOT NULL, where a
 * nullable column would have made every expiry check pass without ever
 * executing.
 *
 * These rows are RETURNED rather than skipped in silence. A retention tool whose
 * refusals leave no trace is one an operator cannot audit: the count would
 * simply never fall, and nothing would say why.
 *
 * ## Step 4: the DELETE re-states the membership condition, because the decision
 * is three round-trips old by the time it acts
 *
 * Steps 1–3 are separate awaited statements with no enclosing transaction, so a
 * `membership.granted` can commit between the membership check and the
 * deletion. A `DELETE ... WHERE user_id = $1 AND workspace_id = $2` restates
 * only the primary key: it would delegate the whole eligibility decision to a
 * TypeScript variable read before that grant existed, and destroy a
 * now-current member's row. The loss is unrecoverable —
 * `user_preferences` is AUTHORED, "NOT a projection: nothing derives it from
 * the ledger and nothing rebuilds it" (`migrations/1788295700000_user-preferences.sql`).
 * The sibling sweep in this same round names the principle and this statement
 * now obeys it: one statement decides and acts on the same committed snapshot.
 *
 * The `NOT EXISTS` is NOT a second answer to the membership question and does
 * not weaken ruling P22. `resolveEffectiveRole` above is still the only thing
 * that decides WHO is a candidate; this is a guard on the write, and it carries
 * `scope_kind = 'workspace'` for exactly the reason step 1 exists — an
 * unfiltered `proj_memberships` read here would fail in the same expensive
 * direction, letting a surviving project-scope roster row veto the deletion and
 * keep a departed person's data forever. Widening it to every scope is the
 * 6.137 shape again, and the retained-roster-row fixture reddens if anyone does.
 *
 * When the guard fires the row stays and `deleted` does not count it, while
 * `swept` still names it: the two numbers disagree, and that disagreement is
 * the honest report of a race rather than a claim the row went.
 */
export async function sweepUserPreferences(
  db: Queryable,
  options: { now: Date; dryRun: boolean },
): Promise<UserPreferencesSweepReport> {
  const { rows: candidates } = await db.query<{ user_id: string; workspace_id: string }>(
    `SELECT DISTINCT user_id, workspace_id FROM user_preferences
      ORDER BY workspace_id, user_id`,
  );

  const report: UserPreferencesSweepReport = {
    dryRun: options.dryRun,
    examined: candidates.length,
    currentMembers: 0,
    withinWindow: [],
    noRevocationEvidence: [],
    swept: [],
    deleted: 0,
  };

  for (const candidate of candidates) {
    const ref: PreferenceRowRef = {
      userId: candidate.user_id,
      workspaceId: candidate.workspace_id,
    };

    // Step 1. P22: this, and never a direct read of proj_memberships.
    const effective = await resolveEffectiveRole(db, ref.userId, ref.workspaceId);
    if (effective.workspaceRole !== null) {
      report.currentMembers += 1;
      continue;
    }

    // Step 2. The window's start, from the ledger, because nothing else holds it.
    const { rows: revocations } = await db.query<{ revoked_at: Date | null }>(
      `SELECT max(server_time) AS revoked_at FROM events
        WHERE entity_kind = 'membership' AND entity_id = $1 AND type = 'membership.revoked'`,
      [membershipId(ref.workspaceId, ref.userId)],
    );
    const revokedAt = revocations[0]?.revoked_at ?? null;
    if (revokedAt === null) {
      // Step 3. Fail closed, and leave a trace.
      report.noRevocationEvidence.push(ref);
      continue;
    }

    if (options.now.getTime() - revokedAt.getTime() < REVOKED_MEMBER_PREFERENCE_RETENTION_MS) {
      report.withinWindow.push(ref);
      continue;
    }

    report.swept.push(ref);
    if (!options.dryRun) {
      // Step 4. The membership condition again, in the statement that acts.
      const deleted = await db.query(
        `DELETE FROM user_preferences
          WHERE user_id = $1 AND workspace_id = $2
            AND NOT EXISTS (
                  SELECT 1 FROM proj_memberships
                   WHERE workspace_id = $2 AND user_id = $1
                     AND scope_kind = 'workspace'
                )`,
        [ref.userId, ref.workspaceId],
      );
      report.deleted += deleted.rowCount ?? 0;
    }
  }

  return report;
}

export function formatUserPreferencesSweepReport(report: UserPreferencesSweepReport): string {
  const verb = report.dryRun ? 'would sweep' : 'swept';
  const lines = [
    `sweep-user-preferences${report.dryRun ? ' (dry run)' : ''}: ` +
      `${report.examined} row(s) examined, ${report.currentMembers} still members, ` +
      `${report.withinWindow.length} inside the retention window, ${verb} ${report.swept.length}`,
  ];
  for (const ref of report.swept) {
    lines.push(`  swept ${ref.userId} in ${ref.workspaceId}`);
  }
  // Named rather than silent: an operator watching a count that never falls
  // needs to be able to see WHICH rows are refusing to be collected and why.
  for (const ref of report.noRevocationEvidence) {
    lines.push(`  RETAINED, no revocation evidence: ${ref.userId} in ${ref.workspaceId}`);
  }
  return lines.join('\n');
}

/**
 * One sweep, from a shell — and the ONLY place in this module that reads a
 * clock. See `sweepUserPreferences` for why that separation is the design and
 * not a convenience.
 *
 * `--dry-run` is a plain `includes` check, not a parsed flag value: the one
 * general parser in this repo (`cli-seed-convenience-corner.ts`'s `argValue`)
 * consumes a following flag as a value, and nothing here needs a value.
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
    const report = await sweepUserPreferences(pool, { now: new Date(), dryRun });
    console.log(formatUserPreferencesSweepReport(report));
  } finally {
    await pool.end();
  }
}

const executedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (executedDirectly) {
  main().catch((error: unknown) => {
    console.error('sweep-user-preferences failed', error);
    process.exit(1);
  });
}
