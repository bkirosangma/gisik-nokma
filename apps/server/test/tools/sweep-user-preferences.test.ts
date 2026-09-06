import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { membershipId, newUlid, type LedgerEvent } from '@gisik-nokma/domain';
import {
  REVOKED_MEMBER_PREFERENCE_RETENTION_MS,
  sweepUserPreferences,
} from '../../src/tools/sweep-user-preferences.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { testEnvelope } from '../helpers/envelope.js';
import { appendTestEvent } from '../helpers/ledger.js';
import { applyAll } from '../helpers/seed.js';

/**
 * The sweep that closes coordination finding 6c — "a revoked member's
 * preferences row survives, unreachable and uncollected".
 *
 * ## Why every membership fact here goes through the ledger AND the projection
 *
 * `seedMember` / `revokeMember` / `applyAll` apply events to PROJECTIONS only;
 * none of them writes a row into `events`. This sweep reads `events` directly
 * for the revocation instant — there is no column anywhere that records it,
 * because `membership.revoked` DELETES the workspace-scope row rather than
 * marking it — so a fixture built with those helpers alone would have
 * `proj_memberships` state and NO ledger row, the "no revocation evidence"
 * branch would fire on every test, and not one assertion below would be about
 * the behaviour it names. That is a check that cannot fail, which is the class
 * case 6.137 was written to catch, so `grantThroughLedger` /
 * `revokeThroughLedger` do BOTH halves and the revoked fixture asserts the
 * ledger row is really there before it asserts anything about the sweep.
 *
 * ## Why `now` is injected
 *
 * The retention window is the whole behaviour, and a sweep that read its own
 * clock could only be tested by sleeping through the window. `now` is a
 * required parameter, so the SAME fixture is driven at two instants — one
 * inside the window and one past it — and the two answers are the test.
 */

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase();
});

afterAll(async () => {
  await db.drop();
});

/**
 * `user_preferences` is authored and derived from nothing, so truncating it
 * between tests loses no relationship. `events` is append-only and refuses
 * TRUNCATE, and `proj_memberships` must stay consistent with it — every test
 * mints fresh workspace and user ULIDs instead.
 */
beforeEach(async () => {
  await db.pool.query('TRUNCATE user_preferences');
});

const SEED_ACTOR = '01J0SEEDADM1N0000000000000';

/** Both halves: the ledger row this sweep reads, and the projection row `resolveEffectiveRole` reads. */
async function record(env: LedgerEvent): Promise<LedgerEvent> {
  await appendTestEvent(db.pool, env);
  await applyAll(db.pool, [env]);
  return env;
}

async function grantThroughLedger(workspaceId: string, userId: string): Promise<LedgerEvent> {
  return record(
    testEnvelope({
      workspaceId,
      entity: { kind: 'membership', id: membershipId(workspaceId, userId) },
      type: 'membership.granted',
      payload: { userId, role: 'member' },
      actorId: SEED_ACTOR,
    }),
  );
}

async function revokeThroughLedger(workspaceId: string, userId: string): Promise<LedgerEvent> {
  return record(
    testEnvelope({
      workspaceId,
      entity: { kind: 'membership', id: membershipId(workspaceId, userId) },
      type: 'membership.revoked',
      payload: { userId },
      actorId: SEED_ACTOR,
    }),
  );
}

/**
 * A PROJECT-scope roster row, filed against the PROJECT entity — the stream
 * `membership.revoked` may not touch, which is precisely why the row survives a
 * revocation. Through `record()` like every other membership fact here, so the
 * ledger and the projection say the same thing.
 *
 * Not `seedMember(..., [{ projectId }])`, which would also re-apply
 * `membership.granted` to the projection WITHOUT appending it to the ledger —
 * the half-written fixture 6.146 exists to forbid.
 */
async function attachToProjectThroughLedger(
  workspaceId: string,
  userId: string,
  projectId: string,
): Promise<LedgerEvent> {
  return record(
    testEnvelope({
      workspaceId,
      entity: { kind: 'project', id: projectId },
      type: 'project.member_added',
      payload: { userId, projectAdmin: false },
      actorId: SEED_ACTOR,
    }),
  );
}

async function seedPreferences(userId: string, workspaceId: string): Promise<void> {
  await db.pool.query(
    `INSERT INTO user_preferences (user_id, workspace_id, doc, updated_at)
     VALUES ($1, $2, $3::jsonb, now())`,
    [userId, workspaceId, JSON.stringify({ savedFilters: [], listColumns: {}, grouping: {} })],
  );
}

async function preferenceRowExists(userId: string, workspaceId: string): Promise<boolean> {
  const { rows } = await db.pool.query(
    'SELECT 1 FROM user_preferences WHERE user_id = $1 AND workspace_id = $2',
    [userId, workspaceId],
  );
  return rows.length === 1;
}

/**
 * THE FIXTURE VERIFICATION the whole file rests on: the revocation is really in
 * `events`, so the sweep's ledger read has something to find. Without this the
 * "no revocation evidence" branch would answer every test and every assertion
 * below would be about a code path nobody meant to exercise.
 */
async function assertRevocationInLedger(workspaceId: string, userId: string): Promise<Date> {
  const { rows } = await db.pool.query<{ server_time: Date }>(
    `SELECT server_time FROM events
      WHERE entity_kind = 'membership' AND entity_id = $1 AND type = 'membership.revoked'`,
    [membershipId(workspaceId, userId)],
  );
  expect(rows).toHaveLength(1);
  const first = rows[0];
  if (first === undefined) {
    throw new Error('unreachable: the length assertion above already established one row');
  }
  return first.server_time;
}

describe('sweepUserPreferences — retention after revocation', () => {
  /**
   * BOTH HALVES OF THE WINDOW, ONE FIXTURE. Retained one second short of the
   * window, deleted the instant it is reached. Driving one fixture at two
   * instants is what makes the window itself the thing under test rather than
   * whichever side of it a second fixture happened to land on.
   */
  it('retains inside the window and deletes once the window is reached', async () => {
    const ws = newUlid();
    const user = newUlid();
    await grantThroughLedger(ws, user);
    await revokeThroughLedger(ws, user);
    await seedPreferences(user, ws);

    const revokedAt = await assertRevocationInLedger(ws, user);

    const justInside = new Date(revokedAt.getTime() + REVOKED_MEMBER_PREFERENCE_RETENTION_MS - 1000);
    const inside = await sweepUserPreferences(db.pool, { now: justInside, dryRun: false });
    expect(inside.swept).toEqual([]);
    expect(inside.withinWindow).toEqual([{ userId: user, workspaceId: ws }]);
    expect(await preferenceRowExists(user, ws)).toBe(true);

    const atTheEdge = new Date(revokedAt.getTime() + REVOKED_MEMBER_PREFERENCE_RETENTION_MS);
    const past = await sweepUserPreferences(db.pool, { now: atTheEdge, dryRun: false });
    expect(past.swept).toEqual([{ userId: user, workspaceId: ws }]);
    expect(past.deleted).toBe(1);
    expect(await preferenceRowExists(user, ws)).toBe(false);
  });

  /**
   * THE EXCLUDING FIXTURE. Somebody put out of a workspace and let back in
   * keeps their arrangement, however old the revocation is — because the
   * candidate set is decided by CURRENT membership through
   * `resolveEffectiveRole`, not by what the ledger once recorded.
   *
   * The revocation here is deliberately WELL PAST the window at the injected
   * `now`. That is the part that makes the mutation meaningful: a sweep that
   * skipped the membership check and trusted `max(server_time)` alone would
   * delete this row, and a fixture whose revocation sat inside the window would
   * survive that mutation for the wrong reason and prove nothing.
   *
   * Driven mutation: removing the `resolveEffectiveRole` early return reddens
   * this test and nothing else in the file.
   */
  it('a member re-granted inside the window keeps their preferences, however old the revocation', async () => {
    const ws = newUlid();
    const user = newUlid();
    await grantThroughLedger(ws, user);
    await revokeThroughLedger(ws, user);
    const revokedAt = await assertRevocationInLedger(ws, user);
    await grantThroughLedger(ws, user);
    await seedPreferences(user, ws);

    // A real role again, read the way ruling P22 requires the sweep to read it.
    const { rows } = await db.pool.query<{ role: string }>(
      `SELECT role FROM proj_memberships
        WHERE workspace_id = $1 AND user_id = $2 AND scope_kind = 'workspace'`,
      [ws, user],
    );
    expect(rows.map((row) => row.role)).toEqual(['member']);

    const longPast = new Date(revokedAt.getTime() + REVOKED_MEMBER_PREFERENCE_RETENTION_MS * 10);
    const report = await sweepUserPreferences(db.pool, { now: longPast, dryRun: false });

    expect(report.swept).toEqual([]);
    expect(report.deleted).toBe(0);
    expect(report.currentMembers).toBe(1);
    expect(await preferenceRowExists(user, ws)).toBe(true);
  });

  /**
   * THE P22 FIXTURE — the one state in which the sanctioned reader and the
   * forbidden one give DIFFERENT answers, and therefore the only state that can
   * test the rule.
   *
   * Every other fixture in this file is built from workspace-scope facts alone,
   * so for all of them a bare `SELECT role FROM proj_memberships WHERE
   * workspace_id = $1 AND user_id = $2` returns exactly what
   * `resolveEffectiveRole` returns: substituting it changes nothing and the
   * file stays green. MEASURED, and the reason this case exists — the P22
   * docblock was compliant code with no fixture behind it, which is a check
   * that cannot fail.
   *
   * Here the person was put on a project before being put out of the workspace.
   * `membership.revoked` deletes the workspace-scope row and may not touch the
   * project-scope one — a different entity's stream — so a roster row STANDS
   * for someone who is not a member, and the unfiltered read calls them
   * current. That is case 6.137's bug in the expensive direction: the sweep
   * would exclude them as a member and their data would be kept forever, which
   * is the finding the tool exists to close.
   *
   * Driven, both mutations, both reddening THIS test and nothing else in the
   * file: (a) replacing `resolveEffectiveRole` with the unfiltered direct read,
   * and (b) dropping `scope_kind = 'workspace'` from the DELETE's own guard,
   * which would let the surviving row veto the deletion at the last step
   * instead of the first.
   */
  it('sweeps a revoked member whose PROJECT-scope roster row is still standing', async () => {
    const ws = newUlid();
    const prj = newUlid();
    const user = newUlid();
    await grantThroughLedger(ws, user);
    await attachToProjectThroughLedger(ws, user, prj);
    await revokeThroughLedger(ws, user);
    await seedPreferences(user, ws);

    // THE PREMISE, printed rather than counted: the row a bare read would find
    // is really standing, and the workspace-scope row really is gone. If this
    // came back empty the assertions below would prove only that a missing row
    // confers nothing — a fixture no mutation of the sweep could disturb.
    const surviving = await db.pool.query(
      `SELECT scope_kind, project_id, role FROM proj_memberships
        WHERE workspace_id = $1 AND user_id = $2
        ORDER BY scope_kind`,
      [ws, user],
    );
    expect(surviving.rows).toEqual([{ scope_kind: 'project', project_id: prj, role: 'member' }]);

    const revokedAt = await assertRevocationInLedger(ws, user);
    const past = new Date(revokedAt.getTime() + REVOKED_MEMBER_PREFERENCE_RETENTION_MS + 1000);
    const report = await sweepUserPreferences(db.pool, { now: past, dryRun: false });

    expect(report.currentMembers).toBe(0);
    expect(report.swept).toEqual([{ userId: user, workspaceId: ws }]);
    expect(report.deleted).toBe(1);
    expect(await preferenceRowExists(user, ws)).toBe(false);
  });

  /**
   * FAIL CLOSED, AND SAY SO. A non-member with no `membership.revoked` anywhere
   * in the ledger has no window start, so there is no window to be past. The
   * row is kept AND named in the report — a row silently skipped with no trace
   * is a retention tool that cannot be audited.
   */
  it('retains a non-member with no revocation evidence, and reports it distinctly', async () => {
    const ws = newUlid();
    const stranger = newUlid();
    await seedPreferences(stranger, ws);

    const { rows } = await db.pool.query(
      `SELECT 1 FROM events
        WHERE entity_kind = 'membership' AND entity_id = $1 AND type = 'membership.revoked'`,
      [membershipId(ws, stranger)],
    );
    expect(rows).toHaveLength(0);

    const report = await sweepUserPreferences(db.pool, {
      now: new Date(Date.now() + REVOKED_MEMBER_PREFERENCE_RETENTION_MS * 100),
      dryRun: false,
    });

    expect(report.swept).toEqual([]);
    expect(report.noRevocationEvidence).toEqual([{ userId: stranger, workspaceId: ws }]);
    expect(await preferenceRowExists(stranger, ws)).toBe(true);
  });

  it('is idempotent — a second run past the window deletes nothing more', async () => {
    const ws = newUlid();
    const gone = newUlid();
    const staying = newUlid();
    await grantThroughLedger(ws, gone);
    await revokeThroughLedger(ws, gone);
    await grantThroughLedger(ws, staying);
    await seedPreferences(gone, ws);
    await seedPreferences(staying, ws);

    const revokedAt = await assertRevocationInLedger(ws, gone);
    const now = new Date(revokedAt.getTime() + REVOKED_MEMBER_PREFERENCE_RETENTION_MS + 1000);

    const first = await sweepUserPreferences(db.pool, { now, dryRun: false });
    expect(first.deleted).toBe(1);
    expect(first.swept).toEqual([{ userId: gone, workspaceId: ws }]);

    const second = await sweepUserPreferences(db.pool, { now, dryRun: false });
    expect(second.deleted).toBe(0);
    expect(second.swept).toEqual([]);

    expect(await preferenceRowExists(gone, ws)).toBe(false);
    expect(await preferenceRowExists(staying, ws)).toBe(true);
  });

  it('a dry run changes nothing, and the row it named is still there', async () => {
    const ws = newUlid();
    const user = newUlid();
    await grantThroughLedger(ws, user);
    await revokeThroughLedger(ws, user);
    await seedPreferences(user, ws);

    const revokedAt = await assertRevocationInLedger(ws, user);
    const now = new Date(revokedAt.getTime() + REVOKED_MEMBER_PREFERENCE_RETENTION_MS + 1000);

    const report = await sweepUserPreferences(db.pool, { now, dryRun: true });

    expect(report.dryRun).toBe(true);
    expect(report.swept).toEqual([{ userId: user, workspaceId: ws }]);
    expect(report.deleted).toBe(0);
    expect(await preferenceRowExists(user, ws)).toBe(true);
  });
});
